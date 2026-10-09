#!/usr/bin/env node
'use strict';
/**
 * 「删掉不许回流 / 扫描面不许收缩」的**产物复核入口**（secondary-page-residue-v2 · t4）。
 *
 *   node scripts/tools/check-residue.js [--dir=dist] [--json=<file>] [--quiet]
 *   （等价地：把 --dir 指到任意一份**产物副本**上 ⇒ 变异演练 / 独立复核）
 *
 * ## 它与构建期那一遍的关系（唯一实现）
 *
 * 判据实现在 `scripts/tools/build-local.js` 的 `scanResidue()` —— `npm run build` 的
 * 「产物自检」阶段会调它。本工具**require 同一个函数**，不复制扫描逻辑：
 *
 *   · 复制第二份扫描逻辑 ⇒ 变异演练证明的是「工具会红」，门禁会不会红仍然没人知道；
 *     两份实现一旦分叉，「有牙」与「没牙」在证据上没有区别。
 *   · 所以这里只做三件事：选目录、打印读数、按 `problems` 决定退出码。
 *
 * ⚠️ **它不在 CI 门禁链上**（门禁那一份是构建期的那次调用，跑在 `npm run build` 里）。
 *    本工具的存在理由是**可复核性**：复核者可以把 `dist/` 复制成一个沙箱、往里注入一段
 *    被删文案，然后跑这一条命令看它是否变红 —— 原始读数见
 *    `research/_raw/secondary-page-residue-v2/mutation/*.json`。
 *
 * ## 判据（逐字见 build-local.js 那一段的注释，这里只列不要改错的三条）
 *
 *   ① 被删文案（`scripts/data/residue-guard.json` 的 `deletedCopy`，literal + visible 两个面）
 *      在整篇产物里出现次数必须为 0（HTML 剥离 script / style / 注释后）。
 *   ② 豁免**只**从 index.html 的 `<!--SHARED:footer:START/END-->` 区间现算，
 *      且只在每一页的 `<footer>…</footer>` 区间内成立 —— 页脚以外出现即红。
 *   ③ 8 类容器的存在性下限（`containerFloors`）：低于下限即红（防整族被删 ⇒ 判据静默失效）。
 *
 * 退出码：0 全过 / 1 有问题（与其它 `check:*` / `verify:*` 工具一致）。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const { scanResidue, loadResidueGuard, RESIDUE_GUARD_FILE, RESIDUE_MIN_ENTRIES,
  RESIDUE_MIN_LIVE_LITERALS, FOOTER_KEPT_SENTENCE } = require('./build-local.js');

const arg = name => (process.argv.find(a => a.startsWith(`--${name}=`)) || '').slice(name.length + 3);
const dirArg = arg('dir');
const DIR = path.resolve(ROOT, dirArg || 'dist');
const JSON_OUT = arg('json');
const quiet = process.argv.includes('--quiet');

if (!fs.existsSync(DIR) || !fs.statSync(DIR).isDirectory()) {
  console.error(`❌ --dir 指向的不是一个目录：${DIR}（拒绝静默变成「没有产物可判」）`);
  process.exit(1);
}

const doc = loadResidueGuard();
const started = Date.now();
const { problems, readings } = scanResidue(DIR);
const elapsed = Date.now() - started;

const measuredOn = (doc && doc._measuredOn) || {};
console.log(`删掉不许回流 / 扫描面不许收缩 · 产物复核（${path.relative(ROOT, DIR).split(path.sep).join('/') || '.'}/）`);
console.log(`  登记表 ${path.relative(ROOT, RESIDUE_GUARD_FILE).split(path.sep).join('/')}`
  + ` · 被删文案 ${readings.entries} 条（下限 ${RESIDUE_MIN_ENTRIES}）· 断言字面 ${readings.literals} 条`
  + `（活字面下限 ${RESIDUE_MIN_LIVE_LITERALS}）· 归一化针 ${readings.normNeedles} 条`
  + ` · 建表锚定 ${measuredOn.files || '?'} 文件 ${String(measuredOn.treeDigest || '').slice(0, 16)}…（${measuredOn.asOf || '?'}）`);
console.log(`  扫描 ${readings.files} 个产物文件（其中 HTML ${readings.htmlPages} 个）· 三遍命中 ${readings.totalHits} 次`
  + `（原样 ${readings.rawHits} · 归一化 ${readings.normHits} · JSON 转义 ${readings.jsonHits}）`);
console.log('  豁免面: **本机制已移除**（t10/F1：取值面与作用域同源 ⇒ 白名单自证；基线受益者 0 条）'
  + ' —— 取而代之的是下面两行正面断言');
console.log(`  共享页脚正面断言: 锚点 ${readings.footerPages}/${readings.htmlPages} 页`
  + ` · 保留句「${FOOTER_KEPT_SENTENCE}」在 ${readings.footerKeptPages}/${readings.htmlPages} 页的页脚里`);
console.log(`  归一化那一遍的射程边界: ${readings.runtimeBoundary}`);
console.log('  已知边界（如实登记）: UTF-16LE+BOM 的产物页按 UTF-8 读不出内容 ⇒ 扫不到（t6 F4）'
  + ' · keep 面未登记字面的正文没有牙（t6 F9）');
console.log(`  不适用归一化的登记（只有原样那一遍在判它）: ${readings.normSkipped.length} 条`
  + `${readings.normSkipped.length ? ` —— ${readings.normSkipped.slice(0, 3).join('、')}${readings.normSkipped.length > 3 ? ' …' : ''}` : ''}`);
console.log(`  只在 script / style / 注释里的命中（只报不判）: ${readings.commentOnly} 次`);
console.log(`  8 类容器（实测/下限）: ${readings.floors.join(' · ')}`);
console.log(`  关系式（详情页数 ${readings.dealPages}，从产物现算）: ${readings.relations.join(' · ')}`);
console.log(`  用时 ${elapsed} ms`);

if (problems.length) {
  console.log('');
  for (const problem of problems) console.log(`  ✗ ${problem}`);
  console.log(`\n❌ 产物复核失败（${problems.length} 项）`);
} else if (!quiet) {
  console.log(`\n✅ 产物复核通过：${readings.literals} 条被删文案三遍 0 命中（无豁免名单）`
    + ` · 8 类容器均不低于下限且关系式成立`);
}

if (JSON_OUT) {
  const target = path.resolve(ROOT, JSON_OUT);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify({
    dir: path.relative(ROOT, DIR).split(path.sep).join('/'),
    checkedAt: new Date().toISOString(),
    registry: path.relative(ROOT, RESIDUE_GUARD_FILE).split(path.sep).join('/'),
    exitCode: problems.length ? 1 : 0,
    problems,
    readings
  }, null, 2)}\n`, 'utf8');
  console.log(`→ ${JSON_OUT}`);
}

process.exit(problems.length ? 1 : 0);
