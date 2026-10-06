#!/usr/bin/env node
/**
 * T3 基线同步（AC-31）：把 ours-baseline 两份基线里的 firstScreenFull 从 9 改成 After 实测值。
 *
 * 只允许动这一个字段。脚本用「逐行 before/after 对比」把这件事**证明**出来，而不是嘴上说：
 *   · 替换前断言 `"firstScreenFull": 9` 恰好出现 1 次（出现 0 次或 >1 次就直接失败，不改文件）；
 *   · 替换后逐行比对，变化行必须**只有 1 行**，且该行 before → after 只差这一个数字。
 *
 * 用法：node research/_raw/home-topic-entry-cards-v1/t3-baseline-patch.js [新值=6]
 * 幂等：已经是目标值时报「已同步」并原样退出（不写文件，mtime 不变）。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const TARGET = Number(process.argv[2] || 6);
const FILES = [
  'research/_raw/ours-baseline/verify.json',
  'research/_raw/ours-baseline/verify-pre-fold.json'
];

let failed = false;
for (const rel of FILES) {
  const abs = path.join(ROOT, rel);
  const before = fs.readFileSync(abs, 'utf8');
  const beforeLines = before.split('\n');
  const hitLines = beforeLines.map((l, i) => ({ l, i })).filter(x => /"firstScreenFull":\s*9,/.test(x.l));

  if (hitLines.length === 0 && before.includes(`"firstScreenFull": ${TARGET},`)) {
    console.log(`已同步（无改动）：${rel} — firstScreenFull 已是 ${TARGET}`);
    continue;
  }
  if (hitLines.length !== 1) {
    console.log(`✗ ${rel}：期望 "firstScreenFull": 9 恰好 1 行，实测 ${hitLines.length} 行 —— 拒绝改动`);
    failed = true;
    continue;
  }

  const idx = hitLines[0].i;
  const after = before.replace('"firstScreenFull": 9,', `"firstScreenFull": ${TARGET},`);
  const afterLines = after.split('\n');

  // 逐行比对：变化行必须只有 1 行
  const changed = [];
  const n = Math.max(beforeLines.length, afterLines.length);
  for (let i = 0; i < n; i++) if (beforeLines[i] !== afterLines[i]) changed.push(i);

  const okShape = changed.length === 1 && changed[0] === idx &&
    /"firstScreenFull": 9,/.test(beforeLines[idx]) &&
    new RegExp(`"firstScreenFull": ${TARGET},`).test(afterLines[idx]) &&
    beforeLines.length === afterLines.length;

  if (!okShape) {
    console.log(`✗ ${rel}：改动形状不对（变化行 ${changed.length} 行：[${changed.map(i => i + 1).join(', ')}]）—— 拒绝写盘`);
    failed = true;
    continue;
  }

  fs.writeFileSync(abs, after, 'utf8');
  console.log(`✓ ${rel}`);
  console.log(`   第 ${idx + 1} 行（唯一变化行）：`);
  console.log(`     - ${beforeLines[idx].trim()}`);
  console.log(`     + ${afterLines[idx].trim()}`);
  console.log(`   其余 ${beforeLines.length - 1} 行逐字节未变 · 字符数 ${before.length} → ${after.length}（字节数见 git diff）`);
}
process.exit(failed ? 1 : 0);
