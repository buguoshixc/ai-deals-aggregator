#!/usr/bin/env node
/** 补丁 2：忠实度复核改为**双通道**——(a) 去标签文本（正文引文）与 (b) 原样文件（内嵌 JSON 负载）
 *  任一条逐字命中即可。用法：node patch-checker2.cjs && node apply-evidence.cjs --check-only */
'use strict';
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'apply-evidence.cjs');
let src = fs.readFileSync(file, 'utf8');
const before = src;

src = src.replace(
  `  const text = rawTextOf(item.rawFile);`,
  `  const text = rawTextOf(item.rawFile);\n  const rawText = rawSquashOf(item.rawFile);`
);
if (!src.includes(`const rawText = rawSquashOf(`)) throw new Error('anchor 1 not found');

src = src.replace(
  `    if (!text.includes(needle)) problems.push(`,
  `    if (!text.includes(needle) && !(rawText !== null && rawText.includes(needle))) problems.push(`
);
if (!src.includes(`rawText !== null && rawText.includes(needle)`)) throw new Error('anchor 2 not found');

src = src.replace(
  `const problems = [];`,
  `const problems = [];\nconst rawCache = new Map();\nfunction rawSquashOf(file) {\n  if (!rawCache.has(file)) {\n    const full = path.join(RAW, file);\n    rawCache.set(file, fs.existsSync(full) ? squash(fs.readFileSync(full, 'utf8')) : null);\n  }\n  return rawCache.get(file);\n}`
);
if (!src.includes('function rawSquashOf')) throw new Error('anchor 3 not found');

fs.writeFileSync(file, src);
console.log(`patched=${before !== src}`);
