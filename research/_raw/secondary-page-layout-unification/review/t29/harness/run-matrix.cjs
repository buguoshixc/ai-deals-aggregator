#!/usr/bin/env node
/**
 * T29 · 读数矩阵（一轮跑完）。改后 = 生产文件本身；改前 = run-old.cjs 内存编译 pre-t28 备份。
 *   new-dist        改后 × dist                期望 852/0
 *   new-baseline    改后 × dist.baseline       期望 852/36（并集仍 156/48，新判据 0 命中）
 *   old-baseline    改前 × dist.baseline       848 名（归一化对照「既有断言缺失 0」）
 *   new-clean       改后 × scratch/clean       期望 EXIT=0
 *   new-key         改后 × scratch/key         **空格 noscript 反证**：期望 EXIT≠0 且含 note-unrendered
 *   old-key         改前 × scratch/key         期望 EXIT=0（轮 5 的免判路径）
 *   new-key-mixed   改后 × scratch/key-mixed   期望 EXIT≠0（标记仍在、可见正文也在 ⇒ 照判）
 *   new-bare-plans  改后 × scratch/bare-fs0-plans  判据桶正对照：期望 EXIT≠0
 * 用法：node run-matrix.cjs [filter]
 */
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../../../../../..');
const T29 = path.join(ROOT, 'research', '_raw', 'secondary-page-layout-unification', 'review', 't29');
const NEW = path.join(ROOT, 'scripts', 'tools', 'verify-site.js');
const OLD = path.join(__dirname, 'run-old.cjs');
const SCR = 'research/_raw/secondary-page-layout-unification/review/t29/scratch';

const MATRIX = [
  { id: 'new-dist', bin: 'new', dir: 'dist' },
  { id: 'new-baseline', bin: 'new', dir: 'dist.baseline' },
  { id: 'old-baseline', bin: 'old', dir: 'dist.baseline' },
  { id: 'new-clean', bin: 'new', dir: `${SCR}/clean` },
  { id: 'new-key', bin: 'new', dir: `${SCR}/key` },
  { id: 'old-key', bin: 'old', dir: `${SCR}/key` },
  { id: 'new-key-mixed', bin: 'new', dir: `${SCR}/key-mixed` },
  { id: 'new-bare-plans', bin: 'new', dir: `${SCR}/bare-fs0-plans` },
  { id: 'new-empty', bin: 'new', dir: `${SCR}/empty-notes` },
  { id: 'old-empty', bin: 'old', dir: `${SCR}/empty-notes` }
];

const filter = process.argv[2] || null;
const sha16 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 16);
const summary = [];

for (const run of MATRIX) {
  if (filter && !run.id.includes(filter)) continue;
  const outDir = path.join(T29, 'runs', run.id);
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
    const checks = rep.checks || (rep.validation && rep.validation.checks) || [];
    const failed = checks.filter(c => !c.ok);
    row.checks = checks.length;
    row.failedChecks = failed.length;
    row.failedNames = failed.map(c => c.name);
    row.reportSha16 = sha16(report);
  } else row.note = '没有写出报告';
  summary.push(row);
  console.log(`${run.id}: EXIT=${row.exit} · ${seconds}s · checks=${row.checks ?? '?'} · failed=${row.failedChecks ?? '?'}`);
}

fs.writeFileSync(path.join(T29, 'runs', `matrix${filter ? '-' + filter : ''}.json`), JSON.stringify(summary, null, 2));
console.log('矩阵完成');
