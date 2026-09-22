# theresanaiforthat.com — AI 首页：实时追踪工具/模型/新闻/融资的聚合入口

抓取：https://theresanaiforthat.com/ · 2026-09-22T16:49:36.333Z · 视口 1440×900 / 390×844
证据：research/_raw/theresanaiforthat.com/{metrics.json,tokens.json,dom-outline.txt}
口径：简报给的 3405/2790/2225/259/41 与文件值 3417/2795/2233/264(tabs)/38(sticky) 不一致，本文一律用文件值。
截图：shots/ 下有 4 张，本轮未读取、不描述画面。

## 1. 信息架构（section=14 这种「一屏多模块」结构）
语义标签：section=14、footer=1、form=1；header / nav / main / article / aside / dialog 全为 0。
标题：h2×6 + h3×8 = 14 个，其中 13 个文本为空，只有 1 个 h2 文本是 "Search"。
分块：dom-outline 里 body 40 个子节点，主 div 27 个子节点（含 svg 18、ul.notifications_list、div 59/19/14/27）。
首屏入口：a.menu_item 13 个、246×50，桌面与手机都是 13 个全部落在首屏。
收尾：footer 1440×711，是 dom-outline 里唯一给出尺寸的块。
可执行结论：学「14 个 section 平铺 + 首屏 13 入口」的分块法；不学「无 main/nav、13/14 标题文本为空」。

## 2. 数据密度（首屏 13 个 menu_item，手机同样 13 个）
首屏 13 个 a.menu_item（246×50），fullyVisibleFirstScreen=13，手机端同为 13。
列表行 div.home-listing-row.home-today-row.listing-table-row：桌面 42 行、每行 1388×65；手机 37 行、width=1013。
首屏完整可见行：桌面 5 行（触及 6），手机 4 行（触及 5）。
文本量 6010 字符（桌面）/ 5382（手机）；hydration 前后数值相等，内容预渲染。
字号 13px×779、9px×296、10px×186；行高 9px×207、10px×186。
可执行结论：密度靠「矮行 65px + 固定 13 项菜单」，不靠大卡片；面积兜底清单证据里看不到（dom-outline 仅 69 行，只给 footer 1440×711）。

## 3. 筛选与排序（search=21 / aria-pressed=259 的含义）
计数：searchInputs=21、buttons=2233、tabs=264、selects=1、switch=13、slider=13。
证据文件里没有 aria-pressed 字段，最接近的是 tabs=264；aria-pressed=259 在文件里查不到。
筛选即 URL：/tools?feature_ids=34|52|47 共 10 条；/news 41 条中可见 ?topic= 样本（military-ai、lawsuit）。
状态类名：home-listings-secondary-tab 20、home-today-entity-toggle 9、mode-option 3、home-listings-secondary-clear 3。
排序：证据里看不到 sort 控件或 sort 参数；唯一排名痕迹是 class top3×3，其含义证据里看不到。
可执行结论：只学「筛选项写成可分享 URL」（?feature_ids= 10 条），这是 2233 个按钮里零 JS 成本可移植的一条。

## 4. 详情呈现（/:slug/:slug ×2790 与 /model/:slug ×59）
/:slug/:slug 2795 条（样本 /@taaft/image-generator/?ref=header、/s/school/），占 3417 内链的 81.8%。
/:slug/:slug/:slug/:num 192 条（/company/caddi-1/fundraise/2670/）；/:slug/:slug/:slug/:slug 105 条（/company/shopify/repository/react-native-skia/）。
/:slug 132 条（/leaderboard/、/tasks/、/mini-tools/）；/model/:slug 59；/news/:num/:num/:slug 32；/tools 10；/signup 6；/login 6。
URL 最深 4 段 slug + 1 段编号；hashOnlyLinks=1；内链共 3417。
详情页总数、每页内容、条目页是否独立渲染：证据里看不到（只给了链接条数与形状）。
可执行结论：学「两级 /:slug/:slug 就能承载详情」；2795 条独立条目页与「单文件 index.html」红线冲突，不适用。

## 5. 信任与诚实性设计（能否从证据看出热度/使用量那类社会证明）
可见文案：meta description 与首屏 span 都含 "Used by 90M+ humans."（该 span 对比度 2.94）。
计数 DOM：span.home-today-views-value = 312k / 176 / 53k / 2.4k（10px，对比度 5.14）；span.home-tab-badge = 53,818 / 363（11px，5.32）。
结构类名：home-today-entity-toggle-count ×9；top3 ×3（含义证据里看不到）。
结构化数据：JSON-LD 只有 WebSite，无 AggregateRating / Review / Product，热度数字没有进结构化数据。
数字的出处、更新频率、口径（浏览数还是使用数）证据里看不到。
可执行结论：学「计数用纯 DOM 文本呈现、不依赖 JS」；不学「无出处的热度数字」。

## 6. 变现方式
唯一直接证据是账号体系：/signup 6、/login 6、requires_login 9、signin_google_btn 4、accounts.google.com 2。
外链域名 17 个：自有 media 116、video 6；第三方图片域名 12 个（theverge 2，其余各 1）。
未出现任何广告网络域名，展示广告的证据里看不到。
分析：plausible.io 1；另有 r.wdfl.co 1。
价格、付费档位、赞助位标记证据里看不到；top3×3 是否付费位证据里看不到。
可执行结论：学「核心媒体自托管」（media 116 + video 6）；第三方图源 12 个域名属热链新闻图，与「不热链 CDN」红线冲突，不适用。

## 7. SEO 与内链结构（3405 内链 / hreflang 0 / JSON-LD 仅 WebSite）
内链 3417（文件值，简报写 3405），URL 形状 12 种；hashOnlyLinks=1。
hreflang=0；JSON-LD 仅 WebSite；relNext=0（无分页 rel）；canonical=https://theresanaiforthat.com；ogImage 有。
语义：section=14 但 header/nav/main=0；14 个 heading 中 13 个文本为空。
参数化 URL：/tools?feature_ids= 10 条；日期路径 /news/2026/09/<slug> 32 条。
请求 174（img 133、css 8、link 8、script 8、xhr 8、fetch 7），文本量 6010。
可执行结论：它的 SEO 靠内链规模与 URL 形状，不靠 hreflang(0)/结构化数据(仅 1 类)/heading 文本(13/14 空)；本站 4 段 JSON-LD + canonical/hreflang 齐备，在结构化与国际化上已超过它。

## 8. 暗色实现（分层色值单独写清）
触发：theme-color=#2d2e3a、bodyBgIsDark=true、prefers-color-scheme 规则 1 条、meta colorScheme=null。
底层：rgb(41,41,50)×34、rgb(45,46,58)×5、rgb(30,30,38)×1。
面层：rgb(49,51,64)×36、rgb(53,55,70)×28、rgb(62,63,79)×17；浮层 rgba(18,19,27,0.94)×38、rgba(55,56,70,0.89)×16。
叠加/描边：rgba(255,255,255,0.07)×114、0.12×18、0.08×13；强调底 rgba(30,173,249,0.12)×25。
文本：主 rgb(236,236,241)×1089、纯白 #fff×425、次级 rgba(255,255,255,0.58)×171；强调 rgb(250,204,21)×98（黄）、rgb(94,187,255)×60（蓝）；圆角以 0px×1526 与 999px×189 两档为主。
可执行结论：暗色 = 4 层灰 + 半透明叠加 + 非纯白主文本（236,236,241 是 #fff 的 2.6 倍用量）；对比度 median 10.63、p10 5.36、min 2.94、不达标 2/347。

## 9. 可移植清单：**值得学** / **不适用**
值得学：筛选即 URL（/tools?feature_ids= 10 条），零 JS、可分享、可被抓取。
值得学：矮行密度（42 行 × 65px、首屏 13 入口、全文 6010 字符）。
值得学：暗色分层（底 41,41,50 → 面 49,51,64/53,55,70 → 叠 rgba(255,255,255,0.07)；主文本 236,236,241；对比 median 10.63）。
值得学：两级详情 URL 形状 /:slug/:slug（2795 条）与栏目页 /:slug（132 条）。
不适用：2795 条独立条目页 —— 与「单文件 index.html、零构建」红线冲突。
不适用：21 个 searchInputs / 2233 buttons / 264 tabs 的交互量级 —— 需 174 请求、8 个 script、抓取记录 elapsedMs 14408（桌面）/ 15939（手机），零构建浏览器端零依赖学不来。
