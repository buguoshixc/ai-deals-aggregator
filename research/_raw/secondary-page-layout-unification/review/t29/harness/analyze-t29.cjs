#!/usr/bin/env node
/**
 * T29 · 读数分析（全部输入 = 本轮矩阵自跑报告）。
 * 用法：node analyze-t29.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../../../../../..');
const T29 = path.join(ROOT, 'research', '_raw', 'secondary-page-layout-unification', 'review', 't29');
const load = id => {
  const p = path.join(T29, 'runs', id, 'report.json');
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
};
const UPPER = '未渲染说明：上界断言';
const METRIC_KEYS = ['unrenderedNotes', 'unrenderedNoTextNotes', 'unrenderedTextNotes', 'unrenderedNoscriptNotes', 'unrenderedUnexplainedNotes', 'unrenderedNoscriptNotesAt1600', 'unrenderedTextNotesAt1600'];
const IDS = ['new-dist', 'new-baseline', 'old-baseline', 'new-clean', 'new-key', 'old-key', 'new-key-mixed', 'new-bare-plans', 'new-empty', 'old-empty'];
const out = {};
for (const id of IDS) {
  const rep = load(id);
  if (!rep) continue;
  const m = rep.metrics || {};
  const ub = (rep.checks || []).find(c => c.name.includes(UPPER));
  const plansRows = (m.layoutNotes || []).filter(r => r.route === 'plans/' || r.route === 'plans/coding/')
    .map(r => ({ key: `${r.route}#${r.index}`, rendered: r.rendered, textLength: r.textLength, rawTextLength: r.rawTextLength, glyphRects: r.glyphRects, noscriptSubtree: r.noscriptSubtree, codes: r.codes }));
  out[id] = {
    total: rep.total, failed: rep.failed,
    failing: (rep.checks || []).filter(c => !c.ok).map(c => c.name),
    metrics: Object.fromEntries(METRIC_KEYS.map(k => [k, m[k]])),
    sweep: (() => { const s = m.layoutSweep || {}; return { narrow: s.narrowNotes, ink: s.inkNarrowNotes, union: s.unionNotes || s.narrowUnionNotes, unionPages: s.narrowUnionNotePages, hiddenText: s.hiddenTextNotes, rows: (m.layoutNotes || []).length }; })(),
    upperBound: ub && { ok: ub.ok, detail: String(ub.detail).slice(0, 300) },
    plansRows
  };
}
// 归一化名字多重集：old-baseline(pre-t28) × new-baseline
{
  const n = load('new-baseline'), o = load('old-baseline');
  if (n && o) {
    const norm = s => s.replace(/\d+ 个码/g, '<N> 个码').replace(/（\d+ 次导航）/g, '（<N> 次导航）');
    const names = rep => rep.checks.map(c => norm(c.name));
    const cnt = a => { const m = new Map(); for (const x of a) m.set(x, (m.get(x) || 0) + 1); return m; };
    const cn = cnt(names(n)), co = cnt(names(o)); const removed = [], added = [];
    for (const [k, v] of co) { const d = v - (cn.get(k) || 0); for (let i = 0; i < d; i++) removed.push(k); }
    for (const [k, v] of cn) { const d = v - (co.get(k) || 0); for (let i = 0; i < d; i++) added.push(k); }
    out.nameDiff = { newNames: names(n).length, oldNames: names(o).length, removed, added };
  }
}
fs.writeFileSync(path.join(T29, 'runs', 'analysis-t29.json'), JSON.stringify(out, null, 2));
const brief = {};
for (const [k, v] of Object.entries(out)) {
  if (k === 'nameDiff') continue;
  brief[k] = { total: v.total, failed: v.failed, metrics: v.metrics, failingCount: v.failing.length, upperBound: v.upperBound && { ok: v.upperBound.ok, detail: v.upperBound.detail.slice(0, 150) } };
}
console.log(JSON.stringify({ ...brief, nameDiff: out.nameDiff }, null, 2));
