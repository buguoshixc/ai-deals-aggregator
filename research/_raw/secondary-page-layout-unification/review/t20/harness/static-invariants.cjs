#!/usr/bin/env node
/**
 * T20 · 静态不变量核对（不跑浏览器）：
 *   §22b 区间逐字节对比 · 全文件 check() 断言字面量多重集对比 · 0.85 / lineCount>=2 / inkRule / ch70 计数
 * 输入：teeth/_backup/verify-site.pre-t19.bak（改前）× scripts/tools/verify-site.js（改后）
 * 用法：node static-invariants.cjs
 */
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../../../../..');
const T20 = path.join(ROOT, 'research', '_raw', 'secondary-page-layout-unification', 'review', 't20');
const T = path.join(ROOT, 'scripts', 'tools', 'verify-site.js');
const B = path.join(ROOT, 'research', '_raw', 'secondary-page-layout-unification', 'teeth', '_backup', 'verify-site.pre-t19.bak');

const srcT = fs.readFileSync(T, 'utf8');
const srcB = fs.readFileSync(B, 'utf8');
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const out = {};

// ---- 1) §22b 区间逐字节 ----
const slice = (src, startMark, endMark) => {
  const a = src.indexOf(startMark);
  const b = src.indexOf(endMark);
  if (a < 0 || b < 0 || b <= a) throw new Error(`marker 不在预期位置: ${startMark}`);
  return src.slice(a, b);
};
const b22bT = slice(srcT, '/* §22b', '/* §22c');
const b22bB = slice(srcB, '/* §22b', '/* §22c');
out.section22b = {
  targetBytes: Buffer.byteLength(b22bT), backupBytes: Buffer.byteLength(b22bB),
  sha256Target: sha(b22bT).slice(0, 16), sha256Backup: sha(b22bB).slice(0, 16),
  byteIdentical: b22bT === b22bB,
  targetLines: b22bT.split('\n').length
};

// ---- 2) check() 断言字面量多重集 ----
const literals = src => {
  const re = /check\(\s*(`(?:[^`\\]|\\.)*`|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/g;
  const rows = [];
  let m;
  while ((m = re.exec(src))) rows.push(m[1]);
  return rows;
};
const litT = literals(srcT);
const litB = literals(srcB);
const count = arr => {
  const map = new Map();
  for (const row of arr) map.set(row, (map.get(row) || 0) + 1);
  return map;
};
const cT = count(litT), cB = count(litB);
const removed = [], added = [];
for (const [k, v] of cB) { const n = cT.get(k) || 0; for (let i = 0; i < v - n; i++) removed.push(k); }
for (const [k, v] of cT) { const n = cB.get(k) || 0; for (let i = 0; i < v - n; i++) added.push(k); }
out.checks = {
  targetLiterals: litT.length, backupLiterals: litB.length,
  removedCount: removed.length, addedCount: added.length,
  removed, added
};

// ---- 3) 关键字面量计数 ----
const occurrences = (src, needle) => src.split(needle).length - 1;
const linesMatching = (src, re) => src.split('\n').filter(l => re.test(l)).length;
out.tokens = {
  '0.85 / WIDE_NOTE_RATIO 定义行': {
    target: linesMatching(srcT, /WIDE_NOTE_RATIO\s*=/), backup: linesMatching(srcB, /WIDE_NOTE_RATIO\s*=/),
    targetLiteral: occurrences(srcT, '0.85'), backupLiteral: occurrences(srcB, '0.85')
  },
  'lineCount >= 2 判据行': {
    target: linesMatching(srcT, /note\.lineCount >= 2/), backup: linesMatching(srcB, /note\.lineCount >= 2/)
  },
  'inkRule 出现': { target: occurrences(srcT, 'inkRule'), backup: occurrences(srcB, 'inkRule') },
  'inkRule 调用点（meta.inkRule）': { target: occurrences(srcT, 'meta.inkRule'), backup: occurrences(srcB, 'meta.inkRule') },
  'ch70 出现': { target: occurrences(srcT, 'ch70'), backup: occurrences(srcB, 'ch70') },
  'rendered 前置（boxed = note.rendered）': { target: occurrences(srcT, 'boxed = note.rendered'), backup: occurrences(srcB, 'boxed = note.rendered') }
};

// ---- 4) 判据式逐字对比（① / ② / 同轴 / 裁切 / 隐藏字） ----
const grepLine = (src, re) => src.split('\n').map((l, i) => `${i + 1}: ${l.trim()}`).filter(l => re.test(l));
out.criteriaLines = {
  narrowOld: { target: grepLine(srcT, /note\.textWidth < threshold/), backup: grepLine(srcB, /note\.textWidth < threshold/) },
  inkNew: { target: grepLine(srcT, /note-ink-narrow'/), backup: grepLine(srcB, /note-ink-narrow'/) },
  hiddenText: { target: grepLine(srcT, /note-hidden-text'/), backup: grepLine(srcB, /note-hidden-text'/) }
};

fs.mkdirSync(path.join(T20, 'runs'), { recursive: true });
fs.writeFileSync(path.join(T20, 'runs', 'static-invariants.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify({ section22b: out.section22b, checks: { target: litT.length, backup: litB.length, removed: removed.length, added: added.length }, tokens: out.tokens }, null, 2));
if (removed.length) { console.log('--- removed literals ---'); removed.forEach(r => console.log('  ' + r.slice(0, 160))); }
if (added.length) { console.log('--- added literals ---'); added.forEach(r => console.log('  ' + r.slice(0, 160))); }
