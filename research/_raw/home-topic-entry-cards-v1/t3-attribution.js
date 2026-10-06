#!/usr/bin/env node
/**
 * T3 归因实验：**证明**这一轮首屏密度的下降（9→6 张 / 13→10 行）只由「专题导航卡把这一块
 * 从 31px 抬到 153px」造成，而不是别的东西漂了。
 *
 * 手法：不改任何文件、不重建 —— 在运行时把 `nav.needs` 压回 Before 的 31px
 * （`height:31px + overflow:hidden`，inline !important），其余一切照旧，再测同一组读数。
 * 如果 firstScreenFull 回到 9、网格起点回到 227px、页高回到 4665px、列表视图回到 13 行，
 * 那么差值就**只**属于这一块（δ = +122px）。
 *
 * 用法：node research/_raw/home-topic-entry-cards-v1/t3-attribution.js
 * 输出：stdout（人读）+ t3-attribution.json
 */
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.join(__dirname, '..', '..', '..');
const DIR = path.join(ROOT, 'dist');
const EDGE = process.env.DSH_EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = path.join(__dirname, 't3-attribution.json');
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
      if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end('not found'); return; }
      res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}
async function waitForApp(page) {
  await page.waitForFunction(() => {
    const el = document.getElementById('lastUpdated');
    return !!el && el.textContent.trim() !== '' && el.textContent.trim() !== '--';
  }, { timeout: 20000 });
  await page.waitForTimeout(120);
}

const CARD_VIEW = () => {
  const cards = [...document.querySelectorAll('article.g')];
  const grid = document.querySelector('.grid');
  const nav = document.querySelector('nav.needs');
  const full = cards.filter(c => c.getBoundingClientRect().bottom <= window.innerHeight);
  const part = cards.filter(c => c.getBoundingClientRect().top < window.innerHeight);
  const lastFull = full.length ? Math.max(...full.map(c => c.getBoundingClientRect().bottom)) : null;
  return {
    needsHeight: +nav.getBoundingClientRect().height.toFixed(2),
    gridTop: +grid.getBoundingClientRect().top.toFixed(2),
    firstScreenFull: full.length,
    firstScreenPart: part.length,
    lastFullBottom: lastFull === null ? null : +lastFull.toFixed(2),
    slackFull: lastFull === null ? null : +(window.innerHeight - lastFull).toFixed(2),
    pageHeight: Math.round(document.documentElement.scrollHeight),
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth
  };
};
const ROW_VIEW = () => {
  const rows = [...document.querySelectorAll('.r')];
  const nav = document.querySelector('nav.needs');
  const first = rows[0];
  return {
    needsHeight: +nav.getBoundingClientRect().height.toFixed(2),
    rows: rows.length,
    rowsVisible: rows.filter(r => r.getBoundingClientRect().bottom <= window.innerHeight).length,
    listTop: first ? +first.getBoundingClientRect().top.toFixed(2) : null,
    rowHeight: first ? Math.round(first.getBoundingClientRect().height) : null,
    pageHeight: Math.round(document.documentElement.scrollHeight)
  };
};
const COMPRESS = () => {
  const nav = document.querySelector('nav.needs');
  nav.style.setProperty('height', '31px', 'important');
  nav.style.setProperty('overflow', 'hidden', 'important');
};

(async () => {
  const started = await serve(DIR);
  const base = `http://127.0.0.1:${started.port}/`;
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // A) 卡片视图：现状 vs 运行时压回 31px
  await page.goto(base, { waitUntil: 'load' });
  await waitForApp(page);
  const cardsAfter = await page.evaluate(CARD_VIEW);
  await page.evaluate(COMPRESS);
  await page.waitForTimeout(200);
  const cardsCompressed = await page.evaluate(CARD_VIEW);

  // B) 列表视图：同一份 dist，先量现状、再量压回 31px 之后
  await page.goto(base, { waitUntil: 'load' });
  await waitForApp(page);
  await page.click('#viewSeg [data-view="rows"]');
  await page.waitForTimeout(400);
  const rowsAfter = await page.evaluate(ROW_VIEW);
  await page.evaluate(COMPRESS);
  await page.waitForTimeout(300);
  const rowsCompressed = await page.evaluate(ROW_VIEW);
  await page.evaluate(() => { try { localStorage.removeItem('dsh.view'); } catch (e) {} });
  await browser.close();
  started.server.close();

  const out = {
    generatedAt: new Date().toISOString(),
    method: 'runtime-only：nav.needs 上 inline height:31px + overflow:hidden（!important），不改任何文件、不重建',
    cardView: { after: cardsAfter, compressed31: cardsCompressed },
    listView: { after: rowsAfter, compressed31: rowsCompressed },
    attribution: {
      needsHeightDelta: +(cardsAfter.needsHeight - cardsCompressed.needsHeight).toFixed(2),
      gridTopDelta: +(cardsAfter.gridTop - cardsCompressed.gridTop).toFixed(2),
      firstScreenFullDelta: cardsAfter.firstScreenFull - cardsCompressed.firstScreenFull,
      rowsVisibleDelta: rowsAfter.rowsVisible - rowsCompressed.rowsVisible,
      listTopDelta: rowsAfter.listTop !== null && rowsCompressed.listTop !== null ? +(rowsAfter.listTop - rowsCompressed.listTop).toFixed(2) : null,
      pageHeightDelta: cardsAfter.pageHeight - cardsCompressed.pageHeight
    }
  };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n', 'utf8');

  console.log('卡片视图 现状     ：' + JSON.stringify(cardsAfter));
  console.log('卡片视图 压回31px ：' + JSON.stringify(cardsCompressed));
  console.log('列表视图 现状     ：' + JSON.stringify(rowsAfter));
  console.log('列表视图 压回31px ：' + JSON.stringify(rowsCompressed));
  console.log('归因（现状 − 压回31px）：' + JSON.stringify(out.attribution));
  console.log('\n已写出 ' + path.relative(ROOT, OUT));
})().catch(e => { console.error(e); process.exit(1); });
