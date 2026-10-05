# coverage-depth-v1 · Workstream A：Model Release Evidence 取证报告

- 任务：t2（Workstream A）· 工作区：`.worktrees/coverage-depth-v1` · 基线：`origin/master ff86368`
- 取证日（`capturedAt`）：**2026-10-05**（本轮所有官方页的现场抓取日；抓取原件存 `research/_raw/coverage-depth-v1/release-evidence/raw/`）
- 结果：`releasedAt` 已知 **4 → 30**（新增 26 条）；`catalogStatus` 派生结果 `current=27 · aging=2 · legacy=1 · historical=0 · unknown=14`
- 身份零 churn：只动了现有条目的 `releasedAt` / `releaseEvidence` / `note` 三个字段；slug / id / canonicalName / developer / owner / family / status / modelRole / aliases 一个字节未改；未新增任何 registry 身份。

## 1. 确定性 Release Evidence 队列（规则原文）

队列生成器：`research/_raw/coverage-depth-v1/release-evidence/queue.cjs`（只读输入，输出 `queue.json`；可复跑：`node research/_raw/coverage-depth-v1/release-evidence/queue.cjs <worktree 绝对路径>`）。

排序键**逐级**如下（每一级都有确定平局裁决，输出与输入顺序无关）：

1. **unknown 优先** —— `releasedAt` 为空（缺日期）的排在已知日期之前（本轮目标就是把 unknown 压低）；
2. **可比组规模降序** —— `comparableGroupSize` 取自 `scripts/lib/model-freshness.js` 的 `deriveCatalog()`（不在这里重算一份分组）：大组补一条日期会连带同组多条一起判档；
3. **provider tier：core > major > long-tail > 未登记** —— tier 取自 `scripts/data/coverage-targets.json`；优先取该 provider 的 `model-developer` 目标档位，该 provider 只登记了别的 role（如火山引擎登记为 `inference-platform`）时取其 coverage-target 档位本体 —— 档位是"这家平台在覆盖优先级里的位置"，与它做不做第一方模型无关；
4. **是否被 api-plans / plans 引用** —— `scripts/data/model-registry-links.json` 里该 slug 的引用条数降序（有引用的先做）；
5. **slug code-unit 升序** —— 用 `a < b` 的 JS 字符串序，**不是** `localeCompare`（避免本地化 collation 影响可重建性）。

队列前 12 名（`queue.json` 有全量 44 行 + 每条的全部排序键快照）：
`1.glm-4.5v · 2.glm-4.6v · 3.glm-4.6v-flash · 4.glm-4.6v-flashx · 5.glm-5v-turbo · 6.qwen3.8-27b · 7.gpt-6-astra · 8.gpt-6-luna · 9.gpt-6.1-sol · 10.qwen3.8-max · 11.gemini-3.5-flash · 12.gemini-3.6-flash`

## 2. 来源等级与"什么算官方"

- 采用等级：**L1 发布公告 / L2 changelog / L3 模型文档明确日期 / L4 官方 blog·product update / L5 开发商自己的官方页内嵌发布元数据**。
- `sourceUrl` 必须落在该 developer 在 `scripts/data/providers.json` 的 `officialDomains` 上（由 `models-selftest` 与 `validateRegistry` 复检）。
- **引文规范**：官方页上逐字片段；原页面用换行 / 标签分行的，用 ` / ` 连接，**词句一个不改**；只做空白与转义反斜杠的归一（页面内嵌 JSON 的 `\"` 在复核时按同一口径归一）。
- 复核：`research/_raw/coverage-depth-v1/release-evidence/apply-evidence.cjs` 在**写盘前**做机械忠实度复核 —— 把 quote 按 ` / ` 拆段，逐段在**现场抓取的官方页原文**里做"去空白、去转义反斜杠"的逐字子串匹配，并对"引文里必须真的出现该日期"做正向断言；本表 26 条全部通过（任一段不命中即整体中止、不写盘）。

## 3. 逐条对照表（26 条采信）

| # | slug | 官方 URL（等级） | 原文片段（日期承载句，逐字） | 判定 | 采信理由 / identity 归属 |
|---|---|---|---|---|---|
| 1 | gemini-3.5-flash | https://ai.google.dev/gemini-api/docs/changelog (L2) | `May 19, 2026 / Released gemini-3.5-flash, the generally available (GA) version of Gemini 3.5 Flash … This is now the model behind gemini-flash-latest.` | 采信 → 2026-05-19 | changelog 条目自带日期 + "Released … GA"，且点出 model id `gemini-3.5-flash`（= canonicalName 的官方小写形态） |
| 2 | gemini-3.6-flash | 同上 (L2) | `July 21, 2026 / Gemini 3.6 Flash and Gemini 3.5 Flash-Lite generally available (GA): Released stable, production-ready versions … Gemini 3.6 Flash (gemini-3.6-flash) …` | 采信 → 2026-07-21 | 同条目同时给出日期、GA 语义与 model id；日期在条目首行 |
| 3 | gemini-3.7-flash | 同上 (L2) | `August 13, 2026 / Gemini 3.7 Flash generally available (GA): Released our most intelligent workhorse model yet for coding and agents:` | 采信 → 2026-08-13 | 同上；`(gemini-3.7-flash)` 紧随其后 |
| 4 | gemini-3.8-flash | 同上 (L2) | `September 2, 2026 / Gemini 3.8 Flash generally available (GA): Released gemini-3.8-flash, our most intelligent Flash model …` | 采信 → 2026-09-02 | 同上 |
| 5 | glm-5.3 | https://docs.bigmodel.cn/cn/update/new-releases (L2) | `2026-8-19 / GLM-5.3 新一代旗舰模型上线 / 更强的编程能力：GLM-5.3 的编程能力大幅提升 …` | 采信 → 2026-08-19 | 官方"更新日志·模型与产品发布记录"条目；日期是条目首行的官方写法 `2026-8-19`（未补零），只做**零填充**归一，`note` 已写明 |
| 6 | glm-5.3-flash | 同上 (L2) | `2026-08-26 / GLM-5.3-Flash 原生多模态模型上线 / 原生融入视觉能力 …` | 采信 → 2026-08-26 | 同上 |
| 7 | glm-4.7-flash | 同上 (L2) | `2026-01-19 / GLM-4.7-Flash 免费模型上线 / 轻量参数规模下实现了高效的 Coding 能力 …` | 采信 → 2026-01-19 | 同上（"免费模型上线"= 对公众可用） |
| 8 | glm-5v-turbo | 同上 (L2) | `2026-04-02 / GLM-5V-Turbo 多模态 Coding 基座模型上线 / 兼顾视觉理解与 Coding 能力 …` | 采信 → 2026-04-02 | 同上 |
| 9 | glm-4.6v | 同上 (L2) | `2025-12-08 / GLM-4.6V 视觉推理模型上线 / 20+ 主流多模态评测基准全面验证 …` | 采信 → 2025-12-08 | 同上；条目只写 `GLM-4.6V`（不含 Flash/FlashX 变体，见 §4） |
| 10 | glm-4.5v | 同上 (L2) | `2025-08-11 / GLM-4.5V 视觉推理模型上线 / 100B 级别开源视觉推理模型 SOTA …` | 采信 → 2025-08-11 | 同上 |
| 11 | hunyuan-a13b | https://cloud.tencent.com/document/product/1729/104753 (L3) | `模型类型 / 模型名称（API 调用名） / 版本更新时间 / 能力和特征 / … / 通用文生文 / hunyuan-a13b / 2025-06-25 / 1. 适用场景：绝大部分场景，同时兼顾效果及推理性能。` | 采信 → 2025-06-25 | 官方模型表把该行的日期列明写为「版本更新时间」；引文带上表头，使"这个日期是什么意思"在引文里自证；API 调用名 `hunyuan-a13b` 与 canonicalName 逐字一致 |
| 12 | hunyuan-role-latest | 同上 (L3) | `角色扮演 / hunyuan-role-latest / 2025-09-24 / 1. 适用场景：AI 数字分身、AI 角色扮演、AI 情感陪聊等` | 采信 → 2025-09-24 | 同上 |
| 13 | hunyuan-translation | 同上 (L3) | `翻译 / hunyuan-translation / 2025-10-14 / 支持语种齐全，33种语言互译和5种民族语言互译；` | 采信 → 2025-10-14 | 同上 |
| 14 | hunyuan-translation-lite | 同上 (L3) | `hunyuan-translation-lite / 2025-06-06 / 混元翻译专项模型，基于混元2B-Dense 模型进行翻译能力专项优化 …` | 采信 → 2025-06-06 | 同上 |
| 15 | tencent-hy-vision-1.5-instruct | 同上 (L3) | `混元图生文 / Tencent HY Vision 1.5 Instruct（hunyuan-vision-1.5-instruct） / 2025-12-17 / 基于文本 TurboS` | 采信 → 2025-12-17 | 官方表同一格里给出显示名（= canonicalName 逐字）与 API 调用名，identity 归属无歧义；`note` 已写明 |
| 16 | minimax-m2.7 | https://platform.minimax.cn/docs/release-notes/models (L1) | `2026 年 3 月 18 日 / MiniMax M2.7 / 全新语言模型 MiniMax-M2.7 系列模型 MiniMax-M2.7 / M2.7-highspeed 正式发布，开启模型的自我迭代` | 采信 → 2026-03-18 | 官方"模型发布"页条目：日期 + "正式发布" + 模型名 |
| 17 | minimax-m2.7-highspeed | 同上 (L1) | （同一条官方发布记录，原文把 `M2.7-highspeed` 与 `M2.7` 并列在同一行） | 采信 → 2026-03-18 | 同一次正式发布里点名的变体；`note` 写明与 m2.7 同源 |
| 18 | claude-fable-5.1 | https://www.anthropic.com/news (L1) | `Introducing Claude Fable 5.1 and Claude Mythos 5.1 / Announcements Sep 1, 2026 / Our most advanced models for coding and knowledge work. …` | 采信 → 2026-09-01 | Newsroom 条目自带 `Announcements` 类别与日期；公告详情页正文**不印日期**，日期只印在 Newsroom 列表上，故 sourceUrl 用列表页（`note` 已写明） |
| 19 | claude-opus-5.5 | 同上 (L1) | `Introducing Claude Opus 5.5 / Announcements Sep 22, 2026 / Opus 5.5 performs at the level of Claude Fable 5.1 on most work and costs 40% less to run than Opus 5.` | 采信 → 2026-09-22 | 同上 |
| 20 | claude-sonnet-5.5 | 同上 (L1) | `Introducing Claude Sonnet 5.5 / Announcements Sep 28, 2026 / A clear upgrade over Sonnet 5 that runs 30% faster …` | 采信 → 2026-09-28 | 同上 |
| 21 | claude-haiku-4.5 | https://www.anthropic.com/news/claude-haiku-4-5 (L1) | `Introducing Claude Haiku 4.5 / Oct 15, 2025 / Claude Haiku 4.5, our latest small model, is available today to all users.` | 采信 → 2025-10-15 | 该公告详情页**自己印日期**（正文 `<time>Oct 15, 2025</time>` 与 JSON-LD `datePublished=2025-10-15T17:00:00.000Z` 一致），故直接用它做 sourceUrl |
| 22 | gpt-6-astra | https://openai.com/index/gpt-6-astra/ (L5) | `"slug":"index/gpt-6-astra","publicationDateText":"September 3, 2026","pageType":"Article","pageTitle":"GPT-6 Astra: A new generation of intelligence"` | 采信 → 2026-09-03 | OpenAI 文章页正文不印日期；日期在页面自带的发布元数据里，同一片段含 `pageType=Article` 与页面标题 ⇒ 日期、身份、文章类型可一次核完 |
| 23 | gpt-6.1-sol | https://openai.com/index/introducing-gpt-6-1-sol/ (L5) | `"slug":"index/introducing-gpt-6-1-sol","publicationDateText":"September 29, 2026","pageType":"Article","pageTitle":"Introducing GPT-6.1 Sol"` | 采信 → 2026-09-29 | 同上 |
| 24 | gpt-6-luna | https://openai.com/index/gpt-6-astra/ (L4) | `Update on September 22, 2026: We are expanding our GPT‑6 family with GPT‑6 Sol and GPT‑6 Luna.` | 采信 → 2026-09-22 | 官方 Astra 页上的带日期更新行：明写 2026-09-22 扩充 GPT‑6 家族并点出 `GPT‑6 Luna`；**该模型自己的公告页本次抓取被 Cloudflare 403 拦下**（见 §6），故以这条官方日期行为证，`note` 已写明 |
| 25 | kimi-k3 | https://www.kimi.com/news/kimi-k3 (L1) | `Kimi K3：智能的新前沿 / 更新于：2026-07-17 / 今天，我们正式推出 Kimi K3，我们迄今能力最强的模型。` | 采信 → 2026-07-17 | 官方新闻页把「更新于：2026-07-17」与正文「今天，我们正式推出 Kimi K3」同屏并列 ⇒ 日期语义明确是发布日 |
| 26 | kimi-k2.7-code | https://www.kimi.com/resources/kimi-k2-7-code (L5) | `"description":"Kimi K2.7 Code 是一款聚焦编程、具备 agent 能力的模型，长程编程能力更强 … 思考 token 用量较 K2.6 降低 30%。","datePublished":"2026-06-13T09:47:36.717Z"` | 采信 → 2026-06-13 | 页面自带 `datePublished`；页面可见的「更新于：2026-09-14」是内容修订日，**不采用**（`note` 已写明） |

`releaseEvidence` 形态（逐条）：`{field:"releasedAt", quote, sourceUrl, capturedAt:"2026-10-05"}`，键序固定；完整 quote（未在表里省略的部分）见 `scripts/data/models.json`。

## 4. 未采信条目（14 条 · `releasedAt` 保持 `null`）

| slug | 官方来源与原文片段 | 判定 | 否决理由 |
|---|---|---|---|
| doubao-seed-2.1-pro | https://www.volcengine.com/docs/ark/model-release-announcement 「`202606` ｜ … ｜ `doubao-seed-2-1-pro-260628` ｜ 深度思考模型 ｜ 新发布 ｜ …」 | `month-known-day-unknown` | 火山方舟「模型发布公告」**只按月分区**（`202609 / 202608 / … / 202601`），区内条目没有日；模型 ID 里的 `260628` 是版本号，**禁止**当发布日期用 |
| doubao-seed-2.1-turbo | 同上 「`202606` ｜ `doubao-seed-2-1-turbo-260628` ｜ … ｜ 新发布」 | `month-known-day-unknown` | 同上（官方粒度只到月） |
| doubao-seed-character | 同上（2026 页 `202606` 区 `doubao-seed-character-260628`；2025 页 `doubao-seed-character-251128`） | `month-known-day-unknown` | 同上；最早版本在 2025 年页里同样只到月 |
| doubao-seed-evolving | 同上 「`202606` ｜ `doubao-seed-evolving` ｜ 深度思考模型 ｜ 新发布」；`202609` 区为「更新」 | `month-known-day-unknown` | 同上 |
| glm-4.6v-flash | https://docs.bigmodel.cn/cn/guide/models/vlm/glm-4.6v 「GLM-4.6V 系列 … 包含 GLM-4.6V（高性能版）、GLM-4.6V-FlashX（轻量高速版）、GLM-4.6V-Flash（完全免费）」 | 不采信（保持 null） | 官方**模型文档**说明这三个变体同属一个系列，但**没有日期**；发布记录里 2025-12-08 那条只写 `GLM-4.6V`（未点名 Flash/FlashX）⇒ 把系列发布日期套到变体上是身份外推，不做 |
| glm-4.6v-flashx | 同上 | 不采信（保持 null） | 同上 |
| hunyuan-embedding | https://cloud.tencent.com/document/product/1729/104753 只出现在「免费额度 / 刊例价」两张表；https://cloud.tencent.com/document/product/1729/102832 的日期是「最近更新时间：2026-09-23」与 API `Version: 2023-09-01` | 不采信（保持 null） | 官方没有任何"这个向量模型何时上线/何时更新版本"的日期陈述；文档更新日与 API 协议版本日都不是发布日期 |
| minimax-m2.5 | https://platform.minimax.cn/docs/release-notes/models 「`2026 年 2 月` / MiniMax M2.5 / 全新语言模型 MiniMax-M2.5 系列模型 MiniMax-M2.5 / M2.5-highspeed 正式发布 …」 | `month-known-day-unknown` | 官方只给到**月**（`2026 年 2 月`），不给日；不写月初冒充具体日 |
| qwen-max | https://help.aliyun.com/zh/model-studio/models 、/model-pricing 、/model-release-notes（模型平台功能更新） | 不采信（保持 null） | 官方"选择模型 / 定价 / 功能更新"三条线都没有该模型的发布日期；（功能更新里 2024-2026 的日期都是平台功能条目、不是该模型上线日） |
| qwen3-max | 同上；另有别名 `qwen3-max-2026-01-23` | 不采信（保持 null） | 只能在**快照版本名**里看到日期（`qwen3-max-2026-01-23` 之类），按纪律"禁止用版本号 / 别名里的数字推断日期"，不作为证据 |
| qwen3.8-max | 同上（https://help.aliyun.com/zh/model-studio/models 与 /text-generation-model 只列模型与快照） | 不采信（保持 null） | 同上：官方页只给快照 id，不给发布日 |
| qwen3.8-27b | 同上 | 不采信（保持 null） | 同上 |
| step-3.5-flash | https://platform.stepfun.com/docs/zh/guides/models/step-3.5-flash （官方模型文档）与 /docs/llms.txt 全量索引 | 不采信（保持 null） | 官方模型页与文档索引里**没有任何发布日期/上线公告**（`platform.stepfun.com/docs/overview/model-list` 404；`www.stepfun.com/changelog` 只有 JS 壳） |
| gpt-live-1 | openai.com 站点索引内未发现对应文章（`/index/` 下可见 `gpt-6-astra`、`introducing-gpt-6-1-sol`、`introducing-gpt-6-sol-and-luna` 等 14 个 slug，无 live 相关页） | 不采信（保持 null） | 本次取证未找到任何**官方**带日期页；宁可留 null |

另：`deepseek-flash`(2026-09-10) · `deepseek-v4-pro`(2026-08-13) · `deepseek-v3.2`(2025-12-01) · `minimax-m3`(2026-06-01) 是基线已有的 4 条，本轮**未改动**（`scripts/data/models.json` 三字段零 diff）。

## 5. 第三方来源的处置（零条成为证据）

- 第三方仅用于**发现候选 URL**，且发现后一律回到官方域取证：本次用过 web_search 的检索结果（含 gigazine 关于 Claude Haiku 4.5 的报道、ithome 关于豆包 Seed 2.1 的报道、cnstock 关于 Qwen3.8 开源的报道）只用来定位官方页，**没有一条**第三方页进入 `releaseEvidence`。
- 明确排除的来源：OpenRouter / SiliconFlow / Together / 百炼第三方托管行 / 媒体 / 榜单。基线里 `deepseek-v3.2`、`kimi-k2.7-code`、`qwen3.8-27b`、`step-3.5-flash` 的 `officialUrl` 指向第三方平台（事实如此）——那是身份层的 `officialUrl`，**不作为**发布日期证据来源。
- 第三方托管行日期唯一被用到的地方：`siliconflow.cn` 等只出现在"发现候选"与"排除"叙述里。

## 6. 抓取与复核基础设施（可复跑）

| 工件 | 作用 |
|---|---|
| `raw/`（96 个文件） | 现场抓取的官方页原件（HTML / .md / .txt），是本轮所有引文的**可复核底本** |
| `queue.cjs` → `queue.json` | 确定性队列生成（§1 规则） |
| `fetch.ps1` + `sources-round1.tsv` / `sources-round2.tsv` | 官方来源抓取清单与抓取器（curl，`--compressed`） |
| `probe.cjs` + `probe-job.json` | 任务文件驱动的本地语料检索（中文正则写进 JSON，避免命令行编码问题） |
| `find.cjs` / `links.cjs` / `slice.cjs` / `raw-search.cjs` / `debug-quote.cjs` | 语料检索、链接抽取、片段查看等小工具 |
| `anthropic-featured.cjs` | 抽 Anthropic Newsroom 内嵌 JSON 的 featuredGridLink（date/title/url） |
| `oai-extract.cjs` | 抽 OpenAI 文章页的 `publicationDateText` |
| **`apply-evidence.cjs`** | **采信表 + 写盘前的逐条忠实度机械复核**（本报告 §3 的 26 条即由它校验后写入） |

现场已知限制（如实记录）：`openai.com` 文章页对 curl 间歇性 403（`introducing-gpt-6-sol-and-luna` 抓取失败，`introducing-gpt-6-1-sol` 重试成功）；`anthropic.com` 部分路径对非浏览器客户端返回区域限制页；`www.kimi.com/news` 是 SPA 兜底页（K2.7 Code 实际内容在 `/resources/kimi-k2-7-code`）。

## 7. 派生结果与门禁读数

- `npm run models:rebuild`（exit 0）：44 个模型 · `current=27 · aging=2 · legacy=1 · historical=0 · unknown=14`；默认可见 43 / 默认隐藏 1；unknown 拆解 = 本组无任何带日期记录 10 条 + 本条缺发布日期 4 条。
- `node scripts/tools/model-freshness-selftest.js` → exit 0
- `node scripts/tools/check-models-reproducible.js` → exit 0
- `node scripts/validate.js --strict` → exit 0
- `node -e "…catalogStatus 计数…"` → `{"current":27,"aging":2,"legacy":1,"unknown":14} sum 44 known 30`
- `node scripts/tools/models-selftest.js` → **exit 1（未全绿，如实记录）**：
  1. 3 条 api-plans 相关失败（`真实数据：每条 API 侧声明…逐字对得回 api-plans 记录` 等）**在基线 models.json 上同样失败**（已用 `git show HEAD:scripts/data/models.json` 换入复跑验证）⇒ 与 Workstream A 无关，属同轮其它改动的在飞状态；
  2. 2 条【v2】互为充要负例失败，**是本轮数据变化的直接后果**：`scripts/tools/models-selftest.js:767-774` 的两个 fixture 改 `glm-5.3` 的一半字段（只写日期 / 只给证据）却依赖"另一半在真实数据里恰好为空"；`glm-5.3` 本轮被合法补上 `2026-08-19 + releaseEvidence` 后，这两个 fixture 不再触发红。**最小修复在 `scripts/tools/`（本任务 inScope 之外）**：给两个 fixture 显式补上另一半即可与真实数据解耦：
     - `dateNoEvidence['glm-5.3'].releaseEvidence = [];`
     - `evidenceNoDate['glm-5.3'].releasedAt = null;`
- 未改动 `MODEL_FRESHNESS_POLICY`：补日期后没有出现"主流型号大批 legacy"或"几乎全部旧型号仍 current"的系统性错误（`legacy` 仅 1 条 = `deepseek-v3.2`，与本轮无关），因此**未**重跑 `model-freshness-sensitivity.js`（任务书只允许在这种情况下才重跑）。
- 未往 `deal-history.json` / `plan-history.json` / `api-plan-history.json` 插入任何事件。

## 8. 口径备忘（本轮实际执行的定义）

1. `releasedAt` = 该 registry identity **对公众正式可用 / 官方正式发布的最早可核日期**（官方页明写日期时才写）。
2. **preview 与 GA 并存时取正式公开可用日**：Gemini 四条官方原文都写 `generally available (GA)`，取 GA 日；`note` 里写明"preview 期不作为发布日期"。
3. 官方只到**月**：`releasedAt` 保持 `null`（本报告 §4 的 `month-known-day-unknown` 四条火山豆包 + MiniMax M2.5）。
4. **不新增 `releaseDatePrecision` 字段**；不写月初冒充具体日；日期只做零填充（`2026-8-19` → `2026-08-19`）。
5. `firstSeen` / `lastSeen` 与 `releasedAt` 永久分离：本轮一个字节都没碰这两个派生字段。
