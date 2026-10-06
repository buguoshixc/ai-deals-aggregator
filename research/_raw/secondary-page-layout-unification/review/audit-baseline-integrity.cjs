/**
 * T6 复审 · 只读：① dist.baseline 是否仍与 T1 的 sha256 清单逐条一致（证明复审没碰基线）；
 *              ② dist 的树哈希（与造 scratch 之前记录的 c07d48a6… 对齐，证明复审没碰产物）。
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..', '..');

function walk(dir, base, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, base, out);
    else out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const tree = dir => {
  const h = crypto.createHash('sha256');
  for (const rel of walk(dir, dir)) h.update(rel).update('\0').update(fs.readFileSync(path.join(dir, rel)));
  return h.digest('hex');
};

const manifestFile = path.join(ROOT, 'research', '_raw', 'secondary-page-layout-unification', 'baseline', 'dist-baseline-sha256.txt');
const raw = fs.readFileSync(manifestFile, 'utf8').replace(/^\uFEFF/, '');
const DIR = path.join(ROOT, 'dist.baseline');
let checked = 0; const mismatch = []; const missing = [];
for (const line of raw.split('\n')) {
  const trimmed = line.trimEnd();
  if (!trimmed) continue;
  const m = /^([0-9a-f]{64})\s+\*?(.+)$/.exec(trimmed);
  if (!m) { console.log(`（清单里跳过的行）${trimmed.slice(0, 80)}`); continue; }
  const [, hash, name] = m;
  const file = path.join(DIR, name.replace(/\//g, path.sep));
  if (!fs.existsSync(file)) { missing.push(name); continue; }
  checked += 1;
  if (sha(file) !== hash) mismatch.push(name);
}
console.log(`dist.baseline 清单：列出 ${checked + missing.length} 条 · 命中且一致 ${checked - 0} 条 · 不一致 ${mismatch.length} · 缺失 ${missing.length}`);
if (mismatch.length) console.log(`  不一致：${mismatch.slice(0, 5).join(' ')}`);
if (missing.length) console.log(`  缺失：${missing.slice(0, 5).join(' ')}`);
const onDisk = walk(DIR, DIR);
console.log(`  磁盘上实际文件 ${onDisk.length} 个（清单 ${checked + missing.length} + 可能多出 ${Math.max(0, onDisk.length - (checked + missing.length))}）`);
console.log(`  dist.baseline 树哈希：${tree(DIR).slice(0, 24)}…`);
console.log(`  dist          树哈希：${tree(path.join(ROOT, 'dist')).slice(0, 24)}…（造 scratch 前记录的前缀：c07d48a6eee12027）`);
