#!/usr/bin/env node
'use strict';
/**
 * t27 定向变异演练：**（19）反向登记制**必须真的有牙。
 *
 * 全程只在 %TEMP% 的隔离副本里做变异，共享 worktree **一个字节都不写**：
 * 脚本开头与结尾各算一次三个 in-scope 文件的 sha256，用来自证这一点。
 *
 * 用法：node research/_raw/t27/reverse-registration-drill.js
 * 退出码：0 = 全部对照组/变异组都符合预期且共享 worktree 哈希未变；1 = 有不符合预期的项。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const WT = path.join(__dirname, '..', '..', '..');                 // worktree 根
const DRILL = path.join(process.env.TEMP || '/tmp', 'cev1-t27-drill');
const CHECKER = path.join(WT, 'scripts', 'tools', 'check-ci-consistency.js');
const BASH = 'C:\\Program Files\\Git\\bin\\bash.exe';
const EXPECTED_CHECKS = 38;

const WATCHED = [
  'scripts/tools/check-ci-consistency.js',
  '.github/workflows/verify.yml',
  'package.json',
];
const sha256 = file => crypto.createHash('sha256')
  .update(fs.readFileSync(path.join(WT, file))).digest('hex');
const hashesBefore = Object.fromEntries(WATCHED.map(f => [f, sha256(f)]));

/* ── 造隔离副本：只放检查器真正会读的东西 ─────────────────────────── */
function buildRoot() {
  fs.rmSync(DRILL, { recursive: true, force: true });
  const copy = (rel, dest = rel) => {
    const dst = path.join(DRILL, dest);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(path.join(WT, rel), dst);
  };
  for (const f of fs.readdirSync(path.join(WT, '.github', 'workflows'))) {
    if (/\.ya?ml$/.test(f)) copy(path.join('.github', 'workflows', f));
  }
  copy('.github/actions/gate/action.yml');
  copy('package.json');
  copy('package-lock.json');
  const toolsDir = path.join(WT, 'scripts', 'tools');
  for (const f of fs.readdirSync(toolsDir)) {
    if (/selftest/i.test(f) && f.endsWith('.js')) copy(path.join('scripts', 'tools', f));
  }
  return {
    action: path.join(DRILL, '.github/actions/gate/action.yml'),
    pkg: path.join(DRILL, 'package.json'),
    checker: path.join(DRILL, 'scripts/tools/check-ci-consistency.js'),
  };
}

/* 每个变异组都要动检查器里的白名单 ⇒ 把检查器也复制进副本再改 */
function patchChecker(replaceFrom, replaceTo) {
  const src = fs.readFileSync(CHECKER, 'utf8');
  if (!src.includes(replaceFrom)) throw new Error('检查器里找不到锚点：' + replaceFrom.slice(0, 60));
  const dst = path.join(DRILL, 'scripts/tools/check-ci-consistency.js');
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, src.split(replaceFrom).join(replaceTo), 'utf8');
}

function runChecker(rootCheckerPath, expectChecks = EXPECTED_CHECKS) {
  const r = spawnSync(process.execPath,
    [rootCheckerPath, '--root=' + DRILL, '--expect-checks=' + expectChecks],
    { encoding: 'utf8', env: { ...process.env, DSH_BASH: BASH } });
  const out = (r.stdout || '') + (r.stderr || '');
  const fails = out.split('\n').filter(l => l.includes('✗'));
  const summary = out.split('\n').filter(l => l.includes('CI 口径检查')).join(' | ');
  return { exit: r.status, fails, summary, out };
}

const results = [];
function drill(label, expectRed, prepare, checkerAnchor) {
  const paths = buildRoot();
  let checkerPath = paths.checker;
  fs.copyFileSync(CHECKER, path.join(DRILL, 'scripts/tools/check-ci-consistency.js'));
  if (prepare) prepare(paths);
  if (checkerAnchor) { patchChecker(checkerAnchor[0], checkerAnchor[1]); }
  const run = runChecker(fs.existsSync(checkerPath) ? checkerPath : CHECKER);
  const red = run.exit !== 0;
  const ok = expectRed ? red : !red;
  results.push({ label, ok, red, expectRed, run });
  console.log('\n===== ' + label + ' =====');
  console.log('  ' + (ok ? '✓ 符合预期' : '✗ 不符合预期') + ' · 期望' + (expectRed ? '红' : '绿')
    + ' · 实际 exit=' + run.exit + ' · ' + run.summary);
  run.fails.slice(0, 3).forEach(l => console.log('     ' + l.trim().slice(0, 200)));
}

const EXEMPT_ANCHOR = 'const SELFTEST_FILE_EXEMPTIONS = [';

/* ── C0 对照组：副本原样 ─────────────────────────────────────────── */
drill('C0 对照组（副本未变异，预期绿）', false, null);

/* ── M1 任务书要求的定向变异：把一个真实自测从 package.json 的 selftest 链上摘掉 ── */
drill('M1 摘掉 selftest:coverage-targets（action.yml 不动，预期红）', true, ({ pkg }) => {
  const doc = JSON.parse(fs.readFileSync(pkg, 'utf8'));
  delete doc.scripts['selftest:coverage-targets'];
  fs.writeFileSync(pkg, JSON.stringify(doc, null, 2) + '\n', 'utf8');
});

/* ── M2 同一形态的第二个实例（t7 的 D5 探针用的就是它） ── */
drill('M2 摘掉 selftest:freshness（action.yml 不动，预期红）', true, ({ pkg }) => {
  const doc = JSON.parse(fs.readFileSync(pkg, 'utf8'));
  delete doc.scripts['selftest:freshness'];
  fs.writeFileSync(pkg, JSON.stringify(doc, null, 2) + '\n', 'utf8');
});

/* ── M3 新写了自测文件但忘了登记（真正的"下一个 t7"场景） ── */
drill('M3 新增一个未登记的 *selftest*.js 文件（预期红）', true, () => {
  fs.writeFileSync(path.join(DRILL, 'scripts/tools/zzz-brand-new-selftest.js'),
    "'use strict';\n// 新写的自测，忘了登记\n", 'utf8');
});

/* ── M4 白名单里写一个不存在的文件（豁免本身也要被守） ── */
drill('M4 白名单指向不存在的文件（预期红）', true, null, [
  EXEMPT_ANCHOR,
  EXEMPT_ANCHOR + "\n  { file: 'scripts/tools/ghost-selftest.js', reason: '演示用' },",
]);

/* ── M5 白名单用通配（等于没有白名单） ── */
drill('M5 白名单写成通配（预期红）', true, null, [
  EXEMPT_ANCHOR,
  EXEMPT_ANCHOR + "\n  { file: 'scripts/tools/*-selftest.js', reason: '演示用' },",
]);

/* ── M6 白名单没写理由 ── */
drill('M6 白名单缺理由（预期红）', true, null, [
  EXEMPT_ANCHOR,
  EXEMPT_ANCHOR + "\n  { file: 'scripts/tools/coverage-targets-selftest.js', reason: '' },",
]);

/* ── M7 合法豁免：逐文件 + 有理由 ⇒ 该文件可以不独立跑（预期绿） ── */
drill('M7 合法豁免（逐文件 + 有理由，预期绿）', false, null, [
  EXEMPT_ANCHOR,
  EXEMPT_ANCHOR + "\n  { file: 'scripts/tools/coverage-targets-selftest.js', reason: '演示：它由另一支自测 require，不独立跑' },",
]);

/* ── M8 换名字但仍在被门禁跑到的 script 里 ⇒ 不算漏登记（预期绿） ── */
drill('M8 selftest:freshness 改名为 check:freshness（路径仍在门禁里，预期绿）', false, ({ pkg }) => {
  const doc = JSON.parse(fs.readFileSync(pkg, 'utf8'));
  doc.scripts['check:freshness'] = doc.scripts['selftest:freshness'];
  delete doc.scripts['selftest:freshness'];
  fs.writeFileSync(pkg, JSON.stringify(doc, null, 2) + '\n', 'utf8');
});

/* ── 外部钉住仍有牙：旧数字 37 必须非 0（在隔离副本上再验一遍） ── */
{
  buildRoot();
  fs.copyFileSync(CHECKER, path.join(DRILL, 'scripts/tools/check-ci-consistency.js'));
  const stale = runChecker(path.join(DRILL, 'scripts/tools/check-ci-consistency.js'), 37);
  const ok = stale.exit !== 0;
  results.push({ label: 'M9 外部钉住：拿旧数字 37 跑（预期红）', ok, red: stale.exit !== 0, expectRed: true, run: stale });
  console.log('\n===== M9 外部钉住：拿旧数字 37 跑（预期红） =====');
  console.log('  ' + (ok ? '✓ 符合预期' : '✗ 不符合预期') + ' · exit=' + stale.exit + ' · ' + stale.summary);
  stale.fails.slice(0, 2).forEach(l => console.log('     ' + l.trim().slice(0, 200)));
}

/* ── 共享 worktree 自证 ── */
const hashesAfter = Object.fromEntries(WATCHED.map(f => [f, sha256(f)]));
const intact = WATCHED.every(f => hashesBefore[f] === hashesAfter[f]);
console.log('\n===== 共享 worktree 自证 =====');
WATCHED.forEach(f => console.log('  ' + (hashesBefore[f] === hashesAfter[f] ? '✓' : '✗') + ' '
  + f + '  ' + hashesBefore[f].slice(0, 16) + ' → ' + hashesAfter[f].slice(0, 16)));
console.log('  逐字未变：' + intact);
fs.rmSync(DRILL, { recursive: true, force: true });

console.log('\n===== 汇总 =====');
results.forEach(r => console.log('  ' + (r.ok ? '✓' : '✗') + ' ' + r.label));
const failed = results.filter(r => !r.ok);
console.log('\n' + (failed.length === 0 && intact ? '✅ 全部符合预期，共享 worktree 未被触碰'
  : '❌ 有 ' + failed.length + ' 项不符合预期' + (intact ? '' : '；共享 worktree 哈希变化！')));
process.exitCode = failed.length === 0 && intact ? 0 : 1;
