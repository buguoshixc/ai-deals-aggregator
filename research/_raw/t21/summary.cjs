'use strict';
/** t21：把 audit-measurements.json 的要点摘要打印出来（供写报告时引用）。 */
const fs = require('fs');
const m = JSON.parse(fs.readFileSync('research/_raw/t21/audit-measurements.json', 'utf8'));
console.log('HEAD ' + m.head.slice(0, 7) + ' · changed ' + m.diffSummary.totalChanged + ' · add/del ' + m.diffSummary.addedLines + '/' + m.diffSummary.deletedLines);
console.log('byArea ' + JSON.stringify(m.diffSummary.byArea) + ' · byStatus ' + JSON.stringify(m.diffSummary.byStatus));
console.log('derivedCandidates=' + m.diffSummary.derivedCandidates + ' testFiles=' + m.diffSummary.testFiles);
console.log('\n--- identityChurn ---');
console.log(JSON.stringify(m.identityChurn, null, 1).slice(0, 1500));
console.log('\n--- assertDelta (delta != 0) ---');
for (const f of m.assertDelta.files.filter(x => x.delta !== 0)) console.log('  ' + f.file + '  check ' + f.checkCallsOld + '->' + f.checkCallsNew + ' (d' + f.delta + ')  throwNew=' + f.throwNew);
console.log('unchanged test files: ' + m.assertDelta.files.filter(x => x.delta === 0).length);
console.log('weakened: ' + JSON.stringify(m.assertDelta.weakened));
console.log('\n--- reproducible ---');
for (const [k, v] of Object.entries(m.reproducible)) console.log('  ' + k + ' exit=' + v.exit + ' :: ' + String(v.tail).slice(0, 120));
console.log('gates: validate=' + m.gates.validateStrict.exit + ' :: ' + m.gates.validateStrict.tail.slice(0, 90));
console.log('gates: coverage=' + m.gates.coverageReport.exit + ' :: ' + m.gates.coverageReport.tail.slice(0, 90));
console.log('\n--- corrections ---');
for (const c of m.corrections) console.log('  ' + c.id + ' ' + c.field + ' draft=' + JSON.stringify(c.draftValue) + ' baseline=' + JSON.stringify(c.baselineSays) + ' verdict=' + c.verdict + ' measured=' + JSON.stringify(c.measured).slice(0, 200));
console.log('\n--- residual scan ---');
for (const r of m.residualScan) {
  if (r.exists === false) { console.log('  MISSING ' + r.file); continue; }
  if (r.hits && r.hits.length) for (const h of r.hits) console.log('  HIT ' + r.file + ':' + h.line + ' [' + h.rule + '] ' + h.text);
}
console.log('\n--- mutation ---');
console.log(JSON.stringify(m.mutation).slice(0, 300));
