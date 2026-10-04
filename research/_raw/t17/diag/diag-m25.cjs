// t17：M25 为什么没被抓住？（看 coverage-targets-selftest 在该变异下的输出与 precedence 是否可达）
'use strict';
const fs = require('fs');
const path = require('path');
const battery = JSON.parse(fs.readFileSync(path.join(__dirname, 'logs', 'battery.json'), 'utf8'));
const lines = [];
const say = line => lines.push(String(line));
const item = battery.results.find(row => row.id === 'M25');
say(`M25 verdict=${item.verdict}`);
say(`applied=${JSON.stringify(item.applied)}`);
say(`targetsChanged=${JSON.stringify(item.targetsChanged)}`);
say(`restore=${JSON.stringify(item.restore)}`);
for (const gate of item.gates || []) {
  say(`\n--- ${gate.id} exit=${gate.exitCode} ${gate.durationMs}ms`);
  for (const line of (gate.assertions || [])) say(`   · ${line}`);
}
// 直接看 lib 里的 precedence 用法
const lib = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'scripts', 'lib', 'coverage-targets.js'), 'utf8');
const index = lib.indexOf('PRECEDENCE');
say('\n=== PRECEDENCE 定义与用法 ===');
let cursor = index;
let hits = 0;
while (cursor >= 0 && hits < 6) {
  const lineStart = lib.lastIndexOf('\n', cursor) + 1;
  const lineEnd = lib.indexOf('\n', cursor);
  say(`  ${lib.slice(lineStart, lineEnd).trim()}`);
  const usage = lib.indexOf('PRECEDENCE', cursor + 1);
  if (usage < 0) break;
  const ls = lib.lastIndexOf('\n', usage) + 1;
  const le = lib.indexOf('\n', usage);
  say(`  ${lib.slice(ls, le).trim()}`);
  cursor = lib.indexOf('PRECEDENCE', le);
  hits++;
}
fs.writeFileSync(path.join(__dirname, 'diag-m25.txt'), lines.join('\n') + '\n', 'utf8');
process.stdout.write('written diag-m25.txt\n');
