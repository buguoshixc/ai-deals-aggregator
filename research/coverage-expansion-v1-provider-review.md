# coverage-expansion-v1 · Provider Review（first-party 开发者 8 家 + 中国侧 Coding 候选）

- 任务：t8 `research-firstparty`
- 工作目录：`.worktrees/coverage-expansion-v1`（分支 `coverage-expansion-v1`，基线 `a4dd40f`）
- 调查时间：2026-10-04（Asia/Shanghai）
- 机器可读副本：`research/_raw/coverage-expansion-v1/firstparty.json`（本文所有结论的逐条证据都在那里，含引文原文、sourceUrl、capturedAt）
- 本文负责章节：**xAI / Mistral / Cohere / 科大讯飞 / 百川 / 阶跃星辰 / 商汤 / 360** 与**中国侧 Coding 套餐候选**。
  **国际侧推理平台（Groq / Together / Fireworks / Cerebras）与 6 家国际 Coding 候选由 `research-inference`（t9）负责**，不在本文范围内；本文件若被 t9 追写，请只在各自章节内追加，不要重写本文档的整体结构与裁决表。

---

## 0. 纪律与口径（本文的判据）

1. **只用开发商官方来源**：官方定价页 / 官方文档 / 官方发布动态 / 开发商官网新闻。第三方托管平台（AWS Bedrock、Vercel AI Gateway、OpenRouter）、聚合比价站（benchlm、futureagi、llm-stats）、新闻媒体（techweb、36氪、cnstock、ifeng、sohu）**只当线索，不作价格或 releasedAt 的出处**。
2. **查不到就写 null + 检查结论**。不用版本号猜日期（`step-3.5-flash-2603` 里的 `2603` 不算证据）；不把「文档更新日」当「模型发布日」；假精度比缺失更糟。
3. **价格原样记录**官方单位与币种，再单独裁决现有 schema 能否诚实表达。表达不了就记 gap：**不换算、不折算、不合并、不硬塞**。
4. **官方不公开 ≠ 缺失**；**官方来源不可达 ≠ 该厂商不存在**。两者都必须与「MISSING」分开写。
5. 本任务是调查，**不写任何生产数据**（不碰 `scripts/data/**`、`plans.json`、`api-plans.json`、`models.json`）。

---

## 1. 裁决总表

| # | Provider | 官方页面可访问性 | API Pricing 是否公开 | 本环境能否抽取 | 当前主力模型（官方可见） | releasedAt 官方证据 | 现有 schema 能否诚实表达 | **裁决** |
|---|---|---|---|---|---|---|---|---|
| 1 | **xAI** | ❌ 全域不可达（`x.ai`/`docs.x.ai` fetch failed） | 未知 | ❌ | 未知 | ❌ | 无从判断 | **unverifiable** |
| 2 | **Mistral AI** | ❌ 全域不可达（`mistral.ai`/`docs.mistral.ai`） | 未知 | ❌ | 未知 | ❌ | 无从判断 | **unverifiable** |
| 3 | **Cohere** | ⚠️ 可达但正文被前端渲染吃掉（HTTP 200） | 未知（表体抽不出） | ❌ | Command A（文档路由存在）、Embed 5（首页 banner） | ❌ | 无从判断 | **unverifiable** |
| 4 | **科大讯飞** | ✅ 文档站全部可达 | **否**（官方明确指向登录页） | 套餐可抽、API 价无表可抽 | Spark-X2.5 / Spark-X2 / Spark-X2-Flash / Spark X2 Agent | ✅ Spark X2 Agent = 2026-07-10（官方版本记录） | 套餐 ✅；三窗口额度/系数/积分单价 ✖ | **partial** |
| 5 | **百川智能** | ✅ 价格页完整可达 | **是** | ✅ | Baichuan-M3-Plus / M3 / M2-Plus / M2 | ❌ 全部 null（官方站无新闻页） | M 系列 ✅；打包价/按次/按 GB ✖ | **partial** |
| 6 | **阶跃星辰** | ✅ 文档站全部可达（含 `.md`） | **是** | ✅ | step-5-preview / step-3.7-flash / step-3.5-flash(-2603) / step-1o-turbo-vision / StepAudio 系 | ❌ null（官方只给下线日） | token/图片/Step Plan ✅；按小时/按 GB·天/季度价 ✖ | **adopted** |
| 7 | **商汤科技** | ✅（大装置 + 日日新官网 + 官网新闻） | ⚠️ 部分（大装置 V6.x 有价；6.8 线只有免费 Token Plan） | ✅ | SenseNova 6.8 Flash Lite / U1.5 Lite（当前面）；V6.5-Pro/Turbo（大装置面） | ✅ V6.5 = 2025-07-23；V6 系 = 2025-04-09；6.8/U1.5 = null | V6.x ✅；打包价/万字符 ✖ | **partial** |
| 8 | **360** | ✅（模型广场/文档）但详情页前端渲染 | ⚠️ 部分（广场公开 ¥/1M tokens） | ⚠️ 只抽到 1 家自研模型完整价格 | 360zhinao-turbo-llm-geo、360zhinao-pro | ❌ null | 已抽到那条 ✅；其余未验证；转售模型**不应**表达 | **partial** |

**中国侧 Coding 套餐候选（本文负责的一半）**：adopted **2**（阶跃星辰 Step Plan、讯飞 Astron Coding Plan）· partial **2**（讯飞 Astron Token Plan、商汤 SenseNova Token Plan）· deferred **5 家**（百川 / 360 无自营编码套餐；xAI / Mistral / Cohere 连有没有都无法判定）。

---

## 2. schema 表达力基线（裁决用的可核事实）

以下枚举直接读自仓库代码，不是猜的：`scripts/lib/api-plan-schema.js`、`scripts/lib/plan-schema.js`。

**API 计费（api-plans）**

- 记录级单位：`per_1M_tokens` / `per_1K_tokens` / `per_1M_characters`
- token 维度键：`input` / `output` / `cachedInput` / `cacheWrite` / `cacheWriteLong` / `reasoning` / `batchInput` / `batchOutput` → **没有「输入+输出打包价」这个键**
- 非 token 维度（`mediaRates`）单位：`per_image` / `per_second` / `per_minute` / `per_1M_characters` / `per_request` / `per_1M_token_hours` → **没有 `per_hour`、没有 `per_GB`/`per_day`、没有 `per_voice`**
- 通道：`standard` / `batch` / `flex` / `priority` / `fast` / `ultrafast` / `off_peak` / `fine_tuned` / `other`
- 币种：`CNY` / `USD` / `HKD` / `EUR` / `JPY` / `GBP` / `SGD` → **不接受「积分」这类非法定币种**
- 单位见证：引文或 `pricing.unitNote` 点名的单位必须与 `pricing.unit` 同类（每千 ↔ `per_1K_tokens`；每百万 ↔ `per_1M_*`），矛盾即红

**套餐（plans）**

- 计费周期：`monthly` / `yearly` / `one_time` / `usage_based` / `other` → **没有 `quarterly`**；可比周期只有 `monthly` 与 `yearly`
- 额度类型：`tokens` / `credits` / `requests` / `messages` / `rate_limited` / `unlimited_fair_use` / `compute_units` / `other`
- 额度周期：`monthly` / `yearly` / `weekly` / `daily` / `hourly` / `rolling` / `one_time` / `other`；**quota 是单对象**（一个 period、一个 amount）
- 限制种类：`concurrency` / `rate_limit` / `per_day_cap` / `rolling_window` / `output_limit` / `fair_use` / `region_restriction` / `account_required` / `invite_only` / `new_user_only`
- 模型角色：`included` / `limited` / `pool` / `family`

**由此推出的四条硬结论**

1. 打包价（官方原文「包含输入和输出」）**无法诚实表达**：写成 `input=output=X` 是造两条官方没说过的事实；只写 `input` 等于把输出价说成「未公布」。→ 记 `schema_not_supported`。
2. 季付价**无法原样表达**：伪装成 `monthly` 会污染按可比周期的排序逻辑。
3. 多窗口额度（每 5 小时 / 每周 / 每月）**装不下**：只能选一个规范窗口 + 其余写 `description` / `restrictions`（仓库既有先例：智谱 Lite 把双窗口写进 description）。
4. 按小时 / 按 GB·天 / 按音色 **没有单位**：直接不落，不做折算（`2.8 元/小时 → per_minute` 会产生无限小数，属于本站自己造的精度）。

---

## 3. 逐家调查

### 3.1 xAI —— **unverifiable**

- **官方页面可访问性**：全部失败。`https://x.ai/`、`https://x.ai/api`、`https://docs.x.ai/`、`https://docs.x.ai/docs/models`（含 `.md` 变体）、`https://docs.x.ai/docs/overview` → 一律 `TypeError: fetch failed`（拿不到 HTTP 状态码，不是 404/403）。
- **API Pricing 是否公开**：**无法判定**。搜索索引里能看到 `docs.x.ai/overview` 的页面标题，但本环境对 `x.ai` 全域抓取失败，**零官方原文可引**。
- **当前主力模型**：**不写**。搜索命中的「Grok 4.6」（AWS Bedrock 模型卡）与「Grok 5」（多个第三方博客）都不是开发商官方来源。
- **releasedAt**：无。
- **裁决理由**：官方来源不可达 ⇒ 三项裁决（可访问性 / 定价公开性 / 当前模型）全部无法完成。按纪律不得用 Bedrock 模型卡或第三方博客替代。
- **coverage 建议**：`DEFERRED`（来源不可达），**不是 MISSING**。

### 3.2 Mistral AI —— **unverifiable**

- **官方页面可访问性**：6 个 URL 变体全部 `fetch failed`：`mistral.ai/pricing`、`mistral.ai/pricing/`、`mistral.ai/en/pricing`、`mistral.ai/products/la-plateforme`、`docs.mistral.ai/`、`docs.mistral.ai/getting-started/models/models_overview`（含 `.md`）。
- **API Pricing 是否公开**：无法判定。搜索命中 benchlm.ai（「Mistral API Pricing (September 2026)」）、Future AGI、Vercel AI Gateway —— 全是第三方。
- **当前主力模型**：不写（第三方提到的 Large 3 / Medium 3.5 不作依据）。
- **裁决理由**：同 xAI。
- **coverage 建议**：`DEFERRED`（来源不可达）。

### 3.3 Cohere —— **unverifiable**

- **官方页面可访问性**：**可达但不可用**。`https://cohere.com/pricing` 与 `https://docs.cohere.com/docs/models` 都返回 HTTP 200，但抽取到的正文只有导航栏（页面主体由前端渲染，落在抽取窗口之外）；`https://docs.cohere.com/docs/command-a` 也是 200（说明官方文档里**存在**这条路由）；`https://cohere.com/pricing/command-a` 返回 **404**（官方没有按模型分列的定价路由）。
- **能引的官方原文**只有首页 banner 一句：`Embed 5 is here: state-of-the-art retrieval - now available in Pro and Fast tiers.`（sourceUrl `https://cohere.com/pricing`）。
- **当前主力模型**：只能到「官方文档存在 `/docs/command-a`」+「Embed 5 存在且分 Pro / Fast 两档」这一步 —— **不足以落盘任何价格**，也证明不了谁是当前主力。
- **releasedAt**：无。
- **裁决理由**：官方定价页与文档页都 200，但价格表与模型清单不可抽取；既不能说「公开」，也不能说「不公开」。
- **coverage 建议**：`DEFERRED（未验证）`，并写明具体失败形态为「页面可达、正文不可抽取」——这与「厂商没有定价页」是两件事。

### 3.4 科大讯飞 —— **partial**

**官方页面可访问性（全部 200 且正文可抽）**

| 页面 | URL | 抽到的东西 |
|---|---|---|
| 星火 HTTP 接口文档 | `https://www.xfyun.cn/doc/spark/HTTP调用文档.html` | 语言模型六版本（Lite/Pro/Pro-128K/Max/Max-32K/4.0 Ultra）；Max 套餐 2026-03-10 下线并入 Ultra；Ultra 升级至 X1.5 |
| Spark-X2 HTTP 文档 | `https://www.xfyun.cn/doc/spark/X1http.html` | `model=spark-x`；输入 64K / 输出 128K；thinking 三态；文档更新时间 2026.02.09 |
| 星辰 MaaS 计费说明 | `https://www.xfyun.cn/doc/spark/BillingDescription.html` | **官方明确不公开静态价目表** |
| Astron Coding Plan | `https://www.xfyun.cn/doc/spark/CodingPlan.html` | v2.3（更新 2026-07-22）：档位、价格、三窗口流控、抵扣系数、波谷系数、使用场景限制 |
| Astron Token Plan | `https://www.xfyun.cn/doc/spark/TokenPlan.html` | 三档按成员价 + 逐模型「积分/百万 token」表 |
| 产品页 / 模型广场 | `xinghuo.xfyun.cn/sparkapi`、`maas.xfyun.cn/modelSquare` | 只返回标题（前端渲染） |

**API Pricing 是否公开：否。** 官方原文：**「模型价格 请以 https://training.xfyun.cn/account 以及实际购买页价格为准。」**（`BillingDescription.html`）
→ 所以「星火现价多少」在本轮**不可核**；这不是 schema 表达力问题，是来源不存在。**不得**把线上第三方整理的星火价目表当官方数据。

**当前主力模型（官方可见）**：`Spark-X2.5`（Token Plan 标「星火自研」256K）、`Spark-X2`（深度推理，输入 64K/输出 128K）、`Spark-X2-Flash`、`Spark X2 Agent`（Coding Plan 抵扣系数表内；Token Plan 文档标「已下线」—— **两个套餐面的上下架状态不同，落盘必须按面判定**）。
**legacy**：`Spark 4.0 Ultra / Max / Max-32K / Pro / Pro-128K / Lite`（Max 套餐 2026-03-10 官方下线；Ultra 是能力升级而非下线）。

**releasedAt 官方证据**

- ✅ `Spark X2 Agent` = **2026-07-10**：官方 Coding Plan 文档版本记录 `v2.2 | 2026-07-10 | ……上线最新模型Spark X2 Agent，面向Agent场景优化效果，完全基于全国产算力训练和推理的全新星火300B-A30B MoE模型`。
- ⚠️ `Spark-X2`：官方只说「已上线」+ 文档更新时间 `2026.02.09` → `releasedAt: null`，另记一条**可核事实**「不晚于 2026-02-09 已上线」。文档更新日不是发布日。
- ❌ `Spark-X2.5`：Token Plan 文档列出但没有日期；媒体（ifeng / ithome）不作依据 → null。

**schema 表达力**

| 官方事实 | 单位 | 能否表达 |
|---|---|---|
| Coding Plan 高效版 ¥199/月、速通版 ¥999/月（限时首月 ¥699） | CNY / 月 | ✅ `billing{period:'monthly',currency:'CNY',regularPrice,promoPrice,promoNote}` |
| Coding Plan 季付 ¥538 / ¥2997（限时 ¥2697） | CNY / 季 | ❌ 无 `quarterly` → `schema_not_supported` |
| 三窗口请求额度（5 小时 6,000 / 周 45,000 / 月 90,000） | requests / window | ⚠️ 单 quota 对象装不下三个窗口 → `partial` |
| 模型抵扣系数（X2 Agent=2、GLM-5.2=5…） | 系数 | ⚠️ 无逐模型系数表 → `partial`（`quota.conversionDependsOnModel=true` + description） |
| 波谷系数 0.8 | 系数 | ⚠️ → `restrictions{kind:'rate_limit'}` |
| Token Plan 三档 200 / 600 / 2000 元·成员/月 | CNY / 成员 / 月 | ⚠️ 无「按席位」维度 → `partial`，note 必须写明按成员 |
| Token Plan 逐模型「积分/百万 token」（Spark-X2.5 输入 320 / 缓存命中 48 / 输出 1200 / 思考 1200） | 积分 / 1M tokens | ❌ 积分不是法定币种、无载体 → `schema_not_supported`，**不换算成元** |

**裁决：partial。** 官方公开的是**套餐**而不是常规 API 单价：套餐可落 `plans.json`（多窗口与系数按 partial 处理），常规 API 定价官方明确不公开，逐模型积分表 schema 装不下。

**中国侧 Coding 候选（本任务：adopted 2 条）**

1. **Astron Coding Plan**（adopted）：在售 高效版 ¥199/月、速通版 ¥999/月（2026-07-23 上线，限时首月 ¥699）；专业版/无忧版已下线；`model=astron-code-latest`；支持模型含 Spark X2 Agent/X2/X2-Flash 与 GLM / DeepSeek / Kimi / MiniMax / Qwen 系列；**额度仅限编程工具交互式场景，禁止脚本、批量任务、自建服务端**（这条限制必须落进 `restrictions`，否则会把受限套餐说成通用 API 额度）。
2. **Astron Token Plan**（partial）：标准 200 / 高级 600 / 尊享 2000 元·成员/月，对应 20,000 / 60,000 / 200,000 积分·成员/月；限时 8/7/6 折（160/420/1200）。

### 3.5 百川智能 —— **partial**

**官方页面可访问性**：`https://platform.baichuan-ai.com/prices` **200 且正文完整**；`www.baichuan-ai.com/` 只返回标题；`/news` 与 `/models` 都是 **404**。

**API Pricing 是否公开：是**（CNY，元/千tokens）。官方表全文要点：

| 模型 | 上下文 | 输入 | 输出 | 备注 |
|---|---|---|---|---|
| Baichuan-M3-Plus | 32k | 0.005 元/千tokens | 0.009 元/千tokens | 自动触发「医疗搜索」，0.03 元/次另计 |
| Baichuan-M3 | 32k | 0.01 | 0.03 | |
| Baichuan-M2-Plus | 32k | 0.01 | 0.03 | 同上（含全流程 token） |
| Baichuan-M2 | 32k | 0.002 | 0.02 | |
| Baichuan4-Turbo / 4-Air / Baichuan4 | 32k | 0.015 / 0.00098 / 0.1 | — | **官方原文「包含输入和输出」（打包价）** |
| Baichuan3-Turbo / 3-Turbo-128k / 2-Turbo | 32k / 128k / 32k | 0.012 / 0.024 / 0.008 | — | 打包价 |
| Baichuan2-53B | 32k | 00:00–8:00 = 0.01；8:00–24:00 = 0.02 | — | 分时段打包价 |
| Baichuan-Text-Embedding | — | 0.0005 元/千tokens | — | 知识库与向量化同价 |
| 搜索增强 / 医疗搜索 | — | 0.03 元/次 | | 非 token |
| 文件存储 | — | 1.5 元/GB/天 | | 非 token |

**当前主力模型**：`Baichuan-M3-Plus` / `Baichuan-M3`（医疗向 M 系列，价格页当前在售）→ `Baichuan-M2-Plus` / `M2` → `Baichuan4` 族（打包价，仍在价格页但无上下架声明，**不能**据此判成 retired）。

**releasedAt**：**全部 null**。官方价格页不含日期，官方站无新闻页。/prices 上唯一的官方日期是 `Baichuan2-Turbo-192k 已于2024年08月16日下线` —— 那是**下线日**，登记以免与 releasedAt 混淆。媒体日期（2026-01-13 开源 M3、2026-01-22 M3 Plus）**不作依据**。

**schema 表达力**

- ✅ M3-Plus / M3 / M2-Plus / M2：官方输入、输出分明，单位「元/千tokens」与 `per_1K_tokens` 同类（引文点名「每千」，单位见证成立）。
- ✅（决策待定）Baichuan-Text-Embedding：形态可表达，但 registry 里没有百川的 embedding 身份，落盘前要单独决定是否新增该模型。
- ❌ 6 条打包价 → `schema_not_supported`。
- ⚠️ Baichuan2-53B 分时段价：仓库已有 DeepSeek PEAK/OFF-PEAK 双记录先例，可用 `channel: off_peak / standard` 两条表达，但时段文本必须写清。
- ❌ 0.03 元/次、1.5 元/GB/天：单位或载体不匹配 → 不落。

**裁决：partial。** 价格公开且可抽，M 系列可诚实落盘；但打包价（6 条）、按次/按 GB 计费、以及**全部模型的 releasedAt 缺失**是硬缺口。

### 3.6 阶跃星辰 —— **adopted**（8 家里最该优先落盘的一家）

**官方页面可访问性**：文档站全部 200 且正文完整（`.md` 变体同样可用），另有 `https://platform.stepfun.com/docs/llms.txt` 官方索引可用于复核页面集合。`platform.stepfun.com/docs/pricing/details`（旧路径）返回 404 —— 正确路径是 `/docs/zh/guides/pricing/details`。

**API Pricing 是否公开：是**（CNY，元 / 1M tokens）。官方表要点：

| 模型 | 输入（缓存未命中） | 输入（缓存命中） | 输出 | 分类 |
|---|---|---|---|---|
| `step-5-preview` | 7 | 0.35 | 20 | 多模态推理（1M 上下文，最大输出 64k） |
| `step-3.7-flash` | 1.35 | 0.27 | 8.1 | 多模态推理（256K，198B 总参 / 11B 激活 MoE） |
| `step-3.5-flash` | 0.7 | 0.14 | 2.1 | 推理（已在 registry） |
| `step-3.5-flash-2603` | 0.7 | 0.14 | 2.1 | 推理（Agent 优化） |
| `step-1o-turbo-vision` | 2.5 | 0.5 | 8 | 视觉（图像按 token 计，默认 169 tokens/图） |
| `stepaudio-2.5-realtime` | 10 | 2 | 70 | 语音（按 token） |
| `stepaudio-2.5-chat` | 10 | 2 | 25 | 语音（按 token） |
| `step-1o-audio` | 25 | 5 | 60 | 语音（按 token） |
| `step-audio-2` | 10 | 2 | 70 | 语音（按 token） |
| `step-audio-r1.5` | 10 | 2 | 105 | 语音（按 token） |

- **限时免费**（preview）：`stepaudio-3-realtime-preview`、`stepaudio-3-chat-preview`、`stepaudio-3-gen-preview`、`stepaudio-3-music-preview`。
- **非 token**：TTS 2.5 / 5.8 / 2.8 / 0.9 元/**万字符**；语音复刻 9.9 元/**音色**；ASR 2.8 / 0.15 / 1.2 / 2 / 0.9 / 2.2 / 2.6 元/**小时**；图片 `step-2x-large` 0.1、`step-image-edit-2` 0.02 元/**张**；增值能力 互联网搜索 0.04、文搜图 0.12 元/**次**；文件存储 0.5 元/**GB/天**。
- 缓存语义与 schema 一致：官方「缓存未命中」= `input`、「缓存命中」= `cachedInput`；**官方没有「缓存写入」单价** ⇒ `cacheWrite` 必须留 `null`（不是 0）。

**releasedAt**：**null**（全部在售模型）。官方只在生命周期页给**下线日**：`step-3`、`step-1-8k`、`step-1-32k`、`step-1v-8k`、`step-1v-32k`、`step-2-mini`、`step-1o-vision-32k`、`step-2-16k`、`step-1x-medium` 已于 **2026-07-08** 下线；`step-2x-large`、`step-image-edit-2` 将于 **2026-10-10** 下线。媒体（cnstock / sohu）的发布报道不作依据。

**schema 表达力**

| 官方事实 | 能否表达 |
|---|---|
| 十个 token 计费模型（输入未命中/命中/输出，1M tokens） | ✅ `per_1M_tokens` + `rates{input,cachedInput,output}` |
| 图片按张（0.1 / 0.02 元/张） | ✅ `mediaRates{kind:'image',unit:'per_image'}`（注意两模型 2026-10-10 下线，别默认展示） |
| Step Plan 月付 ¥49 / ¥99 / ¥199 / ¥699 + 月发 Credit | ✅ `billing{monthly,CNY}` + `quota{credits,monthly}` |
| Step Plan 年付 ¥456 / ¥936 / ¥1860 / ¥6666 | ✅ `billing{period:'yearly'}`（官方明写年付 Credit 仍按月发放 → 不要写成 one_time） |
| Step Plan 季付 ¥129 / ¥269 / ¥539 / ¥1889 | ❌ 无 `quarterly` |
| 加油包 ¥49/400M、¥99/1600M（独立 30 天，仅订阅用户） | ⚠️ 需另立记录 + 准入备注，别并进主档位 |
| 7 个 ASR 模型按「元/小时」 | ❌ 无 `per_hour`；折算 `per_minute` 会产生无限小数 → 不落 |
| 4 个 TTS 按「元/万字符」 | ⚠️ 只有 `per_1M_characters`，需 ×100 + `unitNote` 说明官方原文单位 |
| 增值能力 0.04 / 0.12 元/次 | ⚠️ 单位可表达但绑定「模型条目」，而官方是能力调用 |
| 文件存储 0.5 元/GB/天；语音复刻 9.9 元/音色 | ❌ 无单位 |
| 限时免费 preview | ⚠️ 限时活动按仓库分工属 Deals 侧，**不要写成 price=0** |

**中国侧 Coding 候选：Step Plan（adopted）**
四档 Credit 月池：**Flash Mini 400M ¥49/月（季 ¥129、年 ¥456）· Flash Plus 1600M ¥99（季 ¥269、年 ¥936）· Flash Pro 8000M ¥199（季 ¥539、年 ¥1860）· Flash Max 40000M ¥699（季 ¥1889、年 ¥6666）**；官方换算 **1M Credit = ¥1**；Credit 月内任意时段消耗、**月末清零不结转**；加油包 ¥49/400M、¥99/1600M（独立 30 天）；覆盖 step-5-preview / step-3.7-flash / step-3.5-flash(-2603) / StepAudio 系 / step-router-v1；官方明写**不适用阶梯限速**；接入地址 `api.stepfun.com/step_plan`（Claude Code / Anthropic 协议）与 `/step_plan/v1`（OpenAI 协议）。

**裁决：adopted。** 本轮 8 家里唯一「官方定价 + 官方订阅套餐都公开、可抽取、且大部分能被现有 schema 原样表达」的一家。

### 3.7 商汤科技 —— **partial**

**两个产品面必须分开看**（这是本家最容易出错的地方）：

| 面 | 域名 | 模型 | 价格 | 官方日期 |
|---|---|---|---|---|
| 大装置（模型调用计费） | `sensecore.cn` | SenseNova-V6.5-Pro/Turbo、V6-Pro/Turbo/Reasoner/Omni、SenseChat-Vision/Character(-Pro)、SenseNova-Audio-Fusion-0603、nova-tts-1 | ✅ 元/千tokens 表 + 元/分钟 + 元/万字符 | ✅ 发布动态页 |
| 日日新官网（当前产品面） | `sensenova.cn` | **SenseNova 6.8 Flash Lite**、**SenseNova U1.5 Lite** | ❌ 只有 Token Plan 公测免费档 | ❌ 无 |

**API Pricing**：大装置面公开（CNY，元/千tokens）——
`SenseNova-V6.5-Pro` 0.003 / 0.009；`V6.5-Turbo` 0.0015 / 0.0045；`V6-Pro` 0.003 / 0.009；`V6-Turbo` 0.0015 / 0.0045；`V6-Reasoner` 0.004 / 0.016；`SenseChat-Vision` 0.01 / 0.06；`V6-Omni` **0.2 元/分钟**；`SenseNova-Audio-Fusion-0603` **3.5 元/万字符**；`nova-tts-1` 限时免费体验；`SenseChat-Character-Pro` 0.015、`SenseChat-Character` 0.012（**官方写「输入tokens、输出tokens」同价 = 打包价**）。页首另有「2月28日起，日日新大模型全面降价」。

**releasedAt 官方证据**

- ✅ `SenseNova-V6.5-Pro / V6.5-Turbo` = **2025-07-23**（release-202507 段）
- ✅ `SenseNova-V6-Pro / V6-Reasoner / V6-Turbo` = **2025-04-09**；`V6-Omni` 标题挂在同一段下（页面未给它单独日期 → 记段日期，不另造精度）
- ❌ `SenseNova 6.8 Flash Lite` = null（大装置发布动态页最新一条是 2025.07.23，**没覆盖 6.8 线**，说明它不是当前产品面的发布渠道）
- ❌ `SenseNova U1.5 Lite` = null（官方新闻只说 **2026/08/25 接入 Token Plan**，不是模型发布日；且该页 URL slug 是 `20260911`，页头写 `2026/08/25`，两者不一致 → 只登记「接入」这条事实，日期不当作发布日）

**schema 表达力**：V6.x 输入/输出分明 → ✅ `per_1K_tokens`；`V6-Omni` 0.2 元/分钟 → ✅ `mediaRates{unit:'per_minute'}`（kind 需人工裁，建议 `audio`）；`SenseChat-Character(-Pro)` 打包价 → ❌；`3.5 元/万字符` → ⚠️ 需 ×100 + `unitNote`；Token Plan 免费档 → ✅ `regularPrice: 0`（0 = 官方确实免费）+ `quota{credits,rolling}`；付费档 Lite/Pro 官方只写「即将上线」→ 无价，**不许猜价**。

**中国侧 Coding 候选：SenseNova Token Plan（partial）**
公测期完全免费：**¥0/月**，**60,000 积分 / 5 小时**（「特殊模型除外」—— 这是额度例外条款，只能进 description），覆盖 **SenseNova 6.8 Flash Lite** 与 **SenseNova U1 Fast**，最多 20 个 API Key；官方新闻另写 U1.5 Lite「每 5 小时 1,500 次请求，公测期间完全免费」；**Lite / Pro 付费档「即将上线」**。

**裁决：partial。** 大装置面有官方公开价与官方发布日期（多为可落盘），日日新当前面（6.8 / U1.5）只有免费 Token Plan、既无公开按量价也无发布日期。
**重要约束**：**不能**把 6.8 Flash Lite 当成 V6.5 的「升级版」直接替换 —— 没有任何官方对照声明；两个面的模型名互不重叠，coverage-targets 必须按面写清。

### 3.8 360（360智脑开放平台）—— **partial**

**官方页面可访问性**：`ai.360.com/open/zh/models`（模型广场）200 —— 服务端渲染出「**共 94 个模型**」与完整筛选面（模型作者：**360智脑**、阿里巴巴、小米、月之暗面；供应商：**360智脑**、百度文心、硅基流动、贵州移动），但正文很快被可用性图表占满；按 `?search=360zhinao` 得 **12 个模型**，只抽出第一张卡的完整价格；模型详情页与作者页只返回标题（前端渲染）；官方文档站（Apifox）在「模型发现」下写着 `GET /v1/models` … **开发中**。

**API Pricing：部分公开**（¥ / 1M tokens）

- ✅ 已抽到完整价目的一条（360 自研）：
  **`360zhinao/360zhinao-turbo-llm-geo`**（作者 360智脑，「业务内部专用模型」）—— 输入 **¥1 / 1M tokens**、输出 **¥2 / 1M tokens**、缓存写入 **¥1.25**、缓存读取 **¥0.1**；上下文 116,000、最大输出 16,000；同模型出现在 360智脑 / 通义(alibaba) / 腾讯(tencent) 三个供应商下。
- ⚠️ `360zhinao/360zhinao-pro` 路由存在（HTTP 200）但正文不可抽 → 价格未知。
- ❌ 其余 360zhinao 模型：前端渲染，枚举不到。

**身份污染警告（本家最高风险）**：同一广场混排自研与转售模型，还存在 **360 品牌化的第三方路由**（搜索命中 `qwen-plus-360gpt-pro`、`deepseek-v3-360gpt-pro`，以及明确属别家的 `xiaomi/mimo-v2.6-pro` 等）。
→ **只有 `360zhinao/*` 属于本轮 first-party 目标**；转售模型的价格提供方是 360 平台而非模型开发商，**不得**登记到 `ai360` 名下（hosted-owner ≠ pricing-provider）。

**releasedAt**：null（广场与文档均无日期；官方 `GET /v1/models` 还标着「开发中」）。
**Coding 套餐**：无自营编码套餐；知识库里只有「CC Switch + Claude Code / Codex 快速配置」这类**接第三方工具**的文档 → 本轮不作为中国侧 Coding 候选。

**schema 表达力**：已抽到那条的四个价格字段与 schema 一一对应（输入→`input`、输出→`output`、缓存写入→`cacheWrite`、缓存读取→`cachedInput`，单位官方原样就是 1M tokens，无需换算）→ ✅ `adopted`（单条）。

**裁决：partial。** 自研族确实存在且价格可诚实表达，但枚举不全（前端渲染）、无发布日期、且站点内身份混排。

---

## 4. 中国侧 Coding 套餐候选（本文负责部分）

| 候选 | 提供方 | 价格锚点 | 官方页面 | 准入判据（官方原文可核） | 裁决 |
|---|---|---|---|---|---|
| **Step Plan** | 阶跃星辰 | ¥49 / ¥99 / ¥199 / ¥699 每月（Credit 月池，1M Credit = ¥1） | `platform.stepfun.com/docs/zh/step-plan/overview` | 覆盖 step-5-preview / 3.7-flash / 3.5-flash(-2603) / StepAudio / router；不适用阶梯限速 | **adopted** |
| **Astron Coding Plan** | 科大讯飞 | 高效版 ¥199/月；速通版 ¥999/月（限时首月 ¥699） | `xfyun.cn/doc/spark/CodingPlan.html` | `model=astron-code-latest`；只允许编程工具交互式使用，禁止脚本/批量/服务端；三窗口请求流控 | **adopted** |
| **Astron Token Plan** | 科大讯飞 | 标准 200 / 高级 600 / 尊享 2000 元·成员/月 | `xfyun.cn/doc/spark/TokenPlan.html` | 按「成员」发额度；逐模型积分单价；波谷 0.8 | **partial**（按席位维度 + 积分单价表无载体） |
| **SenseNova Token Plan** | 商汤科技 | Free 公测 ¥0/月（60,000 积分/5 小时）；Lite/Pro「即将上线」无价 | `sensenova.cn/token-plan` | 覆盖 6.8 Flash Lite / U1 Fast；最多 20 个 API Key | **partial**（付费档无价） |
| — 百川智能 | — | 官方公开面只有按量 + 知识库 + Embeddings 计费 | `platform.baichuan-ai.com/prices` | 无订阅套餐 | **deferred** |
| — 360 | — | 只有第三方工具接入文档（CC Switch + Claude Code / Codex） | `ai.360.com/docs` | 无自营编码套餐 | **deferred** |
| — xAI / Mistral / Cohere | — | 官方域不可达 / 正文不可抽取 | — | 连「有没有套餐」都无法判定 | **unverifiable** |

**落盘前的重复登记检查**：`plans.json` 现有 12 家身份是 `anthropic / baidu / codebuddy / cursor / github / minimax / moonshot / qoder / qoder-intl / trae / windsurf / zhipu`。
→ 讯飞、阶跃星辰、商汤是**新**的 plans 身份；其中讯飞 `providers.json` 已有身份，阶跃星辰与商汤**必须先补 `providers.json` 身份**（否则构建期硬红）。

---

## 5. 横向发现（会改变下游动作的）

| id | 严重度 | 发现 | 对下游的要求 |
|---|---|---|---|
| X-1 | high | 3 家官方定价面不可达/不可抽取（xAI、Mistral 全域 fetch failed；Cohere 可达但表体抽不出） | coverage-targets 记 `DEFERRED/UNVERIFIED` 并写明具体 URL 与失败形态；**区分「官方不公开」与「官方不可达」**，都不算 MISSING |
| X-2 | high | 打包价（「包含输入和输出」）在百川 6 条、商汤 2 条出现，而 `TOKEN_RATE_KEYS` 没有 blended 键 | 本轮不落这些条目，记 schema gap；若要扩展 schema，必须同时加判据（牙），不是加一个字段就完 |
| X-3 | high | 非 token 单位普遍且多数无字段：元/小时（StepFun 7）、元/GB·天（百川 1.5、StepFun 0.5）、元/音色（StepFun 9.9）、元/万字符（StepFun 4、商汤 1） | 元/小时与元/GB·天直接 `schema_not_supported`（**不换算**）；元/万字符落盘必须 ×100 + `unitNote`；元/音色不落 |
| X-4 | medium | releasedAt 只有商汤（2025-07-23 / 2025-04-09）与讯飞（Spark X2 Agent 2026-07-10）拿到官方日期 | `releasedAt=null` 必须是 **unknown**，不能推成 legacy；必须有「查过但官方没给」的结论 |
| X-5 | medium | 360 与讯飞星辰都是「自研 + 转售」聚合面；360 还有品牌化的第三方路由 | 只为自研族建 first-party 目标；转售模型一律排除，并在报告里写明这条纪律 |
| X-6 | medium | 季度价无 `quarterly` period（Step Plan 季付、讯飞 Coding 季付） | 季付只进 note/promoNote；**不要**生成 `monthly` 记录 |
| X-7 | medium | 三窗口额度（5 小时/周/月）装不进单 quota 对象 | 选一个规范窗口进 quota，其余用 `restrictions(rolling_window / per_day_cap)` 或 description，并注明官方原文 |
| X-8 | low | 身份层缺口：`baichuan / stepfun / sensetime / ai360` 只有 deals 侧官方域，`providers.json` 无身份；`xai / mistral / cohere` 连官方域都没有 | t11 必须先补 `providers.json`，否则记录无法构建 |
| X-9 | low | 「免费」性质不同（StepFun preview 限时免费、百川 Assistants 限时免费、商汤 nova-tts-1 限时免费体验、Token Plan 公测免费） | 长期免费 → `freeTier(stability:'standing')`；限时 → 留在 Deals 侧；**不要写 price=0** |

---

## 6. 不落盘清单（明确不做，避免被当成遗漏）

| 不落的东西 | 原因 |
|---|---|
| xAI / Mistral / Cohere 的任何记录 | 官方来源不可达或不可抽取，零 evidence |
| 百川打包价 6 条（Baichuan4 / 4-Turbo / 4-Air / 3-Turbo / 3-Turbo-128k / 2-Turbo） | schema 无 blended 键 |
| 百川 搜索增强 / 医疗搜索 / 文件存储 | 单位与载体都不匹配 |
| 商汤 SenseChat-Character(-Pro) | 打包价 |
| StepFun ASR（元/小时）/ 文件存储 / 音色复刻 | 无对应单位 |
| 讯飞常规 API 定价 | 官方明确不公开静态价目表 |
| 讯飞 Token Plan 逐模型积分单价表 | 积分不是法定币种，API schema 装不下 |
| 360 平台上的第三方模型（qwen / deepseek / 小米 / 月之暗面 等） | pricing provider 是 360 平台，不是模型开发商 |
| 所有季付价、所有「限时免费」写成 0 的写法 | 无 period / 会把限时说成长期定价 |

---

## 7. 交接（给 t11 数据落盘 / coverage-targets）

**要在 `providers.json` 新建的身份**（key / name / slug / vendorKey / officialDomains）：

- `stepfun` / 阶跃星辰 / `stepfun` / `stepfun` / `["stepfun.com"]`
- `sensetime` / 商汤科技 / `sensetime` / `sensetime` / `["sensetime.com","sensecore.cn","sensenova.cn"]`
- `ai360` / 360智脑 / `ai360` / `ai360` / `["360.com"]`
- `baichuan` / 百川智能 / `baichuan` / `baichuan` / `["baichuan-ai.com"]`
- 已存在、无需新建：`iflytek`（`officialDomains: ["xfyun.cn"]`）

> ⚠️ `officialDomains` 是**白名单**且要求「每一条登记都必须被仓库里至少一条真实记录的官方出处用到」：商汤的 3 个域、360 的 `360.com`、讯飞的 `xfyun.cn` 都必须真的出现在对应记录的 `officialUrl` / `sourceUrl` / `evidence[].sourceUrl` 里，否则就是一句自我声明。

**可落盘的 API 计费（adopted）**：阶跃星辰 10 条 token 模型 + 2 条图片；百川 M 系列 4 条；商汤 V6.x 7 条（含 1 条 per_minute）；360 自研 1 条。
**可落盘的套餐（adopted）**：阶跃星辰 Step Plan 四档（月付）+ 年付；讯飞 Astron Coding Plan 两档在售；商汤 Token Plan 免费档。

**coverage-targets 的层级建议**：tier1 = `stepfun / sensetime / baichuan / iflytek / ai360`（有官方来源，可判覆盖）；tier2 = `xai / mistral / cohere`（本轮 `UNVERIFIED`，其 `currentTargets` 必须留空并写明原因，**不能**用第三方页面的模型名凑数）。

---

## 8. 复算方式与残余限制

- **复算**：所有引文、URL、HTTP 状态、抽取失败形态都逐条记在 `research/_raw/coverage-expansion-v1/firstparty.json` 的 `vendors[].access` / `apiPricing.evidence` / `releasedAtEvidence` 里，可逐条重放。
- **本环境的抓取限制（如实记录）**：`x.ai`、`mistral.ai`、`docs.mistral.ai` 全域 fetch failed；`cohere.com`、`docs.cohere.com`、`platform.sensenova.cn`、`ai.360.com` 详情页、`xinghuo.xfyun.cn`、`maas.xfyun.cn` 属「HTTP 200 但正文前端渲染，抽取不到」。这些是**工具/网络限制**，不是厂商状态，报告中必须与「官方不公开」区分。
- **本轮未做**：模型真实调用验证（无 API Key，且本任务只做公开面调查）；`releasedAt` 的穷举追查（只查了官方定价页 / 文档 / 发布动态 / 官网新闻四类官方面）。

---

## 附：落盘结果总表（t20 追加，2026-10-05）

> 本节由 **t20（最终完成报告）** 追加：调查结论在上文，本节给**迁移后盘上真实落盘了什么**的机读总表，
> 供 `research/coverage-expansion-v1-report.md` 与后来者逐行对账。出处：`scripts/data/providers.json` · `plans.json` · `api-plans.json` · `scripts/data/coverage-targets.json`。

家数对账：providers 注册 **34** · plans 覆盖 **18** 家 · api-plans 覆盖 **14** 家 · coverage-targets **34** 行（双向对账差集为空）。

| provider | 官方域 | plans 条数 | api-plans 条数 | coverage-target |
| --- | --- | --- | --- | --- |
| `ai360` | 360.com | 0 | 0 | 有 |
| `aliyun` | aliyun.com | 0 | 2 | 有 |
| `anthropic` | anthropic.com · claude.com | 1 | 1 | 有 |
| `aws` | aws.amazon.com | 2 | 0 | 有 |
| `baichuan` | baichuan-ai.com | 0 | 0 | 有 |
| `baidu` | baidu.com | 2 | 0 | 有 |
| `cerebras` | cerebras.ai | 0 | 1 | 有 |
| `codebuddy` | codebuddy.ai · codebuddy.cn | 4 | 0 | 有 |
| `coze` | coze.cn | 0 | 0 | 有 |
| `cursor` | cursor.com | 1 | 0 | 有 |
| `deepseek` | deepseek.com | 0 | 2 | 有 |
| `fireworks` | fireworks.ai | 0 | 1 | 有 |
| `github` | github.com | 3 | 0 | 有 |
| `google` | google.com · ai.google.dev · gemini.google · blog.google · codeassist.google | 2 | 1 | 有 |
| `groq` | groq.com | 0 | 1 | 有 |
| `iflytek` | xfyun.cn | 2 | 0 | 有 |
| `jetbrains` | jetbrains.com | 2 | 0 | 有 |
| `microsoft` | microsoft.com | 0 | 0 | 有 |
| `minimax` | minimax.cn · hailuoai.com | 3 | 1 | 有 |
| `moonshot` | kimi.com | 1 | 0 | 有 |
| `notion` | notion.com | 0 | 0 | 有 |
| `openai` | openai.com · chatgpt.com | 0 | 2 | 有 |
| `qoder` | help.aliyun.com · qoder.com | 1 | 0 | 有 |
| `qoder-intl` | qoder.com | 2 | 0 | 有 |
| `replit` | replit.com | 2 | 0 | 有 |
| `sensetime` | sensetime.com | 0 | 0 | 有 |
| `siliconflow` | siliconflow.cn | 0 | 1 | 有 |
| `stepfun` | stepfun.com | 4 | 0 | 有 |
| `tencent` | tencent.com | 0 | 1 | 有 |
| `together` | together.ai | 0 | 1 | 有 |
| `trae` | trae.cn | 2 | 0 | 有 |
| `volcengine` | volcengine.com | 0 | 1 | 有 |
| `windsurf` | windsurf.com | 2 | 0 | 有 |
| `zhipu` | bigmodel.cn | 1 | 1 | 有 |

### 未落盘的候选（Data Not Added）

- 未采纳 provider 逐条 **13 项**（`gaps.notAdoptedProviders[]`）
- Tabnine：官方独立档价面已不存在（302 → Tricentis 联系表单）；xAI / Mistral / Cohere：官方页不可抽或不可达；Kiro：超出本轮 6 家名单
- 12 条 `DEFER-INF-01..12` schema 表达力缺口 + 打包价 / 季付 / 积分 / 按小时 / 年付（刻意不落盘、不换算）

### 关系层与处置登记的规模（落盘后的账）

- 关系层 links **82** 条 = API 侧 **69** + Coding 侧 **13**
- 处置登记 declarations **54** 条 = Coding **42** + API **12**
- 计价条目 **93** = 映射 81 + 处置 12 + 未判 0（`coverage-report --json`）
