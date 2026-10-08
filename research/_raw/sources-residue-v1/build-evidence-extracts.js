#!/usr/bin/env node
/**
 * 把本机抓下来的**官方页面快照**（HTML，Tier-3、不入库）里与本次裁定相关的
 * 可见文本片段抽成 Tier-1 证据（`.md`），并打印每份快照的 sha256 供 README 登记。
 *
 * 快照怎么来的（命令逐字写在输出文件的头部，可重跑）：
 *   curl -sS -L --max-redirs 5 -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" \
 *        -o <name>.html -D <name>.headers.txt -w "%{http_code} %{size_download}" <url>
 *
 * 用法：
 *   node research/_raw/sources-residue-v1/build-evidence-extracts.js
 *
 * 设计原则：**只抽片段、不做转述**。抽取的是「页面可见文本」的连续窗口，
 * 窗口边界用页面自己的锚点串定位（而不是行号），因此换一版快照仍能重跑。
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');

const DIR = __dirname;
const DATE = '2026-10-08';

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/**
 * 读快照并按需解压。**为什么要这一步**：本机实测 `curl` 不带 `--compressed` 时，
 * 腾讯云文档站仍以 `Content-Encoding: gzip` 返回（见 `cloud_tencent_*.headers.txt`），
 * 于是盘上的是 gzip 字节流 —— 直接当文本解析不会报错，只会得到一堆乱码，
 * 那正是「静默错误证据」的典型形状。这里显式识别 gzip 魔数并解压。
 */
function readSnapshot(file) {
  const raw = fs.readFileSync(file);
  if (raw[0] === 0x1f && raw[1] === 0x8b) return zlib.gunzipSync(raw).toString('utf8');
  return raw.toString('utf8');
}

/** HTML → 可见文本（与浏览器看到的文本节点顺序一致；脚本/样式先剥掉） */
function visibleText(html) {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&mdash;/g, '-');
  return text.split('\n').map(s => s.trim()).filter(Boolean);
}

/** 取「从 anchor 起 n 行」的窗口（找不到 anchor 时抛错 —— 宁可红，不要静默给空证据） */
function windowFrom(lines, anchor, n, from = 0) {
  const at = lines.findIndex((line, index) => index >= from && line.includes(anchor));
  if (at < 0) throw new Error(`锚点找不到：${anchor}`);
  return lines.slice(at, at + n);
}

function headerBlock(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim() : '(缺 headers 快照)';
}

/* ------------------------------- ① anthropic ------------------------------- */

function buildAnthropic() {
  const pricingHtml = path.join(DIR, 'claude_com_pricing.html');
  const out = [];
  out.push('# anthropic：重定向链与官方定价页可见原文（Tier-1）');
  out.push('');
  out.push(`抓取日：${DATE}（Asia/Shanghai；HTTP 头上的 Date 是 GMT，逐字见下）`);
  out.push('');
  out.push('本文件只放**结论所需的片段**：重定向链的原始响应头 + 定价页可见文本窗口。');
  out.push('完整的第三方 HTML 原件（`claude_com_pricing.html` / `claude_com_platform_api.html` 等，约 1 MB/份）');
  out.push('按 `docs/EVIDENCE-POLICY.md` §2/§3 **不入库**，本机保留；重跑命令：');
  out.push('');
  out.push('```bash');
  out.push('curl -sS -L --max-redirs 5 -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" \\');
  out.push('     -o claude_com_pricing.html -D claude_com_pricing.headers.txt \\');
  out.push('     -w "%{http_code} %{size_download}" https://claude.com/pricing');
  out.push('```');
  out.push('');

  out.push('## 1. 记录里 `officialUrl` 的那条 URL：逐跳响应头（`curl -L`，逐字）');
  out.push('');
  out.push('```');
  out.push('$ curl -sS -o NUL -D - --max-redirs 0 https://docs.anthropic.com/en/docs/about-claude/pricing');
  out.push(headerBlock(path.join(DIR, 'docs_anthropic_com_pricing.nofollow.headers.txt')));
  out.push('');
  out.push('$ curl -sS -o NUL -D - -L --max-redirs 10 https://platform.claude.com/docs/en/docs/about-claude/pricing');
  out.push(headerBlock(path.join(DIR, 'platform_claude_com_docs_en_docs_about_claude_pricing.headers.txt')));
  out.push('```');
  out.push('');
  out.push('链路（按上面的响应头逐字读出）：');
  out.push('');
  out.push('1. `https://docs.anthropic.com/en/docs/about-claude/pricing` → **301**，`Location: https://platform.claude.com/docs/en/docs/about-claude/pricing`（跨域；注意路径里 `docs` 出现两次）。');
  out.push('2. `https://platform.claude.com/docs/en/docs/about-claude/pricing` → **307**，`location: /docs/en/about-claude/pricing`（同域路径归一）。');
  out.push('3. `https://platform.claude.com/docs/en/about-claude/pricing` → **307**，`location: https://www.anthropic.com/app-unavailable-in-region?utm_source=country`（**区域门**：`app-unavailable-in-region`）。');
  out.push('4. `https://www.anthropic.com/app-unavailable-in-region?utm_source=country` → **301** → `https://claude.com/app-unavailable-in-region`。');
  out.push('5. `https://claude.com/app-unavailable-in-region` → **200**（终页是「该应用在当前地区不可用」说明页，不是定价页）。');
  out.push('');
  out.push('> 与 `NEXT-STEPS.md` §A.1 登记的读数的差别：§A.1 写的是「→ platform.claude.com → www.anthropic.com（营销首页，没有 API 价格表）」；');
  out.push('> **今天从本网络看，第 3 跳之后并不是营销首页，而是区域封锁页**（`app-unavailable-in-region`，HTTP 200 的说明页）。');
  out.push('> 两者结论方向一致（用户点到的不是定价页），但「终点是什么页面」这一条今日读数与登记不同，如实记下。');
  out.push('');

  out.push('## 2. 候选官方定价页：可达性与性质');
  out.push('');
  out.push('| 候选 URL | 结果 | 性质 |');
  out.push('|---|---|---|');
  out.push('| `https://claude.com/pricing` | **200**，1,191,415 bytes | Claude 官方「Plans & pricing」页，含 **API tab**（`/pricing#api`）的逐模型价格模块 |');
  out.push('| `https://claude.com/platform/api` | **200**，1,035,017 bytes | Claude Platform 落地页，含同源的同款价格模块 |');
  out.push('| `https://www.anthropic.com/pricing` | **301** → `https://claude.com/pricing` → 200 | 官网 pricing 入口已改指 claude.com |');
  out.push('| `https://platform.claude.com/docs/en/about-claude/pricing` | **307** → `…/app-unavailable-in-region` → 200 | 官方**详细**定价页，本网络**被区域封锁**，读不到正文 |');
  out.push('| `https://platform.claude.com/docs/en/about-claude/pricing.md` | 同上（区域封锁） | Mintlify 的 `.md` 变体同样被门拦住 |');
  out.push('| `https://docs.claude.com/en/docs/about-claude/pricing` | **302** → `platform.claude.com/docs/en/about-claude/pricing` → 区域封锁 | 旧文档域现在是 302 跳板 |');
  out.push('| `https://platform.claude.com/docs/en/home` | 区域封锁 | 连 Console 文档首页也拦 |');
  out.push('| `https://claude.com/pricing.md` | **404** | 没有 `.md` 变体 |');
  out.push('| `https://platform.claude.com/` | **403**（Cloudflare「Just a moment...」） | 控制台首页人机校验 |');
  out.push('');
  out.push('`claude.com/pricing` 页面自己给「详细定价」的出口是这三个（从 HTML 里抓到的 `href`，逐字）：');
  out.push('');
  out.push('```html');
  out.push('href="https://platform.claude.com/docs/en/about-claude/pricing"');
  out.push('href="https://platform.claude.com/docs/en/about-claude/pricing#fast-mode-pricing"');
  out.push('href="https://platform.claude.com/docs/en/about-claude/pricing#specific-tool-pricing"');
  out.push('```');
  out.push('');
  out.push('⇒ 官方自己认定的「详细定价页」仍是 `platform.claude.com/docs/en/about-claude/pricing`；');
  out.push('**可达的那一页（claude.com/pricing#api）是它的摘要版**。这是本条裁定「不改数据」的主要理由之一。');
  out.push('');

  if (fs.existsSync(pricingHtml)) {
    const lines = visibleText(readSnapshot(pricingHtml));
    const start = lines.findIndex(line => line === 'Batch processing');
    const block = windowFrom(lines, 'Batch processing', 150, Math.max(0, start));
    out.push('## 3. `claude.com/pricing#api` 的 API 价格模块：可见文本窗口（逐字）');
    out.push('');
    out.push(`快照 \`claude_com_pricing.html\` sha256 = \`${sha256(pricingHtml)}\``);
    out.push('');
    out.push('```');
    out.push(block.join('\n'));
    out.push('```');
    out.push('');
    out.push('（窗口从 API tab 的 `Batch processing` 小标题起 150 行；含现行模型 4 条 + `Legacy models` 区块的 Haiku 4.5 / Sonnet 5。）');
    out.push('');
  } else {
    out.push('## 3. （缺快照 `claude_com_pricing.html`，无法抽出可见文本窗口）');
    out.push('');
  }
  fs.writeFileSync(path.join(DIR, 'anthropic-pricing-visible-lines.md'), out.join('\n') + '\n', 'utf8');
  return pricingHtml;
}

/* -------------------------------- ② tencent -------------------------------- */

function buildTencent() {
  const html = path.join(DIR, 'cloud_tencent_1729_97731.html');
  const out = [];
  out.push('# 腾讯混元计费页：今日原文片段（Tier-1）');
  out.push('');
  out.push(`抓取日：${DATE}；URL：<https://cloud.tencent.com/document/product/1729/97731>`);
  out.push('');
  out.push('原件 `cloud_tencent_1729_97731.html`（49,938 bytes）按证据政策不入库；重跑命令：');
  out.push('');
  out.push('```bash');
  out.push('curl -sS -L --max-redirs 5 -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" \\');
  out.push('     -o cloud_tencent_1729_97731.html -D cloud_tencent_1729_97731.headers.txt \\');
  out.push('     -w "%{http_code} %{size_download}" https://cloud.tencent.com/document/product/1729/97731');
  out.push('```');
  out.push('');
  out.push('响应头（逐字）：');
  out.push('');
  out.push('```');
  out.push(headerBlock(path.join(DIR, 'cloud_tencent_1729_97731.headers.txt')));
  out.push('```');
  out.push('');

  if (!fs.existsSync(html)) {
    out.push('（缺快照，无法抽片段）');
    fs.writeFileSync(path.join(DIR, 'hunyuan-pricing-visible-lines.md'), out.join('\n') + '\n', 'utf8');
    return html;
  }

  const lines = visibleText(readSnapshot(html));
  out.push(`快照 sha256 = \`${sha256(html)}\``);
  out.push('');
  out.push('页面自报的更新时间（逐字；表头与值在 DOM 里是相邻的两行）：');
  out.push('');
  out.push('```');
  out.push(windowFrom(lines, '最近更新时间', 3).join('\n'));
  out.push('```');
  out.push('');

  out.push('## 1. 顶部迁移公告（逐字，窗口从公告首句起 7 行）');
  out.push('');
  out.push('```');
  out.push(windowFrom(lines, '为进一步提升大模型服务体验', 7).join('\n'));
  out.push('```');
  out.push('');

  out.push('## 2. 免费额度表（逐字，窗口从发放说明起 24 行）');
  out.push('');
  out.push('```');
  out.push(windowFrom(lines, '免费调用额度将以一次性的免费资源包的形式发放', 24).join('\n'));
  out.push('```');
  out.push('');

  out.push('## 3. token 后付费价格表（逐字，窗口从表头「刊例价」起 40 行）');
  out.push('');
  out.push('```');
  out.push(windowFrom(lines, '刊例价（每 百万 tokens）', 40).join('\n'));
  out.push('```');
  out.push('');

  out.push('## 4. 计费示例（逐字，窗口从示例首句起 8 行）');
  out.push('');
  out.push('```');
  out.push(windowFrom(lines, '用户当月首次使用', 8).join('\n'));
  out.push('```');
  out.push('');

  fs.writeFileSync(path.join(DIR, 'hunyuan-pricing-visible-lines.md'), out.join('\n') + '\n', 'utf8');
  return html;
}

const a = buildAnthropic();
const t = buildTencent();
console.log('wrote anthropic-pricing-visible-lines.md / hunyuan-pricing-visible-lines.md');
for (const file of [a, t]) {
  if (fs.existsSync(file)) console.log(`sha256 ${path.basename(file)} = ${sha256(file)}`);
}
