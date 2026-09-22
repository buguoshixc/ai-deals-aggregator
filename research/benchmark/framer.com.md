# framer.com — AI 设计代理的营销站，纯黑底 + 12px 密集字阶的「产品演示流」落地页

抓取：https://www.framer.com/ · 2026-09-22T16:54:15.202Z · 视口 1440×900 / 390×844
证据：research/_raw/framer.com/{metrics.json,tokens.json,dom-outline.txt}
（下文括号内为证据坐标；查不到的项明确写「证据里看不到」）

## 1. 色彩系统（纯黑体系与强调色）

- 层色纯黑体系：背景 `rgb(0,0,0)` 45 次、`rgb(36,36,36)` 33 次、`rgb(30,30,30)` 16 次、`rgb(17,17,17)` 15 次（tokens.json:81-108）。
- 文字主色 `rgb(0,0,0)` 1799 次为绝对多数；次高 `rgb(0,0,238)` 471 次（纯蓝链接色，非强调色）（tokens.json:7-12）。
- 浅色文字：`rgb(255,255,255)` 164 次、`rgb(153,153,153)` 159 次、`rgba(255,255,255,0.6)` 95 次（tokens.json:15-25）。
- 真强调色只有三支且极低频：`rgb(0,187,136)` 文字 10 次 / 背景 `rgba(0,187,136,0.1)` 10 次；`rgb(0,153,255)` 文字 7 次 / 背景 7 次；`rgb(152,105,253)` 2 次（tokens.json:31,40,72,109,158）。
- 半透明白作描边/叠加：`rgba(255,255,255,0.1)` 背景 21 次 + 阴影 `rgba(255,255,255,0.1) 0 0 0 1px` 2 次（tokens.json:90,426）。
- 可抄的三层黑阶梯：`#000000` 页底 → `#242424` 卡片 → `#1e1e1e`/`#111111` 次级块。

## 2. 字阶与行高（12px 占多少、说明什么）

- 12px 2447 次，占全部字号样本（2792 次）的 **87.6%**；12+14+13px 合计 2666 次 = 95.5%（metrics.json:459-520）。
- 大字号总量极小：54px 5 次、44px 5 次、20px 5 次、22px 1 次——即 H1/H2 只有个位数元素（metrics.json:489-509）。
- 权重集中：400 → 2470 次，500 → 248 次，600 → 28 次，700 → 10 次（tokens.json:306-323）。
- 行高落到具体值：19.6px(105)、14.4px(86)、20.8px(76)、16px(37)、15.6px(32)、12px(31)；对 12px 即 1.2 / 1.3 / 1.633 倍（tokens.json:240-305）。
- 说明什么：它的「大标题+密正文」是极少数元素撑起视觉，正文层几乎全部压在 12px，靠留白与图而不是字号建立层级。
- 字体族：sans-serif 2263 次（回退占位，真实族名未落在此字段）、Inter 274、Inter Variable 170、Input Mono Regular 28（tokens.json:324-357）。

## 3. 间距 / 圆角 / 阴影（圆角与容器宽的频次）

- 圆角频次：0px 2289、**8px 232**、15px 71、6px 34、20px 27、4px 24、100px(胶囊) 15、18px 13、10px 11（tokens.json:358-415）。
- 容器宽频次：**1200px 15 次**、1240px 2 次、660px 1 次；页脚实测 1240×611（tokens.json:604-617、dom-outline.txt:48）。
- 间距：gap 10px 236、5px 160、0px 150、15px 67、6px 55、8px 44（tokens.json:466-531）。
- 内边距：`10px 10px` 35、`20px 20px` 11、`25px 25px` 11、`40px 40px` 8、`120px 120px` 3（tokens.json:532-597）。
- 阴影只用两支高频：`rgba(0,0,0,0.1) 0 1px 2px 0` 3 次、`rgba(0,0,0,0.2) 0 2px 6px 0` 3 次（tokens.json:416-465）。
- 其余 9 条阴影均为 count=1 的动画插值产物（如 `0 12.0003px 19.2005px`、`0 39.9997px 63.9995px`），不可当设计令牌抄。

## 4. 动效（只抓到什么就写什么，写清证据边界）

- `transitions` 全量只有一条：`all 0s ease`，count = 1（tokens.json:598-603；metrics.json:879-884）。
- 由该字段可判定：**它不在 CSS transition 上做动效**；这是「抓到的 transition 声明里没有可用时长」，不等于页面没有动效。
- 其余动效证据：Web Animations API、`@keyframes`、GSAP/滚动监听、transform 变化均**证据里看不到**。
- 间接旁证：阴影出现 9 条 count=1 的连续插值取值、`li.ticker-item` 9 个同签名元素、`p.text-shimmer-Rllmd8qtkn6l5dp` 类名（metrics.json:697-746, 258-271, 1062）。
- 行为计数：sticky 1 个、fixed 2 个、prefersColorSchemeRules 0（tokens.json:638-641）。
- 本站按 CSS transition 做动效，从这份证据里抄不到任何动效参数，只能抄静态数值。

## 5. 暗色策略（bodyBgIsDark / 规则数 / theme-color）

- `bodyBgIsDark: true`（tokens.json:641；metrics.json:922）。
- `prefersColorSchemeRules: 0` —— 零条浅色/暗色媒体查询规则（tokens.json:640）。
- 三处 meta 全为空：`colorScheme: null`、`themeColor: null`、viewport 仅 `width=device-width`（metrics.json:51-53）。
- 即：暗色是**单一硬编码主题**，无跟随系统的双主题分支；证据里看不到任何亮色令牌集合。
- 与纯光色主题的对照结论：其暗色令牌（`#000000`/`#242424`/`rgba(255,255,255,0.1)`）无法直接搬进亮色站。

## 6. 对比度实测（worst 里 1:1 的样本基于 selector 判断是什么）

- 样本 400，复杂背景跳过 2，min 1、p10 5.79、**median 7.37**、低于 4.5 要求 25 个（tokens.json:650-656）。
- 唯一的 1:1 样本 selector 为 `p.text-shimmer-Rllmd8qtkn6l5dp`，文案 "Thinking..."，12px，required 4.5（tokens.json:658-664）。
- 判断依据只有类名与文案两处：类名含 `text-shimmer` 且文本是加载占位词，故判断为**文字渐变（shimmer）动画被采样到低对比瞬间**的加载态，不是静态正文配色。
- 其余 7 个 worst：`p.framer-text` 的 12px 文案 2.7/3/3、10px 数字 3.29、13px 标签 3.29，required 均 4.5（tokens.json:665-714）。
- 可抄的结论：中位 7.37 与 p10 5.79 是它的真实静态水平；它的低对比样本几乎全部集中在 10–13px 小字与加载动画上。

## 7. 骨架与命名

- 语义骨架：nav 1、main 1、section 6、footer 1、header 7、form 1、dialog 0、article 0、aside 0（metrics.json:69-79）。
- 尺寸骨架：nav 1440×64、footer 1240×611；section 宽 1440、其内 header 宽 1200，即 1200 内容居中于 1440 视口（dom-outline.txt:6,48,9-13,19-21）。
- 主列表同签名 `li.ticker-item`：桌面 9 个 360×460 起、移动 8 个 250×319，首屏可见 0 个（metrics.json:258-271,1127-1136）。
- 页面体量：桌面 10741px ≈ 11.9 屏、移动 10817px ≈ 12.8 屏；文本长度 6052 / 2645 字符（metrics.json:46-47,1125-1126,1052,1191）。
- class 频次：`framer-text` 425、`framer-styles-preset-rhbxb3` 87、`framer-styles-preset-vn6u90` 12、`ticker-item` 21、`ssr-variant` 28（dom-outline.txt:59-84）。
- 命名模式：`framer-7sRmL` 组件类 + `framer-v-1lhjg5m` 变体类 + `framer-styles-preset-rhbxb3` 排版预设类；哈希不可读，可抄「预设类承载排版」这层，不可抄类名（dom-outline.txt:60-101）。

## 8. 可移植清单：**值得学** / **不适用**

- 值得学：8px 主圆角（232 次）+ 15px 大容器圆角（71 次）双档；100px 做胶囊（15 次）。
- 值得学：1200px 内容容器（15 次）为主、1240px 为宽的变体（2 次），页脚取宽版 1240。
- 值得学：10px 为主间距（gap 236 次、padding 35 次）、5px 紧排（160 次）的两档节奏。
- 值得学：三层黑阶梯 `#000000`/`#242424`/`#1e1e1e` 与 `rgba(255,255,255,0.1)` 细描边。
- 不适用：`all 0s ease` 与零条 prefers-color-scheme——动效参数抄不到、暗色硬编码、colorScheme 与 themeColor 均为 null。
- 不适用：12px 主导字阶（87.6%）与 `li.ticker-item` 360×460 起的超高卡片（11.9 屏长页）；本站为 13.5px 基准 + 192px 定高卡片。
- 证据边界：以上全部为静态令牌与骨架数值；动效参数、交互动效、JS 行为在证据里看不到。
