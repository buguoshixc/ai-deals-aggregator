#!/usr/bin/env node
/**
 * T20 · 列宽基准核对：判据里的 column = min(主数据区**内容盒**, 页面列**内容盒**)。
 * 复审方的物理探针用 border-box 估过一版（plans/ 的 #5 因此在探针里算「字迹窄」而在门禁里不算），
 * 这里把两者的基准量清楚：同一页 @760 量 main / 主数据区选择器 / 各条 .snote 的内容盒。
 * 用法：node probe-column-basis.cjs
 */
'use strict';
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '../../../../../..');
const T20 = path.join(ROOT, 'research', '_raw', 'secondary-page-layout-unification', 'review', 't20');
const EDGE = process.env.DSH_EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8' };

const PLAN = [
  { dir: 'scratch/grid760', route: 'plans/', width: 760, region: '.pchglist' },
  { dir: 'scratch/grid760', route: 'changes/', width: 760, region: '.chgsec' },
  { dir: 'scratch/grid760', route: 'feeds/', width: 760, region: '.fsec' }
];

const EVAL = region => {
  const round = v => Math.round(v * 100) / 100;
  const contentBox = el => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    return round(el.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0));
  };
  const main = document.querySelector('main');
  const reg = document.querySelector(region);
  const notes = [...document.querySelectorAll('main .snote')].map((el, index) => {
    const lines = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node;
    const rects = [];
    while ((node = walker.nextNode())) {
      if (!node.textContent.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) if (rect.width > 0.01 && rect.height > 0.01) rects.push(rect);
    }
    for (const rect of rects.slice().sort((a, b) => a.top - b.top)) {
      const hit = lines.find(line => Math.min(line.bottom, rect.bottom) - Math.max(line.top, rect.top) > 0.5 * Math.min(line.bottom - line.top, rect.height));
      if (hit) { hit.left = Math.min(hit.left, rect.left); hit.right = Math.max(hit.right, rect.right); hit.top = Math.min(hit.top, rect.top); hit.bottom = Math.max(hit.bottom, rect.bottom); }
      else lines.push({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom });
    }
    const widest = lines.length ? round(Math.max(...lines.map(l => l.right - l.left))) : 0;
    const column = Math.min(contentBox(main), contentBox(reg) || Infinity);
    return { index, box: round(el.getBoundingClientRect().width), lines: lines.length, widest, columnBasis: round(column), threshold085: round(0.85 * column), inkNarrow: lines.length >= 2 && widest < 0.85 * column };
  });
  return { mainBorder: round(main.getBoundingClientRect().width), mainContent: contentBox(main), regionBg: reg ? getComputedStyle(reg).backgroundColor : null, regionBorder: reg ? round(reg.getBoundingClientRect().width) : null, regionContent: contentBox(reg), notes };
};

(async () => {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const out = [];
  for (const item of PLAN) {
    const dir = path.join(T20, item.dir);
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
    await page.waitForTimeout(150);
    const data = await page.evaluate(EVAL, item.region);
    await page.close();
    server.close();
    out.push({ ...item, ...data });
    console.log(`## ${item.route} @${item.width} · main border ${data.mainBorder} / 内容盒 ${data.mainContent} · ${item.region} border ${data.regionBorder} / 内容盒 ${data.regionContent}`);
    for (const n of data.notes) console.log(`   #${n.index} 盒 ${n.box} · ${n.lines} 行 · 最宽 ${n.widest} · 列基准 ${n.columnBasis} · 阈值 ${n.threshold085} ⇒ ink ${n.inkNarrow ? '窄' : '不窄'}`);
  }
  await browser.close();
  fs.writeFileSync(path.join(T20, 'runs', 'probe-column-basis.json'), JSON.stringify(out, null, 2));
})().catch(e => { console.error(e); process.exit(1); });
