#!/usr/bin/env node
/**
 * 离线段重建 `api-plans.json`（v1）—— **不联网、不读墙上时钟**。
 *
 * 用法：
 *   node scripts/tools/rebuild-api-plans.js --dry-run   # 只报告会改什么（含将追加的变化事件）
 *   node scripts/tools/rebuild-api-plans.js             # 写盘（并推进变化日志）
 *
 * 选项：
 *   --allow-empty            允许把 API 计费表重建成 0 条（默认拒绝）
 *   --allow-mass-removal     允许一次运行批量下架（默认熔断）
 *
 * ## 与 `rebuild-plans.js` 的关系
 *
 * 同一个骨架、同一套安全规则（R1–R6 见 `lib/api-plan-history.js` 文件头），但**两份数据**：
 * Coding Plan 的 `plans.json` 与 API 计费的 `api-plans.json` 互不注入、各自可重建。
 * 这里刻意不把两者合并成一个命令：一次运行只动一份数据，出问题时边界清楚。
 *
 * ## 为什么"重建"而不是手写
 *
 * `api-plans.json` 是派生产物：它 = 归一(`scripts/data/curated_api_plans.json`)。
 * `id` 与 `derivedMetrics` 由 `lib/api-plan-schema.js` 算出来 —— 派生字段若能手写，
 * 就会有人手算一个"混合单价"写进去，而那需要工作负载假设（题面 §八）。
 */

'use strict';

const fs = require('fs');
const path = require('path');

const apiPlans = require('../lib/api-plan-schema');
const apiHistory = require('../lib/api-plan-history');
const providers = require('../lib/providers');

const ROOT = path.join(__dirname, '..', '..');
const API_PLANS = path.join(ROOT, 'api-plans.json');

function flag(name) {
  return process.argv.includes(`--${name}`);
}

/** 逐字段差异（含嵌套键序），告诉人"到底改了什么"而不是只说"有变化" */
function diffPlans(before, after) {
  const diffs = [];
  const byId = new Map((before || []).map(plan => [plan.id, plan]));
  const identities = new Map((before || []).map(plan => [apiPlans.apiIdentityKeyOf(plan), plan]));

  for (const plan of after) {
    const old = byId.get(plan.id) || identities.get(apiPlans.apiIdentityKeyOf(plan));
    if (!old) {
      diffs.push({ label: `${plan.provider} / ${plan.planName}`, field: '(新增记录)', from: null, to: plan.id });
      continue;
    }
    for (const key of new Set([...Object.keys(old), ...Object.keys(plan)])) {
      const a = JSON.stringify(old[key] === undefined ? null : old[key]);
      const b = JSON.stringify(plan[key] === undefined ? null : plan[key]);
      if (a !== b) diffs.push({ label: `${plan.provider} / ${plan.planName}`, field: key, from: a, to: b });
    }
  }
  const afterIds = new Set(after.map(plan => plan.id));
  for (const old of before || []) {
    if (!afterIds.has(old.id) && !after.some(plan => apiPlans.apiIdentityKeyOf(plan) === apiPlans.apiIdentityKeyOf(old))) {
      diffs.push({ label: `${old.provider} / ${old.planName}`, field: '(删除记录)', from: old.id, to: null });
    }
  }
  return diffs;
}

function readDiskPlans() {
  if (!fs.existsSync(API_PLANS)) return null;
  return JSON.parse(fs.readFileSync(API_PLANS, 'utf8'));
}

function main() {
  const dryRun = flag('dry-run');
  const allowEmpty = flag('allow-empty');
  const allowMassRemoval = flag('allow-mass-removal');

  const providerLoad = providers.load();
  const providerTable = providerLoad.table;
  const curated = apiPlans.loadCuratedApiPlans({ providerTable });

  console.log('离线重建 api-plans.json（不联网、不读墙上时钟）');
  console.log(`  人工来源层：${path.relative(ROOT, apiPlans.CURATED_API_PLANS_FILE)} → ${curated.plans.length} 条可用记录`);
  console.log(`  updatedAt 取自全部 lastSeen 的最大值 → ${curated.payload ? curated.payload.updatedAt : '(无)'}`);

  const hardProblems = [
    ...curated.problems.map(item => `#${item.index === null ? '-' : item.index} ${item.planName || ''} ${item.reason}`.trim()),
    ...curated.evidenceDropped.map(item => `#${item.index} ${item.planName} 引文被丢弃：${item.reason}`)
  ];

  if (hardProblems.length) {
    console.error(`\n❌ 人工来源层有 ${hardProblems.length} 处问题，拒绝写盘：`);
    hardProblems.slice(0, 40).forEach(problem => console.error(`  - ${problem}`));
    if (hardProblems.length > 40) console.error(`  ...（其余 ${hardProblems.length - 40} 处省略）`);
    return 1;
  }

  apiPlans.assertValidStore(curated.payload, { providerTable });
  console.log('  ✓ 数据集级校验通过（id 唯一 · 身份唯一 · updatedAt · 规范排序 · provider 表）');

  // 免费额度的**性质**分布（P1-11 / `F-r2-api-005`）：一次重建就能看出「长期能力」与
  // 「新用户 / 限时赠送」各有多少条。0 与 N 在这一行必须长得不一样 ——
  // 「本轮没有赠送类免费额度」与「这一层没跑」不能混成同一句话。
  // 性质是**必填**字段（`lib/api-plan-schema.js` 的 FREE_TIER_STABILITY），缺了就校验不过，
  // 所以这里不需要兜底默认值：数不出来只会是因为数据本身已经红了。
  const stabilityCounts = { standing: 0, new_user: 0, promotional: 0 };
  let freeTierRecords = 0;
  for (const plan of curated.payload.plans) {
    if (!plan.freeTier || plan.freeTier.type === 'none') continue;
    freeTierRecords++;
    if (stabilityCounts[plan.freeTier.stability] !== undefined) stabilityCounts[plan.freeTier.stability]++;
  }
  console.log(`  · 免费额度性质：带 freeTier ${freeTierRecords} 条 —— 长期提供 ${stabilityCounts.standing} · `
    + `新用户赠送 ${stabilityCounts.new_user} · 限时赠送 ${stabilityCounts.promotional}`
    + '（后两类**不是**长期能力，页面上逐条标注）');

  const diskDoc = readDiskPlans();
  const diskText = diskDoc ? fs.readFileSync(API_PLANS, 'utf8') : null;
  const nextText = `${JSON.stringify(curated.payload, null, 2)}\n`;
  const previous = diskDoc && Array.isArray(diskDoc.plans) ? diskDoc.plans : [];

  if (!curated.payload.plans.length && previous.length && !allowEmpty) {
    console.error(`\n❌ 本次重建会得到 0 条记录（盘上还有 ${previous.length} 条），拒绝写盘。`);
    console.error('   确实要清空请显式传 --allow-empty（防止把来源层误清空后静默发布一个空表）。');
    return 1;
  }

  // ---- 变化日志：读 → 算 → （写盘时才落库）--------------------------------
  const loaded = apiHistory.load();
  if (loaded.missing) {
    console.error(`\n❌ 缺少 ${path.relative(ROOT, apiHistory.API_PLAN_HISTORY_FILE)}：API 计费变化层还没有基线。`);
    console.error('   首次启用请跑一次 `npm run baseline:api-plan-history`（一次性，会拒绝重跑）。');
    return 1;
  }
  if (loaded.broken) {
    console.error(`\n❌ ${path.relative(ROOT, apiHistory.API_PLAN_HISTORY_FILE)} 解析失败（${loaded.broken}），拒绝写盘。`);
    return 1;
  }

  const at = String(curated.payload.updatedAt || '').slice(0, 10);
  const labels = new Map();
  for (const plan of [...previous, ...curated.payload.plans]) {
    if (plan && plan.id && plan.planName) labels.set(plan.id, { title: `${plan.provider} · ${plan.planName}`, vendor: plan.provider });
  }

  const recorded = apiHistory.record(loaded.store, {
    previous,
    next: curated.payload.plans,
    at,
    runAt: new Date().toISOString(),
    labels,
    allowMassRemoval
  });

  if (recorded.problems.length) {
    console.error(`\n❌ 变化日志拒绝推进（${recorded.problems.length} 处），因此也不写 api-plans.json：`);
    recorded.problems.slice(0, 20).forEach(problem => console.error(`  - ${problem}`));
    console.error('   修好之后重跑本命令（日志与数据必须同批更新，否则 check:api-plan-history 会红）。');
    return 1;
  }

  const nextHistoryText = `${JSON.stringify(recorded.store, null, 2)}\n`;
  const historyChanged = nextHistoryText !== fs.readFileSync(apiHistory.API_PLAN_HISTORY_FILE, 'utf8');
  const dataChanged = diskText !== nextText;

  if (diskText === null) {
    console.log('  · 盘上还没有 api-plans.json');
  } else if (!dataChanged) {
    console.log('  ✓ 重建结果与盘上的 api-plans.json 逐字节一致 —— 数据不需要写盘');
  } else {
    const diffs = diffPlans(previous, curated.payload.plans);
    console.log(`  · 重放后有 ${diffs.length} 处差异：`);
    diffs.slice(0, 20).forEach(diff => {
      console.log(`    · ${diff.label} / ${diff.field}`);
      console.log(`        旧：${String(diff.from).slice(0, 120)}`);
      console.log(`        新：${String(diff.to).slice(0, 120)}`);
    });
    if (diffs.length > 20) console.log(`    … 另有 ${diffs.length - 20} 处`);
  }

  const stats = recorded.stats;
  console.log(`  · 变化日志（${path.relative(ROOT, apiHistory.API_PLAN_HISTORY_FILE)}）：本次追加 ${stats.appended} 条事件` +
    `${stats.byType && stats.appended ? `（${apiHistory.API_PLAN_EVENT_TYPES.filter(t => stats.byType[t]).map(t => `${t} ${stats.byType[t]}`).join(' · ')}）` : ''}`);
  recorded.appended.slice(0, 20).forEach(event => {
    const label = event.type === 'ended' ? `（${apiHistory.API_PLAN_HISTORY_WORDING.API_PLAN_HISTORY_END_REASONS[event.reason] || event.reason}）` : '';
    console.log(`      ${event.at} ${event.planId} ${event.type} ${event.field || ''} ` +
      `${apiHistory.API_PLAN_HISTORY_WORDING.API_PLAN_HISTORY_TYPES[event.type] || ''}${label}`);
  });
  if (recorded.appended.length > 20) console.log(`      … 另有 ${recorded.appended.length - 20} 条`);

  if (recorded.renameCandidates && recorded.renameCandidates.length) {
    console.warn(`  ⚠️  疑似模型改名 ${recorded.renameCandidates.length} 处（同一 provider 同时新增/移除、且单价有完全相同的项）：`);
    recorded.renameCandidates.slice(0, 10).forEach(item => {
      console.warn(`      ${item.planId}：-${item.removed} +${item.added}（相同项 ${item.sameRates.join(' / ')}）`);
    });
    console.warn('      这是**检测**不是自动合并：确认是改名就把旧名写进 models[].aliases 并保持 modelKey 不变。');
    console.warn('      明细：node scripts/tools/api-model-rename-report.js');
  }

  if (recorded.missing.length) {
    console.log(`  · 本次未见 ${recorded.missing.length} 条记录：`);
    recorded.missing.forEach(item => {
      console.log(`      ${item.planId} ${item.title} —— 未见 ${item.misses} 次，首次 ${item.since}` +
        (item.blocked ? '（⚠️ 已被批量熔断挡住，未推进计数）' : `，连续 ${apiHistory.API_PLAN_MISS_CONFIRM_RUNS} 次即记为「不再收录」`));
    });
  }
  if (stats.massMissing) {
    console.warn(`  ⚠️  批量消失熔断：本次缺席 ${recorded.missing.length} / 已知 ${stats.knownTotal} 条，不推进计数、不产生 ended。`);
    console.warn('     确属真实批量下架时，请核对来源层后显式重跑：node scripts/tools/rebuild-api-plans.js --allow-mass-removal');
  }

  if (dryRun) {
    console.log('\n--dry-run：没有写盘（数据与变化日志都没动）。');
    return 0;
  }

  if (dataChanged) {
    apiPlans.writeApiPlans(curated.payload, API_PLANS);
    console.log(`\n✅ 已写出 api-plans.json：${curated.payload.count} 条，updatedAt=${curated.payload.updatedAt}`);
  }
  if (historyChanged) {
    apiHistory.save(recorded.store);
    console.log(`✅ 已写出 ${path.relative(ROOT, apiHistory.API_PLAN_HISTORY_FILE)}：${stats.appended} 条新事件，累计 ${recorded.store.events.length} 条`);
  }
  if (!dataChanged && !historyChanged) console.log('\n无需写盘：数据与变化日志都与盘上一致。');
  console.log('下一步：node scripts/validate.js --strict && node scripts/tools/check-api-plans-reproducible.js && node scripts/tools/check-api-plan-history.js');
  return 0;
}

process.exit(main());
