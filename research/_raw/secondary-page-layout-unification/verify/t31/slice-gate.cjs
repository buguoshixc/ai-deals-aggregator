#!/usr/bin/env node
/**
 * T31 · 从门禁报告里切出 §22c 与 `category/agent/` 相关的读数（只读 JSON，不跑浏览器）
 *
 * 用法：node research/_raw/secondary-page-layout-unification/verify/t31/slice-gate.cjs
 * 产出：verify/t31/gate-slices.json（机器可读）+ verify/t31/gate-slices.txt（人读）
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = (() => { let dir = __dirname; for (let i = 0; i < 8; i++) { if (fs.existsSync(path.join(dir, 'package.json'))) return dir; dir = path.dirname(dir); } throw new Error('no root'); })();
const T = 'research/_raw/secondary-page-layout-unification/verify/t31';
const abs = rel => path.join(ROOT, rel);
const ROUTE = 'category/agent/';

const reports = [
  { label: 'form（注入写作模式形态的 scratch 副本）', file: `${T}/gate-form.json`, exit: `${T}/gate-form.exit.txt` },
  { label: 'dist（线上产物原样）', file: `${T}/gate-dist.json`, exit: `${T}/gate-dist.exit.txt` }
];

const out = { task: 'T31', at: new Date().toISOString(), route: ROUTE, reports: [] };
const lines = [];
const W = s => lines.push(String(s));

for (const spec of reports) {
  const report = JSON.parse(fs.readFileSync(abs(spec.file), 'utf8'));
  const exitText = fs.existsSync(abs(spec.exit)) ? fs.readFileSync(abs(spec.exit), 'utf8').trim() : null;
  const checks = (report.checks || []);
  const s22c = checks.filter(c => /§22c/.test(c.name));
  const failing = checks.filter(c => !c.ok);
  const sweep = report.metrics.layoutSweep || {};
  const notes = report.metrics.layoutNotes || [];
  const notes1600 = report.metrics.layoutNotesAt1600 || [];
  const pick = rows => rows.filter(r => String(r.route) === ROUTE);
  const slice = {
    label: spec.label,
    file: spec.file,
    suiteExit: exitText,
    total: report.total,
    failed: report.failed,
    checkCount: checks.length,
    failingChecks: failing.map(c => ({ name: c.name, detail: String(c.detail || '').slice(0, 400) })),
    s22cChecks: s22c.map(c => ({ ok: c.ok, name: c.name.slice(0, 120), detail: String(c.detail || '').slice(0, 900) })),
    sweep: {
      total: sweep.total, wide: sweep.wide, detail: sweep.detail, other: sweep.other,
      notesJudged: sweep.notesJudged, narrowNotes: sweep.narrowNotes, inkNarrowNotes: sweep.inkNarrowNotes,
      narrowUnionNotes: sweep.narrowUnionNotes, hiddenTextNotes: sweep.hiddenTextNotes,
      unrenderedNotes: sweep.unrenderedNotes, verticalNotes: sweep.verticalNotes,
      overflowPages: sweep.overflowPages, unclassified: sweep.unclassified,
      inkScopeDesktopViewports: sweep.inkScopeDesktopViewports, inkScopeSampleViewports: sweep.inkScopeSampleViewports
    },
    sampleScope: report.metrics.layoutSampleScope || null,
    routeAt1440: pick(notes).map(r => ({ index: r.index, codes: r.codes, lineCount: r.lineCount, widestLine: r.widestLine, column: r.column, textWidth: r.textWidth, vertical: r.vertical, rendered: r.rendered, glyphRects: r.glyphRects, textLength: r.textLength })),
    routeAt1600: pick(notes1600).map(r => ({ index: r.index, codes: r.codes, lineCount: r.lineCount, widestLine: r.widestLine, column: r.column, textWidth: r.textWidth, vertical: r.vertical, rendered: r.rendered, glyphRects: r.glyphRects, textLength: r.textLength })),
    violationsForRoute: (report.metrics.layoutViolations || []).filter(v => String(v.route) === ROUTE)
  };
  out.reports.push(slice);

  W(`===== ${spec.label} =====`);
  W(`套件：${report.total} 项断言 / 失败 ${report.failed} 项 · ${exitText || '（无 exit 记录）'} · 报告 ${spec.file}`);
  W(`§22c 断言 ${s22c.length} 条（失败 ${s22c.filter(c => !c.ok).length} 条）：`);
  for (const c of s22c) W(`  ${c.ok ? '✓' : '✗'} ${c.name.slice(0, 90)} — ${String(c.detail || '').slice(0, 420)}`);
  W(`layoutSweep：${JSON.stringify(slice.sweep)}`);
  W(`样本档作用域：${JSON.stringify(slice.sampleScope)}`);
  W(`${ROUTE} @1440 条：${JSON.stringify(slice.routeAt1440)}`);
  W(`${ROUTE} @1600 条：${JSON.stringify(slice.routeAt1600)}`);
  W(`${ROUTE} 在 layoutViolations 里的条数：${slice.violationsForRoute.length}`);
  W('');
}

fs.writeFileSync(abs(`${T}/gate-slices.json`), `${JSON.stringify(out, null, 2)}\n`, 'utf8');
fs.writeFileSync(abs(`${T}/gate-slices.txt`), `${lines.join('\n')}\n`, 'utf8');
console.log(`${lines.length} 行 → ${T}/gate-slices.txt · JSON → ${T}/gate-slices.json`);
