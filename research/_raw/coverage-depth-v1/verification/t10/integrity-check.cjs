#!/usr/bin/env node
/**
 * t10 Self-Audit：**Integrity 逐项实测**（只读；基线 = git HEAD = ff86368）。
 * 输出：控制台紧凑摘要 + integrity.json（逐项证据）。
 *
 * 覆盖：Stable IDs（逐类 id 集合 vs 基线）/ History（三份 history 的新增事件是否只对应新增记录）/
 *       Pricing（legacy 模型 API 计价行仍在）/ Registry（映射闭合）/ 派生一致性（根 models.json vs 来源层）。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const out = path.join(__dirname, 'integrity.json');
const read = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const head = rel => JSON.parse(execSync(`git show HEAD:${rel}`, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));

const lines = [];
const say = s => { lines.push(s); console.log(s); };
const setDiff = (a, b) => ({ added: [...a].filter(x => !b.has(x)), removed: [...b].filter(x => !a.has(x)) });
const idsOf = (list, key = 'id') => new Set((list || []).map(item => String(item && item[key])));

const report = { generatedAtNote: '2026-10-05 (t10 independent integrity pass)', baseline: 'ff86368e6d12d1ef57b2f51aa2c957c01d2a9ed8' };

/* ---------- Stable IDs ---------- */
const idChecks = [];
function idCheck(label, baselineIds, currentIds, expectAdditions) {
  const d = setDiff(currentIds, baselineIds);
  idChecks.push({ label, baseline: baselineIds.size, current: currentIds.size, added: d.added.length, removed: d.removed.length, removedIds: d.removed.slice(0, 10), addedIds: d.added.slice(0, 10), expectAdditions });
  say(`${d.removed.length === 0 ? '✓' : '✗'} StableID ${label}: baseline=${baselineIds.size} current=${currentIds.size} added=${d.added.length} removed=${d.removed.length}${d.removed.length ? ' REMOVED=' + d.removed.slice(0, 8).join(',') : ''}`);
}
idCheck('api-plans[].id', idsOf(head('api-plans.json').plans), idsOf(read('api-plans.json').plans), 'additions expected');
idCheck('plans[].id', idsOf(head('plans.json').plans), idsOf(read('plans.json').plans), 'additions expected');
idCheck('registry models[].slug', new Set(Object.keys(head('scripts/data/models.json')).filter(k => !k.startsWith('_'))), new Set(Object.keys(read('scripts/data/models.json')).filter(k => !k.startsWith('_'))), 'additions expected');
idCheck('root models[].id', idsOf(head('models.json').models), idsOf(read('models.json').models), 'additions expected (derived)');
const dealListOf = doc => (Array.isArray(doc) ? doc : doc.deals || []);
idCheck('deals[].id', idsOf(dealListOf(head('deals.json'))), idsOf(dealListOf(read('deals.json'))), 'must be zero churn');
idCheck('providers keys', new Set(Object.keys(head('scripts/data/providers.json')).filter(k => !k.startsWith('_'))), new Set(Object.keys(read('scripts/data/providers.json')).filter(k => !k.startsWith('_'))), 'must be zero churn');
report.stableIds = idChecks;

/* ---------- History ---------- */
const historyFiles = ['scripts/data/deal-history.json', 'scripts/data/plan-history.json', 'scripts/data/api-plan-history.json'];
const historyReport = [];
for (const file of historyFiles) {
  const base = head(file);
  const now = read(file);
  const eventsOf = doc => (Array.isArray(doc) ? doc : (doc.events || doc.entries || []));
  const b = eventsOf(base), n = eventsOf(now);
  const keyOf = evt => JSON.stringify(evt);
  const baseKeys = new Set(b.map(keyOf));
  const added = n.filter(evt => !baseKeys.has(keyOf(evt)));
  const removed = b.filter(evt => !new Set(n.map(keyOf)).has(keyOf(evt)));
  const kinds = {};
  for (const evt of added) { const k = evt.type || evt.kind || evt.event || '(none)'; kinds[k] = (kinds[k] || 0) + 1; }
  historyReport.push({ file, baselineEvents: b.length, currentEvents: n.length, added: added.length, removed: removed.length, addedKinds: kinds, samples: added.slice(0, 3) });
  say(`${removed.length === 0 ? '✓' : '✗'} History ${file}: events ${b.length} → ${n.length} (added=${added.length} removed=${removed.length}) kinds=${JSON.stringify(kinds)}`);
}
report.history = historyReport;

/* ---------- 新增 history 事件是否只对应本轮新增记录 ---------- */
const nowApi = read('api-plans.json').plans, headApi = head('api-plans.json').plans;
const newApiIds = new Set([...idsOf(nowApi)].filter(id => !idsOf(headApi).has(id)));
const nowPlan = read('plans.json').plans, headPlan = head('plans.json').plans;
const newPlanIds = new Set([...idsOf(nowPlan)].filter(id => !idsOf(headPlan).has(id)));
function historyAttribution(file, newIds, idKeys) {
  const events = (() => { const d = read(file); return Array.isArray(d) ? d : (d.events || d.entries || []); })();
  const baseKeys = new Set(((() => { const d = head(file); return (Array.isArray(d) ? d : (d.events || d.entries || [])); })()).map(e => JSON.stringify(e)));
  const added = events.filter(e => !baseKeys.has(JSON.stringify(e)));
  const orphans = [];
  for (const evt of added) {
    const ids = idKeys.map(k => evt[k]).filter(Boolean).map(String);
    const linkedToNew = ids.length > 0 ? ids.every(id => newIds.has(id)) : (() => { const s = JSON.stringify(evt); return [...newIds].some(id => s.includes(id)); })();
    if (!linkedToNew) orphans.push(evt);
  }
  say(`${orphans.length === 0 ? '✓' : '✗'} History 归属 ${file}: 新增 ${added.length} 条，其中不指向本轮新增记录的 ${orphans.length} 条`);
  return { file, addedCount: added.length, unattributed: orphans.length, orphanSamples: orphans.slice(0, 3) };
}
report.historyAttribution = [
  historyAttribution('scripts/data/api-plan-history.json', newApiIds, ['apiPlanId', 'id', 'planId']),
  historyAttribution('scripts/data/plan-history.json', newPlanIds, ['planId', 'id'])
];

/* ---------- Pricing：legacy 模型仍有计价行 ---------- */
const links = read('scripts/data/model-registry-links.json').links || [];
const derived = read('models.json').models;
const legacySlugs = derived.filter(m => m.catalogStatus === 'legacy').map(m => m.slug);
const pricing = [];
for (const slug of legacySlugs) {
  const apiPlanIds = [...new Set(links.filter(l => l.registrySlug === slug && l.apiPlanId).map(l => l.apiPlanId))];
  let rows = 0;
  for (const entry of read('api-plans.json').plans) if (apiPlanIds.includes(entry.id)) {
    const modelKeys = [...new Set(links.filter(l => l.registrySlug === slug && l.apiPlanId === entry.id).map(l => l.modelKey))];
    rows += (entry.models || []).filter(m => modelKeys.includes(String(m.modelKey))).length;
  }
  pricing.push({ slug, catalogStatus: 'legacy', apiPlanIds, pricingRows: rows });
  say(`${rows > 0 ? '✓' : '✗'} Pricing legacy ${slug}: apiPlans=${apiPlanIds.length} pricingRows=${rows}`);
}
report.pricing = pricing;

/* ---------- Registry 映射闭合 ---------- */
const registrySlugs = new Set(Object.keys(read('scripts/data/models.json')).filter(k => !k.startsWith('_')));
const linkedSlugs = new Set(links.map(l => l.registrySlug));
const unlinked = [...registrySlugs].filter(s => !linkedSlugs.has(s));
report.registry = { registrySlugs: registrySlugs.size, linkedSlugs: linkedSlugs.size, unlinked: unlinked.length, unlinkedSlugs: unlinked.slice(0, 10) };
say(`${unlinked.length === 0 ? '✓' : '✗'} Registry 映射闭合: registry=${registrySlugs.size} linked=${linkedSlugs.size} 未被任何链接引用的=${unlinked.length}${unlinked.length ? ' → ' + unlinked.join(',') : ''}`);

/* ---------- 派生一致性：根 models.json / links vs 来源层（不调用被测 lib，只比集合） ---------- */
const srcSlugs = new Set(Object.keys(read('scripts/data/models.json')).filter(k => !k.startsWith('_')));
const pubSlugs = new Set(derived.map(m => m.slug));
const derivedDiff = setDiff(pubSlugs, srcSlugs);
report.derived = { sourceSlugs: srcSlugs.size, publishedSlugs: pubSlugs.size, missing: derivedDiff.removed.length, extra: derivedDiff.added.length };
say(`${derivedDiff.added.length === 0 && derivedDiff.removed.length === 0 ? '✓' : '✗'} 派生集合一致: 来源层 ${srcSlugs.size} vs 根 models.json ${pubSlugs.size}（缺 ${derivedDiff.removed.length} / 多 ${derivedDiff.added.length}）`);

const known = derived.filter(m => m.releasedAt).length;
const census = {}; for (const m of derived) census[m.catalogStatus] = (census[m.catalogStatus] || 0) + 1;
report.census = { total: derived.length, knownReleasedAt: known, unknownReleasedAt: derived.length - known, byCatalogStatus: census };
say(`  · census: total=${derived.length} releasedAt 已知=${known} / 未知=${derived.length - known} catalogStatus=${JSON.stringify(census)}`);

fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
console.log(`\n→ 证据写入 ${path.relative(ROOT, out)}`);
