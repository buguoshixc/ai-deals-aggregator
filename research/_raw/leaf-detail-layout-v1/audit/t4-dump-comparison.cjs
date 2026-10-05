#!/usr/bin/env node
'use strict';
/** 打印 t4-analysis.json 里的 before/after 对账表（给 self-audit 抄数字用）。 */
const path = require('path');
const j = require(path.join(__dirname, 't4-analysis.json'));
const n = (v) => (v === null || v === undefined ? '—' : String(v));
const cell = (o, s, k) => (o[s] ? n(o[s][k]) : '—');
console.log('route | vp | main(w) 前→后 | .dpane(w|centerΔ) 前→后 | .dpane-src(w|word-break|max-width) 前→后 | scrollW 前→后');
for (const c of j.comparison) {
  const b = c.before; const a = c.after;
  console.log([
    c.route, '@' + c.viewport,
    'main ' + cell(b, 'main', 'w') + '→' + cell(a, 'main', 'w'),
    '.dpane ' + cell(b, '.dpane', 'w') + '|' + cell(b, '.dpane', 'cd') + '→' + cell(a, '.dpane', 'w') + '|' + cell(a, '.dpane', 'cd'),
    '.dpane-src ' + cell(b, '.dpane-src', 'w') + '|' + cell(b, '.dpane-src', 'wb') + '|' + cell(b, '.dpane-src', 'mw') + '→' + cell(a, '.dpane-src', 'w') + '|' + cell(a, '.dpane-src', 'wb') + '|' + cell(a, '.dpane-src', 'mw'),
    'scrollW ' + n(b.scrollWidth) + '→' + n(a.scrollWidth)
  ].join(' | '));
}
console.log('');
console.log('外壳（@1440）：.wrap / .topin / footer 前→后');
for (const c of j.comparison.filter(x => x.viewport === 1440)) {
  console.log('  ' + c.route + ' : .wrap ' + cell(c.before, '.wrap', 'w') + '→' + cell(c.after, '.wrap', 'w') +
    ' · .topin ' + cell(c.before, '.topin', 'w') + '→' + cell(c.after, '.topin', 'w') +
    ' · footer ' + cell(c.before, 'footer', 'w') + '→' + cell(c.after, 'footer', 'w'));
}
