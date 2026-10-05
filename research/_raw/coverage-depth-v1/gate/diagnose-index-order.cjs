#!/usr/bin/env node
/**
 * captain 诊断（只读）：定位 models-page-selftest 那条「索引页行序 == 发布 slug 序列」失败的真实性质。
 * 只回答一个问题：**次序差异来自哪一行、是什么规则造成的**，从而判定该修谁。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
process.chdir(ROOT);

const modelsPage = require(path.join(ROOT, 'scripts', 'lib', 'models-page'));
const modelRegistry = require(path.join(ROOT, 'scripts', 'lib', 'model-registry'));

const published = JSON.parse(fs.readFileSync(path.join(ROOT, 'models.json'), 'utf8')).models;
const html = String(modelsPage.renderModelsIndex({ models: published }, { prefix: '../', __refCache: new Map() }) || '');
const rendered = [...html.matchAll(/<tr data-model="([^"]*)"/g)].map(m => m[1]);
const expected = published.map(m => m.slug);

console.log('published models :', expected.length);
console.log('rendered rows    :', rendered.length);
console.log('set equal        :', JSON.stringify([...rendered].sort()) === JSON.stringify([...expected].sort()));

let first = -1;
for (let i = 0; i < Math.max(rendered.length, expected.length); i++) {
  if (rendered[i] !== expected[i]) { first = i; break; }
}
console.log('first divergence :', first);
if (first >= 0) {
  const w = 8;
  console.log('  expected[' + first + '..]:', expected.slice(first, first + w).join(' | '));
  console.log('  rendered[' + first + '..]:', rendered.slice(first, first + w).join(' | '));
}

/* 次序差异的**模式**：是不是「按 catalogStatus 分组」？ */
const bySlug = new Map(published.map(m => [m.slug, m]));
const seq = rendered.map(s => (bySlug.get(s) || {}).catalogStatus || '??');
let runs = [];
for (const st of seq) {
  if (!runs.length || runs[runs.length - 1].state !== st) runs.push({ state: st, n: 1 });
  else runs[runs.length - 1].n++;
}
console.log('rendered catalogStatus runs:', runs.map(r => `${r.state}×${r.n}`).join(' → '));

/* 反向：发布文件自身的 catalogStatus 是否也是分段的？ */
let pubRuns = [];
for (const m of published) {
  const st = m.catalogStatus || '??';
  if (!pubRuns.length || pubRuns[pubRuns.length - 1].state !== st) pubRuns.push({ state: st, n: 1 });
  else pubRuns[pubRuns.length - 1].n++;
}
console.log('published catalogStatus runs:', pubRuns.map(r => `${r.state}×${r.n}`).join(' → '));

/* 差异的完整置换描述（每行应该在哪、实际在哪） */
const pos = new Map(expected.map((s, i) => [s, i]));
const moved = rendered.map((s, i) => ({ slug: s, expectedIndex: pos.get(s), actualIndex: i }))
  .filter(r => r.expectedIndex !== r.actualIndex);
console.log('moved rows       :', moved.length);
console.log(JSON.stringify(moved.slice(0, 12), null, 1));

/* 另三条失败的写死基线读数 */
const linkDoc = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/data/model-registry-links.json'), 'utf8'));
const multiVariant = new Map();
for (const l of (linkDoc.links || [])) {
  const key = l.registrySlug;
  if (!key) continue;
  if (!multiVariant.has(key)) multiVariant.set(key, []);
  multiVariant.get(key).push(l);
}
console.log('registry models in published set:', published.length);
