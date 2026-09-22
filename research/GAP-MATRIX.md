# 差距矩阵：标杆/同类站点 → 我们

**怎么读这份文档**：每一行都是「别人真在这么做（附数字出处）」对「我们真在这么做（附数字出处）」，
再给出**是否适用**、成本、是否触碰红线、预期收益。第 4 列起带 ★ 的条目是**三套候选方案的分界点**。

**证据位置**：标杆数值 → `research/_raw/<slug>/metrics.json`、`tokens.json`（汇总见 `research/EVIDENCE.md`）；
我们的数值 → `npm run verify` 输出 + `research/_raw/ours-baseline/`（用**同一把尺子** `scripts/tools/study-site.js` 量的）。

## 口径与可比性（先说清楚，免得误读）

| 指标 | 定义 | 已知偏差 |
|---|---|---|
| 首屏完整可见条目 | 该组件**底边 ≤ 视口底边**（与 `verify-site.js` 同口径） | 我们的卡片按档位带不同 class（`.g.t1/.t2/.t3`），`study-site` 按「tag+class 签名」分组，会把我们拆成 4 组，所以**我们的密度取 `verify-site.js` 的 9 张**，标杆取各组最大值 |
| 行高 / 卡片高 | 渲染后的 `getBoundingClientRect().height` | — |
| 对比度 | WCAG 相对亮度比，**纯色背景近似**；渐变/图片背景样本跳过 | 我们跳过 0 条、linear 跳过 95 条、raycast 跳过 219 条 —— 跨站比较时以「低于要求条数」为主，别只看最低值 |
| 内链 / URL 形态 | 同源 `<a href>` 计数与路径形态聚类 | 单页锚点（`#分类`）单独计数，不计入 URL 形态 |
| 静态正文 | 不执行 JS 时 `body.innerText` 的长度（我们 = 预渲染后） | 我们水合前后一致（11459→11459），SPA 站会明显偏低（vercel 878） |

---

## 1. 该做的（按优先级）

| ID | 参考做法（谁在做） | 证据 | 我们现状 | 差距 | 适用 | 成本 | 碰红线 | 预期收益（可测） | 优先级 |
|---|---|---|---|---|---|---|---|---|---|
| **G1** ★ | **每条一个独立静态页** | futuretools `/tools/:slug ×40`、toolify `/tool/:slug ×27`、artificialanalysis `/models/:slug ×49`、devtk `/:slug/tools/:slug ×17`、TAAFT `/:slug/:slug ×2795` | **同源内链 1 条、URL 形态 0 种** | 结构性缺失 | 是（构建期生成 `dist/deal/<id>/index.html`） | L | 否 | 可索引 URL 1 → **81**、同源内链 1 → **308**（均已落地实测，超出原估的 ~140） | **P0** |
| **G2** ★ | **紧凑行视图**（表格/行列表） | llm-prices `tr ×160`，行高 45px，**首屏 16 行**；openrouter 行高 47px，**首屏 15 行** | 卡片定高 **192px**，首屏 **9 张** | 更弱（信息量相近，行高 4 倍） | 是（视图切换 + 现有数据，行与卡片同源） | M | 否 | 首屏完整可见 9 → **13**（已落地实测；提案估的 16+ 未把顶栏/筛选条/结果条那 147px 固定 chrome 算进去） | **P0** |
| **G3** ★ | **暗色模式**（显式声明双主题） | vercel `<meta color-scheme="dark light">`；notion `prefers-color-scheme` 规则 1 条；8 个标杆里 4 个默认暗色（linear `theme-color:#08090A`） | `prefers-color-scheme` 规则 **0 条**、无 `color-scheme` meta、body 亮色 | 缺失 | 是（token 层重算，见 DESIGN-TOKENS §1/§6） | M | 否 | 0 → 两套主题；夜间可读性从「白底刺眼」变为可读 | **P0** |
| **G4** | **动效 token 化 + `prefers-reduced-motion`** | 跨站最多的是 `… .15s cubic-bezier(.4,0,.2,1)`（aitools 40 / devtk 52 / futuretools 115 / toolify 40）；linear `.1s cubic-bezier(.25,.46,.45,.94)`×187；raycast `.2s/.4s cubic-bezier(.23,1,.32,1)`×159 | 3 组 ad-hoc：`.13s ease`×62、`.18s cubic-bezier(.34,1.4,.64,1)`×65、`.13s ease`×11；**无 reduced-motion** | 更弱 | 是 | S | 否 | 3 组 → 4 个 token；动效可被系统偏好关闭（可断言） | **P0** |
| **G5** | **对比度治理** | openrouter 最低 5.59、llm-prices 5.13、superhuman 4.85、aitools 4.79 —— **全部 0 条低于要求** | 抽样 400 条中 **100 条低于要求**，最低 **2.84**（`--mut` 在 `--bg` 上；卡片内 3.04） | 更弱，且**可一处修好** | 是（改 `--mut` + 断言） | S | 否 | 低于要求 100 → 目标 ≤20；`verify` 增加对比度断言（现 55 项里 0 项） | **P0** |
| **G6** | **发丝环替代大投影做层级** | linear `rgba(0,0,0,.2) 0 0 0 1px`、vercel `rgba(0,0,0,.08) 0 0 0 1px`、superhuman 同型、notion 10 层微投影 | 卡片 `1px solid var(--line)` + hover `0 6px 18px -12px`（大扩散） | 取向更重 | 是 | S | 否 | 高密度网格里相邻卡片互不压暗；暗色模式下层级仍清晰 | P1 |
| **G7** | **字阶收敛到 3–4 级、只用真实字重** | linear 字阶仅 3 级（16 / 13–14 / 12）；openrouter/artificialanalysis 基准 14px；标杆用分数字重是因为随 Web 字体下发（linear 的 Inter Variable 声明 2878 次） | **12 种字号**（13.5×574、**11×489**、10×69、9×62…）；**假字重 354 处**（650×162、680×124、800×66、750×2） | 更弱 | 是（系统字体没有 550/650/680/750 这些实例，写了会四舍五入） | S | 否 | 12 种 → 6 级；假字重 354 → 0 | P1 |
| **G8** | **每页自带 canonical / 面包屑 / ItemList** | openrouter 结构化数据 5 类（含 `CollectionPage`/`BreadcrumbList`/`ItemList`）；toolify `hreflang` 10 条、devtk 3 条、notion 22 条 | 全站 1 个 URL、4 类 JSON-LD（Organization/BreadcrumbList/FAQPage/ItemList）——**已领先多数同类站**，但**缺 `WebSite` 节点**（devtk.ai 只有 2 类就包含它） | 详情页出现后必须补齐 | 是（随 G1） | M | 否 | 81 个页面各自 canonical + BreadcrumbList；sitemap 1 条 → 81 条 | **P0**（依赖 G1） |
| **G9** | **订阅出口** | futuretools `form=3`、appsumo `form=1`、superhuman `form=0` 但有 newsletter 区块 | 无任何订阅/feed | 缺失 | 是（构建期生成 `feed.xml` + `feed.json`，零依赖） | S | 否 | 新增 2 个静态订阅入口；`<link rel="alternate">` 声明 | P1 |
| **G10** | **纠错 / 反馈入口** | 同类站基本没有（多数只有 contact） | 无 | 缺口即差异点 | 是（预填 `deal.id` 的 GitHub Issue 链接，零 JS） | S | 否 | 62 张卡各有一个「信息有误」入口；与「不卖排序」的诚实性定位一致 | P1 |
| **G11** | **收藏 / 对比** | TAAFT `button=2225`、`aria-pressed=259`、`sticky=41`；ai-bot 有 `/favorites/` 分类 | 无（`button=15`、`tabs=4`） | 缺失 | 是（`localStorage` + 可分享 URL，无后端） | M | 否 | 用户可留存 2–4 条做对比；无 JS 时不出现死按钮（沿用现有降级做法） | P2 |
| **G12** | **空 / 错 / 加载 / 骨架态** | 榜单类站点普遍有骨架屏（本次证据只能看到控件数量，未见可判定的骨架实现） | 有 `.empty` / `.loading` 两个类；错状态只有 `console.error` + 文案 | 部分缺失 | 是 | S | 否 | 4 态齐备且**无 JS 时仍可读**（预渲染正文已在） | P1 |
| **G13** | **语义化骨架与交互状态** | devtk `header=1 nav=2 main=1 section=5 footer=1`；notion `header=4 nav=2 main=1 article=3`；superhuman `header=2 nav=3 main=1 aside=6`；openrouter/TAAFT 大量 `aria-pressed`（50 / 259） | **`header=0 nav=0 main=0`**、`section=1`、`article=62`、`dialog=1`；facet 用 `.f.on` 类名而非 `aria-pressed` | 更弱（语义层面） | 是 | S | 否 | header/nav/main 各 1+；facet 状态可被屏幕阅读器读出；（新增键盘断言） | P1 |
| **G14** | **手机端密度与触控目标** | ai-bot 手机 **29.5 屏** vs 桌面 10.8（2.6×）；free-for-dev 174 屏；TAAFT 手机 4.5 屏（13 项/屏） | 手机 **15 屏**（12670px，1 列 62 卡）；首屏完整可见 3 张 | 中等 | 是（紧凑视图在窄屏同样生效 + 触控目标 ≥44px） | M | 否 | 手机 15 屏 → 目标 ≤12；首屏条目 3 → 5+ | P1 |
| **G15** | **页头/描述里的量化词与品类枚举** | ai-bot title 含「1000+」、description 铺 8 个品类词；toolify 静态正文 22717 字符 | title「…（每日更新）」；description 已枚举 4 类优惠；静态正文 11459 字符 | 大致对齐 | 是（补真实数量词：130 条 / 62 张卡 / 80 条优惠） | S | 否 | 标题与描述带**真实**数字，提升点击率且不夸大 | P2 |
| **G16** ★ | **首页信息架构：从「一种排序打天下」到「按意图切视图」** | TAAFT 一级入口按「任务/受众」组织（`section=14`、`search=21`）；openrouter 提供 `/models`、`/apps`、`/pricing` 多个一级视图 | 一条 facet 栏 + 4 档分带 + 「全部工具」Tab | 取向不同 | 是（新增一级视图，不改数据结构） | L | 否 | 用户按「免费/学生/国内/厂商」直达；首页可同时服务「扫一眼」与「精确找」 | P2 |
| **G17** ★ | **英文覆盖** | stripe `hreflang` **89 条**、notion 22 条、toolify 10 条、devtk 3 条 | `hreflang` 2 条（`zh-CN` + `x-default` 自指） | 结构已预留、内容未做 | 是（详情页 + 英文首页，需人工译文，沿用 `zh` 覆盖层的做法反向） | L | 否 | 打开英文检索入口；但需持续人工维护，成本高 | P2 |
| **G18** | **同页锚点导航**（长页直接跳到某一段） | free-for-dev 同页锚点 **232 条** + 侧栏 `section-link` 59；ai-bot.cn 同页锚点 64 条 | 同页锚点 **0 条**（facet 能筛，但不能「跳到档位 2」） | 缺失 | 是（4 个档位带各给一个 `id`，顶部加一条锚点导航，纯 HTML） | S | 否 | 5.9 屏的页面可直接跳到档位/地区；对键盘与读屏用户同样有效 | P2 |

---

## 2. 明确不学（每条都触红线或与场景冲突）

| 做法 | 谁在做（证据） | 为什么不做 |
|---|---|---|
| 广告与统计外部域 | ai-bot.cn **9 个外部域**（doubleclick/googlesyndication/adtrafficquality + 统计 4 个，75 请求）；appsumo 20 个外部域；superhuman 18 个 | 触碰「浏览器端零依赖、不热链任何第三方」红线；广告栈与「排序与推荐理由不出售」直接冲突 |
| Web 字体 / 图标字体 | linear Inter Variable 声明 2878 次；framer、stripe 同样 | 触碰零外部请求红线；系统字体栈已覆盖中英文 |
| 分数字重（450/510/590） | linear、superhuman、openrouter | 系统字体没有这些实例，写了会四舍五入 —— 写了不生效的字重是自欺 |
| `transition: all .3s ease` | ai-bot.cn 373 次、free-for-dev 59 次 | 把布局属性也纳入过渡；标杆站无一家采用（它们都用显式属性列表） |
| 默认暗色单主题 | linear / framer / raycast / stripe | 我们的卡片承载 30+ 家第三方厂商 logo（多为深色图形、依赖亮底），默认暗色会集体降低可辨识度 |
| 「页面越长 = 内容越多」 | openrouter 112.6 屏、free-for-dev 67.6 屏、artificialanalysis 28.4 屏 | 我们的产品指标是「一屏看到多少条」（现 9 张 / 5.9 屏），不是页面长度 |
| 服务端路由式海量分类页 | ai-bot.cn `/:slug/:slug ×504`、toolify `/category/:slug ×134` | 需要服务端改写/路由；GitHub Pages 静态托管下只能靠构建期生成有限页（G1 已覆盖主要收益） |
| 大投影做层级 | notion（10 层叠加微投影）、部分营销站 | 与 192px 定高高密度网格冲突（相邻卡片互相压暗） |
| 用追踪参数衡量转化 | appsumo / TAAFT 等（`resourceTypes` 里 fetch/xhr 密集） | 无后端、无统计；本项目的诚实性定位不依赖用户行为数据 |

---

## 3. 结论：三套方案的分界

| 方案 | 包含 | 不含 | 预期指标（可验证） |
|---|---|---|---|
| **A 保守**（只动视觉层） | G3 暗色、G4 动效、G5 对比度、G6 发丝环、G7 排版、G12 状态、G13 语义 | G1/G2/G8（不动 IA 与 URL） | 对比度 ≤20 条不达标；动效可关；假字重 0；首屏 9 张不变（**不追密度**） |
| **B 均衡**（推荐） | A + **G1 详情页**、**G2 紧凑视图**、G8 详情页 SEO、G9 feed、G10 纠错、G14 手机端 | G11/G16/G17 | 可索引 URL 81；内链 ~140；首屏 16+（紧凑模式）；手机 ≤12 屏；`verify` 断言 55 → ≥60 |
| **C 进取** | B + G11 收藏对比、G16 首页 IA 重排、G17 英文覆盖 | — | 上面全部 + 英文入口；但 G17 需要**持续人工译文投入**（每个新条目都要译），不是一次性成本 |

> 每套的完整改动面、风险与「不做清单」见 `mockups/v3-*/PLAN.md`（对比页：`mockups/v3/index.html`）。

---

## 4. 落地状态（F 阶段回填）

上表是**研究时点的差距快照**，不改写。这一节记录到目前为此实际落了什么、实测值是多少。
落地在分支上（`feat/visual-token-layer` → `feat/b-extras` → `feat/detail-pages` → `feat/row-view`），
`master` 未合并、未推送。

| 项 | 状态 | 实测 |
|---|---|---|
| G1 独立详情页 | ✅ 已落地 | 80 页；可索引 URL **1 → 81**；同源内链 **1 → 308**；sitemap 1 → 81 条；首页 62 个标题链接改为站内，CTA 仍指官方 |
| G2 紧凑行视图 | ✅ 已落地 | 首屏完整可见 **9 → 13 行**（提案估 16+，未计入 147px 固定 chrome）；桌面页高 5368 → 3978px |
| G3 暗色模式 | ✅ 已落地 | 跟随系统 + 手动三态；暗色对比度抽样 723 节点 **0 条不达标**（最低 5.98） |
| G4 动效 token + reduced-motion | ✅ 已落地 | 3 档时长 + 2 条曲线；`transition: all` 归零；reduced-motion 下仍在动的元素 **0 个** |
| G5 对比度治理 | ✅ 已落地 | 亮色 400 抽样 **100 → 0** 条不达标（最低 2.84 → 4.51） |
| G6 发丝环替代大投影 | ✅ 已落地 | 卡片与列表行的 hover 均改为环 + 微投影 |
| G7 字阶收敛 + 真实字重 | ✅ 大部分 | 假字重 **354 → 0**；**卡片标题刻意保留 14px**（16px 会挤压定高卡片里的优惠文案，属实测偏离） |
| G8 每页 canonical / 面包屑 / JSON-LD | ✅ 已落地 | 80 页各自自指 canonical + `WebPage`/`BreadcrumbList`；**首页补上 `WebSite` 节点**（4 → 5 段） |
| G9 订阅出口 | ✅ 已落地 | `feed.xml`（RSS 2.0）+ `feed.json`（JSON Feed 1.1），各 80 条，构建期断言两份条目数一致 |
| G10 纠错入口 | ✅ 已落地 | 详情里预填 `id`/厂商/官方页的 GitHub Issue 链接；断言校验预填内容与 `rel` |
| G11 收藏 / 对比 | ⬜ 未做（属 C） | — |
| G12 四态齐备 | ✅ 已落地 | 加载失败改为**不覆盖预渲染内容**的提示条 + 重试；空态/骨架态沿用 |
| G13 语义与 aria | ✅ 大部分 | `header/nav/main` 从 0 → 各 1；筛选按钮 **11/11** 带 `aria-pressed`；「弹层关闭后焦点归还」未单独断言 |
| G14 手机端密度 | ✅ 已落地 | 卡片 12775px（15.1 屏）→ 列表 **4659px（5.5 屏）**；390px 无横向溢出 |
| G15 标题/描述量化词 | ⬜ 未做 | — |
| G16 首页按意图重排 | ⬜ 未做（属 C） | — |
| G17 英文覆盖 | ⬜ 未做（属 C，且带持续人工成本） | — |
| G18 同页锚点 | ✅ 已落地 | 4 个档位带带 `id` + 顶部锚点条；非分带排序或列表视图时自动隐藏 |

**总账**：可索引 URL 1 → 81 · 同源内链 1 → 308 · 首屏 9 → 13 · 手机 15.1 → 5.5 屏 ·
对比度不达标 100 → 0 · 断言 55 → **95**。

**与提案的偏差（3 处）**：① 紧凑视图实测 13 行而非 16+；② 卡片标题保留 14px；
③ 散值圆角/旧间距未全量收敛、弹层焦点归还未断言、英文页未做。详见 `docs/DESIGN-RULES.md` 的落地情况一节。
