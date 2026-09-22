# artificialanalysis.ai — AI 模型与 API 供应商的独立基准分析站

抓取：https://artificialanalysis.ai/ · 2026-09-22T16:46:46.815Z · 视口 1440×900 / 390×844

证据：research/_raw/artificialanalysis.ai/{metrics.json,tokens.json,dom-outline.txt}

## 1. 信息架构（12 列栅格、413 buttons 这类结构特征）

- 桌面 12 列栅格 29 处（另 2 列 3 处、3 列 1 处）；容器最大宽 1440px 5 处。
- main 1440×25600；section 14、nav 2、aside 1、footer 1、form 1；article 0、header 0。
- 结构核心是 413 buttons + 66 tabs；body 直接 187 个子节点。
- lg 专属侧栏 aside.hidden.lg:block col-span-2 210×23147（内含 nav 210×298）。
- class 高频：flex 56、items-center 52、transition-colors 50、text-sm 41、gap-2 32。
- 标题 H1×1（684×160）、H2×6、H3×33，无 H4。

## 2. 数据密度（28 屏是怎么组织的）

- 首页 25600px = 28.4 屏；正文 15471 字符；请求 106。
- 资源构成：script 72、link 12、img 9、fetch 7、image 5、other 1。
- 主列表 div.text-left.text-sm ×18，单父节点，宽 536，高恒 298（min=max=298）。
- section.scroll-mt-24 ×11：宽 1162，高 697–6304，中位 1461 — 密度来自长 section 堆叠。
- 水合前后文本同为 15471 字符；1440×900 首屏完整容纳的重复组件为 0。
- 字号 14px 1428 次、16px 1288 次为主；字重只有 400（3069）与 500（143）。

## 3. 筛选与排序（search/select/tabs 计数）

- searchInputs 0、selects 0：没有原生搜索框，也没有下拉选择。
- 筛选/切换由 413 buttons + 66 tabs 承担；全页仅 1 个 form（footer 572×58）。
- relNext 0，无分页；14 个 hash-only 链接负责页内跳转。
- 交互状态类名：transition-colors 50、disabled:opacity-50 22、focus-visible:ring-1 11。
- 可筛维度、默认排序、排序方向与选项集合：证据里看不到。
- 筛选是否纯客户端、是否有 URL 参数持久化：证据里看不到。

## 4. 详情呈现（/models/:slug ×49 的意义）

- /models/:slug ×49 是最大一族（样本 /models/claude-fable-5-1、/models/gpt-6-astra）。
- /:slug/:slug ×45：文章与方法论各自成页（/articles/…、/methodology/intelligence-benchmarking）。
- /:slug ×16（/trends、/optima、/changelog）、/pricing ×2、/login ×2、/about 1、/contact 1。
- 少数形状：/leaderboards/models 1、/image/leaderboard/text-to-image 1、/models/:slug/:slug 1。
- 首页内链 136 条覆盖 10 类 URL 形状；列表项直连详情页，无中间层。
- 详情页内部结构（字段表、图表、元数据）：本次仅抓首页，证据里看不到。

## 5. 信任与诚实性设计

- H1 "Independent analysis of AI"；meta 描述自称 independent benchmarks。
- 方法论独立成页（/methodology/intelligence-benchmarking），另有 /changelog、/about、/contact。
- 更新写进标题与条目：H2 "Intelligence Updated"、"Coding Agent Index Updated"；"Methodology updated · 19 Sept"。
- 榜单带版本号：AA-Briefcase v1.1、"Intelligence Index v4.3 replaces 𝜏³-Ban"。
- 内置读图说明 H3 "How to Read This Chart"；"Open Weights" 单列为对比维度。
- 反向证据：对比度抽样 400 条中 77 条低于要求，最低 2.52（14px），p10 3.03。

## 6. 变现方式

- 可见入口只有两处：/pricing ×2（?source=nav）与 /login ×2。
- 无广告域名：外链域名仅 googletagmanager ×2、analytics.ahrefs.com ×1、google-analytics ×1。
- 无赞助位证据：18 条主列表条目高度完全一致（298px），无差异卡片签名。
- 72 个 script 资源里无第三方广告/结账 SDK 域名；dialog 0。
- 侧栏 aside 宽 210 且内容为 nav（298 高），不是广告位。
- 价格档位、付费墙边界、affiliate 参数：证据里看不到。

## 7. SEO 与结构化数据（结构化数据是 Dataset 这种少见类型，单独写）

- 结构化数据只有一种类型：Dataset（jsonLdTypes = ["Dataset"]）；无 Organization/WebSite/ItemList。
- canonical = https://artificialanalysis.ai；hreflang = []（无多语言标注）。
- title "AI Model & API Providers Analysis | Artificial Analysis"；lang=en；meta description 与 ogImage 齐备。
- 详情 URL 语义化分族：/models/:slug 49 条、/:slug/:slug 45 条 — 49 个模型页是主要索引面。
- relNext 0（无分页序列）；14 个 hash-only 链接不新增可索引 URL。
- 标题层级止于 H3（H1 1、H2 6、H3 33）；main 1、section 14。

## 8. 移动端（40 屏）

- 390×844：pageHeight 34227 = 40.6 屏（桌面 28.4 屏）。
- 正文 14924 字符（桌面 15471）；主列表宽 536→284，条目高 298→298–314。
- section 宽 1162→350；最高 section 10074（桌面 6304）；aside.hidden.lg:block 在 lg 以下隐藏。
- 字号几乎不变：14px 1411、16px 1237、11px 94（桌面 1428 / 1288 / 94）。
- 14 张图片全部懒加载（images 14 = lazyImages 14）。
- 移动端 tokens 仅记录 fontSizes 一组；是否另设颜色/间距变量：证据里看不到。

## 9. 可移植清单：**值得学** / **不适用**

- 值得学：12 列栅格 + 1440px 容器（29 处 12 tracks / 5 处 1440px）。
- 值得学：单一 Dataset JSON-LD + /models/:slug ×49 的语义化详情族。
- 值得学：定高条目 298px ×18、字号只 14/16px 两档主导，样式熵低。
- 值得学：把版本号与日期写进标题（v4.3、v1.1、"Methodology updated · 19 Sept"）。
- 不适用：23147px 的 lg 专属侧栏与 28.4–40.6 屏的滚动深度。
- 不适用：413 buttons + 66 tabs 的客户端筛选体系（无 search/select，渲染 9.7s）。
