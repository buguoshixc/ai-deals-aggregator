# coverage-depth-v1 · Self-Audit（t10）

- 生成者：verifier-auditor（独立验证与对抗式审查）
- 生成时间：2026-10-05 13:5x（Asia/Shanghai）；工作区 `D:\OneDrive\Desktop\Code\AI Page\.worktrees\coverage-depth-v1`（分支 coverage-depth-v1）
- 基线：`ff86368e6d12d1ef57b2f51aa2c957c01d2a9ed8`（= 当前 HEAD；本轮全部改动**未提交**，都在工作区）
- 结论（先给判定，证据见后）：**P0 = 0 · P1 = 0 · REPAIR_NOW = 0 ⇒ 按 t10 契约可判 pass**；
  残留 5 条 P3（GUARDRAIL / VERIFY / DOC）与 1 条编排层事实，逐条列在 §7。
- 自我定位：本文件是**自审**，不是对整轮工作的验收签字。它只主张"我自己跑出来的读数"，凡引用他人产物都标了出处。

---

## 1. 方法与证据清单（全部可复跑）

所有脚本落在 `research/_raw/coverage-depth-v1/verification/`，全部**只读**工作区；变异只在 `%TEMP%` 沙箱副本上做。

| 工具 | 干什么 | 本次读数 |
|---|---|---|
| `t10-run-suite.cjs` | 在工作区只读跑 18 条自测/门禁命令，逐条记 exit code 与输出尾部（`t10-logs/`、`t10-suite-results.json`） | 18/18 exit 0（13:0x 时曾 2 条红，见 §7/T10-F0） |
| `t10-cline-audit.cjs` | C 线独立复核（来源普查三方对账 / rulings×文档 / SOURCE_TYPES×历史 / health 行未删） | 28 项全过，0 问题（`t10-cline-audit.json`） |
| `t10-teeth-check.cjs` | T7-F1 / T7-F3 牙的**可证伪性**（4 条定向补丁 + 对照，沙箱） | 5/5 通过，每次 byte-exact 还原（`t10-teeth-results.json`、`t10-teeth/`） |
| `t10-filter-every-scan.cjs` + `-scan2.cjs` + 跨行补扫 | 全仓 `filter(...).every/some` 空集风险扫描 | 单行 19 处 + 跨行 11 处（含说明见 §6） |
| `t10-integrity.cjs` | Stable IDs / History / Pricing / Registry 闭合（基线 `git show HEAD:` vs 现态） | 0 问题（`t10-integrity.json`） |
| `t10-release-audit.cjs` | Release Evidence 结构面 + 日期语义面 + 忠实度机械核对 + 5 条抽样 | 结构 0 问题；28/28 特征词同页；26/28 日期同页；22/28 引文自身含日期（`t10-release-audit.json`） |
| `t10-diff-review.cjs` | 逐文件 numstat + 三个 selftest 的 check 条数与改名对照 | 17 文件 +5642/−255；coverage-targets 84→147（删名 0）；models-selftest 140→145（删名 4，全部换名）；models-page 125→130（删名 2） |
| `t10-extract-team.cjs` | 从团队记录（只读）抽 §77/§79/§80 上下文、13 个任务契约、"任务书截断"事实 | `t10-prompt-marks.txt` / `t10-task-contracts.txt` / `t10-truncation-facts.txt` |
| 复用 t7 工具 | `indep-recompute.cjs`（不 require 被测 lib 的独立重算）、`text-json-samesource.cjs`、`no-network-hook.cjs`、`fake-clock-hook.cjs` | 见 §5 |

三条契约 Verify（原样）：
```
git diff --stat ff86368e6d12d1ef57b2f51aa2c957c01d2a9ed8...HEAD   → exit 0，输出为空（本轮零提交）
node scripts/validate.js --strict                                → exit 0（✅ 校验通过（strict 模式））
node scripts/tools/coverage-report.js                            → exit 0（报告自检问题 0 处）
```
> 三点式 `...HEAD` 为空的解释：`HEAD == ff86368`，本轮所有改动都在工作区/未跟踪文件里。所以 Git Diff Review 用的是
> `git diff ff86368`（工作区 vs 基线）+ `git ls-files --others`（未跟踪新文件），两条都贴了读数。

---

## 2. Requirement Traceability Matrix

> **关于题面 §79 原文**：round prompt 的 §77/§79/§80 正文**不在仓库、不在团队记录**（我全仓 grep `§79|§77|§80|禁止的假完成` 只命中我自己生成的抽取文件；`team.json` 里这三处标记只出现在**我这份任务书**的转述里）。因此 RTM 的需求行以**本轮团队目标 + 我这份契约的 acceptance/Integrity 清单 + 团队记录里 13 个任务的契约**为权威来源，逐条覆盖；对"§79 原文不可得"本身记一条 DOC 事实（T10-F7b）。凡本任务书点名的 §80 条目，我按其中被引用的原文要点逐条自查（§8）。

| # | Requirement（来源） | Implementation | Source of Truth | Test | Independent Evidence | Status |
|---|---|---|---|---|---|---|
| R1 | A) 给 Model Registry 补官方 release evidence，减少 releasedAt unknown（团队目标） | `scripts/data/models.json` 26→28 条补证；`t2` | 官方页原文 + `releaseEvidence[].sourceUrl/quote/capturedAt` | `models-selftest` 148/0、`validate --strict`、`provenance-selftest` 132/0 | 我的结构面逐条核对 32 条（域/capturedAt/引文非空）0 问题；28/28 特征词在同页；已知 4→32、unknown 40→19 | **PASS** |
| R2 | B) 消化 Target Universe 内 17 MISSING + 1 PARTIAL（团队目标） | `t3`（13+1）+`t8`（4 models） | `scripts/data/coverage-targets.json` 意图层 + 七态派生 | `coverage-targets-selftest` 201/0 | 我的独立七态派生（不 require lib）与报告 `states` 逐档+集合相等；MISSING 17→0、PARTIAL 1→0、COVERED 64→79 | **PASS** |
| R3 | C) 对长期失败来源做 repair/headless-migrate/keep-degraded/retire 明确裁决（团队目标） | `scripts/data/source-rulings.json`（1 条 keep-degraded）+`t4/t5/t6` | 裁决文件 + `source-reliability.md` §7/§11 | `coverage-targets-selftest` 的 v3④ 组、报告自检 0 处 | 我的 C 线 28 项复核：decision/revisitBy/overlap 3-3-4-medium/evidence 7 条(1×10-04+6×10-05)/whyKept 语义与文档一致 | **PASS** |
| R4 | 不猜日期（不许由模型 ID 或月份外推） | 14 条未采信全部留 null | `t2` 报告 §4 + 原始页 | `models-selftest` 的 evidence/date 双向牙 | 我核 32 条日期全部为合法日历日；未采信 19 条 releasedAt 仍为 null（我按 raw 文件复核 unknown=19） | **PASS** |
| R5 | 不造数据（新增事实必须可回指） | `t2/t3/t8` 各带 sourceUrl/quote/note | api-plans/plans/models 记录自身字段 | api-plans-selftest 176/0、plans-selftest、models-selftest | 我的 Registry 闭合：108 条计价条目全部有映射或声明；声明 58 行 0 重复、逐条可回查 | **PASS** |
| R6 | 不建第二套真相（判据单一出处） | `t1` 报告只读 lib 判据；`t12` 把同源自证换成"现读文件为分母" | `lib/model-freshness.js`、`lib/coverage-targets.js`、文件本身 | `coverage-targets-selftest`、`models-selftest` | t7 期间我已独立验证四节读数与 lib 派生一致；本轮复核 `t12` 新断言的两个操作数**来自独立计算**（见 §6/T10-F1、F3 的可证伪性补丁 P2a/P2b） | **PASS** |
| R7 | Stable ID 零 churn | 只增不改 | 基线 `git show HEAD:` | 各 selftest + `validate --strict` | 我的集合对比：apiPlanIds 17→24(+7/−0)、codingPlanIds 37→44(+7/−0)、dealIds 135→135、providerKeys 34→34、modelSlugs 44→51(+7/−0)、linkIdentities 75→85(+10/−0) | **PASS** |
| R8 | History 不伪造 | 三份 history 只增本轮新增记录 | `deal/plan/api-plan-history.json` | `history-selftest` 61/0、`plan-history-selftest` 132/0、`api-plans-selftest` | 我的事件对比：deal 1→1、plan 28→35(+7/−0)、api-plan 10→17(+7/−0)；**新增 ended/removed 事件 0 条**（无 futurepedia 相关、无批量下架） | **PASS** |
| R9 | Analytics 本地零请求 | `lib/analytics` 本地 provider | analytics 源码/workflow | `analytics-selftest` 31/0 | 自测原文：无 Cloudflare Analytics API 域名、不公开统计、未登记进 PUBLIC_DATASETS、sitemap 无 /stats/；dist 无 analytics 文件 | **PASS** |
| R10 | Full Gate（同轮） | captain 的 `gate-runner.cjs` | `gate/pre-integration/gate-results.json` + `gate/post-t13/gate-results.json` | 两轮各 50 步 | 预集成轮 1 步红（models-page-selftest）；**post-t13 轮 50 步 · 非 0 步 0 · failed=0**；我在 13:5x 复跑该步 **120/0 exit 0**（t13 于 13:03:51 落地），并另跑 18 条命令 18/18 exit 0 | **PASS**（附时间线） |
| R11 | Coverage report v3 四节 + 冻结契约 | `t1`（`coverage-report.js` +624/−2、`lib/source-rulings.js` 新增） | 报告 JSON/文本 | t7 已验收：`coverage-report` exit 0；selftest 178/0(t1 revision)→201/0(现) | t7 报告（review-t1/）11 条独立对账、文本↔JSON 48–50 条同源、键序只追加、byte-identical、无网络/无随机钩子 | **PASS** |
| R12 | Self-Audit（本文件，同轮） | 本文件 | 本文件 + `_raw/verification/` 现场文件 | 自查 | 本文 §1–§8 | **PASS** |
| R13 | CI / Deploy / Online Smoke（同轮） | captain | CI/部署产物 | — | **未执行（不在本任务范围）**，报告对应三节留占位 | **N/A** |
| R14 | Integrity：Stable IDs（契约） | 见 R7 | 同上 | — | 同上 | **PASS** |
| R15 | Integrity：History（契约） | 见 R8 | 同上 | — | 同上 | **PASS** |
| R16 | Integrity：Pricing（legacy 模型 API 计价行仍在） | `t2/t3` 数据变更 | `api-plans.json` + 发布 `models.json` | api-plans-selftest | 我实测：legacy 仅 `deepseek-v3.2`，其计价行仍在（plan `6844d46deb05`） | **PASS** |
| R17 | Integrity：Registry（映射闭合） | `t8` | links + registry + gaps | check-model-registry-links、check-models-reproducible | 我独立算：51/51 slug 有映射；108 条计价 identity 全部有结局；API 侧声明 16 条逐条可回查 | **PASS** |
| R18 | Integrity：Sitemap（无非预期丢页） | 构建产物 | 基线 `baseline/sitemap-urls.txt` vs `dist/sitemap.xml` | seo-selftest 63/0 | 我实测 173→183，**丢失 0**，新增 10（3 个新厂商页 + 7 个新模型页） | **PASS** |
| R19 | Integrity：Feed | `feeds-selftest` 145/0、`check-feeds-reproducible` exit 0 | dist/feed | 同上 | 我实测 dist/feed 48 个（24 xml + 24 json）；两次构建字节一致由 repro 工具保证 | **PASS** |
| R20 | Integrity：Manifest | `data-docs-selftest` | dist/data/index.json | 同上 | 我实测 manifest 9 个数据集（含 3 份 history），与 PUBLIC_DATASETS 对账由自测覆盖 | **PASS** |
| R21 | Integrity：Analytics（本地请求 0） | 见 R9 | 同上 | 同上 | 同上 | **PASS** |
| R22 | §47：测试断言不许编码当前数据快照 | `t11/t12/t13` 三轮 repair | 现读文件为分母 | 三轮各自 Verify | 我实测 check 条数：coverage-targets 84→147（删名 0）、models 140→145（删名 4，全部换名）、models-page 125→130（删名 2，全部换名）；18/18 命令 exit 0 | **PASS**（改名偏离见 §3.3） |
| R23 | §48：Mutation 不许写"全覆盖" | t9 + 本文件 | t9 `mutations.json` + 我的 `t10-teeth-results.json` | — | t9 抓到 11/16 并写明 5 条盲区；我另做 4 条定向补丁（T7-F1/F3）全部可红 | **PASS** |
| R24 | §49：Provenance 要人工式复核 | t2/t9 + 本文件 §5.3 | 原始页 | `provenance-selftest` 132/0 | 我抽样 5 条贴出 raw 上下文；另给出 2 条"我的匹配器未定位日期"的诚实保留项 | **PARTIAL→VERIFY**（T10-F4） |
| R25 | 两份报告只写真实读数 | 本文件 + report.md | — | — | 两份文件里每个数字都能在 `_raw/verification/` 找到现场文件；未见"应该通过/线上正常"类措辞 | **PASS** |
| R26 | §80 禁止的假完成逐条自查 | §8 | — | — | 11 条逐条反证 | **PASS** |
| R27 | CI/Deploy/Online Smoke 留占位 | report.md | — | — | 占位清楚标注"待 captain 回填"，未写任何未执行结论 | **PASS** |
| R28 | 任务书截断（编排层事实）如实记录 | §9 | team.json + inbox | — | 3 处截断相关记录 | **PASS（DOC）** |

---

## 3. Git Diff Review（基线 ff86368 → 工作区）

### 3.1 逐文件（`git diff --numstat ff86368`）

| 文件 | +/− | 归属 | 定性 |
|---|---|---|---|
| `api-plans.json` | +615/−2 | t3（派生产物，由 curated 重建） | 合法数据增长；2 行删除是同一记录字段重排，`check-api-plans-reproducible` exit 0 证明它是**派生**而非手改 |
| `plans.json` | +359/−2 | t3（派生产物） | 同上，`check-plans-reproducible` exit 0 |
| `models.json` | +465/−129 | t2/t8（派生产物） | `check-models-reproducible` exit 0（51 模型 · 92 映射 · 与来源层逐字节一致） |
| `model-registry-links.json`（根） | +182/−2 | t8（派生产物） | 同上，同一可重建性读数 |
| `scripts/data/models.json` | +363/−69 | t2/t8（来源层） | 26 条补 releaseEvidence；7 条新身份；69 行删除是同一 entry 的字段重排/扩写（我的 ID 集合对比：44→51，**消失 0**） |
| `scripts/data/api-plan-history.json` | +410/−0 | t3 | 追加 7 条；事件 10→17，新增 ended 0 |
| `scripts/data/plan-history.json` | +141/−0 | t3 | 追加 7 条；事件 28→35，新增 ended 0 |
| `scripts/data/curated_api_plans.json` / `curated_plans.json` | +515/−0 / +322/−0 | t3（人工来源层） | 只增；每条带官方价与核对项 |
| `scripts/data/model-registry-gaps.json` | +32/−0 | t8 | 58 行 / 58 唯一键 / 0 重复（我独立算） |
| `scripts/data/model-registry-links.json` | +170/−0 | t8 | 85→92 条，只增；消失 0 |
| `scripts/data/providers.json` | +3/−1 | t3 | sensetime 追加 officialDomains（2 个域 + 证据），无 key 变更 |
| `scripts/data/coverage-targets.json` | +110/−15 | t3 | 意图层出口（DEFERRED/UNVERIFIABLE/NOT_APPLICABLE 编码修正）；**状态仍不手写**（validate 过） |
| `scripts/tools/coverage-report.js` | +624/−2 | t1 | v3 四节；t7 已验收 |
| `scripts/tools/coverage-targets-selftest.js` | +957/−6 | t1+t12 | check 84→147；**删名 0**；6 行删除全是注释/白名单行 |
| `scripts/tools/models-selftest.js` | +213/−14 | t11+t12 | check 140→145；删名 4（全部换名，见 §3.3） |
| `scripts/tools/models-page-selftest.js` | +161/−13 | t13 | check 125→130；删名 2（全部换名） |
| 未跟踪新文件 | — | t1/t4/t6 | `scripts/lib/source-rulings.js`、`scripts/data/source-rulings.json`、3 份 workstream 报告、`research/_raw/coverage-depth-v1/**` |

合计 **17 个跟踪文件 +5642/−255**；未跟踪新文件 60 个（脚本/文档/证据）。

### 3.2 七个风险透镜逐条核对

| 透镜 | 结论 | 我的证据 |
|---|---|---|
| scope creep | 未发现 | 改动全部落在团队目标 A/B/C 与三轮 repair 的 inScope 内；四个 selftest/工具改动都有对应任务契约（t1/t11/t12/t13）；数据侧改动都能回指 workstream 报告 |
| 手改派生产物 | 未发现 | 4 个派生产物（`models.json`、根 `model-registry-links.json`、`plans.json`、`api-plans.json`）各自由 `check-*-reproducible.js` 复跑 **exit 0**（与来源层逐字节一致） |
| 重复 truth source | 未发现 | 判据只在 lib；t12 把两处"同源自证"换成"现读文件为分母"（我对两个操作数各做定向补丁 P2a/P2b ⇒ 必红）；rulings 的 schema 判据只在 `lib/source-rulings.js`（报告只 join/排版） |
| 放宽旧断言 | 未发现 | 三个 selftest 的 check 条数只增（84→147 / 140→145 / 125→130）；删除的检查名仅 4+2 条且都是"名字里带写死数字"的改名（§3.3）；无检查体被删 |
| 无证据 release date | 未发现 | 32 条有日期的 entry 全部带 releaseEvidence（结构面 0 问题）；28 条本轮新增里 28/28 特征词能在同一份现场页找到；2 条日期未在我的写法表内定位 → 列 VERIFY 保留项 |
| Stable ID churn | 0 个非预期 | 六类 id 集合对比：消失 0（R7） |
| 无理由 History 变化 | 0 条 | 三份 history 只增本轮新增记录；新增 ended/removed 0 条（R8）；`deal-history.json` 完全未动（1→1） |

### 3.3 已声明偏离：`models-selftest.js` 4 条检查改名（t12）

契约冲突双方：
- t12 契约 A6："**既有检查名一个不改**"
- t12 契约 A4/A5："**不许再出现 44 / 12 这类字面量**"（题面 §47 禁止断言编码数据快照）

t12 选择"删字面量、保留检查本身"，并逐条留了 old → new。我的机械对照：

| 旧名（含写死数字） | 新名（结构不变量） | 保护力对照 |
|---|---|---|
| 汇总：44 个模型全部 active、0 retired | 汇总：每个身份都有结局（total == **现读** models.json 身份数 == 发布条目数；active+retired+unknown==total），且 retired 仍为 0 | 旧：只钉 44；新：钉恒等式 + 仍钉 retired===0 + 新增三态闭合。**新 ⊇ 旧**，且旧在合法增长时会假红（§47 形态） |
| 真实数据：API 侧声明 12 条，reason 全部 off-registry-model、sourceUrl 全部取自该记录自己的官方页 | 真实数据：API 侧声明 **== 现读 gaps 文件**条数，且每条逐字对得回真实 api-plans（reason/sourceUrl/modelKey/variant） | 旧：钉 12 + reason/sourceUrl；新：钉现读文件对账 + 逐条回查（4 个字段）⇒ 更强 |
| 【API 处置】coverageOf：declaredApiEntries 逐条留档（12 条 · 带 provider）+ unmappedModelKeys 归零 + 三者和 == 总条目 | 【唯一性牙·t12】同一 (apiPlanId, modelKey, variant) 不许重复 + 【可证伪性·t12】四种扰动必红 | 旧：12 + 方程；新：方程仍在（另一条 check）+ 新增唯一性牙 + 可证伪性牙 |
| 【API 处置·对照】真实数据里 12 条声明在折叠索引下 0 命中 | 【API 处置·对照】真实数据里 ${apiDecl.length} 条声明在折叠索引下 0 命中 | 判据同形态，仅把写死 12 换成现读值 ⇒ 等价但不再假红 |

补充机械读数：`models-selftest` check 140→145（+5），`models-page-selftest` 125→130（+5），`coverage-targets-selftest` 84→147（+63，删名 0）。
**结论：已声明偏离成立，未丢失保护力**（逐条"新 ⊇ 旧"，且新增唯一性牙与可证伪性牙）。

---

## 4. Independent Recalculation

### 4.1 读数级独立重算（不 require 被测 lib）

- t7 期间（HEAD 数据 + t1 代码）：registry 44 / known 4 / unknown 40 / census current3·aging0·legacy1·historical0·unknown40 / gap 18 = 17 MISSING + 1 PARTIAL / states 逐档相等 / 映射 44-44 闭合 / 心跳逐字相等 ⇒ **11 条对账 0 不等**。
- 现在（工作区终态）：registry **51** / known **32** / unknown **19** / unparsable 0 / census **29·2·1·0·19**（和 51）/ states **COVERED 79 · PARTIAL 0 · MISSING 0 · DEFERRED 3 · UNVERIFIABLE 2 · NOT_APPLICABLE 52 · BLOCKED 0** / gap queue 0 / queue 51 条（unknown 19，limit 15）/ 映射 51-51 闭合 / 108 条计价 identity 全部有结局。
- 报告 JSON 形状：顶层 8 键、`coverageTargets` 25 键（v2 的 21 键仍是前缀）。

### 4.2 **C 线独立复核（补 t9 的独立性缺口）**

t9 由 Workstream C 负责人执行，因此 C 线对他而言是自审。我**不引用他的任何脚本**，自己重跑四件事（`t10-cline-audit.cjs`，28 项 / 0 问题）：

① **来源普查三方对账**：生产注册表（BASE 7 + headless 2 = 9）↔ `source-probes.json` 的 9 个键 ↔ `source-health.json` 的 9 行 —— **三个集合逐字相等**；非 healthy 仅 `futurepedia(failed/collector_error)`；cf≥3 仅 `futurepedia=10`；心跳 `generatedAt=2026-10-04T16:31:52.051Z`；我按"必填四件套缺失"自算 stale = 0 条。
② **`source-rulings.json` ↔ `source-reliability.md` 逐字段**：decision=`keep-degraded`、revisitBy 含 `2026-10-19`、overlap=`{historicalItems:3, uniqueItems:3, overlapItems:4, maintenanceCost:'medium'}`、evidence **7 条**（capturedAt 1×2026-10-04 + 6×2026-10-05）、whyKept 481 字符。文档 §11.2 表格逐项与之对上；whyKept 与文档 §7.5 是**语义一致、措辞不同**（文档自己声明 whyKept 的来源是"§7.5 的第一条要点"）——**不是不一致**，但禁止把它写成"逐字相同"。
③ **`provenance.js` SOURCE_TYPES**：`SOURCE_TYPES.Futurepedia === 'directory'` 仍在；3 条历史 Futurepedia 记录的 `sourceTypeOf()` 全部 = `directory` ⇒ keep-degraded **没有改写历史**。
④ **health 行未删**：`futurepedia` 行在场（status=failed / reason=collector_error / cf=10 / lastError HTTP 403）；且 `scripts/data/source-health.json` 与 `git show HEAD:` 版本**规范化换行后逐字节相同**（4515 字节）⇒ 本轮**从未碰过**健康文件，不存在"为全绿删行"。

### 4.3 与 t9 结论的差异（如实列出）

- t9 报"新增 28 条 = 28/28 已核"；我复算出 **28/28 特征词同页**，但**26/28 能在现场页里定位到该日期的日历写法**，另 2 条（`minimax-m2.7`、`minimax-m2.7-highspeed`，2026-03-18）在我的 9 种日期写法下未命中 ⇒ 我把它记为 **VERIFY 保留项（T10-F4）**，不判错、也不跟着写"28/28 已核"。
- t9 报"引文必须真含该日期"的机械校验；我实测**引文自身含日期的是 22/28**（其余 6 条日期来自页面/表格上下文）⇒ 记为 DOC（T10-F5），防止下游把它当成"每条引文都自带日期"。
- 我的特征词同页匹配**不能证明身份对应**（例：`gemini-3.5-flash` 的引文特征词落在了一份 Anthropic 抓取页里，说明抽词法有假阳性）⇒ 忠实度的强结论仍以 t2/t9 的人工式复核为准，我这条只作弱佐证（T10-F6）。

---

## 5. Release Evidence Audit

范围：`scripts/data/models.json` 51 条身份 / 32 条有 `releasedAt` / 19 条留 null。

- **结构面（32/32 逐条）**：每条有日期的 entry 都必须有非空 `releaseEvidence`；每条 evidence 必须有 `sourceUrl`、`capturedAt=YYYY-MM-DD`、非空 `quote`，且域必须落在该 developer 的 `officialDomains` 内 ⇒ **0 问题**。
- **日期语义面（32/32）**：`releasedAt` 全部是合法 `YYYY-MM-DD` 且是真实日历日（我用 Date.UTC 反算校验）⇒ 0 问题；无"由模型 ID 数字外推/按月补日"的形态（未采信 19 条仍为 null）。
- **忠实度机械核对（28 条本轮新增，capturedAt=2026-10-05）**：把引文切成最长的 3 个特征词，要求同一份现场页全部命中 ⇒ **28/28**（现场页全集 = `release-evidence/raw/**` + `gap-closure/raw-*.txt`，共 439 份）。
- **日期-出处**：26/28 能在同一份现场页里找到该 releasedAt 的日历写法（我覆盖零填充/非零填充/英文月/中文年月日等 9 种形态）；**2 条未命中** → T10-F4（VERIFY）。
- **抽样 5 条**（贴出现场上下文，见 `t10-release-audit.json#sampleAudit`）：`claude-fable-5.1`（Newsroom 列表页 `<time>` 元信息）、`claude-haiku-4.5`（详情页 title/datePublished）、`claude-opus-5.5`、`claude-sonnet-5.5`、`gemini-3.5-flash`。
- **未采信 14 条的对照**：我复核 unknown=19 与 t2 的未采信清单一致（19 = 14 未采信 + 5 条由 t8 新增但无官方日期的身份），未发现"能查却没查"的空口。

---

## 6. Mutation Results

### 6.1 T7-F1 / T7-F3 的**可证伪性**独立验证（t10 新增，沙箱 `%TEMP%\cvdv1-t10-teeth`）

不看实现者的自测断言，我自己对**这一条检查的输入**做定向补丁（每条只改一个操作数，红了必是它）：

| 补丁 | 改什么 | 预期 | 实际 | 命中 |
|---|---|---|---|---|
| C0 对照 | 不打补丁 | 0 失败 | exit 0，201/0 | — |
| P1a | `missingRowsProblems(gapQueue, states.MISSING)` 的 rows 追加一条合成 `MISSING(present=1)` | 必红 | exit 1 | 「MISSING 行集合大小 1 ≠ states.MISSING 计数 0」+「1 格 MISSING 却 present≠0」 |
| P1b | 把 `expectedCount` 改成 `states.MISSING + 1` | 必红 | exit 1 | 「集合大小 0 ≠ 计数 1」（**空集也必须对上 0** —— 这正是 F1 的修法要害） |
| P2a | t12 新断言的**文件侧**操作数 +1 | 必红 | exit 1 | 「载荷行数=16 / 文件行数=17」+ t25 ④ 同时红 |
| P2b | t12 新断言的**逐格复算侧**操作数 +1 | 必红 | exit 1 | 「展开增量=0 / 通配多余覆盖复算=1」+ t25 ⑤ 同时红 |

每次改写都做了 sha256：`bf6c0e3f…` →（mutated）→ **还原后 `bf6c0e3f…` 逐字节一致**（4/4）。
⇒ **T7-F1 已修且可证伪；T7-F3 的替换断言确实由两个独立来源的操作数构成，且各自可被单独扰动打红**（恒真式不会有这种性质）。

### 6.2 本轮不做、也不主张的事

- 我**没有**重跑 t9 的 M1–M15（那是他的脚本与他的沙箱）；t9 自报 **抓到 11/16**，并如实写了 5 条盲区（M4 引文忠实度无断言、M7 跨 role 组无断言、M15 guard 外网络原语无断言、M5/M6 自指盲区）。
- 我**不写"Mutation 全覆盖"**（§48）。上表 4 条补丁只覆盖 T7-F1/F3 两个点；其余断言的可证伪性由各自任务的交付材料 + 我的"18 条命令全绿""队列/七态独立重排"等侧证支撑。

---

## 7. Findings / Fixes / P0 / P1 / Remaining P2/P3

### P0（阻断）**0 条** · P1（高）**0 条** · REPAIR_NOW **0 条**

### Fixes（本轮已闭合）

| id | 内容 | 闭合证据 |
|---|---|---|
| T7-F1 | `gapQueue.filter(MISSING).every(present===0)` 空集恒真 | t12 换成 `missingRowsProblems()`（集合大小对账 + 逐格）；我用 P1a/P1b 两条补丁证明它可红（§6.1） |
| T7-F3 | selftest:836 代数恒真式 `X === Y + (X−Y)` | 换成两条各有独立来源的不变量；我用 P2a/P2b 证明两个操作数各自可被扰动打红 |
| T9-F1 | `models-selftest` 三处写死基线计数 | t12/t11 收口，现 148/0 |
| T9-F2 | `models-page-selftest` 4 条红 | t13 于 **13:03:51** 落地，现两种跑法各 120/0 |
| T7-F2 | 报告读墙钟（`generatedAt=todayCN()`，HEAD 既有） | **口径修正**：最终报告写成 **same-day byte-identical**；四节新增内容经假墙钟四档验证不受影响（不变更冻结键） |

### Remaining P2/P3（本轮**不修**，如实留账）

| id | 级别 | 分类 | 问题 | 位置 | requiredFix |
|---|---|---|---|---|---|
| T10-F1 | P3 | **GUARDRAIL** | **T7-F1 的同类残留**：`realDerived.rows.filter(state===MISSING).every(row => row.present===0 && !row.ruling)` 仍是空集恒真形态；而当前 `states.MISSING = 0` ⇒ **它此刻已经恒绿**（比 T7-F1 更值得记，因为同文件同一天修了一处、漏了这一处） | `scripts/tools/coverage-targets-selftest.js:137-139` | 套用同款修法：`missingRowsProblems(realDerived.rows, realDerived.states.MISSING)`（集合大小对账 + 逐格），或加非空前提 |
| T10-F2 | P3 | GUARDRAIL | `rows.filter(COVERED).every(present>0 \|\| resolved>0)` 空集恒真；空集可达性 = 覆盖层整体塌陷（全维度 NOT_APPLICABLE / 数据被清）；无其它断言会先红（行数方程仍成立） | `scripts/tools/coverage-targets-selftest.js:136` | 与 `states.COVERED` 计数对账 + 非空前提（或断言 COVERED > 0） |
| T10-F3 | P3 | GUARDRAIL | `verify-site.js` 的 Feed 检查里，`.xml` 分支有上位 `.some(.xml)` 兜底（1531），但 `.json` 分支（1548/1553）**没有任何"至少一个 JSON feed"前提** ⇒ JSON feed 全部消失时会静默通过 | `scripts/tools/verify-site.js:1548,1553` | 补 `.some(([rel]) => rel.endsWith('.json'))` 前提 |
| T10-F4 | P3 | VERIFY | 2 条新增日期（`minimax-m2.7`、`minimax-m2.7-highspeed` = 2026-03-18）在我 9 种日历写法下未能在现场页定位（可能是该页日期写法特殊） | `scripts/data/models.json` | 人工再核一次现场页；确认后把该页的日期写法补进核对器，或换成带日期的官方页 |
| T10-F5 | P3 | DOC | 28 条新增里**只有 22 条引文自身含日期**；6 条依赖页面/表格上下文（与 t2 对腾讯 L3"引文带表头自证语义"的处理一致） | `scripts/data/models.json` | 文档口径写成"引文或其所处页/表上下文含日期"，别写成"引文自带日期" |
| T10-F6 | P3 | DOC/VERIFY | 我的"特征词同页"匹配是弱证据（存在假阳性：某条 Google 引文的特征词落在 Anthropic 抓取页）；**不得**用它替代逐条人工式复核 | `t10-release-audit.cjs` | 保留 t2/t9 的人工式复核为权威；我的机械核对只作侧证 |
| T10-F7a | P3 | DOC/编排 | 任务书截断事实：多名成员收到的是截断版契约（详见 §9） | `team.json` / inbox | 编排层修复（下发前校验渲染长度）；本轮以团队记录为权威契约 |
| T10-F7b | P3 | DOC | 题面 §77/§79/§80 正文不可得（仓库与团队记录里都没有） | — | 若需严格逐条覆盖 §79，请 captain 提供该原文；当前 RTM 已按可得权威来源逐条覆盖 |

> 纪律说明：这 5 条 P3 里 **F1/F2/F3 都落在"被测文件已随 t12/t13 收口"的冻结读数上**，按 captain 指示**我没有改动这两个文件**（改动会破坏已冻结的读数）。

---

## 8. §80「禁止的假完成」逐条自查

（§80 原文不可得；下表覆盖本轮目标与契约中被明确点名/被引用的禁止形态，每条给**反证**而不是声明。）

| 禁止的假完成 | 自查 | 反证（现场读数） |
|---|---|---|
| 用 0 冒充"分不出"（相位差静默降级） | 未发生 | 报告对未落盘层显式打印"尚未落盘 + 未落盘 ≠ 通过 + 自检待落盘层 1 项"（t7 沙箱 M12 现场）；`t10-logs/` 里 coverage-report 现 0 处问题、freshness status=ok |
| 猜日期（由 ID/月份/第三方外推） | 未发生 | 19 条仍为 null；我复核 32 条全部合法日历日；t2 的 14 条未采信理由在报告 §4 |
| 删 health 行 / 删数据求全绿 | 未发生 | `source-health.json` 与 HEAD **逐字节相同**；futurepedia 行仍在（failed/cf=10）；Stable ID 消失 0；History ended 0 |
| 手改派生产物 | 未发生 | 4 个派生文件各自 `check-*-reproducible` exit 0 |
| 建第二套真相 | 未发生 | 判据只在 lib；t12 的"现读文件为分母"断言经 P2a/P2b 证明两侧独立可扰 |
| 测试恒绿（空集/恒真式） | **本轮抓到并修了 2 处，另留 3 处同类** | 修：T7-F1、T7-F3（§6.1 补丁可红）；留：T10-F1/F2/F3（§7） |
| 未执行就写结论（"应该通过""线上正常"） | 未发生 | 两份报告只写实测；CI/Deploy/Online Smoke 明确留占位 |
| Analytics 偷偷出网 / 公开统计 | 未发生 | analytics-selftest 31/0 的原文读数 + dist 无 analytics 产物 |
| Mutation 写"全覆盖" | 未发生 | t9 写"抓到 11/16 + 5 条盲区"；我写 4 条定向补丁，不主张覆盖 |
| 任务书截断不记录 | 已记录 | §9 |
| 拿别人的自证当自己的证据 | 未发生 | 本文件每条读数都有我的脚本/日志；引用他人产物时标了出处，并与 t9 的差异逐条列出（§4.3） |

---

## 9. 编排层事实：任务书渲染截断

从团队记录（只读）与我收到的契约比对：

- `team.json` 里 13 个任务的 `acceptance` 数组是权威契约（例如 t12 是 **8 条**、inScope 含 `scripts/tools/models-selftest.js`）；成员实际收到的渲染版被截断（成员上报：t12 只看到 6 条 acceptance、且缺 `models-selftest.js` 的 inScope，为核实而去只读检查 `team.json`）。
- 我这一份 t10 契约**同样被截断**（依赖结果里多份成员交付物以 "…[truncated]" 结尾）。
- 影响评估：t12 最终按**权威 8 条**执行（其交付里逐条对 A1–A8，含 A6 改名偏离声明）；t8 在交付里也主动声明"未修改任何断言、未碰 scripts/tools/**"。**我没有发现因截断而未被执行的 acceptance 条目**——但这属于"成员自述 + 我核对交付物"的结论，不是编排层的保证。
- 结论：按权威契约（team.json）判完成度；建议编排层下发改成"契约落盘 + 摘要渲染"，并要求成员在交付里逐条对 acceptance 编号（本轮 t12/t8 已经这么做）。

---

## 10. 结论

- 三条契约 Verify 全绿：`git diff --stat …...HEAD`（空，见 §1 解释）、`validate --strict` exit 0、`coverage-report` exit 0（自检 0 处）。
- 我自己的 18 条自测/门禁命令 **18/18 exit 0**（含 models-page 两种跑法 120/0、models 148/0、coverage-targets 201/0）。
- **P0 = 0 · P1 = 0 · REPAIR_NOW = 0**；残留 5 条 P3（GUARDRAIL×3 / VERIFY×1 / DOC×2，其中 T10-F1 是"已修一处、同类残留一处"的必记账项）+ 1 条编排层事实。
- 本自审**不签字**：最终判 pass 需要 captain 把 CI / Deploy / Online Smoke 的实测读数回填进 `research/coverage-depth-v1-report.md` 的三节占位，并对 §7 的 P3 决定"带账发布 / 顺手修"。
