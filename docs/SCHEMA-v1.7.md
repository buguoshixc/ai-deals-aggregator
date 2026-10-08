# SCHEMA v1.7 —— 落地页契约（URL / 门槛 / 索引 / 门禁）

> 本文件是 `v1.7-seo-expansion` 的**契约**：实现与本文不一致时以本文为准；改实现必须同时改本文与
> `scripts/tools/seo-selftest.js` 的夹具。它不引入任何新的数据字段 —— 落地页读的全部是 v1.1/v1.3/v1.4/v1.5 已有的数据。

基线与前序契约：[`SCHEMA-v1.1.md`](SCHEMA-v1.1.md)（学生/开发者模型）· [`SCHEMA-v1.3.md`](SCHEMA-v1.3.md)（出处）· `SCHEMA-v1.6.md`（订阅）。

---

## 1. 这一层干什么、不干什么

**干**：把已有结构化数据组织成一批**有信息增量、可独立搜索进入**的静态入口页，并让「薄页 / 重复页 / 坏链接」在构建期不可能悄悄上线。

**不干**：不生成博客、不做 AI 批量文案、不接第三方 SEO SaaS、不加广告与统计、不买词、不改写官方优惠内容、不生成组合筛选型 URL（`/student/china/free/no-card/` 这类无限组合仍交给前端筛选）。

---

## 2. 页面类型与 URL

| 类型 `kind` | 路由 | 数量（2026-09-30 实测） | 说明 |
|---|---|---|---|
| `collection` | `/student/` `/developer/` `/free-api/` | 3 | 按人群/福利类型切（v1.1） |
| `need` | `/need/<slug>/` | 7 | 按需求切（v1.2） |
| `alias` | `/need/<slug>/` | 3 | **noindex 的旧地址**（见 §5） |
| `category` | `/category/<slug>/` | 5 | 按数据里的 `category` 枚举切（v1.7 新增） |
| `vendor` | `/vendor/<slug>/` | 9 | 按**规范厂商名**切（v1.7 新增） |
| `hub` | `/vendor/` `/category/` | 2 | 子页目录，同时是面包屑的父级（v1.7 新增） |
| `deal` | `/deal/<id>/` | 80 | 每条优惠一页（v1.0） |
| 工具页 | `/changes/` `/status/` `/feeds/` | 3 | 变化雷达 / 数据源状态 / 订阅中心 |

**合计 113 个 HTML 页，其中 110 条可索引、3 条 noindex。**

---

## 3. slug 与厂商归一（本条是本阶段最容易踩的坑）

1. **厂商 slug 的键是「规范显示名」**，即 `index.html` 的 RENDER-CORE 里 `vendorOf(deal).name`
   （44 条规则表）。v1.6 之前键的是**采集时的原始字符串**，于是同一个公司会有两种身份：
   `火山引擎（字节跳动）` 与 `火山引擎`、`扣子 Coze（字节跳动）` 与 `扣子 Coze`。
   v1.7 统一为规范名，并把 `feeds.js` 的分组也切到同一套口径（注入 `vendorKeyOf`，
   不在 `feeds.js` 里 require RENDER-CORE —— 那个文件必须保持纯函数、可被自测直接调用）。
2. **slug 值一个都没改**：`baidu-ai-cloud / zhipu / volcengine / coze / github / iflytek /
   microsoft / notion / minimax`。老订阅者的 Feed URL 因此零变化（条目集合会变，这是正常的）。
3. slug 必须匹配 `^[a-z0-9][a-z0-9-]*$` 且全局唯一；表是**人工维护**的。
4. 达标（见 §4）却没登记 slug 的厂商 → **构建失败**并给出建议值。
5. 分类 slug 同理，表在 `scripts/data/category-slugs.json`；分类页的文案（标题/描述/为什么）
   写在 `scripts/lib/landing.js` 的 `CATEGORY_PAGES` 里，**不从枚举名机械生成**。

---

## 4. 生成门槛 `shouldGenerateLandingPage()`

实现：`scripts/lib/landing.js`。返回 `{ok, reason}`，`reason` 是机器可读短码。

| 类型 | 门槛 | 2026-09-30 命中 | 未命中时 |
|---|---|---|---|
| `vendor` | 当前有效优惠 ≥ **2** 条 **或** 历史变更事件 ≥ **3** 条（**复用 `feeds.VENDOR_THRESHOLDS`**） | 9 | 不生成；日志与报告给出条数与原因 |
| `category` | 当前有效优惠 ≥ **4** 条，且在人工允许表 `CATEGORY_PAGES` 里，且条目集合与任何可索引集合页**不完全相同** | 5 | 同上 |
| `hub` | 子页 ≥ 1（永不出空目录页） | 2 | 不生成 |
| `alias` | 目标页存在且可索引 | 3 | 构建失败 |
| `need` | 条目数 ≥ 1（v1.2 起的既有口径） | 7 | 不生成（空入口页对读者没有价值） |

**门槛常量不许写死成「看起来差不多」的数字**：厂商那一档刻意与订阅门槛共用同一个常量，
这样「页面的条目集合」与「它的 Feed 的条目集合」在结构上不可能分头变化。

### 4.1 钉住（pin）：收录过的 URL 不许静默消失

`scripts/data/landing-pages.json` 人工登记**必须一直存在**的路由。规则：

1. 表里每个路由都必须生成成功，否则构建红；
2. 钉住的页面条数为 0 也红（空页面对读者没有价值，这时必须有人做决定）；
3. 钉住但跌破门槛 → 照常生成（日志标 `pinned-below-threshold`）；
4. 别名路由**必须**在钉住表里（别名不允许是无人看管的路由）。

---

## 5. 索引策略（indexable / non-indexable）

| 类别 | 索引 | sitemap | priority |
|---|---|---|---|
| 首页 | ✅ | ✅ | 1.0 daily |
| `collection` / `need` / `category` | ✅ | ✅ | 0.9 weekly |
| `vendor` / `hub` | ✅ | ✅ | 0.8 weekly |
| `deal` | ✅ | ✅ | 0.7 weekly |
| `/changes/` | ✅ | ✅ | 0.8 daily |
| `/feeds/` | ✅ | ✅ | 0.6 weekly |
| `/status/` | ✅（显式登记：公开透明度页，已被索引，撤销无收益） | ✅ | 0.3 daily |
| **`alias`** | ⛔ `noindex, follow`（自指 canonical） | ⛔ | — |
| 非页面资源（`feed/**`、`deals.json`、`deal-history.json`、`source-health.json`、`logos/**`、`og-image.png`、`icon.png`） | 不适用 | ⛔ | — |

断言：**sitemap 集合 === 非 noindex 页面的集合**（无多、无漏）；`noindex` 出现 ⇔ 策略判 noindex。

### 5.1 别名（近义 URL 收口）

`scripts/data/landing-aliases.json`：`旧路由 → {target, reason}`。GitHub Pages 没有服务器 rewrite，
所以旧路由**保留一个真实静态页**：`noindex,follow` + 自指 canonical + 不进 sitemap。
规则：目标必须存在且可索引（别名链最长 1 跳）；别名页的条目集合必须与目标页**逐条相同**
（它必须是同一主题的旧地址，而不是另一个主题）；**页面上不再有任何说明文字**。

> **本轮删掉的一条旧契约（`secondary-page-residue-v1`，2026-10-09）**：这里原先还写着
> 「**页面上给出到目标页的可见链接**」。它随三个别名页顶上的 `<p class="snote aliasnote">`
> 与题注里的长句一起退役 —— 依据是实测的：那三页原本的「可见链接」指向的是**页面标题**
> （不是「换个页面看」这个动作），读者真正用来导航的是面包屑与站内链接；三个别名页各有
> **183 个站内入链来源**（排除三个别名页自身后仍是 183），全站**零入链路由 0** ⇒
> 「页面上给一条到目标页的可见链接」对可发现性零贡献，而它带来的站务口径（「不参与搜索收录」）
> 与内部判据标识符（`studentSignal` / `benefitType 含 free_api`）正是本轮要删的残留。
> **刻意不做「零文案入口」**：在 noindex 页的面包屑里加一条目标页链接会造出第二套导航语义，
> 且违背 H13（首屏只放标题 / 条目数 / 更新时间）。
> 机器判据：构建期首屏扫描（目录页家族**含别名页** intro 区 `.snote` = 0 条，判据已从
> 「非别名页 0 条」升级）+ `verify-site.js` §22c ③b（`introNoteRoutes.length === 0`）+
> `selftest:audience` 的反向断言（每条 `reason` 的逐字文本 × 全部 `dist/**/index.html` 0 命中）。
> 机制侧的六条契约一条没放松，逐条写在 `landing-aliases.json` 的 `_rule` 里。

v1.7 收口的三对（v1.6 时**条目集合逐条相同、其中两对标题逐字相同**）：

| 旧地址 | 目标 | 为什么 |
|---|---|---|
| `/need/student-only/` | `/student/` | 同一份 `audience.studentSignal` 判据 |
| `/need/free-api/` | `/free-api/` | 同一份 `benefitType 含 free_api` 判据 |
| `/need/dev-credits/` | `/developer/` | 同一份 `audience.developerSignal` 判据 |

---

## 6. 页面内容契约

每个聚合页必须有：唯一标题、非空且唯一的 description、自指 canonical、**恰好一个 `<h1>`**、
数据摘要块、条目表（复用既有 `renderDirectoryPage` 模板，**不维护第二套**）、最近变化块、订阅入口。

**数据摘要**（`landing.summaryOf()`）：当前条目 / 无需信用卡（`creditCardRequired === false`）/
确认中国大陆可申请（`availability.chinaUsable === true`）/ 含免费 API / 含免费模型 /
最近 7 天新增（以数据更新日为基准）/ 覆盖来源 / 覆盖分类。值为 0 的项**不渲染**。
每个数字都带 `data-summary-label` / `data-summary-value`，由 `seo.validate()` **独立重算**对账。

**最近变化**（`landing.topicChangesOf()`）：按**条目 id 归属**过滤雷达分栏（不按厂商名 ——
雷达条目上的 `vendor` 是原始字符串，页面用规范名）。判据仍在 `lib/changes.js`，本层只做视图过滤；
措辞与 `/changes/` 共用同一批常量（「没拿到日志」与「窗口内没有变化」必须是两句不同的话）。

---

## 7. JSON-LD 与面包屑矩阵

| 页面 | JSON-LD（每段一个顶层对象） | 面包屑 |
|---|---|---|
| 首页 | Organization / WebSite / BreadcrumbList / FAQPage / ItemList（不变） | 无 |
| `collection` / `need` / `alias` | CollectionPage / BreadcrumbList / ItemList | 首页 › 本页 |
| `category` | 同上 | 首页 › **按分类浏览**（`/category/`） › 本页 |
| `vendor` | 同上（**不堆 Organization**：本站不是该厂商） | 首页 › **按厂商浏览**（`/vendor/`） › 本页 |
| `hub` | 同上（ItemList 列子页） | 首页 › 本页 |
| `deal` | WebPage / BreadcrumbList（不变） | 首页 › 分类页（存在时；**不存在则省略 `item`**） › 标题 |

硬规则：
1. `ItemList.numberOfItems === itemListElement.length === 页面上的数据行数`（`data-item` / `data-child` 标记）。
   老实现声明 `deals.length` 却只发 `slice(0,50)`：`/developer/` 是「声明 67、实列 50」而无人发现 —— 已修。
2. `ListItem.url` 必须属于本页可见行集合。
3. 面包屑每个**存在的** `item` 必须解析到真实页面（不存在时省略 `item`，保留 `name`）。
   详情页旧实现把分类那一级指向站根 —— 已改为指向分类页。
4. 详情页 `meta description` 用「厂商｜标题：优惠原文」（截断 `…` 留痕）：17 个千帆详情页的
   `discountInfo` 逐字相同，只取它会让这 17 页描述完全一样。

---

## 8. 门禁：27 个检查码

规则层 `scripts/lib/seo.js` 的 `validate(pages, opts)`（纯函数，可在被篡改的深拷贝上调用）：

`gate-threshold` `gate-pinned-missing` `gate-pinned-empty` `alias-target-exists` `alias-item-set`
`alias-indexable` `slug-shape` `slug-unique` `title-unique` `title-length` `desc-nonempty` `desc-unique`
`canonical-self` `canonical-unique` `h1-count` `robots-policy` `itemlist-arity` `itemlist-members`
`breadcrumb-target-exists` `sitemap-target-exists` `sitemap-policy` `orphan` `internal-link-exists`
`thin-content` `duplicate-item-set` `summary-source` `feed-declared`

三个执行点：

| 位置 | 输入 | 命令 |
|---|---|---|
| 构建期 `build-local.js` selfCheck | **从磁盘回读**刚写下的全部 113 页 | `npm run build` |
| 独立验收 | **只读 dist/**，可索引性/条目集合/sitemap 成员/Feed 清单**现场重新推导** | `npm run verify:seo` |
| 规则演练 | 干净夹具 + 27 个定向篡改（每个检查码都必须会响） | `npm run selftest:seo` |

**为什么要有第二个执行点**：构建期的描述符是构建过程自己记下来的，两份数据同源时，
一个错误的判据会在两边一致地错下去。`verify:seo` 的输入与它完全不同源。

---

## 9. 明确不做的

- 不生成 `/china/`（区域页由既有的 `/need/china-usable/` 承担 —— 同一主题不重复建 URL）；
- 不生成 `/free-credits/`、`/free-models/`、`/ai-coding/`（同上，已分别有 `/need/free-tokens/`、
  `/need/free-model/`、`/need/ai-coding/`）；
- 不给只有 1 条有效优惠的厂商建页（门槛 2 条）；
- 不把 12 个分类枚举机械地全部变成页面（`编程开发` 已有专页、`其他` 是内部兜底枚举，其余条数不足）；
- 不改 `changes.js` 的判据（v1.6 报告写明的前置条件：变化订阅拿到真实样本之前不动它）。
