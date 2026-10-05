#!/usr/bin/env node
/**
 * t10 工具：在共享工作区里**只读**跑一批自测/门禁命令，逐条记录 exit code 与输出尾部。
 * 所有输出写 research/_raw/coverage-depth-v1/verification/t10-logs/（in-scope）。
 *
 * 用法：node t10-run-suite.cjs <repoRoot> <reviewDir>
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repo = path.resolve(process.argv[2]);
const outDir = path.resolve(process.argv[3] || '.');
const logDir = path.join(outDir, 't10-logs');
fs.mkdirSync(logDir, { recursive: true });

const CASES = [
  ['models-page-allow-missing-dist', 'scripts/tools/models-page-selftest.js', ['--allow-missing-dist']],
  ['models-page-dist', 'scripts/tools/models-page-selftest.js', ['--dir=dist']],
  ['models-selftest', 'scripts/tools/models-selftest.js', []],
  ['coverage-targets-selftest', 'scripts/tools/coverage-targets-selftest.js', []],
  ['model-freshness-selftest', 'scripts/tools/model-freshness-selftest.js', []],
  ['check-models-reproducible', 'scripts/tools/check-models-reproducible.js', []],
  ['check-model-registry-links', 'scripts/tools/check-model-registry-links.js', []],
  ['validate-strict', 'scripts/validate.js', ['--strict']],
  ['coverage-report', 'scripts/tools/coverage-report.js', []],
  ['history-selftest', 'scripts/tools/history-selftest.js', []],
  ['provenance-selftest', 'scripts/tools/provenance-selftest.js', []],
  ['analytics-selftest', 'scripts/tools/analytics-selftest.js', []],
  ['seo-selftest', 'scripts/tools/seo-selftest.js', []],
  ['feeds-selftest', 'scripts/tools/feeds-selftest.js', []],
  ['plan-history-selftest', 'scripts/tools/plan-history-selftest.js', []],
  ['api-plans-selftest', 'scripts/tools/api-plans-selftest.js', []],
  ['health-selftest', 'scripts/tools/health-selftest.js', []],
  ['archive-selftest', 'scripts/tools/archive-selftest.js', []]
];

const results = [];
for (const [id, script, args] of CASES) {
  const outFile = path.join(logDir, `${id}.out.txt`);
  const errFile = path.join(logDir, `${id}.err.txt`);
  const fdOut = fs.openSync(outFile, 'w');
  const fdErr = fs.openSync(errFile, 'w');
  const r = spawnSync(process.execPath, [path.join(repo, script), ...args],
    { cwd: repo, stdio: ['ignore', fdOut, fdErr], timeout: 600000 });
  fs.closeSync(fdOut); fs.closeSync(fdErr);
  const out = fs.readFileSync(outFile, 'utf8');
  const err = fs.readFileSync(errFile, 'utf8');
  const tail = (err.trim() || out.trim()).split('\n').slice(-3).join(' ⏎ ').slice(0, 300);
  results.push({ id, script, args, exitCode: r.status, signal: r.signal, timedOut: r.error ? String(r.error.message) : null, tail, outBytes: fs.statSync(outFile).size, errBytes: fs.statSync(errFile).size });
}
const summary = { repo, ranAt: new Date().toISOString(), results, failed: results.filter(r => r.exitCode !== 0).length };
fs.writeFileSync(path.join(outDir, 't10-suite-results.json'), `${JSON.stringify(summary, null, 2)}\n`);
for (const r of results) console.log(`${r.exitCode === 0 ? '✓' : '✗'} ${r.id}  exit=${r.exitCode}  ${r.tail}`);
console.log(`\n合计 ${results.length} 条命令，失败 ${summary.failed} 条`);
