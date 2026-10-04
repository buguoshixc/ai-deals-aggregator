/**
 * T25 探针 2：把 UNKNOWN_* 常量与价格格式在真实数据上的形态 dump 出来（独立第二实现要用字面量）。
 * 用法：node .qc-registry/t25-probe2.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const modelsPage = require(path.join(ROOT, 'scripts', 'lib', 'models-page'));
const apiPlansPage = require(path.join(ROOT, 'scripts', 'lib', 'api-plans-page'));
const plansPage = require(path.join(ROOT, 'scripts', 'lib', 'plans-page'));

console.log('modelsPage.UNKNOWN_NUM =', JSON.stringify(modelsPage.UNKNOWN_NUM));
console.log('modelsPage.UNKNOWN_TEXT =', JSON.stringify(modelsPage.UNKNOWN_TEXT));
console.log('modelsPage.UNKNOWN_TRI =', JSON.stringify(modelsPage.UNKNOWN_TRI));
console.log('apiPlansPage.UNKNOWN_NUM =', JSON.stringify(apiPlansPage.UNKNOWN_NUM));
console.log('apiPlansPage.UNKNOWN_TEXT =', JSON.stringify(apiPlansPage.UNKNOWN_TEXT));
console.log('plansPage.CURRENCY_SYMBOL 导出 =', JSON.stringify(plansPage.CURRENCY_SYMBOL));
console.log('plansPage.formatNumber 导出 =', typeof plansPage.formatNumber);

// 真实数据上价格文本的形态（含整数 / 小数 / null / 0）
const apiPlans = JSON.parse(fs.readFileSync(path.join(ROOT, 'api-plans.json'), 'utf8')).plans;
const seen = new Set();
for (const plan of apiPlans) {
  for (const entry of plan.models || []) {
    const rates = entry.rates || {};
    for (const key of ['input', 'output', 'cachedInput', 'cacheWrite', 'cacheWriteLong', 'reasoning', 'batchInput', 'batchOutput']) {
      const value = rates[key];
      if (value === undefined) continue;
      seen.add(JSON.stringify(value));
    }
  }
}
console.log('rates 取值集合（去重） =', [...seen].sort().join(' , '));
const samples = [];
for (const plan of apiPlans) {
  for (const entry of plan.models || []) {
    const rates = entry.rates || {};
    for (const key of ['input', 'output', 'cachedInput']) {
      if (rates[key] === undefined) continue;
      samples.push(`${rates[key]}@${plan.pricing.currency} → ${JSON.stringify(apiPlansPage.priceText(rates[key], plan.pricing.currency))}`);
    }
  }
}
console.log('价格文本样本（前 12 个，去重） =');
console.log([...new Set(samples)].slice(0, 12).join('\n'));
console.log('unitTextOf 样本 =', apiPlans.map(plan => apiPlansPage.unitTextOf(plan)).filter((value, index, list) => list.indexOf(value) === index).join(' , '));
