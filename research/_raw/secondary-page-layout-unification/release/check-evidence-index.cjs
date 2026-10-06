#!/usr/bin/env node
/**
 * 证据索引的**存在性核对**（PR 描述里的每一条路径都必须真实存在）。
 *
 * 为什么要有这么一支小脚本：PR 描述里的证据索引是**人写**的，而"路径写错一个字母"这种错误
 * 在评审时几乎看不出来 —— 点开是 404 之前，谁都不知道。所以判据写成机器可跑的：
 * 把 `pr-body.md` 里 `<!-- EVIDENCE-INDEX:BEGIN --> … <!-- EVIDENCE-INDEX:END -->` 之间的
 * **反引号路径**全部抽出来，逐条 `fs.existsSync`；一条都不许缺。
 *
 * 顺带两条范围守卫（防止索引悄悄膨胀成"到处引用"）：
 *   · 每条路径都必须落在 `research/_raw/secondary-page-layout-unification/`（本版证据根）之下；
 *   · 不在索引块里的路径**不检查**（§7「发布后回填」里那几张表本来就还不存在，不能当证据）。
 *
 * 用法（在仓库/工作树根目录跑）：
 *   node research/_raw/secondary-page-layout-unification/release/check-evidence-index.cjs
 *   node …/check-evidence-index.cjs --git          # 再加一条：每条路径**真的会被提交**（没被 .gitignore 吃掉）
 *   node …/check-evidence-index.cjs --file=research/_raw/secondary-page-layout-unification/release/pr-body.md
 *
 * `--git` 存在的理由（2026-10-06 实测踩到）：顶层 `.gitignore` 有一条 `*.log`，而本版证据里有 51 份
 * 逐条读数就是 `.log` —— "文件存在"与"提交之后还存在"是两件事，后者才决定 PR 里的链接点不点得开。
 * 它只跑一条 `git ls-files --others --ignored --exclude-standard -- <paths>`，不改任何东西。
 *
 * 退出码：0 = 全部存在（且 `--git` 下全部会被提交）；1 = 有缺失/被忽略；2 = 读不到文件 / 索引块 / git 不可用。
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = process.cwd();
const argOf = name => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const FILE = argOf('file') || 'research/_raw/secondary-page-layout-unification/release/pr-body.md';
const SCOPE = 'research/_raw/secondary-page-layout-unification/';
const BEGIN = '<!-- EVIDENCE-INDEX:BEGIN -->';
const END = '<!-- EVIDENCE-INDEX:END -->';

const abs = path.resolve(ROOT, FILE);
if (!fs.existsSync(abs)) { console.error(`FAILED: 读不到 ${abs}`); process.exit(2); }
const text = fs.readFileSync(abs, 'utf8');

const begin = text.indexOf(BEGIN);
const end = text.indexOf(END);
if (begin < 0 || end < 0 || end <= begin) {
  console.error(`FAILED: ${FILE} 里找不到成对的 ${BEGIN} … ${END}（没有索引块 ⇒ 无从核对，不静默通过）`);
  process.exit(2);
}
const block = text.slice(begin + BEGIN.length, end);

/** 反引号里的路径（索引块里的引用一律写成 `path`）。 */
const tokens = [...block.matchAll(/`([^`\n]+)`/g)].map(m => m[1].trim());
const paths = [...new Set(tokens.filter(token => /^research\/[\w.\-/*]+$/.test(token)))];
if (!paths.length) { console.error('FAILED: 索引块里一条 research/ 路径都没抽到（判据不该是空跑）'); process.exit(2); }

const outside = paths.filter(p => !p.startsWith(SCOPE));
const missing = [];
const dirs = [];
for (const p of paths) {
  const target = path.resolve(ROOT, p.replace(/\/$/, ''));
  const exists = fs.existsSync(target);
  const isDir = exists && fs.statSync(target).isDirectory();
  if (p.endsWith('/')) dirs.push(`${p} ${exists && isDir ? '✓' : '✗'}`);
  if (!exists || (p.endsWith('/') && !isDir)) missing.push(`${p}${exists ? '（存在但不是目录）' : '（不存在）'}`);
}

console.log(`证据索引核对：${FILE}`);
console.log(`  索引块内路径 ${paths.length} 条（其中目录 ${dirs.length} 条）`);
for (const p of paths) console.log(`    ${missing.some(m => m.startsWith(p)) ? '✗' : '✓'} ${p}`);

if (outside.length) {
  console.error(`\nFAILED: 有 ${outside.length} 条路径不在本版证据根 ${SCOPE} 之下 —— 索引只索引本次交付的证据：`);
  outside.forEach(p => console.error(`   ✗ ${p}`));
  process.exit(1);
}
if (missing.length) {
  console.error(`\nFAILED: ${missing.length} 条路径不存在（PR 描述里的索引必须是可点开的）：`);
  missing.forEach(m => console.error(`   ✗ ${m}`));
  process.exit(1);
}

/** 可选：这些路径**提交之后**还会不会在（被 .gitignore 吃掉的路径现在存在、提交后是死链）。 */
if (process.argv.includes('--git')) {
  const res = spawnSync('git', ['ls-files', '--others', '--ignored', '--exclude-standard', '--', ...paths], { cwd: ROOT, encoding: 'utf8' });
  if (res.error || res.status !== 0) {
    console.error(`\nFAILED: git 预检跑不起来（${res.error ? res.error.message : `exit ${res.status}: ${String(res.stderr).trim()}`}）`
      + ' —— 不静默通过：要么修好 git，要么去掉 --git 并手工核对');
    process.exit(2);
  }
  const ignored = String(res.stdout).split('\n').map(s => s.trim()).filter(Boolean);
  if (ignored.length) {
    console.error(`\nFAILED: ${ignored.length} 条路径被 .gitignore 吃掉 —— 现在存在，提交之后是死链：`);
    ignored.forEach(p => console.error(`   ✗ ${p}`));
    console.error('   处置见 release/checklist.md §3.1（版本目录里的 !-规则按名字放回来，与上一版同一先例）');
    process.exit(1);
  }
  console.log(`   git 预检：${paths.length} 条路径都不会被 .gitignore 吃掉`);
}

console.log(`\n✅ ${paths.length}/${paths.length} 条路径全部存在，且都在 ${SCOPE} 之下`);
