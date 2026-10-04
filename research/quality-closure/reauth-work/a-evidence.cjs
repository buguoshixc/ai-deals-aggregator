'use strict';
/** A 例证据固化：在已存在的 A-m19-shape 副本上重跑生产门禁，断言「逐格点名」并把原文写入日志 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const A = 'D:\\qc-t23\\cases\\A-m19-shape';
const OUT = path.resolve(__dirname, 'logs', 'a-m19.json');
const run = (cmd, cwd) => {
  const r = spawnSync(cmd, { cwd, shell: true, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { exit: r.status, out: `${r.stdout || ''}\n${r.stderr || ''}` };
};
const gate = run('node scripts/tools/models-page-selftest.js --dir=dist', A);
const lines = gate.out.split('\n').filter(l => l.includes('✗') || l.includes('逐格对账'));
const cellLines = gate.out.split('\n').filter(l => l.includes('格「'));
const myJoin = run('node research/quality-closure/verify-work/join-audit.cjs --dist=dist', A);
const record = {
  mutation: 'M19 形状：glm-4.5v 两行三格价格对调（data-item / data-variant / 行数 / 单位文案全不变）',
  target: 'dist/models/glm-4.5v/index.html',
  productionGate: { command: 'node scripts/tools/models-page-selftest.js --dir=dist', exit: gate.exit, failureLines: lines.slice(0, 4), cellNaming: cellLines.slice(0, 4) },
  myIndependentJoin: { command: 'node research/quality-closure/verify-work/join-audit.cjs --dist=dist', exit: myJoin.exit },
  verdict: (gate.exit !== 0 && cellLines.some(l => l.includes('格「'))) ? 'CAUGHT-BY-PRODUCTION-GATE-AND-NAMED' : 'NOT-CAUGHT'
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(record, null, 2));
console.log('exit', gate.exit, '· 点名行', cellLines.length, '· 判定', record.verdict);
cellLines.slice(0, 2).forEach(l => console.log('   ' + l.trim().slice(0, 220)));
process.exit(record.verdict === 'CAUGHT-BY-PRODUCTION-GATE-AND-NAMED' ? 0 : 1);
