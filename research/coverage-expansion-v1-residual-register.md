# coverage-expansion-v1 · 残余登记表

> 本表是**残余（residual）的唯一收敛处**。此前它们只散落在各任务的 output 里 ——
> 一份留在 t8 的 output、一份留在 t9 的 md、一份留在 t14 的 findings，谁也没法一眼看全。
> **t20（最终报告）与 t21（Self-Audit）必须引用本表**，不要在各自文档里另起一份名单。
>
> 两条硬纪律：
> 1. **每一条「已关闭」都必须附上关闭它的那次反证**（命令 + 退出码），不许写「已修复」而无证据；
> 2. 每条都必须写清**可见性** —— 从哪里能自己看见它（产物路径或命令），而不是"有人说"。
>
> 产出者：ci-gate-engineer（t28 首版，attempt 1；**t34 更新**）· 基线 a4dd40f ·
> 本表随工作区数据变化而重算，仲裁类数字（§2）带清单 sha256，可复核。
> **最后更新：t34（2026-10-04）** —— 改了什么、为什么、引用了哪条证据，逐条见 **§6 变更记录**；
> 历史条目一律 append 式更新，**不静默改写**。

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
> **注意（t34 更新）**：当时整套验收 735 项里有 1 项红（与本节无关）；那条红已在 t34 定位为
> **判据层的假红**并由 t31 修复 —— 复跑 **735 项 0 失败 exit 0**。详见残余 (j) 与 §6。

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
| (j) | ~~真实浏览器验收有 1 项红~~ → **已定位为「判据层假红」并修复**：`/feeds/ 为空的变化流那一行写出了起算日` | 根因**不在页面，在验收判据**：`scripts/tools/verify-site.js` 当时用 **`/0 条/` 子串匹配**判「这一行是不是空态」，而 **`10 条` / `80 条` / `100 条` 全都命中** —— 当前「API 价格变化」那一行正好是 **`10 条`** ⇒ 两条变化流都被当成空态、都被要求写起算日 ⇒ **门禁自造假红**（页面写的一切都对）。判据已换成 `lib/feeds.js` 的**具名函数** `isZeroCountRow()`（数字边界，唯一出处） | 当时让 t28 的 Verify 命令非 0，并会让 t18 全量 Gate 假红 | **已定位 / 修复在途（t31）** —— 本轮复跑**已 735/0**（修复代码已在盘上生效；t31 台账状态仍 in_progress） | `node scripts/tools/verify-site.js --dir=dist` → **735 项 0 失败 exit 0**（`research/_raw/t28/verify-site-t34.json`、`%TEMP%\t34-verify.log`）；**保住原意的夹具**：`node scripts/tools/feeds-selftest.js` → **144 项通过 0 失败**，第十三节「按数字边界判 0 条」逐组：`0 条` / `最近变化 0 条` / `（0 条）` / 真实空态行 → **true**，`10/20/30/80/100 条` → **false**；代码：`scripts/lib/feeds.js` 的 `isZeroCountRow` / `hasChangeStartDate`，注释见 `verify-site.js:1650-1676` |

### 关于 (j) 的补充边界（t34 改写：从「未归因的 blocker」到「已定位的假红」）

- **它不是页面缺陷，是判据缺陷**：页面写的一切都对（只有真的空态行才写起算日）；
  错的是验收脚本拿 `/0 条/` 这个**子串**当语义 —— `10 条` 里就含 `0 条`。
  （这类"子串冒充语义"是本轮反复出现的同一族错误，纪律见 §4。）
- **它当时确实在三份产物上都红**（t23/t25 落盘前的陈旧 `dist/`、t28 新构建、队友刷新后的当前 `dist/`），
  所以当时被记成"与构建时机无关"是**对的**；但"与构建无关"**不等于**"与判据无关"——
  这正是本轮把 (j) 从"红"一路追到"假红"的原因。
- **处置归属 t31，不是 t28**（t28 只做核验与登记、无修复权）：抽出具名判据 `isZeroCountRow()`
  作为**唯一出处** + 在 `selftest:feeds` 里用夹具保住"空态必须有起算日"的原意
  （`true` 四组 / `false` 五组）+ 真跑 735/0。t34 复跑确认：
  `verify-site.js` **735/0 exit 0**、`feeds-selftest.js` **144/144 exit 0**，
  且 §22 的 /models/ 读数与首版逐条相同。
- 另记一条过程事实（历史，保留）：t28 期间队友刷新过 `dist/` 与根 `models.json`，
  `models-page-selftest.js --dir=dist` 由红转绿（115/115）。**这不是 F2 的关闭证据**；
  F2 的关闭证据始终是 §0 里那三组定向变异。

---

## §1B 本轮新增闭环条目（t23 / t25 / t27 / t29 / t30 / t31 / t32 / t33）

> 五列口径与 §1 相同。这些条目在本表**首版（t28）时还不存在或尚未收敛**，由 **t34 补入**。
> 「已关闭」都附了关闭它的命令或产物；**未收口的明确写「在途」**，不粉饰。

| 条目 | 现象 | 判据 | 影响 | 状态 | 可见性 |
|---|---|---|---|---|---|
| **t23** | API 侧计价条目**没有出口**：19 条伪造声明 + 81 条未认领 ⇒ 27 项红；处置登记只认套餐侧 | 处置登记**双侧化**（`API_GAP_KEY_ORDER` / `API_GAP_REASONS(['off-registry-model'])` / exactly-one / API 侧存在性与 sourceUrl 与 note / 双向重复记账 / `identityFold`+命名空间后缀**反绕过牙** / 侧别规范序）；`validateLinks` 接 gaps：**未认领 = 展开条目 − 映射 − 处置**，错误信息点名两个出口文件 | 覆盖完整性无从判定 —— 报告只能"看起来"全覆盖 | **已关闭** | `research/_raw/coverage-expansion-v1/t23-land-api-dispositions.cjs`（幂等·自带断言，第二次跑「已是目标状态」）；`node scripts/validate.js --strict` exit 0；`models-selftest` 134/134；盘上读数：links 82 = API 69 + Coding 13 · declarations 54 = Coding 42 + API 12 · 未认领 0 |
| **t25** | 报告不暴露 API 侧处置；冻结 JSON 契约无前缀守卫；t14-F4 的口径标签缺失 | A/B/C 三读数与 `lib` 的 `coverageOf()` **逐项对账**（对不上即红）+ 闭合断言（A+B+C == 计价条目总数）+ **C ≠ 0 即报告自检非 0**；JSON 契约升级为**旧键前缀逐字逐序 + 追加键恰等于显式白名单** | 处置做了却看不见；冻结契约会被静默改形 | **已关闭** | `node scripts/tools/coverage-report.js`：方程行 `计价条目 93 条 = 已映射认领 81 + 已处置声明 12 + 未判 0`、API 侧处置逐条 12 行、`provider 数（仅 type=deal）` + 对照行；`coverage-targets-selftest` 96/96；独立第二条路径 `research/_raw/t25/recount-api-accounting.cjs`、变异 `mutate-drop-api-disposition.cjs`（删 1 条声明 ⇒ 报告层与门禁层**双双点名**） |
| **t27** | `(17)` 只守单向：**删掉 package.json 的 selftest 登记而 action.yml 步骤还在时不红**（t7 的 D5 探针实测） | 新增 `(19)` **反向登记制**：从 action.yml 的步骤 run 体出发判「这条 script 是否真的被门禁跑到」；豁免只能逐文件 + 写理由 + 文件必须存在 + **禁止通配** | 自测文件已落盘却一次都不执行，且完全静默（t14-F3 的成因） | **已关闭** | `node scripts/tools/check-ci-consistency.js` → **38 项 0 失败 exit 0**；`--expect-checks=37` → **exit 1**（外部钉住仍有牙）；`research/_raw/t27/reverse-registration-drill.js` → 10/10（含「摘登记必红」与「合法豁免绿」） |
| **t29** | 报告 JSON 键与 `lib` 的 `coverageOf()` 读数**跨层同名不同义**（两层的 `declaredApiEntries` 一个指数、一个指数组） | **只加注释**消解：把逐键对照写死在 JSON 组装处；判据要求 diff **每一行 +/- 都是注释行**（键名/白名单/读数逻辑/断言强度零改动） | 下一个人按名字读键会读反，而误读可能静默 | **已关闭**（只加注释） | `scripts/tools/coverage-report.js:947-963` 的对照注释块 + `coverage-targets-selftest.js:475-487` 的语义锚点；证明工具 `research/_raw/t25/diff-comment-only.cjs`（31 行 +/- **全是注释**）；`report --json` 两次 stdout sha256 均 `7e50e31df838c966…`（与改动前**同值**） |
| **t30** | T26-F1/F2：命名空间后缀切分集漏 `_`/`-`；`validateLinks`/`validateGaps` 是否**成对调用**没有机器守卫 | 切分集 `[/．.]` → **`[/．._-]`**（对齐 `modelKey` schema `^[a-z0-9][a-z0-9._-]{1,59}$` 允许的 `{., _, -}`），尾段仍走 `identityFold` **折叠精确相等**（不引入相似度/编辑距离/子串包含）；`models-selftest` 新增 ⑧ 节**源码级成对调用牙** | 反绕过后缀切分可被绕过；单边调用会静默漏掉一侧校验 | **已关闭** | `research/_raw/t30/probe-suffix-splitting.cjs` + `separator-fixtures.json`：**`acme_glm-5.3` / `acme-glm-5.3` 修补前 0 命中、修补后命中 `glm-5.3`**（真实数据结论不变：7 条各命中 1 个 identity、12 条声明 0 命中）；成对牙实测 8 个入口，副本里摘掉一处即红 |
| **t31** | 残余 (j)：`/feeds/` 空态判据用子串匹配 ⇒ 门禁自造假红 | 抽出具名判据 `isZeroCountRow()`（数字边界，唯一出处）+ 在 `selftest:feeds` 里用夹具保住"空态必须有起算日"的原意 + 真跑 735/0 | 真浏览器验收非 0；t18 全量 Gate 假红 | **已定位 / 修复在途（t31）** —— 本轮复跑**已 735/0** | `node scripts/tools/verify-site.js --dir=dist` → **735/0 exit 0**；`node scripts/tools/feeds-selftest.js` → **144/144**（第十三节数字边界夹具）；详见 (j) 行 |
| **t32** | t15 的 F1–F8（引文逐字化、jetbrains 证据可复现性、t13 报告如实纠正） | **数值一字不动** + 引文逐字 + **不可复核必须明写**（不许写「已复核」） | 引文不是逐字 ⇒ 证据链断；把不可复核写成已复核 ⇒ 假证据 | **部分关闭**：F3–F8 六条已闭合（含 **F3 的「不可服务端复核」标注**、**F6 的现场更正**），**F1/F2 的 API 侧一半因需要 out-of-scope 连带改动而未闭合**（t32 台账 findings 记 `T32-B1[blocker]`） | `research/coverage-expansion-v1-data-quality-review.md` §5（**append-only** 补充）；`research/_raw/t32/t32-evidence-caveats.md`（含 jetbrains 页面自报 `iso=CNY` / `countryCode CN` ⇒ 无可复现路径）；`plans.json` 两条 billing.note 写明「不可服务端复核」 |
| **t33** | t32 留下的 F1/F2 **API 侧**：引文逐字化 + 同步 4 条链接抄件 | 窄例外：**只同步 quote**（不改身份、不改数值） | 引文非逐字 ⇒ 同 t32 | **在途**（台账 in_progress） | t33 台账（`changedPaths` 待落地后可见） |

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
| `research/_raw/t28/verify-site.json` / `verify-site-fresh.json` / `verify-site-current.json` / 三份 `.log` | 真实浏览器验收的机器可读 + 人读全文（含 (j) 假红的三次观测） |
| `research/_raw/t28/verify-site-t34.json` + `%TEMP%\t34-verify.log` | **t34 复跑**的真浏览器结果：**735 项 0 失败 exit 0** —— (j) 关闭的直接证据 |

验收命令（可自行复跑）：

```
node scripts/tools/coverage-report.js                          # 正常态 exit 0（副本删关系层后 exit 1）
node scripts/tools/models-page-selftest.js --dir=<产物副本>      # 正常态 exit 0（三种索引变异均 exit 1）
node scripts/tools/verify-site.js --dir=<构建>                  # 真浏览器：§22 全绿；整套现在 735/0（(j) 的假红已由 t31 修复）
node scripts/tools/feeds-selftest.js                            # 144/144；(j) 的「空态必须有起算日」原意由第十三节的数字边界夹具保住
node research/_raw/t28/arbitrate-unnamed-citations.js           # 34 条 + sha256
git show a4dd40f:scripts/data/source-health.json                # §4.1 的对照物：基线必然是 healthy 8 / failed 1
```

---

## §4 被证伪的审查发现与证据更正

> 本节记录**审查侧的错误**：本轮有一条审查发现被**现场证伪**、一条的**举例被更正**。
> 它们留在表里，是因为"审查员也会错" —— 而且这条恰好错在**最容易被误用的那类判据**上
> （"拿两份文件比字节"）。t20/t21 引用时应连**纪律**一起引用，不要只留结论。

### §4.1 T15-F6 —— **被证伪**（审查员拿错了对照物）

| | |
|---|---|
| 原主张 | `scripts/data/source-health.json` 与基线 a4dd40f **逐字节相同**；9/9 healthy 是**基线既有值**（并据此说 t13 的「已更新 source-health.json」不成立） |
| 实测 | **主张不成立**：基线是 **healthy 8 / failed 1**，现行才是 **9/9 healthy**，两份**文本 sha256 不同** |
| 复现命令 | `git show a4dd40f:scripts/data/source-health.json`（**对照物 = 该 blob**，不是盘上文件、也不是另一份报告） |
| 读数（t34 独立复算） | **基线**：`generatedAt=2026-10-04T04:28:23.566Z` · 9 条 · `{healthy:8, failed:1}` · 非 healthy = `futurepedia`（`status=failed` · `consecutiveFailures=9` · `lastError=https://www.futurepedia.io/ 抓取失败: HTTP 403`）· 文本 sha256(前16) **`0a59b3a8c460d53b`**<br>**现行**：`generatedAt=2026-10-04T10:34:24.731Z` · 9 条 · `{healthy:9}` · 文本 sha256(前16) **`23b52beace92299c`** |
| 结论 | **t13 报告原句「已更新 source-health.json」为真**；F6 的前提是反的。该条已由 t32 在**不改数值**的前提下现场更正，本表只做登记（原始报告是历史证据，不追溯改写） |
| 发现路径 | **换一份对照物重算** —— t32 收口时用 `git show a4dd40f:…` 取基线 blob 复算，得到 healthy 8 / failed 1，与"逐字节相同"直接冲突 |

**由此得出的纪律（t20/t21 引用时请一并引用）**：

1. **引文/字节类判据必须附两样东西**：① **复现命令**；② **对照物标识**（哪一个 blob / 哪一次构建 / 哪一个快照）。
   只说"与基线相同/不同"而不说清**跟谁比、怎么比**，等于没有判据。
2. **哈希必须连算法与口径一起写**：同一个"哈希不同"的结论，用**文本 sha256**、**git blob SHA-1**、
   或经 PowerShell 重定向（可能带 BOM/CRLF）算出来的值**互不相同**。本表的读数是
   **文件字节的 sha256（取前 16 位）**，基线那一份取自 `git show` 的原样输出。
3. **"没有差异"是最需要证据的一句话**：它天然不可自证 —— 必须给出对照物与命令，否则应当写成「未核对」。
4. 这三条与 §0/§1 的"每条已关闭都要附反证"是同一条纪律的两种面孔：**结论可以很短，判据不行**。

### §4.2 T26-F1 —— **举例更正，结论不变**

| | |
|---|---|
| 原报告举例 | 用 `zai_org_glm-5.3` 三例说明"命名空间后缀切分漏 `_`" |
| 更正 | 那三例在**真实 registry** 上**修补前就能命中** —— 因为 `glm-5.3` 的别名 `zai-org/GLM-5.3` **整串折叠后恰好相等**（走的是**别名路径**，不是切分路径）。它们是**巧合**，**不得再作为漏洞证据引用** |
| 真正暴露漏洞的证据 | **t30 的 `acme` 型 fixture**：`acme_glm-5.3` / `acme-glm-5.3` —— 命名空间**不在任何 registry 别名里**，**修补前 0 命中、修补后命中 `glm-5.3`** |
| 结论 | **不变**：切分集应对齐 `modelKey` schema `^[a-z0-9][a-z0-9._-]{1,59}$` 允许的 `{., _, -}`（t30 已把切分集改为 `[/．._-]`） |
| 可见性 | `research/_raw/t30/probe-suffix-splitting.cjs` + `research/_raw/t30/separator-fixtures.json`；**两类 fixture 都留着** —— 免得后人把"别名恰好覆盖"读成"切分本来够用" |

---

## §5 边界声明（t28 首版的边界；t34 只改本表一份文件）

- 只读生产文件；**所有变异都在 `%TEMP%` 副本上做**，共享 worktree 逐字未变
  （`close-loop-mutations.js` 对 `scripts/data/model-registry-links.json`、
  `dist/models/index.html` 前后 sha256 自证一致：`116bad28c1d2687a…`、`3f88534f1a83bb01…`）。
- **没有**重复审 t23 的机制（那是 t26）、**没有**重跑 t14 已通过的结论（回归属 t18）。
- **没有**修任何东西：§0 只做核验，发现的 (j) 只登记不修（t28 没有修复权；修复由 t31 做）。
- t28 新增的构建目录 `t28site.building/` 由 `.gitignore` 的 `*.building/` 覆盖，不进 git 索引。
- **t34 的边界**：本次**只改本文件一份**（`research/coverage-expansion-v1-residual-register.md`）；
  没有改 t26 / t15 / t28 的原始报告（那些是历史证据，更正一律走 append-only 补充或进入本表），
  没有动任何生产文件；t34 内跑过的验证命令（`verify-site.js` 735/0、`feeds-selftest.js` 144/144、
  `git show a4dd40f:…` 对照）**全部以只读方式**执行。

---

## §6 变更记录（本表是怎样演进的）

> 每条都写：**改了什么 · 为什么改 · 引用了哪条证据/命令**。
> 历史条目一律 **append 式更新，不静默改写** —— 这一节本身就是"不许静默改写历史"的执行记录。

### t34（本次更新，2026-10-04）

| # | 改了什么 | 为什么改 | 引用的证据 / 命令 |
|---|---|---|---|
| 1 | 表头新增「**最后更新：t34**」并指向本节 | 让引用者一眼看出本表已更新，并能追溯改了什么 | 本文件 |
| 2 | 残余 **(j)** 由「**未关闭**（需修复或由 t18 裁决）」改为「**已定位 / 修复在途（t31）**」并补根因与读数 | 根因已定位到**判据层**：`/0 条/` 子串匹配把 `10 条` 当空态 ⇒ **门禁自造假红**、页面本身是对的；不能再写成"未归因的 blocker" | `node scripts/tools/verify-site.js --dir=dist` → **735 项 0 失败 exit 0**；`node scripts/tools/feeds-selftest.js` → **144/144**（第十三节：`0 条` 四组 true、`10/20/30/80/100 条` 五组 false） |
| 3 | 「关于 (j) 的补充边界」改写：补「**不是页面缺陷，是判据缺陷**」与**处置归属 t31** | 原写法容易被读成"一条与构建无关但真实存在的红" | 同上 + `scripts/tools/verify-site.js:1650-1676` 的注释（t31 写的根因说明） |
| 4 | **新增 §1B**：t23 / t25 / t27 / t29 / t30 / t31 / t32 / t33 八条闭环登记（同 §1 五列） | 首版只覆盖到 t28；这些条目此前只活在各自 member 的 output 里，t20/t21 引用不到 | 各条台账 output + §1B 内逐条列出的命令/产物（如 t27 的 `reverse-registration-drill.js` 10/10、t29 的 `diff-comment-only.cjs`、t30 的 `acme` fixture） |
| 5 | **新增 §4.1**：T15-F6 **被证伪**（审查侧错误）+ 三条纪律 | 本轮唯一一条审查侧的错误，且错在"拿两份文件比字节"这种**最容易被误用**的判据上；纪律比结论更值得留 | `git show a4dd40f:scripts/data/source-health.json` → **healthy 8 / failed 1**（futurepedia `cf=9` / HTTP 403）；现行 9/9 healthy；文本 sha256(前16) `0a59b3a8c460d53b` ≠ `23b52beace92299c` |
| 6 | **新增 §4.2**：T26-F1 的**举例更正**（结论不变） | 原举例（`zai_org_glm-5.3`）走**别名路径**、修补前就能命中，属巧合；拿巧合当漏洞证据会让人误判"切分本来够用" | t30 的 `acme_glm-5.3` / `acme-glm-5.3` fixture：**修补前 0 命中、修补后命中**；`research/_raw/t30/probe-suffix-splitting.cjs` |
| 7 | §3 证据清单补 `verify-site-t34.json` / `%TEMP%\t34-verify.log`，并把「四条验收命令」扩为含 `feeds-selftest` 与 `git show` 对照命令 | (j) 关闭的直接证据与 §4.1 的对照物必须能从表里**直接复跑** | 本表 §3 |
| 8 | 原「§4 边界声明」顺延为 **§5**，并补一条 t34 边界（只改本文件） | 给 §4（被证伪的审查发现）让位；顺延是**可见**改动，不是静默重排 | 本文件 diff；t34 的 in-scope 只有本文件 |
| 9 | **未改动（刻意保留）**：§2 的 **34** 与 sha256 `b9d97c444e7e59d0…`、表头「t20/t21 必须引用本表」、§1 的 (a)–(i) 九条正文 | t34 的硬要求：现有结论一个都不许弱化，历史条目不许删 | 逐字核对：`b9d97c444e7e59d0d90b2855165a1bc67422b2d0dc573805569d2cc5e6c6f696` |

### t28（首版，2026-10-04）

建立本表：**§0** t14 四条 finding 的闭环核验（F1/F2/F3/F4 + 浏览器侧）、**§1** 残余 (a)–(j)、
**§2** 条数仲裁（34 + 清单 sha256）、**§3** 证据清单、**§4**（今 §5）边界声明。
本表的产出背景：t14 的残余此前散落在 t8 / t9 / t14 的 output 里，没有单一收敛处。
