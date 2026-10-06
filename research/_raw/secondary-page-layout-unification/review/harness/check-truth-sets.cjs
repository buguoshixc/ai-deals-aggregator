/**
 * T15 · dist.baseline 上「并集分码归因」与 geometry/truth-401.json 的**集合级**核对。
 *   node review/harness/check-truth-sets.cjs <verify-dist-baseline.json> <truth-401.json> [out.txt]
 * 判据（本轮 acceptance 第 5 条）：
 *   · note-narrow 条集合 == truth.sets.caughtByOldCriteria（48）
 *   · note-ink-narrow 条集合 == truth.sets.onlyNewTruth（108）
 *   · 两者交集 = 0；并集 = 156 条 / 48 页
 *   · 零漏判（真值里的每一条都在实测里被咬）、零多余（实测里没有真值之外的条）
 */
const fs = require('fs');

const [verifyPath, truthPath, outPath] = process.argv.slice(2);
const verify = JSON.parse(fs.readFileSync(verifyPath, 'utf8'));
const truth = JSON.parse(fs.readFileSync(truthPath, 'utf8'));
const rows = (verify.metrics && verify.metrics.layoutNotes) || [];
const key = r => `${r.route || '/'}#${r.index}`;
const setOf = list => new Set(list.map(key));
const truthOld = setOf((truth.sets && truth.sets.caughtByOldCriteria) || []);
const truthNew = setOf((truth.sets && truth.sets.onlyNewTruth) || []);
const truthFine = setOf((truth.sets && truth.sets.alreadyFine) || []);
const truthUnion = new Set([...truthOld, ...truthNew]);

const measuredNarrow = new Set(rows.filter(r => (r.codes || []).includes('note-narrow')).map(key));
const measuredInk = new Set(rows.filter(r => (r.codes || []).includes('note-ink-narrow')).map(key));
const measuredHidden = new Set(rows.filter(r => (r.codes || []).includes('note-hidden-text')).map(key));
const measuredUnion = new Set([...measuredNarrow, ...measuredInk]);
const intersect = new Set([...measuredNarrow].filter(k => measuredInk.has(k)));
const pagesUnion = new Set([...measuredUnion].map(k => k.replace(/#\d+$/, '')));
const truthPages = new Set([...truthUnion].map(k => k.replace(/#\d+$/, '')));

const diffSet = (a, b) => [...a].filter(k => !b.has(k));
const L = [];
const say = s => L.push(s);
say(`实测（${verifyPath}）：说明条 ${rows.length} · note-narrow ${measuredNarrow.size} · note-ink-narrow ${measuredInk.size} · 藏字 ${measuredHidden.size} · 并集 ${measuredUnion.size} 条 / ${pagesUnion.size} 页`);
say(`真值（${truthPath}）：caughtByOldCriteria ${truthOld.size} · onlyNewTruth ${truthNew.size} · alreadyFine ${truthFine.size} · 并集 ${truthUnion.size} 条 / ${truthPages.size} 页`);
say(`totals：${JSON.stringify(truth.totals)}`);
say(`① note-narrow == caughtByOldCriteria：${measuredNarrow.size === truthOld.size && diffSet(measuredNarrow, truthOld).length === 0 && diffSet(truthOld, measuredNarrow).length === 0}`);
say(`   实测多出 ${diffSet(measuredNarrow, truthOld).length}：${diffSet(measuredNarrow, truthOld).slice(0, 10).join(' ')}`);
say(`   实测漏掉 ${diffSet(truthOld, measuredNarrow).length}：${diffSet(truthOld, measuredNarrow).slice(0, 10).join(' ')}`);
say(`② note-ink-narrow == onlyNewTruth：${measuredInk.size === truthNew.size && diffSet(measuredInk, truthNew).length === 0 && diffSet(truthNew, measuredInk).length === 0}`);
say(`   实测多出 ${diffSet(measuredInk, truthNew).length}：${diffSet(measuredInk, truthNew).slice(0, 10).join(' ')}`);
say(`   实测漏掉 ${diffSet(truthNew, measuredInk).length}：${diffSet(truthNew, measuredInk).slice(0, 10).join(' ')}`);
say(`③ 两码交集（必须 0）：${intersect.size}`);
say(`④ 并集 == 真值并集（156 条 / 48 页）：条 ${measuredUnion.size === truthUnion.size && diffSet(measuredUnion, truthUnion).length === 0 && diffSet(truthUnion, measuredUnion).length === 0} · 页 ${pagesUnion.size} / ${truthPages.size}`);
say(`⑤ 藏字条（dist.baseline 上必须 0）：${measuredHidden.size}${measuredHidden.size ? '：' + [...measuredHidden].join(' ') : ''}`);
say(`⑥ alreadyFine 245 条里被误报的（必须 0）：${diffSet(measuredUnion, truthFine).length === 0 ? 0 : diffSet(truthFine, measuredUnion).length === truthFine.size ? '（真值集合里没有 alreadyFine 明细，跳过）' : '?'}`);
// 逐条列出 48 条 note-narrow（抽查用）
say(`\n48 条 note-narrow 明细（route#index | 内容盒/列 | 行数/最宽行）：`);
const byKey = new Map(rows.map(r => [key(r), r]));
for (const k of [...measuredNarrow].sort()) {
  const r = byKey.get(k);
  say(`  ${k} | ${r.textWidth}/${r.column} | 行 ${r.lineCount} 最宽 ${r.widestLine} | ${String(r.text || '').slice(0, 22)}`);
}
const text = L.join('\n');
if (outPath) { fs.mkdirSync(require('path').dirname(outPath), { recursive: true }); fs.writeFileSync(outPath, text); console.log(`写盘 ${outPath}`); }
console.log(text.split('\n').slice(0, 20).join('\n'));
