#!/usr/bin/env node
/**
 * secondary-page-layout-unification · 修复后（post-repair）一次跑完的命令清单（t3 · 预置）
 *
 * 为什么预置成脚本而不是一张 markdown 清单：这 8 步之间有**依赖与顺序**（两份 verify-site 报告
 * 是后面三步提取/核对/判定的输入），而且每一步都有**期望值**（哪一步必须 exit 0、哪一步必须 exit≠0）。
 * 写成脚本之后，"按期望判定"这件事不需要人盯着终端；原始日志一律落盘。
 *
 * 前置：captain 给出绿灯（= `scripts/tools/verify-site.js` 的修复已定稿）。脚本**自己不做**
 * 绿灯判断，也不改任何生产源码；它只跑命令、收读数、按期望判定。
 *
 * 验收标准（captain 2026-10-06 更正后的唯一口径，见 t3/README.md §7；
 * t14 起窄柱判据改为**并集**，t18 已把本脚本与两个消费者适配过来）：
 *   · 窄码 = **`note-narrow`（盒宽窄，48 条）∪ `note-ink-narrow`（字迹窄，108 条）**，
 *     即接受码集合 `/^note-(ink-)?narrow$/`；`note-hidden-text` 不算窄。
 *   · `--dir=dist.baseline`（改动前产物）：窄码命中 **156 条 / 48 页**，
 *     与 `caughtByOldCriteria ∪ onlyNewTruth` **逐条相同**；`alreadyFine` 245 条与
 *     `pagesWithNotesButNoNarrowNotes` 57 页**零误报**；报告里必须出现**条级容器**；
 *   · `--dir=dist`（改动后产物）：**0 条 / 0 页**；
 *   · Full Gate 第 47/48 步在新版 verify-site.js 上重跑必须绿，且 summary 里带上新的 sha256。
 *
 * 用法：
 *   node research/_raw/secondary-page-layout-unification/t3/run-post-repair.cjs --dry-run
 *   node research/_raw/secondary-page-layout-unification/t3/run-post-repair.cjs
 * 退出码：0 = 全部按期望（可以交付）；非 0 = 有一步不符（日志与 summary 里写明是哪一步）。
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..', '..', '..');
const E = 'research/_raw/secondary-page-layout-unification';
const REL = {
  verifySite: 'scripts/tools/verify-site.js',
  geometry: `${E}/geometry`,
  mutations: `${E}/mutations-real`,
  gate: `${E}/gate`,
  t3: `${E}/t3`
};
const abs = rel => path.join(ROOT, rel);
const P = {
  greenReport: `${REL.geometry}/after-verify.json`,
  greenMutations: `${REL.geometry}/mutations.json`,
  greenMutationsCopy: `${REL.mutations}/mutations-verify-site-green.json`,
  m0Report: `${REL.mutations}/M0-baseline.json`,
  m0Mutations: `${REL.mutations}/mutations.json`,
  m0MutationsCopy: `${REL.mutations}/mutations-verify-site-M0.json`,
  m0Summary: `${REL.mutations}/M0-baseline-summary.json`,
  truth: `${REL.geometry}/truth-401.json`,
  checkGreen: `${REL.geometry}/gate-vs-truth-green.json`,
  checkBaseline: `${REL.geometry}/gate-vs-truth-baseline.json`,
  manifestBefore: `${REL.t3}/post-repair-dist-before.sha256.txt`,
  manifestAfter: `${REL.t3}/post-repair-dist-after.sha256.txt`,
  summary: `${REL.t3}/post-repair-summary.json`
};
const DRY = process.argv.includes('--dry-run');
const sha256 = rel => (fs.existsSync(abs(rel)) ? crypto.createHash('sha256').update(fs.readFileSync(abs(rel))).digest('hex') : null);

const steps = [
  {
    id: 'P0',
    what: '产物 sha256 清单（**跑任何 verify-site 之前**）—— 用来证明内存变异零磁盘污染',
    args: [`${E}/build/dist-manifest.cjs`, '--dir=dist', `--out=${P.manifestBefore}`],
    log: `${REL.geometry}/08a-manifest-before.log`,
    expect: exit => exit === 0
  },
  {
    id: 'P1',
    what: '改动后产物的权威读数：verify-site.js --dir=dist（整轮必须 0 失败）',
    args: ['scripts/tools/verify-site.js', '--dir=dist', `--json=${P.greenReport}`],
    log: `${REL.geometry}/07-after-verify-green.log`,
    expect: exit => exit === 0,
    extra: () => {
      const report = JSON.parse(fs.readFileSync(abs(P.greenReport), 'utf8'));
      return { reportTotal: report.total, reportFailed: report.failed, zeroFailures: report.failed === 0 };
    }
  },
  {
    id: 'P2',
    what: '产物 sha256 清单（跑完 verify-site 之后）并与 P0 比对 ⇒ 内存变异没有写盘',
    args: [`${E}/build/dist-manifest.cjs`, '--dir=dist', `--out=${P.manifestAfter}`],
    log: `${REL.geometry}/08b-manifest-after.log`,
    expect: exit => exit === 0,
    extra: () => ({ distIdentical: fs.readFileSync(abs(P.manifestBefore), 'utf8') === fs.readFileSync(abs(P.manifestAfter), 'utf8') })
  },
  {
    id: 'P4',
    what: '把 §22c 的变异读数拆成每条牙一个 JSON（M1–M4 / M6 / M7 / M6 正对照 / M5 复用）',
    args: [`${REL.mutations}/extract-mutations.cjs`, `--report=${P.greenReport}`, `--mutations=${P.greenMutations}`,
      '--dir=dist', `--manifest-before=${P.manifestBefore}`, `--manifest-after=${P.manifestAfter}`,
      `--out-dir=${REL.mutations}`, '--label=real-dist'],
    log: `${REL.mutations}/10-extract.log`,
    expect: exit => exit === 0,
    pre: () => {
      if (!fs.existsSync(abs(P.greenMutations))) return `${P.greenMutations} 不存在（verify-site.js 没写出来）`;
      fs.copyFileSync(abs(P.greenMutations), abs(P.greenMutationsCopy));
      return null;
    }
  },
  {
    id: 'P5',
    what: 'M0 反证：verify-site.js --dir=dist.baseline 必须红（exit≠0）且报出窄码（note-narrow ∪ note-ink-narrow）',
    args: ['scripts/tools/verify-site.js', '--dir=dist.baseline', `--json=${P.m0Report}`],
    log: `${REL.mutations}/11-M0-baseline.log`,
    expect: exit => exit !== 0
  },
  {
    id: 'P6',
    what: 'M0 逐页清单落盘（命中 48 页 / 156 条？页集合与真值逐条比对）',
    args: results => [`${REL.mutations}/extract-m0.cjs`, `--report=${P.m0Report}`,
      `--exit=${results.find(row => row.id === 'P5').exitCode}`,
      `--log=${REL.mutations}/11-M0-baseline.log`, '--dir=dist.baseline', `--out=${P.m0Summary}`],
    log: `${REL.mutations}/12-extract-m0.log`,
    expect: exit => exit === 0,
    pre: () => {
      if (!fs.existsSync(abs(P.m0Mutations))) return `${P.m0Mutations} 不存在`;
      fs.copyFileSync(abs(P.m0Mutations), abs(P.m0MutationsCopy));
      return null;
    }
  },
  {
    id: 'P7',
    what: '集合级核对（绿轮）：新 §22c 在 dist 上必须 0 条 / 0 页、245 条对照组零误报',
    args: [`${REL.geometry}/gate-vs-truth.cjs`, `--report=${P.greenReport}`, '--expect=green',
      `--truth=${P.truth}`, '--label=post-repair-green', `--out=${P.checkGreen}`],
    log: `${REL.geometry}/10-gate-vs-truth-green.log`,
    expect: exit => exit === 0
  },
  {
    id: 'P8',
    what: '集合级核对（基线轮）：新 §22c 在 dist.baseline 上必须 156 条 / 48 页逐条相同、零误报、且有**条级容器**',
    args: [`${REL.geometry}/gate-vs-truth.cjs`, `--report=${P.m0Report}`, '--expect=baseline',
      `--truth=${P.truth}`, '--label=post-repair-baseline', `--out=${P.checkBaseline}`],
    log: `${REL.geometry}/11-gate-vs-truth-baseline.log`,
    expect: exit => exit === 0,
    extra: () => {
      const out = JSON.parse(fs.readFileSync(abs(P.checkBaseline), 'utf8'));
      return {
        noteLevelContainer: out.containers.noteLevel,
        observedNarrowNotes: out.observed.narrowNoteCount,
        observedNarrowPages: out.observed.narrowRouteCount,
        missed: out.diff.missedNoteCount,
        falsePositive: out.diff.falsePositiveCount
      };
    }
  },
  {
    id: 'P9',
    what: 'Full Gate 第 47/48 步在修复后的 verify-site.js 上重跑（按步骤序号增量合并 summary）',
    args: [`${REL.gate}/run-full-gate.cjs`, '--only=47,48'],
    log: `${REL.gate}/03-browser-rerun.txt`,
    expect: exit => exit === 0
  }
];

if (DRY) {
  console.log(`修复后要跑的 ${steps.length} 步（串行；每一步的原始 stdout/stderr 直接落盘）：\n`);
  for (const step of steps) {
    console.log(`${step.id}. ${step.what}`);
    console.log(typeof step.args === 'function'
      ? '    $ node …（参数在运行时确定：--exit=<P5 的真实退出码>）'
      : `    $ node ${step.args.join(' ')}`);
    console.log(`    log → ${step.log}`);
  }
  console.log('\n期望：P0/P1/P2/P4/P6/P7/P8/P9 exit=0；P5 exit≠0（改动前产物必须红）。');
  process.exit(0);
}

const results = [];
let fatal = false;
console.log(`修复后重跑：verify-site.js sha256 = ${String(sha256(REL.verifySite)).slice(0, 16)}…`);
for (const step of steps) {
  if (fatal) { results.push({ id: step.id, what: step.what, status: 'skipped', reason: '前一步未按期望通过（fail-fast）' }); continue; }
  const logPath = abs(step.log);
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  let preError = null;
  if (step.pre) preError = step.pre();
  const args = typeof step.args === 'function' ? step.args(results) : step.args;
  const fd = fs.openSync(logPath, 'w');
  fs.writeSync(fd, `# ${step.id} ${step.what}\n# $ node ${args.join(' ')}\n# at ${new Date().toISOString()} · verify-site.js sha256 ${sha256(REL.verifySite)}\n\n`);
  const started = Date.now();
  const outcome = spawnSync(process.execPath, args, { cwd: ROOT, env: process.env, stdio: ['ignore', fd, fd] });
  fs.closeSync(fd);
  const exit = outcome.status === null ? -1 : outcome.status;
  let extra = null;
  let extraError = null;
  try { if (step.extra) extra = step.extra(); } catch (error) { extraError = String(error.message || error); }
  const ok = !preError && !extraError && step.expect(exit) && (extra ? !Object.values(extra).some(value => value === false) : true);
  results.push({
    id: step.id, what: step.what, command: `node ${args.join(' ')}`, exitCode: exit,
    log: step.log, ms: Date.now() - started, preError, extra, extraError,
    status: ok ? 'passed' : 'failed'
  });
  console.log(`${step.id} ${ok ? '✓' : '✗'} exit=${exit} (${((Date.now() - started) / 1000).toFixed(1)}s) ${step.what}`);
  if (preError) console.log(`     ⚠ ${preError}`);
  if (!ok) { fatal = true; console.log(`     ✗ ${step.log}`); }
}

const summary = {
  at: new Date().toISOString(),
  verifySiteSha256: sha256(REL.verifySite),
  total: steps.length,
  passed: results.filter(row => row.status === 'passed').length,
  failed: results.filter(row => row.status === 'failed').length,
  skipped: results.filter(row => row.status === 'skipped').length,
  acceptance: {
    'dist 上 0 条 / 0 页': results.find(row => row.id === 'P7') ? results.find(row => row.id === 'P7').status : null,
    'dist.baseline 上 156 条 / 48 页逐条相同 + 零误报 + 有**条级容器**': results.find(row => row.id === 'P8') ? results.find(row => row.id === 'P8').status : null,
    'M0 红（exit≠0 且窄码>0）': results.find(row => row.id === 'P5') ? results.find(row => row.id === 'P5').status : null,
    'Full Gate 47/48 重跑绿': results.find(row => row.id === 'P9') ? results.find(row => row.id === 'P9').status : null
  },
  results
};
fs.writeFileSync(abs(P.summary), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
console.log(`\n${fatal ? '❌' : '✅'} 修复后重跑：${summary.passed}/${summary.total} 步按期望 · verify-site.js sha256 ${summary.verifySiteSha256}`);
console.log(`summary: ${P.summary}`);
process.exit(fatal ? 1 : 0);
