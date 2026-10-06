/**
 * T1 基线冻结：1440×900 的 Before 读数（只读）。
 *
 * 为什么要有这个脚本：T1 的验收要求「报告里没有未经实测才写下的数字」。
 * 本脚本只 **读** dist/（用只读静态服务器 + headless Edge），不构建、不写任何产物文件，
 * 输出 JSON 到 stdout，由调用方重定向到 research/_raw/home-topic-entry-cards-v1/ 下。
 *
 * 取得方式（每个数字都来自这里，不是手抄）：
 *   · 浏览器：C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe（headless）
 *   · 驱动：node_modules/playwright-core（与 scripts/tools/verify-site.js 同一套启动方式）
 *   · 视口：1440x900
 *   · 加载：page.goto(base, { waitUntil: 'load' }) 后等 waitForApp()
 *     —— 判据与 verify-site.js 一致：#lastUpdated 从 '--' 变成真实时间戳，
 *     那一刻 bindEvents()/render() 已在同一个 .then 里跑完（应用已接管）。
 *   · 测量：getBoundingClientRect() / getComputedStyle()，在页面里取原始浮点，再 round 后落盘。
 *
 * slack 的定义（本文件里唯一一处定义，其它地方引用它）：
 *   slackFull = viewportH - (首屏最后一张「完整可见」卡片 bottom)
 *   含义：nav.needs 再增高 slackFull px，那张卡片就会掉出「完整可见」——
 *   实测 slackFull ≈ 1px 时，任何 ≥1px 的增高都会让 firstScreenFull 少一行（3 张）。
 */
'use strict';
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.join(__dirname, '..', '..', '..');
const DIR = path.join(ROOT, process.argv.find(a => a.startsWith('--dir='))?.slice(6) || 'dist');
const EDGE = process.env.DSH_EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8'
};

function serve(dir) {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
      let file = path.join(dir, rel);
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404).end('not found');
        return;
      }
      res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

async function waitForApp(page, timeout = 20000) {
  await page.waitForFunction(() => {
    const el = document.getElementById('lastUpdated');
    return !!el && el.textContent.trim() !== '' && el.textContent.trim() !== '--';
  }, { timeout });
  await page.waitForTimeout(120);
}

const PROBE = () => {
  const r = el => {
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { top: +b.top.toFixed(2), bottom: +b.bottom.toFixed(2), left: +b.left.toFixed(2), right: +b.right.toFixed(2), width: +b.width.toFixed(2), height: +b.height.toFixed(2) };
  };
  const nav = document.querySelector('nav.needs');
  const grid = document.querySelector('.grid');
  const cards = [...document.querySelectorAll('article.g')];
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  const cardRects = cards.map(c => c.getBoundingClientRect());
  const full = cardRects.filter(b => b.bottom <= vh + 0.5);
  const part = cardRects.filter(b => b.top < vh);
  const lastFullBottom = full.length ? Math.max(...full.map(b => b.bottom)) : null;
  // 网格行几何：按 top 去重，得到每行的 top / 行内张数
  const rowTops = [...new Set(cardRects.map(b => +b.top.toFixed(2)))].sort((a, b) => a - b);
  const rows = rowTops.map(t => ({
    top: t,
    n: cardRects.filter(b => +b.top.toFixed(2) === t).length,
    height: +cardRects.find(b => +b.top.toFixed(2) === t).height.toFixed(2)
  }));
  const gap = getComputedStyle(grid || document.body).rowGap;
  const navLinks = nav ? [...nav.querySelectorAll('a')] : [];
  const navLinkTops = [...new Set(navLinks.map(a => +a.getBoundingClientRect().top.toFixed(2)))].sort((a, b) => a - b);
  const navStyle = nav ? getComputedStyle(nav) : null;
  // 筛选器（Filter Chip）区域：留作 64-80px 那类判据的对照物
  const facetWrap = document.querySelector('.facets') || document.querySelector('[data-facet]')?.parentElement || null;
  const facets = [...document.querySelectorAll('[data-facet]')];
  const facetRects = facets.map(f => f.getBoundingClientRect());
  return {
    viewport: { w: vw, h: vh },
    navNeeds: nav ? r(nav) : null,
    navNeedsExists: Boolean(nav),
    navStyle: navStyle ? {
      display: navStyle.display, overflowX: navStyle.overflowX, overflowY: navStyle.overflowY,
      gridTemplateColumns: navStyle.gridTemplateColumns, gap: navStyle.gap, marginBottom: navStyle.marginBottom
    } : null,
    navLinks: {
      count: navLinks.length,
      tagNames: [...new Set(navLinks.map(a => a.tagName))],
      rowTops: navLinkTops,
      perRow: navLinkTops.map(t => navLinks.filter(a => +a.getBoundingClientRect().top.toFixed(2) === t).length),
      heights: [...new Set(navLinks.map(a => +a.getBoundingClientRect().height.toFixed(2)))],
      widths: [...new Set(navLinks.map(a => +a.getBoundingClientRect().width.toFixed(2)))],
      allInViewport: navLinks.every(a => { const b = a.getBoundingClientRect(); return b.width > 0 && b.left >= 0 && b.right <= vw + 1; }),
      clipped: navLinks.filter(a => a.scrollWidth > a.clientWidth + 1).length,
      zombieClasses: ['nl-full', 'nl-short', 'nlinks', 'ngroup', 'nsep', 'nlb', 'nl']
        .filter(c => document.querySelectorAll('nav.needs .' + c).length > 0),
      controls: nav ? nav.querySelectorAll('button,input,select,[role="button"],[aria-pressed],[data-facet]').length : null
    },
    groupBoxes: [...document.querySelectorAll('nav.needs .nlinks')].map(box => ({
      ...r(box),
      links: box.querySelectorAll('a').length,
      gridTemplateRows: getComputedStyle(box).gridTemplateRows
    })),
    grid: grid ? { ...r(grid), rowGap: gap, colGap: getComputedStyle(grid).columnGap, cols: getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length } : null,
    cards: { count: cards.length, heights: [...new Set(cardRects.map(b => Math.round(b.height)))], rows },
    firstScreenFull: full.length,
    firstScreenPart: part.length,
    lastFullBottom: lastFullBottom === null ? null : +lastFullBottom.toFixed(2),
    slackFull: lastFullBottom === null ? null : +(vh - lastFullBottom).toFixed(2),
    pageHeight: Math.round(document.documentElement.scrollHeight),
    docScrollW: document.documentElement.scrollWidth,
    docClientW: document.documentElement.clientWidth,
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    facets: {
      count: facets.length,
      wrap: facetWrap ? r(facetWrap) : null,
      minH: facetRects.length ? +Math.min(...facetRects.map(b => b.height)).toFixed(2) : null,
      maxH: facetRects.length ? +Math.max(...facetRects.map(b => b.height)).toFixed(2) : null,
      tagNames: [...new Set(facets.map(f => f.tagName))]
    },
    bodyText: document.body.innerText.length
  };
};

(async () => {
  if (!fs.existsSync(path.join(DIR, 'index.html'))) { console.error('no dist/index.html'); process.exit(1); }
  const { server, port } = await serve(DIR);
  const base = `http://127.0.0.1:${port}/`;
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const out = { base, distIndexMtime: fs.statSync(path.join(DIR, 'index.html')).mtime.toISOString(), probes: {} };

  // ── 有 JS：1440×900（本轮 Before 的主读数）
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(base, { waitUntil: 'load' });
  await waitForApp(page);
  out.probes['1440x900'] = await page.evaluate(PROBE);

  // ── 无 JS：1440×900（预渲染口径，入口行必须仍在）
  const noJsCtx = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });
  const noJs = await noJsCtx.newPage();
  await noJs.goto(base, { waitUntil: 'load' });
  out.probes['1440x900-nojs'] = await noJs.evaluate(() => {
    const nav = document.querySelector('nav.needs');
    const links = nav ? [...nav.querySelectorAll('a')] : [];
    return {
      navNeedsExists: Boolean(nav),
      navLinks: links.length,
      isAnchorAll: links.every(a => a.tagName === 'A'),
      labels: links.map(a => (a.textContent || '').replace(/\s+/g, ' ').trim()),
      hrefs: links.map(a => a.getAttribute('href')),
      navHeight: nav ? +nav.getBoundingClientRect().height.toFixed(2) : null,
      gridTop: document.querySelector('.grid') ? +document.querySelector('.grid').getBoundingClientRect().top.toFixed(2) : null,
      cards: document.querySelectorAll('article.g').length,
      pageHeight: Math.round(document.documentElement.scrollHeight),
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth
    };
  });

  // ── 窄屏几何（禁止横向滚动 / 入口不得被裁）：只读，不改视口尺寸以外的任何东西
  for (const w of [1600, 1280, 768, 430, 390, 360]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(180);
    out.probes[`${w}x900`] = await page.evaluate(PROBE);
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  await browser.close();
  server.close();
  console.log(JSON.stringify(out, null, 2));
})().catch(e => { console.error(e); process.exit(1); });
