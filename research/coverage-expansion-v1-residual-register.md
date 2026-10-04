# coverage-expansion-v1 · 残余登记表

> 本表是**残余（residual）的唯一收敛处**。此前它们只散落在各任务的 output 里 ——
> 一份留在 t8 的 output、一份留在 t9 的 md、一份留在 t14 的 findings，谁也没法一眼看全。
> **t20（最终报告）与 t21（Self-Audit）必须引用本表**，不要在各自文档里另起一份名单。
>
> 两条硬纪律：
> 1. **每一条「已关闭」都必须附上关闭它的那次反证**（命令 + 退出码），不许写「已修复」而无证据；
> 2. 每条都必须写清**可见性** —— 从哪里能自己看见它（产物路径或命令），而不是"有人说"。
>
> 产出者：ci-gate-engineer（t28，attempt 1）· 基线 a4dd40f · 本表随工作区数据变化而重算，
> 仲裁类数字（§2）带清单 sha256，可复核。

---

## §0 闭环核验：t14 的四条 finding（F1 / F2 / F4 + 浏览器侧）

t14 的裁决是 **needs_revision**（4 条 finding）。本轮**逐条重做定向变异**，
全部在 `%TEMP%` 副本上完成，共享 worktree 逐字未动（脚本自证 sha256）。

### F1 —— 关系层缺失必须判红：**已关闭**

| | |
|---|---|
| 判据 | 删掉 `scripts/data/model-registry-links.json` 后，`report:coverage` 必须非 0，且自检问题**点名关系层缺失**（不许把"读不到"按"0 条映射"算） |
| 反证 | `node research/_raw/t28/close-loop-mutations.js` → 对照组 **exit 0**；变异组 **exit 1** |
| 原文 | `- 缺少 scripts/data/model-registry-links.json —— 关系层不存在，API 侧与套餐侧的映射覆盖都无从判定（这不是"0 条映射"，是"这份报告没有分母"）。` |
| 对照原文 | `✅ 覆盖报告自检通过（0 处问题）。`（exit 0） |
| 修复归属 | t25（报告层）；t14-F1 由本轮变异首次在**产物级**复现关闭 |

### F2 —— /models/ 索引的身份对账：**已关闭（三组变异全红）**

判据：索引页的行与发布数据集必须**逐身份**对得上，且每行的详情链接必须指向自己。
基线用 t28 的**新构建**（`build-local.js --out=t28site.building`），不用陈旧 `dist/`。

| 变异 | 结果 | 红在哪（原文） |
|---|---|---|
| 对照（产物原样） | **exit 0** | — |
| V1 slug + 链接一起改（`glm-5.3` → `glm-5.3x`） | **exit 1** | `索引页产物的行与发布数据集不一致（缺 glm-5.3/glm-5.3-flash · 多 glm-5.3x/glm-5.3x-flash）` |
| V2 **只改链接**（`models/glm-5.3/` → `models/glm-5.3x/`） | **exit 1** | `索引页有 1 行的详情链接没指向自己：glm-5.3(链接指向 ../models/glm-5.3x/)` |
| V3 **只改 slug**（`data-model`/`data-item` 的 `"glm-5.3"` → `"glm-5.3x"`，href 保持正确） | **exit 1** | `索引页产物的行与发布数据集不一致（缺 glm-5.3 · 多 glm-5.3x）` |

> V2/V3 是 t14 特意要求补的两组：当年"slug 与链接一起改"才自洽，所以只改一半的形态必须也红。
> 三组现在都红，且报错**分别**点名"链接指向"与"身份不一致"，不是同一条兜底断言在红。

### F3 —— 有 selftest 文件却没登记：**已关闭（由 t7 + t27 关闭）**

| | |
|---|---|
| 反证 | `node scripts/tools/check-ci-consistency.js` → **38 项 0 失败（exit 0）**；`--expect-checks=37` → **exit 1**（外部钉住仍有牙） |
| 反向牙 | t27 的 (19)：`node research/_raw/t27/reverse-registration-drill.js` → 10/10 符合预期，摘掉一条 selftest 登记 ⇒ 红 |
| 可见性 | `verify.yml:118 --expect-checks=38`；`check-ci-consistency.js` 的 `SELFTEST_FILE_EXEMPTIONS`（当前为空）+ (19) 断言 |

### F4 —— deals provider 口径标签：**已关闭**

报告原文（`node scripts/tools/coverage-report.js`）：

```
provider 数（仅 type=deal）        31   只数 type=deal 的 80 行归一后的厂商键（不含未识别）；type=tool 的 55 行不进 provider universe
工具行厂商数（对照，不计入）                 52   type=tool 共 55 行；它们的厂商串同样带 vendor 原始串，但没有归一规则、也没有套餐/计费侧身份
```

### 浏览器侧默认隐藏（t14 明确未覆盖的那一块）：**已关闭**

工具链：既有真实浏览器验收 `node scripts/tools/verify-site.js --dir=<新构建>`（playwright chromium）。
两次运行（陈旧 `dist/` 与 t28 新构建）在 §22 给出**同一组读数**：

| 判据（原文） | 读数 |
|---|---|
| `/models/ 静态表行数 == dist/models.json 全部模型数（44 个）` | 页面 **44 行** / 数据 44 个（No-JS 完整） |
| `/models/ 初始可见行数 == current+aging+unknown 的行数（43 行）` | 可见 **43** / 期望 43（默认隐藏 1） |
| `/models/ 默认隐藏的行数 == legacy/historical 的行数（多藏一个都是错的）` | 隐藏 **1** / 期望 1 · 目录状态分布 `{"unknown":40,"current":3,"legacy":1}` |
| `/models/ 有「显示旧型号」入口（默认藏起来的东西必须点得到）` | ok |
| `/models/ 勾选「显示旧型号」后可见行数 == 全部 44 行（一行都不删）` | 可见 **44** / 全部 44 |
| `/models/ 无 JS 时静态表仍是全部 44 行、且没有一行预先隐藏` | 行 **44** / hidden **0** / hidden 属性 **0** |
| `/models/ 无 JS 时一个控件都没有（「显示旧型号」入口也整块由脚本建）` | **0 个**控件 |
| `/models/ 索引页的筛选控件由脚本建（有 JS 时才有控件）` | **8 个**控件 |
| `/models/deepseek-v3.2/`（被默认隐藏的那个 legacy）详情页仍在 sitemap、无 JS 读得到发布时间与目录状态 | 全部 ✓ |

> 默认隐藏的正是 `deepseek-v3.2`（catalogStatus=legacy）；像素/几何证据：390px 与 360px 均 **0px 页面级横向溢出**，
> 行计数为浏览器内 `tr[hidden]` / `getBoundingClientRect` 实测值而非字符串匹配。
> 证据文件：`research/_raw/t28/verify-site.json`（陈旧 dist）、`research/_raw/t28/verify-site-fresh.json`（新构建）、
> `research/_raw/t28/verify-site-run.log` 与 `verify-site-fresh.log`（人读全文）。
> **注意**：整套验收 735 项里有 1 项红，**与本节无关但真实存在** —— 见残余 (j)。

---

## §1 残余登记表

状态两态：**已关闭** / **保持登记**（含"有意为之的例外"）。每条都给出可见性。

| # | 现象 | 判据 | 影响 | 状态 | 可见性 |
|---|---|---|---|---|---|
| (a) | 历史 API 映射里，价格引文**没有点名该模型**：**34 条** | §2 的写死规则（`apiPlanId` 侧 · `basis != explicit-mapping` · evidence.quote 里不出现 modelKey / 记录内 name / registrySlug，大小写不敏感逐条子串） | 这些映射的"价格属于这个模型"**机器不可核**，只能人读原始官方页；不影响数据合法性（门禁不判它红） | 保持登记 | `node research/_raw/t28/arbitrate-unnamed-citations.js`；清单 `research/_raw/t28/unnamed-citations.json`（sha256 见 §2） |
| (b) | `aging` 与 `historical` 在**真实数据上为 0 条**，两条分支只有夹具证明 | `catalogStatus` 分布 = `{unknown:40, current:3, legacy:1}`（aging 0 / historical 0） | 端到端链路上「aging/historical 真的会被渲染成什么样」在真实站点**看不到**；若这两档有渲染缺陷，只有夹具会发现 | 保持登记 | `node -e` 读 `models.json` 的 catalogStatus；`node scripts/tools/model-freshness-selftest.js` → 100/100（第 1 节「五个分支」）；verify-site §22 的目录状态分布行 |
| (c) | xAI / Mistral / Cohere 三家 `unverifiable`，但**形态各不相同** | 三家的官方来源都拿不到可引原文 ⇒ 记 unverifiable（不是"没查"） | 三家在 coverage-targets 里只能记 unverifiable；将来复查要按各自的失败形态换手段 | 保持登记 | `research/_raw/coverage-expansion-v1/firstparty.json` 的 `vendors[].ruling / rulingReason`：<br>· **xAI**：`x.ai / docs.x.ai 全域 fetch failed（非 HTTP 状态码）`，零官方原文<br>· **Mistral**：`mistral.ai 与 docs.mistral.ai 全部 fetch failed（6 个 URL 变体）`<br>· **Cohere**：`官方定价页与文档页都返回 200，但只能取到导航，价格表与模型清单均不可抽取` |
| (d) | Tabnine **官方定价面已不存在** | 整站 302/重定向到 Tricentis 的「联系我们」表单页（Tabnine 已被 Tricentis 收购）⇒ 无可核对档价 | 本轮 `not-adopted`；不是"我们没查"，是"官方独立档价面没了" | 保持登记 | `research/_raw/coverage-expansion-v1/coding.json` → `candidates.tabnine`（`verdict=not-adopted`） |
| (e) | Amazon Q Developer **2027-04-30 起停止支持 IDE 插件**，指向 Kiro；**Kiro 不在本轮范围** | 官方产品页逐字公告；本轮按 `adopt-partial` 并入既有 provider `aws`（收 2 条并把停支公告写进 note） | 2027-04-30 之后这两条记录会变成"买不到的产品"；Kiro 未覆盖 ⇒ 该平台在覆盖宇宙里暂时缺席 | 保持登记 | `research/_raw/coverage-expansion-v1/coding.json` → `candidates["amazon-q-developer"]`（含停支公告与 Kiro 指引） |
| (f) | **价格 schema 表达力缺口**：12 条 DEFER-INF-01..12 + 打包价 / 季付 / 积分 / 按小时 / 年付 | `schemaExpressibility.counts = {expressibleDimensions:7, expressibleWithNote:5, deferredSchemaItems:12}` | 这些官方价**本轮刻意不落盘**（不许换算、不许编字段）⇒ API 侧的"全覆盖"是有边界的全覆盖 | 保持登记 | `research/_raw/coverage-expansion-v1/inference.json` → `schemaExpressibility.deferredSchema`（12 条逐条带官方原文与 `whyNotExpressible`）；打包价/季付/积分/按小时另见 `firstparty.json` 与 `coding.json` 的 `priceExpressiveness` |
| (g) | `releasedAt` 引文有 **400 字上限** | `MAX_RELEASE_QUOTE = 400`（≈2~4 句官方原话）：允许完整一条官方条目，**拒绝整页复制** | 这是**有意的**例外（版权纪律），不是缺陷；代价是超长官方条目被截断 | 保持登记（有意） | `scripts/lib/model-registry.js:238-240`（注释写明理由） |
| (h) | `checkedAt` / `checkedUrls` / `checkedOutcome` 为什么留着 | 「查不到的必须留 null，并写清 `checkedAt` + 已核查的官方 URL + 该页面为什么给不出日期」⇒ **「查过没日期」必须能与「从未查过」分开** | 少这三个字段，"40 条 unknown"就分不出"查了没结论"与"还没人查" | 保持登记（有意） | `research/_raw/coverage-expansion-v1/currentness.json` → `releaseEvidenceSchema` 与 `_rules` |
| (i) | **平台 vs 模型发行方的展示需求**：同一个 `modelKey` 出现在 N 个 provider 记录里 | api-plans 共 **66** 个不同 `modelKey`，其中 **7** 个出现在 >1 个 provider 记录（`deepseek-v4-pro×3`、`glm-5.3×3`、`minimax-m3×3`、`kimi-k3×2`、`gpt-oss-120b×2`、`qwen3.8-27b×2`；重复度分布 `{2:4, 3:3}`） | 注册表是"一个模型一条身份"，但读者要**按平台比价** ⇒ 需要"同一身份 × N 平台"的视图；当前只能从 API 计价页逐条读 | 保持登记 | `node research/_raw/t28/residual-counts.js`（本表数字即它算出） |
| (j) | **真实浏览器验收有 1 项红**：`/feeds/ 为空的变化流那一行写出了起算日` | `verify-site.js` 全套 **735 项，失败 1 项**，在**三份不同的产物**上各测一次都红：任务开始时的陈旧 `dist/`、t28 新构建 `t28site.building`、以及任务期间被队友刷新后的当前 `dist/` ⇒ 与构建时机、与 t23/t25 的数据落盘都无关 | 当前分支在真浏览器验收里**不是全绿**；t18 全量 Gate 会在这里红。与 /models/ 及本轮四条 finding **无关** | **未关闭**（需修复或由 t18 明示裁决） | `node scripts/tools/verify-site.js --dir=<构建>`；三份日志：`research/_raw/t28/verify-site-run.log`（陈旧 dist）、`verify-site-fresh.log`（新构建）、`verify-site-current.log`（当前 dist） |

### 关于 (j) 的补充边界

- 它不是"新引入"的：**三份不同的产物**（t23/t25 落盘之前的陈旧 `dist/`、t28 新构建、队友刷新后的当前 `dist/`）
  各测一次，**报的都是同一条** ⇒ 与构建时机无关、与本轮数据/页面改动无关；
- 它**不在**本轮四条 finding 的范围内，本任务不修它（t28 只做核验与登记）；
- 它必须由 t20/t21 如实披露，并由 t18 决定"修、还是记成有意裁决"。
- 另记一条过程事实：本节的对照读数在本次任务期间被队友的产物刷新改变过一次 ——
  `models-page-selftest.js --dir=dist` 在任务中段还是红（根 `models.json` 与 `dist/models.json` 不一致），
  任务末尾已转绿（115/115）。**这不是 F2 的关闭证据**；F2 的关闭证据始终是 §0 表里那三组定向变异。

---

## §2 仲裁：「历史映射引文未点名模型」到底几条

### 写死的判据（逐字）

> links 中 `apiPlanId` 侧 且 `basis != explicit-mapping` 且其 `evidence` 的 `quote` 里
> **不出现**该条 `modelKey` / 记录内该条目的 `name` / `registrySlug`
> （大小写不敏感，逐条子串）。

### 仲裁结果

| 项 | 值 |
|---|---|
| **条数** | **34** |
| 清单 | `research/_raw/t28/unnamed-citations.json` |
| **清单 sha256** | `b9d97c444e7e59d0d90b2855165a1bc67422b2d0dc573805569d2cc5e6c6f696` |
| 分母 | links 82 条（API 侧 69 / Coding 侧 13）；其中 API 侧 `basis=explicit-mapping` 10 条（**按设计不写引文**，不在规则内） |
| 复现 | `node research/_raw/t28/arbitrate-unnamed-citations.js`（`--json` 出机器可读） |

34 条的 `basis` **全部**是 `official-pricing-page`；34 条覆盖 12 个 `apiPlanId` / 10 个 provider；
其中 variant 全为 `null`（即都是通配映射）。

### 36 / 52 两个旧读数：各自的错在哪

本任务**无法用写死规则复现任何一个**。为此跑了 15 组显式变体（`research/_raw/t28/probe-old-readings-battery.js`
与 `probe-36-52-reading.js`），并对 **git HEAD 快照**与**当前盘上数据**各算一遍：

| 口径 | 当前数据 | HEAD 快照 | 说明 |
|---|---|---|---|
| **写死规则（仲裁值）** | **34** | **34** | 两个数据快照同值 |
| 去掉「记录内 name」这一支 | 38 | 34 | 最接近 36 的一种（差 2 条） |
| 改用 registry 的 `canonicalName` 代替记录内 name | 33 | — | 换了名字来源 |
| 大小写敏感 | 47 | 47 | 把"同一句引文里的 `GLM-5.3`"误判成"没点名" |
| 连 `explicit-mapping` 一起算 | 44 | 34 | 那一类**本来就**不写引文，是设计 |
| 只在"完全没有引文"的 link 里算 | 0 | 0 | 会把"有引文但没点名"整类漏掉 |
| 全部 API 侧 link | 69 | 55 | — |
| 非 `explicit-mapping` 的 API 侧 link | 59 | 55 | — |
| 全部 link | 82 | 68 | — |

**结论**：

- **52 无法用任何"引文点名"口径复现**。它与同一份覆盖报告里**另一行读数的值逐字相同** ——
  `工具行厂商数（对照，不计入） 52`（t25 新增的对照行）。最可能的错因是**误引**：把那一行
  （type=tool 的厂商键数）当成了本条的数字。两者是**不同的量**，取值相同纯属巧合。
- **36 也复现不出来**。最接近的两种是 38（漏掉「记录内 name」这一支）与 33（改用 registry
  `canonicalName` 当名字来源），各差 2 条；"引文条数"(59)、"API 侧 link 数"(69/55)、"声明数"(12)
  都对不上。⇒ 它一定来自某个**没有写下来的口径**（或某个中间数据快照）。
- 因此以本任务的**写死规则 + sha256** 为准；`36` 与 `52` 都不应再被引用。
  若将来要改口径，改的是这条规则本身（并同步重算 sha256），而不是引用一个来源不明的数字。

---

## §3 证据清单（可自行复跑）

| 文件 | 作用 |
|---|---|
| `research/_raw/t28/close-loop-mutations.js` | F1 + F2 的 6 组定向变异（含只改链接 / 只改 slug），含共享 worktree 哈希自证 |
| `research/_raw/t28/arbitrate-unnamed-citations.js` | ② 的仲裁脚本（写死规则 + 8 组口径变体） |
| `research/_raw/t28/unnamed-citations.json` | 仲裁清单（sha256 的载体） |
| `research/_raw/t28/probe-old-readings-battery.js` / `probe-36-52-reading.js` | 15 组变体 + HEAD/当前两个快照的对照测算 |
| `research/_raw/t28/residual-counts.js` | (b)(i) 等计数 |
| `research/_raw/t28/verify-site.json` / `verify-site-fresh.json` / 两份 `.log` | 真实浏览器验收的机器可读 + 人读全文 |

四条验收命令：

```
node scripts/tools/coverage-report.js                          # 正常态 exit 0（副本删关系层后 exit 1）
node scripts/tools/models-page-selftest.js --dir=<产物副本>      # 正常态 exit 0（三种索引变异均 exit 1）
node scripts/tools/verify-site.js --dir=<构建>                  # 真浏览器；§22 全绿（全套 1 项红见 (j)）
node research/_raw/t28/arbitrate-unnamed-citations.js           # 34 条 + sha256
```

---

## §4 边界声明（本任务没有做什么）

- 只读生产文件；**所有变异都在 `%TEMP%` 副本上做**，共享 worktree 逐字未变
  （`close-loop-mutations.js` 对 `scripts/data/model-registry-links.json`、
  `dist/models/index.html` 前后 sha256 自证一致：`116bad28c1d2687a…`、`3f88534f1a83bb01…`）。
- **没有**重复审 t23 的机制（那是 t26）、**没有**重跑 t14 已通过的结论（回归属 t18）。
- **没有**修任何东西：§0 只做核验，发现的 (j) 只登记不修（t28 没有修复权）。
- t28 新增的构建目录 `t28site.building/` 由 `.gitignore` 的 `*.building/` 覆盖，不进 git 索引。
