'use strict';
// 临时探查脚本（标注完成后删除）：紧凑打印预筛入围对 + 现有确定性去重会不会合并这一对。
const store = require('../../lib/store');
const aiDedup = require('../../ai/dedup');
const lib = require('../../lib/dedup');

const deals = store.loadStore().deals;
const byId = new Map(deals.map(d => [d.id, d]));
const pairs = aiDedup.shortlist(deals, { maxPairs: 30 });
console.log('pairs=' + pairs.length);
let n = 0;
for (const p of pairs) {
  n++;
  const s = p.signals;
  console.log(`#${n} ${p.a.id}~${p.b.id} score=${s.score} host=${s.sameHost ? 1 : 0} alias=${s.sameAliasKey ? 1 : 0} contain=${s.containment ? 1 : 0} vendor=${s.sameVendor ? 1 : 0} dice=${s.titleDice}`);
  console.log(`   A ${p.a.vendor} | ${p.a.title} | ${p.a.url} | disc=${p.a.discountInfo} | benefit=${(p.a.benefitType || []).join('/')}`);
  console.log(`   B ${p.b.vendor} | ${p.b.title} | ${p.b.url} | disc=${p.b.discountInfo} | benefit=${(p.b.benefitType || []).join('/')}`);
}
// 现有确定性去重：同一批次内部会不会把这两条合并（aliasKey 相同即视为会合并）
let wouldMerge = 0;
for (const p of pairs) {
  if (lib.aliasKey(p.a.title) === lib.aliasKey(p.b.title)) wouldMerge++;
}
console.log('existingDeterministicWouldMerge=' + wouldMerge);
// 全库 aliasKey 重复组
const groups = new Map();
for (const d of deals) {
  const k = lib.aliasKey(d.title);
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(d);
}
const dupGroups = [...groups.values()].filter(g => g.length > 1);
console.log('duplicateAliasGroupsInStore=' + dupGroups.length);
for (const g of dupGroups) console.log('   ' + g.map(d => d.id + ' ' + d.title).join(' || '));
console.log('LIBDEDUP_EXPORTS=' + Object.keys(lib).join(','));
