#!/usr/bin/env node
/**
 * secondary-page-layout-unification · 全站「每一条 `.snote`」几何探针（t3 证据 · captain 指令 A/B）
 *
 * 为什么要有它（captain 点名的缺口）：§22c 目前只量 `<main>` 里**文档序第一条** `.snote`
 * （`noteCount` 被记录但不参与判据）⇒ 把页面里**后面**那条说明改回 70ch 可以骗过它。
 * 在 verify-site.js 定稿之前，先用**独立探针**把改动前/后的真值量出来：
 *
 *   · 每条页面 `<main>` 内**全部** `.snote`（文档序），逐条给 width / left / right /
 *     note÷data 比例 / max-width / overflow-wrap / 是否自身裁切 / 文本前 28 字；
 *   · 「全站有多少页的 `<main>` 里 `.snote` ≥ 2 条、最多的一页几条」的直方图（指令 B）；
 *   · 视口 1440 全量；另在 390 复量一遍（窄档只关心条数与自身溢出）。
 *
 * 与 `wide-probe.cjs` 的关系：同一套量法、同一个静态服务器实现，但**不共用代码路径**的取舍是
 * 刻意的 —— 这一支只回答「每一条说明在哪、多宽」，不做合族判定（合族判定在 wide-probe）。
 *
 * 用法：
 *   node …/geometry/all-notes-probe.cjs --dir=dist.baseline --label=before \
 *        --out=…/geometry/all-notes-before.json
 */

'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright-core');

const arg = name => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const ROOT = path.join(__dirname, '..', '..', '..', '..');
const resolve = p => (path.isAbsolute(p) ? p : path.join(ROOT, p));
const DIR = resolve(arg('dir') || 'dist');
const LABEL = arg('label') || path.basename(DIR);
const OUT = resolve(arg('out') || path.join(ROOT, 'research', '_raw', 'secondary-page-layout-unification', 'geometry', `all-notes-${LABEL}.json`));
const EDGE = process.env.DSH_EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const VIEWPORTS = [
  { width: 1440, height: 900, mode: 'full' },
  { width: 390, height: 800, mode: 'count' }
];
const DATA_SELECTORS = ['.ctable', '.stable', '.chgsec', '.chglist', '.flist', '.fsec', '.ptable', '.lsum', '.pchglist'];
const FROZEN = '.snote { color: var(--mut); font-size: var(--fs-sm); line-height: 1.7; margin: 0 0 var(--s3); max-width: none; overflow-wrap: anywhere; }';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2'
};
function serve(dir) {
  return new Promise(done => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
      let file = path.join(dir, rel);
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end('not found'); return; }
      res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => done({ server, port: server.address().port }));
  });
}
function routesFromDisk() {
  const routes = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.toLowerCase() === 'index.html') {
        const rel = path.relative(DIR, full).split(path.sep).join('/');
        routes.push(rel === 'index.html' ? '' : rel.replace(/index\.html$/, ''));
      }
    }
  };
  walk(DIR);
  return routes.sort();
}

const MEASURE = `(() => {
  const DATA_SELECTORS = ${JSON.stringify(DATA_SELECTORS)};
  const FROZEN = ${JSON.stringify(FROZEN)};
  const round = n => Math.round(n * 100) / 100;
  const box = el => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      left: round(r.left + window.scrollX), right: round(r.right + window.scrollX), width: round(r.width),
      scrollWidth: el.scrollWidth, clientWidth: el.clientWidth,
      maxWidth: cs.maxWidth, overflowWrap: cs.overflowWrap, display: cs.display
    };
  };
  const mains = Array.prototype.slice.call(document.querySelectorAll('main'));
  const main = mains.length ? mains[0] : null;
  let regionEl = null, regionSel = null;
  for (const sel of DATA_SELECTORS) {
    const hit = document.querySelector(sel);
    if (hit) { regionSel = sel; regionEl = hit; break; }
  }
  const noteEls = main ? Array.prototype.slice.call(main.querySelectorAll('.snote')) : [];
  const frozenCount = Array.prototype.slice.call(document.querySelectorAll('style'))
    .reduce((sum, s) => sum + (s.textContent.split(FROZEN).length - 1), 0);
  return {
    doc: { clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth },
    mainCount: mains.length,
    main: main ? box(main) : null,
    regionSel, regionFallback: !regionSel,
    region: (regionEl || main) ? box(regionEl || main) : null,
    noteCount: noteEls.length,
    notes: noteEls.map((el, index) => Object.assign({
      index,
      position: index === 0 ? 'first' : (index === noteEls.length - 1 ? 'last' : 'middle'),
      text: el.textContent.replace(/\\s+/g, ' ').trim().slice(0, 28)
    }, box(el))),
    frozenCount
  };
})()`;

(async () => {
  if (!fs.existsSync(path.join(DIR, 'index.html'))) { console.error(`找不到 ${path.relative(ROOT, DIR)}/index.html`); process.exit(2); }
  const routes = routesFromDisk();
  const started = await serve(DIR);
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(`${page.url()} :: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`${page.url()} :: ${m.text()}`); });
  let navigations = 0;

  const pages = [];
  for (const route of routes) {
    const record = { route, viewports: {} };
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      navigations += 1;
      await page.goto(new URL(route, `http://127.0.0.1:${started.port}/`).href, { waitUntil: 'load' });
      const raw = await page.evaluate(MEASURE);
      const column = raw.region && raw.main ? Math.min(raw.region.width, raw.main.width) : null;
      const round = n => Math.round(n * 100) / 100;
      record.viewports[String(viewport.width)] = {
        mode: viewport.mode,
        mainCount: raw.mainCount,
        mainWidth: raw.main ? raw.main.width : null,
        regionWidth: raw.region ? raw.region.width : null,
        regionSel: raw.regionSel,
        noteCount: raw.noteCount,
        frozenCount: raw.frozenCount,
        doc: raw.doc,
        notes: raw.notes.map(note => ({
          index: note.index, position: note.position, width: note.width, left: note.left, right: note.right,
          ratioToColumn: column ? round(note.width / column) : null,
          ratioToRegion: raw.region && raw.region.width ? round(note.width / raw.region.width) : null,
          maxWidth: note.maxWidth, overflowWrap: note.overflowWrap, display: note.display,
          scrollWidth: note.scrollWidth, clientWidth: note.clientWidth,
          clipped: note.scrollWidth > note.clientWidth + 1,
          narrowerThanColumn: column ? note.width < 0.85 * column - 0.01 : null,
          text: note.text
        }))
      };
    }
    pages.push(record);
  }

  await browser.close();
  started.server.close();

  const at = '1440';
  const counts1440 = pages.map(page => page.viewports[at].noteCount);
  const histogram = {};
  for (const count of counts1440) histogram[count] = (histogram[count] || 0) + 1;
  const multiNotePages = pages.filter(page => page.viewports[at].noteCount >= 2)
    .map(page => ({ route: page.route, noteCount: page.viewports[at].noteCount }));
  const narrowNotes1440 = pages.flatMap(page => page.viewports[at].notes
    .filter(note => note.narrowerThanColumn)
    .map(note => ({ route: page.route, index: note.index, position: note.position, width: note.width, ratioToColumn: note.ratioToColumn, maxWidth: note.maxWidth })));
  const narrowNotes390 = pages.flatMap(page => page.viewports['390'].notes
    .filter(note => note.narrowerThanColumn)
    .map(note => ({ route: page.route, index: note.index, position: note.position, width: note.width, ratioToColumn: note.ratioToColumn, maxWidth: note.maxWidth })));

  const report = {
    label: LABEL,
    dir: path.relative(ROOT, DIR).replace(/\\/g, '/'),
    at: new Date().toISOString(),
    edge: EDGE,
    viewports: VIEWPORTS.map(viewport => viewport.width),
    routesTotal: routes.length,
    navigations,
    jsErrors: errors,
    counts: {
      // 指令 B：全站多少页 `<main>` 内 `.snote` ≥ 2 条、最多的一页几条
      pagesWithAnyNote: counts1440.filter(count => count > 0).length,
      pagesWithNoNote: counts1440.filter(count => count === 0).length,
      pagesWithMultiNotes: multiNotePages.length,
      maxNotesOnOnePage: counts1440.length ? Math.max(...counts1440) : 0,
      totalNotes: counts1440.reduce((sum, count) => sum + count, 0),
      histogram1440: histogram,
      multiNotePages,
      // 逐条判据（不只第一条）：1440 与 390 两档里"比主数据区窄（< 0.85×列宽）"的说明
      notesNarrowerThanColumn1440: narrowNotes1440.length,
      notesNarrowerThanColumn390: narrowNotes390.length,
      notesNarrowerOnlyAfterFirst1440: narrowNotes1440.filter(note => note.index > 0).length,
      notesNarrowerOnlyAfterFirst390: narrowNotes390.filter(note => note.index > 0).length
    },
    narrowNotes1440,
    narrowNotes390,
    pages
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(`每一条 .snote 探针：${report.dir}（label=${LABEL}）· 页面 ${routes.length} · 导航 ${navigations} · JS 错误 ${errors.length}`);
  console.log(`1440 档：有说明 ${report.counts.pagesWithAnyNote} 页 / 无说明 ${report.counts.pagesWithNoNote} 页 · 说明总条数 ${report.counts.totalNotes}`);
  console.log(`        .snote ≥ 2 条的页面 **${report.counts.pagesWithMultiNotes} 页** · 最多的一页 **${report.counts.maxNotesOnOnePage} 条** · 直方图 ${JSON.stringify(histogram)}`);
  console.log(`        「比主数据区窄（< 0.85×列宽）」的说明：1440 档 ${report.counts.notesNarrowerThanColumn1440} 条（其中第 2 条及以后 ${report.counts.notesNarrowerOnlyAfterFirst1440} 条）`
    + ` · 390 档 ${report.counts.notesNarrowerThanColumn390} 条（第 2 条及以后 ${report.counts.notesNarrowerOnlyAfterFirst390} 条）`);
  console.log(`多说明页面（前 12）：${multiNotePages.slice(0, 12).map(page => `${page.route || '/'}=${page.noteCount}`).join(' ')}${multiNotePages.length > 12 ? ` …（共 ${multiNotePages.length}）` : ''}`);
  console.log(`证据：${path.relative(ROOT, OUT).replace(/\\/g, '/')}`);
})().catch(e => { console.error(e); process.exit(2); });
