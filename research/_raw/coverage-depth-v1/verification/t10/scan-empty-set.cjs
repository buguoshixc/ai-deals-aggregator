#!/usr/bin/env node
/**
 * t10 Self-Audit：**全仓扫描 `filter(...).every(...)` / `filter(...).some(...)` 形态**（只读）。
 *
 * 判据：这类表达式在 `filter` 结果为空集时**恒真/恒假**（vacuous truth）。T7-F1 就是这一形态。
 * 输出：file:line + 表达式片段 + 该表达式**前面 6 行内是否出现过非空前提**（.length / size / 计数比较）。
 *
 * 用法：node scan-empty-set.cjs [目录前缀，默认 scripts]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (entry.name.endsWith('.js') || entry.name.endsWith('.cjs') || entry.name.endsWith('.mjs')) acc.push(full);
  }
  return acc;
}

const files = walk(path.join(ROOT, 'scripts'));
const hits = [];
const RE = /([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*\.filter\(\s*([^()]*(?:\([^()]*\)[^()]*)*)\)\s*\.(every|some)\(/g;

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const lines = src.split('\n');
  let match;
  RE.lastIndex = 0;
  while ((match = RE.exec(src)) !== null) {
    const before = src.slice(0, match.index);
    const line = before.split('\n').length;
    const windowStart = Math.max(0, line - 7);
    const window = lines.slice(windowStart, line - 1).join('\n');
    const guard = /\.length\s*(===|!==|>|>=|<|<=)\s*0|\.length\s*>|\.size\s*(===|!==|>|>=)|非空|不为空|空集/.test(window);
    hits.push({
      file: path.relative(ROOT, file),
      line,
      receiver: match[1],
      filterArg: match[2].replace(/\s+/g, ' ').slice(0, 90),
      terminal: match[3],
      guardNearby: guard,
      code: lines[line - 1].trim().slice(0, 150)
    });
  }
}

console.log(`扫描 ${files.length} 个文件，命中 ${hits.length} 处 filter(…).every/some：\n`);
for (const hit of hits) {
  console.log(`${hit.file}:${hit.line}  [${hit.receiver}.filter(…)..${hit.terminal}] guardNearby=${hit.guardNearby ? 'YES' : 'no'}`);
  console.log(`    filter: ${hit.filterArg}`);
  console.log(`    code  : ${hit.code}`);
}
fs.writeFileSync(path.join(__dirname, 'empty-set-scan.json'), JSON.stringify({ scannedFiles: files.length, hits }, null, 2) + '\n');
console.log('\n→ 证据写入 empty-set-scan.json');
