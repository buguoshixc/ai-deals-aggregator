#!/usr/bin/env node
/**
 * t9 工具：把 `node scripts/tools/coverage-report.js --json` 的 stdout 切成两半 ——
 *
 * 该命令的 stdout 形状是「人类可读报告 + `JSON:` 标记 + 一个 JSON 对象 + 收尾一行」，
 * 于是 `--json` 的输出**不是**纯 JSON。t1/t6 用的是 spawnSync fd 重定向拿到纯 JSON；
 * 本文件用**花括号配对**从混合文本里切出那一个对象（字符串内的括号不参与计数），
 * 以便「拿同一份读数字节做对照」这件事不依赖捕获方式。
 *
 * 用法：node extract-report-json.cjs <stdout 文件> <输出 JSON 文件>
 */

const fs = require('fs');
const path = require('path');

const [, , input, output] = process.argv;
if (!input || !output) {
  console.error('用法: node extract-report-json.cjs <stdout 文件> <输出 JSON 文件>');
  process.exit(1);
}

const raw = fs.readFileSync(input, 'utf8').replace(/^\uFEFF/, '');
const marker = raw.indexOf('JSON:');
if (marker < 0) {
  console.error('未找到 `JSON:` 标记 —— 这份 stdout 不是 coverage-report.js --json 的产物');
  process.exit(1);
}
const start = raw.indexOf('{', marker);
let depth = 0;
let inString = false;
let escaped = false;
let end = -1;
for (let i = start; i < raw.length; i++) {
  const ch = raw[i];
  if (inString) {
    if (escaped) escaped = false;
    else if (ch === '\\') escaped = true;
    else if (ch === '"') inString = false;
    continue;
  }
  if (ch === '"') { inString = true; continue; }
  if (ch === '{') depth += 1;
  else if (ch === '}') {
    depth -= 1;
    if (depth === 0) { end = i + 1; break; }
  }
}
if (end < 0) {
  console.error('花括号没有配对 —— 提取失败');
  process.exit(1);
}

const jsonText = raw.slice(start, end);
const parsed = JSON.parse(jsonText);
fs.writeFileSync(output, jsonText, 'utf8');
console.log(`提取成功：${jsonText.length} 字节 → ${path.relative(process.cwd(), output)}`);
console.log(`顶层键：${Object.keys(parsed).join(',')}`);
