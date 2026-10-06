#!/usr/bin/env node
/**
 * T20 · **独立**物理探针（不复用 verify-site.js 的任何函数）：直接用 Edge + Playwright 打开
 * 本轮 scratch 副本，逐条量：
 *   · note 盒（border-box）· 承载块宽 · 现场换算 70ch（把该条的字体复制到屏外探针量 width:70ch）
 *   · 逐行字迹（Range.getClientRects + 自己的垂直重叠归并）· 列宽（main / 承载父容器）
 * 目的：让「盒满宽、字迹 432–445px」与「360 档 70ch 452.81px > 列宽」不是判据的自述，而是现场量出来的。
 * 用法：node probe-760.cjs
 */
'use strict';
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '../../../../../..');
const T20 = path.join(ROOT, 'research', '_raw', 'secondary-page-layout-unification', 'review', 't20');
const EDGE = process.env.DSH_EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2' };
const serve = dir => new Promise(resolve => {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    let file = path.join(dir, urlPath);
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  });
  server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
});

const PLAN = [
  { dir: 'scratch/clean', route: 'changes/', width: 760 },
  { dir: 'scratch/clean', route: 'feeds/', width: 760 },
  { dir: 'scratch/clean', route: 'changes/', width: 360 },
  { dir: 'scratch/grid760', route: 'changes/', width: 760 },
  { dir: 'scratch/grid760', route: 'feeds/', width: 760 },
  { dir: 'scratch/grid760', route: 'plans/', width: 760 },
  { dir: 'scratch/grid760', route: 'category/', width: 760 },
  { dir: 'scratch/grid760', route: 'changes/', width: 360 },
  { dir: 'scratch/grid760', route: 'feeds/', width: 360 },
  { dir: 'scratch/contents', route: 'changes/', width: 760 }
];

const BROWSER_EVAL = () => {
  const round = v => Math.round(v * 100) / 100;
  const contentBoxOf = el => {
    const cs = getComputedStyle(el);
    return el.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
  };
  const ch70Of = el => {
    const cs = getComputedStyle(el);
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;left:-99999px;top:0;visibility:hidden;display:inline-block;'
      + 'width:70ch;padding:0;border:0;margin:0;white-space:nowrap;'
      + `font-family:${cs.fontFamily};font-size:${cs.fontSize};font-style:${cs.fontStyle};font-weight:${cs.fontWeight};`
      + `font-stretch:${cs.fontStretch};font-variant:${cs.fontVariant};letter-spacing:${cs.letterSpacing};word-spacing:${cs.wordSpacing};`;
    document.body.appendChild(probe);
    const width = probe.getBoundingClientRect().width;
    probe.remove();
    return round(width);
  };
  const lineRects = el => {
    const rects = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!node.textContent.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) if (rect.width > 0.01 && rect.height > 0.01) rects.push({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height });
    }
    // 自己的垂直重叠归并（> 较矮高度的 50% 视为同一行）
    const sorted = rects.slice().sort((a, b) => a.top - b.top);
    const lines = [];
    for (const rect of sorted) {
      const hit = lines.find(line => {
        const overlap = Math.min(line.bottom, rect.bottom) - Math.max(line.top, rect.top);
        return overlap > 0.5 * Math.min(line.bottom - line.top, rect.height);
      });
      if (hit) {
        hit.left = Math.min(hit.left, rect.left); hit.right = Math.max(hit.right, rect.right);
        hit.top = Math.min(hit.top, rect.top); hit.bottom = Math.max(hit.bottom, rect.bottom);
      } else lines.push({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom });
    }
    lines.sort((a, b) => a.top - b.top);
    return lines.map(line => ({ width: round(line.right - line.left), left: round(line.left), right: round(line.right) }));
  };
  const main = document.querySelector('main');
  const notes = [...document.querySelectorAll('main .snote')].map((el, index) => {
    const box = el.getBoundingClientRect();
    const lines = lineRects(el);
    const parent = el.parentElement;
    return {
      index,
      boxWidth: round(box.width), boxHeight: round(box.height),
      contentBox: round(contentBoxOf(el)),
      parentTag: parent ? parent.tagName.toLowerCase() + (parent.className ? '.' + String(parent.className).split(' ')[0] : '') : null,
      parentWidth: parent ? round(parent.getBoundingClientRect().width) : null,
      ch70: ch70Of(el),
      font: getComputedStyle(el).fontSize,
      lineCount: lines.length,
      widestLine: lines.length ? Math.max(...lines.map(l => l.width)) : 0,
      lines: lines.slice(0, 4),
      textLen: (el.textContent || '').length
    };
  });
  return {
    mainWidth: main ? round(main.getBoundingClientRect().width) : null,
    docScrollWidth: document.documentElement.scrollWidth,
    docClientWidth: document.documentElement.clientWidth,
    notes
  };
};

(async () => {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const results = [];
  for (const item of PLAN) {
    const dir = path.join(T20, item.dir);
    const { server, port } = await serve(dir);
    const page = await browser.newPage({ viewport: { width: item.width, height: 900 } });
    await page.goto(`http://127.0.0.1:${port}/${item.route}`, { waitUntil: 'load' });
    await page.waitForTimeout(150);
    const data = await page.evaluate(BROWSER_EVAL);
    await page.close();
    server.close();
    const ch70 = [...new Set(data.notes.map(n => n.ch70))];
    const boxWidths = [...new Set(data.notes.map(n => n.boxWidth))];
    const summary = {
      dir: item.dir, route: item.route, width: item.width,
      mainWidth: data.mainWidth, docScrollWidth: data.docScrollWidth, docClientWidth: data.docClientWidth,
      noteCount: data.notes.length, ch70,
      boxWidths,
      widestLineMin: Math.min(...data.notes.map(n => n.widestLine)),
      widestLineMax: Math.max(...data.notes.map(n => n.widestLine)),
      multiLineNotes: data.notes.filter(n => n.lineCount >= 2).length,
      inkNarrowByPhysics: data.notes.filter(n => n.lineCount >= 2 && n.widestLine < 0.85 * Math.min(data.mainWidth, n.parentWidth || data.mainWidth)).length,
      notes: data.notes.map(n => ({ i: n.index, box: n.boxWidth, ch70: n.ch70, lines: n.lineCount, widest: n.widestLine, parent: n.parentTag, parentW: n.parentWidth, font: n.font }))
    };
    results.push(summary);
    console.log(`## ${item.dir} ${item.route} @${item.width}: 列(main) ${summary.mainWidth} · 70ch ${ch70.join('/')} · 盒宽 ${boxWidths.join('/')} · 行最宽 ${summary.widestLineMin}–${summary.widestLineMax} · 多行条 ${summary.multiLineNotes}/${summary.noteCount} · 物理上字迹窄(≥2行且<0.85×列) ${summary.inkNarrowByPhysics}`);
    console.log('   ' + summary.notes.map(n => `#${n.i}[盒${n.box} 行${n.lines} 最宽${n.widest} 父${n.parent}${n.parentW}]`).join(' '));
  }
  await browser.close();
  fs.mkdirSync(path.join(T20, 'runs'), { recursive: true });
  fs.writeFileSync(path.join(T20, 'runs', 'probe-physical.json'), JSON.stringify(results, null, 2));
})().catch(error => { console.error(error); process.exit(1); });
