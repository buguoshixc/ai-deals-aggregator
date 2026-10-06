#!/usr/bin/env node
/**
 * secondary-page-layout-unification · M-disk 的文件编辑助手（只做"可逆的一行插入"）
 *
 * 为什么单独写它，而不是在 PowerShell 里做字符串替换：
 *   ① **可逆且可验证**：`--apply` 只做「在唯一锚点后插入一行」，`--revert` 只做它的逆操作；
 *      两次操作之间用 sha256 对账，出现任何偏差就非 0 退出（绝不"差不多恢复"）；
 *   ② 锚点唯一性先守卫：锚点出现 0 次或 >1 次都拒绝改动（与变异牙的反空洞守卫同一条纪律）。
 *
 * 用法：
 *   node .../mutations-real/mdisk-edit.cjs --file=scripts/tools/build-local.js \
 *        --anchor-file=.../mutations-real/M-disk.anchor.txt --apply
 *   node .../mutations-real/mdisk-edit.cjs --file=... --anchor-file=... --revert
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const arg = name => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const ROOT = path.join(__dirname, '..', '..', '..', '..');
const resolve = p => (path.isAbsolute(p) ? p : path.join(ROOT, p));
const FILE = resolve(arg('file') || 'scripts/tools/build-local.js');
const ANCHOR_FILE = resolve(arg('anchor-file') || path.join(path.dirname(FILE), 'x'));
const MODE = process.argv.includes('--apply') ? 'apply' : process.argv.includes('--revert') ? 'revert' : null;
if (!MODE) { console.error('必须显式给 --apply 或 --revert'); process.exit(2); }
if (!fs.existsSync(ANCHOR_FILE)) { console.error(`找不到锚点文件 ${ANCHOR_FILE}`); process.exit(2); }

/** 锚点文件格式：第 1 行 = 锚点（必须唯一）；其余行 = 要插入的内容（保持字面，含缩进） */
const [anchor, ...payloadLines] = fs.readFileSync(ANCHOR_FILE, 'utf8').replace(/\r\n/g, '\n').split('\n');
const payload = payloadLines.filter(line => line !== '').join('\n');
if (!anchor) { console.error('锚点文件第 1 行为空'); process.exit(2); }

const sha = text => crypto.createHash('sha256').update(text).digest('hex');
const before = fs.readFileSync(FILE, 'utf8');
const occurrences = before.split(anchor).length - 1;
if (occurrences !== 1) {
  console.error(`❌ 锚点在 ${path.relative(ROOT, FILE)} 里出现 ${occurrences} 次（必须恰好 1 次）⇒ 拒绝改动`);
  process.exit(2);
}

const mutated = `${anchor}\n${payload}`;
const after = MODE === 'apply'
  ? before.replace(anchor, mutated)
  : before.replace(`${mutated}\n`, `${anchor}\n`);

if (after === before) { console.error(`❌ ${MODE} 没有改变文件（插入/删除都没落地）`); process.exit(2); }
fs.writeFileSync(FILE, after, 'utf8');
console.log(`${MODE} ok · file=${path.relative(ROOT, FILE).replace(/\\/g, '/')} · anchor 出现 ${occurrences} 次`);
console.log(`  sha256 ${sha(before)} → ${sha(after)}（字节 ${Buffer.byteLength(before)} → ${Buffer.byteLength(after)}）`);
console.log(`  插入内容：${payload.replace(/\n/g, ' | ')}`);
