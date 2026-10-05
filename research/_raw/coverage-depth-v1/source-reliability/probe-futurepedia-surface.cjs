#!/usr/bin/env node
/**
 * 只读取证（t4 / Workstream C-1）：futurepedia 的**可采面**（surface）测量。
 *
 * 为什么要有它：「独有候选价值」不能只看首页那 7 张卡 —— 还得量出这个来源**还有多大面**。
 * 本探针量三件事（都是公开 GET）：
 *   1. 首页：生产解析器 parseFuturepediaList() 能取到多少条（现状产出的上限）；
 *   2. sitemap.xml / sitemap_tools.xml：站点自报的页面规模（<loc> 计数、样本）；
 *   3. 其中有多少是 /tool/ 页（= 目录规模），有没有 /deal 之类的优惠栏目。
 *
 * 这些数字是「repair 的空间有多大」的经验证据，**不是**「应该 repair」的结论：
 * sitemap 里的页面是工具页，不等于「可领取的优惠」。
 *
 * 用法：node probe-futurepedia-surface.cjs
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const { DEFAULT_UA } = require(path.join(ROOT, 'scripts', 'lib', 'http'));
const registry = require(path.join(ROOT, 'scripts', 'collectors'));

const HEADERS = { 'User-Agent': DEFAULT_UA, Referer: 'https://www.futurepedia.io/' };
const nowIso = () => new Date().toISOString();

async function get(url, timeout = 30000) {
  const started = Date.now();
  const res = await axios.get(url, { timeout, headers: HEADERS, validateStatus: () => true, maxRedirects: 5, responseType: 'text' });
  const body = typeof res.data === 'string' ? res.data : String(res.data);
  return { url, status: res.status, ms: Date.now() - started, bytes: body.length, body };
}

function countLoc(body) {
  const matches = body.match(/<loc>\s*([^<]+?)\s*<\/loc>/gi) || [];
  const urls = matches.map(m => m.replace(/<\/?loc>/gi, '').trim());
  return { count: urls.length, urls };
}

async function main() {
  const out = { probe: 'probe-futurepedia-surface.cjs', ranAtUtc: nowIso(), ranAtLocal: new Date().toString(), parts: {} };

  const collector = registry.all({}).find(c => c.id === 'futurepedia');
  const home = await get('https://www.futurepedia.io/');
  const parsed = collector && collector.parse ? collector.parse(home.body) : [];
  const allLinks = (home.body.match(/<a\s[^>]*href=/gi) || []).length;
  const toolLinks = new Set((home.body.match(/href="(\/tool\/[^"?#]+)"/g) || []).map(h => h));
  out.parts.home = {
    status: home.status,
    bytes: home.bytes,
    parseItems: parsed.length,
    parseTitles: parsed.map(p => p.title),
    anchorCount: allLinks,
    uniqueToolHrefsInHtml: toolLinks.size,
    toolHrefsSample: [...toolLinks].slice(0, 20)
  };

  // 目录/列表页：sitemap.xml 里自报的 /ai-tools 落地页 —— 量它有多少 /tool/ 链接，
  // 这决定「repair（把采集器指向列表页）」到底有多少空间。
  for (const pathName of ['/ai-tools', '/ai-tools?page=2']) {
    try {
      const res = await get(`https://www.futurepedia.io${pathName}`);
      const items = collector && collector.parse ? collector.parse(res.body) : [];
      const hrefs = new Set((res.body.match(/href="(\/tool\/[^"?#]+)"/g) || []));
      out.parts[pathName] = {
        url: res.url, status: res.status, bytes: res.bytes,
        parseItems: items.length,
        parseTitlesSample: items.slice(0, 12).map(p => p.title),
        uniqueToolHrefsInHtml: hrefs.size
      };
    } catch (error) {
      out.parts[pathName] = { url: `https://www.futurepedia.io${pathName}`, error: String(error.message).slice(0, 200) };
    }
  }

  for (const name of ['sitemap.xml', 'sitemap_tools.xml']) {
    const url = `https://www.futurepedia.io/${name}`;
    try {
      const res = await get(url);
      const loc = countLoc(res.body);
      const byPattern = {
        tool: loc.urls.filter(u => /\/tool\//.test(u)).length,
        deal: loc.urls.filter(u => /\/deal/i.test(u)).length,
        ai: loc.urls.filter(u => /\/ai\//.test(u)).length
      };
      out.parts[name] = {
        url, status: res.status, bytes: res.bytes,
        locCount: loc.count, byPattern,
        sample: loc.urls.slice(0, 12),
        head: res.body.slice(0, 400)
      };
    } catch (error) {
      out.parts[name] = { url, error: String(error.message).slice(0, 200) };
    }
  }

  const outFile = path.join(__dirname, 'surface-futurepedia.json');
  fs.writeFileSync(outFile, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
  console.log(`[surface] home status=${out.parts.home.status} bytes=${out.parts.home.bytes} parseItems=${out.parts.home.parseItems} anchors=${out.parts.home.anchorCount} uniqueToolHrefs=${out.parts.home.uniqueToolHrefsInHtml}`);
  for (const name of ['sitemap.xml', 'sitemap_tools.xml']) {
    const p = out.parts[name];
    console.log(`[surface] ${name} status=${p.status} bytes=${p.bytes} loc=${p.locCount} byPattern=${JSON.stringify(p.byPattern)}${p.error ? ` error=${p.error}` : ''}`);
  }
  console.log(`[surface] 写出: ${outFile}`);
}

main().catch(error => {
  console.error(`[surface] 失败: ${error.stack || error.message}`);
  process.exit(1);
});
