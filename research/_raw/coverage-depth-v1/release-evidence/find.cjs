#!/usr/bin/env node
/**
 * coverage-depth-v1 Workstream A：**官方语料本地检索器**（只读，不联网）。
 *
 * 把 raw/ 下的 HTML 去标签成纯文本后，按给定的模型名/正则找命中，打印每条命中的
 * 上下文（默认前后 260 字）以及同一窗口内出现的日期串。用途：在**不把整页塞进上下文**的
 * 前提下定位官方原文，人工复核时再把命中段落逐字抄进 releaseEvidence。
 *
 * 用法：
 *   node find.cjs raw/aliyun-model-release-notes.html "Qwen3.8-Max" "qwen3.8-max"
 *   node find.cjs --all "Qwen3.8"            # 扫 raw/ 全部文件
 *   node find.cjs --list                     # 只列出语料文件与大小
 */
'use strict';
const fs = require('fs');
const path = require('path');

const RAW = path.join(__dirname, 'raw');

function toText(html) {
  return String(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h1|h2|h3|h4|h5|td|th|section)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

const args = process.argv.slice(2);
if (!args.length || args[0] === '--list') {
  for (const file of fs.readdirSync(RAW).sort()) {
    const stat = fs.statSync(path.join(RAW, file));
    console.log(`${String(stat.size).padStart(9)}  ${file}`);
  }
  process.exit(0);
}

let files = [];
let patterns = [];
if (args[0] === '--all') {
  files = fs.readdirSync(RAW).filter(f => f.endsWith('.html')).sort();
  patterns = args.slice(1);
} else {
  files = [args[0]];
  patterns = args.slice(1);
}
if (!patterns.length) { console.error('need at least one pattern'); process.exit(2); }

const WINDOW = Number(process.env.WINDOW || 260);
for (const file of files) {
  const full = path.join(RAW, file);
  if (!fs.existsSync(full)) { console.log(`!! missing ${file}`); continue; }
  const text = toText(fs.readFileSync(full, 'utf8'));
  for (const pattern of patterns) {
    let re;
    try { re = new RegExp(pattern, 'gi'); } catch (e) { console.log(`!! bad regex ${pattern}: ${e.message}`); continue; }
    let match;
    let count = 0;
    while ((match = re.exec(text)) !== null && count < 12) {
      count += 1;
      const start = Math.max(0, match.index - WINDOW);
      const end = Math.min(text.length, match.index + match[0].length + WINDOW);
      const ctx = text.slice(start, end).replace(/\n/g, ' ⏎ ');
      const dates = [...new Set((text.slice(start, end).match(/\d{4}[-/年]\d{1,2}[-/月]\d{1,2}日?/g) || []))];
      console.log(`\n=== ${file} :: /${pattern}/ #${count} @${match.index} ${dates.length ? '[' + dates.join(', ') + ']' : ''}`);
      console.log(ctx);
      if (re.lastIndex === match.index) re.lastIndex += 1;
    }
    if (!count) console.log(`-- ${file} :: /${pattern}/ 无命中`);
  }
}
