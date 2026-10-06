#!/usr/bin/env node
/**
 * T29 · 反证「上界断言不是恒真、且与判据耦合」：把 ④ 判据块在**内存里**停用（`if (false)`），
 * 用同一份 scratch/bare-fs0-plans 跑整轮。期望：至少上界断言与 M13 三条红（判据被删 ⇒ 计数对不上），
 * 而畸形条依旧存在 ⇒ 若上界断言还绿，就说明它只是 metric 的复述。生产文件零写入。
 * 用法：node run-no4.cjs --dir=<相对 ROOT> --json=<相对 ROOT>
 */
'use strict';
const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '../../../../../..');
const SRC = path.join(ROOT, 'scripts', 'tools', 'verify-site.js');
const GUARD = 'if (!note.rendered && note.textLength > 0 && note.glyphRects === 0) {';
let src = fs.readFileSync(SRC, 'utf8');
const count = src.split(GUARD).length - 1;
if (count !== 1) { console.error(`✗ ④ 判据守卫出现 ${count} 次（必须恰好 1 次）⇒ 红，不做任何补丁`); process.exit(2); }
src = src.replace(GUARD, 'if (false) { /* T29 反证：④ 判据被内存停用 */');
if (src.includes(GUARD)) { console.error('✗ 补丁未生效'); process.exit(2); }
console.error('（内存补丁：④ 判据停用；生产文件未写）');

const mod = new Module(SRC, null);
mod.filename = SRC;
mod.paths = Module._nodeModulePaths(path.dirname(SRC));
mod._compile(src, SRC);
