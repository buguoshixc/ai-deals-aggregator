#!/usr/bin/env node
'use strict';
/* 一次性的诊断：`.dsrc-note` 到底有多少个元素？
 *
 * 背景：队长自己的 `scan-containers.cjs`（祖先归因版）数出 **162**，
 * 而构建期牙与真浏览器都报 **165**。差 3 必须有个解释，不能含糊过去。
 *
 * 两种数法：
 *   A · `<tag … class="…">` 一次正则拿全（要求 class 出现在同一个开标签里）——队长那版用这个
 *   B · 只扫 `class="…"` 属性本身（不要求与标签名同一次匹配）——最宽松
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const DIST = path.join(ROOT, process.argv[2] || 'dist');

function walk(d, o) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, o);
    else if (e.name.endsWith('.html')) o.push(p);
  }
  return o;
}

const mask = (html) => html
  .replace(/<script\b[\s\S]*?<\/script\s*>/gi, (m) => ' '.repeat(m.length))
  .replace(/<style\b[\s\S]*?<\/style\s*>/gi, (m) => ' '.repeat(m.length))
  .replace(/<!--[\s\S]*?-->/g, (m) => ' '.repeat(m.length));

let byRegex = 0;
let byClassAttr = 0;
const perFileDelta = [];

for (const f of walk(DIST, [])) {
  const masked = mask(fs.readFileSync(f, 'utf8'));
  let a = 0;
  for (const m of masked.matchAll(/<([a-zA-Z][\w-]*)\b[^>]*class="([^"]*)"[^>]*>/g)) {
    if (m[2].split(/\s+/).filter(Boolean).includes('dsrc-note')) a += 1;
  }
  let b = 0;
  for (const m of masked.matchAll(/class="([^"]*)"/g)) {
    if (m[1].split(/\s+/).filter(Boolean).includes('dsrc-note')) b += 1;
  }
  byRegex += a;
  byClassAttr += b;
  if (a !== b) perFileDelta.push(`${path.relative(DIST, f).split(path.sep).join('/')}  A=${a} B=${b}`);
}

console.log(`A · tag+class 一次正则 : ${byRegex}`);
console.log(`B · 只扫 class 属性     : ${byClassAttr}`);
console.log(`差额 B-A = ${byClassAttr - byRegex}`);
console.log(`逐文件不一致的页（${perFileDelta.length}）：`);
for (const line of perFileDelta) console.log('  ' + line);
