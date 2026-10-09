#!/usr/bin/env node
'use strict';
/* 队长独立复核 t10：三条反向实验各自在**产物副本**上跑（不动真产物）。
 *
 * 判据走的是仓库自己的 `scripts/tools/check-residue.js --dir=<副本>`，
 * 不是我自己另写一遍 —— 本轮反复强调「判据只有一份」。
 *
 * 用法：node verify-t10.cjs
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const DIST = path.join(ROOT, 'dist');
const WORK = path.join(__dirname, 't10-check');
const CHECK = path.join(ROOT, 'scripts', 'tools', 'check-residue.js');
const GUARD = path.join(ROOT, 'scripts', 'data', 'residue-guard.json');

function copyTree(src, dst) {
  fs.rmSync(dst, { recursive: true, force: true });
  fs.cpSync(src, dst, { recursive: true });
}

function run(dir, label) {
  const r = spawnSync(process.execPath, [CHECK, `--dir=${dir}`], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  const named = out.split('\n').filter((l) => /✗|✖|回到|下限|活字面|页脚/.test(l)).slice(0, 3);
  console.log(`  ${label}: exit=${r.status}`);
  for (const l of named) console.log(`      ${l.trim().slice(0, 150)}`);
  return r.status;
}

const results = [];
fs.mkdirSync(WORK, { recursive: true });

/* ---- 基线：不动任何东西 ---- */
{
  const d = path.join(WORK, 'baseline');
  copyTree(DIST, d);
  results.push(['baseline（未改动副本）', run(d, 'baseline'), 0]);
}

/* ---- T1a：把被删文案写回**共享页脚**（t6 的 F1 现场；修前是绿） ---- */
{
  const d = path.join(WORK, 'f1-shared-footer');
  copyTree(DIST, d);
  const idx = path.join(d, 'index.html');
  const html = fs.readFileSync(idx, 'utf8');
  const marker = '最终以官方页面为准。';
  const at = html.indexOf(marker);
  if (at === -1) throw new Error('共享页脚保留句没找到，实验无法构造');
  fs.writeFileSync(idx, html.slice(0, at) + '价格与条款最终以厂商官方页面为准。' + html.slice(at), 'utf8');
  results.push(['F1 共享页脚注入（应红）', run(d, 'F1'), 1]);
}

/* ---- T6a：把 .dsrc-note 的下限改成 1（下限自守；修前是绿） ---- */
{
  const d = path.join(WORK, 'f6-floor-one');
  copyTree(DIST, d);
  const reg = JSON.parse(fs.readFileSync(GUARD, 'utf8'));
  const saved = fs.readFileSync(GUARD, 'utf8');
  reg.containerFloors = reg.containerFloors.map((c) => (c.class === 'dsrc-note' ? { ...c, floor: 1 } : c));
  fs.writeFileSync(GUARD, JSON.stringify(reg, null, 2), 'utf8');
  try {
    results.push(['F6 下限改 1（应红）', run(d, 'F6'), 1]);
  } finally {
    fs.writeFileSync(GUARD, saved, 'utf8');
  }
}

/* ---- T3a：零宽字符变体注入一份产物页 ---- */
{
  const d = path.join(WORK, 'f3-zero-width');
  copyTree(DIST, d);
  const page = path.join(d, 'plans', 'index.html');
  const html = fs.readFileSync(page, 'utf8');
  const tail = '不替读者判断值不值。';
  const at = html.indexOf(tail);
  if (at === -1) throw new Error('锚点句没找到，实验无法构造');
  fs.writeFileSync(page, html.slice(0, at + 2) + '\u200b' + html.slice(at + 2), 'utf8');
  // 这一条注入的是**保留**文案，不是被删文案 —— 预期**不红**（证明没引入误报）。
  results.push(['F3 零宽字符注保留句（应绿，验误报）', run(d, 'F3-keep'), 0]);
}

/* ---- 汇总 ---- */
console.log('\n=== 独立复核汇总（期望值 vs 实得） ===');
let bad = 0;
for (const [label, got, want] of results) {
  const ok = got === want;
  if (!ok) bad += 1;
  console.log(`  ${ok ? '✅' : '❌'}  ${label}  实得=${got} 期望=${want}`);
}
fs.rmSync(WORK, { recursive: true, force: true });
console.log(bad ? `\n❌ ${bad} 条不符` : '\n✅ 三条独立复核全部符合预期');
process.exit(bad ? 1 : 0);
