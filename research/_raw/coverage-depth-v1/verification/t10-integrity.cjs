#!/usr/bin/env node
/**
 * t10 · Integrity 独立测量（Stable IDs / History / Pricing / Registry 闭合）。
 * 全部自己算：基线取 `git show HEAD:<file>`，现态取工作区，两边各自解析后比集合与事件。
 *
 * 用法：node t10-integrity.cjs <repoRoot> <outJson>
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repo = path.resolve(process.argv[2]);
const outFile = path.resolve(process.argv[3]);
const now = rel => JSON.parse(fs.readFileSync(path.join(repo, rel), 'utf8'));
const base = rel => {
  const r = spawnSync('git', ['show', `HEAD:${rel}`], { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) return null;
  try { return JSON.parse(r.stdout); } catch { return null; }
};
const out = { repo, ranAt: new Date().toISOString(), ids: {}, history: {}, pricing: {}, registry: {}, problems: [] };
const diff = (label, before, after) => {
  const b = new Set(before); const a = new Set(after);
  const added = [...a].filter(x => !b.has(x));
  const removed = [...b].filter(x => !a.has(x));
  out.ids[label] = { before: b.size, after: a.size, added: added.length, removed: removed.length, addedSample: added.slice(0, 12), removedSample: removed.slice(0, 12) };
  if (removed.length) out.problems.push(`${label}: 消失了 ${removed.length} 个 id（Stable ID churn）：${removed.slice(0, 8).join(', ')}`);
  return out.ids[label];
};

/* ---------------- ① Stable IDs ---------------- */
const apiNow = now('api-plans.json'); const apiBase = base('api-plans.json');
const plansNow = now('plans.json'); const plansBase = base('plans.json');
const dealsNow = now('deals.json'); const dealsBase = base('deals.json');
const provNow = now('scripts/data/providers.json'); const provBase = base('scripts/data/providers.json');
const modelsNow = now('scripts/data/models.json'); const modelsBase = base('scripts/data/models.json');
const linksNow = now('scripts/data/model-registry-links.json'); const linksBase = base('scripts/data/model-registry-links.json');

const idsOf = (doc, key, field = 'id') => (Array.isArray(doc && doc[key]) ? doc[key] : []).map(x => x && x[field]).filter(Boolean).map(String);
diff('apiPlanIds', idsOf(apiBase, 'plans'), idsOf(apiNow, 'plans'));
diff('codingPlanIds', idsOf(plansBase, 'plans'), idsOf(plansNow, 'plans'));
diff('dealIds', idsOf(dealsBase, 'deals'), idsOf(dealsNow, 'deals'));
diff('providerKeys', Object.keys(provBase || {}).filter(k => !k.startsWith('_')), Object.keys(provNow || {}).filter(k => !k.startsWith('_')));
diff('modelSlugs', Object.keys(modelsBase || {}).filter(k => !k.startsWith('_')), Object.keys(modelsNow || {}).filter(k => !k.startsWith('_')));
const linkKey = l => `${l.registrySlug || ''}\u0000${l.apiPlanId || ''}\u0000${l.modelKey || ''}\u0000${l.variant === undefined ? 'undefined' : l.variant}`;
diff('linkIdentities', (linksBase && linksBase.links || []).map(linkKey), (linksNow && linksNow.links || []).map(linkKey));

/* ---------------- ② History ---------------- */
const HISTORY = [
  ['deal-history.json', 'scripts/data/deal-history.json'],
  ['plan-history.json', 'scripts/data/plan-history.json'],
  ['api-plan-history.json', 'scripts/data/api-plan-history.json']
];
for (const [label, rel] of HISTORY) {
  let cur = null; let old = null;
  try { cur = now(rel); } catch (error) { out.history[label] = { error: String(error.message) }; continue; }
  old = base(rel);
  const events = doc => (doc && Array.isArray(doc.events)) ? doc.events
    : (doc && Array.isArray(doc.entries)) ? doc.entries
      : (doc && Array.isArray(doc.changes)) ? doc.changes : [];
  const evNow = events(cur); const evOld = events(old);
  const typeOf = e => String((e && (e.type || e.kind || e.event)) || '(无类型)');
  const countBy = list => list.reduce((acc, e) => { const t = typeOf(e); acc[t] = (acc[t] || 0) + 1; return acc; }, {});
  const keyOf = e => JSON.stringify([typeOf(e), e && (e.id || e.eventId || e.planId || e.apiPlanId || e.slug || ''), e && (e.at || e.date || e.recordedAt || e.timestamp || '')]);
  const keysOld = new Set(evOld.map(keyOf));
  const added = evNow.filter(e => !keysOld.has(keyOf(e)));
  const removed = evOld.filter(e => !new Set(evNow.map(keyOf)).has(keyOf(e)));
  out.history[label] = {
    file: rel,
    eventsBefore: evOld.length, eventsAfter: evNow.length,
    typesBefore: countBy(evOld), typesAfter: countBy(evNow),
    added: added.length, removed: removed.length,
    addedSample: added.slice(0, 6).map(e => ({ type: typeOf(e), at: e.at || e.date || e.recordedAt || null, id: e.id || e.planId || e.apiPlanId || null })),
    topLevelKeys: Object.keys(cur || {}).slice(0, 10)
  };
  // 伪造事件判据：新增事件里不许出现"来源健康导致的批量结束"（本轮无 retire）；
  // 也不许出现 futurepedia 相关 ended/removed
  const fpEnded = added.filter(e => /ended|removed|retired/i.test(typeOf(e)) && /futurepedia/i.test(JSON.stringify(e)));
  if (fpEnded.length) out.problems.push(`${label}: 新增了 futurepedia 的 ended/removed 事件 ${fpEnded.length} 条（无理由 History 变化）`);
  const massEnded = added.filter(e => /ended|removed/i.test(typeOf(e)));
  out.history[label].addedEndedEvents = massEnded.length;
}

/* ---------------- ③ Pricing：legacy 模型的 API 计价行仍在 ---------------- */
const published = now('models.json');
const legacyModels = (published.models || []).filter(m => m && m.catalogStatus === 'legacy');
const apiPlans = Array.isArray(apiNow.plans) ? apiNow.plans : [];
const apiKeysByPlan = new Map(apiPlans.map(p => [String(p.id), new Set((p.models || []).map(m => String(m.modelKey)))]));
const allApiKeys = new Set();
for (const p of apiPlans) for (const m of (p.models || [])) allApiKeys.add(String(m.modelKey));
// legacy 模型在 api-plans 里的计价条目（按 slug 精确或 slug 去掉 variant 后缀做一次宽松比对）
out.pricing = { legacyModels: legacyModels.map(m => m.slug), apiModelKeysTotal: allApiKeys.size, rows: [] };
for (const m of legacyModels) {
  const slug = String(m.slug);
  const exact = allApiKeys.has(slug);
  const planHit = apiPlans.filter(p => (p.models || []).some(x => String(x.modelKey) === slug));
  out.pricing.rows.push({ slug, catalogStatus: m.catalogStatus, apiPricingRowPresent: exact || planHit.length > 0, plans: planHit.map(p => p.id) });
  if (!(exact || planHit.length > 0)) out.problems.push(`legacy 模型 ${slug} 的 API 计价行不见了（Pricing 完整性）`);
}
// baseline 对照：legacy 集合本身有没有变（本轮 A/B 都可能改 catalogStatus）
const baseLegacy = (published.models || []).length;   // 仅记录用
out.pricing.publishedModels = baseLegacy;

/* ---------------- ④ Registry 闭合 ---------------- */
const registrySlugs = Object.keys(modelsNow).filter(k => !k.startsWith('_'));
const linkRows = Array.isArray(linksNow.links) ? linksNow.links : [];
const mappedSlugs = new Set(linkRows.map(l => l && l.registrySlug).filter(Boolean).map(String));
const unmapped = registrySlugs.filter(s => !mappedSlugs.has(s));
// 方程：计价条目 identity = 映射认领 + 声明覆盖 + 未判
const pricingIdentities = [];
for (const p of apiPlans) for (const m of (p.models || [])) pricingIdentities.push(`${p.id}\u0000${m.modelKey}\u0000${m.variant === undefined ? 'null' : m.variant}`);
const gapsDoc = now('scripts/data/model-registry-gaps.json');
const declarations = Array.isArray(gapsDoc.declarations) ? gapsDoc.declarations : [];
const apiDeclarations = declarations.filter(d => d && d.apiPlanId !== undefined && d.modelKey !== undefined);
out.registry = {
  registrySlugs: registrySlugs.length,
  linkRows: linkRows.length,
  mappedSlugs: mappedSlugs.size,
  unmappedSlugs: unmapped,
  pricingIdentities: pricingIdentities.length,
  distinctPricingIdentities: new Set(pricingIdentities).size,
  declarationsTotal: declarations.length,
  apiSideDeclarations: apiDeclarations.length,
  declarationDuplicateKeys: declarations.length - new Set(declarations.map(d => JSON.stringify([d.apiPlanId, d.modelKey, d.variant]))).size,
  apiDeclarationKeysAllResolvable: apiDeclarations.every(d => {
    const plan = apiPlans.find(p => String(p.id) === String(d.apiPlanId));
    return plan && (plan.models || []).some(m => String(m.modelKey) === String(d.modelKey));
  })
};
if (unmapped.length) out.problems.push(`registry 映射不闭合：${unmapped.length} 个 slug 无映射`);
if (!out.registry.apiDeclarationKeysAllResolvable) out.problems.push('存在对不上任何计价条目的 API 侧声明');

/* ---------------- 输出 ---------------- */
fs.writeFileSync(outFile, `${JSON.stringify(out, null, 2)}\n`);
const show = o => JSON.stringify(o);
console.log('ID 集合（before → after）：');
for (const [k, v] of Object.entries(out.ids)) console.log(`  ${k}: ${v.before} → ${v.after}（+${v.added} / -${v.removed}）${v.removed ? ' ⚠ ' + show(v.removedSample) : ''}`);
console.log('History：');
for (const [k, v] of Object.entries(out.history)) console.log(`  ${k}: ${v.eventsBefore} → ${v.eventsAfter}（新增 ${v.added} / 消失 ${v.removed} / 新增 ended ${v.addedEndedEvents}）${v.error ? ' ERROR ' + v.error : ''}`);
console.log('Pricing：', show(out.pricing.legacyModels), '→', show(out.pricing.rows));
console.log('Registry：', show(out.registry));
console.log(`\nIntegrity 测量问题 ${out.problems.length} 条${out.problems.length ? '：\n  ' + out.problems.join('\n  ') : ''}`);
process.exit(out.problems.length ? 1 : 0);
