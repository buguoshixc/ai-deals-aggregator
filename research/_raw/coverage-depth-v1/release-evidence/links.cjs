#!/usr/bin/env node
/**
 * coverage-depth-v1 Workstream A：从下载的官方页里**抽链接**（URL 发现，不联网）。
 * 用法：node links.cjs <raw/文件名> <关键字正则> [max]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const RAW = path.join(__dirname, 'raw');

const [file, pattern = '.', maxRaw] = process.argv.slice(2);
const max = Number(maxRaw) || 40;
const html = fs.readFileSync(path.join(RAW, file), 'utf8');
const re = new RegExp(pattern, 'i');
const seen = new Set();
let shown = 0;
for (const match of html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]{0,120}?)<\/a>/g)) {
  const href = match[1];
  const text = match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const line = `${href} :: ${text}`;
  if (seen.has(line)) continue;
  seen.add(line);
  if (!re.test(href) && !re.test(text)) continue;
  console.log(line.slice(0, 220));
  if (++shown >= max) break;
}
if (!shown) console.log(`(no links matching /${pattern}/ in ${file})`);
