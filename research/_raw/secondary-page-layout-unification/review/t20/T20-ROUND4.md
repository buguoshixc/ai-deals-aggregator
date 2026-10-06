# T20 · 复审 round 4 —— 物理前置条件口径的对抗验证（R3-1 闭合 + 判据未削弱）

> 复审者：`reviewer-3`（task `t20`，attempt_id `77b40798-4ffd-440f-a8e9-a393ce7cf802`，全新会话）。
> 被复审对象：`scripts/tools/verify-site.js` sha256 `fd3c9a3090dca11bb6c34342505506bb44f4720c39fe4b18f4d7c23481f46d5`
> （改前备份 `teeth/_backup/verify-site.pre-t19.bak` = `108818856cdf40a4812feb35ecd6917f7ad328681206b3457ed5dc11c7edef06`，两枚哈希本轮开始时/结束时各量一次，均一致）。
> **本报告的全部读数由复审方自己的装置跑出**；t19 的自留脚本、日志、报告只当线索，不作证据。
> 写盘范围：`research/_raw/secondary-page-layout-unification/review/t20/**`。`dist` / `dist.baseline` / 生产源码零写入（§7 有哈希与 git status 读数）。
> 结论：**verdict = pass**（R3-1 闭合、判据未削弱、R3-2/R3-3 订正属实、dist 零误报、baseline 零漏判零误报）；另有 1 项**交接项**见 §6（不在 t19 inScope，不影响本轮放行）。

---

## 0. 装置与命令（全部可复跑）

| 装置 | 作用 |
| --- | --- |
| `review/t20/harness/mk-scratch.cjs` | 从 `dist` 造三份副本：`clean`（逐字节拷贝）· `grid760`（**186 页**全部在冻结 `.snote` 规则后追加 `@media (max-width:760px){.snote{display:grid;grid-template-columns:minmax(0,70ch) 1fr}}`）· `contents`（186 页追加 `.snote{display:contents}`）；逐页校验冻结串恰好 1 次；跑前跑后对 dist 全树 303 文件做 sha16 清单 |
| `review/t20/harness/mk-scoped.cjs` | 只注入 `changes/index.html` 的 `grid760-changes`（R3-1 的「直接文本节点」形状：① 看不见） |
| `review/t20/harness/run-old.cjs` | 把**改前备份**源码在内存里 `Module._compile` 成生产路径（相对 require 照常解析），生产文件零写入 |
| `review/t20/harness/run-matrix.cjs` | 10 次整轮 `verify-site.js --dir=… --json=…`，逐次记 EXIT / 断言数 / 失败数 |
| `review/t20/harness/analyze-t20.cjs` · `inspect-contents.cjs` · `static-invariants.cjs` | 报告逐条/逐集合复算 · 条级码分布 · 静态不变量（§22b 逐字节、check() 字面量多重集） |
| `review/t20/harness/probe-760.cjs` · `probe-column-basis.cjs` · `probe-variants.cjs` | **独立物理探针**（Playwright + Edge，自己实现 Range 逐行归并与 70ch 现场量），量盒宽/行数/最宽行/列基准/70ch |

命令（worktree 根）：`node review/t20/harness/mk-scratch.cjs` → `mk-scoped.cjs` → `run-matrix.cjs`（10 次整轮，约 20 分钟）→ `analyze-t20.cjs` / `inspect-contents.cjs` / `static-invariants.cjs` → `probe-760.cjs` / `probe-column-basis.cjs` / `probe-variants.cjs` → `geometry/gate-vs-truth.cjs`（两份报告）→ `scripts/tools/check-ci-consistency.js --expect-checks=38`。

---

## 1. R3-1（唯一 blocker）· 是否真闭合 —— 独立反转实验

### 1.1 同一份产物、只换口径（A/B 的关键）

| run | 口径 | 产物 | EXIT | 断言 | 失败 | 失败断言 |
| --- | --- | --- | --- | --- | --- | --- |
| `new-grid760-changes` | 改后 `fd3c9a30…` | `scratch/grid760-changes` | **1** | 848 | **1** | `§22c @760 样本集`（6 条 `note-ink-narrow`） |
| `old-grid760-changes` | 改前 `10881885…`（内存编译备份） | 同上 | **0** | 848 | **0** | 无（**假绿复现**） |
| `new-clean` | 改后 | `scratch/clean`（同副本不注入） | **0** | 848 | 0 | 无 |
| `new-grid760` | 改后 | `scratch/grid760`（186 页全注入） | 1 | 848 | 2 | `@760 样本集`（157 条）· `@360 样本集`（66 条，**全是 ① note-narrow，0 条 ink**） |
| `old-grid760` | 改前 | 同上 | 1 | 848 | 2 | 同两条（① 能看见承载子块被压进 70ch 轨） |

`new-grid760-changes` 的 @760 detail（原文摘录）：

```
6 条违规码 [changes/#0 note-ink-narrow, changes/#1 …, changes/#2 …, changes/#4 …, changes/#8 …, changes/#12 …]
changes/#0 逐行字迹：最宽一行 445.05px < 0.85 × 列宽 —— 盒宽 728px · 内容盒 728px · 行 2 行 · 字形盒 2 个 · 列宽 728px · 阈值 618.8px
```

⇒ **闭合成立**：`@media (max-width:760px)` 包裹的同一类 70ch 窄化，改前整轮 EXIT=0 放行，改后整轮 EXIT≠0 且命中的是 `note-ink-narrow`；不注入的同一副本 EXIT=0。

### 1.2 独立物理探针（不引用门禁的任何函数）

`probe-column-basis.cjs`（把该条自己的字体复制到屏外探针量 `width:70ch`，自己实现逐行归并）：

* `changes/ @760`：列基准 728 · 70ch **452.81** · 13 条盒宽全 728；
  注入后 ink-narrow = **#0 445.05 · #1 445.09 · #2 432 · #4 444 · #8 444 · #12 444.23**（其余单行条不算窄）—— **与门禁 6/6 逐条同值**。
* `feeds/ @760`：7/7 与门禁一致（443.20 · 444 · 444 · 445.11 · 488.81 · 488.81 · 533.77）。
* `plans/ @760`：列基准 = 主数据区 `.pchglist` 的**内容盒 676**（不是 main 的 border-box 728）；按 676 算 7/7 与门禁一致。
  （复审方第一版探针用 border-box 估列宽，把 `plans/#5` 584.81px 误算成「窄」；按门禁的 `min(主数据区,页面列)` 口径复核后归零 —— 这是**探针**的基准误差，不是门禁的漏判。）
* 封锁形状成立：`changes/ @760` 盒宽 728（满宽）而字迹 432–445px ⇒ 「盒满宽、字被排进 70ch 轨」是**现场量出来的**，不是判据自述。

### 1.3 R3-1 主张逐条核对

| t19 主张 | 独立复核 |
| --- | --- |
| 改后 @760 命中 6 条 `note-ink-narrow` [#0 #1 #2 #4 #8 #12] | ✅ 逐条一致 |
| 最宽 445.05/445.09/432/444/444/444.23 | ✅ 逐值一致（门禁 detail 与独立探针两边都对上） |
| 改前同一产物 EXIT=0 | ✅ 用改前备份整轮跑出 EXIT=0 / 0 失败 |
| 1440 列 1120–1380 · 1600 列 1120–1380 · 760 列 676–728 · 360 列 276–328 · 70ch 452.81 | ✅ 报告 `layoutSweep.inkScope*` 与独立探针（728/676/328/452.81）一致 |
| `meta.inkRule` 调用点 0 处 | ✅ 全文 `inkRule` 只剩 1 处**注释**（L6985），`meta.inkRule` 1 处（同一行注释） |
| 判据 `min(主数据区,页面列) > ch70` | ✅ 源码 L6605–6606；ch70 缺失时按 0 ⇒ 照判（宁可多判，不静默跳过） |

---

## 2. 这次修理不是靠削弱达成的（逐条比对）

| 检查 | 读数 |
| --- | --- |
| `WIDE_NOTE_RATIO = 0.85` | 改前/改后同一行、同值（L6185 → L6194） |
| ② 前置 `note.lineCount >= 2` | 判据式逐字未动：`… && note.lineCount >= 2 && note.widestLine < threshold - 0.01`（改前 L6552 / 改后 L6607–6608） |
| `threshold = WIDE_NOTE_RATIO * column`、`column = min(region.width, main.width)` | 未动 |
| 运行期断言数 | `--dir=dist` 与 `--dir=dist.baseline` 改前/改后**都是 848**（4 次整轮实测） |
| 断言名单 | 848 名逐名多重集比对：**删 2、增 2**，正是 `§22c @760/@360 样本集` 两条改名（旧名「旧口径 textWidth…只在桌面档判」→ 新名「同一份判据；逐行字迹按**物理前置条件**判」）；**无任何断言被删除或改名规避** |
| 静态 `check(` 字面量 | 481 → 481；字面量多重集只差 1 条（样本集模板串） |
| `meta.inkRule` 调用点 | 3 → **0** |
| §22b 区间 | `/* §22b`→`/* §22c` 切片 **37,318 B · sha16 `077dc51ef68af7fd` · 改前改后逐字节相同**（583 行窗口） |
| 改动落点 | 自己的 diff（-U3）= 14 hunk / -U0 = 24 hunk，全部在 §22c 块内（最早改前行 6124），+146/−37，与 t19 自报一致 |
| 新增的量 | `ch70Of` 现场尺子（36 处 ch70 引用）、`criteria.inkScope`、`metrics.layoutSweep.inkScope*`、`metrics.layoutSampleScope`、样本集 detail 里的物理作用域读数 |

**「760 新增覆盖了，为什么断言数没变？」** —— 因为 @760 样本集断言**改前就存在**（旧代码在循环体里用 `Object.assign({}, meta, { inkRule: false })` 把 ② 关掉），t19 只删掉了这个开关（`wideProblems(geometry, meta)`），没有新增断言。覆盖面的扩大发生在**同一条已有断言内部**：旧名/新名各 848 名中的 1 条。实测佐证：改前 binary 在 `dist.baseline` 上跑出的 @760 断言**已经是红的**（见 §3），且在 `grid760-changes` 上是绿的 —— 同一断言、同一位置，只换判据。

---

## 3. dist / dist.baseline 读数（复审方实跑）

| run | EXIT | 断言 | 失败 | 条级容器 | 并集 | 藏字/未渲染 |
| --- | --- | --- | --- | --- | --- | --- |
| `new-dist` | **0** | 848 | **0** | `layoutNotes` 401 条（1440）· `layoutNotesAt1600` 401 条 | 0 | 0 / 1 |
| `new-baseline` | 1 | 848 | **33** | 同上 401/401 | **156 条 / 48 页** | 0 / 1 |
| `old-baseline` | 1 | 848 | **33** | 401/401 | 156 / 48 | 0 / 1 |

* `new-dist`：0 违规码、401 条逐条有读数（`lineCount/widestLine/column/codes/inkWidth/…` 无缺字段，`notesMissingReadings = 0`）；`layoutSweep = {narrow 0, ink 0, union 0, hiddenText 0, unrendered 1}`。
* `new-baseline`：`narrow 156（盒宽全 452.81）· ink 108 · 交集 108 ⇒ ② ⊆ ① · ① 里单行 48 · 页集合 48`；`alreadyFine` 误报 **0**。
* **逐条集合与 truth-401 相同**：真值 156 键 ↔ 报告 156 键，双向差集都是 **0**（不是只做 ⊇）。
* 改前 vs 改后失败断言集合：只差样本集那一条改名；**@760 断言改前就是红的**（旧 detail 首条即 `category/#0 note-narrow … 盒宽 452.81px`），改后仍是红的（196 条），失败总数 33 → 33 ⇒ t19 的「诚实项①」属实：那不是 t19 制造的新红，而是 baseline 的缺陷在 760 档**真的存在**（盒 452.81 < 列 676–728）。
* 消费者 `geometry/gate-vs-truth.cjs`（跑**本轮新报告**）：`--expect=green` **pass**（误报 0）；`--expect=baseline` **pass**（漏判 0 条 / 0 页 · 误报 0 · 条级容器在位）。
* 独立旧探针数据集交叉核对（`geometry/all-notes-before.json`，非本轮产物）：105 页 / 401 条 / 156 条窄 / 盒宽集合 {452.81} —— 与我的实测同值。
* `check-ci-consistency.js --expect-checks=38`：**38 项 / 失败 0**，EXIT=0。

---

## 4. R3-2 订正与实测一致

| 主张 | 复审方复算（`new-baseline` 401 条的条级读数） |
| --- | --- |
| ① = 156 条，盒宽全 452.81 | ✅ 156；`narrowWidths = [452.81]`（唯一值） |
| ② = 108 条多行，② ⊆ ① | ✅ 108；`inkSingleLine = 0`；`ink − narrow = 0` |
| ① 里单行 48 | ✅ `narrowSingleLine = 48`（`narrowMultiLine = 108`） |
| truth 的 `caughtByOldCriteria(48)` = `make-truth-401.cjs:56` 的 `index === 0` 按序切分 | ✅ 源码逐字核对；48 条 index 全为 0 |
| 那 48 条**全是多行**、且都落在 ② 里 | ✅ `lineCount ∈ {2,3,4,5,6,7,8}`，48/48 带 `note-ink-narrow` |
| ① 里那 48 条单行**反而全在 `onlyNewTruth`** | ✅ `onlyNewTruth` 单行 48 / 多行 60；`caughtByOldCriteria ∩ 单行 = 0` |
| 「89 条」复算为 319（@1440 与 @1600 都是 319） | ✅ 用**自己的 dist 报告**复算：`rendered && !vertical && lineCount === 1 && widestLine < 0.85×column` ⇒ **1440 = 319 · 1600 = 319**；且 dist 上这 319 条 `codes` 全空 ⇒ 去掉 `lineCount>=2` 确实会多报 319 |

两处「48」不是同一批：**已按集合验证**（交集为空、分属两个集合），R3-2 的订正是实测事实，不是改写措辞。

---

## 5. R3-3 订正与实测一致（含反向面）

| 检查 | 读数 |
| --- | --- |
| ①/同轴/裁切加盒量前置 | 源码 `const boxed = note.rendered;`（`rendered = noteBox.width>0 && height>0`）罩住 `note-narrow` / `note-axis` / `note-clipped` |
| ② 加强成「有字形盒证据就判」 | `(note.rendered || note.glyphRects > 0)` —— 无盒但有字形 ⇒ 照判 |
| `display:contents` 不再假红（1440 条级） | 同一份 `scratch/contents`（186 页全部 `display:contents`）：**改前 401/401 条全假红**（`note-narrow 401 + note-axis 401`）→ **改后 401 条全 0 码**。t19 自报的 18 条是 3 页定点样本；复审方把它放大到全站 401 条，结论不变 |
| 文本仍被量到 | `contents` 下 401 条 `rendered=false` 但 1440 档 `layoutNotes` 的 `inkWidth/lines` 仍逐条有值；@760 样本 detail 里 `changes/#1 457.09px / #4 540px`（盒 0、字形盒 2、2 行）——独立探针在 `scratch/contents @760` 量出同样的 457.09 / 540 ⇒ 门禁的这两条是**真实窄字迹**（② 用字形证据抓到 ① 看不见的形态），不是假红 |
| 不会被反用成绕过面（变体探针，1440，changes//feeds//plans/ 共 33 条） | `rtl` ⇒ 盒窄 0 / 字迹窄 0；`zoom 0.75/1.5` ⇒ 不改变 `rendered`，判据路径不变（探针里 0.75 档出现的「盒窄」是探针把缩放后的 rect 与未缩放的 clientWidth 混算造成的，属 `wideMeasure` 既有的量测基准，非 t19 改动）；`display:contents` ⇒ 1440 档两条判据都沉默（正确，因为无盒可量） |
| 残余边界（**有量、非 blocker**） | `display:contents` + 祖先 70ch 网格轨（变体 V5）：33 条里 14 条多行被 ② 咬中（6/5/3），另有 **16 条单行**在 452.81px 轨里既无盒量、也无行证据 ⇒ 不判；但**每一页都仍红**（页级断言由多行条兜住）。这是「单行无盒」这一格的认知边界（② 的前置 `lineCount>=2` 是 t14 起就有的，不是本轮新增），已在 t19 注释里写明「无盒形态不判窄柱/轴/裁切」 |

---

## 6. 必查 5 · 两处「过时注释前提」的判定（**交接项，非 finding**）

* 现场：`geometry/make-truth-401.cjs`（L6–7、L54–56 `index === 0 ? …`）与 `geometry/make-synthetic-reports.cjs`（L6、L96–97、L115）仍按「旧口径只逮 48 条 / 108 条是 index>0、盒宽满宽」叙述；而复审方实测（§4）是 **① = 156（全 452.81）· ② = 108 且 ②⊆①**，`caughtByOldCriteria(48)` 只是**按序切分的位置切片**（那 48 条全是多行）。合成夹具的码分布（48 note-narrow + 108 ink 的**划分**）也与真实门禁（156 note-narrow，其中 108 叠加 ink）不同形。
* 影响判定：
  * **不影响真值语义**：`gate-vs-truth.cjs` 只消费并集（L74 `expectedNarrow = caughtByOldCriteria ∪ onlyNewTruth`），复审方用本轮新报告跑两遍都 pass；页集合/条集合/对照组三类断言与真值逐条一致。
  * **会让后续复核误读归属**（R3-2 就是这么来的）：夹具作者若照抄「48 note-narrow + 108 ink」建模，会得到一个现实中不存在的码分布。
  * `verify-site.js` 一侧已在 t19 本轮改写（头注释 L6124–6133 · `criteria.coverage` · 新增 `criteria.inkScope`），风险的主要出口已被堵住。
* 处置：t19 已在报告 §6.3 明确交接且这两个文件不在其 inScope ⇒ 复审方按**交接项**上报，不构成对 t19 交付物的 finding，不影响本轮放行。
* requiredFix（建议下一轮由 `geometry/**` owner 执行，或单开 t 编号）：把 `make-truth-401.cjs` 的 `classify()` 命名改为位置语义（如 `perPageFirstNarrow` / `beyondFirst`）或补注释「位置切分、非旧口径命中集合」；把 `make-synthetic-reports.cjs` L6/L96–97 的「48 + 108」改为「① 156（含 48 单行）∪ ② 108 = 156」并在夹具里保留一份**真实分布**样本（156 note-narrow，其中 108 叠加 ink）。

---

## 7. 边界与完整性

* **360 档未误伤**：改后 `new-baseline` 的 `@360 样本集` = ✓（0 违规码），改前 `old-baseline` 同为 ✓；`new-dist` 848/0 亦覆盖 360；`scratch/clean @360` 与 `scratch/grid760 @360` 的独立探针读数**逐值相同**（盒 328、最宽 156–326.09，多行 9/13）⇒ 媒体查询在 360 档物理上不产生窄化，`column 276–328 < 70ch 452.81` ⇒ ② 正确地不判。全局 grid760 运行时 @360 的 66 条码**全部是 ① `note-narrow`、0 条 `note-ink-narrow`**（① 看见的是被压进轨道的内层承载块），与 ② 的作用域无关。
* **零写入**：`mk-scratch.cjs` 的 dist 全树 303 文件 sha16 清单跑前跑后相同；`new-sha` 收尾复核 `scripts/tools/verify-site.js = FD3C9A3090DCA11B`（未被本轮任何动作触碰）；`git status --porcelain dist dist.baseline` = 0 条；`dist/changes/index.html` = `e8b43013f7ce2974`（与 t19 报告里的读数一致）。
* **未覆盖**（如实登记）：未跑 `--dir=dist.synth-fixed`（不在 verify 清单）；未复跑 t19 的定点 `r4-contents.cjs` 3 页夹具（用全站 401 条的等价实验替代）；`zoom`/`rtl` 用的是 runtime 注入探针而非整轮门禁（因为 t19 的改动在 `rendered===true` 路径上不产生分支，整轮跑与探针结论等价）。
* **成本**：10 次整轮 ≈ 20 分钟（每次 113–126s）· 3 个探针 ≈ 2 分钟 · 浏览器独占期间无并发。

## 8. 结论

| 验收项 | 判定 |
| --- | --- |
| R3-1 反转由独立 harness 证实（注入 ⇒ EXIT≠0 且命中 `note-ink-narrow`；不注入 ⇒ EXIT=0） | **pass**（§1） |
| 360 档边界成立；dist / dist.baseline 在 360 无新增违规码 | **pass**（§7） |
| 不是靠放宽阈值/前置条件：0.85 与 `lineCount>=2` 逐字未改；断言数不减少；无断言被删/改名规避 | **pass**（§2） |
| dist：EXIT=0、0 违规码、401 条逐条有读数 | **pass**（§3） |
| dist.baseline：并集 156/48、漏判 0、误报 0、逐条集合与 truth-401 相同 | **pass**（§3） |
| R3-2 / R3-3 订正与实测一致 | **pass**（§4/§5） |
| §22b 逐字未改；check-ci-consistency 38/38 | **pass**（§2/§3） |

**verdict = pass** ⇒ 放行 t16 证据复跑。唯一移交事项是 §6 的两处注释/夹具前提（不在 t19 inScope、不影响消费者语义）。
