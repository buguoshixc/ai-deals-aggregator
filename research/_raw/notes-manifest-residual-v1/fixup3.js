#!/usr/bin/env node
/** t14 fixup 3（Tier-3）：把两个模块间复用的说明块接上 note 入口。用法：node .arch-v1/fixup3.js */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

function replaceOnce(rel, from, to, label) {
  const file = path.join(ROOT, rel);
  const text = fs.readFileSync(file, 'utf8');
  const hits = text.split(from).length - 1;
  if (hits !== 1) throw new Error(`${rel}: ${label} 命中 ${hits} 次\n  from=${from.slice(0, 160)}`);
  fs.writeFileSync(file, text.replace(from, to), 'utf8');
  console.log(`  ${label} ✓`);
}

// 1/2) 套餐页内部：变化块与关联块
replaceOnce('scripts/lib/plans-page.js',
  "    ? planChangesBlockHtml(opts.planChanges, { prefix: opts.prefix || '', providerTable, plansById: new Map(plans.map(p => [p.id, p])) })",
  "    ? planChangesBlockHtml(opts.planChanges, { prefix: opts.prefix || '', providerTable, plansById: new Map(plans.map(p => [p.id, p])), note: opts.note })",
  '接线 plansPageBody → planChangesBlockHtml');
replaceOnce('scripts/lib/plans-page.js',
  "  const dealLinksBlock = dealLinks ? `\\n${planDealsBlockHtml(dealLinks, { prefix: opts.prefix || '', home })}` : '';",
  "  const dealLinksBlock = dealLinks ? `\\n${planDealsBlockHtml(dealLinks, { prefix: opts.prefix || '', home, note: opts.note })}` : '';",
  '接线 plansPageBody → planDealsBlockHtml');

// 3) /plans/ 枢纽页 → 套餐变化块
replaceOnce('scripts/lib/plans-hub-page.js',
  "  const coding = plansPage.planChangesBlockHtml(view.codingRadar, {\n    prefix, providerTable: view.providerTable, planHref\n  });",
  "  const coding = plansPage.planChangesBlockHtml(view.codingRadar, {\n    prefix, providerTable: view.providerTable, planHref, note\n  });",
  '接线 hub → planChangesBlockHtml');

// 4/5/6) API 计费页 → 关联块
replaceOnce('scripts/lib/api-plans-page.js',
  "function dealLinksBlockHtml(view) {\n  if (!view) return '';\n  return plansPage.planDealsBlockHtml(view, {\n    prefix: '../../',\n    kind: 'api',",
  "function dealLinksBlockHtml(view, note = null) {\n  if (!view) return '';\n  return plansPage.planDealsBlockHtml(view, {\n    prefix: '../../',\n    note,\n    kind: 'api',",
  '签名 +note（dealLinksBlockHtml）');
replaceOnce('scripts/lib/api-plans-page.js',
  '${dealLinksBlockHtml(opts.dealLinks || null)}',
  '${dealLinksBlockHtml(opts.dealLinks || null, opts.note)}',
  '接线 apiPlansPageBody → dealLinksBlockHtml');

console.log('fixup3 完成');
