#!/usr/bin/env node
/**
 * secondary-page-layout-unification · 合成报告生成器 + 报告形状检查器（t18 证据）
 *
 * 为什么要有它：`gate-vs-truth.cjs` 是**判据的消费者**（它读 §22c 的报告，不产报告）。
 * §22c 的窄柱判据是**并集口径**：`note-narrow`（内容盒 / 盒宽窄）∪ `note-ink-narrow`（逐行字迹窄）。
 * 消费者必须跟着改 —— 而"跟着改"这件事只有两件事实能证明：
 *   ① 用**合成输入**（不依赖判据是否落盘）证明它既不误放行也不误拦截；
 *   ② 用**真实报告**证明改造后没有回退。
 * 这个文件负责第 ①：按 `geometry/truth-401.json` 的 156 条真值键现场造三份报告。
 *
 * ⚠️ 码分布取自**实测**（`geometry/attribution-census.json`：逐条回查真实 `--dir=dist.baseline` 报告，
 *    三份独立报告逐条一致）：
 *      ① 盒宽窄 `note-narrow`     = **156**（156 条盒宽全 452.81，**含 48 条单行**）
 *      ② 字迹窄 `note-ink-narrow` = **108 且 ② ⊆ ①**（多行的那 108 条）
 *    ⇒ 156 条里 **108 条同时带两个码**、**48 条只带盒宽码**（单行说明）。
 *    ⚠️ 不要再把并集写成「48 条盒宽 + 108 条字迹」：那是把 truth 的 **`index===0` 位置切片**
 *    （历史键名 `caughtByOldCriteria`）当成了"旧口径命中集"（round 3 的 R3-2 就是这么来的）。
 *    位置切片那 48 条实测 **48/48 全多行**，在真实报告里是**两个码都带**的。
 *
 * 用法：
 *   node …/geometry/make-synthetic-reports.cjs --inspect=<report.json>     # 看任意报告的码分布/容器
 *   node …/geometry/make-synthetic-reports.cjs --emit                      # 造三份合成报告
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
const G = path.join(ROOT, 'research', '_raw', 'secondary-page-layout-unification', 'geometry');
const TRUTH = arg('truth') ? path.resolve(arg('truth')) : path.join(G, 'truth-401.json');
const OUT_DIR = path.join(G, 'consumer-selftest');

/** 窄说明的**接受码集合**（与 gate-vs-truth.cjs 里那一份逐字相同 —— 两处必须一起改） */
const NARROW_CODE_RE = /^note-(ink-)?narrow$/;

const coding = {
  'note-narrow': '盒宽窄：内容盒宽 < 0.85×列宽（单行说明 + 盒子被压窄）',
  'note-ink-narrow': '字迹窄：行数 ≥ 2 且最宽行 < 0.85×列宽（盒宽满宽但字迹仍窄）',
  'note-axis': '不同轴：说明与主数据区、页面主容器都不在同一轴上',
  'note-clipped': '自身裁切：说明 scrollWidth > clientWidth',
  'note-hidden-text': '文本非空但没有可见字形盒',
  'page-overflow@<vw>': '页面级横向溢出',
  'unexpected-detail-main': 'wide 族页面出现了 main.detail-main',
  'missing-detail-main': 'detail 族页面没有 main.detail-main',
  'unclassified-layout': '路由解析不出布局族',
  'data-region-missing': '判不出主数据区'
};

/* ------------------------------------------------------------------ inspect */
if (arg('inspect')) {
  const file = path.resolve(arg('inspect'));
  const report = JSON.parse(fs.readFileSync(file, 'utf8'));
  const metrics = report.metrics || {};
  const containers = Object.entries(metrics)
    .filter(([, value]) => Array.isArray(value) && value.length && typeof value[0] === 'object' && 'route' in value[0])
    .map(([key, value]) => ({ key: `metrics.${key}`, rows: value.length, sample: Object.keys(value[0]).join(',') }));
  console.log(`报告：${path.relative(ROOT, file).replace(/\\/g, '/')}`);
  console.log(`total=${report.total} failed=${report.failed}`);
  console.log('数组型容器：');
  for (const container of containers) console.log(`  - ${container.key} · ${container.rows} 行 · 字段 ${container.sample}`);
  const noteRows = Array.isArray(metrics.layoutNotes) ? metrics.layoutNotes : [];
  const pageRows = Array.isArray(metrics.layoutViolations) ? metrics.layoutViolations : [];
  const tally = (rows, pick) => {
    const out = {};
    for (const row of rows) for (const code of (pick(row) || [])) out[code] = (out[code] || 0) + 1;
    return out;
  };
  console.log(`条级码计数（metrics.layoutNotes）：${JSON.stringify(tally(noteRows, row => row.codes))}`);
  console.log(`页级码计数（metrics.layoutViolations）：${JSON.stringify(tally(pageRows, row => row.codes))}`);
  const narrowKeys = new Set(noteRows
    .filter(row => (row.codes || []).some(code => NARROW_CODE_RE.test(String(code))))
    .map(row => `${row.route}#${row.index !== undefined ? row.index : row.noteIndex}`));
  console.log(`按**接受码集合** ${NARROW_CODE_RE} 判窄：条级命中 ${narrowKeys.size} 条`);
  if (fs.existsSync(TRUTH)) {
    const truth = JSON.parse(fs.readFileSync(TRUTH, 'utf8'));
    const expected = [...truth.sets.caughtByOldCriteria, ...truth.sets.onlyNewTruth].map(row => `${row.route}#${row.index}`);
    const fine = truth.sets.alreadyFine.map(row => `${row.route}#${row.index}`);
    console.log(`  与 truth-401 的 156 条真值：命中 ${expected.filter(key => narrowKeys.has(key)).length}/156 · 漏 ${expected.filter(key => !narrowKeys.has(key)).length}`);
    console.log(`  对照组 245 条里被误报：${fine.filter(key => narrowKeys.has(key)).length}`);
    const split = { 'note-narrow': 0, 'note-ink-narrow': 0 };
    for (const row of noteRows) {
      const key = `${row.route}#${row.index !== undefined ? row.index : row.noteIndex}`;
      if (!expected.includes(key)) continue;
      for (const code of (row.codes || [])) if (split[code] !== undefined) split[code] += 1;
    }
    console.log(`  真值命中里的码分布：${JSON.stringify(split)}`);
  }
  process.exit(0);
}

/* --------------------------------------------------------------------- emit */
if (!process.argv.includes('--emit')) {
  console.error('用法：--inspect=<report.json> 或 --emit');
  process.exit(2);
}
if (!fs.existsSync(TRUTH)) { console.error(`找不到真值 ${TRUTH}`); process.exit(2); }
const truth = JSON.parse(fs.readFileSync(TRUTH, 'utf8'));

/**
 * 实测码分布（t25 起）：**不再**用「48 条盒宽 + 108 条字迹」这种假划分去代表口径归属。
 * 取样源 = `geometry/attribution-census.json`（它逐条回查真实 `--dir=dist.baseline` 报告得出：
 * 盒宽窄 ①=156（含 48 条单行）· 字迹窄 ②=108 ⊆ ① ⇒ 108 条同时带两个码、48 条只带盒宽码）。
 * 拿不到实测分布就**明说并退出**，不编一份出来。
 */
const CENSUS = arg('census') ? path.resolve(arg('census')) : path.join(G, 'attribution-census.json');
if (!fs.existsSync(CENSUS)) {
  console.error(`找不到实测归属 ${CENSUS}`);
  console.error(`先跑：node ${path.join(G, 'attribution-census.cjs')}`);
  console.error('（合成夹具按**真实码分布**取样；没有实测分布就明说，不编。）');
  process.exit(2);
}
const census = JSON.parse(fs.readFileSync(CENSUS, 'utf8'));
const keyOf = row => `${row.route}#${row.index}`;
const unionKeys = [...truth.sets.caughtByOldCriteria, ...truth.sets.onlyNewTruth].map(keyOf);
/** 位置切片（`index === 0`）：键名是历史命名，别读成"旧口径命中集"（见文件头 ⚠️） */
const positionalFirstKeys = truth.sets.caughtByOldCriteria.map(keyOf);
const fineKeys = truth.sets.alreadyFine;
const measuredCodes = census.narrowCodesByKey || {};
const missingMeasured = unionKeys.filter(key => !measuredCodes[key]);
if (missingMeasured.length) {
  console.error(`实测归属里缺 ${missingMeasured.length} 条（样例 ${missingMeasured.slice(0, 5).join(' ')}）⇒ 分布不完整，拒绝造夹具`);
  process.exit(2);
}
/** 真值里的 before 盒宽（156 条窄说明全是 452.81；对照组是它们的正常宽度） */
const beforeWidthByKey = new Map();
for (const set of ['caughtByOldCriteria', 'onlyNewTruth', 'alreadyFine']) {
  for (const row of truth.sets[set]) beforeWidthByKey.set(keyOf(row), row.beforeWidth);
}
console.log(`实测码分布：${path.relative(ROOT, CENSUS).replace(/\\/g, '/')} sha256 ${crypto.createHash('sha256').update(fs.readFileSync(CENSUS)).digest('hex').slice(0, 16)}…`);
fs.mkdirSync(OUT_DIR, { recursive: true });

const noteRow = (key, codes) => {
  const [route, index] = [key.slice(0, key.lastIndexOf('#')), Number(key.slice(key.lastIndexOf('#') + 1))];
  const beforeWidth = beforeWidthByKey.has(key) ? beforeWidthByKey.get(key) : null;
  return {
    route, index, position: index === 0 ? 'first' : 'last', codes,
    kind: 'collection', family: 'wide', regionSel: '.ctable',
    column: 1380,
    width: beforeWidth !== null ? beforeWidth : (codes.includes('note-narrow') ? 452.81 : 1380),
    textWidth: beforeWidth !== null ? beforeWidth : (codes.includes('note-narrow') ? 452.81 : 1380),
    ratio: codes.some(code => NARROW_CODE_RE.test(code)) ? 0.328 : 1, text: '（合成夹具）'
  };
};
const pageRow = route => ({
  route, kind: 'collection', family: 'wide', codes: ['note-narrow', 'note-axis'],
  noteKeys: [], noteCount: 1, regionSel: '.ctable', column: 1380, textWidth: 452.81
});

/**
 * ① 并集口径（**按实测码分布**）：156 条都带 `note-narrow`，其中 108 条多行的**同时**带
 *    `note-ink-narrow` ⇒ 并集 156/156。这才是真实 `--dir=dist.baseline` 报告的形状。
 */
const case1Notes = unionKeys.map(key => noteRow(key, measuredCodes[key].slice()));
/**
 * ② 位置切片口径（历史世界）：只有 `index===0` 那 48 条被标出来（t2 只量文档序第一条）
 *    ⇒ 必须被消费者认出「漏 108」。这里刻意把字迹码拿掉，模拟"那一轮还没有字迹口径"。
 */
const case2Notes = positionalFirstKeys.map(key => noteRow(key, measuredCodes[key].filter(code => code !== 'note-ink-narrow')));
/**
 * ③ 误报：并集 156 条 + 1 条打在对照组（alreadyFine）上的窄码 ⇒ 必须 fail 并指名。
 *    该行的 width 取自真值（对照组是正常宽度）——它模拟的是"判据报了一个不该报的码"，
 *    行内宽度与码刻意不一致，不要拿它当产物读数的样例。
 */
const falsePositiveKey = keyOf(fineKeys[0]);
const case3Notes = [...case1Notes, noteRow(falsePositiveKey, ['note-narrow', 'note-axis'])];

const pageSetOf = keys => [...new Set(keys.map(row => row.route))].sort();
const build = (name, noteRows, extraPageRoutes) => {
  const narrowNotes = noteRows.filter(row => (row.codes || []).some(code => NARROW_CODE_RE.test(code)));
  const narrowRoutes = pageSetOf(narrowNotes.map(row => ({ route: row.route })));
  const routes = [...new Set([...narrowRoutes, ...(extraPageRoutes || [])])].sort();
  const report = {
    target: 'http://127.0.0.1:0/（合成夹具，无浏览器）',
    generatedAt: new Date().toISOString(),
    synthetic: true,
    syntheticNote: `t18 合成输入（t25 起按**实测码分布**取样）：${name}。真值来源 ${path.relative(ROOT, TRUTH).replace(/\\/g, '/')}；码分布来源 ${path.relative(ROOT, CENSUS).replace(/\\/g, '/')}`
      + `（实测：156 条都带 note-narrow，其中 108 条多行的同时带 note-ink-narrow；⚠️ 不是「48 盒宽 + 108 字迹」的划分）`,
    total: 842, failed: routes.length,
    metrics: {
      layoutNotes: noteRows,
      layoutNotesAt1600: noteRows,
      layoutSweep: {
        total: 186, wide: 55, detail: 131, other: 0, notesChecked: 105, notesJudged: noteRows.length,
        // 与真实报告同一口径：`narrowNotes` 数**条**、`narrowNotePages` 数**页**（合成夹具按实测填，别再把两者混用）
        narrowNotes: narrowNotes.length, narrowNotePages: narrowRoutes.length,
        narrowNotesAt1600: narrowNotes.length, overflowPages: 0, unexpectedDetailMain: 0,
        missingDetailMain: 0, unclassified: 0, desktopViewports: [1440, 1600]
      },
      layoutViolations: routes.map(pageRow)
    },
    checks: []
  };
  const file = path.join(OUT_DIR, `${name}.json`);
  fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`写出 ${path.relative(ROOT, file).replace(/\\/g, '/')} · 条级 ${noteRows.length} 行 · 页级 ${routes.length} 页`
    + ` · 码分布 ${JSON.stringify(noteRows.flatMap(row => row.codes).reduce((acc, code) => (NARROW_CODE_RE.test(code) ? (acc[code] = (acc[code] || 0) + 1, acc) : acc), {}))}`);
  return file;
};

console.log(`合成输入（实测码分布：156 条都带 note-narrow；其中 108 条多行同时带 note-ink-narrow；对照组 245 条）：`);
build('case1-union-156', case1Notes);
console.log(`  ↳ case2 是**位置切片**口径（t2 只量文档序第一条 = index===0 的 48 条），不是"旧口径命中集"：`);
build('case2-narrow-only-48', case2Notes);
build('case3-false-positive', case3Notes, [falsePositiveKey.slice(0, falsePositiveKey.lastIndexOf('#'))]);
console.log(`误报选点：${falsePositiveKey}（对照组 alreadyFine 的第 1 条）`);
console.log(`接受码集合：${NARROW_CODE_RE}`);
