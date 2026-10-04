# t45 · §41 / §42 逐项核对（只读）

- 任务：t45 `research-firstparty`（attempt 2，attempt_id `09397700-d8c3-4682-8b07-984026c44dce`）
- 工作目录：`.worktrees/coverage-expansion-v1`（分支 `coverage-expansion-v1`，基线 `a4dd40f`）
- 核对时间：2026-10-04（Asia/Shanghai）
- 边界：**只读**。本任务没有改报告代码、没有改数据、没有改登记表、没有改任何人的产物；新写的文件全部落在 `research/_raw/t45/`。
- 题面出处：`D:\AI_DEALS_COVERAGE_EXPANSION_V1_PROMPT.md` 的 `# 41` / `# 42` 两节（用 `Select-String -Pattern '^# 4[12]' -Context 0,60` 抄录）。

## 0. 现场读数（本轮实测，全部可复跑）

| 项 | 值 |
|---|---|
| `npm run report:coverage`（= `node scripts/tools/coverage-report.js`，`package.json` 里逐字如此） | **exit 0** · stdout **38240 B** = npm banner **86 B** + 报告正文 **38154 B**；从第一条分隔线起与直接运行**逐字节相同** |
| 报告正文（纯文本模式） | 390 行 · **38154 B** · sha256 `13e581ea5a7b4bf7f8c66c02a656413d6833515a9b2ec16907acc8ca3e3836f1` |
| `node scripts/tools/coverage-report.js --json`（第 1 次） | **exit 0** · stdout **189628 B** · sha256 `7e50e31df838c9667adf36aa741dd7a6d89b851f2ef64b1ce7a096fc61aeb751` |
| 同上（第 2 次） | **exit 0** · stdout **189628 B** · sha256 **完全相同** ⇒ 逐字节一致 |
| `--json` 输出布局（块级） | 文本报告（0–25699）→ 第一个 JSON 块 = **策略快照**（at 25700、478 B、顶层键 `schemaVersion/unit/defaultTier/tiers`）→ 第二个 JSON 块 = **载荷**（at 26355、151466 B、顶层键 `generatedAt/deals/coding/api/registry/gaps/candidates/coverageTargets`）→ 收尾行 `✅ 覆盖报告自检通过（0 处问题）。` |
| 载荷 JSON 段（第二个块，按 t39 `collect.cjs` 的括号配对口径切） | **151466 B** · sha256 `7dd8cc8f0847bb7d0bb98ec57145f9f9ea5e5716fb290158f58a2044715eff7f` |
| `node scripts/tools/coverage-targets-selftest.js` | **exit 0** · `96 项通过，0 项失败` |
| 报告自检 | 文本末行 `报告自检问题：0 处` + `✅ 覆盖报告自检通过（0 处问题）。`（exit 0） |
| 文本 ↔ JSON 同源交叉核对 | **29/29 项数值一致**；分维度七态 **28/28 格一致**；每维度七态和 **34/34/34/34**（= 34 家 target） |

产物（全部在 `research/_raw/t45/`）：`report-text.txt`（纯文本、Node 写的原始字节）、`report-json-1.txt` / `report-json-2.txt`（两次 `--json` 原始字节）、`report-npm-text.txt` / `report-npm-body.txt`（npm 路径）、以及 7 个只读探针脚本 `*.cjs`。

> 编码说明：PowerShell 5.1 的 `>` 会把 stdout 写成 UTF-16（本轮第一次落盘就是 `FF FE …`），字节级对拍会被编码污染。因此所有落盘与哈希都在 **Node 进程内**完成（`spawnSync` 拿原始 buffer），npm 那条用 `cmd /c "… > 文件"` 保留原始字节。

> 并发写者说明（determinism 的可信度前提）：本轮快照时刻 = **21:46:17**。报告读的五个输入文件在该时刻之前最后一次写入，运行期间未变：`deals.json` 18:34:24 · `plans.json` 20:43:52 · `api-plans.json` 20:46:41 · `models.json` 19:55:21 · `scripts/data/coverage-targets.json` 20:42:39。同一时段仓库里确有**队友并发写者**，但都不是报告读的文件：`research/_raw/coverage-expansion-v1/t18-*.json|md`（21:40–21:53）、`scripts/tools/feeds-selftest.js`（21:51:43）、`scripts/tools/history-nonempty-e2e.js`（21:55:14，已在本轮快照之后）。⇒ 两次 `--json` 是在**同一份输入**上跑的，determinism 的结论成立；本文件的所有数字都钉在 21:46:17 这份快照上（`git status` 里那六项已跟踪改动 —— t18 ×3 · t41 ×1 · `feeds-selftest.js` · `history-nonempty-e2e.js` —— **不是本任务产物**，本任务只写 `research/_raw/t45/`）。

---

## 1. 题面 §41 / §42 逐条抄录（不改写、不合并、不省略）

**`# 41. Coverage Report v2`**

> 扩展当前：`npm run report:coverage`
> 至少增加：
>
> ```
> Target Provider Universe
> Provider coverage by dimension
> Current Model Coverage
> Current / Aging / Legacy / Historical / Unknown model counts
> Missing Current Targets
> Unverifiable Providers
> Deferred Complexity Providers
> Source Health impact
> ```
>
> 继续保留旧能力：
>
> ```
> Deals
> Coding Plans
> API Pricing
> Model Registry mapping gaps
> candidate source review
> ```

**`# 42. report:coverage --json`**

> 机器可读输出也要同步。
> 输出必须 deterministic。
> 相同数据：> 输出逐字节一致。

---

## 2. §41「至少增加」8 条 —— 逐条载体与判定

### R1 Target Provider Universe —— ✅ 完整

- **文本载体**：第 220 行 heading `── Target Provider Universe（覆盖意图层 · v2）───────────────────────`；数字在第 221–227 行：

```
  Target 行数                      34   scripts/data/coverage-targets.json 的人工意图行数（身份层与意图层双向对账）
  providers.json 身份数             34   缺一行即报告红：身份层与意图层不许分家
  有数据的 Target                    34   四个维度里至少一格有盘上记录
  一条数据都没有的 Target                 0   意图已立、事实为零（…）
  tier 分布：core=11（核心） · major=18（重要） · long-tail=5（长尾）
  role 分布：model-developer=15 · inference-platform=6 · coding-product=10 · tool-vendor=3 · directory=0
  reviewedAt：2026-10-04
```

  逐行清单在第 228–262 行（34 行，每行 `provider / 名称 / tier / role / 状态 / 适用维度 x/4 · 已覆盖 y/4`）。
- **JSON 键路径与取值**：
  - `coverageTargets.universe.declared` = **34**
  - `coverageTargets.universe.providersRegistered` = **34**
  - `coverageTargets.universe.withData` = **34**
  - `coverageTargets.universe.withoutAnyData` = **[]**（长度 0）
  - `coverageTargets.universe.undeclaredProviders` = **[]**
  - `coverageTargets.universe.tiers` = `{core:11, major:18, long-tail:5}`
  - `coverageTargets.universe.roles` = `{model-developer:15, coding-product:10, inference-platform:6, tool-vendor:3}`
  - `coverageTargets.universe.providers` = 数组(34)；另有 `coverageTargets.file / present / schemaVersion(1) / reviewedAt("2026-10-04") / validationProblemCount(0) / validationProblems([])`
- **判定**：题面条目名在 heading 里**逐字出现**；文本有数字、JSON 有键路径，且两处数值逐项一致。

### R2 Provider coverage by dimension —— ✅ 完整（标题为中文）

- **文本载体**：第 264 行 heading `── 分维度覆盖（provider × 维度 · 派生七态 · v2）──────────────────────`；每维度一行 7 态（第 265–268 行），第 269–304 行是 34×4 矩阵：

```
  Deals 优惠（deals）：COVERED=23 · PARTIAL=0 · MISSING=1 · DEFERRED=0 · UNVERIFIABLE=0 · NOT_APPLICABLE=10 · BLOCKED_SOURCE=0
  Coding 套餐（coding）：COVERED=16 · PARTIAL=1 · MISSING=5 · DEFERRED=0 · UNVERIFIABLE=1 · NOT_APPLICABLE=11 · BLOCKED_SOURCE=0
  API 计费（api）：COVERED=14 · PARTIAL=0 · MISSING=7 · DEFERRED=1 · UNVERIFIABLE=1 · NOT_APPLICABLE=11 · BLOCKED_SOURCE=0
  模型身份（models）：COVERED=11 · PARTIAL=0 · MISSING=4 · DEFERRED=1 · UNVERIFIABLE=0 · NOT_APPLICABLE=18 · BLOCKED_SOURCE=0
```

- **JSON 键路径与取值**：
  - `coverageTargets.stateOrder` = `["COVERED","PARTIAL","MISSING","DEFERRED","UNVERIFIABLE","NOT_APPLICABLE","BLOCKED_SOURCE"]`
  - `coverageTargets.dimensions.deals|coding|api|models` 各为 7 态对象（取值同上）
  - `coverageTargets.rows` = 数组(**136** = 34 家 × 4 维度)，每行字段 `provider / name / tier / role / dimension / state / present / currentPresent / declared / resolved / reason`（例：`rows[0]` = `{"provider":"ai360","name":"360智脑","tier":"long-tail","role":"model-developer","dimension":"deals","state":"COVERED","present":1,"currentPresent":1,"declared":0,"resolved":0,"reason":"有 1 条记录（未声明更细的 current target）"}`）
  - `coverageTargets.states` = 全局七态（`COVERED 64 · PARTIAL 1 · MISSING 17 · DEFERRED 2 · UNVERIFIABLE 2 · NOT_APPLICABLE 50 · BLOCKED_SOURCE 0`，和 136）
- **判定**：完整。文本 4 行 × 7 态与 `dimensions.*` **逐格一致（28/28）**，每维度七态和 **34**（等于 target 家数）。

### R3 Current Model Coverage —— ✅ 完整

- **文本载体**：第 364 行 heading `── Current Model Coverage（v2）──────────────────────────────────────`；第 365–369 行：

```
  声明的 current target 模型          20   兑现 20 条（registrySlug 必须存在，指向不存在的模型一律红）
  unknown release dates          40   registry 共 44 个模型里 releasedAt 为空/缺的（逐条：claude-fable-5.1, …）
  legacy / historical 保留          1   仍在 registry 与发布产物里（未删除）：deepseek-v3.2(legacy)
  来源层 status=retired              0   （无）
  归属不到 Target provider 的 registry 模型      0   这些模型从覆盖宇宙里够不到（…）
```

- **JSON 键路径与取值**：`coverageTargets.currentModels.declaredTargets` = 20 · `.resolvedTargets` = 20 · `.declared` = 数组(20)（如 `{provider:"aliyun",providerName:"阿里云",slug:"qwen3-max",resolved:true,reason:null}`）· `.unresolved` = [] · `.registryModels` = 44 · `.modelsByProvider` = 11 个 provider 的模型清单 · `.unknownReleaseDates` = 数组(40) · `.releasedAtLanded` = true · `.legacyOrHistorical` = 数组(1) · `.legacyOrHistoricalLanded` = true · `.retiredInSource` = [] · `.registryDevelopersWithoutProvider` = []
- **判定**：完整（题面条目名在 heading 里逐字出现）。

### R4 Current / Aging / Legacy / Historical / Unknown model counts —— ❌ **缺（本轮唯一的实质缺项）**

- **文本载体**：**没有这一节**。全文检索（`catalogStatus` / `current 模型` / `Current 模型` / `目录状态`）**零命中**；`aging` 只作为 `MODEL_FRESHNESS_POLICY` 里的字段名出现在第 383 行的策略快照里，**没有任何计数**。最接近的三行是：

```
  unknown release dates          40   registry 共 44 个模型里 releasedAt 为空/缺的（…）      ← 这是 releasedAt 口径，不是 catalogStatus=unknown 的普查
  legacy / historical 保留          1   仍在 registry 与发布产物里（未删除）：deepseek-v3.2(legacy)   ← legacy 与 historical 两桶被合并
  来源层 status=retired              0   （无）                                        ← 这是来源层 status，不是 catalogStatus=historical
```

  即：**current / aging / historical 三个桶全文没有任何计数行**，unknown 用的是一个**不同定义的指标**（releasedAt 为空），legacy 与 historical 被合并成一行。
- **JSON 键路径与取值**：**没有 catalogStatus 计数键**。相关的只有：
  - `coverageTargets.currentModels.unknownReleaseDates` = 数组(40)（releasedAt 口径）
  - `coverageTargets.currentModels.legacyOrHistorical` = 数组(1)，元素 `{"slug":"deepseek-v3.2","catalogStatus":"legacy","catalogReason":"outranked-beyond-aging-window"}`（只有 retained 的那 1 条带 `catalogStatus`，其余 43 条没有）
  - `coverageTargets.freshness.catalogStatuses` = `["current","aging","legacy","historical","unknown"]`（**只是词表，没有计数**）
  - `coverageTargets.freshness.defaultVisible` = `["current","aging","unknown"]` / `.defaultHidden` = `["legacy","historical"]`（同上，只有词表）
- **独立复算（本任务自己从 `models.json` 派生产物算，不读报告代码）**：`catalogStatus` 普查 = **current 3 · aging 0 · legacy 1 · historical 0 · unknown 40**（和 44）；`modelRole` 普查 = `general 24 · fast 6 · vision 8 · other 2 · embedding 1 · translation 2 · coding 1`。这与 t14 补充证据里记的「unknown 40 / current 3 / legacy 1」一致。
- **差在哪（本任务的核心结论）**：**数据在盘上（`models.json` 每行都有 `catalogStatus`），派生逻辑也在（`lib/model-freshness.js`），但报告层没有任何一处把它做成普查**。5 个桶里 **3 个（current / aging / historical）完全没有载体**，另 2 个是用「别的口径」的替身（unknown↔releasedAt、legacy+historical 合并）。这不是「数字错」，是**题面点名要的条目在交付物里没有对应行**。

### R5 Missing Current Targets —— ✅ 完整（标题为中文）

- **文本载体**：第 306 行 heading `── 真缺口：MISSING targets（可覆盖、未延期、来源健康，但盘上一条记录都没有）──`；第 307–323 行共 **17** 条，每条给 `provider（key）维度：声明的 current target N 条 / 盘上 M 条 —— 理由`。原文样例：

```
  · 360智脑（ai360） API 计费：声明的 current target 1 条 / 盘上 0 条 —— 声明的 1 条 current target 一条都没兑现，且该维度没有任何记录
  · 阶跃星辰（stepfun） API 计费：声明的 current target 2 条 / 盘上 0 条 —— 声明的 2 条 current target 一条都没兑现，且该维度没有任何记录
```

- **JSON 键路径与取值**：`coverageTargets.missingTargets` = 数组(17)，每条 `{provider,name,dimension,state:"MISSING",declared,present,resolved,reason,items[]}`（例：`{"provider":"ai360","name":"360智脑","dimension":"coding","state":"MISSING","declared":0,"present":0,"resolved":0,"reason":"可覆盖、未延期、来源健康，但盘上一条记录都没有","items":[]}`）
- **判定**：实质完整；**但标题不含题面英文条目名**（`Missing Current Targets`），grep 英文条目名会漏。

### R6 Unverifiable Providers —— ✅ 完整（标题为中文）

- **文本载体**：第 333 行 heading `── 有理由的缺口 ②：UNVERIFIABLE（查过，官方来源不可核）──────────────`；第 334–335 行共 **2** 条：

```
  · 扣子 Coze（coze） API 计费：人工裁决不可核：本轮没有找到扣子官方公开的 API 按量计费价目页（站内只有订阅档位），核不出可诚实表达的定价
  · 科大讯飞（iflytek） Coding 套餐：人工裁决不可核：本轮没有找到科大讯飞官方公开的编程订阅套餐价目页（只有 API 计费与消费端会员），核不实它在 coding 维度是否有可覆盖的对象
```

- **JSON 键路径与取值**：`coverageTargets.unverifiable` = 数组(2)，每条形如 `{provider,name,dimension,state:"UNVERIFIABLE",declared,present,resolved,reason,items[]}`
- **判定**：实质完整（含「为什么不可核」的理由）；标题不含题面英文条目名。

### R7 Deferred Complexity Providers —— ✅ 完整（标题为中文）

- **文本载体**：第 329 行 heading `── 有理由的缺口 ①：DEFERRED（人工裁决延期 —— **永不算 MISSING**）────`；第 330–331 行共 **2** 条（每条带**复查条件**）：

```
  · Microsoft（microsoft） API 计费：人工裁决延期：Azure OpenAI 按区域分档、按币种定价，… （复查条件：当 API 层决定支持区域分档定价，或明确裁决不纳入 Azure 时复查）
  · 商汤科技（sensetime） 模型身份：人工裁决延期：日日新当前线（6.8 Flash Lite / U1.5 Lite）… （复查条件：当 scripts/data/models.json 里出现第一个 Sensetime 归属的 registrySlug 时）
```

- **JSON 键路径与取值**：`coverageTargets.deferred` = 数组(2)（同上形状）；另有 `coverageTargets.partialTargets`(1)、`coverageTargets.notApplicable`(50)、`coverageTargets.blockedBySourceHealth`(0)
- **判定**：实质完整；标题不含题面英文条目名。

### R8 Source Health impact —— ✅ 完整（但宇宙是「声明来源」）

- **文本载体**：第 371 行 heading `── Source Health impact（v2）────────────────────────────────────────`；第 372–377 行：

```
  声明的来源数                          5   意图层里写过的 deals source（source-health 的 name 或 deals.json 出现过的 source）
  · 阿里云百炼  healthy（连续失败 0）  影响：aliyun 的 deals
  · 百度千帆  healthy（连续失败 0）  影响：baidu 的 deals
  · 火山方舟  healthy（连续失败 0）  影响：volcengine 的 deals
  · 智谱AI  healthy（连续失败 0）  影响：zhipu 的 deals
  · 智谱AI活动页  healthy（连续失败 0）  影响：zhipu 的 deals
```

- **JSON 键路径与取值**：`coverageTargets.sourceHealth.declaredSources` = 数组(5)（每条含 `name / health{source,status,reason,consecutiveFailures} / status / reason / consecutiveFailures / observedDeals / targets[] / dimensions[]`）· `.unhealthyDeclaredSources` = [] · `.blockedTargets` = []
- **判定**：完整，**且题面条目名在 heading 里逐字出现**。口径边界见 F5（宇宙 = 意图层声明来源 5 个；`scripts/data/source-health.json` 里共 **9** 行）。

### §41 增加项小结

| # | 题面条目 | 文本 | JSON | 判定 |
|---|---|---|---|---|
| R1 | Target Provider Universe | L220–262 | `coverageTargets.universe.*` | ✅ |
| R2 | Provider coverage by dimension | L264–304 | `coverageTargets.dimensions.*` + `rows[136]` | ✅ |
| R3 | Current Model Coverage | L364–369 | `coverageTargets.currentModels.*` | ✅ |
| R4 | Current / Aging / Legacy / Historical / Unknown model counts | **无** | **无** | ❌ **缺** |
| R5 | Missing Current Targets | L306–323 | `coverageTargets.missingTargets[17]` | ✅（标题中文） |
| R6 | Unverifiable Providers | L333–335 | `coverageTargets.unverifiable[2]` | ✅（标题中文） |
| R7 | Deferred Complexity Providers | L329–331 | `coverageTargets.deferred[2]` | ✅（标题中文） |
| R8 | Source Health impact | L371–377 | `coverageTargets.sourceHealth.*` | ✅ |

---

## 3. §41「继续保留」5 条 —— 逐条载体与判定

| # | 旧能力 | 文本载体（原文行） | JSON 键路径与取值 | 判定 |
|---|---|---|---|---|
| K1 | **Deals** | L9–13：`provider 数（仅 type=deal） 31` / `工具行厂商数（对照，不计入） 52` / `当前优惠数 80` / `工具条目数 55` | `deals.providers`=31 · `.currentDeals`=80 · `.expiredDeals`=0 · `.tools`=55 · `.providerRows`=数组(31) | ✅ |
| K2 | **Coding Plans** | L15–17：`provider 数 18` / `plan 数 37` | `coding.providers`=18 · `.plans`=37 · `.providerRows`=数组(18) | ✅ |
| K3 | **API Pricing** | L19–22：`provider 数 14` / `pricing records 17` / `model pricing items 93   去重 modelKey 66 个` | `api.providers`=14 · `.pricingRecords`=17 · `.modelPricingItems`=93 · `.distinctModelKeys`=66 · `.providerRows`=数组(14) | ✅ |
| K4 | **Model Registry mapping gaps** | L24–33（含方程行 L30 `API 侧记账：计价条目 93 条 = 已映射认领 81 + 已处置声明 12 + 未判 0`）+ 缺口3（L62–64）+ 缺口5（L144–145）+ 套餐侧「已声明不对应单一模型身份」42 条（L147–189）+ API 侧 12 条（L191–203） | `registry.{registryPresent,linksPresent,gapsPresent}`=true/true/true · `.planModelStrings`=55 · `.mappedPlanModelCount`=13 · `.declaredPlanModels`=数组(42) · `.mappedApiEntries`=81 · `.declaredApiEntries`=12 · `.declaredApiEntryRows`=数组(12) · `.unmappedModels`=[] · `.unmappedPlanModels`=[]；`gaps.dealsWithoutPlans`=数组(18) · `.plansWithoutDeals`=数组(5) · `.unmappedModelCount`=0 · `.unmappedPlanModelCount`=0 · `.declaredPlanModelCount`=42 · `.declaredApiEntryCount`=12 · `.notAdoptedProviders`=数组(13) | ✅ |
| K5 | **candidate source review** | 缺口4（L66–142）：**21** 条未采信来源，逐条给 URL + 检查日期 + `JS/登录/动态分页/已下线/信息不全` 标志 + 失败原因；已采信清单（L205–218）：**13** 条，逐条给 provider + URL + 日期；收尾 L387 `候选登记表：40 条（已采信 13 / 未采信 21）` | `candidates`=`{total:40, adopted:13, notAdopted:21}`（**只有计数**）· `gaps.notAdoptedProviders`=数组(13)（**只有厂商显示名**，如 `"百川智能 Baichuan"`，无 URL / 无检查日期 / 无失败原因）。量化：JSON 里 `http(s)://` **0** 次 / `检查日期` **0** 次 / `失败原因` **0** 次，文本分别是 **34 / 21 / 21** 次 | ✅ 文本在位；**JSON 只到计数级** → 见 F2 |

---

## 4. §42 逐条核对

| §42 要求 | 核对方式 | 结果 |
|---|---|---|
| 「机器可读输出也要同步」 | 同一条命令的 stdout 里既有完整文本报告，也有载荷 JSON | ✅ 文本 0–25699 → 策略快照 JSON（25700）→ 载荷 JSON（26355）→ 收尾行 |
| 文本部分与纯文本模式同源 | 逐字符比较 `--json` 前缀 vs 纯文本模式 | ✅ 公共前缀 **26349** 字符；`--json` 的前缀 == 纯文本（收尾行 `✅ …` 搬到末尾，其余逐字节相同） |
| 文本数字 ↔ JSON 值 一致 | 29 项正则抽取对拍 + 分维度七态 28 格逐格对拍 | ✅ **29/29 通过 · 0 失败；28/28 格一致**；每维度七态和 = 34 |
| 「输出必须 deterministic」「相同数据：输出逐字节一致」 | 连续两次 `--json`，Node 内取原始 buffer 比对 | ✅ 两次均 **189628 B**，sha256 均 `7e50e31df838c9667adf36aa741dd7a6d89b851f2ef64b1ce7a096fc61aeb751`，`Buffer.equals` = true |
| 机器可读是否**面面**同步（§42 的实质） | 逐节比对「文本里有、JSON 里有没有」 | ⚠️ **K5 候选来源明细不同步**（见 F2）；R4 连文本都没有（见 F1） |

### 4.1 与 t25 / t39 记录的 sha256 对拍

| 记录方 | 记录内容（原文） | 本轮复跑 | 结论 |
|---|---|---|---|
| **t25** `research/_raw/t25/naming-caveat.md` L33 | ``node scripts/tools/coverage-report.js --json    # 两次 stdout sha256 均 7e50e31df838c9667adf36aa741dd7a6d89b851f2ef64b1ce7a096fc61aeb751`` | stdout sha256 = `7e50e31df838c9667adf36aa741dd7a6d89b851f2ef64b1ce7a096fc61aeb751` | ✅ **逐字相同**（64 位全同） |
| **t25** 同文件 L34 | `coverage-targets-selftest.js # 96 项通过 / 0 项失败` | `96 项通过，0 项失败`，exit 0 | ✅ 相同 |
| **t39** `research/_raw/t39/report-inputs.md` L169 / L246 | 「stdout sha256 `7e50e31df838c966…`」 | 同上前缀 | ✅ 相同（与 t25 同一值） |
| **t39** 同上 L169 | 「JSON 段 sha256 `72b2bab384489e1a…`」 | **无法复现** | ⚠️ 见 F4 |

**F4 的取证过程（不许含糊，所以把试过的口径全列出来）**：在**同一份** stdout 字节上，对「JSON 段」尝试了 **31 种定义**，无一命中 `72b2bab384489e1a…`：

1. 载荷块原样 slice（t39 `collect.cjs` 的括号配对口径）= `7dd8cc8f…`
2. 载荷块 + `\n` = `091bbb47…`；3. 载荷块 + `\r\n` = `afc18894…`；4. 载荷块去外括号 = `dc82a2ce…`
5. `JSON.stringify(载荷)` = `fa15c7b8…`；6. `+ '\n'` = `12d5e08b…`；7. `JSON.stringify(载荷, null, 2)`（与 1 相同）= `7dd8cc8f…`；8. 4 空格缩进重排 = `e1ae0d90…`
9. 从载荷起点到文件尾 = `8e2ea353…`；10. 从策略块起点到文件尾 = `364dc514…`；11. 两 JSON 块之间的文本 = `c8a4f835…`；12. 策略块原样 = `3140460c…`；13. 整个 stdout = `7e50e31d…`
14. 载荷 UTF-16LE = `762a968e…`；15. 载荷 UTF-16LE+BOM = `df30ae82…`；16. 载荷 sha256 再 sha256 = `e4316d5f…`；17. 键排序规范化 = `045f61bf…`；18. 逐字段哈希拼接 = `3d988a97…`
19. `coverageTargets` pretty = `9b1bcc7f…`；20. compact = `230597b5…`；21. 去掉 coverageTargets 的载荷 = `b793a1a6…`
22. 策略+载荷首尾相接 = `4814d0dc…`；23. 中间加 `\n` = `dc52bb23…`；24. 载荷 + 收尾行 = `d4720fad…`；25. 长度前缀 + 载荷 = `eef10087…`
26. CRLF 规范化后的 stdout = `7e50e31d…`（无 CR，与 13 同）；27. CRLF 规范化后的载荷 = `7dd8cc8f…`
28. 收尾行 trim 拼接变体 = `d4720fad…`；29. `'no-json'` 占位 = `63f3a454…`；30. 载荷去尾换行 + `\n` = `091bbb47…`；31. 空内容 = `e3b0c442…`

**结论（两条事实，分开说）**：
- 事实一：**determinism 本身成立且可独立复现** —— 两次 `--json` stdout 逐字节一致，且与 **t25 记录的 64 位全串**和 **t39 记录的 stdout 前缀**完全吻合。所以 §42 的「输出逐字节一致」**没有被违反**。
- 事实二：**t39 记的那个「JSON 段 sha256」不是一个可复现的口径** —— 它既不是载荷块、也不是任何常见的子对象/编码/拼接形式（31 种都试过）。它**不应当被当作 determinism 基线引用**（t20 若引用，须只引 stdout 的 sha256）。建议由 t39 的所有者以 append-only 方式补上当时的切块函数与命令，或改为引用本文件的可复跑口径（载荷段 = `7dd8cc8f0847bb7d0bb98ec57145f9f9ea5e5716fb290158f58a2044715eff7f`）。

---

## 5. 缺项与半成品清单（本任务的交付重点）

> 严重度按「对题面 §41/§42 的违例程度」定，不按修复难度定。修复另派（本任务只读）。

### F1 [high] §41 第 4 条「Current / Aging / Legacy / Historical / Unknown model counts」在文本与 JSON 里都没有载体

- **差在哪**：5 个桶里 **3 个（current / aging / historical）全文没有任何计数行**；`unknown` 用一个**不同定义**的指标顶替（`unknown release dates` = releasedAt 为空，当前数值 40 恰好与 `catalogStatus=unknown` 的 40 相同，**这是巧合而不是同一件事**）；`legacy` 与 `historical` 被合并成一行 `legacy / historical 保留 1`（且该行的语义是「仍在 registry 与发布产物里」，不是普查）。JSON 侧同样没有普查键：只有 `coverageTargets.currentModels.unknownReleaseDates[40]` / `.legacyOrHistorical[1]` 与 `coverageTargets.freshness.catalogStatuses`（**词表，无计数**）。
- **证据**：文本 L364–369（见 R4）；JSON 键清单（`currentModels` 的 12 个键里没有 census）；全文检索 `catalogStatus` / `current 模型` / `目录状态` = 0 命中。
- **独立复算的应有值**：`current 3 · aging 0 · legacy 1 · historical 0 · unknown 40`（和 44）。
- **为什么这是缺项而不是「没数据」**：`scripts/data/models.json` 每行都已带 `catalogStatus`，`scripts/lib/model-freshness.js` 是它的唯一派生来源，报告也已经 import 了该模块（`coverageTargets.freshness` 块）。缺的是**报告层把词表变成一个计数行**——数据与逻辑都在位。
- **建议修复方向（不实施）**：在 `coverageTargets` 下新增一个五态普查对象（键名仿 `dimensions`），文本在 `Current Model Coverage` 一节加一行 `catalogStatus 普查：current N · aging N · legacy N · historical N · unknown N（和 = registry 模型数）`，并加一条硬断言「五态和 == `registryModels`」（否则报告自检非 0），配套进 `coverage-targets-selftest.js` 的追加键白名单。

### F2 [medium] §42「机器可读输出也要同步」在半条上没做到：候选来源审查的**明细**只在文本里

- **差在哪**：文本 L66–142 有 **21** 条未采信来源，逐条给 `URL + 检查日期 + JS/登录/动态分页/已下线/信息不全 标志 + 失败原因`；文本 L205–218 有 **13** 条已采信候选，逐条给 `provider + URL + 日期`。JSON 侧只有 `candidates{total:40, adopted:13, notAdopted:21}`（**纯计数**）与 `gaps.notAdoptedProviders`（数组(13)，**只有厂商显示名**，例如 `"百川智能 Baichuan"`）。⇒ **拿 JSON 无法还原任何一条候选的 URL、检查日期或未采信原因**，而这正是「candidate source review」这项旧能力的全部内容。
- **证据（量化，本轮实测）**：整个 JSON 载荷里 `http(s)://` 出现 **0 次**、`检查日期` **0 次**、`失败原因` **0 次**；而文本报告里分别是 **34 次 / 21 次 / 21 次**。`candidates` 是 3 个数字（`{"total":40,"adopted":13,"notAdopted":21}`）；`gaps.notAdoptedProviders` 是 `array(13) of string`（如 `"百川智能 Baichuan"`，不是对象）。含 `candidate/url/source` 的键路径全表只有 `.candidates`、`.coverageTargets.sourceHealth*` 与几个 `*InSource/*BLOCKED_SOURCE` 计数键 —— **没有任何一处能还原一条候选来源的 URL/日期/原因**。
- **建议修复方向（不实施）**：JSON 里补逐条 `{provider, url, checkedAt, flags, reason, adopted:false}`（稳定排序 + 截断策略要和现有键一样的确定性处理），或明确在报告头部声明「候选明细仅文本、JSON 只保证计数」——二者选一，不能含糊。

### F3 [low] §41 8 条里有 4 条的**题面英文条目名**在报告里不可 grep

- **差在哪**：`Target Provider Universe`（L220）、`Current Model Coverage`（L364）、`Source Health impact`（L371）逐字出现；但 **R2 / R5 / R6 / R7 用的是中文标题**（`分维度覆盖（provider × 维度 · 派生七态 · v2）` / `真缺口：MISSING targets（…）` / `有理由的缺口 ②：UNVERIFIABLE（…）` / `有理由的缺口 ①：DEFERRED（…）`）。**实质都有载体**，但「逐条核对」的人拿题面清单 grep 会漏掉这 4 条（本任务就是先靠行号人工对上、再用 28 格逐格对拍才确认的）。
- **证据**：L264 / L306 / L333 / L329 的标题原文，与题面 8 条清单。
- **建议修复方向（不实施）**：标题里保留题面条目名（如 `── 分维度覆盖 / Provider coverage by dimension（…）──`），或在报告开头加一行「题面 §41 条目 ↔ 章节行号」索引。

### F4 [low] t39 记录的「JSON 段 sha256」不可复现（口径未留痕）

- 见 §4.1。**不影响 §42 的 determinism 结论**（stdout 与 t25 的 64 位全串逐字吻合），但该数字不能被引用为基线；建议 append-only 补口径或改用本文件的可复跑值。

### F5 [low] R8 的「来源宇宙」比 source-health 注册表窄（口径边界，不是漏报）

- **差在哪**：报告只列 `意图层里写过的 deals source`（**5** 个）并显示它们对 target 的影响；`scripts/data/source-health.json` 里有 **9** 行（额外还有 `aitools.fyi / Futurepedia / Futuretools / Layer3Labs`）。因此**一个变坏、但不属于任何 target 的采集源**在 `Source Health impact` 一节里不会出现。
- **本轮影响**：`unhealthyDeclaredSources` = []、`blockedTargets` = []，本轮 9 行**全部 healthy**（`consecutiveFailures` 全 0），所以没有「因来源健康而被漏报的 target」。登记为口径边界，供 t20 在 Remaining Risks 里如实描述（避免被读成「全站来源都被这张表看住了」）。
- **建议（不实施）**：加一行对照读数「source-health 注册表共 N 行；其中挂在 target 上的 M 行（= 本节）」，把两个宇宙的差显式写出来。

---

## 6. 复跑方式（本文件所有读数的唯一出处）

```powershell
cd .worktrees/coverage-expansion-v1

# ① 原始字节 + 两次 determinism（Node 内取 buffer，避开 PS 5.1 的 UTF-16 重定向）
node research/_raw/t45/run-and-hash.cjs

# ② 载荷块的键路清单、块边界、以及「目录状态普查」是否存在
node research/_raw/t45/extract-payload.cjs

# ③ 文本行 ↔ JSON 值的同源交叉核对（29 项 + 七态 28 格）
node research/_raw/t45/probe-text-json-consistency.cjs

# ④ t39「JSON 段 sha256」的口径复现尝试（31 种定义）
node research/_raw/t45/probe-json-segment-hash.cjs
node research/_raw/t45/probe-json-segment-hash2.cjs
node research/_raw/t45/probe-json-segment-hash3.cjs

# ⑤ npm 路径与直接运行的差别（banner 86 B）
cmd /c "npm run report:coverage > research\_raw\t45\report-npm-text.txt 2> research\_raw\t45\report-npm-stderr.txt"
node research/_raw/t45/probe-npm-vs-direct.cjs
node research/_raw/t45/probe-npm-body-equal.cjs

# ⑥ §41 其余对照（currentModels 有没有普查、gaps 形状、source-health 宇宙）
node research/_raw/t45/probe-section41-carriers.cjs
node research/_raw/t45/probe-currentmodels.cjs
node research/_raw/t45/probe-shapes-and-npm.cjs

# 合约里的原始三条
node scripts/tools/coverage-report.js
node scripts/tools/coverage-report.js --json
node scripts/tools/coverage-targets-selftest.js
```

---

## 7. 明确未做（边界）

- **未修任何东西**：没有改 `scripts/tools/coverage-report.js`、`coverage-targets-selftest.js`、任何数据文件或登记表；发现只以 F1–F5 清单形式报出，修复另派。
- **未核数字真实性**：数字是否「真的对」属 t14 的范围（它已独立复算过 9/9 一致）；本任务只核**条目有没有载体**与**文本/JSON 是否同源**。
- **未核 §87 完成清单**：那是 t38 的映射；本任务只做 §41/§42。
- **未跑建站/真浏览器**：报告是构建期工具，本任务不需要 `build-local` / `verify-site`（属 t18/t19）。
- **未解释 t39 那个哈希的来源**：31 种定义都不匹配，我能确证的是「不可复现」，不能确证「它当时算什么」——这一点如实留白，不猜。
