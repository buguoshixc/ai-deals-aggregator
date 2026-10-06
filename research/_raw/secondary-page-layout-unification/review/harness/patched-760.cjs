/**
 * T15 · B 项的决定性实验：**在 dist 上把逐行字迹口径开到 760**，数误报。
 *
 * 做法：读 scripts/tools/verify-site.js 的源码，**只在内存里**改一处调用点
 *   `Object.assign({}, meta, { inkRule: false })`（760/360 样本集那一处）
 *   → `{ inkRule: width === 760 }`，然后用 Module._compile 以**原文件路径**编译执行，
 *   让相对 require（../lib/*）照常解析。生产文件一个字节都不写。
 *
 * 锚点找不到 / 出现次数 ≠ 1 ⇒ 判红并退出（不静默跳过）。
 *
 * 用法：node review/harness/patched-760.cjs <jsonOut> [dir=dist]
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');

const OUT = process.argv[2] || 'research/_raw/secondary-page-layout-unification/review/runs/r3-patched-760.json';
const DIR = process.argv[3] || 'dist';
const ROOT = process.cwd();
const SRC = path.resolve(ROOT, 'scripts', 'tools', 'verify-site.js');

let src = fs.readFileSync(SRC, 'utf8');
const ANCHOR = [
  '          // inkRule:false —— 逐行字迹在窄档没有标定：360 档 feeds/#2 在 328px 列里只排成 2 行、',
  '          // 最宽一行 264px（<0.85×328），那是 CJK 断行的正常余量，不是缺陷（实测见 r3-green.log）。',
  '          for (const problem of wideProblems(geometry, Object.assign({}, meta, { inkRule: false }))) {'
].join('\n');
const count = src.split(ANCHOR).length - 1;
if (count !== 1) {
  console.error(`✗ 锚点在 verify-site.js 里出现 ${count} 次（必须恰好 1 次）⇒ 判红，不做任何补丁`);
  process.exit(2);
}
const PATCH = '          for (const problem of wideProblems(geometry, Object.assign({}, meta, { inkRule: width === 760 }))) { /* T15 内存补丁 */';
src = src.replace(ANCHOR, PATCH);
if (!src.includes('inkRule: width === 760')) { console.error('✗ 补丁未生效 ⇒ 判红'); process.exit(2); }
console.log(`补丁生效：760 档 inkRule=true（360 档维持 false）· 生产文件未写（源 sha 由调用方另记）`);

process.argv = [process.argv[0], SRC, `--dir=${DIR}`, `--json=${OUT}`];
const mod = new Module(SRC, null);
mod.filename = SRC;
mod.paths = Module._nodeModulePaths(path.dirname(SRC));
mod._compile(src, SRC);
