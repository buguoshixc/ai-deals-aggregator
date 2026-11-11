'use strict';
/** 最终链接自检：5 个 mockup 页面里的站内相对链接必须解析到存在的 dist 目标。 */
const fs = require('fs');
const path = require('path');
const V5 = path.resolve(__dirname, '..');
const ROOT = path.resolve(__dirname, '../../..');
const files = ['home-light.html', 'home-dark.html', 'home-390.html', 'family.html', 'compare.html'];
const report = {};
let totalBad = 0;
for (const f of files) {
  const html = fs.readFileSync(path.join(V5, f), 'utf8');
  const urls = [...html.matchAll(/\b(?:href|src)\s*=\s*"([^"]*)"/gi)].map(m => m[1].trim());
  const rows = [];
  for (const u of urls) {
    if (/^(https?:|mailto:|tel:|data:|javascript:|#)/i.test(u) || u === '') continue;
    const target = path.resolve(V5, decodeURIComponent(u.split('#')[0].split('?')[0]));
    let exists = false, isDir = false;
    try { const st = fs.statSync(target); exists = true; isDir = st.isDirectory(); } catch (e) {}
    const indexExists = exists && isDir ? fs.existsSync(path.join(target, 'index.html')) : null;
    rows.push({ url: u, exists, isDir, indexExists, ok: exists && (isDir ? !!indexExists : true) });
  }
  const bad = rows.filter(r => !r.ok);
  totalBad += bad.length;
  const prefixes = {};
  for (const r of rows) { const p = /^\.\.\/\.\.\/dist\//.test(r.url) ? '../../dist/' : 'other'; prefixes[p] = (prefixes[p] || 0) + 1; }
  report[f] = { total: rows.length, bad: bad.length, prefixes, badSamples: bad.slice(0, 10) };
}
report.summary = { files: files.length, totalBad };
fs.writeFileSync(path.join(V5, '_data', 'linkcheck-final.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 1));
if (totalBad) process.exit(1);
