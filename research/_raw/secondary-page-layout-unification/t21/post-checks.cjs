#!/usr/bin/env node
/**
 * T21 · 跑后（post-hoc）不变量复核：把「本轮跑完后」的现场读数重新量一遍并落盘。
 * 与 t21-summary.json 里 T14 段的读数互为独立测量（同一台机器、不同时刻）。
 * 用法：node research/_raw/secondary-page-layout-unification/t21/post-checks.cjs
 */
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..', '..', '..');
const T = 'research/_raw/secondary-page-layout-unification/t21';
const abs = rel => path.join(ROOT, rel);
const sha256 = rel => crypto.createHash('sha256').update(fs.readFileSync(abs(rel))).digest('hex');
const summary = JSON.parse(fs.readFileSync(abs(`${T}/t21-summary.json`), 'utf8'));
const out = [];
const W = line => out.push(String(line));

const startedAt = summary.at; // 本轮 summary 落盘时刻（≈ 所有读数的参照点）

/* 1. 标的自述：sha 与 summary / t19 交回值的关系 */
const targetNow = sha256('scripts/tools/verify-site.js');
W('== 1. 标的 scripts/tools/verify-site.js ==');
W(`跑后复量        : ${targetNow}`);
W(`summary.shaAfter: ${summary.shaAfter}  相等=${targetNow === summary.shaAfter}`);
W(`t19 交回值      : ${summary.t19Handover}  相等=${targetNow === summary.t19Handover}`);
W(`targetUnchanged(summary)=${summary.targetUnchanged} · targetIsT19=${summary.targetIsT19}`);
W(`字节数          : ${fs.statSync(abs('scripts/tools/verify-site.js')).size} B`);
W(`mtime           : ${fs.statSync(abs('scripts/tools/verify-site.js')).mtime.toISOString()}`);
W('');

/* 2. 冻结源码 */
W('== 2. 冻结源码（必须逐字未改） ==');
const FROZEN = {
  'index.html': '8442f14dd397276e67ea71a64aef9f86b59d1f603aa04f15ecfc402056d663b9',
  'scripts/tools/build-local.js': '264912c27174f837453bcafc1ade0422d46dc606e3036ba94e4b8525b149b348',
  'scripts/lib/page-kinds.js': '8fae98d1d8897a9d024b0cb2d8a5c016efc4c1807c41e63cbc02ab45e7c6b2ed',
  'scripts/lib/archive.js': '565710a7e6e197d9f369acf3b70c3feefd77413e188856523f16ebdc1429916e'
};
for (const [file, want] of Object.entries(FROZEN)) {
  const got = sha256(file);
  W(`${got === want ? '✓' : '✗'} ${file} = ${got}`);
}
W('');

/* 3. dist 全树：与 T0 清单逐字节比对 + 有没有跑后被写过的文件 */
W('== 3. dist ==');
const post = `${T}/logs/dist-post.sha256.txt`;
spawnSync(process.execPath, [`research/_raw/secondary-page-layout-unification/build/dist-manifest.cjs`, '--dir=dist', `--out=${post}`],
  { cwd: ROOT, stdio: 'ignore' });
const before = fs.readFileSync(abs(`${T}/dist-before.sha256.txt`), 'utf8');
const now = fs.readFileSync(abs(post), 'utf8');
W(`T0 清单 vs 跑后清单逐字节相同: ${before === now}（${before.split('\n').filter(Boolean).length} 行）`);
const cutoff = new Date(startedAt).getTime();
const touched = [];
const walk = dir => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (fs.statSync(full).mtimeMs > cutoff) touched.push(path.relative(ROOT, full).replace(/\\/g, '/'));
  }
};
walk(abs('dist'));
W(`dist 里 mtime 晚于 ${startedAt} 的文件数: ${touched.length}${touched.length ? ` → ${touched.slice(0, 5).join(', ')}` : ''}`);
W(`文件数: ${fs.readdirSync(abs('dist'), { recursive: true }).length ? '' : ''}${(() => { let n = 0; const c = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.isDirectory()) c(path.join(d, e.name)); else n++; } }; c(abs('dist')); return n; })()} 个（T0 清单行数应相同）`);
W('');

/* 4. dist.baseline（改动前产物）有没有被本轮碰过 */
W('== 4. dist.baseline ==');
let baseCount = 0;
let baseNewest = 0;
const walkBase = dir => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkBase(full);
    else { baseCount++; baseNewest = Math.max(baseNewest, fs.statSync(full).mtimeMs); }
  }
};
walkBase(abs('dist.baseline'));
W(`文件数 ${baseCount} · 最新 mtime ${new Date(baseNewest).toISOString()}（本轮开始 ${startedAt} 之后被写过的文件数: `
  + `${(() => { const list = []; const c = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) c(f); else if (fs.statSync(f).mtimeMs > cutoff) list.push(f); } }; c(abs('dist.baseline')); return list.length; })()}）`);
W('');

/* 5. git 视角：三个关键路径的工作区状态 + 生产源码 diff 规模 */
W('== 5. git 工作区（只读） ==');
const git = args => {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  return `${(r.stdout || '').trimEnd()}${r.stderr ? `\n[stderr] ${r.stderr.trimEnd()}` : ''}`.trim() || '（空）';
};
W(`git status --porcelain -- dist dist.baseline scripts/tools/verify-site.js:\n${git(['status', '--porcelain', '--', 'dist', 'dist.baseline', 'scripts/tools/verify-site.js'])}`);
W(`git status --porcelain -- research/_raw/secondary-page-layout-unification/t21（应只见本轮的证据文件）:\n${git(['status', '--porcelain', '--', 'research/_raw/secondary-page-layout-unification/t21'])}`);
W(`HEAD: ${git(['rev-parse', 'HEAD'])} · origin/master: ${git(['rev-parse', 'origin/master'])}`);
W(`git diff --stat -- scripts/tools/verify-site.js:\n${git(['diff', '--stat', '--', 'scripts/tools/verify-site.js'])}`);
W('');

/* 6. 本轮 §22c 分类读数（dist） */
W('== 6. §22c 页族分类（dist，取自本轮报告 metrics.layoutSweep） ==');
const report = JSON.parse(fs.readFileSync(abs(`${T}/geometry/after-verify.json`), 'utf8'));
const sweep = report.metrics.layoutSweep || {};
W(JSON.stringify({ total: sweep.total, wide: sweep.wide, detail: sweep.detail, other: sweep.other, notesChecked: sweep.notesChecked, notesJudged: sweep.notesJudged, narrow: sweep.narrowNotes, inkNarrow: sweep.inkNarrowNotes, union: sweep.narrowUnionNotes, hiddenText: sweep.hiddenTextNotes, unrendered: sweep.unrenderedNotes, vertical: sweep.verticalNotes, overflowPages: sweep.overflowPages, unclassified: sweep.unclassified }));
W(`桌面档作用域: ${JSON.stringify(sweep.inkScopeDesktopViewports)}`);
W(`样本档作用域: ${JSON.stringify(sweep.inkScopeSampleViewports)}`);

fs.writeFileSync(abs(`${T}/logs/T15-post-checks.txt`), `${out.join('\n')}\n`, 'utf8');
console.log(`${out.length} 行 → ${T}/logs/T15-post-checks.txt`);
