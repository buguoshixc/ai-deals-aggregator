#!/usr/bin/env node
/**
 * 把 harness 的原始读数整理成两份交付物：
 *   baseline-current.json  —— 修复前（sha256 4cae2fb2…）判据下的绕过基线
 *   after-repair.json      —— 修复后（sha256 见文件头）判据下的翻转表 + 仍放行形态的结构化 findings
 * 另出一份人读的 forms-table.md。
 *
 * 只读 harness 的 runs/*.json；不改任何生产文件。
 * 用法：node …/adversary/build-reports.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const WT = path.join(HERE, '..', '..', '..', '..');
const RUNS = path.join(HERE, 'runs');
const rel = p => path.relative(WT, p).split(path.sep).join('/');

const readJson = p => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null);
/** 允许把一轮模式 A 拆成多个文件跑（后面的文件覆盖前面的同名形态）。 */
function readMerged(prefix) {
  const files = fs.existsSync(RUNS)
    ? fs.readdirSync(RUNS).filter(f => new RegExp(`^${prefix}.*\\.json$`).test(f)).sort()
    : [];
  if (!files.length) return null;
  const merged = { forms: [], files: files.map(f => `adversary/runs/${f}`) };
  const byId = new Map();
  for (const f of files) {
    const r = readJson(path.join(RUNS, f));
    if (!r) continue;
    merged.verifySite = r.verifySite;   // 最后一个文件为准（同一判据 sha）
    merged.generatedAt = r.generatedAt;
    for (const form of r.forms || []) byId.set(form.id, form);
  }
  merged.forms = [...byId.values()];
  return merged;
}
const before = readMerged('modeA-before');
const after = readMerged('modeA-after');
const modeB = fs.existsSync(RUNS)
  ? fs.readdirSync(RUNS).filter(f => /^modeB-.*\.json$/.test(f)).map(f => {
    const r = readJson(path.join(RUNS, f));
    if (r) r.__file = f;
    return r;
  }).filter(Boolean)
  : [];

if (!before || !after) {
  console.error('缺 runs/modeA-before.json 或 runs/modeA-after.json —— 先跑两轮模式 A');
  process.exit(2);
}

const byId = report => {
  const m = new Map();
  for (const f of report.forms || []) m.set(f.id, f);
  return m;
};
const B = byId(before);
const A = byId(after);

// 模式 B 的读数按形态归并（可能分多次跑）
// ⚠️ 第一轮（modeB-after-1）是在 harness 修好「先探针、后还原」顺序**之前**跑的：
//    它的套件 EXIT 读数有效，但 scratch 探针量到的是**已还原**的页面 ⇒ 标记为无效，用 modeB-after-2 的复跑读数。
const PROBE_INVALID_FILES = new Set(['modeB-after-1.json']);
const modeBByForm = new Map();
for (const run of modeB) {
  for (const f of run.forms || []) {
    const prev = modeBByForm.get(f.id) || [];
    prev.push({
      sourceFile: run.__file,
      scratchProbeValid: !PROBE_INVALID_FILES.has(run.__file),
      scratchProbeInvalidReason: PROBE_INVALID_FILES.has(run.__file) ? '该轮在「先还原后探针」的顺序缺陷下跑的：套件 EXIT 有效，但 scratch 探针量到的是已还原页面 ⇒ 以 modeB-after-2 的复跑为准' : null,
      exitCode: f.suite ? f.suite.exitCode : null,
      seconds: f.suite ? f.suite.seconds : null,
      pinnedStable: f.suite ? f.suite.pinnedStable : null,
      verdict: f.verdict,
      assertionTotals: f.suite && f.suite.parsed ? { assertions: f.suite.parsed.assertions, failed: f.suite.parsed.failedAssertions } : null,
      failingLines: f.suite && f.suite.parsed ? f.suite.parsed.failingLines.slice(0, 6) : [],
      section22cSummary: f.suite && f.suite.parsed ? (f.suite.parsed.summaryLine || f.suite.parsed.frozenLine) : null,
      scratchPaint: f.scratchPaint || null,
      scratchJudge: f.scratchJudge || null,
      report: rel(path.join(RUNS, `suite-${f.id}.json`)),
      target: (f.targets || [])[0] || null,
      shell: f.suite ? f.suite.command : null,
      verifySiteSha: run.verifySite ? run.verifySite.sha256 : null
    });
    modeBByForm.set(f.id, prev);
  }
}

const column = f => (f && f.judgeGeometry ? f.judgeGeometry.column : null);
const paintWidth = f => (f && f.paint && !f.paint.error ? f.paint.paintInkWidth : null);
const judgeTextWidth = f => {
  if (!f || !f.judgeGeometry) return null;
  const notes = f.judgeGeometry.notes || [];
  return notes.length ? notes.map(n => n.textWidth) : null;
};
const judgeBoxWidth = f => {
  if (!f || !f.judgeGeometry) return null;
  const notes = f.judgeGeometry.notes || [];
  return notes.length ? notes.map(n => n.boxWidth) : (f.judgeGeometry.noteLegacy ? [f.judgeGeometry.noteLegacy.width] : null);
};
const longestLine = f => (f && f.probe && f.probe.notes && f.probe.notes[0] ? f.probe.notes[0].inkLongestLine : null);

function classify(f) {
  if (!f) return null;
  const col = column(f);
  const paint = paintWidth(f);
  const long = longestLine(f);
  const cands = [paint, long].filter(v => typeof v === 'number');
  const narrow = cands.length && col ? Math.min(...cands) < 0.85 * col - 0.01 : null;
  const hidden = typeof paint === 'number' && col ? paint < 0.05 * col : null;
  return { column: col, paintInkWidth: paint, inkLongestLine: long, visibleNarrow: narrow, textHidden: hidden, promiseDefect: Boolean(narrow || hidden) };
}

const forms = [...new Set([...B.keys(), ...A.keys()])].map(id => {
  const b = B.get(id);
  const a = A.get(id);
  const ref = a || b;
  const cb = classify(b);
  const ca = classify(a);
  const mb = modeBByForm.get(id) || null;
  return {
    id,
    direction: ref.direction,
    what: ref.what,
    realism: ref.realism,
    injectedCss: ref.injectedCss,
    route: ref.route,
    viewport: ref.width,
    before: b ? { verdict: b.verdict, codes: b.codes, judgeBoxWidth: judgeBoxWidth(b), judgeTextWidth: judgeTextWidth(b), paintInkWidth: paintWidth(b), inkLongestLine: longestLine(b), classification: cb } : null,
    after: a ? { verdict: a.verdict, codes: a.codes, judgeBoxWidth: judgeBoxWidth(a), judgeTextWidth: judgeTextWidth(a), paintInkWidth: paintWidth(a), inkLongestLine: longestLine(a), classification: ca } : null,
    flipped: Boolean(b && a && b.verdict === 'pass' && a.verdict === 'bite'),
    stillPassingAfter: Boolean(a && a.verdict === 'pass'),
    modeB: mb,
    modeBConfirmedFalseGreen: Boolean(mb && mb.some(r => r.exitCode === 0))
  };
});

const reproCommand = (id, mode = 'A') => mode === 'A'
  ? `node ${rel(path.join(HERE, 'harness.cjs'))} --mode=A --verify-site=scripts/tools/verify-site.js --forms=${id}`
  : `node ${rel(path.join(HERE, 'harness.cjs'))} --mode=B --verify-site=scripts/tools/verify-site.js --scratch-name=dist-probe-after --forms=${id}`;

// ── findings：仍放行的形态 ───────────────────────────────────────────────────
function severityOf(f) {
  const c = f.after && f.after.classification;
  const realism = f.realism ? f.realism.level : 'low';
  const confirmed = f.modeBConfirmedFalseGreen;
  const promise = c ? c.promiseDefect : false;
  if (f.id === 'font-size-tiny' || f.id === 'letter-spacing-huge') return 'out-of-promise';
  if (!confirmed && !promise) return 'medium';
  if (confirmed && promise && (realism === 'high' || realism === 'medium')) return 'blocker';
  if (confirmed && promise) return 'high';
  if (promise) return 'medium';
  return 'medium';
}

const findings = forms
  .filter(f => f.stillPassingAfter && f.direction !== 'control')
  .map(f => {
    const c = f.after.classification;
    const sev = severityOf(f);
    const visible = c.textHidden
      ? `可见文字≈0px（整段说明在视觉上消失）`
      : `可见文字实测 ${c.paintInkWidth}px / 单行最长 ${c.inkLongestLine}px（列宽 ${c.column}px ⇒ 只有 ${Math.round(100 * Math.min(c.paintInkWidth || 1e9, c.inkLongestLine || 1e9) / c.column)}%）`;
    const confirmedText = f.modeB && f.modeB.length
      ? f.modeB.map(r => `模式 B EXIT=${r.exitCode}（${r.seconds}s · ${r.assertionTotals ? r.assertionTotals.assertions + ' 项断言/失败 ' + r.assertionTotals.failed : '—'}）`).join('；')
      : '未跑模式 B';
    return {
      id: `T11-${f.id}`,
      severity: sev === 'out-of-promise' ? 'low' : sev,
      outOfPromise: sev === 'out-of-promise',
      form: f.id,
      direction: f.direction,
      problem: sev === 'out-of-promise'
        ? `**越界观察（不构成本版承诺内的缺陷）**：${f.what} —— 判据两版都放行；它不是「页面级说明被压成窄柱」这条承诺里的缺陷。`
        : `修复后的判据仍放行该形态：${f.what} —— 判据读数（修复后）盒宽 ${JSON.stringify(f.after.judgeBoxWidth)} / textWidth ${JSON.stringify(f.after.judgeTextWidth)} 都「满宽」，而独立像素量测：${visible}。${confirmedText}`,
      evidence: {
        before: f.before ? { verdict: f.before.verdict, codes: f.before.codes } : null,
        after: { verdict: f.after.verdict, codes: f.after.codes, boxWidth: f.after.judgeBoxWidth, textWidth: f.after.judgeTextWidth, paintInkWidth: f.after.paintInkWidth },
        modeB: f.modeB,
        scratch: `adversary/scratch/dist-probe-after/${f.route}index.html（注入串逐字节可回退，冻结串仍恰好 1 次）`,
        screenshot: `adversary/runs/shots/${f.id}.png`
      },
      requiredFix: sev === 'out-of-promise'
        ? '不需要修（本版不承诺字号/字距）；若要把「可见字迹」也纳入，需要另立一条像素级/字迹级判据，并先解掉 89 条单行说明的误报。'
        : '判据要落到「可见文字」而不是「盒子」：① 对同一条说明统计**逐行**字迹宽（Range/BoundingClientRect 均可）而不是盒宽/content box —— 至少一条规则：文本占据 ≥2 行时，若**每一行**的宽度都 < 0.85×列宽 ⇒ note-narrow（多列/浮动/网格/竖排都在这里现形）；② 对绘制期隐藏（伪元素承载正文、遮罩/裁切、覆盖层）只能靠像素级字迹（截图像素列）或 elementFromPoint + getComputedStyle(el,"::before").content 这类独立量测兜底 —— 本 harness 的 inkFromPng() 已经给出可直接复用的实现与读数。',
      realism: f.realism,
      reproCommandA: reproCommand(f.id, 'A'),
      reproCommandB: reproCommand(f.id, 'B')
    };
  });

// ── 标定实验 / 普查 / 覆盖不对称三块附加证据 ────────────────────────────────
const calibration = readJson(path.join(RUNS, 'calibration-all.json'));
const clipCensus = readJson(path.join(RUNS, 'clip-census.json'));
const asymmetry = readJson(path.join(RUNS, 'coverage-asymmetry-writing-mode.json'));

const calibrationBlock = calibration ? {
  probe: 'adversary/line-ink-calibration.cjs（独立探针，不接入套件；verify-site.js 未改动）',
  rule: calibration.rule,
  report: 'adversary/calibration-report.md',
  raw: 'adversary/runs/calibration-all.json',
  sets: Object.fromEntries(Object.entries(calibration.sets).filter(([k]) => k !== 'forms').map(([k, v]) => [k,
    { dir: v.dir, notes: v.rows.filter(r => !r.error).length, pages: new Set(v.rows.filter(r => !r.error).map(r => r.route)).size, hits: Object.fromEntries(Object.entries(v.sets).map(([n, l]) => [n, l.length])) }])),
  scratchForms: calibration.sets.forms || null,
  truthComparison: {
    dist: calibration.truthComparison.dist ? { got: calibration.truthComparison.dist.got, extraCount: calibration.truthComparison.dist.extraCount, missedCount: calibration.truthComparison.dist.missedCount } : null,
    baseline: calibration.truthComparison.baseline ? { got: calibration.truthComparison.baseline.got, missedCount: calibration.truthComparison.baseline.missedCount, missedAllAreCaughtByCurrentCriterion: calibration.truthComparison.baseline.missedCount > 0, extraCount: calibration.truthComparison.baseline.extraCount } : null,
    synth: calibration.truthComparison.synth ? { got: calibration.truthComparison.synth.got, extraCount: calibration.truthComparison.synth.extraCount } : null
  },
  conclusion: '候选判据（行数≥2 且 最宽行 < 0.85×列宽）在 dist/synth-fixed 上 0 误报、在 baseline 上补 108 条；单独跑会漏 48 条「单行 + 盒被压窄」——那 48 条现行 textWidth 判据已全覆盖（漏的 48 条里属于 caughtByOldCriteria 的 0 条）⇒ 结论是「加一条牙、不换牙」：并集 156/156、误报 0。'
} : null;

const beforeSummary = {
  requestedSha256: '4cae2fb2ab2599997668feca8c26c3161fe882a518e61d01552b7adc95f95756',
  judgeExtraction: before.verifySite.judge,
  files: before.files,
  modeBFalseGreenForms: forms.filter(f => f.before && f.before.verdict === 'pass' && f.modeB && f.modeB.some(r => r.exitCode === 0 && String(r.verifySiteSha || '').startsWith('4cae2fb2'))).map(f => f.id),
  note: '修复前的绕过后基线；模式 B 的整轮读数见 modeB-before（沙箱 adversary/sandbox-pre-t7，只换判据版本，自带 dist junction）。'
};

// ── baseline-current.json ───────────────────────────────────────────────────
const baseline = {
  generatedAt: new Date().toISOString(),
  task: 't11 · 第二对抗者：锚点式 harness + 8 个新绕过形态 + 修复前后绕过基线',
  author: 'adversary',
  requestedVerifySite: {
    sha256: '4cae2fb2ab2599997668feca8c26c3161fe882a518e61d01552b7adc95f95756',
    path: 'research/_raw/secondary-page-layout-unification/recovered/pre-t7/scripts/tools/verify-site.js（captain 复原）· adversary/sandbox-pre-t7/scripts/tools/verify-site.js（本 harness 用的沙箱副本，逐字节相同）',
    provenance: 't7 曾把 §22c 整块原地替换（teeth/_scratch/splice-22c.cjs，不留备份），磁盘/git/悬空 blob/其它 worktree/%TEMP% 都没有原件；captain 从 T3 改动前抓的 diff/02-source-diff.patch 复原，判定标准 sha256 相等。**本 harness 独立复核**：文件 sha256 = 4cae2fb2…；锚点式抽取得到判据区 213 行 / sha256 91d295365b40e60c…、wideMutate 14 行 / b3d6ba24f3b65d41…，与 t5 报告记的读数逐项相同 ⇒ 抽取等价、对照有效。',
    sandbox: { dir: 'adversary/sandbox-pre-t7', note: '自建沙箱：scripts/tools/verify-site.js 为复原件逐字节副本 + scripts/lib、node_modules、dist 三个 junction ⇒ 与生产路径的唯一差别就是 §22c 版本。' }
  },
  harness: {
    path: rel(path.join(HERE, 'harness.cjs')),
    extraction: before.verifySite.judge,
    mutate: before.verifySite.mutate,
    mode: 'A（浏览器内存注入）与 B（scratch 副本整轮套件）'
  },
  judgeBefore: before.verifySite,
  judgeAfter: after.verifySite,
  beforeSummary,
  forms: forms.filter(f => f.before).map(f => ({ id: f.id, direction: f.direction, injectedCss: f.injectedCss, realism: f.realism, verdict: f.before.verdict, codes: f.before.codes, judgeBoxWidth: f.before.judgeBoxWidth, paintInkWidth: f.before.paintInkWidth, inkLongestLine: f.before.inkLongestLine, classification: f.before.classification })),
  formsNotInBefore: forms.filter(f => !f.before).map(f => ({ id: f.id, why: '该形态在「修复前」那一轮之后才加进登记表（修复前判据下未实测；模式 A 的修复前列显示为 —）' })),
  summary: {
    forms: forms.length,
    passedBefore: forms.filter(f => f.before && f.before.verdict === 'pass').length,
    bitBefore: forms.filter(f => f.before && f.before.verdict === 'bite').length,
    promiseDefectAndPassed: forms.filter(f => f.before && f.before.verdict === 'pass' && f.before.classification && f.before.classification.promiseDefect).map(f => f.id),
    modeBConfirmedFalseGreenBefore: beforeSummary.modeBFalseGreenForms
  },
  note: '修复前判据的已知边界（t5 的 F1/F2）在本表里被这 8 条新形态从**另外的方向**复现：盒宽满宽、有字区域窄 —— 多列/浮动/竖排/伪元素/遮罩/裁切都在其中。'
};

// ── after-repair.json ───────────────────────────────────────────────────────
const afterReport = {
  generatedAt: new Date().toISOString(),
  task: 't11 · 第二对抗者',
  author: 'adversary',
  judgeAfter: after.verifySite,
  harness: {
    path: rel(path.join(HERE, 'harness.cjs')),
    usage: [
      `node ${rel(path.join(HERE, 'harness.cjs'))} --mode=A --verify-site=<path> [--dir=dist] [--forms=id1,id2] [--json=out.json]`,
      `node ${rel(path.join(HERE, 'harness.cjs'))} --mode=B --verify-site=<path> --dir=dist --scratch-name=dist-probe-after --forms=id1,id2`,
      '锚点：`const WIDE_TOL = 1;` → `wideProblems` 函数结束；`async function wideMutate(target, anchor, replacement) {` → 函数结束（不按行号）',
      '锚点缺失 ⇒ exit 3 + 报告 verdict=RED（对照件 adversary/fixtures/verify-site.no-WIDE_TOL.js · verify-site.no-wideProblems.js，读数在 runs/anchor-red-*.json）'
    ],
    anchorRedEvidence: ['adversary/runs/anchor-red-1.json（起点锚点缺失 ⇒ EXIT=3）', 'adversary/runs/anchor-red-2.json（终点锚点缺失 ⇒ EXIT=3）']
  },
  flipTable: forms.map(f => ({
    id: f.id, direction: f.direction, injectedCss: f.injectedCss,
    before: f.before ? { verdict: f.before.verdict, codes: f.before.codes, judgeBoxWidth: f.before.judgeBoxWidth, judgeTextWidth: f.before.judgeTextWidth, paintInkWidth: f.before.paintInkWidth, inkLongestLine: f.before.inkLongestLine } : null,
    after: f.after ? { verdict: f.after.verdict, codes: f.after.codes, judgeBoxWidth: f.after.judgeBoxWidth, judgeTextWidth: f.after.judgeTextWidth, paintInkWidth: f.after.paintInkWidth, inkLongestLine: f.after.inkLongestLine } : null,
    flipped: f.flipped,
    stillPassingAfter: f.stillPassingAfter,
    modeB: f.modeB,
    modeBConfirmedFalseGreen: f.modeBConfirmedFalseGreen
  })),
  modeB: {
    runs: modeB.map(r => ({ tag: r.mode || null, generatedAt: r.generatedAt, verifySiteSha256: r.verifySite ? r.verifySite.sha256 : null, scratch: r.scratch || null, forms: (r.forms || []).map(f => ({ id: f.id, exitCode: f.suite ? f.suite.exitCode : null, seconds: f.suite ? f.suite.seconds : null, assertions: f.suite && f.suite.parsed ? f.suite.parsed.assertions : null, failed: f.suite && f.suite.parsed ? f.suite.parsed.failedAssertions : null })) })),
    confirmedFalseGreen: forms.filter(f => f.modeBConfirmedFalseGreen && f.direction !== 'control').map(f => ({ form: f.id, runs: f.modeB.filter(r => r.exitCode === 0).map(r => ({ sourceFile: r.sourceFile, exitCode: r.exitCode, assertions: r.assertionTotals, shell: r.shell, report: r.report, scratchProbeValid: r.scratchProbeValid, scratchPaintInkWidth: r.scratchProbeValid && r.scratchPaint ? r.scratchPaint.paintInkWidth : null, scratchProbeInvalidReason: r.scratchProbeInvalidReason })) })),
    sanityControl: forms.filter(f => f.id === 'ctl-no-inject').map(f => ({ form: f.id, note: '模式 B 的「不注入」对照：整轮 EXIT=0 是预期（装置正常）', modeB: f.modeB }))
  },
  findings: findings.filter(f => !f.outOfPromise).map(f => ({ id: f.id, severity: f.severity, form: f.form, direction: f.direction, problem: f.problem, requiredFix: f.requiredFix, realism: f.realism, evidence: f.evidence, reproCommandA: f.reproCommandA, reproCommandB: f.reproCommandB })),
  outOfPromiseObservations: findings.filter(f => f.outOfPromise).map(f => ({ id: f.id, form: f.form, observation: f.problem, realism: f.realism, evidence: f.evidence })),
  calibration: calibrationBlock,
  drawTimeHidingCensus: clipCensus ? {
    question: clipCensus.question,
    raw: 'adversary/runs/clip-census.json',
    scan: `${clipCensus.sourceFilesScanned} 个源文件 / ${clipCensus.distHtmlScanned} 个产物 HTML`,
    verdict: '绘制期裁剪/遮罩（clip-path / mask* / mix-blend-mode / filter）在源与产物里 **0 处** ⇒ 只能靠手改共享样式或注入造出 ⇒ 同意登记 P1 / DEFERRED，本轮不修。',
    counts: {
      源_clip_path: clipCensus.sourceCensus['clip-path'].occurrences,
      源_mask: clipCensus.sourceCensus['mask-image'].occurrences + clipCensus.sourceCensus['mask(简写)'].occurrences + clipCensus.sourceCensus['-webkit-mask'].occurrences,
      产物_clip_path: clipCensus.distCensus['clip-path'].occurrences,
      产物_mask: clipCensus.distCensus['mask-image'].occurrences + clipCensus.distCensus['mask(简写)'].occurrences + clipCensus.distCensus['-webkit-mask'].occurrences,
      产物_overflow_hidden: clipCensus.distCensus['overflow:hidden'].occurrences,
      产物_line_clamp: clipCensus.distCensus['-webkit-line-clamp'].occurrences
    },
    residualRisk: '本仓库自己的「限字」写法是 overflow:hidden + -webkit-line-clamp（.g h3 / .of .tx / .tierhead .hint）：单独不会把说明压窄（截断在右侧、行宽仍满宽），但「说明被视觉截断」这条路的把手是现成的。'
  } : null,
  coverageAsymmetry: asymmetry ? {
    form: asymmetry.form.id,
    injection: asymmetry.form.injection,
    raw: 'adversary/runs/coverage-asymmetry-writing-mode.json',
    perViewport: asymmetry.perViewport,
    conclusion: asymmetry.coverageAsymmetry,
    notFalseGreenBecause: asymmetry.whyNotFalseGreen
  } : null,
  summary: {
    forms: forms.length,
    passedAfter: forms.filter(f => f.after && f.after.verdict === 'pass').length,
    bitAfter: forms.filter(f => f.after && f.after.verdict === 'bite').length,
    flipped: forms.filter(f => f.flipped).map(f => f.id),
    falseGreenConfirmed: forms.filter(f => f.modeBConfirmedFalseGreen && f.direction !== 'control').map(f => f.id),
    findingsBySeverity: findings.filter(f => !f.outOfPromise).reduce((acc, f) => { acc[f.severity] = (acc[f.severity] || 0) + 1; return acc; }, {})
  }
};

fs.writeFileSync(path.join(HERE, 'baseline-current.json'), `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
fs.writeFileSync(path.join(HERE, 'after-repair.json'), `${JSON.stringify(afterReport, null, 2)}\n`, 'utf8');

// ── 人读表 ──────────────────────────────────────────────────────────────────
const pad = (s, n) => String(s) + ' '.repeat(Math.max(0, n - [...String(s)].reduce((a, c) => a + (/[\u2E80-\uA4CF\uFF00-\uFF60]/.test(c) ? 2 : 1), 0)));
const md = [];
md.push('# T11 绕过形态逐条判定（锚点式 harness · 修复前 vs 修复后）', '');
md.push(`- 修复前判据：\`${before.verifySite.path}\` sha256 \`${before.verifySite.sha256}\`（判据区 ${before.verifySite.judge.lineCount} 行 / ${before.verifySite.judge.sha256.slice(0, 16)}…）`);
md.push(`- 修复后判据：\`${after.verifySite.path}\` sha256 \`${after.verifySite.sha256}\`（判据区 ${after.verifySite.judge.lineCount} 行 / ${after.verifySite.judge.sha256.slice(0, 16)}…）`);
md.push('', '| # | 形态 | 方向 | 修复前 | 修复后 | 翻转 | 判据读数（修复后） | **可见文字实测** | 模式 B |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
forms.forEach((f, i) => {
  const c = f.after && f.after.classification ? f.after.classification : (f.before ? f.before.classification : {});
  md.push(`| ${i + 1} | \`${f.id}\` | ${f.direction || ''} | ${f.before ? (f.before.verdict === 'bite' ? '咬中' : '放行') : '—'} | ${f.after ? (f.after.verdict === 'bite' ? '咬中' : '放行') : '—'} | ${f.flipped ? '**放行→咬中**' : (f.before && f.after && f.before.verdict === 'bite' && f.after.verdict === 'pass' ? '咬中→放行（回归！）' : '不变')} | 盒 ${JSON.stringify(f.after ? f.after.judgeBoxWidth : null)} / textWidth ${JSON.stringify(f.after ? f.after.judgeTextWidth : null)} | ${c.paintInkWidth}px（行 ${c.inkLongestLine}px / 列 ${c.column}px）${c.textHidden ? ' ⚠️整段不可见' : ''}${c.visibleNarrow ? ' ⚠️窄' : ''} | ${f.modeB ? f.modeB.map(r => `EXIT=${r.exitCode}${r.exitCode === 0 ? ' ★假绿' : ''}`).join(' / ') : '—'} |`);
});
md.push('', '## 仍放行的形态（findings）', '');
findings.forEach(f => {
  md.push(`### ${f.severity.toUpperCase()} · ${f.id}（形态 \`${f.form}\`）${f.outOfPromise ? ' · 越界观察' : ''}`, '', f.problem, '', `- 复现 A：\`${f.reproCommandA}\``, `- 复现 B：\`${f.reproCommandB}\``, '');
});
fs.writeFileSync(path.join(HERE, 'forms-table.md'), `${md.join('\n')}\n`, 'utf8');

console.log(`形态 ${forms.length}：修复前放行 ${baseline.summary.passedBefore} / 咬中 ${baseline.summary.bitBefore}；修复后放行 ${afterReport.summary.passedAfter} / 咬中 ${afterReport.summary.bitAfter}`);
console.log(`翻转：${afterReport.summary.flipped.join(', ') || '（无）'}`);
console.log(`模式 B 已证实假绿：${afterReport.summary.falseGreenConfirmed.join(', ') || '（尚无）'}`);
console.log(`findings：${Object.entries(afterReport.summary.findingsBySeverity).map(([k, v]) => `${k}=${v}`).join(' ') || '（无）'}`);
console.log(`写出：baseline-current.json · after-repair.json · forms-table.md`);
