# T22 · 门禁侧 Self-Audit（独立探针 / 四轮对照 / 数字抽查 / 残余盲区）

- **标的**：`scripts/tools/verify-site.js` §22c，sha256 前缀 **`fd3c9a3090dca11b`**（510,535 B / 7,926 行；t19 round-4 版本，本轮复核期间未变）
- **前置**：t20 复审 round 4 `verdict=pass`。**本报告不复用 t20 的读数**：下面每一个数字都是我用**自己的探针**或对**原始 JSON 字段**重算出来的；凡引用了盘上已有报告的地方都显式标注「旁证（他人跑的）」。
- **零写入**：`dist/` `dist.baseline/` `scripts/**` 一个字节未动（注入全部在浏览器内存里；scratch 只用来说明最小复现命令，本轮未建）。
- **一句话结论**：四轮口径的覆盖面对照已独立复算；**与判据结果逐条对账零差异**（baseline 156 条/48 页、dist 0 条/0 页，`onlyMine`/`onlyJudge` 均空、与 truth-401 双向零差集）；10 个违规码里 **9 个由我的探针实测产出**、1 个（`unclassified-layout`）是注册表结构码并给出最小复现命令；**17 处报告数字抽查 15 一致 / 2 差异**（两处都是我探针的列宽基准与报告口径不同，判定结论不受影响）；**≤760 媒体查询盲区确已闭合**（我实测 6 条、键集合与 t20 报告逐条相同）；**360 不判逐行字迹的理由成立**（列宽 328 < 现场 70ch 452.81，且同一批 156 条缺陷在 360 档四条轮次全 0）。**另发现 1 条新的假绿面**（`font-size: 0` 把盒高压成 0 ⇒ 整条被登记为 unrendered ⇒ 三条判据全不判、零码），已在 §7 给出最小复现与修法建议。

---

## 1. 方法与独立性

| 项 | 做法 |
| --- | --- |
| 探针 | `verify/layout-probe.cjs`（v2）：**只 require `playwright-core` + `fs`/`http`/`path`**；**不 require `scripts/tools/verify-site.js`**，**不 require `scripts/lib/page-kinds.js`**（连「有哪些布局族」都不查） |
| 自定义 | 目录枚举 · 静态服务器 · 「主数据区 = `<main>` 里最宽的数据型块级容器」 · 「页面列 = min(主数据区, `<main>`)」 · 「70ch 现场尺子」 · 「Range 字形盒按 top 归并为行」 · 违规定义 · 报告结构 |
| 判据口径（**只与门禁共享约定，不共享实现**） | 阈值 0.85、轴容差 max(1px, 5%×列宽)、`lineCount ≥ 2`、现场 70ch 前置条件 |
| 与判据对账 | 拿**门禁自己跑出来的原始 JSON**（`teeth/_scratch/r4-m0.json` / `r4-green.json`）与我的 R4 键集合**逐条**比 |
| 注入 | `--inject=forms.json`（CSS，内存注入）+ `--js=js.json`（DOM 注入：删 `<main>` / 加减 `detail-main`），**零写盘** |

三次读数轮（全部落盘）：

| 轮 | 命令（要点） | 用途 |
| --- | --- | --- |
| before | `--dir=dist.baseline --out=…/probe-r4-before.json` | 缺陷面：156 条/48 页 |
| after | `--dir=dist --out=…/probe-r4-after.json` | 修复面：0 条/0 页 |
| forms | `--inject=forms-r4.json --routes=…` | 四轮对照（8 种注入形态 × 5 档） |
| reach | `--inject=forms-reach-r4.json --js=js-reach-r4.json --routes=…` | 违规码可达性（10 码逐条） |

---

## 2. 与判据结果逐条对账（验收 ①）

| 方向 | 我的独立探针（R4@1440） | 判据报告（原始 JSON） | 逐条差集 |
| --- | --- | --- | --- |
| `dist.baseline` | **156 条 / 48 页** | `r4-m0.json`：848 项 / 失败 33 · 并集 **156 条 / 48 页** | `onlyMine=[]` · `onlyJudge=[]` · `same=true` |
| `dist` | **0 条 / 0 页** | `r4-green.json`：848 项 / 失败 0 · 并集 **0 条 / 0 页** | `onlyMine=[]` · `onlyJudge=[]` · `same=true` |
| `geometry/truth-401.json` | baseline 侧 | 156 条（`caughtByOldCriteria ∪ onlyNewTruth`）/ 48 页 | `onlyMine=[]` · `onlyTruth=[]`；`alreadyFine` 误报 **0** |
| dist 侧 | 0 条 | truth 窄集合 156 条 | 误报 **0** |

配套统计（我的探针）：186 路由 · **401 条**说明 · 有说明的页 **105** · 零说明 **81** · 未渲染 **1**（`plans/coding/#1` 的 `<noscript>` 条）· 390 档横向溢出 **0** 页 · 四个档位（1440/1600/760/360）说明条数一致。

---

## 3. 四轮对照（验收 ③）

### 3.1 两个产物上（我的探针读数，条/页）

| 产物 | @1440 | @1600 | @760 | @360 |
| --- | --- | --- | --- | --- |
| `dist.baseline` | R1 **156/48** · R2 **156/48** · R3 **156/48** · R4 **156/48** | 同 @1440 | 同 @1440 | R1..R4 **0/0** |
| `dist` | R1..R4 **0/0** | 0/0 | 0/0 | 0/0 |

页面列（我的 border-box 基准）：@1440 **1120–1380** · @1600 **1120–1380** · @760 **728–728** · @360 **328–328**；现场 70ch = **452.81px**。

> 读法：**在两个产物上，四轮给出同一组数字**——因为缺陷形态（70ch 盒宽/内容盒）同时满足四轮的每一支。四轮的差别只在**注入形态**上显形（下表）。

### 3.2 注入形态上（8 种形态，逐档给数；✓=咬中，✗=漏）

| 注入形态（路由） | @1440 R1/R2/R3/R4 | @760 R1/R2/R3/R4 | @360 R1/R2/R3/R4 | 谁漏了 |
| --- | --- | --- | --- | --- |
| `.snote{max-width:70ch}`（`status/`） | 2/2/2/2 | 2/2/2/2 | 0/0/0/0 | — （@360 无物理效果：70ch > 列宽） |
| `.snote{padding-right:calc(100% - 70ch)}`（`feeds/`）F1 原型 | **0**/8/8/8 | 0/8/8/8 | 0/0/0/0 | **R1 漏**（盒宽满宽） |
| `.snote{display:grid;grid-template-columns:minmax(0,70ch) 1fr}`（`student/`） | **0**/**0**/3/3 | 0/0/3/3 | 0/2/2/2 | **R1、R2 漏**（文字是直接文本节点，盒/内容盒都满宽） |
| 同上形态包进 `@media (max-width:760px)`（`changes/`） | 0/0/0/0 | **0/0/0/6** | 0/0/0/0 | **R3 在 760 漏**（旧口径的视口白名单）、@1440 正确地不判 |
| `.snote{display:grid;grid-template-columns:200px 1fr}`（`plans/`） | 0/6/10/10 | 0/8/8/10 | 0/8/8/8 | R1 漏；@360 有 2 条 ink-only 残余（见 §7.3） |
| `.snote{transform:scaleX(0.35)}`（`vendor/ai360/`） | 3/**0**/1/1 | 3/0/0/2 | 3/0/0/0 | **R2 漏**（clientWidth 不变）；R1 因 `getBoundingClientRect` 含变换而咬中 |
| `.snote{white-space:nowrap}`（`need/free-tier/`） | 0/0/0/0（最宽一行 2470px） | 0/0/0/0 | 0/0/0/0 | 四条都不判**而且不该判**；命中 `note-clipped` + `page-overflow@*` |
| `.snote{font-size:0}`（`docs/data/` · `plans/`） | **0/0/0/0** | 0/0/0/0 | 0/0/0/0 | **四条全漏**（盒高 0 ⇒ unrendered）→ 见 §7.4 新发现 |

**每轮「能咬中什么、漏什么」（只给数，不替门禁下结论）**

- **R1（border-box）**：咬「盒宽被压窄」；漏 **padding 挤压**（F1 原型）与**行内轨收窄**（盒宽不动）。
- **R2（内容盒 textWidth）**：补上 padding / 内层块级容器两类；漏「文字是直接文本节点、被 grid/flex 轨排窄」这一类（`student/` 形态）。
- **R3（R2 ∪ 逐行字迹，桌面档白名单）**：补上 grid 轨一类（@1440/1600 判）；漏 **≤760 的媒体查询形态**（@760 该档不判）。
- **R4（R2 ∪ 逐行字迹，物理前置条件 `列宽 > 现场 70ch`）**：760 档补齐（`changes/` @760 从 R3 的 0 条 → **6 条**）；@360 按前置条件不判逐行字迹（理由见 §7.2）。

---

## 4. 违规码可达性 self-audit（验收 ②）

10 个码（源码 `verify-site.js:6215-6217`，我数出来就是 10 个）逐个给**注入形态 + 我的探针证据 + 最小复现命令**。「盘上旁证」= 已有报告里出现过该码（**他人跑的**，只作旁证）。

| 码 | 注入形态 | 我的探针实测到它的位置 | 盘上旁证 | 最小复现命令 |
| --- | --- | --- | --- | --- |
| `note-narrow` | `.snote{max-width:70ch}`（或 padding 挤压） | `status/`·`changes/`·`feeds/`·`vendor/ai360/` @1440/1600/760（4 页） | ✅ 有 | `node …/layout-probe.cjs --dir=dist --inject=…/forms-reach-r4.json --routes='changes/,status/' --out=…/p.json` |
| `note-ink-narrow` | `.snote{display:grid;grid-template-columns:minmax(0,70ch) 1fr}` | `feeds/`·`student/`·`plans/`·`changes/@760`（4 页，含 @360 也量到字形盒） | ✅ 有 | 同上，`--routes='feeds/,changes/'`（@760 见 §7.1） |
| `note-hidden-text` | **M12 原型的逐字规则**（`font-size:0` + `::before{content;display:block;max-width:70ch;font-size:var(--fs-sm);line-height:1.7}`） | `student/`：rendered=true ×3 · glyphRects=0 ×3 · **3 条码**；另 `docs/data/`（`font-size:0;min-height:24px`）也命中 | ✅ 有 | `--inject=…/forms-reach-r4.json --routes='student/,docs/data/'` |
| `note-axis` | `.snote{transform:scaleX(0.35);transform-origin:left center}` | `vendor/ai360/`·`plans/` @1440/1600/760/360（2 页） | ✅ 有 | `--inject=…/forms-reach-r4.json --routes='vendor/ai360/'` |
| `note-clipped` | `.snote{white-space:nowrap}` | `need/free-tier/`（scrollW 2470 > clientW） | ✅ 有 | `--inject=…/forms-reach-r4.json --routes='need/free-tier/'` |
| `page-overflow@<vw>` | 同上（nowrap 把页面撑宽） | `need/free-tier/` 在 **390/760/1440/1600 四档全命中**（我探针另量 360） | ✅ 有 | 同上（不带 `--viewports` 即全档） |
| `data-region-missing` | `document.querySelector('main').remove()` | `developer/`（JS 注入轮） | — | `--js=…/js-reach-r4.json --routes='developer/'` |
| `missing-detail-main` | `main.detail-main` 去掉 `detail-main` | `models/360zhinao-pro/`（detail 族） | — | `--js=…/js-reach-r4.json --routes='models/360zhinao-pro/'` |
| `unexpected-detail-main` | 给 wide 族的 `<main>` 加 `detail-main` | `category/` | ✅ 有（M7 类） | `--js=…/js-reach-r4.json --routes='category/'` |
| `unclassified-layout` | 产物目录里新增一个**未登记路由**目录（route→kind 解析不出来） | **按构造不产出**：该码要求 `route→kind` 注册表，而本任务禁止 require `page-kinds.js` | — | scratch 目录加 `unknown-family/index.html` 后 `node scripts/tools/verify-site.js --dir=<scratch> --json=out.json`，看 `metrics.layoutViolations[].codes`（源码分支：`wideProblems()` ①，`meta.kind/meta.family` 为空时 push） |

**存在性扫描（旁证，全量）**：把 `review/runs/**` 与 `teeth/_scratch/**` 的 JSON（<4MB，共 60+ 份）扫了一遍：**除 `unclassified-layout` 外，其余 9 个码都在至少一份盘上报告里真实出现过**；`unclassified-layout` 在所有真实产物上都是 0（它只在「新页面没登记布局族」时才会红），所以它**只能靠 scratch 复现**——这不是「无产出码」，而是「本轮没有它的触发产物」。

---

## 5. 报告数字抽查（验收 ④，≥10 处 → 实做 **17 处**）

差异处已附**文件 + 行号**。完整机器可读表：`verify/t22-analysis.json` → `numbers`。

| # | 数字 | 报告值（出处） | 我方实测值 | 判定 |
| --- | --- | --- | --- | --- |
| N01 | 70ch 现场换算 | 452.81px（`T19-ROUND4.md:48,54-57` · `report.md:119`） | **452.81px**（4 档全一致） | 一致 |
| N02 | @1440 页面列 | 1120–1380（`T19-ROUND4.md:54`） | **1120–1380** | 一致 |
| N03 | @1600 页面列 | 1120–1380（`T19-ROUND4.md:55`） | **1120–1380** | 一致（注：源码注释 `verify-site.js:6562` 写的是「1600 列 1240–1500」，与报告/实测都不符 → 见 §8 F3） |
| N04 | @760 页面列 | 676–728（`T19-ROUND4.md:56` · `T20-ROUND4.md:55,66`） | **728–728**（border-box 基准） | **差异**：676 一侧是 `plans/` 的 `.pchglist` **内容盒**基准（T20 自述）。判定不受影响（676 与 728 都 > 452.81） |
| N05 | @360 页面列 | 276–328（`T19-ROUND4.md:57` · `T20-ROUND4.md:66`） | **328–328** | **差异**：同上基准差异。判定不受影响（都 < 452.81 ⇒ 不判） |
| N06 | round-4 断言数 | 848（`T19-ROUND4.md:17,18` · `T20-ROUND4.md:79`） | `r4-green.json total=848` · `r4-m0.json total=848` | 一致（另：静态 `check(` 计数 481；round-3 的 dist 是 **854** → 见 §8 F4） |
| N07 | baseline 失败数 | 33（`T19-ROUND4.md:18`） | `r4-m0.json failed=33` | 一致 |
| N08 | 窄柱并集(baseline) | 156 条 / 48 页（`T19-ROUND4.md:18,101` · `T20-ROUND4.md:96`） | 我的 R4 = **156/48**；`r4-m0.json` 并集 = **156** | 一致（逐条相同） |
| N09 | ① 里 48 单行 / ② 108 多行 | 156（其中 48 单行）· ② 108 多行（`T19-ROUND4.md:101-102`） | **单行 48 · 多行 108** | 一致 |
| N10 | 「单行且窄字迹」条数 | 319（`verify-site.js:6597`，t19 把旧注释 89 复算为 319） | **@1440 319 · @1600 319** | 一致 |
| N11 | 说明条数 / 有说明页数 | 401 / 105（`report.md:95,112`） | **401 / 105** | 一致 |
| N12 | 旧口径覆盖率 | 26.2%（`report.md:23,112-113`） | 26.2%（105÷401） | 一致 |
| N13 | grid760 在 760 档咬中条数 | 6 条 `note-ink-narrow`（`T20-ROUND4.md:33`） | **6 条**，且键集合与报告逐条相同 `[changes/#0 #1 #2 #4 #8 #12]` | 一致 |
| N14 | 违规码词表 | 10 个（`verify-site.js:6215-6217`） | **10 个** | 一致 |
| N15 | §22c 导航次数 | 630（`T19-ROUND4.md` 成本行） | `r4-green.json metrics.layoutScan.navigations = 630` | 一致（原始字段） |
| N16 | dist 整轮 | 848 项 / 失败 0（`T19-ROUND4.md:17`） | `r4-green.json failed=0` | 一致 |
| N17 | round-3 的 dist（对照项） | 报告未提 | `review/runs/r3-green.json` = **854 项 / 失败 0** | 观察项（见 §8 F4） |

---

## 6. 残余盲区判定（验收 ⑤）

### 6.1 ≤760 的媒体查询限定窄化：**已闭合**
形态：`@media (max-width:760px){.snote{display:grid;grid-template-columns:minmax(0,70ch) 1fr}}`（只注入 `changes/`）。
我的读数：@760 `changes/` 13 条说明里 **R3 = 0 条（旧口径漏）→ R4 = 6 条**，命中键 `[changes/#0 #1 #2 #4 #8 #12]`，最宽一行分别 445.05/445.09/432/444/444/444.23px（阈值 0.85×728=618.8）；`inkScopeOn=true`（728 > 452.81）。@1440 该形态物理上不生效（`maxWidestLine 972.23`）⇒ R4 正确地 0 条，无假红。
**键集合与 t20 报告的 6 条逐条相同**（`T20-ROUND4.md:33`），但这是我自己的注入/量测跑出来的，不是引用它的结论。

### 6.2 @360 不判逐行字迹的理由：**对 70ch 家族成立**
- 现场 70ch = **452.81px**（我的尺子），@360 页面列 = **328px** ⇒ `328 < 452.81`，**70ch 级的收窄在 @360 物理上不可能发生**（70ch 的盒子比列还宽，`max-width:70ch` 不起作用）。
- 实证：`dist.baseline` 上同一批缺陷页面在 @360 的四条轮次**全部 0 条**（156 → 0）；`status/` 注入 `max-width:70ch` 在 @360 也是 0 条（盒宽=328=列宽）。
- 所以「@360 不判逐行字迹」对**它要防的那一类缺陷**是成立的，不是放行。

### 6.3 但物理前置条件之外仍有**被量化的域外残余**（low，非阻塞）
`plans/` 注入 `grid-template-columns:200px 1fr`（比 70ch 更窄的轨）时，@360：12 条里 **8 条**被 ①（内容盒）咬中，但 **2 条**（`plans/#0`、`plans/#2`，最宽一行 192.23 / 192.67px，内容盒 328 / 302px）**任何一轮都不判**（② 因 `328 < 452.81` 不适用，① 因内容盒 ≥ 0.85×328=278.8 不判）。@1440 同样这 2 条会被 ② 咬中（`inkOnly` 4 条中的 2 条）。
**性质**：域外（不是 70ch 家族）、需要「比 70ch 还窄的轨 + 直接文本节点」才会出现；页级断言仍由同页被 ① 咬中的 8 条兜红。修法可选：把物理前置条件的尺子从「70ch」放宽到「0.85×列宽 以下的最小可排宽度」或对 `lineCount ≥ 2` 的说明额外要求「最宽一行 ≥ 0.85×min(列宽, 现场 70ch)」。

### 6.4 **新发现的假绿面：`font-size:0` 把盒高压成 0 ⇒ 整条变成「未渲染」**（medium，建议修）
- 形态与读数（我的两轮注入，均为**裸** `font-size:0`）：`docs/data/` 9 条（forms 轮）/ `plans/` 12 条（reach 轮）⇒ **全部 rendered=false**、`glyphRects=0`、`textLength>0`（`plans/` 最长 121 字）、**该页零码**。`dist` 上原本只有 **1 条**未渲染说明（`plans/coding/#1` 的 `<noscript>` 条）。`metrics.unrenderedNotes` 只是 metric：我逐条查过源码，**没有任何断言引用它**（`check(` 与 `unrenderedNotes` 无交集），日志里只多出一句「未渲染 N 条」。
- 机制（对齐源码）：① 需 `rendered`（`verify-site.js:6590-6591`）· ② 需 `rendered || glyphRects>0`（6607）· ③ 需 `rendered`（6614）⇒ 三条全不判；`unrendered` 是**有意的**放行面（为 `<noscript>` 那种真·未渲染说明），但这个形态让正文**肉眼消失**却不落在任何一条里。
- 与 M12 原型的关系（同一轮实测）：**逐字采用 M12 的规则**（`font-size:0` + `::before{content;display:block;max-width:70ch;font-size:var(--fs-sm);line-height:1.7}`）时，我的探针在 `student/` 量到 `rendered=true ×3 / glyphRects=0 ×3` ⇒ **`note-hidden-text` 正常命中 3 条** —— 也就是说：**带高度恢复器的原型被咬住，去掉高度恢复器的变体反而全绿**。
- 最小复现：`node …/layout-probe.cjs --dir=dist --inject=…/forms-reach-r4.json --routes='plans/,docs/data/' --out=…/p.json`（`plans/` 那一条就是 bare 形态）。
- 修法建议（二选一，都很小）：① 给「未渲染」加**判据**：`rendered=false && textLength>0` 且**不是** `<noscript>` 子树（`el.querySelector('noscript')` 为 null）时，判 `note-hidden-text`（或新增 `note-unrendered-text`）；② 给 `unrenderedNotes` 加**上界断言**（例如 ≤ 已知的 1 条 `<noscript>`），任何新增的未渲染说明立即红。

---

## 7. 发现分级

| 级别 | 条目 | 说明 |
| --- | --- | --- |
| **F1 · medium（建议修）** | `font-size:0` 之类把盒高压成 0 的藏字变体是**假绿面**（§6.4） | 判据对「带高度恢复器的伪元素藏字」有效，对「裸 font-size:0」全绿；最小复现与两条修法建议已给。**不阻塞本次版本的发布判定**（产物里没有产出该形态的构建路径），但它是 `note-hidden-text` 这条牙的**半闭合**。 |
| **F2 · low** | @360 域外残余：比 70ch 更窄的轨 + 直接文本节点 ⇒ 2/12 条无判定（§6.3） | 域外形态，页级断言仍有兜底。 |
| **F3 · low** | 源码注释 `verify-site.js:6562` 写「@1600 列 1240–1500」，与报告和我实测的 **1120–1380** 都不符 | 纯注释口径过时（不影响判定）；建议随下一轮注释订正。 |
| **F4 · info** | 断言总数会随轮次漂移：round-3 的 dist = **854**，round-4 = **848**（`review/runs/r3-green.json` vs `teeth/_scratch/r4-green.json`） | 引用「848」必须带轮次，否则跨轮复核会误判；建议报告里写「本轮 848」。 |
| **F5 · info** | 我的列宽基准（最宽数据容器 border-box）与报告的 676/276 一侧（内容盒/滚动容器）不同 | 已如实登记为 N04/N05 差异；判定结论不受影响。 |

---

## 8. 验收命令与读数

```powershell
# ① 独立探针（round-4 口径，输出对账表）
node research/_raw/secondary-page-layout-unification/verify/layout-probe.cjs --dir=dist.baseline --out=research/_raw/secondary-page-layout-unification/verify/probe-r4-before.json
node research/_raw/secondary-page-layout-unification/verify/layout-probe.cjs --dir=dist           --out=research/_raw/secondary-page-layout-unification/verify/probe-r4-after.json
# ② 四轮对照 + 可达性 + 数字抽查（node-only）
node research/_raw/secondary-page-layout-unification/verify/t22-analyze.cjs
# ③ CI 口径
node scripts/tools/check-ci-consistency.js --expect-checks=38
```

| 命令 | 退出码 | 关键读数 |
| --- | --- | --- |
| `layout-probe.cjs --dir=dist.baseline` | 0 | 186 路由 / 401 条 / 156 条 48 页（四轮同）/ `vs 判据 r4-m0.json 相同=true` / `vs truth-401 same=true` |
| `layout-probe.cjs --dir=dist` | 0 | 401 条 / **0 条 0 页** / `vs 判据 r4-green.json 相同=true` |
| `layout-probe.cjs --inject=forms-r4.json …` | 0 | 8 形态 × 5 档四轮读数（§3.2） |
| `layout-probe.cjs --inject=forms-reach-r4.json --js=js-reach-r4.json …` | 0 | 10 码里 9 码实测产出 |
| `t22-analyze.cjs` | 0 | 四轮表 / 可达性表 / 17 处数字（15 一致、2 差异 N04/N05） |
| `check-ci-consistency.js --expect-checks=38` | **0** | **「✅ CI 口径检查 38 项，失败 0 项」**（实跑 37 条 + 看门狗自身 = 38） |

---

## 9. 证据索引（全部在 `research/_raw/secondary-page-layout-unification/verify/`）

| 文件 | 内容 |
| --- | --- |
| `layout-probe.cjs` | 独立探针 v2（round-4 口径 + 四轮 + 注入 + 自产违规码） |
| `probe-r4-before.json` / `.log` | `dist.baseline` 全站读数（156/48） |
| `probe-r4-after.json` / `.log` | `dist` 全站读数（0/0） |
| `probe-r4-forms.json` / `.log` | 8 种形态 × 5 档四轮覆盖 |
| `probe-r4-reach.json` / `.log` | 可达性注入轮（10 码里 9 码） |
| `forms-r4.json` / `forms-reach-r4.json` / `js-reach-r4.json` | 注入计划（内存注入，零写盘） |
| `t22-analyze.cjs` / `t22-analysis.json` / `.log` | 四轮表 · 可达性表 · 盲区判定 · 17 处数字抽查（机器可读） |
| `t22-ci-check.log` | CI 口径 38/0 的原始输出 |
| （t4 遗留，**已被本报告取代**）`layout-probe.cjs` 旧版日志 `probe-before/after.json` | 旧 round-2/3 口径读数，仅作历史对照，**不作为本报告结论** |

## 10. 诚实清单

1. **没有**跑整轮 `verify-site.js`（浏览器预算按 captain 的口径让给 evidence-runner）：§22c 的 848/33/0/630 等数字我是从**盘上的原始 JSON 字段**与**源码静态计数**复算的，不是本轮新跑；凡属此类都在表里标了出处。
2. 「盘上旁证」栏的报告（`r4-*.json`、`r3-*.json`）是**别人跑出来的**，只用来说明「这个码在真实运行里出现过」，不用来证明判据正确。
3. 我**没有**建 scratch 产物目录、**没有**跑 `--dir=dist.synth-fixed`；`unclassified-layout` 因此只给了最小复现命令与源码分支位置（它需要一个未登记路由的产物）。
4. 我的探针把「页面列」定义为**最宽数据容器的 border-box**，与门禁/报告的 676/276 一侧（内容盒基准）不同 —— 已登记为 N04/N05 差异；两种基准在四个档位都不改变「判/不判」的结论。
5. 所有注入都在浏览器内存/DOM 里完成；`dist/`、`dist.baseline/`、`scripts/**` **零写入**（本报告只写 `verify/**`）。
