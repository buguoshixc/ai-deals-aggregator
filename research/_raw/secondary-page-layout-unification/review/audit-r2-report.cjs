/**
 * T6 round-2 · 读 --json 报告：失败项归类 + §22c 的关键读数（条级容器 / 计数 / 违规码 / 跳过的键）。
 * 用法：node audit-r2-report.cjs <report.json> [--full]
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..', '..');

const report = JSON.parse(fs.readFileSync(path.resolve(ROOT, process.argv[2]), 'utf8'));
const full = process.argv.includes('--full');
const failed = report.checks.filter(c => !c.ok);
const sectionOf = name => {
  const m = name.match(/§(\d+[a-z]?)/);
  if (m) return `§${m[1]}`;
  const m2 = name.match(/^(\d+)\)/);
  return m2 ? `${m2[1]})` : name.slice(0, 14);
};
const bySection = new Map();
for (const c of failed) bySection.set(sectionOf(c.name), (bySection.get(sectionOf(c.name)) || 0) + 1);

console.log(`报告：${path.relative(ROOT, path.resolve(ROOT, process.argv[2]))}`);
console.log(`断言 ${report.total} 项 · 失败 ${report.failed} 项 · 失败项按小节：${[...bySection.entries()].map(([s, n]) => `${s}=${n}`).join(' ') || '（无）'}`);
for (const c of (full ? failed : failed.slice(0, 14))) {
  console.log(`   ✗ ${c.name.slice(0, 108)}`);
  console.log(`        ${String(c.detail).slice(0, 320)}`);
}
if (failed.length > 14 && !full) console.log(`   …（还有 ${failed.length - 14} 项，--full 展开）`);

const m = report.metrics || {};
const layoutKeys = Object.keys(m).filter(k => k.startsWith('layout'));
console.log(`\nmetrics 里 layout* 键（${layoutKeys.length}）：${layoutKeys.join(' ')}`);
if (m.layoutSweep && m.layoutSweep.skipped) {
  console.log(`  ← 跳过留痕：${JSON.stringify(m.layoutSweep)}`);
}
if (m.layoutSweep && !m.layoutSweep.skipped) {
  console.log(`layoutSweep = ${JSON.stringify(m.layoutSweep)}`);
}
if (Array.isArray(m.layoutNotes)) {
  const narrow = m.layoutNotes.filter(r => (r.codes || []).includes('note-narrow'));
  const fallback = m.layoutNotes.filter(r => r.textFallback).length;
  const axis = m.layoutNotes.filter(r => (r.codes || []).includes('note-axis'));
  console.log(`layoutNotes：${m.layoutNotes.length} 条 · note-narrow ${narrow.length} 条/${new Set(narrow.map(r => r.route)).size} 页`
    + ` · note-axis ${axis.length} 条 · textFallback ${fallback} 条`);
  console.log(`   窄条 route#index（前 8）：${narrow.slice(0, 8).map(r => `${r.route}#${r.index}`).join(' ') || '（无）'}`);
  if (narrow.length) {
    const first = narrow[0];
    console.log(`   样例读数：${first.route}#${first.index} textWidth ${first.textWidth} / 盒 ${first.width} / 列 ${first.column} / ratio ${first.ratio} / 字迹 ${first.inkWidth}`);
  }
}
if (Array.isArray(m.layoutNotesAt1600)) {
  const n16 = m.layoutNotesAt1600.filter(r => (r.codes || []).includes('note-narrow'));
  console.log(`layoutNotesAt1600：${m.layoutNotesAt1600.length} 条 · note-narrow ${n16.length} 条`);
}
if (Array.isArray(m.layoutViolations)) {
  console.log(`layoutViolations：${m.layoutViolations.length} 页`);
  for (const v of m.layoutViolations.slice(0, 5)) {
    console.log(`   ${v.route || '/'} codes=[${(v.codes || []).join(', ')}] noteKeys=[${(v.noteKeys || []).slice(0, 6).join(' ')}]`);
  }
}
if (m.layoutMutationCodes) console.log(`layoutMutationCodes = ${JSON.stringify(m.layoutMutationCodes)}`);
if (m.layoutScan) console.log(`layoutScan = ${JSON.stringify(m.layoutScan)}`);
