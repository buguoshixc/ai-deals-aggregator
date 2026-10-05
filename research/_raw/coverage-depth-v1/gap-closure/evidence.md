# t3 官方取证留档（coverage-depth-v1 · Workstream B-1）

- 采集日（全部）：**2026-10-05**（Asia/Shanghai）
- 工具：`web_fetch`（静态页）· `research/_raw/coverage-depth-v1/gap-closure/_render.js`（JS 渲染页，走仓库自带的 `scripts/lib/browser.js` headless 渲染器）
- 规则：只采**厂商自己的官方域**；第三方目录 / 媒体 / 榜单只用于发现官方 URL，不作为生产事实来源。
- 本文件是**逐字片段**留档，供维护者复核「数据字段 ↔ 官方原文」的对应关系。完整渲染产物见同目录 `raw-*.txt`。

---

## 1. 百川智能（baichuan）

- URL：`https://platform.baichuan-ai.com/prices`（web_fetch，HTTP 200）
- 用途：`curated_api_plans.json` → provider baichuan / 百川大模型按量计费

```
### 价格说明 / 计费模式
按照实际使用的数据量（千tokens）收费。Token在这里指的是文本中的一个最小单位…

| 计费项 | 上下文长度 | 时间（每日） | 价格 | 备注 |
| 模型调用 Baichuan-M3-Plus | 32k | 00:00 ~ 24:00 | 输入：0.005元/千tokens  输出：0.009元/千tokens | 包括对话全流程节点产生的Token总数；此外，调用过程会自动触发"医疗搜索"并单独计费 |
| 模型调用 Baichuan-M3 | 32k | 00:00 ~ 24:00 | 输入：0.01元/千tokens  输出：0.03元/千tokens | |
| 模型调用 Baichuan-M2-Plus | 32k | 00:00 ~ 24:00 | 输入：0.01元/千tokens  输出：0.03元/千tokens | … |
| 搜索增强服务 | - | 00:00 ~ 24:00 | 0.03元/次 | 开启 web_search 后，接口自动判断调用搜索增强服务的次数 |
| 医疗搜索 | - | 00:00 ~ 24:00 | 0.03元/次 | 调用Baichuan-M3-Plus和Baichuan-M2-Plus对话会自动触发医疗搜索 |
```

Coding 复核（同一页 + 站内公开面）：只有按量计费、搜索增强、知识库（1.5 元/GB/天）、Embeddings、Assistants API，
**没有任何编程 / 订阅套餐** ⇒ `coding` 判 NOT_APPLICABLE（意图层编码修正，见主报告 §4）。

## 2. 百度智能云千帆（baidu）

- URL：`https://cloud.baidu.com/doc/qianfan-docs/s/Jm8r1826a`（JS 渲染页 → headless 渲染，`raw-baidu-qianfan-pricing.txt`）
- 页面自带更新时间：`更新时间：2026-07-09`
- 用途：`curated_api_plans.json` → provider baidu / 千帆模型按量后付费

```
文本生成 · 按量后付费
模型名称 版本名称 服务内容 子项 在线推理 批量推理 单位
ERNIE 5.1 | ERNIE-5.1 | 推理服务 | 输入（输入<=32k） 0.004 - 元/千tokens | 输出（输入<=32k） 0.018 - 元/千tokens
                                        | 输入（32k<输入<=128k） 0.006 - 元/千tokens | 输出（32k<输入<=128k） 0.022 - 元/千tokens
ERNIE 5.0 | ERNIE-5.0 / EERNIE-5.0-Thinking-Preview / ERNIE-5.0-Thinking-Latest / ERNIE-5.0-Thinking-Exp
          | 输入（输入=<32k） 0.006 -- 元/千tokens | 输出（输入=<32k） 0.024 -- 元/千tokens | 输入（32k<输入=<128k） 0.01 -- | 输出（32k<输入=<128k） 0.04 --
ERNIE 4.5 Turbo | ERNIE-4.5-Turbo-128K | 输入 0.0008 0.00032 元/千tokens | 命中缓存 0.0002 -- 元/千tokens | 输出 0.0032 0.00128 元/千tokens | 搜索增强 触发 0.004 0.0016 元/次
ERNIE 4.5 Turbo VL | ERNIE-4.5-Turbo-VL / ERNIE-4.5-Turbo-VL-32K | 输入 0.003 0.0012 元/千tokens | 输出 0.009 0.0036 元/千tokens
ERNIE X1.1 | ERNIE-X1.1-Preview | 输入 0.001 - -- -- 元/千tokens | 输出 0.004 - -- -- 元/千tokens | 搜索增强 触发 0.004 - -- -- 元/次
（注：ERNIE-4.5-Turbo-32K、DeepSeek 系列模型批量推理服务限时优惠，活动时间为 2月2日00:00:00- 3月31日23:59:59）
```

> 本轮只收**在线推理**列（`standard`），未把批量推理价塞进标准价；ERNIE-5.1 的两个输入长度档按 `long_context` 变体分别记录。

## 3. 360 智脑开放平台（ai360）

- URL：`https://ai.360.com/open/zh/models`（JS 渲染页 → headless 渲染，`raw-ai360-models.txt`）
- 用途：`curated_api_plans.json` → provider ai360 / 360zhinao 模型广场按量计费

```
360zhinao/360zhinao-turbo-llm-geo  360智脑  业务内部专用模型
输入价格: ¥1 / 1M tokens  输出价格: ¥2 / 1M tokens  缓存写入价格: ¥1.25 / 1M tokens  缓存读取价格: ¥0.1 / 1M tokens
上下文: 116,000  最大输出: 16,000

360zhinao/360zhinao-pro  360智脑
输入价格: ¥2 / 1M tokens  输出价格: ¥5 / 1M tokens  缓存写入价格: ¥2.5 / 1M tokens  缓存读取价格: ¥0.2 / 1M tokens
上下文: 32,000  最大输出: 8,192
```

该站是**模型广场**（共 94 个模型，含第三方），其中 `360zhinao/*` 为 360 自研。站内没有任何自营编程订阅档位
（只有「第三方工具接入」文档）⇒ `coding` 判 NOT_APPLICABLE。

## 4. 科大讯飞星火（iflytek）

- URL：`https://xinghuo.xfyun.cn/sparkapi`（JS 渲染页 → headless 渲染，`raw-iflytek-sparkapi.txt`）
- 用途：`curated_api_plans.json` → provider iflytek / 星火大模型 API 按量计费

```
星火大模型 Spark-X2.5  星火新一代通用旗舰模型，全国产化算力训练，智能体及代码能力全面提升，覆盖全球200+语言
模型价格 限时五折  输入 1.60 元/百万tokens  输出 6.00 元/百万tokens  缓存命中 0.24 元/百万tokens

（同页其余档位）Spark-X2.5-4B 限时免费 · Spark-X2.5-1.7B 免费 · Spark X2 2 ~ 3 元/百万tokens · Spark-X2-Flash 1 ~ 2 元/百万tokens
星辰MaaS 开源模型：GLM-5.2 8/28 元 · Kimi-K2.7-Code 6.5/27 元 · DeepSeek-V4-Pro 12/24 元 · DeepSeek-V4-Flash 1/2 元（均 元/百万tokens）
```

> 取舍：`Spark X2` / `Spark-X2-Flash` 官方只给**区间价**（2~3、1~2 元），当前 schema 的一个 `rates` 字段装不下区间 ⇒ 不收（见主报告 §6 DEFERRED_SCHEMA）。
> `Spark-X2.5` 官方价格区同时标注「限时五折」，表中数字按官方原样收，并在 model.note 里逐字标注该标注 —— 不推算原价。

## 5. 月之暗面 Kimi 开放平台（moonshot）

- URL：`https://platform.kimi.com/docs/pricing/chat`（web_fetch；同页 `.md` 变体给出表格源码）
- 用途：`curated_api_plans.json` → provider moonshot / Kimi 开放平台模型推理按量计费

```
K3 系列模型
模型 | 计费单位 | 缓存写入（TTL 5min） | 缓存写入（TTL 1h） | 输入价格（缓存命中） | 输入价格（缓存未命中） | 输出价格 | 上下文窗口
kimi-k3 | 1M tokens | ¥20.00 | ¥40.00 | ¥2.00 | ¥20.00 | ¥100.00 | 1,048,576 tokens

K2 系列模型
模型 | 计费单位 | 输入价格（缓存命中） | 输入价格（缓存未命中） | 输出价格 | 上下文窗口
kimi-k2.7-code | 1M tokens | ¥1.30 | ¥6.50 | ¥27.00 | 262,144 tokens
kimi-k2.7-code-highspeed | 1M tokens | ¥2.60 | ¥13.00 | ¥54.00 | 262,144 tokens
kimi-k2.6 | 1M tokens | ¥1.10 | ¥6.50 | ¥27.00 | 262,144 tokens

"此处 1M = 1,000,000，表格中的价格代表每消耗 1M tokens 的价格。"
```

## 6. 商汤科技日日新 / 大装置（sensetime）

### 6.1 API 按量后付费
- URL：`https://www.sensecore.cn/help/docs/model-as-a-service/nova/pricing`（web_fetch，HTTP 200）
- 用途：`curated_api_plans.json` → provider sensetime / 日日新大模型 Tokens 按量后付费

```
计费单位：千tokens：1 千tokens = 1000 tokens，调用模型服务时根据实际的输入和输出tokens数量收费。

日日新-融合模态大模型（价格参考）
SenseNova-V6.5-Pro模型调用   | 输入tokens 0.003元/千tokens | 输出tokens 0.009元/千tokens
SenseNova-V6.5-Turbo模型调用 | 输入tokens 0.0015元/千tokens | 输出tokens 0.0045元/千tokens
SenseNova-V6-Pro模型调用     | 0.003 / 0.009 元/千tokens
SenseNova-V6-Turbo模型调用   | 0.0015 / 0.0045 元/千tokens
SenseNova-V6-Reasoner模型调用| 0.004 / 0.016 元/千tokens
```

同站另有 `TPM配额包预付费` / `Tokens量包预付费`（容量预留 / 季付包形态）⇒ **未**写成 per_1M_tokens（见主报告 §6）。

### 6.2 SenseNova Token Plan（coding 维度）
- URL：`https://www.sensenova.cn/token-plan`（web_fetch，HTTP 200）
- 用途：`curated_plans.json` → provider sensetime / SenseNova Token Plan · Free(公测)

```
订阅方案
公测期完全免费开放，付费档位即将上线

Free · 公测  限时放量  ¥ 0/月
60,000 积分 / 5 小时i特殊模型除外，具体参考文档说明。
· SenseNova 6.8 Flash Lite 与 SenseNova U1 Fast
· 原生多模态架构，理解生成一体
· 最多 20 个 API Key

Lite / Pro  即将上线  付费档位即将推出
```

> 付费档官方写「即将上线」且**没有任何公开价** ⇒ 不收录（进门条件第一条不满足），只在 note 里记录该事实。

### 6.3 官方域登记依据（为什么 sensecore.cn / sensenova.cn 属于商汤官方）
- URL：`https://www.sensetime.com/cn/`（商汤官网，web_fetch，HTTP 200）

```
产品体系
01 商汤日日新 SenseNova 大模型及应用 …… [立即试用](https://www.sensenova.cn/)
02 商汤大装置 SenseCore 原生 AI 云基础设施 …… [了解更多](https://www.sensecore.cn/about)
…
沪 ICP 备 19044592 号-3 | 沪公网安备 31010402009327 号 © 2014-2026 SenseTime. All Rights Reserved. 上海商汤智能科技有限公司
公司 [400-900-5986](tel:4009005986) [business@sensetime.com](mailto:business@sensetime.com)
```

反向亦可核：`sensecore.cn` 帮助中心页脚有指向 `https://www.sensetime.com` 的「商汤官网」链接与 `business@sensetime.com` 联系邮箱；
`sensenova.cn` 页脚逐字写 `© 2014-2025 SenseTime. All Rights Reserved. 上海商汤科技开发有限公司是商汤集团旗下子公司`。

⇒ 官网**指向**这两个域，两个域页脚**署名** SenseTime ⇒ 登记为 sensetime 官方域（`scripts/data/providers.json` → `officialDomains`，append-only）。

## 7. 阶跃星辰 StepFun（stepfun）

- URL：`https://platform.stepfun.com/docs/zh/guides/pricing/details`（web_fetch；`.md` 变体给出表格源码）
- 用途：`curated_api_plans.json` → provider stepfun / StepFun 开放平台模型推理按量计费

```
多模态推理大模型的定价表
模型 | 计费单位 | 输入价格（缓存未命中） | 输入价格（缓存命中） | 输出价格
step-5-preview  | 1M tokens | 7 元   | 0.35 元 | 20 元
step-3.7-flash  | 1M tokens | 1.35 元 | 0.27 元 | 8.1 元

推理大模型的定价表
step-3.5-flash        | 1M tokens | 0.7 元 | 0.14 元 | 2.1 元
step-3.5-flash-2603   | 1M tokens | 0.7 元 | 0.14 元 | 2.1 元

视觉大模型的定价表
step-1o-turbo-vision  | 1M tokens | 2.5 元 | 0.5 元 | 8 元

语音合成：stepaudio-3-tts 2.5 元 / 万字符 … 语音识别：stepaudio-2.5-asr 0.15 元/小时 … 文生图：step-2x-large 0.1 元 / 张
```

> 只收 token 计费表（3 条）。语音合成的「元/万字符」、语音识别的「元/小时」当前 mediaRates 单位枚举里没有对应项 ⇒ 不收（主报告 §6）。

## 8. OpenAI（openai）· coding 档位

> 说明：`chatgpt.com/pricing` 在本机 web_fetch 与 headless 两条路径都取不到（站点侧不可达），
> 因此改用**同厂官方帮助中心**（`help.openai.com`，属 openai.com 官方域）的价格陈述；每条记录都带原文引文。

- `https://help.openai.com/en/articles/6950777-what-is-chatgpt-plus`（ChatGPT Plus）
```
ChatGPT Plus is a subscription plan that provides enhanced access to the ChatGPT web app for $20/month.
Subscription Details — Price: $20/month (billed monthly).
Usage Limits — To ensure a smooth experience for all users, Plus subscriptions may include usage limits such as
message caps, especially during high demand. These limits may vary based on system conditions.
Is there an annual plan available? Currently, we do not support annual billing or the option to pay for multiple months in advance.
```
- `https://help.openai.com/en/articles/9793128-about-chatgpt-pro-tiers`（Pro 三档）
```
ChatGPT Pro now offers Pro 500, a new $500/month plan that includes Astra Ultrafast. Pro 200 is also available for new subscriptions again.
| Plan | Monthly price (USD) | Ultrafast |
| Pro 100 | $100 | Not included |
| Pro 200 | $200 | Not included |
| Pro 500 | $500 | Included |
Pro 200 includes more usage than Pro 100. Pro 500 offers the highest included usage of the three plans.
Does Pro offer annual billing? Pro is billed monthly. Annual billing and payment for multiple months in advance are not available.
```
- `https://help.openai.com/en/articles/8792828-chatgpt-business-overview`（Business 座位）
```
| Seat type | Price per seat | Included access | Billing model |
| Standard seat | Monthly plan: $25 per user per month  /  Annual plan: $20 per user per month, billed annually | ChatGPT, ChatGPT Work, and Codex | Fixed per-user cost, billed monthly or annually. |
| Premium seat  | Monthly plan: $125 per user per month /  Annual plan: $100 per user per month, billed annually | ChatGPT, ChatGPT Work, and Codex with higher usage limits | … |
A Business workspace requires at least 2 Standard or Premium seats in total.
```
- `https://help.openai.com/en/articles/12003714-chatgpt-business-models-and-limits`（座位用量口径）
```
Premium seats have 5x the included usage of Standard seats, with the benefit of no 5-hour limit
Local-message estimates by seat type（每 5 小时窗口）：GPT-6 Astra 5-45 · GPT-6.1 Sol/GPT-6 Sol 15–150 · GPT-5.6 Sol 10–100 …
```

## 9. DeepSeek（deepseek）· deals 维度：查过哪些官方来源

| 官方来源 | 结果 |
| --- | --- |
| `https://api-docs.deepseek.com/quick_start/pricing`（定价页，盘上已收录） | 只有 PEAK / OFF-PEAK 两档**按量价**，没有优惠 / 赠送 / 新用户额度 |
| `https://api-docs.deepseek.com/`（文档首页与索引） | 无活动 / 优惠入口 |
| `https://platform.deepseek.com/` | 控制台登录页，无公开优惠口径 |
| `https://www.deepseek.com/` | 官网首页，无活动 / 优惠口径 |

站内检索到的「DeepSeek 送额度」类内容全部来自**第三方论坛 / 教程站**（不可作为生产事实来源）⇒ 该格落 `unverifiable`（查过、官方当前没有可收录的公开优惠对象）。

## 10. Microsoft（microsoft）· coding 维度：查过哪些官方来源

| 官方来源 | 读到的原文 | 结论 |
| --- | --- | --- |
| `https://www.microsoft.com/en-us/copilot/pricing/business` | `Microsoft 365 Business Premium with Copilot … $32.00 user/month, paid yearly (Annual subscription—auto renews)` | 是「M365 + Copilot」套件捆绑 SKU |
| `https://www.microsoft.com/en-us/copilot/pricing/business-without-teams` | `Microsoft 365 Business Premium with Copilot (no Teams) … $28.80 user/month, paid yearly` | 同上（无 Teams 版） |
| 站内检索「Microsoft 自营编程订阅」 | 编程订阅是 **GitHub Copilot**（本仓已单列 provider `github`，tier=major，coding 已 COVERED） | Microsoft 自营**没有**编程订阅套餐 |

⇒ 价格可核、但类别不属于 coding ⇒ 先裁决收录范围 ⇒ 落 `deferred` + `revisitBy`（不是"核不出"，也不是"没有价"）。

## 11. Replit（replit）· coding 维度（PARTIAL → COVERED）

盘上事实（`plans.json`，firstSeen 2026-10-04，已在 master 上）：`replit / Core / $20 monthly`、`replit / Pro / $100 monthly`，
引文出自 `https://replit.com/pricing`。本轮**不改数据**，只修意图层声明：`currentTargets` 由 `Replit Core` 改为盘上真实 plan identity `Core` + `Pro`。
