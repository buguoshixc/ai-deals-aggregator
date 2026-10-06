#!/usr/bin/env node
/**
 * T29（round 6 复审）· **独立** scratch 装置（不复用 t28 的 _scratch/r6-empty-noscript.cjs）。
 * 从 dist 造 4 份副本（只读 dist；只写 review/t29/scratch/**）：
 *   clean/            逐字节拷贝（对照组 ⇒ 期望 EXIT=0）
 *   key/              plans/index.html：每个 .snote 开标签后插**空** `<noscript></noscript>` + 追加 `.snote{font-size:0;}`
 *                     —— 这正是 T26 实测能把 t24 的标记级豁免键买通的形状（当时 EXIT=0 / 852 项 0 失败）
 *   key-mixed/        plans/index.html：每个 .snote 内插**非空** `<noscript>§T29 fallback</noscript>`（标记仍在、
 *                     可见正文也在）+ 同一 font-size:0 —— 用来证明判据只认 textLength/glyphRects，不认标记
 *   bare-fs0-plans/   plans/index.html：只注入 font-size:0、**不插**任何 noscript（判据桶的正对照）
 * 逐页校验冻结串恰好 1 次；跑前跑后对 dist 全树 303 文件做 sha16 清单。
 */
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../../../../..');
const T29 = path.join(ROOT, 'research', '_raw', 'secondary-page-layout-unification', 'review', 't29');
const DIST = path.join(ROOT, 'dist');
const SCRATCH = path.join(T29, 'scratch');
fs.mkdirSync(path.join(T29, 'runs'), { recursive: true });
fs.mkdirSync(SCRATCH, { recursive: true });

const FROZEN = '.snote { color: var(--mut); font-size: var(--fs-sm); line-height: 1.7; margin: 0 0 var(--s3); max-width: none; overflow-wrap: anywhere; }';
const FS0 = `${FROZEN}\n    .snote { font-size: 0; }`;

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
const notesOf = h => h.match(/<p class="snote[^>]*>[\s\S]*?<\/p>/g) || [];
console.log(`dist 清单 ${before.length} 文件 · HTML ${walk(DIST).filter(f => f.endsWith('.html')).length} 页`);

const info = {};
const build = (name, mutate) => {
  const out = path.join(SCRATCH, name);
  fs.rmSync(out, { recursive: true, force: true });
  fs.cpSync(DIST, out, { recursive: true });
  const page = path.join(out, 'plans', 'index.html');
  const html = fs.readFileSync(page, 'utf8');
  if (html.split(FROZEN).length - 1 !== 1) { console.error(`✗ ${name}: plans/index.html 冻结串不是 1 次`); process.exit(2); }
  const next = mutate(html);
  fs.writeFileSync(page, next, 'utf8');
  const notes = notesOf(next);
  info[name] = {
    frozenCount: next.split(FROZEN).length - 1,
    notes: notes.length,
    emptyNoscript: notes.filter(n => n.includes('<noscript></noscript>')).length,
    nonEmptyNoscript: notes.filter(n => /<noscript>\s*\S/.test(n)).length,
    fontZero: next.includes('.snote { font-size: 0; }')
  };
  console.log(`① ${name}/：说明 ${info[name].notes} 条 · 空 noscript ${info[name].emptyNoscript} · 非空 noscript ${info[name].nonEmptyNoscript} · fs0 ${info[name].fontZero} · 冻结串 ${info[name].frozenCount}`);
};

fs.rmSync(path.join(SCRATCH, 'clean'), { recursive: true, force: true });
fs.cpSync(DIST, path.join(SCRATCH, 'clean'), { recursive: true });
console.log('① clean/：逐字节拷贝 dist');
build('key', html => html.replace(/(<p class="snote[^>]*>)/g, '$1<noscript></noscript>').replace(FROZEN, FS0));
build('key-mixed', html => html.replace(/(<p class="snote[^>]*>)/g, '$1<noscript>T29 fallback</noscript>').replace(FROZEN, FS0));
build('bare-fs0-plans', html => html.replace(FROZEN, FS0));

const cleanManifest = manifest(path.join(SCRATCH, 'clean'));
const cleanSame = cleanManifest.length === before.length && cleanManifest.every((row, i) => row === before[i]);
const after = manifest(DIST);
const distUntouched = before.length === after.length && before.every((row, i) => row === after[i]);
console.log(`② clean/ 与 dist 逐字节相同：${cleanSame ? '是' : '否 ❌'} · dist 未被触碰：${distUntouched ? '是' : '否 ❌'}`);
fs.writeFileSync(path.join(T29, 'runs', 'mk-scratch.json'), JSON.stringify({ distFiles: before.length, info, cleanByteIdentical: cleanSame, distUntouched }, null, 2));
process.exit(cleanSame && distUntouched ? 0 : 1);
