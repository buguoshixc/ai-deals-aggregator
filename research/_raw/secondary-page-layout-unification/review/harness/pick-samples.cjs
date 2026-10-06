/**
 * T15 · 抽查取样：从 dist 的条级容器（--dir=dist 的 JSON）里挑 ≥15 条人工核对合理性。
 *   node review/harness/pick-samples.cjs <verify-dist.json> [out.txt]
 * 覆盖面：最短单行说明 / 最长多行说明 / 3 个别名页 / archive/ 全部 5 条 / noscript 那条 /
 *        行数最多的几条 / 单行但字迹很窄的几条（最容易误报的那一档）。
 */
const fs = require('fs');
const [verifyPath, outPath] = process.argv.slice(2);
const v = JSON.parse(fs.readFileSync(verifyPath, 'utf8'));
const rows = (v.metrics && v.metrics.layoutNotes) || [];
const L = [];
const say = s => L.push(s);
const line = r => `  ${r.route || '/'}#${r.index} [${r.kind}/${r.family}] 内容盒 ${r.textWidth}/${r.column}（比值 ${r.ratioTextWidth}）· 盒 ${r.width} · 行 ${r.lineCount} 最宽 ${r.widestLine}（比值 ${r.ratioWidestLine}）· 字形盒 ${r.glyphRects} · 竖排 ${r.vertical === true} · unrendered ${r.unrendered === true} · codes [${(r.codes || []).join(',') || '-'}] · ${String(r.text || '').slice(0, 30)}`;

const sorted = rows.slice();
say(`总条数 ${rows.length} · 页数 ${new Set(rows.map(r => r.route)).size} · unrendered ${rows.filter(r => r.unrendered).length} · vertical ${rows.filter(r => r.vertical).length}`);

say(`\n[A] 最短单行说明（lineCount=1 且 widestLine 最小）5 条：`);
sorted.filter(r => r.lineCount === 1).sort((a, b) => a.widestLine - b.widestLine).slice(0, 5).forEach(r => say(line(r)));

say(`\n[B] 最长多行说明（lineCount 最大）5 条：`);
sorted.filter(r => r.lineCount >= 2).sort((a, b) => b.lineCount - a.lineCount || b.widestLine - a.widestLine).slice(0, 5).forEach(r => say(line(r)));

say(`\n[C] 别名页（kind=alias）前 3 条：`);
sorted.filter(r => r.kind === 'alias').slice(0, 3).forEach(r => say(line(r)));
say(`    别名页条数 ${rows.filter(r => r.kind === 'alias').length}`);

say(`\n[D] archive/ 的全部条目（本来正常，必须在 alreadyFine 里）：`);
sorted.filter(r => r.route === 'archive/').forEach(r => say(line(r)));

say(`\n[E] 未渲染的那条（<noscript>）：`);
sorted.filter(r => r.unrendered).forEach(r => say(line(r)));

say(`\n[F] 单行但内容盒/字迹最窄的 8 条（lineCount=1，最容易误报的一档，必须无码）：`);
sorted.filter(r => r.lineCount === 1).sort((a, b) => a.ratioWidestLine - b.ratioWidestLine).slice(0, 8).forEach(r => say(line(r)));

say(`\n[G] 多行但字迹最靠近阈值的 8 条（0.85 边界附近）：`);
sorted.filter(r => r.lineCount >= 2).sort((a, b) => b.ratioWidestLine - a.ratioWidestLine).slice(0, 8).forEach(r => say(line(r)));

say(`\n[H] textFallback 回落条数 ${rows.filter(r => r.textFallback).length}（抽样 5）：`);
rows.filter(r => r.textFallback).slice(0, 5).forEach(r => say(line(r)));

const text = L.join('\n');
if (outPath) { fs.mkdirSync(require('path').dirname(outPath), { recursive: true }); fs.writeFileSync(outPath, text); console.log(`写盘 ${outPath}`); }
console.log(text);
