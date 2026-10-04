'use strict';
/** t21 一次性读取器：把 `git show a4dd40f:<file>` 写盘再解析（避开 pwsh 引号/编码问题）。 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const WT = 'D:/OneDrive/Desktop/Code/AI Page/.worktrees/coverage-expansion-v1';
const which = process.argv[2] || 'scripts/data/source-health.json';
const r = spawnSync('git', ['-C', WT, 'show', 'a4dd40f:' + which], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 });
if (r.status !== 0) { console.log('git show failed: ' + String(r.stderr).slice(0, 200)); process.exit(1); }
const text = r.stdout.toString('utf8');
const tmp = path.join(process.env.TEMP || '/tmp', 't21-baseline-' + path.basename(which));
fs.writeFileSync(tmp, text, 'utf8');
console.log('wrote ' + tmp + ' (' + Buffer.byteLength(text) + ' bytes)');
try {
  const j = JSON.parse(text);
  console.log('top keys: ' + Object.keys(j).join(','));
  const arr = j.sources || j.rows || j.entries || [];
  const row = arr.find(x => (x.source || x.id || x.collector) === 'futurepedia');
  console.log('futurepedia: ' + JSON.stringify(row));
  console.log('count=' + (j.count === undefined ? '(no count key)' : j.count) + ' dist=' + JSON.stringify(j.dist || j.byStatus || null));
} catch (e) { console.log('not JSON: ' + e.message); console.log(text.slice(0, 300)); }
