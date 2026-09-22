# linear.app — 深色单主题的「产品开发系统」营销站（title: Linear – The system for product development）

抓取：https://linear.app/ · 2026-09-22T16:23:10.418Z · 视口 1440×900 / 390×844
证据：research/_raw/linear.app/{metrics.json,tokens.json,dom-outline.txt}

## 1. 色彩系统
- textColors 16 种 / 2874 次采样：rgb(247,248,248) #F7F8F8 1702、rgb(138,143,152) #8A8F98 399、rgb(98,102,109) #62666D 280 —— 前 3 名占 83%，属「少量色值高频复用」。
- 下一档：rgb(208,214,224) #D0D6E0 177、rgb(226,228,231) #E2E4E7 120、rgb(255,255,255) 89；反向色 rgb(8,9,10) #08090A 仅 8 次。
- backgrounds 24 种 / 144 次：rgba(255,255,255,0.08) 36、rgb(15,16,17) #0F1011 34（两项占 49%），但 24 种里 10 种只出现 1 次 —— 背景是「多色值低频」。
- 低频装饰/状态色：rgb(247,156,224) #F79CE0 41、rgb(247,191,139) #F7BF8B 22、rgb(255,223,159) #FFDF9F 10、rgb(131,220,220) #83DCDC 9、rgb(143,166,255) #8FA6FF 8、rgb(235,87,87) #EB5757 3、rgb(243,78,82) #F34E52 3。
- 品牌紫蓝 rgb(94,106,210) #5E6AD2 只作背景出现 1 次；rgb(78,167,252) #4EA7FC 作背景 4 次 —— 品牌色几乎不落在正文文字上。

## 2. 字阶与行高
- fontSizes 15 种 / 2878 次：16px 1877（65%）、14px 259、12px 253、13px 213、13.3333px 137、15px 74、10px 23、18px 20 —— 可辨 3 级阶梯 = 16（正文）/ 13–14（次要）/ 12（辅助）。
- 展示级合计仅 13 次：48px 7、64px 5、72px 1；过渡级 24px 4、20px 1、32px 2、11px 2 —— 20–40px 中段几乎为空。
- lineHeights 16 种 / 2686 次：24px 2177（81%），即 16 / 24 = 1.5 是唯一基准行高。
- 同比例次级行高：19.5px 126（13×1.5）、16.8px 47（12×1.4）、14px 171、20px 34、28.8px 20、21px 9、32px 8；大标题 48px 7、64px 5 与字号 1:1。
- fontWeights 5 种：400 2610（91%）、510 244、300 / 500 / 590 各 8 —— 实际只用 400 + 510 两档，510 是非整百的变量字重。
- 移动端（390 宽）fontSizes 仅 8 种：16px 553、13px 156、12px 77、13.3333px 66、15px 23、14px 9、24px 9、38px 8 —— 阶梯同构，展示级压到 38px。

## 3. 间距节奏 / 圆角 / 阴影
- gaps 15 种 / 250 次：8px 88、4px 59、6px 51 —— 三者占 79%；之后断崖：12px 13、2px 10、16px 5、0px 5、10/11/5px 各 4、20px 2、24px 2、32/40/64px 各 1。
- paddings 16 种：控件三件套 4px 4px 19、8px 12px 16、8px 8px 10；区块留白 128px 128px 4、0px 96px 4、36px 0px 4、4px 80px 4、0px 28px 4、24px 24px 3。
- radii 14 种 / 2867 次：0px 2646（92%）；非零仅 221 次 —— 9999px 72、50% 28、8px 27、12px 18、9px 18、4px 17、6px 10、999px 7、16px 6、局部圆角 12px 12px 0px 0px 7。
- shadows 12 种，全部很轻：rgba(0,0,0,0.2) 0px 0px 12px 0px inset 7、rgba(0,0,0,0.2) 0px 0px 0px 1px 6、rgba(0,0,0,0.25) 0px 2px 32px 0px 4；1px 描边式 inset 合计 13 次，5 层堆叠软阴影 2 次。
- containerMaxWidths：1436px 8（= 1440 − 4）、1416px 1、1250px 1、722.25px 1 —— 内容几乎满宽，没有收窄的居中容器。
- gridTemplates：1 track 159、2 tracks 14、12 tracks 1、6 tracks 1、5 tracks 1、4 tracks 1 —— 骨架是单列流 + 少量双列，无 3 列以上卡片栅格。

## 4. 动效
- 主力：`color 0.1s cubic-bezier(0.25, 0.46, 0.45, 0.94)` 187 次；`color 0.1s ease` 34 次；`color, background 0.1s cubic-bezier(0.25, 0.46, 0.45, 0.94)` 7 次。
- 0.16s 家族：`color 0.16s cubic-bezier(0.25, 0.46, 0.45, 0.94)` 20 次；`filter 0.16s cubic-bezier(0.25, 0.46, 0.45, 0.94)` 8 次。
- 多属性逐项写法：`filter, transform 0.16s, 0.16s cubic-bezier(0.25, 0.46, 0.45, 0.94), cubic-bezier(0.25, 0.46, 0.45, 0.94)` 26 次；`background-color, border-left-color 0.1s, 0.1s cubic-bezier(0.25, 0.46, 0.45, 0.94), cubic-bezier(0.25, 0.46, 0.45, 0.94)` 8 次；`background, color 0.16s, 0.16s cubic-bezier(0.25, 0.46, 0.45, 0.94), cubic-bezier(0.25, 0.46, 0.45, 0.94)` 4 次。
- 全属性一条：`border, background-color, color, box-shadow, opacity, filter, transform 0.16s cubic-bezier(0.25, 0.46, 0.45, 0.94)` 4 次。
- 慢曲线：`stroke 0.7s cubic-bezier(0.32, 0.72, 0, 1)` 5 次；`transform 0.7s cubic-bezier(0.32, 0.72, 0, 1)` 5 次。
- 背景与关闭态：`background 0.4s ease-out` 19 次；`filter 0.1s ease` 4 次；`all 0s ease` 60 次。以上共 14 条，全站只有 2 条自定义曲线与 4 档时长（0.1 / 0.16 / 0.4 / 0.7s）；prefers-reduced-motion 规则数证据里看不到。

## 5. 暗色策略
- behavior.bodyBgIsDark = true；prefersColorSchemeRules = 0；meta.colorScheme = null；meta.themeColor = #08090A —— 默认暗色单主题，不跟随系统。
- 背景只有两级：页面底 rgb(8,9,10) #08090A 6 次、面板/卡面 rgb(15,16,17) #0F1011 34 次（每通道差约 7/255）。
- 第三档可忽略：rgb(16,17,18) 1、rgb(18,20,20) 1、rgb(9,10,11) 1；深灰控件面 rgb(46,46,50) #2E2E32 5 次。
- 描边靠高光 inset 而非 border 色：rgba(255,255,255,0.05) 0px 0px 0px 1px inset 4、rgba(255,255,255,0.08) 0px 0px 0px 0.5px inset 4、rgb(35,37,42) #23252A 0px 0px 0px 1px inset 3。
- 是否有明暗切换开关：证据里看不到（无 prefers-color-scheme 规则、meta.colorScheme 为 null、dialog 与 tabs landmark 均为 0）。

## 6. 对比度实测
- 纯色背景近似值：sampled 392、skippedForComplexBackground 95（约 19.5% 样本因复杂背景被跳过，未计入）；min 1 / p10 3.44 / median 6.13 / belowRequirement 66（占已采样 16.8%）。
- median 6.13 高于正文线 4.5，说明主体文字达标；p10 3.44 说明有约一成样本在 3.5 以下。
- worst 1：textarea._8fVXdW_editableTextarea，fontSize 14，ratio 1，required 4.5（空文本域）。
- worst 2：span.sx-1n2onr6，文本 "Working…"，fontSize 12，ratio 3.17，required 4.5，重复 3 条。
- worst 3：span.sc-KOGVz，文本 16 / 23 / 13 / 20，fontSize 12，ratio 3.3，required 4.5，重复 4 条 —— 掉队样本全是 12px 小字与空态文本。

## 7. 骨架与命名
- landmarks：header 8、nav 2、main 1、section 8、footer 1；article / aside / form / dialog 全为 0；jsonLdTypes 为空数组。
- 标题：h1 1、h2 6、h3 8（共 15）；desktop pageHeight 9960px / 11.1 屏，mobile 5876px / 7 屏；internalLinkCount 70、hashOnlyLinks 1。
- dom-outline.txt 只有 7 行（文件头 + 「class 命名频次（前 45）」表头），频次条目为空 —— 命名证据只能取自 metrics 的选择器。
- 命名风格为语义化 camelCase（CSS Modules 哈希前缀 + 语义后缀）：button.Mmx1Wq_navItem（11 个 / 3 个父级 / 208×28）、div.M31rWW_ingredient（10 个 / 304×28）、div.M31rWW_unevenIngredient（10 个 / 304×28）。
- 另外混入 styled-components 生成类 span.sx-1n2onr6、span.sc-KOGVz；原子化 / 工具类命名证据里看不到。
- behavior：buttons 76、images 34（lazyImages 28）、fixedElements 3、stickyElements 0、searchInputs 0、selects 0、tabs 0。

## 8. 可移植清单
- **值得学** — 过渡收敛为 4 档时长 × 2 条曲线（`0.1s` / `0.16s` + `cubic-bezier(0.25, 0.46, 0.45, 0.94)`，`0.7s` + `cubic-bezier(0.32, 0.72, 0, 1)`）：纯 CSS 字符串，单文件零依赖可直接照抄。
- 字号只用 3 档（16 主导 / 13–14 次要 / 12 辅助）配 24px 行高（16×1.5）与 19.5px（13×1.5）：把 13.5px 基准改成 13.5/19.5 即可得到同等比例感。
- 间距只用 4 / 6 / 8px（占 gap 79%），内边距固定 4px 4px、8px 12px、8px 8px；非零圆角只 8 / 9 / 12 / 9999px 几档，全部可写成 3–5 个 CSS 变量。
- 暗色分层＝底 + 一档提亮 + 白色高光 inset 描边（rgb(8,9,10) → rgb(15,16,17)，`rgba(255,255,255,0.05) 0px 0px 0px 1px inset`）：不需 border-color 变量，光色版把面换成白即可复用同一套结构。
- **不适用** — 字体族 Inter Variable 2618 / Berkeley Mono 260 全是 Web 字体，字重还出现 510（244 次）与 590（8 次）等中间值 —— 需要可变字体，系统字体栈无法复现。
- **不适用** — 展示级 48px 7 / 64px 5 / 72px 1（移动 38px 8）配 34 张图、28 张懒加载图的滚动叙事版式，且全站只有默认暗色单主题（prefers-color-scheme 规则 0 条）—— 我们 192px 定高卡片 + 三列网格是聚合列表，要的是光色为底 + 暗色切换的双主题，两处都对不上。
