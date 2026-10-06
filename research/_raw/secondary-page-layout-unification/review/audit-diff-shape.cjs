/**
 * T6 复审 · 只读：证明 verify-site.js 相对基线**只做了两处纯插入**（0 删除、0 修改）。
 *
 * 做法：把当前文件里的两段新增行删掉，重建出「基线文本」，与 `git show HEAD:…` 逐字节比对。
 * 重建成功 ⇒ §22b 区间（基线 5516–6096 / 当前 5519–6099）零删除零修改。
 */
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..', '..');
const FILE = 'scripts/tools/verify-site.js';
const base = execFileSync('git', ['show', `HEAD:${FILE}`], { cwd: ROOT, maxBuffer: 1 << 28 }).toString('utf8');
const cur = fs.readFileSync(path.join(ROOT, FILE), 'utf8');
const b = base.split('\n');
const c = cur.split('\n');

// 插入块 1：当前 36..38（require + 两行注释）；插入块 2：当前 6100..6916（§22c 整段 + 尾随空行）
const block1 = c.slice(35, 38);
const block2 = c.slice(6099, 6916);
const rebuilt = c.slice(0, 35).concat(c.slice(38, 6099)).concat(c.slice(6916));
const A = rebuilt.join('\n');

console.log(`基线 ${b.length - 1} 行 · 当前 ${c.length - 1} 行 · 差 ${c.length - b.length} 行（= ${block1.length} + ${block2.length}）`);
console.log(`插入块 1（当前 36–38）：`);
block1.forEach(l => console.log(`   + ${l}`));
console.log(`插入块 2（当前 6100–6916，${block2.length} 行）：头 2 行 / 尾 2 行`);
block2.slice(0, 2).forEach(l => console.log(`   + ${l}`));
console.log('   …');
block2.slice(-2).forEach(l => console.log(`   + ${l}`));
console.log(`插入点上下文（当前 6097–6099 = §22b 尾部）：`);
c.slice(6096, 6099).forEach(l => console.log(`     ${l}`));
console.log(`插入点之后（当前 6917–6919 = §23 厂商资料页开头）：`);
c.slice(6916, 6919).forEach(l => console.log(`     ${l}`));
console.log(`\n删掉这两段后与基线逐字节相同：${A === b.join('\n')}`);
console.log(`  基线   sha256 ${crypto.createHash('sha256').update(base).digest('hex')}`);
console.log(`  当前   sha256 ${crypto.createHash('sha256').update(cur).digest('hex')}`);
if (A !== b.join('\n')) {
  for (let i = 0; i < Math.max(rebuilt.length, b.length); i += 1) {
    if (rebuilt[i] !== b[i]) {
      console.log(`  首个差异在第 ${i + 1} 行：\n    rebuilt: ${JSON.stringify(String(rebuilt[i]).slice(0, 140))}\n    base   : ${JSON.stringify(String(b[i]).slice(0, 140))}`);
      break;
    }
  }
} else {
  console.log('  ⇒ 0 删除 / 0 修改；§22b 与其余所有既有代码一字未动。');
}
console.log(`\n§22b 区间：基线 5516–6096（当前 5519–6099），全部落在插入块 1 之后、插入块 2 之前 ⇒ 不可能被改动。`);
