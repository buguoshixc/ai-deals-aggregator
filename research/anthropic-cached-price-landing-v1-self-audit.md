# t28 自审：Sonnet 5.5 缓存读价落地

- 任务：t28 / anthropic-cached-price-landing-v1（attempt 2）；观测日 **2026-10-08**；PR **#97**
- 报告：`research/anthropic-cached-price-landing-v1-report.md`；进仓证据：`research/_raw/anthropic-cached-price-landing-v1/`

## 1. 我亲自核过的（有读数）

| 自问 | 读数 |
|---|---|
| 官方原文是我自己读到的吗？ | 是：本会话 2026-10-08 直接 fetch <https://www.anthropic.com/claude-haiku-5-5>（HTTP 200），逐字整句落在引文里；页面自印日期 October 7, 2026。**没有**转抄任何我没读到的句子 |
| 新引文会不会被「每记录 3 条」上限静默挤掉？ | 会 —— 实测（`.arch-v1/t28/probe-binding2.js`）：第 4 条在字段序里排最后，先被截的正是它。因此把上限做成**可选** `opts.max`（缺省仍 3）并由 API 记录传 4 |
| 旧 $0.20 引文被删了吗？ | 没有：改后仍出现在 `dist/api-plans.json` / `dist/model-registry-links.json` / `dist/plans/api/index.html` 三处，字段/引文/URL/`capturedAt` 逐字节未动 |
| 渲染面真的变了吗？ | `dist/plans/api/index.html` 的 Sonnet 5.5 行 `$0.2`×1 → `$0.1`×1（按 `data-item="claude-sonnet-5.5|standard"` 取行） |
| 顺手碰到别的模型了吗？ | 没有：全量 308 行费率逐条 diff 只有 1 行不同；24 条记录里只有 anthropic 变化；抽样三家引文逐字节相同 |
| 插入 `note` 会不会产生第二条事件？ | 不会：`sameModelEntry` 只看 rates/mediaRates/aliases/note 的差异，事件类型由 `changedRateKeys` 决定 ⇒ 只有 `cachedInput` 一个维度变化 ⇒ 1 条 `price_decreased`（实测：本次追加正好 1 条） |
| 新形态会被用来绕开 B2 吗？ | 只有**显式**写 `.change` 才绕开；对照读数 T3（同一整句摘掉后缀）在 B2 下**照样红**；且 C2 把「只有一个数的引文」挡回去（T2 红）。这是加判据，不是开口子 |
| `opts.max` 会泄漏到别的域吗？ | `git grep` 全仓只有 `scripts/lib/api-plan-schema.js:1268` 一处传它；不传时归一后仍是 3 条（探针读数）；deals / Coding 的调用点逐行未动 |
| 日期有没有被顶上去？ | 官方生效日 2026-10-07 写在 `note` 与报告；`capturedAt` / `lastSeen` / `verifiedAt` / 事件 `at` 都是 **2026-10-08**（我们的观察日）。**没有**把任何日期写成我们没做过的事 |
| 长度硬约束过了吗？ | 新引文 159 字 ≤ 200、模型 note 72 字 ≤ 200（`validate --strict` 通过即归一器接受；attempt 1 那种 209 / 242 字被拒/被丢的形态没有复现） |
| 写入档动了吗？ | 没有。官方只讲 cache **reads**；`cacheWrite 2.5` / `cacheWriteLong 4` 逐条未动，`note` 明写「官方未说明变化，保持原值」，文案无联动暗示 |

## 2. 我没证明的（与报告 §7 同口径）

1. 官方 docs 定价表今天写什么：`platform.claude.com/docs/**` 从本网络仍被区域门拦（t26 已登记）⇒ 未复核；本次引文取自可达的官方变更公告页。
2. 变更的精确生效时刻：官方写 “starting today” + 页面日期 10-07，没有秒级时间。
3. 写入档是否联动：官方没写，我按「不说即不动」处理。
4. 事件 `at` 是**我们的记录日**（10-08），不是官方生效日（10-07）——这是仓库既有口径（`at` = `payload.updatedAt` = max(lastSeen)）。
5. 线上发布链：本任务只到产物 + 门禁，没有跑线上冒烟；PR 未合并。
6. 旧引文的「历史」性质没有数据内标记，靠 `capturedAt` 与紧邻的变更记录说明（`old-docs-quote.md` 已如实登记）。

## 3. 配牙与它的边界

- 五颗牙（T1–T5）都给了「红 → 逐字节还原 → 绿」读数，`research/_raw/anthropic-cached-price-landing-v1/teeth.md` 带四个文件的 sha256（还原前后完全相同）。
- **边界**：变更记录引文同时点名新值 0.10 与旧值 0.20 ⇒「把值改回 0.20」**不会**在引文层变红。可用的牙是 C1（引文里没有的数）与日志对账 T4。这条限制写在代码注释、报告与证据里，不假装它存在。

## 4. 门禁的已知红（不是本 PR 的数据错）

`gate` 49/52 步绿；步骤 50 红 1 项 = `verify-site.js:4218`「feed 条数 == 日志全部事件数」把「日志全部事件恰好都在 7 天窗口内」当成了不变量（其姊妹断言 `:5119` 只要子集）。本任务把 `lastSeen` 如实推到 2026-10-08 后，日志里 6 条 `2026-10-01` 的事件掉出窗口 ⇒ 断言红。已由 captain 裁定排期 **t32**（`feed-guid-window-judge-fix-v1`）修复，**串行：t32 先合，#97 再对齐新 master 后合**；本任务按纪律未改 `verify-site.js`、未改窗口口径、未把 `lastSeen` 改回旧日期。
