#!/usr/bin/env node
/**
 * t14 侦察 2（Tier-3）：为每个 `.snote` 构造点找出**所在函数的参数名**（拿 ctx 用）。
 * 只读、不写。用法：node .arch-v1/recon2.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const FILES = [
  'scripts/lib/data-docs.js',
  'scripts/lib/archive.js',
  'scripts/lib/plans-page.js',
  'scripts/lib/api-plans-page.js',
  'scripts/lib/models-page.js',
  'scripts/lib/plans-hub-page.js'
];

for (const rel of FILES) {
  const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const lines = text.split('\n');
  console.log(`=== ${rel}`);
  lines.forEach((line, i) => {
    if (!line.includes('<p class="snote')) return;
    // 向上找最近的函数声明
    for (let j = i; j >= 0; j--) {
      const m = /^\s*(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/.exec(lines[j])
        || /^\s*(?:const|let)\s+(\w+)\s*=\s*\(([^)]*)\)\s*=>/.exec(lines[j]);
      if (m) { console.log(`  L${i + 1}  ${m[1]}(${m[2].trim()})`); break; }
      if (j === 0) console.log(`  L${i + 1}  (找不到函数)`);
    }
  });
}
