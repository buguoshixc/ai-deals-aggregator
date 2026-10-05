#!/usr/bin/env node
/**
 * coverage-depth-v1 Workstream A：**任务文件驱动的本地语料检索**（只读，不联网）。
 *
 * 为什么要任务文件：中文正则写在 pwsh 命令行里会被 PowerShell 解析器吃掉（现场踩过），
 * 所以模式一律写进 `probe-job.json`（UTF-8，由编辑器写入），命令行只传 ASCII 路径。
 *
 * probe-job.json 形态：
 * {
 *   "files": ["volcengine-ark-models.html"],        // 或 ["*"]
 *   "jobs": [ { "label": "x", "pattern": "正则", "window": 300, "max": 6 } ],
 *   "links": [ { "file": "x.html", "pattern": "正则", "max": 30 } ]
 * }
 * 输出：纯文本，逐条命中（含命中窗口内出现的日期串）。
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
    .replace(/<\/(p|div|li|tr|h1|h2|h3|h4|h5|td|th|section|table)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

const jobFile = process.argv[2] || path.join(__dirname, 'probe-job.json');
const job = JSON.parse(fs.readFileSync(jobFile, 'utf8'));
const all = fs.readdirSync(RAW).sort();
const files = (job.files && job.files.length && job.files[0] !== '*')
  ? job.files.filter(f => all.includes(f))
  : all;

for (const task of job.jobs || []) {
  const window = Number(task.window) || 300;
  const max = Number(task.max) || 6;
  let total = 0;
  console.log(`\n##### pattern /${task.pattern}/ ${task.label ? '(' + task.label + ')' : ''}`);
  for (const file of files) {
    const text = toText(fs.readFileSync(path.join(RAW, file), 'utf8'));
    const re = new RegExp(task.pattern, 'gi');
    let match;
    let shown = 0;
    while ((match = re.exec(text)) !== null && shown < max) {
      shown += 1; total += 1;
      const start = Math.max(0, match.index - window);
      const end = Math.min(text.length, match.index + match[0].length + window);
      const ctx = text.slice(start, end).replace(/\n/g, ' | ');
      const dates = [...new Set((text.slice(start, end).match(/\d{4}[-/年.]\d{1,2}[-/月.]\d{1,2}日?/g) || []))];
      console.log(`\n--- ${file} #${shown} @${match.index} ${dates.length ? '[' + dates.join(', ') + ']' : '[no-date]'}`);
      console.log(ctx);
      if (re.lastIndex === match.index) re.lastIndex += 1;
    }
  }
  if (!total) console.log('(no hits)');
}

for (const task of job.links || []) {
  const html = fs.readFileSync(path.join(RAW, task.file), 'utf8');
  const re = new RegExp(task.pattern, 'i');
  const max = Number(task.max) || 30;
  const seen = new Set();
  let shown = 0;
  console.log(`\n##### links in ${task.file} matching /${task.pattern}/`);
  for (const match of html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]{0,140}?)<\/a>/g)) {
    const href = match[1];
    const text = match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const line = `${href} :: ${text}`;
    if (seen.has(line) || (!re.test(href) && !re.test(text))) continue;
    seen.add(line);
    console.log(line.slice(0, 240));
    if (++shown >= max) break;
  }
  if (!shown) console.log('(no links)');
}
