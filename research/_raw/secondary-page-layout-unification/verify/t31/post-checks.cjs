#!/usr/bin/env node
/**
 * T31 · 跑后不变量：标的 sha 未变 · dist/dist.baseline 零写入 · 注入只落在 scratch 副本 · git 视角
 * 用法：node research/_raw/secondary-page-layout-unification/verify/t31/post-checks.cjs
 */
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = (() => { let dir = __dirname; for (let i = 0; i < 8; i++) { if (fs.existsSync(path.join(dir, 'package.json'))) return dir; dir = path.dirname(dir); } throw new Error('no root'); })();
const T = 'research/_raw/secondary-page-layout-unification/verify/t31';
const abs = rel => path.join(ROOT, rel);
const sha = rel => crypto.createHash('sha256').update(fs.readFileSync(abs(rel))).digest('hex');
const SHAPE = JSON.parse(fs.readFileSync(abs(`${T}/scratch-form.json`), 'utf8'));
const out = [];
const W = s => out.push(String(s));

const target = 'scripts/tools/verify-site.js';
W('== 1. 判据标的 ==');
W(`verify-site.js sha256 = ${sha(target)}`);
W(`期望（轮 6 冻结版）    = 2cbc160dc64f8ade513824065b42d8e38ad7c72dd417cb418bde8d5526b44a5e`);
W(`相等 = ${sha(target) === '2cbc160dc64f8ade513824065b42d8e38ad7c72dd417cb418bde8d5526b44a5e'} · ${fs.statSync(abs(target)).size} B · mtime ${fs.statSync(abs(target)).mtime.toISOString()}`);
W('');

W('== 2. dist 只读（注入只落在 scratch 副本） ==');
const page = 'category/agent/index.html';
const nowPage = sha(`dist/${page}`);
W(`dist/${page} sha256 = ${nowPage}`);
W(`跑前原样（mk-form-scratch 记录的 sha256Before）= ${SHAPE.sha256Before} · 相等 = ${nowPage === SHAPE.sha256Before}`);
W(`scratch 副本 ${SHAPE.dst}/${page} = ${sha(`${SHAPE.dst}/${page}`)}（应与 dist 不同）· 不同 = ${sha(`${SHAPE.dst}/${page}`) !== nowPage}`);
const distNewest = (() => { let newest = 0; const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else newest = Math.max(newest, fs.statSync(f).mtimeMs); } }; walk(abs('dist')); return new Date(newest).toISOString(); })();
W(`dist 全树最新 mtime = ${distNewest}（本轮 4 个动作全部只读 dist）`);
const baseNewest = (() => { let newest = 0; const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else newest = Math.max(newest, fs.statSync(f).mtimeMs); } }; walk(abs('dist.baseline')); return new Date(newest).toISOString(); })();
W(`dist.baseline 全树最新 mtime = ${baseNewest}`);
W(`mk-form-scratch 读数：dist 文件 ${SHAPE.srcFiles} · scratch 文件 ${SHAPE.scratchFiles} · 与 dist 不同 ${SHAPE.filesDifferingFromSrc.length} 个 [${SHAPE.filesDifferingFromSrc.join(', ')}] · 冻结串 ${SHAPE.frozenCountBefore} → ${SHAPE.frozenCountAfter} · 目标页 +${SHAPE.bytesAdded} B`);
W('');

W('== 3. git 视角（只读） ==');
const git = args => { const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' }); return `${(r.stdout || '').trimEnd()}${r.stderr ? `\n[stderr] ${r.stderr.trimEnd()}` : ''}`.trim() || '（空）'; };
W(`HEAD = ${git(['rev-parse', 'HEAD'])} · origin/master = ${git(['rev-parse', 'origin/master'])}`);
W(`git status --porcelain -- scripts dist dist.baseline docs index.html:\n${git(['status', '--porcelain', '--', 'scripts', 'dist', 'dist.baseline', 'docs', 'index.html'])}`);
W('');

W('== 4. 本轮产出的证据文件（T31） ==');
const list = [];
const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else list.push(path.relative(ROOT, f).split(path.sep).join('/')); } };
walk(abs(T));
for (const rel of list.sort()) W(`  ${rel}  ${fs.statSync(abs(rel)).size} B`);

fs.writeFileSync(abs(`${T}/post-checks.txt`), `${out.join('\n')}\n`, 'utf8');
console.log(`${out.length} 行 → ${T}/post-checks.txt`);
