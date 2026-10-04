'use strict';
/** t21：把几个「实时/并发」读数一次打清楚（source-health 漂移、feeds 可复现性）。 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const WT = 'D:/OneDrive/Desktop/Code/AI Page/.worktrees/coverage-expansion-v1';
const run = (cmd, args, cwd) => spawnSync(cmd, args, { cwd: cwd || WT, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, timeout: 900000 });

console.log('=== ① source-health 的 current vs baseline（逐字段） ===');
const cur = JSON.parse(fs.readFileSync(path.join(WT, 'scripts/data/source-health.json'), 'utf8'));
const b = spawnSync('git', ['-C', WT, 'show', 'a4dd40f:scripts/data/source-health.json'], { encoding: 'buffer', maxBuffer: 16 * 1024 * 1024 });
console.log('baseline git show exit=' + b.status + ' bytes=' + (b.stdout ? b.stdout.length : 0));
let base = null;
try { base = JSON.parse(b.stdout.toString('utf8')); } catch (e) { console.log('baseline parse error: ' + e.message); }
const pick = j => { const arr = (j && (j.sources || j.rows || j.entries)) || []; const r = arr.find(x => (x.source || x.id || x.collector) === 'futurepedia'); return r ? { consecutiveFailures: r.consecutiveFailures, status: r.status, lastAttemptAt: r.lastAttemptAt, generatedAt: j.generatedAt } : { generatedAt: j && j.generatedAt, row: null }; };
console.log('baseline:', JSON.stringify(pick(base)));
console.log('current :', JSON.stringify(pick(cur)));
console.log('current file mtime:', fs.statSync(path.join(WT, 'scripts/data/source-health.json')).mtime.toISOString());

console.log('\n=== ② feeds 可复现门禁：完整输出 ===');
const fr = run(process.execPath, ['scripts/tools/check-feeds-reproducible.js']);
console.log('exit=' + fr.status);
console.log(String(fr.stdout || '').split('\n').slice(-18).join('\n'));
console.log('--- stderr ---');
console.log(String(fr.stderr || '').split('\n').slice(-6).join('\n'));

console.log('\n=== ③ 其他可复现门禁复跑 ===');
for (const [k, s] of [['deals', 'scripts/tools/check-reproducible.js'], ['plans', 'scripts/tools/check-plans-reproducible.js'], ['apiPlans', 'scripts/tools/check-api-plans-reproducible.js'], ['models', 'scripts/tools/check-models-reproducible.js'], ['registryLinks', 'scripts/tools/check-model-registry-links.js']]) {
  const r = run(process.execPath, [s]);
  console.log('  ' + k + ' exit=' + r.status + ' :: ' + String(r.stdout || '').trim().split('\n').slice(-1)[0].slice(0, 140));
}

console.log('\n=== ④ validate --strict + coverage-report ===');
const v = run(process.execPath, ['scripts/validate.js', '--strict']);
console.log('validate exit=' + v.status + ' :: ' + String(v.stdout || '').trim().split('\n').slice(-1)[0]);
const c = run(process.execPath, ['scripts/tools/coverage-report.js']);
console.log('coverage exit=' + c.status + ' :: ' + String(c.stdout || '').trim().split('\n').slice(-1)[0]);
