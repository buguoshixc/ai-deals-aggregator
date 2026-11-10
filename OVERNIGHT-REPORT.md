# 供给端第二夜 · 过夜报告（2026-11-10）

> 分支：`feat/deals-supply-2026-11`（不推送、不建 PR、不碰 master）。
> 工作方式：无人值守；所有歧义按任务书规则自行决断，决断理由写在本报告里。
> 本报告只写**真的发生过的事**；每条读数都对应一次实跑，没跑的一律注明「未跑 + 原因」。

## 1. 一句话结论

P2（B 类资讯线索雷达）从"工作区在制品"收尾成**可复现的 fixture + 18 条判据自测 + 首轮实跑落盘（1 条线索）**；
P3-A（门禁拆锁）把「数据正确性」前置成提交前硬拦、把「发布就绪」移到提交后自动降级并留痕，冻结表同步更新、`check:ci` 39/39 绿；
P3-B（源级熔断）已在集成态**收口**（`2e8cb3b`，cherry-pick 自 `wip/p3b-health-v2` 的 `f8333124`）：
连续 5 次采集器抛错自动暂停、满 3 天半开重试一次，collect 跳过并**显式打印**、`/status/` 与 collect Summary 都显示暂停态；
10 条目标门禁在集成态逐条实跑通过（health-selftest 115/0 · check:ci 39/0 · gate:build 40/0，读数见 §4.6）。
全程未推送、未动 master，两处**接手前就存在的基线门禁红**已修复并在 §5 留痕。
**唯一卡住的不是代码，而是环境**：本机无浏览器内核，真浏览器验收/回归比对未跑（§4 逐条写明）。

## 2. 每阶段状态

| 阶段 | 状态 | 提交 SHA | 一句话 |
|---|---|---|---|
| T0 保命快照 | **DONE** | `327bc15` | P2 工作区在制品原样快照，先有可回退点；基线读数 ai-selftest 108/0、fixture-test 6/0 |
| T1 P2 收尾 | **DONE** | `4ffd68a` | 8 份 feed fixture 生成（fixture-test 14/0）；ai-selftest 补 18 条线索判据（126/0）；修三处假陈述（leads.js 两处 + P1 偏差说明）；另修了 `build-fixtures.js` 里 RSS 剪裁规则写好却没登记进 `TRIMS` 的实现缺口 |
| T2 P2 实跑 | **DONE** | `cbc514b` | 全量实跑落盘：deals 207→210（+1 线索 +2 其它来源新增），history 同日 +3 created（含线索），8 个 leads_* 健康行全部 healthy，`/changes/` 与首页雷达可见线索 |
| 基线红修复 | **DONE** | `51b54a7` | 接手状态下 `gate:build` 本已红两处（SEO 余量登记过期、coverage-targets 反证牙空转），按既定流程修复，判据未放宽（§5） |
| T3 P3-A 门禁拆锁 | **DONE** | `5e7d828` | collect.yml 数据正确性 9 条在提交前硬拦、完整 gate 移到提交后自动降级 + `if: always()` 留痕；(11)/(13) 冻结表同步、条数仍 39；16/16 负向探针（Lead 另抽查 4 颗，§4.4） |
| 文档真话 | **DONE** | `4413273` | P3 后旧叙述全部改正（README / action 描述 / verify 注释 / H9 / 采集链路图 / collect.js 头注释） |
| T4 P3-B 源级熔断 | **DONE** | `2e8cb3b` | 连续 5 次**采集器抛错**才自动暂停（5 > source-rulings 的 3 次人工裁决线，留 2 轮人工窗口；零产出 / 条数骤降 / `zeroOutputExpected` 一律不计数，避免按设计空转的线索雷达被关）；暂停满 3 天半开重试一次、失败窗口重算；collect 跳过并显式打印，`/status/` 与 Summary 均显示暂停态（集成态 health-selftest 115/0 · gate:build 40/0，见 §4.6） |
| T5 报告 | **DONE** | 本文 | 本报告 + 状态文件并入 |

## 3. 数据影响（以文件为准）

### 3.1 总量与分布（2026-11-10 实跑后）

- `deals.json`：**207 → 210 条**（`count=210`，type: deal 110 / tool 100；region: 国内 61 / 国外 149；带 `expiresAt` 11 条）。
- 按 source：Futuretools 49 · aitools.fyi 45 · **AppSumo 24** · Curated-CN 18 · 百度千帆 17 · Curated 14 ·
  火山方舟 12 · Layer3Labs 9 · 智谱AI 7 · OpenRouter 5 · 智谱AI活动页 5 · Futurepedia 3 · 阿里云百炼 1 · **快科技 1（B 类线索）**。
- 新增的 3 条（无删除）：
  1. `AppSumo | NoCodeBackend | deal`（AppSumo 终身授权折扣，首次收录 2026-11-10）
  2. `快科技 | 每天白赚几百 AI大模型免费薅羊毛：DeepSeek、GPT等全都有 | tool`（**B 类线索**，原文日期 2026-11-09，链接 `https://news.mydrivers.com/1/1164/1164402.htm`）
  3. `Futuretools | Call Annie | tool`（首次收录 2026-11-10）
- 与任务书预期的差异（如实说明）：任务书写「deals.json 条数 = 207 + 线索条数」，实际是 **207 + 3** ——
  全量实跑同时采到了 2 条其它来源的新记录（AppSumo / Futuretools），不是线索判据多收。
  线索本身与 dry-run 一致：**1 条**。
- `scripts/data/deal-history.json`：事件 81 条；2026-11-10 当日 **+4**（created 3 = 上述 3 条新增，其中
  线索 id `3eac4b6acccb` 有 `created`；updated 1）。`history-verify` 逐字段重放 = 当前 `deals.json` ✅。
- `scripts/data/source-health.json`：19 行；**8 个 `leads_*` 行全部 healthy**（快科技 items=1，其余 0 条也 healthy
  —— `zeroOutputExpected` 放行生效）；futurepedia 仍为 failed（连续零产出 3 次，既有行为，未改判据）。
- `source-snapshots.json`：17/17 个来源有结构摘要（57 份）；`zh-pending.json` 32 个待译字段（+2）。

### 3.2 dry-run 与实跑是否一致

- dry-run（`--only=8 个 leads 源`）与全量实跑在**线索条数与逐条内容上一致：1 条，同一条**（标题/链接/日期相同）。
- 逐源读数（`/tmp/leads-dry.log`，括号内 = RSS 条目 / 7 天窗口内 / 三闸命中）：
  IT之家 60/60/0 · 36氪 30/30/0 · 量子位 10/10/0 · 爱范儿 20/20/0 · 少数派 10/10/0 ·
  极客公园 30/19/0（11 条因原文日期 > 7 天被窗口筛掉，**不是判据筛掉**）· **快科技 100/100/1** · 钛媒体 15/15/0。
  近失配样本 0 条（即没有「平台名 + 免费、只差时间词」的样本）。
- 8 个源里 7 个 0 条是**判据刻意严格**的结果（三闸同时命中），不是失败：健康表里它们全部 healthy，
  collect 日志里也有逐源的「窗口内条目数 / 命中数 / 近失配样本」。

### 3.3 页面侧（`build-local` 产物核对）

- 线索**只**出现在：首页「变化雷达」1 处 + `/changes/` 的 created 分栏 1 处；两处都带「线索 · 未核验」徽标、
  链接直达原文（`target="_blank" rel="noopener noreferrer"`）。
- 首页卡片列表 0 处；`sitemap.xml` 0 处；无站内详情页 `dist/deal/3eac4b6acccb`（正确：线索没有详情页）。
- `dist/assets/data/offers.json` 里该记录：`type:"tool"`、`sourceFacts.sourceType:"lead"`、
  `history.events=[created]`、`discountInfo`/六字段全空。

## 4. 门禁实跑清单（真跑过的命令与读数）

> 纪律：**不写「gate 全绿」**。下面每行都是本机 2026-11-10 实跑读数；没跑的单列并写明原因。

### 4.1 T1/T2 期间与提交前必跑

| 命令 | 读数 |
|---|---|
| `node scripts/tools/ai-selftest.js` | 126 项 · 失败 0（基线 108 + 新增 18 条线索判据） |
| `node scripts/tools/fixture-test.js` | 14 项 · 失败 0（基线 6 + 8 份 leads feed） |
| `node scripts/validate.js --strict` | 通过（6 条既有「疑似同一优惠未合并」警告，0 错误） |
| `node scripts/tools/check-reproducible.js` | 通过（引文漂移 0 · 手写值矛盾 0） |
| `node scripts/tools/history-verify.js` | 通过（81 事件 · 基线+事件重放逐字段等于 deals.json） |
| `node scripts/tools/health-selftest.js` | 72 项 · 失败 0（**T4 前**的读数；集成态增至 115/0，见 §4.6） |
| `node scripts/tools/check-ci-consistency.js` | 39 项 · 失败 0（P3 后仍为 39，`--expect-checks=39` 未动） |
| `node scripts/tools/migrate-audience-verify.js` | 通过（15/15） |
| `node scripts/tools/provenance-selftest.js` | 通过（132/0） |
| `node scripts/tools/history-selftest.js` | 通过（62/0） |
| `node scripts/tools/changes-selftest.js` | 通过（120/0） |
| 构建 | `node scripts/tools/build-local.js` 产物自检通过（210 条数据 → 216 页 · 约 632 KB） |
| L1+L2+L3 | `npm run gate:build` **全绿**（40 个脚本 · 失败 0；须先构建 dist；见下方说明） |
| 完整门禁 | `npm run gate`（解析 action.yml 逐步骤）读数见 4.3 |

### 4.2 本机没跑 / 跑不了的步骤（原因写清，不冒充）

| 步骤 | 状态 | 原因 |
|---|---|---|
| 真浏览器验收（`verify-site.js`） | **未跑** | 本机没有 playwright 内核，也没有系统 Chrome/Edge；这是接手前就存在的环境限制（P0/P1 同一条路径）。 |
| 回归比对（`verify-site.js --compare`） | **未跑** | 同上（需要真浏览器）。 |
| GitHub Actions 实跑 | **未跑** | 做不到（任务书明确「不要尝试触发」）；验收只到本地 `check:ci` + `gate:build` + 改动说明。 |
| `npm run gate` 的 L4/L5 部分 | 未跑 | 同「真浏览器验收」；`npm run gate` 在浏览器判定步骤按设计**明确失败**（不静默变绿），本次记录该读数，不修改任何判据。 |
| `dist/` 双构建产物逐字节对账（gate 内 `Feed reproducibility` 等） | 已随 gate 实跑覆盖 | 见 4.3 的 `npm run gate` 读数（若 4.3 中该项在浏览器之前完成则已跑）。 |

### 4.3 `npm run gate`（完整门禁）实跑读数

`npm run gate`（= `node scripts/test/run.js --gate`，解析 `.github/actions/gate/action.yml` 逐步骤执行）：

- 解析出门禁步骤 **54 个**；实际执行了 **49 个可执行脚本步骤**（含 1 个构建步骤 `Assemble site`）。
- 结果：**48 个通过 · 1 个失败**，失败点 = `[52] Real-browser acceptance (verify-site.js)`：
  `browserType.launch: Failed to launch chromium because executable doesn't exist at C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`
  —— 本机没有浏览器内核，且 `verify-site.js` 的默认可执行文件路径是 Windows Edge（CI 里由 gate 的
  `DSH_EDGE` 覆盖成 runner 上的真实浏览器）。**这是环境限制，不是本轮回归**；失败点之后的
  `[53] Regression verify`、`[54] Gate conclusion` 因此未执行。
- 通过的部分包含：L1/L2 全部数据与自测断言（[2]–[38]）、`Assemble site`（[39]）、L3 全部产物级对账
  （[40]–[49]：models/plans/vendor/archive/analytics/residue/feed 双构建逐字节/plans 可重建/
  plan-history/SEO 独立验收；其中 [46] Feed reproducibility 是**真的连续构建两次逐字节比对**）。
- **结论不写成「gate 全绿」**：本次完整门禁在真浏览器验收处**明确失败**（不静默变绿），
  本机可验的 48 步全绿。真浏览器验收与回归比对需要在 CI（`verify.yml` / `deploy.yml`）上跑。

### 4.4 独立抽查（Lead 对 teammate 的判据做二次验证，不只信报告）

P3-A 的 16 颗负向探针由 T3 teammate 实跑；Lead 在**独立 worktree**（`/tmp/wt-mut`，基点 `5e7d828`）
另抽查 4 颗，每颗都「定向篡改 → 必须红 → 逐字节还原 → 回绿」：

| 篡改 | 预期 | 实得 |
|---|---|---|
| 数据正确性门禁里把 `fixture-test` 换成 `echo` | (13) 红并点名缺哪条命令 | ✗ `数据正确性硬门禁的 run 体里没有「node scripts/tools/fixture-test.js」`；exit 1 |
| 完整 gate 的 `allow_degraded_run` 改成 `'false'` | (11) 红并点名三个事件都解析成 false | ✗ 三个事件逐条点名；exit 1 |
| 给数据正确性门禁加 `continue-on-error: true` | (13) 红 | ✗ `它是提交前的硬拦，失败必须挡住提交`；exit 1 |
| 删掉 `Release-readiness gate record` 留痕步 | (13) 红 | ✗ `找不到留痕步骤 —— 降级/失败会变成静默`；exit 1 |

还原后 `check:ci` 回 **39/0**。另对本轮数据做了**线索 TTL 真数据抽查**（只读）：
`store.prune(deals, today)` 在 `2026-11-16`（原文日期第 7 天）保留线索、`2026-11-17`（第 8 天）
只下架该 1 条且其余 209 条不动 —— 与 §T1.2 的注入式断言一致。

### 4.5 按提交的门禁覆盖（「每次提交前实跑」的留痕）

| 提交 | 提交前实跑读数 |
|---|---|
| `4ffd68a` | ai-selftest 126/0 · fixture-test 14/0 · validate --strict ✓ |
| `cbc514b` | validate --strict ✓ · history-verify ✓ · check-reproducible ✓ · health-selftest 72/0 · check:ci 39/0 · build-local ✓ |
| `51b54a7` | seo-selftest 104/0 · seo-verify 18/0 · coverage-targets 200/0 · gate:build 40/0 |
| `5e7d828` | check:ci 39/0（集成态）· PyYAML 解析 collect.yml = 17 步 · 4 颗负向抽查（§4.4） |
| `4413273` | check:ci 39/0 · gate:build 40/0 |
| 最终（T4 后） | health-selftest 115/0 · check:ci 39/0 · ai-selftest 126/0 · fixture-test 14/0 · validate --strict ✓ · coverage-report 0 问题 · gate:build 40/0 · `npm run gate` 48/49（唯一红 = [52] 无浏览器内核）—— 逐条见 §4.6 |

### 4.6 T4 集成态门禁读数（2026-11-10，`feat/deals-supply-2026-11` @ `2e8cb3b`）

T4 由 cherry-pick 合入（`2e8cb3b`，父 `1f6713b`；来源 `wip/p3b-health-v2` 的 `f8333124`，commit body 已带来源行）。
p3b 队友没有留下任何 T4 门禁读数（其 `.worktrees/p3b-health/OVERNIGHT-STATE.md` 停在 00:50），
所以下面的数字**全部是本轮在集成态亲自实跑**的，不是转抄：

| # | 命令 | 实跑读数 |
|---|---|---|
| 1 | `node scripts/tools/health-selftest.js` | **115 项通过 · 0 失败**（T4 前 72 项；p3b 新增 §7 熔断判据 43 条 ⇒ 72+43=115，项数 > 72 是要求，不许凑回 72） |
| 2 | `node scripts/tools/coverage-report.js` | **报告自检问题 0 处**；候选登记表 40 条（已采信 13 / 未采信 21）；「连续失败 ≥ 3 次却没有裁决」0 条 |
| 3 | `node scripts/validate.js --strict` | **通过**；错误 0；警告 6 条（全部是既有的「疑似同一优惠未合并」，T4 未新增） |
| 4 | `node scripts/tools/check-ci-consistency.js` | **39 项 · 失败 0**（`(E)` 实跑 38 条 = 冻结清单 38 + 看门狗自身；`--expect-checks=39` 未动） |
| 5 | `node scripts/tools/check-reproducible.js` | **通过**：孤儿值 0 · 凭空出现 0 · provenance 漂移 0 · 值字段漂移 0 · 引文漂移 0 · 手写值矛盾 0 |
| 6 | `node scripts/tools/history-verify.js` | **通过**：81 条事件 / 79 条记录；created=76 · updated=2 · benefit_changed=3；文件 127.4 KB / 上限 1024 KB |
| 7 | `node scripts/tools/ai-selftest.js` | **126 项 · 失败 0**（与 T4 前一致） |
| 8 | `node scripts/tools/fixture-test.js` | **14 项 · 失败 0**（与 T4 前一致） |
| 9 | `node scripts/tools/build-local.js` | **产物自检通过**：216 页 · 632.7 KB · 19 个健康来源逐个对账一致（正常 18 · 异常 0 · 失败 1；真实心跳当前没有 `pausedAt` 行） |
| 10 | `npm run gate:build` | **全绿**：L1+L2+L3 合计 40 个脚本 · 失败 0（24.4s） |
| 附 | `npm run gate`（完整门禁，如实记录） | 解析 54 步 / 执行 49 个脚本步骤；**48 通过 · 1 失败**（27.1s）。唯一失败 = `[52] Real-browser acceptance`，错误原文 `browserType.launch: Failed to launch chromium because executable doesn't exist at C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`；`[53]`/`[54]` 因此未执行。**这是既有环境限制，不写「gate 全绿」、也没有为它改判据或跳过。** |

**T4 暂停态渲染的独立实跑证据（合成注入 → 实跑 → 已还原；这不是真实采集数据）**：
真实 `source-health.json` 当前没有 `pausedAt` 行，所以上面第 9 条通过只证明「诚实数据下不冤枉」，不能证明暂停分支真的会渲染。
为此做了一次临时注入（先备份 → 给 `futurepedia` 注入暂停行 → 跑 → 按 SHA-256 还原）：

- `node scripts/collect.js --dry-run --only=futurepedia`：首行
  `开始采集（2026-11-10）：0 个来源，dry-run 模式（另有 1 个来源已熔断暂停，本轮跳过）`；
  逐条打印 `⏸ Futurepedia（futurepedia）已熔断暂停：连续失败 5 次，本轮跳过 —— ⏸ 已暂停（熔断） · 暂停于 2026-11-10 00:38 · 半开重试窗口 2026-11-13 00:38 · circuit_open: 连续失败 5 次（最近错误：HTTP 503）`；
  Summary 末尾出现 `合计：19 个来源 · 正常 18 · 异常 0 · 失败 1 · ⏸ 熔断暂停 1` 与「⏸ 已暂停（熔断）」清单
  （`sed -n '/=== 数据源健康/,/^合计：/p'` 这个 CI Summary 抓取区间能抓到）。
- `node scripts/tools/build-local.js`：产物自检通过；`dist/status/index.html` 真含 `⏸ 已暂停（熔断）`、
  `⏸ 熔断暂停 1`、`暂停于 … 半开重试窗口 … circuit_open: 连续失败 5 次`；build-local 里那条
  「暂停行必须在页面上行内可见」的数据驱动断言这次**真的被触发**并通过。
- 还原后 `scripts/data/source-health.json` 的 SHA-256 与注入前一致（`5490690a…0b11`），`git status --short` 为空；
  随后用真实数据重跑 `npm run build`，最终 `dist/` 不含任何合成行。

**新增字段没有撞对账**：`pausedAt` / `pausedReason` 没有触发 build-local 的 `/status/` 逐行对账、
`coverage-targets-selftest`（200/0，随 gate:build）或 `health-selftest` 的「结构不符」——
本轮**没有**需要靠放宽断言才能过的项，§5.4 记录这次为什么门禁零变更。

## 5. 门禁变更（P3 必填）

> 用户授权的改动只有 P3 冻结表；下面逐条写「改了什么 / 为什么不算放水 / 哪条断言仍守红线」。
> 另外两处是**修复接手前就存在的基线红**（不是为了让本轮门禁变绿而放宽判据），单列在后。

### 5.1 P3-A 门禁拆锁（`.github/workflows/collect.yml` + `scripts/tools/check-ci-consistency.js`）

1. **断言 (13) 改语义 + 改名**（`FROZEN_ASSERTION_NAMES` 同步；条数仍 39）：
   - 旧：`(13) collect.yml 的门禁步骤排在提交步骤之前` —— 完整门禁必须在 `git push` 之前。
   - 新：`(13) collect.yml 的数据正确性硬门禁在提交之前、完整 gate 在提交之后且失败可见`。
   - 新判据（缺一即红）：提交前存在独立步骤 `Data correctness gate (hard — blocks the data commit)`，
     run 体**逐条包含 9 条命令**（validate --strict / check-reproducible / history-verify / migrate-audience-verify /
     provenance-selftest / history-selftest / changes-selftest / ai-selftest / fixture-test）、无步骤级 `if`、
     无 `continue-on-error`；完整 gate 的字节位置在 `git push` **之后**、带 `id: release_gate` 与
     `continue-on-error: true`；紧随其后必须有 `if: always()` 的留痕步，引用
     `steps.release_gate.outcome`、写 `$GITHUB_STEP_SUMMARY`、失败时发 `::warning`；
     原「提交步骤唯一 + 提交带齐 4 份数据文件」检查原样保留。
   - **为什么不算放水**：坏数据仍然 100% 无法入库（9 条命令一条没删、而且从"门禁内部一步"升级为
     "提交前独立硬拦"）；发布就绪失败**必须**同时满足「不阻塞入库（continue-on-error）」与
     「失败可见（always() 留痕 + outcome + Summary + ::warning）」，缺一即红。
   - **仍然守着原红线的断言**：(12) 发布链必须先过门禁（deploy prepublish 无 job 级 if、build needs prepublish、
     deploy needs build）逐字未动；deploy 的严格性没有变（发布链任何事件都不许降级）。
2. **断言 (11) 登记「自动降级」策略**：
   - 新增 `AUTO_DEGRADE_WORKFLOWS = ['collect.yml']`：collect 的 `with.allow_degraded_run` 在**所有事件**上
     必须解析成 `'true'`（自动，不再有人工勾选入口）；禁止再引用 `inputs.*`；禁止残留
     `workflow_dispatch.inputs.allow_degraded_run`（死开关即红）。
   - `deploy.yml` 仍任何事件都不许降级（逐字未动）；`verify.yml` 非人工事件仍必须 `'false'`、人工显式勾选仍必须 `'true'`（逃生口没堵死）。
   - **为什么不算放水**：降级语义从「完整门禁在提交前 ⇒ 降级会让坏数据入库 ⇒ 必须人工」变成
     「完整门禁在提交后 ⇒ 降级只影响发布就绪类检查，且必须留痕」；数据正确性由新的 (13) 前置硬拦守着。
     collect 若把降级改回 `'false'`，(11) 会红（否则一次浏览器故障会让 collect job 红 ⇒ deploy 的
     workflow_run 拒绝发布 ⇒ 2026-11-02 的停版换个位置复活）。
3. **未动的冻结表**：`FROZEN_USES`/(2)、`GATE_STEP_NAMES`/`GATE_STEP_RUN`/(10)、`action.yml`、`deploy.yml`、
   `verify.yml`、`--expect-checks=39` 均未改；(10) 的步骤体指纹逐字通过。

### 5.2 基线红修复 ①：SEO 正文余量登记「过期」退役（`scripts/lib/seo.js`）

- 现象：`selftest:seo` 红 —— `category/audio/` 登记 `count=6`、`category/image/` 登记 `count=5`，实时都是 7。
- 根因（git 历史实测）：master 基点 `ebdd0a8`（179 条）时两页是 6/5（与登记一致）；P0 的 AppSumo +23 条
  （`6badae2`，202 条）之后变成 7/7；P1（207 条）/P2（210 条）读数都停在 7/7。**不是本轮引入**。
- 处置：两页当前余量 168 / 267（均已 ≥ 150），已离开「余量 <150」射程；按 `seo-verify.js` §③′ 的
  **双向不变式**（登记集合必须等于实时余量 <150 的集合）把它们从 `TEXT_FLOOR_RESIDUALS` **退役**，
  移入 `TEXT_FLOOR_GRADUATED` 并记录退役当天读数与理由；同步 JSON 转写。
- **为什么不算放水**：正文下限公式 `textFloor(kind, count)` 一个字没动（退役记录的 `floor` 必须等于
  `textFloor` 是 selftest 的硬断言）；判据仍是「实时余量 ≥ 登记值」；变的只是「这两页还薄不薄」这个事实。
  读数：`selftest:seo` 104/0、`verify:seo` 18/0。

### 5.3 基线红修复 ②：coverage-targets 反证牙 ④ 恢复真牙（`scripts/tools/coverage-targets-selftest.js`）

- 现象：`selftest:coverage-targets` 的【反证牙·v3④】「连续失败 ≥ 3 次的来源一条裁决都没有 ⇒ 报告自检非 0」**空转**：
  它只清空裁决表，咬人前提是**真实** `source-health.json` 里恰好有一个 `consecutiveFailures >= 3` 的来源；
  当前 19 行全是 0（futurepedia 已从 collector_error 转为 zero_output），于是报告 exit 0、牙却判红。
- 处置：牙自给自足 —— 通过报告既有的 `--source-health=` 覆盖入口**注入一个同结构的合成失败来源**，让
  「连续失败 ≥ 3 ⇒ 必须有裁决」这条判据重新真的被触发。
- **为什么不算放水**：`source-rulings.js` 的判据本身一个字没动（改的是"喂给它的数据"，不是"它怎么判"）。
  修后 200/0。这是**加强**：修前这条牙永远不会响。

### 5.4 T4 没有改任何门禁判据（冻结表也没动）

- `2e8cb3b` 只改 `scripts/collect.js`、`scripts/lib/{health,report,source-rulings}.js`、
  `scripts/tools/{build-local,coverage-report,health-selftest}.js`；`git diff --stat 1f6713b..2e8cb3b -- .github` 为空，
  `.github/` 零改动。`check-ci-consistency` 的冻结表与 `--expect-checks=39` 一个字没动（集成态实跑仍 39/0）。
- `pausedAt` / `pausedReason` 是**附加字段**，没有新增第四档 status（仍是 healthy/degraded/failed）；
  `/status/` 的暂停断言是**数据驱动**的：真实心跳没有暂停行时它不触发，一旦采集写下暂停态而页面漏渲染就当场红
  （§4.6 的注入实跑证明这条牙会咬，且咬的是「页面漏渲染」而不是「字段是新增的」）。
- 因此本轮**没有**「把新增字段当成结构不符」的断言语义问题，也没有为此放宽任何判据；
  `build-local` 的 216 页 / 19 来源逐条对账、`coverage-targets-selftest` 200/0 仍全过。

## 6. BLOCKED 清单

**无。**

为什么可以写「无」：本轮验收要求的 10 条命令（§4.6 的 #1–#10）全部在集成态实跑通过；
`npm run gate` 的唯一红是 `[52] Real-browser acceptance`，属**接手前就存在**的环境限制——本机没有浏览器内核，
也没有系统 Chrome/Edge，`verify-site.js` 默认还指向 Windows Edge 路径；任务书明确不许为它改判据或跳过，
它不阻塞本轮「合入 T4 + 集成门禁 + 报告收口」的验收。没有出现「同一处问题试 3 次不过」的情形，
也没有越界改动（未 push / 未建 PR / 未动 master / `.github/` 零改动）。

## 7. 需要用户亲自判断的三件事

### 7.1 AppSumo 被筛掉的产品样本（本次 dry-run 实际 = 11 条，不是 20 条）

任务书要求 20 条，但本轮 AppSumo 两个集合页实际只筛掉 **11 条**（日志上限 20，实际没到），逐条如下
（来源 `/tmp/appsumo-dry.log`，2026-11-10 单独 dry-run）：

| # | 产品名 | 筛掉原因 |
|---|---|---|
| 1 | WPGraft | 非 AI |
| 2 | Headroom | 折扣价缺失 |
| 3 | GetTerms | 非 AI |
| 4 | Referly | 非 AI |
| 5 | Utobo Email | 非 AI |
| 6 | SCAMALYTICS | 非 AI |
| 7 | Consently | 非 AI |
| 8 | zcal | 非 AI |
| 9 | ElementsKit | 非 AI |
| 10 | MeetMouse | 原价缺失 |
| 11 | Swft Connect | 非 AI |

**请判断**：这 11 条筛得对不对？（尤其 WPGraft/GetTerms/Referly 这类"WordPress/cookie/联盟工具"被判非 AI，
以及 Headroom/MeetMouse 的"价格缺失"是否只是页面字段暂时为空、隔天可能又出现。）

### 7.2 OpenRouter「新进入免费态」的 30 天阈值是否合理

本次读数（`/tmp/leads-real.log`）：模型总数 461 · 免费（`pricing.prompt === "0"`）16 个 · **30 天窗口内 5 个**。

入选 5 个：LiquidAI: LFM3-1.7B (free)、Crouton Alpha（无 `:free` 后缀，靠 pricing=0 入选）、
Recursive: Flint (free)、XingChen: Xing4.0 29B A4B (free)、NVIDIA: Nemotron 3.5 Super VL (free)。

被 30 天窗口筛掉 11 个（全部是「免费但上线已超过 30 天」）：
Dots Studio: Dots3-Note Preview (free)、LiquidAI: LFM2.5-2.6B (free)、NVIDIA: Nemotron 3.5 Lightning (free)、
Cohere: North Mini Code (free)、NVIDIA: Nemotron 3 Ultra (free)、NVIDIA: Nemotron 3 Nano Omni (free)、
Google: Gemma 4 26B A4B (free)、Google: Gemma 4 31B (free)、Google: Lyria 3 Pro Preview、
Google: Lyria 3 Clip Preview、Free Models Router。

**请判断**：30 天是否合适？（放宽到 90 天会把 6 个三个月前的存量免费模型当「新」发；收紧到 14 天
可能漏掉「上线 3 周后才有免费路由」的模型。另一个事实：`created` 是模型进入 OpenRouter 的时间，
不等于「变得免费」的时间——代码与报告都如实标注了这一点。）

### 7.3 B 类线索全量清单（本次 1 条，用于几天后抽查误报率）

| 标题 | 来源 | 原文日期 | 链接 |
|---|---|---|---|
| 每天白赚几百 AI大模型免费薅羊毛：DeepSeek、GPT等全都有 | 快科技 | 2026-11-09 | https://news.mydrivers.com/1/1164/1164402.htm |

**请判断**：这条是否符合「B 类线索」的定义（媒体说可能有免费/降价、本站未核验）？判据是三闸同时命中
（平台名 DeepSeek/GPT + 免费 + 时间词）。另外 7 个 feed 当天 0 条是设计结果，之后若长期 0 条，
可考虑调整 `AI_PLATFORM_NAMES` / `TIME_WORDS`（判据唯一出处 `scripts/lib/lead-radar.js`）。

## 8. 没做的事 + 为什么

1. **P1 的 `benefitType: ["free_api"]` 仍未写（接上 P1 commit message 里那句「见报告」）**：
   P1 的提交 `5144293` 的 message 里写着「benefitType 未由采集器写入（check:reproducible 判据要求非策展
   六字段必须可从管线/人工声明重建，实测采集器直出会红，**见报告**）」——当时**报告并不存在**（那一轮
   没写 OVERNIGHT-REPORT）。这一条现在在这里接上：需求点名要 `benefitType: ["free_api"]`，但
   `scripts/tools/check-reproducible.js` 要求非策展条目的六字段必须能从管线重放或人工声明重建，
   采集器直出会在「剥字段重放」时判「已知值无源」。要真的补上它，需要动的**不是采集器**，而是
   `scripts/data/audience-overrides.json`（六字段的第二个人工来源，`mergeAll` 在 dedup 之前注入）
   以及随之而来的重放口径。无人值守下模型每次下架/改名都会让该文件多一条孤儿并卡死采集链，所以
   本轮**不做**；`openrouter.js` 文件头已把这段偏差与「改哪里」写清。**没有为了让它变绿去改判据**。
2. **真浏览器验收 / 回归比对未跑**：本机无内核（`playwright-core` 未安装内核、系统无 Chrome/Edge）。
   本机不装内核、不改门禁来「变绿」。CI 上的 `verify.yml`/`deploy.yml` 仍会跑完整门禁（P3 改动已通过
   `check:ci` 的冻结表核对）。
3. **未触发 GitHub Actions**：任务书明确不做；验收只到本地。
4. **未推送、未建 PR、未动 master / GitHub Secrets / ruleset**：硬约束。
5. **`deals.json` 里约 100 条 `type:"tool"`（目录站历史遗留）未动**：任务书说本轮不动。
6. **「自动降级发布」的落点说明（决断）**：collect 侧已实现「发布就绪失败不阻塞入库 + 自动降级 + Summary 留痕」；
   **实际发布放行仍由 `deploy.yml` 的 prepublish 严格门禁裁定**（该链任何事件都不许降级，(12) 未动）。
   「数据入库」≠「发布放行」：若发布就绪类在 deploy 侧仍红，线上保留上一份成功版本。这是刻意的——
   把未验证产物自动发出去的代价大于停版一次，且用户明确要求「不许顺手放宽其它断言」。
7. **AppSumo 样本数 11 < 20**：不是漏抓，是本轮页面实际只筛掉 11 条（§7.1）。

## 9. 给用户早上执行的命令

```bash
cd "/home/buguoshixc/code/AI Page"

# 1) 看这一夜的全部提交（feat/deals-supply-2026-11，不推远端）
git log --oneline 5144293..feat/deals-supply-2026-11
git status --short   # 应为空（dist/ 等为 gitignore）

# 2) 复跑关键门禁（按成本从低到高）
node scripts/tools/ai-selftest.js            # P2 线索判据 18 条在这里
node scripts/tools/fixture-test.js           # 8 份 leads feed fixture 回放
node scripts/validate.js --strict
node scripts/tools/check-ci-consistency.js   # 39 项（P3 冻结表）
node scripts/tools/check-reproducible.js
node scripts/tools/history-verify.js
node scripts/tools/health-selftest.js        # T4 熔断三条在这里
node scripts/tools/coverage-report.js
node scripts/tools/build-local.js            # 先构建，L3 需要 dist/
npm run gate:build                           # L1+L2+L3（本机可绿）
# npm run gate                               # 完整门禁；本机无浏览器会在浏览器判定步骤明确失败（预期）

# 3) 本地看线索渲染
node scripts/tools/build-local.js
grep -o '每天白赚几百[^"<]*' dist/index.html dist/changes/index.html   # 各 1 处（变化雷达 / changes 页）
grep -o '线索 · 未核验' dist/index.html dist/changes/index.html        # 徽标
# 起本地静态服务看效果：
python3 -m http.server 8080 -d dist   # 打开 http://127.0.0.1:8080/

# 4) 看数据与健康
node -e "const d=require('./deals.json');console.log(d.count, d.deals.filter(x=>x.source==='快科技'))"
node -e "const h=require('./scripts/data/source-health.json');console.log(h.sources.filter(s=>s.source.startsWith('leads_')))"
```

---

## 附录 A：本轮提交清单（时间顺序，`git log --oneline 5144293..HEAD`）

实跑于 T4 合入后（`HEAD = 2e8cb3b`，共 **12** 条）：

```text
2e8cb3b feat(health): 源级熔断 —— 连续失败自动暂停 + 半开恢复（P3）        ← T4（cherry-pick 自 f8333124）
1f6713b docs(state): 记录独立负向抽查与 TTL 真数据复查
6781d31 docs(report): 补阶段状态列、独立抽查、按提交门禁覆盖、P1「见报告」指认
a8801fd docs: 过夜报告草稿 + 状态更新（T3 收回 / 完整门禁读数）
4413273 docs(ci): 补齐 P3 门禁拆锁后的真话（README / action 描述 / verify 注释 / H9 / 采集链路图 / collect.js 头注释）
5e7d828 feat(ci): 数据正确性与发布就绪分开 —— 后者自动降级并留痕（P3）
51b54a7 fix(gate): 修两处基线既有红 —— SEO 余量登记退役 + coverage-targets 反证牙注入失败源
401d7fa docs: 过夜状态更新（T1.3 行为级核验）
cbc514b data: P2 线索雷达首轮实跑落盘（1 条线索）
4ffd68a feat(collector): B 类资讯线索雷达（P2）—— fixture + 判据自测 + 清理假陈述
27404e3 docs: 过夜施工状态文件（T0 基线）
327bc15 WIP: P2 线索雷达在制品（验证前快照）
```

> 本报告自身的收尾提交（`docs: 过夜报告收口 —— T4 熔断合入、门禁读数、BLOCKED 与附录`）是清单之后的**下一条 HEAD**；
> 报告无法记录自己的 SHA，故以这条说明代替（早上跑 `git log --oneline -1` 即可看到）。

## 附录 B：已知限制 / 给下一轮的提示

1. **本机无浏览器内核**：`npm run gate` 的 `[52] Real-browser acceptance`（及其后的 `[53]`/`[54]`、L4/L5）在本机必然红/未执行。
   `verify-site.js` 默认找 Windows Edge（`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`），本机既没有该路径、
   也没有系统 Chrome/Edge、也未安装 playwright 内核。**没有为它改判据**；真浏览器验收只能在 CI（`verify.yml` / `deploy.yml`）跑。
2. **worktree 未清理**：`.worktrees/p3b-health`（分支 `wip/p3b-health-v2`，HEAD 仍 `f833312`）按任务书**保留作原始证据**；
   本轮 T4 是 cherry-pick（新提交 `2e8cb3b`）不是 merge，分支与 worktree 都没删。`.worktrees/p3a-gate` 与 `.agents/worktrees/*`
   是更早的工位，本轮未动。**可以清的时候**：确认 `2e8cb3b` 已完整、门禁全绿后再 `git worktree remove .worktrees/p3b-health`，
   分支 `wip/p3b-health-v2` 仍建议保留到下次确认。
3. **`wip/p3b-health-v2` / `.worktrees/p3b-health` 没有 T4 门禁读数**：其 `OVERNIGHT-STATE.md` 停在 2026-11-10 00:50 的基线红修复记录；
   §4.6 的读数全部是本轮在集成态（`2e8cb3b`）补跑的。下一轮若要看 T4 的原始 selftest 设计，读该 worktree 的
   `scripts/tools/health-selftest.js` §7，但**不要把它当集成态证据**。
4. **暂停态渲染证据来自一次合成注入**：真实 `source-health.json` 暂无 `pausedAt` 行；§4.6 的 collect `/status/` 证据是
   临时注入 `futurepedia` 暂停行后实跑、随后按 SHA-256 校验还原的（不是真实采集结果）。真实暂停要等线上真的连续 5 次抛错才会出现。
5. **熔断会让「来源数分母」变小**：collect 用 `runnable`（去掉暂停跳过）作为失败计数分母，`--force`/零产出退出语义未变；
   读日志时别把「⏸ 本轮跳过」误读成「今天失败」。
6. **T4 阈值是代码常量**：`CIRCUIT_FAILURE_THRESHOLD = 5` / `HALF_OPEN_AFTER_DAYS = 3` 写在 `scripts/lib/health.js`，不是配置项；
   调它们要改代码 + 同步 `health-selftest` §7 断言。本轮按任务书**没有调**这两个数。
7. **未触发 GitHub Actions、未 push / 未建 PR / 未动 master / 未改 GitHub Secrets / ruleset**：硬约束，验收只到本地。
8. **`dist/` 是构建产物（gitignore）**：本轮最后一次 `npm run build` 用的是真实数据；报告里的 216 页 / 632.7 KB 是这次构建读数。
