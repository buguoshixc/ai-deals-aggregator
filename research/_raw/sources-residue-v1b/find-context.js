#!/usr/bin/env node
/**
 * 本地用：在快照里找子串并打印上下文（HTML 原样，用来抓 href）。
 * 用法：node research/_raw/sources-residue-v1b/find-context.js <file.html> <needle> [window] [maxHits]
 */
'use strict';
const fs = require('fs');
const zlib = require('zlib');

const [file, needle, windowArg, maxArg] = process.argv.slice(2);
const win = Number(windowArg || 200);
const max = Number(maxArg || 10);

const raw = fs.readFileSync(file);
const html = (raw[0] === 0x1f && raw[1] === 0x8b) ? zlib.gunzipSync(raw).toString('utf8') : raw.toString('utf8');

let from = 0;
let hits = 0;
while (hits < max) {
  const at = html.indexOf(needle, from);
  if (at < 0) break;
  hits += 1;
  from = at + needle.length;
  console.log(`--- hit ${hits} @ ${at} ---`);
  console.log(html.slice(Math.max(0, at - win), at + win).replace(/\s+/g, ' '));
}
console.log(`total hits printed: ${hits}`);
