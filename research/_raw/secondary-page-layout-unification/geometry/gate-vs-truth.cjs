#!/usr/bin/env node
/**
 * secondary-page-layout-unification · 「新 §22c 的命中集合」× 「401 条真值」集合级核对（t3 证据）
 *
 * 为什么要有它：修复后的 §22c 必须把**每一条**被压窄的页面级说明都逮到，而"数字对上"不等于
 * "集合对上" —— 48+108=156 这种算式可以蒙对（比如逮到 156 条但恰好是另外 156 条）。
 * 这一支只做一件事：拿修复后的 `verify-site.js --json=` 报告，与 `geometry/truth-401.json` 的
 * 逐条真值做**集合差**，并逐条列出「漏判」与「误报」。
 *
 * ★ 判窄用的是**接受码集合** `^note-(ink-)?narrow$`（t14 并集口径，t18 改）：
 *   `note-narrow`（盒宽窄，48 条）第一；`note-ink-narrow`（字迹窄，108 条）第二；两者都算窄。
 *   改之前这里写死单一 `note-narrow`（前缀匹配），在并集口径下会报出**假的「漏判 108」**。
 *   `note-hidden-text` 不算窄（它是"没有可见字形盒"，另有验收面）。详见下方 NARROW_CODE_RE 处的注释。
 *
 * 判据（两份报告各一次）：
 *   · `--expect=baseline`（`--dir=dist.baseline`）：命中集合必须 ⊇ `caughtByOldCriteria ∪ onlyNewTruth`
 *     （**156 条 / 48 页** —— 页集合大小与旧口径那 48 页相同：156 条窄说明全部落在它们上面，
 *     105 是"有说明的页面数"，**不是**缺陷页数）；漏一条就是漏判。误报（命中 `alreadyFine`）单列出来看，
 *     不直接判死 —— 因为"本来正常"的定义来自我这份真值，而新判据可能有更严的口径（如实报告，不替它辩护）。
 *   · `--expect=green`（`--dir=dist`）：命中集合必须为空（156 条全部收干净，245 条对照组一条不许中）。
 *
 * 报告里可能出现的两种容器都会被读到（新判据若改了字段名，脚本会自动发现并在输出里写明用了哪个）：
 *   · 页级：`metrics.layoutViolations[] = { route, codes, note, region, column, regionSel }`
 *   · 条级：`metrics` 下任何"元素同时带 route 与 index/noteIndex 且带 codes"的数组
 *
 * 用法（**两份报告都要跑**，captain 已把这套写法写进 repair 契约）：
 *   node …/geometry/gate-vs-truth.cjs --report=<修复后 dist 的报告>          --expect=green    --out=<json>
 *   node …/geometry/gate-vs-truth.cjs --report=<修复后 dist.baseline 的报告> --expect=baseline --out=<json>
 * 期望：两份都 pass。`--expect=baseline` 的通过条件是
 *   ① 命中**页集合** ⊇ 真值的 48 页（多报的页会进 `falsePositiveRoutes`，逐条可查）；
 *   ② 报告里有**条级容器** ⇒ 命中**条集合** ⊇ 真值的 156 条（`missedNoteKeys` 必须为空）；
 *   ③ 245 条对照组零误报。
 *   若报告里没有条级容器，脚本会明说「只能核对页集合」并写进 `containers.noteLevel = null`
 *   —— 这正是**修复前**那份报告的状态（108 条窄说明无从核对），修复后必须消失。
 * 自检记录（三次都在**修复前**跑过，用来证明这一支自己也不是摆设；原始日志在 `geometry/checker-selftest/`）：
 *   · 自检 1：`teeth/M-synth-green.json`（合成绿报告）`--expect=green` ⇒ **exit 0（pass）**
 *   · 自检 2：`teeth/M0-baseline.json`（修复前的基线报告）`--expect=baseline` ⇒ **exit 1（fail）**，
 *     红的**正是验收标准第 5 条**：页集合 48/48 一致，但 `noteLevel = null` ⇒ 108 条无从核对
 *   · 自检 3：同一份报告加 `--allow-page-only` ⇒ exit 0，输出里明确标注「只核对页集合，条级未核对」
 *
 * 退出码：0 = 按期望通过；1 = 与真值有集合差（漏判/误报/**缺条级容器**），逐条列在输出 JSON 的 `diff` / `verdicts` 段。
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const arg = name => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const ROOT = path.join(__dirname, '..', '..', '..', '..');
const resolve = p => (p && path.isAbsolute(p) ? p : path.join(ROOT, p || '.'));
const REPORT = resolve(arg('report'));
const TRUTH = resolve(arg('truth') || path.join(ROOT, 'research', '_raw', 'secondary-page-layout-unification', 'geometry', 'truth-401.json'));
const OUT = arg('out') ? resolve(arg('out')) : null;
const EXPECT = arg('expect') || 'baseline';
const LABEL = arg('label') || EXPECT;
/**
 * `--expect=baseline` 默认**要求报告里有条级容器**（captain 2026-10-06 的验收标准第 5 条：
 * 「修复前那份报告没有条级容器 ⇒ 108 条无从核对」本身就是 blocker，修复后必须消失）。
 * 需要只核对页集合时显式加 `--allow-page-only`（会在输出里如实标注「条级未核对」）。
 */
const REQUIRE_NOTE_LEVEL = EXPECT === 'baseline' && !process.argv.includes('--allow-page-only');

if (!fs.existsSync(REPORT)) { console.error(`找不到报告 ${REPORT}`); process.exit(2); }
const report = JSON.parse(fs.readFileSync(REPORT, 'utf8'));
const truth = JSON.parse(fs.readFileSync(TRUTH, 'utf8'));
const metrics = report.metrics || {};

/** 真值的两个集合（key = `route#index`，另给 route 集合） */
const expectedNarrow = [...truth.sets.caughtByOldCriteria, ...truth.sets.onlyNewTruth]
  .map(row => ({ key: `${row.route}#${row.index}`, route: row.route, index: row.index }));
const alreadyFine = truth.sets.alreadyFine.map(row => ({ key: `${row.route}#${row.index}`, route: row.route, index: row.index }));
const expectedNarrowKeys = new Set(expectedNarrow.map(row => row.key));
const alreadyFineKeys = new Set(alreadyFine.map(row => row.key));
const expectedNarrowRoutes = [...new Set(expectedNarrow.map(row => row.route))].sort();

/** 在报告里找"条级"容器：元素同时带 route 与 index/noteIndex 且带 codes */
let noteContainerName = null;
let noteRows = [];
for (const [key, value] of Object.entries(metrics)) {
  if (!Array.isArray(value) || !value.length) continue;
  const first = value[0];
  if (first && typeof first === 'object' && 'route' in first && ('index' in first || 'noteIndex' in first)) {
    noteContainerName = `metrics.${key}`;
    noteRows = value;
    break;
  }
}
/** 页级容器：`metrics.layoutViolations`（旧口径）或任何形如 {route, codes} 的数组 */
let pageContainerName = null;
let pageRows = [];
if (Array.isArray(metrics.layoutViolations)) { pageContainerName = 'metrics.layoutViolations'; pageRows = metrics.layoutViolations; }
else {
  for (const [key, value] of Object.entries(metrics)) {
    if (!Array.isArray(value) || !value.length) continue;
    const first = value[0];
    if (first && typeof first === 'object' && 'route' in first && 'codes' in first) { pageContainerName = `metrics.${key}`; pageRows = value; break; }
  }
}
const noteKeyOf = row => `${row.route}#${row.index !== undefined ? row.index : row.noteIndex}`;
const codesOf = row => row.codes || row.problems || [];

/**
 * ★ 窄说明的**接受码集合**（t14 起的并集口径，t18 改）：
 *
 *   · `note-narrow`      —— 内容盒宽 < 0.85×列宽（「单行说明 + 盒子被压窄」那 48 条）；
 *   · `note-ink-narrow`  —— 行数 ≥ 2 且最宽行 < 0.85×列宽（「盒宽满宽、字迹仍窄」那 108 条）。
 *
 * 两者**都是**"窄"，缺一不可。这里刻意**不用前缀匹配**：改之前写的是
 * `String(code).startsWith('note-narrow')`，它会把 `note-ink-narrow` 判成"不窄" ——
 * 在并集口径下，那 108 条会被当成漏判（假的「漏判 108」），把修复者与复审者引到
 * 一个根本不在判据里的问题上。所以：
 *   · 匹配用**锚定的正则**，只认这两个码（`note-ink-narrow` 的前缀恰好也是 `note-`，
 *     用 `startsWith('note-')` 那种放宽写法会把 `note-axis` / `note-clipped` /
 *     `note-hidden-text` 一起吞进来 —— 那是另一种错，宁可拒绝也不误放行）；
 *   · `note-hidden-text` **不算窄**：它是"没有可见字形盒"的独立缺陷，不是宽度问题，
 *     它有自己的验收面（不要把它塞进这一支）。
 *   · 将来若再加窄柱码（例如第三种量法），必须**显式登记**到这个正则里 ——
 *     加了码却忘了登记，合成自检 case1 会立刻红（而不是悄悄放过）。
 */
const NARROW_CODE_RE = /^note-(ink-)?narrow$/;
const isNarrowCode = code => NARROW_CODE_RE.test(String(code));

const reportNarrowNotes = noteRows.length
  ? noteRows.filter(row => codesOf(row).some(isNarrowCode))
  : null;
const reportNarrowPages = pageRows.filter(row => codesOf(row).some(isNarrowCode)).map(row => row.route);
const reportNarrowRoutes = [...new Set(reportNarrowPages)].sort();

/** 命中的码分布：让报告自己说清这 156 条里有多少走的是盒宽、多少走的是字迹（并集口径的可读证据） */
const narrowCodeTally = (rows, pick) => {
  const tally = {};
  for (const row of rows || []) for (const code of (pick(row) || [])) if (isNarrowCode(code)) tally[code] = (tally[code] || 0) + 1;
  return tally;
};
/**
 * 除窄码以外的**其它**码分布：这一支只判"窄不窄"，所以必须把别的码如实摆出来 ——
 * 免得读者把 `gate-vs-truth pass` 误读成"这一轮一个违规码都没有"（其它码由 §22c 自己的断言面负责）。
 */
const otherCodeTally = (rows, pick) => {
  const tally = {};
  for (const row of rows || []) for (const code of (pick(row) || [])) if (!isNarrowCode(code)) tally[code] = (tally[code] || 0) + 1;
  return tally;
};

/** 集合差 */
const noteLevel = Boolean(reportNarrowNotes);
const hitKeys = noteLevel ? new Set(reportNarrowNotes.map(noteKeyOf)) : new Set(reportNarrowRoutes.map(route => `${route}#?`));
const missedKeys = noteLevel ? expectedNarrow.filter(row => !hitKeys.has(row.key)) : [];
const missedNoteRoutes = noteLevel ? [] : expectedNarrowRoutes.filter(route => !reportNarrowRoutes.includes(route));
const falsePositive = noteLevel
  ? alreadyFine.filter(row => hitKeys.has(row.key))
  : [];
const falsePositiveRoutes = noteLevel ? [] : reportNarrowRoutes.filter(route => !expectedNarrowRoutes.includes(route));

const sweep = metrics.layoutSweep || {};
/** 页集合：既要"无减少"（⊇ 真值），也要"无新增"（⊆ 真值）—— captain 的措辞是"逐条相同" */
const pageSetCovered = expectedNarrowRoutes.every(route => reportNarrowRoutes.includes(route));
const pageSetExact = pageSetCovered && reportNarrowRoutes.every(route => expectedNarrowRoutes.includes(route));
const noteLevelOk = noteLevel ? missedKeys.length === 0 : !REQUIRE_NOTE_LEVEL;
const falsePositiveZero = noteLevel ? falsePositive.length === 0 : falsePositiveRoutes.length === 0;

const verdicts = {
  baseline: {
    '命中页集合 ⊇ 真值页集合（48 页，无减少）': pageSetCovered,
    '命中页集合 ⊆ 真值页集合（无新增 / 零误报页）': reportNarrowRoutes.every(route => expectedNarrowRoutes.includes(route)),
    '页集合逐条相同（48 页）': pageSetExact,
    '报告里有条级容器（验收标准第 5 条）': noteLevel,
    '命中条集合 ⊇ 真值条集合（156 条，逐条查）': noteLevel ? missedKeys.length === 0 : '无法判定（报告里没有条级容器）',
    '对照组（alreadyFine 245 条）零误报': falsePositiveZero,
    '页数与条数读数': `${reportNarrowRoutes.length} 页 / ${noteLevel ? reportNarrowNotes.length : '（无条级读数）'} 条`
  },
  green: {
    '命中页集合为空': reportNarrowRoutes.length === 0,
    '命中条集合为空': noteLevel ? reportNarrowNotes.length === 0 : '无法判定（报告里没有条级容器）',
    '对照组（alreadyFine 245 条）零误报': falsePositiveZero
  }
};
const verdict = EXPECT === 'green'
  ? (reportNarrowRoutes.length === 0 && (!noteLevel || reportNarrowNotes.length === 0))
  : (pageSetExact && falsePositiveZero && noteLevelOk);

const out = {
  label: LABEL,
  expect: EXPECT,
  at: new Date().toISOString(),
  report: { path: path.relative(ROOT, REPORT).replace(/\\/g, '/'), sha256: crypto.createHash('sha256').update(fs.readFileSync(REPORT)).digest('hex'), total: report.total, failed: report.failed },
  truth: { path: path.relative(ROOT, TRUTH).replace(/\\/g, '/'), sha256: crypto.createHash('sha256').update(fs.readFileSync(TRUTH)).digest('hex'), narrowNotes: expectedNarrow.length, narrowRoutes: expectedNarrowRoutes.length, alreadyFine: alreadyFine.length,
    pagesWithNotes: truth.totals ? truth.totals.pagesWithNotes : null,
    pagesCarryingNarrowNotes: truth.totals ? truth.totals.pagesCarryingNarrowNotes : null,
    note: 'narrowRoutes 是「含窄说明的页面数」（48），不是「有说明的页面数」（105）' },
  containers: { noteLevel: noteContainerName, pageLevel: pageContainerName },
  requireNoteLevel: REQUIRE_NOTE_LEVEL,
  /** 判窄用的是**接受码集合**，不是单一码（t14 并集口径；t18 改） */
  acceptCodeSet: String(NARROW_CODE_RE),
  observed: {
    narrowRoutes: reportNarrowRoutes, narrowRouteCount: reportNarrowRoutes.length,
    narrowNoteKeys: noteLevel ? reportNarrowNotes.map(noteKeyOf) : null,
    narrowNoteCount: noteLevel ? reportNarrowNotes.length : null,
    /** 命中的码分布：多少条走「盒宽窄」、多少条走「字迹窄」——并集口径的可读证据 */
    narrowCodeTally: {
      noteLevel: narrowCodeTally(reportNarrowNotes || [], row => row.codes),
      pageLevel: narrowCodeTally(pageRows, row => row.codes)
    },
    /** 除窄码以外的其它码：这一支只判窄，别的码如实摆出来，避免把 pass 误读成"零违规" */
    otherCodeTally: {
      noteLevel: otherCodeTally(noteRows, row => row.codes),
      pageLevel: otherCodeTally(pageRows, row => row.codes)
    },
    layoutSweep: sweep
  },
  diff: {
    missedNoteKeys: missedKeys, missedNoteCount: missedKeys.length,
    missedRoutes: missedNoteRoutes, missedRouteCount: missedNoteRoutes.length,
    falsePositiveNoteKeys: falsePositive, falsePositiveRoutes, falsePositiveCount: noteLevel ? falsePositive.length : falsePositiveRoutes.length
  },
  verdicts,
  verdict: verdict ? 'pass' : 'fail',
  note: `${noteLevel
    ? `报告里有条级容器 ${noteContainerName} ⇒ 逐条核对（最强口径）`
    : `报告里**没有**条级容器（只有 ${pageContainerName || '（没找到）'}）⇒ 只能核对页集合。若新判据能逐条报，请把它写进 metrics 的某个数组（元素含 route/index/codes），这里会自动发现。`}`
    + ` 判窄用的是接受码集合 ${NARROW_CODE_RE}（note-narrow ∪ note-ink-narrow；note-hidden-text 不算窄）。`
};

fs.mkdirSync(path.dirname(OUT || path.join(ROOT, 'x')), { recursive: true });
if (OUT) fs.writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`, 'utf8');

console.log(`核对：${out.report.path} × ${out.truth.path}`);
console.log(`容器：条级 ${out.containers.noteLevel || '（无）'} · 页级 ${out.containers.pageLevel || '（无）'} · 条级为必需项：${out.requireNoteLevel}`);
console.log(`真值：窄说明 ${out.truth.narrowNotes} 条 / ${out.truth.narrowRoutes} 页 · 对照组 ${out.truth.alreadyFine} 条`);
console.log(`实测：窄说明 ${out.observed.narrowNoteCount === null ? '（无条级）' : out.observed.narrowNoteCount} 条 / ${out.observed.narrowRouteCount} 页 · layoutSweep ${JSON.stringify(sweep)}`);
console.log(`接受码集合：${out.acceptCodeSet} · 命中码分布（条级）${JSON.stringify(out.observed.narrowCodeTally.noteLevel)}（页级 ${JSON.stringify(out.observed.narrowCodeTally.pageLevel)}）`);
console.log(`其它码（本支不判；**pass ≠ 零违规**，其它码由 §22c 自己的断言面负责）：条级 ${JSON.stringify(out.observed.otherCodeTally.noteLevel)} · 页级 ${JSON.stringify(out.observed.otherCodeTally.pageLevel)}`);
console.log(`页集合：${out.verdicts[EXPECT]['命中页集合逐条相同（48 页）'] !== undefined ? `逐条相同 = ${out.verdicts[EXPECT]['命中页集合逐条相同（48 页）']}` : `为空 = ${out.verdicts.green['命中页集合为空']}`}`);
console.log(`漏判：${out.diff.missedNoteCount} 条 / ${out.diff.missedRouteCount} 页${out.diff.missedNoteCount ? `（样例 ${out.diff.missedNoteKeys.slice(0, 5).map(row => row.key).join(' ')}）` : ''}`);
console.log(EXPECT === 'green'
  ? `（绿轮的读法：真值的 156 条「改动前窄说明」在改动后产物上**应当一条都不出现** ⇒ 这里 ${out.diff.missedNoteCount}/${expectedNarrowKeys.size} 条如期消失，不是漏判）`
  : '（基线轮的读法：真值的 156 条里没被命中的才是漏判）');
console.log(`误报（对照组成员被报成窄）：${out.diff.falsePositiveCount} 条`
  + (out.diff.falsePositiveCount
    ? ` ⇒ ${(noteLevel ? out.diff.falsePositiveNoteKeys.map(row => row.key) : out.diff.falsePositiveRoutes).slice(0, 8).join(' ')}${out.diff.falsePositiveCount > 8 ? ' …' : ''}`
    : ''));
if (!noteLevel && REQUIRE_NOTE_LEVEL) console.log('❌ 验收标准第 5 条未达成：报告里没有条级容器 ⇒ 156 条里的 108 条（第 2 条及以后的说明）根本无从核对。');
console.log(`${out.verdict === 'pass' ? '✅' : '❌'} 结论：${out.verdict}（expect=${EXPECT}）· ${out.note}`);
if (OUT) console.log(`证据：${path.relative(ROOT, OUT).replace(/\\/g, '/')}`);
process.exit(out.verdict === 'pass' ? 0 : 1);
