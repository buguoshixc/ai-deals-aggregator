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
 * ## 纯函数
 *
 * 不读盘、不联网、不看时钟：registry、映射、`api-plans.json`、日志都由调用方传入。
 */

'use strict';

const apiSchema = require('./api-plan-schema');
const apiPlansPage = require('./api-plans-page');
const plansPage = require('./plans-page');
const apiPlanHistory = require('./api-plan-history');
const dealPlanLinks = require('./deal-plan-links');
// 身份派生（`id = sha1('model|' + slug)`）只有一处实现 —— 页面层不自己再 hash 一遍，
// 否则"两个身份空间"就是这么来的。这里只用纯函数，不触发任何读盘。
const modelRegistry = require('./model-registry');
const pageKinds = require('./page-kinds');

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

const STATUS_LABEL = {
  active: '在售 / 可用',
  deprecated: '官方已弃用',
  retired: '已下线',
  unknown: '未确认'
};

const MODELS_INDEX_NOTES = [
  '这一页是**身份索引**：一行 = 一个模型。同一家公司的不同写法不会自动合并 ——'
  + '两个模型是否同一个，必须靠**显式映射**或官方证据，相似度与猜测都只能生成候选。',
  '「出现平台数」只统计**本站已收录且有显式映射**的 API 计价条目；'
  + '没有映射的 `modelKey` 仍然留在覆盖报告里，不会在这里被算成"这个平台也提供它"。',
  '模型详情页展示的价格全部来自 [API / Token 计费对比](plans/api/) 的同一份数据；'
  + '本页**不折算、不合并、不排序成"最便宜"**，也**不写推荐**。',
  '别名只用于**已确认改名 / 官方别名 / 格式差异**，每条都应有来源；别名不用于猜测同模型。'
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
 * API 侧引用：`apiPlanId + modelKey(+variant)` → 记录里的那一条计价。
 * 找不到就如实记进 `missing`（数据层门禁会判红），**绝不编一条价格出来**。
 */
function apiTargetOf(link, apiPlansById) {
  const plan = apiPlansById.get(link.apiPlanId) || null;
  if (!plan) return null;
  const entry = (plan.models || []).find(item => item && item.modelKey === link.modelKey
    && (!link.variant || item.variant === link.variant)) || null;
  return entry ? { plan, entry } : null;
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
      const hit = apiTargetOf(link, apiPlansById);
      if (!hit) {
        missing.push({ kind: 'api', apiPlanId: link.apiPlanId, modelKey: link.modelKey });
        continue;
      }
      modelKeys.add(hit.entry.modelKey);
      planIds.add(hit.plan.id);
      apiItems.push({ plan: hit.plan, entry: hit.entry, link });
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

/** 一条 API 计价条目 → 展示行（价格用 API 页的同一套格式化，不重写口径） */
function apiPricingRowOf(item, ctx = {}) {
  const { plan, entry } = item;
  const providerKey = plan.provider;
  return {
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
}

/** 索引页的一行：一个模型 */
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
 *   · 不改地址、不生成 URL、不做任何排序或推荐 —— 只做"隐藏 / 显示"。
 */
const MODELS_INDEX_FILTER_SCRIPT = `(function () {
  'use strict';
  var table = document.getElementById('models-table');
  var host = document.getElementById('models-filter');
  var counter = document.getElementById('models-count');
  if (!table || !host) return;
  var rows = Array.prototype.slice.call(table.querySelectorAll('tbody tr[data-item]'));
  if (!rows.length) return;

  function valuesOf(attr) {
    var seen = [];
    rows.forEach(function (row) {
      var value = row.getAttribute(attr) || '';
      if (value && seen.indexOf(value) === -1) seen.push(value);
    });
    return seen;
  }

  function makeSelect(label, attr, values, formatter) {
    var wrap = document.createElement('label');
    wrap.className = 'mfl';
    wrap.appendChild(document.createTextNode(label));
    var select = document.createElement('select');
    select.setAttribute('data-filter', attr);
    var all = document.createElement('option');
    all.value = '';
    all.textContent = '全部';
    select.appendChild(all);
    values.forEach(function (value) {
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

  host.appendChild(makeSelect('开发者', 'data-developer', valuesOf('data-developer')));
  host.appendChild(makeSelect('模型族', 'data-family', valuesOf('data-family')));
  host.appendChild(makeSelect('状态', 'data-status', valuesOf('data-status')));
  host.appendChild(makeSelect('出现平台数', 'data-platforms', valuesOf('data-platforms').sort(function (a, b) { return Number(a) - Number(b); }), function (value) {
    return value + ' 个平台';
  }));

  function apply() {
    var query = input.value.trim().toLowerCase();
    var selects = Array.prototype.slice.call(host.querySelectorAll('select[data-filter]'));
    var shown = 0;
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
      row.hidden = !ok;
      if (ok) shown += 1;
    });
    if (counter) counter.textContent = '显示 ' + shown + ' / ' + rows.length + ' 个模型';
  }

  host.addEventListener('input', apply);
  host.addEventListener('change', apply);
  apply();
})();`;

/** 内联脚本的 HTML（与 `plans-compare` 一样：页面上的那一份就是这里的一份字节） */
function modelsIndexFilterScriptHtml() {
  return `<script id="models-filter-core">\n${MODELS_INDEX_FILTER_SCRIPT}\n</script>`;
}

function modelsIndexRowHtml(row, prefix) {
  const aliasText = row.aliases.length ? row.aliases.join('、') : UNKNOWN_NUM;
  const name = row.linked
    ? `<a href="${escapeHtml(`${prefix}${row.href}`)}">${escapeHtml(row.name)}</a>`
    : `${escapeHtml(row.name)}<small class="munlinked">资料不足，未生成详情页</small>`;
  return `        <tr data-item="${escapeHtml(row.slug)}"
          data-developer="${escapeHtml(row.developer)}"
          data-family="${escapeHtml(row.family)}"
          data-status="${escapeHtml(row.statusLabel)}"
          data-platforms="${row.platformCount}"
          data-search="${escapeHtml(row.search)}">
          <th scope="row">${name}<small>${escapeHtml(row.id)}</small></th>
          <td>${escapeHtml(row.developer)}</td>
          <td>${escapeHtml(row.family)}</td>
          <td>${escapeHtml(aliasText)}</td>
          <td>${escapeHtml(row.statusLabel)}</td>
          <td class="num">${row.platformCount}</td>
          <td class="num">${row.apiItemCount}</td>
          <td>${escapeHtml(row.lastSeen || UNKNOWN_TEXT)}</td>
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
  const developerCount = new Set(rows.map(row => row.developer)).size;
  const notes = MODELS_INDEX_NOTES
    .map(text => `        <li>${modelsMarkdownish(text, prefix)}</li>`).join('\n');

  const emptyState = rows.length
    ? ''
    : `      <p class="snote mnone">当前 registry 里没有任何模型 —— 这是事实，不是故障：本站只收录有官方来源、且能被显式引用的模型。</p>\n`;
  const unlinkedBlock = unlinked.length
    ? `      <h2 class="ph2" id="models-unlinked">资料不足的模型（未生成详情页）</h2>
      <p class="snote">${modelsMarkdownish('以下模型在 registry 里有身份，但**还没有任何显式引用**（API 计价映射 / 套餐 / 优惠 / 历史事件），因此本版本不为它们生成详情页 —— 它们仍在覆盖报告里。', prefix)}</p>
      <ul class="mlist">
${unlinked.map(row => `        <li>${escapeHtml(row.name)}<small>${escapeHtml(row.developer)}</small></li>`).join('\n')}
      </ul>
`
    : '';

  return `      <nav class="crumb" aria-label="面包屑"><a href="${escapeHtml(prefix)}">首页</a> › <span>${escapeHtml(MODELS_INDEX_HEADING)}</span></nav>

      <div class="stop">
        <h1>${escapeHtml(MODELS_INDEX_HEADING)}</h1>
        <span class="meta">${rows.length} 个模型 · ${developerCount} 个开发者 · ${linked.length} 个已生成详情页</span>
      </div>

      <p class="snote">${escapeHtml(MODELS_INDEX_DESCRIPTION)}</p>

      <h2 class="ph2" id="models-notes">口径与说明（先读这一段）</h2>
      <ul class="plist">
${notes}
      </ul>

${emptyState}      <div id="models-filter" class="mfilter" aria-label="筛选模型"></div>
      <p class="snote mcount" id="models-count">显示 ${linked.length} / ${linked.length} 个模型</p>

      <div class="ptable-wrap">
      <table class="ptable" id="models-table">
        <caption>一行 = registry 里的一个模型。价格与平台数只统计 <b>已显式映射</b> 的本站数据；
          没有生成详情页的模型列在表下的清单里（它们仍在覆盖报告里）。</caption>
        <thead>
          <tr><th scope="col">模型</th><th scope="col">开发者</th><th scope="col">模型族</th><th scope="col">别名</th>
            <th scope="col">状态</th><th scope="col">出现平台数</th><th scope="col">API 计价条目</th><th scope="col">最近核对</th></tr>
        </thead>
        <tbody>
${linked.length ? linked.map(row => modelsIndexRowHtml(row, prefix)).join('\n') : ''}
        </tbody>
      </table>
      </div>

${unlinkedBlock}
      <p class="snote" id="models-links">相关页面：
        <a href="${escapeHtml(`${prefix}plans/`)}">套餐与 API 计费资料库</a> ·
        <a href="${escapeHtml(`${prefix}plans/api/`)}">API / Token 计费对比</a> ·
        <a href="${escapeHtml(`${prefix}vendor/`)}">按厂商浏览</a> ·
        <a href="${escapeHtml(`${prefix}archive/`)}">历史档案</a> ·
        <a href="${escapeHtml(`${prefix}docs/data/`)}">数据文档</a>
      </p>
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
  return `        <tr class="mapirow" data-item="${escapeHtml(row.planId)}" data-plan="${escapeHtml(row.planId)}"
          data-model-key="${escapeHtml(row.modelKey)}" data-provider="${escapeHtml(row.providerKey)}">
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
 * `/models/<slug>/` 正文（纯函数）。
 *
 * @param {object} model registry entry
 * @param {object} ctx   见 `modelReferencesOf()`；另需 `prefix`、
 *                       `vendorHrefOf(developer)`（有厂商资料页时才给链接；缺省不给）
 */
function renderModelPage(model, ctx = {}) {
  const prefix = ctx.prefix === undefined ? '../../' : ctx.prefix;
  const refs = modelReferenceOfCached(model, ctx);
  const name = modelNameOf(model);
  const aliases = Array.isArray(model.aliases) ? model.aliases : [];
  const rows = refs.apiItems.map(item => apiPricingRowOf(item, ctx));
  const platformCount = new Set(rows.map(row => row.providerKey)).size;

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
    : `      <p class="snote mnone">${modelsMarkdownish('本站的 API 计费数据里还没有与该模型**显式映射**的计价条目。这不是"没有平台提供它"，而是"我们还没有确证的官方价格" —— 未映射的 modelKey 记在覆盖报告里。', prefix)}</p>`;

  const codingBlock = refs.codingPlans.length
    ? `      <ul class="mlist">
${refs.codingPlans.map(item => codingPlanLineOf(item, ctx, prefix)).join('\n')}
      </ul>`
    : `      <p class="snote mnone">${modelsMarkdownish('没有与该模型**显式关联**的 Coding 套餐 —— 本站不按套餐里的模型名猜关系（`supportedModels` 是自由文本，没有模型键）。', prefix)}</p>`;

  const dealsBlock = refs.deals.length
    ? `      <ul class="mlist">
${refs.deals.map(item => relatedDealLineOf(item, ctx, prefix)).join('\n')}
      </ul>`
    : `      <p class="snote mnone">${modelsMarkdownish('没有与该模型**显式关联**的优惠 —— 本站不用标题关键词猜关系。', prefix)}</p>`;

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
      : `      <p class="snote mnone">API 计费日志里没有与该模型相关的事件。</p>`)
    : `      <p class="snote mnone">本次构建没有拿到 API 计费日志 —— 这不表示「没有变化」。</p>`;

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
        <dt>状态</dt><dd>${escapeHtml(STATUS_LABEL[model.status] || STATUS_LABEL.unknown)}</dd>
        <dt>官方链接</dt><dd>${official}${vendorLine}</dd>
        <dt>首次收录</dt><dd>${escapeHtml(model.firstSeen || UNKNOWN_TEXT)}</dd>
        <dt>最近核对</dt><dd>${escapeHtml(model.lastSeen || UNKNOWN_TEXT)}</dd>
        <dt>记录 id</dt><dd>${escapeHtml(modelIdOf(model))}</dd>
      </dl>

      <h2 class="ph2" id="model-api">API 提供平台与计价条目（${rows.length} 条）</h2>
      <p class="snote">全部来自本站 <a href="${escapeHtml(`${prefix}plans/api/`)}">API / Token 计费对比</a> 的同一份数据；
        每一行都带计费单位与官方定价页。<b>不折算、不排序成"最便宜"、不写推荐</b>。</p>
${pricingBlock}

      <h2 class="ph2" id="model-plans">相关 Coding 套餐</h2>
${codingBlock}

      <h2 class="ph2" id="model-deals">相关优惠</h2>
${dealsBlock}

      <h2 class="ph2" id="model-history">模型变化记录（派生视图）</h2>
      <p class="snote">${modelsMarkdownish('这一节是**派生视图**：直接把 API 计费日志里与该模型有关的记录事件排出来，不新建第四套历史真值。', prefix)}</p>
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
 *   · 详情页：表格每一行的 `data-provider` 必须等于该 `plan` 在数据里的 provider
 *     ——「展示不存在的 Provider」当场变红（§8 第 5 条牙）。
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
    const rows = modelsOf(page.registry).map(model => modelsIndexRowOf(model, ctx));
    const linked = rows.filter(row => row.linked);
    const markers = [...text.matchAll(/data-item="([^"]*)"/g)].map(match => match[1]);
    if (markers.length !== linked.length) {
      problems.push(`索引页 ${markers.length} 行 ≠ 已生成详情页的模型 ${linked.length} 个`);
    }
    const expected = new Set(linked.map(row => row.slug));
    for (const slug of markers) {
      if (!expected.has(slug)) problems.push(`索引页列出了不该生成详情页的模型「${slug}」`);
    }
    // 搜索 / 筛选：控件由 JS 建（预渲染里一个都没有），数据全在静态表里。
    if (!/id="models-filter"/.test(text)) problems.push('缺少筛选控件容器 #models-filter');
    if (!/id="models-table"/.test(text)) problems.push('缺少模型表 #models-table');
    if (!/id="models-count"/.test(text)) problems.push('缺少计数行 #models-count');
    if (!String(html).includes(MODELS_INDEX_FILTER_SCRIPT)) {
      problems.push('内联的筛选脚本与 lib/models-page.js 里的那一份不是同一份字节');
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
    // 题面 D6 点名的六项基本信息
    for (const label of ['模型名称', '开发者', '别名', '官方链接']) {
      if (!text.includes(label)) problems.push(`详情页缺少「${label}」`);
    }
    const refs = modelReferencesOf(model, ctx);
    const expectedPlanProviders = new Map(refs.apiItems.map(item => [item.plan.id, item.plan.provider]));
    const rowRe = /<tr class="mapirow" data-item="([^"]*)" data-plan="([^"]*)"[^>]*data-model-key="([^"]*)"[^>]*data-provider="([^"]*)"/g;
    let match;
    let rowCount = 0;
    while ((match = rowRe.exec(text)) !== null) {
      rowCount++;
      const [, item, planId, modelKey, provider] = match;
      const real = expectedPlanProviders.get(planId);
      if (!real) {
        problems.push(`表格里的记录 ${planId} 不在该模型的显式引用里（凭空出现的 Provider「${provider}」）`);
        continue;
      }
      if (real !== provider) {
        problems.push(`记录 ${planId} 的 Provider 显示为「${provider}」，按数据应为「${real}」`);
      }
      const known = refs.apiItems.some(entry => entry.plan.id === planId && entry.entry.modelKey === modelKey);
      if (!known) problems.push(`记录 ${planId} 上标注的 modelKey「${modelKey}」与该模型没有映射`);
      if (item !== planId) problems.push(`表格行的 data-item（${item}）与记录 id（${planId}）不一致`);
    }
    if (rowCount !== refs.apiItems.length) {
      problems.push(`计价表 ${rowCount} 行 ≠ 显式映射的计价条目 ${refs.apiItems.length} 条`);
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
  STATUS_LABEL,
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
  codingTargetOf,
  modelIdOf,
  modelNameOf,
  modelSlugOf,
  modelHrefOf,
  providerNameOf,
  modelReferencesOf,
  modelPageGate,
  apiPricingRowOf,
  codingPlanLineOf,
  relatedDealLineOf,
  modelsIndexRowOf,
  modelsIndexRowHtml,
  modelsIndexFilterScriptHtml,
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
