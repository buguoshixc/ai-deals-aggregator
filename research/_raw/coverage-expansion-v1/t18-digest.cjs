'use strict';
/** t18：把 4 份产物压成一段可粘贴的摘要（给最终报告用）。 */
const fs = require('fs');
const path = require('path');
const WT = 'D:/OneDrive/Desktop/Code/AI Page/.worktrees/coverage-expansion-v1';
const R = f => JSON.parse(fs.readFileSync(path.join(WT, 'research/_raw/coverage-expansion-v1', f), 'utf8'));

const gate = R('t18-gate-results.json');
const mut = R('t18-mutations.json');
const ext = R('t18-extras.json');
const rec = R('t18-recompute.json');

console.log('### 口径');
console.log('HEAD=' + gate.head.sha.slice(0, 7) + ' ' + gate.head.subject);
console.log('门禁步骤=' + gate.gateSummary.total + ' 过=' + gate.gateSummary.passed + ' 红=' + gate.gateSummary.failed + ' 跳过=' + gate.gateSummary.skipped);
console.log('红的步骤=' + JSON.stringify(gate.gateSummary.failedNames));
console.log('并发编辑=' + JSON.stringify(gate.concurrentEdits));
console.log('check-ci: bare=' + ext.checkCi.bare.exit + ' pin38=' + ext.checkCi.pin38.exit + ' pin37=' + ext.checkCi.pin37.exit + ' verifyYml=' + ext.checkCi.verifyYmlPin + ' steps=' + ext.checkCi.actionSteps);
console.log('静止树: tracked=' + ext.staticTree.trackedFiles + ' changed=' + ext.staticTree.changedDuringRun.length + ' static=' + ext.staticTree.static + ' HEAD稳定=' + ext.staticTree.headStable);

console.log('\n### build A/B');
console.log(JSON.stringify({ identical: gate.extras.buildAB.identical, filesA: gate.extras.buildAB.filesA, filesB: gate.extras.buildAB.filesB, htmlA: gate.extras.buildAB.htmlA, shaA: gate.extras.buildAB.manifestSha, shaB: gate.extras.buildAB.manifestShaB }, null, 1));
console.log('### models');
console.log(JSON.stringify(gate.extras.models, null, 1));
console.log('### 报告');
console.log(JSON.stringify({ identical: gate.extras.report.identical, exit1: gate.extras.report.exit1, exit2: gate.extras.report.exit2, equation: gate.extras.report.equation }, null, 1));
console.log('### 重算 vs 报告');
rec.comparison.forEach(c => console.log('  ' + (c.agree === true ? '✓' : c.agree === 'n/a' ? '·' : '✗') + ' ' + c.item + ' 独立=' + c.recomputed + ' 报告=' + c.reported));
console.log('  Coding：模型串 ' + rec.recomputed.coding.modelStrings + ' / 映射 ' + rec.recomputed.coding.mappedLinks + ' / 已声明 ' + rec.recomputed.coding.declared);
console.log('### 完整性');
console.log(JSON.stringify(gate.extras.integrity, null, 1));
console.log('### 产物清点');
console.log(JSON.stringify(ext.inventory, null, 1));
console.log('### 变异');
mut.cases.forEach(c => console.log('  ' + (c.ok ? '✓' : '✗') + ' ' + c.id + ' 对照=' + c.controlExit + ' 变异=' + c.mutantExit + ' · ' + c.promise));
console.log('  共享树未变=' + mut.sharedTreeIntact);
console.log('### 步骤逐条');
gate.steps.forEach((s, i) => console.log('  ' + String(i + 1).padStart(2) + '. ' + (s.exit === 0 ? 'PASS' : s.exit === null ? 'SKIP' : 'FAIL') + ' [' + s.exit + '] ' + s.name));
