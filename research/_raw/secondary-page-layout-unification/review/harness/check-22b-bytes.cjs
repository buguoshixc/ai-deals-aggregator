/**
 * T15 · 不变量复验（§22b 一行未改）——**纯新增 diff 的机械验证**。
 *
 * 做法：把「当前工作副本」当成「基线 + 若干段插入」，
 *   两指针逐字节对齐；一旦不等，就在基线的下一段 64 字节锚点里找它在当前文件的落点，
 *   记下一段「插入区间」；全部对齐完之后，把插入区间全部删掉，**逐字节比较是否等于基线**。
 *   · 若相等 ⇒ 证明改动是纯新增：基线没有任何一行被改写/删除（§22b 在内），且删掉新增后与基线逐字节相同；
 *   · 锚点找不到（对不齐）⇒ 直接判红并给出原因，绝不静默跳过。
 *
 * 用法：node review/harness/check-22b-bytes.cjs <worktreeRoot> <out.txt>
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(process.argv[2] || '.');
const OUT = process.argv[3];
const REL = 'scripts/tools/verify-site.js';

const now = fs.readFileSync(path.join(ROOT, REL), 'utf8');
const base = execFileSync('git', ['-C', ROOT, 'show', `HEAD:${REL}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

function stripInsertions(nowText, baseText) {
  let i = 0, j = 0;
  const regions = [];
  let guard = 0;
  while (i < baseText.length && j < nowText.length) {
    if (nowText[j] === baseText[i]) { i++; j++; continue; }
    const anchor = baseText.slice(i, i + 64);
    if (anchor.length < 8) return { error: `基线剩余不足 8 字节，无法对齐（i=${i}）` };
    const at = nowText.indexOf(anchor, j);
    if (at < 0) return { error: `基线锚点「${anchor.slice(0, 40)}…」在当前文件里找不到（base i=${i}, now j=${j}）⇒ 不是纯新增，判红` };
    regions.push([j, at]);
    j = at;
    if (++guard > 4000) return { error: '插入区间过多（>4000），疑似不是纯新增' };
  }
  if (i < baseText.length) return { error: `基线还剩 ${baseText.length - i} 字节没有对齐（当前文件提前结束）⇒ 有删除，判红` };
  if (j < nowText.length) regions.push([j, nowText.length]);
  let out = '', prev = 0;
  for (const [s, e] of regions) { out += nowText.slice(prev, s); prev = e; }
  out += nowText.slice(prev);
  return { regions, stripped: out };
}

const lineOf = (text, offset) => text.slice(0, offset).split('\n').length;

const res = stripInsertions(now, base);
if (res.error) { console.error(`✗ ${res.error}`); process.exit(2); }
const same = res.stripped === base;
const out = [];
out.push(`当前 ${REL}：${now.length} 字节 / 基线 ${base.length} 字节`);
out.push(`插入区间 ${res.regions.length} 段：`);
for (const [s, e] of res.regions) {
  const seg = now.slice(s, e);
  out.push(`  · 当前文件第 ${lineOf(now, s)}–${lineOf(now, e) - 1} 行（${e - s} 字节 / ${seg.split('\n').length - 1} 行）首行：${seg.split('\n')[0].slice(0, 90)}`);
}
out.push(`删除全部插入区间后：${res.stripped.length} 字节 · 与基线逐字节相同 = ${same}`);
// 另一条独立口径：git diff --stat（0 deletions ⇔ 基线行一行未改）
let stat = '';
try { stat = execFileSync('git', ['-C', ROOT, 'diff', '--numstat', 'HEAD', '--', REL], { encoding: 'utf8' }).trim(); } catch { stat = '(git diff 失败)'; }
out.push(`git diff --numstat HEAD：${stat || '(无改动)'}  ← 第二列是删除行数，必须是 0`);

const text = out.join('\n');
if (OUT) { fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, text); console.log(`写盘 ${OUT}`); }
console.log(text);
process.exit(same ? 0 : 1);
