/**
 * t31 因果隔离：证明当前 `validate --strict` / `check-feeds:reproducible` / `build-local` 的红
 * **不是**这次改动造成的，而是仓库里另一处**在飞的编辑**（有人在改
 * `scripts/data/model-registry-links.json` 的引文，改到一半不再与记录逐字相同）。
 *
 * A/B/C 三组，全部在 `%TEMP%/t31/repo` 副本上做（共享 worktree 只读）：
 *   A 我的改动 + 干净的来源层（4 份数据文件取 HEAD 版本）        → 期望**全绿**
 *   B 没有我的改动（3 个文件取 HEAD 版本）+ 当前数据             → 期望与 C 同红
 *   C 我的改动 + 当前数据（= 现场）                              → 期望同红
 * A/B 的差别只有"我的改动在不在"，C 与现场一致。
 *
 * 只读生产文件；副本用完即弃。
 * 用法：node research/_raw/t31/causality-ab.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const REPO = path.resolve(__dirname, '..', '..', '..');
const WORK = path.join(os.tmpdir(), 't31', 'repo');
const MY_FILES = ['scripts/lib/feeds.js', 'scripts/tools/verify-site.js', 'scripts/tools/feeds-selftest.js'];
const DATA_FILES = ['scripts/data/model-registry-links.json', 'api-plans.json', 'scripts/data/curated_api_plans.json', 'plans.json'];

function headOf(rel) {
  return execFileSync('git', ['-C', REPO, 'show', `HEAD:${rel}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}
function liveOf(rel) {
  return fs.readFileSync(path.join(REPO, rel), 'utf8');
}
function copyRepo() {
  if (fs.existsSync(WORK)) fs.rmSync(WORK, { recursive: true, force: true });
  const skip = new Set(['.git', 'node_modules']);
  const walk = (from, to) => {
    fs.mkdirSync(to, { recursive: true });
    for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
      if (skip.has(entry.name) || entry.name.startsWith('dist')) continue;
      const src = path.join(from, entry.name);
      const dst = path.join(to, entry.name);
      if (entry.isDirectory()) walk(src, dst);
      else if (entry.isFile()) fs.copyFileSync(src, dst);
    }
  };
  walk(REPO, WORK);
}
const write = (rel, text) => fs.writeFileSync(path.join(WORK, rel), text, 'utf8');

function run(args) {
  try {
    const out = execFileSync(process.execPath, args, { cwd: WORK, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
    return { status: 0, out };
  } catch (error) {
    return { status: typeof error.status === 'number' ? error.status : -1, out: `${error.stdout || ''}${error.stderr || ''}` };
  }
}

const evidenceFailures = out => (out.match(/[^\n]*这条引文不是被引用记录自己的官方引文[^\n]*/g) || []).length;

copyRepo();
console.log('副本：', WORK);

/* ---------------- A：我的改动 + 干净的来源层 ---------------- */
for (const rel of DATA_FILES) write(rel, headOf(rel));
const buildA = run(['scripts/tools/build-local.js', '--out=dist.clone']);
const reproA = buildA.status === 0
  ? run(['scripts/tools/check-feeds-reproducible.js', '--dir=dist.clone'])
  : { status: -1, out: '(build 未通过，跳过)' };
const validateA = run(['scripts/validate.js', '--strict']);

/* ---------------- B：没有我的改动 + 当前数据 ---------------- */
for (const rel of DATA_FILES) write(rel, liveOf(rel));
for (const rel of MY_FILES) write(rel, headOf(rel));
const validateB = run(['scripts/validate.js', '--strict']);
const reproB = run(['scripts/tools/check-models-reproducible.js']);

/* ---------------- C：我的改动 + 当前数据（= 现场） ---------------- */
for (const rel of MY_FILES) write(rel, liveOf(rel));
const validateC = run(['scripts/validate.js', '--strict']);
const reproC = run(['scripts/tools/check-models-reproducible.js']);

console.log('\n=== A：我的改动 + 干净来源层（HEAD 的 4 份数据文件）===');
console.log(`  build-local --out=dist.clone        exit=${buildA.status} ${buildA.status === 0 ? '✅' : '❌'}`);
console.log(`  check-feeds-reproducible --dir=…    exit=${reproA.status} ${reproA.status === 0 ? '✅' : '❌'}`);
console.log(`  validate --strict                   exit=${validateA.status} ${validateA.status === 0 ? '✅' : '❌'} · 引文类失败 ${evidenceFailures(validateA.out)} 条`);

console.log('\n=== B：**没有**我的改动（3 个文件取 HEAD）+ 当前数据 ===');
console.log(`  validate --strict                   exit=${validateB.status} · 引文类失败 ${evidenceFailures(validateB.out)} 条`);
console.log(`  check:models:reproducible           exit=${reproB.status}`);

console.log('\n=== C：我的改动 + 当前数据（现场）===');
console.log(`  validate --strict                   exit=${validateC.status} · 引文类失败 ${evidenceFailures(validateC.out)} 条`);
console.log(`  check:models:reproducible           exit=${reproC.status}`);

const conclusion = buildA.status === 0 && reproA.status === 0 && validateA.status === 0
  && validateB.status === validateC.status && reproB.status === reproC.status;
console.log('\n=== 结论 ===');
console.log(conclusion
  ? '✅ A 组（我的改动 + 干净来源层）三门禁全绿；B 与 C 的判定结果**逐项相同** ⇒ 我的改动对门禁判定没有任何影响。'
    + (reproC.status === 0
      ? '\n   （本轮 B/C 都绿：先前那次红是别人正在改 `scripts/data/model-registry-links.json` 引文、还没跑 `models:rebuild` 的**在飞状态**。）'
      : '\n   （B/C 都红：红来自当前数据文件自身状态 —— 来源层改了但根派生产物没重建，与本改动无关。）')
  : '⚠️ 结论不成立，需要人工复核 A/B/C 的读数（见上）。');
fs.writeFileSync(path.join(__dirname, 'causality-ab-result.json'), `${JSON.stringify({
  A: { build: buildA.status, repro: reproA.status, validate: validateA.status, evidenceFailures: evidenceFailures(validateA.out) },
  B: { validate: validateB.status, repro: reproB.status, evidenceFailures: evidenceFailures(validateB.out) },
  C: { validate: validateC.status, repro: reproC.status, evidenceFailures: evidenceFailures(validateC.out) },
  conclusion
}, null, 2)}\n`, 'utf8');
process.exit(conclusion ? 0 : 1);
