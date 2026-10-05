#!/usr/bin/env node
/**
 * t7 独立复核：把 `releaseEvidenceQueue.queue`（打印出来的那 N 条）按**报告自己印出来的五条规则**
 * 用我自己的比较器重排一遍，看它是不是真的有序（不看实现者的自测）。
 *
 * 用法：node check-queue-order.cjs <capture.json>
 * 同时复核 gapClosureQueue 的分层次序（priority → tier code-unit → provider code-unit → 维度序）。
 */
'use strict';
const fs = require('fs');

const raw = fs.readFileSync(process.argv[2], 'utf8');
const at = raw.indexOf('\nJSON:\n');
const doc = JSON.parse(raw.slice(at + 7, raw.lastIndexOf('\n\n✅ ')));
const ct = doc.coverageTargets;

/* ---------- release queue：五条规则的独立比较器 ---------- */
const tierRankOf = { core: 0, major: 1, 'long-tail': 2 };
const compare = (a, b) => {
  if (a.releasedAtUnknown !== b.releasedAtUnknown) return a.releasedAtUnknown ? -1 : 1;
  if (a.groupSize !== b.groupSize) return b.groupSize - a.groupSize;
  const ar = tierRankOf[a.tier] === undefined ? 2 : tierRankOf[a.tier];
  const br = tierRankOf[b.tier] === undefined ? 2 : tierRankOf[b.tier];
  if (ar !== br) return ar - br;
  if (a.referenced !== b.referenced) return a.referenced ? -1 : 1;
  return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
};
const q = ct.releaseEvidenceQueue;
const problems = [];
for (let i = 1; i < q.queue.length; i += 1) {
  const c = compare(q.queue[i - 1], q.queue[i]);
  if (c > 0) problems.push(`release queue 第 ${i} / ${i + 1} 条逆序：${q.queue[i - 1].slug} > ${q.queue[i].slug}`);
}
// 规则①：未知必须全部排在已知前面（跨"截断边界"也要成立：最后一条未知的后面不许出现已知）
let seenKnown = false;
for (const row of q.queue) {
  if (!row.releasedAtUnknown) seenKnown = true;
  else if (seenKnown) problems.push(`release queue 里已知排在了未知前面：${row.slug}`);
}
// tierRank 必须与 tier 一致
for (const row of q.queue) {
  const expect = tierRankOf[row.tier] === undefined ? 2 : tierRankOf[row.tier];
  if (row.tierRank !== expect) problems.push(`tierRank 与 tier 不一致：${row.slug} tier=${row.tier} tierRank=${row.tierRank}`);
}
// referenced 必须 = referencedByApiPlans || referencedByPlans
for (const row of q.queue) {
  if (row.referenced !== (row.referencedByApiPlans || row.referencedByPlans)) problems.push(`referenced 与两个来源位不一致：${row.slug}`);
}
// rank 连号
q.queue.forEach((row, i) => { if (row.rank !== i + 1) problems.push(`rank 不是连号：${row.slug} rank=${row.rank}`); });

/* ---------- gap queue：A → B → C → D，层内 tier → provider → 维度序 ---------- */
const g = ct.gapClosureQueue;
const order = { A: 0, B: 1, C: 2, D: 3 };
const dims = ct.dimensionOrder || null;
const dimIndex = name => (dims ? dims.indexOf(name) : 0);
for (let i = 1; i < g.queue.length; i += 1) {
  const a = g.queue[i - 1]; const b = g.queue[i];
  const key = [order[a.priority], a.tier, a.provider, dimIndex(a.dimension)];
  const key2 = [order[b.priority], b.tier, b.provider, dimIndex(b.dimension)];
  let c = 0;
  for (let k = 0; k < key.length && c === 0; k += 1) c = key[k] < key2[k] ? -1 : key[k] > key2[k] ? 1 : 0;
  if (c > 0) problems.push(`gap queue 第 ${i} / ${i + 1} 条逆序：${a.priority}/${a.provider}/${a.dimension} > ${b.priority}/${b.provider}/${b.dimension}`);
}

console.log(JSON.stringify({
  releaseQueueRows: q.queue.length,
  releaseQueueTotal: q.total,
  releaseQueueUnknownCount: q.unknownCount,
  gapQueueRows: g.queue.length,
  gapTotal: g.total,
  gapCounts: g.counts,
  problems,
  verdict: problems.length ? 'ORDER_PROBLEM' : 'ok'
}, null, 2));
process.exit(problems.length ? 1 : 0);
