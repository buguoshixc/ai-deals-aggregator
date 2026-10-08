# unavailable-dataset-build-crash-v1（t29）：两份变化日志不可用时构建不再崩在 Manifest

> 分支 `unavailable-dataset-build-crash-v1`（基于 `origin/master` `2416283`，先把 t14 的收尾补记 `d641d7f` cherry-pick 成 `0ad028c`）
> 交付：本文件 + `-self-audit.md` + `research/_raw/unavailable-dataset-build-crash-v1/`
> 范围：`scripts/tools/build-local.js`（+ `plan-history.js` / `api-plan-history.js` / `feeds.js` 未改）；`scripts/validate.js` **未碰**（captain 裁定 (b)）

## 0. 一句话结论

t27 收尾时发现的真缺陷已修：`plan-history.json` / `api-plan-history.json` **缺失或损坏**时，构建不再死在
`Cannot read properties of null (reading 'schemaVersion')`，而是照常 **exit 0**，页面 / Feed / Dataset Manifest
如实说「本次构建没有拿到…日志 —— 这不表示『没有变化』」（`availability: unavailable` + `updatedAt: null` + `updatedAtShape: null` + 说明）。
**正常形态产物零回归**：304 文件逐文件 sha256 全等（全树 `f964d6ba19…`，修复前后同一个）。三颗牙红→逐字节还原→绿。
**「损坏」形态只有 api 侧仍被 `scripts/validate.js` 挡下**（captain 裁定：只量不修）—— 读数与两个选项见 §7。

## 1. 根因（先只读定位，再改根因处）

三层，全部在**调用方**读法上，不在 loader：

1. **崩溃点**：`build-local.js` 的 Dataset Manifest 里 `plan-history` / `api-plan-history` 两条读的是
   `planHistoryStore` / `apiPlanHistoryStore`（`assemble()` 里的**便利变量**，按定义「日志不可用 ⇒ `null`」），
   而**总是可用**的如实空账本在 `planHistoryLoad.store`（`lib/plan-history.js:986` 的 `load()` 契约：
   `{ ...result, store: result.store || emptyStore() }`；`history-core.load()` 在缺失/损坏时返回 `store: null`）。
   隔壁 `deal-history` 那一条一直读的是 `historyStore.store` —— **它是参照**。
   ⇒ `schemaVersion: planHistoryLoad.store.schemaVersion` 等（两处，共 6 个字段）。
2. **缺失形态的第二道坎**：`selfCheck()` 里两处「`dist/<日志>` 与源逐字节相同」的自检在源不在时 `fail('缺少源 …')`，
   损坏时更会拿「如实空账本 vs 源字节」比较 ⇒ 必然不等。改成同一个 helper `checkPublishedLog()`：
   **可用 ⇒ 与源逐字节相同；不可用 ⇒ 产物必须就是如实空账本**（`startedAt: null` / 0 事件 / 0 基线）——
   不是整条跳过（跳过就放过了「产物里凭空冒出一个日期」这种坏法）。
3. **缺失形态的第三道坎**：自检里给页面级断言传的是「直接解析 `dist` 的那份账本」⇒ 不可用时得到一个
   **truthy 但零事件**的账本，模块以为日志可用，去要求一个本就不该存在的计数行 / 分栏。改成与**构建期同口径**的
   「日志视图」（`planLogSelf` / `apiPlanLogSelf` / `distLogView`）：不可用 ⇒ `null` ⇒ 模块走它的
   **「没有拿到日志」分支**（那条分支断言的是「页面必须说出没有拿到」，比计数对账更严）。5 处调用点全部对齐。
4. 变化雷达的两处分栏判据（`/changes/` 的套餐块与 API 块）：不可用时按纪律**只留那句说明**，
   所以判据反过来判 —— 说明必须在、**分栏标题与变化行一个都不许出现**（不可用 ≠ 没有变化）。

## 2. 夹具矩阵（9 形态 × 修复前后）

装置 `.arch-v1/fixtures/run-fixtures.cjs`：**锚点守卫**（未命中不落盘）+ **前置守卫**（源文件必须与 git HEAD 一致）
+ **退出时无条件还原**；每跑完一个形态核对 `sha256`（plan / api / deal 三个文件都 OK）。

| 夹具 | 修复前 | 修复后 | 修复后 · 措辞命中 | 修复后 · Manifest 登记 |
| --- | --- | --- | --- | --- |
| `plan-history` 缺失 | ❌ **TypeError**（Manifest 空指针） | ✅ **exit 0** | 6 个文件 | `plan-history(unavailable, updatedAt=null)` |
| `api-plan-history` 缺失 | ❌ 同上 | ✅ **exit 0** | 6 个文件 | `api-plan-history(unavailable, updatedAt=null)` |
| 两份都缺失 | ❌ 同上 | ✅ **exit 0** | 9 个文件 | 两条都 `unavailable / null` |
| `plan-history` 损坏 | ❌ 同上（validate 对 plan 不拦） | ✅ **exit 0** | 6 个文件 | `plan-history(unavailable, updatedAt=null)` |
| `api-plan-history` 损坏 | ❌ 构建失败（validate 先退出 1） | ❌ **同前**（见 §7） | — | — |
| 两份都损坏 | ❌ 同上 | ❌ 同前 | — | — |
| `deal-history` 损坏（对照） | ✅ exit 0（t7/PR #91 已修好） | ✅ exit 0 | 6 个文件 | `deal-history(unavailable, updatedAt=null)` |
| `deal-history` 缺失（对照） | ✅ exit 0 | ✅ exit 0 | 6 个文件 | 同上 |
| 三份都损坏 | ❌ 构建失败 | ❌ 同前 | — | — |

**「没有拿到」逐字命中位置**（`plan-history` 缺失，6 个文件）：`changes/index.html`（1）· `index.html`（1）·
`plans/index.html` · `plans/coding/index.html` · `feed/plans/coding/changes.xml` · `feed/plans/coding/changes.json`；
两份都缺失时 9 个文件（再加 `plans/api/index.html` 与 API 那两份 feed）。**「没有变化」的措辞一个都没出现**
（判据是措辞逐字比对，不是人眼）。

## 3. 正常形态零回归

| 读数 | 值 |
| --- | --- |
| 基线（同提交、修复前 `build-local.js`） | 304 文件 · 全树 `f964d6ba19421219…` |
| 修复后 | 304 文件 · 全树 **`f964d6ba19421219…`（同一个）** |
| 逐文件对照 | **changed 0 / added 0 / removed 0** |

## 4. 牙（三颗，全部实跑变红 → 逐字节还原 → 复跑绿）

| # | 把什么改回去 / 注入了什么 | 红读数（断言名原文） | 还原 | 绿 |
| --- | --- | --- | --- | --- |
| T1 | manifest 两条改回读**便利变量**（修复前写法） | `❌ 构建失败：TypeError: Cannot read properties of null (reading 'schemaVersion')` | 源码 + 夹具双 `sha256` 一致 | exit 0 |
| T2 | 自检的日志视图改回「直接解析 dist」（truthy 零事件账本） | `✗ 套餐对比页未通过诚实性断言：Claude Pro: 没有变更记录时未写「暂无变更记录」…` | 同上 | exit 0 |
| T3 | 在「不可用」的发布分支里把 `startedAt` 换成构建日（**伪造日期**） | `✗ dist/plan-history.json 不是如实空账本（源日志不可用：文件缺失）——不可用时不拿任何日期顶替，产物必须与内存里那份空账本逐字节相同` | 同上 | exit 0 |

T3 是「不伪造日期」这条红线的机器化版本：它证明「产物 = 如实空账本」是**逐字节**判的。

## 5. 断言数（同工作树对照，只增不减）

| 套件 | 修复前 | 修复后 |
| --- | ---: | ---: |
| 构建期自检项（`=== 4) 产物自检 ===` 段的 ✓ 行） | 73 / 0 红 | **73 / 0 红** |
| `selftest:plans` | 264 / 0 | **264 / 0** |
| `selftest:feeds` | 145 / 0 | **145 / 0** |
| `selftest:changes` | 119 / 0 | **119 / 0** |
| `verify:seo` | 19 / 0 | **19 / 0** |
| `verify-site`（真浏览器） | 883 / 0（见下） | **883 / 0** |

> `verify-site` 的「改前」一栏是**推断**，不是实跑：正常形态产物**逐字节相同**（§3 的 304 文件 0 变化）
> 且 `verify-site.js` 一个字节未改 ⇒ 项数必然相同（883）。其余各行都是同工作树实跑读数。

> 说明：本任务**没有改任何判据文件**（`verify-site.js` / `seo-verify.js` / 各 selftest 的 `git diff` 为空），
> 所以项数必然不变；上表是实跑核对，不是推断。

## 6. 门禁读数

| 命令 | 读数 |
| --- | --- |
| `npm run build` | exit 0 · 304 文件 · 自检 73 项全过 |
| `node scripts/tools/verify-site.js --dir=dist` | **883 项 / 0 失败**（真浏览器） |
| `npm run selftest:plans` / `selftest:feeds` | 264 / 0 · 145 / 0 |
| `npm run check:evidence` | ✅ 绿（无新增 Tier-3） |
| `npm run gate` | 见 PR 描述（本机全链） |

## 7. 留给 captain 的政策问题：「损坏」形态的对称性

三份日志**损坏**时的读数**不对称**：

| 日志 | 损坏时的阻断点 | 结果 |
| --- | --- | --- |
| `deal-history.json` | 无（validate 没有对应解析检查；构建侧 t7 已按「如实不可用」处理） | **exit 0** |
| `plan-history.json` | 无（`scripts/validate.js` 只把它当**文本**扫引文自证词，不解析 JSON） | **exit 0** |
| `api-plan-history.json` | **`scripts/validate.js:688–690`** 的 `checkApiPlanHistoryFile()`：`if (loaded.broken) error('api-plan-history.json 解析失败：…')` | **exit 1**（构建在 `runValidate()` 就停） |

（同处 `validate.js:684–686` 对**缺失**只是 `warn(...)` —— 这也解释了为什么「缺失」三形态能走到构建期，
而「损坏」的 api 侧走不到。）

两个选项与后果：

- **(a) 损坏 ⇒ 与缺失同处置（warn）**：三份日志对称，`api-plan-history` 损坏时页面能如实说「没有拿到」。
  代价 = 判据政策变更：`validate.js` 的这条 error 是**发布前校验**的一部分，改成 warn 等于承认
  「我们自己的数据坏了也可以发布（只要页面如实说没拿到）」。
- **(b) 保持现状（本次裁定）**：api 侧 fail-closed。三份日志**不对称** —— 但三条不对称都在
  「数据损坏」（我们自己的问题）这一侧，缺失（上游没产出）三形态已经全部对称地诚实上线。

我的**建议**：保持 (b)，并把这条不对称**写进登记**（一句话：`validate.js` 只对 api-plan-history 做损坏 fail-closed，
理由是那条日志是 v2.5 才启用的、与 `api-plans.json` 有自洽判据；deal/plan 侧没有同源判据）。若将来要 (a)，
改动面是 `validate.js:688–690` 一处 + `check:api-plan-history`（另一个 npm 步骤）要不要一起放宽 —— 那是政策任务，不是本实现任务。

## 8. 复现命令

```powershell
cd .worktrees/unavailable-dataset-build-crash-v1
npm ci; npm run build                    # 正常形态：304 文件 / 全树 f964d6ba19…
node .arch-v1/fixtures/run-fixtures.cjs --phase=after-all   # 9 形态矩阵（自动还原 + sha256 核对）
node .arch-v1/teeth/run-teeth.cjs                            # 三颗牙（红 → 还原 → 绿）
node .arch-v1/make-evidence-t29.cjs                          # 重建 research/_raw/unavailable-dataset-build-crash-v1/
node scripts/tools/verify-site.js --dir=dist; npm run gate
```

## 9. 未验证 / 边界

1. **api 侧「损坏」不修**（captain 裁定）⇒ 该形态仍 exit 1；本任务只给了精确阻断点与对称性读数。
2. **`archive-detail` 一类的 0 实例页面族**与本任务无关，未触碰。
3. **没有跑 CI 之外的线上复核**（产物零回归已由逐文件 sha256 证明，线上不需要重新部署验证）。
4. **`research/_raw/unavailable-dataset-build-crash-v1/` 里没有 `.js` 探针**：装置全在 `.arch-v1/`（Tier-3）；
   按 t14 裁定，若日后要入库，需在 README 里逐文件写用途并让报告引用。
