#!/usr/bin/env node
/** T29 · 一次性把从 t26 拷来的装置适配到本轮：run-old 守卫（pre-t28 形态）与 probe-render 的 PLAN。 */
'use strict';
const fs = require('fs');
const path = require('path');
const h = __dirname;

// 1) run-old.cjs
{
  const p = path.join(h, 'run-old.cjs');
  let s = fs.readFileSync(p, 'utf8');
  const oldGuard = "if (src.includes('note-unrendered') || src.includes('expectUnrendered')) {";
  const line = s.split('\n').find(l => l.includes(oldGuard));
  if (!line) { console.error('!! run-old 守卫锚点未命中'); process.exit(1); }
  const replacement = [
    "if (!src.includes('note-unrendered')) { console.error('✗ 备份里没有 note-unrendered —— 这不是 t24 之后、t28 之前的形态'); process.exit(2); }",
    "if (src.includes('unrenderedNoText')) { console.error('✗ 备份里已有 t28 的 unrenderedNoText —— 这不是改前版本'); process.exit(2); }",
    "if (!src.includes('&& !note.noscriptSubtree) {')) { console.error('✗ 备份里没有 t24 的标记级豁免守卫 —— 形态意外'); process.exit(2); }"
  ].join('\n');
  s = s.split(line).join(replacement);
  fs.writeFileSync(p, s);
  console.log('run-old.cjs：守卫已适配 pre-t28');
}

// 2) probe-render.cjs 的 PLAN
{
  const p = path.join(h, 'probe-render.cjs');
  let s = fs.readFileSync(p, 'utf8');
  const a = s.indexOf('const PLAN = [');
  const b = s.indexOf('];', a);
  if (a < 0 || b < 0) { console.error('!! probe PLAN 锚点未命中'); process.exit(1); }
  const plan = [
    'const PLAN = [',
    "  { dir: 'scratch/clean', route: 'plans/coding/', width: 1440, css: null },",
    "  { dir: 'scratch/clean', route: 'plans/', width: 1440, css: null },",
    "  { dir: 'scratch/key', route: 'plans/', width: 1440, css: null },",
    "  { dir: 'scratch/key-mixed', route: 'plans/', width: 1440, css: null },",
    "  { dir: 'scratch/bare-fs0-plans', route: 'plans/', width: 1440, css: null },",
    "  { dir: 'scratch/clean', route: 'plans/coding/', width: 1440, css: 'noscript { display: block; }' }",
    ''
  ].join('\n');
  s = s.slice(0, a) + plan + s.slice(b);
  fs.writeFileSync(p, s);
  console.log('probe-render.cjs：PLAN 已换为 t29 副本');
}
