# stripe.com — 把设计系统（hds-*）与 89 条 hreflang 本地化矩阵装进营销首页的支付基础设施站

抓取：https://stripe.com/ → 落地 https://stripe.com/zh-us（lang=zh-US，title「Stripe | 金融基础设施，托举营收增长」；题面称 ja-JP 与证据不符，ja-JP 只出现在 hreflang 89 条里，href=/jp）· 2026-09-22T16:53:04.192Z · 视口 1440×900 / 390×844
证据：research/_raw/stripe.com/{metrics.json,tokens.json,dom-outline.txt}

## 1. 色彩系统
- textColors 21 种 / 1996 次：rgb(0,0,0) #000000 864、rgb(83,58,253) #533AFD 542、rgb(80,97,122) #50617A 160、rgb(6,27,49) #061B31 123 —— 前 4 名占 84.6%。
- backgrounds 16 种 / 89 次：rgb(255,255,255) 24、rgb(229,237,245) #E5EDF5 16、rgba(255,255,255,0) 14、rgb(248,250,253) #F8FAFD 9、rgb(83,58,253) 7 —— 背景是「多色值低频」，最大一档只 24 次。
- 品牌蓝 #533AFD 同时是文字色（542 次）与背景色（7 次）；同族浅蓝文字 rgb(115,137,255) #7389FF 24、rgb(127,125,252) 3、rgb(131,155,200) 4。
- 面板色阶三档：白 24 / #F8FAFD 9 / #E5EDF5 16；蓝调浅底 rgb(226,228,255) #E2E4FF 3、rgb(232,233,255) #E8E9FF 3、rgb(242,247,254) #F2F7FE 1。
- 暗面只有两档可查：rgb(13,23,56) #0D1738 2 次、rgb(0,0,0) 1 次；辅助灰阶 rgb(100,116,141) #64748D 68、rgb(90,102,119) 5、rgb(60,79,105) 18、rgb(39,57,81) 16。
- 强调/杂色：橙 rgb(255,97,24) #FF6118 文字 14、绿 rgb(0,214,111) #00D66F 背景 1、rgb(129,184,26) 文字 2，另有疑似 UA 默认 rgb(0,0,238) #0000EE 34 与低透明 rgba(16,16,16,0.3) 3、rgba(0,14,255,0.5) 2。

## 2. 字阶与行高
- fontSizes 14 种 / 1996 次：16px 1668（83.6%）、10px 107、14px 65、26px 32、9px 29、22px 20、8px 18、48px 17、12px 11、18px 11、32px 11、11px 5、20px 1、56px 1。
- 展示级只 3 档：48px 17（hero 同文案双 h1，各 1024×221）、32px 11、26px 32；中段 22px 20 / 18px 11；正文 16px 一档吃掉八成。
- 小字异常发达：8/9/10/11px 合计 159 次（10px 独占 107）—— 微标签是它字阶的正式一档，不是例外。
- lineHeights 16 种 / 647 次：16px 214、20px 88、14px 62、0px 56、22.4px 49、11.5px 48、24.2px 20、29.12px 20、10.8px 18、8px 14、8.96px 12、25.2px 11、35.2px 11、12px 10、19.2px 7、48px 7。
- 可算出的配对比例（证据只给值）：24.2=22×1.1、35.2=32×1.1、29.12=26×1.12、25.2=18×1.4、22.4=16×1.4、19.2=12×1.6、11.5=10×1.15、10.8=9×1.2、8.96=8×1.12 —— 标题 1.1、正文 1.4。
- fontWeights 只有 400（1241）与 500（755），合计 1996 = 100%；fontFamilies 只有 sohne-var（1996 次）。移动端只剩 8 档：16px 1697、10px 107、12px 39、20px 38、9px 29、8px 18、22px 11、18px 9（14/26/32/48px 全消失，最大 22px）。

## 3. 间距 / 圆角 / 阴影
- gaps 16 种 / 157 次：8px 47、16px 17、32px 16、64px 14、4px 9、10px 6、12px 6、14px 4、24px 4、40px 2 —— 8/16/32/64 幂次档合计 94 次 = 59.9%，8px 单独占 29.9%。
- paddings 16 种 / 91 次：控件档 6px 6px 14、14.5px 15.5px 11、11px 11px 9、15.5px 16.5px 7、12px 12px 5、9px 9px 3、10.5px 11.5px 2；区块档 32px 32px 6、40px 40px 4、64px 64px 4、96px 96px 4 —— 半像素（x.5）只出现在按钮上。
- radii 12 种 / 1996 次：0px 1883（94.3%）、4px 57、6px 35、5px 6、8px 4、100% 3、2px 2、3px 2、16px 1、局部圆角 6px 三段各 1 —— 非零圆角仅 113 次，卡面实际只用 4px / 6px。
- shadows 5 种、全页仅 6 次实例：rgba(50,50,93,0.12) 0px 16px 32px 0px ×2；rgba(0,0,0,0.06) 0px 4px 24px 0px + rgba(0,0,0,0.03) 0px 1px 2px 0px ×1；rgba(0,0,0,0.1) 0px 30px 60px -50px + rgba(50,50,93,0.25) 0px 30px 60px -10px ×1；rgba(23,23,23,0.06) 0px 3px 6px 0px ×1；rgba(23,23,23,0.08) 0px 15px 35px 0px ×1 —— 层级靠背景色阶，不靠阴影；border 色值证据里看不到。
- containerMaxWidths：1266px 13（题面写 ×16，证据里是 13 次）、817.778px 8、884.52px 4、752px 3、856px 3、1088.64px 2、866.88px 2、1232px 1、1298px 1、1349px 1 —— 4 个带小数值说明列宽由比例求出，公式证据里看不到。
- gridTemplates：2 tracks 16、3 tracks 13、1 tracks 9、12 tracks 8、4 tracks 3、8 tracks 1（共 50）；实高参照 header 1440×76、nav 1262×64（列表 358×40、按钮组 187×44）、区块行 1232 宽（1365/997/1475/701 高）、logo 单元 172×72 ×30、feature-detail 400×138–414（中位 160）×9、案例卡 332×552 ×8（移动 358×477）。

## 4. 动效
- `color 0.3s cubic-bezier(0.25, 1, 0.5, 1)` 151 · `fill 0.3s cubic-bezier(0.25, 1, 0.5, 1)` 124 · `opacity 0.3s cubic-bezier(0.25, 1, 0.5, 1)` 46 · `stroke 0.3s cubic-bezier(0.25, 1, 0.5, 1)` 46 · `transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)` 46（单属性 5 条合计 413 次）。
- `background-color, color, outline-color, border 0.3s, 0.3s, 0.3s, 0.3s cubic-bezier(0.25, 1, 0.5, 1), cubic-bezier(0.25, 1, 0.5, 1), cubic-bezier(0.25, 1, 0.5, 1), cubic-bezier(0.25, 1, 0.5, 1)` 24（多属性逐项写法）。
- `transform 0.8s cubic-bezier(0.165, 0.84, 0.44, 1)` 46 · `clip-path 0.8s cubic-bezier(0.165, 0.84, 0.44, 1)` 12 · `transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)` 12。
- `opacity 0.15s linear` 36 · `opacity 0.12s ease` 16 · `opacity 0.5s cubic-bezier(0.33, 1, 0.68, 1)` 10 · `opacity 0.25s linear` 9 · `opacity 0.4s cubic-bezier(0.3, 0, 0.2, 1)` 8。
- 14 条 transition 共 586 次；`cubic-bezier(0.25, 1, 0.5, 1)` 家族 437 次 = 74.6%（151+124+46+46+46+24）—— 一条曲线 + 一个 0.3s 覆盖四分之三的交互，其余曲线各 46/12/12/10/8 次。
- 时长共 8 档（0.12 / 0.15 / 0.25 / 0.3 / 0.4 / 0.5 / 0.6 / 0.8s）、曲线 5 条（另有 linear、ease 两条关键字写法）；`prefers-reduced-motion` 与 `@keyframes` 规则数证据里看不到，唯一相关痕迹是 dom-outline 的 class 名 `lazy-animation` 11 次。

## 5. 暗色策略
- behavior：bodyBgIsDark = true、prefersColorSchemeRules = 0、meta.colorScheme = null、meta.themeColor = null —— 四项同时成立。
- 含义：body 计算背景落在暗侧（背景清单里对得上的只有 rgb(13,23,56) #0D1738 2 次 / rgb(0,0,0) 1 次），但样式表里没有任何 `@media (prefers-color-scheme)` 规则 —— 暗色不是「跟随系统」，是作者按段落写死的配色。
- 切换机制靠 class 而非变量表：hds-color-mode 10、hds-mode--light 8，暗段写成 `section.hds-color-mode.section.hds-mode--dark`（1440×2283）与 `section.hds-color-mode.stats-section.stats-section--dark`（1440×920）。
- 暗色只作整幅横带：2283 + 920 = 3203px，占 desktop pageHeight 14420px 的 22.2%；暗面可查的背景值只有 #0D1738。
- 有无主题开关：证据里看不到（dialog 0、tabs 0、无 colorScheme meta、无 prefers-color-scheme 规则）；dom-outline 类名频次里按钮只有 hds-button 52、hds-button--secondary 23、hds-button--primary 13，没有可判定为主题开关的类名。
- 光暗共用一套组件类，只加 mode 修饰：hds-heading--subdued 26、hds-text--soft 32 是它的次要文字变体（命名证据，非视觉判断）。

## 6. 对比度实测
- 纯色背景近似值：sampled 400、skippedForComplexBackground 3、min 1、p10 4.75、median 6.3、belowRequirement 14（14/400 = 3.5%）；p10 4.75 已高于 4.5 正文线。
- worst 1：span.hds-heading「为 AI 构建经济基础设施」fontSize 48、ratio 1、required 3 —— required 3 证实 48px 走大字号档；成因（只看 selector 与字号）：48px 的 hds-heading span 取到前景=背景的 1.00，典型的渐变/裁剪文字或叠层里被压在底下的那一层（dom-outline 中 hero 恰有 title--background 与 title--foreground 两个同文案 h1，各 1024×221）。
- worst 2：span.hero-section__title-copy 同段文案 fontSize 48、ratio 2.39、required 3 —— selector 落在 hero 标题的 copy 层，2.39 不是真实正文对比度，而是渐变/半透明叠加取到的中间色近似值；这两条按「测量口径问题」读，不是「可读性差」。
- worst 3–8：selector 全是 div，文本 继续 / Weiter / 続行、fontSize 10、ratio 2.41、required 4.5，共 6 条 —— 同一组件同一字号同时挂着中/德/日三种语言文案，说明这是把多语言标签留在 DOM 的组件（语言选择或轮播控制），10px + 2.41:1 是它真实的小字样式。
- 结论口径：8 条 worst 里 6 条来自同一个 10px 组件，2 条来自 hero 特效文字；主体文字 median 6.3 / p10 4.75 余量充足，belowRequirement 仅 14 条。
- 品牌蓝 #533AFD（文字 542 次）自身的对比度值证据里看不到（worst 未收录，也无该色值的 ratio 字段）。

## 7. 骨架与命名
- landmarks（metrics.json）：header 5、nav 1、main 1、section 15、footer 1；article / aside / form / dialog 全为 0（题面写的 header=6 / section=18 在证据里查不到）。dom-outline 逐节点与之一致：5 个 header = 导航 header + 3 个 section-header + events-carousel__header；15 个 section 含 2 个 0×0 的 navigation-menu-footer / header。
- 标题：h1 2（同文案双份，hero title--background / --foreground）、h2 5、h3 25，无 h4 及以下 —— 卡片标题一律 h3（bento 卡、客户摘要、新闻条目均为 h3.hds-heading--sm / --md）。
- 命名三层：设计系统前缀 hds-*（hds-text 85、hds-nowrap-svg 85、hds-heading 77、hds-link 76、hds-button 52）、BEM 式 block__element（logo-carousel__item 36、section-row 22、section-row-gap 22、footer-links-block__item 18、feature-detail__content 11）、变体修饰符（--inline 45、--md 34、--soft 32、--subdued 26、--emphasized 25、--secondary 23、--sm 20、--primary 13、--lg 12）。
- 工具类与行为数字：tabular-nums--tight 44、fake-link 10、lazy-animation 11、carousel__item 16 / carousel__inner 16，无哈希类名；buttons 31、images 38（lazyImages 23）、sticky 1 / fixed 1、searchInputs 0、selects 0、tabs 0、requestCount 111（script 81 / link 10 / img 9 / fetch 6 / iframe 2）；首屏 HTML 已含 4932/5949 文本（耗时 13255ms），移动 4772/6029（11086ms）。
- hreflang 89 条 = 1 条 x-default + 77 条 xx-YY + 11 条裸语言（pt / nl / en / fr / de / it / ja / zh / es / sv / th）；横向核对 research/_raw 全部 metrics.json 的 hreflang 条目共 128 条、次高 notion.com 22 条 —— 89 条是样本内最多。
- 国际化结构可直接执行：10 组「裸语言 + xx-YY」指向同一 URL（en/en-US→/、fr/fr-FR→/fr、de/de-DE→/de、it/it-IT→/it、ja/ja-JP→/jp、es/es-ES→/es、pt/pt-BR→/br、nl/nl-NL→/nl、sv/sv-SE→/se、th/th-TH→/th），只有裸 zh 例外指向 /zh-sg；单语言国家用裸国家码（/de、/fr、/it、/jp、/es、/br、/se、/th、/nl、/gb、/au、/ie、/in、/nz、/cn、/mx），多语言国家用 /语言-国家（/en-de、/fr-be、/en-ch、/zh-us、/zh-hk）；内链 159、hashOnlyLinks 0、detailUrlPatterns 12 种（/:slug/:slug/:slug 86、/:slug/:slug 41、/:slug/:slug/news/:slug 12、/:slug/contact/:slug 4、/:slug/pricing 3 …）；jsonLdTypes 仅 WebSite + Organization。

## 8. 可移植清单
- 可直接照抄（纯 CSS 字符串）：`color 0.3s cubic-bezier(0.25, 1, 0.5, 1)` 151 次打头 + 同参 `fill` 124 / `opacity` 46 / `stroke` 46 / `transform` 46（单属性合计 413）+ 24 次多属性写法 = 437/586；一条曲线 + 0.3s 覆盖 74.6% 的过渡，长时程另留 `transform 0.8s cubic-bezier(0.165, 0.84, 0.44, 1)` 46 与 `clip-path 0.8s cubic-bezier(0.165, 0.84, 0.44, 1)` 12。
- 可直接照抄（尺寸常量）：容器 1266px、区块行 1232px、导航 1262×64 与按钮组 187×44、logo 单元 172×72、案例卡 332×552、圆角只有 4px(57) / 6px(35)、gap 8/16/32/64（59.9%）、区块 padding 32/40/64/96、正文字号 16px(1668)、字重仅 400/500、暗带高 2283px。
- 可直接照抄（结构）：栅格 2 tracks 16 / 3 tracks 13 / 12 tracks 8；页高 14420px = 16 屏（移动 19590px = 23.2 屏）；标题只用 h1/h2/h3（2 / 5 / 25），卡片标题一律 h3。
- 可直接照抄（暗色）：分段 class 切模式（hds-color-mode 10 / hds-mode--light 8 / --dark）+ 暗面单值 #0D1738 + 白字，即可得到整幅暗带，不需双主题变量表；全套 shadows 只有 6 次实例，不要把阴影当层级系统抄。
- 不适用：8/9/10/11px 微字（159 次）、按钮半像素内边距（14.5px 15.5px / 15.5px 16.5px / 10.5px 11.5px）是配合单一 Web 字族 sohne-var（1996 次全覆盖）度量的，零外链、不热链 Web 字体的前提下复现不了同样的密度。
- 不适用：81 个 script、111 次请求、5 个自建 CDN 域（b.stripecdn.com 93、images.stripeassets.com 5、q.stripe.com 3、r.stripe.com 3、assets.stripeassets.com 1）、48px 展示级（17 次）与 1024×221 双 h1 叠层、30 个 172×72 logo 跑马灯（6192×72）、0.8s transform + clip-path 滚动叙事（46 + 12 次）—— 单文件静态站的口径里这些是反面参照。
