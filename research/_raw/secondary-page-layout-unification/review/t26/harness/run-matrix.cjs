#!/usr/bin/env node
/**
 * T26 · 读数矩阵（一次跑完）。改后 = 生产文件本身；改前 = run-old.cjs 内存编译 pre-t24 备份。
 *   new-dist           改后 × dist               期望 852/0
 *   new-baseline       改后 × dist.baseline      期望 852/36（并集仍 156/48，新判据 0 命中）
 *   old-baseline       改前 × dist.baseline      848 名（做「既有断言缺失 0」的多重集对照）
 *   new-clean          改后 × scratch/clean      期望 EXIT=0（同副本不注入）
 *   new-bare-fs0       改后 × scratch/bare-fs0   期望 EXIT≠0 且含 note-unrendered + 上界断言红
 *   old-bare-fs0       改前 × scratch/bare-fs0   期望 EXIT=0（T22-F1 的假绿基线）
 *   new-bare-fs0-plans 改后 × scratch/bare-fs0-plans  定点：只有 plans/ 未渲染
 *   new-noscript-key   改后 × scratch/noscript-key   反击：空 <noscript> 能否当免判键
 *   new-noscript-visible 改后 × scratch/noscript-visible 反击：让 noscript 可见
 * 用法：node run-matrix.cjs [filter]
 */
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../../../../../..');
const T26 = path.join(ROOT, 'research', '_raw', 'secondary-page-layout-unification', 'review', 't26');
const NEW = path.join(ROOT, 'scripts', 'tools', 'verify-site.js');
const OLD = path.join(__dirname, 'run-old.cjs');
const SCR = 'research/_raw/secondary-page-layout-unification/review/t26/scratch';

const MATRIX = [
  { id: 'new-dist', bin: 'new', dir: 'dist' },
  { id: 'new-baseline', bin: 'new', dir: 'dist.baseline' },
  { id: 'old-baseline', bin: 'old', dir: 'dist.baseline' },
  { id: 'new-clean', bin: 'new', dir: `${SCR}/clean` },
  { id: 'new-bare-fs0', bin: 'new', dir: `${SCR}/bare-fs0` },
  { id: 'old-bare-fs0', bin: 'old', dir: `${SCR}/bare-fs0` },
  { id: 'new-bare-fs0-plans', bin: 'new', dir: `${SCR}/bare-fs0-plans` },
  { id: 'new-noscript-key', bin: 'new', dir: `${SCR}/noscript-key` },
  { id: 'new-noscript-visible', bin: 'new', dir: `${SCR}/noscript-visible` },
  { id: 'old-bare-fs0-plans', bin: 'old', dir: `${SCR}/bare-fs0-plans` },
  { id: 'old-noscript-key', bin: 'old', dir: `${SCR}/noscript-key` }
];

const filter = process.argv[2] || null;
const sha16 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 16);
const summary = [];

for (const run of MATRIX) {
  if (filter && !run.id.includes(filter)) continue;
  const outDir = path.join(T26, 'runs', run.id);
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

fs.writeFileSync(path.join(T26, 'runs', `matrix${filter ? '-' + filter : ''}.json`), JSON.stringify(summary, null, 2));
console.log('矩阵完成');
