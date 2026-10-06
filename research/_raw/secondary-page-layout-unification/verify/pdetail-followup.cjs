#!/usr/bin/env node
/**
 * T4 追加实测：`.pdetailbody { max-width: 72ch }` 到底是「阅读列的理由」还是「同类半截列」。
 *
 * 只量一件事：把 /plans/coding/ 的「详情」行**真的展开**，然后逐个直接子元素量
 * 「当前 72ch 下的行数/字迹」与「max-width:none 下的行数/字迹」——
 *   · 若内容本来就长到会超过 72ch ⇒ 收窄是阅读列的理由；
 *   · 若内容字迹在 72ch 以内、放宽后仍是同一行 ⇒ 收窄纯粹是把短文本折行 + 右侧留空。
 *
 * 用法：node pdetail-followup.cjs --dir=dist --out=…/verify/pdetail-followup.json
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
const OUT = path.resolve(ROOT, arg('out', path.join(__dirname, 'pdetail-followup.json')));
const EDGE = process.env.DSH_EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROUTE = arg('route', 'plans/coding/');

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
  const px = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
  const buttons = Array.prototype.slice.call(document.querySelectorAll('.ptable button, .ptable a, button, a'))
    .filter(el => /详情/.test(el.textContent || '') && el.offsetParent !== null);
  let expand = 'none';
  if (buttons.length) { buttons[0].click(); expand = 'clicked'; }
  const body = Array.prototype.slice.call(document.querySelectorAll('.pdetailbody')).find(el => el.getBoundingClientRect().width > 0);
  if (!body) return { expand, found: false };
  const inkOf = el => {
    const texts = [];
    const walk = node => { for (const child of node.childNodes) {
      if (child.nodeType === 3) { if (child.textContent.trim()) texts.push(child); }
      else if (child.nodeType === 1) walk(child); } };
    walk(el);
    const rects = [];
    for (const text of texts) { const range = document.createRange(); range.selectNodeContents(text);
      for (const rect of range.getClientRects()) if (rect.width > 0 && rect.height > 0) rects.push(rect); }
    if (!rects.length) return null;
    return { lines: rects.length, width: round(Math.max.apply(null, rects.map(r => r.right)) - Math.min.apply(null, rects.map(r => r.left))),
      longest: round(Math.max.apply(null, rects.map(r => r.width))) };
  };
  const describe = el => el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).trim().split(/\\s+/).join('.') : '');
  const read = () => Array.prototype.slice.call(body.children).map((el, index) => {
    const cs = getComputedStyle(el);
    return { index, tag: describe(el), text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 80),
      chars: (el.textContent || '').replace(/\\s+/g, ' ').trim().length,
      box: round(el.getBoundingClientRect().width), height: round(el.getBoundingClientRect().height),
      lineHeight: px(cs.lineHeight), ink: inkOf(el) };
  });
  const capped = read();
  const bodyBox = round(body.getBoundingClientRect().width);
  const cell = body.closest('td');
  const cellBox = cell ? round(cell.getBoundingClientRect().width) : null;
  const saved = body.style.maxWidth;
  body.style.maxWidth = 'none';
  const wide = read();
  const wideBox = round(body.getBoundingClientRect().width);
  body.style.maxWidth = saved;
  const cs = getComputedStyle(body);
  return { expand, found: true, bodyBox, cellBox, maxWidth: cs.maxWidth, fontSize: cs.fontSize,
    dl: { dt: body.querySelectorAll('dt').length, dd: body.querySelectorAll('dd').length, h3: body.querySelectorAll('h3').length, p: body.querySelectorAll('p').length },
    capped, widened: wide, widenedBox: wideBox,
    table: (() => { const t = body.closest('table'); return t ? { clientWidth: t.clientWidth, scrollWidth: t.scrollWidth } : null; })() };
})()`;

(async () => {
  const { server, port } = await serve(DIR);
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`http://127.0.0.1:${port}/${ROUTE}`, { waitUntil: 'load' });
  await page.evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
  const measured = await page.evaluate(SOURCE);
  await browser.close();
  server.close();

  const report = { generatedAt: new Date().toISOString(), dir: path.relative(ROOT, DIR).split(path.sep).join('/'), route: ROUTE, viewport: 1440, measured };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(`route=${ROUTE} expand=${measured.expand} bodyBox=${measured.bodyBox} cellBox=${measured.cellBox} maxWidth=${measured.maxWidth}`);
  console.log(`结构 dt=${measured.dl.dt} dd=${measured.dl.dd} h3=${measured.dl.h3} p=${measured.dl.p} · max-width:none 后 bodyBox=${measured.widenedBox}`);
  for (const [i, row] of measured.capped.entries()) {
    const wideRow = measured.widened[i];
    console.log(`  #${i} ${row.tag} chars=${row.chars} 行数 ${row.ink ? row.ink.lines : 0} → ${wideRow.ink ? wideRow.ink.lines : 0} · 最长字迹 ${row.ink ? row.ink.longest : 0}px → ${wideRow.ink ? wideRow.ink.longest : 0}px · 「${row.text.slice(0, 40)}」`);
  }
  console.log(`证据：${path.relative(ROOT, OUT).split(path.sep).join('/')}`);
})().catch(error => { console.error(error); process.exit(1); });
