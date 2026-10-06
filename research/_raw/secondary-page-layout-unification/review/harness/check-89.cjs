/** T15 · 核对 §22c 注释里「去掉 lineCount>=2 会误报 89 条」这个数字的来源。
 *  node review/harness/check-89.cjs <probe-dist.json> <verify-dist.json> [out.txt]
 */
const fs = require('fs');
const probe = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const per = probe.byWidth[1440];
const all = [];
for (const [route, v] of Object.entries(per)) for (const n of v.notes) all.push(Object.assign({ route, column: v.column }, n));
const single = all.filter(n => n.lineCount === 1);
const inkNarrow = n => n.widestLine < 0.85 * n.column - 0.01;
const boxNarrow = n => n.textWidth < 0.85 * n.column - 0.01;
const out = [];
const say = s => out.push(s);
say(`单行说明总数 ${single.length}`);
say(`① 单行 + 字迹窄（丢掉 lineCount>=2 后 ② 会误报的条数）= ${single.filter(inkNarrow).length}`);
say(`② 单行 + 内容盒窄（① 口径，dist 上不该有）= ${single.filter(boxNarrow).length}`);
say(`③ 单行 + 字迹窄 + 比值 < 0.5 = ${single.filter(n => n.widestLine < 0.5 * n.column - 0.01).length}`);
try {
  const v = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
  const rows = v.metrics.layoutNotes;
  const fam = new Map(rows.map(r => [`${r.route}#${r.index}`, r.family]));
  const kind = new Map(rows.map(r => [`${r.route}#${r.index}`, r.kind]));
  const key = n => `${n.route}#${n.index}`;
  for (const f of ['wide', 'detail', 'other']) say(`④ 单行 + 字迹窄，仅 family=${f} = ${single.filter(n => inkNarrow(n) && fam.get(key(n)) === f).length}`);
  say(`⑤ 单行 + 字迹窄 + position=first = ${single.filter(n => inkNarrow(n) && (rows.find(r => key(n) === `${r.route}#${r.index}`) || {}).position === 'first').length}`);
  const byKind = new Map();
  for (const n of single.filter(inkNarrow)) { const k = kind.get(key(n)) || '?'; byKind.set(k, (byKind.get(k) || 0) + 1); }
  say(`⑥ 按 kind 分解：${[...byKind.entries()].map(([k, c]) => `${k}:${c}`).join(' ')}`);
} catch (e) { say(`（没有给 tool.json：${e.message}）`); }
say(`\n单行 + 字迹窄 的样例（前 12）：${single.filter(inkNarrow).slice(0, 12).map(n => `${n.route || '/'}#${n.index}(${n.widestLine}px/${n.column})`).join(' ')}`);
const text = out.join('\n');
if (process.argv[4]) { fs.mkdirSync(require('path').dirname(process.argv[4]), { recursive: true }); fs.writeFileSync(process.argv[4], text); console.log(`写盘 ${process.argv[4]}`); }
console.log(text);
