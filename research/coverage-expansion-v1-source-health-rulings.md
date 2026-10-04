# coverage-expansion-v1 · Source Health 裁决与 collector 扩张纪律（t13）

- 任务：t13 [source-health] — 检查全部 collector 的真实 health 与长期失败来源，逐条裁决 repair / headless migration / keep-degraded / retire；如实记录且「source failure ≠ 历史 Deals ended」；新增 discovery source 必须证明「真实有产出 / 质量足够 / 不重复 / 健康可观测」，否则不上线。
- worktree：`.worktrees/coverage-expansion-v1`（分支 `coverage-expansion-v1`，基线 `a4dd40f`）。
- 取证时间：**2026-10-04**（Asia/Shanghai）。全部结论来自本轮 live 抓取与本轮真跑的 `scripts/collect.js`，**没有一条沿用旧报告的数字**。
- 取证脚本（可复跑，只发公开 GET、不写生产文件）：
  - `research/_raw/coverage-expansion-v1/probe-futurepedia.cjs`（403 归因：同 URL 只改请求头）
  - `research/_raw/coverage-expansion-v1/probe-discovery-candidates.cjs`（候选来源可达性 / 条目数 / 已知厂商重合）
  - `research/_raw/coverage-expansion-v1/probe-discovery-words.cjs`（逐词命中，含剥离脚本前的原始噪声对照）
  - `research/_raw/coverage-expansion-v1/probe-discovery-denoised.cjs`（剥掉 script/style 后的复核 + free-for.dev 源文 README 分类统计）

## 1. 口径先对账：任务书里的数字与盘上事实不一致，以盘上事实为准

| 项 | 任务书/baseline 的说法 | 本轮实测（盘上 + live） |
| --- | --- | --- |
| collector 数 | `baseline.json`：`registeredInCode: 7` | **9**（7 静态 + 2 无头：`cn_zhipu_pricing`、`cn_volc_ark`）。7 是「默认链路」的数目；`--headless` 才是全集 |
| source-health 行数 | `baseline.json`：`sourceHealthRows: 9` | **9**（一致） |
| futurepedia 连续失败 | 任务书写「HTTP 403 × 8」 | **9**（抓取前盘上文件值：`consecutiveFailures: 9`，`lastSuccessAt 2026-09-30T01:36:21.446Z`）。8 是更早快照的数字 |
| futurepedia 当前状态 | baseline：`statusCensus { healthy: 8, failed: 1 }` | 抓取前盘上= `failed`；**本轮 live 真跑成功**（见 §2），盘上现为 `healthy`，9/9 来源全部 `healthy` |

> 纪律：不把「旧报告的 8」或「本轮的 9」写进任何生产数据；本轮只在 `source-health.json` 的本轮观测值里如实记录（那是健康层的真值：它记的就是「上次跑的时候怎样」）。

## 2. futurepedia HTTP 403：裁决 `keep-degraded`（不是 repair、不是 headless migration、不是 retire）

### 2.1 归因实验（同 URL、同机器、只改请求头）

| 变量 | 结果 |
| --- | --- |
| A 现状（`http.js` 默认 UA + `Accept-Language` + `Referer`） | **HTTP 200**，1,482,138 字节，`<title>Find The Best AI Tools & Software, Futurepedia.io` |
| B 满浏览器头（`sec-ch-ua` / `sec-fetch-*` / `br` / `Cache-Control`） | **HTTP 200**，字节数与 A 完全相同（1,482,138） |
| C 完全不发 UA（对照：是否 UA 驱动） | **HTTP 200**，1,481,573 字节 |
| D `robots.txt` | HTTP 200；`User-Agent: *` + `Allow: /`，仅禁 `?search=`/`?sort=` 等参数化 URL 与 `/profile`（本采集器请求首页与 `/tool/` 详情页，**不在禁区**） |

结论：**403 不是「UA/请求头不完备」造成的** —— 三个变体都 200，连不发 UA 都 200。因此
「修请求头」这条 `repair` 路径在事实层面不成立：没有可修的差异。

### 2.2 采集器真跑（用生产代码路径，不走任何替身）

```
node -e "require('scripts/collectors/global_directories').find(c=>c.id==='futurepedia').collect()"
→ 产出 7 条 · 耗时 6052ms · 7 个不同 url
   · ChatGPT            | discount="Freemium, $8/mo"
   · Claude             | discount="Freemium, $17/mo"
   · HubSpot AEO Sensor | discount="Free"
```

`npm run collect:headless` 全量真跑：**9 个来源 · 产出 114 条 · 失败 0 个**，其中 futurepedia
`上次 7 / 本次 7 / 增减 0`，健康层把它从 `failed` 改判 `healthy`、`consecutiveFailures` 归零、
`lastSuccessAt` 推进到 `2026-10-04T10:34:24.731Z`。

### 2.3 裁决与理由

- **裁决：`keep-degraded`**（保留来源、保留代码、不去修头、不迁移无头、不退役）。
- 理由 1（现状无故障可修）：本环境静态抓取 200 且产出 7 条，证据见 §2.1/§2.2。
- 理由 2（已知失败是**环境归因**）：唯一-shape 的对照实验证明请求头不是变量 ⇒ 剩下的差异只有出口网络（IP/机房/地域）。这与 baseline 记录的「CI 上 403 × 8/9」一致，而不是代码缺陷。**这一条必须记成「我们这一侧的观测限制」，不能记成「来源坏了」。**
- 理由 3（失败不伤数据）：它只占 7/114 条（≈6%），且缺失的后果由健康层与历史层的纪律兜住（§3）。
- 理由 4（不选 `headless migration`）：headless 的成本与风险更高（本机内核依赖、CI 需装内核、单源 6~22s），而**静态路径本身没有失败**；为一个环境归因的 403 引入无头，会把「来源可用」变成「依赖 runner 能装内核」——那是把可控问题换成不可控问题。当且仅当静态路径在**本环境**也 403 时，才升级为 headless 方案（见 §5 复查条件）。
- 理由 5（不选 `retire`）：退役依据必须是「官方页面已下线 / 长期零产出且无信号」，而它现在 200、有产出、且有价格档位文本（`Freemium, $8/mo`）。**单轮采集失败不构成下线证据**（题面红线第 11 条）。

### 2.4 CI 侧的可执行建议（给出判据，不擅自改 CI）

若 CI 上仍是 403，正确的处置顺序是：

1. 先加一条**归因日志**：在 `getText` 失败时把出口 IP 与状态码一起打进 `lastError`（现在的 `lastError` 只有 `HTTP 403`，无法区分「IP 被拒」与「页面改版」）。
2. 再评估 `keep-degraded` 是否够：当前它已经够了 —— 失败源不参与「未见」计数（§3），数据零损失。
3. 只有「CI 长期 403 **且**该来源的产出不可替代」时，才讨论把该源迁到 headless 或换成可直连的替代来源。

## 3. 「source failure ≠ 历史 Deals ended」——用代码判据 + 本轮真跑双重确认

判据在 `scripts/collect.js` 的 `recordHistory()`（第 158-160 行），只有同时满足三条的来源才被允许参与「未见」计数：

```js
const absenceEligibleSources = rows
  .filter(row => row && row.status === 'healthy' && !row.stale && Number(row.lastItemCount) > 0)
  .map(row => row.source);
```

即：**本轮心跳 `healthy` + 不是上一轮遗留（stale）+ 确实跑出了条目**。而 `scripts/lib/history.js`
第 445 行是硬闸门：`if (!eligibleSource) continue;  // 来源本轮不可信 → 不推进、不清除` ——
失败源的条目连 `misses` 计数都不加，更不可能记 `ended`；`MISS_CONFIRM_RUNS = 2` 还要求
「连续两次**成功**采集都未见」才写 `ended(reason=source_no_longer_lists)`。

本轮真跑（含 futurepedia 从 failed 转 healthy 的那一次）实测：

```
历史层: 新增事件 0 条（created 0 · updated 0 · benefit_changed 0 · eligibility_changed 0 · expiry_changed 0 · ended 0 · restored 0）
       · 观测态 0 条 · 可判定「未见」的来源 9 个
```

并且 `git diff --stat scripts/data/deal-history.json` = **空**（历史日志一个字节没动）。
对照：抓取前 futurepedia 是 `failed`、其 7 条 history 仍是已收录条目 —— 失败期间没有任何
「批量 ended」。**这就是「来源故障不被写成资料结束」的可复跑证据。**

## 4. 九个 collector 的逐条裁决

| # | source | kind | 区域 | 本轮实测产出 | 本轮健康 | 裁决 | 理由（判据来自盘上/本轮实测） |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `cn_qianfan`（百度千帆） | static | cn | 17 | healthy | **keep** | 200 且 17 条，含逐模型「新用户免费额度 + 100万 Tokens + 有效期 3 个月」原文口径；有探针声明（`table/tr/td` + `赠送` 正则）可观测 |
| 2 | `cn_aliyun`（阿里云百炼） | static | cn | 1 | healthy | **keep**（产出偏低，留观察） | 200 但只 1 条 —— 静态抓取只拿到价格页标题体（本轮 t10 取证同样只拿到标题体 + 截断正文）。**不新增修复动作**：它是「产出少」不是「抓不到」，且它的价值主要在 API 定价侧（由 curated/api-plans 路径覆盖）。若连续 3 次 `zero_output` 才升级为 degraded→failed（健康层规则） |
| 3 | `cn_zhipu`（智谱AI） | static | cn | 7 | healthy | **keep** | 200 且 7 条；探针指向 `docs.bigmodel.cn` 文档页（与采集器实际抓的页面不同源亦不冲突：探针只用于结构摘要比对） |
| 4 | `layer3labs` | static | global | 13 | healthy | **keep** | 200 且 13 条；有 `deal-table-header` 正则探针，是「表格型优惠清单」里可观测性最好的来源 |
| 5 | `aitools` | static | global | 15 | healthy | **keep** | 200 且 15 条，走 `__NEXT_DATA__` 内嵌 JSON（不依赖渲染） |
| 6 | `futurepedia` | static | global | 7 | **failed → healthy** | **keep-degraded** | 见 §2。环境归因的 403；本环境 200 + 7 条；不修头、不迁无头、不退役 |
| 7 | `futuretools` | static | global | 38 | healthy | **keep**（信号弱，已在注册表注释里如实标注） | 200 且 38 条（本轮 11.0s）；但它是**目录型**来源：38 条里 `discount` 全为空串，剥脚本后优惠词**零命中**，注册表注释已写「真实优惠信号弱」。裁决据此不升级为「核心来源」 |
| 8 | `cn_zhipu_pricing`（智谱AI活动页） | **headless** | cn | 4 | healthy | **keep** | 渲染后 4 条，来自官方活动页逐字规则（新用户 100 万 Tokens / 邀好友 / GLM-5.3-Flash 限时五折 / Batch 五折 / 缓存免费）；本轮耗时 **7.1s**（盘上记录 22.6s，属正常波动）。`playwright-core` 本轮可用（`无头浏览器 可用`） |
| 9 | `cn_volc_ark`（火山方舟） | **headless** | cn | 12 | healthy | **keep** | 渲染后 12 条，来自官方「免费额度」表 + 两条活动原文；`warnZeroProduction()` 在零产出时打印标题/DOM 长度/等待项/控制台错误，可观测性完整 |

**没有一条裁决是 `retire`**：退役需要「官方页下线或长期零产出且无信号」的证据，本轮 9/9 都有产出。
**没有一条裁决是 `repair`**：没有一条来源存在「本环境可复现的抓取缺陷」——唯一失败的 futurepedia
已被对照实验证明与请求头无关（§2.1）。
**没有一条裁决是 `headless migration`**：两条本来就是 headless 且都健康；futurepedia 的静态路径
在本环境成功，迁移只会引入 runner 内核依赖（§2.3 理由 4）。

### 4.1 健康可观测性（新增来源的准入前提之一）本轮复核

- 每源都有 `source-probes.json` 探针声明（9 个源 ↔ 9 条探针，一一对应，`selftest:ai` 会报红对不上）；
- 每源产出结构摘要进 `source-snapshots.json`（本轮 9/9 有摘要，共 54 份，**不含页面正文**）；
- 无头来源额外带 `headlessReady` 与零产出诊断（页面标题 / DOM 文本长度 / 命中等待文案 / 控制台错误 / 失败请求）；
- 三态判据（`health.js`）：采集器抛错 → `failed` 且 `consecutiveFailures+1`；成功但条数 < 上次×0.5 → `degraded(sharp_drop)`；成功但零产出 → `degraded(zero_output)`，连续 3 次 → `failed`；从未产出过 → `degraded(zero_output_baseline)`（**规则匹配不到 ≠ 服务坏了**，这条区分是本轮特别复核的）。
- 自测：`npm run selftest:health` → **72 项通过，0 项失败**。

## 5. 新增 discovery source：本轮**不新增**，并给出可复核的证据与复查条件

任务给的准入四条是「真实有产出 / 质量足够 / 不重复 / 健康可观测」。本轮对四个候选逐条取证
（剥离 `script`/`style` 后再数，避免把 JS 噪声当成优惠信号）：

| 候选 | 可达性 | 真实有产出 | 质量（剥脚本后优惠信号） | 与站内已有厂商重合 | 结论 |
| --- | --- | --- | --- | --- | --- |
| `theresanaiforthat.com` | 200（6,198,558B） | 条目型链接 24 个（原始计数） | **free trial 14 · deal 4**（原始计数 407 里 387 是脚本/CSS 的 `deal` 噪声） | 20/88 已知厂商 | **不采纳（本轮）**：有信号但**未验证它给的是「可领取的优惠」还是「工具的定价档」**，且它是聚合导航站，按本任务的准入要求需要逐条人工核验后才可上线 |
| `toolify.ai` | 200（636KB） | 条目型链接 169 | **优惠词仅 `deal=1`**（零 `free tier/plan/trial`） | 13/88 | **不采纳**：它是工具目录，不列优惠；且既有 benchmark 研究已记录其可比度不合格（median 3.55 < 4.5，`belowRequirement 204/387`） |
| `ai-bot.cn` | 200（710KB） | 条目型链接 1 | `新用户=3`（无「免费额度/试用/限时」） | 19/88 | **不采纳**：静态页只有侧栏骨架（正文 211KB 里条目链接 1 个），需要渲染才可能取到条目，而信号词不足以支撑「优惠来源」定位 |
| `free-for.dev` | 静态 200（3,556B，空壳）；源文 README 200（261,291B） | README 列表项 **1,410 条**、章节 57 个 | `free tier=168 · free plan=224 · free trial=3 · discount=2`（**质量最高的一个**） | 18/88 | **不采纳（本轮）**：与本站主题不符 —— README 里 **AI 相关列表项仅 100 条（7.1%）**，其余是数据库/CI/CD/托管等开发者基础设施免费额度；整源接入会带来约 1,300 条与「AI 优惠/套餐/API 计费」无关的条目 |

**结论：本轮不上线任何新 discovery source。** 理由不是「没时间测」，而是四条准入里至少有一条不成立
（toolify/ai-bot.cn：信号不足；free-for.dev：不重复这条过不了主题关；theresanaiforthat：需要逐条
人工核验「是不是优惠」才能满足「质量足够」）。按题面 §10 的规则——**检查 N 家 → 官方能验证 M 家
→ 只发布 M 家**——本轮 M=0，未采信的 4 家在此逐条留档（不污染生产数据）。

### 5.1 复查条件（写下"什么条件下重新考虑"，避免下一轮重新从零开始）

- `theresanaiforthat`：能拿到**至少 3 条**逐条可核验的「优惠原文 + 官方域」样例（例如它自己标注的
  限免/折扣活动页），且这些样例不与我们已有的 88 个 vendor 条目重复 ⇒ 重新评估；
- `free-for.dev`：若把范围收窄为「只取 AI 相关章节」（README 章节 57 个里挑出包含 `AI/LLM/GPT` 的那些，
  约 100 条），则它满足主题关 ⇒ 可作为**受限来源**重新评估（需要新的采集器规则 + 探针声明）；
- `toolify.ai` / `ai-bot.cn`：只有出现「官方优惠口径」的版块（例如专门的 deals/discount 栏目）才重新评估。

## 6. 本轮对生产文件的副作用（必须报备）

- `scripts/data/source-health.json`：**按任务要求更新**为本轮真实观测（9/9 healthy、futurepedia
  `consecutiveFailures` 归零、`lastSuccessAt` 推进）。这是健康层的真值文件，不更新就无法「如实记录」。
- `scripts/data/source-snapshots.json`：新增本轮 9 个来源的结构摘要（既有机制，自动）。
- `scripts/data/zh-pending.json`：本轮采集新增 1 条待译字段（既有机制，自动）。
- `deals.json`：`updatedAt` 与 79 处 `lastSeen` 刷新为 `2026-10-04`（**没有条目被增删或改写**：
  合并结果 `新采 114 + 既有 135 + 策展 32 → 去重 146 → 修剪前 135 → 最终 135`，修剪明细全 0，
  历史事件 0 条）。这是真跑一次采集的固有副作用。
- `scripts/data/deal-history.json`：**零改动**（这正是 §3 要证明的事）。

## 7. 与下游的关系

- t15（数据质量独立审查）可以按本文件的 §4 逐条复核「裁决是否有实测支撑」，并按 §2.1 复跑归因实验；
- t17（变异电池）可用本文件的 §3 造一条牙：「把 `absenceEligibleSources` 的过滤条件删掉 ⇒ 一次失败源的运行必须产生批量 `ended` ⇒ 必须变红」；
- t18（Full Gate）会真跑 `selftest:health`（72 项）与 `check:reproducible`；本文件不改任何生产 schema，
  不新增 collector，因此不影响那两道门禁的判据。
