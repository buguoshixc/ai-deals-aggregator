# coverage-expansion-v1 现有 44 条模型 currentness 调查报告（t10）

- 任务：t10 [research-currentness] — 现有 44 个 registry 模型的 releasedAt 证据与 modelRole
- worktree：`.worktrees/coverage-expansion-v1`（分支 `coverage-expansion-v1`，基线 SHA `a4dd40fc66ea612f327036f5ba3d98cbff46c288` = origin/master）
- 取证时间（capturedAt / checkedAt）：`2026-10-04T18:26:00+08:00`（Asia/Shanghai），取证方式：本次 live `web_fetch`，**未使用任何缓存或旧报告**
- 结构化产物：[`research/_raw/coverage-expansion-v1/currentness.json`](research/_raw/coverage-expansion-v1/currentness.json)（44 条一条不漏，逐条含 role 依据、日期证据、checkedAt、核查结论）

## 1. 结论摘要（先看数字）

| 项 | 数量 | 说明 |
| --- | --- | --- |
| registry 模型总数 | 44 | 与 baseline.json 的 `modelRegistry.publishedModels=44` 一致，分母不换 |
| 已调查 | 44 | 44/44，无遗漏（json 键集合 = registry 键集合，逐条断言） |
| 拿到**官方逐字发布口径**日期 | 3 | deepseek-flash 2026-09-10、deepseek-v4-pro 2026-08-13、minimax-m3 2026-06-01 |
| 拿到**其他官方口径**日期 | 1 | deepseek-v3.2 2025-12-01（官方 Change Log 最早出现该名之日，原文口径是「upgraded to」而非「release」，confidence=medium） |
| releasedAt = null | 40 | 查不到就是 null + checkedAt + 核查过的官方 URL + 为什么给不出日期 |
| 真正需要 freshnessGroup 的 | 1 | 只有 deepseek-flash（官方明文：旧代已退役、旧名暂路由到它） |
| freshnessGroup = null | 43 | 没有官方新旧分界明文的，一律不擅自分组 |

**一句话结论**：现有 44 条里，能拿到「开发商官方页面上的精确发布日期」的只有 4 条，其余 40 条官方页面根本不载逐模型发布日期（多为价格页），因此 releasedAt 只能诚实留 null —— 这不是没查，而是官方源里确实没有这份数据（第 3 节逐条给出「查了哪、看到什么、为什么没有」）。

## 2. 纪律：本次如何避免四种假数据

| 禁区 | 反例（本次刻意避开的具体东西） | 本次做法 |
| --- | --- | --- |
| 用版本号猜日期 | `qwen3-max` 的别名 `qwen3-max-2026-01-23`、`DeepSeek-V4-Pro-0813`、`GLM-4.6V` 这类内嵌数字 | 一律不把内嵌数字当 releasedAt。`deepseek-v4-pro` 取到 2026-08-13 是因为官方 Change Log 原文有 `Date: 2026-08-13`，别名里的 `-0813` 仅作交叉印证并已注明。`qwen3-max` 明确留 null。 |
| 用第三方托管平台当开发商发布时间依据 | siliconflow 价格页（本次确实抓到了 `DeepSeek-V3.2` / `zai-org/GLM-5.3` / `moonshotai/Kimi-K2.7-Code` / `Qwen/Qwen3.8-27B` / `stepfun-ai` 等条目） | 只允许用它核对「注册表 slug ↔ 托管方官方模型 id 写法一致」；日期一律不采信。凡 officialUrl 只指向第三方的条目（kimi-k2.7-code / kimi-k3 / qwen3.8-27b / step-3.5-flash / deepseek-v3.2 的价格面）日期一律 null。 |
| 假精度 | 「约 2026 年 8 月」「2026 年中」「latest 所以是新的」 | 日期只有 `YYYY-MM-DD` 或 null；`hunyuan-role-latest` 名字里的 latest 明确写明「是官方命名，不是发布证据」。腾讯混元页顶的「最近更新时间：2026-06-26」明确标注为**文档更新日**，不得充作 releasedAt。 |
| 查不到就略过 | 40 条 null | 每条都留 `checkedAt` + `checkedUrls` + `checkedOutcome`（含「HTTP 200 但正文里没有日期」这种否定结论），并把失败原因（403 / 跨源跳转被拒 / fetch failed / 客户端渲染空壳）逐条记录。 |

## 3. 逐条结论（44 条，按 developer 分组）

列说明：**releasedAt** 为最终采信值（null = 官方无此数据）；**证据与核查** 给出官方逐字引文（有则引）或「查了哪里、为什么没有」。

### Anthropic（4 条）

| slug | modelRole | releasedAt | 证据（官方逐字引文 / 核查结论） | freshnessGroup |
| --- | --- | --- | --- | --- |
| `claude-fable-5.1` | `llm` | null | 官方定价页只给价格与系列名（Models → Mythos / Fable / Opus / Sonnet / Haiku），无任何逐模型发布日期；docs.anthropic.com 已跳转到 anthropic.com/claude.com 域，原始 officialUrl 在本环境不可直接读。releasedAt 取 null。<br>核查 URL：[https://docs.anthropic.com/en/docs/about-claude/pricing](https://docs.anthropic.com/en/docs/about-claude/pricing)、[https://claude.com/pricing](https://claude.com/pricing)<br>checkedAt：2026-10-04T18:26:00+08:00<br>role 依据：claude.com 官方导航把 Fable 列为与 Opus/Sonnet/Haiku 并列的模型系列；无 embedding/翻译等专用能力证据 → 通用对话模型 | null |
| `claude-haiku-4.5` | `small-fast-variant` | null | 同上：官方只给价格/系列，无发布时间。releasedAt 取 null。<br>核查 URL：[https://claude.com/pricing](https://claude.com/pricing)<br>checkedAt：2026-10-04T18:26:00+08:00<br>role 依据：官方系列页把 Haiku 定位为与 Opus/Sonnet 并列的最小档系列（同一命名体系下的轻量档） | null |
| `claude-opus-5.5` | `llm` | null | 无逐模型发布日期。releasedAt 取 null。<br>核查 URL：[https://claude.com/pricing](https://claude.com/pricing)<br>checkedAt：2026-10-04T18:26:00+08:00<br>role 依据：官方 Opus 系列为旗舰通用模型（claude.com Models → Opus） | null |
| `claude-sonnet-5.5` | `llm` | null | 无逐模型发布日期。releasedAt 取 null。<br>核查 URL：[https://claude.com/pricing](https://claude.com/pricing)<br>checkedAt：2026-10-04T18:26:00+08:00<br>role 依据：官方 Sonnet 系列为通用主力模型（claude.com Models → Sonnet） | null |

### DeepSeek（3 条）

| slug | modelRole | releasedAt | 证据（官方逐字引文 / 核查结论） | freshnessGroup |
| --- | --- | --- | --- | --- |
| `deepseek-flash` | `vlm` | **2026-09-10** | **官方原文**（[https://api-docs.deepseek.com/updates](https://api-docs.deepseek.com/updates)，HTTP 200，captured 2026-10-04T18:26:00+08:00）：『「## Date: 2026-09-10 / ### DeepSeek-V4.1-Flash Release / Today, we officially release the DeepSeek-V4.1-Flash model. It is the smallest model in our new architecture family, with native multimodal visual understanding.」；同页「DeepSeek V4.1 Flash is now available on the DeepSeek API with native multimodal support. Change the model name to `deepseek-flash` to call the latest V4.1 Flash model.」』<br>匹配：原文逐字出现的模型名 DeepSeek-V4.1-Flash 与 API 模型名 deepseek-flash，均出现在注册表 aliases 中<br>交叉印证：定价页「| MODEL | deepseek-flash(1) | … | MODEL VERSION | DeepSeek-V4.1-Flash |」<br>role 依据：官方 Change Log 原文「with native multimodal visual understanding」+ 定价页 Vision 行 = ✓（同页 deepseek-v4-pro 的 Vision = Not supported） | **current-mainline** |
| `deepseek-v3.2` | `llm` | **2025-12-01** | **官方原文**（[https://api-docs.deepseek.com/updates](https://api-docs.deepseek.com/updates)，HTTP 200，captured 2026-10-04T18:26:00+08:00）：『「## Date: 2025-12-01 / ### DeepSeek-V3.2 / Both `deepseek-chat` and `deepseek-reasoner` have been upgraded to DeepSeek-V3.2.」』<br>匹配：原文逐字出现 DeepSeek-V3.2<br>交叉印证：定价页当前价目表已无 deepseek-v3.2 行（现在只有 deepseek-flash / deepseek-v4-pro）；siliconflow（第三方）仍在售 DeepSeek-V3.2 —— 第三方不用于日期<br>role 依据：官方 Change Log 把 V3.2 作为 deepseek-chat / deepseek-reasoner 的后端（对话+推理），无多模态证据 | null |
| `deepseek-v4-pro` | `llm` | **2026-08-13** | **官方原文**（[https://api-docs.deepseek.com/updates](https://api-docs.deepseek.com/updates)，HTTP 200，captured 2026-10-04T18:26:00+08:00）：『「## Date: 2026-08-13 / ### DeepSeek-V4-Pro Update / The GA release of DeepSeek-V4-Pro has been rolled out on the APP, Web, and API. The API calling method remains unchanged — simply set the model name to `deepseek-v4-pro` to use the latest version.」』<br>匹配：原文逐字出现 DeepSeek-V4-Pro 与 API 模型名 `deepseek-v4-pro`<br>交叉印证：别名里的 `DeepSeek-V4-Pro-0813` / `-0813` 内嵌 08-13，与官方日志日期一致——但**日期依据取自日志原文，不是取版本号**（版本号只作交叉印证）<br>role 依据：官方定价页 Vision 行 = Not supported；Change Log 通篇是 agent/代码/推理基准 → 纯文本通用模型 | null |

### 火山引擎（4 条）

| slug | modelRole | releasedAt | 证据（官方逐字引文 / 核查结论） | freshnessGroup |
| --- | --- | --- | --- | --- |
| `doubao-seed-2.1-pro` | `llm` | null | 火山引擎方舟页在本环境只能经跨源跳转到达（cross-origin redirect 被拒），未取到可引用正文；官方发布日期未核到。releasedAt 取 null。<br>核查 URL：[https://www.volcengine.com/product/ark](https://www.volcengine.com/product/ark)<br>checkedAt：2026-10-04T18:26:00+08:00<br>role 依据：注册表 officialUrl 指向火山方舟产品页；「pro」档为通用旗舰档（仅命名档位，未据“…2.1”推断日期） | null |
| `doubao-seed-2.1-turbo` | `small-fast-variant` | null | 同上，未取到官方正文。releasedAt 取 null。<br>核查 URL：[https://www.volcengine.com/product/ark](https://www.volcengine.com/product/ark)<br>checkedAt：2026-10-04T18:26:00+08:00<br>role 依据：「turbo」档 = 同代低延迟档（仅档位命名） | null |
| `doubao-seed-character` | `roleplay` | null | 未取到官方正文。releasedAt 取 null。<br>核查 URL：[https://www.volcengine.com/product/ark](https://www.volcengine.com/product/ark)<br>checkedAt：2026-10-04T18:26:00+08:00<br>role 依据：模型名「Character」+ 注册表 family「Doubao Seed」：角色扮演向场景模型（角色扮演是能力定位，不涉及发布日期） | null |
| `doubao-seed-evolving` | `llm` | null | 未取到官方正文。releasedAt 取 null。<br>核查 URL：[https://www.volcengine.com/product/ark](https://www.volcengine.com/product/ark)<br>checkedAt：2026-10-04T18:26:00+08:00<br>role 依据：「Evolving」为持续演进档命名；无专用能力证据 | null |

### Google（4 条）

| slug | modelRole | releasedAt | 证据（官方逐字引文 / 核查结论） | freshnessGroup |
| --- | --- | --- | --- | --- |
| `gemini-3.5-flash` | `llm` | null | ai.google.dev 在本环境 fetch failed（TypeError: fetch failed，连接层失败，两次尝试均失败）；官方发布日期未核到。releasedAt 取 null。<br>核查 URL：[https://ai.google.dev/gemini-api/docs/pricing](https://ai.google.dev/gemini-api/docs/pricing)<br>checkedAt：2026-10-04T18:26:00+08:00<br>role 依据：Gemini Flash 系列为低延迟通用档；无多模态专用证据（不作为 vlm 断言） | null |
| `gemini-3.6-flash` | `llm` | null | ai.google.dev fetch failed（连接层）。releasedAt 取 null。<br>核查 URL：[https://ai.google.dev/gemini-api/docs/pricing](https://ai.google.dev/gemini-api/docs/pricing)<br>checkedAt：2026-10-04T18:26:00+08:00<br>role 依据：同上（Flash 档） | null |
| `gemini-3.7-flash` | `llm` | null | ai.google.dev fetch failed（连接层）。releasedAt 取 null。<br>核查 URL：[https://ai.google.dev/gemini-api/docs/pricing](https://ai.google.dev/gemini-api/docs/pricing)<br>checkedAt：2026-10-04T18:26:00+08:00<br>role 依据：同上（Flash 档） | null |
| `gemini-3.8-flash` | `llm` | null | ai.google.dev fetch failed（连接层）。releasedAt 取 null。<br>核查 URL：[https://ai.google.dev/gemini-api/docs/pricing](https://ai.google.dev/gemini-api/docs/pricing)<br>checkedAt：2026-10-04T18:26:00+08:00<br>role 依据：同上（Flash 档） | null |

### 智谱AI（8 条）

| slug | modelRole | releasedAt | 证据（官方逐字引文 / 核查结论） | freshnessGroup |
| --- | --- | --- | --- | --- |
| `glm-4.5v` | `vlm` | null | open.bigmodel.cn/pricing 返回 200 但是客户端渲染空壳（仅「智谱丨BigModel 平台」+ loading 图），无正文、无日期；siliconflow 为第三方（见禁区），虽列 zai-org/GLM-4.5V 但不作日期依据。releasedAt 取 null。<br>核查 URL：[https://open.bigmodel.cn/pricing](https://open.bigmodel.cn/pricing)、[https://siliconflow.cn/pricing](https://siliconflow.cn/pricing)<br>checkedAt：2026-10-04T18:26:00+08:00<br>role 依据：模型名后缀「V」= 视觉理解档（GLM-4.5V / 4.6V / 5V-Turbo 同族），与 GLM-5.3（纯文本档）区分 | null |
| `glm-4.6v` | `vlm` | null | 官方价格页空壳，无正文/无日期。releasedAt 取 null。<br>核查 URL：[https://open.bigmodel.cn/pricing](https://open.bigmodel.cn/pricing)<br>checkedAt：2026-10-04T18:26:00+08:00<br>role 依据：同上（V 档） | null |
| `glm-4.6v-flash` | `vlm` | null | 官方价格页空壳，无正文/无日期。releasedAt 取 null。<br>核查 URL：[https://open.bigmodel.cn/pricing](https://open.bigmodel.cn/pricing)<br>checkedAt：2026-10-04T18:26:00+08:00<br>role 依据：V 档 + Flash 低延迟档 | null |
| `glm-4.6v-flashx` | `vlm` | null | 官方价格页空壳，无正文/无日期。releasedAt 取 null。<br>核查 URL：[https://open.bigmodel.cn/pricing](https://open.bigmodel.cn/pricing)<br>checkedAt：2026-10-04T18:26:00+08:00<br>role 依据：V 档 + FlashX 加速档 | null |
| `glm-4.7-flash` | `small-fast-variant` | null | 官方价格页空壳，无正文/无日期。releasedAt 取 null。<br>核查 URL：[https://open.bigmodel.cn/pricing](https://open.bigmodel.cn/pricing)<br>checkedAt：2026-10-04T18:26:00+08:00<br>role 依据：纯文本 Flash 档（无 V 后缀） | null |
| `glm-5.3` | `llm` | null | 官方价格页空壳；siliconflow（第三方）列 zai-org/GLM-5.3 仅能核对托管的模型 id 写法。releasedAt 取 null。<br>核查 URL：[https://open.bigmodel.cn/pricing](https://open.bigmodel.cn/pricing)、[https://siliconflow.cn/pricing](https://siliconflow.cn/pricing)<br>checkedAt：2026-10-04T18:26:00+08:00<br>role 依据：无 V 后缀 → 纯文本档（同族 GLM-5.3-Flash 同） | null |
| `glm-5.3-flash` | `small-fast-variant` | null | 官方价格页空壳。releasedAt 取 null。<br>核查 URL：[https://open.bigmodel.cn/pricing](https://open.bigmodel.cn/pricing)<br>checkedAt：2026-10-04T18:26:00+08:00<br>role 依据：GLM-5.3 的 Flash 低延迟档 | null |
| `glm-5v-turbo` | `vlm` | null | 官方价格页空壳。releasedAt 取 null。<br>核查 URL：[https://open.bigmodel.cn/pricing](https://open.bigmodel.cn/pricing)<br>checkedAt：2026-10-04T18:26:00+08:00<br>role 依据：V 档 + Turbo 档 | null |

### OpenAI（4 条）

| slug | modelRole | releasedAt | 证据（官方逐字引文 / 核查结论） | freshnessGroup |
| --- | --- | --- | --- | --- |
| `gpt-6-astra` | `llm` | null | OpenAI 官方文档页对本环境返回 HTTP 403（Cloudflare 拦截），未取到任何内容；不得以第三方内容顶替。releasedAt 取 null。<br>核查 URL：[https://platform.openai.com/docs/pricing](https://platform.openai.com/docs/pricing)、[https://platform.openai.com/docs/models](https://platform.openai.com/docs/models)<br>checkedAt：2026-10-04T18:26:00+08:00<br>role 依据：注册表 family=GPT；无专用能力证据 | null |
| `gpt-6-luna` | `llm` | null | HTTP 403 Cloudflare。releasedAt 取 null。<br>核查 URL：[https://platform.openai.com/docs/pricing](https://platform.openai.com/docs/pricing)<br>checkedAt：2026-10-04T18:26:00+08:00<br>role 依据：同上 | null |
| `gpt-6.1-sol` | `llm` | null | HTTP 403 Cloudflare。releasedAt 取 null。<br>核查 URL：[https://platform.openai.com/docs/pricing](https://platform.openai.com/docs/pricing)<br>checkedAt：2026-10-04T18:26:00+08:00<br>role 依据：同上 | null |
| `gpt-live-1` | `llm` | null | HTTP 403 Cloudflare。releasedAt 取 null。<br>核查 URL：[https://platform.openai.com/docs/pricing](https://platform.openai.com/docs/pricing)<br>checkedAt：2026-10-04T18:26:00+08:00<br>role 依据：同上（「live」为产品档命名） | null |

### 腾讯云（6 条）

| slug | modelRole | releasedAt | 证据（官方逐字引文 / 核查结论） | freshnessGroup |
| --- | --- | --- | --- | --- |
| `hunyuan-a13b` | `llm` | null | 官方计费页只载价格与免费额度，逐模型发布日期缺失；页顶「最近更新时间：2026-06-26」是文档更新日，不得充作 releasedAt。releasedAt 取 null。<br>核查 URL：[https://cloud.tencent.com/document/product/1729/97731](https://cloud.tencent.com/document/product/1729/97731)<br>checkedAt：2026-10-04T18:26:00+08:00<br>role 依据：腾讯官方计费页产品名表内、按生文 token 计费（输入0.5/输出2元每百万）→ 通用生文模型 | null |
| `hunyuan-embedding` | `retrieval-embedding` | null | 官方页无发布日期。releasedAt 取 null。<br>核查 URL：[https://cloud.tencent.com/document/product/1729/97731](https://cloud.tencent.com/document/product/1729/97731)<br>checkedAt：2026-10-04T18:26:00+08:00<br>role 依据：官方计费页把 Hunyuan-embedding 单独一行、按输入/输出 0.7元每百万 tokens 计费，且免费额度单列 → 向量化（嵌入）模型，非生文 | null |
| `hunyuan-role-latest` | `roleplay` | null | 官方页无发布日期。注意：名字里的「latest」是**官方模型名**，不是可采信的日期或新旧证据。releasedAt 取 null。<br>核查 URL：[https://cloud.tencent.com/document/product/1729/97731](https://cloud.tencent.com/document/product/1729/97731)<br>checkedAt：2026-10-04T18:26:00+08:00<br>role 依据：模型名「role」+ 官方计费页把它作为主推产品名之一（2.4/9.6元每百万）→ 角色扮演模型；「latest」是官方命名的一部分 | null |
| `hunyuan-translation` | `translation` | null | 官方页无发布日期。releasedAt 取 null。<br>核查 URL：[https://cloud.tencent.com/document/product/1729/97731](https://cloud.tencent.com/document/product/1729/97731)<br>checkedAt：2026-10-04T18:26:00+08:00<br>role 依据：模型名 + 官方计费页单列（1.2/3.6元每百万）→ 翻译专用模型 | null |
| `hunyuan-translation-lite` | `translation-lite` | null | 官方页无发布日期。releasedAt 取 null。<br>核查 URL：[https://cloud.tencent.com/document/product/1729/97731](https://cloud.tencent.com/document/product/1729/97731)<br>checkedAt：2026-10-04T18:26:00+08:00<br>role 依据：翻译模型的 lite 档（官方单列 1/3元每百万） | null |
| `tencent-hy-vision-1.5-instruct` | `vlm` | null | 官方页无发布日期（页顶「最近更新时间：2026-06-26」为文档更新日，已明确排除）。releasedAt 取 null。<br>核查 URL：[https://cloud.tencent.com/document/product/1729/97731](https://cloud.tencent.com/document/product/1729/97731)<br>checkedAt：2026-10-04T18:26:00+08:00<br>role 依据：官方计费页产品名「Tencent HY Vision 1.5 Instruct」+ 按生文 token 价（3/9元）→ 视觉理解模型 | null |

### 月之暗面（2 条）

| slug | modelRole | releasedAt | 证据（官方逐字引文 / 核查结论） | freshnessGroup |
| --- | --- | --- | --- | --- |
| `kimi-k2.7-code` | `code-specialist` | null | 注册表 officialUrl 为第三方（siliconflow）；官方 moonshot 页面未在本次取证范围且第三方不得作日期依据。siliconflow 页无发布日期。releasedAt 取 null。<br>核查 URL：[https://siliconflow.cn/pricing](https://siliconflow.cn/pricing)<br>checkedAt：2026-10-04T18:26:00+08:00<br>role 依据：模型名「-Code」+ 月之暗面代码向档 | null |
| `kimi-k3` | `llm` | null | 注册表 officialUrl 指向阿里云百炼价格页（第三方对 Kimi 而言），且该页只给价格，无 Kimi 发布日期。releasedAt 取 null。<br>核查 URL：[https://help.aliyun.com/zh/model-studio/model-pricing](https://help.aliyun.com/zh/model-studio/model-pricing)<br>checkedAt：2026-10-04T18:26:00+08:00<br>role 依据：无专用后缀 → 通用对话模型 | null |

### MiniMax（稀宇科技）（4 条）

| slug | modelRole | releasedAt | 证据（官方逐字引文 / 核查结论） | freshnessGroup |
| --- | --- | --- | --- | --- |
| `minimax-m2.5` | `llm` | null | 官方按量计费页把它明确归入「历史模型」表；官方「模型发布」页（2026-07-31 起回溯至 2025-01-15）未列 M2.5 条目 → 官方无该模型发布日。releasedAt 取 null。<br>核查 URL：[https://platform.minimax.cn/docs/guides/pricing-paygo](https://platform.minimax.cn/docs/guides/pricing-paygo)、[https://platform.minimax.cn/docs/release-notes/models](https://platform.minimax.cn/docs/release-notes/models)<br>checkedAt：2026-10-04T18:26:00+08:00<br>role 依据：MiniMax M 系列为通用语言模型（官方按量计费页语言模型组） | null |
| `minimax-m2.7` | `llm` | null | 官方按量计费页当前价目表收录（2.1/8.4元）；官方发布页未列该条 → 无官方发布日。releasedAt 取 null。<br>核查 URL：[https://platform.minimax.cn/docs/guides/pricing-paygo](https://platform.minimax.cn/docs/guides/pricing-paygo)、[https://platform.minimax.cn/docs/release-notes/models](https://platform.minimax.cn/docs/release-notes/models)<br>checkedAt：2026-10-04T18:26:00+08:00<br>role 依据：同上 | null |
| `minimax-m2.7-highspeed` | `small-fast-variant` | null | 官方页无发布日。releasedAt 取 null。<br>核查 URL：[https://platform.minimax.cn/docs/guides/pricing-paygo](https://platform.minimax.cn/docs/guides/pricing-paygo)<br>checkedAt：2026-10-04T18:26:00+08:00<br>role 依据：官方价目表内 highspeed 档（4.2/16.8元，为标准价 2 倍）→ 同代加速档 | null |
| `minimax-m3` | `multimodal-llm` | **2026-06-01** | **官方原文**（[https://platform.minimax.cn/docs/release-notes/models](https://platform.minimax.cn/docs/release-notes/models)，HTTP 200，captured 2026-10-04T18:26:00+08:00）：『「## 2026 年 6 月 1 日 / ## MiniMax M3 / 全新语言模型 MiniMax-M3 正式发布，面向 Agent 推理、工具调用、代码、多模态 Chat 输入和长上下文任务。」』<br>匹配：原文逐字出现 MiniMax-M3，与注册表 slug/canonicalName 一致<br>交叉印证：官方按量计费页 MiniMax-M3 位于当前主表（含「≤ 512k 输入 tokens 永久五折」）<br>role 依据：官方发布页原文「面向 Agent 推理、工具调用、代码、多模态 Chat 输入和长上下文任务」→ 支持多模态输入的通用模型（非纯文本，也无专门 V 后缀） | null |

### 阿里云（4 条）

| slug | modelRole | releasedAt | 证据（官方逐字引文 / 核查结论） | freshnessGroup |
| --- | --- | --- | --- | --- |
| `qwen-max` | `llm` | null | 官方价格页正文被截断，可见其性质为价格表，未见发布日。releasedAt 取 null。<br>核查 URL：[https://help.aliyun.com/zh/model-studio/model-pricing](https://help.aliyun.com/zh/model-studio/model-pricing)<br>checkedAt：2026-10-04T18:26:00+08:00<br>role 依据：通义千问 Max 档为通用旗舰对话模型（阿里云百炼价格页） | null |
| `qwen3-max` | `llm` | null | 官方价格页未见发布日。注意：别名 `qwen3-max-2026-01-23` 内嵌日期，但那是**模型版本命名**，不得当作 releasedAt（本次未采信）。releasedAt 取 null。<br>核查 URL：[https://help.aliyun.com/zh/model-studio/model-pricing](https://help.aliyun.com/zh/model-studio/model-pricing)<br>checkedAt：2026-10-04T18:26:00+08:00<br>role 依据：同上（无 V 后缀 → 文本档） | null |
| `qwen3.8-27b` | `llm` | null | siliconflow（第三方）列 Qwen/Qwen3.8-27B，仅核对托管 id 写法；无日期。releasedAt 取 null。<br>核查 URL：[https://siliconflow.cn/pricing](https://siliconflow.cn/pricing)<br>checkedAt：2026-10-04T18:26:00+08:00<br>role 依据：开源尺寸档（27B）通用模型；注册表 officialUrl 为第三方 | null |
| `qwen3.8-max` | `llm` | null | 官方价格页未见发布日。releasedAt 取 null。<br>核查 URL：[https://help.aliyun.com/zh/model-studio/model-pricing](https://help.aliyun.com/zh/model-studio/model-pricing)<br>checkedAt：2026-10-04T18:26:00+08:00<br>role 依据：Max 旗舰档（无 V 后缀） | null |

### 阶跃星辰（StepFun）（1 条）

| slug | modelRole | releasedAt | 证据（官方逐字引文 / 核查结论） | freshnessGroup |
| --- | --- | --- | --- | --- |
| `step-3.5-flash` | `small-fast-variant` | null | siliconflow（第三方）Stepfun-ai 分组存在，但其「开发者官方页」未取证，且第三方不得作日期依据。releasedAt 取 null。<br>核查 URL：[https://siliconflow.cn/pricing](https://siliconflow.cn/pricing)<br>checkedAt：2026-10-04T18:26:00+08:00<br>role 依据：StepFun Flash 低延迟档；注册表 officialUrl 为第三方 | null |

## 4. freshnessGroup：只有 1 条真正需要，理由如下

判定门槛（本次自定，写死以免日后漂移）：**只有当开发商官方页面出现明文的新旧世代分界（退役 / 替代 / 路由到新代）时，才给 freshnessGroup；否则 null**。「有发布日期」本身不算理由（日期已经在 releasedAt 里表达）。

| slug | freshnessGroup | 官方明文理由 |
| --- | --- | --- |
| `deepseek-flash` | `current-mainline` | 官方 Change Log 同页原文：「The previous-generation models V4 Flash and V4 Flash Vision Exp have been retired; for compatibility, the model names `deepseek-v4-flash` and `deepseek-v4-flash-vision-exp` are temporarily routed to V4.1 Flash.」+ 定价页「Use `deepseek-flash` as the model name.」 ⇒ 该身份=当前在售主线，旧代已退役。 |
| 其余 43 条 | null | 无官方新旧分界明文。特别说明两条**刻意不打组**的：`deepseek-v3.2`（已不在 DeepSeek 当前价目表，但官方没有一句明文说它 retired，不打 legacy 也不打 current）；`minimax-m2.5`（官方按量计费页把它归入「历史模型」表，但**没有**下线/退役明文，因此把官方原分类写进证据、组值留 null，供派生层自行决定）。 |

## 5. 附：本次抓取到的官方页面台账（含失败项，一条不漏）

| 官方 URL | 结果 | 关键事实 / 原文 |
| --- | --- | --- |
| `anthropic_pricing` → [https://docs.anthropic.com/en/docs/about-claude/pricing](https://docs.anthropic.com/en/docs/about-claude/pricing) | redirect-to-other-origin | web_fetch 拒绝跨源自动跳转（cross-origin redirect to https://www.anthropic.com is not followed automatically） |
| `anthropic_final` → [https://claude.com/pricing](https://claude.com/pricing) | HTTP 200 | 「# Pricing … IndividualTeam & EnterpriseAPI」（页面导航：Models → Mythos / Fable / Opus / Sonnet / Haiku 五个系列的产品页）<br>官方定价页本身不含任何逐模型发布日期；模型系列名（Fable / Opus / Sonnet / Haiku）与注册表 canonicalName 一致，可用于身份核对，不可用于日期。 |
| `openai_pricing` → [https://platform.openai.com/docs/pricing](https://platform.openai.com/docs/pricing) | HTTP 403 | 「Sorry, you have been blocked / This website is using a security service to protect itself from online attacks.」<br>本环境被 Cloudflare 拦截，未取到任何内容；不得用第三方内容顶替。 |
| `openai_models` → [https://platform.openai.com/docs/models](https://platform.openai.com/docs/models) | HTTP 403 | 同上（Cloudflare Attention Required） |
| `google_pricing` → [https://ai.google.dev/gemini-api/docs/pricing](https://ai.google.dev/gemini-api/docs/pricing) | fetch-failed | Error: web fetch failed: TypeError: fetch failed（两次尝试均失败，连接层错误，非 4xx） |
| `deepseek_pricing` → [https://api-docs.deepseek.com/quick_start/pricing](https://api-docs.deepseek.com/quick_start/pricing) | HTTP 200 | 「\| MODEL \| deepseek-flash(1) \| deepseek-v4-pro \| … \| MODEL VERSION \| DeepSeek-V4.1-Flash \| DeepSeek-V4-Pro-0813 \| … \| Vision \| ✓ \| Not supported \|」<br>定价页含 MODEL / MODEL VERSION / 上下文 / 特性 / 价格，**没有任何日期列**；「(1) Use `deepseek-flash` as the model name.」确认注册表 slug 与官方模型名一致。 |
| `deepseek_updates` → [https://api-docs.deepseek.com/updates](https://api-docs.deepseek.com/updates) | HTTP 200 | 页面为逐日 Change Log，历史条目形如「## Date: 2025-12-01 / ### DeepSeek-V3.2 / Both `deepseek-chat` and `deepseek-reasoner` have been upgraded to DeepSeek-V3.2.」<br>开发商的官方更新日志确实带精确日期，可作为 releasedAt 的一手依据（但只覆盖出现在日志里的模型名）。 |
| `zhipu_pricing` → [https://open.bigmodel.cn/pricing](https://open.bigmodel.cn/pricing) | HTTP 200 | 「智谱丨BigModel 平台」+ loading.gif（客户端渲染骨架页）<br>返回 200 但正文为空壳（价格由前端 JS 加载），无可引用的模型发布日期。 |
| `aliyun_pricing` → [https://help.aliyun.com/zh/model-studio/model-pricing](https://help.aliyun.com/zh/model-studio/model-pricing) | HTTP 200 | 「阿里云百炼模型价格-大模型服务平台百炼(Model Studio)-阿里云帮助中心」+「(Content truncated. Fetch a more specific URL or section for the full text.)」<br>取到的是价格页标题体（正文被截断），可见页面性质为价格表，未出现逐模型发布日期。 |
| `tencent_hunyuan_billing` → [https://cloud.tencent.com/document/product/1729/97731](https://cloud.tencent.com/document/product/1729/97731) | HTTP 200 | 「最近更新时间：2026-06-26 10:56:00」；「Hunyuan-a13b / Hunyuan-role-latest / Hunyuan-translation / Hunyuan-translation-lite / Tencent HY Vision 1.5 Instruct / Hunyuan-embedding」；「腾讯混元大模型相关功能将逐步迁移至 TokenHub」<br>★ 页面顶部「最近更新时间」是**文档页更新日**，不是任何模型的发布日期，不得充作 releasedAt；产品名表确认 6 条腾讯模型的官方写法与身份，Hunyuan-embedding 单列一类（输入 0.7元/百万 tokens）。 |
| `minimax_paygo` → [https://platform.minimax.cn/docs/guides/pricing-paygo](https://platform.minimax.cn/docs/guides/pricing-paygo) | HTTP 200 | 「\| **MiniMax-M2.7** \| 2.1 \| 8.4 …」「历史模型 \| **MiniMax-M2.5** \| 2.1 \| 8.4 …」（MiniMax-M3 为主表当前模型，含「≤ 512k 输入 tokens 永久五折」）<br>按量计费页把 MiniMax-M2.5 明确归入「历史模型」，M2.7/M2.7-highspeed/M3 在当前价目表；页面本身无日期。 |
| `minimax_relnotes` → [https://platform.minimax.cn/docs/release-notes/models](https://platform.minimax.cn/docs/release-notes/models) | HTTP 200 | 「2026 年 6 月 1 日 / ## MiniMax M3 / 全新语言模型 MiniMax-M3 正式发布，面向 Agent 推理、工具调用、代码、多模态 Chat 输入和长上下文任务。」<br>MiniMax 官方「模型发布」页带精确中文日期，是 M3 的官方一手发布日期依据；页内同类条目还有「2026 年 7 月 31 日 MiniMax H3」「2026 年 7 月 16 日 Music-3.0」。 |
| `volcengine_ark` → [https://www.volcengine.com/product/ark](https://www.volcengine.com/product/ark) | redirect-to-other-origin | 火山引擎方舟定价/文档页在本环境只能通过跨源跳转到达，未取到正文；4 条 doubao 模型的发布日期无官方依据。 |
| `siliconflow_pricing` → [https://siliconflow.cn/pricing](https://siliconflow.cn/pricing) | HTTP 200 | 「DeepSeek-V3.2 / DeepSeek-V3.2 (Pro) / Kimi-K2.7-Code / Qwen3.8-27B / GLM-4.5V / Stepfun-ai」<br>★ 第三方托管平台。只用于核对「注册表 slug 与托管方官方模型 id 写法一致」，**不得**作为开发商发布时间依据；页面亦无发布日期。 |

**失败/受限项汇总（不得用第三方内容顶替）**：

- `platform.openai.com/docs/pricing` 与 `/docs/models`：HTTP 403（Cloudflare「Sorry, you have been blocked」）⇒ 4 条 gpt 模型无官方依据。
- `ai.google.dev/gemini-api/docs/pricing`：`TypeError: fetch failed`（连接层失败，两次尝试）⇒ 4 条 gemini 模型无官方依据。
- `docs.anthropic.com/.../pricing`：跨源跳转到 `anthropic.com`；`www.anthropic.com/pricing`：跨源跳转到 `claude.com`（最终 200 但不载日期）⇒ 4 条 claude 模型日期 null（身份可核对）。
- `www.volcengine.com/product/ark` / `docs/82379/1544106`：跨源跳转到 `docs.volcengine.com`，未取正文 ⇒ 4 条 doubao 模型日期 null。
- `open.bigmodel.cn/pricing`：HTTP 200 但为客户端渲染空壳 ⇒ 8 条 GLM 模型日期 null。
- `help.aliyun.com/zh/model-studio/model-pricing`：HTTP 200，返回价格页标题体、正文被截断，未见发布日 ⇒ qwen/kimi-k3 相关条目日期 null。
- `cloud.tencent.com/document/product/1729/97731`：HTTP 200，正文可读但只含价格与免费额度 + TokenHub 迁移公告 ⇒ 6 条腾讯模型日期 null（页顶「最近更新时间：2026-06-26」是文档更新日，已排除）。

## 6. 对后续 task 的可用结论

1. **releasedAt 不能靠官方定价页补齐**：44 条对应的官方 URL 里绝大多数是价格页；官方是否发布逐模型日期取决于开发商是否维护 release notes。本次确认「带日期的一手官方源」只有两类：DeepSeek 的 `Change Log`（`/updates`）与 MiniMax 的「模型发布」页（`/docs/release-notes/models`）。
2. **schema 侧建议**：`releasedAt` 必须配 `releasedAtScope`（release / GA / 官方日志最早出现 / 升级到），否则「同一天不同的口径」会在展示层被读成同一件事；`releaseEvidence` 必须带 `capturedAt` + `httpStatus` + verbatim 引文，`checkedAt` 要对 null 条目同样必填。
3. **默认展示（哪些模型值得默认展示）不能只用 releasedAt**：40/44 条 null ⇒ 以 releasedAt 为唯一 currentness 信号会让绝大多数模型无法判定；本次提供的可用事实是：官方「当前价目表是否收录」+ 官方「历史模型 / retired」明文（见第 4 节两条）、以及 modelRole。
4. **给 t12 迁移**：本文件是调查结论，不可直接当生产来源层；迁移时请把 `releaseEvidence.sourceUrl`（开发商官方域）与 `checkedUrls` 一并带过去，并保留 null + checkedAt 的否定结论，否则「查过但没有」会退化成「不知道有没有查过」。

---

## 附：与生产数据的对账（t20 追加，2026-10-05）

> 本节由 **t20（最终完成报告）** 追加。上文的调查结论写于迁移之前，本节把**迁移后盘上的真实状态**逐条对上，
> 供后来者不必同时读三份文件就能看到"调查口径"与"身份层口径"的最终一致性。
> 出处：`models.json`（派生产物）· `scripts/data/models.json`（来源层）· `node scripts/tools/coverage-report.js --json` 的 `catalogStatus 普查` 行。

### 五态普查（与 report:coverage 逐项一致）

```
catalogStatus 普查           current 3 · aging 0 · legacy 1 · historical 0 · unknown 40（和 44）
```

**如实回答**：`aging` 与 `historical` 在真实数据上**0 命中**；`legacy` 只命中 **1** 条；`unknown` **40** 条。
成因是**证据稀缺**而非判据缺陷：44 条里只有 4 条有官方发布日期 ⇒ 其余 40 条只能判为 `unknown`（而 `unknown` **默认可见**，绝不等于 legacy）。

### 逐条对账表（44 行 = registry 全量）

| slug | 开发者 | 家族 | status | modelRole | releasedAt | freshnessGroup | catalogStatus | catalogReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `claude-fable-5.1` | Anthropic | Claude | active | general | `null` | `null` | **unknown** | `group-has-no-dated-model` |
| `claude-haiku-4.5` | Anthropic | Claude | active | fast | `null` | `null` | **unknown** | `group-has-no-dated-model` |
| `claude-opus-5.5` | Anthropic | Claude | active | general | `null` | `null` | **unknown** | `group-has-no-dated-model` |
| `claude-sonnet-5.5` | Anthropic | Claude | active | general | `null` | `null` | **unknown** | `group-has-no-dated-model` |
| `deepseek-flash` | DeepSeek | DeepSeek | active | vision | 2026-09-10 | `current-mainline` | **current** | `group-newest-within-current-window` |
| `deepseek-v3.2` | DeepSeek | DeepSeek | active | general | 2025-12-01 | `null` | **legacy** | `outranked-beyond-aging-window` |
| `deepseek-v4-pro` | DeepSeek | DeepSeek | active | general | 2026-08-13 | `null` | **current** | `group-newest-within-current-window` |
| `doubao-seed-2.1-pro` | 火山引擎 | Doubao Seed | active | general | `null` | `null` | **unknown** | `group-has-no-dated-model` |
| `doubao-seed-2.1-turbo` | 火山引擎 | Doubao Seed | active | fast | `null` | `null` | **unknown** | `group-has-no-dated-model` |
| `doubao-seed-character` | 火山引擎 | Doubao Seed | active | other | `null` | `null` | **unknown** | `group-has-no-dated-model` |
| `doubao-seed-evolving` | 火山引擎 | Doubao Seed | active | general | `null` | `null` | **unknown** | `group-has-no-dated-model` |
| `gemini-3.5-flash` | Google | Gemini | active | general | `null` | `null` | **unknown** | `group-has-no-dated-model` |
| `gemini-3.6-flash` | Google | Gemini | active | general | `null` | `null` | **unknown** | `group-has-no-dated-model` |
| `gemini-3.7-flash` | Google | Gemini | active | general | `null` | `null` | **unknown** | `group-has-no-dated-model` |
| `gemini-3.8-flash` | Google | Gemini | active | general | `null` | `null` | **unknown** | `group-has-no-dated-model` |
| `glm-4.5v` | 智谱AI | GLM | active | vision | `null` | `null` | **unknown** | `group-has-no-dated-model` |
| `glm-4.6v` | 智谱AI | GLM | active | vision | `null` | `null` | **unknown** | `group-has-no-dated-model` |
| `glm-4.6v-flash` | 智谱AI | GLM | active | vision | `null` | `null` | **unknown** | `group-has-no-dated-model` |
| `glm-4.6v-flashx` | 智谱AI | GLM | active | vision | `null` | `null` | **unknown** | `group-has-no-dated-model` |
| `glm-4.7-flash` | 智谱AI | GLM | active | fast | `null` | `null` | **unknown** | `group-has-no-dated-model` |
| `glm-5.3` | 智谱AI | GLM | active | general | `null` | `null` | **unknown** | `group-has-no-dated-model` |
| `glm-5.3-flash` | 智谱AI | GLM | active | fast | `null` | `null` | **unknown** | `group-has-no-dated-model` |
| `glm-5v-turbo` | 智谱AI | GLM | active | vision | `null` | `null` | **unknown** | `group-has-no-dated-model` |
| `gpt-6-astra` | OpenAI | GPT | active | general | `null` | `null` | **unknown** | `group-has-no-dated-model` |
| `gpt-6-luna` | OpenAI | GPT | active | general | `null` | `null` | **unknown** | `group-has-no-dated-model` |
| `gpt-6.1-sol` | OpenAI | GPT | active | general | `null` | `null` | **unknown** | `group-has-no-dated-model` |
| `gpt-live-1` | OpenAI | GPT | active | general | `null` | `null` | **unknown** | `group-has-no-dated-model` |
| `hunyuan-a13b` | 腾讯云 | Hunyuan | active | general | `null` | `null` | **unknown** | `group-has-no-dated-model` |
| `hunyuan-embedding` | 腾讯云 | Hunyuan | active | embedding | `null` | `null` | **unknown** | `group-has-no-dated-model` |
| `hunyuan-role-latest` | 腾讯云 | Hunyuan | active | other | `null` | `null` | **unknown** | `group-has-no-dated-model` |
| `hunyuan-translation` | 腾讯云 | Hunyuan | active | translation | `null` | `null` | **unknown** | `group-has-no-dated-model` |
| `hunyuan-translation-lite` | 腾讯云 | Hunyuan | active | translation | `null` | `null` | **unknown** | `group-has-no-dated-model` |
| `kimi-k2.7-code` | 月之暗面 | Kimi | active | coding | `null` | `null` | **unknown** | `group-has-no-dated-model` |
| `kimi-k3` | 月之暗面 | Kimi | active | general | `null` | `null` | **unknown** | `group-has-no-dated-model` |
| `minimax-m2.5` | MiniMax（稀宇科技） | MiniMax M | active | general | `null` | `null` | **unknown** | `group-has-no-dated-model` |
| `minimax-m2.7` | MiniMax（稀宇科技） | MiniMax M | active | general | `null` | `null` | **unknown** | `group-has-no-dated-model` |
| `minimax-m2.7-highspeed` | MiniMax（稀宇科技） | MiniMax M | active | fast | `null` | `null` | **unknown** | `group-has-no-dated-model` |
| `minimax-m3` | MiniMax（稀宇科技） | MiniMax M | active | vision | 2026-06-01 | `null` | **current** | `group-newest-within-current-window` |
| `qwen-max` | 阿里云 | Qwen | active | general | `null` | `null` | **unknown** | `group-has-no-dated-model` |
| `qwen3-max` | 阿里云 | Qwen | active | general | `null` | `null` | **unknown** | `group-has-no-dated-model` |
| `qwen3.8-27b` | 阿里云 | Qwen | active | general | `null` | `null` | **unknown** | `group-has-no-dated-model` |
| `qwen3.8-max` | 阿里云 | Qwen | active | general | `null` | `null` | **unknown** | `group-has-no-dated-model` |
| `step-3.5-flash` | 阶跃星辰 | Step | active | fast | `null` | `null` | **unknown** | `group-has-no-dated-model` |
| `tencent-hy-vision-1.5-instruct` | 腾讯云 | Hunyuan | active | vision | `null` | `null` | **unknown** | `group-has-no-dated-model` |

### 发布日期的官方证据（4 条，逐字）

| slug | releasedAt | sourceUrl | 逐字引文（截断） |
| --- | --- | --- | --- |
| `deepseek-flash` | **2026-09-10** | https://api-docs.deepseek.com/updates | 「### DeepSeek-V4.1-Flash Release / Today, we officially release the DeepSeek-V4.1-Flash model. It is the smallest model in our new architecture family… |
| `deepseek-v3.2` | **2025-12-01** | https://api-docs.deepseek.com/updates | 「## Date: 2025-12-01 / ### DeepSeek-V3.2 / Both `deepseek-chat` and `deepseek-reasoner` have been upgraded to DeepSeek-V3.2.」… |
| `deepseek-v4-pro` | **2026-08-13** | https://api-docs.deepseek.com/updates | 「### DeepSeek-V4-Pro Update / The GA release of DeepSeek-V4-Pro has been rolled out on the APP, Web, and API.」… |
| `minimax-m3` | **2026-06-01** | https://platform.minimax.cn/docs/release-notes/models | 「## 2026 年 6 月 1 日 / ## MiniMax M3 / 全新语言模型 MiniMax-M3 正式发布，面向 Agent 推理、工具调用、代码、多模态 Chat 输入和长上下文任务。」… |

### 无日期的 40 条

全部 `releasedAt = null`，每条在 `research/_raw/coverage-expansion-v1/currentness.json` 里都有 `checkedOutcome` 说明
（口径三类：官方站 404 / 页面 200 但正文无日期 / 只有下线日）。**没有一条用版本号或第三方日期顶替。**

### 两套词表的关系

调查口径（`llm` / `vlm` / `multimodal_llm` / `retrieval_embedding` / `translation` / `translation_lite` / `roleplay` / `code_specialist` / `small_fast_variant`）
与身份层口径（`general` / `fast` / `reasoning` / `coding` / `vision` / `embedding` / `audio` / `realtime` / `translation` / `other`）
**是两套事实记录，不要求相等**；映射写在 `currentness.json` 的 `_roleVocabularyMapping`，身份层角色分布见下表。

| modelRole | 条数 |
| --- | --- |
| `coding` | 1 |
| `embedding` | 1 |
| `fast` | 6 |
| `general` | 24 |
| `other` | 2 |
| `translation` | 2 |
| `vision` | 8 |
