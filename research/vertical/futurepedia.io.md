# futurepedia.io — AI 工具与软件发现目录（title：Find The Best AI Tools & Software, Futurepedia.io）
抓取：https://www.futurepedia.io/ · 2026-09-22T17:03:38.787Z · 视口 1440×900 / 390×844
证据：research/_raw/futurepedia.io/{metrics.json,tokens.json,dom-outline.txt}
说明：截图未解读；三份证据里查不到的字段，明写「证据里看不到」。

## 1. 信息架构
- 首页 8.3 屏 / 7428px；body 64 个子元素；无 <main>（main 0），header 2 / nav 2 / section 3 / article 2 / footer 1 / form 2。
- H1 1 个；H2 4 个（课程、Trending Categories、AI Tool Categories、平台宣言）；H3 3 个（含 1 个空文本）。
- 三栏栅格 xl:grid-cols-[300px_1fr_200px]（1216×360）＝300px 侧栏 + 主列 + 200px 右栏。
- 面积最大块：1440×6767 主容器、1440×589 footer、1280×554 两个 section、1300×630 两个 p-10 区块。
- 证据里看不到：面包屑、条目总数、分页控件、首页之外的目录层级。

## 2. 数据密度
- 桌面 textLength 9451；hydration 文本 4765 → 9451（渲染后翻倍）。
- 采集器 primaryList = 26 项 li（宽 120、高 25–40），与卡片不是同一组件。
- 卡片组件 A：bg-white…p-4.rounded-2xl ×10，桌面 300×86–112（中位 112）。
- 卡片组件 B：bg-white…rounded-20.shadow-card-shadow ×7，桌面 984×141（定高）。
- 横向轮播 li.react-multi-carousel-item ×23（296×400 定高），轨道 ul 7696×400。
- 网格 gridTemplates：3 tracks ×2、2 tracks ×1、4 tracks ×1；gap 8px ×65、16px ×57。

## 3. 筛选与排序
- searchInputs 2、buttons 77、selects 0、tabs 0、dialog 0。
- 侧栏整宽按钮 button…hover:px-3…w-full ×9（256×48），class 内含 active: 与 hover: 变体。
- 排序控件：证据里看不到（无 select、无 tab、relNext 0）。
- 筛选项文案、类目数量、是否多选：证据里看不到。
- 筛选区是否落在首屏：证据里看不到；桌面重复组件 fullyVisibleFirstScreen 0 / touchedFirstScreen 0。

## 4. 详情呈现（/tool/:slug 与 /:slug/:slug 两种形态）
- 工具条目页走 /tool/:slug ×92（样本 /tool/chatgpt、/tool/claude、/tool/hubspot-aeo-sensor）。
- 分类聚合页走 /:slug/:slug ×117（样本 /ai-tools/ai-agents、/resources/automation、/ai-tools/chatbots）。
- 另有 /:slug ×19（/ai-tools、/business-function）、/:slug/:slug/:slug ×5（样本全部以 /best 结尾）。
- 辅助路径：/register ×4、/login ×2、/:slug/legal ×2、/contact ×1。
- 两种形态并存：一级固定段 /tool/ 管条目，二级语义段管集合；首页共 8 种 URL 形态。
- 详情页内部字段与结构：证据里看不到（本次只抓首页）。

## 5. 信任与诚实性设计
- H2 原文自称 "The World's Leading Independent AI Education & Discovery Platform"（页面自身断言）。
- meta description 称 "Updated daily"、"millions of followers"，无时间戳、无出处字段。
- 免费标识：span.absolute "FREE"（10px）×2，对比度 1.09。
- 8 条 heading 与全部 landmark 文本中未见评分、评论、作者署名、更新时间；此类字段：证据里看不到。
- jsonLdTypes 仅 Organization 1 类（无 Product / Review / ItemList / BreadcrumbList）。

## 6. 变现方式
- 课程变现：H2 "…our 2 best-selling courses" + H3 "AI Boot Camp" / "Prompting Essentials"。
- 注册链：/register ×4，含 ?source=skillleap&course=skillleap-free-promo&return_to=…skillleap.futurepedia.io/enroll/…?price_id=4742492。
- HubSpot 系域 9 个（js.hs-scripts.com、js.hs-banner.com、api.hubspot.com、perf-na1.hsforms.com 等）。
- 埋点与实验：a.plerdy.com 4、app.varify.io 2、googletagmanager 2、connect.facebook.net 2、ipapi.co 1、api.webbotify.com 1。
- meta description 提 newsletter 与 YouTube 两个渠道；广告位/联盟标记：证据里看不到（iframe 仅 2）。

## 7. SEO 与内链结构
- canonical 1 条（自指 https://www.futurepedia.io）；hreflang 0 条；relNext 0。
- JSON-LD 仅 Organization；首页无 breadcrumb / 列表类结构化数据。
- 内链 245 条，hashOnly 0；详情形态以 92 + 117 + 19 + 5 为主体。
- 无 <main> 地标；header 2 / nav 2 / section 3 / article 2 / footer 1 / aside 0。
- 请求 145 次：link 52、script 36、img 19、fetch 28、css 1；图片 80 张，lazy 78。
- 图片走自有 CDN 子域 cdn2.futurepedia.io（16 次），非第三方图床。

## 8. 移动端
- 390×844：pageHeight 10285 / 12.2 屏（桌面 7428 / 8.3 屏）。
- 卡片 A：桌面 300×86–112 → 移动 358×86（仍 10 个，单列全宽）。
- 卡片 B：桌面 984×141 → 移动 358×181–203（7 个；touchedFirstScreen 1、fullyVisible 0）。
- 移动端首屏完全可见的重复组件 0；primaryList li 26 项（宽 120、高 25–50）。
- 移动 textLength 4612；hydration 4539 → 4539（无新增文本）。
- prefersColorSchemeRules 0、bodyBgIsDark false（无暗色）；viewport 含 user-scalable=no。

## 9. 可移植清单：**值得学** / **不适用**
- 值得学：双形态层级 /tool/:slug 92 + /:slug/:slug 117 + /best 5，245 内链、0 hash-only。
- 值得学：紧凑卡片 300×86–112（桌面）/ 358×86（移动），gap 8–16px，同组件 10 张。
- 值得学：图片走自有 CDN 子域（cdn2.futurepedia.io ×16）+ lazy 78/80；移动首屏触及整行卡 358×181–203。
- 不适用：桌面首屏给 1440×900 全幅视觉（bg-gradient-blue 与 img 各 1440×900），卡片完全可见 0 / 触及 0。
- 不适用：对比度 359 抽样中 139 条不达标，min 1.09、p10 2.41（10px "FREE"）。
- 不适用：20 个外部域 + 36 script + 145 请求的埋点/实验栈；无暗色、无 hreflang、无 relNext、JSON-LD 仅 1 类。
