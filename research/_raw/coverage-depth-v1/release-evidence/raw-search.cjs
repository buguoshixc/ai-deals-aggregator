#!/usr/bin/env node
/** 在 raw/ 某文件里找正则命中并打印周围原文（不转义、不做标签剥离），用于定位页面 JSON 负载。用法：node raw-search.cjs <file> <pattern> <window> */
'use strict';
const fs = require('fs');
const path = require('path');
const RAW = path.join(__dirname, 'raw');
const [file, pattern, windowRaw] = process.argv.slice(2);
const window = Number(windowRaw) || 200;
const html = fs.readFileSync(path.join(RAW, file), 'utf8');
const hits = [...html.matchAll(new RegExp(pattern, 'g'))];
console.log(`## ${file} /${pattern}/ hits=${hits.length} len=${html.length}`);
for (const hit of hits.slice(0, 8)) {
  console.log(`\n--- @${hit.index}`);
  console.log(html.slice(Math.max(0, hit.index - window), hit.index + window).replace(/\s+/g, ' '));
}
