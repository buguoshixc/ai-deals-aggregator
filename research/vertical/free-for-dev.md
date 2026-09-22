# free-for-dev — 长文档式免费额度目录（单页装下 39 个分类、20.9 万字符）
抓取：https://free-for.dev/ · 2026-09-22T16:50:54.958Z · 视口 1440×900 / 390×844
证据：research/_raw/free-for-dev/{metrics.json,tokens.json,dom-outline.txt}

## 1. 信息架构（landmarks 里缺什么）
landmarks：main 1 / section 1 / article 1 / aside 1；header、nav、footer、form、dialog 全为 0。
DOM 骨架是 `<main>` = `<aside.sidebar> 300×900` + `<section.content>`，侧栏承担全部导航。
标题层级：h1 共 3 个（"Free for Developers"、"free-for.dev"、"Table of Contents"），h2 共 39 个（metrics 中 h2 计数 57，含未出现在 outline 截断部分的条目）。
唯一的 nav 语义由 `ul` 列表代替：侧栏 `ul 284×2118`，内嵌 `ul 269×2046`。
无 `rel=next`（relNext 0），无分页语义。
证据里看不到：侧栏折叠/展开的具体交互行为（只有 class 名 `sidebar-toggle`）。

## 2. 数据密度（几十屏 / 二十万字符意味着什么）
桌面：pageHeight 60810px，scrollScreens 67.6，textLength 209613 字符。
移动：pageHeight 146928px，scrollScreens 174.1，textLength 同样是 209613（内容不变，只换行变高）。
内容是紧凑列表；最大的分组 `ul 996×5656`，最小的 `ul 996×129`。
重复组件只有一种：h2，桌面 57 个、全部 996×36（min=max=36），首屏完全可见 0 个、擦边 0 个。
数据结构：分类（h2）→ 无序列表 → 列表项很长，没有产品级卡片。
证据里看不到：条目总数（metrics 未统计列表项条数）。

## 3. 筛选与排序
behavior：searchInputs 1、selects 0、buttons 1、tabs 0。
只有 1 个搜索框，配套 class 是 `search / input-wrap / clear-button / results-panel`。
没有 `<form>`（landmarks.form = 0），筛选完全靠脚本。
桌面上按钮只有 1 个，另外 3 个 fixed 元素（DOM 里出现的 `github-corner`、`progress` 是候选）。
证据里看不到：排序能力（无 selects、无排序按钮证据）；也看不到搜索是否实时、是否匹配正文。

## 4. 详情呈现（同页锚点 vs 独立页：hashOnlyLinks 与 URL 形态）
hashOnlyLinks 232，internalLinkCount 233——即 99.6% 的内链是纯 `#` 锚点。
detailUrlPatterns 为空数组：没有任何独立条目页。
实际 URL 是 `https://free-for.dev/#/`，`#/` 形态说明路由被脚本接管但没产出详情页。
详情即同页文本：h2 分类 + `ul` 条目，`article.markdown-section 1026×60750` 一路到底。
DOM 中 `anchor` class 出现 19 次，`section-link` 出现 59 次（锚点跳转是主导航方式）。
证据里看不到：单条目内部的字段结构（是否有价格/额度/期限字段）。

## 5. 信任与诚实性设计
meta.description 写明痛点："a massive amount of services offering free tiers, but it can be hard to find them all to make informed decisions"。
无 footer（landmarks.footer 0）：没有可见的"最后更新/维护者/贡献方式"承诺区。
外链域名含 `www.trackawesomelist.com`（1 次）——第三方追踪/展示服务。
页面上图片只有 1 张（ogImage 指向 GitHub raw 的 logo.webp）。
对比度是明显短板：400 抽样中 189 条低于要求，最低 2.47（p10 也是 2.47），要求 4.5；最差样本全是 15px 的 `a` 元素（如 "Pull Requests"、"BaaS"、"Artifact Repos"），绿色链接 `rgb(66,185,131)` 压在浅底上。
诚实性提示语（如"额度可能变动"）在证据里看不到。

## 6. 变现方式
资源只有 11 个请求：script 4 / link 2 / xmlhttprequest 2 / fetch 1 / img 1 / other 1。
无广告位证据：无 sponsor 区块、无 iframe、无 affiliate 参数（证据里看不到任何变现标记）。
第三方域名 4 个：`cdn.jsdelivr.net` 5、`www.google-analytics.com` 1、`www.googletagmanager.com` 1、`www.trackawesomelist.com` 1。
即 5 次 jsdelivr 请求 + 1 套 GA/GTM 统计，是唯一可确认的第三方依赖面。
证据里看不到：捐赠、赞助商、付费收录的任何痕迹。

## 7. SEO 与内链结构（canonical/JSON-LD 缺失这件事要写清）
canonical: null —— 没有 canonical。
hreflang: [] —— 没有 hreflang。
jsonLdTypes: [] —— 零条 JSON-LD。
`lang` 为 null，meta 里也没有 colorScheme / themeColor。
内链结构：233 条内链中 232 条是 hash 锚点，跨页内链近乎为零，权重无法在页面间流动。
首屏是客户端水合：桌面 textBefore 19 → textAfter 209613（9.28s）；移动直接 209613（6.79s），说明首屏 HTML 里几乎没有正文。

## 8. 移动端（一百多屏是什么概念）
390×844 下 pageHeight 146928px，scrollScreens 174.1（桌面 67.6 的 2.6 倍）。
文字量与桌面完全一致（209613），变高的只有换行：h2 在移动端 321 宽、高度 36–108px（桌面恒为 36）。
首屏内容参与度 0：h2 的 fullyVisibleFirstScreen 0、touchedFirstScreen 0，"Table of Contents" 之后要滚很远才到第一个分类。
字号基本不变：15px 出现 3150 次、28px 171 次，桌面与移动的 fontSizes 列表完全相同。
无暗色：prefersColorSchemeRules 0，bodyBgIsDark false。
证据里看不到：移动端侧栏是否默认收起（class 名 `sidebar-toggle` 存在但行为未采到）。

## 9. 可移植清单：**值得学** / **不适用**
**值得学**
1. 密度优先：单页承载 209613 字符、57 个 h2，不靠卡片堆屏，靠分组 + 长列表让人一次滚完。
2. 极简筛选：1 个搜索框 + 1 个按钮 + 0 个 select，就能覆盖一个 20 万字符目录的查找需求（`results-panel` 直接给结果）。
3. 请求面积极小：11 个请求、1 张图、0 图标字体，第三方只有 GA/GTM 与 jsdelivr。
4. 同页锚点导航：232 条 hash 链接 + 侧栏 h2 目录（`section-link` 59），跳转成本为 0。
5. 长列表同构：h2 高度在桌面恒为 36，视觉节奏完全由内容长度决定。
6. 反例价值：189/400 条对比度不达标、最低 2.47——"同类站"普遍没把可访问性做好，这是可超越项。

**不适用**
1. 无 canonical / 无 JSON-LD / 无 hreflang / lang 为 null：不可复制，这是明确缺陷。
2. 232/233 内链是 hash、detailUrlPatterns 空：不可复制，条目无法被单独收录或分享。
3. 首屏 HTML 仅 19 字符、靠 9.28s 水合出 209613 字符：不可复制。
4. 174.1 屏的移动端长页、首屏 h2 可见数为 0：不可复制。
5. 无 footer、无更新承诺区：不可复制，信任成本外推给用户。
