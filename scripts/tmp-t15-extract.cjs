// t15 审计：抽取本轮"新增/变更"的数据面（只读，不改任何文件）
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const BASE = 'a4dd40f';

function show(name, doc) {
  console.log(`\n${'='.repeat(90)}\n${name}\n${'='.repeat(90)}`);
  console.log(JSON.stringify(doc, null, 2));
}

function changedFromBase(file) {
  try {
    const diff = execFileSync('git', ['diff', BASE, '--numstat', '--', file], { cwd: ROOT, encoding: 'utf8' }).trim();
    return diff || '(no diff)';
  } catch (error) { return `(git failed: ${error.message})`; }
}

const plans = JSON.parse(fs.readFileSync(path.join(ROOT, 'plans.json'), 'utf8'));
const apiPlans = JSON.parse(fs.readFileSync(path.join(ROOT, 'api-plans.json'), 'utf8'));
const providers = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/data/providers.json'), 'utf8'));
const targets = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/data/coverage-targets.json'), 'utf8'));
const models = JSON.parse(fs.readFileSync(path.join(ROOT, 'models.json'), 'utf8'));

console.log('### 计划记录（plans.json）:', (plans.plans || []).length);
console.log('### API 记录（api-plans.json / plans）:', (apiPlans.plans || []).length);
console.log('### provider keys:', Object.keys(providers).filter(key => !key.startsWith('_')).length);
console.log('### coverage targets:', (targets.targets || []).length);
console.log('### models:', models.models.length);

console.log('\n### numstat');
for (const file of ['scripts/data/providers.json', 'scripts/data/coverage-targets.json', 'scripts/data/models.json', 'scripts/data/api-plans.json', 'scripts/data/plans.json', 'plans.json', 'api-plans.json', 'models.json']) {
  console.log(' ', file, '=>', changedFromBase(file).replace(/\n/g, ' | '));
}

// 当前 provider 表（含官方域）
const providerRows = Object.entries(providers).filter(([key]) => !key.startsWith('_')).map(([key, value]) => ({
  key,
  name: value.name || value.displayName || null,
  officialDomains: value.officialDomains || null,
  vendorKey: value.vendorKey === undefined ? '(未写)' : value.vendorKey,
  type: value.type || null,
  note: (value.note || '').slice(0, 80)
}));
show('providers（当前，34 家）', providerRows);

// coverage targets
const targetRows = (targets.targets || []).map(target => ({
  provider: target.provider,
  developer: target.developer,
  intent: target.intent || target.coding || null,
  note: (target.note || '').slice(0, 100)
}));
show('coverage-targets（当前）', targetRows);

// 计划记录的紧凑表
const planRows = (plans.plans || []).map(plan => ({
  id: plan.id,
  provider: plan.provider,
  name: plan.name,
  price: plan.price,
  currency: plan.currency,
  period: plan.period || plan.billingPeriod,
  audience: plan.audience,
  officialUrl: plan.officialUrl,
  sourceUrl: plan.sourceUrl,
  supportedModels: (plan.supportedModels || []).map(model => `${model.name}[${model.role}]`).join(' · '),
  firstSeen: plan.firstSeen,
  lastSeen: plan.lastSeen,
  evidenceFields: (plan.evidence || []).map(item => item.field).join(','),
  note: (plan.note || '').slice(0, 70)
}));
show('plans（当前 37 条）', planRows);

// API 记录紧凑表
const apiRows = (apiPlans.plans || []).map(plan => ({
  id: plan.id,
  provider: plan.provider,
  name: plan.name,
  officialUrl: plan.officialUrl,
  sourceUrl: plan.sourceUrl,
  firstSeen: plan.firstSeen,
  lastSeen: plan.lastSeen,
  evidenceFields: (plan.evidence || []).map(item => `${item.field}@${item.sourceUrl}`).join(' | '),
  modelCount: (plan.models || []).length,
  models: (plan.models || []).map(model => `${model.modelKey}[${model.variant || '-'}]`).join(' · ').slice(0, 500)
}));
show('api-plans（当前）', apiRows);
