/**
 * t35 共用小工具：**TEMP 沙箱**（把 git 跟踪的文件复制一份到临时目录，供注入/变异实验用）。
 *
 * 为什么要沙箱：M24 的注入反证（给真实记录的 quote 里塞「逐字」）与 M26 的 M25 复跑
 * （给 DEFERRED 分支加短路）都必须**改生产代码或生产数据**才能证明"牙会响"。
 * 共享 worktree 上直接改会污染队友的现场，所以一律在副本上改、跑完删掉，
 * 同时用 sha256 证明共享树**一个字节都没动**。
 *
 * 只复制 `git ls-files` 出来的跟踪文件（约 17MB，秒级）：validate.js 与各 selftest
 * 都是零外部依赖，不需要 node_modules。
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..', '..');

/** 建沙箱：返回 { dir, files }（files = 复制过去的相对路径数） */
function makeSandbox(tag) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `t35-${tag}-`));
  // core.quotepath=false + -z：中文文件名不会被转义，也不会被换行/引号拆开
  const raw = execFileSync('git', ['-c', 'core.quotepath=false', 'ls-files', '-z'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const files = raw.split('\0').filter(Boolean);
  for (const rel of files) {
    const from = path.join(ROOT, rel);
    if (!fs.existsSync(from)) continue;
    const to = path.join(dir, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  }
  return { dir, files: files.length };
}

/** 在沙箱里跑一个 node 脚本：返回 { status, stdout, stderr } */
function runIn(dir, script, args = []) {
  const result = spawnSync(process.execPath, [path.join(dir, script), ...args], {
    cwd: dir, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024
  });
  return { status: result.status, stdout: result.stdout || '', stderr: result.stderr || '' };
}

function sha256File(file) {
  return require('crypto').createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function remove(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (error) { /* 清不掉不影响判据 */ }
}

module.exports = { ROOT, makeSandbox, runIn, sha256File, remove };
