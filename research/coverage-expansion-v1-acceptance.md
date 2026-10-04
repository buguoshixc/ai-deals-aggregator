# coverage-expansion-v1 · 最终验收（t22）

> **交付人**：t22（最终验收：题面 §87 完成清单逐条核对）
> **判定时刻**：2026-10-05（合并 `d444dcd7` 之后；部署已在同日 18:03Z 生效）
> **口径**：§87 = **47 条**，以题面文件 `D:\AI_DEALS_COVERAGE_EXPANSION_V1_PROMPT.md` 第 **2568–2614** 行为准
> （程序化计数见 `research/_raw/t22/checklist.json` 的 `items87Count: 47`）。逐条原文见
> `research/_raw/t38/section87-precheck.md` §5 与 `checklist.json` 的 `items87[].text`。
> **本文只读生产文件**；写入仅限 `research/coverage-expansion-v1-acceptance.md` 与 `research/_raw/t22/**`。

---

## 0. 结论（先给裁决）

| 问题 | 结论 |
|---|---|
| §87 是否 47 条全部满足？ | **是，47/47 判定为 pass**（逐条证据见 §2） |
| 是否有任何 FAIL 项？ | **无**。§87 47 条中 0 条 FAIL、0 条 NOT_APPLICABLE |
| P0 计数 | **0**（依据见 §3） |
| P1（未关闭）计数 | **0**（依据见 §3） |
| REPAIR_NOW 计数 | **0**（依据见 §3） |
| §88「假完成」是否有一种成立？ | **没有任何一种成立**（逐条见 §4） |
| 能否据此宣布完成？ | **可以**。前提与边界见 §6（不含任何未验证项） |

**一句话**：47 条逐条有载体、有命令、有实测读数；三份独立产物（报告 / 自审 / 本文）互不复制；
唯一曾阻断发布的 CI 红已定位为**测试取数方式缺陷**（非数据缺陷）并修复，修复前后都有可复跑反证。

---

## 1. 本轮的现场事实（全部可复跑）

| 事实 | 读数 | 取得方式 |
|---|---|---|
| 冻结 tip 全量门禁 | **49 步 · 48 过 / 0 红 / 1 跳过（跳过=npm ci）· exit 0** | `node research/_raw/coverage-expansion-v1/t18-gate-runner.cjs` |
| 门禁自证无并发编辑 | `concurrentEdits.headChanged = false` | 同上产物的 `concurrentEdits` |
| 构建可复现 | A 293 文件 / B 293 文件 · **逐字节一致 = true**（HTML 176/176） | 门禁 extras `buildAB` |
| 报告确定性 | 两次 `--json` stdout sha256 相同 `0b801f419f30c45b…` | 门禁 extras `report` |
| 本地站点验收 | **735 项 / 失败 0** | `node scripts/tools/verify-site.js` |
| 合并 | PR **#38** · merge SHA **`d444dcd732edcd7a4255fd48b707dbece7938970`** · 2026-10-04T18:00:12Z | `gh pr view 38` |
| 必需检查 | **`gate` = pass**（收口提交 `29282ae` 上 run `37222401719`，3m28s） | `gh pr checks 38` |
| 部署 | **success**（run `37222667957`，head `d444dcd7`） | `gh run view` |
| 线上生效 | 版本信号变（`Last-Modified` 07:16:27 → **18:03:37**；7 条路由 ETag 逐条变）· `data-model` **0 → 44** | `node research/_raw/t40/compare-live.cjs --before=…/live-baseline.json --poll-after=…/after-deploy.json --require-deployed` ⇒ **exit 0** |
| 线上冒烟 | **735 项 / 失败 0**（第 1 次 `ERR_CONNECTION_CLOSED`，第 2 次通过 ⇒ 网络抖动） | `node scripts/tools/verify-site.js --url=https://buguoshixc.github.io/ai-deals-aggregator/` |
| 线上目录状态分布 | `unknown 40 / current 3 / legacy 1`，与本地对照基线**逐格相同** | 直读线上 `/models.json` 与 `/models/` |

---

## 2. §87 逐条判定（47 条）

**状态取值**：`pass`（证据在盘且本轮读到/跑到）· `FAIL`（不成立）· `NOT_APPLICABLE`（不适用）。
本轮 **47 条全部 pass**，无 FAIL、无 NOT_APPLICABLE。

### A. 基线与分层（1–4）

| # | 原文（题面） | 判定 | 证据位置 / 可执行命令 |
|---|---|---|---|
| 1 | 基于最新 `origin/master` | **pass** | `git merge-base --is-ancestor d57aa3ef HEAD` ⇒ exit 0（`origin/master` 是分支祖先）；合并前实测 `master` 与分支已一致（`master` tip = `d57aa3ef`，即合并父提交）。合并后 `master` = **`d444dcd7`**。载体：`research/_raw/coverage-expansion-v1/baseline.json` |
| 2 | 没有重复造 Coverage Report | **pass** | 全仓唯一入口 `scripts/tools/coverage-report.js`；被引用两处：`package.json` 的 `report:coverage`、`.github/actions/gate/action.yml` 的门禁步骤。命令 `node scripts/tools/coverage-report.js` ⇒ exit 0 |
| 3 | Target Provider Universe 有唯一来源 | **pass** | `scripts/data/coverage-targets.json`（**34** 条 targets）+ `scripts/lib/coverage-targets.js`；`node scripts/tools/coverage-targets-selftest.js` ⇒ **110 项通过 / 0 失败** |
| 4 | Coverage Target 与 Production Truth 分层 | **pass** | `coverage-targets.json` **不进**发布产物（`data-docs-selftest` 的 PUBLIC_DATASETS/Manifest 双向对账）；`node scripts/tools/data-docs-selftest.js` ⇒ **58/0** |

### B. 12 家目标调查与「不强迫 adopted」（5–6）

| # | 原文（题面） | 判定 | 证据位置 / 可执行命令 |
|---|---|---|---|
| 5 | 12 家目标全部完成调查 | **pass**（口径写死：**8 + 4 = 12**） | `research/_raw/coverage-expansion-v1/firstparty.json` 的 `vendors` = **8**（`xai, mistral, cohere, iflytek, baichuan, stepfun, sensetime, ai360`）+ `research/_raw/coverage-expansion-v1/inference.json` 的 `providers` = **4**（`groq, together, fireworks, cerebras`）。**coding 候选 6 家属另一类**（Coding 产品，不计入这 12）。载体另有 `research/coverage-expansion-v1-provider-review.md` |
| 6 | 不强迫 12 家全部 adopted | **pass** | `firstparty.json` 的 `notAdopted` = **10** 条（逐条带理由）；`inference.json` 的 `providerDecisions` 同样逐家带裁决；`coverage-targets.json` 的 4 条 rulings（2 `unverifiable` + 2 `deferred`）；`research/_raw/coverage-expansion-v1/coding.json` 的 `summary` = `adopt 1 / adoptPartial 2 / alreadyCovered 1 / notAdopted 1 / candidates 6` |

### C. releasedAt / modelRole / freshness 判据（7–17）

| # | 原文（题面） | 判定 | 证据位置 / 可执行命令 |
|---|---|---|---|
| 7 | `releasedAt` 与 `firstSeen` 分离 | **pass** | 来源层 `scripts/data/models.json` 写 `releasedAt`（**有值 4 / null 40**）；`firstSeen`/`lastSeen` 只出现在派生产物 `models.json`。`node scripts/tools/models-selftest.js` ⇒ **143/0** |
| 8 | `releasedAt` 有官方 evidence | **pass** | 同上的 `releaseEvidence` **非空 4 条 = 有日期的全部 4 条**（互为充要，由 `validateRegistry` 判红）；`models-selftest` 143/0 |
| 9 | 无证据日期保持 unknown/null | **pass** | 来源层 40 条 `releasedAt: null`；派生产物 `catalogStatus` = `unknown` **40**。`node scripts/tools/model-freshness-selftest.js` ⇒ **100/0**。没有任何一条日期是猜的 |
| 10 | 新增 `modelRole` | **pass** | `scripts/data/models.json` 的 `modelRole` 非空 **44/44**；词表在 `scripts/lib/model-registry.js`；`node scripts/tools/model-role-vocabulary-selftest.js` ⇒ **7 项通过 / 0 失败**（exit 0；枚举契约守卫）；另 `node scripts/tools/models-selftest.js` ⇒ **143/0** |
| 11 | comparable group 不跨 developer/family/role | **pass** | `scripts/lib/model-freshness.js` 的 `comparableGroupOf`；`model-freshness-selftest` **100/0**（含跨 role/family/developer 不互相淘汰的分支） |
| 12 | Freshness Policy 单一实现 | **pass** | 同上模块的 `MODEL_FRESHNESS_POLICY`（指纹 `v1;default=conversational;conversational=120/240;infrastructure=365/730;multimodal=180/365`）；覆盖报告只读它，不自己重算 |
| 13 | 不读墙上时钟决定 catalogStatus | **pass** | `scripts/lib/model-freshness.js` 内 `Date.now` **0 次**；`model-freshness-selftest` 100/0 |
| 14 | 不用版本号自动判新旧 | **pass** | 同上模块**没有**版本号解析（`v` 只出现在策略指纹前缀）；`model-freshness-selftest` 100/0 |
| 15 | current / aging / legacy / historical / unknown 可区分 | **pass** | `CATALOG_STATUSES` = 五值封闭枚举；实盘分布 `{unknown:40, current:3, legacy:1}`（`aging`/`historical` 实例为 0 —— 见 §6 边界）。报告文本与 JSON 双侧新增五态普查（`catalogStatusCensus`，`sum == registryModels == 44` 硬断言） |
| 16 | unknown 不被静默隐藏 | **pass** | `DEFAULT_VISIBLE_CATALOG_STATUSES = ["current","aging","unknown"]`（unknown **在**可见集合内）；`node scripts/tools/models-page-selftest.js` ⇒ **115/0** |
| 17 | 每个 active comparable group 至少有 current/unknown | **pass** | `model-freshness-selftest` **100/0** 的不变量 + `node scripts/tools/model-freshness-sensitivity.js` ⇒ exit 0（±90 天扰动） |

### D. Registry identity / legacy 保留 / 历史（18–21）

| # | 原文（题面） | 判定 | 证据位置 / 可执行命令 |
|---|---|---|---|
| 18 | legacy 不删除 Registry identity | **pass** | `scripts/data/models.json` **44/44**；身份漂移 **新增 0 / 删除 0**（`research/coverage-expansion-v1-self-audit.md` §身份层：`removedIds = 0`、`sameIdentityDifferentId: []`）；`node research/_raw/t38/baseline-diff.cjs` |
| 19 | legacy detail route 保留 | **pass** | 线上 `/models/deepseek-v3.2/` **200** 且带 `data-release-date` ≥1（`compare-live.cjs`）；`dist/sitemap.xml` 模型路由 44/44 |
| 20 | History 没被重写 | **pass** | 三份 history 的 `baseline` 段逐字节不变、基线 events 0 缺失、只追加（plan +14 / api-plan +4 / deal +0）；`node research/_raw/t38/baseline-diff.cjs` |
| 21 | API Pricing 没因 catalog filter 丢真值 | **pass** | `api-plans.json` **17** 条记录 / **93** 条计价条目；`baseline-diff.cjs` 显示 13 → 17，**删除 0、同 id 被改 0** |

### E. /models/ 页面与 No-JS（22–24）

| # | 原文（题面） | 判定 | 证据位置 / 可执行命令 |
|---|---|---|---|
| 22 | `/models/` 默认减少旧型号干扰 | **pass** | `scripts/lib/models-page.js` 默认隐藏集合 `["legacy","historical"]`；`models-page-selftest` **115/0**；线上 `/models/` 的 `models-show-legacy` 计数 **= 1** |
| 23 | 用户可查看旧型号 | **pass** | 同上自测里的「显示旧型号」入口断言；线上实测该入口存在（`models-show-legacy` 0 → **1**） |
| 24 | No-JS 完整 | **pass** | `dist/models/index.html` 静态 `<tr>` **45** 行（44 模型 + 表头）；线上 `data-model` **= 44**、`data-item` **= 44**；真浏览器断言 `verify-site.js` ⇒ **735/0**（**本地 + 线上各跑一次**） |

### F. 覆盖口径（25–28）

| # | 原文（题面） | 判定 | 证据位置 / 可执行命令 |
|---|---|---|---|
| 25 | Current Model Coverage 使用目标集合做分母 | **pass** | `node scripts/tools/coverage-report.js --json` → `coverageTargets.currentModels.declaredTargets = 20`（分母 = `coverage-targets.json` 的 current targets，**不是** registry 的 44） |
| 26 | Historical Depth 与 Current Coverage 分开 | **pass** | 同 JSON：`registryModels = 44` 与 `declaredTargets = 20` 并列；`unknownReleaseDates = 40`、`legacyOrHistorical` 单列 |
| 27 | 不存在无意义大量新增旧模型 | **pass** | 身份漂移 **新增 0 / 删除 0**；本轮新增的是 record / plan，不是 registry 身份（`self-audit` 身份层表：models slug 44 → 44） |
| 28 | Provider / Model identity 没靠名字相似度自动合并 | **pass** | 判据是**精确相等**（`scripts/lib/model-registry.js`，无相似度）；对抗性审查 `research/_raw/t26/report.md` **verdict = pass**（12 条声明 × 17 探测键 ⇒ 折叠身份命中 0）；变异电池 **CAUGHT 24/27** |

### G. Source Health（29–30）

| # | 原文（题面） | 判定 | 证据位置 / 可执行命令 |
|---|---|---|---|
| 29 | Source Health 已审查 | **pass** | 载体：`research/coverage-expansion-v1-source-health-rulings.md`（**18,418 B**，人读报告：逐源一行 = 源 / 基线状态 / 现状态 / 连续失败峰值 / 裁决 / 理由 / 复查条件）。**活读数**：`scripts/data/source-health.json` 的 `generatedAt = 2026-10-04T16:31:52Z` 时为 **healthy 8 / failed 1**（Futurepedia，`consecutiveFailures = 10`，`HTTP 403`） |
| 30 | 长期失败 source 有明确裁决 | **pass** | 同上文件对长期失败的 Futurepedia 给出**具体裁决**（不是「待观察」）；并由 `coverage-targets.json` 的 `blockedBySourceHealth` 与报告的 `sourceHealth.declaredSources` 承接 |

> **口径提示（不许写错）**：source-health 是**活读数**。任何「已恢复 / 9-9 healthy」都必须带上
> `generatedAt` + `consecutiveFailures` 一起写；t38 预映射当时的「缺证据」已被这份人读报告关闭。

### H. 确定性与不变量（31–37）

| # | 原文（题面） | 判定 | 证据位置 / 可执行命令 |
|---|---|---|---|
| 31 | Analytics 本地仍零请求 | **pass** | `node scripts/tools/analytics-selftest.js --dir=dist` ⇒ exit 0（门禁第 41 步；本地 0 次外部分析请求） |
| 32 | Build deterministic | **pass** | 门禁 extras `buildAB`：A **293** 文件 / B **293** 文件 · **逐字节一致 = true** · `different: []` |
| 33 | Registry rebuild deterministic | **pass** | 门禁 extras `models`：`--dry-run` exit 0 且「models.json 与盘上逐字节一致 / links 与盘上逐字节一致」；`node scripts/tools/check-models-reproducible.js` ⇒ exit 0（44 模型 · 82 映射） |
| 34 | Coverage JSON deterministic | **pass** | 门禁 extras `report`：两次 `--json` 的 stdout **sha256 相同** = `0b801f419f30c45b0327c5d6e4f5415b241fc2b35b21da39efe4b8815328ee70` |
| 35 | Stable IDs 无非预期变化 | **pass** | 44 slug 未变、同 slug 的 id 未变、重算 `sha1('model|'+slug)` 与产物 id 全部一致；`self-audit`：`sameIdentityDifferentId: []`、`removedIds = 0` |
| 36 | Sitemap 无非预期丢页 | **pass** | 线上 `<loc>` **170 → 173**（+3，与 C5 一手构建读数 173 一致）；44/44 模型路由在；`node research/_raw/t38/site-facts.cjs` |
| 37 | Feed / Manifest 无非预期变化 | **pass** | 门禁第 42 步「Feeds reproducibility（build twice, byte-compare）」exit 0；`data-docs-selftest` **58/0**（Manifest ↔ 注册表双向对账）；线上 `/feeds/` 200 |

### I. 变异 / Self-Audit / 门禁 / CI / 部署（38–47）

| # | 原文（题面） | 判定 | 证据位置 / 可执行命令 |
|---|---|---|---|
| 38 | Mutation / Tooth Tests 已真实执行 | **pass** | `research/_raw/t17/MUTATION-RESULTS.md`：**27 例 · CAUGHT 24 · 对照组 1 · 留档盲区 2 · 非预期红 0 · 变异应用失败 0**；日志 `research/_raw/t17/logs/battery.json`。两条盲区见 §6 |
| 39 | Self-Audit 已完成 | **pass** | `research/coverage-expansion-v1-self-audit.md`（12 节 · 15 行矩阵）；与 t20 报告**互相独立**（见 §5） |
| 40 | Self-Audit 中 REPAIR_NOW = 0 | **pass** | 同上 §8「Findings 与 Fixes」：`REPAIR_NOW = 0`；7 条曾为 P0/P1 的 finding **全部 closed** 且每条有可复现证据 |
| 41 | P0 = 0 | **pass** | 同上 §8 表：**P0 = 0** |
| 42 | P1 = 0 | **pass** | 同上 §8 表：**P1（未关闭）= 0** |
| 43 | Full Gate 全绿 | **pass** | `node research/_raw/coverage-expansion-v1/t18-gate-runner.cjs` ⇒ **49 步 · 48 过 / 0 红 / 1 跳过 · exit 0**；产物 `research/_raw/coverage-expansion-v1/t18-gate-results.json`（`gateSummary.failedNames: []`、`headChanged: false`） |
| 44 | Required CI 全绿 | **pass** | PR #38 的必需检查 **`gate` = pass**（run `37222401719`，3m28s，head `29282ae`）；`master` push 上的 gate run `37222667715` 亦 **success**。另：`node scripts/tools/check-ci-consistency.js --expect-checks=38` ⇒ 38 项 0 失败；`--expect-checks=37` **必须 exit 1**（反证，已登记） |
| 45 | Deploy 成功 | **pass** | run `37222667957`（`Deploy to GitHub Pages`，head `d444dcd7`）⇒ **success** |
| 46 | Online Smoke 成功 | **pass** | `compare-live.cjs --require-deployed` ⇒ **exit 0**（4/4 期望成立：`data-model == 44` · `models-show-legacy ≥ 1` · legacy 详情页 `data-release-date ≥ 1` · 7 条路由 200）；`verify-site.js --url=` ⇒ **735 项 / 失败 0** |
| 47 | 最终报告与 Self-Audit 报告已提交 | **pass** | `research/coverage-expansion-v1-report.md`（t20，含本轮 append 的 §16.1 部署读数）与 `research/coverage-expansion-v1-self-audit.md`（t21）**均已落盘**；本轮以**显式列路径**的提交纳入版本库（禁止 `git add -A`） |

### 统计

| 判定 | 条数 | 编号 |
|---|---|---|
| **pass** | **47** | 1–47 |
| FAIL | 0 | — |
| NOT_APPLICABLE | 0 | — |

---

## 3. P0 / P1 / REPAIR_NOW 三个计数的依据

| 计数 | 值 | 依据 |
|---|---|---|
| **P0** | **0** | `research/coverage-expansion-v1-self-audit.md` §8 表逐条判定：全轮 finding 里没有一条落在「会不会让线上出错」上；本轮独立复跑的门禁与独立重算**全部一致** |
| **P1（未关闭）** | **0** | 同上 §8 表：7 条曾为 P1/blocker 的 finding **全部 closed**，每条带可复现证据（t14-F1/F2/F3 · T18-F1 · t28-F1 · t15-F1/F2） |
| **REPAIR_NOW** | **0** | 同上 §8：无任何 finding 被标 `REPAIR_NOW`；两份独立审查（`t15` 数据质量审查、`t26` 对抗性审查）的关闭记录见 `research/_raw/t28/` 与登记表 |

**交叉印证**：`research/_raw/t26/report.md`（对抗性审查）verdict = **pass**；
`research/coverage-expansion-v1-data-quality-review.md`（t15）verdict = needs_revision，
但其全部 finding 都落在证据字段的表达保真度，且 **T15-F6 已被现场证伪**（审查员拿错对照物）——
两者都不产生 P0。合起来支持「P0 = 0，P1 = 0」。

---

## 4. §88「假完成」逐条：一种都不成立

**口径说明（如实登记）**：题面 §88 的清单在本轮抽成 **15 行**（`checklist.json` 的 `items88Count: 15`），
而任务书文字里写的是「十四种」。**两种读法下结论完全相同** —— 下面 15 行逐行给「不成立」的理由与证据，
所以无论按 14 还是 15，都没有一种成立。

| # | 假完成形态 | 是否成立 | 为什么不成立（证据） |
|---|---|---|---|
| 1 | 只增加模型数量，没有 Coverage Target | **不成立** | `coverage-targets.json` 新增 **34** 条 targets（基线 0）+ `coverage-targets-selftest` **110/0**；覆盖报告文本与 `--json` 双侧都有 Target 层（§87 第 3/4 条） |
| 2 | Coverage Report 写了，但数字不是从生产数据派生 | **不成立** | 报告唯一入口 `coverage-report.js` 读的就是盘上生产数据；门禁 extras `recompute` 独立重算（`pricingItems 93 / claims 81 / unclaimed 12 / apiProviders 14 / codingPlans 37 / codingProviders 18`）与报告一致；t41 把写死计数改成派生式，`models-page`/`vendor-page` 的静态计数改为派生 |
| 3 | releasedAt 大量靠猜 | **不成立** | 有日期的 **4 条全部带 `releaseEvidence`**（互为充要，缺失即判红）；其余 **40 条保持 `null`**（§87 第 8/9 条） |
| 4 | firstSeen 被拿来当发布时间 | **不成立** | `firstSeen`/`lastSeen` 只在派生产物；`releasedAt` 只在来源层；两者由 `validateRegistry` 分离（§87 第 7 条） |
| 5 | 所有模型最后仍全部 current，但没有解释 | **不成立** | 实盘 `{unknown: 40, current: 3, legacy: 1}` —— **不是全部 current**，且报告文本新增「五态普查」一行并解释 `unknown 40` 的成因（只有 4 条有官方 `releasedAt` 证据）；`sum == 44` 是硬断言 |
| 6 | legacy 直接从 Registry 删除 | **不成立** | 身份漂移 **删除 0**；`deepseek-v3.2` 仍在 44 条里且线上详情路由 **200**（§87 第 18/19 条） |
| 7 | 模型详情页 404 | **不成立** | 线上 `/models/deepseek-v3.2/` **200** 且带 `data-release-date`；sitemap 模型路由 44/44；本地 `verify-site` 735/0 含 44 个详情页（§87 第 19 条） |
| 8 | 历史价格被清理 | **不成立** | 三份 history 的 `baseline` 快照逐字节不变、只追加（plan +14 / api-plan +4）；`api-plans` 13 → 17 且**删除 0、同 id 被改 0**（§87 第 20/21 条） |
| 9 | 12 个 Provider 强行全部 adopted | **不成立** | `firstparty.json` 的 `notAdopted` = **10** 条（带理由）；`coverage-targets.json` 有 2 `unverifiable` + 2 `deferred`；Coding 侧 `adopt 1 / adoptPartial 2 / alreadyCovered 1 / notAdopted 1`（§87 第 6 条） |
| 10 | 第三方目录被当官方证据 | **不成立** | 「官方页面明写」按 `sourceType` 分档（`official / curated / directory / unknown`）：`directory` 档 **29 → 0**（移出 29 处）；`inferred` 字段单列 28 处；官方域判据由 `validate` 的「官方域判据（t7）」执行（§87 第 8 条） |
| 11 | 为了 Gate 绿删除断言 | **不成立** | `self-audit`：「降低断言的文件 **0 个**」；自测判定点数**只增不减**（feeds 131→132 / data-docs 60→61 / api-plans 147→148 / e2e 30→33 / coverage-targets 96→**110**）；t44 的反证逐条给了「违规 ⇒ 必红」 |
| 12 | 只跑 happy path，没有 mutation | **不成立** | 变异电池 **27 例 · CAUGHT 24 · 留档盲区 2 · 非预期红 0**；两层反证牙（R4 五态、词表外 status）都动态喂坏输入并断言报告非 0（§87 第 38 条） |
| 13 | Self-Audit 只复制完成报告 | **不成立** | 两份产物**互相独立**（见 §5）：自审有自己独立复跑的门禁读数、身份层矩阵、findings 分级表，且**如实写入两处不利事实**（source-health 漂移、T15-F6 审查侧误判） |
| 14 | CI 没跑却写「应该通过」 | **不成立** | CI **真的跑过**：PR #38 的 `gate` = **pass**（run `37222401719`）· `master` push 的 gate run `37222667715` = **success**。且本轮曾连续两次真红，报告如实登记了红与根因，没有写成「应该通过」 |
| 15 | Deploy 没跑却写「线上正常」 | **不成立** | Deploy run `37222667957` = **success**；线上冒烟有**部署后**读数（版本信号变 + `data-model` 0→44 + `verify-site` 735/0），并在报告 §16.1 如实登记了第一次 `ERR_CONNECTION_CLOSED` |

---

## 5. 两份报告互相独立（acceptance ④）

| 面 | 报告（t20） | Self-Audit（t21） |
|---|---|---|
| 性质 | **对外交付叙述**：Before→After、架构、覆盖结果、部署读数 | **对内审视**：独立复跑门禁、身份层矩阵、findings 分级、已知盲区 |
| 独立证据面 | 数据/页面读数 + 部署前后对照 | 自己重跑的 26 条命令 + 独立重算（不经报告） |
| 是否复制 | **否**。自审里没有一段是报告段落的搬运；两者的章节结构、判据、计数口径都不同 | |
| 不利事实 | 报告 §16.1 登记 CI 曾红及根因、冒烟第一次网络失败 | 自审登记 source-health 漂移与 T15-F6 审查侧误判 |

---

## 6. 边界与「未验证」清单（**不写成已满足**）

1. **CI 只在本机可达的网络下验证过**：`gate` 在 GitHub 托管的 Linux runner 上 pass；本机 Windows 上的门禁也 pass。
   本机无法在 Linux 上复现 CI 之外的其他环境（WSL 无 node），因此**没有**做第三平台验证 —— 这一条未验证。
2. **两条变异留档盲区依然存在**，必须与「CAUGHT 24/27」一起引：
   ①「测试改自己」在**构造上**任何门禁都接不住（`NOT_CAUGHT(KNOWN)`）；
   ② 真实引文是否忠于官方页**没有离线门禁**（靠三层覆盖：抄件逐字耦合 + 独立审查 + 引文自称牙）。
   **禁止**写「真实引文已逐条验真」「0 命中 ⇒ 引文都是真的」。
3. **`aging` / `historical` 实例为 0**：44 个模型里只有 4 条有官方 `releasedAt` 证据 ⇒ 40 条 `unknown`。
   这是「没证据就不猜日期」的直接后果，**不是**分档失效；但「五档都有实例」这一条**未验证**（也不该被验证为真）。
4. **source-health 是活读数**：本文引的 `healthy 8 / failed 1`（`generatedAt 2026-10-04T16:31:52Z`，Futurepedia `cf=10`）
   只在该时刻成立；后续轮次必须以**带 `generatedAt` + `cf` 的新读数**为准（append-only 更正，不改写历史）。
5. **CDN 延迟**：本次部署后约 40 秒即命中 `x-proxy-cache=MISS`，因此**没有**经历「等 10 分钟缓存过期」的路径；
   该路径（`max-age=600` 未过期时的处置）本轮**未验证**，但工具已内置该处置文案（`t40/README.md` §退出码表）。
6. **`--expect-checks=37` 必须 exit 1** 这条反证本轮**未重跑**（t38 附录 A 有历史读数），
   只作为登记口径引用；引它时必须写明是历史读数。
7. 本文**不宣称**任何未在盘上或未在本轮跑到的结论；上表每条 `pass` 都给了文件路径或可执行命令。

---

## 7. 复跑命令（一次跑完，全部只读）

```powershell
# §87 逐条核对的机器可读清单（47 条 + §88 15 行）
node research/_raw/t22/extract-checklist.cjs

# 冻结 tip 全量门禁（49 步）
node research/_raw/coverage-expansion-v1/t18-gate-runner.cjs

# 关键自测
node scripts/tools/coverage-targets-selftest.js        # 110/0
node scripts/tools/model-freshness-selftest.js          # 100/0
node scripts/tools/models-selftest.js                   # 143/0
node scripts/tools/models-page-selftest.js              # 115/0
node scripts/tools/data-docs-selftest.js                # 58/0
node scripts/tools/check-ci-consistency.js --expect-checks=38
node scripts/validate.js --strict

# 线上冒烟（先比较器，再全量）
node research/_raw/t40/compare-live.cjs --before=research/_raw/t40/live-baseline.json `
  --after=research/_raw/t40/after-deploy.json --require-deployed
node scripts/tools/verify-site.js --url=https://buguoshixc.github.io/ai-deals-aggregator/
```
