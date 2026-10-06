# t3 · 证据索引（真实构建 / 字节对账 / Before-After 几何 / M0–M7 与 M-disk / Full Gate）

> 归属：`evidence-runner` 执行的 **t3**（verification）。基线 `origin/master = 1f225d2`。
> 本目录（`research/_raw/secondary-page-layout-unification/t3/**`）是**索引与总览**；
> 原始读数分别落在同级的 `build/`、`diff/`、`geometry/`、`mutations-real/`、`gate/` 下。
> （`t1/`、`teeth/` 属 T1/T2；`review/` 属 t5 复审 —— 互不覆盖。）

## 0. 修订身份（所有读数只对这几个 sha256 有效）

| 文件 | sha256 |
| --- | --- |
| `index.html` | `8442f14dd397276e67ea71a64aef9f86b59d1f603aa04f15ecfc402056d663b9` |
| `scripts/tools/build-local.js`（T1 工作副本） | `264912c27174f837453bcafc1ade0422d46dc606e3036ba94e4b8525b149b348` |
| `scripts/tools/verify-site.js`（修复后，r2） | `4f4cb2e3b3f8e47d921137a5801d8692811a77d868a13c0a3516db8405d72ffb` |
| `scripts/tools/verify-site.js`（§22c 修复前，t2 版；复原件在 `recovered/`） | `4cae2fb2ab2599997668feca8c26c3161fe882a518e61d01552b7adc95f95756` |
| `scripts/lib/page-kinds.js` | `8fae98d1d8897a9d024b0cb2d8a5c016efc4c1807c41e63cbc02ab45e7c6b2ed` |
| `scripts/lib/archive.js` | `565710a7e6e197d9f369acf3b70c3feefd77413e188856523f16ebdc1429916e` |
| `.github/actions/gate/action.yml` | `d1c4b0df6900edf84e4981d29f997bbfe9914efb5252593a5dc25d270d5f39bc` |
| `dist/`（全树，303 个文件的清单） | `build/dist-after-build1.sha256.txt` |

（本表可与 `t3/00-prestate.txt` 的原始 `Get-FileHash` 输出逐行核对。）

HEAD = `1f225d22625c15702995785394b60185ebd0520b`（= 基线）。**T1 的源码改动尚未提交**（工作区 7 个 `M`），
因此本目录里凡涉及「工作区 vs 基线」的对账都明确写了两侧。

## 1. 一句话结论

- **构建**：真实构建成功，产物 303 文件 = HTML **186** + 非 HTML **117**（与 `dist.baseline` 同量）。
- **内容不变**：三条独立证据全绿 —— 数据路径 git 零改动 / 117 个非 HTML 文件逐个 sha256 相等（0 不同）/ 186 个 HTML 页剥掉**全部** `<style>` 块后逐字节相同（正文字节差 **0**）。
- **几何**：独立探针（不依赖 `verify-site.js`）在改动前产物上数出 **48 页** `note-narrow`+`note-axis`，改动后 **0 页**；把「**每一条**页面级说明」都量出来的加强版读数：改动前 **156 条**说明宽 < 0.85×列宽（其中 **108 条**不是第一条），改动后 **0 条**。
- **变异**：M-disk 落盘级循环「红 → 恢复 → 绿」通过，恢复是**字节级**的（sha256 / `git status` / 产物清单三证）。
- **Full Gate**：现场解析 `action.yml`（**49 步**）后串行执行 —— **执行 45 · 通过 45 · 失败 0 · 跳过 4（CI 专用）· exit 0**；`Assemble site` 重建后的 `dist` 与第 1 步构建的 `dist` **清单逐字节相同**。
  · 第 47/48 步先在**修复前**的 `verify-site.js`（`4cae2fb2…`）上跑过（全绿），**修复定稿后又用 `--only=47,48` 重跑**（`4f4cb2e3…`，842 项 / 848 项都 0 失败）；`summary.json` 逐步带 `verifySiteSha256`，两轮读数不混版。
- **修复后验收（§7，9/9 步按期望）**：`--dir=dist` **842 项 0 失败**（§22c 九个计数全零）；`--dir=dist.baseline` **exit 1 / 842 项 27 失败（非 §22c 的 0 项）/ note-narrow 48 页 156 条**；两份集合级核对 `gate-vs-truth` **都 pass**（156/48 逐条命中、245 条零误报、条级容器 401 行）；M1–M10 + 两个正对照**全部咬到**且**零磁盘污染**；对照修复前判据（同一产物）从「48 条、无条级容器」变成「156 条、401 行逐条可核对」。

## 2. 第 1 组 · 真实构建

| 证据 | 文件 | 读数 |
| --- | --- | --- |
| 构建原始日志（stdout+stderr） | `build/01-build-local.txt` | `node scripts/tools/build-local.js` **exit 0** · 末尾 `✅ 产物自检通过` / `✅ 构建完成 → dist/` |
| 产物计数 | `build/02-dist-counts.txt` | dist：`html=186 total=303 nonHtml=117 bytes=20012665`；dist.baseline：`html=186 total=303 nonHtml=117` |
| 第 1 步产物全树 sha256 清单 | `build/dist-after-build1.sha256.txt` | 303 行 `<sha256>  <相对路径>` |
| 构建前的 dist 现状 | `build/00-prebuild-dist.txt` | 覆盖前文件数/字节数 |
| 清单生成器 | `build/dist-manifest.cjs` | 复现：`node …/build/dist-manifest.cjs --dir=dist --out=<file>` |

## 3. 第 2 组 · 内容不变证明（三条互相独立）

### (a) 数据 / 路由清单在 git 侧零改动 —— `diff/01-git-content-proof.txt`
- `git diff --name-only 1f225d2..HEAD -- deals.json plans.json api-plans.json models.json model-registry-links.json scripts/data` ⇒ **（空）**
- `git status --porcelain -- <同样路径>` ⇒ **（空）**；`git diff --name-only -- <同样路径>` ⇒ **（空）**；`git diff --cached --name-only -- <同样路径>` ⇒ **（空）**
- `git status --porcelain`（全仓）只有 7 个 `M`（`index.html` + 6 个 `scripts/**`）与 1 个未跟踪的证据目录 —— **没有任何数据文件**
- `git diff --name-only 1f225d2`（工作区 vs 基线）⇒ 恰好那 7 个文件
- 附带：源数据与 `dist` 内嵌副本的 sha256 逐个对账（`plans.json` / `api-plans.json` / `models.json` / `model-registry-links.json` 四份**完全相同**；`deals.json` 不同是构建期注入 `zh/collections/needs/sourceFacts/history/relatedPlans` 的设计行为，构建日志里逐字段对账过）
- 源码 diff 原文：`diff/02-source-diff.patch`（`index.html` + `scripts/**`）

### (b) 117 个非 HTML 文件逐个 sha256 —— `diff/nonhtml-sha256.json` / `.txt`
- **逐个 sha256 相等：117/117 · 不同 0 个**（算法 sha256，两侧文件集合一致）
- `.txt` 是可直接核对的清单（每行 `== <sha256>  <path>`）

### (c) 186 个 HTML 页剥掉全部 `<style>` 后逐字节相同 —— `diff/before-after-compare.json`
- 程序：`diff/before-after-compare.cjs`（`--before=dist.baseline --after=dist`，fail-closed：两侧目录必须看起来就是构建产物）
- 文件数 `303 → 303`（HTML 186 / 非 HTML 117）
- **正文逐字节相同：186/186 · 正文字节差合计 0**
- 样式块行集合差（去重后）：**+9 / −2**，且**没有一条预期之外的行**
  - `+9` = `index.html` 共享 `<style>` 新增的 8 行解释注释 + 1 条冻结规则
    `.snote { color: var(--mut); font-size: var(--fs-sm); line-height: 1.7; margin: 0 0 var(--s3); max-width: none; overflow-wrap: anywhere; }`
  - `−2` = 8 个页面壳里删掉的 8 条副本**只有两种不同字符串**：4 份 `max-width: 70ch` + 4 份 `max-width: none`
    （这正是"同一条规则 8 份副本、两种取值"的机器可读读数）

## 4. 第 3+4 组 · Before/After 几何（独立探针）

> 两份探针都是**独立实现**：自己起静态服务、自己量、自己判，**不 require `scripts/tools/verify-site.js`**。
> 样本 id/slug 现场推导（产物目录 + `deals.json` + `models.json` + `sitemap.xml`），一个都不写死。

| 证据 | 文件 | 读数 |
| --- | --- | --- |
| 全量 Before/After 表（1209 行） | `geometry/before-after.md` | 见下 |
| before 读数（JSON） | `geometry/before.json` | 186 页扫描 · **48 页违规** · `{note-narrow:48, note-axis:48}` · 样本违规 52 条 · 导航 504 次 |
| after 读数（JSON） | `geometry/after.json` | 186 页扫描 · **0 页违规** · 样本违规 0 条 · 导航 504 次 · JS 错误 0 |
| 探针程序 | `geometry/wide-probe.cjs` | `--dir --label --out`；`--only/--no-sweep` 用于快速判红 |
| 表生成器 | `geometry/make-table.cjs` | 读两份 JSON + 两份 all-notes JSON ⇒ `before-after.md` |
| **每一条** `.snote` 探针（captain 指令 A/B） | `geometry/all-notes-before.json` / `geometry/all-notes-after.json` / `geometry/all-notes-probe.cjs` | 见 §4.2 |

### 4.1 代表性几何（1440×900；`ratio` = 说明宽 ÷ min(主数据区宽, 页面列宽)）

| 页面 | before 说明宽 | after 说明宽 | 主数据区宽 | before ratio | after ratio | 违规码 before → after |
| --- | --- | --- | --- | --- | --- | --- |
| `/student/` | 452.81px | 1380px | 1380px | 0.328 | 1.000 | note-narrow,note-axis → 无 |
| `/developer/` | 452.81px | 1380px | 1380px | 0.328 | 1.000 | note-narrow,note-axis → 无 |
| `/free-api/` | 452.81px | 1380px | 1380px | 0.328 | 1.000 | note-narrow,note-axis → 无 |
| `/need/edu-identity/` | 452.81px | 1380px | 1380px | 0.328 | 1.000 | note-narrow,note-axis → 无 |
| `/status/` | 452.81px | 1380px | 1380px | 0.328 | 1.000 | note-narrow,note-axis → 无 |
| `/changes/` | 452.81px | 1380px | 1380px | 0.328 | 1.000 | note-narrow,note-axis → 无 |
| `/feeds/` | 452.81px | 1380px | 1380px | 0.328 | 1.000 | note-narrow,note-axis → 无 |
| `/category/agent/`（真实分类） | 452.81px | 1380px | 1380px | 0.328 | 1.000 | note-narrow,note-axis → 无 |
| `/vendor/ai360/`（真实厂商） | 452.81px | 1380px | 1380px | 0.328 | 1.000 | note-narrow,note-axis → 无 |
| `/plans/coding/` | 1380px（本来就是 `none` 那一组） | 1380px | 1380px | 1.000 | 1.000 | 无 → 无 |
| `/deal/017bdbc04e70/`（真实 id） | （无页面级说明） | （无页面级说明） | 1120px（`.detail-main`） | — | — | 无 → 无 |
| `/models/360zhinao-pro/`（真实 slug） | 1120px | 1120px | 1120px（`.detail-main`） | 1.000 | 1.000 | 无 → 无 |
| `/`（首页） | （无页面级说明） | （无页面级说明） | 1380px | — | — | 无 → 无 |

- 三档桌面的完整读数（1440×900 / 1280×800 / 1024×768）与三档窄屏（760 / 390 / 360 的 `documentElement.scrollWidth` 与 `clientWidth`）都在 `before-after.md` 的第 2、3 节，逐页逐档。
- 全站 `page-overflow`：**before 0 / after 0**（1440 与 390 两档都是 0）。
- before 的 48 个违规页逐页清单（说明宽 / 主数据区 / 选择器 / 390 scrollWidth）在 `before-after.md` §1.1。

### 4.2 「每一条 `.snote`」的读数（captain 指令 A/B —— §22c 旧口径只看第一条）

- 页面里的说明条数（1440 档，186 页）：**有说明 105 页 / 无说明 81 页 · 说明总条数 401**。
- **`<main>` 内 `.snote` ≥ 2 条的页面：105 页**；**最多的一页 13 条**（`/changes/`；其后 `/plans/` 12、`/docs/data/` 9、`/feeds/` 8）。
  直方图 `{"0":81,"2":7,"3":46,"4":33,"5":15,"8":1,"9":1,"12":1,"13":1}`。
- **「比主数据区窄」（< 0.85×列宽）的说明：before 156 条 → after 0 条**；
  其中**第 2 条及以后**的（§22c 旧口径**看不见**的那一批）：**before 108 条 → after 0 条**。
  ⚠️ **页数口径必须说清楚**：这 156 条窄说明**落在同样的 48 页上**（其中 3 页各 2 条、43 页各 3 条、`/feeds/` 8 条、`/changes/` 13 条）；
  **不是 105 页** —— 105 是「有说明的页面数」，与缺陷面无关（另外 57 个有说明的页面从来没被压窄）。
  ⇒ 缺陷的真实面积是「**48 页上的 156 条说明**」：页数没变，被低估的是**每页里的条数**（旧口径每页只看第一条）。修复把**全部** 156 条都收干净了。
- 逐条 before → after 表：`before-after.md` §5.2（多说明页面逐条）/ §5.3（全部 401 条）。
  逐条汇总：401 条里**宽度变化 156 条**（全部是「窄 → 同轴」）、未变 245 条。

### 4.3 真值对照物 `geometry/truth-401.json`（captain 指定的修复验收基准）

| 证据 | 文件 | 读数 |
| --- | --- | --- |
| 401 条逐条真值（机器可读） | `geometry/truth-401.json`（sha256 `46c28fa120a39ababf25826b86a08e57cf93e242baee8df264219e1d182e346e`） | 见下 |
| 生成脚本 | `geometry/make-truth-401.cjs` | 读两份 all-notes JSON + wide-probe 的 before.json |
| 生成日志 | `geometry/06-truth-401.log` | 全部不变量 `✓` |

- **总条数 401 · 有说明的页面 105 · 最多 13 条/页**；**改动前窄说明 156 条 → 改动后 0 条**。
- 三类（互斥、可逐条查）：
  - `caughtByOldCriteria` = **48 条**（改动前是第一条说明且窄 —— §22c 旧口径唯一逮到的那一批）；
  - `onlyNewTruth` = **108 条**（改动前窄，但**不是第一条** —— 旧口径**看不见**的那一批）；
  - `alreadyFine` = **245 条**（改动前本来就不窄的对照组，其中 `archive/` **5 条**：1354–1380px / 0.980–1.000 —— 用来证明新判据不会把正常页面误报成窄柱）。
- 每条记录：`route / index / position(first|middle|last) / before{width,left,right,ratio,maxWidth,narrow,clipped} / after{同} / classification / text`。
- 机器核对的不变量（全部 `true`）：
  `48 + 108 == 156` · `after 窄 == 0` · `48+108+245 == 401` ·
  **wide-probe 另一次独立扫描报的 48 页 `note-narrow` 与这里的 `caughtByOldCriteria` 页集合逐条一致**（两个独立实现互相印证） ·
  `archive/` 的 5 条仍在 `alreadyFine` 里。
- 用途：修复后的新 §22c 在 `dist.baseline` 上命中集合必须 = `caughtByOldCriteria ∪ onlyNewTruth`
  （**156 条 / 48 页** —— 页集合大小与 `onlyNewTruth` 的页集合完全相同，因为 156 条窄说明全部落在旧口径那 48 页里），
  在 `dist` 上必须一条不报，且 `alreadyFine` 的 245 条一条都不许被误报。
  集合级核对工具：`geometry/gate-vs-truth.cjs`（吃修复后的 `verify-site.js --json=` 报告，输出漏判/误报逐条清单）。
  `truth-401.json` 的 `totals` 里另有 `pagesCarryingNarrowNotes: 48` 与 `pagesWithNotesButNoNarrowNotes: 57` 两个口径分开登记。
- ⚠️ **本 README 的一处早期笔误已更正**：本文件与给 captain 的中期汇报里曾写作「105 页 / 156 条」，正确读数是
  「**48 页 / 156 条**」（105 是"有说明的页面数"）。`truth-401.json` 的 `usageForNewGate` 段已写明这一点，并把它做成机器可读的不变量
  （`含窄说明的页面数 = 旧口径页集合大小`）。

## 5. 第 5 组 · M-disk 落盘级变异循环（prompt §24 字面要求）

| 证据 | 文件 | 读数 |
| --- | --- | --- |
| 全过程日志 | `mutations-real/M-disk.log` | 9 个阶段的逐步日志 |
| 机器可读汇总 | `mutations-real/M-disk.json` | `verdict: pass` |
| 循环驱动（可重跑） | `mutations-real/run-mdisk.cjs` | `node …/run-mdisk.cjs` |
| 可逆编辑助手 | `mutations-real/mdisk-edit.cjs` + `M-disk.anchor.txt` | 唯一锚点插入 / 逆操作 |
| 红轮读数 | `mutations-real/M-disk.probe-red.json` + `.step3-probe-red.log` | **违规页 1**（`feeds/` `[note-narrow, note-axis]` 说明 452.81px vs 主数据区 1380px）· 产物里 70ch 规则 1 处 |
| 绿轮读数 | `mutations-real/M-disk.probe-green.json` + `.step10-probe-green.log` | **违规页 0** · 产物里 70ch 规则 0 处 |
| 恢复证明 | 同上 + `M-disk.dist-after-recovery.sha256.txt` | sha256 前后相等 `true` · `git status --porcelain` 与前置相等 `true` · 产物清单逐字节相等 `true` |

**必须写明的细节（不做"看起来恢复了"的假象）**：本 worktree 的 `HEAD = 1f225d2` 是**基线**，T1 的源码改动**未提交**，
所以字面的 `git checkout -- scripts/tools/build-local.js` 拿到的是**改动前**的版本（sha256 `75170c7f…`，不是 T1 的工作副本）。
处置：checkout 之后用 `git apply` 把 T1 自己的 diff（`mutations-real/M-disk.build-local.t1.patch`，7593 字节）还原回
sha256 `264912c2…`（与前置**逐字节相等**），并另做了一次「apply → revert → apply → revert」的可逆性自检；
TEMP 里另存了字节备份。全部写进 `M-disk.log` 第 ⑤⑥ 段。

> 为什么 M-disk 的判红/判绿用**我自己的探针**而不是 `verify-site.js`：这两步要在**产物侧**判死，
> 不能依赖被测脚本本身；而且这样这批证据在 `verify-site.js` 修复后依然有效（与 §22c 的 M4 是同一处缺陷的
> 「落盘级」版本，互为独立证据）。

## 6. 第 7 组 · Full Gate

| 证据 | 文件 | 读数 |
| --- | --- | --- |
| 现场解析的步骤清单（dry-run） | `gate/00-dry-run.txt` | 从 `.github/actions/gate/action.yml` **现场解析出 49 步**（不写死） |
| 执行日志（stdout+stderr） | `gate/01-static-run.txt` | 逐步耗时与退出码 |
| 每一步原始日志 | `gate/steps/NN-<slug>.txt` | 45 份（含第 47/48 步的真浏览器日志） |
| 机器可读汇总 | `gate/steps/summary.json` | `stepsInAction 49 · executed 45 · passed 45 · failed 0 · skipped 4 · exitCode 0`（另有 `verifySiteSha256` / `runAt` / `runs[]`） |
| 执行器 | `gate/run-full-gate.cjs` | `--dry-run` / `--only=47,48` / `--skip-browser`；按步骤序号**增量合并** summary |
| 产物可复现 | `gate/dist-after-full-gate.sha256.txt` | 与 `build/dist-after-build1.sha256.txt` **逐字节相同** |

跳过的 4 步（**逐条写明理由，绝不静默跳过**）：

1. `Install dependencies` —— CI 的依赖准备；本机 worktree 的 `node_modules` 已按 lockfile 就位，该步不参与任何判定。
2. `Prepare browser for the real-browser gate` —— CI 专用 shell：探测 runner 上的浏览器并写 `GITHUB_OUTPUT` / Step Summary；本机浏览器由 `DSH_EDGE`（Edge）直接给出。
3. `Browser availability decision (never silent)` —— CI 专用：把「浏览器不可用」按规则判红；那段 shell 本身由 `check-ci-consistency.js` 的 (10) 真实执行守着（本机没有 `GITHUB_OUTPUT` 语义）。
4. `Gate conclusion` —— CI 专用：只把结论写 GitHub Step Summary，不参与判定。

⚠️ **版本标注**：第 47/48 步（`Real-browser acceptance (verify-site.js)` 96.7s / `Regression verify (baseline compare)` 101.9s）
跑的是**修复前**的 `verify-site.js`（sha256 `4cae2fb2…`）。`summary.json` 里每一步都带
`verifySiteSha256` 与 `runAt`，`runs[]` 记录每一轮的 identity —— 修复后补跑时**不会**把旧读数冒充成新读数。

## 7. 修复后验收（**已完成**）· 唯一口径 / 一键重跑 / 逐条读数

> 冻结修订：`scripts/tools/verify-site.js` sha256 = `4f4cb2e3b3f8e47d921137a5801d8692811a77d868a13c0a3516db8405d72ffb`
> **跑前记一次、跑后记一次，两次相等**（`t3/POST-REPAIR-RUN.txt` 的首尾两行）⇒ 本节的读数全部属于这一版，不存在混版。
> 编排：`node t3/run-post-repair.cjs` ⇒ **9/9 步按期望**（`t3/post-repair-summary.json`，`t3/POST-REPAIR-RUN.txt`）。

### 7.0 勘误（本 README 与中期汇报里更正过的一处数字）

- 曾写作「真实缺陷面是 **105 页** / 156 条说明」⇒ **错**。正确读数是「**48 页** / 156 条说明」：
  105 是「**有说明的页面数**」（与缺陷面无关），156 条窄说明**全部落在那 48 页上**（3 页各 2 条、43 页各 3 条、`/feeds/` 8 条、`/changes/` 13 条），
  另有 57 个「有说明但没被压窄」的页面是完全正常的。
- 真正被低估的是**每页里的条数**（旧口径每页只看第一条 ⇒ 只看到 48 条，实际 156 条），**不是页数**。
- 已被 `truth-401.json` 的 `totals.pagesCarryingNarrowNotes = 48` / `pagesWithNotesButNoNarrowNotes = 57` 与不变量
  `含窄说明的页面数 = 旧口径页集合大小` 固化成机器可读口径；captain 已据此作废旧验收标准。

### 7.1 修复后的验收标准（captain 2026-10-06 更正后的唯一口径）

在 `dist.baseline`（改动前产物）上，修复后的 §22c 必须：

1. **条集合**：`note-narrow` 命中 **156 条**，与 `caughtByOldCriteria(48) ∪ onlyNewTruth(108)` **逐条相同**（`route` + `index` 两级身份）；
2. **页集合**：命中 **48 页**，与旧口径那 48 页**逐条相同**（无新增、无减少）；
3. **零误报**：`alreadyFine` 的 245 条与 `pagesWithNotesButNoNarrowNotes: 57` 那些页面，一条都不许中；
4. 在 `dist`（改动后产物）上：**0 条 / 0 页**；
5. **可机读形态**：报告里必须出现**条级容器**（`metrics.*` 里元素含 `route/index/codes` 的数组）——
   修复前那份报告「没有条级容器 ⇒ 108 条无从核对」，本身就是 blocker 的可机读表现，修复后必须消失。

### 7.2 一键重跑（已预置）

| 产物 | 说明 |
| --- | --- |
| `t3/run-post-repair.cjs` | 9 步串行编排（P0–P9）：两份 `verify-site.js` 报告 + 两份产物清单（零磁盘污染） + 变异拆分 + M0 落盘 + **两份 `gate-vs-truth`** + Full Gate 第 47/48 步补跑；每步有**期望值**，不符即 fail-fast 且落盘 |
| `t3/POST-REPAIR-PLAN.txt` | `--dry-run` 的计划（每条命令 + 日志落点 + 期望） |
| `geometry/gate-vs-truth.cjs` | **独立验收工具**（captain 写进 repair 契约）：与 `truth-401.json` 做**集合差**，输出「漏判条/页 + 误报条」，并自动发现条级容器。`--expect=baseline` 默认**要求条级容器存在**（验收标准第 5 条），只核对页集合需显式 `--allow-page-only` |
| `geometry/checker-selftest/` | 这一支自己的三次自检（修复前）：① 合成绿报告 `expect=green` ⇒ **exit 0**；② 修复前基线报告 `expect=baseline` ⇒ **exit 1，红的正是「没有条级容器」**；③ 同一份报告 `--allow-page-only` ⇒ exit 0 且输出标注条级未核对 |
| `t3/post-repair-summary.json` | 重跑后的总账（每步 exit / 期望达成 / `verify-site.js` sha256） |

用法（captain 给绿灯后）：

```powershell
node research/_raw/secondary-page-layout-unification/t3/run-post-repair.cjs --dry-run   # 先看计划
node research/_raw/secondary-page-layout-unification/t3/run-post-repair.cjs             # 一次跑完
```

| 待补的四项 | 产物 | 现状 |
| --- | --- | --- |
| 权威几何读数（`verify-site.js --dir=dist --json=…`）+ §22c 九个计数 | `geometry/after-verify.json`（+ 同目录 `mutations.json`）+ `geometry/07-after-verify-green.log` | **已完成**（P1，120.7s）：842 项 **0 失败** |
| M0 反证（`--dir=dist.baseline` 必须 exit≠0 且报出 note-narrow，逐页清单与条数） | `mutations-real/M0-baseline.json` + `M0-baseline-summary.json` | **已完成**（P5/P6，131.8s）：842 项 **27 失败**（非 §22c 的 **0** 项）· **48 页 / 156 条** |
| M1–M4 / M6 / M6 正对照 / M7 在真实 dist 上的逐条 JSON（r2 另含 M8 / M9a / M9b / M10 与两个正对照） | `mutations-real/M*.json` / `M6-control.json` / `no-injection-control.json` / `M5-reuse.json` / `M-summary.json` | **已完成**（P4）：逐条 JSON，全部 `hit` |
| Full Gate 第 47/48 步的**修复后**读数 | `gate/steps/47-*.txt` / `48-*.txt`（已覆盖），`summary.json.runs[]` 追加第二轮 | **已完成**（P9，131.9s + 119.2s）：两步 exit 0，逐步记 `verifySiteSha256 4f4cb2e3…` |

### 7.3 修复后重跑的九组读数（全部落盘）

#### P1 · `--dir=dist`（改动后产物，权威读数）—— `geometry/after-verify.json`
- **842 项断言 · 0 失败**；`metrics.layoutNotes` / `layoutNotesAt1600` 各 **401 行**；`layoutViolations` **0** 条。
- §22c 全站计数（九个）：`total 186 · wide 55 · detail 131 · other 0 · notesChecked 105 · narrowNotes 0 · narrowNotePages 0 · narrowNotesAt1600 0 · overflowPages 0 · unexpectedDetailMain 0 · missingDetailMain 0 · unclassified 0`
  （另有两个 r2 新增量：`notesJudged 401`、`frozenRule.pagesExactlyOnce 186/186`）
- 扫描 628 次导航 · JS 错误 0 · 外部请求 0 · §22c 本节 39.6s。

#### P5/P6 · `--dir=dist.baseline`（改动前产物，M0 反证）—— `mutations-real/M0-baseline.json`
- **exit=1**、**842 项 / 27 失败**，其中 **非 §22c 的失败 0 项**（14 行失败清单见 `M0-baseline-summary.json`）。
- **`note-narrow` 命中 48 页 / 156 条**（页级 48 行 `layoutViolations`，条级 156 个 `route#index`）。
- 按族归类：`vendor/* 26 · need/* 10 · category/* 6 · 集合页 3 · status 1 · changes 1 · feeds 1`（= 48）。
- 冻结串 `pagesExactlyOnce 0/186`（改动前产物里根本不存在这条规则）—— M0 的另一面证据。

#### P7/P8 · 集合级核对（独立验收工具）—— `geometry/gate-vs-truth-{green,baseline}.json`
| | 绿轮（dist） | 基线轮（dist.baseline） |
| --- | --- | --- |
| verdict | **pass** | **pass** |
| 条级容器 | `metrics.layoutNotes` ✅ | `metrics.layoutNotes` ✅（第 5 条标准） |
| 命中条 / 页 | 0 / 0 | **156 / 48** |
| 漏判 | 0（156 条真值如期消失，见日志里的读法说明） | **0**（156 条逐条命中） |
| 误报 | 0 | **0**（245 条对照组一条没中） |
| 页集合 | 空 | **逐条相同（无新增、无减少）** |

#### P4 · 变异牙逐条（真实 dist）—— `mutations-real/M*.json` + `M-summary.json`
| 牙 | 页面@视口 | 期望 | 实测 | 命中条（`route#index`） |
| --- | --- | --- | --- | --- |
| M1 | `student/@1440` | note-narrow | ✅ | `#0 #1 #2` |
| M2 | `status/@1440` | note-narrow | ✅ | `#0 #1` |
| M3 | `changes/@1440` | note-narrow | ✅ | `#0…#12`（13 条） |
| M4 | `feeds/@1440` | note-narrow | ✅ | `#0…#7`（8 条） |
| M6 | `student/@390` | page-overflow@390 | ✅（`[note-clipped, page-overflow@390]`） | — |
| M7 | `status/@1440` | unexpected-detail-main | ✅ | — |
| **M8** | `student/@1440` | note-narrow（padding 型：盒宽不动、有字区域被压） | ✅ + 要害断言 ✅ | `#0 #1 #2` |
| **M9a** | `docs/data/@1440` | note-narrow（只压非首个） | ✅ + 「第 0 条不被压」✅ | `#1…#8` |
| **M9b** | `changes/@1440` | note-narrow（`:not(:first-of-type)`） | ✅ + 同上 ✅ | `#1 #3 #4 #8 #12` |
| **M10** | `student/@1600` | note-narrow（`@media(min-width:1500px)`，1440 档看不见） | ✅ | `#0 #1 #2` |
| M6 正对照 | `student/@390` | 不得溢出 | ✅（实测空） | — |
| **不注入正对照** | M8/M9a/M9b/M10 四个靶页 | 本来 0 条 note-narrow | ✅ 四个都干净 | — |
| M5（复用） | §22b 的 M1–M5 | 既有牙全绿 | ✅ 41 项断言 / 0 失败 | — |

- 锚点唯一性：两处独立读数一致（浏览器内 `出现 1 次` / **磁盘静态** `<style>` 里 1 次，全文件也是 1 次）。
- **零磁盘污染**：变异前后 303 个文件的 sha256 清单**逐字节相同**（`M-summary.json.zeroDiskPollution`）。

#### P9 · Full Gate 第 47/48 步（修复后）—— `gate/steps/summary.json`
- `stepsInAction 49 · executed 45 · passed 45 · failed 0 · skipped 4 · exit 0`（合并视图）。
- `runs[]` 两轮：① 修复前（`4cae2fb2…`）跑 45 步全绿；② 修复后（`4f4cb2e3…`）只跑 47/48 ⇒ **各 exit 0**
  （47：842 项 0 失败；48：848 项 0 失败）—— 逐步都带 `verifySiteSha256`，不存在混版。

### 7.4 「修复前判据 × 改动前产物」对照（牙齿真的变利了）

| 读数 | 修复前判据（`recovered/pre-t7`，sha `4cae2fb2…`） | 修复后判据（sha `4f4cb2e3…`） |
| --- | --- | --- |
| 断言 / 失败 | 827 / **19** | 842 / **27** |
| `layoutSweep.narrowNotes` | **48** | **156** |
| `layoutSweep.narrowNotePages` | （无此字段） | **48** |
| **条级容器** | **不存在**（`metrics.layoutNotes` 无、`layoutViolations[*].noteKeys` 无） | **401 行**（`route#index` 可逐条核对） |
| 逐条命中 | 不可知（每页只判第一条） | 156 条 / 48 页，其中 **108 条是 `index>0`** |
| 同一支核对工具 `gate-vs-truth --expect=baseline`（严格默认） | **exit 1** —— 红的正是「没有条级容器」 | **exit 0** |
| 同上加 `--allow-page-only` | exit 0（页集合 48/48 一致） | exit 0 |

⇒ 结论：**页集合**当时就是对的（48 页），被低估的是**每页里的条数**：旧判据在最理想的情况下也只能看见 48/156 条，剩下 108 条**在形态上无法表达**；修复后同一产物上 156 条逐条可见，且零误报。原始读数：`recovered/pre-t7-M0-baseline.json`、`recovered/gate-vs-truth-pre-t7-{strict,page-only}.json`、`mutations-real/M0-baseline.json`。

> 沙箱纪律的一次偏差（如实记录，已复原）：沙箱里 `--json=` 是相对其 ROOT（`recovered/pre-t7`）解析的，
> 第一次跑时把两个 JSON 写进了 `recovered/pre-t7/research/…`。已移出到 `recovered/` 并把新建目录删除；
> 沙箱 `verify-site.js` sha256 仍为 `4cae2fb2…`，顶层只剩 `node_modules`(junction) 与 `scripts`。
> 说明落在 `recovered/pre-t7-run-note.txt`。

> 处理原则：修复只动 `scripts/tools/verify-site.js` 的 §22c 区块（captain 已确认**不会**触及 `index.html` 与 `build-local.js`），
> 因此 §1–§5 的**产物侧证据不需要重做**，它是最终证据；上表四项在修复定稿后一次性补齐，并在本 README 与
> 最终 output 里标注各自的 `verify-site.js` sha256（`gate/steps/summary.json` 逐步记录 `verifySiteSha256`，不会混淆版本）。

### 7.5 并集口径适配（t14 起 · t18 完成）—— 消费者、自检、给 t16 的预期

**t14 把 §22c 的窄柱判据从单一码改成并集**：

| 码 | 含义 | 覆盖 |
| --- | --- | --- |
| `note-narrow` | 盒宽窄：内容盒宽 < 0.85×列宽 | 48 条（单行说明 + 盒子被压窄） |
| `note-ink-narrow` | 字迹窄：行数 ≥ 2 且最宽行 < 0.85×列宽 | 108 条（盒宽满宽、字迹仍窄） |
| `note-hidden-text` | 文本非空但零可见字形盒 | **不算窄**（独立缺陷，另有验收面） |

凡**按码名判窄**的地方都必须用**接受码集合** `/^note-(ink-)?narrow$/`（不接受前缀放宽，
否则 `note-axis` / `note-clipped` / `note-hidden-text` 会被一起吞进来）。t18 已完成两处（属我的）适配：

| 文件 | 改了什么 | 证据 |
| --- | --- | --- |
| `geometry/gate-vs-truth.cjs` | 窄判定 → `isNarrowCode`（页级 + 条级两处）；输出新增 `acceptCodeSet`、`narrowCodeTally`（48/108 分列）、`otherCodeTally`（**pass ≠ 零违规**，其它码如实列出；别的码由 §22c 自己的断言面负责） | `geometry/consumer-selftest/10/11/12-case*.log`、`20/21-real-*.log`、`22/23/24-regress-*.log` |
| `mutations-real/extract-m0.cjs` | 窄命中 → 并集；新增页级 `narrowCodeTally` 与条级 `narrowNoteCodeTally` / `narrowNoteKeyCount`；顺带把说明宽字段兼容 r2 的 `note`/`region` 与 r3 的 `textWidth`/`column` | `consumer-selftest/40-extract-m0-real.log`、`41-extract-m0-synth.log` |
| `mutations-real/extract-mutations.cjs` | 仅措辞（不注入正对照）；它不按码过滤 | `consumer-selftest/50-extract-mutations-regress.log` |
| `t3/run-post-repair.cjs` + `t3/POST-REPAIR-PLAN.txt` | 口径文案与验收标签；计划已用 `--dry-run` 重新生成 | `t3/POST-REPAIR-PLAN.txt` |

**五次自检（全部落盘，全部不依赖浏览器）**：

| # | 输入 | 命令期望 | 实测 |
| --- | --- | --- | --- |
| S1 | 合成：48 `note-narrow` + 108 `note-ink-narrow`（`consumer-selftest/case1-union-156.json`） | `--expect=baseline` **pass** | **exit 0** · 命中码分布 `{note-narrow:48, note-ink-narrow:108}` · 漏判 0 · 误报 0 |
| S2 | 合成：只有 48 `note-narrow`（`case2-narrow-only-48.json`） | **fail** 且报「漏 108」 | **exit 1** · **漏判 108 条**（样例 `category/#1 category/agent/#1 …`）· 误报 0 |
| S3 | 合成：156 + 1 条误报（`case3-false-positive.json`） | **fail** 且**点名** | **exit 1** · 误报 1 条 **⇒ `archive/#0`** |
| R1 | 真实：`teeth/M0-after-repair.json`（r2 的 156 条，全是 `note-narrow`） | `--expect=baseline` **pass** | **exit 0** · 156/156 · 误报 0 |
| R2 | 真实：`geometry/after-verify.json`（dist，0 条） | `--expect=green` **pass** | **exit 0** · 0 条 / 0 页 · 245 条对照组零误报 · 条级容器在 |

额外三个回归（防"改过头"）：`recovered/pre-t7-M0-baseline.json` 严格默认 **exit 1**（无条级容器）/ 加 `--allow-page-only` **exit 0**；
`teeth/M-synth-green.json` `--expect=green` **exit 0**；`extract-m0` 对**合成并集报告**给出 **48 页 / 156 条**、码分布 `{note-narrow:48, note-ink-narrow:108}`。

**给 t16 的预期**（并集口径下 P0–P9 应当怎么读）：
· P8 `gate-vs-truth --expect=baseline`：命中 **156 条 / 48 页**，码分布应为 `{note-narrow:48, note-ink-narrow:108}`（若全是单个码，说明产出侧没走并集）；
· P6 `extract-m0`：**48 页 / 156 条**，页级码分布 48、条级码分布 48+108；
· P7 绿轮：0 条 / 0 页；`otherCodeTally` 若非空，那是**别的码**的读数（本支不判，但会如实列出）；
· 其余步骤（P0–P5、P9）与码名无关，无需改动。

**消费者普查**：`geometry/report-consumers.md`（原样事实来自 `geometry/code-census.cjs` /
`consumer-selftest/code-census.json`：扫 229 个代码文件、命中 37 个文件 / 735 行）。
它逐行列出「需要改」的清单 —— 属我的两处已改；`verify/probe-vs-22c.cjs`（independent-verifier）、
`review/audit-r3-notes.cjs` 等（reviewer）、`adversary/harness.cjs` 等（adversary）**只报告、未改**（他人 inScope）；
`release/online-smoke.cjs` 经查 **0 命中**（不按码名判窄，自己量 `textWidth` 自己判）⇒ **不需要改**，
但有一条覆盖观察写在该报告 §5（**我没有动它一个字节**）。

## 8. 复现命令（按顺序）

```powershell
cd <worktree>
node scripts/tools/build-local.js                                             # 第 1 组
node research/_raw/secondary-page-layout-unification/build/dist-manifest.cjs --dir=dist --out=…/build/dist-after-build1.sha256.txt
node research/_raw/secondary-page-layout-unification/diff/nonhtml-sha256.cjs --before=dist.baseline --after=dist --out=…/diff/nonhtml-sha256
node research/_raw/secondary-page-layout-unification/diff/before-after-compare.cjs --before=dist.baseline --after=dist --out=…/diff/before-after-compare.json
node research/_raw/secondary-page-layout-unification/geometry/wide-probe.cjs --dir=dist.baseline --label=before --out=…/geometry/before.json --allow-violations
node research/_raw/secondary-page-layout-unification/geometry/wide-probe.cjs --dir=dist --label=after --out=…/geometry/after.json
node research/_raw/secondary-page-layout-unification/geometry/all-notes-probe.cjs --dir=dist.baseline --label=before --out=…/geometry/all-notes-before.json
node research/_raw/secondary-page-layout-unification/geometry/all-notes-probe.cjs --dir=dist --label=after --out=…/geometry/all-notes-after.json
node research/_raw/secondary-page-layout-unification/geometry/make-table.cjs   # ⇒ before-after.md
node research/_raw/secondary-page-layout-unification/geometry/make-truth-401.cjs # ⇒ truth-401.json
node research/_raw/secondary-page-layout-unification/mutations-real/run-mdisk.cjs
node research/_raw/secondary-page-layout-unification/gate/run-full-gate.cjs --dry-run
node research/_raw/secondary-page-layout-unification/gate/run-full-gate.cjs    # 49 步全跑；补跑用 --only=47,48

# ↓↓ 修复定稿后（captain 绿灯）一次跑完四项待补证据 + 两份集合级核对
node research/_raw/secondary-page-layout-unification/t3/run-post-repair.cjs --dry-run
node research/_raw/secondary-page-layout-unification/t3/run-post-repair.cjs
```

## 9. 资源纪律与边界

- `dist/` 与 `node scripts/tools/build-local.js` 的使用者是 `evidence-runner`（本任务），同一时刻只跑一个重命令。
- 没跑过 `git commit`。生产源码**零修改**：唯一一次改 `scripts/tools/build-local.js` 是 M-disk 循环的临时变异，
  已在同一次循环里恢复到 sha256 逐字节相等（§5），并用 `git status --porcelain` 前后相等佐证。
- 本轮所有读数都落盘成文件；终端输出只作提示，不作为唯一证据。
