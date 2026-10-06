#!/usr/bin/env node
/**
 * recovered/ · 从冻结的源码 diff 复原「修复前」的 verify-site.js（captain 写的复原工具）
 *
 * 为什么需要它：t7 原地整块替换了 §22c 且未留备份，`4cae2fb2…` 那一版在磁盘上不复存在。
 * 它只以「+ 行」的形式活在 T3 于改动前抓取的 `diff/02-source-diff.patch` 里
 * （`git diff` 工作区 vs 1f225d2，形状 +820/−0）。
 *
 * 判定标准是 **sha256 相等**，不是"看起来像"：
 *   期望 4cae2fb2ab2599997668feca8c26c3161fe882a518e61d01552b7adc95f95756
 *
 * 用法（在工作树根执行）：
 *   node research/_raw/secondary-page-layout-unification/recovered/recover-pre-t7.cjs \
 *        research/_raw/secondary-page-layout-unification/diff/02-source-diff.patch \
 *        scripts/tools/verify-site.js \
 *        research/_raw/secondary-page-layout-unification/recovered/verify-site.pre-t7.js
 *
 * 只读 patch 与 `git show`，只写第三个参数给的文件；不碰工作树里的任何源码。
 */

'use strict';

const fs = require('fs');
const cp = require('child_process');
const crypto = require('crypto');

const [, , patchFile, target, outFile] = process.argv;
if (!patchFile || !target || !outFile) {
  console.error('用法：node recover-pre-t7.cjs <patch> <target-file> <out-file>');
  process.exit(1);
}

const patch = fs.readFileSync(patchFile, 'utf8').split('\n');
const marker = `diff --git a/${target} `;
const start = patch.findIndex(line => line.startsWith(marker));
if (start < 0) {
  console.error(`在 patch 里找不到 ${target} 的段落（marker: ${marker}）`);
  process.exit(2);
}
let end = start + 1;
while (end < patch.length && !patch[end].startsWith('diff --git ')) end += 1;
const section = patch.slice(start, end);

// 基线 = HEAD 里的那一版（不含 §22c），把 patch 的 hunk 应用上去
const base = cp.execFileSync('git', ['show', `HEAD:${target}`], {
  encoding: 'utf8',
  maxBuffer: 128 * 1024 * 1024
}).split('\n');

const out = [];
let cursor = 0;
let k = section.findIndex(line => line.startsWith('@@'));
if (k < 0) {
  console.error('该段落里没有 hunk');
  process.exit(3);
}

while (k < section.length) {
  const head = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(section[k]);
  if (!head) break;
  const hunkStart = parseInt(head[1], 10) - 1;
  while (cursor < hunkStart) out.push(base[cursor++]);
  k += 1;
  let reachedNextHunk = false;
  while (k < section.length) {
    const line = section[k];
    if (line.startsWith('@@') || line.startsWith('diff --git ')) { reachedNextHunk = true; break; }
    if (line.startsWith('\\')) { k += 1; continue; }          // "\ No newline at end of file"
    if (line.startsWith('+')) { out.push(line.slice(1)); k += 1; }
    else if (line.startsWith('-')) { cursor += 1; k += 1; }
    else if (line.startsWith(' ')) { out.push(base[cursor++]); k += 1; }
    else { reachedNextHunk = true; break; }                   // 空行 = hunk 结束
  }
  if (!reachedNextHunk) break;
}
while (cursor < base.length) out.push(base[cursor++]);

fs.writeFileSync(outFile, out.join('\n'), 'utf8');
const sha = crypto.createHash('sha256').update(fs.readFileSync(outFile)).digest('hex');
console.log(`recovered sha256 = ${sha}`);
console.log('expected  sha256 = 4cae2fb2ab2599997668feca8c26c3161fe882a518e61d01552b7adc95f95756');
if (sha !== '4cae2fb2ab2599997668feca8c26c3161fe882a518e61d01552b7adc95f95756') {
  console.error('✗ 复原结果与期望 sha256 不相等 —— 不要使用这份复原件');
  process.exit(4);
}
console.log('✓ 与修复前的那一版逐字节相同');
