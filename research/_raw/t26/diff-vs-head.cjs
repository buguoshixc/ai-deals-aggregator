/**
 * t26：把 t23 的落地改动**从 HEAD 里分离出来**（t23 未提交，所以只能对着 HEAD 比）。
 * 只读；不写任何生产文件。
 *
 * 用法：node research/_raw/t26/diff-vs-head.cjs
 */
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const headBlob = rel => JSON.parse(execFileSync('git', ['-C', ROOT, 'show', `HEAD:${rel}`], { encoding: 'utf8' }));
const cur = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

const linkKey = link => (link.apiPlanId !== undefined
  ? `A|${link.registrySlug}|${link.apiPlanId}|${link.modelKey}|${link.variant === null || link.variant === undefined ? '' : link.variant}`
  : `C|${link.registrySlug}|${link.planId}|${link.modelName}`);
const gapKey = d => (d.apiPlanId !== undefined
  ? `A|${d.apiPlanId}|${d.modelKey}|${d.variant === null || d.variant === undefined ? '' : d.variant}`
  : `C|${d.planId}|${d.modelName}`);

console.log('=== links：HEAD vs 现在 ===');
const headLinks = headBlob('scripts/data/model-registry-links.json').links;
const curLinks = cur('scripts/data/model-registry-links.json').links;
const headLinkMap = new Map(headLinks.map(l => [linkKey(l), l]));
const curLinkMap = new Map(curLinks.map(l => [linkKey(l), l]));
console.log(`HEAD ${headLinks.length} 条 · 现在 ${curLinks.length} 条`);
const added = curLinks.filter(l => !headLinkMap.has(linkKey(l)));
const removed = headLinks.filter(l => !curLinkMap.has(linkKey(l)));
const changed = curLinks.filter(l => headLinkMap.has(linkKey(l))
  && JSON.stringify(headLinkMap.get(linkKey(l))) !== JSON.stringify(l));
console.log(`\n新增 ${added.length} 条：`);
for (const link of added) console.log('  +', JSON.stringify(link));
console.log(`\n删除 ${removed.length} 条：`);
for (const link of removed) console.log('  -', JSON.stringify(link));
console.log(`\n字段变化 ${changed.length} 条（basis / evidence / note）：`);
for (const link of changed) {
  const before = headLinkMap.get(linkKey(link));
  console.log(`  ~ ${linkKey(link)}`);
  console.log(`      HEAD: basis=${before.basis} evidence=${JSON.stringify(before.evidence)} note=${JSON.stringify(before.note)}`);
  console.log(`      CUR : basis=${link.basis} evidence=${JSON.stringify(link.evidence)} note=${JSON.stringify(link.note)}`);
}

console.log('\n=== gaps：HEAD vs 现在 ===');
const headGaps = headBlob('scripts/data/model-registry-gaps.json').declarations;
const curGaps = cur('scripts/data/model-registry-gaps.json').declarations;
const headGapMap = new Map(headGaps.map(d => [gapKey(d), d]));
const curGapMap = new Map(curGaps.map(d => [gapKey(d), d]));
console.log(`HEAD ${headGaps.length} 条 · 现在 ${curGaps.length} 条`);
const gapAdded = curGaps.filter(d => !headGapMap.has(gapKey(d)));
const gapRemoved = headGaps.filter(d => !curGapMap.has(gapKey(d)));
console.log(`\n新增 ${gapAdded.length} 条：`);
for (const d of gapAdded) console.log('  +', gapKey(d));
console.log(`\n删除 ${gapRemoved.length} 条：`);
for (const d of gapRemoved) console.log('  -', gapKey(d), '| reason=', d.reason, '| note=', JSON.stringify(String(d.note || '').slice(0, 80)));
