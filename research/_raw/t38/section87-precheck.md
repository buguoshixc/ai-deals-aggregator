# §87 最终 Completion Checklist —— 预映射（t38，2026-10-04）

> **这是预映射，不是最终验收。** 本文件把题面 §87 的每一条先锚定到「哪份产物 / 哪条命令 / 哪个任务号」，
> 并如实标注**当前状态**；最终逐条判定仍由 **t22** 在 t20/t21（报告与 self-audit）之后做。
> 本文件只读生产文件、只写 `research/_raw/t38/`（未改登记表、未改报告正文、未动任何生产文件）。

**状态取值只有四种**（第 3 条要求三种 + 明令的"未核对"）：

- `已可证` —— 证据已在盘上，且**本轮我亲自读到/跑到**（见附录 A 的命令记录）。
- `待产出` —— 依赖 t18/t19/t20/t21 的产物，注明等谁。
- `缺证据` —— 现在**没有载体**，写清缺什么、需要谁补。
- `未核对` —— 我没亲自跑/读的部分一律这样写，**不写"通过"**。

---

## 0. 两处口径前置（t22 必须先读）

1. **题面 §87 现在是 47 条**（题面文件第 2568–2614 行，逐条 `- [ ]`，程序化计数见附录 B）。
   而 t22 的任务文本写的是"§87 的 44 项清单" —— **两者不一致**，以题面文件为准（47 条）。
   本文件按 47 条逐条映射；若按 44 条判定，会漏掉至少 3 条。
2. 题面原文里**没有编号**（只有 `- [ ]` 列表）。本文件的编号 1–47 是**按出现顺序自编的定位用编号**，
   便于 t22 引用；引用时请连原文一起引，不要只引编号。

---

## 1. 逐条预映射（47 条）

> 表格里的「原文」逐字抄自题面（只去掉了行首的 `- [ ] `）；「载体」= 文件路径 · 可执行命令 · 产出任务号。

### A. 基线与分层（1–4）

| # | 原文（题面） | 证据载体（文件 · 命令 · 任务） | 状态 |
| --- | --- | --- | --- |
| 1 | 基于最新 `origin/master` | `research/_raw/coverage-expansion-v1/baseline.json`（t1）· `git merge-base --is-ancestor origin/master HEAD && git log --oneline -1 origin/master && git rev-list --count origin/master..HEAD` · t1 | **已可证**（本轮实测：`origin/master = a4dd40f` 是 HEAD 祖先；HEAD 领先 **15** 个提交。合并前需重跑 —— 见风险 R4） |
| 2 | 没有重复造 Coverage Report | `scripts/tools/coverage-report.js` · `node scripts/tools/coverage-report.js`（本轮 exit 0）· t5/t25 | **已可证**（全仓只有一份入口：`package.json:75` 的 `report:coverage` 与 `.github/actions/gate/action.yml:278` 各引用它一次，无第二个 coverage 报告脚本） |
| 3 | Target Provider Universe 有唯一来源 | `scripts/data/coverage-targets.json`（唯一权威，34 行）· `scripts/lib/coverage-targets.js` · `node scripts/tools/coverage-targets-selftest.js`（本轮 **96/0**）· t5 | **已可证** |
| 4 | Coverage Target 与 Production Truth 分层 | `scripts/data/coverage-targets.json`（内部维护层，不发布）· `node scripts/tools/data-docs-selftest.js`（本轮 **57/0**）+ 上一条自测里的"不进 PUBLIC_DATASETS / Manifest / feeds"断言 · t5 | **已可证** |

### B. 12 家目标调查与"不强迫 adopted"（5–6）

| # | 原文（题面） | 证据载体（文件 · 命令 · 任务） | 状态 |
| --- | --- | --- | --- |
| 5 | 12 家目标全部完成调查 | `research/_raw/coverage-expansion-v1/firstparty.json`（`vendors` **8** 家：xai, mistral, cohere, iflytek, baichuan, stepfun, sensetime, ai360）· `research/_raw/coverage-expansion-v1/inference.json`（`providers` **4** 家：groq, together, fireworks, cerebras）· `research/coverage-expansion-v1-provider-review.md` · `node -e "…读三份 JSON 的 providers/vendors 数量…"`（见附录 B）· t8 / t9 | **已可证**（8 + 4 = 12 家，每家在 JSON 里都带 `officialDomainsCandidate` / `access` / `apiPricing` / `currentTargetModels` / `ruling` 等字段） |
| 6 | 不强迫 12 家全部 adopted | 上面两份 JSON 里的 `ruling` / `notAdopted`（firstparty `notAdopted` 10 条，带具体理由）· `research/_raw/coverage-expansion-v1/coding.json` 的 `summary`（adopt 1 / adoptPartial 2 / alreadyCovered 1 / notAdopted 1）· `scripts/data/coverage-targets.json` 的 4 条 rulings（2 `unverifiable` + 2 `deferred`）· t8 / t9 / t11 | **已可证** |

### C. releasedAt / modelRole / freshness 判据（7–17）

| # | 原文（题面） | 证据载体（文件 · 命令 · 任务） | 状态 |
| --- | --- | --- | --- |
| 7 | `releasedAt` 与 `firstSeen` 分离 | `scripts/data/models.json`（来源层写 `releasedAt` + `releaseEvidence`）· 根 `models.json`（派生产物写 `firstSeen`/`lastSeen`，由引用方派生）· `node scripts/tools/models-selftest.js`（本轮 **143/0**）· t2 | **已可证**（来源层 44 条里 `releasedAt` 有值 4 / 空 40；`firstSeen`/`lastSeen` 只出现在派生产物） |
| 8 | `releasedAt` 有官方 evidence | 同上的 `releaseEvidence`（非空 **4** 条 = 有日期的**全部** 4 条，互为充要由 `validateRegistry` 判红）· `node scripts/tools/models-selftest.js`（143/0）· t2/t10 | **已可证** |
| 9 | 无证据日期保持 unknown/null | `scripts/data/models.json`（40 条 `releasedAt: null`）· 根 `models.json` 的 `catalogStatus`（`unknown` **40**）· `node scripts/tools/model-freshness-selftest.js`（本轮 **100/0**）· t2/t4 | **已可证**（没有一条日期是猜的：有证据的 4 条带引文，其余 40 条保持 null） |
| 10 | 新增 `modelRole` | `scripts/data/models.json`（`modelRole` 非空 **44/44**）· `scripts/lib/model-registry.js` 的 `ENTRY_KEY_ORDER` / `MODEL_ROLES` · `node scripts/tools/models-selftest.js`（143/0）· t2 | **已可证** |
| 11 | comparable group 不跨 developer/family/role | `scripts/lib/model-freshness.js` 的 `comparableGroupOf` · `node scripts/tools/model-freshness-selftest.js`（**100/0**，含跨 role/family/developer 不互相淘汰的分支）· t4 | **已可证** |
| 12 | Freshness Policy 单一实现 | `scripts/lib/model-freshness.js` 的 `MODEL_FRESHNESS_POLICY`（指纹 `v1;default=conversational;conversational=120/240;infrastructure=365/730;multimodal=180/365`）· 报告只读它（`node scripts/tools/coverage-report.js` 的 Freshness 一节）· t4 | **已可证** |
| 13 | 不读墙上时钟决定 catalogStatus | `scripts/lib/model-freshness.js`（`Date.now` 在代码里 **0** 次；唯一的 `new Date(` 是 `Date.UTC(...)` 日历往返校验，与"现在几点"无关）· `node scripts/tools/model-freshness-selftest.js`（100/0）· t4 | **已可证**（计数命令见附录 A） |
| 14 | 不用版本号自动判新旧 | `scripts/lib/model-freshness.js`（模块内**没有**版本号解析；`v` 只出现在策略指纹前缀 `v${policy.schemaVersion}`）· 同上的自测（100/0）· t4 | **已可证** |
| 15 | current / aging / legacy / historical / unknown 可区分 | `scripts/lib/model-freshness.js` 的 `CATALOG_STATUSES` = `["current","aging","legacy","historical","unknown"]` · 根 `models.json` 现状分布 `{unknown:40, current:3, legacy:1}` · t4 | **已可证**（"可区分"是**词表与判据**层面的：五档枚举齐、判据只此一处；当前 `aging`/`historical` 实例为 0 —— 见风险 R8） |
| 16 | unknown 不被静默隐藏 | `DEFAULT_VISIBLE_CATALOG_STATUSES = ["current","aging","unknown"]`（unknown **在**默认可见集合里）· `dist/models/index.html`（静态页面里 `legacy`/`historical` 字样出现 8 次，说明隐藏集合被显式表达）· t6/t4 | **已可证** |
| 17 | 每个 active comparable group 至少有 current/unknown | `scripts/lib/model-freshness.js` 的不变量 + `node scripts/tools/model-freshness-selftest.js`（**100/0**）+ `node scripts/tools/model-freshness-sensitivity.js`（±90 天扰动，本轮 exit 0）· t4 | **已可证** |

### D. Registry identity / legacy 保留 / 历史（18–21）

| # | 原文（题面） | 证据载体（文件 · 命令 · 任务） | 状态 |
| --- | --- | --- | --- |
| 18 | legacy 不删除 Registry identity | `scripts/data/models.json`（44 条，含 legacy 的 `deepseek-v3.2`）· `scripts/data/model-registry-links.json`（82 条）· `node research/_raw/t38/baseline-diff.cjs`（vs `a4dd40f`：新增 0 / 删除 0）· t2/t12 | **已可证** |
| 19 | legacy detail route 保留 | `dist/sitemap.xml`（`/models/<slug>/` 去重后 **44/44**，无缺）· `dist/models/deepseek-v3.2/index.html`（存在，70921 字节）· `node research/_raw/t38/site-facts.cjs` · t6 | **已可证** |
| 20 | History 没被重写 | `scripts/data/deal-history.json` / `plan-history.json` / `api-plan-history.json` 的 `baseline` 段逐字节不变（三份都 true）· `node research/_raw/t38/baseline-diff.cjs`（基线 events 0 条缺失；只追加：plan +14 / api-plan +4 / deal +0）· t12/t2 | **已可证** |
| 21 | API Pricing 没因 catalog filter 丢真值 | `api-plans.json`（17 记录 / 93 计价条目）· `node research/_raw/t38/baseline-diff.cjs`（vs `a4dd40f`：13 → 17 条，**删除 0、同 id 被改 0**）· t11/t23 | **已可证** |

### E. /models/ 页面与 No-JS（22–24）

| # | 原文（题面） | 证据载体（文件 · 命令 · 任务） | 状态 |
| --- | --- | --- | --- |
| 22 | `/models/` 默认减少旧型号干扰 | `scripts/lib/models-page.js`（默认隐藏集合 `["legacy","historical"]`）· `node scripts/tools/models-page-selftest.js`（本轮 **115/0**）· t6 | **已可证** |
| 23 | 用户可查看旧型号 | 同上（"显示旧型号"入口的断言在该自测里）· `dist/models/index.html` 静态产物 | **已可证** |
| 24 | No-JS 完整 | `dist/models/index.html` 静态 `<tr>` **45** 行（44 模型 + 表头）· `node scripts/tools/models-page-selftest.js`（115/0）· **真浏览器断言** `node scripts/tools/verify-site.js`（735 项）· t6（浏览器部分见风险 R3） | **已可证**（静态侧）；浏览器侧我本轮**未跑**，属 `未核对` |

### F. 覆盖口径（25–28）

| # | 原文（题面） | 证据载体（文件 · 命令 · 任务） | 状态 |
| --- | --- | --- | --- |
| 25 | Current Model Coverage 使用目标集合做分母 | `node scripts/tools/coverage-report.js --json` → `coverageTargets.currentModels.declaredTargets = 20`（分母 = `coverage-targets.json` 的 current targets，不是 registry 的 44）· t5 | **已可证** |
| 26 | Historical Depth 与 Current Coverage 分开 | 同上的 JSON：`registryModels = 44` 与 `declaredTargets = 20` 并列；`unknownReleaseDates = 40`、`legacyOrHistorical = [deepseek-v3.2]` 各自单列 · t5 | **已可证** |
| 27 | 不存在无意义大量新增旧模型 | `node research/_raw/t38/baseline-diff.cjs`（身份漂移：新增 0 / 删除 0 —— 本轮新增的是 record / plan，**不是** registry 身份）· t11/t2 | **已可证** |
| 28 | Provider / Model identity 没靠名字相似度自动合并 | `research/_raw/t26/report.md`（对抗性审查 **verdict = pass**）· `research/_raw/t17/MUTATION-RESULTS.md`（电池 27 例，`CAUGHT 24/27`）· `scripts/lib/model-registry.js`（判据是**精确相等**，无相似度）· t23/t26/t17 | **已可证** |

### G. Source Health（29–30）—— **本任务点名的缺证据**

| # | 原文（题面） | 证据载体（文件 · 命令 · 任务） | 状态 |
| --- | --- | --- | --- |
| 29 | Source Health 已审查 | **部分载体**：`research/coverage-expansion-v1-residual-register.md` 第 219–238 行（t34 记录的 F6 更正：基线 `a4dd40f` 的 `scripts/data/source-health.json` = 9 条 `{healthy:8, failed:1}`，现盘 9/9 healthy，t13 报告原句"已更新 source-health.json"为真）· `scripts/data/source-health.json`（现盘 9/9 healthy）· **缺**的是 t13 的**审查/裁决**记录 · t13 | **缺证据**（快照侧有载体；"审查结论 + 每源裁决"没有载体 —— 见风险 R1） |
| 30 | 长期失败 source 有明确裁决 | 同上。历史事实（futurepedia HTTP 403 ×9 → 基线里 `failed:1`）只在基线 blob 与登记表的 F6 更正里；现盘 `futurepedia` 已 `healthy`（`lastSuccessAt=2026-10-04T10:34:24Z`、`consecutiveFailures=0`）。**裁决本身（repair / headless migration / keep-degraded / retire）没有落盘载体**：我在 `research/` 下按 `source-health`/`t13` 名字搜过（只有 `research/_raw/coverage-expansion-v1/probe-futurepedia.cjs` 探针脚本），`scripts/data/source-probes.json` 里也没有 `ruling/decision/裁决/keep-degraded/retire` 一类字段 · t13 | **缺证据**（见风险 R1） |

### H. 确定性与不变量（31–37）

| # | 原文（题面） | 证据载体（文件 · 命令 · 任务） | 状态 |
| --- | --- | --- | --- |
| 31 | Analytics 本地仍零请求 | `scripts/tools/analytics-selftest.js`（首行红线：Beacon 定义只有一处 / 每页 exactly 1 / **本地绝不发送**）· `node scripts/tools/analytics-selftest.js --dir=dist`（本轮 exit 0）· t9-analytics | **已可证** |
| 32 | Build deterministic | `research/_raw/coverage-expansion-v1/t18-extras.json` + `t18-gate-run.log`（"build A 293 文件 / B 293 文件 · 逐字节一致 = true"）—— **但这是 t18 在飞产物** · `node scripts/tools/build-local.js`（本轮 exit 0，只证明单次构建成功）· t18 | **待产出**（等 t18 定稿；我**不**据在飞日志判绿） |
| 33 | Registry rebuild deterministic | `node scripts/tools/check-models-reproducible.js`（本轮 exit 0：44 模型 · 82 映射 · updatedAt=2026-10-04T00:00:00+08:00）· t2 | **已可证** |
| 34 | Coverage JSON deterministic | `node scripts/tools/coverage-report.js --json`（本轮两次 stdout 逐字节一致，sha256 `7e50e31d…b751`）· t5/t25/t29 | **已可证** |
| 35 | Stable IDs 无非预期变化 | `node research/_raw/t38/baseline-diff.cjs`（44 slug 未变、同 slug 的 id 未变、重算 `sha1('model|'+slug)` 与产物 id 全部一致）· t2/t3 | **已可证** |
| 36 | Sitemap 无非预期丢页 | 部分证据（本轮）：`dist/sitemap.xml` 173 个 `<loc>`、44/44 模型路由在 · 基线对比的载体 = `research/_raw/coverage-expansion-v1/t18-extras.json`（`reconciliation`）· t18 | **待产出**（等 t18 的基线差；我本轮只验证了"现在没缺"，**没有**做基线对比） |
| 37 | Feed / Manifest 无非预期变化 | 部分证据（本轮）：`node scripts/tools/check-feeds-reproducible.js`（exit 0，两次构建逐字节一致）、`node scripts/tools/data-docs-selftest.js`（57/0，Manifest↔注册表双向对账）· 基线对比同上（t18 `t18-extras.json`）· t18 | **待产出**（等 t18 基线差；"可复现"我验证了，"与基线无意外变化"没有） |

### I. 变异 / Self-Audit / 门禁 / CI / 部署（38–47）

| # | 原文（题面） | 证据载体（文件 · 命令 · 任务） | 状态 |
| --- | --- | --- | --- |
| 38 | Mutation / Tooth Tests 已真实执行 | `research/_raw/t17/MUTATION-RESULTS.md`（27 例：`CAUGHT 24/27` · 对照组 1 · 留档盲区 2 · 非预期红 0）+ `research/_raw/t17/logs/battery.json` · 本轮 t35 又关了其中 2 条盲区（M24/M26）· t17/t35 | **已可证**（"执行过"可证；"覆盖率 24/27"里那 2 条留档盲区的处置见风险 R9） |
| 39 | Self-Audit 已完成 | `research/coverage-expansion-v1-self-audit.md` —— **本轮复核：文件不存在** · t21 | **待产出**（等 t21） |
| 40 | Self-Audit 中 REPAIR_NOW = 0 | 同上文件（不存在）+ `research/coverage-expansion-v1-residual-register.md`（t34 在改）· t21/t16 | **待产出**（等 t21） |
| 41 | P0 = 0 | 同上（self-audit 的 findings 分级）· t21 | **待产出**（等 t21） |
| 42 | P1 = 0 | 同上 · t21 | **待产出**（等 t21） |
| 43 | Full Gate 全绿 | `research/_raw/coverage-expansion-v1/t18-gate-results.json`（49 步）· `t18-gate-run.log`（末行"门禁 46/49 过 · build A/B 一致=true · report 两次一致=true"）—— **在飞**；本轮我独立跑的 9 条门禁见附录 A · t18 | **待产出**（等 t18 定稿；两份在飞产物表面读数不一致，见风险 R3） |
| 44 | Required CI 全绿 | GitHub Actions 的 gate run（PR 上）· `node scripts/tools/check-ci-consistency.js --expect-checks=38`（本轮 exit 0：**38 项 0 失败**，这只证明"登记口径与 workflow 一致"，**不是** CI 真跑过）· t19 | **待产出**（等 t19；CI 是否真跑过要看 PR 上的 run） |
| 45 | Deploy 成功 | deploy workflow 产物 + 线上站点 · `.github/workflows/deploy.yml` · t19 | **待产出**（等 t19） |
| 46 | Online Smoke 成功 | `scripts/tools/verify-site.js --url=<线上>` 的冒烟记录 · t19 | **待产出**（等 t19） |
| 47 | 最终报告与 Self-Audit 报告已提交 | `research/coverage-expansion-v1-report.md`（**本轮复核：不存在**）· `research/coverage-expansion-v1-self-audit.md`（不存在）· t20/t21 | **待产出**（等 t20/t21） |

### 状态统计

| 状态 | 条数 | 编号 |
| --- | --- | --- |
| 已可证 | **33** | 1–28、31、33、34、35、38 |
| 待产出 | **12** | 32、36、37、39、40、41、42、43、44、45、46、47 |
| 缺证据 | **2** | 29、30 |
| 未核对（局部） | 0（作为整条状态；24 的浏览器侧与 36/37 的基线差已并入上面的待产出/已可证备注） | — |

---

## 2. 缺证据 / 风险条目（本任务真正的产出）

| # | 缺什么 / 风险 | 影响哪几条 §87 | 建议谁补、怎么补 |
| --- | --- | --- | --- |
| **R1** | **Source Health 的"审查 + 每源裁决"没有盘上载体**（快照与更正有载体，裁决没有）。可引的载体只有：`scripts/data/source-health.json`（现盘 9/9 `healthy`；futurepedia `lastSuccessAt=2026-10-04T10:34:24Z`、`consecutiveFailures=0`）与 `research/coverage-expansion-v1-residual-register.md` 第 219–238 行的 F6 更正（基线 blob = `{healthy:8, failed:1}`，t13"已更新 source-health.json"为真）。**缺的是**：t13 对每个源（尤其长期失败的 futurepedia：基线 failed → 现 healthy）的**裁决**（repair / headless migration / keep-degraded / retire）与理由。按名字搜过 `research/`：只有 `research/_raw/coverage-expansion-v1/probe-futurepedia.cjs`（探针脚本）；`scripts/data/source-probes.json` 里也没有 `ruling/decision/裁决/keep-degraded/retire` 一类字段。 | **29、30** | **t13（data-integrator）**：落一份裁决记录（建议 `research/_raw/coverage-expansion-v1/source-health-review.md`：每源一行 = source / 基线状态 / 现状态 / 连续失败峰值 / 裁决 / 理由 / 复查条件），并在报告里引用它。**t20/t21**：在拿到这份载体之前，"Source Health 已审查 / 长期失败 source 有明确裁决"这两条**不许**判为满足 —— 快照变绿（哪怕是真恢复）不等于"审查过、裁决过"。 |
| **R2** | **§87 条数口径不一致**：题面文件现在是 **47** 条（程序化计数），t22 的任务文本写 **44** 条。 | 全部（尤其尾部 3 条：45–47 容易被漏判） | **t22**：以题面文件为准（47 条），并在判定记录里写明"以题面 2568–2614 行为准"；若 captain 认为口径应以 44 为准，需要先改题面或明确说明哪 3 条不计。 |
| **R3** | **t18 的在飞产物不能当结论**：`t18-gate-run.log` 末行写"门禁 **46/49** 过"，而 `t18-gate-results.json` 的 `steps`（49）里 `exitCode !== 0` 的条数是 **0** —— 两份在飞产物的表面读数不一致（3 步的判定字段需要 t18 自己说明，可能是 skip/未纳入 exit code）。 | **32、36、37、43** | **t18**：定稿时给出每步的判定字段与 46/49 的确切含义；**t22**：只引 t18 的定稿结论，不引在飞日志。 |
| **R4** | **合并窗口**：`origin/master` 在 t19 合并前可能前移（现在是 `a4dd40f`，HEAD 领先 15 个提交）。 | **1** | **t19**：merge 前重跑 `git merge-base --is-ancestor origin/master HEAD`；若前移，需要 rebase 后重跑 Full Gate。 |
| **R5** | **工作区当时有 22 个未提交改动**（21:15 盘点快照；此后仍在变 —— t34 的登记表、`research/_raw/t17/**` 等）。全量 Gate 与确定性结论必须在**干净树 / 固定 HEAD** 上得出。 | **32、33、34、36、37、43** | **t18/t19**：在结论里记下当时的 HEAD 与 `git status` 快照（`t18-gate-results.json` 已有 `head`/`statusBefore`/`statusAfter` 字段，请保留并在报告里引用）。 |
| **R6** | **deals.json 有 2 行被改**：`cb45e0c735bd`（HubSpot AEO Sensor）与 `9e7c938ec401`（Midjourney），改动字段只有 `lastSeen`（2026-09-30 → 2026-10-04）。属采集刷新，不是删真值；但"deals 逐字节不变"这类说法会与事实冲突。 | **20、21、36、37**（数据完整性叙述） | **t20/t21**：在数据完整性一节显式写出这 2 行与字段名；**不要**写"deals 完全没变"。 |
| **R7** | **"12 家"的口径要写死**：firstparty.json 8 家（xai/mistral/cohere/iflytek/baichuan/stepfun/sensetime/ai360）+ inference.json 4 家（groq/together/fireworks/cerebras）= 12；coding.json 的 6 家候选（国际侧）与中国侧 coding 候选是**另一类**（coding 产品，不是 provider 目标）。 | **5、6** | **t22**：判定 5/6 时写明口径（否则"12 家"会被读成含 coding 候选）。 |
| **R8** | **"五档可区分"≠"五档都有实例"**：现盘 `catalogStatus` 分布是 `{unknown:40, current:3, legacy:1}`，`aging` 与 `historical` 实例为 **0**。这是"没有证据就不猜日期"的直接后果（有 `releasedAt` 证据的只有 4 条），**不是**缺陷；但报告必须解释，否则会被读成"分档没生效"。 | **15、16、25、26** | **t20**：在 Freshness/Current Coverage 一节写清 unknown 40 的成因（releasedAt 证据只落了 4 条）与后续补法；**t4/t10**：若要减少 unknown，只能补官方日期证据（不许猜）。 |
| **R9** | **变异电池的 2 条留档盲区**：t17 电池 `CAUGHT 24/27`，2 条 `NOT_CAUGHT(KNOWN)`。本任务（t35）已关掉其中与"引文自称 / 死常量"有关的两条（M24/M26），但电池日志里 M24 那一行描述的是**另一个变异**（"把 provenance 自测的牙拔掉 ⇒ 自测恒绿"）——「测试自己改自己」在构造上无法由任何门禁接住。 | **38、39、40、41、42**（self-audit 要解释"已知盲区"） | **t21**：在 self-audit 里把"已知盲区"逐条列出（含每条的构造性理由），**不要**写成"0 盲区"；**t34**：登记表里两条盲区并列注明。 |

---

## 3. 附录 A：本轮我亲自跑过的命令与观察到的事实

（只列我本人执行并有输出的；时间窗 2026-10-04 21:13–21:55）

| 命令 | 结果 |
| --- | --- |
| `node research/_raw/t38/inventory.cjs --summary` | §87 条数 **47**；`origin/master=a4dd40f` 是祖先、HEAD 领先 15；registry 44/44；`modelRole` 44；`releasedAt` 4 有值 / 40 空；`releaseEvidence` 4；`catalogStatus {unknown:40,current:3,legacy:1}`；links 82 = API 69 + Coding 13；gaps 54 = API 12 + Coding 42；api-plans 17 / 93；plans 37；coverage-targets 34 行 = providers 34；身份漂移 0/0 |
| `node research/_raw/t38/site-facts.cjs` | `dist/models/index.html` 静态 `<tr>` 45；sitemap 173 `<loc>`、模型路由 44/44；legacy/unknown/current 各抽一个模型详情页都在；`CATALOG_STATUSES` 五值、`DEFAULT_VISIBLE=["current","aging","unknown"]`、`DEFAULT_HIDDEN=["legacy","historical"]`；`model-freshness.js` 代码里 `Date.now` 0 次 |
| `node research/_raw/t38/baseline-diff.cjs` | api-plans 13→17（删 0 / 改 0）；plans 23→37（删 0 / 改 0）；deals 135→135（删 0 / 改 2 行 `lastSeen`）；三份 history 的 `baseline` 快照逐字节相同、基线 events 0 缺失、只追加 +14/+4/0；稳定 ID 44/44 未变、重算 id 全一致 |
| `node scripts/validate.js --strict`（t35 轮次，本轮未重跑） | exit 0（含 `引文自称扫描 : 292 条 quote / 13 篇文件 · 0 命中`） |
| `node scripts/tools/coverage-targets-selftest.js` | **96/0**（exit 0） |
| `node scripts/tools/coverage-report.js --json` ×2 | exit 0/0 · 两次 stdout 逐字节一致（sha256 `7e50e31d…b751`）· JSON 自检 0 处问题 |
| `node scripts/tools/check-models-reproducible.js` | exit 0 · `44 个模型 · 82 条映射 · updatedAt=2026-10-04T00:00:00+08:00` |
| `node scripts/tools/check-model-registry-links.js` | exit 0 · 候选 API 0 / 套餐 0 |
| `node scripts/tools/check-feeds-reproducible.js` | exit 0 · `✅ 订阅可复现门禁：2 次构建，全部逐字节一致` |
| `node scripts/tools/check-ci-consistency.js --expect-checks=38` | exit 0 · `✅ CI 口径检查 38 项，失败 0 项` |
| `node scripts/tools/data-docs-selftest.js` | exit 0 · **57/0** |
| `node scripts/tools/models-selftest.js` | exit 0 · **143/0** |
| `node scripts/tools/models-page-selftest.js` | exit 0 · **115/0** |
| `node scripts/tools/model-freshness-selftest.js` | exit 0 · **100/0** |
| `node scripts/tools/model-freshness-sensitivity.js` | exit 0（±90 天扰动；非 active 组掉到 0 个可见状态属设计） |
| `node scripts/tools/seo-selftest.js` | exit 0 · **63/0** |
| `node scripts/tools/analytics-selftest.js --dir=dist` | exit 0（页面覆盖 176 HTML · bootstrap 176） |
| `node scripts/tools/build-local.js` | exit 0 · `✅ 构建完成 → dist/` |
| `git log --oneline -12` | HEAD `9f27836`；最近 12 条见 §1 第 1 条与附录 C |

**没有跑的（因此没有资格写"通过"）**：`verify-site.js`（735 项浏览器验收）· `rebuild-models --dry-run` · `check:plans:reproducible` / `check:api-plans:reproducible` / 两条 history 复核 · `selftest:plans` / `selftest:api-plans` / `selftest:history` / `selftest:archive` / `selftest:provenance`（t35 轮次跑过 132/0，本轮未重跑）· 两次完整 `build` 的 A/B 比对（t18 的活）· 任何线上冒烟。

---

## 4. 附录 B：盘点脚本（可重跑 · 只读）

| 脚本 | 用途 | 命令 |
| --- | --- | --- |
| `research/_raw/t38/inventory.cjs` | 数据/身份/产物存在性总盘点（含 §87 条数程序化计数、git 状态、与基线的身份漂移） | `node research/_raw/t38/inventory.cjs --summary`（或省略 `--summary` 输出 JSON） |
| `research/_raw/t38/site-facts.cjs` | 页面/站点产物侧：`/models/` 静态行数、sitemap 模型路由、每档详情页、Freshness 策略导出、墙上时钟静态证据 | `node research/_raw/t38/site-facts.cjs` |
| `research/_raw/t38/baseline-diff.cjs` | 对基线 `a4dd40f` 的差集：api-plans/plans/deals 的删改、三份 history 的 baseline 快照与 events 追加、稳定 ID | `node research/_raw/t38/baseline-diff.cjs` |

三者都**只读**（`git show` + `fs.readFileSync`），不写任何生产文件；本轮都跑过且 exit 0。

---

## 5. 附录 C：题面 §87 原文逐条（`D:\AI_DEALS_COVERAGE_EXPANSION_V1_PROMPT.md` 第 2568–2614 行）

```text
- [ ] 基于最新 origin/master
- [ ] 没有重复造 Coverage Report
- [ ] Target Provider Universe 有唯一来源
- [ ] Coverage Target 与 Production Truth 分层
- [ ] 12 家目标全部完成调查
- [ ] 不强迫 12 家全部 adopted
- [ ] releasedAt 与 firstSeen 分离
- [ ] releasedAt 有官方 evidence
- [ ] 无证据日期保持 unknown/null
- [ ] 新增 modelRole
- [ ] comparable group 不跨 developer/family/role
- [ ] Freshness Policy 单一实现
- [ ] 不读墙上时钟决定 catalogStatus
- [ ] 不用版本号自动判新旧
- [ ] current / aging / legacy / historical / unknown 可区分
- [ ] unknown 不被静默隐藏
- [ ] 每个 active comparable group 至少有 current/unknown
- [ ] legacy 不删除 Registry identity
- [ ] legacy detail route 保留
- [ ] History 没被重写
- [ ] API Pricing 没因 catalog filter 丢真值
- [ ] /models/ 默认减少旧型号干扰
- [ ] 用户可查看旧型号
- [ ] No-JS 完整
- [ ] Current Model Coverage 使用目标集合做分母
- [ ] Historical Depth 与 Current Coverage 分开
- [ ] 不存在无意义大量新增旧模型
- [ ] Provider / Model identity 没靠名字相似度自动合并
- [ ] Source Health 已审查
- [ ] 长期失败 source 有明确裁决
- [ ] Analytics 本地仍零请求
- [ ] Build deterministic
- [ ] Registry rebuild deterministic
- [ ] Coverage JSON deterministic
- [ ] Stable IDs 无非预期变化
- [ ] Sitemap 无非预期丢页
- [ ] Feed / Manifest 无非预期变化
- [ ] Mutation / Tooth Tests 已真实执行
- [ ] Self-Audit 已完成
- [ ] Self-Audit 中 REPAIR_NOW = 0
- [ ] P0 = 0
- [ ] P1 = 0
- [ ] Full Gate 全绿
- [ ] Required CI 全绿
- [ ] Deploy 成功
- [ ] Online Smoke 成功
- [ ] 最终报告与 Self-Audit 报告已提交
```

复核定界命令：

```bash
Select-String -Path 'D:\AI_DEALS_COVERAGE_EXPANSION_V1_PROMPT.md' -Pattern '^# 87' -Context 0,60
node research/_raw/t38/inventory.cjs --summary   # 会打印"§87 条数 = 47"
git log --oneline -12
```
