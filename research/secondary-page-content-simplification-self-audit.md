# secondary-page-content-simplification —— Self-Audit

**基线** `origin/master = a795ce3` · **分支** `secondary-page-content-simplification`

审计对象：本分支相对 `origin/master` 的全部改动。
每一条都给出**可复核的证据**，不写「应该没问题」。

---

## 0. 结论

| 项 | 结果 |
|---|---|
| P0 | **0** |
| P1 | **0** |
| P2 | **1**（登记为 DEFERRED，见 §8） |
| REPAIR_NOW | **0** |

---

## 1. 有没有误删用户真正需要的信息？（prompt §39 第 1 问）

**做法**：对每一段被删的文案先做六类归类（USER_REQUIRED / USER_HELPFUL /
MAINTENANCE_DETAIL / INTERNAL_IMPLEMENTATION / LEGAL_OR_SOURCE_NOTE / REDUNDANT），
**只有 USER_REQUIRED 允许留在首屏**，USER_HELPFUL 进折叠块，其余三类各自有去处。

**逐条复核**（被删内容 → 去处）：

| 被删内容 | 归类 | 去处 | 是否丢失用户需要的信息 |
|---|---|---|---|
| 「来源没提学生身份 ≠ 学生不能用」 | USER_REQUIRED | **保留**（改写为 intro） | 否 |
| 「比学生专享更窄」 | USER_REQUIRED | **保留**（intro） | 否 |
| 「没写支付方式的条目是尚未确认」 | USER_REQUIRED | **保留**（intro + 三态图例进折叠块） | 否 |
| 「与首页『国内』筛选不是同一件事」 | USER_REQUIRED | **保留**（intro） | 否 |
| 「免费档 ≠ 全部功能免费」 | USER_REQUIRED | **保留**（intro） | 否 |
| 「免费的是模型本身，不是额度」 | USER_REQUIRED | **保留**（intro） | 否 |
| 「条目明显偏少是数据缺口」 | USER_REQUIRED | **保留**（intro） | 否 |
| 「常常要申请或满足资格」 | USER_REQUIRED | **保留**（intro） | 否 |
| 「旧地址 + noindex」`aliasNote` | USER_REQUIRED | **原样保留**（3 个别名页） | 否 |
| 「没有依据的字段写尚未确认，不写成不可用」 | USER_HELPFUL（图例） | 折叠块 `SHARED_NOTES.tristate` | 否 |
| 「同一优惠可能出现在多个标签页」 | USER_HELPFUL（分类边界） | 折叠块 `SHARED_NOTES.overlap` | 否 |
| 「国内平台新用户免费额度多属此类」 | USER_HELPFUL | 折叠块（`/developer/`） | 否 |
| 「额度按时长 / 张数 / 积分计」 | USER_HELPFUL | 折叠块（`/category/audio|image|agent/`） | 否 |
| 「K-12 与地区限制写在条目说明里」 | USER_HELPFUL | 折叠块 | 否 |
| 「调用前一般要注册账号」 | USER_HELPFUL | 折叠块 | 否 |
| 「额度计量单位 / 重置周期 / 过期时间差异极大」 | USER_HELPFUL | 折叠块 | 否 |
| 「地区限制原文摘要在某一列」 | USER_HELPFUL | 折叠块 | 否 |
| 「想知道要不要卡需查官方页」 | USER_HELPFUL | 折叠块 | 否 |
| 「没出现的分类 / 厂商是没到门槛」 | USER_HELPFUL（新写，补上） | 折叠块（枢纽页） | **增补**，非删除 |
| 「最终以官方页面为准」 | LEGAL_OR_SOURCE_NOTE | **共享页脚已有**（`index.html:1295`） | 否 —— 全站每一个页面仍有这句 |
| `/status/` 三种状态各自的判据 | USER_REQUIRED | **保留**（prompt §36） | 否 |
| 摘要卡 `<small>判据：…</small>` | REDUNDANT（`title` 属性已有同一句） | **改挂到 `<li title>`**，悬停仍可读 | 否 |

**结论**：**没有一条 USER_REQUIRED 内容被删**。三条 USER_HELPFUL 之外的改动全部有明确去处。

> 反向自证：`/need/no-card/` 是本站数字最小、最容易误读的一页（1 条）。
> 它的首屏现在写着「只收来源明说『不需要信用卡』的条目；没写支付方式的条目是『尚未确认』，
> 不在这一页。」—— 三态红线的结论仍在首屏，只是从 195 字压到 41 字。

---

## 2. 有没有把维护口径彻底丢失？（prompt §9）

**没有。** 全部移入 `docs/DESIGN-RULES.md` §8 的**「二级数据页口径归档」**（21 条逐 slug 条目）。

**机器证据**（不是承诺）：`audience-selftest.js` §9 有一条断言，
逐个 slug 断言「口径归档里有对应条目」，缺一条即自测变红；归档标题格式
（`^#### \`slug\``）正是被这条断言解析的，所以「删了归档但没改自测」也走不通。

已核对的归档条目（每一条都是原先只存在于页面正文里的内容）：

| slug | 归档里保留的关键口径 |
|---|---|
| `ai-coding` | 「唯一没有专门字段支撑」「刻意不扫标题与正文的理由」「补法是给采集侧加字段，不是放宽判据」「`/category/coding/` 为何刻意不成页」 |
| `no-card` | 三态语义、`"false"` 字符串不命中、全库 1 条、红线的落点 |
| `china-usable` | `region === 'cn'` **刻意不用**、`SCHEMA-v1.1 §2.5` 契约、30 vs 60 的差额是「尚未确认」 |
| `free-tier` | `pricingModel` 字段口径、与首页「① 完全免费」同一字段 |
| `student-only` / `student` / `developer` | 三条「或」关系的完整判据、与 `/student/` 同判据 |
| `edu-identity` | `educationEmailRequired === false` 不命中、比学生专享更窄的原因 |
| `free-api` / `free-tokens` / `free-model` / `dev-credits` | 各自 `benefitType` 判据、与相邻入口的分界 |
| `category` | `CATEGORY_MIN_DEALS = 4` 与实测分布（4 与 3 之间的自然断层）、三类跳过原因 |
| `vendor` | 门槛「≥2 条 / ≥3 事件」、归一规则 |
| `api` `chat` `audio` `image` `agent` | 类目来源、不互斥、**单位不可比与不做换算**（含 `api-plans-selftest` 的全仓扫描） |
| 厂商叶子页 | 归一规则、条数只算未过期 `type=deal`、非优惠资料来自显式匹配 |

**代码侧**：`audience.js` / `landing.js` 的头部注释也指向该归档，并写清了三层模型的边界。

---

## 3. 有没有改分类逻辑？（prompt §10）

**一个字符都没改。**

| 对象 | 证据 |
|---|---|
| `NEED_PREDICATES`（10 条判据函数） | 未触碰 |
| `COLLECTION_PREDICATES` / `CATEGORY_PREDICATES` | 未触碰 |
| `needsOf()` / `collectionsOf()` | 未触碰 |
| 厂商映射（`providers.js` / `VENDOR_SLUGS`） | 未触碰 |
| 落地页门槛（`shouldGenerateLandingPage`） | 未触碰 |
| 实际命中分布 | 改动前后**逐条相同**：`student-only 12 · edu-identity 7 · no-card 1 · china-usable 30 · free-tier 60 · free-api 45 · free-tokens 44 · ai-coding 4 · free-model 12 · dev-credits 67` |
| 页面集合 | 186 路由前后完全一致（`diff-verify.cjs` 的「产物缺失 / 新增产物」检查 0 命中） |
| 每页 `data-item` / `data-child` 集合 | **186/186 相同** |

> 唯一碰到 `criteria` 字段的是 `ai-coding` 的括注（「见本页说明」→「见 docs/… 口径归档」）。
> **不是数据**：实测 `dist/deals.json` 里不含 `criteria`（只序列化 `needs` / `collections` /
> `sourceFacts`），它只进报告与自测。这一点在开工时专门核过，不是假设。

---

## 4. 有没有改数据？（prompt §11）

**没有。** `diff-verify.cjs` 的逐字节对账：

- **非 HTML 产物 117/117 逐字节相同** —— 含 `deals.json`、`plans.json`、`api-plans.json`、
  `models.json`、`sitemap.xml`、`source-health.json`、`data/index.json`、
  36 个 Feed（`feed.xml` / `feed.json` × 18）、全部 logo 资产、`og-image.png`。
- 仓库来源层数据（`deals.json` 等根文件、`scripts/data/*`）**本分支一处未改**
  （门禁里 `check-reproducible` / `check:history` / 三个 `check:*:reproducible` /
  `check-plan-history` / `check-api-plan-history` 全部通过，它们正是守这件事的）。

---

## 5. 有没有改链接？（prompt §11）

**没有。** 逐页提取全部 `href` 的**集合**（去重排序）比对：

```
链接集合相同：186/186
```

含详情页链接（`../../deal/<id>/`）、面包屑、次级枢纽链接、页脚 14 条路由、
订阅 `rel="alternate"`、官方外链、`source-health.json` / `plans.json` 数据出口。

---

## 6. 有没有改 SEO 结构？（prompt §25/§26/§27）

| 项 | 结果 |
|---|---|
| JSON-LD（CollectionPage / BreadcrumbList / ItemList） | **三段逐字节相同，186/186** |
| `canonical` | 相同（186/186） |
| `<title>` | 相同（186/186） |
| `meta description` | 相同（186/186） |
| `meta robots` | 相同（186/186） |
| sitemap | 逐字节相同（183 条） |
| Feed | 逐字节相同（36 个文件） |
| `verify:seo`（独立门禁，只读 dist 重推一遍） | **通过**（步骤 46） |
| `selftest:seo`（27 个检查码逐个定向篡改） | 通过（步骤 17） |
| 面包屑每一级真实存在 | 通过（§22c + §18） |
| `<h1>` 恰好一个 | 通过（`h1-count`，186 页） |

**`meta description` 特意没有跟着正文一起删**（prompt §25）：注册表的 `description`
（84–121 字的完整语义）**一处未改**，`feeds-selftest` 那条「分类 Feed 的描述与页面注册表
逐字相同」因此照旧成立。

---

## 7. 有没有某页删完后变得语义不清？（prompt §39 第 7 问）

逐族复核「删完后还读得懂吗」：

| 页 | 复核 | 判定 |
|---|---|---|
| `/category/chat/` `/audio/` `/image/` `/agent/` | 首屏只剩「标题 → 共 N 条 · 数据更新 → 摘要卡 → 表格」。标题（如「对话类大模型的优惠与免费额度」）自解释；表格有「适用人群 / 为什么在这一页 / 门槛 / 中国大陆可用性」四列；底部折叠说明解释重叠与三态 | **清晰**。这正是 prompt §6C 指定的处置（「顶部只是解释为何属于这个分类 ⇒ 优先移除」），也是 §35 的推荐最终形态 |
| `/need/ai-coding/` | 首屏一句结论（条目偏少是缺口）+ 表格 4 行真实的编程开发优惠。「为什么只能按类目收」不再出现在页面上，但**读者需要的那一半**（数字小 ≠ 没有）保留了 | **清晰** |
| `/vendor/<slug>/` | 首屏一句「只列当前有效优惠；已结束的条目在历史档案里」+ 条数/更新时间 + 厂商资料区块。归一规则移走不影响读者使用 | **清晰** |
| `/vendor/` `/category/` 枢纽 | 首屏一句入口口径；折叠块补上「没出现的是没到门槛」—— 比改动前**更清楚**（这条是新增的） | **更清晰** |
| `/status/` | 三种状态各自的判据完整保留；只删掉「为什么要公开它」的论证段 | **清晰** |
| 3 个别名页 | `aliasNote` 原样保留（「旧地址 + 不参与收录 + 目标页」），首屏仍有说明 | **清晰** |

**反向证据**：`verify-site.js` 的无 JS 探针（重瞄后）要求每条需求页
「首屏那一句 > 0 字且 ≤ 60 字 + 底部折叠说明存在且 summary 是『分类说明』+ 条目与链接齐全」，
三条需求页全过。

---

## 8. 遗留风险（Remaining Risks）

### P2 / DEFERRED

**R-1 · 正文下限余量收窄到三位数（最紧 146 字）**

| 页 | 改动前余量 | 改动后余量 | 下限公式 |
|---|---|---|---|
| `/category/`（枢纽） | 333 | **146** | `500 + 60×子页数` |
| `/need/no-card/` | 514 | **152** | `600 + 60×条目数` |
| `/need/ai-coding/` | 638 | 242 | 同上 |

- **不是缺陷**：下限是**按数据现算**的（条目/子页越多，下限越高），所以余量不随数据增长而恶化；
  实测改动后 54 个目录页**全部通过** `thin-content`（构建期 + `seo-verify` 两道独立检查）。
- **仍登记为 DEFERRED**：这是本轮唯一「余量降到三位数」的量。若将来有人继续删正文，
  `/category/` 枢纽会第一个变红。**处置**：不要调低下限公式（`research/_raw/v3.0-antigaming.js`
  有一条下限单调性规则）；要加内容就加**真有用户价值**的（例如枢纽页现在那句「没到门槛」的说明）。
- **不阻断发布**：本轮所有产物逐字节验证过、下限检查两道全过。

### 已观察但不属于本轮范围

- `research/_raw/ours-baseline/verify.json` **不需要重刷**：它只比首页的 6 个指标
  (`coveredDeals` / `cards` / `firstScreenFull` / `pageHeight` / `externalRequests` / `jsErrors`)，
  而首页 `index.html` 本轮**一字节未改**（4787px 不变）。
- 仓库根的 `final-dist-A.sha256` / `final-dist-B.sha256` 是**未被任何脚本或 workflow 引用**的
  历史证据（untracked），本轮不读也不更新。

---

## 9. 本轮**没有**做的事（边界）

prompt §0 的「不解决」清单逐条确认未触碰：Coverage · 数据缺口 · 模型发布时间 ·
API Pricing 数据质量 · Collector · Source Health · History · Analytics · SEO 架构 · 页面布局体系。

prompt §31 的「不再做理论对抗 CSS Mutation」：本轮新牙 `M14` 是 **DOM 注入**（只推高行数），
没有扩张 `writing-mode` / `clip-path` / `mask` / 伪元素那一套。

---

## 10. 过程缺陷与教训（记录在案）

| # | 现象 | 根因 | 处置 |
|---|---|---|---|
| 1 | `note-intro-long` 第一版在 @360 把 **17 个本轮没改过**的页面判红 | 判据漏了「阅读列宽」这个物理前置条件 —— 窄屏折行是正常排版行为 | 加 `WIDE_INTRO_MIN_COLUMN = 1100`；**判据自己也要被咬**，这次是被真实门禁读数咬住的 |
| 2 | 浏览器侧量测代码里的一句注释让整轮崩在 `ReferenceError: plans is not defined` | 那段代码在**模板字符串**里，注释中的反引号提前截断了模板；`node --check` 看不出（语法合法、语义错） | 注释去掉反引号，并在原处留下「这段不许出现反引号」的警告 |
| 3 | 同类问题在 `pageCss` 里也踩过一次（CSS 注释里的反引号） | 同上 | 同上 |
| 4 | `diff-verify.cjs` 第一版把 45 页的**缩进/空行差异**报成「内容变化」 | 删整块标记会连带删掉它占的行 | 量具加上行级归一（丢空行 + 去行首尾空白），并在注释里写明「一份把缩进变了报成内容变了的工具，会让人开始忽略它的输出」 |
| 5 | 同上，43 页的第二轮误报来自「基线有 intro、改动后整块没了」 | 占位符留在基线一侧、改动侧什么都没有 | 占位符**整块删掉**再比 |
| 6 | 同上，最后 25 页来自厂商页 `**` → `<b>` 的**有意修复** | 它不在原始 allowlist 里 | 作为 allowlist 第 5 条**显式登记**（两侧同等归一，只掩盖这一种等价） |

> 6 条里有 4 条是**量具/判据自己的缺陷**，不是产物的问题。
> 这与仓库既有的判词一致：**一个量错了东西的断言比没有断言更糟，因为它看起来在守着什么。**
