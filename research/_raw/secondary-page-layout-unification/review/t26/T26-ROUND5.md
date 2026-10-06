# T26 · 复审 round 5 —— 未渲染判据与上界断言的对抗验证（T22-F1 闭合确认 + 排除规则不可反用）

> 复审者：`reviewer-3`（task `t26`，attempt_id `aa0d0f86-aa44-42ec-81d9-317c3ea3ca3c`，全新会话）。
> 被复审对象：`scripts/tools/verify-site.js` sha256 `610b25a809c6b3376f0ee0c6d8b30df9e94a657e9ba84a198d749884ec5dd889`（520 551 B / 8 039 行）
> · 改前备份 `teeth/_backup/verify-site.pre-t24.bak` = `fd3c9a3090dca11b…`（两枚哈希本轮开始/结束各量一次，均一致）。
> **全部读数由复审方自己的装置跑出**（12 次整轮 + 1 次内存停用判据的反证轮 + 1 个独立渲染态探针）；t24 的自留脚本/日志只当线索。
> 写盘范围：`research/_raw/secondary-page-layout-unification/review/t26/**`。dist / dist.baseline / 生产源码零写入（§7）。
> 结论：**verdict = pass**（T22-F1 闭合、`<noscript>` 排除正确且是子树语义、上界断言真的会咬、判据未削弱、零像素判定、读数与自报一致）；
> 另有 1 项**有量化的残余面**见 §6（非阻塞，附 1 行级 requiredFix 与归属）。

---

## 0. 装置与命令

| 装置（`review/t26/harness/`） | 作用 |
| --- | --- |
| `mk-scratch.cjs` | 从 dist 造 5 份副本：`clean`（逐字节）· `bare-fs0`（**186 页**全注入裸 `.snote{font-size:0;}`）· `bare-fs0-plans`（只 plans/ 一页）· `noscript-key`（plans/ 每条说明内插**空** `<noscript></noscript>` + 同一 fs0）· `noscript-visible`（plans/ 加 `noscript{display:block}`）；逐页校验冻结串仍恰好 1 次；dist 全树 303 文件 sha16 清单跑前跑后相同 |
| `run-old.cjs` | pre-t24 备份**内存编译**成生产路径（相对 require 照常解析），生产文件零写入 |
| `run-matrix.cjs` | 11 次整轮 `verify-site.js --dir=… --json=…` |
| `run-no4.cjs` | 反证轮：把 ④ 判据守卫在**内存里**改成 `if (false)`（生产零写入），跑同一份 `bare-fs0-plans` |
| `static-invariants.cjs` · `analyze-t26.cjs` · `check-two.cjs` · `check-baseline3.cjs` | §22b 逐字节 · check() 字面量多重集 · 条级读数 · 同页子树对照 · 归一化断言名对照 · baseline 增量归属 |
| `probe-render.cjs` | **独立**渲染态探针（Playwright + Edge，自实现）：盒宽/高 · 可见文本（排除 noscript）· 原始文本 · 字形盒（`Range.getClientRects` 宽高>0）· 是否含 noscript 子树 |

命令：`mk-scratch.cjs` → `run-matrix.cjs`（11 轮）→ `run-no4.cjs`（1 轮）→ `probe-render.cjs` → 4 个分析脚本 → `check-ci-consistency.js --expect-checks=38`。

---

## 1. 独立反证：裸 `font-size:0` 现在会红，且红因指向新判据

| run | 口径 | 产物 | EXIT | 断言 | 失败 |
| --- | --- | --- | --- | --- | --- |
| `new-bare-fs0-plans` | 改后 | `scratch/bare-fs0-plans` | **1** | 852 | **5** |
| `old-bare-fs0-plans` | 改前（内存编译） | 同一份产物 | **0** | 848 | **0**（T22-F1 的假绿复现） |
| `new-clean` | 改后 | `scratch/clean`（不注入） | **0** | 852 | 0 |
| `new-bare-fs0` | 改后 | `scratch/bare-fs0`（186 页全注入） | 1 | 852 | 20 |

`new-bare-fs0-plans` 的 5 条失败**全部**指向新判据（与 t24 自报逐条一致）：

```
✗ §22c @1440 逐条页面级说明…        （detail：未渲染 13 条：<noscript> 1 + note-unrendered 12）
✗ §22c @1600 逐条页面级说明…
✗ §22c 未渲染说明：上界断言…        （ok=false：@1440 未渲染 13 条 = <noscript> 1 条 [plans/coding/#1] + note-unrendered 12 条 · 其它未渲染 12 条 · 违规条：plans/#0 … plans/#11）
✗ §22c @760 样本集 29 页…          （12 条 plans/#0–#11 note-unrendered）
✗ §22c @360 样本集 29 页…          （同上）
```

条级容器：`metrics.layoutNotes` 里 plans/#0–#11 全部 `rendered=false · textLength>0 · glyphRects=0 · noscriptSubtree=false · codes=["note-unrendered"]`；
窄柱/字迹/藏字码在该页 **0 条** —— 正是「修复前三条判据同时静默」的形状，现在由 ④ 咬住。

**独立物理对照**（`probe-render.cjs`，不调用被测函数）：`bare-fs0-plans plans/` 12 条的实测盒高**全 0**、可见文本 121/66/46/92/18/79/63/32/67/12/53/35 字、字形盒**全 0** ⇒ ④ 的输入形状属实；
`clean plans/`（= dist）12 条盒高 20.39、字形盒 1–8 ⇒ 不判。

`new-bare-fs0`（全站）20 条失败 = 上面 5 类（页级/上界/样本集）+ 15 条 **M 牙连带**（把全站 `.snote` 的字体压成 0 后，M1–M4/M6/M8/M9a/M9b/M10/M11 的「变异后必须出现某码」自然落空）—— 这是**全局注入**的副作用，不是判据问题；带 `bare-fs0-plans` 的定点对照才是干净的反证（5 条，M 牙全绿）。

---

## 2. 排除规则：`<noscript>` 被正确放过，且是**子树语义**

* **静态**：唯一开关是 `noscriptSubtree: Boolean(el.querySelector('noscript'))`（L6499）——子树查询，**没有**任何 route/index 白名单参与跳过；新代码里出现的路由串只有 M13 牙的靶页 `docs/data/`（那是变异目标，不是豁免名单）。④ 的出口只有一处 `push('note-unrendered', …)`（L6651）。
* **动态（同页对照，最硬）**：在 `new-bare-fs0`（全站 fs0）里，`plans/coding/` 同页 5 条 —— **#1（含 `<noscript>`，可见文本 0）被放过**，而**同页 #0/#2/#3/#4 全部被 `note-unrendered` 咬中**。⇒ 豁免粒度是「这一条自己有没有 noscript 子树」，不是按页、也不是按条白名单。
* **dist 侧**：`plans/coding/#1` 实测 `盒 1380×0 · 可见文本 0 · 原始文本 44 · 字形盒 0 · noscriptSubtree true · codes []`（独立探针与门禁 `layoutNotes` 两边同值）；`--dir=dist` **852/0**，上界断言 ok=true：`@1440 未渲染 1 条 = <noscript> 1 条 [plans/coding/#1] + note-unrendered 0 条 · 其它未渲染 0 条`。
* **「让 noscript 可见」反击**：`noscript { display: block; }` 对 `/plans/coding/#1` 没有任何可见化效果（探针实测仍 盒 1380×0 / 字形盒 0 / 可见文本 0），也不制造假红 ⇒ 该反击是死路。
  （注：`scratch/noscript-visible` 那一轮我建在 plans/ 上，而 plans/ 本身没有 noscript 元素，因此它与 `bare-fs0-plans` 同形（5 条失败）——这是**装置选择失误**，真正的可见化实验由上面的探针完成，不作为反证证据。）

---

## 3. 上界断言真的被引用、真的会咬（不是 metric 复述）

| 实验 | 结果 |
| --- | --- |
| dist（干净） | 断言 **ok=true**，detail 直接引用 metric：`未渲染 1 条 = <noscript> 1 条 [plans/coding/#1] + note-unrendered 0 条 · 其它未渲染 0 条` |
| `bare-fs0-plans`（放大未渲染条数） | 断言 **ok=false**：`其它未渲染 12 条` + `违规条：plans/#0 … plans/#11` ⇒ 会红 |
| `noscript-key`（13 条未渲染但全带 noscript） | 断言 **ok=true**：`未渲染 13 条 = <noscript> 13 条 [plans/#0 … plans/coding/#1] + note-unrendered 0 条` ⇒ 不是恒红，条件可满足 |
| **反证轮 `no4`（内存停用 ④ 判据）** | 同一份 `bare-fs0-plans`：852 项 **EXIT=1 / 4 条失败** = 上界断言（`其它未渲染 12 条`）· M13 复测 · M13 承重证明 · 违规码自检（11 个码里 note-unrendered 不可达）；而 @1440 页级断言因为码消失而变绿 ⇒ **断言与判据真正耦合**，删判据也不会静默 |

断言的五个合取项我逐条读过源码（L6998–L7008）：1440 侧的「<noscript> 之外不许有未渲染」+ 两处 metric 一致性 + 1600 侧的划分与判据计数一致性；
其中 `at1600.unrendered === noscript + unexplained` 是划分恒等式（自检性质），其余四项才是承重项 —— 上面的实验分别打到了「承重项红」与「恒等式可满足」。

---

## 4. 判据未削弱 · 无像素判定

| 检查 | 读数（自跑） |
| --- | --- |
| `WIDE_NOTE_RATIO = 0.85` | 改前/改后**同一行同值** |
| ② 前置 `note.lineCount >= 2` | 判据式逐字未动（`&& note.lineCount >= 2 && note.widestLine < threshold - 0.01`） |
| 既有断言 | 归一化动态计数（「N 个码」「N 次导航」）后：**缺失 0 / 新增 4**（上界断言 1 + M13 锚点 1 + M13 复测 1 + M13 承重证明 1）；未归一化时唯一差异正是那两条带计数的名字（10→11 个码、630→631 次导航） |
| 静态 `check(` 字面量 | 481 → **483**（removed 0 / added 2：上界断言 + M13 复测模板） |
| §22b | `/* §22b`→`/* §22c` 切片 **37 318 B · sha16 `077dc51ef68af7fd` · 逐字节相同**（583 行窗口） |
| 违规码词表 | 10 → 11（+`note-unrendered`），自检断言名同步变化 —— 非规避 |
| 无像素判定 | **新增 118 行里 pixel/颜色 API 命中 0**（`getImageData/toDataURL/canvas/screenshot/devicePixelRatio/.color/backgroundColor/backgroundImage` 全部未命中）；新块用到的 DOM 面只有 `getBoundingClientRect/clientWidth/getClientRects/Range/childNodes/nodeType/textContent/querySelector`。文件里既有的 `page.screenshot`（L849–870）与 `getComputedStyle(...).backgroundColor`（L376/1302/1313/2846/5042）都在 §22c 之外、且与本次改动无关 |
| 冻结串/白名单 | 新增代码里唯一的页面串是 M13 靶页 `docs/data/`；判据本身按 note 逐个评估 |

---

## 5. 读数复核（与 t24 自报一致）

| 项 | t24 自报 | 复审方实跑 |
| --- | --- | --- |
| `--dir=dist` | 852 / 0 | **852 / 0 · EXIT=0** |
| `--dir=dist.baseline` | 852 / 36 | **852 / 36 · EXIT=1** |
| baseline 并集 | 156 / 48，新判据 0 命中 | **156 / 48**（`narrow 156 · ink 108 · union 156/48 · unrenderedText 0`） |
| baseline 失败 33→36 的三条 | 全是 M13 锚点类 | **是**：`M13 变异锚点唯一`（detail：锚点出现 0 次）· `M13 变异后复测`（锚点不落地按红）· `M13 承重证明`；`removed=[]`。原因实测：`dist.baseline/docs/data/index.html` 冻结串 **0 次**（dist 是 1 次）⇒ 与 t14 加 M11/M12 时 27→33 同构 |
| ci | 38 / 0 | **38 / 0 · EXIT=0** |
| 导航 | 630→631 | 断言名里「631 次导航」与实测一致（名字归一化对照证明这只是计数变化） |

---

## 6. 残余面（有量化，**非 blocker**）：空 `<noscript>` 可当「豁免键」

* **实测**：同一份 fs0 缺陷（plans/ 12 条说明盒高 0、可见文本非空、零字形盒）——
  · 不插 noscript ⇒ 整轮 **EXIT=1 / 5 条失败**（§1）；
  · 在每条说明里插一个**空** `<noscript></noscript>` ⇒ 整轮 **EXIT=0 / 852 项 0 失败**，上界断言 ok=true（把 13 条未渲染全归到「<noscript> 13 条」名下）。
* **为什么可能是设计冗余**：合法 noscript 条的可见文本长度是 0，`textLength > 0` 这一项**已经**把它排除；因此 `!noscriptSubtree` 这个合取项只在「有可见正文 + 含 noscript」时起作用 —— 也就是上面的形状。它对自己注释里写的合法场景是冗余的，实际功能是**豁免键**。
* **判定（为什么不是 blocker）**：
  1. **相对改前不是新增检测缺口**：同一份 `noscript-key` 用改前 binary 跑也是 **EXIT=0 / 848 项 0 失败**（`old-noscript-key`）—— 这一类本来就不判；t24 没有让任何原本会红的形状变绿。
  2. **CSS-only 回归打不到它**：`noscriptSubtree` 是 DOM 事实，CSS 改不动；要触发必须往说明里**插一个 `<noscript>` 元素**（标记层改动），而这条门禁守的是布局/CSS 回归。
  3. 页级与上界断言仍承担兜底：任何**额外**的未渲染条（不带 noscript）都会让上界断言立刻红（§3 的 `no4` 轮已证）。
* **requiredFix（建议下一轮，1 行级）**：把 ④ 守卫的 `&& !note.noscriptSubtree` 去掉（合法条已由 `textLength>0` 排除），或收紧为「所有非空文本都落在 `<noscript>` 子树内」；同时把上界断言的 `unrendered === noscript + codeRows` 改成不相交计数（否则带 noscript 的**违规**条会被两边重复计）。owner：`verify-site.js` §22c（下一修复轮，或合并进 t27 类任务）。
* 「把窄化条整个包进 `noscript`」：可见文本变 0 ⇒ 判据按设计沉默（与 dist 的 `plans/coding/#1` 同形），改前同样沉默；不构成新面。

---

## 7. 边界与完整性

* **零写入**：`mk-scratch.cjs` 的 dist 303 文件 sha16 清单跑前跑后相同；收尾复核 `scripts/tools/verify-site.js = 610B25A809C6B3376F0EE0C6D8B30DF9E94A657E9BA84A198D749884EC5DD889`（未被本轮任何动作触碰）；`git status --porcelain dist dist.baseline` = **0 条**。
* **未覆盖（如实登记）**：未跑 `--dir=dist.synth-fixed`（不在验收清单）；未复跑 t24 的 Full Gate（本轮验收不要求；ci 38/38 与两轮读数已复核）；「让 noscript 可见」用探针而非整轮（见 §2 注）。
* **成本**：12 次整轮 ≈ 20 分钟（每次 93–100 s）+ 探针 ≈ 2 分钟；浏览器独占期间无并发。

## 8. 结论

| 验收项 | 判定 |
| --- | --- |
| 独立反证：裸 `font-size:0` ⇒ 整轮 EXIT≠0 且红因指向新判据/上界断言；同副本不注入 ⇒ EXIT=0 | **pass**（§1） |
| 排除规则正确：`<noscript>` 条被放过、dist 852/0；且是**子树语义**而非页/条白名单 | **pass**（§2） |
| 未削弱：0.85 与 `lineCount>=2` 逐字未改；既有断言缺失 0；§22b 逐字未改（自 diff） | **pass**（§4） |
| 无像素判定：新增判据只用盒量/render 状态/字形盒 | **pass**（§4） |
| 上界断言真的被引用且会红（合成/放大未渲染条数；删判据也红） | **pass**（§3） |
| 读数复核：dist 852/0 · baseline 852/36，与 t24 自报一致；baseline 33→36 的三条全是 M13 锚点类 | **pass**（§5） |

**verdict = pass** ⇒ T22-F1 视为闭合。唯一移交事项是 §6 的空 `<noscript>` 豁免键（有量化、非回归、CSS 打不到），建议下一轮 1 行收紧。
