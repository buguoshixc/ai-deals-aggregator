#!/usr/bin/env node
/**
 * T31 · 定点探针：`category/agent/#0` 在 5 档视口上的几何 + §22c 码（自写，独立于门禁）
 *
 * 独立性：只 require playwright-core + fs/http/path。**不 require** `scripts/tools/verify-site.js`，
 * 也不 require `scripts/lib/**`。静态服务器、量测脚本、逐行归并、70ch 现场尺子、码的复算全部自写。
 *
 * 量什么（每档）：
 *   · 说明条盒宽（border-box）· clientWidth · 内容盒宽（clientWidth − padding）
 *   · 「有字区域宽」代理量（自己与承载文本的块级后代的**最窄内容盒**）
 *   · 可见文本宽：Range.getClientRects() 逐字形盒的最宽/最窄矩形宽 + 横向并集跨度 + 纵向并集跨度
 *   · 行数/字形盒数：横排按 y 重叠归并成行、竖排按 x 重叠归并成列（两种都报，并标出 writing-mode）
 *   · 页面 scrollWidth vs clientWidth（documentElement）+ 说明自身 scrollWidth vs clientWidth
 *   · 现场 70ch 尺子（把这条说明自己的字体复制到屏外探针量 `width:70ch`）
 *
 * 码的复算（轮 6 公开口径，逐条实现在本文件里；与门禁源码无共享代码）：
 *   note-narrow       rendered && 有字区域宽 < 0.85 × min(主数据区宽, 页面列宽)
 *   note-ink-narrow   (rendered || glyphRects>0) && writingMode 非竖排 && min(列) > 现场 70ch
 *                     && 行数 >= 2 && 最宽一行 < 0.85 × min(列)
 *   note-hidden-text  rendered && 文本非空 && 字形盒 0 个
 *   note-unrendered   border-box 无宽或无高（盒被压成 0）
 *   note-axis         border-box 左/右 与「主数据区」或「<main>」任一同一轴（容差 max(1px, 5% × min(列))）
 *   note-clipped      说明自身 scrollWidth > clientWidth + 1
 *   page-overflow@vw  documentElement.scrollWidth > 视口宽
 *
 * 用法：
 *   node verify/t31/writing-mode-probe.cjs --dir=dist --out=…/probe-dist.json --label=dist
 *   node verify/t31/writing-mode-probe.cjs --dir=dist --form=1 --out=…/probe-form.json --label=form
 *   （--form=1：把 §J③ 的形态 CSS 在**浏览器内存里**注入 —— 零写盘，等价于插在冻结串规则之后）
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
const OUT = path.resolve(ROOT, arg('out', path.join(__dirname, 'probe.json')));
const LABEL = arg('label', path.basename(DIR));
const ROUTE = arg('route', 'category/agent/');
const NOTE_INDEX = Number(arg('index', '0'));
const VIEWPORTS = arg('viewports', '1440,1600,760,390,360').split(',').map(Number);
const FORM = arg('form', '') !== '';
const EDGE = process.env.DSH_EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const RATIO = 0.85;
const AXIS_RATIO = 0.05;
// §J③ 的形态：`writing-mode: vertical-rl; width: 100%; height: 5.6rem; overflow: hidden`
const FORM_CSS = '.snote { writing-mode: vertical-rl; width: 100%; height: 5.6rem; overflow: hidden; }';
// 主数据区候选（报告 §22c 公开登记的那一组；写成常量便于复核，不是从门禁 require 来的）
const DATA_SELECTORS = ['.ctable', '.stable', '.chgsec', '.chglist', '.flist', '.fsec', '.ptable', '.lsum', '.pchglist'];

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.ico': 'image/x-icon', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2'
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

/** 页面内量测（全部自写；返回一条说明的几何与两套「行/列」读数） */
function measureInPage({ noteIndex, dataSelectors, ratio, axisRatio, formCss }) {
  const round2 = n => Math.round(n * 100) / 100;
  if (formCss) {
    const style = document.createElement('style');
    style.id = 't31-form';
    style.textContent = formCss;
    document.head.appendChild(style);
  }
  const main = document.querySelector('main');
  if (!main) return { error: '页面里没有 <main>' };
  const notes = [...main.querySelectorAll('.snote')];
  const note = notes[noteIndex];
  if (!note) return { error: `第 ${noteIndex} 条 .snote 不存在（本页共 ${notes.length} 条）` };

  const rectOf = el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
  const padOf = el => { const cs = getComputedStyle(el); return { l: parseFloat(cs.paddingLeft) || 0, r: parseFloat(cs.paddingRight) || 0, bL: parseFloat(cs.borderLeftWidth) || 0, bR: parseFloat(cs.borderRightWidth) || 0 }; };
  const contentWidthOf = el => { const pad = padOf(el); return round2(el.clientWidth - pad.l - pad.r); };

  // 有字区域宽代理量：自己 + 「直接承载文本、display ∉ inline/none/contents 的块级后代」里最窄的内容盒
  const isBlockish = el => { const d = getComputedStyle(el).display; return d !== 'inline' && d !== 'none' && d !== 'contents'; };
  const carriers = [];
  const walk = el => {
    const ownText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 0);
    if (ownText && isBlockish(el)) carriers.push(el);
    for (const child of el.children) walk(child);
  };
  walk(note);
  const candidateWidths = [{ who: 'note', width: contentWidthOf(note), box: rectOf(note) }];
  for (const el of carriers) candidateWidths.push({ who: `${el.tagName.toLowerCase()}${el.className ? `.${String(el.className).split(/\s+/).join('.')}` : ''}`, width: contentWidthOf(el), box: rectOf(el) });
  const textWidthEntry = candidateWidths.reduce((min, cur) => (cur.width < min.width ? cur : min), candidateWidths[0]);

  // 页面列 / 主数据区
  const mainRect = rectOf(main);
  const pageColumn = round2(Math.min(contentWidthOf(main), mainRect.width));
  const dataHits = dataSelectors.flatMap(sel => [...main.querySelectorAll(sel)].map(el => ({ sel, el })))
    .filter(hit => hit.el.getBoundingClientRect().width > 0);
  const dataArea = dataHits.length
    ? round2(Math.max(...dataHits.map(hit => contentWidthOf(hit.el))))
    : null;
  const column = round2(Math.min(dataArea === null ? pageColumn : dataArea, pageColumn));

  // 现场 70ch：把这条说明的字体复制到屏外探针
  const probe = document.createElement('span');
  const cs = getComputedStyle(note);
  probe.style.cssText = `position:absolute;left:-99999px;top:0;visibility:hidden;width:70ch;font:${cs.font};letter-spacing:${cs.letterSpacing};`;
  probe.textContent = '0';
  document.body.appendChild(probe);
  const ch70 = round2(probe.getBoundingClientRect().width);
  probe.remove();

  // 可见字形盒（Range.getClientRects）
  const range = document.createRange();
  range.selectNodeContents(note);
  const glyphs = [...range.getClientRects()].filter(r => r.width > 0.01 && r.height > 0.01)
    .map(r => ({ left: round2(r.left), right: round2(r.right), top: round2(r.top), bottom: round2(r.bottom), width: round2(r.width), height: round2(r.height) }));
  const inkUnionWidth = glyphs.length ? round2(Math.max(...glyphs.map(g => g.right)) - Math.min(...glyphs.map(g => g.left))) : 0;
  const inkUnionHeight = glyphs.length ? round2(Math.max(...glyphs.map(g => g.bottom)) - Math.min(...glyphs.map(g => g.top))) : 0;
  const maxRectWidth = glyphs.length ? round2(Math.max(...glyphs.map(g => g.width))) : 0;
  const minRectWidth = glyphs.length ? round2(Math.min(...glyphs.map(g => g.width))) : 0;

  // 归并：横排按 y 重叠成行；竖排按 x 重叠成列（同一个归并函数，换轴）
  const merge = (rects, axis, tol) => {
    const items = rects.map(r => ({ a: axis === 'y' ? r.top : r.left, b: axis === 'y' ? r.bottom : r.right, rect: r }))
      .sort((p, q) => p.a - q.a);
    const groups = [];
    for (const it of items) {
      const last = groups[groups.length - 1];
      if (last && it.a <= last.b + tol) { last.b = Math.max(last.b, it.b); last.items.push(it.rect); }
      else groups.push({ a: it.a, b: it.b, items: [it.rect] });
    }
    return groups.map(g => ({
      extent: round2(g.b - g.a),
      ink: round2(Math.max(...g.items.map(r => (axis === 'y' ? r.right : r.bottom))) - Math.min(...g.items.map(r => (axis === 'y' ? r.left : r.top)))),
      count: g.items.length
    }));
  };
  const linesH = merge(glyphs, 'y', 1);
  const columnsV = merge(glyphs, 'x', 1);

  const mainPad = padOf(main);
  const mainContent = round2(main.clientWidth - mainPad.l - mainPad.r);
  const noteBox = rectOf(note);
  const writingMode = cs.writingMode;
  const vertical = /vertical|sideways/.test(writingMode);
  const rendered = noteBox.width > 0 && noteBox.height > 0;
  const text = (note.textContent || '').trim();
  const codes = [];
  const threshold = round2(ratio * column);
  const tol = Math.max(1, axisRatio * column);
  if (!rendered && text.length > 0) codes.push('note-unrendered');
  if (rendered && textWidthEntry.width < threshold) codes.push('note-narrow');
  if ((rendered || glyphs.length > 0) && !vertical && column > ch70 && linesH.length >= 2 && linesH.length > 0
    && round2(Math.max(...linesH.map(l => l.ink))) < threshold - 0.01) codes.push('note-ink-narrow');
  if (rendered && text.length > 0 && glyphs.length === 0) codes.push('note-hidden-text');
  const axisMain = Math.abs(noteBox.left - mainRect.left) <= tol && Math.abs(noteBox.right - mainRect.right) <= tol;
  const axisData = dataHits.some(hit => { const b = rectOf(hit.el); return Math.abs(noteBox.left - b.left) <= tol && Math.abs(noteBox.right - b.right) <= tol; });
  if (dataHits.length && !axisMain && !axisData) codes.push('note-axis');
  if (note.scrollWidth > note.clientWidth + 1) codes.push('note-clipped');
  const doc = document.documentElement;
  if (doc.scrollWidth > window.innerWidth) codes.push(`page-overflow@${window.innerWidth}`);

  return {
    viewport: window.innerWidth,
    note: { index: noteIndex, notesOnPage: notes.length, textLength: text.length, textPreview: text.slice(0, 48) },
    writingMode, vertical, display: cs.display, overflow: `${cs.overflowX}/${cs.overflowY}`,
    height: round2(noteBox.height),
    box: { left: round2(noteBox.left), right: round2(noteBox.right), width: round2(noteBox.width) },
    clientWidth: note.clientWidth, scrollWidth: note.scrollWidth,
    contentBox: contentWidthOf(note),
    padding: padOf(note),
    textWidthProxy: { who: textWidthEntry.who, width: textWidthEntry.width },
    textCarriers: candidateWidths,
    ink: { glyphRects: glyphs.length, unionWidth: inkUnionWidth, unionHeight: inkUnionHeight, maxRectWidth, minRectWidth },
    linesH: { count: linesH.length, widestInk: linesH.length ? round2(Math.max(...linesH.map(l => l.ink))) : 0 },
    columnsV: { count: columnsV.length, widestInk: columnsV.length ? round2(Math.max(...columnsV.map(c => c.ink))) : 0 },
    columnBasis: { pageColumn, mainContent, dataArea, dataSelectorsHit: dataHits.map(h => h.sel), column, ch70, threshold, axisTol: round2(tol) },
    pageOverflow: { docScrollWidth: doc.scrollWidth, docClientWidth: doc.clientWidth, innerWidth: window.innerWidth, delta: doc.scrollWidth - doc.clientWidth },
    selfClip: { delta: note.scrollWidth - note.clientWidth },
    codes
  };
}

(async () => {
  const { server, port } = await serve(DIR);
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const results = [];
  for (const width of VIEWPORTS) {
    await page.setViewportSize({ width, height: width >= 760 ? 900 : 844 });
    const url = `http://127.0.0.1:${port}/${ROUTE}`;
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForTimeout(150);
    const reading = await page.evaluate(measureInPage, {
      noteIndex: NOTE_INDEX, dataSelectors: DATA_SELECTORS, ratio: RATIO, axisRatio: AXIS_RATIO, formCss: FORM ? FORM_CSS : ''
    });
    results.push(reading);
    console.log(`@${width} ${reading.error ? `ERROR ${reading.error}` : `box=${reading.box.width} content=${reading.contentBox} textWidth=${reading.textWidthProxy.width} glyphs=${reading.ink.glyphRects} linesH=${reading.linesH.count}/${reading.linesH.widestInk} colsV=${reading.columnsV.count}/${reading.columnsV.widestInk} selfClip=${reading.selfClip.delta} pageOverflow=${reading.pageOverflow.delta} codes=[${reading.codes.join(',')}]`}`);
  }
  const report = {
    task: 'T31', label: LABEL, route: ROUTE, noteIndex: NOTE_INDEX, dir: path.relative(ROOT, DIR).split(path.sep).join('/'),
    form: FORM ? FORM_CSS : null,
    injection: FORM ? '浏览器内存注入（addStyleTag，零写盘）' : null,
    viewports: VIEWPORTS, probe: 'verify/t31/writing-mode-probe.cjs（自写；不 require verify-site.js）',
    codesRuleVersion: '轮 6 公开口径（报告 §22c 头注释 L6166–6200）；本文件独立实现，未与门禁共享代码',
    at: new Date().toISOString(),
    results
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await browser.close();
  server.close();
  console.log(`\n→ ${path.relative(ROOT, OUT).split(path.sep).join('/')}`);
})().catch(error => { console.error(error); process.exit(1); });
