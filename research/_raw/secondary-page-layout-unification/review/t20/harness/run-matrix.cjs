#!/usr/bin/env node
/**
 * T20 · 读数矩阵（一次跑完，避免反复起浏览器）。
 *   1 new-dist        : 改后口径 × dist          期望 848 项 EXIT=0
 *   2 new-baseline    : 改后口径 × dist.baseline 期望 33 条失败（真值 156/48）
 *   3 old-baseline    : 改前口径 × dist.baseline 用于「改前就红 / 失败总数仍 33」对账
 *   4 new-clean       : 改后口径 × scratch/clean（对照）期望 EXIT=0
 *   5 new-grid760     : 改后口径 × scratch/grid760（R3-1 反转）期望 EXIT≠0 + note-ink-narrow
 *   6 old-grid760     : 改前口径 × scratch/grid760  期望 EXIT=0（同一产物、只换口径 ⇒ 证明红来自口径）
 *   7 new-contents    : 改后口径 × scratch/contents（R3-3 无盒形态）期望 EXIT=0
 *   8 old-contents    : 改前口径 × scratch/contents 期望出现 note-narrow / note-axis 假红
 * 生产源码零写入：改后跑生产文件本身，改前用 run-old.cjs 在内存里编译备份。
 * 用法：node run-matrix.cjs [labelFilter]
 */
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../../../../../..');
const T20 = path.join(ROOT, 'research', '_raw', 'secondary-page-layout-unification', 'review', 't20');
const NEW = path.join(ROOT, 'scripts', 'tools', 'verify-site.js');
const OLD = path.join(__dirname, 'run-old.cjs');
const SCR = 'research/_raw/secondary-page-layout-unification/review/t20/scratch';

const MATRIX = [
  { id: 'new-dist', bin: 'new', dir: 'dist' },
  { id: 'new-baseline', bin: 'new', dir: 'dist.baseline' },
  { id: 'old-baseline', bin: 'old', dir: 'dist.baseline' },
  { id: 'new-clean', bin: 'new', dir: `${SCR}/clean` },
  { id: 'new-grid760', bin: 'new', dir: `${SCR}/grid760` },
  { id: 'old-grid760', bin: 'old', dir: `${SCR}/grid760` },
  { id: 'new-contents', bin: 'new', dir: `${SCR}/contents` },
  { id: 'old-contents', bin: 'old', dir: `${SCR}/contents` },
  { id: 'new-grid760-changes', bin: 'new', dir: `${SCR}/grid760-changes` },
  { id: 'old-grid760-changes', bin: 'old', dir: `${SCR}/grid760-changes` }
];

const filter = process.argv[2] || null;
const sha16 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 16);
const summary = [];

for (const run of MATRIX) {
  if (filter && !run.id.includes(filter)) continue;
  const outDir = path.join(T20, 'runs', run.id);
  fs.mkdirSync(outDir, { recursive: true });
  const report = path.join(outDir, 'report.json');
  const log = path.join(outDir, 'run.log');
  const script = run.bin === 'new' ? NEW : OLD;
  const relReport = path.relative(ROOT, report).split(path.sep).join('/');
  const fd = fs.openSync(log, 'w');
  const t0 = Date.now();
  const res = spawnSync(process.execPath, [script, `--dir=${run.dir}`, `--json=${relReport}`], {
    cwd: ROOT, stdio: ['ignore', fd, fd], windowsHide: true, timeout: 900000
  });
  fs.closeSync(fd);
  const seconds = Math.round((Date.now() - t0) / 100) / 10;
  const row = { id: run.id, bin: run.bin, dir: run.dir, exit: res.status, seconds, report: relReport };
  if (fs.existsSync(report)) {
    const rep = JSON.parse(fs.readFileSync(report, 'utf8'));
    const checks = (rep.validation && rep.validation.checks) || rep.checks || [];
    const failed = checks.filter(c => !c.ok);
    row.checks = checks.length;
    row.failedChecks = failed.length;
    row.failedNames = failed.map(c => c.name);
    row.reportSha16 = sha16(report);
    row.metricKeys = Object.keys(rep.metrics || {});
  } else {
    row.note = '没有写出报告';
  }
  summary.push(row);
  console.log(`${run.id}: EXIT=${row.exit} · ${seconds}s · checks=${row.checks ?? '?'} · failed=${row.failedChecks ?? '?'}`);
}

fs.writeFileSync(path.join(T20, 'runs', `matrix${filter ? '-' + filter : ''}.json`), JSON.stringify(summary, null, 2));
console.log('矩阵完成');
