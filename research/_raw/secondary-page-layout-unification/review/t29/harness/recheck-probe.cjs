#!/usr/bin/env node
/** T29 · 把探针 JSON 按 **t28 后的新判据**（去掉 noscript 子句）重算，避免误读探针内置的旧旗标。 */
'use strict';
const fs = require('fs');
const path = require('path');
const T29 = path.resolve(__dirname, '../../../../../..') + '/research/_raw/secondary-page-layout-unification/review/t29';
const rows = JSON.parse(fs.readFileSync(path.join(T29, 'runs', 'probe-render.json'), 'utf8'));
const out = [];
for (const r of rows) {
  const notes = r.notes.map(n => ({
    i: n.index, box: `${n.boxWidth}x${n.boxHeight}`, visible: n.visibleTextLength, raw: n.rawTextLength,
    glyphs: n.glyphRects, noscript: n.noscriptSubtree, rendered: n.rendered,
    firesNew: !n.rendered && n.visibleTextLength > 0 && n.glyphRects === 0,
    firesOld: !n.rendered && n.visibleTextLength > 0 && n.glyphRects === 0 && !n.noscriptSubtree
  }));
  out.push({ dir: r.dir, route: r.route, css: r.css || null, notes: notes.length, firesNew: notes.filter(n => n.firesNew).length, firesOld: notes.filter(n => n.firesOld).length, rows: notes });
}
fs.writeFileSync(path.join(T29, 'runs', 'probe-recheck.json'), JSON.stringify(out, null, 2));
for (const r of out) {
  console.log(`## ${r.dir} ${r.route}${r.css ? ' +css[' + r.css + ']' : ''}：${r.notes} 条 · 新判据会咬 ${r.firesNew} · 旧判据会咬 ${r.firesOld}`);
  if (r.route === 'plans/coding/') for (const n of r.rows) console.log(`   #${n.i} 盒 ${n.box} 可见 ${n.visible} 原始 ${n.raw} 字形 ${n.glyphs} noscript ${n.noscript} rendered ${n.rendered} → 新 ${n.firesNew ? '咬' : '不咬'} / 旧 ${n.firesOld ? '咬' : '不咬'}`);
}
