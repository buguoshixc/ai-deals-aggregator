'use strict';
/** t28：更宽的假设电池 —— 试着精确复现 36 / 52 这两个旧读数。（只读，不写生产文件） */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const read = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

const linksDoc = read('scripts/data/model-registry-links.json');
const apiDoc = read('api-plans.json');
const modelsSrc = read('scripts/data/models.json');
const links = linksDoc.links || [];
const api = links.filter(l => l.apiPlanId);
const lower = s => String(s === null || s === undefined ? '' : s).toLowerCase();
const quotes = l => (Array.isArray(l.evidence) ? l.evidence : []).map(e => (e && e.quote) || '').filter(Boolean);

const nameByKey = new Map();
const canonicalBySlug = new Map();
for (const plan of apiDoc.plans || []) {
  for (const m of plan.models || []) nameByKey.set(`${plan.id}\u0000${m.modelKey}\u0000${m.variant}`, m.name || '');
}
for (const [slug, entry] of Object.entries(modelsSrc)) {
  if (!slug.startsWith('_')) canonicalBySlug.set(slug, entry.canonicalName || '');
}
const providerOf = new Map((apiDoc.plans || []).map(p => [p.id, p.provider]));

const main = api.filter(l => String(l.basis) !== 'explicit-mapping' && !quotes(l).map(lower)
  .some(q => [l.modelKey, nameByKey.get(`${l.apiPlanId}\u0000${l.modelKey}\u0000${l.variant}`) || '', l.registrySlug || '']
    .filter(Boolean).map(lower).some(n => q.includes(n))));

const hypotheses = {
  'H1 写死规则（仲裁值）': main.length,
  'H2 去掉「记录内 name」这一支': api.filter(l => String(l.basis) !== 'explicit-mapping'
    && !quotes(l).map(lower).some(q => [l.modelKey, l.registrySlug || ''].filter(Boolean).map(lower).some(n => q.includes(n)))).length,
  'H3 用 registry 的 canonicalName 代替记录内 name': api.filter(l => String(l.basis) !== 'explicit-mapping'
    && !quotes(l).map(lower).some(q => [l.modelKey, canonicalBySlug.get(l.registrySlug) || '', l.registrySlug || '']
      .filter(Boolean).map(lower).some(n => q.includes(n)))).length,
  'H4 只看第一条引文': api.filter(l => String(l.basis) !== 'explicit-mapping'
    && !(quotes(l)[0] && [l.modelKey, nameByKey.get(`${l.apiPlanId}\u0000${l.modelKey}\u0000${l.variant}`) || '', l.registrySlug || '']
      .filter(Boolean).map(lower).some(n => lower(quotes(l)[0]).includes(n)))).length,
  'H5 仲裁 34 条里不同的 registrySlug 数': new Set(main.map(l => l.registrySlug)).size,
  'H6 仲裁 34 条里不同的 modelKey 数': new Set(main.map(l => l.modelKey)).size,
  'H7 仲裁 34 条里 variant 为 null 的条数': main.filter(l => l.variant === null || l.variant === undefined).length,
  'H8 仲裁 34 条里 registrySlug 为空的条数': main.filter(l => !l.registrySlug).length,
  'H9 全部 API 侧 link 数': api.length,
  'H10 非 explicit-mapping 的 API 侧 link 数': api.filter(l => String(l.basis) !== 'explicit-mapping').length,
  'H11 全部 link 数': links.length,
  'H12 API 侧引文总条数': api.reduce((n, l) => n + quotes(l).length, 0),
  'H13 API 侧覆盖的不同 apiPlanId 数': new Set(api.map(l => l.apiPlanId)).size,
  'H14 仲裁 34 条覆盖到的 provider 数': new Set(main.map(l => providerOf.get(l.apiPlanId))).size,
  'H15 仲裁 34 条覆盖到的 apiPlanId 数': new Set(main.map(l => l.apiPlanId)).size,
};

console.log('假设电池（当前盘上数据）：links ' + links.length + ' · API 侧 ' + api.length);
for (const [k, v] of Object.entries(hypotheses)) console.log('  ' + String(v).padStart(4) + '  ' + k);
const basisCensus = {};
for (const l of main) basisCensus[l.basis] = (basisCensus[l.basis] || 0) + 1;
console.log('\n仲裁 34 条的 basis 分布：' + JSON.stringify(basisCensus));
const hits = Object.entries(hypotheses).filter(([, v]) => v === 36 || v === 52);
console.log('等于 36 或 52 的假设：' + (hits.length ? hits.map(([k, v]) => k + '=' + v).join('、') : '（一个都没有）'));
