/**
 * v3.0 Stage E：**厂商统一资料页**（`/vendor/<slug>/`）的资料区块。
 *
 * ## 这一层做什么、不做什么
 *
 * 现有 `/vendor/<slug>/` 是「优惠聚合页」；v3.0 把它升级成**资料库页面**：
 * 同一个 URL 上同时给出优惠、Coding 套餐、API 计费、模型归属与最近变化。
 *
 * ⚠️ t3（去数据暴露）：**「订阅这一家」那一节整节删除**。它把本页自己的 Feed 与全站订阅中心
 * （`/feeds/`、RSS / JSON Feed）摆在读者面前，而本轮的目标正是「站点不再面向读者暴露订阅与
 * 数据文件」。删的是**整节** —— `SECTION_IDS.feeds` + 两种分支（有 Feed / 没有 Feed）+ 渲染块，
 * 不是让它渲染成空串：说明清单（notes-manifest-v1）按「登记了几条」逐页对账，返回空串会留下
 * 幽灵声明（清单声明 N 条 / DOM N−1 条），构建期 `noteManifestSelfCheck()` 与真浏览器 §22c ⑨ 同时红。
 * 连带影响：`VENDOR_NOTE_COUNT` 6 → 5（见该常量处的说明）。
 *
 * **全部靠 join，不 duplicate**：
 *   · 优惠 ← `deals.json`（判据是 `landing.itemsOf(spec, …)` 的既有归属，页面表格已经在列）；
 *   · Coding 套餐 ← `plans.json` 的 `provider`；
 *   · API 计费 ← `api-plans.json` 的 `provider`（`pricing.unit` / `channel` / `models[]` 全部来自记录）；
 *   · 模型 ← `models.json` 的 `developer`/`owner` 逐字相等，或关系层 `model-registry-links.json`
 *     把模型映射到这家厂商的 API 记录（两跳全显式）；
 *   · 变化 ← 三份既有变化日志（deal / plan / api-plan），一行都不重新判据。
 * 没有任何新的 provider 数据文件，也没有"厂商数据"的第二真值。
 *
 * ## 三条纪律（都有断言）
 *
 * 1. **只列事实**：不排名、不推荐、不做"最便宜"排序；结论性词汇复用
 *    `plans-page.js` 的同一份 `FORBIDDEN_CLAIM_WORDS`。
 * 2. **数字可重算**：页面上每个计数都带 `data-vendor-count` 标记，
 *    `assertVendorPageHonesty()` 从数据重算再逐个比对（页面上写 3、数据里 2 ⇒ 红）。
 * 3. **空态是事实**：某一类资料没有就写「本站尚未收录…」，不写 0、不写「无」。
 *
 * ⚠️ 本模块产出的 HTML **绝不允许出现 `data-item` / `data-child`**：
 * 那些标记是条目行/子页行的对账锚点，多一个就会让 `seo.js` 的 `itemlist-arity`
 * 对不上（厂商页的 ItemList 只数条目表格里的行）。断言里有一条专门盯着它。
 */

'use strict';

const plansPage = require('./plans-page');
const apiPlansPage = require('./api-plans-page');
const apiSchema = require('./api-plan-schema');
const apiPlanHistory = require('./api-plan-history');
const planHistory = require('./plan-history');

const VENDOR_ROUTE_PREFIX = 'vendor/';
const KNOWLEDGE_WRAPPER_ID = 'vendor-knowledge';

const UNKNOWN_TEXT = plansPage.UNKNOWN_TEXT;
const UNKNOWN_NUM = plansPage.UNKNOWN_NUM;
const FORBIDDEN_CLAIM_WORDS = plansPage.FORBIDDEN_CLAIM_WORDS;
const escapeHtml = plansPage.escapeHtml;

const API_CHANNEL_LABEL = apiSchema.API_CHANNEL_LABEL;

/** 每个区块的固定 id（断言与锚点共用一份；新增区块必须同时进 `SECTION_IDS`） */
const SECTION_IDS = {
  official: 'vendor-official',
  plans: 'vendor-plans',
  api: 'vendor-api',
  models: 'vendor-models',
  changes: 'vendor-changes'
  // t3：删掉 `feeds: 'vendor-feeds'`。它在两处被消费 —— 渲染块（那一节整节删除）与
  // `assertVendorPageHonesty()` 的「每个区块都在」循环（自己跟着 `SECTION_IDS` 收敛）。
  // 失效方式：只删渲染块、留着这个 id ⇒ 断言当场红（「缺少资料区块 feeds」）（这是要的：
  // 它保证"删了区块"必须是一次同时改两处的决定，而不是渲染层悄悄少写一节）。
};

/* ------------------------------------------------------------------ */
/* 小工具                                                              */
/* ------------------------------------------------------------------ */

function markupOnly(html) {
  return plansPage.markupOnly(html);
}

function rich(text) {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function distinct(values) {
  const out = [];
  for (const value of values) {
    const text = String(value === null || value === undefined ? '' : value).trim();
    if (!text || out.includes(text)) continue;
    out.push(text);
  }
  return out;
}

/** 一组记录里最近一次核对日（没有就如实 null，不写今天） */
function latestSeenOf(records) {
  const dates = (records || []).map(record => String((record && record.lastSeen) || '').slice(0, 10))
    .filter(text => /^\d{4}-\d{2}-\d{2}$/.test(text)).sort();
  return dates.length ? dates[dates.length - 1] : null;
}

/* ------------------------------------------------------------------ */
/* 视图：一家厂商的全部资料（显式 join）                                  */
/* ------------------------------------------------------------------ */

/**
 * @param {object} spec 落地页计划里的厂商页（`landing.planLandingPages()` 产物）
 * @param {object} ctx
 *   `deals`              当前有效优惠（已经按本页判据筛好，`itemsOf()` 的结果）
 *   `plans`              `plans.json` 的记录
 *   `apiPlans`           `api-plans.json` 的记录
 *   `models`             Model Registry 的模型（派生产物数组或 `{models:[]}`）
 *   `modelLinks`         `model-registry-links.json` 的 links
 *   `planHistoryStore` / `apiPlanHistoryStore`  两份变化日志（可缺）
 *   `providerTable`      providers.json 的归一表（取 provider key / 官方入口）
 *   `officialUrlOf(name)` 可选的「厂商官方入口」解析（缺省时用记录里的官方地址）
 *
 * ⚠️ t3 起**不再接受 `feeds`**：厂商页的订阅节整节删除（见文件头）。传进来的 `ctx.feeds`
 * 现在被静默忽略 —— 不是"可缺"，而是"这一层不再有订阅这个概念"。
 */
function vendorViewOf(spec, ctx = {}) {
  const vendorName = String((spec && spec.key) || '');
  const slug = String((spec && spec.slug) || '');
  const providerKey = (spec && spec.providerKey) || providerKeyOf(vendorName, ctx.providerTable);
  const plans = Array.isArray(ctx.plans) ? ctx.plans : [];
  const apiPlans = Array.isArray(ctx.apiPlans) ? ctx.apiPlans : [];
  const models = Array.isArray(ctx.models) ? ctx.models
    : ((ctx.models && Array.isArray(ctx.models.models)) ? ctx.models.models : []);
  const modelLinks = Array.isArray(ctx.modelLinks) ? ctx.modelLinks : [];
  const deals = Array.isArray(ctx.deals) ? ctx.deals : [];

  const codingPlans = providerKey ? plans.filter(plan => plan && plan.provider === providerKey) : [];
  const apiRecords = providerKey ? apiPlans.filter(plan => plan && plan.provider === providerKey) : [];
  const apiPlanIds = new Set(apiRecords.map(plan => plan.id));
  const apiPlansById = new Map(apiPlans.filter(plan => plan && plan.id).map(plan => [plan.id, plan]));

  /**
   * 一条 API 映射**认领的真实计价条目数**（F-v3-registry-001 / P1-12）。
   *
   * 旧口径把 `link` 当条目数：一条 `variant: null` 的映射记成 1，而它其实覆盖
   * 该 `modelKey` 在这条记录里的全部真实变体（真实数据里有 12 组 `standard + long_context`）。
   * 于是厂商页上「在这一家的计价条目 N 条」比模型页实际列出的行数少 —— 同一个事实两个数字。
   * 这里**独立重算**（只读 api-plans 的 `models[].variant`，不 require 模型页/registry 的判据）：
   * 通配 link 数它真实展开到的条目，显式 link 数 1（变体不存在时数 0，不虚增）。
   */
  const apiItemCountOf = link => {
    const plan = apiPlansById.get(link.apiPlanId) || null;
    if (!plan || !apiPlanIds.has(plan.id)) return 0;
    const entries = (plan.models || []).filter(item => item && item.modelKey === link.modelKey);
    if (!entries.length) return 0;
    if (link.variant === null || link.variant === undefined || link.variant === '') return entries.length;
    return entries.filter(item => item.variant === link.variant).length;
  };

  // 模型归属：developer/owner 逐字相等（Registry 自己的字段），或关系层把模型连到本厂商的 API 记录。
  const ownModels = models.filter(model => model
    && (String(model.developer || '') === vendorName || String(model.owner || '') === vendorName));
  const linkedSlugs = new Set(modelLinks
    .filter(link => link && link.apiPlanId && apiPlanIds.has(link.apiPlanId))
    .map(link => String(link.registrySlug || link.registryModelId || ''))
    .filter(Boolean));
  const modelRows = models
    .filter(model => model && (ownModels.includes(model) || linkedSlugs.has(String(model.slug)) || linkedSlugs.has(String(model.id))))
    .map(model => {
      const refs = modelLinks.filter(link => link
        && (String(link.registrySlug || '') === String(model.slug) || String(link.registryModelId || '') === String(model.id)));
      // 计价**条目**数（展开后），不是映射条数：一条通配映射覆盖它真实展开到的全部变体
      const itemCount = refs.filter(link => link.apiPlanId).reduce((sum, link) => sum + apiItemCountOf(link), 0);
      return {
        slug: String(model.slug || ''),
        id: String(model.id || ''),
        name: String(model.canonicalName || model.slug || ''),
        developer: String(model.developer || UNKNOWN_TEXT),
        family: String(model.family || UNKNOWN_TEXT),
        apiItemCount: itemCount,
        owned: String(model.developer || '') === vendorName || String(model.owner || '') === vendorName
      };
    })
    .sort((a, b) => (b.apiItemCount - a.apiItemCount) || (a.slug < b.slug ? -1 : 1));

  const apiModelCount = apiRecords.reduce((sum, plan) => sum + (Array.isArray(plan.models) ? plan.models.length : 0), 0);
  const apiChannels = distinct(apiRecords.map(plan => API_CHANNEL_LABEL[plan.channel] || plan.channel));

  // 官方入口：优先外部注入的映射；否则**如实引用记录里记录的官方地址**（不推断主页）。
  const injected = typeof ctx.officialUrlOf === 'function' ? ctx.officialUrlOf(vendorName) : null;
  const recordUrls = distinct([
    ...codingPlans.map(plan => plan.officialUrl),
    ...apiRecords.map(plan => plan.officialUrl),
    ...apiRecords.map(plan => plan.sourceUrl),
    ...deals.map(deal => deal.url)
  ]);
  const official = injected
    ? { url: String(injected), matched: true, label: '官方入口' }
    : (recordUrls.length ? { url: recordUrls[0], matched: false, label: '本站条目里记录的官方地址' } : null);
  const officialSources = recordUrls.slice(0, 3);

  const updatedAt = latestSeenOf([...codingPlans, ...apiRecords, ...ownModels]);

  // 变化：三份既有日志，各取与本厂商相关的事件（plan/api 按 provider 的前缀 id —— 记录 id 已足够）。
  const planStore = ctx.planHistoryStore || null;
  const apiStore = ctx.apiPlanHistoryStore || null;
  const planIds = new Set(codingPlans.map(plan => plan.id));
  const planEvents = planStore && Array.isArray(planStore.events)
    ? planStore.events.filter(event => event && planIds.has(event.planId)) : [];
  const apiEvents = apiStore && Array.isArray(apiStore.events)
    ? apiStore.events.filter(event => event && apiPlanIds.has(event.planId)) : [];

  // t3：这里曾有 `const feed = ctx.feeds[0] || null;`（本页自己的 Feed）。订阅节整节删除之后
  // 它没有任何消费者 —— 留着就会成为"视图里有一个永远没人读的字段"，下一个改厂商页的人会
  // 以为订阅还在。 删掉它同时让调用方少传一个参数（`build-local.js` 传 `feeds:` 的那一行也删）。

  return {
    vendorName,
    slug,
    route: `${VENDOR_ROUTE_PREFIX}${slug}/`,
    providerKey,
    official,
    officialSources,
    updatedAt,
    deals: deals.map(deal => ({ id: deal.id, title: deal.title || deal.id })),
    dealCount: deals.length,
    codingPlans: codingPlans.map(plan => ({
      id: plan.id, planName: plan.planName, officialUrl: plan.officialUrl || '', lastSeen: plan.lastSeen || null
    })),
    apiRecords: apiRecords.map(plan => ({
      id: plan.id,
      planName: plan.planName,
      channel: plan.channel || null,
      channelLabel: API_CHANNEL_LABEL[plan.channel] || plan.channel || UNKNOWN_TEXT,
      modelCount: Array.isArray(plan.models) ? plan.models.length : 0,
      unit: apiPlansPage.unitTextOf(plan),
      officialUrl: plan.officialUrl || '',
      lastSeen: plan.lastSeen || null
    })),
    apiChannels,
    apiModelCount,
    models: modelRows,
    planEvents,
    apiEvents,
    planAvailability: planStore ? 'ok' : 'unavailable',
    apiAvailability: apiStore ? 'ok' : 'unavailable'
  };
}

function providerKeyOf(vendorName, providerTable) {
  const table = providerTable || {};
  for (const [key, entry] of Object.entries(table)) {
    if (entry && String(entry.name || '') === String(vendorName || '')) return key;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* 渲染                                                                */
/* ------------------------------------------------------------------ */

function countMark(name, value) {
  return `data-vendor-count="${escapeHtml(name)}" data-vendor-value="${escapeHtml(String(value))}"`;
}

function listOrEmpty(rows, emptyText) {
  return rows.length ? rows.join('\n') : `        <li class="vnone">${rich(emptyText)}</li>`;
}

/** 变化行：句子复用既有措辞（plan/api 各一支），不在这一层另写一套"变了什么" */
function planEventLine(event) {
  const T = planHistory.PLAN_HISTORY_WORDING;
  const type = T.PLAN_HISTORY_TYPES[event.type] || event.type;
  const field = event.field ? (T.PLAN_HISTORY_FIELD_LABELS[event.field] || event.field) : '';
  return `        <li><span class="vwhen"><time datetime="${escapeHtml(event.at)}">${escapeHtml(event.at)}</time></span>`
    + `<span class="vtype">${escapeHtml(type)}</span>`
    + `${field ? `<span class="vwhat">${escapeHtml(field)}</span>` : ''}</li>`;
}

function apiEventLine(event) {
  const W = apiPlanHistory.API_PLAN_HISTORY_WORDING;
  const type = W.API_PLAN_HISTORY_TYPES[event.type] || event.type;
  const detail = apiPlansPage.apiPlanChangeTextOf
    ? apiPlansPage.apiPlanChangeTextOf(event) : '';
  return `        <li><span class="vwhen"><time datetime="${escapeHtml(event.at)}">${escapeHtml(event.at)}</time></span>`
    + `<span class="vtype">${escapeHtml(type)}</span>`
    + `${detail ? `<span class="vwhat">${escapeHtml(detail)}</span>` : ''}</li>`;
}

/**
 * 厂商页的**追加区块**（`renderDirectoryPage` 的 `extraSections`）。
 *
 * 返回空串是完全合法的：所有输入都没有时它什么都不加（因此非厂商页传空上下文
 * 不会多出一个字节）。
 */
// [T5-vendor-300-official-paren]
// T5 删除（census A · 半句）：删「（取自本站收录的官方页面地址；本站不推断厂商主页）」—— **来源自证 + 否定式自证**（我们没有推断主页）。链接本身与 `rel="noopener"` 是读者需要的全部。⚠️ 25 个厂商页共用同一模板（改一处全站生效）；它在 `${view.official.matched ? '' : '…'}` 里，删的是那个字符串字面量的内容（**不拆三元**，保持结构）。
// [T5-vendor-319-api-vsrc]
// T5 删除（census A · 半句）：删「<span class="vsrc">全部来自 API / Token 计费对比 的同一份数据</span>」—— **数据来源自证**；三组计数（记录 / 计价条目 / 计费通道）是读者要的，保留。
// [T5-vendor-329-mapping-paren]
// T5 删除（census A · 半句）：删「（developer/owner 逐字相等，或关系层显式映射到这一家的计费记录；不按名称相似度归并）」—— **归一实现自证**。计数「Model Registry 归属模型 N 个」**保留**（删的只是括号里的实现说明）。
// [T5-vendor-354-changes-paren]
// T5 删除（census A · 半句）：删「（同一份事件、同一套措辞，这一层只搬运）」—— **实现自证**（我们这一层只是搬运）。两支的标题与列表保留。
// [T5-vendor-377-feed-threshold-paren] —— 该半句连同**整个订阅节**在 t3 一起下架：
// 节本身（`.vsnote` 两种分支 + `<div class="vsec" id="vendor-feeds">`）已删除，
// 所以「生成门槛自证」那句也随之消失，不需要单独处理。
// ⚠️ 与它一起变的还有一个数字：厂商页**无条件**产出的 `main-vsnote` 从 6 条变成 5 条，
// `VENDOR_NOTE_COUNT` 从 6 改成 5（`build-local.js` 的说明台账 floors 读的就是它）。
// 不同步改的下场：16 页 kind=half 的 `main-vsnote` 元素数 5 < floor 6 ⇒ §22c ⑨ 的结构下限当场红。
function renderVendorKnowledgeSections(spec, ctx = {}) {
  if (!spec || spec.kind !== 'vendor') return '';
  const view = ctx.view || vendorViewOf(spec, ctx);
  const prefix = ctx.prefix || '../';

  /**
   * 说明意图（notes-manifest-v1）：本节的每一条 `.vsnote` 都走「先登记、后输出」。
   *
   * `ctx.note` 由构建期注入（`build-local.js` 的目录页循环把 route 绑成一个登记入口），
   * 登记出的清单落在**产物目录的兄弟文件**（`<产物目录>.notes.ndjson`；t3 起不再进 dist/，
   * 见 `build-local.js` 的 `NOTES_MANIFEST_PATH`），构建期与 §22c 各自回读 HTML / DOM 对账。
   * 没有注入时（离线自测、报告工具直接调用本模块）退化成恒等函数：**不登记也不拦**，
   * 那种调用路径不产出页面；一旦构建期漏注入，厂商页的 `main-vsnote` 结构下限
   * （5 条，t3 起；原为 6 条）会当场把它抓出来，不会静默。
   */
  const note = typeof ctx.note === 'function' ? ctx.note : (decl, html) => html;
  const DECLARED_BY = 'lib/vendor-page.js:renderVendorKnowledgeSections';
  /** 登记一条 `.vsnote` 并原样返回。`vnone`（缺数据形态）是**不同的容器签名**，必须分开登记。 */
  const vsnote = (kind, html, missing = false) => note({
    kind, slot: 'main-vsnote', classes: missing ? 'vsnote vnone' : 'vsnote', declaredBy: DECLARED_BY
  }, html);

  const officialBlock = view.official
    ? vsnote('official-entry', `<p class="vsnote">${escapeHtml(view.official.label)}：<a href="${escapeHtml(view.official.url)}" rel="noopener">${escapeHtml(view.official.url)} ↗</a>`
      + `${view.official.matched ? '' : ''}`
      + `${view.officialSources.length > 1 ? ` · 另有 ${view.officialSources.length - 1} 个官方地址见各条目` : ''}</p>`)
    : vsnote('official-entry-missing', `<p class="vsnote vnone">${rich('本站尚未收录这家厂商的官方地址（没有可引用的记录），因此不写一个「看起来像主页」的地址。')}</p>`, true);
  const updatedBlock = view.updatedAt
    ? vsnote('updated-at', `<p class="vsnote">数据最后更新时间：<time datetime="${escapeHtml(view.updatedAt)}">${escapeHtml(view.updatedAt)}</time>`
      + `<span class="vsrc">（各数据集里这一家的最近核对日；不是官方承诺不变的日期）</span></p>`)
    : vsnote('updated-at-missing', `<p class="vsnote vnone">${rich('这家厂商的资料还没有任何核对日期 —— 尚未确认，不写今天。')}</p>`, true);

  const plansBlock = `<ul class="vlist">
${listOrEmpty(view.codingPlans.map(plan => `        <li><a href="${escapeHtml(`${prefix}plans/coding/#plan-${plan.id}`)}">${escapeHtml(plan.planName)}</a>`
    + `<small>记录 id ${escapeHtml(plan.id)}${plan.lastSeen ? ` · 最近核对 ${escapeHtml(plan.lastSeen)}` : ''}`
    + `${plan.officialUrl ? ` · <a href="${escapeHtml(plan.officialUrl)}" rel="noopener">官方页 ↗</a>` : ''}</small></li>`),
  '本站尚未收录这家厂商的 Coding 套餐（这是「我们还没查到」，不是「它没有套餐」）。')}
      </ul>`;

  const apiBlock = vsnote('api-counts', `<p class="vsnote">计费记录 <b ${countMark('api-records', view.apiRecords.length)}>${view.apiRecords.length}</b> 条`
    + ` · 模型计价条目 <b ${countMark('api-model-items', view.apiModelCount)}>${view.apiModelCount}</b> 条`
    + ` · 计费通道 <b ${countMark('api-channels', view.apiChannels.length)}>${view.apiChannels.length}</b> 类`
    + `${view.apiChannels.length ? `（${escapeHtml(view.apiChannels.join('、'))}）` : ''}`
    + `</p>
      <ul class="vlist">
${listOrEmpty(view.apiRecords.map(plan => `        <li><a href="${escapeHtml(`${prefix}plans/api/#plan-${plan.id}`)}">${escapeHtml(plan.planName)}</a>`
    + `<small>${escapeHtml(plan.channelLabel)} · ${escapeHtml(plan.unit)} · 模型计价条目 ${plan.modelCount} 条`
    + `${plan.lastSeen ? ` · 最近核对 ${escapeHtml(plan.lastSeen)}` : ''}`
    + `${plan.officialUrl ? ` · <a href="${escapeHtml(plan.officialUrl)}" rel="noopener">官方页 ↗</a>` : ''}</small></li>`),
  '本站尚未收录这家厂商的 API 计费记录。')}
      </ul>`);

  const modelsBlock = vsnote('models-count', `<p class="vsnote">Model Registry 归属模型 <b ${countMark('models', view.models.length)}>${view.models.length}</b> 个`
    + `</p>
      <ul class="vlist">
${listOrEmpty(view.models.map(model => `        <li><a href="${escapeHtml(`${prefix}models/${encodeURIComponent(model.slug)}/`)}">${escapeHtml(model.name)}</a>`
    + `<small>${escapeHtml(model.developer)} · ${escapeHtml(model.family)}`
    + `${model.apiItemCount ? ` · 在这一家的计价条目 ${model.apiItemCount} 条` : ''}`
    + `${model.owned ? '' : ' · 由关系层映射到这一家的计费记录'}</small></li>`),
  'Model Registry 里没有归属这家厂商、也没有映射到这家计费记录的模型。')}
      </ul>`);

  const planChangeLines = view.planEvents.slice().sort((a, b) => (a.at === b.at ? 0 : a.at < b.at ? 1 : -1)).slice(0, 5);
  const apiChangeLines = view.apiEvents.slice().sort((a, b) => (a.at === b.at ? 0 : a.at < b.at ? 1 : -1)).slice(0, 5);
  // ⚠️ secondary-page-content-simplification：这一行原先直接写了 `**套餐变化日志**`
  // 与 `**API 计费变化日志**`，而且**没有过 `rich()`** —— 于是 25 个厂商页上，
  // 读者看到的是字面的星号。它逃过了构建期的「作者正文无 Markdown 记号」守卫，
  // 因为那条守卫当时的扫描面只有 `.snote` / `<caption>`（`.vsnote` 不在里面）。
  // 两处都修了：这里用 rich() 把 `**x**` 变成 `<b>x</b>`；守卫的扫描面同时扩到
  // `.vsnote` 与 `<details>`（见 build-local.js 的「作者正文无 Markdown 记号」一节）。
  // ⚠️ secondary-page-intro-changes-v1：这一行原先无条件写「优惠变化见本页上方的「最近变化」块」。
  // 上方那一块现在是**条件模块**（只有真的存在与本页条目相关的变化事件才渲染，判据在
  // RENDER-CORE 的 changesTopicHtml），所以这句必须跟着条件化 —— 否则 25 个厂商页里绝大多数
  // 会指向一块不存在的模块。没有那一块时**只删掉指向子句**，不补任何关于变化的断言：
  // 「没有变化」这句话我们不能说（我们只是没有可展示的事件），而不写才是诚实的写法。
  const changesBlock = vsnote('changes-lanes', `<p class="vsnote">${rich((ctx.hasTopicChanges
    ? '优惠变化见本页上方的「最近变化」块。'
    : '') + '下面两支来自**套餐变化日志**'
    + '与 **API 计费变化日志**。')}</p>
      <h3 class="vh3">Coding 套餐变化（${view.planEvents.length} 条）</h3>
      ${view.planAvailability !== 'ok'
    ? vsnote('plan-changes-unavailable', `<p class="vsnote vnone">${rich('本次构建没有拿到套餐变更日志 —— 这不表示「没有变化」。')}</p>`, true)
    : `<ul class="vchglist">
${listOrEmpty(planChangeLines.map(planEventLine), '变化日志里没有与这家厂商的套餐相关的事件。')}
      </ul>`}
      <h3 class="vh3">API 计费变化（${view.apiEvents.length} 条）</h3>
      ${view.apiAvailability !== 'ok'
    ? vsnote('api-changes-unavailable', `<p class="vsnote vnone">${rich('本次构建没有拿到 API 计费变更日志 —— 这不表示「没有变化」。')}</p>`, true)
    : `<ul class="vchglist">
${listOrEmpty(apiChangeLines.map(apiEventLine), '变化日志里没有与这家厂商的计费记录相关的事件。')}
      </ul>`}`);

  // ⚠️ t3：这里曾有「订阅这一家」的两种分支（`vendor-feed` / `vendor-feed-missing`）。
  // **两支一起删**（整节下架），不是二选一地留一支 —— 理由有两条：
  //   ① 读者面：本轮的目标是站点不再面向读者暴露订阅与数据文件，而这节正是厂商页上唯一的
  //      `/feeds/` 入口（它同时是 `/feeds/` 页面在整站里**最后**的入链之一）；
  //   ② 说明清单：两条分支各自 `vsnote()` 登记一条，任何一条被改成"渲染空串"都会留下
  //      幽灵声明（清单 N 条 / DOM N−1 条），构建期 `noteManifestSelfCheck()` 与 §22c ⑨ 同时红。
  // 连带：`VENDOR_NOTE_COUNT` 6 → 5；`view.feed` 字段与 `ctx.feeds` 参数一起消失。

  return `      <section class="vknow" id="${KNOWLEDGE_WRAPPER_ID}" aria-labelledby="vendor-knowledge-h">
        <h2 class="vh2" id="vendor-knowledge-h">${escapeHtml(view.vendorName)} 的资料（来自已有数据关系）</h2>
        <div class="vsec" id="${SECTION_IDS.official}">
          <h3 class="vh3">官方入口与更新时间</h3>
${officialBlock}
${updatedBlock}
        </div>
        <div class="vsec" id="${SECTION_IDS.plans}">
          <h3 class="vh3">Coding 套餐（${view.codingPlans.length} 条）</h3>
${plansBlock}
        </div>
        <div class="vsec" id="${SECTION_IDS.api}">
          <h3 class="vh3">API 计费（<span ${countMark('api-records-inline', view.apiRecords.length)}>${view.apiRecords.length}</span> 条记录）</h3>
${apiBlock}
        </div>
        <div class="vsec" id="${SECTION_IDS.models}">
          <h3 class="vh3">模型（Model Registry）</h3>
${modelsBlock}
        </div>
        <div class="vsec" id="${SECTION_IDS.changes}">
          <h3 class="vh3">最近变化（套餐 / API 计费）</h3>
${changesBlock}
        </div>
      </section>
`;
}

/* ------------------------------------------------------------------ */
/* 断言                                                                */
/* ------------------------------------------------------------------ */

/**
 * 厂商资料页的诚实性断言：**从渲染结果回读**再与数据重算比对。
 *
 * @param {string} html 整页或正文
 * @param {object} spec 厂商页计划项
 * @param {object} ctx  与 `vendorViewOf()` 相同
 */
function assertVendorPageHonesty(html, spec, ctx = {}) {
  const problems = [];
  const text = markupOnly(String(html || ''));
  const view = ctx.view || vendorViewOf(spec, ctx);

  if (!/<h1[\s>]/.test(text)) problems.push('缺少 <h1>');
  if (!text.includes(KNOWLEDGE_WRAPPER_ID)) problems.push(`缺少资料区块容器 #${KNOWLEDGE_WRAPPER_ID}`);
  for (const [name, id] of Object.entries(SECTION_IDS)) {
    if (!text.includes(`id="${id}"`)) problems.push(`缺少资料区块「${name}」`);
  }
  for (const word of FORBIDDEN_CLAIM_WORDS) {
    if (text.includes(word)) problems.push(`页面出现结论性词汇「${word}」—— 厂商页只列事实`);
  }

  // 数字逐个重算比对（页面上写 3、数据里 2 ⇒ 红）
  const expected = [
    ['api-records', view.apiRecords.length],
    ['api-model-items', view.apiModelCount],
    ['api-channels', view.apiChannels.length],
    ['models', view.models.length]
  ];
  for (const [name, value] of expected) {
    const re = new RegExp(`data-vendor-count="${name}"[^>]*data-vendor-value="${value}"`);
    if (!re.test(String(html))) problems.push(`计数「${name}」的标记不是 ${value}（页面与数据不一致）`);
  }
  // 行数对账：每一条记录/模型都要真的出现在页面上
  for (const plan of view.codingPlans) {
    if (!text.includes(plan.planName)) problems.push(`缺少 Coding 套餐「${plan.planName}」`);
  }
  for (const record of view.apiRecords) {
    if (!text.includes(record.planName)) problems.push(`缺少 API 计费记录「${record.planName}」`);
  }
  for (const model of view.models) {
    if (!text.includes(model.name)) problems.push(`缺少模型「${model.name}」`);
  }
  // 关系层指向的模型必须真的存在（不许渲染一个不存在的模型页链接）
  const knownSlugs = new Set((Array.isArray(ctx.models) ? ctx.models : ((ctx.models && ctx.models.models) || [])).map(m => String(m.slug || '')));
  if (knownSlugs.size) {
    for (const model of view.models) {
      if (!knownSlugs.has(model.slug)) problems.push(`资料区块渲染了不存在的模型「${model.slug}」`);
    }
  }
  // 空态必须写明（不是空白、也不是 0）
  if (!view.codingPlans.length && !/尚未收录这家厂商的 Coding 套餐/.test(text)) problems.push('Coding 套餐为空时没有明确的空态');
  if (!view.apiRecords.length && !/尚未收录这家厂商的 API 计费记录/.test(text)) problems.push('API 计费为空时没有明确的空态');
  if (!view.models.length && !/没有归属这家厂商/.test(text)) problems.push('模型为空时没有明确的空态');

  // ItemList 安全：资料区块里不许出现条目行/子页行的对账锚点
  const block = (String(html).match(new RegExp(`<section[^>]*id="${KNOWLEDGE_WRAPPER_ID}"[\\s\\S]*?</section>`)) || [''])[0];
  if (/data-item=|data-child=/.test(block)) {
    problems.push('资料区块里出现了 data-item / data-child —— 那会让 ItemList 行数对账失真');
  }
  return problems;
}

/**
 * §8 牙 #6：**同一 provider 不许出现两个 canonical slug**。
 *
 * 判据分两层：
 *   · 页面上：两个厂商页不能共用同一个 slug（slug 唯一性）；
 *   · 数据上：同一家公司的 `vendor-slugs.json` 与 `providers.json` 两份 slug 必须逐字相同，
 *     且页面用的就是它 —— 这正是 `providers.validateSlugAgreement` 的页面侧投影。
 */
function assertVendorSlugCanonical(pages, { providerTable = {}, vendorSlugs = {} } = {}) {
  const problems = [];
  const seen = new Map();
  for (const page of pages || []) {
    if (!page || page.kind !== 'vendor') continue;
    const slug = String(page.slug || '');
    const route = String(page.route || '');
    if (!slug) { problems.push(`厂商页「${page.key}」没有 slug`); continue; }
    if (seen.has(slug)) problems.push(`${page.key} 与 ${seen.get(slug)} 用了同一个 slug「${slug}」—— 同一家公司只能有一个 canonical slug`);
    else seen.set(slug, page.key);

    const providerEntry = Object.values(providerTable).find(entry => entry && String(entry.name || '') === String(page.key || '')) || null;
    const fromProviders = providerEntry ? String(providerEntry.slug || '') : '';
    const fromVendorSlugs = String(vendorSlugs[page.key] || '');
    if (fromProviders && fromVendorSlugs && fromProviders !== fromVendorSlugs) {
      problems.push(`${page.key}: providers.json 的 slug「${fromProviders}」与 vendor-slugs.json 的「${fromVendorSlugs}」不一致`);
    }
    const canonical = fromVendorSlugs || fromProviders;
    if (canonical && canonical !== slug) {
      problems.push(`${page.key}: 页面用的 slug「${slug}」与 canonical「${canonical}」不一致（路由 ${route}）`);
    }
  }
  return problems;
}

/**
 * §8 牙 #7：`/vendor/` 与 `/provider/` **不许同时存在两套可索引的重复页面**。
 *
 * 方案 A（升级现有 `/vendor/<slug>/`）的硬边界：一旦出现 `provider/...` 的可索引路由，
 * 就是两套几乎相同的页面 —— 重复内容，而且旧 URL 的收录会被拆散。
 * 别名（noindex）也不行：这一页的目标就是共用一个 slug 空间。
 */
function assertNoParallelProviderRoutes(entries) {
  const problems = [];
  for (const entry of entries || []) {
    const route = typeof entry === 'string' ? entry : String((entry && entry.route) || '');
    const kind = typeof entry === 'string' ? null : (entry && entry.kind) || null;
    const indexable = typeof entry === 'string' ? true : Boolean(entry && entry.indexable);
    if (kind === 'provider' || /^provider\//.test(route)) {
      problems.push(`出现了 /provider/ 路由「${route}」${indexable ? '（可索引）' : ''} —— 方案 A 只保留 /vendor/<slug>/，两套重复页面会互相稀释收录`);
    }
  }
  return problems;
}

/**
 * §8 牙 #8：**Provider Page 的 API 数量必须与 api-plans 数据一致**。
 *
 * 这是"渲染层数字 vs 数据"的独立重算：不信任页面上的任何数字，
 * 只用 `provider` 字段从 `api-plans.json` 现算一遍再比对（构建期还会在写盘后回读再跑一次）。
 */
function assertVendorApiCounts(html, spec, ctx = {}) {
  const problems = [];
  const view = ctx.view || vendorViewOf(spec, ctx);
  const apiPlans = Array.isArray(ctx.apiPlans) ? ctx.apiPlans : [];
  const providerKey = view.providerKey;
  const records = providerKey ? apiPlans.filter(plan => plan && plan.provider === providerKey) : [];
  const items = records.reduce((sum, plan) => sum + (Array.isArray(plan.models) ? plan.models.length : 0), 0);
  const channels = new Set(records.map(plan => plan.channel).filter(Boolean)).size;

  if (records.length !== view.apiRecords.length) {
    problems.push(`数据里有 ${records.length} 条 API 记录，页面按 ${view.apiRecords.length} 条渲染`);
  }
  if (items !== view.apiModelCount) {
    problems.push(`数据里有 ${items} 个模型计价条目，页面按 ${view.apiModelCount} 个渲染`);
  }
  if (channels !== view.apiChannels.length) {
    problems.push(`数据里有 ${channels} 类计费通道，页面按 ${view.apiChannels.length} 类渲染`);
  }
  const text = markupOnly(String(html || ''));
  void text;
  for (const [name, value] of [['api-records', records.length], ['api-model-items', items], ['api-channels', channels]]) {
    if (!new RegExp(`data-vendor-count="${name}"[^>]*data-vendor-value="${value}"`).test(String(html))) {
      problems.push(`页面上的「${name}」不是 ${value}（与 api-plans 数据不一致）`);
    }
  }
  return problems;
}

/**
 * 资料区块的样式（**纯追加**）：只用首页已有的设计变量，不新建一套视觉语言。
 *
 * 接线时必须只在 `extraHtml` 非空时把它拼进 `<style>` —— 其它页面类型的输出
 * 才会逐字节不变（`renderDirectoryPage` 的既有四种页面一个字节都不能动）。
 */
const VENDOR_KNOWLEDGE_CSS = `  /* v3.0 Stage E：厂商统一资料页的追加区块。 */
  .vknow { margin-top: var(--s3); border-top: 1px solid var(--line); padding-top: var(--s3); }
  .vh2 { font-size: 15px; margin: 0 0 var(--s2); }
  .vh3 { font-size: 13px; margin: var(--s3) 0 var(--s1); }
  .vsec { margin: 0 0 var(--s2); }
  .vsnote { color: var(--mut); font-size: var(--fs-sm); line-height: 1.75; margin: 0 0 var(--s1); }
  .vsnote b { color: var(--ink); }
  .vsrc { color: var(--mut); margin-left: 6px; }
  .vnone { color: var(--mut); }
  .vlist { margin: 0; padding-left: 1.15em; color: var(--ink2); font-size: var(--fs-sm); line-height: 1.8; }
  .vlist small { color: var(--mut); display: block; }
  .vchglist { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; font-size: var(--fs-sm); }
  .vchglist li { display: flex; align-items: baseline; gap: var(--s2); flex-wrap: wrap; }
  .vwhen { color: var(--mut); font-variant-numeric: tabular-nums; }
  .vtype { color: var(--brand); }
  .vwhat { color: var(--ink2); }
`;

/**
 * 厂商资料页**无条件**产出的说明条数（`.vsnote`）—— 五节各一条：
 * 官方入口 · 数据更新时间 · API 计数 · 模型计数 · 变化来源。
 *
 * t3 起是 **5**（原为 6）：「订阅这一家」那一节整节删除（见文件头与 `SECTION_IDS` 处的说明）。
 * 这个数字是 `build-local.js` 里说明台账 floors 的**唯一输入**（`'main-vsnote'` 那一项），
 * 16 页 kind=half 的厂商页元素数从 6 变 5，不同步改 ⇒ §22c ⑨ 的结构下限当场红。
 * 失效方式（另一个方向）：数值改小了而节没删 ⇒ 台账下限低于实际，删掉一整节也不会有东西红。
 *
 * 判据在 `notes-manifest-v1`（`build-local.js` 的说明意图清单）：它是厂商页族的
 * **结构下限**（整节说明连同它的登记一起被删 ⇒ 红），而「每条是哪一条」由各自的
 * `vsnote()` 构造点登记。另有两支 `vnone` 形态（日志不可用时）是条件产出的，不计入下限。
 */
const VENDOR_NOTE_COUNT = 5;

/**
 * 渲染结果 + 需要的样式（接线方一次拿全，避免"忘了加 CSS"这种看不见的缺陷）。
 * 非厂商页返回 `{ html: '', css: '' }`。
 */
function renderVendorKnowledgeBundle(spec, ctx = {}) {
  const html = renderVendorKnowledgeSections(spec, ctx);
  return { html, css: html ? VENDOR_KNOWLEDGE_CSS : '' };
}

/**
 * 队长补充（R5 后续）：**19 个厂商页的 slug 必须都能在 `vendor-slugs.json` 里查到**。
 *
 * 为什么单列一条：`landing.js` 里 `vendorSlugs[name] || providerEntry.slug` 的兜底
 * 让"没登记的厂商也能出页"，于是 `vendor-slugs.json` 从"路由 slug 的**唯一权威**"
 * 悄悄退化成"可选覆盖表"—— 而 `/vendor/<slug>/` 是**已发布的 URL 空间**，
 * 这类静默退化正是 v1.6「URL 稳定性只兜住一半」踩过的坑。
 *
 * 判据：每个厂商页的 `key`（厂商显示名）必须出现在 `vendorSlugs` 里，
 * 且登记值与页面实际使用的 slug **逐字相同**。缺一条就红，报错里直接给建议。
 */
function assertVendorSlugDeclared(pages, { vendorSlugs = {} } = {}) {
  const problems = [];
  for (const page of pages || []) {
    if (!page || page.kind !== 'vendor') continue;
    const name = String(page.key || '');
    const slug = String(page.slug || '');
    if (!Object.prototype.hasOwnProperty.call(vendorSlugs, name)) {
      problems.push(`厂商「${name}」没有在 scripts/data/vendor-slugs.json 里登记 slug（页面用的是「${slug}」，`
        + '目前来自 providers.json 的兜底）—— 路由 slug 的权威表不该被隐式兜底绕过，请补一行');
      continue;
    }
    if (String(vendorSlugs[name]) !== slug) {
      problems.push(`厂商「${name}」在 vendor-slugs.json 里登记的是「${vendorSlugs[name]}」，页面用的是「${slug}」`);
    }
  }
  return problems;
}

/**
 * §8 牙 #7 的**姊妹牙**（队长 R5）：候选厂商名必须能在 **A 空间**查到身份，否则不该生成厂商页。
 *
 * `/vendor/<slug>/` 的身份键是 A 空间厂商名。一个 provider 若 `vendorKey === null`
 * （实测 trae / qoder / codebuddy / qoder-intl），它在 A 空间没有厂商名 ——
 * 给它建路由就要么新编一个厂商身份、要么改身份键，两者都不接受。
 * 这条断言把"页面上的厂商名必须在 A 空间有身份"变成构建期硬门：
 *   · `providerTable` 里能查到同名条目且 `vendorKey === null` ⇒ 红；
 *   · 传入 `vendorNames`（A 空间 `[键,名]` 表，来自 `renderCore.vendorKeyNames()`）时，
 *     页面上的厂商名必须能在里面查到 ⇒ 否则红。
 */
function assertVendorCandidateIdentity(pages, { providerTable = {}, vendorNames = null } = {}) {
  const problems = [];
  const known = vendorNames
    ? new Set((Array.isArray(vendorNames) ? vendorNames : Object.values(vendorNames)).map(name => String(name)))
    : null;
  for (const page of pages || []) {
    if (!page || page.kind !== 'vendor') continue;
    const name = String(page.key || '');
    if (known && !known.has(name)) {
      problems.push(`厂商页「${name}」不在 A 空间厂商名表里 —— /vendor/<slug>/ 的身份键必须是 A 空间厂商名`);
    }
    const entry = Object.values(providerTable).find(item => item && String(item.name || '') === name);
    if (entry && !entry.vendorKey) {
      problems.push(`厂商页「${name}」对应的 provider 没有 A 空间厂商名（vendorKey=null）—— 不该为它生成 /vendor/ 路由`);
    }
  }
  return problems;
}

module.exports = {
  VENDOR_ROUTE_PREFIX,
  KNOWLEDGE_WRAPPER_ID,
  SECTION_IDS,
  VENDOR_KNOWLEDGE_CSS,
  VENDOR_NOTE_COUNT,
  FORBIDDEN_CLAIM_WORDS,
  markupOnly,
  rich,
  latestSeenOf,
  providerKeyOf,
  vendorViewOf,
  renderVendorKnowledgeSections,
  renderVendorKnowledgeBundle,
  assertVendorPageHonesty,
  assertVendorSlugCanonical,
  assertVendorSlugDeclared,
  assertVendorCandidateIdentity,
  assertNoParallelProviderRoutes,
  assertVendorApiCounts
};
