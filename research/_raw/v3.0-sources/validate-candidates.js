#!/usr/bin/env node
/**
 * A3 候选清单的**真实 schema 试算**（研究用，不写任何生产数据）。
 *
 * 做三件事，全部在临时目录里：
 *   1. providers.json + providerRegistrations → 临时 provider 表（并用真实校验器校验）；
 *   2. curated_plans.json + codingPlans → 临时文件 → `loadCuratedPlans()`（真实构造器 + 引文审计）；
 *   3. curated_api_plans.json + apiPlans → 临时文件 → `loadCuratedApiPlans()`（同上）。
 *
 * 只要有一处问题就非 0 退出 —— 这样"移交 registry-curator 的候选条目"不是一句口头保证，
 * 而是先用生产同一套校验器跑通过的结果。
 *
 * 用法：node research/_raw/v3.0-sources/validate-candidates.js
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const planSchema = require(path.join(ROOT, 'scripts', 'lib', 'plan-schema'));
const apiPlanSchema = require(path.join(ROOT, 'scripts', 'lib', 'api-plan-schema'));
const providers = require(path.join(ROOT, 'scripts', 'lib', 'providers'));

const CANDIDATES = path.join(ROOT, 'research', 'v3.0-adopted-candidates.json');
const PROVIDERS_FILE = path.join(ROOT, 'scripts', 'data', 'providers.json');
const CURATED_PLANS = path.join(ROOT, 'scripts', 'data', 'curated_plans.json');
const CURATED_API_PLANS = path.join(ROOT, 'scripts', 'data', 'curated_api_plans.json');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function main() {
  const candidates = readJson(CANDIDATES);
  const baseProviders = readJson(PROVIDERS_FILE);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'a3-candidates-'));

  // ---- 1. provider 表 ----------------------------------------------------
  const mergedProviders = { ...baseProviders };
  const providerProblems = [];
  for (const entry of candidates.providerRegistrations) {
    const { key, reason, ...fields } = entry;
    if (mergedProviders[key]) {
      // t1 可能已经登记过：只保留盘上那条，额外别名并入（不覆盖 t1 的决定）
      mergedProviders[key] = {
        ...fields,
        ...mergedProviders[key],
        aliases: [...new Set([...(mergedProviders[key].aliases || []), ...(fields.aliases || [])])]
      };
      continue;
    }
    mergedProviders[key] = fields;
  }
  // 临时表补上 t1 负责登记的两家（若盘上还没有），否则引用它们的记录会被判"未登记"
  const T1_EXPECTED = {
    volcengine: { name: '火山引擎', slug: 'volcengine', aliases: ['火山引擎', '火山引擎(字节跳动)', '火山方舟', 'volcengine'], logo: null, vendorKey: 'volcengine' },
    baidu: { name: '百度智能云', slug: 'baidu-ai-cloud', aliases: ['百度智能云', '百度', 'baidu', 'baidu ai cloud', '百度千帆', '千帆'], logo: null, vendorKey: 'baidu' }
  };
  for (const [key, entry] of Object.entries(T1_EXPECTED)) {
    if (mergedProviders[key]) {
      mergedProviders[key] = { ...entry, ...mergedProviders[key], aliases: [...new Set([...(mergedProviders[key].aliases || []), ...entry.aliases])] };
    } else {
      mergedProviders[key] = entry;
    }
  }
  providerProblems.push(...providers.validateProviderTable(providers.withoutMeta(mergedProviders)));
  providerProblems.push(...providers.validateSlugAgreement(providers.withoutMeta(mergedProviders), providers.loadVendorSlugs()));

  const providerFile = path.join(tmp, 'providers.json');
  fs.writeFileSync(providerFile, `${JSON.stringify(mergedProviders, null, 2)}\n`);
  const providerTable = providers.load({ file: providerFile }).table;

  // 本清单里出现的每一个 provider 串都必须能被**精确**解析（这正是身份层的判据）
  const usedProviderStrings = new Set();
  for (const plan of candidates.codingPlans) usedProviderStrings.add(plan.provider);
  for (const plan of candidates.apiPlans) usedProviderStrings.add(plan.provider);
  for (const raw of usedProviderStrings) {
    if (!providers.resolveProvider(raw, providerTable)) {
      providerProblems.push(`候选记录里的 provider「${raw}」解析不到任何 provider key`);
    }
  }

  // ---- 2. coding plans --------------------------------------------------
  // 幂等：registry-curator 落盘之后，同一条候选**不应被重复追加**。
  // 身份用生产自己的 id 构造器算（`kind|provider|planNameKey|period`），与盘上逐条比对。
  const diskPlans = readJson(CURATED_PLANS);
  const diskPlanIds = new Set(diskPlans.map(raw => {
    const resolved = providers.resolveProvider(raw.provider, providerTable);
    return planSchema.makePlanId({
      kind: raw.kind || 'coding',
      provider: resolved ? resolved.key : String(raw.provider || '').toLowerCase(),
      planName: raw.planName,
      period: raw.billing && raw.billing.period
    });
  }));
  const landedPlans = [];
  const newPlans = candidates.codingPlans.filter(raw => {
    const resolved = providers.resolveProvider(raw.provider, providerTable);
    const id = planSchema.makePlanId({
      kind: raw.kind || 'coding',
      provider: resolved ? resolved.key : String(raw.provider || '').toLowerCase(),
      planName: raw.planName,
      period: raw.billing && raw.billing.period
    });
    if (diskPlanIds.has(id)) { landedPlans.push(raw.planName); return false; }
    return true;
  });

  const plansFile = path.join(tmp, 'curated_plans.json');
  const plans = [...diskPlans, ...newPlans];
  fs.writeFileSync(plansFile, `${JSON.stringify(plans, null, 2)}\n`);
  const plansResult = planSchema.loadCuratedPlans({ file: plansFile, providerTable });

  // ---- 3. api plans -----------------------------------------------------
  const diskApi = readJson(CURATED_API_PLANS);
  const diskApiIds = new Set(diskApi.map(raw => {
    const resolved = providers.resolveProvider(raw.provider, providerTable);
    return apiPlanSchema.makeApiPlanId({
      provider: resolved ? resolved.key : String(raw.provider || '').toLowerCase(),
      planName: raw.planName,
      channel: raw.channel
    });
  }));
  const landedApi = [];
  const newApi = candidates.apiPlans.filter(raw => {
    const resolved = providers.resolveProvider(raw.provider, providerTable);
    const id = apiPlanSchema.makeApiPlanId({
      provider: resolved ? resolved.key : String(raw.provider || '').toLowerCase(),
      planName: raw.planName,
      channel: raw.channel
    });
    if (diskApiIds.has(id)) { landedApi.push(raw.planName); return false; }
    return true;
  });

  const apiFile = path.join(tmp, 'curated_api_plans.json');
  const apiPlans = [...diskApi, ...newApi];
  fs.writeFileSync(apiFile, `${JSON.stringify(apiPlans, null, 2)}\n`);
  const apiResult = apiPlanSchema.loadCuratedApiPlans({ file: apiFile, providerTable });

  // ---- 报告 -------------------------------------------------------------
  console.log('A3 候选清单真实 schema 试算（临时目录 %s）', tmp);
  console.log(`  provider 表：新增/核对 ${candidates.providerRegistrations.length} 条，问题 ${providerProblems.length} 处`);
  providerProblems.forEach(problem => console.log(`    - ${problem}`));

  console.log(`  curated_plans：${diskPlans.length} → ${plans.length} 条，可用 ${plansResult.plans.length} 条`);
  console.log(`    已在盘上（跳过重复追加）${landedPlans.length} 条${landedPlans.length ? `：${landedPlans.join(' / ')}` : ''}`);
  console.log(`    本次新增 ${newPlans.length} 条`);
  console.log(`    构造问题 ${plansResult.problems.length} 处，引文被丢弃 ${plansResult.evidenceDropped.length} 处`);
  plansResult.problems.forEach(problem => console.log(`    - #${problem.index} ${problem.planName || ''} ${problem.reason}`));
  plansResult.evidenceDropped.forEach(item => console.log(`    - #${item.index} ${item.planName} 引文丢弃：${item.reason}`));

  console.log(`  curated_api_plans：${diskApi.length} → ${apiPlans.length} 条，可用 ${apiResult.plans.length} 条`);
  console.log(`    已在盘上（跳过重复追加）${landedApi.length} 条${landedApi.length ? `：${landedApi.join(' / ')}` : ''}`);
  console.log(`    本次新增 ${newApi.length} 条`);
  console.log(`    构造问题 ${apiResult.problems.length} 处，引文被丢弃 ${apiResult.evidenceDropped.length} 处`);
  apiResult.problems.forEach(problem => console.log(`    - #${problem.index} ${problem.planName || ''} ${problem.reason}`));
  apiResult.evidenceDropped.forEach(item => console.log(`    - #${item.index} ${item.planName} 引文丢弃：${item.reason}`));

  const failed = providerProblems.length + plansResult.problems.length + plansResult.evidenceDropped.length
    + apiResult.problems.length + apiResult.evidenceDropped.length;
  if (failed) {
    console.error(`\n❌ 试算失败：${failed} 处问题。候选清单**不能**原样移交。`);
    return 1;
  }
  console.log('\n✅ 试算通过：候选清单可以原样追加到 curated_plans.json / curated_api_plans.json。');
  return 0;
}

process.exit(main());
