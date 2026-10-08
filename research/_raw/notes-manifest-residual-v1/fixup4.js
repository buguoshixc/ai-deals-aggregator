#!/usr/bin/env node
/**
 * t14 fixup 4（Tier-3）：把 /changes/ 那一页恢复成「台账持有」的状态 ——
 * 本轮（t14 尝试 5）只接管到 6/7 个模块，index.html 的 RENDER-CORE 尚未接管，
 * 所以台账里必须留着 changes/ 那一条（否则 /changes/ 会被当成 complete 而红）。
 * 同时撤掉为 RENDER-CORE 预留、但本轮没有配套改动的调用点第三个参数。
 * 用法：node .arch-v1/fixup4.js restore-changes-ledger
 */
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

if (process.argv[2] === 'restore-changes-ledger') {
  replaceOnce('scripts/tools/build-local.js',
    "  notePage('changes/', { kind: 'changes' });\n",
    "  notePage('changes/', { kind: 'changes' });\n"
      + "  // 台账（仍未接管）：正文里的 9 条 `.snote` 由 `index.html` 的 RENDER-CORE（changesPageHtml）\n"
      + "  // 与 `lib/plans-page.js` / `lib/api-plans-page.js` 的变化块渲染 —— 后两者已逐条登记\n"
      + "  // （notes-manifest-residual-v1 接管），RENDER-CORE 那一处**尚未接管**，所以这一页仍进台账。\n"
      + "  noteUntracked('changes/', {\n"
      + "    family: 'changes',\n"
      + "    owner: 'index.html 的 RENDER-CORE 区块（changesPageHtml）',\n"
      + "    structural: 'index.html:3930（分栏口径说明 N.scope，无条件输出）',\n"
      + "    minNotes: 2\n"
      + "  });\n",
    '恢复 changes/ 台账');
  replaceOnce('scripts/tools/build-local.js',
    "  const marked = markChangesRows(renderCore.changesPageHtml(radar, '../', noteDeclarerFor('changes/')), itemListRecords, changes.renderOrderOf(radar).length);",
    "  const marked = markChangesRows(renderCore.changesPageHtml(radar, '../'), itemListRecords, changes.renderOrderOf(radar).length);",
    '撤掉 RENDER-CORE 调用点的第三个参数（本轮未接管）');
  replaceOnce('scripts/tools/build-local.js',
    "    ? apiPlansPage.apiPlanChangesPageBlockHtml(context.apiPlanChanges, {\n      prefix: '../', providerTable: context.providerTable || null, note: noteDeclarerFor('changes/')\n    })",
    "    ? apiPlansPage.apiPlanChangesPageBlockHtml(context.apiPlanChanges, { prefix: '../', providerTable: context.providerTable || null, note: noteDeclarerFor('changes/') })",
    '保留 API 块的 note 注入（已接管的模块）');
}
console.log('fixup4 完成');
