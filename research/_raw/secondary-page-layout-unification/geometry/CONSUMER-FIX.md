# CONSUMER-FIX · 证据侧消费者诚实性订正（t25）

- **任务**：t25（`adversary` 执行，attempt 1）· **kind = work** · inScope = 本目录的 `make-truth-401.cjs`、`make-synthetic-reports.cjs`、`CONSUMER-FIX.md`
- **一句话**：把「**按序位置切片 48**」订正为位置语义 + 实测归属（① 盒宽窄 156 / ② 字迹窄 108 ⊆ ①），并让合成夹具**按真实码分布取样**；`truth-401.json`、`dist/`、`dist.baseline/`、`scripts/` 一个字节未动，消费者读数不变（gate-vs-truth 两份报告复跑 **pass · 漏判 0 · 误报 0**）。
- **根因**：round 3 的 finding **R3-2** 就是从 `truth-401.json` 的键名语气读出来的 —— 那两个键是**位置切分**（`index === 0`），却被读成了「旧口径（盒宽 / textWidth）的命中集合」。

---

## 1. 实测归属（这次订正的依据，不是推测）

工具：`geometry/attribution-census.cjs`（新增，只读）→ 读数 `geometry/attribution-census.json`

它拿 **3 份独立的真实 `--dir=dist.baseline` 报告**逐条回查 `truth-401.json` 的 156 条真值键：

| 报告（只读消费） | total/failed | 156 条上的码分布 | 位置切片 48 条上 | 其余 108 条上 | 对照组 245 条上 |
| --- | --- | --- | --- | --- | --- |
| `review/t20/runs/new-baseline/report.json` | 848 / 33 | `{note-narrow:156, note-ink-narrow:108, note-axis:156}` | `{note-narrow:48, note-ink-narrow:48, note-axis:48}` | `{note-narrow:108, note-ink-narrow:60, note-axis:108}` | `{}`（零窄码） |
| `teeth/_scratch/r4-m0.json`（t19） | 848 / 33 | 同上 | 同上 | 同上 | `{}` |
| `t21/preserve/run3-M0-baseline.json` | 848 / 33 | 同上 | 同上 | 同上 | `{}` |

**自检 8/8 ✅**（`attribution-census.json#checks`）：

- ① `note-narrow` = **156**（156 条盒宽全 452.81，**含 48 条单行**）
- ② `note-ink-narrow` = **108**，且 **② ⊆ ①**（0 条"只带字迹码"）
- **位置切片 48 条 48/48 全为多行**（都带 `note-ink-narrow`）⇒ 它与"旧口径命中"只是**数量巧合**
- 那 **48 条单行说明全部落在 `onlyNewTruth` 批**里（与位置切片不是同一批）
- 对照组 245 条零窄码；跨 3 份报告**逐条一致**

> 旁证：真实报告自己的 `metrics.layoutSweep` 就写着 `narrowNotes: 156`（条）· `narrowNotePages: 48`（页）· `inkNarrowNotes: 108` —— 门禁的输出从来是"156/108"，只有注释与夹具的划分在说"48+108"。

---

## 2. 逐处 before/after 引用行

### 2.1 `geometry/make-truth-401.cjs`（改前 sha256 `f94f6441977164cb…` · 10 385 B → 改后 `a9e06e6b15262556…` · 14 213 B）

| 验收引用行（改前） | 改前原文（节选） | 改后位置 | 改后写法（节选） |
| --- | --- | --- | --- |
| **L6–7** | 「§22c 的旧口径只量 `<main>` 里**文档序第一条** …「改动前有 48 页说明被压成 70ch」…**且 108 条不是第一条**」 | **L5–18**（新增 ⚠️ 归属段） | 「t2 的 §22c 只量文档序第一条（**位置口径**）… **156 条在改动前比主数据区窄（`before.width` 全 = 452.81px）**，其中 **108 条不是文档序第一条**」+ 「**本文件切出来的三个集合是位置切分**，不要按名字读成判据命中」+ 实测归属 ①/② |
| **L54–56** | `/** 分类：改动前窄 ⇒ 旧口径能逮到（第一条）／只有新真值覆盖（第 2 条及以后）；不窄 ⇒ 对照组 */` + `classify` 本体 | 注释 **L71–77**；`classify` 本体仍在 **L79–81**（未改） | 「分类：改动前窄 ⇒ 按**位置**切分（`index === 0` …）；⚠️ 两个返回键名是**历史命名**，不要按字面读成「旧口径（盒宽 / textWidth）的命中集合」…实测归属 ① = 156 · ② = 108 ⊆ ①」 |
| L96（交叉核对注释） | 「wide-probe …与这里的 caughtByOldCriteria 页集合必须一致」 | **L121–125** | 「与这里的 **index===0 位置切片**页集合必须一致 …⚠️ 这**不是**在核对「旧口径（盒宽）命中集」：盒宽命中集实测是 **156 条**」 |
| 说明性输出字段（附带订正，见 §3） | `what` / `invariants` 键名 / `usageForNewGate` / 控制台 | L183 / L186–194 / L210–213 | 全部改为位置语义 + 实测归属；**键名（`caughtByOldCriteria`/`onlyNewTruth`/`alreadyFine`）与数值一律不动** |

新增 `--out=<path>`（L203–208）：让"重跑一遍看数值会不会变"这件事**不必覆盖已发布的 `truth-401.json`**（t21 正在只读消费它）。默认路径仍是 `geometry/truth-401.json`。

### 2.2 `geometry/make-synthetic-reports.cjs`（改前 sha256 `d38b4ba4565170da…` · 9 441 B → 改后 `4f4d126dcd63b235…` · 13 266 B）

| 验收引用行（改前） | 改前原文（节选） | 改后位置 | 改后写法（节选） |
| --- | --- | --- | --- |
| **L6** | 「t14 把窄柱判据从单一 `note-narrow` 改成**并集**（`note-narrow` **48 条** + `note-ink-narrow` **108 条**）」 | **L6–19** | 「并集口径：`note-narrow`（内容盒 / 盒宽窄）∪ `note-ink-narrow`（逐行字迹窄）」+ ⚠️ 实测码分布段（① 156 含 48 条单行 · ② 108 ⊆ ① ⇒ **108 条同时带两个码、48 条只带盒宽码**） |
| **L96–97** | `const boxKeys = …; // 48 条：index 0、盒子被压窄 ⇒ note-narrow` / `const inkKeys = …; // 108 条：index>0、盒宽满宽但字迹窄 ⇒ note-ink-narrow` | **L107–131**（改为实测分布取样） | 读 `attribution-census.json` 的 `narrowCodesByKey`（真实码分布），缺实测分布就 `exit 2`「不编一份出来」；`positionalFirstKeys`（位置切片，注释 L123 明说键名是历史命名） |
| **L115** | `/** ① 并集口径：48 条 note-narrow + 108 条 note-ink-narrow ⇒ 156/156 */` | **L156–160** | `/** ① 并集口径（**按实测码分布**）：156 条都带 note-narrow，其中 108 条多行的**同时**带 note-ink-narrow ⇒ 并集 156/156 */` |
| L120（同族） | `/** ② 单一口径（修复前的世界）：只有 48 条 note-narrow ⇒ 必须被认出「漏 108」 */` | **L161–165** | `/** ② 位置切片口径（历史世界）：只有 index===0 那 48 条被标出来（t2 只量文档序第一条）⇒ 必须被认出「漏 108」 */` |
| L135（同族） | `syntheticNote: …（156 条 = 48 note-narrow + 108 note-ink-narrow）` | L187–189 | `syntheticNote: …（实测：156 条都带 note-narrow，其中 108 条多行的同时带 note-ink-narrow；⚠️ 不是「48 盒宽 + 108 字迹」的划分）` |

顺带订正的一处**口径混用**：`layoutSweep.narrowNotes` 原写成"页数"（48），真实报告里它是**条数**（156）——新的 `build()` 改为 `narrowNotes = 窄条数` / `narrowNotePages = 窄页数`，与真实报告同口径（两者在夹具里现在是 156 / 48）。

### 2.3 夹具产物（`consumer-selftest/`，旧件已存档）

| 夹具 | 改前（存档 `consumer-fix/*.pre-t25.bak.json`） | 改后 | 语义 |
| --- | --- | --- | --- |
| `case1-union-156.json` | 48 行 `note-narrow` + 108 行 `note-ink-narrow`（**假划分**） | **156 行 `note-narrow`，其中 108 行同时带 `note-ink-narrow`** | 并集口径的**真实形状** |
| `case2-narrow-only-48.json` | 48 行 `note-narrow`（叙述成"单一旧口径"） | 同上（48 行，取自位置切片的实测码去掉字迹码） | **位置切片**口径（t2 只量文档序第一条）的家史重建 |
| `case3-false-positive.json` | case1 + 1 条误报 | case1 + 1 条误报（`archive/#0`） | 误报必被指名 |

---

## 3. 「数值一个字节都不许改」的机器证明

`consumer-fix/compare-truth-regen.cjs`（新增证据工具）把订正后的生成器用 `--out=` 重跑到
`consumer-fix/truth-401.regen-t25.json`，再与盘上 `truth-401.json` **逐路径深比**：

```
旧 truth-401.json sha256 46c28fa120a39aba… (384076 B)
新 truth-401.regen-t25.json sha256 3524854121505dcf… (384562 B)
差异分类：{"STRING-DIFF":4,"KEY-ONLY":1}          ← 没有 NUMBER-DIFF，也没有 STRUCT-DIFF
✅ 没有任何数值差异（NUMBER-DIFF = 0）
✅ 没有类型/长度/成员差异（STRUCT-DIFF = 0）
✅ totals 逐字段相同          ✅ sets 三个集合的键集合逐条相同
✅ sets 逐条的 beforeWidth/afterWidth/ratioAfter 相同
✅ pages 条数相同             ✅ pages 里每条说明的 before/after 数值相同
✅ invariants 的布尔值全等（只允许键名措辞变化）
```

- 唯一的 **KEY-ONLY**：`invariants` 里 3 个**说明性键名**的措辞（布尔值全等）。
- 4 处 **STRING-DIFF**：`at` 时间戳 + `what` / `usageForNewGate` 的措辞。
- ⇒ 订正后的生成器重跑，**数值语义逐项不变**；盘上 `truth-401.json` 因此**没有被重写**（t21 只读消费中；`sha256 46c28fa120a39aba…` 与改前相同）。

---

## 4. 复跑读数（消费者语义不变）

### 4.1 要求的那两条：`gate-vs-truth.cjs` × （green + baseline）

```
node …/geometry/gate-vs-truth.cjs --report=…/review/t20/runs/new-dist/report.json      --expect=green    --out=…/consumer-fix/gate-green-t20.json
node …/geometry/gate-vs-truth.cjs --report=…/review/t20/runs/new-baseline/report.json  --expect=baseline --out=…/consumer-fix/gate-baseline-t20.json
node …/geometry/gate-vs-truth.cjs --report=…/teeth/_scratch/r4-green.json              --expect=green    --out=…/consumer-fix/gate-green-t19.json
node …/geometry/gate-vs-truth.cjs --report=…/teeth/_scratch/r4-m0.json                 --expect=baseline --out=…/consumer-fix/gate-baseline-t19.json
```

| 报告 | expect | 结论 | 漏判 | 误报 | EXIT |
| --- | --- | --- | --- | --- | --- |
| t20 `new-baseline`（`dist.baseline`） | baseline | ✅ **pass** | **0 条 / 0 页** | **0 条** | 0 |
| t19 `r4-m0`（`dist.baseline`） | baseline | ✅ **pass** | **0 条 / 0 页** | **0 条** | 0 |
| t20 `new-dist`（`dist`） | green | ✅ pass | （绿轮：156 条如期消失，非漏判） | 0 条 | 0 |
| t19 `r4-green`（`dist`） | green | ✅ pass | （同上） | 0 条 | 0 |

基线轮实测读数：**窄说明 156 条 / 48 页**，条级码分布 `{note-narrow:156, note-ink-narrow:108}` —— 与 §1 的实测归属逐项一致。

### 4.2 合成自检（改完夹具后三例的语义仍然成立）

```
node …/geometry/gate-vs-truth.cjs --report=…/consumer-selftest/case1-union-156.json       --expect=baseline   # 期望 pass
node …/geometry/gate-vs-truth.cjs --report=…/consumer-selftest/case2-narrow-only-48.json  --expect=baseline   # 期望 fail 且漏 108
node …/geometry/gate-vs-truth.cjs --report=…/consumer-selftest/case3-false-positive.json  --expect=baseline   # 期望 fail 且指名 1 条误报
```

| 夹具 | 结论 | 漏判 | 误报 | 条级码分布 | EXIT |
| --- | --- | --- | --- | --- | --- |
| case1（并集 · 真实分布） | ✅ pass | 0 | 0 | `{note-narrow:156, note-ink-narrow:108}` | 0 |
| case2（位置切片世界） | ❌ fail（设计内） | **108**（样例 `category/#1` …） | 0 | `{note-narrow:48}` | 1 |
| case3（并集 + 误报） | ❌ fail（设计内） | 0 | **1** ⇒ `archive/#0` | `{note-narrow:157, note-ink-narrow:108}` | 1 |

`--inspect` 分支另跑一次（`consumer-fix/12-inspect-case1-t25.log`）：命中 156/156 · 漏 0 · 对照组误报 0 · 码分布 `{note-narrow:156, note-ink-narrow:108}` ✅

---

## 5. 文件与 sha256 一览（前后都在盘上）

| 文件 | 改前 sha256（前 16） | 改后 sha256（前 16） | 说明 |
| --- | --- | --- | --- |
| `make-truth-401.cjs` | `f94f6441977164cb` | `a9e06e6b15262556` | 注释/说明性字符串订正 + `--out=`；逻辑与数值不变 |
| `make-synthetic-reports.cjs` | `d38b4ba4565170da` | `4f4d126dcd63b235` | 注释订正 + 夹具改按实测码分布取样 |
| `truth-401.json` | `46c28fa120a39aba` | **`46c28fa120a39aba`（未改）** | 数值与 schema 一字未动 |
| `consumer-selftest/case1-union-156.json` | `a4f12eebb0d1d34d` | `fb043d68b6034d77` | 旧件存档在 `consumer-fix/` |
| `consumer-selftest/case2-narrow-only-48.json` | `a2be21cbf77a51e6` | `93f75353d6766a31` | 同上 |
| `consumer-selftest/case3-false-positive.json` | `d38940c9de240c75` | `25a34fccad0bbd7a` | 同上 |
| `attribution-census.cjs` / `.json` | — | `134776858e75af8f` / `fc4b6ea18b1bdf03` | 新增：实测归属工具与读数 |
| `gate-vs-truth.cjs` | `af9f53be6acc51f3` | `af9f53be6acc51f3`（未改） | 消费者代码路径未动 |
| `scripts/tools/verify-site.js` | `fd3c9a3090dca11b` | `fd3c9a3090dca11b`（未改） | 未触碰 |

- 完整清单：`consumer-fix/sha256-before.json` · `consumer-fix/sha256-after.json`
- 完整 diff：`consumer-fix/diff-make-truth-401.patch`（67 行变更）· `consumer-fix/diff-make-synthetic-reports.patch`（95 行变更）—— 逐行核对过：**没有**判据、消费者、产物或真值数值的改动。
- 备份：`make-truth-401.cjs.pre-t25.bak` · `make-synthetic-reports.cjs.pre-t25.bak` · `consumer-fix/case*.pre-t25.bak.json`
- dist / dist.baseline / scripts 下**零写入**（本次全部命令只写 `geometry/`；浏览器未启动，不产生导航）。

---

## 6. 复现

```bash
# ① 实测归属（只读真实报告；默认清单 5 份，缺就明说，不推测）
node research/_raw/secondary-page-layout-unification/geometry/attribution-census.cjs
# ② 按实测码分布重造夹具（缺 attribution-census.json 会 exit 2）
node research/_raw/secondary-page-layout-unification/geometry/make-synthetic-reports.cjs --emit
# ③ 数值不变证明（重跑到临时路径 + 逐路径深比；不覆盖 truth-401.json）
node research/_raw/secondary-page-layout-unification/geometry/make-truth-401.cjs --out=…/consumer-fix/truth-401.regen-t25.json
node research/_raw/secondary-page-layout-unification/geometry/consumer-fix/compare-truth-regen.cjs \
     research/_raw/secondary-page-layout-unification/geometry/truth-401.json \
     research/_raw/secondary-page-layout-unification/geometry/consumer-fix/truth-401.regen-t25.json \
     research/_raw/secondary-page-layout-unification/geometry/consumer-fix/truth-regen-equivalence.json
# ④ 消费者复跑（green + baseline 两份）—— 期望 pass / 漏判 0 / 误报 0
node research/_raw/secondary-page-layout-unification/geometry/gate-vs-truth.cjs \
     --report=research/_raw/secondary-page-layout-unification/review/t20/runs/new-baseline/report.json --expect=baseline
# ⑤ 合成自检三例
node research/_raw/secondary-page-layout-unification/geometry/gate-vs-truth.cjs \
     --report=research/_raw/secondary-page-layout-unification/geometry/consumer-selftest/case1-union-156.json --expect=baseline
```

---

## 7. 边界与交接（**不在** t25 的 inScope，未改，逐处点名）

| 位置 | 现存过时表述 | 为什么没改 / 建议 |
| --- | --- | --- |
| `geometry/gate-vs-truth.cjs` **L11**（+ L17） | 「`note-narrow`（盒宽窄，**48 条**）第一；`note-ink-narrow`（字迹窄，108 条）第二」「页集合大小与**旧口径那 48 页**相同」 | 消费者本体不在 inScope（其判据/代码路径完全正确，只有注释措辞）；建议下一轮由 geometry owner 按本文 §1 的实测归属改写 |
| `geometry/report-consumers.md` **L52** | 「`caughtByOldCriteria`（**48，盒宽=旧口径**）与 `onlyNewTruth`（108…）的划分在并集下语义不变」 | 该文件不是我这一轮的 inScope（t21/t22 的消费者文档）；建议同步为「48 = `index===0` 位置切片」 |
| `truth-401.json` **L2 / L46 / L51** | `what` 与 `invariants` 键名里的「旧口径能逮到」语气 | **有意不重写**：① 数值与 schema 不得改；② t21 正在只读消费；③ 订正后的文本已由 §3 的重跑件 `consumer-fix/truth-401.regen-t25.json` 给出（数值逐项相同），需要时可整份替换 |
| `geometry/consumer-selftest/40-extract-m0-real-r2.json` L1373 · `41-…json` L881 | `expectationNote`：「条数在并集口径下是 **48 条盒宽窄 + 108 条字迹窄**」 | t21 的抽取产物（历史读数）；码分布本身已在 §1 与 §4 用真实报告订正 |
| `geometry/06-truth-401.log` · `consumer-selftest/00-emit.log` | 旧的生成/夹具日志里的旧措辞 | **历史日志**，如实保留（新日志：`consumer-fix/10-regen-truth-t25.log`、`consumer-fix/00-emit-t25.log`） |
| `scripts/tools/verify-site.js` L6125–6131 / L6605 / L7478–7480 | —— | 已经是**订正后**的写法（「与『48 条单行』不是同一批 —— 两处 48 别混用（t19/R3-2 订正）」），无需改动 |

---

## 8. 结论

- 两个生成脚本的**过时归属前提已订正**为位置语义 + 实测归属（① 156 含 48 条单行 · ② 108 ⊆ ①），夹具**不再用「48 + 108」的假划分**，改为按 `attribution-census.json` 的真实码分布取样。
- **真值数值语义不变**（NUMBER-DIFF 0 / STRUCT-DIFF 0；`truth-401.json` 未重写）。
- **消费者读数不变**：gate-vs-truth 在 green 与 baseline 两份报告上复跑 **pass · 漏判 0 · 误报 0**；合成自检三例语义（pass / 漏 108 / 误报 1）保持。
- 残留的同类措辞已在下表逐处点名（都不在 t25 的 inScope），交给对应 owner，避免"改了脚本却在别处继续被读歪"。
