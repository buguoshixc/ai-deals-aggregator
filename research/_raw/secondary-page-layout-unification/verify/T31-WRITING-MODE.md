# T31 · 定点重测：`category/agent/#0` 的 `writing-mode` 覆盖不对称（轮 6 口径是否已被咬中）

> 执行者 `evidence-runner`（task `t31`，verification，attempt `7a424104-bf5c-4b2c-a32d-637ac1e4a182`）
> 判据标的：**轮 6 冻结版** `scripts/tools/verify-site.js` = `2cbc160dc64f8ade513824065b42d8e38ad7c72dd417cb418bde8d5526b44a5e`（522,527 B）——跑前/跑后/跑后复量三次同值（`t31/post-checks.txt` §1）
> 形态（逐字取 t11 的 `form.injection`）：`.snote { writing-mode: vertical-rl; width: 100%; height: 5.6rem; overflow: hidden; }`，注入 `category/agent/index.html` 共享 `<style>` 的**冻结串规则之后**
> 基础：`HEAD = origin/master = 1f225d2` · 浏览器 Edge（`msedge.exe`，`DSH_EDGE` 可覆盖）· 本轮 4 个动作，`dist` / `dist.baseline` / 生产源码零写入（§8）

---

## 1. 定性结论（一句话）

**在轮 6 口径下这条不对称仍未被「窄柱」那两条判据咬中：`note-narrow` 与 `note-ink-narrow` 在 5 档（1440/1600/760/390/360）上都是 0 —— 竖排被 ② 显式排除、且盒/内容盒满宽让 ① 看不见；唯一咬到它的是 `note-clipped`，只在 @360 一档（说明自身横向溢出 **19px**，`scrollWidth 347 > clientWidth 328`），整轮 852 项 / 失败 1 ⇒ EXIT=1。**
⇒ 与报告 §J ③ 预设的第二种结局一致（「仍只有 @360 靠溢出副作用接住」）⇒ **P1 保留，不记为已闭合**；这也正是报告 §J ③「@1440 咬中 ⇒ 记为已闭合；仍只有 @360 ⇒ 保留本 P1」里的后者。

两边的原始读数（门禁自己的嘴 + 我自己的探针）：

```
✗ §22c @360 样本集 29 页（同一份判据；逐行字迹按**物理前置条件**判：现场列宽 > 70ch 时判） — 1 条违规码 [category/agent/#0 note-clipped]：
  category/agent/#0 note-clipped：category/agent/#0 说明自身横向溢出 19px（scrollWidth 347 > clientWidth 328）
❌ 验收 852 项，失败 1 项                                   ← gate-form（注入形态的 scratch 副本），FORM_EXIT=1
  ✓ §22c @1440 逐条页面级说明：… note-narrow 0（落在 0 页） · note-ink-narrow 0（0 页） · 并集 0 条 / 0 页 · 藏字 0 · 不同轴 0 · 裁切 0 · 多行说明（有行证据）49 条 · 竖排 3 条 ·
  ✓ §22c @1600 逐条页面级说明：… 同上（竖排 3 条）                     ← 门禁**看见了**这条是竖排（vertical=true），但仍给 0 码
  ✓ §22c @760 样本集 29 页 … — 0 违规码
  ✓ §22c @390 全站 186 页 documentElement.scrollWidth ≤ 视口+1 — 最宽的一页 390px（视口 390）
✅ 验收 852 项，失败 0 项                                   ← gate-dist（线上产物原样），DIST_EXIT=0
```

## 2. 装置与命令（可逐条复跑）

| 装置 | 作用 | 独立性 |
| --- | --- | --- |
| `verify/t31/writing-mode-probe.cjs` | 5 档量该页该条：盒宽 / clientWidth / 内容盒 / 有字区域代理量 / 字形盒数 / 横排归并行数 / 竖排归并列数 / 可见字迹并集 / 自身与页面 scrollWidth-vs-clientWidth；并按轮 6 公开口径**独立复算**违规码 | 只 require playwright-core + fs/http/path；**不 require** `verify-site.js`，也不 require `scripts/lib/**`；70ch 现场尺子、逐行/逐列归并、码的复算全自写 |
| `verify/t31/mk-form-scratch.cjs` | 造 `verify/scratch/t31-form/`（dist ×303 文件副本 + 只注入 `category/agent/index.html` 一个文件） | 逐文件 sha256 对账：与 dist 不同 **1/303** · 冻结串 1 → 1 · +85 B · **dist 被写 0 个** |
| 门禁（轮 6）两次 | `--dir=<scratch 副本>` 得形态自己的码；`--dir=dist` 得线上原样的码 | 只读产物；其自带「变异牙零磁盘污染」断言在本轮同样 ✓（四个被改产物 sha 前后相等） |

```bash
# ① 探针（不注入，量线上原样）
node research/_raw/secondary-page-layout-unification/verify/t31/writing-mode-probe.cjs \
  --dir=dist --label=dist --out=research/_raw/secondary-page-layout-unification/verify/t31/probe-dist.json
# ② 探针（把 §J③ 形态在浏览器内存里注入 —— 零写盘）
node research/_raw/secondary-page-layout-unification/verify/t31/writing-mode-probe.cjs \
  --dir=dist --form=1 --label=form --out=research/_raw/secondary-page-layout-unification/verify/t31/probe-form.json
# ③ 造形态副本（只写 verify/scratch/**）
node research/_raw/secondary-page-layout-unification/verify/t31/mk-form-scratch.cjs
# ④ 门禁：形态副本（852 项 / 失败 1 ⇒ EXIT=1）与线上 dist（852 项 / 失败 0 ⇒ EXIT=0）
node scripts/tools/verify-site.js --dir=research/_raw/secondary-page-layout-unification/verify/scratch/t31-form \
  --json=research/_raw/secondary-page-layout-unification/verify/t31/gate-form.json
node scripts/tools/verify-site.js --dir=dist \
  --json=research/_raw/secondary-page-layout-unification/verify/t31/gate-dist.json
# 派生：从两份报告切 §22c 与 category/agent/ 的读数（不跑浏览器）
node research/_raw/secondary-page-layout-unification/verify/t31/slice-gate.cjs
```

## 3. 五档逐值（逐档列值，不只给结论）

### 3.1 注入形态（`writing-mode: vertical-rl; width: 100%; height: 5.6rem; overflow: hidden`）

| 档 | 盒宽 border-box | clientWidth | 内容盒（−padding） | 有字区域代理量 | 字形盒数 | 横排归并 | 竖排归并 | 单字形盒宽 | 可见字迹并集 | 自身 scrollW/clientW | 页面 scrollW/clientW | §22c 码（门禁实测） | 探针复算 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **1440** | 1380 | 1380 | 1380 | 1380 | 24 | 1 行（最宽 342.25） | **17 列**（最宽 87.3） | 16 | 342.25 × 87.3 | 1380/1380（0） | 1440/1440（0） | **无**（0 违规码；门禁标「竖排 3 条」） | 无 |
| **1600** | 1380 | 1380 | 1380 | 1380 | 24 | 1 行（342.25） | 17 列（87.3） | 16 | 342.25 × 87.3 | 1380/1380（0） | 1600/1600（0） | **无** | 无 |
| **760** | 728 | 728 | 728 | 728 | 24 | 1 行（342.25） | 17 列（87.3） | 16 | 342.25 × 87.3 | 728/728（0） | 760/760（0） | **无**（@760 样本集 0 违规码） | 无 |
| **390** | 358 | 358 | 358 | 358 | 24 | 1 行（342.25） | 17 列（87.3） | 16 | 342.25 × 87.3 | 358/358（0） | 390/390（0） | **无**（390 档只看页面溢出，0） | 无 |
| **360** | 328 | 328 | 328 | 328 | 24 | 1 行（342.25） | 17 列（87.3） | 16 | 342.25 × 87.3 | **347/328（溢出 19）** | 360/360（0） | **`note-clipped`**（1 条，@360 样本集） | `note-clipped` |

列基准（探针现场量）：1440/1600 列 **1380** · 760 列 **728** · 390 列 358 · 360 列 **328**；现场 70ch = **452.81**（每一档都把这条说明自己的字体复制到屏外探针量 `width:70ch`）；② 的物理前置条件 `min(列) > 70ch`：1440/1600/760 **成立**、390/360 **不成立**（门禁本身只在 1440/1600 全站逐条与 760/360 样本集判 ②，390 档只量页面溢出）。

### 3.2 线上产物原样（`dist`，未注入）

| 档 | 盒宽 | 内容盒 | 有字区域代理量 | 字形盒数 | 横排归并 | 单字形盒宽 | 自身溢出 | 页面溢出 | §22c 码（门禁实测） |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **1440** | 1380 | 1380 | 1380 | 7 | **1 行，最宽 1351.69** | — | 0 | 0 | **无** |
| **1600** | 1380 | 1380 | 1380 | 7 | 1 行（1351.69） | — | 0 | 0 | **无** |
| **760** | 728 | 728 | 728 | 8 | **2 行，最宽 724.39** | — | 0 | 0 | **无** |
| **390** | 358 | 358 | 358 | 10 | **4 行，最宽 356.45** | — | 0 | 0 | **无** |
| **360** | 328 | 328 | 328 | 11 | **5 行，最宽 327.3** | — | 0 | 0 | **无** |

⇒ 线上这一条是正常横排说明：字迹把列宽用满（1351.69/1380 = 98%、724.39/728 = 99.5%、327.3/328 = 99.8%），两条窄柱判据在 5 档全绿 —— 「修复后的产物本来是对的」也逐档量过了。

## 4. 门禁自己的两次读数（不是我的复算）

| 轮 | 命令（`--dir=`） | 断言 | 失败 | EXIT | `category/agent/#0` 的码 | 竖排计数 |
| --- | --- | --- | --- | --- | --- | --- |
| gate-form | `verify/scratch/t31-form`（只改 1/303 个文件） | **852** | **1** | **1** | @360 `note-clipped`（19px），其余四档无 | `verticalNotes = 3` |
| gate-dist | `dist`（原样） | **852** | **0** | **0** | 无 | `verticalNotes = 0` |

`layoutSweep`（gate-form）：`narrowNotes 0 · inkNarrowNotes 0 · narrowUnionNotes 0 · hiddenTextNotes 0 · unrenderedNotes 1 · verticalNotes 3 · overflowPages 0 · unclassified 0`；族分类 `wide 55 / detail 131 / other 0`（与 dist 相同）。
⇒ **门禁确实把这条认成了竖排（3 条），但仍然一条窄柱码都不发** —— 「看见竖排但不判」是轮 6 的明文设计（源码 §22c 头注释 L6166–6169），不是漏测。

## 5. 物理原因（为什么两条「窄柱」判据咬不到）

1. **① `note-narrow` 量的是「内容盒代理量」**（`textWidth`）：竖排不改变盒子几何 —— 这条的盒/内容盒在 5 档恒等于列宽（1380/728/358/328），阈值 1173/618.8/304.3/278.8 全都不满足。
2. **② `note-ink-narrow` 对竖排显式不判**（L6166–6169：「竖排的『行』是竖列，横排意义的行宽在这里没有对应量 ⇒ ② 显式不判（metrics 里标 vertical=true）」）。即使不排除，它也过不了前置：按 y 重叠归并这条只有 **1 行**（17 个竖排片段被按 x 重叠归并成 17 列），`lineCount >= 2` 不成立；而 17 列里最「宽」的一列是 87.3px（竖排的一列高度），对应不到「最宽一行 16px 的字迹宽」。
3. **③ 不是藏字**：24 个可见字形盒，并集 342.25 × 87.3px，文字真的画出来了 ⇒ `note-hidden-text` 不该响，实测也没响（响在这里才是误报）。
4. **④ `note-clipped` 只在「盒子装不下那根竖条」时才响**：竖条并集宽 342.25px。360 档盒 328 ⇒ 溢出 19px ⇒ 咬中；**390 档盒 358 ≥ 347 ⇒ 0 码** —— 同一根不可读的竖条、同一档肉眼一样糟，判据却沉默，这就是覆盖不对称的边界所在。
5. **⑤ 页面级溢出不成立**：`overflow: hidden` 把溢出留在盒子内部，`documentElement.scrollWidth` 恒等于视口（5 档 0 溢出），所以 `page-overflow@<vw>` 也不会响。

## 6. 判为「未咬中」⇒ 这是一条 P1（不是 P0）的判据

**承诺与其边界**：承诺是「把二级说明压成 **70ch 窄柱**会被咬中」。这条形态压的不是盒子/内容盒（两者恒满宽），它是「**盒满宽 + 正文竖成一根 16px 宽的细条**」——不是 70ch 窄柱，而是它的同族变体。

* **该条是否可见正文？** 是。24 个字形盒、并集 342.25 × 87.3px、单个字形盒宽 16px：文字被完整绘出（不是藏字、也不是未渲染）。⇒ 用户能看见这段文字，只是排版形态被毁。
* **是否可被压窄？** 判据能「看见」的窄化证据只有 ①（内容盒）与 ②（逐行字迹），这条对两者都免疫（竖排 + 盒满宽）⇒ **1440/1600 这两档（覆盖全站 186 页逐条判的唯一两档）对它完全无感**；能接住它的只有 760/360 样本集（**29 页**）里 @360 的自裁切副作用。
* **为什么不是 P0**：整轮 `EXIT=1`，门禁**最终会拦住这一份产物**（本轮实测 852/1）——不是「假绿放行」。「把说明压成 70ch 窄柱」这一条具体的承诺没有被绕过；被漏掉的是**另一种形态**（竖排细条）。
* **为什么不是「无事」而是 P1**：接住它的机制依赖两个偶然条件——(a) 该页在 29 页样本集里；(b) 盒子宽度小于那根竖条的并集宽（本轮 328 < 347）。**同一个形态若落在不在样本集里的 wide 页上、或 `height` 更小（竖条更短）使盒子装得下，就是全档 852/0 的假绿**（390 档的 358 ≥ 347 已经在同一页上演示了「装得下 ⇒ 0 码」）。
* **requiredFix（下一轮，属 `scripts/tools/verify-site.js`，不在本任务 inScope，我没有改动该文件）**：把逐行归并按 `writing-mode` 参数化 —— 竖排改成按**列**归并并判列内字迹宽（我的探针已能稳定量到「单字形盒 16px / 竖排 17 列」这两个数）；或对 `vertical === true` 的条改判「单字形盒宽 < 0.85 × 列宽」。两者都能在 **1440 档**咬中，从而把这条 P1 闭合。

## 7. 轮 3/round 3 为什么记为「未定」

| 记录 | 原文/读数 | 与本形态的关系 |
| --- | --- | --- |
| 轮 2（t11）`adversary/runs/coverage-asymmetry-writing-mode.json` | 判据 sha `4f4cb2e3…` · **842 项 / 失败 1 ⇒ EXIT=1** · @1440/@1600/@390/@760 全绿 · @360 `note-clipped`（`scrollWidth 347 > clientWidth 328`） | 唯一一次真测过本形态；但口径是**轮 2**（t7 之后），此后判据改了 4 轮 |
| 轮 3（t14）`teeth/T14-ROUND3.md` L294–296 | 形态抽样里只有 `vertical` = 「t11：`writing-mode: vertical-rl` + **height**（**盒宽被内容反推**）」→「vertical 咬 802」 | 轮 3 量的是**另一个变体**（盒子被反推成 ~347px ⇒ `note-narrow` 咬中）；**没有**量本轮这个 `width: 100%` 变体 |
| 轮 3 的机制登记 `adversary/calibration-report.md` L54 | 「归并容差没有参数化（当前按垂直覆盖 > 50% 片段高）。若将来出现 `column-gap` 极小或 `writing-mode` 的形态，需要按列/按连续字迹段再细分」 | 轮 3 已认识到竖排的归并边界，但把**细分本身**留给了后续轮 |
| 报告 §J ③（`research/secondary-page-layout-unification-report.md` L1258–1271） | 「**轮 3 / 轮 4 / 轮 5 / 轮 6 的装置都没有重测这个形态**… 要么已被并集口径在 1440 就咬中，要么仍然只有 360 档靠溢出副作用接住；**两种结局都要由一次重测决定**」 | 明确把重测挂给 t16（证据复跑）；**t16 被取消** ⇒ 一直悬着 |
| 本任务（t31） | 轮 6 判据（`2cbc160d…`）上：1440/1600/760/390 全绿、@360 `note-clipped`、852/1 ⇒ EXIT=1 | **= 第二种结局** ⇒ 按 §J ③ 验收口径「仍只有 @360 ⇒ 保留本 P1」 |

## 8. 零写入与不变量（`t31/post-checks.txt` 全文）

* 标的 `scripts/tools/verify-site.js` = `2cbc160d…`（**跑前 = 跑后 = 复量**，522,527 B，mtime `2026-10-06T14:52:23Z`，早于本轮）。
* `dist/category/agent/index.html` = `ad9c5d4058dc2ab20d035cce1f1a76b5b784244154038498137c7b96d6b34169`，**与注入前原样逐字相同**（注入只落在 scratch 副本）。
* `dist` 全树最新 mtime `2026-10-06T15:42:38Z`、`dist.baseline` `06:27:50Z`，两者都早于本轮全部动作；`mk-form-scratch` 自己的对账也记录 dist 被写 **0** 个、与 dist 不同 **1/303**（仅 `category/agent/index.html`）、冻结串 **1 → 1**、+**85 B**。
* 旁证（与 t11 交叉）：我的 scratch 注入页 sha256 = `09e6b46c935c03e521a56445182fdade547108cd8e66da09f99c539855a43b6c`，**与 t11 `injectionEvidence.sha256After` 逐字相同** ⇒ 本轮的形态注入与轮 2 是同一份字节。
* `git`：`HEAD = origin/master = 1f225d2`；`git status --porcelain -- scripts dist dist.baseline docs index.html` 只有他人既有改动（`M scripts/tools/verify-site.js` 等 7 个），**本轮没有新增/修改任何生产源码、也没碰 `docs/`、报告与 dist**。

## 9. 文件索引（全部在 `verify/**`）

| 路径 | 是什么 |
| --- | --- |
| `verify/t31/writing-mode-probe.cjs` | 定点探针（自写，独立于门禁）；`--form=1` 为内存注入形态 |
| `verify/t31/probe-dist.json` · `probe-form.json`（+ `.log`） | 5 档几何与码的逐档读数（线上原样 / 注入形态） |
| `verify/t31/mk-form-scratch.cjs` · `mk-form-scratch.log` · `scratch-form.json` | 形态副本的构造与对账（303 文件、1 个不同、冻结串 1→1、+85 B、dist 零写） |
| `verify/t31/gate-form.json` · `gate-form.log` · `gate-form.exit.txt` | 门禁在形态副本上的完整报告（852 项 / 失败 1 / `FORM_EXIT=1`）与原始输出 |
| `verify/t31/gate-dist.json` · `gate-dist.log` · `gate-dist.exit.txt` | 门禁在线上 dist 上的报告（852 项 / 失败 0 / `DIST_EXIT=0`） |
| `verify/t31/gate-slices.json` · `gate-slices.txt` · `slice-gate.cjs` | 从两份报告切出的 §22c 与 `category/agent/` 逐档读数（人读 + 机器可读） |
| `verify/t31/post-checks.cjs` · `post-checks.txt` | 跑后不变量（标的 sha / dist 只读 / git 视角 / 本轮文件清单） |
| `verify/t31/mutations.json` | 门禁自己写出的变异牙读数（本轮两次运行各一份，13 条牙全绿） |
| `verify/scratch/t31-form/**` | 形态副本（303 文件；`category/agent/index.html` = 注入后的 1 个文件） |
