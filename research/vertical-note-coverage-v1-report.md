# `vertical-note-coverage-v1` · §22c 的 ② 判据按 `writing-mode` 参数化（闭合 T31 的 P1）

> 分支 `vertical-note-coverage-v1` · 隔离工作树 `.worktrees/vertical-note-coverage-v1`
> 基点 `7ba8102`（= PR #56 合并后的 master）· 判据标的 `scripts/tools/verify-site.js`
> 改前 = 轮 6 冻结版 `2cbc160dc64f8ade513824065b42d8e38ad7c72dd417cb418bde8d5526b44a5e`（522,527 B）
> 改后 = `d82db25c379756d7735a1031d7944041d94df0ad55c338db70a6dc5af8d8c6b2`（577,444 B，`+299 / −49` 两个文件）
> 原始读数：[`research/_raw/vertical-note-coverage-v1/`](_raw/vertical-note-coverage-v1/README.md) ·
> 独立复核：[`research/vertical-note-coverage-v1-self-audit.md`](vertical-note-coverage-v1-self-audit.md) ·
> 规范新增：[`docs/DESIGN-RULES.md`](../docs/DESIGN-RULES.md) **N6**

---

## 1. 这一轮修的是什么（一句话）

**「把二级页说明压成窄柱」这条承诺，在竖排（`writing-mode: vertical-*`）下靠的是运气**：
它唯一的接住机制是「@360 的自裁切副作用 + 那一页恰好在 29 页样本集里」。
这一轮把 §22c 的 ② 判据**按 `writing-mode` 参数化**（横排按**行**、竖排按**列**），
让竖排细条在 **@1440 / @1600 / @760** 三档就被**判据本身**咬中，而不是等某个副作用碰巧触发。

这条 P1 是上一轮（`secondary-page-layout-unification`）**如实登记、明确留给下一轮**的：
`NEXT-STEPS.md` §0 剩余事项 3，证据 `research/_raw/secondary-page-layout-unification/verify/T31-WRITING-MODE.md`，
`requiredFix` 逐字写明「把逐行归并按 `writing-mode` 参数化（竖排按列归并），或对 vertical 条改判
『单字形盒宽 < 0.85 × 列宽』」。**本轮选的是前者**（量出来的判据，不是形态禁令）。

## 2. 关键发现：删掉豁免**也修不好**它（这就是为什么必须换轴）

T31 的形态（逐字）：`.snote { writing-mode: vertical-rl; width: 100%; height: 5.6rem; overflow: hidden; }`

| 环节 | 横排（正常说明） | 竖排（该形态，本轮载体） |
| --- | --- | --- |
| ① 内容盒代理量 `textWidth` | 1369px | **1369px（满宽）⇒ ① 看不见** |
| 字形盒（`Range.getClientRects`） | 每行一个片段 | **每列一个片段**：18 个 16px 宽的竖列 |
| 按**垂直**重叠归并 | 2 行 | **1 行**（18 个竖列垂直方向完全重叠） |
| ② 前置条件「行数 ≥ 2」 | 成立 | **恒不成立** |

⇒ 旧口径的两条判据（① 内容盒 / ② 逐行字迹）**同时静默**，而且**不是**因为那句
「竖排显式不判」的注释 —— 把 `!note.vertical` 删掉，② 照样一条码都不出，因为它的前置条件在竖排下
永远不成立。**修法只能是换轴**：竖排按**水平**重叠归并成竖列，判据量换成「竖列栈覆盖的**水平**范围」
（= 竖排下「字迹在横向铺到哪里」的对应量），前置条件换成「竖列数 ≥ 2」。
① 与 ② 的**语义**因此保持完全一致：**字迹在水平轴上铺到哪里 < 0.85 × min(主数据区宽, 页面列宽) ⇒ 窄。**

这条推理由**三条独立来源**同时给出，读数逐项吻合：
门禁自己（`列 18 / 列栈 362.64px / 行 1 / 内容盒 1369px / 阈值 1173px`）·
T31 的探针（**一字未改**，`columnsV 18 / ink.unionWidth 362.64 / linesH 1`）·
独立复算脚本（只读探针 JSON，两套口径各实现一遍）。

## 3. 改了什么（只动判据，不动产品）

| 文件 | 改动 | 说明 |
| --- | --- | --- |
| `scripts/tools/verify-site.js` | `+299 / −49` | ① `mergeLines` → `mergeAxis(rects, vertical)`（两轴逐字同构：排序键、重叠量、基准、扩张方式一一对应；横排那一路的读数与参数化前**逐位相同**）；② 新增 `mergeColumns` + 每条的 `columns/columnCount/columnSpan` 读数；③ 新增 `wideInkOf(note)`——**轴的唯一取用点**（横排 `lineCount/widestLine`、竖排 `columnCount/columnSpan`），② 与 ⑤ 共用；④ ② 去掉竖排豁免、改读 `inkCount/inkSpan`；⑤ `note-intro-long` 也按同一对量判（竖排下「行」= 竖列）；⑥ 新增变异牙 **M15** + 承重证明 + 正对照；⑦ 判据自检新增「竖排按列判」三条成对断言；⑧ §22c 头注释与 `mutations.json` 口径词典据实改写 |
| `docs/DESIGN-RULES.md` | `+1 / −1`（表格行 + S4 断言列） | 新增 **N6**（按「行」量出来的排版判据必须按 `writing-mode` 参数化）；S4 的断言列补上「参数化后 = 868 项 / 0 失败」 |
| `research/_raw/vertical-note-coverage-v1/**` | 新增 | 配对读数（见 §4）与复跑命令 |

**产品零变化（实测，不是推理）**：判据改动前后，从同一份源码重建 `dist`，
**303 个文件逐个 sha256 全等**、全树摘要 `13b17d0a31cfb358af2f35ef0bb27657dbeca141c019564c5c78c73a822e8c3b` 相同
（`_raw/…/dist-unchanged.json`）。构建路径不读 `verify-site.js`，这里是把它**证明**出来而不是靠它成立。

## 4. 证据：同一批字节上的**配对读数**

装置：把上面的形态 CSS 注入 dist 副本的共享 `<style>`（冻结串规则之后，原串逐字保留）。
对账：`303` 文件 · 与 dist 不同 **1/303**（只 `need/free-api/index.html`）· 冻结串 **1 → 1** · **+85 B** · `dist` 被写 **0** 个。

| 档 | 旧口径：**master 改动前**（本轮基线） | 旧口径：轮 6 冻结 `2cbc160d…` | 本轮口径 |
| --- | --- | --- | --- |
| @1440 逐条（全站 186 页 / 271 条说明） | **✓ 0 码** | **✓ 0 码** —— detail 明写「竖排 1 条」：**看见了但不判** | **✗ `note-ink-narrow` 1 条 / 1 页** |
| @1600 逐条 | **✓ 0 码** | **✓ 0 码** | **✗ `note-ink-narrow` 1 条 / 1 页** |
| @760 样本集 29 页 | **✓ 0 码** | **✓ 0 码** | **✗ `note-ink-narrow`**（`need/free-api/#0`） |
| @360 样本集 | ✗ `note-clipped`（`scrollWidth 375 > clientWidth 325`，**50px**） | ✗ `note-clipped`（同一条、同样 50px） | ✗ `note-clipped`（同一条、同样 50px） |
| 整轮读数 | **862 项 / 失败 1**（唯一那条就是 @360 的 `note-clipped`） | **852 项 / 失败 10**（其中与逐条判据有关的只有 @360 那一条） | **868 项 / 失败 4** |

* 旧口径那 10 条红里，与「逐条判据」有关的**只有 @360 那一条**；另 9 条是**旧版自己的变异靶页已经失效**
  （`student/` 这个壳在上一轮之后一条 `.snote` 都没有了）——那些红是旧版的问题，不是本形态的证据，如实并列。
  所以配对证据的**主读数**用的是 **master 改动前那一版**（`862/1`）：它与本轮的判据在**同一批字节**上跑，
  失败项只差三档新出的 `note-ink-narrow`。
* **交付物原样**（`--dir=dist`）：**868 项 / 失败 0**（同一份 dist 在改判据之前是 **862 项 / 失败 0**）。
* 探针逐档（**未经改动的 T31 脚本**）：竖排 5 档全部 `行 1`、`列 18`、`列栈 362.64px`、`内容盒 1369/717/347/317px`；
  阈值 1173 / 1173 / 618.8 / 304.3 / 278.8 ⇒ **1440/1600/760 咬中，390/360 由物理前置条件自动不判**（那一档仍由 `note-clipped` 接住）。
* 同页**未注入**时：5 档 **行 2/2/2/5/5**、**0 码** ⇒「修复后的产物本来是对的」这一次也逐档量过。

## 5. 变异牙（进 CI 的常驻牙）

`§22c M15`（形态逐字取 T31 的 `FORM_CSS`，与 adversary 的 `form.injection` 同字节）：

| 断言 | 实测 |
| --- | --- |
| 锚点唯一（反空洞守卫） | 锚点出现 1 次 ✓ |
| 变异后必须出 `note-ink-narrow` | 实测 `[note-ink-narrow, note-intro-long]` ✓ |
| **承重证明** | `note-ink-narrow 1 条 [need/free-api/#0]` · `#0 vertical-rl 列 18 / 列栈 362.64px / 行 1（最宽 362.64px）/ 内容盒 1369px / 字形盒 22` · `列宽 1380px · 阈值 1173px` · `note-narrow 0 条`（① 也看不见）· **盒宽与注入前一致 true** ✓ |
| 正对照（不注入 ⇒ 干净） | `need/free-api/@1440 说明 1 条（竖排 0）违规码 [无]` ✓ |
| 竖排适用范围自检（三条） | `列栈铺不开（24 列 / 342.25px）⇒ [note-ink-narrow]` · `铺满（80 列 / 1300px ≥ 1173px）⇒ []` · `只有 1 列 ⇒ []` ✓ |
| `note-intro-long` 也按列判 | `introIndexes=[0] ⇒ [note-ink-narrow, note-intro-long]` · 不在 intro 区 ⇒ `[note-ink-narrow]` ✓ |

**这不是「凡竖排必红」**：判据仍然是量出来的 —— 竖列栈铺满列宽（现场换算需 ≥ 73 列 ≈ 366 字）放行、
只有 1 列（没有排版证据，等价于横排里的单行）放行。两条反例都进 CI。

## 6. 全量门禁（本地实跑，2026-10-08）

* **Full Gate**：从 `.github/actions/gate/action.yml` **现读 51 步** ⇒
  **执行 48 · 通过 48 · 失败 0 · 跳过 3（CI 上下文专用）· exit 0 · 249s**（`_raw` 外，Tier-3 日志在 `.arch-v1/vn-full-gate.json`）。
  第 49 步 `verify-site.js` **868 项 / 0 失败**；第 50 步 `--compare` **874 项 / 0 失败**。
* **`npm run check:ci`**：**39 项 / 失败 0**（冻结清单 38 + 看门狗 = 实跑 38，`--expect-checks=39` 未改）。
* **`npm run check:evidence`**：✅ 没有新增的 Tier-3 文件（1283 个已跟踪的全部在清单内）。
* 其余关键自测（Full Gate 内，逐条通过）：`selftest:audience` **205/0** · `selftest:changes` **119/0** ·
  `selftest:seo` 69/0 · `selftest:feeds` 145/0 · `selftest:plans` 264/0 · `selftest:api-plans` 176/0 ·
  `selftest:models` · `selftest:vendor` 57/0 · `selftest:data-docs` 58/0 · `verify:seo` 11/0 ·
  `analytics-selftest` 31/0 · `check:feeds:reproducible`（两次构建逐字节一致）。
* **构建确定性**：重建 `dist` 与改动前**逐文件 sha256 全等**（§3）。

## 7. 发布链（本轮实测读数）

| 环节 | 读数 |
| --- | --- |
| 分支 / 基点 | `vertical-note-coverage-v1`（`5cc1454` 修复 + `bc1f4fc` PR 正文存档）· 基点 `master = 7ba8102` |
| PR | **#57** · `mergedAt 2026-10-08T08:08:43Z` · 合并提交 **`1c02d84b07a05ce11d805ce15aab628b7ffd0d74`**（merge commit） |
| PR 的 `gate` | run **37747214242** → **success**（08:02:26Z → 08:08:24Z）；前一次 run 37747156878 因第二次推送被 GitHub **cancelled**（不是失败） |
| master 的 `gate` | run **37747903611** → **success**（08:08:46Z → 08:13:59Z） |
| `Deploy to GitHub Pages` | run **37747903736** → **success**：`prepublish` / `build` / `deploy` 三个 job 全部 success（08:08:46Z → 08:14:45Z） |
| 线上冒烟 | **PASS**：12 条路由 + `/changes/` 全部 **HTTP 200**，且**线上 HTML 与本地 `dist` 逐字节相同**（sha256 相等）· 每页冻结串恰好 1 次 · 产物里**没有** `writing-mode` 竖排泄漏 · `/changes/` 分栏 7 · 问题 0（`_raw/…/online-smoke.json`，`finishedAt 2026-10-08T08:15:45Z`） |

> 冒烟判据为什么是「逐字节相同」：本轮**只动判据与文档**，产物逐字节未变（§3），
> 所以「线上 = 本地 dist」是这一版能提的**最强**判据；它同时也证明了这次 Deploy 上传的就是同一份产物。

## 8. 如实记录的两条偏差（都不是「已解决」）

1. **T31 的原靶页已经没有承重面**：`category/agent/` 自 `secondary-page-intro-changes-v1` 起
   `<main>` 里**一条 `.snote` 都没有**（目录页首屏说明整层删除）。本轮第一次把 M15 挂在它上面时，
   门禁实测「说明 **0** 条 / 一条码都不出」——**那是变异没有承重面，不是判据失效**。
   处置：靶页换成 `need/free-api/`（别名页；那 1 条说明由 §22c ③b 断言「恰好 1 条」⇒ 承重面**结构性**成立）。
   原靶页的形状仍以 T31 自己的探针 JSON 并列引用（24 列 / 并集 342.25×87.3 / 盒 1380）。
2. **@390 一档在本轮载体上就已自裁切**（20px；T31 原载体要到 @360 才裁 19px）——载体文本长度的差别、
   不是口径差别。两轮的**页面级**溢出都仍是 0（`overflow: hidden` 把溢出留在盒内），
   所以窄档能接住它的仍然只有 `note-clipped`。

## 9. 还没做的（不在本版承诺内）

* **生产环境「最近变化」非空分支的线上证据**（上一轮 DEFERRED）：今天的三份历史日志 **19 条事件全是
  `fields.type = tool`**，deals 侧 deal 型事件 **0 条** ⇒ 仍然没有可采的真实样本。**不造数据**。
* **`.pdetailbody { max-width: 72ch }`**（占单元格 0.3377）：保留。它与 S4 的「窄阅读列必须居中」之间
  的取舍（居中 or 放宽）需要一次**产品侧**改动 + 自己的几何证据，不在「判据参数化」这一版里混做。
* **「判据只认 `.snote` 这个类名」**（换名 / 换容器即隐形）与**两处保留窄宽的机器可读清单**：
  本轮只把「改名 ⇒ 隐形」的**已覆盖面**写清楚（3 条别名页各恰好 1 条的 ③b 断言、M1–M4 四壳必须带说明的
  前置守卫、M15 正对照、每页冻结串恰好 1 次），**没有**新增类名无关的散文普查 —— 那需要构建期产出一份
  「这一页应有多少条说明」的机器可读清单（跨源对账），属独立一轮。
