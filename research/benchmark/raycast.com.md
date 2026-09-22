# raycast.com — 暗色启动器官网：质感全靠「发丝环 + 多层内外阴影」堆出来，动效统一到一条 cubic-bezier(0.23, 1, 0.32, 1)

抓取：https://raycast.com/（实测地址 https://www.raycast.com/）· 2026-09-22T16:53:41.356Z · 视口 1440×900 / 390×844
证据：research/_raw/raycast.com/{metrics.json,tokens.json,dom-outline.txt}

## 1. 色彩系统（暗色分层：底/面/边各是什么值）
- 底（页底）：bodyBgIsDark=true；采样 rgb(8, 9, 12)×6、rgb(7, 8, 10)×2、rgb(17, 18, 20)×1、rgb(19, 13, 14)×1。
- 面（卡片/浮层，半透明白叠加）：rgba(255, 255, 255, 0.05)×105、rgba(255, 255, 255, 0.1)×27、rgba(255, 255, 255, 0.02)×5、rgba(255, 255, 255, 0.2)×3。
- 面（实色）：rgb(27, 28, 30)×3、rgb(67, 67, 69)×18、rgb(38, 38, 38)×1、rgb(51, 51, 51)×1。
- 边：`rgb(27, 28, 30) 0px 0px 0px 1px` 外环 + `rgb(7, 8, 10) 0px 0px 0px 1px inset` 内环（54 次）——边不是 border，是 box-shadow 环。
- 文字：rgb(255, 255, 255)×1844；次级 rgb(106, 107, 108)×174、rgb(156, 156, 157)×135；半透明白 0.6/0.4/0.8/0.3/0.9/0.7/0.5 = 100/67/17/11/5/3/1。
- 语义色：背景 rgb(86, 194, 255)、rgb(89, 212, 153)、rgb(255, 197, 49) 各 1；错误态 rgb(255, 99, 99) 文字 1 + 背景 2，配深红底 rgb(69, 35, 36)×2；链接蓝 rgb(140, 214, 255) 文字 1。

## 2. 字阶与行高
- 正文三档：16px×1279、13px×344、14px×242（移动端 16px×933 / 14px×348 / 13px×40）。
- 标题档：23.75px×225、32px×221、24px×140、18px×39、20px×18；极端 56px×1、64px×1。
- 小字档：12px×34、11px×9、10px×8、11.9px×6、15px×3、22px×2。
- 行高与字号恒为 1.15 倍：16→18.4px(×1114)、23.75→27.3125px(×225)、32→36.8px(×220)、24→27.6px(×107)。
- 例外档：16px 行高 16px(×114)、16.1px(×27)、22.4px(×67，即 14px×1.6)、25.6px(×28)。
- 字重：400×1489、500×851、600×185、700×41、300×6；字体族 Inter×1904、SF Pro Text×522、Segoe UI Variable×79、SF Pro×37、GeistMono×29、JetBrains Mono×1。

## 3. 间距 / 圆角 / 阴影（阴影逐个列出，说明环与投影的分工）
- 环型：`rgb(27, 28, 30) 0px 0px 0px 1px, rgb(7, 8, 10) 0px 0px 0px 1px inset`（54，外环 + 内环）
- 双向 1px 环（17）：`rgba(255, 255, 255, 0.05) 0px 1px 0px 0px inset, rgba(255, 255, 255, 0.25) 0px 0px 0px 1px, rgba(0, 0, 0, 0.2) 0px -1px 0px 0px inset`；单向内高光：`rgba(255, 255, 255, 0.1) 0px 1px 0px 0px inset`（6）、`rgba(255, 255, 255, 0.15) 0px 1px 1px 0px inset`（3）
- 发丝环 + 多层内阴影主面（159，最典型）：`rgba(0, 0, 0, 0.4) 0px 1.5px 0.5px 2.5px, rgb(0, 0, 0) 0px 0px 0.5px 1px, rgba(0, 0, 0, 0.25) 0px 2px 1px 1px inset, rgba(255, 255, 255, 0.2) 0px 1px 1px 1px inset, rgba(0, 0, 0, 0) 0px 0px 0px 0px inset`
- 焦点/选中（5）：`rgba(0, 0, 0, 0.5) 0px 0px 0px 2px, rgba(255, 255, 255, 0.19) 0px 0px 14px 0px, rgba(0, 0, 0, 0.2) 0px -1px 0.4px 0px inset, rgb(255, 255, 255) 0px 1px 0.4px 0px inset`；浮层（4）：`rgba(0, 0, 0, 0.4) 0px 4px 40px 8px, rgba(0, 0, 0, 0.8) 0px 0px 0px 0.5px, rgba(255, 255, 255, 0.3) 0px 0.5px 0px 0px inset`
- 纯投影/光晕：`rgba(0, 0, 0, 0.28) 0px 1.189px 2.377px 0px`（17）、`rgba(0, 0, 0, 0.03) 0px 7px 3px 0px, rgba(0, 0, 0, 0.25) 0px 4px 4px 0px`（6）、`rgba(0, 0, 0, 0.2) 0px 12px 24px 6px`（2）、`rgba(215, 201, 175, 0.05) 0px 0px 20px 5px, rgba(215, 201, 175, 0.05) 0px 0px 16px -7px`（18）、`rgba(255, 255, 255, 0.1) 0px 1px 0px 0px inset, rgba(0, 0, 0, 0.4) 0px 30px 50px 0px, rgba(3, 15, 129, 0.09) 0px 4px 24px 0px, rgba(255, 255, 255, 0.06) 0px 0px 0px 1px inset`（3）
- 分工：环=偏移 0 / 0px blur / 1px–2px spread 或 `1px inset`（负责描边与内壁）；投影=带 y 偏移 + blur（1.5px/0.5px/2.5px、4px/40px/8px、12px/24px/6px，负责层级）；内阴影一黑一白（`rgba(0, 0, 0, 0.25) 0px 2px 1px 1px inset` 下压 + `rgba(255, 255, 255, 0.2) 0px 1px 1px 1px inset` 上提）负责出厚度。
- 间距 8px×148、10px×78、12px×39、24px×25、4px 24px×24、16px×18、32px×9；内边距 14.5px 14.5px×159、8px 8px×48、24px 24px×40、12px 12px×17；圆角 11px×159、8px×108、100%×101、6px×64、12px×53、20px×38、4px×32、16px×28、99999px×24。

## 4. 动效（逐条抄出属性 + 时长 + 缓动曲线）
- 主交互过渡（159 次，属性与曲线一一对应）：`opacity, box-shadow, transform, color, --key-bg-start-color, --key-bg-end-color 0.4s, 0.2s, 0.2s, 0.2s, 0.4s, 0.4s cubic-bezier(0.23, 1, 0.32, 1), cubic-bezier(0.23, 1, 0.32, 1), cubic-bezier(0.23, 1, 0.32, 1), cubic-bezier(0.23, 1, 0.32, 1), cubic-bezier(0.23, 1, 0.32, 1), cubic-bezier(0.23, 1, 0.32, 1)`
- 同曲线第二处（26）：`fill 0.4s cubic-bezier(0.23, 1, 0.32, 1)` —— 全站唯一自定义缓动值就是 cubic-bezier(0.23, 1, 0.32, 1)，0.2s 给 box-shadow/transform/color，0.4s 给 opacity/fill/自定义属性。
- `color 0.3s ease`（88）、`all 0.3s ease`（45）、`all 0.3s ease-in-out`（39）、`all 0.2s ease-in-out`（31）
- `box-shadow 0.2s ease`（24）、`transform 0.3s ease`（21）、`filter 0.3s ease`（18）、`opacity 0.2s ease`（18）
- `all 0s ease`（23）、`all 0.2s ease`（6）、`background-color 0.15s ease`（6）
- `background-image, background-color, box-shadow, transform 0.2s, 0.2s, 0.2s, 0.1s ease, ease, ease-in-out, ease-in-out`（5）；时长全集 0s / 0.1s / 0.15s / 0.2s / 0.3s / 0.4s。

## 5. 暗色策略（bodyBgIsDark / prefers-color-scheme 规则数 / theme-color）
- bodyBgIsDark: true（桌面与移动同一套，无切换）。
- prefersColorSchemeRules: 0 —— 没有任何 prefers-color-scheme 媒体查询，暗色是硬编码。
- theme-color: null；meta colorScheme 也 null；viewport 仅 `width=device-width, initial-scale=1`。
- 暗底靠实色近黑：rgb(8, 9, 12)×6 + rgb(7, 8, 10)×2 + rgb(17, 18, 20)×1；面靠 rgba(255, 255, 255, 0.02–0.1) 叠加。
- 固定层 fixedElements 1、stickyElements 0；滚动高度 15983px / 17.8 屏（移动 15646px / 18.5 屏）。
- 证据里看不到 它是否用 CSS 变量做主题令牌（tokens.json 只按 computed value 频次统计，无变量名）。

## 6. 对比度实测（注意 skippedForComplexBackground 有多少）
- sampled 335，其中 skippedForComplexBackground 219（占 65.4%），实际可算的只有 116 条。
- median 20.04；min 2.03；p10 2.03；belowRequirement 92（即 116 条里的绝大多数）。
- worst 8 条全是同一选择器 span.index-module__NFhuXW__username，ratio 2.03，required 4.5，fontSize 16（@MKBHD、@koenbok、@avstorm、@adamwathan、@wesbos、@ridd_design、@mxstbr、@holman）。
- 数值口径：metrics.json 自述「对比度为纯色背景近似值，complex background 的样本被计入 skippedForComplexBackground」——219 条没有实测值。
- 结论只能说到「大面积白字 + 近黑底（rgb(8, 9, 12)）→ 中位数 20.04」这一层；被跳过样本的真实合成值证据里看不到。

## 7. 骨架与命名（landmarks 的情况要写清）
- landmarks 几乎全空：header 0、nav 0、main 0、section 0、article 0、aside 0、footer 0、dialog 0；只有 form 1。
- 标题层级齐全：h1×1（540x141）、h2×9、h3×4；dom-outline 仅展开 6 个节点（h2 432x24、h2 486x24、h3 267x29），其余以「… 18 children (div)」占位。
- 命名 = CSS Modules 哈希：形如 `Xxx-module__HASH__name`；dom-outline 频次最高 ExtensionHighlight-module__3Yq4tG__category×4、SectionTitle-module__U5mb2W__container×2、CommunitySection-module__MQiDUG__socialCard×2。
- 交互元素计数：form 1、buttons 26、tabs 7、searchInputs 0、selects 0、relNext 0、hashOnlyLinks 4、internalLinkCount 96。
- 重复组件（桌面→移动）：`div.YoutubeCarousel-module__Jy8ojW__embla__slide`×18（230×185 两档同宽高）、`div.ExtensionHighlight-module__3Yq4tG__extensionCardWrapper`×17（360×536 → 300×446）、`button.styles-module__V1XIQW__item`×7（255×32）；gridTemplates 只给轨道数（1 tracks×304、2 tracks×39、3 tracks×3、5 tracks×2、6 tracks×1），行列数证据里看不到；容器最大宽 1204px×7、1440px×5、1064px×2、1252px×2。
- 首屏覆盖：上述重复组件 fullyVisibleFirstScreen / touchedFirstScreen 全为 0 —— 卡片网格都在首屏之下；移动端首屏是 `a.NavLink-module__qZd0pW__navLink`×9（324×41，9/9 可见）。

## 8. 可移植清单：值得学 / 不适用
- 值得学｜环与投影分工：`rgb(27, 28, 30) 0px 0px 0px 1px` 外环 + `0px 0px 0px 1px inset` 内环（54 次），比 1px border 更容易与多阴影叠加。
- 值得学｜发丝环 + 多层内阴影（159 次）：外层 `0px 1.5px 0.5px 2.5px`，内层一黑一白各 1px 负责上下压边，是「不用图也出厚度」的最小配方。
- 值得学｜一条缓动走全站：cubic-bezier(0.23, 1, 0.32, 1) 复用到 6 个属性、只分 0.2s / 0.4s 两档；字阶 16/14/13px + 行高 = 1.15×字号（18.4 / 27.3125 / 36.8）。
- 不适用｜暗色前提：prefersColorSchemeRules=0、底靠 rgb(8, 9, 12) 硬编码，面靠 rgba(255, 255, 255, 0.05)×105 —— 纯光色主题下这套半透明白面不可见。
- 不适用｜内阴影方向依赖暗色光学：`rgba(255, 255, 255, 0.2) … inset` 提亮上缘在浅底会糊掉，浅底需要反向。
- 不适用｜重资产与多字体：117 图 / 63 懒加载 / 168 请求 / Inter + SF Pro Text + GeistMono 等 6 族（1904/522/79/37/29/1 次），零构建单文件、不热链 Web 字体的静态站不具备也不该背这套条件。
