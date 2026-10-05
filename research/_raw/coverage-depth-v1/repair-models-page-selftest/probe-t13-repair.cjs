#!/usr/bin/env node
/**
 * t13 证据采集（可复跑）· 只读 + 只写本目录（+ gitignored 的 dist.qc-mpsel/）。
 *
 * 覆盖契约里全部 Verify（含 build 到 dist.qc-mpsel 后再以 --dir 跑一次），并把
 * "检查名增删对照"一起落盘。
 *
 * 用法：node research/_raw/coverage-depth-v1/repair-models-page-selftest/probe-t13-repair.cjs
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..', '..', '..');
const OUT = __dirname;
const BEFORE = path.join(OUT, 'before-4-failures.txt');

/** 跑一条命令，stdout/stderr 都写进文件（真实字节；PowerShell 的 `>` 在本机默认写 UTF-16LE） */
function runToFile(name, args, options = {}) {
  const file = path.join(OUT, name);
  const errFile = path.join(OUT, name.replace(/\.txt$/, '.stderr.txt'));
  const fd = fs.openSync(file, 'w');
  const errFd = fs.openSync(errFile, 'w');
  let result;
  try {
    result = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, stdio: ['ignore', fd, errFd], ...options });
  } finally {
    fs.closeSync(fd);
    fs.closeSync(errFd);
  }
  const bytes = fs.readFileSync(file);
  return {
    status: result.status,
    bytes: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    text: bytes.toString('utf8'),
    stderr: fs.readFileSync(errFile, 'utf8')
  };
}

function readAny(file) {
  const bytes = fs.readFileSync(file);
  if (bytes.length > 1 && bytes[0] === 0xff && bytes[1] === 0xfe) return bytes.slice(2).toString('utf16le');
  return bytes.toString('utf8');
}

/**
 * 检查名 = 整行（不做 ` —— ` 截断：检查名自身含 `——`）。
 * `passedOnly`：改前那份读数里有 4 条是 ✗，它们的行尾带着 ` —— detail`，
 * 直接拿去和改后的 ✓ 行比会造出 4 条假"改名"；所以只把改前的 **✓ 行**当作"既有检查名"。
 */
function checkNames(text, passedOnly = false) {
  return text.split('\n')
    .filter(line => (passedOnly ? /^\s*[\u2713] /.test(line) : /^\s*[\u2713\u2717] /.test(line)))
    .map(line => line.replace(/^\s*[\u2713\u2717] /, '').replace(/\s+$/, ''));
}

const summary = [];
const say = line => { summary.push(line); console.log(line); };

const allowMissing = runToFile('verify-1-allow-missing-dist.txt', ['scripts/tools/models-page-selftest.js', '--allow-missing-dist']);
const dirDist = runToFile('verify-2-dir-dist.txt', ['scripts/tools/models-page-selftest.js', '--dir=dist']);
const report = runToFile('verify-3-coverage-report.txt', ['scripts/tools/coverage-report.js']);
const validate = runToFile('verify-4-validate-strict.txt', ['scripts/validate.js', '--strict']);
const build = runToFile('verify-5-build-dist-qc-mpsel.txt', ['scripts/tools/build-local.js', '--out=dist.qc-mpsel']);
const dirBuilt = runToFile('verify-6-dir-dist-qc-mpsel.txt', ['scripts/tools/models-page-selftest.js', '--dir=dist.qc-mpsel']);

const selftestLine = text => (text.split('\n').find(line => line.includes('项通过')) || '').trim();

say('=== t13 · Verify 全量读数（原始字节） ===');
say(`1) models-page-selftest --allow-missing-dist   exit=${allowMissing.status}  sha256=${allowMissing.sha256}`);
say(`   ${selftestLine(allowMissing.text)}`);
say(`2) models-page-selftest --dir=dist             exit=${dirDist.status}  sha256=${dirDist.sha256}`);
say(`   ${selftestLine(dirDist.text)}`);
say(`3) coverage-report.js                          exit=${report.status}  sha256=${report.sha256}`);
say(`   ${(report.text.split('\n').find(line => line.includes('报告自检问题')) || '').trim()}`);
say(`4) validate.js --strict                        exit=${validate.status}  sha256=${validate.sha256}`);
say(`   ${(validate.text.split('\n').find(line => /校验通过|校验失败/.test(line)) || validate.stderr.split('\n').find(line => /校验通过|校验失败/.test(line)) || '').trim()}`);
say(`5) build-local.js --out=dist.qc-mpsel         exit=${build.status}  sha256=${build.sha256}`);
say(`   ${(build.text.split('\n').filter(Boolean).slice(-1)[0] || '').trim()}`);
say(`6) models-page-selftest --dir=dist.qc-mpsel    exit=${dirBuilt.status}  sha256=${dirBuilt.sha256}`);
say(`   ${selftestLine(dirBuilt.text)}`);
say(`   独立 join（产物侧）：${(dirBuilt.text.split('\n').find(line => line.includes('独立 join（')) || '').trim()}`);

say('');
say('=== 改前 4 条失败原文 → 改后全绿 ===');
if (fs.existsSync(BEFORE)) {
  readAny(BEFORE).split('\n').filter(line => /✗|项通过/.test(line)).forEach(line => say(`   改前 ${line.trim()}`));
} else {
  say(`   （改前读数缺失：${BEFORE}）`);
}
say(`   改后 ${selftestLine(dirDist.text)}（两种跑法同值：--allow-missing-dist ${selftestLine(allowMissing.text)}）`);

say('');
say('=== 检查名增删对照 ===');
if (fs.existsSync(BEFORE)) {
  const before = checkNames(readAny(BEFORE), true);
  const after = checkNames(dirDist.text);
  const removed = before.filter(name => !after.includes(name));
  const added = after.filter(name => !before.includes(name));
  say(`   改前 ✓ 行数（既有检查名）= ${before.length}；改后 ✓ 行数 = ${after.length}`);
  say(`   被删除或改名的既有检查名：${removed.length}`);
  removed.forEach(name => say(`     - ${name}`));
  say(`   新增检查名：${added.length}`);
  added.forEach(name => say(`     + ${name}`));
}

fs.writeFileSync(path.join(OUT, 't13-summary.txt'), `${summary.join('\n')}\n`, 'utf8');
console.log(`\n[wrote] ${path.join(OUT, 't13-summary.txt')}`);
