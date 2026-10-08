#!/usr/bin/env node
/**
 * 本地用：打印快照 HTML 里的 a[href] 列表（可选按正则过滤）。
 * 用法：node research/_raw/sources-residue-v1b/extract-links.js <file.html> [filterSource]
 * filterSource 是一段**正则字面量源码**（默认 '.*'），例如 '/1823\\//'。
 */
'use strict';
const fs = require('fs');
const zlib = require('zlib');

const file = process.argv[2];
const filterSource = process.argv[3] || '.*';
const re = new RegExp(filterSource);

const raw = fs.readFileSync(file);
const html = (raw[0] === 0x1f && raw[1] === 0x8b) ? zlib.gunzipSync(raw).toString('utf8') : raw.toString('utf8');

const seen = new Set();
for (const m of html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]{0,80}?)<\/a>/g)) {
  const href = m[1];
  const label = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  const line = `${label}  ->  ${href}`;
  if (seen.has(line)) continue;
  seen.add(line);
  if (re.test(href) || re.test(label)) console.log(line);
}
