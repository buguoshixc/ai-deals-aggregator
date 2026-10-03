'use strict';
/** 抽取 RECLASSIFIED_FINDINGS 的 FIXED / GUARDRAIL_ADDED / P0 / P1 行，供 FINAL_REAUDIT 逐条对账 */
const fs = require('fs');
const path = require('path');
const file = path.resolve(__dirname, '..', 'RECLASSIFIED_FINDINGS.md');
const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
const rows = lines.filter(l => l.startsWith('|') && !/^\|\s*-+/.test(l));
const pick = (re) => rows.filter(l => re.test(l)).map(l => {
  const c = l.split('|').map(s => s.trim());
  return { n: c[1], id: c[2], title: (c[2] || '').replace(/\*\*/g, ''), refs: c[3], old: c[4], cat: c[7], note: c[9] };
});
console.log('=== FIXED（REPAIR NOW）===');
pick(/\|\s*\*\*FIXED\*\*\s*\|/).forEach(r => console.log(`${r.n} | ${r.title.slice(0, 90)}`));
console.log('\n=== GUARDRAIL_ADDED ===');
pick(/\|\s*\*\*GUARDRAIL_ADDED\*\*\s*\|/).forEach(r => console.log(`${r.n} | ${r.title.slice(0, 90)}`));
console.log('\n=== 旧严重度 P0/P1 行 ===');
pick(/\|\s*P[01]\s*\|/).forEach(r => console.log(`${r.n} | ${r.old} | ${r.title.slice(0, 80)}`));
