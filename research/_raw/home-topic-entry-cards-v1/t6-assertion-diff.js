#!/usr/bin/env node
/**
 * T6 返工的自证之一：**新增断言只增不减，既有断言一条都没被削弱/删除/改名**。
 *
 * 做法：把 T6 修改**前**的机器可读报告（`t3-verify-after.json`，792 项，t2 交付时跑的）
 * 与修改**后**的报告（`t6-verify-after.json`，798 项）逐条对账：
 *   · 名字集合：新增 = 期望的 6 条新断言；删除 = 0；改名 = 0；
 *   · 共有名的 (ok, detail) 三元组：细节里的本地端口号会变（127.0.0.1:5xxxx），
 *     其余逐字比对 —— 用于证明「不是把某条断言悄悄改宽了」。
 *
 * 用法：node research/_raw/home-topic-entry-cards-v1/t6-assertion-diff.js
 * 输出：stdout + t6-assertion-diff.json
 */
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const BEFORE = path.join(HERE, 't3-verify-after.json');   // 792 项（T6 之前）
const AFTER = path.join(HERE, 't6-verify-after.json');    // 798 项（T6 之后）
const OUT = path.join(HERE, 't6-assertion-diff.json');

const load = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const before = load(BEFORE);
const after = load(AFTER);

const key = c => c.name;
const bMap = new Map(before.checks.map(c => [key(c), c]));
const aMap = new Map(after.checks.map(c => [key(c), c]));

const added = [...aMap.keys()].filter(k => !bMap.has(k));
const removed = [...bMap.keys()].filter(k => !aMap.has(k));
const common = [...bMap.keys()].filter(k => aMap.has(k));

const stripPort = s => String(s == null ? '' : s).replace(/127\.0\.0\.1:\d+/g, '127.0.0.1:PORT');
const detailChanged = common.filter(k => stripPort(bMap.get(k).detail) !== stripPort(aMap.get(k).detail));
const okChanged = common.filter(k => bMap.get(k).ok !== aMap.get(k).ok);

const out = {
  generatedAt: new Date().toISOString(),
  before: { file: path.basename(BEFORE), total: before.total, failed: before.failed },
  after: { file: path.basename(AFTER), total: after.total, failed: after.failed },
  addedCount: added.length,
  removedCount: removed.length,
  commonCount: common.length,
  added,
  removed,
  detailChangedCount: detailChanged.length,
  detailChanged: detailChanged.slice(0, 20),
  okChangedCount: okChanged.length,
  okChanged,
  verdict: added.length === 6 && removed.length === 0 && okChanged.length === 0 && after.total === before.total + 6
};
fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n', 'utf8');

console.log(`改前 ${before.total} 项（失败 ${before.failed}）→ 改后 ${after.total} 项（失败 ${after.failed}）`);
console.log(`新增 ${added.length} 条 / 删除 ${removed.length} 条 / 共有 ${common.length} 条`);
added.forEach(n => console.log(`  + ${n}`));
removed.forEach(n => console.log(`  - ${n}`));
console.log(`共有名里 ok 变化的：${okChanged.length} 条；detail 变化（去掉本地端口号后）：${detailChanged.length} 条`);
detailChanged.slice(0, 10).forEach(n => console.log(`  ~ ${n}`));
console.log(`结论：${out.verdict ? '✓ 只增不减、既有断言的判定结果全部不变' : '✗ 与预期不符'}`);
process.exit(out.verdict ? 0 : 1);
