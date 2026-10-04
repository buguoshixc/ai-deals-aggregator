#!/usr/bin/env node
/**
 * t17：把 `logs/battery.json` 渲染成人读的 `MUTATION-RESULTS.md`（不重新跑电池，只读记录）。
 * 用法：node research/_raw/t17/report.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const battery = JSON.parse(fs.readFileSync(path.join(DIR, 'logs', 'battery.json'), 'utf8'));
const lines = [];
const say = line => lines.push(String(line));
const pct = (part, total) => `${part}/${total}`;

const GROUP_ORDER = ['对照', 'A registry', 'B plans', 'C targets', 'D gate', 'E page', 'F history', 'G selftest'];
const rows = [...battery.results].sort((a, b) => {
  const ga = GROUP_ORDER.indexOf(a.group);
  const gb = GROUP_ORDER.indexOf(b.group);
  if (ga !== gb) return ga - gb;
  return a.id < b.id ? -1 : 1;
});

say('# t17 · Mutation / Tooth Test 电池 —— 运行记录');
say('');
say(`- 执行：freshness-engineer（t17，attempt 1 · attempt_id \`05296185-fe9d-44a4-a422-85fac65712f6\`）`);
say(`- 运行时刻：\`${battery.runAt}\`（用例执行窗口起点 \`${battery.windowStart}\`）`);
say(`- 主机：${battery.host.platform} ${battery.host.release} · ${battery.host.cpus} 逻辑核 · worker ${battery.workers}`);
say(`- 可复跑脚本：\`research/_raw/t17/mutation-battery.cjs\` + 用例库 \`research/_raw/t17/mutation-cases.cjs\``);
say(`- 逐例原始记录（含 sha256 / 门禁 exit code / 断言原文）：\`research/_raw/t17/logs/battery.json\``);
say(`- 覆盖率：**CAUGHT ${pct(battery.counts.caught, battery.counts.total)}** · 对照组 ${battery.counts.green} · 留档盲区 ${battery.counts.knownNotCaught} · 非预期红 ${battery.counts.unexpectedRed} · 变异应用失败 ${battery.counts.applyError}`);
say('');
say('## 0. 方法（为什么这样测才算数）');
say('');
say('| 项 | 做法 |');
say('| --- | --- |');
say('| 在哪变异 | **仓库外的沙箱** `D:\\t17-mutation\\gold`（从共享树复制，node_modules 用 junction 指回）。每个用例再从 gold 复制一份到 `cases/<id>/`，**在副本上**变异 —— 共享 worktree 全程只读 |');
say('| 变异落在哪一层 | 一律落在**来源层** `scripts/data/**`（改产物会得到假阴性：t20/§21 电池踩过这个坑）；只有"产物渲染层"用例才动 `dist/**`（静态 HTML 丢行 / No-JS / filter 默认全显 / 逐格单位错位） |');
say('| 逐字节恢复 | 每个用例先记录目标文件的 sha256 → 变异 → 跑门禁 → **用 gold 覆盖回写** → 重算 sha256 并与变异前比对（`restore[].byteExact`）。全程**不用** `git checkout/restore/stash` |');
say('| 对照前提 | `M00` 不修改任何文件：13 道门禁必须全绿。它绿才说明"红"是变异引起的，不是环境本来就红 |');
say('| 共享树证据 | 判据 = **所有用例的变异目标文件**在用例执行窗口内 sha256 未变（`mutationTargetsUnchanged`）。故意不把 setup 的整树复制算进窗口 —— 队友在那几十秒里的正常提交不该记在电池头上（本轮实测：窗口内 `scripts/data/curated_plans.json` 被队友改过，属正常提交，已如实列出） |');
say('| 判据来源（本电池如何抓住"两条§70 没被抓住"这类错误） | 每条变异都逐例记录**哪道门禁非 0 + 断言原文**；`M24/M26` 明知抓不住也留着跑，并在 §3 用独立实验说明"为什么抓不住" |');
say('');
say('## 1. 总表（预期红 = 实际红）');
say('');
say('| # | 组 | 变异 | 落点 | 期望被谁抓住 | 实测红了哪些门禁（exit=1） | 判定 |');
say('| --- | --- | --- | --- | --- | --- | --- |');
for (const item of rows) {
  const targets = (item.targets || []).map(name => `\`${name}\``).join(' · ');
  const failing = (item.failingGates || []).length ? item.failingGates.map(name => `\`${name}\``).join(' ') : '—';
  say(`| ${item.id} | ${item.group} | ${item.title} | ${targets} | ${item.expected} | ${failing} | **${item.verdict}** |`);
}
say('');
say('## 2. 逐字节恢复（每条都成立）');
say('');
say('| # | 目标文件 | 变异前 sha256 | 恢复后 sha256 | byteExact |');
say('| --- | --- | --- | --- | --- |');
for (const item of rows) {
  for (const entry of (item.restore || [])) {
    say(`| ${item.id} | \`${entry.path}\` | \`${String(entry.shaBefore).slice(0, 16)}…\` | \`${String(entry.shaAfter).slice(0, 16)}…\` | ${entry.byteExact ? '✅' : '❌'} |`);
  }
  if (!item.restore || !item.restore.length) say(`| ${item.id} | — | — | — | — |`);
}
say('');
say(`**恢复失败数**：${battery.counts.restoreFailed}（0 = 每条都逐字节复原）`);
say('');
say('## 3. 留档的已知盲区（NOT_CAUGHT(KNOWN)）—— 这是电池最该产出的东西');
say('');
const known = rows.filter(item => item.verdict === 'NOT_CAUGHT(KNOWN)');
for (const item of known) {
  say(`### ${item.id} · ${item.title}`);
  say('');
  say(`- **变异**：\`${JSON.stringify(item.applied && item.applied.mode ? item.applied.mode : item.applied)}\` → \`${(item.applied && item.applied.anchor) ? item.applied.anchor : ''}\``);
  say(`- **期望**：${item.expected}`);
  say(`- **实测**：${(item.gates || []).map(gate => `\`${gate.id}=${gate.exitCode}\``).join(' · ')}（全绿 ⇒ 没有任何门禁会红）`);
  say('');
}
say('### 3.1 盲区 M24 的独立验证（`probe-provenance-teeth.cjs`，输出见 `probe-provenance-teeth.txt`）');
say('');
say('- **T0 基线**：`provenance-selftest` exit=0，`✅ provenance 自测：114 项通过，0 项失败`');
say('- **T1 把一条真实记录的引文改成编造文本**（`deals.json` 里 `4987c183fc1a` 的 `evidence[0].quote` → 「完全编造的引文…」）⇒ 自测**仍然 exit=0、114/114 绿**。');
say('  ⇒ 该自测的 114 项断言**跑的是合成夹具**，没有任何一项拿"盘上真实记录的引文"去对账；也就是说「引文是不是真的」这件事在仓库里**没有独立门禁**（t15 独立审查里的 F1/F2 正是这一类问题：cerebras 引文是改写件却自称"逐字"）。');
say('- **T2 拔掉 `check()` 的失败入队**（M24 的变异）⇒ exit=0，且**没有第三方门禁**能发现。');
say('- 恢复核对：`deals.json` 与 `provenance-selftest.js` 均 `byteExact=true`。');
say('');
say('### 3.2 盲区 M26 的独立验证（`diag-m25.txt`）');
say('');
say('- `scripts/lib/coverage-targets.js` 的 `PRECEDENCE` 常量**只被定义与 `module.exports` 导出，没有任何生产者读取它**（`grep PRECEDENCE` 在仓库里只有定义行与导出行）。');
say('- 真实优先级判定在 `deriveDimension()` 的 `if` 链里（`!applicable → NOT_APPLICABLE`；`ruling → UNVERIFIABLE / DEFERRED`）。');
say('- 所以"把 `PRECEDENCE` 里 MISSING 提到最前"**不动任何行为**，没有门禁该红 —— 但那份顺序读起来像是权威判据，属"文档化顺序 vs 真实分支"的漂移面。');
say('- **反证（同一语义的真牙是好的）**：`M25` 把 `deriveDimension()` 里 DEFERRED 分支加一条 `row.count === 0 → MISSING` 短路，`coverage-targets-selftest` 立刻红 ⇒ 「DEFERRED 永不算 MISSING」这条牙**守的是真实分支**。');
say('');
say('## 4. 共享树证据（电池没有污染共享工作树）');
say('');
say(`- 变异目标文件在用例执行窗口内逐字节未变：**${battery.sharedTree.mutationTargetsUnchanged}**`);
say(`- 证据口径：${battery.sharedTree.note}`);
say(`- 窗口内被改动过的 GUARDED 文件（属队友正常提交，不是电池写的）：${battery.sharedTree.changedDuringCases.length ? battery.sharedTree.changedDuringCases.map(name => `\`${name}\``).join(' · ') : '（无）'}`);
say('');
say('## 5. 复跑方式');
say('');
say('```powershell');
say('cd .worktrees/coverage-expansion-v1');
say('node research/_raw/t17/mutation-battery.cjs                    # 全部 27 条');
say('node research/_raw/t17/mutation-battery.cjs --only=M01,M19     # 指定用例');
say('node research/_raw/t17/probe-provenance-teeth.cjs              # 复现 §3.1 的盲区实验');
say('node research/_raw/t17/report.cjs                              # 由 logs/battery.json 重新生成本文件');
say('```');
say('');
say('退出码：0 = 全部用例预期红=实际红、逐字节恢复成立、且变异目标文件未变；非 0 = 有需要人工看的项（会逐条打印）。');
say('');
say('## 6. 本电池覆盖的 §70 面（对照本轮"另加新增变异"清单）');
say('');
say('| 题目点名的变异 | 对应用例 |');
say('| --- | --- |');
say('| 静态 HTML 丢行 | M19 |');
say('| No-JS 丢行 | M20 |');
say('| filter 默认全显 | M21 |');
say('| releasedAt 改第三方域 | M05 |');
say('| catalogStatus 手写 | M02 |');
say('| DEFERRED 被算成 MISSING | M25（真分支）/ M26（常量表的漂移面） |');
say('| 阈值扰动 | cross-ref：`scripts/tools/model-freshness-sensitivity.js`（12 情景、`--json` 两次逐字节一致）+ `model-freshness-selftest.js` 的同幅平移牙 4 条（t17 的电池不重复实现策略扰动，见 §7） |');
say('');
say('## 7. 与既有牙的分工（避免重复造第二套）');
say('');
say('- `scripts/tools/*-selftest.js` 里的**合成夹具牙**（provenance 24 处、models-page 15 处、freshness 3 处…）继续由各自的自测负责；本电池负责"**打到真实树上**还有没有牙"以及"**牙被拔掉之后有没有人发现**"。');
say('- 阈值扰动属"策略层灵敏度"，已由 `model-freshness-sensitivity.js`（我的 t4 产物）覆盖；本电池只在 M25/M26 里覆盖"阈值/优先级语义被改坏"这一类。');
say('');
say('---');
say('');
say(`> 生成方式：\`node research/_raw/t17/report.cjs\`（只读 \`logs/battery.json\`，不重跑门禁）`);
say('');

fs.writeFileSync(path.join(DIR, 'MUTATION-RESULTS.md'), lines.join('\n'), 'utf8');
process.stdout.write(`written MUTATION-RESULTS.md (${lines.length} lines)\n`);
