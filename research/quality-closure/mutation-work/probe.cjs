'use strict';
/**
 * T20 定向探针：把三条有疑问的用例在**净副本**上重放，逐个门禁读原文，
 * 回答「期望检测器到底响没响」以及「ai-selftest 为何在多数用例里红」。
 *
 * 用法：node probe.cjs [--gold=D:\qc-t20\gold]
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { CASES } = require('./cases.cjs');

const GOLD = process.argv.find(x => x.startsWith('--gold='))?.slice(7) || 'D:\\qc-t20\\gold';
const WORK = path.resolve(__dirname, '..', '..', '..', '..', 'qc-t20-probe');
const run = (cmd, cwd) => {
  const r = spawnSync(cmd, { cwd, shell: true, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { exit: r.status, out: `${r.stdout || ''}${r.stderr || ''}` };
};
function cp(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (e.name.startsWith('.qc-') || e.name.startsWith('dist.qc-')) continue;
    const s = path.join(src, e.name), d = path.join(dest, e.name);
    const st = fs.lstatSync(s);
    if (st.isSymbolicLink()) { try { fs.symlinkSync(fs.readlinkSync(s), d, 'junction'); } catch {} continue; }
    if (st.isDirectory()) cp(s, d); else fs.copyFileSync(s, d);
  }
}

const targets = process.argv.slice(2).filter(a => a.startsWith('--case=')).map(a => a.slice(7));
const ids = targets.length ? targets : ['M05', 'M07', 'M08', 'M16'];
for (const id of ids) {
  const c = CASES.find(x => x.id.startsWith(id));
  if (!c) { console.log(`没有用例 ${id}`); continue; }
  const dir = path.join(WORK, c.id);
  fs.rmSync(dir, { recursive: true, force: true });
  cp(GOLD, dir);
  const changed = c.mutator ? (c.mutator.call(c, dir) || []) : [];
  console.log(`\n===== ${c.id} =====`);
  for (const f of changed) console.log(`  变异文件：${path.relative(dir, f).replace(/\\/g, '/')}`);
  for (const [name, cmd] of [
    ['validate-strict', 'node scripts/validate.js --strict'],
    ['rebuild-api-plans', 'node scripts/tools/rebuild-api-plans.js'],
    ['rebuild-plans', 'node scripts/tools/rebuild-plans.js'],
    ['rebuild-models', 'node scripts/tools/rebuild-models.js'],
    ['api-plans-selftest', 'node scripts/tools/api-plans-selftest.js'],
    ['provenance-selftest', 'node scripts/tools/provenance-selftest.js'],
    ['health-selftest', 'node scripts/tools/health-selftest.js'],
    ['ai-selftest', 'node scripts/tools/ai-selftest.js']
  ]) {
    const r = run(cmd, dir);
    const hits = r.out.split('\n').map(l => l.trim()).filter(l => /✗|❌|拒绝写盘|失败|问题/.test(l)).slice(0, 4);
    console.log(`  ${r.exit === 0 ? 'GREEN' : 'RED  '} ${name.padEnd(20)} exit=${r.exit}`);
    if (r.exit !== 0) hits.forEach(h => console.log(`         ${h.slice(0, 200)}`));
  }
}
