#!/usr/bin/env node
/**
 * T20（round 4 复审）· **独立** scratch 装置（不复用 t19 的 _scratch/r3-b760.cjs）。
 *
 * 从 dist 造三份副本（只读 dist；只写 review/t20/scratch/**）：
 *   clean/    逐字节拷贝 —— 对照组，期望整轮 EXIT=0。
 *   grid760/  每一页的冻结 `.snote` 规则之后追加
 *               @media (max-width: 760px) { .snote { display: grid; grid-template-columns: minmax(0, 70ch) 1fr; } }
 *             这就是 F-R2-1 的 70ch 窄轨缺陷、但只在 ≤760 生效（桌面档物理上看不见）。
 *   contents/ 每一页追加 .snote { display: contents; }（无盒形态）—— R3-3 的假红面 A/B 用。
 *
 * 与 t19 的差别（独立性）：注入**全站每一页**（t19 只改 changes/ 一页），并逐页校验
 * 「冻结串恰好 1 次」这一前提，避免把单页巧合当成全站结论。
 *
 * 用法：node mk-scratch.cjs
 */
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../../../../..');
const T20 = path.join(ROOT, 'research', '_raw', 'secondary-page-layout-unification', 'review', 't20');
const DIST = path.join(ROOT, 'dist');
const SCRATCH = path.join(T20, 'scratch');
fs.mkdirSync(path.join(T20, 'runs'), { recursive: true });
fs.mkdirSync(SCRATCH, { recursive: true });

// 与 verify-site.js 的 WIDE_SNOTE_FROZEN 逐字一致（只用于定位注入点；不从被测文件读，避免自证）
const FROZEN = '.snote { color: var(--mut); font-size: var(--fs-sm); line-height: 1.7; margin: 0 0 var(--s3); max-width: none; overflow-wrap: anywhere; }';
const INJECT_GRID760 = `${FROZEN}\n    @media (max-width: 760px) { .snote { display: grid; grid-template-columns: minmax(0, 70ch) 1fr; } }`;
const INJECT_CONTENTS = `${FROZEN}\n    .snote { display: contents; }`;

const sha16 = buf => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
const walk = (dir, out = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out); else out.push(full);
  }
  return out;
};
const manifest = dir => walk(dir).sort().map(f => `${path.relative(dir, f).split(path.sep).join('/')} ${sha16(fs.readFileSync(f))}`);

const before = manifest(DIST);
console.log(`dist 清单：${before.length} 个文件`);

const pages = walk(DIST).filter(f => f.toLowerCase().endsWith('.html'));
console.log(`HTML 页：${pages.length} 个`);

const stats = { grid760: { hit: 0, skipped: [] }, contents: { hit: 0, skipped: [] } };
const build = (name, inject) => {
  const out = path.join(SCRATCH, name);
  fs.rmSync(out, { recursive: true, force: true });
  fs.cpSync(DIST, out, { recursive: true });
  let hit = 0;
  for (const page of pages) {
    const rel = path.relative(DIST, page);
    const buf = fs.readFileSync(page, 'utf8');
    const count = buf.split(FROZEN).length - 1;
    if (count !== 1) { stats[name].skipped.push(`${rel} (frozen×${count})`); continue; }
    const next = buf.replace(FROZEN, inject);
    fs.writeFileSync(path.join(out, rel), next, 'utf8');
    hit += 1;
  }
  stats[name].hit = hit;
  console.log(`① ${name}/：拷贝 ${walk(out).length} 文件 · 注入 ${hit} 页 · 跳过 ${stats[name].skipped.length} 页`);
};

fs.rmSync(path.join(SCRATCH, 'clean'), { recursive: true, force: true });
fs.cpSync(DIST, path.join(SCRATCH, 'clean'), { recursive: true });
build('grid760', INJECT_GRID760);
build('contents', INJECT_CONTENTS);

// 对照：clean 必须与 dist 逐字节相同
const cleanManifest = manifest(path.join(SCRATCH, 'clean'));
const same = cleanManifest.length === before.length && cleanManifest.every((row, i) => row === before[i]);
console.log(`② clean/ 与 dist 逐字节相同：${same ? '是' : '否 ❌'}`);

// 注入后的媒体查询只落在 ≤760：核一下注入文本确实带 max-width: 760px
const sample = fs.readFileSync(path.join(SCRATCH, 'grid760', 'changes', 'index.html'), 'utf8');
console.log(`③ grid760/changes/index.html 含媒体查询：${sample.includes('@media (max-width: 760px) { .snote { display: grid;') ? '是' : '否 ❌'}`);
console.log(`④ grid760 冻结串仍每页 1 次（前提校验）：跳过 ${stats.grid760.skipped.length} 页`);

const after = manifest(DIST);
const distUntouched = before.length === after.length && before.every((row, i) => row === after[i]);
console.log(`⑤ dist 未被触碰（全树 ${after.length} 文件 sha16 清单跑前跑后相同）：${distUntouched ? '是' : '否 ❌'}`);

fs.writeFileSync(path.join(T20, 'runs', 'mk-scratch.json'), JSON.stringify({
  distFiles: before.length, htmlPages: pages.length, stats, cleanByteIdentical: same, distUntouched, distManifestShared: before.slice(0, 5)
}, null, 2));
process.exit(same && distUntouched ? 0 : 1);
