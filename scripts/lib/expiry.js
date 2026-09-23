/**
 * 活动期限：从文案里抽取「绝对截止日期」，以及判定「官方明确长期」。
 *
 * 与前端的三分类对齐（index.html 的 RENDER-CORE.expiryState）：
 *   due     有绝对截止日期 —— 卡片标「剩 N 天」，排序时按剩余天数升序
 *   ongoing 官方写明长期/永久有效 —— 卡片标「长期活动」，排在最后
 *   unknown 官方没标注截止日期 —— 卡片标「未标注截止日期」，排在长期活动之前
 *
 * ongoing 与 unknown 必须分开：把「我们没查到」写成「长期活动」就是编造。
 *
 * 抽取只认一条线：官方文案里写死的绝对日期（带 4 位年份），且日期附近要有结束语义
 * （截止 / 至 / until / through / ends …）。相对期限（"自开通起 3 个月"）、发布日期、
 * 文档更新日期一律不算——宁可留空（= 长期活动/未标注），也不把一个日期猜成截止日。
 */

const { cleanText, normalizeDate, todayCN } = require('./schema');
// 「长期有效」的判据只保留一份实现（classify.js），前端 index.html 的 ONGOING_RE 与它同词表
const { isOngoing } = require('./classify');

/** 结束语义：日期必须落在这些词的附近才算截止日 */
const END_CUE_RE = /截止|截至|至|到|结束|到期|最后|until|till|through|thru|\bends?\b|\bend(?:ing)?\b|expir|deadline|no later than/i;

/** 区间连接符：两个日期之间只有这些字，说明是「A 至 B」区间，取结束那一端 */
const RANGE_GAP_RE = /^\s*(?:起)?\s*(?:至|到|[-–—~]|to|through|thru|until|till)\s*$/i;

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12
};

/** 绝对日期写法：一律要求带 4 位年份，避免把「3 天试用」当成日期 */
const ABS_DATE_RES = [
  { re: /(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?/g, map: m => [m[1], m[2], m[3]] },
  {
    re: /\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?,?\s+(\d{4})\b/gi,
    map: m => [m[3], MONTHS[m[2].toLowerCase()], m[1]]
  },
  {
    re: /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/gi,
    map: m => [m[3], MONTHS[m[1].toLowerCase()], m[2]]
  }
];

/**
 * 收集文本里所有带年份的绝对日期。
 * @returns {{at:number, raw:string, value:string}[]} 按出现位置升序
 */
function collectAbsoluteDates(text) {
  const found = [];
  const seen = new Set();
  for (const { re, map } of ABS_DATE_RES) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      const [y, mo, d] = map(m);
      const value = normalizeDate(`${y}-${mo}-${d}`);
      if (!value) continue;
      const key = `${m.index}:${value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      found.push({ at: m.index, raw: m[0], value });
    }
  }
  return found.sort((a, b) => a.at - b.at);
}

/**
 * 从一段文案里抽取活动的绝对截止日期。
 * @param {string} text
 * @returns {string|null} YYYY-MM-DD；抽不到返回 null（= 不猜）
 */
function extractDeadline(text) {
  const raw = cleanText(text, 600);
  if (!raw) return null;

  const dates = collectAbsoluteDates(raw);
  if (!dates.length) return null;

  // ① 区间写法「2026年9月1日 至 2026年10月1日」「from … to …」：取结束那一端
  for (let i = 0; i + 1 < dates.length; i++) {
    const gap = raw.slice(dates[i].at + dates[i].raw.length, dates[i + 1].at);
    if (RANGE_GAP_RE.test(gap)) return dates[i + 1].value;
  }

  // ② 单点写法：日期前后一小段里必须有结束语义
  const hits = dates
    .filter(d => {
      const window = raw.slice(Math.max(0, d.at - 24), d.at + d.raw.length + 12);
      return END_CUE_RE.test(window);
    })
    .map(d => d.value)
    .sort();

  return hits.length ? hits[hits.length - 1] : null;
}

/**
 * 给一条记录补 expiresAt：只认文案里写死的绝对截止日。
 * 已有 expiresAt（人工策展或采集器显式给出）一律不动。
 *
 * 两条防线，都是为了让「抽错」比「抽不到」更罕见：
 *   ① 只扫 validity / discountInfo —— 期限只可能写在这两处，扫全字段会把发布日期卷进来；
 *   ② 只收不早于今天的日期 —— 页面上的「已于 2026-06-12 结束限时免费」讲的是另一个
 *      模型的历史活动，填进来会把本条误判成过期并触发下架。过去的日期对「即将截止」
 *      排序也没有意义（它该由 prune 的下架逻辑处理，而不是靠这里猜一个日期）。
 */
function applyDeadline(deal, { today = todayCN() } = {}) {
  if (!deal || typeof deal !== 'object' || deal.expiresAt) return deal;
  const deadline = extractDeadline([deal.validity, deal.discountInfo].filter(Boolean).join('。'));
  if (!deadline || deadline < today) return deal;
  return { ...deal, expiresAt: deadline };
}

module.exports = { extractDeadline, isOngoing, applyDeadline, collectAbsoluteDates };
