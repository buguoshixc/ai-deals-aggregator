#!/usr/bin/env node
/**
 * secondary-page-layout-unification · **实测归属**普查（t25 证据）
 *
 * 为什么要有它：`geometry/truth-401.json` 把改动前的 156 条窄说明切成
 * `caughtByOldCriteria`（48 = `index===0` 位置切片）与 `onlyNewTruth`（108）两批 ——
 * 这是**位置切分**，键名却是「旧口径命中」的语气，round 3 的 R3-2 就是从这里读歪的。
 * 本脚本用**真实报告**（不是推测）逐条回查这三件事：
 *   ① 盒宽窄 `note-narrow`     命中多少条？
 *   ② 字迹窄 `note-ink-narrow` 命中多少条？是否 ② ⊆ ①？
 *   ③ 位置切片那 48 条到底长什么样（单行还是多行）？与"旧口径命中集"是不是同一批？
 *
 * 输入：truth-401.json（只读）+ 若干份真实 `verify-site.js --json=` 报告（只读）。
 * 输出：geometry/attribution-census.json（供 make-synthetic-reports.cjs 按真实码分布取样）
 *
 * 用法：
 *   node …/geometry/attribution-census.cjs                       # 用默认的报告清单
 *   node …/geometry/attribution-census.cjs --reports=a.json,b.json
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const argOf = name => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const ROOT = path.join(__dirname, '..', '..', '..', '..');
const rel = p => path.relative(ROOT, p).replace(/\\/g, '/');
const sha256 = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

const TRUTH = path.resolve(argOf('truth') || path.join(__dirname, 'truth-401.json'));
const OUT = path.resolve(argOf('out') || path.join(__dirname, 'attribution-census.json'));

/** 默认报告清单：都是**真实跑出来**的整轮报告（dist.baseline 的优先，另附 dist 作对照） */
const DEFAULT_REPORTS = [
  'research/_raw/secondary-page-layout-unification/review/t20/runs/new-baseline/report.json',
  'research/_raw/secondary-page-layout-unification/teeth/_scratch/r4-m0.json',
  'research/_raw/secondary-page-layout-unification/t21/preserve/run3-M0-baseline.json',
  'research/_raw/secondary-page-layout-unification/review/t20/runs/new-dist/report.json',
  'research/_raw/secondary-page-layout-unification/teeth/_scratch/r4-green.json'
];
const reports = (argOf('reports') ? argOf('reports').split(',') : DEFAULT_REPORTS)
  .map(p => path.resolve(ROOT, p))
  .filter(p => fs.existsSync(p));
if (!reports.length) {
  console.error('❌ 一份真实报告都没有：本普查的一切读数都来自真实报告，没有就明说，不推测。');
  console.error('   传 --reports=<a.json,b.json>，或把默认清单里任意一份恢复到原路径。');
  process.exit(2);
}

const truth = JSON.parse(fs.readFileSync(TRUTH, 'utf8'));
const key = row => `${row.route}#${row.index}`;
const union = [...truth.sets.caughtByOldCriteria, ...truth.sets.onlyNewTruth];
const unionKeys = union.map(key);
const setOf = list => new Set(list.map(key));
const positionalFirst = setOf(truth.sets.caughtByOldCriteria);   // index===0 位置切片（历史键名 caughtByOldCriteria）
const remainder = setOf(truth.sets.onlyNewTruth);                 // 其余（历史键名 onlyNewTruth）
const alreadyFine = setOf(truth.sets.alreadyFine);

/** 窄码的接受集合（与 gate-vs-truth.cjs / make-synthetic-reports.cjs 逐字相同：两处必须一起改） */
const NARROW_CODE_RE = /^note-(ink-)?narrow$/;
const isNarrow = code => NARROW_CODE_RE.test(String(code));

const tally = (rows, pick) => {
  const out = {};
  for (const row of rows) for (const code of (pick(row) || [])) out[code] = (out[code] || 0) + 1;
  return Object.fromEntries(Object.entries(out).sort());
};

const perReport = [];
const narrowCodesByKey = new Map();
for (const reportPath of reports) {
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const noteRows = report.metrics && Array.isArray(report.metrics.layoutNotes) ? report.metrics.layoutNotes : null;
  if (!noteRows) { console.error(`⚠️ 跳过（没有 metrics.layoutNotes 条级容器）：${rel(reportPath)}`); continue; }
  const at1600 = report.metrics && Array.isArray(report.metrics.layoutNotesAt1600) ? report.metrics.layoutNotesAt1600 : null;
  const byKey = new Map(noteRows.map(row => [key(row), row]));
  const codesAt = k => (byKey.get(k) ? byKey.get(k).codes || [] : null);
  const missing = unionKeys.filter(k => !byKey.has(k));
  const narrowOn = list => [...list].filter(k => (codesAt(k) || []).some(isNarrow));
  const row = {
    report: rel(reportPath), sha256: sha256(reportPath), bytes: fs.statSync(reportPath).size,
    total: report.total, failed: report.failed, dir: report.dir || null,
    noteRows: noteRows.length,
    unionCovered: unionKeys.length - missing.length, unionMissing: missing,
    narrowCodes: {
      onUnion156: tally(unionKeys.map(k => ({ codes: codesAt(k) || [] })), r => r.codes),
      onPositionalFirst48: tally([...positionalFirst].map(k => ({ codes: codesAt(k) || [] })), r => r.codes),
      onRemainder108: tally([...remainder].map(k => ({ codes: codesAt(k) || [] })), r => r.codes),
      onAlreadyFine245: tally([...alreadyFine].map(k => ({ codes: codesAt(k) || [] })), r => r.codes)
    },
    counts: {
      boxNarrowOnUnion: narrowOn(unionKeys).length,
      inkNarrowOnUnion: unionKeys.filter(k => (codesAt(k) || []).includes('note-ink-narrow')).length,
      boxOnlyOnUnion: unionKeys.filter(k => { const c = codesAt(k) || []; return c.includes('note-narrow') && !c.includes('note-ink-narrow'); }).length,
      inkOnlyOnUnion: unionKeys.filter(k => { const c = codesAt(k) || []; return c.includes('note-ink-narrow') && !c.includes('note-narrow'); }).length,
      bothOnUnion: unionKeys.filter(k => { const c = codesAt(k) || []; return c.includes('note-ink-narrow') && c.includes('note-narrow'); }).length,
      narrowOnAlreadyFine: narrowOn(alreadyFine).length,
      positionalFirstWithInk: [...positionalFirst].filter(k => (codesAt(k) || []).includes('note-ink-narrow')).length,
      positionalFirstSingleLine: [...positionalFirst].filter(k => (byKey.get(k) || {}).lineCount === 1).length,
      boxOnlySingleLine: unionKeys.filter(k => { const c = codesAt(k) || []; return c.includes('note-narrow') && !c.includes('note-ink-narrow') && (byKey.get(k) || {}).lineCount === 1; }).length,
      remainderSingleLine: [...remainder].filter(k => (byKey.get(k) || {}).lineCount === 1).length
    },
    unionNarrowCodesByKey: Object.fromEntries(unionKeys.map(k => [k, (codesAt(k) || [])])),
    at1600: at1600 ? {
      boxNarrowOnUnion: at1600.filter(r => unionKeys.includes(key(r)) && (r.codes || []).includes('note-narrow')).length,
      inkNarrowOnUnion: at1600.filter(r => unionKeys.includes(key(r)) && (r.codes || []).includes('note-ink-narrow')).length,
      narrowOnAlreadyFine: at1600.filter(r => alreadyFine.has(key(r)) && (r.codes || []).some(isNarrow)).length
    } : null
  };
  // 只把 **dist.baseline** 的报告（failed > 0）作为取样源：绿轮的 156 条应当一条都不窄
  row.isBaselineRun = (report.failed || 0) > 0;
  if (row.isBaselineRun) {
    for (const k of unionKeys) {
      const exist = narrowCodesByKey.get(k);
      if (!exist) narrowCodesByKey.set(k, codesAt(k) || []);
      else if (JSON.stringify(exist) !== JSON.stringify(codesAt(k) || [])) narrowCodesByKey.set(k, exist); // 保留首见
    }
  }
  perReport.push(row);
}

/** 跨报告一致性：几份基线报告的「156 条逐条窄码集合」是否逐条相同 */
const baselineReports = perReport.filter(r => r.isBaselineRun);
const agree = baselineReports.length > 1
  ? baselineReports.every(r => JSON.stringify(r.unionNarrowCodesByKey) === JSON.stringify(baselineReports[0].unionNarrowCodesByKey))
  : null;

const primary = baselineReports[0] || perReport[0];
const checks = {
  '156 条在基线报告里有逐条读数（无缺行）': primary.unionMissing.length === 0,
  '① 盒宽窄 note-narrow 覆盖全部 156 条': primary.counts.boxNarrowOnUnion === 156,
  '② 字迹窄 note-ink-narrow = 108（多行的那批）': primary.counts.inkNarrowOnUnion === 108,
  '② ⊆ ①（没有"只带字迹码"的条）': primary.counts.inkOnlyOnUnion === 0,
  '位置切片 48 条全部是多行（48/48 带 note-ink-narrow）': primary.counts.positionalFirstWithInk === 48 && primary.counts.positionalFirstSingleLine === 0,
  '那 48 条单行说明全部落在"其余"批里（不在位置切片里）': primary.counts.boxOnlySingleLine === 48 && primary.counts.remainderSingleLine === 48,
  '对照组 245 条零窄码（误报 0）': primary.counts.narrowOnAlreadyFine === 0,
  '跨报告逐条一致（≥2 份基线报告时）': agree === null ? '（只有 1 份基线报告，跳过）' : agree
};

const out = {
  what: '改动前 156 条窄说明的**实测码归属**：① 盒宽窄 = 156（含 48 条单行）· ② 字迹窄 = 108 ⊆ ①（多行）；truth 的 48 是 index===0 位置切片、48/48 全多行 —— 与"旧口径（盒宽）命中集"不是同一批',
  at: new Date().toISOString(),
  generatedBy: 'research/_raw/secondary-page-layout-unification/geometry/attribution-census.cjs',
  truth: { path: rel(TRUTH), sha256: sha256(TRUTH), union: unionKeys.length, positionalFirst48: positionalFirst.size, remainder108: remainder.size, alreadyFine245: alreadyFine.size },
  acceptCodeSet: String(NARROW_CODE_RE),
  reports: perReport.map(r => ({
    report: r.report, sha256: r.sha256, bytes: r.bytes, total: r.total, failed: r.failed,
    isBaselineRun: r.isBaselineRun, noteRows: r.noteRows,
    counts: r.counts, narrowCodes: r.narrowCodes, at1600: r.at1600
  })),
  checks,
  conclusion: '在真实 dist.baseline 报告上逐条回查：156 条窄说明**全部**带 note-narrow（盒宽 452.81），其中 108 条多行的同时带 note-ink-narrow ⇒ ②⊆①；truth 的 caughtByOldCriteria(48) 是 index===0 位置切片，48/48 全多行（因此这 48 条在真实报告里同时带两个码），而"那 48 条单行说明"全在 onlyNewTruth 批里。消费者 gate-vs-truth.cjs 只消费并集（L74），故该切分不影响读数。',
  noticeToSyntheticFixture: '按本文件的 unionNarrowCodesByKey 取样（真实码分布），不要再用「48 盒宽 + 108 字迹」的假划分。',
  narrowCodesByKey: Object.fromEntries([...narrowCodesByKey.entries()].sort())
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`, 'utf8');

console.log(`实测归属普查：${rel(TRUTH)} × ${perReport.length} 份真实报告`);
for (const r of out.reports) {
  console.log(`  · ${r.report}  dir=${r.failed > 0 ? '（失败>0 ⇒ 基线轮）' : '（绿轮）'} total=${r.total} failed=${r.failed} 条级 ${r.noteRows}`);
  console.log(`      156 条上：${JSON.stringify(r.narrowCodes.onUnion156)} · 位置切片 48 条上：${JSON.stringify(r.narrowCodes.onPositionalFirst48)} · 其余 108 条上：${JSON.stringify(r.narrowCodes.onRemainder108)} · 对照组 245 条上：${JSON.stringify(r.narrowCodes.onAlreadyFine245)}`);
  console.log(`      盒宽窄 ${r.counts.boxNarrowOnUnion} · 字迹窄 ${r.counts.inkNarrowOnUnion} · 两者都 ${r.counts.bothOnUnion} · 只盒宽 ${r.counts.boxOnlyOnUnion} · 只字迹 ${r.counts.inkOnlyOnUnion} · 位置切片带字迹 ${r.counts.positionalFirstWithInk}/48 · 位置切片单行 ${r.counts.positionalFirstSingleLine} · 只盒宽且单行 ${r.counts.boxOnlySingleLine} · 其余批单行 ${r.counts.remainderSingleLine}`);
}
console.log('自检：');
for (const [name, ok] of Object.entries(out.checks)) console.log(`  ${ok === true ? '✅' : ok === false ? '❌' : 'ℹ️'} ${name}${typeof ok === 'string' ? ` — ${ok}` : ''}`);
console.log(`写出 ${rel(OUT)}`);
const bad = Object.values(out.checks).some(v => v === false);
process.exit(bad ? 1 : 0);
