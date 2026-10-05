#!/usr/bin/env node
/**
 * t10 · Git Diff Review 的机械化部分：
 *   ① 逐文件 diff --numstat（工作区 vs 基线 ff86368）
 *   ② t12 在 models-selftest.js 上的**改名偏离**逐条 old → new + 断言强度对照
 *   ③ 三个 selftest 的 check 条数（HEAD vs 现在）—— 只增不减的机械证据
 *   ④ 派生文件的可重建性：models.json / model-registry-links.json（由 check-models-reproducible 覆盖）
 *
 * 用法：node t10-diff-review.cjs <repoRoot> <reviewDir>
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repo = path.resolve(process.argv[2]);
const reviewDir = path.resolve(process.argv[3]);
const git = args => spawnSync('git', args, { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const show = rel => git(['show', `HEAD:${rel}`]).stdout || '';

const out = { repo, ranAt: new Date().toISOString(), numstat: [], renames: [], checkCounts: [], notes: [] };

/* ① numstat */
const ns = git(['diff', '--numstat', 'ff86368e6d12d1ef57b2f51aa2c957c01d2a9ed8']).stdout.trim();
for (const line of ns.split('\n').filter(Boolean)) {
  const [added, removed, file] = line.split('\t');
  out.numstat.push({ file, added: Number(added), removed: Number(removed) });
}
// 未跟踪但属于本轮交付的文件
const untracked = git(['ls-files', '--others', '--exclude-standard']).stdout.split('\n').filter(Boolean)
  .filter(f => /^(scripts\/|research\/(coverage-depth-v1|_raw\/coverage-depth-v1\/verification))/.test(f));
out.untrackedNewFiles = untracked.slice(0, 60);

/* ② 改名偏离：models-selftest.js 的 check 名对照 */
const files = ['scripts/tools/models-selftest.js', 'scripts/tools/coverage-targets-selftest.js', 'scripts/tools/models-page-selftest.js'];
for (const rel of files) {
  const before = show(rel);
  let after = '';
  try { after = fs.readFileSync(path.join(repo, rel), 'utf8'); } catch { out.notes.push(`${rel} 现在读不到`); continue; }
  const namesOf = text => [...text.matchAll(/check(?:Equal)?\(\s*([`'"'])([^`'"']{0,160})\1/g)].map(m => m[2]);
  const beforeNames = namesOf(before);
  const afterNames = namesOf(after);
  const removedNames = beforeNames.filter(n => !afterNames.includes(n));
  const addedNames = afterNames.filter(n => !beforeNames.includes(n));
  const wordNums = s => (s.match(/\d+ 个模型|\d+ 条|=== 44|=== 12|\b44\b|\b12\b/g) || []).length;
  out.checkCounts.push({
    file: rel,
    checkCallsBefore: (before.match(/\bcheck\(/g) || []).length,
    checkCallsAfter: (after.match(/\bcheck\(/g) || []).length,
    checkEqualBefore: (before.match(/checkEqual\(/g) || []).length,
    checkEqualAfter: (after.match(/checkEqual\(/g) || []).length,
    removedCheckNames: removedNames,
    addedCheckNames: addedNames
  });
  if (removedNames.length) out.renames.push({ file: rel, removed: removedNames, added: addedNames.slice(0, 12) });
}

/* ③ 对每个"被改名"的检查，抓出 old/new 的断言表达式（改名偏离是否丢保护力的现场材料） */
const msRel = 'scripts/tools/models-selftest.js';
const beforeMs = show(msRel).split('\n');
const afterMs = fs.readFileSync(path.join(repo, msRel), 'utf8').split('\n');
const exprAfterName = (lines, name) => {
  const i = lines.findIndex(l => l.includes(name));
  if (i < 0) return null;
  return lines.slice(i, i + 8).join('\n').replace(/\s+/g, ' ').slice(0, 460);
};
out.renameEvidence = (out.checkCounts.find(c => c.file === msRel)?.removedCheckNames || []).map(name => ({
  oldName: name,
  oldExpr: exprAfterName(beforeMs, name),
  newName: (out.checkCounts.find(c => c.file === msRel)?.addedCheckNames || [])[0] || null
}));

fs.writeFileSync(path.join(reviewDir, 't10-diff-review.json'), `${JSON.stringify(out, null, 2)}\n`);

console.log('== git diff --numstat（工作区 vs ff86368）==');
const totalAdd = out.numstat.reduce((a, r) => a + r.added, 0);
const totalDel = out.numstat.reduce((a, r) => a + r.removed, 0);
for (const r of out.numstat) console.log(`  ${r.file}: +${r.added} / -${r.removed}`);
console.log(`  合计 ${out.numstat.length} 个文件，+${totalAdd} / -${totalDel}；另有未跟踪新文件 ${out.untrackedNewFiles.length} 个`);
console.log('\n== selftest check 条数（HEAD → 现在）==');
for (const c of out.checkCounts) {
  console.log(`  ${c.file}: check ${c.checkCallsBefore} → ${c.checkCallsAfter}；checkEqual ${c.checkEqualBefore} → ${c.checkEqualAfter}；删除的检查名 ${c.removedCheckNames.length} 个`);
  c.removedCheckNames.forEach(n => console.log(`      - 旧名：${n}`));
  c.addedCheckNames.slice(0, 8).forEach(n => console.log(`      + 新名：${n}`));
}
console.log('\n== 未跟踪新文件（抽样）==');
out.untrackedNewFiles.slice(0, 20).forEach(f => console.log(`  ${f}`));
