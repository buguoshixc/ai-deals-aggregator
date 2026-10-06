/**
 * T15 · 读数抽取器（只读 JSON，不跑浏览器）。
 *
 *   node review/harness/extract-r3.cjs summary <verify.json> [out.txt]
 *   node review/harness/extract-r3.cjs routes  <verify.json> [out.txt]     # 每页说明条数 / 行数分布 / 码
 *   node review/harness/extract-r3.cjs union   <verify.json> [out.txt]     # 并集分码归因（note-narrow vs note-ink-narrow）
 *   node review/harness/extract-r3.cjs truth   <truth-401.json> [out.txt]  # 真值三分集合
 *   node review/harness/extract-r3.cjs compare <a.json> <b.json>           # 两个 run 的条级集合差
 */
const fs = require('fs');
const path = require('path');

const [, , cmd, ...rest] = process.argv;
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const out = txt => {
  const dest = rest.find((a, i) => i > 0 && a.endsWith('.txt'));
  if (dest) { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, txt); console.log(`写盘 ${dest}`); }
  console.log(txt);
};
const notesOf = json => (json.metrics && json.metrics.layoutNotes) || [];
const codeCounts = rows => {
  const map = new Map();
  for (const row of rows) for (const c of row.codes || []) map.set(c, (map.get(c) || 0) + 1);
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
};

if (cmd === 'summary') {
  const j = read(rest[0]);
  const rows = notesOf(j);
  const v = (j.metrics && j.metrics.layoutViolations) || [];
  const lines = [];
  lines.push(`文件 ${path.basename(rest[0])} · checks ${j.checks ? j.checks.length : 'n/a'} · failed ${j.failed || 0}`);
  lines.push(`layoutSweep ${JSON.stringify(j.metrics && j.metrics.layoutSweep)}`);
  lines.push(`layoutViolations ${v.length} 页 · layoutNotes ${rows.length} 条`);
  lines.push(`码分布 ${JSON.stringify(codeCounts(rows))}`);
  lines.push(`§22c 相关 check（含 §22c 字样）：`);
  for (const c of (j.checks || [])) if (/§22c/.test(c.name || '')) lines.push(`  ${c.ok ? '✓' : '✗'} ${String(c.name).slice(0, 120)} — ${String(c.detail || '').slice(0, 220)}`);
  out(lines.join('\n'));
}

if (cmd === 'routes') {
  const j = read(rest[0]);
  const rows = notesOf(j);
  const byRoute = new Map();
  for (const row of rows) {
    if (!byRoute.has(row.route)) byRoute.set(row.route, []);
    byRoute.get(row.route).push(row);
  }
  const lines = [];
  lines.push(`route\tnotes\tcodes\tlineCount(min/max)\twidest/column(min)\ttextWidth/column(min)`);
  for (const [route, rs] of [...byRoute.entries()].sort()) {
    const codes = [...new Set(rs.flatMap(r => r.codes))].join(',') || '-';
    const lc = rs.map(r => r.lineCount).filter(n => typeof n === 'number');
    const ratios = rs.map(r => (r.ratioWidestLine === null || r.ratioWidestLine === undefined ? null : r.ratioWidestLine)).filter(v => v !== null);
    const ratios2 = rs.map(r => (r.ratioTextWidth === null || r.ratioTextWidth === undefined ? null : r.ratioTextWidth)).filter(v => v !== null);
    lines.push(`${route || '/'}\t${rs.length}\t${codes}\t${lc.length ? Math.min(...lc) + '/' + Math.max(...lc) : '-'}\t${ratios.length ? Math.min(...ratios) : '-'}\t${ratios2.length ? Math.min(...ratios2) : '-'}`);
  }
  out(lines.join('\n'));
}

if (cmd === 'union') {
  const j = read(rest[0]);
  const rows = notesOf(j);
  const narrow = rows.filter(r => (r.codes || []).includes('note-narrow'));
  const ink = rows.filter(r => (r.codes || []).includes('note-ink-narrow'));
  const both = rows.filter(r => (r.codes || []).includes('note-narrow') && (r.codes || []).includes('note-ink-narrow'));
  const hidden = rows.filter(r => (r.codes || []).includes('note-hidden-text'));
  const union = rows.filter(r => (r.codes || []).some(c => c === 'note-narrow' || c === 'note-ink-narrow'));
  const lines = [];
  lines.push(`note-narrow ${narrow.length} 条 / ${new Set(narrow.map(r => r.route)).size} 页`);
  lines.push(`note-ink-narrow ${ink.length} 条 / ${new Set(ink.map(r => r.route)).size} 页`);
  lines.push(`both ${both.length} 条 · note-hidden-text ${hidden.length} 条`);
  lines.push(`union ${union.length} 条 / ${new Set(union.map(r => r.route)).size} 页`);
  lines.push(`union keys:`);
  for (const r of union) lines.push(`  ${r.route || '/'}#${r.index} [${(r.codes || []).join('+')}] 行 ${r.lineCount} 最宽 ${r.widestLine} 列 ${r.column} 内容盒 ${r.textWidth} 盒 ${r.width}${r.text ? ' · ' + String(r.text).slice(0, 24) : ''}`);
  out(lines.join('\n'));
}

if (cmd === 'truth') {
  const j = read(rest[0]);
  const lines = [];
  for (const key of ['caughtByOldCriteria', 'onlyNewTruth', 'alreadyFine']) {
    const arr = j[key] || [];
    lines.push(`${key}: ${arr.length}`);
    lines.push(`  ${arr.slice(0, 8).map(x => (typeof x === 'string' ? x : `${x.route || x.page || ''}#${x.index !== undefined ? x.index : ''}`)).join(' | ')}`);
  }
  lines.push(`顶层键：${Object.keys(j).join(', ')}`);
  out(lines.join('\n'));
}

if (cmd === 'compare') {
  const a = notesOf(read(rest[0]));
  const b = notesOf(read(rest[1]));
  const key = r => `${r.route || '/'}#${r.index}`;
  const mapA = new Map(a.map(r => [key(r), r]));
  const mapB = new Map(b.map(r => [key(r), r]));
  const onlyA = [...mapA.keys()].filter(k => !mapB.has(k));
  const onlyB = [...mapB.keys()].filter(k => !mapA.has(k));
  const coded = [...mapA.keys()].filter(k => mapB.has(k) && (mapA.get(k).codes.join() !== mapB.get(k).codes.join()));
  const lines = [`A=${rest[0]}（${a.length} 条）B=${rest[1]}（${b.length} 条）`];
  lines.push(`只在 A ${onlyA.length} 条 · 只在 B ${onlyB.length} 条 · 码不同 ${coded.length} 条`);
  for (const k of coded.slice(0, 40)) lines.push(`  ${k}: ${(mapA.get(k).codes || []).join(',') || '-'} → ${(mapB.get(k).codes || []).join(',') || '-'}`);
  out(lines.join('\n'));
}
