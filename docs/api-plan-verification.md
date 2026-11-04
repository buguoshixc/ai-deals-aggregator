# API 套餐来源核验记录（`checkMethod` / `lastVerifiedAt`）

> 本文件记录 **2026-11-04（Asia/Shanghai）** 对 `scripts/data/curated_api_plans.json` 全部 24 条记录
> 的逐源实测结论。`checkMethod` 是**核验方式**（运营元数据），不是厂商事实；它不进记录 id、
> 不进变化事件。判定标准只有一条：
>
> **`static` = 裸 HTTP GET 就能拿到真实价格页正文（含正常跳转后的正文）。**
>
> 实测方式：`curl -sS -L --compressed --max-time 30 -A "<Chrome/126 UA>"`（跟随重定向），
> 另用 Node `fetch` 复核。HTTP 状态、最终 URL、响应字节数逐条记录如下。

## 1. 汇总

| 核验方式 | 条目数 | 说明 |
|---|---:|---|
| `static` | **7 条 / 6 家厂商** | DeepSeek ×2（标准 / 低峰）· Fireworks · 腾讯云 · 硅基流动 · 百川 · 商汤；由 `scripts/tools/verify-api-plans.js` 每日自动解析比对 |
| `headless` | 9 条 | 页面是 JS 壳 / 反爬挑战，裸 GET 拿不到价格正文；需要真浏览器渲染 |
| `manual` | 8 条 | 本仓自动化拿不到或口径需人工判定（区域封锁 / 网络不可达 / 多档阶梯表） |

`lastVerifiedAt` 的赋值纪律：

- `static` 条目：`2026-11-04`（本轮**实际解析并比对成功**，价格未变）；
- `headless` / `manual` 条目：沿用该条既有的 `verifiedAt`（`2026-10-01` / `2026-10-05` / `2026-10-08`）。
  本轮只探测了可达性，没有核验价格 —— 不把「今天访问过」写成「今天核验过」。

## 2. 逐源实测（21 个不同 URL）

| sourceUrl | HTTP / 最终 URL | 响应 | 判定 |
|---|---|---|---:|
| https://api-docs.deepseek.com/quick_start/pricing | 200 → `…/pricing/` | 7,037 B | `static` |
| https://open.bigmodel.cn/pricing | 200 | 2,171 B | `headless` |
| https://platform.openai.com/docs/pricing | 403 | 1,963 B | `headless` |
| https://platform.claude.com/docs/en/about-claude/pricing | 307 → `anthropic.com/app-unavailable-in-region` | 83 KB（区域封锁页） | `manual` |
| https://ai.google.dev/gemini-api/docs/pricing | 连接超时（curl 28 / 40s） | 0 B | `manual` |
| https://help.aliyun.com/zh/model-studio/model-pricing | 200 | 83,745 B | `manual` |
| https://platform.minimax.cn/docs/guides/pricing-paygo | 200 → `…/pricing/overview` | 45,468 B | `manual` |
| https://siliconflow.cn/pricing | 200 → `www.siliconflow.cn/pricing` | 232,698 B | `static` |
| https://www.volcengine.com/product/ark | 200 | 18,990 B | `headless` |
| https://cloud.tencent.com/document/product/1729/97731 | 200 | 49,769 B | `static` |
| https://console.groq.com/docs/models | 403（JSON `Forbidden`） | 33 B | `headless` |
| https://docs.together.ai/docs/serverless/models.md | 403 | 1,745 B | `headless` |
| https://docs.fireworks.ai/serverless/pricing.md | 200（`text/markdown`） | 2,214 B | `static` |
| https://www.cerebras.ai/pricing | 200 | 44,545 B | `headless` |
| https://ai.360.com/open/zh/models | 200 | 98,869 B | `manual` |
| https://platform.baichuan-ai.com/prices | 200 | 11,380 B | `static` |
| https://cloud.baidu.com/doc/qianfan-docs/s/Jm8r1826a | 200 | 113,327 B | `manual` |
| https://xinghuo.xfyun.cn/sparkapi | 200 | 1,959 B | `headless` |
| https://platform.kimi.com/docs/pricing/chat | 200 | 41,592 B | `headless` |
| https://www.sensecore.cn/help/docs/model-as-a-service/nova/pricing | 200 | 39,738 B | `static` |
| https://platform.stepfun.com/docs/zh/guides/pricing/details | 200 | 89,388 B | `manual` |

## 3. `static` 的 7 条为什么算 static（解析依据）

| 厂商 | 页面结构 | 解析结果（2026-11-04） |
|---|---|---|
| DeepSeek（标准 / 低峰两条） | Docusaurus 表格：列 = 模型，行 = `1M INPUT/OUTPUT TOKENS` × `PEAK / OFF-PEAK`（含 rowspan） | 2 模型 × 3 维度（input / cachedInput / output）全部对上，价格未变 |
| Fireworks | 官方 Markdown 表格：`[显示名] \| Standard 三元组 \| Priority 三元组`，Standard 单元格 = `input / cached input / output` | 10 模型三元组全部对上，价格未变 |
| 腾讯云 | HTML 表格：`产品名 \| 刊例价（每 百万 tokens）`，单元格 = `输入：X元 输出：Y元` | 6 模型 input/output 对上，价格未变 |
| 硅基流动 | 正文文本表：`显示名 + 模型路径 + ¥输入¥输出¥缓存`；按「模型路径 basename == 显示名」消歧（避免 `GLM-5.3` 误命中 `GLM-5.3-Flash`） | 6 模型三元组对上，价格未变 |
| 百川 | HTML 表格：`模型调用 <name>` 行，单元格 = `输入：X元/千tokens 输出：Y元/千tokens` | 2 模型 input/output 对上，价格未变 |
| 商汤 | HTML 表格：`<name>模型调用 \| 输入tokens \| X元/千tokens \| 输出tokens \| Y元/千tokens` | 2 模型 input/output 对上，价格未变 |

> 解析器是**逐家显式映射**，没有「通用启发式解析」：新增一家 static = 新增一个解析器 + 在本文件补一行实测记录。
> 页面结构变化 ⇒ 解析器报「解析失败」，**不会**被当成「价格变了」。

## 4. 其余 17 条为什么不是 static

- **反爬 / JS 壳（`headless`，9 条）**：智谱（HTML 2.1 KB、正文为空）、OpenAI（403）、火山方舟（正文为空）、
  Groq（403 JSON）、Together（`.md` 仍 403）、Cerebras（正文无价目表）、讯飞星火（正文为空）、Kimi（正文不含价目表）、
  SiliconFlow 之外的 JS 应用。裸 GET 拿不到完整价格表，需要真浏览器渲染。
- **区域 / 网络（`manual`）**：Anthropic（本机出口被区域封锁：307 → `app-unavailable-in-region`）、
  Google Gemini（连接超时，本机网络不可达）。
- **可达但口径需人工判定（`manual`）**：阿里云百炼 ×2（页面 273 张表，阶梯计价 + 标准/闲时两档）、
  MiniMax（23 张表、按上下文多档）、百度千帆（15 张表、rowspan 阶梯）、360（价格嵌在非结构化文本里）、
  StepFun（7 张表、多档）。这些**不**判 static：自动解析无法保证档位映射正确，错映射会制造假事件。

### Anthropic URL 修复

旧 `sourceUrl` = `https://docs.anthropic.com/en/docs/about-claude/pricing`：

```
301 → https://platform.claude.com/docs/en/docs/about-claude/pricing
307 → /docs/en/about-claude/pricing
307 → https://www.anthropic.com/app-unavailable-in-region   （本机出口的区域封锁页）
```

因此 `officialUrl` / `sourceUrl` 都改为最终可读的规范地址
`https://platform.claude.com/docs/en/about-claude/pricing`（在允许区域的出口上该地址返回价格文档；
本机出口只能看到区域封锁页，所以**不能**判 static，见第 2 节）。证据里的旧 URL 是历史抓取出处，保持原样。

## 5. `scripts/tools/verify-api-plans.js` 的行为

```bash
node scripts/tools/verify-api-plans.js --dry-run   # 抓取 + 解析 + 报告，不写盘（同 collect.js 的 dry-run 约定）
node scripts/tools/verify-api-plans.js             # 写盘
node scripts/tools/verify-api-plans.js --strict    # 有校验失败时退出 1（默认 0，不阻断采集链）
node scripts/tools/verify-api-plans.js --json      # 机器可读摘要
```

- 只处理 `checkMethod === "static"` 的 7 条；`headless` / `manual` 明确跳过并在输出里计数。
- **成功** → 更新该条 `lastVerifiedAt`；**价格未变** → **0 条历史事件**（硬要求）。
- **价格变了** → 采纳新价（同时刷新 `lastSeen` / `verifiedAt`，让事件日期与 `api-plans.json.updatedAt` 同源）
  → 由 `lib/api-plan-history.js` 的 `record()` 生成事件（形状不手写）→ 同步写出 `api-plans.json`
  （curated / 派生文件 / 历史三者同批更新，避免 `check:api-plans:reproducible` 与
  `check:api-plan-history` 互斥）→ 变化模型的价目表行回写为 `evidence`（引文与数字必须同源）。
- **失败** → 不改 `lastVerifiedAt`；失败写进 `source-health.json`（`api_plan_<provider>_<channel>`，
  `status=failed`、`reason=collector_error`、`lastError` 保留首条原因）；退出码仍为 0（`--strict` 才非 0）。
- **确定性**：健康表时间戳取「当天 00:00:00Z」，历史事件日期取 `YYYY-MM-DD`；同一天连跑两次，
  四份产物（curated / api-plans / history / health）逐字节一致（已实测：第二次运行四个 SHA-256 全部相同）。

已知边界（如实记录）：

1. 只比对**数据里已有值的维度**（`input` / `output` / `cachedInput`）；数据里是 `null` 的维度不做「新增/取消」判定。
2. 任何模型 / 维度**解析不到**都判「校验失败」，不判「价格变化」—— 读不到 ≠ 变了。
3. `headless` / `manual` 的 17 条仍由人工按既有 `verifiedAt` 复核；本脚本不覆盖它们。
4. 价格变化时的 `evidence` 回写只覆盖本记录 `evidence` 预算（≤4 条）内的模型；超出预算的变化不会硬塞引文。
5. 页面正文若被上游 A/B 或区域化，可能表现为解析失败（health failed），不会静默改价。

## 6. CI 接线

`.github/workflows/collect.yml` 在采集之后、`Validate new data (strict gate)` 之前新增两步：

```yaml
- name: Verify static API plans (daily)
  run: node scripts/tools/verify-api-plans.js
- name: Rebuild derived api-plans.json
  run: node scripts/tools/rebuild-api-plans.js
```

提交步骤的 `git add` 同步加入 `api-plans.json`、`scripts/data/curated_api_plans.json`、
`scripts/data/api-plan-history.json` —— 三份必须与 `source-health.json` 同批入库，
否则下一轮会拿「已变的 curated」对「上一轮的历史」，`check:api-plan-history` 当场变红。
`deploy.yml` 的触发条件未改动。
