# T20 · 变异电池（18 条 §21 + 审计 M17 + 1 条自设计 + 1 对照 = 21 例）

- 执行人：verifier（t20，attempt 1 / attempt_id `ff8b0724-abcf-458e-9a6e-e277b9dba63d`）
- 执行时点：2026-10-04
- 电池脚本：`research/quality-closure/mutation-work/{cases.cjs,battery.cjs,prepare-nonempty.cjs,probe.cjs}`
- 逐例原始记录：`research/quality-closure/mutation-work/logs/battery.json`（**canonical 全量跑：21 例，跑手 exit 0**，含每例逐门禁 exit code / 断言原文 / 变异前后 sha256 / 恢复后 sha256）+ `logs/mm17.json`（审计 M17 单独复跑）+ `logs/requirement.json`（M03/M04 要求面复跑）

## 0. 纪律与环境

| 项 | 做法 |
| --- | --- |
| 沙箱 | **仓库外** `D:\qc-t20\`：`gold\`（共享树逐块复制：scripts + node_modules + dist + assets + docs + .github + research + 根文件）、`cases\<用例>\`（每例一份独立副本）、`cases\_e2e`（T07 非空历史夹具副本） |
| 共享树 | **全程只读**。电池前后对 12 份关键文件（三份真值层 + 模型/关系层 + 工作流 + 门禁 action + 来源层）逐字节复核：`gold 逐字节未变 true · 共享树逐字节未变 true` |
| 恢复 | 每例把变异过的文件用 gold 备份**逐字节覆盖**回来（`fs.copyFileSync`），并复核 `sha256 == 变异前`；**全程未用** `git checkout/restore/stash` |
| 门禁集合 | 固定 28 道 + 浏览器 1 道（`M02/M03/M04/M19` 带浏览器门禁）；逐例完全一致，顺序固定（**产物读取类在 build-local 之前**，避免被重建掩盖）：`validate-strict · check-ci-consistency(36) · check-reproducible · check-plans-reproducible · check-api-plans-reproducible · check-models-reproducible · rebuild-api-plans · rebuild-plans · rebuild-models · check-api-plan-history · check-plan-history · history-verify · models-selftest · models-page-selftest(--dir=dist) · api-plans-selftest · plans-selftest · ai-selftest · data-docs-selftest(--dir=dist) · feeds-selftest · health-selftest · provenance-selftest · archive-selftest(--dir=dist) · seo-verify(--dir=dist) · coverage-report · deal-plan-links-selftest · audience-selftest · MY-join-audit(--dist=dist) · build-local` + `MY-browser-matrix(--dist=dist)` |
| 判据自建 | 不 require 任何被测判定模块自证；`MY-join-audit` / `MY-browser-matrix` 是 T18 自写脚本（只读原文 + 自己遍历/自己解析产物） |
| 可判性前提 | `M00-pristine-control`（不改任何文件）→ **28/28 全绿**（http 无浏览器门禁），证明门禁集合在干净输入上不假红 |
| 变异落点 | 数据/关系/计划类一律改**来源层** `scripts/data/**`（T02 踩坑：改仓根会得到假阴性）；渲染/产物类改 `dist/**`；门禁类改 `.github/**`；AI 类走真实 CLI/lib 入口 |

## 1. 总表（18 条 §21 + 审计 M17 + 自设计 1 条 + 对照 = 21 例）

| # | 用例 | 变异点 | 期望检测器 | 实测（exit code / 断言原文） | 判定 |
| --- | --- | --- | --- | --- | --- |
| M00 | 对照（不改文件） | — | 全绿 | 28/28 exit 0 | **GREEN**（前提成立） |
| M01 | 一个 API pricing source identity → 两个 registry models | 来源层 `model-registry-links.json` 规范序追加通配映射到第二个 slug | 身份唯一性门禁 | **9 道红**：`validate-strict=1`（「已经映射到 glm-5.3 …同一条价格记录不许映射到两个 registry 模型」）· `check-models-reproducible=1` · `rebuild-models=1`（拒绝写盘）· `models-selftest=1` · `models-page-selftest=1` · `coverage-report=1` · `MY-join-audit=1` · `build-local=1`（+`ai-selftest=1` 噪音，见 §4） | **CAUGHT** |
| M02 | 同 model 两 variants 页面少一行 | 产物 `dist/models/glm-4.5v/index.html` 删掉 `data-variant="standard"` 行 | 页面/独立 join | **2 道红**：`models-page-selftest=1`（`✗ §17 独立 join：… {"missing":1,"extra":0,…}`）· `MY-join-audit=1`（逐页行数 `glm-4.5v:1`、4 处差异） | **CAUGHT** |
| M03 | Changes history 非空 → build/verify 必须绿 | 非空夹具（T07 生成器产出的 7/19/12 事件移植进**当前代码**副本；`build-local` 重建） | 必须绿 | **要求面 29 道里 27 道绿**：`build-local=0` · `seo-verify=0` · `MY-join-audit=0` · `MY-browser-matrix=0（48/48）` · `validate-strict=0` · `history-verify/check-plan-history/check-api-plan-history=0` · `data-docs-selftest=0`（另有 `verify-site=0（704 项 0 失败）` 独立重放）；**副作用 2 道**：`feeds-selftest=1（1 项）`·`archive-selftest=1（5 项）` = 空态牙（F-T20-1） | **PASS（要求面）** |
| M04 | Archive 非空 → assets / internal links 必须绿 | 同上夹具（含 ended/restored 生命周期 → 档案详情页） | 必须绿 | 同 M03：**要求面全绿**（`build-local` 的内链/资产自检 27 码全过 · `seo-verify` 孤儿 0/无效内链 0 · 自写矩阵 48/48 全解析）；**副作用 2 道**（同上，均为空态牙，不是 rel 引用/详情页断言） | **PASS（要求面）** |
| M05 | 第三方 evidence 却标 official | 来源层 `curated_api_plans.json`：把聚合站 URL 写成「官方定价页」引文 + `officialUrl` | ① `officialDomainProblems` ② 三轴措辞 | **两道防线分别记录**：① **`validate-strict=1`（2 项）** · ② **`rebuild-api-plans=1`（「人工来源层有 2 处问题，拒绝写盘」）**；另 `check-api-plans-reproducible=1`、`build-local=1`（`api-plans-selftest` / `provenance-selftest` 均 0） | **CAUGHT** |
| M06 | new-user free credit 被标 stable freeTier | 来源层：`freeTier.stability: new_user → standing`（描述仍是"首次开通新人专属"） | freeTier 边界 / schema | **`validate-strict=1`（1 项）** · **`rebuild-api-plans=1`（拒绝写盘）** · `check-api-plans-reproducible=1` · `build-local=1` | **CAUGHT** |
| M07 | input evidence / output source 字段错绑 | 来源层：把一条绑定引文里的**输入值/输出值位置对调**（两者仍在引文里） | B2 官方列序 | **`validate-strict=1`（1 项）** · **`rebuild-api-plans=1`**（「人工来源层有 1 处问题，拒绝写盘」）· `check-api-plans-reproducible=1` · `build-local=1` | **CAUGHT（B2 生效）** |
| M08 | per 1M evidence 但 source 写 per 1K | 来源层：只把 `pricing.unit` 改成 `per_1K_tokens`（引文/unitNote 原样仍是"每百万"） | B3 单位同类 | **`validate-strict=1`** · **`rebuild-api-plans=1`** · `check-api-plans-reproducible=1` · `build-local=1` | **CAUGHT（B3 生效）** |
| M09 | unknown 经 rebuild 变 false | 来源层 `curated_plans.json`：`fair_use` 先写 `unknown`+见证、再降级 `false` 但保留"未说明"记述 | 三态见证 | **`validate-strict=1`（2 项：「plans.json … 在 curated_plans.json 里找不到对应记录 —— 无法对账三态」）** · `plans-selftest=1` · `check-plans-reproducible=1` · **`rebuild-plans=1`（拒绝写盘）** · `build-local=1` | **CAUGHT** |
| M10 | AI generation `--out=deals.json` | 不改文件：跑真实 CLI `maintenance --task=extract --out=<沙箱>/deals.json` | 落点白名单 | **CLI exit=1**（落点白名单拒绝）；`deals.json` sha256 前后一致（`3ba148db…` 未变） | **CAUGHT** |
| M11 | candidate envelope 直接放入 production truth | 产物/真值层：把 `deals.json` 换成候选信封 | `productionTruthEnvelopes` | **11 道红**：`validate-strict=1` · `check-reproducible=1`（「指向已不存在的条目 56」）· `history-verify=1` · `plans-selftest=1` · `ai-selftest=1` · `data-docs-selftest=1` · `feeds-selftest=1` · `provenance-selftest=1` · `deal-plan-links-selftest=1` · `audience-selftest=1` · `build-local=1` | **CAUGHT** |
| M12 | generation 隐式 accept | 不改文件：调 `candidates.writeCandidates(file, 带 review.decision 的候选, {cause:'generation'})` | 结构性拒绝 | **调用 exit=1**（「REJECTED: …」）；`.ai-cache` 里没有写出文件 | **CAUGHT** |
| M13 | source model 少一条 mapping / gap adjudication | 来源层：删掉 `claude-fable-5.1` 的 API 映射（不补声明） | API 侧完整性 | **9 道红**：`validate-strict=1` · `check-models-reproducible=1` · `rebuild-models=1` · `models-selftest=1` · `models-page-selftest=1` · `coverage-report=1` · `MY-join-audit=1` · `build-local=1`（+ai-selftest 噪音） | **CAUGHT** |
| M14 | duplicate registry slug | 来源层 `models.json` 重复顶层 `"glm-5.3"` 键（第二条逐字段合法） | 原文扫描 | **6 道红**：`validate-strict=1`（「顶层键 "glm-5.3" 重复出现」）· `check-models-reproducible=1` · `rebuild-models=1` · `models-selftest=1` · `build-local=1`（+ai-selftest 噪音） | **CAUGHT** |
| M15 | 新增 public dataset 但 Manifest 漏登记 | 产物：`dist/public-experiment-t20.json` | Manifest 双向完整性 | **`data-docs-selftest=1`**（「未认领的 JSON…」/牙 #12 一节） | **CAUGHT** |
| M16 | headless browser unavailable 但 source 仍标 healthy | 来源层：`scripts/lib/health.js` 关掉 `headlessReady === false` 的判定分支 | health 组合矩阵 | **`health-selftest=1`（65 项通过 / 7 项失败）**，失败原文：「H2 Collect Summary 里无头来源落到 headless_unavailable — 智谱AI活动页 … NO_BROWSER」 | **CAUGHT** |
| M17 | production gate `allow_degraded_run=true` | 工作流：`verify.yml` 的 `with.allow_degraded_run` 改成字面量 `'true'` | 调用方表达式求值 | **`check-ci-consistency=1`**：「✗ (11) … verify.yml @ pull_request: 解析成 true —— 必需路径不得静默降级」 | **CAUGHT** |
| M18 | required dist 缺失但 artifact test PASS | 状态：用一个空目录当 `--dir` | 6 个产物依赖工具 fail-closed | **6/6 exit=1**（archive / data-docs / models-page / planshub / vendor / feeds-reproducible）；对照 `--allow-missing-dist` → **exit=0（显式标注跳过）** | **CAUGHT** |
| **MM17** | **【审计 M17】ai-apply 的「已接受」判定改成恒真** | 来源层 `scripts/tools/ai-apply.js`：`const accepted = candidates.acceptedOf(payload);` → `payload.candidates.slice()`（未人工 accept 的候选也能推进） | `ai-selftest`（牙8e 就是 M17 原命令形态 `--all-accepted --dry-run`） | **`ai-selftest=1`（1 道红，其余 27 道全绿）**，失败原文：`✗ 牙8e 未接受候选：ai-apply exit≠0 且拒绝落地（M17 回归钉） —— exit=0 ▸ ec0f6ce831ff ERNIE-4.5-Turbo-128K…` · `✗ 牙8i 人工接受但机器门未过：ai-apply exit≠0 并点名 —— exit=0 …` · `✗ 牙8k ai-apply 的接受判定走唯一实现 candidates.acceptedOf（不再有行内 filter） —— 又出现了行内的 accept filter` | **CAUGHT（审计唯一盲区已补上）** |
| M19 | 【自设计】渲染层数值错位（行身份与行数不变） | 产物：glm-4.5v 两行**三个价格格互换**（`data-item`/`data-variant`/行数一字未改） | 逐格数值对账 | **仅 `MY-join-audit=1` 抓住**（「✗ 4 处差异」= 三格价格 + 祖先；仓库自带 28 道**全绿**，含 `models-page-selftest` 61/0） | **CAUGHT（但只有自建判据）→ F-T20-2** |

**恢复哈希**：19 例全部 **BYTE-EXACT**（`restore[].byteExact == true`；每例的 `shaBefore → shaAfter` 逐条见 `logs/battery.json`）。例：
`M01 scripts/data/model-registry-links.json 3594e4da…→b31de1b0…` · `M14 scripts/data/models.json 05b72c2d…→d4495a85…` · `M11 deals.json 3ba148db…→d84b89fe…` · `M17 .github/workflows/verify.yml 03af788f…→9a9e9d8c…`。

## 2. NOT_CAUGHT 清单（如实）

| # | 形态 | 实测 | 影响面 | 建议 |
| --- | --- | --- | --- | --- |
| N1 | **直接篡改已落盘的健康观测产物**：把 `scripts/data/source-health.json`（与 `dist/source-health.json`）里一条无头来源改成 `healthy`（status/ok/error/reason/consecutiveFailures 全清） | **28 道门禁 0 红**（首次 M16 采用的形态；`health-selftest` 也 0） | 判定链本身（`health.js evaluate()`）+ selftest 的**合成夹具**都有守卫（M16 的代码形态 CAUGHT）；但**已经落盘的观测产物**没有与真实环境/`source-probes` 的交叉对账 ⇒ 手工或上游脚本写坏的 `source-health.json` 可以静默存活，直到有人打开 `/status/` | 二选一：①**DOCUMENTED**——在文件头与 Manifest 里明确它是「运维观测产物、非真值层、不参与内容门禁」（与 `source-snapshots.json` 同一口径）；②加一条轻量交叉断言：`/status/` 渲染时若某 `kind=headless` 来源 `status=healthy` 而 `source-probes.json` 里最近一次探测是 `NO_BROWSER`/失败，则非 0 |
| N2 | **模型详情页的「逐格数值」**（M19 的形态） | 仓库自带 28 道全绿；**只有我自写的独立 join 抓住** | 一个把两个变体的价格渲染对调（或 input/output 列错位）的渲染回归，可以在 `models-page-selftest`（61/0）、`build-local` 自检（27 码全过）、`seo-verify`、`verify-site`（704/0）全绿的情况下上线 | 把「逐格数值对账」并进常驻：`models-page-selftest` 的页面诚实性断言现在只按**行身份集合/行数**对账，建议扩成「按 api-plans 重算三格数字 + 单位格」逐行比对（`/plans/api/` 已有这套，模型页缺）；或把自写独立 join 的数值维度并入 `scripts/tools/registry-join-audit.js`（它现在只对身份/计数） |

**一处已归因的坑（写在这里供下游省时间）**：M03/M04 的用例工作区**必须**以「当前代码副本（gold）」为基底、只把 T07 生成器产出的三份非空历史**移植**进去（`prepare-nonempty.cjs --fixture=…`）。我一度把用例基底设为 `.worktrees/qc-e2e` 副本（那是 T07/T08 时代的**旧代码 + 旧数据**）——结果 9 道门禁红（`validate-strict`/`check-api-plans-reproducible`/`models-page-selftest`/`MY-join-audit`/`MY-browser-matrix` 等），是**跨版本混合**造成的假红；同理，把当前代码「同步 + 用生成器重建」也会因为生成器要求夹具是 git worktree 而得到混合状态。切换回 gold 基底 + 移植后，要求面 29 道里 27 道绿（只剩 F-T20-1 的两支空态牙）。

## 3. Findings

### F-T20-1 · P3 · 两个 selftest 的「空态牙」在非空历史状态下失败（测试套件状态敏感，产品链不受影响）

- **现象**（非空夹具、当前代码、干净重放）：`archive-selftest --dir=dist` **5 项失败**（含「真实日志 0 事件 ⇒ 0 条档案（这是事实，不是故障）」「空态明说…」「空态没有把"没有拿到日志"与"没有记录"混为一谈」「【牙】空态被抹掉（只剩空列表）→ 页面断言变红」「【牙】某组的结束计数与数据不一致 → 变红」）；`feeds-selftest` **1 项失败**（「没有高价值事件的记录 date_modified 缺席（不是拿刷新日冒充）」）。
- **同时全绿**：`build-local=0` · `verify-site=0（704 项）` · `MY-browser-matrix=0（48/48）` · `MY-join-audit=0` · `history-verify/check-plan-history/check-api-plan-history=0` · `seo-verify=0` · `data-docs-selftest=0`。
- **判断**：这些是**牙本身**（对空态的合成场景断言）在非空现场下失真，不是产品缺陷；但它们在 CI 里永远只跑生产（deal 事件 0 条）态，而唯一会跑非空态的入口是 T07 的 `history-nonempty-e2e.js`（它不跑这两支 selftest）⇒ 该失真长期不可见。
- **建议**：空态牙改成对**合成 store** 的断言（不依赖现场 `dist`/现场日志），或在非空现场显式跳过并打印原因。

### F-T20-2 · P2 · 模型详情页缺「逐格数值」常驻断言（见 §2 N2）

- **证据**：M19（行身份/行数一字未改，只把两行三格价格互换）→ **仓库自带 28 道全绿**（`models-page-selftest` 61/0、`build-local` 自检全过、`verify-site` 704/0）；只有自写的独立 join 红（`✗ 4 处差异`）。
- **影响**：价格错位（含 input/output 对调、两个变体互换）在模型页上是**静默**的 —— 而这恰是 §10.1–10.3 修复面在渲染侧的对称面。
- **建议**：把逐格数值（Input/Output/Cache + 单位格）对账并进 `models-page-selftest` 的页面诚实性断言，或并进 `scripts/tools/registry-join-audit.js`（它已在 CI 体系里，但目前只对身份/计数/行数）。

### F-T20-3 · P3 · 已落盘的健康观测产物无交叉对账（见 §2 N1）

## 4. 观察（解读电池结果时必须知道）

1. **`ai-selftest` 的「牙5c」是噪音放大器**：它断言「AI 挂掉时 `validate` 仍然通过」；当工作区里 `validate` 本来就因为**别的**变异而红时，这条牙会连带失败（M01/M05/M06/M07/M09/M11/M13/M14 都出现）。**判读口径**：`ai-selftest` 红只有在失败项属于牙7/牙8/牙9（生成侧写不了生产 / 必须人工 accept / 信封进生产真值）时才作为 AI 隔离的检测器（M10/M12 就是用它自己的 CLI/库入口证明的）。
2. **期望检测器与实测检测器可以不同**：M07/M08 我第一版变异（把 evidence 字段换成 `.rates.output`/`.rates.input` 两条、或同时把 unitNote 写成"百万…又每千"）分别只被**注册表引文逐字规则**和**可重现性**抓住，B2/B3 没响；改成"引文内数字对调""只改 unit"后，B2/B3 都在 `validate-strict` 与 `rebuild-api-plans` 上响了（§1 表内是**修正后**的最终形态）。
3. **只改仓根产物**（T02 的假阴性形态）在 T18 已复验：`links-check`/`models-selftest`/`validate` 全绿、红的是 `check-models-reproducible`——因此本电池所有数据类变异都落**来源层**。
4. `MY-*` 两道自建门禁的角色：`MY-join-audit` 在 M01/M02/M13/M19 提供了**独立于仓库判据**的第二证据（M02/M19 里它是唯一或主要的检测器）；`MY-browser-matrix` 只在 M02/M03/M04/M19 参战（其余用例跳过，为控制时长；跳过在记录里写明）。

## 5. 复现指引

```powershell
cd <worktree>
# 全量（21 例：对照 + 18 条 §21 + 审计 M17 + 自设计；canonical 跑法，exit 0）
node research/quality-closure/mutation-work/battery.cjs `
  --gold=D:\qc-t20\gold --work=D:\qc-t20\cases `
  --json=research/quality-closure/mutation-work/logs/battery.json
# 单例（按 id 前缀）
node research/quality-closure/mutation-work/battery.cjs --only=M14,M17 --gold=D:\qc-t20\gold --work=D:\qc-t20\cases
# M03/M04（要求面模式；夹具基底必须是当前代码副本 + 移植 T07 生成器的非空历史）
node research/quality-closure/mutation-work/battery.cjs --only=M03,M04 --gold=D:\qc-t20\gold --work=D:\qc-t20\cases `
  --json=research/quality-closure/mutation-work/logs/requirement.json
# 期望检测器定向探针（逐门禁读原文）
node research/quality-closure/mutation-work/probe.cjs --gold=D:\qc-t20\gold --case=M05 --case=M07 --case=M08
```
沙箱 `D:\qc-t20\` 全部在仓库外，可整目录删除；共享树内只落 `research/quality-closure/mutation-work/**` 与本文件。

## 6. 边界（未验证项）

1. **M03/M04 的夹具口径**：非空历史来自 T07 的生成器产物（7/19/12 事件），移植到与当前代码同源的 gold 副本上（生成器本身要求夹具工作区是 git worktree，且它的代码同步是白名单式的，直接把当前代码副本当 `--root` 会被它拒绝或产生跨版本混合）。三份历史的**自洽性**由仓库自己的三支历史门禁判决（全绿）。
2. **M03/M04 的用例基底**：必须以「当前代码副本」为基底 + 移植 T07 生成器的三份非空历史；用 `.worktrees/qc-e2e` 旧副本当基底会得到跨版本混合的假红（已归因，见 §2 末）。
3. **浏览器门禁只覆盖 4 个用例**（其余 15 例为控制时长跳过）；`verify-site` 全量只跑在 M03/M04 的夹具与 T18 的产物上。
4. 电池跑的是**当前共享树**的代码与数据（gold 逐字节复制，186 关键文件在 T18 时已核过；本次另核 12 份关键文件 + gold/共享树前后一致），不是 CI runner 本身。
5. 我自己的 harness 在过程中修过 5 处自身缺陷（`--only` 前缀匹配、联接点未重建、`setup` 钩子语义、`prepare` 路径没进 gold、判定逻辑漏算 extra 命令），**修好后重跑才取数**；未把 harness 缺陷当成产品结论。

## 7. 结论

**20 项要求面（18 条 §21 + 审计 M17 + 1 条自设计）全部实际执行，20/20 满足**（canonical 全量跑手 **exit 0**：`NOT_CAUGHT / REGRESSION：无`）：

- **18 条直接 CAUGHT**（M01/M02/M05–M18 十六条 + MM17 审计 M17 + M19 自设计），其中 M16 的**代码形态**被 `health-selftest` 抓住（审计 M17 的盲区已补上：`ai-selftest` 牙8e/8i/8k 三红）。
- **M03/M04 两条按「build/verify 必须绿」判 PASS**（独立重放：`build-local=0` · `verify-site=0（704 项）` · 自写浏览器矩阵=0（48/48）· 历史三支门禁=0），并附带 F-T20-1 的测试套件状态敏感发现。
- **NOT_CAUGHT 清单 2 条**（N1 观测产物篡改 → 建议 DOCUMENTED 或加交叉断言；N2 模型页逐格数值 → 建议把自写判据的数值维度并进常驻断言）。
- 恢复：**21/21 例 BYTE-EXACT**；gold 与共享树电池前后逐字节未变（`true / true`）。
- M03/M04 唯一的方法学坑（用例基底必须是当前代码副本）已归因并写入 §2，**无遗留未归因现象**。
