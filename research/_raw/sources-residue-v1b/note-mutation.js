#!/usr/bin/env node
/**
 * 变异工具（t16 / sources-residue-v1b）：把 `_roles` 注的 sourceUrl 行标签括注**临时改回旧写法**，
 * 用来实跑「判据会响」这条要求（红 → 逐字节还原 → 绿）。
 *
 *   node research/_raw/sources-residue-v1b/note-mutation.js --bend      # 改成旧括注（先备份）
 *   node research/_raw/sources-residue-v1b/note-mutation.js --restore   # 从备份逐字节还原并校验
 *
 * 备份落在 `research/_raw/sources-residue-v1b/mutations/official_urls.after-fix.json`
 * （**不入库**也不需要入库：还原校验靠 sha256；真正要留的是红/绿两次读数）。
 * 只动 `scripts/data/official_urls.json` 一个文件；`--restore` 会打印还原前后的 sha256 供比对。
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const TARGET = path.join(ROOT, 'scripts', 'data', 'official_urls.json');
const BAKDIR = path.join(__dirname, 'mutations');
const BACKUP = path.join(BAKDIR, 'official_urls.after-fix.json');

const FIXED = '（页面行标签：deal 侧渲染成「收录渠道」行';
const STALE = '（渲染成「原始出处」行';

const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

if (process.argv.includes('--bend')) {
  const current = fs.readFileSync(TARGET, 'utf8');
  if (current.includes(STALE)) {
    console.error('已经处于「旧括注」状态，拒绝再次变异（先 --restore）');
    process.exit(2);
  }
  if (!current.includes(FIXED)) {
    console.error(`找不到要替换的片段：${FIXED}`);
    process.exit(2);
  }
  fs.mkdirSync(BAKDIR, { recursive: true });
  fs.writeFileSync(BACKUP, current);
  fs.writeFileSync(TARGET, current.replace(FIXED, STALE));
  console.log(`已变异：${FIXED} … → ${STALE} …（备份 sha256=${sha(BACKUP).slice(0, 16)}）`);
  console.log(`变异后文件 sha256=${sha(TARGET).slice(0, 16)}`);
  process.exit(0);
}

if (process.argv.includes('--restore')) {
  if (!fs.existsSync(BACKUP)) {
    console.error('没有备份，无法还原');
    process.exit(2);
  }
  const before = sha(TARGET);
  fs.copyFileSync(BACKUP, TARGET);
  const after = sha(TARGET);
  const backupHash = sha(BACKUP);
  console.log(`还原前 sha256=${before.slice(0, 16)} → 还原后 sha256=${after.slice(0, 16)}（备份=${backupHash.slice(0, 16)}）`);
  console.log(after === backupHash ? '✅ 逐字节还原成功' : '❌ 还原后与备份不一致');
  process.exit(after === backupHash ? 0 : 1);
}

console.log('用法：--bend | --restore');
process.exit(2);
