#!/usr/bin/env node
/** 打印 raw/ 下某文件的纯文本片段（按字符区间），用于看页面结构。用法：node slice.cjs <file> <start> <end> */
'use strict';
const fs = require('fs');
const path = require('path');
const RAW = path.join(__dirname, 'raw');
const [file, startRaw, endRaw] = process.argv.slice(2);
const start = Number(startRaw) || 0;
const end = Number(endRaw) || start + 2000;
const html = fs.readFileSync(path.join(RAW, file), 'utf8');
const text = String(html)
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<\/(p|div|li|tr|h1|h2|h3|h4|h5|td|th|section|table)>/gi, '\n')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/[ \t\u00a0]+/g, ' ')
  .replace(/\n{2,}/g, '\n')
  .trim();
console.log(`### ${file} textLength=${text.length} slice=[${start},${end})`);
console.log(text.slice(start, end).replace(/\n/g, ' | '));
