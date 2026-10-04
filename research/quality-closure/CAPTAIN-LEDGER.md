# CAPTAIN-LEDGER — 队长证据台账（quality-closure-post-audit）

本文件由 **captain 独占写入**，用途：把每个成员交付的**可复核证据**（命令、退出码、哈希、判据变更）
逐条固化，避免证据只存在于对话上下文里。最终报告（T24）与再审计（T23）引用本台账。

纪律：本台账只记「已经发生过的事实」，不记预期、不记推测。成员的**自述**与 captain 的**独立抽查**
分开标注（`[成员自述]` / `[captain 抽查]`）。

工作树：`D:\OneDrive\Desktop\Code\AI Page\.worktrees\quality-closure-post-audit`（分支 `quality-closure-post-audit`）

---

## T01 基线冻结（evidence-analyst）— completed

- `[成员自述]` HEAD = `origin/master` = `21cf66d530de1124478824386ff95582c73afece`（`ls-remote` 复核一致）；`npm ci` exit 0，`package-lock.json` 未改。
- `[成员自述]` 交付 `research/quality-closure/BASELINE.md`，69771 B，sha256 `948489d87b7bee135e4c59c03a3964549e8fb57c5a3cf59eece15a9980be12ba`。
- `[成员自述]` `research/audit/**` 56 文件复制为只读快照，逐文件 SHA-256 `COPY_IDENTICAL`；`.gitignore` 新增 `dist.qc-*/`、`.qc-*/`；主工作区 tracked 零改动。
- `[成员自述]` 独立重算：99 条 = P0×1 + P1×12 + P2×32 + P3×54，唯一 finding ID 去重 = 104；四态 906 = 804+85+11+6。
- `[成员自述]` `origin/master` 相对审计 commit 差异 = 6 文件（`deals.json`、`index.html`、`scripts/tools/verify-site.js`、`scripts/data/source-health.json`、`scripts/data/source-snapshots.json`、`scripts/data/zh-pending.json`）。
- `[成员自述]` 两处下游漂移：① `deals.json` 唯一差异 = `lastSeen`(127 条 10-02→10-03) + 顶层 `updatedAt`（采集刷新，非内容改写）；② `verify-site.js` 新增 21 行导致引用其行号的 finding 需整体后移重核。
- `[成员自述]` 口径澄清：api-plans 55 组 `(apiPlanId, modelKey)`（其中 12 组双 variant、43 组单 variant）；links 64 = 55 API + 9 Coding，API 侧 55/55 `variant:null`。多变体影响面 = **12 组**。
- `[成员自述]` 历史层 events：deal 0 / plan 14 / api-plan 6；基数 deals 134 / plans 23 / models 44。

## 期间事故与纪律（captain 处置）

- **共享树竞态事故**（21:49 前后）：registry-engineer 的 T05 变异窗口内，另一并发进程跑了 rebuild，把临时变异状态**固化进派生根文件** `model-registry-links.json`（links[1] `note:"T05 变异 T1…"`）⇒ 共享树 `validate --strict` 对所有成员变红。
  - `[captain 实测]` 定位：`git diff -- model-registry-links.json` 显示该 note；源层 `scripts/data/model-registry-links.json` 当时干净（64 条）。
  - **归因更正（captain 事后校正，以此为准）**：`validate --strict` 变红的**直接原因**是当时**来源层**正处于变异窗口（T02 独立复核亦证实：registry 门禁读来源层 `scripts/data/**`，改仓根不触发）；派生根的 note 则是**并发 rebuild 在 T1 窗口内固化**下来的**残留**。即：两件事同时发生、原因不同——共享树既被"在飞变异"拖红，又被"并发 rebuild"污染了派生文件。结论不变（变异必须沙箱化），但归因要分开记，避免误以为"只污染了派生文件"。
  - 处置：要求立即 `rebuild-models.js` 恢复 + 恢复回执；把「变异只在 `.qc-*/sandbox/` 内做、共享树任一时刻等于正确状态、恢复禁用 `git checkout --`」固化为全员纪律（已传达 4 名写入者）。
  - `[captain 抽查]` 恢复后：`validate.js --strict` exit 0；`git diff -- model-registry-links.json models.json` 为空。
- **契约两次更正（captain，记录在任务 revisions ledger）**：
  - t10 / t18：「受影响模型页 = 11」更正为实测口径 **12 组 / 9 个 registry slug**（gpt-6-astra、gpt-6-luna、gpt-6.1-sol 各出现在两个 apiPlanId）。
  - t7：授权 `index.html` 进 inScope（仅限 RENDER-CORE 内 `SOURCE_WORDING.SOURCE_BASIS` 与 `sourceBlockHtml` 两处）；否决「改数据侧 basis 迁就渲染器」。

## T05 Registry 身份唯一性（P0）+ §10.6（registry-engineer）— completed

- `[成员自述]` 判据从三元组字面量换成「link 展开后的真实 identity 集合」：新增 `sourcePricingIdentitiesOf(link, apiPlans)`（`variant:null/undefined` ⇒ 该 `modelKey` 在该记录中的全部真实 variant；匹配不到 ⇒ `unresolved` 红）与 `sourcePricingIdentityKey()`（`planId\0modelKey\0真实variant`），无 `null/standard` 特判、无默认值折叠；`apiTargetOf()` 改走同一支解析。
- `[成员自述]` `coverageOf()` 的 `mappedApi` 改为按展开条目记账：**67 条计价条目 = 已认领 67 + 未认领 0**。
- `[成员自述]` §10.6 两侧同级：`validateLinks()` 末尾新增 API 侧完整性（删一条必需映射 M09 现在由 `check-model-registry-links.js` 自己 exit≠0）；新增 `duplicateTopLevelKeys()` 原文扫描抓重复顶层 slug 键；无相似度自动 merge。
- `[成员自述]` 共享树门禁：`validate --strict` / `check-model-registry-links` / `models-selftest`(88 项 0 失败) / `check-models-reproducible` / `coverage-report` / `build-local --out=dist.qc-registry` **全 exit 0**；`/models/glm-5.3/` 页无 `qwen3-max` 价目行。
- `[成员自述]` 五条 tooth 均有常驻牙（1 通配↔显式两方向；2 同 identity 两 owner；3 同 slug 多 Provider 绿；4 不相交变体分属两 slug 绿 / 相交红 / 冗余红；5 production duplicate=0 multi=0）。
- `[成员自述]` 变异（沙箱 `.qc-registry/sandbox{,2}/`）：`append-standard` 使源层 `3594e4da…7b40 → f921a551…70a2`，rebuild（拒绝写盘）+ check + validate + selftest + build **全 exit 1**；备份复制恢复后六道全 exit 0。另有 M09 / 通配撞显式 / 重复 slug 三种同样红→绿。
- `[成员自述]` 生产数据零改动：5 个数据文件 before/after 逐字节 SAME。
- `[captain 抽查]` 在 worktree 独立跑：`check-model-registry-links.js` exit 0（67 = 已认领 67 + 未认领 0）；`models-selftest.js` exit 0（88 项 0 失败）；`check-models-reproducible.js` exit 0（44 模型 / 64 映射，逐字节一致）。
- `[captain 抽查]` 代码形状核对：`model-registry.js:183` `sourcePricingIdentityKey`、`:210` `sourcePricingIdentitiesOf` 存在；`:380-383` `apiTargetOf` 复用同一支展开判据（符合计划 D1，非 null/standard 补丁）。
- `[交接]` 文档漂移 `docs/SCHEMA-v3.0.md` §2（写着「API 侧映射不上是允许的」，与收紧后判据相反；`basis` 示例取值与真实枚举不符）已登记进 T21 契约，并注明「修正方向是把文档改成与代码一致，不得反向削弱代码」。

## T11 Source Health 真实接线（isolation-engineer）— completed

- `[成员自述]` 根因两处闭环：`health.js:evaluate()` 的「采集器抛异常」分支排在无头判定之前；`collect.js` 的 `headlessReady = row.error ? browserStatus.ok === true : true` 使 `headlessReady=false` 的前提自相矛盾（判定只在生产里，断言在别处复制）。
- `[成员自述]` 修法（**不新增状态/reason 枚举**）：无头判定提前；两子情形分开记账；`headlessReady` 改三态（未探测 ⇒ `null`）；新增生产与自测**共用**的 `headlessReady()` / `attemptsFromReport()`；`collect.js` catch 保留原始 `error.code`；无头来源只认本轮真跑过的 collector。
- `[成员自述]` 注入点 `scripts/lib/browser.js` 的 `DSH_BROWSER_EXECUTABLE`：注入**启动参数**而非状态，失败来自 playwright 真实启动失败（9 ms），不设置时行为一字不变（A/B 探针：未注入 msedge/ok=true，注入后 ok=false）。
- `[成员自述]` 三处一致（沙箱同一次运行，证据包 `.qc-iso/evidence-sim/`）：Collect Summary `失败（headless_unavailable）` ／ `source-health.json` `status=failed, reason=headless_unavailable, headlessReady=false, consecutiveFailures=2, lastSuccessAt 未前进` ／ `/status/` `❌ 失败 + 无头浏览器不可用（页面没能渲染）+ 2 / 0`。
- `[成员自述]` 生产态未伪造：`scripts/data/source-health.json` 与 `scripts/collectors/headless.js` 未改、与 HEAD 逐字节一致；沙箱外 `/status/` 与源 `source-health.json` 逐源一致（两个无头来源 ✅ 正常 / `headlessReady=true`）。
- `[成员自述]` 变异：M1a（health.js 判定强制 true）exit 1、M1b（**调用点**写死 true）exit 1、逐字节还原后 exit 0；`health-selftest` 41 → **72 项**。
- `[captain 抽查]` `health-selftest.js` exit 0（72 项 0 失败）；`git diff --stat -- scripts/data/source-health.json scripts/collectors/headless.js` **为空**（生产数据未动）；改动面仅 `health.js` / `browser.js` / `collect.js` / `health-selftest.js`（322 insertions / 41 deletions），与声明一致。
- `[归因记录]` 该任务中途 `validate --strict` 变红系 T05 在飞改动所致（成员以沙箱回退队友 8 文件到 HEAD 自证），T05 提交后重跑为绿；不影响本任务结论。

---

## T02 目标 finding 存在性检查（evidence-analyst）— completed

- `[成员自述]` 交付 `research/quality-closure/FINDING_STATUS_BEFORE.md`，40723 B，sha256 `5ac7e1de478071908bcc44a3ed3a9daad8e6585d723434c169ff81cbfb50a931`；覆盖全部 **46 个目标 ID**（P0×1 + P1 的 12 条/13 ID + P2/P3 与矩阵行 32 条），每条含 §5 要求的 7 个字段 + 明细证据。
- `[成员自述]` **46/46 全部 `STILL_PRESENT`**：没有"审计说红、现在绿"的条目，也没有审计误判；差异仅两处计数口径（`F-r1-identity-001` 计数方式、`V1.0-PROC-008` 关键词口径），已登记。
- `[成员自述]` 分类（截至 T02，明细以 T03 终表为准）：REPAIR NOW 15 · GUARDRAIL 10 · DOC 8 · DESIGN 3 · VERIFY 1（`F-online-008`）· NOT REQUIRED 1（`V2.0-METRIC-011`）。**待 T03 对齐**：上述分项合计 38 ≠ 46 个目标 ID，需在 99 条终表里说明差额来源（同根因合并 / 别名 ID / 矩阵行 vs finding ID），不得含糊带过。
- `[成员自述]` 方法学（正确，值得固化）：执行期间共享 worktree 已被 T05+ 并发改写（实测 22 个 tracked `M` + 新增 e2e 脚本），故全部判定锚在**冻结内容**——`git archive HEAD` → `.qc-t02/sandbox`（= 21cf66d5）+ 其内 `dist.pristine`（build-local exit 0）；变异在副本内跑、每场景前重展。自证：副本 `health.js` 255 行且无 `attemptsFromReport`，工作区已是 306 行含该函数 ⇒ 判定确实跑在 HEAD。行号基准 = HEAD。
- `[成员自述]` **关键踩坑（已写进 T19/T20 契约）**：registry 门禁读**来源层** `scripts/data/model-registry-links.json`，**不是**仓根派生产物。第一版改仓根 ⇒ 四道门禁全绿（**假阴性**）；改来源层后与审计逐个数字复现（`check` exit 0「未映射 1 条」/ `validate` exit 0 / `models-selftest` exit 1；Coding 对照 1/1）。任何 registry 侧变异都必须改 `scripts/data/**`。
- `[成员自述]` 命令级复现（择要，exit code 如实）：
  - `F-gate-001/002`：步骤体换 `echo` / `allow_degraded_run` 写死 → `check-ci` **36/36 exit 0**。
  - `F-mutation-001`（≡`F-v3-residual-003`≡`F-r1-history-ai-005`）：pending 候选变异前 exit 1 → 改 `ai-apply.js:253` 恒真后 **exit 0**「会写入 audience-overrides.json」，`ai-selftest` 0 / `validate` 0 / `check-ci` 0。
  - `F-r2-api-001/002`（≡`P2.5-API-TOOTH-002/003`）：来源层 input/output 互换、13 处 unit 翻转 → **五道门禁全 0**，发布数据分别变 28/8、`per_1K_tokens 13`。
  - `F-r2-api-003/004`：渲染层变异 → 三门禁全 0；实测第 7 列印成「其他 $1 / 每 100 万 tokens」、第 8 列印成「1,000,000 credits」，`assertPageHonesty` 问题数 **0**。
  - `F-v3-registry-001`/`V3-MODEL-024`：冻结构建逐组对账 **12 组 / 9 页 / 少渲染 12 行**（`qwen3-max` 只剩长上下文 ¥4/¥16）。
  - `F-v3-pages-001`：同 commit 无 dist 27/60/38/50、有 dist 32/61/40/50，**全部 exit 0**。
  - `F-v3-registry-003`：删 API 映射 → `check` 0「未映射 1 条」/`selftest` 1；删 Coding 映射 → `check` 1 / `validate` 1。
  - `F-r1-identity-001/003/004`：6 页同屏并存「官方页面明写」+「第三方目录站收录」；inferred 28 处（24 处 `basis=source`）；冲突来源 URL 6 条且 id 完全一致。
- `[成员自述]` 证据边界**逐字保留**：`F-r1-history-ai-001` 仍仅源码级、`F-online-008` 仍 UNVERIFIED、`F-r1-history-ai-004` 仍未进 P0/P1 二次证伪表、`F-r2-api-007` 标签漂移子声明仍 UNVERIFIED。
- `[captain 裁定]` 两处口径（均按题面明文，已回给 analyst 并落进 T03）：
  - **① V2.0-METRIC-004/011/012 不实现** —— Prompt §13.4 逐字点名「不要为了 … 开发最近 7 天确认率、变化事件准确率、大型运营 Dashboard。它们属于长期方向」⇒ 分类 `NOT_REQUIRED`，不得为它们改 `/status/` 或加指标出口（审计 R-P2-3 的相反建议以 Prompt 为准，§30 第四条）。
  - **② V1.6-FEED-006/007 不新建路由** —— Prompt §13.1 逐字点名「不要为了 … 新建 `/feed/api.xml`、`/feed/coding.xml`。原 Prompt 里这些只是推荐路径」⇒ 分类 `NOT_REQUIRED`，只做「推荐路径 → 实际路径（`free-api`/`ai-coding`）」文档对照。
- `[复用资产]` `.qc-t02/`（gitignore，不入库）：`run-cases.mjs` + `cases.json`（15 条基线电池）、`mutations2.mjs`、`mutations3.mjs`、`checks-pristine.mjs`、`sandbox/`（冻结副本 + `dist.pristine`）、`mutation-results*.json`、`pristine-checks.txt`、`logs/*.log`。T19/T20 可作对照起点。

---

## T06 多变体行完整 + 独立 join 对账（registry-engineer）— completed

- `[成员自述]` 根因：`models-page.js` 旧 `apiTargetOf` 按「首匹配」取行 ⇒ 一条 `variant:null` 映射只渲染记录里第一条（更贵的 `long_context`），`standard` 价在页面上不存在（GLM-4.5V 只剩 ¥4/¥12）。修法：新增 `apiTargetsOf()` 展开式 join（通配 ⇒ 该 `modelKey` 在该记录里的全部真实 variant）；一条真实计价条目 = 一行；行身份 `data-item = planId|modelKey|variant` + 新增 `data-variant`；`assertPageHonesty` 改为按期望行集合逐身份对账（冒充 variant / 凭空行 / 重复身份 / 少行 / 旧结构漂移全红）。`vendor-page.js` 的 per-model `apiItemCount` 同步改为展开口径。
- `[成员自述]` §17 独立 join 工具 `scripts/tools/registry-join-audit.js`：不 require `models-page` / `model-registry`，自读 `api-plans.json` + `scripts/data/model-registry-links.json` 原文展开期望，再从 dist 产物回读 `mapirow` 对账。全量 44 模型 / 44 页、期望 67 行、多变体 12 组 / 9 slug、**missing 0 extra 0 duplicate 0 multi-owner 0**。
- `[成员自述]` **反向证明（非恒绿）**：对修复前产物跑同一脚本 ⇒ **missing 67 / extra 44**。
- `[成员自述]` verify 全绿：`registry-join-audit` 0 · `models-page-selftest` 61 项 0 失败 · `vendor-page-selftest` 52 项 0 失败 · `models-selftest` 88 项 0 失败 · `validate --strict` 0 · `build-local --out=dist.qc-registry` 0 · 46 条产物断言（44 页逐页逐身份）。
- `[成员自述]` 生产数据零改动：links 源层 `3594e4da…7b40`、根文件 `fd2336c8…`、`models.json` `8fa85b1d…`、`api-plans.json` `962fc9c4…` 均与开工一致。
- `[captain 抽查]` 独立运行 `registry-join-audit.js`：44 / 44 页 · 期望 67 行（api-plans 真实计价条目 67）· 多变体 12 组 / 9 slug（24 行）· missing 0 / extra 0 / duplicate 0 / multi-owner 0 · **exit 0**。
- `[captain 更正 · 已入账]` 口径二次更正：多变体展开是**按「记录 × 变体」**，不是「每页 2 行」。页面行数 = `glm-4.5v` 2 / `glm-4.6v` 2 / `glm-4.6v-flashx` 2 / `glm-5v-turbo` 2 / `qwen3-max` 2 / `gpt-6-astra` 4 / `gpt-6-luna` 4 / `gpt-6.1-sol` 4 / `minimax-m3` 3（合计 25 行）——gpt-6 三兄弟各跨两条 `apiPlanId` × 两个变体；`minimax-m3` 是「一条双变体映射 + 一条单变体映射」。t18（T18 独立复核）验收已按此改写。
- `[captain 派单]` T06 发现的 out-of-scope 地雷：`scripts/tools/verify-site.js:5087-5095` 仍按**旧口径 link 条数**判「计价表逐行可回读」，而页面已是展开条目数（全量 9/44 页不一致），只因抽样 `slugs.slice(0,3)`（`claude-*`，恰好非多变体）而侥幸通过 ⇒ 已作为第 6 条验收追加进 t6（T07，revision 3）：改正口径**并**把抽样扩到含多变体模型，要求给出前后退出码与对账数字。

---

## T03 99 条六类分诊（evidence-analyst）— completed（draft，终版在 T21）

- `[成员自述]` 交付 `research/quality-closure/RECLASSIFIED_FINDINGS.md`（draft），42591 B，sha256 `c7c41e5e2fa9d2d71a128c98d7c19f0cac51a47a37bf9578d6d05126c6a6d920`。
- `[成员自述]` **六类计数 = 99**：REPAIR NOW **10** · GUARDRAIL **17** · VERIFY **16** · DESIGN **10** · DOC **17** · NOT REQUIRED **29**（其中终版 NOT_REQUIRED 12 + DEFERRED 17）。
- `[成员自述]` **审计 P1 分裂**：5 条 REPAIR NOW（P0-1、P1-4、P1-5、P1-12、P1-6/P2-16/P3-11/P1-11 所在阶段）+ 7 条 GUARDRAIL（P1-7/8/9/10、P1-1、P1-3 及同组项）。明确口径：**GUARDRAIL 是本轮必做，不是降级**；分类依据不再是旧 P0–P3。
- `[成员自述]` 已按我给的路径**读原文而非转述**：§2 L106–175、§6–§9 L363–530、§10 L530–686、§11 L686–698、§12 L700–731、§13 L733–779、§24 L940–959、§26 L985–990、§27 L993–1016、§30 L1169–1209；文件只读、未复制进仓库。
- `[成员自述]` §13 落实为 10 行表（涉及 finding / 分类 / 本轮不做的事），并显式记录 **§13 推翻了审计 REPAIR_PLAN 的多处建议**（R-P2-3 ①②⑤ 指标/collect/历史文档、R-P2-4 ④、R-P3-1/2 统一口径类），依据 §30 第四条；§26 逐项对到 NOT REQUIRED，并界定「修复 bug 必需的内部结构」例外仅适用于守卫/断言/绑定/fail-closed/注册表收敛。
- `[成员自述]` 37 条 draft 待终版收敛（T21 逐条核）：(a) 依赖 §11/§12 夹具或线上验证 8 条；(b) 审计 UNVERIFIED/[RX-U] 需第二人或线上复核 5 条；(c) 依赖 §13/§26 边界或判断 11 条；(d) §10 未选中 → DEFERRED 13 条（**已因 captain 裁定改为 12 条，见下**）。
- `[captain 裁定]` **P2-20 / `F-r2-api-006` 并入 T13，终版类改为 GUARDRAIL**（原 draft 归 DEFERRED）。依据：审计 REPAIR_PLAN 的 R-P1-7 本就把 `F-r2-api-006` 与 P1-7/P1-8/P1-9/P1-10 归为同一条修复项；且「全仓没有单位换算路径」是 §10.2 单位红线赖以成立的结构前提（无换算 ⇒ 混淆只能靠证据绑定抓住）。t14 已加第 10 条验收（扩检测面或改结构性断言，二选一，必须附「在非显眼文件引入换算 → 必红」的变异证明）。相应 DEFERRED 由 13 → 12 条，总数仍需 99。
- `[captain 提醒]` (b) 组 5 条（审计 UNVERIFIED/[RX-U]）在终版**不得升级为已验证**：无第二人复核或线上证据时保留 UNVERIFIED 并写成明确证据边界。

---

## T15 AI candidate → production 隔离（isolation-engineer）— completed

- `[成员自述]` 6 个 inScope 文件（`scripts/ai/cache.js`、`candidates.js`、`maintenance.js`、`tools/ai-accept.js`、`ai-apply.js`、`ai-selftest.js`；707 insertions / 15 deletions）。
- `[成员自述]` **落点白名单唯一实现** `cache.assertAiOutputPath`：硬拒 12 份生产真值 + `scripts/data/**`、`.git/**`、`research/audit/**`；只允许 `.ai-cache/**` 与 `research/**`；`resolve` + `realpath` 双归一。**内建进** `writeCandidates/subdir/write/appendInvalid/resetTask` ⇒ 绕过 CLI 也写不出去。
- `[成员自述]` **红线判定只此一处** `candidates.acceptedOf`（人工决定 + status 一致 + schema/enum/evidence 三关）；`ai-apply` 的行内 filter 彻底移除；人点了 accept 但门没过 ⇒ 点名拒绝；`cause:'generation'` 时拒绝任何带 `review.decision` 的候选 ⇒ **隐式 accept 结构上写不出去**。
- `[成员自述]` `ai-accept` 在记录 accept 前用生成时同一套规则重算 schema/domain/既有 invariants；`--file` 只接受候选文件（白名单 + 信封形状）。等价 Gate：`candidates.productionTruthEnvelopes()` 直接扫生产真值里的候选信封。
- `[成员自述]` `ai-selftest` 37 → **63 项**；端到端真跑 CLI（离线 mock provider 真实生成）。
- `[成员自述]` 验证：`ai-selftest` 0（63/0）· `validate --strict` 0 · `build --out=dist.qc-iso` 0；变异 A → exit 1 且 `deals.json` sha256 `3BA148DBC640E1B2` 不变；变异 B（信封进 deals.json 副本）→ validate exit 1（42 项，前四条即信封形状）→ 恢复 0；变异 D/E 绿（沙箱里显式 accept 后真落地：audience-overrides → rebuild → validate → exit 0）。守卫变异：**M-1（= 审计 M17，判定恒真）→ exit 1 · 6 项红**；M-2（落点守卫空操作）→ 沙箱 deals.json 真被覆盖 + exit 1；M-3（生成侧隐式 accept）→ exit 1；三处还原后均 0。
- `[成员自述]` 归因记录：22:19–22:20 间 `validate --strict` 与 `ai-selftest` 牙 5c 曾因队友在飞的 `scripts/lib/api-plan-schema.js` 新增 `freeTier.stability`（数据侧当时 0 处）而红；时间线证据（队友文件 22:18:18 修改 > 本任务 22:17:56 全绿日志；本任务 6 文件最后修改均早于 22:17；`validate.js` 不 require AI 层）；数据补完后复跑全绿，**未为压红改动任何 AI 文件**。
- `[成员自述]` 文档漂移（不在其 inScope）：`docs/AI-MAINTENANCE-v2.0.md:173` 说「AI_CACHE_DIR 可改位置（测试用）」——现已会被拒；且 `ai-review.js`（只读入口）有意保留非严格 `readCandidates`（属设计）。⇒ 已登记进 T21 契约。
- `[captain 结论]` 审计唯一未捕获变异 **M17 已被捕获**（6 项红）——P1-1 / P2-14 的守卫缺口关闭。
- `[captain 注记]` 数据层影响：T10 交付期间 `api-plans.json` 新增 `freeTier.stability`（6 行）——计入本轮真实数据变更清单，由 T18/T22 做 diff 审计。

## T19 P0 实现评审（verifier）— completed，verdict = **pass**

- `[成员自述]` 交付 `research/quality-closure/review-registry/T19-P0-REVIEW.md`（28208 B · sha256 `1190c8e46ac56d0b628243f16a9e04da624f9a73a1cd8229dee1e6c14908901c`）与 `T19-evidence-summary.md`（5616 B · sha256 `ee8887df4839b1bd20532b92bd2b0d53fca5a885763f698084b00cdcd14a34bf`）。
- `[成员自述]` 独立沙箱在**仓库外** `D:\qc-t19\`，共享 worktree 全程只读、未用 `git checkout/restore`、未写 `scripts/**`。
- `[成员自述]` **原始 P0 形态复现**：来源层按生产规范序合法追加一条 `variant:null` 通配映射（同一条计价记录指向第二个 slug）⇒ **17 道门禁里 8 道非 0**（validate:strict / check-models-reproducible / check-model-registry-links / models-selftest / models-page-selftest / registry-join-audit / build-local / feeds 连带），且 `rebuild-models` **exit 1 拒绝写盘** ⇒ 「11 道生产门禁全放行」的路径不存在。同类：append-explicit 3/3 红、adjacent-explicit（自造）红、remove-mapping(M09) 红。
- `[成员自述]` 自造小夹具重建 §8 牙 **15/15** 符合语义（不看作者期望字符串）：通配展开=记录内全部真实变体、显式唯一、不相交允许、同 slug 冗余红、API/Coding 两侧完整性同级、重复顶层键原文扫描。
- `[成员自述]` 独立遍历（不 require 被测实现）：67 条计价条目 = 认领 67 + 未认领 0；55 条通配（12 组多变体 / 43 单变体 / 0 空展开）；9 Coding；多 owner 0 —— 与实现读数逐项相等。
- `[成员自述]` 生产数据零改写（5 份哈希与 T05 所报一致、3 份命中 T01 BASELINE）；绿对照 17/17。
- `[成员自述]` 唯一 finding **F-T19-1（LOW）**：`scripts/validate.js:966` 漏传 `duplicateKeys` ⇒ 重复顶层 slug 键在 `validate --strict` **假绿**（实测 exit 0 且打印「✅ 校验通过」），而同形态 links-check / models-selftest 红、rebuild 拒绝写盘；`check-models-reproducible.js:51` 同批漏传。
- `[captain 裁定]` **P0 判为关闭（pass 成立）**，F-T19-1 单独处置：**并入 T13（t14）验收第 12 条**并要求最小改动（两处补传参 + models-selftest 常驻牙 + 四道门禁变异证明），t14 的 inScope 同步加入 `check-models-reproducible.js` 与 `models-selftest.js`。**未另建 T25 repair 任务**：任务图校验因 `scripts/validate.js` 与 t14 的 inScope 重叠而拒绝新建（t14 是 pending 且非其依赖），而排到 T13 之后会使 T18/T20 在依赖锥外无法验证它。t18 的描述已同步改为指向 T13，并要求 verifier 顺带扫「同一门禁不同入口结论相反」的其它实例。
- `[captain 抽查]` 台账口径：F-T19-1 属**守卫一致性**缺口，不是 P0 未关闭；两者不得混为一谈（报告与再审计都要分开陈述）。

---

## T04 §12 Deal 来源复核 + §16 API 抽样（evidence-analyst）— completed

- `[成员自述]` 交付 `research/quality-closure/source-revalidation.md`，27699 B，sha256 `882fe7b4c6564da2e2f2682751598b77bbc4886c91bec30520d4ee75a035a16d`；**生产数据未改**（`git status` 仅 `?? research/quality-closure/`）。
- `[成员自述]` §12 四条 Deal：**0 条 CONFIRMED_ENDED、0 处生命周期改动**。
  - `1688614d6669` 智谱邀请好友 → `TEMPORARILY_UNAVAILABLE`（`bigmodel.cn/pricing` 是 JS 壳）
  - `97d21ff73d3e` 智谱新用户 2000 万 → `UNVERIFIABLE`（SPA 壳；「2000万」在任何可读官方页均未出现）
  - `1c057c22422c` 海螺会员限时价 → `TEMPORARILY_UNAVAILABLE`（仅站点壳；国际站需登录）
  - `d6aaee8c7379` 火山 50 张 → `TEMPORARILY_UNAVAILABLE`（product/ark、ai.volcengine.com、docs.volcengine.com 三处正文全空）
- `[成员自述]` 唯一新增官方证据（**仅候选，未定案**）：`docs.bigmodel.cn/cn/coding-plan/credit-campaign-rules` 逐字写「现行邀请权益 = 赠金（受邀首单 5% 立减、仅限 GLM Coding 订阅；邀请人得首单实付 10% 赠金、满 3 人起发）」，并声明「拼好模」活动已于 2026-07-09 正式下线（页面生效日期 2026-03-15）——与记录「2 亿 Tokens 资源包」口径不同 ⇒ 未据此改任何数据，交 provenance 补官方证据。
- `[成员自述]` §16 **13/13 记录、10 个 provider 全覆盖**：逐项一致（deepseek off_peak 与 standard、minimax 含 M3 两档、tencent 6 行 + freeTier 100 万/1 年、siliconflow 5/6 行）；部分确认（aliyun standard 用官方英文对照页核到 qwen3-max 两档 ¥2.5/¥10、¥4/¥16 与免费额度「100 万 / 开通起 90 天」，CNY 精确值未逐字看到）；**SOURCE_MOVED**：anthropic `officialUrl` 已迁移（docs.anthropic.com → platform.claude.com → www.anthropic.com 营销首页，无价格表）；**读不到并如实记原因**：google（fetch failed ×2）、openai ×2（Cloudflare 403）、volcengine、zhipu、aliyun off_peak。
- `[成员自述]` `credits` 全 13 条为 null（无可核对项）；本轮官方侧**首次证实**两处 variant 语义（minimax `long_context` ↔ 官方「>512k 输入 tokens」档；aliyun `qwen3-max` 两变体 ↔ 0–32K / 32K–128K 两档）。
- `[成员自述]` P3-29 / `F-online-008` **未升级**，交付物明确写「仍 UNVERIFIED、T21 不得升级」。
- `[captain 裁定]` 两条候选级观察的处置：
  - **anthropic officialUrl 迁移 → 事实级缺陷，并入 T13（t14）第 13 条验收**：只许改 URL 与 `officialDomains` 登记（走来源层 → rebuild），**不许改价格、不许改既有 evidence 引文及其 capturedAt/sourceUrl**（历史捕获记录，改了即伪造）；若新址无法确认为官方定价页，则不改数据、只写处置理由；两种情况都要附官方重定向证据。
  - **tencent 混元迁移公告 → 来源迁移风险，不是事实错误**（价格逐项一致）；已写进 T21：进 `NEXT-STEPS.md` 长期方向/剩余风险，**不得写成「已失效」**。
- `[captain 提醒 · 已发]` §16 里如实记的"读不到"（google fetch failed、openai 403、volcengine/zhipu/aliyun off_peak 读不到正文）是**证据边界**，终版与再审计都不得改写成"已核对一致"或"未发现问题"。
- `[成员自述]` T03 的 P2-20 裁定已以 append-only 证据备注记在 t3：终版改 GUARDRAIL、动作指向 T13；GUARDRAIL 17→18、DEFERRED 13→12，合计仍 99。

---

## T10 freeTier 与 Deal 边界（provenance-pricing-engineer）— completed

- `[成员自述]` 根因：`freeTier` 只有 `type` 枚举，没有任何字段承载「长期 vs 限时/新用户赠送」⇒ 人工来源层只能照抄官方表格里的「免费额度」行，页面一刀切宣告「这一列只有长期能力」；生产 4 条里 2 条正是赠送类，同屏自相矛盾而五道门禁全绿。
- `[成员自述]` 修法（数据分类 + 判据 + 文案，未搬动任何 Deal）：新增 **必填** `freeTier.stability ∈ {standing, new_user, promotional}`（缺省即错误，因为缺省会被读成「长期能力」）；判据三层——schema（`standing×one_time` 自相矛盾、赠送必须 `one_time` + 写明条件的 description、`type=none` 不得标性质）、页面 `assertPageHonesty`（第 8 列单元格性质与数据**逐格对账**、两个方向都红）、selftest（4 条常驻牙 + 生产逐条对账 + credits 正例 3 条）。
- `[成员自述]` before/after（dist 实测 + 旧渲染器回放）：口径句「只记官方长期提供的免费能力」**1 → 0**；三档词表 0/3 → 3/3；赠送类单元格 **14 个全部**标「非长期能力」、被印成长期的 **0**；`stability` 覆盖 **4/4**；数据 13 条 / 10 provider / 67 计价条目 / 45 modelKey / credits 0 条（仍正确）。
- `[成员自述]` 只改来源层 → rebuild（4 处差异全是 freeTier 字段；`api-plans.json` 由工具再生、非手改；`api-plan-history.json` 0 事件未改）。门禁全绿：validate --strict 0 · api-plans-selftest 123/0 · check-api-plans-reproducible 0 · check-api-plan-history 0 · build-local 0 · seo-verify 11/0 · provenance-selftest 114/0 · audience-selftest 191/0 · plans-selftest 234/0 · deal-plan-links-selftest 80/0。沙箱变异：赠送标成 standing → rebuild exit 1；手改派生数据 → validate exit 1；渲染层印成长期 → selftest exit 1；三次还原后 exit 0 且 sha256 逐字节一致。
- `[成员自述]` 官方证据：aliyun 用官方「新人免费额度」规则页（本轮实取正文 HTTP 200：「首次开通…自动发放新人专属免费额度」「有效期为 90 天」）；tencent 用记录内官方引文；zhipu/google 各自定价页引文。
- `[成员自述]` t7 补充项（captain 授权，走 evidence_note，原判不变）：`SOURCE_LABELS.origin`「原始出处」→「**收录渠道**」+ 空态同词；source block 内「原始出处」**217 → 0**、「收录渠道」**0 → 217**；audience-selftest 187 → 191 项 0 失败；顺带核查 `url` 字段标签结论：directory 60 条里 `url` 落在目录站的 **0** 条、P1-6 那 14 条 **14/14** 在登记官方域 ⇒「官方页面」标签**没有**误称官方（唯一例外 `gptimage-2-5.com` 属已裁决情形）。
- `[captain 裁定]` 四条：① **stability 不进 history 跟踪：批准**（分类而非厂商变化，绑定会造 4 条假事件；不得改 `api-plan-history.js`）；② anthropic officialUrl → 按 T13 第 13 条处置（新址无法确认为定价页则不改数据、只写处置理由，附重定向证据），**不另开任务**；③ **历史层/信息流「原始出处」措辞：DEFERRED**——captain 查证该标签在生产**今日不可达**（deal-history 事件 0、生产档案详情页 0），故只登记为文档/剩余风险待办（T21），不动 `history.js`/`feeds.js`/`archive.js`；④ **新派 T13 第 14 条**：修 `/changes/` API 价格变化块把生命周期事件渲染成「新增：—」（见下 T07）。

## T07 `/changes/` 非空路径 + §15 合成非空 E2E（hist-archive-engineer）— completed

- `[成员自述]` 改 7 个文件：`changes.js`（新增 `itemListRecords` / `renderOrderOf` / `ITEM_STRENGTH`——ItemList 与页面行标记的**唯一**判据）、`page-kinds.js`（`changes.checkMembers:false` + 判据来源注释）、`build-local.js`（ItemList 与行标记同源、自检三份集合逐条对账、档案详情页前缀**按路由深度派生**＋两处写死镜像期望同步、`/changes/` 套餐变化块补 `plansById` 修回币种 ¥）、`seo-verify.js`（新增三条产物内自洽断言 + 修掉 `itemListOf` 先 `strip()` 导致**恒返回 null** 的老坑）、`verify-site.js`（四处空数据假设条件化 + 计价表按 links 展开计数 + 抽样强制覆盖多变体）、`changes-selftest.js`（+12 项）、`history-nonempty-e2e.js`（新，~830 行）。
- `[成员自述]` **修复前**（HEAD 代码 + 合成非空历史）：`build-local` exit 1，产物自检 14 项红（itemlist-arity 2 / itemlist-members 5 / internal-link-exists 96 / 套餐变化缺一句），另 91 处未逐条打印。
- `[成员自述]` **修复后 合成非空态**：8/8 命令 exit 0（validate / --strict / 三份日志门禁 / build-local / seo-verify（11 项·27 码）/ 真浏览器 verify-site（**704 项**）），37 项自写产物断言 0 失败；`/changes/` ItemList 3 项按 id 去重、声明数 == 元素数 == `data-item` 行数 == 3；墓碑行有行无链接且不入 ItemList；档案 4 个详情页共 **108 条相对引用 0 缺失**；三条变化流 RSS + JSON 非空且两侧条目数一致。
- `[成员自述]` **生产态**（deal 0 / plan 14 / api 6）：同一份代码 **8/8 exit 0**，29 项断言 0 失败；主树 `build-local --out=dist.qc-hist` 与 `seo-verify --dir=dist.qc-hist` 均 exit 0。
- `[成员自述]` 变异证明（全部实跑 exit≠0，且**各由不同的新断言**抓到）：删 ItemList 成员 → ③；`numberOfItems+1` → ③ + 规则层 arity；成员指向不存在详情页 → **只有②**（规则层 27 码全过）；复制成员 + 复制对应行 → **只有①**。verify-site：合成态 5 红、生产态 1 红 + 2 红，全部落在被条件化的四处 + 计价表行数；计价表多变体页 `glm-4.5v`/`glm-4.6v`/`glm-4.6v-flashx` 各 2 行 == 展开期望 2 条（旧口径期望 1 行必红）。
- `[成员自述]` 生产三份 history sha256 与 `BASELINE.md` 逐字一致；合成数据只落 `.worktrees/qc-e2e`（现留合成非空态供 T08 复跑）。
- `[captain 派单]` 其报出的 out-of-scope 观测 **`/changes/` API 价格变化块把 `created` 渲染成「新增：—」（生产态 6 处、合成态 9 处，判据在 `api-plans-page.js` 的 `apiPlanChangeTextOf`）** ⇒ 已作为 T13 第 14 条验收派给 provenance-pricing-engineer（同一渲染层、同文件在 T13 inScope 内）。
- `[captain 注记]` T08 分工已按 captain 指令收窄：T07 只做最小修复（build-local 深度派生 + 两处镜像期望 + plansById），`archive.js` 默认前缀、`archive-selftest` 常驻断言、两份真相收口留给 T08（t11 已解锁）。

## 平台限流记录（不影响进度）

- `[captain 记录]` 22:2x gate-engineer 一轮执行被 **429 concurrency_limited（6 路在途上限）** 打断；22:4x evidence-analyst 一轮被 **429 tpm_limited（每分钟 token 额度）** 打断。两次均**无 open attempt、无工作丢失**（成员当时的任务要么依赖阻塞、要么已交付）。
- `[captain 对策]` 收紧消息量：只回答被直接问到的问题、只在契约里落裁定，不再为"告知"唤醒空闲成员（analyst 在 T21 之前不再主动唤醒）。

## T08 Archive 详情页相对路径收口（hist-archive-engineer）— completed

- `[成员自述]` **before/after**：修复前每页 27 条相对引用里 **24 条死链**（favicon / feed / 面包屑 / 全站导航全中；T07 复现时另有 96 条 `internal-link-exists` 归此）；修复后**合成态** 4 个详情页 **108/108 条可解析**（逐页扫描含 `url()` 与索引页共 **143 条 0 缺失**）、**生产态**索引页 31 条 0 缺失、canonical 自指 **4/4**、索引与 sitemap 入链 **4/4**、真浏览器 `verify-site` exit 0。
- `[成员自述]` 只收口不重做：`archive.js` 新增**唯一**深度派生实现 `routePrefixOf(route)` + `archiveEntryPrefix(entry)`，`renderArchiveEntry` 的 `ctx.prefix` 改**必填**（缺失/形状非法直接抛错）、删除会猜错层级的 `'../../'` 默认值；`build-local.js` 三处（详情页渲染、页脚扫描表、订阅发现表）全部改问 archive 库要前缀 ⇒ 构建期不再有第二份深度算式；`archive-selftest.js` 新增 ⑦′ 节 **8 项**常驻断言（路由深度⇒前缀、索引页前缀、16 条相对引用逐条带深度前缀且解析落点在声明表/路由模式/静态文件内、缺前缀抛错、形状非法抛错、两条对照牙）⇒ archive-selftest **68/68**。
- `[成员自述]` 变异证明（沙箱副本）：把 `routePrefixOf` 退回 `'../../'` → archive-selftest **exit 1、3 红**（非深度派生 / 索引前缀错 / 解析到 `archive/archive/`）。T07 里那两处最小修复**未重做**。
- `[成员自述]` 合成态 8/8 退出码 0（含真浏览器 verify-site）、37 断言 0 失败；生产态（`--state=pristine` 同 workspace）8/8、29 断言 0 失败；seo-verify 生产态 exit 0（27 码全过、internal-link-exists 0）。
- `[成员自述 · 已披露的越界]` 为让 T07 的夹具在 T08 代码下仍可跑，在 `scripts/tools/history-nonempty-e2e.js`（**T07 其本人创建**的文件）加了 **2 行**同步白名单（archive.js / archive-selftest.js）；不加则夹具 sync 模式会把 `archive.js` restore 回 HEAD ⇒「新 build-local 调旧库」两种状态都崩。
- `[captain 裁定]` **批准保留该 2 行（不要求回退）**。理由：① 该文件本就出自同一成员在 t6 内创建，无第三方写入者；② 回退会让 `qc-e2e` 的 sync 模式对 T08+ 代码不可用，而 **T18/T20 要用这个夹具**验证非空路径与变异（完成判据 C/Q 依赖它）；③ 成员已如实登记，性质是**范围簿记**而非隐藏写入。因 t11 已终态、契约不可再 amend，故以本台账为批准的凭据记录。captain 未就此唤醒该成员（其默认动作即"保留"，无需其执行任何事；避免在 TPM 限流期间制造无谓在途请求）。
- `[成员自述 · 归因]` 主树直接 `build-local` 当前被 validate 拦下 **5 项**（全部是 api-plans / curated_api_plans 的 `freeTier.stability`、`pricing.unit` 见证、evidence 归一顺序）——归因于 **T13/T14 在飞的单位/引文守卫 + 数据尚未同步**，档案零命中；其生产态证据改取「冻结提交 + 本任务文件（+T06 的 models-page/model-registry）」的 workspace（8/8 exit 0），并声明这是该轮唯一可信的生产态口径。
- `[captain 注记]` 上述 5 项红灯属**守卫先落地、数据后同步**的预期中间态（T13 的验收本身要求完成时全绿 + `check-api-plans-reproducible` 逐字节一致）。captain 不打断 T13，但若 T13 交付时共享树仍红，将按"守卫不得静默放行、也不得长期留红"处置。
- `[captain 注记]` 至此 `build-local.js` 的 Phase-1/2 令牌持有者（T07、T08）全部完成 ⇒ 令牌按声明链 **t13（T12 feeds）→ t15（T16 Manifest）→ t17（T17 Gate）** 传递；captain 已在 22:5x 明确授权 isolation-engineer 持有 t13 的 `/feeds/` 渲染区段。

## T03/T04/T09/T10 的补充证据（append-only，成员自行追加，captain 已阅）

- `[evidence-analyst]` T04 追加：aliyun freeTier 的**性质**证据已独立复核（官方专页 `help.aliyun.com/zh/model-studio/new-free-quota` 本轮 HTTP 200，逐字含「首次开通…自动发放各模型的新人专属免费额度」「有效期为 90 天」「同一实名认证主体下重新注册账号，无法再次领取」）⇒ 原 §16 表的 `PARTIALLY_CONFIRMED`（定价表中文页仍是 JS 壳）不变，但 freeTier 判定有专属官方页支撑；并更正一处**读数来源**：`.qc-t04/inputs.md` 的 13 条记录读自工作区（含 T10 在途改动），已复算 HEAD↔工作区差异——**计价数值 0 处差异、unit 0 处差异**，唯一差异是 `freeTier.stability` 字段 ⇒ §16 价格类结论对 HEAD 同样成立。
- `[evidence-analyst]` 重申证据边界：§16 里「读不到」（google fetch failed ×2、openai Cloudflare 403、volcengine/zhipu/aliyun 中文定价页 JS 壳、aliyun off_peak 无可读页）**T21 与 T23 必须保留原文**，不得改写成「已核对一致/未发现问题」。
- `[evidence-analyst]` anthropic 守卫口径更正：`docs.anthropic.com` 与 `platform.claude.com`（→ claude.com）**都在官方域登记内**，域白名单会放行 ⇒ URL 迁移是**内容/新鲜度层**问题，**不得记成"守卫该抓没抓"**。
- `[provenance-pricing-engineer]` T09 追加：`SOURCE_LABELS.origin` 两副本逐字同值改词 + 空态同词（同一行不许两个名字）；回放计数 **217 → 0 / 0 → 217**（134 标签行 + 83 空态）；audience-selftest 加牙⑥（把前端改回旧词立刻红）；url 标签核查 **0 条误称**（全库 134 条中 `url` 落目录站/聚合站 0 条；P1-6 那 14 条 14/14 在登记官方域；唯一例外 `gptimage-2-5.com` 属 `_aliases_v3_rulings` ④ 已裁决情形）。
- `[provenance-pricing-engineer]` T10 追加：T04 的 4 条候选**均未达改 production 门槛**（2 条 Deals 侧、1 条来源新鲜度、1 条无证据）；本轮交互**未产生任何生产数据改动**。

---

## T13 API 证据绑定守卫（provenance-pricing-engineer）— completed

- `[成员自述]` **14 条验收全过**（含 captain 追加的第 13、14 条）。修掉 P1-7（来源层 input/output 互换零判据）、P1-8（单位枚举翻转零判据）、P1-9（第 7 列单位错位）、P1-10（第 8 列 tokens/credits 串台）、P2-20（换算路径扫描面）、**F-T19-1**（重复顶层 slug 假绿）。
- `[成员自述]` 方向严格是 Evidence / field binding：**无一条**经验规则（不用 input<output、不用价格大小）；**无任何数值换算**。
  - 证据字段域**追加式**扩展：旧 `models.<key>` **位置与语义逐字保持**（它同时是引文排序键，否则存量引文会漂），另加 `models.<key>.<variant>` / `models.<key>[.<variant>].rates.<dim>` / `rates.<dim>` / `mediaRates.<unit>` / `models.<key>[.<variant>].mediaRates.<unit>`；`api-plans.json` 整体 schema 未改。
  - 三条判据进 `makeApiPlan`（rebuild 与 validate 同时可见）：**B1** 空转维度绑定必红；**B2** 官方列序（模型级绑定引文里输入值必须先于输出值出现 ⇒ 来源层与派生数据两个入口的互换都红）；**B3** 单位（引文/unitNote 点名的「百万/千」必须与 `pricing.unit` 同类，只看写出来的词；每条记录**必须有**单位见证，缺失即红）。
  - 渲染层第 7/8 列逐项对账 + 单位计数对账；第 8 列的本地三元表达式（**第三份手写单位表**）收敛为 schema 的 `FREE_TIER_UNIT_LABEL`。
  - 换算路径扫描面从 **1 个文件扩到 154 个 `.js`**（剥注释/字符串/正则后按单位语义判），真实代码面 **0 命中**。
- `[成员自述]` 变异（沙箱副本，共享树只读，每次还原 sha256 逐字节一致）：**m1a** 来源层对调 zhipu glm-5.3 input/output → rebuild exit 1（报「8 出现在 28 之前…顺序相反」）；**m1b** 绕过 rebuild 手改派生数据 → validate --strict exit 1；**m2** 13 条 unit 全翻 per_1M→per_1K → rebuild exit 1（25 处）；**m3** 第 7 列单位错位（审计 P1-9 原变异）→ selftest exit 1，**生产 Google 行**被抓出「其他 $1 / 每 100 万 tokens」应为「每百万 token·小时」；**m4** 第 8 列 tokens→credits（审计 P1-10 原变异）→ selftest exit 1，**生产阿里云行**被抓出「1,000,000 credits」应为 tokens；**m5** models.json 重复顶层 slug → **validate --strict / check-models-reproducible / check-model-registry-links / models-selftest 四道全 exit 1**、还原全 0（⇒ F-T19-1 关闭）；**m6** 在非显眼文件 `scripts/lib/zh.js` 插 `rate.input * 1000` → selftest exit 1（扫描器 4 种合成形态全命中，反向牙不误伤 `Math.round(value*1e6)/1e6`）。
- `[成员自述]` 第 13 条（anthropic officialUrl）：**不改数据**。独立复现重定向链 `docs.anthropic.com/…/pricing` → `platform.claude.com` → `www.anthropic.com`（两次 web_fetch 均 cross-origin）；`claude.com/pricing#api` 可读但内容截断、无法确认为逐模型 API 单价的官方定价页 ⇒ 不切、不动价格与既有引文；将来若切 `claude.com`，域白名单会放行。
- `[成员自述]` 第 14 条（「新增：—」）：`apiPlanChangeTextOf` 按真实语义渲染 `created/restored`，`fieldsDiffText` 两侧缺席时返回空。**计数：生产 `/changes/` 与 `/plans/api/` 各 6 → 0**；`.worktrees/qc-e2e` 合成非空态 **9 → 0**（只读其 `dist/api-plan-history.json`，10 条生命周期 = created 8 + ended 1 + restored 1；修后用同一份 store 重渲染：0 占位、8 处「首次进入数据集」+ 1 处「重新出现」）。常驻断言三处（`assertPageHonesty` 扫 HTML 三类占位 / `assertHistoryHonesty` 逐事件 / selftest 4 条牙）。
- `[成员自述]` 全绿：api-plans-selftest **166/0** · validate --strict 0 · check-api-plans-reproducible 0（dry-run 自报逐字节一致）· check-api-plan-history 0 · build-local 0 · seo-verify 11/0 · models-selftest 90/0 · check-models-reproducible 0 · check-model-registry-links 0 · provenance-selftest 114/0 · audience-selftest 191/0 · deal-plan-links-selftest 80/0 · check-plans-reproducible 0。
- `[成员自述]` 数据改动仅两处，均走来源层 → rebuild：deepseek OFF-PEAK 的 `pricing.unitNote` 补齐单位与出处（原只写「与标准档一致」⇒ 触发「单位见证缺失即红」）；`api-plans.json` 的唯一新 diff 就是这条 `unitNote`（其余 `freeTier.stability×4` 与 aliyun description 属 t12）；`api-plan-history.json` **未改**（0 事件）。
- `[成员自述 · 结构边界，必须如实转述]` 生产 35 条引文里 **26 条是模型级绑定**（24 组 input/output 顺序对受判据约束）；**逐格式维度绑定**（`…rates.input`）在「每条记录最多 3 条引文」的硬上限下**不可能覆盖全部 66 个计价条目**。本轮**未新增任何证据项/引文**，也未改任何价格与既有 `capturedAt`/`sourceUrl`。⇒ captain 已写进 T21 的剩余风险，要求报告**不得**写成「input/output 已逐条证据绑定」。
- `[成员自述 · 跨任务碰撞]` `plans-selftest` 由 234/0 变 **233/1**（「订阅层不自己读套餐数据文件」），归因 T12 在飞的 `feeds.js` 新增散文里出现字面量 `plans.json`（把 feeds.js 回退到 HEAD 立即 234/0）。
- `[captain 裁定]` **正解在扫描器一侧，不在文档一侧**：已把该修复作为 **T14 第 7 条验收**（`plans-selftest.js` 本在 t16 的 inScope 内）——改成**访问形态判据**（require/import/readFileSync/JSON.parse 与文件名/路径的组合，覆盖拼接与模板串），并要求 **正/反两条常驻对照**（真读取 → 必红；只写散文 → 必绿）。依据：§14「重点是检测能力」+ 审计 F-verify-x-004（字符串型断言必须先剥注释）。已另有短消息提醒该成员动手前重读 acceptance。

---

## T12 `/feeds/` 以 Registry 为唯一来源（isolation-engineer）— completed

- `[成员自述]` **before → after（同数据同路径）**：产物 Feed 文件 50 → 50 · 页面列出地址 **40 → 50** · 含 `category-*` **0 → 10** · 「文件→页面未覆盖」**10 → 0** · 「页面→文件缺文件」0 · `/feed/api.xml`、`/feed/coding.xml` **始终不存在（未新增，URL 形态逐个冻结）**。
- `[成员自述]` 5 个 inScope 文件：`lib/feeds.js`（新增 `FEED_LIST_GROUPS` + 每条 spec 的 `listGroup`（分组顺序/文案一份）、可见性 `isPublicSpec`（默认 public，`hidden/internal` 为例外）、**`pageGroups()`**（分组由注册表派生）、**`checkFeedsPage()`**（双向对账唯一实现：注册表→页面 / 页面→注册表 / **hidden 必须与「不生成」绑定** / public 必须有分组））；`build-local.js`（**仅在令牌授权区段**：`renderFeedsPage` 删掉手写 id 清单、只渲染 `pageGroups()`、新增「按分类」分组、没分组的 public Feed 有兜底段落不静默消失；自检换成双向对账 + 「hidden 不许留产物文件」）；`feeds-selftest.js`（新增第十二节 **16 条**，含 4 条 checker 灵敏度牙：抽掉一份 Feed⇒红、页面多一条陌生订阅⇒红、hidden 却仍生成⇒红、public 无分组⇒红；+ 防恒红 + URL 形态冻结 + 2 条结构牙）；`check-feeds-reproducible.js`（新增**不看注册表**的产物级双向覆盖判据）；`feeds-report.js`（打印分组计划 + hidden/未分组告警；补齐 `plan-changes` 类与规范厂商名口径——原先报告 23 份 vs 页面 25 份）。
- `[成员自述]` 退出码：feeds-selftest **0**（131 项）· check-feeds-reproducible **0**（2 次构建逐字节一致 + 新覆盖行）· build-local --out=dist.qc-iso **0**（自检新增「双向对账：注册表 25 个 public Feed ↔ 页面列出 50 条地址」）· seo-verify --dir=dist.qc-iso **0**（11 项）· 覆盖断言脚本 **0** · JS 关闭可读探针 **0**（1 个可执行脚本 = 主题脚本，25 行静态订阅，4358 字正文，无 noscript）。
- `[成员自述]` 验收变异：`category-api` 标 `hidden: true` 但仍生成 → feeds-selftest **exit 1**（2 红）+ build **exit 1**（自检 3 条：仍在生成 + 两个产物文件仍在）；逐字节还原（sha256 `A8DE404D4B298087` 一致）后双双 exit 0。
- `[成员自述]` 令牌交棒：`build-local.js` 按指示交给 **t16（gate-engineer 的 T16 Manifest）**，本轮只改 `/feeds/` 渲染与其自检两处区段。
- `[captain 裁定 · 已登记]` 其报出的两处文档漂移已写进 T21（A 段第 5/6 条）：`docs/v3.0/AGENT-REFERENCE.md:192` 的「分组表硬编码（build-local.js:1645-1668）」已不成立且行号过期；`docs/v3.0/A4-HANDOFF-feed-pipeline.md:123/345` 的「③ /feeds/ 分组表（约 1645-1668）——必改」与表格里 `ids: feeds.PLAN_CHANGE_FEEDS.map(...)` 的现状描述同样过期。同时登记「页面列出地址 40 → 50」的新读数。captain 已向 gate-engineer 确认令牌归属与范围（Manifest/PUBLIC_FILES 区段）。

---

## 基础设施故障记录（captain 处置，非工作缺陷）

- `[平台]` **503 engine_maintenance**（模型网关维护）同时打断 3 名成员：gate-engineer 的 **t15（T16 Manifest）** 与 provenance-pricing-engineer 的 **t16（T14 三态）** 被标记 failed；isolation-engineer 撞上同一错误但**未持有 attempt**（T12 已交付）⇒ 无需重试。
- `[captain 处置 1]` t15 / t16 均用 `reassign_task` 重派原 owner（attempt 2），并在重试理由里写死两条前置动作：① **先复核共享树有无中断留下的半成品**（逐一点名该 owner 会碰的文件）；② provenance-pricing 必须**重读 T14 第 7 条**（captain 在其认领后追加的扫描器加固），否则会把那条红灯当成"别人的问题"跳过。
- `[平台]` 随后 **400 context_length_exceeded**：provenance-pricing-engineer 同一会话的本次请求需新计算约 **686,673 token > 单次上限 512,000**（未命中缓存部分），t16 再次 failed。
- `[captain 处置 2]` 判定**重试同一会话不可靠**（其会话总量已超单次上限，只有缓存命中才可通过；缓存一失即必然失败），故把 **t16 改派给 registry-engineer**（T05/T06 已交付、上下文小），并把该任务的两部分内容、第 7 条的确切要求、以及"不得削弱 T10/T13 前序成果"全部写进改派理由，使其无需依赖前 owner 的上下文。provenance-pricing-engineer 此后**已无剩余任务**（t7/t12/t14 均已交付），无需修复其会话。
- `[captain 风险预判]` 同类风险仍存在于**上下文较大的成员**，首当其冲是 evidence-analyst 的 **T21（文档同步 + 99 条终版分类）**——该任务天然需要重读大量交付物。T21 派发时若再遇 400/TPM，预案是**把 T21 拆成两半**（文档同步 / RECLASSIFIED_FINDINGS 终版）分派给两名成员，而不是反复重试同一会话。
- `[captain 纪律]` 上述错误（429 concurrency / 429 tpm / 503 maintenance / 400 context）在台账中一律**记为基础设施事件**，不计为成员的 failed 工作项；任务重试后重新计时。

---

## 待入账（随报告滚动更新）

**已完成（16/24）**：t1 T01 · t2 T02 · t3 T03（draft）· t4 T04 · **t5 T05（P0）** · t6 T07 · t7 T09 · t8 T11 · t9 T15 · t10 T06 · t11 T08 · t12 T10 · t13 T12 · t14 T13 · **t19 T19 评审（verdict=pass）** —— 另 t16 T14 正在重试（改派 registry-engineer，attempt 3）。

**进行中**：t15 T16 Manifest（gate-engineer，attempt 2）· t16 T14 三态 + 扫描器加固（registry-engineer，attempt 3）。

**未开始**：t17 T17 门禁 fail-closed（gate-engineer，等 t15）· t18 T18 独立复核（verifier，等 t10/t11/t13/t16/t9/t17）· t20 T20 变异电池 18+1（verifier，等 t18）· t21 T21 文档同步 + 99 条终版分类（evidence-analyst，等 t20）· t22 T22 完整 Gate + 分根因提交（captain）· t23 T23 精简再审计（verifier）· t24 T24 最终报告（captain）。

**已交付的交付物清单（供 T23/T24 引用）**：`BASELINE.md` · `FINDING_STATUS_BEFORE.md` · `RECLASSIFIED_FINDINGS.md`（draft，终版待 T21）· `source-revalidation.md` · `review-registry/T19-P0-REVIEW.md` + `T19-evidence-summary.md` · `CAPTAIN-LEDGER.md`（本文件）；`FIXED_FINDINGS.md`（T18）· `MUTATION_RESULTS.md`（T20）· `FINAL_REAUDIT.md`（T23）· `QUALITY_CLOSURE_REPORT.md`（T24）仍待产出。

---

## captain 预检：全量 Gate dry-run + 生产真值层完整性审计（2026-10-04 00:5x，成员仍在飞时执行）

**动机**：此前每个成员只跑自己那一段门禁，**没有任何人跑过完整 Gate**。队长在成员仍可修复时先跑一遍，可在提交前暴露集成级断裂。

### 1) 离线门禁 37 步逐条实跑（exit code 逐个记录）

- **36 PASS / 1 FAIL**。
- 唯一 FAIL：`plans-selftest.js` **exit 1（233/1）**——暴露值为 `plans.json`，即 t16（T14 第 7 条）正在修的裸子串扫描；属**已知在飞项**，非新增断裂。
- 一次通过的关键项包括：`validate.js --strict` · `check-reproducible` · `history-verify` · `migrate-audience-verify` · `zh-todo --check` · 15 个 selftest（zh / expiry / text / health / provenance / history / changes / feeds / seo / audience / app-token / ai / fixture / plan-history / deal-plan-links / api-plans / models / models-page / planshub / vendor / archive / data-docs）· `check-api-plans-reproducible` · `check-api-plan-history` · `check-models-reproducible` · `check-model-registry-links` · `coverage-report` · `check-feeds-reproducible` · `check-plans-reproducible` · `check-plan-history` · `check-ci-consistency --expect-checks=36`。

### 2) 构建 + 产物级验证（`--out=dist.qc-captain`，与成员互不干扰）

- `build-local` **exit 0**，产物自检全过；**290 个 dist 文件**；**173 个页面**（可索引 170 · 别名 3 · 详情页 80 · 落地页 93 · 厂商页 19 · 分类页 5）；sitemap **170**；孤儿 0 · 重复 canonical 0 · 无效内链 0；SEO 安全门禁 **27 码 × 173 页全过**；产物总大小 1216.8 KB。
- 订阅：**25 个 public Feed × 2 格式 = 50 个文件 · 426 条条目**（三方对账 / id 唯一 / 链接可解析 / 时间来自数据）；订阅发现 242 条 `rel="alternate"` 横跨 95 页；`/feeds/` 预渲染 4358 字、**51 个订阅地址全部存在**、**双向对账：注册表 25 个 public Feed ↔ 页面列出 50 条地址**（T12 的成果在产物级成立）。
- `seo-verify --dir=dist.qc-captain` **exit 0**（11 项 0 失败）。
- `verify-site --dir=dist.qc-captain`（**真浏览器**）**exit 0：703 项 0 失败**。
- `verify-site --dir=dist.qc-captain --compare=research/_raw/ours-baseline/verify.json` **exit 0：709 项 0 失败** —— 回归口径：覆盖优惠 80 → 80 · 卡片 50 → 50 · 首屏完整可见 9 → 9 · 页高 4589px → 4665px（+1.7%，容差 15% 内）· 外部请求 0 → 0 · JS 错误 0。
- `[captain 结论]` **除 `plans-selftest` 一条在飞项外，完整 Gate 在本轮工作树上是全绿的**；这是 T22 之前最有价值的一次集成级证据。

### 3) 生产真值层完整性审计（判据 R，captain 亲自跑）

| 真值文件 | sha256（前 16） | 相对 HEAD |
|---|---|---|
| deals.json | `3ba148dbc640e1b2` | **UNCHANGED** |
| plans.json | `a72c91efea82b843` | **UNCHANGED** |
| api-plans.json | `19cd8af73a746d90` | 6 insertions / 2 deletions |
| models.json | `8fa85b1d0547b7ed` | **UNCHANGED** |
| model-registry-links.json | `fd2336c86d076457` | **UNCHANGED**（与 T01 BASELINE 逐字相同） |
| scripts/data/model-registry-gaps.json | `1e89ba04c43a0daf` | **UNCHANGED** |
| scripts/data/deal-history.json | `6c9909d991973f8c` | **UNCHANGED** |
| scripts/data/plan-history.json | `67dbc7f141a4f891` | **UNCHANGED** |
| scripts/data/api-plan-history.json | `56685dd589dc348b` | **UNCHANGED** |

`api-plans.json` 的语义 diff（逐记录字段级对账，captain 自跑）：记录数 **13 → 13**、计价条目 **67 → 67**；仅 5 条记录有字段级变化，且与两位成员的自述**逐条吻合**：
- `freeTier`：`ebc4af9a71b6` aliyun · `a110a5bfc3f8` google · `2981d8f29020` tencent · `646f01c662e6` zhipu（= T10 的 `stability` 三档）
- `pricing`：`e546e8ab4c7d` deepseek（= T13 补齐 OFF-PEAK 的 `unitNote` 单位与出处）
- **无** `officialUrl` / `evidence` / `credits` / `limits` / `models` / `id` 变化，**无**记录增删。

`[captain 结论]` 判据 R（不删历史 / 不改无关生产数据 / 不动稳定 ID / 不大规模改旧记录 / 不改真值契约）**在本轮已完成部分成立**，且由队长独立复算而非采信成员自述。T22 提交前需重跑本审计并覆盖 t15/t16 之后的最终状态。

## T15 / T16（Dataset Manifest 双向完整性，§10.7）— 2026-10-04
- 交付：`lib/data-docs.js` 单一注册表 `PUBLIC_DATASETS`(9) 派生 Manifest / 拷贝清单 / Data Docs / selftest；方向 2 全树 JSON 认领扫描（构建期 + selftest 两面），排除规则显式四态（Manifest 自身 / Feed 家族 / INTERNAL_ARTIFACTS(source-health.json) / 未认领即红），过期豁免与空输入亦红。
- 口径更正（作废我契约里的「13 份数据集」）：**Manifest 9 份数据集 / dist 36 个 JSON**（数据集 9 + Feed 25 + Manifest 1 + 豁免 1）。T21/T24 引用此组。
- 变异：构建期多写 public JSON → build exit 1，撤销后 sha256 `0E9159AF…B5B6` 与补丁前逐字节相同；验证面 sandbox dist + 一份 JSON → `data-docs-selftest --dir` 56/1 exit≠0，删除后 57/0。
- 零退化：改动前后各构建一次，**290 个产物逐字节相同**；build 0 · data-docs-selftest 0 · validate --strict 0 · seo-verify 0 · verify-site 703/0 · check-ci 36/0。
- 遗留接口 → t17：`data-docs-selftest --dir=` 只加了 a 项；缺产物「跳过计绿」(b 项) 属 t17 fail-closed，需同步在 check-ci 里钉 `--dir=`。build-local 令牌已释放。证据 `.qc-gate/`（gitignored）。
## T14 / t16（unknown ≠ false 三态契约，§10.4）— 2026-10-04
- 交付：`plan-schema.restrictionWitnessProblems` 唯一判据（取值与记述同向：false 必须官方否定表述；unknown 必须写「查过但来源没说明」；true/数值/文本不要求见证）；缺 value 报错文案明写「缺字段不得当成 false」；渲染/派生指标常驻牙；API 侧 `freeTier.conversionDependsOnModel` true/false/null（缺失与显式 null 都落 null）；T12 的 `stability` 必填枚举未被削弱。
- 订阅层扫描改**访问形态**判据（path.join/模板串/分段拼接/require·import + 词边界 + 先剥注释）+ 8 条常驻对照；T12 散文一字未改。
- 变异（沙箱，无 git checkout）：m1 unknown→false / m2 删 value / m3 伪造派生 / m4 stability 削弱 各面 exit≠0；牙：unknown 走完整 rebuild 后仍 unknown，页面印「未确认」。数据零改动（curated_plans 9c6e49a3 / plans a72c91ef 与开工逐字节相同）。
- 队长独立复核（本人实跑）：plans-selftest **264/0 exit 0**、api-plans-selftest **175/0 exit 0**。
- 裁定①：`PUBLIC_FILES` 断言以**问模块**（dataDocs.datasetCopyUrls()）为准，t17 不得退回硬编码/裸子串。
- 裁定②：⑪ 段 deals 链路「一个字都不许提 plans」的裸子串扫描**保持现状**（语义本就要求绝对不提，文本判据与意图同向；亦可接受的最坏情形只是对一个本就该被质疑的跨层提及报红）。列入 T21/T24 的残留脆弱性记录，不新增修复任务。
## T17 / t17（Gate fail-closed + 步骤语义冻结，§10.8/§10.9）— 2026-10-04
- `allow_degraded_run`：before 无断言（改成 'true' 仍 36/36 绿）→ after 按事件真求值 + 真实执行判定 shell；实测 verify@PR/push/dispatch默认=false、collect@schedule/默认=false、deploy@push/workflow_run/dispatch 全 false；判定 shell 行为矩阵：不可用+非逐字'true' → exit 1/mode=none；不可用+逐字'true' → exit 0/mode=degraded + ::warning + Summary「没有做真浏览器验收」。
- 门禁步骤体：before 只冻结步骤名（run→`echo skipped` 仍绿）→ after 逐步骤规范化 run 体指纹（剥注释）+ 步骤级 if 冻结 + 禁止 continue-on-error；9 个变异全部 exit 1 且逐字节还原。
- **重大发现（在范围内）**：六个产物依赖步骤原先排在构建**之前**，CI 干净检出无 dist ⇒ 五节在 CI 里**一次都没跑过**，且六处「缺产物 ⇒ 跳过并计 ✓」。after：移到 `Assemble site` 之后（第 31–35 步）、全部显式 `--dir=dist`、(17) 守护调用形态与顺序；六处跳过分支改为非 0，仅显式 `--allow-missing-dist` 走 OPTIONAL DIAGNOSTIC。
- 缺产物实测：archive/data-docs/models-page/planshub/vendor selftest + check-feeds-reproducible **6/6 exit 1**（末行点名缺失产物与两条出路）；加 `--allow-missing-dist` → exit 0（68/53/53/29/57 项 0 失败）。
- 零退化：check-ci --expect-checks=36 **0**（断言名与总数一条未动，44 步名字集合不变）· build-local 0 · data-docs-selftest 0 · seo-verify 0 · plans-selftest 264/0 · api-plans-selftest 175/0；collect.yml/deploy.yml 变异后逐字节还原（git diff 为空）。顺带修掉 check-ci 读取器真缺陷：`workflow_dispatch: # 注释` 父键原先不压栈（collect.yml 中招，inputs 错挂 on:）。
- 给下游：判定 shell 需 Git for Windows bash（PATH 里的 bash 是 WSL 启动器会挂住），`DSH_BASH=` 可覆盖，找不到即判红。证据 `.qc-gate/`。
## T18 / t18（独立复核）— 2026-10-04 · **verdict = pass**，无新 P0/P1/P2
- 交付：`research/quality-closure/FIXED_FINDINGS.md`（22378 B · sha256 903eba86106d287fa09a16dec49572864931ba178d02aedaf71a5c66929af955 · UTF-8 无 BOM）+ `verify-work/`（12 自写判据 + lib/serve.cjs + 13 份 JSON 日志）。
- 判据自建（不 require models-page / model-registry / registry-join-audit）；产物只落 `dist.qc-verify/`；变异沙箱在**仓库外** `D:\qc-t18\`（与共享树 186 关键文件逐字节相同），共享树只读。
- §17 独立 join：44 模型/44 页 · 期望 **67 行 = 真实 67** · missing/extra/duplicate/multi-owner **0/0/0/0**；另六组对账（价格/单位/通道/变体/来源链接/canonical）。多变体口径逐页 2/2/2/2/2/4/4/4/3 = **25 行**，与二次更正一致、无分歧。
- §6.1：自造夹具 17/17；9 case × 5 门禁，P0 原始形态与 M09 多道红且 rebuild 拒写；**F-T19-1 四入口全红（修复确认）**。
- §18：浏览器矩阵 **48/48**（6 路由 × 4 视口 × JS 开关）+ verify-site **703/0**；§19 子路径 229 取回 · 非 200 = **0** · 无根绝对引用 · canonical 全带前缀。
- fail-closed：空产物 6/6 非 0 · `--allow-missing-dist` 6/6 标注跳过 · 真产物 6/6 绿；`allow_degraded_run` 3 文件 × 6 事件自求值符合；步骤指纹 5 实验（注释/空行不误报；改名/`--dir` 语义变化/continue-on-error 全红）。
- §27：9 份冻结真值 **8 SAME / 1 DIFF**（api-plans.json，来源层重建解释，身份 0 变化）；deals.json 相对审计基准仅 lastSeen×127 + updatedAt，id 增删 0/0；沙箱独立重建三份派生物逐字节一致。
- 附加：按 action.yml 顺序 **40 步全量门禁复跑 非 0 = 0**；t15 Manifest、t16 三态变异各独立重做一遍。
- 边界（写进报告 §8）：无真实 GitHub Actions runner（静态断言 + 真执行判定 shell）；浏览器仅 Edge headless；降级表达式求值器只认仓库实际形态；沙箱 ≠ CI runner；verifier 自报 4 处 harness 缺陷已修后重跑，未当产品发现。
## T20 / t20（变异电池 18+1 → 实际 21 例）— 2026-10-04 · canonical 全量跑 exit 0
- 交付：`research/quality-closure/MUTATION_RESULTS.md`（21564 B · sha256 c28eaecdbf0c7060be461c3c507bcd24aef588be9569db38b921d2d6efbfb474）+ `mutation-work/`（cases.cjs / battery.cjs / prepare-nonempty.cjs / probe.cjs + 6 份 JSON 日志）。
- 结果：21 例 = M00 绿对照 1 · **CAUGHT 18** · PASS-requirement 2（M03/M04 非空历史/归档：按「build/verify 必须绿」判 PASS）；**NOT_CAUGHT 0**（§21 十八条全部被捕获）；21/21 恢复 BYTE-EXACT；固定门禁集合 28 道逐例一致。
- 审计唯一未捕获的 **M17（ai-apply 接受判定恒真）已补上**：ai-selftest 牙8e/8i/8k 三红（其余 27 道全绿）。
- 两条如实残留 + 一条 P3，队长裁定：
  · **N1** 直接篡改已落盘 `scripts/data/source-health.json`（含 dist 副本）标 healthy → 28 道 0 红 ⇒ **DOCUMENTED**（运维观测产物、非真值层；判定链 health.js evaluate + health-selftest 合成夹具有守卫；不新增交叉断言，§26）。
  · **N2** 模型详情页逐格数值错位（行身份/行数不变）无覆盖（M19 仅 verifier 自写 join 抓到）⇒ **开 t25 关闭**（models-page-selftest.js 独立逐格对账 + 变异证明），docs 写「已修复（t25）」。
  · **F-T20-1（P3）** archive/feeds 空态牙在非空历史现场失真（产品链全绿）⇒ **DOCUMENTED**。
- verifier 自报修过 5 处 harness 缺陷（--only 前缀匹配、联接点、setup 语义、prepare 路径、extra 漏算），并把 M03/M04 曾出现的 4 道假红归因为「用例基底误用 T07 时代旧副本」，未当产品结论。
- 方法学提示（转给 T21/T23）：M03/M04 装配口径见报告 §2/§6；ai-selftest 牙5c 在 validate 本来就红时属连带噪音，只有牙7/8/9 是 AI 隔离检测器。
## T25 / t25（模型详情页逐格数值对账守卫，关闭 T20-N2）— 2026-10-04
- 唯一 tracked 改动 = `scripts/tools/models-page-selftest.js` 第 ⑨ 节「逐格数值对账」：期望值自 `api-plans.json` + `scripts/data/model-registry-links.json` 按 (apiPlanId, modelKey, 记录内真实 variant) 展开（§17 同口径）；实际值逐格读产物 `models/<slug>/index.html` 的 mapirow；**不用 models-page 任何计算函数**（禁令已机器化：⑨ 段源码出现 apiPricingRowOf/modelReferencesOf/apiTargetsOf/modelPageGate 即红）。
- 覆盖：44 页 · 67 条计价条目 · **536 格全对 · 0 豁免**；项数 **61 → 75/0**；默认 dist/ 与 --dir 两路径都 75/0；6 条常驻灵敏度对照（换格/置空/删格/删行/合成多变体/真实页占位）。
- 变异（`.qc-registry/sandbox` 树副本，byte-exact 还原）：A 渲染层 input↔output 对调 → exit 1 点名 `(4f8bae91f9f8, claude-fable-5.1, standard)` 输入价 $50 vs $10；B cache 格置空 → `(646f01c662e6, glm-4.5v, long_context)` "" vs "—"；C **M19 原形**（两行×三格互换）→ 4 条点名 ¥2/¥4、¥6/¥12。关键对照：同一 M19 形状下 validate --strict / check-models-reproducible / models-selftest / check-model-registry-links / coverage-report **全 exit 0** ⇒ 补的正是缺失的那一层。
- 零回退 8/8 全 0：validate --strict · build-local --out=dist.qc-registry · models-page-selftest（两条路径）· seo-verify --dir · check-ci-consistency --expect-checks=36 · plans-selftest 264/0 · api-plans-selftest 175/0。生产数据五份与开工逐字节 SAME（deals 3ba148db / plans a72c91ef / api-plans 19cd8af7 / models 8fa85b1d / links fd2336c8）；未碰 .github/**、build-local.js、lib/models-page.js、registry-join-audit.js。
- 交棒：t23 精简再审计须独立重做这一条（M19 形状变异 → 只此一门红）。
## T21 / t21（§22 文档同步 + §24 终版分类）— 2026-10-04
- 交付：`RECLASSIFIED_FINDINGS.md` 终版（60247 B · sha256 3744ff395217e34f0b61c77236fd1d3279cdb7008160dcc1cd0cbfb593af881e）：99 条（104 ID）× 7 字段（old ID / old severity / **audit commit 1c024db** / latest master status / new category / action / evidence）；§4 = draft 37 条 ⚑ 逐条收敛表（无未决项）；§5 = DOCUMENTED 残留（N1、F-T20-1）+ N2 按 t25 完成态写。
- 九类计数 = **99**：FIXED 10 · GUARDRAIL_ADDED 19 · VERIFIED_NO_CHANGE 8 · DESIGN_ACCEPTED 10 · NOT_REQUIRED 12 · DOC_FIXED 18 · DEFERRED 22 · ALREADY_FIXED 0 · NO_LONGER_APPLICABLE 0。六类对照口径：REPAIR NOW 10 · GUARDRAIL 18 · VERIFY 16 · DESIGN 10 · DOC 17 · NOT REQUIRED 28（P2-20 已按裁定并入 GUARDRAIL）。
- §22 只碰 9 个 in-scope 文档 + 交付物：SCHEMA-v3.0（口径反转 + basis 真实枚举 + coverage 按展开条目）· SCHEMA-v2.5 §8 三档必填 · AI-MAINTENANCE（白名单/accept 三条件）· AGENT-REFERENCE（时效声明 + /feeds/ 派生 + freeTier 4 条 + 13/67/45/10）· A4-HANDOFF（历史快照声明 + 两处【已过期】）· PROJECT_STATUS（63→64 / 25→24 份 / 42→44 / 2→4）· README（24/48 + P3-28 端点命名：/data/index.json 真实地址、model-registry-gaps.json 有意不发布，**未新增页面**）· NEXT-STEPS（四条剩余风险，含「引文预算上限：不得写成 input/output 已逐条证据绑定」）· v3.0 报告。历史快照原值保留；`research/audit/**` 一字节未改。
- 验证：build-local --out=dist.qc-docs 0 · check-ci --expect-checks=36 36/0 · validate --strict 0 · models-page-selftest 75/0。
- **口径裁决（我此前的数字作废）**：Feed 一律用可复现的 **24 份 × 2 = 48 文件 / `/feeds/` 48 个唯一地址**。队长本人重测三份 dist（qc-docs / qc-captain / qc-registry）逐一致：`feed/` 递归 **48** 文件（13 顶层 + …含 vendor/ 与 plans/ 子目录）、页内 `/feed/` href 去重 **48**、双向 0 缺失 0 未列；另有 **2 条 `rel="alternate"`**。我预检里写的「25 × 2 = 50 / 51 地址」= 把 2 条 alternate（很可能还有 1 条非 feed 链接）算进去所致，**作废**。T12 报告里的「40 → 50」同源解释。
- 当前数字（T21 重算，2026-10-04）：deals 134（80/54）· plans 23 · api-plans 13 条/67 计价条目/10 provider · models 44 · 映射 64（55+9）· gaps 10 · provider 34 · official_urls 14 · Feed 24 份（48 文件 / 48 地址）· HTML 173 · sitemap 170 · dist 290 · 根 JSON 11 / 全树 JSON 36 / Manifest 9 · 门禁步骤 44 / 断言 36 · 历史事件 0/14/6 · ai-selftest 63 · zh-selftest 15 · models-page-selftest 75。
- 证据边界（T23/T24 必须原样保留）：§0.4 四组（F-r1-history-ai-001 仅源码级 / F-online-008 仍 UNVERIFIED / §16「读不到」不得改写 / F-r1-history-ai-004 与 F-r2-api-007 子声明）+ §5 两条 DOCUMENTED 残留。
## T22（队长亲自执行）：完整 Production Gate + 分根因提交 + 真值层审计 — 2026-10-04
- **完整 Gate 41/41 exit 0**（忠实按 `.github/actions/gate/action.yml` 执行：`npm ci` + 抽出的 40 个 node 步骤；Edge 真浏览器 mode=full，未用 degraded）。关键读数：validate --strict 0 · history-verify 0 · migrate-audience 15/15 · zh-todo 0 · 15 支 selftest（health 72/0 · provenance 114/0 · changes 101/0 · feeds 131/0 · audience 191/0 · ai 63/0 · plans **264/0** · api-plans **175/0** · models 90/0 · models-page **75/0** · planshub 32/0 · vendor 52/0 · archive 69/0 · data-docs 57/0）· build-local 0 · 三份 reproducible 0 · 三份 history 0 · links-check 0 · coverage-report 0 处问题 · seo-verify 11/0 · **verify-site 703/0** · **回归比对 709/0**。另有 check-ci-consistency --expect-checks=36 → 36/0。
- **10 个根因 commit**（契约 8 个 → 实交 10 个：多出 source-health 接线与 feeds 单一来源两个独立根因，§25 允许调整；每个 commit 显式列路径）：
  `5ec2532` registry-integrity · `c21a6ce` history-archive-nonempty · `70d015e` provenance-semantics · `25fa540` api-pricing-guardrails · `55e611a` ai-candidate-isolation · `e8b68c9` source-health-wiring · `1f09c6b` gate-fail-closed · `1614639` dataset-integrity · `db24737` feeds-single-source · `3edb9cf` docs-sync。
  HEAD = **3edb9cfd7d9653bed37ef70169bdd0b61046b4f0**（基点 21cf66d）；覆盖 65 tracked + 2 新增工具文件，互不重叠；未 push / 未开 PR / 未部署。
- **真值层审计（判据 R）**：vs 21cf66d —— 9 份真值里 **8 份逐字节未变**，唯一变化 api-plans.json（**6+/2−**）+ 来源层 curated_api_plans.json（8 行）= T10 的 4 条 stability + T13 的 deepseek 单位出处；vs 审计基准 1c024db —— deals.json 差异全属**本轮之前**的 master 漂移，独立复算 **id 134→134 · added 0 · removed 0**。
- 提交后复跑 11 道门禁子集 **11/11 exit 0**；`git status --porcelain` 仅剩 `?? research/audit/`（§23 不动不入库）与 `?? research/quality-closure/`（将与 T24 报告一并提交）。
- 环境记录：harness 的 pwsh 因执行策略拒绝 .ps1（改用 `powershell -ExecutionPolicy Bypass -File`），且 PS 5.1 需 **UTF-8 BOM** 才能正确解析含中文的脚本（无 BOM 时 GBK 误判会吞掉换行、破坏 here-string 终止符）。Gate 事实：`build-local` 默认 out=dist/ 即刷新现场。
- 未运行：线上冒烟（无授权）。
## T23（§28 精简独立再审计）— 2026-10-04 · **结论：适合继续开发新功能 · 新增 P0/P1 = 0**
- 交付：`FINAL_REAUDIT.md`（25964 B · sha256 764cdc02942dbd3038e64e271d3f1fea19b8ed2003a2cfc9c34c23c19285e3a7）+ `reauth-work/`（11 自写脚本 + 13 份 JSON 日志）；审计对象 = 提交态 3edb9cf；变异全在仓库外 `D:\qc-t23\`，恢复 100% BYTE-EXACT。
- 状态：原 P0-1 **CLOSED**；12 条 P1 **12/12 CLOSED**（FIXED 5 = P1-4/5/6/11/12；GUARDRAIL_ADDED 7 = P1-1/2/3/7/8/9/10）；无其它四类状态。
- 独立重跑 **39/40 node 步骤 + 回归比对全 exit 0**（唯一未跑 npm ci）：verify-site 703/0 · 回归比对 709/0 · check-ci 36/0 · join-audit 四计数 0（44 页/67 行）· 自写浏览器矩阵 48/48。与 T22/T18 自述**逐条吻合、0 处不一致**。
- 三项指定独立重做：(a) t25-M19 形状变异 → `models-page-selftest --dir=dist` exit 1 且点名到格（`glm-4.5v (646f01c662e6, glm-4.5v, long_context)` 输入价 ¥2 vs ¥4）；`/plans/api/` 价格格错位 → verify-site exit 1 并点名行与三格；另确认 R1（`sourcePricingIdentitiesOf` 写死）三红、R2（`headlessReady` 写死 true）红。(b) t17 fail-closed 全部复现（空产物 6/6 非 0 · 放行 6/6 标注 · 指纹 g1/g2 不误报 + g3/g4/g5 必红 · 降级 3×6 自求值）。(c) t15 Manifest 独立数：9 份 / 36 JSON（根 11 + data/index 1 + feed 24）/ Feed 48 / `/feeds/` 48 唯一地址 + 根 2 个 + 2 条 rel=alternate。
- 三条观察（附复现、非产品缺陷）：① 落盘篡改类（source-health 直接改 healthy 无门禁 = N1 DOCUMENTED；`/plans/api/` 第 8 列手改会在下一次 build 被真值覆盖 = 自愈）；② `/plans/api/` 三列价格逐格对账只在真浏览器门禁（degraded 运行的已知代价，判定步骤 fail-closed）；③ 空态牙在非空历史现场失真（F-T20-1）。

## T24（§29 最终完成报告）— 2026-10-04
- 交付：`QUALITY_CLOSURE_REPORT.md` · 49144 B · sha256 **d84ff90097d0135321403af4ce7ad0615480505a139f00a1cded8e441654bff6**（按提交内容计，LF）· UTF-8 无 BOM；§29 全部 26 节 + 结尾 14 问逐条作答 + 交付物清单。
- 结论：**适合继续开发新功能**（Blocker 全关 ✅ · Guardrail 19/19 ✅ · Gate 41/41 ✅ · 无新增 P0/P1 ✅）；唯一保留条件 = 合并/发布前由 CI 在提交态重跑完整 40 步 + 人工授权执行线上冒烟（**本轮线上冒烟未运行**）。
- 边界全部写进报告：生产零样本（Changes/Archive 非空）· 引文 3 条预算上限（不得写成 input/output 已逐条绑定）· N1 / F-T20-1 两条 DOCUMENTED · degraded 运行覆盖面 · §16「读不到」原样 · F-r1-history-ai-001 仅源码级 / F-online-008 UNVERIFIED · 无真实 GitHub Actions runner。

## 本轮最终状态 — 2026-10-04
- 分支 `quality-closure-post-audit` = **11 个 commit**（10 根因 + 1 收口交付物），基点 `21cf66d`（origin/master），HEAD = 收口交付物 commit（用 `git log -1` 复核；本账本即在该 commit 内）。
- 工作区干净：只剩 `?? research/audit/`（原审计证据，§23 一字节未改、**不入库**）。隔离产物 `dist.qc-*/`、`.qc-*/` 已 gitignore。
- 未做：push / PR / 部署 / 线上冒烟（均无授权）。主工作区全程未触碰。
- 24 个任务（t1–t25，含中途新增 t25）全部 terminal；成员全部 idle。
- 环境备注：`core.autocrlf=true` ⇒ 报告里的 sha256 按**提交内容（LF）**计；在 Windows 全新检出（CRLF）上重算会不同。harness pwsh 受执行策略限制，.ps1 需 `-ExecutionPolicy Bypass` 且含中文的脚本必须带 UTF-8 BOM。
## 推送上线（用户授权「推送上线」）— 2026-10-04
- **PR #32** `quality-closure-post-audit` → `master`：分支 `gate` 检查 run **37171970378 success**（2m42s）→ 合并 merge commit **`ba0e0f23710b4a191230da0313ae166cb139f6cb`**。
- master 侧：`Verify site (gate)` run **37172126751 success**（2m44s）· `Deploy to GitHub Pages` run **37172126798 success**（4m44s；`prepublish`〔同一 gate action，`allow_degraded_run='false'`〕→ `build` → `deploy` 三段全绿）· Pages `status=built` / `build_type=workflow`。
- **线上冒烟（部署后真浏览器）**：`node scripts/tools/verify-site.js --url=https://buguoshixc.github.io/ai-deals-aggregator/` → **703 项 0 失败**。线上抽查：首页 / `/feeds/` / `/models/glm-4.5v/` / `/plans/api/` / `/docs/data/` / `sitemap.xml` / `data/index.json` 全 200；`/feeds/` 列出 **48** 地址；`/models/glm-4.5v/` **2 行**（standard / long_context）；`sitemap.xml` **170**；Manifest **9** 份；**`/feed/api.xml` 404**（§13 红线成立）。
- **顺带发现（合并前就存在，非本轮引入）**：`Collect AI Deals` 自 **2026-10-03 15:47Z** 起失败（run 37134505706，gate 步骤 exit 1），直接原因是构建自检 `✗ SEO[itemlist-arity] changes/：ItemList 声明 1 项，但 itemListElement 只有 0 项` —— **正是本轮修复的 P1-4**；它又导致 `dist/deals.json` 不存在、并由 `workflow_run` 连累那次 deploy 失败（run 37134604743）。真实采集链路的确认需要再跑一次 `Collect AI Deals`（会写数据并推送，属独立授权范围，**本轮未触发**）。
- T24 报告的两条保留条件现已满足（CI 三段全绿 + 线上冒烟 703/0）；报告 §21 与 §26 已按实况改写并随本次提交更新到 master。