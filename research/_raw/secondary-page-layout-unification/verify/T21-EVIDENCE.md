# T21 · 证据索引（修复轮 4 之后的复跑）· attempt `2d032832-e4b1-4bf6-a8c5-f3693a42d041`

> 执行者 `evidence-runner`（task `t21`，verification，deps=t20）· 一次跑完的 14 步装置 = `research/_raw/secondary-page-layout-unification/t21/run-t21.cjs`
> 标的 `scripts/tools/verify-site.js` = `fd3c9a3090dca11bbe6c34342505506bb44f4720c39fe4b18f4d7c23481f46d5`（跑前 / 跑后 / 跑后独立复量 **三次同值**，510,535 B，= t19 交回值）
> 基线 `HEAD = origin/master = 1f225d2` · **14/14 步按期望 · T21 EXIT=0 · 8/8 验收 `true`**
> 详细人读索引（同一批产物、逐路径）在 `t21/README.md`；本文件是契约 `deliverables` 指定的索引入口。

## 1. 八项验收 → 读数 → 确切路径

| # | 验收（契约顺序） | 本轮读数 | 确切路径 |
| --- | --- | --- | --- |
| 1 | 标的 sha 跑前=跑后=t19 交回值 | `fd3c9a30…f46d5` ×3 · 510,535 B · mtime 早于本轮 | `t21/t21-summary.json`（`shaBefore/shaAfter/targetIsT19=true`）· `t21/run-t21.log` L7 · `t21/logs/T15-post-checks.txt` §1 |
| 2 | `--dir=dist`：exit 0 / 0 失败 / 0 违规码 / 401 条逐条有读数；@760 样本集确实在判逐行字迹（非 `{skipped}`） | EXIT=0 · 848 断言 · 失败 0 · `layoutViolations=0` · `layoutNotes=401`、`layoutNotesAt1600=401` · **@760 样本集 `ok=true`，detail 写「物理作用域：@760」** | `verify/M-green-after-r4.json`（= `t21/geometry/after-verify.json` 逐字节副本，sha256 `9d1d7f1d…`）· `t21/logs/T1-dist.log` |
| 3 | `--dir=dist.baseline`：exit 1；`note-narrow ∪ note-ink-narrow = 156 条/48 页`；与 truth-401 逐条相同、漏判 0、误报 0；§22c 之外 0 失败 | EXIT=**1** · 848/33 失败（非 §22c = **0**）· 并集 **156 / 48**（1600 档同为 156）· `missed=0` / `falsePositive=0` / 条级容器 `metrics.layoutNotes` 在位 · @360 仍绿 | `verify/M0-after-r4.json`（= `t21/mutations-real/M0-baseline.json` 副本，sha256 `9fa340c2…`）· `t21/mutations-real/M0-baseline-summary.json` · `t21/geometry/gate-vs-truth-baseline.json` · `t21/logs/T4-baseline.log` |
| 4 | M1–M12 复跑：逐条期望码/实测码与 EXIT；M11 咬 `note-ink-narrow`、M12 咬 `note-hidden-text`；反空洞守卫 0 次/≥2 次仍 `ok:false` | 13 行全 `hit=true`（含 M6-control）· M11 = `note-ink-narrow`×6 · M12 = `note-hidden-text`×3 · 不注入对照组 `allClean=true` · 零磁盘污染 303/303 · 守卫探针 0 次/4 次为负 | `verify/T21-mutations-summary.json`（= `t21/mutations-real/M-summary.json` 副本，sha256 `b13b146a…`）· `t21/mutations-real/M1…M12.json` · `t21/logs/T3-mutation-table.txt` |
| 5 | R3-1 在冻结点复现：`@media (max-width:760px)` 版 grid 注入 scratch 副本 ⇒ EXIT≠0 且命中 `note-ink-narrow` | EXIT=**1** · 1 条失败（`§22c @760 样本集`）· **6 条 `note-ink-narrow`** = `changes/#0 #1 #2 #4 #8 #12`（最宽 445.05/445.09/432/444/444/444.23，盒宽 728 满宽、阈值 618.8）· 同副本不注入 ⇒ EXIT=0、848/0 | `t21/scratch/grid760-report.json` · `t21/scratch/clean-report.json` · `t21/logs/T8-scratch-grid760.log` · `t21/logs/T9-scratch-clean.log` · `t21/logs/T8-inspect.txt` |
| 6 | 字节对账：117/117 非 HTML sha256 相同；186/186 HTML 去 `<style>` 逐字节相同；`index.html` 与 `scripts/tools/build-local.js` sha == t1 冻结值 | 非 HTML **117/117**（different=0）· HTML **186/186** 相同（样式差集 +9/−2 条规则）· 冻结 sha 4/4 相同（`8442f14d…` / `264912c2…` / `8fae98d1…` / `565710a7…`） | `t21/diff/nonhtml-sha256.json` · `t21/diff/before-after-compare.json` · `t21/logs/T10a-nonhtml.log` · `t21/logs/T10b-html.log` · `t21/logs/T15-post-checks.txt` §2 |
| 7 | Full Gate 本地跑器：现场解析 `action.yml` 取步数（不硬编码），给 executed/passed/failed/skipped 与总 exit；第 47/48 步单独复跑并各给断言数与失败数 | `stepsInAction=49`（现场解析）· 静态段 executed 43 / passed 43 / failed 0 / skipped 6 / exit 0 · `--only=47,48` 合并 executed 45 / passed 45 / failed 0 / skipped 4 / exit 0 · 第 **47** 步「✅ 验收 **848** 项，失败 0 项」· 第 **48** 步「✅ 验收 **854** 项，失败 0 项」（两步记录的 verify-site sha 均 `fd3c9a30…`） | `t21/gate/steps/summary.json` · `t21/gate/steps/47-real-browser-acceptance-verify-site-js.txt` · `t21/gate/steps/48-regression-verify-baseline-compare.txt` · `t21/logs/T12-full-gate-static.log` · `t21/logs/T13-full-gate-browser.log` |
| 8 | 全部读数落盘 `research/_raw/secondary-page-layout-unification/**`，索引给出每条读数的确切路径 | 本文件 + `t21/README.md` + `t21/t21-summary.json`（14 步 command/exitCode/log/读数） | 本文件 · `t21/README.md` · `t21/t21-summary.json` |

## 2. 契约 `verify` 命令 → 实跑读数

| 契约 verify 命令 | 实跑 | EXIT | 证据 |
| --- | --- | --- | --- |
| `node scripts/tools/verify-site.js --dir=dist` | 848 断言 / 0 失败 / 0 违规码 / 401+401 条读数 / @760 在判 | 0 | `t21/logs/T1-dist.log` · `verify/M-green-after-r4.json` |
| `node scripts/tools/verify-site.js --dir=dist.baseline` | 848 / **33 失败**（0 条非 §22c）/ 并集 156·48 / @360 绿 | **1**（合同要求的红轮，非命令失败） | `t21/logs/T4-baseline.log` · `verify/M0-after-r4.json` |
| `node scripts/tools/check-ci-consistency.js --expect-checks=38` | 「✅ CI 口径检查 38 项，失败 0 项」 | 0 | `t21/logs/T11-ci-consistency.log` |
| Full Gate 本地跑器（现场解析 `.github/actions/gate/action.yml` 取步数） | 两段实跑：`--skip-browser` 43/43 · `--only=47,48` 合并 45/45 · 49 步现场解析 | 0 | `t21/gate/steps/summary.json` · `t21/logs/T12-full-gate-static.log` · `t21/logs/T13-full-gate-browser.log` |

## 3. 三份「契约命名」的副本（逐字节，附源 sha256）

| 本目录文件 | 源文件 | 关系 |
| --- | --- | --- |
| `verify/M-green-after-r4.json`（`9d1d7f1d…`） | `t21/geometry/after-verify.json`（同 sha） | 逐字节副本（`Copy-Item`），未改动一字节 |
| `verify/M0-after-r4.json`（`9fa340c2…`） | `t21/mutations-real/M0-baseline.json`（同 sha） | 逐字节副本 |
| `verify/T21-mutations-summary.json`（`b13b146a…`） | `t21/mutations-real/M-summary.json`（同 sha） | 逐字节副本 |

## 4. 零写入与现场不变量（`t21/logs/T15-post-checks.txt`）

* `dist`：T0 清单 = 跑后清单 = 收尾清单（逐字节相同，303 行）；mtime 晚于本轮开始的文件 **0** 个。
* `dist.baseline`：303 文件，最新 mtime `06:27:50Z`（远早于本轮），本轮后写入 **0**。
* `git status --porcelain -- dist dist.baseline scripts/tools/verify-site.js` ⇒ 只有 `M scripts/tools/verify-site.js`；`HEAD = origin/master = 1f225d2`。
* §22c 在 `dist` 上的页族分类：**wide 55 / detail 131 / other 0**（`notesJudged=401` · `unrendered=1` · 其余 0）；作用域 1440/1600 判、760 判（列 676–728 > 70ch 452.81）、360 不判（276–328）。
  > 若有文档写 `54 wide / 1 other`：以本轮实测 **55 / 0** 为准（如实登记偏差）。

## 5. 边界与自我纠正

* 仅 Edge；视口仅 1440/1600/760/360；未跑 `dist.synth-fixed`；R3-1 用 scratch 副本而非线上产物；§22b 以 M5 复用读数代替重跑（41 断言 0 失败）。
* 首轮 harness 把 baseline 的 `sample760Ok:false`（期望读数）误判为失败 ⇒ 改逐步显式断言后**全轮重跑**，两轮读数逐值相同（首轮留档 `t21/preserve/run3-*`）；T8 首轮在 `layoutNotes`（@1440 容器）里找 @760 的码 ⇒ 修正为读该断言自身 detail；`run-t21.log` 的 T14 段未 flush（读数在 `t21-summary.json` 完整）⇒ 另以 `t21/post-checks.cjs` 独立复量补证。
