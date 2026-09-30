#!/usr/bin/env node
/**
 * 用量与成本报表。
 *
 * 用法：
 *   node scripts/tools/ai-usage.js [--json] [--file=<usage.jsonl>]
 *
 * token 数来自 API 的 `usage` 字段（真实数字）；金额来自 `scripts/data/ai-pricing.json`
 * （人工维护的价目表）。**两者分开报**：价目表里没有的模型显示「未知」而不是 0 ——
 * 0 看起来像"免费"，那是最容易骗自己的一个数字。
 */

'use strict';

const path = require('path');
const usage = require('../ai/usage');
const pricing = require('../ai/pricing');

const ROOT = path.join(__dirname, '..', '..');

function option(name, fallback = null) {
  const prefix = `--${name}=`;
  const hit = process.argv.find(arg => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

function main() {
  const file = option('file');
  const entries = usage.readAll(file ? path.resolve(ROOT, file) : usage.usageFile());
  const summary = usage.summarize(entries);

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ file: file || path.relative(ROOT, usage.usageFile()), entries: entries.length, summary }, null, 2));
    return 0;
  }

  console.log(usage.format(summary));
  const table = pricing.loadTable();
  if (table.missing) {
    console.log('· 没有价目表文件，因此所有金额都记为未知（token 数照记）');
  } else if (table.broken) {
    console.log(`· 价目表解析失败（${table.broken}），金额记为未知`);
  } else {
    const verified = Object.entries(table.entries).filter(([, entry]) => entry && entry.verified === true).length;
    console.log(`· 价目表：${Object.keys(table.entries).length} 个条目，其中 ${verified} 个已复核（只有已复核的参与估算）`);
  }
  console.log('· 账本文件：' + path.relative(ROOT, file ? path.resolve(ROOT, file) : usage.usageFile()));
  return 0;
}

process.exit(main());
