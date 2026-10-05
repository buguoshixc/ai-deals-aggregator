# coverage-depth-v1 · t9 独立验证报告（独立重算 / 逐条忠实度稽核 / Mutation M1–M15 / 源可靠性反证）

- 任务：t9（`verification`）。基线 `ff86368e6d12d1ef57b2f51aa2c957c01d2a9ed8`；worktree `.worktrees/coverage-depth-v1`。
- 本任务**只写本目录**（`research/_raw/coverage-depth-v1/verification/`）：不 require、不修改任何被测模块。
- 读数时间窗（本机 Asia/Shanghai）：**2026-10-05 11:53 → 12:40**；对应 UTC 时间戳见各节。

## 0. 独立性声明（这份读数凭什么算"独立"）

| 项 | 做法 |
| --- | --- |
| 禁止 require 的模块 | `scripts/lib/coverage-targets.js`、`scripts/lib/model-freshness.js`、`scripts/tools/coverage-report.js` —— **一个都没有 require** |
| 独立重算脚本的 require 清单 | 只有 `fs` / `path` / `crypto`（`independent-recompute.cjs`）；抽查见 §1 的 `independence.requiredModules` |
| 允许复用的"权威数据表"（两层不同层） | ① `index.html` 的 `VENDOR_RULES` 数组字面量（厂商归一的唯一权威，文本切片求值，不过 render-core）；② `scripts/lib/model-freshness.js` 源码里的窗口天数（正则读**源码文本**，不 require）。**判据代码全部自己重写**，只认原文常数 —— 硬编码一份阈值副本等于造第二套真相 |
| 判「红」的纪律 | 变异测试用**增量**：先跑 pristine 基线，再看**新增失败**。当前树上本来就有红的 gate（见 §6 F1/F2），不减基线会把它们记成"抓到了" |
| 变异纪律 | 只在 `%TEMP%` 沙箱副本上改文件；每条变异前后 `restore + sha256` 校验（byte-exact）；共享工作区前后对 12 个受监控文件贴哈希 |

## 1. 独立重算 vs `report:coverage`（逐项对照，0 差异）

命令：`node independent-recompute.cjs`（读数 `independent-recompute.json`，log `logs/independent-recompute.txt`）。
输入哈希（pinned，两次 --json 之间 `输入漂移=0 处`）：`scripts/data/models.json 386E6E81…`、`coverage-targets.json 29EB1A71…`、`model-registry-gaps.json 25635FED…`、`model-registry-links.json 99D9C9E7…`、`source-health.json F782626E…`、`source-rulings.json 65FCE6F8…`、`providers.json 8180CCDB…`、`models.json CE69F006…`、`api-plans.json ACEBDE3A…`、`plans.json 1668D19C…`、`deals.json FE063BC9…`。

| 指标 | 独立重算 | report:coverage | 一致 |
| --- | --- | --- | --- |
| registry 条数 | 51 | 51 | ✅ |
| `releasedAt` known / unknown / unparsable | 32 / 19 / 0 | 32 / 19 / 0 | ✅ |
| 带 releaseEvidence | 32 | 32 | ✅ |
| 「有日期 ⇔ 有引文」充要 | 违反 0 条（两个方向都空） | 报告只印两个数，未立判据 | ✅（更强的独立断言） |
| catalogStatus 分布 | current 29 / aging 2 / legacy 1 / historical 0 / unknown 19 | 同 | ✅ |
| 与**发布产物** catalogStatus 逐条比对 | 51 条 **0 不一致** | — | ✅（独立复算派生字段） |
| Target 七态（136 格） | COVERED 79 / PARTIAL 0 / MISSING 0 / DEFERRED 3 / UNVERIFIABLE 2 / NOT_APPLICABLE 52 / BLOCKED_SOURCE 0 | 同（报告把 0 值键也印出来） | ✅ |
| 逐格状态（136 格） | — | — | **0 处不一致** |
| current targets 兑现 | 86 / 86 | — | ✅ |
| Registry 映射闭合 | 未映射模型 `[]`；link 问题 0；声明问题 0 | `unmappedModels: []` | ✅ |
| API 记账方程 A+B+C | 92 + 16 + 0 = **108** = 总计价条目 108 | `mappedApiEntries 92 / declaredApiEntries 16 / unmappedModelCount 0 / modelPricingItems 108` | ✅ |
| 声明行数 vs 展开 identity 数 | rows 16 / identities 16（通配 0）；`identities >= rows` ✅ | `declaredApiEntryRows.length 16` / `gaps.declaredApiEntryCount 16` | ✅（今天相等**只是因为**没有 `variant:null` 通配，见 §6 F3） |
| source health 普查 | 9 行 / healthy 8 / failed 1 / generatedAt `2026-10-04T16:31:52.051Z` | 同（`healthRowCount 9`） | ✅ |
| cf≥3 是否有裁决 | cf≥3 = `[futurepedia]`，缺裁决 `[]` | 对账问题 0 处 | ✅ |

**唯一的差异是"形状"而不是读数**：报告会打印 0 值状态键（PARTIAL/MISSING/BLOCKED_SOURCE），独立重算只统计出现过的状态；
补零后逐键相等（`compare()` 里已显式注明这一条，没有把它抹平）。

## 2. Release Date 独立稽核（32 条有日期；28 条本轮新增 **全部已核**）

命令：`node release-audit.cjs`（读数 `release-audit.json`，log `logs/release-audit.txt`）。
判据（逐条跑）：C1 证据形状 → C2 引文非纯形态（≥20 字符）→ C3 引文真含该日期（ISO / `2026/9/1` / `Sep 1, 2026` / `2026年9月1日` 等写法）→ C4 `sourceUrl` host ∈ 该 developer 的 `officialDomains`（后缀匹配）→ C5 身份信号 → C6 **逐字命中**：引文（解转义 + 两个视图）必须能在现场抓取页里命中：
- `visible` 视图 = 剥掉 `<script>/<style>` 与标签的可见文本；
- `source` 视图 = **保留**内嵌 JSON 的页面源码（OpenAI/Kimi 这类把日期写在页面数据里）；
- 命中方式分三档并**逐条印出来**：整段逐字 / 分段逐字（表格行拼接）/ 逐 token ≥85%（复合引文）。

| 分类 | 条数 | 说明 |
| --- | --- | --- |
| **已核** | **30** | 其中 28 条 = 本轮新增（全部）；2 条 = 基线 |
| 已核（引文未自证） | 2 | 基线 4 条里的 deepseek-flash / deepseek-v4-pro：**日期在官方页同日标题行**（`id="date-2026-09-10"` / `id="date-2026-08-13"`，与 `releasedAt` 逐字相同），但 `releaseEvidence[].quote` 只引了正文段落、**不含日期** ⇒ 引文不自证（见 §6 F5） |
| 无法复核 | 0 | 初版 8 条"无法复核"经排查**全部是匹配器的问题**（当时只看 visible 视图 + 未解 JSON 转义 + 未剥 `「」`/`###`），修好后 28/28 命中：`gpt-6-astra`/`gpt-6.1-sol`/`kimi-k2.7-code` 整段命中于 `raw/*#source`，`hunyuan-translation`/`minimax-m3` 逐 token 命中于 `raw/*#visible`，两条 360 条目命中于 live#visible |
| 不采信 | **0** | 本轮新增里没有一条属于此类 |

逐字命中的原件来源（样本，全部 32 条见 JSON）：`raw/bigmodel-new-releases.html`、`raw/google-gemini-changelog.html`、`raw/anthropic-news-index.html`、`raw/oai-gpt6-astra.html#source`、`raw/kimi-res-k27code.html#source`、`raw/minimax-release-notes.html`、`raw/tencent-hunyuan-pricing.html`、`live#visible`（两条 360 条目）。

**核验渠道与身份信号（机器读数）**：

| 项 | 取值 |
| --- | --- |
| 命中渠道 | `raw#visible` **27** · `raw#source` **3** · `live#visible` **2**（合计 32 = 全部有日期条目） |
| `capturedAt` 分布 | `2026-10-05` **28** 条（本轮新增）· `2026-10-04` **4** 条（基线） |
| 引文含身份信号（canonicalName / slug 词，NFKC 归一后比对） | **32 / 32**（本轮新增 28 / 28）→ 「确认 identity」这一项对全部条目成立 |
| 日期语义 | 逐条按官方页上下文确认：GA/发布日（Google changelog、智谱更新日志、Anthropic Newsroom）／模型表「版本更新时间」列（腾讯云）／页面自带 `publicationDateText`/`datePublished`（OpenAI、Kimi）／「更新于」与「今天正式推出」同屏（Kimi K3）／同一条发布记录并列点名（MiniMax M2.7 与 Highspeed） |

**匹配器的三次修正（这也是"忠实度稽核"的一部分，记下来免得后来者重踩）**：
① 只看 visible 视图 → 内嵌 JSON 里的日期引文判负（OpenAI/Kimi）；
② 未解 `\"` / `\uXXXX` 转义 → 同一批引文判负；
③ 未剥引文装饰（`「」`、行首 `###`）→ 表格行/标题行拼接的引文判负。
三处修好后，初版 8 条"无法复核"**全部转为已核**；也就是说：**没有任何一条新增日期是"核不了"的**。

### 2.1 本轮新增的 28 条日期清单（供逐条核验；完整出处见 `release-audit.json#newDatesList`）

| slug | releasedAt | 出处（evidence[].sourceUrl） | 判定 |
| --- | --- | --- | --- |
| claude-fable-5.1 | 2026-09-01 | anthropic.com/news | 已核（分段逐字 @ raw） |
| claude-haiku-4.5 | 2025-10-15 | anthropic.com/news/claude-haiku-4-5 | 已核（分段逐字 @ raw） |
| claude-opus-5.5 | 2026-09-22 | anthropic.com/news | 已核（分段逐字 @ raw） |
| claude-sonnet-5.5 | 2026-09-28 | anthropic.com/news | 已核（分段逐字 @ raw） |
| gemini-3.5-flash | 2026-05-19 | ai.google.dev/gemini-api/docs/changelog | 已核 |
| gemini-3.6-flash | 2026-07-21 | 同上 | 已核 |
| gemini-3.7-flash | 2026-08-13 | 同上 | 已核 |
| gemini-3.8-flash | 2026-09-02 | 同上 | 已核 |
| glm-5.3 | 2026-08-19 | docs.bigmodel.cn/cn/update/new-releases | 已核 |
| glm-5.3-flash | 2026-08-26 | 同上 | 已核 |
| glm-4.7-flash | 2026-01-19 | 同上 | 已核 |
| glm-5v-turbo | 2026-04-02 | 同上 | 已核 |
| glm-4.6v | 2025-12-08 | 同上 | 已核 |
| glm-4.5v | 2025-08-11 | 同上 | 已核 |
| hunyuan-a13b | 2025-06-25 | cloud.tencent.com/document/product/1729/104753 | 已核 |
| hunyuan-role-latest | 2025-09-24 | 同上 | 已核 |
| hunyuan-translation | 2025-10-14 | 同上 | 已核（逐 token 100%） |
| hunyuan-translation-lite | 2025-06-06 | 同上 | 已核 |
| tencent-hy-vision-1.5-instruct | 2025-12-17 | 同上 | 已核 |
| gpt-6-astra | 2026-09-03 | openai.com/index/gpt-6-astra/ | 已核（整段逐字 @ raw source；live 403） |
| gpt-6-luna | 2026-09-22 | openai.com/index/gpt-6-astra/ | 已核（整段逐字 @ raw） |
| gpt-6.1-sol | 2026-09-29 | openai.com/index/introducing-gpt-6-1-sol/ | 已核（整段逐字 @ raw source；live 403） |
| kimi-k3 | 2026-07-17 | kimi.com/news/kimi-k3 | 已核 |
| kimi-k2.7-code | 2026-06-13 | kimi.com/resources/kimi-k2-7-code | 已核（整段逐字 @ raw source） |
| minimax-m2.7 | 2026-03-18 | platform.minimax.cn/docs/release-notes/models | 已核 |
| minimax-m2.7-highspeed | 2026-03-18 | 同上 | 已核 |
| 360zhinao-pro | 2026-08-05 | ai.360.com/open/zh/models/360zhinao/360zhinao-pro | 已核（分段逐字 @ live） |
| 360zhinao-turbo-llm-geo | 2026-08-24 | ai.360.com/open/zh/models/360zhinao/360zhinao-turbo-llm-geo | 已核（分段逐字 @ live） |

> 两个 **live 403** 不是证据问题：`openai.com` 对本机出口返回 403（与 t4 记的 futurepedia 属同一类"本机出口受限"现象），
> 而 Workstream A 留存的 raw 原件里**整段逐字命中** `#source` 视图 —— 这正是"先查原件、再联网"的价值。

## 3. Mutation M1–M15（TEMP 沙箱 / byte-exact restore / 增量判红）

命令：`node mutations.cjs`（读数 `mutations.json`，log `logs/mutations-final.txt`；上一轮 9-gate 读数在 `logs/mutations-full2.txt`）。
沙箱：`%TEMP%/t9-mutation-sandbox`；pristine：`%TEMP%/t9-mutation-pristine`（每次变异前 restore 并校验哈希）。
九个 gate 每个变异都跑：`coverage-targets-selftest` · `model-freshness-selftest` · `models-selftest` · `models-page-selftest(--allow-missing-dist)` · `api-plans-selftest` · `analytics-selftest(--allow-missing-dist)` · `coverage-report` · `validate --strict` · `history-verify`。

按**增量**判红（pristine 基线里 `models-selftest` / `models-page-selftest` 本来就是红的，先减掉它们）：

| 变异 | 做了什么 | 预期 | 实际抓到它的 gate | 派生字段观测 | restore |
| --- | --- | --- | --- | --- | --- |
| **M1** | 删掉一条 `releasedAt` 的 `releaseEvidence` | 必红 | `models-selftest` + `models-page-selftest` + `validate --strict` | — | byte-exact |
| **M2** | `releasedAt = '2026-10'`（非法日期） | 必红 | `coverage-targets-selftest` + `models-selftest` + `models-page-selftest` + `coverage-report` + `validate` | — | byte-exact |
| **M3** | 证据 `sourceUrl` 换成第三方域 | 必红 | `models-selftest` + `models-page-selftest` + `validate`（官方域守卫） | — | byte-exact |
| **M4** | 引文换成人造文本（与日期无关） | 预期盲区 | **（无）** | — | byte-exact |
| **M5** | `releasedAt = null` + 清空引文 | 派生必须是 `unknown`（不是 `legacy`） | **（无 gate 红）** | `unknown` ✅（不变量成立） | byte-exact |
| **M6** | `firstSeen` 改成 2020-01-01 | 不应影响新鲜度 | **（无 gate 红）** | `current` ✅（未受影响） | byte-exact |
| **M7** | 跨 `modelRole` 塞进同一 `freshnessGroup` | 看会不会跨档互淘汰 | **（无）** | `current`（窗口宽，未翻档；**无断言在盯**） | byte-exact |
| **M8** | 删掉被 current target 声明的 api 计价行 | 掉档可见 | `coverage-targets-selftest` + `models-selftest` + `models-page-selftest` + `coverage-report` + `validate` | 该格掉档 | byte-exact |
| **M9** | 源码：DEFERRED 分支失效（延期掉进 MISSING） | 必红 | `coverage-targets-selftest` | — | byte-exact |
| **M10** | 源码：PARTIAL 当 COVERED | 必红 | `coverage-targets-selftest` | — | byte-exact |
| **M11** | 给仍在注册表里的来源写 `retire` | 必红 | `coverage-targets-selftest` + `coverage-report`（对账） | — | byte-exact |
| **M12** | 删掉历史 Deal（模拟"retire 顺手删数据"） | 必红 | `history-verify` | — | byte-exact |
| **M13** | 把一个 registry 模型置 `retired` | 必红 | `models-selftest` | `historical` | byte-exact |
| **M14** | 把已映射的 registry 模型置 `retired`（API Pricing 侧） | 必红 | `models-selftest` | `historical` | byte-exact |
| **M15** | 源码：在 guard 区块**之外**塞一个 `fetch()` 帮助函数 | 预期盲区 | **（无）** | — | byte-exact |
| **M15b**（加强版，非契约要求） | 把 `fetch()` 塞进会被逐字内联到页面的 `ANALYTICS-GUARD` 区块 | 必红 | `analytics-selftest` | — | byte-exact |

汇总：**抓到 10/15**（含 M15b 则 11/16）；**byte-exact restore 全部成功**（每条变异后沙箱与 pristine 逐文件哈希相同）；**共享工作区 12 个受监控文件漂移 `[]`**。

### 3.1 盲区逐条交代（禁止写"Mutation 全覆盖"）

| 盲区 | 为什么没被抓住 | 属于哪一类 | 危害评估 |
| --- | --- | --- | --- |
| **M4** 引文与日期无关 | 现有牙只查"证据存在 / 域名 / 日期可解析"，**没有一条牙把 quote 与官方页面对照**（本轮 `release-audit.cjs` 能抓，但它是验证工件、不是仓库门禁） | **断言缺失** | 中：引文可以变成任何文字而门禁全绿；见 §6 F4 |
| **M5** `releasedAt=null` | 变更是**合法数据操作**，本就不该报红；该盯的是"不许被派生 legacy"——实测派生 `unknown` ✅ | **自指盲区（判据本身正确）** | 无：不变量成立，记为正向保修 |
| **M6** `firstSeen` 混入新鲜度 | 同上：`firstSeen` 不是发布日，改了不影响派生（实测 `current` 不变） | **自指盲区（判据本身正确）** | 无：正向保修 |
| **M7** 跨 role 同组 | `freshnessGroup` 是**人工显式**覆盖，组档位取 `members.map(role).sort()[0]`（`lib/model-freshness.js:482-484`）——**没有断言**要求同组成员同 role/同档 | **断言缺失** | 低-中：人工写错一个组键，跨档两条记录会互相淘汰且没人报红；见 §6 F6 |
| **M15** guard 之外的散落网络调用 | 现有牙盯的是 guard 区块（vm 白名单宿主，见 M15b 已抓）+ 产物扫描 + secret-scan；**没有**扫 `lib/analytics.js` 其余部分是否出现网络原语 | **断言缺失（低危）** | 低：那是构建期路径（页面内联只走 guard 区块，M15b 证明那条被盯住了） |

> 方法论备注：本轮同时证明了"**gate 集合本身**也是被测对象" —— 第一版 9 条 gate 里漏了 `analytics-selftest` 与 `models-page-selftest`，
> 于是 M15 与 M13/M14 的判读完全不同；补齐 gate 后 M15b 被抓、M13/M14 的"抓到"从 1 个 gate 变成 2 个。**变异矩阵的可信度取决于 gate 集合写全**。



## 4. 源可靠性结论的时间敏感反证

命令：`node source-reliability-counterproof.cjs --rounds=3`（读数 `source-reliability-counterproof.json`）。

| 侧 | 读数 |
| --- | --- |
| **CI 侧**（`git log -- scripts/data/source-health.json` 逐次重建） | 19 次读数：healthy **4** / failed **15**；**当前连续失败 10 次**（`2026-09-30T04:09:07.964Z` → `2026-10-04T16:31:52.051Z`）；盘上 `generatedAt=2026-10-04T16:31:52.051Z`（sha256 `F782626E…ABF80`），futurepedia `cf=10`、`lastError=HTTP 403` |
| **本机侧**（本刻真跑 3 轮 `collect.js --dry-run --only=futurepedia`） | 2026-10-05T04:34:07.021Z / 04:34:15.673Z / 04:34:22.389Z：**3/3 成功，每轮 7 条**，exit=0 |
| 盘上裁决（`scripts/data/source-rulings.json`，reviewedAt=2026-10-05） | `futurepedia = keep-degraded`，`revisitBy` 2026-10-19 + 四条升级触发条件 |
| cf≥3 的来源 | **只有 `futurepedia`**（其余 8 个在两套读数里 cf 恒为 0 ⇒ 不补裁决是对的） |

**结论**：`observed unstable（跨环境观测不一致）` —— 两侧读数分开、都带时间戳；这是**当次观测**，
不写 "已恢复"、也不写 "来源坏了"。裁决的复查窗口与升级触发条件已经写在盘上裁决里，可复核。

## 5. Verify 命令读数（契约四条 + 旁证）

| 命令 | exit | 读数 |
| --- | --- | --- |
| `node research/.../independent-recompute.cjs` | 0 | 20 项对照 **0 项不等**；136 格状态 **0 差异**；catalogStatus **0 差异**；方程 A+B+C=108 ✅ |
| `node research/.../mutations.cjs` | 0 | **抓到 11/16**（M1–M15 + 加强版 M15b）；byte-exact restore 全部成功；共享工作区漂移 `[]` |
| `node scripts/tools/coverage-report.js` | 0 | `报告自检问题：0 处` / `✅ 覆盖报告自检通过` |
| `node scripts/validate.js --strict` | 0 | `✅ 校验通过（strict 模式）`；API 计费 24 条 / 计价条目 108；覆盖意图 34 行 |
| 旁证：`coverage-report.js --json` 双跑 | 0 | run1 = run2 = `A32BB02FB6D4BAEE3641BA343BB6190D5DEF34F428C55140C4813DFF0875D3C4`（byte-identical，输入漂移 0 处） |
| 旁证：`models-selftest.js` | **1 → 0** | **12:35 读数：141 通过 / 3 失败（exit 1）**；**12:48 复读：148 通过 / 0 失败（exit 0）** —— 并发成员在取证窗口后修掉了（§6 F1 有时间戳） |
| 旁证：`models-page-selftest.js --allow-missing-dist` | **1** | 90 通过 / **2 失败**（§6 F2）；12:48 复读仍红 |
| 旁证：`analytics-selftest.js --allow-missing-dist` | 0 | 17 项 / 0 失败 |
| 旁证：`history-verify.js` | 0 | 历史可重建 |

## 6. Findings（按题面分类；每条给 id / severity / problem / file / line / requiredFix）

### REPAIR_NOW（不进 Full Gate 就过不去）

**T9-F1 · severity high · `models-selftest.js` 三条断言是**硬编码的旧数字**（读数窗口内为红：141 通过 / 3 失败）**
- **状态更新（带时间戳）**：本任务取证时（**2026-10-05T12:35–12:46**）该 gate `exit=1`、3 条失败；**12:48 复读已变绿（148 项通过 / 0 失败）** —— 并发成员在我取证窗口之后把它修掉了（`scripts/tools/models-selftest.js` 哈希从变异基线时的值变为 `46A92AB8E729E0F9…`）。本 finding 作为**时间戳化的观测**保留：它证明"当前树上曾经红过、且根因是硬编码期望"，修复本身的判据归该文件的写域。
- problem：`44 个模型全部 active` 期望值（实测 51）／`API 侧声明` reason 全部是 off-registry-model（实测 16 条里已混入 series/pool/multi-model/non-text-resource）／`declaredApiEntries 逐条留档（12 条）`（实测 16）。
- file/line：`scripts/tools/models-selftest.js:518`、`:892`、`:1030`（读数 `logs/baseline-models-selftest.txt`）。
- requiredFix（若仍有残留）：把三处期望改为从数据**派生**（`Object.keys(table).length`、按 reason 分组断言、`apiDecl.length`），别再把数字写死。**不属 t9 写域**（`scripts/**` out of scope）。

**T9-F2 · severity high · `models-page-selftest.js` 两条断言红（90 通过 / 2 失败；12:48 复读仍红）**
- problem：① `索引页的行集合与次序逐字等于发布数据集的 slug 序列` —— 实测"缺 无 · 多 无"，即**集合相同、次序不同**（要么页面行序生成有漂移，要么期望序列该更新）；② `独立重算：10 个 registry 模型存在"一条映射覆盖多个真实 variant"（应为 9 个）` —— 实测 10 条：`ernie-5.1 · glm-4.5v · glm-4.6v · glm-4.6v-flashx · glm-5v-turbo · gpt-6-astra · gpt-6-luna · gpt-6.1-sol · minim…`（完整清单见 JSON）。
- file/line：`scripts/tools/models-page-selftest.js:249`、`:549`。
- requiredFix：① 若为行序漂移 → 修生成侧排序；若为期望更新 → 同步期望并写清依据；② 判定第 10 条（新出现的多 variant 映射）是**合法的**（例如 t8 新增身份带来的合法映射）还是误映射；无论哪种，**期望值 9 必须改**（或把该断言改成对每个映射逐条核验）。

### GUARDRAIL（当前绿、但只在特定数据形态下才绿）

**T9-F3 · severity medium · t25 clause 2 把两个**不同语义**的量拿来比**
- problem：`coverage-targets-selftest.js:714` 的 `registryBlock.declaredApiEntries === gapsBlock.declaredApiEntryCount` ——
  左边是**展开后的计价条目数（方程的 B）**，右边是**声明行数**；两者只在"没有 `variant:null` 通配声明"时相等。
  独立重算实测：B=16、rows=16、`identities >= rows` ✅（今天相等纯属巧合，通配声明一进来就假红）。
- file/line：`scripts/tools/coverage-targets-selftest.js:712-721`（`legacyT25Problems`）。
- requiredFix：换成一般成立的关系式 —— `rows.length === gaps.declaredApiEntryCount` ∧ `B >= rows.length` ∧ 方程 `A+B+C=items` 保留，并补一条 `variant:null` 通配声明的定向夹具（t12 正在做，本条是**独立复核结论**，与其重跑读数一致）。

**T9-F4 · severity medium · 没有一条仓库牙把 `releaseEvidence[].quote` 与官方页面对照（M4 盲区）**
- problem：把引文换成任意文本、日期照留，所有 gate 全绿（M4 实测）。本轮新增的 28 条日期之所以可靠，靠的是**人工式复核**（`release-audit.cjs`），而不是门禁。
- file/line：`scripts/data/models.json`（证据字段）+ 缺牙位置：`scripts/tools/models-selftest.js` 的 releaseEvidence 一节。
- requiredFix：加一条可机器判定的最小牙：`releasedAt != null ⇒ 至少一条 evidence 的 quote 里出现该日期的某种写法`（ISO / `2026/9/1` / `Sep 1, 2026` / `2026年9月1日`）；页面级逐字命中可留作人工/离线稽核（本目录的 `release-audit.cjs` 可直接复用）。

**T9-F5 · severity medium · 两条基线条目的引文**不含日期**（日期在页面同日标题行，引文不自证）**
- problem：`deepseek-flash`（2026-09-10）与 `deepseek-v4-pro`（2026-08-13）的 `releaseEvidence[].quote` 只引正文段落。
  实测官方页 `https://api-docs.deepseek.com/updates` 的 `<h2 id="date-2026-09-10">Date: 2026-09-10</h2>` /
  `<h2 id="date-2026-08-13">Date: 2026-08-13</h2>` 与 `releasedAt` **逐字相同** ⇒ 日期**有据**，但引文本身不能自证（人复核必须多跳一步；T9-F4 的牙一旦落地，这两条会立刻红）。
- file/line：`scripts/data/models.json` → `deepseek-flash.releaseEvidence[0].quote`、`deepseek-v4-pro.releaseEvidence[0].quote`。
- requiredFix：把同日 `Date:` 标题行并入 quote（并更新 capturedAt），或（若坚持只引正文）在 `note` 里写明"日期取同页 Date 标题行，见 id=date-…"。

**T9-F6 · severity low · 跨 modelRole 共用 `freshnessGroup` 没有断言（M7 盲区）**
- problem：显式 `freshnessGroup` 会把不同档的模型放进同一比较组，组档位取 `members.map(role).sort()[0]` —— 写错一个组键，慢周期模型会被快档窗口淘汰，且没有任何 gate 报红（M7 实测无红）。
- file/line：`scripts/lib/model-freshness.js:482-484`（组档位）与 `:362-378`（组键）。
- requiredFix：加一条断言：同一组内成员的 `modelRole → tier` 必须一致（或显式声明"本组跨档且有理由"）；至少让跨档组在报告里可见。

### DESIGN_ACCEPTED（实测证明判据本身是对的，不改）

**T9-F7 · severity info · M5 / M6 的"没红"是**正确行为**，记为正向保修**
- `releasedAt=null` ⇒ 派生 `catalogStatus=unknown`（**不是** legacy），符合"unknown ≠ 淘汰"的不变量；
- `firstSeen` 改动对新鲜度**零影响**，符合"只认 releasedAt"的口径。

### VERIFY（读数与方法学留痕）

**T9-F8 · severity info · gate 集合本身是可被漏写的被测对象**
- 第一版 gate 集合漏了 `analytics-selftest` 与 `models-page-selftest`，导致 M15 的判读与 M13/M14 的"抓到几个 gate"都不同；补齐后结论变化已记录在 §3.1。
- requiredFix（流程）：变异矩阵必须**先固定并公开 gate 集合**，再跑变异；否则"覆盖率"是 gate 集合的函数。本任务已在 `mutations.json#gates` 里公开 9 条 gate 清单。

### DOC

**T9-F9 · severity low · 现场原件命名会误导复核者**
- problem：Workstream A 留存的 `research/_raw/coverage-depth-v1/release-evidence/raw/test-deepseek-updates.html` 是**真实官方页原件**（内容与 live 页一致），但 `test-` 前缀看起来像测试残留。
- file/line：`research/_raw/coverage-depth-v1/release-evidence/raw/`（文件名）。
- requiredFix：改名为 `deepseek-updates.html`（或加一行 README 说明命名规则）。

### NOT_REQUIRED

**T9-F10 · severity info · 「本地 Analytics 零请求」在页面路径上没有缺口**
- M15b 实测：把 `fetch()` 塞进 `ANALYTICS-GUARD` 区块 ⇒ `analytics-selftest` 当场红（guard 在 vm 沙箱里只有白名单宿主）。
  唯一没被覆盖的是"guard 之外的散落网络原语"（构建期路径），危害低，见 §3.1 M15 行。


## 7. 复跑指引

```powershell
node research/_raw/coverage-depth-v1/verification/independent-recompute.cjs
node research/_raw/coverage-depth-v1/verification/release-audit.cjs
node research/_raw/coverage-depth-v1/verification/mutations.cjs --fresh
node research/_raw/coverage-depth-v1/verification/source-reliability-counterproof.cjs --rounds=3
node scripts/tools/coverage-report.js
node scripts/validate.js --strict
```

## 8. 边界与未覆盖项（不许假装覆盖）

- 本任务**不修**任何东西（`scripts/**` 全在 out of scope）：findings 只给"哪条断言/哪个数字要改"，落地归各自的写域。
- `coverage-report.js --json` 的纯 JSON 需要从混合 stdout 里按花括号配对切出来（`extract-report-json.cjs`）；t1/t6 用的是 spawnSync fd 重定向，两种捕获方式的字节可比性已在 §5 用双跑 sha256 交叉验证。
- Mutation 覆盖的是**九个 gate + 十五个变异**：抓不到的（见 §3 盲区）不等于"没有别的东西抓得到"，也不等于"该变异无害"。
- 本机无 `dist/` 产物：涉及构建产物的 gate 用 `--allow-missing-dist`（只跑数据层判据），**产物层**（页面路由、bootstrap）本轮未验证 —— 那属于 Full Gate / 部署期。
- 拒答一条："Mutation 全覆盖" —— 本轮实测是 **11/16 抓到、5 条盲区（M4 / M5 / M6 / M7 / M15）**，盲区逐条写在 §3.1。
- 目录归属说明：`research/_raw/coverage-depth-v1/verification/review-t1/` **不是本任务的产物**（是 verifier-auditor 的 t1 审查现场，落在同一目录下）；本任务的产物是本文档、`*.cjs` 探针、`*.json` 读数、`logs/` 与 `hashes-artifacts.txt`。`hashes-artifacts.txt` 为目录全量清单，含对方文件是刻意的（便于复核者核对整目录）。
