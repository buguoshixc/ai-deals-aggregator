'use strict';
/** t28：残余登记表需要的几个计数（只读）。 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const read = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

const apiDoc = read('api-plans.json');
const plansDoc = read('plans.json');

/* (i) 同一个 modelKey 出现在几个 provider 记录里 */
const providersOfKey = new Map();
for (const plan of apiDoc.plans || []) {
  for (const m of plan.models || []) {
    if (!providersOfKey.has(m.modelKey)) providersOfKey.set(m.modelKey, new Set());
    providersOfKey.get(m.modelKey).add(plan.provider);
  }
}
const multi = [...providersOfKey.entries()].filter(([, s]) => s.size > 1).sort((a, b) => b[1].size - a[1].size);
console.log('(i) api-plans 里不同 modelKey 数 = ' + providersOfKey.size);
console.log('    出现在 >1 个 provider 记录里的 modelKey = ' + multi.length);
console.log('    最多的几个：' + multi.slice(0, 6).map(([k, s]) => k + '×' + s.size).join('、'));
const dist = {};
for (const [, s] of multi) dist[s.size] = (dist[s.size] || 0) + 1;
console.log('    重复度分布：' + JSON.stringify(dist));

/* (b) catalogStatus 与 registry status */
const pub = read('models.json');
const census = {};
for (const m of pub.models) census[m.catalogStatus] = (census[m.catalogStatus] || 0) + 1;
const src = read('scripts/data/models.json');
const roleCensus = {};
const withRel = [];
for (const [k, v] of Object.entries(src)) {
  if (k.startsWith('_')) continue;
  roleCensus[v.modelRole || '(none)'] = (roleCensus[v.modelRole || '(none)'] || 0) + 1;
  if (v.releasedAt) withRel.push(k + '@' + v.releasedAt);
}
console.log('\n(b) catalogStatus 分布 = ' + JSON.stringify(census));
console.log('    modelRole 分布 = ' + JSON.stringify(roleCensus));
console.log('    带 releasedAt 的登记条 = ' + withRel.length + ' / 44 · ' + withRel.join('、'));

/* coding 侧候选与 plans.json 的关系 */
console.log('\ncoding plans providers = ' + new Set(plansDoc.plans.map(p => p.provider)).size
  + ' · plans = ' + plansDoc.plans.length);
