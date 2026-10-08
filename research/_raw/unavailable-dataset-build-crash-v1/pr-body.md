# unavailable-dataset-build-crash-v1（t29）：两份变化日志不可用时构建不再崩在 Manifest

修掉 t27 收尾时复现的真缺陷：`plan-history.json` / `api-plan-history.json` **缺失或损坏**时，构建死在
`Cannot read properties of null (reading 'schemaVersion')`（`build-local.js` 的 Dataset Manifest）⇒
「本次构建没有拿到…日志」这句诚实性措辞**永远上不了产物**。t4/t7/v1a 关于「日志不可用而页面照常出页」的结论
此前**只对 deal-history 成立**。

## 根因（修在根因处，没有 try/catch 掩盖）

1. **崩溃点**：manifest 的 `plan-history` / `api-plan-history` 两条读的是 `planHistoryStore` / `apiPlanHistoryStore`
   —— `assemble()` 里的**便利变量**，按定义「不可用 ⇒ `null`」；**总是可用**的如实空账本在 `planHistoryLoad.store`
   （`lib/plan-history.js:986` 的 `load()` 契约 `store: result.store || emptyStore()`）。隔壁 deal-history 一直读的是
   `historyStore.store` —— 它就是参照。⇒ 两条改读 `…Load.store`。
2. **缺失形态的第二道坎**：`selfCheck()` 里两处「`dist/<日志>` 与源逐字节相同」在源不在时 `fail('缺少源 …')`。
   改成同一个 helper：**可用 ⇒ 与源逐字节相同；不可用 ⇒ 产物必须就是如实空账本**（不是整条跳过 ——
   跳过就放过了「产物里凭空冒出一个日期」）。
3. **缺失形态的第三道坎**：自检给页面级断言传的是「直接解析 dist 的那份账本」⇒ 不可用时是 **truthy 但零事件**的账本，
   模块以为日志可用，去要求本就不该存在的计数行/分栏。改成与构建期同口径的日志视图（不可用 ⇒ `null`，5 处调用点），
   模块于是走它的**「没有拿到日志」分支**（那条分支断言「页面必须说出没有拿到」，比计数对账更严）。
4. 变化雷达两处分栏判据按可用性分支：不可用时**只留那句说明**，分栏标题与变化行一个都不许出现（不可用 ≠ 没有变化）。

## 读数（9 形态 × 修复前后）

| 夹具 | 修复前 | 修复后 |
| --- | --- | --- |
| plan / api / 两份都**缺失** | ❌ TypeError（空指针） | ✅ **exit 0** · 6 / 6 / 9 个文件命中逐字「没有拿到…日志」· Manifest `unavailable + updatedAt: null + updatedAtShape: null` |
| `plan-history` **损坏** | ❌ TypeError | ✅ **exit 0**（同上 6 个文件） |
| `api-plan-history` **损坏** | ❌ validate 先退出 1 | ❌ 同前（**只量不修**，见下） |
| 两份都损坏 / 三份都损坏 | ❌ validate | ❌ 同前 |
| `deal-history` 损坏 / 缺失（对照） | ✅ exit 0（t7/PR #91 已修好） | ✅ exit 0 |

- **正常形态零回归**：304 文件逐文件 sha256 **changed 0**，全树 `f964d6ba19…` 修复前后同一个。
- **牙三颗**（红 → 逐字节还原 → 复跑绿）：T1 改回 null 便利变量 ⇒ `TypeError`；T2 自检日志视图改回直接解析 dist ⇒
  `✗ 套餐对比页未通过诚实性断言：…没有变更记录时未写「暂无变更记录」`；T3 注入伪造日期 ⇒
  `✗ dist/plan-history.json 不是如实空账本（源日志不可用：文件缺失）——不可用时不拿任何日期顶替`。
- **断言只增不减**（同工作树 pre/post）：构建期自检 73 · `selftest:plans` 264 · `selftest:feeds` 145 ·
  `selftest:changes` 119 · `verify:seo` 19 · `verify-site` **883 / 0**；`check:ci` 39/0 · `check:evidence` ✅ · `npm run gate` 见下。

## 「损坏」形态：只量不修（captain 裁定）

三份日志损坏时**不对称**：`deal-history` ⇒ exit 0 · `plan-history` ⇒ exit 0 · **`api-plan-history` ⇒ exit 1**，
阻断点是 `scripts/validate.js:688–690` 的 `checkApiPlanHistoryFile()`（`if (loaded.broken) error(...)`；同文件 684–686 对**缺失**只是 `warn`）。
本 PR **未碰 `validate.js`**：把「损坏 ⇒ error」改成「损坏 ⇒ warn」是判据政策变更（损坏该 fail-closed 还是让「如实说没拿到」上线），
不夹在实现任务里做。报告 §7 把两个选项与后果摆了出来，供另排任务裁定。

## 范围

只改 `scripts/tools/build-local.js`（+ 报告/自审/Tier-1 证据）；按 captain 指令把 t14 的收尾补记 `d641d7f`
cherry-pick 成 `0ad028c` 随本 PR 一起进。`scripts/validate.js`、`scripts/lib/changes.js`、`scripts/data/`（夹具逐字节还原）、
`docs/DESIGN-RULES.md`、`NEXT-STEPS.md` 均未改动。
