'use strict';
/** t21：把 self-audit 报告里的自测项数改成**实跑读数**（逐条替换），并留一份替换记录。 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const WT = 'D:/OneDrive/Desktop/Code/AI Page/.worktrees/coverage-expansion-v1';
const MD = path.join(WT, 'research/coverage-expansion-v1-self-audit.md');

const TESTS = {
  'coverage-targets-selftest.js': 'coverage-targets-selftest.js',
  'model-freshness-selftest.js': 'model-freshness-selftest.js',
  'model-role-vocabulary-selftest.js': 'model-role-vocabulary-selftest.js',
  'models-selftest.js': 'models-selftest.js',
  'models-page-selftest.js': 'models-page-selftest.js',
  'vendor-page-selftest.js': 'vendor-page-selftest.js',
  'api-plans-selftest.js': 'api-plans-selftest.js',
  'feeds-selftest.js': 'feeds-selftest.js',
  'provenance-selftest.js': 'provenance-selftest.js',
  'data-docs-selftest.js': 'data-docs-selftest.js',
  'history-selftest.js': 'history-selftest.js',
};
const measured = {};
for (const [k, f] of Object.entries(TESTS)) {
  const r = spawnSync(process.execPath, ['scripts/tools/' + f], { cwd: WT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 600000 });
  const last = String(r.stdout || '').trim().split('\n').filter(Boolean).slice(-1)[0] || '';
  const m = /(\d+)\s*项(?:通过|，0 项失败)/.exec(last) || /(\d+)\s*项通过/.exec(last);
  measured[k] = { exit: r.status, items: m ? Number(m[1]) : null, last: last.slice(0, 90) };
}
console.log('实测项数：');
for (const [k, v] of Object.entries(measured)) console.log('  ' + k.padEnd(38) + ' exit=' + v.exit + ' items=' + v.items + ' :: ' + v.last);

let md = fs.readFileSync(MD, 'utf8');
const before = md.length;
/* 只在「自测」语境里替换：把形如 `selftest:xxx`（NN 项） 或 (NN 项) 后面紧跟自测名的写法改正 */
const fixes = [
  ['`selftest:coverage-targets`（84 项）', '`selftest:coverage-targets`（实测 ' + measured['coverage-targets-selftest.js'].items + ' 项）'],
  ['`selftest:freshness`（35 项）', '`selftest:freshness`（实测 ' + measured['model-freshness-selftest.js'].items + ' 项）'],
  ['`selftest:model-roles`（8 项）', '`selftest:model-roles`（实测 ' + measured['model-role-vocabulary-selftest.js'].items + ' 项）'],
  ['`selftest:models`（125 项）', '`selftest:models`（实测 ' + measured['models-page-selftest.js'].items + ' 项；= models-page-selftest）'],
  ['`selftest:api-plans`（148 项）', '`selftest:api-plans`（实测 ' + measured['api-plans-selftest.js'].items + ' 项）'],
  ['`selftest:history`（61 项）', '`selftest:history`（实测 ' + measured['history-selftest.js'].items + ' 项）'],
  ['`selftest:provenance`（67 项）', '`selftest:provenance`（实测 ' + measured['provenance-selftest.js'].items + ' 项）'],
  ['（132 项，含新增 14 条）', '（实测 ' + measured['feeds-selftest.js'].items + ' 项，含 t31 新增的 13 条夹具牙）'],
];
let applied = [];
for (const [from, to] of fixes) {
  if (md.includes(from)) { md = md.replace(from, to); applied.push(from + '  →  ' + to); }
}
/* 「14 个自测复跑」那一行里的项数也要改 */
md = md.replace(
  /\| 14 个自测复跑 \| \*\*14\/14 exit 0\*\*：[^|]*\|/,
  '| 14 个自测复跑 | **14/14 exit 0**（**项数以实跑为准**）：validate-strict · check-ci(38) · coverage-report · coverage-targets(' + measured['coverage-targets-selftest.js'].items + ') · freshness(' + measured['model-freshness-selftest.js'].items + ') · model-roles(' + measured['model-role-vocabulary-selftest.js'].items + ') · models-page(' + measured['models-page-selftest.js'].items + ') · models(' + measured['models-selftest.js'].items + ') · vendor-page(' + measured['vendor-page-selftest.js'].items + ') · api-plans(' + measured['api-plans-selftest.js'].items + ') · feeds(' + measured['feeds-selftest.js'].items + ') · provenance(' + measured['provenance-selftest.js'].items + ') · data-docs(' + measured['data-docs-selftest.js'].items + ') · history(' + measured['history-selftest.js'].items + ') |'
);
/* §4.2 的表头补一句口径说明 */
md = md.replace(
  '对全部 21 个「测试/检查」类变更文件，我逐文件算 `check(` 调用数（基线 vs 自审 HEAD）：',
  '对全部 21 个「测试/检查」类变更文件，我逐文件算 `check(` 调用数（基线 vs 自审 HEAD）。\n> **口径提醒**：下表是 **`check(` 调用数（静态）**，与**自测实跑的"项数"不是同一个量**（一个 `check()` 可能在循环里跑多次，也有 `requireDist` 这类条件项）。\n> 引用时请写清用的是哪一个：静态调用数用于「有没有减少」，实跑项数用于「现在有多少条牙」。'
);
fs.writeFileSync(MD, md, 'utf8');
console.log('\n替换记录：');
applied.forEach(a => console.log('  ' + a));
console.log('报告 ' + before + ' → ' + md.length + ' chars');
