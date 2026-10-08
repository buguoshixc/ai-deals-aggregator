#!/usr/bin/env node
/**
 * 本地用：把快照 HTML 剥成可见文本行，打印出来（t16 现场读数用）。
 * 用法：node research/_raw/sources-residue-v1b/dump-visible.js <file.html> [起始行] [行数]
 * 只读、不写盘（除 stdout）。快照可能是 gzip 字节流，显式识别魔数解压。
 */
'use strict';
const fs = require('fs');
const zlib = require('zlib');

const file = process.argv[2];
const from = Number(process.argv[3] || 0);
const count = Number(process.argv[4] || 100000);

const raw = fs.readFileSync(file);
const html = (raw[0] === 0x1f && raw[1] === 0x8b) ? zlib.gunzipSync(raw).toString('utf8') : raw.toString('utf8');
const text = html
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, '\n')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&#x27;|&#39;/g, "'")
  .replace(/&quot;/g, '"')
  .replace(/&gt;/g, '>')
  .replace(/&lt;/g, '<')
  .replace(/&mdash;/g, '-');
const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
console.log(`# ${file} → ${lines.length} 行可见文本（显示 ${from}..${from + count}）`);
lines.slice(from, from + count).forEach((line, i) => console.log(String(from + i).padStart(4) + '| ' + line));
