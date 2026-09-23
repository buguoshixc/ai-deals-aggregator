# 参考站研究：样本、方法、证据索引

**这份研究要回答的问题只有一个**：我们自己的站（AI 优惠聚合器）下一步该改什么、不该改什么，
而且每条结论都要有**能在文件里查到的数字**支撑。

**它不是什么**：不是设计欣赏，不是竞品打分，也不是「别人有所以我们也要有」的清单。
凡是不适用、触碰红线、或与我们的产品目标（一屏看到多少条真实优惠）冲突的做法，都明确写进「不学」一栏。

---

## 1. 方法（可复跑）

**工具**：`scripts/tools/study-site.js`（本次新写，零依赖改动，复用 `playwright-core` + 本机 Edge/Chrome）。
一条命令把一个站拆成四份原始证据：

```bash
node scripts/tools/study-site.js <url> --out=research/_raw/<slug> [--scheme=light|dark] [--proxy=…] [--wait=文案]
```

| 产出 | 内容 |
|---|---|
| `metrics.json` | 结构：页面高度/屏数、主列表组件签名与尺寸、**首屏完整可见条目数**（与 `verify-site.js` 同口径：底边 ≤ 视口底边）、同源链接与 URL 形态聚类、canonical/hreflang/JSON-LD/landmarks、交互控件计数、外部域名与请求数、静态正文长度、**对比度抽样（WCAG，纯色背景近似）** |
| `tokens.json` | 视觉系统的**频次分布**：色值、字阶、行高、字重、圆角、阴影、间距、动效（属性+时长+曲线）、容器宽、栅格 |
| `dom-outline.txt` | 语义骨架 + class 命名频次；语义层级不足 25 行时附「按渲染面积排序的最大 40 个元素」兜底 |
| `shots/*.png` | 桌面首屏 / 桌面整页 / 手机首屏（**不入库**，19 站约 45 MB，可随时重跑） |

**纪律**（都写进了工具注释）：

1. **只读公开页，不做登录态抓取**（与 `scripts/lib/browser.js` 同一条边界）。
2. **遵守 robots.txt**：不允许就退出（`--force` 只在你确认可抓时用）。
3. **不用 `networkidle` 作主等待策略**：这是 2.7 踩过的坑（长轮询 SPA 永远等不到 idle）。
   改为 `domcontentloaded` + `load` 有界等待（8s，超时继续）+ **正文长度水合等待**（连续 1.2s 不变）+
   可选 `--wait=文案`。free-for.dev 实测：正文从 19 字符等到 **209613 字符**，说明这一步不能省。
4. **网络诊断先看出口**（2.13 的教训）：直连超时 ≠ 站点不可达。需要时用 `--proxy=http://127.0.0.1:7890` 重试。

**跑了几轮**：三轮。第一轮暴露了两个工具缺陷（页头容器 >10 子节点时骨架只剩 10 行；单字符文本节点——档位角标那种——
被对比度抽样整类漏掉），都已修复并**重跑全部样本**，本文与各报告的引数均来自修复后的证据。

---

## 2. 样本总表（20 个参考站 + 我们自己）

| 站点 | 类别 | 规模（桌面） | 首屏完整可见 | 独立条目 URL | 对比度不达标 | 报告 |
|---|---|---|---|---|---|---|
| **ai-bot.cn** | 同类·国内导航 | 10.8 屏 / 正文 14125 字 | 17（侧栏）/ 6（卡） | `/:slug/:slug ×504` | 24 / 400 | [vertical/ai-bot.cn.md](vertical/ai-bot.cn.md) |
| **aitools.fyi** | 同类·目录 | 3.3 屏 | 2 / 15 卡 | `/:slug ×54` | **0** / 105 | [vertical/aitools.fyi.md](vertical/aitools.fyi.md) |
| **appsumo.com** | 同类·终身交易 | 2.2 屏 | 3 / 9 卡 | `/:slug/:slug ×69` | 5 / 158 | [vertical/appsumo.com.md](vertical/appsumo.com.md) |
| **artificialanalysis.ai** | 同类·模型分析 | 28.4 屏 | 0 / 18 | `/models/:slug ×49` | 77 / 400 | [vertical/artificialanalysis.ai.md](vertical/artificialanalysis.ai.md) |
| **devtk.ai** | 同类·已对比过 | 3.1 屏 / **请求仅 10** | 0 / 9 | `/:slug/tools/:slug ×17` | 6 / 101 | [vertical/devtk.ai.md](vertical/devtk.ai.md) |
| **free-for-dev** | 同类·免费额度目录 | **67.6 屏 / 正文 209613 字** | 0（h2 组） | 无（同页锚点 232） | **189** / 400 | [vertical/free-for-dev.md](vertical/free-for-dev.md) |
| **futurepedia.io** | 同类·**我们的数据源** | 7.7 屏 | 0 / 26 | `/tool/:slug ×14` | 36 / 142 | [vertical/futurepedia.io.md](vertical/futurepedia.io.md) |
| **futuretools.io** | 同类·**我们的数据源** | 4.5 屏 | 0 / 20 | **`/tools/:slug ×40`** | 5 / 179 | [vertical/futuretools.io.md](vertical/futuretools.io.md) |
| **llm-prices.com** | 同类·**密度与对比度双优** | 8.3 屏 | **16（行高 45px）** | 无（纯工具页） | **0** / 400 | [vertical/llm-prices.com.md](vertical/llm-prices.com.md) |
| **openrouter.ai/models** | 同类·**结构化数据最全** | **112.6 屏** | 15（行高 47px） | `/:slug ×57` | **0** / 254 | [vertical/openrouter.ai.md](vertical/openrouter.ai.md) |
| **theresanaiforthat.com** | 同类·内链最密 | 4.1 屏 | 13 | `/:slug/:slug ×2795` | 2 / 347 | [vertical/theresanaiforthat.com.md](vertical/theresanaiforthat.com.md) |
| **toolify.ai** | 同类·正文最长 | 8.8 屏 / 正文 22717 字 | 6 / 10 | `/tool/:slug ×27` | **204** / 387 | [vertical/toolify.ai.md](vertical/toolify.ai.md) |
| **linear.app** | 标杆·暗色+快反馈 | 11.1 屏 | 7 / 11 | `/:slug ×37` | 66 / 392 | [benchmark/linear.app.md](benchmark/linear.app.md) |
| **vercel.com** | 标杆·**唯一显式双主题** | 5.9 屏 / 静态正文 878 字 | 0 | `/:slug ×75` | 4 / 166 | [benchmark/vercel.com.md](benchmark/vercel.com.md) |
| **stripe.com** | 标杆·国际化结构 | 17.2 屏 | 30 | `/:slug/:slug/:slug ×77` | 15 / 400 | [benchmark/stripe.com.md](benchmark/stripe.com.md) |
| **raycast.com** | 标杆·层级与曲线 | 16.2 屏 | 0 | `/:slug/:slug ×38` | 84 / 168 | [benchmark/raycast.com.md](benchmark/raycast.com.md) |
| **framer.com** | 标杆·纯黑体系 | 11.9 屏 | 0 | `/:slug/:slug ×177` | 25 / 400 | [benchmark/framer.com.md](benchmark/framer.com.md) |
| **superhuman.com** | 标杆·对比度最干净 | 8.2 屏 | 0 | `/:slug ×27` | **0** / 50 | [benchmark/superhuman.com.md](benchmark/superhuman.com.md) |
| **notion.com** | 标杆·跟随系统+微投影 | 5.1 屏 | — | `/:slug ×49` | 12 / 88 | [benchmark/notion.com.md](benchmark/notion.com.md) |
| **thebrowser.company** | 标杆·证据有限 | **1 屏 / 正文 261 字** | — | `/:slug ×2` | 0 / 18 | [benchmark/thebrowser.company.md](benchmark/thebrowser.company.md) |
| **★ 我们自己** | — | **5.9 屏 / 正文 11459 字** | **9** | **0（内链仅 1 条）** | **100** / 400 | [GAP-MATRIX.md](GAP-MATRIX.md) |

> 我们自己的数字同样由 `study-site.js` 量（`research/_raw/ours-baseline/`），密度取 `npm run verify` 的口径（9 张）。
> 因为我们的卡片按档位带不同 class，`study-site` 的「同签名分组」会把我们拆成 4 组，跨站比密度以各站最大组为准。

---

## 3. 剔除与受限清单（不藏坏消息）

| 站点 | 情况 | 处理 |
|---|---|---|
| thebrowser.company | 抓到的是**门页**：1 屏、正文 261 字符、25 请求 | 保留但报告里第 0 节专门写「证据边界」，不据此下结论 |
| toolify.ai | `goto` 30s 超时（有 note），部分内容可能未渲染完 | 保留，报告里标注受限 |
| vercel.com / notion.com / framer.com | 几乎不含语义标签，骨架走「面积兜底」清单 | 骨架一节据此写，已标注方法 |
| appsumo.com / free-for-dev | 页面结构以 div 为主，部分区块语义缺失 | 同上 |
| 视觉评述（原计划 B4） | **已完成**（2026-09-23 补跑）：23 条独立视觉评述全部拿到（20 个参考站 + 3 个自有产物），逐条见 [`VISION-REVIEW.md`](VISION-REVIEW.md) | 首次确因 402 失败；补跑失败的真因是我们把 **provider id 传错**（应为 `deepseek-official`），账号一直是好的。程序化验证仍保留——两条腿都要 |
| 需登录的控制台类页面 | 按项目既有边界，不做登录态抓取 | 从未纳入样本 |

---

## 4. 跨站共性（只写有数字支撑的）

1. **「每条一个独立页」是同类站的默认结构**：12 个同类站里 11 个有路径型条目 URL
   （futuretools `/tools/:slug ×40`、toolify `/tool/:slug ×27`、artificialanalysis `/models/:slug ×49`、
   ai-bot `/:/slug/:slug ×504`、TAAFT `×2795`），**只有我们和 llm-prices 没有**（后者是工具页，不需要）。
2. **对比度不达标是行业常态，但不是借口**：8 个标杆里 5 个有两位数的不达标样本
   （raycast 84、linear 66、framer 25、stripe 15、notion 12），同类站更差（toolify 202、free-for-dev 189）；
   同时有 4 家做到 **0 条不达标**（openrouter、llm-prices、superhuman、aitools.fyi）——说明这件事可做到。
   我们目前 100/400（最低 2.84），处在「同行里偏差」的位置，且根因是一处 token（见 DESIGN-TOKENS §7）。
3. **动效时长集中在 100–300ms，曲线集中在两条**：Tailwind 默认 `150ms cubic-bezier(.4,0,.2,1)`（跨站最多）、
   linear 的 `100ms cubic-bezier(.25,.46,.45,.94)`、stripe 的 `300ms cubic-bezier(.25,1,.5,1)`、
   raycast 的 `cubic-bezier(.23,1,.32,1)`（expo/quint 系）。**没有一家用 `transition: all`**（用 `all` 的是
   ai-bot.cn 373 次与 free-for-dev 59 次这类反面样本）。
4. **暗色是两种流派**：默认暗色单主题（linear/framer/raycast/stripe，都是「产品本身就是暗色 UI」）
   vs 显式声明双主题（**vercel 的 `<meta name="color-scheme" content="dark light">`**）
   / 跟随系统（notion 1 条 `prefers-color-scheme` 规则）。我们的场景（第三方厂商 logo 承载在卡面上）更适合后者。
5. **结构化数据不是同类站的强项**：12 个同类站里 7 个没有或有 1 类 JSON-LD，最全的是 openrouter（5 类）。
   **我们已有的 4 类（Organization/BreadcrumbList/FAQPage/ItemList）已经领先**——这轮要守住，而不是重做。
6. **静态正文长度与「是否预渲染」正相关，与页面长度无关**：toolify 22717 字（预渲染）、free-for-dev 209613 字，
   而 vercel 只有 878 字、notion 2111 字。我们 11459 字，属上游。

---

## 5. 三份产出文档怎么读

| 文档 | 回答什么问题 |
|---|---|
| `EVIDENCE.md` | 21 个站的原始数字总表（机械汇总，只搬运不解释）——任何结论要复核时先查这里 |
| [`DESIGN-TOKENS.md`](DESIGN-TOKENS.md) | 视觉层：我们现有 token ↔ 标杆数值 ↔ 建议值（含暗色两套、动效 token、对比度推导） |
| [`GAP-MATRIX.md`](GAP-MATRIX.md) | 差距矩阵：该做的 18 条（含优先级/成本/是否触红线/预期收益）+ 明确不学的 9 条 |
| `mockups/v3/` | 三套方案的可点开 demo（A 保守 / B 均衡 / C 进取）+ 各自的 `PLAN.md` |

---

## 6. 已知限制

1. ~~**视觉评述缺失**~~ → **已补齐（2026-09-23）**：见 [`VISION-REVIEW.md`](VISION-REVIEW.md)。
   过程如实记录：首次确为 provider 402（余额不足）；充值后仍失败的真因是我们**把 provider id 传错了**
   （应为 `deepseek-official`，不是 `deepseek` / `llm-deepseek`）——用凭据库里的 key 直连 `api.deepseek.com`
   验证过：`GET /v1/models` → 200、`POST /v1/chat/completions` → 200 且正常计费，账号与模型一直是好的。
   视觉复核**自己又带回两条限制**（见 `VISION-REVIEW.md` §2）：
   ① **11 / 108 张截图超过模型的 8192px 单边上限**（最大 `free-for-dev/shots/desktop-full.png` 14.9 MB），
   这些站只读到手机首屏或降采样图，**字号不可细究**；
   ② **整页截图可能是拼接产物**——`openrouter.ai` 的同一屏列表在约 16400 / 32800 / 98400 px 处原样重复、
   之间夹整片纯白，**所以「整页截图高度」≠「真实内容长度」**：凡以页高为口径的跨站比较（含我们自己的
   「首屏 / 手机屏数」对照），遇到这类站都需要用 DOM 高度复核。
   实测补记：这两条限制之外，复核带回来的两条「疑似缺陷」在当前构建上**都不成立**（详见 `VISION-REVIEW.md` §6）。
2. **对比度是近似值**：只算纯色背景，渐变/图片背景样本被跳过（各站跳过数量记录在
   `skippedForComplexBackground`，raycast 跳过 219 条、linear 95 条，跨站比较时以「不达标条数」为主）。
3. **单次抓取快照**：所有数字是某一时刻的渲染结果，站点改版即失效；重跑同一条命令即可刷新。
4. **样本是人工挑选的**：12 个同类站 + 8 个标杆，不是穷举。搜索引擎不可用（同一 provider 402），
   样本扩展依赖种子清单与出站链接，因此**不声称覆盖了全部同类站**。
