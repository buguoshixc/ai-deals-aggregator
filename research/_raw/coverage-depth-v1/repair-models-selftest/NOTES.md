# repair-models-selftest（t11 / T2-F1）：v2 负例夹具的自指盲区 —— 修复记录

- 任务：t11（repair）· 目标文件：`scripts/tools/models-selftest.js` · 现场文件 sha256 前 16 位：改前 `A6A8A8FC66E056D6` → 改后 `2FEB935B14E16CA7`
- 触发：t2 把 `glm-5.3` 合法补上 `releasedAt=2026-08-19` + `releaseEvidence` 后，两个【v2】负例夹具不再报红（假绿）

## 1. 缺陷是什么

`scripts/tools/models-selftest.js` 的「互为充要的两个方向」两个负例夹具，各自只改 `glm-5.3` 的**一半**字段：

- `dateNoEvidence`：只写 `releasedAt`，**不显式清空** `releaseEvidence`
- `evidenceNoDate`：只写 `releaseEvidence`，**不显式清空** `releasedAt`

两者都隐式依赖"另一半在**真实数据**里恰好为空"。于是当真实数据把另一半合法填上时，负例的输入变成一个**合法的**表 ⇒ 判据不再报红 ⇒ 检查名还在、却永远绿。这是"测试被真实数据静默解除武装"，比测试直接失败更危险。

## 2. 修了什么（29 行纯新增，0 行删除/改写）

1. `dateNoEvidence['glm-5.3'].releaseEvidence = [];` —— 夹具显式写死另一半为空，与真实数据解耦；
2. `evidenceNoDate['glm-5.3'].releasedAt = null;` —— 同上；
3. 新增**解耦牙**一条（判夹具逻辑、不判当前数据）：先造一份「`glm-5.3` 两半都合法有值」的表（证据用 `https://docs.bigmodel.cn/cn/update/new-releases`，落在智谱官方域上，起点自身在其维度上合法），再各造一份"只有一半"的表，断言：起点无 `互为充要` 问题、两份半成品各自报红。于是**无论未来真实数据把 glm-5.3 填成 null 还是有日期**，这两个负例都不会再被静默解除武装。

既有检查名一个未改；`git diff --numstat` = `29 0`（29 插入 / 0 删除）⇒ 没有任何既有断言被改写或放宽。

## 3. 改前 / 改后读数（同一时刻、同一份工作区）

改前（`before-models-selftest.txt`，exit 1）：`139 项通过，4 项失败`
```
✗ 【v2】写了 releasedAt 却不给官方证据 → 红
✗ 【v2】给了官方证据却不写 releasedAt → 红（互为充要的另一半）
✗ 真实数据：API 侧声明 24 条，reason 全部是 off-registry-model、sourceUrl 全部取自该记录自己的官方页
✗ 【API 处置】coverageOf：declaredApiEntries 逐条留档（12 条 · 带 provider）+ unmappedModelKeys 归零 + 三者和 == 总条目 —— {"declared":24,"unmapped":0,"mapped":84,"identities":24,"items":108}
```
（更早一次读数是 `138 项通过，5 项失败`，第 3 条 api-plans 逐字对账失败在本轮取证期间已被写域负责人修掉 ⇒ 读数是活的。）

改后（`after-models-selftest.txt`，exit 1，**T2-F1 的两项已转绿**）：`142 项通过，2 项失败`
```
✓ 【v2】写了 releasedAt 却不给官方证据 → 红
✓ 【v2】给了官方证据却不写 releasedAt → 红（互为充要的另一半）
✓ 【v2】解耦牙：起点两半都合法时，夹具仍能各自造出"只有一半"的非法表并报红（T2-F1 自指盲区）
✗ 真实数据：API 侧声明 24 条，reason 全部是 off-registry-model、sourceUrl 全部取自该记录自己的官方页
✗ 【API 处置】coverageOf：declaredApiEntries 逐条留档（12 条 · 带 provider）+ unmappedModelKeys 归零 + 三者和 == 总条目 —— {"declared":24,"unmapped":0,"mapped":84,"identities":24,"items":108}
```
断言总数 143 → 144（只增不减：新增 1 条解耦牙）；通过数 139 → 142；失败数 4 → 2（且这 2 条与本修复无关，见 §4）。

## 4. 剩余 2 项失败的逐条归因（本任务范围外，作为阻塞项上报）

两条失败**同一个根因**，且都不在 `scripts/tools/models-selftest.js` 的可修范围内：

读 `scripts/data/model-registry-gaps.json`（`reg.declarationsList`）：

- API 侧声明实际 **24 条**，其中 **1 条重复**（`23643dfd94f8/ernie-5.1` 出现两次）⇒ 唯一键 23 条；
- 24 条里带 `provider` 字段的 **0 条**（带 `note` 的 24 条）。

而两处断言分别写死：

- `models-selftest.js:892`：`apiDecl.length === 12 && …` ⇒ 实得 24，红；
- `models-selftest.js:1030`：`apiCoverage.declaredApiEntries.length === 12 && … && entry.provider && …` ⇒ 实得 24 且 0 条带 `provider`，红。

⇒ 归因写域：**`scripts/data/model-registry-gaps.json`（声明数据：数量 24↔12、`provider` 字段缺失、`ernie-5.1` 重复）** 与 **`scripts/lib/model-registry.js` 的 `coverageOf` 记账口径 / 上述两处断言的期望值**。二者都在 t11 的 out of scope（`scripts/data/`、`scripts/lib/`），**未改一个字节**。本修复**刻意不动**这两处期望值：把断言数字改成跟数据一致，正是本任务要消灭的"测试被数据牵着走"。

## 5. 其余四条 verify（改后复跑，全绿）

| 命令 | exit | 读数 |
|---|---|---|
| `node scripts/tools/model-freshness-selftest.js` | 0 | ✅ 100 项通过，0 项失败 |
| `node scripts/tools/check-models-reproducible.js` | 0 | 44 个模型 · 85 条映射 · `updatedAt=2026-10-05T00:00:00+08:00`（与来源层逐字节一致） |
| `node scripts/validate.js --strict` | 0 | ✅ 校验通过（strict 模式） |
| `node scripts/tools/coverage-report.js` | 0 | ✅ 覆盖报告自检通过（0 处问题） |

## 6. 本目录工件

- `before-models-selftest.txt` / `after-models-selftest.txt`：改前 / 改后完整输出（含逐条 ✗ 原文）
- `after-node_scripts_tools_model-freshness-selftest.js.txt` 等 4 份：其余 verify 的完整输出
- 边界：本任务只改 `scripts/tools/models-selftest.js`（29 行新增）+ 本目录；未碰 `scripts/data/**`、`scripts/lib/**`、其它 selftest、`.github/**`、`package.json`、根 `models.json`
