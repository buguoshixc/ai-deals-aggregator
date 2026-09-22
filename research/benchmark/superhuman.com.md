# superhuman.com — 暖白底 + 品牌紫的单主题营销站，样本里对比度最干净（抽样 50 条 / 0 条不合格）

抓取：https://www.superhuman.com/ · 2026-09-22T16:55:01.875Z · 视口 1440×900 / 390×844
证据：research/_raw/superhuman.com/{metrics.json,tokens.json,dom-outline.txt}
截图：research/_raw/superhuman.com/shots/{desktop-first,desktop-full,mobile-first}.png —— 本报告未读图、不做画面描述，全部数值来自上述三个证据文件。

## 1. 色彩系统（暖白底 rgb(247,245,242) + 品牌紫 rgb(113,76,182)）
- textColors 8 种 / 486 次（计数总和即 486）：主文字 rgb(41, 40, 39) 262 次（54%），是唯一一档「正文深色」。
- 其余文字色：rgb(255, 255, 255) 97、color(srgb 1 1 1 / 0.8) 57、color(srgb 0.0784314 0.0784314 0.0745098 / 0.65) 32、rgb(113, 76, 182) 16、color(srgb 1 1 1 / 0.05) 11、rgb(212, 199, 255) 10、color(srgb 1 1 1 / 0.65) 1。
- backgrounds 12 种 / 38 次：暖白底 rgb(247, 245, 242) 9、次暖白 rgb(242, 240, 235) 3、暖灰 rgb(222, 219, 213) 3、透明 rgba(255, 255, 255, 0) 5、纯白 rgb(255, 255, 255) 1。
- 品牌紫 rgb(113, 76, 182) 双用：文字 16 次 + 背景 4 次；配对浅紫 rgb(232, 224, 255) 背景 3 次、rgb(212, 199, 255) 背景 2 次 / 文字 10 次 / 内环 1 次。
- 局部深色底 3 种（非主题）：rgb(40, 22, 71) 3、rgb(66, 29, 36) 3、rgb(12, 66, 67) 1 —— 深底上的前景是 rgb(212, 199, 255) 10 次与白色系。
- 透明度写法：文字一律 color(srgb … / α)，α 只取 1 / 0.8 / 0.65 / 0.05；背景侧另有 color(srgb 0.988235 0.980392 0.968627 / 0.2) 1 次。

## 2. 字阶与行高（分数字重 460/540 单独点出：需要可变字体）
- fontSizes 9 种 / 486 次：16px 414（85%）、14px 26、25px 16、18px 13、49px 9、18.72px 4、39px 2、20px 1、28px 1 —— 真正的档位是 16 / 25 / 39–49 三级。
- lineHeights 11 种：19.2px 274（=16×1.2）、24px 110（=16×1.5）、16px 30、30px 17（=25×1.2）、16.8px 16（=14×1.2）、27px 13（=18×1.5）、18px 10、58.8px 9（=49×1.2）、28.08px 4（=18.72×1.5）、46.8px 2（=39×1.2）、32px 1。
- 两套行高并存：1.2 系（19.2 / 30 / 58.8 / 46.8px）与 1.5 系（24 / 27 / 28.08px）；16px 同时吃 19.2px 与 24px 两种行高，前者 274 次是绝对主力。
- fontWeights 4 种：460（402 次 / 83%）、600（40）、540（35）、700（9）—— 只有 2 个整百档，主字重 460 不是整百。
- fontFamilies 1 种：`Super Sans VF` 486 次（= 全部文字）。分数字重 460/540 要求字体的可变轴（wght 取任意值）才成立；**零 Web 字体 + 系统字体栈只有离散整数档位，460/540 会被取整到最近可用档位**，实际渲染与设计稿对不上，本项目不能照抄。
- 移动端（390 宽）fontSizes 7 种：16px 372、14px 25、20px 16、18px 15、32px 9、18.72px 4、28px 2 —— 49px 收到 32px，39px 档消失。

## 3. 间距 / 圆角 / 阴影（环 + 微投影的组合，逐个列出）
- gaps 12 种 / 126 次：4px 57（45%）、16px 17、32px 16、12px 9、24px 9、8px 7、0px 6、128px 1、`24px normal` 1、40px 1、`40px 0px` 1、5px 1 —— 4px 基准。
- paddings 11 种：`6px 6px` 13、`32px 32px` 12、`16px 16px` 9、`96px 96px` 5、`0px 32px` 3、`0px 80px` 3、`0px 96px` 2、`96px 32px` 2、`40px 0px` 1、`64px 0px` 1、`64px 48px` 1。
- radii 3 种 / 486 次：0px 457（94%）、12px 21、8px 8 —— 非零圆角只有 12px / 8px 两档。
- shadows 第 1 条（3 次，环 + 微投影，原文）：`color(srgb 0.278431 0.270588 0.262745 / 0.04) 0px 0px 0px 1px, color(srgb 0.278431 0.270588 0.262745 / 0.06) 0px 4px 8px -2px, color(srgb 0.278431 0.270588 0.262745 / 0.04) 0px 2px 4px 0px, color(srgb 0.278431 0.270588 0.262745 / 0.04) 0px 1px 2px 0px, color(srgb 0.870588 0.858824 0.835294 / 0.2) 0px 0px 0px 1px`
- 拆解：前 4 层同色 srgb 0.278431 / 0.270588 / 0.262745（×255 = rgb(71,69,67)）× 0.04 / 0.06 / 0.04 / 0.04；第 5 层是暖灰 srgb 0.870588 / 0.858824 / 0.835294（×255 = rgb(222,219,213)，同值在 backgrounds 出现 3 次）× 0.2 的 1px 环；最重投影只有 `0px 4px 8px -2px`。
- 另两条（各 1 次）：`color(srgb 0.45098 0.443137 0.427451 / 0.2) 0px 0px 0px 1px inset`、`rgb(212, 199, 255) 0px 0px 0px 1px inset` —— 3 条阴影全部含 1px 环；容器 900px 69 / 768px 2 / 1280px 1，栅格 1 track 6 / 4 tracks 5 / 2 tracks 2 / 3 tracks 1 / 6 tracks 1。

## 4. 动效（逐条抄出属性 + 时长 + 缓动曲线）
- `color 0.2s ease` 36 次（占 65 条过渡的 55%，唯一主力）。
- `background-color 0.2s ease-in-out` 11 次。
- `all 0s ease` 9 次。
- `rotate 0.3s ease` 6 次。
- `box-shadow 0.2s ease-in-out` 2 次。
- `translate 0.3s ease-in-out` 1 次 —— 全站只有 2 档时长（0.2s / 0.3s）+ 1 条 0s，曲线只有 `ease` / `ease-in-out` 两条，无 cubic-bezier 自定义曲线；prefers-reduced-motion 规则数：证据里看不到。

## 5. 暗色策略（bodyBgIsDark=false、规则 0 条）
- behavior.bodyBgIsDark = false；prefersColorSchemeRules = 0（暗色规则 0 条）；meta.colorScheme = null；meta.themeColor = null。
- 页面底是暖白 rgb(247, 245, 242) 9 次，没有第二套暗色底 —— 深色只是局部卡片：rgb(40, 22, 71) 3、rgb(66, 29, 36) 3、rgb(12, 66, 67) 1。
- 深底/紫底上的前景：rgb(255, 255, 255) 97、color(srgb 1 1 1 / 0.8) 57、rgb(212, 199, 255) 10、color(srgb 1 1 1 / 0.05) 11。
- 提亮靠极低 alpha 白：文字侧 color(srgb 1 1 1 / 0.05) 11 次；背景侧 color(srgb 0.988235 0.980392 0.968627 / 0.2) 1 次。
- 明暗切换开关：证据里看不到（prefers-color-scheme 规则 0 条、meta 两项为 null、dialog 1 个但渲染 0×0）。
- 可移植的暗色数值只有 3 个局部深底色 + 浅紫前景；暗色分层（几档面、描边、状态）数值：证据里看不到。

## 6. 对比度实测（为什么能做到 0 条不合格：字号、灰阶、样本量 50 都要看）
- sampled 50、skippedForComplexBackground 6、min 4.85、p10 6.16、median 12.92、belowRequirement 0 —— 0 条低于要求。
- worst 1（全站最低）：`span.text_text__RO8_0`「View all customer stories」16px，ratio 4.85，required 4.5（余量 +0.35）。
- worst 2–4：`span.text_text__RO8_0`「Learn more」16px，ratio 5.66 / 5.66 / 5.66，required 4.5。
- worst 5–8：`span.text_text__RO8_0`「Try Go」「Get Mail」「Try Docs」16px ratio 6.16 required 4.5；`h3.text_text__RO8_0` 25px ratio 6.16 required 3（大字号门槛）—— worst 清单 8 条全部是 16px / 25px，没有小字落榜。
- 灰阶：正文只有一档深色 rgb(41, 40, 39) 262 次（54%），次要文字用同一深色降 alpha（color(srgb 0.0784314 0.0784314 0.0745098 / 0.65)，×255 = rgb(20,20,19) / 0.65，32 次）—— 不是另配一个浅灰，所以最差样本只掉到 4.85；可执行结论：**次要文字 = 同色降 alpha，不要新增浅灰色相**。
- 字号与样本：16px 414 次（85%）扛住 required 4.5，14px 仅 26 次；p10 6.16 / median 12.92 说明过半样本是深底白字（rgb(255,255,255) 97 + color(srgb 1 1 1 / 0.8) 57）；样本量 50（另跳过 6 条复杂背景）下 0 条不合格。

## 7. 骨架与命名（header=2/nav=3/main=1/section=13/aside=6/dialog=1）
- landmarks：header 2、nav 3、main 1、section 13、aside 6、dialog 1、footer 2；article 0、form 0。
- headings：h1 = 0、h2 = 8、h3 = 22（共 30 条，含多条空文本 h3）；jsonLdTypes 空数组；internalLinkCount 69、hashOnlyLinks 0、detailUrlPatterns 12 种（27 / 17 / 4 / 4 / 4 / 3 / 2 / 1 / 1 / 1 / 1 / 1）。
- 尺寸兜底（dom-outline 渲染尺寸）：header 1440×67、nav 532×42、banner 1440×56、main 1440×6433、footer 1440×819。
- section 渲染出 12 条（landmark 13 个），高度 251 / 292 / 338 / 359 / 361 / 367 / 466 / 467 / 510 / 553 / 570 / 1249；同签名 `section.section_section___xslj` 中位 553；aside 1280×329 与 624×260。
- 移动端：pageHeight 10490px / 12.4 屏（desktop 7375px / 8.2 屏）；li 32 个宽 358 高恒 24；section 6 条高 409–1598（中位 683）；buttons 24、tabs 8、images 53（lazy 26）、stickyElements 1、fixedElements 0。
- 命名：CSS Modules `block_block__hash` 打底（text_text__RO8_0 116、link_link__5Knfc 86、nav-link_navLink__XVBOR 77）；叠语义档位类（type-heading-xsmall 24、type-text-small 23、type-text-xsmall 21、color-text-sub 44、color-text-base 30、elevation-xsmall 15、card_card___40SI / card_card__LQmTt 各 18）与工具类（display-column 70、display-row 19、gap-4x 18 / gap-6x 11 / gap-3x 7，对应实测 gap 16px 17 / 24px 9 / 12px 9，疑似 1x = 4px）。

## 8. 可移植清单
- **值得学** — 文字色三段式可直接落成 4 个变量：`rgb(41, 40, 39)` 262、`color(srgb 0.0784314 0.0784314 0.0745098 / 0.65)` 32（同色降 alpha）、`rgb(255, 255, 255)` 97、`rgb(212, 199, 255)` 10。
- **值得学** — 环 + 微投影 5 层阴影整条原文可抄（第 5 层 `rgb(222,219,213)` × 0.2 的 1px 环，同值在 backgrounds 出现 3 次）；非零圆角只用 12px 21 / 8px 8，全部纯 CSS 字符串。
- **值得学** — 间距 4px 基准（4 / 8 / 12 / 16 / 24 / 32px，4px 占 gap 45%）+ 内边距档 `6px 6px` 13 / `32px 32px` 12 / `16px 16px` 9 / `96px 96px` 5。
- **值得学** — 动效收敛到 2 档时长（`0.2s` / `0.3s`）× 2 条曲线（`ease` / `ease-in-out`），6 条 transitions 全是纯 CSS 字符串。
- **不适用** — 分数字重 460（402 次）/ 540（35 次）需要可变字体（`Super Sans VF` 486 次 = 全部文字）；零 Web 字体 + 系统字体栈只有整数档位，460/540 会被取整，实际渲染对不上。
- **不适用** — 暖白单主题 + 8.2 屏滚动叙事（bodyBgIsDark=false、暗色规则 0 条、无切换开关、pageHeight 7375 / 移动 10490、53 图含 26 懒加载、900px 单列容器 69 次），与本项目要的暗色分层、192px 定高卡片列表不同构。
