#!/usr/bin/env node
/**
 * secondary-page-layout-unification · T21 修复轮 4 后的证据复跑（verification）
 *
 * 前置：t19（修复轮 4）+ t20（复审 round 4）双通过。标的 = scripts/tools/verify-site.js
 * 交回值 `fd3c9a3090dca11b…`（跑前/跑后各记一次，不等即作废）。
 *
 * 一次跑完的 15 步（每步：命令 / 期望 / 原始日志落盘 / 读数额外落盘）：
 *   T0  前置状态（标的 sha、冻结源码 sha、dist 清单）
 *   T1  verify-site --dir=dist（expect 0；401 条逐条有读数；@760 样本集在判逐行字迹）
 *   T2  dist 清单复算（与 T0 逐字节相同 ⇒ 内存变异零磁盘污染）
 *   T3  extract-mutations → M1–M12 逐条 JSON（M11 必咬 note-ink-narrow、M12 必咬 note-hidden-text）
 *   T4  verify-site --dir=dist.baseline（expect ≠0）
 *   T5  extract-m0 → 逐页清单 + 并集码分布
 *   T6  gate-vs-truth --expect=green（期望 pass）
 *   T7  gate-vs-truth --expect=baseline（期望 pass：156 条 / 48 页逐条相同、零误报）
 *   T8  R3-1 复现：scratch 副本注入 @media(max-width:760px) 版 grid ⇒ expect ≠0 且命中 note-ink-narrow
 *   T9  对照：不注入的同副本 ⇒ expect 0
 *   T10 字节对账（117 非 HTML sha256 / 186 HTML 去 style / 冻结源码 sha）
 *   T11 check-ci-consistency --expect-checks=38
 *   T12 Full Gate 静态步（现场解析 action.yml）
 *   T13 Full Gate --only=47,48（合并 summary；记 47/48 的断言数与失败数）
 *   T14 收尾：标的 sha 未变 + dist 清单未变 + 汇总 JSON
 *
 * 用法：node research/_raw/secondary-page-layout-unification/t21/run-t21.cjs [--dry-run]
 * 退出码：0 = 全部按期望；非 0 = 有步骤不符（summary 里写明）。
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..', '..', '..');
const E = 'research/_raw/secondary-page-layout-unification';
const T = `${E}/t21`;
const abs = rel => path.join(ROOT, rel);
const sha256 = rel => crypto.createHash('sha256').update(fs.readFileSync(abs(rel))).digest('hex');
const readJson = rel => JSON.parse(fs.readFileSync(abs(rel), 'utf8'));

const TARGET = 'scripts/tools/verify-site.js';
const T19_HANDOVER = 'fd3c9a3090dca11bbe6c34342505506bb44f4720c39fe4b18f4d7c23481f46d5';
const FROZEN = {
  'index.html': '8442f14dd397276e67ea71a64aef9f86b59d1f603aa04f15ecfc402056d663b9',
  'scripts/tools/build-local.js': '264912c27174f837453bcafc1ade0422d46dc606e3036ba94e4b8525b149b348'
};
const GRID_RULE = '@media (max-width:760px){.snote{display:grid;grid-template-columns:minmax(0,70ch) 1fr}}';
// R3-1 的期望命中集合（t19 主张 · t20 独立复现的 6 条）
const R31_KEYS = ['changes/#0', 'changes/#1', 'changes/#2', 'changes/#4', 'changes/#8', 'changes/#12'];

const P = {
  distReport: `${T}/geometry/after-verify.json`,
  distMutations: `${T}/geometry/mutations.json`,
  baselineReport: `${T}/mutations-real/M0-baseline.json`,
  m0Summary: `${T}/mutations-real/M0-baseline-summary.json`,
  checkGreen: `${T}/geometry/gate-vs-truth-green.json`,
  checkBaseline: `${T}/geometry/gate-vs-truth-baseline.json`,
  manifestBefore: `${T}/dist-before.sha256.txt`,
  manifestAfter: `${T}/dist-after.sha256.txt`,
  scratchInjected: `${T}/scratch/grid760-changes`,
  scratchClean: `${T}/scratch/clean`,
  scratchReport: `${T}/scratch/grid760-report.json`,
  gateOut: `${T}/gate/steps`,
  summary: `${T}/t21-summary.json`,
  log: `${T}/run-t21.log`
};

const log = [];
const W = line => log.push(line === undefined ? '' : String(line));
const flush = () => fs.writeFileSync(abs(P.log), `${log.join('\n')}\n`, 'utf8');
const tailOf = (rel, lines = 3) => fs.readFileSync(abs(rel), 'utf8').trimEnd().split('\n').slice(-lines);

function runNode(args, logRel) {
  fs.mkdirSync(path.dirname(abs(logRel)), { recursive: true });
  const fd = fs.openSync(abs(logRel), 'w');
  const outcome = spawnSync(process.execPath, args, { cwd: ROOT, env: process.env, stdio: ['ignore', fd, fd] });
  fs.closeSync(fd);
  return outcome.status === null ? -1 : outcome.status;
}

/** 目录复制（产品副本只落在 t21/scratch/** 下，绝不动 dist/dist.baseline） */
function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) copyTree(src, dst);
    else fs.copyFileSync(src, dst);
  }
}

const steps = [];
const results = [];
let fatal = false;

function step(spec) {
  steps.push(spec);
  if (DRY) return;
  if (fatal) { results.push({ id: spec.id, what: spec.what, status: 'skipped', reason: '前一步未按期望通过（fail-fast）' }); return; }
  const args = typeof spec.args === 'function' ? spec.args() : spec.args;
  if (spec.pre) { const problem = spec.pre(); if (problem) { W(`${spec.id} ✗ 前置失败：${problem}`); results.push({ id: spec.id, what: spec.what, status: 'failed', reason: problem }); fatal = true; flush(); return; } }
  const started = Date.now();
  const exit = spec.run ? spec.run() : runNode(args, spec.log);
  let extra = null;
  let extraError = null;
  let verdictNote = null;
  try { if (spec.extra) extra = spec.extra(); } catch (error) { extraError = String(error.message || error); }
  let ok = false;
  if (extraError) {
    ok = false;
  } else if (!spec.expect(exit)) {
    verdictNote = `退出码 ${exit} 不在期望内`;
    ok = false;
  } else if (spec.expectExtra) {
    // 显式断言：extra 里出现 false 不一定是失败（T4 的 sample760Ok=false 正是期望读数）
    try {
      const verdict = spec.expectExtra(extra);
      ok = verdict === true;
      if (!ok) verdictNote = typeof verdict === 'string' ? verdict : 'expectExtra 判否';
    } catch (error) { extraError = String(error.message || error); ok = false; }
  } else {
    ok = true;
  }
  results.push({
    id: spec.id, what: spec.what, command: spec.command || `node ${args.join(' ')}`, exitCode: exit,
    log: spec.log, ms: Date.now() - started, extra, extraError, verdictNote, status: ok ? 'passed' : 'failed'
  });
  W(`${spec.id} ${ok ? '✓' : '✗'} exit=${exit} (${((Date.now() - started) / 1000).toFixed(1)}s) ${spec.what}`);
  if (extra) W(`     ${JSON.stringify(extra)}`);
  if (extraError) W(`     ⚠ extraError: ${extraError}`);
  if (verdictNote) W(`     ⚠ 判否：${verdictNote}`);
  if (!ok) { fatal = true; W(`     ✗ ${spec.log}`); }
  flush();
}

const DRY = process.argv.includes('--dry-run');
fs.mkdirSync(abs(T), { recursive: true });

W('# T21 修复轮 4 后的证据复跑');
W(`# 开始 ${new Date().toISOString()}`);
W(`# 标的 ${TARGET}`);
W(`# t19 交回值 ${T19_HANDOVER}`);
W('');

/* ---------------------------------------------------------------- T0 */
W('===== T0 前置状态 =====');
const shaBefore = sha256(TARGET);
W(`verify-site.js sha256 = ${shaBefore}（等于 t19 交回值：${shaBefore === T19_HANDOVER}）`);
for (const [file, want] of Object.entries(FROZEN)) {
  const got = sha256(file);
  W(`冻结源码 ${file} = ${got}（与 t1 冻结值相同：${got === want}）`);
}
flush();

step({
  id: 'T0', what: 'dist 全树 sha256 清单（跑任何套件之前）',
  args: [`${E}/build/dist-manifest.cjs`, '--dir=dist', `--out=${P.manifestBefore}`],
  log: `${T}/logs/T0-manifest-before.log`,
  expect: exit => exit === 0
});

/* ---------------------------------------------------------------- T1 dist */
step({
  id: 'T1', what: 'verify-site --dir=dist（改动后产物：应为 0 失败 / 0 违规码 / 401 条逐条有读数）',
  args: ['scripts/tools/verify-site.js', '--dir=dist', `--json=${P.distReport}`],
  log: `${T}/logs/T1-dist.log`,
  expect: exit => exit === 0,
  expectExtra: e => (e.reportTotal === 848 && e.reportFailed === 0 && e.zeroFailures === true
    && e.layoutViolations === 0 && e.notesWithAnyCode === 0
    && e.layoutNotes === 401 && e.layoutNotesAt1600 === 401 && e.everyNoteHasReadings === true
    && e.sample760Ok === true && e.hollowGuardOk === true)
    || `dist 绿轮读数不符：${JSON.stringify({ total: e.reportTotal, failed: e.reportFailed, codes: e.layoutViolations, notes: e.layoutNotes, at1600: e.layoutNotesAt1600, noteReadings: e.everyNoteHasReadings, sample760: e.sample760Ok, hollow: e.hollowGuardOk })}`,
  extra: () => {
    const report = readJson(P.distReport);
    const notes = report.metrics.layoutNotes || [];
    const notes1600 = report.metrics.layoutNotesAt1600 || [];
    const sampleCheck = (report.checks || []).find(check => /§22c @760 样本集/.test(check.name));
    const hollow = (report.checks || []).find(check => /反空洞守卫自检/.test(check.name));
    return {
      reportTotal: report.total, reportFailed: report.failed,
      layoutViolations: (report.metrics.layoutViolations || []).length,
      layoutNotes: notes.length, layoutNotesAt1600: notes1600.length,
      everyNoteHasReadings: notes.length > 0 && notes.every(row => Number.isInteger(row.index) && typeof row.route === 'string' && Array.isArray(row.codes)),
      notesWithAnyCode: notes.filter(row => (row.codes || []).length > 0).length,
      sample760Ok: Boolean(sampleCheck && sampleCheck.ok),
      sample760Detail: sampleCheck ? String(sampleCheck.detail).slice(0, 400) : null,
      sample760Name: sampleCheck ? sampleCheck.name : null,
      hollowGuardOk: Boolean(hollow && hollow.ok),
      hollowGuardDetail: hollow ? String(hollow.detail).slice(0, 300) : null,
      zeroFailures: report.failed === 0
    };
  }
});

/* ---------------------------------------------------------------- T2 */
step({
  id: 'T2', what: 'dist 清单复算并与 T0 比对（内存变异零磁盘污染）',
  args: [`${E}/build/dist-manifest.cjs`, '--dir=dist', `--out=${P.manifestAfter}`],
  log: `${T}/logs/T2-manifest-after.log`,
  expect: exit => exit === 0,
  expectExtra: e => e.distIdentical === true || 'dist 清单跑前跑后不一致（内存变异污染了磁盘）',
  extra: () => ({ distIdentical: fs.readFileSync(abs(P.manifestBefore), 'utf8') === fs.readFileSync(abs(P.manifestAfter), 'utf8') })
});

/* ---------------------------------------------------------------- T3 */
step({
  id: 'T3', what: 'extract-mutations → M1–M12 逐条 JSON（M11 咬 note-ink-narrow、M12 咬 note-hidden-text）',
  args: [`${E}/mutations-real/extract-mutations.cjs`, `--report=${P.distReport}`, `--mutations=${P.distMutations}`,
    '--dir=dist', `--manifest-before=${P.manifestBefore}`, `--manifest-after=${P.manifestAfter}`,
    `--out-dir=${T}/mutations-real`, '--label=t21-dist'],
  log: `${T}/logs/T3-extract-mutations.log`,
  expect: exit => exit === 0,
  expectExtra: e => (e.ids === 'M1,M2,M3,M4,M6,M7,M8,M9a,M9b,M10,M11,M12,M6-control'
    && e.allHits === true && e.m11Hit === true && e.m12Hit === true && e.zeroDiskPollution === true)
    || `M1–M12 读数不符：${JSON.stringify(e)}`,
  extra: () => {
    const summary = readJson(`${T}/mutations-real/M-summary.json`);
    const byId = new Map(summary.rows.map(row => [row.id, row]));
    const m11 = byId.get('M11');
    const m12 = byId.get('M12');
    return {
      ids: summary.rows.map(row => row.id).join(','),
      m11Observed: m11 ? m11.observed.join(',') : null, m11Hit: Boolean(m11 && m11.hit),
      m12Observed: m12 ? m12.observed.join(',') : null, m12Hit: Boolean(m12 && m12.hit),
      zeroDiskPollution: Boolean(summary.zeroDiskPollution && summary.zeroDiskPollution.identical),
      allHits: summary.rows.every(row => row.hit !== false)
    };
  }
});

/* ---------------------------------------------------------------- T4/T5 baseline */
step({
  id: 'T4', what: 'verify-site --dir=dist.baseline（改动前产物：必须红）',
  args: ['scripts/tools/verify-site.js', '--dir=dist.baseline', `--json=${P.baselineReport}`],
  log: `${T}/logs/T4-baseline.log`,
  expect: exit => exit !== 0,
  expectExtra: e => {
    const sweep = e.narrowSweep ? JSON.parse(e.narrowSweep) : {};
    return (e.reportTotal === 848 && e.reportFailed > 0 && e.failingNon22c === 0
      && e.sample760Ok === false && e.sample360Ok === true
      && sweep.narrowNotes === 156 && sweep.narrowNotePages === 48 && sweep.narrowNotesAt1600 === 156)
      || `baseline 红轮读数不符：${JSON.stringify({ total: e.reportTotal, failed: e.reportFailed, non22c: e.failingNon22c, sample760: e.sample760Ok, sample360: e.sample360Ok, sweep })}`;
  },
  extra: () => {
    const report = readJson(P.baselineReport);
    const failing = (report.checks || []).filter(check => !check.ok);
    const sample760 = (report.checks || []).find(check => /§22c @760 样本集/.test(check.name));
    const sample360 = (report.checks || []).find(check => /§22c @360 样本集/.test(check.name));
    return {
      reportTotal: report.total, reportFailed: report.failed,
      failingNon22c: failing.filter(check => !check.name.startsWith('§22c')).length,
      sample760Ok: Boolean(sample760 && sample760.ok),
      sample760Detail: sample760 ? String(sample760.detail).slice(0, 340) : null,
      sample360Ok: Boolean(sample360 && sample360.ok),
      sample360Detail: sample360 ? String(sample360.detail).slice(0, 220) : null,
      narrowSweep: JSON.stringify(report.metrics.layoutSweep && {
        narrowNotes: report.metrics.layoutSweep.narrowNotes,
        narrowNotePages: report.metrics.layoutSweep.narrowNotePages,
        narrowNotesAt1600: report.metrics.layoutSweep.narrowNotesAt1600
      })
    };
  }
});

step({
  id: 'T5', what: 'extract-m0 → 逐页清单 + 并集码分布',
  args: () => {
    const t4 = results.find(row => row.id === 'T4') || {};
    return [`${E}/mutations-real/extract-m0.cjs`, `--report=${P.baselineReport}`,
      `--exit=${t4.exitCode}`, `--log=${T}/logs/T4-baseline.log`, '--dir=dist.baseline', `--out=${P.m0Summary}`];
  },
  log: `${T}/logs/T5-extract-m0.log`,
  expect: exit => exit === 0,
  expectExtra: e => (e.verdict === 'pass' && e.narrowNotes === 156 && e.narrowPages === 48)
    || `extract-m0 读数不符：${JSON.stringify(e)}`,
  extra: () => {
    const m0 = readJson(P.m0Summary);
    return {
      narrowPages: m0.narrowNoteCount, narrowNotes: m0.narrowNoteKeyCount,
      pageCodeTally: JSON.stringify(m0.narrowCodeTally), noteCodeTally: JSON.stringify(m0.narrowNoteCodeTally),
      verdict: m0.verdict
    };
  }
});

/* ---------------------------------------------------------------- T6/T7 集合级 */
step({
  id: 'T6', what: 'gate-vs-truth --expect=green（dist：0 条 / 0 页、245 条对照组零误报）',
  args: [`${E}/geometry/gate-vs-truth.cjs`, `--report=${P.distReport}`, '--expect=green',
    `--truth=${E}/geometry/truth-401.json`, '--label=t21-green', `--out=${P.checkGreen}`],
  log: `${T}/logs/T6-gate-vs-truth-green.log`,
  expect: exit => exit === 0,
  expectExtra: e => (e.verdict === 'pass' && e.narrowNotes === 0 && e.falsePositive === 0)
    || `gate-vs-truth 绿轮读数不符：${JSON.stringify(e)}`,
  extra: () => {
    const out = JSON.parse(fs.readFileSync(abs(P.checkGreen), 'utf8'));
    return { verdict: out.verdict, narrowNotes: out.observed.narrowNoteCount, falsePositive: out.diff.falsePositiveCount, codeTally: JSON.stringify(out.observed.narrowCodeTally.noteLevel) };
  }
});

step({
  id: 'T7', what: 'gate-vs-truth --expect=baseline（dist.baseline：156 条 / 48 页逐条相同、零误报）',
  args: [`${E}/geometry/gate-vs-truth.cjs`, `--report=${P.baselineReport}`, '--expect=baseline',
    `--truth=${E}/geometry/truth-401.json`, '--label=t21-baseline', `--out=${P.checkBaseline}`],
  log: `${T}/logs/T7-gate-vs-truth-baseline.log`,
  expect: exit => exit === 0,
  expectExtra: e => (e.verdict === 'pass' && e.narrowNotes === 156 && e.narrowPages === 48
    && e.missed === 0 && e.falsePositive === 0)
    || `gate-vs-truth 集合级读数不符：${JSON.stringify(e)}`,
  extra: () => {
    const out = JSON.parse(fs.readFileSync(abs(P.checkBaseline), 'utf8'));
    return {
      verdict: out.verdict, narrowNotes: out.observed.narrowNoteCount, narrowPages: out.observed.narrowRouteCount,
      missed: out.diff.missedNoteCount, falsePositive: out.diff.falsePositiveCount,
      codeTally: JSON.stringify(out.observed.narrowCodeTally.noteLevel), noteContainer: out.containers.noteLevel
    };
  }
});

/* ---------------------------------------------------------------- T8/T9 R3-1 复现 */
step({
  id: 'T8', what: `R3-1 复现：scratch 副本注入 ${GRID_RULE} ⇒ 必须红且命中 note-ink-narrow`,
  args: ['scripts/tools/verify-site.js', `--dir=${P.scratchInjected}`, `--json=${P.scratchReport}`],
  log: `${T}/logs/T8-scratch-grid760.log`,
  pre: () => {
    fs.rmSync(abs(P.scratchInjected), { recursive: true, force: true });
    copyTree(abs('dist'), abs(P.scratchInjected));
    const file = path.join(abs(P.scratchInjected), 'changes', 'index.html');
    const html = fs.readFileSync(file, 'utf8');
    if (!/<\/style>/.test(html)) return 'changes/index.html 里没有 <style> 块，注入无处落脚';
    fs.writeFileSync(file, html.replace(/<\/style>/, `\n${GRID_RULE}\n</style>`), 'utf8');
    return fs.readFileSync(file, 'utf8').includes(GRID_RULE) ? null : '注入未落盘';
  },
  expect: exit => exit !== 0,
  expectExtra: e => (e.hitInk === true && e.reportFailed === 1 && e.sample760Ok === false
    && R31_KEYS.every(key => String(e.inkNarrowKeys).split(' ').includes(key)))
    || `注入后没咬到 note-ink-narrow：${JSON.stringify(e)}`,
  extra: () => {
    const report = readJson(P.scratchReport);
    const notes = report.metrics.layoutNotes || [];
    const failing = (report.checks || []).filter(check => !check.ok);
    // @760 样本集的违规码只出现在这条断言的 detail / items 里（layoutNotes 是 @1440 容器）
    const sample760 = (report.checks || []).find(check => /§22c @760 样本集/.test(check.name));
    const detail = sample760 ? String(sample760.detail) : '';
    const itemText = sample760 && Array.isArray(sample760.items) ? sample760.items.join(' | ') : '';
    const haystack = `${detail} ${itemText}`;
    const inkCodes = haystack.match(/note-ink-narrow/g) || [];
    const inkKeys = [...new Set((haystack.match(/[A-Za-z0-9_./-]+#\d+/g) || []))];
    return {
      reportTotal: report.total, reportFailed: report.failed,
      failingNames: failing.map(check => check.name.slice(0, 60)).join(' | '),
      sample760Ok: Boolean(sample760 && sample760.ok),
      inkNarrowCodesInDetail: inkCodes.length,
      inkNarrowKeys: inkKeys.join(' '),
      widestInDetail: [...new Set((haystack.match(/最宽一行 (\d+(?:\.\d+)?)px/g) || []).map(text => text.replace(/[^\d.]/g, '')))].join(','),
      detailHead: detail.slice(0, 460),
      hitInk: inkCodes.length > 0 && /changes\/#0/.test(haystack),
      notesWithCodesAt1440: notes.filter(row => (row.codes || []).length > 0).length
    };
  }
});

step({
  id: 'T9', what: '对照：同一份副本**不注入** ⇒ 必须绿（证明红来自注入）',
  args: ['scripts/tools/verify-site.js', `--dir=${P.scratchClean}`, `--json=${T}/scratch/clean-report.json`],
  log: `${T}/logs/T9-scratch-clean.log`,
  pre: () => {
    fs.rmSync(abs(P.scratchClean), { recursive: true, force: true });
    copyTree(abs('dist'), abs(P.scratchClean));
    return null;
  },
  expect: exit => exit === 0,
  expectExtra: e => (e.reportTotal === 848 && e.reportFailed === 0)
    || `对照组（未注入副本）竟然红了：${JSON.stringify(e)}`,
  extra: () => {
    const report = readJson(`${T}/scratch/clean-report.json`);
    return { reportTotal: report.total, reportFailed: report.failed };
  }
});

/* ---------------------------------------------------------------- T10 字节对账 */
step({
  id: 'T10', what: '字节对账：117 非 HTML sha256 + 186 HTML 去 <style> 逐字节 + 冻结源码 sha',
  run: () => {
    const a = runNode([`${E}/diff/nonhtml-sha256.cjs`, '--before=dist.baseline', '--after=dist', `--out=${T}/diff/nonhtml-sha256`], `${T}/logs/T10a-nonhtml.log`);
    const b = runNode([`${E}/diff/before-after-compare.cjs`, '--before=dist.baseline', '--after=dist', `--out=${T}/diff/before-after-compare.json`], `${T}/logs/T10b-html.log`);
    return a === 0 && b === 0 ? 0 : (a || b);
  },
  command: 'node diff/nonhtml-sha256.cjs + node diff/before-after-compare.cjs',
  log: `${T}/logs/T10-byte.log`,
  expect: exit => exit === 0,
  expectExtra: e => (e.nonHtmlCompared === 117 && e.nonHtmlDifferent === 0
    && e.htmlPages === 186 && e.htmlBodyIdentical === 186 && e.frozenSourceUnchanged === true)
    || `字节对账不符：${JSON.stringify(e)}`,
  extra: () => {
    const nonHtml = JSON.parse(fs.readFileSync(abs(`${T}/diff/nonhtml-sha256.json`), 'utf8'));
    const html = JSON.parse(fs.readFileSync(abs(`${T}/diff/before-after-compare.json`), 'utf8'));
    const frozenOk = Object.entries(FROZEN).every(([file, want]) => sha256(file) === want);
    return {
      nonHtmlCompared: nonHtml.compared, nonHtmlDifferent: nonHtml.different,
      htmlPages: html.stats.htmlPages, htmlBodyIdentical: html.stats.htmlBodyIdentical,
      styleDeltaAdded: html.styleDelta.distinctAdded.length, styleDeltaRemoved: html.styleDelta.distinctRemoved.length,
      frozenSourceUnchanged: frozenOk
    };
  }
});

/* ---------------------------------------------------------------- T11 ci */
step({
  id: 'T11', what: 'check-ci-consistency --expect-checks=38',
  args: ['scripts/tools/check-ci-consistency.js', '--expect-checks=38'],
  log: `${T}/logs/T11-ci-consistency.log`,
  expect: exit => exit === 0,
  extra: () => ({ lastLines: tailOf(`${T}/logs/T11-ci-consistency.log`, 2).join(' | ').slice(0, 240) })
});

/* ---------------------------------------------------------------- T12/T13 Full Gate */
step({
  id: 'T12', what: 'Full Gate 静态步（现场解析 .github/actions/gate/action.yml；--skip-browser 推迟 47/48）',
  args: [`${E}/gate/run-full-gate.cjs`, `--out=${P.gateOut}`, '--skip-browser'],
  log: `${T}/logs/T12-full-gate-static.log`,
  pre: () => { fs.rmSync(abs(P.gateOut), { recursive: true, force: true }); return null; },
  expect: exit => exit === 0,
  expectExtra: e => (e.stepsInAction >= 48 && e.failed === 0 && e.exitCode === 0)
    || `Full Gate 静态步读数不符：${JSON.stringify(e)}`,
  extra: () => {
    const summary = readJson(`${P.gateOut}/summary.json`);
    return { stepsInAction: summary.stepsInAction, executed: summary.executed, passed: summary.passed, failed: summary.failed, skipped: summary.skipped, exitCode: summary.exitCode };
  }
});

step({
  id: 'T13', what: 'Full Gate --only=47,48（真浏览器两步；合并 summary 并记断言数/失败数）',
  args: [`${E}/gate/run-full-gate.cjs`, `--out=${P.gateOut}`, '--only=47,48'],
  log: `${T}/logs/T13-full-gate-browser.log`,
  expect: exit => exit === 0,
  expectExtra: e => (e.failed === 0 && e.exitCode === 0
    && e.step47 === 'passed/exit=0' && e.step48 === 'passed/exit=0'
    && e.verifySiteShaAt47 === T19_HANDOVER.slice(0, 16) && e.verifySiteShaAt48 === T19_HANDOVER.slice(0, 16))
    || `Full Gate 47/48 读数不符：${JSON.stringify(e)}`,
  extra: () => {
    const summary = readJson(`${P.gateOut}/summary.json`);
    // 步骤日志名 = 现场 slugify(action.yml 里的步骤名)，不硬编码
    const line = (index) => {
      const prefix = String(index).padStart(2, '0');
      const file = fs.readdirSync(abs(P.gateOut)).find(name => name.startsWith(`${prefix}-`) && name.endsWith('.txt'));
      if (!file) return `（没有 ${prefix}-*.txt 日志）`;
      const rows = fs.readFileSync(abs(`${P.gateOut}/${file}`), 'utf8')
        .trimEnd().split('\n').filter(text => /验收 \d+ 项|❌/.test(text));
      return rows.slice(-1)[0] || '（未找到验收行）';
    };
    const step47 = summary.results.find(row => row.index === 47) || {};
    const step48 = summary.results.find(row => row.index === 48) || {};
    return {
      stepsInAction: summary.stepsInAction, executed: summary.executed, passed: summary.passed,
      failed: summary.failed, skipped: summary.skipped, exitCode: summary.exitCode,
      step47: `${step47.status}/exit=${step47.exitCode}`, step48: `${step48.status}/exit=${step48.exitCode}`,
      step47Assertions: line(47).slice(0, 60), step48Assertions: line(48).slice(0, 60),
      verifySiteShaAt47: String(step47.verifySiteSha256 || '').slice(0, 16),
      verifySiteShaAt48: String(step48.verifySiteSha256 || '').slice(0, 16),
      defaultSource: summary.results.filter(row => row.status === 'skipped').map(row => row.name).join(' | ')
    };
  }
});

/* ---------------------------------------------------------------- T14 */
if (DRY) {
  console.log(`T21 计划（${steps.length} 步）：`);
  const argsOf = spec => {
    if (spec.command) return spec.command;
    try {
      const args = typeof spec.args === 'function' ? spec.args() : spec.args;
      return `node ${args.join(' ')}`;
    } catch { return 'node …（参数运行时确定）'; }
  };
  for (const spec of steps) console.log(`  ${spec.id}  ${spec.what}\n      $ ${argsOf(spec)}\n      log → ${spec.log}`);
  process.exit(0);
}

W('');
W('===== T14 收尾 =====');
const shaAfter = sha256(TARGET);
W(`verify-site.js sha256：跑前 ${shaBefore} / 跑后 ${shaAfter}（相等：${shaBefore === shaAfter}；等于 t19 交回值：${shaAfter === T19_HANDOVER}）`);
const finalManifest = `${T}/dist-final.sha256.txt`;
runNode([`${E}/build/dist-manifest.cjs`, '--dir=dist', `--out=${finalManifest}`], `${T}/logs/T14-manifest-final.log`);
const distFinalIdentical = fs.readFileSync(abs(P.manifestBefore), 'utf8') === fs.readFileSync(abs(finalManifest), 'utf8');
W(`dist 清单（T0 vs 收尾）逐字节相同：${distFinalIdentical}`);

const passed = results.filter(row => row.status === 'passed').length;
const failedRows = results.filter(row => row.status === 'failed');
const summary = {
  task: 'T21 修复轮 4 后的证据复跑',
  at: new Date().toISOString(),
  target: TARGET, shaBefore, shaAfter, t19Handover: T19_HANDOVER,
  targetUnchanged: shaBefore === shaAfter, targetIsT19: shaAfter === T19_HANDOVER,
  distFinalIdentical,
  gridRule: GRID_RULE,
  total: steps.length, passed, failed: failedRows.length,
  acceptance: {
    '标的 sha 跑前跑后相等且等于 t19 交回值': shaBefore === shaAfter && shaAfter === T19_HANDOVER,
    'dist 绿轮': (results.find(row => row.id === 'T1') || {}).status === 'passed',
    'baseline 红轮 + 并集集合级': ((results.find(row => row.id === 'T4') || {}).status === 'passed')
      && ((results.find(row => row.id === 'T7') || {}).status === 'passed'),
    'M1–M12 变异牙': (results.find(row => row.id === 'T3') || {}).status === 'passed',
    'R3-1 复现': (results.find(row => row.id === 'T8') || {}).status === 'passed',
    '字节对账': (results.find(row => row.id === 'T10') || {}).status === 'passed',
    'Full Gate（含 47/48）': ((results.find(row => row.id === 'T12') || {}).status === 'passed')
      && ((results.find(row => row.id === 'T13') || {}).status === 'passed')
  },
  results
};
fs.writeFileSync(abs(P.summary), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
console.log(`${failedRows.length ? '❌' : '✅'} T21：${passed}/${steps.length} 步按期望 · 标的 sha ${shaAfter.slice(0, 16)}… 未变 · dist 清单未变 ${distFinalIdentical}`);
if (failedRows.length) failedRows.forEach(row => console.log(`   ✗ ${row.id} ${row.what} → ${row.log}`));
console.log(`summary: ${P.summary}`);
process.exit(failedRows.length ? 1 : 0);
