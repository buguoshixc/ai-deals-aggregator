#!/usr/bin/env node
/** 一次性小补丁：让 apply-evidence.cjs 的忠实度复核**保留页面内嵌 JSON 负载**（再跑一次即可）。 */
'use strict';
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'apply-evidence.cjs');
let src = fs.readFileSync(file, 'utf8');
const before = src;

const anchor = "const squash = value =>";
const inject = `/** 复核专用提取器：**保留 <script> 内容**（官方发布日有时只写在页面的 JSON-LD / 内嵌负载里），
 *  只去掉标签本身与 style 标签。正文引文两种提取器都能命中。 */
function toTextKeepPayloads(html) {
  return String(html)
    .replace(/<script\\b[^>]*>/gi, '\\n').replace(/<\\/script>/gi, '\\n')
    .replace(/<style\\b[^>]*>[\\s\\S]*?<\\/style>/gi, ' ')
    .replace(/<noscript\\b[^>]*>[\\s\\S]*?<\\/noscript>/gi, ' ')
    .replace(/<br\\s*\\/?>/gi, '\\n')
    .replace(/<\\/(p|div|li|tr|h1|h2|h3|h4|h5|td|th|section|table)>/gi, '\\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&mdash;/g, '—')
    .replace(/[ \\t\\u00a0]+/g, ' ');
}

`;
if (!src.includes('toTextKeepPayloads')) {
  src = src.replace(anchor, inject + anchor);
  src = src.replace('squash(toText(fs.readFileSync(full, \'utf8\')))', 'squash(toTextKeepPayloads(fs.readFileSync(full, \'utf8\')))');
}
fs.writeFileSync(file, src);
console.log(`patched=${before !== src} hasFn=${src.includes('toTextKeepPayloads')} usesFn=${src.includes('squash(toTextKeepPayloads(')}`);
