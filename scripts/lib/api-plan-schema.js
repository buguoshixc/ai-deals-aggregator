/**
 * v2.5 API / Token 计费数据契约（`api-plans.json` v1）。
 *
 * ## 这一层是什么，不是什么
 *
 * **是**：把「各平台按量计费（API / Token）的官方价格」变成一份可校验、可重建、可追踪变化的
 * 数据 —— 一个 provider 一条记录，记录内 `models[]` 是逐模型、逐维度的单价。
 *
 * **不是**：不是把 Coding Plan 的 `billing` / `quota` 借用过来。两者真正共享的只有
 * **BasePlan 那一层**（provider 归一、引文层、严格文本/URL/日期判据、id 形状、规范序、
 * 币种与限制条件枚举），它们统统来自 `plan-schema.BASE_PLAN`，这里一个都不重抄。
 * 逐条差异见 `docs/SCHEMA-v2.5.md` §2。
 *
 * ## 三条与"钱"有关的结构性红线（都有牙，见 `api-plans-selftest.js`）
 *
 * 1. **单位永远显式**：`pricing.unit` 是记录级、必填、枚举值；`models[].rates` 里的数字
 *    就是这个单位的数量。**全仓不存在任何 `$/1M` ↔ `$/1K` 的换算代码路径** ——
 *    本文件里没有任何乘法/除法在换算单位（自测有一条静态扫描钉住这一点）。
 *    读到一个「0.14」而不知道是每千还是每百万，是这一层最坏的错。
 * 2. **credits 是钱，不是 token**（题面 §五）：`credits[]` 的字段白名单里**没有任何 token
 *    数量字段**，且额外拒绝键名含 `token` 的键。于是「$10 credits 被写成 500 万 tokens」
 *    这种写法在结构上写不进来。
 * 3. **派生值一律为 `{}`**（题面 §八）：混合单价需要工作负载假设，credits→token 需要选定
 *    模型与单价 —— 两者都属于 Phase 2.6 的成本计算器。`deriveApiMetricsWithReason()`
 *    把**拒绝的理由**写进代码，`derivedMetrics` 由它推导并逐字节比对，手写进不去。
 */

'use strict';

const fs = require('fs');
const path = require('path');

const { REGIONS, normalizeDate, todayCN } = require('./schema');
const provenance = require('./provenance');
const providers = require('./providers');
const planSchema = require('./plan-schema');

const B = planSchema.BASE_PLAN;

const API_PLANS_FILE = path.join(__dirname, '..', '..', 'api-plans.json');
const CURATED_API_PLANS_FILE = path.join(__dirname, '..', 'data', 'curated_api_plans.json');

const API_PLAN_SCHEMA_VERSION = 1;
const API_KIND = 'api';

/* ------------------------------------------------------------------ */
/* 枚举（唯一出处；渲染层与自测都用这些常量，不许各写一份）              */
/* ------------------------------------------------------------------ */

/**
 * 计费通道：与 Coding Plan 的 `billing.period` 是**同一条轴**上的东西（进 id）。
 *
 * 这是**登记制**枚举：每个值都对应某个官方定价页上真实存在的一张独立价目表
 * （`standard` 标准 / `batch` 批处理 / `flex` 弹性 / `priority` 优先 / `fast` 快速 /
 * `ultrafast` 极速 / `off_peak` 低峰时段 / `fine_tuned` 微调）。加值前先确认
 * "官方确实为它单独列了一张价格表"，否则它只是 planName 里的一句话。
 */
const API_CHANNELS = [
  'standard', 'batch', 'flex', 'priority', 'fast', 'ultrafast', 'off_peak', 'fine_tuned', 'other'
];

const API_CHANNEL_LABEL = {
  standard: '标准',
  batch: '批处理',
  flex: '弹性',
  priority: '优先',
  fast: '快速',
  ultrafast: '极速',
  off_peak: '低峰时段',
  fine_tuned: '微调',
  other: '其他'
};

/** 记录级计量单位。币种另由 `pricing.currency` 给出 */
const API_UNITS = ['per_1M_tokens', 'per_1K_tokens', 'per_1M_characters'];

/** 单位的口径文案（页面上必须与数字同时出现） */
const API_UNIT_LABEL = {
  per_1M_tokens: '每 100 万 tokens',
  per_1K_tokens: '每 1000 tokens',
  per_1M_characters: '每 100 万字符'
};

/**
 * token 维度的固定键集：**顺序即序列化顺序**。
 *   · `null` = 官方**没给**这一项（不是 0）；
 *   · `0` = 官方**明说免费**（与 Coding Plan 的 `regularPrice: 0` 同一条语义纪律）。
 *
 * `cacheWrite` / `cacheWriteLong`：写缓存的短时长与长时长定价。
 * Anthropic 同时公布 5 分钟与 1 小时两档写价，Google 另按"每百万 token·小时"收存储费；
 * 把两档并成一个字段会丢掉一半事实，所以它们各占一个键（见 `docs/SCHEMA-v2.5.md` §3.4）。
 */
const TOKEN_RATE_KEYS = [
  'input', 'output', 'cachedInput', 'cacheWrite', 'cacheWriteLong', 'reasoning', 'batchInput', 'batchOutput'
];

const TOKEN_RATE_LABEL = {
  input: '输入',
  output: '输出',
  cachedInput: '缓存命中输入',
  cacheWrite: '缓存写入（短）',
  cacheWriteLong: '缓存写入（长）',
  reasoning: '推理 token',
  batchInput: '批处理输入',
  batchOutput: '批处理输出'
};

/** 免费额度类型 → 数额单位词（**唯一出处**：单元格与明细节都读它，不再有第三份手写三元表达式） */
const FREE_TIER_UNIT_LABEL = {
  tokens: 'tokens',
  credits: 'credits',
  requests: '次请求'
};

/** 非 token 维度：**每条自带单位**（所以「每张图 $0.04」不可能被塞进 token 单位字段） */
const MEDIA_RATE_KINDS = ['image', 'audio', 'video', 'text', 'other'];
const MEDIA_RATE_UNITS = [
  'per_image', 'per_second', 'per_minute', 'per_1M_characters', 'per_request', 'per_1M_token_hours'
];
const MEDIA_RATE_LABEL = { image: '图像', audio: '音频', video: '视频', text: '文本', other: '其他' };
const MEDIA_RATE_UNIT_LABEL = {
  per_image: '每张',
  per_second: '每秒',
  per_minute: '每分钟',
  per_1M_characters: '每百万字符',
  per_request: '每次请求',
  per_1M_token_hours: '每百万 token·小时'
};

/**
 * 模型计价条目的变体：与记录级 `channel` 不同粒度 ——
 * 同一张官方表里可以同时给出标准价与批处理价，也可以按**请求长度**分档
 * （智谱的 `[0,32K)` / `[32K+)`、OpenAI 的 Short / Long context）。
 */
const MODEL_VARIANTS = ['standard', 'batch', 'long_context', 'fine_tuned', 'priority', 'other'];
const MODEL_VARIANT_LABEL = {
  standard: '标准', batch: '批处理', long_context: '长上下文', fine_tuned: '微调', priority: '优先', other: '其他'
};

/** 免费额度类型（只装**稳定长期**的免费能力；限时/新用户赠送留在 Deals） */
const FREE_TIER_TYPES = [
  'tokens', 'credits', 'requests', 'models', 'rate_limited', 'unlimited_fair_use', 'none', 'other'
];
/**
 * 「这份免费额度是什么性质」—— 题面 §六 / §7.3 的分工落到**数据**上（P1-11 / `F-r2-api-005`）。
 *
 *   `standing`     官方**长期提供**的免费能力（长期免费档 / 长期免费模型）→ Plan capability
 *   `new_user`     新用户赠送（首次开通 / 新注册赠送）→ 优惠（Deals）
 *   `promotional`  限时赠送（活动期内的赠品）→ 优惠（Deals）
 *
 * 为什么必须是**必填**枚举，而不是一句可选注释：缺省值会被渲染层与读者读成「长期能力」，
 * 而「限时赠品被记成 Plan 的能力」正是这条 P1 的形态（生产 `aliyun` / `tencent` 两条
 * `period:'one_time'` 的赠送被收进 `freeTier`，同时页面口径写着「只记官方长期提供的免费能力」）。
 * 后两档**不是**长期能力，但也不是「不许出现在 API 计费记录里」——它们是这条记录上的真实事实，
 * 如实记下并把性质标出来，比丢掉它们更诚实。
 */
const FREE_TIER_STABILITY = ['standing', 'new_user', 'promotional'];
/** 性质的中文措辞（**唯一出处**：渲染层的单元格 / 明细节与自测都取这一份） */
const FREE_TIER_STABILITY_LABEL = {
  standing: '长期提供',
  new_user: '新用户赠送',
  promotional: '限时赠送'
};
/** 周期性刷新周期：赠送 / 限时额度**不得**写成周期性（那会被读成「每月都有」的长期能力） */
const FREE_TIER_RECURRING_PERIODS = ['monthly', 'yearly', 'weekly', 'daily', 'hourly', 'rolling'];

/**
 * `freeTier.conversionDependsOnModel` 的三态契约（§10.4 / P2-12，API 侧）。
 *
 * 语义（**只有两个已知值 + 一个未知状态**）：
 *   `true`  额度按各模型当前单价扣减（官方明说随模型换算）
 *   `false` 官方明说不随模型换算
 *   `null`  **未说明** —— 这是"查过、来源没说"的那个状态，**不是** false
 *
 * 为什么把它写成表：`null` 与 `false` 在 JSON 里长得完全不一样，但在"随手写
 * `value || false`"的代码里长得一模一样 —— 而 `null` 被读成 `false` 就是
 * 把「官方没说」说成了「官方说不是」。判据在 `normalizeFreeTier()`：
 * 缺字段 / 显式 null 一律落成 `null`（不得落成 `false`）；`type=credits` 时
 * 连 `null` 都不接受（必须明确回答）—— 与 `stability` 的必填同一条纪律。
 */
const FREE_TIER_CONVERSION_TRISTATE = [true, false, null];
/**
 * 赠送 / 限时额度的 `description` 必须写清官方条件（谁送、什么时候失效）。
 * 这是**结构性证据绑定**：分类不能只由一个枚举撑着，必须能在官方原文的那句话上兑现。
 */
const FREE_TIER_CONDITION_RE = /赠送|新人|新用户|首次|限时|活动|有效期|到期|过期|天内|日起|试用/;
/** 有固定数值的类型 */
const FREE_TIER_QUANTIFIED = ['tokens', 'credits', 'requests'];
/** 没有固定数值的类型：`amount` 必须是 null（不得把限速伪装成固定额度） */
const FREE_TIER_AMOUNTLESS = ['rate_limited', 'unlimited_fair_use', 'none'];
/** 语义全在文字里：必须写 description */
const FREE_TIER_DESCRIPTION_REQUIRED = ['rate_limited', 'unlimited_fair_use', 'other', 'none', 'models'];
/** 额度刷新周期：与 Coding Plan 的 `quota.period` 同一套值（同一件事，不再立一套） */
const FREE_TIER_PERIODS = planSchema.QUOTA_PERIODS;

const LIMIT_KINDS = ['rpm', 'tpm', 'rpd', 'tpd', 'concurrency'];
const LIMIT_LABEL = {
  rpm: '每分钟请求数', tpm: '每分钟 token 数', rpd: '每日请求数', tpd: '每日 token 数', concurrency: '并发数'
};

/** credits 的计价单位。**没有 tokens** —— 这正是红线 2 的落点 */
const CREDIT_UNITS = ['credits', 'usd', 'cny'];

/* ------------------------------------------------------------------ */
/* 字段集与上限                                                        */
/* ------------------------------------------------------------------ */

/** 记录的字段（顺序即 JSON 序列化顺序，改动会让全库 diff 漂移） */
const RECORD_FIELDS = [
  'id', 'kind', 'provider', 'planName', 'channel', 'officialUrl', 'source', 'sourceUrl', 'region',
  'pricing', 'models', 'freeTier', 'limits', 'credits', 'restrictions',
  'firstSeen', 'lastSeen', 'verified', 'verifiedAt', 'evidence', 'derivedMetrics'
];

const INPUT_FIELDS = RECORD_FIELDS.filter(field => field !== 'id' && field !== 'derivedMetrics');
const DERIVED_FIELDS = ['id', 'derivedMetrics'];

const MODEL_FIELDS = ['name', 'modelKey', 'variant', 'aliases', 'rates', 'mediaRates', 'note'];
const MEDIA_RATE_FIELDS = ['kind', 'price', 'unit', 'note'];
const FREE_TIER_FIELDS = ['type', 'stability', 'amount', 'period', 'models', 'description', 'conversionDependsOnModel'];
const LIMIT_FIELDS = ['kind', 'value', 'appliesTo', 'note'];
const CREDIT_FIELDS = ['pay', 'currency', 'gets', 'unit', 'usageNote', 'expires', 'description'];
const PRICING_FIELDS = ['currency', 'unit', 'unitNote'];

const MAX_API_PLANS = 200;
const MAX_MODELS = 64;
const MAX_MEDIA_RATES = 6;
const MAX_ALIASES = 8;
const MAX_LIMITS = 8;
const MAX_CREDITS = 6;
const MAX_PRICE = 1000000;
const MAX_RATE = 1000000;
const MAX_MODEL_KEY = 60;
const MAX_ALIAS = 60;
const MAX_FREE_TIER_MODELS = 24;
const MAX_LIMIT_VALUE = 1000000000;

/** 引文可以绑定的字段（记录级那部分；模型级由 `apiEvidenceFieldsOf()` 动态展开） */
const API_EVIDENCE_FIELDS = [
  'provider', 'planName', 'channel', 'pricing.currency', 'pricing.unit',
  'region', 'freeTier', 'limits', 'credits', 'restrictions'
];

/**
 * 口径文案的唯一出处（**刻意不写进数据**：每条记录重复同一句话只会让文件变噪）。
 */
const API_WORDING = {
  unitNote: '表中每一个价格都是「该行「计费单位」列所写的单位」的单价，本站不做任何单位换算。',
  freeTierScope: '「免费额度」栏**逐条标注性质**：长期提供（官方长期提供的免费档 / 免费模型）· '
    + '新用户赠送（首次开通 / 新注册的赠送）· 限时赠送（活动期内的赠品）。'
    + '只有标为「长期提供」的才是长期免费能力；后两类**不是** —— 它们是官方的一次性或限时赠送，'
    + '本站照原样收录并标注（它们的优惠形态属于 Deals）。',
  creditsNote: 'credits 是预付费额度（钱），不是 token 数量。本站不把它折算成任何 token 数 —— '
    + '那不是套餐的原始额度，而是需要选定模型与单价才能算出的**计算值**。',
  priceUnknown: '官方页面未标注该项，留空（不是 0）',
  noDerived: '本阶段不产出任何派生单价：混合单价需要工作负载假设，credits→token 需要选定模型与单价，'
    + '两者都属于成本计算器（后续阶段）。'
};

/* ------------------------------------------------------------------ */
/* 名称与身份                                                          */
/* ------------------------------------------------------------------ */

/** 模型身份键的规范形态：小写、可打印、不含空白（改名不换 key ⇒ 不产生假变化） */
function normalizeModelKey(value) {
  return String(value === null || value === undefined ? '' : value)
    .normalize('NFKC')
    .trim()
    .toLowerCase();
}

const MODEL_KEY_RE = /^[a-z0-9][a-z0-9._-]{1,59}$/;

/** 模型条目的身份键：`(modelKey, variant)` 在记录内唯一 */
function modelEntryKeyOf(entry) {
  return `${(entry && entry.modelKey) || ''}|${(entry && entry.variant) || ''}`;
}

/**
 * 稳定 id：`sha1('api|' + provider + '|' + planNameKey + '|' + channel)` 前 12 位。
 * 改价 / 增删模型 / 换官方页 / 改备注 **都不换 id**（题面 §十 的同一条纪律）。
 */
function makeApiPlanId({ provider, planName, channel }) {
  return B.idFromBasis(`${API_KIND}|${provider}|${B.planNameKeyOf(planName)}|${channel}`);
}

/** 数据集内的身份键：重复即数据错误 */
function apiIdentityKeyOf(plan) {
  return `${(plan && plan.kind) || API_KIND}|${plan && plan.provider}|`
    + `${B.planNameKeyOf(plan && plan.planName)}|${(plan && plan.channel) || ''}`;
}

/* ------------------------------------------------------------------ */
/* 派生指标：本阶段一律为空，但"为什么为空"要写在代码里                  */
/* ------------------------------------------------------------------ */

/**
 * API 计费的派生指标 + **算不出来的原因**（题面 §八 明确本阶段不做成本模拟器）。
 *
 * 这里刻意**不做**"估算一个混合单价"这种事：任何混合都需要「输入/输出比例」这个
 * 工作负载假设，而假设一变结论就变 —— 那不是价格事实，是模拟结果。
 *
 * @returns {{metric: null, reason: string}}
 */
function deriveApiMetricsWithReason(plan, opts = {}) {
  const models = (plan && Array.isArray(plan.models)) ? plan.models : [];
  if (!models.length) return { metric: null, reason: '记录里没有模型价格条目' };
  if (opts && opts.modelKey) {
    return {
      metric: null,
      reason: `${opts.modelKey}：credits→token 需要"选定模型 + 选定单价 + 明确扣减条件"三个条件同时成立，`
        + '且结果是计算值而不是套餐额度（题面 §五）—— 本阶段不产出'
    };
  }
  return {
    metric: null,
    reason: '混合单价需要工作负载假设（输入/输出比例），credits→token 需要选定模型与单价；'
      + '两者都属于 API 成本计算器，本阶段不做（题面 §八 / §十四）'
  };
}

/** `derivedMetrics` 的规范形态：**恒为空对象**（照抄 Coding Plan "算不出就 null" 的精神，只是这里连可比的候选都没有） */
function derivedMetricsOf() {
  return {};
}

/* ------------------------------------------------------------------ */
/* 严格归一（与 plans 同一条纪律：任何被改写的输入都**报错**，不静默清洗） */
/* ------------------------------------------------------------------ */

const strictText = B.strictText;
const strictUrl = B.strictUrl;
const numberOrNull = B.numberOrNull;

function problemsForUnknownKeys(value, field, allowed, problems) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) problems.push(`${field}: 未知字段 ${key}（允许的键：${allowed.join(' / ')}）`);
  }
}

function plainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/* ------------------------------- pricing ------------------------------- */

function normalizePricing(value, problems) {
  if (!plainObject(value)) {
    problems.push('pricing 缺失或不是对象');
    return null;
  }
  problemsForUnknownKeys(value, 'pricing', PRICING_FIELDS, problems);

  const currency = value.currency === null || value.currency === undefined
    ? null
    : (B.CURRENCIES.includes(value.currency) ? value.currency : null);
  if (value.currency !== null && value.currency !== undefined && !currency) {
    problems.push(`pricing.currency 非法(${value.currency})：只接受 ${B.CURRENCIES.join(' / ')}`);
  }
  const unit = value.unit === null || value.unit === undefined
    ? null
    : (API_UNITS.includes(value.unit) ? value.unit : null);
  if (value.unit !== null && value.unit !== undefined && !unit) {
    problems.push(`pricing.unit 非法(${value.unit})：只接受 ${API_UNITS.join(' / ')}`
      + ' —— 单位必须显式登记，不接受自由文本（那是 "0.14 却不知道每千还是每百万" 的入口）');
  }
  const unitNote = strictText(value.unitNote, 'pricing.unitNote', B.MAX_NOTE, problems);
  return { currency, unit, unitNote };
}

/* -------------------------------- models ------------------------------- */

function normalizeRates(value, where, problems) {
  const out = {};
  for (const key of TOKEN_RATE_KEYS) out[key] = null;
  if (value === null || value === undefined) return out;
  if (!plainObject(value)) {
    problems.push(`${where} 必须是对象或 null`);
    return out;
  }
  for (const key of Object.keys(value)) {
    if (!TOKEN_RATE_KEYS.includes(key)) {
      problems.push(`${where}: 未知维度 ${key}（token 维度只接受 ${TOKEN_RATE_KEYS.join(' / ')}；`
        + '按图/秒/次计价请写 mediaRates）');
      continue;
    }
    if (value[key] === null || value[key] === undefined) continue;
    // `0` 是**合法**且有意义的值：官方明说这一项免费。只有 null 才表示"官方没给"。
    const price = numberOrNull(value[key], `${where}.${key}`, problems, { min: 0, max: MAX_RATE });
    if (price !== null) out[key] = price;
  }
  return out;
}

function normalizeMediaRates(value, where, problems) {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value)) {
    problems.push(`${where} 必须是数组或 null（空数组不是"没有"）`);
    return null;
  }
  if (!value.length) {
    problems.push(`${where} 是空数组（没有非 token 计费项时应写 null）`);
    return null;
  }
  if (value.length > MAX_MEDIA_RATES) {
    problems.push(`${where} 超过 ${MAX_MEDIA_RATES} 条`);
    return null;
  }
  const out = [];
  value.forEach((item, index) => {
    const at = `${where}[${index}]`;
    if (!plainObject(item)) {
      problems.push(`${at} 必须是对象`);
      return;
    }
    problemsForUnknownKeys(item, at, MEDIA_RATE_FIELDS, problems);
    if (!MEDIA_RATE_KINDS.includes(item.kind)) {
      problems.push(`${at}.kind 非法(${item.kind})：只接受 ${MEDIA_RATE_KINDS.join(' / ')}`);
      return;
    }
    const price = numberOrNull(item.price, `${at}.price`, problems, { min: 0, max: MAX_PRICE, exclusiveMin: true });
    if (price === null) {
      problems.push(`${at}.price 缺失（非 token 计费项必须给出明确单价）`);
      return;
    }
    if (!MEDIA_RATE_UNITS.includes(item.unit)) {
      problems.push(`${at}.unit 非法(${item.unit})：只接受 ${MEDIA_RATE_UNITS.join(' / ')}`
        + ' —— 非 token 维度的单位与 token 单位是两码事，必须逐条写明');
      return;
    }
    const note = strictText(item.note, `${at}.note`, B.MAX_NOTE, problems);
    out.push({ kind: item.kind, price, unit: item.unit, note });
  });
  if (!out.length) return null;
  const kindOrder = item => MEDIA_RATE_KINDS.indexOf(item.kind);
  return out.sort((a, b) => {
    const diff = kindOrder(a) - kindOrder(b);
    if (diff !== 0) return diff;
    if (a.price !== b.price) return a.price - b.price;
    return a.unit < b.unit ? -1 : a.unit > b.unit ? 1 : 0;
  });
}

function normalizeModels(value, problems) {
  if (!Array.isArray(value) || !value.length) {
    problems.push('models 必须是非空数组（一个 API 计费记录至少要有一条模型价格）');
    return null;
  }
  if (value.length > MAX_MODELS) {
    problems.push(`models 超过 ${MAX_MODELS} 条`);
    return null;
  }
  const seenEntry = new Set();
  const seenNames = new Set();
  const out = [];

  value.forEach((item, index) => {
    const where = `models[${index}]`;
    if (!plainObject(item)) {
      problems.push(`${where} 必须是对象`);
      return;
    }
    problemsForUnknownKeys(item, where, MODEL_FIELDS, problems);

    // 显示名：官方原文，**不用 isGarbage**（会误杀 o3 这类短名）
    const name = strictText(item.name, `${where}.name`, B.MAX_PLAN_NAME, problems, { required: true });
    // 身份键：人工写、改名不动它
    const modelKey = normalizeModelKey(item.modelKey);
    if (!modelKey) problems.push(`${where}.modelKey 缺失（它是模型的身份，改名时必须保持不变）`);
    else if (!MODEL_KEY_RE.test(modelKey)) {
      problems.push(`${where}.modelKey 非法(${item.modelKey})：必须匹配 ${MODEL_KEY_RE}`);
    } else if (modelKey !== item.modelKey) {
      problems.push(`${where}.modelKey 不是规范形态（小写、NFKC 后是「${modelKey}」）`);
    }

    const variant = item.variant === null || item.variant === undefined ? 'standard' : item.variant;
    if (!MODEL_VARIANTS.includes(variant)) {
      problems.push(`${where}.variant 非法(${item.variant})：只接受 ${MODEL_VARIANTS.join(' / ')}`);
      return;
    }

    const rates = normalizeRates(item.rates, `${where}.rates`, problems);
    const mediaRates = normalizeMediaRates(item.mediaRates, `${where}.mediaRates`, problems);
    const note = strictText(item.note, `${where}.note`, B.MAX_NOTE, problems);

    let aliases = null;
    if (item.aliases !== null && item.aliases !== undefined) {
      if (!Array.isArray(item.aliases) || !item.aliases.length) {
        problems.push(`${where}.aliases 必须是非空数组或 null（"没有别名"写 null，不写空数组）`);
      } else if (item.aliases.length > MAX_ALIASES) {
        problems.push(`${where}.aliases 超过 ${MAX_ALIASES} 条`);
      } else {
        const seen = new Set();
        const list = [];
        item.aliases.forEach((alias, at) => {
          const text = strictText(alias, `${where}.aliases[${at}]`, MAX_ALIAS, problems, { required: true });
          if (!text) return;
          const key = text.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
          if (seen.has(key)) {
            problems.push(`${where}.aliases[${at}] 重复（${text}）`);
            return;
          }
          seen.add(key);
          list.push(text);
        });
        if (list.length) aliases = list.sort();
      }
    }

    if (!name || !modelKey) return;

    const hasRate = TOKEN_RATE_KEYS.some(key => rates[key] !== null);
    if (!hasRate && !mediaRates) {
      problems.push(`${where}: 既没有任何 token 单价也没有非 token 计费项 —— 这条模型没有价格事实，不该收进来`);
      return;
    }

    const entryKey = `${modelKey}|${variant}`;
    if (seenEntry.has(entryKey)) {
      problems.push(`${where}: (modelKey, variant) 重复（${entryKey}）—— 同一模型的同一变体只能有一条`);
      return;
    }
    seenEntry.add(entryKey);

    const nameKey = `${name.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase()}|${variant}`;
    if (seenNames.has(nameKey)) {
      problems.push(`${where}: 显示名重复（${name} / ${variant}）`);
      return;
    }
    seenNames.add(nameKey);

    out.push({ name, modelKey, variant, aliases, rates, mediaRates, note });
  });

  if (!out.length) return null;

  // 别名不得与本记录里任何身份键/显示名/别名冲突 —— 否则"改名"与"新增"会在这里悄悄缠在一起
  const identity = new Set();
  for (const entry of out) {
    identity.add(`${entry.modelKey}|${entry.variant}`);
    identity.add(`${entry.name.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase()}|${entry.variant}`);
  }
  for (const entry of out) {
    for (const alias of entry.aliases || []) {
      const key = `${alias.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase()}|${entry.variant}`;
      if (identity.has(key) && key !== `${entry.modelKey}|${entry.variant}`
        && key !== `${entry.name.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase()}|${entry.variant}`) {
        problems.push(`models: 别名「${alias}」与记录内另一个模型条目冲突（见 §模型别名唯一性）`);
      }
    }
  }

  return out.sort((a, b) => {
    const ka = modelEntryKeyOf(a);
    const kb = modelEntryKeyOf(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
}

/* ------------------------------- freeTier ------------------------------ */

function normalizeFreeTier(value, problems, models) {
  if (value === null || value === undefined) return null;
  if (!plainObject(value)) {
    problems.push('freeTier 必须是对象或 null（"没查到"写 null；"官方明说没有"写 {"type":"none"}）');
    return null;
  }
  problemsForUnknownKeys(value, 'freeTier', FREE_TIER_FIELDS, problems);

  const type = FREE_TIER_TYPES.includes(value.type) ? value.type : null;
  if (!type) problems.push(`freeTier.type 非法(${value.type})：只接受 ${FREE_TIER_TYPES.join(' / ')}`);

  // 性质（P1-11）：必填枚举 + 与 period / description 的互斥判据。
  // 「缺省」在这里是**错误**而不是默认值 —— 缺省会被读成「长期能力」。
  let stability = null;
  const rawStability = value.stability;
  if (type === 'none') {
    if (rawStability !== null && rawStability !== undefined) {
      problems.push('freeTier：type=none（官方明说没有免费额度）时 stability 必须是 null'
        + ' —— 「没有」没有性质可标，给它一个档位等于把「没有」说成「有」的某一种');
    }
  } else if (FREE_TIER_STABILITY.includes(rawStability)) {
    stability = rawStability;
  } else {
    problems.push(`freeTier.stability 非法(${JSON.stringify(rawStability)})：必须写明这份额度的性质（${FREE_TIER_STABILITY.join(' / ')}）`
      + ' —— 缺省会被读成「长期能力」，那正是「限时/新用户赠送被记成 Plan 能力」的形态');
  }

  const amount = numberOrNull(value.amount, 'freeTier.amount', problems, {
    min: 0, max: planSchema.MAX_QUOTA_AMOUNT, exclusiveMin: true
  });
  if (type && FREE_TIER_QUANTIFIED.includes(type) && amount === null) {
    problems.push(`freeTier：type=${type} 必须给出正数 amount`);
  }
  if (type && FREE_TIER_AMOUNTLESS.includes(type) && amount !== null) {
    problems.push(`freeTier：type=${type} 不允许 amount（没有固定数值，不得伪装成固定额度）`);
  }

  const period = value.period === null || value.period === undefined
    ? null
    : (FREE_TIER_PERIODS.includes(value.period) ? value.period : null);
  if (value.period !== null && value.period !== undefined && !period) {
    problems.push(`freeTier.period 非法(${value.period})：只接受 ${FREE_TIER_PERIODS.join(' / ')}`);
  }

  const description = strictText(value.description, 'freeTier.description', B.MAX_NOTE, problems);
  if (type && FREE_TIER_DESCRIPTION_REQUIRED.includes(type) && !description) {
    problems.push(`freeTier：type=${type} 必须用 description 写明口径`);
  }

  // 性质与 period：长期能力不能是「一次性」，赠送/限时也不能写成周期性刷新。
  // 两个方向都会让读者把它读成长期能力（一次性被读成"一直有"、每月被读成"每月都送"）。
  if (stability === 'standing' && period === 'one_time') {
    problems.push('freeTier：stability=standing（长期提供）与 period=one_time（一次性）自相矛盾'
      + ' —— 一次性赠送不是长期能力，请改成 new_user / promotional 或修正 period');
  }
  if (stability && stability !== 'standing' && period && FREE_TIER_RECURRING_PERIODS.includes(period)) {
    problems.push(`freeTier：stability=${stability}（${FREE_TIER_STABILITY_LABEL[stability]}）不得写成周期性刷新（period=${period}）`
      + ' —— 赠送 / 限时额度写成每月或每年会被读成长期能力');
  }
  // 性质与官方条件：分类必须由官方原文里的那句话支撑（结构性证据绑定）。
  if (stability && stability !== 'standing') {
    if (!description) {
      problems.push(`freeTier：stability=${stability} 必须用 description 写明官方条件（谁送、有效期到什么时候）`);
    } else if (!FREE_TIER_CONDITION_RE.test(description)) {
      problems.push(`freeTier：stability=${stability} 的 description 里没有写明赠送 / 时限条件`
        + '（应出现「首次 / 新人 / 新用户 / 赠送 / 限时 / 有效期 / 天内」之一）—— 分类必须能在官方原文上兑现');
    }
  }

  let freeModels = null;
  if (value.models !== null && value.models !== undefined) {
    if (!Array.isArray(value.models) || !value.models.length) {
      problems.push('freeTier.models 必须是非空数组或 null');
    } else if (value.models.length > MAX_FREE_TIER_MODELS) {
      problems.push(`freeTier.models 超过 ${MAX_FREE_TIER_MODELS} 条`);
    } else {
      const known = new Set((models || []).map(entry => entry.modelKey));
      const list = [];
      value.models.forEach((key, at) => {
        const text = strictText(key, `freeTier.models[${at}]`, MAX_MODEL_KEY, problems, { required: true });
        if (!text) return;
        if (!known.has(text)) {
          problems.push(`freeTier.models[${at}]「${text}」不在本记录的 models 里 —— 免费模型必须能在同一份数据里找到价格条目`);
          return;
        }
        list.push(text);
      });
      if (list.length) freeModels = [...new Set(list)].sort();
    }
  }
  if (type === 'models' && !freeModels) {
    problems.push('freeTier：type=models 必须用 models 列出"哪几个模型免费"（且必须存在于本记录）');
  }

  let conversionDependsOnModel = null;
  const raw = value.conversionDependsOnModel;
  // 三态（§10.4）：true / false / null。**缺字段与显式 null 都落成 null（未知），绝不落成 false** ——
  // 「官方没说」与「官方说不是」必须能被区分，否则 `freeTier.conversionDependsOnModel` 上
  // 就复现了 P2-12 那条"来源层把 unknown 降级为 false"的形态。
  if (raw !== null && raw !== undefined) {
    if (typeof raw !== 'boolean') {
      problems.push(`freeTier.conversionDependsOnModel 必须是布尔或 null（三态：${FREE_TIER_CONVERSION_TRISTATE.map(v => JSON.stringify(v)).join(' / ')}）`);
    } else if (type === 'credits' || type === 'other') conversionDependsOnModel = raw;
    else problems.push(`freeTier.conversionDependsOnModel 只允许出现在 credits / other 上（type=${type}）`);
  }
  if (type === 'credits' && conversionDependsOnModel === null) {
    problems.push('freeTier：type=credits 必须明确 conversionDependsOnModel（true / false 二选一；null = 未说明，不算回答）');
  }

  return { type, stability, amount, period, models: freeModels, description, conversionDependsOnModel };
}

/* -------------------------------- limits ------------------------------- */

/**
 * 速率限制。**逐模型不同是常态**（DeepSeek 的并发上限 flash 2500 / pro 500、
 * OpenAI 的 RPM/TPM 按模型分档），所以每条可以用 `appliesTo` 指名它管哪几个模型
 * （`modelKey` 数组）；`null` = 整条记录通用（官方写在厂商级条款里）。
 * 同一 `(kind, appliesTo, note)` 不得重复 —— 因为同一条记录里同一个维度可以按模型分档。
 */
function normalizeLimits(value, problems, models) {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value) || !value.length) {
    problems.push('limits 必须是非空数组或 null（"没有已知限制"写 null，不写空数组）');
    return null;
  }
  if (value.length > MAX_LIMITS) {
    problems.push(`limits 超过 ${MAX_LIMITS} 条`);
    return null;
  }
  const knownModels = new Set((models || []).map(entry => entry.modelKey));
  const seen = new Set();
  const out = [];
  value.forEach((item, index) => {
    const where = `limits[${index}]`;
    if (!plainObject(item)) {
      problems.push(`${where} 必须是对象`);
      return;
    }
    problemsForUnknownKeys(item, where, LIMIT_FIELDS, problems);
    if (!LIMIT_KINDS.includes(item.kind)) {
      problems.push(`${where}.kind 非法(${item.kind})：只接受 ${LIMIT_KINDS.join(' / ')}`);
      return;
    }
    if (typeof item.value !== 'number' || !Number.isFinite(item.value) || item.value <= 0 || item.value > MAX_LIMIT_VALUE) {
      problems.push(`${where}(kind=${item.kind}).value 必须是正数（得到 ${JSON.stringify(item.value)}）`);
      return;
    }

    let appliesTo = null;
    if (item.appliesTo !== null && item.appliesTo !== undefined) {
      if (!Array.isArray(item.appliesTo) || !item.appliesTo.length) {
        problems.push(`${where}.appliesTo 必须是非空的 modelKey 数组或 null（null = 整条记录通用）`);
        return;
      }
      if (item.appliesTo.length > MAX_MODELS) {
        problems.push(`${where}.appliesTo 超过 ${MAX_MODELS} 条`);
        return;
      }
      const list = [];
      let bad = false;
      item.appliesTo.forEach((key, at) => {
        const text = strictText(key, `${where}.appliesTo[${at}]`, MAX_MODEL_KEY, problems, { required: true });
        if (!text) { bad = true; return; }
        if (!knownModels.has(text)) {
          problems.push(`${where}.appliesTo[${at}]「${text}」不在本记录的 models 里 —— 限制条件必须指向真实存在的模型条目`);
          bad = true;
          return;
        }
        list.push(text);
      });
      if (bad) return;
      appliesTo = [...new Set(list)].sort();
    }

    const note = strictText(item.note, `${where}.note`, B.MAX_RESTRICTION_NOTE, problems);
    const key = `${item.kind}|${appliesTo ? appliesTo.join(',') : ''}`;
    if (seen.has(key)) {
      problems.push(`${where}: 同一 (kind, appliesTo) 重复（同一维度同一适用范围只写一条）`);
      return;
    }
    seen.add(key);
    out.push({ kind: item.kind, value: item.value, appliesTo, note });
  });
  if (!out.length) return null;
  return out.sort((a, b) => {
    const diff = LIMIT_KINDS.indexOf(a.kind) - LIMIT_KINDS.indexOf(b.kind);
    if (diff !== 0) return diff;
    const ak = a.appliesTo ? a.appliesTo.join(',') : '';
    const bk = b.appliesTo ? b.appliesTo.join(',') : '';
    if (ak !== bk) return ak < bk ? -1 : 1;
    return a.value - b.value;
  });
}

/* -------------------------------- credits ------------------------------ */

/**
 * credits（题面 §五）：平台卖的是**钱**。
 *
 * **结构红线**：字段白名单里没有任何 token 数量字段，且额外拒绝**键名含 `token`** 的键。
 * 于是「$10 credits = 500 万 tokens」这种写法在归一阶段就进不来 —— 这比在页面上
 * 加一句"这是计算值"更硬：它根本没有地方可写。
 */
function normalizeCredits(value, problems) {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value) || !value.length) {
    problems.push('credits 必须是非空数组或 null');
    return null;
  }
  if (value.length > MAX_CREDITS) {
    problems.push(`credits 超过 ${MAX_CREDITS} 条`);
    return null;
  }
  const out = [];
  value.forEach((item, index) => {
    const where = `credits[${index}]`;
    if (!plainObject(item)) {
      problems.push(`${where} 必须是对象`);
      return;
    }
    for (const key of Object.keys(item)) {
      if (/token/i.test(key)) {
        problems.push(`${where}: 键名含 token（${key}）—— credits 是预付费额度，不是 token 数量；`
          + '若确实要给出"按当前模型价格理论可购买多少 token"，那是**计算值**，属于成本计算器（题面 §五）');
        return;
      }
    }
    problemsForUnknownKeys(item, where, CREDIT_FIELDS, problems);

    const pay = numberOrNull(item.pay, `${where}.pay`, problems, { min: 0, max: MAX_PRICE, exclusiveMin: true });
    const gets = numberOrNull(item.gets, `${where}.gets`, problems, { min: 0, max: MAX_LIMIT_VALUE, exclusiveMin: true });
    const currency = B.CURRENCIES.includes(item.currency) ? item.currency : null;
    if (!currency) problems.push(`${where}.currency 非法(${item.currency})：只接受 ${B.CURRENCIES.join(' / ')}`);
    const unit = CREDIT_UNITS.includes(item.unit) ? item.unit : null;
    if (!unit) problems.push(`${where}.unit 非法(${item.unit})：只接受 ${CREDIT_UNITS.join(' / ')}（刻意不含 tokens）`);
    const usageNote = strictText(item.usageNote, `${where}.usageNote`, B.MAX_NOTE, problems);
    const expires = strictText(item.expires, `${where}.expires`, 60, problems);
    const description = strictText(item.description, `${where}.description`, B.MAX_NOTE, problems, { required: true });
    // 币种一致性：`unit` 是 usd/cny 时，`gets` 的计价币种必须**就是**那个币种。
    // 允许「付 CNY、得 USD 额度」等于默认了一个汇率，而本站没有汇率系统（题面 §十一）。
    if (unit === 'usd' && currency !== 'USD') {
      problems.push(`${where}: unit=usd 时 currency 必须是 USD（得到 ${item.currency}）—— 本站不做币种换算`);
    }
    if (unit === 'cny' && currency !== 'CNY') {
      problems.push(`${where}: unit=cny 时 currency 必须是 CNY（得到 ${item.currency}）—— 本站不做币种换算`);
    }
    if (unit === 'credits' && !usageNote) {
      problems.push(`${where}: unit=credits 时必须用 usageNote 说明 credits 怎么扣减（折算条件）`);
    }
    if (!description) return;
    out.push({ pay, currency, gets, unit, usageNote, expires, description });
  });
  if (!out.length) return null;
  return out.sort((a, b) => {
    if (a.pay !== b.pay) return a.pay - b.pay;
    if (a.currency !== b.currency) return a.currency < b.currency ? -1 : 1;
    if (a.gets !== b.gets) return a.gets - b.gets;
    return a.unit < b.unit ? -1 : a.unit > b.unit ? 1 : 0;
  });
}

/* ------------------------------------------------------------------ */
/* 引文字段（含逐模型 / 逐变体 / 逐维度动态展开）                          */
/* ------------------------------------------------------------------ */

/**
 * 记录级基础字段 + 逐模型 / 逐变体 / **逐维度** 的字段绑定（§10.1–10.3）。
 *
 * 这是**追加式**的：旧形态 `models.<modelKey>` 原样保留（存量 35 条引文全用它），
 * 新形态只是**多出**更精确的键，让「这条原文证的是哪一个数字」可以被机器对账：
 *
 *   · `models.<modelKey>`                             —— 旧形态：这条原文属于哪个模型
 *   · `models.<modelKey>.<variant>`                   —— 精确到变体（标准档 / 长上下文是两个价）
 *   · `models.<modelKey>[.<variant>].rates.<dim>`     —— 精确到**维度**（input / output / cachedInput / …）
 *   · `rates.<dim>`                                   —— 记录级维度见证（价格表整列）
 *   · `mediaRates.<unit>`                             —— 非 token 计费项（第 7 列）的单位见证
 *
 * 为什么必须能绑定到**维度**：P1-7 的形态是「来源层把 input 与 output 对调，五道门禁全绿、
 * 页面照常渲染」—— `models.<key>` 只说"这段原文属于这个模型"，说不出"哪个数字是输入价"。
 * 维度绑定让「引文里的数字顺序」成为判据（见 `evidenceBindingProblems`）：
 * 官方表格永远是「输入价在前、输出价在后」，对调会让数据与引文的顺序相反。
 */
function apiEvidenceFieldsOf(plan) {
  const models = (plan && Array.isArray(plan.models)) ? plan.models : [];
  // 前两段**逐字保持旧顺序**（基础字段 → `models.<modelKey>` 按 modelKey 升序）：
  // 这份清单同时是 `normalizeEvidence` 的**排序键**（sortAndCap 按字段序排引文），
  // 把新形态插在前面会让存量引文的顺序漂移 —— 那是没有理由的生产数据 diff。
  const keys = [...new Set(models.map(entry => entry && entry.modelKey).filter(Boolean))].sort();
  const fields = [...API_EVIDENCE_FIELDS, ...keys.map(key => `models.${key}`)];
  // 追加的新形态（只多出可用键，不改变旧键的位置）
  for (const entry of models) {
    if (!entry || !entry.modelKey) continue;
    const key = entry.modelKey;
    if (entry.variant) fields.push(`models.${key}.${entry.variant}`);
    for (const dim of TOKEN_RATE_KEYS) {
      if (entry.rates && entry.rates[dim] !== null && entry.rates[dim] !== undefined) {
        fields.push(`models.${key}.rates.${dim}`);
        if (entry.variant) fields.push(`models.${key}.${entry.variant}.rates.${dim}`);
      }
    }
    for (const media of entry.mediaRates || []) {
      if (media && media.unit) fields.push(`models.${key}.mediaRates.${media.unit}`);
    }
  }
  // 记录级维度见证：整张价格表的「输入价 / 输出价」列（例：表头引文 + 表体引文成对使用）
  for (const dim of TOKEN_RATE_KEYS) fields.push(`rates.${dim}`);
  for (const unit of MEDIA_RATE_UNITS) fields.push(`mediaRates.${unit}`);
  return [...new Set(fields)];
}

/* ------------------------------------------------------------------ */
/* 证据绑定判据（引文 ↔ 数字 / 单位）                                     */
/* ------------------------------------------------------------------ */

/**
 * 一个数值在引文里出现的**位置**（找不到返回 -1）。名字就是判据：
 *
 *   · 逐个比对 JSON 数字的字面形态（`8` / `0.8` / `8.4`），并补一个「补零到两位小数」的形态
 *     （`8.4` → `8.40`）—— 官方表格常常把价格对齐成两位小数。
 *   · **前导边界**：数字前面不能是数字或小数点，否则 `8` 会命中 `28` 里的那个 8。
 *     **尾随不设边界**：真实引文里数字是**粘连**的（`2.1016.80` = 2.10 与 16.80），
 *     设了尾随边界就会把真值判成"没出现"，而那会让判据在真实数据上变成假红。
 *
 * 为什么用「位置」而不是布尔：P1-7 的对调只有**顺序**能证伪。官方表格的列序是固定的
 * （输入价在输出价之前），所以「引文里输入值出现在输出值之前」是一条来自原文的判据，
 * 不是关于价格大小的经验规则。
 */
function quoteIndexOfNumber(quote, value) {
  const text = String(quote === null || quote === undefined ? '' : quote);
  if (!text || typeof value !== 'number' || !Number.isFinite(value)) return -1;
  const literal = String(value);
  const forms = [literal];
  if (/^\d+\.\d$/.test(literal)) forms.push(`${literal}0`);
  let best = -1;
  for (const form of forms) {
    const literal = form.replace(/\./g, '\\.');
    // 先按「前导不是数字/小数点」找（避免把 `28` 里的 8 当成价格 8）；
    // 找不到再放宽 —— 官方引文里的数字是**粘连**的（`2.1016.80`），有边界的写法会漏掉真值。
    let at = -1;
    for (const pattern of [`(?:^|[^0-9.])${literal}`, literal]) {
      const match = new RegExp(pattern, 'g').exec(text);
      if (!match) continue;
      at = pattern.startsWith('(?:^') ? match.index + (match[0].length - form.length) : match.index;
      break;
    }
    if (at >= 0 && (best < 0 || at < best)) best = at;
  }
  return best;
}

/** 单位词两条：百万 / 千。**只看引文里写出来的单位，不看数字大小**（那是被禁止的经验规则） */
const UNIT_TOKEN_MILLION = /(每\s*百万|每百万|百万\s*tokens?|\/\s*M\b|元\s*\/\s*M|per\s*1\s*M|1M\s*tokens?|100\s*万\s*tokens?|每\s*100\s*万)/i;
const UNIT_TOKEN_THOUSAND = /(每\s*千|每千|\/\s*K\b|元\s*\/\s*K|per\s*1\s*K|1K\s*tokens?|每\s*1000)/i;

/** 一段文本点名的单位（`million` / `thousand` / `both` / null） */
function namedUnitOf(text) {
  const value = String(text === null || text === undefined ? '' : text);
  const million = UNIT_TOKEN_MILLION.test(value);
  const thousand = UNIT_TOKEN_THOUSAND.test(value);
  if (million && thousand) return 'both';
  if (million) return 'million';
  if (thousand) return 'thousand';
  return null;
}

/**
 * 去掉引文里的**模型名 / 变体名**再找数字。
 *
 * 为什么必须去：官方引文总是以模型名开头，而模型名自带版本号 ——
 * `deepseek-v4.1-flash 上下文缓存享有折扣 忙时 2元 闲时 1元…` 里的 `4` 会被当成"价格 4"，
 * 于是「输入价 1 应在输出价 4 之前」这条判据在**真实引文**上变成假红。
 * 名字是身份，不是价格；去掉它之后剩下的数字才是价格与档位边界。
 */
function stripModelNames(quote, models) {
  let text = String(quote === null || quote === undefined ? '' : quote);
  const names = [];
  for (const model of models || []) {
    if (!model) continue;
    for (const raw of [model.modelKey, model.name, ...(Array.isArray(model.aliases) ? model.aliases : [])]) {
      const value = String(raw === null || raw === undefined ? '' : raw).trim();
      if (value.length >= 3) names.push(value);
    }
  }
  names.sort((a, b) => b.length - a.length);
  for (const name of new Set(names)) {
    text = text.split(name).join(' ');
    // 大小写不同也去掉（引文里的显示名与数据里的写法可能只差大小写）
    const lower = name.toLowerCase();
    if (lower !== name) {
      let index = text.toLowerCase().indexOf(lower);
      while (index >= 0) {
        text = `${text.slice(0, index)} ${text.slice(index + name.length)}`;
        index = text.toLowerCase().indexOf(lower);
      }
    }
  }
  return text;
}

/** 记录级单位属于哪一类（用于与引文点名的单位对账） */
function unitClassOf(unit) {
  if (unit === 'per_1M_tokens' || unit === 'per_1M_characters') return 'million';
  if (unit === 'per_1K_tokens') return 'thousand';
  return null;
}

/** 证据项绑定的字段 → 解析出 {modelKey, variant, dim, mediaUnit, rec}（解析不出返回 null） */
function parseEvidenceBinding(field, variants) {
  const text = String(field || '');
  const dims = TOKEN_RATE_KEYS.join('|');
  let match = new RegExp(`^models\\.(.+)\\.(${variants.join('|')})\\.rates\\.(${dims})$`).exec(text);
  if (match) return { kind: 'rate', modelKey: match[1], variant: match[2], dim: match[3] };
  match = new RegExp(`^models\\.(.+)\\.rates\\.(${dims})$`).exec(text);
  if (match) return { kind: 'rate', modelKey: match[1], variant: null, dim: match[2] };
  match = new RegExp(`^rates\\.(${dims})$`).exec(text);
  if (match) return { kind: 'rate', modelKey: null, variant: null, dim: match[1] };
  match = /^models\.(.+)\.mediaRates\.([a-z0-9_]+)$/.exec(text);
  if (match) return { kind: 'media', modelKey: match[1], mediaUnit: match[2] };
  match = /^mediaRates\.([a-z0-9_]+)$/.exec(text);
  if (match) return { kind: 'media', modelKey: null, mediaUnit: match[1] };
  match = new RegExp(`^models\\.(.+)\\.(${variants.join('|')})$`).exec(text);
  if (match) return { kind: 'model', modelKey: match[1], variant: match[2] };
  match = /^models\.(.+)$/.exec(text);
  if (match) return { kind: 'model', modelKey: match[1], variant: null };
  return null;
}

/**
 * 证据绑定判据（§10.1–10.3 的机器判据）。**只读**：输入是归一后的记录。
 *
 * 三条判据，都来自「官方原文本身就是判据」这一个方向（不用 input<output、不用数字大小推单位）：
 *
 *   B1 维度绑定必须非空转：绑了 `…rates.input` 就必须在引文里找到这个模型的输入价。
 *      绑一个维度却读不到那个数字 = 这条绑定什么都没证，**不许静默放行**。
 *   B2 顺序判据（P1-7 的牙）：模型的输入值与输出值**都**出现在引文里时，
 *      输入值必须在输出值**之前** —— 官方表格的列序是固定的（输入价在前）。
 *      来源层把 input/output 对调后，数据与引文的顺序相反 ⇒ 红。
 *      只出现一侧时不作顺序断言（避免把"只引了输出价"的合法引文判红）。
 *   B3 单位见证与一致性（P1-8 的牙）：引文或 `pricing.unitNote` 只要点名了单位，
 *      就必须与记录级 `pricing.unit` 同类（万元≠千元）；而每条记录都必须**有**单位见证
 *      （引文点名 / `pricing.unit` 引文 / 人工在 `pricing.unitNote` 写清出处），
 *      否则红 —— "无法自动证明"不等于"不用证明"。
 *
 * @param {{models?:Array, evidence?:Array, pricing?:object}} record 归一后的记录
 * @returns {string[]} 问题列表（空 = 通过）
 */
function evidenceBindingProblems(record) {
  const problems = [];
  const models = (record && Array.isArray(record.models)) ? record.models : [];
  const evidence = (record && Array.isArray(record.evidence)) ? record.evidence : [];
  const unit = record && record.pricing ? record.pricing.unit : null;
  const unitClass = unitClassOf(unit);
  const variants = MODEL_VARIANTS;

  for (const item of evidence) {
    const named = namedUnitOf(item.quote);
    // 找数字前先去掉模型名（名字里的版本号不是价格 —— 见 stripModelNames）
    const quote = stripModelNames(item.quote, models);

    // B3：引文点名的单位必须与记录级 unit 同类（对**每一条**引文都成立，含 pricing.unit 本身）
    if (named && unitClass && named !== 'both' && named !== unitClass) {
      problems.push(`evidence「${item.field}」的引文点名了「${named === 'thousand' ? '每千' : '每百万'}」，`
        + `而记录级 pricing.unit=${unit}（${named === 'thousand' ? '每千' : '每百万'}）—— `
        + '单位是数据字段，不是从引文推断的，两者矛盾即红');
    }

    const binding = parseEvidenceBinding(item.field, variants);
    if (!binding) continue;

    // 定位这条引文证的记录：**同一个 modelKey 可以有多个变体**
    //（glm-5.3 同时有 long_context 与 standard），所以不能只取第一条 ——
    // 那次踩坑的表现是「绑定了 input 却拿另一条变体的价去对账」。
    const boundEntries = binding.modelKey
      ? models.filter(model => model.modelKey === binding.modelKey
        && (!binding.variant || model.variant === binding.variant))
      : [];
    const targeted = binding.modelKey ? boundEntries : models;

    // B1 / B2：与数字对账（只对能定位到模型的绑定做）
    if (binding.kind === 'media') continue;
    if (binding.kind === 'rate') {
      const candidates = targeted.filter(model => model.rates && model.rates[binding.dim] !== null && model.rates[binding.dim] !== undefined);
      if (!candidates.length) {
        problems.push(`evidence「${item.field}」绑定了一个**没有值**的维度（${binding.dim}）`
          + ' —— 绑定指向不存在的证据（写了却没生效）');
        continue;
      }
      if (!candidates.some(model => quoteIndexOfNumber(quote, model.rates[binding.dim]) >= 0)) {
        problems.push(`evidence「${item.field}」绑定了 ${binding.dim} 维度，但引文里找不到该值`
          + `（${candidates.map(model => model.rates[binding.dim]).join(' / ')}）—— 空转的维度绑定等于没证`);
      }
    }
    // B2：输入值必须先于输出值出现（两者都在引文里时）
    const orderCandidates = targeted;
    for (const model of orderCandidates) {
      if (!model.rates) continue;
      const input = model.rates.input;
      const output = model.rates.output;
      if (typeof input !== 'number' || typeof output !== 'number' || input === output) continue;
      const atInput = quoteIndexOfNumber(quote, input);
      const atOutput = quoteIndexOfNumber(quote, output);
      if (atInput < 0 || atOutput < 0) continue;            // 只出现一侧：不作顺序断言
      if (atInput > atOutput) {
        problems.push(`evidence「${item.field}」里 ${output} 出现在 ${input} 之前，`
          + `而 ${model.modelKey} 的数据说输入价 ${input}、输出价 ${output}`
          + ' —— 官方表格的列序是「输入价在前」；数据与引文顺序相反（input/output 被对调过？）');
      }
    }
  }

  // B3 后半：单位必须有见证（缺失即红，不许静默放行）
  const unitNote = record && record.pricing ? record.pricing.unitNote : null;
  const hasUnitEvidence = evidence.some(item => item.field === 'pricing.unit');
  const namedInQuotes = evidence.map(item => namedUnitOf(item.quote)).filter(Boolean).length > 0;
  const namedInNote = Boolean(namedUnitOf(unitNote));
  if (!hasUnitEvidence && !namedInQuotes && !namedInNote) {
    problems.push(`pricing.unit=${unit || '(缺失)'} 没有任何单位见证：引文里没点名单位、没有 pricing.unit 引文、`
      + 'pricing.unitNote 也没写 —— 单位是价格事实的一部分，"没证据"不许静默放行'
      + '（补一条官方引文，或在 pricing.unitNote 里写清这个单位是从官方哪一处读来的）');
  }
  if (unitNote && namedUnitOf(unitNote) && unitClass && namedUnitOf(unitNote) !== 'both' && namedUnitOf(unitNote) !== unitClass) {
    problems.push(`pricing.unitNote 点名了「${namedUnitOf(unitNote) === 'thousand' ? '每千' : '每百万'}」，`
      + `与 pricing.unit=${unit} 矛盾`);
  }
  return problems;
}

/* ------------------------------------------------------------------ */
/* 构造                                                                */
/* ------------------------------------------------------------------ */

function makeApiPlan(raw = {}, opts = {}) {
  const problems = [];
  const fromRecord = opts.fromRecord === true;
  const table = opts.providers || null;
  const today = opts.today || todayCN();

  if (!plainObject(raw)) return { ok: false, plan: null, problems: ['记录不是对象'] };

  const allowed = fromRecord ? RECORD_FIELDS : INPUT_FIELDS;
  for (const key of Object.keys(raw)) {
    if (!allowed.includes(key)) problems.push(`未知字段 ${key}`);
  }
  if (!fromRecord) {
    for (const key of DERIVED_FIELDS) {
      if (raw[key] !== undefined) problems.push(`${key} 是派生字段，不能写在人工来源层（由 makeApiPlan 算出来）`);
    }
  }

  const resolved = providers.resolveProvider(raw.provider, table);
  if (!resolved) {
    problems.push(raw.provider
      ? `provider「${raw.provider}」未在 providers.json 登记（建议 key：${providers.suggestProviderSlug(raw.provider)}）`
      : 'provider 缺失');
  }
  const provider = resolved ? resolved.key : B.normalizePlanName(raw.provider);

  const kind = raw.kind === null || raw.kind === undefined ? API_KIND : raw.kind;
  if (kind !== API_KIND) problems.push(`kind 非法(${kind})：api-plans.json 只接受 ${API_KIND}`);

  const planName = B.normalizePlanName(raw.planName);
  if (!planName) problems.push('planName 缺失或为空');
  else if (planName.length > B.MAX_PLAN_NAME) {
    problems.push(`planName 超过 ${B.MAX_PLAN_NAME} 字（${planName.length} 字）—— 不静默截断`);
  } else if (planName !== raw.planName) {
    problems.push(`planName 不是规范形态（NFKC/折叠空白/去首尾空白后是「${planName}」）`);
  }

  const channel = raw.channel === null || raw.channel === undefined ? 'standard' : raw.channel;
  if (!API_CHANNELS.includes(channel)) {
    problems.push(`channel 非法(${raw.channel})：只接受 ${API_CHANNELS.join(' / ')}`);
  }

  const officialUrl = strictUrl(raw.officialUrl, 'officialUrl', problems, { required: true });
  const sourceUrl = raw.sourceUrl === null || raw.sourceUrl === undefined
    ? officialUrl
    : strictUrl(raw.sourceUrl, 'sourceUrl', problems, { required: true });

  const source = B.PLAN_SOURCE_TYPES[raw.source] ? raw.source : null;
  if (!source) {
    problems.push(`source 非法(${raw.source})：只接受 ${Object.keys(B.PLAN_SOURCE_TYPES).join(' / ')}（第三方对比站不得作为生产事实来源）`);
  }

  const region = REGIONS.includes(raw.region) ? raw.region : null;
  if (!region) problems.push(`region 非法(${raw.region})：只接受 ${REGIONS.join(' / ')}`);

  const pricing = normalizePricing(raw.pricing, problems);
  const models = normalizeModels(raw.models, problems);
  const freeTier = normalizeFreeTier(raw.freeTier, problems, models);
  const limits = normalizeLimits(raw.limits, problems, models);
  const credits = normalizeCredits(raw.credits, problems);
  const restrictions = B.normalizeRestrictions(raw.restrictions, problems);

  // 单位与价格的一致性：有 token 价就必须有合法单位；一个 token 价都没有时单位必须是 null
  if (pricing && models) {
    const hasTokenRate = models.some(entry => TOKEN_RATE_KEYS.some(key => entry.rates[key] !== null));
    if (hasTokenRate && !pricing.unit) {
      problems.push('pricing.unit 缺失：有 token 单价就必须显式声明单位（否则读者不知道那个数字是每千还是每百万）');
    }
    if (hasTokenRate && !pricing.currency) {
      problems.push('pricing.currency 缺失：有价格就必须有币种');
    }
    if (!hasTokenRate && pricing.unit) {
      problems.push('pricing.unit 不能声明：本记录没有任何 token 单价（单位只描述 token 维度的数字）');
    }
  }

  const firstSeen = normalizeDate(raw.firstSeen);
  const lastSeen = normalizeDate(raw.lastSeen);
  const verifiedAt = normalizeDate(raw.verifiedAt);
  if (!firstSeen) problems.push('firstSeen 缺失或非法（规范形态 YYYY-MM-DD）');
  if (!lastSeen) problems.push('lastSeen 缺失或非法（同上）');
  if (!verifiedAt) problems.push('verifiedAt 缺失或非法（同上）');
  if (raw.verified !== true) {
    problems.push('verified 必须是 true —— 每一条都是人工对照官方页核过的；没核过就不该收进来');
  }
  problems.push(...B.dateProblems({ firstSeen, lastSeen, verifiedAt, today }));

  // 引文：字段白名单要等模型归一完才能展开
  const evidenceFields = apiEvidenceFieldsOf({ models });
  const evidence = provenance.normalizeEvidence(raw.evidence, { today, fields: evidenceFields });
  if (!evidence) {
    problems.push(`evidence 缺失：每条 API 计费记录至少要有一条来自官方页的原文引文`
      + `（字段只能取 ${evidenceFields.join(' / ')}）`);
  }
  // 证据绑定判据（§10.1–10.3）：引文 ↔ 数字（维度 / 顺序）与单位见证。放在归一之后 ——
  // 它们看的是**归一后的引文**，与页面、订阅源读到的是同一份。
  problems.push(...evidenceBindingProblems({ models, evidence, pricing }));

  if (problems.length) return { ok: false, plan: null, problems };

  const plan = {
    id: makeApiPlanId({ provider, planName, channel }),
    kind: API_KIND,
    provider,
    planName,
    channel,
    officialUrl,
    source,
    sourceUrl,
    region,
    pricing,
    models,
    freeTier,
    limits,
    credits,
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
/* 校验                                                                */
/* ------------------------------------------------------------------ */

function apiPlanDiffs(stored, rebuilt) {
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

function clip(text) {
  const value = String(text);
  return value.length > 60 ? `${value.slice(0, 57)}…` : value;
}

function validateApiPlan(plan, index = 0) {
  const errors = [];
  const where = `#${index} ${plan && plan.planName ? `${plan.provider}/${plan.planName}` : '(no planName)'}`;
  if (!plainObject(plan)) return { ok: false, errors: [`${where}: 不是对象`] };
  if (!/^[0-9a-f]{12}$/.test(String(plan.id || ''))) errors.push(`${where}: id 非法`);

  const result = makeApiPlan(plan, { fromRecord: true, today: todayCN() });
  result.problems.forEach(problem => errors.push(`${where}: ${problem}`));

  if (result.ok) {
    const diffs = apiPlanDiffs(plan, result.plan);
    diffs.slice(0, 6).forEach(diff => {
      errors.push(`${where}: 字段 ${diff.field} 与归一结果不一致（盘上 ${clip(diff.stored)}，规范 ${clip(diff.canonical)}）`
        + (diff.field === 'derivedMetrics' ? ' —— 派生指标只能由 deriveApiMetrics() 算出来（本阶段恒为 {}）' : '')
        + (diff.field === 'id' ? ' —— id 只能由 makeApiPlanId() 算出来（改价/增删模型不得换 id）' : ''));
    });
    if (diffs.length > 6) errors.push(`${where}: 另有 ${diffs.length - 6} 处与归一结果不一致`);
  }
  return { ok: errors.length === 0, errors };
}

function canonicalUpdatedAt(plans) {
  return B.canonicalUpdatedAt(plans);
}

function validateApiPlansStore(store, { providerTable = null, vendorSlugs = null } = {}) {
  const errors = [];
  const table = providerTable || providers.load().table;
  const slugs = vendorSlugs || providers.loadVendorSlugs();

  if (!plainObject(store)) return { ok: false, errors: ['api-plans.json 必须是一个对象'], plans: [] };
  if (store.schemaVersion !== API_PLAN_SCHEMA_VERSION) {
    errors.push(`api-plans.json schemaVersion 应为 ${API_PLAN_SCHEMA_VERSION}，实际 ${store.schemaVersion}`);
  }
  if (!Array.isArray(store.plans)) return { ok: false, errors: [...errors, 'api-plans.json plans 必须是数组'], plans: [] };
  if (typeof store.count !== 'number') errors.push('api-plans.json count 缺失');
  else if (store.count !== store.plans.length) {
    errors.push(`api-plans.json count(${store.count}) 与 plans 长度(${store.plans.length}) 不一致`);
  }
  if (store.plans.length > MAX_API_PLANS) errors.push(`api-plans.json 条数 ${store.plans.length} 超过上限 ${MAX_API_PLANS}`);

  const expectedUpdatedAt = canonicalUpdatedAt(store.plans);
  if (store.updatedAt !== expectedUpdatedAt) {
    errors.push(`api-plans.json updatedAt 应为「${expectedUpdatedAt}」（= 全部 lastSeen 的最大值，不读墙上时钟），实际「${store.updatedAt}」`);
  }

  const ids = new Map();
  const identities = new Map();
  store.plans.forEach((plan, index) => {
    validateApiPlan(plan, index).errors.forEach(error => errors.push(error));
    const id = plan && plan.id;
    if (id) {
      if (ids.has(id)) errors.push(`api-plans.json 重复 id: ${id}`);
      else ids.set(id, plan.planName);
    }
    if (plan && plan.provider && plan.channel) {
      const identity = apiIdentityKeyOf(plan);
      if (identities.has(identity)) {
        errors.push(`api-plans.json 身份重复：${identity} —— 同 provider + 同 planName + 同 channel 只能有一条`);
      } else identities.set(identity, plan.planName);
    }
  });

  const canonical = store.plans.map(apiIdentityKeyOf);
  const sorted = [...canonical].sort();
  if (JSON.stringify(canonical) !== JSON.stringify(sorted)) {
    errors.push('api-plans.json 的记录顺序不是规范序（应按 api|provider|planName|channel 升序）');
  }

  providers.validateProviderTable(table).forEach(problem => errors.push(problem));
  providers.validateSlugAgreement(table, slugs).forEach(problem => errors.push(problem));

  return { ok: errors.length === 0, errors, plans: store.plans };
}

/* ------------------------------------------------------------------ */
/* 读写与重建                                                          */
/* ------------------------------------------------------------------ */

function loadApiPlans(file = API_PLANS_FILE) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function loadCuratedApiPlans({ file = CURATED_API_PLANS_FILE, providerTable = null, today = null } = {}) {
  if (!fs.existsSync(file)) {
    return {
      payload: null,
      plans: [],
      problems: [{ index: null, planName: null, reason: `curated_api_plans.json 不存在: ${path.relative(path.join(__dirname, '..', '..'), file)}` }],
      evidenceDropped: []
    };
  }
  let list;
  try {
    list = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`curated_api_plans.json 解析失败: ${error.message}`);
  }
  if (!Array.isArray(list)) throw new Error('curated_api_plans.json 必须是数组');

  const { payload, problems, items } = buildApiStore({ curated: list, providerTable, today });

  const evidenceDropped = [];
  for (const item of items) {
    if (!item.plan) continue;
    provenance.auditEvidence(item.raw.evidence, item.plan.evidence, {
      today: today || todayCN(),
      fields: apiEvidenceFieldsOf(item.plan)
    }).forEach(dropped => evidenceDropped.push({
      index: item.index,
      planName: item.plan.planName,
      reason: dropped.reason
    }));
  }

  return { payload, plans: payload.plans, problems, evidenceDropped };
}

function buildApiStore({ curated = [], providerTable = null, today = null } = {}) {
  const problems = [];
  const items = [];
  const plans = [];

  curated.forEach((raw, index) => {
    const result = makeApiPlan(raw, { providers: providerTable, today });
    items.push({ index, raw: plainObject(raw) ? raw : {}, plan: result.plan, problems: result.problems });
    if (!result.ok) {
      result.problems.forEach(reason => problems.push({
        index,
        planName: (plainObject(raw) && raw.planName) || null,
        reason
      }));
      return;
    }
    plans.push(result.plan);
  });

  plans.sort((a, b) => {
    const ka = apiIdentityKeyOf(a);
    const kb = apiIdentityKeyOf(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });

  const seen = new Map();
  for (const plan of plans) {
    const identity = apiIdentityKeyOf(plan);
    if (seen.has(identity)) {
      problems.push({
        index: null,
        planName: plan.planName,
        reason: `与「${seen.get(identity)}」身份重复（同 provider + planName + channel）`
      });
    } else seen.set(identity, plan.planName);
  }

  return {
    payload: {
      schemaVersion: API_PLAN_SCHEMA_VERSION,
      updatedAt: canonicalUpdatedAt(plans),
      count: plans.length,
      plans
    },
    problems,
    items
  };
}

function assertValidStore(store, options = {}) {
  const result = validateApiPlansStore(store, options);
  if (!result.ok) {
    const error = new Error(`api-plans 数据校验失败（${result.errors.length} 项）:\n  - ${result.errors.slice(0, 20).join('\n  - ')}`);
    error.validationErrors = result.errors;
    throw error;
  }
  return true;
}

function writeApiPlans(payload, file = API_PLANS_FILE) {
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return payload;
}

/* ------------------------------------------------------------------ */
/* 统计                                                                */
/* ------------------------------------------------------------------ */

function summarize(store) {
  const plans = (store && Array.isArray(store.plans)) ? store.plans : [];
  const byUnit = {};
  const byChannel = {};
  const providerKeys = new Set();
  let models = 0;
  let withFreeTier = 0;
  let freeTierNone = 0;
  let withCredits = 0;
  let withLimits = 0;
  let mediaRates = 0;
  let cn = 0;
  let global = 0;
  let evidence = 0;

  for (const plan of plans) {
    if (!plan) continue;
    providerKeys.add(plan.provider);
    if (plan.region === 'cn') cn++; else if (plan.region === 'global') global++;
    byChannel[plan.channel] = (byChannel[plan.channel] || 0) + 1;
    const unit = plan.pricing && plan.pricing.unit;
    byUnit[unit || '(无 token 单价)'] = (byUnit[unit || '(无 token 单价)'] || 0) + 1;
    models += Array.isArray(plan.models) ? plan.models.length : 0;
    if (Array.isArray(plan.models)) {
      mediaRates += plan.models.reduce((sum, entry) => sum + ((entry.mediaRates || []).length), 0);
    }
    if (plan.freeTier) {
      withFreeTier++;
      if (plan.freeTier.type === 'none') freeTierNone++;
    }
    if (plan.credits) withCredits++;
    if (plan.limits) withLimits++;
    evidence += Array.isArray(plan.evidence) ? plan.evidence.length : 0;
  }

  return {
    total: plans.length,
    providers: providerKeys.size,
    cn,
    global,
    models,
    byUnit,
    byChannel,
    withFreeTier,
    freeTierNone,
    withCredits,
    withLimits,
    mediaRates,
    evidence,
    updatedAt: (store && store.updatedAt) || null
  };
}

module.exports = {
  API_PLANS_FILE,
  CURATED_API_PLANS_FILE,
  API_PLAN_SCHEMA_VERSION,
  API_KIND,
  API_CHANNELS,
  API_CHANNEL_LABEL,
  API_UNITS,
  API_UNIT_LABEL,
  API_WORDING,
  API_EVIDENCE_FIELDS,
  TOKEN_RATE_KEYS,
  TOKEN_RATE_LABEL,
  MEDIA_RATE_KINDS,
  MEDIA_RATE_UNITS,
  MEDIA_RATE_LABEL,
  MEDIA_RATE_UNIT_LABEL,
  MODEL_VARIANTS,
  MODEL_VARIANT_LABEL,
  FREE_TIER_TYPES,
  FREE_TIER_STABILITY,
  FREE_TIER_STABILITY_LABEL,
  FREE_TIER_CONVERSION_TRISTATE,
  FREE_TIER_RECURRING_PERIODS,
  FREE_TIER_CONDITION_RE,
  FREE_TIER_UNIT_LABEL,
  FREE_TIER_QUANTIFIED,
  FREE_TIER_AMOUNTLESS,
  FREE_TIER_DESCRIPTION_REQUIRED,
  FREE_TIER_PERIODS,
  LIMIT_KINDS,
  LIMIT_LABEL,
  CREDIT_UNITS,
  RECORD_FIELDS,
  INPUT_FIELDS,
  DERIVED_FIELDS,
  MODEL_FIELDS,
  MEDIA_RATE_FIELDS,
  FREE_TIER_FIELDS,
  LIMIT_FIELDS,
  CREDIT_FIELDS,
  PRICING_FIELDS,
  MAX_API_PLANS,
  MAX_MODELS,
  MAX_MEDIA_RATES,
  MAX_ALIASES,
  MAX_LIMITS,
  MAX_CREDITS,
  MAX_PRICE,
  MAX_RATE,
  MAX_MODEL_KEY,
  MAX_ALIAS,
  MODEL_KEY_RE,
  normalizeModelKey,
  modelEntryKeyOf,
  makeApiPlanId,
  apiIdentityKeyOf,
  deriveApiMetricsWithReason,
  derivedMetricsOf,
  apiEvidenceFieldsOf,
  // §10.1–10.3：证据绑定判据与它的两个纯助手（自测直接驱动它们，不靠"跑一遍构建看看"）
  evidenceBindingProblems,
  quoteIndexOfNumber,
  namedUnitOf,
  parseEvidenceBinding,
  UNIT_TOKEN_MILLION,
  UNIT_TOKEN_THOUSAND,
  makeApiPlan,
  apiPlanDiffs,
  validateApiPlan,
  validateApiPlansStore,
  canonicalUpdatedAt,
  loadApiPlans,
  loadCuratedApiPlans,
  buildApiStore,
  assertValidStore,
  writeApiPlans,
  summarize
};
