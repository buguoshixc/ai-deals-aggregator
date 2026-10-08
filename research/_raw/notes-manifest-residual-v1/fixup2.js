#!/usr/bin/env node
/**
 * t14 fixup 2（Tier-3）：把 `/plans/` 枢纽页对 api-plans-page 的调用接上 note 入口。
 * 用法：node .arch-v1/fixup.js hub-api-note
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

function replaceOnce(rel, from, to, label) {
  const file = path.join(ROOT, rel);
  const text = fs.readFileSync(file, 'utf8');
  const hits = text.split(from).length - 1;
  if (hits !== 1) throw new Error(`${rel}: ${label} 命中 ${hits} 次\n  from=${from.slice(0, 140)}`);
  fs.writeFileSync(file, text.replace(from, to), 'utf8');
  console.log(`  ${label} ✓`);
}

if (process.argv[2] === 'hub-api-note') {
  replaceOnce('scripts/lib/plans-hub-page.js',
    "  const api = apiPlansPage.apiChangesBlockHtml(view.apiPlanHistoryStore || null, view.apiPlans || []);",
    "  const api = apiPlansPage.apiChangesBlockHtml(view.apiPlanHistoryStore || null, view.apiPlans || [], {}, note);",
    '接线 hub → apiChangesBlockHtml');
}
console.log('fixup 完成');
