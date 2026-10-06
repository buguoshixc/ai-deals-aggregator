#!/usr/bin/env node
/**
 * T26（round 5 复审）· **独立** scratch 装置（不复用 t24 的 _scratch/r5-bare-fontsize0.cjs）。
 * 从 dist 造 5 份副本（只读 dist；只写 review/t26/scratch/**）：
 *   clean/            逐字节拷贝（对照组，期望 EXIT=0）
 *   bare-fs0/         全站 186 页：冻结 .snote 规则后追加 `.snote { font-size: 0; }`（T22-F1 原始形态）
 *   bare-fs0-plans/   只改 plans/index.html 的同一注入（定点：其余页保持原样，M 牙不受影响）
 *   noscript-key/     plans/index.html：每个 .snote 元素内插入 **空** <noscript></noscript> + 同一 font-size:0
 *                     —— 「排除规则能不能被反用成免判键」的反击实验
 *   noscript-visible/ plans/index.html：font-size:0 + `noscript { display: block }`（「让 noscript 可见」）
 * 逐页校验冻结串恰好 1 次；跑前跑后对 dist 全树 303 文件做 sha16 清单。
 */
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../../../../..');
const T26 = path.join(ROOT, 'research', '_raw', 'secondary-page-layout-unification', 'review', 't26');
const DIST = path.join(ROOT, 'dist');
const SCRATCH = path.join(T26, 'scratch');
fs.mkdirSync(path.join(T26, 'runs'), { recursive: true });
fs.mkdirSync(SCRATCH, { recursive: true });

const FROZEN = '.snote { color: var(--mut); font-size: var(--fs-sm); line-height: 1.7; margin: 0 0 var(--s3); max-width: none; overflow-wrap: anywhere; }';
const FS0 = `${FROZEN}\n    .snote { font-size: 0; }`;
const FS0_NOSCRIPT_VISIBLE = `${FROZEN}\n    .snote { font-size: 0; }\n    noscript { display: block; }`;

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
console.log(`dist 清单 ${before.length} 文件 · HTML ${(walk(DIST).filter(f => f.endsWith('.html'))).length} 页`);

const notes = h => h.match(/<p class="snote[^>]*>[\s\S]*?<\/p>/g) || [];
const info = {};

const build = (name, mutatePage) => {
  const out = path.join(SCRATCH, name);
  fs.rmSync(out, { recursive: true, force: true });
  fs.cpSync(DIST, out, { recursive: true });
  let pages = 0, notesTouched = 0;
  for (const file of walk(out).filter(f => f.endsWith('.html'))) {
    const html = fs.readFileSync(file, 'utf8');
    if (html.split(FROZEN).length - 1 !== 1) continue;   // 无冻结串的页（archive 等）跳过
    const next = mutatePage(html, file);
    if (next === null) continue;
    fs.writeFileSync(file, next, 'utf8');
    pages += 1;
    if (name.includes('noscript')) notesTouched += notes(next).filter(n => n.includes('<noscript></noscript>')).length;
  }
  info[name] = { pages, notesTouched };
  console.log(`① ${name}/：注入 ${pages} 页${notesTouched ? ` · 插入空 <noscript> 的说明 ${notesTouched} 条` : ''}`);
};

fs.rmSync(path.join(SCRATCH, 'clean'), { recursive: true, force: true });
fs.cpSync(DIST, path.join(SCRATCH, 'clean'), { recursive: true });
console.log('① clean/：逐字节拷贝 dist');
build('bare-fs0', html => html.replace(FROZEN, FS0));
build('bare-fs0-plans', (html, file) => (path.relative(SCRATCH, file).split(path.sep).join('/') === 'bare-fs0-plans/plans/index.html' ? html.replace(FROZEN, FS0) : null));
build('noscript-key', (html, file) => {
  if (path.relative(SCRATCH, file).split(path.sep).join('/') !== 'noscript-key/plans/index.html') return null;
  // 每个 .snote 开标签后插一个空 noscript（DOM 语义：noscriptSubtree=true），再加 font-size:0
  const injected = html.replace(/(<p class="snote[^>]*>)/g, '$1<noscript></noscript>');
  return injected.replace(FROZEN, FS0);
});
build('noscript-visible', (html, file) => (path.relative(SCRATCH, file).split(path.sep).join('/') === 'noscript-visible/plans/index.html' ? html.replace(FROZEN, FS0_NOSCRIPT_VISIBLE) : null));

const cleanManifest = manifest(path.join(SCRATCH, 'clean'));
const cleanSame = cleanManifest.length === before.length && cleanManifest.every((row, i) => row === before[i]);
const after = manifest(DIST);
const distUntouched = before.length === after.length && before.every((row, i) => row === after[i]);
console.log(`② clean/ 与 dist 逐字节相同：${cleanSame ? '是' : '否 ❌'} · dist 未被触碰：${distUntouched ? '是' : '否 ❌'}`);
const probePlan = fs.readFileSync(path.join(SCRATCH, 'bare-fs0-plans', 'plans', 'index.html'), 'utf8');
console.log(`③ bare-fs0-plans/ 冻结串仍 ${probePlan.split(FROZEN).length - 1} 次 · 含 font-size:0：${probePlan.includes('.snote { font-size: 0; }')}`);
fs.writeFileSync(path.join(T26, 'runs', 'mk-scratch.json'), JSON.stringify({ distFiles: before.length, info, cleanByteIdentical: cleanSame, distUntouched }, null, 2));
process.exit(cleanSame && distUntouched ? 0 : 1);
