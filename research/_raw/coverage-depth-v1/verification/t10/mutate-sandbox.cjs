#!/usr/bin/env node
/**
 * t10 Self-Audit：**TEMP 沙箱里的变异器**（绝不动共享工作区）。
 *
 * 用法：
 *   node mutate-sandbox.cjs <sandboxRoot> mutate-lib     # M-A：把 census 的 MISSING 计数人为 +1（队列里没有 MISSING 行）
 *   node mutate-sandbox.cjs <sandboxRoot> mutate-gaps    # M-B：给 gaps 文件多加一条 API 侧声明（载荷与文件行数脱钩）
 *   node mutate-sandbox.cjs <sandboxRoot> restore        # 从 .orig 逐字节还原
 *   node mutate-sandbox.cjs <sandboxRoot> status         # 打印当前各文件 sha256 与 .orig 对照
 *
 * 纪律：每次 mutate 前先把原文件留成 `<file>.orig`（只留一次），restore 用 .orig 覆盖并打印 sha256。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const [rootArg, mode] = process.argv.slice(2);
const ROOT = path.resolve(rootArg || '.');
const TARGETS = {
  'mutate-lib': 'scripts/lib/coverage-targets.js',
  'mutate-gaps': 'scripts/data/model-registry-gaps.json'
};
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 16);

function backup(file) {
  const orig = file + '.orig';
  if (!fs.existsSync(orig)) fs.copyFileSync(file, orig);
  return orig;
}
function restoreAll(file) {
  const orig = file + '.orig';
  if (fs.existsSync(orig)) { fs.copyFileSync(orig, file); fs.unlinkSync(orig); }
  return file;
}

if (mode === 'restore') {
  for (const rel of Object.values(TARGETS)) restoreAll(path.join(ROOT, rel));
  console.log('restore 完成');
  process.exit(0);
}
if (mode === 'status') {
  for (const rel of Object.values(TARGETS)) {
    const file = path.join(ROOT, rel);
    const orig = file + '.orig';
    console.log(`${rel}: now=${sha(file)}${fs.existsSync(orig) ? ' orig=' + sha(orig) : ' (无 .orig)'}`);
  }
  process.exit(0);
}

const rel = TARGETS[mode];
if (!rel) throw new Error(`未知模式 ${mode}`);
const file = path.join(ROOT, rel);
const before = sha(file);
backup(file);

if (mode === 'mutate-lib') {
  const src = fs.readFileSync(file, 'utf8');
  const anchor = 'for (const row of rows) states[row.state] = (states[row.state] || 0) + 1;';
  if (!src.includes(anchor)) throw new Error('M-A 锚点未找到');
  const mutated = src.replace(anchor, `${anchor}\n  states[STATES.MISSING] = (states[STATES.MISSING] || 0) + 1; // t10 M-A: census 与队列脱钩（人为多算一格 MISSING）`);
  fs.writeFileSync(file, mutated);
  console.log(`M-A 已注入 ${rel}: ${before} → ${sha(file)}`);
}

if (mode === 'mutate-gaps') {
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  const list = doc.declarations || doc.rows || [];
  const firstApi = list.find(item => item && item.apiPlanId !== undefined);
  if (!firstApi) throw new Error('M-B：找不到 API 侧声明行');
  list.push({ ...firstApi, variant: 't10-mutation-variant' });
  if (doc.declarations) doc.declarations = list; else doc.rows = list;
  fs.writeFileSync(file, JSON.stringify(doc, null, 2) + '\n');
  console.log(`M-B 已注入 ${rel}: ${before} → ${sha(file)}（声明行 ${list.length}）`);
}
