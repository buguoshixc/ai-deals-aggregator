#!/usr/bin/env node
/**
 * T26 · baseline 33→36 的三条是否全是 M13 锚点类（captain 的定点问题）。
 * 对照 old-baseline(848/33) × new-baseline(852/36) 的失败断言集合，并把新增 3 条的 detail 打出来。
 * 用法：node check-baseline3.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../../../../../..');
const T26 = path.join(ROOT, 'research', '_raw', 'secondary-page-layout-unification', 'review', 't26');
const load = id => JSON.parse(fs.readFileSync(path.join(T26, 'runs', id, 'report.json'), 'utf8'));
const norm = s => s.replace(/\d+ 个码/g, '<N> 个码').replace(/（\d+ 次导航）/g, '（<N> 次导航）');
const n = load('new-baseline'), o = load('old-baseline');
const nf = n.checks.filter(c => !c.ok), of = o.checks.filter(c => !c.ok);
const oNames = new Set(of.map(c => norm(c.name)));
const nNames = new Set(nf.map(c => norm(c.name)));
const added = nf.filter(c => !oNames.has(norm(c.name)));
const removed = of.filter(c => !nNames.has(norm(c.name)));
const out = {
  newFailed: nf.length, oldFailed: of.length,
  added: added.map(c => ({ name: c.name, detail: String(c.detail).slice(0, 220) })),
  removed: removed.map(c => c.name)
};
console.log(JSON.stringify(out, null, 2));
// baseline 是否真的没有冻结串（M13 锚点不存在的原因）
const fs0 = fs.readFileSync(path.join(ROOT, 'dist.baseline', 'docs', 'data', 'index.html'), 'utf8');
const distPage = fs.readFileSync(path.join(ROOT, 'dist', 'docs', 'data', 'index.html'), 'utf8');
const FROZEN = '.snote { color: var(--mut); font-size: var(--fs-sm); line-height: 1.7; margin: 0 0 var(--s3); max-width: none; overflow-wrap: anywhere; }';
console.log('dist.baseline docs/data 冻结串次数 =', fs0.split(FROZEN).length - 1, '· dist =', distPage.split(FROZEN).length - 1);
fs.writeFileSync(path.join(T26, 'runs', 'baseline3.json'), JSON.stringify({ ...out, frozenInBaselineDocsData: fs0.split(FROZEN).length - 1, frozenInDistDocsData: distPage.split(FROZEN).length - 1 }, null, 2));
