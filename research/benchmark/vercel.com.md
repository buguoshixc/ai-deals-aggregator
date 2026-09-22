# vercel.com — Agentic Infrastructure：为应用与 agent 提供自主化基础设施的云平台

抓取：https://vercel.com/ · 2026-09-22T17:00:49.431Z · 视口 1440×900 / 390×844

证据：research/_raw/vercel.com/{metrics.json,tokens.json,dom-outline.txt}（截图在 shots/，本报告不引用画面内容，只引用上列文件中的数值）

## 1. 色彩系统

- textColors：rgb(23, 23, 23) 289、rgb(77, 77, 77) 189、rgb(143, 143, 143) 30、lab(80.976 0 -0.0000119209) 12、rgb(255, 255, 255) 8、rgb(41, 122, 58) 3、rgb(0, 114, 245) 1、rgb(102, 102, 102) 1。
- backgrounds：rgb(255, 255, 255) 9、rgb(23, 23, 23) 6、rgb(250, 250, 250) 3、lab(7.78201 -0.0000149012 0) 2、oklab(0.984799 0.0000446141 0.0000197291 / 0.5) 1、rgb(102, 102, 102) 1。
- 正文三档中性灰占绝对多数：#171717 / #4D4D4D / #8F8F8F 合计 508 处文本（289+189+30）。
- 唯一彩色文字是成功绿 rgb(41, 122, 58) 3 次与品牌蓝 rgb(0, 114, 245) 1 次；品牌蓝同时也是焦点环第二层（rgb(0, 114, 245) 0px 0px 0px 4px）。
- 大面积底色是白 rgb(255, 255, 255) 9 与近白 rgb(250, 250, 250) 3，暗底 rgb(23, 23, 23) 6 / lab(7.78201 -0.0000149012 0) 2 为局部块。

## 2. 字阶与行高

- fontSizes（1440 视口）：14px 299、16px 195、12px 14、24px 11、11px 10、56px 5、64px 1。
- fontSizes（390 视口）：14px 279、16px 215、12px 14、11px 10、24px 8、32px 5、20px 3、48px 1（最大标题档从 56/64px 降到 32/48px）。
- lineHeights：20px 233、24px 195、21px 76、16px 13、32px 9、56px 5、26.4px 2、16.5px 1、64px 1。
- 主配对数量吻合：14px(299) 配 20px 行高(233)，16px(195) 配 24px 行高(195)；21px 行高单独出现 76 次。
- fontWeights：400 437、500 79、450 19 —— 无 600/700 粗体档。
- fontFamilies：GeistSans 508、Geist Mono 27。

## 3. 间距 / 圆角 / 阴影

- gaps：6px 87、4px 12、12px 6、4px 20px 4、40px 3、44px 3、8px 3、normal 20px 3、20px 2、3px 2，0px/10px/16px/16px normal/24px/256px 各 1（共 16 种取值）。
- paddings：2px 2px 169、6px 6px 4、20px 20px 3、16px 16px 2、40px 40px 2、1px 1px 1、24px 40px 1、32px 32px 1、8px 8px 1。
- radii：0px 496、3.35544e+07px 25（胶囊）、6px 10、4px 1、100% 1、0px 0px 0px 1px 1、0px 8px 8px 0px 1。
- shadows（每个值前 4 层均为 rgba(0, 0, 0, 0) 0px 0px 0px 0px 透明占位，可见层为后 1–2 层）：rgba(0, 0, 0, 0.08) 0px 0px 0px 1px + rgb(250, 250, 250) 0px 0px 0px 1px（5）、rgb(235, 235, 235) 0px 0px 0px 1px（4）、rgb(235, 235, 235) 0px 0px 0px 1px inset（3）、rgb(255, 255, 255) 0px 0px 0px 2px + rgb(0, 114, 245) 0px 0px 0px 4px（1）。
- containerMaxWidths：1448px 3、1024px 1、1080px 1、673.344px 1、961px 1；gridTemplates：12 tracks 9、1 tracks 3。
- 实测尺寸：外层 1440×5333（页高 5333，滚动 5.9 屏），main 1440×4659，内容列 1392px，footer 1440×846，hero section min-h min(calc(100svh - var(--header-height)), 1100px)；1392px 的页边变量 --geist-page-margin 取值证据里看不到。

## 4. 动效

- color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --tw-gradient-from, --tw-gradient-via, --tw-gradient-to 0.1s cubic-bezier(0.4, 0, 0.2, 1)（79）。
- all 0.15s cubic-bezier(0.4, 0, 0.2, 1)（8）；opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1)（7）；opacity 0.3s cubic-bezier(0, 0, 0.2, 1)（4）。
- background, box-shadow 0.2s cubic-bezier(0.4, 0, 0.2, 1)（3）；height 0.2s cubic-bezier(0, 0, 0.2, 1)（3）；opacity, scale 0.2s cubic-bezier(0.23, 1, 0.32, 1)（2）。
- 首条同属性组（颜色 11 项）0.5s cubic-bezier(0, 0, 0.2, 1)（3）；all 0.2s ease（1）；all 0s ease（1）；opacity 0.2s cubic-bezier(0, 0, 0.2, 1)（1）。
- opacity 0.7s linear（1）；opacity 1.2s linear（1）；opacity 1s ease（1）。
- 合计 14 条 115 次：cubic-bezier(0.4, 0, 0.2, 1) 97 次、cubic-bezier(0, 0, 0.2, 1) 11 次、cubic-bezier(0.23, 1, 0.32, 1) 2 次，另 ease 2、linear 2、all 0s ease 1。

## 5. 暗色策略（本站是唯一显式双主题站，也是我们暗色方案的直接依据）

- meta color-scheme 原文 "dark light"（dark 在前），meta theme-color 原文 "#FAFAFA" —— 样本中唯一显式声明双主题的站。
- 但桌面实测 bodyBgIsDark=false，且页面自身 CSS 的 prefersColorSchemeRules=0：主题切换声明在 <meta>，没有走 prefers-color-scheme 媒体查询。
- 亮暗成对值：背景 rgb(255, 255, 255) 9 ↔ rgb(23, 23, 23) 6；文字 rgb(23, 23, 23) 289 ↔ rgb(255, 255, 255) 8。
- 暗色侧专用值：lab(7.78201 -0.0000149012 0) 2（暗底）、lab(80.976 0 -0.0000119209) 12（暗底上的浅色文字）、oklab(0.984799 0.0000446141 0.0000197291 / 0.5) 1（半透明亮面）。
- 抄法要点（数值同源）：color-scheme 进 <meta>、明暗共用同一套中性灰阶做反转、默认渲染仍是亮色底 #FAFAFA/#FFFFFF。
- stickyElements 1、fixedElements 3；暗色态的其余变量取值在证据里看不到（无 CSS 变量导出文件）。

## 6. 对比度实测

- sampled 171、skippedForComplexBackground 0、min 3.1、p10 8.1、median 8.1、belowRequirement 4。
- worst 前三条：span.sr-only，14px，ratio 3.1，required 4.5（3 条同值）。
- worst 其余：a.fixed "Skip to content"，16px，ratio 4.44，required 4.5；span.text-green-900，12px，ratio 5.33（3 条）；p.status-text，12px，ratio 5.5。
- 口径：全程为纯色背景近似值（metrics.json _note 自述），复杂背景跳过样本 0 个，因此没有未计入的样本。
- 真正有可见文本且低于要求的只有 "Skip to content"（4.44 vs 4.5）；其余 3 条 belowRequirement 落在 sr-only 隐藏文本上。

## 7. 骨架与命名

- landmarks：header 6、nav 3、section 10、main 1、aside 1、footer 1；article 0、form 0、dialog 0。
- headings：h1 一个（"Agentic Infrastructure"）；h2 17 个，其中仅 2 个有文本，15 个 text 为空字符串。
- class 命名风格：Tailwind v4 工具类，含任意值与变量语法，例如 class="flex min-w-0"、"@container flex-1 min-w-0"、"max-w-(--ds-page-width-with-margin) px-(--geist-page-margin) mx-auto"。
- 设计变量 kebab-case + 前缀：--ds-page-width-with-margin、--geist-page-margin、--header-height、--hero-shader-y-offset。
- 面积兜底可见骨架：body 26 children；1440×5333 外层 → main.overflow-x-clip 1440×4659 → 内容列 1392 内叠 section（2363 / 718 / 582 …）。
- dom-outline 的 class 频次表在"前 45"处被截断，仅可见 root / isolate / relative 各 1；其余类名频次证据里看不到。

## 8. 可移植清单

**值得学**

- 中性灰三档正文色 rgb(23, 23, 23) 289 / rgb(77, 77, 77) 189 / rgb(143, 143, 143) 30，配 14px+20px 行高（299/233）与 16px+24px（195/195）。
- 6px gap（87 次）作最小堆叠节奏；1px 描边替代模糊阴影：rgba(0, 0, 0, 0.08) 0px 0px 0px 1px、rgb(235, 235, 235) 0px 0px 0px 1px（inset 同值）。
- 颜色过渡只取最短档 0.1s cubic-bezier(0.4, 0, 0.2, 1)（79 次）；容器 1448px / 12 列栅格 9 处 / 圆角 6px 10 次 / 胶囊 3.35544e+07px 25 次；焦点环 rgb(255, 255, 255) 0px 0px 0px 2px + rgb(0, 114, 245) 0px 0px 0px 4px。

**不适用**

- 托管 Web 字体（GeistSans 508 / Geist Mono 27）、canvas 光效、lab()/oklab() 色彩、@container 查询、Tailwind 任意值语法与 3.35544e+07px 胶囊写法均依赖外部资源或构建链，零依赖单文件站不适用；双主题机制（meta color-scheme="dark light"）不适用，本站纯单光色主题、无 prefers-color-scheme；对标站是 5.9 屏长滚动营销页（页高 5333），密集列表页的卡片定高与截断策略不在此证据范围内。
