// t45（只读调查）：在 Node 进程内跑 coverage-report，落原始字节并算 sha256。
// 用 Node 而不是 PowerShell 重定向：PS 5.1 的 `>` 会把 stdout 写成 UTF-16，污染字节级对拍。
'use strict';
const { spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT = __dirname;
const sha = b => crypto.createHash('sha256').update(b).digest('hex');

function run(args) {
  const r = spawnSync(process.execPath, ['scripts/tools/coverage-report.js', ...args], { cwd: ROOT, maxBuffer: 1 << 28 });
  if (r.error) throw r.error;
  return { status: r.status, buf: r.stdout, err: r.stderr.toString('utf8') };
}

const text = run([]);
fs.writeFileSync(path.join(OUT, 'report-text.txt'), text.buf);
const a = run(['--json']);
const b = run(['--json']);
fs.writeFileSync(path.join(OUT, 'report-json-1.txt'), a.buf);
fs.writeFileSync(path.join(OUT, 'report-json-2.txt'), b.buf);

console.log('text  exit', text.status, 'bytes', text.buf.length, 'sha256', sha(text.buf));
console.log('json1 exit', a.status, 'bytes', a.buf.length, 'sha256', sha(a.buf));
console.log('json2 exit', b.status, 'bytes', b.buf.length, 'sha256', sha(b.buf));
console.log('BYTE-IDENTICAL(json1 vs json2):', a.buf.equals(b.buf));
if (a.err) console.log('stderr head:', a.err.slice(0, 400));
