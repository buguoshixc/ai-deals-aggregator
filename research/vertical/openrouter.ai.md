# openrouter.ai/models — 500+ 大模型的比价与对比入口（title：Compare AI Models: Pricing, Context & Benchmarks | OpenRouter）
抓取：https://openrouter.ai/models · 2026-09-22T16:46:23.572Z · 视口 1440×900 / 390×844
证据：research/_raw/openrouter.ai/{metrics.json,tokens.json,dom-outline.txt}

## 1. 信息架构（113 屏长页是怎么组织的）
单页承载全量对比：pageHeight 101711px ÷ 900 = 113 屏，主列表容器高 36→101655px。
语义骨架只有 1 个 main、1 个 section、4 个 nav、1 个 footer；header/article/aside/form/dialog 全为 0。
标题层级：唯一 h1「Models」；18 个 h3 全是筛选项；另 4 个 h3 属页脚。
版式：grid 单轨 40 处、5 轨 1 处；容器上限 1280px 与 2048px 各 1 处。
全页内链 123 条，hash-only 链接 0 条（dom-outline 只记录 nav 骨架与 class 频次）。

## 2. 数据密度（行高 47px、首屏 15 行）
主列表 signature=div，21 个、4 个父级、宽 1425px，高度中位 47px（36–101655px）。
首屏完整可见 15 个、触及 17 个 —— 即首屏 15 行。
另一重复组件（模型卡）15 个、宽 1113px、高 152–184px（中位 152），首屏完整 4、触及 5。
字号仅 4 档：14px×1363、12px×71、16px×57、20px×2；行高 22.75px×1295。
字重 3 档：450×1149、500×312、600×32；正文文本量 8966 字符（桌面）。

## 3. 筛选与排序（search=3、aria-pressed=50）
搜索输入框 3 个；select 下拉 0 个；按钮 126 个。
行为字段 tabs=50；aria-pressed 属性本身在证据里看不到，只有 tabs 计数。
筛选维度来自 18 个 h3：模态、折扣、上下文长度、输入/输出价格、系列、类别、支持参数、可蒸馏、零数据保留、区域内路由、模型年龄、工具调用、非活跃模型、Artificial Analysis、Design Arena、提供商、模型作者。
排序控件证据里看不到（无 sort/order 字段；relNext=0）。

## 4. 详情呈现（/:slug ×57 与 /:slug/:slug ×45）
内链形状：/:slug 57 条（样本 /workspaces、/benchmarks、/chat）；/:slug/:slug 45 条（样本 /anthropic/claude-opus-5.5:batch、/anthropic/claude-opus-5.5、/assemblyai/universal-3-5-pro）。
其余形状：/models 4、/pricing 3、/apps 2、/docs/:slug 2；/about、/blog、/careers、/privacy、/terms、/support 各 1。
模型走两级路径并带 :batch 变体后缀 —— 同一模型可拆出多个 URL。
本页 article=0、dialog=0；详情页自身未被抓取，详情页内的呈现细节证据里看不到。
图片 21 张，其中懒加载 17 张。

## 5. 信任与诚实性设计
对比度抽样 257 处，复杂背景跳过 0，最低 5.79、p10 7.5、中位 7.58，低于要求 0 条（要求均为 4.5）。
最差样本是 12px 折扣标签「50% off / 57% off / 60% off」=5.79，仍高于 4.5。
存在 a.sr-only「Skip to content」跳转链（6.16）。
筛选维度自带诚实语义：Zero data retention、Inactive models、Distillable、In-region routing。
反向信号：prefersColorSchemeRules=0、bodyBgIsDark=false（无暗色）；桌面 load 事件 8s 内未触发（长轮询/埋点）。
请求量 137：script 86、fetch 20、img 14、beacon 2、css 1。

## 6. 变现方式
折扣是显性一等维度：h3「Discounted」，并配 50% off / 57% off / 60% off 的 12px 标签。
meta 自述模式：Compare 500+ LLMs … all through one API（聚合 API 转售）。
转化入口：Sign Up 按钮（对比度 6.16）+ Clerk 登录域（clerk.openrouter.ai 8 条、protect.clerk.com 系 11 条）。
内链 /pricing 3 条、/apps 2 条；具体价格数字与支付流程证据里看不到。

## 7. SEO 与结构化数据（五类 JSON-LD 逐条列出）
五类 JSON-LD：1) Organization 2) WebSite 3) CollectionPage 4) BreadcrumbList 5) ItemList。
CollectionPage 出现在本页类型清单中；跨站唯一性在这三个证据文件里查不到。
canonical 单值 https://openrouter.ai/models；hreflang 为空数组；lang=en-US。
meta description 与 ogImage 均动态生成（dynamic-og 带 pathname/title/description 与 v=2）。
themeColor rgb(255,255,255)、colorScheme=null；viewport 含 minimum-scale=1；relNext=0。
JSON-LD 各节点的字段内容与归属证据里看不到，只有类型清单。

## 8. 移动端（121 屏 —— 如实写这个数字的含义）
121 屏 = pageHeight 102481 ÷ 844；桌面同页 101711 ÷ 900 = 113 屏。
两个像素高度只差 770px，屏数差来自视口矮了 56px，不是内容变多。
文本量：桌面 8966 / 移动 7635 字符；移动主列表 li 卡 14 个、宽 358px（390 的 92%）、高 162–194px（中位 162），首屏完整 3、触及 4。
移动字号仅 4 档：14px×756、16px×29、12px×7、20px×1。
渲染耗时：桌面 29447ms、移动 12085ms；水合前后文本 10477→8966 / 9379→7635。

## 9. 可移植清单：值得学 / 不适用
值得学：① 单页多面筛选（18 组筛选 + 50 tabs + 3 搜索框，1 个 URL 承载 113 屏）；② 五类 JSON-LD 同页共存，CollectionPage 标注列表页（canonical 单值 + hreflang 空也成立）；③ 折扣作一等维度（Discounted + 50/57/60% off 标签，对比 5.79 达标）；④ 密度配方：行高 47px、首屏 15 行、14px 主字号×1363。
不适用：① 113/121 屏长页 + 137 请求 / 86 script（load 8s 未触发）；② Clerk 账号体系（clerk.openrouter.ai 8 + protect.clerk.com 系 11）；③ 5 轨网格 / 2048px 容器 / 21 张图（17 懒加载）。
