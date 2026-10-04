#!/usr/bin/env node
/**
 * 只读诊断：统计**提交进索引的 blob 原始字节**里的 CRLF 情况。
 * 为什么要逐 blob 读字节：`git cat-file blob` 在管道里可能被 smudge 过滤器改写，
 * 字符串层面的 `-match "\r"` 也会误判；只有 `Buffer` 里的 0x0D 才算数。
 * 不写任何被审计的文件（只读）；输出 JSON 到 stdout。
 */
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');

const ROOT = process.cwd();
const list = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 })
  .toString('utf8').split('\0').filter(Boolean);

const CRLF = Buffer.from('\r\n', 'utf8');
const rows = [];
for (const file of list) {
  let buf;
  try {
    buf = execFileSync('git', ['cat-file', 'blob', `HEAD:${file}`], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });
  } catch { continue; }
  let crlf = 0;
  for (let i = 0; i + 1 < buf.length; i++) if (buf[i] === 0x0d && buf[i + 1] === 0x0a) crlf++;
  const cr = buf.filter(b => b === 0x0d).length;
  if (crlf > 0) rows.push({ file, crlf, cr, bytes: buf.length });
}

const byExt = {};
for (const r of rows) {
  const ext = (r.file.match(/\.[^./]+$/) || ['(none)'])[0];
  byExt[ext] = (byExt[ext] || 0) + 1;
}
console.log(JSON.stringify({
  audited: list.length,
  crlfFiles: rows.length,
  byExt,
  crlfInScripts: rows.filter(r => r.file.startsWith('scripts/')).length,
  sample: rows.slice(0, 25)
}, null, 2));
