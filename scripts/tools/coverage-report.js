#!/usr/bin/env node
/**
 * 数据覆盖报告（v3.0 Stage C4 / 题面 §C4）。
 *
 * 这个脚本回答的是「我们现在到底覆盖了什么、缺口在哪里」——它是**只读报告**，
 * 不改任何数据、不联网、不读墙上时钟（今天只用于显示，不参与判定）。
 *
 * 题面 §C4 要求至少输出：
 *   Deals : provider 数 · 当前优惠数
 *   Coding: provider 数 · plan 数
 *   API   : provider 数 · pricing records · model pricing items
 * 以及四类交叉缺口：
 *   有 Deals 无 Plans 的 provider ·
 *   有 Plans 无 Deals 的 provider ·
 *   有 API Pricing 无 Model Registry 映射的模型 ·
 *   重要候选但尚未采信的 provider
 *
 * 真实数据原则：缺口按盘上事实输出，**空就报空**（例如 Model Registry 还没落盘时，
 * 报告会明确说"注册表层不存在"，而不是把 0 当成"全都映射好了"）。
 * 候选未采信来自 `research/v3.0-source-candidates.json`（A3 的联网取证登记表），
 * 每一行都必须带齐题面 §C3 的字段，缺一项即报告红 —— 否则"检查过但没收录"的过程又丢了。
 *
 * 用法：
 *   node scripts/tools/coverage-report.js
 *   node scripts/tools/coverage-report.js --json     # 额外输出机器可读 JSON（同一份数字）
 */

'use strict';

const fs = require('fs');
const path = require('path');

const { load: loadRenderCore } = require('../lib/render-core');
const providers = require('../lib/providers');
const registry = require('../lib/model-registry');
const { todayCN } = require('../lib/schema');

const ROOT = path.join(__dirname, '..', '..');

/** `--models=` / `--links=` 只用于**验证报告本身**（Stage D 的关系层尚未落盘时，用它喂一份临时文件
 *  来确认「有映射」分支真的走得通）。不传就是盘上的真实路径。 */
const overrideOf = name => {
  const hit = process.argv.find(arg => arg.startsWith(`--${name}=`));
  if (!hit) return null;
  return path.resolve(hit.slice(`--${name}=`.length));
};

const DEALS_FILE = path.join(ROOT, 'deals.json');
const PLANS_FILE = path.join(ROOT, 'plans.json');
const API_PLANS_FILE = path.join(ROOT, 'api-plans.json');
const MODELS_FILE = overrideOf('models') || path.join(ROOT, 'scripts', 'data', 'models.json');
const REGISTRY_LINKS_FILE = overrideOf('links') || path.join(ROOT, 'scripts', 'data', 'model-registry-links.json');
const CANDIDATES_FILE = overrideOf('candidates') || path.join(ROOT, 'research', 'v3.0-source-candidates.json');
const CANDIDATES_MD = overrideOf('candidates-md') || path.join(ROOT, 'research', 'v3.0-source-candidates.md');

/** 题面 §C3 要求候选登记表逐条给出的字段 —— 少一个字段这条记录就不算留档 */
const CANDIDATE_REQUIRED_FIELDS = [
  'provider',
  'url',
  'checkedAt',
  'failedReason',
  'isJs',
  'requiresLogin',
  'dynamicPagination',
  'pageOffline',
  'incomplete'
];

const problems = [];

function readJson(file, label) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    problems.push(`${label} 读取失败：${error.message}`);
    return null;
  }
}

/** 确定性排序：先按条数降序，再按名称升序 —— 两次运行输出逐字节一致 */
function sortRows(rows) {
  return rows.sort((a, b) => (b.count - a.count) || String(a.name).localeCompare(String(b.name), 'zh-Hans-CN'));
}

function uniqSorted(list) {
  return [...new Set(list)].sort((a, b) => String(a).localeCompare(String(b), 'zh-Hans-CN'));
}

/**
 * 取关系层里的记录数组。
 *
 * `model-registry-links.json` 由 Stage D（registry-curator）落盘，它的顶层包装键在编写本报告时
 * 还没有定死。这里**不猜一个键名然后静默当成空**（那会把"映射全覆盖"和"文件读不懂"混为一谈）：
 * 先认几个常见键名，再退回"文件里恰好只有一个数组"的情形，都不成立就返回 null（= 读不到）。
 */
function relationsOf(doc) {
  if (Array.isArray(doc)) return doc;
  if (!doc || typeof doc !== 'object') return null;
  for (const key of ['links', 'relations', 'mappings', 'entries', 'modelRegistryLinks']) {
    if (Array.isArray(doc[key])) return doc[key];
  }
  const arrays = Object.values(doc).filter(Array.isArray);
  return arrays.length === 1 ? arrays[0] : null;
}

function main() {
  const jsonFlag = process.argv.includes('--json');
  const today = todayCN();

  const dealsDoc = readJson(DEALS_FILE, 'deals.json');
  const plansDoc = readJson(PLANS_FILE, 'plans.json');
  const apiDoc = readJson(API_PLANS_FILE, 'api-plans.json');
  if (!dealsDoc || !plansDoc || !apiDoc) {
    console.error('❌ 缺少 deals.json / plans.json / api-plans.json，无法生成覆盖报告。');
    return 1;
  }

  const core = loadRenderCore();
  const providerTable = providers.load().table;

  /* ---------------- Deals ---------------- */
  const deals = Array.isArray(dealsDoc.deals) ? dealsDoc.deals : [];
  const dealRows = deals.filter(deal => deal.type === 'deal');
  const toolRows = deals.filter(deal => deal.type !== 'deal');
  const expiredDeals = dealRows.filter(deal => deal.expiresAt && String(deal.expiresAt).slice(0, 10) < today);
  const currentDeals = dealRows.filter(deal => !expiredDeals.includes(deal));

  const dealVendorCount = new Map();
  for (const deal of dealRows) {
    const vendor = core.vendorOf(deal) || {};
    const key = vendor.key || '(未识别)';
    const entry = dealVendorCount.get(key) || { key, name: vendor.name || key, count: 0 };
    entry.count += 1;
    dealVendorCount.set(key, entry);
  }
  const dealVendorRows = sortRows([...dealVendorCount.values()]);

  const dealProviderKeys = new Set([...dealVendorCount.keys()].filter(key => key !== '(未识别)'));

  /* ---------------- Coding Plans ---------------- */
  const plans = Array.isArray(plansDoc.plans) ? plansDoc.plans : [];
  const planProviderCount = new Map();
  for (const plan of plans) {
    const key = plan.provider;
    const entry = planProviderCount.get(key) || { key, name: providers.providerNameOf(key, providerTable), count: 0 };
    entry.count += 1;
    planProviderCount.set(key, entry);
  }
  const planProviderRows = sortRows([...planProviderCount.values()]);
  const planProviderKeys = new Set(planProviderRows.map(row => row.key));

  /* ---------------- API Pricing ---------------- */
  const apiPlans = Array.isArray(apiDoc.plans) ? apiDoc.plans : [];
  const apiProviderCount = new Map();
  let modelPricingItems = 0;
  const apiModelKeys = new Set();
  for (const plan of apiPlans) {
    const key = plan.provider;
    const entry = apiProviderCount.get(key) || { key, name: providers.providerNameOf(key, providerTable), count: 0 };
    entry.count += 1;
    apiProviderCount.set(key, entry);
    for (const model of (Array.isArray(plan.models) ? plan.models : [])) {
      modelPricingItems += 1;
      apiModelKeys.add(model.modelKey);
    }
  }
  const apiProviderRows = sortRows([...apiProviderCount.values()]);
  const apiProviderKeys = new Set(apiProviderRows.map(row => row.key));

  /* ---------------- Model Registry ---------------- */
  //
  // ⚠️ 相位差教训（2026-10-02，独立审查员实测抓到）：
  // `scripts/data/models.json` 是**来源层**（`{_note, _rules, <slug>: {...}}`），
  // 而发布产物才是**派生形状**（`{schemaVersion, updatedAt, count, models: []}`）。
  // 本报告原先只认后者（`Array.isArray(doc.models)`），来源层明明已落盘却被判成
  // "尚未落盘（Stage D 未完成）"—— 报告对读者说了假话，而自检仍报 0 处问题。
  // 现在一律走 `scripts/lib/model-registry.js` 的 load()/loadLinks()（唯一权威解析），
  // 同时保留 `--models=` 覆盖口（喂派生产物形状的临时文件时，走 models 数组分支）。
  const registryLoaded = registry.load(MODELS_FILE);
  const registryModels = Array.isArray(registryLoaded.doc && registryLoaded.doc.models)
    ? registryLoaded.doc.models
    : Object.entries(registryLoaded.table || {}).map(([slug, entry]) => Object.assign({ slug }, entry));
  const registryMissing = registryModels.length === 0;
  if (registryLoaded.broken) problems.push(`scripts/data/models.json 解析失败：${registryLoaded.broken}`);
  // 牙（2026-10-02 加）：文件在、形状合法，却一条模型都读不出来 ⇒ 红。
  // 为什么需要它：本报告曾因"只认派生形状"把 44 个模型的来源层判成"尚未落盘"，
  // 而当时自检是 0 处问题 —— 报告撒谎可以完全静默。这条断言把那种相位差变成硬红。
  if (!registryLoaded.missing && !registryLoaded.broken && registryModels.length === 0) {
    problems.push('scripts/data/models.json 存在且顶层形状合法，却没有读出任何模型条目 —— 报告层与模型注册表的形状不一致（禁止把"读不懂"当成"没有"）。');
  }
  const registryLinksLoaded = registry.loadLinks(REGISTRY_LINKS_FILE);
  if (registryLinksLoaded.broken) problems.push(`scripts/data/model-registry-links.json 解析失败：${registryLinksLoaded.broken}`);
  const relations = relationsOf(registryLinksLoaded.doc);
  const linksMissing = relations === null;

  const mappedApiKeys = new Set();
  if (!linksMissing) {
    for (const link of relations) {
      if (link && link.apiPlanId && link.modelKey) mappedApiKeys.add(`${link.apiPlanId}::${link.modelKey}`);
    }
  }

  const unmappedModels = [];
  for (const plan of apiPlans) {
    for (const model of (Array.isArray(plan.models) ? plan.models : [])) {
      if (mappedApiKeys.has(`${plan.id}::${model.modelKey}`)) continue;
      unmappedModels.push({
        provider: plan.provider,
        providerName: providers.providerNameOf(plan.provider, providerTable),
        planId: plan.id,
        planName: plan.planName,
        channel: plan.channel,
        modelKey: model.modelKey,
        name: model.name
      });
    }
  }

  /* ---------------- 候选未采信 ---------------- */
  const candidatesDoc = readJson(CANDIDATES_FILE, 'research/v3.0-source-candidates.json');
  const candidates = candidatesDoc && Array.isArray(candidatesDoc.candidates) ? candidatesDoc.candidates : [];
  if (!candidatesDoc) {
    problems.push('缺少 research/v3.0-source-candidates.json —— 题面 §C3 要求"检查过但没收录"必须留档，不能丢。');
  } else {
    candidates.forEach((candidate, index) => {
      const where = `research/v3.0-source-candidates.json 第 ${index + 1} 条（${candidate && candidate.provider ? candidate.provider : '未署名'}）`;
      for (const field of CANDIDATE_REQUIRED_FIELDS) {
        if (!(field in (candidate || {}))) problems.push(`${where} 缺少 §C3 必填字段 ${field}`);
      }
      if (!candidate || !candidate.url) problems.push(`${where} 缺少 url`);
    });
  }
  if (!fs.existsSync(CANDIDATES_MD)) {
    problems.push('缺少 research/v3.0-source-candidates.md —— 候选未采信的人工可读报告未落盘。');
  } else {
    const md = fs.readFileSync(CANDIDATES_MD, 'utf8');
    for (const candidate of candidates) {
      if (candidate && candidate.provider && !md.includes(candidate.provider)) {
        problems.push(`research/v3.0-source-candidates.md 里没有出现候选 provider「${candidate.provider}」—— 结构化登记表与报告已不同步。`);
      }
    }
  }
  const notAdopted = candidates.filter(candidate => candidate && candidate.decision === 'not_adopted');
  const adopted = candidates.filter(candidate => candidate && candidate.decision === 'adopted');
  const notAdoptedProviders = uniqSorted(notAdopted.map(candidate => candidate.provider));

  /* ---------------- 交叉缺口 ---------------- */
  const dealsWithoutPlans = uniqSorted([...dealProviderKeys].filter(key => !planProviderKeys.has(key)));
  const plansWithoutDeals = uniqSorted([...planProviderKeys].filter(key => !dealProviderKeys.has(key)));
  const apiWithoutRegistryMapping = unmappedModels.length;

  /* ---------------- 一致性自检（红 = 报告不可信） ---------------- */
  if (Number.isFinite(plansDoc.count) && plansDoc.count !== plans.length) {
    problems.push(`plans.json 的 count=${plansDoc.count} 与 plans 数组长度 ${plans.length} 不一致`);
  }
  if (Number.isFinite(apiDoc.count) && apiDoc.count !== apiPlans.length) {
    problems.push(`api-plans.json 的 count=${apiDoc.count} 与 plans 数组长度 ${apiPlans.length} 不一致`);
  }
  for (const plan of plans) {
    if (!providers.resolveProvider(plan.provider, providerTable)) {
      problems.push(`plans.json 的 provider「${plan.provider}」在 providers.json 里没有登记（身份未归一）`);
    }
  }
  for (const plan of apiPlans) {
    if (!providers.resolveProvider(plan.provider, providerTable)) {
      problems.push(`api-plans.json 的 provider「${plan.provider}」在 providers.json 里没有登记（身份未归一）`);
    }
  }

  /* ---------------- 输出 ---------------- */
  const out = [];
  const line = text => out.push(text);
  const kv = (label, value, note) => line(`  ${String(label).padEnd(26)} ${String(value).padStart(6)}${note ? `   ${note}` : ''}`);

  line('======================================================================');
  line('数据覆盖报告（v3.0 Stage C4 / 题面 §C4）');
  line('======================================================================');
  line(`生成日期            : ${today}`);
  line(`deals.json.updatedAt: ${dealsDoc.updatedAt}`);
  line(`plans.json.updatedAt: ${plansDoc.updatedAt}`);
  line(`api-plans.json      : ${apiDoc.updatedAt}`);
  line('');

  line('── Deals ────────────────────────────────────────────────────────────');
  kv('provider 数', dealVendorRows.length, 'deals 侧归一后的厂商键数（不含未识别）');
  kv('当前优惠数', currentDeals.length, `type=deal 且未过期（过期 ${expiredDeals.length} 条）`);
  kv('工具条目数', toolRows.length, 'type=tool，不计入"当前优惠数"');
  line('');

  line('── Coding Plans ─────────────────────────────────────────────────────');
  kv('provider 数', planProviderRows.length);
  kv('plan 数', plans.length);
  line('');

  line('── API Pricing ──────────────────────────────────────────────────────');
  kv('provider 数', apiProviderRows.length);
  kv('pricing records', apiPlans.length, 'api-plans.json 的记录条数');
  kv('model pricing items', modelPricingItems, `去重 modelKey ${apiModelKeys.size} 个`);
  line('');

  line('── Model Registry ───────────────────────────────────────────────────');
  if (registryMissing) {
    line('  models.json 读不到（文件缺失或顶层形状无法解析）—— 下面的"未映射模型"是全部 API 模型，不是零。');
  } else {
    kv('registry 模型数', registryModels.length, '来源层 scripts/data/models.json 的模型条目数');
  }
  if (linksMissing) {
    line('  model-registry-links.json 读不到（文件缺失或顶层形状无法解析）—— 映射覆盖按 0 计算。');
  } else {
    kv('registry 映射条数', relations.length);
  }
  kv('已映射 API 模型条目', modelPricingItems - apiWithoutRegistryMapping, `共 ${modelPricingItems} 条`);
  line('');

  line('── 缺口 1：有 Deals 无 Plans 的 provider ────────────────────────────');
  if (!dealsWithoutPlans.length) line('  （无）');
  dealsWithoutPlans.forEach(key => line(`  · ${key}（${providers.providerNameOf(key, providerTable)}）`));
  line('');

  line('── 缺口 2：有 Plans 无 Deals 的 provider ────────────────────────────');
  if (!plansWithoutDeals.length) line('  （无）');
  plansWithoutDeals.forEach(key => line(`  · ${key}（${providers.providerNameOf(key, providerTable)}）   ${planProviderCount.get(key).count} 条套餐`));
  line('');

  line('── 缺口 3：有 API Pricing 无 Model Registry 映射的模型 ──────────────');
  if (!unmappedModels.length) line('  （无）');
  unmappedModels
    .sort((a, b) => [a.provider, a.planId, a.modelKey].join('|').localeCompare([b.provider, b.planId, b.modelKey].join('|')))
    .forEach(row => line(`  · ${row.providerName} / ${row.planName}（${row.channel}） → ${row.modelKey}（${row.name}）`));
  line('');

  line('── 缺口 4：重要候选但尚未采信的 provider ────────────────────────────');
  if (!notAdopted.length) line('  （无）');
  for (const provider of notAdoptedProviders) {
    const rows = notAdopted.filter(candidate => candidate.provider === provider);
    line(`  · ${provider}   ${rows.length} 个来源未采信`);
    for (const row of rows) {
      line(`      ${row.url}`);
      line(`      检查日期 ${row.checkedAt} · JS=${row.isJs} 登录=${row.requiresLogin} 动态分页=${row.dynamicPagination} 已下线=${row.pageOffline} 信息不全=${row.incomplete}`);
      line(`      失败原因：${row.failedReason}`);
    }
  }
  line('');

  line('── 已采信并移交 registry-curator 落盘的候选 ─────────────────────────');
  if (!adopted.length) line('  （无）');
  for (const row of adopted) {
    line(`  · ${row.provider}  ${row.url}   ${row.checkedAt}${row.notes ? `   ${row.notes}` : ''}`);
  }
  line('');

  line('──────────────────────────────────────────────────────────────────────');
  line(`候选登记表：${candidates.length} 条（已采信 ${adopted.length} / 未采信 ${notAdopted.length}）`);
  line(`报告自检问题：${problems.length} 处`);

  console.log(out.join('\n'));

  if (problems.length) {
    console.error('\n❌ 覆盖报告自检失败：');
    for (const problem of problems) console.error(`  - ${problem}`);
    return 1;
  }

  if (jsonFlag) {
    const payload = {
      generatedAt: today,
      deals: {
        providers: dealVendorRows.length,
        currentDeals: currentDeals.length,
        expiredDeals: expiredDeals.length,
        tools: toolRows.length,
        providerRows: dealVendorRows
      },
      coding: { providers: planProviderRows.length, plans: plans.length, providerRows: planProviderRows },
      api: {
        providers: apiProviderRows.length,
        pricingRecords: apiPlans.length,
        modelPricingItems,
        distinctModelKeys: apiModelKeys.size,
        providerRows: apiProviderRows
      },
      registry: {
        registryPresent: !registryMissing,
        linksPresent: !linksMissing,
        unmappedModels
      },
      gaps: { dealsWithoutPlans, plansWithoutDeals, unmappedModelCount: unmappedModels.length, notAdoptedProviders },
      candidates: { total: candidates.length, adopted: adopted.length, notAdopted: notAdopted.length }
    };
    console.log('\nJSON:');
    console.log(JSON.stringify(payload, null, 2));
  }

  console.log('\n✅ 覆盖报告自检通过（0 处问题）。');
  return 0;
}

process.exit(main());
