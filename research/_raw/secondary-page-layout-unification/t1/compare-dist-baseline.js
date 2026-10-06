#!/usr/bin/env node
/**
 * T1 证据脚本：`dist/`（本次构建）vs `dist.baseline/`（只读基线）。
 *
 * 目的：为「**纯布局**版本」提供机器证据 —— 除了 `.snote` 那一条布局规则（外加解释它的注释），
 * 产物不应有任何其它差异（数据 / 文案 / 路由 / 结构化数据必须 0 变化）。
 *
 * 做法：两边都**归一化**——
 *   ① 去掉 CSS 注释 `/* … *​/`（本次新增的说明注释）；
 *   ② 去掉 `.snote` 规则行（`    .snote { … }` / `  .snote { … }` / `.snote.chgwarn { … }`）。
 * 归一化后逐字节比对：相同 ⇒ 差异只可能来自这两类行。
 * 另外单独报出：每个文件被抹掉了几条 `.snote` 规则（新/旧各几条），以及长度差。
 *
 * 只读：两个目录都不写。用法：node compare-dist-baseline.js [newDir] [oldDir]
 *   默认 dist vs dist.baseline；
 *   也可 node compare-dist-baseline.js dist.synth-fixed dist.baseline  （核对 T2 的预测脚手架）
 *   或   node compare-dist-baseline.js dist dist.synth-fixed              （T1 真实产物 vs T2 预测产物）
 */
'use strict';

const fs = require('fs');
const path = require('path');

const NEW = process.argv[2] || 'dist';
const OLD = process.argv[3] || 'dist.baseline';

function inventory(root) {
  const out = new Map();
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.set(full.slice(root.length + 1).split(path.sep).join('/'), fs.readFileSync(full));
    }
  })(root);
  return out;
}

const CSS_COMMENT = /\/\*[\s\S]*?\*\//g;
const SNOTE_RULE = /^[ \t]*\.snote(?:\.[\w-]+)?[ \t]*\{[^}]*\}[ \t]*$/gm;
const countRules = text => (text.match(SNOTE_RULE) || []).length;
// 归一化三步：去 CSS 注释 → 去 .snote 规则行 → 去空白行（去掉上面两步留下的行位移）。
// 第三步是必要的：多行注释被抹掉后会在原地留一个空行，删掉的规则行同理 ——
// 那属于"同一处改动的行位移"，不是第二处差异。空白行不承载任何内容。
const normalize = text => text
  .replace(CSS_COMMENT, '')
  .replace(SNOTE_RULE, '')
  .split('\n')
  .filter(line => line.trim() !== '')
  .join('\n');

const next = inventory(NEW);
const base = inventory(OLD);
const added = [...next.keys()].filter(key => !base.has(key));
const removed = [...base.keys()].filter(key => !next.has(key));
const common = [...next.keys()].filter(key => base.has(key));
const changed = common.filter(key => !next.get(key).equals(base.get(key)));

console.log(`dist files: ${next.size} | dist.baseline files: ${base.size}`);
console.log(`added: ${added.length}${added.length ? ' -> ' + added.slice(0, 10).join(', ') : ''}`);
console.log(`removed: ${removed.length}${removed.length ? ' -> ' + removed.slice(0, 10).join(', ') : ''}`);
console.log(`unchanged (byte-identical): ${common.length - changed.length}`);
console.log(`changed: ${changed.length}`);

const layoutOnly = [];
const other = [];
for (const key of changed) {
  const before = base.get(key).toString('utf8');
  const after = next.get(key).toString('utf8');
  const sameWhenNormalized = normalize(before) === normalize(after);
  const row = {
    key,
    rulesBefore: countRules(before),
    rulesAfter: countRules(after),
    bytes: `${Buffer.byteLength(before)} -> ${Buffer.byteLength(after)}`
  };
  if (sameWhenNormalized) layoutOnly.push(row);
  else {
    const aLines = normalize(before).split('\n');
    const bLines = normalize(after).split('\n');
    const diffs = [];
    for (let i = 0; i < Math.max(aLines.length, bLines.length) && diffs.length < 3; i += 1) {
      if (aLines[i] !== bLines[i]) diffs.push({ line: i + 1, before: aLines[i], after: bLines[i] });
    }
    other.push({ ...row, diffs });
  }
}

console.log(`\n=== 归一化（去 CSS 注释 + 去 .snote 规则）后逐字节相同的文件: ${layoutOnly.length} / ${changed.length} ===`);
console.log(`=== 归一化后仍有差异的文件: ${other.length} ===`);
if (layoutOnly.length) {
  const sample = layoutOnly[0];
  console.log(`sample: ${sample.key} — .snote 规则 ${sample.rulesBefore} -> ${sample.rulesAfter}, bytes ${sample.bytes}`);
  console.log(`all changed files: .snote rules ${Math.min(...layoutOnly.map(r => r.rulesBefore))}..${Math.max(...layoutOnly.map(r => r.rulesBefore))}` +
    ` -> ${Math.min(...layoutOnly.map(r => r.rulesAfter))}..${Math.max(...layoutOnly.map(r => r.rulesAfter))}`);
}
for (const row of other.slice(0, 8)) {
  console.log(`\n--- NORMALIZED-DIFF ${row.key} (bytes ${row.bytes}) ---`);
  for (const diff of row.diffs) {
    console.log(`  L${diff.line}`);
    console.log(`    before: ${String(diff.before).slice(0, 160)}`);
    console.log(`    after : ${String(diff.after).slice(0, 160)}`);
  }
}
const ok = added.length === 0 && removed.length === 0 && other.length === 0 && changed.length > 0;
console.log(ok
  ? 'OK: 产物差异只在「.snote 规则 + 解释注释」范围内 —— 纯布局改动（路由/数据/文案/结构化数据 0 变化）'
  : 'FAIL: 存在 .snote 之外的产物差异（见上）');
process.exit(ok ? 0 : 1);
