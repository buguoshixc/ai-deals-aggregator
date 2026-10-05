#!/usr/bin/env node
/**
 * t10 · 牙的可证伪性独立验证（T7-F1 / T7-F3）—— 在 TEMP 沙箱副本上做，共享工作区零写入。
 *
 * 三条"定向补丁"（每条只改**这一条检查的输入**，不碰别的检查，所以红了必是它）：
 *   P1a  T7-F1：把 `missingRowsProblems(gapQueue, states.MISSING)` 的输入换成"原队列 + 一条合成 MISSING(present=1)"
 *              ⇒ 集合大小与计数脱钩 + present≠0，这条检查必须红
 *   P1b  T7-F1：把 expectedCount 改成 states.MISSING + 1 ⇒ 必须红（证明"计数侧"也是活的操作数）
 *   P2a  T7-F3：把**文件侧**操作数（gaps 文件里 API 侧声明行数）+1 ⇒ :919 那条必须红
 *   P2b  T7-F3：把**逐格复算侧**操作数（wildcardSurplusOf）+1 ⇒ 同一条必须红
 * 另跑一次未打补丁的对照（必须 0 失败），并对每次改写做 sha256 before/after + 还原证明。
 *
 * 用法：node t10-teeth-check.cjs <repoRoot> <reviewDir>
 */
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('crypto');
const { spawnSync } = require('child_process');

const repo = path.resolve(process.argv[2]);
const reviewDir = path.resolve(process.argv[3]);
const outDir = path.join(reviewDir, 't10-teeth');
fs.mkdirSync(outDir, { recursive: true });
const sha = f => cp.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

/* ---------- 建沙箱 ---------- */
const sandbox = path.join(process.env.TEMP, 'cvdv1-t10-teeth');
fs.rmSync(sandbox, { recursive: true, force: true });
fs.mkdirSync(sandbox, { recursive: true });
const copyDir = (from, to) => { fs.mkdirSync(to, { recursive: true }); for (const e of fs.readdirSync(from, { withFileTypes: true })) { const s = path.join(from, e.name); const d = path.join(to, e.name); if (e.isDirectory()) { if (e.name === 'node_modules') continue; copyDir(s, d); } else fs.copyFileSync(s, d); } };
copyDir(path.join(repo, 'scripts'), path.join(sandbox, 'scripts'));
fs.mkdirSync(path.join(sandbox, 'research'), { recursive: true });
for (const f of ['models.json', 'plans.json', 'api-plans.json', 'deals.json', 'index.html', 'package.json', 'model-registry-links.json']) {
  fs.copyFileSync(path.join(repo, f), path.join(sandbox, f));
}
for (const f of ['v3.0-source-candidates.json', 'v3.0-source-candidates.md']) {
  const src = path.join(repo, 'research', f);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(sandbox, 'research', f));
}
try { fs.symlinkSync(path.join(repo, 'node_modules'), path.join(sandbox, 'node_modules'), 'junction'); }
catch (error) { console.error('junction failed:', error.message); process.exit(2); }

const selftestRel = path.join('scripts', 'tools', 'coverage-targets-selftest.js');
const target = path.join(sandbox, selftestRel);
const pristine = fs.readFileSync(target, 'utf8');
const pristineSha = sha(target);

const runSelf = id => {
  const outFile = path.join(outDir, `${id}.out.txt`);
  const errFile = path.join(outDir, `${id}.err.txt`);
  const fdOut = fs.openSync(outFile, 'w');
  const fdErr = fs.openSync(errFile, 'w');
  const r = spawnSync(process.execPath, [target], { cwd: sandbox, stdio: ['ignore', fdOut, fdErr], timeout: 600000 });
  fs.closeSync(fdOut); fs.closeSync(fdErr);
  const out = fs.readFileSync(outFile, 'utf8');
  const err = fs.readFileSync(errFile, 'utf8');
  const failLines = out.split('\n').filter(l => l.trim().startsWith('✗')).map(l => l.trim().slice(0, 200));
  return { exit: r.status, failLines, tail: (err.trim() || out.trim()).split('\n').slice(-2).join(' ⏎ ').slice(0, 240) };
};

const cases = [];

/* ---------- 对照 ---------- */
{
  const control = runSelf('C0-control');
  cases.push({ id: 'C0-control', expect: 'exit 0（0 失败）', exit: control.exit, failLines: control.failLines, tail: control.tail, ok: control.exit === 0 });
}

/* ---------- 补丁定义：每条的 old → new 都是唯一命中的一行 ---------- */
const patches = [
  {
    id: 'P1a-F1-inject-synthetic-missing-row',
    old: 'const missingRowIssues = missingRowsProblems(gapQueue, cov3.states.MISSING);',
    new: 'const missingRowIssues = missingRowsProblems(gapQueue.concat([{ state: \'MISSING\', provider: \'(t10-probe)\', dimension: \'deals\', present: 1 }]), cov3.states.MISSING);',
    expectCheck: 'MISSING 行的盘上记录必须是 0'
  },
  {
    id: 'P1b-F1-offset-expected-count',
    old: 'const missingRowIssues = missingRowsProblems(gapQueue, cov3.states.MISSING);',
    new: 'const missingRowIssues = missingRowsProblems(gapQueue, cov3.states.MISSING + 1);',
    expectCheck: 'MISSING 行的盘上记录必须是 0'
  },
  {
    id: 'P2a-F3-file-side-plus-one',
    old: ".filter(declaration => declaration && declaration.apiPlanId !== undefined && declaration.modelKey !== undefined).length;",
    new: ".filter(declaration => declaration && declaration.apiPlanId !== undefined && declaration.modelKey !== undefined).length + 1;",
    expectCheck: '不许同源自证'
  },
  {
    id: 'P2b-F3-recomputed-side-plus-one',
    old: 'const declaredWildcardSurplus = wildcardSurplusOf(reg.declaredApiEntryRows, apiDoc);',
    new: 'const declaredWildcardSurplus = wildcardSurplusOf(reg.declaredApiEntryRows, apiDoc) + 1;',
    expectCheck: '不许同源自证'
  }
];

for (const p of patches) {
  const hits = pristine.split(p.old).length - 1;
  let result;
  if (hits !== 1) {
    result = { id: p.id, patchHits: hits, exit: null, ok: false, note: `补丁锚点命中 ${hits} 次（应为 1）—— 不做替换` };
  } else {
    const shaBefore = sha(target);
    fs.writeFileSync(target, pristine.replace(p.old, p.new));
    const shaMutated = sha(target);
    const r = runSelf(p.id);
    const hitCheck = [...r.failLines].some(l => l.includes(p.expectCheck));
    fs.writeFileSync(target, pristine);
    const shaAfter = sha(target);
    result = {
      id: p.id, patchHits: hits, exit: r.exit, expectCheck: p.expectCheck,
      hitExpectedCheck: hitCheck, failLines: r.failLines.slice(0, 4), tail: r.tail,
      shaBefore, shaMutated, shaAfter, restoredByteExact: shaBefore === shaAfter && shaBefore !== shaMutated,
      ok: r.exit !== 0 && hitCheck && shaBefore === shaAfter
    };
  }
  cases.push(result);
}

const summary = {
  sandbox, pristineSha, ranAt: new Date().toISOString(), cases,
  passed: cases.filter(c => c.ok).length, failed: cases.filter(c => !c.ok).length,
  sharedWorktreeSelftestSha: sha(path.join(repo, selftestRel))
};
fs.writeFileSync(path.join(reviewDir, 't10-teeth-results.json'), `${JSON.stringify(summary, null, 2)}\n`);
for (const c of cases) {
  console.log(`${c.ok ? '✓' : '✗'} ${c.id}  exit=${c.exit}  ${c.expect || ''}`);
  if (c.failLines && c.failLines.length) c.failLines.forEach(l => console.log(`    失败项：${l}`));
  if (c.shaBefore) console.log(`    sha: ${c.shaBefore.slice(0, 16)}… →(mutated) ${c.shaMutated.slice(0, 16)}… →(restored) ${c.shaAfter.slice(0, 16)}…  restoredByteExact=${c.restoredByteExact}`);
  if (c.note) console.log(`    note: ${c.note}`);
}
console.log(`\n牙的可证伪性：${summary.passed} 通过 / ${summary.failed} 失败（沙箱 ${sandbox}）`);
process.exit(summary.failed ? 1 : 0);
