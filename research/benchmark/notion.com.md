# notion.com — AI 工作空间官网；亮色 + 1 条 prefers-color-scheme（跟随系统）+ 10 层微投影的营销首页
抓取：https://www.notion.com/ · 2026-09-22T17:00:07.138Z · 视口 1440×900 / 390×844
证据：research/_raw/notion.com/{metrics.json,tokens.json,dom-outline.txt}

## 1. 色彩系统（半透明文字色的用法：rgba(0,0,0,.898)/.75/.95）
- 文字三档主色：`rgba(0, 0, 0, 0.95)`×60（最重）· `rgba(0, 0, 0, 0.898)`×187（最高频 = 正文基准）· `rgba(0, 0, 0, 0.75)`×69（次级）。
- 弱化两档：`rgba(0, 0, 0, 0.59)`×2 · `rgba(0, 0, 0, 0.54)`×10；另有纯黑 `rgb(0, 0, 0)`×13 与反白 `rgb(255, 255, 255)`×45。
- 规律：同一色相（纯黑）只调 alpha，阶梯为 0.95 / 0.898 / 0.75 / 0.59 / 0.54；正文刻意不用 alpha=1。
- 背景层：`rgb(255, 255, 255)`×17 · `rgb(249, 249, 248)`×6 · `rgb(246, 245, 244)`×1 · `rgba(255, 255, 255, 0)`×23（透明占位）· `rgba(0, 0, 0, 0.05)`×1；`rgba(0, 0, 0, 0.75)`×23 同时出现在背景列表（同一 token 双向复用）。
- 强调色只有蓝族：文字 `rgb(9, 127, 232)`×8 · `rgb(0, 117, 222)`×3 · `rgb(0, 91, 171)`×1；背景 `rgb(0, 117, 222)`×2 · `rgb(9, 127, 232)`×2 · `rgb(0, 91, 171)`×1。
- 点缀色（各 1–2 次）：`rgb(246, 73, 50)`×2 · `rgb(255, 177, 16)`×2 · `rgb(189, 230, 228)` · `rgb(19, 19, 186)` · `rgb(227, 45, 20)` · `rgb(230, 243, 254)` · `rgb(232, 157, 1)` · `rgb(26, 174, 57)`（各 ×1）。

## 2. 字阶与行高
- 桌面字号：16px×325 · 14px×63 · 40px×10 · 12px×4 · 20px×4 · 18px×3 · 22px×3 · 72px×3 · 54px×2 · 96px×1。
- 行高：24px×253 · 0px×69 · 20px×66 · 28px×10 · 60px×10 · 16px×4 · 87.12px×3 · 56px×2 · 100px×1（0px 条目证据里只给值，未给用途）。
- 配对（按频次推断）：16px↔24px、14px↔20px；40px×10 与 60px×10 同频（1.5 倍）；72px↔87.12px（=72×1.21）、96px↔100px（1.04）、54px↔56px（1.04）。
- 字重只用 4 档：400×258 · 500×141 · 700×15 · 600×4（无 300/800/900）；字族 NotionInter×414 · Lyon Text×4。
- 移动端（390×844）字号：16px×311 · 14px×72 · 24px×45 · 28px×10 · 12px×4 · 18px×3 · 20px×3 · 0px×3。
- 断点差值：桌面 40px×10 与移动 28px×10 同频（推断降级）；移动 24px×45 在桌面不存在、桌面 22px×3 在移动不存在；桌面 54 / 72 / 96px 在移动端无对应条目。

## 3. 间距 / 圆角 / 阴影（10 层微投影逐个列出，说明阶梯关系）
- 圆角：0px×330 · 8px×50 · 12px×17 · 9999.01px×7 · 4px×6 · 100%×3 · `12px 0px 0px`×2 · `12px 12px 0px 0px`×2 · 50%×1。
- 间距 gap：8px×29 · `0px 8px`×23 · 12px×19 · 16px×12 · 24px×4 · 32px×2 · 4px×2 · 64px×1 · `40px 24px`×1 · `80px 24px`×1。
- 内边距 padding：`6px 6px`×25 · `3px 3px`×23 · `24px 24px`×11 · `5px 5px`×5 · `96px 96px`×2 · `80px 24px`×1；容器 max-width 1184px×2 · 1252px×2 · 891.92px×2 · 1380px×1。
- 微投影 A（4 层，命中 4 次，原文）：`rgba(0, 0, 0, 0.01) 0px 0.175px 1.041px 0px, rgba(0, 0, 0, 0.02) 0px 0.8px 2.925px 0px, rgba(0, 0, 0, 0.027) 0px 2.025px 7.847px 0px, rgba(0, 0, 0, 0.04) 0px 4px 18px 0px`
- 微投影 B（6 层，命中 1 次，原文）：`rgba(0, 0, 0, 0.008) 0px 0.667px 3.502px 0px, rgba(0, 0, 0, 0.016) 0px 2.933px 7.252px 0px, rgba(0, 0, 0, 0.02) 0px 7.2px 14.462px 0px, rgba(0, 0, 0, 0.024) 0px 13.867px 28.348px 0px, rgba(0, 0, 0, 0.03) 0px 23.333px 52.123px 0px, rgba(0, 0, 0, 0.04) 0px 36px 89px 0px`
- 阶梯关系：A+B 共 10 层，全部 spread=0px、色相纯黑；(y, blur) 逐层约 ×2 放大（A 1.041px→18px，B 3.502px→89px），alpha 单调递增且末层同为 0.04 —— 层数即阴影跨度（4 层≈小卡，6 层≈大浮层）；另有 1 条 `rgba(0, 0, 0, 0) 0px 1px 0px 0px`（alpha=0，视觉不可见，证据里看不到用途）。

## 4. 动效（逐条抄出属性 + 时长 + 缓动曲线）
- `background-color, color 0.2s cubic-bezier(0.42, 0, 1, 1)`×25 · `text-decoration-color 0.2s cubic-bezier(0.42, 0, 1, 1)`×23 · `outline-color 0.2s cubic-bezier(0.42, 0, 1, 1)`×8
- `background-color 0.15s ease`×5 · `background-color 0.2s cubic-bezier(0.42, 0, 1, 1)`×5 · `background-color, border-color 0.2s cubic-bezier(0.42, 0, 1, 1)`×1
- `box-shadow 0.2s cubic-bezier(0.645, 0.045, 0.355, 1)`×3 · `transform 0.2s cubic-bezier(0.645, 0.045, 0.355, 1)`×3 · `box-shadow 0.2s cubic-bezier(0.42, 0, 1, 1)`×1
- `inline-size 0.3s cubic-bezier(0.86, 0, 0.07, 1)`×1 · `transform 0.3s cubic-bezier(0.86, 0, 0.07, 1)`×1 · `opacity 0.3s ease`×1 · `transform 0.3s ease`×1 · `all 0.2s ease`×1
- 曲线分工：颜色 / 描边一律 `cubic-bezier(0.42, 0, 1, 1)` + 0.2s；阴影与位移用 `cubic-bezier(0.645, 0.045, 0.355, 1)` + 0.2s；只有 0.3s 的大位移用 `cubic-bezier(0.86, 0, 0.07, 1)`。
- 时长只有 3 档：全部 79 条 transition 中 0.2s 占 70 条（25+23+8+5+3+3+1+1+1）、0.15s 占 5 条、0.3s 占 4 条。

## 5. 暗色策略（唯一跟随系统的样本：prefers-color-scheme 规则 1 条、bodyBgIsDark=false）
- `behavior.prefersColorSchemeRules = 1`（全站仅 1 条媒体查询规则）、`bodyBgIsDark = false`；`meta.colorScheme = null`、`meta.themeColor = null`（HTML 未声明 color-scheme / theme-color）。
- 实测底色仍是亮色：`rgb(255, 255, 255)`×17 · `rgb(249, 249, 248)`×6 · `rgb(246, 245, 244)`×1；本次抓取未模拟暗色偏好，即默认路径下 body 为亮色。
- 那 1 条 `prefers-color-scheme` 的原文、断点、选择器与目标色值：证据里看不到（metrics / tokens 只记录计数，不记录 CSS 文本）。
- 手动三态（跟随系统 / 强制亮 / 强制暗）的痕迹：证据里看不到 —— 无相关字段，`buttons`=6 · `tabs`=0 · `selects`=0 · `searchInputs`=1。
- 可执行结论（跟随系统这条路）：亮色写默认层（无媒体查询），暗色只由 1 条 `prefers-color-scheme` 覆盖 —— 本样本可见规模就是「亮色 + 1 条规则」，也是全样本里唯一这么做的一站。
- 推论（非证据，标注为推论）：亮色默认 + 1 条覆盖 = 手动三态只能在 JS 打标记后用同 1 组变量覆盖；本站证据里没有该实现的任何数值可抄。

## 6. 对比度实测（worst 里 1:1 的几条是 visuallyHidden 之类的辅助文本——如实写）
- 样本：`sampled`=80 · `skippedForComplexBackground`=0 · `min`=1 · `p10`=1 · `median`=17.4 · `belowRequirement`=12。
- `worst` 8 条全部 `ratio`=1、`required`=4.5；类名含 `visuallyHidden` 的只有 1 条：`span.HeroMedia-module-scss-module__t-AqdW__visuallyHidden`（文本 "Pause"，16px）—— 视觉隐藏辅助文本，1:1 属预期。
- 另 7 条不是隐藏文本：`blockquote.semanticTypography-module-scss-module__Db2fhq__semanticTypography` ×3（18px，文本 "Using the most AI-native tools like Noti" / "Notion's thoughtful design speeds up col" / "Notion Custom Agents help our team go be"）。
- 以及 `span.accreditation-module-scss-module__rJjRWG__infoName` ×2（14px）+ `__infoMeta` ×2（14px）："Michael Truell" / "Co-founder & CEO" / "Renee Solorzano" / "Sr. Director of Product Design"。
- 这 7 条为何算出 1:1：证据里看不到它们各自的背景色与叠加关系（`skippedForComplexBackground`=0，无样本因复杂背景跳过；`metrics._note` 声明对比度为纯色背景近似值），只能如实记数值。
- 可用读数：中位 17.4 说明主体文本近黑 on 白、对比极高；`belowRequirement` 12 条中能对上名单的 8 条全部 ratio=1，其余 4 条明细证据里看不到。

## 7. 骨架与命名（landmarks header=4/nav=2/main=1/article=3；hreflang 22 条）
- landmarks：header=4 · nav=2 · main=1 · section=2 · article=3 · aside=0 · footer=1 · form=0 · dialog=0；标题层级 h1×1 · h2×5 · h3×9（前 3 条 h3 的 text 为空）。
- 面积兜底（dom-outline 前 40）：1440×4053 div → main 1440×3549 → homepage main 1440×1448 → heroContainer 1440×1329 → heroGrid 1440×1149；footer 1440×396；bentoGrid 1229×948。
- 单块实测：article.bento 1229×364×1 与 602×560×2；bento 图 602×578×2、554×554×2；hero 媒体 960×601、video 958×599；dropdown 826×376、794×352；socialProofV2 cards 1229×492。
- 文本量：桌面 pageHeight 4053 / scrollScreens 4.5 / textLength 1587（hydration 1587→1585）；移动 pageHeight 4091 / 4.8 / textLength 1985（hydration 1461→1983）。
- 命名：`<component>-module-scss-module__<hash>__<name>` 三段式（CSS Modules + 内容哈希），组件名可读，如 homepageHeroTeamsAndAgents / bentoGrid / socialProofV2 / globalNavigation / productFeaturesDropdown。
- SEO/结构：hreflang 22 条（en, ko, ja, fr, de, es-es, es, pt, fi, da, nl, nb, sv, zh, zh-tw, en-gb, id, vi, th, he, ar, it）· canonical 1 条 · `jsonLdTypes`=[] · internalLinkCount=88 · hashOnlyLinks=0 · URL 形状 /:slug×48、/:slug/:slug×25、4 段×4；dom-outline 第 49 行的「class 命名频次（前 45）」正文为空，频次表证据里看不到。

## 8. 可移植清单
- 文字三档（可直接抄）：`rgba(0, 0, 0, 0.95)` 最重 / `rgba(0, 0, 0, 0.898)` 正文 / `rgba(0, 0, 0, 0.75)` 次级；更弱 0.59、0.54。
- 字阶与行高：16/24 · 14/20 · 40/60 · 72/87.12 · 96/100；字重 400 / 500 / 700（600 仅 4 处）。
- 微投影：小卡用 A 组 4 层（blur 1.041px→18px，alpha 0.01→0.04，spread 0）；大浮层用 B 组 6 层（blur 3.502px→89px，alpha 0.008→0.04）。
- 形状与容器：圆角 8px / 12px / 9999.01px / 4px；容器 1184px / 1252px / 1380px；间距基准 8px（gap 8px×29 最高频）+ 12 / 16 / 24px。
- 动效三曲线：`cubic-bezier(0.42, 0, 1, 1)` 颜色 0.2s · `cubic-bezier(0.645, 0.045, 0.355, 1)` 阴影 / 位移 0.2s · `cubic-bezier(0.86, 0, 0.07, 1)` 大位移 0.3s。
- 不适用 / 无证据：跟随系统只可见「亮色 + 1 条 prefers-color-scheme」，规则原文与手动三态痕迹证据里看不到，无值可抄；外链图片 images.ctfassets.net×46 与自定义字族 NotionInter×414 / Lyon Text×4 属热链做法，与零依赖目标不兼容。
