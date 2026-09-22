# toolify.ai — AI 工具目录 / 工具清单首页（title：Best AI Tools Directory & AI Tools List - Toolify）

抓取：https://www.toolify.ai/ · 2026-09-22T17:01:55.560Z · 视口 1440×900 / 390×844 · 抓取提示：note 原文只有「load 事件 8s 内未触发（有长轮询/埋点的站点常见），继续按内容判断」，未见「goto 30s 超时」字样；时限证据只有 elapsedMs 38353ms（桌面）/ 25328ms（移动）。
证据：research/_raw/toolify.ai/{metrics.json,tokens.json,dom-outline.txt}（shots/ 存在但未读图，本报告不描述任何画面）

## 1. 信息架构
内链 internalLinkCount=393、hashOnlyLinks=0（brief 说 396，证据里是 393，以证据为准）。
landmarks 近乎全空：header 1、section 3、footer 1；nav/main/article/aside/form/dialog 全 0。
标题共 10 个：h1×1（Discover The Best AI Websites & Tools）、h2×2（Free AI Tools by Category / Featured*）、h3×7（含 3 个「--sref 数字」）。
路由 12 种形状：/category/:slug 134、/:slug/:slug 94（样本全为 /prompts/:slug）、/:slug 81、/:slug/:slug/:slug 42、/tool/:slug 27，其余 7 种合计 10 条（/apps 2、/category 2、/submit 2、/jobs 1、/login 1、/blog 1、/news 1）。
布局：主列 653×3917 + 侧栏 384px（sidebar-scroll-container 384×828），容器 max-width 1482/1504px。
桌面 pageHeight=7918 → 8.8 屏；footer 块 1376×1580（约占页高 20%）。

## 2. 数据密度（22767 字符静态正文是怎么堆出来的）
证据 textLength=22717（桌面），水合 textBefore=textAfter=22717 —— brief 写的 22767 在证据里查不到，以 22717 为准。
堆法一：重复组件 li×40（宽 237、高 40–60）、div.w-full×22（256×144）。
堆法二：条目位 = tool-item×20（619×112–120）+ history-recommended×10（619×112），约 30 个卡片位。
堆法三：images=120、img 资源 173 条、lazyImages=1（几乎全量加载）；requestCount=237、script 48。
版式极省：字号 16px×1450 / 12px×178 / 14px×124；行高 24px×1427；字体族只有 Helvetica×1773。
结论：22717 字符来自「30 个卡片位 × 每卡多行」，不是长文案；移动端 textLength=22515，几乎同量。

## 3. 筛选与排序
页内控件几乎为零：searchInputs=1、selects=0、tabs=0、buttons=5。
排序与视图切换交给预生成路由：/:slug 的样本就是 /free-ai-tools、/new、/most-saved。
分类入口 /category/:slug ×134 加 /category ×2，共 136 条指向分类。
分组痕迹：class 含 history-recommended×10（10 个卡片位）；触发条件与排序规则证据里看不到。
3 个 sticky 元素（侧栏 sidebar-scroll-container 384×828 可滚动），fixedElements=0。
形态结论：它的「筛选」是可爬取的路由，不是页内控件（页内 select 0、tab 0）。

## 4. 详情呈现（/category/:slug ×137 与 /tool/:slug ×27 的分工）
证据数是 /category/:slug ×134 与 /tool/:slug ×27（brief 的 137 在证据里查不到），比例约 5:1。
分类页样本：/category/ai-api、/category/ai-developer-tools、/category/ai-models。
工具页样本：/tool/today-ai-1、/tool/kennel-by-waldo、/tool/playwriter。
另有 /prompts/:slug ×94 与 /midjourney-library/{style,sref}/:slug ×42，详情形状共 4 类。
详情入口是文字型链接 a.cursor-pointer…flex.gap-1 ×10（358×44，首屏完整可见 6、触及 7）。
承载区：section.index-tools-section 653×3812 + div.tools.grid.gap-2 619×3696；详情页内部字段证据里看不到。

## 5. 信任与诚实性设计
同页数字自相矛盾：meta.description 写「Over 30800+ AI Websites」，正文出现「6669 tools」。
该「6669 tools」本身就是最差对比度样本之一（div.left-0，14px，ratio 2.43，required 4.5）。
h2「Featured*」带星号，指向推荐位标注意图；星号脚注文本证据里看不到。
入口：/submit ×2、/login ×1、/jobs ×1；是否收费、是否卖排序证据里看不到。
对比度整体：sampled=387、belowRequirement=204、min=2.43、p10=2.6、median=3.55（要求 4.5），另有 5 条因复杂背景跳过。
对照：我方 400 抽样 100 条不达标、最低 2.84 —— 两边都不达标，它更差（204/387 vs 100/400，2.43 vs 2.84）。

## 6. 变现方式（外部域名 5 个）
externalDomains 逐条是 9 个；归并后 = 自有 CDN 2（cdn-images.toolify.ai 168、cdn.toolify.ai 1）+ 登录 1（accounts.google.com 2）+ 统计 4 类（GTM 2、GA 1、Clarity 2 条、Plausible 1）。
「5 个」只在按「自有 CDN / Google 登录 / GA+GTM / Clarity / Plausible」归并时成立；按域名逐条数是 9。
关键否定证据：清单里没有广告域、没有联盟或跳转域名 —— 页面上看不到广告位与返利外链。
只看到变现入口：/submit ×2（收录提交）、/login ×1、/jobs ×1、h2「Featured*」×1。
图片 120 张、img 资源 173 条全走 cdn-images.toolify.ai；是否有赞助图位证据里看不到。
计价方式、排序售卖、佣金比例一律证据里看不到（不要据本文件推断其收入）。

## 7. SEO 与内链结构（hreflang 10 条但 JSON-LD 缺失）
canonical=https://www.toolify.ai/；hreflang 10 条：x-default + de/es/fr/ja/ko/pt/zh-TW/vi/zh-CN；lang=en。
jsonLdTypes=[] —— 零 JSON-LD（与标题所述一致）；ogImage=cdn.toolify.ai/default.webp 存在。
内链 393、hashOnlyLinks=0；12 种路由形状，最深 /:slug/:slug/:slug ×42。
relNext=0（无分页 rel）；meta.viewport 含 maximum-scale=1, user-scalable=no（禁止用户缩放）。
静态正文 22717，水合前后同值 → 无脚本也能读到全部正文（预渲染）。
对照：我方 4 段 JSON-LD、canonical/hreflang 齐备、内链 1 条 —— 结构化数据我方多，内链广度它多（393 vs 1）。

## 8. 移动端（28.7 屏）
视口 390×844；pageHeight=24228、scrollScreens=28.7（桌面 7918 / 8.8 屏）→ 移动端多约 19.9 屏。
textLength 22515 vs 桌面 22717 → 内容不裁剪，只是排得更长。
卡片变窄：tool-item 619→336px 宽（高 112–120→120）；div.w-full 256×144→181×128。
移动 primaryList 换成 a.flex.flex-shrink-0…rounded（count 6、123×24，首屏完整可见 4）；重复 li 40→17。
首屏工具卡完整可见 1→0、触及 2→1；stickyElements=3 沿用。
prefersColorSchemeRules=0 → 无暗色规则；bodyBgIsDark=true 与背景 token 全为浅灰（rgb(243,244,246)×52）矛盾，如实并列。

## 9. 可移植清单：**值得学** / **不适用**
值得学 1｜预渲染正文 22717 字符、水合前后同值 —— 正文不靠脚本注入，与零构建单文件方向一致。
值得学 2｜内链 393 条 / 12 种路由形状，其中 /category/:slug ×134 为主、/tool/:slug ×27 为辅（≈5:1）。
值得学 3｜术语极简：字体族 1（Helvetica）、主字号 3（16/12/14px 共 1752 处）、主圆角 0/4/8px、主间距 8/12px。
不适用 1｜对比度 204/387 条不达标、最低 2.43（我方 100/400、最低 2.84）—— 更差，不学。
不适用 2｜meta「30800+」与正文「6669 tools」自相矛盾；viewport 禁缩放（user-scalable=no）；零 JSON-LD、relNext=0。
证据里看不到｜dom-outline 的「class 命名频次（前 45）」段只有标题无内容；真实转化、收入、排名、图片内容均无证据。
