#!/usr/bin/env node
/**
 * 抽 Anthropic 新闻页内嵌 JSON 的 featuredGridLink 条目（date / title / url），官方页面自带。
 * 用法：node anthropic-featured.cjs <raw/文件>
 */
'use strict';
const fs = require('fs');
const path = require('path');
const file = process.argv[2];
const html = fs.readFileSync(path.join(__dirname, 'raw', file), 'utf8');
// 页面 JSON 里的 \" 转义：先还原一层
const decoded = html.replace(/\\"/g, '"');
const re = /"_type":"featuredGridLink","date":"([^"]+)","subject":"([^"]*)","summary":"([^"]*)","title":"([^"]+)","url":"([^"]+)"/g;
let match;
let count = 0;
while ((match = re.exec(decoded)) !== null) {
  count += 1;
  console.log(`${match[1]} | ${match[2]} | ${match[4]} | ${match[5]}`);
}
console.log(`## total=${count} in ${file}`);
