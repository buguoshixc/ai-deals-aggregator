#!/usr/bin/env node
/**
 * T1 证据脚本：核对产出的 dist 里 `.snote` 规则的**页内出现次数**。
 *
 * 契约（T1 acceptance）：
 *   · 任意页面的内联 <style> 中 `.snote { color: var(--mut)` 恰好出现 1 次；
 *   · 不再有任何页面上出现 `max-width: 70ch` 的 .snote。
 *
 * 只读 dist（不写任何产物）。用法：node audit-dist-snote.js [dir=dist]
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = process.argv[2] || 'dist';
const RULE = '.snote { color: var(--mut)';

const files = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.html')) files.push(full.split(path.sep).join('/'));
  }
})(root);

const offenders = [];
let exactlyOne = 0;
for (const file of files) {
  const html = fs.readFileSync(file, 'utf8');
  const count = (html.split(RULE).length - 1);
  if (count === 1) exactlyOne += 1;
  else offenders.push(`${file}: ${count}`);
}

const snote70 = files.filter(file => /\.snote[^}]*max-width: 70ch/.test(fs.readFileSync(file, 'utf8')));
const any70 = files.filter(file => fs.readFileSync(file, 'utf8').includes('max-width: 70ch'));
const classified = {
  none: files.filter(file => {
    const html = fs.readFileSync(file, 'utf8');
    return !html.includes(RULE);
  }).length,
  moreThanOne: offenders.length - files.filter(file => !fs.readFileSync(file, 'utf8').includes(RULE)).length
};
// 只在 style 块里数规则（class 用法不算）：`<style>` 段内的 `.snote` 规则条数
const ruleCounts = new Map();
for (const file of files) {
  const html = fs.readFileSync(file, 'utf8');
  const styles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(match => match[1]).join('\n');
  const rules = (styles.match(/\.snote\s*\{/g) || []).length;
  ruleCounts.set(rules, (ruleCounts.get(rules) || 0) + 1);
}

console.log(`dir=${root}`);
console.log(`html files: ${files.length}`);
console.log(`pages with exactly 1 occurrence of "${RULE}": ${exactlyOne}`);
console.log(`offenders (count != 1): ${offenders.length}${offenders.length ? ' -> ' + offenders.slice(0, 10).join(' | ') : ''}`);
console.log(`classification: none=${classified.none} multi=${classified.moreThanOne}`);
console.log(`pages whose <style> blocks contain a ".snote {" rule, by rule-count: ${JSON.stringify([...ruleCounts.entries()])}`);
console.log(`pages with ".snote ... max-width: 70ch": ${snote70.length}${snote70.length ? ' -> ' + snote70.slice(0, 5).join(' | ') : ''}`);
console.log(`pages containing literal "max-width: 70ch" (any selector): ${any70.length}${any70.length ? ' -> ' + any70.slice(0, 5).join(' | ') : ''}`);

const ok = offenders.length === 0 && snote70.length === 0 && any70.length === 0 && files.length > 0;
console.log(ok ? 'OK: .snote 唯一出处成立（每页恰好 1 条），且没有 70ch 的 .snote' : 'FAIL');
process.exit(ok ? 0 : 1);
