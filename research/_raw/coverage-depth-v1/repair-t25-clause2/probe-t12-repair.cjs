#!/usr/bin/env node
/**
 * t12 证据采集（可复跑）· 只读 + 只写本目录。
 *
 * 覆盖契约里**全部 7 条 Verify**，并把两个自测的"检查名增删对照"一起落盘：
 *   · 关键：所有 stdout/stderr 都用 **fd 重定向**写成**原始字节**。
 *     （PowerShell 的 `>` 在本机默认写 UTF-16LE，早先几份 .txt 就是这么被写成 UTF-16 的。）
 *
 * 用法：node research/_raw/coverage-depth-v1/repair-t25-clause2/probe-t12-repair.cjs
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..', '..', '..');
const OUT = __dirname;
const STALE = path.join(ROOT, 'research', '_raw', 'coverage-depth-v1', 'repair-stale-baselines');
const BEFORE_COVERAGE_SELFTEST = path.join(ROOT, 'research', '_raw', 'coverage-depth-v1', 'source-reliability', 't6-final-selftest.txt');
const BEFORE_MODELS_SELFTEST = path.join(OUT, 'models-selftest-before.txt');

/** 跑一条命令，stdout/stderr 都写进文件（真实字节） */
function runToFile(name, args) {
  const file = path.join(OUT, name);
  const errFile = path.join(OUT, name.replace(/\.txt$/, '.stderr.txt'));
  const fd = fs.openSync(file, 'w');
  const errFd = fs.openSync(errFile, 'w');
  let result;
  try {
    result = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, stdio: ['ignore', fd, errFd] });
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

/** 读文本：兼容 PowerShell `>` 写出的 UTF-16LE（带 BOM） */
function readAny(file) {
  const bytes = fs.readFileSync(file);
  if (bytes.length > 1 && bytes[0] === 0xff && bytes[1] === 0xfe) return bytes.slice(2).toString('utf16le');
  return bytes.toString('utf8');
}

/** 检查名 = 整行（不做 ` —— ` 截断：检查名自身含 `——`，截断会制造假改名） */
function checkNames(text) {
  return text.split('\n')
    .filter(line => /^\s*[\u2713\u2717] /.test(line))
    .map(line => line.replace(/^\s*[\u2713\u2717] /, '').replace(/\s+$/, ''));
}

const summary = [];
const say = line => { summary.push(line); console.log(line); };

// 顺序：validate 先单独跑一次（它是"独立读数"，不该受前面那些子进程的影响）。
const validate = runToFile('verify-5-validate-strict.txt', ['scripts/validate.js', '--strict']);
const coverageSelftest = runToFile('verify-1-coverage-targets-selftest.txt', ['scripts/tools/coverage-targets-selftest.js']);
const modelsSelftest = runToFile('verify-2-models-selftest.txt', ['scripts/tools/models-selftest.js']);
const report = runToFile('verify-3-coverage-report.txt', ['scripts/tools/coverage-report.js']);
const json1 = runToFile('verify-4-json-run1.txt', ['scripts/tools/coverage-report.js', '--json']);
const json2 = runToFile('verify-4-json-run2.txt', ['scripts/tools/coverage-report.js', '--json']);
const modelsRepro = runToFile('verify-6-check-models-reproducible.txt', ['scripts/tools/check-models-reproducible.js']);
const linksCheck = runToFile('verify-7-check-model-registry-links.txt', ['scripts/tools/check-model-registry-links.js']);

const totalLine = text => (text.split('\n').find(line => /项通过|Data check|✅|reproducible|一致/.test(line)) || '').trim().slice(0, 120);

say('=== t12 · 契约里全部 7 条 Verify（原始字节读数） ===');
say(`1) node scripts/tools/coverage-targets-selftest.js      exit=${coverageSelftest.status}  sha256=${coverageSelftest.sha256}  bytes=${coverageSelftest.bytes}`);
say(`   ${(coverageSelftest.text.split('\n').find(line => line.includes('项通过')) || '').trim()}`);
say(`2) node scripts/tools/models-selftest.js                 exit=${modelsSelftest.status}  sha256=${modelsSelftest.sha256}  bytes=${modelsSelftest.bytes}`);
say(`   ${(modelsSelftest.text.split('\n').find(line => line.includes('项通过')) || '').trim()}`);
say(`3) node scripts/tools/coverage-report.js                 exit=${report.status}  sha256=${report.sha256}  bytes=${report.bytes}`);
say(`   ${(report.text.split('\n').find(line => line.includes('报告自检问题')) || '').trim()}`);
say(`4) node scripts/tools/coverage-report.js --json  run1    exit=${json1.status}  sha256=${json1.sha256}  bytes=${json1.bytes}`);
say(`                                        run2    exit=${json2.status}  sha256=${json2.sha256}  bytes=${json2.bytes}`);
say(`   byte-identical = ${json1.sha256 === json2.sha256}`);
say(`5) node scripts/validate.js --strict                     exit=${validate.status}  sha256=${validate.sha256}  bytes=${validate.bytes}`);
say(`   ${(validate.text.split('\n').find(line => /校验通过|校验失败/.test(line)) || validate.stderr.split('\n').find(line => /校验通过|校验失败/.test(line)) || '').trim()}`);
say(`6) node scripts/tools/check-models-reproducible.js       exit=${modelsRepro.status}  sha256=${modelsRepro.sha256}  bytes=${modelsRepro.bytes}`);
say(`   ${totalLine(modelsRepro.text) || (modelsRepro.stderr.split('\n').filter(Boolean).slice(-1)[0] || '').trim()}`);
say(`7) node scripts/tools/check-model-registry-links.js      exit=${linksCheck.status}  sha256=${linksCheck.sha256}  bytes=${linksCheck.bytes}`);
say(`   ${totalLine(linksCheck.text) || (linksCheck.stderr.split('\n').filter(Boolean).slice(-1)[0] || '').trim()}`);

say('');
say('=== 检查名增删对照（既有检查名一个不改；条数只增） ===');
const diffs = [
  { label: 'coverage-targets-selftest.js', before: BEFORE_COVERAGE_SELFTEST, after: coverageSelftest.text, beforeLabel: 't6 收口时的 178/0 读数' },
  { label: 'models-selftest.js', before: BEFORE_MODELS_SELFTEST, after: modelsSelftest.text, beforeLabel: '本 attempt 改前的 141 项通过 / 3 项失败读数' }
];
for (const diff of diffs) {
  if (!fs.existsSync(diff.before)) { say(`${diff.label}：改前读数缺失（${diff.before}），跳过对照`); continue; }
  const before = checkNames(readAny(diff.before));
  const after = checkNames(diff.after);
  const removed = before.filter(name => !after.includes(name));
  const added = after.filter(name => !before.includes(name));
  say(`${diff.label}（改前 = ${diff.beforeLabel}）：${before.length} → ${after.length}（净增 ${after.length - before.length}）`);
  say(`   被删除或改名的既有检查名：${removed.length}${removed.length ? `\n${removed.map(name => `     - ${name}`).join('\n')}` : ''}`);
  say(`   新增检查名：${added.length}`);
  added.forEach(name => say(`     + ${name}`));
}

say('');
say('=== t12 现场读数（汇总判据保护强度对照 / API 侧声明可证伪性 / 变异的现场命中） ===');
for (const [label, text] of [['models-selftest.js', modelsSelftest.text], ['coverage-targets-selftest.js', coverageSelftest.text]]) {
  text.split('\n').filter(line => /^\s+· /.test(line)).forEach(line => say(`${label} ${line.trim()}`));
}

say('');
say('=== 归属纪律 ===');
say('本次只改两个自测文件：scripts/tools/coverage-targets-selftest.js、scripts/tools/models-selftest.js。');
say('scripts/data/** 零改动（所有变异施加在内存载荷；报告层夹具写在 os.tmpdir()）。');

fs.writeFileSync(path.join(OUT, 't12-summary.txt'), `${summary.join('\n')}\n`, 'utf8');
fs.writeFileSync(path.join(STALE, 't12-selftest-stdout.txt'), coverageSelftest.text, 'utf8');
fs.writeFileSync(path.join(STALE, 't12-models-selftest-stdout.txt'), modelsSelftest.text, 'utf8');
console.log(`\n[wrote] ${path.join(OUT, 't12-summary.txt')}`);
console.log(`[wrote] ${path.join(STALE, 't12-selftest-stdout.txt')} · ${path.join(STALE, 't12-models-selftest-stdout.txt')}`);
