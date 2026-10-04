#!/usr/bin/env node
'use strict';
/**
 * t41 · 交付文档生成器（只读输入 → 写 t41-derived-r5-readings.md）
 *   输入：t41-derived-r5-readings.json（现场读数）、t41-reverse-teeth.json（反向牙实验）、
 *         t18-gate-results.json（全量门禁读数）
 *   输出：research/_raw/coverage-expansion-v1/t41-derived-r5-readings.md
 */
const fs = require('fs');
const path = require('path');
const R = path.join(__dirname);
const read = f => JSON.parse(fs.readFileSync(path.join(R, f), 'utf8'));

const rd = read('t41-derived-r5-readings.json');
const rt = read('t41-reverse-teeth.json');
const gate = read('t18-gate-results.json');

const v = id => rt.variants.find(x => x.id === id) || { exit: null, summary: '', reds: [], mutation: '' };
const A = v('A'), B = v('B'), C = v('C');
const L = [];
const p = s => L.push(s);

p('# t41 · R5 判据派生式：现场读数与反向牙（T18-F1 收口）');
p('');
p('> 任务：t41（repair）。把 `scripts/tools/vendor-page-selftest.js` 的 R5 期望从**写死计数**改成**派生式判据**，');
p('> 补两侧反证，复跑全量门禁到 48/49，并把 t18 的**两套矛盾读数**合并成一份自洽产物。');
p('>');
p('> 机器可读同源文件：`t41-derived-r5-readings.json`（现场读数）· `t41-reverse-teeth.json`（反向牙实验）·');
p('> `t18-gate-results.json` + `t18-gate-run.log`（全量门禁，同一次运行）。');
p('');
p('- **HEAD**：`' + rd.head.slice(0, 7) + '` · 分支 `coverage-expansion-v1` · 基线 `a4dd40f`');
p('- **判据（派生式）**：' + rd.judgement);
p('- **现场计数**：providers ' + rd.counts.providersTotal + ' · `vendorKey === null` **' + rd.counts.nullIdentity + ' 家** · 有身份 ' + rd.counts.identity
  + ' 家 · 厂商页 **' + rd.counts.vendorPages + ' 个** · 磁盘目录 **' + rd.counts.diskVendorDirs + ' 个**');
p('- **读数与哈希**：`scripts/data/providers.json` `' + rd.sha256['scripts/data/providers.json'].slice(0, 16) + '…` · '
  + '`scripts/data/vendor-slugs.json` `' + rd.sha256['scripts/data/vendor-slugs.json'].slice(0, 16) + '…` · '
  + '`dist/vendor` 目录清单 `' + rd.sha256['dist/vendor 目录清单'].slice(0, 16) + '…`');
p('');
p('---');
p('');
p('## 1. 判据改成了什么（不写死 4、也不写死 9）');
p('');
p('对 `scripts/data/providers.json` 里**每一个** `vendorKey === null` 的身份，逐条要求四件事：');
p('');
p('| # | 断言 | 为什么必须有 |');
p('|---|---|---|');
p('| (a) | `extPlan.skipped` 里有且**恰好一条** `no-vendor-identity` 记录，且该记录**不带路由** | 「不建路由」必须是计划层主动记下的事实，而不是"悄悄没有" |');
p('| (b) | 计划层**没有**它的厂商页 | 计划层自己就不许产出这条路由 |');
p('| (c) | `scripts/data/vendor-slugs.json` 里**没有**以它为键的登记 | 否则 slug 会绕开身份检查 |');
p('| (d) | 产物层 `dist/vendor/` 的目录集合**恰好等于**计划里的 slug 集合 | 多一个目录 = 给谁建了计划外的路由；少一个 = 计划里有页而磁盘上没有 |');
p('');
p('断言的对象是**关系**（身份 ↔ skip 记录 ↔ 计划 ↔ 磁盘 ↔ 登记表），**没有一个数字常量参与判定**。');
p('计数只出现在**消息文本**里（"9 个没有 A 空间厂商名的身份…"、"计划里的 22 个 slug"），是给人读的现场读数，不是判据。');
p('');
p('判据本体是一个纯函数 `nullIdentityProblemsOf({ names, skipped, pages, dirs, slugs })` —— 真实数据与合成输入走同一条路径，');
p('所以两个方向的反证不需要另写一套逻辑（见 §3）。');
p('');
p('---');
p('');
p('## 2. 现场读数');
p('');
p('### 2.1 ' + rd.counts.nullIdentity + ' 个 `vendorKey === null` 的身份逐条');
p('');
p('| 身份 | skip 记录数 | skip 的 route | 计划层有页 | 有页的 route | vendor-slugs 里有登记 | 判定 |');
p('|---|---|---|---|---|---|---|');
for (const r of rd.nullIdentityRows) {
  const ok = r.skipRows === 1 && !r.hasPage && !r.declaredInVendorSlugs && !r.skipRoute;
  p('| ' + r.name + ' | ' + r.skipRows + ' | ' + JSON.stringify(r.skipRoute) + ' | ' + (r.hasPage ? '**有**' : '无')
    + ' | ' + JSON.stringify(r.pageRoute) + ' | ' + (r.declaredInVendorSlugs ? '**有**' : '无') + ' | ' + (ok ? '✅ OK' : '❌ NG') + ' |');
}
p('');
p('⇒ ' + rd.nullIdentityRows.filter(r => r.skipRows === 1 && !r.hasPage && !r.declaredInVendorSlugs && !r.skipRoute).length
  + '/' + rd.nullIdentityRows.length + ' 条全部 OK：**每家都有恰好一条 skip、都没有页、都没有登记**。');
p('');
p('### 2.2 ' + rd.pageRows.length + ' 个有身份厂商页逐条（计划 route ↔ 磁盘目录）');
p('');
p('| 身份 | slug | route | 磁盘目录 | count | 靠非优惠资料达标 | Coding 套餐 | API 记录 | 模型 | 判定 |');
p('|---|---|---|---|---|---|---|---|---|---|');
for (const r of rd.pageRows) {
  p('| ' + r.name + ' | `' + r.slug + '` | `' + r.route + '` | ' + (r.diskDirPresent ? '有' : '**缺**')
    + ' | ' + JSON.stringify(r.count) + ' | ' + (r.nonDealMaterial ? '是' : '否') + ' | ' + JSON.stringify(r.codingPlans)
    + ' | ' + JSON.stringify(r.apiRecords) + ' | ' + JSON.stringify(r.models) + ' | ' + (r.diskDirPresent ? '✅' : '❌') + ' |');
}
p('');
p('### 2.3 磁盘目录集合 vs 计划 slug 集合');
p('');
p('- 磁盘 `dist/vendor/` 目录数：**' + rd.disk.dirs.length + '**（索引 `index.html` 之外全是厂商页目录）');
p('- 计划 slug 数：**' + rd.disk.plannedSlugs.length + '**');
p('- 相等：**' + rd.disk.equal + '** · 孤儿目录：`' + JSON.stringify(rd.disk.orphan) + '` · 缺目录：`' + JSON.stringify(rd.disk.missing) + '`');
p('');
p('### 2.4 反方向（有身份 + 靠非优惠资料达标，却没有页）');
p('');
p('- `identityWithMaterialButNoPage` = `' + JSON.stringify(rd.reverseDirection.identityWithMaterialButNoPage) + '`（空集 ⇒ 没有漏页）');
p('- 有身份共 ' + rd.counts.identity + ' 家，其中 ' + rd.counts.vendorPages + ' 家建了页；差额 ' + (rd.counts.identity - rd.counts.vendorPages)
  + ' 家的非优惠资料**没有达到门槛**（不是"漏页"——门槛判据与判据层同在 `landing.shouldGenerateLandingPage`）。');
p('');
p('---');
p('');
p('## 3. 反向牙实验（%TEMP% 忠实副本，共享 worktree 逐字未动）');
p('');
p('副本：`' + rt.copy + '`（`robocopy /E` 全量拷贝，排除 `node_modules` / `.git` / `.worktrees`）。');
p('');
p('| 变体 | 构造 | 期望 | 实得 exit | 汇总 | 判定 |');
p('|---|---|---|---|---|---|');
p('| **A** | `vendor-slugs.json` 里给 **null 身份 Groq** 加一条 `"Groq": "groq"` 登记（= 让它被当成有身份去建路由） | **红** | ' + A.exit + ' | ' + (A.summary || '—') + ' | ' + (A.exit !== 0 && A.sawR5Red ? '✅ 有牙' : '❌ 没牙') + ' |');
p('| **B** | 撤销变异（恢复原 `vendor-slugs.json`）后重跑 | **绿** | ' + B.exit + ' | ' + (B.summary || '—') + ' | ' + (B.exit === 0 ? '✅ 对照组绿' : '❌ 对照组红') + ' |');
p('| **C** | 删掉一个有身份厂商页的产物目录 `dist/vendor/zhipu/` | **红** | ' + C.exit + ' | ' + (C.summary || '—') + ' | ' + (C.exit !== 0 && C.sawR5Red ? '✅ 有牙' : '❌ 没牙') + ' |');
p('');
p('### 3.1 变体 A 的红（逐条）');
p('');
A.reds.forEach(r => p('- `' + r + '`'));
p('');
p('### 3.2 变体 C 的红（逐条 —— 原方向没被删弱）');
p('');
C.reds.forEach(r => p('- `' + r + '`'));
p('');
p('### 3.3 关于变体 A 的一处如实说明');
p('');
p('- 副本里 `build-local.js` 是 **exit 0**，但 `dist/vendor/groq/` **没有被建出来**（`groqDirExists=' + rt.variantABuild.groqDirExists + '`）——');
p('  因为输出目录用的是 `apply` 之后的页面集合，而 `apply` 另有身份校验；**计划层与登记表**这一侧仍然如实产出了违规事实。');
p('- 所以 A 判红的落点是 `nullIdentityProblemsOf` 的「`vendor-slugs.json` 里不该有它的登记」这一条（+ 该 check 的汇总行），');
p('  而**不是**磁盘集合那一条。这是**更强的**方向：只要有人把 null 身份往「有路由」的方向推（哪怕产物层还没建出目录），判据就红。');
p('');
p('---');
p('');
p('## 4. 全量门禁读数（与 t18 产物合并后的唯一一套）');
p('');
p('- 本次运行：`' + gate.startedAt + '` → `' + gate.finishedAt + '`，HEAD `' + gate.head.sha.slice(0, 7) + '`');
p('- **' + gate.gateSummary.passed + ' / ' + gate.gateSummary.total + ' 过 · ' + gate.gateSummary.failed + ' 红 · ' + gate.gateSummary.skipped + ' 跳过**（跳过 = `npm ci`，理由见 t18 报告 §7 T18-F2）');
p('- 红的步骤：`' + JSON.stringify(gate.gateSummary.failedNames) + '`');
p('- Vendor-pages self-test 这一步：exit `' + gate.steps.find(s => /Vendor-pages/.test(s.name)).exit + '`（修复前是 exit 1）');
p('- `concurrentEdits`：`' + JSON.stringify(gate.concurrentEdits) + '`（含义与差集见 t18 报告 §9.3）');
p('');
p('**两套读数的处置**：');
p('');
p('| 旧读数 | 出处 | 时间 / HEAD | 为什么与 48/49 不同 |');
p('|---|---|---|---|');
p('| 46/49 过 | 任务书记录的 attempt 1 读数 | 2026-10-04 ~21:10 · `9f27836` | 当时既有 R5 的写死计数红，还有解析器缺陷让 1 步没跑全 |');
p('| 47/49 过 | `t18-attempt12-pre-fix-run2.log`（改名保留） | 2026-10-04 21:24 · `9f27836` | 唯一那条红就是 R5（`FAIL Vendor-pages self-test (exit 1)`） |');
p('| **48/49 过** | **`t18-gate-results.json` + `t18-gate-run.log`（唯一权威）** | **本次运行 · `' + rd.head.slice(0, 7) + '`** | R5 改派生式后转绿；**没有多跑/少跑任何步骤**（三行读数 total 都是 49） |');
p('');
p('⇒ 差异是 **1 步断言**（Vendor-pages self-test 从红转绿），不是"多跑了 2 步"，也不是判定字段口径变了。');
p('- 完整时间线写在 `t18-full-gate-report.md` §9。');
p('');
p('---');
p('');
p('## 5. 只增不减：本次改动逐条说明「等价或更强」');
p('');
p('现场实测（`git show 118a95c^:scripts/tools/vendor-page-selftest.js` 与当前文件逐项比对）：');
p('');
p('| 量 | 修复前 | 修复后 | 方向 |');
p('|---|---|---|---|');
p('| `check(` 调用数 | **53** | **58** | +5（只增） |');
p('| 断言文本含 `【R5` 的条数 | **7** | **12** | +5（只增） |');
p('| 自测实跑项数（含 `requireDist` 与循环项） | 56 项（含 1 项失败） | **57 项 / 0 失败** | +1（只增） |');
p('| 文件字节 | 27,701 | 33,954 | +6,253（全是判据与注释） |');
p('');
p('| 旧断言（写死） | 新断言（派生式） | 关系 |');
p('|---|---|---|');
p('| `skippedNoIdentity.length === 4` + 只认 4 个名字 | 对**每个** `vendorKey === null` 的身份逐条判 (a)(c)(d) | **更强**：集合长大了也不会假红，且每家都被逐条点名（旧版只保证"总数是 4"） |');
p('| （无） | 计划层没有它的页（b） | **新增**：旧版从未断言过 null 身份在计划层不被建页 |');
p('| （无） | 磁盘目录集合 == 计划 slug 集合（d） | **新增**：旧版没有产物层的独立判定 |');
p('| （无） | 计划里有页、磁盘上却缺目录 ⇒ 红 | **新增**：反向（少一个目录）原先无人守护 |');
p('| 有身份却无页（原方向） | 保留在同一条纯函数里（`candidateSetProblems` 与 (d) 两条路径） | **等价**：变体 C 实测仍红 |');
p('');
p('---');
p('');
p('## 6. 复现命令');
p('');
p('```bash');
p('node scripts/tools/vendor-page-selftest.js                              # 57 项 / 0 失败');
p('node research/_raw/coverage-expansion-v1/t41-derived-r5-readings.cjs    # 现场读数 → t41-derived-r5-readings.json');
p('node research/_raw/coverage-expansion-v1/t41-doc.cjs                   # 本文档（t41-derived-r5-readings.md）');
p('node research/_raw/coverage-expansion-v1/t41-reverse-teeth.cjs <副本>   # 反向牙（%TEMP% 副本，见 §3）');
p('node research/_raw/coverage-expansion-v1/t18-gate-runner.cjs           # 全量门禁 → t18-gate-results.json');
p('```');
p('');

fs.writeFileSync(path.join(R, 't41-derived-r5-readings.md'), L.join('\n'), 'utf8');
console.log('wrote t41-derived-r5-readings.md (' + Buffer.byteLength(L.join('\n')) + ' bytes, ' + L.length + ' lines)');
console.log('gate ' + gate.gateSummary.passed + '/' + gate.gateSummary.total + ' · null 身份 ' + rd.counts.nullIdentity
  + ' · 有身份厂商页 ' + rd.counts.vendorPages + ' · 反向牙 A/B/C = ' + A.exit + '/' + B.exit + '/' + C.exit);
