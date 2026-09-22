# aitools.fyi — 英文 AI 工具目录站首页：自称「Find Best AI Tools That Make Your Life Easy!」

抓取：https://aitools.fyi/ · 2026-09-22T16:48:08.165Z · 视口 1440×900 / 390×844
证据：research/_raw/aitools.fyi/{metrics.json,tokens.json,dom-outline.txt}
口径：本报告只写这三个文件里查得到的内容；查不到一律写「证据里看不到」。括号内为来源字段名。与任务背景（目标站自述）冲突处逐节标注。

## 1. 信息架构（landmarks、导航、主列表位置与规模）

landmarks：nav 1 / main 1 / footer 1 / form 1；header、section、article、aside、dialog 全 0。
骨架三段：nav 1440×72、main 1440×2625、footer 1440×290（dom-outline）。
标题结构：1 个 h1（601×36）+ 16 个 h2，其中 15 个 h2 即卡片标题（Invoice Mama…Hylark）。
主列表在 main 内、h1 与筛选条之下：单一父节点下 15 张卡，签名 `div.bg-indigo-50/30.bg-white.border.flex.hover:shadow-indigo-300…`。
无侧栏、无分区包裹、无面包屑（landmarks + 骨架）。
注：被查站 landmarks.dialog = 0，即首页无 `<dialog>` 弹层（这是被查站的事实，非目标站）。

## 2. 数据密度（pageHeight/scrollScreens、主列表签名+尺寸+首屏完整可见、静态正文长度）

桌面 pageHeight 2987px、scrollScreens 3.3；静态 textLength 3578 字符。
主列表 15 张卡、1 个父容器、宽 304px、高 363–379px（中位 363，primaryList）。
桌面首屏完整可见 2 张、touchedFirstScreen 5 张（fullyVisibleFirstScreen / touchedFirstScreen）。
支撑量：main 2625px ÷ 卡 363px ≈ 7 行；容器 max-width 1280px；grid 声明 3 tracks×2、5 tracks×1。
结论：没有长文，页面高度全部由「15 卡 × 363px」撑起。

## 3. 筛选与排序（search/select/facet/tab 计数，引 behavior）

behavior：searchInputs 1、selects 1、buttons 25、tabs 0、relNext 0。
筛选条为 `form.flex.gap-2.md:gap-3`（530×40），位于 main 顶部、h1 之下（骨架）。
facet 以 button/span 呈现：对比度抽样命中 `span.relative`=Productivity、`span`=Image Generation。
排序控件、排序字段、结果计数：证据里看不到。
无 tab、无 relNext，即证据里看不到分页控件。

## 4. 详情呈现（detailUrlPatterns 形态与计数、internalLinkCount、hashOnlyLinks）

internalLinkCount 91；hashOnlyLinks 0。
形态计数：`/:slug` 54、`/category/:slug` 22、`/deals` 3、`/blog` 3。
单次形态：`/category`、`/tag`、`/submit`、`/contact`、`/terms`、`/privacy` 各 1。
`/:slug` 样本 advertise / sorank / gpt-image-25，说明「每条一页」的 URL 形态存在。
54 是链接次数不是独立页数；独立条目页总数证据里看不到。
冲突标注：任务背景写「内链 1 条」，证据为 91，本报告采用证据值。

## 5. 信任与诚实性设计（核验/更新时间/来源署名/免责声明；看不到就写「证据里看不到」）

核验标记、更新时间、来源署名、免责声明：证据里看不到。
可查到的只有 `/terms`、`/privacy` 各 1 条链接，footer 1440×290 含 18 个子 div。
无 author / reviewedBy / dateModified 类字段（jsonLdTypes 为空，标题层只有 h1+h2）。
纠错入口：证据里看不到；`/contact`、`/submit` 各 1 条链接是唯一接近的通道。
版位条件：全页静态文字仅 3578 字符 / 15 卡，无承载大段信任说明的空间。

## 6. 变现方式（externalDomains/resourceTypes 能否看出联盟/广告/追踪）

externalDomains 仅 2 个：uhcheduqokzrcwuzqzql.supabase.co 32 次、assets.aitools.fyi 16 次。
requestCount 97；resourceTypes：fetch 43、script 24、link 15、img 12、css 1、iframe 1、other 1。
清单内无广告、联盟、统计类域名，即证据里看不到联盟/广告/追踪网络。
fetch 43 次对静态内容站偏高，指向浏览器端数据拉取（Supabase）而非纯静态渲染。
最接近变现的信号是 `/advertise`、`/submit` 链接各 1 条；分成、佣金、赞助标注证据里看不到。

## 7. SEO 与内链结构（canonical/hreflang/jsonLdTypes/meta.description；内链形态分布）

canonical 存在（https://aitools.fyi/）；hreflang 空数组；jsonLdTypes 空数组。
meta.description 存在（约 190 字符）；lang=en；ogImage 存在；colorScheme、themeColor 均 null。
被查站结构化数据为 0 段；任务背景所述「4 段 JSON-LD、hreflang 齐备」属目标站，不可当作被查站事实。
内链分布：`/:slug` 54、`/category/:slug` 22、`/deals` 3、`/blog` 3、其余单次 6。
唯一 >20px 字号是 h1 的 30px；页内标题止于 h2，无 h3。
prefersColorSchemeRules 0、relNext 0：无暗色适配规则、无分页语义。

## 8. 移动端（手机 pageHeight/scrollScreens/主列表/字号与桌面差异）

手机 390×844：pageHeight 7499px、scrollScreens 8.9（桌面 2987px / 3.3）。
手机主列表同为 15 张，宽 374px、高 382–403px（中位 383），比桌面高约 20px。
手机首屏完全可见 0 张、touchedFirstScreen 1 张（桌面 2 / 5）。
字号：手机 16px×352、14px×69、20px×17；桌面 16px×425、14px×68、20px×16、30px×1。
差异只有 30px 一档（h1 降级），14/16/20 三档一致；行高与字重手机未采集。
hydration：桌面 3578→3578 字符，手机 3524→3525，首屏内容不依赖 JS 生成。

## 9. 可移植清单

**值得学**

1. 对比度即基线：105 个抽样点 belowRequirement 0，min 4.79、median 5.19（目标站为 400 抽样 100 条不达标、最低 2.84）。
2. hover 只改阴影不动布局：卡片 `hover:shadow-indigo-300 / hover:shadow-lg`，阴影枚数 33+15，无位移。
3. 动效极简：transition 仅 `0.15s cubic-bezier(0.4,0,0.2,1)`×40（颜色类）与 `all 0s`×1，无入场动画。
4. 令牌档位少：字号 4 档、行高 4 档、字重 4 档（450/500/600/700）、圆角 0/4/9999、gap 8/12/20/24/40、文本色 5 个、背景色 8 个。
5. 图片懒加载：17 张图 12 张 lazy（约 71%）。

**不适用**

1. 首屏只 15 卡、完整可见 2 张：与目标站 62 卡 / 首屏 9 张 / 5.9 屏的定位相反，照搬即砍信息量。
2. 外域 assets.aitools.fyi 16 次 + iframe 1 个：触碰「不热链 CDN」红线，单文件零构建不成立。
3. fetch 43 次 / 共 97 请求的浏览器端拉取：与「预渲染、不执行 JS 也能读」的数据层设计冲突。
4. 手机 8.9 屏长滚动：目标站 62 卡按同密度只会更长，成本收益不成立。
5. 证据里看不到的暗色、排序、分页、独立条目页正文、信任字段：无依据可移植。
