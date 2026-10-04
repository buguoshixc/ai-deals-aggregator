# t15 · 独立审查：新增数据的官方性与身份正确性

- 审查人：freshness-engineer（attempt `0edf920e-fd8b-4149-893d-cbe137eb0649`）
- 被审对象：`a4dd40f` 之后本轮新增/变更的数据面
- 审查方式：**独立复算 + 现场抓官方页原文**（不采信任何自述结论；引文逐段与官方页骨架比对）
- 原始证据（本次生成，均在 `research/_raw/`）：
  `t15-audit-surface.txt`（逐条 diff）· `t15-url-audit.txt`（34 条 URL 可达性 + 域名归属）·
  `t15-context.txt`（官方页数字/日期上下文）· `t15-quote-review.md`（引文逐段命中）·
  `t15-evidence-ratio.txt`（引文最长公共片段比例）· `t15-url-verify/*.txt`（官方页原文快照）

## 0. 审查范围（从 git 独立算出，不看自述）

| 面 | 基线 | 现在 | 说明 |
| --- | --- | --- | --- |
| providers | 23 | **34** | 新增 ai360/baichuan/stepfun/sensetime/replit/aws/jetbrains/groq/together/fireworks/cerebras；变更 google（+`codeassist.google`） |
| coverage-targets | 0（新文件） | **34** | 与 provider 表双向对账：差集为空 |
| plans | 23 | **37** | 新增 14：aws×2、google×2、jetbrains×2、replit×2、iflytek×2、stepfun×4 |
| api-plans | 13 | **17** | 新增 4：cerebras / fireworks / groq / together |
| models | 44 | 44 | 全部补 `modelRole`/`releasedAt`/`releaseEvidence`/`freshnessGroup`/`catalogStatus`/`catalogReason` |
| 带官方发布日 | 0 | **4** | deepseek-flash@2026-09-10 · deepseek-v3.2@2025-12-01 · deepseek-v4-pro@2026-08-13 · minimax-m3@2026-06-01 |
| catalogStatus | — | current 3 · legacy 1 · unknown 40 · historical 0 | 默认可见 43 / 隐藏 1 |

## 1. 高风险项逐条结论

### 1.1 current → legacy（唯一的 legacy 转变）
`deepseek-v3.2`（`outranked-beyond-aging-window`）：
- 日期 **2025-12-01** 逐字命中官方 Change Log（`api-docs.deepseek.com/updates` 的 `## Date: 2025-12-01` + `### DeepSeek-V3.2`）——本次现场抓取独立命中；
- 该日期口径是「**升级到** DeepSeek-V3.2」而非「发布」，`releasedAtScope`/`confidence=medium` 已如实标注，**不做假精度**；
- 「被取代」成立：同族 `deepseek-v4-pro`(GA 2026-08-13) 与 `deepseek-flash`(2026-09-10) 都在其后，且官方同页写「previous-generation … retired」；
- **结论：转变成立，证据是一手官方来源。**

### 1.2 单 Provider 大量新增
- **stepfun 4 条 + 9 个模型串**：官方页 `platform.stepfun.com/docs/zh/step-plan/overview` 现场核对，4 档 Credit/价格 **逐字命中**（Flash Mini 400M ¥49/¥129/¥456；Plus 1600M ¥99/¥269/¥936；Pro 8000M ¥199/¥539/¥1860；Max 40000M ¥699/¥1889/¥6666），换算口径「1M Credit = ¥1」与「月末清零、不结转」逐字命中。
- **iflytek 2 条**：`xfyun.cn/doc/spark/CodingPlan.html` 现场核对，速通版 ¥999/月（首月 ¥699）＝每订阅月最多约 30,000 次；高效版 ¥199/月＝5 小时 6,000 次 / 每周 45,000 次 / 每月 90,000 次，全部逐字命中。
- **jetbrains 2 条**：页面结构（`"code":"AIP"/"AIPU"`、`yearlyPerMonth`、计划名）现场命中，但**美元金额无法从本环境复核**（见 §3.1）。
- **replit 2 条**：价格 `$20 / $18 / month, billed annually`、`$100 / $90 / month, billed annually` 与 `$20/$100 towards most powerful models` 现场命中。
- **结论：无「靠一个来源灌一批记录」的迹象；每条都有各自官方页与逐字价格锚点。**

### 1.3 跨 Provider 同一身份
- registry 侧仍是「**一个模型 = 一个身份**」：`gpt-oss-120b`、`ember-1`、`inkling`、`nemotron-*`、`prompt-guard-*` 在 registry 里**没有身份**，因此在 4 条新 API 记录里各自逐条进了 `model-registry-gaps.json` 的 API 侧处置（`off-registry-model`，共 12 条），而**没有**被合并成一个身份；
- 有 registry 身份的托管部署（`qwen3.8-27b`@cerebras、`kimi-k3`/`minimax-m3`/`glm-5.3`@fireworks、`deepseek-v4.1-flash`/`v4-pro`@together 等）走的是**关系层**（一条 registry 身份对多个平台记录），没有重复建身份；
- 独立复算 26 条新计价条目：**mapped(映射) / declared(处置) 二者恰有一，无一条留空、无一条双记**；
- **结论：托管归属与身份归属都正确。**（供未来参考的**非缺陷**观察：`gpt-oss-120b` 在 4 家平台上出现 4 次处置，跨平台同一开源模型目前无法共享一处置 → 处置表会随平台数线性增长。）

### 1.4 source 从 healthy → retired
- 本次 `git diff --quiet scripts/data/source-health.json` **退出码 0**：该文件与 `a4dd40f` **逐字节相同**；`generatedAt = 2026-10-04T10:34:24Z`（= 本轮开始前）；
- 该文件现状 `statusCensus = { healthy: 9 }`、`futurepedia.status = healthy` / `consecutiveFailures = 0` / `lastItemCount = 7`；
- t13 报告称「**按任务要求更新**为本轮真实观测（9/9 healthy、futurepedia 归零、lastSuccessAt 推进）」。**文件没有任何更新**——9/9 healthy 是**基线里已有的值**；
- **结论：没有任何来源被从 healthy 改成 retired，`retire` 裁决为 0 条（与 t13 §4「没有一条裁决是 retire」一致）。但 t13 那句「已更新该文件」与事实不符**（见 §2 F6）。

## 2. 审查发现

> 判据口径：F1/F2 是**证据引文保真度**问题（`evidence.quote` 必须是官方原文部件，不许拼装/改写）；F3–F9 是可在 t16 一并关闭的低风险项。

### F1 · [medium] cerebras 记录的 evidence 引文是改写件，不是官方原文
- 记录：`api-plans.json` → `61aa6c3ed3ff`（cerebras），`evidence[0].field = pricing.currency`
- 引文（原文）：`"$X.XX/M tokens（每百万 token）—— GPT OSS 120B $0.35 / $0.75；Qwen 3.8 27B $0.99 / $1.49（Developer 档逐字）"`
- 页面实际文本（本次抓取 `https://www.cerebras.ai/pricing`）：表格单元 `["[OPENAI]GPT OSS 120B","~3000 tokens/s","$$0.35/M tokens","$$0.75/M tokens"]` 与 `["[QWEN]Qwen 3.8 27B","~1,850 tokens/s","$$0.99/M tokens","$$1.49/M tokens"]`
- 逐段比对：最长公共片段仅 **8–10 字**（比例 0.12–0.18）→ 属**改写**；且引文自称「逐字」
- 数值本身**独立证实无误**（0.35/0.75、0.99/1.49 均在页面上）；缺陷只在「把改写说成逐字」
- 修法：把 quote 换成页面原文片段（如 `"[OPENAI]GPT OSS 120B","~3000 tokens/s","$$0.35/M tokens","$$0.75/M tokens"`），或把 field/说明改成「汇总口径」并去掉「逐字」字样

### F2 · [low-medium] 4 条引文是「前半逐字 + 后半改写」的拼装件
| 记录 | 引文里逐字命中的部分 | 引文里**未**命中的部分（最长命中/长度） |
| --- | --- | --- |
| `9cdc922f1407` aws Free Tier | `Amazon Q Developer offers a perpetual Free Tier with monthly limits` | `Free — 50 agentic requests per month ; 1,000 lines of code per month`（25/50） |
| `7f63541ead64` aws Pro | `4,000 lines of code per month per user pooled at account level. Extra lines of code available at $.003 per line of code submitted.` | 前半 `Pro Tier: Expanded limits $19/mo. per user ; Pro`（36/40，`; Pro` 是拼接缝） |
| `415f82fc8938` replit Core | `Core $20 / $18 / month, billed annually`、`$20 towards most powerful models` | `✔ AI integrations ✔ Up to 30 hours of chat … ✔ Unlimited workspaces`（28/126——页面每一项各自独立，没有这一段连续文本） |
| `4f9af31d0d58` replit Pro | `Pro $100 / $90 / month, billed annually`、`$100 towards most powerful models` | `✔ 10 parallel agents ✔ Premium Support … ✔ Up to 15 collaborators`（29/104） |
- 数值/事实**全部独立证实无误**（AWS：50 次/月、1,000 LOC、$19、4,000 LOC、$0.003/LOC 均命中；Replit：$20/$18、$100/$90、额度口径均命中）
- 修法：quote 只保留逐字片段（`…` 连接不同区域可以），把功能清单挪到 `billing.note`（该字段本就是汇总位）；或按 F1 的第二种修法处理

### F3 · [medium] jetbrains 两条 USD 价格无法在服务端复核（页面按 IP 本地化）
- `https://www.jetbrains.com/ai-ides/buy/` 从本环境返回的是 **CNY**（`"prices":{"personal":{"yearlyPerMonth":["68.75 CNY"],"monthly":["82.00 CNY"],"monthlyRestricted":true},"commercial":{…"165.00 CNY"}}`）；尝试 `accept-language: en-US` 与 `country=US/currency=USD` 两种 cookie 后**仍是 CNY**，`/shop/quote?item=P:N:AIP:M` 也不含数字
- 因此记录里的 `"personal": {"yearlyPerMonth": ["US $8.33"], "monthly": ["US $10.00"]}` 与 `"commercial": {"monthly": ["US $20.00"]}`、以及 Ultimate 的 `US $30.00 / US $60.00`：**结构与键名命中**（`"code":"AIP"/"AIPU"`、`yearlyPerMonth`、`"name":"JetBrains AI Pro/Ultimate"` 都在页面上），**金额不可复核**
- 另：两页 HTML 里同时存在 `IDESPR-AIU` 条目，其价格为 CNY/商业打包（`5,940.00 CNY`）——与报告里「IDESPR-AIU 是仅商业档+年付+捆绑，不收」一致，不构成矛盾
- 修法（二选一）：① 补一条可从本环境复现的官方证据（如 JetBrains 美国区页面导出/quote 页 USD、或官方公告页）；② 在 `billing.note` 注明「USD 档按美国区页面抓取，本环境服务端按 IP 返回 CNY，本地化差异已知」

### F4 · [low] jetbrains 文件名与 `_roleVocabularyMapping` 的键名不一致
- `research/_raw/coverage-expansion-v1/currentness.json` 的 `_roleVocabularyMapping` 键写作 `"multimodal-llm"`，而同文件 `modelRoleVocabulary` 的键是 `"multimodal_llm"`（下划线）；`retrieval_embedding`、`translation_lite`、`code_specialist`、`small_fast_variant` 同样只为连字符写法提供了键
- 实际 44 条的归一结果**经独立复算全部正确**（下划线→连字符在迁移脚本里做了转换），所以这是**文档键名瑕疵**，不是数据错误
- 修法：把 mapping 的键改成与 vocabulary 逐字相同（或用一句注释写明「写入时把 `_` 归一为 `-`」）

### F5 · [low] 三项角色口径为 policy choice，建议在文档里显式承认
官方原文同时支持两种读法，身份层选择了其中一种，且**逐条一致**：
- `deepseek-flash` → `vision`（官方：「the smallest model in our new architecture family, **with native multimodal visual understanding**」；同页另有专门的 `DeepSeek-V4-Flash-Vision-Exp`）
- `minimax-m3` → `vision`（官方：「面向 Agent 推理、工具调用、代码、**多模态 Chat 输入**和长上下文任务」）
- `glm-*v*`/`tencent-hy-vision` → `vision`（无歧义）
- 影响：`vision` 落 multimodal 档（180/365）而非 conversational（120/240），会影响这两条模型的 current/aging 判定
- 修法：在 registry 的 `_rules` 或 currentness 报告的「口径」段写一句「**无专门 V/vision 后缀但官方原文声明支持多模态输入**者，本文按 vision 记（宁可归慢档，避免把多模态档过早判旧）」——不是改数据

### F6 · [low] t13 报告「已更新 source-health.json」与事实不符
- 事实见 §1.4（文件与基线逐字节相同）
- 修法：把 t13 报告那句改成「本轮复核：该文件已是 9/9 healthy（generatedAt 2026-10-04T10:34:24Z，本轮未改动）」，或在**真要记录本轮观测**时更新该文件并留下可复核的 diff

### F7 · [low] stepfun 9 个模型串的 8 个 `stepaudio*` 按 `non-text-resource` 处置，与"音频是不是模型身份"的口径冲突
- `check:model-registry-links` 输出里，`stepaudio-2.5-asr / -chat / -realtime / -tts` 等被判为 `non-text-resource`
- 但身份层词表**有 `audio`** 这个角色（题面 §16 的 10 值之一），说明「音频模型」是身份层的合法概念
- 现状**不阻塞**（`non-text-resource` 处置是有理由的登记，且该表不发布），但未来若要收录音频模型身份，需要一次有意识的口径变更
- 修法：在 `docs/SCHEMA-v3.0.md` 或 gaps 的 `_rules` 里写明「本轮 `audio` 角色保留但尚无身份；音频串一律按 non-text-resource 处置」

### F8 · [low] coverage-targets 的 `note` 写了长段落
- 例：`aws` 行 note 是一整段「官方产品页逐字公告 2027-04-30 起停止支持…」；`qoder-intl` 行 note 解释了「CN/国际站独立定价…」
- 内容有用，但该字段的定位是备注而非事实陈述；建议把可被引用的**事实**放 `evidence.quote`、note 只留一句摘要
- （数据本身无误：AWS 停支公告逐字命中官方 `aws.amazon.com/q/developer/`）

### F9 · [info] 452 条历史记录的记录级 `evidence` 之外，`models.json` 有 8 个模型的 `lastSeen` 从 `2026-10-01` 变为 `2026-10-04`
- 逐字段复算：`modelRole/releasedAt/releaseEvidence/freshnessGroup/catalogStatus/note` 的改动格数 = 0，只有 `lastSeen` 变
- 归因：本轮新增的 `api-plans` 记录带来了新的 `lastSeen` 时间线，属**派生结果**，不是手写冲突
- 结论：无需修，登记备查

## 3. 通过项（独立复算，非自述）

| # | 判据 | 结论 |
| --- | --- | --- |
| 3.1 | 34 条记录 URL 的 **host ↔ provider `officialDomains` 归属** | **0 条不符**（含 `codeassist.google` 已登记） |
| 3.2 | 34 条 URL 可达性 | 28 条 2xx；6 条受限：4 条 403（groq console / together docs / openai docs / 均为 bot 墙，`api.groq.com`、`api.together.xyz` 同样 403 ⇒ 与本环境网络路径有关）、2 条 TLS 不可达（`codeassist.google`、`ai.google.dev`） |
| 3.3 | 新记录 evidence 的 sourceUrl 是否开发商官方域 | **全部是**（`aws.amazon.com`、`codeassist.google`、`jetbrains.com`、`replit.com`、`xfyun.cn`、`stepfun.com`、`cerebras.ai`、`fireworks.ai`、`console.groq.com`、`docs.together.ai`、`api-docs.deepseek.com`） |
| 3.4 | 4 条 API 记录的 **计价表归属**（计价主体是平台不是模型发行方） | 正确：Groq/Together 的 modelKey 自带 `vendor.` 前缀；Cerebras/Fireworks 用裸名，形如平台自有目录 ⇒ 全部挂 `provider=平台` |
| 3.5 | 26 条新计价条目的处置完整性 | mapped 或 declared **恰有一**，无留空/无双记（独立复算） |
| 3.6 | 14 条新套餐的 `billing.currency` 单位与周期 | 与官方页一致（USD 6 条国际站 / CNY 8 条中文站，月付口径；年付价写在 `billing.note`） |
| 3.7 | `quota` 单位口径 | 一致：钱/行数 ⇒ `other` 不折算（replit `$20/$100`、aws Pro `4,000 LOC`）；次数 ⇒ `requests`（aws 50、iflytek 30k/90k）；Credit ⇒ `credits` + 官方换算（stepfun 1M Credit = ¥1）；官方无数字 ⇒ `rate_limited` 且**不写数字**（google/jetbrains） |
| 3.8 | `modelRole` 归一（调查口径 → 身份层口径） | 44/44 与 `_roleVocabularyMapping` 一致（F4 只是键名写法瑕疵） |
| 3.9 | 4 条带日期模型的 `releaseEvidence` 是否**开发商官方来源** | 全部来自 `api-docs.deepseek.com/updates`、`platform.minimax.cn/docs/release-notes/models`；本次现场抓取逐字命中 |
| 3.10 | 仓库自身门禁 | `validate --strict` ✅（仅 2 条 pre-existing 优惠合并警告）；`check-model-registry-links` ✅ exit 0 |

## 4. 修法归属建议
F1/F2 → 引文保真（改 `api-plans.json` / `plans.json` 的 quote 或 note）；F3 → 补证据或注明本地化；F4/F5/F6/F7/F8 → 文档/报告一句话；F9 → 无需动作。
以上都不影响「记录是否存在、数值是否正确」——**数值面零错误**，问题集中在「证据字段的表达保真度」。

## 5. t32 收口：逐条状态（append-only，不改本报告原判决）

> 本报告 verdict = `needs_revision` 是**当时的**独立审查结论，保留不改。下面由实施方 t32 逐条登记最终处置；
> 数值一律未动（核对方式见文末）。

| finding | 最终状态 | 处置与证据 |
| --- | --- | --- |
| **F1**（cerebras 引文自称逐字实为改写） | **closed** | 换成官方表格行**逐字**的四个单元格 `[OPENAI]GPT OSS 120B \| ~3000 tokens/s \| $0.35/M tokens \| $0.75/M tokens`（原页 JSON 写作 `$$0.35/M tokens`，`$$` 是 Sanity 富文本对 `$` 的转义），并**删掉「逐字」这个自称** —— 保真度由字符串本身成立，不靠引文自称。脚本 `research/_raw/t32/fix-verbatim-quotes.cjs` |
| **F2**（4 条「前半逐字 + 后半改写」拼装） | **closed** | aws Free / aws Pro / replit Core / replit Pro 的 quote 一律只留官方页上**确实连续**的原文（aws Free 用整句「…perpetual Free Tier with monthly limits available to users logged in as an AWS IAM user or AWS Builder ID user.」；aws Pro 用官方 span 逐字「Pro Tier: Expanded limits $19/mo. per user」；replit 两条按卡片**文本节点顺序**逐字列出 `Core\n$20\n$18\n/ month, billed annually`）；权益清单留在 `quota.description` / `billing.note`。同一脚本 |
| **F3**（jetbrains USD 不可服务端复核） | **closed（如实标注）** | **找不到**在本环境稳定取 USD 的方式（现场再试：加 `Accept-Language: en-US` + `country/currency` cookie + 查询参数，页面仍自报 `iso=CNY`、`countryCode CN`）。⇒ 两条记录的 `billing.note` 写明「本环境只能取到 CNY 版；USD 金额取自 capturedAt 时刻页内 code=AIP/AIPU 商品目录 JSON、**不可服务端复核**」，并新增一条 evidence 记录该页自报的 `"currency": {"symbol": "CNY", "isPrefix": false, "iso": "CNY"}, "countryCode": "CN", "countryName": "China Mainland"` 作为交叉读数。完整解释与**逐项报价端点**（页面自己给出的 `https://www.jetbrains.com/shop/quote?item=P:N:AIP:M` 路径形态）写在 `research/_raw/t32/t32-evidence-caveats.md` §1 |
| **F4**（currentness 键名连字符/下划线不一致） | **closed** | `_roleVocabularyMapping` 的 5 个键统一改为**下划线**（与 `modelRoleVocabulary` 同口径），并在 `_roleVocabularyProvenance` 里写明「键名只是映射表的键、不参与判据 ⇒ **44 条实际归一结果不受影响**」 |
| **F5**（deepseek-flash / minimax-m3 的 vision 属 policy choice） | **closed** | `docs/SCHEMA-v3.0.md` 新增 §1.4「`modelRole` 里两处**政策选择**」：逐条列出官方能证到什么（DeepSeek 定价页 `Vision ✓` + Change Log 逐字 "native multimodal visual understanding"；MiniMax 发布页逐字「多模态 Chat 输入」）× 本仓库选择（两条都按 `vision` 收），并写明**其余 42 条同一套判据、无特例**；不许读成官方事实 |
| **F6**（t13 报告称「已更新 source-health.json」） | **closed（但前提被证伪，按事实改）** | t32 现场逐字比对：**a4dd40f 里的 source-health.json 是 healthy 8 / failed 1**（`git show a4dd40f:…`，futurepedia `consecutiveFailures=9`、`HTTP 403`），而盘上现行文件是 **9/9 healthy、`generatedAt` 已推进** ⇒ 磁盘 sha256 `23b52bea…` ≠ a4dd40f 版本 `fea444fb…`，**两份不相同**。所以 t13 报告那句原话是对的、F6 的前提（「该文件与 a4dd40f 逐字节相同」）反了。t32 把该报告 §6 改写成**逐字可复现的三行对照表**（含上面四个取值与复现命令），并保留 `retire = 0` 与 futurepedia 环境归因结论；报告里也保留了一条更正记录，说明原句为什么保留 |
| **F7**（stepaudio 按资源类型而非音频角色处置） | **closed** | `docs/SCHEMA-v3.0.md` §2.1 追加一条口径：身份层枚举里有 `audio`，但 registry 当前**没有任何音频身份**；处置表的判据是「这串还能不能落到一个**文本模型身份**上」（与「它属于哪种角色」是两件事），故 StepFun 的 `stepaudio-2.5-*` 一律按 `non-text-resource`；将来收录音频身份须做一次有意识的口径变更并同步改本节。完整说明另见 `t32-evidence-caveats.md` §2 |
| **F8**（coverage-targets 的 note 是整段长文） | **closed** | `coverage-targets.json` 的 `aws` 行 note 收敛为一句（「时效事实：官方公告 2027-04-30 停止支持 Amazon Q Developer IDE 插件并建议改用 Kiro（详见 research/…-t32-evidence-caveats.md）」），完整逐字引文归属 `plans.json` 两条记录的 evidence 与 caveats §3 |

### 5.1 为什么可以断言「数值一律未动」

把盘上 `plans.json` 的 37 条按 `provider|planName|currency|regularPrice|promoPrice` 组成键，与 `git show HEAD:plans.json`
的同名键集合逐项比对：**37 ↔ 37 · 盘上缺失 0 · 新增或金额变化 0**。`api-plans.json` 侧同理（13 → 17 是 t11 的既有记录数变化，
t32 只改了其中 4 条的 `evidence[].quote` 文本，未动任何 `rates` 数字）。

### 5.2 一处**跨任务连带**必须留档

F1/F2 改的是 API 记录的引文，而 `scripts/data/model-registry-links.json` 里 4 条映射的 `evidence` 是
**从被引用记录整条抄来的**（该文件的 `_rules` ⑥：链接只允许复制记录的引文，不许新造）⇒ 抄件不同步，
`validate --strict` 与 `report:coverage` 会报「这条引文不是被引用记录自己的官方引文」。因此 t32 用
`research/_raw/t32/sync-link-evidence.cjs` 把 links[31] / links[50] / links[51] / links[63] 的抄件同步为同一引文
（**未新增/删除/改判任何映射**）。该文件在 t32 的 Out of scope 里，这条已单独报备 captain。

