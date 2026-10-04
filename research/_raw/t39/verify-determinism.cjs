// t39：在 Node 进程内跑两次采集器，核对逐字节一致并打印关键抽取字段（避开 PowerShell 重定向的编码问题）
'use strict';
const { spawnSync } = require('child_process');
const crypto = require('crypto');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');

function run() {
  const result = spawnSync(process.execPath, ['research/_raw/t39/collect.cjs', '--json'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });
  return { exit: result.status, text: result.stdout };
}
const a = run();
const b = run();
console.log('exit codes        :', a.exit, b.exit);
console.log('bytes             :', Buffer.byteLength(a.text), Buffer.byteLength(b.text));
console.log('sha256 run A      :', sha(a.text));
console.log('sha256 run B      :', sha(b.text));
console.log('BYTE-IDENTICAL    :', a.text === b.text);
const parsed = JSON.parse(a.text);
console.log('\n--- 抽取字段核对 ---');
console.log('mutationBattery   :', JSON.stringify(parsed.evidence.mutationBattery));
console.log('register.arbitrationCount:', parsed.evidence.residualRegister.arbitrationCount);
console.log('register.sha256   :', parsed.evidence.residualRegister.sha256);
console.log('register.sections :', parsed.evidence.residualRegister.sections.join(' '));
console.log('freshnessPolicy   :', JSON.stringify(parsed.evidence.freshnessPolicy));
console.log('deploy cells      :', parsed.deployPlaceholders.cells.length);
console.log('determinism       :', JSON.stringify(parsed.determinism));
console.log('coverage states   :', JSON.stringify(parsed.coverageReport.coverageTargets.states), 'sum', parsed.coverageReport.coverageTargets.statesSum);
// 落一份给人读的 JSON（由 Node 写，不经 PowerShell）
require('fs').writeFileSync(path.join(__dirname, 'tmp', 'collect-sample.json'), `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
console.log('\nwritten tmp/collect-sample.json');
