#!/usr/bin/env node
/**
 * T21 · T8 读数解剖：把 grid760-changes 报告里的 @760 样本集 detail、
 * changes/ 各条的码与几何读数逐条落盘（只读报告，不写 dist）。
 * 用法：node research/_raw/secondary-page-layout-unification/t21/inspect-t8.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..', '..');
const T = 'research/_raw/secondary-page-layout-unification/t21';
const abs = rel => path.join(ROOT, rel);
const out = [];
const W = line => out.push(String(line));

for (const [label, rel] of [['grid760-changes', `${T}/scratch/grid760-report.json`]]) {
  const report = JSON.parse(fs.readFileSync(abs(rel), 'utf8'));
  W(`===== ${label} =====`);
  W(`total=${report.total} failed=${report.failed} exit=${report.exit}`);
  const failing = (report.checks || []).filter(c => !c.ok);
  for (const c of failing) {
    W(`✗ ${c.name}`);
    W(`  detail: ${String(c.detail)}`);
    if (Array.isArray(c.items)) for (const item of c.items.slice(0, 12)) W(`    - ${String(item)}`);
    if (Array.isArray(c.problems)) for (const item of c.problems.slice(0, 24)) W(`    * ${String(item)}`);
  }
  const sweep = report.metrics.layoutSweep || {};
  W(`layoutSweep: ${JSON.stringify(sweep)}`);
  const notes = report.metrics.layoutNotes || [];
  const scope = report.metrics.layoutSampleScope || null;
  W(`layoutSampleScope: ${JSON.stringify(scope)}`);
  const rows = notes.filter(r => String(r.route).includes('changes'));
  W(`changes/ 条数（@1440 容器）：${rows.length}`);
  for (const r of rows) {
    W(`  #${r.index} route=${r.route} codes=${JSON.stringify(r.codes)} lineCount=${r.lineCount} widestLine=${r.widestLine} `
      + `inkWidth=${r.inkWidth} column=${r.column} boxWidth=${r.boxWidth && r.boxWidth.width !== undefined ? JSON.stringify(r.boxWidth) : JSON.stringify(r.box)} rendered=${r.rendered} glyphRects=${r.glyphRects}`);
  }
  const notes1600 = report.metrics.layoutNotesAt1600 || [];
  const rows1600 = notes1600.filter(r => String(r.route).includes('changes'));
  W(`changes/ 条数（@1600 容器）：${rows1600.length} 有码 ${rows1600.filter(r => (r.codes || []).length).length}`);
}
fs.mkdirSync(abs(`${T}/logs`), { recursive: true });
fs.writeFileSync(abs(`${T}/logs/T8-inspect.txt`), `${out.join('\n')}\n`, 'utf8');
console.log(`${out.length} 行 → ${T}/logs/T8-inspect.txt`);
