#!/usr/bin/env node
'use strict';
/* 队长：解释 dist treeDigest 为什么会在两次重建之间变化。
 * 只读。判据：`dist/_notes.ndjson` 的 header 是否带构建时刻（带 ⇒ 摘要天然不可复现，
 * 「摘要相同」不是可用的验收口径，「逐文件相同」才是）。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const notes = path.join(ROOT, 'dist', '_notes.ndjson');
const s = fs.readFileSync(notes, 'utf8');
console.log(`_notes.ndjson bytes = ${Buffer.byteLength(s)}`);
console.log(`header = ${s.split('\n')[0].slice(0, 320)}`);
const ts = s.match(/20\d\d-\d\d-\d\dT\d\d:\d\d[^"',}\s]*/g);
console.log(`ISO-timestamp-like hits = ${ts ? ts.length : 0}${ts ? '  e.g. ' + ts.slice(0, 3).join(' | ') : ''}`);
const gen = s.match(/"(generatedAt|builtAt|asOf|built)"\s*:\s*"([^"]*)"/g);
console.log(`generated/build fields = ${gen ? gen.slice(0, 3).join(' | ') : '(none)'}`);

/* 逐个产物算一遍，找出「除 _notes.ndjson 之外」是否还有别的文件不可复现。 */
function walk(d, o) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, o);
    else o.push(p);
  }
  return o;
}
const files = walk(path.join(ROOT, 'dist'), []).sort();
const rows = files.map((f) => {
  const rel = path.relative(path.join(ROOT, 'dist'), f).split(path.sep).join('/');
  return { rel, h: crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'), size: fs.statSync(f).size };
});
const h = crypto.createHash('sha256');
for (const r of rows) h.update(`${r.rel}\0${r.h}\n`);
console.log(`treeDigest = ${h.digest('hex')}  (${rows.length} files)`);
const notesRow = rows.find((r) => r.rel === '_notes.ndjson');
console.log(`_notes.ndjson sha256 = ${notesRow.h}  size = ${notesRow.size}`);
