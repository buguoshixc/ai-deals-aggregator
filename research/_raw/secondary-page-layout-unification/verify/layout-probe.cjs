#!/usr/bin/env node
/**
 * T22 独立探针 v2（round-4 口径）：自己量、自己判、自己出四轮对照。
 *
 * 独立性（逐条可核对）：
 *   · **不 require** `scripts/tools/verify-site.js`，**不 require** `scripts/lib/page-kinds.js`；
 *     只 require playwright-core + fs/http/path。目录枚举、静态服务器、量测脚本、判据、报告结构全部自写。
 *   · 「主数据区」= <main> 里最宽的数据型块级容器（自己按 DOM 语义找），页面列 = min(主数据区, <main>)。
 *   · 70ch 尺子：把这条说明自己的字体复制到屏外探针量 `width:70ch` 的像素宽（自己实现，不读门禁的常量）。
 *   · 逐行字迹：自己把 Range 字形盒按 top 归并成行，取最宽一行。
 *
 * 四轮口径（对照的就是这四轮「各档能咬中什么」，全部按**各轮当时的历史语义**实现）：
 *   R1 border-box   ：rendered && 盒宽            < 0.85 × 列宽        （t2 原口径）
 *   R2 textWidth    ：rendered && 有字区域(内容盒) < 0.85 × 列宽        （t7 修 F1 后）
 *   R3 并集         ：R2 ∨ 逐行字迹(仅 1440/1600)                       （t14：meta.inkRule 桌面档开、760/360 关）
 *   R4 物理前置条件 ：R2 ∨ 逐行字迹(仅当 列宽 > 现场 70ch)               （t19 起：现行口径）
 *
 * 注入：`--inject=plan.json` = { "<route 精确匹配 或 *>": "<css>" }，**只在浏览器内存里**注入（零写盘）。
 *
 * 用法：
 *   node layout-probe.cjs --dir=dist.baseline --out=…/probe-r4-before.json
 *   node layout-probe.cjs --dir=dist --out=…/probe-r4-after.json
 *   node layout-probe.cjs --dir=dist --inject=…/forms.json --routes=changes/,feeds/ --out=…/probe-r4-forms.json
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
const DIR = path.join(ROOT, arg('dir', 'dist'));
const OUT = path.resolve(ROOT, arg('out', path.join(__dirname, 'probe-r4.json')));
const INJECT_PLAN = arg('inject', '') ? JSON.parse(fs.readFileSync(path.resolve(ROOT, arg('inject')), 'utf8')) : {};
const JS_PLAN = arg('js', '') ? JSON.parse(fs.readFileSync(path.resolve(ROOT, arg('js')), 'utf8')) : {};
const ROUTE_FILTER = arg('routes', '') ? arg('routes').split(',').filter(Boolean) : null;
const VIEWPORTS = arg('viewports', '1440,1600,760,360').split(',').map(Number);
const OVERFLOW_VP = 390;
const EDGE = process.env.DSH_EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const RATIO = 0.85;
const TOL = 1;
const TRUTH = path.join(ROOT, 'research/_raw/secondary-page-layout-unification/geometry/truth-401.json');
const GATE_REPORTS = {
  'dist.baseline': 'research/_raw/secondary-page-layout-unification/teeth/_scratch/r4-m0.json',
  dist: 'research/_raw/secondary-page-layout-unification/teeth/_scratch/r4-green.json'
};

function routesFromDisk(dir) {
  const routes = [];
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && entry.name.toLowerCase() === 'index.html') {
        const rel = path.relative(dir, full).split(path.sep).join('/');
        routes.push(rel === 'index.html' ? '' : rel.replace(/index\.html$/, ''));
      }
    }
  }
  return routes.sort();
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8'
};
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

/** 浏览器内一次量测：只读数，不判违规（判在 Node 侧，逐条可审计）。 */
const MEASURE = `(() => {
  const round = n => Math.round(n * 100) / 100;
  const px = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
  const main = document.querySelector('main');
  const mains = document.querySelectorAll('main');
  if (!main) return { mainCount: mains.length, mainMissing: true, notes: [], noteCount: 0, detailMainCount: document.querySelectorAll('main.detail-main').length,
    doc: { clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth } };
  const boxOf = el => { const r = el.getBoundingClientRect(); return {
    left: round(r.left + window.scrollX), right: round(r.right + window.scrollX), width: round(r.width), height: round(r.height) }; };
  const contentW = el => round(el.clientWidth - px(getComputedStyle(el).paddingLeft) - px(getComputedStyle(el).paddingRight));
  const ownText = el => { for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim()) return true; return false; };
  const laysOut = el => { const d = getComputedStyle(el).display; return d !== 'inline' && d !== 'none' && d !== 'contents'; };
  const blockish = el => { const d = getComputedStyle(el).display; return d !== 'inline' && d !== 'inline-block' && d !== 'none' && d !== 'contents'; };
  // 70ch 现场尺子（自己实现）：把这条说明的字体复制到屏外探针
  const ch70Of = el => {
    const cs = getComputedStyle(el);
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;left:-99999px;top:0;visibility:hidden;pointer-events:none;display:inline-block;'
      + 'width:70ch;padding:0;border:0;margin:0;white-space:nowrap;'
      + 'font-family:' + cs.fontFamily + ';font-size:' + cs.fontSize + ';font-style:' + cs.fontStyle
      + ';font-weight:' + cs.fontWeight + ';font-stretch:' + cs.fontStretch + ';font-variant:' + cs.fontVariant
      + ';letter-spacing:' + cs.letterSpacing + ';word-spacing:' + cs.wordSpacing + ';';
    document.body.appendChild(probe);
    const w = probe.getBoundingClientRect().width;
    probe.remove();
    return round(w);
  };
  // 逐行字迹：非空白文本节点的可见字形盒 → 按 top 归并成行（自己实现；<noscript> 子树排除）
  const glyphOf = el => {
    const rects = [];
    const walk = node => {
      for (const child of node.childNodes) {
        if (child.nodeType === 3) {
          if (!child.textContent.trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(child);
          for (const rect of range.getClientRects()) if (rect.width > 0 && rect.height > 0) {
            rects.push({ left: rect.left, right: rect.right, top: rect.top, width: rect.width });
          }
        } else if (child.nodeType === 1 && child.tagName !== 'NOSCRIPT') walk(child);
      }
    };
    walk(el);
    return rects;
  };
  const mergeLines = rects => {
    const lines = [];
    for (const rect of rects.slice().sort((a, b) => a.top - b.top)) {
      const line = lines.find(l => Math.abs(l.top - rect.top) <= 1.5);
      if (line) { line.left = Math.min(line.left, rect.left); line.right = Math.max(line.right, rect.right); }
      else lines.push({ top: rect.top, left: rect.left, right: rect.right });
    }
    return lines.map(l => ({ top: round(l.top), left: round(l.left), right: round(l.right), width: round(l.right - l.left) }));
  };
  const describe = el => el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).trim().split(/\\s+/).join('.') : '');
  // 主数据区：<main> 里最宽的数据型块级容器（自研启发式）
  const candidates = [];
  for (const child of main.children) {
    if (child.classList.contains('snote')) continue;
    const d = getComputedStyle(child).display;
    if (d === 'inline' || d === 'none' || d === 'contents') continue;
    const b = boxOf(child);
    if (b.width <= 0) continue;
    const tag = child.tagName.toLowerCase();
    const dataish = ['table', 'ul', 'ol', 'dl'].includes(tag) || Boolean(child.querySelector('table, ul, ol, dl'));
    candidates.push({ el: child, box: b, dataish });
  }
  const dataish = candidates.filter(c => c.dataish);
  const region = (dataish.length ? dataish : candidates).slice().sort((a, b) => b.box.width - a.box.width)[0] || null;
  const notes = Array.prototype.slice.call(main.querySelectorAll('.snote'));
  return {
    mainCount: mains.length,
    detailMainCount: document.querySelectorAll('main.detail-main').length,
    doc: { clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth },
    main: boxOf(main),
    region: region ? { sel: describe(region.el), width: region.box.width, left: region.box.left, right: region.box.right,
      dataish: region.dataish, topCandidates: candidates.slice().sort((a, b) => b.box.width - a.box.width).slice(0, 3)
        .map(c => describe(c.el) + ':' + round(c.box.width)) } : null,
    noteCount: notes.length,
    notes: notes.map((el, index) => {
      const noteBox = boxOf(el);
      const cs = getComputedStyle(el);
      const bearing = [];
      if (ownText(el)) bearing.push(el);
      for (const child of el.querySelectorAll('*')) if (ownText(child)) bearing.push(child);
      const loose = bearing.filter(laysOut).map(contentW).filter(w => w > 0);
      const strict = bearing.filter(blockish).map(contentW).filter(w => w > 0);
      const contentBox = contentW(el);
      const fallback = contentBox > 0 ? contentBox : noteBox.width;
      const rects = glyphOf(el);
      const lines = mergeLines(rects);
      const widest = lines.length ? Math.max.apply(null, lines.map(l => l.width)) : 0;
      return {
        index, key: (location.pathname.replace(/^\\//, '').replace(/index\\.html$/, '')) + '#' + index,
        tag: describe(el), parent: el.parentElement ? describe(el.parentElement) : null,
        text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 40),
        box: noteBox, contentBox, rendered: noteBox.width > 0 && noteBox.height > 0,
        textAreaLoose: round(loose.length ? Math.min.apply(null, loose) : fallback),
        textAreaStrict: round(strict.length ? Math.min.apply(null, strict) : fallback),
        textFallback: loose.length === 0,
        vertical: (cs.writingMode || '').startsWith('vertical'),
        writingMode: cs.writingMode,
        glyphRects: rects.length, lineCount: lines.length, widestLine: round(widest), lines: lines.slice(0, 6),
        textLength: (el.textContent || '').replace(/\\s+/g, ' ').trim().length,
        scrollW: el.scrollWidth, clientW: el.clientWidth,
        ch70: ch70Of(el)
      };
    })
  };
})()`;

(async () => {
  let routes = routesFromDisk(DIR);
  if (ROUTE_FILTER) routes = routes.filter(route => ROUTE_FILTER.includes(route));
  const { server, port } = await serve(DIR);
  const base = `http://127.0.0.1:${port}/`;
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const page = await browser.newPage({ viewport: { width: VIEWPORTS[0], height: 900 } });
  const pages = [];
  const started = Date.now();
  for (const route of routes) {
    await page.goto(base + route, { waitUntil: 'load' });
    const css = INJECT_PLAN[route] !== undefined ? INJECT_PLAN[route] : INJECT_PLAN['*'];
    if (css) await page.evaluate(`(() => { const s = document.createElement('style'); s.textContent = ${JSON.stringify(css)}; document.head.appendChild(s); return s.textContent.length; })()`);
    const js = JS_PLAN[route] !== undefined ? JS_PLAN[route] : JS_PLAN['*'];
    if (js) await page.evaluate(js);
    const at = {};
    for (const width of VIEWPORTS) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
      at[width] = await page.evaluate(MEASURE);
    }
    await page.setViewportSize({ width: OVERFLOW_VP, height: 844 });
    await page.evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
    at.overflow = await page.evaluate('(() => ({ clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }))()');
    pages.push({ route, at });
  }
  await browser.close();
  server.close();

  // ── 判（Node 侧）：四轮 + 本探针自己的违规码 ─────────────────────────────────
  const routeFamily = route => (/^deal\//.test(route) || /^models\/[^/]+\/$/.test(route)) ? 'detail' : 'wide';
  const judged = pages.map(pageIn => {
    const perViewport = {};
    for (const width of VIEWPORTS) {
      const measured = pageIn.at[width];
      const codes = [];
      if (measured.mainMissing || measured.mainCount !== 1) codes.push('data-region-missing');
      if (routeFamily(pageIn.route) === 'detail' && measured.detailMainCount !== 1) codes.push('missing-detail-main');
      if (routeFamily(pageIn.route) === 'wide' && measured.detailMainCount !== 0) codes.push('unexpected-detail-main');
      const column = measured.main && measured.region ? Math.min(measured.region.width, measured.main.width) : 0;
      const threshold = RATIO * column;
      const rounds = { R1: [], R2: [], R3: [], R4: [] };
      const noteRows = [];
      for (const note of measured.notes || []) {
        const boxed = note.rendered;
        const r1 = boxed && note.box.width < threshold - 0.01;
        const r2 = boxed && note.textAreaLoose < threshold - 0.01;
        const inkBody = (note.rendered || note.glyphRects > 0) && !note.vertical && note.lineCount >= 2 && note.widestLine < threshold - 0.01;
        const r3 = r2 || (inkBody && (width === 1440 || width === 1600));
        const inkScope = column > Number(note.ch70) + TOL;
        const r4 = r2 || (inkBody && inkScope);
        if (r1) rounds.R1.push(note.key);
        if (r2) rounds.R2.push(note.key);
        if (r3) rounds.R3.push(note.key);
        if (r4) rounds.R4.push(note.key);
        const row = {
          key: note.key, boxWidth: note.box.width, textArea: note.textAreaLoose, textAreaStrict: note.textAreaStrict,
          column: Math.round(column * 100) / 100, ch70: note.ch70, ratioBox: column ? Math.round((note.box.width / column) * 1e6) / 1e6 : null,
          ratioText: column ? Math.round((note.textAreaLoose / column) * 1e6) / 1e6 : null,
          lineCount: note.lineCount, widestLine: note.widestLine, glyphRects: note.glyphRects, rendered: note.rendered,
          vertical: note.vertical, textLength: note.textLength, inkScope, rounds: Object.keys(rounds).filter(k => rounds[k].includes(note.key))
        };
        if (!note.rendered) row.unrendered = true;
        if (boxed && note.scrollW > note.clientW + TOL) { row.clipped = true; codes.push('note-clipped'); }
        if (note.rendered && note.textLength > 0 && note.glyphRects === 0) { row.hiddenText = true; codes.push('note-hidden-text'); }
        // 本探针自己的码（与四轮 R1..R4 平行）：内容盒窄 / 逐行字迹窄（带物理前置）/ 不同轴
        if (r2) codes.push('note-narrow');
        if (inkBody && inkScope) codes.push('note-ink-narrow');
        if (boxed && measured.main && measured.region) {
          const tol = Math.max(TOL, 0.05 * column);
          const anchors = [{ label: 'region', left: measured.region.left, right: measured.region.right },
            { label: 'main', left: measured.main.left, right: measured.main.right }];
          const aligned = anchors.some(a => Math.abs(note.box.left - a.left) <= tol && Math.abs(note.box.right - a.right) <= tol);
          if (!aligned) { row.axisOff = true; codes.push('note-axis'); }
        }
        noteRows.push(row);
      }
      if (measured.doc && measured.doc.scrollWidth > measured.doc.clientWidth + TOL) codes.push(`page-overflow@${width}`);
      perViewport[width] = { column, threshold: Math.round(threshold * 100) / 100, rounds, notes: noteRows, codes,
        regionSel: measured.region ? measured.region.sel : null, mainCount: measured.mainCount, detailMainCount: measured.detailMainCount,
        noteCount: measured.noteCount, topCandidates: measured.region ? measured.region.topCandidates : [] };
    }
    const overflow390 = pageIn.at.overflow;
    const overflowViolation = overflow390.scrollWidth > overflow390.clientWidth + TOL;
    return { route: pageIn.route, family: routeFamily(pageIn.route), viewport: perViewport, overflow390, overflowViolation };
  });

  const keysOf = (round, width) => judged.flatMap(pageIn => pageIn.viewport[width].rounds[round]).sort();
  const rounds = {};
  for (const width of VIEWPORTS) {
    rounds[width] = {};
    for (const round of ['R1', 'R2', 'R3', 'R4']) {
      const keys = keysOf(round, width);
      rounds[width][round] = { notes: keys.length, pages: new Set(keys.map(k => k.split('#')[0])).size, keys };
    }
  }
  const ch70s = [...new Set(judged.flatMap(pageIn => VIEWPORTS.flatMap(w => pageIn.viewport[w].notes.map(n => n.ch70))))].sort((a, b) => a - b);
  const columns = {};
  for (const width of VIEWPORTS) {
    const list = judged.map(pageIn => pageIn.viewport[width].column).filter(c => c > 0);
    columns[width] = { min: Math.min(...list), max: Math.max(...list), overCh70: list.filter(c => c > 452.81 + TOL).length, underCh70: list.filter(c => c <= 452.81 + TOL).length };
  }
  const codeIndex = {};
  for (const width of VIEWPORTS) {
    for (const pageIn of judged) for (const code of pageIn.viewport[width].codes) {
      if (!codeIndex[code]) codeIndex[code] = { routes: [], viewports: [] };
      if (!codeIndex[code].routes.includes(pageIn.route)) codeIndex[code].routes.push(pageIn.route);
      if (!codeIndex[code].viewports.includes(width)) codeIndex[code].viewports.push(width);
    }
  }
  const overflowRoutes = judged.filter(p => p.overflowViolation).map(p => p.route);
  if (overflowRoutes.length) codeIndex[`page-overflow@${OVERFLOW_VP}`] = { routes: overflowRoutes, viewports: [OVERFLOW_VP] };

  // ── 与判据结果逐条对账（判据结果 = 门禁自己跑出来的 JSON，不是本探针） ─────────────
  const rel = path.relative(ROOT, DIR).split(path.sep).join('/');
  const gatePath = GATE_REPORTS[rel];
  let gate = null;
  if (gatePath && fs.existsSync(path.join(ROOT, gatePath)) && !Object.keys(INJECT_PLAN).length && !ROUTE_FILTER) {
    const raw = JSON.parse(fs.readFileSync(path.join(ROOT, gatePath), 'utf8'));
    const notes = (raw.metrics && raw.metrics.layoutNotes) || [];
    const keys = notes.filter(n => (n.codes || []).some(c => c === 'note-narrow' || c === 'note-ink-narrow')).map(n => `${n.route}#${n.index}`).sort();
    gate = { path: gatePath, total: raw.total, failed: raw.failed, narrowUnionKeys: keys,
      narrowUnionNotes: keys.length, narrowUnionPages: new Set(keys.map(k => k.split('#')[0])).size };
  }
  const myR4 = rounds[1440] ? rounds[1440].R4.keys : [];
  const reconcile = gate ? {
    judgeReport: gate.path, judgeAssertions: gate.total, judgeFailed: gate.failed,
    judgeUnion: { notes: gate.narrowUnionNotes, pages: gate.narrowUnionPages },
    mineR4At1440: { notes: myR4.length, pages: new Set(myR4.map(k => k.split('#')[0])).size },
    onlyMine: myR4.filter(k => !gate.narrowUnionKeys.includes(k)),
    onlyJudge: gate.narrowUnionKeys.filter(k => !myR4.includes(k)),
    same: myR4.length === gate.narrowUnionKeys.length && myR4.every(k => gate.narrowUnionKeys.includes(k))
  } : null;
  let truthCheck = null;
  if (fs.existsSync(TRUTH) && !Object.keys(INJECT_PLAN).length) {
    const truth = JSON.parse(fs.readFileSync(TRUTH, 'utf8'));
    const truthKeys = [...truth.sets.caughtByOldCriteria, ...truth.sets.onlyNewTruth].map(e => `${e.route}#${e.index}`).sort();
    const fineKeys = truth.sets.alreadyFine.map(e => `${e.route}#${e.index}`).sort();
    truthCheck = rel === 'dist.baseline' ? {
      truthNotes: truthKeys.length, truthPages: new Set(truthKeys.map(k => k.split('#')[0])).size,
      onlyMine: myR4.filter(k => !truthKeys.includes(k)), onlyTruth: truthKeys.filter(k => !myR4.includes(k)),
      falsePositivesOnAlreadyFine: myR4.filter(k => fineKeys.includes(k)),
      same: myR4.length === truthKeys.length && myR4.every(k => truthKeys.includes(k))
    } : { truthNotes: truthKeys.length, mine: myR4.length, falsePositivesOnAlreadyFine: myR4.filter(k => fineKeys.includes(k)) };
  }

  const report = {
    probe: 'T22 independent round-4 probe (no require of verify-site.js / page-kinds.js)',
    generatedAt: new Date().toISOString(), dir: rel, viewports: VIEWPORTS, overflowViewport: OVERFLOW_VP, ratio: RATIO,
    inject: INJECT_PLAN, routes: routes.length, seconds: Math.round((Date.now() - started) / 100) / 10,
    ch70Values: ch70s, columns,
    totals: {
      pages: judged.length, pagesWithNotes: judged.filter(p => p.viewport[VIEWPORTS[0]].noteCount > 0).length,
      notes: judged.reduce((sum, p) => sum + (p.viewport[VIEWPORTS[0]].noteCount || 0), 0),
      unrendered: judged.flatMap(p => p.viewport[VIEWPORTS[0]].notes.filter(n => n.unrendered)).length,
      overflowPages390: judged.filter(p => p.overflowViolation).length
    },
    rounds, codeIndex, reconcile, truthCheck,
    pages: judged.map(pageIn => ({
      route: pageIn.route, family: pageIn.family, overflow390: pageIn.overflow390, overflowViolation: pageIn.overflowViolation,
      viewport: Object.fromEntries(VIEWPORTS.map(w => [w, {
        column: pageIn.viewport[w].column, threshold: pageIn.viewport[w].threshold, regionSel: pageIn.viewport[w].regionSel,
        noteCount: pageIn.viewport[w].noteCount, codes: pageIn.viewport[w].codes,
        rounds: Object.fromEntries(['R1', 'R2', 'R3', 'R4'].map(r => [r, pageIn.viewport[w].rounds[r]])),
        notes: pageIn.viewport[w].notes
      }]))
    }))
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n', 'utf8');

  console.log(`dir=${rel}${Object.keys(INJECT_PLAN).length ? ' +inject' : ''} routes=${routes.length} 用时 ${report.seconds}s · 70ch 现场值 ${ch70s.join('/')}px`);
  for (const width of VIEWPORTS) {
    const cols = columns[width];
    console.log(`  @${width} 页面列 ${cols.min}–${cols.max}px（>70ch ${cols.overCh70} 页 / ≤70ch ${cols.underCh70} 页）`
      + ` · R1 ${rounds[width].R1.notes}/${rounds[width].R1.pages} · R2 ${rounds[width].R2.notes}/${rounds[width].R2.pages}`
      + ` · R3 ${rounds[width].R3.notes}/${rounds[width].R3.pages} · R4 ${rounds[width].R4.notes}/${rounds[width].R4.pages}（条/页）`);
  }
  console.log(`  说明 ${report.totals.notes} 条（有说明的页 ${report.totals.pagesWithNotes}）· 未渲染 ${report.totals.unrendered} 条 · 390 溢出 ${report.totals.overflowPages390} 页`);
  if (reconcile) console.log(`  vs 判据报告 ${reconcile.judgeReport}（${reconcile.judgeAssertions} 项 / 失败 ${reconcile.judgeFailed}）：判据并集 ${reconcile.judgeUnion.notes} 条/${reconcile.judgeUnion.pages} 页 · 我 R4@1440 ${reconcile.mineR4At1440.notes} 条/${reconcile.mineR4At1440.pages} 页 · 相同=${reconcile.same} · onlyMine ${reconcile.onlyMine.length} · onlyJudge ${reconcile.onlyJudge.length}`);
  if (truthCheck) console.log(`  vs truth-401：${JSON.stringify(truthCheck)}`);
  if (Object.keys(codeIndex).length) console.log(`  本探针产出的码：${Object.entries(codeIndex).map(([c, v]) => `${c}(${v.routes.length} 页)`).join(' · ')}`);
  console.log(`证据：${path.relative(ROOT, OUT).split(path.sep).join('/')}`);
})().catch(error => { console.error(error); process.exit(1); });
