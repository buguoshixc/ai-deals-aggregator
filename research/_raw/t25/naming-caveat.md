# t29 冻结口径：报告 JSON 键 ↔ `lib/model-registry.js` `coverageOf()` 读数 的命名对照（可引用）

> 用途：t21 self-audit 与 t20 最终报告可直接引用下文（一段话，含两个方向的对照）。
> 只加注释、不重命名冻结键：误读会被报告里那条硬交叉断言当场判红，而改名要牵动冻结键、白名单与下游引用。

## 可引用表述

`coverageOf()` 里那对词与覆盖报告 JSON 里的那对词是**交叉**的 —— 同一个词名在两层指的不是同一种东西。
报告 JSON 的 `registry.declaredApiEntries` 是**数**：被 API 侧处置声明**展开后覆盖的计价条目数**（即覆盖报告那条方程的 B：`计价条目 N = 已映射认领 A + 已处置声明 B + 未判 C`），它等于 lib `coverageOf().declaredApiIdentities`（内部 Set `declaredApi` 的 size）；而 **lib `coverageOf().declaredApiEntries` 是数组** —— 处置声明本身逐条留档（每行 `provider / apiPlanId / modelKey / variant / reason / note`）。报告 JSON 的 `registry.declaredApiEntryRows` 才是那个**数组**（声明行逐条留档，长度 = 声明条数），它等于 lib `coverageOf().declaredApiEntries`。报告 JSON 的 `gaps.declaredApiEntryCount` 是**数**：声明行数（= `registry.declaredApiEntryRows.length`），**不是**方程的 B。报告 JSON 的 `registry.mappedApiEntries` 是**数**：展开后被映射认领的计价条目数（= 方程的 A），等于 lib `coverageOf().mappedApiEntries`；未判 C 则在报告 JSON 里是 `gaps.unmappedModelCount`（等价于 `registry.unmappedModels.length`），等于 lib `coverageOf().unmappedModelKeys.length`。

一句话记法：**报告层 `...Entries`（数）↔ lib 层 `...Identities`（数）；报告层 `...EntryRows`（数组）↔ lib 层 `...Entries`（数组）。** 无通配声明（`variant: null`）时"展开后条目数"与"声明条数"恰好相等（当前 12 = 12），一旦出现通配声明两者就会分叉 —— 记账一律读前者。这一对照已写死在 `scripts/tools/coverage-report.js` 的 JSON 组装处与 `scripts/tools/coverage-targets-selftest.js` 的追加键白名单旁；误读不会静默：报告里有一条硬交叉断言（报告层独立记账 ≠ lib 读数 ⇒ 报告自检非 0），两处读数分家时会当场判红。

## 两个方向（逐键对照表）

| 方向 | 名称 | 类型 | 含义 | 对端 |
| --- | --- | --- | --- | --- |
| 报告 → lib | `registry.mappedApiEntries` | 数 | 展开后被映射认领的计价条目数（方程的 A） | lib `coverageOf().mappedApiEntries` |
| 报告 → lib | `registry.declaredApiEntries` | 数 | 展开后被处置声明覆盖的计价条目数（方程的 B） | lib `coverageOf().declaredApiIdentities` |
| 报告 → lib | `registry.declaredApiEntryRows` | 数组 | 处置声明逐条留档（长度 = 声明条数） | lib `coverageOf().declaredApiEntries` |
| 报告 → lib | `gaps.declaredApiEntryCount` | 数 | 声明行数（= `declaredApiEntryRows.length`） | 无独立 lib 读数（由数组长度派生） |
| 报告 → lib | `gaps.unmappedModelCount` / `registry.unmappedModels.length` | 数 | 未判 C | lib `coverageOf().unmappedModelKeys.length` |
| lib → 报告 | `coverageOf().declaredApiEntries` | 数组 | 处置声明逐条留档 | 报告 `registry.declaredApiEntryRows`（**不是** `registry.declaredApiEntries`） |
| lib → 报告 | `coverageOf().declaredApiIdentities` | 数 | 展开后被处置声明覆盖的计价条目数 | 报告 `registry.declaredApiEntries`（**不是** `registry.declaredApiEntryRows`） |
| lib → 报告 | `coverageOf().mappedApiEntries` | 数 | 展开后被映射认领的计价条目数 | 报告 `registry.mappedApiEntries` |
| lib → 报告 | `coverageOf().unmappedModelKeys` | 数组 | 未判条目（逐行） | 报告 `registry.unmappedModels`（逐行）/ `gaps.unmappedModelCount`（计数） |

## 复现命令（本轮实测）

```bash
# 改前先快照两个文件（本轮的快照目录是 $TEMP/t29-before），改后用逐行 LCS 比对证明"只有注释行被改动"
node research/_raw/t25/diff-comment-only.cjs <快照目录>/coverage-report.js scripts/tools/coverage-report.js \
  <快照目录>/coverage-targets-selftest.js scripts/tools/coverage-targets-selftest.js
node scripts/tools/coverage-report.js --json    # 两次 stdout sha256 均 7e50e31df838c9667adf36aa741dd7a6d89b851f2ef64b1ce7a096fc61aeb751
node scripts/tools/coverage-targets-selftest.js # 96 项通过 / 0 项失败
node scripts/validate.js --strict               # exit 0
```
