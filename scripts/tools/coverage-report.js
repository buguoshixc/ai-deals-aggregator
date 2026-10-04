#!/usr/bin/env node
/**
 * 数据覆盖报告（v3.0 Stage C4 / 题面 §C4；coverage-expansion-v1 起为 **v2**）。
 *
 * 这个脚本回答的是「我们现在到底覆盖了什么、缺口在哪里」——它是**只读报告**，
 * 不改任何数据、不联网、不读墙上时钟（今天只用于显示，不参与判定）。
 *
 * ## v2（coverage-expansion-v1）：从「盘上有什么」升级到「意图 vs 事实」
 *
 * v1 只能对**已经出现的数据**做除法：一家平台一条记录都没有时，它在报告里根本不存在。
 * v2 把 `scripts/data/coverage-targets.json`（唯一权威的覆盖意图层）读进来，由
 * `scripts/lib/coverage-targets.js` 派生七态（COVERED / PARTIAL / MISSING / DEFERRED /
 * UNVERIFIABLE / NOT_APPLICABLE / BLOCKED_SOURCE，**DEFERRED 永不算 MISSING**），并新增：
 *
 *   · Target Provider Universe（意图层的宇宙 + 身份层↔意图层双向对账）；
 *   · provider × 维度的分维度覆盖矩阵；
 *   · 真缺口清单（MISSING）与"有理由的缺口"清单（deferred / unverifiable /
 *     not-applicable / blocked-by-source-health）；
 *   · Current Model Coverage（声明的 current target 模型是否真的在 registry 里归属这家、
 *     unknown release dates、legacy/historical 保留情况）；
 *   · Source Health impact（声明的来源与 `scripts/data/source-health.json` 对账）；
 *   · Freshness 阈值与理由（策略模块落盘时读它的常量，没落盘就如实说"没落盘"）。
 *
 * **旧口径一个字都不改**：旧的五类交叉缺口、旧的 JSON 键全部保留（新内容进新的键），
 * 免得下游（CI、审阅、报告）因为一次升级而看不见原来的数字。
 * `--json` 两次运行逐字节一致（所有新数组都按确定性顺序输出）。
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
 * 缺口 3 的口径（2026-10-03）：按**展开后的计价条目** `(apiPlanId, modelKey, variant)` 数，
 * 通配映射（`variant: null`）只为它真实展开到的条目负责，不把整组算成已覆盖。
 * 它与 Coding 侧的"每一串都必须有结局"是**同一条原则**：任何一条计价条目没有被映射认领
 * ⇒ `validateLinks()` 报红 ⇒ 本报告自检问题非 0（报告不许比门禁好看）。
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
const coverageTargets = require('../lib/coverage-targets');
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
const REGISTRY_GAPS_FILE = overrideOf('gaps') || path.join(ROOT, 'scripts', 'data', 'model-registry-gaps.json');
const CANDIDATES_FILE = overrideOf('candidates') || path.join(ROOT, 'research', 'v3.0-source-candidates.json');
const CANDIDATES_MD = overrideOf('candidates-md') || path.join(ROOT, 'research', 'v3.0-source-candidates.md');
/** 覆盖**意图层**（v2 新增，唯一权威；内部维护层，不发布）。`--targets=` 只用于验证报告本身。 */
const TARGETS_FILE = overrideOf('targets') || path.join(ROOT, 'scripts', 'data', 'coverage-targets.json');
/** 发布产物 `models.json`（派生形状）：`catalogStatus` / `catalogReason` 只可能在这里（来源层禁写派生字段） */
const PUBLISHED_MODELS_FILE = overrideOf('published-models') || path.join(ROOT, 'models.json');
/** 数据源健康心跳（`BLOCKED_SOURCE` 与 Source Health impact 的唯一出处） */
const SOURCE_HEALTH_FILE = overrideOf('source-health') || path.join(ROOT, 'scripts', 'data', 'source-health.json');
/** Freshness 单一策略模块（t4 落盘后才有；没有就如实说"没落盘"，绝不假装 0 个 unknown） */
const FRESHNESS_MODULE = '../lib/model-freshness';

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
  // 牙（T14-F1，独立审查抓到）：**关系层读不到时必须判红**，不能只在正文写一句
  // 「映射覆盖按 0 计算」然后 exit 0。
  // 为什么：本报告是「缺口清单」的唯一落盘处，而"关系层整个没了"与"确实一条映射都没有"
  // 会导出完全相同的数字（未映射 = 全部）。兄弟分支（models.json 读不出、gaps 缺失）都已判红，
  // 唯独这一条只用来跳过校验 —— 于是**删掉整个关系层文件，报告照样绿**（实测过），
  // 那等于这份报告随时可能在一份残缺的盘面上说"全覆盖"。
  if (linksMissing && !registryLinksLoaded.missing && !registryLinksLoaded.broken) {
    problems.push('scripts/data/model-registry-links.json 存在、也能解析，却读不出任何映射数组 —— 禁止把"读不懂这份关系层"当成"没有映射"（那会让缺口数字看起来等于全部，而报告仍然绿）。');
  } else if (registryLinksLoaded.missing) {
    problems.push('缺少 scripts/data/model-registry-links.json —— 关系层不存在，API 侧与套餐侧的映射覆盖都无从判定（这不是"0 条映射"，是"这份报告没有分母"）。');
  }

  // v3.0 修订（套餐侧）：`plans.json` 的模型串是自由文本，结局只有"映射"或"显式声明不对应单一模型身份"。
  // 本报告原先**只统计 API 侧**，套餐侧那 11 条串在报告里一个字都没有 —— 于是"缺口"看起来比实际小。
  // 现在两处都读，并把"既没映射也没声明"当成**报告自身的硬问题**（不是安静的一行）。
  const registryGapsLoaded = registry.loadGaps(REGISTRY_GAPS_FILE);
  if (registryGapsLoaded.missing) {
    problems.push('缺少 scripts/data/model-registry-gaps.json —— 套餐侧模型串的处置登记表不存在，覆盖完整性无从判定。');
  } else if (registryGapsLoaded.broken) {
    problems.push(`scripts/data/model-registry-gaps.json 解析失败：${registryGapsLoaded.broken}`);
  }

  const mappedApiKeys = new Set();
  if (!linksMissing) {
    // 按**展开后的计价条目**记账（与 lib/model-registry.js 的 coverageOf() 同一口径）：
    // `variant: null` 的通配映射只为它真实展开到的 `(apiPlanId, modelKey, variant)` 负责，
    // 不把该 modelKey 的整组一次性算成已覆盖。
    for (const link of relations) {
      if (!link || !link.apiPlanId || !link.modelKey) continue;
      for (const identity of registry.sourcePricingIdentitiesOf(link, apiPlans).identities) {
        mappedApiKeys.add(`${identity.apiPlanId}::${identity.modelKey}::${identity.variant}`);
      }
    }
  }

  const unmappedModels = [];
  for (const plan of apiPlans) {
    for (const model of (Array.isArray(plan.models) ? plan.models : [])) {
      if (mappedApiKeys.has(`${plan.id}::${model.modelKey}::${model.variant}`)) continue;
      unmappedModels.push({
        provider: plan.provider,
        providerName: providers.providerNameOf(plan.provider, providerTable),
        planId: plan.id,
        planName: plan.planName,
        channel: plan.channel,
        modelKey: model.modelKey,
        variant: model.variant,
        name: model.name
      });
    }
  }

  /* ---------------- 套餐侧覆盖（Coding 套餐模型串） ---------------- */
  const planCoverage = registry.coverageOf({
    table: registryLoaded.table,
    links: registryLinksLoaded.doc,
    gaps: registryGapsLoaded.doc,
    apiPlans,
    plans
  });
  // 关系层两条读数必须一致：本报告自己数的 API 未映射 ↔ lib 数的 API 未映射。
  // 不一致说明"报告"和"门禁"看的不是同一份关系层 —— 那正是最该当场报红的事。
  // 两边现在都按**展开后的计价条目**记账（`(planId, modelKey, variant)`），口径逐字相同：
  // 报告侧 `planId::modelKey::variant` ↔ lib 侧 `planId\u0000modelKey\u0000variant`。
  if (planCoverage.unmappedModelKeys.length !== unmappedModels.length) {
    problems.push(`报告层与 lib/model-registry.js 对"未映射计价条目"的读数不一致（报告 ${unmappedModels.length} / lib ${planCoverage.unmappedModelKeys.length}）—— 两处看的不是同一份关系层。`);
  }
  if (registryGapsLoaded.doc) {
    problems.push(...registry.validateGaps(registryGapsLoaded.doc, { plans, links: registryLinksLoaded.doc, table: registryLoaded.table }));
  }
  // 关系层判据本身也在这里跑一遍（与 check-model-registry-links / validate --strict / 构建期同一支）：
  // 一条 source pricing identity 两个 owner、冗余重复认领、API 侧有计价条目没人认领 —— 都是**报告不可信**，
  // 不能只在别处红而报告照样打印一个好看的数字。
  if (!linksMissing) {
    problems.push(...registry.validateLinks(registryLinksLoaded.doc, { table: registryLoaded.table, apiPlans, plans }));
  }
  if (!linksMissing && registryGapsLoaded.doc && !registryMissing) {
    problems.push(...registry.validatePlanModelCoverage({
      table: registryLoaded.table, links: registryLinksLoaded.doc, gaps: registryGapsLoaded.doc, apiPlans, plans
    }));
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

  /* ---------------- Coverage Target 层（v2：意图 vs 事实） ---------------- */
  //
  // 之前报告只能对**盘上已有的数据**做除法：一家平台一条记录都没有时，它在报告里根本不存在。
  // 这一段把覆盖**意图层**（scripts/data/coverage-targets.json，唯一权威）读进来，由
  // lib/coverage-targets.js 派生七态。意图层坏了 / 不在盘上 ⇒ 报告当场红：
  // "要覆盖什么"没有了，下面的"覆盖到了哪里"就只是一堆计数，不是覆盖结论。
  const targetsLoaded = coverageTargets.load(TARGETS_FILE);
  const targetsDoc = targetsLoaded.doc;
  if (targetsLoaded.missing) {
    problems.push('缺少 scripts/data/coverage-targets.json —— 覆盖意图层（"我们打算覆盖什么"）不在盘上，覆盖结论无从判定（不许把"没有意图层"当成"没有缺口"）。');
  } else if (targetsLoaded.broken) {
    problems.push(`scripts/data/coverage-targets.json 解析失败：${targetsLoaded.broken}`);
  }

  // 发布产物 models.json（派生形状）：`catalogStatus` / `catalogReason` 只可能在这里 ——
  // 来源层 scripts/data/models.json 里出现派生字段是**校验错误**，所以这两项必须从产物读。
  const publishedModelsLoaded = readJson(PUBLISHED_MODELS_FILE, 'models.json（派生产物）');
  const publishedModels = publishedModelsLoaded && Array.isArray(publishedModelsLoaded.models)
    ? publishedModelsLoaded.models
    : [];

  const sourceHealthLoaded = readJson(SOURCE_HEALTH_FILE, 'scripts/data/source-health.json');
  const sourceHealthDoc = sourceHealthLoaded && typeof sourceHealthLoaded === 'object' && !Array.isArray(sourceHealthLoaded)
    ? sourceHealthLoaded
    : null;
  if (!sourceHealthDoc) {
    problems.push('缺少 scripts/data/source-health.json —— Source Health impact 与 BLOCKED_SOURCE 判定没有输入（缺输入不是通过）。');
  }

  const facts = coverageTargets.buildFacts({
    providerTable,
    deals,
    dealVendorOf: deal => core.vendorOf(deal),
    today,
    plans,
    apiPlans,
    modelsTable: registryLoaded.table,
    publishedModels,
    sourceHealthDoc
  });
  const knownSources = uniqSorted([...Object.keys(facts.sourceHealth), ...facts.dealSources]);
  const targetProblems = targetsDoc
    ? coverageTargets.validateTargets(targetsDoc, {
      providerTable,
      modelsTable: registryLoaded.table,
      knownSources,
      duplicateKeys: targetsLoaded.duplicateKeys
    })
    : [];
  problems.push(...targetProblems);
  const derived = coverageTargets.deriveTargets(targetsDoc || { targets: [] }, facts);

  /* ---------------- Current Model Coverage（v2） ---------------- */
  const registryEntries = Object.entries(registryLoaded.table || {});
  // 相位差纪律（本项目有实测教训）：字段**一条都没有** = 那一层还没落盘，不许当成"全部未知"报数。
  const releasedAtLanded = registryEntries.some(([, entry]) => entry && entry.releasedAt !== undefined);
  const catalogStatusLanded = publishedModels.some(model => model && model.catalogStatus !== undefined);
  const modelDimensionRows = derived.rows.filter(row => row.dimension === 'models');
  const declaredModelItems = modelDimensionRows
    .reduce((list, row) => list.concat(row.items.map(item => ({
      provider: row.provider,
      providerName: row.providerName,
      slug: item.value,
      resolved: item.resolved,
      reason: item.reason
    }))), [])
    .sort((a, b) => `${a.provider}\u0000${a.slug}`.localeCompare(`${b.provider}\u0000${b.slug}`));
  const modelSlugsOfProvider = provider => {
    const row = facts.dimensions.models.byProvider[provider];
    return row ? [...row.slugs].sort() : [];
  };
  const unknownReleaseDates = releasedAtLanded
    ? registryEntries
      .filter(([, entry]) => !entry || entry.releasedAt === null || entry.releasedAt === undefined)
      .map(([slug]) => slug).sort()
    : null;
  const legacyOrHistorical = catalogStatusLanded
    ? publishedModels
      .filter(model => model && ['legacy', 'historical'].includes(model.catalogStatus))
      .map(model => ({ slug: model.slug, catalogStatus: model.catalogStatus, catalogReason: model.catalogReason || null }))
      .sort((a, b) => String(a.slug).localeCompare(String(b.slug)))
    : null;
  const retiredInSource = registryEntries
    .filter(([, entry]) => entry && entry.status === 'retired')
    .map(([slug]) => slug).sort();
  // registry 模型归属的开发者没有对应 provider 身份 ⇒ 这些模型**从覆盖宇宙里够不到**。
  // 不是报告自身的问题（models.json 允许 `_developers_extra`），但必须列出来而不是安静地消失。
  // 归属由 lib/coverage-targets.js 的 buildFacts() 算一次（`facts.dimensions.models.bySlug[].provider`），
  // 这里不再自己按名字找一遍 —— 那样会多出第二份归属判据。
  const registryDevelopersWithoutProvider = registryEntries
    .map(([slug]) => {
      const info = facts.dimensions.models.bySlug[slug];
      if (!info || info.provider) return null;
      return { slug, developer: info.developer === undefined ? null : info.developer, owner: info.owner === undefined ? null : info.owner };
    })
    .filter(Boolean)
    .sort((a, b) => String(a.slug).localeCompare(String(b.slug)));

  /* ---------------- Source Health impact（v2） ---------------- */
  const declaredSourceNames = uniqSorted(derived.rows.reduce((list, row) => list.concat(row.sources.map(source => source.name)), []));
  const sourceHealthRows = declaredSourceNames.map(name => {
    const health = facts.sourceHealth[name] || null;
    const rows = derived.rows.filter(row => row.sources.some(source => source.name === name));
    return {
      name,
      health,
      status: health ? health.status : 'unregistered',
      reason: health ? health.reason : null,
      consecutiveFailures: health ? health.consecutiveFailures : null,
      observedDeals: facts.dealSources.includes(name),
      targets: uniqSorted(rows.map(row => row.provider)),
      dimensions: uniqSorted(rows.map(row => row.dimension))
    };
  });
  const unhealthyDeclaredSources = sourceHealthRows.filter(row => row.health && row.health.status !== 'healthy');
  const blockedRows = derived.blocked;

  /* ---------------- Freshness 阈值与理由（v2） ---------------- */
  const freshnessPath = path.join(__dirname, '..', 'lib', 'model-freshness.js');
  //
  // 三种结局**必须分开报**：文件不在盘上（层未落盘）≠ 文件在盘上但读不出来（坏了）≠ 读得出策略。
  // 这里刻意 catch 住 require 失败：本报告要能在一份策略模块正在改写的仓库里照常跑出别的数字 ——
  // 但那件事会在文本与 JSON 里**显式写出来**，不是静默降级（静默降级正是这一层最该防的事）。
  const freshness = (() => {
    if (!fs.existsSync(freshnessPath)) {
      return {
        status: 'missing',
        available: false,
        module: 'scripts/lib/model-freshness.js',
        error: null,
        policy: null,
        policyDigest: null,
        catalogStatuses: null,
        defaultVisible: null,
        defaultHidden: null,
        note: 'freshness 单一策略层尚未落盘（scripts/lib/model-freshness.js 不存在）：本报告**不**判定 currentness ——'
          + ' unknown release dates 与 legacy/historical 一律如实标成"层未落盘"，绝不用 0 冒充（0 个 legacy 与"分不出 legacy"是两件事）。'
      };
    }
    try {
      const mod = require(freshnessPath);
      const policy = mod.MODEL_FRESHNESS_POLICY === undefined ? null : mod.MODEL_FRESHNESS_POLICY;
      return {
        status: 'ok',
        available: true,
        module: 'scripts/lib/model-freshness.js',
        error: null,
        policy,
        policyDigest: typeof mod.policyDigestOf === 'function' && policy ? mod.policyDigestOf(policy) : null,
        catalogStatuses: mod.CATALOG_STATUSES === undefined ? null : mod.CATALOG_STATUSES,
        defaultVisible: mod.DEFAULT_VISIBLE_CATALOG_STATUSES === undefined ? null : mod.DEFAULT_VISIBLE_CATALOG_STATUSES,
        defaultHidden: mod.DEFAULT_HIDDEN_CATALOG_STATUSES === undefined ? null : mod.DEFAULT_HIDDEN_CATALOG_STATUSES,
        note: '阈值与理由的唯一出处是 scripts/lib/model-freshness.js 的 MODEL_FRESHNESS_POLICY（按 modelRole 分档）；'
          + '本报告只读它，不另写一份。"默认展示哪一档"同理只读该模块的 DEFAULT_VISIBLE_CATALOG_STATUSES。'
      };
    } catch (error) {
      return {
        status: 'broken',
        available: false,
        module: 'scripts/lib/model-freshness.js',
        error: String((error && error.message) || error),
        policy: null,
        policyDigest: null,
        catalogStatuses: null,
        defaultVisible: null,
        defaultHidden: null,
        note: 'freshness 策略模块在盘上但**读不出来**（本轮不判定 currentness；这不是"没有 legacy"）。'
      };
    }
  })();

  /* ---------------- v2 汇总（文本与 JSON 共用同一批数字） ---------------- */
  const targetSummaries = derived.targets.map(target => {
    const cells = coverageTargets.DIMENSIONS.map(dimension => target.dimensions[dimension]);
    return {
      provider: target.provider,
      name: target.name,
      tier: target.tier,
      role: target.role,
      intent: target.intent,
      overall: target.overall,
      withData: cells.some(cell => cell.present > 0),
      states: cells.reduce((acc, cell) => { acc[cell.dimension] = cell.state; return acc; }, {}),
      coveredDimensions: cells.filter(cell => cell.state === 'COVERED').length,
      applicableDimensions: cells.filter(cell => cell.state !== 'NOT_APPLICABLE').length
    };
  });
  const summaryOf = provider => targetSummaries.find(row => row.provider === provider) || { tier: null, role: null };
  const countBy = (list, keyOf) => {
    const out = {};
    for (const item of list) {
      const key = keyOf(item);
      if (key === null || key === undefined) continue;
      out[key] = (out[key] || 0) + 1;
    }
    return out;
  };
  const tierCounts = countBy(targetSummaries, row => row.tier);
  const roleCounts = countBy(targetSummaries, row => row.role);
  const dimensionStateCounts = {};
  for (const dimension of coverageTargets.DIMENSIONS) {
    dimensionStateCounts[dimension] = {};
    for (const state of coverageTargets.STATE_ORDER) {
      dimensionStateCounts[dimension][state] = derived.rows.filter(row => row.dimension === dimension && row.state === state).length;
    }
  }
  const rowPayload = derived.rows.map(row => ({
    provider: row.provider,
    name: row.providerName,
    tier: summaryOf(row.provider).tier,
    role: summaryOf(row.provider).role,
    dimension: row.dimension,
    state: row.state,
    present: row.present,
    currentPresent: row.currentPresent,
    declared: row.declared,
    resolved: row.resolved,
    reason: row.reason
  }));
  const cellPayload = row => ({
    provider: row.provider,
    name: row.providerName,
    dimension: row.dimension,
    state: row.state,
    declared: row.declared,
    present: row.present,
    resolved: row.resolved,
    reason: row.reason,
    items: row.items.map(item => ({ value: item.value, resolved: item.resolved, reason: item.reason }))
  });

  /* ---------------- 输出 ---------------- */
  const out = [];
  const line = text => out.push(text);
  const kv = (label, value, note) => line(`  ${String(label).padEnd(26)} ${String(value).padStart(6)}${note ? `   ${note}` : ''}`);

  line('======================================================================');
  line('数据覆盖报告（v3.0 Stage C4 / 题面 §C4 · coverage-expansion-v1 v2）');
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
  kv('已映射 API 计价条目', modelPricingItems - apiWithoutRegistryMapping, `共 ${modelPricingItems} 条（按展开后的 (planId, modelKey, variant) 记账，通配映射不整组算过）`);
  kv('已映射 Coding 模型串', planCoverage.planModelStrings - planCoverage.unmappedPlanModels.length - planCoverage.declaredPlanModels.length, `共 ${planCoverage.planModelStrings} 条；关系层里 Coding 映射 ${planCoverage.codingLinks} 条`);
  kv('已声明"不对应单一模型身份"', planCoverage.declaredPlanModels.length, '模型池 / 系列名 / 一个串多个模型 / registry 没有的身份 / 图像语音资源（逐条见缺口 5 下方）');
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
    .sort((a, b) => [a.provider, a.planId, a.modelKey, a.variant].join('|').localeCompare([b.provider, b.planId, b.modelKey, b.variant].join('|')))
    .forEach(row => line(`  · ${row.providerName} / ${row.planName}（${row.channel}） → ${row.modelKey} · ${row.variant}（${row.name}）`));
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

  line('── 缺口 5：Coding 套餐模型串既无映射也未声明 ────────────────────────');
  // 这一格必须是空的：任何一条串"既没有映射、又没有处置登记"都由报告自检报红（见上方 problems），
  // 所以它在这里永远显示「（无）」。留着它是为了让读者看得见"这一格被检查过"，而不是看不见。
  if (!planCoverage.unmappedPlanModels.length) line('  （无）');
  planCoverage.unmappedPlanModels
    .slice()
    .sort((a, b) => [a.provider, a.planId, a.modelName].join('|').localeCompare([b.provider, b.planId, b.modelName].join('|')))
    .forEach(row => line(`  · ${providers.providerNameOf(row.provider, providerTable)} / ${row.modelName}（套餐 ${row.planId}）`));
  line('');
  line('── 已声明"不对应单一模型身份"的套餐模型串（有理由的缺口，不是漏判）──');
  if (!planCoverage.declaredPlanModels.length) line('  （无）');
  planCoverage.declaredPlanModels
    .slice()
    .sort((a, b) => [a.provider, a.planId, a.modelName].join('|').localeCompare([b.provider, b.planId, b.modelName].join('|')))
    .forEach(row => line(`  · ${providers.providerNameOf(row.provider, providerTable)} / ${row.modelName}（套餐 ${row.planId}）→ ${row.reason}（记录里的 role=${row.role}）`));
  line('');

  line('── 已采信并移交 registry-curator 落盘的候选 ─────────────────────────');
  if (!adopted.length) line('  （无）');
  for (const row of adopted) {
    line(`  · ${row.provider}  ${row.url}   ${row.checkedAt}${row.notes ? `   ${row.notes}` : ''}`);
  }
  line('');

  line('── Target Provider Universe（覆盖意图层 · v2）───────────────────────');
  if (targetsLoaded.missing) {
    line('  scripts/data/coverage-targets.json 不在盘上 —— 没有"要覆盖什么"，下面的分维度覆盖无法判定（**不是"没有缺口"**）。');
  } else {
    kv('Target 行数', derived.targets.length, 'scripts/data/coverage-targets.json 的人工意图行数（身份层与意图层双向对账）');
    kv('providers.json 身份数', Object.keys(providerTable).length, '缺一行即报告红：身份层与意图层不许分家');
    kv('有数据的 Target', targetSummaries.filter(row => row.withData).length, '四个维度里至少一格有盘上记录');
    kv('一条数据都没有的 Target', targetSummaries.filter(row => !row.withData).length, '意图已立、事实为零（这些行的每一格都必须是 MISSING / DEFERRED / UNVERIFIABLE / NOT_APPLICABLE 之一）');
    line(`  tier 分布：${coverageTargets.TIERS.map(tier => `${tier}=${tierCounts[tier] || 0}（${coverageTargets.TIER_LABEL[tier]}）`).join(' · ')}`);
    line(`  role 分布：${coverageTargets.ROLES.map(role => `${role}=${roleCounts[role] || 0}`).join(' · ')}`);
    line(`  reviewedAt：${targetsDoc && targetsDoc.reviewedAt ? targetsDoc.reviewedAt : '（未写）'}`);
    line('  逐行：');
    for (const row of targetSummaries) {
      line(`    · ${String(row.provider).padEnd(12)} ${String(row.name || '').padEnd(16)} ${String(row.tier).padEnd(9)} ${String(row.role).padEnd(17)} ${row.overall.padEnd(15)} 适用维度 ${row.applicableDimensions}/4 · 已覆盖 ${row.coveredDimensions}/4`);
    }
  }
  line('');
  line('── 分维度覆盖（provider × 维度 · 派生七态 · v2）──────────────────────');
  for (const dimension of coverageTargets.DIMENSIONS) {
    const counts = dimensionStateCounts[dimension];
    line(`  ${coverageTargets.DIMENSION_LABEL[dimension]}（${dimension}）：${
      coverageTargets.STATE_ORDER.map(state => `${state}=${counts[state]}`).join(' · ')}`);
  }
  line('  矩阵（列顺序 ' + coverageTargets.DIMENSIONS.join(' / ') + '）：');
  line(`    ${'provider'.padEnd(13)}${coverageTargets.DIMENSIONS.map(dimension => dimension.padEnd(16)).join('')}`);
  for (const row of targetSummaries) {
    line(`    ${String(row.provider).padEnd(13)}${coverageTargets.DIMENSIONS.map(dimension => String(row.states[dimension]).padEnd(16)).join('')}`);
  }
  line('');
  line('── 真缺口：MISSING targets（可覆盖、未延期、来源健康，但盘上一条记录都没有）──');
  if (!derived.missing.length) line('  （无）');
  for (const row of derived.missing) {
    line(`  · ${row.providerName || row.provider}（${row.provider}） ${coverageTargets.DIMENSION_LABEL[row.dimension]}：声明的 current target ${row.declared} 条 / 盘上 ${row.present} 条 —— ${row.reason}`);
  }
  line('');
  line('── PARTIAL targets（声明了一部分，只兑现了一部分）────────────────────');
  if (!derived.partial.length) line('  （无）');
  for (const row of derived.partial) {
    line(`  · ${row.providerName || row.provider}（${row.provider}） ${coverageTargets.DIMENSION_LABEL[row.dimension]}：${row.resolved}/${row.declared} 条兑现 —— ${row.reason}`);
    for (const item of row.items) {
      if (!item.resolved) line(`      ✗ ${item.value}：${item.reason}`);
    }
  }
  line('');
  line('── 有理由的缺口 ①：DEFERRED（人工裁决延期 —— **永不算 MISSING**）────');
  if (!derived.deferred.length) line('  （无）');
  for (const row of derived.deferred) {
    line(`  · ${row.providerName || row.provider}（${row.provider}） ${coverageTargets.DIMENSION_LABEL[row.dimension]}：${row.reason}`);
  }
  line('');
  line('── 有理由的缺口 ②：UNVERIFIABLE（查过，官方来源不可核）──────────────');
  if (!derived.unverifiable.length) line('  （无）');
  for (const row of derived.unverifiable) {
    line(`  · ${row.providerName || row.provider}（${row.provider}） ${coverageTargets.DIMENSION_LABEL[row.dimension]}：${row.reason}`);
  }
  line('');
  line('── 有理由的缺口 ③：NOT_APPLICABLE（这家在这一维度没有可覆盖的东西）──');
  const notApplicableByProvider = new Map();
  for (const row of derived.notApplicable) {
    if (!notApplicableByProvider.has(row.provider)) notApplicableByProvider.set(row.provider, []);
    notApplicableByProvider.get(row.provider).push(row.dimension);
  }
  if (!notApplicableByProvider.size) line('  （无）');
  for (const [provider, dimensions] of notApplicableByProvider) {
    line(`  · ${providers.providerNameOf(provider, providerTable)}（${provider}）不适用：${dimensions.map(dimension => coverageTargets.DIMENSION_LABEL[dimension]).join(' / ')}`);
  }
  line('');
  line('── 有理由的缺口 ④：BLOCKED_SOURCE（声明的来源全坏，且盘上无记录）────');
  if (!blockedRows.length) line('  （无）');
  for (const row of blockedRows) {
    line(`  · ${row.providerName || row.provider}（${row.provider}） ${coverageTargets.DIMENSION_LABEL[row.dimension]}：${row.reason}`);
  }
  line('');
  line('── Current Model Coverage（v2）──────────────────────────────────────');
  kv('声明的 current target 模型', declaredModelItems.length, `兑现 ${declaredModelItems.filter(item => item.resolved).length} 条（registrySlug 必须存在，指向不存在的模型一律红）`);
  for (const item of declaredModelItems.filter(row => !row.resolved)) {
    line(`  ✗ ${item.providerName || item.provider}（${item.provider}） → ${item.slug}：${item.reason}`);
  }
  if (releasedAtLanded) {
    kv('unknown release dates', unknownReleaseDates.length, `registry 共 ${registryEntries.length} 个模型里 releasedAt 为空/缺的（逐条：${unknownReleaseDates.slice(0, 8).join(', ') || '（无）'}${unknownReleaseDates.length > 8 ? ' …' : ''}）`);
  } else {
    line('  unknown release dates：**读不出** —— scripts/data/models.json 里没有一个条目带 releasedAt 字段（Model Registry v2 尚未落盘）。');
    line('                       不许把"字段整层缺席"当成"全部未知"报一个数字。');
  }
  if (catalogStatusLanded) {
    kv('legacy / historical 保留', legacyOrHistorical.length, `仍在 registry 与发布产物里（未删除）：${legacyOrHistorical.map(row => `${row.slug}(${row.catalogStatus})`).join(', ') || '（无）'}`);
  } else {
    line('  legacy / historical 保留：**分不出** —— 发布产物 models.json 里没有一个条目带 catalogStatus（freshness 派生层尚未落盘）。');
    line('                           "0 个 legacy"与"分不出 legacy"是两件事，这里如实报后者。');
  }
  kv('来源层 status=retired', retiredInSource.length, retiredInSource.slice(0, 8).join(', ') || '（无）');
  kv('归属不到 Target provider 的 registry 模型', registryDevelopersWithoutProvider.length, '这些模型从覆盖宇宙里够不到（models.json 允许 _developers_extra，所以不是报告自身的问题）');
  registryDevelopersWithoutProvider.forEach(item => line(`      · ${item.slug}（developer=${item.developer === null ? '(空)' : item.developer} / owner=${item.owner === null ? '(空)' : item.owner}）`));
  line('');
  line('── Source Health impact（v2）────────────────────────────────────────');
  kv('声明的来源数', sourceHealthRows.length, '意图层里写过的 deals source（source-health 的 name 或 deals.json 出现过的 source）');
  if (!sourceHealthRows.length) line('  （意图层还没有声明任何 deals 来源）');
  for (const row of sourceHealthRows) {
    const health = row.health
      ? `${row.health.status}${row.health.reason ? `/${row.health.reason}` : ''}（连续失败 ${row.health.consecutiveFailures}）`
      : 'unregistered（不在 source-health.json 里）';
    line(`  · ${row.name}  ${health}  影响：${row.targets.join(', ')} 的 ${row.dimensions.join('/')}`);
  }
  if (unhealthyDeclaredSources.length) {
    line(`  ⚠️ 不健康的声明来源 ${unhealthyDeclaredSources.length} 个：${unhealthyDeclaredSources.map(row => `${row.name}(${row.status})`).join('、')} —— 对应格子在无记录时判 BLOCKED_SOURCE，不判 MISSING。`);
  }
  line('');
  line('── Freshness 阈值与理由（v2）────────────────────────────────────────');
  if (freshness.status === 'ok') {
    line(`  策略来源：${freshness.module}`);
    line(`  ${freshness.note}`);
    if (freshness.policyDigest) line(`  策略指纹：${freshness.policyDigest}`);
    line(`  MODEL_FRESHNESS_POLICY：${JSON.stringify(freshness.policy)}`);
    line(`  默认展示：${(freshness.defaultVisible || []).join(' / ') || '（模块未导出）'}　默认隐藏：${(freshness.defaultHidden || []).join(' / ') || '（模块未导出）'}`);
  } else if (freshness.status === 'broken') {
    line(`  策略来源：${freshness.module}（**在盘上但读不出来**）`);
    line(`  读取错误：${freshness.error}`);
    line(`  ${freshness.note}`);
  } else {
    line(`  策略来源：${freshness.module}（**尚未落盘**）`);
    line(`  ${freshness.note}`);
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
        gapsPresent: !registryGapsLoaded.missing && !registryGapsLoaded.broken,
        unmappedModels,
        planModelStrings: planCoverage.planModelStrings,
        mappedPlanModelCount: planCoverage.planModelStrings - planCoverage.unmappedPlanModels.length - planCoverage.declaredPlanModels.length,
        unmappedPlanModels: planCoverage.unmappedPlanModels,
        declaredPlanModels: planCoverage.declaredPlanModels
      },
      gaps: {
        dealsWithoutPlans,
        plansWithoutDeals,
        unmappedModelCount: unmappedModels.length,
        unmappedPlanModelCount: planCoverage.unmappedPlanModels.length,
        declaredPlanModelCount: planCoverage.declaredPlanModels.length,
        notAdoptedProviders
      },
      candidates: { total: candidates.length, adopted: adopted.length, notAdopted: notAdopted.length },
      // ---- v2（coverage-expansion-v1）：全部进**新键**，旧键一个字都不动 ----
      coverageTargets: {
        file: 'scripts/data/coverage-targets.json',
        present: !targetsLoaded.missing && !targetsLoaded.broken,
        schemaVersion: coverageTargets.SCHEMA_VERSION,
        reviewedAt: targetsDoc && targetsDoc.reviewedAt ? targetsDoc.reviewedAt : null,
        validationProblemCount: targetProblems.length,
        validationProblems: targetProblems,
        stateOrder: coverageTargets.STATE_ORDER,
        states: derived.states,
        universe: {
          declared: derived.targets.length,
          providersRegistered: Object.keys(providerTable).length,
          withData: targetSummaries.filter(row => row.withData).length,
          withoutAnyData: targetSummaries.filter(row => !row.withData).map(row => row.provider),
          undeclaredProviders: Object.keys(providerTable).filter(provider => !targetSummaries.some(row => row.provider === provider)),
          tiers: tierCounts,
          roles: roleCounts,
          providers: targetSummaries.map(row => ({
            provider: row.provider,
            name: row.name,
            tier: row.tier,
            role: row.role,
            overall: row.overall,
            withData: row.withData,
            applicableDimensions: row.applicableDimensions,
            coveredDimensions: row.coveredDimensions,
            states: row.states,
            intent: row.intent
          }))
        },
        dimensions: dimensionStateCounts,
        rows: rowPayload,
        missingTargets: derived.missing.map(cellPayload),
        partialTargets: derived.partial.map(cellPayload),
        deferred: derived.deferred.map(cellPayload),
        unverifiable: derived.unverifiable.map(cellPayload),
        notApplicable: derived.notApplicable.map(cellPayload),
        blockedBySourceHealth: derived.blocked.map(cellPayload),
        currentModels: {
          declaredTargets: declaredModelItems.length,
          resolvedTargets: declaredModelItems.filter(item => item.resolved).length,
          declared: declaredModelItems,
          unresolved: declaredModelItems.filter(item => !item.resolved),
          registryModels: registryEntries.length,
          modelsByProvider: Object.fromEntries(
            Object.keys(providerTable)
              .map(provider => [provider, modelSlugsOfProvider(provider)])
              .filter(([, slugs]) => slugs.length)
          ),
          unknownReleaseDates,
          releasedAtLanded,
          legacyOrHistorical,
          legacyOrHistoricalLanded: catalogStatusLanded,
          retiredInSource,
          registryDevelopersWithoutProvider
        },
        sourceHealth: {
          declaredSources: sourceHealthRows,
          unhealthyDeclaredSources: unhealthyDeclaredSources.map(row => row.name),
          blockedTargets: derived.blocked.map(cellPayload)
        },
        freshness: {
          status: freshness.status,
          available: freshness.available,
          module: freshness.module,
          error: freshness.error,
          policy: freshness.policy,
          policyDigest: freshness.policyDigest,
          catalogStatuses: freshness.catalogStatuses,
          defaultVisible: freshness.defaultVisible,
          defaultHidden: freshness.defaultHidden,
          note: freshness.note
        }
      }
    };
    console.log('\nJSON:');
    console.log(JSON.stringify(payload, null, 2));
  }

  console.log('\n✅ 覆盖报告自检通过（0 处问题）。');
  return 0;
}

process.exit(main());
