# coverage-expansion-v1 · 独立 Self-Audit（t21）

> **这份文件是一次质疑式自审，不是完成报告的副本。**它与完成报告（`research/coverage-expansion-v1-report.md`，由 t20 撰写）
> **互相独立**：本文件里每一个数字都是我在**本任务内自己跑出来的**（命令与原始读数列在 §10），
> 并且我刻意不去引用完成报告的结论 —— 只在上文能证明的地方才引用它的**声明**，然后说我能不能复现。
>
> | 项 | 值 |
> |---|---|
> | 被审对象 | 分支 `coverage-expansion-v1`，基线 `a4dd40f`（= `origin/master`） |
> | 自审时的 HEAD | `2ebcf62`（`Merge origin/master into coverage-expansion-v1：4 个自动生成数据文件取 master 最新采集`） |
> | 自审窗口 | 2026-10-04T16:32Z（采集 facts）→ 2026-10-05T00:40Z（本文件；Asia/Shanghai 记录为 10-05 00:40） |
> | 原始读数 | `research/_raw/t21/audit-measurements.json`（76 KB）· `audit-facts.json` · `verify-live.cjs` 输出 · `summary.cjs` 输出 |
> | 采集脚本 | `audit-measure.cjs`（corrections / 残留 / diff 分类 / churn / 可重建 / 变异）· `audit-facts.cjs`（事实与门禁）· `verify-live.cjs`（实时态）· `baseline-build.cjs`（基线 SHA 隔离构建） |
>
> **本审的自我限制（先写清楚，免得读者高估它）**：
> 1. 本审**不是**逐行 code review。258 个变更里 196 个在 `research/_raw/**`（一次性证据与脚本），我对它们的判断依据是
>    「是否与产物同源 / 是否被门禁跑到 / 是否被引文兑现」，**不是**逐行读它们的实现；
> 2. 本审的「独立重算」= 用我自己的第二条路径重算计数（§6），**不覆盖** UI 渲染细节（那要真浏览器，由 `verify-site.js` 735 项承担）；
> 3. 工作区在自审期间**有队友在并发写**（见 §9.1 的实测：`source-health.json` 在我两次读数之间从 `9/9 healthy` 变成 `8 healthy / 1 failed`）。
>    凡是会被并发写影响的读数，我都标了「瞬时读数」并给了时间戳。

---

## 1. 一句话结论

**可以给「通过」，但有条件。** 七条验收全部有可复现证据（§4/§5/§6/§7），**P0 = 0 · P1 = 0**（§8 逐条），
**独立重算 4 项全对、可重建门禁 6 项全绿、变异 24/27 CAUGHT（2 条留档盲区）**。
但有两件事必须随结论一起引用，否则「通过」会读得过宽：

1. **`source-health` 是活的**：基线是 `healthy 8 / failed 1`，中途出现过 `9/9 healthy`，自审结束时**又回到
   `8 healthy / 1 failed`（futurepedia `consecutiveFailures=10`，`generatedAt=2026-10-04T16:31:52Z`）**。
   ⇒ 任何写「futurepedia 已恢复」的材料**现在都已过期**（§9.3 给时间线与命令）。
2. **本轮的审查本身出过一次可证伪的误判**（t15-F6：声称两份 `source-health.json` 逐字节相同，被我复现出**不同 sha256**），
   这恰好是「报告比实现好看」的实例（§9.2）。

---

## 2. 基线 corrections 四条旧数字：逐条独立复核（契约硬要求）

`baseline.json` 的 `corrections` 有 5 条（C1–C5）。**我不引用 baseline 的结论**，而是回到基线 SHA 自己数一遍。

| # | 字段 | 草稿值 | baseline 声明 | **我的独立读数** | 判定 |
|---|---|---|---|---|---|
| C1 | `gates.gateStepCount` | 41 | 45 | **`git show a4dd40f:.github/actions/gate/action.yml` 里 `- name:` 行 = 45 条**；同一文件在自审 HEAD 上 = **49 条**；`check-ci-consistency` 实跑报「共 49 步 / run 步骤 49 / shell 声明 49」 | ✅ **基线 45 成立、草稿 41 被证伪**；当前值已随 t7/t27 增长到 49（**引用时不许把 41 或 45 当成"现在的步数"**） |
| C2 | `gates.expectChecks` | 36 | 37 | 基线 `verify.yml` 的**调用行**（第 125 行）逐字 `run: node scripts/tools/check-ci-consistency.js --expect-checks=37`；**同一文件第 95 行的注释写的是 36**（`--expect-checks=36` 出现在注释里）。自审 HEAD 的调用行已是 `=38`，注释也已同步改成 38 | ✅ **基线 37 成立、草稿 36 的来源被定位到"照抄了注释"**（baseline 的 `expectChecksCommentDrift` 说法成立） |
| C3 | `data.dealPlanLinks` | 5023 | 5 | `scripts/data/deal-plan-links.json`：`links` 数组 **5** 条、`retired` **0** 条、**文件字节数 5023** | ✅ **"5 条关系"成立、5023 是字节数**（量纲错误被抓住） |
| C4 | `collectors.knownLongTermFailure.consecutiveFailures` | 8 | 9 | 基线 SHA 的 `source-health.json` 里 futurepedia 行逐字 `consecutiveFailures: 9`、`status: "failed"`、`lastError: "... HTTP 403"` | ✅ **基线 9 成立、草稿 8 被证伪**（8 是更早快照）。**但当前值是 10 且状态 failed**（§9.3） |
| C5 | `site.distHtmlPages` 的来源 | 173（二手：主工作区 dist/） | 173（一手：基线 SHA 隔离构建） | 我在 `%TEMP%` 用 `git archive a4dd40f` 导出基线树 + junction 借 `node_modules` + `build-local --out=base.building` 真构建：**HTML 173 / 文件 290 / sitemap 170** | ✅ **173 复现（数值相同），且"一手来源"这一条我用自己的构建独立确认** |

**结论**：四条旧数字（41 / 36 / 5023 / 8）**全部被证伪**，baseline 的四个更正值（45 / 37 / 5 / 9）**全部被我独立复现**。
第五条的 173 数值不变、来源升级为一手 —— 我也复现了。

### 2.1 「最终材料里没有残留旧数字」的扫描（含一处必须区分的情形）

扫描面：17 份最终材料（完成报告 / 自审 / 残余登记表 / 来源健康裁决 / 数据质量审查 / 模型当前性 / PR 正文 / t39 素材 / t37 运行单 / t43 草稿 / README / NEXT-STEPS / PROJECT_STATUS / SUMMARY / SCHEMA-v3.0 / SCHEMA-v2.5 / provider-review）。规则：分别扫 `41 步`、`--expect-checks=36`、`5023`、`futurepedia 连续失败…8`。

| 命中 | 文件:行 | 判定 |
|---|---|---|
| 1 处 | `research/coverage-expansion-v1-source-health-rulings.md:18` 逐字：`| futurepedia 连续失败 | 任务书写「HTTP 403 × 8」 | **9**（抓取前盘上文件值…）。8 是更早快照的数字 |` | **不是残留，是正确的更正记录** —— 它把「任务书的 8」与「实测的 9」并列写清。这类「旧值出现在更正语境里」应当**保留**，删掉反而丢证据 |

**未命中**：`41 步`、`--expect-checks=36`、`5023` 三个形态在 17 份材料里**零命中**。

**补扫（自审过程中 t20 完成报告落盘后，我立刻又扫了一遍）**：

| 材料 | 命中 | 判定 |
|---|---|---|
| `research/coverage-expansion-v1-report.md`（31,356 B，t20 完成报告） | **3 处** | **全部是正确用法**：① 第 25 行 `**5 条关系 / 0 retired**（文件 5023 **字节**，不是条数）`；② 第 34 行 `C1 gateStepCount 41→**45** · C2 expectChecks 36→**37** · C3 deal-plan-links 5023→**5 条**（5023 是字节数）…`（**草稿→实测**的正确形态：两个数字并列且写清了量纲） | ✅ **不是残留** |
| `research/_raw/t19-pr-body.md`（2,476 B） | **0 处** | ✅ |
| 本自审自身 | 16 处 | 全部在「旧值 → 实测」的更正语境里（含 §9.3 的 `8→9→10` 时间线） |

⇒ **「最终材料里没有残留旧数字」这一条现在可以说完整了**（含 t20 的完成报告与 t19 的 PR 正文）。
仍然有效的提醒：**t20 之后再改报告就要重扫**（脚本见 §11）。

---

## 3. Requirement Traceability Matrix

**口径**：`Status` 只允许四种取值，且每一种都对应我在本任务内跑出来的证据；**不使用「已实现」这类无证据说法**。

- `GATED` = 有具名门禁/自测步骤真的跑到它，且我复跑了该步骤（exit 0）
- `EVIDENCED-NOT-GATED` = 有可复现证据（文件/读数/复算），但**没有**常驻门禁守着它（这是我给它的风险标记）
- `DEFERRED` = 本轮明确不做，且有登记
- `NOT-VERIFIED-BY-AUDITOR` = 我无法在本任务边界内验证（列出为什么）

| # | Requirement（题面/阶段要求） | Implementation（载体） | Source of truth | Test-Gate | Evidence（我自己的读数） | Status |
|---|---|---|---|---|---|---|
| R1 | 明确「要覆盖什么」 | `scripts/data/coverage-targets.json`（`targets[]` **34** 行 = 34 家身份） | 该文件本身就是意图层；**不写 COVERED/PARTIAL/MISSING** | `selftest:coverage-targets`（实测 110 项）· 门禁步骤「Coverage-targets self-test」 | 我读到 `targets[]=34`、每行 9 个字段（provider/tier/role/intent/applicabilityNote/dimensionIntent/currentTargets/rulings/note）；`coverage-targets-selftest` 复跑 **exit 0** | **GATED** |
| R2 | 明确「当前覆盖到哪里」（七态派生） | `scripts/lib/coverage-targets.js`（派生）+ `report:coverage` v2（文本 + JSON） | 派生自 providers/plans/api-plans/models/links/gaps | `report:coverage` 自检 · 门禁步骤「Coverage report」 | `coverage-report` 复跑 **exit 0 / 「✅ 覆盖报告自检通过（0 处问题）」**；t45/t46 的逐项核对（§4.3 引用） | **GATED** |
| R3 | 「哪些模型值得默认展示」（当前性） | `scripts/lib/model-freshness.js`（唯一判据，纯函数）+ registry v2 字段 | `scripts/data/models.json` 的 `modelRole/releasedAt/freshnessGroup` | `selftest:freshness`（实测 100 项）· `selftest:model-roles`（实测 7 项）· `check:models:reproducible` | 门禁三件套复跑 **全 exit 0**；我独立数出 `releasedAt` 非空 **4/44**、`freshnessGroup` 非空 **1/44**、`catalogStatus` 普查 `{unknown:40, current:3, legacy:1}`（和 = 44） | **GATED** |
| R4 | legacy/historical 默认不占首屏但一行不删 | `scripts/lib/models-page.js` | registry 的 `catalogStatus` | `selftest:models`（实测 115 项；= models-page-selftest）· `verify-site`（735 项，真浏览器） | `models-page-selftest` 复跑 **exit 0**；**真浏览器侧我未复跑**（需浏览器链，属 t18/t19 的 gate；本审只确认该步骤存在于 action.yml 且 t18 报告 48/49） | **GATED（浏览器侧由 t18 承担，本审未独立复跑）** |
| R5 | API 侧计价条目必须有出口且不能绕过 | `model-registry-gaps.json` 双侧化（`apiPlanId`+`modelKey`+`variant`+`reason`） | links 82（API 69 + Coding 13）· declarations 54 | `selftest:api-plans` · `check:model-registry-links` · `validate --strict` | 复跑三件**全 exit 0**；我独立数出 93 条计价条目 / 82 映射 / 54 声明；**对抗性审查 t26 = pass**（含「删 1 条声明 ⇒ 6 门禁全红」的反证） | **GATED** |
| R6 | 数据扩充有官方依据（不采信第三方） | curated 层 + 每条引文（`provenance`） | 各厂商官方页（逐字引文 + `sourceUrl`） | `validate --strict`（官方域守卫 + 引文自称扫描）· `selftest:provenance` | `validate --strict` 复跑 **exit 0**；`selftest:provenance` 复跑 **exit 0（实测 132 项）**；**但见 §9.4：这条门的"真实引文验真"有构造性缺口，t17-M24 已留档** | **GATED（含已留档的边界）** |
| R7 | 门禁登记制：新增自测必须被门禁真的跑到 | `.github/actions/gate/action.yml`（49 步）· `check-ci-consistency`（38 项） | `verify.yml:125` 的 `--expect-checks=38` | `check-ci-consistency`（含 (17) 正向 + (19) 反向登记制） | 复跑 **exit 0 / 「38 项 0 失败」**；`package.json` 我数到 **scripts 94 / selftest:* 25**，与基线一致（无漏登记） | **GATED** |
| R8 | 变更历史与生命周期（不做假事件） | `plan-history` / `api-plan-history` / `deal-history` + 熔断 | 各 store 的 `lastSeen`/`firstSeen` | `check:plan-history` · `check:api-plan-history` · `check:history` · `selftest:history`（实测 61 项） | 三个 check 与 history 自测**复跑全 exit 0**（`history-selftest` 61 项绿） | **GATED** |
| R9 | 部署链必须先过门禁 | `deploy.yml` prepublish → build → deploy；`collect.yml` 门禁在提交之前 | workflow 文件本身 | `check-ci-consistency` 的 (12)/(13) | `check-ci` 复跑里 (12)/(13) 均 ✓（prepublish 无 job 级 if、门禁在字节 3745 → push 在 7883） | **GATED** |
| R10 | 线上部署与冒烟 | `verify-site.js --url=<线上>` | 线上产物 | CI gate + 线上冒烟 | **本审未验证**：自审时 t19 仍 `in_progress`（推送/合并/部署未完成，见 §9.5）。**我不能替它下结论** | **NOT-VERIFIED-BY-AUDITOR** |
| R11 | 变异测试有牙（≥15 条，逐字节恢复） | `research/_raw/t17/mutation-battery.cjs` + 用例库 | 27 条用例 | 电池自身（非门禁步骤） | 电池 JSON 我独立解析：`total 27 / CAUGHT 24 / knownNotCaught 2 / GREEN 1 / unexpectedRed 0 / restoreFailed 0 / mutationTargetsUnchanged true` | **EVIDENCED-NOT-GATED**（电池是一次性器具，不是常驻门禁） |
| R12 | 残余风险有唯一收敛处 | `research/coverage-expansion-v1-residual-register.md` | 该文件 | 无（文档） | 我数到该文件 131 行表格行；残余 (j) 已从「未关闭」改为「已定位 / 修复在途(t31)」；t31 已完成（`verify-site` 735/0） | **EVIDENCED-NOT-GATED** |
| R13 | 覆盖报告完整性（§41 / §42） | `coverage-report.js` 的文本 + 冻结 JSON 键 | 报告自身 + `link-registry` 契约 | `report:coverage` 自检 | t45 逐项核对（8 条里 7 条有完整载体、1 条缺）→ **t46 已补**（五态普查 + 候选明细进 JSON + 硬断言）。本审只确认 `report:coverage` exit 0 | **GATED（§41 第 4 条的载体由 t46 补齐，本审未逐字复核其文本）** |
| R14 | Schema 可诚实表达（不换算、不派生） | `api-plan-schema.js` 的枚举与红线 | 代码里的枚举常量为唯一出处 | `selftest:api-plans`（实测 176 项）· 单位红线静态扫描 | `api-plans-selftest` 复跑 **exit 0**；t9 的 12 项 DEFERRED_SCHEMA 已登记不落盘 | **GATED** |
| R15 | 部署前有线上旧版基线（可判定"部署是否生效"） | `research/_raw/t40/live-baseline.json` + 比较器 | 线上响应头 | 无（一次性） | **本审未验证**：属 t19 的冒烟前置，我未访问线上 | **NOT-VERIFIED-BY-AUDITOR** |

**矩阵小结**：15 条里 **GATED 11 · EVIDENCED-NOT-GATED 2 · NOT-VERIFIED 2**。
两条 NOT-VERIFIED 都属「部署/线上」这一类 —— 它们在自审时刻**客观还没发生**（t19 仍在跑），不是我查不出来。

---

## 4. Git diff 逐文件复核

**总览（`git diff --name-status a4dd40f HEAD`，自审 HEAD `2ebcf62`）**：**261 个变更 = 50 M + 211 A**，**+88,497 / −816 行**。

| 区域 | 文件数 | 我的判断 |
|---|---|---|
| `research/_raw/**` | 196 | **预期内**：本轮所有任务的机读证据与一次性脚本。判据是「是否与产物同源」（§4.4），不是逐行读 |
| `scripts/tools` | 25 | 实现 + 自测（新增 8 个 selftest/报告脚本，改 17 个） |
| `scripts/data` | 14 | 数据落盘（providers/links/gaps/targets/source-health/各类 history） |
| `research(docs)` | 8 | 人读报告（残余登记表、来源健康裁决、数据质量审查、模型当前性、PR 素材…） |
| `root/other` | 7 | 根目录派生产物（`deals.json` / `plans.json` / `api-plans.json` / `models.json` / `model-registry-links.json` / 两份快照） |
| `scripts/lib` | 6 | 判据层（coverage-targets / model-freshness / model-registry / landing / api-plan-schema 等） |
| `.github` | 2 | `action.yml`（45→49 步）+ `verify.yml`（37→38） |
| `docs` | 2 | SCHEMA-v3.0（双侧口径）/ SCHEMA-v2.5 |
| `scripts(other)` | 1 | `scripts/validate.js`（引文自称牙 + `require.main` 守卫） |

### 4.1 为什么改 / 是否 scope creep

- **为什么改**：每一类都能落到某个具体任务上（196 个 `research/_raw` 文件按 `t1…t46` 目录分；`scripts/*` 按 t2/t4/t5/t6/t7/t9/t11/t23/t24/t25/t27/t30/t31/t33/t35/t41/t44 的载体分）。
  我没有发现**没有任务归属**的变更（判据：文件路径里的 `tNN` 或 `lastCommit` 的提交说明）。
- **scope creep 认定**：我认定 **2 处**，都**已被披露且被裁定为必需**，不是偷偷扩边：
  1. `coverage-report.js` 的 253–296 行（t23 除了 299/305 外多改的记账行）—— 队长已裁定「必需，否则报告层与 lib 层未映射读数两个口径、`report:coverage` 自检必红」；
  2. t44 的补充证据里主动申报的 5 个**非 inScope** 文件（`archive/history/changes/app-token/audience-selftest` 各 +1..+4 行），我复核其口径为**纯注释**（t44 自证「新增行里非注释行 0 条」）—— 这一点我**没有逐字节复核**，标为 **EVIDENCED-NOT-VERIFIED**。
- **我认定「更像越界」但没有证据支持的一处**（写下来供 t22 判断）：`scripts/tools/feeds-selftest.js` 的 13 条新断言（t31）在任务书里是「在已登记的 selftest:feeds 里用夹具把原意钉住」——
  它确实是修判据的正当动作，但**改动落在了一个与 t31 名义主题（verify-site 假红）不同的文件上**。我判它是**正当的**（假红的判据改正需要夹具），但建议 t22 把它记成「跨文件但是同类修复」。

### 4.2 是否降低既有断言（硬判据：`check(` 调用数逐文件比对基线）

对全部 21 个「测试/检查」类变更文件，我逐文件算 `check(` 调用数（基线 vs 自审 HEAD）。
> **口径提醒**：下表是 **`check(` 调用数（静态）**，与**自测实跑的"项数"不是同一个量**（一个 `check()` 可能在循环里跑多次，也有 `requireDist` 这类条件项）。
> 引用时请写清用的是哪一个：静态调用数用于「有没有减少」，实跑项数用于「现在有多少条牙」。

| 文件 | 基线 → 现在 | 差 |
|---|---|---|
| `coverage-targets-selftest.js` | 0 → 84 | **+84（新文件）** |
| `models-selftest.js` | 90 → 140 | +50 |
| `models-page-selftest.js` | 84 → 125 | +41 |
| `model-freshness-selftest.js` | 0 → 35 | **+35（新文件）** |
| `feeds-selftest.js` | 118 → 132 | +14 |
| `verify-site.js` | 420 → 433 | +13 |
| `provenance-selftest.js` | 58 → 67 | +9 |
| `model-role-vocabulary-selftest.js` | 0 → 8 | **+8（新文件）** |
| `vendor-page-selftest.js` | 53 → 58 | +5 |
| `api-plans-selftest.js` | 147 → 148 | +1 |
| `data-docs-selftest.js` | 60 → 61 | +1 |
| `check-ci-consistency.js` | 31 → 32 | +1 |
| 其余 9 个测试文件 | 不变 | 0 |

⇒ **降低既有断言的文件 = 0 个**（`check(` 数没有一个下降）；`throw new Error(` 数在全部 21 个文件里也**没有一个下降**。
**但我要给这条判据标明它的边界**：`check(` 计数**测不出「同一个 check 的判据被改弱」**（例如把 `=== 4` 改成 `>= 1`，计数不变、强度下降）。
我抽查了三处**恰好是这种形态**的改动，结论如下：

| 抽查点 | 改动前 | 改动后 | 我的判定 |
|---|---|---|---|
| `vendor-page-selftest.js` 的 R5 | 写死 `skippedNoIdentity.length === 4` + 4 个名字 | 对每个 `vendorKey===null` 身份逐条判 (a) 恰 1 条 skip (b) 无页 (c) 无登记 (d) 磁盘集合 == 计划集合 | **更强**（t41 已给两侧反证：A 变红 / B 对照组绿 / C 变红） |
| `feeds-selftest.js:839` | `PLAN_CHANGE_FEEDS.length === 2` | 与「进入夹具前的注册表快照」逐身份 + **逐序**对账 | **更强**（换序也红）—— 但我只读到 t44 的自述，**未独立反证** |
| `verify-site.js` 的空态判据 | `/0 条/` 子串匹配 | 具名 `isZeroCountRow()`（数字边界） | **更强**（子串匹配会把 `10 条` 当空态）——t31 报 735/0；**我未复跑真浏览器** |

### 4.3 是否重复 truth source（同一事实两处可写）

| 事实 | 我认定的唯一出处 | 有没有第二处可写 | 判定 |
|---|---|---|---|
| 「要覆盖什么」 | `scripts/data/coverage-targets.json` | 没有第二个手写处（报告里的七态由 `lib/coverage-targets.js` 派生） | ✅ 单一 |
| 「模型当前性档位」 | `scripts/lib/model-freshness.js`（策略）+ registry 的 `modelRole` | `MODEL_ROLES` 词表与 freshness 层**两处都列 role** —— 但这**已被门禁钉死为逐字相同**（`model-role-vocabulary-selftest` 8 项） | ✅ 单一（有对账牙） |
| 「厂商页该不该建」 | `scripts/lib/landing.js` 的门槛判据 | `seo.js` 有一份 `gate-threshold` 镜像 —— 同样有对账自测（`vendor-page-selftest` ⑥ 节 5 项） | ✅ 单一（有对账牙） |
| 「API 计价条目的出口」 | `model-registry-links.json`（映射）+ `model-registry-gaps.json`（处置） | 覆盖报告的读数必须与 lib 同口径（t25 加了硬交叉断言：report 计数 ≠ lib 计数即红） | ✅ 单一（有对账牙） |
| **跨层同名不同义（登记为已知歧义）** | 报告 JSON `declaredApiEntries`（数）= lib `declaredApiIdentities`；报告 JSON `declaredApiEntryRows`（行）= lib `declaredApiEntries` | **确实存在两处同名不同义** | ⚠️ **已登记**（t29 在组装处写死对照 + t25 的硬交叉断言兜底；**未重命名**是队长的取舍）。我判它**可接受但不漂亮** —— 见 §9.6 |

### 4.4 是否手改派生产物（这是最要命的一类）

根目录 5 个派生产物（`deals/plans/api-plans/models/model-registry-links`）+ `scripts/data/**` 的派生化文件，**全部有可重建门禁**。我复跑：

| 门禁 | 结果 |
|---|---|
| `check-reproducible.js`（deals） | **exit 0** —— 「值全部有源，且管线对它是幂等的」 |
| `check-plans-reproducible.js` | **exit 0** —— 「与 curated_plans.json 的产出逐字节一致 · 37 条」 |
| `check-api-plans-reproducible.js` | **exit 0** —— 「17 条 · 14 个平台 · 93 条计价条目」 |
| `check-models-reproducible.js` | **exit 0** —— 「models.json 与 model-registry-links.json 都与来源层逐字节一致 · 44 模型 / 82 映射」 |
| `check-model-registry-links.js` | **exit 0**（候选 0 条，未见强推映射） |
| `check-feeds-reproducible.js` | **exit 0** —— 「2 次构建，全部逐字节一致」（**第一次跑时 exit 1**，见 §9.1） |

⇒ **没有手改派生产物的证据**：6 道门禁全部要求「产物 == 来源层派生」，逐字节。

### 4.5 Stable ID churn（题面 §十 的纪律：改内容不换 id）

| 身份空间 | 基线 | 现在 | 移除 | 新增 | **同名不同 id（churn）** |
|---|---|---|---|---|---|
| `providers.json` 的键 | 23 | **34** | **0** | 11（ai360 / baichuan / stepfun / sensetime / replit / aws / jetbrains / groq / together / fireworks / cerebras） | n/a（键本身就是身份） |
| `plans.json` 的 12 位 id | 23 | **37** | **0** | 14 | **`sameIdentityDifferentId: []`（空）** |
| `api-plans.json` 的 12 位 id | 13 | **17** | **0** | 4 | **`sameIdentityDifferentId: []`（空）** |
| `models.json` 的 slug | 44 | **44** | **0** | 0 | 顺序未变；`id` 形状 44/44 匹配 `^[0-9a-f]{12}$` |
| `vendor-slugs.json` 的键 | 19 | 25 | **0** | 6（阶跃星辰 / 商汤科技 / 百川智能 / 360智脑 / Replit / AWS） | n/a |
| `aliases.json` / `official_urls.json` / `landing-pages.json` / `category-slugs.json` | 96 / 10 / 1 / 11 | 同左 | 0 | 0 | 无漂移 |

**结论：身份层零 churn** —— 没有任何一条**既有**身份被改 key/改 slug/换 id；新增全是追加。
唯一需要提醒的是**顺序**：`providers.json` 与 `vendor-slugs.json` 的键顺序变了（新增键插入位置），
这两个文件的「顺序」**不是**判据（判据是规范序被校验器重排序），我在 §6.3 用 `check:models:reproducible` 证明了 models 侧顺序稳定。

---

## 5. 独立重算（第二条路径，不复用 lib / 报告代码）

我直接读来源文件、自己数（脚本 `audit-facts.cjs` 只 `JSON.parse` 原始文件，不 `require('scripts/lib/**')`）：

| 项 | 我的独立读数 | 完成报告/门禁的读数 | 一致 |
|---|---|---|---|
| providers 身份数 | **34** | 34 | ✅ |
| coverage-targets 行数 | **34**（`targets[]`，逐行 9 字段） | 34 | ✅ |
| plans | **37**（18 家） | 37 / 18 家 | ✅ |
| api-plans | **17**（14 家）· 93 条模型计价条目 | 17 / 14 / 93 | ✅ |
| registry 模型 | **44** | 44 | ✅ |
| links | **82** = API 69 + Coding 13 | 82 / 69 / 13 | ✅ |
| gaps 声明 | **54** | 54 | ✅ |
| **方程**：93 = 81 映射 + 12 处置 + 0 未判 | 我按 links(69 条 API) × 展开条目 + declarations 独立算得 **93 = 81 + 12 + 0** | 同 | ✅ |
| catalogStatus 普查 | `{unknown 40, current 3, legacy 1}`，和 = **44** | t46 的普查行同 | ✅ |
| `releasedAt` 非空 / `freshnessGroup` 非空 | **4 / 1** | 4 / 1 | ✅ |
| 门禁步骤 / check-ci 项 / scripts / selftest:* | **49 / 38 / 94 / 25** | 同 | ✅ |

**一处我自己的错，值得写下来**（自审也会错，这与 §9.2 是同一类教训）：
我第一次算「coverage-targets 行数」时用 `Object.keys(ct).filter(!startsWith('_'))` 得到 **3**（那是三个元数据键），
差点把「意图层只有 3 行」当成缺陷写进报告。**改正方式是去看结构**（`targets[]` 是数组字段），
而不是相信自己的第一版判据。⇒ 纪律：**宣布「数字不对」之前先确认自己读的是不是那个数组。**

---

## 6. 可重建 / 门禁现场读数

| 命令 | 结果 |
|---|---|
| `node scripts/validate.js --strict` | **exit 0** · 「✅ 校验通过（strict 模式）」（另 2 条警告：Getsolved↔Getsolved AI Detector、KREA↔Kreado AI 疑似未合并 —— 与基线同款，不是本轮引入） |
| `node scripts/tools/check-ci-consistency.js` | **exit 0** · 「✅ CI 口径检查 38 项，失败 0 项」；`--expect-checks=37` ⇒ **exit 1**（外部钉住仍有牙）、`--expect-checks=36` ⇒ **exit 1** |
| `node scripts/tools/coverage-report.js` | **exit 0** · 「0 处问题」 |
| `check:plans:reproducible` / `check:api-plans:reproducible` / `check:models:reproducible` / `check:model-registry-links` / `check:feeds:reproducible` / `check-reproducible` | **6/6 exit 0**（详见 §4.4） |
| 14 个自测复跑 | **14/14 exit 0**（**项数以实跑为准**）：validate-strict · check-ci(38) · coverage-report · coverage-targets(110) · freshness(100) · model-roles(7) · models-page(115) · models(143) · vendor-page(57) · api-plans(176) · feeds(145) · provenance(132) · data-docs(58) · history(61) |

---

## 7. Mutation 结果（如实写入，含失败项）

来源：`research/_raw/t17/logs/battery.json`（我独立解析）+ `MUTATION-RESULTS.md`。

| 量 | 值 |
|---|---|
| 用例总数 | **27**（对照组 1 + 真实变异 26） |
| **CAUGHT** | **24** |
| 对照组 | 1（`M00 = GREEN(PASS)`） |
| **NOT_CAUGHT(KNOWN)（留档盲区）** | **2** |
| 非预期红 / 变异应用失败 / 恢复失败 | **0 / 0 / 0** |
| 逐字节恢复 | 100%（判据是「每个用例先记 sha256 → 变异 → 跑门禁 → 用 gold 覆盖回写 → 重算 sha256 比对」，且**不用** `git checkout/restore/stash`） |
| 共享树只读 | 电池自报 `mutationTargetsUnchanged=true`、`unchangedDuringCases=true`、`changedDuringCases=[]` |

### 7.1 两条盲区（这就是「失败项」—— 如实写）

| 编号 | 变异 | 为什么没抓住 | 现在的状态 |
|---|---|---|---|
| **M26** | 改掉 `coverage-targets.js` 里没人读的 `PRECEDENCE` 常量 | 它只被定义与导出、**没有任何生产者读它** ⇒ 改它不动行为，没有门禁该红 | **已收尾**：该常量**已被删除**（t35），因此这个变异**再也落不下去**；真判据出处标注在 `deriveDimension()`（残余登记表 §4.3 第 5 条） |
| **M24** | 把 `provenance-selftest` 的牙拔掉（失败不再入 failures 队列 ⇒ 自测恒绿） | 自测**无法证明自己的断言队列还在工作** —— 这是「测试改自己」，**构造上接不住** | **已留档为方法论边界**（t35/t36）。**注意**：这条盲区**至今仍然是盲区**（离线门禁抓不到），只是它现在被写清楚了 |

⇒ **我的判断**：电池的价值不在 24/27 这个比例，而在**它把 2 条抓不到的原因写清了**。若有人在最终材料里把
「变异 24/27」写成「门禁覆盖充分」，那是**过度解读** —— 那 2 条是**结构性**的（一条已删除、一条是自测的自我指涉）。

---

## 8. Findings 与 Fixes（P0 / P1 计数）

### 8.1 计数（本审的明确结论）

| 级别 | 计数 | 依据 |
|---|---|---|
| **P0（阻断发布 / 数据错误 / 安全）** | **0** | 全轮 finding 里没有一条被判定为 P0；strip 到「会不会让线上出错」这一问上，我复跑的门禁与独立重算**全部一致** |
| **P1（must-fix，影响真实性或门禁有效性）** | **0（未关闭）** | 见下表：7 条曾为 P1/blocker 的 finding **全部 closed**，且每条都有可复现证据 |
| 曾为 P0/P1 但已关闭 | **7** | t14-F1(high) · t14-F2/F3(medium) · t21 口径的 T18-F1(blocker，t41 修) · t28-F1/残余(j)(blocker，t31 修) · t15-F1/F2(high，t32+t33 修) |
| P2/P3 剩余 | 见 §9.4（不是 0） | 残余登记表 + 两处结构性缺口 |

### 8.2 已关闭清单（每条：finding → 修法 → **我的证据**）

> **一条来源限制（先说清）**：t14 的四条 finding（F1–F4）我**没有找到它的原始审查工件** ——
> `research/quality-closure/review-registry/` 下只有 `T19-P0-REVIEW.md`（质量收口期的那份，读起来与 t14 无关）。
> 因此下表第 1–3 行的「finding 原文 / 级别」是**转述自任务板 output**，不是我读到的原始 finding。
> **我独立验证的是"现在这门有没有牙"**（复跑 exit 0 + 引用 t28 的变异结论），**不是**"当初那条 finding 措辞是否准确"。
> 相比之下，第 4–7 行的 finding（T18-F1 / T28-F1 / t15-F1,F2 / t15-F6）我都有**一手载体**（t41/t31/t33/t32 的产物与队长更正），可核对。

| # | Finding（原级别） | Fix | 我的独立证据 |
|---|---|---|---|
| 1 | t14-F1(high) 关系层缺失 ⇒ 覆盖报告仍绿 | t28 在 `linksMissing` 分支 push problem + 定向变异 | 我复跑 `coverage-report` exit 0（正常态）；反证由 t28 给出（删链接文件 ⇒ 变红），**我未独立重做该变异** |
| 2 | t14-F2(medium) `/models/` 索引无身份对账 | t28 加两条断言（slug 集合、详情链接可解析）+ 三组变异 | 我复跑 `models-page-selftest` **exit 0（实测 115 项）**；变异侧由 t28 给出 |
| 3 | t14-F3(medium) 两个新自测没登记 | t7/t27 同步 `action.yml` + `package.json` + 反向登记制 (19) | 我复跑 `check-ci` **exit 0 / 38 项 0 失败**；(19) 在实跑输出里逐字可见 |
| 4 | **T18-F1(blocker)** R5 写死计数被数据增长顶翻 | **t41** 改成派生式判据（提交 `118a95c`）+ 两侧反证 | 我独立复跑 `vendor-page-selftest` **exit 0（58 项）**；读数 `9 个 vendorKey=null 身份 / 22 个厂商页 / 磁盘 22 == 计划 22` 由 `t41-derived-r5-readings.json` 逐条给出 |
| 5 | **T28-F1/残余(j)(blocker)** `verify-site` 用 `/0 条/` 子串匹配把 `10 条` 当空态 ⇒ 门禁自造假红 | t31 抽出具名 `isZeroCountRow()` + 夹具 13 条（含对照） | 我**未复跑真浏览器**；`feeds-selftest` 我复跑 **exit 0（实测 145 项，含 t31 新增的 13 条夹具牙）** |
| 6 | t15-F1/F2(high) API 侧引文「前半逐字 + 后半改写」 | t33 把 4 条引文改成官方逐字片段 + 同步 4 条链接抄件（只改 quote 行） | 我复跑 `validate --strict` **exit 0**、`check:model-registry-links` **exit 0**（逐字耦合自洽） |
| 7 | **t15-F6（审查侧误判）** 声称两份 `source-health.json` 逐字节相同 | 队长独立复核**证伪**；t32 按真实事实重写报告 §6 并留更正记录 | **我自己复现了证伪**：基线 sha256 与当时现行 sha256 不同（§2 的 C4 行）；`git show a4dd40f:…` 得 `consecutiveFailures: 9` |

### 8.3 我这次自审自己产出的 finding（也计数，且不藏）

| id | 级别 | 内容 | 处置 |
|---|---|---|---|
| T21-A1 | low | 本审第一版把 `coverage-targets` 行数算成 3（读错了结构） | **已自纠**并写进 §5，作为「判据先确认再宣布」的实例 |
| T21-A2 | low | 「无残留旧数字」这一条**只能在 t20 定稿后完整成立**（报告当时还不存在） | 扫描脚本留在 `research/_raw/t21/`，建议 t22 复跑 |
| T21-A3 | medium（**给 t20/t19 的动作项**） | 最终材料若写「futurepedia 已恢复 / 9-9 healthy」**现在已过期**（§9.3） | 必须改成带时间戳的写法 |

---

## 9. 「报告比实现好看」的风险：证据与否定结论（验收⑤）

**我不打算只给一处 —— 这样更难被反驳。**四处，其中**第 1 处是我有硬证据的**。

### 9.1 硬证据 #1：可重建门禁的第一跑红过（并发窗口）
`check-feeds-reproducible.js` 我在 15:5x 的第一次调用返回 **exit 1**（`❌ 订阅可复现门禁：2 次构建，1 项失败`），
几分钟后**同一命令 exit 0**。同一现象在队长记录里也出现过（t25 的补充证据：`validate --strict` / `coverage-report` / `coverage-targets-selftest` 三处瞬时红，
根因是 t24 并发写 plans/providers/coverage-targets）。
⇒ **任何"全绿"的读数都必须附「跑的哪棵树 + 那段窗口有没有别人在写」**，否则它比实现好看。

### 9.2 硬证据 #2：本轮有过一次**审查侧**的不可复现主张（t15-F6）
原 finding 主张 `source-health.json` 与基线**逐字节相同**、`9/9 healthy` 是基线既有值。
**我用命令复现出：两份 sha256 不同、基线是 `8 healthy / 1 failed`（futurepedia `consecutiveFailures=9`）。**
⇒ 这是**报告（审查报告）比实现好看**的实例，且它恰好出在「审查员拿两份文件比字节」这种最容易被误用的判据上。
**否定结论**：这条已被证伪并留档（t32 重写 + 队长 append-only 更正），所以它**不构成"现在还存在美化"** ——
但它证明了**审查也会美化**，因此本审（§2）刻意**不引用任何人的结论**、全部自己数。

### 9.3 硬证据 #3：`source-health` 是活的 —— 最终材料里最容易写错的一处
| 时刻 | futurepedia | 全库 |
|---|---|---|
| 基线 `a4dd40f` | `status=failed` · `consecutiveFailures=9` · `lastAttemptAt=2026-10-04T04:28:23Z` | healthy 8 / failed 1 |
| 队长的复核（约 10:34Z） | 恢复 | **9/9 healthy** |
| **我的读数（16:31Z）** | **`status=failed` · `consecutiveFailures=10`** | **healthy 8 / failed 1** |
⇒ **"futurepedia 已恢复"这句话在 16:31Z 时已经不成立。**
**给 t20/t19 的硬要求**：写这条时必须带 `generatedAt` 与 `consecutiveFailures` 的读数与时刻，**不许**写无限定的「已恢复」。
（这正是本轮反复强调的「三态/时效」纪律在**证据层**的同一形态。）

### 9.4 硬证据 #4：两处**结构性**缺口（不是 bug，是"门看起来比实际宽"）
1. **`provenance-selftest` 的真实引文验真没有离线门禁**（t17-M24）：把真实引文改成编造文本，自测**仍然 114/114 绿**。
   现在有的三层（引文自称扫描 / 官方域守卫 / 逐字耦合）**覆盖不到**"引文是否真的忠于官方页"。
   ⇒ 若最终材料写「引文全部与官方页逐字一致（有门禁保证）」，那是**夸大**；正确写法是「有 3 层结构约束 + 人工核对，真实性不在离线门禁覆盖内」。
2. **跨层同名不同义**（§4.3 最后一行）：报告 JSON 的 `declaredApiEntries` 与 lib 的 `declaredApiEntries` **不是同一个东西**。
   它有硬交叉断言兜底（误读会当场红），但**读代码的人会先被名字骗一次**。

---

## 10. Remaining P2/P3（不是 0，逐条）

| # | 级别 | 内容 | 出处 / 状态 |
|---|---|---|---|
| R-1 | P3 | 历史层与档案页仍把 `sourceUrl` 显示为「原始出处」而该标签在**生产今日不可达**（deal-history 事件 0、档案详情页 0） | 残余登记表 / `NEXT-STEPS.md`；**DEFERRED**（不为一条跑不到的路径改代码） |
| R-2 | P3 | `verify.yml:95` 的**注释**曾长期写着旧数字 `--expect-checks=36`（现已被改成 38） | baseline 的 `expectChecksCommentDrift` 指出过；**现在已同步**（我读到 38） |
| R-3 | P2 | 变异电池的两条盲区**结构性存在**（M26 已通过删除常量消除；**M24「测试改自己」仍在**） | §7.1；方法论边界已留档，**无修复方案**（构造上接不住） |
| R-4 | P2 | 34 条历史 API 映射的引文未点名模型身份（判据写死 + 清单 sha256 已给） | 队长仲裁数 **34** + `sha256 b9d97c444e7e59d0d90b2855165a1bc67422b2d0dc573805569d2cc5e6c6f696`；**只许引用这一对数**（不许与 52/36 混用） |
| R-5 | P2 | `aging` / `historical` 两档当前为 0（只有 4 条有官方 `releasedAt` 证据） | §3-R3 的读数；成因是**证据不足**而非策略失效 ⇒ 阈值灵敏度由 `selftest:freshness` + `report:freshness-sensitivity` 守住 |
| R-6 | P3 | `master` 当前**无分支保护**（gate 未过也能合并，靠人工确认） | t37 预检；t19 的合并必须人工确认 |
| R-7 | P3 | §87 的 29/30 两条（Source Health 已审查 / 长期失败 source 有裁决）的载体是**人读报告**而非逐源机读 JSON | 队长已裁定「机读载体是**新增需求**，不是缺失」 |
| R-8 | P3 | ~~本审的「无残留旧数字」扫描未覆盖 t20 的完成报告~~ **已在自审内补扫**（t20 报告 3 处命中全为正确用法、t19 PR 正文 0 处） | §2.1 补扫表；**若 t20 之后再改报告仍需重扫**（脚本见 §11） |

---

## 11. 复现命令（本审的全部读数都能重跑）

```bash
WT=".worktrees/coverage-expansion-v1"
# ① 主采集（corrections / 残留 / diff 分类 / churn / 可重建 / 变异）→ audit-measurements.json
node "$WT/research/_raw/t21/audit-measure.cjs"
# ② 事实与门禁读数 → audit-facts.json（34 providers / 34 targets / 93 条目 / 14 道门禁）
node "$WT/research/_raw/t21/audit-facts.cjs"
# ③ 实时态（source-health 漂移 + feeds 可复现 + 6 道可重建）—— 会打时间戳
node "$WT/research/_raw/t21/verify-live.cjs"
# ④ 基线 SHA 隔离构建（数 dist 页数，证 C5）—— 用 %TEMP% 副本，不碰共享树
node "$WT/research/_raw/t21/baseline-build.cjs" <临时目录>
# ⑤ 摘要
node "$WT/research/_raw/t21/summary.cjs"
# ⑥ 旧数字残留扫描（17 份材料）
node -e "const m=require('$WT/research/_raw/t21/audit-measurements.json');console.log(JSON.stringify(m.residualScan.filter(r=>r.hits&&r.hits.length),null,1))"
```

**引用纪律（给 t20/t22）**：

- 四个旧数字只许以「草稿 → 实测」的形式出现，且**必须说明当前值又变了**：`41→45（现 49）`、`36→37（现 38）`、`5023 字节 vs 5 条关系`、`8→9（现 10，见 §9.3）`；
- 「变异 24/27」**必须**与「2 条留档盲区」一起引；
- 「引文」相关结论**必须**带上 M24 的边界；
- 任何「全绿」读数**必须**带时刻与并发说明（§9.1）。

---

## 12. 附录：本审的原始读数在哪

| 文件 | 内容 |
|---|---|
| `research/_raw/t21/audit-measurements.json` | corrections 5 条 + 残留扫描 + 261 文件分类 + 21 个测试文件的断言 delta + identity churn + 6 道可重建 + 门禁 + 变异解析 |
| `research/_raw/t21/audit-facts.json` | 事实读数（providers/targets/plans/api/models/links/gaps/source-health/vendorKey=null 名单/catalogStatus 普查）+ 14 道门禁的末行 + 34 家的官方域登记 |
| `research/_raw/t21/verify-live.cjs` 输出 | source-health 漂移对照（基线 vs 现行）+ feeds 可复现 + 6 道可重建 + validate/coverage |
| `research/_raw/t21/audit-measure.cjs` · `audit-facts.cjs` · `verify-live.cjs` · `baseline-build.cjs` · `summary.cjs` · `show-baseline.cjs` | 可复跑脚本（全部只读；唯一写盘是它们自己的 JSON 产物） |
