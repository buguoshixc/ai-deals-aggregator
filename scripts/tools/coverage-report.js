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
 * ## v3（coverage-depth-v1）：从「覆盖了几格」升级到「下一步补哪一条」
 *
 * v2 已经能说出每个 (provider × 维度) 格子是七态里的哪一种，但读者拿到那张表之后仍然要自己
 * 判断"现在最该做哪一件事"。v3 追加**四节**（文本与 JSON 同一批数字），把"下一步"变成可执行的队列：
 *
 *   · **Release Evidence Coverage** —— registry 里有多少模型写下了官方发布日期（按 developer /
 *     modelRole / catalogStatus 三维拆分）。百分比只是**观测指标，不是 KPI**：没有目标线、不进门禁。
 *   · **Model Release Evidence Queue** —— 只读的"优先补哪几条发布日期"队列：五条**打印在报告里**的
 *     确定性规则（未知优先 → 可比组规模降序 → tier core>major>long-tail → 是否被下游引用 → slug
 *     code-unit 序），没有任何主观分、没有伪精确分数。
 *   · **Gap Closure Queue** —— MISSING / PARTIAL 按 Priority A/B/C/D 分层，每条带「目标 N / 已兑现 M /
 *     缺 K」与出口状态；分层规则同样**逐字打印**（判据全部来自既有读数，不引入第二套口径）。
 *   · **Source Reliability summary** —— 读 `scripts/data/source-rulings.json`（workstream C 的写域，
 *     判据层是 `scripts/lib/source-rulings.js`），与 `scripts/data/source-health.json` 的 live 读数 join，
 *     并做「裁决 ↔ 采集器注册表 ↔ source-health」三方对账。**必须打印心跳的 generatedAt**。
 *
 * **旧口径一个字都不改**：旧的五类交叉缺口、旧的 JSON 键全部保留（新内容进新的键，且全部追加在
 * `coverageTargets` 既有键之后 —— 顶层键序与 v2 逐字逐序相同），
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
const sourceRulings = require('../lib/source-rulings');
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

/** 来源裁决表（v3 新增；**workstream C 的写域**，本报告只读它）。`--source-rulings=` 只用于验证报告本身。 */
const SOURCE_RULINGS_FILE = overrideOf('source-rulings') || path.join(ROOT, 'scripts', 'data', 'source-rulings.json');

/** 采集器注册表（三方对账的第二方；`collectors/index.js` 不加载无头链路，require 它不联网、不读盘） */
const COLLECTORS_INDEX = '../collectors';

/**
 * Release Evidence Queue 打印/输出前几条。**固定常量**（不是"前几名"那种拍脑袋）：
 * 15 条足以覆盖当前 40 条 unknown 里最该动手的一批，又不会把报告刷成一张长表；
 * 改它就改这一行，并跑 coverage-targets-selftest。
 */
const RELEASE_QUEUE_LIMIT = 15;

/**
 * Gap Closure Queue 的「高价值维度」。这是一条**声明出来的人工判据**（不是从数据里推出来的）：
 * API 计费与模型身份这两个维度的缺口，直接决定"这家平台在页面上有没有可用的价格/模型"，
 * 而 deals / coding 的缺口影响的是入口的丰富度。规则原文会逐字打印在报告里 —— 读者不必猜。
 */
const HIGH_VALUE_DIMENSIONS = ['api', 'models'];

/** 派生字段在发布产物里缺席时，报告里用的占位标签（与既有 `statusesOutsideWordList` 的写法同一个词） */
const FIELD_MISSING_LABEL = '(字段缺失)';

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

/**
 * **层未落盘**（不是错误，但必须显式计入自检口径，绝不静默当通过）。
 *
 * 为什么与 `problems` 分开记：`problems` 是"报告不可信"（数据互相矛盾、读不懂、对账不上），
 * 它让报告 exit 1；而"某一层这一轮还没落盘"不是矛盾 —— 但**它与"这一层全是健康的"长得一模一样**，
 * 所以它必须出现在自检区里（文本一行 + JSON 一个键），由读者决定要不要等它。
 * 与 Freshness 策略模块同一处理（那一节也是"没落盘就如实说，不判红"）。
 */
const pendingLayers = [];

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

  // t14-F4：`deals.providers` 的口径必须写明是**仅 type=deal**。
  // 为什么要有这一行对照：deals 里还有 `type=tool` 的行（工具目录），它们同样带 vendor 原始串，
  // 但**不进 provider universe**（那些串没有归一规则、也没有套餐/计费侧的身份）。
  // 只写一个 "provider 数" 而不说分母是什么，读者会把它与"deals 里出现过的所有厂商"混为一谈。
  const toolVendorKeys = new Set(toolRows
    .map(deal => (core.vendorOf(deal) || {}).key)
    .filter(key => key && key !== '(未识别)'));

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

  // API 侧处置声明覆盖的计价条目（`model-registry-gaps.json` 的 **API 侧**声明）：
  // 自 coverage-expansion-v1 起，"未映射"的语义是「**映射与处置都没有**」——
  // 声明过的条目**有结局**（结局是"对不上任何 registry 身份"），不该再被算成"未判"。
  // 这里只做减法，**不动任何输出结构**（新口径的逐条留档走 lib 的 coverageOf().declaredApiEntries）。
  const declaredApiKeys = new Set();
  if (registryGapsLoaded.doc && !registryGapsLoaded.broken) {
    for (const declaration of registry.declarationsList(registryGapsLoaded.doc)) {
      if (!declaration || declaration.apiPlanId === undefined || declaration.modelKey === undefined) continue;
      for (const identity of registry.sourcePricingIdentitiesOf(declaration, apiPlans).identities) {
        declaredApiKeys.add(`${identity.apiPlanId}::${identity.modelKey}::${identity.variant}`);
      }
    }
  }

  const unmappedModels = [];
  for (const plan of apiPlans) {
    for (const model of (Array.isArray(plan.models) ? plan.models : [])) {
      const identityKey = `${plan.id}::${model.modelKey}::${model.variant}`;
      if (mappedApiKeys.has(identityKey) || declaredApiKeys.has(identityKey)) continue;
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

  /* ---------------- API 侧处置（t25：把"结局"如实记进方程） ---------------- */
  //
  // t23 起 `model-registry-gaps.json` 有了 **API 侧**声明（`apiPlanId` + `modelKey` + `variant` +
  // `reason=off-registry-model`），于是计价条目的结局变成三种、而且必须**三种相加等于总数**：
  //
  //     计价条目 N 条 = 已映射认领 A + 已处置声明 B + 未判 C
  //
  // 这份报告以前只有 A 与 C 两个数（B 没有出口），于是"处置过的条目"被悄悄算进了 A：
  // 一个声明过"对不上任何 registry 身份"的条目，看起来和"有一条真实映射"完全一样。
  // 现在 B 单独成一格，且 **C 不为 0 时报告自检必须非 0**（与 validateLinks 同一口径：不许比门禁好看）。
  //
  // 记账口径：A / B / C 一律按**展开后的计价条目**（`(planId, modelKey, variant)`）数，
  // 通配（`variant: null`）只为它真实展开到的条目负责 —— 与 lib 的 `coverageOf()` 逐字相同。
  const apiPricingEntries = planCoverage.apiPricingItems;
  const mappedApiEntries = planCoverage.mappedApiEntries;
  const declaredApiIdentityCount = planCoverage.declaredApiIdentities;
  const unmappedApiEntries = planCoverage.unmappedModelKeys.length;
  const apiDispositionOrder = (row) => [
    row.provider === null || row.provider === undefined ? '' : row.provider,
    row.apiPlanId === null || row.apiPlanId === undefined ? '' : row.apiPlanId,
    row.modelKey === null || row.modelKey === undefined ? '' : row.modelKey,
    row.variant === null || row.variant === undefined ? '' : row.variant
  ].join('\u0000');
  const declaredApiRows = [...planCoverage.declaredApiEntries]
    .sort((a, b) => (apiDispositionOrder(a) < apiDispositionOrder(b) ? -1 : apiDispositionOrder(a) > apiDispositionOrder(b) ? 1 : 0));
  // 三条读数逐项对账（报告自己的独立记账 ↔ lib 的唯一判据）：对不上就是"报告看的"和"门禁看的"分家了。
  if (mappedApiEntries !== mappedApiKeys.size) {
    problems.push(`报告层与 lib/model-registry.js 对"已映射 API 计价条目"的读数不一致（报告 ${mappedApiKeys.size} / lib ${mappedApiEntries}）—— 两处看的不是同一份关系层。`);
  }
  if (declaredApiIdentityCount !== declaredApiKeys.size) {
    problems.push(`报告层与 lib/model-registry.js 对"已处置声明的 API 计价条目"的读数不一致（报告 ${declaredApiKeys.size} / lib ${declaredApiIdentityCount}）—— 两处看的不是同一份处置登记表。`);
  }
  const apiEquationTotal = mappedApiEntries + declaredApiIdentityCount + unmappedApiEntries;
  if (apiEquationTotal !== apiPricingEntries) {
    problems.push(`API 侧记账不闭合：计价条目 ${apiPricingEntries} 条 ≠ 已映射认领 ${mappedApiEntries} + 已处置声明 ${declaredApiIdentityCount} + 未判 ${unmappedApiEntries}（= ${apiEquationTotal}）—— 三个数必须把每一条计价条目恰好分完，否则报告在自说自话。`);
  }
  if (unmappedApiEntries > 0) {
    // 与 validateLinks 同一口径：每一条计价条目都必须有结局（映射 **或** 处置声明）。
    const sample = planCoverage.unmappedModelKeys.slice(0, 3)
      .map(row => `(${row.apiPlanId}, ${row.modelKey}, ${row.variant})`).join(' · ');
    problems.push(`API 侧还有 ${unmappedApiEntries} 条计价条目既没有 registry 映射、也没有在 model-registry-gaps.json 里声明处置 —— 每一条都必须人工判一次（映射或"不对应单一模型身份"，禁止静默留空）：${sample}${unmappedApiEntries > 3 ? ' …' : ''}`);
  }
  if (registryGapsLoaded.doc) {
    problems.push(...registry.validateGaps(registryGapsLoaded.doc, { plans, links: registryLinksLoaded.doc, table: registryLoaded.table, apiPlans }));
  }
  // 关系层判据本身也在这里跑一遍（与 check-model-registry-links / validate --strict / 构建期同一支）：
  // 一条 source pricing identity 两个 owner、冗余重复认领、API 侧有计价条目没人认领 —— 都是**报告不可信**，
  // 不能只在别处红而报告照样打印一个好看的数字。
  if (!linksMissing) {
    problems.push(...registry.validateLinks(registryLinksLoaded.doc, { table: registryLoaded.table, apiPlans, plans, gaps: registryGapsLoaded.doc }));
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
  // §42「机器可读输出也要同步」（t46 / F2）——候选来源审查的**明细**同步进 JSON。
  // 此前 JSON 只有 3 个计数（40/13/21）与 13 个厂商显示名：URL、检查日期、未采信原因**一个都还原不出**，
  // 而这三样正是这条旧能力的全部内容（文本侧本来就有）。字段名沿用登记表的字段名，不另起一套词。
  // 排序用 **code-unit 序**（与 lib 的规范序判据同一支比较方式，不用 localeCompare），两次运行逐字节一致。
  const candidateOrderKey = row => [row.provider, row.url, row.checkedAt, row.slug]
    .map(value => String(value === null || value === undefined ? '' : value)).join('\u0000');
  const candidateRows = candidates
    .filter(candidate => candidate && typeof candidate === 'object')
    .map(candidate => ({
      provider: candidate.provider === undefined ? null : candidate.provider,
      slug: candidate.slug === undefined ? null : candidate.slug,
      url: candidate.url === undefined ? null : candidate.url,
      checkedAt: candidate.checkedAt === undefined ? null : candidate.checkedAt,
      decision: candidate.decision === undefined ? null : candidate.decision,
      adopted: candidate.decision === 'adopted',
      flags: {
        isJs: candidate.isJs === true,
        requiresLogin: candidate.requiresLogin === true,
        dynamicPagination: candidate.dynamicPagination === true,
        pageOffline: candidate.pageOffline === true,
        incomplete: candidate.incomplete === true
      },
      failedReason: candidate.failedReason === undefined ? null : candidate.failedReason,
      adoptedReason: candidate.adoptedReason === undefined ? null : candidate.adoptedReason
    }))
    .sort((a, b) => (candidateOrderKey(a) < candidateOrderKey(b) ? -1 : candidateOrderKey(a) > candidateOrderKey(b) ? 1 : 0));

  /* ---------------- 交叉缺口 ---------------- */
  const dealsWithoutPlans = uniqSorted([...dealProviderKeys].filter(key => !planProviderKeys.has(key)));
  const plansWithoutDeals = uniqSorted([...planProviderKeys].filter(key => !dealProviderKeys.has(key)));
  // （t25：原来这里还有一个 `apiWithoutRegistryMapping = unmappedModels.length`，只被旧的
  //  "已映射 API 计价条目" 那一行用；现在那一行换成了 A / B / C 三个读数 + 方程，
  //  该变量已无出口 —— 删掉它，免得留一个没人读的中间量让后来者以为是判据。）

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
  // R8 的「来源宇宙」对照（t46 / F5）：本节列的是**意图层声明过的 deals source**（= 挂在 target 上的那些），
  // 而 `scripts/data/source-health.json` 的注册表更宽。不把两个宇宙的差显式写出来，读者会把本节
  // 读成"全站来源都被这张表看住了"——变坏但不属于任何 target 的采集源不在本节里，那是口径边界不是漏报。
  const sourceHealthRegistryNames = Object.keys(facts.sourceHealth).sort();
  const declaredSourceNameSet = new Set(sourceHealthRows.map(row => row.name));
  const sourceHealthRegistryOnly = sourceHealthRegistryNames.filter(name => !declaredSourceNameSet.has(name));

  /* ---------------- Freshness 阈值与理由（v2） ---------------- */
  const freshnessPath = path.join(__dirname, '..', 'lib', 'model-freshness.js');
  //
  // 三种结局**必须分开报**：文件不在盘上（层未落盘）≠ 文件在盘上但读不出来（坏了）≠ 读得出策略。
  // 这里刻意 catch 住 require 失败：本报告要能在一份策略模块正在改写的仓库里照常跑出别的数字 ——
  // 但那件事会在文本与 JSON 里**显式写出来**，不是静默降级（静默降级正是这一层最该防的事）。
  //
  // v3：这里额外留一个**内存引用** `freshnessJudge`（模块对象本身）。Release Evidence Coverage 与
  // Release Evidence Queue 借它调 `releaseDateOf()` / `resolveModelRole()` / `comparableGroupOf()` ——
  // 判据仍然只有一份（在 lib 里），报告不另写一份；而 `coverageTargets.freshness` 那一块的字形
  // **一个字节都不动**（那是 t46 冻结的旧键，往里塞函数会让 --json 变成不可序列化）。
  let freshnessJudge = null;
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
        // R4 五态普查用的计数器（lib 里的唯一实现）；层没落盘 ⇒ null，由报告如实报「分不出」。
        censusOf: null,
        note: 'freshness 单一策略层尚未落盘（scripts/lib/model-freshness.js 不存在）：本报告**不**判定 currentness ——'
          + ' unknown release dates 与 legacy/historical 一律如实标成"层未落盘"，绝不用 0 冒充（0 个 legacy 与"分不出 legacy"是两件事）。'
      };
    }
    try {
      const mod = require(freshnessPath);
      freshnessJudge = mod;
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
        // R4 五态普查的计数器：只借 lib 的 `censusOf()`（与 entry 的判据同源），报告不自己写一份计数。
        censusOf: typeof mod.censusOf === 'function' ? mod.censusOf : null,
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
        censusOf: null,
        note: 'freshness 策略模块在盘上但**读不出来**（本轮不判定 currentness；这不是"没有 legacy"）。'
      };
    }
  })();

  /* ---------------- R4（§41 第 4 条）目录状态五态普查 ---------------- */
  //
  // 题面点名的条目是 Current / Aging / Legacy / Historical / Unknown model counts。此前报告里
  // **一个都不是普查**：unknown 用 `unknown release dates`（releasedAt 口径，数值 40 与
  // catalogStatus=unknown 的 40 相同纯属巧合）、legacy + historical 被合并成一行「仍在产物里」、
  // current / aging / historical 三档全文没有任何计数行。
  //
  // 判据层的**唯一出处**（报告不重算口径，只做三件事：取词表、取逐条值、调 lib 的计数器）：
  //   · 词表  = `lib/model-freshness.js` 的 `CATALOG_STATUSES`（上面 freshness.catalogStatuses 就是它）
  //   · 逐条值 = 发布产物 `models.json` 的 `catalogStatus`（**派生字段**：`lib/model-registry.js`
  //     把它列在 `DERIVED_KEYS` 里，来源层 `scripts/data/models.json` 手写即红 —— 所以只能读发布侧）
  //   · 计数  = `lib/model-freshness.js` 的 `censusOf()`（与 entry 的判据同源，报告不另写一份）
  // 相位差纪律（与本文件别处一致）：整层没落盘 ⇒ 如实报「分不出」，绝不用 0 冒充。
  const catalogStatusWordList = Array.isArray(freshness.catalogStatuses) ? freshness.catalogStatuses : null;
  const catalogStatusCensus = (() => {
    const base = {
      landed: false,
      statusOrder: catalogStatusWordList,
      counts: null,
      sum: null,
      registryModels: registryEntries.length,
      statusesOutsideWordList: [],
      reason: null
    };
    if (!catalogStatusLanded) {
      return Object.assign(base, { reason: '发布产物 models.json 里没有一个条目带 catalogStatus（freshness 派生层尚未落盘）——"分不出"与"五个 0"是两件事。' });
    }
    if (!catalogStatusWordList || typeof freshness.censusOf !== 'function') {
      return Object.assign(base, { reason: 'lib/model-freshness.js 没有给出词表或 censusOf()，普查没有判据层可依（不当成 0）。' });
    }
    const statusesOutsideWordList = uniqSorted(publishedModels
      .map(model => (model && model.catalogStatus === undefined ? null : (model ? model.catalogStatus : null)))
      .filter(status => status === null || !catalogStatusWordList.includes(status))
      .map(status => (status === null ? '(字段缺失)' : String(status))));
    const census = freshness.censusOf(publishedModels);
    const counts = {};
    for (const status of catalogStatusWordList) counts[status] = census.byStatus[status] || 0;
    return {
      landed: true,
      statusOrder: catalogStatusWordList,
      counts,
      sum: census.total,
      registryModels: registryEntries.length,
      statusesOutsideWordList,
      reason: null
    };
  })();
  const censusReading = catalogStatusCensus.landed
    ? catalogStatusCensus.statusOrder.map(status => `${status} ${catalogStatusCensus.counts[status]}`).join(' · ')
      + `（和 ${catalogStatusCensus.sum}）`
    : null;
  if (catalogStatusCensus.landed && catalogStatusCensus.statusesOutsideWordList.length) {
    problems.push(`R4 五态普查：发布产物 models.json 里有 ${catalogStatusCensus.statusesOutsideWordList.length} 个 catalogStatus 不在词表里（${catalogStatusCensus.statusesOutsideWordList.join('、')}）`
      + ' —— 词表的唯一出处是 lib/model-freshness.js 的 CATALOG_STATUSES；未知值不许静默并进 unknown，也不许在报告里自己加一档。');
  }
  if (catalogStatusCensus.landed && catalogStatusCensus.sum !== catalogStatusCensus.registryModels) {
    problems.push(`R4 五态普查不闭合：五态之和 ${catalogStatusCensus.sum}（${censusReading}）≠ registry 模型数 ${catalogStatusCensus.registryModels}`
      + '（scripts/data/models.json 的条目数）—— 普查必须把每一个 registry 模型恰好分到一档；'
      + '不等说明发布产物与来源层不同步（跑 build 或检查 models.json），或有一档被漏掉。');
  }

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

  /* ==================================================================== */
  /* v3（coverage-depth-v1）新增四节的**同一批数字**（文本与 JSON 双侧共用）  */
  /* ==================================================================== */
  //
  // 纪律（与上面 v2 各节逐字相同）：
  //   · 判据只有一份 —— 都在既有 lib 里，报告只"取词表 / 取逐条值 / 按维度分组"；
  //   · 相位差如实报 —— 整层没落盘就写"分不出"，绝不用 0 冒充；
  //   · 数组一律**确定性序**（code-unit 或显式规则），两次运行逐字节一致；
  //   · 新增内容全部追加进 `coverageTargets` 的**新键**，旧键一个字节都不动。

  /* ---------------- ① Release Evidence Coverage（v3） ---------------- */
  //
  // "有没有官方发布日期"的判据只有一份：`lib/model-freshness.js` 的 `releaseDateOf()`（`provided` 位）——
  // 与 `deriveCatalog()` 判 current / aging / legacy / historical / unknown 时用的是**同一个函数**。
  // 报告不另写一个"releasedAt 是不是空"的判断（那正是"两套口径"的起点）。
  const judgeReleaseDateOf = entry => (freshnessJudge && typeof freshnessJudge.releaseDateOf === 'function'
    ? freshnessJudge.releaseDateOf(entry)
    : null);
  const judgeModelRoleOf = entry => (freshnessJudge && typeof freshnessJudge.resolveModelRole === 'function'
    ? freshnessJudge.resolveModelRole(entry)
    : undefined);
  const freshnessJudgeAvailable = Boolean(freshnessJudge
    && typeof freshnessJudge.releaseDateOf === 'function'
    && typeof freshnessJudge.resolveModelRole === 'function'
    && typeof freshnessJudge.comparableGroupOf === 'function'
    && Array.isArray(freshness.catalogStatuses));
  /**
   * 占比（百分数，保留一位小数）。**纯观测指标**，不参与任何判定。
   *
   * 刻意写成 `(part / whole) * 100` 再 `toFixed(1)`：本仓库有一条跨文件的单位换算红线
   * （`api-plans-selftest.js` 会扫 scripts/ 下所有 .js），它盯的是"价格/额度类标识符与 1e3 / 1e6
   * 这类换算因子出现在同一行的算术表达式里"。这里做的是**百分比**，与单位换算无关，
   * 所以既不用那些因子，变量名也与价格/额度无关 —— 免得一条只该管计费的牙在这里误报。
   */
  const sharePercentOf = (part, whole) => (whole ? Number(((part / whole) * 100).toFixed(1)) : null);
  const releaseEvidenceRows = registryEntries.map(([slug, entry]) => {
    const info = facts.dimensions.models.bySlug[slug] || {};
    const date = judgeReleaseDateOf(entry);
    const role = judgeModelRoleOf(entry);
    const catalogStatus = info.catalogStatus === undefined ? null : info.catalogStatus;
    return {
      slug,
      developer: info.developer === undefined || info.developer === null || String(info.developer) === ''
        ? FIELD_MISSING_LABEL : String(info.developer),
      modelRole: role === undefined || role === null || role === ''
        ? FIELD_MISSING_LABEL : String(role),
      catalogStatus: catalogStatus === null ? FIELD_MISSING_LABEL : String(catalogStatus),
      provided: Boolean(date && date.provided === true),
      judgeable: Boolean(date && date.normalized !== null),
      withReleaseEvidence: Boolean(entry && Array.isArray(entry.releaseEvidence) && entry.releaseEvidence.length > 0)
    };
  });
  const bucketReleaseEvidence = (list, keyOf, compare, fillKeys) => {
    const map = new Map();
    const blank = key => ({ key, total: 0, known: 0, unknown: 0, unparsable: 0, withReleaseEvidence: 0 });
    for (const row of list) {
      const key = keyOf(row);
      const bucket = map.get(key) || blank(key);
      bucket.total += 1;
      if (row.provided) {
        bucket.known += 1;
        if (!row.judgeable) bucket.unparsable += 1;
      } else bucket.unknown += 1;
      if (row.withReleaseEvidence) bucket.withReleaseEvidence += 1;
      map.set(key, bucket);
    }
    // `fillKeys` = 有词表的维度（catalogStatus）：**一档不落地也印出来**（与 R4 五态普查同一纪律 ——
    // 少印一档会让读者以为那一档不存在，而不是那一档为 0）。
    const buckets = [...map.values()];
    for (const key of (Array.isArray(fillKeys) ? fillKeys : [])) {
      if (!map.has(key)) buckets.push(blank(key));
    }
    return buckets
      .map(bucket => Object.assign(bucket, { knownPercent: sharePercentOf(bucket.known, bucket.total) }))
      .sort(compare);
  };
  const byCountThenKey = (a, b) => (b.total - a.total) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  const catalogWordIndex = key => (catalogStatusWordList || []).indexOf(key);
  const byWordListThenKey = (a, b) => {
    const ai = catalogWordIndex(a.key);
    const bi = catalogWordIndex(b.key);
    const ar = ai < 0 ? Number.MAX_SAFE_INTEGER : ai;
    const br = bi < 0 ? Number.MAX_SAFE_INTEGER : bi;
    return (ar - br) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  };
  const releaseEvidence = (() => {
    const base = {
      source: 'scripts/data/models.json（来源层：releasedAt / developer / modelRole）+ 发布产物 models.json（派生层：catalogStatus）',
      judge: 'scripts/lib/model-freshness.js（releaseDateOf / resolveModelRole / CATALOG_STATUSES）',
      registryModels: registryEntries.length,
      releasedAtLanded,
      catalogStatusLanded,
      status: 'ok',
      known: null,
      unknown: null,
      unparsable: null,
      withReleaseEvidence: null,
      knownPercent: null,
      percentNote: '覆盖率百分比是**观测指标，不是 KPI**：没有目标线、没有权重、不进门禁、不参与任何判定 —— 它只回答"这一层今天长什么样"。',
      groupOrder: ['developer', 'modelRole', 'catalogStatus'],
      byDeveloper: null,
      byModelRole: null,
      byCatalogStatus: null,
      reason: null
    };
    if (!freshnessJudgeAvailable) {
      return Object.assign(base, {
        status: 'no-judge',
        reason: 'lib/model-freshness.js 没给出 releaseDateOf() / resolveModelRole() / comparableGroupOf() / CATALOG_STATUSES'
          + ' —— 没有判据层，本报告**不**自己发明一个"发布日期算不算写了"的判断（"分不出"与"0 条未知"是两件事）。'
      });
    }
    if (!releasedAtLanded) {
      return Object.assign(base, {
        status: 'no-release-field',
        reason: 'scripts/data/models.json 里没有一个条目带 releasedAt 字段（Model Registry v2 尚未落盘）—— 如实报"分不出"，不用 0 冒充。'
      });
    }
    const known = releaseEvidenceRows.filter(row => row.provided).length;
    const unknown = releaseEvidenceRows.length - known;
    const unparsable = releaseEvidenceRows.filter(row => row.provided && !row.judgeable).length;
    const byDeveloper = bucketReleaseEvidence(releaseEvidenceRows, row => row.developer, byCountThenKey);
    const byModelRole = bucketReleaseEvidence(releaseEvidenceRows, row => row.modelRole, byCountThenKey);
    const byCatalogStatus = catalogStatusLanded
      ? bucketReleaseEvidence(releaseEvidenceRows, row => row.catalogStatus, byWordListThenKey, catalogStatusWordList)
      : null;
    return Object.assign(base, {
      known,
      unknown,
      unparsable,
      withReleaseEvidence: releaseEvidenceRows.filter(row => row.withReleaseEvidence).length,
      knownPercent: sharePercentOf(known, releaseEvidenceRows.length),
      byDeveloper,
      byModelRole,
      byCatalogStatus,
      reason: null
    });
  })();
  // 两处读数必须同时成立：新读数（lib 的 releaseDateOf().provided）↔ 既有 "unknown release dates"。
  // 分家就说明"有没有 releasedAt"有了两个判据 —— 那正是本报告最该当场报红的事。
  if (releaseEvidence.status === 'ok' && unknownReleaseDates !== null
    && releaseEvidence.unknown !== unknownReleaseDates.length) {
    problems.push(`Release Evidence Coverage 与既有 "unknown release dates" 两处读数不一致（新读数 ${releaseEvidence.unknown} / 既有 ${unknownReleaseDates.length}）`
      + ' —— "有没有官方发布日期"只能有一个判据（lib/model-freshness.js 的 releaseDateOf()），两处必须同时成立。');
  }
  if (releaseEvidence.status === 'ok' && releaseEvidence.unparsable > 0) {
    problems.push(`Release Evidence Coverage：有 ${releaseEvidence.unparsable} 条模型的 releasedAt **写了但解析不出可判日**（形如 YYYY-MM-DD）`
      + ' —— 写着的日期与 freshness 的判据分家了：要么把日期改成真实日期，要么改判据层（lib/model-freshness.js 的 normalizeReleaseDate）。');
  }
  for (const [name, list] of [['byDeveloper', releaseEvidence.byDeveloper], ['byModelRole', releaseEvidence.byModelRole], ['byCatalogStatus', releaseEvidence.byCatalogStatus]]) {
    if (!Array.isArray(list)) continue;
    const sum = list.reduce((total, bucket) => total + bucket.total, 0);
    if (sum !== registryEntries.length) {
      problems.push(`Release Evidence Coverage 的 ${name} 拆分不闭合：各档之和 ${sum} ≠ registry 模型数 ${registryEntries.length}`
        + ' —— 每一个模型必须恰好落进一档（少一档说明有一类值被静默丢掉了）。');
    }
  }

  /* ---------------- ② Model Release Evidence Queue（v3） ---------------- */
  //
  // 只读队列：把"优先补哪几条发布日期"变成一条**可复算的次序**，而不是一句"先补重要的"。
  // 规则原文（下面 rules 数组）会逐字打印进报告 —— 读者不必猜排序依据。
  // 没有任何主观分：五条规则全部是盘上事实（字段是否为空 / 组大小 / tier / 下游引用 / slug 次序）。
  const releaseEvidenceQueue = (() => {
    const tierRankOf = { core: 0, major: 1, 'long-tail': 2 };
    const tiersInUse = coverageTargets.TIERS;
    const rows = registryEntries.map(([slug, entry]) => {
      const info = facts.dimensions.models.bySlug[slug] || {};
      const date = judgeReleaseDateOf(entry);
      const provider = info.provider === undefined ? null : info.provider;
      const summary = provider ? targetSummaries.find(row => row.provider === provider) : null;
      // tier 读 coverage-targets.json；够不到 target 的（归属不在覆盖宇宙里）按 long-tail —— 这是规则③的原文。
      const tier = summary && tiersInUse.includes(summary.tier) ? summary.tier : 'long-tail';
      return {
        slug,
        developer: info.developer === undefined || info.developer === null ? null : String(info.developer),
        family: entry && entry.family !== undefined && entry.family !== null ? String(entry.family) : null,
        modelRole: (() => { const role = judgeModelRoleOf(entry); return role === undefined || role === null ? null : String(role); })(),
        releasedAt: entry && entry.releasedAt !== undefined ? entry.releasedAt : null,
        releasedAtUnknown: !(date && date.provided === true),
        groupKey: null,
        groupKind: null,
        groupDegraded: null,
        groupLabel: null,
        groupSize: 0,
        provider,
        tier,
        tierRank: tierRankOf[tier] === undefined ? 2 : tierRankOf[tier],
        referencedByApiPlans: apiModelKeys.has(slug),
        referencedByPlans: false,
        referenced: false
      };
    });
    const bySlug = new Map(rows.map(row => [row.slug, row]));
    // ② 可比组规模：组键的唯一判据在 lib/model-freshness.js 的 comparableGroupOf()
    //   （`freshnessGroup` 优先，否则 developer + family + modelRole）——报告不另写一个组键算法。
    if (freshnessJudge && typeof freshnessJudge.comparableGroupOf === 'function') {
      const describe = typeof freshnessJudge.describeGroupKey === 'function'
        ? freshnessJudge.describeGroupKey : key => String(key);
      const size = new Map();
      for (const row of rows) {
        const entry = registryLoaded.table[row.slug] || {};
        const group = freshnessJudge.comparableGroupOf(entry);
        row.groupKey = group.key;
        row.groupKind = group.source;
        row.groupDegraded = group.degraded === true;
        row.groupLabel = describe(group.key);
        size.set(group.key, (size.get(group.key) || 0) + 1);
      }
      for (const row of rows) row.groupSize = row.groupKey === null ? 0 : (size.get(row.groupKey) || 0);
    }
    // ④ 是否被 api-plans.json 或 plans.json 引用：api 侧按 api-plans 的 modelKey，套餐侧按关系层的 Coding 映射。
    if (Array.isArray(relations)) {
      for (const link of relations) {
        if (!link || link.registrySlug === undefined || link.registrySlug === null) continue;
        const row = bySlug.get(String(link.registrySlug));
        if (!row) continue;
        if (link.apiPlanId) row.referencedByApiPlans = true;
        if (link.planId) row.referencedByPlans = true;
      }
    }
    for (const row of rows) row.referenced = row.referencedByApiPlans || row.referencedByPlans;
    // 五条规则的比较器（顺序即优先级；先比出来的先决定次序，同则看下一条）
    const compare = (a, b) => {
      if (a.releasedAtUnknown !== b.releasedAtUnknown) return a.releasedAtUnknown ? -1 : 1;   // ① 未知优先
      if (a.groupSize !== b.groupSize) return b.groupSize - a.groupSize;                       // ② 可比组规模降序
      if (a.tierRank !== b.tierRank) return a.tierRank - b.tierRank;                           // ③ core > major > long-tail
      if (a.referenced !== b.referenced) return a.referenced ? -1 : 1;                         // ④ 被下游引用优先
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;                                   // ⑤ slug 的 code-unit 序
    };
    const ordered = [...rows].sort(compare);
    const queue = ordered.slice(0, RELEASE_QUEUE_LIMIT).map((row, index) => Object.assign({ rank: index + 1 }, row));
    return {
      limit: RELEASE_QUEUE_LIMIT,
      rules: [
        '① `releasedAt` 为空（null 或字段缺席）的优先 —— 与报告既有 `unknown release dates` 同一判据（lib/model-freshness.js 的 `releaseDateOf().provided`）；已经写下发布日期的排在其后。',
        '② 可比组规模**降序**：组键由 lib/model-freshness.js 的 `comparableGroupOf()` 给出（`freshnessGroup` 显式优先，否则 `developer + family + modelRole`）；组越大，一次补全能修好的相对读数越多。',
        '③ provider tier：`core` > `major` > `long-tail`（tier 读 `scripts/data/coverage-targets.json` 的意图行）；归属够不到任何 target 的模型按 `long-tail`。',
        '④ 是否被 `api-plans.json` 或 `plans.json` 引用（是 > 否）：api 侧按 api-plans 里出现过的 `modelKey`，套餐侧按关系层 `model-registry-links.json` 的 Coding 映射认领到的 slug。',
        '⑤ tiebreak：`slug` 的 **code-unit 序**（不用 localeCompare —— 它随 ICU 版本变，会让两次运行不再逐字节一致）。'
      ],
      ruleNote: '先命中先决定次序（比较器按 ①→②→③→④→⑤ 逐条比）；没有任何主观分、没有加权、没有伪精确分数。'
        + ` 队列覆盖全部 ${registryEntries.length} 个 registry 模型，下面只打印前 ${RELEASE_QUEUE_LIMIT} 条（固定常量 RELEASE_QUEUE_LIMIT）。`,
      total: rows.length,
      unknownCount: rows.filter(row => row.releasedAtUnknown).length,
      knownCount: rows.filter(row => !row.releasedAtUnknown).length,
      groupJudgeAvailable: Boolean(freshnessJudge && typeof freshnessJudge.comparableGroupOf === 'function'),
      queue
    };
  })();

  /* ---------------- ③ Source Reliability summary（v3） ---------------- */
  //
  // 这一节把三份东西对到一起：**人工裁决**（scripts/data/source-rulings.json，workstream C 的写域）、
  // **采集器注册表**（scripts/collectors 的 list()）、**心跳**（scripts/data/source-health.json 的 live 读数）。
  // 判据（schema 校验 + 稳定序 + 三方对账）全部在 `scripts/lib/source-rulings.js`，报告只做 join 与排版。
  const collectorRows = (() => {
    try {
      const mod = require(COLLECTORS_INDEX);
      return typeof mod.list === 'function' ? mod.list() : null;
    } catch (error) {
      return null;
    }
  })();
  if (!collectorRows) {
    problems.push('scripts/collectors 注册表读不出来 —— 「裁决 ↔ 采集器注册表 ↔ source-health」三方对账缺了第二方，'
      + '本节的"注册表"一栏无从判定（缺输入不是通过）。');
  }
  const sourceRulingsLoaded = sourceRulings.load(SOURCE_RULINGS_FILE);
  const rulingsValidationProblems = sourceRulingsLoaded.doc ? sourceRulings.validateRulings(sourceRulingsLoaded.doc) : [];
  const rulingsReconciled = sourceRulings.reconcileRulings({
    doc: sourceRulingsLoaded.doc,
    registrySources: collectorRows || [],
    healthSources: sourceHealthDoc && Array.isArray(sourceHealthDoc.sources) ? sourceHealthDoc.sources : []
  });
  if (sourceRulingsLoaded.broken) {
    problems.push(`scripts/data/source-rulings.json 解析失败：${sourceRulingsLoaded.broken}`);
  } else if (sourceRulingsLoaded.missing) {
    // 优雅降级**但不静默**：这一层由 workstream C 落盘，落盘前报告要能照常为别的层出数 ——
    // 所以它进 `pendingLayers`（显式计入自检口径、写进文本与 JSON），而不是硬红、更不是当通过。
    pendingLayers.push({
      file: 'scripts/data/source-rulings.json',
      layer: 'source-rulings（长期失败来源的人工裁决）',
      note: '尚未落盘 —— 「裁决 ↔ 采集器注册表 ↔ source-health」三方对账本轮没有输入（**不是"没有长期失败的来源"，也不是"全部健康"**）；'
        + '这一层由 workstream C 落盘，落盘后本报告会自动开始对账，并对 schema 与三条硬关系逐条判红。'
    });
  } else {
    problems.push(...rulingsValidationProblems);
    problems.push(...rulingsReconciled.problems);
  }
  // 裁决 → 身份（id 与 name 两种写法都能命中；gap queue 的"来源困难"要按 source-health 的 name 查）
  const rulingBySourceName = new Map();
  for (const row of rulingsReconciled.rows) {
    for (const token of [row.source, row.registry && row.registry.id, row.registry && row.registry.name,
      row.health && row.health.id, row.health && row.health.name]) {
      if (token === null || token === undefined || token === '') continue;
      const key = String(token);
      if (!rulingBySourceName.has(key)) rulingBySourceName.set(key, row);
    }
  }
  const sourceReliability = {
    file: 'scripts/data/source-rulings.json',
    present: Boolean(sourceRulingsLoaded.doc),
    notLanded: sourceRulingsLoaded.missing === true,
    broken: sourceRulingsLoaded.broken === null ? null : sourceRulingsLoaded.broken,
    schemaVersion: sourceRulingsLoaded.doc && sourceRulingsLoaded.doc.schemaVersion !== undefined
      ? sourceRulingsLoaded.doc.schemaVersion : null,
    reviewedAt: sourceRulingsLoaded.doc && sourceRulingsLoaded.doc.reviewedAt !== undefined
      ? sourceRulingsLoaded.doc.reviewedAt : null,
    // 「必须打印 generatedAt」：这是心跳文件自己的时间戳（**不是**跑报告的墙钟时间）——
    // 本节的 live 读数全部出自这一次心跳，读者要能判断它有多新。
    healthFile: 'scripts/data/source-health.json',
    healthGeneratedAt: sourceHealthDoc && sourceHealthDoc.generatedAt !== undefined ? sourceHealthDoc.generatedAt : null,
    healthRowCount: sourceHealthDoc && Array.isArray(sourceHealthDoc.sources) ? sourceHealthDoc.sources.length : 0,
    collectorRegistryFile: 'scripts/collectors（index.js 的 list()）',
    collectorRegistryCount: collectorRows ? collectorRows.length : null,
    decisionOrder: sourceRulings.DECISIONS.slice(),
    decisionCounts: rulingsReconciled.byDecision,
    rulings: rulingsReconciled.rows,
    validationProblems: rulingsValidationProblems,
    validationProblemCount: rulingsValidationProblems.length,
    reconciliation: {
      judge: 'scripts/lib/source-rulings.js 的 reconcileRulings()',
      ruleCount: 4,
      ruleNote: '① retire 的来源不得在注册表；② consecutiveFailures ≥ 3 的来源必须有裁决；'
        + '③ repair / headless-migrate 的来源必须在注册表；④ 非 retire 的裁决必须命中一个真实身份（id 或 name）。',
      problemCount: rulingsReconciled.problems.length,
      problems: rulingsReconciled.problems,
      unruledRegistrySources: rulingsReconciled.unruledRegistrySources,
      failuresRequiringRuling: rulingsReconciled.failuresRequiringRuling,
      missingRulingsForFailures: rulingsReconciled.missingRulingsForFailures,
      retireStillRegistered: rulingsReconciled.retireStillRegistered,
      retireStillInHealth: rulingsReconciled.retireStillInHealth,
      repairOrMigrateUnregistered: rulingsReconciled.repairOrMigrateUnregistered,
      unresolvedSources: rulingsReconciled.unresolvedSources
    },
    // R8 的来源宇宙对照：**沿用既有 sourceHealth.registryRowCount / registryRows / registryOnlySources 口径**
    // （同一批变量，不另算一份；自测里有一条断言要求这两处逐字相等）。
    registryRowCount: sourceHealthRegistryNames.length,
    registryRows: sourceHealthRegistryNames,
    registryOnlySources: sourceHealthRegistryOnly,
    notLandedNote: sourceRulingsLoaded.missing
      ? 'source-rulings 层尚未落盘（本节的裁决读数为空是"没有输入"，不是"没有长期失败的来源"）。'
      : null
  };

  /* ---------------- ④ Gap Closure Queue（v3） ---------------- */
  //
  // 把 MISSING / PARTIAL 排成"先做哪一格"的队列。分层的判据**全部是既有读数**：
  // tier（coverage-targets.json）、维度是否高价值（常量 HIGH_VALUE_DIMENSIONS）、
  // 这一格有没有把要覆盖的那一条写成可回指的实体（declared > 0）、
  // 以及它依赖的来源现在什么状态（source-health 的 live 读数 + source-rulings 的裁决）。
  // 没有主观分、没有加权、没有伪精确分数。
  const gapClosureQueue = (() => {
    const cells = [...derived.missing, ...derived.partial];
    const dimensionIndex = dimension => coverageTargets.DIMENSIONS.indexOf(dimension);
    const sourcesOfProvider = new Map();
    for (const target of derived.targets) {
      const names = [];
      for (const dimension of coverageTargets.DIMENSIONS) {
        for (const source of (target.dimensions[dimension].sources || [])) {
          if (source && source.name) names.push(String(source.name));
        }
      }
      sourcesOfProvider.set(target.provider, [...new Set(names)].sort());
    }
    const orders = { A: 0, B: 1, C: 2, D: 3 };
    const rows = cells.map(cell => {
      const summary = summaryOf(cell.provider);
      const tier = summary && coverageTargets.TIERS.includes(summary.tier) ? summary.tier : 'long-tail';
      const names = sourcesOfProvider.get(cell.provider) || [];
      const hardSources = [];
      const costlySources = [];
      for (const name of names) {
        const health = facts.sourceHealth[name] || null;
        const ruling = rulingBySourceName.get(name) || null;
        const unhealthy = Boolean(health && health.status && health.status !== 'healthy');
        const ruled = Boolean(ruling && ['retire', 'keep-degraded', 'repair', 'headless-migrate'].includes(ruling.decision));
        if (unhealthy || ruled) hardSources.push(name);
        if (ruling && ruling.overlap && ruling.overlap.maintenanceCost === 'high') costlySources.push(name);
      }
      const highValue = HIGH_VALUE_DIMENSIONS.includes(cell.dimension);
      const explicitSource = cell.declared > 0;
      const sourceHard = hardSources.length > 0;
      const highCost = costlySources.length > 0;
      const priority = (tier === 'core' || tier === 'major')
        ? (tier === 'core' && highValue && explicitSource && !sourceHard && !highCost ? 'A'
          : (tier === 'major' && explicitSource && !sourceHard && !highCost ? 'B' : 'C'))
        : 'D';
      return {
        priority,
        provider: cell.provider,
        name: cell.providerName,
        tier,
        role: summary ? summary.role : null,
        dimension: cell.dimension,
        dimensionLabel: coverageTargets.DIMENSION_LABEL[cell.dimension],
        state: cell.state,
        exitState: cell.state,
        targetN: cell.declared,
        coveredM: cell.resolved,
        missingK: cell.declared - cell.resolved,
        present: cell.present,
        highValue,
        explicitSource,
        sourceHard,
        highCost,
        declaredSources: names,
        hardSources,
        costlySources,
        // `present` 是"盘上这一维度有没有记录"，与 N/M/K 是两条不同的轴：
        // 一条 current target 都没声明的格子（N=0、K=0）照样可能是 MISSING —— 因为盘上一条记录都没有。
        reason: cell.reason
      };
    });
    const ordered = [...rows].sort((a, b) => (orders[a.priority] - orders[b.priority])
      || (a.tier < b.tier ? -1 : a.tier > b.tier ? 1 : 0)
      || (a.provider < b.provider ? -1 : a.provider > b.provider ? 1 : 0)
      || (dimensionIndex(a.dimension) - dimensionIndex(b.dimension)));
    const counts = { A: 0, B: 0, C: 0, D: 0 };
    for (const row of rows) counts[row.priority] += 1;
    if (ordered.length !== derived.missing.length + derived.partial.length) {
      problems.push(`Gap Closure Queue 条数 ${ordered.length} ≠ MISSING ${derived.missing.length} + PARTIAL ${derived.partial.length}`
        + ' —— 队列必须恰好收下每一格真缺口与每一个部分兑现的格子，不多不少。');
    }
    if (counts.A + counts.B + counts.C + counts.D !== ordered.length) {
      problems.push(`Gap Closure Queue 分层不闭合：A+B+C+D = ${counts.A + counts.B + counts.C + counts.D} ≠ 队列条数 ${ordered.length}。`);
    }
    for (const row of rows) {
      if (row.coveredM > row.targetN) {
        problems.push(`Gap Closure Queue：${row.provider} 的 ${row.dimension} 格"已兑现 ${row.coveredM}"大于"目标 ${row.targetN}" —— 兑现数不可能超过声明数。`);
      }
    }
    return {
      rules: [
        '「官方来源明确」= 这一格声明了至少一条 current target（`declared ≥ 1`）：意图层把"要覆盖的那一条"写成了可回指的实体（deals→`source` / coding→`planName` / api→`modelKey` / models→`registrySlug`）。只写了维度散文、没有实体的格子不算"来源明确"。',
        '「来源困难」= 这家 provider 在各维度声明的来源里，至少一条满足：source-health 的 live 状态 ≠ `healthy`，或已被 `scripts/data/source-rulings.json` 裁决为 retire / keep-degraded / repair / headless-migrate 之一。',
        '「高维护成本」= 来源裁决里的 overlap.maintenanceCost = high。它**并入**上面的"来源困难"：一个核心平台的缺口若依赖高维护成本的来源，它仍然是"要做但难做"（C 档），不是"可以不做"（D 档）。',
        `「高价值维度」= ${HIGH_VALUE_DIMENSIONS.join(' / ')}（固定常量 HIGH_VALUE_DIMENSIONS）：这两个维度的缺口直接决定"这家平台在页面上有没有可用的价格或模型身份"。`,
        'A = tier=core ∧ 维度∈高价值维度 ∧ 官方来源明确 ∧ ¬来源困难 ∧ ¬高维护成本',
        'B = tier=major ∧ 官方来源明确 ∧ ¬来源困难 ∧ ¬高维护成本',
        'C = tier∈{core, major} 但够不上 A / B：来源困难、或高维护成本、或还没把"要覆盖的那一条"写成可回指的实体、或 core 的非高价值维度',
        'D = tier=long-tail（长尾平台，维护成本按定义为最高）',
        '先命中先归，判定顺序 A → B → C → D（每个格子恰好落进一档）。层内次序：priority → tier 的 code-unit 序 → provider 的 code-unit 序 → 维度序（' + coverageTargets.DIMENSIONS.join(' → ') + '）。'
      ],
      exitRule: '每一格的出口只有两条（与 coverage-targets.json 的裁决机制同一套）：把"缺 K 条"补齐（→ COVERED / PARTIAL 变 COVERED），'
        + '或在 scripts/data/coverage-targets.json 的 `rulings` 里写一条 deferred / unverifiable / schema-not-supported（→ DEFERRED / UNVERIFIABLE）。'
        + '「出口状态」列印的是这一格**此刻**的派生状态。',
      highValueDimensions: HIGH_VALUE_DIMENSIONS.slice(),
      priorityOrder: ['A', 'B', 'C', 'D'],
      counts,
      total: ordered.length,
      queue: ordered
    };
  })();

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
  kv('provider 数（仅 type=deal）', dealVendorRows.length, `只数 type=deal 的 ${dealRows.length} 行归一后的厂商键（不含未识别）；type=tool 的 ${toolRows.length} 行不进 provider universe`);
  kv('工具行厂商数（对照，不计入）', toolVendorKeys.size, `type=tool 共 ${toolRows.length} 行；它们的厂商串同样带 vendor 原始串，但没有归一规则、也没有套餐/计费侧身份`);
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
  // API 侧与 Coding 侧**对称**：都有"已映射"与"已声明不对应单一模型身份"两个出口。
  // 三个数必须把每一条计价条目恰好分完（见上方 apiEquationTotal 的闭合断言）。
  kv('已映射认领 API 计价条目', mappedApiEntries, '按展开后的 (planId, modelKey, variant) 记账：通配映射只算它真实展开到的条目');
  kv('已处置声明的 API 计价条目', declaredApiIdentityCount, `model-registry-gaps.json 的 API 侧声明展开后覆盖的条目（当前 ${declaredApiRows.length} 条声明 · reason=off-registry-model）`);
  kv('未判 API 计价条目', unmappedApiEntries, '既没有映射、也没有处置声明（必须为 0；不为 0 时本报告自检非 0，与 validateLinks 同一口径）');
  line(`  API 侧记账：计价条目 ${apiPricingEntries} 条 = 已映射认领 ${mappedApiEntries} + 已处置声明 ${declaredApiIdentityCount} + 未判 ${unmappedApiEntries}`);
  kv('已映射 Coding 模型串', planCoverage.planModelStrings - planCoverage.unmappedPlanModels.length - planCoverage.declaredPlanModels.length, `共 ${planCoverage.planModelStrings} 条；关系层里 Coding 映射 ${planCoverage.codingLinks} 条`);
  kv('已声明"不对应单一模型身份"（套餐侧）', planCoverage.declaredPlanModels.length, '模型池 / 系列名 / 一个串多个模型 / registry 没有的身份 / 图像语音资源（逐条见缺口 5 下方）');
  kv('已声明"不对应单一模型身份"（API 侧）', declaredApiRows.length, 'reason=off-registry-model（逐条见缺口 5 下方的 API 侧清单；与套餐侧是两个出口、同一本账）');
  line('');

  line('── 缺口 1：有 Deals 无 Plans 的 provider ────────────────────────────');
  if (!dealsWithoutPlans.length) line('  （无）');
  dealsWithoutPlans.forEach(key => line(`  · ${key}（${providers.providerNameOf(key, providerTable)}）`));
  line('');

  line('── 缺口 2：有 Plans 无 Deals 的 provider ────────────────────────────');
  if (!plansWithoutDeals.length) line('  （无）');
  plansWithoutDeals.forEach(key => line(`  · ${key}（${providers.providerNameOf(key, providerTable)}）   ${planProviderCount.get(key).count} 条套餐`));
  line('');

  line('── 缺口 3：有 API Pricing 既无映射、也无处置声明的计价条目（未判）──');
  line(`  （口径：计价条目 ${apiPricingEntries} 条 − 映射认领 ${mappedApiEntries} − 处置声明 ${declaredApiIdentityCount} = 未判 ${unmappedApiEntries}；不为 0 时报告自检非 0）`);
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
  line('── 已声明"不对应单一模型身份"的 API 计价条目（有理由的缺口，不是漏判）──');
  // 与套餐侧同一件事的另一半：声明过的计价条目**有结局**（结局 = 对不上任何 registry 身份），
  // 所以它们不在"未判"里、也不在"已映射"里 —— 它们是第三格。
  if (!declaredApiRows.length) line('  （无）');
  for (const row of declaredApiRows) {
    const who = row.provider === null || row.provider === undefined
      ? `（provider 读不出：记录 ${row.apiPlanId} 不在 api-plans.json 里）`
      : `${providers.providerNameOf(row.provider, providerTable)}（${row.provider}）`;
    const variant = row.variant === null || row.variant === undefined ? '(通配)' : row.variant;
    line(`  · ${who} / ${row.apiPlanId} → ${row.modelKey} · ${variant} → ${row.reason}`);
  }
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
  line('── 分维度覆盖 / Provider coverage by dimension（provider × 维度 · 派生七态 · v2）──');
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
  line('── 真缺口 / Missing Current Targets：MISSING targets（可覆盖、未延期、来源健康，但盘上一条记录都没有）──');
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
  line('── 有理由的缺口 ① / Deferred Complexity Providers：DEFERRED（人工裁决延期 —— **永不算 MISSING**）──');
  if (!derived.deferred.length) line('  （无）');
  for (const row of derived.deferred) {
    line(`  · ${row.providerName || row.provider}（${row.provider}） ${coverageTargets.DIMENSION_LABEL[row.dimension]}：${row.reason}`);
  }
  line('');
  line('── 有理由的缺口 ② / Unverifiable Providers：UNVERIFIABLE（查过，官方来源不可核）──');
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
  // §41 第 4 条（R4）的五态普查：一档一行、五档俱全，和必须等于 registry 模型数（不等即报告自检非 0）。
  // 这一行是**普查**，与上面两行不同口径的读数各说各的：`unknown release dates` 是 releasedAt 口径
  // （它的 40 与 catalogStatus=unknown 的 40 相同纯属巧合）、`legacy / historical 保留` 是"仍在产物里"。
  if (catalogStatusCensus.landed) {
    kv('catalogStatus 普查', censusReading, `五态和必须 == registry 模型数 ${catalogStatusCensus.registryModels}（不等 ⇒ 报告自检非 0）`);
    line('      口径：词表 = lib/model-freshness.js 的 CATALOG_STATUSES · 逐条值 = 发布产物 models.json 的 catalogStatus（派生字段，来源层手写即红）· 计数 = 同模块的 censusOf()');
    line('      复算：node -e "const m=require(\'./models.json\').models;const c={};for(const v of m)c[v.catalogStatus]=(c[v.catalogStatus]||0)+1;console.log(c)"');
  } else {
    line(`  catalogStatus 普查：**分不出** —— ${catalogStatusCensus.reason}`);
    line('                        五个 0 与"分不出"是两件事；这里如实报后者，也不拿 releasedAt 口径顶替。');
  }
  kv('来源层 status=retired', retiredInSource.length, retiredInSource.slice(0, 8).join(', ') || '（无）');
  kv('归属不到 Target provider 的 registry 模型', registryDevelopersWithoutProvider.length, '这些模型从覆盖宇宙里够不到（models.json 允许 _developers_extra，所以不是报告自身的问题）');
  registryDevelopersWithoutProvider.forEach(item => line(`      · ${item.slug}（developer=${item.developer === null ? '(空)' : item.developer} / owner=${item.owner === null ? '(空)' : item.owner}）`));
  line('');
  line('── Source Health impact（v2）────────────────────────────────────────');
  kv('声明的来源数', sourceHealthRows.length, '意图层里写过的 deals source（source-health 的 name 或 deals.json 出现过的 source）');
  // R8 的来源宇宙对照（t46 / F5）：把「注册表几行」与「本节收了几行」的差显式写出来，
  // 免得这一节被读成"全站来源总表"。
  line(`  · 来源宇宙对照：scripts/data/source-health.json 注册表共 ${sourceHealthRegistryNames.length} 行；`
    + `其中挂在 target 上的 ${declaredSourceNameSet.size} 行（= 本节所列）；`
    + `差集 ${sourceHealthRegistryOnly.length} 行（${sourceHealthRegistryOnly.join(' / ') || '（无）'} —— 不属于任何 target，`
    + '但仍在全站采集链上：它们变坏不会出现在这一节里，那是口径边界，不是漏报）');
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
  line('── Release Evidence Coverage（v3 新增 · 官方发布日期写下了多少）──────');
  line(`  判据层：${releaseEvidence.judge} —— 报告不重算口径，只按既有判据分组`);
  if (releaseEvidence.status === 'ok') {
    kv('registry 模型数', releaseEvidence.registryModels, `来源层 ${releaseEvidence.source}`);
    kv('已知 official release date', releaseEvidence.known, `= ${releaseEvidence.knownPercent}%（**百分比是观测指标，不是 KPI**：没有目标线、不进门禁、不参与判定）`);
    kv('未知 official release date', releaseEvidence.unknown, 'releasedAt 为 null 或字段缺席（与报告的 unknown release dates 同一判据）');
    kv('带 releaseEvidence 引文', releaseEvidence.withReleaseEvidence, '这一栏只是观测：`releasedAt` 与 `releaseEvidence` 互为充要的判据归 lib/model-registry.js（本条不另立判据）');
    const bucketLine = (label, list) => {
      if (!Array.isArray(list)) return;
      line(`  ${label}拆分（按档位条数降序）：`);
      for (const bucket of list) {
        line(`      ${String(bucket.key).padEnd(24)} 共 ${String(bucket.total).padStart(3)} · 已知 ${String(bucket.known).padStart(3)} · 未知 ${String(bucket.unknown).padStart(3)} · 已知率 ${bucket.knownPercent === null ? '(空)' : `${bucket.knownPercent}%`}`);
      }
    };
    bucketLine('developer ', releaseEvidence.byDeveloper);
    bucketLine('modelRole ', releaseEvidence.byModelRole);
    if (releaseEvidence.byCatalogStatus) {
      line('  catalogStatus 拆分（词表序 = lib/model-freshness.js 的 CATALOG_STATUSES）：');
      for (const bucket of releaseEvidence.byCatalogStatus) {
        line(`      ${String(bucket.key).padEnd(24)} 共 ${String(bucket.total).padStart(3)} · 已知 ${String(bucket.known).padStart(3)} · 未知 ${String(bucket.unknown).padStart(3)} · 已知率 ${bucket.knownPercent === null ? '(空)' : `${bucket.knownPercent}%`}`);
      }
    } else {
      line('  catalogStatus 拆分：**分不出** —— 发布产物 models.json 里没有一个条目带 catalogStatus（freshness 派生层尚未落盘）。');
    }
  } else {
    line(`  **分不出**（${releaseEvidence.status}）：${releaseEvidence.reason}`);
  }
  line('');

  line('── Model Release Evidence Queue（v3 新增 · 只读优先队列）────────────');
  line(`  队列共 ${releaseEvidenceQueue.total} 条（= registry 模型数；未知发布日期 ${releaseEvidenceQueue.unknownCount} 条 / 已知 ${releaseEvidenceQueue.knownCount} 条），下面打印前 ${releaseEvidenceQueue.limit} 条`);
  line('  排序规则（原文；判据全部来自盘上事实，没有任何主观分）：');
  for (const rule of releaseEvidenceQueue.rules) line(`      ${rule}`);
  line(`  说明：${releaseEvidenceQueue.ruleNote}`);
  line('  前 N 条：');
  if (!releaseEvidenceQueue.queue.length) line('      （无）');
  for (const row of releaseEvidenceQueue.queue) {
    line(`      ${String(row.rank).padStart(3)}. ${String(row.slug).padEnd(28)} ${row.releasedAtUnknown ? 'releasedAt=未知' : `releasedAt=${row.releasedAt}`}`
      + `  组 ${String(row.groupSize).padStart(2)}（${row.groupLabel === null ? '(无判据层)' : row.groupLabel}）`
      + `  tier=${row.tier}  下游引用=${row.referenced ? '是' : '否'}`);
  }
  line('');

  line('── Gap Closure Queue（v3 新增 · MISSING / PARTIAL 分层）──────────────');
  line(`  队列共 ${gapClosureQueue.total} 条：A ${gapClosureQueue.counts.A} · B ${gapClosureQueue.counts.B} · C ${gapClosureQueue.counts.C} · D ${gapClosureQueue.counts.D}`);
  line('  分层规则（原文；判据全部来自既有读数，没有伪精确分数）：');
  for (const rule of gapClosureQueue.rules) line(`      ${rule}`);
  line(`  出口：${gapClosureQueue.exitRule}`);
  line('  逐条（目标 N / 已兑现 M / 缺 K / 出口状态）：');
  if (!gapClosureQueue.queue.length) line('      （无）');
  for (const row of gapClosureQueue.queue) {
    line(`      [${row.priority}] ${String(row.provider).padEnd(12)} ${String(row.name || '').padEnd(16)} ${String(row.tier).padEnd(9)} ${row.dimensionLabel}：目标 ${row.targetN} / 已兑现 ${row.coveredM} / 缺 ${row.missingK}`
      + ` · 盘上记录 ${row.present} · 出口状态 ${row.exitState}`
      + `${row.sourceHard ? ` · 来源困难（${row.hardSources.join('、')}）` : ''}${row.highCost ? ` · 高维护成本（${row.costlySources.join('、')}）` : ''}`);
    line(`            ${row.reason}`);
  }
  line('');

  line('── Source Reliability summary（v3 新增 · 裁决 × live 读数）───────────');
  line(`  心跳：${sourceReliability.healthFile} 的 generatedAt = ${sourceReliability.healthGeneratedAt === null ? '(文件里没有 generatedAt)' : sourceReliability.healthGeneratedAt}`);
  line(`        本节所有 live 读数都出自**这一次**心跳（不是跑报告的墙钟时间）；它越旧，下面的 status 越不可信。`);
  line(`  裁决表：${sourceReliability.file} —— ${sourceReliability.notLanded ? '**尚未落盘**（未落盘 ≠ 通过：本轮三方对账没有输入）' : `已落盘（reviewedAt=${sourceReliability.reviewedAt === null ? '(未写)' : sourceReliability.reviewedAt}）`}`);
  line(`  注册表：${sourceReliability.collectorRegistryFile} 共 ${sourceReliability.collectorRegistryCount === null ? '(读不出)' : sourceReliability.collectorRegistryCount} 行`
    + ` · source-health 注册表共 ${sourceReliability.registryRowCount} 行（沿用既有 registryRowCount 口径）`);
  if (sourceReliability.notLanded) {
    line(`  ⚠️ ${sourceReliability.notLandedNote}`);
  } else {
    line(`  裁决分布：${sourceReliability.decisionOrder.map(decision => `${decision}=${sourceReliability.decisionCounts[decision]}`).join(' · ')}`);
    line('  逐条（裁决 × 注册表 × 心跳）：');
    if (!sourceReliability.rulings.length) line('      （无裁决）');
    for (const row of sourceReliability.rulings) {
      const where = row.registry ? `注册表 id=${row.registry.id}` : '不在注册表';
      const health = row.health
        ? `health ${row.health.status}${row.health.reason ? `/${row.health.reason}` : ''}（连续失败 ${row.health.consecutiveFailures}）`
        : 'health 无此行';
      line(`      · ${String(row.source).padEnd(20)} ${String(row.decision).padEnd(17)} ← ${where} · ${health}`);
      line(`        理由：${row.reason}`);
      if (row.whyKept) line(`        保留理由：${row.whyKept}`);
      if (row.revisitBy) line(`        复查条件：${row.revisitBy}`);
      if (row.headlessStability) line(`        无头稳定性：${row.headlessStability}`);
      line(`        取证 ${row.evidenceCount} 条 · overlap 存量 ${row.overlap ? row.overlap.historicalItems : '(缺)'} / 独有 ${row.overlap ? row.overlap.uniqueItems : '(缺)'} / 重叠 ${row.overlap ? row.overlap.overlapItems : '(缺)'} · 维护成本 ${row.overlap ? row.overlap.maintenanceCost : '(缺)'}`);
    }
    line('  三方对账（判据在 scripts/lib/source-rulings.js）：');
    line(`      · retire 的来源仍在注册表：${sourceReliability.reconciliation.retireStillRegistered.length} 条${sourceReliability.reconciliation.retireStillRegistered.length ? `（${sourceReliability.reconciliation.retireStillRegistered.map(item => item.source).join('、')}）` : ''}`);
    line(`      · 连续失败 ≥ ${sourceRulings.HEALTH_FAILURES_REQUIRING_RULING} 次却没有裁决：${sourceReliability.reconciliation.missingRulingsForFailures.length} 条${sourceReliability.reconciliation.missingRulingsForFailures.length ? `（${sourceReliability.reconciliation.missingRulingsForFailures.join('、')}）` : ''}`);
    line(`      · repair / headless-migrate 却不在注册表：${sourceReliability.reconciliation.repairOrMigrateUnregistered.length} 条${sourceReliability.reconciliation.repairOrMigrateUnregistered.length ? `（${sourceReliability.reconciliation.repairOrMigrateUnregistered.map(item => item.source).join('、')}）` : ''}`);
    line(`      · 裁决的 source 命不中任何身份：${sourceReliability.reconciliation.unresolvedSources.length} 条${sourceReliability.reconciliation.unresolvedSources.length ? `（${sourceReliability.reconciliation.unresolvedSources.join('、')}）` : ''}`);
    line(`      · 对账问题合计：${sourceReliability.reconciliation.problemCount} 处（不为 0 时报告自检非 0）`);
    line(`      · 还没裁决的注册表行（不是错误，是缺口）：${sourceReliability.reconciliation.unruledRegistrySources.join(' / ') || '（无）'}`);
    line(`      · 已 retire 但心跳里还有行：${sourceReliability.reconciliation.retireStillInHealth.join(' / ') || '（无）'}（心跳行可能是旧读数，删不删由 workstream C 决定）`);
    if (sourceReliability.validationProblemCount) {
      line(`  ⚠️ 裁决表 schema 问题 ${sourceReliability.validationProblemCount} 处：${sourceReliability.validationProblems.slice(0, 3).join('；')}`);
    }
  }
  line('');

  line('──────────────────────────────────────────────────────────────────────');
  line(`候选登记表：${candidates.length} 条（已采信 ${adopted.length} / 未采信 ${notAdopted.length}）`);
  line(`报告自检问题：${problems.length} 处`);
  // 未落盘层**计入自检口径**（同一行相邻打印），但不判红：见 `pendingLayers` 的注释。
  // 这一行存在的唯一理由：让"某一层还没落盘"永远不可能被读成"这一层全是健康的"。
  if (pendingLayers.length) {
    line(`报告自检待落盘层：${pendingLayers.length} 项（**计入自检口径**：未落盘 ≠ 通过，也不判红 —— 与 Freshness 策略模块同一处理）`);
    for (const layer of pendingLayers) line(`  · ${layer.file}（${layer.layer}）—— ${layer.note}`);
  }

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
        declaredPlanModels: planCoverage.declaredPlanModels,
        // ---- t25 新增：**追加在既有键之后**（旧键的名字与顺序一个都没动）----
        // A / B / C 是上面那条方程的三个加数：计价条目 = mappedApiEntries + declaredApiEntries + 未判。
        //
        // ⚠️ 跨层命名对照（t29 写死在组装处：两层的词刚好**交叉**，别靠回读两个文件的实现去猜）：
        //   · 报告 `registry.declaredApiEntries`（**数**：展开后被处置声明覆盖的计价条目数 = 方程的 B）
        //       = lib `coverageOf().declaredApiIdentities`（Set `declaredApi` 的 size）
        //       = `planCoverage.declaredApiIdentities` = 本文件上方的 `declaredApiIdentityCount`
        //   · 报告 `registry.declaredApiEntryRows`（**数组**：声明本身逐条留档）
        //       = lib `coverageOf().declaredApiEntries`（声明行数组）
        //       = `planCoverage.declaredApiEntries` = 本文件上方的 `declaredApiRows`
        //   · 报告 `gaps.declaredApiEntryCount`（**数**：声明行数）= `declaredApiRows.length`
        //       —— 它等于 rows 的长度，**不是**方程里的 B（B 是通配展开之后的条目数；无通配声明时两者才相等）
        //   · 报告 `registry.mappedApiEntries`（**数**：展开后被映射认领的计价条目数 = 方程的 A）
        //       = lib `coverageOf().mappedApiEntries`
        //   为什么只写对照、不重命名：改名要牵动冻结键、白名单与下游引用（t20/t21/t28 的证据都按现名引用），
        //   而误读不会静默 —— 本文件上方那条「报告层与 lib/model-registry.js 对"已处置声明的 API 计价条目"
        //   的读数不一致」的交叉断言，会在两处读数分家时当场判红。
        mappedApiEntries,
        declaredApiEntries: declaredApiIdentityCount,
        declaredApiEntryRows: declaredApiRows
      },
      gaps: {
        dealsWithoutPlans,
        plansWithoutDeals,
        unmappedModelCount: unmappedModels.length,
        unmappedPlanModelCount: planCoverage.unmappedPlanModels.length,
        declaredPlanModelCount: planCoverage.declaredPlanModels.length,
        notAdoptedProviders,
        // ---- t25 新增：**追加在既有键之后** ----
        declaredApiEntryCount: declaredApiRows.length
      },
      candidates: {
        total: candidates.length,
        adopted: adopted.length,
        notAdopted: notAdopted.length,
        // ---- t46 新增：**追加在既有键之后**（旧键 total/adopted/notAdopted 的名字与顺序一个都没动）----
        // §42「机器可读输出也要同步」：候选来源审查的逐条明细（URL / 检查日期 / 是否采信 / 未采信原因）。
        // 以前只有计数 —— 拿 JSON 还原不出任何一条候选来源。排序：provider → url → checkedAt → slug（code-unit 序）。
        rows: candidateRows
      },
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
          blockedTargets: derived.blocked.map(cellPayload),
          // ---- t46 新增：**追加在既有键之后**（F5 / R8 的来源宇宙对照，文本与 JSON 同源）----
          // 本节看的是「挂在 target 上的来源」；注册表更宽，差集在 JSON 里也必须看得见。
          registryRowCount: sourceHealthRegistryNames.length,
          registryRows: sourceHealthRegistryNames,
          registryOnlySources: sourceHealthRegistryOnly
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
        },
        // ---- t46 新增：**追加在既有键之后**（§41 第 4 条 R4 的五态普查；旧键一律不动位）----
        // 形态仿 `dimensions`（一个按档位分键的计数对象），并且把「谁和谁比」写进同一个键里：
        // 词表来自 lib（statusOrder）、逐条值来自发布产物 models.json、和必须等于 registry 模型数。
        catalogStatusCensus: {
          landed: catalogStatusCensus.landed,
          statusOrder: catalogStatusCensus.statusOrder,
          counts: catalogStatusCensus.counts,
          sum: catalogStatusCensus.sum,
          registryModels: catalogStatusCensus.registryModels,
          statusesOutsideWordList: catalogStatusCensus.statusesOutsideWordList,
          source: '发布产物 models.json 的 catalogStatus（派生字段，来源层禁写）；词表与 censusOf() 来自 scripts/lib/model-freshness.js',
          reason: catalogStatusCensus.reason
        },
        // ---- v3（coverage-depth-v1）新增：**追加在既有键之后**（旧键一律不动位）----
        // 四节的新键全部挂在这里，而不是顶层：顶层键序（generatedAt … coverageTargets）因此与 v2
        // **逐字逐序相同** —— 下游按位置读顶层键的地方一个都不会失效。
        releaseEvidence,
        releaseEvidenceQueue,
        gapClosureQueue,
        sourceReliability
      }
    };
    console.log('\nJSON:');
    console.log(JSON.stringify(payload, null, 2));
  }

  console.log('\n✅ 覆盖报告自检通过（0 处问题）。');
  return 0;
}

process.exit(main());
