#!/usr/bin/env node
/**
 * t22：把题面 §87 的完成清单与 §88 的「假完成」清单抽成机器可读的 checklist.json。
 *
 * 为什么抽出来：t22 的交付物是「逐条判定」，逐条的前提是**条目本身有稳定编号**（题面里是 markdown checkbox，
 * 没有编号）。抽出来既便于本任务逐条填结论，也让下一个人能对拍「我判的是不是同一批条目」。
 *
 * 用法：node research/_raw/t22/extract-checklist.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');

const PROMPT = 'D:/AI_DEALS_COVERAGE_EXPANSION_V1_PROMPT.md';
const OUT = path.join(__dirname, 'checklist.json');

const lines = fs.readFileSync(PROMPT, 'utf8').split(/\r?\n/);
const items87 = [];
const items88 = [];
let mode = null;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (/^# 87\./.test(line)) { mode = '87'; continue; }
  if (/^# 88\./.test(line)) { mode = '88'; continue; }
  if (/^# 89\./.test(line)) { mode = null; continue; }
  if (mode === '87') {
    const hit = line.match(/^- \[ \] (.+)$/);
    if (hit) items87.push({ n: items87.length + 1, text: hit[1], srcLine: i + 1 });
  }
  if (mode === '88') {
    const text = line.trim();
    if (!text) continue;
    if (text.startsWith('```')) continue;
    if (/^(以下|###|---)/.test(text)) continue;
    items88.push({ n: items88.length + 1, text, srcLine: i + 1 });
  }
}

fs.writeFileSync(OUT, `${JSON.stringify({
  source: PROMPT,
  countedAt: new Date(0).toISOString(),   // 不读墙上时钟：写成纪元常量，说明这不是时间戳
  items87Count: items87.length,
  items88Count: items88.length,
  items87,
  items88
}, null, 2)}\n`, 'utf8');

console.log(`§87 条目数: ${items87.length}（题面行 ${items87[0].srcLine}–${items87[items87.length - 1].srcLine}）`);
console.log(`§88 条目数: ${items88.length}（题面行 ${items88[0].srcLine}–${items88[items88.length - 1].srcLine}）`);
console.log(`→ ${path.relative(path.resolve(__dirname, '..', '..', '..'), OUT)}`);
