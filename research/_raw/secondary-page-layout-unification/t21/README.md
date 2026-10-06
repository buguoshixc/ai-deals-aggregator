# T21 · 修复轮 4 之后的证据复跑（verification · attempt `2d032832-e4b1-4bf6-a8c5-f3693a42d041`）

> 执行者：`evidence-runner`（task `t21`）· 一次跑完的 **14 步装置** = `run-t21.cjs`（失败即停）
> 被验对象：`scripts/tools/verify-site.js` sha256 `fd3c9a3090dca11bbe6c34342505506bb44f4720c39fe4b18f4d7c23481f46d5`（= t19 交回值，跑前/跑后/跑后复量三次同值）
> 基线：`origin/master = HEAD = 1f225d22625c15702995785394b60185ebd0520b`
> 结论：**14/14 步按期望 · T21 EXIT=0**（`t21-summary.json` 的 8 项验收全 `true`）
> 写盘范围：`research/_raw/secondary-page-layout-unification/t21/**`；`dist` / `dist.baseline` / 生产源码零写入（§6 有复量）

---

## 0. 一条命令复跑

```
node research/_raw/secondary-page-layout-unification/t21/run-t21.cjs        # 约 14 分钟（含 4 次整轮 + 13 次变异 + 2 步真浏览器）
node research/_raw/secondary-page-layout-unification/t21/run-t21.cjs --dry-run   # 只打计划（→ PLAN.txt）
node research/_raw/secondary-page-layout-unification/t21/mutation-table.cjs      # M1–M12 汇总表（只读 M-summary.json）
node research/_raw/secondary-page-layout-unification/t21/post-checks.cjs         # 跑后不变量复量（只读）
```

装置与步骤：`T0` dist 全树清单 → `T1` `--dir=dist` → `T2` 清单复算 → `T3` `extract-mutations`(M1–M12) →
`T4` `--dir=dist.baseline` → `T5` `extract-m0` → `T6/T7` `gate-vs-truth`(green/baseline) →
`T8` R3-1 注入复现 → `T9` 未注入对照 → `T10` 字节对账 → `T11` CI 口径 38 →
`T12` Full Gate 静态 43 步 → `T13` Full Gate `--only=47,48`（真浏览器）→ `T14` 收尾复量。

每个子进程的原始 stdout/stderr 落在 `logs/T*-*.log`；每步的机器读数落成 JSON（见下表）。

## 1. 八项验收 → 读数 → 证据路径

| # | 验收项 | 本轮读数 | 证据 |
| --- | --- | --- | --- |
| 1 | 标的 sha 跑前=跑后=t19 交回值 | `fd3c9a30…f46d5` 三次同值 · 510,535 B · mtime `11:33:34Z`（早于本轮） | `t21-summary.json`（`shaBefore/shaAfter/targetUnchanged/targetIsT19`）· `run-t21.log` L7 · `logs/T15-post-checks.txt` §1 |
| 2 | `--dir=dist` 绿轮：0 失败 / 0 违规码 / 401 条逐条有读数 / @760 样本集**真在判**（非 `{skipped}`） | EXIT=**0** · 断言 **848** · 失败 **0** · `layoutViolations` **0** · `layoutNotes` **401**（`layoutNotesAt1600` **401**）· 每条含 `index/route/codes` · **@760 样本集 ok=true，0 违规码，detail 写出「物理作用域：@760」**（不是跳过）· 反空洞守卫 ok | `geometry/after-verify.json`（T1 报告）· `logs/T1-dist.log` · `run-t21.log` L11–12 · `logs/T15-post-checks.txt` §6 |
| 3 | `--dir=dist.baseline` 红轮 + 并集集合级 | EXIT=**1**（要求即为非 0）· 断言 848 · 失败 **33**（**0 条非 §22c**）· 并集 **156 条 / 48 页**（`layoutSweep.narrowNotes=156`、`narrowNotePages=48`、`1600 档 156`）· @360 样本集仍绿 · @760 样本集红（196 条码） · 与 `truth-401.json`：漏判 **0** / 误报 **0** / 条级容器在位（`metrics.layoutNotes`） | `mutations-real/M0-baseline.json` · `mutations-real/M0-baseline-summary.json` · `geometry/gate-vs-truth-baseline.json` · `logs/T4-baseline.log` · `logs/T5-extract-m0.log` · `logs/T7-gate-vs-truth-baseline.log` |
| 4 | M1–M12 变异牙（期望 vs 实测 + EXIT） | 逐条 `hit=true`、期望码都在实测里：M11 → **`note-ink-narrow`**（6 条）、M12 → **`note-hidden-text`**（3 条）、M8/M9a/M9b/M10 各自靶页咬到；**反空洞守卫**（自身 `ok=true`）内部两条探针按期望为负（锚点 0 次 / 4 次时 `ok=false`）；M6-control 期望「不得出现 `page-overflow@390`」实测空；不注入对照组 4 页本来 0 码（`allClean=true`）；§22b 的 M1–M5 复用 41 项断言 0 失败；**零磁盘污染** 303/303 相同 | `mutations-real/M-summary.json` · `mutations-real/M1…M12.json`（+`M6-control.json`/`M5-reuse.json`/`no-injection-control.json`）· `logs/T3-mutation-table.txt`（人读表）· `logs/T3-extract-mutations.log` |
| 5 | R3-1 在冻结点上复现 | scratch 副本注入 `@media (max-width:760px){.snote{display:grid;grid-template-columns:minmax(0,70ch) 1fr}}` ⇒ EXIT=**1**、失败 **1** 条（`§22c @760 样本集`）、**6 条 `note-ink-narrow`** = `changes/#0 #1 #2 #4 #8 #12`，最宽字迹 `445.05 / 445.09 / 432 / 444 / 444 / 444.23 px`（盒宽 728 满宽、列宽 728、阈值 618.8）；**同一副本不注入 ⇒ EXIT=0、848 断言 0 失败** | `scratch/grid760-report.json` · `scratch/clean-report.json` · `logs/T8-scratch-grid760.log` · `logs/T9-scratch-clean.log` · `logs/T8-inspect.txt` |
| 6 | 字节对账：布局版本 0 数据变化 | 非 HTML **117/117** sha256 全同（`different=0`）· HTML **186/186** 去 `<style>` 后逐字节相同 · 样式差集 `+9 / −2` 条去重规则 · `index.html`、`build-local.js`、`page-kinds.js`、`archive.js` 四枚冻结 sha 全同 | `diff/nonhtml-sha256.json` · `diff/before-after-compare.json` · `logs/T10a-nonhtml.log` · `logs/T10b-html.log` · `logs/T15-post-checks.txt` §2 |
| 7 | Full Gate：现场解析步数 + 47/48 真跑 | `action.yml` 现场解析 **49 步**（`stepsInAction=49`）· T12 静态：执行 **43** / 通过 43 / 失败 **0** / 跳过 6 / EXIT=0 · T13 合并：执行 **45** / 通过 45 / 失败 **0** / 跳过 4 / EXIT=0 · 第 **47** 步 `passed/exit=0`「验收 **848** 项，失败 0 项」· 第 **48** 步 `passed/exit=0`「验收 **854** 项，失败 0 项」· 两步记录的 `verify-site.js` sha 都是 `fd3c9a30…`（读数只对这一版有效） | `gate/steps/summary.json` · `gate/steps/47-*.txt` · `gate/steps/48-*.txt` · `logs/T12-full-gate-static.log` · `logs/T13-full-gate-browser.log` |
| 8 | 全部读数落盘 + 索引 | 本文件即索引；`t21-summary.json` 是机器可读总表（14 步逐条 `command/exitCode/log/extra/status` + 8 项验收布尔） | 本 `README.md` · `t21-summary.json` · `logs/` · `run-t21.log`（+`run-t21-console.log`） |

## 2. M1–M12 一览（详表见 `logs/T3-mutation-table.txt`）

| id | 靶页@档位 | 期望码 | 实测（去重） | hit |
| --- | --- | --- | --- | --- |
| M1 | `student/`@1440 | `note-narrow` | `note-narrow, note-ink-narrow, note-axis` | ✅ |
| M2 | `status/`@1440 | `note-narrow` | `note-narrow, note-ink-narrow, note-axis` | ✅ |
| M3 | `changes/`@1440 | `note-narrow` | `note-narrow, note-ink-narrow, note-axis`（13 条全中） | ✅ |
| M4 | `feeds/`@1440 | `note-narrow` | `note-narrow, note-ink-narrow, note-axis`（8 条全中） | ✅ |
| M6 | `student/`@390 | `page-overflow@390` | `note-clipped, page-overflow@390` | ✅ |
| M7 | `status/`@1440 | `unexpected-detail-main` | `unexpected-detail-main` | ✅ |
| M8 | `student/`@1440 | `note-narrow`（收窄类型） | `note-narrow, note-ink-narrow` | ✅ |
| M9a / M9b | `docs/data/` / `changes/`@1440 | `note-narrow`（非首条） | 各 8 / 5 条键全中 | ✅ |
| M10 | `student/`@1600 | `note-narrow`（`@media (min-width:1500px)`） | `note-narrow, note-ink-narrow, note-axis` | ✅ |
| **M11** | `changes/`@1440 | **`note-ink-narrow`** | `note-ink-narrow`×6 | ✅ |
| **M12** | `student/`@1440 | **`note-hidden-text`** | `note-hidden-text`×3 | ✅ |
| M6-control | `student/`@390 | 不得出现 `page-overflow@390` | （空） | ✅（控制面） |

反空洞守卫（同轮 T1 读数）：不存在的锚点 `ok=false`（出现 0 次）· 非唯一锚点 `ok=false`（出现 4 次，须恰好 1 次）。

## 3. 两处「按期望为 false」的读数（不是失败）

* `--dir=dist` 的 `@760 样本集 ok=true`，而 `--dir=dist.baseline` 的 `@760 样本集 ok=false`（196 条码）——**这就是修复要达成的差别**；两条并集读数（156/48）与 `truth-401.json` 完全一致。
* **反空洞守卫**（check `反空洞守卫自检`，本身 `ok=true`）：它内部两个探针的读数是 `ok=false`——「不存在的锚点」出现 0 次、「非唯一锚点」出现 4 次；这正是守卫要的**负读数**（被判分的锚点必须恰好出现 1 次），因此它不增加 `report.failed`（dist 仍是 0 失败）。原文见 `logs/T1-dist.log` / `t21-summary.json` 的 `hollowGuardDetail`。

## 4. 本轮发现的自我纠正（装置一侧，不是标的一侧）

1. **第一次尝试（attempt 1 的 harness）在第 4 步误判**：旧 `ok` 规则是「`extra` 里出现任何 `false` 即失败」，而 `dist.baseline` 的 `sample760Ok:false` 恰是**期望读数** ⇒ 误报一次「T4 failed」。改为**逐步显式 `expectExtra` 断言**后重跑全轮（读数与首轮逐值相同，可作复现性旁证）。首轮产物留档在 `preserve/run3-*`。
2. **T8 的码位置找错**：`@760 样本集` 的违规码只在**那条断言自己的 detail** 里（`metrics.layoutNotes` 是 @1440 容器，那里 0 码）。第二轮修正解析后拿到 `changes/#0 #1 #2 #4 #8 #12` 六条键，与 t19 主张逐值相同（`445.05/445.09/432/444/444/444.23`）。
3. **`run-t21.log` 的 T14 段没落盘**：harness 在收尾写 summary 前忘了 `flush()`（纯日志细节，读数在 `t21-summary.json` 里完整）。为不篡改「产出证据的那一版装置」，本轮**未**回改 harness，改用 §0 的 `post-checks.cjs` 独立复量补上（`logs/T15-post-checks.txt`）。

## 5. 边界（如实登记未覆盖项）

* 浏览器只有 Edge（`msedge.exe`），未在 Chromium/Firefox/Safari 上复跑；断言数 848 是本机环境读数。
* 视口只覆盖门禁自身的档位：1440 / 1600 / 760 / 360（`inkScope*` 逐档读数见 §6）。
* 未跑 `dist.synth-fixed` 等非清单目录；未重跑 §22b 的独立装置（以 M5 复用读数代替：41 项断言 0 失败）。
* R3-1 用的是「注入一份 scratch 副本」，不是线上真实产物（真实产物 `dist` 上该断言为绿）。
* `preserve/run3-logs/` 是**第一轮（解析规则错误的那一轮）**的日志留档，只作对照，正文读数一律取本轮（第二轮）。

## 6. 零写入与现场不变量（`logs/T15-post-checks.txt` 全文）

* `dist`：T0 清单 vs 跑后清单**逐字节相同**（303 行）· mtime 晚于本轮开始的文件 **0** 个。
* `dist.baseline`：303 文件 · 最新 mtime `06:27:50Z`（远早于本轮）· 本轮之后被写过的文件 **0** 个。
* `git status --porcelain -- dist dist.baseline scripts/tools/verify-site.js`：只有 `M scripts/tools/verify-site.js`（即被验的修复本身，未提交；`dist*` 被 ignore）。
* `HEAD = origin/master = 1f225d2`；`git diff --stat` 该文件 = `1 file changed, 1446 insertions(+)`。
* §22c 在 `dist` 上的页族分类：`wide 55 / detail 131 / other 0`（`notesChecked 105` · `notesJudged 401` · `unrendered 1` · 其余 0）。
  > 若某处文档写 `54 wide / 1 other`，本轮实测是 **55 / 0**；本报告只报实测值。
* 桌面档作用域 `{1440: 列 1120–1380 · ch70 452.81 · 判}`、`{1600: 1120–1380 · 452.81 · 判}`；样本档 `{760: 676–728 · 452.81 · 判}`、`{360: 276–328 · 452.81 · 不判}`。

## 7. 文件索引

| 路径 | 是什么 |
| --- | --- |
| `run-t21.cjs` | 14 步装置（唯一入口，失败即停；`--dry-run` 打计划） |
| `t21-summary.json` | 机器可读总表：标的 sha、8 项验收布尔、14 步逐条 command/exit/log/读数/**verdictNote** |
| `run-t21.log` · `run-t21-console.log` | 装置自己的进度日志（含每步读数 JSON 单行）与 stdout |
| `PLAN.txt` | `--dry-run` 的计划快照 |
| `logs/T*.log` | 每一步子进程的**原始** stdout+stderr（UTF-8） |
| `logs/T3-mutation-table.txt` | M1–M12 「期望 vs 实测」人读表 + 对照组 + 零污染读数 |
| `logs/T8-inspect.txt` | R3-1 报告的解剖（@760 detail 原文 + changes/ 13 条 @1440 读数 + 作用域） |
| `logs/T15-post-checks.txt` | 跑后独立复量（sha / 冻结源码 / dist 零写入 / git / §22c 分类与作用域） |
| `logs/dist-post.sha256.txt` | 跑后 dist 全树清单（与 `dist-before.sha256.txt` 逐字节相同） |
| `dist-before.sha256.txt` · `dist-after.sha256.txt` · `dist-final.sha256.txt` | 跑前 / T1 后 / 收尾的 dist 全树清单（三份相同） |
| `geometry/after-verify.json` | T1 的 `--dir=dist` 完整报告（848 断言 + 401 条逐条读数） |
| `geometry/mutations.json` · `geometry/gate-vs-truth-green.json` · `geometry/gate-vs-truth-baseline.json` | 变异清单 · 集合级 green/baseline 判定 |
| `mutations-real/M0-baseline.json` · `M0-baseline-summary.json` | T4 的 baseline 报告 + 逐页/逐条码分布 |
| `mutations-real/M-summary.json` · `M*.json` · `M5-reuse.json` · `no-injection-control.json` | M1–M12 逐条原始读数、§22b 复用、不注入对照 |
| `scratch/grid760-report.json` · `scratch/clean-report.json` | R3-1 注入副本报告 / 同一副本不注入报告（注入只落在 `scratch/**`） |
| `scratch/grid760-changes/` · `scratch/clean/` | 两份 scratch 产物副本（各 303 文件；不参与任何对比的字节源） |
| `diff/nonhtml-sha256.json` · `diff/before-after-compare.json` | 117 非 HTML 哈希对账 / 186 HTML 去 `<style>` 对账 |
| `gate/steps/summary.json` · `gate/steps/*.txt` | Full Gate 现场解析的 49 步读数与逐步日志（47/48 为真浏览器） |
| `preserve/run3-*` | **第一轮**（harness `expectExtra` 误判那次）的 summary/日志/报告留档，仅供对照 |
| `inspect-t8.cjs` · `mutation-table.cjs` · `post-checks.cjs` | 只读的读数归纳/复量脚本（不跑浏览器、不写 dist） |
