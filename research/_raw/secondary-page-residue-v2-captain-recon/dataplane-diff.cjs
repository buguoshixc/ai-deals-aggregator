#!/usr/bin/env node
'use strict';
/* 队长：数据面快照对比。
 *
 * ⚠️ 为什么要写成脚本而不是 PowerShell 管道：PowerShell 5.1 的 `>` 重定向默认写 **UTF-16LE**，
 * 于是 `node ... > snap.txt` 出来的快照用 utf8 读会碎成空行（本轮踩过：117 行读成 0 条目）。
 * 这里用 fs.writeFileSync/readFileSync('utf8') 自己管编码，不经过 shell 重定向。
 *
 * 用法：
 *   node dataplane-diff.cjs snap <outFile>     # 取快照
 *   node dataplane-diff.cjs diff <a> <b>       # 比对两份快照
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..', '..');

function walk(relDir, out) {
  const abs = path.join(ROOT, relDir);
  if (!fs.existsSync(abs)) return out;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = `${relDir}/${e.name}`;
    if (e.isDirectory()) walk(rel, out);
    else out.push(rel);
  }
  return out;
}

function scope() {
  const list = [];
  for (const name of fs.readdirSync(ROOT)) if (/\.(json|txt|xml)$/.test(name)) list.push(name);
  walk('scripts/data', list);
  walk('dist/feed', list);
  walk('dist/data', list);
  for (const f of ['dist/sitemap.xml', 'dist/robots.txt', 'dist/deals.json', 'dist/plans.json',
    'dist/api-plans.json', 'dist/models.json', 'dist/index.html', 'dist/_notes.ndjson']) {
    if (fs.existsSync(path.join(ROOT, f))) list.push(f);
  }
  return [...new Set(list)].sort().filter((f) => !/^dataplane-.*\.sha256\.txt$/.test(f));
}

function snapshot() {
  const lines = [];
  for (const rel of scope()) {
    const h = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, rel))).digest('hex');
    lines.push(`${h}  ${rel}`);
  }
  return lines;
}

function parse(file) {
  const map = new Map();
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!raw.includes('  ') || raw.startsWith('#')) continue;
    const i = raw.indexOf('  ');
    map.set(raw.slice(i + 2).trim(), raw.slice(0, i).trim());
  }
  return map;
}

const [, , cmd, arg1, arg2] = process.argv;
if (cmd === 'snap') {
  const lines = snapshot();
  fs.writeFileSync(arg1, lines.join('\n') + '\n', 'utf8');
  console.log(`snapshot -> ${arg1}  (${lines.length} files, utf8)`);
} else if (cmd === 'diff') {
  const a = parse(arg1);
  const b = parse(arg2);
  const changed = [];
  const added = [];
  const removed = [];
  for (const [k, v] of b) {
    if (!a.has(k)) added.push(k);
    else if (a.get(k) !== v) changed.push(`${k}  ${a.get(k).slice(0, 16)} -> ${v.slice(0, 16)}`);
  }
  for (const k of a.keys()) if (!b.has(k)) removed.push(k);
  console.log(`entries: A=${a.size}  B=${b.size}`);
  console.log(`CHANGED (${changed.length})`);
  changed.forEach((x) => console.log('  ' + x));
  console.log(`ADDED (${added.length})  ${added.join(', ')}`);
  console.log(`REMOVED (${removed.length})  ${removed.join(', ')}`);
  console.log(`feed files in scope: ${[...b.keys()].filter((k) => k.startsWith('dist/feed/')).length}`);
} else {
  console.error('usage: dataplane-diff.cjs snap <out> | diff <a> <b>');
  process.exit(2);
}
