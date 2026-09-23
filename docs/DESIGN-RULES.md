# 设计规范（本轮定稿 · E 阶段按此实施，F 阶段按实际落地回填）

**这份文档的作用**：把 `research/` 里的证据压成**可执行、可验证的规则**，
免得下次改动又靠记忆和审美争论。每条规则三件套：**规则 / 依据（哪个站、哪个数字）/ 怎么验证**。

**适用范围**：`index.html`（浏览器端零依赖、零构建、不热链任何 CDN 或 Web 字体、单文件）。

---

## 1. 颜色与对比度

| # | 规则 | 依据 | 验证 |
|---|---|---|---|
| C1 | 承载文字的颜色必须 ≥ **4.5:1**（正文）/ ≥ **3:1**（大字：≥24px 或 ≥18.66px 粗体）；装饰色不受限，但要另立 token（`--mut-deco`） | 标杆里做得最好的四家是 0 条不达标（openrouter min 5.79、llm-prices 5.13、superhuman 4.85、aitools.fyi 4.79）；我们现状 **100/400 不达标、最低 2.84**，根因是 `--mut:#8c94a6` 压 `--bg:#f6f7f9` = 2.84:1（算式与仪器实测逐位吻合） | `verify-site.js` 对比度断言（亮/暗各一遍）；`study-site.js` 可独立复核 |
| C2 | 一处 token 管一类文字，**不允许**「同一语义两种灰」 | vercel 文字色只有 3 档（`rgb(23,23,23)`×289 / `rgb(77,77,77)`×189 / `rgb(143,143,143)`×30）；aitools.fyi 只有 5 个取值 | 静态检查 `:root` + 抽查 computed style |
| C3 | 色块上的文字**逐色块指定**「on 色」，不用统一白字 | 实测：9px 白字压档位 1 `#0e9f6e` = **3.38:1**、压档位 5 `#94a3b8` = **2.57:1**；暗色下白字压 `#7c93ff` = **2.81:1** | 对比度断言覆盖角标与主按钮 |

## 2. 暗色模式

| # | 规则 | 依据 | 验证 |
|---|---|---|---|
| D1 | 暗色走**「底 / 面 / 发丝环」三件套**，不是把亮色反相 | linear：底 `rgb(8,9,10)` → 面 `rgb(15,16,17)` → 环 `rgba(255,255,255,.08)`；raycast：底 `rgb(8,9,12)` → 面 `rgba(255,255,255,.05)` → 边 `rgb(67,67,69)` | 断言：暗色下卡片与背景可分辨（环存在）+ 对比度 0 条不达标 |
| D2 | **跟随系统 + 手动三态**（auto/light/dark，记 localStorage），并声明 `<meta name="color-scheme" content="light dark">` + 两段 `theme-color` | vercel 是样本里唯一显式双主题的站（`color-scheme="dark light"`）；notion 是唯一跟随系统的站（1 条 `prefers-color-scheme` 规则） | 断言：切换生效、刷新保持、`color-scheme` 已声明 |
| D3 | **不做默认暗色** | 4 个默认暗色的标杆（linear/framer/raycast/stripe）都是「产品本身是暗色 UI」，几乎不放第三方 logo；我们卡面承载 30+ 家厂商图形（多为深色），默认暗色会集体降低可辨识度 | 设计决策，无自动断言；列为「不采纳」条目 |
| D4 | 暗色下 logo tile 保留**浅色承载底** + 环 | 同上（第三方图形不是我们可控的资产） | 断言：暗色下 tile 与其底色对比 ≥3:1 |

## 3. 排版

| # | 规则 | 依据 | 验证 |
|---|---|---|---|
| T1 | 字阶收敛到 **6 级**（11/12/13/14/16/19），正文 **14px**、行高 1.5 | 标杆字阶普遍只有 3–4 级（linear 3 级）；数据密集站基准 14px（openrouter 14px×1369、artificialanalysis 14px×1428）；我们现状 **12 种字号** | 静态检查 + `study-site` 复核字号种类 |
| T2 | **只用真实存在的字重 400/500/600/700** | 我们没有 Web 字体；系统字体（PingFang SC / Microsoft YaHei / Segoe UI）没有 550/650/680/750 这些实例，写了会被四舍五入 —— 现状**假字重 354 处**（650×162、680×124、800×66、750×2）；标杆能用分数字重是因为随可变字体下发（linear 的 Inter Variable 声明 2878 次） | 断言：`index.html` 里不出现非 400/500/600/700 的 font-weight |
| T3 | 极小字号（≤11px）**只承载角标/编号**，不承载句子；且仍须过 4.5:1 | framer 12px 占 87.6% 是编辑器 UI 场景；stripe 的 8–11px 微字配 Web 字体；我们现状 11px 出现 **489 次**，是元信息主力 | 对比度断言 + 人工抽查 |

## 4. 层级与形状

| # | 规则 | 依据 | 验证 |
|---|---|---|---|
| E1 | 卡片层级用**发丝环 + 微投影**（`0 0 0 1px` + 小模糊），**禁用大扩散投影** | linear / vercel / superhuman / raycast 都用环（`0 0 0 1px`）；notion 用 10 层微投影阶梯；我们的 192px 定高 + 12px 间距网格里，18px 扩散投影会让相邻卡片互相压暗 | 断言：hover 前后卡片高度与网格行高不变 |
| E2 | 圆角分 3 档：`--r-sm 6px` / `--r 10px` / `--r-dlg 12px`，不再出现 5/7/9px 这类散值 | 8px 是标杆主流（aitools 79、artificialanalysis 193、futuretools 62、notion 52、framer 230）；我们现状 6 种圆角值 | 静态检查 + 视觉抽查 |
| E3 | 间距走 **4 的倍数**（4/8/12/16） | linear gap 4·6·8 占 79%；superhuman gap 4px 占 45%、刻度 4/8/12/16/24/32；我们现状卡片内边距 `13px 14px`、小节间距 `9px` | 静态检查 |

## 5. 动效

| # | 规则 | 依据 | 验证 |
|---|---|---|---|
| M1 | 时长只 3 档：**100 / 150 / 250ms**；曲线只 2 条：`cubic-bezier(.4,0,.2,1)`（标准）与 `cubic-bezier(.22,1,.36,1)`（进场） | 跨站最多的是 Tailwind 默认 150ms（aitools 40 / devtk 52 / futuretools 115 / openrouter 174）；linear 用 100ms（×187）；openrouter 用 250ms expo-out 做进场（×60）；stripe 300ms ease-out-quart；raycast `cubic-bezier(.23,1,.32,1)` | 静态检查 `:root` 的 4 个动效 token |
| M2 | **只过渡显式属性**（color / background-color / border-color / box-shadow / transform / opacity），**禁止 `transition: all`** | 标杆无一家用 `all` 做主过渡；反面样本是 ai-bot.cn `all .3s ease`×**373**、free-for-dev ×**59** | 断言：源码中不出现 `transition: all` |
| M3 | 必须实现 `prefers-reduced-motion: reduce` 全局降级 | 我们的动效是纯装饰；这是「动效可关」的唯一可验证落点（现状完全没有） | 断言：该偏好下计算出的 `transition-duration` ≤ 0.01ms |
| M4 | hover 不得改变布局几何 | aitools.fyi 的卡片 hover 只改阴影（33+15 枚阴影、无位移）；我们现有 logo 簇 hover 展开是靠**预留容器宽度**做到的（已有断言保护） | 断言：hover 前后卡片高/标题宽/logo 簇宽三量不变 |

## 6. 结构与语义

| # | 规则 | 依据 | 验证 |
|---|---|---|---|
| S1 | 必须有 `header` / `nav` / `main` / `article` / `footer` 语义标签 | devtk `header=1 nav=2 main=1 section=5 footer=1`、notion `header=4 nav=2 main=1`、superhuman `header=2 nav=3 main=1`；我们现状 **`header=0 nav=0 main=0`** | 断言：landmarks 计数 |
| S2 | 交互状态用 `aria-pressed` / `aria-selected` 表达，不只用 class | openrouter `tabs=50`、TAAFT `tabs=264` 都在用 ARIA 状态表达选中；我们 facet 现在只有 `.f.on` | 断言：选中项 `aria-pressed="true"` |
| S3 | 键盘可达：Tab 顺序完整、`:focus-visible` 可见、弹层 Esc 关闭并把焦点归还触发元素 | 现有做法已含「没有 JS 就不给可点暗示」，键盘路径需补齐 | 断言：焦点可见 / Esc 关闭 / 焦点归还 |

## 7. 可发现性（SEO / GEO）

| # | 规则 | 依据 | 验证 |
|---|---|---|---|
| P1 | 每个可索引页都自带 `canonical`、面包屑与结构化数据 | 同类站里 11/12 有路径型条目 URL；openrouter 单页 5 类 JSON-LD（含 `CollectionPage`/`BreadcrumbList`/`ItemList`）；我们全站 1 个 URL | 断言：详情页数 = 未过期 deal 数；sitemap 条目与页面集合一致 |
| P2 | JSON-LD 集合必须包含 **Organization / WebSite / BreadcrumbList / ItemList / FAQPage**（按页面类型取子集） | **devtk.ai 只有 2 类就包含 `WebSite`，我们 4 类里反而缺它** | 断言：`WebSite` 节点存在且 `url` 与 canonical 一致 |
| P3 | 内容必须**预渲染**：不执行 JS 也能读到全部正文 | 我们现状达标（水合前后均 11459 字符）；反例是 vercel 仅 878 字符、notion 2111 字符 | 断言：断掉 `deals.json` 后卡片与外链仍 ≥45 |
| P4 | 站点级身份补齐：`hreflang` 双语（如需）、`theme-color`、`og:*`、sitemap | devtk 3 条 hreflang（en/zh-CN/x-default）vs 我们 2 条自指 | 断言：hreflang 自指与互指正确 |
| P5 | 长页给同页锚点导航 | free-for-dev 同页锚点 232 条、ai-bot.cn 64 条；我们 0 条 | 断言：档位带有 `id` 且锚点可达 |

## 8. 内容与诚实性（红线，不因「学别人」而松动）

| # | 规则 | 依据 |
|---|---|---|
| H1 | 不编造：看不到升级路径就不写 `priceLine`；没有可信来源就不写 `features`；自动采集不冒充「已核验」 | 项目既有红线（README 设计原则 6）；对比同类站，我们的「已核验」是可追溯的 |
| H2 | 不做机器翻译：译文来自人工覆盖层 + 原文指纹，原文变了就停用该字段译文 | 2.15/2.16 已落地并有演练 |
| H3 | 不卖排序、不收录付费推广位；页脚明写 | 同类站普遍有广告域（ai-bot.cn 9 个外部域、appsumo 20 个），我们 0 个 |
| H4 | 缺值不占位：对比表/详情只展示有值的字段，不写「暂无数据」 | `priceLine` 仅 3 条、`features` 31 条 —— 硬撑满格只会暴露空白 |
| H5 | 排序与分档规则必须能被外部复核（`npm run report:tier`） | 项目既有做法 |
| H6 | 活动期限分三类，且「未标注截止日期」不得写成「长期活动」：前者是「我们没查到」，后者是官方原话 | 2026-09-23 复核 25 个官方页（覆盖 36 条优惠），没有一条写出带年份的绝对截止日期——官方要么只写「限时」，要么给相对期限。把「未查到」写成「长期」就是编造 | 断言：`npm run selftest:expiry`（55 项，含前后端「长期」词表一致性）；分布见 `npm run validate` |

## 9. 依赖与工程

| # | 规则 | 依据 | 验证 |
|---|---|---|---|
| N1 | 外部请求 = **0**（不热链 CDN / 字体 / 图标库 / 统计） | 我们现状 35 个请求全部同源、0 外部域；同类站 2–20 个外部域不等 | 断言：外部请求 0 |
| N2 | 构建确定性：连续两次 `npm run build` 的 `dist/index.html` SHA256 一致 | 项目既有断言；禁止在构建期引入时间/随机 | 断言 + 手动复核 |
| N3 | 密度不得倒退：首屏完整可见条目数、页高、卡片数写入回归基线 | `verify-site.js --json` / `--compare`（本轮新增） | 断言：5 项回归 |
| N4 | 产物必须过「不裁切」检查（192px 定高 + `overflow:hidden` 会静默裁切） | 项目既有断言 | 断言：每张卡最后一个元素的底边不越界 |

---

## 明确不采纳（学得到但故意不学，附理由）

| 做法 | 谁在做 | 理由 |
|---|---|---|
| 广告与统计脚本 | ai-bot.cn 9 域 / appsumo 20 域 / superhuman 18 域 | 触碰零依赖红线；与「不卖排序」冲突 |
| Web 字体 / 图标字体 / 可变字重 | linear（Inter Variable 2878 次）、vercel（GeistSans 508）、stripe（sohne-var 1996）、superhuman（460/540） | 触碰零外部请求红线；系统字体栈已覆盖中英文 |
| `transition: all` | ai-bot.cn 373 次、free-for-dev 59 次 | 把布局属性纳入过渡，长列表代价明显；标杆无一家采用 |
| 默认暗色单主题 | linear / framer / raycast / stripe | 与卡面承载 30+ 家第三方 logo 的现实冲突（见 D3） |
| 用页面长度换内容量 | openrouter 113 屏、free-for-dev 67.6 屏、artificialanalysis 28.4 屏 | 我们的指标是「一屏看到多少条」，不是页面有多长 |
| 服务端路由式海量分类页 | ai-bot.cn `/:slug/:slug ×504`、toolify `/category/:slug ×134` | GitHub Pages 静态托管 + 单文件约束下不可行；主要收益由 P1 的详情页覆盖 |
| 大投影堆层级 | notion 10 层阶梯、framer 动画插值阴影 | 与 192px 高密度网格冲突（见 E1） |
| 巨型营销排版（72–96px 标题） | notion、framer | 与「一屏多条」的产品目标冲突 |
| 客户端重筛选（数百按钮） | artificialanalysis 413 buttons / TAAFT 2233 buttons | 单文件零依赖下不值得；我们的 62 张卡的 facet 已够用 |

---

## 怎么用这份规范

1. **改动前**：先看对应条目的「依据」——如果依据里的数字变了（站点改版），重跑
   `node scripts/tools/study-site.js <url>` 刷新证据，再决定规则是否仍成立。
2. **改动后**：`npm test` → `npm run build` → `npm run verify -- --compare=research/_raw/ours-baseline/verify.json`。
3. **新增规则**：必须同时给出「依据（可复核的数字）+ 验证方式（哪条断言）」，
   只写「这样更好看」的条目不予收录。

> 状态：**已按 A + B 两轮落地并回填**（见下节）。C 的部分（收藏/对比、首页按意图重排、英文覆盖）
> 尚未实施，等你点单。

---

## 落地情况（F 阶段回填 · 每条都有断言或实测数字）

落地位置：分支 `feat/visual-token-layer`（A）→ `feat/b-extras` → `feat/detail-pages` → `feat/row-view`（B）。
当时 `master` 未合并、未推送；**2026-09-23 已全合进 `master`（合并提交 `10cc923`）并在合并态复验通过**（见 `PROJECT_STATUS.md` 2.21）。

| 规则 | 状态 | 怎么验的 / 实测值 |
|---|---|---|
| C1 文字对比度 ≥4.5:1 | ✅ | `verify` 断言：亮色抽样 723 节点 **0 条低于要求**（最低 4.51）、暗色 **0 条**（最低 5.98）；改前 400 抽样 100 条不达标、最低 2.84 |
| C2 一处 token 管一类文字 | ✅ | `--mut` / `--mut-deco` / `--ink` / `--ink2` 四档；`--t1-ink`、`--t2-ink` 处理「档位色当文字」的另一种情况 |
| C3 色块文字逐块指定 on 色 | ✅ | `--on-t1..t5` + `--on-accent`；档位角标由「三角 + 压在上面的数字」改为**自带底色**的角标（压在兄弟节点上的文字会被审计工具算成 1:1） |
| D1 暗色三件套 | ✅ | 底 `#0b0d10` / 面 `#14171c` / 环 `rgba(255,255,255,.07)`；`--elev-hover` 换成环 + 微投影 |
| D2 跟随系统 + 手动三态 + color-scheme | ✅ | 断言：切深色立即生效并写 `localStorage`、刷新保持、切回「跟随系统」清空；`<meta name="color-scheme" content="light dark">` + 两段 `theme-color`；**首屏前决定主题**（内联脚本），无闪回 |
| D3 不做默认暗色 | ✅ 遵守 | 亮色仍是默认；暗色只在系统偏好或手动选择时生效 |
| D4 暗色下 logo tile 保留浅底 | ✅ | `.lg` 背景在两种主题下都是 `#fff`，缩写块自带深底白字 |
| T1 字阶 6 级、正文 14px | ⚠️ 部分 | 字阶 token 与正文 14px 已落地；**卡片标题保留 14px**（未按 mockup 的 16px）——192px 定高卡片里标题是 2 行截断，加大会挤压优惠文案与 meta 行。这是刻意偏离，不是遗漏 |
| T2 只用真实字重 | ✅ | 假字重（550/650/680/750/800）**354 处 → 0**；产物扫描断言 `font-weight` 只出现 400/500/600/700 |
| T3 极小字号只承载角标 | ✅ | 11px 仍是元信息主力，但对比度达标（见 C1） |
| E1 发丝环 + 微投影 | ✅ | `.g:hover` / `.r:hover` 用 `--elev-hover`；卡片 hover 前后高度与网格行高不变的断言仍在 |
| E2 圆角 3 档 | ✅ | `--r-sm 6px` / `--r 10px` / `--r-dlg 12px` + `--r-pill`；用一次**带命中次数断言的 codemod** 做了 51 处替换。复核：33 条 `border-radius` 声明里**非 token 值 0 条**（改前有 2/3/4/5/7/8/9/11/14px 共 9 种散值） |
| E3 间距 4 的倍数 | ✅ | 同一批替换把 5/9/11/13/15/22/26px 等奇数间距并到 `--s1..s4`。复核：含奇数间距的声明 **0 条**；唯一保留的是卡片横向 `14px`（光学微调，已在代码注释写明理由） |
| M1 3 档时长 + 2 条曲线 | ✅ | `--t-fast/base/slow` + `--e-std/--e-out`；旧的 `.13s/.18s` 已替换 |
| M2 禁 `transition: all` | ✅ | 产物扫描 `transition:\s*all` = **0** |
| M3 prefers-reduced-motion | ✅ | 断言：该偏好下**仍在动的元素 0 个**（卡片 `transition-duration=1e-05s`） |
| M4 hover 不改几何 | ✅ | 既有断言（卡片高/标题宽/logo 簇宽三量不变）继续通过；列表行同理 |
| S1 语义标签 | ✅ | 断言：`header=1 nav=1 main=1`（改前 header/nav/main 全为 0） |
| S2 aria 状态 | ✅ | 断言：筛选按钮 **11/11** 带 `aria-pressed`；排序、视图、主题三组控件同样有 |
| S3 键盘可达 | ✅ | 卡片与列表行加 `tabindex="0"` + `aria-label="…（按回车查看详情）"`（62/62 可聚焦）；回车/空格打开详情；**Esc 关闭后焦点归还给触发元素**。4 项断言：可聚焦且有标注、回车打开、Esc 后归位、列表行同样成立。（改前键盘用户根本打不开弹层，只能靠标题链接跳详情页） |
| P1 每页 canonical / 面包屑 / 结构化数据 | ✅ | 80 个详情页各自自指 canonical + 面包屑 + `WebPage`/`BreadcrumbList`；构建断言「详情页数 = type=deal 数」「sitemap = 首页 + 80」 |
| P2 JSON-LD 含 WebSite | ✅ | 首页 5 段：Organization / **WebSite** / BreadcrumbList / FAQPage / ItemList |
| P3 预渲染 | ✅ | 断言：**关掉 JS** 的浏览器上下文里详情页正文 616 字符、标题与官方链接都在；首页断掉 `deals.json` 仍有 62 卡 |
| P4 站点级身份 | ⚠️ 部分 | `hreflang` 仍 2 条（zh-CN + x-default）；英文页属 C，未做 |
| P5 同页锚点 | ✅ | 4 个档位带带 `id`，顶部「跳到档位」条；断言：点 `#tier-2` 真的滚动、非分带排序或列表视图时自动隐藏 |
| H1–H5 诚实性红线 | ✅ 遵守 | 详情页刻意不用 `Product`/`Offer`（我们不是售卖方）；`priceLine`/`features` 仍只在有据时填；不卖排序 |
| N1 外部请求 0 | ✅ | 断言：外部请求 0、加载失败 0、JS 错误 0（含详情页与列表视图） |
| N2 构建确定性 | ✅ | 连续两次构建：`index.html` 与 `deal/<id>/index.html` 的 SHA256 均一致 |
| N3 密度不倒退 | ✅ | `--compare` 五项：卡片 62→62、首屏 9→9、页高 5334→5368px（+0.6%，即锚点条）、外部请求 0→0、JS 错误 0 |
| N4 不裁切 | ✅ | 既有断言（每张卡最后一个元素底边不越界）继续通过 |

### 与提案的偏差（3 处，都是实测推翻了估算）

1. **紧凑行视图首屏 13 行，不是提案里的「16+」**。原因：真实页面比 mockup 多出顶栏 58px + 筛选条 41px +
   结果条约 48px 的固定 chrome。同口径下卡片视图是 9 张，所以真实增益是 **+44%**，不是 +78%。
   （`research/GAP-MATRIX.md` 与 `mockups/v3/B-balanced/PLAN.md` 已按实测更正。）
2. **卡片标题保留 14px**（提案写 16px）：192px 定高卡片里标题是 2 行截断，加大会挤压优惠文案与 meta 行。
3. **E2/E3/S3 已在 2.20 闭环**（圆角与间距全量收敛、键盘与焦点归位补齐）；**P4 仍只做了一半**——
   `hreflang` 仍 2 条（zh-CN + x-default），英文页属 C 未做。

### 落地过程里被门禁抓出来的真问题（记录在案）

| 问题 | 怎么发现的 |
|---|---|
| 档位角标在两种主题下都是 **1:1**（它压在三角形兄弟节点上，审计工具只看元素自身背景） | 新增的对比度断言第一次运行 |
| 暗色下 **203 条**不达标（12 处硬编码亮色面板：顶栏/筛选条/弹层/字段格/搜索框…） | 同上 |
| 结果条三个控件在 390px 下**横向溢出 45px** | 既有的「无横向溢出」断言 |
| 顶层对比页样式表 **404**（路径按子目录写死），而对比度检查照样是绿的（浏览器默认样式 21:1） | 结构检查（断链），不是对比度检查 |
| 构建自检把 CSS 选择器 `[data-tier="1"] .rnum` 算成「档位角标」，一加样式就假失败 | 产物自检 |
| 验收用的静态服务器对目录直接 404，而真实托管会解析 `deal/<id>/` → index.html | 详情页断言（本地 404、线上正常的假失败） |

> 一句话总结：**这六条没有一条是读代码看出来的**，全是门禁逼出来的。
> 所以「加断言」这件事本身的优先级，不低于加功能。
