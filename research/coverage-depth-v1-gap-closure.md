# coverage-depth-v1 · Workstream B-1（t3）：Target Provider Universe 内 API / Coding / Deals 缺口收口

- 任务：`t3`（attempt 4）· 工作区 `D:\OneDrive\Desktop\Code\AI Page\.worktrees\coverage-depth-v1`（基线 `origin/master ff86368`）
- 观测日 / 裁决日：**2026-10-05**（不猜日期、不读墙钟：新增记录的 `firstSeen = lastSeen = verifiedAt = 2026-10-05`，即本次观测日）
- 本任务只写**来源层**（`scripts/data/curated_*.json` + 意图层 `coverage-targets.json` + 关系层出口）；根 `api-plans.json` / `plans.json` / `deals.json` 与三份 history 全部由 rebuild 命令派生，**零手改**。

---

## 1. 结论摘要（改前 → 改后，均为现场重测）

| 读数 | 改前（本轮现场基线，`coverage.json`） | 改后（`coverage-final.json`） |
| --- | --- | --- |
| COVERED | 64 | **75** |
| PARTIAL | 1 | **0** |
| MISSING | 17 | **4** |
| DEFERRED | 2 | 3 |
| UNVERIFIABLE | 2 | 2 |
| NOT_APPLICABLE | 50 | 52 |
| BLOCKED_SOURCE | 0 | 0 |
| 合计格子 | 136 | 136 |

**剩余 4 个 MISSING 全部是 `models` 维度（ai360 / baichuan / baidu / iflytek）**，即「registry 里还没有这几家的模型身份」——按任务书属 **Workstream B-2（t8）**，且依赖 t2 先完成 `scripts/data/models.json` 的写入。本轮**没有**碰 `scripts/data/models.json` 与根 `models.json` 的**来源层**（后者仅由 `npm run models:rebuild` 派生）。

**任务书范围内（API / Coding / Deals）的 13 个 MISSING + 1 个 PARTIAL 全部有了出口**：12 条 COVERED / PARTIAL 收口，1 条 UNVERIFIABLE（deepseek/deals），1 条 DEFERRED（microsoft/coding，带 `revisitBy`），2 条 NOT_APPLICABLE（ai360/coding、baichuan/coding，是**意图层编码修正**而非降级，见 §4）。

数据集侧：`api-plans.json` 17 → **24 条**（计价条目 93 → **108**）；`plans.json` 37 → **44 条**（其中 OPENAI 6 条、商汤 1 条）。

---

## 2. 现场读数（命令 + 原始文件）

```powershell
# 改前（本轮开始时；输出约 370KB，必须重定向到文件再解析）
node scripts/tools/coverage-report.js --json 2>&1 | Out-File -Encoding utf8 research\_raw\coverage-depth-v1\gap-closure\coverage.raw.txt
node research/_raw/coverage-depth-v1/gap-closure/_extract.js research/_raw/.../coverage.raw.txt research/_raw/.../coverage.json
# 改后
node scripts/tools/coverage-report.js --json 2>&1 | Out-File -Encoding utf8 research\_raw\coverage-depth-v1\gap-closure\coverage-final.raw.txt
```

改前 `coverageTargets.states` = `{COVERED:64, PARTIAL:1, MISSING:17, DEFERRED:2, UNVERIFIABLE:2, NOT_APPLICABLE:50, BLOCKED_SOURCE:0}`
改前 `missingTargets`（现场逐条，17 条）：
`ai360/coding · ai360/api · ai360/models · baichuan/coding · baichuan/api · baichuan/models · baidu/api · baidu/models · deepseek/deals · iflytek/api · iflytek/models · microsoft/coding · moonshot/api · openai/coding · sensetime/coding · sensetime/api · stepfun/api`
改前 `partialTargets`：`replit/coding`（declared 1 / present 2 / resolved 0）

改后 `coverageTargets.states` = `{COVERED:75, PARTIAL:0, MISSING:4, DEFERRED:3, UNVERIFIABLE:2, NOT_APPLICABLE:52, BLOCKED_SOURCE:0}`
改后 `missingTargets`（4 条，全部 models）：`ai360/models · baichuan/models · baidu/models · iflytek/models`
改后 `partialTargets`：空
改后维度读数：`deals 23/0/0/0/1/10` · `coding 20/0/0/1/0/13` · `api 21/0/0/1/1/11` · `models 11/0/4/1/0/18`（顺序：COVERED/PARTIAL/MISSING/DEFERRED/UNVERIFIABLE/NOT_APPLICABLE）
Provider Universe 双向对账：`declared 34 · registered 34 · withData 34 · undeclared 0`（未新增 provider）

---

## 3. 逐条出口表（before → action → after → evidence）

| # | 格（provider/维度） | before（现场派生） | action | after | evidence（官方页，逐字片段见 `research/_raw/.../gap-closure/evidence.md`） |
| --- | --- | --- | --- | --- | --- |
| 1 | **openai/coding** | MISSING（declared 0 / present 0） | 新增 6 条 coding 套餐：ChatGPT Plus $20、Pro 100 $100、Pro 200 $200、Pro 500 $500、Business Standard 座位 $25/user/月、Business Premium 座位 $125/user/月；并声明 6 条 current target | **COVERED（6/6）** | `help.openai.com/en/articles/6950777`（Plus）· `/9793128-about-chatgpt-pro-tiers`（Pro 三档表）· `/8792828-chatgpt-business-overview`（座位表）· `/12003714`（座位用量口径） |
| 2 | **baidu/api** | MISSING（0/0） | 新增 1 条 API 计价记录（ERNIE-5.1 standard 0.004/0.018 与 long_context 0.006/0.022、ERNIE-4.5-Turbo-128K 0.0008/0.0032/缓存 0.0002，元/千tokens）；关系层 +3 条声明 | **COVERED（2/2）** | `cloud.baidu.com/doc/qianfan-docs/s/Jm8r1826a`（页内「更新时间：2026-07-09」） |
| 3 | **moonshot/api** | MISSING（0/0） | 新增 1 条 API 计价记录（kimi-k3 ¥20/¥100/缓存命中 ¥2/缓存写入 ¥20·¥40；kimi-k2.7-code ¥6.5/¥27/缓存 ¥1.3，1M tokens）；关系层 +2 条 link | **COVERED（2/2）** | `platform.kimi.com/docs/pricing/chat` |
| 4 | **stepfun/api** | MISSING（declared 2 / resolved 0） | 新增 1 条 API 计价记录（step-5-preview 7/20/0.35、step-3.7-flash 1.35/8.1/0.27、step-3.5-flash 0.7/2.1/0.14，1M tokens）；关系层 +1 link +2 声明 | **COVERED（2/2）** | `platform.stepfun.com/docs/zh/guides/pricing/details` |
| 5 | **sensetime/api** | MISSING（declared 1 / resolved 0，声明值为 `SenseNova-V6.5-Pro` 非规范 modelKey） | 新增 1 条 API 计价记录（sensenova-v6.5-pro 0.003/0.009、sensenova-v6.5-turbo 0.0015/0.0045，元/千tokens）；声明值改成规范 modelKey；关系层 +2 声明 | **COVERED（1/1）** | `sensecore.cn/help/docs/model-as-a-service/nova/pricing` |
| 6 | **sensetime/coding** | MISSING（0/0） | 新增 1 条套餐：`SenseNova Token Plan · Free(公测)` ¥0/月 · 60,000 积分/5 小时（付费档官方写「即将上线」且无公开价 ⇒ 不收） | **COVERED（1/1）** | `sensenova.cn/token-plan` |
| 7 | **iflytek/api** | MISSING（0/0） | 新增 1 条 API 计价记录（Spark-X2.5 输入 1.60 / 输出 6.00 / 缓存命中 0.24，元/百万tokens；note 逐字标注官方「限时五折」）；关系层 +1 声明 | **COVERED（1/1）** | `xinghuo.xfyun.cn/sparkapi` |
| 8 | **baichuan/api** | MISSING（declared 2 / resolved 0，声明值非规范 modelKey） | 新增 1 条 API 计价记录（baichuan-m3 0.01/0.03、baichuan-m3-plus 0.005/0.009，元/千tokens，上下文 32k）；声明值改成规范 modelKey；关系层 +2 声明 | **COVERED（2/2）** | `platform.baichuan-ai.com/prices` |
| 9 | **ai360/api** | MISSING（declared 1 / resolved 0） | 新增 1 条 API 计价记录（360zhinao-turbo-llm-geo ¥1/¥2/缓存读 ¥0.1/缓存写 ¥1.25、360zhinao-pro ¥2/¥5/¥0.2/¥2.5，1M tokens）；关系层 +2 声明 | **COVERED（1/1）** | `ai.360.com/open/zh/models` |
| 10 | **replit/coding**（PARTIAL） | PARTIAL：**target 1 / covered 0 / missing 1**（声明 `Replit Core`，盘上 planName 是 `Core` / `Pro`） | 把声明改成盘上真实 plan identity：`Core` + `Pro`（**不改任何数据**） | **COVERED（2/2）** | 盘上 `plans.json`：`replit / Core / $20 monthly`、`replit / Pro / $100 monthly`（引文出自 `replit.com/pricing`） |
| 11 | **deepseek/deals** | MISSING（0/0） | 查 4 个官方来源后落裁决 `unverifiable`（官方当前没有任何公开优惠 / 新用户额度 / 限时活动可引用） | **UNVERIFIABLE** | 见 §7 与 evidence §9（逐条来源清单） |
| 12 | **microsoft/coding** | MISSING（0/0） | 裁决 `deferred` + `revisitBy`（官方价可核：M365 Business Premium with Copilot $32/user/月按年付；但 Microsoft 自营无编程订阅，编程订阅是 GitHub Copilot，已单列 provider `github` ⇒ 收录范围需先裁决） | **DEFERRED** | 见 §7 与 evidence §10（两个官方定价页 + 站内检索） |
| 13 | **ai360/coding** | MISSING（0/0） | **编码修正**：原 `dimensionIntent.coding` 字符串逐字写着「官方只有第三方工具的接入文档，没有自营 Coding 套餐」——这与 `applicabilityNote` 已经说的是同一件事，只是编码成了"适用"。改为 `null` + 补复核说明 | **NOT_APPLICABLE** | `ai.360.com/open/zh/models`（模型广场 94 个模型）+ 平台页无自营编程订阅档位 |
| 14 | **baichuan/coding** | MISSING（0/0） | **编码修正**（同上形态）：官方公开价目面只有按量 / 搜索增强 / 知识库 / Embeddings | **NOT_APPLICABLE** | `platform.baichuan-ai.com/prices` |
| — | **iflytek/coding**（范围外顺带） | UNVERIFIABLE（**与盘上事实矛盾的过期裁决**） | 删除该裁决（盘上已有 2 条 verified 的 `讯飞星辰 MaaS · Astron Coding Plan` 套餐）并补声明 | **COVERED（2/2）** | 盘上 `plans.json` 两条 Astron 套餐 |

**编码修正 ≠ 把缺口改好看**（任务书硬约束 2 的边界）：这两条不是"降级"，而是**同一条事实的两种编码**。判据是维度的适用性与"盘上有没有可收录的对象"相符，而**不是**"改完数字好不好看"：
- 两条的 `applicabilityNote` 在 master 上就已经逐字写着「coding 不适用」；
- `dimensionIntent.coding` 的字符串本身写的就是「没有自营 Coding 套餐」——一个写着"不适用"的**意图字符串**在派生层是"适用"；
- 本轮补做了官方复核（模型广场 94 个模型 / 官方价目页），确认官方侧确实没有可收录对象。
反过来，同样是"来源困难"的 `microsoft/coding` 与 `deepseek/deals` **没有**被改成 NOT_APPLICABLE —— 它们各自落到了 DEFERRED（带复查条件）与 UNVERIFIABLE（附查过的来源）。

---

## 4. 维护价值分层（改前 18 格）

规则（可解释的粗分桶，**不使用伪精确分数**；维度价值按 provider role 调整）：

- **角色 → 高价值维度**：`model-developer` → API / Models / Deals / Coding；`coding-product` → Coding / Deals（API / Models 通常 N/A）；`inference-platform` → API / Deals（Models 归属发行方）；`tool-vendor` → Deals（其余通常 N/A）。
- **A**：`core` + 高价值维度 + 官方来源明确（能直接落 COVERED）
- **B**：`major` + 官方来源明确
- **C**：`core`/`major` 但来源方向上困难（官方侧没有可收录对象，需要查证后裁决）
- **D**：`long-tail` 或高维护成本格

| 层 | 格 | 处置结果 |
| --- | --- | --- |
| **A** | openai/coding · baidu/api · moonshot/api | 3/3 COVERED |
| **B** | stepfun/api · sensetime/api · sensetime/coding · iflytek/api · baichuan/api · replit/coding(PARTIAL) | 6/6 COVERED |
| **C** | deepseek/deals · baichuan/coding · ai360/coding | 1 UNVERIFIABLE（deepseek）· 2 NOT_APPLICABLE（编码修正） |
| **D** | ai360/api · microsoft/coding | 1 COVERED · 1 DEFERRED（带 revisitBy） |

> A/B 层 9 格全部变成 COVERED；C/D 层没有一格被"留成静默缺口"：模型身份、来源方向、schema 表达力这三类困难分别落到了 DEFERRED（带复查条件）、UNVERIFIABLE（附查过的来源）、NOT_APPLICABLE（附官方复核）与 §6 的 schema 留档。

---

## 5. 新增 API 计价记录：逐项核对（任务书要求 11 项）

| 记录 | provider identity | officialUrl / sourceUrl | pricing.unit | currency | input / output | cached input | variant | freeTier | credits | evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ai360（`0940febeeea9`） | `ai360`=360智脑（providers.json） | `ai.360.com/open/zh/models`（官方域 360.com ✓） | `per_1M_tokens`（卡片逐字「¥1 / 1M tokens」） | CNY | 1 / 2；360zhinao-pro 2 / 5 | 0.1 / 0.2（「缓存读取价格」） | `standard`（另有 cacheWrite 1.25 / 2.5） | `null`（官方未给长期免费额度） | `null` | 3 条引文（unit + 2 模型卡片逐字） |
| baichuan（`218c142dcb17`） | `baichuan`=百川智能 | `platform.baichuan-ai.com/prices`（baichuan-ai.com ✓） | `per_1K_tokens`（官方「（千tokens）收费」+「元/千tokens」） | CNY | m3: 0.01 / 0.03；m3-plus: 0.005 / 0.009 | `null`（官方未给缓存价） | `standard` | `null` | `null` | 3 条引文 |
| baidu（`23643dfd94f8`） | `baidu`=百度智能云 | `cloud.baidu.com/doc/qianfan-docs/s/Jm8r1826a`（baidu.com ✓） | `per_1K_tokens`（「单位」列逐格「元/千tokens」） | CNY | ernie-5.1: 0.004 / 0.018（long_context 0.006 / 0.022）；ernie-4.5-turbo-128k: 0.0008 / 0.0032 | 0.0002（官方「命中缓存」列） | `standard` + `long_context` | `null` | `null` | 3 条引文 |
| iflytek（`faf2d5722e71`） | `iflytek`=科大讯飞 | `xinghuo.xfyun.cn/sparkapi`（xfyun.cn ✓） | `per_1M_tokens`（「元/百万tokens」） | CNY | 1.6 / 6.0 | 0.24（「缓存命中」） | `standard` | `null` | `null` | 2 条引文（同段，含「限时五折」标注） |
| moonshot（`c4b6948c4fa9`） | `moonshot`=月之暗面 | `platform.kimi.com/docs/pricing/chat`（kimi.com ✓） | `per_1M_tokens`（「计费单位 1M tokens」+ 页尾 1M=1,000,000） | CNY | k3: 20 / 100；k2.7-code: 6.5 / 27 | 2 / 1.3（「输入价格（缓存命中）」） | `standard`（k3 另有 cacheWrite 20 / cacheWriteLong 40） | `null` | `null` | 3 条引文 |
| sensetime（`09ed95f9cd81`） | `sensetime`=商汤科技 | `sensecore.cn/help/docs/model-as-a-service/nova/pricing`（官方域，见 §8） | `per_1K_tokens`（「千tokens：1 千tokens = 1000 tokens」） | CNY | v6.5-pro: 0.003 / 0.009；v6.5-turbo: 0.0015 / 0.0045 | `null`（官方未给缓存价） | `standard` | `null` | `null` | 3 条引文 |
| stepfun（`03b27e432472`） | `stepfun`=阶跃星辰 | `platform.stepfun.com/docs/zh/guides/pricing/details`（stepfun.com ✓） | `per_1M_tokens`（「计费单位 1M tokens」） | CNY | step-5-preview 7 / 20；step-3.7-flash 1.35 / 8.1；step-3.5-flash 0.7 / 2.1 | 0.35 / 0.27 / 0.14（「输入价格（缓存命中）」） | `standard` | `null` | `null` | 3 条引文 |

**schema 自带的结构性判据**（不是人工自觉）：`per_1M_tokens` / `per_1K_tokens` 是**记录级枚举**，`rates` 里不接受任何非 token 维度（按图 / 秒 / 次的价必须走 `mediaRates` 并逐条自带单位）；单位还必须有见证（引文 / `pricing.unit` 引文 / `unitNote` 三者之一），且引文点名的单位必须与 `pricing.unit` 同类。**本轮 7 条记录零条把复杂 bundle 硬写成 `per_1M_tokens`**：商汤的 TPM 配额包 / Tokens 量包、StepFun 的按万字符 / 按小时 / 按张、百度的按次搜索、讯飞的区间价，全部**没有**进入 token 单价字段（见 §6）。

`freeTier` / `credits` 一律 `null`：这 7 家官方页面上都没有"长期免费额度"或"预付费 credit 包"的口径；`null` = 未查到，不是"官方明说没有"（后者要写 `{"type":"none"}`）。

---

## 6. schema 表达不了的部分（DEFERRED_SCHEMA 留档 + 一条"应扩项"交接）

门槛：**≥2 家独立 Provider 都需要 + 语义清晰 + 不破坏既有 Pricing Truth**。拆成两类如实记：

### 6.1 不满足门槛 ⇒ 记为 `DEFERRED_SCHEMA`（本轮不扩，留档）

| 形态 | 官方原文 | 为什么表达不了 | 为什么**不**扩 |
| --- | --- | --- | --- |
| 区间价 | 讯飞 `Spark X2 2 ~ 3 元/百万tokens`、`Spark-X2-Flash 1 ~ 2 元/百万tokens` | `rates.*` 是**单值**字段，装不下区间（写成端点值就是编一个官方没说的数） | 这一轮只有讯飞一家在官方页上用区间价 ⇒ 不满足 ≥2 家 |
| 容量预留 / 预付费包 | 商汤 `TPM配额包预付费`、`Tokens量包预付费`（同一页三选一互斥计费模式） | 记录级没有"包期 / 预留容量 / 预付"字段，`channel` 是"官方单独列了一张价目表"的登记制枚举 | 只有商汤一家 ⇒ 不满足 ≥2 家；且它属"容量预留"，与按量价的语义不同 |
| 活动期分列的批量价 | 百度 `批量推理（2月活动价）/（3月活动价）` | 是**限时活动**形态，按本仓分工属 Deals 精神，不是长期价目 | 只有百度一家 ⇒ 不满足 ≥2 家（也不该污染长期价目） |

### 6.2 满足门槛、但扩 schema 不在本轮写域 ⇒ 交接（**零条硬写**）

| 形态 | 涉及 Provider（≥2 家） | 建议 |
| --- | --- | --- |
| 音频类非 token 单位：`元/万字符`（StepFun 语音合成 2.5 / 5.8 / 2.8 / 0.9；商汤 `SenseNova-Audio-Fusion-0603` 3.5 元/万字符）· `元/小时`（StepFun 语音识别 0.15 / 0.9 / 2.8 元/小时）· `¥1.38889 / 1K 秒`（360 实时语音同传 / 翻译） | **StepFun · 商汤 · 360** = 3 家 | 给 `mediaRates` 的 `unit` 枚举**追加** `per_10K_characters` / `per_hour` / `per_1K_seconds`（或用逐条自带的单位词）。语义清晰、**不需要任何换算**（按原单位登记即可），不破坏既有 Pricing Truth。`scripts/lib/**` 不在 t3 的 inScope，本轮只留证据、不越界修改。 |

其余可表达但本轮未收的（**不是** schema 缺口，是范围选择，均已留原文）：百度图像生成 `0.05 元/张`、`0.25 元/张`（可用 `mediaRates.per_image`）· StepFun 文生图 `0.1 元/张` / `0.02 元/张` · 百度「搜索增强 0.004 元/次」· 讯飞 `Spark-X2.5-4B 限时免费` / `-1.7B 免费`（免费能力属 Plan capability 与 Deals 的边界，需先裁决再收）。

---

## 7. 裁决与不可核（UNVERIFIABLE / DEFERRED）的完整理由

### deepseek/deals → `unverifiable`
查过的官方来源与结论（逐条）：

| 来源 | 结果 |
| --- | --- |
| `api-docs.deepseek.com/quick_start/pricing`（盘上已收录的官方定价页） | 只有 PEAK / OFF-PEAK 两档按量价，无优惠 / 赠送 / 新用户额度 |
| `api-docs.deepseek.com/` 文档索引 | 无活动 / 优惠入口 |
| `platform.deepseek.com/` | 控制台登录页，无公开优惠口径 |
| `www.deepseek.com/` 官网首页 | 无活动 / 优惠口径 |

站内检索命中的「DeepSeek 送额度」全部来自第三方论坛 / 教程站（**不可作为生产事实来源**）。⇒ 这一格是「查过、官方当前没有可收录对象」，**不是**漏采，也**没有**为它造一条优惠（任务书硬约束 6）。

### microsoft/coding → `deferred`（带 `revisitBy`）
- 官方价**可核**：`microsoft.com/en-us/copilot/pricing/business` 逐字 `Microsoft 365 Business Premium with Copilot … $32.00 user/month, paid yearly`；无 Teams 版 `$28.80 user/month, paid yearly`。
- 但它们是「M365 + Copilot」**套件捆绑订阅**，不是编程套餐；Microsoft 自营没有编程订阅（编程订阅是 **GitHub Copilot**，本仓已单列 provider `github`，其 coding 维度已 COVERED）。
- 把套件订阅写进 `coding` 会污染编程套餐横向对比（`coding` 维度的语义是「编程产品：套餐 · IDE」），**需要先裁决收录范围** ⇒ 落 DEFERRED 而不是硬塞，也不是"核不出"。
- `revisitBy`：当 coding 维度明确裁决是否收录「生产力套件订阅」（或官方推出 Microsoft 自营编程订阅、或 GitHub Copilot 与 Microsoft 合并为一个 identity）时复查。

---

## 8. 官方域登记（`scripts/data/providers.json`，captain 一次性扩权范围内）

`validate --strict` 的**官方域守卫**要求"声称 official 的出处必须落在该 provider 登记的官方域上"。商汤的记录落在 `sensecore.cn`（大装置文档站）与 `sensenova.cn`（日日新平台站），
而 master 上 `sensetime` 只登记了 `sensetime.com` —— 若把 URL 换成 `sensetime.com` 会指向一个**不存在的页面**（那是为了让门禁变绿而破坏事实）。

**处置：登记官方域（append-only，只动 sensetime 一条）**，证据（原文见 evidence §6.3）：
- `www.sensetime.com/cn/` 官网「产品体系」里，`01 商汤日日新 SenseNova` 的「立即试用」指向 `https://www.sensenova.cn/`，`02 商汤大装置 SenseCore` 的「了解更多」指向 `https://www.sensecore.cn/about`；
- 反向：`sensecore.cn` 帮助中心页脚有指向 `https://www.sensetime.com` 的「商汤官网」链接与 `business@sensetime.com`；`sensenova.cn` 页脚逐字 `© 2014-2025 SenseTime … 上海商汤科技开发有限公司是商汤集团旗下子公司`。

⇒ `officialDomains` 由 `["sensetime.com"]` 变为 `["sensetime.com","sensenova.cn","sensecore.cn"]`（**两个域都确有记录在用**，不存在"用不上的登记"）。
改前 10 条错误 → 改后 `node scripts/validate.js --strict` = **exit 0 / ✅ 校验通过（strict 模式）**（原始日志：`research/_raw/.../validate-strict-after-domains.txt`）。

---

## 9. 关系层出口（API 侧每条计价条目都必须有结局）

新增 7 条 API 记录带来 **15 条新计价条目**，出口只有两个：能对上**既有** registrySlug ⇒ 写 link；对不上 ⇒ 写 `off-registry-model` 声明。
（这两个文件原本在 t3 的 OutOfScope，captain 已一次性扩权并限定**只增不改**；`scripts/data/models.json` 仍在 OutOfScope，本轮**没有**新增任何 registry 身份 —— 那是 t8。）

### 9.1 新增 link（3 条，引文逐字复制被引用记录自己的官方引文，不新造）
| registrySlug | apiPlanId | modelKey | basis |
| --- | --- | --- | --- |
| `kimi-k3` | `c4b6948c4fa9` | `kimi-k3` | `official-pricing-page` |
| `kimi-k2.7-code` | `c4b6948c4fa9` | `kimi-k2.7-code` | `official-pricing-page` |
| `step-3.5-flash` | `03b27e432472` | `step-3.5-flash` | `official-pricing-page` |

### 9.2 新增 `off-registry-model` 声明（12 条，逐条给"为什么对不上任何 registry 身份"）
`23643dfd94f8` 之外逐条：`0940febeeea9`(ai360: 360zhinao-pro / 360zhinao-turbo-llm-geo) · `218c142dcb17`(baichuan: baichuan-m3 / baichuan-m3-plus) ·
`23643dfd94f8`(baidu: ernie-4.5-turbo-128k / ernie-5.1 standard / ernie-5.1 long_context) · `faf2d5722e71`(iflytek: spark-x2.5) ·
`09ed95f9cd81`(sensetime: sensenova-v6.5-pro / sensenova-v6.5-turbo) · `03b27e432472`(stepfun: step-3.7-flash / step-5-preview)

> 交接 t8：这 12 条里有 6 家 provider（ai360 / baichuan / baidu / iflytek / sensetime / stepfun）的 registry 身份尚未登记 —— 那正是 B-2 的 models 缺口。t8 登记身份后，这些声明应升级成 link。

### 9.3 「只增不改」的双向差证明（脚本输出，可复现）
```
links：改前 82 → 改后 85（新增 3）      消失的 link：0
declarations：改前 54 → 改后 66（新增 12）  消失的声明：0
（改前集合 = git show HEAD:scripts/data/model-registry-{links,gaps}.json 的键集合；键 = registrySlug|apiPlanId|modelKey|variant / apiPlanId|modelKey|variant）
```
> 过程中出现过一次**本轮自造的**通配声明（`ernie-5.1` + `variant:null`，展开成 2 条计价条目），它让 `coverage-targets-selftest.js` 的 t25 clause2（`declaredApiEntries === declaredApiEntryCount`，只在"没有通配"时成立）变红。
> 处置：**不改别人的断言**，把这一条拆成两条逐变体声明（`standard` / `long_context`）—— 效果相同且更精确，既有断言保持原样、恢复绿。

---

## 10. 诚实性红线自查

| 红线 | 自查结果 |
| --- | --- |
| 不猜日期 | 7 条 API 记录与 7 条套餐的 `firstSeen = lastSeen = verifiedAt = 2026-10-05`（本次观测日）；**没有**任何记录被回填成历史日期；`reviewedAt` 同为 2026-10-05 |
| 不造数据 | 每条数字都能在同一目录的 `evidence.md` 里找到对应的官方逐字片段与 URL；核不出的（deepseek/deals）落 UNVERIFIABLE 而不是编一条优惠 |
| 不建第二套真相 | 状态零手写：`coverage-targets.json` 只写意图 / 声明 / 裁决，七态仍由 `scripts/lib/coverage-targets.js` 从盘上事实派生；根 `api-plans.json` / `plans.json` / `deals.json` 与三份 history **全部由 rebuild 命令派生**（`git diff` 中 `deals.json` / `deal-history.json` 无改动） |
| Stable ID 零 churn | `api-plans` id：17 → 24（消失 0 / 新增 7）· `plans` id：37 → 44（消失 0 / 新增 7）· `deals` id：135 → 135（消失 0 / 新增 0）· 既有 link 82 条、既有声明 54 条**一条未动**；未改任何 provider key |
| 不新增 Provider | Provider Universe 仍 34 行双向对账（`declared 34 · registered 34 · undeclared 0`） |
| 不为降 MISSING 造数据 / 不改口径凑数 | 13 个 MISSING 里 2 条落 NOT_APPLICABLE 是**同一事实的编码修正**（原意图字符串自己就写着"不适用"，且补做了官方复核）；1 条落 DEFERRED（带复查条件）、1 条落 UNVERIFIABLE（附 4 个查过的官方来源），**没有**为了好看把困难格改成"不适用" |
| Analytics 本地零请求 | 本轮未触碰 analytics 相关文件；未运行任何联网采集器 |
| 不越界写 | `scripts/lib/**` / `scripts/tools/**` / `scripts/collectors/**` / `.github/**` / `scripts/data/models.json`（来源层）零改动 |

---

## 11. Verify 读数（全部 exit 0，原始日志 `research/_raw/.../verify-final.txt`）

| 命令 | exit | 关键读数 |
| --- | --- | --- |
| `node scripts/tools/coverage-report.js` | 0 | 报告自检问题 **0 处** · ✅ 覆盖报告自检通过 |
| `node scripts/tools/coverage-targets-selftest.js` | 0 | **178 项通过 / 0 项失败** |
| `npm run api-plans:rebuild` | 0 | 24 条；幂等（"无需写盘"） |
| `npm run plans:rebuild` | 0 | 44 条；幂等 |
| `npm run rebuild` | 0 | 135 条；重放与盘上**逐字节一致**（deals.json 未改） |
| `npm run models:rebuild` | 0 | 44 模型 / 85 映射；幂等 |
| `check-api-plans-reproducible.js` | 0 | 24 条 · 21 平台 · **108** 计价条目 · 单位分布 per_1M 21 / per_1K 3 |
| `check-plans-reproducible.js` | 0 | 44 条逐字节一致 |
| `check-reproducible.js` | 0 | 手写值矛盾 0 处 |
| `check-models-reproducible.js` | 0 | 44 模型 / 85 映射逐字节一致 |
| `check-model-registry-links.js` | 0 | 未判 0 条 · 候选（只供 review）0 条 |
| `check-api-plan-history.js` | 0 | 17/17 事件带 id · 重算 0 处不一致 |
| `check-plan-history.js` | 0 | 基线 + 事件重放 == 当前 plans.json |
| `npm run check:history` | 0 | 基线 + 事件重放 == 当前 deals.json |
| `node scripts/validate.js --strict` | 0 | ✅ 校验通过（strict 模式）（唯一 2 条为既有 warning：Getsolved / KREA 疑似未合并，与本轮无关） |

---

## 12. 边界与交接

1. **剩余 4 个 MISSING 是 models 维度**（ai360 / baichuan / baidu / iflytek）⇒ Workstream B-2（t8）：登记 registry 身份，并把 §9.2 的 12 条 `off-registry-model` 声明升级成 link。
2. **schema 扩项建议**（§6.2）：音频类单位（万字符 / 小时 / 1K 秒）满足"≥2 家 + 语义清晰 + 不换算"门槛，建议由 `scripts/lib` 的写域追加 `mediaRates.unit` 枚举项。
3. **`scripts/data/models.json` 的并发写入**：本轮的 `npm run models:rebuild` 会把根 `models.json` 重新派生一次（含 t2 对来源层的改动与本人新增映射带来的 `lastSeen` 前进：kimi-k3 / step-3.5-flash）。这是派生文件的正常重放，不是第二套真相；t2 完成后再派生的结果以来源层为准。
4. **`chatgpt.com/pricing` 取不到**（本机 web_fetch 与 headless 两条路径均不可达）⇒ OpenAI 档位的价格改引**同厂官方帮助中心**（`help.openai.com`，属 openai.com 官方域），每条都带逐字引文；若维护者能拿到 `chatgpt.com/pricing` 的页面，可把 `officialUrl` 换成该页（记录 id 不变）。

---

# 附录 · Workstream B-2（t8）：models 维度缺口收口

- 依赖：**t2（Workstream A）已完成**后才动 `scripts/data/models.json`（t2 已把 44 条身份的 releasedAt/releaseEvidence 落盘；本轮**没有改**其中任何一条）。
- 现场读数（重测）：MISSING **4 → 0** · COVERED 75 → **79** · `models` 维度 `{COVERED:15, PARTIAL:0, MISSING:0, DEFERRED:1, N/A:18}`。
- registry：44 → **51 条身份**（新增 7，slug 集合**消失 0**）· links：85 → **92**（+7）· 处置声明：66 → 58（**移出 8 条已被映射覆盖的声明**，保留 4 条 sensetime / stepfun 的）。
- 四格出口：`ai360/models` · `baichuan/models` · `baidu/models` · `iflytek/models` 全部 **COVERED**（先新增 registry 身份，再把对应 modelKey 映射到 api-plans 记录）。

## B2-1 新增的 7 个身份（逐条：为什么它是**独立身份**而不是别名 / 系列名）

判据统一是：**它在开发者自己的官方页面上是独立一行、有自己的 identity 串、并且已经在 api-plans 里有自己的 modelKey**（不是靠版本号或"看起来像旗舰"推出来的）。官方页面上的第三方托管行（360 广场上的 qwen/glm/deepseek、千帆上的 DeepSeek 系列）**一律不新增** —— 身份归各自的 developer。

| slug | canonicalName | developer / owner | family | officialUrl | modelRole | releasedAt | 为什么是独立身份 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `360zhinao-pro` | 360zhinao-pro | 360智脑 / 360智脑 | 360zhinao | `ai.360.com/open/zh/models` | `null` | **2026-08-05** | 官方模型广场的独立条目，另有自己的模型页（官方全名 `360zhinao/360zhinao-pro`）；与 turbo 档的 id、价格（¥2/¥5 vs ¥1/¥2）、上下文（32,000 vs 116,000）都不同 ⇒ 不是同一身份的两个别名 |
| `360zhinao-turbo-llm-geo` | 360zhinao-turbo-llm-geo | 360智脑 / 360智脑 | 360zhinao | `ai.360.com/open/zh/models` | `null` | **2026-08-24** | 同上（官方写「业务内部专用模型」）；官方 id 自带 `llm` 与业务后缀，是独立条目而不是 pro 的版本号 |
| `baichuan-m3` | Baichuan-M3 | 百川智能 / 百川智能 | Baichuan M | `platform.baichuan-ai.com/prices` | `general` | `null` | 官方价目表的独立行（输入 0.01 / 输出 0.03 元/千tokens）；与 M3-Plus、M2、M2-Plus 各占一行、单价不同 ⇒ 系列内的独立模型身份 |
| `baichuan-m3-plus` | Baichuan-M3-Plus | 百川智能 / 百川智能 | Baichuan M | `platform.baichuan-ai.com/prices` | `general` | `null` | 同上（0.005 / 0.009 元/千tokens） |
| `ernie-4.5-turbo-128k` | ERNIE-4.5-Turbo-128K | 百度智能云 / 百度智能云 | ERNIE | `cloud.baidu.com/doc/qianfan-docs/s/Jm8r1826a` | `general` | `null` | 官方「版本名称」列逐字独立一行（与 `-32K` / `-20260402` 并列，各占一行）；已在本站 api-plans 里是独立 modelKey |
| `ernie-5.1` | ERNIE-5.1 | 百度智能云 / 百度智能云 | ERNIE | 同上 | `general` | `null` | 官方「模型名称 / 版本名称」逐字 `ERNIE 5.1 / ERNIE-5.1`，是与 5.0、4.5 Turbo 并列的独立身份（不是 5.0 的版本后缀） |
| `spark-x2.5` | Spark-X2.5 | 科大讯飞 / 科大讯飞 | Spark | `xinghuo.xfyun.cn/sparkapi` | `general` | `null` | 官方产品页独立模型行（与 `Spark X2` / `Spark-X2-Flash` / `Spark-X2.5-4B` / `-1.7B` 并列，各有自己的价格行）⇒ 独立身份，不是系列名 |

**identity 与官方写法**：`canonicalName` 一律用官方页面上的写法（`Baichuan-M3-Plus` / `ERNIE-4.5-Turbo-128K` / `Spark-X2.5`）。360 的两个身份，官方广场写的是**带命名空间**的 `360zhinao/360zhinao-pro`，本表取不含命名空间段的 id 形态（与全表 51 条的既有约定一致），命名空间写法记在 `note` 里 —— 这是**格式差异**，不是改名。

**`modelRole = null` 的两个**（全表唯一的两个 null）：360 的两个身份在官方模型页上只有「模型系列 / 输入模态 / 输出模态 / 定价 / 上下文」，**没有任何能落进 `MODEL_ROLES` 枚举的能力标记**。按 `_rules` ⑨「判不出来写 null，绝不按版本号或"看起来像旗舰"猜」留 null，不拿 `llm` 这个 id 片段当能力标记。
其余 5 条的依据：百度两条取自官方价格页的**分节标题「文本生成」**；讯飞取自官方页「星火新一代**通用**旗舰模型」；百川两条取自官方按「**对话**全流程节点产生的 Token 总数」计费（同页的「医疗搜索」不落进枚举，不据此改角色）。

**`releasedAt`**：360 两条有官方一手日期（模型页逐字「发布时间 2026/8/5」「2026/8/24」，斜杠写法规范化成 `2026-08-05` / `2026-08-24`，引文保留官方原写法）；其余 5 条官方页面**只有页面更新时间或干脆没有日期**（百度页 `更新时间：2026-07-09` 是文档更新日，不是发布日）⇒ 按 `_rules` ⑩ 写 `releasedAt: null` + `releaseEvidence: []`，**没有**用版本号或第三方报道顶替（第三方新闻里"Baichuan-M3 于 2026-01 发布"一律不采）。

**没有新增的身份（反膨胀）**：千帆/360 广场上的第三方模型（DeepSeek 系列、qwen/glm 系列、Kimi、豆包…）身份归各自 developer；讯飞的 `Spark X2` / `X2-Flash`（官方只给区间价）、`Spark-X2.5-4B` / `-1.7B`（端侧、限时免费）、`Spark Lite`（只在「精调价格」列出现）本轮不新增；百川的 `Baichuan4 / 3 / 2 / M2` 系列虽仍在官方价目页，但没有对应的**当前** api-plans 记录、也不是 intent 里的"当前主力"⇒ 不新增。

## B2-2 映射与处置（不允许悬空）

新增的 7 个身份全部落到 **link**（不留在处置表里），引文逐字复制被引用记录自己的官方引文（关系层禁止新造引文）：

```
360zhinao-pro            ← ai360     / 360zhinao 模型广场按量计费              (0940febeeea9)
360zhinao-turbo-llm-geo  ← ai360     / 360zhinao 模型广场按量计费              (0940febeeea9)
baichuan-m3              ← baichuan  / 百川大模型按量计费                      (218c142dcb17)
baichuan-m3-plus         ← baichuan  / 百川大模型按量计费                      (218c142dcb17)
ernie-4.5-turbo-128k     ← baidu     / 千帆模型按量后付费                      (23643dfd94f8)
ernie-5.1                ← baidu     / 千帆模型按量后付费（variant 通配两个档）(23643dfd94f8)
spark-x2.5               ← iflytek   / 星火大模型 API 按量计费                 (faf2d5722e71)
```

**同时必须移出 8 条旧声明**：B-1 给这 7 个 modelKey 写的 `off-registry-model` 声明（8 行，含 ernie-5.1 的两个变体）在身份登记后就**与映射打架**了 —— 关系层的反绕过判据要求「能对上就必须写映射」。移出的是 **B-1（同一个 worker）本轮新增的声明**，t3 之前就存在的 54 条一条未动；保留 4 条（sensetime 2 / stepfun 2 —— 它们的身份尚未登记）。
`officialUrl` 还必须落在**某条映射记录真实引用过的页面**上（`models-selftest` 的判据）：360 两条最初写成各自的模型页，被这条判据拦下 ⇒ 改成广场页 `ai.360.com/open/zh/models`（该页确实列出两个模型，且就是映射记录的 officialUrl），模型页则留在 `releaseEvidence.sourceUrl` 里。

## B2-3 意图层

`coverage-targets.json` 给四家补了 models 维度的 `currentTargets`（规范序：维度序 + 目标名升序）：
`ai360: 360zhinao-pro / 360zhinao-turbo-llm-geo` · `baichuan: baichuan-m3 / baichuan-m3-plus` · `baidu: ernie-4.5-turbo-128k / ernie-5.1` · `iflytek: spark-x2.5`
⇒ 四格全部 COVERED（declared 全部兑现）。`sensetime/models` 的 DEFERRED 裁决与它的复查条件**未触发**（本轮没有登记任何商汤归属身份）⇒ 保持原样、不制造"看起来已复查"的假象。

## B2-4 门禁读数

| 命令 | exit | 读数 |
| --- | --- | --- |
| `node scripts/tools/check-models-reproducible.js` | 0 | 51 个模型 · 92 条映射逐字节一致 |
| `node scripts/tools/check-model-registry-links.js` | 0 | API 未判 0 条 · 候选 0 条 |
| `node scripts/tools/coverage-report.js` | 0 | 报告自检 **0 处** |
| `node scripts/validate.js --strict` | 0 | ✅ 校验通过（strict 模式） |
| `node scripts/tools/models-selftest.js` | 0 | **148 项通过 / 0 项失败**（收口时实测）。收口前它红过 3 项，全是 `scripts/tools/models-selftest.js` 里**写死的基线计数**（`total === 44`、`apiDecl.length === 12`、`declaredApiEntries.length === 12`，实际 51 / 16 / 16）——**该文件属 t8 的 OutOfScope，本轮一个字都没改**；captain 已裁定归 **t12**（report-engine-engineer）改成结构不变量，t12 落地后这三项已恢复绿。 |

## B2-5 被移出的 8 条处置声明（逐条：为什么"移出"才是对的）

关系层的**反绕过判据**要求：一条计价条目只要能对上 registry 身份，就**必须**写映射，不许留在处置表里 —— 处置表的语义是「**对不上**任何 registry 身份」。B-2 给这 7 个 modelKey 登记身份并写 link 之后，原来那 8 条 `off-registry-model` 声明就从"结论"变成了"与映射打架的重复账"，**必须移出**（不是删数据：同一件事在关系层换了正确的出口）。

| # | 被移出的声明（apiPlanId \| modelKey \| variant） | 现在的出口 |
| --- | --- | --- |
| 1 | `0940febeeea9` \| 360zhinao-pro \| standard | link → slug `360zhinao-pro` |
| 2 | `0940febeeea9` \| 360zhinao-turbo-llm-geo \| standard | link → slug `360zhinao-turbo-llm-geo` |
| 3 | `218c142dcb17` \| baichuan-m3 \| standard | link → slug `baichuan-m3` |
| 4 | `218c142dcb17` \| baichuan-m3-plus \| standard | link → slug `baichuan-m3-plus` |
| 5 | `23643dfd94f8` \| ernie-4.5-turbo-128k \| standard | link → slug `ernie-4.5-turbo-128k` |
| 6 | `23643dfd94f8` \| ernie-5.1 \| standard | link → slug `ernie-5.1`（`variant: null` 通配两个变体） |
| 7 | `23643dfd94f8` \| ernie-5.1 \| long_context | 同上（被同一条通配 link 覆盖） |
| 8 | `faf2d5722e71` \| spark-x2.5 \| standard | link → slug `spark-x2.5` |

**一条未动的**：t3 之前就存在的 54 条声明（含 12 条 API 侧）**全部保留**；本轮只移出 t3（同一个 worker）在本轮新增、且已被映射覆盖的那 8 行。

**重复声明自查（captain 让核实的一条）**：收口时实测 `scripts/data/model-registry-gaps.json` = **58 行 / 58 个唯一键 / 0 条重复**（键 = API 侧 `(apiPlanId, modelKey, variant)`、Coding 侧 `(planId, modelName)`）；API 侧 16 行 reason 全为 `off-registry-model`。此前被测到的 `23643dfd94f8 / ernie-5.1` 重复项，已随本轮"登记身份 + 写映射 + 移出声明"一并消失（该 modelKey 现在**只有 link、没有任何声明**，这正是唯一性要求的形态）。
