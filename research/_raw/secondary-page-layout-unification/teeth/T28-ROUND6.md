# T28 · 修复轮 6 —— 收掉标记级豁免键（空 `<noscript>` 不得让三牙静默）+ 上界计数不相交

> 执行人：`teeth-engineer-2`（task `t28`，attempt `26a1fbd2-b562-4042-a9e3-dec9761ce4f5`）。
> 来源：T26 复审（reviewer-3）报告 `review/t26/T26-ROUND5.md` §5「残余面」（已量化 · 非 finding）。
> 只改 `scripts/tools/verify-site.js` 与 `teeth/**`；`dist` / `dist.baseline` 跑前跑后逐字节相同（含 Full Gate 的重建）。

## 0. 交付摘要

| 项 | 值 |
| --- | --- |
| 改前 sha256 | `610b25a809c6b3376f0ee0c6d8b30df9e94a657e9ba84a198d749884ec5dd889` · 520 551 B · 8 039 行 |
| 改后 sha256 | `2cbc160dc64f8ade513824065b42d8e38ad7c72dd417cb418bde8d5526b44a5e` · 522 527 B · 8 058 行 |
| 改前备份 | `teeth/_backup/verify-site.pre-t28.bak`（sha16 `610B25A809C6B337` = 契约要求的改前值 ✅） |
| 完整 diff | `teeth/verify-site.t28.diff`（unified=3 · 6 hunk · **+48 / −29** · 22 526 B） |
| `--dir=dist` | **852 项 / 失败 0**（轮 5 基准 852/0）· 0 违规码 · layoutNotes 401 |
| `--dir=dist.baseline` | **852 项 / 失败 36**（轮 5 基准 852/36；并集 **156/48** 未变 · 非 §22c 0 · M13 类 3） |
| `check-ci-consistency.js --expect-checks=38` | **38 / 0** |
| 反证（`font-size:0` + 每条说明插空 `<noscript>`） | 整轮 **EXIT=1** · 4 条失败**全部**含 `note-unrendered`（12 条 plans/#0–#11） |
| Full Gate（现场解析 `action.yml`） | **49 步 · 执行 45 · 通过 45 · 失败 0 · 跳过 4 · exit=0**；第 47 步 852 项 0 失败、第 48 步 858 项 0 失败；`--only=47,48` 复跑 **2/2 exit=0**；dist 303 文件 sha256 **0 差异** |
| 不变量自检 | `teeth/_scratch/check-invariants-t28.cjs` **10 / 10 通过** |

## 1. 改了什么（一处守卫 + 计数口径）

**① ④ 判据去掉标记级豁免键**（T26 的 requiredFix）：

```js
// 改前：if (!note.rendered && note.textLength > 0 && note.glyphRects === 0 && !note.noscriptSubtree) {
// 改后：
if (!note.rendered && note.textLength > 0 && note.glyphRects === 0) {
```

⇒ 豁免只剩「**可见文本长度为 0**」（没有可画的东西）。`<noscript>` 标记不再参与判定，降级为诊断量。
dist 的合法条 `plans/coding/#1` 实测 `rawTextLength 44 / textLength 0 / noscriptSubtree true / glyphRects 0 /
rendered false / codes []` —— 它**仍然有 `noscriptSubtree=true`**，但被 `textLength > 0` 这道真正的门槛放过
（说明豁免与标记无关）。注释里写明了这枚守卫被收掉的原因（T26 的反用读数）。

**② 上界断言改成不相交计数**（断言名同步改写）：

```
✓ §22c 未渲染说明：上界断言 —— 未渲染条要么「可见文本为 0」，要么必须被 note-unrendered 咬中（两类不相交、并集完整、标记不豁免）
   — @1440 未渲染 1 条 = 可见文本 0 的 1 条 [plans/coding/#1] + note-unrendered 0 条 · 交集 0 · 既没归类又没判中 0
     · @1600 未渲染 1 条（文本 0 1 · note-unrendered 0 · 未归类 0）· 诊断：含 <noscript> 的未渲染条 1（不参与豁免）
```

* 两个桶：**可见文本 0**（豁免）与 **note-unrendered 命中**（违规）；判据上互斥（前一桶 `textLength === 0`，
  后一桶要求 `textLength > 0`），断言再显式钉 `交集 === 0` 与 `并集 === unrenderedNotes`。
* `unrenderedNoscript`（含 `<noscript>` 的未渲染条数）保留为**诊断量**，但**不再参与任何豁免或计数分解**。

**③ 配套**：`wideSummary` 新增 `unrenderedNoText` 并重定义 `unrenderedUnexplained`
（= 未渲染 && 文本非空 && 没被判中）；`metrics.layoutSweep` 增加 `unrenderedNoTextNotes`（+1600）；
`criteria.noteUnrendered` 文本改写（写明「不含任何标记级豁免键」）；M13 承重证明里的 `!noscriptSubtree`
子句同步删掉。

**④ 过程中的一次自伤（已修，记录在案）**：E1 的替换把 `push(...)` 整段写进了 new_string，而旧块还在
⇒ 重复了一次 `push` + 多了一个 `}`，`node --check` 立刻报 `Unexpected token 'async'`。删掉残留块后通过。

## 2. 反证：空 `<noscript>` 买不到豁免

`node teeth/_scratch/r6-empty-noscript.cjs`（`plans/` 注入裸 `.snote { font-size: 0 }` +
给**每条**说明（12 条）插一个**空** `<noscript></noscript>`；plans/ 不是任何变异牙的靶页）：

```
① 副本：teeth/_scratch/scratch-t28-empty-noscript（303 文件）
   注入 plans/：裸 .snote { font-size: 0 } + 每条说明（12 条）插一个空 <noscript></noscript>
   dist 未被触碰：plans/index.html ea896e762c3c2ffc
② 整轮 verify-site：EXIT=1 · 98.3s · 852 项断言 / 失败 4 项
   ✗ @1440 逐条页面级说明 — 未渲染 13 条：<noscript> 13 + note-unrendered 12 …
   ✗ @1600 逐条页面级说明 — 同上
   ✗ @760 样本集 — 12 条违规码 [plans/#0…plans/#11 note-unrendered]
   ✗ @360 样本集 — 同上
   上界断言（✓ 且 12 条落在判据桶）：未渲染 13 条 = 可见文本 0 的 1 条 [plans/coding/#1] + note-unrendered 12 条
     · 交集 0 · 既没归类又没判中 0 · 诊断：含 <noscript> 的未渲染条 13（不参与豁免）
   metrics：unrenderedNotes 13 = 文本0 1 + note-unrendered 12 · 诊断 13 · 未归类 0
③ dist 未被触碰：plans/index.html ea896e762c3c2ffc
✅ T28 反证通过
```

要点：**上界断言在这个形状上是 ✓（12 条全被 `note-unrendered` 咬中 ⇒ 没有「未归类」），红由页级断言与
样本集给出** —— 这正是设计：判据负责咬，上界断言负责「不许有未归类」。而在 t26 的读数里，同一个形状
（t24 版判据）是 EXIT=0 / 852 项 0 失败。

（对照：T26 已量化的「改前 binary 同形也 EXIT=0」属于更早的历史形状，本轮不重复跑；轮 5 的
`r5-bare-fontsize0.cjs`（不带空 noscript）依旧红 —— 见 t24 报告。）

## 3. 未削弱（`check-invariants-t28.cjs` 10/10）

```
✓ §22b 块逐字未改 — 第 5518–6099 行 · sha 8c16c64e6fbe28dd…（改前=改后）
✓ diff 的所有 hunk 都落在 §22c 块内 — 15 个 hunk（unified=0）· 最早改前行 6641 · 越界 0
✓ 0.85 阈值逐字未改 · ✓ lineCount >= 2 前置逐字未改
✓ 运行期断言数不变 — 轮 5 852 条 → 本轮 852 条 · 归一化后缺失 1 / 新增 1
✓ 既有断言一条不少（最多 1 条是「改名」且已登记）— 就是上面那条上界断言
✓ 静态 `check(` 计数不减 — 483 → 483
✓ 本轮新增/改动行零像素与颜色采样 — 新增 48 行 / 删除 29 行 · 命中 0 处
✓ 标记级豁免键已清零 — 判据行 = if (!note.rendered && note.textLength > 0 && note.glyphRects === 0) {
✓ noscriptSubtree 仍保留为诊断量 — 出现 9 处（字段 / 消息 / 诊断 metric）
```

**断言计数的唯一变化**：那条上界断言**改名**（从「`<noscript>` 之外不许有未渲染说明…」改成
「两类不相交、并集完整、标记不豁免」），数量 852→852，**没有增删**。改名是因为被断言的语义本身变了
（豁免依据从「标记」改成「可见文本为 0」），不是为了绕开判定；改名已在 `diff` 与本节逐字登记。

## 4. 读数对照（契约 verify 逐条）

| 命令 | 轮 5 基准（610b25a8） | 本轮（2cbc160d） | 判定 |
| --- | --- | --- | --- |
| `--dir=dist` | 852/0 | **852/0** · 0 违规码 · `unrenderedNotes 1 = 文本0 1 + note-unrendered 0` | ✅ |
| `--dir=dist.baseline` | 852/36 · 并集 156/48 | **852/36** · 并集 **156/48** · 非 §22c 0 · M13 类 3（与轮 5 逐项相同） | ✅ 未扩大 |
| `check-ci-consistency --expect-checks=38` | 38/0 | **38/0** | ✅ |
| 空 noscript 反证 | （轮 5 该形状 EXIT=0 = 要收的洞） | **EXIT=1** · 4 条失败全含 `note-unrendered` | ✅ 反转 |
| Full Gate 完整 | 49 步 · 45/45 · exit 0 | **49 步 · 执行 45 · 通过 45 · 失败 0 · 跳过 4 · exit=0** | ✅ |
| Full Gate `--only=47,48` | 2/2 · 47 步 852 项、48 步 858 项 | **2/2 · exit=0**（47 步「852 项 0 失败」· 48 步「858 项 0 失败」） | ✅ |
| dist 零写入 | 303 文件逐字节相同 | Full Gate 含第 34 步重建 ⇒ 跑前/跑后 sha256 **0 差异** | ✅ |

成本：§22c 分档 1440 7s / 1600 7.3s / 390 7.5s / 样本 3.3s · 导航 **631**（与轮 5 相同）。

## 5. 诚实项

1. **改名而非增删**：上界断言改名 1 条（§3）；852→852，`check(` 483→483。
2. **反证装置自身返工一次**：第一版 `r6-empty-noscript.cjs` 的注入正则写成 `<p class="snote[^"]*">`，
   漏掉了两条带 `id` 的说明（`<p class="snote" id="plans-hub-data">` / `…cross`），且把「上界断言应当 ✓」
   误当成「应当红」⇒ 第一次跑报「反证未通过」。改成 `<p class="snote[^"]*"[^>]*>` 并修正期望后重跑通过。
   首轮读数（漏 2 条注入时）也是 EXIT=1 / 4 条失败，已在 `r6-bare-console.log` 的历史里被覆盖，
   此处如实登记该次返工。
3. 未覆盖：只跑 Edge；视口仍 1440/1600/760/360；未跑 `dist.synth-fixed`；`<noscript>` 之外的
   其它标记级豁免键未引入（本轮把唯一的那个收掉了）。

## 6. 文件清单（全部在 `teeth/**`）

* 报告：`teeth/T28-ROUND6.md`（本文件）· diff：`teeth/verify-site.t28.diff` · 备份：`teeth/_backup/verify-site.pre-t28.bak`
* 脚手架：`_scratch/r6-empty-noscript.cjs`（反证）· `_scratch/check-invariants-t28.cjs`（不变量 10 项）·
  `_scratch/inspect-plans-notes.cjs`（核注入正则的诊断）
* 读数：`_scratch/r6-green.{log,json}` · `_scratch/r6-m0.{log,json}` · `_scratch/r6-ci.log` ·
  `_scratch/r6-empty-noscript.{log,}json`（+ `r6-bare-console.log`）·
  `_scratch/r6-gate/`（49 步日志 + `summary.json`）· `r6-gate-full.log` / `r6-gate-4748.log` ·
  `_scratch/r6-dist-{before,after}.txt`（303 文件 sha256，0 差异）
* 副本（可删）：`_scratch/scratch-t28-empty-noscript/`（303 文件）
