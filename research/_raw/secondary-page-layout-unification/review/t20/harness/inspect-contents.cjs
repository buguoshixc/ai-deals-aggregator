#!/usr/bin/env node
/**
 * T20 · 定点分析：contents（display:contents）与 grid760 两份 scratch 的**条级**读数。
 * 只用 metrics.layoutNotes（条级容器），不看断言详情里的期望文字。
 * 用法：node inspect-contents.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../../../../../..');
const T20 = path.join(ROOT, 'research', '_raw', 'secondary-page-layout-unification', 'review', 't20');
const load = id => JSON.parse(fs.readFileSync(path.join(T20, 'runs', id, 'report.json'), 'utf8'));
const codes = rep => {
  const hist = {};
  for (const n of rep.metrics.layoutNotes) for (const c of (n.codes || [])) hist[c] = (hist[c] || 0) + 1;
  return hist;
};
const rowsWith = (rep, re) => rep.metrics.layoutNotes.filter(n => (n.codes || []).some(c => re.test(c)))
  .map(n => ({ key: `${n.route}#${n.index}`, codes: n.codes, box: n.width, textWidth: n.textWidth, rendered: n.rendered, glyphRects: n.glyphRects, lineCount: n.lineCount, widest: n.widestLine, column: n.column }));

const out = {};
for (const id of ['new-contents', 'old-contents', 'new-grid760', 'old-grid760', 'new-clean', 'new-dist', 'new-baseline']) {
  const rep = load(id);
  out[id] = {
    total: rep.total, failed: rep.failed,
    allFailing: rep.checks.filter(c => !c.ok).map(c => c.name),
    codesHistogram: codes(rep),
    narrowRows: rowsWith(rep, /^note-narrow$/),
    inkRows: rowsWith(rep, /^note-ink-narrow$/).slice(0, 12),
    axisRows: rowsWith(rep, /^note-axis$/),
    hiddenRows: rowsWith(rep, /^note-hidden-text$/),
    renderedFalseCount: rep.metrics.layoutNotes.filter(n => !n.rendered).length
  };
}
out.summary = {
  contents: {
    newCodes: out['new-contents'].codesHistogram, oldCodes: out['old-contents'].codesHistogram,
    newNarrow: out['new-contents'].narrowRows.length, oldNarrow: out['old-contents'].narrowRows.length,
    newAxis: out['new-contents'].axisRows.length, oldAxis: out['old-contents'].axisRows.length
  }
};
fs.writeFileSync(path.join(T20, 'runs', 'inspect-contents.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify({
  summary: out.summary,
  newContentsAllFailing: out['new-contents'].allFailing,
  oldContentsAllFailing: out['old-contents'].allFailing,
  newContentsNarrowSample: out['new-contents'].narrowRows.slice(0, 5),
  newContentsRenderedFalse: out['new-contents'].renderedFalseCount,
  oldContentsRenderedFalse: out['old-contents'].renderedFalseCount,
  grid760NewCodes: out['new-grid760'].codesHistogram, grid760OldCodes: out['old-grid760'].codesHistogram,
  grid760NewInkKeys: out['new-grid760'].inkRows.map(r => r.key)
}, null, 2));
