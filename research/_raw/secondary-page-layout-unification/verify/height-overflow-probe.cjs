#!/usr/bin/env node
/**
 * T4 产物侧补充实测：回答 self-audit 里三个**只能靠真浏览器读数**的问题。
 *
 *   ① 页面高度是否异常 —— 同一路由在 dist.baseline / dist 上的 documentElement.scrollHeight，
 *      逐页给差值（说明是「说明变宽 ⇒ 少折几行」这种可解释的变化，而不是高度暴涨/塌陷）。
 *   ② 是否新产生横向滚动 —— 同一路由在 1440 / 1600 / 390 三档的
 *      documentElement.scrollWidth 与 clientWidth（溢出页数必须两边都是 0）。
 *   ③ 详情页是否被错误扩宽 —— detail 族路由（磁盘上带 main.detail-main 的页面）的
 *      内容列实测宽与居中偏差（左留白 vs 右留白）。
 *
 * 用法：node height-overflow-probe.cjs --out=…/verify/height-overflow.json
 */
'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = (() => {
  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error('找不到仓库根');
})();
const arg = (name, fallback) => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const OUT = path.resolve(ROOT, arg('out', path.join(__dirname, 'height-overflow.json')));
const EDGE = process.env.DSH_EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const RAW = path.join(ROOT, 'research', '_raw', 'secondary-page-layout-unification');

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8' };
function serve(dir) {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      let file = path.join(dir, urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, ''));
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end('not found'); return; }
      res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

const SOURCE = `(() => {
  const round = n => Math.round(n * 100) / 100;
  const doc = document.documentElement;
  const detail = document.querySelector('main.detail-main');
  const rect = detail ? detail.getBoundingClientRect() : null;
  return {
    viewport: window.innerWidth,
    scrollHeight: doc.scrollHeight,
    scrollWidth: doc.scrollWidth,
    clientWidth: doc.clientWidth,
    detailMain: detail ? { count: document.querySelectorAll('main.detail-main').length,
      width: round(rect.width), left: round(rect.left + window.scrollX), right: round(rect.right + window.scrollX) } : null,
    mainCount: document.querySelectorAll('main').length
  };
})()`;

(async () => {
  const probeBefore = JSON.parse(fs.readFileSync(path.join(RAW, 'verify', 'probe-before.json'), 'utf8'));
  const narrow48 = probeBefore.narrowRoutes1440;
  // 详情族：磁盘上真的有 main.detail-main 的页面（自己扫，不写死 slug），只取前 10 个
  const detailRoutes = [];
  const stack = [path.join(ROOT, 'dist')];
  while (stack.length && detailRoutes.length < 10) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && entry.name.toLowerCase() === 'index.html' && detailRoutes.length < 10) {
        if (fs.readFileSync(full, 'utf8').includes('class="detail-main"')) {
          const rel = path.relative(path.join(ROOT, 'dist'), full).split(path.sep).join('/');
          detailRoutes.push(rel === 'index.html' ? '' : rel.replace(/index\.html$/, ''));
        }
      }
    }
  }
  const wideControls = ['status/', 'changes/', 'feeds/', 'student/', 'developer/', 'free-api/', 'plans/', 'category/'];
  const routes = [...new Set([...narrow48, ...detailRoutes, ...wideControls])].sort();

  const measurements = {};
  for (const dirName of ['dist.baseline', 'dist']) {
    const { server, port } = await serve(path.join(ROOT, dirName));
    const browser = await chromium.launch({ executablePath: EDGE, headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const perRoute = {};
    for (const route of routes) {
      await page.goto(`http://127.0.0.1:${port}/${route}`, { waitUntil: 'load' });
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
      const at1440 = await page.evaluate(SOURCE);
      await page.setViewportSize({ width: 1600, height: 900 });
      await page.evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
      const at1600 = await page.evaluate(SOURCE);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
      const at390 = await page.evaluate(SOURCE);
      perRoute[route] = { at1440, at1600, at390 };
    }
    await browser.close();
    server.close();
    measurements[dirName] = perRoute;
  }

  const before = measurements['dist.baseline'];
  const after = measurements.dist;
  const heightDeltas = routes.map(route => ({
    route,
    before: before[route].at1440.scrollHeight,
    after: after[route].at1440.scrollHeight,
    delta: after[route].at1440.scrollHeight - before[route].at1440.scrollHeight,
    noteNarrowBefore: narrow48.includes(route)
  }));
  const changed = heightDeltas.filter(item => item.delta !== 0);
  const detailRows = detailRoutes.map(route => {
    const at = after[route];
    const detail = at.at1440.detailMain;
    const centered = detail ? Math.abs((detail.left) - (at.at1440.clientWidth - detail.right)) : null;
    return { route, viewport1440: at.at1440, detail, centeredDelta: centered === null ? null : Math.round(centered * 100) / 100 };
  });

  const report = {
    generatedAt: new Date().toISOString(),
    routes: routes.length,
    routeSets: { narrow48: narrow48.length, detail: detailRoutes, wideControls },
    height: {
      min: Math.min(...heightDeltas.map(item => item.delta)),
      max: Math.max(...heightDeltas.map(item => item.delta)),
      changed: changed.length,
      unchanged: heightDeltas.length - changed.length,
      median: (() => { const list = heightDeltas.map(item => item.delta).sort((a, b) => a - b); return list[Math.floor(list.length / 2)]; })(),
      worstShrink: heightDeltas.slice().sort((a, b) => a.delta - b.delta).slice(0, 5),
      worstGrow: heightDeltas.slice().sort((a, b) => b.delta - a.delta).slice(0, 5),
      samples: heightDeltas.filter(item => item.delta !== 0).slice(0, 8)
    },
    overflow: {
      before: { v1440: routes.filter(route => before[route].at1440.scrollWidth > before[route].at1440.clientWidth + 1).length,
        v1600: routes.filter(route => before[route].at1600.scrollWidth > before[route].at1600.clientWidth + 1).length,
        v390: routes.filter(route => before[route].at390.scrollWidth > before[route].at390.clientWidth + 1).length },
      after: { v1440: routes.filter(route => after[route].at1440.scrollWidth > after[route].at1440.clientWidth + 1).length,
        v1600: routes.filter(route => after[route].at1600.scrollWidth > after[route].at1600.clientWidth + 1).length,
        v390: routes.filter(route => after[route].at390.scrollWidth > after[route].at390.clientWidth + 1).length },
      offenders: routes.filter(route => after[route].at1440.scrollWidth > after[route].at1440.clientWidth + 1
        || after[route].at1600.scrollWidth > after[route].at1600.clientWidth + 1
        || after[route].at390.scrollWidth > after[route].at390.clientWidth + 1)
    },
    detailMain: {
      routes: detailRoutes,
      widths: [...new Set(detailRows.map(row => row.detail ? row.detail.width : null))],
      centeredDeltas: detailRows.map(row => row.centeredDelta),
      allCenteredWithin1px: detailRows.every(row => row.centeredDelta !== null && row.centeredDelta <= 1),
      rows: detailRows
    },
    measurements
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n', 'utf8');

  console.log(`路由 ${routes.length} 个（窄 48 + 详情 ${detailRoutes.length} + 宽页对照 ${wideControls.length}）`);
  console.log(`① 页面高度 @1440：变化 ${report.height.changed} 页 · 不变 ${report.height.unchanged} 页 · 差值 min ${report.height.min} / median ${report.height.median} / max ${report.height.max}px`);
  for (const item of report.height.worstShrink) console.log(`   收缩 ${item.delta}px · ${item.route || '/'}（${item.before} → ${item.after}）`);
  if (report.height.worstGrow[0].delta > 0) for (const item of report.height.worstGrow.slice(0, 2)) console.log(`   增高 +${item.delta}px · ${item.route || '/'}（${item.before} → ${item.after}）`);
  console.log(`② 横向溢出页数（before → after）：1440 ${report.overflow.before.v1440} → ${report.overflow.after.v1440} · 1600 ${report.overflow.before.v1600} → ${report.overflow.after.v1600} · 390 ${report.overflow.before.v390} → ${report.overflow.after.v390}`);
  console.log(`③ detail-main 实测宽取值 ${JSON.stringify(report.detailMain.widths)} · 居中偏差全部 ≤1px = ${report.detailMain.allCenteredWithin1px}`);
  console.log(`证据：${path.relative(ROOT, OUT).split(path.sep).join('/')}`);
})().catch(error => { console.error(error); process.exit(1); });
