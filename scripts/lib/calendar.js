/**
 * 到期日历（iCalendar / RFC 5545）：把「有绝对截止日期且尚未过期」的条目导出成 .ics。
 *
 * 设计口径（与页面同一份真值，不另立判据）：
 *   · 收录条件只有一条：`expiresAt` 非 null 且 `expiresAt >= asOf`。asOf 是**数据日期**
 *     （deals.json 的 updatedAt 日期），不是构建时的墙钟——同一份数据任何时候重建都逐字节相同。
 *   · 事件是 **全天事件**（DTSTART;VALUE=DATE）：截止日期本身没有时分秒，给它编一个时刻
 *     就是编造。DTEND 是次日（RFC 5545 的 DTEND 对 DATE 值取 exclusive 端点）。
 *   · DTSTAMP 冻结在 `asOf` 当天 00:00 +08:00 的 UTC 瞬时（= 前一日 16:00Z）。它只表示
 *     「这份数据是哪天的」，不随构建时间变化；本文件不使用 Date.now()，也不调无参 new Date()。
 *   · UID = `<dealId>@<host>`：稳定、可重复订阅，同一 id 永远对应同一个事件。
 *   · 文本按 RFC 5545 §3.1 折行（75 **字节**，中文按 UTF-8 3 字节算），续行以一个空格开头；
 *     TEXT 值转义 `\` `;` `,` 与换行。折行在 UTF-8 字符边界上切，不切坏多字节字符。
 *
 * 唯一产物表 CALENDAR_FILES：构建、发布资产登记、可复现门禁都从这里读，不许写第二份文件名。
 */

const site = require('./site');

/** 构建写出的日历产物（文件名 → MIME）。恰好一份；其余文件不许写这个字面量。 */
const CALENDAR_FILES = [['expiry.ics', 'text/calendar']];

/** RFC 5545 的硬上限是 75 octets（含 CRLF 之外的折行前导空格）。 */
const FOLD_LIMIT = 75;

/** TEXT 值转义：反斜杠先转，否则 `\;` 会被二次转义。 */
function escapeText(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/**
 * 按 UTF-8 字节折行。第一行最多 75 字节；续行以空格开头，因此内容部分最多 74 字节。
 * 返回值不含 CRLF（调用方统一用 CRLF 连接）。
 */
function foldLine(line) {
  const text = String(line);
  const out = [];
  let current = '';
  let limit = FOLD_LIMIT;
  let consumed = 0;
  for (const char of text) {
    const bytes = Buffer.byteLength(char, 'utf8');
    if (consumed + bytes > limit) {
      out.push(current);
      current = ' ' + char;
      consumed = 1 + bytes;
      limit = FOLD_LIMIT;
      continue;
    }
    current += char;
    consumed += bytes;
  }
  out.push(current);
  return out;
}

/** 把逻辑行数组渲染成 CRLF 结尾的正文（每个逻辑行可能折成多行）。 */
function renderLines(lines) {
  const physical = [];
  for (const line of lines) for (const folded of foldLine(line)) physical.push(folded);
  return physical.join('\r\n') + '\r\n';
}

/** 日期加 n 天（纯算术：先转 UTC 毫秒，再加 86400000）。 */
function addDays(date, days) {
  const ms = Date.parse(`${date}T00:00:00Z`);
  return new Date(ms + days * 86400000).toISOString().slice(0, 10);
}

/** YYYY-MM-DD → YYYYMMDD（DTSTART;VALUE=DATE 的写法）。 */
function dateValue(date) {
  return String(date).replace(/-/g, '');
}

/**
 * asOf（数据日期，北京时间零点）→ UTC 瞬时 `YYYYMMDDTHHMMSSZ`。
 * 用 Date.parse 解析**显式字符串**，不做任何时区猜测。
 */
function stampOf(asOf) {
  const ms = Date.parse(`${asOf}T00:00:00+08:00`);
  if (!Number.isFinite(ms)) throw new Error(`到期日历：asOf 不是合法日期：${asOf}`);
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

/**
 * 构建整份日历。
 * @param {{deals:Array, asOf:string, site?:object}} input
 * @returns {string} RFC 5545 正文（CRLF 行尾）
 */
function buildCalendarIcs({ deals, asOf, site: siteOverride } = {}) {
  const siteInfo = siteOverride || site;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(asOf || ''))) {
    throw new Error(`到期日历：asOf 必须是 YYYY-MM-DD（实得 ${asOf}）`);
  }
  const host = new URL(siteInfo.SITE_URL).host;
  const base = siteInfo.SITE_URL.endsWith('/') ? siteInfo.SITE_URL : `${siteInfo.SITE_URL}/`;
  const stamp = stampOf(asOf);

  const events = (deals || [])
    .filter(deal => deal && typeof deal.expiresAt === 'string' && deal.expiresAt >= asOf)
    .slice()
    .sort((a, b) => (a.expiresAt < b.expiresAt ? -1 : a.expiresAt > b.expiresAt ? 1 : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)));

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//buguoshixc/ai-deals-aggregator//Expiry Calendar//ZH-CN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText('AI 优惠聚合器 · 到期日历')}`,
    `X-WR-CALDESC:${escapeText('收录有绝对截止日期、且尚未过期的优惠与工具条目；截止日前 3 天提醒。基准日 ' + asOf)}`
  ];

  for (const deal of events) {
    const title = String(deal.title || '未命名条目');
    const description = [
      deal.vendor ? `厂商：${deal.vendor}` : null,
      `截止：${deal.expiresAt}`,
      deal.source ? `来源：${deal.source}${deal.sourceUrl ? `（${deal.sourceUrl}）` : ''}` : null,
      '信息以官方页面为准；本站只做收录与链接。'
    ].filter(Boolean).join(' · ');

    lines.push(
      'BEGIN:VEVENT',
      `UID:${escapeText(`${deal.id}@${host}`)}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${dateValue(deal.expiresAt)}`,
      `DTEND;VALUE=DATE:${dateValue(addDays(deal.expiresAt, 1))}`,
      `SUMMARY:${escapeText(title)}`,
      `DESCRIPTION:${escapeText(description)}`,
      `URL:${base}deal/${deal.id}/`,
      'TRANSP:TRANSPARENT',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'TRIGGER:-P3D',
      `DESCRIPTION:${escapeText(`3 天后截止：${title}`)}`,
      'END:VALARM',
      'END:VEVENT'
    );
  }

  lines.push('END:VCALENDAR');
  return renderLines(lines);
}

module.exports = { CALENDAR_FILES, buildCalendarIcs, escapeText, foldLine, addDays, dateValue, stampOf, FOLD_LIMIT };
