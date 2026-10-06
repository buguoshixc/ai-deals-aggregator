#!/usr/bin/env node
/**
 * secondary-page-layout-unification · M0 反证的机器可读落盘（t3 证据）
 *
 * M0 的原话（prompt §22c）：**改动前产物（`--dir=dist.baseline`）跑同一条命令必须红**，
 * 且必须报出窄码。这一支把那一轮的读数从 `verify-site.js` 的报告里拆出来，
 * 逐页落盘（谁、什么码、说明多宽、主数据区多宽），而不是只在终端里看一眼。
 *
 * ★ 窄码是**并集**（t14 起，t18 适配）：`note-narrow`（盒宽窄，48 条）+ `note-ink-narrow`（字迹窄，108 条）。
 *   改之前这里只认 `note-narrow`，在并集口径下会把 108 条漏掉。见下方 `NARROW_CODE_RE`。
 *
 * 用法：
 *   node …/mutations-real/extract-m0.cjs \
 *        --report=…/mutations-real/M0-baseline.json \
 *        --exit=1 --log=…/mutations-real/M0-baseline.log \
 *        --dir=dist.baseline --out=…/mutations-real/M0-baseline-summary.json
 */

'use strict';

const fs = require('fs');
const path = require('path');

const arg = name => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const ROOT = path.join(__dirname, '..', '..', '..', '..');
const resolve = p => (p && path.isAbsolute(p) ? p : path.join(ROOT, p || '.'));
const REPORT = resolve(arg('report'));
const OUT = resolve(arg('out') || path.join(ROOT, 'research', '_raw', 'secondary-page-layout-unification', 'mutations-real', 'M0-baseline-summary.json'));
const EXIT = Number(arg('exit'));
const LOG = arg('log') ? resolve(arg('log')) : null;
const DIR = arg('dir') || 'dist.baseline';

if (!fs.existsSync(REPORT)) { console.error(`找不到报告 ${REPORT}`); process.exit(2); }
const report = JSON.parse(fs.readFileSync(REPORT, 'utf8'));
const metrics = report.metrics || {};
const checks = report.checks || [];
const failing = checks.filter(check => !check.ok);
const failingNon22c = failing.filter(check => !check.name.startsWith('§22c'));
const failing22c = failing.filter(check => check.name.startsWith('§22c'));

const sweep = metrics.layoutSweep || {};
const violations = metrics.layoutViolations || [];
const byCode = code => violations.filter(row => (row.codes || []).includes(code));

/**
 * ★ 窄写的**接受码集合**（并集口径，t14 起；t18 适配）：
 *   `note-narrow`（盒宽窄，48 条）+ `note-ink-narrow`（字迹窄，108 条）都算窄；
 *   `note-hidden-text` 不算窄（它是"没有可见字形盒"的独立缺陷）。
 * 改之前这里写 `byCode('note-narrow')` —— 在并集口径下只会数到 48 条，把 108 条漏掉。
 */
const NARROW_CODE_RE = /^note-(ink-)?narrow$/;
const narrowCodesOf = row => (row.codes || []).filter(code => NARROW_CODE_RE.test(String(code)));
const narrowNotes = violations.filter(row => narrowCodesOf(row).length > 0);
const narrowCodeTally = {};
for (const row of narrowNotes) for (const code of narrowCodesOf(row)) narrowCodeTally[code] = (narrowCodeTally[code] || 0) + 1;
const axisNotes = byCode('note-axis');

/** 条级（`metrics.layoutNotes`）里窄的条数与码分布 —— 页级只说明"哪几页"，条级才说明"几条" */
const noteRows = Array.isArray(metrics.layoutNotes) ? metrics.layoutNotes : [];
const narrowNoteRows = noteRows.filter(row => narrowCodesOf(row).length > 0);
const narrowNoteKeyCount = new Set(narrowNoteRows.map(row => `${row.route}#${row.index}`)).size;
const narrowNoteCodeTally = {};
for (const row of narrowNoteRows) for (const code of narrowCodesOf(row)) narrowNoteCodeTally[code] = (narrowNoteCodeTally[code] || 0) + 1;

/** 按路由族归类（目录页族 / 状态 / 变化 / 订阅 / 其余），让"48 页"这个数字可归因 */
const familyOf = route => {
  if (route === '') return '（首页）';
  if (/^category\//.test(route)) return 'category/*（目录页族）';
  if (/^(student|developer|free-api)\//.test(route)) return '（集合页）';
  if (/^vendor\//.test(route)) return 'vendor/*';
  if (/^deal\//.test(route)) return 'deal/*';
  if (/^models\//.test(route)) return 'models/*';
  if (/^need\//.test(route)) return 'need/*';
  if (/^plans/.test(route)) return 'plans*';
  if (/^archive\//.test(route)) return 'archive/*';
  return route.replace(/\/$/, '') || '（首页）';
};
const familyCounts = {};
for (const row of narrowNotes) {
  const key = familyOf(row.route);
  familyCounts[key] = (familyCounts[key] || 0) + 1;
}

const summary = {
  what: 'M0 反证：在**改动前**的产物上跑同一条验收命令，必须红，且必须报出窄码（note-narrow ∪ note-ink-narrow）',
  command: `node scripts/tools/verify-site.js --dir=${DIR}`,
  dir: DIR,
  at: new Date().toISOString(),
  exitCode: Number.isFinite(EXIT) ? EXIT : null,
  log: LOG ? path.relative(ROOT, LOG).replace(/\\/g, '/') : null,
  report: path.relative(ROOT, REPORT).replace(/\\/g, '/'),
  reportTotal: report.total, reportFailed: report.failed,
  failingChecks: failing.map(check => ({ name: check.name, detail: check.detail })),
  failingChecksNon22c: failingNon22c.length,
  failingChecks22c: failing22c.length,
  /** §22c 的全站计数（改动前） */
  layoutSweep: sweep,
  /** 命中清单：窄码逐页（route / 说明宽 / 主数据区宽 / 选择器 / 页面列宽 / 全部码） */
  narrowNotePages: narrowNotes.map(row => ({
    route: row.route, codes: row.codes, narrowCodes: narrowCodesOf(row),
    // r3 的报告把「说明宽」拆成了 column + textWidth（盒宽→字迹宽），r2 用的字段名是 note/region；
    // 两个都读，缺哪个就如实给 null，不编数。
    noteWidth: row.note !== undefined ? row.note : (row.textWidth !== undefined ? row.textWidth : null),
    regionWidth: row.region !== undefined ? row.region : (row.column !== undefined ? row.column : null),
    columnWidth: row.column !== undefined ? row.column : (row.region !== undefined ? row.column : null),
    regionSel: row.regionSel, kind: row.kind, family: row.family,
    noteKeys: row.noteKeys || null
  })),
  narrowNoteCount: narrowNotes.length,
  /** 命中的码分布：并集口径下必须能看出「48 走盒宽 / 108 走字迹」 */
  narrowCodeTally,
  narrowNoteFamilyCounts: familyCounts,
  /** 条级（metrics.layoutNotes）：窄的**条数**与码分布 —— 页级只说明"哪几页" */
  narrowNoteKeyCount,
  narrowNoteCodeTally,
  noteRowsTotal: noteRows.length,
  noteAxisCount: axisNotes.length,
  noteClippedCount: byCode('note-clipped').length,
  hiddenTextCount: byCode('note-hidden-text').length,
  overflowPages: byCode('page-overflow@1440').length + byCode('page-overflow@390').length,
  unexpectedDetailMain: byCode('unexpected-detail-main').length,
  missingDetailMain: byCode('missing-detail-main').length,
  unclassified: byCode('unclassified-layout').length,
  /** 冻结串（T1 放进 index.html 共享 <style> 的那条）：改动前不可能存在 */
  frozenRule: metrics.layoutFrozenRule || null,
  /** 主数据区判定分布（回落 <main> 的页面逐类登记） */
  dataRegions: metrics.layoutDataRegions || null,
  acceptCodeSet: String(NARROW_CODE_RE),
  verdict: (Number.isFinite(EXIT) ? EXIT !== 0 : true) && narrowNotes.length > 0 ? 'pass'
    : narrowNotes.length === 0 ? 'fail（没有报出窄码 note-narrow / note-ink-narrow）'
      : 'fail（命令没有红）',
  expectationNote: '预期：改动前产物上窄码命中 48 页 / 156 条（页数仍是 4 个 70ch 壳渲染出的页面集合；'
    + '条数在并集口径下是 48 条盒宽窄 + 108 条字迹窄）'
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

console.log(`M0 反证（--dir=${DIR}）exit=${summary.exitCode} · 断言 ${report.total} 项失败 ${report.failed} 项（非 §22c 的失败 ${failingNon22c.length} 项）`);
console.log(`窄码（${summary.acceptCodeSet}）**${narrowNotes.length} 页**${narrowNoteKeyCount ? ` / ${narrowNoteKeyCount} 条` : ''}`
  + ` · 码分布 ${JSON.stringify(narrowCodeTally)}${narrowNoteKeyCount ? `（条级 ${JSON.stringify(narrowNoteCodeTally)}）` : ''}`
  + ` · note-axis ${summary.noteAxisCount} 页 · 溢出 ${summary.overflowPages} 页 · unclassified ${summary.unclassified}`);
console.log(`按族归类：${Object.entries(familyCounts).map(([k, v]) => `${k} ${v} 页`).join(' · ')}`);
console.log(`前 8 个命中页：${narrowNotes.slice(0, 8).map(row => `${row.route || '/'}(${row.note !== undefined ? row.note : row.textWidth}px/${row.region !== undefined ? row.region : row.column}px)`).join(' ')}`);
console.log(`结论：${summary.verdict} · ${path.relative(ROOT, OUT).replace(/\\/g, '/')}`);
process.exit(summary.verdict === 'pass' ? 0 : 1);
