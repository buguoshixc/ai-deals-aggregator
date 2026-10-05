#!/usr/bin/env node
/**
 * t7 审查工具：在给定 cwd（通常是 TEMP 沙箱副本）里跑一个 node 脚本，
 * 把 stdout / stderr 用 fd 重定向**逐字节**落到文件，返回退出码与字节数。
 *
 * 用法：
 *   node run-node.cjs --cwd=<dir> --out=<prefix> --script=<rel-or-abs path> [-- <script args...>]
 *
 * 为什么不用 pwsh 的 `>`：本机 pwsh 是 Windows PowerShell 5.1，`>` 默认写 UTF-16LE，
 * 会把真字节捕获变成转码（t1 的字节级结论必须能被我独立复核）。
 * 为什么不用 stdio:'pipe'：pipe 有缓冲，且本机 harness 对管道捕获有额外约束；
 * fd 重定向是"进程直接写文件"，没有中间人。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const argv = process.argv.slice(2);
const opt = name => {
  const hit = argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(`--${name}=`.length) : null;
};
const opts = name => argv.filter(a => a.startsWith(`--${name}=`)).map(a => a.slice(`--${name}=`.length));
const sep = argv.indexOf('--');
const scriptArgs = sep >= 0 ? argv.slice(sep + 1) : [];
const cwd = path.resolve(opt('cwd') || process.cwd());
const outPrefix = path.resolve(opt('out') || path.join(cwd, 'run'));
const script = opt('script');
if (!script) {
  console.error('usage: node run-node.cjs --cwd=<dir> --out=<prefix> --script=<file> [-- args...]');
  process.exit(2);
}
const scriptPath = path.isAbsolute(script) ? script : path.resolve(cwd, script);

const outFile = `${outPrefix}.out.txt`;
const errFile = `${outPrefix}.err.txt`;
const fdOut = fs.openSync(outFile, 'w');
const fdErr = fs.openSync(errFile, 'w');
const requires = opts('require').map(p => path.resolve(p));
const nodeArgs = [];
for (const p of requires) nodeArgs.push('--require', p);
const env = Object.assign({}, process.env);
for (const pair of opts('env')) {
  const at = pair.indexOf('=');
  env[pair.slice(0, at)] = pair.slice(at + 1);
}
const r = spawnSync(process.execPath, [...nodeArgs, scriptPath, ...scriptArgs], { cwd, env, stdio: ['ignore', fdOut, fdErr] });
fs.closeSync(fdOut);
fs.closeSync(fdErr);

const result = {
  cwd,
  script: scriptPath,
  args: scriptArgs,
  nodeArgs,
  envOverrides: opts('env'),
  status: r.status,
  signal: r.signal,
  error: r.error ? String(r.error.message) : null,
  stdoutFile: outFile,
  stderrFile: errFile,
  stdoutBytes: fs.statSync(outFile).size,
  stderrBytes: fs.statSync(errFile).size
};
console.log(JSON.stringify(result, null, 2));
process.exit(0);
