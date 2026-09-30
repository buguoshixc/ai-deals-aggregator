# SCHEMA v1.5 — 变化雷达（change radar）

> 2026-09-30 · 分支 `v1.5-change-radar` · 唯一判据实现 `scripts/lib/changes.js`
> 上游契约 [`SCHEMA-v1.4.md`](SCHEMA-v1.4.md)（变更日志）· 状态 [`PROJECT_STATUS.md`](../PROJECT_STATUS.md) §2.36
> 完成报告 [`research/v1.5-change-radar-report.md`](../research/v1.5-change-radar-report.md)

本文件是这一层的**契约**：分栏怎么定义、窗口多长、什么算「高价值」、什么只是「文案改写」、
空与不可用怎么分开说、上限在哪、页面与门禁各是什么。实现与契约分家时以本文件为准，
改动必须同时改这里与 `changes-selftest` 的夹具。

---

## 一、这一层是什么，不是什么

**是**：v1.4 变更日志（`scripts/data/deal-history.json`）与当前数据（`deals.json`）的**读视图**。
在构建期算一次，产出首页的一行条带与一页 `/changes/`。

**不是**：

1. **不是第二份存储**。这一层不写任何数据文件、不改历史日志、不改 `deals.json`。
   写入点仍然只有 `scripts/collect.js` 一处（v1.4 的纪律原样保留）。
2. **不是 `dist/deals.json` 的新字段**。产物顶层键与源文件保持一致（`schemaVersion` /
   `updatedAt` / `count` / `deals`）—— 条带与页面都是静态的，浏览器不需要多拿一份。
   判据结果只活在构建期的内存里，落到两个 HTML 上。
3. **不是 LLM 生成的摘要**。没有任何模型调用、没有相似度近似、没有文本改写：
   分栏、标签、原值/新值全部是数据的搬运（`changes-selftest` 有一条静态扫描守着：
   这个文件里不许出现 `require(...)`、`Date.now`、`process.env`、网络调用）。
4. **不是新的排序或筛选维度**。首页网格的排序/筛选一个字没动。

---

## 二、分栏与窗口

基准日 `asOf` = `deals.json` 的 `updatedAt` 的日期部分（北京时间），**不是构建时刻** ——
理由有两条：与卡片上的「数据更新」同一口径（页面上不会出现「基准日比数据还新」）；
同一天两次构建的产物逐字节相同（构建确定性）。

| 分栏 | 取什么 | 窗口 |
|---|---|---|
| 今日新增 `created` | `created` 事件且 `at === asOf` | 当天 |
| 最近 7 天变化 `changed` | `benefit_changed` / `eligibility_changed` / `expiry_changed`，**以及** `at ∈ [asOf−6, asOf−1]` 的 `created`（标「首次收录」） | 7 天 |
| 即将结束 `endingSoon` | **状态量**：`type === 'deal'`、未过期、`daysLeft ∈ [0, 7]`（`daysLeft` 按 `asOf` 算） | 前瞻 7 天 |
| 已结束 `ended` | `ended` 事件（任意 `reason`） | 30 天 |
| 重新出现 `restored` | `restored` 事件 | 30 天 |
| 其他变化 `other` | `updated` 类字段事件（元信息）+ 文案微调 | 7 天 |

**三条窗口边界是契约**（都有自测）：

- `created` 落在 `asOf−6` 仍在「最近 7 天变化」里；落在 `asOf−7` **不再出现**（有界，不是丢失）。
- 字段变化的窗口与 `created` 同一把尺子。
- `ended` / `restored` 落在 `asOf−29` 仍在窗口内、`asOf−30` 不再出现；更早的记录仍留在
  该条目自己的「变更记录」里（v1.4 的层）。

**「即将结束」是状态量，不是事件**：它由 `deals.json` 的 `expiresAt` 现算，不对应日志里的
任何一条事件，因此**不参与覆盖不变量**（把它算进去会让那条等式永远差几条 —— 这是演练抓出来的）。
覆盖率口径同时如实上报：`coverage.dealsWithExpiresAt / coverage.dealsTotal`。

**覆盖不变量**（构建自检 + 自测都有）：7 天窗口内的每一条事件，必须**恰好出现在一处** ——
`created` / `changed` / `ended` / `restored` / `other`（文案微调或元信息）之一；
`ended` / `restored` 在 30 天窗口但不在 7 天窗口的，出现在各自分栏里。
「恰好一处」由事件三元组 `(id, at, type, field)` 去重校验。

---

## 三、什么算「高价值」

**高价值**（进分栏、有机会上首页）：

| 事件类型 | 字段 |
|---|---|
| `created` | —（生命周期） |
| `benefit_changed` | `discountInfo` `pricingModel` `priceLine` `features` `benefitType` |
| `eligibility_changed` | `eligibility` `eligibilityDetail` `claimRequirements` `audience` `availability` |
| `expiry_changed` | `expiresAt` `validity` |
| `ended` / `restored` | —（生命周期） |

**不是高价值**（只在 `/changes/` 的「不计入高价值的其他变化」折叠块里，**永不上首页**）：

| 类别 | 内容 | 为什么 |
|---|---|---|
| 元信息 | `updated` 类：`type` `category` `region` `source` `sourceUrl` `evidence` `verified` `verifiedAt` | 它们改的是**记录**的分类/出处/核验声明，不改变优惠本身 |
| 文案微调 | 自由文本字段（`discountInfo` `eligibility` `validity` `priceLine`）的 from/to 在**文案归一**后相同 | 只改了空白与写法 —— 本轮点名要避免的噪音源 |

**文案归一**（`cosmeticText`，唯一实现）：去零宽字符（U+200B–U+200D、U+FEFF）、
全角空格 U+3000 → 半角、连续空白折叠成一个、trim。
**只对字符串生效**；数组、对象、日期、枚举一律不算「微调」——
`expiresAt` 差一个字符就是差一个语义（自测里有一条 `pricingModel` / `expiresAt` 的反例）。

v1.4 层还有两道更前面的闸（原样保留）：`description` / `lastSeen` / `firstSeen` / `zh` /
`id` / `title` / `vendor` / `url` 根本不被跟踪，所以「改一段描述」在日志里连事件都不会产生。

**首页条带的取用优先级**（桶内按时间倒序，最多 3 项）：
`created → ended → restored → benefit_changed → expiry_changed → eligibility_changed → endingSoon`。
理由：新东西是最强的回访理由；「不再收录」会让之前看过的优惠消失，排第二。

**已结束/重新出现的墓碑标签**：`ended` 可带可选 `label:{title,vendor}`（v1.5 对 v1.4 事件结构的
**向后兼容扩展**，见 §六）。标题解析顺序：`deals.json` 的 `title` → `ended.label.title` → 无。
解析不到就如实渲染「已移除的记录（无标题快照）」，不拿 id 之外的任何东西去凑。

---

## 四、链接与死链

- 只有 `type === 'deal'` 的记录才有静态详情页（构建期 `writeDetailPages` 只给它们出页），
  因此**只有**这类记录在雷达上带链接；工具条目与已离开数据集的条目只显示文本。
- 每条雷达行都带 `data-deal-id`，页面上每一条内部链接在构建自检里逐条对账
  （页面链接集合 == 可链接条目集合，双向）。
- `ItemList` 结构化数据只收**真有详情页**的条目：给不存在的 URL 发结构化数据等于在
  JSON-LD 里造死链。

---

## 五、措辞、空态与「不可用」

措辞表 `CHANGES_WORDING` 的唯一权威在 `scripts/lib/changes.js`；
`index.html` 的 `AUDIENCE:START/END` 块里有一份**受控副本**，由构建自检逐项比对
（`validate --strict` 的 `checkWordingContract` 另要求它存在且是可解析的 JSON 字面量）。
**事件类型 / 字段名 / 结束原因 / 免责句不在这张表里** —— 它们直接复用
`history.HISTORY_WORDING`：同一件事在详情页的「变更记录」与雷达上必须是同一个词。

**空态按原因分写**（不许合成一句「暂无」）：

| 情形 | 页面说 |
|---|---|
| 今天没有新增 | 截至基准日，没有观测到首次收录的条目。 |
| 7 天内没有内容/期限变化 | 最近 7 天内没有观测到优惠内容、领取条件或有效期的变化。 |
| 一条都没写绝对截止日期（`dealsWithExpiresAt === 0`） | 当前收录的条目里没有一条写有绝对截止日期，因此这一栏暂时为空。 |
| 有 N 条写了，但都不在 7 天内 | 有 {n} 条写有截止日期，但没有一条在 {days} 天内到期。 |
| 没有 ended / restored | 自起算日起，没有观测到不再收录的条目。 / 没有观测到重新出现的条目。 |
| **日志缺失或损坏** | 本次构建没有拿到历史日志（deal-history.json 缺失或损坏），因此无法显示变化记录 —— 这不表示「没有变化」。 |

**「没有变化」与「不可用」是两句不同的话**：前者是事实，后者是缺失。构建自检会直接调用
渲染函数，用一份 `availability: 'unavailable'` 的合成 radar 断言这两句没有互相冒充。

---

## 六、v1.4 事件结构的向后兼容扩展

`ended` 事件新增**可选**字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `label` | `{ title: string, vendor?: string }` | 记录**离开数据集**（或来源不再列出）时的标题/厂商**快照**。它不是被跟踪的值：不参与链校验、不参与重放，只回答「这条是谁」。 |

规则：

- 只有 `ended` 可以带 `label`；字段事件与其他生命周期事件带 `label` → `check:history` 必红。
- `title` 必须是非空字符串；`vendor` 缺省或字符串；不允许未知键。
- 写入点仍是 `scripts/collect.js`（`history.record` 的 `params.labels`，来源是**上一份发布**）。
- **缺席完全合法**：v1.4 写下的、没有标签的 `ended` 与本次扩展向后兼容（交付时事件为 0 条，无需迁移）。

页面上的措辞边界不变（v1.4 的红线）：`source_no_longer_lists` 只说「来源不再列出（连续多次成功
采集未见）」，不说「厂商已下架 / 优惠已失效」；分栏标题用「已结束」，但每行写的是**精确原因**，
块尾固定免责句（直接复用 `HISTORY_NOTES.disclaimer`）。

---

## 七、上限

| 项 | 上限 | 行为 |
|---|---|---|
| 每个分栏渲染行数 | 30 | 超出只显示「另有 N 条未显示」，**不删数据** |
| 首页条带 | 3 项 | 按 §三 的优先级取 |
| 折叠块（其他变化） | 30 + 30 | 同上 |
| `ItemList` | 50 | 结构化数据只取前 50 条 |

窗口本身也是上限：超过 7 天的 created/字段事件、超过 30 天的 ended/restored 不再出现在雷达上
（仍在各自条目的「变更记录」里）。**超限不改数据、只是显示有界**。

---

## 八、页面与路由

| 位置 | 内容 | 约定 |
|---|---|---|
| 首页 `<!--PRERENDER:changes-->` | 一行条带：`变化雷达` + 正文区（≤3 项，内部横滑）+ `全部变化 →`（在横滑容器**外面**，`flex:none`） | 与「跳到档位」共用 `.hubline` 一行；零 JS 控件（只有 `<a>`/`<span>`） |
| `/changes/` | 基准日 + 起算日 + 分栏说明 + 五个分栏 + 「不计入高价值的其他变化」折叠块 + 窗口说明 + 免责句 | 自指 canonical、双 feed、**恰好三段** JSON-LD（`CollectionPage`/`BreadcrumbList`/`ItemList`）、进 sitemap（`priority 0.8`、`changefreq daily`）、列表式布局（不是宽表，手机上不产生横向滚动） |

`/changes/` **始终生成**（与「条数为 0 的按需求页不生成」不同）：这一页的价值恰恰在于
「今天有没有变化」这个问题本身，而「没有变化」与「我们没查」是两种都必须能读到的答案。
页脚有到 `/changes/` 的入口（`__CHANGES_HREF__`，按输出深度统一解析）。

**密度契约**（首页那一行的定价，实测）：1440×900 下网格起点 227px、卡片 192px、行距 12px、
档间分带标题 26px ⇒ 第三行底边 899px，距视口底边 **1px**。因此：

- 条带**不单独占行**，与「跳到档位」共用一行；
- `.hubline .jump { flex: 0 0 auto }`：跳到档位不许收缩（它一收缩，四个 chip 内部折行，
  整行 +28px，首屏照样掉一行 —— 演练实测）；
- 宽度只能由条带的正文区吸收（`flex: 1 1 auto; min-width: 0` + `overflow-x: auto`）；
- 窄屏：条带顺延到下一行（仍是一行），空态另有一套短文案（同一份 DOM、CSS 切换，不用 JS）。

---

## 九、门禁

| 门禁 | 问什么 | 在哪 |
|---|---|---|
| `selftest:changes`（CI） | 规则本身：分栏与窗口边界 / 覆盖不变量 / 文案微调 / 元信息不进首页 / 上限 / 纯函数 / 墓碑 / 「不可用」措辞 / 渲染器形态 / 离线静态证据 / 真实数据不变量 | `scripts/tools/changes-selftest.js` |
| 产物自检（CI 内 build 步骤） | 三方对账：条带 ↔ `/changes/` ↔ 日志与记录；`data-radar-total` / `data-radar-other` 与数据一致；低价值不进条带；链接集合双向相等；措辞与权威表同源；空态按原因分写；「不可用」不冒充「没有变化」 | `scripts/tools/build-local.js` |
| 真浏览器断言（CI） | 条带存在且 ≤34px、零 JS 控件、入口在视口内、条带数 + 其他 == 窗口事件 + 即将结束（**测试侧独立重算**）、`/changes/` 五栏 + 无 JS 可读 + canonical、雷达行 → 详情页 → `.dhist` 块、390/360px 零横溢 | `scripts/tools/verify-site.js` §10b |
| `selftest:history`（CI） | v1.4 层的既有承诺 + **墓碑标签的形状**（只有 ended 能带、title 非空、无未知键） | `scripts/tools/history-selftest.js` |
| `report:changes`（不进 CI） | 人读：每一栏逐条列出 + 被抑制的其他变化 + 首页条带取项 | `scripts/tools/changes-report.js` |

`--expect-checks`（verify.yml 的带外项数）**不变**：新增的是门禁 action 的一个步骤，
不是 `check-ci-consistency.js` 自己的断言；冻结序列 `GATE_STEP_NAMES` 已同步加了一步
（`Change-radar self-test`，插在 `Deal-history self-test` 之后）。

---

## 十、明确不做（本阶段）

LLM 摘要 / 语义相似度判重（「不通过 LLM 猜测变化」是硬红线）；变更通知与订阅；
用 `firstSeen` / `lastSeen` 反推时间轴（v1.4 已否决，v1.5 不翻案）；历史回填；
雷达自己的 RSS；采集器改动；`dist/deals.json` 形状变更；首页排序/筛选维度变更；
刷新冻结的密度回归基线。
