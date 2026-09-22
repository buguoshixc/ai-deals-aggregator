/**
 * deals.json v2 数据契约：构造、归一、校验。
 *
 * 所有写入 deals.json 的记录都必须经过 makeDeal()，并由 validateDeal() 校验通过。
 * 任何采集器不得自行拼装字段。
 */

const crypto = require('crypto');
const { CATEGORIES, mapCategory } = require('./categories');

const SCHEMA_VERSION = 2;

const REGIONS = ['cn', 'global'];
const TYPES = ['deal', 'tool'];
const PRICING_MODELS = ['free', 'freemium', 'paid', 'trial', 'credits'];

/** 卡片上展示的特性标签：最多 3 个，每个最多 20 字 */
const MAX_FEATURES = 3;
const MAX_FEATURE_LENGTH = 20;
/** 价格阶梯行（如「免费 → $20/月 Pro」）的最大长度 */
const MAX_PRICE_LINE_LENGTH = 60;

/** 垃圾数据特征（CSS 残片、导航文本、模板残留） */
const GARBAGE_PATTERNS = [
  /\.css-[a-z0-9]+/i,
  /all:\s*unset/i,
  /box-sizing\s*:/i,
  /-webkit-/i,
  /^\s*[.#][\w-]+\s*\{/,
  /^\s*[.#][\w-]+\s*$/,
  /jump to the category/i,
  /^\s*resources(educational|get inspired|\s|$)/i,
  /^\s*(skip to|toggle navigation|menu)\b/i,
  /^\s*[{}\[\];]+\s*$/,
  // 纯受众词条：不是产品/优惠，来自折扣页的"分类指引"表
  /^\s*(students?|teachers?|educators?|nonprofits?|startups?|veterans?|audience|enterprises?|individuals?)\s*$/i,
  /^\s*(students?|teachers?|educators?|nonprofits?|startups?|veterans?)\s*[&,，、].{0,40}$/i,
  /^\s*(学生|教师|教育工作者|非营利组织|初创企业|受众)\s*$/
];

/** 真实优惠信号（用于 type:"deal" 判定，保守策略） */
const DISCOUNT_PATTERNS = [
  /\d+\s*%\s*(off|discount|折扣)/i,
  /(discount|promo|deal|coupon|voucher)\b/i,
  /折扣|打折|限时|优惠券|优惠价|立减|特惠/,
  /免费额度|免费试用|免费领取|新用户.*免费|首月.*免费/,
  // 中文"免费模型/免费开放"这类表述（"免费增值"已在上面被剥离）
  /免费(的)?(大模型|模型|API|接口|使用|调用|开放)|永久免费|完全免费|长期免费|彻底免费/,
  /赠送|免费领取|免费领取额度|新用户.*(赠送|领取)/,
  /(free)\s+(\d+\s*)?(credits?|tokens?|quota|trial|months?|year)/i,
  /\bcredits?\b.*\b(free|bonus|grant)/i,
  /(students?|teachers?|educators?|nonprofits?|veterans?|startups?)\b[^.]{0,40}\b(free|discount|save|off)\b/i,
  /(free|discount|save|off)\b[^.]{0,40}\b(students?|teachers?|educators?|nonprofits?|veterans?)\b/i,
  /学生|教师|教育|非营利|公益|公益组织|在校/
];

/** 纯定价层级词：这些不是"优惠"，先剥离再判断 */
const PRICING_TIER_WORDS = [
  /免费增值/g,
  /\bfreemium\b/gi,
  /^\s*免费\s*$/,
  /^\s*付费\s*$/,
  /^\s*free\s*$/i,
  /^\s*paid\s*$/i,
  /^\s*订阅\s*$/,
  /^\s*subscription\s*$/i,
  /^\s*查看(定价)?\s*$/,
  /^\s*view (details|pricing)\s*$/i,
  /^\s*see details\s*$/i,
  /^\s*free tier available\s*$/i
];

const TRACKING_PARAM = /^(utm_|ref|referrer|aff|affiliate|fbclid|gclid|mc_|_hs|spm|from|src|source|share_)/i;

/* ------------------------------------------------------------------ */
/* 时间工具：全站统一使用 Asia/Shanghai（UTC+8，无夏令时）              */
/* ------------------------------------------------------------------ */

function shiftCN(date = new Date()) {
  return new Date(date.getTime() + 8 * 3600 * 1000);
}

/** YYYY-MM-DD（北京时间） */
function todayCN(date = new Date()) {
  return shiftCN(date).toISOString().slice(0, 10);
}

/** ISO8601 带 +08:00 偏移 */
function nowCN(date = new Date()) {
  return shiftCN(date).toISOString().replace(/\.\d{3}Z$/, '+08:00');
}

/** 把各种日期写法归一为 YYYY-MM-DD，失败返回 null */
function normalizeDate(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  let m = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return fmtDate(m[1], m[2], m[3]);

  m = raw.match(/^(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?$/);
  if (m) return fmtDate(m[1], m[2], m[3]);

  m = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return fmtDate(m[1], m[2], m[3]);

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return shiftCN(parsed).toISOString().slice(0, 10);
  }
  return null;
}

function fmtDate(y, mo, d) {
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/* ------------------------------------------------------------------ */
/* 文本工具                                                           */
/* ------------------------------------------------------------------ */

/** 清洗文本：去零宽字符、压缩空白、去截断残尾、限长 */
function cleanText(value, maxLength = 200) {
  if (value === null || value === undefined) return '';
  let text = String(value)
    .replace(/[\u200b-\u200f\u2028-\u202e\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // 去掉 "…" / "..." 结尾的截断残尾
  text = text.replace(/(\.\.\.|…)\s*$/, '').trim();

  if (maxLength && text.length > maxLength) {
    text = text.slice(0, maxLength).trim();
  }
  return text;
}

/**
 * 卡片的特性标签：最多 3 个、每个最多 20 字、去重、过滤垃圾。
 *
 * 刻意「只清洗不外推」：自动采集条目没有可信的标签来源，这里不会从 description
 * 里切分或生成标签——上游不提供就返回 null，卡片渲染时回退到 discountInfo。
 */
function normalizeFeatures(value) {
  if (!Array.isArray(value)) return null;
  const out = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const text = cleanText(item, MAX_FEATURE_LENGTH);
    if (!text || isGarbage(text)) continue;
    if (!out.includes(text)) out.push(text);
    if (out.length >= MAX_FEATURES) break;
  }
  return out.length ? out : null;
}

/**
 * 人工核验日期（YYYY-MM-DD）：含义是「最后一次对照官方页确认此优惠成立的日期」。
 * 仅人工策展条目填写；自动采集条目没有人工核验动作，一律为 null。
 * 未来日期视为非法——它一定是数据错误。
 */
function normalizeVerifiedAt(value, now) {
  const date = normalizeDate(value);
  if (!date) return null;
  if (date > todayCN(now)) return null;
  return date;
}

/** 去掉追踪参数 */
function stripTracking(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    const drop = [];
    for (const key of u.searchParams.keys()) {
      if (TRACKING_PARAM.test(key)) drop.push(key);
    }
    drop.forEach(k => u.searchParams.delete(k));
    u.hash = '';
    return u.toString();
  } catch (e) {
    return null;
  }
}

/** 仅允许 http/https */
function normalizeUrl(url) {
  if (!url) return null;
  let raw = String(url).trim();
  if (!raw) return null;
  if (raw.startsWith('//')) raw = `https:${raw}`;
  if (!/^https?:\/\//i.test(raw)) {
    if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(raw)) raw = `https://${raw}`;
    else return null;
  }
  return stripTracking(raw);
}

function isGarbage(text) {
  const t = String(text || '');
  if (!t || t.length < 3) return true;
  return GARBAGE_PATTERNS.some(re => re.test(t));
}

/** 否定语境：句子里明说"没有优惠"时，不能因为出现 discount/offer 字样就判为优惠 */
const NEGATION_PATTERNS = [
  /\bno\s+(standing\s+|public\s+|current\s+|official\s+)?[\w\s]{0,30}\b(discount|offer|deal|promotion|promo)s?\b/i,
  /\b(not|never|no longer)\b[^.]{0,40}\b(available|offered|provide[sd]?|applicable)\b/i,
  /\bno\s+(free|discount|offer|deal|promotion)\b/i,
  /\bnone\s+(of|are|is)\b[^.]{0,30}\b(discount|offer|deal)/i,
  /(未|不|没有|暂无|无)[^。]{0,14}(优惠|折扣|活动|免费额度)/
];

/** 判定是否携带真实优惠信号（先剔除否定句） */
function hasDiscountSignal(text) {
  if (!text) return false;
  let probe = String(text);
  for (const re of PRICING_TIER_WORDS) probe = probe.replace(re, ' ');

  const sentences = probe
    .split(/[。；;!?！？]+|\.\s+/)
    .map(s => s.trim())
    .filter(Boolean);
  const affirmative = sentences.filter(s => !NEGATION_PATTERNS.some(re => re.test(s)));
  probe = affirmative.join('。').trim();

  if (!probe || probe.length < 2) return false;
  return DISCOUNT_PATTERNS.some(re => re.test(probe));
}

const PRICING_MAP = [
  [/免费增值|freemium/i, 'freemium'],
  [/免费试用|free trial|试用/i, 'trial'],
  [/免费额度|赠送额度|免费|credits|额度/i, 'free'],
  [/^付费$|^paid$|付费|订阅|subscription/i, 'paid']
];

function inferPricingModel(raw) {
  const text = cleanText(raw, 60);
  if (!text) return null;
  for (const [re, model] of PRICING_MAP) {
    if (re.test(text)) return model;
  }
  return null;
}

/** 稳定 id：vendor + title + url */
function makeId({ vendor, title, url }) {
  const basis = `${(vendor || '').toLowerCase()}|${(title || '').toLowerCase()}|${(url || '').toLowerCase()}`;
  return crypto.createHash('sha1').update(basis).digest('hex').slice(0, 12);
}

/* ------------------------------------------------------------------ */
/* 构造与校验                                                          */
/* ------------------------------------------------------------------ */

/**
 * 构造一条合规记录。传入原始（可能是旧格式）字段，输出 v2 记录。
 * @param {object} raw
 * @param {object} opts { source, region, sourceUrl, now }
 * @returns {object|null} 无法构造时返回 null
 */
function makeDeal(raw = {}, opts = {}) {
  const title = cleanText(raw.title, 150);
  if (!title || isGarbage(title)) return null;

  const url = normalizeUrl(raw.url) || normalizeUrl(raw.sourceUrl) || normalizeUrl(opts.sourceUrl);
  if (!url) return null;

  const description = cleanText(raw.description, 200);
  if (description && isGarbage(description)) {
    // 描述是垃圾但标题正常：保留记录、丢弃描述
  }

  const vendor = cleanText(raw.vendor || opts.vendor || inferVendor(title), 60);
  const source = cleanText(raw.source || opts.source, 40) || 'Unknown';
  const region = REGIONS.includes(raw.region) ? raw.region : (REGIONS.includes(opts.region) ? opts.region : 'global');
  const sourceUrl = normalizeUrl(raw.sourceUrl || opts.sourceUrl) || null;

  // discountInfo：显式给定优先，否则从旧 discount 字段提炼
  let discountInfo = cleanText(raw.discountInfo, 240) || null;
  let pricingModel = PRICING_MODELS.includes(raw.pricingModel)
    ? raw.pricingModel
    : inferPricingModel(raw.pricingModel);

  if (!discountInfo && raw.discount) {
    const legacy = cleanText(raw.discount, 240);
    if (legacy && hasDiscountSignal(legacy)) {
      discountInfo = legacy;
    } else if (!pricingModel) {
      pricingModel = inferPricingModel(legacy);
    }
  }

  // type：默认由优惠信号推导；人工策展数据可以用 trustType 直接指定
  let type;
  const trustedType = opts.trustType === true && TYPES.includes(raw.type);
  if (trustedType) {
    type = raw.type;
  } else {
    type = (discountInfo && hasDiscountSignal(discountInfo)) ? 'deal' : 'tool';
  }
  if (type === 'deal' && !discountInfo) type = 'tool';

  const today = todayCN(opts.now);
  const expiresAt = normalizeDate(raw.expiresAt || raw.endDate || raw.expiry);
  const firstSeen = normalizeDate(raw.firstSeen || raw.date) || today;
  const lastSeen = normalizeDate(raw.lastSeen) || today;

  const deal = {
    id: raw.id && /^[0-9a-f]{12}$/.test(raw.id) ? raw.id : makeId({ vendor, title, url }),
    title,
    vendor,
    url,
    source,
    sourceUrl: sourceUrl && sourceUrl !== url ? sourceUrl : null,
    region,
    type,
    discountInfo: type === 'deal' ? discountInfo : (discountInfo || null),
    pricingModel: pricingModel || null,
    priceLine: cleanText(raw.priceLine, MAX_PRICE_LINE_LENGTH) || null,
    features: normalizeFeatures(raw.features),
    category: mapCategory({ category: raw.category, title, description }),
    description: (!description || isGarbage(description)) ? '' : description,
    eligibility: cleanText(raw.eligibility, 120) || null,
    validity: cleanText(raw.validity, 60) || null,
    expiresAt,
    firstSeen,
    lastSeen,
    verified: raw.verified === true,
    verifiedAt: raw.verified === true ? normalizeVerifiedAt(raw.verifiedAt, opts.now) : null
  };

  return deal;
}

/** 从标题粗略推断厂商名 */
function inferVendor(title) {
  const cleaned = String(title).split(/[（(·|/—-]/)[0].trim();
  return cleaned.split(/\s+/).slice(0, 2).join(' ') || cleaned;
}

/**
 * 校验单条记录。
 * @returns {{ok:boolean, errors:string[]}}
 */
function validateDeal(deal, index = 0) {
  const errors = [];
  const where = `#${index} ${deal && deal.title ? deal.title : '(no title)'}`;

  if (!deal || typeof deal !== 'object') return { ok: false, errors: [`${where}: 不是对象`] };

  if (!/^[0-9a-f]{12}$/.test(String(deal.id || ''))) errors.push(`${where}: id 非法`);
  if (!deal.title || cleanText(deal.title, 150) !== deal.title) errors.push(`${where}: title 缺失或未清洗`);
  if (isGarbage(deal.title)) errors.push(`${where}: title 命中垃圾特征`);
  if (!deal.url || !/^https?:\/\//i.test(deal.url)) errors.push(`${where}: url 必须是 http(s)`);
  else if (stripTracking(deal.url) !== deal.url) errors.push(`${where}: url 含追踪参数`);
  if (!REGIONS.includes(deal.region)) errors.push(`${where}: region 非法(${deal.region})`);
  if (!TYPES.includes(deal.type)) errors.push(`${where}: type 非法(${deal.type})`);
  if (!CATEGORIES.includes(deal.category)) errors.push(`${where}: category 不在枚举内(${deal.category})`);
  if (deal.pricingModel !== null && !PRICING_MODELS.includes(deal.pricingModel)) {
    errors.push(`${where}: pricingModel 非法(${deal.pricingModel})`);
  }
  if (deal.priceLine !== null && deal.priceLine !== undefined) {
    if (typeof deal.priceLine !== 'string') errors.push(`${where}: priceLine 必须是字符串`);
    else if (!deal.priceLine.trim() || deal.priceLine.length > MAX_PRICE_LINE_LENGTH) {
      errors.push(`${where}: priceLine 为空或超过 ${MAX_PRICE_LINE_LENGTH} 字`);
    } else if (isGarbage(deal.priceLine)) {
      errors.push(`${where}: priceLine 命中垃圾特征`);
    }
  }
  if (deal.features !== null && deal.features !== undefined) {
    if (!Array.isArray(deal.features)) {
      errors.push(`${where}: features 必须是数组`);
    } else if (!deal.features.length) {
      errors.push(`${where}: features 为空数组（无标签时应为 null）`);
    } else if (deal.features.length > MAX_FEATURES) {
      errors.push(`${where}: features 超过 ${MAX_FEATURES} 个`);
    } else {
      deal.features.forEach((feature, i) => {
        if (typeof feature !== 'string') errors.push(`${where}: features[${i}] 必须是字符串`);
        else if (!feature.trim()) errors.push(`${where}: features[${i}] 为空`);
        else if (feature.length > MAX_FEATURE_LENGTH) {
          errors.push(`${where}: features[${i}] 超过 ${MAX_FEATURE_LENGTH} 字`);
        } else if (isGarbage(feature)) errors.push(`${where}: features[${i}] 命中垃圾特征`);
      });
      if (new Set(deal.features).size !== deal.features.length) {
        errors.push(`${where}: features 存在重复项`);
      }
    }
  }
  if (deal.verifiedAt !== null && deal.verifiedAt !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(deal.verifiedAt))) {
      errors.push(`${where}: verifiedAt 格式非法`);
    } else if (String(deal.verifiedAt) > todayCN()) {
      errors.push(`${where}: verifiedAt 是未来日期(${deal.verifiedAt})`);
    }
  }
  // 核验日期只对人工核验条目有意义：未核验却带日期，说明来源搞错了
  if (deal.verified !== true && deal.verifiedAt) {
    errors.push(`${where}: verified 非 true 却带 verifiedAt`);
  }
  if (deal.type === 'deal' && !deal.discountInfo) errors.push(`${where}: type=deal 但 discountInfo 为空`);
  if (deal.discountInfo && isGarbage(deal.discountInfo)) errors.push(`${where}: discountInfo 命中垃圾特征`);
  if (deal.expiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(deal.expiresAt)) errors.push(`${where}: expiresAt 格式非法`);
  if (deal.validity !== null && deal.validity !== undefined && typeof deal.validity !== 'string') {
    errors.push(`${where}: validity 必须是字符串`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(deal.firstSeen || ''))) errors.push(`${where}: firstSeen 格式非法`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(deal.lastSeen || ''))) errors.push(`${where}: lastSeen 格式非法`);
  if (typeof deal.verified !== 'boolean') errors.push(`${where}: verified 必须是布尔`);
  if (deal.vendor !== undefined && typeof deal.vendor !== 'string') errors.push(`${where}: vendor 必须是字符串`);

  const allowed = new Set([
    'id', 'title', 'vendor', 'url', 'source', 'sourceUrl', 'region', 'type',
    'discountInfo', 'pricingModel', 'priceLine', 'features', 'category', 'description',
    'eligibility', 'validity', 'expiresAt', 'firstSeen', 'lastSeen', 'verified', 'verifiedAt'
  ]);
  for (const key of Object.keys(deal)) {
    if (!allowed.has(key)) errors.push(`${where}: 未知字段 ${key}`);
  }

  return { ok: errors.length === 0, errors };
}

module.exports = {
  SCHEMA_VERSION,
  REGIONS,
  TYPES,
  PRICING_MODELS,
  MAX_FEATURES,
  MAX_FEATURE_LENGTH,
  MAX_PRICE_LINE_LENGTH,
  GARBAGE_PATTERNS,
  todayCN,
  nowCN,
  normalizeDate,
  cleanText,
  normalizeFeatures,
  normalizeVerifiedAt,
  normalizeUrl,
  stripTracking,
  isGarbage,
  hasDiscountSignal,
  inferPricingModel,
  makeId,
  makeDeal,
  validateDeal
};
