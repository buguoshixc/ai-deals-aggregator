# devtk.ai — AI 模型定价 / MCP / 结构化输出的浏览器端开发者工具站（title：DevTk.AI - Models, Pricing, MCP, and Structured Output Tools）

抓取：https://devtk.ai/ · 2026-09-22T16:50:16.050Z · 视口 1440×900 / 390×844
证据：research/_raw/devtk.ai/{metrics.json,tokens.json,dom-outline.txt}
截图目录 shots/ 存在，但本次未读图、不描述任何画面。
本文所有数字均取自上述三个文件；文件里查不到的一律写「证据里看不到」。
同类站定位：它是本项目**唯一已对比过的同类站**（PROJECT_STATUS.md 2.9）；本文只做形态对照。

## 1. 信息架构
landmarks：header=1 nav=2 main=1 section=5 article=0 aside=0 footer=1 form=0 dialog=0。
标题三层：h1×1「Plan AI model spend and API throughput.」、h2×5、h3×19；h2 依次为「Lead with workflows, not a wall of tools.」「Core tools」「High-intent guides」「Resources that stay, without owning the homepage」。
首页正文按语义分成 5 个 section：552 / 484 / 661 / 315 / 339 px；main=1440×2383、footer=1440×374。
内容分三块：Core tools 6 个 h3（250px 宽）、High-intent guides 4 个、Resources 4 个（All tools / Models directory / AI credits & deals / Guides）。
同源链接 65 条、同页锚点 0；URL 形态 12 种，最深到 /:slug/tools/:slug。
结论：首页是「工作流 → 工具 → 指南 → 资源」的四段式目录，不靠卡片墙堆量。

## 2. 数据密度（请求数极少说明了什么）
requestCount=10：script 6、link 2、other 1、xmlhttprequest 1；外部域名只有 1 个（static.cloudflareinsights.com）。
水合前后正文完全一致：桌面 3506→3506、移动 3469→3469，即服务端直出、无客户端补内容。
静态正文 3506 字撑起 pageHeight=2814px（3.1 屏 @1440×900）——3.1 屏装完全站首页内容。
零图片：images=0、lazyImages=0；字体族只有 1 个（ui-sans-serif，277 处）。
容器宽只有 4 档（1280/1536/672/768px 各 2 处）；栅格只有 4 tracks×4、3 tracks×2。
换算：3506 字 / 10 请求 ≈ 每请求承载 350 字正文，页面无图、单字体、服务端直出。

## 3. 筛选与排序
searchInputs=0、selects=0、tabs=0、aria-pressed=0、relNext=0。
buttons=3——全页仅 3 个按钮，说明首页几乎无交互控件。
交互落点只剩链接：stickyElements=1（页头吸顶）、fixedElements=0。
首屏重复组件 fullyVisibleFirstScreen=0 / touchedFirstScreen=0：首页第一屏内没有完整可见的列表条目。
因此首页是「导航页 + 跳转」，筛选/排序/翻页若存在，证据里看不到。
证据里看不到：任何筛选维度、排序字段、结果计数、分页结构。

## 4. 详情呈现（/:slug/tools/:slug ×17）
detailUrlPatterns 共 12 种形态，最深的叶子是 /:slug/tools/:slug ×17（样本 /en/tools/pricing-calculator/ 等）。
其余形态：/:slug/:slug/:slug ×9（directory 分类页）、/:slug/blog/:slug ×7、/:slug/models ×6、/:slug/tools ×5、/:slug/blog ×5、/:slug/deals ×4、/:slug/:slug ×4、/:slug/news ×3。
即：首页 → 分类枢纽（tools / models / blog / deals / news / directory）→ 独立条目页，三层齐全。
首页自身的 6 个 Core tools 以 h3 呈现，尺寸 250×24 或 250×48（标题折两行）；High-intent guides 4 个为 258×24。
首页 article=0：详情内容不落在首页，全部交给独立 URL 承载。
证据里看不到：17 个工具页各自的内容、模板、结构化数据与内链——本文件只有首页证据。

## 5. 信任与诚实性设计
对比度（近似）：抽样 101、最低 4.34、p10 4.76、中位 5.17、低于要求 6、复杂背景跳过 9。
不达标样本集中在 12px 小字标签：span.text-xs「Tokens & Pricing」4.34:1 ×4、「Schemas & Specs」4.34:1、「Prompt Engineering」4.34:1（要求 4.5）。
最低 4.34 与要求 4.5 只差 0.16，即它是「擦线过关」而非大幅超标；p10=4.76 仍高于 4.5。
metrics._note 声明：对比度为纯色背景近似值，复杂背景样本计入 skippedForComplexBackground（9 条）。
暗色：bodyBgIsDark=false、prefers-color-scheme 规则=0、meta.color-scheme=null、theme-color=null。
证据里看不到：首页 h1–h3 与 landmarks 中均无免责声明、核验日期、数据来源标注——是否有信任徽章或正文级说明，本文件查不到。

## 6. 变现方式
外链域名仅 1 个：static.cloudflareinsights.com（count=1）——统计用途，不是广告域。
页面有 /:slug/deals ×4 形态链接，页脚 Site 组含「AI credits & deals」；核心工具区含「AI Model Pricing Calculator」。
首页 JSON-LD 类型为 WebSite + Organization，无 Offer / Product / AggregateRating 之类商务标记。
images=0、buttons=3、form=0、dialog=0：首页无订阅框、无弹窗、无横幅位。
证据里看不到：联盟链接、赞助位、affiliate 参数、广告脚本、定价页——不要据本文件推断其收入。
注：首页 h1 是「Plan AI model spend」这类工具叙事，不是促销叙事。

## 7. SEO 与内链结构（hreflang 3 条 / WebSite+Organization）
canonical=https://devtk.ai/en/（自指）；lang=en；meta.description 126 字；ogImage=https://devtk.ai/og-image.png。
hreflang 3 条：en → /en/、zh-CN → /zh/、x-default → /en/——两语言市场 + 兜底齐全。
jsonLdTypes 2 类：WebSite、Organization。
内链 65 条、同页锚点 0、relNext=0；URL 形态 12 种（见第 4 节）——权重有叶子页可流。
对照我方：hreflang 2 条（zh-CN / x-default 自指，**缺英文 hreflang 与英文页**）；JSON-LD 4 段（Organization / BreadcrumbList / FAQPage / ItemList，**无 WebSite**）。
差距表述：它的差距在「只有 2 类结构化数据」，我方的差距在「只有 1 个语言、且没有 WebSite 节点」。
证据里看不到：sitemap、robots.txt、收录量、排名、外链——本文件不评估 SEO 效果。

## 8. 移动端
移动抓取视口 390×844；pageHeight=6342、scrollScreens=7.5（桌面 2814 / 3.1 屏）。
正文长度几乎不变：3506→3469 字；字号分布 14px×132、16px×116、12px×7、24px×7、18px×6、36px×1（h1 由 48px 降为 36px）。
主列表组件宽度 355→308px、高度 38→38px（不变）；卡片组件宽度 300→358px、高度 238→214–238px。
首屏完整可见仍为 0（fullyVisibleFirstScreen=0），但移动端 7.5 屏承载与桌面同量的 9 条列表 + 8 卡片。
对照我方：我方 5.9 屏、首屏 9 张卡 —— 移动端屏数上我方更短，它是 7.5 屏。
证据里看不到：移动端是否有折叠菜单、是否改单列、是否横向滚动（mobile 段未给 gridTemplates/behavior）。

## 9. 可移植清单：**值得学** / **不适用**
值得学：
1. 请求纪律：全页 10 请求、零图片、单字体族（我方对照项需自查，本文件不含我方数字）。
2. 结构化数据补 WebSite 节点（它 2 类含 WebSite，我方 4 段无 WebSite）。
3. 多语言 hreflang 三件套（en / zh-CN / x-default，3 条；我方 2 条且自指）。
4. 语义骨架齐全：header=1 nav=2 main=1 section=5 footer=1。
5. 首页控高：3.1 屏装完全站入口，靠 5 个 section 分段而非长列表。
不适用：
1. searchInputs=0 / selects=0 / tabs=0：我方有筛选诉求，不能照搬零筛选。
2. images=0 / lazyImages=0：无图形态不适用于需要视觉证据的场景。
3. bodyBgIsDark=false、prefers-color-scheme 规则=0：无暗色，不适用于暗色诉求。
4. 主列表行高 38px：与定高卡片（我方 192px）是两种密度模型，不可混用。
5. 首页 buttons=3、form=0：无订阅/表单形态，不适用于需要留资或订阅的场景。
证据里看不到：转化率、收入、真实用户行为、A/B 结果；本节仅为形态对照。
