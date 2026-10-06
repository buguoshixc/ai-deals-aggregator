# T29 · 复审 round 6 —— 标记级豁免键是否真被收掉（空 `<noscript>` 反证 + 计数不相交 + 未削弱）

> 复审者：`reviewer-3`（task `t29`，attempt_id `f018d1cb-0ac5-4f3e-b449-17c58bb13e2e`）。
> 被复审对象：`scripts/tools/verify-site.js` sha256 `2cbc160dc64f8ade513824065b42d8e38ad7c72dd417cb418bde8d5526b44a5e`（522 527 B / 8 058 行）
> · 改前备份 `teeth/_backup/verify-site.pre-t28.bak` = `610b25a809c6b337…`（两枚哈希本轮开始/结束各量一次，均一致）。
> **全部读数由复审方自己的装置跑出**（13 次整轮 + 1 次内存停用 ④ 的反证轮 + 1 次 gate 48 步命令复跑 + 1 个独立渲染态探针）；t28 的自留脚本/日志只当线索。
> 写盘范围：`review/t29/**`。dist / dist.baseline / 生产源码零写入（§8）。
> 结论：**verdict = pass**。T26 量化的「空 `<noscript>` 买豁免」路径已真实关闭；豁免只剩「可见文本长度为 0」，与标记无关；上界断言两桶不相交、非恒真、noscript 不再吞计数；读数与 t28 自报逐项一致；Full Gate 完整性核对通过。
> 唯一要登记的**口径变化**（非 blocker、有量化）见 §7。

---

## 0. 装置与命令

| 装置（`review/t29/harness/`） | 作用 |
| --- | --- |
| `mk-scratch.cjs` | 从 dist 造 4 份副本：`clean`（逐字节）· `key`（plans/ 每条说明插**空** `<noscript></noscript>` + `.snote{font-size:0}`）· `key-mixed`（插**非空** `<noscript>T29 fallback</noscript>` + 同一 fs0）· `bare-fs0-plans`（只 fs0，不插标记）；逐页校验冻结串仍 1 次；dist 全树 303 文件 sha16 清单跑前跑后相同 |
| `mk-empty.cjs` | 追加 `empty-notes`（plans/ 12 条说明内容清空）—— 量化「豁免语义」变化用 |
| `run-old.cjs` | pre-t28 备份**内存编译**成生产路径，生产文件零写入（守卫显式要求「有 note-unrendered、无 unrenderedNoText、有 t24 豁免式」） |
| `run-matrix.cjs` | 12 次整轮 `verify-site.js --dir=… --json=…` |
| `run-no4.cjs` | 反证轮：把 ④ 判据守卫在内存里改成 `if (false)`（生产零写入），跑同一份 `scratch/key` |
| `static-invariants.cjs` · `analyze-t29.cjs` · `check-gate.cjs` · `check-gate2.cjs` · `recheck-probe.cjs` | §22b 逐字节 · check() 字面量多重集 · 名称多重集 · 条级读数 · action.yml/summary 解析 · 探针旗标按新判据重算 |
| `probe-render.cjs` | **独立**渲染态探针（Playwright + Edge，自实现）：盒宽/高 · 可见文本（排除 noscript）· 原始文本 · 字形盒 · 是否含 noscript |

命令：`mk-scratch.cjs` → `run-matrix.cjs`（8 轮）→ `mk-empty.cjs` + `run-matrix.cjs empty`（2 轮）→ `run-no4.cjs`（1 轮）→ `probe-render.cjs` → `analyze-t29.cjs` 等 → `check-ci-consistency.js --expect-checks=38` → gate 步 48 原命令复跑。

---

## 1. 原始形态反证：空 `<noscript>` 的豁免路径已死

| run | 口径 | 产物 | EXIT | 断言 | 失败 |
| --- | --- | --- | --- | --- | --- |
| `new-key` | 改后 `2cbc160d…` | `scratch/key`（fs0 + 12 条空 noscript） | **1** | 852 | **4** |
| `old-key` | 改前 `610b25a8…`（内存编译） | **同一份产物** | **0** | 852 | **0**（轮 5 的免判路径原样复现） |
| `new-key-mixed` | 改后 | `scratch/key-mixed`（标记仍在、noscript 非空） | 1 | 852 | 4 |
| `new-bare-plans` | 改后 | `scratch/bare-fs0-plans`（无标记） | 1 | 852 | 4 |
| `new-clean` | 改后 | `scratch/clean`（不注入） | **0** | 852 | 0 |

`new-key` 的 4 条失败（与 t28 自报一致，**全部指向 note-unrendered**）：

```
✗ §22c @1440 逐条页面级说明…   （12 条 plans/#0–#11 note-unrendered）
✗ §22c @1600 逐条页面级说明…
✗ §22c @760 样本集 29 页…     （12 条，同上）
✗ §22c @360 样本集 29 页…
```

上界断言在 `new-key` 上是 **ok=true**，detail：`@1440 未渲染 13 条 = 可见文本 0 的 1 条 [plans/coding/#1] + note-unrendered 12 条 · 交集 0 · 既没归类又没判中 0 … 诊断：含 <noscript> 的未渲染条 13（不参与豁免）`
⇒ 12 条落进**判据桶**、noscript 桶只当诊断量。`old-key` 的上界断言则是 `未渲染 13 条 = <noscript> 13 条 … note-unrendered 0 条`（旧口径）。

条级读数（`metrics.layoutNotes`，plans/#0–#11）：`rendered=false · textLength>0 · glyphRects=0 · noscriptSubtree=true · codes=["note-unrendered"]` —— 标记在、照样咬。

---

## 2. 豁免与标记无关（三个方向都量过）

| 形状 | 标记 | 可见文本 | 字形盒 | 盒高 | 新判据 | 实测 |
| --- | --- | --- | --- | --- | --- | --- |
| dist `plans/coding/#1`（合法未渲染） | 有 noscript | **0** | 0 | 0 | **不咬** | 独立探针：盒 1380×0 · 可见 0 · 原始 44 · 字形 0 · noscript true；`codes=[]`；dist 852/0 |
| `key`（同一标记 + 可见正文） | 有 noscript（空标签） | 121…35 | 0 | 0 | **咬** | 12/12 `note-unrendered` |
| `key-mixed`（标记 + 非空回退文本） | 有 noscript（非空） | 121…35 | 0 | 0 | **咬** | 12/12 `note-unrendered`（原始文本比可见文本多 12 字 = 回退文本） |
| `bare-fs0-plans`（无标记） | 无 | 121…35 | 0 | 0 | **咬** | 12/12 `note-unrendered` |

独立探针按新判据重算（`recheck-probe.cjs`）：`key` 新判据会咬 12 / 旧判据会咬 0；`key-mixed` 12 / 0；`bare` 12 / 12；`clean plans/coding/` 0 / 0。
`noscript { display: block; }` 覆盖下，`plans/coding/#1` 仍 盒 1380×0 / 可见 0 / 字形 0（回退内容不会因此可见）⇒ 不制造假红。
**结论：判据只看 `rendered / textLength / glyphRects`，标记在判据里已无任何角色**（源码 §3 逐处核对）。

---

## 3. 计数不相交 + 上界断言非恒真

* 源码（L7013–7032）：条件只由 `textLength` 与 `codes` 组成 —— `unexplained=0`（未渲染 ∧ textLength>0 ∧ 无码）· `交集=0`（textLength===0 ∧ 有码）· `noText + codeRows === 全部未渲染` · `unrendered === 全部未渲染` · 1600 侧 `noText + note-unrendered === unrendered` 且 `unexplained === 0`；`unrenderedNoscript` **只出现在 detail 文本**（且标注「不参与豁免」）。
* 实测三态都出现过，说明它既不恒真也不恒假：
  * `new-dist` / `new-clean` / `new-baseline`：**ok=true**（未渲染 1 = 文本 0 的 1 + 码 0）。
  * `new-key` / `new-key-mixed` / `new-bare-plans`：**ok=true**（未渲染 13 = 文本 0 的 1 + 码 12，交集 0）。
  * **反证轮 `no4-key`**（内存把 ④ 改成 `if (false)`，同一份 `scratch/key`）：**ok=false** —— `交集 0 · 既没归类又没判中 12 · 违规条：plans/#0 … plans/#11`；整轮 EXIT=1 / 4 条失败 = 上界断言 + M13 复测 + M13 承重证明 + 违规码自检（此时 @1440 页级因码消失而变绿 ⇒ 断言是唯一兜底）。
* `new-empty` / `old-empty`（说明内容清空）也给出方向性对照：旧版上界断言 ✗（`其它未渲染 12 条`），新版 ✓（13 条全归「可见文本 0」桶）—— 见 §7。

---

## 4. 「改名 1 条」不是改名规避

* 静态：全文 `check(` 字面量 **483 → 483**，多重集**删 1 增 1**，正是上界断言那一条：
  `- §22c 未渲染说明：上界断言 —— <noscript> 之外不许有未渲染说明，且 unrenderedNotes 与 note-unrendered 判据一致`
  `+ §22c 未渲染说明：上界断言 —— 未渲染条要么「可见文本为 0」，要么必须被 note-unrendered 咬中（两类不相交、并集完整、标记不豁免）`
* 运行期：852 → 852；归一化动态计数（「N 个码」「N 次导航」）后**缺失 0 / 新增 1（就是这条改名）**；失败断言集合 old-baseline × new-baseline **双向差 0**。
* 旧条件覆盖分析（逐条）：旧 ①`未渲染且无标记 ⇒ 红`、②`unrendered === 全部`、③`unrendered === noscript + 码`、④⑤ 1600 侧两条 —— 新版把 ①② 换成 `未归类=0`+`交集=0`+`并集完整`，把 ③ 换成不相交的两桶，1600 侧同样重写。
  **同一语义的覆盖**：任何「有可见文本的未渲染条」在新版**必然**要求被 ④ 咬中（旧版在带标记时可豁免 —— 正是被反用的那一格）；**唯一放宽的格子**是「可见文本 0 的未渲染条」不再要求带 noscript 标记（§7 有量化）。
* 没有任何断言被删除：`check(` 483→483；运行期 852→852；§22b 切片 **37 318 B · sha16 `077dc51ef68af7fd` · 改前改后逐字节相同**（自 diff）。

---

## 5. 未削弱 · 零像素 · 读数复核

| 检查 | 读数（自跑） |
| --- | --- |
| `WIDE_NOTE_RATIO = 0.85` | 改前/改后**同一行同值** |
| ② 前置 `note.lineCount >= 2` | 判据式逐字未动（`&& note.lineCount >= 2 && note.widestLine < threshold - 0.01`） |
| ④ 判据行 | `if (!note.rendered && note.textLength > 0 && note.glyphRects === 0) {`（L6652，`&& !note.noscriptSubtree` 已删） |
| `noscriptSubtree` 残留 9 处 | 字段定义 L6499 · 注释 L6647 · 消息文本 L6654 · layoutNotes 行映射注释/字段 L6868/6870 · 诊断 metric L6917 · 合成自检夹具 L7361/7395 —— **都不参与判据**（判据里零引用，§3 已核） |
| 零像素/颜色采样 | 新增 48 行里 `getImageData/toDataURL/canvas/screenshot/devicePixelRatio/.color/backgroundColor/backgroundImage/pixel` 命中 **0** |
| `--dir=dist` | **852 / 0 · EXIT=0** |
| `--dir=dist.baseline` | **852 / 36 · EXIT=1**；并集 **156 / 48**（`narrow 156 · ink 108 · union 156/48`）；新判据 `unrenderedTextNotes = 0` |
| 与轮 5 对比 | baseline 失败集合 old-baseline × new-baseline **双向差 0**（36 条逐条同名，除那条不参与失败的改名） |
| ci | **38 / 0 · EXIT=0** |

---

## 6. Full Gate 完整性

* **现场解析** `.github/actions/gate/action.yml`（自写解析器，按 `- name:` 切步）：**49 步**（其中 3 步带 `if:`）。
* t28 自留 `teeth/_scratch/r6-gate/summary.json` 逐项核对：`stepsInAction=49`（= 我解析的 49）· `executed=45` · `passed=45` · `failed=0` · `skipped=4` · `skippedNotRunYet=0` · `exitCode=0` · `verifySiteSha256=2cbc160d…`（= 当前文件 sha）· `results` 49 条且每条名字都能在 action.yml 里找到（nameMismatch 0 条）。
* 被跳过的 4 步 = `1 Install dependencies`（本机 node_modules 已就位）· `45 Prepare browser for the real-browser gate`（CI 专用）· `46 Browser availability decision`（CI 专用）· `49 Gate conclusion`（CI 专用），每条都有书面理由；两个浏览器步 47/48 都**真跑**（`browserSteps` 记录 2 条，各 ~96 s，`verifySiteSha256` 均 = 2cbc160d…）。
* 第 47 步日志尾：`✓ 验收 852 项，失败 0 项`；第 48 步日志尾：`✓ 验收 858 项，失败 0 项`。
* **复审方复跑第 48 步的原命令**：`node scripts/tools/verify-site.js --compare=research/_raw/ours-baseline/verify.json` ⇒ **EXIT=0 · 858 项 / 失败 0 项**（自写 `--json=` 报告留档）—— 与记录逐值一致。

---

## 7. 登记的口径变化（有量化 · 非 blocker）

* 现象：**可见文本长度为 0 的未渲染条**现在一律豁免（旧版要求它带 noscript 标记才豁免）。
* 量化（`empty-notes`：plans/ 12 条说明内容清空 —— 未渲染、可见文本 0、无标记、无字形盒、无码）：
  * 旧版：上界断言 **✗**（`其它未渲染 12 条 · 违规条：plans/#0 …`）
  * 新版：上界断言 **✓**（`未渲染 13 条 = 可见文本 0 的 13 条 […]`）
  * （那一轮另有 1 条失败来自我这次内容变异本身触发的 `/plans/ 互链…` 检查，与 §22c 无关，故两轮都出现，用于隔离口径变化。）
* 判定：**不是新免判面，也不隐藏任何可见布局缺陷** —— 空说明（或纯 `<noscript>` 回退）没有任何可画的正文，②/① 的判据本来也无从取证；t28 的新语义（「豁免 = 没有可画的东西」）与注释一致，且把可被**标记**反用的旧豁免换成不可反用的量。若将来想连空说明也守（内容回归壳），可在上界断言里对 `unrenderedNoTextNotes` 另加一条「空说明条数上界」，但那属于内容面，不在本轮 §22c 的布局口径内。**不作为 finding。**
* 另注：`unrenderedNoTextNotes` 已作为 metric 导出（`metrics.unrenderedNoTextNotes`），消费者可自行加界。

---

## 8. 边界与完整性

* **零写入**：`mk-scratch.cjs` 的 dist 303 文件 sha16 清单跑前跑后相同；收尾复核 `scripts/tools/verify-site.js = 2CBC160DC64F8ADE513824065B42D8E38AD7C72DD417CB418BDE8D5526B44A5E`（未被本轮任何动作触碰）；`git status --porcelain dist dist.baseline` = **0 条**。
* **未覆盖（如实登记）**：未跑 `--dir=dist.synth-fixed`（不在验收清单）；未整体重跑 Full Gate 的 45 个执行步（本轮按要求做「现场解析步数 + 核对 summary/日志 + 复跑第 48 步原命令」；第 47 步等价于我自己的 dist 852/0 轮）；「空说明」的额外守卫属内容面，未改判据。
* **成本**：13 次整轮 ≈ 21 分钟 + 第 48 步复跑 ≈ 100 s + 探针 ≈ 40 s；浏览器独占期间无并发。

## 9. 结论

| 验收项 | 判定 |
| --- | --- |
| 独立反证：fs0 + 每条插**空** `<noscript>` ⇒ 整轮 EXIT≠0（同一产物改前 = EXIT=0/852/0） | **pass**（§1） |
| 守卫确为**移除**（不是换豁免）：④ 不再以「存在 noscript 元素」免判；豁免只剩 `textLength` | **pass**（§2/§3） |
| dist 仍 0 违规码 0 失败；`plans/coding/#1` 的排除依据是 `textLength > 0`（自量字段） | **pass**（§2/§5） |
| 上界计数不相交、noscript 不吞计数、仍会咬（放大 + 停用 ④ 都验证） | **pass**（§3） |
| 未削弱：0.85/`lineCount>=2` 逐字未改；既有断言缺失 0（归一化后仅 1 条改名、无删除）；§22b 逐字未改；零像素/颜色采样 | **pass**（§4/§5） |
| 读数复核：dist 852/0 · baseline 852/36 · 并集 156/48，与 t28 自报一致 | **pass**（§5） |
| Full Gate 完整性：现场解析 49 步；executed/passed/failed/skipped/exit 与记录一致；第 48 步命令复跑一致 | **pass**（§6） |

**verdict = pass** ⇒ 轮 5 的残余面（空 `<noscript>` 豁免键）已闭合；唯一登记项是 §7 的口径变化（内容面，非阻塞）。
