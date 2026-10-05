#!/usr/bin/env node
/**
 * t10 Self-Audit：**独立证伪 T7-F1 的替补判据**（不引用 t12 自己的 teeth 列表）。
 *
 * 做法：从 `scripts/tools/coverage-targets-selftest.js` 里把 `missingRowsProblems()` 的**源码文本**抠出来，
 * 在我自己的脚本里 eval 成函数，然后喂**我自己设计的 6 组对抗输入**（含老判据恰好漏掉的那一类空集情形）。
 * 目的：证明它是「可证伪」的，而不是「永远绿」的假牙。
 *
 * 同时给出**老判据的对照**：`[].every(...) === true`（空集恒真），说明为什么必须换。
 * 输出：控制台 + t7f1-falsifiable.json
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');

const selftestPath = path.join(ROOT, 'scripts', 'tools', 'coverage-targets-selftest.js');
const src = fs.readFileSync(selftestPath, 'utf8');

// 抠出函数源码（按大括号配平），确保用的是盘上真实实现，而不是我抄的一份
const start = src.indexOf('function missingRowsProblems(');
if (start < 0) throw new Error('missingRowsProblems 未找到');
let depth = 0, end = -1;
for (let i = src.indexOf('{', start); i < src.length; i++) {
  if (src[i] === '{') depth++;
  else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
}
const fnSource = src.slice(start, end);
const missingRowsProblems = new Function(`${fnSource}; return missingRowsProblems;`)();

const cases = [
  { id: 'C0 正控制：空集 + 计数 0（当前盘面：MISSING=0）', rows: [], expected: 0, wants: 'no-problem' },
  { id: 'C1 空集 + 计数 1（老判据在此恒真 ⇒ 假牙）', rows: [], expected: 1, wants: 'problem' },
  { id: 'C2 合成 MISSING 行 present=1 + 计数 1', rows: [{ state: 'MISSING', provider: 'x', dimension: 'deals', present: 1 }], expected: 1, wants: 'problem' },
  { id: 'C3 行数 1 + 计数 2（集合与计数脱钩）', rows: [{ state: 'MISSING', provider: 'x', dimension: 'deals', present: 0 }], expected: 2, wants: 'problem' },
  { id: 'C4 合法 MISSING 行 present=0 + 计数 1', rows: [{ state: 'MISSING', provider: 'x', dimension: 'deals', present: 0 }], expected: 1, wants: 'no-problem' },
  { id: 'C5 非 MISSING 行（COVERED present=5）不得被误伤 + 计数 0', rows: [{ state: 'COVERED', provider: 'x', dimension: 'deals', present: 5 }], expected: 0, wants: 'no-problem' },
  { id: 'C6 坏输入：rows 不是数组', rows: null, expected: 0, wants: 'no-problem' }
];

const results = [];
let failures = 0;
console.log('## 独立证伪 T7-F1（用盘上真实实现，喂我自己的对抗输入）\n');
for (const item of cases) {
  const problems = missingRowsProblems(item.rows, item.expected);
  const got = problems.length ? 'problem' : 'no-problem';
  const ok = got === item.wants;
  if (!ok) failures++;
  results.push({ id: item.id, expectedCount: item.expected, rows: item.rows, wants: item.wants, got, problems, ok });
  console.log(`${ok ? '✓' : '✗'} ${item.id}`);
  console.log(`    ⇒ ${got}${problems.length ? ' : ' + problems[0].slice(0, 120) : ''}`);
}

// 老判据的对照：空集恒真
const oldPredicateHoldsOnEmpty = [].filter(row => row.state === 'MISSING').every(row => row.present === 0);
console.log(`\n## 老判据对照\n    [].filter(state==='MISSING').every(present===0) === ${oldPredicateHoldsOnEmpty}（空集恒真 ⇒ MISSING=0 时永远绿）`);
console.log(`    新判据在 C1（空集 vs 计数 1）与 C2（present=1）上都报红 ⇒ 可证伪`);
console.log(`\n结论：不通过 ${failures} / ${cases.length} 组对抗输入`);

fs.writeFileSync(path.join(__dirname, 't7f1-falsifiable.json'), JSON.stringify({
  extractedFrom: 'scripts/tools/coverage-targets-selftest.js (missingRowsProblems, 盘上真实实现)',
  functionSource: fnSource,
  oldPredicateHoldsOnEmpty,
  cases: results,
  failures
}, null, 2) + '\n');
console.log('→ 证据写入 t7f1-falsifiable.json');
process.exit(failures ? 1 : 0);
