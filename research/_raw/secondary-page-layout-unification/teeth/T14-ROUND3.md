# T14-ROUND3 · 接手轮（attempt 3）的六项调查

> 接手人：`teeth-engineer-2`（member），task `t14`，attempt_id `5b63ac4f-78c2-4fbf-8a3c-a7f27477666d`。
> 起点是**盘上状态**：`scripts/tools/verify-site.js` sha256
> `108818856cdf40a4812feb35ecd6917f7ad328681206b3457ed5dc11c7edef06`（501 856 B · 7 817 行 · mtime 17:22:23），
> 绿轮证据 `teeth/M-green-after-r3.json` = 848 项 / 失败 0 项。
> 本文只回答问题、只登记结论，**不改判据**（第 6 问的判定见 §6，sha 保持不变）。
> 全程未跑整轮浏览器套件（只有 §3 的一次 3 次导航的最小复现），全部结论来自盘上原始产物 + 会话归档取证。

---

## 0. 六个问题的答案速览

| # | 问题 | 结论 |
| --- | --- | --- |
| 1 | 17:19 那次 848/**1** 是哪条断言？修好还是改弱？ | 是 **`§22c @360 样本集`**（新口径在未标定窄档的误报），**不是**队长假设的「违规码自检 8→10」。处置 = 把新口径作用域收敛到 1440/1600（`meta.inkRule`，默认开）；断言数 848→848，阈值/前置条件未动 ⇒ 判定「修好 + 覆盖面收敛」，两者同时成立，见 §1 |
| 2 | `unrenderedNotes: 1` 是哪条？ | `/plans/coding/` 文档序 **#1** 的 `<p class="snote pnoscript"><noscript>…</noscript></p>`；脚本开启时 `<noscript>` 不渲染 ⇒ 高 0 ⇒ 登记为 unrendered，**故意不判** note-hidden-text；这正是 hidden-text 牙加 `rendered===true` 前置条件的理由，见 §2 |
| 3 | grid 变异被咬中但码是 `note-hidden-text ×13`？是探针缺陷吗？ | **前提被推翻**：`r3-scratch-grid.log` 里 grid 命中的就是 `note-ink-narrow`（页面级 323 条；M11 复测 6 条 ×ink）。`note-hidden-text ×13` 出现在 **`r3-scratch-pseudo.log`**，是「整套跑叠在已变异副本上」的叠变异产物。**探针无缺陷**，见 §3 |
| 4 | M0 的 33 条失败哪些是设计内？ | 33/33 全部设计内：22 条 = 锚点不存在按红处理；6 条 = M0 反证面（baseline 真缺陷）；5 条 = 变异前置/要害断言在缺陷产物上的必红；**§22c 之外 0 条**，见 §4 |
| 5 | 6 组跑各是什么输入？ | 见 §5 表（真 dist / dist.baseline / dist.synth-fixed / scratch 副本 / 消费者脚本） |
| 6 | 要修探针吗？ | **不修**。`scripts/tools/verify-site.js` sha256 保持 `108818856cdf40a4…` 不变（本轮对它零写入），见 §6 |

---

## 1. Q1 · 17:19 的 848/1：哪一条断言，怎么处置的

### 1.1 取证方法与「为什么盘上没有了」

`r3-green.log` 与 `M-green-after-r3.json` 在 17:25:12 被**同名的绿轮重跑覆盖**，盘上已无副本。
我对 17:18:30–17:21:50 做了整棵工作树的 mtime 扫描（排除 `.git` / `node_modules`），确认没有该次运行的任何残留产物：

```powershell
Get-ChildItem $w -Recurse -File -Force | Where-Object { $_.LastWriteTime -ge (Get-Date '2026-10-06 17:18:30') -and $_.LastWriteTime -le (Get-Date '2026-10-06 17:21:50') -and $_.FullName -notmatch '\\node_modules\\|\\\.git\\' }
# → 只有我以外的其他成员（t18/adversary）的产物，没有任何 verify-site 报告/日志
```

唯一的原始记录是 **DSH 会话归档**（前任 `teeth-engineer` 会话 `4d3ce6a4-eef8-4afe-91f9-60805bdc4055`）：

```
%USERPROFILE%\.dsh\sessions\--D-OneDrive-Desktop-Code-AI~0020Page--\4d3ce6a4-…\session.v4.jsonl.zstd
```

它是**多帧拼接**的 zstd（`zstdDecompressSync` 只解第一帧，实测 291 字符），取证脚本按帧切分后扫描关键字，
只把命中行写进 `teeth/_scratch/`（不整份落盘）：

```powershell
node research/_raw/secondary-page-layout-unification/teeth/_scratch/extract-failures.cjs  <会话归档> teeth/_scratch/predecessor-failures.txt
node research/_raw/secondary-page-layout-unification/teeth/_scratch/extract-run.cjs       <会话归档> teeth/_scratch/predecessor-failing-run.txt 1791278483236
node research/_raw/secondary-page-layout-unification/teeth/_scratch/extract-writes.cjs    <会话归档> teeth/_scratch/predecessor-writes.txt
node research/_raw/secondary-page-layout-unification/teeth/_scratch/extract-cmds.cjs      <会话归档> teeth/_scratch/predecessor-cmds.txt 1791278000000
```

（epoch→本地时间实测映射：`1791278259153=17:17:39` · `1791278483236=17:21:23` · `1791278597302=17:23:17` ·
`1791278902288=17:28:22` · `1791278983996=17:29:43`；与文件 mtime 互证。）

### 1.2 失败断言的**原文**（逐字，来自会话归档 `predecessor-failing-run.txt`）

```
✗ §22c @360 样本集 29 页同一份判据（逐条同轴 / 比例 / 不裁切 / 不溢出） — feeds/#2 note-ink-narrow：
  feeds/#2 逐行字迹：最宽一行 264px < 0.85 × 列宽 —— 盒宽 328px · 内容盒 328px · 行 2 行（最宽一行 264px）
  · 字形盒 4 个 · 列宽 328px · 阈值 278.8px（主数据区 .flist 328px / 页面列 328px）
```

该事件 `seq=1380 time=1791278483236 step=76`，是**整轮唯一的 ✗**（该次读数 `848 项，失败 1 项`）。

### 1.3 队长的假设：**推翻**

假设原文是「新增 2 个违规码后，『违规码自检：N 个码…不多不少』从 8 变 10，先报红后登记」。
**不成立**，理由有三：

1. 该次失败的断言名与 detail 都不是违规码自检，而是 `@360 样本集`；detail 是一台真实页面的几何读数（feeds/#2）。
2. 违规码自检（现 `verify-site.js` L7206–7213）是**合成几何**上跑的自检，与产物无关：它用 `wideProblems()`
   在内存里构造 10 个码各自的可达几何，再与 `WIDE_CODE_VOCABULARY` 求差。若词表滞后（8 条 vs 实产 10 条），
   它会报 `可达 10/8 · 多 note-ink-narrow,note-hidden-text` —— 这是**确定性的、与 dist 无关的红**，
   不可能只在 `--dir=dist` 这一轮出现、也不可能随产物变化而自己变绿。
3. 该次运行的 §22c sweep 计数是干净的（队长自己引的 `narrowNotes 0 / inkNarrowNotes 0 / …`），
   也说明失败不来自产物侧新码。

顺带记一条可反证的细节：违规码自检的 8→10 **确实发生了，但从未报过红**。因为 17:17:39 那一轮的
**唯一** ✗ 就是上面这条 `@360`；`违规码自检` 当轮是 ✓ ⇒ 词表登记（10 条，现 L6206–6209）在 17:17:39
之前就已经和判据一起写进 `r3-part1.js` 了（那一轮的首个 ✗ 出现时，自检早已在合成几何上 10/10 通过）。
也就是说：假设所指的「先报红后登记」在这条时间线上没有对应的红。

### 1.4 处置：是「修好」还是「改弱」——证据链

失败之后、重跑之前的**全部写入**（`extract-writes.cjs`，按时间排列）：

| 时间 | 步骤 | 文件 | 改动 | 关键内容 |
| --- | --- | --- | --- | --- |
| 17:21:48 | 77 | `_scratch/r3-part1.js` | +675 B | `wideProblems` 的 `note-ink-narrow` 注释里写明「⚠️ 只在**桌面档**（1440/1600，本口径的标定区间）生效：调用方用 `meta.inkRule=false` 关掉它（760/360 样本集就是这么调的）。实测理由：360 档 feeds/#2…只排成 2 行、最宽一行 264px…」+ 条件加 `inkRuleOn` |
| 17:21:53 | 78 | `_scratch/r3-part1.js` | +236 B | `const inkRuleOn = !meta \|\| meta.inkRule !== false;`（**默认开**） |
| 17:22:06 | 80 | `_scratch/r3-part2.js` | +700 B | `760/360` 样本档调用处传 `{ inkRule: false }` + 注释；⑨ 节标题改成「旧口径 + 同轴 / 裁切 / 溢出；逐行字迹口径只在 1440/1600 标定过」 |
| 17:22:11 | 81 | `_scratch/r3-part2.js` | +107 B | 断言名改成 `§22c @${width} 样本集 N 页（旧口径 textWidth + 同轴 / 不裁切 / 不溢出；逐行字迹只在桌面档判）` |
| 17:22:17 | 82 | `_scratch/r3-part2.js` | +466 B | 390 溢出档也显式传 `{ inkRule: false }`（该档只取 `page-overflow@`） |

随后 17:22:22 重新 splice（`splice-22c.cjs` → `verify-site.js` 17:22:23 = 现 sha），17:23:17 重跑：

```
node scripts/tools/verify-site.js --dir=dist --json=$T/M-green-after-r3.json > $T/_scratch/r3-green.log 2>&1
# 17:25:12 ✅ 验收 848 项，失败 0 项
```

**判定（两个命题同时成立，都要登记）：**

* **修好**：那条失败是**新判据在未标定档位的误报**，不是产物缺陷、也不是断言写错。360 档列宽只有 328px，
  CJK 断行 + 行内 `/student/` 这类不可断片段本来就留约 20% 余量（264/328 = 80.5% < 85%）——把它判成缺陷是假阳性；
  且「保留」等于让 `--dir=dist` 永远 1 条误报，直接违反 §22c 自己的验收「dist 0 误报」。
* **覆盖面收敛（必须如实登记）**：修法是把**新口径**的作用域限定在它的标定区间 1440/1600，
  因此 **760/360 档不再跑逐行字迹口径**（旧口径 textWidth + 同轴 / 裁切 / 溢出 仍在跑）。
  也就是说：在 760/360 档用 grid / multicol / float 这类「盒子满宽、字迹铺不开」的机制实现的窄化，
  不会被逐行字迹口径咬到。**这是一次可测量的覆盖面收缩，不是零代价的修好。**

**没有做的事（硬约束的核验）：**

* 未删除任何断言：该次 848 项，重跑也是 **848 项**（`M-green-after-r3.json` 的 `validation.checks.length = 848`）。
* 未放宽任何阈值：`WIDE_NOTE_RATIO = 0.85`、`lineCount >= 2` 与 t11 的标定一致（当前 L6185 / L6552）。
* 未动旧口径：`note-narrow` 的判据式 `textWidth < WIDE_NOTE_RATIO * column - 0.01`（修复前备份 L6424）
  与现行 `textWidth < threshold - 0.01`（L6540，`threshold = WIDE_NOTE_RATIO * column`，L6522）**代数等价**；
  变的只是把阈值提成共享常量、并给消息补了逐行字迹读数与 `cause` 归因标签。
* 未丢覆盖面证据：`@760/@360` 的断言仍在、仍会因为旧口径红（M0 轮就是这么红的，见 §4）。

---

## 2. Q2 · `unrenderedNotes: 1` 是哪一条说明

**答案：`/plans/coding/`（route `plans/coding/`），`<main>` 内文档序 `#1`，选择器 `<p class="snote pnoscript">`。**

`dist/plans/coding/index.html` 里的原标记（逐字）：

```html
<p class="snote pnoscript"><noscript>筛选、搜索与排序需要 JavaScript；未启用时，下面这张表就是全部 44 条套餐。</noscript></p>
```

该条在 `teeth/M-green-after-r3.json` 里的记录（@1440；@1600 同一条）：

```json
{ "route": "plans/coding/", "index": 1, "codes": [], "kind": "plans", "family": "wide", "regionSel": ".ptable",
  "width": 1380, "contentBox": 1380, "textWidth": 1380, "textFallback": true, "bearingCount": 0,
  "rendered": false, "unrendered": true, "lineCount": 0, "widestLine": 0, "lines": [], "glyphRects": 0,
  "textLength": 0, "boxLeft": 30, "boxRight": 1410, "parent": "main", "text": "" }
```

**为什么没渲染**：门禁用真实浏览器、**脚本开启**（Playwright 默认）。按 HTML 规范，脚本开启时 `<noscript>`
的内容不被渲染（UA 样式 `display: none`），于是这个 `<p>` 的 border-box **高度为 0** ——
探针把「已渲染」定义成 `box.width > 0 && box.height > 0`（L6447），故 `rendered=false`。
同时文本采集显式跳过 `NOSCRIPT` 子树（L6339 / L6353），所以 `textLength=0`、`textFallback=true`（无承载文本块，
`textWidth` 回落内容盒）。**页面本身没问题**：这是「无 JS 提示」，有 JS 时不显示是设计行为。

**与 note-hidden-text 牙的关系（关键）**：`note-hidden-text` 的判据是
`note.rendered && note.textLength > 0 && note.glyphRects === 0`（L6558）。这个 `<noscript>` 条
**恰好是这条判据的边界样本**：它一个字形盒都没有，但那是「没有内容要画」，不是「内容被藏了」。
若不加 `rendered` 前置，绿轮上它会成为一条**常驻误报**（`--dir=dist` ≠ 0 误报 ⇒ 验收直接不成立）。
所以代码注释（L6149–6155）写明：只有 `plans/coding/#1` 命中这个形状，规则必须写作「**已渲染**且文本非空且零字形盒」，
未渲染的单独登记 `unrendered`。牙 M12 则相反：它用 `font-size: 0` 把**已渲染**的真实文本的字形盒清零
（`M12 承重证明` 实测：文本 209 字 · 字形盒 0 个 · 盒宽 1380 · 行 0 行）⇒ 咬 `note-hidden-text`（绿轮 ✓，L792–794）。

一句话：**`unrenderedNotes` 是诊断字段，与 hidden-text 牙互为边界**；前者管「本来就没画」，后者管「该画却没画」。

---

## 3. Q3 · 关键未决：grid 容器下逐行字迹探针量到了什么

### 3.1 前提核验：`r3-scratch-grid.log` 里命中码是 **note-ink-narrow**，不是 note-hidden-text

`scratch-grid` = **真 `dist` 的 303 文件副本**，每页共享 `<style>` 里在冻结串**之后**追加一条：

```css
.snote { display: grid; grid-template-columns: minmax(0, 70ch) 1fr; }   /* t8 F-R2-1 */
```

`r3-scratch-grid.log` / `teeth/_scratch/scratch-grid-report.json` 的实测（`metrics.layoutSweep`）：

```json
{"notesJudged":401,"narrowNotes":348,"narrowNotePages":104,"inkNarrowNotes":323,"inkNarrowNotePages":105,
 "narrowUnionNotes":366,"narrowUnionNotePages":105,"hiddenTextNotes":0,"unrenderedNotes":1,"navigations":630}
```

* 逐条：`changes/#0` 盒 1380 / 内容盒 1380 / **字形盒 2 个 / 行 2（最宽 445.05px）** ⇒ `["note-ink-narrow"]`；
  `#1` 445.09px / 2 行；`#2` 432px / 2 行；`#4` 444px / 2 行；`#8` 3 行 / 444px；`#12` 3 行 / 444.23px。
* `M11` 变异牙（在绿轮 `dist` 上现场注入同一条 CSS）：`期望 note-ink-narrow · 实测 [ink ×6]`，
  且 `M11 承重证明`：`note-narrow 0 条（旧口径看不见）· note-ink-narrow 6 条` —— 绿轮 ✓（`r3-green.log` L790–791）。
* **`hiddenTextNotes: 0`**：grid 副本上一条藏字都没有。

⇒ 「grid 下量到 0 个字形盒」**不成立**：`display: grid` 的容器里，真实文本节点的 `Range.getClientRects()`
照常有可见字形盒（1–3 个），归并出行（1–3 行），最宽 432–445.05px 落在 1380px 的满宽盒里 ⇒
`note-ink-narrow` 是**语义正确**的码。

### 3.2 「note-hidden-text ×13」是 `r3-scratch-pseudo.log` 的读数

`scratch-pseudo` = 真 `dist` 副本 + `.snote { font-size: 0 }` + `.snote::before { content: "…"; display: block; max-width: 70ch; … }`。
它的 sweep 是另一幅图：

```json
{"narrowNotes":0,"inkNarrowNotes":0,"narrowUnionNotes":0,"hiddenTextNotes":400,"unrenderedNotes":0}
```

`M11` 的复测在同一份日志里变成 `实测 [note-hidden-text × 13]`（changes/ 的 13 条说明）——因为**整套跑是叠在
已变异副本上的**：底色变异已经把**所有**说明的真实文本 `font-size: 0`，逐行字迹口径量到的字形盒是 0 ⇒ 行数 0 ⇒
`note-ink-narrow` 在该副本上**不可达**，而 `note-hidden-text` 先一步成立。同理 M12 在 grid 副本上仍是
`note-hidden-text ×3`（绿轮 ✓，L793–794），因为 grid 不影响字形盒。

### 3.3 最小复现（3 次导航，独立重写探针）

```powershell
node research/_raw/secondary-page-layout-unification/teeth/_scratch/min-repro-glyph.cjs `
     > research/_raw/secondary-page-layout-unification/teeth/_scratch/min-repro-glyph.txt
```

`3 个输入 × /changes/ × 1440`，对 `<main>` 每条 `.snote` 量 盒宽 / 内容盒 / 文本字数 / 可见字形盒 / 行数（垂直重叠 > 50% 归并）：

```
### dist                                             · /changes/ · 1440   （节选 2/13 条）
  #0 盒 1380 / 内容盒 1380 · 文本 58 字 · 字形盒 1 个 · 行 1（最宽 698.09px） · rendered=true
  #3 盒 1380 / 内容盒 1380 · 文本 38 字 · 字形盒 1 个 · 行 1（最宽 451.52px） · rendered=true
### teeth/_scratch/scratch-grid                      · /changes/ · 1440   （节选 2/13 条）
  #0 盒 1380 / 内容盒 1380 · 文本 58 字 · 字形盒 2 个 · 行 2（最宽 445.05px） · rendered=true · ::before content=(none)
  #8 盒 1380 / 内容盒 1380 · 文本 78 字 · 字形盒 3 个 · 行 3（最宽 444px）     · rendered=true · ::before content=(none)
### teeth/_scratch/scratch-pseudo                    · /changes/ · 1440   （节选 1/13 条；13 条全部同形）
  #0 盒 1380 / 内容盒 1380 · 文本 58 字 · 字形盒 0 个 · 行 0（最宽 0px） · rendered=true
     · ::before content="§22c-M12 伪元素承载正文（真实文本已不可见）"
```

（完整 39 行读数：`teeth/_scratch/min-repro-glyph.txt`。）

### 3.4 判定：**不是探针缺陷**（「咬住了、码也可以不一样」，而且两处都仍然是红）

1. **grid 下没有量到 0**：字形盒 1–3、行 1–3、最宽 432–445.05px，`note-ink-narrow` 正确命中（页面级 323 条 + M11 6 条）。
2. **pseudo 下量到 0 是事实**：真实文本 `font-size: 0` ⇒ 一个字形盒都没有，`note-hidden-text` 是**正确语义**
   （被看见的是 `::before` 的盒子，不是真实文本）。整套跑依然红（页面级 @1440/@1600 + 样本档 + M11/M12 前置，
   共 10 条 ✗），**不存在假绿通路**。
3. 表面上的「期望 A 得到 B」全部来自**叠变异**（`r3-scratch-*.log` 把整套断言跑在已经带底噪变异的副本上，
   里面本来就有「该页未注入时不得违规」的正对照）——这类副本只适合读**逐条读数**，不适合当「牙」的判定；
   牙的判定应以**干净 dist 绿轮**的 M1–M12 为准（`r3-green.log` L767–L794，全部 ✓）。
4. 残余语义（登记，非缺陷）：若一条说明**同时**藏字 + 字迹窄，报出的码是 `note-hidden-text` 而不是
   `note-ink-narrow`（行证据在 0 字形盒下不可得）。两者都是违规码 ⇒ 不影响「红/绿」判定，只影响归因标签。

### 3.5 `r3-scratch-pseudo.log` 的 10 条失败（逐条查清）——全是叠变异产物

| # | 断言 | 实测 | 归类 |
| --- | --- | --- | --- |
| 1–2 | `@1440 / @1600 逐条页面级` | 400 条 `note-hidden-text` | 底噪变异真的藏了正文 ⇒ 该红 |
| 3–4 | `@760 / @360 样本集` | `archive/#0` 等 `note-hidden-text` | 同上（变异是全站注入） |
| 5 | `M6 变异后复测`（期望 `page-overflow@390`） | 得到 `note-hidden-text ×3` | 不可断串在 `font-size:0` 下宽度为 0，不再溢出；藏字先成立 |
| 6 | `M8 变异后复测`（期望 `note-narrow`） | 得到 `note-hidden-text ×3` | 同上 |
| 7 | `M8 要害`（注入前满宽 ⇒ 注入后 70ch 级） | `1380 ⇒ 1380` | **见下面的精确解释** |
| 8 | `M11 变异后复测`（期望 `note-ink-narrow`） | 得到 `note-hidden-text ×13` | 0 字形盒 ⇒ 行数为 0 ⇒ ink 码在该副本不可达 |
| 9 | `M11 承重证明` | `note-narrow 0 · note-ink-narrow 0` | 同上（主变异没落地处） |
| 10 | `M8/M9a/M9b/M10 正对照` | 四个靶页都有 `note-hidden-text` | 正对照的定义就是「不注入时不得违规」，底噪变异必然让它红 |

第 7 条的精确机制（读代码后可解释，不是玄学）：M8 注入 `padding-right: calc(100% - 70ch)`；在 pseudo 副本里
`.snote` 的 `font-size: 0` ⇒ `70ch = 0px` ⇒ `padding-right = 100% = 1380px`。于是元素的内容盒 **塌成 0**，
探针的 `widths = bearing.map(contentBoxOf).filter(w => w > 0)` 变空，走 fallback
`textWidth = (contentBox > 0 ? contentBox : noteBox.width)`（L6429–6431）⇒ 回落到 border-box 1380 ⇒
`note-narrow` 不成立。**残余观察（本轮不改，交下一轮）**：`contentBox === 0` 的 fallback 到 border-box
在「盒子被压成 0 宽」这一极端下会掩盖旧口径；此形态下新口径也量不到行（0 宽字形盒被 `rect.width > 0` 过滤）——
当时的运行仍然红（藏字），但值得作为下轮标定题。相关代码：L6307–6310 / L6426–6431。

---

## 4. Q4 · `M0-after-r3`（dist.baseline）的 33 条失败逐条分类

输入 = `dist.baseline`（基线 `origin/master=1f225d2` 的产物，**没有** T1 的 `.snote` 唯一出处修复）。
读数：`848 项 / 失败 33 项`，`layoutSweep`：`narrowNotes 156 / 48 页 · inkNarrowNotes 108 / 48 页 ·
narrowUnionNotes 156 / 48 页 · hiddenTextNotes 0 · unrenderedNotes 1`。全部 33 条都在 §22c 内。

| 组 | 条数 | 断言 | 归类 |
| --- | --- | --- | --- |
| A | 22 | `M1/M2/M3/M4/M6/M8/M9a/M9b/M10/M11/M12` 各 2 条（「变异锚点唯一」+「变异后复测」） | **设计内**：锚点 = 冻结串，在 `dist.baseline` 里出现 **0 次**（T1 的修复不在基线产物里）⇒ 按红处理（「不允许变异不生效却算通过」）。这是守卫，不是缺陷 |
| B | 6 | `@1440 逐条`、`@1600 逐条`、`冻结串「一处定义、全站生效」186 页不符`、`@760 样本集`、`M6 正对照`（注入不可断串 ⇒ @390 溢出）、`M8/M9a/M9b/M10 正对照`（不注入也有 note-narrow） | **设计内 · M0 反证面**：baseline 确实有缺陷（156 条窄说明 / 48 页 + 缺断行兜底 + 说明未收成唯一出处）—— 这些红就是「判据在地板产物上必须红」的证据 |
| C | 5 | `M8 要害`（「页面没量到」）、`M9a 只压非首个`、`M9b 只压非首个`（选择器命中 `[无]`）、`M11 承重证明`、`M12 承重证明` | **设计内**：这些断言的语义是「在**已修复产物**上做变异才能测出承重」，在缺陷产物上前置条件天然不成立 ⇒ 必红 |

**结论：33/33 全部是设计内行为，没有一条「真红」需要修复；§22c 之外 0 条失败**
（这也同时说明「§22c 之外的断言在 M0 上没有被新码带红」）。

---

## 5. Q5 · 6（+1）组跑的输入表

来源：会话归档里的原始命令行（`predecessor-cmds.txt`）+ 产物 sha256。

| 日志（mtime） | 输入 | 关键命令 | 读数 | 产物（sha256 前 16） |
| --- | --- | --- | --- | --- |
| `_scratch/r3-green.log`（17:25:12） | **真 `dist`**（T1 修复后产物） | `node scripts/tools/verify-site.js --dir=dist --json=$T/M-green-after-r3.json` | **848 / 0** · narrow 0 · ink 0 · hidden 0 · unrendered 1 | `teeth/M-green-after-r3.json` `82ae12b60e76889c` |
| `_scratch/r3-M0.log`（17:27:01） | **`dist.baseline`**（缺陷产物） | `--dir=dist.baseline --json=$T/M0-after-r3.json` | **848 / 33** · narrow 156/48 · ink 108/48 · union 156 | `teeth/M0-after-r3.json` `732468a18ff64d4a` |
| `_scratch/r3-synth.log`（17:37:02） | **`dist.synth-fixed`**（合成修复产物） | `--dir=dist.synth-fixed --json=$T/synth-after-r3.json` | **848 / 0** | `teeth/synth-after-r3.json` `d4d7f41feffab241` |
| `_scratch/r3-scratch-grid.log`（17:33:24） | **scratch 副本**：真 dist ×303 文件 + 每页追加 `display:grid;grid-template-columns:minmax(0,70ch) 1fr` | `--dir=$S/scratch-grid --json=$S/scratch-grid-report.json` | 848 / 6 · ink **323** · hidden 0 | `_scratch/scratch-grid-report.json` `1a19c69bd3397355` |
| `_scratch/r3-scratch-pseudo.log`（17:35:16） | **scratch 副本**：真 dist ×303 文件 + `font-size:0` + `::before{content}` 承接正文 | `--dir=$S/scratch-pseudo --json=$S/scratch-pseudo-report.json` | 848 / 10 · hidden **400** · ink 0 | `_scratch/scratch-pseudo-report.json` `c070b0ecf2b5ff95` |
| `_scratch/r3-compare.log`（17:38:48） | 真 `dist` + 9/29 基线比对 | `--dir=dist --compare=research/_raw/ours-baseline/verify.json` | **854 / 0**（= 848 + 6 项比对） | — |
| `_scratch/r3-ci.log`（17:38:49） | 仓库 CI 口径（不跑浏览器） | `node scripts/tools/check-ci-consistency.js` | **38 / 0** | — |

附：`_scratch/r3-gate-baseline.log` / `r3-gate-green.log` 是两份**消费者**核对
（`geometry/gate-vs-truth.cjs`，纯 JSON，不跑浏览器）：
baseline = `pass`（156/156，漏判 0、误报 0）· green = `pass`（0/0，156 条如期消失）。
另有一组不是 verify-site 整轮跑的读数：`_scratch/scratch-forms-readings.json`（`read-scratch-forms.cjs`，
按锚点抽取判据、7 个形态各跑一次 1440）：grid 咬 671 · multicol 咬 245 · float 咬 298 · padding 咬 677 ·
vertical 咬 802 · pseudo 咬 400 · **overlay 放行 0**（本版明确不承诺绘制类遮盖）。

**成本**：`metrics.navigations = 630`（1440/1600 全站逐条 + 390 全站 + 760/360 样本），
§22c 分档耗时 `1440 9s / 1600 9.4s / 390 9.8s / 样本 4.7s`；两步 gate（消费者）我实测 **226 ms + 52 ms**。
行口径不增加导航（与 `wideMeasure()` 同一次导航内多算一个 per-note 值）。

---

## 6. Q6 · 探针缺陷判定与 sha256

**判定：不是探针缺陷（§3.4）。因此 `scripts/tools/verify-site.js` 本轮零写入，sha256 保持不变：**

```
108818856cdf40a4812feb35ecd6917f7ad328681206b3457ed5dc11c7edef06   501 856 B · 7 817 行 · mtime 17:22:23
```

依据（全部来自本轮实测，不是引用）：

* grid 副本下字形盒 1–3、行 1–3、`note-ink-narrow` 命中（§3.1 / §3.3）；
* pseudo 副本下 0 字形盒是事实，`note-hidden-text` 语义正确且整轮仍红（§3.2 / §3.5）；
* 「期望 ink 得到 hidden」只发生在**叠变异**的 scratch 跑里，干净 dist 的 M11/M12 分别 ✓（`r3-green.log` L790–794）。

**给下一轮的建议（不在本任务内执行）**：若要覆盖「藏字 + 窄化」的组合归因，可在 `note-hidden-text` 之外
另出一枚**归因标签**（不是新违规码），例如在 hidden-text 的 detail 里附上「（行证据不可得）」；
以及 §3.5 末的 `contentBox === 0` fallback 观察，值得进下一轮标定题。

---

## 7. 本轮我独立复核的不变量读数（可复现命令）

```powershell
# ① §22b 逐字未改 + diff 全落 §22c + --url= 的 10 个 layout* 跳过键仍在
node research/_raw/secondary-page-layout-unification/teeth/_scratch/check-invariants.cjs
#   §22b 改前/改后 第 5518–6099 行（581 行）· sha256 8c16c64e6fbe28dd… · 逐字未改：✅
#   diff hunk 28 个 · 所有 hunk 都落在 §22c 块内：✅
#   --url= 跳过键 10 个 · 恰好 10 个 layout* 键：✅        exit=0
# ② 两份消费者核对（纯 JSON，重新跑过一遍）
node research/_raw/secondary-page-layout-unification/geometry/gate-vs-truth.cjs --report=$T/M0-after-r3.json --expect=baseline
#   ✅ pass（expect=baseline）· 漏判 0 条 / 0 页 · 误报 0 条
node research/_raw/secondary-page-layout-unification/geometry/gate-vs-truth.cjs --report=$T/M-green-after-r3.json --expect=green
#   ✅ pass（expect=green）· 误报 0 条
```

* 改前/改后 sha256：`4f4cb2e3b3f8e47d…`（`teeth/_backup/verify-site.pre-t14.bak`，482 786 B，16:11:12）
  → `108818856cdf40a4…`（现文件）；diff 落盘 `teeth/verify-site.t14.diff`（701 行 · +324 / −96，
  全部 hunk 在 §22c 块内，§22b 之外零改动）。
* `note-narrow` 判据式逐字对照：备份 L6424 `note.textWidth < WIDE_NOTE_RATIO * column - 0.01`
  ↔ 现 L6540 `note.textWidth < threshold - 0.01`（L6522 `const threshold = WIDE_NOTE_RATIO * column;`）——**代数等价**。
* 违规码词表 10 条（L6206–6209），自检 10/10（`r3-green.log` L798，✓）。

## 8. 诚实清单（未证与残余）

1. **17:19 的失败断言原文**不是从本次运行的产物里读到的（那份日志/报告被 17:25 重跑覆盖），而是从 DSH 会话归档
   里逐字取回的；会话归档在仓库外（`%USERPROFILE%\.dsh\sessions\…`），取证脚本与抽取结果落在 `teeth/_scratch/`。
2. **覆盖面收敛**（§1.4）是本节最重要的诚实登记：760/360 档不再跑逐行字迹口径。
3. `r3-scratch-grid.log` / `r3-scratch-pseudo.log` 的失败条数（6 / 10）**不能**当作「牙失效」的信号：
   它们是「整套断言 × 已变异副本」，正对照必然红；应读**逐条读数**（§3.1 / §3.2）。
4. §3.5 第 7 条与 `contentBox === 0` fallback 的残余观察，本轮不改判据，写明供下一轮标定。
5. 本轮没有重跑整轮浏览器套件（避免与冻结制品相互覆盖、避免浏览器争用）；绿轮/基线轮的读数是**盘上冻结制品**
   加上我从会话归档复原的过程证据，加 §7 的消费者复跑。
