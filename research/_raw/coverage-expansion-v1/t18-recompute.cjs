#!/usr/bin/env node
'use strict';
/**
 * t18 · 独立重算（第二条路径，不复用 lib / 报告的代码）并与报告读数逐项对账。
 * 修正说明：attempt 1 的重算脚本猜错了两个字段名（gap 声明是**扁平**的 {apiPlanId,modelKey,variant}，
 * 套餐模型串在 `supportedModels` 而不是 `models`），所以那次读数无效；这里按真实形状重算。
 * 产出：research/_raw/coverage-expansion-v1/t18-recompute.json
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const WT = path.join(__dirname, '..', '..', '..');
const read = rel => JSON.parse(fs.readFileSync(path.join(WT, rel), 'utf8'));

const deals = read('deals.json'), plans = read('plans.json'), api = read('api-plans.json');
const links = read('scripts/data/model-registry-links.json').links;
const gaps = read('scripts/data/model-registry-gaps.json').declarations;
const models = read('models.json'), prov = read('scripts/data/providers.json');

/* ── 独立展开：claim 按 (apiPlanId, modelKey, variant) 记账，通配只算真实展开到的条目 ── */
const entries = [];
for (const p of api.plans) for (const m of p.models || []) entries.push({ planId: p.id, modelKey: m.modelKey, variant: m.variant });

const claims = new Set();
for (const l of links) {
  if (!l.apiPlanId) continue;
  for (const e of entries) {
    if (e.planId !== l.apiPlanId || e.modelKey !== l.modelKey) continue;
    if (l.variant !== null && l.variant !== undefined && l.variant !== e.variant) continue;
    claims.add(l.apiPlanId + '|' + e.modelKey + '|' + e.variant);
  }
}
const dispositions = new Set();
for (const g of gaps) {
  if (!g.apiPlanId) continue;
  dispositions.add(g.apiPlanId + '|' + g.modelKey + '|' + g.variant);
}
const unclaimed = entries.filter(e => !claims.has(e.planId + '|' + e.modelKey + '|' + e.variant)
  && !dispositions.has(e.planId + '|' + e.modelKey + '|' + e.variant));

/* ── Coding 侧：模型串在 supportedModels ── */
const codingStrings = plans.plans.reduce((n, p) => n + (p.supportedModels || []).length, 0);
const codingClaims = new Set(links.filter(l => !l.apiPlanId).map(l => l.planId + '|' + (l.planName || '') + '|' + (l.modelString || l.modelName || '')));
const codingDeclared = gaps.filter(g => !g.apiPlanId).length;

const recomputed = {
  api: {
    pricingItems: entries.length,
    mappedClaims: claims.size,
    dispositions: dispositions.size,
    unclaimed: unclaimed.length,
    unclaimedSample: unclaimed.slice(0, 3),
    providers: new Set(api.plans.map(p => p.provider)).size,
    records: api.plans.length,
  },
  coding: { plans: plans.plans.length, providers: new Set(plans.plans.map(p => p.provider)).size, modelStrings: codingStrings, mappedLinks: links.filter(l => !l.apiPlanId).length, declared: codingDeclared },
  deals: { total: deals.deals.length, deal: deals.deals.filter(d => d.type === 'deal').length, tool: deals.deals.filter(d => d.type !== 'deal').length },
  registry: { publishedModels: models.models.length, links: links.length, apiLinks: links.filter(l => l.apiPlanId).length, codingLinks: links.filter(l => !l.apiPlanId).length, gaps: gaps.length },
  providers: Object.keys(prov).filter(k => !k.startsWith('_')).length,
};

/* ── 报告侧读数（文本 + JSON 两次） ── */
const run = args => spawnSync(process.execPath, [path.join(WT, 'scripts/tools/coverage-report.js'), ...args], { cwd: WT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const t = run([]), j1 = run(['--json']), j2 = run(['--json']);
const text = t.stdout + t.stderr;
const num = re => { const m = text.match(re); return m ? Number(m[1]) : null; };
const reported = {
  exit: t.status,
  dealsProvidersOnlyDealScope: num(/provider 数（仅 type=deal）\s+(\d+)/),
  apiProviders: num(/provider 数\s+(\d+)/),
  equation: (text.match(/API 侧记账：.*/) || [''])[0],
  pricingItems: num(/计价条目 (\d+) 条 = /),
  mapped: num(/已映射认领 (\d+)/),
  declared: num(/已处置声明 (\d+)/),
  unjudged: num(/未判 (\d+)/),
  jsonIdentical: crypto.createHash('sha256').update(j1.stdout).digest('hex') === crypto.createHash('sha256').update(j2.stdout).digest('hex'),
  jsonExit: j1.status,
};

const checks = [
  ['API 计价条目', recomputed.api.pricingItems, reported.pricingItems],
  ['API 已映射认领', recomputed.api.mappedClaims, reported.mapped],
  ['API 已处置声明', recomputed.api.dispositions, reported.declared],
  ['API 未判', recomputed.api.unclaimed, reported.unjudged],
  ['API 记录数', recomputed.api.records, null],
];
const table = checks.map(([k, mine, rep]) => ({ item: k, recomputed: mine, reported: rep, agree: rep === null ? 'n/a' : (mine === rep) }));

const out = { generatedAt: new Date().toISOString(), head: spawnSync('git', ['-C', WT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim(), recomputed, reported, comparison: table, coding: { recomputed: recomputed.coding, note: 'Coding 侧报告读数：模型串 55 = 映射 13 + 已声明 42 + 未判 0' } };
fs.writeFileSync(path.join(WT, 'research/_raw/coverage-expansion-v1/t18-recompute.json'), JSON.stringify(out, null, 2) + '\n', 'utf8');

console.log('报告 exit=' + reported.exit + ' · JSON 两次逐字节一致=' + reported.jsonIdentical);
console.log(JSON.stringify(table, null, 1));
console.log('独立算得：计价条目 ' + recomputed.api.pricingItems + ' / 映射 ' + recomputed.api.mappedClaims + ' / 处置 ' + recomputed.api.dispositions + ' / 未判 ' + recomputed.api.unclaimed);
console.log('独立算得：Coding 模型串 ' + recomputed.coding.modelStrings + ' / 映射 ' + recomputed.coding.mappedLinks + ' / 已声明 ' + recomputed.coding.declared);
