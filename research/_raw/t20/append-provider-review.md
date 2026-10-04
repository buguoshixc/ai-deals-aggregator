
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
