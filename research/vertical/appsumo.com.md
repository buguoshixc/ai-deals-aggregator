# appsumo.com — 发现产品、保持古怪（Discover products. Stay weird.）的软件优惠聚合站

抓取：https://appsumo.com/ · 2026-09-22T17:02:57.297Z · 视口 1440×900 / 390×844
证据：research/_raw/appsumo.com/{metrics.json,tokens.json,dom-outline.txt}

## 1. 信息架构（landmarks、导航、主列表位置与规模）
- landmarks：header 1、nav 1、footer 1、form 2；main／section／article／aside／dialog 全为 0。
- 标题层级：h2 ×3（Great software for your business…／Top 9 deals／Just launched）+ h3 ×9（产品名）。
- 主列表由单一父级承载：signature div.flex.gap-4.items-start，count 9，parents 1。
- 面积兜底主块：1376×556 div.grid.grid-cols-1.gap-6、1344×350 div.relative.flex.items-stretch。
- gridTemplates：1 tracks ×4、4 tracks ×2、3 tracks ×1；容器宽 1600px ×5、1440px ×1、816px ×1。
- 顶栏 header.fixed.left-0.top-0 为 1440×80；底部 footer.bg-black-pearl.py-10.text-white 为 1440×264。

## 2. 数据密度（pageHeight/scrollScreens、主列表签名+尺寸+首屏完整可见、静态正文长度）
- 桌面 pageHeight 1968px、scrollScreens 2.2；移动 pageHeight 4039px、scrollScreens 4.8。
- 主列表 9 张、宽 437px、高 min=max=median=164px；首屏完整可见 3 张、触及 3 张。
- 列数按宽推算：437×3 + gap 16×2 = 1343，对得上容器 1344（gap 取 16px 推算），即 3 列。
- 静态正文 textLength：桌面 3022、移动 2731。
- 预渲染证据：hydration textBefore = textAfter = 2786（桌面）／2731（移动），差值 0。
- 资源量：images 56（其中 lazyImages 23）、requestCount 227、css 资源仅 1。

## 3. 筛选与排序（search/select/facet/tab 计数，引 behavior）
- behavior：searchInputs 1、selects 0、tabs 0、buttons 12、relNext 0。
- behavior 里没有 facet 字段 → facet 计数证据里看不到；排序控件证据里看不到。
- selects 0 且 tabs 0 → 筛选侧只有 1 个搜索输入框可用（behavior.searchInputs）。
- relNext 0 → 无分页 rel 声明；stickyElements 0、fixedElements 4。
- 分档靠标题而非控件：h2「Top 9 deals」与「Just launched」两段（metrics.headings）。
- 4 个 fixed 元素含 1440×900 的 privy-popup-container（dom-outline 面积兜底清单）。

## 4. 详情呈现（detailUrlPatterns 形态与计数、internalLinkCount、hashOnlyLinks）
- detailUrlPatterns 共 9 种形态；计数 69／5／1×7，明细合计 81；internalLinkCount 83。
- /:slug/:slug 计数 69，样本 3 条全为集合/入口页：collections/new、collections/ending-soon、a/radar。
- /:slug 计数 5，样本 /cart/、/plus/、/terms-of-use/。
- 单条形态各 1：/browse、/:slug/login、/account/:slug、/privacy、/about、/blog、/careers。
- hashOnlyLinks 0 → 不存在纯锚点假链接；landmarks.dialog 0。
- 卡片到条目的跳转形态证据里看不到（样本未给出产品级 URL）。

## 5. 信任与诚实性设计（核验/更新时间/来源署名/免责声明；看不到就写「证据里看不到」）
- 三个证据文件里没有核验字段（无 verified／checked 一类键）。
- 没有内容更新时间字段：fetchedAt 是抓取时间，不是条目更新时间。
- 没有来源署名字段；没有免责声明字段。
- jsonLdTypes 仅 Organization，无 Review／AggregateRating／Offer 等可信信号。
- 折扣力度、原价等换算类数字证据里看不到；form 2 个但用途证据里看不到。
- 结论：核验／更新时间／来源署名／免责声明 —— 证据里看不到。

## 6. 变现方式（externalDomains/resourceTypes 能否看出联盟/广告/追踪）
- externalDomains 20 个；自有 CDN 占前二：appsumo2next-cdn 44、appsumo2-cdn 24。
- 追踪与广告：metrics.appsumo.com 13、analytics.tiktok.com 10、googleads.g.doubleclick.net 7、analytics.google.com 5、analytics.twitter.com 5、googletagmanager 5。
- 邮件/弹层/同意管理：static.klaviyo.com 17、cdn-cookieyes.com 4、assets.privy.com 6、api.privy.com 2、events.privy.com 2。
- 社交像素 connect.facebook.net 2；fonts.googleapis.com 3；Top20 内无第三方商家域 → 联盟跳转域证据里看不到。
- resourceTypes：script 70、img 56、fetch 54、link 26、beacon 9、xmlhttprequest 8、iframe 2、css 1。
- 能看出的是广告像素 + 邮件/弹层增长工具 + 自有图片 CDN；佣金与排序售卖证据里看不到。

## 7. SEO 与内链结构（canonical/hreflang/jsonLdTypes/meta.description；内链形态分布）
- canonical 单值 https://appsumo.com/；hreflang 为 []（空数组）。
- jsonLdTypes 仅 ["Organization"]（1 种），无 Product／Offer／BreadcrumbList。
- meta.description 1 条（优惠 + 无月费卖点）；ogImage 1 条；themeColor 与 colorScheme 均 null。
- lang="en"；viewport 值为 width=device-width。
- 内链形态分布：/:slug/:slug 69、/:slug 5、其余 7 种各 1；hashOnlyLinks 0。
- 内链总 83，样本全为集合/入口/账户/法务页；条目型 URL 证据里看不到。

## 8. 移动端（手机 pageHeight/scrollScreens/主列表/字号与桌面差异）
- 手机 390×844：pageHeight 4039px、scrollScreens 4.8（桌面 1968px／2.2）。
- 主列表签名退化为 div（count 6、parents 3、宽 390），首屏完整可见 1、触及 2（桌面为 3／3）。
- 卡片 div.flex.gap-4.items-start 仍 9 个，宽 358、高 164→188（桌面定 164）；移动端首屏完整可见 0。
- 移动字号 7 档：16px 313、14px 159、18px 18、20px 13、88px 9、12px 3、24px 3（桌面 11 档）。
- 桌面独有的 80px／11px／15px／30px 在移动字号表不出现；88px 两端同为 9 次。
- 正文 textLength 2731（桌面 3022）；移动端无 tab／select 记录，其余交互差异证据里看不到。

## 9. 可移植清单：**值得学** / **不适用**
- 值得学：主列表单父级 + 定高 164px + count 9，签名稳定到可被脚本断言。
- 值得学：内容预渲染（textBefore = textAfter = 2786，正文 3022 字符，不执行 JS 可读）。
- 值得学：先分组标题再铺列表（Top 9 deals／Just launched），整页仅 2.2 屏。
- 值得学：移动端字号档位收敛到 7 档（桌面 11 档），16px 占 313 次为主档。
- 不适用：227 请求 / script 70 / fetch 54 / 20 个外部域（含 doubleclick、klaviyo），与零构建单文件、浏览器端零依赖冲突。
- 不适用：JSON-LD 仅 Organization 1 种、hreflang 空、无 main 无 dialog、对比度 min 1.2 且 16 条不达标。
