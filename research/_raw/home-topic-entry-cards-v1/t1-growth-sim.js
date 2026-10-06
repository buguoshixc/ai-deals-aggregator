/**
 * T1 冲突算术实测：nav.needs 增高 δ 后，首屏「完整可见」卡片数怎么变。
 *
 * 为什么要实测而不是算：T1 的结论是「verify-site.js 的首屏硬断言 ≥9 与基线
 * firstScreenFull=9 会被本轮打破」，这个结论必须能当场复现。
 * 做法：只读 dist/，在**运行时**给 nav.needs 注入 padding（不改任何文件、不构建），
 * 逐个 δ 量 firstScreenFull / firstScreenPart / slack，与 T2 的目标高度对齐。
 *
 * 得到的 δ 取值来自 t1 契约（不是猜的）：现高 31px（本目录 t1-baseline-measure.json 实测），
 * Topic Card 目标 nav 区高度 145-175px ⇒ δ = 145-31 = 114 与 175-31 = 144。
 * 额外跑 δ=1 与 δ=2，用来验证「slack 只有 1px」这句话。
 */
'use strict';
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.join(__dirname, '..', '..', '..');
const DIR = path.join(ROOT, 'dist');
const EDGE = process.env.DSH_EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8' };

function serve(dir) {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
      let file = path.join(dir, rel);
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end('nf'); return; }
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

(async () => {
  const { server, port } = await serve(DIR);
  const base = `http://127.0.0.1:${port}/`;
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(base, { waitUntil: 'load' });
  await waitForApp(page);

  const measure = () => page.evaluate(() => {
    const nav = document.querySelector('nav.needs');
    const cards = [...document.querySelectorAll('article.g')];
    const vh = window.innerHeight;
    const rects = cards.map(c => c.getBoundingClientRect());
    const full = rects.filter(b => b.bottom <= vh);              // ← 与 verify-site.js:255 逐字同口径
    const part = rects.filter(b => b.top < vh);                  // ← 与 verify-site.js:256 逐字同口径
    const lastFull = full.length ? Math.max(...full.map(b => b.bottom)) : null;
    const grid = document.querySelector('.grid');
    return {
      navH: +nav.getBoundingClientRect().height.toFixed(3),
      gridTop: +grid.getBoundingClientRect().top.toFixed(3),
      firstScreenFull: full.length,
      firstScreenPart: part.length,
      lastFullBottom: lastFull === null ? null : +lastFull.toFixed(3),
      slack: lastFull === null ? null : +(vh - lastFull).toFixed(3),
      pageHeight: Math.round(document.documentElement.scrollHeight)
    };
  });

  const rows = [];
  for (const delta of [0, 1, 2, 114, 144]) {
    await page.evaluate(d => {
      const nav = document.querySelector('nav.needs');
      nav.style.paddingBottom = d + 'px';
      nav.style.boxSizing = 'content-box';
    }, delta);
    await page.waitForTimeout(80);
    rows.push({ delta, targetNavH: 31 + delta, ...(await measure()) });
  }
  await page.evaluate(() => { const nav = document.querySelector('nav.needs'); nav.style.paddingBottom = ''; nav.style.boxSizing = ''; });
  await page.waitForTimeout(80);
  rows.push({ delta: 'restored', targetNavH: 31, ...(await measure()) });

  await browser.close();
  server.close();
  console.log(JSON.stringify({ note: 'δ 只用运行时内联样式注入，未改任何文件', rows }, null, 2));
})().catch(e => { console.error(e); process.exit(1); });
