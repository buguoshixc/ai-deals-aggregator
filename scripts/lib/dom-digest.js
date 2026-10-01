/**
 * 页面结构摘要（v2.0 Phase C）。
 *
 * ## 解决的是哪件事
 *
 * Source Health 能告诉你「这个源今天 0 条」，但**给不出任何证据**说明为什么：
 * `lastError` 只有一行、截到 200 字；条数只说明"少了"，不说明"哪一层变了"。
 * 于是维护者只能重新抓页、肉眼找、二分试 —— 这就是要压掉的那 25 分钟。
 *
 * ## 为什么存"摘要"而不是整页 HTML
 *
 * 三条理由，缺一条都不成立：
 *  ① **体积**：整页 1–5 MB × 9 个源 × 跨运行入库 = 仓库爆掉；
 *  ② **版权**：整页第三方内容不该进我们的仓库（`research/_raw` 的截图都有同样的纪律）；
 *  ③ **够用**：诊断真正需要的是"表格还在不在、class 变了没、选择器还命中几次、
 *     是不是跳到登录页了" —— 这些全都能用数字和类名表达，一个字的正文都不需要。
 *
 * 所以摘要里**没有页面正文、没有标题文本**，只有：计数、标记、我们**自己声明**的
 * 探针命中次数、以及 class 名直方图。
 *
 * ## 探针为什么要单独一张声明表
 *
 * 「采集器依赖哪些选择器」这件事，今天只存在于采集器代码里，而且散在各处。
 * 把它抽成 `scripts/data/source-probes.json` 有三个好处：
 *  ① 摘要能算"这个选择器今天命中几次"；
 *  ② 采集器改了选择器却忘了改探针，会在自检里红（多/漏都红）；
 *  ③ **改探针不需要动采集器代码** —— 与 v1.1 的 `SOURCE_TYPES` 同一个思路。
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cheerio = require('cheerio');

const DATA_DIR = path.join(__dirname, '..', 'data');
const PROBES_FILE = path.join(DATA_DIR, 'source-probes.json');
const SNAPSHOT_FILE = path.join(DATA_DIR, 'source-snapshots.json');
const SNAPSHOT_SCHEMA_VERSION = 1;

/** 快照文件体积上限：超了就在写盘前丢掉最旧一代（宁可少一代，也不让仓库被摘要顶大） */
const MAX_SNAPSHOT_BYTES = 256 * 1024;
/** 单个来源每代最多留几份摘要 */
const MAX_DIGESTS_PER_SOURCE = 4;
/** class 名直方图留前几名 */
const TOP_CLASSES = 12;

/* ------------------------------------------------------------------ */
/* 探针声明表                                                          */
/* ------------------------------------------------------------------ */

function emptyProbes() {
  return { schemaVersion: 1, note: '', probes: {} };
}

function loadProbes(file = PROBES_FILE) {
  if (!fs.existsSync(file)) return { ...emptyProbes(), file, missing: true };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    const probes = parsed && typeof parsed.probes === 'object' && parsed.probes ? parsed.probes : {};
    return { schemaVersion: parsed.schemaVersion || 1, note: parsed.note || '', probes, file, missing: false };
  } catch (error) {
    return { ...emptyProbes(), file, missing: false, broken: error.message };
  }
}

function probesFor(sourceId, doc = null) {
  const loaded = doc || loadProbes();
  const entry = loaded.probes[sourceId];
  if (!entry || typeof entry !== 'object') return { keywords: [], selectors: [], regexes: [] };
  return {
    keywords: Array.isArray(entry.keywords) ? entry.keywords : [],
    selectors: Array.isArray(entry.selectors) ? entry.selectors : [],
    regexes: Array.isArray(entry.regexes) ? entry.regexes : []
  };
}

/**
 * 覆盖对账：注册的采集器一个都不能少，文件里也不能有没人用的条目。
 * 与 `provenance.SOURCE_TYPES` 的守卫同一个理由 —— 新增来源忘了登记要在自检里红，
 * 而不是等到某个源坏掉时才发现"这个源根本没有探针可比对"。
 */
function probeCoverage(collectorIds, doc = null) {
  const loaded = doc || loadProbes();
  const known = Object.keys(loaded.probes).filter(key => !key.startsWith('_'));
  const wanted = [].concat(collectorIds);
  return {
    missing: wanted.filter(id => !known.includes(id)),
    unknown: known.filter(id => !wanted.includes(id)),
    broken: loaded.broken || null
  };
}

/* ------------------------------------------------------------------ */
/* 捕获作用域                                                          */
/* ------------------------------------------------------------------ */

/**
 * 采集器只通过 `lib/http.js` 与 `lib/browser.js` 拿页面（这是既有纪律），
 * 所以摘要只需要挂在这两个出口上，**采集器一行都不用改**。
 */
let active = null;

function isCapturing() {
  return Boolean(active);
}

function beginCapture(probes = {}) {
  active = { probes, items: [] };
  return active;
}

/** 出口调用；没有作用域时是空操作（诊断脚本、logo 抓取等都不需要摘要） */
function note(url, html, extra = {}) {
  if (!active) return null;
  if (typeof html !== 'string' || html.length < 32) return null;
  let result;
  try {
    result = digest(html, { probes: active.probes, url, ...extra });
  } catch (error) {
    result = { v: 1, url, capturedAt: null, error: `摘要失败: ${String(error.message || error).slice(0, 120)}` };
  }
  active.items.push(result);
  return result;
}

function endCapture() {
  const scope = active;
  active = null;
  return scope ? scope.items : [];
}

/* ------------------------------------------------------------------ */
/* 摘要                                                                */
/* ------------------------------------------------------------------ */

function sha256short(text) {
  return crypto.createHash('sha256').update(String(text), 'utf8').digest('hex').slice(0, 16);
}

function tally(list) {
  const counts = new Map();
  for (const item of list) {
    if (!item) continue;
    counts.set(item, (counts.get(item) || 0) + 1);
  }
  return counts;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

const LOGIN_RE = /sign\s?in|log\s?in|登录|登陆|请先登录/i;
const CAPTCHA_RE = /captcha|验证码|verify you are human|are you a robot|人机验证/i;
const CLOUDFLARE_RE = /just a moment|cf-browser-verification|cf_chl_|__cf_chl|cloudflare/i;
const ERROR_RE = /\b404\b|not found|页面不存在|出错|服务不可用|502 bad gateway|503 service/i;
const CONSENT_RE = /cookie|隐私政策|同意并继续|accept all/i;

/**
 * @param {string} html
 * @param {{probes?:object, url?:string, httpStatus?:number, bytes?:number}} opts
 */
function digest(html, opts = {}) {
  const { probes = {}, url = null, httpStatus = null, bytes = null } = opts;
  const source = String(html || '');
  const $ = cheerio.load(source);

  const bodyClone = cheerio.load(source);
  bodyClone('script,style,noscript,svg,iframe,head').remove();
  const text = bodyClone('body').text().replace(/\s+/g, ' ').trim();
  const scriptText = $('script').map((_, el) => $(el).text()).get().join(' ');
  const title = $('title').first().text().trim();
  const metaDescription = $('meta[name="description"]').attr('content') || '';
  const haystack = `${title}\n${metaDescription}\n${text.slice(0, 5000)}`;

  const counts = {
    table: $('table').length,
    tr: $('tr').length,
    td: $('td').length,
    card: $('[class*="card" i]').length,
    listItem: $('li').length,
    heading: $('h1,h2,h3').length,
    heading1: $('h1').length,
    link: $('a[href]').length,
    form: $('form').length,
    input: $('input').length,
    script: $('script').length,
    div: $('div').length
  };

  const textLength = text.length;
  const markers = {
    login: LOGIN_RE.test(haystack) && textLength < 3000,
    captcha: CAPTCHA_RE.test(haystack),
    cloudflare: CLOUDFLARE_RE.test(source.slice(0, 4000)),
    errorPage: ERROR_RE.test(haystack) && textLength < 2000,
    consentOnly: CONSENT_RE.test(haystack) && textLength < 1200,
    spaShell: textLength < 800 && counts.script >= 3,
    noDataTable: counts.table === 0
  };

  const shape = {
    hasDataTable: counts.table > 0 && counts.tr >= 2,
    hasCards: counts.card > 0,
    scriptToTextRatio: textLength ? round(Math.min(scriptText.length / textLength, 99)) : null
  };

  const selectorHits = {};
  for (const selector of probes.selectors || []) {
    try {
      selectorHits[selector] = $(selector).length;
    } catch (error) {
      selectorHits[selector] = -1; // 选择器本身写坏了：-1 是显式信号，不是 0
    }
  }

  const keywordHits = {};
  for (const keyword of probes.keywords || []) {
    if (!keyword) continue;
    const re = new RegExp(escapeRe(keyword), 'gi');
    const matches = haystack.match(re);
    keywordHits[keyword] = matches ? matches.length : 0;
  }

  const regexHits = {};
  for (const spec of probes.regexes || []) {
    if (!spec || !spec.name || !spec.pattern) continue;
    try {
      const re = new RegExp(spec.pattern, spec.flags || 'gi');
      const matches = source.match(re);
      regexHits[spec.name] = matches ? matches.length : 0;
    } catch (error) {
      regexHits[spec.name] = -1;
    }
  }

  const classCounts = tally(
    $('[class]').map((_, el) => String($(el).attr('class') || '').split(/\s+/).filter(Boolean)).get().flat()
  );
  const topClasses = [...classCounts.entries()]
    .filter(([name]) => name && name.length <= 40 && !/^[0-9a-f]{6,}$/i.test(name))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, TOP_CLASSES)
    .map(([name, count]) => ({ name, count }));

  return {
    v: 1,
    url,
    capturedAt: new Date().toISOString(),
    httpStatus,
    bytes: bytes || source.length,
    htmlSha256: sha256short(source),
    titleSha256: title ? sha256short(title) : null,
    markers,
    counts,
    shape,
    textLength,
    textSha256: textLength ? sha256short(text) : null,
    keywordHits,
    selectorHits,
    regexHits,
    topClasses
  };
}

function escapeRe(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* ------------------------------------------------------------------ */
/* 跨运行快照                                                          */
/* ------------------------------------------------------------------ */

function emptySnapshotDoc() {
  return { schemaVersion: SNAPSHOT_SCHEMA_VERSION, updatedAt: null, note: '', sources: [] };
}

function loadSnapshots(file = SNAPSHOT_FILE) {
  if (!fs.existsSync(file)) return { doc: emptySnapshotDoc(), byId: {}, file, missing: true };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    const sources = Array.isArray(parsed && parsed.sources) ? parsed.sources : [];
    const byId = {};
    for (const row of sources) if (row && row.source) byId[row.source] = row;
    return { doc: { ...emptySnapshotDoc(), ...parsed, sources }, byId, file, missing: false };
  } catch (error) {
    return { doc: emptySnapshotDoc(), byId: {}, file, missing: false, broken: error.message };
  }
}

/**
 * 推进快照文档：本次的摘要成为 `current`，原先的 `current` 退成 `previous`。
 * **只保留两代** —— 诊断要的是"变之前 / 变之后"，留更多代只是让文件变大。
 */
function buildSnapshotDoc({ previousDoc = emptySnapshotDoc(), entries = [], now = new Date() } = {}) {
  const prevById = {};
  for (const row of previousDoc.sources || []) if (row && row.source) prevById[row.source] = row;
  const rows = [];

  for (const entry of entries) {
    if (!entry || !entry.source) continue;
    const items = (entry.digests || []).slice(0, MAX_DIGESTS_PER_SOURCE);
    const prev = prevById[entry.source];
    rows.push({
      source: entry.source,
      name: entry.name || (prev && prev.name) || entry.source,
      updatedAt: new Date(now).toISOString(),
      current: items.length ? { capturedAt: new Date(now).toISOString(), itemCount: (entry.digests || []).length, items } : (prev && prev.current) || null,
      previous: items.length ? (prev && prev.current) || null : (prev && prev.previous) || null
    });
  }

  rows.sort((a, b) => String(a.source).localeCompare(String(b.source)));
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    updatedAt: new Date(now).toISOString(),
    note: '每个来源保留两代页面结构摘要（不含页面正文）。用于 AI 诊断与人工排查；`npm run selftest:ai` 守着体积上限。',
    sources: rows
  };
}

/** 序列化后再判体积：超限就丢掉所有 previous，再超就只保留 counts/markers */
function serializeSnapshotDoc(doc) {
  let text = `${JSON.stringify(doc, null, 2)}\n`;
  if (Buffer.byteLength(text) <= MAX_SNAPSHOT_BYTES) return text;

  const trimmed = {
    ...doc,
    note: doc.note,
    sources: doc.sources.map(row => ({ ...row, previous: null }))
  };
  text = `${JSON.stringify(trimmed, null, 2)}\n`;
  if (Buffer.byteLength(text) <= MAX_SNAPSHOT_BYTES) return text;

  const minimal = {
    ...trimmed,
    sources: trimmed.sources.map(row => ({
      ...row,
      current: row.current
        ? { ...row.current, items: row.current.items.map(item => ({ url: item.url, capturedAt: item.capturedAt, markers: item.markers, counts: item.counts, textLength: item.textLength })) }
        : null
    }))
  };
  return `${JSON.stringify(minimal, null, 2)}\n`;
}

function writeSnapshots(doc, file = SNAPSHOT_FILE) {
  fs.writeFileSync(file, serializeSnapshotDoc(doc), 'utf8');
  return file;
}

/**
 * 两代摘要的结构差异（给诊断与人工排查用，纯确定性）。
 * 只报"变了什么"，不解释"为什么" —— 解释是 AI 的活。
 */
function diffDigests(previous, current) {
  if (!previous && !current) return null;
  if (!previous) return { firstCapture: true };
  if (!current) return { missingCurrent: true };
  const changes = {};
  for (const group of ['markers', 'counts', 'shape', 'keywordHits', 'selectorHits', 'regexHits']) {
    const before = previous[group] || {};
    const after = current[group] || {};
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    const delta = {};
    for (const key of keys) {
      const a = before[key];
      const b = after[key];
      if (typeof a === 'number' && typeof b === 'number') {
        if (a !== b) delta[key] = { from: a, to: b };
      } else if (a !== b) {
        delta[key] = { from: a === undefined ? null : a, to: b === undefined ? null : b };
      }
    }
    if (Object.keys(delta).length) changes[group] = delta;
  }
  if (previous.textLength !== current.textLength) {
    changes.textLength = { from: previous.textLength, to: current.textLength };
  }
  if (previous.htmlSha256 !== current.htmlSha256) changes.htmlChanged = true;
  return Object.keys(changes).length ? changes : { unchanged: true };
}

module.exports = {
  PROBES_FILE,
  SNAPSHOT_FILE,
  SNAPSHOT_SCHEMA_VERSION,
  MAX_SNAPSHOT_BYTES,
  MAX_DIGESTS_PER_SOURCE,
  emptyProbes,
  loadProbes,
  probesFor,
  probeCoverage,
  beginCapture,
  isCapturing,
  note,
  endCapture,
  digest,
  emptySnapshotDoc,
  loadSnapshots,
  buildSnapshotDoc,
  serializeSnapshotDoc,
  writeSnapshots,
  diffDigests
};
