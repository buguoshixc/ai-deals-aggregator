#!/usr/bin/env node
/**
 * T18 §6.1 独立复现 5 条 Tooth Test —— **判据自建**（自造最小夹具，不读作者那条牙的期望字符串）。
 *
 * 用法：node research/quality-closure/verify-work/unit-teeth.cjs
 * 退出码：0 = 全部符合语义；1 = 有不符合项
 *
 * 夹具（自造）：apiPlans = P1{ m×(standard,long_context) } · P2{ n×standard }；registry 表 = alpha/beta/gamma
 * 与生产数据无关 —— 生产侧的两方向变异由 mutation-matrix.cjs 在来源层真跑。
 */
'use strict';

const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const reg = require(path.join(ROOT, 'scripts/lib/model-registry.js'));

let bad = 0;
const rows = [];
function expect(name, cond, detail = '') {
  rows.push({ name, ok: !!cond, detail: String(cond ? '' : detail) });
  if (!cond) bad++;
}

const entry = canonicalName => ({
  canonicalName, developer: null, owner: null, family: 'F', aliases: [], officialUrl: null, status: 'active', note: null
});
const table = { alpha: entry('Alpha'), beta: entry('Beta'), gamma: entry('Gamma') };
const apiPlans = [
  { id: 'P1', provider: 'x', officialUrl: 'https://x.example/', firstSeen: '2026-01-01', lastSeen: '2026-01-02', evidence: [],
    models: [{ modelKey: 'm', variant: 'standard', rates: {} }, { modelKey: 'm', variant: 'long_context', rates: {} }] },
  { id: 'P2', provider: 'y', officialUrl: 'https://y.example/', firstSeen: '2026-01-01', lastSeen: '2026-01-02', evidence: [],
    models: [{ modelKey: 'n', variant: 'standard', rates: {} }] }
];
const plans = [];
const link = (registrySlug, apiPlanId, modelKey, variant) => ({
  registrySlug, apiPlanId, modelKey, variant, basis: 'explicit-mapping', evidence: [], note: 'T18 夹具'
});
const doc = links => ({ schemaVersion: 1, links });
const ctx = { table, apiPlans, plans };
const v = d => reg.validateLinks(d, ctx);
const has = (list, needle) => list.some(x => String(x).includes(needle));

console.log('夹具：P1{m:standard,long_context} · P2{n:standard} · registry{alpha,beta,gamma}\n');

/* ---- Tooth 1：同一条 (planId, modelKey) 下「通配 null」与「显式 standard」是同一条 identity ---- */
console.log('【Tooth 1】通配 null 与显式 standard 撞车（两方向）');
expect('方向 A：已有一条显式 standard（alpha），再追加通配 null 指向 beta → 红',
  has(v(doc([link('alpha', 'P2', 'n', 'standard'), link('beta', 'P2', 'n', null)])), '已经映射到'),
  v(doc([link('alpha', 'P2', 'n', 'standard'), link('beta', 'P2', 'n', null)])).join(' | '));
expect('方向 B：已有一条通配 null（alpha），再追加显式 standard 指向 beta → 红',
  has(v(doc([link('alpha', 'P2', 'n', null), link('beta', 'P2', 'n', 'standard')])), '已经映射到'),
  v(doc([link('alpha', 'P2', 'n', null), link('beta', 'P2', 'n', 'standard')])).join(' | '));
{
  const w = reg.sourcePricingIdentitiesOf(link('alpha', 'P1', 'm', null), apiPlans);
  expect('通配展开 = 记录内该 modelKey 的全部真实变体（顺序无关）',
    w.expanded === true && w.unresolved === false
    && JSON.stringify(w.identities.map(i => i.variant).sort()) === JSON.stringify(['long_context', 'standard']),
    JSON.stringify(w.identities));
}

/* ---- Tooth 2：完全相同的三元组 → 两个 slug 必红；同 slug 完全重复记录 → 红 ---- */
console.log('【Tooth 2】同一 (planId, modelKey, variant) 两个 owner');
expect('方向 A：同一条显式 identity 分属 alpha 与 beta → 红',
  has(v(doc([link('alpha', 'P1', 'm', 'standard'), link('beta', 'P1', 'm', 'standard')])), '已经映射到'),
  v(doc([link('alpha', 'P1', 'm', 'standard'), link('beta', 'P1', 'm', 'standard')])).join(' | '));
expect('方向 B：同一 slug 的完全重复记录 → 红（重复记录判据，不是靠 identity 归属）',
  has(v(doc([link('alpha', 'P1', 'm', null), link('alpha', 'P1', 'm', null)])), '重复记录'),
  v(doc([link('alpha', 'P1', 'm', null), link('alpha', 'P1', 'm', null)])).join(' | '));

/* ---- Tooth 3：同一个 registry 模型认领多个 Provider → 允许（但完整性仍要有结局）---- */
console.log('【Tooth 3】同一 registry 模型跨 Provider');
{
  const d = doc([link('alpha', 'P1', 'm', null), link('alpha', 'P2', 'n', null)]);
  const problems = v(d);
  expect('同一 slug 认领 P1.m（两个变体）+ P2.n → 绿（provider 不同不是错误）', problems.length === 0, problems.join(' | '));
}

/* ---- Tooth 4：认领集合不相交 → 正确保留；相交 → 红；同 slug 通配+显式冗余 → 红 ---- */
console.log('【Tooth 4】不变体归属');
expect('方向 A：standard 归 alpha、long_context 归 beta（不相交）→ 绿',
  v(doc([link('alpha', 'P1', 'm', 'standard'), link('beta', 'P1', 'm', 'long_context'), link('gamma', 'P2', 'n', null)])).length === 0,
  v(doc([link('alpha', 'P1', 'm', 'standard'), link('beta', 'P1', 'm', 'long_context'), link('gamma', 'P2', 'n', null)])).join(' | '));
expect('方向 B：把 long_context 改成 standard（相交）→ 红',
  has(v(doc([link('alpha', 'P1', 'm', 'standard'), link('beta', 'P1', 'm', 'standard'), link('gamma', 'P2', 'n', null)])), '已经映射到'));
expect('方向 C：同一 slug 上「通配 + 显式」冗余重复认领 → 红',
  has(v(doc([link('alpha', 'P1', 'm', null), link('alpha', 'P1', 'm', 'standard'), link('gamma', 'P2', 'n', null)])), '冗余映射'));

/* ---- Tooth 5：覆盖率按展开条目记账（通配不虚高）+ 未认领必红 ---- */
console.log('【Tooth 5】覆盖率按展开条目记账');
{
  const covFull = reg.coverageOf({ table, links: doc([link('alpha', 'P1', 'm', null), link('beta', 'P2', 'n', null)]), gaps: { schemaVersion: 1, declarations: [] }, apiPlans, plans });
  expect('全部认领：apiPricingItems=3 · mappedApiEntries=3 · 未认领 0',
    covFull.apiPricingItems === 3 && covFull.mappedApiEntries === 3 && covFull.unmappedModelKeys.length === 0,
    JSON.stringify({ items: covFull.apiPricingItems, mapped: covFull.mappedApiEntries, unmapped: covFull.unmappedModelKeys.length }));
  const covPartial = reg.coverageOf({ table, links: doc([link('alpha', 'P1', 'm', 'standard')]), gaps: { schemaVersion: 1, declarations: [] }, apiPlans, plans });
  expect('只认领 1 条显式：记 1 条、未认领 2 条（通配语义不把整组算过）',
    covPartial.mappedApiEntries === 1 && covPartial.unmappedModelKeys.length === 2,
    JSON.stringify({ mapped: covPartial.mappedApiEntries, unmapped: covPartial.unmappedModelKeys.length }));
  expect('未认领的计价条目 → validateLinks 报红，且逐条带 variant',
    has(v(doc([link('alpha', 'P1', 'm', 'standard')])), '既没有 registry 映射')
    && v(doc([link('alpha', 'P1', 'm', 'standard')])).some(x => x.includes('long_context')));
  expect('通配指向记录里不存在的 modelKey → unresolved（判红）',
    reg.sourcePricingIdentitiesOf(link('alpha', 'P2', 'm', null), apiPlans).unresolved === true);
}

/* ---- §10.6 两侧同级 ---- */
console.log('【§10.6】API / Coding 两侧完整性');
expect('API 侧：存在未认领计价条目 → validateLinks 红',
  has(v(doc([link('alpha', 'P2', 'n', null)])), '既没有 registry 映射'));
expect('Coding 侧：一串既没映射也没声明 → validatePlanModelCoverage 红',
  reg.validatePlanModelCoverage({
    table, links: doc([]), gaps: { schemaVersion: 1, declarations: [] }, apiPlans,
    plans: [{ id: 'Q1', provider: 'z', supportedModels: [{ name: 'Whatever', role: 'included' }] }]
  }).some(x => x.includes('既没有 registry 映射')));

/* ---- 空输入不许假绿 ---- */
console.log('【空输入】');
expect('空 registry 表 → 由 validateRegistry 判红（"什么都没有"不是通过）',
  reg.validateRegistry({}, { developers: [], extraDevelopers: [] }).some(x => x.includes('没有任何模型')));
expect('有 registry 表但关系层一条都没有 → 红（"没写"不是"干净"）',
  has(v(doc([])), '关系层没写'));
// 注：validateLinks 的空表判据以「registry 表非空」为前提（空表本身由 validateRegistry 负责），
// 空 registry 的端到端形态（4 道门禁全红）在 mutation-matrix.cjs 的 m8 里真跑。

console.log('');
for (const r of rows) console.log(`${r.ok ? '  ✓' : '  ✗'} ${r.name}${r.ok ? '' : ' —— ' + r.detail}`);
console.log('');
if (bad) { console.log(`❌ 独立牙重建：${rows.length - bad}/${rows.length} 通过，${bad} 条不符合语义`); process.exit(1); }
console.log(`✅ 独立牙重建：${rows.length}/${rows.length} 全部符合语义`);
process.exit(0);
