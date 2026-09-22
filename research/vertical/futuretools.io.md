# futuretools.io — Future Tools - The Pulse of AI（AI 新闻 + 工具榜 +  newsletter 的暗色聚合首页）

抓取：https://futuretools.io/ · 2026-09-22T16:51:23.314Z · 视口 1440×900 / 390×844
证据：research/_raw/futuretools.io/{metrics.json,tokens.json,dom-outline.txt}
说明：本文件只写三份证据里查得到的值；查不到的一律标注「证据里看不到」。不描述截图画面。

## 1. 信息架构
- 骨架：header.sticky（1440×61）+ main（1440×3580）+ footer（1440×436）；landmarks header1/nav1/main1/section5/aside1/footer1/form3。
- 五段 section：hero 1440×580 / AI News 1440×1563 / AI News with Matt 1440×441 / Commentary 1440×359 / 订阅转化 1440×637。
- 标题层级：h1×1（Stay ahead on AI. All in ONE place.）、h2×7、h3×15（11 条新闻标题 + 4 条评论标题）。
- 详情 URL 形态 8 类：`/tools/:slug`×40、`/:slug`×13、`/news`×4、`/:slug/:slug`×4、`/tools`×3、`/blog`×3、`/about`×2、`/faq`×2、`/news/:slug`×2、`/:slug/:slug/:slug`×1。
- 单页内链 75 条、hash-only 链接 0 → 层级靠真实路径，不靠锚点。
- 页面高度 4077px（4.5 屏）/ 移动 7817px（9.3 屏）；main 高度 3580px 与 pageHeight 4077px 的差由 header+footer 补齐。

## 2. 数据密度
- 桌面文本量 9714 字符、移动 9237 字符；hydration textBefore = textAfter（9714 = 9714），内容不是客户端补出来的。
- 主列表 signature `a.flex.gap-3.group…rounded-lg.transition-colors` ×20，父容器 1 个，卡片 298×56（移动 316×56），**首屏完全可见 0、首屏触及 0**。
- 第二组重复件 `a.bg-card/60.border…rounded-xl` ×10，836×122（移动 358×150–172，中位 172），首屏触及 1。
- `li` ×16（3 个父容器，132×24）；aside 340×1435 内含 Top 20 AI Tools 两组各 20 个子节点。
- 字号集中：16px×624、14px×160、12px×36、11px×45、10px×28、9px×14；行高 24px×624、20px×109。
- 含义：密度靠「固定高度 + 截断」拿到 —— 56px 与 122px 两种定高、`truncate`×34、`line-clamp-2` 出现在评论标题。

## 3. 筛选与排序
- behavior：searchInputs **0**、selects **0**、buttons 15、tabs 2、relNext 0。
- 无任何搜索框、下拉排序控件、分页 rel=next 的可抓证据；筛选/排序控件本身「证据里看不到」（截图不纳入判断）。
- hero 段内有 `form.relative.flex.flex-col` 576×44，另有 2 个同形 form —— 表单 3 个，但输入类型证据里看不到。
- 列表顺序即服务端渲染顺序（textBefore = textAfter），排序不由前端 JS 决定。
- 结论边界：本站「筛选排序」不可作为同类站的对照样本；对应能力需另找样本。

## 4. 详情呈现（/tools/:slug ×40 的意义）
- `/tools/:slug` 形态命中 40 条，样本 3 条：`/tools/ankon-ai-kos341`、`/tools/cliphi-w0gfbv`、`/tools/star-by-face`。
- slug 尾部带短哈希（kos341、w0gfbv）→ 同名词条可共存、slug 天然唯一，不需要额外去重表。
- 40 条详情链出现在**单个首页**上，`/tools` 列表页另有 3 处；详情面由路径承载，不是弹窗或折叠块。
- 页面 dialog 0、article 0 → 详情不靠模态层，靠独立 URL。
- 可执行结论：条目页采用 `/{集合}/:slug`、slug 带短哈希；单页可放 40 条详情链，不影响 4.5 屏总高。
- 反面参照：本站内链仅 1 条、无独立条目页时，抓取面等于 1 页；此处差值 = 40 条入口。

## 5. 信任与诚实性设计
- 可见署名/来源线索：h1 与 meta description 均点出策展人 Matt Wolfe；description 写 "curated by Matt Wolfe"。
- meta description 含自称数字 "250,000+ newsletter readers"（本报告只转述，不做核实）。
- `/about`、`/faq` 各命中 2 条链接，`/go/p/…` 跳转形态 1 条 → 存在「离开本站」的中转路径形态。
- 外链/图片来源可数：i.ytimg.com×4、supabase.co×3、theregister/axios/wsj/techcrunch/x.ai/alicdn 各 1。
- 广告位或赞助标记（sponsored/广告字样的 DOM 证据）：**证据里看不到**；affiliate 参数：**证据里看不到**。
- 可执行结论：单作者署名 + about/faq + 明确跳转路径，是可复制的信任三件套；「编排中立」无法从本证据判定。

## 6. 变现方式
- 首页含 3 个 form，其中订阅转化段 1440×637：h2「Get the AI Income Database, free when you join」+ `ul.space-y-2.5.text-sm`（80px）+ form 576×44。
- 订阅按钮文本出现在对比度清单里：Subscribe(12px)、Subscribe to Newsletter(16px)、Get the database free(16px)、Subscribe now(16px)。
- 侧栏 aside 340×1435 承载 Top 20 AI Tools（两组 20 个节点）→ 榜单位在首屏主列旁边，且不在首屏可见区内。
- footer 四栏：Site / Social / Legal / More from Matt（各 280px 宽）→ 多产品矩阵归属清晰。
- 展示广告、付费排序、联盟佣金：**证据里看不到**（resourceTypes 无 ad 域、externalDomains 无广告域）。
- 可执行结论：可学的变现是「内容位换订阅」；排序变现与否本证据无法证实。

## 7. SEO 与内链结构
- canonical = https://futuretools.io；og:image = /logo@2x.png；meta viewport = width=device-width, initial-scale=1。
- jsonLdTypes = **[]（空）**、hreflang = **[]（空）**、relNext = 0、meta colorScheme = null、themeColor 缺失。
- 标题结构 h1×1 → h2×7 → h3×15，新闻条目用 h3 承载，section 5 个。
- 内链 75 条、hash-only 0；8 类路径形态（详见第 1 节）→ 靠真实路径摊平抓取深度。
- 图片 55 张、懒加载 54 张；资源 71 请求：img45 / script13 / link6 / fetch4 / beacon3。
- 可执行结论：本站可对标的只有「canonical + 单 h1 + 条目独立路径 + 图片懒加载」；结构化数据与多语言标签本站反而更强（4 段 JSON-LD、canonical/hreflang 齐备），不构成学习项。

## 8. 暗色实现（单独写清）
- behavior.bodyBgIsDark = **true**；behavior.prefersColorSchemeRules = **1** 条规则存在；meta colorScheme 为 null → 暗色不是靠 `color-scheme` 元标签声明的。
- 页面底色 token：`rgb(18, 18, 30)`×7 与 `rgb(14, 14, 24)`×1；另有 oklab 系底色 `oklab(0.14914 0.00419165 -0.0166224 / 0.6｜0.8｜0.95)` 各 1。
- 面板底 `rgb(30, 30, 46)`×39（出现最多）→ 底座 / 面板 / 更深层三级可辨：14,14,24 → 18,18,30 → 30,30,46。
- 叠加层走同色透明：`oklab(0.1885 0.00580624 -0.0235468 / 0.6)`×19、`/0.5`×14 → 卡片用半透明底叠在页底上。
- 文字 token：正文 `rgb(240, 238, 245)`×608、次级 `rgb(168, 163, 184)`×129、主色 `rgb(139, 92, 246)`×41、白 `rgb(255,255,255)`×11。
- 结论：暗色 = 三层中性底（#0E0E18 / #12121E / #1E1E2E 量级）+ 同色透明叠加 + 单一紫色强调，可在纯 CSS 变量里复刻；`prefers-color-scheme` 规则具体内容证据里看不到（仅计数 1）。
- 对照基线：本站 400 抽样中 100 条不达标、最低 2.84；本样本对比度 sampled 179、min 4.23、p10 4.66、median 8.07、belowRequirement 5。
- 本样本 5 条不达标的全部是按钮（ratio 4.23 < 4.5，12–16px）→ 暗色下「主色按钮 + 白字」是集中风险点，需按 4.5 反推前景/背景。

## 9. 可移植清单：**值得学** / **不适用**
值得学：
1. 三层暗色底 + 同色透明叠加：`#12121E / #1E1E2E` 量级 + oklab 同色 α0.5–0.6，无第二条色系。
2. 详情路径 `/{集合}/:slug`（40 条/首页），slug 尾部带短哈希 → 独立条目页 URL 形态可直接照搬。
3. 单页承载 40 条详情入口，页面仅 4.5 屏（4077px）、文本 9714 字符 → 证明「入口多 ≠ 页长」。
4. 定高卡片 298×56 与 836×122 两档 + truncate/line-clamp → 密度可预测、行数不飘。
5. 图片 55 张中 54 张懒加载，容器 max-width 1280px×7 → 零成本的体量控制。
6. 单作者署名 + /about + /faq + 明确跳转路径（/go/p/…）→ 信任面不依赖后端。

不适用：
1. **热链外部图源**：本站要求不热链 CDN，而 i.ytimg/alicdn/wsj/axios 等外域各 1–4 次，不可照搬。
2. **客户端运行时依赖**：71 请求 / script 13 / fetch 4 + supabase.co×3，与「零依赖、零构建单文件」冲突。
3. **无筛选无排序**：searchInputs 0 / selects 0 / tabs 2，本站已有 4 档力度分档，反向也说明本样本无法当对照。
4. **`/go/p/` 型跳转中转**：与「不卖排序」的透明原则需要显式披露，本证据里看不到披露方式。
5. **空 JSON-LD 与空 hreflang**：本站已有 4 段 JSON-LD + canonical/hreflang，不降级。
6. **对比度仅 4.23 的按钮**：低于 4.5 门槛，本站基准更高（本项目需从 100/400 不达标往回收，但目标不是 4.23）。

---
未在证据中出现的项（明写）：整站筛选/排序控件细节、`prefers-color-scheme` 规则体、广告与联盟标记、下划线焦点态、键盘可达性、按列断点命名、首屏元素的具体视觉呈现。
