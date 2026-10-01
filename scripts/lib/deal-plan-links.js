/**
 * Phase 2.4：**优惠（deals）↔ 套餐（plans）关系层**。
 *
 * ## 这一层解决什么
 *
 * `deals.json` 与 `plans.json` 是两套互不相干的数据（一个是采集/策展来的优惠、一个是人工核对的
 * 套餐定价），两边没有任何字段能把它们连起来 —— 而读者真正想问的是「这个优惠对应哪个正常套餐」
 * 与「这个套餐现在有没有优惠」。这一层就是那座桥。
 *
 * ## 为什么是**独立关系表**，而不是往记录里塞 `relatedPlanIds`
 *
 * 两个数据集都是**派生产物**、且字段集**封闭**：
 *   · `validateDeal` 有字段白名单，未知字段直接报错；
 *   · `validatePlan` 会把「归一器再跑一遍」的结果逐字段比对，多一个字段即不一致；
 *   · `deals.json` 平时由 `npm run collect` 重新推导、`plans.json` 由 `plans:rebuild` 推导，
 *     记录里手写的字段会在下一次重建时消失 —— 而「消失」不会有任何断言变红。
 * 关系是**人的显式断言**，天然属于人工来源层（与 `providers.json` / `vendor-slugs.json` /
 * `audience-overrides.json` 同类）：单独存、单独校验、单独发布、单独对账。
 *
 * ## 这个文件里的三条纪律
 *
 * 1. **不做模糊匹配**。`planIds` 是人写下的 id，不是标题相似度算出来的；标题匹配只用于
 *    `candidatesOf()` 产出的**候选报告**（供人工 review，绝不写进本表）。
 * 2. **状态只看数据，不看墙上时钟**。`asOf` 由调用方给（构建期用 `deals.json.updatedAt` 的
 *    日期），所以同一天两次构建的产物逐字节相同，跨零点也不会因为构建时刻而变。
 * 3. **派生值不落盘**。`savings` / `updatedAt` / `count` / `relatedPlans` 一律算出来，
 *    源文件里出现它们就是校验错误（与 `derivedMetrics` 同一条纪律）。
 *
 * 校验判据只写在这里：`validate.js`、自测、构建期读同一份，不各写一套。
 */

const fs = require('fs');
const path = require('path');

const providersLib = require('./providers');
const provenance = require('./provenance');
const plansPage = require('./plans-page');
const apiPlansPage = require('./api-plans-page');
const history = require('./history');
const planHistory = require('./plan-history');
const apiPlanHistory = require('./api-plan-history');
const historyCore = require('./history-core');

const LINKS_FILE = path.join(__dirname, '..', 'data', 'deal-plan-links.json');

/** 顶层 schemaVersion。形状变了要 +1，旧文件会被校验器当场拒掉 */
const LINK_SCHEMA_VERSION = 1;

/**
 * 关系是**怎么**确立的。前三条是「官方页直接指向具体套餐」（题面要求的高确定度规则），
 * 第四条是「人工确认」—— 它必须带出处，且报告里单独统计条数：让「靠人判断」的部分一眼可见。
 */
const LINK_BASIS = [
  'official-plan-page',
  'official-campaign-page',
  'official-pricing-page',
  'editorial-confirmed'
];

/** 优惠价格的适用范围：全员可享 / 需要资格。资格限定的不算「节省金额」（对多数读者不成立） */
const PROMO_APPLIES_TO = ['all', 'eligible'];

/** 关系退役的原因 */
const RETIRE_REASONS = ['campaign_ended', 'deal_pruned', 'plan_removed', 'relation_withdrawn'];

const LIMITS = {
  recordsTotal: 200,
  planIdsPerLink: 8,
  evidenceItems: provenance.MAX_EVIDENCE_ITEMS,
  quote: provenance.MAX_EVIDENCE_QUOTE_LENGTH,
  override: 200,
  note: 200,
  snapshot: 150
};

/** 引用文件的字段白名单（引文绑定的「字段」在这一层恒为 relation） */
const RELATION_EVIDENCE_FIELD = 'relation';

/** 规范键序：序列化顺序就是 diff 的可读性，重排会被校验器当场点名 */
const LINK_KEY_ORDER = ['dealId', 'planIds', 'provider', 'providerOverride', 'basis', 'evidence', 'confirmedAt', 'promo'];
const RETIRED_KEY_ORDER = [...LINK_KEY_ORDER, 'title', 'vendor', 'endedAt', 'reason'];

const ID_RE = /^[0-9a-f]{12}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 派生键：源文件里出现即错误（它们只能算出来） */
const DERIVED_KEYS = ['savings', 'updatedAt', 'count', 'relatedPlans'];

const UNKNOWN_TEXT = plansPage.UNKNOWN_TEXT;
const UNKNOWN_NUM = plansPage.UNKNOWN_NUM;

const PERIOD_SUFFIX = { monthly: '/月', yearly: '/年' };

/* ------------------------------------------------------------------ */
/* 小工具                                                              */
/* ------------------------------------------------------------------ */

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/** 文本截断（用于把采集来的优惠文案摘一小段到套餐页；截断必须留痕） */
function truncateText(value, max) {
  const text = String(value === null || value === undefined ? '' : value).replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function withoutMeta(object) {
  const out = {};
  for (const [key, value] of Object.entries(object || {})) {
    if (key.startsWith('_')) continue;
    out[key] = value;
  }
  return out;
}

function keyOrderOf(object) {
  return Object.keys(withoutMeta(object || {}));
}

/** 规范序：dealId 升序，再按 planIds 升序（与 plans.json 的「打乱输入得到同一份字节」同一条纪律） */
function orderKeyOf(record) {
  const ids = Array.isArray(record && record.planIds) ? record.planIds : [];
  return `${String((record && record.dealId) || '')}\u0000${ids.join(',')}`;
}

function sortRecords(list) {
  return [...(Array.isArray(list) ? list : [])].sort((a, b) => {
    const ak = orderKeyOf(a);
    const bk = orderKeyOf(b);
    return ak < bk ? -1 : ak > bk ? 1 : 0;
  });
}

/** 派生 updatedAt：全部 confirmedAt 的最大值（不读墙上时钟） */
function canonicalUpdatedAt(doc) {
  const dates = []
    .concat(Array.isArray(doc && doc.links) ? doc.links : [])
    .concat(Array.isArray(doc && doc.retired) ? doc.retired : [])
    .map(record => record && record.confirmedAt)
    .filter(text => DATE_RE.test(String(text || '')))
    .sort();
  if (!dates.length) return null;
  return `${dates[dates.length - 1]}T00:00:00+08:00`;
}

/** 注入 `dist/deals.json` 的字段（顺序即序列化顺序；RENDER-CORE 只读这些键） */
const RELATED_PLAN_FIELDS = [
  'planId', 'title', 'regularText', 'regularCode', 'promoText', 'promoCode',
  'periodText', 'quotaText', 'modelsText', 'promoLine', 'eligible', 'savingsText',
  'linkStatus', 'planStatus',
  /**
   * v2.5：被关联记录属于哪一类（`coding` / `api`）。
   *
   * 为什么必须显式带上它（而不是让渲染层去猜）：同一个字段名在两类记录上含义不同 ——
   * `regularText` 在套餐上是「正常价格 ¥99/月」，在 API 计费上是「智谱AI · 模型 API 按量计费」；
   * `periodText` 是「每月」还是「USD / 每 100 万 tokens」；`quotaText` 是套餐额度还是免费额度。
   * 少了这一个字段，优惠页会把两种东西按同一套标签渲染（**看起来完全正常**，
   * 但「额度」那一行会写着一个计费单位）。这是本层唯一一次契约变更，登记在此。
   */
  'planKind'
];

/**
 * 关系基准日：**两个数据集里较新的那一天**。
 *
 * 为什么不各用各的：一条优惠是否过期、一条套餐是否还在售，要用「我们手上的数据有多新」来判；
 * 分成两个基准日会让优惠页与套餐页对同一条关系给出不同结论（而两边看起来都「有依据」）。
 * 不读墙上时钟：同一天两次构建产物逐字节相同。
 */
function asOfOf({ dealsUpdatedAt = null, plansUpdatedAt = null, apiPlansUpdatedAt = null } = {}) {
  const dates = [dealsUpdatedAt, plansUpdatedAt, apiPlansUpdatedAt]
    .map(value => String(value || '').slice(0, 10))
    .filter(value => DATE_RE.test(value))
    .sort();
  return dates.length ? dates[dates.length - 1] : null;
}

/** 关系行 → 注入载荷（键序固定；`dealView()` 的富字段不进 dist） */
function relatedPlansOf(rows) {
  return (Array.isArray(rows) ? rows : []).map(row => {
    const out = {};
    for (const field of RELATED_PLAN_FIELDS) {
      if (field === 'linkStatus') out[field] = row.dealStatus === 'current' ? 'current' : 'ended';
      else if (field === 'planStatus') out[field] = row.planStatus;
      else out[field] = row[field] === undefined ? null : row[field];
    }
    return out;
  });
}

/* ------------------------------------------------------------------ */
/* 读盘（永不 throw：缺失/坏文件由调用方决定怎么办）                     */
/* ------------------------------------------------------------------ */

/**
 * @returns {{doc:object|null, file:string, missing:boolean, broken:string|null}}
 */
function load({ file = LINKS_FILE } = {}) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return { doc: null, file, missing: true, broken: null };
    throw new Error(`deal-plan-links.json 读取失败: ${error.message}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return { doc: null, file, missing: false, broken: `不是合法 JSON：${error.message}` };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { doc: null, file, missing: false, broken: '不是 JSON 对象' };
  }
  return { doc: parsed, file, missing: false, broken: null };
}

/** 发布用载荷：源表原样 + 两个派生字段（只进 dist，源文件里不许有） */
function publishedDoc(doc) {
  const links = sortRecords(doc && doc.links);
  const retired = sortRecords(doc && doc.retired);
  return {
    schemaVersion: LINK_SCHEMA_VERSION,
    updatedAt: canonicalUpdatedAt(doc),
    count: links.length + retired.length,
    links,
    retired
  };
}

/* ------------------------------------------------------------------ */
/* 状态：只看数据 + asOf（无墙上时钟）                                   */
/* ------------------------------------------------------------------ */

/**
 * 关系层看到的「套餐 id 空间」= Coding 套餐 ∪ API 计费记录。
 *
 * v2.5 加进 `ctx.apiPlans` 之后**关系表格式一个字没改**：两个 store 的 id basis 都含 `kind`
 * （`coding|…` / `api|…`），因此 id 不会撞；`provider` 一致性、状态、节省金额四道门照常适用。
 * 这样做的理由见 `docs/SCHEMA-v2.5.md` §8：优惠（例如「新用户送 500 万 tokens」）关联的
 * 往往是**厂商级**的 API 计费产品，而不是某个模型的某一档价格。
 */
function mapsOf(ctx) {
  const deals = Array.isArray(ctx && ctx.deals) ? ctx.deals : [];
  const plans = Array.isArray(ctx && ctx.plans) ? ctx.plans : [];
  const apiPlans = Array.isArray(ctx && ctx.apiPlans) ? ctx.apiPlans : [];
  return {
    dealsById: new Map(deals.filter(Boolean).map(deal => [deal.id, deal])),
    plansById: new Map([...plans, ...apiPlans].filter(Boolean).map(plan => [plan.id, plan]))
  };
}

/**
 * 一条记录最近一次生命周期事件的**类型**。
 *
 * ⚠️ 这里要的是 `type` 字符串，不是事件对象：`history.lastLifecycleOf()` 返回的是整条事件，
 * 而注入回调（自测用）习惯直接给 type —— 两种形态都在这里收敛成同一个字符串，
 * 免得调用方拿到一个对象去和 `'ended'` 比较（那永远为假，而且不会有任何东西报错）。
 */
function lifecycleTypeOf(value) {
  if (!value) return null;
  return typeof value === 'object' ? value.type || null : String(value);
}

function lifecycleOfDeal(dealId, ctx) {
  if (ctx && typeof ctx.dealLifecycleOf === 'function') return lifecycleTypeOf(ctx.dealLifecycleOf(dealId));
  if (ctx && ctx.dealHistoryStore) return lifecycleTypeOf(history.lastLifecycleOf(ctx.dealHistoryStore, dealId));
  return null;
}

function lifecycleOfPlan(planId, ctx) {
  if (ctx && typeof ctx.planLifecycleOf === 'function') return lifecycleTypeOf(ctx.planLifecycleOf(planId));
  if (ctx && ctx.apiPlanHistoryStore) {
    const fromApi = lifecycleTypeOf(historyCore.lastLifecycleOf(ctx.apiPlanHistoryStore, planId, apiPlanHistory.PROFILE));
    if (fromApi) return fromApi;
  }
  if (ctx && ctx.planHistoryStore) {
    return lifecycleTypeOf(historyCore.lastLifecycleOf(ctx.planHistoryStore, planId, planHistory.PROFILE));
  }
  return null;
}

/**
 * 一条优惠的当前状态。三种「已结束」在这里合流：
 *   · 记录已被采集层下架（`deal_pruned`）
 *   · 历史层记过 `ended`（`deal_ended`，来源不再列出）
 *   · 官方标注的截止日期已过（`expired`）
 */
function dealStatusOf(dealId, ctx) {
  const { dealsById } = mapsOf(ctx);
  const deal = dealsById.get(dealId);
  if (!deal) return { status: 'ended', reason: 'deal_pruned' };
  if (lifecycleOfDeal(dealId, ctx) === 'ended') return { status: 'ended', reason: 'deal_ended' };
  const asOf = String((ctx && ctx.asOf) || '');
  if (deal.expiresAt && asOf && String(deal.expiresAt) < asOf) {
    return { status: 'ended', reason: 'expired' };
  }
  return { status: 'current', reason: null };
}

/** 一条套餐的当前状态：还在不在表里 / 变化层有没有记过 ended */
function planStatusOf(planId, ctx) {
  const { plansById } = mapsOf(ctx);
  if (!plansById.has(planId)) return { status: 'removed', reason: 'plan_removed' };
  if (lifecycleOfPlan(planId, ctx) === 'ended') return { status: 'ended', reason: 'plan_ended' };
  return { status: 'current', reason: null };
}

/** 关系是否**当前**：优惠与套餐都必须还是当前的（题面 §七/§八：ended 不得算 current） */
function isCurrentRelation(dealStatus, planStatus) {
  return dealStatus === 'current' && planStatus === 'current';
}

/* ------------------------------------------------------------------ */
/* 派生指标：活动节省金额                                               */
/* ------------------------------------------------------------------ */

/**
 * 同套餐 + 同币种 + 同周期，且优惠是**全员可享**的，才算节省金额。
 *
 * 四道门缺一不可，任何一条不满足就返回 null —— 页面不显示这个字段，
 * 绝不写 0、也绝不跨币种用一个假汇率凑一个数（题面 §六）。
 *
 * @returns {{amount:number, currency:string, period:string}|null}
 */
function savingsOf(plan, promo) {
  // 第 1 道门同时挡住了 API 计费记录：它们**没有 `billing`**（价格是 `pricing` + 逐模型 `rates`），
  // 因此「节省多少」在结构上算不出来 —— 这正是对的：`promo.price` 是一个订阅价，
  // 与「每百万 token 的单价」之间没有任何减法是有意义的。
  if (!plan || !plan.billing || !promo) return null;
  if (promo.appliesTo !== 'all') return null;
  const billing = plan.billing;
  if (!Number.isFinite(billing.regularPrice) || !Number.isFinite(promo.price)) return null;
  if (!billing.currency || billing.currency !== promo.currency) return null;
  if (!billing.period || billing.period !== promo.period) return null;
  const amount = Math.round((billing.regularPrice - promo.price) * 100) / 100;
  if (!(amount > 0)) return null;
  return { amount, currency: promo.currency, period: promo.period };
}

/** `节省 ¥4.9/月`。周期后缀只认能对齐的两种（其余周期本来也算不出节省） */
function savingsTextOf(savings) {
  if (!savings) return null;
  const symbol = plansPage.CURRENCY_SYMBOL[savings.currency] || '';
  return `节省 ${symbol}${plansPage.formatNumber(savings.amount)}${PERIOD_SUFFIX[savings.period] || ''}`;
}

/* ------------------------------------------------------------------ */
/* 视图：套餐页与优惠页各要一份，都从这里出（判据只有一处）              */
/* ------------------------------------------------------------------ */

/** 套餐记录 → 展示文本。**复用套餐表的同一套格式化**，不在这里重写价格/额度口径 */
function planTextsOf(plan, ctx) {
  // v2.5：按 `kind` 分派。API 计费记录的「价格 / 周期 / 额度 / 模型」是另一套语义，
  // 复用套餐表的那四个字段会让优惠页把「USD / 每 100 万 tokens」写成「额度」。
  // 判据只有这一处，`rowsOfLink()` 与两个页面都从这里取。
  if (plan && plan.kind === 'api') {
    const texts = apiPlansPage.apiRowTextsOf(plan, ctx);
    return texts;
  }
  const row = plansPage.planRowOf(plan, { providerTable: (ctx && ctx.providerTable) || null });
  return {
    providerKey: row.providerKey,
    providerName: row.provider,
    planName: row.planName,
    title: `${row.provider} ${row.planName}`,
    regularText: row.regularText,
    regularCode: row.regularCode,
    promoText: row.promoText,
    promoCode: row.promoCode,
    periodText: row.periodText,
    quotaText: row.quotaAmountText,
    modelsText: row.modelsText
  };
}

/** 优惠文案摘要：官方 promo.note 优先，其次采集来的优惠原文（截断留痕） */
function promoLineOf(link, deal) {
  if (link && link.promo && link.promo.note) return link.promo.note;
  const text = (deal && (deal.discountInfo || deal.description)) || '';
  return truncateText(text, 80);
}

/**
 * 一条关系 → 每个关联套餐一行（套餐页与优惠页共用同一份字段，避免两处口径分家）。
 */
function rowsOfLink(link, ctx) {
  const { dealsById, plansById } = mapsOf(ctx);
  const deal = dealsById.get(link.dealId) || null;
  const dealStatus = dealStatusOf(link.dealId, ctx);
  const promo = link.promo || null;
  return (link.planIds || []).map(planId => {
    const plan = plansById.get(planId) || null;
    const planStatus = planStatusOf(planId, ctx);
    const texts = plan ? planTextsOf(plan, ctx) : null;
    const savings = plan ? savingsOf(plan, promo) : null;
    return {
      dealId: link.dealId,
      dealTitle: deal ? deal.title : null,
      planId,
      dealStatus: dealStatus.status,
      dealEndReason: dealStatus.reason,
      planStatus: planStatus.status,
      planEndReason: planStatus.reason,
      current: isCurrentRelation(dealStatus.status, planStatus.status),
      title: texts ? texts.title : null,
      planKind: (plan && plan.kind) || 'coding',
      providerName: texts ? texts.providerName : null,
      providerKey: texts ? texts.providerKey : link.provider,
      planName: texts ? texts.planName : null,
      regularText: texts ? texts.regularText : null,
      regularCode: texts ? texts.regularCode : null,
      promoText: texts ? texts.promoText : UNKNOWN_NUM,
      promoCode: texts ? texts.promoCode : '',
      periodText: texts ? texts.periodText : null,
      quotaText: texts ? texts.quotaText : null,
      modelsText: texts ? texts.modelsText : null,
      promoLine: promoLineOf(link, deal),
      eligible: Boolean(promo && promo.appliesTo === 'eligible'),
      promoPriceText: promo ? promoPriceTextOf(promo) : null,
      savingsText: savingsTextOf(savings),
      savings: savings ? { ...savings } : null,
      // 截止日期直接来自数据（没有就是没有，不写「长期有效」这种我们推断不出来的话）
      deadlineText: deal && deal.expiresAt ? `截止 ${deal.expiresAt}` : null,
      // 「已结束」的日期：优先用优惠自己的截止日，其次由退役记录给出
      endedAt: deal && deal.expiresAt ? deal.expiresAt : null
    };
  });
}

/** 优惠价格的可读文本（与套餐表同一套币种符号与千分位） */
function promoPriceTextOf(promo) {
  if (!promo || !Number.isFinite(promo.price)) return null;
  const symbol = plansPage.CURRENCY_SYMBOL[promo.currency] || '';
  return `${symbol}${plansPage.formatNumber(promo.price)}`;
}

/**
 * 优惠页用：dealId → 关联套餐行（只含 `links`；`retired` 的优惠记录已经不在站上，没有页面可挂）。
 * @returns {Map<string, object[]>}
 */
function dealView(doc, ctx) {
  const map = new Map();
  for (const link of sortRecords(doc && doc.links)) {
    if (!link || !link.dealId) continue;
    const rows = rowsOfLink(link, ctx);
    if (!rows.length) continue;
    map.set(link.dealId, rows);
  }
  return map;
}

/**
 * 套餐页 / API 计费页用：**每一条记录都有一行**（当前有优惠 / 暂无当前优惠 / 有历史关联），
 * 顺序与记录表一致（调用方传入的 plans 顺序 = 各自 store 的规范序）。
 *
 * v2.5：记录集合 = `ctx.plans` ∪ `ctx.apiPlans`（先 Coding 再 API，各自保持规范序）。
 * 两个页面各自只渲染属于自己那一半的行 —— 这一支只管"把关系挂到记录上"。
 */
function planDealsView(doc, ctx) {
  const plans = [...(Array.isArray(ctx && ctx.plans) ? ctx.plans : []),
    ...(Array.isArray(ctx && ctx.apiPlans) ? ctx.apiPlans : [])];
  const byPlan = new Map(plans.map(plan => {
    const texts = planTextsOf(plan, ctx);
    return [plan.id, {
      planId: plan.id,
      planKind: (plan.kind) || 'coding',
      title: texts.title,
      providerName: texts.providerName,
      planName: texts.planName,
      missing: false,
      current: [],
      history: []
    }];
  }));
  const rowsByPlan = (planId) => {
    if (!byPlan.has(planId)) {
      byPlan.set(planId, {
        planId,
        title: null,
        providerName: null,
        planName: null,
        missing: true,
        current: [],
        history: []
      });
    }
    return byPlan.get(planId);
  };

  for (const link of sortRecords(doc && doc.links)) {
    if (!link) continue;
    for (const row of rowsOfLink(link, ctx)) {
      const bucket = rowsByPlan(row.planId);
      if (row.current) bucket.current.push(row);
      else bucket.history.push(row);
    }
  }
  for (const record of sortRecords(doc && doc.retired)) {
    if (!record) continue;
    for (const planId of record.planIds || []) {
      const bucket = byPlan.get(planId);
      if (!bucket) continue; // 套餐已从 plans.json 移除：历史只保留在 retired 记录里，不挂到页面上
      bucket.history.push({
        dealId: record.dealId,
        dealTitle: record.title || null,
        planId,
        retired: true,
        current: false,
        endedAt: record.endedAt || null,
        endReason: record.reason || null,
        promoLine: record.promo && record.promo.note ? record.promo.note : '',
        savingsText: null,
        detailHref: null // 记录已不在站上：不给死链
      });
    }
  }

  const rows = [...byPlan.values()];
  const counts = {
    plans: rows.length,
    withCurrent: rows.filter(row => row.current.length).length,
    current: rows.reduce((sum, row) => sum + row.current.length, 0),
    history: rows.reduce((sum, row) => sum + row.history.length, 0),
    links: Array.isArray(doc && doc.links) ? doc.links.length : 0,
    retired: Array.isArray(doc && doc.retired) ? doc.retired.length : 0
  };
  const usedPlanIds = new Set(rows.filter(row => row.current.length || row.history.length).map(row => row.planId));
  counts.plansWithoutAnyDeal = rows.filter(row => !usedPlanIds.has(row.planId)).length;
  return { asOf: String((ctx && ctx.asOf) || ''), rows, counts };
}

/* ------------------------------------------------------------------ */
/* 校验                                                               */
/* ------------------------------------------------------------------ */

function pushKeysProblem(record, order, where, errors) {
  const keys = keyOrderOf(record);
  const unknown = keys.filter(key => !order.includes(key));
  for (const key of unknown) {
    if (DERIVED_KEYS.includes(key)) {
      errors.push(`${where}: 出现派生字段 ${key} —— 它只能由构建期算出来，不得手写`);
    } else {
      errors.push(`${where}: 未知字段 ${key}（允许：${order.join(' / ')}）`);
    }
  }
  const expected = keys.filter(key => order.includes(key));
  const canonical = order.filter(key => keys.includes(key));
  if (JSON.stringify(expected) !== JSON.stringify(canonical)) {
    errors.push(`${where}: 字段顺序不是规范序（应为 ${canonical.join(' → ')}，实得 ${expected.join(' → ')}）`);
  }
}

function normalizeEvidenceOf(record, where, opts, errors) {
  const value = record && record.evidence;
  if (value === undefined || value === null) {
    errors.push(`${where}: 缺少 evidence —— 关系必须有官方出处（一条 ≤${LIMITS.quote} 字的原文片段）`);
    return null;
  }
  const list = Array.isArray(value) ? value : [value];
  const normalized = provenance.normalizeEvidence(list, {
    fields: [RELATION_EVIDENCE_FIELD],
    today: opts.asOf || undefined
  });
  if (!normalized) {
    errors.push(`${where}: evidence 里没有任何一条合法引文（需 field=relation、http(s) 出处、非聚合站、非未来日期、≤${LIMITS.quote} 字）`);
    return null;
  }
  if (JSON.stringify(normalized) !== JSON.stringify(value)) {
    errors.push(`${where}: evidence 不是归一形态 —— 把归一器再跑一遍应与盘上逐字节相同（去重 / 排序 / 上限 / 字段名）`);
  }
  return normalized;
}

function checkPromo(promo, where, errors) {
  if (promo === undefined || promo === null) return true;
  if (typeof promo !== 'object' || Array.isArray(promo)) {
    errors.push(`${where}: promo 必须是对象（或整个省略）`);
    return false;
  }
  const keys = Object.keys(promo);
  const allowed = ['price', 'currency', 'period', 'appliesTo', 'note'];
  for (const key of keys) if (!allowed.includes(key)) errors.push(`${where}: promo 未知字段 ${key}`);
  if (!Number.isFinite(promo.price) || promo.price < 0) errors.push(`${where}: promo.price 必须是 ≥0 的有限数（不知道就别写 promo）`);
  if (!plansPage.CURRENCY_SYMBOL[promo.currency]) errors.push(`${where}: promo.currency 非法（${promo.currency}）`);
  if (!plansPage.BILLING_PERIOD_LABEL[promo.period]) errors.push(`${where}: promo.period 非法（${promo.period}）`);
  if (!PROMO_APPLIES_TO.includes(promo.appliesTo)) {
    errors.push(`${where}: promo.appliesTo 必须是 ${PROMO_APPLIES_TO.join(' / ')} 之一（资格限定不得当成全员可享）`);
  }
  if (typeof promo.note !== 'string' || !promo.note.trim()) errors.push(`${where}: promo.note 不能为空（要写清这个价格是什么、对谁）`);
  else if (promo.note.length > LIMITS.note) errors.push(`${where}: promo.note 超过 ${LIMITS.note} 字`);
  return true;
}

function checkProviderOverride(link, deal, where, errors) {
  const resolved = deal ? providersLib.resolveProvider(deal.vendor) : null;
  const mismatch = !resolved || resolved.key !== link.provider;
  const override = link.providerOverride;
  if (!mismatch) {
    if (override !== undefined) {
      errors.push(`${where}: deal.vendor（${deal.vendor}）能被 providers.json 认成 ${link.provider}，不需要 providerOverride —— 多余的 override 会让「为什么特殊」失去意义`);
    }
    return;
  }
  if (typeof override !== 'string' || !override.trim()) {
    errors.push(`${where}: provider 不一致（deal.vendor=${deal ? `「${deal.vendor}」` : '(记录缺失)'} → ${resolved ? resolved.key : '未登记'}，链接声明 ${link.provider}），必须写明 providerOverride 说明理由`);
    return;
  }
  if (override.length > LIMITS.override) errors.push(`${where}: providerOverride 超过 ${LIMITS.override} 字`);
}

/**
 * 校验整份关系表。判据只有这一处：`validate.js`、构建期、自测都调它。
 *
 * @param {object} doc 解析后的源文件
 * @param {{deals?:object[], plans?:object[], providerTable?:object, asOf?:string, strict?:boolean,
 *          dealHistoryStore?:object, planHistoryStore?:object}} [ctx]
 * @returns {{errors:string[], warnings:string[], stats:object, links:object[], retired:object[]}}
 */
function validate(doc, ctx = {}) {
  const errors = [];
  const warnings = [];
  const opts = { asOf: String(ctx.asOf || ''), providerTable: ctx.providerTable || null };
  const links = Array.isArray(doc && doc.links) ? doc.links : [];
  const retired = Array.isArray(doc && doc.retired) ? doc.retired : [];
  const { dealsById, plansById } = mapsOf(ctx);
  const table = ctx.providerTable || providersLib.load().table;

  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    return { errors: ['deal-plan-links.json 必须是一个 JSON 对象'], warnings, stats: emptyStats(), links: [], retired: [] };
  }
  if (doc.schemaVersion !== LINK_SCHEMA_VERSION) {
    errors.push(`schemaVersion 应为 ${LINK_SCHEMA_VERSION}，实际 ${doc.schemaVersion}`);
  }
  for (const key of keyOrderOf(doc)) {
    if (['schemaVersion', 'links', 'retired'].includes(key)) continue;
    errors.push(`顶层未知字段 ${key}（允许：schemaVersion / links / retired / _ 开头的说明键）`);
  }
  if (!Array.isArray(doc.links)) errors.push('links 必须是数组');
  if (!Array.isArray(doc.retired)) errors.push('retired 必须是数组');
  if (links.length + retired.length > LIMITS.recordsTotal) {
    errors.push(`关系条数 ${links.length + retired.length} 超过上限 ${LIMITS.recordsTotal}`);
  }

  // 规范序：打乱人工输入仍必须得到同一份字节
  if (JSON.stringify(links.map(orderKeyOf)) !== JSON.stringify(sortRecords(links).map(orderKeyOf))) {
    errors.push('links 的记录顺序不是规范序（应按 dealId 升序、再按 planIds 升序）');
  }
  if (JSON.stringify(retired.map(orderKeyOf)) !== JSON.stringify(sortRecords(retired).map(orderKeyOf))) {
    errors.push('retired 的记录顺序不是规范序（同 links）');
  }

  const seenLinkKeys = new Map();
  const seenRetiredKeys = new Set();

  links.forEach((link, index) => {
    const where = `links[${index}] ${link && link.dealId ? link.dealId : '(无 dealId)'}`;
    if (!link || typeof link !== 'object' || Array.isArray(link)) {
      errors.push(`${where}: 必须是对象`);
      return;
    }
    pushKeysProblem(link, LINK_KEY_ORDER, where, errors);

    const dealId = String(link.dealId || '');
    if (!ID_RE.test(dealId)) errors.push(`${where}: dealId 必须是 12 位十六进制`);
    if (seenLinkKeys.has(dealId)) errors.push(`${where}: dealId 重复（与 ${seenLinkKeys.get(dealId)} 相同）—— 一条优惠只能有一条关系记录，多个套餐写在 planIds 里`);
    else seenLinkKeys.set(dealId, where);

    if (!Array.isArray(link.planIds) || !link.planIds.length) {
      errors.push(`${where}: planIds 必须是非空数组`);
    } else {
      if (link.planIds.length > LIMITS.planIdsPerLink) errors.push(`${where}: planIds 超过 ${LIMITS.planIdsPerLink} 条`);
      const local = new Set();
      for (const planId of link.planIds) {
        if (!ID_RE.test(String(planId))) errors.push(`${where}: planIds 含非法 id（${planId}）`);
        if (local.has(planId)) errors.push(`${where}: planIds 重复（${planId}）`);
        local.add(planId);
      }
      const canonicalPlanIds = [...link.planIds].sort();
      if (JSON.stringify(link.planIds) !== JSON.stringify(canonicalPlanIds)) {
        errors.push(`${where}: planIds 不是升序 —— 序列化结果必须与输入顺序无关`);
      }
    }

    if (!table[link.provider]) errors.push(`${where}: provider「${link.provider}」不在 providers.json 里`);
    for (const planId of link.planIds || []) {
      const plan = plansById.get(planId);
      if (!plan) {
        errors.push(`${where}: planId ${planId} 在 plans.json / api-plans.json 里都不存在（关系必须指向真实存在的记录）`);
        continue;
      }
      if (plan.provider !== link.provider) {
        errors.push(`${where}: 套餐 ${planId} 的 provider 是 ${plan.provider}，与链接声明的 ${link.provider} 不一致`);
      }
    }

    const deal = dealsById.get(dealId);
    if (!deal) {
      errors.push(`${where}: dealId ${dealId} 在 deals.json 里不存在（优惠被下架后，请把这条整条移进 retired[] 并补快照）`);
    } else {
      checkProviderOverride(link, deal, where, errors);
      const status = dealStatusOf(dealId, ctx);
      if (status.status !== 'current') {
        const advice = `请把这条移进 retired[]（补 title / vendor / endedAt / reason）`;
        if (ctx.strict) errors.push(`${where}: 关联的优惠已结束（${status.reason}）—— ${advice}`);
        else warnings.push(`${where}: 关联的优惠已结束（${status.reason}）；发布前（validate --strict）必须 ${advice}`);
      }
    }

    if (!LINK_BASIS.includes(link.basis)) errors.push(`${where}: basis 非法（${link.basis}），允许 ${LINK_BASIS.join(' / ')}`);
    normalizeEvidenceOf(link, where, opts, errors);
    if (!DATE_RE.test(String(link.confirmedAt || ''))) errors.push(`${where}: confirmedAt 必须是 YYYY-MM-DD`);
    else if (opts.asOf && String(link.confirmedAt) > opts.asOf) errors.push(`${where}: confirmedAt 晚于数据日期 ${opts.asOf}（不能确认未来）`);
    checkPromo(link.promo, where, errors);
  });

  retired.forEach((record, index) => {
    const where = `retired[${index}] ${record && record.dealId ? record.dealId : '(无 dealId)'}`;
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      errors.push(`${where}: 必须是对象`);
      return;
    }
    pushKeysProblem(record, RETIRED_KEY_ORDER, where, errors);
    const dealId = String(record.dealId || '');
    if (!ID_RE.test(dealId)) errors.push(`${where}: dealId 必须是 12 位十六进制`);
    if (!Array.isArray(record.planIds) || !record.planIds.length) errors.push(`${where}: planIds 必须是非空数组`);
    for (const planId of record.planIds || []) {
      if (!ID_RE.test(String(planId))) errors.push(`${where}: planIds 含非法 id（${planId}）`);
    }
    if (!table[record.provider]) errors.push(`${where}: provider「${record.provider}」不在 providers.json 里`);
    for (const planId of record.planIds || []) {
      const plan = plansById.get(planId);
      if (plan && plan.provider !== record.provider) {
        errors.push(`${where}: 套餐 ${planId} 的 provider 是 ${plan.provider}，与退役记录声明的 ${record.provider} 不一致`);
      }
    }
    if (typeof record.title !== 'string' || !record.title.trim()) errors.push(`${where}: 退役记录必须带 title 快照（否则历史就丢了）`);
    else if (record.title.length > LIMITS.snapshot) errors.push(`${where}: title 快照超过 ${LIMITS.snapshot} 字`);
    if (typeof record.vendor !== 'string' || !record.vendor.trim()) errors.push(`${where}: 退役记录必须带 vendor 快照`);
    else if (record.vendor.length > LIMITS.snapshot) errors.push(`${where}: vendor 快照超过 ${LIMITS.snapshot} 字`);
    if (!DATE_RE.test(String(record.endedAt || ''))) errors.push(`${where}: endedAt 必须是 YYYY-MM-DD`);
    if (!RETIRE_REASONS.includes(record.reason)) errors.push(`${where}: reason 非法（${record.reason}），允许 ${RETIRE_REASONS.join(' / ')}`);
    if (!LINK_BASIS.includes(record.basis)) errors.push(`${where}: basis 非法（${record.basis}）`);
    normalizeEvidenceOf(record, where, opts, errors);
    if (!DATE_RE.test(String(record.confirmedAt || ''))) errors.push(`${where}: confirmedAt 必须是 YYYY-MM-DD`);
    checkPromo(record.promo, where, errors);

    const key = orderKeyOf(record);
    if (seenRetiredKeys.has(key)) errors.push(`${where}: 退役记录重复`);
    seenRetiredKeys.add(key);
    if (seenLinkKeys.has(dealId)) {
      errors.push(`${where}: 与 links[${seenLinkKeys.get(dealId)}] 指向同一条优惠 —— 同一个 dealId 不能同时在 links 与 retired 里`);
    }
  });

  const editorial = links.concat(retired).filter(record => record && record.basis === 'editorial-confirmed').length;
  if (editorial) warnings.push(`有 ${editorial} 条关系靠人工判断（basis=editorial-confirmed）——它们必须带官方出处`);

  const view = planDealsView(doc, ctx);
  const stats = {
    links: links.length,
    retired: retired.length,
    plans: view.counts.plans,
    plansWithCurrent: view.counts.withCurrent,
    currentRows: view.counts.current,
    historyRows: view.counts.history,
    plansWithoutAnyDeal: view.counts.plansWithoutAnyDeal,
    editorial,
    asOf: opts.asOf || null
  };
  return { errors, warnings, stats, links, retired };
}

function emptyStats() {
  return {
    links: 0, retired: 0, plans: 0, plansWithCurrent: 0,
    currentRows: 0, historyRows: 0, plansWithoutAnyDeal: 0, editorial: 0, asOf: null
  };
}

/* ------------------------------------------------------------------ */
/* 候选（只供人工 review，绝不写生产关系）                               */
/* ------------------------------------------------------------------ */

/**
 * 确定性的候选提案：三条判据都**只做精确/子串比较**，没有 AI、没有网络、没有随机。
 * 输出永远只是「建议」——写生产关系的路径不存在于任何代码里（自测有断言钉住这一点）。
 *
 * 判据：
 *   vendor-alias   deal.vendor 能被 providers.json 的精确别名表认成该 provider
 *   url-host       deal.url 的 host 与套餐官方页的 host 相同
 *   title-mention  优惠标题里出现套餐名（≥4 字，大小写/全半角归一后的子串）
 */
function candidatesOf(deals, plans, { providerTable = null } = {}) {
  const table = providerTable || providersLib.load().table;
  const out = [];
  for (const deal of deals || []) {
    if (!deal || !deal.id) continue;
    const resolved = providersLib.resolveProvider(deal.vendor, table);
    for (const plan of plans || []) {
      if (!plan || !plan.id) continue;
      const rules = [];
      if (resolved && resolved.key === plan.provider) rules.push('vendor-alias');
      const dealHost = provenance.hostOf(String(deal.url || ''));
      const planHost = provenance.hostOf(String(plan.officialUrl || ''));
      if (dealHost && planHost && dealHost === planHost) rules.push('url-host');
      const planName = String(plan.planName || '').normalize('NFKC').toLowerCase().trim();
      const title = String(deal.title || '').normalize('NFKC').toLowerCase();
      if (planName.length >= 4 && title.includes(planName)) rules.push('title-mention');
      if (!rules.length) continue;
      const confidence = rules.length >= 2 ? 'high' : (rules.includes('vendor-alias') ? 'medium' : 'low');
      out.push({
        dealId: deal.id,
        planId: plan.id,
        dealTitle: deal.title,
        planTitle: `${plansPage.providerNameOf(plan.provider, table)} ${plan.planName}`,
        provider: plan.provider,
        rules,
        confidence
      });
    }
  }
  return out.sort((a, b) => {
    if (a.dealId !== b.dealId) return a.dealId < b.dealId ? -1 : 1;
    return a.planId < b.planId ? -1 : a.planId > b.planId ? 1 : 0;
  });
}

module.exports = {
  LINKS_FILE,
  LINK_SCHEMA_VERSION,
  LINK_BASIS,
  PROMO_APPLIES_TO,
  RETIRE_REASONS,
  LIMITS,
  LINK_KEY_ORDER,
  RETIRED_KEY_ORDER,
  RELATION_EVIDENCE_FIELD,
  DERIVED_KEYS,
  RELATED_PLAN_FIELDS,
  UNKNOWN_TEXT,
  PERIOD_SUFFIX,
  truncateText,
  asOfOf,
  relatedPlansOf,
  canonicalUpdatedAt,
  orderKeyOf,
  sortRecords,
  load,
  publishedDoc,
  dealStatusOf,
  planStatusOf,
  isCurrentRelation,
  savingsOf,
  savingsTextOf,
  promoPriceTextOf,
  planTextsOf,
  promoLineOf,
  rowsOfLink,
  dealView,
  planDealsView,
  validate,
  candidatesOf,
  clone
};
