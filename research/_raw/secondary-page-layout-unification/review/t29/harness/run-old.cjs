#!/usr/bin/env node
/**
 * T29 · 用**改前**（pre-t28）的 verify-site.js 跑同一份产物：
 * 源码从 `teeth/_backup/verify-site.pre-t28.bak` 读，Module._compile 成生产文件路径
 * （相对 require ../lib/* 照常解析），生产源码零写入。
 * 用法：node run-old.cjs --dir=<相对 ROOT> --json=<相对 ROOT>
 */
'use strict';
const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '../../../../../..');
const SRC = path.join(ROOT, 'scripts', 'tools', 'verify-site.js');
const BAK = path.join(ROOT, 'research', '_raw', 'secondary-page-layout-unification', 'teeth', '_backup', 'verify-site.pre-t28.bak');

if (!fs.existsSync(BAK)) { console.error('✗ 找不到 pre-t28 备份'); process.exit(2); }
const src = fs.readFileSync(BAK, 'utf8');
if (!src.includes('note-hidden-text')) { console.error('✗ 备份形态意外'); process.exit(2); }
if (!src.includes('note-unrendered')) { console.error('✗ 备份里没有 note-unrendered —— 这不是 t24 之后、t28 之前的形态'); process.exit(2); }
if (src.includes('unrenderedNoText')) { console.error('✗ 备份里已有 t28 的 unrenderedNoText —— 这不是改前版本'); process.exit(2); }
if (!src.includes('&& !note.noscriptSubtree) {')) { console.error('✗ 备份里没有 t24 的标记级豁免守卫 —— 形态意外'); process.exit(2); }
if (!src.includes('const ch70Of')) { console.error('✗ 备份不是 t19 之后的形态'); process.exit(2); }

const mod = new Module(SRC, null);
mod.filename = SRC;
mod.paths = Module._nodeModulePaths(path.dirname(SRC));
mod._compile(src, SRC);
