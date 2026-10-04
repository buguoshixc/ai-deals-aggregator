#!/usr/bin/env node
'use strict';
/**
 * t18 · ≥6 条变异复核：在 %TEMP% 副本上重做本轮关键承诺的反证（共享 worktree 只读）。
 *
 * 选条判据：每条对应本轮**一个具体承诺**，且对照组必须绿、变异组必须红。
 *   M1 删关系层 ⇒ 覆盖报告红（t14-F1 / t25）
 *   M2 索引身份+链接改名 ⇒ 页面自测红（t14-F2）
 *   M3 删一条 API 处置声明 ⇒ 覆盖报告红（t23/t25 的反方向）
 *   M4 摘掉一条 selftest 登记 ⇒ (19) 反向登记制红（t27）
 *   M5 给门禁步骤加 continue-on-error ⇒ (10) 静态跳过红（t7/t27 的既有牙）
 *   M6 删产物 /data/index.json ⇒ 数据文档自测红
 *
 * 产出：research/_raw/coverage-expansion-v1/t18-mutations.json
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const WT = path.join(__dirname, '..', '..', '..');
const TMP = process.env.TEMP || os.tmpdir();
const REPO_A = path.join(TMP, 't18-m-repo-a');
const REPO_B = path.join(TMP, 't18-m-repo-b');
const GATE = path.join(TMP, 't18-m-gate');
const SITE = path.join(TMP, 't18-m-site');
const BASH = 'C:\\Program Files\\Git\\bin\\bash.exe';
const OUT = path.join(WT, 'research/_raw/coverage-expansion-v1/t18-mutations.json');

const sha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const GUARD = ['scripts/data/model-registry-links.json', 'scripts/data/model-registry-gaps.json', 'package.json',
  '.github/actions/gate/action.yml', 'dist/models/index.html', 'dist/data/index.json'];
const before = Object.fromEntries(GUARD.map(f => [f, sha(path.join(WT, f))]));

const robocopy = (src, dst, extra = []) => {
  fs.rmSync(dst, { recursive: true, force: true });
  const r = spawnSync('robocopy', [src, dst, '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', ...extra], { stdio: 'ignore' });
  if (r.status !== undefined && r.status >= 8) throw new Error('robocopy ' + r.status);
};
const junction = (src, dst) => { fs.rmSync(dst, { recursive: true, force: true }); fs.symlinkSync(src, dst, 'junction'); };
const runN = (file, args, cwd) => {
  const r = spawnSync(process.execPath, [file, ...args], { cwd, encoding: 'utf8', env: { ...process.env, DSH_BASH: BASH }, maxBuffer: 32 * 1024 * 1024 });
  return { exit: r.status, tail: ((r.stdout || '') + (r.stderr || '')).split('\n').filter(Boolean).slice(-3).join(' ⏎ ').slice(0, 400) };
};

const results = [];
const case_ = (id, promise, expectRed, prepare) => {
  try {
    const got = prepare();
    const ok = expectRed ? got.mut.exit !== 0 : got.mut.exit === 0;
    const ctlOk = got.ctl ? (expectRed ? got.ctl.exit === 0 : true) : null;
    results.push({ id, promise, expect: expectRed ? 'red' : 'green', controlExit: got.ctl ? got.ctl.exit : null, mutantExit: got.mut.exit, ok: ok && (ctlOk === null || ctlOk), controlTail: got.ctl ? got.ctl.tail : null, mutantTail: got.mut.tail });
    console.log((ok && (ctlOk === null || ctlOk) ? '✓' : '✗') + ' ' + id + ' · ' + promise
      + ' · 对照 exit=' + (got.ctl ? got.ctl.exit : '-') + ' / 变异 exit=' + got.mut.exit);
    if (!ok || ctlOk === false) console.log('    变异尾: ' + got.mut.tail.slice(0, 220));
  } catch (e) {
    results.push({ id, promise, error: String(e.message), ok: false });
    console.log('✗ ' + id + ' 执行失败：' + e.message);
  }
};

/* M1 / M3 需要整仓副本 */
const buildRepo = dst => {
  robocopy(WT, dst, ['/XD', 'node_modules', '.git', 'dist', '.worktrees', '*.building', '*.stale']);
  junction(path.join(WT, 'node_modules'), path.join(dst, 'node_modules'));
};

console.log('准备整仓副本（M1/M3 各一份）…');
buildRepo(REPO_A);
buildRepo(REPO_B);

case_('M1', '删掉 scripts/data/model-registry-links.json ⇒ 覆盖报告必须红（t14-F1/t25）', true, () => {
  const ctl = runN(path.join(REPO_A, 'scripts/tools/coverage-report.js'), [], REPO_A);
  fs.rmSync(path.join(REPO_A, 'scripts/data/model-registry-links.json'), { force: true });
  return { ctl, mut: runN(path.join(REPO_A, 'scripts/tools/coverage-report.js'), [], REPO_A) };
});

case_('M3', '删掉 gaps 里一条 API 处置声明 ⇒ 覆盖报告必须红（t23/t25 的反方向）', true, () => {
  const f = path.join(REPO_B, 'scripts/data/model-registry-gaps.json');
  const ctl = runN(path.join(REPO_B, 'scripts/tools/coverage-report.js'), [], REPO_B);
  const doc = JSON.parse(fs.readFileSync(f, 'utf8'));
  const at = doc.declarations.findIndex(d => d.apiPlanId);
  if (at < 0) throw new Error('gaps 里没有 API 侧声明');
  const removed = doc.declarations.splice(at, 1)[0];
  fs.writeFileSync(f, JSON.stringify(doc, null, 2) + '\n', 'utf8');
  console.log('    （删掉 ' + removed.apiPlanId + ' 的一条 API 声明）');
  return { ctl, mut: runN(path.join(REPO_B, 'scripts/tools/coverage-report.js'), [], REPO_B) };
});

/* M2 / M6 在产物副本上做 */
console.log('准备产物副本…');
robocopy(path.join(WT, 'dist'), SITE);

case_('M2', '/models/ 索引里 slug+详情链接改名 ⇒ 页面自测必须红（t14-F2）', true, () => {
  const ctl = runN(path.join(WT, 'scripts/tools/models-page-selftest.js'), ['--dir=' + SITE], WT);
  const f = path.join(SITE, 'models/index.html');
  const base = fs.readFileSync(f, 'utf8');
  fs.writeFileSync(f, base.split('glm-5.3').join('glm-5.3x'), 'utf8');
  const mut = runN(path.join(WT, 'scripts/tools/models-page-selftest.js'), ['--dir=' + SITE], WT);
  fs.writeFileSync(f, base, 'utf8');
  return { ctl, mut };
});

case_('M6', '删掉产物 /data/index.json ⇒ 数据文档自测必须红', true, () => {
  const victim = path.join(SITE, 'data/index.json');
  const ctl = runN(path.join(WT, 'scripts/tools/data-docs-selftest.js'), ['--dir=' + SITE], WT);
  const backup = fs.readFileSync(victim, 'utf8');
  fs.rmSync(victim, { force: true });
  const mut = runN(path.join(WT, 'scripts/tools/data-docs-selftest.js'), ['--dir=' + SITE], WT);
  fs.writeFileSync(victim, backup, 'utf8');
  return { ctl, mut };
});

/* M4 / M5 在门禁小副本上做（check-ci-consistency 只需 workflows + action.yml + package.json + package-lock + scripts/tools/*selftest*） */
function buildGateCopy() {
  robocopy(path.join(WT, '.github'), path.join(GATE, '.github'));
  for (const f of ['package.json', 'package-lock.json']) fs.copyFileSync(path.join(WT, f), path.join(GATE, f));
  const toolsSrc = path.join(WT, 'scripts/tools'), toolsDst = path.join(GATE, 'scripts/tools');
  fs.mkdirSync(toolsDst, { recursive: true });
  for (const f of fs.readdirSync(toolsSrc)) if (/selftest/i.test(f) && f.endsWith('.js')) fs.copyFileSync(path.join(toolsSrc, f), path.join(toolsDst, f));
}
const runChecker = () => {
  const r = spawnSync(process.execPath, [path.join(WT, 'scripts/tools/check-ci-consistency.js'), '--root=' + GATE],
    { cwd: WT, encoding: 'utf8', env: { ...process.env, DSH_BASH: BASH }, maxBuffer: 32 * 1024 * 1024 });
  const out = (r.stdout || '') + (r.stderr || '');
  return { exit: r.status, tail: out.split('\n').filter(l => l.includes('CI 口径检查') || l.includes('✗')).slice(0, 2).join(' ⏎ ').slice(0, 400) };
};

console.log('准备门禁小副本…');
buildGateCopy();
case_('M4', '摘掉 package.json 的 selftest:freshness（action.yml 不动）⇒ (19) 反向登记制必须红（t27）', true, () => {
  const ctl = runChecker();
  const f = path.join(GATE, 'package.json');
  const doc = JSON.parse(fs.readFileSync(f, 'utf8'));
  delete doc.scripts['selftest:freshness'];
  fs.writeFileSync(f, JSON.stringify(doc, null, 2) + '\n', 'utf8');
  const mut = runChecker();
  buildGateCopy();
  return { ctl, mut };
});

case_('M5', '给门禁某一步加 continue-on-error: true ⇒ (10) 静态跳过必须红', true, () => {
  const ctl = runChecker();
  const f = path.join(GATE, '.github/actions/gate/action.yml');
  const base = fs.readFileSync(f, 'utf8');
  const target = '      run: node scripts/tools/feeds-selftest.js';
  if (!base.includes(target)) throw new Error('锚点未命中');
  fs.writeFileSync(f, base.replace(target, '      continue-on-error: true\n' + target), 'utf8');
  const mut = runChecker();
  fs.writeFileSync(f, base, 'utf8');
  return { ctl, mut };
});

/* 共享树自证 */
const after = Object.fromEntries(GUARD.map(f => [f, sha(path.join(WT, f))]));
const intact = GUARD.every(f => before[f] === after[f]);
const out = { generatedAt: new Date().toISOString(), head: spawnSync('git', ['-C', WT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim(), cases: results, guardedFiles: GUARD.map(f => ({ file: f, before: before[f].slice(0, 16), after: after[f].slice(0, 16), same: before[f] === after[f] })), sharedTreeIntact: intact };
fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n', 'utf8');

for (const d of [REPO_A, REPO_B, GATE, SITE]) fs.rmSync(d, { recursive: true, force: true });
console.log('\n===== 汇总 =====');
results.forEach(r => console.log('  ' + (r.ok ? '✓' : '✗') + ' ' + r.id + ' ' + r.promise));
console.log('共享 worktree 逐字未变：' + intact);
console.log('结果已写：research/_raw/coverage-expansion-v1/t18-mutations.json');
process.exitCode = results.every(r => r.ok) && intact ? 0 : 1;
