
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
