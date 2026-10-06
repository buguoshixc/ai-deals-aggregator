#!/usr/bin/env node
/**
 * T29 · 静态不变量与「无像素判定」核对（不跑浏览器）：
 *   §22b 区间逐字节 · check() 字面量多重集（pre-t28 vs 改后）· 0.85 / lineCount>=2 / ch70 / inkRule
 *   新增判据的 API 面（只用盒量/render 状态/字形盒 ⇒ 不含颜色/像素采样）
 * 输入：teeth/_backup/verify-site.pre-t28.bak × scripts/tools/verify-site.js
 * 用法：node static-invariants.cjs
 */
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../../../../..');
const T29 = path.join(ROOT, 'research', '_raw', 'secondary-page-layout-unification', 'review', 't29');
const T = path.join(ROOT, 'scripts', 'tools', 'verify-site.js');
const B = path.join(ROOT, 'research', '_raw', 'secondary-page-layout-unification', 'teeth', '_backup', 'verify-site.pre-t28.bak');
const srcT = fs.readFileSync(T, 'utf8');
const srcB = fs.readFileSync(B, 'utf8');
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const out = {};

// 1) §22b 逐字节
const slice = (src, a, b) => {
  const i = src.indexOf(a), j = src.indexOf(b);
  if (i < 0 || j <= i) throw new Error('marker 位置异常: ' + a);
  return src.slice(i, j);
};
const b22bT = slice(srcT, '/* §22b', '/* §22c');
const b22bB = slice(srcB, '/* §22b', '/* §22c');
out.section22b = { targetBytes: Buffer.byteLength(b22bT), backupBytes: Buffer.byteLength(b22bB), sha16Target: sha(b22bT).slice(0, 16), sha16Backup: sha(b22bB).slice(0, 16), byteIdentical: b22bT === b22bB };

// 2) check() 字面量多重集
const literals = src => {
  const re = /check\(\s*(`(?:[^`\\]|\\.)*`|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/g;
  const rows = []; let m;
  while ((m = re.exec(src))) rows.push(m[1]);
  return rows;
};
const litT = literals(srcT), litB = literals(srcB);
const cnt = a => { const m = new Map(); for (const x of a) m.set(x, (m.get(x) || 0) + 1); return m; };
const cT = cnt(litT), cB = cnt(litB);
const removed = [], added = [];
for (const [k, v] of cB) { const d = v - (cT.get(k) || 0); for (let i = 0; i < d; i++) removed.push(k); }
for (const [k, v] of cT) { const d = v - (cB.get(k) || 0); for (let i = 0; i < d; i++) added.push(k); }
out.checks = { targetLiterals: litT.length, backupLiterals: litB.length, removed, added };

// 3) 关键判据字面量
const occ = (s, n) => s.split(n).length - 1;
const lines = (s, re) => s.split('\n').filter(l => re.test(l));
out.tokens = {
  ratio: { target: lines(srcT, /WIDE_NOTE_RATIO\s*=/), backup: lines(srcB, /WIDE_NOTE_RATIO\s*=/) },
  lineGate: { target: lines(srcT, /note\.lineCount >= 2/), backup: lines(srcB, /note\.lineCount >= 2/) },
  inkRule: { target: occ(srcT, 'meta.inkRule'), backup: occ(srcB, 'meta.inkRule') },
  ch70: { target: occ(srcT, 'ch70'), backup: occ(srcB, 'ch70') },
  noteUnrendered: { target: occ(srcT, 'note-unrendered'), backup: occ(srcB, 'note-unrendered') },
  noscriptSubtree: { target: occ(srcT, 'noscriptSubtree'), backup: occ(srcB, 'noscriptSubtree') }
};

// 4) 无像素判定：新增行的 API 面 + 全文件禁止的像素 API
const diffLines = [];
{
  const a = srcB.split('\n'), b = srcT.split('\n');
  // 简化：找 t24 新增块（note-unrendered 判据 / 上界断言 / M13 / rawTextOf），检查其中出现的 DOM API
}
const PIXEL_RE = /getImageData|toDataURL|createImageBitmap|OffscreenCanvas|canvas|screenshot|devicePixelRatio|getComputedStyle\([^)]*\)\.(color|backgroundColor|backgroundImage)|pixel|取样|像素采样(?!：)|Uint8ClampedArray/;
out.pixelApi = {
  wholeFileHits: (srcT.match(PIXEL_RE) || []),
  newBlockHits: null
};
// 新块 = 含 note-unrendered / rawTextOf / expectUnrendered / 上界断言的窗口
const markers = ['const rawTextOf', "push('note-unrendered'", 'wideUnrenderedRows', 'expectUnrendered'];
const windows = markers.map(m => {
  const i = srcT.indexOf(m);
  return i < 0 ? null : srcT.slice(Math.max(0, i - 1200), i + 1800);
}).filter(Boolean);
out.pixelApi.newBlockHits = windows.flatMap(w => w.match(PIXEL_RE) || []);
out.pixelApi.newBlockDomApi = [...new Set(windows.flatMap(w => (w.match(/\b(getBoundingClientRect|clientWidth|clientHeight|offsetHeight|querySelector|createRange|getClientRects|childNodes|nodeType|textContent|getComputedStyle|Boolean)\b/g) || [])))].sort();

// 5) 未渲染判据逐字（目标文件）
out.criterion = {
  noteUnrenderedLine: lines(srcT, /note-unrendered'/).map(l => l.trim()),
  guard: lines(srcT, /!note\.rendered && note\.textLength > 0 && note\.glyphRects === 0/).map(l => l.trim()),
  noscriptFlag: lines(srcT, /noscriptSubtree/).map(l => l.trim()),
  noscriptFlagLiteral: (srcT.match(/noscriptSubtree: Boolean\([^\n]*/) || [])[0] || null,
  noscriptUsesInCriterion: (srcT.match(/[^\n]*!note\.noscriptSubtree[^\n]*/g) || []).map(l => l.trim()),
  noscriptWhitelistScan: (srcT.match(/[^\n]*(whitelist|白名单|route ===|index === 1|plans\/coding)[^\n]*/g) || []).filter(l => /noscript|unrendered/i.test(l)).map(l => l.trim())
};

fs.mkdirSync(path.join(T29, 'runs'), { recursive: true });
fs.writeFileSync(path.join(T29, 'runs', 'static-invariants.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify({ section22b: out.section22b, checks: { target: litT.length, backup: litB.length, removedCount: removed.length, addedCount: added.length }, tokens: out.tokens, pixelApi: out.pixelApi, criterion: out.criterion }, null, 2));
if (removed.length) { console.log('--- removed literals ---'); removed.forEach(r => console.log('  - ' + r.slice(0, 150))); }
if (added.length) { console.log('--- added literals ---'); added.forEach(r => console.log('  + ' + r.slice(0, 150))); }
