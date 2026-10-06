#!/usr/bin/env node
/**
 * T29 · 追加一份定点 scratch：`empty-notes` ——
 *   plans/index.html 的每条 .snote 内容清空（保留元素与冻结串）⇒ 未渲染、可见文本 0、无 noscript、无字形盒。
 * 用途：量化 t28 的**豁免语义变化**（旧豁免看「有没有 noscript 标记」，新豁免看「可见文本长度是否为 0」）
 * 在这一格上的差别：旧版上界断言会红，新版按「没有可画的东西」豁免。
 * 只写 review/t29/scratch/**；只读 dist。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../../../../../..');
const T29 = path.join(ROOT, 'research', '_raw', 'secondary-page-layout-unification', 'review', 't29');
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(T29, 'scratch', 'empty-notes');
const FROZEN = '.snote { color: var(--mut); font-size: var(--fs-sm); line-height: 1.7; margin: 0 0 var(--s3); max-width: none; overflow-wrap: anywhere; }';

fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(DIST, OUT, { recursive: true });
const page = path.join(OUT, 'plans', 'index.html');
const html = fs.readFileSync(page, 'utf8');
if (html.split(FROZEN).length - 1 !== 1) { console.error('✗ 冻结串次数异常'); process.exit(2); }
let emptied = 0;
const next = html.replace(/(<p class="snote[^>]*>)[\s\S]*?(<\/p>)/g, (m, open, close) => { emptied += 1; return `${open}${close}`; });
fs.writeFileSync(page, next, 'utf8');
const left = (next.match(/<p class="snote[^>]*>[\s\S]*?<\/p>/g) || []).filter(n => !/^<p[^>]*><\/p>$/.test(n)).length;
console.log(`① empty-notes/：清空说明 ${emptied} 条 · 仍非空的 ${left} 条 · 冻结串 ${next.split(FROZEN).length - 1}`);
process.exit(emptied === 12 && left === 0 ? 0 : 1);
