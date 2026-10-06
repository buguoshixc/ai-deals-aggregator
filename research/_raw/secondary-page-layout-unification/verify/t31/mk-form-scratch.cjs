#!/usr/bin/env node
/**
 * T31 · 造「形态注入」scratch：把 §J③ 的 `writing-mode-vertical-fullwidth` 形态注入一份 dist 副本，
 * 供门禁（轮 6 冻结版）自己对这个形态出码。**只写 verify/scratch/**，dist 只读。**
 *
 * 形态（逐字取 adversary `coverage-asymmetry-writing-mode.json` 的 form.injection）：
 *   .snote { writing-mode: vertical-rl; width: 100%; height: 5.6rem; overflow: hidden; }
 * 注入点：`category/agent/index.html` 共享 <style> 里**冻结串规则之后**（与 adversary 的 injectionSite 同）。
 *
 * 用法：node research/_raw/secondary-page-layout-unification/verify/t31/mk-form-scratch.cjs
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = (() => {
  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error('找不到仓库根');
})();

const SRC = path.join(ROOT, 'dist');
const DST = path.join(ROOT, 'research/_raw/secondary-page-layout-unification/verify/scratch/t31-form');
const OUT = path.join(ROOT, 'research/_raw/secondary-page-layout-unification/verify/t31/scratch-form.json');
const TARGET = 'category/agent/index.html';
const FORM_CSS = '.snote { writing-mode: vertical-rl; width: 100%; height: 5.6rem; overflow: hidden; }';
const FROZEN = '.snote { color: var(--mut); font-size: var(--fs-sm); line-height: 1.7; margin: 0 0 var(--s3); max-width: none; overflow-wrap: anywhere; }';

const sha256 = abs => crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
const sha256text = text => crypto.createHash('sha256').update(text, 'utf8').digest('hex');

function manifest(dir) {
  const out = new Map();
  const walk = current => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.set(path.relative(dir, full).split(path.sep).join('/'), sha256(full));
    }
  };
  walk(dir);
  return out;
}

function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) copyTree(src, dst);
    else fs.copyFileSync(src, dst);
  }
}

const before = manifest(SRC);
const targetSrc = path.join(SRC, TARGET);
const original = fs.readFileSync(targetSrc, 'utf8');
const frozenCountBefore = original.split(FROZEN).length - 1;

fs.rmSync(DST, { recursive: true, force: true });
copyTree(SRC, DST);

const injected = original.replace(FROZEN, `${FROZEN}\n${FORM_CSS}`);
const frozenCountAfter = injected.split(FROZEN).length - 1;
fs.writeFileSync(path.join(DST, TARGET), injected, 'utf8');

const after = manifest(SRC);
const changedInSrc = [...before.entries()].filter(([rel, hash]) => after.get(rel) !== hash).map(([rel]) => rel);
const scratch = manifest(DST);
const differ = [...before.entries()]
  .filter(([rel, hash]) => scratch.get(rel) !== hash)
  .map(([rel]) => rel);

const report = {
  task: 'T31',
  what: '形态注入副本（供门禁自己出码）',
  createdAt: new Date().toISOString(),
  src: 'dist',
  dst: path.relative(ROOT, DST).split(path.sep).join('/'),
  route: TARGET,
  form: FORM_CSS,
  injectionSite: '冻结串规则之后（原串保留，新增一行 85 B）',
  frozenCountBefore,
  frozenCountAfter,
  bytesAdded: Buffer.byteLength(injected, 'utf8') - Buffer.byteLength(original, 'utf8'),
  sha256Before: sha256text(original),
  sha256After: sha256text(injected),
  srcFiles: before.size,
  scratchFiles: scratch.size,
  changedInSrc,
  filesDifferingFromSrc: differ,
  onlyTargetChanged: differ.length === 1 && differ[0] === TARGET,
  distUntouched: changedInSrc.length === 0,
  identicalAsideFromTarget: [...before.keys()].filter(rel => scratch.get(rel) === before.get(rel)).length
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`scratch: ${report.dst} · 文件 ${report.scratchFiles} · 与 dist 不同 ${differ.length} 个（${differ.join(', ')}）`);
console.log(`冻结串 ${frozenCountBefore} → ${frozenCountAfter} · 目标页 +${report.bytesAdded} B · dist 本轮被写 ${changedInSrc.length} 个`);
console.log(`→ ${path.relative(ROOT, OUT).split(path.sep).join('/')}`);
process.exit(report.onlyTargetChanged && report.distUntouched && frozenCountAfter === 1 ? 0 : 1);
