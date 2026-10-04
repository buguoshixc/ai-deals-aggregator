#!/usr/bin/env node
/**
 * t29 判据③：**证明 diff 只含注释行**（不改键名、不改逻辑、不改断言强度）。
 *
 * 为什么另写一个小工具而不是看 `git diff`：这两个文件里还压着 t23/t25 的未提交改动，
 * `git diff` 会把三轮改动混在一起；只有"改前快照 ↔ 改后现场"的**逐行比对**才能把
 * 本轮（t29）的增量单独拿出来。所以：跑任务前先 `Copy-Item` 一份快照，改完用本脚本对。
 *
 * 判据：对每一对 (before, after) 做 LCS 逐行 diff，**被删除的每一行与被新增的每一行
 * 都必须是注释行**（trim 后以双斜杠开头、或以块注释的星号形态出现），一行代码都不许动。
 * 打印全部增删行供人工复核。
 *
 * 用法：
 *   node research/_raw/t25/diff-comment-only.cjs <before> <after> [<before2> <after2> ...]
 *   node research/_raw/t25/diff-comment-only.cjs --git-diff=<git diff 输出文件>
 *     （第二种模式直接复核 `git diff` 的每一行 +/- ：本轮那两个文件的工作区改动已被提交，
 *      所以 `git diff` 恰好只含本任务增量 —— 这条判据对"贴出 diff 逐行确认"更直接。）
 */

'use strict';

const fs = require('fs');

const args = process.argv.slice(2);
const gitDiffArg = args.find(arg => arg.startsWith('--git-diff='));
if (!args.length || (!gitDiffArg && args.length % 2 !== 0)) {
  console.error('用法：node research/_raw/t25/diff-comment-only.cjs <before> <after> [<before2> <after2> ...]');
  console.error('      node research/_raw/t25/diff-comment-only.cjs --git-diff=<git diff 输出文件>');
  process.exit(2);
}

/** 读文本：兼容 PowerShell `>` 重定向产出的 UTF-16LE（带 BOM）文件，避免把编码问题当成"没有改动" */
function readText(file) {
  const raw = fs.readFileSync(file);
  return (raw.length >= 2 && raw[0] === 0xFF && raw[1] === 0xFE) ? raw.toString('utf16le') : raw.toString('utf8');
}

/** 注释行：trim 后以 // 开头（行注释）、或以 / 星号 / 星号 / 星号斜杠 形态出现的块注释行 */
function isCommentLine(text) {
  const trimmed = String(text).trim();
  if (!trimmed) return false;
  return trimmed.startsWith('//')
    || trimmed.startsWith('/*')
    || trimmed.startsWith('*')
    || trimmed.endsWith('*/');
}

/** LCS 逐行 diff（返回真正被删除 / 新增的行，带行号） */
function lineDiff(beforeLines, afterLines) {
  const n = beforeLines.length;
  const m = afterLines.length;
  const dp = new Int32Array((n + 1) * (m + 1));
  const at = (i, j) => i * (m + 1) + j;
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[at(i, j)] = beforeLines[i] === afterLines[j]
        ? dp[at(i + 1, j + 1)] + 1
        : Math.max(dp[at(i + 1, j)], dp[at(i, j + 1)]);
    }
  }
  const removed = [];
  const added = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (beforeLines[i] === afterLines[j]) { i += 1; j += 1; continue; }
    if (dp[at(i + 1, j)] >= dp[at(i, j + 1)]) { removed.push({ line: i + 1, text: beforeLines[i] }); i += 1; }
    else { added.push({ line: j + 1, text: afterLines[j] }); j += 1; }
  }
  while (i < n) { removed.push({ line: i + 1, text: beforeLines[i] }); i += 1; }
  while (j < m) { added.push({ line: j + 1, text: afterLines[j] }); j += 1; }
  return { removed, added };
}

let bad = 0;

if (gitDiffArg) {
  const diffFile = gitDiffArg.slice('--git-diff='.length);
  const rows = readText(diffFile).split('\n')
    .filter(line => (line.startsWith('+') && !line.startsWith('+++')) || (line.startsWith('-') && !line.startsWith('---')))
    .map(line => ({ sign: line[0], text: line.slice(1) }));
  const offenders = rows.filter(row => !isCommentLine(row.text));
  console.log(`\n── git diff（${diffFile}）：${rows.length} 行 +/-`);
  for (const row of rows) console.log(`   ${row.sign} ${row.text}`);
  console.log(offenders.length
    ? `   ✗ 有 ${offenders.length} 行不是注释行`
    : '   ✓ git diff 里每一行 +/- 都是注释行（键名 / 白名单 / 读数逻辑 / 断言强度一字未动）');
  bad += offenders.length;
  console.log(`\n=== t29 git diff 逐行判据：${bad ? `${bad} 行不是注释` : '只含注释行'} ===`);
  process.exit(bad ? 1 : 0);
}

for (let pair = 0; pair < args.length; pair += 2) {
  const beforeFile = args[pair];
  const afterFile = args[pair + 1];
  const before = readText(beforeFile).split('\n');
  const after = readText(afterFile).split('\n');
  const { removed, added } = lineDiff(before, after);

  console.log(`\n── ${afterFile}`);
  console.log(`   删除 ${removed.length} 行 / 新增 ${added.length} 行（相对改前快照）`);
  const offenders = [...removed, ...added].filter(row => !isCommentLine(row.text));
  for (const row of removed) console.log(`   - ${row.line}: ${row.text}`);
  for (const row of added) console.log(`   + ${row.line}: ${row.text}`);
  if (offenders.length) {
    bad += offenders.length;
    console.log(`   ✗ 有 ${offenders.length} 行不是注释行（判据③不成立）：`);
    offenders.slice(0, 10).forEach(row => console.log(`      ${row.text}`));
  } else {
    console.log('   ✓ 全部增删行都是注释行（键名 / 逻辑 / 断言强度一字未动）');
  }
}

console.log(`\n=== t29 diff 逐行判据：${bad ? `${bad} 行不是注释` : '只含注释行'} ===`);
process.exit(bad ? 1 : 0);
