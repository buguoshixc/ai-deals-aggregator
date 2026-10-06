#!/usr/bin/env node
/**
 * t25 证据 · 「订正后的生成器重跑一遍，truth-401.json 的**数值**会不会变？」
 *
 * 做法：把订正后的 `geometry/make-truth-401.cjs` 用 `--out=` 写到本目录（**不覆盖** geometry/truth-401.json），
 * 再与盘上那份**逐路径深比**，把每一处差异分类：
 *   · NUMBER-DIFF  —— 任何数值不同（必须 0 条）
 *   · STRUCT-DIFF  —— 类型/数组长度/集合成员不同（必须 0 条）
 *   · KEY-ONLY     —— 对象键名集合不同（只允许出现在 invariants 的**说明性键名**上）
 *   · STRING-DIFF  —— 字符串内容不同（允许：`at` 时间戳、`what` / `usageForNewGate` / invariants 的措辞）
 * 用法：node …/geometry/consumer-fix/compare-truth-regen.cjs <旧.json> <新.json> [out.json]
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const [oldFile, newFile, outFile] = process.argv.slice(2);
if (!oldFile || !newFile) { console.error('用法：compare-truth-regen.cjs <旧.json> <新.json> [out.json]'); process.exit(2); }
const A = JSON.parse(fs.readFileSync(oldFile, 'utf8'));
const B = JSON.parse(fs.readFileSync(newFile, 'utf8'));

const diffs = [];
const walk = (a, b, p) => {
  const typeOf = v => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v);
  const ta = typeOf(a); const tb = typeOf(b);
  if (ta !== tb) { diffs.push({ path: p, kind: 'STRUCT-DIFF', detail: `类型 ${ta} → ${tb}` }); return; }
  if (ta === 'number') { if (a !== b) diffs.push({ path: p, kind: 'NUMBER-DIFF', detail: `${a} → ${b}` }); return; }
  if (ta === 'string') { if (a !== b) diffs.push({ path: p, kind: 'STRING-DIFF', detail: `${JSON.stringify(a).slice(0, 90)} → ${JSON.stringify(b).slice(0, 90)}` }); return; }
  if (ta === 'boolean' || ta === 'null') { if (a !== b) diffs.push({ path: p, kind: 'STRUCT-DIFF', detail: `${a} → ${b}` }); return; }
  if (ta === 'array') {
    if (a.length !== b.length) { diffs.push({ path: p, kind: 'STRUCT-DIFF', detail: `长度 ${a.length} → ${b.length}` }); return; }
    for (let i = 0; i < a.length; i += 1) walk(a[i], b[i], `${p}[${i}]`);
    return;
  }
  const ka = Object.keys(a).sort(); const kb = Object.keys(b).sort();
  const onlyA = ka.filter(k => !kb.includes(k)); const onlyB = kb.filter(k => !ka.includes(k));
  if (onlyA.length || onlyB.length) diffs.push({ path: p, kind: 'KEY-ONLY', detail: `只旧有 ${JSON.stringify(onlyA)} · 只新有 ${JSON.stringify(onlyB)}` });
  for (const k of ka.filter(k => kb.includes(k))) walk(a[k], b[k], `${p}.${k}`);
};

walk(A, B, '$');

const byKind = {};
for (const d of diffs) byKind[d.kind] = (byKind[d.kind] || 0) + 1;
const numbersIdentical = !diffs.some(d => d.kind === 'NUMBER-DIFF' || d.kind === 'STRUCT-DIFF');
/** 数值面的定点复核：集合成员、集合大小、每条的 before/after 数值全等 */
const keyOf = r => `${r.route}#${r.index}`;
const setEqual = name => {
  const a = new Set((A.sets[name] || []).map(keyOf)); const b = new Set((B.sets[name] || []).map(keyOf));
  return { size: [a.size, b.size], identical: a.size === b.size && [...a].every(k => b.has(k)) };
};
const numberFields = ['beforeWidth', 'afterWidth', 'ratioAfter'];
const setNumberEqual = name => {
  const a = new Map((A.sets[name] || []).map(r => [keyOf(r), numberFields.map(f => r[f])]));
  const b = new Map((B.sets[name] || []).map(r => [keyOf(r), numberFields.map(f => r[f])]));
  if (a.size !== b.size) return false;
  for (const [k, va] of a) { const vb = b.get(k); if (!vb || JSON.stringify(va) !== JSON.stringify(vb)) return false; }
  return true;
};
const head = {
  at: new Date().toISOString(),
  old: { file: oldFile, sha256: crypto.createHash('sha256').update(fs.readFileSync(oldFile)).digest('hex'), bytes: fs.statSync(oldFile).size },
  new: { file: newFile, sha256: crypto.createHash('sha256').update(fs.readFileSync(newFile)).digest('hex'), bytes: fs.statSync(newFile).size },
  diffCounts: byKind,
  numbersIdentical,
  checks: {
    '没有任何数值差异（NUMBER-DIFF = 0）': (byKind['NUMBER-DIFF'] || 0) === 0,
    '没有类型/长度/成员差异（STRUCT-DIFF = 0）': (byKind['STRUCT-DIFF'] || 0) === 0,
    'totals 逐字段相同（除说明性字符串）': JSON.stringify(A.totals) === JSON.stringify(B.totals),
    'sets 三个集合的键集合逐条相同': ['caughtByOldCriteria', 'onlyNewTruth', 'alreadyFine'].every(n => setEqual(n).identical),
    'sets 逐条的 beforeWidth/afterWidth/ratioAfter 相同': ['caughtByOldCriteria', 'onlyNewTruth', 'alreadyFine'].every(setNumberEqual),
    'pages 条数相同': A.pages.length === B.pages.length,
    'pages 里每条说明的 before/after 数值相同': (() => {
      const flat = doc => new Map(doc.pages.flatMap(pg => pg.notes.map(n => [`${pg.route}#${n.index}`, [n.before && n.before.width, n.after && n.after.width, n.before && n.before.ratioToColumn, n.after && n.after.ratioToColumn, n.classification === undefined ? null : pg.route]])));
      const fa = flat(A); const fb = flat(B);
      if (fa.size !== fb.size) return false;
      for (const [k, va] of fa) if (JSON.stringify(va) !== JSON.stringify(fb.get(k))) return false;
      return true;
    })(),
    'invariants 的布尔值全等（只允许键名措辞变化）': JSON.stringify(Object.values(A.invariants).filter(v => typeof v === 'boolean')) === JSON.stringify(Object.values(B.invariants).filter(v => typeof v === 'boolean'))
  },
  keyOnlyDiffs: diffs.filter(d => d.kind === 'KEY-ONLY'),
  stringDiffs: diffs.filter(d => d.kind === 'STRING-DIFF'),
  numberOrStructDiffs: diffs.filter(d => d.kind === 'NUMBER-DIFF' || d.kind === 'STRUCT-DIFF')
};

console.log(`旧 ${head.old.file} sha256 ${head.old.sha256.slice(0, 16)}… (${head.old.bytes} B)`);
console.log(`新 ${head.new.file} sha256 ${head.new.sha256.slice(0, 16)}… (${head.new.bytes} B)`);
console.log(`差异分类：${JSON.stringify(byKind)}`);
console.log('数值面定点复核：');
for (const [name, ok] of Object.entries(head.checks)) console.log(`  ${ok ? '✅' : '❌'} ${name}`);
console.log(`KEY-ONLY ${head.keyOnlyDiffs.length} 处（应只在 invariants 说明性键名）：`);
for (const d of head.keyOnlyDiffs) console.log(`  · ${d.path} — ${d.detail}`);
console.log(`STRING-DIFF ${head.stringDiffs.length} 处（应只是 at / 措辞）：`);
for (const d of head.stringDiffs.slice(0, 12)) console.log(`  · ${d.path} — ${d.detail}`);
if (head.numberOrStructDiffs.length) {
  console.log(`❌ 数值/结构差异 ${head.numberOrStructDiffs.length} 处：`);
  for (const d of head.numberOrStructDiffs.slice(0, 30)) console.log(`  · ${d.path} — ${d.kind} ${d.detail}`);
}
const bad = !numbersIdentical || Object.values(head.checks).some(v => v === false);
if (outFile) fs.writeFileSync(outFile, `${JSON.stringify(head, null, 2)}\n`, 'utf8');
process.exit(bad ? 1 : 0);
