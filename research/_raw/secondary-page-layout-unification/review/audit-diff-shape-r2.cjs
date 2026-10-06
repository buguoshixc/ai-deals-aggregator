/**
 * T6 round-2 · 只读：证明 verify-site.js 相对基线**只有纯插入**（0 删除、0 修改），§22b 一行未改。
 *
 * round-2 与 round-1 的差别：插入块的**行号与长度由 git diff 的 hunk 头现算**，不再写死
 * （修复轮把 §22c 从 817 行加到 1106 行）。重建出的文本与 `git show HEAD:…` 逐字节比对。
 */
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..', '..');
const FILE = 'scripts/tools/verify-site.js';
const base = execFileSync('git', ['show', `HEAD:${FILE}`], { cwd: ROOT, maxBuffer: 1 << 28 }).toString('utf8');
const cur = fs.readFileSync(path.join(ROOT, FILE), 'utf8');
const diff = execFileSync('git', ['diff', '-U0', '--', FILE], { cwd: ROOT, maxBuffer: 1 << 28 }).toString('utf8');

const hunks = [];
for (const line of diff.split('\n')) {
  const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
  if (m) hunks.push({ oldStart: Number(m[1]), oldLen: Number(m[2] || 1), newStart: Number(m[3]), newLen: Number(m[4] || 1) });
}
console.log(`git diff 的 hunk：${hunks.map(h => `旧 ${h.oldStart}+${h.oldLen} → 新 ${h.newStart}+${h.newLen}`).join(' · ')}`);
const deletions = diff.split('\n').filter(l => l.startsWith('-') && !l.startsWith('---'));
console.log(`删除行数：${deletions.length}${deletions.length ? ` → ${deletions.slice(0, 3).join(' | ')}` : '（0 删除）'}`);

const c = cur.split('\n');
const sorted = [...hunks].sort((a, b) => b.newStart - a.newStart);
const rebuilt = [...c];
const removedBlocks = [];
for (const h of sorted) {
  if (h.oldLen !== 0) throw new Error(`hunk 不是纯插入：旧 ${h.oldStart}+${h.oldLen}`);
  const start0 = h.newStart - 1;
  const block = rebuilt.slice(start0, start0 + h.newLen);
  removedBlocks.push({ ...h, block });
  rebuilt.splice(start0, h.newLen);
}
console.log(`按 hunk 头删掉 ${removedBlocks.length} 块（共 ${removedBlocks.reduce((s, b) => s + b.newLen, 0)} 行）`);
for (const b of [...removedBlocks].reverse()) {
  console.log(`  块 新 ${b.newStart}..${b.newStart + b.newLen - 1}（${b.newLen} 行）：+ ${b.block[0].trim().slice(0, 90)}`);
}
const baseLines = base.split('\n');
const identical = rebuilt.join('\n') === baseLines.join('\n');
console.log(`\n重建（删掉插入块）后与基线逐字节相同：${identical}`);
console.log(`  基线 sha256 ${crypto.createHash('sha256').update(base).digest('hex')}`);
console.log(`  当前 sha256 ${crypto.createHash('sha256').update(cur).digest('hex')}`);
if (!identical) {
  for (let i = 0; i < Math.max(rebuilt.length, baseLines.length); i += 1) {
    if (rebuilt[i] !== baseLines[i]) {
      console.log(`  首个差异第 ${i + 1} 行：\n    rebuilt: ${JSON.stringify(String(rebuilt[i]).slice(0, 140))}\n    base   : ${JSON.stringify(String(baseLines[i]).slice(0, 140))}`);
      break;
    }
  }
} else {
  console.log('  ⇒ 0 删除 / 0 修改；§22b 与其余所有既有代码一字未动。');
}
const lines = cur.split('\n');
const idx22b = lines.findIndex(l => l.includes('§22b 叶子详情页'));
const idx22c = lines.findIndex(l => l.includes('§22c Wide Data Page'));
const insertionStart = Math.min(...hunks.filter(h => h.newStart > 100).map(h => h.newStart));
console.log(`\n§22b 头在第 ${idx22b + 1} 行；§22c 头在第 ${idx22c + 1} 行；插入块起点 ${insertionStart}`);
console.log(`§22b 区间 ${idx22b + 1}–${insertionStart - 1} 全部早于插入块 ⇒ 从未被触碰。`);
