/**
 * 归类工具：地区、有效期抽取。
 * 地区绝不由描述文字猜测，只由"来源"决定。
 */

const { normalizeDate, cleanText } = require('./schema');

/** 采集器 id / 来源名 → 地区 */
const SOURCE_REGIONS = {
  // 国内
  'curated-cn': 'cn',
  cn_deepseek: 'cn',
  cn_zhipu: 'cn',
  cn_aliyun: 'cn',
  cn_moonshot: 'cn',
  cn_qianfan: 'cn',
  '智谱AI': 'cn',
  '深度求索': 'cn',
  '阿里云百炼': 'cn',
  '月之暗面': 'cn',
  '百度千帆': 'cn',
  '火山引擎': 'cn',
  '腾讯混元': 'cn',
  '讯飞星火': 'cn',
  'MiniMax': 'cn',
  '硅基流动': 'cn',
  '魔搭社区': 'cn',
  '商汤科技': 'cn',
  // 国外
  curated_global: 'global',
  'curated-global': 'global',
  aitools: 'global',
  futurepedia: 'global',
  futuretools: 'global',
  layer3labs: 'global',
  appsumo: 'global',
  'aitools.fyi': 'global',
  Futurepedia: 'global',
  Futuretools: 'global',
  Layer3Labs: 'global',
  AppSumo: 'global'
};

function inferRegion(sourceId, fallback = 'global') {
  if (!sourceId) return fallback;
  const key = String(sourceId).toLowerCase();
  if (SOURCE_REGIONS[sourceId]) return SOURCE_REGIONS[sourceId];
  if (SOURCE_REGIONS[key]) return SOURCE_REGIONS[key];
  return fallback;
}

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12
};

/**
 * 从一段文案中抽取截止日期。
 * 只认明确年份的写法，避免把"3 天试用"误判成日期。
 */
function extractExpiry(text) {
  const raw = cleanText(text, 600);
  if (!raw) return null;

  let m = raw.match(/(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?/);
  if (m) return normalizeDate(`${m[1]}-${m[2]}-${m[3]}`);

  m = raw.match(/\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?,?\s+(\d{4})\b/i);
  if (m) return normalizeDate(`${m[3]}-${MONTHS[m[2].toLowerCase()]}-${m[1]}`);

  m = raw.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/i);
  if (m) return normalizeDate(`${m[3]}-${MONTHS[m[1].toLowerCase()]}-${m[2]}`);

  m = raw.match(/valid (?:through|until|till)\s+(\d{4})-(\d{1,2})-(\d{1,2})/i);
  if (m) return normalizeDate(`${m[1]}-${m[2]}-${m[3]}`);

  // 曾经这里还有一份**更窄的**「长期」词表（缺 长期/常年/不限时/no end date），但它两个分支
  // 都 return null、唯一调用点也不传 today，等于死代码——留着只会让下一个人以为它才是判据。
  // 「长期」的唯一判据是下面的 isOngoing()。
  return null;
}

/* ------------------------------------------------------------------ */
/* 活动期限：官方明确「长期」的判据                                     */
/* ------------------------------------------------------------------ */

/**
 * 「长期活动」的判据 = **正向线索 且 没有否定线索**。
 *
 * 为什么必须有否定判据（2026-09-28 实测的 11 条线上不实陈述）：
 *   旧实现只做 `/长期|永久有效|…/` 的子串匹配，于是
 *   `长期有效（官方模型列表未标注截止日期）` 这种**自己就写着官方没标截止日**的文案被判成
 *   「官方写明长期有效」，卡片角标出「长期活动」、详情页「活动期限」行写
 *   「长期活动（官方有效期说明里写明长期有效）」——把「我们没查到」写成了「官方说长期」。
 *   判据缺的不是关键词，而是**否定**：文案里一旦出现「未标注截止日期 / 以官方…为准」，
 *   这条就不可能是官方长期承诺，只能落 `unknown`。
 *
 * 正向线索必须锚在**活动/有效期**语义上（有效 / 活动 / 可用 / 开放 / 提供 / 免费）。
 * 这一条是为了区分你问过的两类话术：
 *   「某个权益永久」  —— `额度不过期`、`永久五折`、`一次性额度，不过期`
 *   「整个活动长期」  —— `长期有效`、`常年可用`、`no expiration`
 * 前者落在 `(?:长期|常年|永久)` 之后 0–6 字却接不到活动语义（或是「不过期」这种只讲权益的
 * 写法），因此**不判 ongoing**（落 unknown）。宁可少标一个「长期活动」，也不替官方扩大承诺。
 *
 * ⚠️ 这两条正则的**源文本**是前后端共享契约：index.html 的 RENDER-CORE 里有一份逐字节相同的
 * 副本（标记块 `ONGOING:START/END`）。改这里必须同步改那边，`npm run selftest:expiry` 会做
 * **文本级**比对（不只比行为），只改一边立刻红。
 */
const ONGOING_POSITIVE_RE = /(?:长期|常年|永久)[^，。；;、）)]{0,6}(?:有效|活动|可用|开放|提供|免费)|不限时|无截止日期|不设截止|Ongoing|no expiration|always available|no end date/i;

/** 否定线索：官方没写截止日 / 让我们以官方页为准 / 随时可能调整 —— 命中即**绝不能**判长期 */
const ONGOING_HEDGE_RE = /未标(?:注)?截止|未标明截止|以官方[^，。；;]{0,12}为准|以[^，。；;]{0,8}实时[^，。；;]{0,8}为准|随时(?:结束|调整|变更)|不另行通知/;

/**
 * "长期有效"标注（前端展示用，不占用 expiresAt）。
 * @param {string} text 通常是 deal.validity
 * @returns {boolean}
 */
function isOngoing(text) {
  const raw = cleanText(text, 400);
  if (!raw) return false;
  if (ONGOING_HEDGE_RE.test(raw)) return false;
  return ONGOING_POSITIVE_RE.test(raw);
}

/** 供 selftest 做「前后端词表逐字节一致」比对的源文本（正则字面量内部内容） */
const ONGOING_PATTERNS = {
  positive: ONGOING_POSITIVE_RE.source,
  hedge: ONGOING_HEDGE_RE.source,
  flags: ONGOING_POSITIVE_RE.flags
};

module.exports = {
  SOURCE_REGIONS,
  inferRegion,
  extractExpiry,
  isOngoing,
  ONGOING_POSITIVE_RE,
  ONGOING_HEDGE_RE,
  ONGOING_PATTERNS
};
