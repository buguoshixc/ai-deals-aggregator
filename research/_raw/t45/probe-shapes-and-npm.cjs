// t45（只读）：补齐剩余 JSON 形状 + 核对「npm run report:coverage」与直接 node 的差别。
'use strict';
const { spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT = __dirname;
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const text = fs.readFileSync(path.join(OUT, 'report-json-1.txt'), 'utf8');

function jsonBlocks(t) {
  const out = [];
  for (let i = 0; i < t.length; i++) {
    if (t[i] !== '{') continue;
    let d = 0, s = false, e = false, end = -1;
    for (let x = i; x < t.length; x++) {
      const c = t[x];
      if (s) { if (e) { e = false; continue; } if (c === '\\') { e = true; continue; } if (c === '"') s = false; continue; }
      if (c === '"') { s = true; continue; }
      if (c === '{') d++; else if (c === '}') { d--; if (d === 0) { end = x; break; } }
    }
    if (end < 0) break;
    const raw = t.slice(i, end + 1);
    try { out.push({ raw, value: JSON.parse(raw) }); } catch { /* skip */ }
    i = end;
  }
  return out;
}
const p = jsonBlocks(text).find(b => b.value && b.value.registry).value;
const j = v => JSON.stringify(v);

console.log('## 缺口清单在 JSON 里的形状');
console.log('gaps.dealsWithoutPlans[0..2]  :', j(p.gaps.dealsWithoutPlans.slice(0, 3)));
console.log('gaps.plansWithoutDeals[0..2]  :', j(p.gaps.plansWithoutDeals.slice(0, 3)));
console.log('gaps.notAdoptedProviders[0..2]:', j(p.gaps.notAdoptedProviders.slice(0, 3)));
console.log('\n## §41 各条的对象形状');
console.log('unverifiable[0]     :', j(p.coverageTargets.unverifiable[0]));
console.log('deferred[0]         :', j(p.coverageTargets.deferred[0]));
console.log('partialTargets[0]   :', j(p.coverageTargets.partialTargets[0]));
console.log('notApplicable[0..1] :', j(p.coverageTargets.notApplicable.slice(0, 2)));
console.log('rows[0] keys        :', j(Object.keys(p.coverageTargets.rows[0])));
console.log('currentModels.declared[0] :', j(p.coverageTargets.currentModels.declared[0]));
console.log('currentModels.modelsByProvider keys:', j(Object.keys(p.coverageTargets.currentModels.modelsByProvider)));
console.log('sourceHealth.declaredSources names :', j(p.coverageTargets.sourceHealth.declaredSources.map(s => s.name)));
console.log('missingTargets[0].items :', j(p.coverageTargets.missingTargets[0].items));

console.log('\n## npm run report:coverage 与直接 node 的差别');
const npm = spawnSync('npm.cmd', ['run', 'report:coverage'], { cwd: ROOT, maxBuffer: 1 << 28, shell: false });
const npmOut = npm.stdout || Buffer.from('');
fs.writeFileSync(path.join(OUT, 'report-npm-text.txt'), npmOut);
console.log('npm exit:', npm.status, '| bytes:', npmOut.length, '| sha256:', sha(npmOut).slice(0, 16));
const direct = fs.readFileSync(path.join(OUT, 'report-text.txt'));
console.log('direct bytes:', direct.length, '| sha256:', sha(direct).slice(0, 16));
const a = npmOut.toString('utf8');
console.log('npm 输出包含报告标题:', a.includes('数据覆盖报告'));
console.log('npm 输出前 200 字:', JSON.stringify(a.slice(0, 200)));
console.log('npm 输出里报告正文是否与直接运行逐字节相同:', a.endsWith(direct.toString('utf8')));
const npmStderr = (npm.stderr || Buffer.from('')).toString('utf8');
console.log('npm stderr 前 200 字:', JSON.stringify(npmStderr.slice(0, 200)));
