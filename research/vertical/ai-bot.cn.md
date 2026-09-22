# ai-bot.cn — AI工具集：1000+ AI 工具的分类导航目录站

抓取：https://ai-bot.cn/ · 2026-09-22T16:29:50.664Z · 视口 1440×900 / 390×844
证据：research/_raw/ai-bot.cn/{metrics.json,tokens.json,dom-outline.txt,shots/}
口径：shots/ 内 3 张截图（desktop-first、desktop-full、mobile-first）未作内容判读；本文数字全部取自两个 JSON 与 dom-outline.txt 的字段。

## 1. 信息架构
landmarks：footer=1、form=1；header=0、nav=0、main=0、section=0、article=0、aside=0、dialog=0。
标题层级只有 1 个 h1（文本「AI工具集」），证据中没有 level≥2 的记录。
dom-outline.txt 共 10 行：body 只展开 17 children，class 频次只给出 3 项（home=1、blog=1、sidebar_no=1）。
主列表（桌面判定）：li.sidebar-item ×17，220×45，parents=1，首屏完整可见 17 / 触达 17。
分类入口块：div.col-2a…tab-card.type-category ×10，219×130，parents=1，首屏完整可见 10。
导航与侧栏的层级关系在 dom-outline 里看不到（该文件未展开子树）。

## 2. 数据密度
桌面 pageHeight=9690px、scrollScreens=10.8；静态正文 textLength=14125 字符。
hydration：textBefore=14125 = textAfter=14125（桌面），手机 13943=13943 —— 正文不依赖 JS 注入。
url-card ×18：203×94，height min=max=median=94（定高），parents=2，首屏完整可见 6 / 触达 12。
io-mx-n2.row ×13：宽 1216px，高 min=282 / max=470，首屏完整可见 0。
分页块 li.nav-item.pagenumber ×8：121×28，首屏完整可见 0。
图片 324 张，lazyImages=0；requestCount=75。

## 3. 筛选与排序
behavior：searchInputs=1、selects=0、tabs=3、buttons=1、stickyElements=0、fixedElements=1。
存在 1 个搜索框；无 select、无可点按钮组（buttons=1）。
facet 计数、排序控件、筛选标签的按钮数量：证据里看不到。
relNext=0（无 rel=next）；分页由 li.nav-item.pagenumber ×8 承担。

## 4. 详情呈现
internalLinkCount=636；hashOnlyLinks=64。
detailUrlPatterns 两种形态：/:slug/:slug ×504、/:slug ×59，路径型内链合计 563。
/:slug/:slug 的三条采样全部是分类页（/favorites/ai-writing-tools/、ai-image-tools/、ai-video-tools/）。
「每条一个独立网址」有 URL 形态支撑，但单条工具详情页的样本在证据里看不到。
636 = 563 路径型 + 64 纯 hash + 9 条未归入上述两类的内链（其形态证据未给出）。

## 5. 信任与诚实性设计
metrics.json 中没有核验标记、更新时间、来源署名、免责声明相关字段。
dom-outline.txt 未展开 footer/form 子树，看不到这些区块的文案。
故：核验与更新时间、来源署名、免责声明 —— 证据里看不到。

## 6. 变现方式
externalDomains 共 9 个域：googleads.g.doubleclick.net=2、pagead2.googlesyndication.com=2、ep1.adtrafficquality.google=1、ep2.adtrafficquality.google=1、hm.baidu.com=2、www.google-analytics.com=1、www.googletagmanager.com=1、lf1-cdn-tos.bytegoofy.com=1、zhanzhang.toutiao.com=1。
广告栈 3 域合计 6 次请求（doubleclick 2 + googlesyndication 2 + adtrafficquality 2）。
统计/站长域 4 个：hm.baidu.com、google-analytics.com、googletagmanager.com、zhanzhang.toutiao.com；另加字节 CDN lf1-cdn-tos.bytegoofy.com。
resourceTypes：img=35、css=14、script=13、link=7、iframe=2、other=2、fetch=1、xmlhttprequest=1；iframe 2 个与广告位形态一致（证据未标注其用途）。
联盟/推广参数（aff、ref、utm 之类）在证据字段里看不到。

## 7. SEO 与内链结构
canonical=null、hreflang=[]、jsonLdTypes=[] —— 三项全缺。
title=「AI工具集官网 | 1000+ AI工具集合，国内外AI工具集导航大全」；lang=zh-CN。
meta.description 有，以「AI工具集官网收录了国内外数百个AI工具…」开头，覆盖写作/图像/视频/音频/编程/音乐/绘画/对话等品类词。
ogImage 有（wp-content/uploads/2023/03/ai-bot-screenshot.png）；colorScheme=null；themeColor=#f9f9f9。
meta.viewport 带 minimum-scale=1.0、maximum-scale=1.0、user-scalable=no。
内链 636 条形态分布：/:slug/:slug=504、/:slug=59、纯 hash=64，其余 9 条未归类。

## 8. 移动端
手机 pageHeight=24935px、scrollScreens=29.5（桌面 9690px / 10.8，约 2.6 倍）。
主列表判定切换为 tab-card.type-category ×10：146×89，首屏完整可见 10。
url-card 在手机为 193×94（桌面 203×94），首屏完整可见 2（桌面 6）。
字号：16px=2413（桌面 2415）、14px=683（桌面 758）、12px=334（与桌面持平）。
桌面存在的 18px(12)、27.6px(3) 在手机消失；手机新增 24px(3)、20px(2)。
正文 textLength=13943（桌面 14125）；渲染耗时 8162ms（桌面 13138ms，桌面 load 事件 8s 内未触发）。

## 9. 可移植清单
**值得学**
1. 卡片定高可验证：url-card ×18 的 height min=max=median=94、宽 203（手机 193）→ 与我们 192px 定高 + overflow:hidden 同构，可作外部佐证。
2. 长 meta.description 铺品类词：description 覆盖写作/图像/视频/音频/编程/音乐/绘画/对话等品类，且 title 内含「1000+」量化词 → 我们 130 条数据可照此写实数量词与品类枚举。
3. 视觉 token 只有少数几档：transition 仅 12 种声明（all 0.3s ease=373、background-color 0.3s ease=323）、shadow 仅 1 种（count=321）、radii 集中在 0px=2856 / 4px=343 / 50%=320、containerMaxWidth=1900px/800px → 我们做暗色与排版层级时按「个位数 token」定标。
**不适用**
1. 9 个外部域（广告 3 域 6 请求、统计 4 域、字节 CDN，requestCount=75）→ 触碰「浏览器端零依赖、不热链 CDN」红线，广告栈与「不卖排序」冲突。
2. 504 条 /:slug/:slug 依赖服务端路由与持续内容流水线 → GitHub Pages 上的单文件 index.html 无法产出 500+ 路径。
3. 视觉基线不可照抄：prefersColorSchemeRules=0、colorScheme=null、bodyBgIsDark=false（无暗色实现）；对比度抽样 400 条中 24 条低于要求，最低 1.05（a.nav-link，14px，要求 4.5），p10=4.69 → 暗色模式与排版层级在证据里无范本可取，只能以 p10=4.69 作自检下限。
