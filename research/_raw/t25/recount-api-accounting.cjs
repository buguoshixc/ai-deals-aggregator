#!/usr/bin/env node
/**
 * t25 独立复算：**API 侧计价条目记账**（第二条路径）。
 *
 * ## 为什么另写一条路
 *
 * 报告的三个数（已映射认领 A / 已处置声明 B / 未判 C）与总数 N 必须闭合，而这条闭合关系
 * 正是"报告有没有在自说自话"的判据。如果复算脚本 require `scripts/lib/model-registry.js`
 * 的 `coverageOf()`，那它复的是**同一支代码**——错的会一起错，等于没查。
 * 所以本脚本：
 *   · 只读**原始 JSON**（api-plans.json / model-registry-links.json / model-registry-gaps.json）；
 *   · 自己实现"一条 claim 展开成哪些 (planId, modelKey, variant) 条目"（通配 = 该 modelKey 的
 *     全部真实变体）；不通配 = 那一个变体）；
 *   · 自己算 N / A / B / C，并与**报告自己的两条出口**逐项比对：
 *       ‣ 文本里那条方程行（`API 侧记账：计价条目 N 条 = 已映射认领 A + 已处置声明 B + 未判 C`）
 *         与三个读数行；
 *       ‣ `--json` 里的 `api.modelPricingItems` / `registry.mappedApiEntries` /
 *         `registry.declaredApiEntries` / `registry.declaredApiEntryRows.length` /
 *         `registry.declaredApiEntries` 与 `gaps.declaredApiEntryCount` / `gaps.unmappedModelCount`。
 * 任何一项对不上就非 0 退出（并逐条打印差在哪）。
 *
 * 用法：node research/_raw/t25/recount-api-accounting.cjs [--require-json]
 *   `--require-json`：JSON 不可得（报告因上游数据在飞而自检失败）时也当作失败。
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..', '..');
const REPORT = path.join(ROOT, 'scripts', 'tools', 'coverage-report.js');
const REQUIRE_JSON = process.argv.includes('--require-json');

const failures = [];
function check(name, ok, detail) {
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok || !detail ? '' : ` —— ${detail}`}`);
  if (!ok) failures.push(name);
}

/* ------------------------------------------------------------------ */
/* ① 独立读原始数据（不 require 任何 lib）                              */
/* ------------------------------------------------------------------ */

const apiPlans = JSON.parse(fs.readFileSync(path.join(ROOT, 'api-plans.json'), 'utf8')).plans;
const linksDoc = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/data/model-registry-links.json'), 'utf8'));
const gapsDoc = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/data/model-registry-gaps.json'), 'utf8'));
const links = Array.isArray(linksDoc) ? linksDoc : linksDoc.links;
const declarations = Array.isArray(gapsDoc) ? gapsDoc : gapsDoc.declarations;

const isWildcard = value => value === null || value === undefined || value === '';
const keyOf = (planId, modelKey, variant) => `${planId}\u0000${modelKey}\u0000${isWildcard(variant) ? '(all)' : variant}`;

/** 全部计价条目（分母 N） */
const entries = [];
for (const plan of apiPlans) {
  for (const model of (plan.models || [])) {
    entries.push({
      key: keyOf(plan.id, model.modelKey, model.variant),
      planId: plan.id,
      provider: plan.provider,
      modelKey: model.modelKey,
      variant: model.variant
    });
  }
}
const entryKeys = new Set(entries.map(entry => entry.key));

/**
 * 一条 claim 在盘上真实覆盖的 identity 集合。
 * 通配（variant 为空）= 该记录里这个 modelKey 的**全部真实变体**；否则就是它写的那一个。
 * 不存在的记录 / 不存在的 modelKey ⇒ 返回空集合 + 原因（"没认领到任何东西"要能被看见）。
 */
function expandClaim(claim) {
  const plan = apiPlans.find(item => item && item.id === claim.apiPlanId);
  if (!plan) return { keys: [], reason: 'apiPlanId 不存在' };
  const matched = (plan.models || []).filter(item => item && String(item.modelKey) === String(claim.modelKey));
  if (!matched.length) return { keys: [], reason: 'modelKey 在该记录里不存在' };
  if (isWildcard(claim.variant)) {
    const keys = [];
    const seen = new Set();
    for (const item of matched) {
      const key = keyOf(plan.id, item.modelKey, item.variant);
      if (seen.has(key)) continue;
      seen.add(key);
      keys.push(key);
    }
    return { keys, reason: null, expanded: true };
  }
  return { keys: [keyOf(plan.id, claim.modelKey, claim.variant)], reason: null };
}

const mappedKeys = new Set();
const declaredKeys = new Set();
const claimProblems = [];
for (const link of (Array.isArray(links) ? links : [])) {
  if (!link || link.apiPlanId === undefined || link.modelKey === undefined) continue;
  const { keys, reason } = expandClaim(link);
  if (reason) claimProblems.push(`link(apiPlanId=${link.apiPlanId}, modelKey=${link.modelKey}) 什么都没认领：${reason}`);
  keys.forEach(key => mappedKeys.add(key));
}
const apiDeclarations = [];
for (const declaration of (Array.isArray(declarations) ? declarations : [])) {
  if (!declaration || declaration.apiPlanId === undefined || declaration.modelKey === undefined) continue;
  apiDeclarations.push(declaration);
  const { keys, reason } = expandClaim(declaration);
  if (reason) claimProblems.push(`声明(apiPlanId=${declaration.apiPlanId}, modelKey=${declaration.modelKey}) 什么都没覆盖：${reason}`);
  keys.forEach(key => declaredKeys.add(key));
}

// 只把**真实存在的条目**算进 A / B（否则"认领到空气"会让数字虚高）
const mappedReal = [...mappedKeys].filter(key => entryKeys.has(key));
const declaredReal = [...declaredKeys].filter(key => entryKeys.has(key));
const unmapped = entries.filter(entry => !mappedKeys.has(entry.key) && !declaredKeys.has(entry.key));
const overlap = mappedReal.filter(key => declaredKeys.has(key));

const numbers = {
  totalEntries: entries.length,
  mappedApiEntries: mappedReal.length,
  declaredApiIdentities: declaredReal.length,
  declaredApiRows: apiDeclarations.length,
  unmappedModelKeys: unmapped.length,
  mappedPhantom: mappedKeys.size - mappedReal.length,
  declaredPhantom: declaredKeys.size - declaredReal.length,
  overlap: overlap.length
};

console.log('① 独立复算（只读原始 JSON，自己展开 claim）');
console.log(`   计价条目总数 N           = ${numbers.totalEntries}`);
console.log(`   已映射认领 A             = ${numbers.mappedApiEntries}`);
console.log(`   已处置声明 B（展开条目）  = ${numbers.declaredApiIdentities}`);
console.log(`   已处置声明（声明条数）     = ${numbers.declaredApiRows}`);
console.log(`   未判 C                   = ${numbers.unmappedModelKeys}`);
console.log(`   闭合：A + B + C           = ${numbers.mappedApiEntries + numbers.declaredApiIdentities + numbers.unmappedModelKeys}`);
check('独立复算自洽：A + B + C === N',
  numbers.mappedApiEntries + numbers.declaredApiIdentities + numbers.unmappedModelKeys === numbers.totalEntries);
check('独立复算：映射与处置互不重叠（同一条目不许既映射又声明）', numbers.overlap === 0, `${numbers.overlap} 条重叠`);
check('独立复算：没有"认领到空气"的映射/声明（认领的 identity 必须真实存在于 api-plans）',
  numbers.mappedPhantom === 0 && numbers.declaredPhantom === 0,
  `映射幻影 ${numbers.mappedPhantom} / 声明幻影 ${numbers.declaredPhantom}`);
check('独立复算：每条 claim 都必须在盘上认领到东西', claimProblems.length === 0, claimProblems.slice(0, 2).join('；'));

/* ------------------------------------------------------------------ */
/* ② 报告的两条出口                                                     */
/* ------------------------------------------------------------------ */

function runReport(args) {
  const result = spawnSync(process.execPath, [REPORT, ...args], { cwd: ROOT, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
  return { status: result.status, stdout: result.stdout || '', stderr: result.stderr || '' };
}

const run = runReport(['--json']);

console.log(`\n② 报告现场（exit ${run.status}）`);
const equation = run.stdout.match(/API 侧记账：计价条目 (\d+) 条 = 已映射认领 (\d+) \+ 已处置声明 (\d+) \+ 未判 (\d+)/);
check('报告文本里能找到那条方程行', Boolean(equation), '没找到 `API 侧记账：计价条目 N 条 = 已映射认领 A + 已处置声明 B + 未判 C`');
if (equation) {
  const text = {
    totalEntries: Number(equation[1]),
    mappedApiEntries: Number(equation[2]),
    declaredApiIdentities: Number(equation[3]),
    unmappedModelKeys: Number(equation[4])
  };
  console.log(`   文本方程：N=${text.totalEntries} A=${text.mappedApiEntries} B=${text.declaredApiIdentities} C=${text.unmappedModelKeys}`);
  check('文本：计价条目总数 N 与独立复算一致', text.totalEntries === numbers.totalEntries, `报告 ${text.totalEntries} vs 独立 ${numbers.totalEntries}`);
  check('文本：已映射认领 A 与独立复算一致', text.mappedApiEntries === numbers.mappedApiEntries, `报告 ${text.mappedApiEntries} vs 独立 ${numbers.mappedApiEntries}`);
  check('文本：已处置声明 B 与独立复算一致', text.declaredApiIdentities === numbers.declaredApiIdentities, `报告 ${text.declaredApiIdentities} vs 独立 ${numbers.declaredApiIdentities}`);
  check('文本：未判 C 与独立复算一致', text.unmappedModelKeys === numbers.unmappedModelKeys, `报告 ${text.unmappedModelKeys} vs 独立 ${numbers.unmappedModelKeys}`);
  check('文本：三个读数行与方程行口径一致（已映射 / 已处置 / 未判 三行都在）',
    new RegExp(`已映射认领 API 计价条目\\s+${text.mappedApiEntries}\\b`).test(run.stdout)
    && new RegExp(`已处置声明的 API 计价条目\\s+${text.declaredApiIdentities}\\b`).test(run.stdout)
    && new RegExp(`未判 API 计价条目\\s+${text.unmappedModelKeys}\\b`).test(run.stdout));
  check('文本：缺口 3 的表头与口径行同源（列出 − 映射 − 处置 = 未判 的算式）',
    new RegExp(`计价条目 ${text.totalEntries} 条 − 映射认领 ${text.mappedApiEntries} − 处置声明 ${text.declaredApiIdentities} = 未判 ${text.unmappedModelKeys}`).test(run.stdout));
}

// JSON：报告自检通过时才有（它是 stdout 的最后一段）
let payload = null;
const marker = run.stdout.indexOf('JSON:');
if (marker >= 0) {
  const rest = run.stdout.slice(marker + 5);
  const end = rest.lastIndexOf('\n✅');
  try { payload = JSON.parse(end < 0 ? rest : rest.slice(0, end)); } catch (error) { payload = null; }
}

if (payload) {
  const registry = payload.registry || {};
  const gaps = payload.gaps || {};
  console.log(`   JSON：api.modelPricingItems=${payload.api.modelPricingItems} registry.mappedApiEntries=${registry.mappedApiEntries} registry.declaredApiEntries=${registry.declaredApiEntries} registry.declaredApiEntryRows=${(registry.declaredApiEntryRows || []).length} gaps.declaredApiEntryCount=${gaps.declaredApiEntryCount} gaps.unmappedModelCount=${gaps.unmappedModelCount}`);
  check('JSON：api.modelPricingItems === 独立 N', payload.api.modelPricingItems === numbers.totalEntries);
  check('JSON：registry.mappedApiEntries === 独立 A', registry.mappedApiEntries === numbers.mappedApiEntries);
  check('JSON：registry.declaredApiEntries === 独立 B（展开条目数）', registry.declaredApiEntries === numbers.declaredApiIdentities);
  check('JSON：registry.declaredApiEntryRows.length === 独立声明条数（逐条留档）',
    (registry.declaredApiEntryRows || []).length === numbers.declaredApiRows);
  check('JSON：gaps.declaredApiEntryCount === 独立声明条数', gaps.declaredApiEntryCount === numbers.declaredApiRows);
  check('JSON：gaps.unmappedModelCount === 独立 C', gaps.unmappedModelCount === numbers.unmappedModelKeys);
  check('JSON：三者和闭合（mappedApiEntries + declaredApiEntries + unmappedModelCount === modelPricingItems）',
    registry.mappedApiEntries + registry.declaredApiEntries + gaps.unmappedModelCount === payload.api.modelPricingItems);
} else if (REQUIRE_JSON) {
  check('JSON：报告成功运行并给出 JSON（--require-json）', false,
    `exit ${run.status}；报告自检问题：${run.stderr.split('\n').filter(text => text.trim().startsWith('- ')).slice(0, 2).join('；')}`);
} else {
  console.log('   ⚠ 报告本次自检未通过（上游数据在飞），JSON 段不可得 ⇒ 本轮只比对文本两条出口；');
  console.log('     要连 JSON 一起比对请在上游转绿后加 --require-json 重跑。');
  console.log(`     当前报告问题：${run.stderr.split('\n').filter(text => text.trim().startsWith('- ')).slice(0, 3).join('；')}`);
}

console.log(`\n=== t25 独立复算：${failures.length ? `${failures.length} 项不一致` : '全部一致'} ===`);
if (failures.length) {
  failures.forEach(name => console.log(`  ✗ ${name}`));
  process.exit(1);
}
