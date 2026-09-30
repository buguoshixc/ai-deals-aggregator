'use strict';
// 临时探查脚本（标注完成后删除）：找「三态为 unknown，但记录文本里有否定线索」的字段，用于构造 falseCertainty fixture。
const store = require('../../lib/store');
const extract = require('../../ai/extract');
const audience = require('../../lib/audience');

const deals = store.loadStore().deals;
const NEG = /无需|不需要|不用|不必|没有|not |no |without|never|none|excluded/i;
for (const d of deals) {
  const text = extract.recordText(d);
  if (!NEG.test(text)) continue;
  const unknown = [];
  for (const k of audience.CLAIM_KEYS) {
    const v = d.claimRequirements ? d.claimRequirements[k] : undefined;
    if (v !== true && v !== false) unknown.push('claimRequirements.' + k);
  }
  for (const k of audience.ELIGIBILITY_KEYS) {
    const v = d.eligibilityDetail ? d.eligibilityDetail[k] : undefined;
    if (v !== true && v !== false) unknown.push('eligibilityDetail.' + k);
  }
  const c = d.availability ? d.availability.chinaUsable : undefined;
  if (c !== true && c !== false) unknown.push('availability.chinaUsable');
  if (!unknown.length) continue;
  const pos = text.search(NEG);
  console.log('=== ' + d.id + ' | ' + d.vendor + ' | ' + d.title);
  console.log('    unknown=' + unknown.join(','));
  console.log('    audience=' + JSON.stringify(d.audience) + ' benefit=' + JSON.stringify(d.benefitType) + ' elig=' + JSON.stringify(d.eligibilityDetail) + ' claim=' + JSON.stringify(d.claimRequirements) + ' avail=' + JSON.stringify(d.availability));
  console.log('    negation-context=' + JSON.stringify(text.slice(Math.max(0, pos - 60), pos + 60)));
}
