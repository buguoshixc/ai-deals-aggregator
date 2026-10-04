#!/usr/bin/env node
'use strict';
/**
 * t41 · 反向牙实验（只在 %TEMP% 忠实副本上做，共享 worktree 逐字不动）
 *
 * 变体 A「null 身份却被建了路由」：在副本里给 Groq（vendorKey: null）在 vendor-slugs.json 里加一条登记，
 *   并跑该副本的 build-local，让产物层真的多出一个 dist/vendor/groq/ 目录 ⇒ 期望 vendor-page-selftest **红**。
 * 变体 B「对照组（不构造）」：同一副本、撤销变异 ⇒ 期望 **绿**。
 * 变体 C「有身份却没生成页」：删掉一个有身份厂商页的 dist 目录（同一注册表的 vendor）⇒ 期望 **红**（原方向不许被删弱）。
 *
 * 用法：node t41-reverse-teeth.cjs <副本根目录>
 * 产出：t41-reverse-teeth.json（写回共享 worktree 的 in-scope 目录）
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const COPY = process.argv[2];
if (!COPY) { console.error('usage: node t41-reverse-teeth.cjs <copy-root>'); process.exit(2); }
const WT = path.join(__dirname, '..', '..', '..');           // 共享 worktree（只写产物）
const run = (cmd, args, cwd) => spawnSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 900000 });

const results = { copy: COPY, at: new Date().toISOString(), variants: [] };
const rec = (id, promise, mutation) => {
  const r = run(process.execPath, ['scripts/tools/vendor-page-selftest.js'], COPY);
  const combined = (r.stdout || '') + (r.stderr || '');
  const failed = (combined.match(/✗ ([^\n]*)/g) || []);
  const summaryLine = (combined.match(/===[^\n]*项通过，\d+ 项失败 ===/) || [''])[0];
  results.variants.push({
    id, promise, mutation, exit: r.status,
    reds: failed.map(s => s.trim()),
    summary: summaryLine.trim(),
    sawR5Red: failed.some(s => s.includes('【R5】')),
    tail: combined.split('\n').filter(Boolean).slice(-3).join('\n'),
  });
  console.log(`[${id}] exit=${r.status} reds=${failed.length} R5红=${failed.some(s => s.includes('【R5】'))} :: ${summaryLine.trim()}`);
};

const slugFile = path.join(COPY, 'scripts/data/vendor-slugs.json');
const originalSlugs = fs.readFileSync(slugFile, 'utf8');

/* ── 变体 A：给 null 身份的 Groq 加路由登记 → 必须红 ── */
const mutant = JSON.parse(originalSlugs);
mutant['Groq'] = 'groq';
fs.writeFileSync(slugFile, JSON.stringify(mutant, null, 2) + '\n', 'utf8');
let rb = run(process.execPath, ['scripts/tools/build-local.js'], COPY);
results.variantABuild = { exit: rb.status, tail: ((rb.stdout || '') + (rb.stderr || '')).split('\n').filter(Boolean).slice(-2).join(' | ') };
const groqDir = path.join(COPY, 'dist/vendor/groq');
results.variantABuild.groqDirExists = fs.existsSync(groqDir);
rec('A', 'null 身份（Groq）在 vendor-slugs.json 里有登记 ⇒ 计划层为它生成页 + 登记表不该有它 ⇒ 必红',
  'scripts/data/vendor-slugs.json += {"Groq":"groq"} → build-local → dist/vendor/groq/ 真的被建出来');

/* ── 变体 B：撤销变异、重建 → 必须绿 ── */
fs.writeFileSync(slugFile, originalSlugs, 'utf8');
rb = run(process.execPath, ['scripts/tools/build-local.js'], COPY);
results.variantBBuild = { exit: rb.status, groqDirExists: fs.existsSync(groqDir) };
rec('B', '对照组：撤销变异后同一副本 ⇒ 必须绿（证明变体 A 的红来自变异，不是副本本身有病）', '恢复 vendor-slugs.json → 重建');

/* ── 变体 C：删掉一个「有身份」厂商页的产物目录 → 必须红（原方向不许被删弱） ── */
const dirs = fs.readdirSync(path.join(COPY, 'dist/vendor'), { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name);
const victim = dirs.includes('zhipu') ? 'zhipu' : dirs[0];
fs.rmSync(path.join(COPY, 'dist/vendor', victim), { recursive: true, force: true });
rec('C', '有 A 空间身份且已达标的 provider 在磁盘上缺了目录 ⇒ 必红（少一个也不许静默）',
  '删掉 dist/vendor/' + victim + '/（该身份有 vendorKey，不属于 null 身份）');

fs.writeFileSync(path.join(WT, 'research/_raw/coverage-expansion-v1/t41-reverse-teeth.json'),
  JSON.stringify(results, null, 2) + '\n', 'utf8');
console.log('\n变体数 ' + results.variants.length + ' · 期望 = A红 / B绿 / C红');
