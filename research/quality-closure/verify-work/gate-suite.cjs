#!/usr/bin/env node
/**
 * T18 全量门禁复跑（**在沙箱副本里**，按 .github/actions/gate/action.yml 的步骤顺序）。
 *
 * 用法：node <verify-work>/gate-suite.cjs --root=D:\qc-t18\wt [--json=…]
 * 退出码：0 = 全部 exit 0；1 = 有非 0（逐条列出）。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const argOf = (n, d) => { const a = process.argv.find(x => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
const ROOT = path.resolve(argOf('root', 'D:\\qc-t18\\wt'));
const JSON_OUT = argOf('json', path.join(__dirname, 'logs', 'gate-suite.json'));
const GIT_BASH = 'C:\\Program Files\\Git\\bin\\bash.exe';

const STEPS = [
  ['CI consistency (36 断言)', 'node scripts/tools/check-ci-consistency.js --expect-checks=36'],
  ['Validate data (strict)', 'node scripts/validate.js --strict'],
  ['Reproducibility gate', 'node scripts/tools/check-reproducible.js'],
  ['History verify', 'node scripts/tools/history-verify.js'],
  ['Migration verifier', 'node scripts/tools/migrate-audience-verify.js'],
  ['Translation gate', 'node scripts/tools/zh-todo.js --check'],
  ['Translation self-test', 'node scripts/tools/zh-selftest.js'],
  ['Expiry self-test', 'node scripts/tools/expiry-selftest.js'],
  ['Text self-test', 'node scripts/tools/text-selftest.js'],
  ['Health self-test', 'node scripts/tools/health-selftest.js'],
  ['Provenance self-test', 'node scripts/tools/provenance-selftest.js'],
  ['Deal-history self-test', 'node scripts/tools/history-selftest.js'],
  ['Change-radar self-test', 'node scripts/tools/changes-selftest.js'],
  ['Feeds self-test', 'node scripts/tools/feeds-selftest.js'],
  ['SEO self-test', 'node scripts/tools/seo-selftest.js'],
  ['Audience self-test', 'node scripts/tools/audience-selftest.js'],
  ['App-token self-test', 'node scripts/tools/app-token-selftest.js'],
  ['AI layer self-test', 'node scripts/tools/ai-selftest.js'],
  ['Collector fixtures', 'node scripts/tools/fixture-test.js'],
  ['Plans self-test', 'node scripts/tools/plans-selftest.js'],
  ['Plan-history self-test', 'node scripts/tools/plan-history-selftest.js'],
  ['Deal-plan-links self-test', 'node scripts/tools/deal-plan-links-selftest.js'],
  ['API-plans self-test', 'node scripts/tools/api-plans-selftest.js'],
  ['API-plans reproducibility', 'node scripts/tools/check-api-plans-reproducible.js'],
  ['API-plan-history verify', 'node scripts/tools/check-api-plan-history.js'],
  ['Model-registry self-test', 'node scripts/tools/models-selftest.js'],
  ['Models-page self-test', 'node scripts/tools/models-page-selftest.js --dir=dist'],
  ['Plans-hub self-test', 'node scripts/tools/planshub-selftest.js --dir=dist'],
  ['Vendor-pages self-test', 'node scripts/tools/vendor-page-selftest.js --dir=dist'],
  ['Archive self-test', 'node scripts/tools/archive-selftest.js --dir=dist'],
  ['Data-docs self-test', 'node scripts/tools/data-docs-selftest.js --dir=dist'],
  ['Models reproducibility', 'node scripts/tools/check-models-reproducible.js'],
  ['Model-registry links check', 'node scripts/tools/check-model-registry-links.js'],
  ['Coverage report', 'node scripts/tools/coverage-report.js'],
  ['Assemble site', 'node scripts/tools/build-local.js'],
  ['Feeds reproducibility', 'node scripts/tools/check-feeds-reproducible.js'],
  ['Plans reproducibility', 'node scripts/tools/check-plans-reproducible.js'],
  ['Plan-history verify', 'node scripts/tools/check-plan-history.js'],
  ['SEO verification (from dist/)', 'node scripts/tools/seo-verify.js --dir=dist'],
  ['Real-browser acceptance', 'node scripts/tools/verify-site.js --dir=dist']
];

const results = [];
for (const [name, cmd] of STEPS) {
  const t0 = Date.now();
  const res = spawnSync(cmd, { cwd: ROOT, shell: true, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, env: { ...process.env, DSH_BASH: GIT_BASH } });
  const ms = Date.now() - t0;
  const out = `${res.stdout || ''}\n${res.stderr || ''}`;
  const summary = out.split('\n').filter(l => /✅|❌|通过|失败|exit|项/.test(l)).slice(-2).map(l => l.trim().slice(0, 130));
  results.push({ name, command: cmd, exitCode: res.status, ms, summary });
  console.log(`${res.status === 0 ? 'GREEN' : 'RED  '} ${name.padEnd(30)} ${String(ms).padStart(6)}ms exit=${res.status}${summary.length ? ' :: ' + summary[0] : ''}`);
}
const reds = results.filter(r => r.exitCode !== 0);
fs.mkdirSync(path.dirname(JSON_OUT), { recursive: true });
fs.writeFileSync(JSON_OUT, JSON.stringify({ root: ROOT, gitBash: GIT_BASH, steps: results.length, reds: reds.map(r => r.name), results }, null, 2));
console.log(`\n合计 ${results.length} 步 · 非 0 ${reds.length} 步${reds.length ? '：' + reds.map(r => r.name).join(' / ') : ''}`);
process.exit(reds.length ? 1 : 0);
