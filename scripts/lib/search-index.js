/**
 * 全站搜索的**索引推导**（唯一判据）。
 *
 * ## 它是什么 / 不是什么
 *
 * 输入是四份真值与落地页计划（已经算好的 spec），输出一份**扁平条目表**：
 * `{ kind, title, subtitle, url, keywords, vendor }`。它不做全文检索、不评分、不排序推荐；
 * 浏览器侧只做一件事：按 `keywords` 的小写子串过滤已经渲染在静态 HTML 里的条目。
 *
 * ## URL 的唯一出处
 *
 * 本文件**不发明**任何 URL 前缀：
 *   · 优惠 → `deal/<id>/`（与详情页路由同一形态；调用方只传**真有详情页**的 deal）
 *   · 套餐 → `feed.PLAN_URL_PREFIX.plan`（`plans/coding/#plan-`）
 *   · API 计费 → `feed.PLAN_URL_PREFIX.apiPlan`（`plans/api/#plan-`）
 *   · 模型 → `models/<slug>/`（slug 取 models.json 的 `slug` 字段，不再推导一次）
 *   · 厂商/分类/需求/专题 → `landing.planLandingPages()` 的 `spec.route`（调用方传入，禁第二套）
 *   · 固定页 → `fixedRoutes`（调用方传 FIXED_ROUTE_KINDS 的路由，本文件不抄一份清单）
 *
 * ## 为什么按 URL 去重
 *
 * 同一目标只能出现一次：搜索页上点两条不同的字、落到同一个地址，读者无法判断该点哪一条。
 * 去重键就是 `url`（大小写与前后空白归一后）。重复时**保留先出现的那条**（顺序由输入决定：
 * 优惠 → 工具 → 套餐 → API 计费 → 模型 → 厂商 → 指南页），并在 `dropped` 计数里如实记账。
 *
 * ## 三态
 *
 * `null` / 缺失字段不参与关键词拼接，也不伪造「未标注」之类占位：宁可在条目里少一个词，
 * 也不要把「没有这个数据」变成一条能被搜到的内容。`kind` 不在登记表里直接 throw ——
 * 新增一类条目必须同时更新 `SEARCH_KINDS` 与页面分组，不允许悄悄混进「其它」。
 */
'use strict';

const feed = require('./feed');
const pageKinds = require('./page-kinds');

/** 分组顺序 = 页面顺序。label 是**页面分组标题**，不是数据字段。 */
const SEARCH_KINDS = [
  { kind: 'deal', label: '优惠与工具' },
  { kind: 'tool', label: '工具页' },
  { kind: 'plan', label: 'Coding 套餐' },
  { kind: 'apiPlan', label: 'API 计费' },
  { kind: 'model', label: '模型' },
  { kind: 'vendor', label: '厂商' },
  { kind: 'page', label: '指南与资料页' }
];

const SEARCH_KIND_ORDER = SEARCH_KINDS.map(item => item.kind);
const SEARCH_KIND_LABEL = Object.freeze(SEARCH_KINDS.reduce((acc, item) => {
  acc[item.kind] = item.label;
  return acc;
}, {}));

/** 固定页的展示标题：只用路由 → 一句人话，不复制页面自己的 h1 正文。 */
const FIXED_PAGE_TITLES = Object.freeze({
  'status/': '数据源状态',
  'changes/': '优惠变化雷达',
  'plans/': '套餐与 API 计费总览',
  'plans/coding/': 'AI Coding 套餐对比',
  'plans/api/': 'API / Token 计费对比',
  'models/': '模型资料索引',
  'archive/': '历史档案',
  'docs/data/': '数据与引用',
  'tools/api-cost/': 'API 成本计算器',
  'codex-reset/': 'Codex 额度重置档案'
});

const DEAL_REGION_LABEL = { cn: '国内', global: '国外' };

function textOf(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function distinctNonEmpty(values) {
  const out = [];
  const seen = new Set();
  for (const value of values) {
    const text = textOf(value);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

function keywordsOf(parts) {
  return distinctNonEmpty(parts).join(' ').toLowerCase();
}

function dealKeywords(deal) {
  const zh = deal.zh && typeof deal.zh === 'object' ? deal.zh : {};
  return keywordsOf([
    deal.title, deal.vendor, deal.category, deal.audience, deal.benefitType,
    DEAL_REGION_LABEL[deal.region] || deal.region,
    deal.type === 'tool' ? '工具' : '优惠',
    zh.discountInfo, zh.description, zh.eligibility, zh.validity, zh.priceLine,
    ...(Array.isArray(deal.features) ? deal.features : []),
    ...(Array.isArray(deal.collections) ? deal.collections : []),
    ...(Array.isArray(deal.needs) ? deal.needs : [])
  ]);
}

function planKeywords(plan) {
  return keywordsOf([
    plan.planName, plan.provider,
    ...(Array.isArray(plan.supportedModels) ? plan.supportedModels.map(model => model && model.name) : []),
    'Coding 套餐'
  ]);
}

function apiPlanKeywords(plan) {
  return keywordsOf([
    plan.planName, plan.provider, plan.channel,
    ...(Array.isArray(plan.models) ? plan.models.map(model => model && (model.name || model.modelKey)) : []),
    'API 计费 Token'
  ]);
}

function modelKeywords(model) {
  return keywordsOf([
    model.canonicalName, model.developer, model.family,
    ...(Array.isArray(model.aliases) ? model.aliases : []),
    '模型'
  ]);
}

function landingKeywords(spec) {
  return keywordsOf([
    spec.title, spec.heading, spec.description, spec.thresholdSummary,
    ...(Array.isArray(spec.userNotes) ? spec.userNotes : []),
    '指南'
  ]);
}

/**
 * @param {object} input
 * @param {object[]} input.deals        只传**真有详情页**的记录（调用方用路由集合过滤；本文件不判存在性）
 * @param {object[]} input.plans        plans.json 的 plans
 * @param {object[]} input.apiPlans     api-plans.json 的 plans
 * @param {object[]} input.models       models.json 的 models
 * @param {object[]} input.landingSpecs planLandingPages().pages（vendor / category / need / collection）
 * @param {string[]} input.fixedRoutes  固定页路由（FIXED_ROUTE_KINDS 的键）
 * @param {string} [input.siteUrl]      预留：本文件不拼绝对 URL（站内相对链接没有 base 歧义）
 * @returns {{entries:object[], counts:object, dropped:number}}
 */
function buildSearchIndex(input = {}) {
  const deals = Array.isArray(input.deals) ? input.deals : [];
  const plans = Array.isArray(input.plans) ? input.plans : [];
  const apiPlans = Array.isArray(input.apiPlans) ? input.apiPlans : [];
  const models = Array.isArray(input.models) ? input.models : [];
  const landingSpecs = Array.isArray(input.landingSpecs) ? input.landingSpecs : [];
  const fixedRoutes = Array.isArray(input.fixedRoutes) ? input.fixedRoutes : [];

  const entries = [];
  const push = entry => {
    const kind = textOf(entry.kind);
    if (!SEARCH_KIND_ORDER.includes(kind)) {
      throw new Error(`全站搜索：未登记的条目类型「${kind}」（合法值：${SEARCH_KIND_ORDER.join(' / ')}）`);
    }
    const url = textOf(entry.url);
    const title = textOf(entry.title);
    if (!url || !title) return;
    entries.push({
      kind,
      title,
      subtitle: textOf(entry.subtitle),
      url,
      keywords: textOf(entry.keywords),
      vendor: textOf(entry.vendor)
    });
  };

  for (const deal of deals) {
    // 只有 `type === 'deal'` 的条目有站内详情页；`tool` 类型是「站外线索」，
    // 没有可点的站内页面 —— 索引里绝不能给它编一条链接（死链比缺一条更糟）。
    if (!deal || deal.type !== 'deal') continue;
    const id = textOf(deal && deal.id);
    if (!id) continue;
    push({
      kind: 'deal',
      title: deal.title || id,
      subtitle: distinctNonEmpty([deal.vendor, DEAL_REGION_LABEL[deal.region] || deal.region]).join(' · '),
      url: `deal/${encodeURIComponent(id)}/`,
      keywords: dealKeywords(deal),
      vendor: deal.vendor || ''
    });
  }

  for (const route of fixedRoutes) {
    const normalized = pageKinds.normalizeRoute(route);
    if (normalized === '' || normalized === 'search/') continue; // 首页与搜索页自身不进结果
    const kind = pageKinds.kindOfRoute(normalized);
    if (kind === 'tool') {
      push({
        kind: 'tool',
        title: FIXED_PAGE_TITLES[normalized] || pageKinds.KIND_TABLE[kind].label,
        subtitle: normalized,
        url: normalized,
        keywords: keywordsOf([FIXED_PAGE_TITLES[normalized], pageKinds.KIND_TABLE[kind].label, normalized])
      });
    } else if (kind) {
      push({
        kind: 'page',
        title: FIXED_PAGE_TITLES[normalized] || pageKinds.KIND_TABLE[kind].label,
        subtitle: normalized,
        url: normalized,
        keywords: keywordsOf([FIXED_PAGE_TITLES[normalized], pageKinds.KIND_TABLE[kind].label, normalized])
      });
    }
  }

  for (const plan of plans) {
    const id = textOf(plan && plan.id);
    if (!id) continue;
    push({
      kind: 'plan',
      title: plan.planName || id,
      subtitle: distinctNonEmpty([plan.provider, 'Coding 套餐']).join(' · '),
      url: `${feed.PLAN_URL_PREFIX.plan}${encodeURIComponent(id)}`,
      keywords: planKeywords(plan),
      vendor: plan.provider || ''
    });
  }

  for (const plan of apiPlans) {
    const id = textOf(plan && plan.id);
    if (!id) continue;
    push({
      kind: 'apiPlan',
      title: distinctNonEmpty([plan.provider, plan.planName]).join(' · ') || id,
      subtitle: distinctNonEmpty([plan.channel, 'API 计费']).join(' · '),
      url: `${feed.PLAN_URL_PREFIX.apiPlan}${encodeURIComponent(id)}`,
      keywords: apiPlanKeywords(plan),
      vendor: plan.provider || ''
    });
  }

  for (const model of models) {
    const slug = textOf(model && model.slug);
    if (!slug) continue;
    push({
      kind: 'model',
      title: model.canonicalName || slug,
      subtitle: distinctNonEmpty([model.developer, '模型']).join(' · '),
      url: `models/${encodeURIComponent(slug)}/`,
      keywords: modelKeywords(model),
      vendor: model.developer || ''
    });
  }

  // alias 页有 canonical 正本（不重复索引）；hub 页是真实目录入口，按指南页收。
  const LANDING_KINDS = ['vendor', 'collection', 'need', 'category', 'hub'];
  for (const spec of landingSpecs) {
    const route = textOf(spec && spec.route);
    if (!route) continue;
    // 别名页的 canonical 指向正本 —— 索引进搜索结果只会把读者送到一条会被归并的 URL。
    // 它先于 kind 校验：alias 是 landing 计划里的**既有**产出，不是未知形状。
    if (spec.canonicalRoute) continue;
    if (!LANDING_KINDS.includes(spec.kind)) {
      throw new Error(`全站搜索：未知 landing kind「${spec.kind}」（只接受 ${LANDING_KINDS.join(' / ')}）`);
    }
    const kind = spec.kind === 'vendor' ? 'vendor' : 'page';
    const countText = Number(spec.count) > 0 ? `收录 ${Number(spec.count)} 条` : '';
    push({
      kind,
      title: spec.heading || spec.title || route,
      subtitle: distinctNonEmpty([kind === 'vendor' ? '厂商资料' : '指南', countText]).join(' · '),
      url: route,
      keywords: landingKeywords(spec),
      vendor: kind === 'vendor' ? spec.title || '' : ''
    });
  }

  // URL 去重：保留先出现的一条（输入顺序即分组顺序），并如实记账。
  const seen = new Set();
  const unique = [];
  let dropped = 0;
  for (const entry of entries) {
    const key = entry.url.trim().toLowerCase();
    if (seen.has(key)) { dropped++; continue; }
    seen.add(key);
    unique.push(entry);
  }

  const counts = {};
  for (const kind of SEARCH_KIND_ORDER) counts[kind] = 0;
  for (const entry of unique) counts[entry.kind] += 1;

  return { entries: unique, counts, dropped };
}

/** 浏览器侧过滤判据的唯一实现（渲染与自测共用同一句话）。 */
function matchesQuery(entry, query) {
  const needle = textOf(query).toLowerCase();
  if (!needle) return true;
  const haystack = `${entry.keywords} ${entry.title} ${entry.subtitle}`.toLowerCase();
  return haystack.includes(needle);
}

module.exports = {
  SEARCH_KINDS,
  SEARCH_KIND_ORDER,
  SEARCH_KIND_LABEL,
  FIXED_PAGE_TITLES,
  buildSearchIndex,
  matchesQuery
};
