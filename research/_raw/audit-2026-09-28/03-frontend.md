# 03 · 前端与产物审计：用户现在打开线上看到的到底是什么

- 审计人：`frontend-auditor`（任务 t3，attempt 1 / `98e9783f-2b52-4ef5-9077-63ae8e4dfd68`）
- 审计时间：2026-09-28（本地时间）
- 审计对象：`D:\OneDrive\Desktop\Code\AI Page` 工作区（`HEAD` = `a0c4ab2`，与 `origin/master` 同点）+ `dist/` 现成产物 + 线上 `https://buguoshixc.github.io/ai-deals-aggregator/`
- 纪律：**只读**。未执行 `npm run build`（会重写 `dist/`），未修改任何仓库文件；`dist/` 全程只读，HTTP 实测用 `scripts/serve.js --dir=dist` 指向已存在的产物。
- 标注约定：**【实测】**= 我亲手跑命令/浏览器看到的；**【引用】**= 读文件或读文档得到的；**【推断】**= 我的判断，可能有错。
- 共享基线：`research/_raw/AUDIT-CONTEXT.md`（captain 实测）。本报告只在该基线之外做增量，重复处一律引用不重新推导。

---

## 0. 结论摘要（先给判断，再给证据）

| # | 结论 | 档位 |
|---|---|---|
| 1 | `index.html` 之所以 191 KB，是**单文件把 CSS(27%) + 全部应用 JS(68%) 内联**；卡片模板不是独立文件，而是内联 JS 里的 `RENDER-CORE` 区块（66718 字符，占源码 43.6%）。源码里**没有任何 `{{ }}` 占位符**，只有 6 个 `<!--PRERENDER:*-->` 注释锚点 + 6 处 `__SITE_URL__`。 | 【实测】 |
| 2 | `dist/` 139 个文件 / 5,285,602 字节；80 个 `deal/<id>/index.html` 与 `deals.json` 里 80 条 `type=deal` **双向零差集**（我脚本核对 id 集合 vs 目录名集合，两个方向都为空）。80 个详情页的 canonical 自指、含本条文案、含 2 段 JSON-LD、不拉数据、有 og:image —— **80/80 全量核对，不是抽样**。 | 【实测】 |
| 3 | 任务书里的「152977 vs 233517 字节」是**字符数不是字节数**：真实字节是 191057 → 294055（+102998 字节）。差异**已逐字节归因并复现**：我用源码 + dist 的注入片段重建 `dist/index.html`，重建结果与产物**逐字节相同**。 | 【实测】 |
| 4 | **发现一个线上正在生效的真缺陷**：`#jumpNav`（"跳到 ①完全免费…"）在「最近更新/即将截止」排序和列表视图下**应当隐藏但没有隐藏** —— 它是 28px 高的可见控件，4 个 `#tier-N` 锚点**全部是死锚点**（点击不滚动、只在 URL 留下无效 hash）。线上 JS/CSS 与本地逐字节一致 ⇒ **脏在线上**。 | 【实测】 |
| 5 | 门禁为什么没抓到它：`verify-site.js` 断言的是 **`jumpNav.hidden` 属性为 true**，不是**渲染结果**。属性确实被置为 true，于是门禁绿；而 `[hidden]` 被作者样式表的 `.jump{display:flex}` 覆盖，元素照样可见。仓库对 `.cmpbar[hidden]`/`.cmpdlg[hidden]` 都写过 `display:none` 补丁，**只有 `.jump` 漏了**。 | 【实测】 |
| 6 | 门禁自身覆盖：`check()` 调用点 **143** 处；不带 `--compare` 跑 **136** 项（= README 宣称的 136）；带 `--compare` 且基线存在跑 **142** 项（= captain 读数）。基线 `verify.json` 记录的 `total` 是 **132**（生成于 2026-09-27T15:50:34.934Z）⇒ 门禁自己的断言数已从 132 涨到 142，而**没有任何断言保护这个数字**。 | 【实测】 |
| 7 | 零依赖/零 CDN 宣称**属实**：站点全部 11 类请求同源（无 CDN、无字体、无 `<img>`、无 iframe）；构建链 `build-local.js` + `validate.js` 的 require 闭包**只有 Node 内置模块**，`dist/` 能在不 `npm install` 的 runner 上装出来。 | 【实测】 |
| 8 | 关掉 JS 首屏仍有 **12565 字符正文 / 50 张完整卡片 / 50 个站内详情链接 / 50 个官方外链**（内容可读，宣称属实）；但**筛选条 10 枚 chip、排序 3 枚、分类下拉、搜索框共 15 个控件仍然可见却完全无响应**——"无 JS 不留死按钮"的纪律只覆盖了主题切换与视图切换（`.seg` 被 `body.js` 门控），没覆盖筛选/排序/搜索。 | 【实测】 |
| 9 | SEO/GEO 面**对账干净**：`sitemap.xml` 81 条 `<loc>` = 首页 1 + 详情页 80，与 `type=deal` 集合完全相等；`feed.xml`/`feed.json` 各 80 条且互相一致；`robots.txt` 显式放行 11 个生成式引擎爬虫。**但**：首页 `ItemList` 只列 50 张默认视图卡片（30 条被折叠的优惠不在结构化数据里），且条目 `url` 指向**厂商官方页**（50 条只有 43 个不同 URL）而**不是站内 80 个详情页**。 | 【实测】 |
| 10 | 无障碍：**整站没有 `<h1>`**，水合后 DOM 里 **50 个 `<h3>`（卡片标题）全部排在唯一 1 个 `<h2>`（"常见问题"）之前**（层级倒置）；力度分带标题是 `<div>` 不是标题；没有「跳到正文」链接。对比度我自己独立算了一遍：**亮/暗各抽样 714 个文本节点，0 条低于 WCAG AA**（与 DESIGN-RULES 文档声称的 0 条吻合）——但门禁断言写的是 **"低于 4.5:1 ≤ 20"**，等于给文档里的「0 条」留了 20 个节点的回退空间。 | 【实测】 |

---

## 1. 架构实况：`index.html` 为什么这么大

### 1.1 成分拆分【实测】

```
index.html              191057 字节 / 152977 字符 / 3564 行 / UTF-8 无 BOM / 全 LF
dist/index.html         294055 字节 / 233517 字符 / 3999 行
```

任务书里的 `152977` 与 `233517` 正是这两个文件的**字符数**（JS `String.length`），不是字节数——同一份文件两种量法差 38080 / 60538，因为中文 3 字节 1 字符。**后文一律用字节。**

源码 152977 字符的成分：

| 成分 | 字符 | 字节 | 占源码字符 |
|---|---|---|---|
| 内联 `<style>`（第 48–836 行，唯一 1 个 style 块） | 41321 | 46903 | 27.0% |
| 内联应用 `<script>`（第 956–3561 行，`'use strict'` 起） | 103960 | 133324 | 68.0% |
| ↳ 其中 `RENDER-CORE` 区块（第 960–2595 行，纯函数渲染核心） | 66718 | — | 43.6% |
| 首屏主题脚本（第 15–24 行，防 FOUC） | 360 | — | 0.2% |
| 其余骨架 HTML（head/顶栏/筛选条/FAQ/页脚/dialog） | 7336 | — | 4.8% |

**卡片模板的"位置"**：源码 `index.html` 里**不存在任何静态卡片**。卡片 HTML 由 `RENDER-CORE` 区块里的纯函数生成（`cardHtml()` 2608 字符、`gridHtml()` 542、`tierHeadHtml()` 371、`detailHtml()` 4561、`rowHtml()` 1370、`foldGroup()` 2245、`foldDeals()` 2086、`foldMembersHtml()` 1020、`cmpTableHtml()` 1166…），构建期与浏览器**共用同一份模板**——这是设计上的硬约束，由 `scripts/lib/render-core.js` 用 `vm` 在无 DOM 沙箱里求值 `RENDER-CORE` 区块实现；沙箱里只垫了一个 `document.createElement` 的 `textContent/innerHTML` 壳。区块内一旦引用 `document/window/state`，构建直接抛错【引用：`scripts/lib/render-core.js:14-59`】。

**占位符残留**：

- `{{ }}` 形态占位符：**0 个**（源码与产物都没有）。
- 真实占位符是注释锚点：`<!--PRERENDER:topstat-->`（第 859 行）、`<!--PRERENDER:facets-->`（864）、`<!--PRERENDER:stats-->`（870）、`<!--PRERENDER:categories-->`（872）、`<!--PRERENDER:deals-->`（898）、`<!--PRERENDER:jsonld-->`（3562）——共 6 个，与 `build-local.js:65-68` 的 `PRERENDER_MARKERS` 一一对应。
- 另有 `__SITE_URL__` 6 处（canonical/hreflang/og:url/og:image/twitter:image），产物里 0 残留。
- 产物里 `<!--PRERENDER:` 与 `__SITE_URL__` 均为 0 次出现【实测：线上抓取也确认 0】。

### 1.2 构建做了哪些替换/注入【实测（读 `build-local.js`）+ 引用（行号）】

`scripts/tools/build-local.js`（58363 字节 / 1141 行）的组装顺序（`assemble()`，第 596–741 行）：

1. 先跑 `scripts/validate.js`（第 70–73 行 `runValidate()`，**不带 `--strict`**）。
2. 写入暂存目录 `dist.building`（第 39–41、602–603 行），自检全过才 `rename` 成 `dist`（第 1074–1113 行 `promoteStaging()`）；失败则删暂存、`dist` 原样保留。
3. 拷贝 `PUBLIC_FILES` = `index.html / deals.json / favicon.svg / robots.txt / .nojekyll`（第 48、605–609 行）。
4. `loadLogos()` + `writeLogos()`：从 `assets/logos/manifest.json` 现场生成品牌 SVG / 原样拷贝官网文件 → `dist/logos/*` + `dist/logos.css`（第 613–615 行；`scripts/lib/logos.js`）。
5. `attachZh(payload.deals)`：把中文译文覆盖层贴进 `deals.json`，并**把贴好的那份写进产物**（第 623–636 行）；译文不合规**硬失败**阻止发布，原文变更则警告 + 停用该字段（第 631–634、638–651 行）。
6. 抽取 `RENDER-CORE` → `renderDeals()`：**折叠无损断言**（`Σ模型数 === 未过期优惠数`，第 121–124 行）+ 卡片数下限 `MIN_PRERENDERED_CARDS = 45`（第 62、126–128 行）。
7. 替换 6 个锚点（第 665–673、686 行），并**删掉 `<div class="loading">加载数据中…</div>` 占位**（第 666 行，正则 `\s*<div class="loading">…</div>`）。
8. `__SITE_URL__` ×6 → `https://buguoshixc.github.io/ai-deals-aggregator/`（第 677–679 行，构建期打印替换处数）。
9. `extractFaq()` 从**页面可见文案**解析 FAQ → `buildJsonLd()` 生成 5 段 JSON-LD（Organization / WebSite / BreadcrumbList / FAQPage / ItemList），注入 `<!--PRERENDER:jsonld-->`（第 682–687 行）。
10. `renderOgImage()`：用 Node 内置 `zlib` 手写 PNG 编码器 + 5×7 点阵字模画 1200×630 分享图，并**在构建路径上自检**（第 696–707 行；`scripts/lib/og-image.js`）。
11. `writeDetailPages()`：为每条 `type === 'deal' && id` 生成 `deal/<id>/index.html`，并回传 URL 表给 sitemap（第 429–590 行）。
12. 生成 `sitemap.xml`（首页 + 详情页）、`feed.xml`、`feed.json`（第 348–428、721–736 行）。
13. `selfCheck(built)`：产物自检 40 余项（第 743–1039 行）。

**产物自检里最硬的三条**（值得单独点名，因为它们是"数据不许在渲染层静默丢失"的兜底）：

- `折叠覆盖条目 === 未过期优惠条数`（第 932–942 行，从**产物 markup** 里的 `data-model-count` 反算，不是内存里的数）；
- `详情页目录数 === type=deal 条数` 且 `sitemap === 首页 1 + 详情页 N`（第 899–915 行）；
- FAQ 可见文案与 `FAQPage` 逐字一致 + 结构化答案里不许有 HTML 标签（第 991–1024 行，可见侧用**不同的解析器** `visibleFaq()` 回读，避免同源比较恒等）。

---

## 2. `dist/` 产物清点

### 2.1 清单与体积【实测】

```
dist/ 共 139 个文件 · 5,285,602 字节（5.04 MiB）
├── index.html            294055      ← 首页（预渲染 50 张卡）
├── deals.json            132665      ← 已贴译文的那一份
├── feed.xml               44174      ← RSS 2.0，80 <item>
├── feed.json              44571      ← JSON Feed 1.1，80 items
├── sitemap.xml            16210      ← 81 <loc>
├── logos.css               9811      ← 49 个 logo key / 50 条 .lg[data-logo=…] 规则（siliconflow 有 2 条）
├── og-image.png            7808      ← 合法 PNG，1200×630（我读了 PNG 头）
├── robots.txt               747      ← 11 个生成式引擎 + Sitemap 行
├── favicon.svg              403
├── .nojekyll                  0
├── deal/                 80 个目录 × index.html（49543–51033 字节，均值 50140）
└── logos/                49 个文件（27 svg + 22 png，最大 tencent-cloud.png 17203）
```

按扩展名（整棵树）：`.html` 81、`.svg` 28（= logos/ 27 + favicon.svg）、`.png` 23（= logos/ 22 + og-image.png）、`.xml` 2、`.json` 2、`.txt` 1、`.css` 1、`.nojekyll` 1。

### 2.2 80 个详情页 ↔ 80 条 `type=deal` 的一一对应【实测】

用脚本算了两个方向的差集：

```
deals.json: count=133, deals.length=133, type 分布 {deal:80, tool:53}
type=deal 且有 id: 80 条，id 去重后仍是 80（无重复）
dist/deal 目录数: 80，去重后 80
ids-without-dir: []      dirs-without-id: []
id 需要 encodeURIComponent 的: 0 个
```

⇒ **双向零差集**。附带把每条都核了一遍（不止构建自检抽的 3 条）：

| 核对项 | 结果 |
|---|---|
| `<link rel="canonical">` 自指本页 URL | 80/80 通过 |
| 页面含本条 `discountInfo` 前 12 字（无 JS 可读） | 80/80 通过 |
| 每页 2 段 JSON-LD（`WebPage` + `BreadcrumbList`，均可解析） | 80/80 通过 |
| 不出现 `fetch('deals.json'`（纯静态） | 80/80 通过 |
| 有 `og:image` | 80/80 通过 |
| 去掉标签后的可见正文字符数 | 550–1178（最少 `4e659666cbb2`，最多 `c971e33a9cd0`） |

### 2.3 `dist/deals.json` vs 根目录 `deals.json`【实测】

| | 根 `deals.json` | `dist/deals.json` |
|---|---|---|
| 字符 | 107075 | 107148（+73） |
| `count` / `updatedAt` | 133 / `2026-09-28T11:50:50+08:00` | 完全相同 |
| 带 `zh` 的条目 | 43 条 / 61 字段 | 44 条 / 62 字段 |
| 去掉 `zh` 后逐字节比较 | **完全相等** | — |

⇒ 差异 100% 来自构建期贴的译文覆盖层（新增 1 条 `zh`），英文原文字段一字未动。这与 `build-local.js:779-787` 的自检（"译文不能顶掉英文原文"）一致。

---

## 3. 源码 `index.html` → `dist/index.html` 的差异归因

**方法**：不做人工估算——我把源码按 6 个锚点切成 7 段，在产物里按顺序定位每段，取出段间"注入物"，再用源码 + 这些注入物**重建**一份 `dist/index.html`，与真实产物比对。

**结果：`rebuilt === dist` 为 `true`（逐字符相同，233517 字符）** ⇒ 归因闭环，没有"来源不明"的字节。

| 步骤 | 字符增量 | 累计 |
|---|---|---|
| 源码基线 | — | 152977 |
| `__SITE_URL__`（12 字符）×6 → 49 字符 URL（每处 +37） | +222 | 153199 |
| 删除 `<div class="loading">加载数据中…</div>`（含前导换行与缩进，正则 `\s*<div class="loading">…`） | −40 | 153159 |
| 减去 6 个锚点自身长度（24+23+22+27+22+23 = 141） | −141 | 153018 |
| `<!--PRERENDER:topstat-->` → `<b>50</b> 条优惠 · 更新 2026-09-28` | +29 | 153047 |
| `<!--PRERENDER:facets-->` → 10 枚筛选 chip（2 Tab + 2 地区 + 6 厂商，共 1294 字符 + 分隔符） | +1317 | 154364 |
| `<!--PRERENDER:stats-->` → `显示 <b>50</b> 条卡片 · 国内 30 · 国外 20 · 覆盖 <b>4</b> 个力度档位` | +52 | 154416 |
| `<!--PRERENDER:categories-->` → 12 个 `<option>` | +400 | 154816 |
| `<!--PRERENDER:deals-->` → **50 张卡 + 4 条分带**（`data-model-count` 折卡片在内） | +66346 | 221162 |
| `<!--PRERENDER:jsonld-->` → 5 段 JSON-LD | +12355 | **233517** |

**总账闭合**：`152977 + 222 − 40 − 141 + 80499 = 233517`（每一行都是实测值，无残差；重建结果与产物逐字符相同）。

（注入物明细：topstat 29 / facets 1317 / stats 52 / categories 400 / deals 66346 / jsonld 12355 = 80499。这些数字是"源码锚点 → 产物对应位置"之间实测的净增量：`deals` 那 66346 是"50 张卡 + 4 条分带"在把 `loading` 占位删掉之后的净长度，`jsonld` 那 12355 是 5 段 JSON-LD 加上其前导缩进。）

**一句话**：产物比源码净增 80540 字符，其中 **80499（99.95%）是构建期的"注入内容"**——卡片 HTML 66346（占注入量 82.4%）、JSON-LD 12355（15.4%）、骨架填充 1798（2.2%）；其余是 `__SITE_URL__`×6 的 +222 与 `loading` 占位删除的 −40、6 个锚点自身长度的 −141。**CSS 与 JS 一字未改**（`<style>` 块 SHA256 前缀 `f8d7bd69361b784e` 两边相同，应用脚本 103960 字符两边相同，主题脚本 360 字符两边相同）。所以"体积 152977 vs 233517"不是代码膨胀，而是**预渲染把数据渲染进了 HTML**。

---

## 4. 功能面实测（实现机制 + 我跑出来的行为 + 缺陷）

HTTP 实测服务：`node scripts/serve.js --dir=dist` → `http://127.0.0.1:8123/`（只读，未触碰文件）。浏览器实测：`playwright-core@1.63.0` + 系统 Edge（headless），视口 1440×900 / 390×844 / 360×844 / 768×1024 等。

### 4.1 各功能的实现机制（源码位置【引用】）与实测结果

| 功能 | 机制 | 我实测到的 |
|---|---|---|
| 筛选 | `#facets` 预渲染 **10 枚** `button[data-facet]`（2 Tab + 2 地区 + 6 厂商，计数写进 `<b>`），计数由 `facetModel()` 按当前作用域实时算；`renderFacets()` 重建后**把焦点还回同一枚 chip**（`index.html:3303-3315`） | 搜索"百度"→1 张；"GLM"→2 张；"免费额度"→10 张；结果条同步为「显示 N 条卡片 · 国内 x · 国外 y · 覆盖 k 个力度档位」 |
| 分类下拉 | `#categoryFilter`，选项由 `categoryOptionsHtml()` 从数据现场生成（12 个分类） | 选「API服务」→ 20 张卡（数据里 `API服务` 有 36 条 deal，折叠后 20 张卡，口径自洽） |
| 搜索 | `matches()`（`index.html:2011-2028`）拼 `title/vendor/discountInfo/description/category/source/eligibility/features` 小写子串匹配，输入 200ms 防抖（`bindEvents` 里 `debounce`） | 空态正常：「zzzz-no-match」→ 0 张 + 「没有匹配的条目」+ 1 个空态元素，无 JS 错误 |
| 排序 | 3 枚按钮 `data-sort=tier/expiry/updated`；`orderCards()`（2046-2066）；`compareCards()` = 档位 → 剩余天数 → `lastSeen` 降序 | 「最近更新」= 按 `lastSeen` 降序，实测前 10 张全部 `数据更新 2026-09-28`；**「即将截止」在当前数据下退化成"最近更新"**（见 4.3） |
| 收藏 | 星标**完全由 JS `createElement` 建并挂到卡片上**（`buildFavButton()`/`syncFavStars()`，3128-3160），存 `localStorage['dsh.favorites']`；预渲染 HTML 里 0 个收藏控件（`build-local.js:861-874` 断言） | 关 JS 时星标数 = 0（我实测 `favToggles` 不可见、预渲染 markup 无 `data-fav-*`）；水合后收藏功能由门禁 17.5/17.7 覆盖（未重复跑） |
| 对比 | 底部条 + `<dialog>` 全由 JS 建；选择集是**跨视图的集合**（与筛选解耦），并可写进 `?compare=id,id,…` 分享 URL（`syncCompareUrl()` 2863-2874），上限 `CMP_MAX = 4` | 门禁 17.6 已覆盖"换筛选后仍能并排"；我未重复。产物自检断言 `const CMP_MAX = 4;` 仍在（`build-local.js:877`） |
| 卡片折叠 | `foldKey()` = `(canonicalVendor, offerKind 去掉品牌词的尾巴, eligibility, validity)`；再加一轮"同厂商 + 去品牌词后同类"合并（`foldDeals()` 1911-1964）。**适用条件与有效期留在键里**，组内不一致就不合并 | 默认视图 **50 张卡覆盖 80 条优惠**；其中 3 张折叠卡：`智谱AI 免费模型`(7)、`百度千帆 新用户免费额度`(17)、`火山方舟 免费额度`(9) ⇒ 47 + 33 = 80，与构建无损断言吻合 |
| 列表视图 | `rowsHtml()` 生成 `.r` 行；`.seg` 由 `body.js` 门控；偏好存 `localStorage['dsh.view']` | 768px 下 50 行、行高 54px、无横向溢出、150 个隐藏列单元；`@media (max-width:900px)` 保留"档位+logo+标题+CTA"四列 |
| 暗色模式 | `<html data-theme>` 优先；未设时走 `@media (prefers-color-scheme: dark) :root:not([data-theme="light"]):not([data-theme="dark"])`；首屏前置脚本防 FOUC（`index.html:15-24`） | **系统自动暗色我自己测了**（`emulateMedia({colorScheme:'dark'})` + 无 `data-theme`）：`--bg` 变 `#0b0d10`、`--card` `#14171c`、`color-scheme: dark`、主题段 `aria-pressed` 落在「跟随系统」——功能正常，而**门禁从没用过 `emulateMedia`，这条路径它没覆盖** |
| 移动端 | 3 个断点：`900px`（行视图收列）/ `1180px`（3→2 列）/ `760px`（2→1 列，`--cardH:auto`，`.rright` 允许换行，`.jump` 改 4 等分网格） | 见 4.4 断点实测 |

### 4.2 真缺陷 ①：`#jumpNav` 死锚点（线上生效）【实测】

`render()` 里写的是：

```js
// index.html:3343-3345
// 锚点只在「力度优先 + 卡片视图」下有效（列表视图不分带），避免死锚点
const jump = document.getElementById('jumpNav');
if (jump) jump.hidden = rowsView || (state.filters.sort || 'tier') !== 'tier';
```

但 `.jump` 定义了自己的 `display`（`index.html:303-306` `display:flex`；`@media (max-width:760px)` 里 `display:grid`）。**作者样式表覆盖了 UA 样式表的 `[hidden]{display:none}`**，`hidden` 属性因此只改了属性、没改渲染。

实测（1440×900，水合后）：

| 状态 | `hidden` 属性 | computed `display` | `offsetHeight` | 分带数 | `#tier-1..4` 落点 |
|---|---|---|---|---|---|
| 力度优先 + 卡片 | false | flex | 28 | 4 | 4 个都在 |
| **最近更新（排序）** | **true** | **flex** | **28** | **0** | **0 个存在** |
| 列表视图 | true | flex | 28 | 0 | 0 个存在 |
| 390px + 最近更新 | true | grid | 28 | 0 | 0 个存在 |

- 可见文案仍是「跳到 ① 完全免费 ② 免费额度 ③ 身份优惠 ④ 折扣促销」，390px 下几何 `{top:303, h:28, w:358, inViewport:true}`。
- 点「① 完全免费」：`scrollY 0 → 0`（没滚动），`location.hash` 变成 `"#tier-1"`，而 `document.getElementById('tier-1')` 为 `null` ⇒ **4 个死锚点 + 一个骗人的 hash**。
- 线上同样：我抓了线上 `index.html`（294055 字节，与本地 `dist/index.html` 字节数一致），其中 `jump.hidden =` 存在、`.jump[hidden]` 规则**不存在** ⇒ 缺陷在线上生效。
- 仓库对同类问题的补丁是有先例的：CSS 里存在 `.cmpbar[hidden]{display:none}` 与 `body.js .cmpdlg[hidden]{display:none}`（`verify-site.js:1647` 的注释还专门复盘过 `<dialog>` 那次踩坑）——**唯独 `.jump` 没有再写一条 `[hidden]` 规则**。【实测】

**为什么门禁是绿的**（这条比缺陷本身更值得记）：

```js
// verify-site.js:1150-1152
document.querySelector('[data-sort="updated"]').click();
const hidden = document.getElementById('jumpNav').hidden;   // ← 读属性，不读渲染
// verify-site.js:1158
check('非分带排序时锚点导航隐藏（不留死锚点）', jumpToggle.hidden === true && jumpToggle.bands === 0 && …)
// verify-site.js:1317 / 1327 同样只读 .hidden
```

断言方向是对的（"不留死锚点"），判据选错了（属性 ≠ 可见性）。这正是仓库自己在别处反复强调要避免的坑——`build-local.js:806-807` 写着"**要数的是元素，不是文本**"，`verify-site.js:1674` 写着"量几何，不只看 open 属性"；到了 `jumpNav` 就退回读属性了。

### 4.3 真缺陷 ②：搜索不索引中文译文【实测】

`matches()` 的检索域（`index.html:2022-2023`）是 `title / vendor / discountInfo / description / category / source / eligibility / features`——**不含 `zh.*`**。而站点把「中文译文」当卖点（卡片上有「中文」标记，详情里译文显示在英文原文下面，门禁第 11 节专门验这件事）。

实测：取 Perplexity 那条（id `c05dc74bfd78`）译文里的 8 字片段「通过验证的学生与」（该片段**只**出现在 `zh.discountInfo` 里，不出现在任何被检索字段），在搜索框输入：

```
搜索「通过验证的学生与」→ 卡片 0 张 · 没有匹配的条目
同页卡片正文里含该片段的卡片: false
```

⇒ 用户在详情里读到的中文，拿去搜索**搜不到**。这是**中文用户视角的功能缺口**，门禁没有覆盖（门禁第 8 节只测了"搜索有结果且收窄"）。

补充：该 `zh` 文本确实对用户可见（详情弹层里渲染），所以这不是"搜了一个用户看不到的词"。【实测：`build-local.js:571-578` 详情页/弹层用 `renderCore.detailHtml(deal)`，其中 `zhBlock()` 输出译文；门禁 §11 断言译文显示在原文下面】

### 4.4 真缺陷 ③：关掉 JS 有 15 个"看起来能点"的死控件【实测】

关 JS（`javaScriptEnabled:false`）1440×900 实测：

```
正文 12565 字符 · 卡片 50 张（全部可见）· 分带 4 · 官方外链 50 · 站内详情链接 50
loading 占位残留 0 · body.js class: false · lastUpdated 文本: "--"
死控件（可见但无任何事件处理器）:
  筛选 chip 10 枚 · 排序按钮 3 枚 · 分类 <select> 1 · 搜索 <input> 1
已正确隐藏:
  主题切换 0 枚 · 视图切换 0 枚（.seg 被 body.js 门控）
```

`body.js` 门控只写在 `.seg`（`body.js .seg{display:flex}`）与收藏/对比（整块由 JS 建）上；`.facets`/`.sortbox`/`.catpick`/`.search` 没有门控。事件绑定全部发生在 `loadDeals().then(...)` 里（`index.html:3530-3532` 的 `setupPrefs(); bindEvents(); render();`），脚本被拦或禁用时**一个监听器都不会存在**。

⇒ 与仓库自己的宣称（`build-local.js:861-874` 的 G11 规矩："无 JS 时不给可点暗示"）**只落实了一半**。严重度不高（内容可读、无报错），但这是"文档承诺 vs 现实"的一处偏差，且门禁只断言了收藏/对比那半边。

### 4.5 数据面导致"功能存在但不可观测"【实测】

- `type=deal` 80 条里 **`expiresAt` 非空 0 条**；`validity` 非空 61 条，其中含「长期/永久/常年」22 条。
- ⇒ 「即将截止」排序按钮**当前永远退化成"最近更新"**：实测点击后 50 张卡的到期标记全是「未标注截止日期」，无法通过页面验证这条排序的真实语义。FAQ 里对此有解释（`index.html:923-925`），属于**诚实处理**，但意味着"排序功能"在当前数据下只有 2/3 可被用户观测。
- 反过来说，「含截止时间 0 / 未标注 112 / 长期 21」这组 captain 留的疑点，在前端侧的口径是：32 条人工策展条目带 `validity` 文本，爬取条目基本没有；到期标记由 `expiryState()` 从 `expiresAt` 推，没有日期就明说「未标注截止日期」而不会写成"长期"。

---

## 5. `verify-site.js` 的覆盖边界（142 项断言到底管了什么）

### 5.1 断言结构与总量【实测】

- 文件 119694 字节 / 2126 行；`check(` 出现 **144** 次 = **143 个调用点** + 1 个函数定义。
- 22 个 section（`console.log('\n=== …')`）：1 无 JS 骨架 / 2 有 JS 默认视图 / 3 logo 真画出来 / 4 内容没被裁 / 4b 折叠卡 6 条判据 / 5 logo 簇 hover 不影响布局 / 6 详情弹层 / 7 筛选排序 / 8 搜索 / 9 全部工具 Tab / 10 移动端 390px / 11 详情页中文翻译 / 13 主题·无障碍·对比度 / 14 订阅·锚点·纠错入口 / 15 独立详情页 / 16 紧凑行视图 / 17 键盘可达与焦点归还 / 17.5 收藏对比 / 17.6 对比与筛选解耦 / 17.7 收藏入口 / **10) 请求与错误**（编号重复，实际是第 18 节）/ **12) 回归比对**（在 17.7 之后，编号倒挂）。
- **编号 bug**：`=== 10)` 出现两次（L641 与 L2061），`=== 12)` 出现在 L2080（在 17.7 之后）；section 编号没有 18，也没有真正的 12 位置。不影响断言，但会让人读日志时误判进度。
- 调用点 143 中，7 个在 `if (compareArg)` 分支里（6 个指标比对 + 1 个"基线文件存在"）：
  - `npm run verify`（**不带 `--compare`**）→ 执行 **136** 项（与 README「136 项断言」一致）；
  - `node scripts/tools/verify-site.js --compare=…`（基线存在）→ 执行 **142** 项（与 captain 读数一致）；
  - `--compare=` 指向不存在的文件 → 137 项（只有一个"基线文件存在=false"）。

### 5.2 门禁**没**覆盖什么（审计重点）

按"如果它坏了，门禁会不会红"来排（A=不会红且我很在意）：

| # | 盲区 | 证据 / 为什么 |
|---|---|---|
| A1 | **"隐藏"类断言只读属性不读渲染** | `jumpNav.hidden` 三处（L1152/1156、L1317、L1327）—— `#jumpNav` 死锚点就是这么溜过去的（§4.2）。同类写法还在 `#cmpbar`（L1562/1592/1712/1778/1816）上；`.cmpbar` 有 `[hidden]` CSS 补丁所以目前没事，但判据本身仍是"属性"。 |
| A2 | **门禁自己有多少条断言无人守** | 基线 `verify.json` 的 `total` = **132**；现在 136/142。`--compare` 只读 `parsed.metrics`（L2086），`checks` 数组写进 JSON 却**从不参与比对** ⇒ 删掉/改写任何一条断言，回归比对照样绿。`check-ci-consistency.js --expect-checks=24` 只钉住 CI 一致性脚本自己的 24 项，与本文件无关。 |
| A3 | **回归比对不在 CI 里** | `.github/workflows/verify.yml:235` 跑的是 `node scripts/tools/verify-site.js`（无 `--compare`）；`package.json` 的 `verify` 也没有 `--compare`（`verify:regress` 才有）。基线是**手工**用法，CI 从不读它。⇒ captain 的疑点"旧基线会不会掩盖新回归"的准确答案是：**CI 里根本没有基线比对**；而手工比对时，6 个指标是"单向不倒退"的计数器（`coveredDeals ≥ 80`/`cards ≥ 50`/`firstScreenFull ≥ 9`/`pageHeight ≤ 4566×1.15`/`externalRequests ≤ 0`/`jsErrors === 0`），**没有 id 集合指纹、没有内容哈希** ⇒ 80 条优惠被换成 80 条完全不同的假优惠也能过。 |
| A4 | **对比度断言是"额度"不是"门槛"** | L1060 `check('亮色主题：低于 4.5:1 的文本 ≤ 20', lightContrast.below <= 20)`，L1087 暗色同款。DESIGN-RULES.md:128 写的是"抽样 723 节点 **0 条**低于要求"。我独立复算是 714 抽样 / **0 条**（§8），也就是说**当前真值是 0、闸门开到 20**——新增 20 个不达标文本节点仍然全绿。 |
| A5 | **断点只测 1440 / 390 / 360** | 全文件 `viewport` 只有 `{1440,900}`，`setViewportSize` 只出现 390/360。CSS 有 `900 / 1180 / 760` 三个断点 ⇒ **768（iPad 竖屏）、1180 边界、761/760 边界都没测**。我补测了（§8）。 |
| A6 | **从不 `emulateMedia`** | 全文件 grep 不到 `emulateMedia`/`prefers-color-scheme` 模拟 ⇒ 只有"手动点深色"被验过，"跟随系统自动暗色"这条真实路径没人验（我补测：正常）。`prefers-reduced-motion` 是唯一被模拟的媒体特性（L1116 附近的 `check('prefers-reduced-motion 下动效被关掉')`）。 |
| A7 | **没有真正的无障碍工具链** | 全文件 0 次 `axe`、0 次 `a11y`。只有 3 条手写 a11y 断言（语义标签齐备、`aria-pressed` 全覆盖、对比度）+ 键盘可达那 4 条。**没有**检查：标题层级/有无 h1（现实是 0 个 h1、h3 在 h2 之前）、跳过导航（无）、地标重复/命名、表单标签、`aria-*` 合法性、zoom 200% 重排、文本间距。 |
| A8 | **不验"死链接"** | 外链从不请求（只统计外部请求数=0）；首页 50 个 `deal/<id>/` 内链的**落点**靠构建自检的目录计数保证，verify 侧不逐条打开（只打开 1 个样本 + sitemap 计数）。 |
| A9 | **不验 HTML 结构合法性** | 无 HTML 校验器。我补测：无重复 id、128 个 `a[href]` 里的 81 个站内相对链接与 4 个同页锚点**全部有落点**（当前没问题，但这是"运气好"而非"门禁保的"）。 |
| A10 | **搜索只测"能收窄"** | L584 `check('搜索有结果且收窄')` 只用一组关键词。中文译文可搜性（§4.3）、拼音/别名、大小写、空态、防抖竞态都不在覆盖里。 |
| A11 | **部署链上的门禁强度弱于 PR 门禁** | `deploy.yml:49` 直接 `node scripts/tools/build-local.js`（内部 `runValidate()` **不带 `--strict`**），而 `verify.yml:146` 用 `--strict`（多 4 条数量阈值：deals≥40 / cn≥20 / total≥100 / 带时间信息≥60%，见 `validate.js:331-337`）。且机器人用 `GITHUB_TOKEN` 推的 commit **不会触发 verify.yml**（`verify.yml:22-23` 自己写明了）⇒ **每日自动发布这条路上没有真浏览器门禁**，只有构建自检 + 非 strict 校验。 |
| A12 | **不验产物与源码的一致性以外的东西** | verify 只跑 `dist/`（`serve(DIR)`），不检查"源码里删了样式但产物是旧的"这类漂移——不过 `npm run build` 在 CI 是必经步骤，风险有限。 |

### 5.3 基线文件的时间戳与"旧基线掩盖新回归"【实测】

- `research/_raw/ours-baseline/verify.json`：文件 mtime `2026-09-27T15:53:13Z`，内部 `generatedAt` = **`2026-09-27T15:50:34.934Z`**，`target` = 一次性本地端口 `http://127.0.0.1:57366/`，`total` = 132、`failed` = 0。
- 当前 `HEAD`（`a0c4ab2`）是 **2026-09-28 12:10:53 +0800 = 04:10:53Z** ⇒ **基线早于被测代码约 12.3 小时**。
- 但基线里的 6 个可比指标与当前实测**完全一致**：`cards 50`、`coveredDeals 80`、`firstScreenFull 9`、`pageHeight 4566`、`externalRequests 0`、`jsErrors 0`（我在 1440×900 复测：`full 9 / part 12 / cardH 192 / gridTop 196 / pageHeight 4566`，与基线同值）。
- 结论【推断】：**基线旧，但没有掩盖任何"这 6 个指标"上的回归**（因为两次值相同）；真正的风险不是"旧"，而是**它只覆盖 6 个计数器**（§5.2 A2/A3），且**不在 CI 路径上**。capain 的疑点应改写为："基线不是旧到掩盖了回归，而是这套比对从来不是门禁的一部分，而且比对的维度窄到测不出内容替换。"

### 5.4 门禁真实强度的公允评价

说句公道话：作为**单文件零依赖站点**的手写门禁，这份 `verify-site.js` 的密度罕见——它验的是真浏览器里的几何、焦点、localStorage、URL 分享、跨筛选的选择集、被折叠条目的可达性，而且很多断言是**对抗性复核后重写过的**（`build-local.js:289-293`、`verify-site.js:289-292` 的注释记录了"旧判据不可证伪"的复盘）。142 项 0 失败是可信的。**它的问题在于"判据选型"和"守门人的守门人"**：少数量断言读属性而非渲染（A1）、自己的规模无人守（A2）、回归不在 CI（A3）、阈值比文档松（A4）。

---

## 6. 零构建 / 零依赖 / 零 CDN 宣称是否属实

| 宣称 | 核查 | 结论 |
|---|---|---|
| 「不热链任何 CDN / 字体 / 图标库 / 统计」（DESIGN-RULES N1） | ① 线上 `index.html` 抓下来：`<link rel=stylesheet>` 只有 1 个 `logos.css`（同源）；`<img>` **0**、`<iframe>` **0**、`<video>` **0**；CSS 里 **无 `@font-face`**。② HTTP 实测：11 条路径全部 `127.0.0.1:8123` 同源返回 200。③ 52 个 http(s) 出现处全是 `<a>` 外链、JSON-LD 里的自址或卡片 CTA，不是资源请求。 | **属实**【实测】 |
| 「构建不需要 npm install」（`deploy.yml:47`） | 用 require 闭包追踪：`build-local.js → og-image(zlib,fs,path) / logos(fs,path) / render-core(fs,path,vm) / zh(fs,path)`；`validate.js → schema(crypto) / expiry / classify / categories / zh`。**闭包内 0 个 npm 包**。（`verify-site.js` 需要 `playwright-core`，是 dev 依赖，只在门禁里。） | **属实**【实测】 |
| 「零构建（浏览器端）」 | 页面确实没有 bundle 步骤：CSS/JS 全内联，`logos.css` 是构建期生成的静态表。但要注意"零构建"只在**浏览器端**成立；发布侧有 `build-local.js` 这道 1150 行的组装+自检，且 CI 必须跑——README/DESIGN-RULES 的"零构建"措辞容易被读成"发布也不需要构建"。 | **属实（浏览器端），措辞偏乐观**【推断】 |
| 「不依赖 JS 也能读到内容」 | 关 JS 实测：12565 字符正文、50/50 卡片可见、50 个站内详情链接、50 个官方外链、4 条分带、`loading` 占位已删。单条详情页关 JS 也有 550–1178 字符正文（构建自检要求含本条文案）。 | **属实**【实测】 |
| ↳ 但 | 15 个筛选/排序/搜索控件无 JS 时可见却无效（§4.4）；页脚"最后更新："显示为 `--`（预渲染不填，只在 `loadDeals().then` 里填）。 | **偏差**【实测】 |

---

## 7. 结构化数据与 SEO / GEO 面

### 7.1 实测内容

| 产物 | 实测 |
|---|---|
| `sitemap.xml` | 81 条 `<loc>` = 首页 1 + `deal/<id>/` 80；`lastmod` 全部 `2026-09-28`；与 `deals.json` 的 `type=deal` id 集合**完全相等**【实测】 |
| `feed.xml` | RSS 2.0；80 `<item>`；`guid` 80 个各不相同（= deal id）；`channel/lastBuildDate` = `Mon, 28 Sep 2026 03:50:50 GMT`（= `updatedAt`）；**80 条的 `<link>` 只有 49 个不同 URL**，全部指向**厂商官方页**而非站内详情页；80 条的 `<pubDate>` **全是同一天** `Mon, 28 Sep 2026 00:00:00 GMT`（按 `lastSeen` 日期取整） |
| `feed.json` | JSON Feed 1.1；80 items；字段 `id / url / title / content_text / date_modified / tags`；`id` = deal id，`url` = 厂商官方页；与 `feed.xml` 条数一致（构建自检也断言一致） |
| `robots.txt` | 747 字节；`User-agent: *` + **11 个生成式引擎显式放行**（GPTBot、ChatGPT-User、OAI-SearchBot、ClaudeBot、Claude-Web、PerplexityBot、Google-Extended、Applebot-Extended、Amazonbot、cohere-ai、Meta-ExternalAgent）；末行 `Sitemap: …/sitemap.xml` |
| 首页 JSON-LD | 5 段：`Organization`(381) / `WebSite`(420) / `BreadcrumbList`(397) / `FAQPage`(1738，5 问) / `ItemList`(9185，`numberOfItems: 50`) |
| 详情页 JSON-LD | 每页 2 段：`WebPage` + `BreadcrumbList`（80/80 全量核对，均可 `JSON.parse`） |
| canonical / hreflang / OG | 首页与详情页都有自指 canonical + `hreflang zh-CN/x-default` + `og:image`(1200×630，PNG 头实测合法) + `twitter:card` |

### 7.2 三处值得记的口径问题【实测 + 推断】

1. **`ItemList` 只覆盖 50 张卡片，30 条被折叠的优惠不在结构化数据里**。`buildJsonLd()`（`build-local.js:303-322`）注释写得很清楚："与页面可见卡片一一对应（折叠后一条优惠一张卡）"。折叠卡的成员名写进了 `description`（如"覆盖 7 个模型：GLM-4.7-Flash、…"），所以长尾模型名**以文本形式**进入了结构化数据——但没有独立的 `ListItem`。
2. **`ItemList` 的 `url` 指向厂商官方页，不是站内 80 个详情页**（`url: card.url`）。50 个条目只有 **43 个不同 URL**。而站内明明为 80 条优惠各建了可索引的详情页（首页标题链接也都指向 `deal/<id>/`）。这是 **SEO/GEO 上最明显的一处未接起来的地方**：结构化数据把权重导给了厂商页，而不是自己在 sitemap 里申报的详情页。【实测 + 推断】
3. **首页 `BreadcrumbList` 只有 2 级，且第 2 级 `name`="AI 工具优惠"、`item` = 首页自身 URL**（`build-local.js:284-291`）。首页面包屑本身指回首页，语义上是空的；详情页的面包屑（3 级）是正常的。【实测】
4. **feed 的 `<link>` 同理指向厂商页** ⇒ 订阅者点"阅读原文"离开站点；且 80 条 item 只有 49 个不同目标，RSS 阅读器里会出现"多条条目指向同一页"。【实测】

---

## 8. 无障碍 / 移动端实测（挑门禁没覆盖的角度）

### 8.1 独立对比度复算【实测】

我自写了一份 WCAG 相对亮度实现（背景沿祖先链找第一个 `a≥0.95` 的纯色，遇 `background-image` 跳过；半透明前景先与背景混合；大字按 3:1 判），与门禁的探针**不同源**：

```
亮色（1440×900）：sampled 714 · skipped 8（复杂背景） · below 0 · worst []
手动深色        ：sampled 714 · skipped 8 · below 0 · worst []
```

⇒ 与 DESIGN-RULES.md:128 "亮色 723 节点 0 条低于要求（最低 4.51）、暗色 0 条（最低 5.98）"**方向一致、量级一致**（我的抽样数略少，因为我没把 `#detail` 弹层打开）。**页面当前的对比度是真的达标**；问题只在门禁阈值（≤20）比文档承诺（0）松（§5.2 A4）。

### 8.2 标题层级 / 地标 / 焦点顺序【实测】

```
h1: 0 个                    ← 整站没有一级标题
h2: ["常见问题"] 1 个
h3: 50 个（卡片标题）
DOM 里第一个标题标签: H3      ← 层级倒置（h3 先于 h2 出现）
.tierhead 的 tagName: DIV     ← 力度分带不是标题，屏幕阅读器无法按标题跳档
landmark: header×1 · main×1 · nav×2（"优惠筛选" / "跳到力度档位"）· role=status×1
role="group" 共 54 个（DOM 实测）：4 个真控件组（配色主题 / 筛选 / 排序 / 视图）+ 50 张卡片（aria-label="…（按回车查看详情）"）
[tabindex] 共 50 个，全部是卡片上的 tabindex="0"
.lg 图形元素 53 个：50 个官方图形（data-logo）+ 3 个名称缩写兜底（class="lg text"）
无「跳到正文 / skip link」（grep 计数 0）
```

Tab 焦点顺序（1440×900，前 26 站，实测）：品牌 → 搜索框 → 主题 3 枚 → 筛选 chip 10 枚 → 分类下拉 → 排序 3 枚 → 视图 2 枚 → 跳档 4 枚 → 第一张卡片。顺序本身**合理且可预测**，没有陷阱；但因没有 skip link，键盘用户要走到正文必须穿过 25 个控件（WCAG 2.4.1 可由 landmark 技术满足，属**可用性/最佳实践欠缺**，不算硬失败）。

`role="group"` + `aria-label` 用在 50 张卡片上：**可用但非常规**——它给每张卡一个可读的名字（对键盘用户友好，门禁 17 节就验这条），代价是 aria-label 覆盖了卡内标题对辅助技术的名称暴露，且无障碍树里多了 50 个 group 节点。属**口味问题**，非缺陷。【推断】

### 8.3 断点实测（门禁只测 1440/390/360）【实测】

| 视口 | 列数 | 首卡尺寸 | 页面横向溢出 | 卡内 `scrollWidth>clientWidth` 元素 | 搜索独占整行 |
|---|---|---|---|---|---|
| 1440 | 3 | 452×192 | 0 | 3 | 否 |
| 1181 | 3 | 372×192 | 0 | 3 | 否 |
| 1180 | 2 | 564×192 | 0 | 3 | 否 |
| 900 | 2 | 424×192 | 0 | 3 | 否 |
| **768** | **2** | **358×192** | **0** | **3** | 否 |
| 761 | 2 | 355×192 | 0 | 3 | 否 |
| **760** | **1** | **728×168** | **0** | **3** | 是 |
| 390 | 1 | 358×176 | 0 | 3 | 是 |
| 360 | 1 | 328×176 | 0 | 3 | 是 |

- **768（iPad 竖屏）落在 2 列档**，卡片 358×192，无溢出——**门禁从没测过这个宽度，实测没问题**。
- 断点边界行为精确：1180→2 列、760→1 列、900 只管行视图收列。
- 那 3 个"超出容器宽度"的元素是**折叠卡的成员条 `.fmembers`**：`overflow-x:auto` + `white-space:nowrap`，`scrollW 2984/2009/2814` vs `clientW 422` —— 它们是**有意的横向滚动带**，且内部是**可聚焦的 `<a>` 链接**（键盘能 Tab 进去、`:focus-within` 有高亮），不属于"内容被裁"。门禁的"卡片内容无溢出"用另一套判据（最后一个子元素底边 vs 卡片内边距 + `overflowY`），两者不矛盾。【实测，纠正一个表面误报】
- 列表视图 @768px：50 行、行高 54px、150 个列单元被 `display:none`、无横向溢出、触控目标 54px ≥ 44px。【实测】

### 8.4 系统自动暗色（门禁盲区，我补测）【实测】

`emulateMedia({colorScheme:'dark'})` + `localStorage` 清空 + 无 `data-theme`：

```
data-theme 属性: null      ← 不写死属性，走纯 CSS 媒体查询
color-scheme: dark
--bg: #0b0d10 · --card: #14171c · body 背景: rgb(11,13,16)
主题段 aria-pressed: ["auto"]   ← 状态与视觉一致
```

⇒ 「跟随系统」这条路径**实现正确**，只是门禁没验（§5.2 A6）。

---

## 9. 文档 vs 现实：本次前端侧抓到的不一致

| 文档说什么 | 实测是什么 | 差在哪 |
|---|---|---|
| `README.md:407`「`npm run verify`：… 跑 **136 项断言**」 | `npm run verify` 不带 `--compare` → 确实 **136** 项 | **一致**（但 `--compare` 时是 142 项，文档未提） |
| `verify.yml:188` Summary 文案「verify-site.js / **136 项断言**」 | 136（无 compare）/ 142（有 compare） | 一致但会随断言新增而漂 |
| `DESIGN-RULES.md:128`「verify 断言：亮色抽样 723 节点 **0 条低于要求**；暗色 0 条」 | 我的独立复算 714/0 与 714/0；**但断言本身只要求 ≤20** | 结论对、**判据比文档松 20 倍** |
| `DESIGN-RULES.md:104`「我们的 **62 张卡**的 facet 已够用」；`:150`「首页断掉 `deals.json` 仍有 **62 卡**」；`SUMMARY.md:43`/`NEXT-STEPS.md:17`「62 张卡集体 3px 纵向溢出」；`PROJECT_STATUS.md:621/1009/1072/1889` 同 | 默认视图 **50 张卡**（3 张折叠卡覆盖 33 条 + 47 张单条卡） | 文档停在折叠口径调整之前 |
| `PROJECT_STATUS.md:825`「列表视图不分带，顶部锚点导航**随之隐藏（不留死锚点）**」；`:1460` 同 | **没隐藏**：`hidden=true` 但 `display:flex`，28px 可见，4 个死锚点（§4.2） | **文档与线上现实不符**，且门禁读数支持文档、不支持现实 |
| `DESIGN-RULES.md:86`「N2 构建确定性 …**项目既有断言**」；`:155`「✅ 连续两次构建：`index.html` 与 `deal/<id>/` 的 SHA256 均一致」 | 全仓库 `scripts/` + 4 个 workflow + `package.json` 里 grep `sha256|SHA256|确定性|determinis|两次构建` → **0 命中**（唯一 `createHash` 是 `schema.js:278` 的 sha1 指纹，用途无关） | 「既有断言」实则是一次性人工比对；`build-local.js` 里 `new Date()` 只在 `updatedAt` 缺失时作为回退（`:353`），当前数据下构建是确定性的【推断】，但**没有脚本守着它** |
| `DESIGN-RULES.md:6` 适用范围「`index.html`（浏览器端零依赖、零构建…单文件）」 | 浏览器端属实；发布侧有 1150 行构建脚本 | 措辞容易被误读 |
| `PROJECT_STATUS.md:1696`「`verify` **136 项 0 失败**（原 132）· `verify:regress` **142 项 0 失败**」 | 与我的静态计数完全吻合（136 / 142） | **一致**（这条文档是准的） |

---

## 10. 未证实项（我明确没有证明的东西）

1. **构建确定性没有实测**：纪律禁止跑 `npm run build`（会重写 `dist/`），所以"连续两次构建 SHA256 一致"我只能做到**静态推断**（`build-local.js` 唯一的时间来源是 `payload.updatedAt`，`og-image.js`/`logos.js` 无 `Date`/`Math.random`），**没有跑第二次构建去证**。要证实需要一份可写副本 + 跑两次 `build-local.js --out=<temp>`（脱离本任务范围）。
2. **`--compare` 全量复跑没做**（captain 已跑过 142/142，我按纪律不重复）。我只静态算了断言条数并复现了基线里的 6 个指标值（`cards 50 / coveredDeals 80 / firstScreenFull 9 / pageHeight 4566 / externalRequests 0 / jsErrors 0`）。
3. **真实浏览器的 200% zoom / 文本间距 / 强制高对比模式（`prefers-contrast`）** 未测。
4. **屏幕阅读器（NVDA/VoiceOver）语义树实读**未做——我用的是 DOM/属性层面的检查（h1 缺失、`role=group` 计数、标签完备性），不等于"读屏体验已验证"。
5. **外链可达性（35 个域名、50 个 CTA）没验**——只验了同源请求 0 失败、外部请求 0。
6. **iOS Safari / Firefox / 安卓真机**未测；所有浏览器实测都是 Windows 上的 Edge（与 CI 的 chromium 同内核但不同构建）。
7. **`feed.xml`/`feed.json` 在真实阅读器中的渲染**未测；只做了结构、条数、guid 唯一性、link 去重率的静态核对。
8. **线上缓存行为**（GitHub Pages 的 CDN 缓存何时换新产物）未测；我只观察到 `last-modified: Mon, 28 Sep 2026 04:11:20 GMT` 与本地 `dist/index.html` 字节数一致。
9. **1709 行 `verify-site.js` 我没有逐行读完**（按任务要求抓结构）：我读了 L1-293、L983-1175、L1200-1290、L2060-2125 与全部 143 个 `check()` 的文案，中间若干段的**具体判据细节**可能还有我没发现的"读属性不读渲染"类问题——§5.2 A1 给的是**已确认的 4 处**（L1152/1156/1317/1327）+ 同类写法的高风险清单，不是穷举。
10. **少量静态计数我没做 DOM 复核**：`data-logo`/`tabindex`/`role="group"` 这几个数我用 DOM 复核过了（50/50/54）；但"`logos.css` 里 50 条规则对应 49 个 key"、"整份 HTML 里 16 处 `data-facet="` 其中 6 处在内联脚本里"这类**字符串计数**我只做了静态统计，没有逐条定位到行号。

---

## 11. 命令清单（全部只读；可在同目录原样复跑）

### 11.1 起服务（HTTP 实测用，指向已存在的 dist，不构建）

```powershell
cd 'D:\OneDrive\Desktop\Code\AI Page'
node scripts/serve.js --dir=dist --port 8123        # 前台；或另开窗口
```

### 11.2 体积 / 成分 / 差异归因

```powershell
# 字节 vs 字符（任务书里 152977/233517 是字符数）
node -e "const fs=require('fs');for(const f of ['index.html','dist/index.html']){const b=fs.readFileSync(f);console.log(f,'bytes='+b.length,'chars='+b.toString('utf8').length)}"

# 成分拆分（style / script / RENDER-CORE）
#   见 §1.1 的脚本骨架：/<style>([\s\S]*?)<\/style>/、/<script>\n    'use strict';[\s\S]*?<\/script>/、
#   RENDER-CORE:START … RENDER-CORE:END
node -e "const fs=require('fs');const s=fs.readFileSync('index.html','utf8');const st=s.match(/<style>[\s\S]*?<\/style>/)[0];const ap=s.match(/<script>\n    'use strict';[\s\S]*?<\/script>/)[0];console.log('style',st.length,'app',ap.length,'shell',s.length-st.length-ap.length)"

# 占位符残留
node -e "const fs=require('fs');for(const f of ['index.html','dist/index.html']){const s=fs.readFileSync(f,'utf8');console.log(f,'{{ }}:',(s.match(/\{\{[^}]*\}\}/g)||[]).length,'__SITE_URL__:',(s.match(/__SITE_URL__/g)||[]).length,'PRERENDER 标记:',(s.match(/<!--PRERENDER:/g)||[]).length)}"
```

### 11.3 产物清点与一一对应

```powershell
Get-ChildItem dist -Recurse -File | Sort-Object FullName | ForEach-Object { "{0,9}  {1}" -f $_.Length, $_.FullName.Substring((Resolve-Path dist).Path.Length+1) }
(Get-ChildItem dist -Recurse -File | Measure-Object Length -Sum).Sum      # 5285602

# 80 目录 ↔ 80 条 type=deal（双向差集）
node -e "const fs=require('fs');const d=JSON.parse(fs.readFileSync('deals.json','utf8'));const ids=d.deals.filter(x=>x.type==='deal'&&x.id).map(x=>x.id);const dirs=fs.readdirSync('dist/deal');const a=new Set(ids),b=new Set(dirs);console.log('ids',ids.length,'dirs',dirs.length,'ids-no-dir',ids.filter(i=>!b.has(i)),'dirs-no-id',dirs.filter(x=>!a.has(x)))"
```

### 11.4 线上实测（只抓取，不改动）

```powershell
node -e "fetch('https://buguoshixc.github.io/ai-deals-aggregator/').then(async r=>{const b=Buffer.from(await r.arrayBuffer());console.log(r.status,b.length,r.headers.get('last-modified'))})"
node -e "fetch('https://buguoshixc.github.io/ai-deals-aggregator/sitemap.xml').then(r=>r.text()).then(t=>console.log('loc',(t.match(/<loc>/g)||[]).length))"
```

### 11.5 门禁规模 / 覆盖边界静态核对

```powershell
# check() 调用点 143 处；无 --compare 执行 136；带基线执行 142
node -e "const fs=require('fs');const s=fs.readFileSync('scripts/tools/verify-site.js','utf8');console.log('check( 总出现',(s.match(/check\(/g)||[]).length,'| 行首调用',(s.match(/^\s*check\(/gm)||[]).length)"

# CI 里跑的是不带 --compare 的那条
Select-String -Path .github/workflows/verify.yml -Pattern 'verify-site.js'
Select-String -Path package.json -Pattern '"verify'

# 基线时间戳与断言总数
node -e "const j=require('./research/_raw/ours-baseline/verify.json');console.log(j.generatedAt,j.total,j.failed,JSON.stringify(j.metrics))"

# 构建确定性断言是否存在（预期 0 命中）
Select-String -Path scripts -Pattern 'sha256|SHA256|确定性|两次构建' -Recurse
```

### 11.6 我自己的两个只读浏览器探针（脚本在 `%TEMP%\fe-audit-2026-09-28\`，**不在仓库里**）

```powershell
cd 'D:\OneDrive\Desktop\Code\AI Page'
$t="$env:TEMP\fe-audit-2026-09-28"
node "$t\probe.js"  http://127.0.0.1:8123   # 关 JS / 标题层级 / Tab 顺序 / 自动暗色 / 独立对比度 / 9 个断点
node "$t\probe2.js" http://127.0.0.1:8123   # 卡内溢出元素身份 / 首屏 / 分带 / 折叠覆盖
node "$t\probe3.js" http://127.0.0.1:8123   # 搜索是否覆盖中文译文 / 「即将截止」在零日期数据下 / 分类下拉
node "$t\probe4.js" http://127.0.0.1:8123   # jumpNav 的 hidden 属性 vs 实际可见性（死锚点）
```

复跑前置：`playwright-core@1.63.0` 已在 `node_modules`；浏览器走系统 Edge（`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`，可用 `DSH_EDGE` 覆盖）。探针脚本全部只读，不写仓库任何文件。

---

## 12. 给 captain / 后续任务的建议（按性价比排序）

1. **修 `#jumpNav`（1 行 CSS）**：加 `.jump[hidden]{display:none}`（或把 `display` 从 `.jump` 移到 `body.js .jump`）。同时**把门禁判据从"读属性"改成"读渲染"**（`offsetHeight === 0 || getComputedStyle().display === 'none'`），否则同类漏判还会再来。这条是本次唯一"用户能在线上直接踩到"的前端缺陷。
2. **给门禁规模加守门人**：把 `results.length` 与 `--compare` 基线里的 `total`/断言**名单**一起比对（新方案：基线存 `checks[].name`，比对时要求"名单集合不缩小"）。现在的 `checks` 写进 JSON 却没人读。
3. **把 `verify:regress` 挂进 CI**（至少挂到 push→master），并补一条**内容指纹**（如 `type=deal` id 集合的排序后哈希）比对，避免"计数器型"回归项被内容替换绕过。
4. **对比度阈值从 ≤20 收紧到 0**（当前真值就是 0/714，收紧不会红），与 DESIGN-RULES 的承诺对齐。
5. **搜索域加入 `zh.*`**（1 行改动，`matches()` 的 haystack 里补 `deal.zh` 各字段），否则「中文译文」这个卖点在中文化用户最常见的动作（复制译文里的词去搜索）上失效。
6. **补 `<h1>`**（顶栏品牌名或页面标题），并把 `.tierhead` 的 `<div>` 改成带 `id` 的 `<h2>`（不影响锚点、也不动 body.js 门控），顺带修好"h3 先于 h2"的层级倒置。
7. **决定 `.facets/.sortbox/.search` 在无 JS 时怎么办**：要么 `body.js` 门控（与 `.seg` 一致），要么在顶栏加一句"筛选需启用 JavaScript"。现在这 15 个控件是"看着能点、点了没反应"。
8. **把 80 个详情页接进结构化数据**：`ItemList` 的 `url` 改指站内 `deal/<id>/`（或在 `sameAs` 里同时给出官方页），`feed` 的 `<link>` 同理；现在结构化数据与订阅都把流量导给厂商页。
9. **修文档漂移**：`62 张卡` → 50；`DESIGN-RULES` N2 的"既有断言"要么删掉这句，要么真的加一条确定性断言；`verify.yml` 里的"136 项"改成引用脚本输出而非硬编码。

---

### 附：本报告**没有**触碰的路径

- 未执行 `npm run build` / `build-local.js`（只在 `%TEMP%` 下做过纯内存的"重建比对"，未写盘）。
- 未修改 `dist/`、`index.html`、`scripts/`、`deals.json`、workflow、文档中的任何文件。
- 唯一写盘的产出是本文件 `research/_raw/audit-2026-09-28/03-frontend.md`（任务指定）与 `%TEMP%\fe-audit-2026-09-28\` 下的探针脚本/临时数据。
