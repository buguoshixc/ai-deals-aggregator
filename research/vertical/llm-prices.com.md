# llm-prices.com — 按每百万 token 计价的模型价格计算器（title：LLM pricing calculator）

抓取：https://llm-prices.com/ · 2026-09-22T17:04:20.360Z · 桌面视口 1440×900 / 移动抓取视口 415×899（需求写 390×844，文件里是 415×899，以文件为准）
证据：research/_raw/llm-prices.com/{metrics.json,tokens.json,dom-outline.txt}
截图目录 shots/ 存在，但本次未读图、不描述任何画面。
本文所有数字均取自上述三个文件；文件里查不到的一律写「证据里看不到」。

## 1. 信息架构（无 landmarks 说明了什么）
landmarks 全为 0：header/nav/main/section/article/aside/footer/form/dialog = 0。
无内链（internalLinkCount=0）、无 hash 链接、无详情页（detailUrlPatterns=[]）。
语义只剩标题两级：h1「LLM pricing calculator」300×28、h2「Model prices (per million tokens)」600×28。
面积兜底显示页面由两块组成：div.presets 640×7444、div.calculator 340×7444，外层 div.container 1000px。
结论：它是「单页 + 一表 + 一计算器」，不靠导航树组织信息，靠标题和位置。
对我们的含义：landmarks 缺失不等于结构差——零内链站根本不需要导航骨架。

## 2. 数据密度（45px 行高 → 首屏 16 行，与我们 192px 卡片 → 9 张逐项对比）
重复组件签名 tr：count=160（dom-outline 记 tbody 159 children，两文件差 1，如实并列）。
行高：min 45 / median 45 / max 61 px；宽度 600px；首屏完整可见 16 行，触及 17 行。
算术：1440×900 下 900÷45=20 行为理论上限，实测完整可见 16 行（余下被页头/输入区占用）。
我方对照：卡片定高 192px、首屏 9 张 → 单屏可见条目 9 vs 16，约 1:1.8。
算术：192÷45≈4.3，若同一 900px 视口按 45px 排布可达约 20 行。
可执行结论：密度差来自行高（192 vs 45），不来自数据量；130 条数据在表格形态下约 130×45=5850px，在卡片形态下约 130×192=24960px。
可执行结论：要把首屏条目从 9 提到 16 量级，唯一杠杆是把「每卡一屏信息」压成「每行一条信息」，而不是缩小卡片字号。

## 3. 筛选与排序（selects=0 但有 161 个 button/输入框，说明交互在哪）
selects=0、tabs=0、searchInputs=1、buttons=163。
class 频次给出交互落点：model-name-btn 8、compare-checkbox 8、input-group 6、cost-input-group 3、sort-icon 3。
即：排序靠表头按钮（sort-icon 3），筛选靠 1 个 search-filter 输入框，比较靠 8 个 checkbox。
无下拉框、无 tab 切换：全部交互是页内按钮与输入框，无跳转。
对我们的含义：4 档力度筛选若用 select 也合规；但同类最优站选了「1 输入框 + 表头排序按钮」的更轻形态。
注意：163 个 button 与 160 行同量级，说明按钮密度接近行密度（每行都有可点元素）。

## 4. 详情呈现（内链 0 —— 它是工具而非目录，这对我们的启示）
internalLinkCount=0、hashOnlyLinks=0、detailUrlPatterns=[]、relNext=0。
唯一链接色 rgb(0, 0, 238) 在 textColors 中仅 count=1，即全页几乎无可点跳转。
详情不靠页面承载：行内 model-name-btn（8 个）与 cost-input-group（3 个）承担「看与算」。
结论：它是「工具页」不是「目录页」——数据在表里被消费，不在子页被浏览。
对我们的启示：80 条真实优惠若做独立条目页，是目录形态；同类密度冠军选择了完全相反的形态且内链为 0。
对我们的启示：我们没有条目页却只有 1 条内链——形态上更接近工具页，但卡片布局又在模仿目录页，这是当前的不一致点。

## 5. 信任与诚实性设计
有专门 div.disclaimer：1000×72（dom-outline 面积清单）。
诚实性文本可见于最差对比度样本：「Note: Different models use different tok…」（div，12px，ratio 5.45）。
对比度整体：sampled=400、min=5.13、p10=5.74、median=21、belowRequirement=0、skippedForComplexBackground=0。
最差 5 个样本全部 ≥5.13 且 required=4.5，即 400 抽样中 0 条不达标。
我方对照：400 抽样中 100 条不达标、最低 2.84 —— 同一抽样口径下差距是 0 vs 100。
可执行结论：0 不达标的达成条件是「少色 + 高对比」，其文本色只有 5 种（#000 985、#333 161、#666 120、#777 2、蓝 1），不是靠逐处调色。
注：metrics._note 声明对比度为纯色背景近似值；本页 complex background 样本数为 0。

## 6. 变现方式（外部域名仅 2 个）
externalDomains 只有 2 个：plausible.io（1）、static.cloudflareinsights.com（1）——均为统计，不是广告或跳转。
requestCount=5；resourceTypes：script 2、fetch 1、other 1、xmlhttprequest 1。
images=0、lazyImages=0；radii 以 0px 为主（1099），shadows 仅 3 处；containerMaxWidths 1000px（1 处）。
结论：页面内看不到变现元素（无联盟链接、无赞助位、无广告域）。
对我们的含义：同为垂直站，它可以零变现域运行；我方「不卖排序」红线与这种「零商务外链」形态一致。
证据里看不到：其收入来源、是否有站外合作、是否有赞助内容标注。

## 7. SEO 与内链结构（canonical 缺失但仍可用？如实写）
canonical=null、hreflang=[]、jsonLdTypes=[]、meta.description=null、ogImage=null。
无 relNext（relNext=0）；无内链（0）→ 无内链权重流动、无锚文本结构。
仍可用的部分：lang="en"、viewport 声明 width=device-width, initial-scale=1.0、h1 与 h2 各 1 个且文本明确。
文本量：textLength=5804；水合前 511 → 水合后 5804，说明内容主要由脚本生成。
我方对照：4 段 JSON-LD、canonical/hreflang 齐备 —— 结构化数据上我方明显更强。
如实结论：它缺 canonical、缺结构化数据、缺内链，但页面仍被抓到并作为样本入口（本文件即其证据）。
证据里看不到：其排名、收录量、索引状态、外链情况；不要据本文件推断 SEO 效果好坏。

## 8. 移动端（12.6 屏、行高变化）
移动抓取视口 415×899；pageHeight=11463；scrollScreens=12.8。
桌面 pageHeight=7596、scrollScreens=8.4 → 移动端多出约 4.4 屏。
行高变化：median 45→61px，max 45→109px，min 保持 45px；表格宽度 600→375px。
首屏：fullyVisibleFirstScreen 16→0，touchedFirstScreen 17→1。
结论：表格在窄屏靠换行撑高，单行信息变多但首屏完整行数归零。
我方对照：我方 5.9 屏、首屏 9 张；它在移动端首屏 0 完整行——这是它明确弱于我方的一项。
证据里看不到：移动端是否改用卡片、是否有横向滚动、是否有折叠交互（selects/tabs 均为 0，故非下拉折叠）。

## 9. 可移植清单：**值得学** / **不适用**
值得学：
1. 行式密度：45px 行高、首屏 16 行（我方 192px/9 张）。
2. 对比度纪律：400 抽样 0 条不达标、最低 5.13（我方 100 条不达标、最低 2.84）。
3. 轻交互：1 个搜索框 + 表头排序按钮，selects=0、tabs=0。
4. 少 token：文本色 5 种、字体族 1 个（Arial）、radii 以 0px 为主。
5. 零商务外链：外部域名 2 个且均为统计（plausible.io、static.cloudflareinsights.com）。
不适用：
1. 零内链零详情页（internalLinkCount=0、detailUrlPatterns=[]）：与「目录 + 条目」诉求冲突。
2. 无 canonical / 无 JSON-LD / 无 description：我方这 3 项已齐备，不应回退。
3. 移动端首屏 0 完整行、12.8 屏：不宜照搬。
4. 图片为 0（images=0）：我方如需视觉证据/截图则不可套用。
5. 表格 1000px 定宽容器 + Arial 单字体：属该站风格选择，非普适最优。
证据里看不到：转化率、收入、真实用户行为、A/B 结果；本节仅为形态对照。
