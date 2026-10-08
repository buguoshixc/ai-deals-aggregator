#!/usr/bin/env node
/**
 * t14 侦察（Tier-3）：列出各模块里每个 `.snote` 构造点的上下文形态，供机械改造判定
 * 「包在模板字面量里」还是「字符串拼接」。只读、不写。
 * 用法：node .arch-v1/recon.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const FILES = [
  'scripts/lib/data-docs.js',
  'scripts/lib/archive.js',
  'scripts/lib/plans-page.js',
  'scripts/lib/api-plans-page.js',
  'scripts/lib/models-page.js',
  'scripts/lib/plans-hub-page.js',
  'index.html'
];

function spansOf(text) {
  const out = [];
  const re = /<p class="snote/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const start = m.index;
    const endMark = text.indexOf('</p>', start);
    if (endMark < 0) { out.push({ start, broken: true }); continue; }
    out.push({ start, end: endMark + 4, text: text.slice(start, endMark + 4) });
  }
  return out;
}

for (const rel of FILES) {
  const file = path.join(ROOT, rel);
  const text = fs.readFileSync(file, 'utf8');
  const spans = spansOf(text);
  const lineOf = off => text.slice(0, off).split('\n').length;
  console.log(`=== ${rel} · ${spans.length} 处`);
  for (const s of spans) {
    const before = text.slice(Math.max(0, s.start - 46), s.start).replace(/\n/g, '⏎');
    const classes = (/"snote([^"]*)"/.exec(text.slice(s.start, s.start + 60)) || [])[1] || '';
    const multi = s.text.includes('\n');
    const hasBacktick = s.text.includes('`');
    const outerDollar = s.text.includes('${');
    console.log(`  L${lineOf(s.start)} cls=[snote${classes}] multi=${multi} hasTick=${hasBacktick} hasInterp=${outerDollar}  before=«${before}»`);
  }
}
