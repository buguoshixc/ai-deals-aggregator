# T24 · 修复轮 5 —— 未渲染说明的判据与上界断言（闭合 T22-F1）

> 执行人：`teeth-engineer-2`（task `t24`，attempt `d0e94f0c-9ef6-4fc0-aa10-fd77fd57c5be`）。
> 取证入口：`verify/T22-GATE-SELF-AUDIT.md` §6.4 / Findings T22-F1（medium）。
> 只改 `scripts/tools/verify-site.js` 与 `teeth/**`；`dist` / `dist.baseline` 跑前跑后逐字节相同（下面有读数）。

## 0. 交付摘要

| 项 | 值 |
| --- | --- |
| 改前 sha256 | `fd3c9a3090dca11bbe6c34342505506bb44f4720c39fe4b18f4d7c23481f46d5` · 510 535 B · 7 927 行 |
| 改后 sha256 | `610b25a809c6b3376f0ee0c6d8b30df9e94a657e9ba84a198d749884ec5dd889` · 520 551 B · 8 039 行 |
| 改前备份 | `teeth/_backup/verify-site.pre-t24.bak`（sha16 `FD3C9A3090DCA11B` = 契约要求的改前值 ✅） |
| 完整 diff | `teeth/verify-site.t24.diff`（unified=3 · 17 hunk · **+118 / −6** · 36 738 B） |
| `node --check` | OK（每处编辑后都跑） |
| `--dir=dist` | **852 项 / 失败 0**（t21 基准 848/0；+4 = 本轮新增断言） |
| `--dir=dist.baseline` | **852 项 / 失败 36**（t21 基准 848/33；+4 断言、+3 失败，见 §5 诚实项） |
| `check-ci-consistency.js --expect-checks=38` | **38 项 / 失败 0** |
| 反证（裸 `font-size:0` scratch） | **EXIT=1** · 5 条失败全部指向 `note-unrendered`（plans/ 12 条） |
| Full Gate（现场解析 `action.yml`） | **49 步 · 执行 45 · 通过 45 · 失败 0 · 跳过 4 · exit=0**；第 47 步 852 项 0 失败、第 48 步 858 项 0 失败；`--only=47,48` 复跑 2/2 通过 exit=0 |
| 不变量自检 | `teeth/_scratch/check-invariants-t24.cjs` **8 / 8 通过** |

## 1. 改了什么（判据 + 上界断言）

**① 新违规码 `note-unrendered`**（`wideProblems()` 第 ④ 条，同一个出口）：

```js
if (!note.rendered && note.textLength > 0 && note.glyphRects === 0 && !note.noscriptSubtree) {
  push('note-unrendered', `… 说明未渲染（盒 WxH）却有 N 字可见正文、零可见字形盒 …`, note.index, 'unrendered');
}
```

* 判据只用三种**非像素**量：render 状态（border-box 有宽有高）· 可见文本长度（探针不采集 `<noscript>` 子树）·
  字形盒个数（`Range.getClientRects()` 里宽高都 > 0 的）。**没有**颜色/像素采样。
* `<noscript>` 排除用的是**两条独立信号**：可见文本长度 0（脚本开启时 noscript 内容不渲染）+
  `el.querySelector('noscript')` 非空。dist 上那条（`plans/coding/#1`）实测
  `textLength 0 / rawTextLength 44 / noscriptSubtree true / glyphRects 0 / rendered false` ⇒ 正确放过。
* `display: contents`（不生成盒子但正文由父级正常排版）**不会**被误伤：它的字形盒 > 0（T20 已复核 1440 档 0 假红）。

**② 度量侧**：`wideMeasure` 新增 `rawTextOf`（不排除 `<noscript>`）⇒ 每条记录带 `rawTextLength` /
`noscriptSubtree`，条级容器 `metrics.layoutNotes` 同步带这两个量（★ 这是本轮唯一一次返工：第一版忘了把字段
放进 `layoutNotes` 的行映射，上界断言把合法的 `<noscript>` 条也算了进去 —— 现在 `@1440 未渲染 1 条 =
<noscript> 1 条 [plans/coding/#1] + note-unrendered 0 条`）。

**③ 上界断言**（让 `unrenderedNotes` 这个 metric 有人引用）：

```
✓ §22c 未渲染说明：上界断言 —— <noscript> 之外不许有未渲染说明，且 unrenderedNotes 与 note-unrendered 判据一致
   — @1440 未渲染 1 条 = <noscript> 1 条 [plans/coding/#1] + note-unrendered 0 条 · 其它未渲染 0 条
     · @1600 未渲染 1 条（<noscript> 1 · note-unrendered 0）
```

它同时钉三件事：`<noscript>` 之外的未渲染说明必须为 0；`unrenderedNotes` = `<noscript>` 条 + 判据命中条；
1600 档同式成立。**删掉判据这条就会红**（metric 与判据计数不一致）。

**④ 页级红因**：`summary.unrenderedText` 并入 `bad` 清单（窄柱/藏字/轴/裁切之外），
`@1440/@1600 逐条页面级说明` 的 detail 改写为「未渲染 N 条：`<noscript>` x + `note-unrendered` y」。

**⑤ 新牙 M13**（`docs/data/`，`rule: '.snote { font-size: 0; }'`，expect `note-unrendered`）+ 承重证明：
「盒高被压成 0 的条**全部**由 `note-unrendered` 咬中，且窄柱/字迹/藏字三条判据在它们身上确实看不见」。

**⑥ 词表/自检/机器可读**：`WIDE_CODE_VOCABULARY` 10→11，判据自检补 ④ 的合成可达用例
（`✓ 违规码自检：11 个码…可达 11/11 · 缺 无 · 多 无`）；`metrics.layoutSweep` 增加
`unrenderedNoscriptNotes / unrenderedTextNotes / unrenderedUnexplainedNotes`（+1600 两个）；
`criteria.noteUnrendered` 写进 `mutations.json`。

## 2. 反证（闭合 T22-F1 的核心读数）

`node teeth/_scratch/r5-bare-fontsize0.cjs`（裸 `.snote { font-size: 0 }` 注入 `plans/` 的 scratch 副本，
**无** `::before` 高度恢复器；plans/ 不是任何变异牙的靶页，避免叠变异干扰）：

```
① 副本：teeth/_scratch/scratch-t24-bare（303 文件）· 注入 plans/：裸 .snote { font-size: 0 }
   dist 未被触碰：plans/index.html ea896e762c3c2ffc（跑完再核）
② 整轮 verify-site --dir=scratch-t24-bare：EXIT=1 · 109.1s · 报告 852 项断言 / 失败 5 项
   ✗ @1440 逐条页面级说明 — … 未渲染 13 条：<noscript> 1 + note-unrendered 12 …
   ✗ @1600 逐条页面级说明 — 同上
   ✗ 未渲染说明：上界断言 — @1440 未渲染 13 条 = <noscript> 1 条 [plans/coding/#1] + note-unrendered 12 条 · 违规条：plans/#0…plans/#11
   ✗ @760 样本集 — 12 条违规码 [plans/#0… plans/#11 note-unrendered]
   ✗ @360 样本集 — 12 条违规码 [同上]
③ dist 未被触碰：plans/index.html ea896e762c3c2ffc
✅ T24 反证通过
```

* 5 条失败**全部**的 detail 里都出现 `note-unrendered`；`note-narrow / note-ink-narrow / note-hidden-text` 0 条
  （正是修复前「三条牙同时静默」的形状，现在由新码兜住）。
* M13 组断言在该次运行里**全部 ✓**（注入页之外没有交叉影响）。
* 对照（契约要求）：**M12（带 `::before` 高度恢复器）仍命中 `note-hidden-text ×3`** —— 见 dist 绿轮的
  `✓ §22c M12 承重证明 … note-hidden-text 命中 [student/#0, student/#1, student/#2]`。

## 3. 未削弱的证明（`check-invariants-t24.cjs` 8/8）

```
✓ §22b 块逐字未改 — 改前/改后 第 5518–6099 行 · sha 8c16c64e6fbe28dd…（两边相同）
✓ diff 的所有 hunk 都落在 §22c 块内 — hunk 19 个 · 越界 0
✓ 0.85 阈值逐字未改 — 改前 0.85 · 改后 0.85
✓ lineCount >= 2 前置逐字未改 — 改前 在 · 改后 在
✓ 运行期断言：t21 的 848 条一条不少（数字归一化后逐名对照） — t21 848 条 → 本轮 852 条 · 缺失 0 · 新增 3 组
✓ 静态 `check(` 计数不减 — 改前 481 处 · 改后 483 处
✓ 本轮新增代码零像素/颜色采样 — 新增 118 行 · pixel/screenshot/canvas/getImageData/.color/devicePixelRatio 命中 0 处
✓ 新判据只用 render 状态 / 文本长度 / 字形盒 / <noscript> 语义 — 判据式在源码里：true
```

* 852 = 848 + 4：上界断言 1 + M13 的「锚点唯一 / 变异后复测」2 + M13 承重证明 1。
* 名字里带动态计数的两条（`违规码自检：10→11`、`全站扫描 630→631 次导航`）在归一化后与新名一致
  ⇒ **没有任何断言被删或改名规避**。
* 导航次数 630 → **631**（多出的一次是 M13 的那一页），§22c 分档耗时 1440 7.6s / 1600 7.3s / 390 7.6s / 样本 3.1s。

## 4. 读数对照（契约 verify 逐条）

| 命令 | t21 基准（fd3c9a30） | 本轮（610b25a8） | 判定 |
| --- | --- | --- | --- |
| `--dir=dist` | 848/0 · 0 违规码 · layoutNotes 401 | **852/0** · 0 违规码 · layoutNotes 401（1600 同）· `unrenderedNotes 1 = <noscript> 1 + note-unrendered 0` | ✅ 0 误报 |
| `--dir=dist.baseline` | 848/33 · 并集 156/48 | **852/36** · 并集 **156/48**（未变）· `unrenderedTextNotes 0` · 非 §22c 失败 0 | ✅ 判据面未扩大（见 §5①） |
| `check-ci-consistency --expect-checks=38` | 38/0 | **38/0** | ✅ |
| 裸 `font-size:0` scratch 反证 | （修复前 EXIT=0 假绿） | **EXIT=1**，红因 = `note-unrendered` ×12 | ✅ 反转 |
| Full Gate 完整 | 49 步 · 45 执行/45 通过 | **49 步 · 执行 45 · 通过 45 · 失败 0 · 跳过 4 · exit=0** | ✅ |
| Full Gate `--only=47,48` | 45/45 合并 | **2/2 通过 · exit=0**（第 47 步「验收 852 项，失败 0 项」· 第 48 步「验收 858 项，失败 0 项」） | ✅ |
| dist 零写入 | 303 文件逐字节相同 | Full Gate 会跑第 34 步 `build-local.js` 重建 → **303 文件跑前/跑后 sha256 逐行相同（0 差异）** | ✅ |

（第 48 步「858 项」= 848+4 项断言 + 6 项 `--compare` 比对；与 t21 记录的 854 同构。）

## 5. 诚实项（必须登记）

1. **`dist.baseline` 的失败面 33 → 36**：多出的 3 条**全部是 M13 的三条断言**（「变异锚点唯一」/「变异后复测」/
   「承重证明」）—— baseline 产物里没有 T1 的冻结串，锚点不存在 ⇒ 按团队既定纪律「锚点不存在按红处理」。
   这与 t14 加 M11/M12 时的行为一致（当时 baseline 27 → 33）。**新判据本身在 baseline 上 0 命中**
   （`unrenderedTextNotes 0`），既有 156/48 覆盖、漏判 0、误报 0 全部未变。
2. 本轮出现过一次**自伤并已修复**：第一版把新字段加进了度量记录却没加进 `layoutNotes` 的行映射，
   导致 dist 绿轮出现 1 条失败（把合法的 `<noscript>` 条算成「未解释的未渲染」）。
   修法是把 `rawTextLength` / `noscriptSubtree` 补进行映射；修复后 dist 852/0。
   （这正是上界断言**该有的行为**：metric 与判据对不上就红。）
3. 未覆盖：只跑了 Edge；视口仍只有 1440/1600/760/360；未跑 `--dir=dist.synth-fixed`（不在本任务 verify 清单）；
   R3-3 的 `display:contents` 残余（无盒单行条）不在本轮范围。
4. `verify-site.js` 里**原有**的截图工具（`page.screenshot(...)`、`style.color`）不是本轮引入，
   不在 `note-unrendered` 的判定链上（新判据只用盒量/render/字形盒）。

## 6. 文件清单（全部在 `teeth/**`）

* 报告：`teeth/T24-ROUND5.md`（本文件）· diff：`teeth/verify-site.t24.diff` · 备份：`teeth/_backup/verify-site.pre-t24.bak`
* 脚手架：`_scratch/r5-bare-fontsize0.cjs`（反证）· `_scratch/check-invariants-t24.cjs`（不变量 8 项）
* 读数：`_scratch/r5-green.{log,json}` · `_scratch/r5-m0.{log,json}` · `_scratch/r5-ci.log` ·
  `_scratch/r5-bare.log` + `r5-bare-report.json` + `r5-bare-console.log` ·
  `_scratch/r5-gate/`（Full Gate 逐步骤日志 + `summary.json`）· `_scratch/r5-gate-full.log` / `r5-gate-4748.log` ·
  `_scratch/r5-dist-before.txt` / `r5-dist-after.txt`（dist 303 文件 sha256 清单，0 差异）
* 副本（可删）：`_scratch/scratch-t24-bare/`（303 文件）
