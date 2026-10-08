#!/usr/bin/env node
/**
 * 三段实跑驱动器（t18 / roles-note-tooth-v1）：
 *   ① 干净树 → `scripts/tools/roles-note-selftest.js` 全绿（exit 0）
 *   ② 沙箱变异（把 `official_urls.json` 的括注改回旧称）→ 同一条判据**变红且 exit≠0**
 *   ③ 逐字节还原（sha256 与备份一致）→ 复绿（exit 0）
 *
 * 为什么要有驱动器：三段之间必须**保证还原**（哪怕中途失败），否则会把生产数据留在被改坏的状态。
 * 这里用 try/finally 把还原放在 finally 里，并且每一步都把 exit code 与输出尾部记进 JSON。
 *
 * 用法：node research/_raw/sources-residue-v1b/roles-note-gate-3phase.js
 * 产出：research/_raw/sources-residue-v1b/roles-note-gate-3phase.json
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT = path.join(__dirname, 'roles-note-gate-3phase.json');
const TARGET = path.join(ROOT, 'scripts', 'data', 'official_urls.json');
const SELFTEST = 'scripts/tools/roles-note-selftest.js';
const MUTATION = 'research/_raw/sources-residue-v1b/note-mutation.js';

const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const tail = text => String(text || '').trim().split('\n').slice(-6).join('\n');

function run(args) {
  const result = spawnSync('node', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  return { args: ['node', ...args].join(' '), exitCode: result.status, tail: tail((result.stdout || '') + (result.stderr || '')) };
}

const report = {
  task: 'roles-note-tooth-v1',
  date: '2026-10-08',
  target: 'scripts/data/official_urls.json（`_roles` 注里的 sourceUrl 括注）',
  judgement: SELFTEST,
  phases: []
};

try {
  /* ① 干净树 */
  const before = sha(TARGET);
  const phase1 = run([SELFTEST]);
  report.phases.push({ phase: '① 干净树', expectation: '全绿 exit=0', sha256: before, ...phase1 });

  /* ② 沙箱变异 */
  const bend = run([MUTATION, '--bend']);
  const bentHash = sha(TARGET);
  const phase2 = run([SELFTEST]);
  report.phases.push({
    phase: '② 沙箱变异（括注改回旧称）',
    expectation: '变红 exit≠0',
    mutation: bend,
    sha256: bentHash,
    ...phase2
  });
} finally {
  /* ③ 逐字节还原（无论 ② 结果如何都执行） */
  const restore = run([MUTATION, '--restore']);
  const restoredHash = sha(TARGET);
  const phase3 = run([SELFTEST]);
  report.phases.push({
    phase: '③ 逐字节还原后复跑',
    expectation: '复绿 exit=0',
    restore,
    sha256: restoredHash,
    ...phase3
  });
  report.restoredByteExact = restoredHash === report.phases[0].sha256;
}

report.verdict = report.phases[0].exitCode === 0
  && report.phases[1].exitCode !== 0
  && report.phases[2].exitCode === 0
  && report.restoredByteExact === true;

fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n', 'utf8');

for (const phase of report.phases) {
  console.log(`--- ${phase.phase} → exit=${phase.exitCode}（期望：${phase.expectation}）sha256=${phase.sha256.slice(0, 16)}`);
  console.log(phase.tail.split('\n').map(line => '    ' + line).join('\n'));
}
console.log(`\n逐字节还原：${report.restoredByteExact ? '✅' : '❌'} · 三段判定：${report.verdict ? '✅ 符合预期' : '❌ 与预期不符'}`);
console.log(`→ ${path.relative(ROOT, OUT).split(path.sep).join('/')}`);
process.exit(report.verdict ? 0 : 1);
