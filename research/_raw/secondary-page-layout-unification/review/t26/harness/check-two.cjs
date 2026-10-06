#!/usr/bin/env node
/**
 * T26 · 两个定点核对（不跑浏览器）：
 *  A) 排除规则是不是**子树语义**：在 bare-fs0（全站 font-size:0）里看 plans/coding/ 同页 5 条 ——
 *     <noscript> 那条应当被放过，同页其它条应当被 note-unrendered 咬中。
 *  B) 「既有断言缺失 0」：old-baseline(848) × new-baseline(852) 的名字多重集，按动态计数归一化
 *     （「N 个码」「N 次导航」）后再比 —— 归一化后应当 removed 0 / added 4。
 * 用法：node check-two.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../../../../../..');
const T26 = path.join(ROOT, 'research', '_raw', 'secondary-page-layout-unification', 'review', 't26');
const load = id => JSON.parse(fs.readFileSync(path.join(T26, 'runs', id, 'report.json'), 'utf8'));
const out = {};

// A) plans/coding/ 同页对照（bare-fs0 全站注入）
{
  const rep = load('new-bare-fs0');
  const rows = rep.metrics.layoutNotes.filter(r => r.route === 'plans/coding/');
  out.samePageSubtree = rows.map(r => ({ key: `${r.route}#${r.index}`, noscriptSubtree: r.noscriptSubtree, textLength: r.textLength, rawTextLength: r.rawTextLength, glyphRects: r.glyphRects, rendered: r.rendered, codes: r.codes }));
  const repKey = load('new-noscript-key');
  out.samePageSubtreeInKey = repKey.metrics.layoutNotes.filter(r => r.route === 'plans/' || r.route === 'plans/coding/')
    .map(r => ({ key: `${r.route}#${r.index}`, noscriptSubtree: r.noscriptSubtree, textLength: r.textLength, glyphRects: r.glyphRects, rendered: r.rendered, codes: r.codes }));
  const repClean = load('new-clean');
  out.plansCodingInClean = repClean.metrics.layoutNotes.filter(r => r.route === 'plans/coding/')
    .map(r => ({ key: `${r.route}#${r.index}`, noscriptSubtree: r.noscriptSubtree, textLength: r.textLength, rawTextLength: r.rawTextLength, glyphRects: r.glyphRects, rendered: r.rendered, codes: r.codes }));
}

// B) 归一化名字多重集
{
  const norm = name => name
    .replace(/\d+ 个码/g, '<N> 个码')
    .replace(/（\d+ 次导航）/g, '（<N> 次导航）');
  const names = id => load(id).checks.map(c => c.name).map(norm);
  const n = names('new-baseline'), o = names('old-baseline');
  const cnt = a => { const m = new Map(); for (const x of a) m.set(x, (m.get(x) || 0) + 1); return m; };
  const cn = cnt(n), co = cnt(o); const removed = [], added = [];
  for (const [k, v] of co) { const d = v - (cn.get(k) || 0); for (let i = 0; i < d; i++) removed.push(k); }
  for (const [k, v] of cn) { const d = v - (co.get(k) || 0); for (let i = 0; i < d; i++) added.push(k); }
  out.normalizedNameDiff = { newCount: n.length, oldCount: o.length, removed, added };
}
fs.writeFileSync(path.join(T26, 'runs', 'check-two.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
