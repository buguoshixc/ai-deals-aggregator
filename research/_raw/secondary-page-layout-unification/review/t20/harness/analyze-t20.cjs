#!/usr/bin/env node
/**
 * T20 · 读数分析（全部输入都是本轮 matrix 自己跑出来的报告；不引用 t19 的任何中间产物）。
 * 产出 runs/analysis-t20.json + 控制台摘要。
 * 用法：node analyze-t20.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../../../../..');
const T20 = path.join(ROOT, 'research', '_raw', 'secondary-page-layout-unification', 'review', 't20');
const G = path.join(ROOT, 'research', '_raw', 'secondary-page-layout-unification', 'geometry');
const R = id => path.join(T20, 'runs', id);
const load = id => {
  const p = path.join(R(id), 'report.json');
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
};
const truth = JSON.parse(fs.readFileSync(path.join(G, 'truth-401.json'), 'utf8'));
const before = JSON.parse(fs.readFileSync(path.join(G, 'all-notes-before.json'), 'utf8'));

const out = {};
const key = row => `${row.route}#${row.index}`;
const codesOf = row => row.codes || [];
const hasNarrow = row => codesOf(row).some(c => /^note-narrow$/.test(c));
const hasInk = row => codesOf(row).includes('note-ink-narrow');
const failedNames = rep => rep.checks.filter(c => !c.ok).map(c => c.name);
const checkByName = (rep, frag) => rep.checks.find(c => c.name.includes(frag));

const dist = load('new-dist');
const base = load('new-baseline');
const oldBase = load('old-baseline');

// ---------- 1. dist：零误报 + 401 条读数 + 319 复算 ----------
if (dist) {
  const notes1440 = dist.metrics.layoutNotes;
  const notes1600 = dist.metrics.layoutNotesAt1600;
  const singleLine = rows => rows.filter(n => n.rendered && !n.vertical && n.lineCount === 1 && n.widestLine < 0.85 * n.column - 0.01);
  const wouldBeFalse = rows => rows.filter(n => n.rendered && !n.vertical && n.lineCount === 1 && n.widestLine < 0.85 * n.column);
  out.dist = {
    exitEvidence: { total: dist.total, failed: dist.failed },
    layoutNotes: notes1440.length, layoutNotesAt1600: notes1600.length,
    rowsWithCodes: notes1440.filter(n => codesOf(n).length).length,
    notesMissingReadings: notes1440.filter(n => n.lineCount === undefined || n.widestLine === undefined || n.column === undefined).length,
    codesHistogram: notes1440.reduce((acc, n) => { for (const c of codesOf(n)) acc[c] = (acc[c] || 0) + 1; return acc; }, {}),
    sweep: { narrow: dist.metrics.layoutSweep.narrowNotes, ink: dist.metrics.layoutSweep.inkNarrowNotes, union: dist.metrics.layoutSweep.narrowUnionNotes, hiddenText: dist.metrics.layoutSweep.hiddenTextNotes, unrendered: dist.metrics.layoutSweep.unrenderedNotes },
    singleLineCount1440: singleLine(notes1440).length,
    singleLineCount1600: singleLine(notes1600).length,
    withoutLineGate1440: wouldBeFalse(notes1440).length,
    withoutLineGate1600: wouldBeFalse(notes1600).length,
    ch70Values1440: [...new Set(notes1440.map(n => n.ch70))].sort((a, b) => a - b),
    lineCountMin: Math.min(...notes1440.map(n => n.lineCount)),
    noteNarrowPages: dist.metrics.layoutSweep.narrowNotePages
  };
}

// ---------- 2. baseline：并集 156/48 + 与真值的逐条集合 ----------
if (base) {
  const notes = base.metrics.layoutNotes;
  const narrow = notes.filter(hasNarrow);
  const ink = notes.filter(hasInk);
  const truthNarrowKeys = [...truth.sets.caughtByOldCriteria, ...truth.sets.onlyNewTruth].map(key);
  const truthCaughtKeys = truth.sets.caughtByOldCriteria.map(key);
  const truthOnlyNewKeys = truth.sets.onlyNewTruth.map(key);
  const reportNarrowKeys = narrow.map(key);
  const reportInkKeys = ink.map(key);
  const setOf = arr => new Set(arr);
  const diff = (a, b) => [...setOf(a)].filter(x => !b.has(x));
  const tN = setOf(truthNarrowKeys), rN = setOf(reportNarrowKeys), rI = setOf(reportInkKeys), tC = setOf(truthCaughtKeys), tO = setOf(truthOnlyNewKeys);
  const rowByKey = new Map(notes.map(n => [key(n), n]));
  out.baseline = {
    exitEvidence: { total: base.total, failed: base.failed },
    narrowCount: narrow.length, inkCount: ink.length,
    unionCount: base.metrics.layoutSweep.narrowUnionNotes, unionPages: base.metrics.layoutSweep.narrowUnionNotePages,
    narrowPages: base.metrics.layoutSweep.narrowNotePages, inkPages: base.metrics.layoutSweep.inkNarrowNotePages,
    allNarrowBoxWidth45281: narrow.every(n => Math.abs(n.width - 452.81) < 0.005),
    narrowWidths: [...new Set(narrow.map(n => n.width))],
    narrowSingleLine: narrow.filter(n => n.lineCount === 1).length,
    narrowMultiLine: narrow.filter(n => n.lineCount >= 2).length,
    inkSingleLine: ink.filter(n => n.lineCount === 1).length,
    inkMinusNarrow: [...rI].filter(k => !rN.has(k)).length,
    truthMinusReport: diff(truthNarrowKeys, rN).length,
    reportMinusTruth: diff(reportNarrowKeys, tN).length,
    truthNarrowEqualsReportNarrow: diff(truthNarrowKeys, rN).length === 0 && diff(reportNarrowKeys, tN).length === 0,
    caughtByOldCriteria_allMultiLine: truthCaughtKeys.every(k => { const n = rowByKey.get(k); return n && n.lineCount >= 2; }),
    caughtByOldCriteria_allInked: truthCaughtKeys.every(k => rI.has(k)),
    caughtByOldCriteria_allNarrowCode: truthCaughtKeys.every(k => rN.has(k)),
    caughtByOldCriteria_lineCounts: [...new Set(truthCaughtKeys.map(k => rowByKey.get(k) && rowByKey.get(k).lineCount))].sort((a, b) => a - b),
    onlyNewTruth_singleLine: truthOnlyNewKeys.filter(k => { const n = rowByKey.get(k); return n && n.lineCount === 1; }).length,
    onlyNewTruth_multiLine: truthOnlyNewKeys.filter(k => { const n = rowByKey.get(k); return n && n.lineCount >= 2; }).length,
    truthCaughtByOld_singleLineIn123El: truthCaughtKeys.filter(k => { const n = rowByKey.get(k); return n && n.lineCount === 1; }).length,
    // 真值里那 48 条（index 0）是不是「① 里那 48 条单行」？
    truthCaughtIntersectSingleLineOfReport: truthCaughtKeys.filter(k => { const n = rowByKey.get(k); return n && n.lineCount === 1; }).length,
    alreadyFineFalsePositives: notes.filter(n => (hasNarrow(n) || hasInk(n)) && !tN.has(key(n))).length,
    ch70Values: [...new Set(notes.map(n => n.ch70))].sort((a, b) => a - b),
    sample760: (() => { const c = checkByName(base, '@760 样本集'); return c && { ok: c.ok, head: String(c.detail).slice(0, 120), codeCount: (String(c.detail).match(/^(\d+) 条违规码/) || [])[1] }; })(),
    sample360: (() => { const c = checkByName(base, '@360 样本集'); return c && { ok: c.ok, detail: String(c.detail).slice(0, 200) }; })(),
    sweep: base.metrics.layoutSweep.inkScopeSampleViewports,
    layoutNotes: notes.length
  };
}

// ---------- 3. 改前 / 改后：失败断言逐名对照 ----------
if (base && oldBase) {
  const nF = failedNames(base), oF = failedNames(oldBase);
  const sN = new Set(nF), sO = new Set(oF);
  out.oldVsNewBaseline = {
    newTotal: base.total, newFailed: base.failed, oldTotal: oldBase.total, oldFailed: oldBase.failed,
    onlyNew: nF.filter(x => !sO.has(x)), onlyOld: oF.filter(x => !sN.has(x)),
    sameFailingSet: nF.length === oF.length && nF.every(x => sO.has(x)),
    oldSample760: (() => { const c = checkByName(oldBase, '@760 样本集'); return c && { ok: c.ok, head: String(c.detail).slice(0, 220), codeCount: (String(c.detail).match(/^(\d+) 条违规码|(\d+) 条违规码/) || [])[2] }; })(),
    oldSample360: (() => { const c = checkByName(oldBase, '@360 样本集'); return c && { ok: c.ok, detail: String(c.detail).slice(0, 200) }; })(),
    newSample760Keys: (() => { const c = checkByName(base, '@760 样本集'); const d = String(c.detail); const mm = d.match(/\[([^\]]*)\]/); return mm ? mm[1].split(', ').length : null; })(),
    // 旧口径在 baseline 上的并集/藏字读数（925/…）是否同数
    oldSweep: { narrow: oldBase.metrics.layoutSweep.narrowNotes, ink: oldBase.metrics.layoutSweep.inkNarrowNotes, union: oldBase.metrics.layoutSweep.narrowUnionNotes, hiddenText: oldBase.metrics.layoutSweep.hiddenTextNotes, unrendered: oldBase.metrics.layoutSweep.unrenderedNotes },
    newSweep: { narrow: base.metrics.layoutSweep.narrowNotes, ink: base.metrics.layoutSweep.inkNarrowNotes, union: base.metrics.layoutSweep.narrowUnionNotes, hiddenText: base.metrics.layoutSweep.hiddenTextNotes, unrendered: base.metrics.layoutSweep.unrenderedNotes },
    failedNames: nF
  };
}

// ---------- 4. 反转实验：clean / grid760 ----------
const describeRun = id => {
  const rep = load(id);
  if (!rep) return null;
  const s760 = checkByName(rep, '@760 样本集');
  const s360 = checkByName(rep, '@360 样本集');
  const detail = s760 ? String(s760.detail) : '';
  return {
    total: rep.total, failed: rep.failed, failingNames: failedNames(rep).slice(0, 6),
    sample760: s760 && { ok: s760.ok, codes: (detail.match(/^(\d+) 条违规码/) || [])[1], keys: (detail.match(/\[([^\]]*)\]/) || [, ''])[1], widths: [...detail.matchAll(/最宽一行 ([\d.]+)px/g)].map(m => Number(m[1])) },
    sample360: s360 && { ok: s360.ok, detail: String(s360.detail).slice(0, 120) },
    inkNarrow: rep.metrics.layoutSweep.inkNarrowNotes, union: rep.metrics.layoutSweep.narrowUnionNotes
  };
};
out.clean = describeRun('new-clean');
out.grid760 = { new: describeRun('new-grid760'), old: describeRun('old-grid760') };
out.contents = { new: describeRun('new-contents'), old: describeRun('old-contents') };
if (out.contents.old) {
  const rep = load('old-contents');
  const codes = {};
  for (const c of rep.checks) if (!c.ok) {
    const d = String(c.detail);
    for (const m of d.matchAll(/note-(narrow|axis|clipped|ink-narrow|hidden-text)/g)) codes[m[1]] = (codes[m[1]] || 0) + 1;
  }
  out.contents.old.codeHistogram = codes;
}
if (out.contents.new) {
  const rep = load('new-contents');
  const codes = {};
  for (const c of rep.checks) if (!c.ok) {
    const d = String(c.detail);
    for (const m of d.matchAll(/note-(narrow|axis|clipped|ink-narrow|hidden-text)/g)) codes[m[1]] = (codes[m[1]] || 0) + 1;
  }
  out.contents.new.codeHistogram = codes;
}

// ---------- 5. all-notes-before 交叉核对（独立探针数据集） ----------
{
  const narrow156 = [];
  let pages = 0, total401 = 0;
  for (const page of before.pages) {
    const d = page.viewports['1440'];
    if (!d || !d.notes || !d.notes.length) continue;
    pages += 1; total401 += d.notes.length;
    for (const n of d.notes) if (n.narrowerThanColumn) narrow156.push({ key: `${page.route}#${n.index}`, width: n.width });
  }
  out.crossCheckProbe = {
    pages, totalNotes: total401,
    narrow: narrow156.length,
    allWidth45281: narrow156.every(n => Math.abs(n.width - 452.81) < 0.005),
    widths: [...new Set(narrow156.map(n => n.width))]
  };
}

fs.writeFileSync(path.join(T20, 'runs', 'analysis-t20.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
