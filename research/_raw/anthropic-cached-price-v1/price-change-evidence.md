# anthropic Sonnet 5.5 缓存读取价：取证片段（Tier-1）

复核日：2026-10-08；出口：香港（见各 `.hdr` 快照里的 CF-RAY …-HKG）。
本文件只放**逐字片段**；完整 HTML 原件在 `.arch-v1/raw-dumps-anthropic/`（本机、不入库）。

| 快照 | 字节 | sha256（前 16） | URL | 说明 |
|---|---|---|---|---|
| `news-sonnet55-root.html` | 284459 | `2fe743c8123afbfc` | <https://www.anthropic.com/claude-sonnet-5-5> | 官方发布稿：Introducing Claude Sonnet 5.5（页面自印日期 September 28, 2026） |
| `news-haiku55-root.html` | 221135 | `62b22f5576c46f24` | <https://www.anthropic.com/claude-haiku-5-5> | 官方发布稿：Introducing Claude Haiku 5.5（页面自印日期 October 7, 2026）—— **缓存读取价减半就在这里** |
| `claudecom-pricing-today.html` | 1192779 | `fe4d8c337586f85e` | <https://claude.com/pricing> | 官方出账页（API tab）—— 冲突格的现场 |
| `claudecom-platform-api-today.html` | 1035004 | `c7a735e0f5d06b1d` | <https://claude.com/platform/api> | 官方平台页的同款价格模块（同一出处的第二个入口） |
| `platform_claude_com_llms_txt.body` | 82797 | `624619943c9c366a` | <https://platform.claude.com/llms.txt> | 官方文档索引（**未被区域门拦**，是唯一可达的 docs 入口） |

## ① 官方发布稿（2026-09-28）：Sonnet 5.5 的缓存读取价 **$0.20** —— 记录当时是对的

URL：<https://www.anthropic.com/claude-sonnet-5-5>（HTTP 200）

页面自印日期（逐字）：

```
September 28, 2026
(1)
Introduction
(2)
```

「Cost.」段（逐字）：

```
Sonnet 5.5 is priced the same as Sonnet 5 at $2 per million input tokens, $10 per million output tokens, and $0.20 per million tokens for cache reads, but it typically needs far fewer tokens to do the same work. In our testing, it costs up to 30% less per task than its predecessor.
Speed.
Sonnet 5.5 generates outputs 30%+ faster than Sonnet 5, making it our fastest Sonnet model to date.
Alignment and safety.
On our automated behavioral audit, Sonnet 5.5 improves on or matches Sonnet 5 on most measures of alignment. Because its cybersecurity capabilities are comparable to Opus 5's, it's the first Sonnet model to launch with cyber safeguards and fallbacks like those we've developed for our most capable models. Its biology safeguards are the same as Sonnet 5's. Both safeguards target a narrow set of high-risk requests; routine software development and most life sciences work are unaffected.
Performance
```

价格表（逐字，**空白已折叠为单空格**；表头两列 = Claude Sonnet 5.5 / Claude Opus 5.5）：

```
… on speed is critical. Claude Sonnet 5.5 will allow teams to run their Rovo Agents up to 30% faster than they could with Sonnet 5. I am excited to offer customers this choice.” Company Atlassian Author Jamil Valliani, Head of Product, AI Cost and speed Pricing Price per 1M tokens Claude Sonnet 5.5 Claude Opus 5.5 Cache reads $0.20 $0.20 Cache writes $2.50 $5 Input tokens $2 $4 Output tokens $10 $20 Sonnet 5.5 requires fewer tokens per task than Sonnet 5, so it's less expensive to run. It also generates output 30%+ f …
```

## ② 官方发布稿（2026-10-07）：**把 Sonnet 5.5 的缓存读取价减半** —— 变更记录在这里

URL：<https://www.anthropic.com/claude-haiku-5-5>（HTTP 200）

页面自印日期（逐字）：

```
October 7, 2026
Claude
Haiku 5.5
(1)
```

「减半」原文（逐字，单行上下文）：

```
… is available at a much lower price than Haiku 4.5. On average, it now costs around 75% less to run.² Along with this launch, we're making improvements to the value of our model range. We're halving the price of Claude Sonnet 5.5's cache reads, which means Sonnet 5.5 now runs around 20% cheaper on most agentic work. And we're introducing a new monthly API credit for our Claude Max and Team subscrib …
```

同页价格表（逐字，**空白已折叠为单空格**；表头三列 = Haiku 5.5（≤/>100k）/ Haiku 4.5 / Sonnet 5.5）：

```
…  5.5 as the lead.” Company Cognition Author Walden Yan, Co-Founder & CPO Pricing The table below shows how Claude Haiku 5.5's pricing compares to our other models. Haiku 5.5 is especially good value when used for tasks with prompts up to 100,000 tokens, which make up around 90% of requests to our previous Haiku model. Price per 1 million tokens Haiku 5.5 prompts up to / over 100k Haiku 4.5 Sonnet 5.5 Cache reads $0.01 / $0.05 $0.10 $0.10 Cache writes $0.125 / $0.625 $1.25 $2.50 Input tokens $0.10 / $0.50 $1.00 $2.00 Output tokens $0.50 / $2.50 $5.00 $10.00 Safety Alignment. Claude Haiku 5.5 shows major improvements across almost all …
```

「Further updates」段（逐字，**空白已折叠为单空格**）—— **这是本任务要的官方变更记录**（含旧值与新值）：

```
… rogram . Availability Claude Haiku 5.5 is available now on all platforms, including Amazon Web Services, Google Cloud, and Microsoft Azure. On the Claude Platform, developers can get started with claude-haiku-5-5 . See our migration guide for details. Further updates Alongside our new pricing for Claude Haiku 5.5, we're making further improvements to the value of our models and products. First, starting today, we're lowering the price of cache reads on Claude Sonnet 5.5 . Cache reads now cost 50% less: $0.10 per million tokens rather than $0.20. Because cache reads make up a large share of models' token consumption, this reduces the cost of Sonnet 5.5 on most agentic tasks by around 20%. For instance, here's what the price cut means for Sonnet 5.5's performance relative to cost on Terminal-Bench 4.0: Terminal-Bench 4.0 Accuracy  …
```

## ③ 官方出账页（2026-10-08 重抓）：Sonnet 5.5 缓存读取 = **$0.10**；legacy Sonnet 5 = $0.20

URL：<https://claude.com/pricing>（HTTP 200，API tab）

```
Batch processing
Fable 5.1
Next generation intelligence for long-running agents
Prompt caching
Read
$0.25
/ MTok
Write
$12.50
/ MTok
Input
$10
/ MTok
Output
$50
/ MTok
Opus 5.5
Daily driver for agentic coding and enterprise work
Prompt caching
Read
$0.20
/ MTok
Write
$5
/ MTok
Input
$4
/ MTok
Output
$20
/ MTok
Sonnet 5.5
High-performance model for coding and agents
Prompt caching
Read
$0.10
/ MTok
Write
$2.50
/ MTok
Input
$2
/ MTok
Output
$10
/ MTok
Haiku 5.5
Fastest, most cost-efficient model
Prompt caching
Prompts ≤ 100K tokens
Read
$0.01
/ MTok
Write
$0.125
/ MTok
Prompts > 100K tokens
Read
$0.05
/ MTok
Write
$0.625
/ MTok
Input
Prompts ≤ 100K tokens
$0.10
/ MTok
Prompts > 100K tokens
$0.50
/ MTok
Output
Prompts ≤ 100K tokens
$0.50
/ MTok
Prompts > 100K tokens
$2.50
/ MTok
For workloads that need to run in the US, US-only inference is available at 1.1x pricing for input and output tokens.
Learn more
.
Get up to 2.5x faster speeds with fast mode for Opus 5.5 at 2x standard pricing.
Learn more
.
Prompt caching pricing reflects 5-minute TTL. Learn about
extended prompt caching
.
Explore detailed pricing
(opens in new tab)
Pricing for Claude Platform features
Get more out of Claude with advanced features and capabilities.
Learn more
(opens in new tab)
Managed Agents
Build and deploy agents at scale with a suite of composable APIs. Standard token rates apply.
Cost
$0.08 per session-hour for active runtime
Web search
Give Claude access to the latest information from the web. Doesn't include input and output tokens required to process requests.
Cost
$10 / 1K searches
Code execution
Run Python code in a sandboxed environment for advanced data analysis. 50 free hours of usage daily per organization.
Additional hours
$0.05 per hour per container
Service tiers
Balance availability, performance, and predictable costs based on your needs.
Learn more
(opens in new tab)
Contact sales
Standard
Default tier for both piloting and scaling everyday use cases
Batch
For asynchronous workloads that can be processed together for better efficiency
Legacy models
Learn more
(opens in new tab)
Explore detailed pricing
(opens in new tab)
Haiku 4.5
Prompt caching
Read
$0.10
/ MTok
Write
$1.25
/ MTok
Input
$1
/ MTok
Output
```

（窗口从 API tab 的 `Batch processing` 起 130 行：现行 4 个模型 + `Legacy models` 区的 Haiku 4.5 / Sonnet 5。）

⇒ 这一页就是 t8 记下的那个冲突格的**今日现场**；它**不是**「记录取错行」的证据 ——
   同页 legacy `Sonnet 5` 的 $0.20 是**另一个模型**的价，而 Sonnet 5.5 在 9-28 时**确实**是 $0.20（见 ①）。

## ④ 可达性矩阵（照实记；`区域门` = 307→`claude.com/app-unavailable-in-region`）

| URL | 状态串 | 性质 |
|---|---|---|
| <https://platform.claude.com/llms.txt> | `HTTP/1.1 200` | 可达 |
| <https://platform.claude.com/llms-full.txt> | `HTTP/1.1 307 → HTTP/1.1 301 → HTTP/1.1 200` | 区域门 |
| <https://platform.claude.com/docs/en/about-claude/pricing.md> | `HTTP/1.1 307 → HTTP/1.1 301 → HTTP/1.1 200` | 区域门 |
| <https://platform.claude.com/docs/en/release-notes/overview.md> | `HTTP/1.1 307 → HTTP/1.1 301 → HTTP/1.1 200` | 区域门 |
| <https://anthropic.mintlify.app/docs/en/about-claude/pricing> | `HTTP/1.1 404` | 可达 |
| <https://claude.mintlify.app/docs/en/about-claude/pricing> | `HTTP/1.1 404` | 可达 |
| <https://web.archive.org/cdx/search/cdx?...pricing> | `(无 .hdr)` | 可达 |

另有从本网络**连不上**（不是区域门，是连接失败）：`web.archive.org` / `archive.org`（21s 超时）、
`r.jina.ai`（21s 超时）、`api.codetabs.com` 与 `api.allorigins.win`（522）、`raw.githubusercontent.com`（连接被重置）。

## ⑤ 时间线

| 日期 | 事实 | 出处 |
|---|---|---|
| 2026-09-28 | 官方发布 Claude Sonnet 5.5：cache reads **$0.20**/MTok | <https://www.anthropic.com/claude-sonnet-5-5>（official） |
| 2026-10-01 | 记录采集/核验（`verifiedAt`/`capturedAt`）：Sonnet 5.5 `cachedInput = 0.2`，引文「Hits and refreshes $0.20 / MTok」 | <scripts/data/curated_api_plans.json>（record） |
| 2026-10-07 | 官方发布 Claude Haiku 5.5，同时宣布「We're halving the price of Claude Sonnet 5.5's cache reads」⇒ 同页价格表 Sonnet 5.5 cache reads **$0.10** | <https://www.anthropic.com/claude-haiku-5-5>（official） |
| 2026-10-08 | 出账页现场：claude.com/pricing API tab Sonnet 5.5 Read **$0.10**；legacy Sonnet 5 Read $0.20 | <https://claude.com/pricing>（official） |
| 2026-10-08 | 第三方快讯（仅线索，非官方）标题即「Anthropic 将 Claude Sonnet 5.5 缓存读取价格减半至每百万 token $0.10」 | <https://www.lumevalley.com/article-10846.html>（third-party） |

⇒ 记录在**采集时是对的**；官方在**采集之后**（10-07）把缓存读取价减半。

