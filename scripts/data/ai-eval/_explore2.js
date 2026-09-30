'use strict';
// 临时探查脚本（标注完成后删除）：看 gold 与文本，挑选评测 fixture 用的记录。
const store = require('../../lib/store');
const extract = require('../../ai/extract');
const audience = require('../../lib/audience');

const deals = store.loadStore().deals;
const MANAGED = ['audience', 'benefitType', 'eligibilityDetail', 'claimRequirements', 'availability'];
const has = d => MANAGED.some(f => audience.hasKnown(d[f]));
const items = deals.filter(has);
console.log('withKnown=' + items.length + ' total=' + deals.length);

function unknownKeys(deal) {
  const out = [];
  if (!Array.isArray(deal.audience) || !deal.audience.length) out.push('audience');
  if (!Array.isArray(deal.benefitType) || !deal.benefitType.length) out.push('benefitType');
  for (const k of audience.ELIGIBILITY_KEYS) {
    const v = deal.eligibilityDetail ? deal.eligibilityDetail[k] : undefined;
    if (v !== true && v !== false) out.push('eligibilityDetail.' + k);
  }
  for (const k of audience.CLAIM_KEYS) {
    const v = deal.claimRequirements ? deal.claimRequirements[k] : undefined;
    if (v !== true && v !== false) out.push('claimRequirements.' + k);
  }
  const c = deal.availability ? deal.availability.chinaUsable : undefined;
  if (c !== true && c !== false) out.push('availability.chinaUsable');
  return out;
}

let shown = 0;
for (const d of items) {
  const u = unknownKeys(d);
  if (u.length < 3) continue;
  const text = extract.recordText(d);
  const hasNeg = /无需|不需要|不用|不必|没有|not|no |without|never|none|excluded/i.test(text);
  const hasNumber = /\d/.test(text);
  console.log('=== ' + d.id + ' | ' + d.vendor + ' | ' + d.title + ' | unknown=' + u.length + ' neg=' + (hasNeg ? 1 : 0) + ' num=' + (hasNumber ? 1 : 0) + ' textlen=' + text.length);
  console.log('    audience=' + JSON.stringify(d.audience) + ' benefit=' + JSON.stringify(d.benefitType) + ' elig=' + JSON.stringify(d.eligibilityDetail) + ' claim=' + JSON.stringify(d.claimRequirements) + ' avail=' + JSON.stringify(d.availability));
  if (hasNeg && shown < 6) { console.log('    TEXT:\n' + text.split('\n').map(l => '      ' + l).join('\n')); shown++; }
  if (shown >= 6) break;
}
