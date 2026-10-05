#!/usr/bin/env node
/**
 * t7 独立重算（**不 require 任何被测 lib**：coverage-targets.js / model-freshness.js / coverage-report.js）。
 *
 * 直接读 raw source：
 *   scripts/data/models.json            来源层 registry（releasedAt / developer / owner / modelRole / status）
 *   models.json                         发布产物（派生字段 catalogStatus / catalogReason）
 *   scripts/data/coverage-targets.json  意图层（currentTargets / rulings / dimensionIntent）
 *   scripts/data/source-health.json     心跳
 *   scripts/data/providers.json         provider 身份表（key → name / vendorKey）
 *   deals.json / plans.json / api-plans.json
 *
 * 然后**自己重新算**：
 *   ① releasedAt known / unknown / unparsable（三种口径都算，看它们何时分家）
 *   ② catalogStatus 逐档分布（词表从 lib/model-freshness.js **文本**里抽，不 require）
 *   ③ (provider × dimension) 七态：我自己写的一串 if（语义按顶层的 `_stateModel` / `_rules` 文档），
 *      与报告 JSON 的 states / missingTargets / partialTargets / gapClosureQueue 逐条对
 *   ④ registry 映射闭合：每个 registry slug 是否有映射或声明；每条 api modelKey 是否被映射或声明
 *   ⑤ source health 普查（几行 / 哪些不健康 / cf≥3 的有没有裁决输入）
 *
 * 用法：node indep-recompute.cjs <repoRoot> <reportJsonCaptureFile>
 * 输出：stdout 一段人读结论 + 一段 JSON（machine-readable），并写出 indep-recompute.out.json
 */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.resolve(process.argv[2] || '.');
const capture = process.argv[3] || null;
const read = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const out = { root, capture, findings: [], checks: [] };
const note = (id, ok, detail) => {
  out.findings.push({ id, ok: Boolean(ok), detail });
  return ok;
};

/* ---------- raw sources ---------- */
const srcModelsDoc = read('scripts/data/models.json');
const pubDoc = read('models.json');
const targetsDoc = read('scripts/data/coverage-targets.json');
const healthDoc = read('scripts/data/source-health.json');
const providersDoc = read('scripts/data/providers.json');
const linksDoc = (() => { try { return read('scripts/data/model-registry-links.json'); } catch { return null; } })();
const apiDoc = read('api-plans.json');
const plansDoc = read('plans.json');
const dealsDoc = read('deals.json');

// scripts/data/models.json 是**扁平的 slug → entry**（没有 models 包装键），`_` 开头的是元信息
const srcModels = Object.fromEntries(Object.entries(srcModelsDoc).filter(([k]) => !k.startsWith('_')));
const pubModels = Array.isArray(pubDoc.models) ? pubDoc.models : [];
const registrySlugs = Object.keys(srcModels);
const pubBySlug = new Map(pubModels.filter(m => m && m.slug).map(m => [String(m.slug), m]));

/* ---------- ① releasedAt 三口径 ---------- */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const validCalendar = s => {
  if (!DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};
const rel = { total: registrySlugs.length, v2Unknown: [], stringUnknown: [], unparsable: [], known: [], notYmd: [] };
for (const slug of registrySlugs) {
  const e = srcModels[slug] || {};
  const v = e.releasedAt;
  if (v === null || v === undefined) rel.v2Unknown.push(slug);
  if (typeof v !== 'string' || v.trim() === '') rel.stringUnknown.push(slug);
  else if (!DATE_RE.test(v.trim())) rel.notYmd.push(slug);
  else if (!validCalendar(v.trim())) rel.unparsable.push({ slug, value: v });
  else rel.known.push(slug);
}
out.releasedAt = {
  total: rel.total,
  v2UnknownCount: rel.v2Unknown.length,
  stringUnknownCount: rel.stringUnknown.length,
  knownCount: rel.known.length,
  unparsableCount: rel.unparsable.length,
  notYmd: rel.notYmd,
  unparsable: rel.unparsable,
  knownSlugs: rel.known.slice().sort()
};
note('recompute.releasedAt.divergence',
  rel.v2Unknown.length === rel.stringUnknown.length,
  `v2 口径 unknown=${rel.v2Unknown.length}，我的"非空字符串"口径 unknown=${rel.stringUnknown.length}`);

/* ---------- ② catalogStatus 分布（词表从 lib 源码文本抽） ---------- */
const freshnessSrc = fs.readFileSync(path.join(root, 'scripts/lib/model-freshness.js'), 'utf8');
const wordListMatch = freshnessSrc.match(/CATALOG_STATUSES\s*=\s*(?:Object\.freeze\()?\[([^\]]*)\]/);
const wordList = wordListMatch
  ? wordListMatch[1].split(',').map(s => s.trim().replace(/^['"`]|['"`]$/g, '')).filter(Boolean)
  : null;
const statusCounts = {};
for (const m of pubModels) {
  const s = m && m.catalogStatus !== undefined ? String(m.catalogStatus) : '(字段缺失)';
  statusCounts[s] = (statusCounts[s] || 0) + 1;
}
// 词表里的档位**必须在读数里占位为 0**（少印一档 ≠ 那一档不存在）—— 这是本该如此的口径，
// 我自己的重算也要照做，否则"我少一个键"会被误读成"报告多一个键"。
if (Array.isArray(wordList)) for (const w of wordList) if (!(w in statusCounts)) statusCounts[w] = 0;
out.catalogStatus = {
  wordListFromLibText: wordList,
  publishedModels: pubModels.length,
  registryModels: registrySlugs.length,
  counts: statusCounts,
  outsideWordList: wordList ? Object.keys(statusCounts).filter(k => !wordList.includes(k)) : null
};

/* ---------- ③ 七态独立派生 ---------- */
const providers = (() => {
  const raw = (providersDoc && providersDoc.providers) ? providersDoc.providers : providersDoc;
  return Object.fromEntries(Object.entries(raw).filter(([k]) => !k.startsWith('_')));
})();
const provNameOf = key => {
  const entry = providers[key];
  return (entry && entry.name) ? String(entry.name) : key;
};
const nameByKey = new Map();
const keyByVendorKey = new Map();
for (const [key, entry] of Object.entries(providers || {})) {
  const name = (entry && entry.name) ? String(entry.name) : key;
  if (!nameByKey.has(name)) nameByKey.set(name, key);
  if (entry && entry.vendorKey) keyByVendorKey.set(String(entry.vendorKey), key);
}

// deals：vendor 归一（别名 / 大小写 / 标点）是**叶子工具**，不是被测的三件（coverage-targets / model-freshness /
// coverage-report）。这里 require 它只为把 deal 行归到 provider 身份上（= 我复现不出别名表），
// 派生七态的那串 if 仍然是我自己写的。这条依赖在报告里显式标注为独立性局限。
let vendorOf = null;
try {
  // vendorOf 由 load() 从 index.html 的 RENDER-CORE 标记区块里编译出来（不是模块的直接导出）
  const rc = require(path.join(root, 'scripts/lib/render-core.js'));
  vendorOf = rc.load().vendorOf;
} catch (error) {
  out.vendorNormalizerError = String(error.message);
}
const dealRows = Array.isArray(dealsDoc.deals) ? dealsDoc.deals : [];
const dealsByKey = {};
for (const deal of dealRows) {
  const v = typeof vendorOf === 'function' ? vendorOf(deal) : null;
  const key = v && v.key ? String(v.key) : null;
  if (!key) continue;
  const bucket = dealsByKey[key] || (dealsByKey[key] = { count: 0, sources: {} });
  bucket.count += 1;
  const s = String(deal.source === null || deal.source === undefined ? '' : deal.source);
  if (s) bucket.sources[s] = (bucket.sources[s] || 0) + 1;
}
const dealBucketForProviderKey = key => dealsByKey[key] || { count: 0, sources: {} };

const apiPlans = Array.isArray(apiDoc.plans) ? apiDoc.plans : [];
const apiByProvider = {};
for (const plan of apiPlans) {
  if (!plan || !plan.provider) continue;
  const b = apiByProvider[plan.provider] || (apiByProvider[plan.provider] = { count: 0, modelKeys: [] });
  b.count += 1;
  for (const m of (Array.isArray(plan.models) ? plan.models : [])) {
    if (m && typeof m.modelKey === 'string' && m.modelKey.trim()) b.modelKeys.push(m.modelKey);
  }
}
const plans = Array.isArray(plansDoc.plans) ? plansDoc.plans : [];
const codingByProvider = {};
for (const p of plans) {
  if (!p || !p.provider) continue;
  const b = codingByProvider[p.provider] || (codingByProvider[p.provider] = { count: 0, planNames: [] });
  b.count += 1;
  if (typeof p.planName === 'string' && p.planName.trim()) b.planNames.push(p.planName);
}
const modelsByProvider = {};
for (const [slug, e] of Object.entries(srcModels)) {
  const entry = e || {};
  for (const who of [entry.developer, entry.owner]) {
    if (!who) continue;
    const key = nameByKey.get(String(who));
    if (!key) continue;
    const b = modelsByProvider[key] || (modelsByProvider[key] = { count: 0, slugs: [] });
    b.count += 1;
    b.slugs.push(slug);
  }
}

const DIMENSIONS = ['deals', 'coding', 'api', 'models'];
const healthOf = name => {
  const row = (Array.isArray(healthDoc.sources) ? healthDoc.sources : []).find(s => s && s.name === name);
  return row || null;
};
const declaredItems = (target, dimension) => (Array.isArray(target.currentTargets) ? target.currentTargets : [])
  .filter(item => item && item.dimension === dimension);
const rulingOf = (target, dimension) => (Array.isArray(target.rulings) ? target.rulings : [])
  .find(r => r && r.dimension === dimension) || null;

const myCells = [];
for (const target of (Array.isArray(targetsDoc.targets) ? targetsDoc.targets : [])) {
  const provider = target.provider;
  const providerName = provNameOf(provider);
  for (const dimension of DIMENSIONS) {
    const intent = target.dimensionIntent ? target.dimensionIntent[dimension] : null;
    const applicable = typeof intent === 'string' && intent.trim().length > 0;
    const declared = declaredItems(target, dimension);
    const ruling = rulingOf(target, dimension);
    let count = 0;
    let resolved = 0;
    const sources = [];
    if (dimension === 'api') {
      const b = apiByProvider[provider];
      count = b ? b.count : 0;
      for (const item of declared) if (b && b.modelKeys.includes(item.modelKey)) resolved += 1;
    } else if (dimension === 'coding') {
      const b = codingByProvider[provider];
      count = b ? b.count : 0;
      for (const item of declared) if (b && b.planNames.includes(item.planName)) resolved += 1;
    } else if (dimension === 'deals') {
      const b = dealBucketForProviderKey(provider);
      count = b.count;
      for (const item of declared) {
        const n = item.source ? (b.sources[item.source] || 0) : 0;
        if (n > 0) resolved += 1;
        if (item.source) sources.push({ name: item.source, health: healthOf(item.source) });
      }
    } else {
      const b = modelsByProvider[provider];
      count = b ? b.count : 0;
      for (const item of declared) {
        const e = item.registrySlug ? srcModels[item.registrySlug] : null;
        if (e && (String(e.developer) === providerName || String(e.owner) === providerName)) resolved += 1;
      }
    }
    const unhealthy = sources.filter(s => s.health && s.health.status && s.health.status !== 'healthy');
    let state;
    if (!applicable) state = 'NOT_APPLICABLE';
    else if (ruling) state = ruling.decision === 'unverifiable' ? 'UNVERIFIABLE' : 'DEFERRED';
    else if (count === 0 && sources.length > 0 && unhealthy.length === sources.length) state = 'BLOCKED_SOURCE';
    else if (!declared.length) state = count > 0 ? 'COVERED' : 'MISSING';
    else if (resolved === declared.length) state = 'COVERED';
    else if (resolved > 0) state = 'PARTIAL';
    else state = count > 0 ? 'PARTIAL' : 'MISSING';
    myCells.push({ provider, providerName, dimension, state, declared: declared.length, resolved, count, tier: target.tier });
  }
}
const tally = states => {
  const t = {};
  // 七态全部占位（0 也要在），与报告 STATE_ORDER 的口径对齐
  for (const s of ['COVERED', 'PARTIAL', 'MISSING', 'DEFERRED', 'UNVERIFIABLE', 'NOT_APPLICABLE', 'BLOCKED_SOURCE']) t[s] = 0;
  for (const c of states) t[c.state] = (t[c.state] || 0) + 1;
  return t;
};
out.myStates = tally(myCells);
out.myMissing = myCells.filter(c => c.state === 'MISSING').map(c => `${c.provider}/${c.dimension}`);
out.myPartial = myCells.filter(c => c.state === 'PARTIAL').map(c => `${c.provider}/${c.dimension} N=${c.declared} M=${c.resolved} rows=${c.count}`);
out.myBlocked = myCells.filter(c => c.state === 'BLOCKED_SOURCE').map(c => `${c.provider}/${c.dimension}`);
out.myDeferred = myCells.filter(c => c.state === 'DEFERRED').map(c => `${c.provider}/${c.dimension}`);
out.myUnverifiable = myCells.filter(c => c.state === 'UNVERIFIABLE').map(c => `${c.provider}/${c.dimension}`);
out.myNotApplicable = myCells.filter(c => c.state === 'NOT_APPLICABLE').length;

/* ---------- ④ registry 映射闭合（raw 侧） ---------- */
const linkRows = (() => {
  if (!linksDoc) return null;
  for (const key of ['links', 'relations', 'mappings', 'entries', 'modelRegistryLinks']) {
    if (Array.isArray(linksDoc[key])) return linksDoc[key];
  }
  const arrays = Object.values(linksDoc).filter(Array.isArray);
  return arrays.length === 1 ? arrays[0] : null;
})();
const mappedSlugs = new Set();
const mappedApi = new Set();
for (const l of (linkRows || [])) {
  if (!l) continue;
  if (l.registrySlug) mappedSlugs.add(String(l.registrySlug));
  if (l.apiPlanId) mappedApi.add(String(l.apiPlanId));
}
const apiEntries = [];
for (const plan of apiPlans) {
  if (!plan || !plan.provider) continue;
  for (const m of (Array.isArray(plan.models) ? plan.models : [])) {
    if (m && typeof m.modelKey === 'string' && m.modelKey.trim()) apiEntries.push(`${plan.id || plan.planId || '?'}\u0000${m.modelKey}\u0000${m.variant === undefined ? 'null' : m.variant}`);
  }
}
out.mappingClosure = {
  registrySlugs: registrySlugs.length,
  mappedSlugs: mappedSlugs.size,
  unmappedSlugs: registrySlugs.filter(s => !mappedSlugs.has(s)),
  linksRows: linkRows ? linkRows.length : null,
  apiPricingEntries: apiEntries.length,
  distinctApiPricingEntries: new Set(apiEntries).size
};

/* ---------- ⑤ source health 普查 ---------- */
const healthRows = Array.isArray(healthDoc.sources) ? healthDoc.sources : [];
out.sourceHealth = {
  generatedAt: healthDoc.generatedAt === undefined ? null : healthDoc.generatedAt,
  rows: healthRows.length,
  unhealthy: healthRows.filter(r => r && r.status && r.status !== 'healthy').map(r => `${r.name}(${r.status}${r.reason ? '/' + r.reason : ''}) cf=${r.consecutiveFailures}`),
  cfGe3: healthRows.filter(r => r && Number.isFinite(r.consecutiveFailures) && r.consecutiveFailures >= 3).map(r => `${r.name}(${r.consecutiveFailures})`)
};

/* ---------- 与报告 JSON 逐条对 ---------- */
if (capture) {
  const raw = fs.readFileSync(capture, 'utf8');
  const at = raw.indexOf('\nJSON:\n');
  const doc = JSON.parse(raw.slice(at + 7, raw.lastIndexOf('\n\n✅ ')));
  const ct = doc.coverageTargets;
  out.report = {
    registryModels: ct.releaseEvidence.registryModels,
    known: ct.releaseEvidence.known,
    unknown: ct.releaseEvidence.unknown,
    unparsable: ct.releaseEvidence.unparsable,
    withReleaseEvidence: ct.releaseEvidence.withReleaseEvidence,
    byCatalogStatus: ct.releaseEvidence.byCatalogStatus.map(b => `${b.key}=${b.total}`),
    censusCounts: ct.catalogStatusCensus.counts,
    censusSum: ct.catalogStatusCensus.sum,
    states: ct.states,
    missing: ct.missingTargets.map(c => `${c.provider}/${c.dimension}`),
    partial: ct.partialTargets.map(c => `${c.provider}/${c.dimension}`),
    gapCounts: ct.gapClosureQueue.counts,
    gapTotal: ct.gapClosureQueue.total,
    gapKeys: ct.gapClosureQueue.queue.map(r => `${r.provider}/${r.dimension}`),
    unknownReleaseDates: ct.currentModels.unknownReleaseDates ? ct.currentModels.unknownReleaseDates.length : null,
    healthGeneratedAt: ct.sourceReliability.healthGeneratedAt,
    healthRowCount: ct.sourceReliability.healthRowCount,
    notLanded: ct.sourceReliability.notLanded
  };
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  // 计数对象比较必须**与键的插入序无关**（报告按词表序印，我按遇到序收集；序不同不代表读数不同）
  const sameCounts = (a, b) => {
    const ka = Object.keys(a).sort(); const kb = Object.keys(b).sort();
    return JSON.stringify(ka) === JSON.stringify(kb) && ka.every(k => a[k] === b[k]);
  };
  note('vs.report.registryModels', ct.releaseEvidence.registryModels === registrySlugs.length, `${ct.releaseEvidence.registryModels} vs mine ${registrySlugs.length}`);
  note('vs.report.known', ct.releaseEvidence.known === rel.known.length, `${ct.releaseEvidence.known} vs mine ${rel.known.length}`);
  note('vs.report.unknown', ct.releaseEvidence.unknown === rel.v2Unknown.length, `${ct.releaseEvidence.unknown} vs mine(v2口径) ${rel.v2Unknown.length}`);
  note('vs.report.unparsable', ct.releaseEvidence.unparsable === rel.unparsable.length, `${ct.releaseEvidence.unparsable} vs mine ${rel.unparsable.length}`);
  const sameCounts2 = (a, b) => {
    const ka = Object.keys(a).sort(); const kb = Object.keys(b).sort();
    return JSON.stringify(ka) === JSON.stringify(kb) && ka.every(k => a[k] === b[k]);
  };
  note('vs.report.catalogStatusCensus',
    sameCounts2(ct.catalogStatusCensus.counts, statusCounts) && ct.catalogStatusCensus.sum === pubModels.length,
    `report=${JSON.stringify(ct.catalogStatusCensus.counts)} mine=${JSON.stringify(statusCounts)}`);
  note('vs.report.sameDate',
    ct.sourceReliability.healthGeneratedAt === out.sourceHealth.generatedAt,
    `${ct.sourceReliability.healthGeneratedAt} vs ${out.sourceHealth.generatedAt}`);
  note('vs.report.states', sameCounts2(ct.states, out.myStates), `report=${JSON.stringify(ct.states)} mine=${JSON.stringify(out.myStates)}`);
  note('vs.report.missingSet', eq(ct.missingTargets.map(c => `${c.provider}/${c.dimension}`).sort(), out.myMissing.slice().sort()),
    `report=${ct.missingTargets.length} mine=${out.myMissing.length}`);
  note('vs.report.partialSet', eq(ct.partialTargets.map(c => `${c.provider}/${c.dimension}`).sort(), out.myPartial.map(s => s.split(' ')[0]).sort()),
    `report=${ct.partialTargets.map(c => c.provider + '/' + c.dimension).join(',')} mine=${out.myPartial.join(',')}`);
  note('vs.report.gapQueue', ct.gapClosureQueue.total === out.myMissing.length + out.myPartial.length,
    `${ct.gapClosureQueue.total} vs mine ${out.myMissing.length + out.myPartial.length}`);
} else {
  out.report = null;
}

/* ---------- 输出 ---------- */
console.log(JSON.stringify(out, null, 2));
if (process.argv[4]) fs.writeFileSync(process.argv[4], `${JSON.stringify(out, null, 2)}\n`);
const bad = out.findings.filter(f => !f.ok);
console.error(`\n=== 独立重算：${out.findings.length} 条对账，${bad.length} 条不成立 ===`);
for (const f of bad) console.error(` ✗ ${f.id}: ${f.detail}`);
process.exit(bad.length ? 1 : 0);
