/**
 * 送模型之前的输入净化：DOM 清洗 → 正文提取 → 截断 → 密钥脱敏。
 *
 * 为什么必须是流水线的第一道：
 *  · 成本：一页 5 MB 的 HTML 直接送进去，光输入就是十几万 token，而其中 95% 是
 *    内联样式、脚本和导航；
 *  · 版权：只送**正文**，不送整页标记；
 *  · 安全：任何被我们抓回来的页面都可能包含第三方埋的示例密钥串，送出去之前先抹掉。
 *
 * **不做摘要、不做改写**：模型要引原话（候选里的 `evidence.quote`），
 * 任何改写都会让引文对不上官方页面。这里只做「去掉非正文」和「截断」，
 * 并且截断事实本身会被返回（`truncated`），由调用方决定要不要因此拒绝这条。
 */

'use strict';

const secretScan = require('../lib/secret-scan');
const cache = require('./cache');

/** 这些标签连同内容一起丢掉 */
const DROP_ELEMENTS = ['script', 'style', 'svg', 'noscript', 'template', 'iframe', 'canvas', 'head'];

/** 这些标签视为块级边界，转成换行，避免把两段文字粘成一句 */
const BLOCK_ELEMENTS = [
  'p', 'div', 'section', 'article', 'header', 'footer', 'main', 'aside', 'nav',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'tr', 'td', 'th', 'br', 'hr', 'table',
  'ul', 'ol', 'dl', 'dt', 'dd', 'form', 'blockquote', 'pre', 'title', 'meta', 'label'
];

const ENTITIES = {
  '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
  '&#39;': "'", '&apos;': "'", '&mdash;': '—', '&ndash;': '–', '&hellip;': '…',
  '&times;': '×', '&middot;': '·', '&copy;': '©', '&reg;': '®'
};

function decodeEntities(text) {
  return String(text)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeChar(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => safeChar(parseInt(dec, 10)))
    .replace(/&[a-z]+;/gi, match => (ENTITIES[match.toLowerCase()] !== undefined ? ENTITIES[match.toLowerCase()] : match));
}

function safeChar(code) {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return '';
  try {
    return String.fromCodePoint(code);
  } catch (error) {
    return '';
  }
}

/** HTML → 纯文本。非 HTML（已经是文本）会原样走一遍空白归一。 */
function stripHtml(html) {
  let text = String(html == null ? '' : html);
  text = text.replace(/<!--[\s\S]*?-->/g, ' ');
  for (const tag of DROP_ELEMENTS) {
    text = text.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi'), ' ');
    text = text.replace(new RegExp(`<${tag}\\b[^>]*\\/?>`, 'gi'), ' ');
  }
  for (const tag of BLOCK_ELEMENTS) {
    text = text.replace(new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi'), '\n');
  }
  text = text.replace(/<[^>]+>/g, ' ');
  text = decodeEntities(text);
  return collapse(text);
}

/** 空白归一：行内多空格合一，连续空行压成一个，行首尾去空白 */
function collapse(text) {
  return String(text)
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\u00a0]+/g, ' ')
    .split('\n')
    .map(line => line.trim())
    .filter((line, index, all) => line.length > 0 || (index > 0 && all[index - 1].length > 0))
    .join('\n')
    .trim();
}

/** 从 `<meta>` 里取标题与描述（这两个字段对判断优惠很有用，且是页面自述的元数据） */
function extractMeta(html) {
  const source = String(html == null ? '' : html);
  const meta = {};
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(source);
  if (title) meta.title = collapse(decodeEntities(title[1])).slice(0, 300);
  const desc = /<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i.exec(source)
    || /<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i.exec(source);
  if (desc) meta.description = collapse(decodeEntities(desc[1])).slice(0, 400);
  const og = /<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']*)["']/i.exec(source);
  if (og) meta.ogTitle = collapse(decodeEntities(og[1])).slice(0, 300);
  return meta;
}

/**
 * 净化 + 截断。
 * @param {{html?:string, text?:string, maxChars:number, meta?:object}} params
 * @returns {{text:string, chars:number, rawChars:number, truncated:boolean, sha256:string, redacted:number, meta:object}}
 */
function prepareInput({ html, text, maxChars, meta = null } = {}) {
  const raw = html != null ? stripHtml(html) : collapse(text || '');
  const rawChars = raw.length;
  const truncated = maxChars ? raw.length > maxChars : false;
  const cut = truncated ? raw.slice(0, maxChars) : raw;
  const scan = secretScan.scanText(cut);
  const cleaned = scan.length ? secretScan.redactText(cut) : cut;
  // 截断必须**写在正文里**：模型看不到截断标记时，会把"后面没有了"当成"原文没写"，
  // 于是给出一个本该是 unknown 的确定值 —— 这正是本版本最想避免的错误。
  const marked = truncated ? `${cleaned}\n[正文已截断，以上为前 ${maxChars} 字]` : cleaned;
  const withMeta = meta ? collapse([meta.title, meta.description, marked].filter(Boolean).join('\n')) : marked;
  return {
    text: withMeta,
    chars: withMeta.length,
    rawChars,
    truncated,
    redacted: scan.length,
    sha256: cache.inputHashOf(withMeta),
    meta: meta || extractMeta(html || '')
  };
}

module.exports = { stripHtml, collapse, decodeEntities, extractMeta, prepareInput, DROP_ELEMENTS, BLOCK_ELEMENTS };
