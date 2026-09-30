# SCHEMA v1.4 — 优惠历史（deal history）

> 2026-09-30 · 分支 `v1.4-deal-history` · 唯一运行时代码 `scripts/lib/history.js`
> 状态文档 [`PROJECT_STATUS.md`](../PROJECT_STATUS.md) §2.35 · 完成报告 [`research/v1.4-deal-history-report.md`](../research/v1.4-deal-history-report.md)

本文件是这一层的**契约**：存什么、不存什么、什么算「一个重要变化」、边界在哪、门禁在哪。
实现与契约分家时以本文件为准（改动必须同时改这里与 `history-selftest` 的夹具）。

---

## 一、四方案比较与选择（决策记录）

目标：回答六个问题 —— 首次发现 / 免费额度变化 / 新增截止日期 / 领取条件变化 / 从官方页消失 / 消失后重现。

| 维度 | A 完整每日快照 | B git diff 推导 | C 显式 change event | **D 混合（选定）** |
|---|---|---|---|---|
| GitHub Pages | 需为每份快照额外生成/托管文件，产物膨胀 | 运行时拿不到（Pages 无 git CLI） | 事件随产物发布，直接可读 | 同 C，零额外托管 |
| 静态站 | 可行但笨重 | 必须 `fetch-depth: 0`，把发布链绑死在 git 完整性上 | 一个追加小文件 | 同 C |
| 长期维护 | 无语义，每个消费者自己 diff | 隐含依赖「提交纪律 + 历史永不被重写」；本仓已重写过历史（`backup-pre-rewrite`） | 一处写入、一份 schema、一套门禁 | 同 C，且门禁能自证 |
| 仓库体积 | `deals.json` 236 KB × 2/天 ≈ **170 MB/年** | 0 | 只记变化（KB/年量级） | 同 C + 一次性基线 **86.7 KB** |
| 可重建性 | 事实完整、语义靠读时推导 | 派生自 VCS；规则改动会被误当成优惠变化 | 基线 + 事件可完整重放 | **基线 + 事件重放 == 当前状态，机器可验** |
| 数据可信度 | 高，但无法区分「来源变了」与「我们的规则变了」 | 低（提交时间 ≠ 观测时间，混合管线噪声） | 高（带 reason / origin，可审计） | 最高：C 为主体 + B 作离线交叉校验 |

**选择 D，具体形状**：

1. **C 是唯一运行时存储**：`scripts/data/deal-history.json`。站点与 v1.5 都读它。
2. **一次性值基线**（不是每日快照）：冻结 v1.4 开工时**被跟踪字段**的既有值，使命中
   「基线 + 事件 ⇒ 当前状态」可被机器重放验证。实测 86.7 KB（134 条 / 1438 个字段值），一次性。
   *为什么是值而不是摘要*：实测两者的 JSON 体积几乎相同（key 脚手架占大头），而值基线还能人读、能审计。
3. **B 降级为离线审计工具** `scripts/tools/history-audit.js`（`npm run history:audit`）：
   用 `git log -p -- deals.json` 反推字段变化日期与事件日志对账。**刻意不进 CI**：
   CI 默认浅克隆，且本仓有过历史重写 —— 它只配当交叉证据，不配当发布闸门。

**为什么不选纯 C**：没有锚点时「日志与当前状态一致」不可验证 —— 日志被手改不会有任何东西变红。

---

## 二、存储契约（`scripts/data/deal-history.json`）

```jsonc
{
  "schemaVersion": 1,
  "startedAt": "2026-09-30",                 // 历史起算日；页面据此说「自 … 起」
  "baseline": {
    "at": "2026-09-30",
    "note": "v1.4 开工时的既有状态快照（只含被跟踪字段）。它不是创建事件……",
    "fields": { "<id12hex>": { "discountInfo": "…", "pricingModel": "free", "…": "…" } }
  },
  "absence": {                               // 观测状态机（内部态，不渲染成事实）
    "<id12hex>": { "source": "Futuretools", "misses": 2, "since": "2026-09-29", "endedAt": "2026-09-30" }
  },
  "events": [ … ]                            // 追加式；写入点只有一个
}
```

**没有 `updatedAt`**：一次什么都没发生的采集必须让文件**字节不变**（diff 里只剩真变化）。
**写入点只有一个**：`scripts/collect.js` 在 `mergeAll` 之后、与 `writeDeals` 同批调用 `history.record()`。

### 事件

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | `12hex` | 记录 id（`sha1(lower(vendor)\|lower(title)\|lower(url))` 前 12 位） |
| `at` | `YYYY-MM-DD` | 北京时间日期（与本项目一切时间口径一致） |
| `type` | 枚举 | 见下 |
| `field` | 跟踪字段或 `null` | 生命周期事件为 `null` |
| `from` / `to` | 任意 JSON | 字段事件必带；`null` 表示「无值」 |
| `origin` | `observed` \| `derived` | `derived` = 值由本站规则推导（如 `expiresAt` 由文案抽取、`type` 由重分类） |
| `reason` | 枚举 | 仅 `ended`：见下 |
| `firstMissedAt` | 日期 | 仅 `ended(source_no_longer_lists)`：第一次没见到的日期 |
| `runAt` | ISO | 本次采集运行的时间戳（精度审计用） |
| `fields` | 对象 | 仅 `created`：这条记录的**初始值**，同时充当它的链锚点 |
| `label` | `{title, vendor?}` | **v1.5 起的可选扩展**：仅 `ended`，记录离开数据集时的标题/厂商**快照**（墓碑）。它不是被跟踪的值 —— 不参与链校验与重放，只回答「这条是谁」。缺席完全合法（向后兼容）；形状规则见 [`SCHEMA-v1.5.md`](SCHEMA-v1.5.md) §六。 |

事件类型（与需求逐字一致）：
`created` · `updated` · `benefit_changed` · `eligibility_changed` · `expiry_changed` · `ended` · `restored`

`ended.reason`：`source_no_longer_lists` · `pruned_expired` · `pruned_overflow` · `retired_garbage` · `withdrawn`

### 上限（超限 = 门禁红，**绝不自动截断**）

| 项 | 上限 | 当前实测 |
|---|---|---|
| 事件总数 | 20000 | 0（起算日） |
| 单条记录事件数 | 200 | 0 |
| 文件体积 | 1 MiB | 86.7 KB（几乎全是基线） |
| 每条注入产物的条数 | 20（`RENDER_LIMIT`） | — |
| 观测态保留窗口 | 离开数据集且已 ended 超过 365 天后丢弃 | — |

压缩/折叠（保留最早 `at` 的前提下把旧事件折成摘要）**本阶段明确不做**，列为后续独立议题：
先让触顶变红，让人看见增长，而不是悄悄丢历史。

---

## 三、什么算「一个重要变化」

### 跟踪字段（唯一真值表在 `history.js` 的 `FIELD_EVENT`）

| 事件类型 | 字段 |
|---|---|
| `benefit_changed` | `discountInfo` `pricingModel` `priceLine` `features` `benefitType` |
| `eligibility_changed` | `eligibility` `eligibilityDetail` `claimRequirements` `audience` `availability` |
| `expiry_changed` | `expiresAt` `validity` |
| `updated` | `type` `category` `region` `source` `sourceUrl` `evidence` `verified` `verifiedAt` |
| 生命周期 | `created` / `ended` / `restored` |

三种形态都记：`null→值`（例如「新增截止日期」）、`值→null`、`值→值`。

### 明确**不**跟踪（`UNTRACKED_FIELDS`，附理由；自测有专门的噪音夹具）

| 字段 | 理由 |
|---|---|
| `description` | **普通文案微调** —— 本阶段点名要避免的噪音源 |
| `lastSeen` | 每轮采集都刷新（策展条目每轮刷成今天），记它等于每天造 32 条假事件 |
| `firstSeen` | 由 `created` 事件回答；它是簿记，不是变化 |
| `id` / `title` / `vendor` / `url` | 是**身份**的一部分：它们变了就是另一条记录 ⇒ `ended` + `created` |
| `zh` | 人工译文是展示层覆盖，不是优惠本身 |
| `needs` / `collections` / `sourceFacts` / `history` | 构建期派生字段，源数据里不存在 |

---

## 四、`ended` 的两种含义（页面上必须分开说）

| reason | 触发 | 记录还在站内吗 |
|---|---|---|
| `source_no_longer_lists` | 来源**本轮健康且确实跑出条目**，但连续 `MISS_CONFIRM_RUNS = 2` 次没见到它 | 在（`deals.json` 是累积的） |
| `pruned_expired` / `pruned_overflow` / `retired_garbage` | 记录离开数据集（原因直接取 `mergeAll` 手里的对象，不重写规则） | 不在 |
| `withdrawn` | 其它移除路径（保留位） | 不在 |

**不误报的三道闸**：

1. 来源本轮失败 / 骤降 / 零产出 / 上一轮遗留（`stale`）→ 该来源**不参与**「未见」计数；
2. `--only` 子集运行、`--dry-run`、以及被硬拦（译文不合规、零产出）的运行**完全不写历史**；
3. 人工策展条目（`Curated` / `Curated-CN`）不参与「未见」判定 —— 它们不经过采集器。

**如实记录的边界**：人工策展条目没有自动的「来源消失 / 人工移除」信号。它们的生命周期事件只在
记录离开数据集时产生（实际极少）。这是本阶段明确写下的边界，不是遗漏。

---

## 五、缺失与诚实性红线

- 存量 134 条在 v1.4 之前没有历史：只有一份 `baseline`（明确标注「不是创建事件」），**一条 `created` 都不补**；
  页面必须说「变更记录自 2026-09-30 起（此前状态没有记录）」。
- 没有事件时明说「暂无变更记录」——**不用空白冒充「没有变化」**。
- 「不再收录」只说本站**未再观测到**，绝不说成厂商下架 / 优惠失效（`HISTORY_NOTES.disclaimer`）。
- 不出现「已核验 / 100% 有效 / 永久有效」这类本站自发的结论（构建自检与真浏览器断言各扫一遍）。
- 值一律原文展示：长值换行、不截断成半句话。

---

## 六、门禁

| 门禁 | 问什么 | 在哪 |
|---|---|---|
| `selftest:history`（CI） | 规则本身：噪音抑制 / 锚点 / 链 / 生命周期 / 不误报 / 幂等 / 上限 | `scripts/tools/history-selftest.js` |
| `check:history`（CI） | 真实数据：形状 + 链连续 + **基线&事件重放 == 当前 `deals.json`** + 生命周期成对 + 上限 | `scripts/tools/history-verify.js` |
| 产物自检（CI 内 build 步骤） | 源数据无 `history` / 注入逐字节等于日志 / 措辞与后端同源 / 空历史明说 | `scripts/tools/build-local.js` |
| 真浏览器断言（CI） | 详情页与弹层真的显示变更与空态、静态（无 JS）也能读到、390/360 无溢出 | `scripts/tools/verify-site.js` §15a3 |
| `history:audit`（**不进 CI**） | 换一把尺子：日志里的变化在 git 里也发生过 | `scripts/tools/history-audit.js` |

`--expect-checks`（verify.yml 的带外项数）**不变**：新增的是门禁 action 的步骤，不是
`check-ci-consistency.js` 自己的断言；冻结序列 `GATE_STEP_NAMES` 已同步加了两步。

---

## 七、明确不做（本阶段）

首页「变化雷达」、变更率统计、任何新排序/筛选维度、通知与订阅；每日全量快照；官方页 HTML/全文/
截图/原始响应留存；存量历史回填；历史折叠/压缩工具；采集器与 v1.1/v1.3 数据契约的任何改动。

> **v1.5 更新**：其中的「首页变化雷达」已由 [`SCHEMA-v1.5.md`](SCHEMA-v1.5.md) 实现
> （首页一行条带 + `/changes/` 静态页），并把本文件的 `ended` 事件扩展了一个可选 `label`
> 字段（向后兼容）。本文件其余各节仍然有效，**没有任何一条被 v1.5 推翻**：
> 写入点仍只有 `scripts/collect.js` 一处，跟踪字段表、上限、`ended` 的两种含义、
> 不补造历史的红线都不变。
