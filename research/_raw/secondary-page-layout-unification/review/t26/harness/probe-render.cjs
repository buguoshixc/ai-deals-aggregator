#!/usr/bin/env node
/**
 * T26 · **独立**渲染态探针（Playwright + Edge，自实现；不调用 verify-site.js 的任何函数）。
 * 逐条量：盒宽/盒高 · 可见文本长度（排除 <noscript>）· 原始文本长度（含 <noscript>）· 字形盒个数
 *        （Range.getClientRects 里宽高都 > 0）· 是否含 <noscript> 子树 · 是否渲染（盒有宽有高）。
 * 候选页：plans/（12 条）· plans/coding/（5 条，其中 #1 是 <noscript> 条）· docs/data/（9 条）。
 * 副本：clean（= dist）· bare-fs0-plans · noscript-key · noscript-visible
 * 用法：node probe-render.cjs
 */
'use strict';
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '../../../../../..');
const T26 = path.join(ROOT, 'research', '_raw', 'secondary-page-layout-unification', 'review', 't26');
const EDGE = process.env.DSH_EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8' };

const PLAN = [
  { dir: 'scratch/clean', route: 'plans/coding/', width: 1440, css: null },
  { dir: 'scratch/clean', route: 'plans/', width: 1440, css: null },
  { dir: 'scratch/clean', route: 'docs/data/', width: 1440, css: null },
  { dir: 'scratch/bare-fs0-plans', route: 'plans/', width: 1440, css: null },
  { dir: 'scratch/bare-fs0-plans', route: 'plans/coding/', width: 1440, css: null },
  { dir: 'scratch/noscript-key', route: 'plans/', width: 1440, css: null },
  { dir: 'scratch/noscript-visible', route: 'plans/', width: 1440, css: null },
  { dir: 'scratch/noscript-visible', route: 'plans/coding/', width: 1440, css: null },
  { dir: 'scratch/bare-fs0-plans', route: 'plans/', width: 1440, css: '.snote { font-size: 0 !important; }' },
  { dir: 'scratch/clean', route: 'plans/coding/', width: 1440, css: 'noscript { display: block; }' }
];

const EVAL = () => {
  const round = v => Math.round(v * 100) / 100;
  const visibleTextOf = el => {
    let out = '';
    const walk = node => {
      for (const child of node.childNodes) {
        if (child.nodeType === 3) out += child.textContent;
        else if (child.nodeType === 1 && child.tagName !== 'NOSCRIPT') walk(child);
      }
    };
    walk(el);
    return out.replace(/\s+/g, ' ').trim();
  };
  const rawTextOf = el => {
    let out = '';
    const walk = node => {
      for (const child of node.childNodes) {
        if (child.nodeType === 3) out += child.textContent;
        else if (child.nodeType === 1) walk(child);
      }
    };
    walk(el);
    return out.replace(/\s+/g, ' ').trim();
  };
  const glyphRectsOf = el => {
    const rects = [];
    const walk = node => {
      for (const child of node.childNodes) {
        if (child.nodeType === 3) {
          if (!child.textContent.trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(child);
          for (const rect of range.getClientRects()) if (rect.width > 0 && rect.height > 0) rects.push(rect);
        } else if (child.nodeType === 1 && child.tagName !== 'NOSCRIPT') walk(child);
      }
    };
    walk(el);
    return rects;
  };
  return [...document.querySelectorAll('main .snote')].map((el, index) => {
    const box = el.getBoundingClientRect();
    const visible = visibleTextOf(el);
    const raw = rawTextOf(el);
    const glyphs = glyphRectsOf(el);
    const noscript = Boolean(el.querySelector('noscript'));
    return {
      index, boxWidth: round(box.width), boxHeight: round(box.height),
      visibleTextLength: visible.length, rawTextLength: raw.length,
      glyphRects: glyphs.length, noscriptSubtree: noscript,
      rendered: box.width > 0 && box.height > 0,
      wouldFireNoteUnrendered: !(box.width > 0 && box.height > 0) && visible.length > 0 && glyphs.length === 0 && !noscript,
      tag: el.tagName.toLowerCase(), childTags: [...el.children].map(c => c.tagName.toLowerCase()).join(',')
    };
  });
};

(async () => {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const out = [];
  for (const item of PLAN) {
    const dir = path.join(T26, item.dir);
    const server = http.createServer((req, res) => {
      let file = path.join(dir, decodeURIComponent(req.url.split('?')[0]));
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      if (!fs.existsSync(file)) { res.writeHead(404); res.end('404'); return; }
      res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'text/plain' });
      res.end(fs.readFileSync(file));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const page = await browser.newPage({ viewport: { width: item.width, height: 900 } });
    await page.goto(`http://127.0.0.1:${port}/${item.route}`, { waitUntil: 'load' });
    if (item.css) await page.addStyleTag({ content: item.css });
    await page.waitForTimeout(150);
    const notes = await page.evaluate(EVAL);
    await page.close();
    server.close();
    const row = { ...item, notes };
    out.push(row);
    const fire = notes.filter(n => n.wouldFireNoteUnrendered).length;
    console.log(`## ${item.dir} ${item.route} @${item.width}${item.css ? ' +css[' + item.css + ']' : ''}：${notes.length} 条 · 未渲染 ${notes.filter(n => !n.rendered).length} · 含 noscript ${notes.filter(n => n.noscriptSubtree).length} · 未渲染且无 noscript ${fire}`);
    for (const n of notes) console.log(`   #${n.index} 盒 ${n.boxWidth}×${n.boxHeight} 可见 ${n.visibleTextLength} 原始 ${n.rawTextLength} 字形 ${n.glyphRects} noscript ${n.noscriptSubtree} rendered ${n.rendered} ⇒ ④${n.wouldFireNoteUnrendered ? '会咬' : '不咬'} · 子元素[${n.childTags}]`);
  }
  await browser.close();
  fs.writeFileSync(path.join(T26, 'runs', 'probe-render.json'), JSON.stringify(out, null, 2));
})().catch(e => { console.error(e); process.exit(1); });
