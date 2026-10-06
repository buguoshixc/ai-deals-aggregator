/** T15 · 探针统计（判据前置条件的必要性 / 阈值余量 / 单行短说明规模）。
 *  node review/harness/probe-stats.cjs <probe.json> [out.txt]
 */
const fs = require('fs');
const [p, outPath] = process.argv.slice(2);
const probe = JSON.parse(fs.readFileSync(p, 'utf8'));
const L = [];
const say = s => L.push(s);
for (const width of probe.widths) {
  const per = probe.byWidth[width];
  const all = [];
  for (const [route, v] of Object.entries(per)) for (const n of v.notes) all.push(Object.assign({ route, column: v.column }, n));
  const single = all.filter(n => n.lineCount === 1);
  const singleShort = single.filter(n => n.widestLine < 0.85 * n.column - 0.01);
  const multi = all.filter(n => n.lineCount >= 2);
  const multiHit = multi.filter(n => n.widestLine < 0.85 * n.column - 0.01);
  const near = multi.slice().sort((a, b) => a.ratioInk - b.ratioInk).filter(n => n.ratioInk >= 0.85).slice(0, 5);
  say(`@${width}: 说明 ${all.length} · 单行 ${single.length}（其中若去掉 lineCount>=2 前置条件会被误报的「单行短说明」= ${singleShort.length} 条）`
    + ` · 多行 ${multi.length} · 多行中字迹窄（应被咬）${multiHit.length}`);
  say(`   最接近阈值的多行说明（比值 ≥ 0.85 的前 5）：${near.map(n => `${n.route || '/'}#${n.index}=${n.ratioInk}`).join(' ') || '无'}`);
  say(`   单行短说明样例（比值最小 5）：${singleShort.slice().sort((a, b) => a.ratioInk - b.ratioInk).slice(0, 5).map(n => `${n.route || '/'}#${n.index}=${n.ratioInk}(${n.widestLine}px)`).join(' ')}`);
  const zeroGlyph = all.filter(n => n.rendered && n.textLength > 0 && n.glyphRects === 0);
  const unrendered = all.filter(n => !n.rendered);
  say(`   藏字（rendered+文本非空+零字形盒）${zeroGlyph.length} · 未渲染（盒退化）${unrendered.length}：${unrendered.map(n => `${n.route || '/'}#${n.index}`).join(' ')}`);
}
const text = L.join('\n');
if (outPath) { fs.mkdirSync(require('path').dirname(outPath), { recursive: true }); fs.writeFileSync(outPath, text); console.log(`写盘 ${outPath}`); }
console.log(text);
