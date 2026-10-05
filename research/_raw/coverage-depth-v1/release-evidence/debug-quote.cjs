#!/usr/bin/env node
/** 调试用：把 raw/ 某文件按 apply-evidence.cjs 的同一套归一化处理后，打印某个锚点周围的文本。 */
'use strict';
const fs = require('fs');
const path = require('path');
const [file, anchor] = process.argv.slice(2);
const html = fs.readFileSync(path.join(__dirname, 'raw', file), 'utf8');
const text = html
  .replace(/<script\b[^>]*>/gi, '\n').replace(/<\/script>/gi, '\n')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/[\s\u200b]+/g, '').replace(/\u00a0/g, '').replace(/\\+/g, '');
const index = text.indexOf(anchor);
console.log(`file=${file} normalizedLen=${text.length} anchor="${anchor}" at=${index}`);
if (index >= 0) console.log(text.slice(Math.max(0, index - 120), index + 320));
else {
  // 找最接近的前缀
  for (let len = anchor.length; len > 8; len -= 4) {
    const probe = anchor.slice(0, len);
    const pos = text.indexOf(probe);
    if (pos >= 0) { console.log(`longest prefix hit len=${len}: pos=${pos}`); console.log(text.slice(pos, pos + 320)); break; }
  }
}
