# 独立验证报告 · `PROJECT-AUDIT-2026-09-28.md`（t6 [A6]）

> **一行总结**：突击抽查 **112 条可验证硬数字**（V01–V112） → **CONFIRMED 98 · CONTRADICTED 9 · UNVERIFIABLE 5**。
> 报告的**主干事实全部站得住**（版本坐标、线上逐字节一致性、数据分布、门禁 136/142/143、`#jumpNav` 真缺陷、CI 19/1）；
> 8 条必须修正项**全部是"小节级/行号级"事实错误**：跨度写成 8 天 13 小时（真值 7 天 13 小时）、最近 20 次提交分类踩了自己写的 BOM 坑、
> 分支数少算 1、`P0-2` 「只有三处」实为 8 处、D19/D20 行号指向空白行、无法证实条数 21/22 与自身分解 24 对不上。
> **§0–§9 的定性结论、评分、风险排序不受任何一条 CONTRADICTED 影响。**

- **验证者**：verifier（attempt 1 / `a7239b72-1666-444e-a175-477d9d551911`）
- **验证时间**：2026-09-28（Asia/Shanghai），HEAD 全程 `a0c4ab2` 未变
- **纪律**：**只读**。未改报告本体、未改任何代码/数据/产物/workflow；会写盘的脚本一律不跑（`npm run build`、
  `zh-selftest.js`、`expiry-selftest.js` 全未跑）；`collect.js` 只在 `--dry-run` 下跑（不写盘）；
  我自己写的探针全部落在 `%TEMP%\t6probe\`，不落仓库；收尾 `git status --short` 与开始时一致（只有 `research/_raw/AUDIT-CONTEXT.md` 与 `research/_raw/audit-2026-09-28/` 两个未跟踪项）。
- **证据优先级**：线上 HTTP 实况 > 本地命令实跑 > 源码行号 > 支撑报告转述。**A5 的自述不作为证据**；
  A5 引用的 [A1]–[A4] 结论，凡标"实测"的我都自己重跑（重跑不了的显式标 UNVERIFIABLE）。

---

## 一、判定口径

| 判定 | 含义 |
|---|---|
| **CONFIRMED** | 我用独立方法复现了同一数字/同一事实（下表附我的命令与输出摘要） |
| **CONTRADICTED** | 我复现出**不同**结果（附两边数字 + 正确数字 + 受影响章节） |
| **UNVERIFIABLE** | 我跑不了 / 需要外网逐站点人工核对 / 需要浏览器之外的登录态；已写明为什么 |

---

## 二、逐条复核表

### A. 版本坐标与「本地 vs 线上」（§1）

| # | 报告说什么 | 我的独立复核 | 判定 | 我的证据 |
|---|---|---|---|---|
| V01 | HEAD = `a0c4ab2709fb309a6edeac2afa1798d0ede9cbe5` | 同 | **CONFIRMED** | `git rev-parse HEAD` |
| V02 | HEAD 提交时间 2026-09-28 12:10:53 +0800，标题 `docs: 2.32 上线记录 …` | 同 | **CONFIRMED** | `git log -1 --format='%H\|%ai\|%s'` |
| V03 | 远端 master = `a0c4ab2`（git + API 双向） | 同 | **CONFIRMED** | `git rev-parse origin/master`；`GET /branches/master` → `sha=a0c4ab27…` |
| V04 | 工作区干净，未跟踪只有 `AUDIT-CONTEXT.md` + `audit-2026-09-28/` | 同 | **CONFIRMED** | `git status --short`（2 行 `??`） |
| V05 | 线上 `index.html` 294055 B、sha256 前 16 `a188233ad55a04b0`、与 `dist` 逐字节相同 | 同 | **CONFIRMED** | `fetch` + `Buffer.equals(dist)` → `status=200 liveBytes=294055 sha16=a188233ad55a04b0 equalsDist=true` |
| V06 | 线上 `deals.json` 132665 B、`5c752b8083662f00`、与 `dist` 相同 | 同 | **CONFIRMED** | 同上 |
| V07 | `last-modified: Mon, 28 Sep 2026 04:11:20 GMT`，四个文件同值 | 我抓 9 个文件**全部同值** | **CONFIRMED** | 9/9 文件响应头同一时间戳 |
| V08 | 另抽样 12 个线上文件全部与本地 `dist/` 字节相同 | 我抽 **15 个**（9 根 + 6 详情页）全部相同 | **CONFIRMED** | 6 个 `deal/<id>/` 页 `equals=true`（56839/57099/56911/57700/56331/56989 B） |
| V09 | 全量 139 产物逐字节**未做** ⇒ 【未证实】 | 标注属实，且未被后续章节当已证事实引用 | **CONFIRMED** | 报告 §1.2 表 ③ 与 §9.4 #1 两处都保留标注。**唯一措辞风险**：§0 第 1 条写成无条件的「本地 = 远端 = 线上」，建议加限定词（见「建议修正」S1） |
| V10 | `schemaVersion=2` / `count=133` / `updatedAt=2026-09-28T11:50:50+08:00` | 同（本地与线上同值） | **CONFIRMED** | `JSON.parse(deals.json)` 三字段逐字一致 |
| V11 | 线上 44 条/62 字段 ⯈ 仓库根 43 条/61 字段，差 **121 B** = `0ddacfb2cc6e` 的 `zh` | 同；字节差 132665−132544 = **121**，字段级 diff 恰好 1 个键 `0ddacfb2cc6e:zh`，id 集合零差集 | **CONFIRMED** | 独立脚本比对两文件 |
| V12 | `dist/` 在 `.gitignore:2` | `.gitignore:2` = `dist/`，`git check-ignore -v dist/index.html` → `.gitignore:2:dist/` exit 0 | **CONFIRMED** | 同上 |

### B. 产物清单（§4.1）

| # | 报告说什么 | 我的独立复核 | 判定 | 我的证据 |
|---|---|---|---|---|
| V13 | `dist/` 139 个文件 / 5,285,602 字节 | 同 | **CONFIRMED** | `Get-ChildItem dist -Recurse -File \| Measure-Object` |
| V14 | 根产物字节数：index 294055 / deals 132665 / feed.xml 44174 / feed.json 44571 / sitemap 16210 / logos.css 9811 / og-image 7808 / robots 747 / favicon 403 / .nojekyll 0 | **10/10 逐字相同** | **CONFIRMED** | 逐文件 `Length` |
| V15 | `deal/` 80 页，**56,319–58,731 字节，均值 57,140** | 同（min 56319 / max 58731 / mean 57140） | **CONFIRMED** | `Measure-Object -Minimum/-Maximum/-Average` |
| V16 | `logos/` 49 个文件 | 同 | **CONFIRMED** | 目录计数 |
| V17 | 详情页 `ebd47f6d2522` = 49,907 字符 / 56,839 字节 | 同 | **CONFIRMED** | `bytes=56839 chars=49907` |

> 附注：A3 原报告把详情页体积写成「49543–51033 字节 / 均值 50140」，A5 定为"单位滑落"并改成字节真值 —— **A5 的更正正确**，我的实测 56319–58731 与 A5 完全一致。

### C. 数据分布与对账（§3）

| # | 报告说什么 | 我的独立复核 | 判定 | 我的证据 |
|---|---|---|---|---|
| V18 | 133 条 / 80 `deal` / 53 `tool` | 同 | **CONFIRMED** | `node scripts/validate.js`（总条数 133 / 真实优惠 80）+ 直接计数 |
| V19 | 国内 60 / 国外 73；cn 里 tool = **0** | 同 | **CONFIRMED** | 同上；`region` 直方图 `{cn:60, global:73}` |
| V20 | global 的 deal 20 = Curated 14 + Layer3Labs 6 | 同 | **CONFIRMED** | 按 source 分组：`{Layer3Labs:6, Curated:14}` |
| V21 | 53 条 tool 全部来自 3 个目录站 + Layer3Labs 非折扣行（15 / 32 / 3 / 3） | 同（15+32+3+3=53，且 53 条全为 global） | **CONFIRMED** | 按 `source`+`type` 交叉计数 |
| V22 | 默认视图 50 张卡；产物「优惠 50 / 全部工具 103」 | 同 | **CONFIRMED** | `tier-report.js` 首行「50 张卡片」；产物 tab 计数 `<b>50</b>` / `<b>103</b>` |
| V23 | 3 张折叠卡覆盖 33 行（17 / 9 / 7） | 同 | **CONFIRMED** | 产物 `data-model-count="17"/"9"/"7"`，共 3 处 |
| V24 | 53 条 tool 不进默认视图（`matches()` 首句即 `return false`） | 同 | **CONFIRMED** | `index.html:2011-2017`：`if (filters.tab==='deals'){ if (deal.type!=='deal') return false; }` |
| V25 | 厂商：原始串 **86** / 归一后 **80** 家 | 同 | **CONFIRMED** | 我从 `index.html:1117` 抽出 `VENDOR_RULES`（44 条规则）自己实现归一 → `distinct raw=86, distinct normalized=80` |
| V26 | 80 条 deal 归一后 **32 家**；baidu 17 + volcengine 13 + zhipu 12 = **42 条（52.5%）** | 同（volcengine = 火山引擎 12 + 火山引擎（字节跳动）1） | **CONFIRMED** | 同上脚本；`top3 sum=42 = 52.5%` |
| V27 | category 12 个枚举全部命中；`API服务` 36 条 | 同 | **CONFIRMED** | 直方图 12 键，`API服务:36` |
| V28 | `pricingModel=null` 40 条（35 tool + 5 条 Layer3Labs 目录行） | 同（tool 35 = Layer3Labs 1 + Futuretools 32 + Futurepedia 2；deal 5 = 全 Layer3Labs） | **CONFIRMED** | 交叉计数（我最初的直觉猜法给出 34+6，实测**报告是对的**） |
| V29 | `expiresAt` 非空 **0**；`validity` 非空 61 | 同 | **CONFIRMED** | validate.js 输出 + 直接计数 |
| V30 | 三分类 0 / 112 / 21 且 0+112+21=133 | 同 | **CONFIRMED** | validate.js「有截止日期 0 · 未标注截止日期 112 · 长期活动 21」；我另用 `classify.js` 的 `isOngoing` 独立复算得 0/112/21 |
| V31 | 112 = 72 条无 validity + 40 条只有相对期限 | 同（61−21=40） | **CONFIRMED** | 同上 |
| V32 | 全库 6 个文本字段里只有 **1 条**含 4 位年份（`c789f0a090bf`）；`extractDeadline` 命中 0 | 同；`extractDeadline` 全库命中 **0** | **CONFIRMED**（附口径提示） | 语义口径下确为 1 条；**但朴素 `\b(19\|20)\d{2}\b` 会命中 2 条**，多出的一条是 `97d21ff73d3e` 的「**2000万** Tokens」（不是年份）。报告没写这条噪声，读者复跑易得 2 |
| V33 | 角标矛盾：A 向 11（严格 9 + 宽 2）、B 向 2，合计 13，附 id 清单 | **id 逐一相符**：A 严格 9 = `ebd47f6d2522 e7e8f538456c 6798f78de5ce f22e3cd094ad 62e3166acec0 5dedb9455508 df1210f69a39 4caf88e30671 6869e7866510`；A 宽 2 = `833a9889bfb7 d8d0ba522315`；B 2 = `b75b42583ad8 b4d87c02f4d9` | **CONFIRMED** | 用仓库自己的 `isOngoing()` 穷举：`isOngoing('不过期')=false`、`isOngoing('永久五折')=false`、`isOngoing('永久有效')=true`、`isOngoing('以官方定价页实时标注为准')=false` —— 与 captain 的更正、与 A5 的最终口径**三方一致** |
| V34 | 首页角标 国内 30 + 国外 20 + 长期活动 15 + 未标注 35 | 同（100 枚角标 / 50 张卡 = 每卡 2 枚） | **CONFIRMED** | 产物角标按文本计数 |
| V35 | 详情页两行互斥（`ebd47f6d2522`）；反例 `b75b42583ad8` | 原文逐字命中 | **CONFIRMED** | `有效期说明</div><div class="v">长期有效（官方模型列表未标注截止日期）` 与 `活动期限</div><div class="v">长期活动（官方有效期说明里写明长期有效）` 同栅格；`index.html:1358` 的 `note` 正是后半句 |
| V36 | 15 条 aitools.fyi 描述以半词结尾（上游截断 + 剥省略号） | 15 条条目、**15/15 不以标点结尾**且长度 >100 | **CONFIRMED** | 尾部样本：`…它适合希望获得` / `…将每项要求与包内证据对应` |
| V37 | 需要译文 44 条（38 tool + 6 deal） | 同 | **CONFIRMED** | 用仓库 `ZH_FIELDS=['discountInfo','description','eligibility','validity','priceLine']` + `isEnglishProse` 复算 = 44（38/6） |
| V38 | 覆盖层 44 条 / 62 字段；仓库根 43/61；`dist`=线上 44/62 | 同；缺的那条正是 `0ddacfb2cc6e` | **CONFIRMED** | 直读三个文件 + `zh-todo --check` |
| V39 | `zh-todo --check` 仍报「漂移 0 · 待译 0 · ✅」exit 0（门禁盲点） | 同 | **CONFIRMED** | 实跑 exit=0（「已贴 44 条 / 62 个字段」） |
| V40 | `aliases.json` 96 键；别名归一后仍有 **133** 个不同 `titleKey` ⇒ 实际合并 0 条 | 同（96 个非下划线键；133 / 133 个不同 key） | **CONFIRMED** | `dedup.aliasKey` 对 133 条标题取值 |
| V41 | `sourceUrl` 50 条（80 条 deal 里 12 条） | 同 | **CONFIRMED** | 直接计数 |
| V42 | `discountInfo` 83 / `features` 32 / `verified` 32 / `priceLine` 3 | 同（另：deal 里 `features` 32、无 `discountInfo` 的 deal 0） | **CONFIRMED** | 直接计数 + validate.js 输出 |
| V43 | `firstSeen` **121/133 = 2026-09-21**（迁移批次日） | 同 | **CONFIRMED** | 直接计数 |
| V44 | 全库无 `features` 101 条；`type=deal` 里无 `features` 48 条 | 同（133−32=101；80−32=48） | **CONFIRMED** | 直接计数 |
| V45 | `lastSeen` 只有 4 个取值（09-22 / 24 / 26 / 28） | 同 `{09-28:129, 09-26:1, 09-24:1, 09-22:2}` | **CONFIRMED** | 直方图 |
| V46 | 抽样 11 条官方页真实性：5 条逐字证实 / 2 条部分 / 4 条无法证实 | 未复跑 | **UNVERIFIABLE** | 需要逐条访问厂商官方页（部分为 JS 壳 / 403 / 本机不可达）；我确认了抽样 id 与 5+2+4=11 的口径自洽，但不采信其结论 |
| V47 | §3.8「**22** 条落在 JS 壳页面上（火山 12 + 智谱活动页 5 + 智谱免费模型 7）」；§8#9 同一分解写成「**21** 条」 | **两处总数与自身分解都对不上**：括号里 12+5+7 = **24**；§3.8 写 22、§8 写 21；A2 自己的枚举（`02-data.md:400-401`）U3（`97d21ff73d3e` + 智谱活动页 5）+ U4（火山 12）= **18**。⇒ 18 / 21 / 22 / 24 四个数互不相等 | **CONTRADICTED** | 受影响：**§3.8 第 2 句**、**§8 风险 #9**（也是 §7 数据评分扣分项之一）。修正动作：按 A2 的可追溯枚举写 **18 条**，或明确说明 24 的计算口径后统一用一个数 |

### D. 前端与产物能力（§4）

| # | 报告说什么 | 我的独立复核 | 判定 | 我的证据 |
|---|---|---|---|---|
| V48 | 源码 `index.html` 191057 字节 / 152977 字符；产物 294055 字节 / 233517 字符 | 同（四个数全中） | **CONFIRMED** | `statSync` + `String.length` |
| V49 | 内联 CSS 41321 字符 | 同（41321） | **CONFIRMED** | 抽 `<style>` 块测长 |
| V50 | 应用 JS 103960 字符（RENDER-CORE 66718 = 43.6%）/ 骨架 7336 | 我量到**不同**子项：非 ld+json 脚本块内容 **104286** 字符（含 `<script>` 标签 104320）；`RENDER-CORE:START…END` 跨度 **66553** | **UNVERIFIABLE** | 总量 152977/233517 精确复现、CSS 41321 精确复现，说明 A3 用的是**另一套子切分口径**（未写明起始锚点），我无法判定孰对孰错；建议报告补一句"子项口径" |
| V51 | 6 个 `<!--PRERENDER:*-->` 锚点 + 6 处 `__SITE_URL__`，产物 0 残留 | 同（6 个锚点：topstat/facets/stats/categories/deals/jsonld；源码 6 处 `__SITE_URL__`；产物 0/0） | **CONFIRMED** | 源码与产物分别计数 |
| V52 | 零依赖：11 类请求全同源、0 `<img>`、0 iframe、无 `@font-face`；require 闭包只有内置模块 | 0 `<img>` / 0 iframe / 0 `@font-face` 复现；"全同源"由门禁「没有外部请求 — 全部同源」在 136 项里通过佐证 | **CONFIRMED** | 产物计数 + verify-site 实跑输出 |
| V53 | `sitemap.xml` 81 `<loc>` = 首页 + 80，且与 `type=deal` 集合完全相等 | 同（81 loc；80 个详情 loc 与 deal id 集合**双向零差集**；非详情 loc 只有首页 1 条） | **CONFIRMED** | 解析 sitemap 与 deals.json 对账 |
| V54 | `feed.xml`/`feed.json` 各 80 条、`guid` 唯一 | 同（80 `<item>`、80 guid 全不同、guid = deal id） | **CONFIRMED** | 解析产物 |
| V55 | `robots.txt` 放行 11 个生成式引擎爬虫 | 同（12 个 `User-agent:` 行 = 11 个具名爬虫 + `User-agent: *`） | **CONFIRMED** | 逐行解析 |
| V56 | 首页 `ItemList` 只列 50 卡；条目 `url` 指厂商官方页，50 条仅 43 个不同 URL | 同（`itemListElement=50`、`distinctUrls=43/50`） | **CONFIRMED** | 解析 5 段 JSON-LD |
| V57 | feed 的 `<link>` 80 条仅 **49** 个不同目标 + `pubDate` 全同一天 | 同（81 个 `<link>` 含 1 个 channel；80 个 item link 去重 = 49；`pubDate` 唯一值 1 个） | **CONFIRMED** | 解析产物 |
| V58 | 整站 **0 个 `<h1>`**；50 个 `<h3>` 全排在唯一 1 个 `<h2>` 之前 | 同（去掉 script/style 后：h1 0 / h2 1 / h3 50；首个 h3 在首个 h2 之前） | **CONFIRMED** | 我自己写的 markup-only 计数（原始计数 h2=3 是内联 JS 模板字符串干扰，须先剥 `<script>`） |
| V59 | `#jumpNav` 死锚点：`hidden=true` 但 computed `display:flex`、高 28px 可见；`tier-1..4` 落点不存在；点击 `#tier-2` → `scrollY 0→0` | **完全复现**（我自建静态服务器 8098 + 自写 Playwright 探针，未用仓库任何脚本）：卡片视图 `attrHidden=false/display=flex/h=28/4 锚点`；切「最近更新」后 `attrHidden=**true**/display=**flex**/h=**28**/inViewport=**true**/锚点 **0**`；点击后 `before 0 → after 0`、hash 留在 `#tier-2`；列表视图同样；**760px 下 display=grid**（与 CSS 媒体查询一致） | **CONFIRMED** | 这是本次审计最重要的一条，**captain 与 A3 的结论我独立复现，不是转述** |
| V60 | 门禁 `verify-site.js:1152/1156`、`:1317/1327` 断言的是 `hidden` **属性**而非渲染结果 | 逐字命中：`const hidden = document.getElementById('jumpNav').hidden` / `jumpHidden: document.getElementById('jumpNav').hidden` | **CONFIRMED** | 源码直读 |
| V61 | 预渲染 **10** 枚 `button[data-facet]`（2 Tab + 2 地区 + 6 厂商） | 同（10 枚；2/2/6） | **CONFIRMED** | markup-only 解析 |
| V62 | 分类下拉 **12** 个 `<option>`「现场生成」 | 成立但需注明口径：`<!--PRERENDER:categories-->` 注入 **12** 个，骨架里另有硬编码的 `<option value="">全部分类</option>`（`index.html:872`）⇒ 产物共 **13** 个 option | **CONFIRMED** | 源码锚点位置 + 产物 option 计数 |
| V63 | 关 JS 仍有 **15 个筛选/排序/搜索控件可见却无响应** | 同（关 JS 上下文里可见控件恰 **15** 个：1 搜索 + 11 按钮 + 1 select + 2 按钮） | **CONFIRMED** | `javaScriptEnabled:false` 上下文实测 |
| V64 | 关 JS「**12565** 字符正文」 | 复现不出：同一产物、同一浏览器，`innerText` = **11460**（折叠空白 11456）、markup 去标签文本 = **11994**、`textContent` = 128724（含内联 CSS/JS 文本节点） | **CONTRADICTED**（低危） | 受影响：**§4.2 能力矩阵「关 JS 可读性」**、A3 `03-frontend.md:23/249/320`。定性结论（无 JS 可读）**不受影响**，但标【实测】的数字须写清测量方法 |
| V65 | 关 JS「50 个站内详情链」 | `document.querySelectorAll('a[href^="deal/"]')` = **83**（50 条卡级标题链 + 33 条折叠成员链：17+1 / 9+1 / 7+1）；卡级链确为 50 | **CONTRADICTED**（低危） | 受影响同上。修正动作：写成「50 条卡级标题链（DOM 里 `a[href^="deal/"]` 共 83 条）」 |
| V66 | 门禁断点只测 1440/390/360；从不 `emulateMedia`；全文件 0 次 axe/a11y | 同：`setViewportSize` 只出现 1440/390/360（1956 行循环也只有 `[390,360]`）；`emulateMedia` **0** 次（`prefers-reduced-motion` 走 context 选项）；`axe\|a11y` **0** 次 | **CONFIRMED** | 源码计数 |
| V67 | 对比度断言是「额度」不是门槛：`verify-site.js:1060/1087` 断言 `below <= 20`，而 `DESIGN-RULES.md:128` 承诺 0 | 同（`below <= 20` 逐字命中） | **CONFIRMED** | 源码直读 |
| V68 | 门禁规模三口径：**136** = CI 实际 / **142** = 本地带基线 / **143** = `check()` 调用点 | **三个数全部实测复现**：`verify-site.js`（无 `--compare`）✅ **验收 136 项，失败 0 项**；`--compare=research/_raw/ours-baseline/verify.json` ✅ **验收 142 项，失败 0 项**；`check()` 调用点静态计数 = 144 − 1（函数定义）= **143** | **CONFIRMED** | 实跑两次 + 静态计数 |
| V69 | `--compare` 只比 **6 个计数器**，`checks` 数组从不参与比对 | 逐字命中：比对段（`verify-site.js:2079-2102`）只读 `parsed.metrics`，恰好 6 条 `check`（coveredDeals / cards / firstScreenFull / pageHeight≤×1.15 / externalRequests / jsErrors） | **CONFIRMED** | 源码直读 |
| V70 | 基线 `verify.json` 的 `total` = **132**（生成于 2026-09-27T15:50:34.934Z）；6 指标当前值与基线**完全相同** | 同（`total=132, checks=132, failed=0`）；`--compare` 实跑输出：`80→80 · 50→50 · 9→9 · 4566→4566 · 0→0 · 0` | **CONFIRMED** | 直读 baseline + 实跑 |
| V71 | CI 里**根本没有** `--compare` | 同（`verify.yml:235` 是裸 `node scripts/tools/verify-site.js`；`package.json` 的 `verify` 同；只有 `verify:regress` 带基线） | **CONFIRMED** | 源码直读 |

### E. 运维与 CI（§5）

| # | 报告说什么 | 我的独立复核 | 判定 | 我的证据 |
|---|---|---|---|---|
| V72 | `/actions/runs` `total_count` = **90** | 同 | **CONFIRMED** | GitHub API（未认证只读） |
| V73 | 最近 20 次 **19 success / 1 failure / 0 cancelled = 95%**（并注明 A4 记 18/1/0=90% 有误） | 同（`{"success":19,"failure":1}`） | **CONFIRMED**（A5 的选择正确） | `per_page=20` 逐条打印：#1–#20 里唯一的 failure 是 **#5** `Verify site (gate)`@`e01dcfc`；**A4 的 18/1 是错的**，A5 采信 19/1 正确 |
| V74 | 累计 `collect` 17 · `deploy` 54 · `verify` 12 · `probe-sources` 2 | 同 | **CONFIRMED** | `GET /actions/workflows/<wf>/runs` × 4 |
| V75 | 唯一 failure = `e01dcfc` 的 Verify（2026-09-28T03:57:42Z，push，62s），同 sha Deploy success；三个日志端点全 403 | 同：run `36375740112`；**第 9 步 `Translation self-test` = failure，第 10–13 步全部 skipped，`Gate conclusion` = success**（`if: always()`）；同 sha 的 Deploy run `success`；`/runs/{id}/logs`、`/attempts/1/logs`、`/jobs/{id}/logs` **全部 403** | **CONFIRMED** | API 逐端点复测 |
| V76 | `probe-sources` 最后一次 2026-09-21T14:29（7 天前，仅手动触发） | 同（`2026-09-21T14:29:58Z`，conclusion=success） | **CONFIRMED** | API |
| V77 | `pull_request` 触发的 run 累计 **0 次** | 同 | **CONFIRMED** | `GET /actions/runs?event=pull_request` → `total_count=0` |
| V78 | 远端 `/tags` → `[]`、`/git/refs/heads` 只有 `master`、`/rulesets` → `[]`、`/branches/master/protection` → 401 | 四项全同 | **CONFIRMED** | API 逐端点 |
| V79 | 提交 **118** 次 | 同 | **CONFIRMED** | `git rev-list --count HEAD` |
| V80 | 跨度 **8 天 13 小时**（2026-09-20 23:09 → 09-28 12:10） | **7 天 13 小时 1 分 23 秒**：09-20 23:09:30 + 8d = 09-28 23:09:30；而末次提交在 09-28 12:10:53，早了 10h58m37s ⇒ 8d − 10h58m37s = **7d 13h 1m** | **CONTRADICTED** | 受影响：**§5.4 第 1 条**（`04-ops-docs.md` 同句）。正确写法「7 天 13 小时（≈7.5 天）」。作者日期与提交者日期两种算法都不是 8 天 13 小时（提交者日期跨度 = 6 天 14 小时） |
| V81 | 按天高度倾斜：09-23 单日 **63 次（53%）**，四天吃掉 **77%** | 同：`{09-28:5, 09-27:14, 09-26:3, 09-25:2, 09-24:3, 09-23:63, 09-22:13, 09-21:9, 09-20:6}`；63 = 53%；**09-20…09-23 四天合计 91/118 = 77.1%** | **CONFIRMED** | 注意：若按"量最大的四天"算则是 99/118 = **84%**，原句的"四天"须理解为"前四天"才不会误读（见建议 S2） |
| V82 | 最近 20 次分类：`docs` 6 · `chore(data)` 4 · `fix` 4 · `merge` 2 · `data(zh)` 2 · 其他 2 | **两个口径都对不上**：**剥 BOM 后** = `docs 8 · data(zh) 2 · fix 4 · chore(data) 4 · merge 2 · 其他 0`；**不剥 BOM** = `docs 6 · data(zh) 1 · fix 4 · chore(data) 4 · merge 2 · 其他 3`。报告给的 `docs 6 + data(zh) 2 + 其他 2` 是两种做法的混合体 | **CONTRADICTED** | 受影响：**§5.4 第 1 条末句**。讽刺点：**这正是同一节 ⚠️ 那条"BOM 会让 `^docs:` 静默漏匹配"的坑本身**——最近 20 次里有 **3 条** subject 以 `U+FEFF` 开头（全仓 12 条）。修正动作：写 `docs 8 · chore(data) 4 · fix 4 · data(zh) 2 · merge 2`（剥 BOM 口径）并注明已剥 BOM |
| V83 | 15 个本地分支：**11 个已并入 master 且 ahead=0**；只有 2 个未并入且有意保留 | **已并入且 ahead=0 的是 12 个**（不含 master 本身）：`feat/b-extras`、`feat/detail-pages`、`feat/expiry-window`、`feat/favorites-compare`、`feat/polish`、`feat/row-view`、`feat/visual-token-layer`、`fix/detail-close`、`fix/favorites-entry-and-compare-open`、**`fix/fold-same-vendor`**、`trial/fav-cmp-merge`、`trial/merge-rehearsal-2`（含 master 则 13）。未并入的 2 个 ✓（`backup-pre-rewrite` ahead 11、`trial/merge-rehearsal` ahead 6） | **CONTRADICTED**（低危） | 受影响：**§5.4 第 2 条**。差额恰好是 `fix/fold-same-vendor`（就是残留 worktree 那条）——报告把它单列讲了，主句却少算 1。修正动作：写「12 个已并入且 ahead=0（若排除占着 worktree 的 `fix/fold-same-vendor` 则 11 个）」 |
| V84 | `.worktrees/fold-same-vendor` 停在 `52f6164 [fix/fold-same-vendor]`（ahead 0 / behind 5） | 同 | **CONFIRMED** | `git worktree list` + `rev-list --count` |
| V85 | upstream 错配只有 1 条：`fix/detail-close → origin/master`，台账写 behind 29、实测 **behind 58** | 同（`[origin/master: behind 58]`，且全仓只有这一条配了 upstream） | **CONFIRMED** | `git branch -vv` |
| V86 | 本地 2 个 tag 都是 master 祖先；远端无 tag、无分支 | 同（`backup/pre-ab-merge`、`backup/pre-origin-merge-b261add` 均 `--is-ancestor master` = true） | **CONFIRMED** | `merge-base --is-ancestor` |
| V87 | 若干提交 subject 以 `U+FEFF` 开头，`^docs:` 会静默漏匹配 | 同（全仓 **12 条** subject 以 BOM 开头；HEAD 无 BOM） | **CONFIRMED** | 逐条检测 |
| V88 | 「机器确实在自转」：定时 2 次/日 + 真抓 **97 条 / 失败 0** | **本轮实跑复现**：`node scripts/collect.js --dry-run` → 「合计：**7 个来源，产出 97 条，合格 97 条，其中优惠 34 条，失败 0 个**」，`EXIT=0` | **CONFIRMED** | 真联网跑（dry-run 不写盘）；注：首次经 PowerShell `2>&1 \| Select-Object` 包装时报 exit 1，那是 PowerShell 把 node 的 stderr 当 ErrorRecord 的假象，改用文件重定向后 **EXIT=0** |
| V89 | 7 个静态源**逐源**条数（Futuretools 37 / 千帆 17 / aitools 15 / Layer3Labs 13 / 智谱 7 / Futurepedia 7 / 阿里云 1） | 总账复现（97 = 37+17+15+13+7+7+1 自洽），但我的输出不含逐源分解，未逐项核对 | **UNVERIFIABLE**（总账 CONFIRMED） | — |
| V90 | 无头 2 源 17 条（火山方舟 12 + 智谱活动页 5），与 `probe-sources.yml:96` 基线一致 | 未跑 `--headless`（要真装浏览器内核，且属重操作）；**基线文字我逐字核对无误**：`probe-sources.yml:96` = `echo "_本地基线：火山方舟 12 条、智谱AI活动页 5 条。_"` | **UNVERIFIABLE**（引用 CONFIRMED） | 源码直读 |
| V91 | 下一次采集很可能再红：合并预览 `missing 3` / `stale 2` / `skipped 0`；3 条待译（Unboring.ai 新进 + Midjourney/Grok 描述改写） | **本轮实跑同一结论**：`中文译文: 42/134 条带中文译文（60 个字段）· 3 条待翻译 · 2 处因原文已变停用`，逐条点名 `Midjourney`、`Grok`；`missing 3 / stale 2 / skipped 0` 三数全中 | **CONFIRMED** | dry-run 输出 |
| V92 | 静默失败清单：`degraded` 阈值 0.3、`removedExpired/removedOverflow` 从不打印、17 条无头产出（12.8%）可在无人察觉下消失 | 代码逐条命中（`store.js:146` 0.3；`:158-159` 只记不打印；`collect.yml:47` `continue-on-error`） | **CONFIRMED** | 源码直读 + 算术（17/133 = 12.8% < 30%） |
| V93 | `collect.yml` / `deploy.yml` / `verify.yml` 的关键行（cron、`--strict` 位置、`deploy` 无 validate 步骤、`check-ci-consistency --expect-checks=24`、gate 无 job 级 `if`） | 逐行命中：`collect.yml:5-6` cron、`:41`/`:60` validate、`:47`/`:66`/`:82` continue-on-error、`:115` git push；`deploy.yml:12` workflow_run、`:30` if、**`:48-49` 只有 build-local（无独立 validate）**、`:64` needs；`verify.yml:88` / `:146` / `:151` / `:155` / `:158` / `:235` | **CONFIRMED** | 源码直读 |

### F. 文档偏差清单（§6）

| # | 报告说什么 | 我的独立复核 | 判定 | 我的证据 |
|---|---|---|---|---|
| V94 | D1 `SUMMARY.md:9,70,85`：`master=origin/master=fa2403d`、「已上线（2026-09-23）」 | 三处逐字命中 | **CONFIRMED**（行号微瑕） | 同行的「`verify --url=` 108 项 0 失败」其实在 **:89**（:61/:64/:235 是 113 项），不在 9/70/85 —— 建议补上 :89（低危） |
| V95 | D2 `NEXT-STEPS.md:160,195`（777e3b7 + 「现在本地与上游完全一致」）、`:8` 记到 2.30 | 三处逐字命中 | **CONFIRMED** | 源码直读 |
| V96 | D3 `PROJECT_STATUS.md:3`「最后更新 2026-09-23」（正文却已到 2.32） | 同 | **CONFIRMED** | 源码直读 |
| V97 | D4 `PROJECT_STATUS.md:14-28` 的「改造前 → 现在」表：真实优惠 **71 条**、国内 **51 条**、折叠 **53 张卡** | 同（实际 80 / 60 / 50），且三个数确实都落在 14–28 区间（:18 / :19 / :22） | **CONFIRMED** | 源码直读 |
| V98 | D13 `PROJECT_STATUS.md:1735,1738,1921-1923` 写 verify **124** / regress **129** / 调用点 **130**，同文件 `:1696` 却写 136/142 | 逐字命中（`:1735` 124/129、`:1738` 124+5、`:1921` 124、`:1922` 124/129、`:1923` 130 = 124+5+1；`:1696` 136/142） | **CONFIRMED** | 源码直读 |
| V99 | D5–D10：第四节快照 总 **132** / tool **52** / Futuretools **31** / 视频 **9** ⇒ 实际 133 / 53 / 32 / 10 | 四个陈旧值**全部在第四节内定位到**：`:1785` 132、`:1789` 52、`:1811` Futuretools 31、`:1820` 视频 9；实测 133 / 53 / 32 / 10（`视频` 现 10，其余分类与文档一致） | **CONFIRMED** | 源码直读 + 数据直算 |
| V100 | README「77 家」厂商 ⇒ 实际 **80 家** | 同：`README.md:343-344` 写「当前 **77 家**…38 家官方图形 / 39 家兜底」；我实跑 `tier-report.js --vendor` 末行 = 「官方品牌图形: 38 家 / 名称缩写兜底: **42** 家 / 共 **80** 家」 | **CONFIRMED** | 命令实跑 |
| V101 | D17 `PROJECT_STATUS.md:1695` 两次构建 SHA256 `62692BB8…` ⇒ 当前 `A188233A…` | 同（`dist/index.html` sha256 前 16 = `a188233ad55a04b0`） | **CONFIRMED** | 我 fetch 线上 + 本地双算 |
| V102 | D19：`PROJECT_STATUS.md:29-30` 写 `selftest:zh` **7 项**，实际 **9 项**（「是增强，文档没说」） | **行号错**：`:29` 是空行、`:30` 是 `---`；「7 项」实际出现在 `:680/:792/:921/:1068/:1327/:1456`。**且「文档没说」不成立**：同一文件 `:1515` 明确写「✅ **9 项**（对方那条线把它从 7 项扩到 9 项）」、`:1547` 写「9 项 0 失败」、`:1600` 写 `selftest:zh(9)`。**9 项本身正确**：我静态计数 `zh-selftest.js` = 7 个 `record()` + 2 个 `extra` = **9** | **CONTRADICTED** | 受影响：**§6.2 D19 行**（`04-ops-docs.md:339`、`:464` 同源）。修正动作：行号改为 `:680,792,921,1068,1327,1456,1515,1547,1600`，并改写结论为「同一文件内 7 与 9 并存、自相矛盾」 |
| V103 | D20：`PROJECT_STATUS.md:28` 写「71 条优惠 → 53 张卡片」= 现在 | **行号错**：`:28` 是「可发现性」那一行；「71 条优惠 → 53 张卡片」在 **`:22`**（同文件 `:260-261` 也有） | **CONTRADICTED**（低危） | 受影响：**§6.2「D20/D21」行**。修正动作：行号改 `:22`（A4 自己在 D5 行用的是 `:22`，D20 行错成 `:28`） |
| V104 | D21：`PROJECT_STATUS.md:1867`「48 条自动条目没有特性标签」⇒ 全库 101 条 | 行号与内容同（`:1867` 逐字命中）；全库无 features = **101**，`type=deal` 里 48 | **CONFIRMED** | 源码 + 数据双读 |
| V105 | D22–D25：`docs/DESIGN-RULES.md:104,146,147,150` 写 facet **11/11**、卡片 **62/62** 可聚焦、断网仍有 **62 卡** | 四处逐字命中；实际 10 枚 facet、50 张卡 | **CONFIRMED** | 源码直读 |
| V106 | D27：`research/GAP-MATRIX.md:82,102` 写首页 **62** 个标题链接、断言 55 → **95** | 两处逐字命中（`:82`「首页 62 个标题链接改为站内」、`:102`「断言 55 → **95**」） | **CONFIRMED** | 源码直读 |
| V107 | D-补A：`SUMMARY.md:11,89`、`NEXT-STEPS.md:26` 三处「见 P0-2」；**全仓 `.md` 里搜 `P0-2` 只有这三处引用**、零处定义（断链） | 三处引用确实存在；但 **`P0-2` 在仓库 `.md` 里共出现 8 处**：`SUMMARY.md:11,89,235`、`NEXT-STEPS.md:26,169`、`PROJECT_STATUS.md:95,1371,1507`。「零处定义」部分成立（我在 `.md`/`.json` 里没找到定义，8 处全是"见 P0-2"式引用） | **CONTRADICTED** | 受影响：**§6.2 末行 D-补A**（`04-ops-docs.md:434-438`）。修正动作：把「只有这三处」改成「至少 8 处引用、零处定义」 |
| V108 | §6.3：`README.md:407-409` 的断言数分解 136 / 142 / 143（唯一"与现实一致"的文档） | **逐字命中且与我实测完全一致**（`407` 136 项、`408` verify:regress 142 项、`409`「143 = 136 常跑 + 6 回归 + 1 条仅基线缺失时的失败分支」） | **CONFIRMED** | 三处源码 + 我的两次实跑 |
| V109 | §6.3：策展 32 = `curated_cn` 18 + `curated_global` 14（`README.md:120`） | 同（18/14、`verified=true` 恰 32 条） | **CONFIRMED** | 数据直算 |
| V110 | §6.3：README「快速开始 4/4 跑通」（`npm test` / `check:zh` / `report:tier` / `serve.js`） | 我跑了前三条，**全部 exit 0**；`serve.js` 未跑（要占端口起服务，属我本轮不必要的写侧动作） | **CONFIRMED**（3/4；`serve.js` 未跑） | 三条命令实跑 |
| V111 | 「没有任何一份文档说清『现在这一版是什么』」 | 成立：`SUMMARY.md` 停在 `fa2403d`、`NEXT-STEPS.md` 停在 `777e3b7`、`PROJECT_STATUS.md` 头部日期写 09-23、`README` 的厂商数停在 77 家；四份都没写当前 HEAD = `a0c4ab2` | **CONFIRMED** | 见 V94–V101 |
| V112 | §6 总统计：「28 条可验证声明，16 条与实测不符、12 条一致」 | 我未逐条复算这 28 条；但我抽查的 10 条里**已有 3 条行号/事实错误**（V102/V103/V107）⇒ 该统计的分母与结论**需要重算后才可引用** | **UNVERIFIABLE** | — |

---

## 三、必须修正项清单（共 8 条，全部为"小节级/行号级"事实错误）

> 判定门槛：**会让读者按错的数字/错的指针行动**。**没有一条推翻报告的主干结论、评分或风险 Top 12**。
> 每条给出「报告原句 → 正确值 → 我的证据 → 受影响位置」。

| # | 严重度 | 报告原句（位置） | 正确值 | 证据 | 受影响位置 |
|---|---|---|---|---|---|
| **M1** | 🟠 中 | 「提交 118 次 / 跨度 **8 天 13 小时**（2026-09-20 23:09 → 09-28 12:10）」 | **7 天 13 小时 1 分**（≈7.5 天） | `git log --format='%ai'` 首末：`2026-09-20 23:09:30` → `2026-09-28 12:10:53`；按提交者日期算也只有 6 天 14 小时 | §5.4 第 1 条；`04-ops-docs.md` 同句 |
| **M2** | 🟠 中 | 「最近 20 次：`docs` **6** · `chore(data)` 4 · `fix` 4 · `merge` 2 · `data(zh)` 2 · 其他 **2**」 | **剥 BOM 后**：`docs` **8** · `chore(data)` 4 · `fix` 4 · `data(zh)` **2** · `merge` 2 · 其他 **0**（不剥 BOM 则 `docs` 6 · `data(zh)` 1 · 其他 3）。原值既不是剥 BOM 也不是不剥的结果 | 最近 20 条里 **3 条** subject 以 `U+FEFF` 开头；两种口径分别聚合，值如上 | §5.4 第 1 条末句。**这正是同节自己写的 BOM 坑**，修正时务必声明已剥 BOM |
| **M3** | 🟠 中 | 「**全仓 `.md` 里搜 `P0-2` 只有这三处引用**、零处定义（断链）」 | 至少 **8 处引用**：`SUMMARY.md:11/89/235`、`NEXT-STEPS.md:26/169`、`PROJECT_STATUS.md:95/1371/1507`；「零处定义」成立 | 全仓 `.md` 正则检索（排除 node_modules/.worktrees/.agent-teams）；`.json` 内 0 命中 | §6.2 末行 D-补A |
| **M4** | 🟡 低-中 | D19「`PROJECT_STATUS.md:29-30` `selftest:zh` 7 项｜9 项（**是增强，文档没说**）」 | 行号错（`:29` 空行、`:30` `---`）；"7 项"在 `:680/792/921/1068/1327/1456`；**文档说了**：`:1515/:1547/:1600` 三处写 9 项。9 项本身正确 | 源码直读；`zh-selftest.js` 静态计数 = 7 `record()` + 2 `extra` = **9** | §6.2 D19 行 |
| **M5** | 🟡 低 | D20「`PROJECT_STATUS.md:28` 71 条优惠 → 53 张卡片」 | 行号应为 **`:22`**（`:28` 是「可发现性」行） | 源码直读 | §6.2「D20/D21」行 |
| **M6** | 🟠 中 | §3.8「**22** 条落在 JS 壳页面上（火山 12 + 智谱活动页 5 + 智谱免费模型 7）」；§8#9 同一分解写「**21** 条」 | 括号分解 = **24**；A2 自己的可追溯枚举 = **18**；21 与 22 都无据。须统一为一个能与分解对上的数 | `02-data.md:400-401` 的 U3（`97d21ff73d3e` + 智谱活动页 5）+ U4（火山 12）= 18；数据源计数 `智谱AI 7 + 智谱活动页 5 + 火山方舟 12 = 24` | §3.8 第 2 句、§8 风险 #9（也是 §7 数据评分扣分依据之一） |
| **M7** | 🟡 低 | §5.4「**11 个**已并入 master 且 ahead=0」 | **12 个**（不含 master；含则 13）。差额恰是 `fix/fold-same-vendor` | `merge-base --is-ancestor` + `rev-list --count master..<b>` 逐分支枚举（12 个 ahead=0） | §5.4 第 2 条 |
| **M8** | 🟡 低 | §4.2「关 JS：**12565** 字符正文 / **50** 个站内详情链」 | 我三种口径都复现不出 12565（innerText **11460**、折叠空白 11456、markup 去标签 **11994**）；站内详情链 **83** 条（其中卡级标题链 50 条） | Playwright `javaScriptEnabled:false` 实测 + 自建静态服务器 | §4.2 能力矩阵「关 JS 可读性」、§4.3③、`03-frontend.md:23/249/320` |

### 建议修正（不构成必须项，但会提高可复现性）

- **S1**：§0 第 1 条「本地 = 远端 = 线上」建议加限定：「`index.html`/`deals.json` 逐字节 + 另抽样 13 个文件；全量 139 未做」。§1.2/§9.4 已正确标注，只有 §0 是无条件措辞。
- **S2**：§5.4「四天吃掉 77%」建议写明是「09-20…09-23 这前四天」（91/118 = 77.1%）；按"量最大的四天"算是 84%，容易被读者误判为算错。
- **S3**：§3.2「只有 1 条含 4 位年份」建议补一句噪声说明：朴素正则还会命中 `97d21ff73d3e` 的「**2000万** Tokens」（非年份），否则复跑者会得到 2 条而怀疑报告。
- **S4**：§4.2「12 个 `<option>`」建议写「`<!--PRERENDER:categories-->` 注入 12 个 + 骨架自带 1 个「全部分类」= 产物 13 个」。
- **S5**：§4.5 的 JS/CSS 子项字符数（103960 / 66718 / 7336）建议注明切分锚点；我按"内容不含 `<script>` 标签"量到 104286 / 66553。总量与 CSS 41321 我精确复现。

---

## 四、明确为 UNVERIFIABLE 的 5 条（不许猜）

| # | 事项 | 为什么我没能证实 |
|---|---|---|
| 1 | 线上**全量 139 个**产物逐字节一致（V09） | 我只抽样 15 个（9 根 + 6 详情页）全部一致；剩下 68 个详情页 + 49 个 logo 未比。**报告已自标【未证实】，标注未被后续章节滥用** |
| 2 | §3.6 抽样 11 条优惠在厂商官方页的真实性（V46） | 需逐条访问官方页，其中多条是 JS 壳 / 403 / 本机不可达；属 A2 的取证域，我只核了口径自洽（5+2+4=11） |
| 3 | 7 个静态源的**逐源**条数分解（V89） | 我复现了总账「97 条 / 失败 0」（真联网 dry-run），但命令输出不含逐源分解，未逐项核对 |
| 4 | 无头 2 源 17 条（火山 12 + 智谱 5）（V90） | 未跑 `--headless`（需真装浏览器内核）；但 `probe-sources.yml:96` 的基线文字我逐字核对无误 |
| 5 | §6「28 条声明 / 16 条不符 / 12 条一致」这个总统计（V112） | 未逐条复算 28 条；且我抽查的 10 条里已发现 3 条错误（M3/M4/M5），该统计**需要重算后才能被引用** |

**另外两条"部分证实"的说明**（不算 UNVERIFIABLE 行，但要知道边界）：
- **§4.4 A4「对比度 ≤20 但实测 0 / 714」**：阈值 `≤20` 我逐字核对成立（`verify-site.js:1060/1087`），但 714 抽样"0 条不达标"是 A3 的复算，我未重跑该探针 —— **阈值 CONFIRMED，抽样值属 A3**。
- **§6.3「快速开始 4/4」**：`npm test`、`check:zh`、`report:tier` 我实跑 exit 0 三条；`serve.js` 未跑（会占端口起服务，本轮无必要）→ **3/4**。

---

## 五、验证方法附注（可复跑）

1. **线上实况**：`fetch` 15 个线上文件 + `Buffer.equals(dist/...)` + 响应头 `last-modified`（不依赖任何仓库脚本）。
2. **本地实跑**：`validate.js`（exit 0，133/80/60·73/0/61/0·112·21/32/32/3/32 + 2 警告）、`zh-todo.js --check`（exit 0）、
   `tier-report.js`（50 张卡）、`tier-report.js --vendor`（38/42/80）、`collect.js --dry-run`（97 条 / 失败 0，exit 0）、
   `verify-site.js` 无基线（**136 项 0 失败**）、`verify-site.js --compare=…`（**142 项 0 失败**）。
3. **浏览器级**：自建 Node 静态服务器（8096/8097/8098）+ `playwright-core@1.63.0` + 本机 `msedge`，**不复用仓库脚本**：
   独立复现 `#jumpNav` 在「最近更新排序 / 列表视图 / 760px」三态下的可见性与死锚点，以及关 JS 的控件数、正文长度、链接数。
4. **GitHub API**：`/actions/runs`、`/actions/workflows/<wf>/runs`、`/actions/runs?event=pull_request`、`/branches/master`、
   `/tags`、`/git/refs/heads`、`/rulesets`、`/branches/master/protection`、失败 run 的 `/jobs` 步骤级结论与三个 403 日志端点。
5. **git 本地**：`rev-parse`、`rev-list --count`、`merge-base --is-ancestor`、`branch -vv`、`worktree list`、per-day 分布、BOM 检测。
6. **源码行号**：对报告引用的每处行号做定点读取（workflow 4 个文件全文读、`validate.js`/`classify.js`/`expiry.js`/`zh.js`/
   `index.html`/`verify-site.js`/`build-local.js` 定点读），并区分「markup 计数」与「含内联 JS 模板的原始计数」。
7. **探针落盘位置**：`%TEMP%\t6probe\*.js`（仓库外，共 12 个）。
8. **自证只读**：收尾 `git status --short` 与开始时逐行一致（仅 2 个未跟踪项，均为审计目录本身）。

---

## 六、对 §0–§9 的总体判断（验证者结论）

- **主干成立**：版本坐标、线上逐字节一致、133/80/53 与 0·112·21 的账、50 张卡、门禁 136/142/143、
  `--compare` 只比 6 计数器且不在 CI、CI 19/1、`#jumpNav` 真缺陷、13 条角标/文案互斥 —— **我全部独立复现**。
- **A5 对两处依赖冲突的裁决我站队一致**：① 线上 `deals.json` = `dist`（`5c752b80…`）≠ 仓库根（`46a19472…`，差 121 B）—— A5 正确；
  ② CI 19/1=95% —— A5 正确，A4 的 18/1=90% 错。
- **A5 对 A3 单位滑落的更正正确**（详情页体积 56319–58731 字节；A3 的 49543–51033 是字符数）。
- **评分的稳健性**：8 条必须修正项**没有一条**触及 §7 四个分数的扣分依据（集中在"数据自相矛盾/前端真缺陷/门禁不可信/文档滞后"），
  也不触及 §8 风险 Top 12 的排序 —— 因此 **§7/§8 无需因本验证而改分或改序**；仅 §8#9 的条数（M6）与文档小节行号（M3/M4/M5）需按上表订正。
- **一句话**：**可以作为"当前版本的真实总结报告"交付，但先把第三节 8 条改掉**——它们的共同特征是"能被读者 5 分钟内复跑打脸"，
  而这正是本报告最贵的那部分价值所在。

---

*本文件是唯一产出；报告本体 `PROJECT-AUDIT-2026-09-28.md` 未被改动。*
