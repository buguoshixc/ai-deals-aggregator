#!/usr/bin/env node
/**
 * secondary-page-layout-unification · 产物全树 sha256 清单（t3 证据）
 *
 * 两个用途：
 *   ① 构建可复现：第 1 步真实构建 vs Full Gate 的 `Assemble site` 重建，
 *      两份清单必须**逐字节相同**（同一份源码、同一条构建路径 ⇒ 同一个产物）；
 *   ② 变异零污染：verify-site.js 的内存变异跑完以后，产物清单必须一字不变。
 *
 * 用法：
 *   node research/_raw/secondary-page-layout-unification/build/dist-manifest.cjs \
 *        --dir=dist --out=research/_raw/secondary-page-layout-unification/build/dist.sha256.txt
 * 退出码：0 = 清单写出成功（比较由调用方 fc/diff 做，本脚本只产出事实）。
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const arg = name => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const ROOT = path.join(__dirname, '..', '..', '..', '..');
const resolve = p => (path.isAbsolute(p) ? p : path.join(ROOT, p));
const DIR = resolve(arg('dir') || 'dist');
const OUT = resolve(arg('out') || path.join(ROOT, 'research', '_raw', 'secondary-page-layout-unification', 'build', 'dist.sha256.txt'));

const rows = [];
const walk = rel => {
  for (const entry of fs.readdirSync(path.join(DIR, rel), { withFileTypes: true })) {
    const relPath = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) walk(relPath);
    else rows.push(relPath);
  }
};
walk('');
rows.sort();

const lines = [];
let bytes = 0;
for (const rel of rows) {
  const buffer = fs.readFileSync(path.join(DIR, rel));
  bytes += buffer.length;
  lines.push(`${crypto.createHash('sha256').update(buffer).digest('hex')}  ${rel}`);
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${lines.join('\n')}\n`, 'utf8');

const html = rows.filter(rel => rel.toLowerCase().endsWith('.html')).length;
console.log(`dir=${path.relative(ROOT, DIR).replace(/\\/g, '/')} files=${rows.length} html=${html} nonHtml=${rows.length - html} bytes=${bytes}`);
console.log(`manifest=${path.relative(ROOT, OUT).replace(/\\/g, '/')}`);
