# SCHEMA v1.6 — 订阅层（feed）

> 2026-09-30 · 分支 `v1.6-subscription` · 唯一判据实现 `scripts/lib/feeds.js`
> 上游契约 [`SCHEMA-v1.5.md`](SCHEMA-v1.5.md)（变化雷达）· [`SCHEMA-v1.4.md`](SCHEMA-v1.4.md)（变更日志）
> 完成报告 [`research/v1.6-subscription-report.md`](../research/v1.6-subscription-report.md)

本文件是这一层的**契约**：两类 Feed 的语义、注册表、Stable ID、时间口径、空 Feed 策略、
厂商门槛与 slug 规则、验证码表、上限、不做的事。实现与契约分家时以本文件为准，
改动必须同时改这里与 `feeds-selftest` 的夹具。

---

## 一、这一层是什么，不是什么

**是**：把三样已经存在的东西序列化成订阅源 —— 当前记录（`deals.json`）、变更日志
（`scripts/data/deal-history.json`）、变化雷达视图（`lib/changes.js` 的 `buildRadar`）。
产出 RSS 2.0 与 JSON Feed 1.1，全部在构建期写完。

**不是**：

1. **不是第二份存储**。这一层不写任何数据文件、不改日志、不改 `deals.json`；
   写入点仍然只有 `scripts/collect.js` 一处。
2. **不是新的判据**。优惠 Feed 的判据直接引用 `audience.js` 的谓词注册表，
   变化 Feed 的条目直接取雷达的分栏结果。`feeds-selftest` 有一条静态扫描盯着
   「这个文件里不许再写一个 `isStudentDeal` 之类」。
3. **不是后端**。没有账号、没有邮件列表、没有推送服务、没有第三方 SDK、没有行为追踪；
   产物是一堆静态文件，`/feeds/` 页面上明说这件事。
4. **不是主页面的替代品**。首页排序与筛选一个字没动。

---

## 二、两类语义

| | A 类：优惠 Feed | B 类：变化 Feed |
|---|---|---|
| 回答 | 当前有哪些符合这个条件的优惠 | 最近发生了什么 |
| 条目来源 | `deals.json` 的当前记录 | 雷达的分栏条目 |
| 条目身份 | `deal.id` | `history.eventKey()` 的哈希 |
| 时间 | `firstSeen` / 最近一次高价值变化 | 事件 `at` |
| 变化时是否重推 | 否（guid 与时间都不随采集刷新） | 是（新事件 = 新条目） |
| 空是否正常 | 不正常：分类 Feed 为空即构建红 | 正常：起算日之前没有可观测的变化 |

两类**不混**：优惠 Feed 不夹带事件，变化 Feed 不夹带「当前全部优惠」。
`new`（首次收录）是 `changes`（全部高价值变化）的**子集**，这一点写在 `docs` 与页面上。

---

## 三、注册表

注册表在 `lib/feeds.js` 的 `resolveSpecs()`，共 **18 个 Feed × 2 种格式 = 36 个文件**。

### 3.1 A 类：优惠 Feed

| spec id | 路径 | 判据（引用既有注册表） | 对应站内页 |
|---|---|---|---|
| `all` | `/feed.xml` · `/feed.json` | 全部 `type==='deal'` | `/` |
| `student` | `/feed/student.*` | `COLLECTION_PREDICATES.student` | `/student/` |
| `developer` | `/feed/developer.*` | `COLLECTION_PREDICATES.developer` | `/developer/` |
| `free-api` | `/feed/free-api.*` | `COLLECTION_PREDICATES.freeApi` | `/free-api/` |
| `free-tokens` | `/feed/free-tokens.*` | `NEED_PREDICATES.freeTokens` | `/need/free-tokens/` |
| `ai-coding` | `/feed/ai-coding.*` | `NEED_PREDICATES.aiCoding` | `/need/ai-coding/` |
| `china` | `/feed/china.*` | `NEED_PREDICATES.chinaUsable` | `/need/china-usable/` |
| 9 个厂商 | `/feed/vendor/<slug>.*` | `deal.vendor === 厂商` | 无（链首页） |

- 分类 Feed 的 `title` / `description` **直接复用页面注册表**的 `title`/`label` 与 `description`：
  同一批文案只有一处出处，构建自检逐字比对。
- `/feed/china.*` 的判据是 `availability.chinaUsable === true`（**30 条**），
  **刻意不用** `region === 'cn'`（60 条）：`SCHEMA-v1.1 §2.5` 写明「来自国内来源」
  不构成「大陆可用」的证据。差额是「尚未确认」，不是「不可用」。
- 排除项（三条，都有断言）：`type !== 'deal'`（工具条目）、`expiresAt < 基准日`、
  最后一次生命周期事件是 `ended`。**「当前优惠」里不许出现已结束或已过期的东西。**

### 3.2 B 类：变化 Feed

| spec id | 路径 | 条目 | 允许为空 |
|---|---|---|---|
| `new` | `/feed/new.*` | 雷达 `created` 分栏 | ✅ |
| `changes` | `/feed/changes.*` | 雷达 `created + changed + ended + restored` | ✅ |

- 窗口与上限**继承雷达**（created/字段事件 7 天、ended/restored 30 天、每栏 ≤ 30 条），
  不另开一套窗口；被截断时 `description` 追加既有措辞「另有 N 条未显示」。
- **文案微调与 `updated` 类元信息永远不进 Feed**（雷达的 `other` 两个桶）。

### 3.3 首页订阅发现

`index.html` 的 `<head>` 里是 `<!--PRERENDER:feeds-->` 标记，构建期由注册表注入
**4 个选择 × 2 种格式 = 8 条** `rel="alternate"`：

```
全部优惠（all）· 最近变化（changes）· 学生优惠（student）· 开发者优惠（developer）
```

其余页面声明**根 Feed 对**（`/status/`、分类页、按需求页、详情页、订阅中心），
**`/changes/` 声明变化 Feed 对**（这一页订的是变化本身）。
所有页面的标签都由 `feeds.rootFeedTags()` / `feeds.feedLinkTags()` 生成，
HTML 里不留第二份清单。

**`/feed/`（文件，单数）与 `/feeds/`（订阅中心页，复数）刻意不同名** —— 这是需求里指定的，
写在这里免得后来人「顺手统一」。

---

## 四、Stable ID

| 类别 | RSS `guid` / JSON `id` | 为什么 |
|---|---|---|
| 优惠条目 | **`deal.id`**（与 v1.0 起逐字相同，无前缀） | 加前缀会让所有老订阅者在升级那一刻重收全部条目。保持不变 ⇒ **v1.6 升级零重复推送** |
| 变化条目 | `chg:` + `sha1(history.eventKey(event))` 前 16 位 | 身份 = 已有的事件身份（`record()` 的幂等去重就是它） |

**为什么变化条目不用可读 id**（`chg:<dealId>:<at>:<type>:<field>`）：
采集每天跑两次，同一天同一字段可能连续变化两次（`A→B`、`B→C`），可读形式会**碰撞**。
`eventKey` 含 `from`/`to`，不会。这一条在 `feeds-selftest` 里有专门的夹具。

`eventKey` **不含 `runAt`**，所以运行时间不可能影响 id。
优惠 id 与变化 id 的命名空间不相交（`deal.id` 是 12 位十六进制，变化 id 有 `chg:` 前缀）。
同一个 `deal.id` 出现在多份优惠 Feed 里是**正确的**（每个 Feed 是独立订阅），
「id 唯一」的检查口径是**每份 Feed 内唯一**。

---

## 五、时间口径

| 字段 | 优惠 Feed | 变化 Feed |
|---|---|---|
| RSS `<pubDate>` | `firstSeen`（首次发现） | 事件 `at` |
| JSON `date_published` | 同上 | 同上 |
| JSON `date_modified` | 该条目**最近一次高价值事件**的 `at`；没有则**省略字段** | 同 `at` |
| RSS `<lastBuildDate>` | `deals.json` 的 `updatedAt`（数据时间） | 同上 |

- 日期一律归一到北京时间零点再序列化（`YYYY-MM-DDT00:00:00+08:00` / UTC 字符串），
  所以同一天同一份数据的两次构建**逐字节相同**。
- **`lastSeen` 永不进机器可读时间字段**：它每轮采集都刷新（策展条目被刷成今天），
  写进去等于让每条订阅天天变「新」。它只作为正文事实行「最近发现：…」出现。
- 「构建时刻」有两条独立探针：`check-feeds-reproducible.js` 核对所有时间字段都是
  北京时间零点、且 `lastBuildDate` 等于数据日期；`verify-site.js` 在真浏览器里再核一遍。

排序：优惠 Feed 按 `(date_modified || firstSeen)` 降序 → `firstSeen` 降序 → `id` 升序；
变化 Feed 按 `at` 降序 → `dealId` → `eventType` → `field`。两者都是全序，不依赖输入顺序。

---

## 六、条目内容

优惠条目（纯文本，`content_text` / `<description>`，**不放长正文**）：
厂商 · 优惠 · 中文（有译文时）· 适用人群 · 福利类型 · 有效期说明 · 中国大陆可用性 ·
最近变化（有事件时）· 首次收录 / 最近发现 · **官方页面链接** · 本站详情链接。

变化条目：记录（厂商 · 标题，或墓碑文案）· 变化（事件类型 + 字段名）· 原 / 新 ·
时间 · 原因（`ended` 时）+ v1.4 固定免责句 · 官方页面 · 站点链接。

- 主链接一律是**本站**（`/deal/<id>/`，不可链接时退到 `/changes/`）；
  官方页进正文，JSON Feed 另用 `external_url`。**刻意不用 RSS `<source>`** ——
  那个元素的语义是「条目来自哪个 Feed」，拿它装厂商页是误用。
- 措辞全部复用既有权威表：`audience.FIELD_LABELS` / `SOURCE_LABELS` /
  `HISTORY_WORDING`；订阅层自己的词只有五个（厂商 / 优惠 / 中文 / 详情 / 最近变化）。
  订阅层**不需要**前端受控副本 —— `/feeds/` 是构建期生成的静态页，没有第二份实现。

---

## 七、空 Feed 策略

| 情形 | 行为 |
|---|---|
| `new` / `changes` 为空 | **允许**（`mayBeEmpty: true`）。它们**始终生成**，`description` 明写「还没有观测到…」与起算日；日志不可用时改写「本次构建没有拿到历史日志…**这不表示「没有变化」**」 |
| 分类 Feed / 根 Feed 为空 | **构建红**（`not-empty`），强制人工处置：要么去掉该 spec，要么显式改标记 |
| 厂商 Feed 当前 0 条 | **不生成**（与「条数为 0 的按需求页不生成」同一判据），构建日志点名 |

「不可用」与「没有变化」是两句不同的话：变化 Feed 的 `description` 分三层
（中性描述 → 当前空的原因 / 不可用说明 → 口径说明），绝不合成一句。

---

## 八、厂商 Feed 与 slug

门槛：**当前有效优惠 ≥ 2 条**，**或** 历史变更事件 ≥ 3 条。

- 数字来自实测分布（交付日：33 家厂商里 `≥2 条` 命中 **9 家**；`≥3 事件` 命中 0 家）。
- 第二条不是装饰：事件日志**只追加**，所以一家厂商攒够 3 条事件后这个条件永久为真 ——
  它同时是「订阅 URL 稳定性」的单调兜底（防止从 2 条掉到 1 条时地址消失）。
- slug 在 `scripts/data/vendor-slugs.json` **人工维护**：显示名不可控（同一个厂商出现过
  两种写法）、哈希不可读、自动音译随库变化 —— 只有人工表能同时满足「可读」与
  「厂商改名后订阅 URL 不变」。规则：`^[a-z0-9][a-z0-9-]*$`、全局唯一，
  够门槛却没登记 ⇒ `feeds-selftest` 红并给出建议值。

---

## 九、验证（三层，都是机器判红）

| 层 | 在哪 | 问什么 |
|---|---|---|
| 产物自检（构建期） | `build-local.js` 的 `selfCheck` 调 `feeds.validate()` | 三方对账（内存条目 ↔ RSS 回读 ↔ JSON 回读）+ 语义不变量 + 订阅发现一致性 + 订阅中心五条约定 |
| 规则自测（CI） | `scripts/tools/feeds-selftest.js` | 注册表 / Stable ID / 时间口径 / 排除项 / 空策略 / 厂商门槛 / XML 检查器 / **4 项 Tooth Test** |
| 真浏览器（CI） | `verify-site.js` §14 / §14b / §10b | `DOMParser` 判 XML 良构、两侧 id 集合一致、链接可达、`/feeds/` 可用、`/changes/` 订到变化流 |
| 可复现（CI） | `scripts/tools/check-feeds-reproducible.js` | **真实连续构建** N 次逐字节一致 + 时间字段全来自数据日期 |

### 9.1 `validate()` 的检查码

`xml-decl` · `xml-well-formed` · `json-parse` · `jsonfeed-version` · `jsonfeed-fields` ·
`rss-json-parity` · `guid-unique` · `url-valid` · `link-exists` · `deal-exists` ·
`predicate-holds` · `no-ended` · `no-expired` · `change-event-exists` ·
`change-high-value` · `dates-from-data` · `vendor-slug` · `not-empty` · `feed-path-unique` ·
`title-consistent`

`validate()` 是**纯函数**，可以对篡改过的深拷贝调用 —— 4 项 Tooth Test 就是这么做出来的。

### 9.2 XML 良构检查器

`checkXmlWellFormed()` 是**手写**的（`build-local.js` 有一条硬约束：零外部依赖）。
它只认我们自己序列化的那个子集：XML 声明 + 元素 + 双引号属性 + 五个命名实体 + 注释；
裸 `&`、未知实体、标签不配平、单引号属性、缺声明一律判不合规。
真解析器的交叉证据由 `verify-site.js` 的 `DOMParser` 提供 —— **两个独立实现**。

---

## 十、上限

| 项 | 上限 | 行为 |
|---|---|---|
| 单份 Feed 条目 | 100 | 超出只计数并写进 `description`，**不删数据** |
| 变化 Feed 每栏 | 30（继承雷达） | 同上 |
| 优惠摘要 | 160 字（`schema.cleanText`） | 只截呈现，不改数据 |
| 原值 / 新值 | 200 字 | 同上 |

---

## 十一、明确不做（本阶段）

用户注册 / 登录 / 数据库 / 邮件发送 / Web Push / Discord / Telegram / 微信公众号 /
第三方 Newsletter SDK / 行为追踪 / 推荐算法 / 用户偏好存储；Feed 的个性化查询参数；
LLM 摘要或语义判重；用 `firstSeen`/`lastSeen` 反推时间轴；给 13 个目录页各生成一份 Feed
（订阅种类会爆炸，且违背「不为种类多而造无价值 Feed」）；采集器改动；
`dist/deals.json` 形状变更；首页排序 / 筛选维度变更；刷新冻结的密度回归基线。
