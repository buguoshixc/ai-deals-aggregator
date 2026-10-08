# anthropic Sonnet 5.5 缓存读取价：那一格收口（t26）

- 任务：**t26 / anthropic-cached-price-v1**（attempt 1）；复核日 **2026-10-08**
- 工作树：`.worktrees/anthropic-cached-price-v1`（从 `origin/master` `a7712ec` 开出）
- 起因：t8 复核 §A.1 时留下的**一格未定案** —— 候选页 `https://claude.com/pricing`（API tab）与记录在 **Sonnet 5.5 的 `cachedInput`** 上冲突：记录 **0.20** vs 页面 **$0.10**；同页 legacy `Sonnet 5` 恰好 0.20 ⇒ 当时无法区分「记录取错行」与「页面改价」。
- 证据（Tier-1）：`research/_raw/anthropic-cached-price-v1/{price-change-evidence.md, reachability.json, timeline.json}`；原始快照在 `.arch-v1/raw-dumps-anthropic/`（本机、不入库）
- **本任务没有改任何数据**：价格 / 引文 / `capturedAt` / `sourceUrl` / `officialUrl` 全部 0 字节改动

---

## 0. 结论：判定 **② 页面确实改价**（有官方变更记录）

> **官方在 2026-10-07 把 Claude Sonnet 5.5 的缓存读取价从 $0.20 减半到 $0.10/MTok。**
> 逐字原文（官方 Haiku 5.5 发布稿的「Further updates」段）：
>
> “First, **starting today, we're lowering the price of cache reads on Claude Sonnet 5.5. Cache reads now cost 50% less: $0.10 per million tokens rather than $0.20.** Because cache reads make up a large share of models' token consumption, this reduces the cost of Sonnet 5.5 on most agentic tasks by around 20%.”
> —— <https://www.anthropic.com/claude-haiku-5-5>（页面自印日期 **October 7, 2026**）

因此：

- **记录在采集时是对的**：官方 Sonnet 5.5 发布稿（**2026-09-28**）写 “Sonnet 5.5 is priced the same as Sonnet 5 at $2 per million input tokens, $10 per million output tokens, and **$0.20 per million tokens for cache reads**”，与记录的 `cachedInput = 0.2`（引文「Hits and refreshes $0.20 / MTok」，`capturedAt 2026-10-01`）**一致**；
- **记录自 2026-10-07 起过期**（不是「取错行」）；
- **今天出账页的 $0.10 是新价**，与 legacy `Sonnet 5` 的 $0.20 并存 —— 那个 $0.20 属于**另一个模型**，不是 Sonnet 5.5 的行。

---

## 1. 多路径取证（四条尝试，逐条给 URL / 可达性 / 原文片段）

### 路径 A —— 官方发布稿（官方 changelog / release-notes 类材料）★ 定案证据

| 页面 | 可达性 | 关键逐字片段 |
|---|---|---|
| <https://www.anthropic.com/claude-sonnet-5-5>（自印日期 September 28, 2026） | **200** | “Sonnet 5.5 is priced the same as Sonnet 5 at $2 per million input tokens, $10 per million output tokens, and **$0.20 per million tokens for cache reads**”；价格表：`Cache reads $0.20 / $0.20`、`Cache writes $2.50 / $5`、`Input tokens $2 / $4`、`Output tokens $10 / $20`（两列 = Sonnet 5.5 / Opus 5.5） |
| <https://www.anthropic.com/claude-haiku-5-5>（自印日期 **October 7, 2026**） | **200** | ①“We're **halving the price of Claude Sonnet 5.5's cache reads**, which means Sonnet 5.5 now runs around 20% cheaper on most agentic work.” ②“First, **starting today**, we're lowering the price of cache reads on Claude Sonnet 5.5. **Cache reads now cost 50% less: $0.10 per million tokens rather than $0.20.**” ③价格表：`Price per 1 million tokens | Haiku 5.5（≤/>100k）| Haiku 4.5 | Sonnet 5.5` → `Cache reads $0.01 / $0.05 | $0.10 | **$0.10**` |

**独立性**：这是**官方自己的变更公告**，不是定价页的镜像；它同时给出旧值（$0.20）与新值（$0.10）与生效日（“starting today” = 页面日期 2026-10-07）。**这就是判定 ② 要的「可引用的官方变更记录」。**

### 路径 B —— 官方出账页（同一出处的两个入口，作为「今天的现场」）

| 页面 | 可达性 | 冲突格读数 |
|---|---|---|
| <https://claude.com/pricing>（API tab） | **200**（1,192,779 B） | 现行块：`Sonnet 5.5 … Prompt caching Read $0.10 / MTok`；`Legacy models` 块：`Sonnet 5 … Read $0.20 / MTok` |
| <https://claude.com/platform/api> | **200**（1,035,004 B） | 同款价格模块（同一出处的第二个入口） |

**独立性说明**：这是**与路径 A 不同的材料**（出账页 vs 发布稿），但它**不能单独定案** —— 它只说明「今天是什么价」，说不出「为什么与记录不同」。两页对照才把「改价」与「另一个模型的行」区分开。

### 路径 C —— 官方文档的另一个路径 / 版本化 URL（**被区域门拦，如实记**）

| 目标 | 可达性 | 事实 |
|---|---|---|
| <https://platform.claude.com/llms.txt> | **200**（82,797 B，`text/plain`） | 官方文档索引**可达**，它逐字列出 `[Pricing](https://platform.claude.com/docs/en/about-claude/pricing.md)` 与 `[Overview](https://platform.claude.com/docs/en/release-notes/overview.md)` |
| <https://platform.claude.com/docs/en/about-claude/pricing.md> | **307 → 区域门** | `location: https://www.anthropic.com/app-unavailable-in-region?utm_source=country` → 301 → `claude.com/app-unavailable-in-region`（200，说明页） |
| <https://platform.claude.com/docs/en/release-notes/overview.md> | **307 → 区域门** | 同上（官方 release notes 也读不到） |
| <https://platform.claude.com/docs/en/models/sonnet-5-5/overview.md> | **307 → 区域门** | 同上 |
| <https://platform.claude.com/llms-full.txt> | **307 → 区域门** | 同上（索引可达、全文不可达） |

⇒ **官方 docs 的定价表本身，从本网络（香港出口）今天仍然读不到。** 这一条**没有被算成证据**，也没有被算成「一致」。

### 路径 D —— 不同出口 / 镜像（**全部失败，如实记**）

| 尝试 | 结果 |
|---|---|
| `https://web.archive.org/cdx/…`、`https://archive.org/wayback/available?…` | **连不上**（443 连接 21s 超时）⇒ 拿不到历史快照（本来是「记录取错行 vs 改价」最直接的时间维度证据） |
| `https://r.jina.ai/https://platform.claude.com/docs/en/about-claude/pricing` | **连不上**（443 超时） |
| `https://api.codetabs.com/v1/proxy?quest=…`、`https://api.allorigins.win/raw?url=…` | **522**（代理侧连不上源站） |
| `https://anthropic.mintlify.app/docs/en/about-claude/pricing`、`https://claude.mintlify.app/…` | **404**（这两个 Mintlify 子域存在，但没有该路径） |
| `https://raw.githubusercontent.com/…/okf-bundles/…/pricing.md`（第三方价格快照） | **连接被重置** |
| 第三方快讯 <https://www.lumevalley.com/article-10846.html>（2026-10-08） | **200** —— 标题即「Anthropic 将 Claude Sonnet 5.5 缓存读取价格减半至每百万 token $0.10」，正文与官方口径一致；**只作为线索**（第三方，非官方，不计入证据链定案） |

---

## 2. 判定依据（时间线）

| 日期 | 事实 | 出处 |
|---|---|---|
| 2026-09-28 | 官方发布 Sonnet 5.5：cache reads **$0.20**/MTok（“priced the same as Sonnet 5”） | <https://www.anthropic.com/claude-sonnet-5-5> |
| 2026-10-01 | 记录采集/核验（`verifiedAt`/`capturedAt`）：`cachedInput = 0.2`，引文「Hits and refreshes $0.20 / MTok」 | `scripts/data/curated_api_plans.json` |
| **2026-10-07** | 官方发布 Haiku 5.5 并宣布「**starting today**… lowering the price of cache reads on Claude Sonnet 5.5… **$0.10 … rather than $0.20**」 | <https://www.anthropic.com/claude-haiku-5-5> |
| 2026-10-08 | 出账页现场：Sonnet 5.5 `Read $0.10`；legacy `Sonnet 5` `Read $0.20` | <https://claude.com/pricing> |

**为什么不是判定 ①（记录取错行）**：官方 9-28 发布稿自己就写 $0.20，且记录引文的 `capturedAt`（2026-10-01）落在「$0.20 生效」与「$0.10 生效」之间 ⇒ 记录当时**是对的**。同页 legacy `Sonnet 5` 的 $0.20 是**另一个模型**至今未变的价格，与 Sonnet 5.5 的历史价**数值相同纯属巧合**（9-28 发布稿正是因为「5.5 与 5 同价」才这么写）。

**为什么也不写成「同意 t8 的不确定性」**：t8 缺的是「官方变更记录」，本轮**找到了**（路径 A ②，含旧值、新值、生效日）。

---

## 3. 不改数据 + 边界提醒（判定 ② 的处置）

**本任务没有改任何数据**。按任务书，判定 ② 要给边界提醒 —— 若要把记录对齐到今天，会牵动的不止一格：

1. **受影响的字段**：`scripts/data/curated_api_plans.json` → anthropic 计划 → `Claude Sonnet 5.5`（`modelKey: claude-sonnet-5.5`）的 `rates.cachedInput`：**0.2 → 0.1**（依据：路径 A ② 的逐字原文）。
2. **改的不只是价格**：要做到「改完仍可核验」，还得有一条**新引文**（`field: models.claude-sonnet-5.5` 或维度绑定）指向**官方变更记录**（`sourceUrl = https://www.anthropic.com/claude-haiku-5-5`，`capturedAt = 2026-10-08`），而现有那条引文（$0.20、`sourceUrl = docs.anthropic.com/…pricing`、`capturedAt 2026-10-01`）**要么保留为「当时的价」、要么替换** —— 这属于**引文层的决定**，本任务的边界明令不许动引文。
3. **会推进一条公开变化事件**：这个仓库的价格类字段受变化日志跟踪（t8 实测过：连 `officialUrl` 这一类字段的改动都会追加事件并进 `/changes/` 与订阅源）。⇒ **需要 captain 裁定**（少数情形：这会是「价格已变化」的一次真实落地）。本任务**未实测**这一次会追加几条事件（没改数据，所以没有读数）。
4. **来源面提醒（不在本任务边界内，仅登记）**：记录的依据页（`docs.anthropic.com/…pricing` → `platform.claude.com/docs/…pricing`）**今天仍被区域门拦**；若将来要补引文，路径 A 的两个官方发布稿与出账页是**今天可复核**的出处。

---

## 4. 方法论（写进报告，供后续复用）

1. **区域门是「按路径」生效的**：`platform.claude.com/**/docs/**`（含 `.md` 变体与 `llms-full.txt`）307 到 `app-unavailable-in-region`，而 **`/llms.txt` 200**。
   ⇒ **「换一个文档路径 / 加 `.md`」不算独立取证路径** —— 它换的是 URL 字符串，不是出口或材料来源。要独立，必须换**出口/镜像**，或者换**另一份官方材料**（发布稿、公告、出账页）。
2. **「索引可达 ≠ 内容可达」**：`llms.txt` 能告诉我官方定价页的**地址**，但读不到它的**内容**；把「索引可达」写成「官方文档可达」是这类审计里最容易出现的过头话。
3. **同页两行的数值巧合会伪造「取错行」假象**：判断「记录是否取错行」不能只看「同页有没有一个同值的行」，要看**时间维度**（发布稿日期 vs `capturedAt`）。本轮正是靠 9-28 发布稿把「取错行」排除掉。
4. **relay/代理不可达要照实写**：`archive.org` / `jina` / 两个 CORS 代理 / Mintlify 子域 / raw.githubusercontent 全部失败 —— 这些是**取证缺口**，不是「没有变化」。

---

## 5. 我没证明的东西

1. **官方 docs 定价页的表格**本身（`platform.claude.com/docs/en/about-claude/pricing`）今天仍读不到（区域门）⇒ 我**没有**逐字看到「docs 表里 Sonnet 5.5 那一行现在写 $0.10」；我证明的是「官方在 10-07 把 Sonnet 5.5 的 cache reads 减半到 $0.10」这件**事实**（发布稿自证 + 出账页一致）。
2. **没有历史快照**（archive.org 连不上）⇒ 无法用第三方存档交叉验证 `claude.com/pricing` 在 10-01 时确实显示 $0.20（只有官方 9-28 发布稿与记录引文的间接一致）。
3. **变更的精确生效时刻**：官方写「starting today」（页面日期 10-07）；我没有秒级时间（也没有 API 计费账单可查——那需要账号）。
4. **缓存写入（5m/1h）与命中价的联动**：发布稿只说 cache **reads** 减半；`cacheWrite`（$2.50）与 `cacheWriteLong`（$4）在官方材料里**没有提到变化**，今天出账页也不载 1h 档（只有 “Prompt caching pricing reflects 5-minute TTL” 一句）⇒ 我**不能说**写入侧也跟着变。
5. **其它模型的缓存价是否同批调整**（Opus 5.5 / Fable 5.1 / Haiku 4.5）：发布稿只讲 Sonnet 5.5 的 cache reads；我**没有**逐模型复核 ⇒ 不做这类结论。
6. **本次若不改数据会不会有下游影响**：我没有跑任何仓库门禁（本任务只读 + 写 research/），也没有推算「记录与今日页面不一致」是否会被某条判据报红 —— 那是下一轮若要动数据时才需要回答的问题。

---

## 6. 给 captain 的建议行（供 `NEXT-STEPS.md` §A.1 收口，**原文**；本任务未动那份文件）

```
   2026-10-08 收口（t26）：那一格**已定案** —— 判定「页面确实改价」，依据是官方变更记录：
   官方 Haiku 5.5 发布稿（2026-10-07）逐字写「starting today, we're lowering the price of cache reads on
   Claude Sonnet 5.5. Cache reads now cost 50% less: $0.10 per million tokens rather than $0.20.」
   （https://www.anthropic.com/claude-haiku-5-5）；同页价格表 Sonnet 5.5 一列 Cache reads = $0.10；
   而官方 Sonnet 5.5 发布稿（2026-09-28）写 cache reads = $0.20（https://www.anthropic.com/claude-sonnet-5-5）
   ⇒ 记录的 0.20 在采集日（2026-10-01）**是对的**，自 10-07 起过期；**不是取错行**（同页 legacy Sonnet 5 的
   $0.20 是另一个模型至今未变的价格，数值相同是巧合）。
   处置：**本轮仍不改数据**（改它要同时决定引文层与会推进一条公开变化事件，需 captain 裁定）；
   来源面事实不变：官方 docs 定价页从本网络仍被区域门拦（`/docs/**` 307，`/llms.txt` 例外）。
```

## 7. 本任务改了什么

- 新增 `research/anthropic-cached-price-v1-report.md`（本文件）、`research/anthropic-cached-price-v1-self-audit.md`；
- 新增 `research/_raw/anthropic-cached-price-v1/{price-change-evidence.md, reachability.json, timeline.json, build-evidence.js}`；
- **没改任何数据**（`git status` 里 `scripts/**` 为空；价格 / 引文 / `capturedAt` / `sourceUrl` / `officialUrl` 0 字节改动）。
