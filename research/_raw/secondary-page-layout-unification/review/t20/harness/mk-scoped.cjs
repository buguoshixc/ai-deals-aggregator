#!/usr/bin/env node
/**
 * T20 · R3-1 定点复现装置：**只**把 grid 规则注入 changes/index.html（与 t19 的 scoped 形状等价，
 * 但代码是复审方自己写的），得到 scratch/grid760-changes —— 这一页的说明正文是**直接文本节点**
 * （无承载子块）⇒ 旧口径 ① 看不见，正是 R3-1 的假绿形状。
 * 用法：node mk-scoped.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../../../../../..');
const T20 = path.join(ROOT, 'research', '_raw', 'secondary-page-layout-unification', 'review', 't20');
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(T20, 'scratch', 'grid760-changes');
const FROZEN = '.snote { color: var(--mut); font-size: var(--fs-sm); line-height: 1.7; margin: 0 0 var(--s3); max-width: none; overflow-wrap: anywhere; }';
const INJECT = `${FROZEN}\n    @media (max-width: 760px) { .snote { display: grid; grid-template-columns: minmax(0, 70ch) 1fr; } }`;

fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(DIST, OUT, { recursive: true });
const page = path.join(OUT, 'changes', 'index.html');
const html = fs.readFileSync(page, 'utf8');
const n = html.split(FROZEN).length - 1;
if (n !== 1) { console.error(`✗ changes/index.html 冻结串出现 ${n} 次（必须 1）`); process.exit(2); }
fs.writeFileSync(page, html.replace(FROZEN, INJECT), 'utf8');
// 其余页面必须与 dist 逐字节相同
let diff = 0;
for (const rel of ['index.html', 'category/index.html', 'feeds/index.html', 'student/index.html', 'vendor/index.html']) {
  const a = fs.readFileSync(path.join(DIST, rel));
  const b = fs.readFileSync(path.join(OUT, rel));
  if (!a.equals(b)) { diff += 1; console.error(`✗ ${rel} 被意外改动`); }
}
console.log(`① scratch/grid760-changes：仅注入 changes/index.html（冻结串仍 1 次）· 抽查 ${5 - diff}/5 页与 dist 逐字节相同`);
process.exit(diff ? 1 : 0);
