#!/usr/bin/env node
/**
 * T20 · R3-3 的假红 / 反用面变体探针（**只读 dist**，runtime 注入样式，不写任何产物目录）。
 * 变体：V0 原样 · V1 zoom 0.75 · V2 zoom 1.5 · V3 rtl · V4 display:contents · V5 display:contents + 祖先 70ch 网格轨道。
 * 逐条量：盒宽 / 行数 / 最宽行 / 列基准（main 与最近的 section 祖先的内容盒取小）/ 70ch。
 * 用途：证明 V1–V4 不会制造「盒窄 / 字迹窄」的新读数；同时把 V5 的残余面量清楚（单行条没有行证据）。
 * 用法：node probe-variants.cjs
 */
'use strict';
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '../../../../../..');
const T20 = path.join(ROOT, 'research', '_raw', 'secondary-page-layout-unification', 'review', 't20');
const DIST = path.join(ROOT, 'dist');
const EDGE = process.env.DSH_EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8' };

const VARIANTS = [
  { id: 'V0', css: '' },
  { id: 'V1-zoom-0.75', css: 'main { zoom: 0.75; }' },
  { id: 'V2-zoom-1.5', css: 'main { zoom: 1.5; }' },
  { id: 'V3-rtl', css: '.snote { direction: rtl; }' },
  { id: 'V4-display-contents', css: '.snote { display: contents; }' },
  { id: 'V5-contents-plus-ancestor-track', css: '.snote { display: contents; } section, details { display: grid; grid-template-columns: minmax(0, 70ch) 1fr; }' }
];
const PAGES = ['changes/', 'feeds/', 'plans/'];

const EVAL = () => {
  const round = v => Math.round(v * 100) / 100;
  const contentBox = el => {
    if (!el) return 0;
    const cs = getComputedStyle(el);
    return round(el.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0));
  };
  const ch70Of = el => {
    const cs = getComputedStyle(el);
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;left:-99999px;top:0;visibility:hidden;display:inline-block;width:70ch;'
      + `padding:0;border:0;margin:0;white-space:nowrap;font-family:${cs.fontFamily};font-size:${cs.fontSize};font-style:${cs.fontStyle};`
      + `font-weight:${cs.fontWeight};font-stretch:${cs.fontStretch};font-variant:${cs.fontVariant};letter-spacing:${cs.letterSpacing};word-spacing:${cs.wordSpacing};`;
    document.body.appendChild(probe);
    const width = round(probe.getBoundingClientRect().width);
    probe.remove();
    return width;
  };
  const linesOf = el => {
    const rects = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!node.textContent.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) if (rect.width > 0.01 && rect.height > 0.01) rects.push(rect);
    }
    const lines = [];
    for (const rect of rects.slice().sort((a, b) => a.top - b.top)) {
      const hit = lines.find(line => Math.min(line.bottom, rect.bottom) - Math.max(line.top, rect.top) > 0.5 * Math.min(line.bottom - line.top, rect.height));
      if (hit) { hit.left = Math.min(hit.left, rect.left); hit.right = Math.max(hit.right, rect.right); hit.top = Math.min(hit.top, rect.top); hit.bottom = Math.max(hit.bottom, rect.bottom); }
      else lines.push({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom });
    }
    return lines;
  };
  const main = document.querySelector('main');
  return [...document.querySelectorAll('main .snote')].map((el, index) => {
    const box = el.getBoundingClientRect();
    const lines = linesOf(el);
    const section = el.closest('section, details, main');
    const column = Math.min(contentBox(main), contentBox(section) || Infinity);
    const widest = lines.length ? round(Math.max(...lines.map(l => l.right - l.left))) : 0;
    return {
      index, boxWidth: round(box.width), lines: lines.length, widest, column,
      ch70: ch70Of(el), parent: el.parentElement ? el.parentElement.tagName.toLowerCase() : null,
      boxNarrow: box.width > 0 && box.width < 0.85 * column,
      inkNarrow: lines.length >= 2 && widest < 0.85 * column,
      glyphOnly: box.width === 0 && lines.length >= 1
    };
  });
};

(async () => {
  const server = http.createServer((req, res) => {
    let file = path.join(DIST, decodeURIComponent(req.url.split('?')[0]));
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'text/plain' });
    res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const out = [];
  for (const page of PAGES) {
    for (const variant of VARIANTS) {
      const tab = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await tab.goto(`http://127.0.0.1:${port}/${page}`, { waitUntil: 'load' });
      if (variant.css) await tab.addStyleTag({ content: variant.css });
      await tab.waitForTimeout(120);
      const notes = await tab.evaluate(EVAL);
      await tab.close();
      const row = {
        page, variant: variant.id, noteCount: notes.length,
        boxNarrow: notes.filter(n => n.boxNarrow).length,
        inkNarrow: notes.filter(n => n.inkNarrow).length,
        glyphOnly: notes.filter(n => n.glyphOnly).length,
        singleLineInTrack: notes.filter(n => n.glyphOnly && n.lines === 1).length,
        ch70: [...new Set(notes.map(n => n.ch70))],
        notes: notes.map(n => ({ i: n.index, box: n.boxWidth, lines: n.lines, widest: n.widest, col: n.column, boxNarrow: n.boxNarrow, inkNarrow: n.inkNarrow }))
      };
      out.push(row);
      console.log(`## ${page} ${variant.id}: 条 ${row.noteCount} · 盒窄 ${row.boxNarrow} · 字迹窄 ${row.inkNarrow} · 无盒有字形 ${row.glyphOnly}（其中单行 ${row.singleLineInTrack}）· 70ch ${row.ch70.join('/')}`);
    }
  }
  await browser.close();
  server.close();
  fs.writeFileSync(path.join(T20, 'runs', 'probe-variants.json'), JSON.stringify(out, null, 2));
})().catch(e => { console.error(e); process.exit(1); });
