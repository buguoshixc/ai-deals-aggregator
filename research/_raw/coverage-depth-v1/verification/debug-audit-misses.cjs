#!/usr/bin/env node
/**
 * t9 调试：把「无法复核」的引文逐条压到 raw 语料上，打印 token 命中率与缺失 token ——
 * 用来区分「证据有问题」与「我的匹配器不够好」。只读。
 *
 * 用法：node debug-audit-misses.cjs <slug> [<slug> ...]
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const RAW_DIR = path.join(ROOT, 'research', '_raw', 'coverage-depth-v1', 'release-evidence', 'raw');
const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/data/models.json'), 'utf8'));

function normalize(text) {
  return String(text)
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/\\n|\\r|\\t/g, ' ')
    .replace(/\\"/g, '"')
    .replace(/\\\//g, '/');
}
const squash = text => normalize(text).replace(/<[^>]+>/g, ' ').replace(/\s+/g, '').toLowerCase();

function tokensOf(quote) {
  const text = normalize(quote);
  const tokens = new Set();
  for (const run of text.match(/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]{3,}/g) || []) tokens.add(run);
  for (const word of text.match(/[A-Za-z][A-Za-z0-9._\-/]{4,}/g) || []) tokens.add(word.toLowerCase());
  for (const num of text.match(/\d{4,}/g) || []) tokens.add(num);
  return [...tokens];
}

const files = fs.readdirSync(RAW_DIR).map(name => ({
  name,
  squashed: squash(fs.readFileSync(path.join(RAW_DIR, name), 'utf8'))
}));

for (const slug of process.argv.slice(2)) {
  const entry = registry[slug];
  if (!entry) { console.log(`${slug}: 不在 registry`); continue; }
  console.log(`\n=== ${slug} (${entry.releasedAt}) ===`);
  for (const item of entry.releaseEvidence || []) {
    const quote = item.quote || '';
    const tokens = tokensOf(quote);
    console.log(`引文（${quote.length} 字符，token ${tokens.length} 个）：${quote.slice(0, 200)}`);
    const ranked = files.map(file => {
      const missing = tokens.filter(token => !file.squashed.includes(squash(token)));
      return { name: file.name, ratio: (tokens.length - missing.length) / tokens.length, missing };
    }).sort((a, b) => b.ratio - a.ratio);
    for (const row of ranked.slice(0, 3)) {
      console.log(`  ${(row.ratio * 100).toFixed(0)}%  ${row.name}  缺失 token: ${JSON.stringify(row.missing.slice(0, 6))}`);
    }
  }
}
