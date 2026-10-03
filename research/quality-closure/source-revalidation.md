# source-revalidation — §12 四条 Deal 出处复核 + §16 API 计价抽样核对

> **任务**：T04（owner `evidence-analyst`，attempt 1）
> **执行时间**：2026-10-03 22:30–22:40（Asia/Shanghai）· 全部抓取在同一时段完成
> **执行环境**：本机 DSH `web_fetch`（**纯 HTTP，不执行 JS，不带登录态**）；`web_search` 只用于**找官方 URL**，其返回的第三方内容一律只作线索（见 §0.3）
> **交付**：本文。**本任务不修改任何生产数据**（`deals.json` / `api-plans.json` / 来源层一律未动；确认的问题走 §3 的交接消息）
> **上游**：`FINDING_STATUS_BEFORE.md`(T02) 已确认 `F-online-008` 在 `21cf66d5` 上仍 `STILL_PRESENT` 且为 **UNVERIFIED**（审计未逐条回访 28 个官方 URL）；本文是该 UNVERIFIED 项的**首次逐条回访**，但只覆盖其中 4 条。

---

## 0. 口径与纪律（先读）

### 0.1 §12 的六类定义（逐字来自 Prompt §12）

| 类 | 含义 | 本轮判据 |
|---|---|---|
| `CONFIRMED_ACTIVE` | 官方页面上能看到记录描述的活动/额度 | 必须能引用**官方正文** |
| `CONFIRMED_ENDED` | 官方页面**明确说**已结束/已下线 | 只有官方明文才算，猜测不算 |
| `SOURCE_MOVED` | 记录里的 URL 已迁移，活动/事实在**新的官方地址** | 需看到跨域跳转或官方新址 |
| `TEMPORARILY_UNAVAILABLE` | 页面可达但**本轮读不到正文**（JS 壳 / 反爬 / 截断） | 「读不到」**不等于**结束 |
| `REGION_OR_LOGIN_LIMITED` | 需要登录或受地区限制 | — |
| `UNVERIFIABLE` | 无法判定（如网络层失败、找不到官方页面） | 必须写原因 |

### 0.2 硬性纪律（逐条执行）

1. **访问不到 ≠ ended**：本轮 4 条 Deal 中 3 条属「读不到正文」，**没有**任何一条被判 `CONFIRMED_ENDED`，也**没有**触发任何生命周期改动。
2. **第三方页面只能产生候选**：`web_search` 命中的第三方站（CSDN、ifeng、ainav、aireiter 等）只用于找官方 URL，未作为任何结论的证据。
3. **production 事实修改必须有官方证据**：本轮**没有**任何一条达到「可据以改 production」的证据强度（详见 §3 的交接候选）。
4. **本任务不直接改数据**：确认的问题以消息交接给 `provenance-pricing-engineer` / `registry-engineer`。
5. **抓取局限如实记录**：本机 `web_fetch` 不执行 JS，因此 SPA 站点一律退化为「HTTP 200 + 空正文」；这类结果只能判 `TEMPORARILY_UNAVAILABLE`/`UNVERIFIABLE`。

### 0.3 本轮抓取清单（可复现）

| # | URL | 结果 |
|---|---|---|
| 1 | `https://bigmodel.cn/pricing` | HTTP 200 · 正文仅「智谱丨BigModel 平台」+ loading.gif（SPA 壳） |
| 2 | `https://open.bigmodel.cn/pricing` | HTTP 200 · 同上 SPA 壳 |
| 3 | `https://docs.bigmodel.cn/cn/coding-plan/credit-campaign-rules` | HTTP 200 · **正文可读**（官方文档） |
| 4 | `https://docs.bigmodel.cn/cn/guide/start/introduction` | HTTP 200 · 正文可读（导航含「API 定价」） |
| 5 | `https://docs.bigmodel.cn/cn/guide/start/pricing` | HTTP 200 · 正文**被截断**（只取到导航与目录，未取到价格表） |
| 6 | `https://docs.bigmodel.cn/cn/guide/models/text/glm-5.3` | HTTP 200 · 正文可读，但该页不含价格 |
| 7 | `https://hailuoai.com/vip` | HTTP 200 · 正文为视频首页壳（无会员价格） |
| 8 | `https://hailuoai.video/zh-Intl/subscribe` | HTTP 200 · 壳（「低至 每月」「登录」） |
| 9 | `https://www.volcengine.com/product/ark` | HTTP 200 · 正文为空 |
| 10 | `https://ai.volcengine.com/docs/88760/2646923?lang=zh` | HTTP 200 · 正文为空 |
| 11 | `https://www.volcengine.com/docs/82379/1099320` | 跨域跳转 → `https://docs.volcengine.com/docs/ark/model-pricing?redirect=1&lang=zh`（HTTP 200 · 正文为空） |
| 12 | `https://help.aliyun.com/zh/model-studio/model-pricing` | HTTP 200 · 正文仅标题（JS 壳） |
| 13 | `https://www.alibabacloud.com/help/en/model-studio/model-pricing` | HTTP 200 · **正文可读**（官方英文对照页） |
| 14 | `https://docs.anthropic.com/en/docs/about-claude/pricing` | **跨域重定向** → `platform.claude.com` → `www.anthropic.com` |
| 15 | `https://platform.claude.com/docs/en/about-claude/pricing` | 同样跨域重定向 → `www.anthropic.com` |
| 16 | `https://www.anthropic.com` | HTTP 200 · 营销首页（**无 API 价格表**） |
| 17 | `https://api-docs.deepseek.com/quick_start/pricing` | HTTP 200 · **正文可读**（含完整价格表） |
| 18 | `https://ai.google.dev/gemini-api/docs/pricing` | **网络层失败**（`TypeError: fetch failed`） |
| 19 | `https://ai.google.dev/pricing` | **网络层失败**（同） |
| 20 | `https://platform.minimax.cn/docs/guides/pricing-paygo` | HTTP 200 · **正文可读** |
| 21 | `https://platform.openai.com/docs/pricing` | **HTTP 403**（Cloudflare「Sorry, you have been blocked」） |
| 22 | `https://siliconflow.cn/pricing` | HTTP 200 · **正文可读**（价格表被尾部截断） |
| 23 | `https://cloud.tencent.com/document/product/1729/97731` | HTTP 200 · **正文可读** |

---

## 1. §12：四条 Deal 出处复核

### 1.1 结论表

| # | Deal id | 记录声称 | 官方 URL（记录里） | 本轮分类 | 关键证据 |
|---|---|---|---|---|---|
| 1 | `1688614d6669` | 智谱AI 邀请好友注册赠送 Tokens 资源包，「官方活动页标注最高可领取总计 2亿 Tokens 资源包」 | `https://bigmodel.cn/pricing`（`sourceUrl=null`） | **TEMPORARILY_UNAVAILABLE** | 记录 URL 是 SPA 壳（抓取 #1）；官方文档里可读的同主题页（#3）描述的是**另一种权益**（见 1.2） |
| 2 | `97d21ff73d3e` | 智谱AI 新用户注册专享 2000万 免费 Tokens 资源包（含 120 次图像/视频资源包） | `https://bigmodel.cn/pricing` | **UNVERIFIABLE** | 记录 URL 是 SPA 壳；在可读的官方页（#3/#4/#6）里**没有**出现「2000万」或该活动描述 |
| 3 | `1c057c22422c` | 海螺AI 会员限时优惠价：基础会员 105 元/月 → **限时 55 元**（标准 385→196、大师 799→463） | `https://hailuoai.com/vip` | **TEMPORARILY_UNAVAILABLE** | 抓取 #7 返回的是视频首页壳，正文无会员价格；国际站订阅页（#8）同为壳且需登录 |
| 4 | `d6aaee8c7379` | 火山方舟免费额度（图像生成）：**50 张**（Doubao-Seedream-5.0-lite） | `https://www.volcengine.com/product/ark` | **TEMPORARILY_UNAVAILABLE** | 抓取 #9/#10/#11 三处官方页面正文均为空（JS SPA） |

> **没有任何一条被判 `CONFIRMED_ENDED`**；`1c057c22422c` 的记录本身写着 `validity=限时优惠价，促销期结束后恢复原价，以官方页面实时展示为准`，本轮读不到页面**不构成**促销结束的证据。

### 1.2 唯一新增的官方证据（对第 1 条，仍只是**候选**）

官方文档页 `https://docs.bigmodel.cn/cn/coding-plan/credit-campaign-rules`（HTTP 200 可读，标题「活动规则 · 邀请好友得赠金」）**逐字**写着：

- 「**「拼好模」活动将已于 2026 年 7 月 9 日正式下线。** 感谢您的支持与参与。」
- 「**最新版本生效日期**：2026 年 03 月 15 日」
- 现行「邀请好友得赠金」条款（受邀用户）：完成注册并**首次成功付费订阅且仅限于订阅【GLM Coding】服务**时，享该订单金额 **5% 立减**；仅限新注册或从未付费的历史用户，每人一次。
- 邀请者福利：好友**完成首单有效支付**后，邀请人得**首单实际支付金额的 10% 作为赠金**（满 3 名有效好友起发；每满 30 人再得一轮 10%）；赠金**仅可抵扣**平台订阅、资源包与 API 费用，**不可提现/转让**，长期有效。

**与记录声称的差异（候选，未定案）**：记录写的是「邀请好友实名注册即赠送 Tokens…最高 2亿 Tokens 资源包」；现行官方活动页写的是「**赠金**（按首单支付金额的 10%）且**以订阅 GLM Coding 为条件**」。两者不是同一件事。
**为什么仍不定案**：① 记录没有 `sourceUrl`，无法确认其原始出处就是这页；② 「拼好模」是否为记录所指的活动，无法从记录文本证实；③ 本机抓不到记录 URL 的正文。
⇒ 结论：**只能作为「需要官方证据复核」的候选**，交 §3 处理；**不得**据此改 `active/ended`，也**不得**据此改文案。

### 1.3 逐条明细（看到了什么 / 没看到什么）

**`1688614d6669`（智谱·邀请好友）**
- 记录字段：`benefitType=free_credits,developer_credit`、`verified=false`、`firstSeen=2026-09-21`、`lastSeen=2026-10-03`、`source=智谱AI活动页`、`sourceUrl=null`、`url=https://bigmodel.cn/pricing`。
- 看到：`bigmodel.cn/pricing` 返回 200 但正文只有站点名与一个 loading 图（SPA）；官方文档活动规则页（另一 URL）**可读**，内容是「赠金」而非「Tokens 资源包」，并声明「拼好模」已于 2026-07-09 下线。
- 没看到：记录 URL 上任何活动文案；任何官方页面上的「2亿 Tokens」字样。

**`97d21ff73d3e`（智谱·新用户 2000万）**
- 记录字段：`benefitType=free_credits,free_api`、`verified=false`、`eligibility=智谱开放平台新注册用户（需实名认证）`。
- 看到：同上的 SPA 壳；官方文档的「平台介绍 / API 定价（截断）/ GLM-5.3」三页均**不含**新用户赠额描述。
- 没看到：「2000万」「120 次图像和视频资源包」在任何可读官方正文里出现。
- ⇒ 这是**读不到 + 找不到官方页**的组合，判 `UNVERIFIABLE`（原因：官方活动页为 JS SPA，本机 web_fetch 不执行 JS；且未发现可读的官方等价页）。

**`1c057c22422c`（海螺AI·会员限时价）**
- 记录字段：`source=Curated-CN`、`verified=true`、`verifiedAt=2026-09-22`、`provenance.credibility=editorial`、`provenance.sourceUrl=https://hailuoai.com/vip`。
- 看到：`hailuoai.com/vip` → 200，正文是「海螺视频：每个想法都是一部大片」这类站点壳；国际站 `hailuoai.video/zh-Intl/subscribe` → 200，壳（只有「低至 每月」「登录」）。
- 没看到：任何会员档位与价格（105/55、385/196、799/463 均未出现）。
- ⇒ 该条 2026-09-22 曾被人工核过（记录自述），本轮**无法重新核到**；判 `TEMPORARILY_UNAVAILABLE`。

**`d6aaee8c7379`（火山方舟·Seedream 免费额度 50 张）**
- 记录字段：`source=火山方舟`、`sourceUrl=null`、`discountInfo=火山方舟免费额度（图像生成）：50张。`、`provenance.fields.audience/benefitType` 的 `derived=inferred` 且 note 里自述「该条 eligibility 字段本身为空」。
- 看到：`volcengine.com/product/ark`、`ai.volcengine.com/docs/88760/2646923`、`docs.volcengine.com/docs/ark/model-pricing` 三处均 200 但**正文为空**。
- 没看到：「50 张」以及任何免费额度文案。
- **附带观察（数据质量，非本轮结论）**：该条的 `discountInfo` 是**无官方引文**的断言（记录里没有 `evidence[].quote` 支撑「50 张」），与 §7.1/§7.2 要求的「事实必须能追到官方引文」相比是弱证据；已列入 §3 交接。

---

## 2. §16：13 条 API 计费记录逐条核对

覆盖：**10 个 provider 全部至少 1 条**；13 条记录全部尝试核对（其中 6 条可逐项确认）。

### 2.1 结论表

| # | 记录（provider / id / 通道） | officialUrl 可读性 | 核对结果 | 分类 |
|---|---|---|---|---|
| 1 | aliyun `ebc4af9a71b6`（standard, CNY） | 中文页 JS 壳；**改用官方英文对照页**（`alibabacloud.com/help/en/model-studio/model-pricing`）可读 | **部分逐项一致**：单位 per 1M tokens ✓；`qwen3-max` 两档 ¥2.5/¥10 与 ¥4/¥16 ↔ 英文页 China(Beijing) 表 $0.359/$1.434 与 $0.574/$2.294 ✓；`qwen-max` ¥2.4/¥9.6 ↔ $0.345/$1.377 ✓；免费额度「1 million tokens · 自开通/发布/审批之日起 90 天」✓ 与记录 `freeTier(description)` 一致。其余 5 行（deepseek-v4-pro / glm-5.3 / kimi-k3 / minimax-m3 / qwen3.8-max）因抓取截断未核到 | `PARTIALLY_CONFIRMED` |
| 2 | aliyun `ef4d06758403`（off_peak, CNY） | 同上 | 对照页只列 standard 档，**未出现闲时档数字**（`deepseek-v4.1-flash` 1/4） | `UNVERIFIABLE`（原因：可读官方页不含该档） |
| 3 | anthropic `4f8bae91f9f8`（standard, USD） | **跨域重定向**：`docs.anthropic.com/...` → `platform.claude.com` → `www.anthropic.com`（营销首页） | 记录里的 officialUrl **已不再指向定价页**；本轮**未读到** Fable 5.1 / Haiku 4.5 / Opus 5.5 / Sonnet 5.5 的任何价格 | **`SOURCE_MOVED`**（URL 迁移）；价格 `UNVERIFIABLE` |
| 4 | deepseek `e546e8ab4c7d`（off_peak, USD） | 可读 | **逐项一致**：`deepseek-flash` OFF-PEAK 0.15 / 0.6 / 缓存命中 0.003；`deepseek-v4-pro` 0.66 / 1.98 / 0.022 | **`CONFIRMED`** |
| 5 | deepseek `fffbb44ac3a9`（standard, USD） | 可读 | **逐项一致**：PEAK 0.3 / 1.2 / 0.006 与 1.32 / 3.96 / 0.044；`Concurrency Limit` 2500 / 500 ✓；页脚「off-peak = peak 的一半」✓ | **`CONFIRMED`** |
| 6 | google `a110a5bfc3f8`（standard, USD） | **网络层失败**（两次，`TypeError: fetch failed`） | 未读到任何内容 | `UNVERIFIABLE`（原因：本机网络不可达该域） |
| 7 | minimax `796e0c92ecdc`（standard, CNY） | 可读 | **逐项一致**：M2.5 2.1/8.4/0.21/2.625；M2.7 2.1/8.4/0.42/2.625；M2.7-highspeed 4.2/16.8/0.42/2.625；**M3 ≤512k 2.10/8.40/0.42（永久五折后）**；**M3 >512k（long_context）4.20/16.80/0.84**；表头「元/百万 tokens」✓ | **`CONFIRMED`** |
| 8 | openai `206f8b4bde7b`（standard, USD） | **HTTP 403**（Cloudflare 拦截页） | 未读到内容 | `TEMPORARILY_UNAVAILABLE`（原因：站点反爬拦截） |
| 9 | openai `82c3df0bc204`（batch, USD） | 同上 | 同上 | `TEMPORARILY_UNAVAILABLE` |
| 10 | siliconflow `6844d46deb05`（standard, CNY） | 可读 | **5/6 逐项一致**：DeepSeek-V3.2 4/6/0.4 ✓；DeepSeek-V4-Pro 12/24/1 ✓；GLM-5.3 8/28/2 ✓；Kimi-K2.7-Code 6.5/27/1.3 ✓；Qwen3.8-27B 3/12/— ✓；Step-3.5-Flash 行被抓取尾部截断（未见） | **`CONFIRMED`**（1 行待补） |
| 11 | tencent `2981d8f29020`（standard, CNY） | 可读 | **逐项一致**：a13b 0.5/2；embedding 0.7/0.7；role-latest 2.4/9.6；translation-lite 1/3；translation 1.2/3.6；HY Vision 1.5 Instruct 3/9 ✓；`freeTier`「共100万 tokens 共享消耗，资源包有效期 1 年，自开通之日起」✓ 与记录 `period=one_time` 描述一致 | **`CONFIRMED`** |
| 12 | volcengine `a4a9addc49ca`（standard, CNY） | 三个官方 URL 均 200 但正文为空（JS SPA） | 未读到 Doubao 各档价格与 mediaRates | `TEMPORARILY_UNAVAILABLE` |
| 13 | zhipu `646f01c662e6`（standard, CNY） | `open.bigmodel.cn/pricing` 为 SPA 壳；官方 docs「API 定价」页可读但**抓取截断**（未取得价格表） | 未读到 GLM-5.3/GLM-4.6V 等价格行与 freeTier 描述 | `TEMPORARILY_UNAVAILABLE`（价格 `UNVERIFIABLE`） |

**小计**：`CONFIRMED` **4 条**（deepseek×2、minimax、tencent）＋`CONFIRMED`（1 行待补）**1 条**（siliconflow）＋`PARTIALLY_CONFIRMED` **1 条**（aliyun standard）＋`SOURCE_MOVED` **1 条**（anthropic）＋`TEMPORARILY_UNAVAILABLE` **5 条**（openai×2、volcengine、zhipu、aliyun off_peak 归 UNVERIFIABLE）＋`UNVERIFIABLE` **2 条**（google 网络失败、aliyun off_peak）。

### 2.2 与记录一致性的具体核对（只列可引用的逐字对照）

**deepseek**（`api-docs.deepseek.com/quick_start/pricing`，2026-10-03 抓取）
- 官方：`deepseek-flash` CACHE HIT OFF-PEAK `$0.003` / PEAK `$0.006`；CACHE MISS OFF-PEAK `$0.15` / PEAK `$0.3`；OUTPUT OFF-PEAK `$0.6` / PEAK `$1.2`；`deepseek-v4-pro` 对应 `$0.022/$0.044`、`$0.66/$1.32`、`$1.98/$3.96`；`Concurrency Limit 2500 / 500`。
- 记录：off_peak 0.15/0.6/0.003（flash）、0.66/1.98/0.022（pro）；standard 0.3/1.2/0.006、1.32/3.96/0.044；limits 2500/500。⇒ **完全一致**。

**minimax**（`platform.minimax.cn/docs/guides/pricing-paygo`）
- 官方：`MiniMax-M2.7 | 2.1 | 8.4 | 0.42 | 2.625`；`MiniMax-M2.7-highspeed | 4.2 | 16.8 | 0.42 | 2.625`；历史模型 `MiniMax-M2.5 | 2.1 | 8.4 | 0.21 | 2.625`；`MiniMax-M3 ≤512k 永久五折 4.20→2.10 / 16.80→8.40 / 0.84→0.42`；`>512k 永久五折 8.40→4.20 / 33.60→16.80 / 1.68→0.84`；表头「输入价格 元/百万 tokens」「输出价格 元/百万 tokens」「缓存读取 元/百万 tokens」。
- 记录：M2.5 2.1/8.4/0.21/2.625；M2.7 2.1/8.4/0.42/2.625；M2.7-highspeed 4.2/16.8/0.42/2.625；M3 standard 2.1/8.4/0.42；M3 long_context 4.2/16.8/0.84。⇒ **完全一致**（含 long_context 档的口径）。

**tencent**（`cloud.tencent.com/document/product/1729/97731`，页头「最近更新时间：2026-06-26」）
- 官方刊例价（每百万 tokens）：Hunyuan-a13b 输入 0.5 / 输出 2；Hunyuan-role-latest 2.4 / 9.6；Hunyuan-translation 1.2 / 3.6；Hunyuan-translation-lite 1 / 3；Tencent HY Vision 1.5 Instruct 3 / 9；Hunyuan-embedding 0.7 / 0.7。
- 记录：与上逐项相同。免费额度：官方「共100万 tokens，共享消耗。资源包有效期为1年」；记录 `freeTier{type:tokens, amount:1000000, period:one_time}` + 同义描述。⇒ **完全一致**。
- **新增观察（未来漂移提示，非缺陷）**：该页顶部公告「腾讯混元大模型相关功能将逐步迁移至 TokenHub…原平台将不再新增模型能力，并停止支持新购模型服务」⇒ 建议 provenance 侧留意该来源的**即将迁移**。

**siliconflow**（`siliconflow.cn/pricing`）
- 官方：`DeepSeek-V3.2 ¥4.00/¥6.00/¥0.40`；`DeepSeek-V4-Pro ¥12.00/¥24.00/¥1.00`；`GLM-5.3 ¥8.00/¥28.00/¥2.00`；`Kimi-K2.7-Code ¥6.50/¥27.00/¥1.30`；`Qwen3.8-27B ¥3.00/¥12.00/—`。
- 记录：逐项相同。⇒ **一致**（`Step-3.5-Flash` 0.7/2.1 未在抓取窗口内显示）。

**aliyun**（官方英文对照页 `alibabacloud.com/help/en/model-studio/model-pricing`，页头 `Last Updated: Oct 03, 2026`）
- 官方（China (Beijing) 表，USD）：`qwen3-max` 0<Token≤32K `$0.359/$1.434`、32K–128K `$0.574/$2.294`；`qwen-max` `$0.345/$1.377`；免费额度列 `1 million tokens` + 脚注「Valid for 90 days from the date of Model Studio activation, model release, or application approval, whichever is later」。
- 记录（CNY）：`qwen3-max` standard 2.5/10、long_context 4/16；`qwen-max` 2.4/9.6；`freeTier.description` 写「首次开通百炼自动发放新人专属免费额度，有效期为 90 天…」。
- ⇒ 量级与档位一致（USD 换算人民币 ≈7.0 时吻合）；**但 CNY 精确值本轮未在可读官方页上逐字看到**（中文页是 JS 壳）⇒ 记 `PARTIALLY_CONFIRMED`，不写成完全确认。

### 2.3 未覆盖/未确认的部分（如实登记）

- `google`：两次抓取均 `TypeError: fetch failed`（网络层），**不是**官方页面表示任何价格变化。
- `openai`：403 是 CDN 反爬，**不是**官方页面内容。
- `anthropic`：重定向链终点是营销首页；**新定价页的真实 URL 本轮没找到**，因此「价格是否变化」无结论。
- `zhipu` / `volcengine` / `aliyun 中文页` / `hailuoai` / `bigmodel.cn`：均为 JS SPA，本机 `web_fetch` 不执行 JS。

---

### 2.4 逐字段覆盖矩阵（§16 要求的 7 个字段 × 13 条记录）

`✓` = 本轮在**官方页面正文**上逐项核到；`部分` = 只核到一部分；`—` = 本轮读不到官方正文；`n/a` = 该记录此字段为空（无可核对项）。

| 记录 | official source 可读性 | input / output | unit | variant | freeTier | credits |
|---|---|---|---|---|---|---|
| aliyun `ebc4af9a71b6` | 中文页 JS 壳；**英文对照页 ✓** | **部分**（qwen3-max 两档、qwen-max ✓；其余 5 行被截断） | ✓（per 1 million tokens） | ✓（qwen3-max 两档 ↔ 官方 0–32K / 32K–128K） | ✓（100 万 tokens / 开通起 90 天） | n/a（null） |
| aliyun `ef4d06758403` | 同上 | — | ✓（同表） | n/a（单变体） | n/a | n/a（null） |
| anthropic `4f8bae91f9f8` | **✗ URL 已迁移**（→ 营销页） | — | — | n/a | n/a | n/a（null） |
| deepseek `e546e8ab4c7d` | ✓ | **✓ 逐项** | ✓ | n/a | n/a | n/a（null） |
| deepseek `fffbb44ac3a9` | ✓ | **✓ 逐项** | ✓ | n/a | n/a | n/a（null） |
| google `a110a5bfc3f8` | ✗（网络层失败） | — | — | —（4 个 Flash 单变体） | —（记录为非空 `models/standing`） | n/a（null） |
| minimax `796e0c92ecdc` | ✓ | **✓ 逐项** | ✓（元/百万 tokens） | **✓**（`long_context` ↔ 官方「>512k 输入 tokens」档） | n/a | n/a（null） |
| openai `206f8b4bde7b` | ✗（403） | — | — | —（3 模型 × 2 变体） | n/a | n/a（null） |
| openai `82c3df0bc204` | ✗（403） | — | — | —（同上，batch 档） | n/a | n/a（null） |
| siliconflow `6844d46deb05` | ✓ | **5/6 ✓**（Step-3.5-Flash 被截断） | ✓（M Tokens） | n/a | n/a | n/a（null） |
| tencent `2981d8f29020` | ✓ | **✓ 逐项（6 行）** | ✓（每百万 tokens） | n/a | ✓（100 万 tokens / 1 年） | n/a（null） |
| volcengine `a4a9addc49ca` | ✗（三处官方 URL 正文为空） | — | — | n/a | n/a | n/a（null） |
| zhipu `646f01c662e6` | ✗（SPA / 抓取截断） | — | — | —（4 模型 × 2 档） | —（记录为非空 `models/standing`） | n/a（null） |

**关于 `credits`**：13 条记录的 `credits` **全部为 `null`**（含 4 条 `freeTier` 非空者：aliyun / google / tencent / zhipu），本轮**没有**可核对的 credits 事实。顺带登记一条口径观察：这 4 条的 `freeTier.type` 分别是 `tokens`（aliyun、tencent）与 `models`（google、zhipu），**没有一条**把 token 额度写成 credits —— 与 §13.6/§7.3 的口径一致；未来若出现非空 `credits`，应按 §13.6 的口径与 evidence 一并复核。

**关于 `variant`**：本轮**官方侧首次证实**了两处变体语义 —— minimax 的 `long_context` 对应官方「> 512k 输入 tokens」档、aliyun `qwen3-max` 的两个变体对应官方 0–32K 与 32K–128K 两档；其余多变体记录（openai ×2、zhipu）因官方页不可读未能核对。

---

## 3. 交接（hand-off）——本任务**不改**生产数据

> 以下每条都注明「证据强度」，接手的工程师自行决定是否满足改 production 的门槛（Prompt §7.2 / §12 的口径）。

### 3.1 → `provenance-pricing-engineer`

1. **`4f8bae91f9f8`（anthropic）officialUrl 已迁移**（证据强度：**官方重定向**，强）
   - 现象：`https://docs.anthropic.com/en/docs/about-claude/pricing` → 跨域 → `platform.claude.com` → 跨域 → `https://www.anthropic.com`（营销首页，无 API 价格表）；`https://platform.claude.com/docs/en/about-claude/pricing` 同样落到 `www.anthropic.com`。
   - 建议：先找到**可读的官方定价页新址**并读到 4 个模型的价格，再决定是否更新 `officialUrl`；在此之前**不要**改 URL，也不要把本现象当作价格变化的证据。同时注意 §7.2 的 official-domain 校验会把「落到营销页」判为非定价证据。
2. **两条智谱 Deal（`1688614d6669` / `97d21ff73d3e`）需要官方证据复核**（证据强度：**官方文档页可读 + 与记录口径不符**，中）
   - 官方文档 `docs.bigmodel.cn/cn/coding-plan/credit-campaign-rules` 显示：现行邀请权益是**赠金**（受邀首单 5% 立减、邀请人得首单 10% 赠金、满 3 人起发、仅限 GLM Coding 订阅），并声明「**拼好模**」活动**已于 2026-07-09 下线**（该页最新版本生效日期 2026-03-15）。
   - 记录文案是「邀请好友实名注册即赠送 Tokens…最高 **2亿 Tokens** 资源包」与「新用户 **2000万** Tokens」——两者在可读官方页上**都没有对应正文**。
   - 建议按 §12：**不得**据此改 `active/ended` 或生命周期；优先做的是**补官方证据**（找到活动原页/存档）或在记录里如实标注证据强度；若最终确认活动已下线，再走既有规则生成真实事件。
3. **`d6aaee8c7379`（火山方舟 50 张）缺官方引文**（证据强度：**记录内部缺口**，弱）
   - 该条 `discountInfo` 是断言，`evidence` 里没有「50 张」的官方引文；且三个官方 URL 本轮均不可读（JS）。
   - 建议：补引文或把证据强度如实降级标注；**不要**用第三方页面替代官方引文。
4. **`1c057c22422c`（海螺会员 55 元）本轮无法复核**（证据强度：无）
   - 记录自述 2026-09-22 人工核过；本轮 `hailuoai.com/vip` 只能拿到站点壳。
   - 建议：若后续要用浏览器（JS）复核，请用真浏览器路径；在此之前保留原状态。

### 3.2 → `registry-engineer`

- 本轮 §16 的 13 条记录里，**没有**发现与 registry 身份/映射相关的证据（价格行与 `(apiPlanId, modelKey, variant)` 的关系本轮未触及）。**无需动作**。

---

## 4. UNVERIFIABLE / 不可判定的完整清单（含原因）

| 对象 | 分类 | 原因（可复核） |
|---|---|---|
| `97d21ff73d3e`（智谱新用户 2000万） | `UNVERIFIABLE` | 记录 URL 为 JS SPA；未发现可读的官方等价页 |
| `1688614d6669`（智谱邀请好友） | `TEMPORARILY_UNAVAILABLE` | 记录 URL 为 JS SPA；另有可读官方页但描述的是不同权益（见 1.2） |
| `1c057c22422c`（海螺会员） | `TEMPORARILY_UNAVAILABLE` | 站点壳 + 国际站需登录 |
| `d6aaee8c7379`（火山 50 张） | `TEMPORARILY_UNAVAILABLE` | 三个官方 URL 正文均为空 |
| `google a110a5bfc3f8` | `UNVERIFIABLE` | 网络层失败（`fetch failed`）×2 |
| `aliyun ef4d06758403`（闲时档） | `UNVERIFIABLE` | 可读官方页只含 standard 档 |
| `openai 206f8b4bde7b` / `82c3df0bc204` | `TEMPORARILY_UNAVAILABLE` | Cloudflare 403 |
| `volcengine a4a9addc49ca` | `TEMPORARILY_UNAVAILABLE` | JS SPA（三处官方 URL 均空） |
| `zhipu 646f01c662e6` | `TEMPORARILY_UNAVAILABLE` | 定价页 SPA；docs 定价页抓取截断 |
| `anthropic 4f8bae91f9f8` 的价格 | `UNVERIFIABLE` | URL 已迁移，未找到可读的新定价页 |

---

## 5. 对 T03 分类的影响（交给 T21 终版）

- **`P3-29` / `F-online-008` 仍为 `VERIFY`，不得升级**：本轮没有把该 finding 判为已证实或已证伪；新增的官方活动规则页证据只是**候选**（§1.2），且只覆盖 4 条中的 1 条。
- **新增一条候选级观察（不新增 finding）**：`F-online-008` 之外的 `anthropic officialUrl` 迁移（§3.1-1）与 `tencent → TokenHub 迁移公告`（§2.2），建议在 T21 的文档同步里作为**来源新鲜度提示**记录，是否升级为 finding 由 captain 定。
- 审计声明过的边界在本轮后**仍然成立**：`F-online-008` = UNVERIFIED（本轮只做了 4 条中的抽样回访，且其中 3 条因 JS/反爬读不到正文）。

---

## 6. 本轮的可复现证据

- 抓取清单（23 条 URL 与结果）：§0.3。
- 记录侧原始字段（4 条 Deal + 13 条 API 记录的全部相关字段）：`.qc-t04/inputs.md`（脚本 `.qc-t04/extract-inputs.mjs` 从冻结内容只读抽取，未改任何数据）。
- 工作副本：`.qc-t04/`（被 `.qc-*/` 忽略，不入库）；冻结内容基准 = `BASELINE.md`（HEAD `21cf66d5`）。
- 本任务产物仅本文一个文件：`research/quality-closure/source-revalidation.md`。
