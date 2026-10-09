/**
 * `/models/` 模型资料索引与 `/models/<slug>/` 模型详情（v3.0 Stage D5/D6）——
 * **正文渲染 + 门槛 + 诚实性断言**。
 *
 * ## 这一层不拥有任何真值
 *
 * Model Registry 是**索引 / 身份层**（`models.json` + `model-registry-links.json`），
 * 不是新的价格真值层：价格永远来自 `api-plans.json` 的模型计价条目，
 * 关系永远来自**显式映射**（映射文件里写明的 `registryModelId → apiPlanId + modelKey`）。
 * 因此本文件里没有、也不允许有"名称相似就认为是同一个模型"的任何代码路径：
 * 不 import 任何相似度函数，不做子串匹配，不猜 provider。
 *
 * ## 生成门槛（题面 §4）
 *
 * 一个 registry entry 只有在**至少被一个当前或历史实体引用**时才生成详情页：
 * 引用可以是 API 计价映射、显式 Coding Plan 映射、显式 Deal 关系，
 * 或历史日志里与该模型相关的 `modelKey` 事件。未映射的**不生成**（进覆盖报告），
 * 也**不进 sitemap** —— 这就是 §8 的第 19 条牙。
 *
 * ## 三条硬承诺（都有断言）
 *
 * 1. **只列事实**：与套餐页 / API 页共用同一份 `FORBIDDEN_CLAIM_WORDS`；
 *    不自动折算、不排序成"最便宜"、不写"性价比 / 最值得"。
 * 2. **每一行都有出处**：API 表格的每一行都能追到 `api-plans.json` 的一条记录 +
 *    一个 `modelKey`；页面上**不许出现数据里没有的 provider**（§8 第 5 条牙）。
 * 3. **别名不是猜测**：别名只来自 registry entry 的 `aliases`（每条都该有来源）；
 *    本层不生成别名。
 *
 * ## 一行 = 一个真实计价条目（v3.0 修订 F-v3-registry-001 / P1-12）
 *
 * 计价表的行身份是 `planId|modelKey|variant`，判据对象是**展开后的 identity 集合**：
 * 关系层写 `variant: null` 的意思是"这条记录的该 modelKey 通用价"，即**全部真实 variant**，
 * 不是"随便挑一条"。所以一条通配映射在页面上会渲染成它真实覆盖的 n 行
 * （`standard` 与 `long_context` 各自一行、各自的价格）—— 旧实现只返回第一条匹配，
 * 于是更便宜的那档价格在页面上根本不存在。
 * 对账口径与 `scripts/tools/registry-join-audit.js`（独立 join，不 require 本文件）一致。
 *
 * ## 目录状态与「默认不占首屏」（coverage-expansion-v1）
 *
 * 索引表列出 registry 的**全部**模型（`data-model` 一行一个，静态 HTML 里一行都不少），
 * 但 `catalogStatus` 为 `legacy` / `historical` 的条目**默认不占据首屏**：本层只把默认隐藏集合
 * 当作**构建期参数**交给内联筛选脚本（`buildModelsIndexFilterScript({ defaultHiddenStatus })`），
 * 由脚本在运行时设 `row.hidden`。三条硬承诺都有断言：
 *
 *   1. 静态表行数 == registry 全部模型数，且预渲染 HTML 里没有一行带 `hidden`（No-JS 完整）；
 *   2. 默认隐藏集合**从页面原文读回来**与判据层的 `DEFAULT_HIDDEN_CATALOG_STATUSES` 逐字对账；
 *   3. 详情页路由 / sitemap 成员资格与 `catalogStatus` **无关** —— 换一个目录状态重算门槛，
 *      结论必须一字不变（藏的是首屏，不是身份）。
 *
 * 中性用词来自 `model-freshness.CATALOG_STATUS_LABEL`（页面不另写一份词表）；
 * 「已下线」只允许来自 `status=retired`，目录状态任何一档都不借用它。
 *
 * ## 纯函数
 *
 * 不读盘、不联网、不看时钟：registry、映射、`api-plans.json`、日志都由调用方传入。
 */

'use strict';

/**
 * 说明登记（notes-manifest-residual-v1）：`.snote` 构造点不再直接写进页面 —— 每个构造点在
 * 产出那一段 HTML 的**同一次调用**里登记（`ctx.note` 由 `build-local.js` 按 route 注入）。
 * 与 `lib/vendor-page.js` 同形：参数可以是 ctx 对象（含 `.note`），也可以是 note 函数本身；
 * 都没有时是恒等函数（断言 / selftest 路径不产出页面）。
 */
const NOTES_DECLARED_BY = 'lib/models-page.js';
const noteIn = source => {
  if (typeof source === 'function') return source;
  if (source && typeof source.note === 'function') return source.note;
  return (decl, html) => html;
};


const apiSchema = require('./api-plan-schema');
const apiPlansPage = require('./api-plans-page');
const plansPage = require('./plans-page');
const apiPlanHistory = require('./api-plan-history');
const dealPlanLinks = require('./deal-plan-links');
// 身份派生（`id = sha1('model|' + slug)`）只有一处实现 —— 页面层不自己再 hash 一遍，
// 否则"两个身份空间"就是这么来的。这里只用纯函数，不触发任何读盘。
const modelRegistry = require('./model-registry');
const pageKinds = require('./page-kinds');
// coverage-expansion-v1：**目录状态（catalogStatus）的词表与默认可见集合只有一处实现** ——
// `model-freshness.js`。页面层只读它两个派生出口：
//   · `CATALOG_STATUS_LABEL`（中性中文标签：当前型号 / 较早型号 / 旧型号 / 历史型号 / 发布时间未知）；
//   · `DEFAULT_HIDDEN_CATALOG_STATUSES`（默认隐藏 legacy / historical）。
// 页面**不**自己再写一份词表或默认集合：两份词表 = 两个真相，报告与页面会各自漂移。
// 这里只用它的**常量**，不借它做判定 —— 页面不重算新鲜度（那是判据层的事）。
const modelFreshness = require('./model-freshness');

const MODELS_INDEX_ROUTE = 'models/';
const MODEL_ROUTE_PREFIX = 'models/';
const MODELS_INDEX_HEADING = 'AI 模型资料索引';
const MODELS_INDEX_DESCRIPTION = '把本站收录的 AI 模型整理成一份可查的身份索引：'
  + '模型名、开发者、模型族、别名、官方链接、状态，以及它在哪些平台、以什么计费通道被提供。'
  + '本站只做收录与整理，不给模型打分、不做名次比较、不替读者判断哪个更好。';

const UNKNOWN_TEXT = plansPage.UNKNOWN_TEXT;
const UNKNOWN_NUM = plansPage.UNKNOWN_NUM;
const UNKNOWN_TRI = plansPage.UNKNOWN_TRI;
const FORBIDDEN_CLAIM_WORDS = plansPage.FORBIDDEN_CLAIM_WORDS;
const escapeHtml = plansPage.escapeHtml;

/**
 * 人工状态（registry 的 `status`）→ 页面用词。**封闭表**。
 *
 * 「已下线」**只允许**来自 `retired` 这一格（人工依据驱动的官方下线）。目录状态
 * （`catalogStatus`）任何一格都不许借用它 —— 一个模型"相对同类较旧"不等于"官方下线"，
 * 把两者混起来就是在替读者宣布一件没发生的事。这条纪律由 `assertPageHonesty()` 逐行查。
 */
const STATUS_LABEL = {
  active: '在售 / 可用',
  deprecated: '官方已弃用',
  retired: '已下线',
  unknown: '未确认'
};

/** 目录状态 → 中性中文标签（**同一份词表在 `model-freshness.js`，这里只取用） */
const CATALOG_STATUS_LABEL = modelFreshness.CATALOG_STATUS_LABEL;
/** 目录状态的封闭枚举（同上：判据层是唯一出处） */
const CATALOG_STATUSES = modelFreshness.CATALOG_STATUSES;
/** 目录状态判不出来时的取值。`unknown` 绝不等于 legacy —— 它只是"判不了"。 */
const CATALOG_STATUS_UNKNOWN = 'unknown';
/** **默认隐藏**的目录状态（legacy / historical）。默认可见集合 = 枚举里剩下的那三个。 */
const DEFAULT_HIDDEN_CATALOG_STATUS = [...modelFreshness.DEFAULT_HIDDEN_CATALOG_STATUSES];

/**
 * 模型角色（registry 的 `modelRole`）→ 中文标签。
 *
 * 刻意写成**表 + 兜底原样显示**，而不是"查不到就给个垃圾桶词"：角色枚举正在两处收敛
 * （身份层 `model-registry.MODEL_ROLES` / 展示判据层 `model-freshness.MODEL_ROLES`），
 * 任何一边新增一档时，页面显示**原文**（事实）而不是编一个中文词。自测里有一条
 * 「真实数据里出现的每个角色都必须有中文标签」的漂移对照，新角色一进来就会被点名。
 */
const MODEL_ROLE_LABEL = {
  // 能力位（identity 层 v2 口径）
  llm: '通用文本模型',
  'small-fast-variant': '同代小尺寸 / 低延迟档',
  vlm: '视觉理解模型',
  'multimodal-llm': '多模态通用模型',
  'retrieval-embedding': '向量化 / 嵌入模型',
  translation: '翻译专用模型',
  'translation-lite': '翻译轻量档',
  roleplay: '角色扮演模型',
  'code-specialist': '代码专用模型',
  // 判据层的同义档（两处枚举收敛中；两套都给出标签，避免同一档显示成英文原文）
  general: '通用文本模型',
  fast: '同代小尺寸 / 低延迟档',
  reasoning: '推理模型',
  coding: '代码专用模型',
  vision: '视觉理解模型',
  embedding: '向量化 / 嵌入模型',
  audio: '语音模型',
  realtime: '实时模型',
  chat: '对话模型',
  other: '其他'
};

/** 「显示旧型号」入口的 id（脚本建控件；预渲染里一个控件都没有） */
const MODELS_SHOW_OLD_ID = 'models-show-legacy';

const MODELS_INDEX_NOTES = [
  '这一页是**身份索引**：一行 = 一个模型。同一家公司的不同写法不会自动合并 ——'
  + '两个模型是否同一个，必须靠**显式映射**或官方证据，相似度与猜测都只能生成候选。',
  '「出现平台数」只统计**本站已收录且有显式映射**的 API 计价条目；'
  + '没有映射的 `modelKey` 仍然留在覆盖报告里，不会在这里被算成"这个平台也提供它"。',
  '模型详情页展示的价格全部来自 [API / Token 计费对比](plans/api/) 的同一份数据；'
  + '本页**不折算、不合并、不排序成"最便宜"**，也**不写推荐**。',
  '别名只用于**已确认改名 / 官方别名 / 格式差异**，每条都应有来源；别名不用于猜测同模型。',
  '「目录状态」是**派生**的中性分类：它只说明这条模型相对**同比较组**（开发者 + 模型族 + 角色）'
  + '里最新发布的模型处在什么时间位置，**不是质量评分、不是本站推荐**，也不代表它是否还能用。'
  + '判不了的写「发布时间未知」—— 不知道绝不当作"旧"。',
  '「目录状态」为旧型号 / 历史型号的条目**默认不占据首屏**（`legacy` / `historical`），'
  + '但**一行都不会从这一页消失**：静态表里始终是 registry 的全部模型，'
  + '没有 JS 的读者看到的是完整表格，有 JS 时可以勾选「显示旧型号」按需展开。'
  + '模型详情页与 sitemap 的成员资格**只由显式引用决定**，与目录状态无关 ——'
  + '旧型号的资料页不会被删，也不会被藏起来。'
];

/* ------------------------------------------------------------------ */
/* 输入归一（对上游 schema 保持宽容，但对"没有的东西"绝不补）            */
/* ------------------------------------------------------------------ */

/**
 * registry 文档 → 模型数组。接受三种**真实存在**的形态：
 *   · `scripts/data/models.json`（人工来源层）：`{ <slug>: {...} }`（键就是 slug）；
 *   · 派生产物 `models.json`：`{ schemaVersion, updatedAt, count, models: [...] }`；
 *   · 裸数组（自测夹具）。
 * 其余形态如实返回空数组 —— 页面宁可空着，也不猜数据的形状。
 */
function modelsOf(registry) {
  if (Array.isArray(registry)) return registry;
  if (registry && Array.isArray(registry.models)) return registry.models;
  if (registry && typeof registry === 'object') {
    // 键 = slug 的人工来源层：把键补进条目（条目里不重复写 slug，这是它的契约）
    const keys = Object.keys(registry).filter(key => !key.startsWith('_'));
    if (keys.length && keys.every(key => registry[key] && typeof registry[key] === 'object' && !Array.isArray(registry[key]))) {
      return keys.map(key => ({ slug: key, ...registry[key] }));
    }
  }
  return [];
}

/** 映射文档 → 关联数组（接受 `{links:[...]}` 或裸数组） */
function linksOf(linksDoc) {
  if (Array.isArray(linksDoc)) return linksDoc;
  if (linksDoc && Array.isArray(linksDoc.links)) return linksDoc.links;
  return [];
}

function modelIdOf(model) {
  const explicit = String((model && (model.id || model.registryModelId)) || '');
  if (explicit) return explicit;
  // 人工来源层（`scripts/data/models.json`）里没有 id（它是派生字段）—— 用**同一支**
  // 身份函数算出来，绝不另写一遍 hash。
  const slug = modelSlugOf(model);
  return slug ? modelRegistry.modelIdOf(slug) : '';
}

function modelNameOf(model) {
  return String((model && (model.canonicalName || model.name)) || '');
}

function modelSlugOf(model) {
  return String((model && model.slug) || '');
}

/**
 * 关系记录的"指向哪个模型"：**两种写法都必须支持**。
 *   · 人工来源层（`scripts/data/model-registry-links.json`）用 `registrySlug`（可读、人写的）；
 *   · 派生产物（`model-registry-links.json`）额外注入 `registryModelId`（渲染层不必自己再 hash）。
 * 匹配永远按**精确相等**（slug 或 id），不做归一、不做相似度。
 */
function linkSlugOf(link) {
  return String((link && link.registrySlug) || '');
}

function linkModelIdOf(link) {
  return String((link && link.registryModelId) || '');
}

/** 这条关系是否指向给定模型（slug 或 id 精确相等） */
function linkTargets(link, model) {
  const slug = modelSlugOf(model);
  const id = modelIdOf(model);
  return Boolean((slug && linkSlugOf(link) === slug)
    || (id && (linkModelIdOf(link) === id || linkSlugOf(link) === id)));
}

function modelHrefOf(model) {
  return `${MODEL_ROUTE_PREFIX}${encodeURIComponent(modelSlugOf(model))}/`;
}

function providerNameOf(key, table) {
  return apiPlansPage.providerNameOf(key, table);
}

/* ------------------------------------------------------------------ */
/* 引用（模型 ↔ 价格 / 套餐 / 优惠 / 历史）                              */
/* ------------------------------------------------------------------ */

/**
 * API 侧引用：`apiPlanId + modelKey(+variant)` → 记录里的计价条目。
 *
 * v3.0 修订（F-v3-registry-001 / P1-12）：这里**不再返回"第一条匹配"**。
 * 判据是**展开后的 identity 集合** `(apiPlanId, modelKey, 记录里真实 variant)`：
 *   · `variant` 为 null / undefined ⇒ 认领该 `modelKey` 在这条记录里的**全部**真实 variant
 *     （`variant: null` 是"通用价"，不是"随便挑一条"）；
 *   · 显式 variant ⇒ 只认领那一条。
 *
 * 为什么必须展开：真实数据里有 12 组 `(apiPlanId, modelKey)` 带 `standard + long_context`
 * 两个变体，而关系层 55 条 API 映射全是 `variant: null`。旧实现 `.find(... !link.variant || ...)`
 * 永远返回记录里的**第一条**（本项目里是更贵的 `long_context`），于是 GLM-4.5V 页面只剩
 * 「长上下文 ¥4 / ¥12」，`standard ¥2 / ¥6` 从来没被渲染过 —— 一个真实计价条目在页面上不存在。
 *
 * 返回 `{ plan, rows: [{entry, variant}], missingVariants, unresolved }`；
 * 找不到记录 / modelKey 时返回 null（由调用方如实记进 `missing`，绝不编一条价格出来）。
 */
function apiTargetsOf(link, apiPlansById) {
  const plan = apiPlansById.get(link.apiPlanId) || null;
  if (!plan) return null;
  const entries = (plan.models || []).filter(item => item && item.modelKey === link.modelKey);
  if (!entries.length) return null;
  const wildcard = link.variant === null || link.variant === undefined || link.variant === '';
  const rows = wildcard ? entries.slice() : entries.filter(item => item.variant === link.variant);
  return {
    plan,
    // 一条真实计价条目 = 一行（记录里的顺序即页面顺序，不做任何去重）
    rows: rows.map(entry => ({ plan, entry, variant: entry.variant })),
    // 显式写了 variant 却在这条记录里找不到：如实报出来（数据层门禁会判红），页面不补行
    missingVariants: wildcard || rows.length ? [] : [link.variant],
    // 通配却一条真实 variant 都没匹配到（记录里没有这个 modelKey）
    unresolved: wildcard && rows.length === 0
  };
}

/**
 * 兼容出口：单条命中（展开后的**第一条**，按记录顺序）。
 * 页面渲染必须走 `apiTargetsOf()`，这个函数只为"确实只关心一条"的调用方保留。
 */
function apiTargetOf(link, apiPlansById) {
  const hit = apiTargetsOf(link, apiPlansById);
  if (!hit || !hit.rows.length) return null;
  return { plan: hit.plan, entry: hit.rows[0].entry };
}

/** Coding 侧引用：`planId + modelName` → 套餐 `supportedModels` 里的那一条（按官方写的名字精确相等） */
function codingTargetOf(link, plansById) {
  const plan = plansById.get(link.planId) || null;
  if (!plan) return null;
  const entry = (plan.supportedModels || []).find(item => item && String(item.name) === String(link.modelName)) || null;
  // `supportedModels` 是自由文本（没有模型键），所以这里**只能**按逐字相等的名字找；
  // 找不到时仍然记下这条套餐（页面写「套餐里写了这个名字」），但标记没对上明细。
  return { plan, entry: entry || null };
}

/**
 * 一个模型的全部**显式引用**。没有映射就是空 —— 绝不按名字猜。
 *
 * 四种引用各有出处：
 *   · API 计价：关系层的 `apiPlanId + modelKey(+variant)`；
 *   · Coding 套餐：关系层的 `planId + modelName`（题面 D7「明确包含这个模型」）；
 *   · 优惠：`deal-plan-links` 里**显式关联到该模型映射到的记录**的那条关系（两跳、全显式，
 *     绝不用标题关键词猜 —— 题面 D8）；
 *   · 历史：API 计费日志里与该模型任一 `modelKey` 有关的记录事件（派生视图，不是第四套历史）。
 *
 * @param {object} model registry entry（来源层条目或派生产物条目都可以）
 * @param {object} ctx   `{ links, apiPlans, plans, deals, dealLinks, apiPlanHistoryStore, providerTable }`
 */
function modelReferencesOf(model, ctx = {}) {
  const links = linksOf(ctx.links);
  const apiPlans = Array.isArray(ctx.apiPlans) ? ctx.apiPlans : [];
  const apiPlansById = new Map(apiPlans.map(plan => [plan.id, plan]));
  const plans = Array.isArray(ctx.plans) ? ctx.plans : [];
  const plansById = new Map(plans.map(plan => [plan.id, plan]));
  const deals = Array.isArray(ctx.deals) ? ctx.deals : [];
  const dealsById = new Map(deals.map(deal => [deal.id, deal]));

  const apiItems = [];
  const codingPlans = [];
  const dealsOut = [];
  const missing = [];
  const modelKeys = new Set();
  const planIds = new Set();

  for (const link of links) {
    if (!link || typeof link !== 'object') continue;
    if (!linkTargets(link, model)) continue;
    if (link.apiPlanId) {
      const hit = apiTargetsOf(link, apiPlansById);
      if (!hit) {
        missing.push({ kind: 'api', apiPlanId: link.apiPlanId, modelKey: link.modelKey });
        continue;
      }
      if (hit.unresolved) {
        // 通配却什么都没认领：这是数据层的问题（validateLinks 判红），页面**不补一行**
        missing.push({ kind: 'api', apiPlanId: link.apiPlanId, modelKey: link.modelKey, variant: link.variant });
        continue;
      }
      for (const variant of hit.missingVariants) {
        missing.push({ kind: 'api', apiPlanId: link.apiPlanId, modelKey: link.modelKey, variant });
      }
      planIds.add(hit.plan.id);
      // 一条真实计价条目 = 一行（展开式：通配 link 产出该 modelKey 的全部真实 variant）
      for (const target of hit.rows) {
        modelKeys.add(target.entry.modelKey);
        apiItems.push({ plan: target.plan, entry: target.entry, link });
      }
    }
    if (link.planId) {
      const hit = codingTargetOf(link, plansById);
      if (!hit) { missing.push({ kind: 'plan', planId: link.planId }); continue; }
      planIds.add(hit.plan.id);
      codingPlans.push({ plan: hit.plan, entry: hit.entry, link });
    }
    if (link.dealId) {
      const deal = dealsById.get(link.dealId) || null;
      if (!deal) { missing.push({ kind: 'deal', dealId: link.dealId }); continue; }
      dealsOut.push({ deal, link });
    }
  }

  // 优惠：两跳但**每一跳都是显式的** —— deal-plan-links 里那条关系写明了 planIds 含本模型映射到的记录。
  // 这一跳不能省：Deal 的标题里出现模型名不构成关系（题面 D8 明令禁止用关键词猜）。
  const dealLinksDoc = ctx.dealLinks || null;
  if (dealLinksDoc) {
    const seen = new Set(dealsOut.map(item => item.deal.id));
    const records = [
      ...(Array.isArray(dealLinksDoc.links) ? dealLinksDoc.links : []),
      // 退役记录（relation 已结束、优惠记录已从 deals.json 下架）：仍然保留在页面上，
      // 但**没有链接可点**（那一页不存在），由渲染层按 `retired` 处理。
      ...(Array.isArray(dealLinksDoc.retired) ? dealLinksDoc.retired : []).map(record => ({ ...record, retired: true }))
    ];
    for (const link of records) {
      if (!link || !link.dealId) continue;
      const shared = (link.planIds || []).filter(planId => planIds.has(planId));
      if (!shared.length) continue;
      if (seen.has(link.dealId)) continue;
      const deal = dealsById.get(link.dealId) || null;
      if (!deal) { missing.push({ kind: 'deal', dealId: link.dealId }); continue; }
      seen.add(link.dealId);
      dealsOut.push({ deal, link, viaPlanIds: shared, retired: Boolean(link.retired) });
    }
  }

  // 历史：API 计费日志里与这个模型的任一 modelKey 有关的记录事件（派生视图）。
  const events = [];
  const store = ctx.apiPlanHistoryStore || null;
  if (store && Array.isArray(store.events)) {
    for (const event of store.events) {
      if (!event || typeof event !== 'object') continue;
      const relateByPlan = planIds.has(event.planId);
      const relateByKey = event.to && typeof event.to === 'object' && modelKeys.has(event.to.modelKey);
      const relateByFrom = event.from && typeof event.from === 'object' && modelKeys.has(event.from.modelKey);
      if (relateByPlan || relateByKey || relateByFrom) events.push(event);
    }
  }

  return { apiItems, codingPlans, deals: dealsOut, events, missing, modelKeys: [...modelKeys].sort(), planIds: [...planIds].sort() };
}

/**
 * 生成门槛：**存在 registry entry 且至少被一个当前或历史实体引用**。
 *
 * "引用"的口径刻意宽到包括历史事件，但**绝不会**因为"名字看起来像"而成立：
 * 每一条都来自显式映射或日志里的 modelKey。
 */
function modelPageGate(model, ctx = {}) {
  const modelId = modelIdOf(model);
  const hasEntry = Boolean(modelId && modelSlugOf(model) && modelNameOf(model));
  const refs = modelReferenceOfCached(model, ctx);
  const references = refs.apiItems.length + refs.codingPlans.length + refs.deals.length + refs.events.length;
  const reasons = [];
  if (!hasEntry) reasons.push('registry entry 缺少 id / slug / canonicalName');
  if (!references) reasons.push('没有被任何当前或历史实体显式引用（不生成详情页）');
  return {
    shouldGenerate: hasEntry && references > 0,
    modelId,
    slug: modelSlugOf(model),
    route: modelHrefOf(model),
    references,
    apiItems: refs.apiItems.length,
    codingPlans: refs.codingPlans.length,
    deals: refs.deals.length,
    events: refs.events.length,
    missing: refs.missing.length,
    reasons
  };
}

/** 一次渲染里同一个模型只算一次引用（纯缓存，不改语义） */
function modelReferenceOfCached(model, ctx) {
  const cache = ctx.__refCache || null;
  if (!cache) return modelReferencesOf(model, ctx);
  const key = modelIdOf(model);
  if (!cache.has(key)) cache.set(key, modelReferencesOf(model, ctx));
  return cache.get(key);
}

/* ------------------------------------------------------------------ */
/* 行模型（先算数据、再拼 HTML）                                          */
/* ------------------------------------------------------------------ */

/**
 * **行身份**：`planId|modelKey|variant`（P1-12 口径更正）。
 *
 * 旧身份只有 `planId` —— 一条记录有多个变体时两行会**同身份**，页面层就无法表达
 * "同一记录里 standard 与 long_context 各一行"，回读对账也会把两行当成一行。
 * 现在身份覆盖到真实计价条目：一条 `api-plans.models[]` 元素 = 一个身份。
 */
function apiPricingRowIdOf(row) {
  return `${row.planId}|${row.modelKey}|${row.variant}`;
}

/** 一条 API 计价条目 → 展示行（价格用 API 页的同一套格式化，不重写口径） */
function apiPricingRowOf(item, ctx = {}) {
  const { plan, entry } = item;
  const providerKey = plan.provider;
  const row = {
    planId: plan.id,
    modelKey: entry.modelKey,
    channel: plan.channel,
    channelLabel: apiSchema.API_CHANNEL_LABEL[plan.channel] || plan.channel || UNKNOWN_TEXT,
    variant: entry.variant,
    variantLabel: apiSchema.MODEL_VARIANT_LABEL[entry.variant] || entry.variant || UNKNOWN_TEXT,
    providerKey,
    provider: providerNameOf(providerKey, ctx.providerTable || null),
    inputText: apiPlansPage.priceText(entry.rates ? entry.rates.input : null, plan.pricing && plan.pricing.currency),
    outputText: apiPlansPage.priceText(entry.rates ? entry.rates.output : null, plan.pricing && plan.pricing.currency),
    cacheText: apiPlansPage.priceText(entry.rates ? entry.rates.cachedInput : null, plan.pricing && plan.pricing.currency),
    unitText: apiPlansPage.unitTextOf(plan),
    lastSeen: plan.lastSeen || UNKNOWN_TEXT,
    officialUrl: plan.officialUrl || '',
    note: entry.note || null
  };
  row.rowId = apiPricingRowIdOf(row);
  return row;
}

/** 一条模型的目录状态：**只认枚举内的值**；缺失 / 非法一律如实回落到 `unknown`（判不了） */
function catalogStatusOf(model) {
  const raw = String((model && model.catalogStatus) || '').trim();
  return CATALOG_STATUSES.includes(raw) ? raw : CATALOG_STATUS_UNKNOWN;
}

/** 目录状态是否**默认隐藏**（legacy / historical）—— 默认可见集合是它的补集 */
function catalogStatusHiddenByDefault(model) {
  return DEFAULT_HIDDEN_CATALOG_STATUS.includes(catalogStatusOf(model));
}

/** 目录状态的中性中文标签。枚举外的值绝不会走到这里（上面已经回落成 unknown） */
function catalogStatusLabelOf(model) {
  return CATALOG_STATUS_LABEL[catalogStatusOf(model)] || UNKNOWN_TEXT;
}

/** 模型角色原文（registry v2 的 `modelRole`；没有就空串） */
function modelRoleOf(model) {
  return String((model && model.modelRole) || '').trim();
}

/** 模型角色的中文标签；**枚举里没有的角色原样显示**（宁可显示原文，也不编一个词） */
function modelRoleLabelOf(model) {
  const role = modelRoleOf(model);
  if (!role) return UNKNOWN_TEXT;
  return MODEL_ROLE_LABEL[role] || role;
}

/**
 * 发布时间（`releasedAt`）：`{ raw, date }`。`date` 用判据层的同一支日期归一
 * （`YYYY-MM-DD`、日历合法），判不了就是 `null` —— 页面**不**用 `firstSeen` 兜底：
 * "我们收得晚"不是"这个模型发布得晚"。
 */
function releaseDateOf(model) {
  const raw = model && model.releasedAt !== null && model.releasedAt !== undefined
    ? String(model.releasedAt).trim() : '';
  return { raw, date: raw ? modelFreshness.normalizeReleaseDate(raw) : null };
}

/** 发布日期证据（`releaseEvidence`）：每条都是 `{sourceUrl, quote, capturedAt}`，非法形态如实跳过 */
function releaseEvidenceOf(model) {
  const list = model && Array.isArray(model.releaseEvidence) ? model.releaseEvidence : [];
  return list.filter(item => item && typeof item === 'object' && !Array.isArray(item));
}

/**
 * 索引页的一行：一个模型。
 *
 * 这里**不再**决定"要不要展示"：目录状态（`catalogStatus`）是判据层派生的字段，
 * 页面只负责如实渲染它 + 把默认隐藏集合交给构建期参数化的筛选脚本。
 * 门槛（有没有详情页）仍然只由**显式引用**决定 —— 与目录状态完全无关。
 */
function modelsIndexRowOf(model, ctx = {}) {
  const refs = modelReferenceOfCached(model, ctx);
  const gate = modelPageGate(model, ctx);
  const providers = new Set(refs.apiItems.map(item => item.plan.provider));
  const lastSeen = refs.apiItems.map(item => item.plan.lastSeen).filter(Boolean).sort().pop() || null;
  const aliases = Array.isArray(model.aliases) ? model.aliases.map(String) : [];
  const name = modelNameOf(model);
  const developer = String(model.developer || UNKNOWN_TEXT);
  const family = String(model.family || UNKNOWN_TEXT);
  return {
    id: modelIdOf(model),
    slug: modelSlugOf(model),
    name,
    developer,
    family,
    status: String(model.status || 'unknown'),
    statusLabel: STATUS_LABEL[model.status] || STATUS_LABEL.unknown,
    // coverage-expansion-v1：派生的目录状态 + registry v2 的模型角色（两列都要中性用词）
    catalogStatus: catalogStatusOf(model),
    catalogStatusLabel: catalogStatusLabelOf(model),
    catalogReason: String((model && model.catalogReason) || '') || null,
    hiddenByDefault: catalogStatusHiddenByDefault(model),
    modelRole: modelRoleOf(model),
    modelRoleLabel: modelRoleLabelOf(model),
    releasedAt: releaseDateOf(model).date,
    aliases,
    officialUrl: String(model.officialUrl || ''),
    firstSeen: model.firstSeen || null,
    lastSeen: model.lastSeen || lastSeen,
    platformCount: providers.size,
    platformNames: [...providers].map(key => providerNameOf(key, ctx.providerTable || null)).sort(),
    apiItemCount: refs.apiItems.length,
    codingPlanCount: refs.codingPlans.length,
    dealCount: refs.deals.length,
    eventCount: refs.events.length,
    linked: gate.shouldGenerate,
    href: modelHrefOf(model),
    gateReasons: gate.reasons,
    // 搜索串：**页面上真实显示的值 + slug + 别名**（与套餐页的 haystack 同一条口径：
    // 读者知道的名字（别名、官方写法）也要能搜到）。归一化只用于比较，不用于身份。
    search: modelRegistry.normalizeText([
      name, developer, family, modelSlugOf(model), ...aliases
    ].join(' '))
  };
}

/* ------------------------------------------------------------------ */
/* `/models/` 索引页正文                                                */
/* ------------------------------------------------------------------ */

/**
 * 索引页的**渐进增强**过滤脚本（唯一出处；构建期内联到页面上，并逐字节比对）。
 *
 * 纪律（与首页筛选、套餐页交互同源）：
 *   · 控件**整块由 JS 建出来** —— 预渲染 HTML 里一个 `<input>`/`<select>` 都没有，
 *     无 JS 的读者看到的是完整的静态表（不会看到点不动的死控件）；
 *   · 只读页面上的 `data-*`（不内联第二份数据载荷，避免两份数据漂移）；
 *   · 不改地址、不生成 URL、不做任何排序或推荐 —— 只做"隐藏 / 显示"；
 *   · **默认隐藏集合是构建期参数**（`defaultHiddenStatus`）：脚本自己不留一份写死的
 *     legacy/historical，调用方给什么就按什么藏。默认值取判据层的
 *     `DEFAULT_HIDDEN_CATALOG_STATUSES`（页面不另写一份策略）。
 *
 * 隐藏**只发生在运行时**：`row.hidden = true` 是脚本做的，预渲染 HTML 里一行都不带 `hidden`
 * ——所以关掉 JS 打开这一页，读到的是 registry 的**全部**模型（No-JS 完整），
 * 这也是 `assertPageHonesty()` 会当场查的一条。
 *
 * @param {object} [options]
 * @param {string[]} [options.defaultHiddenStatus] 默认隐藏的目录状态（默认取判据层的集合）
 * @returns {string} 内联脚本源码（逐字节进页面）
 */
function buildModelsIndexFilterScript(options = {}) {
  // 显式传 `[]` = "默认不隐藏任何一档"（这是有效参数，不是"没传"）；
  // 完全没传才回落成判据层的默认隐藏集合。
  const requested = options && Array.isArray(options.defaultHiddenStatus)
    ? options.defaultHiddenStatus
    : DEFAULT_HIDDEN_CATALOG_STATUS;
  const defaultHidden = [...new Set(requested.map(String))].sort();
  const catalogLabels = {};
  for (const status of CATALOG_STATUSES) catalogLabels[status] = CATALOG_STATUS_LABEL[status] || status;
  const roleLabels = { ...MODEL_ROLE_LABEL };
  return `(function () {
  'use strict';
  var table = document.getElementById('models-table');
  var host = document.getElementById('models-filter');
  var counter = document.getElementById('models-count');
  if (!table || !host) return;
  var rows = Array.prototype.slice.call(table.querySelectorAll('tbody tr[data-model]'));
  if (!rows.length) return;

  // 构建期参数（本脚本里唯一的一份默认可见性策略；不读页面上的第二份数据）
  var DEFAULT_HIDDEN = ${JSON.stringify(defaultHidden)};
  var CATALOG_LABELS = ${JSON.stringify(catalogLabels)};
  var ROLE_LABELS = ${JSON.stringify(roleLabels)};

  function valuesOf(attr) {
    var seen = [];
    rows.forEach(function (row) {
      var value = row.getAttribute(attr) || '';
      if (value && seen.indexOf(value) === -1) seen.push(value);
    });
    return seen;
  }

  function labelOf(value, map) {
    return map[value] || value;
  }

  function makeSelect(label, attr, formatter, values) {
    var wrap = document.createElement('label');
    wrap.className = 'mfl';
    wrap.appendChild(document.createTextNode(label));
    var select = document.createElement('select');
    select.setAttribute('data-filter', attr);
    var all = document.createElement('option');
    all.value = '';
    all.textContent = '全部';
    select.appendChild(all);
    (values || valuesOf(attr)).forEach(function (value) {
      var option = document.createElement('option');
      option.value = value;
      option.textContent = formatter ? formatter(value) : value;
      select.appendChild(option);
    });
    wrap.appendChild(select);
    return wrap;
  }

  var search = document.createElement('label');
  search.className = 'mfsearch';
  search.appendChild(document.createTextNode('搜索'));
  var input = document.createElement('input');
  input.type = 'search';
  input.id = 'models-search';
  input.placeholder = '模型名 / 开发者 / 别名 / slug';
  input.setAttribute('aria-label', '搜索模型');
  search.appendChild(input);
  host.appendChild(search);

  host.appendChild(makeSelect('开发者', 'data-developer'));
  host.appendChild(makeSelect('模型族', 'data-family'));
  host.appendChild(makeSelect('状态', 'data-status'));
  host.appendChild(makeSelect('目录状态', 'data-catalog-status', function (value) {
    return labelOf(value, CATALOG_LABELS);
  }));
  host.appendChild(makeSelect('模型角色', 'data-role', function (value) {
    return labelOf(value, ROLE_LABELS);
  }));
  host.appendChild(makeSelect('出现平台数', 'data-platforms', function (value) {
    return value + ' 个平台';
  }, valuesOf('data-platforms').sort(function (a, b) { return Number(a) - Number(b); })));

  // 「显示旧型号」入口：只在构建期声明了默认隐藏集合时才建（否则它是个没有作用的开关）。
  var toggle = null;
  if (DEFAULT_HIDDEN.length) {
    var showOld = document.createElement('label');
    showOld.className = 'mfl mfshow';
    toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.id = '${MODELS_SHOW_OLD_ID}';
    toggle.setAttribute('data-filter-toggle', 'default-hidden');
    showOld.appendChild(toggle);
    showOld.appendChild(document.createTextNode('显示'
      + DEFAULT_HIDDEN.map(function (value) { return labelOf(value, CATALOG_LABELS); }).join(' / ')
      + '（默认隐藏）'));
    host.appendChild(showOld);
  }

  function apply() {
    var query = input.value.trim().toLowerCase();
    var selects = Array.prototype.slice.call(host.querySelectorAll('select[data-filter]'));
    // 读者**主动**选了某个目录状态 ⇒ 这就是"我要看这一档"，不再套用默认隐藏。
    var catalogPicked = selects.some(function (select) {
      return select.getAttribute('data-filter') === 'data-catalog-status' && select.value;
    });
    var showHidden = Boolean(toggle && toggle.checked) || catalogPicked;
    var shown = 0;
    var policyHidden = 0;
    rows.forEach(function (row) {
      var ok = true;
      if (query) {
        var hay = row.getAttribute('data-search') || '';
        if (hay.indexOf(query) === -1) ok = false;
      }
      selects.forEach(function (select) {
        if (!ok || !select.value) return;
        if ((row.getAttribute(select.getAttribute('data-filter')) || '') !== select.value) ok = false;
      });
      // 默认隐藏：只隐藏、不删行；行还在 DOM 里（无 JS 时全部可见）。
      if (ok && !showHidden && DEFAULT_HIDDEN.indexOf(row.getAttribute('data-catalog-status') || '') !== -1) {
        ok = false;
        policyHidden += 1;
      }
      row.hidden = !ok;
      if (ok) shown += 1;
    });
    if (counter) {
      counter.textContent = '显示 ' + shown + ' / ' + rows.length + ' 个模型'
        + (policyHidden
          ? '（另有 ' + policyHidden + ' 个旧型号默认隐藏 —— 勾选上方「显示旧型号」可查看）'
          : '');
    }
  }

  host.addEventListener('input', apply);
  host.addEventListener('change', apply);
  apply();
})();`;
}

/**
 * 页面上的那一份筛选脚本（默认参数 = 判据层的默认隐藏集合）。
 *
 * 为什么留一个模块级常量而不是每次现算：构建期要从磁盘回读整页并**逐字节**比对
 * 页面里那份脚本与这一份（`build-local.js` / 自测都这么做），两边必须同一串字节。
 */
const MODELS_INDEX_FILTER_SCRIPT = buildModelsIndexFilterScript({
  defaultHiddenStatus: DEFAULT_HIDDEN_CATALOG_STATUS
});

/** 内联脚本的 HTML（与 `plans-compare` 一样：页面上的那一份就是这里的一份字节） */
function modelsIndexFilterScriptHtml() {
  return `<script id="models-filter-core">\n${MODELS_INDEX_FILTER_SCRIPT}\n</script>`;
}

/**
 * 从**页面原文**里读回内联脚本的构建期参数（`DEFAULT_HIDDEN`）。
 *
 * 为什么读回来而不是信常量：这一条正是"页面上的那一份脚本真的按参数生成"的判据 ——
 * 把页面里的参数改成 `[]`（默认全显）或删掉默认隐藏，`assertPageHonesty()` 当场红。
 * 读不出来返回 `null`（调用方报红，不静默）。
 */
function modelsIndexFilterParamsOf(html) {
  const match = String(html || '').match(/var DEFAULT_HIDDEN = (\[[^\]]*\]);/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]);
    return Array.isArray(parsed) ? parsed.map(String) : null;
  } catch (error) {
    return null;
  }
}

function modelsIndexRowHtml(row, prefix) {
  const aliasText = row.aliases.length ? row.aliases.join('、') : UNKNOWN_NUM;
  const name = row.linked
    ? `<a href="${escapeHtml(`${prefix}${row.href}`)}">${escapeHtml(row.name)}</a>`
    : `${escapeHtml(row.name)}<small class="munlinked">资料不足，未生成详情页</small>`;
  // 行身份有两层，**故意分开**：
  //   · `data-model`  —— 表里的一行（= registry 的一个模型；**全部**模型都在表里）；
  //   · `data-item`   —— 这一行同时是 ItemList 的成员（= 有详情页的模型，`seo.js` 数它）。
  // 合成一个属性会让"旧型号被默认隐藏"很自然地演变成"旧型号从 ItemList / 静态表里消失"。
  const itemAttr = row.linked ? ` data-item="${escapeHtml(row.slug)}"` : '';
  return `        <tr data-model="${escapeHtml(row.slug)}" data-linked="${row.linked ? 'true' : 'false'}"${itemAttr}
          data-developer="${escapeHtml(row.developer)}"
          data-family="${escapeHtml(row.family)}"
          data-status="${escapeHtml(row.statusLabel)}"
          data-catalog-status="${escapeHtml(row.catalogStatus)}"
          data-role="${escapeHtml(row.modelRole)}"
          data-platforms="${row.platformCount}"
          data-search="${escapeHtml(row.search)}">
          <th scope="row">${name}<small>${escapeHtml(row.id)}</small></th>
          <td data-cell="developer">${escapeHtml(row.developer)}</td>
          <td data-cell="family">${escapeHtml(row.family)}</td>
          <td data-cell="aliases">${escapeHtml(aliasText)}</td>
          <td data-cell="status">${escapeHtml(row.statusLabel)}</td>
          <td data-cell="catalog-status">${escapeHtml(row.catalogStatusLabel)}</td>
          <td data-cell="role">${escapeHtml(row.modelRoleLabel)}</td>
          <td class="num" data-cell="platforms">${row.platformCount}</td>
          <td class="num" data-cell="api-items">${row.apiItemCount}</td>
          <td data-cell="last-seen">${escapeHtml(row.lastSeen || UNKNOWN_TEXT)}</td>
        </tr>`;
}

/**
 * `/models/` 正文（纯函数）。
 *
 * @param {object|object[]} registry `models.json`（`{models:[...]}` 或数组）
 * @param {object} ctx 见 `modelReferencesOf()`
 */
function renderModelsIndex(registry, ctx = {}) {
  const prefix = ctx.prefix === undefined ? '' : ctx.prefix;
  const models = modelsOf(registry);
  const rows = models.map(model => modelsIndexRowOf(model, ctx));
  const linked = rows.filter(row => row.linked);
  const unlinked = rows.filter(row => !row.linked);
  const hiddenCount = rows.filter(row => row.hiddenByDefault).length;
  const developerCount = new Set(rows.map(row => row.developer)).size;
  const notes = MODELS_INDEX_NOTES
    .map(text => `        <li>${modelsMarkdownish(text, prefix)}</li>`).join('\n');

  const emptyState = rows.length
    ? ''
    : `      ${noteIn(ctx)({ kind: 'page-note-empty', slot: 'main-snote', classes: 'snote mnone', declaredBy: NOTES_DECLARED_BY }, `<p class="snote mnone">当前 registry 里没有任何模型 —— 这是事实，不是故障：本站只收录有官方来源、且能被显式引用的模型。</p>`)}\n`;
  // 未过门槛的模型**仍然留在表里**（一行都不少），只是没有详情页链接：
  // 表的行数 == registry 的全部模型数，这一条由 `assertPageHonesty()` 对账。
  const unlinkedBlock = unlinked.length
    ? `      ${noteIn(ctx)({ kind: 'page-note', slot: 'main-snote', classes: 'snote', declaredBy: NOTES_DECLARED_BY }, `<p class="snote" id="models-unlinked">${modelsMarkdownish(`表里有 ${unlinked.length} 个模型**还没有任何显式引用**（API 计价映射 / 套餐 / 优惠 / 历史事件），因此本版本不为它们生成详情页 —— 它们仍在覆盖报告里，也仍在这一页上（名字后面的小字标出）。`, prefix)}</p>`)}
`
    : '';

  return `      <nav class="crumb" aria-label="面包屑"><a href="${escapeHtml(prefix)}">首页</a> › <span>${escapeHtml(MODELS_INDEX_HEADING)}</span></nav>

      <div class="stop">
        <h1>${escapeHtml(MODELS_INDEX_HEADING)}</h1>
        <span class="meta">${rows.length} 个模型 · ${developerCount} 个开发者 · ${linked.length} 个已生成详情页</span>
      </div>

      ${noteIn(ctx)({ kind: 'page-note', slot: 'main-snote', classes: 'snote', declaredBy: NOTES_DECLARED_BY }, `<p class="snote">${escapeHtml(MODELS_INDEX_DESCRIPTION)}</p>`)}

      <h2 class="ph2" id="models-notes">口径与说明（先读这一段）</h2>
      <ul class="plist">
${notes}
      </ul>

${emptyState}      <div id="models-filter" class="mfilter" aria-label="筛选模型"></div>
      ${noteIn(ctx)({ kind: 'page-note-count', slot: 'main-snote', classes: 'snote mcount', declaredBy: NOTES_DECLARED_BY }, `<p class="snote mcount" id="models-count">显示 ${rows.length} / ${rows.length} 个模型${hiddenCount ? `（无 JS 时全部列出；有 JS 时旧型号 ${hiddenCount} 个默认不占首屏，可勾选「显示旧型号」查看）` : ''}</p>`)}

      <div class="ptable-wrap">
      <table class="ptable" id="models-table">
        <caption>一行 = registry 里的一个模型：<b>全部</b> ${rows.length} 个模型都在这一张表里（默认不隐藏任何一行）。
          价格与平台数只统计 <b>已显式映射</b> 的本站数据；「目录状态」是派生分类，「模型角色」来自 registry。</caption>
        <thead>
          <tr><th scope="col">模型</th><th scope="col">开发者</th><th scope="col">模型族</th><th scope="col">别名</th>
            <th scope="col">状态</th><th scope="col">目录状态</th><th scope="col">模型角色</th>
            <th scope="col">出现平台数</th><th scope="col">API 计价条目</th><th scope="col">最近核对</th></tr>
        </thead>
        <tbody>
${rows.length ? rows.map(row => modelsIndexRowHtml(row, prefix)).join('\n') : ''}
        </tbody>
      </table>
      </div>

${unlinkedBlock}      ${noteIn(ctx)({ kind: 'page-note', slot: 'main-snote', classes: 'snote', declaredBy: NOTES_DECLARED_BY }, `<p class="snote" id="models-links">相关页面：
        <a href="${escapeHtml(`${prefix}plans/`)}">套餐与 API 计费资料库</a> ·
        <a href="${escapeHtml(`${prefix}plans/api/`)}">API / Token 计费对比</a> ·
        <a href="${escapeHtml(`${prefix}vendor/`)}">按厂商浏览</a> ·
        <a href="${escapeHtml(`${prefix}archive/`)}">历史档案</a>
      </p>`)}
${modelsIndexFilterScriptHtml()}
`;
}

/** `/models/` JSON-LD：CollectionPage + BreadcrumbList + ItemList（只含已生成详情页的模型） */
function modelsIndexJsonLd(registry, ctx = {}) {
  const siteUrl = ctx.siteUrl || '';
  const pageUrl = `${siteUrl}${MODELS_INDEX_ROUTE}`;
  const rows = modelsOf(registry).map(model => modelsIndexRowOf(model, ctx)).filter(row => row.linked);
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: `${MODELS_INDEX_HEADING} · AI 优惠聚合器`,
      description: MODELS_INDEX_DESCRIPTION,
      url: pageUrl,
      inLanguage: 'zh-CN',
      isPartOf: { '@type': 'WebSite', name: 'AI 优惠聚合器', url: siteUrl }
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '首页', item: siteUrl },
        { '@type': 'ListItem', position: 2, name: MODELS_INDEX_HEADING, item: pageUrl }
      ]
    },
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: MODELS_INDEX_HEADING,
      numberOfItems: rows.length,
      itemListElement: rows.map((row, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: row.name,
        url: `${siteUrl}${row.href}`
      }))
    }
  ];
}

/* ------------------------------------------------------------------ */
/* `/models/<slug>/` 详情页正文                                          */
/* ------------------------------------------------------------------ */

function modelPricingRowHtml(row, prefix) {
  const official = row.officialUrl
    ? `<a href="${escapeHtml(row.officialUrl)}" rel="noopener">官方定价页 ↗</a>` : UNKNOWN_NUM;
  // 行身份 = planId|modelKey|variant（一条真实计价条目一行，两行互不冒充）
  return `        <tr class="mapirow" data-item="${escapeHtml(row.rowId || apiPricingRowIdOf(row))}" data-plan="${escapeHtml(row.planId)}"
          data-model-key="${escapeHtml(row.modelKey)}" data-variant="${escapeHtml(String(row.variant === null || row.variant === undefined ? '' : row.variant))}" data-provider="${escapeHtml(row.providerKey)}">
          <th scope="row">${escapeHtml(row.provider)}</th>
          <td>${escapeHtml(row.channelLabel)}</td>
          <td>${escapeHtml(row.variantLabel)}</td>
          <td class="num">${escapeHtml(row.inputText)}</td>
          <td class="num">${escapeHtml(row.outputText)}</td>
          <td class="num">${escapeHtml(row.cacheText)}</td>
          <td class="punit">${escapeHtml(row.unitText)}</td>
          <td><time datetime="${escapeHtml(row.lastSeen)}">${escapeHtml(row.lastSeen)}</time></td>
          <td>${official}${row.note ? `<small>${escapeHtml(row.note)}</small>` : ''}</td>
        </tr>`;
}

/** 相关 Coding 套餐的一行：套餐名 + 官方页面里写的那一条（自由文本，没有模型键） */
function codingPlanLineOf(item, ctx, prefix) {
  const plan = item.plan;
  const provider = providerNameOf(plan.provider, ctx.providerTable);
  const entry = item.entry;
  const detail = entry
    ? `${escapeHtml(String(entry.name))}${entry.role && entry.role !== 'included' ? `（${escapeHtml(String(entry.role))}）` : ''}${entry.note ? ` — ${escapeHtml(String(entry.note))}` : ''}`
    : `${escapeHtml(UNKNOWN_TRI)}（套餐的 supportedModels 里没有逐字相同的名字）`;
  return `        <li><a href="${escapeHtml(`${prefix}plans/coding/#plan-${plan.id}`)}">${escapeHtml(provider)} ${escapeHtml(plan.planName)}</a>
          <small>官方套餐里写的是：${detail}</small></li>`;
}

/** 相关优惠的一行：deal-plan-links 的显式关系（两跳），带当前 / 已结束状态 */
function relatedDealLineOf(item, ctx, prefix) {
  const deal = item.deal;
  const title = escapeHtml(deal.title || deal.id);
  const status = ctx.dealLinks
    ? dealPlanLinks.dealStatusOf(deal.id, { ...ctx, deals: ctx.deals, asOf: ctx.asOf })
    : { status: 'current', reason: null };
  const statusLabel = item.retired ? '已退役的关系'
    : status.status === 'current' ? '当前有效'
      : `已结束（${escapeHtml(String(status.reason || ''))}）`;
  // 优惠记录已从数据集下架（或关系已退役）时**不给链接** —— 那个页面不存在，给了就是死链。
  const link = item.retired
    ? ''
    : ` <a href="${escapeHtml(`${prefix}deal/${encodeURIComponent(deal.id)}/`)}">查看优惠 →</a>`;
  const via = item.viaPlanIds && item.viaPlanIds.length
    ? `<small>关系经 ${escapeHtml(item.viaPlanIds.join('、'))} 记录显式确认</small>` : '';
  return `        <li>${title}<small class="mstatus">${statusLabel}</small>${link}${via}</li>`;
}

/**
 * 「发布时间」这一格的**值 + 官方证据链接**。
 *
 * 三条纪律：
 *   1. **没有官方发布日期就写「未标注」**，绝不拿 `firstSeen`（本站第一次看到）或版本号凑一个日期；
 *   2. 有日期就**必须**能点回官方出处（`releaseEvidence` 的 `sourceUrl`）——"某天发布的"
 *      这句话的出处必须可复核，而且出处域由身份层按 developer 的官方域登记校验过；
 *   3. 证据与日期互为充要：缺哪一边都如实显示缺什么（不补、不藏）。
 *
 * 返回 `{ attrs, html }`：`attrs` 挂在 `<dd>` 上，让**外部**（自测 / 真浏览器验收）不必
 * 抠文案就能读到"页面上的发布时间到底是哪一天、附了几条证据"。
 */
function releaseBlockOf(model) {
  const { raw, date } = releaseDateOf(model);
  const evidence = releaseEvidenceOf(model);
  const attrDate = date || '';
  const attrs = ` data-release-date="${escapeHtml(attrDate)}" data-release-evidence="${evidence.length}"`;
  const evidenceHtml = evidence.map(item => {
    const url = String(item.sourceUrl || '');
    const quote = String(item.quote || '');
    const capturedAt = String(item.capturedAt || '');
    const link = url ? `<a href="${escapeHtml(url)}" rel="noopener">官方来源 ↗</a>` : '<span>（证据缺 sourceUrl）</span>';
    const detail = [quote ? `「${quote}」` : '', capturedAt ? `抓取于 ${capturedAt}` : ''].filter(Boolean).join(' · ');
    return ` ${link}${detail ? `<small>${escapeHtml(detail)}</small>` : ''}`;
  }).join('');
  const missingNote = date
    ? ''
    : `<small>没有官方发布日期证据 —— 「${escapeHtml('首次收录')}」是本站第一次看到它的日子，不是它的发布时间</small>`;
  const evidenceNote = date && !evidence.length
    ? '<small>registry 里有发布日期却没有附官方证据链接 —— 这一条该在数据层判红</small>'
    : '';
  const orphanNote = !date && evidence.length
    ? '<small>registry 里附了发布日期证据却没有 releasedAt —— 这一条该在数据层判红</small>'
    : '';
  const value = date
    ? `<time datetime="${escapeHtml(date)}">${escapeHtml(date)}</time>`
    : escapeHtml(UNKNOWN_TEXT);
  return { raw, date, evidence, attrs, html: `${value}${evidenceHtml}${missingNote}${evidenceNote}${orphanNote}` };
}

/**
 * `/models/<slug>/` 正文（纯函数）。
 *
 * @param {object} model registry entry
 * @param {object} ctx   见 `modelReferencesOf()`；另需 `prefix`、
 *                       `vendorHrefOf(developer)`（有厂商资料页时才给链接；缺省不给）
 */
// [T5-models-1126-pricing-note-head]
// T5 删除（census A · 半句）：删「全部来自本站 … 的同一份数据；」—— **数据来源自证**（「同一份数据」这件事由页面上的链接与 `data-item` 对账另行保证）。保留后半句（`不折算、不排序成"最便宜"、不写推荐`）—— 那是读者理解这张表的口径，C 类。
// [T5-models-1080-coding-empty-tail]
// T5 删除（census A · 半句）：删「 —— 本站不按套餐里的模型名猜关系（supportedModels 是自由文本，没有模型键）。」—— **实现自证**（我们在内部怎么判关联），空态事实只需前半句。⚠️ 元素**保留**：这是 `.snote.mnone` 空态条（本条与下一条都是 kind=half ⇒ 元素数不变，45 / 41 页的 `main-snote` 条数不动）。
// [T5-models-1086-deals-empty-tail]
// T5 删除（census A · 半句）：同上 —— 删「 —— 本站不用标题关键词猜关系。」（实现自证），保留空态事实。元素保留（kind=half）。
// [T5-models-1137-derived-view]
// T5 删除（census A · 自证整条）：整条删 ——「这一节是派生视图 / 不新建第四套历史真值」是**架构自证**（我们在内部怎么组织数据），标题「模型变化记录（派生视图）」已经把「派生」写在读者眼前；下面的列表是数据（C 类）。
function renderModelPage(model, ctx = {}) {
  const prefix = ctx.prefix === undefined ? '../../' : ctx.prefix;
  const refs = modelReferenceOfCached(model, ctx);
  const name = modelNameOf(model);
  const aliases = Array.isArray(model.aliases) ? model.aliases : [];
  const rows = refs.apiItems.map(item => apiPricingRowOf(item, ctx));
  const platformCount = new Set(rows.map(row => row.providerKey)).size;

  // 中性用词：目录状态与模型角色都走词表（枚举外的角色原样显示，绝不编一个词）
  const catalog = {
    status: catalogStatusOf(model),
    label: catalogStatusLabelOf(model)
  };
  const role = {
    raw: modelRoleOf(model),
    label: modelRoleLabelOf(model)
  };
  const release = releaseBlockOf(model);

  const aliasText = aliases.length ? aliases.map(alias => escapeHtml(String(alias))).join('、') : UNKNOWN_NUM;
  const official = model.officialUrl
    ? `<a href="${escapeHtml(model.officialUrl)}" rel="noopener">${escapeHtml(model.officialUrl)} ↗</a>` : UNKNOWN_TEXT;
  const vendorHref = typeof ctx.vendorHrefOf === 'function' ? ctx.vendorHrefOf(model.developer) : null;
  const vendorLine = vendorHref
    ? ` · <a href="${escapeHtml(`${prefix}${vendorHref}`)}">该厂商的资料页 →</a>` : '';

  const pricingBlock = rows.length
    ? `      <div class="ptable-wrap">
      <table class="ptable">
        <caption>一行 = 一条「平台 × 计费通道 × 变体」的计价条目。价格与单位逐行写出，不跨单位换算；
          官方没有公布的那一项写「—」，官方明说免费写「免费」。</caption>
        <thead>
          <tr><th scope="col">Provider</th><th scope="col">计费通道</th><th scope="col">Variant</th>
            <th scope="col">Input</th><th scope="col">Output</th><th scope="col">Cache</th>
            <th scope="col">Unit</th><th scope="col">Last Seen</th><th scope="col">官方来源</th></tr>
        </thead>
        <tbody>
${rows.map(row => modelPricingRowHtml(row, prefix)).join('\n')}
        </tbody>
      </table>
      </div>`
    : `      ${noteIn(ctx)({ kind: 'page-note-empty', slot: 'main-snote', classes: 'snote mnone', declaredBy: NOTES_DECLARED_BY }, `<p class="snote mnone">${modelsMarkdownish('本站的 API 计费数据里还没有与该模型**显式映射**的计价条目。这不是"没有平台提供它"，而是"我们还没有确证的官方价格" —— 未映射的 modelKey 记在覆盖报告里。', prefix)}</p>`)}`;

  const codingBlock = refs.codingPlans.length
    ? `      <ul class="mlist">
${refs.codingPlans.map(item => codingPlanLineOf(item, ctx, prefix)).join('\n')}
      </ul>`
    : `      ${noteIn(ctx)({ kind: 'page-note-empty', slot: 'main-snote', classes: 'snote mnone', declaredBy: NOTES_DECLARED_BY }, `<p class="snote mnone">${modelsMarkdownish('没有与该模型**显式关联**的 Coding 套餐。', prefix)}</p>`)}`;

  const dealsBlock = refs.deals.length
    ? `      <ul class="mlist">
${refs.deals.map(item => relatedDealLineOf(item, ctx, prefix)).join('\n')}
      </ul>`
    : `      ${noteIn(ctx)({ kind: 'page-note-empty', slot: 'main-snote', classes: 'snote mnone', declaredBy: NOTES_DECLARED_BY }, `<p class="snote mnone">${modelsMarkdownish('没有与该模型**显式关联**的优惠。', prefix)}</p>`)}`;

  const historyBlock = ctx.apiPlanHistoryStore
    ? (refs.events.length
      ? `      <ul class="pchglist">
${refs.events.slice().sort((a, b) => (a.at === b.at ? 0 : a.at < b.at ? 1 : -1)).map(event => {
    const type = apiPlanHistory.API_PLAN_HISTORY_WORDING.API_PLAN_HISTORY_TYPES[event.type] || event.type;
    const field = event.field ? (apiPlanHistory.API_PLAN_HISTORY_WORDING.API_PLAN_HISTORY_FIELD_LABELS[event.field] || event.field) : '';
    return `        <li><span class="pchgwhen"><time datetime="${escapeHtml(event.at)}">${escapeHtml(event.at)}</time></span>
          <span class="pchgtype">${escapeHtml(type)}</span>${field ? `<span class="pchgwhat">${escapeHtml(field)}</span>` : ''}</li>`;
  }).join('\n')}
      </ul>`
      : `      ${noteIn(ctx)({ kind: 'page-note-empty', slot: 'main-snote', classes: 'snote mnone', declaredBy: NOTES_DECLARED_BY }, `<p class="snote mnone">API 计费日志里没有与该模型相关的事件。</p>`)}`)
    : `      ${noteIn(ctx)({ kind: 'page-note-empty', slot: 'main-snote', classes: 'snote mnone', declaredBy: NOTES_DECLARED_BY }, `<p class="snote mnone">本次构建没有拿到 API 计费日志 —— 这不表示「没有变化」。</p>`)}`;

  return `      <nav class="crumb" aria-label="面包屑"><a href="${escapeHtml(prefix)}">首页</a> ›
        <a href="${escapeHtml(`${prefix}${MODELS_INDEX_ROUTE}`)}">${escapeHtml(MODELS_INDEX_HEADING)}</a> › <span>${escapeHtml(name)}</span></nav>

      <div class="stop">
        <h1>${escapeHtml(name)}</h1>
        <span class="meta">${escapeHtml(model.developer || UNKNOWN_TEXT)} · ${escapeHtml(STATUS_LABEL[model.status] || STATUS_LABEL.unknown)}
          · 出现在 ${platformCount} 个平台的计价条目里</span>
      </div>

      <dl class="minfo">
        <dt>模型名称</dt><dd>${escapeHtml(name)}</dd>
        <dt>开发者</dt><dd>${escapeHtml(model.developer || UNKNOWN_TEXT)}${model.owner && model.owner !== model.developer ? `（owner：${escapeHtml(String(model.owner))}）` : ''}</dd>
        <dt>模型族</dt><dd>${escapeHtml(model.family || UNKNOWN_TEXT)}</dd>
        <dt>别名</dt><dd>${aliasText}</dd>
        <dt>状态</dt><dd>${escapeHtml(STATUS_LABEL[model.status] || STATUS_LABEL.unknown)}<small>人工登记的官方状态；只有官方确实下线这一格才用下线措辞，目录状态不借用它</small></dd>
        <dt>目录状态</dt><dd data-catalog-status="${escapeHtml(catalog.status)}" data-cell="catalog-status">${escapeHtml(catalog.label)}<small>相对同比较组的发布时间位置，<b>不是</b>质量评分、也不是本站推荐；判不了就是「${escapeHtml(CATALOG_STATUS_LABEL.unknown)}」</small></dd>
        <dt>模型角色</dt><dd data-role="${escapeHtml(role.raw)}" data-cell="role">${escapeHtml(role.label)}<small>registry 里登记的能力位（不按版本号推断）</small></dd>
        <dt>发布时间</dt><dd${release.attrs}>${release.html}</dd>
        <dt>官方链接</dt><dd>${official}${vendorLine}</dd>
        <dt>首次收录</dt><dd>${escapeHtml(model.firstSeen || UNKNOWN_TEXT)}<small>本站第一次看到它的日子，不是它的发布时间</small></dd>
        <dt>最近核对</dt><dd>${escapeHtml(model.lastSeen || UNKNOWN_TEXT)}</dd>
        <dt>记录 id</dt><dd>${escapeHtml(modelIdOf(model))}</dd>
      </dl>

      <h2 class="ph2" id="model-api">API 提供平台与计价条目（${rows.length} 条）</h2>
      ${noteIn(ctx)({ kind: 'page-note', slot: 'main-snote', classes: 'snote', declaredBy: NOTES_DECLARED_BY }, `<p class="snote">每一行都带计费单位与官方定价页。<b>不折算、不排序成"最便宜"、不写推荐</b>。</p>`)}
${pricingBlock}

      <h2 class="ph2" id="model-plans">相关 Coding 套餐</h2>
${codingBlock}

      <h2 class="ph2" id="model-deals">相关优惠</h2>
${dealsBlock}

      <h2 class="ph2" id="model-history">模型变化记录（派生视图）</h2>
${historyBlock}
`;
}

/** `/models/<slug>/` JSON-LD：DetailPage(Thing) + BreadcrumbList。详情页刻意没有 ItemList。 */
function modelPageJsonLd(model, ctx = {}) {
  const siteUrl = ctx.siteUrl || '';
  const pageUrl = `${siteUrl}${modelHrefOf(model)}`;
  const name = modelNameOf(model);
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'TechArticle',
      headline: `${name} · 模型资料`,
      description: `${name}（${String(model.developer || '开发者未标注')}）在本站收录的 API 计价条目、相关套餐与变化记录。本站只整理事实，不做推荐。`,
      url: pageUrl,
      inLanguage: 'zh-CN',
      isPartOf: { '@type': 'WebSite', name: 'AI 优惠聚合器', url: siteUrl }
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '首页', item: siteUrl },
        { '@type': 'ListItem', position: 2, name: MODELS_INDEX_HEADING, item: `${siteUrl}${MODELS_INDEX_ROUTE}` },
        { '@type': 'ListItem', position: 3, name, item: pageUrl }
      ]
    }
  ];
}

/* ------------------------------------------------------------------ */
/* 诚实性断言                                                          */
/* ------------------------------------------------------------------ */

/** 极简行内标记（只在我们的常量里使用；数据原文一律 escapeHtml） */
function modelsMarkdownish(text, prefix) {
  let out = escapeHtml(text);
  out = out.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  out = out.replace(/\[([^\]]+)\]\(([^)]*)\)/g, (match, label, href) => {
    const url = href.startsWith('http') ? href : `${prefix}${href}`;
    return `<a href="${escapeHtml(url)}">${label}</a>`;
  });
  return out;
}

function markupOnly(html) {
  return plansPage.markupOnly(html);
}

/**
 * 页面级诚实性断言（索引页与详情页共用）。
 *
 * 回读页面再与数据对账：
 *   · 索引页：行数 == 已生成详情页的模型数；ItemList 声明数 == 元素数 == `data-item` 行数；
 *     未过门槛的模型**不许**出现在 ItemList 里（§8 第 19 条牙）。
 *   · 详情页（v3.0 修订 F-v3-registry-001 / P1-12）：
 *     · 表格每一行的**行身份** `data-item = planId|modelKey|variant` 必须逐字等于数据里那条计价条目的身份
 *       —— 「同记录里换个 variant 冒充」「凭空的 modelKey」「展示不存在的 Provider」当场变红（§8 第 5 条牙）；
 *     · 行数 == **展开后的**真实计价条目数（一条 pricing item = 一行）；每条都必须在页面上出现
 *       —— 多变体吞行（只渲染更贵的 long_context、standard 消失）在这里变红。
 *
 * @param {string} html 页面（正文或整页）
 * @param {object} page `{ kind: 'models-index', registry, ctx }` 或
 *                      `{ kind: 'model', model, ctx }`
 */
function assertPageHonesty(html, page = {}) {
  const problems = [];
  const text = markupOnly(String(html || ''));
  const kind = page.kind;
  const ctx = page.ctx || {};

  const checkCommon = () => {
    if (!/<h1[\s>]/.test(text)) problems.push('缺少 <h1>');
    for (const word of FORBIDDEN_CLAIM_WORDS) {
      if (text.includes(word)) problems.push(`页面出现结论性词汇「${word}」—— 模型页只列事实`);
    }
  };

  if (kind === 'models-index') {
    checkCommon();
    if (!text.includes(MODELS_INDEX_HEADING)) problems.push(`缺少标题「${MODELS_INDEX_HEADING}」`);
    const models = modelsOf(page.registry);
    const rows = models.map(model => modelsIndexRowOf(model, ctx));
    const linked = rows.filter(row => row.linked);
    const markers = [...text.matchAll(/data-item="([^"]*)"/g)].map(match => match[1]);
    // ---- 静态表完整性（coverage-expansion-v1）：一行 = registry 的一个模型，**全部**都在 ----
    //
    // 这一条同时是"默认隐藏旧型号"的护栏：默认隐藏**只发生在运行时**（脚本设 row.hidden），
    // 静态 HTML 里必须一行不少、一行不 hidden。否则"默认隐藏"会悄悄变成"无 JS 时看不到"。
    const tableRows = [...text.matchAll(/<tr data-model="([^"]*)"/g)].map(match => match[1]);
    if (tableRows.length !== models.length) {
      problems.push(`静态表 ${tableRows.length} 行 ≠ registry 全部模型 ${models.length} 个（默认隐藏只许发生在运行时，静态表一行都不许少）`);
    }
    const tableSlugs = new Set(tableRows);
    if (tableSlugs.size !== tableRows.length) {
      problems.push(`静态表里有重复的 data-model 行（${tableRows.length} 行 / ${tableSlugs.size} 个唯一 slug）`);
    }
    for (const row of rows) {
      if (!tableSlugs.has(row.slug)) problems.push(`registry 里的「${row.slug}」没有渲染成静态行（静态表 = 全部模型）`);
    }
    if (/<tr[^>]*\shidden[\s>]/.test(text)) {
      problems.push('预渲染 HTML 里出现 hidden 的行 —— 默认隐藏只能由脚本在运行时加，静态表必须完整');
    }
    // ---- ItemList 成员 = 有详情页的模型（`data-item`），与目录状态无关 ----
    if (markers.length !== linked.length) {
      problems.push(`索引页 ${markers.length} 行 ≠ 已生成详情页的模型 ${linked.length} 个`);
    }
    const expected = new Set(linked.map(row => row.slug));
    for (const slug of markers) {
      if (!expected.has(slug)) problems.push(`索引页列出了不该生成详情页的模型「${slug}」`);
    }
    // ---- 详情路由 / sitemap 成员资格**不因 catalogStatus 变化** ----
    //
    // 判据是"换一个目录状态，门槛结论一字不变"：把 legacy/historical 当成"淘汰"来处理的话，
    // 这条会在真正开始判 legacy 的那一轮变红（而不是等线上发现旧型号的页面没了）。
    for (const model of models) {
      const base = modelPageGate(model, ctx);
      const baselineInPage = tableSlugs.has(base.slug);
      for (const forced of CATALOG_STATUSES) {
        const alt = modelPageGate({ ...model, catalogStatus: forced }, ctx);
        if (alt.shouldGenerate !== base.shouldGenerate || alt.route !== base.route) {
          problems.push(`模型「${base.slug}」的门槛结论随 catalogStatus（${forced}）变化了 —— 详情路由与 sitemap 只由显式引用决定`);
          break;
        }
      }
      if (!baselineInPage) problems.push(`模型「${base.slug}」不在静态表里`);
      // 该有详情页的模型必须带 data-item（默认隐藏的旧型号同样带：藏的是首屏，不是身份）
      if (base.shouldGenerate && !markers.includes(base.slug)) {
        problems.push(`过门槛的模型「${base.slug}」在静态表里没有 data-item（ItemList / 详情路由不该随目录状态变化）`);
      }
    }
    // ---- 目录状态与角色两列：每一行都必须带标记，且格里的词必须等于词表里的那一格 ----
    const catalogLabels = new Set(Object.values(CATALOG_STATUS_LABEL));
    for (const row of rows) {
      const rowHtml = (text.match(new RegExp(`<tr data-model="${row.slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[\\s\\S]*?<\\/tr>`)) || [''])[0];
      if (!rowHtml) continue;
      const catalogCell = (rowHtml.match(/<td data-cell="catalog-status">([^<]*)<\/td>/) || [])[1];
      const roleCell = (rowHtml.match(/<td data-cell="role">([^<]*)<\/td>/) || [])[1];
      if (catalogCell === undefined) problems.push(`「${row.slug}」行缺少目录状态格（data-cell="catalog-status"）`);
      else if (catalogCell !== row.catalogStatusLabel || !catalogLabels.has(catalogCell)) {
        problems.push(`「${row.slug}」行的目录状态显示为「${catalogCell}」，按数据应为「${row.catalogStatusLabel}」（中性词表里的一格）`);
      }
      if (roleCell === undefined) problems.push(`「${row.slug}」行缺少模型角色格（data-cell="role"）`);
      else if (roleCell !== row.modelRoleLabel) {
        problems.push(`「${row.slug}」行的模型角色显示为「${roleCell}」，按 registry 应为「${row.modelRoleLabel}」`);
      }
      if (!rowHtml.includes(`data-catalog-status="${row.catalogStatus}"`)) {
        problems.push(`「${row.slug}」行缺少 data-catalog-status（筛选脚本与外部验收都读它）`);
      }
      // 「已下线」只允许出现在 status=retired 的行上
      const statusCell = (rowHtml.match(/<td data-cell="status">([^<]*)<\/td>/) || [])[1] || '';
      if (statusCell.includes(STATUS_LABEL.retired) && row.status !== 'retired') {
        problems.push(`「${row.slug}」行把 status=${row.status} 写成了「${STATUS_LABEL.retired}」—— 这个说法只允许用在官方已下线的模型上`);
      }
      if (row.status === 'retired' && !statusCell.includes(STATUS_LABEL.retired)) {
        problems.push(`「${row.slug}」的 status=retired，状态格却是「${statusCell}」（应写「${STATUS_LABEL.retired}」）`);
      }
    }
    // 搜索 / 筛选：控件由 JS 建（预渲染里一个都没有），数据全在静态表里。
    if (!/id="models-filter"/.test(text)) problems.push('缺少筛选控件容器 #models-filter');
    if (!/id="models-table"/.test(text)) problems.push('缺少模型表 #models-table');
    if (!/id="models-count"/.test(text)) problems.push('缺少计数行 #models-count');
    if (!String(html).includes(MODELS_INDEX_FILTER_SCRIPT)) {
      problems.push('内联的筛选脚本与 lib/models-page.js 里的那一份不是同一份字节');
    }
    // 默认隐藏集合是**构建期参数**：从页面原文把参数读回来，与判据层的集合逐个比对
    const scriptParams = modelsIndexFilterParamsOf(html);
    const wantedHidden = [...DEFAULT_HIDDEN_CATALOG_STATUS].sort().join(',');
    if (!scriptParams) {
      problems.push('页面里的筛选脚本没有 DEFAULT_HIDDEN 参数（默认可见性策略不见了）');
    } else if ([...scriptParams].sort().join(',') !== wantedHidden) {
      problems.push(`内联脚本的默认隐藏集合是 [${scriptParams.join(', ')}]，判据层要求 [${DEFAULT_HIDDEN_CATALOG_STATUS.join(', ')}]`);
    }
    if (DEFAULT_HIDDEN_CATALOG_STATUS.length && !String(html).includes(MODELS_SHOW_OLD_ID)) {
      problems.push(`默认隐藏了旧型号却没有「显示旧型号」入口（#${MODELS_SHOW_OLD_ID}）—— 藏起来的东西必须点得到`);
    }
    if (/<input|<select|<button/.test(text)) {
      problems.push('预渲染 HTML 里出现了 JS 控件 —— 控件必须整块由脚本建（无 JS 时不给可点暗示）');
    }
    // ItemList（只在页面真的带了 JSON-LD 时查内容；在场性由 seo.js 的 itemlist-arity 守）
    if (/<script[^>]+type="application\/ld\+json"/.test(String(html || ''))) {
      const list = jsonLdItemListOf(html);
      if (!list) problems.push('索引页缺少 ItemList 结构化数据');
      else {
        if (Number(list.numberOfItems) !== (list.itemListElement || []).length) {
          problems.push(`ItemList 声明 ${list.numberOfItems} 项，实际 ${(list.itemListElement || []).length} 项`);
        }
        if ((list.itemListElement || []).length !== markers.length) {
          problems.push(`ItemList ${(list.itemListElement || []).length} 项 ≠ 页面行 ${markers.length} 行`);
        }
        for (const element of list.itemListElement || []) {
          const slug = decodeURIComponent(String(element.url || '').replace(String(ctx.siteUrl || ''), '').replace(MODEL_ROUTE_PREFIX, '').replace(/\/$/, ''));
          if (!expected.has(slug)) problems.push(`ItemList 里的「${slug}」不是已生成详情页的模型`);
        }
      }
    }
    return problems;
  }

  if (kind === 'model') {
    checkCommon();
    const model = page.model;
    const name = modelNameOf(model);
    if (!text.includes(name)) problems.push(`缺少模型名「${name}」`);
    // 题面 D6 点名的六项基本信息 + coverage-expansion-v1 的三项（目录状态 / 模型角色 / 发布时间）
    for (const label of ['模型名称', '开发者', '别名', '官方链接', '目录状态', '模型角色', '发布时间']) {
      if (!text.includes(label)) problems.push(`详情页缺少「${label}」`);
    }
    // 发布时间：页面上的那一天 + 附了几条证据，都由页面自己声明的标记读回来对账。
    // 这一条同时守三件事：不许凑日期、有日期必须有官方证据链接、证据必须逐条可点。
    {
      const release = releaseBlockOf(model);
      const dateAttr = (text.match(/data-release-date="([^"]*)"/) || [])[1];
      const evidenceAttr = (text.match(/data-release-evidence="(\d+)"/) || [])[1];
      if (dateAttr === undefined) problems.push('详情页缺少 data-release-date 标记（发布时间无法被外部复核）');
      else if (dateAttr !== (release.date || '')) {
        problems.push(`详情页的发布时间是「${dateAttr}」，按 registry 应为「${release.date || '(未标注)'}」`);
      }
      if (evidenceAttr === undefined) problems.push('详情页缺少 data-release-evidence 标记');
      else if (Number(evidenceAttr) !== release.evidence.length) {
        problems.push(`详情页标了 ${evidenceAttr} 条发布日期证据，registry 里是 ${release.evidence.length} 条`);
      }
      if (release.raw && !release.date) {
        problems.push(`registry 的 releasedAt「${release.raw}」不是可解析的真实日期（数据层应判红，页面如实写「未标注」）`);
      }
      if (release.date) {
        if (!text.includes(`<time datetime="${release.date}">`)) {
          problems.push(`详情页没有把发布时间渲染成 <time datetime="${release.date}">`);
        }
        if (!release.evidence.length) {
          problems.push('详情页有发布时间却没有任何官方证据链接 —— 这句话必须有出处');
        }
        for (const item of release.evidence) {
          const url = String(item.sourceUrl || '');
          if (url && !text.includes(`href="${url}"`)) {
            problems.push(`发布日期证据的出处 ${url} 没有出现在页面上（证据必须点得到）`);
          }
        }
      } else if (release.evidence.length) {
        problems.push('registry 里附了发布日期证据却没有 releasedAt（互为充要，数据层应判红）');
      }
    }
    // 中性状态词：目录状态格里的词必须是词表里那一格；「已下线」只允许 status=retired 用
    {
      const status = String(model.status || 'unknown');
      if (!text.includes(catalogStatusLabelOf(model))) {
        problems.push(`详情页没有写出目录状态「${catalogStatusLabelOf(model)}」`);
      }
      const saidRetired = text.includes(STATUS_LABEL.retired);
      if (saidRetired && status !== 'retired') {
        problems.push(`模型 status=${status}，页面却写了「${STATUS_LABEL.retired}」—— 这个说法只允许用在官方已下线的模型上`);
      }
      if (status === 'retired' && !saidRetired) {
        problems.push(`模型 status=retired，页面却没有写出「${STATUS_LABEL.retired}」`);
      }
      const catalogAttr = (text.match(/data-catalog-status="([^"]*)"/) || [])[1];
      if (catalogAttr !== catalogStatusOf(model)) {
        problems.push(`详情页的 data-catalog-status 是「${catalogAttr}」，按数据应为「${catalogStatusOf(model)}」`);
      }
      // 详情路由不因目录状态变化：换一个目录状态重算门槛，结论必须一字不变
      const gate0 = modelPageGate(model, ctx);
      for (const forced of CATALOG_STATUSES) {
        const alt = modelPageGate({ ...model, catalogStatus: forced }, ctx);
        if (alt.shouldGenerate !== gate0.shouldGenerate || alt.route !== gate0.route) {
          problems.push(`该模型的门槛结论随 catalogStatus（${forced}）变化了 —— 详情页与 sitemap 只由显式引用决定`);
          break;
        }
      }
    }
    const refs = modelReferencesOf(model, ctx);
    // 期望行 = **展开后的计价条目集合**（一条真实 pricing item = 一行），不是 link 条数。
    // 行身份 `planId|modelKey|variant`：多行同身份 ⇒ 红（两行互不冒充）。
    const expectedRows = refs.apiItems.map(item => {
      const row = apiPricingRowOf(item, ctx);
      return {
        rowId: row.rowId,
        planId: row.planId,
        modelKey: row.modelKey,
        variant: String(row.variant === null || row.variant === undefined ? '' : row.variant),
        provider: row.providerKey
      };
    });
    const expectedById = new Map(expectedRows.map(row => [row.rowId, row]));
    const rowRe = /<tr class="mapirow" data-item="([^"]*)" data-plan="([^"]*)"[^>]*data-model-key="([^"]*)"[^>]*data-variant="([^"]*)"[^>]*data-provider="([^"]*)"/g;
    const seenRowIds = new Set();
    let match;
    let rowCount = 0;
    while ((match = rowRe.exec(text)) !== null) {
      rowCount++;
      const [, item, planId, modelKey, variant, provider] = match;
      const identity = `${planId}|${modelKey}|${variant}`;
      const expected = expectedById.get(identity);
      if (!expected) {
        const planKnown = expectedRows.some(row => row.planId === planId);
        problems.push(planKnown
          ? `表格里的行 identity「${identity}」不是该模型的真实计价条目（同一记录里被换掉的 variant / modelKey 也要报——不允许拿另一条价格冒充）`
          : `表格里的记录 ${planId} 不在该模型的显式引用里（凭空出现的 Provider「${provider}」）`);
        continue;
      }
      if (item !== identity) {
        problems.push(`表格行的 data-item（${item}）与行 identity（${identity}）不一致`);
      }
      if (seenRowIds.has(identity)) {
        problems.push(`表格里出现重复行 identity「${identity}」—— 一条计价条目只能有一行`);
      }
      seenRowIds.add(identity);
      if (expected.provider !== provider) {
        problems.push(`记录 ${planId} 的 Provider 显示为「${provider}」，按数据应为「${expected.provider}」`);
      }
    }
    if (rowCount !== expectedRows.length) {
      problems.push(`计价表 ${rowCount} 行 ≠ 该模型真实计价条目 ${expectedRows.length} 条（一条 pricing item = 一行；多变体不许吞行）`);
    }
    for (const row of expectedRows) {
      if (!seenRowIds.has(row.rowId)) {
        problems.push(`计价条目 ${row.rowId}（记录 ${row.planId} · ${row.modelKey} · variant ${row.variant}）没有渲染成行 —— 一个真实计价条目在页面上不存在`);
      }
    }
    // 题面 D6 点名的列（同一模型在多个平台上必须**全部**列出——行数对账在上一段）
    if (refs.apiItems.length) {
      const headHtml = (text.match(/<thead[\s\S]*?<\/thead>/) || [''])[0];
      for (const column of ['Provider', '计费通道', 'Variant', 'Input', 'Output', 'Cache', 'Unit', 'Last Seen']) {
        if (!headHtml.includes(column)) problems.push(`计价表缺少「${column}」列`);
      }
    }
    if (refs.missing.length) {
      problems.push(`有 ${refs.missing.length} 条映射指向不存在的记录 / modelKey（数据层应判红）`);
    }
    // 门槛：不该生成的页面若被渲染出来，这里也要红
    const gate = modelPageGate(model, ctx);
    if (!gate.shouldGenerate) {
      problems.push(`该模型未过生成门槛（${gate.reasons.join('；')}），不应有详情页`);
    }
    return problems;
  }

  problems.push(`未知的页面类型 ${kind}（assertPageHonesty 只认 models-index / model）`);
  return problems;
}

/** 页面里的 ItemList（原文里找，先摘脚本会把 JSON-LD 自己摘掉） */
function jsonLdItemListOf(html) {
  const blocks = [...String(html || '').matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
  for (const block of blocks) {
    try {
      const data = JSON.parse(block[1]);
      if (data && data['@type'] === 'ItemList') return data;
    } catch (error) { /* 解析失败按「没有」处理 */ }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* 站点级牙：canonical 唯一 / 空页面不进 sitemap                         */
/* ------------------------------------------------------------------ */

/**
 * §8 第 18 条牙：**两个模型页不许共用 canonical**。
 *
 * 判据与 `seo.js` 的 `canonical-unique` 同源（逐字相等即红），但这里查的是
 * 「模型页之间」这一子集 —— 索引页与详情页混在一起时，重复的那一对更容易被淹掉。
 *
 * @param {Array<{route:string, canonical:string}>} pages 模型页（索引 + 详情）
 * @returns {string[]} 问题清单
 */
function assertCanonicalUnique(pages) {
  const problems = [];
  const seen = new Map();
  for (const page of pages || []) {
    const route = String((page && page.route) || '');
    const canonical = String((page && page.canonical) || '').trim();
    if (!canonical) { problems.push(`${route}: 没有 canonical`); continue; }
    if (seen.has(canonical)) problems.push(`${route} 与 ${seen.get(canonical)} 共用 canonical：${canonical}`);
    else seen.set(canonical, route);
  }
  return problems;
}

/**
 * §8 第 19 条牙：**没过门槛的模型页不许进 sitemap**。
 *
 * @param {object} params
 *   `sitemapRoutes`  sitemap 里的路由（站根相对、带尾斜杠）
 *   `gateResults`    `modelPageGate()` 的产物数组（含 route / shouldGenerate）
 * @returns {string[]} 问题清单
 */
function assertSitemapEligibility({ sitemapRoutes = [], gateResults = [] } = {}) {
  const problems = [];
  const inSitemap = new Set(sitemapRoutes);
  for (const gate of gateResults) {
    if (!gate || !gate.route) continue;
    if (!gate.shouldGenerate && inSitemap.has(gate.route)) {
      problems.push(`${gate.route}: 未过生成门槛（${(gate.reasons || []).join('；')}）却出现在 sitemap 里`);
    }
    if (gate.shouldGenerate && !inSitemap.has(gate.route) && gate.expectedInSitemap !== false) {
      problems.push(`${gate.route}: 已过生成门槛却没有进 sitemap`);
    }
  }
  return problems;
}

module.exports = {
  MODELS_INDEX_ROUTE,
  MODEL_ROUTE_PREFIX,
  MODELS_INDEX_HEADING,
  MODELS_INDEX_DESCRIPTION,
  MODELS_INDEX_NOTES,
  MODELS_INDEX_FILTER_SCRIPT,
  MODELS_SHOW_OLD_ID,
  STATUS_LABEL,
  CATALOG_STATUS_LABEL,
  CATALOG_STATUSES,
  CATALOG_STATUS_UNKNOWN,
  DEFAULT_HIDDEN_CATALOG_STATUS,
  MODEL_ROLE_LABEL,
  FORBIDDEN_CLAIM_WORDS,
  UNKNOWN_TEXT,
  UNKNOWN_NUM,
  UNKNOWN_TRI,
  escapeHtml,
  modelsOf,
  linksOf,
  linkSlugOf,
  linkModelIdOf,
  linkTargets,
  apiTargetOf,
  apiTargetsOf,
  apiPricingRowIdOf,
  codingTargetOf,
  modelIdOf,
  modelNameOf,
  modelSlugOf,
  modelHrefOf,
  providerNameOf,
  catalogStatusOf,
  catalogStatusLabelOf,
  catalogStatusHiddenByDefault,
  modelRoleOf,
  modelRoleLabelOf,
  releaseDateOf,
  releaseEvidenceOf,
  releaseBlockOf,
  modelReferencesOf,
  modelPageGate,
  apiPricingRowOf,
  codingPlanLineOf,
  relatedDealLineOf,
  modelsIndexRowOf,
  modelsIndexRowHtml,
  buildModelsIndexFilterScript,
  modelsIndexFilterScriptHtml,
  modelsIndexFilterParamsOf,
  renderModelsIndex,
  modelsIndexJsonLd,
  renderModelPage,
  modelPricingRowHtml,
  modelPageJsonLd,
  markupOnly,
  jsonLdItemListOf,
  assertPageHonesty,
  assertCanonicalUnique,
  assertSitemapEligibility,
  modelsMarkdownish
};
