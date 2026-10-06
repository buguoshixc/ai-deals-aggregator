# T19 · 修复轮 4 —— ② 的作用域改为物理前置条件（闭合 R3-1）+ R3-2 / R3-3 订正

> 执行人：`teeth-engineer-2`（task `t19`，attempt_id `e08bd125-af4b-4ee8-ad73-e0ab86adec4c`）。
> 取证入口：`research/_raw/secondary-page-layout-unification/review/R3-review.md`（verdict=needs_revision：
> 1 blocker R3-1 + 2 low R3-2/R3-3）。
> 只改 `scripts/tools/verify-site.js` 与 `teeth/**`；`dist` / `dist.baseline` 跑前跑后哈希相同（下面每处都有读数）。

## 0. 交付摘要（sha256 / diff / 验收读数）

| 项 | 值 |
| --- | --- |
| 改前 `scripts/tools/verify-site.js` | `108818856cdf40a4812feb35ecd6917f7ad328681206b3457ed5dc11c7edef06` · 501 856 B · 7 818 行 |
| 改后 `scripts/tools/verify-site.js` | `fd3c9a3090dca11bbe6c34342505506bb44f4720c39fe4b18f4d7c23481f46d5` · 510 535 B · 7 927 行 |
| 改前备份 | `teeth/_backup/verify-site.pre-t19.bak`（= 改前 sha，逐字节） |
| 完整 diff | `teeth/verify-site.t19.diff`（unified=3 · 14 hunk · +146 / −37 · 42 592 B） |
| `node --check` | OK（改前改后都跑） |
| `--dir=dist` | **848 项 / 失败 0**（`teeth/_scratch/r4-green.json` · 848 项与改前同数） |
| `--dir=dist.baseline` | **848 项 / 失败 33**（与改前同数；并集 156 条 / 48 页） |
| `check-ci-consistency.js --expect-checks=38` | **38 项 / 失败 0** |
| 消费者 `gate-vs-truth.cjs`（跑**新报告**） | `--report=r4-m0.json --expect=baseline` ⇒ **pass**（漏判 0 条 / 0 页 · 误报 0）· `--report=r4-green.json --expect=green` ⇒ **pass**（误报 0） |
| R3-1 复现实验 `r3-b760.cjs` | 整轮 **EXIT=1** · 唯一失败 = `@760 样本集` · 命中 **6 条 note-ink-narrow**（changes/#0 #1 #2 #4 #8 #12，最宽 445.05/445.09/432/444/444/444.23） |
| 不变量 `check-invariants-t19.cjs` | **7 / 7 通过**（§22b 逐字未改 · hunk 全在 §22c · 断言数不减 · 0.85 与 lineCount≥2 未动 · inkRule 调用点清零 · ch70 已接入） |

## 1. R3-1（blocker）· 作用域 → 物理前置条件

### 1.1 改了什么

* **删掉视口白名单**：`const inkRuleOn = !meta || meta.inkRule !== false;` 及两处调用点的 `{ inkRule: false }`
  全部移除（`grep 'inkRule\s*:'` = **0 处**）。
* **新增现场尺子**：`wideMeasure()` 里给每条 `.snote` 现量 `note.ch70` —— 把该说明**自己的字体**
  逐字复制到屏外探针（`display:inline-block; width:70ch`）再读 `getBoundingClientRect().width`
  （`ch70Of`，源码 `wideMeasure` 内；注释里写明「不是『哪些视口算桌面档』的白名单」）。
* **判据**：
  ```js
  const ch70 = Number(note.ch70) > 0 ? Number(note.ch70) : 0;   // 缺失（外部合成几何）⇒ 前置成立、照判
  const inkScope = column > ch70 + WIDE_TOL;                    // column = min(主数据区宽, 页面列宽)
  if ((note.rendered || note.glyphRects > 0) && !note.vertical && inkScope
    && note.lineCount >= 2 && note.widestLine < threshold - 0.01) { push('note-ink-narrow', …); }
  ```
* **证据进报告**：`metrics.layoutSweep.inkScopeDesktopViewports` / `inkScopeSampleViewports`
  （每档的现场列宽范围 + 现场 70ch + `inkScope` 布尔），断言名与读数行同步改成物理口径。

### 1.2 读数（本轮实跑）

`teeth/_scratch/r4-green.log`（`--dir=dist`）的读数行：

```
② 作用域（物理）：@760 列 676–728px / 70ch 现场 452.81 ⇒ 判 ② · @360 列 276–328px / 70ch 现场 452.81 ⇒ 不判 ②
```

`teeth/_scratch/r4-green.json` 的 `metrics.layoutSweep`（节选）：

```json
"inkScopeDesktopViewports":[{"width":1440,"minColumn":1120,"maxColumn":1380,"ch70":[452.81],"inkScope":true},
                            {"width":1600,"minColumn":1120,"maxColumn":1380,"ch70":[452.81],"inkScope":true}],
"inkScopeSampleViewports":[{"width":760,"minColumn":676,"maxColumn":728,"ch70":[452.81],"inkScope":true},
                           {"width":360,"minColumn":276,"maxColumn":328,"ch70":[452.81],"inkScope":false}]
```

⇒ **1440 / 1600 / 760 判、360 不判**，且判据里没有任何视口数字白名单；`70ch` 是**现场量出来的 452.81px**，
与复审方独立探针的读数一致（`review/R3-review.md` §5 ①）。

### 1.3 R3-1 复现实验（反转）

`node research/_raw/secondary-page-layout-unification/teeth/_scratch/r3-b760.cjs` 的输出：

```
① 副本：teeth/_scratch/scratch-b760（303 文件 = dist 的 303 个）
   注入：changes/ 共享 <style> 的冻结串之后 · 注入后冻结串仍出现 1 次（+ 媒体查询里的第二份 .snote 规则）
   规则：@media (max-width: 760px) { .snote { display: grid; grid-template-columns: minmax(0, 70ch) 1fr; } }
   dist 未被触碰：changes/index.html e8b43013f7ce2974（跑完再核一次）
② 整轮 verify-site --dir=scratch-b760：EXIT=1 · 123.9s · 日志 …/r4-b760.log
   物理作用域：@760 列 676–728px / 70ch 452.81 ⇒ 判 ②
   物理作用域：@360 列 276–328px / 70ch 452.81 ⇒ 不判 ②
③ dist 未被触碰：changes/index.html e8b43013f7ce2974（跑前跑后相同）
✅ R3-1 反转验证通过
```

整轮里**唯一**的失败就是那条样本集断言，detail（原文）：

```
6 条违规码 [changes/#0 note-ink-narrow, changes/#1 note-ink-narrow, changes/#2 note-ink-narrow,
changes/#4 note-ink-narrow, changes/#8 note-ink-narrow, changes/#12 note-ink-narrow]
changes/#0 逐行字迹：最宽一行 445.05px < 0.85 × 列宽 —— 盒宽 728px · 内容盒 728px · 行 2 行 · 字形盒 2 个 · 列宽 728px · 阈值 618.8px
```

定点前后对照（`r4-b760-ab.cjs`：同一次导航、同一份几何，只换判据；旧判据按**修复前的调用点**传
`inkRule:false`）：

```
/ changes/ @ 760：列 728px · 说明 13 条 · 现场换算 70ch 452.81
  修复前判据：无（0 条 —— ≤760 的窄化被放行，R3-1 的假绿）
  修复后判据：note-ink-narrow#0, #1, #2, #4, #8, #12
  命中条数 6 · 最宽行读数 445.05, 445.09, 432, 444, 444, 444.23
✅ R3-1 前后对照成立
```

## 2. R3-2（low）· 分码归属表述与「89 条」

* 头部并集注释改成实测归属，并**显式写清两处「48」不是同一批**：
  「① 覆盖 156 条（盒宽全 452.81；其中 48 条单行）；② 另覆盖 108 条多行（交集 108 ⇒ ② ⊆ ①）；
  truth-401 的 `caughtByOldCriteria(48)` 是 `make-truth-401.cjs:56` 的 `index === 0` 按序切分、实测全是多行，
  那 48 条单行窄盒反而全在 `onlyNewTruth`」。
* `criteria.coverage`（写进 `mutations.json` 的机器可读口径）同步改写，并新增 `criteria.inkScope`。
* 「89 条」→ **319 条**（并写明复算定义）。

**本轮的独立复算**（不引用复审数字）：

```
--dir=dist.baseline（r4-m0.json，401 条）：① = 156 · ② = 108 · 交集 = 108 · ① 里单行 = 48
truth-401.caughtByOldCriteria（48 条，index 全为 0）在 baseline 上逐条回查：多行 48 / 单行 0 / 其中被 ② 咬中 48
truth-401.onlyNewTruth（108 条）里单行 = 48
要去掉 `lineCount >= 2` 会误报的单行说明（`rendered && !vertical && lineCount===1 && widestLine < 0.85×列宽`）：
  @1440 = 319 条 · @1600 = 319 条
```

（复审方给的 319 复算值一致；`make-truth-401.cjs:56` 的 `return index === 0 ? 'caughtByOldCriteria' : 'onlyNewTruth';`
已核。）

## 3. R3-3（low）· `display:contents` 上的回落误报 + 过时注释

* **①/同轴/裁切加盒量前置**：`const boxed = note.rendered;` ——
  `note-narrow` / `note-axis` / `note-clipped` 都只在**说明真的生成了盒子**时才判
  （无盒形态的 0..0 盒子既量不出「有字区域」，也量不出「轴」，只会产假红）。
* **② 反而加强**：判 ② 的证据是**字形盒**（`note.rendered || note.glyphRects > 0`）——
  「无盒 ⇒ 整类免判」不会变成新的放行面。
* `wideMeasure` 里 `textWidth` 的注释由「诊断量（不再作判据，单行回落除外）」改写为
  「① 的判据量（内容盒代理量；取不到承载块时回落 border-box，消息里标 textFallback）」。
* 消息格式、阈值、指标字段都没动。

**A/B 读数**（`r4-contents.cjs`，把 `.snote { display: contents; }` 注入 scratch 副本，用**按锚点抽取的同一份判据**判 3 页）：

```
修复前判据（pre-t19.bak）：changes/ [note-narrow#0… note-axis#0… ×13] · student/ [×3] · status/ [×2]  ⇒ 18 条说明全假红
修复后判据（当前）：       changes/ 码 [无] · student/ 码 [无] · status/ 码 [无]
   changes/#0 盒 0×0 · rendered=false · contentBox 0 · textWidth 0 · 字形盒 1 · 行 1（最宽 698.09px）
   student/#0 … 字形盒 6 · 行 2（最宽 1364.86px） · status/#0 … 字形盒 10 · 行 2（最宽 1376.39px）
✅ R3-3 反转通过（假红 0 条，文本仍被量到）
```

## 4. 不变量（`check-invariants-t19.cjs`，7/7）

```
✓ §22b 块逐字未改 — 改前/改后 第 5518–6099 行 · sha256 8c16c64e6fbe28dd…（两边相同；t14 的检查器按半开区间记 581 行、本脚本按闭区间记 582 行，两份文件该区间的哈希一致）
✓ diff 的所有 hunk 都落在 §22c 块内 — hunk 24 个（unified=0）· 最早改前行 6124 · 越界 0
✓ §22c/整文件断言数不减少（check( 计数） — 改前 481 处 · 改后 481 处
✓ 0.85 阈值未被放宽 — 改前 0.85 · 改后 0.85
✓ lineCount >= 2 前置仍在 — 改前在 · 改后在
✓ 旧的视口白名单开关 inkRule 在调用点已清零 — `inkRule:` 出现 0 处
✓ 物理前置条件（现场换算 70ch）已接入判据 — ch70 出现 36 处 · 判据式存在 true
```

**运行期断言数**：`--dir=dist` 与 `--dir=dist.baseline` 都是 **848 项**（改前也是 848）；
与改前逐名对照：**仅 2 条改名**（`§22c @760/@360 样本集 …` → 「同一份判据；逐行字迹按**物理前置条件**判：
现场列宽 > 70ch 时判」），**没有新增、没有删除**。

## 5. 成本

| 项 | dist | baseline | 说明 |
| --- | --- | --- | --- |
| 导航次数 | **630** | 630 | 与改前相同（行口径不增加导航，只是同一次 `wideMeasure` 里多量一个 per-note 值） |
| §22c 分档耗时 | 1440 9s / 1600 10s / 390 9.8s / 样本 5.2s | 1440 9.3s / 1600 10.5s / 390 10.4s / 样本 5.5s | 与改前同量级（改前：9 / 9.4 / 9.8 / 4.7） |
| §22c 段总耗时 | 37.2s | 39.3s | `metrics.layoutScan.seconds.section` |
| R3-1 实验整轮 | — | — | 123.9s（`scratch-b760`）；定点 A/B 约 20s；contents A/B 各约 25s |

## 6. 诚实的边界与交回事项

1. **`@760 样本集` 在 `dist.baseline` 上是红的**（196 条违规码）——那是**产物缺陷真的发生在 760**
   （baseline 的说明盒宽 452.81 < 列宽 676–728），不是误报；该断言在改前就已经红（失败总数仍是 33，没变）。
   `@360 样本集` 在 baseline 上仍是 ✓（0 条）：列 276–328 < 70ch 452.81 ⇒ 物理上不判。
2. **② 的判据加强了一点点**：由「必须 `rendered`」放宽成「有字形盒证据就判（`rendered || glyphRects > 0`）」，
   目的是不让 `display:contents` 变成「无盒 ⇒ 免判」的放行面。在 `dist` / `dist.baseline` 上读数**零变化**
   （唯一的未渲染说明 `plans/coding/#1` 字形盒 0 ⇒ 仍不判；两次整轮的 `hiddenText/union` 计数与改前逐项相同）。
3. **R3-2 提到的另外两个文件不在本任务 inScope**（`geometry/make-truth-401.cjs` / `geometry/make-synthetic-reports.cjs`
   的注释前提）：本轮没有改它们，交接给下一轮/对应 owner。`verify-site.js` 侧的口径与机器可读
   `criteria.coverage` 已按实测归属改写。
4. `r4-contents.cjs` 的「修复前」对照是**抽取同一份判据函数**跑出来的（判据区锚点抽取 + sha 记账），
   不是改判据文件；生产文件在两次对照之间 sha 不变。
5. 本轮没有跑 `--dir=dist.synth-fixed`（不在 verify 清单里）；它的口径与 `dist` 同类，若需要可让 t16 补跑。

## 7. 文件清单（全部在 `teeth/**`）

* 报告：`teeth/T19-ROUND4.md`（本文件）
* diff：`teeth/verify-site.t19.diff` · 备份：`teeth/_backup/verify-site.pre-t19.bak`
* 脚手架：`_scratch/r3-b760.cjs`（整轮反转）· `_scratch/r4-b760-ab.cjs`（定点前后对照）·
  `_scratch/r4-contents.cjs`（R3-3 A/B）· `_scratch/check-invariants-t19.cjs`（不变量）·
  `_scratch/scan-syntax.cjs` / `_scratch/bisect-syntax.cjs`（语法取证，改判据时踩到模板串里的反引号，用它定位）
* 读数：`_scratch/r4-green.{log,json}` · `_scratch/r4-m0.{log,json}` · `_scratch/r4-b760.log` ·
  `_scratch/r4-b760-report.json` · `_scratch/r4-b760-console.log` · `_scratch/r4-b760-ab.log` ·
  `_scratch/r4-contents-before.log` / `r4-contents-after.log` · `_scratch/r4-ci.log`
* 副本（可删）：`_scratch/scratch-b760/`（303 文件）· `_scratch/scratch-contents/`（303 文件）
