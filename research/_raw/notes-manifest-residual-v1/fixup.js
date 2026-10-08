#!/usr/bin/env node
/**
 * t14 fixup（Tier-3）：台账删除的补丁（按真实块文本；命中必须恰好 1 次）。
 * 用法：node .arch-v1/fixup.js archive-ledgers
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const BUILD = 'scripts/tools/build-local.js';

function replaceOnce(rel, from, to, label) {
  const file = path.join(ROOT, rel);
  const text = fs.readFileSync(file, 'utf8');
  const hits = text.split(from).length - 1;
  if (hits !== 1) throw new Error(`${rel}: ${label} 命中 ${hits} 次\n  from=${from.slice(0, 160)}`);
  fs.writeFileSync(file, text.replace(from, to), 'utf8');
  console.log(`  ${label} ✓`);
}

const step = process.argv[2];
if (step === 'archive-ledgers') {
  replaceOnce(BUILD,
    "    noteUntracked(archiveLib.ARCHIVE_INDEX_ROUTE, {\n      family: 'archive-index',\n      owner: 'lib/archive.js',\n      structural: 'lib/archive.js:589 与 601（ARCHIVE_DESCRIPTION 口径说明 / 相关资料库，均无条件输出）',\n      minNotes: 2\n    });\n",
    '', '删台账（/archive/ 索引）');
  replaceOnce(BUILD,
    "      noteUntracked(route, {\n        family: 'archive-detail',\n        owner: 'lib/archive.js',\n        structural: 'lib/archive.js:715（「结束那一刻的字段值」说明，无条件输出）',\n        minNotes: 1\n      });\n",
    '', '删台账（档案详情页）');
  // 台账注释同步更新（这两处注释现在写的是「下一轮接管」，已接管 ⇒ 改成事实）
  replaceOnce(BUILD,
    "      // 说明意图：档案详情页的 `.snote` 由 `lib/archive.js` 的 renderArchiveEntry 渲染。\n      // 目前**一条 ended/restored 都没有**（这个循环不跑）；一旦跑起来，下面两行会随之上场 ——\n      // 台账要求它至少还有那一条「结束那一刻的字段值」说明。\n",
    "      // 说明意图：档案详情页的 `.snote` 已由 `lib/archive.js` 的 renderArchiveEntry **逐条登记**\n      // （notes-manifest-residual-v1 接管了构造点）。目前**一条 ended/restored 都没有**（这个循环不跑），\n      // 一旦跑起来，登记会随渲染一起上场（漏登记即红）。\n",
    '注释更新（档案详情页）');
}
console.log('fixup 完成');
