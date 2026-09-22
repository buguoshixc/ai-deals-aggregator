# thebrowser.company — 一个单屏门页式首页（H1 指向 Dia 与 Arc 两个产品），抓到的可能是门页

抓取：https://thebrowser.company/ （落地 www.thebrowser.company）· 2026-09-22T16:55:53.813Z · 视口 1440×900 / 390×844
证据：research/_raw/thebrowser.company/{metrics.json,tokens.json,dom-outline.txt}（截图存于 shots/，本报告未据其内容做任何描述）

## 0. 证据边界

- pageHeight = 900 / 844，scrollScreens = 1：整站只渲染 1 屏，没有任何滚动后的第二屏内容被采到。
- textLength = 261（桌面）/ 220（移动）；hydration textBefore = textAfter = 261/220：静态正文仅数百字符，无客户端注水补内容。
- requestCount = 25（script 15 / link 6 / fetch 2 / css 1 / other 1），externalDomains = []：全部同源，跨域第三方与字体/CDN 域名均为 0。
- internalLinkCount = 6，仅两种形状：/:slug（2，样本 /values）、/careers（2）；landmarks 有 header/nav×3/section×1/footer，main = 0。
- 能支持的结论：这是一个「单屏 + 极少链接 + 无图片（images = 0）+ 无表单」的门页/极简页的排版与令牌事实，以及该页自身的对比度与语义骨架。
- 不能支持的结论：不能推断其主产品页、滚动叙事页、组件库、动效体系、图片/媒体策略、暗色完整实现；也不能当作该站整体设计系统的代表。

## 1. 色彩系统

- 文字色仅 2 个：rgba(0,0,0,0.85)（517 次）、rgb(238,238,231)（130 次）。
- 背景色仅 2 个且各出现 1 次：rgb(12,80,255)（纯蓝）、rgba(0,0,0,0.85)。
- themeColor = #EEEEE7；meta.colorScheme = null；bodyBgIsDark = false。
- 同源证据里未出现调色板变量名或 CSS 自定义属性清单：证据里看不到。
- 边界强调色仅 1 次出现，无法判断其是否为主 CTA 色：证据里看不到使用场景。

## 2. 字阶与行高（含极小字号说明了什么）

- 桌面 4 级字号：12px（565）、8px（53）、14px（25）、28px（4）；移动 3 级：12px（552）、14px（23）、28px（4）。
- 行高 3 档：18px（565，配 12px ≈ 1.5）、12px（53，配 8px = 1.5）、33.6px（4，配 28px = 1.2）。
- 字重只有 400 一种（647 次）；粗体对比靠字号与字体族，不靠 weight。
- 字体族 4 个：IvarText（565）、ABC Diatype Mono Trial（53）、ABCDiatypeMono（25）、EB Garamond（4）。
- 8px/12px 行高共 53 处：属于微型等宽标注字号，正文可读性不依赖它；8px 本身低于常规最小正文尺寸。
- H1 渲染为 376×71，落在 section.800:max-w-700 容器内，字号取 28px 级。

## 3. 间距 / 圆角 / 阴影

- radii 只有 0px（647 次）：全站零圆角。
- shadows = []（空数组）：证据内没有任何 box-shadow。
- paddings 仅 3 条且各 1 次：0px 20px、24px 40px、75px 0px。
- gaps 8 条：12px(3)、14px(2)、10px 15px、20px 40px、40px、50px 40px 等，各 1–3 次，未形成稳定刻度。
- 容器宽度 2 个：max-w-700（700px）、720px，各 1 次；gridTemplates = []（无网格）。
- 竖向节奏类名可见：mt-50(4)、gap-y-20(2)、pt-50、mt-50.800:mt-75——实际间距由类名驱动，证据里看不到完整间距标尺。

## 4. 动效（把抓到的 transition 原文抄出来）

- 全部 transition 只有 1 条，原文：`border 0.25s cubic-bezier(0.4, 0, 0.2, 1)`（count = 2）。
- 即：只过渡 border 属性，曲线为标准 ease，时长 0.25s；无 transform / opacity / color 过渡记录。
- stickyElements = 0、fixedElements = 5（fixed 出现 3 次、inset-0 3 次、pointer-events-none 3 次）。
- 关键帧、动画时长表、滚动驱动动效：证据里看不到。
- prefers-reduced-motion 处理：证据里看不到。
- 因此本页可复用的动效结论只有「单一 border 过渡」这一条。

## 5. 暗色策略

- prefersColorSchemeRules = 0：没有任何 @media (prefers-color-scheme) 规则。
- meta.colorScheme = null，但 themeColor = #EEEEE7 存在。
- 存在主题切换控件：button.800:ml-22，文本 THEME，对比度 13.38。
- bodyBgIsDark = false：抓取时默认态为浅色；rgb(238,238,231) 文字 130 次，指向浅底深字。
- 暗色具体配色、切换后的取值、是否持久化：证据里看不到。

## 6. 对比度实测

- 采样 18 个，skippedForComplexBackground = 0，belowRequirement = 0（无一项低于要求）。
- min = 5，p10 = 5，median = 13.38；最低项要求 4.5，实际 5。
- 最低一档全部是 14px 等宽链接：a.mono-link（HOME / COMPANY VALUES / JOBS / NEWSLETTER / @BROWSERCOMPANY），比值均 5。
- 两个产品入口同为 5：a.h-40（MEET DIA BROWSER / GET ARC BROWSER）。
- 最高为按钮 button.800:ml-22（THEME）13.38；13.38 对应深字配 #EEEEE7 类浅底。
- 注意：比值为纯色背景近似值，未覆盖图片或渐变叠加场景（本次 images = 0，恰好无该风险）。

## 7. 骨架与命名

- 语义骨架：nav.fixed.z-9.inset-0（1440×900，含 ul.flex.flex-col.items-center 158×250、ul.flex.flex-col.gap-y-20 250×100）→ header 100×100（nav.relative.z-10.flex）→ section.800:max-w-700.mx-auto.pt-50 376×236（h1.heading.italic.rich-text 376×71 + ul.mt-50.800:mt-75）→ footer.mt-50.flex.flex-col 572×14（nav.order-1.800:order-2.w-full）。
- landmarks 计数：header 1 / nav 3 / section 1 / footer 1，main 0 / article 0 / aside 0 / form 0 / dialog 0。
- 标题仅 1 个（H1，无 H2–H6）："We're building better ways to use the internet with Dia and Arc."
- 命名特征：utility 类 + 断点前缀类（800:block / 800:hidden / 800:flex-row / 800:items-start / 800:max-w-700 / 800:order-2），断点名为 800；语义类 mono-link(10)、heading-link(2)、button-link(2)、mono(2)。
- 尺寸类为裸数值：w-100(5)、h-24(5)、h-100(3)、h-40(2)、gap-14(2)、min-w-250(2)、mt-50(4)、pt-50、top-20/left-20、z-8/z-9/z-10/z-[1000]。
- 结构异常点：nav 用 fixed.inset-0 覆盖整屏（1440×900）且 main = 0，配合 1 屏高度与数百字符正文，是「门页/极简页」而非产品页的直接依据。

## 8. 可移植清单

- 可移植（有数值支撑）：零圆角 radii = 0px（647/647）；零阴影 shadows = []；单一过渡 `border 0.25s cubic-bezier(0.4, 0, 0.2, 1)`；仅 400 字重；min 对比度 5、median 13.38。
- 可移植（结构性）：header/section/footer + 单一 H1 的极简语义骨架；容器 max-w-700 / 720；断点命名 800 的「前缀式」响应式类。
- 不足以支撑：暗色主题实现（prefersColorSchemeRules = 0，仅有 THEME 按钮）、动效体系（仅 1 条 transition）、间距标尺（gaps/paddings 各 1–3 次，未成刻度）、组件库（repeatedComponents = []、gridTemplates = []）。
- 不足以支撑：图片与媒体策略（images = 0、lazyImages = 0）、卡片/列表形态（primaryList = null）、字体加载策略（externalDomains = []，字体来源不可见）。
- 不适用：本页是单屏门页，其 8px 微型等宽字号与 fixed.inset-0 全屏导航属于该页特定做法，不可外推为通用规则。
- 结论：该证据只能支撑「极简令牌」级借鉴（圆角/阴影/过渡/对比度下限），不能支撑一套完整设计系统结论。
