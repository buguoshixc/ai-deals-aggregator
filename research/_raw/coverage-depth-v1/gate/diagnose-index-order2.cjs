#!/usr/bin/env node
/** captain 诊断（只读）②：`modelsOf(modelsTable)` 的次序 vs 发布数据集次序。 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..', '..');

const modelsPage = require(path.join(ROOT, 'scripts', 'lib', 'models-page'));
const modelRegistry = require(path.join(ROOT, 'scripts', 'lib', 'model-registry'));

const srcRaw = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/data/models.json'), 'utf8'));
const srcKeys = Object.keys(srcRaw).filter(k => !k.startsWith('_'));
const table = {};
for (const k of srcKeys) table[k] = srcRaw[k];

const modelsOf = modelsPage.modelsOf(table).map(m => m.slug);
const published = JSON.parse(fs.readFileSync(path.join(ROOT, 'models.json'), 'utf8')).models.map(m => m.slug);

console.log('source layers key order (first 12):', srcKeys.slice(0, 12).join(' | '));
console.log('modelsOf(modelsTable)  (first 12):', modelsOf.slice(0, 12).join(' | '));
console.log('published models.json  (first 12):', published.slice(0, 12).join(' | '));
console.log('');
console.log('modelsOf === published order ?', JSON.stringify(modelsOf) === JSON.stringify(published));
console.log('modelsOf === source key order ?', JSON.stringify(modelsOf) === JSON.stringify(srcKeys));
console.log('published === sorted(source keys) ?',
  JSON.stringify(published) === JSON.stringify([...srcKeys].sort()));

let first = -1;
for (let i = 0; i < Math.max(modelsOf.length, published.length); i++) {
  if (modelsOf[i] !== published[i]) { first = i; break; }
}
console.log('first divergence (modelsOf vs published):', first);
if (first >= 0) {
  console.log('  modelsOf [' + first + '..]:', modelsOf.slice(first, first + 8).join(' | '));
  console.log('  published[' + first + '..]:', published.slice(first, first + 8).join(' | '));
}
console.log('');
console.log('published is sorted?', JSON.stringify(published) === JSON.stringify([...published].sort()));
console.log('source keys sorted? ', JSON.stringify(srcKeys) === JSON.stringify([...srcKeys].sort()));
