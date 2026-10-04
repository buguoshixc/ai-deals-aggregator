// t17 诊断 2：4 个异常用例的门禁输出 + 恢复失败定位
'use strict';
const fs = require('fs');
const path = require('path');
const battery = JSON.parse(fs.readFileSync(path.join(__dirname, 'logs', 'battery.json'), 'utf8'));

const lines = [];
const say = line => lines.push(String(line));
const want = new Set(['M17', 'M22', 'M23', 'M24']);
for (const item of battery.results) {
  if (!want.has(item.id)) continue;
  say(`\n===================== ${item.id} ${item.title}`);
  say(`verdict: ${item.verdict}  error: ${item.error || '(none)'}`);
  say(`applied: ${JSON.stringify(item.applied)}`);
  say(`targetsChanged: ${JSON.stringify(item.targetsChanged)}`);
  say(`restore: ${JSON.stringify(item.restore)}`);
  for (const gate of item.gates || []) {
    say(`\n  --- gate ${gate.id} exit=${gate.exitCode} ${gate.durationMs}ms`);
    for (const line of (gate.assertions || [])) say(`      · ${line}`);
  }
}
fs.writeFileSync(path.join(__dirname, 'diag-anomalies.txt'), lines.join('\n') + '\n', 'utf8');
process.stdout.write(`written diag-anomalies.txt (${lines.length} lines)\n`);

