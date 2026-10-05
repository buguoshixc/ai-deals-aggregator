#!/usr/bin/env node
/**
 * leaf-detail-layout-v1 · 视觉检查 + 首页页高归因（captain 证据）
 *
 * 两件事：
 *   ① §十五 要求的**真实看图**：把改动后的 deal / model 详情页在 1600 / 1440 / 768 / 390 下截图
 *      （存 shots/，该目录已 gitignore），交给人眼确认"数学上居中"之外还有"视觉上不过宽/不过窄"。
 *   ② 回归比对里有一条读数需要**归因**：`--compare` 报首页页高 4589px → 4665px（+76px，容差内）。
 *      基线是 2026-09-29 冻结的，中间数据在动。判据：把**忠实的改动前构建**（d09a1c5，干净 worktree）
 *      与改动后产物在同一个视口下各量一次首页 —— 若两者相等，则那 76px 与本次改动无关。
 *
 * 用法：node research/_raw/leaf-detail-layout-v1/gate/visual-and-home-height.cjs [--before=<dir>]
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.join(__dirname, '..', '..', '..', '..');
const arg = name => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const AFTER = path.join(ROOT, 'dist');
const BEFORE = arg('before') || path.join(ROOT, '..', 'leaf-layout-before', 'dist');
const SHOTS = path.join(ROOT, 'research', '_raw', 'leaf-detail-layout-v1', 'shots');
const EDGE = process.env.DSH_EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8'
};

function serve(dir) {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
      let file = path.join(dir, rel);
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end('nf'); return; }
      res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

/** 首页几何：页高 + 首屏密度 + 卡片高度（与回归基线同一批量） */
const homeGeometry = page => page.evaluate(() => {
  const cards = [...document.querySelectorAll('article.g')];
  const full = cards.filter(card => {
    const r = card.getBoundingClientRect();
    return r.bottom <= window.innerHeight + 1 && r.top >= 0;
  }).length;
  const grid = document.querySelector('.grid');
  return {
    docScrollHeight: document.documentElement.scrollHeight,
    bodyScrollHeight: document.body.scrollHeight,
    cards: cards.length,
    cardHeight: cards.length ? Math.round(cards[0].getBoundingClientRect().height) : null,
    firstScreenFull: full,
    gridColumns: grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : null,
    mainWidth: Math.round(document.querySelector('main').getBoundingClientRect().width)
  };
});

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const out = { at: new Date().toISOString(), before: null, after: null, shots: [], homeHeightAttribution: null };

  // ---------- ① 首页页高归因：忠实改动前构建 vs 改动后 ----------
  if (fs.existsSync(path.join(BEFORE, 'index.html'))) {
    for (const [label, dir] of [['before', BEFORE], ['after', AFTER]]) {
      const { server, port } = await serve(dir);
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
      await page.waitForFunction(() => {
        const el = document.getElementById('lastUpdated');
        return !!el && el.textContent.trim() !== '' && el.textContent.trim() !== '--';
      }, { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(200);
      const geo = await homeGeometry(page);
      out[label] = geo;
      await page.close();
      server.close();
    }
    out.homeHeightAttribution = {
      before: out.before.docScrollHeight, after: out.after.docScrollHeight,
      delta: out.after.docScrollHeight - out.before.docScrollHeight,
      verdict: out.after.docScrollHeight === out.before.docScrollHeight
        ? '改动前后首页页高**逐像素相同** ⇒ 回归比对里那 +76px 与本次改动无关（基线是 2026-09-29 的旧数据）'
        : `改动前后首页页高不同（${out.before.docScrollHeight} → ${out.after.docScrollHeight}）⇒ 必须查清`
    };
  } else {
    out.homeHeightAttribution = { verdict: `跳过：找不到改动前产物 ${BEFORE}` };
  }

  // ---------- ② 视觉检查截图（改动后） ----------
  {
    const { server, port } = await serve(AFTER);
    const base = `http://127.0.0.1:${port}/`;
    const dealRoute = 'deal/2eae0e246de2/';
    const modelRoute = 'models/360zhinao-pro/';
    const jobs = [
      { name: 'deal-1600', route: dealRoute, w: 1600, h: 900, marker: '.dpane' },
      { name: 'deal-1440', route: dealRoute, w: 1440, h: 900, marker: '.dpane' },
      { name: 'model-1440', route: modelRoute, w: 1440, h: 900, marker: 'main' },
      { name: 'deal-768', route: dealRoute, w: 768, h: 1024, marker: '.dpane' },
      { name: 'deal-390', route: dealRoute, w: 390, h: 844, marker: '.dpane' }
    ];
    for (const job of jobs) {
      const page = await browser.newPage({ viewport: { width: job.w, height: job.h } });
      await page.goto(base + job.route, { waitUntil: 'load' });
      await page.waitForSelector(job.marker, { timeout: 15000 });
      await page.waitForTimeout(200);
      const file = path.join(SHOTS, `${job.name}.png`);
      await page.screenshot({ path: file });
      const geo = await page.evaluate(() => {
        const r = document.querySelector('main').getBoundingClientRect();
        return { mainWidth: Math.round(r.width), mainLeft: Math.round(r.left), mainRight: Math.round(r.right), vw: window.innerWidth, docScroll: document.documentElement.scrollWidth };
      });
      out.shots.push({ name: job.name, file: path.relative(ROOT, file).replace(/\\/g, '/'), ...geo });
      await page.close();
    }
    server.close();
  }

  await browser.close();
  console.log(JSON.stringify(out, null, 2));
  const outFile = path.join(ROOT, 'research', '_raw', 'leaf-detail-layout-v1', 'gate', 'visual-and-home-height.json');
  fs.writeFileSync(outFile, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
  console.log(`\n证据已写出：${path.relative(ROOT, outFile).replace(/\\/g, '/')}`);
})().catch(error => { console.error(`FAILED: ${error.message}`); process.exit(1); });
