// t17：找 M17 / M22 / M23 / M24 的真实锚点
'use strict';
const fs = require('fs');
const path = require('path');
const REPO = path.resolve(__dirname, '..', '..', '..');
const out = [];
const say = line => out.push(String(line));
const read = relative => fs.readFileSync(path.join(REPO, relative), 'utf8');

say('=== M17 verify.yml：allow_degraded_run 的所有出现 ===');
{
  const text = read('.github/workflows/verify.yml');
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (/allow_degraded_run/.test(line)) say(`  ${index + 1}: ${line}`);
  });
  const first = lines.findIndex(line => /allow_degraded_run:/.test(line));
  say(`  首次出现行号: ${first + 1}（上下文）`);
  for (let i = Math.max(0, first - 6); i < Math.min(lines.length, first + 10); i++) say(`    ${i + 1}: ${lines[i]}`);
}

say('\n=== M22 detail page：前 40 个数值格候选 ===');
{
  const file = ['dist/models/glm-4.5v/index.html', 'dist/models/deepseek-v4-pro/index.html'].find(item => fs.existsSync(path.join(REPO, item)));
  const text = read(file);
  say(`  文件: ${file}  bytes=${text.length}`);
  const matches = [...text.matchAll(/>(?:\$)?(\d+(?:\.\d+)?)(?:<\/(?:td|span|div|code|b)>)?/g)].slice(0, 40);
  say(`  ">数字<" 型匹配数（前 40）：${matches.length}`);
  for (const match of matches.slice(0, 12)) say(`    … ${text.slice(Math.max(0, match.index - 90), match.index + 40).replace(/\s+/g, ' ')}`);
  say('  price 相关 class/属性抽样：');
  for (const match of [...text.matchAll(/data-price[^ >]*="[^"]*"|class="[^"]*price[^"]*"|data-rate[^ >]*="[^"]*"/g)].slice(0, 12)) say(`    ${match[0].slice(0, 120)}`);
}

say('\n=== M23 历史文件结构 ===');
for (const candidate of ['scripts/data/plan-history.json', 'scripts/data/deal-history.json', 'scripts/data/api-plan-history.json']) {
  const file = path.join(REPO, candidate);
  if (!fs.existsSync(file)) { say(`  ${candidate}: 不存在`); continue; }
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  const keys = Object.keys(doc);
  say(`  ${candidate}: 顶层键 ${keys.join(', ')}`);
  for (const key of keys) {
    if (Array.isArray(doc[key])) say(`    ${key}: 数组 ${doc[key].length} 项；样本 ${JSON.stringify(doc[key].slice(0, 2)).slice(0, 300)}`);
    else if (typeof doc[key] === 'object' && doc[key] && !key.startsWith('_')) say(`    ${key}: 对象 ${Object.keys(doc[key]).length} 键`);
  }
  for (const key of keys) {
    if (key.startsWith('_')) {
      const text = String(doc[key]);
      if (/状态|status|event|kind/.test(text)) say(`    _${key} 摘录: ${text.slice(0, 260)}`);
    }
  }
}

say('\n=== M24 provenance-selftest 的 check 定义 ===');
{
  const text = read('scripts/tools/provenance-selftest.js');
  const index = text.indexOf('function check');
  say(text.slice(index, index + 400));
}
fs.writeFileSync(path.join(__dirname, 'diag-anchors.txt'), out.join('\n') + '\n', 'utf8');
process.stdout.write(`written diag-anchors.txt (${out.length} lines)\n`);
