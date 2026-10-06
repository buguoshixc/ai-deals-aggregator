# T6 复审报告 · §22c 门禁的对抗式验证（寻假绿）

- **复审对象**：T2 在 `scripts/tools/verify-site.js` 新增的 §22c（Wide Data Page 页面级说明的同轴门禁 + M1–M7 变异牙），改动形状 `+820 / −0`（两处纯插入：当前 36–38 与 6100–6916）。
- **复审者**：reviewer（T6，独立于 T1/T2/T3）。
- **基线**：`origin/master = 1f225d2`；`dist.baseline` 只读；`dist` 为 T1 构建产物。
- **结论**：**verdict = needs_revision**。§22c 的骨架、反空洞守卫、M0 因果链、`--compare` 回归语义、`metrics` 计数对账**全部达标**；但**判据本身有两处可被稳定绕过**（见 F1/F2），其中一处能让「页面级说明恰好等于改动前的 70ch 窄柱」的产物**整轮 827 项断言全绿**。按 acceptance「任何放行 = blocker finding」，交回 `needs_revision`。

---

## 0. 纪律与不变量（先说没动什么）

| 不变量 | 怎么证的 | 读数 |
| --- | --- | --- |
| `dist.baseline` 未被复审触碰 | 与 T1 的 `baseline/dist-baseline-sha256.txt` 逐条对账 | **303/303 一致 · 不一致 0 · 缺失 0**；树哈希 `544472463130061e…`（`runs/baseline-integrity.txt`） |
| `dist` 未被复审触碰 | 造 scratch 前记录的树哈希 vs 全部实验之后重算 | `c07d48a6eee120278622a6bd…` **前后相同** |
| 生产源码一行未改 | `git diff --numstat` + 逐块重建 | `820 0 scripts/tools/verify-site.js`（0 删除）；其余源码文件未进入本次会话 |
| 对抗构造只在浏览器内存里 | 全部用 `addStyleTag` / `page.evaluate`；需要「产物级」验证时复制到 `review/scratch/**`，从不写 `dist` | `review/scratch/{negative,false-green-c1}` 各由 `make-scratch.cjs` 现造，脚本自带「dist 未被触碰」回执 |
| 浏览器套件一次只跑一个 | 串行执行（见 §5 命令清单） | 7 次套件运行 + 5 次驱动运行，无并发 |

**判据不是「我重写一份」，而是逐字抽取**：`review/adversarial.cjs` 把 `verify-site.js` 的
`const WIDE_TOL = 1;` … `wideProblems()` 结尾（**第 6144–6356 行，213 行**，sha256 `91d295365b40e60c…`）
与 `wideMutate()`（**第 6365–6378 行**，sha256 `b3d6ba24f3b65d41…`）**原样**装进本进程运行 ——
没有第二份判据，也就没有「我测的不是它的判据」这种辩解空间。

---

## 1. 逐条对照 acceptance

### A1「至少构造并实测 3 个『页面看起来仍窄但判据可能放行』的形态」

全部在真浏览器里注入（`student/` `category/` `changes/` `docs/data/`），跑的就是抽取出来的 `wideProblems()`；
另有 5 条**会咬人的正对照**（C0′ 整页压窄 / B1·B2 带 padding 的容器 / C4 无 `<main>` / D1@1600）
证明这套装置不是「对什么都判绿」（不然「全绿」没有意义）。
读数见 `runs/adversarial-dist.json` / `runs/adversarial-dist.log`。

| # | 形态（注入内容） | 判据 | 说明盒宽 | **有字区域宽**（Range 并集） | 判定 |
| --- | --- | --- | --- | --- | --- |
| C0 | 不注入 | 绿 | 1380 | **1364.86** | 对照✅ |
| C0′ | `.snote { max-width: 70ch }`（正对照：整页压窄） | **红** `[note-narrow, note-axis]` | 452.81 | 451.09 | 有牙✅ |
| B1 | 说明外面套 `padding: 0 60px` 的容器 | **红** `[note-axis]` | 1260 | 1256.86 | 有牙✅ |
| B2 | 同上，padding 只留 30px | **红** `[note-axis]` | 1320 | 1316.86 | 有牙✅ |
| **A1** | `main > section .snote { max-width: 70ch }`（student/ 第 2 条） | **绿** | 1380 | 1364.86（第 1 条）/ **452.81（第 2 条）** | **放行 ⛔** |
| **A2** | 行内样式只压非首个的 2 条 | **绿** | 1380 | 452.81 / 447.52 | **放行 ⛔** |
| **A3** | changes/ 只压首个之外的（13 条里压 3 条） | **绿** | 1380 | 445.09 / 451.52 / 444 | **放行 ⛔** |
| **A4** | docs/data/ `.snote ~ .snote { max-width: 70ch }`（9 条压 8 条） | **绿** | 1380 | 452.81 / 483.16 / 452.81 … | **放行 ⛔** |
| **A5** | changes/ `.chgsec .snote { max-width: 70ch }`（页内**新增第二条 .snote 规则**，冻结串仍 1 次） | **绿** | 1380 | 449.09 / 276.23 / 204.23 … | **放行 ⛔** |
| **C1** | `.snote { padding-right: 900px }`（盒宽一字不动） | **绿** | **1380** | **480** | **放行 ⛔** |
| **C1b** | `.snote { padding: 0 450px }`（居中窄柱） | **绿** | **1380** | **476.88** | **放行 ⛔** |
| **C2** | `.snote > a, .snote > b, .snote > code { display:block; max-width:70ch }` | **绿** | **1380** | 452.81（多条） | **放行 ⛔** |
| **C3** | 把说明的**内容**包进 `max-width:70ch` 的容器 | **绿** | **1380** | 约 452 | **放行 ⛔** |
| **C1c** | `.snote { padding-right: calc(100% - 70ch) }` | **绿** | **1380** | **451.09（12 行）** | **放行 ⛔** |
| **D1@1440** | 缺陷藏在 `@media (min-width:1500px)` 里 | **绿** | 1380 | 1364.86 | **放行 ⛔** |
| D1@1600 | 同一注入在 1600 档 | **红** `[note-narrow, note-axis]` | 452.81 | 451.09 | 判据本身没问题，是**档位没量** |
| C4 | 把 `<main>` 拿掉 | **红** `[data-region-missing]` | — | — | 「判不出来」不会被静默算过 ✅ |

**三个指定形态的结果**：*带 padding 的容器* → 咬到；*只对部分 .snote 收窄* → **放行**；*不改盒宽的手法* → **放行**（4 种变体全部放行）。

**最狠的一条（产物级复现）**：把 `C1c` 那条规则写进 `student/index.html` 的**共享 `<style>`**（scratch 副本，
冻结串仍恰好 1 次），然后跑**完整套件**：

```
node scripts/tools/verify-site.js --dir=research/_raw/.../review/scratch/false-green-c1 --json=…
✅ 验收 827 项，失败 0 项        （EXIT=0，101s）
   metrics.layoutSweep      = {"total":186,…,"notesChecked":105,"narrowNotes":0,…,"unclassified":0}
   metrics.layoutViolations = 0 页
   §22c @1440 …窄说明 0 · 不同轴 0 · 裁切 0
```

而同一页在学生页的现场量测是：**说明盒 1380px，有字区域 451.09px（= 改动前 70ch 的样子），主数据区 1380px**
（截图 `runs/note-control-scratch-c1.png` 1380×103，文字全部挤在左侧 ≈1/3，右边整块空白；
对照 `runs/note-control-dist-shots.png` 1380×42，文字铺满整行）。
这正是 §22c 注释里自己写的缺陷原型（「说明只占表格宽的三分之一，左边对齐、右边半截」）——
**整轮绿，缺陷外观一字不差地回来了**。

> 附带读数：原料版 `padding-right: 900px`（写死像素）之所以会红，是因为它在 390/360 档把页面撑宽
> （`student/=916px`），被 **溢出** 检查顺带咬到 —— 那不是判据看穿了盒子。换成 `calc(100% - 70ch)`
> 之后溢出消失，判据与整轮套件就再也看不见它了（`runs/scratch-c1-rawpadding/report.json` vs
> `runs/scratch-false-green-c1/report.json`）。

### A2 反空洞守卫真的会红（0 次 / ≥2 次）

用生产文件里逐字抽出的 `wideMutate()` 实测（`runs/adversarial-dist.json` 的 `guard` 段）：

| 用例 | 锚点 | ok | occurrences | reason |
| --- | --- | --- | --- | --- |
| G0 | 产物里不存在的锚点 | **false** | 0 | 锚点在内联样式里出现 0 次（必须恰好 1 次） |
| G1 | `color: var(--mut);`（自然出现 61 次） | **false** | 61 | 同上 |
| G3 | 冻结串**恰好 2 次**（复制一份 `<style>` 后） | **false** | **2** | 同上（边界不是「很多次」也拦得住） |
| G2 | 冻结串唯一 | **true** | 1 | 落地后 `maxWidth=452.812px`、说明盒 452.81px ⇒ 变异**真的生效了**，`ok:true` 不是空转 |

套件自身的自检（`runs/dist-green.log`）同读数：`ok=false · 出现 0 次` / `ok=false · 出现 61 次`。

**端到端负例（真的红，不是只断言返回值）**：`review/scratch/negative` 里把 `student/index.html` 的共享
`<style>` 复制一份（冻结串 2 次）并新增一条解析不出布局族的路由：

```
node scripts/tools/verify-site.js --dir=…/scratch/negative --json=…
EXIT=1 · 827 项断言失败 8 项（**全部是 §22c**）
  ✗ §22c M1 变异锚点唯一 — 锚点在内联样式里出现 2 次（必须恰好 1 次）⇒ 变异未生效，判红（不允许「变异不生效却算通过」）
  ✗ §22c M1 变异后复测必须出现「note-narrow」… — 锚点不唯一/不存在 ⇒ 变异没落地，按红处理
  ✗ §22c M6 …同两条…
  ✗ §22c 冻结串…恰好 1 次 — 1 页不符：student/=2 次
```

**结论：「变异不生效却算通过」这条最坏假绿路径不存在。** 守卫失败 ⇒ 前置检查与复测检查**两条都判红**
（`verify-site.js:6673-6685`），且 M6 还额外要求 `injected === 'note'`。

### A3 M0（`--dir=dist.baseline`）真的红，且原因就是 note-narrow

```
node scripts/tools/verify-site.js --dir=dist.baseline --json=…/runs/m0/M0-baseline.json
EXIT=1 · 827 项断言失败 14 项 · **失败项里非 §22c 的 0 个**
metrics.layoutViolations = 48 页 · 违规码分布 **note-narrow=48 note-axis=48**（没有别的码）
✗ §22c @1440 …窄说明 48 · 不同轴 48 · 都不在同轴 48
✗ §22c @760 样本集 …category/ note-narrow：说明宽 452.81px < 0.85 × 728px …
```

**命中清单与现场宽页清单逐条一致**：我用与浏览器无关的静态口径（页面内联样式里存在
`max-width: 70ch` 的 `.snote` 规则）算出 **48 页**，与报告里 `note-narrow` 的 48 页**集合相等**
（`runs/m0/M0-analysis.txt` 末行 `与报告里 note-narrow 命中集合一致：true`）。

**因果隔离（把「红」钉死在缺陷上，而不是别的副作用）**：
M0 的 14 项失败里有 12 项是**设计上的必然红**（冻结串在改动前不存在 ⇒ 8 条 M1–M6 守卫 + 冻结串检查；
外加 M6 正对照的溢出）。为了证明「几何检查本身是被缺陷咬红的」，我复核了 T2 的合成产物
`dist.synth-fixed` 的**出身**（`runs/synth-provenance.txt`）：

```
① 非样式部分与 dist.baseline 逐字节相同的文件：186/186
② 剥掉 .snote 规则与 CSS 注释后样式仍相同的文件：186/186
③ 冻结串恰好 1 次：186/186 · 除冻结串外的 .snote 规则：0 条
⇒ ✅ synth-fixed 相对 baseline 的唯一改动就是 .snote 宽度声明
```

再独立复跑一次（`runs/synth/M-synth-green-recheck.log`）：**EXIT=0 · 833 项断言失败 0 项 · 窄说明 0**。
⇒ 「同一个判据：只修 `.snote` 宽度 ⇒ 由 48 页红变 0 页绿」，M0 的红确实由 note-narrow 造成。

### A4 §22b 既有代码一行未改

- `git diff --numstat`：`820 0`（0 删除）。
- **逐字节重建**（`runs/diff-shape.txt`）：把当前文件里的两块新增行删掉（当前 36–38、6100–6916），
  重建结果与 `git show HEAD:scripts/tools/verify-site.js` **逐字节相同（true）**：
  基线 sha256 `d5125c580a951d13…` / 当前 `4cae2fb2ab259999…`；0 删除 / 0 修改。
- 插入点上下文：前 3 行是 **§22b 尾部**（`Runs…leafMobileOverflow` → `}` → `}`），后 3 行是 **§23 厂商资料页**开头。
- §22b 区间：基线 **5516–6096** / 当前 **5519–6099**，完全落在两块插入之间 ⇒ 不可能被改动。
- 运行侧同读数：§22b 断言 41 项 0 失败；M5 复用段逐条咬到 `M1=[center] M2=[width] M3=[axis,src-width] M4=[self-overflow@390,page-overflow@390] M5=[leaf-consistency]`、M4 正对照 `[无]`。

### A5 `metrics.layoutSweep` 每个计数与现场实算一致（不许把「判不出来」算进通过）

用**不同源**的口径静态重算（不用浏览器、不调用 `wideProblems`）：遍历 186 个 `index.html` +
`page-kinds.kindOfRoute/layoutOf` + 静态 class 匹配 + 剥掉 `<script>` 文本
（首轮我在这一点上算错过：首页的变化雷达在 inline JS 里拼 `class="chgsec"`，静态匹配会多算 1 页；
浏览器 `querySelector` 是对的 —— 我把这条记下来是因为它说明了「两套口径必须对账」）。

```
逐项对账（runs/metrics-crosscheck.txt）：
  total 186=186 · wide 55=55 · detail 131=131 · other 0=0 · unclassified 0=0
  notesChecked 105=105 · unexpectedDetailMain 0=0 · missingDetailMain 0=0
  frozen pagesExactlyOnce 186=186 · layoutViolations.length 0=0
  主数据区分布：静态 {"<main>（回落）":82,".ctable":45,".chgsec":1,".ptable":55,".flist":1,".pchglist":1,".stable":1}
             报告 {"<main>（回落）":82,".ctable":45,".chgsec":1,".ptable":55,".flist":1,".pchglist":1,".stable":1}
  ⇒ ✅ 全部一致
```

**「判不出来」不会被静默算过**（代码 + 实测双证）：

| 码 | 判据出口 | 实测负例 |
| --- | --- | --- |
| `unclassified-layout` | 检查①`wideUnclassified.length === 0`；样本档同一函数 | `scratch/negative` 新增 `unknown-family/` ⇒ **EXIT=1**，检查①红、@760/@360 样本档红、`layoutSweep.unclassified=1`、`layoutViolations=[unknown-family/]` |
| `data-region-missing` | 检查⑦`wideRegionMissing.length === 0` | 内存移除 `<main>` ⇒ `[data-region-missing]`（`adversarial-dist.json#C4-no-main`） |
| 8 个码可达 | 检查「违规码自检」用合成几何证明 8/8 可达且不多不少 | 绿轮：`可达 8/8 · 缺 无 · 多 无` |

另：`无页面级说明 ⇒ 跳过、不算失败` 这条**没有被用来掩盖宽页**：全站 81 个跳过项 = 首页 + 80 个 deal 详情，
wide 族里只有首页这一例（`runs/no-note-pages.txt`）。

### A6 视口覆盖 + `--url=` 不静默跳过

- 覆盖与 prompt 要求（1440 全站几何 + 390 全站 scrollWidth + 760/360 样本集）**一致**，且可从日志逐项读出：
  `@1440 186 页`（几何+溢出）、`@390 186 页`（只取 `page-overflow@`）、`@760/@360` 样本集 **29 页**、
  导航 438 次、本节 JS 错误 0、外部请求 0。
- 样本集**现场推导、不写死 id/slug**（`runs/sample-coverage.txt`）：15 条非通配静态路由全取（磁盘上正好 15 条）
  + 3 目录页 + 10 按需求页 + 2 枢纽 + 每个通配族 1 条真实路由；覆盖 kind：archive-index category changes
  collection data-docs deal feeds home hub model models-index need plans plans-hub status vendor。
  **`archive-detail` 族在样本集里缺席，原因是产物里该族页面 0 个**（不是静默跳过；1440/390 全站扫描仍覆盖全部 186 页）。
- **`--url=` 模式不静默**（`runs/url-mode/`，对本机 8123 上的同一份 dist 跑线上模式，代码路径与线上完全一致）：

  ```
  === 22c) Wide Data Page 页面级说明的同轴门禁（布局族 × 全站几何）===
    ℹ️  --url= 线上冒烟：§22c 的路由清单从产物目录现算（遍历其中所有 index.html）⇒ 线上模式如实跳过（不造数据）
  ```

  明确打印 ✅；但机器可读报告里 **`layout*` 七个键整体消失**（`report.json` 的 `metrics` 里 `layout` 前缀键 = `[]`），
  这次线上模式运行共 797 项断言（本地同参数带 `--compare` 的一次是 833 项；差额 36 = `--compare` 的 6 项 +
  §22c 的 30 项，即 §22c 整节在线上模式里一句断言都不跑）—— 见 F3（low）。

### A7 `--compare` 的既有 6 项回归判据没被新增 metrics 键搞坏

- 读码：比较块（`verify-site.js:7254-7276`）只读 `coveredDeals / cards / firstScreenFull / pageHeight /
  externalRequests / jsErrors` 六个**既有**键；§22c 新增的 7 个键没有任何一个与它们同名。
- 实跑：`node scripts/tools/verify-site.js --dir=dist --compare=research/_raw/ours-baseline/verify.json`
  ⇒ **6/6 全绿**（`80→80 · 50→50 · 6→6 · 4589px→4787px · 0→0 · 0 个`），整轮 `833 项失败 0 项`，EXIT=0。

### A8 本文件（`review.md`）与结论

已产出；verdict 见文首与 §3。

---

## 2. 判据覆盖面的量化（F2 的背景读数）

`runs/snote-total.txt`（DOM 口径，剥掉 `<script>`/`<style>` 文本）：

```
<main> 里 .snote 数量分布：0 条→81 页 · 2 条→7 页 · 3 条→46 页 · 4 条→33 页 · 5 条→15 页
                           · 8 条→1 页 · 9 条→1 页 · 12 条→1 页 · 13 条→1 页
.snote 元素总数：401
§22c 真正量的（每页文档序第一个）：105 个 ⇒ 覆盖率 26.2%，未被判几何的 296 个
```

即：**只要页面有说明，它至少还有第二条 `.snote`**；而 §22c 只量其中一条。日志里 `noteCount` 被打出来
（`student/ collection/wide · .snote 3 个`），但从未进入 `wideProblems()` —— 打印了、没判。

---

## 3. Findings（结构化，按 severity）

### F1 · blocker · 判据量的是 border-box，看不见「有字区域」被压窄
- **file**：`scripts/tools/verify-site.js:6244-6254`（`box()` 取 `getBoundingClientRect().width`）、`:6324-6348`（比例/同轴/裁切三条判据）
- **problem**：缺陷原型是「说明**看起来**只占表格宽的三分之一」，而判据只认元素的 border-box 宽度。
  任何保持盒宽、压窄内容的手法都能一字不差地复现缺陷而全绿：
  `.snote { padding-right: 900px }`（有字区域 480px）、`.snote { padding: 0 450px }`（476.88px）、
  `.snote { padding-right: calc(100% - 70ch) }`（**451.09px，与改动前 70ch 完全同宽**）、
  把内容包进 `max-width:70ch` 的容器、子元素块级化后压 70ch —— 5 种形态实测全部 **无违规码**。
  **产物级复现**：把 `calc(100% - 70ch)` 写进 scratch 副本 `student/index.html` 的共享 `<style>`（冻结串仍 1 次）
  ⇒ `verify-site.js` **整轮 827 项断言 EXIT=0**，`narrowNotes=0`、`layoutViolations=0`，
  而现场量测是说明盒 1380px / 有字区域 451.09px / 主数据区 1380px（截图 `runs/note-control-scratch-c1.png`）。
- **expected**：该形态必须判红（版本目标就是「页面级说明与主数据区同轴」；它现在的实际问题就是「读起来是一根窄柱」）。
- **actual**：判绿；整轮套件也判绿。
- **requiredFix**：在 `wideMeasure()` 里**同时**量「有字区域宽」（`document.createRange()` 包住说明的全部
  文本节点取 rects 并集，或等价地 `clientWidth − paddingLeft − paddingRight` 与首个文本节点 rect 取小），
  让 `note-narrow` 与 `note-axis` 的**比例判据用有字区域宽**（`textWidth ≥ 0.85 × min(主数据区, 页面列)`）；
  并加一条变异牙 M8：把 `padding-right`/内层容器收窄写进产物 ⇒ 必须咬到。

### F2 · blocker · 只判「文档序第一个」`.snote`，全站 296/401 个说明块没有几何判据
- **file**：`scripts/tools/verify-site.js:6121`（口径注释）、`:6263`（`main.querySelector('.snote')`）、`:6324-6348`
- **problem**：105/186 页有 ≥2 条说明（最多 13 条），判据只量第一条。实测：`main > section .snote{…}`（student/ 第 2 条）、
  `.snote ~ .snote{…}`（docs/data/ 9 条压 8 条）、`.chgsec .snote{…}`（changes/ 分节内 8 条）、
  `:not(:first-of-type)`（changes/ 13 条压 3 条）、行内样式压非首个 —— **全部放行**。
  更结构性的两点：(a) 冻结串检查名自称「一处定义、**全站生效**」，但它只数冻结串出现次数，
  页内再长出一条别的 `.snote` 收窄规则照样通过（A5）；(b) 一旦页面级说明不再是文档序第一条
  （例如前面插进一条分节说明），判据会**静默改测另一条**，红/绿都不再指向页面级说明。
- **expected**：页面级说明之外，任何 `.snote` 被压成窄柱都应当被这条门禁看见（至少要有明确断言 + 读数）。
- **actual**：`noteCount` 被打印但不参与判据；上述 5 种注入 0 违规码。
- **requiredFix**：把判据改为遍历 `<main>` 内**全部** `.snote`（同样的 note-narrow/note-axis/note-clipped 三码，
  逐块产出 `route#index` 定位）；或至少新增一条独立断言「文档里不存在任何 `.snote` 的计算宽 < 0.85 × 主数据区」。
  「无页面级说明 ⇒ 跳过」只对**零条**说明的页面保留。

### F3 · low · `--url=` 模式在机器可读报告里没有任何「§22c 被跳过」的记录
- **file**：`scripts/tools/verify-site.js:6406-6410`
- **problem**：线上模式只有一行 console `ℹ️`；`metrics` 里 `layoutSweep/layoutFrozenRule/layoutDataRegions/
  layoutNoteAnchors/layoutSample/layoutScan/layoutViolations` 七个键整体消失（实测 `report.json` 中 `layout*` 键 = `[]`，
  该次运行 797 项断言，§22c 一条都没跑）。只 diff 机器可读报告的下游（回归看板/对账脚本）会看到键静默消失。
- **expected**：跳过要留痕，且留痕本身可机器读取。
- **actual**：stdout 有打印（满足「不静默」），报告里无记录。
- **requiredFix**：在 `urlArg` 分支写 `metrics.layoutSweep = { skipped: true, reason: '--url= 模式没有产物目录，路由清单无从现算' }`
  之类的显式键，让「跳过」与「跑了但 0 违规」在报告里可区分。

### F4 · low · 桌面几何只有 1440 一档，只在更宽视口生效的缺陷永远看不见
- **file**：`scripts/tools/verify-site.js:6146-6148`（`WIDE_DESKTOP/WIDE_NARROW/WIDE_SAMPLE_VIEWPORTS`）、`:6447-6452`
- **problem**：`@media (min-width: 1500px) { .snote { max-width: 70ch } }` 在套件的 1440 档**绿**，
  用同一份判据在 1600 档量则**红**（`note-narrow, note-axis`）。（§22b 对叶子页量了 1600/1440/900/390/360。）
- **expected**：桌面档至少覆盖到常见宽屏（≥1600），或对样本集加一档。
- **actual**：1440 是唯一几何档，缺陷藏在更宽档位即漏。
- **requiredFix**：把 `1600` 加入全站几何档（成本 ≈ 186 次导航），或对 29 条样本集在 1600 档复量。

---

## 4. 不构成 finding 但要点名的正面读数（复审确认过、供 T3/队长引用）

1. **M0 反证成立**：`--dir=dist.baseline` EXIT=1，14 项失败**全部在 §22c**，`layoutViolations` 只有
   `note-narrow=48 / note-axis=48`，命中清单与静态口径**集合相等**；且用「只修 .snote 宽度」的
   `dist.synth-fixed`（出身逐字节校验过）复跑 ⇒ 由红转绿，因果隔离干净。
2. **反空洞守卫**在 0 次 / 61 次 / **恰好 2 次**三种负例下都 `ok:false`，唯一锚点时 `ok:true` 且**确实落地**
   （计算样式变为 452.812px）；守卫失败会让前置与复测**两条断言同时判红**，「变异不生效却算通过」不存在。
3. **纯新增**：`+820 / −0`，删掉两块插入后与基线**逐字节相同**（sha256 见证），§22b 零改动。
4. **`--compare` 语义完好**：读码 6 个既有键 + 实跑 6/6 绿。
5. **计数不自证**：`layoutSweep / layoutFrozenRule / layoutDataRegions / layoutNoteAnchors` 与
   独立静态口径**逐项一致**；`unclassified-layout`、`data-region-missing` 都有实测负例证明会红。
6. **零磁盘污染**：绿轮自己的 `sha256` 前后相等；我的全部实验后 `dist` 树哈希与实验前相同。

---

## 5. 证据文件与复现命令

```
research/_raw/secondary-page-layout-unification/review/
├── review.md                      ← 本文件
├── adversarial.cjs                ← 判据逐字抽取 + 浏览器内存注入（19 个形态 + 守卫四例）
├── make-scratch.cjs               ← 造 review/scratch/{negative,false-green-c1}
├── serve-dist.cjs                 ← 线上模式用的静态服务（127.0.0.1:8123）
├── analyze-report.cjs             ← 读 --json 报告：失败项归类 / 违规码分布 / 与静态清单对账
├── audit-snote-static.cjs         ← 静态：每页 .snote 分布与页内 .snote 规则形状
├── audit-snote-total.cjs          ← 静态：401 个元素 / 105 个被判 / 26.2%
├── audit-note-roles.cjs           ← 静态：每条 .snote 的角色（父链 / 子元素 / 首 60 字）
├── audit-metrics-crosscheck.cjs   ← 独立复算 metrics 并逐项对账
├── audit-kind-counts.cjs          ← 路由按 kind / 通配族计数
├── audit-sample-coverage.cjs      ← 760/360 样本集的家族覆盖
├── audit-no-note-pages.cjs        ← 「无页面级说明」的 81 页是哪些
├── audit-synth-provenance.cjs     ← dist.synth-fixed 的出身（只差 .snote 宽度）
├── audit-diff-shape.cjs           ← +820/−0 与逐字节重建证明
├── audit-baseline-integrity.cjs   ← dist.baseline 303/303 + dist 树哈希
├── scratch/{negative,false-green-c1}/   ← 对抗产物（dist 的副本，绝不回写 dist）
└── runs/                          ← 全部原始日志 / JSON / 截图
    ├── dist-green.{log,json} · mutations.json                 （绿轮 + --compare）
    ├── m0/M0-baseline.{log,json} · M0-analysis.txt            （M0 反证 + 与静态清单对账）
    ├── synth/M-synth-green-recheck.{log,json} · synth-provenance.txt （因果隔离）
    ├── scratch-negative/{run.log,report.json} · scratch-c1-rawpadding/*
    ├── scratch-false-green-c1/{run.log,report.json}           （**整轮绿**的假绿产物）
    ├── adversarial-dist.{log,json} · adversarial-run1.* · adversarial-dist-shots.json
    ├── adversarial-scratch-c1.{log,json}                      （假绿产物的现场量测）
    ├── note-control-dist-shots.png · note-control-scratch-c1.png （对照截图）
    ├── metrics-crosscheck.txt · kind-counts.txt · sample-coverage.txt · no-note-pages.txt
    ├── snote-total.txt · note-roles.txt · static-snote-audit.txt
    ├── diff-shape.txt · baseline-integrity.txt · url-mode/{run.log,report.json}
```

复现（工作目录 = worktree 根，浏览器套件串行）：

```bash
# 绿轮 + 回归比对（EXIT=0，833 项 0 失败）
node scripts/tools/verify-site.js --dir=dist --compare=research/_raw/ours-baseline/verify.json \
  --json=research/_raw/secondary-page-layout-unification/review/runs/dist-green.json
# M0 反证（EXIT=1，14 项全在 §22c，note-narrow=48）
node scripts/tools/verify-site.js --dir=dist.baseline \
  --json=research/_raw/secondary-page-layout-unification/review/runs/m0/M0-baseline.json
# 因果隔离（EXIT=0，窄说明 0）
node scripts/tools/verify-site.js --dir=dist.synth-fixed \
  --json=research/_raw/secondary-page-layout-unification/review/runs/synth/M-synth-green-recheck.json
# 对抗产物（EXIT=1 只贡献「锚点 2 次 / 未分类路由」两个负例）
node research/_raw/secondary-page-layout-unification/review/make-scratch.cjs negative
node scripts/tools/verify-site.js --dir=research/_raw/secondary-page-layout-unification/review/scratch/negative \
  --json=research/_raw/secondary-page-layout-unification/review/runs/scratch-negative/report.json
# ★ 假绿复现（EXIT=0：整轮全绿，而学生页说明是 451px 窄柱）
node research/_raw/secondary-page-layout-unification/review/make-scratch.cjs false-green-c1
node scripts/tools/verify-site.js --dir=research/_raw/secondary-page-layout-unification/review/scratch/false-green-c1 \
  --json=research/_raw/secondary-page-layout-unification/review/runs/scratch-false-green-c1/report.json
# 19 个注入形态 + 守卫四例（不用改任何源码）
node research/_raw/secondary-page-layout-unification/review/adversarial.cjs dist dist
# 静态审计（不需要浏览器）
node research/_raw/secondary-page-layout-unification/review/audit-metrics-crosscheck.cjs dist \
  research/_raw/secondary-page-layout-unification/review/runs/dist-green.json
```

---

## 6. 结论

§22c 的**工程骨架是好的**：判据单一出口、变异牙复用同一函数、反空洞守卫真的会红、M0 有因果隔离、
纯新增不碰 §22b、metrics 可独立复算、`--compare` 未被影响。这几条我全部复核通过并留了读数。

但**判据的量与它承诺保护的观感不是同一个量**：它量的是 `.snote` 的 border-box 宽度，而那 401 个说明块里
**只有 105 个**进入判据、且进入的那一个也可能「盒子满宽、有字区域只剩 70ch」。前者让 296 个说明块失去保护，
后者让「页面级说明本身」都能在被压成 451px 窄柱的同时拿到整轮 827 项全绿。

按 acceptance「任何放行 = blocker finding」，**verdict = needs_revision**（F1/F2 为 blocker，F3/F4 为 low）。
建议的最小修复面：`wideMeasure()` 同时量有字区域宽、`wideProblems()` 遍历 `<main>` 内全部 `.snote`，
再加一条 `padding`/内层容器收窄的变异牙；修完这两处，§22c 才真的能替这条版本承诺兜底。

---
---

# T8 复审报告（round 2）· 修复后的 §22c：F1–F4 反转复核 + 新一轮对抗

- **复审对象**：t7 修复后的 `scripts/tools/verify-site.js` §22c（`git diff` = **+1109 / −0**，两处纯插入：当前 36–38、6100–7205）。
- **基线**：`origin/master = 1f225d2`；`dist.baseline` 只读；`dist` = T1 构建产物。
- **独立性**：本轮**全部读数都是我自己跑的**（7 次套件运行 + 3 次驱动运行）。t7 的 `teeth/**`、`geometry/**` 只当**被测对象 / 脚手架**读；`geometry/truth-401.json` 的 156/48 我用**静态口径独立复算**过（§R2-1.3）。
- **结论**：**verdict = needs_revision**。t5 的 F1/F2/F3/F4 **全部反转成功**（含产物级复现从「整轮 0 失败」变成「整轮 red」），兼容性三条与全部不变量**达标**；但按契约「任何能骗过新判据的形态 = blocker finding」，本轮新增对抗仍找到 **3 种机制 / 4 条形态**能让「说明在画面里仍是 70ch 窄柱」而 §22c 判绿 —— 其中一条**只改一条 CSS 规则、不动标记，且整轮 842 项断言 0 失败**（§R2-3）。见 F-R2-1 / F-R2-2。

## R2-0. 纪律与不变量（先说没动什么、没信什么）

| 不变量 | 怎么证的 | 读数 |
| --- | --- | --- |
| §22b 一行未改 | 用 `git diff -U0` 的 hunk 头**现算**插入块，删掉后与 `git show HEAD:` 逐字节比对（`runs/r2-diff-shape.txt`） | hunk = `旧 35+0 → 新 36+3`、`旧 6096+0 → 新 6100+1106`；**0 删除**；重建后与基线**逐字节相同**（基线 `d5125c580a951d13…` / 当前 `4f4cb2e3b3f8e47d…`）；§22b 区间 **5519–6099** 全部早于插入块 |
| 判据不是我重写的 | `review/adversarial2.cjs` 从 `verify-site.js` **逐字抽取**第 6151–6449 行（常量+量测+判据，sha256 `47cfc56165be000d…`）与 `wideMutate`（6457–6470，`b3d6ba24f3b65d41…`） | 每次运行打印并写进 `runs/adversarial2-*.json` |
| `dist` / `dist.baseline` 未被触碰 | 造 scratch 前后树哈希；baseline 与 T1 清单对账 | `dist` = `c07d48a6eee12027…` **前后相同**；`dist.baseline` 303/303 与清单一致 |
| 对抗只在浏览器内存 / 副本里 | 19 条注入走 `addStyleTag` / `page.evaluate`；产物级验证写在 `review/scratch/**`（`make-scratch.cjs` 自带「dist 未被触碰」回执） | `runs/r2-make-*.txt` |
| 浏览器套件一次只跑一个 | 串行 **7 次套件 + 1 次 CI 检查 + 3 次驱动**：plain → false-green-c1 → M0 → green+compare → ci-consistency → url-mode → false-green-grid(70ch) → false-green-grid(minmax) → 驱动 | `runs/r2-summary.txt` |

## R2-1. 逐条对照 acceptance

### R2-1.1【F1 反转 · 自己重做】产物级复现从「整轮绿」变成「整轮红」

```
node …/review/make-scratch.cjs false-green-c1     # 把 .snote{padding-right:calc(100% - 70ch)} 写进 student/ 的**共享 <style>**
   student/index.html sha256 35588b1f2648… → a417ae7493b9… · 冻结串出现次数 = 1 · dist 未被触碰 = true
node scripts/tools/verify-site.js --dir=…/scratch/false-green-c1 --json=…/runs/r2-false-green-c1.json
   ⇒ EXIT=1 · 842 项断言失败 5 项（**全部是 §22c**）
```

| 失败的 §22c 断言 | 读数（逐字） |
| --- | --- |
| `@1440 逐条页面级说明与主数据区同轴` | 逐条判 401 条 · **窄条 3（落在 1 页）** · 命中样例 **`student/#0` 有字区域 452.81px（盒 1380px · 列 1380px · 比例 0.33）** |
| `@1600 逐条…同轴` | 同样 3 条（`narrowNotesAt1600=3`） |
| `@760 样本集同一份判据` | `student/#0 有字区域宽 452.81px < 0.85 × 728px（盒宽 728px · content box 452.81px · 承载文本块 1 个 · 字迹 451.09px/9 行）` |
| `M8 要害：盒宽没变、只有有字区域被压回 70ch 级` | 在这个已坏的产物上注入前/后都是 452.81 ⇒ 按设计判红（干净产物上的读数见下） |
| `M8/M9a/M9b/M10 的正对照` | 该产物 `student/` 已有窄条 ⇒ 正对照判红 |

**同一副本不注入 ⇒ EXIT=0**：`review/scratch/plain`（dist 整份副本、零注入）= **842 项断言 0 失败**（117s）。
**判据本身在干净产物上照样会咬**：绿轮 `M8` 要害读数 =「注入前 盒 1380px / 有字区域 **1380px** ⇒ 注入后 盒 1380px / 有字区域 **452.81px**（列宽 1380px · 阈值 1173px）—— **盒宽差 0px**」。

⇒ t5 那条「写进产物后整轮 EXIT=0」的假绿**已不再成立**。

### R2-1.2【F1 兼容性 · 三条实测】真浏览器读数

| 形态 | 结果 | 关键读数 |
| --- | --- | --- |
| `.aliasnote`（padding-left 8px + border-left 3px；3 个真实别名页 `need/student-only/`、`need/free-api/`、`need/dev-credits/`） | **绿 · 0 码**（3/3） | `need/student-only/#0` 盒 1380 · **textWidth 1369** ≥ 1173 · 字迹 1358.97 · **无 note-axis** |
| 容器内缩 60px（prompt §11 允许） | **绿 · 0 码** | 盒 1260 · textWidth 1260 · 字迹 1256.86 · 轴容差 69px |
| 容器内缩 30px | **绿 · 0 码** | 盒 1320 · textWidth 1320 |
| 容器内缩 450px（必须红） | **红** `[note-narrow#0, note-axis#0]` | 盒 480 < 阈值 1173 |
| 全站侧证 | dist 绿轮 `@1440` 逐条 401 条 **窄条 0 · 不同轴 0**；`textFallback` 41 条**没有变成假红** | `runs/r2-green.json` |

### R2-1.3【F2 反转 + 集合级核对】只压非首个 ⇒ 带 `route#index` 咬中；156/48 逐条相同

四种写法全部咬中，且码**带条级定位**（`runs/adversarial2-dist.json`）：

| 注入 | 命中条（`coded` 实测） |
| --- | --- |
| `.snote ~ .snote { max-width: 70ch }`（docs/data/） | `docs/data/#1 #2 #3 #4 #5 #6 #7 #8`（第 0 条不在内） |
| `.snote:not(:first-of-type) { max-width: 70ch }`（changes/） | `changes/#1 #3 #4 #8 #12` |
| `.chgsec .snote { max-width: 70ch }`（round-1 的 A5） | `changes/#5…#12` |
| 行内样式只压非首个（student/） | `student/#1 #2` |

套件侧同形：`M9a`「选择器命中 `[docs/data/#1..#8]` ⇒ 窄条同一集合」、`M9b`「命中 `[changes/#1 #3 #4 #8 #12]` ⇒ 窄条同一集合」，且都断言**第 0 条不被压**。

**集合级核对（我自己复算，`review/audit-r2-sets.cjs`）**：

```
① 静态独立复算（dist.baseline）：内联样式里带「.snote … max-width: 70ch」的页面 48 个
   · 这 48 页 <main> 里的 .snote 共 **156 条** ⇒ 与 truth-401.json 声称的 156 条 / 48 页 **一致**
② r2-m0.json（--dir=dist.baseline）：条级容器 401 条 · 命中 note-narrow **156 条 / 48 页**
   · 漏判 0 · 误报 0（落在对照组 0 条）· 页集合漏 0 / 多 0 ⇒ ✅ pass
   （对照：真值 156 = caughtByOldCriteria 48 + onlyNewTruth 108；alreadyFine 245 条零误报）
③ r2-green.json（--dir=dist）：条级容器 401 条 · 命中 **0 条 / 0 页** ⇒ ✅ pass
```

### R2-1.4【F2 覆盖度量】105/401 = 26.2% → **401/401 = 100%**

| 读数 | round-1（t5 现场） | round-2（本轮现场） |
| --- | --- | --- |
| 条级容器 | 不存在（只有页级 `layoutViolations`） | `metrics.layoutNotes` **401 条**（@1440）+ `layoutNotesAt1600` **401 条** |
| 真正被判几何的说明 | **105 条（26.2%）**，其余 296 条无判据 | **401 条（100%）**；`notesJudged=401` 与 `notesChecked=105`（有说明的页数）分开登记 |
| 「跳过」含义 | 整页跳过（多说明页只判第一条） | 只留给**零条说明**的 81 页（首页 + 80 个 deal 详情） |

独立复算：静态数 401 条（`audit-snote-total.cjs`，DOM 口径、剥 `<script>`）与两份报告的条级容器长度**都是 401**。

### R2-1.5【F3】`--url=` 机器可读留痕：10 个 `layout*` 键全部 `{skipped:true, reason}`

```
node scripts/tools/verify-site.js --url=http://127.0.0.1:8124/ --json=…/runs/r2-url-mode.json   # 本机服务同一份 dist
  ℹ️  §22c 如实跳过（机器可读留痕：metrics.layout* 全部带 skipped/reason）：--url= 模式没有产物目录，
      §22c 的路由清单/几何扫描/变异牙都无从现算（不改成拿线上首页硬凑一份假清单）
report.metrics 的 layout* 键（10 个）：layoutSweep layoutNotes layoutNotesAt1600 layoutViolations layoutFrozenRule
                                        layoutDataRegions layoutNoteAnchors layoutSample layoutScan layoutMutationCodes
  layoutSweep = {"skipped":true,"reason":"--url= 模式没有产物目录，§22c 的路由清单/几何扫描/变异牙都无从现算（不改成拿线上首页硬凑一份假清单）"}
```

⇒ 「跳过」与「跑了但 0 违规」在机器可读层面**可区分**。该次 2 项失败是「线上 beacon」两项（用 127.0.0.1 模拟线上时生产分析必然不触发），与 §22c / 本版本无关。

### R2-1.6【F4】只在 ≥1500px 生效的缺陷：1600 档咬中，1440 档零误报

- 套件自带 `M10`（`@media (min-width:1500px) { .snote { max-width: 70ch } }`）绿轮实测 `[note-narrow, note-axis]`×3；M10 **正对照**（不注入）@1600 = 无码。
- 我的独立注入：`@1440` ⇒ **绿 · 0 码**；`@1600` ⇒ **红** `[note-narrow#0..2, note-axis#0..2]`。
- 全站 @1600 逐条：401 条 · **窄条 0**（dist）。

### R2-1.7【不变量复验】

| 项 | 读数 |
| --- | --- |
| §22b / 纯插入 | `+1109 / −0`；删块后**逐字节相同**；§22b 5519–6099 未被触碰 |
| 反空洞守卫 | 0 次 ⇒ `ok=false occurrences=0`；61 次 ⇒ `ok=false`；**恰好 2 次** ⇒ `ok=false occurrences=2`；唯一 ⇒ `ok=true` 且**落地**（首条 textWidth 452.81）；套件自检同读数 |
| `--compare` | 6/6 全绿：`80→80 · 50→50 · 6→6 · 4589px→4787px · 0→0 · 0 个` |
| 整轮 `--dir=dist` | **848 项断言 0 失败**（842 + `--compare` 6），EXIT=0 ⇒ §22c 之外零新增失败 |
| `check-ci-consistency.js` | **38 项，失败 0 项**（`(E) 实跑项数 == --expect-checks=38`），EXIT=0 |
| 绿轮 §22c 关键读数 | 逐条 401 · 窄条 0 · 不同轴 0 · 裁切 0 · `textFallback` 41 · 冻结串 186/186 恰好 1 次 · 违规码自检 8/8 · M1–M10 全部咬中 · 628 次导航 0 JS 错误 0 外部请求 |

### R2-1.8【继续对抗】t5 没试过的 10 条形态，逐条判定

| # | 形态 | 判定 | 读要点 |
| --- | --- | --- | --- |
| N1 | `.snote { transform: scaleX(0.33); transform-origin: left top }` | **咬中** `[note-axis#0..2]` | 绘制盒缩窄、布局盒不变 ⇒ 轴判据（rect 含 transform）接住 |
| N1b | 同上、`transform-origin: center` | **咬中** `[note-axis#0..2]` | |
| N2 | `.snote { display: grid; grid-template-columns: 70ch 1fr }`（student/） | **咬中** `[note-narrow#0..2]` | 内联 `<b>/<a>` 被 blockify 成网格项（承载文本 + 自己的盒）⇒ textWidth 927/453 |
| N2b | `.snote { display: flex }` | **咬中** | 同上机制 |
| **N3** | **把正文搬进 `::before`（真实文本 `font-size: 0`）** | **放行 ⛔** | 盒 1380 · textWidth 1380 · **字迹 `null`** ⇒ F-R2-2 |
| N4 | `.snote { padding-left: 900px; text-indent: -900px; overflow: hidden }` | **咬中** `[note-narrow#0..2]` | padding 进 content box ⇒ textWidth 480 |
| N5 | `.snote { writing-mode: vertical-rl }` | **咬中** `[note-narrow, note-axis]×3` | |
| N6 | `.snote { border-right: 900px solid transparent; margin-right: -900px }` | **咬中** `[note-axis×3, page-overflow@1440]` | |
| **N7 / N10** | **内容包进 `max-width:70ch` 的 `div`，文字又包在 `inline span` 里** | **放行 ⛔** | 盒 1380 · textWidth **1380（fallback）** · 承载块 **0** · **字迹 451.09** ⇒ F-R2-1 |
| **N9** | **纯文本说明 + `.snote { display: grid; grid-template-columns: minmax(0,70ch) 1fr }`（changes/）** | **放行 ⛔** | 盒 1380 · textWidth **1380** · 承载块 1 · 字迹 156–451 ⇒ F-R2-1；**只改一条 CSS 规则、不动标记** |
| N9b/N9c | 同一规则用在 docs/data/（说明里有 `<a>/<code>` 内联子元素） | **咬中** | 内联子元素被 blockify ⇒ 承载块 3/5 个、textWidth 927/453 |
| N8 | 说明与主数据区**一起**压 70ch | **咬中** `[note-axis]` | 边界情形（分母同缩）；实测仍红，不作 finding |

**汇总**：10 条里 6 条被咬中、**4 条放行（3 种机制）**。

## R2-2. Findings

### F-R2-1 · blocker · 「有字区域」在两类情形下退化成整盒宽（文本不在任何可测的块里）
- **file**：`scripts/tools/verify-site.js:6337-6347`（`bearing` 的构造与 `textWidth` 的回落）
- **problem**：`textWidth` 的候选是「**直接**含非空白文本节点、且 display ∉ inline/none/contents 的元素」。当文本节点的承载者是 **inline 元素或匿名盒**时候选为空 ⇒ 回落到整条说明的 content box（1380px），判据看到「盒子满宽」，画面却是 70ch 窄柱：
  - **N9（只改 CSS，产物级已复现）**：`changes/` 的 13 条 `.snote` 都是纯文本，一条 `.snote { display: grid; grid-template-columns: minmax(0, 70ch) 1fr }`（写进共享 `<style>`，冻结串仍恰好 1 次）就把正文挤进**匿名网格项**；DOM 里没有任何元素承载这段文本 ⇒ 13 条全部 `textWidth 1380 / 字迹 156–451px`、**0 违规码**（`runs/adversarial2-scratch-grid.json`）。
  - **N7 / N10（改标记）**：`<div style="max-width:70ch"><span>正文</span></div>` ⇒ 文本的承载者是 inline `span`，div 不算候选 ⇒ `承载块 0 · fallback true · textWidth 1380 / 字迹 451.09`、**0 违规码**。
- **expected**：说明的可见文字被压到 70ch（= 本版本要防的那个外观）时，§22c 必须判红。
- **actual**：判绿；N9 已由我跑完整套件确认（§R2-3：**EXIT=0 / 842 项 0 失败 / `layoutViolations` 0**）。
- **requiredFix**：把候选从「直接承载文本的元素」改成「**文本节点 × 最近的块级祖先**」——对 `.snote` 内每个非空白文本节点向上找第一个 `display ∉ inline/none/contents` 的祖先，量其 content box 取最小（`<div><span>t</span></div>` ⇒ 量到 div；`<p class="snote"><a>t</a></p>` ⇒ 量到 p = 1380，41 条 fallback 不会变假红）；**再补一条行盒判据**覆盖匿名盒：用 `Range.getClientRects()` 把 rect 按 `top` 归并成行盒取并集宽 `lineWidth`，当「说明折行 ≥2 行且 `lineWidth < 0.85 × 列宽`」时判红（短单行文本天然填不满列宽，用「折行 ≥2 行」排除误报）。两条都要配 M 牙 + 在 dist/dist.baseline 上的零误报读数。

### F-R2-2 · blocker · 伪元素承载正文：判据完全看不见，报告里只有「字迹 null」一条线索
- **file**：`scripts/tools/verify-site.js:6278-6308`（`bearsText` / `inkOf`）
- **problem**：`.snote { font-size: 0 }` + `.snote::before { content: "正文…"; display:block; max-width:70ch; font-size:12px }` ⇒ 真实文本节点仍在 DOM（`bearing 1`、`textWidth 1380`），可见字形全由伪元素绘制（不在 DOM，`ink` 采不到 ⇒ `字迹 null`）⇒ **0 违规码**，画面是 70ch 窄柱。（acceptance 点名的方向之一：「伪元素承载文本」。）
- **expected**：要么判红，要么至少有一条独立的码指出「说明有文字但不可见」。
- **actual**：判绿；`inkWidth = null` 是唯一线索，且没有任何断言消费它。
- **requiredFix**：加一条便宜且明确的牙：说明文本非空、但 `ink === null`（或最长行宽为 0）⇒ 判红（「页面级说明有文字却没有任何可见字形」本身即缺陷），并做成一条 M 牙（`font-size: 0` 注入必须咬到）。

## R2-3. 产物级复现（F-R2-1 的 N9，整轮绿）

```
node …/review/make-scratch.cjs false-green-grid
   changes/index.html：注入「.snote { display: grid; grid-template-columns: minmax(0, 70ch) 1fr; }」
   冻结串出现次数（必须仍是 1）：1 · sha256 e8b43013f7ce… → 287a1edd2a34… · dist 未被触碰 = true
   产物树哈希 ca23169b7f5aadf7…
node scripts/tools/verify-site.js --dir=…/scratch/false-green-grid --json=…/runs/r2-false-green-grid.json
   ⇒ **EXIT=0 · 842 项断言 0 失败** · layoutNotes 401 条 / 窄条 0 · layoutViolations 0 页
现场量测（同一产物，`runs/adversarial2-scratch-grid.json`，判据逐字抽取）：
   changes/#0..#12 全部 盒 1380 · **textWidth 1380** · **字迹 156–451.52px**（最长行 ≤451.52）· 违规码 [无]
对照（未改的 dist 上同 13 条，`runs/adversarial2-dist-G0.log`）：textWidth 同样 1380，**字迹 156–972.23px**
   —— 其中 **6 条**（481.09 / 576 / 698.09 / 816 / 936 / 972.23）原本比 70ch 宽，被这条规则压回 ≤451px 的窄柱。
```

附带读数（另一种写法，`grid-template-columns: 70ch 1fr`）：`runs/r2-false-green-grid-fixed70ch.json` = EXIT=1，但失败原因是 **@390 溢出 / @360 note-clipped**（700px 固定列在窄视口撑破页面）——**@1440 与 @1600 的几何判据仍然是 0 违规**。也就是说：桌面档的「看不见」与窄档的「顺手被溢出咬到」是两件事，`minmax(0, 70ch)` 只是把后者也消掉了。

## R2-4. 与 round 1 的对照（同一把尺子）

| 维度 | round 1（t5 现场） | round 2（本轮现场） |
| --- | --- | --- |
| t5 F1 的 5 种「不改盒宽」形态 | 全部**放行** | 全部**咬中** |
| t5 F1 产物级复现 | 整轮 **EXIT=0 / 827 项 0 失败** | 整轮 **EXIT=1 / 5 项失败（全 §22c）**；同一副本不注入 = 842 项 0 失败 |
| t5 F2「只压非首个」 | 5 种写法全部**放行** | 4 种写法全部**咬中且带 route#index** |
| 条级覆盖 | 105/401 = **26.2%** | **401/401 = 100%** |
| M0 反证 | 页级 48 页 | 条级 **156 条 / 48 页**，与真值集合逐条相同，漏判 0 / 误报 0 |
| 桌面档 | 1440 | 1440 + **1600** |
| `--url=` | 一行打印，报告里 7 个键消失 | 10 个键全部 `{skipped:true,reason}` |
| 新增对抗 | （无此要求） | 10 条：6 咬中 / **4 放行（3 机制）** |

## R2-5. 证据与复现

```
research/_raw/secondary-page-layout-unification/review/
├── review.md                    ← 本文（round 1 原文在上，round 2 从「T8 复审报告（round 2）」起）
├── adversarial2.cjs             ← round-2 判据逐字抽取 + 20 条注入 + 守卫四例
├── make-scratch.cjs             ← negative | false-green-c1 | false-green-grid | plain
├── audit-r2-report.cjs          ← 读报告：失败归类 / 条级容器 / 跳过键
├── audit-r2-sets.cjs            ← 集合级独立复算（静态 156/48 + 两份报告）
├── audit-diff-shape-r2.cjs      ← +1109/−0 与逐字节重建（hunk 头现算）
├── scratch/{plain,false-green-c1,false-green-grid,negative}/
└── runs/r2-*                    ← 全部原始日志 / JSON / 分析
    ├── r2-summary.txt           （8 次运行的退出码）
    ├── r2-plain.json · r2-false-green-c1.json · r2-false-green-grid{,-fixed70ch}.json
    ├── r2-m0.json · r2-green.json · r2-url-mode.json · r2-ci-consistency.log
    ├── adversarial2-dist{,-run1}.json · adversarial2-scratch-grid.json
    └── r2-sets-check.txt · r2-diff-shape.txt · r2-make-*.txt · r2-*-analysis.txt
```

复现命令（worktree 根，浏览器套件串行）：

```bash
node research/_raw/…/review/make-scratch.cjs plain
node scripts/tools/verify-site.js --dir=research/_raw/…/review/scratch/plain            --json=research/_raw/…/review/runs/r2-plain.json            # EXIT=0
node research/_raw/…/review/make-scratch.cjs false-green-c1
node scripts/tools/verify-site.js --dir=research/_raw/…/review/scratch/false-green-c1   --json=research/_raw/…/review/runs/r2-false-green-c1.json   # EXIT=1
node research/_raw/…/review/make-scratch.cjs false-green-grid
node scripts/tools/verify-site.js --dir=research/_raw/…/review/scratch/false-green-grid --json=research/_raw/…/review/runs/r2-false-green-grid.json  # EXIT=0（F-R2-1）
node scripts/tools/verify-site.js --dir=dist.baseline --json=research/_raw/…/review/runs/r2-m0.json       # EXIT=1
node scripts/tools/verify-site.js --dir=dist --compare=research/_raw/ours-baseline/verify.json \
     --json=research/_raw/…/review/runs/r2-green.json                                                     # EXIT=0
node scripts/tools/check-ci-consistency.js                                                                # 38/38
node research/_raw/…/review/adversarial2.cjs dist dist                                                    # 20 条注入 + 守卫
node research/_raw/…/review/audit-r2-sets.cjs research/_raw/…/review/runs/r2-m0.json research/_raw/…/review/runs/r2-green.json
```

## R2-6. 结论（round 2）

修复轮把我上轮的两处 blocker 都真正关上了，而且关得很干净：判据从「盒宽」换成「有字区域」、从「第一条」换成「逐条 401 条」，兼容性（aliasnote / 60px 容器）与全部不变量（§22b 零改动、守卫、`--compare`、CI 38/38）都达标，M0 的条级真值集合也用我自己的静态口径复算过（48 页 / 156 条，集合逐条相同）。

但**判据量的仍然不是「画面上那根柱子」**：只要文本节点的承载者不是「直接含文本的块级元素」——匿名盒（grid/flex）或 inline 承载（div>span）——`textWidth` 就退化成整盒宽，画面 445–451px、判据 1380px、0 码；其中 **N9 只改一条 CSS 规则、不动标记，且整轮 842 项断言 0 失败**，F-R2-2 更是 acceptance 点名的伪元素方向。按契约「任何能骗过新判据的形态 = blocker finding」，交回 **needs_revision**（F-R2-1 / F-R2-2 两个 blocker，修复面都很小：候选改成「文本节点 × 最近块级祖先」+ 一条行盒判据、一条「有文字但无可见字形」的牙）。

---
---

# T15 复审报告（round 3）· 逐行字迹宽口径的对抗验证

## R3-0. 开场状态（如实记账：本轮开场时被判对象尚未落盘）

- **被判对象**：t14「把 §22c 窄柱判据改成逐行字迹宽 + `note-hidden-text` 牙 + 绘制类边界注释」。
- **开场复核（2026-10-06 17:0x）**：`scripts/tools/verify-site.js` = `4f4cb2e3b3f8e47d…`（mtime 16:11:12 = round-2/t7 那一版），全文**没有** `lineCount` / `widestLine` / `note-hidden-text`，§22c 里也**没有**绘制类遮盖（overlay/clip-path/mask）的边界注释；`git diff --numstat` 仍是 `1109 0`。
- **harness 的动作（按契约纪律，不静默跳过）**：`review/adversarial3.cjs` 用**锚点式**抽取，并带 preflight 体检（源文件必须含 `note-hidden-text` / `lineCount` / `widestLine`，且抽出的判据函数体里必须真的用逐行量）。开场跑 `--preflight` ⇒ **exit 1 判红**，理由逐字：
  `❌ preflight 判红：源文件里找不到标记「note-hidden-text」（round-3 的逐行字迹口径尚未落盘）`（原始输出：`runs/r3-preflight.txt`）。
  ⇒ **本轮开场不做任何几何结论**。
- **这不是 finding**（captain 2026-10-06 明确裁定）：t14 未落盘属于**调度状态**，不是被审对象的缺陷，不得写成 needs_revision 的 results；落盘后重跑本报告。
- **已就绪、落盘即可开跑**（本回合已备好）：
  · `review/make-scratch.cjs` 新增 target `r3-false-green-grid` ⇒ 产物已建：`changes/` 共享 `<style>` 注入 `.snote { display: grid; grid-template-columns: minmax(0,70ch) 1fr }`，冻结串仍恰好 1 次（sha256 `e8b43013f7ce… → 287a1edd2a34…`），产物树哈希 `ca23169b7f5aadf7…`，"dist 未被触碰 = true"（`runs/r3-make-grid.txt`）。
  · `review/adversarial3.cjs`：锚点式抽取 + preflight + **14 条场景**（F-R2-1 grid/`div>span`、F-R2-2 伪元素承载正文、t11 multicol / float / overlay、round-3 新增 `max-inline-size` / `display:table` / `zoom` / `shape-outside` / `contain:inline-size` / `-webkit-line-clamp` / `direction:rtl`，外加正对照与守卫四例）。
  · `review/audit-r3-notes.cjs`：`--dir=dist` 逐条 `lineCount/widestLine` 抽查（≥15 条：最短单行 / 最宽多行 / 3 个别名页 / `archive/` 5 条 / `changes/` 13 条）+ `--dir=dist.baseline` 156 条 / 48 页集合级复算 + **静态独立复算**（带 70ch 规则的页数与条数）。
  · 复跑清单（t14 落盘后逐条执行）：`make-scratch r3-false-green-grid` → 套件（grid / plain / baseline / green+compare）→ `check-ci-consistency` → `--url=` → `adversarial3` 驱动 → `audit-r3-notes` 集合与逐条抽查；另按 captain 的交叉线索**只用 t11 的脚手架、不看其结论**重跑一份独立标定。


---

## round 3（T15 · reviewer-2）复审结论 —— 见 `review/R3-review.md`

- **verdict = needs_revision**（1 blocker + 2 low）。
- 上轮两条 blocker **确实反转**：`display:grid; grid-template-columns:minmax(0,70ch) 1fr`（只改一条 CSS）⇒ 整轮 **EXIT=1**，命中的是新增的 `note-ink-narrow`（旧 `note-narrow` 0 条）；伪元素承载正文 ⇒ `note-hidden-text`（13/13）。同副本不注入 ⇒ EXIT=0（848/848）。
- 并集两向达标：`dist.baseline` 并集 = **156 条 / 48 页**（与 truth-401 集合级逐条相同、零漏判）；`dist` = **layoutViolations 0**（854/854，--compare 6 项全绿）。
- **blocker（R3-1）**：逐行字迹口径只在 1440/1600 判，而 **760 档列宽 728 > 70ch 实测 452.81** ⇒ 同一条窄柱在 760 物理上会发生；把口径开到 760 **误报 0 条**（独立探针 186 页/401 条 = 0；工具内存补丁实跑 @760 = 0 违规码）。复现：把 F-R2-1 那条 CSS 包进 `@media (max-width:760px)` ⇒ `changes/` 6 条在 760 最宽 432–445px（比值 0.60）而**整轮 848 项 EXIT=0**。
- low：R3-2 分码归属表述（实测 ①=156 / ②=108，truth 的 48 是 `index===0` 切分；注释里的"89 条"复算为 319）；R3-3 ① 的 `contentBox===0 ⇒ 回落 border-box` 在 `display:contents` 上误报 + 一处过时注释。
- 全部读数与脚手架：`review/R3-review.md` §1–§11 与 `review/runs/**`。本轮**零写入生产源码 / dist / dist.baseline**。
