#!/usr/bin/env node
/**
 * 只读对拍：CI 日志里的「覆盖意图层演练」逐条输出 vs 本地同一条命令的输出。
 * 目标：找出第一条分歧，定位 CI 红 / 本地绿。
 * 用法：node research/_raw/t22/diff-ci-vs-local.cjs <ci-log-full.txt> <local-selftest.out>
 */
'use strict';
const fs = require('fs');

/** 从一行 GitHub Actions 日志里剥掉 "job\tstep\t<ISO>Z " 前缀 */
function stripPrefix(line) {
  let s = line;
  const tab = s.indexOf('\t');
  if (tab >= 0) s = s.slice(tab + 1);            // job 名
  const tab2 = s.indexOf('\t');
  if (tab2 >= 0) s = s.slice(tab2 + 1);          // step 名
  const m = s.match(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z/);
  if (m) s = s.slice(m[0].length);
  return s.replace(/^ /, '');
}

const clean = s => s.replace(/\x1b\[[0-9;]*m/g, '').replace(/\s+/g, ' ').trim();
const isCheck = s => /^[✓✗]/.test(s);

const ciAll = fs.readFileSync(process.argv[2], 'utf8').split(/\r?\n/).map(stripPrefix);
const startAt = ciAll.findIndex(l => l.includes('coverage-targets-selftest.js'));
const endAt = ciAll.findIndex(l => l.includes('覆盖意图层演练：'));
const ci = ciAll.slice(startAt, endAt + 1).map(clean).filter(isCheck);
console.log(`CI 段落：日志行 ${startAt + 1}–${endAt + 1} · 判定点 ${ci.length} 条`);
console.log(`CI 汇总：${clean(ciAll[endAt] || '')}`);

const local = fs.readFileSync(process.argv[3], 'utf8').split(/\r?\n/).map(clean).filter(isCheck);
console.log(`本地判定点：${local.length} 条`);

const n = Math.max(ci.length, local.length);
let diff = -1;
for (let i = 0; i < n; i++) {
  const a = ci[i] ?? '(CI 无)';
  const b = local[i] ?? '(本地无)';
  if (a !== b) { diff = i; console.log(`\n>>> 第一条分歧 @ #${i + 1}\n    CI   : ${a}\n    本地 : ${b}`); break; }
}
if (diff < 0) console.log('\n判定点逐条一致（无分歧）');
else {
  console.log('\n--- CI 在分歧之后还有多少条 ---', ci.length - diff);
  console.log('--- 本地在分歧之后还有多少条 ---', local.length - diff);
  console.log('\n--- 分歧点前后（CI | 本地）---');
  for (let i = Math.max(0, diff - 3); i < Math.min(n, diff + 4); i++) {
    console.log(`  #${i + 1}\n    CI   : ${ci[i] ?? '(无)'}\n    本地 : ${local[i] ?? '(无)'}`);
  }
}
