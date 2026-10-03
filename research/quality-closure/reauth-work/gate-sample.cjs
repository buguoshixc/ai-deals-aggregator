#!/usr/bin/env node
/**
 * T23 独立门禁抽验（在**提交态**共享树上跑；只读命令 + 默认 dist）：
 * 逐条记录命令与退出码，产出 reauth-work/logs/gate-sample.json。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT = path.resolve(__dirname, 'logs', 'gate-sample.json');
const GIT_BASH = 'C:\\Program Files\\Git\\bin\\bash.exe';

const GATES = [
  ['validate --strict', 'node scripts/validate.js --strict'],
  ['check-ci-consistency --expect-checks=36', 'node scripts/tools/check-ci-consistency.js --expect-checks=36'],
  ['check-reproducible', 'node scripts/tools/check-reproducible.js'],
  ['history-verify', 'node scripts/tools/history-verify.js'],
  ['check-plans-reproducible', 'node scripts/tools/check-plans-reproducible.js'],
  ['check-api-plans-reproducible', 'node scripts/tools/check-api-plans-reproducible.js'],
  ['check-models-reproducible', 'node scripts/tools/check-models-reproducible.js'],
  ['check-model-registry-links', 'node scripts/tools/check-model-registry-links.js'],
  ['check-api-plan-history', 'node scripts/tools/check-api-plan-history.js'],
  ['check-plan-history', 'node scripts/tools/check-plan-history.js'],
  ['models-selftest', 'node scripts/tools/models-selftest.js'],
  ['models-page-selftest --dir=dist', 'node scripts/tools/models-page-selftest.js --dir=dist'],
  ['api-plans-selftest', 'node scripts/tools/api-plans-selftest.js'],
  ['plans-selftest', 'node scripts/tools/plans-selftest.js'],
  ['ai-selftest', 'node scripts/tools/ai-selftest.js'],
  ['data-docs-selftest --dir=dist', 'node scripts/tools/data-docs-selftest.js --dir=dist'],
  ['feeds-selftest', 'node scripts/tools/feeds-selftest.js'],
  ['health-selftest', 'node scripts/tools/health-selftest.js'],
  ['provenance-selftest', 'node scripts/tools/provenance-selftest.js'],
  ['archive-selftest --dir=dist', 'node scripts/tools/archive-selftest.js --dir=dist'],
  ['seo-verify --dir=dist', 'node scripts/tools/seo-verify.js --dir=dist'],
  ['coverage-report', 'node scripts/tools/coverage-report.js'],
  ['deal-plan-links-selftest', 'node scripts/tools/deal-plan-links-selftest.js'],
  ['audience-selftest', 'node scripts/tools/audience-selftest.js'],
  ['changes-selftest', 'node scripts/tools/changes-selftest.js'],
  ['build-local', 'node scripts/tools/build-local.js'],
  ['MY join-audit --dist=dist', 'node research/quality-closure/verify-work/join-audit.cjs --dist=dist'],
  ['MY browser-matrix --dist=dist', 'node research/quality-closure/verify-work/browser-matrix.cjs --dist=dist'],
  ['verify-site --dir=dist（真浏览器）', 'node scripts/tools/verify-site.js --dir=dist']
];

const results = [];
for (const [name, cmd] of GATES) {
  const t0 = Date.now();
  const r = spawnSync(cmd, { cwd: ROOT, shell: true, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, env: { ...process.env, DSH_BASH: GIT_BASH } });
  const out = `${r.stdout || ''}\n${r.stderr || ''}`;
  const summary = out.split('\n').map(l => l.trim()).filter(l => /✅|❌|通过|失败|项·|项，|失败 0/.test(l)).slice(-2);
  results.push({ name, command: cmd, exitCode: r.status, ms: Date.now() - t0, summary });
  console.log(`${r.status === 0 ? 'GREEN' : 'RED  '} ${name.padEnd(42)} exit=${r.status} ${String(Date.now() - t0).padStart(6)}ms${summary.length ? ` :: ${summary[0].slice(0, 110)}` : ''}`);
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ root: ROOT, ranAt: new Date().toISOString(), results }, null, 2));
const reds = results.filter(r => r.exitCode !== 0);
console.log(`\n我独立重跑 ${results.length} 道 · 非 0 ${reds.length}${reds.length ? '：' + reds.map(r => r.name).join(' / ') : ''}`);
process.exit(reds.length ? 1 : 0);
