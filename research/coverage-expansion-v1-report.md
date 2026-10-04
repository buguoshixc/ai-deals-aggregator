# coverage-expansion-v1 · 最终完成报告

> 本报告写**实际结果**，每个数字都带出处（命令或文件）。凡**没有跑**的，一律写 **「未运行」**，不写"预计/应该"。
> - 分支 `coverage-expansion-v1` · 基线 `a4dd40f` · 写报告时 HEAD `2ebcf62` · 领先 `origin/master` **25** 个提交（`git rev-list --count origin/master..HEAD`）
> - 基线分母一律引用 `research/_raw/coverage-expansion-v1/baseline.json`（t1 在基线 SHA 上逐项重度量，含 5 条实测更正）
> - 素材盘点（每条读数的出处命令）见 `research/_raw/t39/report-inputs.md`；可复跑采集器 `node research/_raw/t39/collect.cjs --json`
> - 残余风险唯一收敛处：`research/coverage-expansion-v1-residual-register.md`（表头写着"t20/t21 必须引用本表"）

---

## 1. Baseline

**出处**：`research/_raw/coverage-expansion-v1/baseline.json`（t1 · `capturedAt 2026-10-04T18:14:30+08:00` · 基线 SHA `a4dd40fc66ea612f327036f5ba3d98cbff46c288`）。

| 面 | 基线值 | 出处字段 |
|---|---|---|
| deals 总量 / deal 行 / tool 行 | **135 / 80 / 55** | `data.deals` |
| deals 归一厂商键 | **31** | `data.deals.normalizedVendorKeys` |
| plans | **23 条 / 12 家** | `data.plans` |
| api-plans | **13 条记录 / 10 家 / 67 条计价条目 / 45 个不同 modelKey** | `data.apiPlans` |
| Model Registry 发布产物 | **44 个模型 / schemaVersion 1 / 全部 status=active** | `data.modelRegistry` |
| 关系层 links | **64**（全部 API 侧） | `data.modelRegistry.links` |
| 处置登记 declarations | **10** | `data.modelRegistry.gapDeclarations` |
| providers 注册数 | **23** | `data.providers` |
| deal-plan-links | **5 条关系 / 0 retired**（文件 5023 **字节**，不是条数） | `data.dealPlanLinks` |
| collectors | 代码注册 **7** + headless **2** = **9** | `collectors` |
| source-health | **healthy 8 / failed 1**；futurepedia **连续失败 9**、HTTP 403 | `collectors.statusCensus` / `knownLongTermFailure` |
| dist 产物 | **173 HTML / 290 文件 / sitemap 170 条**（在基线 SHA 上隔离构建 `--out=baseline.building` 一手数出） | `site` |
| gate 复合 action | **45 步** | `gates.gateStepCount` |
| `--expect-checks` | **37** | `gates.expectChecks` |
| package.json scripts / `selftest:*` | **90 / 22** | `gates.packageScripts` / `selftestScripts` |
| 本轮所需承载字段是否存在 | `coverageTargetsFileExists=false` · `releasedAtFieldExists=false` · `modelRoleFieldExists=false` · `catalogStatusFieldExists=false` | `measuredFacts.fieldProbe` |

**基线自带的 5 条实测更正**（`corrections`，逐条有实跑证据）：C1 gateStepCount 41→**45** · C2 expectChecks 36→**37** · C3 deal-plan-links 5023→**5 条**（5023 是字节数）· C4 futurepedia 连续失败 8→**9** · C5 dist 173 的来源从"主工作区二手"改为"基线 SHA 上隔离构建一手"。
**对账纪律**（`reconciliationRule`）：任何"改造后 vs 基线"的分子取同一命令的新度量，分母取本文件；与 45/37 对不上的（例如照抄任务书里的 41/36）以本文件为准。

**基线之后的数据面运行**（`postBaselineRuns` R1）：t13 真跑 9 个 collector 取证，`source-health.json` 由 8 healthy/1 failed 变为 **9/9 healthy**（futurepedia 归零）；deals 条目 **135 → 135 无增删改写**，仅 `updatedAt`/`lastSeen` 刷新；`deal-history.json` **零字节改动**。

---

## 2. Before → After

**出处**：基线见 §1；After 全部为本次现场读数（命令逐条给出）。

| 面 | Baseline | After | 出处命令 |
|---|---|---|---|
| providers 注册数 | 23 | **34** | `node -e "…providers.json 非 _ 键…"` |
| plans | 23 条 / 12 家 | **37 条 / 18 家** | `node -e "const p=require('./plans.json').plans;console.log(p.length,new Set(p.map(x=>x.provider)).size)"` → `37 18` |
| api-plans | 13 条 / 10 家 / 67 条目 / 45 modelKey | **17 条 / 14 家 / 93 条目 / 66 modelKey** | `node scripts/tools/coverage-report.js --json` → `api.*` |
| coverage-targets | **不存在**（`coverageTargetsFileExists=false`） | **34 行 / schemaVersion 1 / reviewedAt 2026-10-04** | `scripts/data/coverage-targets.json` |
| Model Registry schemaVersion | 1 | **2** | `models.json.schemaVersion` |
| 关系层 links | 64（全 API 侧） | **82**（API **69** + Coding **13**） | `scripts/data/model-registry-links.json` |
| 处置登记 declarations | 10 | **54**（Coding **42** + API **12**） | `scripts/data/model-registry-gaps.json` |
| 计价条目 | 67 | **93**（映射 81 + 处置 12 + 未判 0） | `coverage-report --json` 的 `registry.*` |
| 套餐侧模型串 | 19（其中已映射 9） | **55**（映射 13 + 已声明 42 + 未判 0） | 同上 `registry.planModelStrings` |
| gate 复合 action | 45 步 | **49 步** | `.github/actions/gate/action.yml`（`- name:` 计 49；`check-ci-consistency` (10) 报"共 49 步"） |
| `--expect-checks` | 37 | **38** | `verify.yml:118`；实跑 `✅ CI 口径检查 38 项，失败 0 项` |
| `selftest:*` | 22 | **25** | `package.json` |
| 模型状态语义 | 全部 `active`、无目录状态 | **catalogStatus 五态普查：current 3 · aging 0 · legacy 1 · historical 0 · unknown 40（和 44）** | `node scripts/tools/coverage-report.js --json`（文本行"catalogStatus 普查"） |
| providers 官方域 | — | google 追加 `codeassist.google`；新增 `jetbrains.com` / `replit.com` / `stepfun.com` / `baichuan-ai.com` / `sensetime.com` / `360.com` / `groq.com` / `together.ai` / `fireworks.ai` / `cerebras.ai` | `scripts/data/providers.json` |

---

## 3. Coverage Architecture

三层结构，**每层只有一个权威来源**：

| 层 | 回答什么 | 权威文件 | 本版状态 |
|---|---|---|---|
| 身份层 Model Registry | "这个模型是谁" | `scripts/data/models.json`（人工来源层）+ `models.json`（派生产物） | v2：44 条，新增 `modelRole` / `releasedAt` / `releaseEvidence` / `freshnessGroup`，派生 `catalogStatus` / `catalogReason` |
| 关系层 | "计价条目/套餐串对得上哪个身份" | `scripts/data/model-registry-links.json` | 82 条（API 69 + Coding 13），`_rules ⑥` 要求链接里的引文逐字复制记录引文 |
| 目标层 Coverage Targets | "**打算**覆盖什么"（只写意图，不写状态） | `scripts/data/coverage-targets.json` | 34 行 × 4 维度；`COVERED/PARTIAL/MISSING/…` 七态**全部派生**，无一个格子手写 |
| 处置登记 | "对不上单一身份的，逐条声明理由" | `scripts/data/model-registry-gaps.json` | 54 条声明（Coding 42 + API 12），双侧出口、同一本账 |

**展示判据层**：`scripts/lib/model-freshness.js`（唯一判据入口：不读墙上时钟、不联网、不用随机数）。它输出 `catalogStatus` 五态，`/models/` 页面的默认可见集合取自它导出的 `DEFAULT_VISIBLE_CATALOG_STATUSES = [current, aging, unknown]`。

**记账闭合**（`node scripts/tools/coverage-report.js --json`，现场）：`计价条目 93 = 已映射认领 81 + 已处置声明 12 + 未判 0`；套餐侧 `55 = 13 + 42 + 0`。报告自检 `✅ 覆盖报告自检通过（0 处问题）`（exit 0）。

---

## 4. Provider Universe

**35 行的意图层**与 provider 表**双向对账差集为空**（`research/_raw/t45/section41-audit.md` R1：declared / providersRegistered / withData 均 **34**）。
七态普查（34 行 × 4 维度 = **136 格**）：**COVERED 64 · NOT_APPLICABLE 50 · MISSING 17 · DEFERRED 2 · UNVERIFIABLE 2 · PARTIAL 1 · BLOCKED_SOURCE 0**（出处：`coverage-report --json` 的 `coverageTargets.states`，和 = 136）。

**MISSING 17 格的口径**：MISSING = "可覆盖、未延期、来源健康、**盘上一条数据都没有**"（真缺口）；`DEFERRED` / `UNVERIFIABLE` / `NOT_APPLICABLE` / `BLOCKED_SOURCE` **永不算 MISSING**（`scripts/lib/coverage-targets.js` 的 `deriveDimension()` if 链，`coverage-targets-selftest` 有专门的牙；t17 的 M25 变异证明该牙有效：给 DEFERRED 分支加 `row.count === 0 → MISSING` 短路 ⇒ 自测 exit 1、10 项失败）。

**候选总账**（`candidates`）：**total 40 · adopted 13 · notAdopted 21**；与 basline 的 `existingCandidateRegistrations` 40 = 13 + 21 + 6（alreadyCovered）同源。未采纳 provider 逐条 **13 项**（`gaps.notAdoptedProviders[]`）。

---

## 5. 12 家 Candidate Review（逐一有结论）

| # | 候选 | 结论 | 落盘 | 证据 |
|---|---|---|---|---|
| 1 | JetBrains AI | **adopt** | 2 条套餐（AI Pro $10/月 · AI Ultimate $30/月） | `jetbrains.com/ai-ides/buy/` 内嵌商品目录 JSON 逐字（`"code":"AIP"` + `yearlyPerMonth:["US $8.33"]`） |
| 2 | Replit Core/Pro | **adopt-partial** | 2 条套餐（Core $20 · Pro $100） | `replit.com/pricing` 逐字 `Core $20 / $18 / month, billed annually`；Enterprise=Custom 不收 |
| 3 | Gemini Code Assist | **adopt-partial** | 2 条套餐（Standard $22.80 · Enterprise $54） | `codeassist.google/` 四组价；**翻案**：上一版记"官方页 500 不可用"，本版实测 200 且价格可读 |
| 4 | Amazon Q Developer | **adopt-partial** | 2 条套餐（Free $0 · Pro $19） | `aws.amazon.com/q/developer/pricing/` 逐字 perpetual Free Tier + 4,000 LOC/月/用户 |
| 5 | Claude Code | **already-covered** | 0 条新增 | 它是 Claude Pro/Max 的权益；既有 Pro 记录已含官方逐字 `Claude Code: Pro Yes` |
| 6 | Tabnine | **not-adopted** | 0 条 | `tabnine.com/pricing` **302 → tricentis.com/contact-us**（官方独立档价面已不存在；不用第三方价顶替） |
| 7 | Groq | **adopt** | 1 条 API 记录（26 条目中的 6 条） | `console.groq.com/docs/models` 逐字 "PRICE PER 1M TOKENS" |
| 8 | Together AI | **adopt** | 1 条 API 记录（10 条模型） | `docs.together.ai/docs/serverless/models.md`（Chat 表 20 行三列价） |
| 9 | Fireworks AI | **adopt** | 2 条 API 记录（Standard + Priority 各 10 条） | `docs.fireworks.ai/serverless/pricing.md` |
| 10 | Cerebras | **adopt-partial** | 1 条 API 记录（2 个模型） | `www.cerebras.ai/pricing` Developer Tier 表（其余模型走 Enterprise quote，完整 Tier 表客户端渲染取不到） |
| 11 | xAI / Mistral / Cohere | **unverifiable** | 0 条 | 三家官方域（含 docs 子域）`fetch failed` / 正文被前端渲染吃掉；**不用第三方来源顶替** |
| 12 | Kiro（Amazon Q 的替代品） | **deferred（超出本轮范围）** | 0 条 | 官方 Amazon Q 页逐字建议改用 Kiro；题面 6 家名单不含它 |

> 12 家的映射依据：t9/t24 的候选清单（4 家推理平台 + 6 家国际 Coding）加上 already-covered 的 Claude Code 与超范围的 Kiro；逐条的访问失败形态与逐字引文见 `research/coverage-expansion-v1-provider-review.md` 与 `research/_raw/coverage-expansion-v1/{inference,coding,firstparty}.json`。

---

## 6. Coding Review

| 读数 | 值 | 出处 |
|---|---|---|
| plans 总量 / provider 数 | **37 / 18** | `node -e "…plans.json…"` → `37 18` |
| api-plans 记录 / 计价条目 | **17 / 93** | `coverage-report --json` |
| Coding 套餐新增（本轮） | **8 条**（JetBrains 2 · Replit 2 · Gemini 2 · Amazon Q 2） | `plans.json` 新增记录（`firstSeen 2026-10-04`） |
| 中国侧 Coding 新增 | Step Plan 4 档 + 讯飞 Astron Coding Plan 2 档 | `plans.json`（stepfun / iflytek） |
| 一律不收的档（有判据） | Replit Enterprise(Custom) · IDESPR-AIU(仅商业+年付+捆绑) · Gemini $75(另一件商品) · Claude Max(From $100 非固定价) · Tabnine(无官方价) | 逐条见 provider review |
| 额度单位口径 | 钱/行数 ⇒ `quota.type=other` **不折算**（Replit `$20/$100 towards models`、Amazon Q `4,000 LOC`）；次数 ⇒ `requests`；Credit ⇒ `credits` + 官方换算（stepfun `1M Credit = ¥1`）；官方无数字 ⇒ `rate_limited` 且不写数字 | `plans.json` 的 `quota` 字段 |

---

## 7. Model Freshness

**阈值（唯一出处：`scripts/lib/model-freshness.js` 的 `MODEL_FRESHNESS_POLICY`）** —— ⚠️ 任务书点名的 `docs/MODEL-FRESHNESS-POLICY.md` **在盘上不存在**（`fs.existsSync` 为 false），本报告改引代码常量这个唯一判据入口：

| 档 | current 窗口 | aging 窗口 | 角色 |
|---|---|---|---|
| conversational | 120 天 | 240 天 | general · fast · reasoning · coding |
| multimodal | 180 天 | 365 天 | vision · audio · realtime |
| infrastructure | 365 天 | 730 天 | embedding · translation · other |

**判据语义**：`gap = latestComparableReleasedAt − releasedAt`（**相对差**，不是"今天减发布日期"）⇒ 一个模型哪怕发布两年，只要它仍是本组最新，`gap` 就是 0 ⇒ `current`。边界取**半开区间**（`gap < 窗口` 才算落在窗口内）。**不读墙上时钟**：自测把 `Date.now` 换成会抛错的函数后仍跑通，且同一输入两次派生逐字节一致。

**真实数据是否命中 aging/legacy —— 如实回答**：
- `catalogStatus` 普查 **current 3 · aging 0 · legacy 1 · historical 0 · unknown 40（和 44）**（`coverage-report --json` 文本行，与 `models.json` 独立计数一致）。
- 即：**`aging` 与 `historical` 在真实数据上 0 命中**，`legacy` 只命中 1 条（`deepseek-v3.2`，官方 Change Log 日期 2025-12-01，被同族两条更新的官方日期取代）。
- **成因**：44 条里只有 **4 条**有官方发布日期证据（`releasedAt` 非空 4 / null 40）⇒ 其余 40 条只能是 `unknown`，而 `unknown` **默认可见**（绝不等于 legacy）。
- **分支可工作性由夹具/变异证据承担**：`model-freshness-selftest.js` **100 项**覆盖五个分支（current/aging/legacy/historical/unknown）+ 119/120/239/240 四个边界 + 跨 role/family/developer 不互相淘汰 + `freshnessGroup` 逐条覆盖 + 四条硬不变量的变异牙；`model-freshness-sensitivity.js` 12 个 ±60/±90 情景全部列出翻转与"整组 0 可见状态"。

**灵敏度复查结论**：判据对阈值**没有"平移免疫"** —— 两轴同时 ±90 天仍翻转 17 / 13 条（边界整体位移使隐藏/可见互换）；真正不变的是组内相对次序（`gap=0` 那条永远 current）。任何情景下不变量都成立：**含 active 的比较组没有任何一组掉到 0 个可见状态**。

---

## 8. Currentness Migration

| 读数 | 值 | 出处 |
|---|---|---|
| 迁移覆盖 | **44/44**（键集合对账 missing 0 / extra 0） | `scripts/data/models.json` × `currentness.json` |
| 写出字段 | `modelRole` / `releasedAt` / `releaseEvidence` / `freshnessGroup`（键序 = schema 的 `ENTRY_KEY_ORDER`）+ 派生 `catalogStatus` / `catalogReason` | `scripts/lib/model-registry.js` |
| 身份漂移 | **0**（slug 列表含顺序与基线逐序相同、派生 id 逐条相同） | t3 独立验证（`models-selftest` 亦有牙） |
| 官方发布日期 | **4 条**：deepseek-flash `2026-09-10` · deepseek-v3.2 `2025-12-01` · deepseek-v4-pro `2026-08-13` · minimax-m3 `2026-06-01` | 逐条引文见 `research/coverage-expansion-v1-model-currentness.md` |
| 无日期 | **40 条** `releasedAt=null`，每条带 `checkedOutcome`（官方站 404 / 页面无日期 / 只有下线日三类情形） | `currentness.json` |
| `freshnessGroup` | **1 条**（`deepseek-flash = current-mainline`），其余 43 条 `null` 且逐条写理由 | `scripts/data/models.json` |
| 角色分布 | general 24 · vision 8 · fast 6 · other 2 · translation 2 · embedding 1 · coding 1 | `models.json` 按 `modelRole` 计数 |
| 口径说明 | 调查口径（llm/vlm/multimodal_llm/…）与身份层口径（general/vision/…）**是两套词表、不要求相等**；映射表写在 `currentness.json` 的 `_roleVocabularyMapping` | t10/t2 |

---

## 9. Coverage Results

| 读数 | 值 | 出处 |
|---|---|---|
| 计价条目方程 | **93 = 已映射认领 81 + 已处置声明 12 + 未判 0** | `node scripts/tools/coverage-report.js`（文本"API 侧记账"行）+ JSON `registry.*` |
| 套餐串方程 | **55 = 已映射 13 + 已声明 42 + 未判 0** | 同上 |
| 未映射模型 / 未映射套餐串 | **0 / 0** | `registry.unmappedModels[]` / `unmappedPlanModels[]` |
| API 侧处置逐条留档 | **12 行**（`declaredApiEntryRows[]`，reason 全为 `off-registry-model`） | 同上 |
| 目标层七态 | COVERED 64 · N.A. 50 · MISSING 17 · DEFERRED 2 · UNVERIFIABLE 2 · PARTIAL 1 · BLOCKED 0（和 136） | `coverageTargets.states` |
| 报告自检 | `✅ 覆盖报告自检通过（0 处问题）`（exit 0） | 现场跑 |
| 机器可读输出确定性 | **两次 `--json` stdout 逐字节一致**（sha256 `7e50e31df838c966…`；JSON 段 `72b2bab384489e1a…`；`generatedAt` 稳定为数据日期 `2026-10-04`） | t39 现场核对 |

---

## 10. Data Added

| 面 | 新增 | 出处 |
|---|---|---|
| providers | **11 家新增**（ai360 · baichuan · stepfun · sensetime · replit · aws · jetbrains · groq · together · fireworks · cerebras）+ google 追加 `codeassist.google` | `scripts/data/providers.json`（23 → 34） |
| plans | **+14 条**（aws 2 · google 2 · jetbrains 2 · replit 2 · iflytek 2 · stepfun 4） | `plans.json`（23 → 37） |
| api-plans | **+4 条记录 / +26 条计价条目**（groq 6 · together 8 · fireworks 10 · cerebras 2） | `api-plans.json`（13 → 17；67 → 93） |
| coverage-targets | **新文件 34 行**（= 当前 providers 全部身份，双向对账差集为空） | `scripts/data/coverage-targets.json` |
| Model Registry v2 | 44 条补四字段 + 派生两字段；关系层 +18 条（64 → 82）；处置登记 +44 条（10 → 54） | `scripts/data/models.json` / `model-registry-links.json` / `model-registry-gaps.json` |
| 官方域 | 11 家新 provider 的官方域 + google 的 `codeassist.google` | `providers.json` |

---

## 11. Data Not Added（有理由的缺口，不是漏判）

| 未落盘 | 理由 | 出处 |
|---|---|---|
| 12 条 `DEFER-INF-01..12` | schema 表达力缺口（batch 只有比例且三家规则冲突 / 缺 `per_hour` / 记录级 unit 装不下 token+字符 / 缺 variant 位 / 按参数量分档兜底价 / per megapixel / 官方自称"estimate 不是 rate"的 pass-through / 预留容量类非按量产品 / 完整 Tier 表取不到 / Contact Sales 单元） | 残余登记表 §1 (f)；`inference.json` |
| 打包价 / 季付 / 积分 / 按小时 / 年付 | **刻意不落盘、不换算**（不许拆成 input=output=X，不许把季付伪装成 monthly） | 残余登记表 §1 (f) |
| Tabnine | `not-adopted`：官方独立档价面已不存在（302 → Tricentis 联系表单） | §5 第 6 行 |
| xAI / Mistral / Cohere | `unverifiable`：三家形态各异（fetch failed / 只剩导航） | §5 第 11 行 |
| Kiro | 官方建议的替代品，**不在本轮 6 家名单**；已记 deferred | §5 第 12 行 |
| Amazon Q 的时效事实 | 已落档但不新增记录：2027-04-30 起停支 IDE 插件 | `plans.json` 的 `billing.note`；coverage-targets 的 aws 行 |
| 转售/品牌化第三方路由 | 不得登记到持有者名下（如 `qwen-plus-360gpt-pro` 不记 ai360） | `firstparty.json` |
| 近一年前缘"官方页存在但价目表取不到" | Cerebras 完整 Tier 表（客户端渲染） | §5 第 10 行 |

---

## 12. Source Health

| 读数 | 基线 | 现在 | 出处 |
|---|---|---|---|
| source-health 状态普查 | **healthy 8 / failed 1** | **healthy 9 / failed 0** | `scripts/data/source-health.json`；基线 `collectors.statusCensus` |
| futurepedia | failed，HTTP 403，**连续失败 9** | **healthy**，产出 7 条，`consecutiveFailures=0` | 同上 + `research/coverage-expansion-v1-source-health-rulings.md` §2 |
| 裁决分布 | — | **keep ×7 + keep-degraded ×1（futurepedia）**；`retire` **0 条** | 同报告 §4 的逐条裁决表 |
| 纪律 | — | 「**source failure ≠ 历史 Deals ended**」：`deal-history.json` 在 t13 真跑期间**零字节改动** | `baseline.json` 的 `postBaselineRuns` R1 |

> **给 t21/t22 的口径**：§87 第 29/30 条（Source Health 已审查 / 长期失败 source 有明确裁决）**有载体** —— 载体是 `research/coverage-expansion-v1-source-health-rulings.md`（**18418 字节**，§2 归因实验 + §4 逐条裁决列 + §5.1 复查条件）这份**人读报告**；它**不是**逐源机读 JSON。此前一条审查把"人读载体"读成"缺证据"，已由队长现场复核更正。

---

## 13. Reproducibility

| 读数 | 值 | 出处 |
|---|---|---|
| `check:models:reproducible` | **exit 0**（`44 个模型 · 82 条映射 · updatedAt=2026-10-04T00:00:00+08:00`） | 现场跑 |
| `check:model-registry-links` | **exit 0**（候选 API 0 条 · 套餐 0 条） | 现场跑 |
| `check:plans:reproducible` / `check:api-plans:reproducible` | **exit 0** | 现场跑 |
| 覆盖报告 JSON | 两次运行**逐字节一致**（§9） | t39 |
| t39 采集器 | 两次 `--json` 均 **96854 字节**、sha256 均 `02dc435cc940c491…`（逐字节一致） | `research/_raw/t39/verify-determinism.cjs` |
| 构建确定性（build ×2 逐字节一致） | **未运行**（属 t18/t19；本报告不引用未跑读数） | — |
| 真浏览器验收（verify-site） | **见 §15**（t18 的 Full Gate 读数） | `research/_raw/coverage-expansion-v1/t18-full-gate-report.md` |

---

## 14. Gate

**全量门禁读数（唯一可信来源：t41 更新版 `research/_raw/coverage-expansion-v1/t18-full-gate-report.md`，跑在 HEAD `118a95c`）**：

> **49 步里 48 过、0 红、1 跳过**；跳过的仍是环境准备步骤 `npm ci`。

| 读数 | 值 | 出处 |
|---|---|---|
| action.yml 步骤数 | **49**（基线 45，t7 新增 4 步） | `.github/actions/gate/action.yml` |
| Full Gate 结果 | **48 过 / 0 红 / 1 跳过** | t18 报告 §0（`t18-gate-results.json`） |
| `check-ci-consistency` | **38 项 0 失败**（现场重跑 `✅ CI 口径检查 38 项，失败 0 项`）；`--expect-checks=38` 钉住；负向 `--expect-checks=37` ⇒ **exit 1**（实跑 38 ≠ 钉住 37） | 现场跑 |
| 反向登记制 (19) | 扫 **26** 个 `*selftest*.js`，26 个都有门禁指向，**豁免 0 条** | `check-ci-consistency` (19) |
| `validate --strict` | **exit 0**（警告 2 条：Getsolved / KREA 疑似未合并优惠，pre-existing） | 现场跑 |
| 各项自测 | models **143/0** · models-page **115/0** · coverage-targets **96/0** · freshness **100/0** · model-roles **7/0** · provenance **132/0** · feeds **144/0** · vendor（R5 已改派生式）| 现场跑 + t41 |
| `selftest:*` 登记 | **25 条**（基线 22），每条都被门禁真的跑到 | `package.json` (17) 断言 |
| 两套矛盾读数的处置 | t18 曾出现"steps failed 0"与"46/49 过"两套数字；R5 收口后**合并为一份自洽产物** | t18 §9 读数时间线 |

**未运行**：构建 A/B 逐字节对比、部署后的 CI 门禁（见 §15/§16）。

---

## 15. CI / Deploy

| 项 | 状态 | 出处 |
|---|---|---|
| 远端分支 | **尚未推送**（`git rev-list --count origin/master..HEAD` = **25**，分支只在本地） | 现场 `git` |
| PR | **未创建** | 未运行 |
| Deploy workflow | **未运行** | 未运行 |
| 部署预检可执行性 | 已确认可执行：gh 2.102.0 已登录 `buguoshixc`（含 repo+workflow 作用域）；Pages 已开且 `build_type: workflow` | `research/_raw/t37/t19-runbook.md` |
| 必需检查名 | `gate`；**但 `master` 当前没有分支保护** ⇒ gate 未过也能合并，只能靠人工确认 | t37 预检 |
| 部署触发链 | `Collect AI Deals`(workflow_run) → deploy.yml 的 prepublish（无 job 级 if）→ build → deploy | `check-ci-consistency` (12) |
| CDN 缓存 | `max-age=600`（部署后观察需等 10 分钟） | `research/_raw/t40/live-baseline.json` |

---

## 16. Online Smoke

**未运行** —— 线上冒烟必须等部署之后才有读数，本报告写到这里为止不臆造任何线上值。

**部署前已建立的机器对照物**（让"部署是否真的生效"可机器判定）：
- 基线快照：`research/_raw/t40/live-baseline.json`（2026-10-04T13:26:20Z：7 条路由全部 200，逐条记 `Last-Modified` / 各自不同的 `ETag` / `Cache-Control: max-age=600` / `Age` / `Content-Length`）
- 比较器 + 自比 0 差异反证 + "不是恒绿"的反向反证：`research/_raw/t40/`

**部署后要填的 14 格**（清单与取值命令见 `research/_raw/t39/report-inputs.md` §I）：线上 URL · Deploy 结论 · PR 必需检查名 · Last-Modified 前后 · ETag 前后 · 线上 `data-model` 计数 · `data-item` 计数 · `models-show-legacy` 计数 · 线上目录状态分布 · 冒烟项数与失败数 · CDN 延迟说明 · 远端分支事实。
**本地对照基线**（部署后应当能对上）：`dist/models/index.html` 的 `data-model` = **44** · `data-item` = **44** · 含 `models-show-legacy` = **true** · 目录状态分布 = **unknown 40 / current 3 / legacy 1**。

---

### 16.1 部署后补格（**append-only**：按 t19 回执填入，2026-10-04T18:00Z 合并 / 18:03Z 部署生效）

> 本节不修改上面任何一行历史结论（"未运行"是写下当时的真实状态，保留）。以下 14 格是**部署后**实测值，
> 全部在本机直连 `github.io` 取得（本轮实测本机直连可用；`web_fetch` 回退未用上）。

| # | 读数 | 值 | 取得方式 |
|---|---|---|---|
| 1 | 线上 URL | `https://buguoshixc.github.io/ai-deals-aggregator/` | `fetch` |
| 2 | Deploy 结论 | **success**（run `37222667957`，head = `d444dcd7`） | `gh run view` |
| 3 | PR 必需检查名 | **`gate`** = **pass**（run `37222401719`，3m28s，head `29282ae`） | `gh pr checks 38` |
| 4 | PR / 合并 | PR **#38**，`mergeStateStatus` = CLEAN，**merge SHA `d444dcd732edcd7a4255fd48b707dbece7938970`**（2026-10-04T18:00:12Z，`--merge --delete-branch=false`） | `gh pr view` / `gh api` |
| 5 | Last-Modified 前 → 后 | `Sun, 04 Oct 2026 07:16:27 GMT` → **`Sun, 04 Oct 2026 18:03:37 GMT`** | `compare-live.cjs` |
| 6 | ETag 前 → 后（根路由） | `W/"6ac1fd4b-6197c"` → **`W/"6ac294f9-619aa"`**（7 条路由 ETag **逐条都变**） | `compare-live.cjs` |
| 7 | 线上 `data-model` 计数 | **0 → 44** | `compare-live.cjs` + 直读页面 |
| 8 | 线上 `data-item` 计数 | **44** | 直读 `/models/` |
| 9 | 线上 `models-show-legacy` 计数 | **0 → 1** | `compare-live.cjs` |
| 10 | 线上目录状态分布 | **unknown 40 / current 3 / legacy 1**（与本地对照基线逐格相同；`models.json` 的 `count` = 44 · `models[]` = 44） | 直读 `/models.json` |
| 11 | legacy 详情页 `data-release-date` | **0 → 1**（`/models/deepseek-v3.2/`） | `compare-live.cjs` |
| 12 | 冒烟项数与失败数 | `compare-live.cjs --require-deployed` **exit 0**（4/4 期望成立：`data-model`==44 · `models-show-legacy`≥1 · `data-release-date`≥1 · 七条路由 200）· `verify-site.js --url=` **735 项 / 失败 0**（第 1 次 `ERR_CONNECTION_CLOSED`，第 2 次通过 ⇒ 网络抖动，非断言失败） | 两条命令的 exit code |
| 13 | CDN 延迟说明 | **本次无需等缓存**：轮询第 1 次（部署后约 40 秒）即命中 `x-proxy-cache=MISS`、`Age=4`，版本信号已变 ⇒ 未使用任何查询串绕缓存 | `compare-live.cjs` 轮询输出 |
| 14 | 远端分支事实 | 分支 `coverage-expansion-v1` **已推送并在合并后保留**（`--delete-branch=false`）；合并后 `master` = `d444dcd7` | `git ls-remote` / `gh api` |

**sitemap 附带读数**：`<loc>` **170 → 173**（+3；与 C5 的一手构建读数 173 一致，基线 170 是**更早**的旧版读数）。

**本次冒烟的两条边界（如实登记）**：
1. 本报告 §15 里"远端分支尚未推送"是**写下当时**的真值；实际推送发生在 `503edde`（2026-10-04T17:17Z 之前），
   本节第 14 格是**更新后**的事实。两处并存，不互相覆盖。
2. 合并前 CI 曾连续两次红在 `coverage-targets-selftest.js` 的「（隔离上游）JSON 可解析」。**根因不在数据**：
   `runReport()` 直接读子进程 stdout（管道），而 `report:coverage --json` 的 stdout 约 218 KB 超过管道缓冲，
   CI(Linux/Node 24.21) 只取回 152,627 字符 / 185,186 字节（本机 180,774 / 218,443，且正好切在多字节字符中间）
   ⇒ JSON 未终止 ⇒ 解析失败并连带跳过 33 条下游断言（110 项 → 75 项）。改为把子进程 stdout 重定向进**文件**
   再整份读回后，CI `gate` 转绿（run `37221436064` pass · 3m24s；收口提交 `29282ae` 上 run `37222401719` pass）。
   反证：同一份输入下管道捕获与文件捕获**逐字节相同**（sha256 `0b801f419f30c45b`）。

---

## 17. Data Integrity

| 面 | 结论 | 出处 |
|---|---|---|
| deals 未误删 | 135 → **135**，非易变字段改动 **0** | `baseline.json` `postBaselineRuns` R1 |
| 历史未改写 | `deal-history.json` 在 t13 真跑期间**零字节改动** | 同上 |
| 身份零漂移 | slug 列表含顺序与基线逐序相同、派生 id 逐条相同（44/44） | t3 独立验证 |
| 引文保真 | **三层覆盖、没有第四层**：(a) 抄件逐字耦合（API 侧 59 条一致 / 不一致 0）·(b) 独立审查（t15 抓到 4 条改写件 → t33 改为官方逐字片段，提交 `af92d5d`）·(c) 自称牙（`scanQuoteSelfClaims()`：**292 条 quote / 13 篇文件 · 0 命中**；注入真实记录 `4987c183fc1a` ⇒ exit 1、**恰好 1 处**、点名 `deals.json deals[130].evidence[0].quote`） | 残余登记表 §4.3；`research/_raw/t35/M24-BOUNDARY.md` |
| 禁止措辞（不许写） | ❌「真实引文已逐条验真」 ❌「0 命中 ⇒ 引文都是真的」 | 同上 |
| 数据质量独立审查 | **verdict = needs_revision**：数值面零错误，问题集中在证据字段的表达保真度（F1/F2/F3 medium；F4–F8 low）；**其中 T15-F6 已被现场证伪**（审查员拿错对照物） | `research/coverage-expansion-v1-data-quality-review.md` + 队长的 append-only 更正 |
| 对抗性审查 | **verdict = pass**：12 条声明 × 17 个探测键 × 4 类精确相等探测 ⇒ 对 44 个折叠身份命中 **0**；删任一条声明 6 个门禁全红 | `research/_raw/t26/report.md` |
| 变异电池 | **27 例 · CAUGHT 24 · 对照组 1 · 留档盲区 2 · 非预期红 0 · 逐字节恢复失败 0**；共享树在用例执行窗口内**逐字节未变** | `research/_raw/t17/MUTATION-RESULTS.md` |
| 跨层命名歧义 | 报告 JSON `declaredApiEntries`（数）= lib `declaredApiIdentities`；报告 `declaredApiEntryRows`（行）= lib `declaredApiEntries` —— 已加注释写死（t29），**未重命名冻结键** | `scripts/tools/coverage-report.js` |
| 写死计数依赖数据 | 全仓扫出 **133 条**依赖数据规模的字面量期望，逐条三分类；已修 4 条关系式判据（t44）+ R5 派生式（t41） | `research/_raw/t42/hardcoded-expectations.md` |

---

## 18. Page-level evidence（"默认隐藏"与"No-JS 完整"）

**产物文件**：`dist/models/index.html`（**143263 字节**）。

| 断言 | 读数 | 断言名/出处 |
|---|---|---|
| 旧模型默认隐藏 | 目录状态分布 **unknown 40 / current 3 / legacy 1**；默认隐藏集合 = `[legacy, historical]`（来自 `lib/model-freshness.js` 的 `DEFAULT_HIDDEN_CATALOG_STATUSES`） | `models-page-selftest` · `node scripts/tools/coverage-report.js --json` |
| 隐藏的东西点得到 | 产物含 `models-show-legacy` 入口（`legacyToggleId: true`）；勾选后可见行 = 全部 **44** 行 | 产物断言 + `verify-site` |
| No-JS 仍完整 | 静态表 `data-model` 行 = **44** · `data-item` 行 = **44**；无 JS 时静态表仍是全部 44 行且**没有一行预先隐藏**、**0 个控件**（控件由脚本动态建） | `models-page-selftest`（**115/0**）· t14/t28 的浏览器侧实测 |
| 真浏览器读数（t28 §22） | `/models/ 静态表行数 == 44` · 初始可见 **43** · 默认隐藏 **1** · 勾选后可见 **44** · 无 JS 时 hidden 属性 **0** | `research/coverage-expansion-v1-residual-register.md` §0 浏览器侧 |

---

## 19. Remaining Risks

> 完整清单与逐条状态见 `research/coverage-expansion-v1-residual-register.md`（仲裁 **34** 条 + 清单 sha256 `b9d97c444e7e59d0d90b2855165a1bc67422b2d0dc573805569d2cc5e6c6f696`）。**本报告不另起名单。**

| # | 残余 | 状态 / 口径 |
|---|---|---|
| 1 | 引文未点名的历史 API 映射 **34 条**（机器不可核价格归属） | 残余 (a)；清单 sha256 见上 |
| 2 | `aging` / `historical` 在真实数据 **0 命中** | 成因：只有 4 条有官方日期 ⇒ 40 条 `unknown`；分支可工作性由自测 100 项 + 灵敏度 12 情景承担（§7） |
| 3 | 真实引文是否忠于官方页 | **没有第四层**（三层覆盖，§17）；两条 M24 盲区已消歧入档 |
| 4 | 两条同名 M24 | ①「把 provenance 自测的牙拔掉 ⇒ 自测恒绿」= `NOT_CAUGHT(KNOWN)`，**测试改自己构造上接不住**；②「真实引文没有离线门禁」= **已关闭**（三层记账，provenance-selftest 114 → 132 项） |
| 5 | M26 | `PRECEDENCE` 死常量已删除（删除行只有那 3 行）⇒ 该变异**再也落不下去**；真判据出处标注在 `deriveDimension()` |
| 6 | 12 条 schema 表达力缺口 | `DEFER-INF-01..12` + 打包价/季付/积分/按小时/年付（§11） |
| 7 | `master` 无分支保护 | gate 未过也能合并 ⇒ **只能靠人工确认**（t37 预检） |
| 8 | 线上冒烟未做 | **未运行**；读数只能等部署后（§16） |
| 9 | §87 第 29/30 条口径 | 裁决载体是**人读报告** `research/coverage-expansion-v1-source-health-rulings.md`（18418 字节），不是逐源机读 JSON；此前一条审查把"人读载体"读成"缺证据"，已更正 |
| 10 | `docs/MODEL-FRESHNESS-POLICY.md` **不存在** | 阈值唯一出处是 `scripts/lib/model-freshness.js` 的 `MODEL_FRESHNESS_POLICY`（本报告 §7 已改引代码） |
| 11 | 交付台账缺口 | `research/coverage-expansion-v1-self-audit.md` 在本报告写作时**尚未落盘**（t21 在飞）；`acceptance`/§22 的最终验收由 t22 做 |
| 12 | 环境约束（影响可复跑） | 本轮多次撞 **429**（并发 / TPM）与一次 **503**；t15 的 `models.json` 有 8 个模型 `lastSeen` 由派生时间线变长而刷新（身份/角色/日期改动 **0**） |

---

## 附：未运行清单（集中一处，便于 t21/t22 核对）

- 线上冒烟（§16）—— 等部署
- 部署 workflow 与 PR 检查（§15）—— 等推送
- build A/B 逐字节对比（§13）—— 属 t18/t19，本报告未引读数
- 真浏览器验收的**本轮线上**版本（§18 引的是 t28 在**产物**上的实测，不是线上）
- `research/coverage-expansion-v1-self-audit.md`（t21 在飞；本报告不代写）
- 三份"最终版"调查文档的合并：`provider-review.md` / `model-currentness.md` 已在本轮复核并提交（见 §5/§8 引用）；两份文件的逐条读数以它们自身表头声明的出处为准
