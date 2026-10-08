#!/usr/bin/env node
/**
 * 逐文件 sha256 清单（t16 / sources-residue-v1b）—— 用来证明「改动前后产物是否变化」。
 *
 * 用法：
 *   node research/_raw/sources-residue-v1b/hash-dist.js <dist 目录> <输出 JSON>
 *   node research/_raw/sources-residue-v1b/hash-dist.js --diff <before.json> <after.json> [输出 JSON]
 *
 * 只读产物、只写清单；不联网、不读墙上时钟（清单里不写时间，改由调用方在报告里记）。
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function hashesOf(dir) {
  const root = path.resolve(dir);
  const files = walk(root, []).sort();
  const map = {};
  let bytes = 0;
  for (const file of files) {
    const buf = fs.readFileSync(file);
    bytes += buf.length;
    map[path.relative(root, file).split(path.sep).join('/')] = crypto.createHash('sha256').update(buf).digest('hex');
  }
  return { fileCount: files.length, bytes, files: map };
}

const args = process.argv.slice(2);
if (args[0] === '--diff') {
  const before = JSON.parse(fs.readFileSync(args[1], 'utf8'));
  const after = JSON.parse(fs.readFileSync(args[2], 'utf8'));
  const keys = [...new Set([...Object.keys(before.files), ...Object.keys(after.files)])].sort();
  const changed = keys.filter(key => before.files[key] !== after.files[key]);
  const result = {
    beforeFileCount: before.fileCount,
    afterFileCount: after.fileCount,
    beforeBytes: before.bytes,
    afterBytes: after.bytes,
    changedFileCount: changed.length,
    changed: changed.map(key => ({ path: key, before: before.files[key] || null, after: after.files[key] || null }))
  };
  const out = args[3];
  if (out) fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n', 'utf8');
  console.log(`files ${before.fileCount} → ${after.fileCount} · bytes ${before.bytes} → ${after.bytes} · changed=${changed.length}`);
  for (const item of result.changed.slice(0, 40)) console.log(`  ${item.path}  ${item.before ? item.before.slice(0, 12) : '(新增)'} → ${item.after ? item.after.slice(0, 12) : '(删除)'}`);
  process.exit(0);
}

const [dir, out] = args;
const result = hashesOf(dir);
fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n', 'utf8');
console.log(`${dir}: ${result.fileCount} files / ${result.bytes} bytes → ${out}`);
