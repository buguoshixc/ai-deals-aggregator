#!/usr/bin/env node
/** t11 辅助（只读）：把四路 research 里"要落盘的事实"抽成一张可直接核对的清单。 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const R = name => JSON.parse(fs.readFileSync(path.join(__dirname, name), 'utf8'));

const fp = R('firstparty.json');
const inf = R('inference.json');
const coding = R('coding.json');

console.log('================ A. 新增 provider 身份候选 ================');
for (const v of fp.vendors) {
  const h = v.handoffToDataIntegrator || {};
  console.log(`\n[firstparty] ${v.id} | ruling=${v.ruling} | add=${h.addToProvidersJson} | key=${h.providerKeyCandidate || h.providerKeyExists || v.id}`);
  console.log(`   name=${h.providerNameCandidate || '(已有)'} slug=${h.providerSlugCandidate || '-'} vendorKey=${h.vendorKeyCandidate || '(?)'} domains=${JSON.stringify(h.officialDomainsCandidate || v.officialDomainsCandidate)}`);
  console.log(`   域白名单警告: ${(h.officialDomainsNote || '').slice(0, 120)}`);
}
console.log('\n--- inference 四家的身份字段 ---');
for (const [key, v] of Object.entries(inf.providers)) {
  const d = inf.providerDecisions[key] || {};
  console.log(`\n[inference] ${key} | ${v.displayName} | verdict=${d.verdict}`);
  console.log(`   vendorKey=${JSON.stringify(d.vendorKeySuggestion)} | domains=${JSON.stringify(d.officialDomainsSuggestion)} | schema=${d.schemaVerdict}`);
  console.log(`   unit=${JSON.stringify(v.unit)} pages=${JSON.stringify(v.officialPricingPages).slice(0, 160)}`);
  console.log(`   freeTier=${JSON.stringify(v.freeTier).slice(0, 200)}`);
  console.log(`   limits=${JSON.stringify(v.limits).slice(0, 160)}`);
  console.log(`   publishedRates: ${JSON.stringify(v.publishedRates).slice(0, 400)}`);
  console.log(`   dimensions: ${JSON.stringify(v.dimensions).slice(0, 300)}`);
}

console.log('\n================ B. providers.json 里缺的身份 + 官方域登记位置 ================');
const providers = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'data', 'providers.json'), 'utf8'));
const officialUrls = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'data', 'official_urls.json'), 'utf8'));
const want = ['xai', 'mistral', 'cohere', 'baichuan', 'stepfun', 'sensetime', 'ai360', 'groq', 'together', 'fireworks', 'cerebras'];
for (const key of want) {
  const inB = Object.prototype.hasOwnProperty.call(providers, key);
  const inA = Object.prototype.hasOwnProperty.call(officialUrls._officialDomains || {}, key);
  console.log(`  ${key}: providers.json=${inB ? '有' : '**缺**'} | official_urls._officialDomains=${inA ? JSON.stringify(officialUrls._officialDomains[key]) : '无'}`);
}

console.log('\n================ C. 可落盘的 API 记录候选（inference 侧）================');
for (const rec of inf.recommendedRecordsForT11) {
  console.log(`\n  ${rec.provider} | ${rec.planNameSuggestion} | channel=${rec.channel} | unit=${rec.pricing && rec.pricing.unit} | ${rec.pricing && rec.pricing.currency}`);
  console.log(`     officialUrl=${rec.officialUrl}`);
  console.log(`     modelKeys=${JSON.stringify(rec.modelKeys).slice(0, 200)}`);
  if (rec.optional) console.log(`     ⚠️ optional（条件：${rec.condition}）`);
  if (rec.notesMustCarry) console.log(`     notes: ${JSON.stringify(rec.notesMustCarry).slice(0, 220)}`);
}

console.log('\n================ D. Coding 套餐候选 ================');
console.log('adopted: ' + JSON.stringify(coding.summary && coding.summary.adopted || coding.candidates && Object.keys(coding.candidates)));
console.log('\n--- coding.json summary 全文 ---');
console.log(JSON.stringify(coding.summary, null, 1).slice(0, 2500));
