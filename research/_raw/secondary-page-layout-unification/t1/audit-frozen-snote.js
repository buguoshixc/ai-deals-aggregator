#!/usr/bin/env node
/**
 * T1 证据脚本：核对 index.html 共享 `<style>` 里的 `.snote` 规则**逐字等于冻结串**。
 *
 * 冻结串（T1/T2 的锚点，不许改空格）：
 *   .snote { color: var(--mut); font-size: var(--fs-sm); line-height: 1.7; margin: 0 0 var(--s3); max-width: none; overflow-wrap: anywhere; }
 *
 * 只读。用法：node audit-frozen-snote.js
 */
'use strict';

const fs = require('fs');

const FROZEN = '.snote { color: var(--mut); font-size: var(--fs-sm); line-height: 1.7; margin: 0 0 var(--s3); max-width: none; overflow-wrap: anywhere; }';
const html = fs.readFileSync('index.html', 'utf8');

const styles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(match => match[1]);
const allCss = styles.join('\n');
const occurrences = allCss.split(FROZEN).length - 1;
const rules = (allCss.match(/\.snote\s*\{/g) || []).length;
const lines = html.split('\n').filter(line => line.includes(FROZEN));

console.log(`frozen string occurrences in <style> blocks: ${occurrences}`);
console.log(`".snote {" rules in <style> blocks: ${rules}`);
console.log(`lines carrying the frozen string: ${JSON.stringify(lines)}`);
console.log(`frozen string in whole document: ${html.split(FROZEN).length - 1}`);
console.log(`body/script untouched? additions are comment+rule only (checked separately by git diff)`);

const ok = occurrences === 1 && rules === 1 && lines.length === 1 && lines[0] === `    ${FROZEN}`;
console.log(ok ? 'OK: 冻结串逐字一致，且共享 <style> 里只有这一条 .snote 规则（4 空格缩进）' : 'FAIL');
process.exit(ok ? 0 : 1);
