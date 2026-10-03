# FINDING_STATUS_BEFORE — 目标 finding 在最新 master 上的存在性检查

> **任务**：T02（owner `evidence-analyst`，attempt 1）· 产出时间 2026-10-03（Asia/Shanghai）
> **检查对象**：`origin/master` = **`21cf66d530de1124478824386ff95582c73afece`**（= T01 冻结的 worktree HEAD）
> **交付物**：本文。上游基线见 `research/quality-closure/BASELINE.md`（T01）。
> **本轮不动任何产品文件**：只读检查 + 在独立副本里做变异复跑（见 §0.2）。

---

## 0. 方法与口径（先读这一节）

### 0.1 「不得把审计文字当结论」是怎么落实的

每一条 finding 都给出**本轮自己跑出来的**证据，并按强度标注：

| 标记 | 含义 |
|---|---|
| `[命令级]` | 本轮真的执行了命令，记录命令原文 + exit code（+ 关键输出行） |
| `[数据级]` | 本轮自己重算数据/页面得到数字（脚本读 `deals.json` / `api-plans.json` / 冻结构建产物） |
| `[源码级]` | 本轮在**冻结内容**上读到指定 `file:line`，确认机制存在（不是「审计说如此」） |

**没有任何一行**写成「应该仍在」。凡是本轮没有复现的，明确写「未复现」并保留审计的证据边界（§3）。

### 0.2 怎么保证检查的是「最新 master」而不是别人的工作区

本任务执行期间，**worktree 工作区正在被 T05+ 的修复并发改写**（实测 22 个 tracked 文件 `M` + 新增 `scripts/tools/history-nonempty-e2e.js`）。
因此本节所有检查一律针对**冻结内容**，与并发修改无关：

- 冻结内容 = `git archive HEAD` 的展开副本 `.qc-t02/sandbox/`（497/503 文件，缺的 6 个是非 ASCII 文件名的 `mockups/*.html`，与判定无关）；
- 页面级证据 = 在该副本里 `node scripts/tools/build-local.js --out=dist.pristine`（**exit 0**，产物自检全过）后扫描产物；
- 变异复跑 = 同一副本（每个场景前用 `sandbox.tar` 重新展开，杜绝场景间污染）；
- 源码级证据 = 同一副本里的文件（行号 = HEAD 的行号）。

> ⚠️ 给下游的提醒：本文行号适用于 **HEAD `21cf66d5`**。工作区被修过之后行号会漂移；引用前先 `git show HEAD:<file>` 核对。
> 另外，下文出现的「工作区」一律指**冻结内容**，不是当前的 dirty worktree。

### 0.3 一个必须记住的坑：来源层 vs 派生产物（本轮踩过并纠正）

`model-registry-links.json`（仓根）是**派生产物**；`scripts/data/model-registry-links.json` 才是**来源层**，门禁读的是**来源层**。
本轮第一版删映射变异改的是仓根产物 → 四道门禁全绿，看起来「证伪了审计」；改成来源层后**精确复现**了审计结论（§2 的 S3a2/S3b2/S3c2）。
**下游做任何 registry 侧变异，必须改 `scripts/data/**`。**

---

## 1. 汇总表

图例：状态 = `STILL_PRESENT` / `ALREADY_FIXED` / `CHANGED` / `NO_LONGER_APPLICABLE`；分类 = `REPAIR NOW` / `GUARDRAIL` / `VERIFY` / `DESIGN` / `DOC` / `NOT REQUIRED`。
**全部 46 个目标 ID 的结论都是 `STILL_PRESENT`**（本轮没有任何一条在 21cf66d5 上已消失）；差异只体现在严重度口径与修复方式。

| # | finding ID | 旧严重度 | 审计状态 | 最新 master 状态 | 本轮证据 | 分类 | 处理决定 |
|---|---|---|---|---|---|---|---|
| 1 | `F-v3-registry-002`（P0-1） | **P0** | 成立（verify-x 独立复现） | STILL_PRESENT | 源码级 `model-registry.js:523-526`（本轮复核）；数据级 0 冲突 | REPAIR NOW | R-P0-1（冲突键改按展开的计价条目记账 + 常驻牙） |
| 2 | `F-v3-registry-001` ≡ `V3-MODEL-024` | P1 | 成立（[R3✓][RX✓]） | STILL_PRESENT | 数据级+页面级：12 组 / 9 页 / 少渲染 12 行 | REPAIR NOW | R-P1-9（`apiTargetOf` 展开全部变体） |
| 3 | `F-gate-001` | P1 | 成立（[RX✓]） | STILL_PRESENT | 命令级：步骤体换 `echo` → `check-ci` 36/36 exit 0 | GUARDRAIL | R-P1-1（冻结步骤体文本/哈希） |
| 4 | `F-gate-002` | P1 | 成立（[RX✓]） | STILL_PRESENT | 命令级：`allow_degraded_run` 写死 → 36/36 exit 0 | GUARDRAIL | R-P1-2（断言 `with:` 取值） |
| 5 | `F-mutation-001` ≡ `F-v3-residual-003` ≡ `F-r1-history-ai-005` | P1 | 成立（[RX✓] M17） | STILL_PRESENT | 命令级：pending 候选 变异前 exit 1 / 变异后 exit 0，三门禁全绿 | GUARDRAIL | R-P1-3（accept 判定抽纯函数 + 门禁断言） |
| 6 | `F-r1-history-ai-001` | P1 | 成立；**端到端仅源码级**（[RX-U]） | STILL_PRESENT | 源码级 `build-local.js:1146/1147` + `page-kinds.js:108-111` | REPAIR NOW | R-P1-4；**证据边界保持不变**（§3） |
| 7 | `F-r1-history-ai-002` | P1 | 成立（[RX✓] 算术） | STILL_PRESENT | 源码级 `build-local.js:3537` + `archive.js:616/67-69`；内存渲染相对引用按 `../../` 解析到 `archive/…` | REPAIR NOW | R-P1-5（前缀由路由深度计算 + 详情页回归） |
| 8 | `F-r1-identity-001` | P1 | 成立（[R1✓][RX✓]，计数口径有差异） | STILL_PRESENT | 数据级+页面级：6 页同屏并存「官方页面明写」与「第三方目录站收录」 | REPAIR NOW | R-P1-6（渲染层与 `sourceType` 联动） |
| 9 | `F-r2-api-001` ≡ `P2.5-API-TOOTH-002` | P1 | 成立（[R2✓][RX✓]） | STILL_PRESENT | 命令级：来源层 input/output 互换 → rebuild/repro/validate/selftest/history **全 exit 0**，发布数据变 28/8 | REPAIR NOW | R-P1-7（引文-数值交叉判据） |
| 10 | `F-r2-api-002` ≡ `P2.5-API-TOOTH-003` | P1 | 成立（[R2✓][RX✓]） | STILL_PRESENT | 命令级：13 处 `per_1M→per_1K` → 五道门禁 **全 exit 0**，发布单位分布变 `per_1K_tokens 13` | REPAIR NOW | R-P1-7（单位语义判据） |
| 11 | `F-r2-api-003` | P1 | 成立（[R2✓][RX✓]） | STILL_PRESENT | 命令级+页面级：第 7 列渲染成「其他 $1 / 每 100 万 tokens」，`assertPageHonesty` **0 问题** | REPAIR NOW | R-P1-7（第 7/8 列纳入逐格对账） |
| 12 | `F-r2-api-004` | P1 | 成立（[R2✓][RX✓]） | STILL_PRESENT | 命令级+页面级：第 8 列渲染成「免费额度 1,000,000 **credits**」，`assertPageHonesty` **0 问题** | REPAIR NOW | R-P1-7（同上 + credits 类型词结构断言） |
| 13 | `F-r2-api-005` | P1 | 成立（[R2✓][RX✓]） | STILL_PRESENT | 数据级：4 条非空 `freeTier`，`aliyun`/`tencent` 均 `period=one_time` 且描述含「90 天内」「首次开通」 | REPAIR NOW | R-P1-8（`stability` 枚举或移出 freeTier） |
| 14 | `F-r1-history-ai-004` | P2 | [R1✓]；**[RX-U] 未进 P0/P1 二次证伪表** | STILL_PRESENT | 命令级：`--out=.qc-probe/ai-envelope.json` → exit 0 且写出信封（任意路径无白名单） | GUARDRAIL | R-P2-5（并入 R-P1-3：`--out` 白名单） |
| 15 | `F-r1-identity-002` | P2 | 成立（[R1✓][RX✓]） | STILL_PRESENT | 数据级：按 `collect.js:257` 接线枚举 8 组合 → `headless_unavailable` **0 次**；直接调用判定函数可命中 | REPAIR NOW | R-P2-2（headless 判定提前 + 接线级断言；与 #24/#25 同根因） |
| 16 | `F-r1-identity-003` | P2 | 成立（[R1✓]） | STILL_PRESENT | 数据级：`inferred` 28 处，其中 `basis=source + derived=inferred` **24 处**；15 个推断页仍写「官方页面明写」 | REPAIR NOW | R-P2-2（渲染层任一轴 inferred 即用推断措辞） |
| 17 | `F-r1-identity-004` | P3 | 成立（[R1✓]） | STILL_PRESENT | 数据级：**完全相同的 6 个 id** 顶上 `sourceUrl ≠ provenance.sourceUrl` | DOC | R-P3-3（字段改名或页面标注「收录渠道」+ 断言） |
| 18 | `F-r1-ui-001` | P3 | 成立（[R1✓]） | STILL_PRESENT | 数据级：`/feeds/` 未列出 **10 个** `category-*` Feed 文件 | GUARDRAIL | R-P3-3（分组表由注册表遍历 + 「注册表有页面没有」断言） |
| 19 | `V1.6-FEED-006`（⇒ `F-r1-ui-002`） | ❌ INCOMPLETE | 成立 | STILL_PRESENT | 数据级：`dist/feed/api.xml` 不存在；注册表无 `api` spec（有 `free-api`） | DOC | 不新增 Feed：在 `/feeds/` 与文档给「推荐路径 → 实际路径」对照 |
| 20 | `V1.6-FEED-007`（⇒ `F-r1-ui-002`） | ❌ INCOMPLETE | 成立 | STILL_PRESENT | 数据级：`dist/feed/coding.xml` 不存在；注册表无 `coding` spec（有 `ai-coding`） | DOC | 同上 |
| 21 | `V1.0-HEALTH-003` | 🐛 DEFECTIVE | 成立（即 `F-r1-identity-002`） | STILL_PRESENT | 同 #15 | REPAIR NOW | R-P2-2 |
| 22 | `V1.0-HEALTH-009` | 🐛 DEFECTIVE | 成立（同根因） | STILL_PRESENT | 同 #15（`headlessReady` 输入被短路，实际不参与判定） | REPAIR NOW | R-P2-2 |
| 23 | `F-mutation-003` | P2 | 成立（[RX✓] M09） | STILL_PRESENT | 命令级：删来源层 `links[0]` → `check-model-registry-links` **exit 0**、`models-selftest` **exit 1** | GUARDRAIL | R-P2-2（补「registry 身份至少被一条映射/声明覆盖」断言） |
| 24 | `F-mutation-004` ≡ `F-v3-export-002` | P2 | 成立（[RX✓] M14） | STILL_PRESENT | 命令级：`data-docs-selftest` 硬编码 `dist`、`--dir` 无效、缺产物仍 38 项 exit 0；`seo-verify.js` 0 处引用 Manifest | GUARDRAIL | R-P2-2 / R-P2-3（加 `--dir`、「缺产物=红」、Manifest 对账） |
| 25 | `F-mutation-006` ≡ `F-r2-plans-002` | P2 | 成立（[RX✓][R2✓]） | STILL_PRESENT | 命令级：真实 plan 的三态 `fair_use: true→false + note=null` → `validatePlan` **0 错误**；来源层改后 rebuild/repro/validate/audience/provenance **全 exit 0** | GUARDRAIL | R-P2-2（引文与三态取值一致性检查） |
| 26 | `F-v3-export-001` | P2 | 成立（[R3✓]） | STILL_PRESENT | 数据级：产物根 11 个 JSON / Manifest 9 份 / 未登记 `source-health.json`（`feed.json` 属 Feed 注册表） | GUARDRAIL | R-P2-3（方向 2 扫描 + `source-health.json` 归属） |
| 27 | `F-v3-pages-001` | P2 | 成立（[R3✓]） | STILL_PRESENT | 命令级：同一 commit，「无 dist」`planshub 27 / archive 60 / data-docs 38 / vendor 50` 全 exit 0；「有 dist」32/61/40/50 也全 exit 0 | GUARDRAIL | R-P2-3（无 `--allow-missing-dist` 时跳过计失败 + 支持 `--dir`） |
| 28 | `F-v3-registry-003` | P2 | 成立（[R3✓]） | STILL_PRESENT | 命令级：删 API 映射 → `check` **0**、`validate` **0**、`models-selftest` **1**；删 Coding 映射 → `check` **1**、`validate` **1** | GUARDRAIL | R-P2-2（API 侧补 B 档/平行处置登记） |
| 29 | `F-v3-registry-004` | P2 | 成立（[R3✓]） | STILL_PRESENT | 命令级：来源层 `models.json` 复制 `glm-5.3` 顶层键（重复 2 处、`JSON.parse` 合法）→ 四道门禁**全 exit 0** | GUARDRAIL | R-P2-2（`load()` 加原文级重复键扫描） |
| 30 | `V1.0-PROC-004` | ❌ INCOMPLETE | 成立（复核计数更正：1 处） | STILL_PRESENT | 数据级（冻结内容，排除 research/）：含「与代码冲突」的文件 = 仅 `docs/v3.0/TASK-SPEC-v3.0.md` | DOC | R-P2-3 ①/R-P3-1（补 v1.0 `*-current-state.md` 冲突登记表） |
| 31 | `V1.0-PROC-007` | ❌ INCOMPLETE | 成立 | STILL_PRESENT | 数据级：v1.0 报告无「当前实际状态 / 已解决的问题 / 仍存在的问题 / 冲突」四项的**逐字**小节（含「技术债」「回滚」但非四项） | DOC | 同 #30 |
| 32 | `V1.0-PROC-008` | ❌ INCOMPLETE | 成立（复核计数更正：4 处） | STILL_PRESENT | 数据级：产品仓库 `回滚方案` 0 文件、`Phase A` 0 文件；`Phase C` 4 文件（＝复核更正所指的 4 处） | DOC | 同 #30（Phase A/B/C 划分、风险栏、回滚方案三项缺失） |
| 33 | `V2.0-METRIC-004` | ❌ INCOMPLETE | 成立（⇒ `F-r1-residual-002`） | STILL_PRESENT | 数据级：含「最近 7 天确认」0 文件；`verifiedAt` 出现于 38 个文件但均非时间窗口比率 | REPAIR NOW | R-P2-3 ②（实现 7 天窗口确认率并进 `/status/`）；**若 captain 按「不新增功能」判定，降级为 DOC 并如实标注未实现** |
| 34 | `V2.0-METRIC-011` | ❌ INCOMPLETE | 成立 | STILL_PRESENT | 数据级：含「变化事件准确率」0 文件；生产 events=0 无样本 | NOT REQUIRED | 不改功能；随 R-P2-4 的非空夹具演练再评估 |
| 35 | `V2.0-METRIC-012` | ❌ INCOMPLETE | 成立（⇒ `F-r1-residual-003`） | STILL_PRESENT | 数据级：`/status/` 页面命中「有效优惠/最近 7 天确认/官方来源/明确领取条件/中国可用性/有效期已确认」**0 项** | REPAIR NOW | R-P2-3（`/status/` 补指标出口）；同样受 #33 的口径保留约束 |
| 36 | `F-integration-002` | P3 | 成立（[RX✓]） | STILL_PRESENT | 源码级+数据级：`collect.yml` 的 `git add` 只有 5 个文件；`deals.updatedAt=2026-10-03` vs `plans/api-plans=2026-10-01` | DESIGN | R-P3-3（文档写明「按需人工重建」或接入 collect；契约本身未破） |
| 37 | `F-integration-005` | P3 | 成立（[RX✓]） | STILL_PRESENT | 源码级：`plan-schema.js:145 UNIT_PER = 1e8` vs `api-plan-schema.js:75 API_UNITS = per_1M/per_1K/per_1M_characters` | DOC | R-P3-3（交叉说明「每 1 亿 vs 每 100 万」） |
| 38 | `F-online-008` | P3 | **UNVERIFIED**（[R1✓] UNVERIFIABLE；[RX-U]） | STILL_PRESENT（**未被证实，也未被证伪**） | 本轮**未回访**那 28 个官方 URL（保持 UNVERIFIED） | VERIFY | 交线上复核任务：抽样回访 4 条出处，按「页面轮换/登录墙」如实定案 |
| 39 | `F-r2-api-007` | P2 | 成立（[R2✓]；子声明 [RX-U] UNVERIFIED） | STILL_PRESENT | 源码级：`UNIT_PER=1e8`；`validate` 实测「名义 Token 单价: 可计算 0 条 · 不可计算 23 条」 | DESIGN | R-P3-3（同 #37，两处口径交叉说明；若未来做并列比较则升 P0） |
| 40 | `V3-MODEL-024` | 🐛 DEFECTIVE（全轮唯一） | 成立（[R3✓] CONFIRMED） | STILL_PRESENT | 同 #2（12 组 / 9 页 / 12 行；`qwen3-max` 页面只剩「长上下文 ¥4/¥16」） | REPAIR NOW | R-P1-9 |

> **覆盖审计 P0/P1 全量**：P0 = 1 条（#1）；P1 = 12 条待修条目、13 个唯一 ID（#2–#13 + #5 的三个同根因 ID），逐条在上表。

---

## 2. 逐条明细（命令 / exit code / file:line）

> 所有命令的 cwd 均为冻结副本 `.qc-t02/sandbox/`（= `git archive HEAD` 展开 + `node_modules` junction）；
> 「工作树」= 冻结内容。完整日志在 `.qc-t02/logs/*.log`，机器可读结果在 `.qc-t02/mutation-results{,3}.json`、`.qc-t02/pristine-checks.txt`。

### 2.1 P0

**#1 `F-v3-registry-002`（P0-1）— 同一价格记录可同时属于两个 registry 身份**

- `[源码级]` `scripts/lib/model-registry.js:523-526`：冲突键
  `const triple = \`${link.apiPlanId}\u0000${link.modelKey}\u0000${link.variant === null ? '(all)' : link.variant}\``
  → `variant:null` 与 `variant:'standard'` 是**两个不同的键**，可合法并存；第 519 行 `link.variant !== null && !variants.has(link.variant)` 证明 `null` 是通配。
- `[数据级]` 冻结数据当前 **0 冲突**：55 条 API 映射的 `(apiPlanId, modelKey)` 两两互异（去重后仍 55）。
- **未复现项**：审计的 11 道门禁全绿 + 产物页多出 `data-model-key="qwen3-max"` 的端到端变异（写生产文件）本轮**未跑**；由 T05/T06（R-P0-1 的验收命令）负责，其退出标准见 `REPAIR_PLAN.md` §R-P0-1。

### 2.2 P1（12 条待修条目 / 13 个 ID）

**#2 `F-v3-registry-001` ≡ `V3-MODEL-024` — 模型页多变体吞行**

- `[数据级/页面级]` 冻结副本构建（`node scripts/tools/build-local.js --out=dist.pristine` → **exit 0**）后逐组对账：
  `多变体 (planId, modelKey) 组 = 12 · 涉及模型页 = 9 · 页面少渲染计价行 = 12`（与审计的 12/9/12 逐个相同）。
- 逐条（数据变体数 → 页面 `<tr class="mapirow" data-plan/data-model-key>` 行数）：`zhipu/glm-4.5v 2→1`、`zhipu/glm-4.6v 2→1`、`zhipu/glm-4.6v-flashx 2→1`、`zhipu/glm-5v-turbo 2→1`、`openai/gpt-6-astra 2→1`（×2 计划）、`openai/gpt-6-luna 2→1`（×2）、`openai/gpt-6.1-sol 2→1`（×2）、`minimax/minimax-m3 2→1`、`aliyun/qwen3-max 2→1`。
- `[页面级]` `qwen3-max` 页只剩一行：`data-model-key="qwen3-max" … <td>标准</td> <td>长上下文</td> <td class="num">¥4</td> <td class="num">¥16</td>`（标准档 ¥2.5/¥10 消失）。
- `[源码级]` 根因仍在：`scripts/lib/models-page.js:162-168` 与 `scripts/lib/model-registry.js:221-227` 的 `apiTargetOf()` 用 `.find()` 只取第一条；55 条 API 映射 `variant` 全为 `null`。

**#3 `F-gate-001` — 门禁步骤体未冻结**

- `[命令级]` 在副本里把 `.github/actions/gate/action.yml` 的 `run: node scripts/tools/seo-verify.js` 改成 `run: echo skipped`（步骤名不变）→ `node scripts/tools/check-ci-consistency.js` → **exit 0**，输出 `✅ CI 口径检查 36 项，失败 0 项`。
- `[源码级]` `check-ci-consistency.js:606-623` 的 (10) 只比对 `e.key === 'name'` 的步骤名序列；全文不比对 `run` 体文本或哈希。

**#4 `F-gate-002` — `allow_degraded_run` 取值无断言**

- `[命令级]` `verify.yml` 写死 `allow_degraded_run: 'true'`、`deploy.yml` 的 `'false'` 改成 `'true'` → `check-ci-consistency.js` → **exit 0**，`36 项，失败 0 项`。
- `[源码级]` `check-ci-consistency.js` 全文不含 `allow_degraded_run`；`verify.yml:110`、`deploy.yml:89` 是唯一决定降级行为的地方。

**#5 `F-mutation-001` ≡ `F-v3-residual-003` ≡ `F-r1-history-ai-005` — AI 候选 accept 红线无守卫**

- `[命令级]` 造一条 `task=extract_offer / review.decision=pending` 的候选（`deal=2eae0e246de2`，百度千帆）：
  - 变异前 `node scripts/tools/ai-apply.js --all-accepted --dry-run --file=.ai-cache/mut-candidates.json` → **exit 1**「没有"已接受"的候选匹配 (all)」；
  - 把 `ai-apply.js:253` 的 accept 过滤改成恒真后，同一命令 → **exit 0**，输出 `· dry-run：会写入 audience-overrides.json`；
  - 同时 `ai-selftest` **exit 0**（37 项 · 失败 0）、`validate --strict` **exit 0**、`check-ci-consistency` **exit 0**（36 项）。
- ⇒ 与审计 M17 的结论、报文、退出码逐项相同。

**#6 `F-r1-history-ai-001` — `/changes/` 非空即构建红**

- `[源码级]`（**仅源码级**，见 §3 边界）：`scripts/tools/build-local.js:1146 numberOfItems: highValueTotal` 对 `:1147 itemListElement: linkable.slice(0, 50).map(...)`；`scripts/lib/page-kinds.js:108-111` 对 `changes` 声明 `itemList: { expect: true, checkRows: true, checkMembers: true }`。
- `[数据级]` 生产 `deal-history.events=0`，本轮冻结构建的 `/changes/` 为空态、构建 exit 0 ⇒ 缺陷**当前不可见**（潜在）。
- **未复现**：合成非空历史夹具的端到端构建。**审计已声明的边界保持不变**（§3）。

**#7 `F-r1-history-ai-002` — archive 详情页相对链接少一层前缀**

- `[源码级]` `archive.js:67-69 archiveEntryRoute()` 产出 `archive/<kind>/<id>/`（深度 3）；`build-local.js:3537` 传 `prefix: '../../'`（全文 `prefix: '../../'` 出现 10 次）；`archive.js:616` 默认值也是 `'../../'`。
- `[数据级/内存渲染]` 用冻结构建里的真实模块渲染一条合成 entry：相对引用按 `../../` 从 `archive/deal/<id>/` 解析 → `archive/`、`archive/archive/`（少了到站根的那一层；应为 `../../../`）。
- 生产 `dist.pristine` 的 archive 详情页数量 = **0**（`sitemap: … 0 个档案详情页`）⇒ 与审计一致：**当前未暴露，一旦出现第一条 `ended`/`restored` 即带死链**。

**#8 `F-r1-identity-001` — 第三方目录站内容被写成「官方页面明写」**

- `[数据级/页面级]` 目录站口径（`sourceUrl` 命中 layer3labs/futuretools/aitools）= **12 条**；其详情页出现「官方页面明写」= **6 页 / 18 处**，且这 6 页**同时**写着「第三方目录站收录」（同表自相矛盾实证）。
- 例：`c05dc74bfd78`、`4a875a435019`、`9c553dd82d2d`、`3c8a9a6a9ee9`、`6013b80f266f`、`c971e33a9cd0`（`source=Layer3Labs`）。
- `[源码级]` `scripts/lib/audience-overrides.js:189-194` 恒写 `basis:'source'`；`index.html` 的 `SOURCE_BASIS.source = '官方页面明写'` 只认 `basis`；`scripts/lib/provenance.js:60-75` 已有 `directory` 档但未联动。
- **口径差异（如实保留）**：审计原文有 14 条/29 处（按 `sourceType`）与 12 条/43 处（按 `sourceUrl`，verify-x 独立计数）两个数；本轮按 `sourceUrl` 得 12 条、页面字符串命中 18 处（**第三种口径**：只数页面出现次数）。方向与结论一致，数字口径不同，下游引用时须写明口径。

**#9 `F-r2-api-001` ≡ `P2.5-API-TOOTH-002` — 来源层 input/output 互换零判据**

- `[命令级]` 来源层 `scripts/data/curated_api_plans.json` 的 zhipu `glm-5.3` `input/output` 由 8/28 改成 28/8 → `rebuild-api-plans.js` **exit 0**（写 1 条新事件）· `check-api-plans-reproducible.js` **exit 0** · `validate.js --strict` **exit 0** · `api-plans-selftest.js` **exit 0**（95 项）· `check-api-plan-history.js` **exit 0**；发布数据确实变成 `input=28 output=8`。

**#10 `F-r2-api-002` ≡ `P2.5-API-TOOTH-003` — 单位枚举翻转零判据**

- `[命令级]` 来源层 13 处 `pricing.unit: per_1M_tokens → per_1K_tokens`（数字不动）→ rebuild **0** · reproducible **0**（输出 `单位分布：per_1K_tokens 13`）· validate **0** · api-plans-selftest **0** · check-api-plan-history **0**；发布数据单位分布变成 `{"per_1K_tokens":13}`。

**#11 `F-r2-api-003` — 第 7 列单位错位无对账**

- `[命令级]` 渲染层 `api-plans-page.js:222` 的单位标签改成 `API_UNIT_LABEL.per_1M_tokens` → `api-plans-selftest` **exit 0** · `validate --strict` **exit 0** · `check-api-plans-reproducible` **exit 0**。
- `[页面级]` 同一变异下直接调用渲染函数：第 7 列 = `["其他 $1 / 每 100 万 tokens"]`（正确值 = 基线对照 `["其他 $1 / 每百万 token·小时"]`），而 `assertPageHonesty(...)` 的 **问题数 = 0**。
- `[源码级]` `api-plans-page.js:731-738` 逐格对账只覆盖第 0/1/2/3/4/5/6/9 列，第 7/8 列完全没有；`verify-site.js` 浏览器侧只对账输入/输出/缓存命中三个数字列。

**#12 `F-r2-api-004` — 第 8 列 tokens 可标成 credits**

- `[命令级]` `freeTierShortText`（`api-plans-page.js:201`）的 tokens 单元词改成 `'credits'` → selftest **0** · validate **0** · reproducible **0**。
- `[页面级]` 变异后第 8 列 = `"免费额度 1,000,000 credits / one_time"`（数据里是 `tokens`），`assertPageHonesty` **问题数 = 0**。
- `[源码级]` 渲染层 credits 正则（`:748-751`）只匹配「credits … 可购/约 X token」**单向**句式，反向不命中。

**#13 `F-r2-api-005` — freeTier 收进了限时/新用户赠送**

- `[数据级]` 生产 4 条非空 `freeTier`：`aliyun`(tokens, `one_time`，描述含「90 天内」) · `google`(models) · `tencent`(tokens, `one_time`，描述含「首次开通…1 年」) · `zhipu`(models)。
- `[源码级]` 页面口径第 5 条仍是「「免费额度」只记**官方长期提供**的免费能力」；`api-plan-schema.js:133-142` 的 `freeTier` 只有 `type` 枚举，没有承载「长期 vs 限时/新用户」的字段。

### 2.3 P2 / P3 目标条目

**#14 `F-r1-history-ai-004` — `--out` 无路径白名单**

- `[命令级]` `node scripts/ai/maintenance.js --task=translate --limit=1 --provider=off --out=.qc-probe/ai-envelope.json` → **exit 0**，任意路径文件生成成功，顶层键 `schemaVersion,task,label,promptVersion,provider,model,generatedAt,generatedForDate,counts,invalid,skipped,candidates`（＝ **candidate envelope**，不是生产数据形态）。
- `[源码级]` `scripts/ai/candidates.js:281-283`（`mkdirSync` + `writeFileSync`，无白名单）；`scripts/ai/maintenance.js:245`。
- **证据边界**：审计的原始复现是把 `--out` 指向 `deals.json` 并**覆盖生产真值文件**（随后逐字节恢复）；本轮**故意改用 scratch 路径**，只证明「无白名单」这一点，**不声称**复现了覆盖生产文件的那一步。

**#15/#21/#22 `F-r1-identity-002` / `V1.0-HEALTH-003` / `V1.0-HEALTH-009`**

- `[数据级]` 用 HEAD 的 `health.js` + `collect.js:257` 的接线公式枚举 8 组合 → `reason=headless_unavailable` 出现 **0 次**：
  `headless=true rowError=true browserOk=false → headlessReady=false · status=failed · reason=collector_error`（这正是无法区分「内核没装」与「页面规则失效」的原因）；
  其余组合为 `collector_error` 或 `healthy`。
- `[源码级]` `collect.js:257 headlessReady: isHeadless ? (row.error ? browserStatus.ok === true : true) : true`（`headlessReady===false ⇒ row.error` ⇒ `ok=false`），而 `health.js:114` 的「① 采集器抛异常」分支排在 `:134` 的 headless 分支之前。
- `[数据级·反证]` 绕过接线直接调 `evaluate({ok:true, headlessReady:false, kind:'headless'})` → `reason=headless_unavailable` ⇒ 分支本身存在，是**接线**让它不可达。

**#16 `F-r1-identity-003` — 声明为推断的字段写成「官方页面明写」**

- `[数据级]` `provenance.fields` 里 `inferred`（`basis` 或 `derived`）= **28 处**，其中 `basis='source' + derived='inferred'` = **24 处**（与审计的 28/24 相同）；含推断且页面出现「官方页面明写」的详情页 = **15 个**。
- `[源码级]` `index.html:3427` 只看 `item.basis`；`audience-overrides.js:190-191` 恒写 `basis:'source'`。

**#17 `F-r1-identity-004` — 同记录两个冲突来源 URL**

- `[数据级]` 顶层 `sourceUrl ≠ provenance.sourceUrl` = **6 条**，且是**完全相同的 6 个 id**：`f578493037d4 / df8ec56faa17 / 514a84a1064a / c25b0ed788e3 / 4bda0ebbb091 / b75b42583ad8`（多为顶层指向 `layer3labs.io`、provenance 指向厂商官方页）。

**#18/#19/#20 `F-r1-ui-001` / `V1.6-FEED-006` / `V1.6-FEED-007`**

- `[数据级]` `/feeds/` 页共 38 条 feed 链接；`dist.pristine/feed/` 26 个文件；**未列出 10 个** `category-{api,chat,audio,image,agent}.{xml,json}`。
- `[数据级]` `dist.pristine/feed/api.xml` **不存在**、`dist.pristine/feed/coding.xml` **不存在**；`scripts/lib/feeds.js` 注册表里没有 `api` / `coding` 两条 spec，只有 `free-api` / `ai-coding`（`feeds.js:270-286`）。

**#23 `F-mutation-003` — 删一条必需映射抓不到**

- `[命令级]` 删来源层 `links[0]`（`claude-fable-5.1 → 4f8bae91f9f8/claude-fable-5.1`）→ `check-model-registry-links.js` **exit 0**（打印 `候选…：API 1 条`）；`models-selftest.js` **exit 1**（3 项失败：`每个 registry 模型都至少被一条显式映射引用 —— claude-fable-5.1`、`没有任何 API modelKey 未映射 —— anthropic/claude-fable-5.1`、`officialUrl … —— claude-fable-5.1`）；`validate --strict` **exit 0**。

**#24 `F-mutation-004` ≡ `F-v3-export-002` — 自测硬编码 dist / 缺产物=绿 / seo-verify 不看 Manifest**

- `[命令级]` 副本里没有 `dist/`：`data-docs-selftest.js` → **exit 0**「⑨ … 尚未接线 —— 本节按『如实跳过』处理」「38 项通过，0 项失败」；加 `--dir=dist.does-not-exist` 后输出与不带参数**逐字相同**（参数被忽略）。
- `[源码级]` `data-docs-selftest.js:350 path.join(ROOT, 'dist')`（硬编码）· `:353-354`（缺失即 `check(..., true)` 计通过）· 全文不含 `--dir`；`seo-verify.js` 全文 0 处引用 `data/index.json`。

**#25 `F-mutation-006` ≡ `F-r2-plans-002` — 三态降级无守卫**

- `[命令级·schema 级]` 取真实 plan（anthropic）的内存副本，把 `{"kind":"fair_use","value":true,"note":"官方写「Usage limits apply.」"}` 改成 `{"kind":"fair_use","value":false,"note":null}` → `validatePlan` **errors = 0**。
- `[命令级·来源层级]` 在 `scripts/data/curated_plans.json` 做同样降级 → `rebuild-plans.js` exit 0 · `check-plans-reproducible.js` **exit 0** · `validate --strict` **exit 0** · `audience-selftest` **exit 0**（161 项）· `provenance-selftest` **exit 0**（91 项）。
- `[源码级]` `plan-schema.js:520-543` 只查字面量/类型；「到底是什么」只由来源层引文决定，无脚本比对来源层记录与自身引文。

**#26 `F-v3-export-001` — Manifest 方向 2 无扫描**

- `[数据级]` 冻结构建产物根 11 个 JSON，Manifest 登记 9 份；未登记 = `feed.json`（属 Feed 注册表）与 **`source-health.json`**（`检查.md` §10.9 要求的「公开稳定 dataset → 应登记」缺口）。
- `[源码级]` `build-local.js:4435-4437 publishedDataFiles` 是**硬编码 9 文件**清单，只做「Manifest → 文件必须存在」方向 1；`seo-verify.js` 0 处引用 Manifest。

**#27 `F-v3-pages-001` — 共享 dist 无并发保护 / 缺产物不红**

- `[命令级]` 同一 commit、同一份代码，只改「产物在不在」：
  | 自测 | 无 `dist/` | 有 `dist/` | 两者 exit |
  |---|---|---|---|
  | `planshub-selftest.js` | 27 项 | 32 项 | 0 / 0 |
  | `archive-selftest.js` | 60 项 | 61 项 | 0 / 0 |
  | `data-docs-selftest.js` | 38 项 | 40 项 | 0 / 0 |
  | `vendor-page-selftest.js` | 50 项 | 50 项 | 0 / 0 |
- `[源码级]` 三个自测都有「产物不存在 ⇒ 跳过并计 ✓」分支；`planshub-selftest.js` 的原文即「构建产物不存在时**跳过** dist 现场检查（先跑 npm run build）」。

**#28 `F-v3-registry-003` — API 侧没有「已判断不映射」的 B 档**

- `[命令级]` 删来源层 API 映射 `(ebc4af9a71b6, glm-5.3)` → `check-model-registry-links.js` **exit 0**，且打印 `未映射的 API modelKey：1 条`；`validate --strict` **exit 0**；`models-selftest.js` **exit 1**（`没有任何 API modelKey 未映射（覆盖报告里的 0 是结论，不是没算） —— aliyun/glm-5.3`）。
- `[命令级·对照]` 删一条 Coding 映射 → `check-model-registry-links.js` **exit 1**（`套餐 f04787381e3b（trae）的模型串「DeepSeek-Flash」既没有 registry 映射…也没有声明理由`）、`validate --strict` **exit 1**。
- `[源码级]` `model-registry.js:714-724` 的覆盖门禁只遍历 `unmappedPlanModels`；`check-model-registry-links.js:20-21` 明写「未映射的 API modelKey … 是事实陈述」。
- ⇒ **审计这条的复现数字（0 / 0 / 1 与「1 条」）本轮逐个复现**。

**#29 `F-v3-registry-004` — 手写来源层重复顶层键无守卫**

- `[命令级]` 在 `scripts/data/models.json` 里把 `"glm-5.3": {...}` 整块复制一份（命中 2 处，`JSON.parse` 合法、解析结果不变）→ `check-model-registry-links.js` **exit 0** · `validate --strict` **exit 0** · `check-models-reproducible.js` **exit 0** · `models-selftest.js` **exit 0**（62 项）。
- `[源码级]` `model-registry.js:154-161 load()` 走 `JSON.parse`；`validateRegistry()` 只看解析后的键集合，结构上不可能发现重复键。

**#30–#32 `V1.0-PROC-004/007/008`（≡ `F-r1-residual-001`）**

- `[数据级]` 在产品仓库（320 个文件，**排除 `research/` 证据与本轮产物**）里：
  - 含「与代码冲突」= 仅 `docs/v3.0/TASK-SPEC-v3.0.md`（＝复核更正所说的「1 处」）；
  - 含「回滚方案」= **0 文件**、含「Phase A」= **0 文件**、含「Phase C」= 4 文件（`docs/AI-MAINTENANCE-v2.0.md`、`PROJECT_STATUS.md`、`scripts/ai/diagnose.js`、`scripts/lib/dom-digest.js`，＝复核更正所说的「4 处」）；
  - `research/v1.0-public-readiness-report.md` 存在，但**逐字**不含「当前实际状态 / 已解决的问题 / 仍存在的问题」三个小节名（含「技术债」「回滚」字样）。
- ⇒ 三项缺失（Phase A/B/C 划分、风险栏、回滚方案）与「冲突登记表」缺失**结论不变**。

**#33–#35 `V2.0-METRIC-004/011/012`（≡ `F-r1-residual-002/003`）**

- `[数据级]` 含「最近 7 天确认」= **0 文件**、含「变化事件准确率」= **0 文件**（scripts 全树 + `index.html` + 文档）。
- `[数据级]` `verifiedAt` 出现在 38 个文件里，但均为 provenance / schema 校验 / 历史层用途，**没有一处做 7 天窗口比率**。
- `[页面级]` 冻结构建的 `/status/` 页面里，「有效优惠 / 最近 7 天确认 / 官方来源 / 明确领取条件 / 中国可用性 / 有效期已确认」**一项都没有**（只承载来源健康与具名异常源）。

**#36 `F-integration-002` / #37 `F-integration-005`**

- `[源码级]` `collect.yml`：`git add deals.json scripts/data/source-health.json scripts/data/zh-pending.json scripts/data/deal-history.json scripts/data/source-snapshots.json` —— **5 个文件**，不含 `plans.json` / `api-plans.json` / `models.json`。
- `[数据级]` `updatedAt`：`deals.json = 2026-10-03T11:56:44+08:00`（每日刷新）vs `plans.json = api-plans.json = 2026-10-01T00:00:00+08:00`（人工重建后冻结）。
- `[源码级]` `plan-schema.js:145 UNIT_PER = 1e8`（每 1 亿 tokens）vs `api-plan-schema.js:75 API_UNITS = ['per_1M_tokens','per_1K_tokens','per_1M_characters']`；`validate` 实测输出 `名义 Token 单价: 可计算 0 条 · 不可计算 23 条`。

**#38 `F-online-008` — 4 条 Deal 的官方出处读不到所述活动**

- 本轮**未回访**那 28 个官方 URL。**审计声明的 `UNVERIFIED` 边界原样保留**（§3），不因本轮存在性检查而改变；建议由线上复核任务用同一抽样口径（20 条里 4 条：2 条智谱活动、1 条海螺会员价、1 条火山免费额度）逐条回访后定案。

**#39 `F-r2-api-007` / #40 `V3-MODEL-024`**：见 #36/#37 与 #2。

---

## 3. 审计已声明的证据边界（**逐字保留，不得弱化或升级**）

1. **`F-r1-history-ai-001`**：审计复核标记为 `[RX-U]` ——「`verification-x.md` 仅**源码级**独立确认（`build-local.js:1146/1147`、`page-kinds.js:108-111`），**端到端夹具未复跑**。引用时不得写成端到端已被第二人复现。」
   → 本轮同样**只做源码级**（§2.2 #6），没有改变该边界。
2. **`F-online-008`**：审计标记 `[R1✓]` = **`UNVERIFIABLE`（未逐条回访 28 个官方 URL）** 且 `[RX-U]` 未逐条回访 ⇒ **`UNVERIFIED`，不得当作已证实结论**。
   → 本轮未回访，边界原样。
3. **`F-r1-history-ai-004`**：审计标记 `[RX-U]` ——「`verification-x.md` 未把该条列入 P0/P1 二次证伪表，**不得当成已验证 P0**」。
   → 本轮独立复现了「无白名单」这一核心机制（scratch 路径），但**未**复现「覆盖生产文件」那一步，边界原样。
4. **`F-r2-api-007`** 的子声明（Coding/API 单价标签漂移）为 `[RX-U]` UNVERIFIED；本轮只复现了「两套单位口径并存、无交叉门禁」这一部分（源码级 + `validate` 输出），标签漂移变异未复跑。

---

## 4. 与审计数字的差异清单（本轮实测口径）

| 项 | 审计 | 本轮实测 | 说明 |
|---|---|---|---|
| `F-v3-registry-001` 吞行 | 12 组 / 12 行 / 9 页 | **12 组 / 12 行 / 9 页** | 完全一致 |
| `F-v3-pages-001` 四项自测计数 | 无 dist 27/60/38/50；有 dist 32/61/40/50 | **同** | 完全一致 |
| `F-mutation-004` `--dir` 参数 | 被忽略、输出逐字相同 | **同**（38 项，exit 0） | 完全一致 |
| `F-v3-registry-003` | check 0 +「未映射 1 条」/ validate 0 / selftest 1；Coding 对照 1/1 | **同** | 完全一致（**必须改来源层**，见 §0.3） |
| `F-mutation-001` M17 | 变异前 1 / 变异后 0，三门禁绿 | **同** | 完全一致 |
| `F-r2-api-001/002` | 五道门禁全 0 且发布数据改变 | **同** | 完全一致 |
| `F-r2-api-003/004` | 三道离线门禁全 0、`assertPageHonesty` 0 问题 | **同**（并给出真实单元格文本） | 完全一致 |
| `F-r1-identity-003` inferred | 28 处 / 24 处渲染为「官方页面明写」 | **28 / 24**（页面 15 个） | 计数一致 |
| `F-r1-identity-001` 计数 | 14 条/29 处（sourceType）· 12 条/43 处（sourceUrl, verify-x） | **12 条**（sourceUrl）· 6 页/18 处（页面字符串） | **口径不同**，方向一致；引用须写明口径 |
| `V1.0-PROC-004` 计数 | 复核更正「实为 1 处」 | 1 文件（`docs/v3.0/TASK-SPEC-v3.0.md`） | 一致 |
| `V1.0-PROC-008` 计数 | 复核更正「实为 4 处（v2.0 Phase C）」 | `回滚方案`/`Phase A` 各 0 文件；`Phase C` **4 文件** | 一致的实为「Phase C 4 处」；关键词口径已写明 |
| `F-v3-export-001` 未登记项 | `source-health.json` | `source-health.json`（+ `feed.json`，属 Feed 注册表） | 一致 |

**没有发现「审计说要红的东西现在绿了」或「审计说已修的东西仍是坏的」** —— 46 个目标 ID 全部 `STILL_PRESENT`，且关键机制、计数、退出码逐项复现。

---

## 5. 下游使用提示

1. **行号基准**：本文所有 `file:line` 对应 `21cf66d5`。工作区正在被 T05+ 修改（实测 22 个 tracked 文件 `M`），引用前 `git show HEAD:<file>` 复核。
2. **变异必须动来源层**：registry 侧改 `scripts/data/model-registry-links.json` / `scripts/data/models.json`；API 计费侧改 `scripts/data/curated_api_plans.json`；套餐侧改 `scripts/data/curated_plans.json`。改仓根派生产物 = 改错地方（§0.3）。
3. **验证脚本可复用**（都在 `.qc-t02/`，被 `.qc-*/` 忽略，不入库）：
   - `run-cases.mjs` + `cases.json`：基线电池（15 条命令，全部 exit 0，含 36/95/37/62/38/27/60/50 等项数）；
   - `mutations2.mjs` / `mutations3.mjs`：14 个变异场景（每个场景前用 `sandbox.tar` 重展，结果见 `mutation-results*.json`）；
   - `checks-pristine.mjs`：只读核对（源码级 + 数据级 + 页面级），输出 `pristine-checks.txt`；
   - `sandbox/`：`git archive HEAD` 展开的冻结副本（含 `dist.pristine/`）。
4. **分类与修复计划的映射**见 §1 的「处理决定」列；与 `REPAIR_PLAN.md` 的 R-* 条目一一对应。

---

## 6. 复现命令清单（本轮实际执行）

```bash
# 0) 冻结副本（cwd = .qc-t02/）
cd .qc-t02 && tar -x -f sandbox.tar -C sandbox          # 497/503 文件（6 个非 ASCII mockups 名跳过）

# 1) 基线电池（全部 exit 0）
node scripts/tools/check-ci-consistency.js              # 36 项 · 失败 0
node scripts/validate.js --strict                       # ✅
node scripts/tools/check-model-registry-links.js        # ✅
node scripts/tools/models-selftest.js                   # 62 项
node scripts/tools/api-plans-selftest.js                # 95 项
node scripts/tools/ai-selftest.js                       # 37 项
node scripts/tools/data-docs-selftest.js                # 38 项（无 dist，如实跳过）
node scripts/tools/planshub-selftest.js                 # 27 项（无 dist）
node scripts/tools/archive-selftest.js                  # 60 项（无 dist）
node scripts/tools/vendor-page-selftest.js              # 50 项

# 2) 冻结构建（页面级证据）
node scripts/tools/build-local.js --out=dist.pristine    # exit 0 · ✅ 产物自检通过

# 3) 变异复跑（脚本见 .qc-t02/mutations2.mjs、mutations3.mjs）
node .qc-t02/mutations2.mjs                              # 11 个场景
node .qc-t02/mutations3.mjs                              # 补跑：干净删映射 + 第7/8列渲染级 + 三态 schema 级

# 4) 只读核对（源码级 / 数据级 / 页面级）
node .qc-t02/checks-pristine.mjs .qc-t02/sandbox         # 输出 pristine-checks.txt
```

---

## 7. 结论

- **46/46 目标 ID 在最新 master（`21cf66d5`）上 `STILL_PRESENT`**：P0×1、P1×13（12 条待修条目）、P2/P3 与矩阵行 ID 共 32 条，全部给出本轮自测证据（命令 + exit code，或数据/页面计数，或 `file:line`）。
- **审计的 P0/P1 全量覆盖**：13 个 P0/P1 ID 逐条复现（其中 12 条为命令级端到端复现，`F-r1-history-ai-001` 按审计边界保持源码级）。
- **没有新增 P0/P1**，也没有发现「审计误判」（唯一的口径差异集中在 `F-r1-identity-001` 的计数方式与 `V1.0-PROC-008` 的关键词口径，已在 §4 写明）。
- **分类建议**：REPAIR NOW 15 条（P0 1 条 + P1 12 条 + `F-r1-identity-002/003` 与 2 条指标）、GUARDRAIL 10 条、DOC 8 条、DESIGN 3 条、VERIFY 1 条（`F-online-008`）、NOT REQUIRED 1 条（`V2.0-METRIC-011`）。
- 两条**需要 captain 拍板**的口径：① `V2.0-METRIC-004/012`（实现 7 天确认率 / 补 `/status/` 指标）是否落在「不新增功能」的边界内；② `V1.6-FEED-006/007` 是「补 `/feed/api.xml`、`/feed/coding.xml` 两条路由」还是「只做文档对照」。
