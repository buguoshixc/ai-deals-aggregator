#!/usr/bin/env node
/**
 * 从 git 恢复文件（字节级，不做任何编码/换行转换）。
 *
 * 为什么不用 git checkout / Set-Content：两者都可能按平台默认编码或 core.autocrlf
 * 重写内容，而本次事故正是"被 PowerShell 的默认编码重写"造成的——恢复必须一个字节都不改。
 *
 * 用法: node scripts/tools/restore-from-git.js <repo-relative-path> [...]
 *       node scripts/tools/restore-from-git.js --check <path> [...]   # 只比对，不写
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const args = process.argv.slice(2);
const check = args.includes('--check');
const files = args.filter(a => !a.startsWith('--'));

if (!files.length) {
  console.error('用法: node scripts/tools/restore-from-git.js [--check] <path> [...]');
  process.exit(1);
}

for (const rel of files) {
  const res = spawnSync('git', ['show', `HEAD:${rel}`], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });
  if (res.status !== 0) {
    console.error(`✗ ${rel}: git show 失败 (${res.status}) ${res.stderr.toString().trim()}`);
    continue;
  }
  const head = res.stdout;
  const target = path.join(ROOT, rel);
  const current = fs.existsSync(target) ? fs.readFileSync(target) : null;
  const same = current && current.equals(head);
  console.log(
    `${check ? (same ? '=' : '≠') : '→'} ${rel}: HEAD ${head.length}B` +
    (current ? ` / 当前 ${current.length}B` : ' / 当前不存在') +
    (same ? '（一致）' : '')
  );
  if (check) continue;
  if (same) { console.log('   已是 HEAD 内容，跳过'); continue; }
  fs.writeFileSync(target, head);
  const after = fs.readFileSync(target);
  console.log(`   已写入 ${after.length}B，字节一致=${after.equals(head)}`);
}
