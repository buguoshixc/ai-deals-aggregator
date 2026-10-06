#!/usr/bin/env node
/**
 * T4 定点探针：宽页保留的两处局部窄宽 + `.snote.aliasnote` 的兼容性实测。
 *
 * 三件事，全部用真浏览器量：
 *   ① `.lsum li small { max-width: 34ch }`（宽页列表项里的次要说明行）：
 *      实测「盒子宽 / 所在 li 宽 / 所在 .lsum 宽 / 页面列宽」四个比例，并做**对照量测**：
 *      把 max-width 临时置 none，看同一段文字会不会从多行收成一行 ——
 *      用来区分「有意的次级阅读列」与「和 70ch 缺陷同形的半截列」。
 *   ② `.pdetailbody { max-width: 72ch }`（/plans/coding/ 展开「详情」行后的套餐详情体）：
 *      先真的**展开**详情行（点页面自己的控件；找不到控件才退到取掉 hidden 并如实标注），
 *      再量它的盒宽相对所在单元格 / 表格可视宽的比例，同样做 max-width:none 对照。
 *   ③ `.snote.aliasnote { border-left: 3px + padding-left: 8px }` 的三个别名页：
 *      量 border-box 与 <main> 的左右轴偏差、有字区域宽占列宽的比例，并用**修复后 §22c 的两条
 *      判据公式**（轴容差 max(1px, 5%×列宽)；有字区域 ≥ 0.85×列宽）逐页算出它会不会被误报。
 *
 * 用法：node retained-narrow-probe.cjs --dir=dist --out=…/verify/retained-narrow.json
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
const OUT = path.resolve(ROOT, arg('out', path.join(__dirname, 'retained-narrow.json')));
const EDGE = process.env.DSH_EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const RATIO = 0.85;
const AXIS_RATIO = 0.05;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8'
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

/** 静态选页：只按「文件里真的有这个类名」选，不写死路由清单（页面增删这脚本跟着走）。 */
function findRoutesWith(dir, needles) {
  const hits = new Set();
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && entry.name.toLowerCase() === 'index.html') {
        const text = fs.readFileSync(full, 'utf8');
        if (needles.every(needle => text.includes(needle))) {
          const rel = path.relative(dir, full).split(path.sep).join('/');
          hits.add(rel === 'index.html' ? '' : rel.replace(/index\.html$/, ''));
        }
      }
    }
  }
  return [...hits].sort();
}

const SMALL_SOURCE = `(() => {
  const round = n => Math.round(n * 100) / 100;
  const rect = el => { const r = el.getBoundingClientRect(); return { left: round(r.left), right: round(r.right), width: round(r.width) }; };
  const main = document.querySelector('main');
  const items = Array.prototype.slice.call(document.querySelectorAll('.lsum li small')).map((el, index) => {
    const li = el.closest('li');
    const ul = el.closest('.lsum');
    const cs = getComputedStyle(el);
    const inkOf = node => {
      const texts = [];
      const walk = n => { for (const child of n.childNodes) { if (child.nodeType === 3) { if (child.textContent.trim()) texts.push(child); } else if (child.nodeType === 1) walk(child); } };
      walk(node);
      const rects = [];
      for (const t of texts) { const range = document.createRange(); range.selectNodeContents(t); for (const r of range.getClientRects()) if (r.width > 0 && r.height > 0) rects.push(r); }
      if (!rects.length) return null;
      const left = Math.min.apply(null, rects.map(r => r.left));
      const right = Math.max.apply(null, rects.map(r => r.right));
      return { left: round(left), right: round(right), width: round(right - left), lines: rects.length, longest: round(Math.max.apply(null, rects.map(r => r.width))) };
    };
    const lineHeight = parseFloat(cs.lineHeight) || 0;
    const ink = inkOf(el);
    const lines = lineHeight > 0 && el.getBoundingClientRect().height > 0
      ? Math.round(el.getBoundingClientRect().height / lineHeight) : (ink ? ink.lines : 0);
    const saved = el.style.maxWidth;
    el.style.maxWidth = 'none';
    const widened = { box: rect(el), height: round(el.getBoundingClientRect().height), ink: inkOf(el),
      lines: lineHeight > 0 ? Math.round(el.getBoundingClientRect().height / lineHeight) : null };
    el.style.maxWidth = saved;
    return { index, text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 60),
      maxWidth: cs.maxWidth, fontSize: cs.fontSize, lineHeight: cs.lineHeight,
      box: rect(el), li: li ? rect(li) : null, ul: ul ? rect(ul) : null, main: main ? rect(main) : null,
      ink, lines, widened };
  });
  return { url: location.pathname, mainWidth: main ? round(main.getBoundingClientRect().width) : null, itemCount: items.length, items };
})()`;

const PDETAIL_SOURCE = `(() => {
  const round = n => Math.round(n * 100) / 100;
  const rect = el => { const r = el.getBoundingClientRect(); return { left: round(r.left), right: round(r.right), width: round(r.width), height: round(r.height) }; };
  const main = document.querySelector('main');
  const table = document.querySelector('.ptable') || document.querySelector('main table');
  // 展开详情行：优先点页面自己的「详情」控件；点不到才取掉 hidden（并如实标注）
  let expandMethod = 'none';
  const buttons = Array.prototype.slice.call(document.querySelectorAll('.ptable button, .ptable a, button, a'))
    .filter(el => /详情/.test(el.textContent || '') && el.offsetParent !== null);
  if (buttons.length) { buttons[0].click(); expandMethod = 'clicked:' + buttons[0].tagName.toLowerCase() + ':' + (buttons[0].textContent || '').trim().slice(0, 12); }
  let hiddenRows = Array.prototype.slice.call(document.querySelectorAll('tr.pdetail[hidden], .pdetail[hidden]'));
  if (!document.querySelector('.pdetailbody') || document.querySelector('.pdetailbody').getBoundingClientRect().width === 0) {
    if (hiddenRows.length) { hiddenRows.forEach(row => { row.hidden = false; row.removeAttribute('hidden'); }); expandMethod = (expandMethod === 'none' ? '' : expandMethod + '+') + 'unhide:' + hiddenRows.length; }
  }
  const bodies = Array.prototype.slice.call(document.querySelectorAll('.pdetailbody')).map((el, index) => {
    const cell = el.closest('td') || el.parentElement;
    const cs = getComputedStyle(el);
    const visible = el.getBoundingClientRect().width > 0;
    const textLength = (el.textContent || '').replace(/\\s+/g, ' ').trim().length;
    const saved = el.style.maxWidth;
    el.style.maxWidth = 'none';
    const widened = { box: rect(el), scrollWidth: el.scrollWidth };
    el.style.maxWidth = saved;
    return { index, visible, maxWidth: cs.maxWidth, fontSize: cs.fontSize, textLength,
      box: rect(el), cell: cell ? rect(cell) : null, cellTag: cell ? cell.tagName.toLowerCase() + (cell.className ? '.' + String(cell.className).split(/\\s+/)[0] : '') : null,
      widened, dlRows: el.querySelectorAll('dl > dt').length, headings: el.querySelectorAll('h3').length };
  });
  const visible = bodies.filter(b => b.visible);
  return { url: location.pathname, expandMethod, mainWidth: main ? round(main.getBoundingClientRect().width) : null,
    tableTag: table ? table.tagName.toLowerCase() + (table.className ? '.' + String(table.className).split(/\\s+/)[0] : '') : null,
    table: table ? { clientWidth: table.clientWidth, scrollWidth: table.scrollWidth, box: rect(table) } : null,
    bodyCount: bodies.length, visibleCount: visible.length,
    bodies: bodies.slice(0, 8).concat(bodies.length > 12 ? bodies.slice(-2) : []) };
})()`;

const ALIAS_SOURCE = `(() => {
  const round = n => Math.round(n * 100) / 100;
  const rect = el => { const r = el.getBoundingClientRect(); return { left: round(r.left), right: round(r.right), width: round(r.width) }; };
  const px = value => { const n = parseFloat(value); return Number.isFinite(n) ? n : 0; };
  const main = document.querySelector('main');
  const notes = Array.prototype.slice.call(document.querySelectorAll('main .snote')).map((el, index) => {
    const cs = getComputedStyle(el);
    const box = rect(el);
    const contentBox = round(el.clientWidth - px(cs.paddingLeft) - px(cs.paddingRight));
    const ownText = (() => { for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim()) return true; return false; })();
    const bearers = [];
    if (ownText) bearers.push(el);
    for (const child of el.querySelectorAll('*')) {
      const d = getComputedStyle(child).display;
      if (d === 'inline' || d === 'inline-block' || d === 'none' || d === 'contents') continue;
      for (const n of child.childNodes) if (n.nodeType === 3 && n.textContent.trim()) { bearers.push(child); break; }
    }
    const widths = bearers.map(b => b.clientWidth - px(getComputedStyle(b).paddingLeft) - px(getComputedStyle(b).paddingRight)).filter(w => w > 0);
    return { index, classes: el.className, box, contentBox,
      textArea: round(widths.length ? Math.min.apply(null, widths) : (contentBox > 0 ? contentBox : box.width)),
      borderLeftWidth: px(cs.borderLeftWidth), borderRightWidth: px(cs.borderRightWidth),
      paddingLeft: px(cs.paddingLeft), paddingRight: px(cs.paddingRight),
      marginLeft: px(cs.marginLeft), maxWidth: cs.maxWidth,
      text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 50) };
  });
  return { url: location.pathname, main: main ? rect(main) : null, noteCount: notes.length, notes };
})()`;

const ratioOf = (a, b) => (b > 0 ? Math.round((a / b) * 1000000) / 1000000 : null);

(async () => {
  const lsumRoutes = findRoutesWith(DIR, ['class="lsum"', '<small']);
  const pdetailRoutes = findRoutesWith(DIR, ['pdetailbody']);
  const aliasRoutes = findRoutesWith(DIR, ['snote aliasnote']);
  const { server, port } = await serve(DIR);
  const base = `http://127.0.0.1:${port}/`;
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const lsum = [];
  for (const route of lsumRoutes) {
    await page.goto(base + route, { waitUntil: 'load' });
    await page.evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
    const measured = await page.evaluate(SMALL_SOURCE);
    measured.route = route;
    measured.items = measured.items.map(item => ({
      ...item,
      ratioToLi: ratioOf(item.box.width, item.li ? item.li.width : 0),
      ratioToLsum: ratioOf(item.box.width, item.ul ? item.ul.width : 0),
      ratioToMain: ratioOf(item.box.width, item.main ? item.main.width : 0),
      inkRatioToBox: item.ink ? ratioOf(item.ink.width, item.box.width) : null,
      linesAfterWidening: item.widened.lines,
      boxAfterWidening: item.widened.box.width
    }));
    lsum.push(measured);
  }

  const pdetail = [];
  for (const route of pdetailRoutes) {
    await page.goto(base + route, { waitUntil: 'load' });
    await page.evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
    const measured = await page.evaluate(PDETAIL_SOURCE);
    measured.route = route;
    measured.bodies = measured.bodies.map(body => ({
      ...body,
      ratioToCell: ratioOf(body.box.width, body.cell ? body.cell.width : 0),
      ratioToMain: ratioOf(body.box.width, measured.mainWidth || 0),
      ratioToTableClient: ratioOf(body.box.width, measured.table ? measured.table.clientWidth : 0)
    }));
    pdetail.push(measured);
  }

  const alias = [];
  for (const route of aliasRoutes) {
    await page.goto(base + route, { waitUntil: 'load' });
    await page.evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
    const measured = await page.evaluate(ALIAS_SOURCE);
    measured.route = route;
    const column = measured.main ? measured.main.width : 0;
    const axisTol = Math.max(1, AXIS_RATIO * column);
    measured.evaluation = measured.notes.map(note => ({
      index: note.index,
      // 修复后 §22c 的两条判据公式（轴用 border-box、宽用有字区域），逐页算一遍会不会被误报
      axis: {
        dLeft: Math.round(Math.abs(note.box.left - (measured.main ? measured.main.left : 0)) * 100) / 100,
        dRight: Math.round(Math.abs(note.box.right - (measured.main ? measured.main.right : 0)) * 100) / 100,
        tolerance: Math.round(axisTol * 100) / 100,
        alignedToMain: Math.abs(note.box.left - (measured.main ? measured.main.left : 0)) <= axisTol
          && Math.abs(note.box.right - (measured.main ? measured.main.right : 0)) <= axisTol
      },
      width: {
        textArea: note.textArea, column, limit: Math.round(RATIO * column * 100) / 100,
        ratio: ratioOf(note.textArea, column),
        wouldBeNarrow: note.textArea < RATIO * column - 0.01
      },
      offsetFromMain: Math.round((note.box.left - (measured.main ? measured.main.left : 0)) * 100) / 100
    }));
    alias.push(measured);
  }

  await browser.close();
  server.close();

  const allSmall = lsum.flatMap(entry => entry.items);
  const allBodies = pdetail.flatMap(entry => entry.bodies.filter(body => body.visible));
  const allAlias = alias.flatMap(entry => entry.evaluation);

  const report = {
    generatedAt: new Date().toISOString(),
    dir: path.relative(ROOT, DIR).split(path.sep).join('/'),
    viewport: 1440,
    lsumSmall: {
      routes: lsumRoutes.length,
      measuredItems: allSmall.length,
      boxWidth: { min: Math.min(...allSmall.map(i => i.box.width)), max: Math.max(...allSmall.map(i => i.box.width)) },
      ratioToLi: { min: Math.min(...allSmall.map(i => i.ratioToLi)), median: median(allSmall.map(i => i.ratioToLi)), max: Math.max(...allSmall.map(i => i.ratioToLi)) },
      ratioToLsum: { min: Math.min(...allSmall.map(i => i.ratioToLsum)), median: median(allSmall.map(i => i.ratioToLsum)), max: Math.max(...allSmall.map(i => i.ratioToLsum)) },
      ratioToMain: { min: Math.min(...allSmall.map(i => i.ratioToMain)), median: median(allSmall.map(i => i.ratioToMain)), max: Math.max(...allSmall.map(i => i.ratioToMain)) },
      lines: { one: allSmall.filter(i => i.lines === 1).length, two: allSmall.filter(i => i.lines === 2).length, more: allSmall.filter(i => i.lines > 2).length },
      linesAfterWidening: { one: allSmall.filter(i => i.linesAfterWidening === 1).length, two: allSmall.filter(i => i.linesAfterWidening === 2).length, more: allSmall.filter(i => i.linesAfterWidening > 2).length },
      inkFillsBox: allSmall.filter(i => i.inkRatioToBox !== null && i.inkRatioToBox >= 0.95).length,
      multiLineThatWouldCollapse: allSmall.filter(i => i.lines > 1 && i.linesAfterWidening === 1).length,
      maxWidthValues: [...new Set(allSmall.map(i => i.maxWidth))],
      samples: lsum.slice(0, 3),
      pages: lsum.map(entry => ({ route: entry.route, itemCount: entry.itemCount }))
    },
    pdetailBody: {
      routes: pdetailRoutes,
      expandMethods: pdetail.map(entry => ({ route: entry.route, expandMethod: entry.expandMethod, visibleCount: entry.visibleCount, bodyCount: entry.bodyCount })),
      visibleBodies: allBodies.length,
      boxWidth: allBodies.length ? { min: Math.min(...allBodies.map(b => b.box.width)), max: Math.max(...allBodies.map(b => b.box.width)) } : null,
      ratioToCell: allBodies.length ? { min: Math.min(...allBodies.map(b => b.ratioToCell)), median: median(allBodies.map(b => b.ratioToCell)), max: Math.max(...allBodies.map(b => b.ratioToCell)) } : null,
      ratioToTableClient: allBodies.length ? { min: Math.min(...allBodies.map(b => b.ratioToTableClient)), median: median(allBodies.map(b => b.ratioToTableClient)), max: Math.max(...allBodies.map(b => b.ratioToTableClient)) } : null,
      textLength: allBodies.length ? { min: Math.min(...allBodies.map(b => b.textLength)), max: Math.max(...allBodies.map(b => b.textLength)) } : null,
      maxWidthValues: [...new Set(allBodies.map(b => b.maxWidth))],
      detail: pdetail
    },
    aliasNote: {
      routes: aliasRoutes,
      noteCount: allAlias.length,
      allAlignedToMain: allAlias.every(item => item.axis.alignedToMain),
      anyWouldBeNarrow: allAlias.some(item => item.width.wouldBeNarrow),
      axis: allAlias.map(item => ({ route: alias.find(entry => entry.evaluation.includes(item)).route, ...item })),
      detail: alias
    }
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n', 'utf8');

  console.log(`dir=${report.dir} @${report.viewport}`);
  console.log(`① .lsum li small：${report.lsumSmall.routes} 页 / ${report.lsumSmall.measuredItems} 个 · 盒宽 ${report.lsumSmall.boxWidth.min}..${report.lsumSmall.boxWidth.max}px · max-width 取值 ${report.lsumSmall.maxWidthValues.join(',')}`);
  console.log(`   相对 li 宽：min ${report.lsumSmall.ratioToLi.min} · median ${report.lsumSmall.ratioToLi.median} · max ${report.lsumSmall.ratioToLi.max}`);
  console.log(`   相对 .lsum 宽：min ${report.lsumSmall.ratioToLsum.min} · median ${report.lsumSmall.ratioToLsum.median} · max ${report.lsumSmall.ratioToLsum.max}`);
  console.log(`   相对页面列宽：min ${report.lsumSmall.ratioToMain.min} · median ${report.lsumSmall.ratioToMain.median} · max ${report.lsumSmall.ratioToMain.max}`);
  console.log(`   行数 1/2/>2 = ${report.lsumSmall.lines.one}/${report.lsumSmall.lines.two}/${report.lsumSmall.lines.more} · max-width:none 后 ${report.lsumSmall.linesAfterWidening.one}/${report.lsumSmall.linesAfterWidening.two}/${report.lsumSmall.linesAfterWidening.more} · 会收成一行的 ${report.lsumSmall.multiLineThatWouldCollapse} 个 · 字迹填满盒子的 ${report.lsumSmall.inkFillsBox} 个`);
  console.log(`② .pdetailbody：${report.pdetailBody.routes.join(',')} · 展开方式 ${report.pdetailBody.expandMethods.map(e => e.expandMethod).join(' | ')}`);
  console.log(`   可见 ${report.pdetailBody.visibleBodies} 个 · 盒宽 ${report.pdetailBody.boxWidth ? report.pdetailBody.boxWidth.min + '..' + report.pdetailBody.boxWidth.max : 'n/a'}px · 相对单元格 min ${report.pdetailBody.ratioToCell && report.pdetailBody.ratioToCell.min} · median ${report.pdetailBody.ratioToCell && report.pdetailBody.ratioToCell.median} · max ${report.pdetailBody.ratioToCell && report.pdetailBody.ratioToCell.max}`);
  console.log(`③ .snote.aliasnote：${report.aliasNote.routes.join(',')} · ${report.aliasNote.noteCount} 条 · 全部与 <main> 同轴=${report.aliasNote.allAlignedToMain} · 会被判 note-narrow 的=${report.aliasNote.anyWouldBeNarrow}`);
  console.log(`证据：${path.relative(ROOT, OUT).split(path.sep).join('/')}`);
})().catch(error => { console.error(error); process.exit(1); });

function median(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 1000000) / 1000000;
}
