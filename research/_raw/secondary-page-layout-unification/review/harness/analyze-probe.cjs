/**
 * T15 · 探针读数分析（不跑浏览器）。
 *   node review/harness/analyze-probe.cjs probe.json [tool.json] [out.txt]
 * 1) 每个档位：列宽范围 / 说明条数 / 各码命中数
 * 2) 与 verify-site 的 layoutNotes（同 dir、1440）逐条对账（行数 / 最宽行 / 内容盒 / 列宽）
 * 3) B 项：760 档逐条命中（页面/选择器/盒宽/列宽/行数/最宽行/比值）+ 70ch 实测
 */
const fs = require('fs');
const path = require('path');

const probePath = process.argv[2];
const toolPath = process.argv[3] && process.argv[3].endsWith('.json') ? process.argv[3] : null;
const outPath = process.argv.find(a => a.endsWith('.txt'));
const probe = JSON.parse(fs.readFileSync(probePath, 'utf8'));
const lines = [];
const say = s => lines.push(s);

say(`探针 dir=${probe.dir} · 宽度 ${probe.widths.join(',')} · 生成 ${probe.generatedAt} · JS 错误 ${probe.jsErrors.length}`);
for (const width of probe.widths) {
  const per = probe.byWidth[width];
  const routes = Object.keys(per);
  const notes = routes.flatMap(r => per[r].notes.map(n => Object.assign({ route: r }, n)));
  const cols = routes.map(r => per[r].column).filter(c => c > 0);
  const ch70 = routes.map(r => per[r].reading ? per[r].reading.probe70ch : null).filter(v => v);
  const by = k => notes.filter(n => n.codes.includes(k)).length;
  const variantInk = notes.filter(n => n.variants.includes('ink-rect-variant')).length;
  const variant3 = notes.filter(n => n.variants.includes('ink-3lines-variant')).length;
  say(`@${width}: ${routes.length} 页 · ${notes.length} 条说明 · 列宽 ${Math.min(...cols)}–${Math.max(...cols)}`
    + (ch70.length ? ` · probe70ch ${Math.min(...ch70)}–${Math.max(...ch70)}` : '')
    + ` · note-narrow ${by('note-narrow')} · note-ink-narrow ${by('note-ink-narrow')} · note-hidden-text ${by('note-hidden-text')}`
    + ` · 变体(最长单矩形) ${variantInk} · 变体(>=3 行) ${variant3}`);
}

if (toolPath) {
  const tool = JSON.parse(fs.readFileSync(toolPath, 'utf8'));
  const toolNotes = (tool.metrics && tool.metrics.layoutNotes) || [];
  const toolMap = new Map(toolNotes.map(r => [`${r.route}#${r.index}`, r]));
  const per = probe.byWidth[1440] || probe.byWidth[probe.widths[0]];
  let checked = 0, mismatch = 0, missing = 0;
  const diffs = [];
  for (const [route, val] of Object.entries(per)) {
    for (const n of val.notes) {
      const key = `${route}#${n.index}`;
      const t = toolMap.get(key);
      if (!t) { missing++; continue; }
      checked++;
      const same = Math.abs(t.lineCount - n.lineCount) < 0.001
        && Math.abs(t.widestLine - n.widestLine) < 0.02
        && Math.abs(t.textWidth - n.textWidth) < 0.02
        && Math.abs(t.column - val.column) < 0.02
        && Math.abs(t.width - n.boxWidth) < 0.02;
      if (!same) {
        mismatch++;
        if (diffs.length < 12) diffs.push(`  ${key}: 工具 行${t.lineCount}/最宽${t.widestLine}/内容盒${t.textWidth}/盒${t.width}/列${t.column} vs 探针 行${n.lineCount}/最宽${n.widestLine}/内容盒${n.textWidth}/盒${n.boxWidth}/列${val.column}`);
      }
    }
  }
  say(`对账（@1440，工具 ${path.basename(toolPath)}）：探针覆盖 ${checked} 条 · 工具缺 ${missing} 条 · 读数不一致 ${mismatch} 条`);
  for (const d of diffs) say(d);
}

// B 项：非 1440/1600 档的逐条命中（如果命中档位是 760，这就是「把逐行字迹开到 760 的误报清单」）
for (const width of probe.widths) {
  if (width === 1440 || width === 1600) continue;
  const per = probe.byWidth[width];
  const hits = [];
  for (const [route, val] of Object.entries(per)) {
    for (const n of val.notes) if (n.codes.length || n.variants.length) hits.push({ route, column: val.column, sel: val.reading.regionSel, ...n });
  }
  say(`\n===== @${width}：命中 ${hits.length} 条（并集码 ${hits.filter(h => h.codes.length).length} 条 / 仅变体 ${hits.filter(h => !h.codes.length).length} 条）=====`);
  for (const h of hits) say(`  ${h.route || '/'}#${h.index} [${h.codes.join('+') || '-'}${h.variants.length ? ' | ' + h.variants.join('+') : ''}] 盒 ${h.boxWidth} 列 ${h.column} 行 ${h.lineCount} 最宽 ${h.widestLine} 比值 ${h.ratioInk} 字形盒 ${h.glyphRects} 选区 ${h.sel} · ${String(h.text).slice(0, 26)}`);
}

const text = lines.join('\n');
if (outPath) { fs.mkdirSync(path.dirname(outPath), { recursive: true }); fs.writeFileSync(outPath, text); console.log(`写盘 ${outPath}`); }
console.log(text);
