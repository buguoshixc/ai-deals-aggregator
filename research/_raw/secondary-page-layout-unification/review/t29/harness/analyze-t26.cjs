#!/usr/bin/env node
/**
 * T29 · 读数分析（输入全部是本轮矩阵自己跑出来的报告）。
 * 用法：node analyze-t29.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../../../../../..');
const T29 = path.join(ROOT, 'research', '_raw', 'secondary-page-layout-unification', 'review', 't29');
const R = id => path.join(T29, 'runs', id);
const load = id => { const p = path.join(R(id), 'report.json'); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null; };
const names = rep => (rep.checks || []).map(c => c.name);
const failedNames = rep => (rep.checks || []).filter(c => !c.ok).map(c => c.name);
const byName = (rep, frag) => (rep.checks || []).find(c => c.name.includes(frag));
const codesIn = rep => {
  const hist = {};
  for (const n of rep.metrics.layoutNotes || []) for (const c of (n.codes || [])) hist[c] = (hist[c] || 0) + 1;
  return hist;
};
const codesInText = rep => {
  const hist = {};
  for (const c of (rep.checks || [])) if (!c.ok) for (const m of String(c.detail).matchAll(/note-(narrow|ink-narrow|axis|clipped|hidden-text|unrendered)/g)) hist[m[1]] = (hist[m[1]] || 0) + 1;
  return hist;
};
const sweepOf = rep => {
  const s = (rep.metrics || {}).layoutSweep || {};
  const l = (rep.metrics || {});
  return {
    unrenderedNotes: l.unrenderedNotes, unrenderedNoscriptNotes: l.unrenderedNoscriptNotes, unrenderedTextNotes: l.unrenderedTextNotes, unrenderedUnexplainedNotes: l.unrenderedUnexplainedNotes,
    unrenderedNoscriptNotesAt1600: l.unrenderedNoscriptNotesAt1600, unrenderedTextNotesAt1600: l.unrenderedTextNotesAt1600,
    sweepUnrendered: s.unrenderedNotes, sweepNoscript: s.unrenderedNoscriptNotes, sweepText: s.unrenderedTextNotes,
    narrow: s.narrowNotes, ink: s.inkNarrowNotes, union: s.narrowUnionNotes, unionPages: s.narrowUnionNotePages,
    hiddenText: s.hiddenTextNotes, rows: (l.layoutNotes || []).length, rows1600: (l.layoutNotesAt1600 || []).length
  };
};

const out = {};
for (const id of ['new-dist', 'new-baseline', 'old-baseline', 'new-clean', 'new-bare-fs0', 'old-bare-fs0', 'new-bare-fs0-plans', 'new-noscript-key', 'new-noscript-visible']) {
  const rep = load(id);
  if (!rep) continue;
  const ub = byName(rep, '未渲染说明：上界断言');
  out[id] = {
    total: rep.total, failed: rep.failed, failingNames: failedNames(rep),
    metrics: sweepOf(rep), codesFromDetails: codesInText(rep),
    upperBound: ub && { ok: ub.ok, detail: String(ub.detail).slice(0, 300) },
    pageLevel1440: (() => { const c = byName(rep, '@1440 逐条页面级说明'); return c && { ok: c.ok, detail: String(c.detail).slice(0, 260) }; })(),
    unrenderedRowsIn1440: (rep.metrics.layoutNotes || []).filter(n => n.unrendered).map(n => ({ key: `${n.route}#${n.index}`, noscriptSubtree: n.noscriptSubtree, textLength: n.textLength, rawTextLength: n.rawTextLength, glyphRects: n.glyphRects, codes: n.codes }))
  };
}
// 名称多重集：old-baseline(848) vs new-baseline(852)
if (out['new-baseline'] && out['old-baseline']) {
  const n = names(load('new-baseline')), o = names(load('old-baseline'));
  const cnt = a => { const m = new Map(); for (const x of a) m.set(x, (m.get(x) || 0) + 1); return m; };
  const cn = cnt(n), co = cnt(o); const removed = [], added = [];
  for (const [k, v] of co) { const d = v - (cn.get(k) || 0); for (let i = 0; i < d; i++) removed.push(k); }
  for (const [k, v] of cn) { const d = v - (co.get(k) || 0); for (let i = 0; i < d; i++) added.push(k); }
  out.nameDiff = { newNames: n.length, oldNames: o.length, removed, added };
}
fs.writeFileSync(path.join(T29, 'runs', 'analysis-t29.json'), JSON.stringify(out, null, 2));
const brief = {};
for (const [k, v] of Object.entries(out)) brief[k] = { total: v.total, failed: v.failed, failingNames: v.failingNames.length, metrics: v.metrics, upperBound: v.upperBound && { ok: v.upperBound.ok, detail: v.upperBound.detail.slice(0, 160) } };
console.log(JSON.stringify({ ...brief, nameDiff: out.nameDiff }, null, 2));
