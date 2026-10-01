/**
 * plans.json v1 数据契约：枚举、构造、归一、校验、派生指标、可重建性。
 *
 * ## 这一层要回答什么
 *
 * Deals 回答「现在有什么优惠」，Plans 回答「长期使用时，各平台提供什么套餐」。
 * 两者**语义分离**：plans.json 不写进 deals.json，字段不互相注入，判据也各自独立
 * （deals 的可重建性门禁是 `check-reproducible.js`，plans 的是 `check-plans-reproducible.js`）。
 *
 * ## 三条纪律（与仓库既有的诚实性红线同源，见 docs/DESIGN-RULES.md §8）
 *
 * 1. **原始事实与派生指标分离**。人工来源层 `curated_plans.json` 只写事实：价格、额度、
 *    模型、限制、官方引文。`id` 与 `derivedMetrics` 一律由本模块**算**出来 ——
 *    它们出现在人工文件里就是错误（"写了却被丢掉"与"没写"必须在日志里长得不一样）。
 * 2. **不猜**。原价未知就写 `null`（不是 0）；额度没有固定数值就用 `rate_limited` /
 *    `other` 并把口径写进 `description`（不是编一个 token 数）；查过但来源没说明的三态
 *    位置就写 `"unknown"` 并留下 note（不是 `false`）。
 * 3. **不为了可比性扭曲官方计费方式**。平台上卖的是积分、限速、用量池，就照原样记；
 *    「名义 Token 单价」只在五个条件同时成立时才产出，否则一律 `null`。
 *
 * ## 校验的做法：把归一器再跑一遍
 *
 * `validatePlan()` 不重抄一遍规则，而是用 `makePlan(plan, { fromRecord: true })`
 * 把盘上那条记录**重新归一一次**，再逐字段比对（与 v1.3 的 `validateEvidence()` 同一手法）。
 * 好处是「什么算合法」只有一份实现：手改 `id`、手算 `derivedMetrics`、枚举拼错、
 * 文本里多了个空格，全部表现为「与归一结果不一致」，而且错误信息能指名道姓到字段。
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { REGIONS, cleanText, normalizeDate, normalizeUrl, todayCN } = require('./schema');
const provenance = require('./provenance');
const providers = require('./providers');

const PLANS_FILE = path.join(__dirname, '..', '..', 'plans.json');
const CURATED_PLANS_FILE = path.join(__dirname, '..', 'data', 'curated_plans.json');

const PLAN_SCHEMA_VERSION = 1;

/* ------------------------------------------------------------------ */
/* 枚举（都集中在这里；渲染层与测试都用这些常量，不许各写一份）          */
/* ------------------------------------------------------------------ */

/** 套餐种类。当前只有 coding；Phase 2.5 的 API plan 会在这里加值（id 也含 kind，所以不会撞） */
const PLAN_KINDS = ['coding'];

/** 计费周期：你多久被收一次钱 */
const BILLING_PERIODS = ['monthly', 'yearly', 'one_time', 'usage_based', 'other'];

/** 币种白名单：只做"能合法处理"，**本阶段没有任何汇率**，跨币种不比较 */
const CURRENCIES = ['CNY', 'USD', 'HKD', 'EUR', 'JPY', 'GBP', 'SGD'];

/** 额度类型。刻意不用一个统一的 token 数把它们抹平 */
const QUOTA_TYPES = [
  'tokens', 'credits', 'requests', 'messages',
  'rate_limited', 'unlimited_fair_use', 'compute_units', 'other'
];

/** 有固定数值的额度类型：必须给出正数 amount */
const QUANTIFIED_QUOTA_TYPES = ['tokens', 'credits', 'requests', 'messages', 'compute_units'];

/** 没有固定数值的额度类型：amount 必须是 null（限速/公平使用不得伪装成固定额度） */
const AMOUNTLESS_QUOTA_TYPES = ['rate_limited', 'unlimited_fair_use'];

/** 语义全在文字里的额度类型：必须写 description */
const QUOTA_DESCRIPTION_REQUIRED = ['rate_limited', 'unlimited_fair_use', 'other'];

/** 额度重置周期：与 billing.period 是**两件事**（计费周期 vs 额度刷新周期），二者同名但不同义 */
const QUOTA_PERIODS = ['monthly', 'yearly', 'weekly', 'daily', 'hourly', 'rolling', 'one_time', 'other'];

/** 模型在套餐里的角色：可用 / 可用但受限 / 动态池 / 模型族 */
const MODEL_ROLES = ['included', 'limited', 'pool', 'family'];

/**
 * 限制条件的种类，**顺序即序列化顺序**（数组按这个顺序排序，与输入顺序无关）。
 * 值类型决定 value 怎么校验；三态的种类复用仓库既有的 `true / false / "unknown"` 约定。
 */
const RESTRICTION_KINDS = [
  'concurrency', 'rate_limit', 'per_day_cap', 'rolling_window', 'output_limit',
  'fair_use', 'region_restriction', 'account_required', 'invite_only', 'new_user_only'
];

const RESTRICTION_VALUE_TYPE = {
  concurrency: 'number',
  rate_limit: 'text',
  per_day_cap: 'number',
  rolling_window: 'text',
  output_limit: 'text',
  fair_use: 'boolean',
  region_restriction: 'text',
  account_required: 'boolean',
  invite_only: 'boolean',
  new_user_only: 'boolean'
};

/**
 * 来源类型。**登记制**：未登记一律硬红。第三方套餐对比站不在表里 ——
 * 它们只能用来发现候选（题面 §十二），不能作为生产事实来源。
 */
const PLAN_SOURCE_TYPES = {
  'Official-Pricing': 'official',
  'Official-Docs': 'official',
  'Official-Announcement': 'official'
};

/** 引文可以绑定的字段（plans 版）。顺序即引文排序序。 */
const PLANS_EVIDENCE_FIELDS = [
  'provider', 'planName', 'billing.period', 'billing.regularPrice', 'billing.promoPrice',
  'quota.type', 'quota.amount', 'quota.period', 'quota.description',
  'supportedModels', 'restrictions'
];

/** 记录的字段（顺序即 JSON 序列化顺序，改动会让全库 diff 漂移） */
const RECORD_FIELDS = [
  'id', 'kind', 'provider', 'planName', 'officialUrl', 'source', 'sourceUrl', 'region',
  'billing', 'quota', 'supportedModels', 'restrictions',
  'firstSeen', 'lastSeen', 'verified', 'verifiedAt', 'evidence', 'derivedMetrics'
];

/** 人工来源层允许出现的字段 = 记录字段去掉两个派生字段 */
const INPUT_FIELDS = RECORD_FIELDS.filter(field => field !== 'id' && field !== 'derivedMetrics');

/** 派生字段：出现在人工来源层就是错误 */
const DERIVED_FIELDS = ['id', 'derivedMetrics'];

/* ------------------------------ 上限 ------------------------------ */

const MAX_PLANS = 200;
const MAX_PLAN_NAME = 80;
const MAX_NOTE = 200;
const MAX_QUOTA_DESCRIPTION = 200;
const MAX_MODELS = 24;
const MAX_MODEL_NAME = 60;
const MAX_MODEL_NOTE = 120;
const MAX_RESTRICTIONS = 12;
const MAX_RESTRICTION_NOTE = 120;
const MAX_RESTRICTION_TEXT = 60;
const MAX_RESTRICTION_NUMBER = 1000000;
const MAX_PRICE = 1000000;
const MAX_QUOTA_AMOUNT = 1e15;

/** 名义 Token 单价的口径：每 1 亿 tokens */
const UNIT_PER = 1e8;
const METRIC_DECIMALS = 6;
/** 只有这两种计费周期能算出可比较的单价（不做 12 个月的隐含换算） */
const COMPARABLE_BILLING_PERIODS = ['monthly', 'yearly'];

/**
 * 口径文案的唯一出处。**刻意不写进数据里**：每条记录重复同一句话只会让文件变噪，
 * 而这句话是页面/文档要显示的东西（Phase 2.2 直接引用这个常量）。
 */
const PLAN_WORDING = {
  nominalUnitPriceNote: '名义 Token 单价只根据套餐标称额度折算，用于粗略比较，不代表不同模型 Token 的实际价值相同。',
  priceUnknown: '官方页面未标注该项，留空（不是 0）',
  quotaUnknown: '官方未公布固定额度数值'
};

/* ------------------------------------------------------------------ */
/* 名称与身份                                                          */
/* ------------------------------------------------------------------ */

/**
 * planName 的规范形态：NFKC → 折叠空白 → 去首尾空白。**不截断**（超长报错而不是切掉）。
 * 显示名可以改，但改了就换 id —— 所以它同时是身份的一部分，必须稳定。
 */
function normalizePlanName(value) {
  return String(value === null || value === undefined ? '' : value)
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 进 id 的小写键（大小写差异不算两个套餐） */
function planNameKeyOf(planName) {
  return normalizePlanName(planName).toLowerCase();
}

/**
 * 稳定 id：`sha1(kind|provider|planNameKey|billing.period)` 前 12 位（与 deals 的 id 同长度，
 * 复用同一套 `/^[0-9a-f]{12}$/` 纪律）。
 *
 * 为什么价格、额度、日期、URL 都**不进** basis：同一套餐改价/改额度/换官方页必须保持同一个
 * 身份（题面 §十）。为什么 period **进** basis：月付与年付是两个可售 SKU，价格不可直接比较，
 * 本就该是两条记录；代价是"同一套餐从月付改年付"会被看成两个身份，这条已知限制写在
 * docs/SCHEMA-v2.1.md 里，Phase 2.3 做变化追踪时必须显式处理。
 */
function makePlanId({ kind, provider, planName, period }) {
  const basis = `${kind}|${provider}|${planNameKeyOf(planName)}|${period}`;
  return crypto.createHash('sha1').update(basis).digest('hex').slice(0, 12);
}

/** 数据集内的身份键：重复即数据错误（同 provider + 同 planName + 同 period） */
function identityKeyOf(plan) {
  return `${plan.kind}|${plan.provider}|${planNameKeyOf(plan.planName)}|${plan.billing ? plan.billing.period : ''}`;
}

/* ------------------------------------------------------------------ */
/* 派生指标                                                            */
/* ------------------------------------------------------------------ */

/**
 * 名义 Token 单价 + **算不出来的原因**。
 *
 * 五个条件缺一不可（题面 §八）：quota 是 tokens 且数额明确 · 计费周期可比较 ·
 * 额度周期与计费周期一致 · 币种可处理 · 当前使用价格明确。另外补一条：额度随模型倍率
 * 变化的（`conversionDependsOnModel`）不能算 —— 那正是"伪装成固定 Token"的入口。
 *
 * @returns {{metric: object|null, reason: string|null}}
 */
function deriveMetricsWithReason(plan) {
  const quota = (plan && plan.quota) || {};
  const billing = (plan && plan.billing) || {};

  if (quota.type !== 'tokens') {
    return { metric: null, reason: `quota.type=${quota.type || '(空)'} 不是 tokens —— 不换算成 Token 单价` };
  }
  if (!Number.isFinite(quota.amount) || quota.amount <= 0) {
    return { metric: null, reason: 'tokens 额度数值不明确' };
  }
  if (!quota.period) {
    return { metric: null, reason: 'tokens 额度没有标注刷新周期' };
  }
  if (quota.period !== billing.period) {
    return { metric: null, reason: `额度周期(${quota.period})与计费周期(${billing.period || '(空)'})不一致` };
  }
  if (!COMPARABLE_BILLING_PERIODS.includes(billing.period)) {
    return { metric: null, reason: `计费周期 ${billing.period} 不可比较（只支持 ${COMPARABLE_BILLING_PERIODS.join(' / ')}）` };
  }
  if (!CURRENCIES.includes(billing.currency)) {
    return { metric: null, reason: '币种不可处理' };
  }
  if (quota.conversionDependsOnModel === true) {
    return { metric: null, reason: '额度折算随模型倍率变化（credits 语义），不得当作固定 Token' };
  }

  // "当前使用价格"：有活动价就用活动价（并记录用的是哪一个），否则用原价
  const hasPromo = billing.promoPrice !== null && billing.promoPrice !== undefined;
  const currentPrice = hasPromo ? billing.promoPrice : billing.regularPrice;
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
    return { metric: null, reason: '当前使用价格不明确' };
  }

  const price = Number((currentPrice / quota.amount * UNIT_PER).toFixed(METRIC_DECIMALS));
  return {
    metric: {
      price,
      currency: billing.currency,
      per: UNIT_PER,
      basis: billing.period,
      priceField: hasPromo ? 'promoPrice' : 'regularPrice'
    },
    reason: null
  };
}

/** 只要结果（校验与构造都用它；错误信息用 deriveMetricsWithReason） */
function deriveMetrics(plan) {
  return deriveMetricsWithReason(plan).metric;
}

/** derivedMetrics 的规范形态（永远存在；不可比较时值为 null，而不是省略键） */
function derivedMetricsOf(plan) {
  return { nominalUnitPrice: deriveMetrics(plan) };
}

/* ------------------------------------------------------------------ */
/* 字段归一（严格：任何被改写的输入都报错，而不是静默清洗）              */
/* ------------------------------------------------------------------ */

/** 清洗文本；超长/非规范形态**报错**而不是截断（截断过的字看起来与原文一样，最坏） */
function strictText(value, field, max, problems, { required = false } = {}) {
  if (value === null || value === undefined) {
    if (required) problems.push(`${field} 缺失`);
    return null;
  }
  if (typeof value !== 'string') {
    problems.push(`${field} 必须是字符串`);
    return null;
  }
  const cleaned = cleanText(value, max);
  if (!cleaned) {
    problems.push(`${field} 为空（没有内容时应省略该字段，而不是写空串）`);
    return null;
  }
  if (cleaned !== value) {
    problems.push(`${field} 不是规范形态：清洗后是「${cleaned}」（原值 ${value.length} 字，上限 ${max}）`);
    return null;
  }
  return cleaned;
}

function strictUrl(value, field, problems, { required = false } = {}) {
  if (value === null || value === undefined) {
    if (required) problems.push(`${field} 缺失`);
    return null;
  }
  const url = normalizeUrl(value);
  if (!url) {
    problems.push(`${field} 必须是 http(s) 链接`);
    return null;
  }
  if (url !== value) {
    problems.push(`${field} 不是规范形态（去掉追踪参数后是「${url}」）—— 请直接写规范 URL`);
    return null;
  }
  if (provenance.isAggregatorUrl(url)) {
    problems.push(`${field} 指向聚合站（${provenance.hostOf(url)}）—— 官方来源不能是聚合站`);
    return null;
  }
  return url;
}

function numberOrNull(value, field, problems, { min = 0, max = MAX_QUOTA_AMOUNT, exclusiveMin = false } = {}) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    problems.push(`${field} 必须是有限数字或 null`);
    return null;
  }
  if (exclusiveMin ? value <= min : value < min) {
    problems.push(`${field} 必须${exclusiveMin ? '大于' : '不小于'} ${min}（得到 ${value}）`);
    return null;
  }
  if (value > max) {
    problems.push(`${field} 超过上限 ${max}`);
    return null;
  }
  return value;
}

function normalizeBilling(value, problems) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    problems.push('billing 缺失或不是对象');
    return null;
  }
  const period = BILLING_PERIODS.includes(value.period) ? value.period : null;
  if (!period) problems.push(`billing.period 非法(${value.period})：只接受 ${BILLING_PERIODS.join(' / ')}`);

  const currency = CURRENCIES.includes(value.currency) ? value.currency : null;
  if (value.currency !== null && value.currency !== undefined && !currency) {
    problems.push(`billing.currency 非法(${value.currency})：只接受 ${CURRENCIES.join(' / ')}`);
  }

  const regularPrice = numberOrNull(value.regularPrice, 'billing.regularPrice', problems, { min: 0, max: MAX_PRICE });
  const promoPrice = numberOrNull(value.promoPrice, 'billing.promoPrice', problems, { min: 0, max: MAX_PRICE, exclusiveMin: true });
  const promoNote = strictText(value.promoNote, 'billing.promoNote', MAX_NOTE, problems);
  const note = strictText(value.note, 'billing.note', MAX_NOTE, problems);

  // 币种：有金额就必须有；一个金额都没有时必须是 null（没有金额就没有币种）
  if (regularPrice === null && promoPrice === null) {
    if (currency) problems.push('billing：没有记录任何价格时 currency 必须是 null');
  } else if (!currency) {
    problems.push('billing：记录了价格却没有合法 currency');
  }

  // 活动价与原价的关系。这条同时挡住两种错误：
  //   · 原价未知却填 0（0 ≤ 活动价 ⇒ 矛盾）——"原价未知"只有 null 一种诚实写法；
  //   · 活动价高于原价。
  // 只有活动价、原价确实不知道时，regularPrice 写 null 是**合法**的（题面 §三）。
  if (regularPrice !== null && promoPrice !== null && regularPrice <= promoPrice) {
    problems.push(`billing：regularPrice(${regularPrice}) 必须大于 promoPrice(${promoPrice})；原价未知请写 null，不要用 0 占位`);
  }

  return { period, currency, regularPrice, promoPrice, promoNote, note };
}

function normalizeQuota(value, problems) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    problems.push('quota 缺失或不是对象');
    return null;
  }
  const type = QUOTA_TYPES.includes(value.type) ? value.type : null;
  if (!type) problems.push(`quota.type 非法(${value.type})：只接受 ${QUOTA_TYPES.join(' / ')}`);

  const amount = numberOrNull(value.amount, 'quota.amount', problems, { min: 0, max: MAX_QUOTA_AMOUNT, exclusiveMin: true });
  if (type && QUANTIFIED_QUOTA_TYPES.includes(type) && amount === null) {
    problems.push(`quota：type=${type} 必须给出正数 amount`);
  }
  if (type && AMOUNTLESS_QUOTA_TYPES.includes(type) && amount !== null) {
    problems.push(`quota：type=${type} 不允许 amount（限速/公平使用没有固定额度，不得伪装成固定数值）`);
  }

  const period = value.period === null || value.period === undefined
    ? null
    : (QUOTA_PERIODS.includes(value.period) ? value.period : null);
  if (value.period !== null && value.period !== undefined && !period) {
    problems.push(`quota.period 非法(${value.period})：只接受 ${QUOTA_PERIODS.join(' / ')}`);
  }

  const description = strictText(value.description, 'quota.description', MAX_QUOTA_DESCRIPTION, problems);
  if (type && QUOTA_DESCRIPTION_REQUIRED.includes(type) && !description) {
    problems.push(`quota：type=${type} 必须用 description 写明口径（例如「每 5 小时刷新」）`);
  }

  let conversionDependsOnModel = null;
  const rawConversion = value.conversionDependsOnModel;
  if (rawConversion !== null && rawConversion !== undefined) {
    if (typeof rawConversion !== 'boolean') {
      problems.push('quota.conversionDependsOnModel 必须是布尔或 null');
    } else if (type === 'credits' || type === 'other') {
      conversionDependsOnModel = rawConversion;
    } else {
      problems.push(`quota.conversionDependsOnModel 只允许出现在 credits / other 上（type=${type}）—— 额度随模型倍率变化时应当记成 credits，不能伪装成固定 Token`);
    }
  }
  if (type === 'credits' && conversionDependsOnModel === null) {
    problems.push('quota：type=credits 必须明确 conversionDependsOnModel（true = 折算随模型倍率变化）');
  }

  return { type, amount, period, description, conversionDependsOnModel };
}

function normalizeModels(value, problems) {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value)) {
    problems.push('supportedModels 必须是数组或 null（空数组不是"没有"）');
    return null;
  }
  if (!value.length) {
    problems.push('supportedModels 是空数组（没有模型信息时应写 null）');
    return null;
  }
  if (value.length > MAX_MODELS) {
    problems.push(`supportedModels 超过 ${MAX_MODELS} 条`);
    return null;
  }

  const seen = new Set();
  const out = [];
  value.forEach((item, index) => {
    const where = `supportedModels[${index}]`;
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      problems.push(`${where} 必须是对象`);
      return;
    }
    // 刻意不用 isGarbage()：它对 <3 字符一律判垃圾，会误杀「o3」「Go」这类合法模型名
    const name = strictText(item.name, `${where}.name`, MAX_MODEL_NAME, problems, { required: true });
    if (!name) return;
    const key = name.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
    if (seen.has(key)) {
      problems.push(`${where}: 模型「${name}」重复`);
      return;
    }
    seen.add(key);

    let role = 'included';
    if (item.role !== null && item.role !== undefined) {
      if (!MODEL_ROLES.includes(item.role)) {
        problems.push(`${where}.role 非法(${item.role})：只接受 ${MODEL_ROLES.join(' / ')}`);
        return;
      }
      role = item.role;
    }
    const note = strictText(item.note, `${where}.note`, MAX_MODEL_NOTE, problems);
    out.push({ name, role, note });
  });

  if (!out.length) return null;
  const roleOrder = item => MODEL_ROLES.indexOf(item.role);
  return out.sort((a, b) => {
    const diff = roleOrder(a) - roleOrder(b);
    if (diff !== 0) return diff;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
}

function normalizeRestrictions(value, problems) {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value)) {
    problems.push('restrictions 必须是数组或 null（空数组不是"没有"）');
    return null;
  }
  if (!value.length) {
    problems.push('restrictions 是空数组（没有已知限制时应写 null）');
    return null;
  }
  if (value.length > MAX_RESTRICTIONS) {
    problems.push(`restrictions 超过 ${MAX_RESTRICTIONS} 条`);
    return null;
  }

  const seen = new Set();
  const out = [];
  value.forEach((item, index) => {
    const where = `restrictions[${index}]`;
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      problems.push(`${where} 必须是对象`);
      return;
    }
    if (!RESTRICTION_KINDS.includes(item.kind)) {
      problems.push(`${where}.kind 非法(${item.kind})：只接受 ${RESTRICTION_KINDS.join(' / ')}`);
      return;
    }
    const kind = item.kind;
    if (seen.has(kind)) {
      problems.push(`${where}: kind=${kind} 重复（同一维度只写一条）`);
      return;
    }
    seen.add(kind);

    const note = strictText(item.note, `${where}.note`, MAX_RESTRICTION_NOTE, problems);
    const rawValue = item.value;
    let value_ = null;

    // 三态：true / false / "unknown" 三个**字面量**，0 / 1 / "true" 一律不接受。
    // "unknown" 的意思是「查过、来源没说明」，与"没写这条限制"不是一回事，
    // 所以它必须带 note 说明依据（沿用仓库「inferred 必须带 note」的既有纪律）。
    if (rawValue === undefined) {
      problems.push(`${where}.value 缺失（三态至少要明确写出 true / false / "unknown"）`);
      return;
    }
    if (rawValue === 'unknown') {
      if (!note) problems.push(`${where}: value="unknown" 时必须用 note 说明「查过但来源没说明」的依据`);
      value_ = 'unknown';
    } else if (RESTRICTION_VALUE_TYPE[kind] === 'boolean') {
      if (typeof rawValue !== 'boolean') {
        problems.push(`${where}(kind=${kind}).value 必须是 true / false / "unknown"（得到 ${JSON.stringify(rawValue)}）`);
        return;
      }
      value_ = rawValue;
    } else if (RESTRICTION_VALUE_TYPE[kind] === 'number') {
      if (typeof rawValue !== 'number' || !Number.isFinite(rawValue) || rawValue <= 0 || rawValue > MAX_RESTRICTION_NUMBER) {
        problems.push(`${where}(kind=${kind}).value 必须是正数或 "unknown"（得到 ${JSON.stringify(rawValue)}）`);
        return;
      }
      value_ = rawValue;
    } else {
      const text = strictText(rawValue, `${where}.value`, MAX_RESTRICTION_TEXT, problems, { required: true });
      if (!text) return;
      value_ = text;
    }

    out.push({ kind, value: value_, note });
  });

  if (!out.length) return null;
  return out.sort((a, b) => RESTRICTION_KINDS.indexOf(a.kind) - RESTRICTION_KINDS.indexOf(b.kind));
}

/** 日期关系（构造期与校验期都调它，判据只有一处） */
function dateProblems({ firstSeen, lastSeen, verifiedAt, today }) {
  const problems = [];
  if (firstSeen && lastSeen && firstSeen > lastSeen) {
    problems.push(`firstSeen(${firstSeen}) 不得晚于 lastSeen(${lastSeen})`);
  }
  if (verifiedAt && lastSeen && verifiedAt > lastSeen) {
    problems.push(`verifiedAt(${verifiedAt}) 不得晚于 lastSeen(${lastSeen})`);
  }
  if (today) {
    for (const [field, value] of [['firstSeen', firstSeen], ['lastSeen', lastSeen], ['verifiedAt', verifiedAt]]) {
      if (value && value > today) problems.push(`${field} 是未来日期(${value})`);
    }
  }
  return problems;
}

/* ------------------------------------------------------------------ */
/* 构造                                                               */
/* ------------------------------------------------------------------ */

/**
 * 构造一条合规记录。
 *
 * @param {object} raw 人工来源层的条目，或（fromRecord 时）盘上的记录
 * @param {object} opts { providers?, today?, fromRecord? }
 * @returns {{ok:boolean, plan:object|null, problems:string[]}}
 */
function makePlan(raw = {}, opts = {}) {
  const problems = [];
  const fromRecord = opts.fromRecord === true;
  const table = opts.providers || null;
  const today = opts.today || todayCN();

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, plan: null, problems: ['记录不是对象'] };
  }

  const allowed = fromRecord ? RECORD_FIELDS : INPUT_FIELDS;
  for (const key of Object.keys(raw)) {
    if (!allowed.includes(key)) problems.push(`未知字段 ${key}`);
  }
  if (!fromRecord) {
    for (const key of DERIVED_FIELDS) {
      if (raw[key] !== undefined) {
        problems.push(`${key} 是派生字段，不能写在人工来源层（由 makePlan 算出来）`);
      }
    }
  }

  const providerRaw = raw.provider;
  const resolved = providers.resolveProvider(providerRaw, table);
  if (!resolved) {
    problems.push(providerRaw
      ? `provider「${providerRaw}」未在 providers.json 登记（建议 key：${providers.suggestProviderSlug(providerRaw)}）`
      : 'provider 缺失');
  }
  const provider = resolved ? resolved.key : normalizePlanName(providerRaw);

  const kind = raw.kind === null || raw.kind === undefined ? 'coding' : raw.kind;
  if (!PLAN_KINDS.includes(kind)) problems.push(`kind 非法(${kind})：只接受 ${PLAN_KINDS.join(' / ')}`);

  const planName = normalizePlanName(raw.planName);
  if (!planName) problems.push('planName 缺失或为空');
  else if (planName.length > MAX_PLAN_NAME) {
    problems.push(`planName 超过 ${MAX_PLAN_NAME} 字（${planName.length} 字）—— 不静默截断，请人工缩短`);
  } else if (planName !== raw.planName) {
    problems.push(`planName 不是规范形态（NFKC/折叠空白/去首尾空白后是「${planName}」，原文 ${raw.planName.length} 字）`);
  }

  const officialUrl = strictUrl(raw.officialUrl, 'officialUrl', problems, { required: true });
  const sourceUrl = raw.sourceUrl === null || raw.sourceUrl === undefined
    ? officialUrl
    : strictUrl(raw.sourceUrl, 'sourceUrl', problems, { required: true });

  const source = PLAN_SOURCE_TYPES[raw.source] ? raw.source : null;
  if (!source) {
    problems.push(`source 非法(${raw.source})：只接受 ${Object.keys(PLAN_SOURCE_TYPES).join(' / ')}（第三方对比站不得作为生产事实来源）`);
  }

  const region = REGIONS.includes(raw.region) ? raw.region : null;
  if (!region) problems.push(`region 非法(${raw.region})：只接受 ${REGIONS.join(' / ')}`);

  const billing = normalizeBilling(raw.billing, problems);
  const quota = normalizeQuota(raw.quota, problems);
  const supportedModels = normalizeModels(raw.supportedModels, problems);
  const restrictions = normalizeRestrictions(raw.restrictions, problems);

  const firstSeen = normalizeDate(raw.firstSeen);
  const lastSeen = normalizeDate(raw.lastSeen);
  const verifiedAt = normalizeDate(raw.verifiedAt);
  if (!firstSeen) problems.push('firstSeen 缺失或非法（必须带 4 位年份，规范形态 YYYY-MM-DD）');
  if (!lastSeen) problems.push('lastSeen 缺失或非法（同上）');
  if (!verifiedAt) problems.push('verifiedAt 缺失或非法（同上）');
  if (raw.verified !== true) {
    problems.push('verified 必须是 true —— plans 的每一条都是人工对照官方页核过的；没核过就不该收进来');
  }
  problems.push(...dateProblems({ firstSeen, lastSeen, verifiedAt, today }));

  const evidence = provenance.normalizeEvidence(raw.evidence, { today, fields: PLANS_EVIDENCE_FIELDS });
  if (!evidence) {
    problems.push('evidence 缺失：每条 plan 至少要有一条来自官方页的原文引文');
  }

  if (problems.length) return { ok: false, plan: null, problems };

  const plan = {
    id: makePlanId({ kind, provider, planName, period: billing.period }),
    kind,
    provider,
    planName,
    officialUrl,
    source,
    sourceUrl,
    region,
    billing,
    quota,
    supportedModels,
    restrictions,
    firstSeen,
    lastSeen,
    verified: true,
    verifiedAt,
    evidence,
    derivedMetrics: null
  };
  plan.derivedMetrics = derivedMetricsOf(plan);
  return { ok: true, plan, problems: [] };
}

/* ------------------------------------------------------------------ */
/* 校验                                                               */
/* ------------------------------------------------------------------ */

/** 逐字段差异（含嵌套对象的键序差异 —— 契约里键序就是序列化序） */
function planDiffs(stored, rebuilt) {
  const diffs = [];
  const keys = new Set([...Object.keys(stored || {}), ...Object.keys(rebuilt || {})]);
  for (const key of keys) {
    const a = stored ? stored[key] : undefined;
    const b = rebuilt ? rebuilt[key] : undefined;
    const sa = JSON.stringify(a === undefined ? null : a);
    const sb = JSON.stringify(b === undefined ? null : b);
    if (sa !== sb) diffs.push({ field: key, stored: sa, canonical: sb });
  }
  return diffs;
}

/**
 * 校验单条记录。判据 = 「把归一器再跑一遍」+ 少数归一器表达不了的东西（id 形状）。
 *
 * @returns {{ok:boolean, errors:string[]}}
 */
function validatePlan(plan, index = 0) {
  const errors = [];
  const where = `#${index} ${plan && plan.planName ? plan.planName : '(no planName)'}`;

  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
    return { ok: false, errors: [`${where}: 不是对象`] };
  }
  if (!/^[0-9a-f]{12}$/.test(String(plan.id || ''))) errors.push(`${where}: id 非法`);

  const result = makePlan(plan, { fromRecord: true, today: todayCN() });
  result.problems.forEach(problem => errors.push(`${where}: ${problem}`));

  if (result.ok) {
    const diffs = planDiffs(plan, result.plan);
    diffs.slice(0, 6).forEach(diff => {
      errors.push(`${where}: 字段 ${diff.field} 与归一结果不一致（盘上 ${clip(diff.stored)}，规范 ${clip(diff.canonical)}）`
        + (diff.field === 'derivedMetrics' ? ' —— 派生指标只能由 deriveMetrics() 算出来' : '')
        + (diff.field === 'id' ? ' —— id 只能由 makePlanId() 算出来（同套餐改价不得换 id）' : ''));
    });
    if (diffs.length > 6) errors.push(`${where}: 另有 ${diffs.length - 6} 处与归一结果不一致`);
  }

  return { ok: errors.length === 0, errors };
}

function clip(text) {
  const value = String(text);
  return value.length > 60 ? `${value.slice(0, 57)}…` : value;
}

/** 数据集级校验：顶层形状、id 与身份唯一、规范排序、provider 表与 slug 一致性 */
function validatePlansStore(store, { providerTable = null, vendorSlugs = null } = {}) {
  const errors = [];
  const table = providerTable || providers.load().table;
  const slugs = vendorSlugs || providers.loadVendorSlugs();

  if (!store || typeof store !== 'object' || Array.isArray(store)) {
    return { ok: false, errors: ['plans.json 必须是一个对象'], plans: [] };
  }
  if (store.schemaVersion !== PLAN_SCHEMA_VERSION) {
    errors.push(`plans.json schemaVersion 应为 ${PLAN_SCHEMA_VERSION}，实际 ${store.schemaVersion}`);
  }
  if (!Array.isArray(store.plans)) {
    return { ok: false, errors: [...errors, 'plans.json plans 必须是数组'], plans: [] };
  }
  if (typeof store.count !== 'number') errors.push('plans.json count 缺失');
  else if (store.count !== store.plans.length) {
    errors.push(`plans.json count(${store.count}) 与 plans 长度(${store.plans.length}) 不一致`);
  }
  if (store.plans.length > MAX_PLANS) errors.push(`plans.json 条数 ${store.plans.length} 超过上限 ${MAX_PLANS}`);

  const expectedUpdatedAt = canonicalUpdatedAt(store.plans);
  if (store.updatedAt !== expectedUpdatedAt) {
    errors.push(`plans.json updatedAt 应为「${expectedUpdatedAt}」（= 全部 lastSeen 的最大值，不读墙上时钟），实际「${store.updatedAt}」`);
  }

  const ids = new Map();
  const identities = new Map();
  store.plans.forEach((plan, index) => {
    const result = validatePlan(plan, index);
    result.errors.forEach(error => errors.push(error));

    const id = plan && plan.id;
    if (id) {
      if (ids.has(id)) errors.push(`plans.json 重复 id: ${id}（${ids.get(id)} 与 ${plan.planName}）`);
      else ids.set(id, plan.planName);
    }
    if (plan && plan.billing && plan.kind) {
      const identity = identityKeyOf(plan);
      if (identities.has(identity)) {
        errors.push(`plans.json 身份重复：${identity}（${identities.get(identity)} 与 ${plan.planName}）—— 同 provider + 同 planName + 同 period 只能有一条`);
      } else {
        identities.set(identity, plan.planName);
      }
    }
  });

  // 规范排序：打乱人工输入仍必须得到同一份字节
  const canonical = store.plans.map(identityKeyOf);
  const sorted = [...canonical].sort();
  if (JSON.stringify(canonical) !== JSON.stringify(sorted)) {
    errors.push('plans.json 的记录顺序不是规范序（应按 kind|provider|planName|period 升序）');
  }

  providers.validateProviderTable(table).forEach(problem => errors.push(problem));
  providers.validateSlugAgreement(table, slugs).forEach(problem => errors.push(problem));

  return { ok: errors.length === 0, errors, plans: store.plans };
}

/** updatedAt 的唯一算法：全部 lastSeen 的最大值，转成带 +08:00 的 ISO。无记录时为 null */
function canonicalUpdatedAt(plans) {
  const dates = (plans || []).map(plan => plan && plan.lastSeen).filter(Boolean).sort();
  if (!dates.length) return null;
  return `${dates[dates.length - 1]}T00:00:00+08:00`;
}

/* ------------------------------------------------------------------ */
/* 读写与重建                                                          */
/* ------------------------------------------------------------------ */

function loadPlans(file = PLANS_FILE) {
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  return parsed;
}

function loadCuratedPlans({ file = CURATED_PLANS_FILE, providerTable = null, today = null } = {}) {
  if (!fs.existsSync(file)) {
    return {
      payload: null,
      plans: [],
      problems: [{ index: null, planName: null, reason: `curated_plans.json 不存在: ${path.relative(path.join(__dirname, '..', '..'), file)}` }],
      evidenceDropped: []
    };
  }
  let list;
  try {
    list = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`curated_plans.json 解析失败: ${error.message}`);
  }
  if (!Array.isArray(list)) throw new Error('curated_plans.json 必须是数组');

  const { payload, problems, items } = buildStore({ curated: list, providerTable, today });

  // 入口对账：声明了官方引文、而归一之后不见了 —— 与 audience-audit 同一条理由，
  // 校验器只看得到归一之后的世界，写坏的字只在这里能对上账。
  const evidenceDropped = [];
  for (const item of items) {
    if (!item.plan) continue;
    provenance.auditEvidence(item.raw.evidence, item.plan.evidence, { today: today || todayCN(), fields: PLANS_EVIDENCE_FIELDS })
      .forEach(dropped => evidenceDropped.push({
        index: item.index,
        planName: item.plan.planName,
        reason: dropped.reason
      }));
  }

  return { payload, plans: payload.plans, problems, evidenceDropped };
}

/**
 * 人工来源层 → plans.json 的 payload。**确定性、不读墙上时钟**：
 * 同一份输入（哪怕数组顺序不同）必须得到逐字节相同的输出。
 */
function buildStore({ curated = [], providerTable = null, today = null } = {}) {
  const problems = [];
  const items = [];
  const plans = [];

  curated.forEach((raw, index) => {
    const result = makePlan(raw, { providers: providerTable, today });
    items.push({ index, raw: raw && typeof raw === 'object' ? raw : {}, plan: result.plan, problems: result.problems });
    if (!result.ok) {
      result.problems.forEach(reason => problems.push({
        index,
        planName: (raw && typeof raw === 'object' && raw.planName) || null,
        reason
      }));
      return;
    }
    plans.push(result.plan);
  });

  plans.sort((a, b) => {
    const ka = identityKeyOf(a);
    const kb = identityKeyOf(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });

  const seen = new Map();
  for (const plan of plans) {
    const identity = identityKeyOf(plan);
    if (seen.has(identity)) {
      problems.push({
        index: null,
        planName: plan.planName,
        reason: `与「${seen.get(identity)}」身份重复（同 kind + provider + planName + period）—— 同一平台的同一套餐只能有一条记录`
      });
    } else {
      seen.set(identity, plan.planName);
    }
  }

  const payload = {
    schemaVersion: PLAN_SCHEMA_VERSION,
    updatedAt: canonicalUpdatedAt(plans),
    count: plans.length,
    plans
  };
  return { payload, problems, items };
}

/** 写盘前的最终门禁：任何一条不合格都不允许写 */
function assertValidStore(store, options = {}) {
  const result = validatePlansStore(store, options);
  if (!result.ok) {
    const error = new Error(`plans 数据校验失败（${result.errors.length} 项）:\n  - ${result.errors.slice(0, 20).join('\n  - ')}`);
    error.validationErrors = result.errors;
    throw error;
  }
  return true;
}

function writePlans(payload, file = PLANS_FILE) {
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return payload;
}

/* ------------------------------------------------------------------ */
/* 统计（validate 与 report 共用）                                      */
/* ------------------------------------------------------------------ */

function summarize(store) {
  const plans = (store && Array.isArray(store.plans)) ? store.plans : [];
  const reasons = new Map();
  let withPromo = 0;
  let computable = 0;
  let evidenceItems = 0;
  let withModels = 0;
  let withRestrictions = 0;
  let priceUnknown = 0;

  for (const plan of plans) {
    const billing = plan.billing || {};
    const quota = plan.quota || {};
    if (billing.promoPrice !== null && billing.promoPrice !== undefined) withPromo++;
    if (billing.regularPrice === null || billing.regularPrice === undefined) priceUnknown++;
    if (Array.isArray(plan.supportedModels)) withModels++;
    if (Array.isArray(plan.restrictions)) withRestrictions++;
    if (Array.isArray(plan.evidence)) evidenceItems += plan.evidence.length;

    const { metric, reason } = deriveMetricsWithReason(plan);
    if (metric) computable++;
    else {
      const key = (quota.type || '(空)');
      reasons.set(key, (reasons.get(key) || 0) + 1);
    }
  }

  const byQuotaType = {};
  for (const plan of plans) {
    const type = (plan.quota && plan.quota.type) || '(空)';
    byQuotaType[type] = (byQuotaType[type] || 0) + 1;
  }

  return {
    total: plans.length,
    providers: new Set(plans.map(plan => plan.provider)).size,
    cn: plans.filter(plan => plan.region === 'cn').length,
    global: plans.filter(plan => plan.region === 'global').length,
    withPromo,
    priceUnknown,
    computable,
    notComputableByQuotaType: Object.fromEntries([...reasons.entries()].sort()),
    byQuotaType,
    withModels,
    withRestrictions,
    evidenceItems,
    updatedAt: store ? store.updatedAt : null
  };
}

module.exports = {
  PLANS_FILE,
  CURATED_PLANS_FILE,
  PLAN_SCHEMA_VERSION,
  PLAN_KINDS,
  BILLING_PERIODS,
  CURRENCIES,
  QUOTA_TYPES,
  QUANTIFIED_QUOTA_TYPES,
  AMOUNTLESS_QUOTA_TYPES,
  QUOTA_DESCRIPTION_REQUIRED,
  QUOTA_PERIODS,
  MODEL_ROLES,
  RESTRICTION_KINDS,
  RESTRICTION_VALUE_TYPE,
  PLAN_SOURCE_TYPES,
  PLANS_EVIDENCE_FIELDS,
  RECORD_FIELDS,
  INPUT_FIELDS,
  DERIVED_FIELDS,
  MAX_PLANS,
  MAX_PLAN_NAME,
  MAX_NOTE,
  MAX_QUOTA_DESCRIPTION,
  MAX_MODELS,
  MAX_MODEL_NAME,
  MAX_MODEL_NOTE,
  MAX_RESTRICTIONS,
  MAX_RESTRICTION_NOTE,
  MAX_RESTRICTION_TEXT,
  MAX_PRICE,
  MAX_QUOTA_AMOUNT,
  UNIT_PER,
  METRIC_DECIMALS,
  COMPARABLE_BILLING_PERIODS,
  PLAN_WORDING,
  normalizePlanName,
  planNameKeyOf,
  makePlanId,
  identityKeyOf,
  deriveMetrics,
  deriveMetricsWithReason,
  derivedMetricsOf,
  makePlan,
  validatePlan,
  planDiffs,
  validatePlansStore,
  canonicalUpdatedAt,
  loadPlans,
  loadCuratedPlans,
  buildStore,
  assertValidStore,
  writePlans,
  summarize
};
