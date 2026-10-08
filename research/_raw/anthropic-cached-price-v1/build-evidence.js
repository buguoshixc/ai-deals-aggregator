#!/usr/bin/env node
/**
 * t26 / anthropic-cached-price-v1 —— 把这次取证落成 Tier-1 证据（逐字片段 + 可达性 + 时间线）。
 *
 * 输入：`.arch-v1/raw-dumps-anthropic/` 里本机抓下来的原始快照（第三方原件，按证据政策**不入库**；
 *       该目录被 .gitignore 覆盖）。输出：本目录下的 `.md` / `.json`（Tier-1）。
 *
 * 三条纪律：
 *   1. **逐字**：所有片段都是从快照字节里按锚点切出来的原文，不做转述；锚点找不到就抛错（宁可红）。
 *   2. **可达性照实记**：状态码 / 最终 URL / 区域门事实都从 `.hdr` 快照里读，不从结论倒推。
 *   3. **只读不写数据**：不碰 scripts/**，只写 research/ 下的证据。
 *
 * 用法：node research/_raw/anthropic-cached-price-v1/build-evidence.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const RAW = path.join(ROOT, '.arch-v1', 'raw-dumps-anthropic');
const DIR = __dirname;
const DATE = '2026-10-08';

function readSnapshot(file) {
  const raw = fs.readFileSync(file);
  if (raw[0] === 0x1f && raw[1] === 0x8b) return zlib.gunzipSync(raw).toString('utf8');
  if (raw[0] === 0xff && raw[1] === 0xfe) return raw.toString('utf16le').replace(/^\uFEFF/, '');
  return raw.toString('utf8');
}

const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function visibleLines(file) {
  const html = readSnapshot(file)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const text = html
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;|&#39;|&rsquo;|’/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&mdash;/g, '-');
  return text.split('\n').map(s => s.trim()).filter(Boolean);
}

/** 单行文本（把整页压成一行，便于按句子锚点切片） */
function visibleText(file) {
  return visibleLines(file).join(' ').replace(/\s+/g, ' ');
}

function windowFrom(lines, anchor, n, from = 0) {
  const at = lines.findIndex((line, index) => index >= from && line.includes(anchor));
  if (at < 0) throw new Error(`锚点找不到：${anchor}`);
  return lines.slice(at, at + n);
}

/** 以 anchor 为中心截一段**压缩成单行**的可见文本（空白折叠为单空格；找不到锚点抛错） */
function textWindow(text, anchor, span) {
  const at = text.indexOf(anchor);
  if (at < 0) throw new Error(`锚点找不到（单行文本）：${anchor}`);
  return text.slice(Math.max(0, at - span), at + span);
}

function headersOf(file) {
  if (!fs.existsSync(file)) return '(缺 .hdr 快照)';
  return readSnapshot(file).trim();
}

/* ------------------------------- 快照清单 ------------------------------- */

const SNAPSHOTS = {
  'news-sonnet55-root.html': {
    url: 'https://www.anthropic.com/claude-sonnet-5-5',
    label: '官方发布稿：Introducing Claude Sonnet 5.5（页面自印日期 September 28, 2026）'
  },
  'news-haiku55-root.html': {
    url: 'https://www.anthropic.com/claude-haiku-5-5',
    label: '官方发布稿：Introducing Claude Haiku 5.5（页面自印日期 October 7, 2026）—— **缓存读取价减半就在这里**'
  },
  'claudecom-pricing-today.html': {
    url: 'https://claude.com/pricing',
    label: '官方出账页（API tab）—— 冲突格的现场'
  },
  'claudecom-platform-api-today.html': {
    url: 'https://claude.com/platform/api',
    label: '官方平台页的同款价格模块（同一出处的第二个入口）'
  },
  'platform_claude_com_llms_txt.body': {
    url: 'https://platform.claude.com/llms.txt',
    label: '官方文档索引（**未被区域门拦**，是唯一可达的 docs 入口）'
  }
};

const out = [];
out.push('# anthropic Sonnet 5.5 缓存读取价：取证片段（Tier-1）');
out.push('');
out.push(`复核日：${DATE}；出口：香港（见各 \`.hdr\` 快照里的 CF-RAY …-HKG）。`);
out.push('本文件只放**逐字片段**；完整 HTML 原件在 `.arch-v1/raw-dumps-anthropic/`（本机、不入库）。');
out.push('');
out.push('| 快照 | 字节 | sha256（前 16） | URL | 说明 |');
out.push('|---|---|---|---|---|');
for (const [file, meta] of Object.entries(SNAPSHOTS)) {
  const full = path.join(RAW, file);
  if (!fs.existsSync(full)) { out.push(`| \`${file}\` | (缺) | — | <${meta.url}> | ${meta.label} |`); continue; }
  out.push(`| \`${file}\` | ${fs.statSync(full).size} | \`${sha256(full).slice(0, 16)}\` | <${meta.url}> | ${meta.label} |`);
}
out.push('');

/* ------------------------- ① 官方发布稿：Sonnet 5.5 ------------------------- */

{
  const file = path.join(RAW, 'news-sonnet55-root.html');
  const lines = visibleLines(file);
  const text = visibleText(file);
  out.push('## ① 官方发布稿（2026-09-28）：Sonnet 5.5 的缓存读取价 **$0.20** —— 记录当时是对的');
  out.push('');
  out.push('URL：<https://www.anthropic.com/claude-sonnet-5-5>（HTTP 200）');
  out.push('');
  out.push('页面自印日期（逐字）：');
  out.push('');
  out.push('```');
  out.push(windowFrom(lines, 'September 28, 2026', 4).join('\n'));
  out.push('```');
  out.push('');
  out.push('「Cost.」段（逐字）：');
  out.push('');
  out.push('```');
  out.push(windowFrom(lines, 'is priced the same as Sonnet 5', 6).join('\n'));
  out.push('```');
  out.push('');
  out.push('价格表（逐字，**空白已折叠为单空格**；表头两列 = Claude Sonnet 5.5 / Claude Opus 5.5）：');
  out.push('');
  out.push('```');
  out.push('… ' + textWindow(text, 'Price per 1M tokens', 260) + ' …');
  out.push('```');
  out.push('');
}

/* ------------------------- ② 官方发布稿：Haiku 5.5 ------------------------- */

{
  const file = path.join(RAW, 'news-haiku55-root.html');
  const lines = visibleLines(file);
  const text = visibleText(file);
  const at = text.indexOf('halving the price');
  if (at < 0) throw new Error('锚点找不到：halving the price');
  out.push('## ② 官方发布稿（2026-10-07）：**把 Sonnet 5.5 的缓存读取价减半** —— 变更记录在这里');
  out.push('');
  out.push('URL：<https://www.anthropic.com/claude-haiku-5-5>（HTTP 200）');
  out.push('');
  out.push('页面自印日期（逐字）：');
  out.push('');
  out.push('```');
  out.push(windowFrom(lines, 'October 7, 2026', 4).join('\n'));
  out.push('```');
  out.push('');
  out.push('「减半」原文（逐字，单行上下文）：');
  out.push('');
  out.push('```');
  out.push('… ' + text.slice(Math.max(0, at - 190), at + 210) + ' …');
  out.push('```');
  out.push('');
  out.push('同页价格表（逐字，**空白已折叠为单空格**；表头三列 = Haiku 5.5（≤/>100k）/ Haiku 4.5 / Sonnet 5.5）：');
  out.push('');
  out.push('```');
  out.push('… ' + textWindow(text, 'Price per 1 million tokens', 320) + ' …');
  out.push('```');
  out.push('');
  out.push('「Further updates」段（逐字，**空白已折叠为单空格**）—— **这是本任务要的官方变更记录**（含旧值与新值）：');
  out.push('');
  out.push('```');
  out.push('… ' + textWindow(text, 'lowering the price of cache reads', 420) + ' …');
  out.push('```');
  out.push('');
}

/* --------------------- ③ 官方出账页（今天）= 冲突格的现场 --------------------- */

{
  const file = path.join(RAW, 'claudecom-pricing-today.html');
  const lines = visibleLines(file);
  const start = lines.findIndex(line => line === 'Batch processing');
  const block = windowFrom(lines, 'Batch processing', 130, Math.max(0, start));
  out.push('## ③ 官方出账页（2026-10-08 重抓）：Sonnet 5.5 缓存读取 = **$0.10**；legacy Sonnet 5 = $0.20');
  out.push('');
  out.push('URL：<https://claude.com/pricing>（HTTP 200，API tab）');
  out.push('');
  out.push('```');
  out.push(block.join('\n'));
  out.push('```');
  out.push('');
  out.push('（窗口从 API tab 的 `Batch processing` 起 130 行：现行 4 个模型 + `Legacy models` 区的 Haiku 4.5 / Sonnet 5。）');
  out.push('');
  out.push('⇒ 这一页就是 t8 记下的那个冲突格的**今日现场**；它**不是**「记录取错行」的证据 ——');
  out.push('   同页 legacy `Sonnet 5` 的 $0.20 是**另一个模型**的价，而 Sonnet 5.5 在 9-28 时**确实**是 $0.20（见 ①）。');
  out.push('');
}

/* ------------------------------- ④ 可达性矩阵 ------------------------------- */

const reachability = [];
const probe = (url, hdrFile) => {
  const hdr = fs.existsSync(hdrFile) ? readSnapshot(hdrFile) : '';
  const status = (hdr.match(/HTTP\/[\d.]+ (\d{3})/g) || []).join(' → ') || '(无 .hdr)';
  const locations = (hdr.match(/^(?:location|Location): (.+)$/gm) || []).map(s => s.replace(/^[Ll]ocation: /, '').trim());
  reachability.push({ url, status, redirects: locations, headers: hdr.trim(), kind: locations.some(l => /app-unavailable-in-region/.test(l)) ? '区域门' : '可达' });
};

probe('https://platform.claude.com/llms.txt', path.join(RAW, 'platform_claude_com_llms_txt.hdr'));
probe('https://platform.claude.com/llms-full.txt', path.join(RAW, 'platform_claude_com_llms_full_txt.hdr'));
probe('https://platform.claude.com/docs/en/about-claude/pricing.md', path.join(RAW, 'platform_claude_com_docs_en_about_claude_pricing_md.hdr'));
probe('https://platform.claude.com/docs/en/release-notes/overview.md', path.join(RAW, 'platform_claude_com_docs_en_release_notes_overview_md.hdr'));
probe('https://anthropic.mintlify.app/docs/en/about-claude/pricing', path.join(RAW, 'anthropic_mintlify_app_docs_en_about_claude_pricing.hdr'));
probe('https://claude.mintlify.app/docs/en/about-claude/pricing', path.join(RAW, 'claude_mintlify_app_docs_en_about_claude_pricing.hdr'));
probe('https://web.archive.org/cdx/search/cdx?...pricing', path.join(RAW, 'web_archive_org_cdx_search_cdx_url_platform_claude_com_docs_en_about_claude_pricing_output_json_limit_30.hdr'));

fs.writeFileSync(path.join(DIR, 'reachability.json'), JSON.stringify({
  task: 'anthropic-cached-price-v1',
  date: DATE,
  egress: '香港（HKG）',
  note: '状态串按 .hdr 快照里出现的顺序排列；region-gate 判据 = 跳转目标里出现 app-unavailable-in-region',
  probes: reachability
}, null, 2) + '\n', 'utf8');

out.push('## ④ 可达性矩阵（照实记；`区域门` = 307→`claude.com/app-unavailable-in-region`）');
out.push('');
out.push('| URL | 状态串 | 性质 |');
out.push('|---|---|---|');
for (const row of reachability) out.push(`| <${row.url}> | \`${row.status}\` | ${row.kind} |`);
out.push('');
out.push('另有从本网络**连不上**（不是区域门，是连接失败）：`web.archive.org` / `archive.org`（21s 超时）、');
out.push('`r.jina.ai`（21s 超时）、`api.codetabs.com` 与 `api.allorigins.win`（522）、`raw.githubusercontent.com`（连接被重置）。');
out.push('');

/* -------------------------------- ⑤ 时间线 -------------------------------- */

const timeline = [
  { date: '2026-09-28', what: '官方发布 Claude Sonnet 5.5：cache reads **$0.20**/MTok', url: 'https://www.anthropic.com/claude-sonnet-5-5', kind: 'official' },
  { date: '2026-10-01', what: '记录采集/核验（`verifiedAt`/`capturedAt`）：Sonnet 5.5 `cachedInput = 0.2`，引文「Hits and refreshes $0.20 / MTok」', url: 'scripts/data/curated_api_plans.json', kind: 'record' },
  { date: '2026-10-07', what: '官方发布 Claude Haiku 5.5，同时宣布「We\'re halving the price of Claude Sonnet 5.5\'s cache reads」⇒ 同页价格表 Sonnet 5.5 cache reads **$0.10**', url: 'https://www.anthropic.com/claude-haiku-5-5', kind: 'official' },
  { date: '2026-10-08', what: '出账页现场：claude.com/pricing API tab Sonnet 5.5 Read **$0.10**；legacy Sonnet 5 Read $0.20', url: 'https://claude.com/pricing', kind: 'official' },
  { date: '2026-10-08', what: '第三方快讯（仅线索，非官方）标题即「Anthropic 将 Claude Sonnet 5.5 缓存读取价格减半至每百万 token $0.10」', url: 'https://www.lumevalley.com/article-10846.html', kind: 'third-party' }
];
fs.writeFileSync(path.join(DIR, 'timeline.json'), JSON.stringify({ task: 'anthropic-cached-price-v1', date: DATE, timeline }, null, 2) + '\n', 'utf8');

out.push('## ⑤ 时间线');
out.push('');
out.push('| 日期 | 事实 | 出处 |');
out.push('|---|---|---|');
for (const row of timeline) out.push(`| ${row.date} | ${row.what} | <${row.url}>（${row.kind}） |`);
out.push('');
out.push('⇒ 记录在**采集时是对的**；官方在**采集之后**（10-07）把缓存读取价减半。');
out.push('');

fs.writeFileSync(path.join(DIR, 'price-change-evidence.md'), out.join('\n') + '\n', 'utf8');

console.log('写出：price-change-evidence.md · reachability.json · timeline.json');
for (const row of reachability) console.log(`  ${row.kind.padEnd(4)} ${row.status.padEnd(28)} ${row.url}`);
console.log(`  快照 ${Object.keys(SNAPSHOTS).length} 份（含缺失检查）`);
