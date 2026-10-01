# SCHEMA v2.3 —— 套餐变化追踪（`plan-history.json` + 「最近变化」/ `/changes/` 套餐分栏 + 套餐变化订阅源）

> 本文件是 `v2.3-plan-history` 的**契约**：实现与本文不一致时以本文为准；改实现必须同时改本文与
> `scripts/tools/plan-history-selftest.js` 的夹具。
> 前序契约：[`SCHEMA-v1.4.md`](SCHEMA-v1.4.md)（优惠历史）· [`SCHEMA-v1.5.md`](SCHEMA-v1.5.md)（变化雷达）·
> [`SCHEMA-v1.6.md`](SCHEMA-v1.6.md)（订阅）· [`SCHEMA-v2.1.md`](SCHEMA-v2.1.md)（套餐数据模型与页面）。

---

## 1. 这一层干什么、不干什么

**干**：给 `plans.json` 建一份 append-only 的变化日志（一次性基线 + 追加事件），
让「这个套餐最近发生了什么变化」成为**可被机器重放验证**的事实，并把它呈现到三处：
`/plans/coding/` 的「最近变化」块与行内时间线、`/changes/` 的「套餐变化」分栏、
订阅源 `/feed/plans/coding/changes.xml|.json`。

**不干**：

- 不做每日快照、不做 git diff（理由同 v1.4，见 `SCHEMA-v1.4.md`）；
- 不把套餐变化混进优惠的变化流（两份日志、两条订阅源、两套分栏）；
- 不自动采套餐：日志的**唯一写入点**是人工跑 `npm run plans:rebuild`；
- 不做独立套餐详情页（v2.2 的决定不变）：变化落在套餐表的那一行（`#plan-<id>`）上；
- 不做 Deals ↔ Plans 关联（Phase 2.4）、不做 API plan（Phase 2.5）。

---

## 2. 与 deals 共用内核，**不**共用判据

`lib/history-core.js`（v2.3 新增）只放**与业务无关**的机制：确定性值序列化、一次性基线 + 事件重放、
链校验、「基线+事件 ⇒ 当前状态」的一致性校验、事件身份、观测态保留、上限。
`history.js`（deals）与 `plan-history.js`（plans）各自只提供一份 **profile**：

```
schemaVersion · recordKey · eventKeyName · trackedFields · fieldEvent · allowedEventTypes
eventTypes · lifecycleTypes · endReasons · fieldLabels · baselineNote
limits · renderLimit · absenceRetentionDays · rankTypes · readField · compare
applyEvent · eventValueMatches · passthroughKeys/emptyExtra/normalizeExtra · validateExtra
```

| 共享（只有一份实现） | 不共享（各领域所有，逐条理由） |
|---|---|
| 值归一与序列化（`normValue` / `stableJson` / `sameValue`） | **事件类型表**：deals 的 `benefit_changed` / `eligibility_changed` 在套餐里没有对应物 |
| 重放（`replay`）与「应用一条字段事件」（`applyFieldEvent`，plans 覆写成元素级） | **跟踪字段表**与**中文措辞**：同一件事在两种数据里说法不同 |
| 链校验 + 一致性校验（`verifyStore`）与上限 | **「消失」的判据**：deals 靠采集器来源健康；plans 没有采集器（§8） |
| 事件身份（`eventKey`）、排序、观测态裁剪 | **数组语义**：deals 的 `features` 是整体；plans 的 `supportedModels` 按元素做集合差 |
| 日志读写、基线构造、有界渲染视图、统计 | **雷达分栏**：deals 有「即将结束」（依赖 `expiresAt`），套餐没有绝对到期日 |

`plan-history-selftest` 有一条**静态扫描**钉住这条边界：内核里不许出现任何一方的专有字段 / 事件类型；
两个领域层里同名的机制函数都必须是「转手调 `core.*`」的薄包装，不许自己再实现一份。

---

## 3. 事件结构

```json
{
  "planId": "154d2607b8ff",
  "eventId": "3c1d9f0a7b21",
  "at": "2026-10-01",
  "type": "price_changed",
  "field": "billing.regularPrice",
  "from": 99,
  "to": 68,
  "origin": "observed",
  "runAt": "2026-10-01T05:41:17.000Z"
}
```

| 键 | 规则 |
|---|---|
| `planId` | `plans.json` 里的 `id`（12 位小写 hex）。**事件上的键名是 `planId`**，数据记录上是 `id` —— 内核用 `recordKey`/`eventKeyName` 区分，不许混用 |
| `eventId` | **派生字段**（§6）：`verifyStore` 重算并逐条比对，手写必红 |
| `at` | `YYYY-MM-DD`，取 `plans.json` 的 `updatedAt`（= 全部 `lastSeen` 的最大值）前 10 位。**不读墙上时钟** |
| `type` | §4 的 17 类之一；生命周期事件（created/ended/restored）不带 `field`/`from`/`to` |
| `field` | §5 的跟踪字段；`created` 带 `fields`（快照，同时是锚点） |
| `from` / `to` | 「上一状态」与「这一状态」的值。数组字段与模型事件的取值见 §7 |
| `origin` | `observed` / `derived`（plans 目前全是 `observed`：没有由本站规则推导的套餐字段） |
| `runAt` | 本次运行的 ISO 时间戳（精度审计用，不参与任何判据） |

**对题面示例键名的有意偏差（登记）**：题面 §四 写的是 `date` / `before` / `after`。
这里用 `at` / `from` / `to`，因为它们与 v1.4 的优惠日志**逐字一致** —— 两份日志共用同一个内核与同一套
校验，键名不同会让每一处机制都要分叉。`planId` 则按题面命名（内核支持事件键名与记录键名不同）。

**可选键**：`ended` 可带 `reason`（必填）、`firstMissedAt`、`label{title,vendor}`（墓碑快照，
离开数据集后仍能回答「这条是谁」）；`created` 可带 `supersedes`（§8 R4）。

---

## 4. 事件类型（17 类）

| 类别 | 类型 |
|---|---|
| 生命周期 | `created` · `ended` · `restored` |
| 价格 | `price_changed` · `promo_started` · `promo_ended` · `promo_changed` · `billing_changed` |
| 额度 | `quota_increased` · `quota_decreased` · `quota_changed` |
| 模型 | `model_added` · `model_removed` · `model_changed` |
| 其它字段 | `restriction_changed` · `availability_changed` |
| 记录级元信息 | `updated`（低价值：不进「最近变化」块、不进订阅源） |

题面 §二 点名的 11 类全部保留；另外 6 类是 schema 逼出来的，逐条理由：

- `promo_changed`：活动价换挡（9.9 → 19.9）既不是开始也不是结束；
- `quota_changed`：额度类型 / 周期变化，或数值 ↔ `null` —— 不能谎称「增加/减少」；
- `model_changed`：同名模型的 `role` 或 `note` 变了，不是增删；
- `availability_changed`：题面 §三 点名的 `availability`，在 `plans.json` 里由 `region` 承担；
- `billing_changed`：币种变了（真值层不做汇率，但币种换了就是换了）；
- `updated`：官方定价页 / 来源类型 / 来源地址这类记录级元信息，与 deals 的 `updated` 同名同义。

---

## 5. `meaningfulPlanFields`（唯一真值表）

| 字段 | 事件类型 | 规则 |
|---|---|---|
| `billing.regularPrice` | `price_changed` | 数值比较（方向由视图层按 `from`/`to` 判，类型里不带判断） |
| `billing.promoPrice` | `promo_started` / `promo_ended` / `promo_changed` | `null → 值` / `值 → null` / `值 → 另一值` |
| `billing.currency` | `billing_changed` | 同上 |
| `quota.type` | `quota_changed` | 口径变化（credits → requests 等） |
| `quota.amount` | `quota_increased` / `quota_decreased` / `quota_changed` | 两个数字比大小；数字 ↔ `null`，或**同一次 `quota.type` 也变了** ⇒ `quota_changed`（跨量纲比大小是假精确） |
| `quota.period` | `quota_changed` | 刷新周期变化（与 `billing.period` 是两件事） |
| `quota.description` | `quota_changed` | **带投影**（见下） |
| `supportedModels` | `model_added` / `model_removed` / `model_changed` | 按归一化模型名做**集合差**（顺序无关，§7） |
| `restrictions` | `restriction_changed` | 数组整体（已按 kind 规范序）；视图层展示「新增/移除/变更」分量 |
| `region` | `availability_changed` | 销售地区 |
| `officialUrl` / `source` / `sourceUrl` | `updated` | 记录级元信息（低价值） |

### 5.1 `quota.description` 的**投影**

`quota.description` 只在「额度语义全在文字里」的类型上**才**是被跟踪的额度口径：
`rate_limited` / `unlimited_fair_use` / `other` 返回原文；量化型（`tokens` / `credits` /
`requests` / `messages` / `compute_units`）返回 `null`（= 不跟踪）。

理由：题面 §三 明确要求「不因为 description 文案产生变化事件」，而量化型套餐的 `quota.description`
是解释性散文（额度数值本身由 `quota.amount` 跟踪）。投影是**同一个函数**同时用在基线、事件与一致性
校验三处，所以三者不可能分家。

### 5.2 明确**不**跟踪的字段与理由

| 字段 | 理由 |
|---|---|
| `id` / `kind` / `provider` / `planName` / `billing.period` | 身份的一部分（`id = sha1(kind\|provider\|planNameKey\|period)`）：变了就是另一条记录 ⇒ `ended` + `created` |
| `firstSeen` | 簿记，由 `created` 回答 |
| `lastSeen` | 人工每次回访官方页都会刷新（把 9 条刷成同一天）—— 记它等于每轮造 9 条假事件 |
| `verified` / `verifiedAt` | 核验是**我们**的动作，不是套餐的变化 |
| `billing.note` / `billing.promoNote` | 自由文本备注（题面 §三点名：备注标点不算变化） |
| `evidence` | 每条引文都可能被重新抄一遍，抄写差异不是套餐变化 |
| `derivedMetrics` | **派生值**：它的输入（`billing` / `quota`）变了自然有对应事件，再记一条就是同一件事报两次 |

---

## 6. Stable event ID

```
eventId = sha1(planId | type | field | at | stableJson(from) | stableJson(to) | reason
              | created ? stableJson(fields) : '' | ended ? firstMissedAt : '' | created ? supersedes : '')
          .slice(0, 12)
```

- 12 位小写 hex，**派生**：`verifyStore` 重算并逐条比对（与 `plan.id` / `derivedMetrics` 同一条纪律）。
- 「同一真实变化重复运行不重复产生事件」由**两道**保证：
  ① 链校验（重放出的当前值 == 事件的 `to` ⇒ 跳过）；
  ② `seen` 集合按内核的 `eventKey` 幂等。
- `eventId` 同时是套餐变化订阅源的 `<guid isPermaLink="false">` —— 页面、日志与订阅源上「同一件事」
  只有一个身份。

---

## 7. 变更检测

1. **数组顺序不误报**：`supportedModels` 按归一化名（NFKC + 折叠空白 + 小写）建 Map 做集合差，
   完全不依赖顺序；`restrictions` 按 `kind` 建 Map 后同样与顺序无关。
   （`plans.json` 在重建期已经做了规范排序，所以顺序在数据层也不存在。）
2. **值决定类型**：活动价看 `null` 分型、额度数值看大小分型（跨量纲除外）、模型清单按元素分型。
3. **文案归一**：`quota.description`、模型 `note`、限制条件 `note` 的**空白与标点**差异不算变化
   （NFKC → 去掉空白类与标点类字符 → 逐字比较）。刻意**不**做相似度比较：文字本身
   （含数字、字母、`≥` / `+` / `%` 这类符号）差一个字符就是差一个语义，照样记事件。
4. **元素级重放**：`supportedModels` 的事件是**按元素**记的，所以 `plans.json` 侧的重放
   （`profile.applyEvent`）做的是「改清单里的那一个元素」，而不是把整份清单换成那一个模型对象。
   内核的重放与链校验共用这一个函数。
5. **单次额度类型变化**：`quota.type` 变了时，`quota.amount` 的事件类型降级为 `quota_changed`
   （不跨量纲比大小），但**事件照样记** —— 一致性校验要求每个被跟踪字段的差异都有事件，
   少记一条会让「基线 + 事件重放 == 当前数据」当场失效。

---

## 8. 退出保护（R1–R6）

plans **没有联网采集器**，所以**不复用** `source-health.json` 的连续失败计数（那是 deals 采集器的心跳）。
替代规则：

| 规则 | 内容 |
|---|---|
| **R1 唯一写入点** | 只有 `rebuild-plans.js` 成功写盘时写日志；人工来源层有硬问题（未登记 provider / 引文不合规 / 前缀非法…）或 `--dry-run` ⇒ 数据与日志都不动。**坏输入进不了写盘路径 ⇒ 不可能「采集器坏了 → 全部套餐下线」** |
| **R2 缺席确认** | 连续 `PLAN_MISS_CONFIRM_RUNS = 2` 次成功运行都未见，才记 `ended(source_no_longer_lists)`，事件带 `firstMissedAt`。每次成功写盘都推进计数（包括「数据没变」的那次） |
| **R3 批量熔断** | 单次运行缺席数 `>= max(3, ⌈已知总数 × 0.5⌉)`，或本次输出为空 ⇒ 不推进计数、不记 `ended`，只在 `anomalies[]` 留档（`{at, kind:'mass_missing', missing, known, planIds}`），观测态标 `blockedAt`。确属真实批量下架必须显式 `--allow-mass-removal`（此时记 `ended(withdrawn)`，reason 不声称「连续多次未见」） |
| **R4 周期重键** | 同一次运行里出现同 `(kind, provider, planNameKey)`、`billing.period` 不同的新记录 ⇒ 对旧记录**立即**记 `ended(period_changed)`（不等确认），新记录的 `created` 带 `supersedes: <旧 planId>`。这样「月付改年付」不会被读成两件互不相干的事 |
| **R5 fail-closed** | `plans.json` 缺失 / 损坏 / 数据集级校验失败 ⇒ `check:plan-history` 直接红，写入路径拒绝写 |
| **R6 已知限制** | 确认期为两次运行 ⇒ 人工删掉一条套餐后，数据里立刻没有它，而日志要到**下一次**成功重建才记 `ended`。这个中间态由 `check:plan-history` 的 notice 与 `rebuild-plans.js`/`report:plan-changes` 的「待确认」清单点名 |

**时间单调性**：若某条套餐的新变化日期**早于**它上一条事件的日期，写入路径**拒绝写盘并报错**
（「请先把这个套餐的 lastSeen 更新到核对当天」）—— 绝不把日期倒填进日志。

**观测期未满**（`misses < PLAN_MISS_CONFIRM_RUNS` 且未 `ended`，或带 `blockedAt`）是**合法中间态**：
`verifyStore` 的「已从数据里消失却没有 ended」判定对这一种状态放行，deals 侧永远走不到这条分支
（它的观测态只记「仍在数据集里、但来源本轮没列出」的条目）。

---

## 9. 顶层形状、上限与写入点

```json
{
  "schemaVersion": 1,
  "startedAt": "2026-10-01",
  "baseline": { "at": "2026-10-01", "note": "…不是创建事件…", "fields": { "<planId>": { … } } },
  "absence": { "<planId>": { "misses": 1, "since": "2026-10-05", "endedAt": null } },
  "anomalies": [],
  "events": []
}
```

- 键序固定如上；2 空格缩进；末尾一个换行（与 `deals.json` / `plans.json` 同一套写法）。
- `baseline.at` / `startedAt` = `plans.json` 的 `updatedAt` 前 10 位（**数据日期**，不是墙上时钟）；
  一次生成、**拒绝重跑**（`npm run baseline:plan-history`）。
- **不伪造历史**：存量 9 条只有一份基线，一条 `created` 都不补。
- 上限：`eventsPerPlan = 200` · `eventsTotal = 20000` · `fileBytes = 1 MB`（超限**门禁红，不自动截断**）。
- 有界渲染：`RENDER_LIMIT = 20`（注入视图的上界）；时间线展示最近 10 条 + 「另有 N 条更早的记录未在此显示」。
- 写入点只有一个：`scripts/tools/rebuild-plans.js`（先写 `plans.json`、再写 `plan-history.json`）。
- **发布**：`dist/plan-history.json` 与源逐字节相同（构建期断言）。
  `dist/plans.json` 仍与源逐字节相同 —— 套餐历史**不注入** `plans.json`。

---

## 10. 视图（`lib/plan-changes.js`）

`buildPlanRadar({ plans, store, asOf, availability, limits })` → 纯函数，不读盘 / 不联网 / 不看时钟。

| 项 | 值 |
|---|---|
| 分栏 | `created`（基准日当天首次收录）· `changed`（最近 7 天：价格 / 活动价 / 额度 / 模型 / 限制 / 地区 + 过去 6 天内的新增）· `ended` · `restored`（各 30 天窗口） |
| `other.metadata` | `updated` 类事件：只在各条套餐的时间线里出现，**不进**「最近变化」块与订阅源 |
| 上限 | 每栏 30 行（超出只报条数，不删数据）· 「最近变化」块 5 项（按 `PLAN_HOME_PRIORITY` 取） |
| 排序 | 时间倒序，平局按 `planId` / `type` / `field` 收敛（两次构建字节相同） |
| 空态 | 「当前没有观测到套餐变化」与「没有拿到套餐变更日志」是**两句不同的话** |

---

## 11. 页面与订阅源

| 位置 | 内容 | 关键约束 |
|---|---|---|
| `/plans/coding/` | 表格**之前**的「最近变化」块（`#plan-changes`，5 条 + 起算日 + 「全部变化 →」） | 必须放在 `#plans-compare` **之外**（那个容器的 innerHTML 会被 `plans-compare.js` 整块替换）；块内零交互控件 |
| `/plans/coding/` | 每个数据行 `id="plan-<planId>"`（与 `data-item` 同标签） | 订阅源与「最近变化」的深链落点 |
| `/plans/coding/` 行内详情 | 「变更记录（N 条）」时间线（最近 10 条 + 「另有 N 条更早」） | `<template>` 惰性：无 JS 时一个字节都不渲染 |
| `/changes/` | 顶部锚点导航（`#deals` / `#plans`）+ 表格后追加「套餐变化」四栏（各 30 行上限） | **不新做一页**；deals 的 `ItemList` 保持「只收有独立详情页的条目」不变 |
| `/feed/plans/coding/changes.xml|.json` | `kind: 'plan-changes'` 的变化源 | `<guid>` = `eventId`；`<link>` = `/plans/coding/#plan-<planId>`；记录级元信息不进订阅 |

页面声明：套餐对比页在既有两个根 Feed 之外**追加声明**套餐变化源（`rel="alternate"` 两枚），
`/changes/` 同时声明优惠变化源与套餐变化源。`/feeds/` 页新增「套餐」分组。

---

## 12. 门禁接入

| 步骤 | 脚本 | 问什么 |
|---|---|---|
| `Plan-history self-test` | `selftest:plan-history` | 只记重要字段 / 数组顺序不误报 / 值决定类型 / Stable event ID / R2–R4 / 日期倒填被拒 / 链与上限必红 / 机制只有一份实现 |
| `Plan-history verify (log consistent with plans.json)` | `check:plan-history` | 形状 + 链 + 「基线+事件重放 == 当前 plans.json」+ 上限；并把「待确认缺席」与「批量熔断留档」列为 notice |

- 门禁步骤 **29 → 31**（`GATE_STEP_NAMES` 与 `.github/actions/gate/action.yml` 同索引同步）；
- `FROZEN_ASSERTION_NAMES` 不变 ⇒ `--expect-checks=35` **不变**；
- 页面 / 订阅 / 产物级别的对账挂在既有的构建期自检与真浏览器验收里（不新增第三个页面级步骤）。

## 13. 本阶段**不做**的

综合推荐 / 星级评分 / benchmark / API plan（2.5）/ Deals↔Plans 关联（2.4）/ 独立套餐详情页 /
`/plans/<id>/` / 平台页 / 汇率 / 自动采集套餐 / 把套餐变化混进优惠的变化流。
