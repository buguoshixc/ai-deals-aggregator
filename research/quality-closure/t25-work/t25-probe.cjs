/**
 * T25 探针（临时工具，放 .qc-registry/）：把逐格对账实现需要用到的契约表与页面行结构原样 dump 出来，
 * 便于把「独立第二实现」写准（而不是猜格式）。
 *
 * 用法：node .qc-registry/t25-probe.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const apiSchema = require(path.join(ROOT, 'scripts', 'lib', 'api-plan-schema'));
const providers = require(path.join(ROOT, 'scripts', 'lib', 'providers'));

console.log('API_CHANNEL_LABEL =', JSON.stringify(apiSchema.API_CHANNEL_LABEL, null, 0));
console.log('API_UNIT_LABEL =', JSON.stringify(apiSchema.API_UNIT_LABEL, null, 0));
console.log('MODEL_VARIANT_LABEL =', JSON.stringify(apiSchema.MODEL_VARIANT_LABEL, null, 0));

const table = providers.load().table;
console.log('provider keys =', Object.keys(table).length);
for (const key of Object.keys(table).slice(0, 3)) {
  console.log(`  provider[${key}] =`, JSON.stringify(table[key]).slice(0, 140));
}
console.log('providers.providerNameOf =', typeof providers.providerNameOf);

const html = fs.readFileSync(path.join(ROOT, 'dist', 'models', 'glm-4.5v', 'index.html'), 'utf8');
const rows = html.match(/<tr class="mapirow"[\s\S]*?<\/tr>/g) || [];
console.log('glm-4.5v rows =', rows.length);
rows.forEach((row, index) => {
  console.log(`--- row ${index} ---`);
  console.log(row.replace(/\s+/g, ' '));
});

// 单位文本与价格文本在真实页面上的样子（用于校准第二实现）
const plans = JSON.parse(fs.readFileSync(path.join(ROOT, 'api-plans.json'), 'utf8')).plans;
console.log('--- api-plans pricing.unit 取值 ---');
console.log([...new Set(plans.map(plan => `${plan.pricing && plan.pricing.currency}/${plan.pricing && plan.pricing.unit}`))].join(' , '));
console.log('--- 所有出现过的 currency ---');
console.log([...new Set(plans.map(plan => plan.pricing && plan.pricing.currency))].join(' , '));
