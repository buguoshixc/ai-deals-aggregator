# coverage-depth-v1 · Workstream C-1：来源实况普查 + Futurepedia 裁决取证 + overlap/独有价值分析（t4）

- 任务：t4（`work`）—— 只读取证。落地动作在 T05（采集器侧）与 T06（裁决数据），本文件**不落地任何裁决、不改任何生产文件**。
- worktree：`.worktrees/coverage-depth-v1`（分支 `coverage-depth-v1`，基线 `ff86368e6d12d1ef57b2f51aa2c957c01d2a9ed8`）。
- 取证时间窗（本机，Asia/Shanghai）：**2026-10-05 11:28 → 11:45**；对应的 UTC 读数见每节的时间戳。
- 取证脚本（可复跑，全部只发公开 GET、全部只写本目录）：`research/_raw/coverage-depth-v1/source-reliability/probe-*.cjs`。
- 「不猜日期、不造数据、不建第二套真相」：健康陈述**一律带 `generatedAt`**；CI 侧数字全部由 `git show <sha>:scripts/data/source-health.json` 重建，**不新建健康文件**；本任务**从未**运行不带 `--dry-run` 的采集。

## 0. 结论摘要（先读这一节）

1. **9 个来源里唯一非 healthy 的是 `futurepedia`**，且该判定只出现在 **CI 侧读数**里：盘上 `scripts/data/source-health.json` 的 `generatedAt = 2026-10-04T16:31:52.051Z`，普查 `healthy 8 / degraded 0 / failed 1`，`futurepedia.consecutiveFailures = 10`、`lastSuccessAt = 2026-09-30T01:36:21.446Z`、`lastError = "https://www.futurepedia.io/ 抓取失败: HTTP 403"`。
2. **本机同一时间窗内 9/9 全部成功**：`2026-10-05T03:32:32.801Z → 2026-10-05T03:33:46.167Z` 全量实况普查，9 个来源产出条数与 CI 侧 `lastItemCount` **逐个相同**，`futurepedia` 本机 7 条 / 4.5s。**这不构成「已恢复」**：同一时间窗 CI 侧读数仍是 failed。
3. **403 不可在本机复现，且不是请求头/UA 造成的**：5 个变体（采集器现状头 / 完全不发 UA / 满浏览器头 / Googlebot UA / 生产 `http.getText`）**全部 HTTP 200**，字节数 1,478,093–1,482,136；无重定向；`robots.txt` 是 `Allow: /`。本机与 CI 之间**唯一无法在本机复现的变量是出口网络**（本机 zone trace：`loc=CN`、`colo=SEA`、IPv6 `2409:895a:…`；CI 是 GitHub Actions 出口）。**结论写作 `observed unstable`（跨环境观测不一致），不写 fixed / repaired / 已恢复。**
4. **时间敏感反证已做满 3+3+3 轮**：3 轮结构化普查 + 3 轮生产 dry-run + 3 轮无头渲染，**本机 9/9 全成功**（每轮时间戳见 §4）；CI 侧同期连续失败 10 次。两侧读数分开记录，不合并成一个状态。
5. **Futurepedia 重新裁决建议：`keep-degraded`**（保留注册、**不做**盲目 repair、**暂不** headless-migrate、**不** retire），五项数字：`historical items = 3` / `unique items = 3 of 7` / `overlap items = 4 of 7`（生产 `dedup()` 实测也正好合并 4 条）/ `recent unique candidates = 0` / `maintenance cost = 55 行代码 · 8 次 HTTP/轮 · 2.93 MB/轮 · CI 侧 10/10 失败`。理由与反方（retire 的诚实一面）见 §7。
6. 其余 8 个来源在**两套读数里** `consecutiveFailures` 都是 0，不需要裁决；本文件仍把它们逐条登记在 §2 的普查表里。

---

## 1. 读数口径：两套时间戳必须分开看

| 读数 | 取值 | 来源 | 说明 |
| --- | --- | --- | --- |
| **CI 侧 live（唯一真相源）** | `generatedAt = 2026-10-04T16:31:52.051Z` | `scripts/data/source-health.json`（sha256 `F782626E2B0E9B31236393507FE00121E90FAF55DB92FBD71FA52002885ABF80`） | 由 CI 采集写入并随 `chore(data)` 提交入库；**本任务全程没有改过这个文件** |
| **本机 live（本轮实跑）** | run `2026-10-05T03:32:32.801Z → 2026-10-05T03:33:46.167Z` | `research/_raw/…/census-full1.json` | 用生产代码路径跑全部 9 个来源；`--dry-run` 语义（**不写盘**） |
| 本机推演「若本轮写盘」 | `wouldBeHealth.generatedAt = 2026-10-05T03:33:46.166Z`，普查 `9 healthy` | 同上（内存推演，`health.build()` 返回值） | **不是盘上真值**，只是「这会写入会得到什么」的推演；盘上仍是上面那行 CI 读数 |

> 为什么两套都要：`source-health.json` 的语义是「**上一次跑的时候怎样**」（CI 12 小时一次），
> 而本任务是「**现在这一刻怎样**」。把两者混成一个数字，就会得出「futurepedia 已恢复」这种
> 会在下一轮 CI 读到来时被打脸的结论。**本文件所有 health 陈述都带 `generatedAt`。**

一条必须写清的口径细节：`--only=<id>` 的 dry-run 打印的健康表是**含 stale 行**的 ——
`lib/health.js` 的 `build()` 会把本轮没跑到的来源原样保留并标 `stale:true / lastRunMissing:true`，
于是 `node scripts/collect.js --dry-run --only=futurepedia` 的表尾会打印「9 个来源 · 正常 9」，
那是 **1 个本轮真跑的 + 8 个上一轮遗留**，不是 9 个本轮都跑了。§4 的逐轮读数按真实语义解释。

## 2. 九个来源实况普查（逐 source：healthy / degraded / failed / zero + consecutiveFailures）

读数 A = CI 侧盘上（`generatedAt = 2026-10-04T16:31:52.051Z`）；读数 B = 本机本轮（`2026-10-05T03:32:32.801Z` 起跑）。
「zero」列 = `consecutiveZero`（连续零产出）与 `lastItemCount`。机器可读版本：`census-table.json`。

| # | source | kind | 区域 | A 状态 | A consecutiveFailures | A consecutiveZero / lastItemCount | A lastSuccessAt | B 实跑结果 | B 产出(valid) | B 耗时 | B 推演状态 | B 推演 consecutiveFailures | B 零产出 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `cn_qianfan` 百度千帆 | static | cn | healthy | 0 | 0 / 17 | 2026-10-04T16:31:52.051Z | ok | 17（优惠 17） | 0.7s | healthy | 0 | 无 |
| 2 | `cn_aliyun` 阿里云百炼 | static | cn | healthy | 0 | 0 / 1 | 2026-10-04T16:31:52.051Z | ok | 1（优惠 1） | 0.9s | healthy | 0 | 无 |
| 3 | `cn_zhipu` 智谱AI | static | cn | healthy | 0 | 0 / 7 | 2026-10-04T16:31:52.051Z | ok | 7（优惠 7） | 1.1s | healthy | 0 | 无 |
| 4 | `layer3labs` Layer3Labs | static | global | healthy | 0 | 0 / 13 | 2026-10-04T16:31:52.051Z | ok | 13（优惠 9） | 1.6s | healthy | 0 | 无 |
| 5 | `aitools` aitools.fyi | static | global | healthy | 0 | 0 / 15 | 2026-10-04T16:31:52.051Z | ok | 15 | 2.7s | healthy | 0 | 无 |
| 6 | **`futurepedia` Futurepedia** | static | global | **failed** | **10** | 0 / 7 | **2026-09-30T01:36:21.446Z** | **ok** | **7** | **4.5s** | healthy（推演） | 0（推演） | 无 |
| 7 | `futuretools` Futuretools | static | global | healthy | 0 | 0 / 38 | 2026-10-04T16:31:52.051Z | ok | 38 | 20.9s | healthy | 0 | 无 |
| 8 | `cn_zhipu_pricing` 智谱AI活动页 | **headless** | cn | healthy | 0 | 0 / 4 | 2026-10-04T16:31:52.051Z | ok | 4（优惠 4） | 36.2s | healthy | 0 | 无 |
| 9 | `cn_volc_ark` 火山方舟 | **headless** | cn | healthy | 0 | 0 / 12 | 2026-10-04T16:31:52.051Z | ok | 12（优惠 12） | 4.8s | healthy | 0 | 无 |

- `A 状态`/`consecutiveFailures` 的原文：`node -e "const h=require('./scripts/data/source-health.json');console.log(h.generatedAt);for(const s of h.sources)console.log(s.source,s.status,s.consecutiveFailures,s.lastError||'')"`（log：`logs/verify-misc.txt`）。
- `degraded` 一栏：**两套读数里都是 0 个**（A：`degraded=0`；B：`summary.degraded=0`）。
- 无头浏览器本轮探测：`{attempted:true, ok:true, channel:"msedge", checkedAt:"2026-10-05T03:33:41.582Z"}` —— 两个无头来源 `headlessReady=true`。
- 本轮 **9 个来源 9/9 成功、零失败、零零产出**；B 列产出与 A 列 `lastItemCount` 逐个相同（唯一差异是 B 的成功在「A 仍是 failed」的同时发生，见 §3/§4）。
- §29 要求的「对 `consecutiveFailures >= 3` 的每个来源逐条回答 8 问」：**只有 `futurepedia`（10）命中**，逐问回答见 §6；其余 8 个来源两套读数都是 0，不改判、不需裁决。

## 3. 「本机 200 / CI 403」的归因实验（同 URL、同机器、逐项只改一个变量）

探针：`probe-http-forensics.cjs`（`--tag=fp` 于 `2026-10-05T03:31:49.168Z`、`--tag=fp2` 于 `2026-10-05T03:32:52.446Z` 各跑一次，两次结论一致）。
原始读数：`http-forensics-fp.json` / `http-forensics-fp2.json`，log：`logs/http-forensics-fp*.txt`。

| 变量 | 取值 | 结果 | 读数时间（UTC） |
| --- | --- | --- | --- |
| V1 采集器现状头（`http.js` 默认 UA + Accept + Accept-Language + 采集器自己的 `Referer`），不跟随重定向 | 1,482,136 B | **HTTP 200**（无 3xx） | 2026-10-05T03:31:49Z |
| V1b 同头，跟随重定向 | 1,482,136 B | **HTTP 200**；`<title>Find The Best AI Tools &amp; Software, Futurepedia.io` | 2026-10-05T03:31:52Z |
| V2 **完全不发 `User-Agent`** | 1,481,571 B | **HTTP 200** | 2026-10-05T03:31:53Z |
| V3 满浏览器头（`sec-ch-ua` / `sec-fetch-*` / `Accept-Encoding: br` / `Cache-Control: no-cache`） | 1,482,136 B | **HTTP 200** | 2026-10-05T03:31:54Z |
| V4 Googlebot UA | 1,478,093 B | **HTTP 200** | 2026-10-05T03:31:56Z |
| V5 **生产路径** `lib/http.js#getText()`（robots 检查 + 2 次重试全在内） | 1,482,136 B | **ok=true**，1,660 ms | 2026-10-05T03:32:53Z（fp2） |
| V6 3 轮连续首页请求 | 1,482,136 B ×3 | **200 / 200 / 200**，cf-ray `…-SEA` ×3 | 03:32:00 / 03:32:02 / 03:32:06Z |
| V7 详情页 3 个（URL 用**生产解析器** `parseFuturepediaList()` 取） | 246,662 / 204,245 / 181,128 B | **200 / 200 / 200** | 03:33:11–03:33:15Z（fp2） |
| V8 `robots.txt` | 374 B | **200**；`User-Agent: *` + `Allow: /`；仅禁 `?search=`/`?sort=` 等参数化 URL 与 `/profile`；`isAllowedByRobots('/')=true`、`('/tool/example')=true` | 03:33:15Z |
| V9 **本机出口身份**（futurepedia 自己的 `cdn-cgi/trace`） | — | `loc=CN`、`colo=SEA`、`ip=2409:895a:dcd:aeb8:…`、`warp=off`、`gateway=off`、`http=http/1.1`、`tls=TLSv1.3` | 03:33:16Z |

响应头（V1，原文抄录）：`server: cloudflare`、`x-powered-by: Next.js`、`x-vercel-id: pdx1::lhr1::…`、`cf-cache-status: DYNAMIC`、`cf-ray: a4595b0bca65af49-SEA`、`cache-control: private, no-cache, no-store, max-age=0, must-revalidate`。即：**Cloudflare 前置 + Vercel 源站**。

判读（严格区分「观测」与「推断」）：

- **观测**：403 在本机 **5 个变体、3 轮连续、3 个详情页**上都无法复现；请求头/UA 不是变量（连不发 UA、Googlebot UA 都 200）。
- **观测**：本机出口是 `loc=CN` 的 IPv6（`2409:895a:…`），CI 出口是 GitHub Actions（Azure）机房段 —— 这是**本机无法复现的唯一剩余变量**，也是本文件唯一没有对照实验的地方。
- **推断（明确标注为推断）**：`HTTP 403` 的形态与「边缘按来源 IP/机房策略放行或拒绝」一致；`cf-mitigated` 头未出现、本机页面无验证码/挑战标记（`markers: {login:false, captcha:false, cloudflare:false, errorPage:false}`）。
- **不成立的归因**：「UA 不完备」「请求头不完整」「页面改版/选择器失效」「robots 禁止」「需要登录」——这五条都有反证（上表 + §6 第 2/4 问）。
- **纪律结论**：写作 **`observed unstable`**（同来源跨环境观测不一致：本机稳定成功、CI 连续失败），**不写 fixed / repaired / 已恢复**。

### 3.1 一条重要的历史更正（避免下游把它当结论）

拿 `source-health.json` 做跨分支比对（`git show <ref>:scripts/data/source-health.json`）：

| ref | generatedAt | 普查 | futurepedia |
| --- | --- | --- | --- |
| `coverage-expansion-v1` / `origin/coverage-expansion-v1` | 2026-10-04T16:31:52.051Z | healthy 8 / failed 1 | failed，cf=10 |
| `origin/master` | 2026-10-04T16:31:52.051Z | healthy 8 / failed 1 | failed，cf=10 |
| 本地 `master`（落后） | 2026-10-04T03:07:44.109Z | healthy 8 / failed 1 | failed，cf=8 |

`git log --all -S"2026-10-04T10:34:24.731Z" -- scripts/data/source-health.json` = **空**：
上一轮（coverage-expansion-v1 / t13）本机真跑写出的那个 `generatedAt=2026-10-04T10:34:24.731Z / 9 healthy` 读数
**从未进入任何分支的 `source-health.json`**（字符串索引在其它文件里命中，说明它只出现在上一轮的研究文档里）。
⇒ 「9/9 healthy」是**分支本机读数**，不是发布侧真值；master 侧 futurepedia 从 `2026-09-30T04:09:07.964Z` 起从未成功过（§5）。本文件据此不引用上一轮的「已恢复」说法。

## 4. 时间敏感反证：3+3+3 轮连续读数（每轮带时间戳与结果）

### 4.1 结构化普查（`probe-census.cjs`，走生产链路，不写盘）

| 轮 | 时间戳（UTC / 本机） | 产出 | 耗时 | 首页字节 / digest | 结果 |
| --- | --- | --- | --- | --- | --- |
| R1 | 2026-10-05T03:30:49.416Z / 11:30:49 | 7 条 | 6,784 ms | 1,482,136 B / 8 次抓取 | ok |
| R2 | 2026-10-05T03:38:27.955Z / 11:38:27 | 7 条 | 5,139 ms | 1,482,136 B / 8 次抓取 | ok |
| R3 | 2026-10-05T03:40:33.374Z / 11:40:33 | 7 条 | 4,508 ms | 1,482,136 B / 8 次抓取 | ok |

三轮的**标题、官方 URL、discount 文本逐字一致**（ChatGPT / Claude / HubSpot AEO Sensor / Perplexity / Google Gemini / Midjourney / Grok）；
三轮 `htmlSha256` **互不相同**而字节数完全相同 —— 说明首页存在同长度的动态片段，
**「字节相等」不是合适的稳定性判据，「抽出来的内容相等」才是**（这一点写下来是为了避免后来者用字节比对误判）。

### 4.2 生产命令 dry-run（Verify 指定命令，原样执行）

| 轮 | 起止（本机） | 结果 |
| --- | --- | --- |
| 1 | 11:36:31.756 → 11:36:37.327 | `Futurepedia 国外 7 7 0 0 5.2s`，`采集器失败 0/1`，exit=0 |
| 2 | 11:37:02.335 → 11:37:07.257 | `7 7 0 0 4.6s`，`采集器失败 0/1`，exit=0 |
| 3 | 11:37:32.260 → 11:37:37.023 | `7 7 0 0 4.5s`，`采集器失败 0/1`，exit=0 |

log：`logs/dryrun-only-futurepedia-3rounds.txt`。

### 4.3 无头路径稳定性（`probe-futurepedia-headless.cjs`，供 `headless-migrate` 判据用）

| 轮 | 时间戳（UTC） | 结果 | HTML 字节 | 解析条目 | 挑战/登录标记 | 控制台错误 |
| --- | --- | --- | --- | --- | --- | --- |
| H1 | 2026-10-05T03:37:43.249Z | ok，6,489 ms | 1,480,303 | **7**（标题与本机静态轮逐字一致） | 全 false | 0 |
| H2 | 2026-10-05T03:37:51.249Z | ok，3,399 ms | 1,481,408 | **7**（一致） | 全 false | 0 |
| H3 | 2026-10-05T03:37:56.159Z | ok，3,614 ms | 1,481,404 | **7**（一致） | 全 false | 0 |

汇总：`{rounds:3, okRounds:3, errorRounds:0, itemCounts:[7,7,7], stableItemCount:true, identicalTitles:true, medianMs:3614, maxMs:6489}`；内核 `channel=msedge`，失败请求 0。
**局限（必须与读数一起读）**：出口是本机（`loc=CN`），**不是** CI 出口；所以这组读数只支持「本机无头路径稳定」，**不**支持「CI 无头也会成功」。

### 4.4 结论措辞（硬要求）

- 本机：**observed stable**（9 轮：3 结构 + 3 dry-run + 3 无头，全成功）。
- CI：**observed failing**（连续 10 次，§5）。
- 该来源整体：**`observed unstable`（跨环境观测不一致）**；**不写 fixed / repaired / 已恢复**；复查窗口与触发条件见 §7.5。

## 5. CI 侧逐次读数（由 git 重建，19 次）

探针：`probe-ci-history.cjs` → `ci-readings.json`（人读版 `ci-history.txt`）。
方法：`git log --format=%H -- scripts/data/source-health.json` 的每次提交 = 一次 CI 采集的落地读数，
`git show <sha>:scripts/data/source-health.json` 读回当时的 `generatedAt` 与逐源状态。**这是同一条真值链的历史，不是第二套真相。**

| 指标 | 取值 |
| --- | --- |
| 读数次数 | 19 |
| futurepedia 成功 / 失败 | **4 / 15** |
| 最近一次 CI 成功 | `generatedAt = 2026-09-30T01:36:21.446Z`（提交时间 2026-09-30 09:38:55 +08:00） |
| **当前连续失败段** | **10 次**：`2026-09-30T04:09:07.964Z` → `2026-10-04T16:31:52.051Z`（≈4.5 天，与盘上 `consecutiveFailures=10` 完全吻合） |
| 失败错误原文 | `https://www.futurepedia.io/ 抓取失败: HTTP 403`（10 次读数一致） |
| 19 次读数里出现过的非 healthy 来源 | **只有 `futurepedia`**（15 次）；其余 8 个来源在 CI 侧**从未**出现非 healthy |

近 10 次读数原文（`generatedAt` / `consecutiveFailures`）：
`2026-09-30T04:09:07.964Z`→1、`2026-09-30T17:42:06.038Z`→2、`2026-10-01T04:20:35.712Z`→3、`2026-10-01T18:08:51.193Z`→4、`2026-10-02T04:14:02.909Z`→5、`2026-10-02T17:34:24.906Z`→6、`2026-10-03T03:56:44.430Z`→7、`2026-10-04T03:07:44.109Z`→8、`2026-10-04T04:28:23.566Z`→9、`2026-10-04T16:31:52.051Z`→10。

CI 节奏与执行方式（`.github/workflows/collect.yml`）：`cron '0 0 * * *'` + `'0 12 * * *'`（UTC）＝北京时间 08:00 / 20:00；
`TZ: Asia/Shanghai`、`node 24`、采集命令 `node scripts/collect.js --headless`，浏览器安装步骤是 `continue-on-error: true`。
CI 侧两个无头来源是 healthy 且 `headlessReady=true` ⇒ **CI 具备无头能力**（这一条对 §7 的 headless 选项判定是必要的输入）。

## 6. 题面 §29 的 8 问（逐问回答；命中来源：只有 `futurepedia`，cf=10）

> 口径：两套读数分开引用；每个数字带时间戳。其余 8 个来源 cf=0（§2），不逐问展开。

**Q1 static 是否可访问？**
- CI 侧：不可 —— `generatedAt=2026-10-04T16:31:52.051Z` 记 `HTTP 403`，连续 10 次（`2026-09-30T04:09:07.964Z → 2026-10-04T16:31:52.051Z`）。
- 本机侧（2026-10-05T03:31:49Z–03:33:15Z）：可 —— V1/V1b/V2/V3/V4 五变体全 200，生产 `http.getText()` ok，详情页 3/3 200。
- ⇒ 两侧观测不一致，按 `observed unstable` 记录。

**Q2 UA / redirect / HTML 结构是否变化？**
- redirect：`maxRedirects: 0` 直接 200，**无重定向**；`http→https`、`www` 归一都不存在跳转问题。
- UA：**不是变量** —— 去掉 UA（1,481,571 B）与 Googlebot UA（1,478,093 B）都 200；三个带 UA 变体字节数完全相同（1,482,136）。
- 结构：**未坏** ——
  - `fixture:test`（2026-10-05T11:36:39+08:00）：`futurepedia.list: 3 条与期望一致`，4 项 fixture 全通过、失败 0；该夹具按 `registry.all()` 查 `expected.source`，是「注册的采集器契约」而非快照；
  - 本机探针命中非零：`a[href*="utm_source=futurepedia"]=1`、`meta[name="description"]=1`、`span=47`（`probe-census` digest，2026-10-05T03:30:49Z）；
  - `__NEXT_DATA__=0`（App Router，不是旧 Next.js 内嵌数据）—— 采集器解析的是 `a[href*="/tool/"]` 卡片，与实现一致。
  - `source-snapshots.json` **无法用作「变之前/变之后」**：该文件 2026-10-01 才上线，而 futurepedia 从 2026-09-30 起在 CI 上没成功过，所以它的 `current/previous` 一直是 `null`（9 次提交全 null，已逐提交核过）。这是**观测能力的一个缺口**，不写成「结构未变」的证据来源。

**Q3 headless 是否稳定？**
- 本机 3/3 成功、每轮 7 条且标题逐字一致、median 3.6s / max 6.5s、无挑战标记、无控制台错误（§4.3）。
- CI 侧**没有读数**（该来源目前是 static，`--headless` 也不会把它放进 picked）；CI 出口下的无头表现**未知**。
- ⇒ 按契约，若 T05/T06 选 `headless-migrate`，必须附**连续多次采集的稳定性读数**；本文件提供的这组是**本机**读数，**不足以**单独支撑该裁决（缺 CI 出口那一半）。

**Q4 是否需要登录？**
- 不需要：`markers.login=false`（该判据 = 命中登录词**且**正文 < 3,000 字符；本机正文 5,162 字符，两个条件不同时成立）；详情页 3/3 返回 200，且 `Pricing Model` 文本被采集器解析成 7 条带价格档位的条目。
- 反过来：CI 侧 403 也不是登录墙形态（错误是 `HTTP 403`，不是 200 + 登录页），所以「需要登录」这条**双向都不成立**。

**Q5 是否 bot protection？**
- 本机未遇到任何挑战：`markers.captcha=false`、`cloudflare=false`、`errorPage=false`；响应头无 `cf-mitigated`；`cf-cache-status: DYNAMIC`（源站直出）。
- 但：站点确实在 Cloudflare 后面（`server: cloudflare`）+ Vercel 源站，且 403 是 Cloudflare 形态的状态码。**归因只到这一步**：唯一无法本机复现的变量是出口 IP/机房（§3），所以写成「疑似边缘/IP 策略（**假设**）」，不写成结论。

**Q6 与其它 discovery source 的 overlap 多大？**
- 7 条 live 条目中 **4 条与其它来源重合**（判据 T = `aliasKey`）：ChatGPT↔`Layer3Labs / ChatGPT / OpenAI`、Claude↔`Curated / Anthropic Claude 非营利组织折扣`、Perplexity↔`Layer3Labs / Perplexity`、Google Gemini↔`Layer3Labs / Google Gemini`。
- 生产实现对照：`dedup()` 合并计数 **4**（`combinedInput 139 → combinedAfterDedup 135`，`fpRepresentativesAfter=3`）—— 与判据 T 完全一致。
- **「逐字相等」只能抓到 2 条**（Perplexity、Google Gemini）⇒ 不做归一化会低估 overlap 一半。这是本任务禁止 `title === title` 的直接证据。
- 字段级贡献：这 4 条并入已有记录后 **零字段变化**（`dedup.merge()` 逐条模拟，`mergeFieldDiffs: []`）—— 已有记录（Layer3Labs/Curated）的 `discountInfo`/`pricingModel` 更完整，Futurepedia 侧不补任何字段。

**Q7 是否有独有候选价值？**
- 7 条中 **3 条在「其它来源」里没有对应**：HubSpot AEO Sensor、Midjourney、Grok。
- 落到**数据集**（`deals.json`，135 条，只读，2026-10-05T03:30Z）：`source='Futurepedia'` 的记录 **3 条**，且这 3 条与其它来源**零重合**（`fpHistoricalOverlapWithOthers=0`）。
  - **真正独占的 2 条**：Midjourney、HubSpot AEO Sensor（全库唯一来源就是 Futurepedia）；
  - Grok 是**共同发现**：Futuretools 每轮也产出 `Grok`（`https://grok.com/`），两者 `aliasKey` 同为 `grok` → 合并后记录保留 Futurepedia 的 id/来源、`lastSeen` 由 **Futuretools** 刷新（这解释了为什么 3 条里只有 Grok 的 `lastSeen=2026-10-05`，另两条停在 `2026-09-30`）。
- **本轮新增候选 = 0**：7 条全部已在数据集内（`inDatasetAtAll=true`），没有新条目、没有新厂商。
- ⇒ 独有价值是**存量 2 条**，不是**增量**。

**Q8 维护成本？**
- 代码：55 行（`parseFuturepediaList` 16 + `collectFuturepedia` 18 + `fetchFuturepediaDetail` 21，`scripts/collectors/global_directories.js`）。
- 运行时：**8 次 HTTP/轮**（1 首页 + 7 详情，digest 实测）、**2,932,641 B ≈ 2.93 MB/轮**；本机 4.5–6.8 s；CI 2 轮/天 ⇒ ≈5.9 MB/天。
- 可靠性：CI 侧 10/10 失败（§5）；失败不污染数据（失败源不参与「未见」计数，见 `collect.js` 的 `absenceEligibleSources`），但**这 2 条独有记录的 `lastSeen` 从 2026-09-30 起停止刷新**。
- 配套维护面（retire/repair 时都要动）：`scripts/data/fixtures/futurepedia.list/`（fixture 契约，`fixture:test` 按 `registry.all()` 查）、`scripts/data/source-probes.json` 的探针声明（`ai-selftest` 双向对账）、`source-snapshots.json` 的结构摘要。

## 7. Futurepedia 重新裁决建议（可复核；落地在 T06）

### 7.1 五项数字（契约要求，全部可复跑）

| 数字 | 取值 | 判据 / 出处 |
| --- | --- | --- |
| **historical items** | **3** 条（`deals.json` 里 `source='Futurepedia'`；对应每轮 7 条产出） | `overlap-fp-round1.json#inputs.fpDealsInDataset` |
| **unique items** | **3 of 7**（HubSpot AEO Sensor / Midjourney / Grok；扩展判据 T∪U∪S 无其它来源对应对） | `#numbers.fpLiveExtendedUnique` |
| **overlap items** | **4 of 7**（ChatGPT / Claude / Perplexity / Google Gemini）；生产 `dedup()` 实测合并 **4** 条；逐字相等只能抓到 **2** | `#numbers.fpLiveExtendedOverlap`、`#productionControl.productionMergedCount`、`#numbers.fpLiveRawTitleOverlap` |
| **recent unique candidates** | **0**（本轮 7 条全部已在数据集内；新增厂商 0） | `#numbers.fpRecentUniqueCandidates` / `#fpRecentUniqueCandidatesNewVendor` |
| **maintenance cost** | 55 行代码 · 8 次 HTTP/轮 · 2.93 MB/轮 · 2 轮/天 · **CI 侧 10/10 失败** · 3 处配套维护面 | §6 Q8 |

### 7.2 overlap 判据（可复核，不用 `title === title`）

- `T_titleKey = dedup.aliasKey(dedup.normalizeTitle(title))`（复用生产去重链：别名表 + 噪声后缀/前缀剥离）。
- `U_urlKey`：官方 URL 归一 = `host`（去 `www`、小写）+ `path`（丢 query、去尾斜杠、小写）。
- `V_vendorKey`：`render-core.vendorOf({vendor}).key`（**粗判据，仅诊断**：同厂不等于同条目；本轮 V 命中 0 条「只被 V 命中」的条目）。
- `S_sourceKey`：`sourceUrl` 的 host+path 归一（发现「同一个源页、标题不同」）。
- `extendedOverlap = T ∪ U ∪ S`；**生产行为 = T**（`dedup()` 只按 aliasKey 合并）。
- 对照 `rawTitle`（逐字相等）保留在读数里，**只用于证明归一的必要性**。
- `SOURCE_PRIORITY` 的作用：`dedup.score()` 决定合并胜者。取值（原文摘自 `dedup.js`）：`Curated/Curated-CN=100`、`Layer3Labs=50`、国内官方来源 `=40`、`aitools.fyi=30`、`Futurepedia=20`、`Futuretools=10`。
  本轮 4 条重合条目的对手分别是 `Layer3Labs`（50）与 `Curated`（100），且对手侧 `type/discountInfo` 分数更高（对手 `score` 83/203/133/83，Futurepedia 侧 25）⇒ **4 条全部输给已有记录**，记录代表、id、字段都不变。
  **Stable ID 零 churn 的实测**：3 条独有条目的 live id（`cb45e0c735bd` / `9e7c938ec401` / `376b6b3397e6`）与数据集里逐字相同；4 条重合条目也不会替换已有记录。

### 7.3 「repair 的空间」有多大（可采面测量，避免凭印象）

`probe-futurepedia-surface.cjs`（`ranAtUtc = 2026-10-05T03:39:07.041Z` / 本机 11:39:07；读数见 `surface-futurepedia.json`、log `logs/surface-futurepedia.txt`）：

| 面 | 读数 |
| --- | --- |
| 首页（唯一静态可解析面） | 200 / 1,481,771 B / `parseFuturepediaList()` = **7 条** |
| `sitemap.xml` | 200 / 135,660 B / **631** 个 `<loc>`（newsletter、resources、ai-tools、ai-innovations…） |
| `sitemap_tools.xml` | 200 / 191,216 B / **1,332** 个 `<loc>`，全部 `/tool/` 页（采集器目前只读 7/1,332 ≈ 0.5%） |
| `/ai-tools`（目录落地页） | 200 / 111,329 B / **静态 HTML 里 0 个 `/tool/` 链接**（`parseItems=0`）⇒ 目录需要渲染或走接口，**静态路径扩不出量** |

⇒ 「把采集器指向列表页以扩大产出」这条 repair 在**静态路径上没有空间**；可行的只有
「读 sitemap 的 1,332 个工具页」或「上无头渲染目录页」——两者都是**换方案**（成本 ×100 请求量级 / 引入内核依赖），
且拿到的是**工具页**而不是**优惠**，与本项目「只发布官方可核验的优惠」的口径不匹配。

### 7.4 四类裁决逐条对照（给出建议与反证）

| 裁决 | 支持证据 | 反证 / 代价 | 建议 |
| --- | --- | --- | --- |
| `repair` | 无 | 本机 5 变体全 200、fixture 契约通过、探针命中非零 ⇒ **没有可复现的缺陷可修**；CI 侧 403 无法在本机复现 ⇒ 任何「修法」都是盲改（违反「不猜」）；静态扩面无空间（§7.3） | **不选** |
| `headless-migrate` | 本机无头 3/3 稳定、7 条一致、median 3.6s；CI 确实具备无头能力（两个无头来源 healthy×`headlessReady=true`） | 无头**仍从同一 CI 出口发出请求**（换的是 TLS/JS 指纹，不是 IP）⇒ 对「IP/机房策略」假设**没有对症证据**；代价是把「来源可用」绑到「runner 能装内核」；且 CI 出口那一半稳定性**没有读数** | **暂不选**，作为升级路径（触发条件见 §7.5） |
| `keep-degraded` | 现状即可：失败不污染数据（失败源不进 `absenceEligibleSources`，不产生批量 `ended`）；本机每轮 7 条可刷新 3 条已有记录；成本极低（55 行、0 新增依赖）；**机制上**只要某一轮 CI 成功，健康层下一轮就会按既定规则回 healthy（这是规则行为，不是本文件对未来的断言） | 2 条独有记录的 `lastSeen` 停在 `2026-09-30`（**可见的陈旧**，需要人知道） | **建议 `keep-degraded`**（需写 `whyKept` + `revisitBy`） |
| `retire` | 增量价值为 **0**（本轮新增候选 0）；overlap 4/7 且**字段贡献 0**；CI 10/10 失败；每轮 2.93 MB 换 3 条存量记录 | 会**永久停掉** 2 条独占记录（Midjourney / HubSpot AEO Sensor）的唯一刷新通道（数据不删、不产生 `ended`，但 `lastSeen` 冻结）；返回路径是再一次 PR | **不选**（若队长决定burn 掉这条失败链，则它是有据可依的第二选择——**不要默认 retire**） |

### 7.5 若选 `keep-degraded`：建议写进 T06 的字段与触发条件

- `whyKept`：CI 侧 403 属**跨环境观测不一致**（本机 5 变体 + 9 轮全成功；无法复现、无可修缺陷）；失败不污染数据；它是 2 条独占记录（Midjourney / HubSpot AEO Sensor）的唯一发现通道；成本 55 行 / 0 依赖。
- `revisitBy`：建议 **2026-10-19**（下一次复审窗口，两周）—— 到点用**同一条命令**重读两套读数：`generatedAt` 与 `consecutiveFailures`（CI 侧）+ 本机 dry-run 轮次。
- 升级触发条件（满足任一条即从 `keep-degraded` 升级，**写进裁决而不是留在人脑里**）：
  1. CI 侧出现 **≥ 20 次**连续失败（约再 5 天），且队长判定「不再等它」；
  2. 或另一来源开始覆盖 Midjourney / HubSpot AEO Sensor（独占价值消失）⇒ 转 `retire`；
  3. 或 CI 侧出现**与 403 不同形态**的失败（例如 HTML 结构变化、零产出）⇒ 转 `repair`（那时才是真的可修缺陷）；
  4. 若决意保留其内容贡献，则按 `headless-migrate` 走，并且**必须先拿到 CI 出口下的稳定性读数**（连续多轮 `--headless` 真跑），否则不允许落地。

## 8. 复跑指引（把这一节当命令清单）

```powershell
# 0) 只读取证脚本（全部只写 research/_raw/coverage-depth-v1/source-reliability/）
node research/_raw/coverage-depth-v1/source-reliability/probe-census.cjs --headless --tag=full1
node research/_raw/coverage-depth-v1/source-reliability/probe-census.cjs --only=futurepedia --tag=fp-round1
node research/_raw/coverage-depth-v1/source-reliability/probe-http-forensics.cjs --tag=fp --details=3
node research/_raw/coverage-depth-v1/source-reliability/probe-futurepedia-headless.cjs --rounds=3
node research/_raw/coverage-depth-v1/source-reliability/probe-futurepedia-surface.cjs
node research/_raw/coverage-depth-v1/source-reliability/probe-overlap.cjs --census=census-fp-round1.json --tag=fp-round1
node research/_raw/coverage-depth-v1/source-reliability/probe-ci-history.cjs

# 1) 任务 Verify 的五条（本文件已逐条执行，exit code 见 §10）
node scripts/collect.js --list                     # 7 个（默认链路）
node scripts/collect.js --headless --list          # 9 个（含无头）
node scripts/collect.js --dry-run --only=futurepedia
node scripts/tools/inspect-source.js               # 无参数 → 用法提示 + exit 1（工具本身要求 <url>）
node scripts/tools/inspect-source.js https://www.futurepedia.io/
node -e "const h=require('./scripts/data/source-health.json');console.log(h.generatedAt);for(const s of h.sources)console.log(s.source,s.status,s.consecutiveFailures,s.lastError||'')"

# 2) 只读自测（本文件已跑）
node scripts/tools/fixture-test.js                 # 4 项通过 / 0 失败
node scripts/tools/health-selftest.js              # 72 项通过 / 0 失败
```

## 9. 下游（T05 / T06）必读的耦合点

1. **`SOURCE_TYPES` 必须保留**被 retire 来源的条目（`provenance.js`）：`deals.json` 里 3 条记录的 `source` 仍是 `"Futurepedia"`，删条目会让 `sourceType` 变 `unknown`（= 改写历史）。催化剂判据是 `provenance-selftest.js` 的单向检查（队长已核，本文件认同）。
2. **`source-probes.json` 必须删**被 retire 来源的条目：`lib/dom-digest.js#probeCoverage()` 同时报 `missing`（采集器没探针）与 `unknown`（探针没采集器），`ai-selftest.js` 要求两者都为 0。
3. **`source-health.json` 的那一行保留**（不删）：`health.build()` 对本轮没跑到的来源原样保留并标 `stale:true / lastRunMissing:true` —— 这才是「它已不在采集链上」的诚实表达；删行 = 为全绿而抹掉观测。
4. **`fixtures/futurepedia.list/` 目录必须删**：`fixture:test` 按 `registry.all()` 遍历，会去找 `expected.source`。
5. **本条是本轮新查到的、与上面 4 条不对称的一点**：`source-snapshots.json` 的行**只为「本轮跑过的来源」生成**（`collect.js` 的 `snapshotEntries` 来自 `picked`，`buildSnapshotDoc()` 不为未跑来源补行），所以 retire 之后 futurepedia 会从该文件**整行消失**（而 health 是保留）。这不涉及历史改写（它记录的是页面结构摘要、没有内容），但下游别以为两者行为一致。
6. **若选 `keep-degraded`**：健康层无需任何改动；但 T06 的裁决文件里必须带 `whyKept` + `revisitBy`（§7.5 给了建议值与触发条件）。
7. **若选 `retire` 或 `headless-migrate`**：本文件的 §7.1/§7.4 已给五项数字与反证；`headless-migrate` 落地前**必须**补 CI 出口的稳定性读数（本文件只有本机那一半）。
8. 无论哪种裁决：**不得**删任何历史 Deals、**不得**把它们的生命周期字段改成 ended；**不得**为了让普查好看而改 `source-health.json` 的既有观测（本任务全程未改）。

## 10. 证据清单（全部落在本任务 in-scope 目录内）

| 文件 | 角色 | sha256 |
| --- | --- | --- |
| `census-full1.json` | 9 来源本机实况普查（2026-10-05T03:32:32.801Z 起跑） | `0A38DC17…CD874A` |
| `census-fp-round1/2/3.json` | futurepedia 三轮结构化普查 | `E7F49D7E…` / `CD4A488C…` / `C96D97A8…` |
| `census-table.json` | §2 表格的机器可读版（两套读数逐源对照） | `14EC6EEB…C17643` |
| `http-forensics-fp.json` / `-fp2.json` | §3 归因实验两轮原始读数（含响应头、digest、zone trace） | `BFAF1CE1…` / `BE2C4CD2…` |
| `headless-futurepedia-stability.json` | §4.3 无头稳定性 3 轮 | `EC84BE0C…F856B3` |
| `surface-futurepedia.json` | §7.3 可采面（首页 / sitemaps / 目录页） | `DBC37909…AE1F26` |
| `overlap-fp-round1.json` | §7.1/§7.2 overlap、字段贡献、生产对照 | `94F3830C…4FEDE` |
| `ci-readings.json` / `ci-history.txt` | §5 CI 侧 19 次读数（git 重建） | `D114D439…` / `6EF38015…` |
| `probe-*.cjs`（6 个） | 可复跑取证脚本 | 见目录内文件头注释（全量清单见 `after-hashes.txt`） |
| `logs/*.txt` | 上述每次运行的 stdout（含 Verify 五条命令与两个自测） | 见目录（全量清单见 `after-hashes.txt`） |
| `tracked-hashes.json` | §10.1 只读证明（before/after sha256 + 两次 git status + 归属） | 见文件 |
| `after-hashes.txt` | 取证后 hash 原始输出（被跟踪文件 + 本目录全部工件） | 见文件 |

（完整 64 位 sha256 全量清单见 `after-hashes.txt` 与 `tracked-hashes.json`；上表给前 8 位/后若干位便于人读。）

### 10.1 只读证明（共享工作区被跟踪文件零改动，贴全文 sha256）

取证前 = 2026-10-05T11:28、取证后 = 2026-10-05T11:46（本机），同一批**被跟踪文件**逐字节比对（原文见 `tracked-hashes.json`、`after-hashes.txt`）：

| 文件 | sha256（before） | sha256（after） | 变化 |
| --- | --- | --- | --- |
| `scripts/data/source-health.json` | `F782626E2B0E9B31236393507FE00121E90FAF55DB92FBD71FA52002885ABF80` | `F782626E2B0E9B31236393507FE00121E90FAF55DB92FBD71FA52002885ABF80` | **未变** |
| `scripts/data/source-snapshots.json` | `25E4ED54FE64B3E7BEB9EE710CA3D9E4C321D1EC72D084F89C4C1D423C138EB6` | `25E4ED54FE64B3E7BEB9EE710CA3D9E4C321D1EC72D084F89C4C1D423C138EB6` | **未变** |
| `deals.json` | `FE063BC9E4E40B1051958D6F14B889F44D391848F0D2555B82E421651DFCD558` | `FE063BC9E4E40B1051958D6F14B889F44D391848F0D2555B82E421651DFCD558` | **未变** |
| `scripts/data/deal-history.json` | `DB7BC088E1AEC758F92B31D17DACAEBA393CFB1F5D72A8B9BB97CE4158B3A052` | `DB7BC088E1AEC758F92B31D17DACAEBA393CFB1F5D72A8B9BB97CE4158B3A052` | **未变** |
| `scripts/data/zh-pending.json` | `F9F85EBAA84FA58AB2711FA1B6217DD95C195D968F2EAB285DA342D7C32C06E6` | `F9F85EBAA84FA58AB2711FA1B6217DD95C195D968F2EAB285DA342D7C32C06E6` | **未变** |
| `scripts/data/source-probes.json` | `622209F13FC41E5705E6A995CA65AEF9C4F43894FDE9BA1AB79119CCED7D476A` | `622209F13FC41E5705E6A995CA65AEF9C4F43894FDE9BA1AB79119CCED7D476A` | **未变** |
| `index.html` | `4176D75C0C95707C65314360F497243DC46056D373B731819BA1B665123D7F42` | `4176D75C0C95707C65314360F497243DC46056D373B731819BA1B665123D7F42` | **未变** |

另记两个「T05 会动、本任务没动」的参照值（after 读数）：
`scripts/collectors/global_directories.js = 046EE40FDF2FC326B483C93F200379F68AA333D5058252D8D0D9F47E31302AD7`、
`scripts/lib/dedup.js = D3CEE7F49F0A4E8BF0CD2E7FAF12883776DB6E03E8262402E3E035B376AFA854`。

`git status --porcelain` 两次快照（取证前 → 取证后）：

- **取证前**只有：`?? .tmp-providers.txt`、`?? .tmp-status.txt`、`?? .tmp-t0.txt`、`?? research/_raw/coverage-depth-v1/`。
- **取证后**新增的都是**并发成员**的产物，**不是本任务写的**：`M scripts/data/curated_api_plans.json`、`M scripts/tools/coverage-report.js`、`M scripts/tools/coverage-targets-selftest.js`、`?? scripts/lib/source-rulings.js`、以及更多 `.tmp-*.txt`。
- 本任务自己的落点只有两处，且都在 in-scope 内：`research/coverage-depth-v1-source-reliability.md`、`research/_raw/coverage-depth-v1/source-reliability/`。
- 上表 7 个受监控文件在两次快照之间 **before == after**；`scripts/`、`.github/`、`deals.json`、`plans.json`、`api-plans.json`、`models.json` 中**没有任何本任务写入**。
- 说明：`git status` 里出现的 `M` 是并发成员的写域（t1/t3），**不归因于本任务**；本任务全程只用 `--dry-run` 与只读工具跑采集。

### 10.2 一句话边界

本文件是**取证与建议**：所有数字可复跑、所有 health 陈述带 `generatedAt`、所有归因都分「观测 / 推断」。
**裁决落盘（`source-rulings.json`）与采集器改动属于 T05/T06**；本文件不代替它们的判据，也不预先宣布任何裁决已生效。

---

## 11. T06 落盘记录：`scripts/data/source-rulings.json`（本节由 T06 追加）

t6（Workstream C-3）把 §7 的建议**原样落成数据**，没有新增任何取证。落盘件：

| 项 | 值 |
| --- | --- |
| 路径 | `scripts/data/source-rulings.json` |
| sha256 | `65FCE6F8551266E7BC9A6E05F27C30F65524B159214E751AAE7205A5C6749321` |
| 体积 / 形态 | 9,942 B · 2 空格缩进 + 末尾换行（与其它来源层同一套字节纪律） |
| 顶层键序 | `schemaVersion, reviewedAt, _note, rulings` |
| 裁决条数 | **1**（`futurepedia` = `keep-degraded`） |

### 11.1 为什么只有一条裁决

判据是 `scripts/lib/source-rulings.js` 的三方对账关系②「`consecutiveFailures ≥ 3` 的来源必须有裁决」：两套读数里**只有 `futurepedia`（cf=10）** 越线，其余 8 个来源（`aitools` / `cn_aliyun` / `cn_qianfan` / `cn_volc_ark` / `cn_zhipu` / `cn_zhipu_pricing` / `futuretools` / `layer3labs`）cf 恒为 0。给健康来源补一条裁决会谎称它有问题，所以**不补**。它们会出现在报告的「还没裁决的注册表行（不是错误，是缺口）」一行里 —— 可见，而非静默。

### 11.2 字段怎么从 §7 落到数据里（逐字段溯源，无新判断）

| 字段 | 取值 | 出处 |
| --- | --- | --- |
| `source` | `futurepedia` | 采集器注册表的 id（`scripts/collectors`），同时命中 source-health 的 `source` |
| `decision` | `keep-degraded` | §7.4 表格的「建议」列 |
| `reason` | 四类裁决逐条对照 + 两侧读数（带 `generatedAt`） | §0.3 / §6 Q1 / §7.4 |
| `evidence[0]` | 盘上心跳 live 读数（含文件 sha256） | `scripts/data/source-health.json`（本文件 §10.1 记录其 before==after） |
| `evidence[1]` | CI 侧 19 次读数（git 重建） | `ci-readings.json` · §5 |
| `evidence[2]` | 本机 5 变体归因实验 | `http-forensics-fp{,2}.json` · §3 |
| `evidence[3]` | `robots.txt` = `Allow: /` | `http-forensics-fp2.json#robots` · §6 Q2 |
| `evidence[4]` | 本机 9 轮连续读数（3 普查 + 3 dry-run + 3 无头） | `census-fp-round{1,2,3}.json` · `headless-futurepedia-stability.json` · §4 |
| `evidence[5]` | overlap / 独有价值五项数字 + 生产 `dedup()` 对照 | `overlap-fp-round1.json` · §7.1/§7.2 |
| `evidence[6]` | repair 的可采面测量 | `surface-futurepedia.json` · §7.3 |
| `overlap.historicalItems` | `3` | §7.1「historical items」 |
| `overlap.uniqueItems` | `3` | §7.1「unique items」 |
| `overlap.overlapItems` | `4` | §7.1「overlap items」 |
| `overlap.maintenanceCost` | `medium` | **T06 的映射判断**（见 11.3） |
| `whyKept` | §7.5 的第一条要点 | §7.5 |
| `revisitBy` | 2026-10-19 + 四条升级触发条件 | §7.5 |
| `headlessStability` | `null` | 裁决不是 `headless-migrate`，按 schema 该字段不适用（§6 Q3 的无头读数已作为 `evidence[4]` 留档） |

### 11.3 一处必须写明的映射判断：`maintenanceCost = medium`

§7.1 给的是**成本画像**（55 行 · 8 次 HTTP/轮 · 2.93 MB/轮 · 2 轮/天 · CI 侧 10/10 失败 · 3 处配套维护面），**不是** schema 的三档枚举值 —— 落盘时必须由人映射一次，这里如实记下这次映射：

- 取 `medium` 而不是 `low`：代码面确实极低（55 行 / 0 依赖），但**运行面与人工面不低** —— 每轮 CI 失败都会产生一次「还是那条已知的 403 吗」的人工 triage，且带着 3 处配套维护面（fixture 契约 / `source-probes.json` / `source-snapshots.json`）。
- 取 `medium` 而不是 `high`：**没有可修缺陷**（本机 5 变体全 200），不需要持续改规则，也没有停产风险等级。
- 判据写在文件自己的 `_note` 第 (4) 条里（「`maintenanceCost` 是保留这条来源的持续成本，不是它的产出价值」），所以读者不必猜这三档是什么意思。
- 影响面：`high` 会同时把依赖这条来源的缺口格子抬进 Gap Closure Queue 的「高维护成本」分支；本项目里没有任何 target 声明 `Futurepedia` 作为 deals 来源，所以该取值**不改变**报告的 Gap Closure Queue 读数（仍为 A0·B4·C10·D4）。

### 11.4 落盘后的三方对账（判据层复核，全部为空集）

```
validateRulings(doc)                    → 0 处问题
reconcileRulings(doc, 注册表, 心跳)      → 0 处问题
  ① retire 的来源仍在注册表               → 0
  ② 连续失败 ≥ 3 次却没有裁决             → 0（futurepedia 已有裁决）
  ③ repair / headless-migrate 不在注册表   → 0（本条是 keep-degraded，不适用；另核 0）
  ④ 裁决的 source 命不中任何身份           → 0（resolvedBy = registry-id；health 侧 join 到 failed/cf=10）
```

**「注册表 7 行 vs source-health 9 行」不是无法解释的差集** —— 它是报告的一处口径边界，这里登记清楚：

- `scripts/collectors` 的 `list()`（不带参数）= **静态 BASE 7 个**：`cn_qianfan / cn_aliyun / cn_zhipu / layer3labs / aitools / futurepedia / futuretools`；
- `all({ headless: true })` = **9 个**，多出的两个是**惰性加载**的无头采集器 `cn_zhipu_pricing` / `cn_volc_ark`（默认链路不 require playwright，所以 `list()` 看不见它们）；
- `scripts/data/source-health.json` 恰好也是那 **9** 个。
- 实测两个方向的差集**都是空集**：`BASE ∖ health = []`、`health ∖ all({headless:true}) = []`。⇒ 9 = 7 + 2，**没有任何来源凭空多出或消失**，差别只在「报告那一行数的是静态 BASE」。

### 11.5 内部维护层证明（不发布）

| 检查 | 结果 |
| --- | --- |
| `scripts/lib/data-docs.js` 的 `PUBLIC_DATASETS` 含 `source-rulings` | **否** |
| `dataDocs.datasetUrls()` 含 `source-rulings` | **否** |
| `scripts/lib/feeds.js`（Feed 层）含 `source-rulings` | **否** |
| `dist/data/index.json` | `dist/` 本轮未构建 ⇒ 不存在该文件 |
| 文件自己的 `_note` 首句 | 「内部维护层，**不发布**：不进 PUBLIC_DATASETS / Dataset Manifest / Sitemap / Feed」 |

### 11.6 确定性

- `JSON.parse` → `JSON.stringify(doc, null, 2) + '\n'` 的**往返逐字节一致**（实测 `true`）；
- 文件里不含 `new Date(` / `Date.now`（正则实测 `false`）：`reviewedAt` 是**人工日期** `2026-10-05`，`evidence[].capturedAt` 是**取证当天**，两者都不是跑脚本时的墙钟；
- 7 条 evidence 全部是绝对地址 + `YYYY-MM-DD` + 带时间戳的机器读数（三条口径均由判据层现场断言）。

### 11.7 复跑（T06 的四条 Verify）

```powershell
node -e "const r=require('./scripts/data/source-rulings.json');console.log(r.schemaVersion,r.reviewedAt,r.rulings.length);for(const x of r.rulings)console.log(x.source,x.decision)"
node scripts/tools/coverage-report.js          # 报告自检 0 处；Source Reliability 一节显示「已落盘（reviewedAt=2026-10-05）」，三方对账合计 0 处
node scripts/tools/coverage-targets-selftest.js # 178 项通过 / 0 项失败
node scripts/validate.js --strict              # ✅ 校验通过
```

### 11.8 现场注记（诚实记录，避免后来者误判归属）

落盘窗口（2026-10-05 11:52–12:05 CST）内，共享工作区上有并发成员在改 `scripts/data/**` 与根 `api-plans.json` / `plans.json`，因此这段时间里两道门禁**短暂**变红过，**均与本文件无关**（本文件只新增一个数据文件，且报告对它的读数是绿的）：

- `coverage-targets-selftest.js` 的既有断言 `t25` clause2（`reg.declaredApiEntries === gap.declaredApiEntryCount`）曾被 `model-registry-gaps.json` 11:56:31 版本里的一条 API 侧**通配声明**（`variant: null`，1 行展开成 2 个计价条目）顶翻 —— 该断言只在「没有通配声明」时成立（自测注释里本来就写着这一点）；12:03:42 该文件改回 24 条逐条声明后自动恢复绿；
- `validate.js --strict` 的 10 项「官方域守卫」曾指向 `plans.json` / `api-plans.json` 里 sensetime 记录的 `sensenova.cn` / `sensecore.cn` 域名，同样在并发成员改完后消失。

T06 收口时（12:05）四条 Verify **全绿**；`scripts/data/source-health.json` 与 `deals.json` 在本任务中**零改动**（T06 不写任何状态读数）。
