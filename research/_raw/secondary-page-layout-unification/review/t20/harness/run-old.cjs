#!/usr/bin/env node
/**
 * T20 · 用**改前**的 verify-site.js（teeth/_backup/verify-site.pre-t19.bak）跑同一份产物：
 * 源码从备份读，Module._compile 成**生产文件路径**（相对 require ../lib/* 照常解析），
 * 生产源码一个字节都不写。口径：进程里只把 --dir=/--json= 透传给被测源码。
 * 用法：node run-old.cjs --dir=<相对 ROOT> --json=<相对 ROOT>
 */
'use strict';
const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '../../../../../..');
const SRC = path.join(ROOT, 'scripts', 'tools', 'verify-site.js');
const BAK = path.join(ROOT, 'research', '_raw', 'secondary-page-layout-unification', 'teeth', '_backup', 'verify-site.pre-t19.bak');

if (!fs.existsSync(BAK)) { console.error('✗ 找不到改前备份'); process.exit(2); }
const src = fs.readFileSync(BAK, 'utf8');
if (!/const ROOT = path\.join\(__dirname, '\.\.', '\.\.'\);/.test(src)) { console.error('✗ 备份形态意外（ROOT 解析行不匹配）'); process.exit(2); }
if (!src.includes('meta.inkRule !== false')) { console.error('✗ 备份里没有 inkRule 视口白名单 —— 这不是改前版本'); process.exit(2); }

const mod = new Module(SRC, null);
mod.filename = SRC;
mod.paths = Module._nodeModulePaths(path.dirname(SRC));
mod._compile(src, SRC);
