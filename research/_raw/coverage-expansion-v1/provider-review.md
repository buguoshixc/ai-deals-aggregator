# Provider Review（coverage-expansion-v1 调查汇总）

> 本文件由多位 researcher 分工撰写；每位只写自己负责的小节，**不覆盖别人的小节**。
>
> - 机器可读同源文件：`research/_raw/coverage-expansion-v1/*.json`（每份调查结论一份）
> - 本文件当前已写小节：**A（推理托管平台 4 家 · research-inference）**、**B（国际侧 Coding 候选 6 家 · research-inference）**
> - 待写小节（留给对应 owner，勿在此处代笔）：first-party 开发者平台 8 家 + 中国侧 Coding 候选（research-firstparty，同源文件 `firstparty.json`）
>
> 调查日期：2026-10-04　｜　工作分支：`coverage-expansion-v1`　｜　基线 SHA `a4dd40f`

---

## A. 推理托管平台 4 家：Groq / Together AI / Fireworks AI / Cerebras

> 同源机器可读文件：`research/_raw/coverage-expansion-v1/inference.json`
> 任务：t9（research-inference）。本节的每一条数字都能在该 JSON 里找到对应的 `capturedAt` 与逐字引文。

### A.1 一句话结论

四家都是**按量计费的推理托管平台**（不是开发者平台的官方 API），四家官方**都没有 Coding 订阅套餐**；四家的 `provider` 必须写**平台自己**，而页面上卖的模型几乎全是别人的 —— 这是本节最重要的一条判据。

| 平台 | 准入 | 官方可用定价页 | 单位 | 可诚实表达的维度 | 进 DEFERRED_SCHEMA 的维度 |
|---|---|---|---|---|---|
| **Groq** | adopt | `console.groq.com/docs/models`（groq.com/pricing **308 回首页**；console.groq.com/docs/pricing **404**） | USD / 1M tokens；另有 per hour、per 1M characters | input / output（6 个 token 模型）、rpm / tpm 限制、per 1M characters | cache 只给 50% 比例、batch 只给 50% 比例（且**不与 cache 叠加**）、flex 与标准同价、Whisper 的 **per hour**、ASH 限制维度、$5 促销 credit 的归属 |
| **Together AI** | adopt | `docs.together.ai/docs/serverless/models.md`（`www.together.ai/pricing` 是 JS 空壳，正文无价） | USD / 1M tokens | input / cached input / output（逐模型明写）、per 1M chars、per minute | batch 是「**up to** 50%」且只点名 2 个模型、**per megapixel** 图像费率、官方自称「estimate 不是 rate」的 pass-through 计费、video「Price per video」 |
| **Fireworks AI** | adopt | `docs.fireworks.ai/serverless/pricing.md` | USD / 1M tokens | input / cached input / output、**channel=priority**（官方同表独立列出） | batch 50% **且与缓存叠加**、Fast 档（表里独立行但 `variant` 无此枚举）、US-only（独立 model id + ×1.5 区域溢价）、按参数量分档的兜底价、Reserved Throughput |
| **Cerebras** | adopt-with-deferral | `www.cerebras.ai/pricing`（**完整 Tier 表是客户端渲染的，服务端只留下 3 行**） | USD / M tokens（页面逐字 `$X.XX/M tokens`） | 只有 **2 个**模型有公开逐模型单价（gpt-oss-120b / qwen3.8-27b） | 完整 Tier 价目表取不到、Dedicated Inference 走 Enterprise quote、无 cache / batch / priority 价目表 |

### A.2 身份判据：hosted model owner ≠ pricing provider（本节最关键的一条）

**四家全部命中**，而且各家用**完全不同的方式**在页面上表达了「谁的模型 / 谁在卖」：

| 平台 | 官方页面上的表达 | 落盘纪律 |
|---|---|---|
| Groq | model id 前缀是**发行方**：`openai/gpt-oss-120b`、`meta-llama/llama-prompt-guard-2-22m`、`canopylabs/orpheus-v1-english` | **前缀不是 provider**。provider 写 `groq`；发行方进 `models[].note` |
| Cerebras | 表格单元格自带前缀：`[OPENAI]GPT OSS 120B`、`[QWEN]Qwen 3.8 27B` | provider 写 `cerebras`；前缀原样留在 note |
| Together AI | 官方表有独立的 `Organization` 列（Thinking Machines / Minimax / Qwen / Moonshot / Z.ai / OpenAI / DeepSeek / Meta / **Together AI**） | provider 写 `together`；`Organization` 列是**发行方**不是计价方 |
| Fireworks AI | model id 前缀是 `fireworks/`（**平台自己的命名空间，不是发行方**） | provider 写 `fireworks`。**注意与 Groq 刚好相反**，抄错会把发行方写成平台或反过来 |

**后果（写给 t11 与页面 owner）**：同一个 `modelKey`（如 `kimi-k3`、`glm-5.3`）会在**多条 provider 记录里各出现一次** —— 这是**正确**的，因为「Moonshot 官方 API 的 Kimi K3 价」与「Together 托管 Kimi K3 的价」是两个平台的真实价格事实。把 provider 写成发行方会把它们合并成一条身份，读者会以为那个价在所有平台通用。

**页面侧建议**：`/plans/api/` 的表格需要让「平台」与「模型发行方」两列可分辨（当前 11 列里只有「平台」列）。否则同一模型名在多行里重复出现时，读者无法判断差异来自平台还是来自模型。至少应在 `models[].note` 里保留官方原样的发行方证据。

### A.3 四家各自的可采信事实（摘要；逐字引文见 inference.json）

**Groq** — 官方模型页「Supported Models」的 Production / Preview 三张表直出「PRICE PER 1M TOKENS」（input / output）+ 速率限制列：

| 模型 | input | output | 限制 | 档位 |
|---|---|---|---|---|
| `openai/gpt-oss-120b` | $0.15 | $0.60 | 250K TPM / 1K RPM | Production |
| `openai/gpt-oss-20b` | $0.075 | $0.30 | 250K TPM / 1K RPM | Production |
| `qwen/qwen3.8-27b` | $0.80 | $4.00 | 250K TPM / 1K RPM | Preview |
| `openai/gpt-oss-safeguard-20b` | $0.075 | $0.30 | 150K TPM / 1K RPM | Preview |
| `meta-llama/llama-prompt-guard-2-22m` | $0.03 | $0.03 | 30K TPM / 100 RPM | Preview |
| `meta-llama/llama-prompt-guard-2-86m` | $0.04 | $0.04 | 30K TPM / 100 RPM | Preview |
| `whisper-large-v3` | — | $0.111 **per hour** | 200K ASH / 300 RPM | Production |
| `canopylabs/orpheus-v1-english` | — | $22.00 **per 1M characters** | 50K TPM / 250 RPM | Preview |
| `llama-3.1-8b-instant` / `llama-3.3-70b-versatile` / `minimaxai/minimax-m2.7` | 逐字 **Contact Sales** | 同左 | Contact Sales | Enterprise |

**Together AI** — 官方文档站 Chat models 表（列头逐字 `Input pricing (per 1M tokens)` / `Cached input pricing (per 1M tokens)` / `Output pricing (per 1M tokens)`）逐模型明写三列，例如：

| 模型 | Organization（发行方） | input | cached input | output |
|---|---|---|---|---|
| `moonshotai/Kimi-K3` | Moonshot | $3.00 | $0.30 | $15.00 |
| `zai-org/GLM-5.3` | Z.ai | $1.40 | $0.26 | $4.40 |
| `deepseek-ai/DeepSeek-V4-Pro-0813` | DeepSeek | $1.32 | $0.13 | $3.96 |
| `openai/gpt-oss-120b` | OpenAI | $0.15 | **—** | $0.60 |
| `Prism-ML/Ternary-Bonsai-27B` | Prism ML | **Free** | — | **Free** |
| `together/Tev1-4B-experimental` | **Together AI** | $0.042 | — | **Free** |

**Fireworks AI** — 官方同一张表逐字给出 `Standard | Priority` 两组价（单元格内是 `input / cached input / output`）：

| 模型 | Standard | Priority |
|---|---|---|
| `fireworks/ember-1` | $3.00 / $0.30 / $15.00 | $3.75 / $0.375 / $18.75 |
| `fireworks/kimi-k3` | $3.00 / $0.30 / $15.00 | $3.75 / $0.375 / $18.75 |
| `fireworks/deepseek-v4p1-flash` | $0.30 / $0.006 / $1.20 | $0.375 / $0.0075 / $1.50 |
| `fireworks/glm-5p3` | $1.40 / $0.26 / $4.40 | $1.75 / $0.325 / $5.50 |
| `fireworks/qwen3p8-max` | $2.00 / $0.25 / $6.00 | $3.00 / $0.375 / $9.00 |
| `fireworks/kimi-k3` Fast / (US) | $4.50 / $0.45 / $22.50 | — / $5.625 / $0.5625 / $28.125 |

**Cerebras** — 官方定价页「Developer Tier Pricing」表**只有两行**（页面的完整 Tier 对照表落在客户端渲染区，服务端 HTML 取不到）：

| 模型（官方单元格原文含发行方前缀） | Input | Output | 速度 |
|---|---|---|---|
| `[OPENAI]GPT OSS 120B` | $0.35/M tokens | $0.75/M tokens | ~3000 tokens/s |
| `[QWEN]Qwen 3.8 27B` | $0.99/M tokens | $1.49/M tokens | ~1,850 tokens/s |

官方脚注逐字：`* For development, evaluation, and experimentation; not intended for production use.` —— **这句必须进记录 note**。

### A.4 schema 可表达性裁决（`api-plan-schema.js` v1）

**能逐字表达（7 项）**：per-token input/output（四家）；逐模型 cached input（Together / Fireworks，官方独立列 ⇒ 不是派生）；Priority 档（Fireworks，`channel=priority`）；rpm/tpm（Groq 表格）；per 1M characters（Groq Orpheus / Together TTS）；per minute（Together STT）；官方明说免费（`rates` 写 0 + `freeTier`）。

**能装进字段但必须靠 note 才不被误读（5 项）**：Groq 的 flex 档（**同价 ⇒ 不另开记录**，写成 `restrictions`；**不使用** `channel=flex`，因为那个枚举值的语义是「官方单独列了一张表」）；Groq 的 Enterprise-only 模型（`Contact Sales` ⇒ **不收进 `models[]`**，写 record-level note）；Cerebras 的「不得用于生产」脚注；Cerebras 的「其余模型走 Enterprise quote」；Together 的 `Organization` 列。

**进 DEFERRED_SCHEMA（12 项，本轮不落盘）**：

| id | 维度 | 平台 | 为什么装不下 |
|---|---|---|---|
| DEFER-INF-01 | `mediaRates` 缺 **per_hour** | Groq | 枚举里没有 per_hour；写成 per_minute 要把 $0.111 ÷ 60 —— 本仓禁止单位换算 |
| DEFER-INF-02 | 记录级 `pricing.unit` 是**单值** | Groq | 同一张表里 token / hour / characters 三类计价，一条记录装不下；建议 Orpheus 另开一条 `unit=per_1M_characters` 的记录 |
| DEFER-INF-03 | **batch 折扣只有比例、没有价目表** | Groq / Together / Fireworks | `batchInput/batchOutput` 是单价字段；自己乘 0.5 即派生值。且三家的规则互相冲突：Groq **不叠加** cache、Fireworks **叠加**、Together 是「**up to**」且只点名 2 个模型 —— 同一个 schema 形状无法区分 |
| DEFER-INF-04 | cache 只给比例（**Groq 独有**） | Groq | 官方只写「50% discount」，无任何模型单价；对比 Together/Fireworks 是逐模型明写（可表达） |
| DEFER-INF-05 | Fast / US-only 缺 `variant` 与身份位 | Fireworks | `variant` 枚举无 `fast`；`channel=fast` 进 id basis 会与「models 元素级追踪」相悖；US-only 是独立 model id + 独立 base_url 的**合规 SKU** |
| DEFER-INF-06 | 按参数量/架构分档的兜底价 | Fireworks | `models[]` 条目必须绑定具体 `(modelKey, variant)`；把「Less than 4B」做成 modelKey 等于把分类规则伪装成模型身份 |
| DEFER-INF-07 | **per megapixel** 图像费率 | Together | 枚举无 per_megapixel；用 per_image 会把「每百万像素 × 步数」的费率说成每张固定价 |
| DEFER-INF-08 | 「**estimate 不是 rate**」的 pass-through 计费 | Together | 官方自己说这个数字随分辨率/质量变化 ⇒ 写成一个确定单价就是把 estimate 冒充 rate |
| DEFER-INF-09 | 非按量产品线（预留/专有容量） | 四家全部 | Groq Performance tier（容量包）、Fireworks Reserved Throughput（$/分钟）、Cerebras Dedicated（quote）、Together Provisioned/Dedicated/GPU Clusters |
| DEFER-INF-10 | **ASH**（audio seconds per hour）限制维度 | Groq | `LIMIT_KINDS` 只有 rpm/tpm/rpd/tpd/concurrency |
| DEFER-INF-11 | Cerebras 完整 Tier 价目表取不到 | Cerebras | 不是 schema 问题，是**证据问题**（客户端渲染）——「官方页已确认但没有可采信事实」 |
| DEFER-INF-12 | 「Contact Sales」的价格单元格 | Groq / Cerebras | 数字**不存在**（不是 0、也不是「没给这一项」）；`rates: null` 的语义是「官方没给」，与「官方让你去谈」不是同一件事 |

### A.5 给 t11 的落盘清单（6 条记录候选）

| # | provider | planName 建议 | channel | officialUrl | source | region | 模型数 |
|---|---|---|---|---|---|---|---|
| 1 | `groq` | 模型推理按量计费 | standard | `https://console.groq.com/docs/models` | Official-Docs | global | 6 |
| 2 | `groq` | 语音模型按量计费（**可选**） | standard | 同上 | Official-Docs | global | 2（Orpheus） |
| 3 | `together` | Serverless 按量计费 | standard | `https://docs.together.ai/docs/serverless/models.md` | Official-Docs | global | 10 |
| 4 | `fireworks` | Serverless 按量计费 | standard | `https://docs.fireworks.ai/serverless/pricing.md` | Official-Docs | global | 10 |
| 5 | `fireworks` | Serverless 优先档（Priority） | **priority** | 同上 | Official-Docs | global | 10 |
| 6 | `cerebras` | 推理按量计费（Developer 档） | standard | `https://www.cerebras.ai/pricing` | Official-Pricing | global | 2 |

**四条硬提醒**：

1. **`officialUrl` 不许写 `groq.com/pricing`（308 回首页）或 `console.groq.com/docs/pricing`（404）** —— 这会产出一条「官方来源 404」的记录。
2. **new provider 的 `vendorKey` 一律显式 `null`**（四家在 A 空间都没有身份）；按 v3.0 §6.2 **不为它们建 `/vendor/` 页**。
3. **四家都不产生 codingPlans 记录**（它们都只有按量 API + 企业合同）。
4. **`freeTier` 一律写 `null`**（四家本轮都没取到「长期免费额度」的可引数值）：Groq 的表列头写的是 `RATE LIMITS (DEVELOPER PLAN)`；Cerebras 的 `$5 one-time promotional credit` 是**一次性促销**（更像 Deals 而不是 Plan 能力，理由见 inference.json）；Together / Fireworks 没取到 free tier 段落。

### A.6 覆盖体系可以从本节吸收的三条

1. **新增「同一 modelKey 出现在 N 个 provider 记录」这一现象是正常的**，需要一个能让页面分辨「平台 vs 模型发行方」的展示口径（否则会把托管价读成发行方官方价）。
2. **新增一类覆盖缺口：官方页存在但价目表取不到**（Cerebras 的完整 Tier 表）。这与「页面上线了但没价」不同，它是「页面上线了、价在 JS 里」。建议 coverage-targets 里给这类一个明确的处置位。
3. **四家的官方定价页 URL 有两家已经失效**（Groq 主站 / Cerebras 文档站）—— 说明「官方定价页 URL」本身是会漂移的，覆盖体系若把 URL 当稳定身份会漏。

---

## B. 国际侧 Coding 套餐候选 6 家：JetBrains AI / Replit / Gemini Code Assist / Amazon Q Developer / Tabnine / Claude Code

> 同源机器可读文件：`research/_raw/coverage-expansion-v1/coding.json`
> 任务：t9（research-inference）。准入判据与本仓既有 `curated_plans` 完全一致，逐条可核。

### B.1 准入判据（三条）

| id | 判据 | 为什么 |
|---|---|---|
| **A1** | 官方页**直出固定档价**（可逐字引用），不是「From $X」「Contact Sales」「Custom」，不是 JS 异步注入未挂载，不是第三方转述 | 既有 23 条全部满足；zhipu Lite 那条是唯一例外（`regularPrice=null` + note 写明「价格未知不是 0」），那是**容忍**不是准入，新增记录不应主动制造这种形态 |
| **A2** | 该档位是**面向个人开发者**的编码产品订阅（个人可结账）；企业席位合同 / 按人数报价的 Enterprise / 纯 API 按量 / 纯积分包都不算 | 套餐页的读者是个人开发者；v3.0 §6.2 已裁定 provider-only 平台不建 `/vendor/` 页 |
| **A3** | 身份可显式登记且不与既有 provider 撞；属于既有 provider 的**优先并入**，只有「同一家公司两个独立 SKU 面」才新立（qoder-intl 先例） | providers.json 的 aliases 精确匹配、全局唯一，未登记一律硬红 |

### B.2 逐家裁决

| 候选 | 裁决 | 官方页 | 可采信档价 | 身份处置 |
|---|---|---|---|---|
| **JetBrains AI** | ✅ **adopt** | `jetbrains.com/ai-ides/buy/`（服务端 JSON 内嵌商品目录） | AI Pro 个人 $10/月（年付 $100，合 $8.33/月）；**AI Ultimate 个人 $30/月**（年付 $300）；商业档 $20 / $60 月付 | **新立 provider `jetbrains`**，`vendorKey: null`，officialDomains 含 `www.jetbrains.com` |
| **Replit** | ✅ **adopt-partial** | `replit.com/pricing` | **Core $20/月**（年付 $18/月）；**Pro $100/月**（年付 $90/月）；Enterprise = Custom（不收） | **新立 provider `replit`**，但 **`vendorKey: replit`（不是 null！）** —— A 空间已有这家公司（deals 侧有域名登记、aliases 映射、logo、以及一条 url=replit.com/pricing 的 deal） |
| **Gemini Code Assist** | ✅ **adopt-partial** | `codeassist.google/` | Standard：无年付承诺 **$22.80/月**、年付预付 $19/月；Enterprise：无年付承诺 $54/月、年付 $45/月 | **并入既有 provider `google`**；**必须把 `codeassist.google` 加进 google 的 officialDomains**，否则 `officialDomainProblems()` 判红 |
| **Amazon Q Developer** | ✅ **adopt-partial** | `aws.amazon.com/q/developer/pricing/` | Free **$0**（perpetual Free Tier）；Pro **$19/月/用户** | **并入既有 provider `aws`**；需把 `aws.amazon.com` 加进 officialDomains（或改用落在 `amazon.com` 上的等价 URL，需先实测 200） |
| **Tabnine** | ❌ **not-adopted** | `tabnine.com/pricing` → **302 到 `tricentis.com/contact-us`** | 无（官方定价页已不存在） | **不登记 provider、不建记录** —— 没有任何官方定价面 |
| **Claude Code** | 🟦 **already-covered** | `claude.com/pricing` | Claude Pro $20/月（已是既有记录）；**Max 仍是「From $100」⇒ 无固定档价，不新增** | 归既有 provider `anthropic`，**不新立** |

### B.3 需要 captain / t11 明确决定的四处

1. **Replit 的 `vendorKey` 必须是 `replit` 而不是 `null`**（A 空间已有身份）。这与四家推理平台的处置**相反**，是本轮最容易抄错的一处。落盘前请用 `providers.js` 的 `vendorKeyOf()` 与 A 空间键表核一次。
2. **Gemini Code Assist 的 Enterprise 档（$54/$45）与 Amazon Q 的 Free 档（$0）收不收**：两份理由与既有先例都已写在 coding.json（既有 23 条里 windsurf / codebuddy **都收了** Teams 档；trae 收了 `regularPrice=0` 的免费版）。建议两条都收并在 note 写明受众/档位性质。
3. **`officialDomains` 的两次修改**（google 加 `codeassist.google`、aws 加 `aws.amazon.com`）属于 `providers.json` 的改动 —— 请确认归在 t11 的 in-scope 范围内（本调查不写生产表）。
4. **Tabnine 需要一个新的登记位**：「曾经是候选、现在没有官方定价面」。若不做，下一轮会有人再去查一遍 `tabnine.com/pricing`。

### B.4 沿用既有先例的四条判据（可复用）

1. 「From $X」「Custom」「Contact us」**不是**固定档价（Claude Max / Replit Enterprise / Gemini 的 Enterprise membership $75 都据此不收）。
2. 同一档位有「年付预付」与「无年付承诺」两组价时：**收无年付承诺的月付价，年付价进 note**（与既有 anthropic Claude Pro 同口径）。⚠️ **不要把 $19 当 regularPrice** —— 那是年付折算价。
3. 同一档位有 audience（个人/商业）两组价而 schema 无 audience 维度时：**收个人档，商业档进 note**（与既有 github Copilot Pro / windsurf 同口径）。
4. 额度单位是「钱」或「行数」而不是 token/积分/请求数时：`quota.type=other` + description 写清单位，**不得折算**（与既有 baidu Comate 同口径）。本轮的 Replit（$20 towards models）与 Amazon Q（4,000 LOC/月）都属这一类。

### B.5 本节带出的三条覆盖信号

1. **一处翻案**：`codeassist.google` 在 v3.0 C1 被记为「官方页 HTTP 500、不可用」，**本轮实测 200 且价格完整可读**（Standard/Enterprise 四组价）。建议补进 v3.0 §三 的翻案表 —— 该表本轮核对为**已含 4 条**（阿里云百炼 / 硅基流动 / MiniMax / 腾讯混元），本条加入后为 5 条。
2. **一类新覆盖信号：已宣布停支的产品** —— 官方逐字 `On April 30, 2027, AWS will discontinue support for Amazon Q Developer IDE plugins.`，并建议改用 Kiro。既有 coverage-targets 词汇里没有这一类。
3. **一个超范围线索**：亚马逊侧的替代品 **Kiro** 不在本次 6 家名单里，但既然官方主动建议迁移，建议 commander 另派一次调查（本文件只登记线索）。

---

## C. （留给 research-firstparty）

> 待写：first-party 开发者平台 8 家（xAI / Mistral / Cohere / 科大讯飞 / 百川 / 阶跃星辰 / 商汤 / 360）+ 中国侧 Coding 候选。
> 同源文件：`research/_raw/coverage-expansion-v1/firstparty.json`（已存在，owner：research-firstparty）。
> **本节刻意留空，不由他人代笔** —— 每份调查由 owner 自己写自己的小节。
