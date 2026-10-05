#!/usr/bin/env node
/**
 * t10 工具 v2：**语句级**空集风险扫描（v1 只看单行，会漏掉跨行写法，例如
 * `rows.filter(...)\n  .every(...)` —— 本轮真的存在这种写法）。
 *
 * 做法：把源码按 `check(` 切块（括号配平），在**同一条断言的完整表达式**里找
 * `filter(...).every(` / `filter(...).some(`，并同时提取这条表达式里的"非空/计数前提"线索。
 *
 * 用法：node t10-filter-every-scan2.cjs <repoRoot> <outJson>
 */
'use strict';
const fs = require('fs');
const path = require('path');

const repo = path.resolve(process.argv[2]);
const outFile = path.resolve(process.argv[3]);

const files = [];
const walk = dir => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); }
    else if (e.isFile() && e.name.endsWith('.js')) files.push(p);
  }
};
walk(path.join(repo, 'scripts'));

/** 从 text 的 start（check 的 '(' 之后）开始，返回配平到右括号的表达式 + 结束偏移 */
function balancedSlice(text, openIndex) {
  let depth = 0;
  let i = openIndex;
  let inString = null;
  for (; i < text.length; i += 1) {
    const c = text[i];
    if (inString) {
      if (c === '\\') i += 1;
      else if (c === inString) inString = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { inString = c; continue; }
    if (c === '(') depth += 1;
    else if (c === ')') { depth -= 1; if (depth === 0) break; }
  }
  return { expr: text.slice(openIndex, i), end: i };
}

const hits = [];
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const lineAt = offset => text.slice(0, offset).split('\n').length;
  let idx = -1;
  while ((idx = text.indexOf('check(', idx + 1)) >= 0) {
    const openParen = idx + 'check'.length;
    const { expr } = balancedSlice(text, openParen);
    // 命中的形态（跨行也能命中）：filter(...) 之后接 .every( / .some(
    const pattern = /\.filter\([\s\S]{0,400}?\)\s*\.\s*(every|some)\s*\(/g;
    let m;
    while ((m = pattern.exec(expr)) !== null) {
      const at = lineAt(idx + openParen + m.index);
      const guards = [];
      if (/\.length\s*===\s*[\w.]+/.test(expr)) guards.push('表达式内有 length 计数对账');
      if (/\.length\s*(>|>=)\s*0/.test(expr) || /\.length\s*!==\s*0/.test(expr)) guards.push('表达式内有 length>0');
      if (/\.some\(/.test(expr.replace(m[0], ''))) guards.push('表达式内另有 .some(');
      if (/!==\s*undefined/.test(expr)) guards.push('表达式内有 !== undefined 短路');
      if (/Math\.min\(/.test(expr)) guards.push('表达式内有 Math.min');
      const nameMatch = expr.match(/^\s*[`'"]([^`'"]{0,140})/);
      hits.push({
        file: path.relative(repo, file).split(path.sep).join('/'),
        checkLine: lineAt(idx),
        hitLine: at,
        form: m[1],
        checkName: nameMatch ? nameMatch[1] : '(名字不是字面量)',
        exprLines: expr.split('\n').length,
        exprPreview: expr.replace(/\s+/g, ' ').slice(0, 260),
        guardHints: guards
      });
    }
    idx = idx + openParen;
  }
}

const summary = {
  repo, scannedFiles: files.length, hits: hits.length,
  byForm: hits.reduce((a, h) => { a[h.form] = (a[h.form] || 0) + 1; return a; }, {}),
  hints: hits.reduce((a, h) => { a[h.guardHints.length ? 'has-any-guard-hint' : 'no-guard-hint'] = (a[h.guardHints.length ? 'has-any-guard-hint' : 'no-guard-hint'] || 0) + 1; return a; }, {}),
  details: hits
};
fs.writeFileSync(outFile, `${JSON.stringify(summary, null, 2)}\n`);
console.log(`语句级扫描：${files.length} 个 .js，命中 ${hits.length} 处（every ${summary.byForm.every || 0} / some ${summary.byForm.some || 0}；有非空/计数前提线索 ${summary.hints['has-any-guard-hint'] || 0} 处，无线索 ${summary.hints['no-guard-hint'] || 0} 处）`);
for (const h of hits) {
  console.log(`  ${h.file}:${h.hitLine}（check@${h.checkLine}）[${h.form}] ${h.guardHints.length ? '线索:' + h.guardHints.join('; ') : '无线索'}`);
  console.log(`      「${h.checkName.slice(0, 80)}」 ${h.exprPreview.slice(0, 170)}`);
}
