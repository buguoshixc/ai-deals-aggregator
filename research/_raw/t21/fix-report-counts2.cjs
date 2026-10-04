'use strict';
/** t21：修掉最后两处残留的自测项数（改成实跑读数）。 */
const fs = require('fs');
const p = 'research/coverage-expansion-v1-self-audit.md';
let md = fs.readFileSync(p, 'utf8');
const before = md.length;
const fixes = [
  ['我复跑 `models-page-selftest` **exit 0（125 项）**', '我复跑 `models-page-selftest` **exit 0（实测 115 项）**'],
  ['`selftest:provenance` 复跑 **exit 0（67 项）**', '`selftest:provenance` 复跑 **exit 0（实测 132 项）**'],
];
const applied = [];
for (const [from, to] of fixes) { if (md.includes(from)) { md = md.replace(from, to); applied.push(from + ' → ' + to); } }
fs.writeFileSync(p, md, 'utf8');
console.log('applied:', JSON.stringify(applied, null, 1));
console.log(before + ' → ' + md.length);
const checks = ['（125 项）', '（67 项）'];
for (const c of checks) console.log(c + ': ' + (md.includes(c) ? 'STILL PRESENT' : 'gone'));
