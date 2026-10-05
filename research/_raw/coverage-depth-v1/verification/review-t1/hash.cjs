#!/usr/bin/env node
/**
 * t7 审查工具：对若干文件打 sha256 / 字节数，并可选做逐字节比较。
 * 用法：
 *   node hash.cjs <file...>                     打印每个文件的 sha256 与字节数
 *   node hash.cjs --same <a> <b>                逐字节比较两个文件（不一致时指出首个不同偏移）
 *   node hash.cjs --diff-lines <a> <b>          按行比较（打印差异行号与内容，最多 40 行）
 *   node hash.cjs --grep <regex> <file...>      在文件里搜正则，打印命中行号
 */
'use strict';
const fs = require('fs');
const cp = require('crypto');

const sha = f => cp.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const argv = process.argv.slice(2);

if (argv[0] === '--same') {
  const [a, b] = argv.slice(1);
  const ba = fs.readFileSync(a);
  const bb = fs.readFileSync(b);
  const same = ba.equals(bb);
  console.log(JSON.stringify({
    a, b, bytesA: ba.length, bytesB: bb.length, byteIdentical: same,
    shaA: sha(a), shaB: sha(b)
  }, null, 2));
  if (!same) {
    const n = Math.min(ba.length, bb.length);
    let at = -1;
    for (let i = 0; i < n; i += 1) if (ba[i] !== bb[i]) { at = i; break; }
    console.log('first differing offset:', at);
    if (at >= 0) {
      console.log('A around:', JSON.stringify(ba.slice(Math.max(0, at - 60), at + 60).toString('utf8')));
      console.log('B around:', JSON.stringify(bb.slice(Math.max(0, at - 60), at + 60).toString('utf8')));
    }
  }
  process.exit(0);
}

if (argv[0] === '--diff-lines') {
  const [a, b] = argv.slice(1);
  const la = fs.readFileSync(a, 'utf8').split('\n');
  const lb = fs.readFileSync(b, 'utf8').split('\n');
  const max = Math.max(la.length, lb.length);
  let shown = 0;
  let count = 0;
  for (let i = 0; i < max; i += 1) {
    if (la[i] !== lb[i]) {
      count += 1;
      if (shown < 40) {
        shown += 1;
        console.log(`line ${i + 1}:\n  A: ${JSON.stringify(la[i] === undefined ? '(缺)' : la[i]).slice(0, 400)}\n  B: ${JSON.stringify(lb[i] === undefined ? '(缺)' : lb[i]).slice(0, 400)}`);
      }
    }
  }
  console.log(`total differing lines: ${count} (lines A=${la.length} / B=${lb.length})`);
  process.exit(0);
}

if (argv[0] === '--grep') {
  const re = new RegExp(argv[1]);
  for (const f of argv.slice(2)) {
    const lines = fs.readFileSync(f, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (re.test(line)) console.log(`${f}:${i + 1}: ${line.trim().slice(0, 300)}`);
    });
  }
  process.exit(0);
}

for (const f of argv) {
  console.log(`${sha(f)}  ${fs.statSync(f).size}  ${f}`);
}
