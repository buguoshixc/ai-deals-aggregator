/**
 * v1.3 evidence / provenance：把「这条优惠是谁给的、多久没重新见到、最近一次成功采集在何时、
 * 依据是什么」变成**可复核的客观事实**，而不是一句本站自发的有效性结论。
 *
 * ## 为什么要有这个模块（而不是把字段直接塞进 schema.js）
 *
 * 这一层有三类东西，寿命完全不同，混在一起就会互相污染：
 *
 * | 层 | 例子 | 寿命 | 落在哪 |
 * |---|---|---|---|
 * | A 记录事实 | url / source / sourceUrl / firstSeen / lastSeen / provenance | 跟着记录走 | 源 `deals.json` |
 * | B 官方引文 `evidence` | 逐条 ≤200 字的官方原文片段 | 人工写、可长期保存 | 源 `deals.json` |
 * | C 采集心跳派生 `sourceFacts` | 采集方式 / 最近成功采集时间 / 来源类型 | **每次采集都会变**，且是「来源」的属性而不是「记录」的属性 | 只进 `dist/deals.json` |
 *
 * C 之所以必须留在构建期派生：`lastSuccessAt` 每轮采集都对每个来源刷新一次，
 * 若把它写进源数据，134 条记录每天全会变一行 —— diff 里再也看不出「哪条优惠真的变了」，
 * 而 `check-reproducible` 的「重放产出同一份文件」也会跟着变成「重放产出同一份文件，
 * 前提是采集恰好没发生」。心跳的唯一权威是 `scripts/data/source-health.json`（已发布到线上），
 * 这里只做一次 join。
 *
 * ## 三条纪律（都有断言盯着）
 *
 * 1. **引文只作短证据，绝不复制全文**：数量、单条长度、全库预算三重上限；
 *    超长的引文**拒绝**而不是截断 —— 引文是「官方原话」，截断过的原话就是伪造。
 * 2. **缺席要分四种状态**：known / na（不适用，例如人工策展没有采集器）/
 *    unknown（本该有却匹配不到）/ unavailable（本轮构建根本没有心跳数据）。
 *    把「没查到」和「本来就没有这回事」混成一句「暂无」，正是 v1.3 要修的形态。
 * 3. **不给自己盖章**：本模块只输出事实，不输出「已核验 / 100% 有效」这类结论。
 *    `STAMP_PATTERNS` 是渲染层的红线探针清单。
 */

const AGGREGATOR_HOSTS = ['layer3labs.io', 'futuretools.io', 'futurepedia.io', 'aitools.fyi'];

/** 一条引文的上限：超过就拒收（不截断，见文件头纪律 1） */
const MAX_EVIDENCE_QUOTE_LENGTH = 200;
/** 一条优惠最多留几条引文 */
const MAX_EVIDENCE_ITEMS = 3;
/** 全库引文字符预算（validate 里按这个报错）。当前 0 条引文，离上限很远 */
const EVIDENCE_TOTAL_BUDGET_CHARS = 12000;
/** 引文字符 / deals.json 字节 的比例上限（双保险：条数与字数各自也可能悄悄膨胀） */
const EVIDENCE_BUDGET_RATIO = 0.05;

/** 引文可以绑定的字段：内容字段 + v1.1 六字段。引文必须服务于某个具体断言 */
const EVIDENCE_FIELDS = [
  'discountInfo', 'eligibility', 'validity', 'priceLine', 'expiresAt',
  'audience', 'benefitType', 'eligibilityDetail', 'claimRequirements', 'availability'
];

const EVIDENCE_LANGS = ['zh', 'en', 'other'];

/**
 * 数据来源类型：**声明表**，不是启发式。
 *
 * 为什么不做 host 判断：`aitools.fyi` 这一路采集器自己就是目录站，但它解析到官方页后
 * **不写 sourceUrl**（15 条里 0 条有 sourceUrl），按 host 判会把它们误判成「官方直采」。
 * 这条信息只有「这个采集器本来在读谁」说得清，所以在这里声明一次，
 * 并由 `validate --strict` 的守卫盯住「每条记录 source 都能在表里找到」——
 * 将来新增采集器忘了登记，会在 CI 里红，而不是在页面上静默显示「未知」。
 */
const SOURCE_TYPES = {
  // 厂商一方页面（官方文档 / 定价 / 活动页）
  '百度千帆': 'official',
  '阿里云百炼': 'official',
  '智谱AI': 'official',
  '智谱AI活动页': 'official',
  '火山方舟': 'official',
  // 第三方目录站：线索来自它们，落地页已解析到厂商官方页
  'aitools.fyi': 'directory',
  'Futuretools': 'directory',
  'Futurepedia': 'directory',
  'Layer3Labs': 'directory',
  // 人工策展
  'Curated': 'curated',
  'Curated-CN': 'curated'
};

/** 人工策展来源（与 store.js 的 TRUSTED_SOURCES 同一口径，这里只用于展示分类） */
const CURATED_SOURCES = ['Curated', 'Curated-CN'];

/**
 * 本站**不允许**出现在证据块里的自封结论。
 * 与 index.html 的 SOURCE_WORDING 无关 —— 这是渲染红线的探针清单，
 * 由 `validate --strict` 的 `checkProvenanceGuard()` 与 `provenance-selftest` 一起跑。
 */
const STAMP_PATTERNS = [
  { re: /已核验/, why: '「已核验」是本站自发的核验章（2026-09-27 整条撤掉过）' },
  { re: /100\s*%\s*(有效|可用|成功)/, why: '「100% 有效」是有效性承诺' },
  { re: /保证(有效|可用|成功|领取)/, why: '「保证可用」是有效性承诺' },
  { re: /永久有效/, why: '「永久有效」把「官方没写截止日」说成了确定结论' }
];

const EVIDENCE_FIELD_ORDER = EVIDENCE_FIELDS;

/* ------------------------------------------------------------------ */
/* 引文归一                                                             */
/* ------------------------------------------------------------------ */

/** 去零宽 / 控制字符、去 HTML 标签、压缩空白。**不截断**（截断过的原话不是原话） */
function cleanQuote(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/<[^>]*>/g, ' ')
    // 零宽与 BOM：肉眼看不见，却能让「看起来相同的两条引文」各自算一条
    .replace(/[\u200b-\u200f\u2060\ufeff]/g, '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hostOf(url) {
  try {
    return new URL(url).host.toLowerCase();
  } catch (error) {
    return null;
  }
}

/** 仅 http/https；与 schema.normalizeUrl 同一尺度（这里不 require schema，避免循环依赖） */
function normalizeHttpUrl(value) {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch (error) {
    return null;
  }
}

function isAggregatorUrl(url) {
  const host = hostOf(url);
  return Boolean(host) && AGGREGATOR_HOSTS.some(item => host === item || host.endsWith(`.${item}`));
}

/** `YYYY-MM-DD`，且不得晚于 today。today 由调用方给（这个模块不读系统时间） */
function normalizeCapturedAt(value, today) {
  const text = String(value === null || value === undefined ? '' : value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const at = new Date(`${text}T00:00:00Z`);
  if (!Number.isFinite(at.getTime())) return null;
  if (today && text > today) return null;
  return text;
}

/**
 * 归一单条引文。非法一律返回 null（构造期只清洗，`validateDeal` 与入口对账负责报错）。
 *
 * @param {object} raw
 * @param {{today?:string, fields?:string[]}} [opts]
 *   `fields` 是**可选**的字段白名单覆盖，唯一的使用者是 plans（`lib/plan-schema.js` 的
 *   `PLANS_EVIDENCE_FIELDS`）。默认值仍是 deals 的 `EVIDENCE_FIELDS`，所以不传这个参数时
 *   本模块的行为与 v1.3 逐字节相同（`provenance-selftest` 有两条断言钉住这一点）。
 * @returns {object|null}
 */
function normalizeEvidenceItem(raw, opts = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const fields = opts.fields || EVIDENCE_FIELDS;
  if (!fields.includes(raw.field)) return null;

  const quote = cleanQuote(raw.quote);
  if (!quote) return null;
  // 超长直接拒收：截断会产出「看起来像官方原话、其实被我们动过」的东西（H8 的对偶）
  if (Array.from(quote).length > MAX_EVIDENCE_QUOTE_LENGTH) return null;

  const sourceUrl = normalizeHttpUrl(raw.sourceUrl);
  if (!sourceUrl) return null;
  // 引文必须是官方原文。聚合站作为出处说明可以（sourceUrl 字段），但作为「官方原文证据」不行。
  if (isAggregatorUrl(sourceUrl)) return null;

  const capturedAt = normalizeCapturedAt(raw.capturedAt, opts.today);
  if (!capturedAt) return null;

  const item = { field: raw.field, quote, sourceUrl, capturedAt };
  if (EVIDENCE_LANGS.includes(raw.lang)) item.lang = raw.lang;
  return item;
}

function evidenceKey(item) {
  return `${item.field}\u0000${item.quote}`;
}

/**
 * 归一整组引文：去非法项、去重、按字段固定次序排序、截到上限。
 *
 * 排序**不依赖输入顺序**：同一条记录今天从策展文件来、明天从合并结果来，
 * 字节必须一样，否则 `check-reproducible` 的「重放产出同一份文件」会红。
 *
 * @param {unknown} value
 * @param {{today?:string, fields?:string[], fieldOrder?:string[]}} [opts]
 * @returns {object[]|null} 空 → null（缺席，不是空数组）
 */
function normalizeEvidence(value, opts = {}) {
  if (value === null || value === undefined) return null;
  const list = Array.isArray(value) ? value : [value];
  const seen = new Set();
  const kept = [];
  for (const raw of list) {
    const item = normalizeEvidenceItem(raw, opts);
    if (!item) continue;
    const key = evidenceKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(item);
  }
  if (!kept.length) return null;
  return sortAndCap(kept, opts);
}

function sortAndCap(items, opts = {}) {
  const fieldOrder = opts.fieldOrder || opts.fields || EVIDENCE_FIELD_ORDER;
  const order = item => {
    const at = fieldOrder.indexOf(item.field);
    return at < 0 ? fieldOrder.length : at;
  };
  const sorted = [...items].sort((a, b) => {
    const diff = order(a) - order(b);
    if (diff !== 0) return diff;
    if (a.quote !== b.quote) return a.quote < b.quote ? -1 : 1;
    return a.capturedAt < b.capturedAt ? -1 : a.capturedAt > b.capturedAt ? 1 : 0;
  });
  return sorted.slice(0, MAX_EVIDENCE_ITEMS);
}

/**
 * 两端合并引文：并集 + 去重 + 确定性排序 + 上限。
 *
 * 为什么是并集而不是「取 winner 的」：引文是**人工写的证据**，一条记录无论谁在 score 上赢，
 * 双方带来的官方原话都还是真的。丢掉 loser 的引文等于因为「记录代表换了个人」而销毁证据。
 *
 * @returns {object[]|null}
 */
function mergeEvidence(a, b, opts = {}) {
  const list = [];
  for (const side of [a, b]) {
    if (!Array.isArray(side)) continue;
    for (const item of side) if (item && item.field && item.quote) list.push(item);
  }
  if (!list.length) return null;
  const seen = new Set();
  const kept = [];
  for (const item of list) {
    const key = evidenceKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(item);
  }
  return sortAndCap(kept, opts);
}

/**
 * 入口对账：`raw` 里声明了引文、而归一之后不见了 —— 逐条给出原因。
 *
 * 与 `audience-audit.js` 同一条理由：校验器看的是归一**之后**的世界，
 * 字是在归一**之前**写错的。没有这一步，一个手滑的 `capturedAt` 只会表现为
 * 「这条优惠没有原文片段」，而「没写」和「写坏了」在页面上长得一模一样。
 *
 * @param {unknown} raw
 * @param {object[]|null} normalized
 * @param {{today?:string, fields?:string[]}} [opts]
 * @returns {{index:number, reason:string}[]}
 */
function auditEvidence(raw, normalized, opts = {}) {
  if (raw === null || raw === undefined) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  const kept = new Set((normalized || []).map(evidenceKey));
  const dropped = [];
  list.forEach((item, index) => {
    const normalizedItem = normalizeEvidenceItem(item, opts);
    if (normalizedItem && kept.has(evidenceKey(normalizedItem))) return;
    dropped.push({ index, reason: evidenceDropReason(item, opts) });
  });
  return dropped;
}

function evidenceDropReason(raw, opts = {}) {
  const fields = opts.fields || EVIDENCE_FIELDS;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return '引文不是对象';
  if (!fields.includes(raw.field)) {
    return `field「${raw.field}」不在允许清单（${fields.join(' / ')}）`;
  }
  const quote = cleanQuote(raw.quote);
  if (!quote) return '没有原文片段（quote 为空）';
  if (Array.from(quote).length > MAX_EVIDENCE_QUOTE_LENGTH) {
    return `原文片段 ${Array.from(quote).length} 字，超过 ${MAX_EVIDENCE_QUOTE_LENGTH} 字上限（不截断——截断过的原话就不是原话了）`;
  }
  if (!normalizeHttpUrl(raw.sourceUrl)) return 'sourceUrl 不是合法的 http/https 链接';
  if (isAggregatorUrl(raw.sourceUrl)) return `sourceUrl 指向聚合站（${hostOf(raw.sourceUrl)}）——官方原文证据不能出自聚合站`;
  if (!normalizeCapturedAt(raw.capturedAt, opts.today)) return `capturedAt 非法（${JSON.stringify(raw.capturedAt)}）——必须是 YYYY-MM-DD 且不在未来`;
  return '与另一条引文重复，或超出每组上限后被丢弃';
}

/** 全库预算：条数、字符数、单条最大长度、有引文的记录数 */
function budgetOf(deals) {
  const rows = Array.isArray(deals) ? deals : [];
  let items = 0;
  let chars = 0;
  let maxLength = 0;
  let withEvidence = 0;
  let maxPerDeal = 0;
  for (const deal of rows) {
    const list = Array.isArray(deal && deal.evidence) ? deal.evidence : [];
    if (list.length) withEvidence++;
    if (list.length > maxPerDeal) maxPerDeal = list.length;
    for (const item of list) {
      items++;
      const length = Array.from(String(item.quote || '')).length;
      chars += length;
      if (length > maxLength) maxLength = length;
    }
  }
  return { deals: rows.length, items, chars, maxLength, withEvidence, maxPerDeal };
}

/* ------------------------------------------------------------------ */
/* 采集心跳 → 派生事实                                                  */
/* ------------------------------------------------------------------ */

/**
 * 心跳索引：`source-health.json` 的 `name`（= `deal.source`）→ 该来源的行。
 * 这是这次 join 的**唯一**连接键；`deal.source` 与心跳 `name` 必须 1:1，
 * 由 build selfCheck 与 provenance-selftest 一起盯。
 */
function buildSourceIndex(healthDoc) {
  const index = new Map();
  const rows = (healthDoc && Array.isArray(healthDoc.sources)) ? healthDoc.sources : [];
  for (const row of rows) {
    if (!row || !row.name) continue;
    index.set(row.name, row);
  }
  return index;
}

function sourceTypeOf(deal) {
  const source = deal && deal.source;
  if (!source || !SOURCE_TYPES[source]) return 'unknown';
  return SOURCE_TYPES[source];
}

/**
 * 一条记录的采集事实（层 C）。
 *
 * 四种「最近成功采集」状态，含义各不相同，页面上必须分开说：
 *   known       —— 有心跳记录，且有过成功
 *   na          —— 人工策展：**按设计**不经过采集器（不是「没查到」）
 *   unknown     —— 非策展来源，但心跳里匹配不到这一条（改名 / --only 子集 / 新来源）
 *   unavailable —— 本轮构建根本没有可用的心跳文件（缺失或损坏）
 *
 * @param {object} deal
 * @param {{index?:Map<string,object>, healthMissing?:boolean, healthBroken?:boolean}} [opts]
 * @returns {object} 可直接进 dist/deals.json 的派生对象
 */
function factsFor(deal, opts = {}) {
  const index = opts.index instanceof Map ? opts.index : new Map();
  const source = deal && deal.source ? deal.source : null;
  const sourceType = sourceTypeOf(deal);
  const curated = CURATED_SOURCES.includes(source);

  const base = {
    sourceId: null,
    method: 'unknown',
    sourceType: curated ? 'curated' : sourceType,
    lastSuccessAt: null,
    healthStatus: null,
    lastSuccessState: 'unknown'
  };

  if (curated) {
    return { ...base, method: 'curated', lastSuccessState: 'na' };
  }

  // 心跳整份不可用时，这条**优先于行查找**：缺文件的场景下任何「行」都不可能是本轮的，
  // 让它赢就会渲染出一个上一次的旧时间，而页面上看不出那是旧的。宁可说「不可用」。
  if (opts.healthMissing || opts.healthBroken) {
    return { ...base, lastSuccessState: 'unavailable' };
  }

  const row = source ? index.get(source) : null;
  if (row) {
    const method = row.kind === 'headless' ? 'headless' : 'static';
    const lastSuccessAt = typeof row.lastSuccessAt === 'string' && row.lastSuccessAt ? row.lastSuccessAt : null;
    return {
      sourceId: row.source || null,
      method,
      sourceType: sourceType === 'unknown' ? 'unknown' : sourceType,
      lastSuccessAt,
      healthStatus: row.status || null,
      lastSuccessState: lastSuccessAt ? 'known' : 'unknown'
    };
  }

  return base;
}

/** 渲染层状态词（与 index.html 的 SOURCE_WORDING 同源，比对由 validate --strict 做） */
function lastSuccessReason(facts) {
  if (!facts) return 'unknown';
  if (facts.lastSuccessState === 'na') return 'curated';
  if (facts.lastSuccessState === 'unavailable') return 'no_health_doc';
  if (facts.lastSuccessState === 'unknown') return 'no_health_row';
  return '';
}

module.exports = {
  AGGREGATOR_HOSTS,
  MAX_EVIDENCE_QUOTE_LENGTH,
  MAX_EVIDENCE_ITEMS,
  EVIDENCE_TOTAL_BUDGET_CHARS,
  EVIDENCE_BUDGET_RATIO,
  EVIDENCE_FIELDS,
  EVIDENCE_LANGS,
  SOURCE_TYPES,
  CURATED_SOURCES,
  STAMP_PATTERNS,
  cleanQuote,
  hostOf,
  normalizeHttpUrl,
  isAggregatorUrl,
  normalizeCapturedAt,
  normalizeEvidenceItem,
  normalizeEvidence,
  mergeEvidence,
  auditEvidence,
  evidenceKey,
  budgetOf,
  buildSourceIndex,
  sourceTypeOf,
  factsFor,
  lastSuccessReason
};
