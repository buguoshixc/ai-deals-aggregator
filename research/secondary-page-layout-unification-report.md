# secondary-page-layout-unification · 最终报告

> **本文件的完成状态（两阶段交付 + 六轮门禁修复的版本标注）**
>
> - **阶段 1（已完成）**：§A 基线 · §B 发现（逐页面族）· §C 根因（含 **C.5 门禁侧根因：判据量的是代理量**）· §D 修复 · §19–§20 审计。
> - **阶段 2a（已完成）**：§E Before/After · §F Regression · §G Mutation · §H Full Gate · §J Self Audit。
> - **阶段 2c（已完成）**：§D.3 / §G / §H 更新到**轮 6 冻结读数**；§C.5 扩成**四轮对照**；§J 残余项写成具体形状；§K 收口记录见报告末尾。
> - ⚠️ **引用纪律（本版强制）**：**断言数必须带轮次**。同一支套件在不同轮的计数不同，混引会被读成"削弱/放水"：
>   | 轮次 | 判据 sha256（前 8 位） | `--dir=dist` | `--dir=dist.baseline` |
>   | --- | --- | --- | --- |
>   | 轮 2 | `4f4cb2e3` | **842** / 0 | **842** / 27 |
>   | 轮 3 | `108818856cdf40a4` | **848**（未打补丁）/ **854**（内存补丁开启 760 覆盖） | （本报告不引用，无落盘出处） |
>   | 轮 4 | `fd3c9a3090dca11b` | **848** / **0** | **848** / **33** |
>   | 轮 5 | `610b25a809c6b337` | **852** / **0** | **852** / **36** |
>   | **轮 6（当前）** | **`2cbc160dc64f8ade`** | **852** / **0** | **852** / **36** |
>   - 「**848 是未打补丁的运行、854 是内存补丁开启 760 覆盖后的运行**」——**两个数不能互替**：
>     轮 3 出现过这两个数（`review/runs/r3-green.json` 是 **854** 那一轮）。
>   - **轮 5 与轮 6 的四个计数逐项相同**（`--dir=dist` 852/0 · `--dir=dist.baseline` 852/36 · 第 47 步 852 · 第 48 步 858）——
>     轮 6 换的是**判据内部语义**（收掉标记级豁免键 + 上界计数改不相交），**不是计数**；
>     两者的区别只在 **sha（`610b25a8` → `2cbc160d`）与「豁免条件」**，引用时不得只写数不写轮次。
>   - **Full Gate 第 48 步（回归比对）** 的计数是另一支（含 `--compare` 六项）：轮 6 = **858** / 0，
>     与第 47 步（**852** / 0）**不是同一个计数器**，不得混引。
> - ✅ **不受影响**：§E / §F 的**产物侧**数字是最终证据 —— 六轮修复都只动了 `scripts/tools/verify-site.js`，
>   产物自 t1 之后未再改动（轮 6 的字节对账再次复算：303 个文件跑前/跑后 sha256 **0 差异**，见 §D.4 / §H）。
> - **§I Online Smoke**：**已回填（发布态实测）** —— 提交 / PR #45 / 合并提交 / CI `gate` / `Deploy to GitHub Pages` 三 job / 线上几何 smoke（8 页 · **79 项断言 · failed 0**）全部有值；并如实登记**取证环境的网络事实**（§I.5）。
> - **CI 的 required check 读数已由发布实跑补齐**（PR run **37501963346** → pass · 4m53s；master run **37502684190** → success），见 §H.3 与 §I.2。
> - **三份长期文档**（`docs/DESIGN-RULES.md` / `PROJECT_STATUS.md` / `NEXT-STEPS.md`）：规则与产物侧事实写全；门禁数字已换成**轮 6 冻结读数**。
>
> **证据纪律（本文件全程遵守）**：每一个数字都能在 `research/_raw/secondary-page-layout-unification/**` 的证据文件里找到出处；
> 不手抄、不估算、不写「约」。每张表下面给出证据文件路径。凡本文**推导**出来的映射（而非证据文件直接给出的），
> 推导脚本与原始输出一并落盘（见 `docs/01-shell-snote-map.txt`）；**推导值一律标注为推导**（例：`26.2%` = `105 ÷ 401`）。

---

## §A 基线

### A.1 版本与工作区

| 项 | 值 | 出处 |
| --- | --- | --- |
| base commit | `1f225d22625c15702995785394b60185ebd0520b`（即 `origin/master` = `1f225d2`） | `research/_raw/secondary-page-layout-unification/t1/00-baseline-head.txt` · `.../diff/01-git-content-proof.txt`（A1） |
| 分支 | `secondary-page-layout-unification` | `.../t1/17-t1-summary.md`（§头部） |
| worktree | `D:\OneDrive\Desktop\Code\AI Page\.worktrees\secondary-page-layout-unification` | `.../t1/17-t1-summary.md`（§头部） · `.../docs/01-shell-snote-map.txt`（第 3 行） |
| 提交区间内提交数 | 0（`git diff --name-only 1f225d2..HEAD -- <数据文件>` 为空；全部改动在工作区） | `.../diff/01-git-content-proof.txt`（A2–A6） |
| 改动前后数据文件清单差 | 空（`git diff --name-only 1f225d2` 只列出 7 个源文件，无任何 `*.json` 数据文件） | `.../diff/01-git-content-proof.txt`（A7） |

> 证据：`research/_raw/secondary-page-layout-unification/t1/00-baseline-head.txt` ·
> `research/_raw/secondary-page-layout-unification/diff/01-git-content-proof.txt`

### A.2 环境

| 项 | 值 | 出处 |
| --- | --- | --- |
| Node | `v24.13.1` | `.../baseline/README.txt` · `.../release/README.md`（§4） |
| 浏览器 | Edge `154.0.4258.37`，`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`（headless） | `.../release/README.md`（§4） · `.../geometry/before-after.md`（§0） |
| 浏览器驱动 | `playwright-core 1.63.0` | `.../release/README.md`（§4） |
| 操作系统 / 时区 | Windows；证据时间戳全为 `+08:00`（CST） | `.../t1/12-final-verify-run.txt`（时间戳行） · `.../geometry/before-after.md`（§0 生成时刻） |

> 证据：`research/_raw/secondary-page-layout-unification/baseline/README.txt` ·
> `research/_raw/secondary-page-layout-unification/release/README.md` ·
> `research/_raw/secondary-page-layout-unification/geometry/before-after.md`

### A.3 改动前产物（只读基线）

| 项 | 值 | 出处 |
| --- | --- | --- |
| `dist.baseline/` | `files=303` · `html=186` · `non-html=117` | `.../baseline/README.txt` · `.../build/02-dist-counts.txt` |
| `dist.baseline/` 最新 mtime | `2026-10-06 14:27:50`（`dist.baseline\status\index.html`） | `.../t1/09-baseline-integrity.txt` |
| 工作窗口内被改动 | **0** 个文件 | `.../t1/09-baseline-integrity.txt` |
| sha256 清单 | 303 个文件的清单（`dist-baseline-sha256.txt`） | `.../baseline/dist-baseline-sha256.txt` |
| 构建前 `dist/` | `files=303 bytes=20012665` | `.../build/00-prebuild-dist.txt` |

> 证据：`research/_raw/secondary-page-layout-unification/baseline/README.txt` ·
> `research/_raw/secondary-page-layout-unification/t1/09-baseline-integrity.txt` ·
> `research/_raw/secondary-page-layout-unification/build/00-prebuild-dist.txt`

### A.4 构建与校验命令（本版本用到的全部命令）

| # | 命令（工作目录 = worktree 根） | 关键读数 | 出处 |
| --- | --- | --- | --- |
| 1 | `node scripts/tools/build-local.js` | `✅ 产物自检通过` · `✅ 构建完成 → dist/` · `产物总大小: 1410.0 KB` · `dist files=303 html=186 nonHtml=117 bytes=20012665` | `.../build/01-build-local.txt`（末尾） · `.../build/03-build1-manifest.log` |
| 2 | `node scripts/tools/validate.js --strict` | `✅ 校验通过（strict 模式）` | `.../t1/12-final-verify-run.txt`（第 4 项） |
| 3 | `node scripts/tools/seo-selftest.js` | `=== v1.7 SEO 门禁演练：69 项通过，0 项失败 ===` | `.../t1/12-final-verify-run.txt`（第 1 项 + key readings） |
| 4 | `node scripts/tools/archive-selftest.js --dir=dist` | `=== v3.0 历史档案演练：76 项通过，0 项失败 ===` | `.../t1/12-final-verify-run.txt`（第 3 项 + key readings） |
| 5 | `node scripts/tools/verify-site.js --dir=dist.baseline --json=…/M0-after-repair.json` | exit 1 · 842 项断言失败 27 项（全部 §22c） | `.../teeth/README.md`（§0.1） |
| 6 | `node scripts/tools/verify-site.js --dir=dist --json=…/M-green-after-repair.json` | exit 0 · 842 项断言 0 失败 | `.../teeth/README.md`（§0.1） |
| 7 | `node research/_raw/secondary-page-layout-unification/gate/run-full-gate.cjs` | Action 49 步 · 执行 45 · 通过 45 · 失败 0 · 跳过 4 · exit 0 | `.../gate/01-static-run.txt`（末行） · `.../gate/03-browser-rerun.txt`（末行） |
| 8 | `node …/geometry/wide-probe.cjs`（独立几何探针，不 require `verify-site.js`） | before 违规页 48 → after 违规页 0 | `.../geometry/01-before-probe.log`（末行） · `.../geometry/02-after-probe.log`（末行） |

> 证据：`research/_raw/secondary-page-layout-unification/build/01-build-local.txt` ·
> `research/_raw/secondary-page-layout-unification/build/03-build1-manifest.log` ·
> `research/_raw/secondary-page-layout-unification/t1/12-final-verify-run.txt` ·
> `research/_raw/secondary-page-layout-unification/gate/01-static-run.txt` ·
> `research/_raw/secondary-page-layout-unification/geometry/01-before-probe.log`

---

## §B 发现（逐个页面族）

### B.0 本节用的判据与口径（写清楚才谈得上「真的有问题」）

- **页面级说明** = `<main>` 里的 `.snote`。本版本的判据从「文档序第一条」扩到「`<main>` 内**全部**」：
  全站 **401 条**说明分布在 **105 页**上（另有 **81 页**零说明：首页 + 80 个 deal 详情页）。
- **主数据区** = 该页第一个命中的声明选择器（`.ctable / .stable / .chgsec / .chglist / .flist / .fsec / .ptable / .lsum / .pchglist`），
  命不中时回落 `<main>`。
- **`note-narrow`（窄）** = 说明的有字区域宽 `< 0.85 × min(主数据区宽, 页面列宽)`。
- **`note-axis`（不同轴）** = 说明的 border-box 左右边与主数据区**和**页面主容器都差 `> 1px`。
- **`page-overflow@<vw>`** = `documentElement.scrollWidth > 视口 + 1`。

> 证据：`research/_raw/secondary-page-layout-unification/teeth/README.md`（§0、§3） ·
> `research/_raw/secondary-page-layout-unification/geometry/before-after.md`（§0 判据行）

**三条必须先说清楚的口径（否则后面的数字会被读错）：**

1. **布局族读数：186 页 = `wide` **55** + `detail` **131** + `other` **0**。**
   首页按 `scripts/lib/page-kinds.js` 的声明属于 `wide` 族（`home.layout = 'wide'`）—— 它**没有页面级说明**，
   所以说明类判据对它自然为空；这比把它算成「其它」更准确。（此处更正一处早前的口头笔误：
   曾写作 `wide 54 / detail 131 / other 1（首页）`，正确是 **55 / 131 / 0**。）
2. **`notesChecked` 与 `notesJudged` 是两个不同口径，不得混用**：`notesChecked = 105` 是**有页面级说明的页数**；
   `notesJudged = 401` 是**逐条判过的说明条数**。修复前每页只判文档序第一条 ⇒ 只有 105 条进判据
   （覆盖率 `105 / 401`，按两个已引用读数相除 = **26.2%**）；修复后 **401 条全部**进判据。
3. **「有说明的页数 105」不是缺陷面**：156 条窄说明落在 **48 页**上；另有 **57** 个「有说明但从来没被压窄」的页面。

> 证据：`research/_raw/secondary-page-layout-unification/mutations-real/M-summary.json`（`layoutSweep` 全字段：`total 186 · wide 55 · detail 131 · other 0 · notesChecked 105 · notesJudged 401`） ·
> `.../t3/README.md`（§4.2 口径段、§7.3 P1） · `.../teeth/README.md`（§0、§5）

**改动前的全站形态**：一页的说明被压成 **452.81px** 的窄柱、贴在 1380px 主数据区的左边，
1440 档比例 **0.328**；窄屏（390/360）反而看不出来（`358/358`、`328/328`，比例 1.000）——
**缺陷只在桌面档显形**。

| 读数 | before（`dist.baseline`） | after（`dist`） |
| --- | --- | --- |
| 全站扫描页数 | 186 | 186 |
| 有违规码的页面 | **48** | **0** |
| `note-narrow` | **48** | **0** |
| `note-axis` | **48** | **0** |
| `note-clipped` | 0 | 0 |
| `page-overflow@1440` | 0 | 0 |
| `page-overflow@390` | 0 | 0 |
| 样本集违规条数（21 页 × 6 档） | **52** | **0** |

> 证据：`research/_raw/secondary-page-layout-unification/geometry/before-after.md`（§1 全站读数表） ·
> `.../geometry/01-before-probe.log` 末行（`全站扫描：186 页 · 违规页 48 · 违规码计数 {"note-narrow":48,"note-axis":48}`） ·
> `.../geometry/02-after-probe.log` 末行（`全站扫描：186 页 · 违规页 0 · 违规码计数 {}`）

**48 个违规页按路由族归类**：`category/*` **6** 页 · `changes/` **1** 页 · `developer/` **1** 页 ·
`feeds/` **1** 页 · `free-api/` **1** 页 · `need/*` **10** 页 · `status/` **1** 页 · `student/` **1** 页 · `vendor/*` **26** 页。

> 证据：`research/_raw/secondary-page-layout-unification/geometry/before-after.md`（§1.1 的 48 行逐页表 + 该表后的族归类行）

**同一条规则在改动前有 8 份副本、两种取值**（这是后面 §C 的根因，也是「哪些页面族会中招」的分界线）：

| build-local.js 行（改动前） | 所属页面壳 | `max-width` |
| --- | --- | --- |
| 1048 | `renderStatusPage` | `70ch` |
| 1347 | `renderChangesPage` | `70ch` |
| 1613 | `renderPlansPage`（`/plans/coding/`） | `none` |
| 1739 | `renderApiPlansPage`（`/plans/api/`） | `none` |
| 1883 | `renderPlansHubShell`（`/plans/`） | `none` |
| 2001 | `renderModelsShell`（`/models/`、`/archive/`、`/docs/data/`、模型详情、档案详情） | `none` |
| 2311 | `renderFeedsPage` | `70ch` |
| 2710 | `renderDirectoryPage`（目录页族） | `70ch` |

> 证据：`research/_raw/secondary-page-layout-unification/docs/01-shell-snote-map.txt`（机器生成：逐行扫描
> `git show HEAD:scripts/tools/build-local.js` 的 `^function render\w+` 与 `.snote \{ `，给出「行号 → 所属壳 → 取值」） ·
> 原始 grep：`.../t1/01-before-snote-grep.txt`

### B.1 Directory 族（目录页族，wide）—— **真的有问题**

- **覆盖**：`category/*` 6 页 + `vendor/*` 26 页 + `need/*` 10 页 + `/student/` + `/developer/` + `/free-api/` = **45 页**。
- **形态**：`renderDirectoryPage` 把 `.snote` 写成 `max-width: 70ch`（改动前 build-local.js:2710，见上表）。
- **实测**：45 页全部命中 `note-narrow` + `note-axis`；1440 档说明 **452.81px**（盒 `30..482.81`），
  主数据区 `.ctable` **1380px**，比例 **0.328**；1280 档 452.81 / 1240 = **0.365**；1024 档 452.81 / 984 = **0.460**；
  760 档 452.81 / 728 = **0.622**；390/360 档比例回到 **1.000**（无违规码）。
- **判定**：**真的有问题**。这不是「不好看」，是同一页里两个视觉轴：说明在一个 452.81px 的柱子里折行，
  下面的表格铺满 1380px。

> 证据：`research/_raw/secondary-page-layout-unification/geometry/before-after.md`（§1.1 逐页表 · §2 对比表 ·
> §3 after 完整几何矩阵） · `.../geometry/01-before-probe.log`（`student/` `developer/` `free-api/` `need/*` `category/*` `vendor/*` 逐档读数）

### B.2 Status（`/status/`，wide）—— **真的有问题**

- **形态**：`renderStatusPage` 写 `max-width: 70ch`（改动前 build-local.js:1048）。
- **实测**：1440 档说明 **452.81px**（`30..482.81`），主数据区 `.stable` **1380px**，比例 **0.328**，违规码 `note-narrow, note-axis`；
  该页有 **2** 条说明。
- **判定**：**真的有问题**。

> 证据：`research/_raw/secondary-page-layout-unification/geometry/before-after.md`（§1.1 第 21 行 `status/`） ·
> `.../geometry/01-before-probe.log`（`status/` 六档） · `.../docs/01-shell-snote-map.txt`

### B.3 Changes（`/changes/`，wide）—— **真的有问题**

- **形态**：`renderChangesPage` 写 `max-width: 70ch`（改动前 build-local.js:1347）。
- **实测**：1440 档说明 **452.81px**，主数据区 `.chgsec` **1380px**，比例 **0.328**，违规码 `note-narrow, note-axis`；
  该页是**说明条数最多的一页：13 条**；本次修复后 `.snote.chgwarn`（颜色修饰，不含宽度）仍保留在该页。
- **判定**：**真的有问题**（且是「多说明」最集中的一页）。

> 证据：`research/_raw/secondary-page-layout-unification/geometry/before-after.md`（§1.1 第 7 行 `changes/` · §5.1 最多条数行） ·
> `.../t1/11-no-other-snote-rules.txt`（`dist/changes/index.html` 现在只剩共享那条 + `.snote.chgwarn`）

### B.4 Feeds（`/feeds/`，wide）—— **真的有问题**

- **形态**：`renderFeedsPage` 写 `max-width: 70ch`（改动前 build-local.js:2311）。
- **实测**：1440 档说明 **452.81px**，主数据区 `.flist` **1380px**，比例 **0.328**，违规码 `note-narrow, note-axis`；
  该页有 **8** 条说明；页面高度 `3576 → 3352`（修复后变矮 **224px**）。
- **判定**：**真的有问题**。

> 证据：`research/_raw/secondary-page-layout-unification/geometry/before-after.md`（§1.1 第 9 行 `feeds/` · §5.1） ·
> `research/secondary-page-layout-unification-self-audit.md`（§二 Q2 的高度差读数）

### B.5 Plans（`/plans/`、`/plans/coding/`、`/plans/api/`，wide）—— **原本正常**

- **形态**：`renderPlansHubShell` / `renderPlansPage` / `renderApiPlansPage` 三个壳在改动前就是 `max-width: none`
  （改动前 build-local.js:1883 / 1613 / 1739）。
- **实测**：`/plans/coding/` 1440 档说明 **1380px** / 主数据区 **1380px**，比例 **1.000**；
  `/plans/api/` 同样 **1380px / 1380px = 1.000**；`/plans/` 说明 **1380px**，主数据区 `.pchglist` **1328px**，
  显示比例 **1.039**（说明比数据区还宽 —— 因为 `.pchglist` 内缩在 `.phubsec` 里，实测 `56..1384`，
  说明落在页面列 `30..1410` 上）。三页在改动前后读数**逐档相同**。
- **判定**：**原本正常**，本次一字未动其宽度效果。页面高度与说明宽在 before/after 两栏完全一致。

> 证据：`research/_raw/secondary-page-layout-unification/geometry/before-after.md`（§2 对比表 `plans/` 6 行 ·
> `plans/coding/` 6 行 · `plans/api/` 6 行） · `.../teeth/README.md`（§3 第 2 条：`.pchglist` 自身内缩在 `.phubsec` 里的读数）

### B.6 Models（`/models/` 与 `/models/<slug>/`）—— **原本正常**

- **形态**：`renderModelsShell` 在改动前就是 `max-width: none`（改动前 build-local.js:2001），
  模型索引页与 51 个模型详情页都走这个壳。
- **实测**：
  - `/models/`（wide 族）：1440 档说明 **1380px** / 主数据区 **1380px**，比例 **1.000**；
  - `/models/360zhinao-pro/`（detail 族）：`main.detail-main` **1120px**，说明 **1120px**（`160..1280`），比例 **1.000**，
    居中偏差 0；1024 档及以下随 `min(1120px,100%)` 自然退化，`984px` / `728px` / `358px` / `328px` 全部比例 **1.000**。
- **判定**：**原本正常**。

> 证据：`research/_raw/secondary-page-layout-unification/geometry/before-after.md`（§2 对比表 `models/` 6 行 ·
> `models/360zhinao-pro/` 6 行） · `.../geometry/01-before-probe.log`（`models/` 与 `models/360zhinao-pro/` 六档）

### B.7 Detail（`/deal/<id>/` 80 页 + `/models/<slug>/` 51 页）—— **原本正常**（上一版的成果）

- **形态**：deal 详情页**没有** `.snote`（因此 81 页「无页面级说明」= 首页 + 80 个 deal 详情页）；
  模型详情页有 `.snote`，但走的是 `none`。
- **实测**：10 个真实现扫的 detail 族路由，内容列宽**全部 = 1120px**，居中偏差（左留白 − 右留白）**全部 ≤ 1px**；
  `/deal/017bdbc04e70/` 六档 `main` 宽 `1120 / 1120 / 984 / 728 / 358 / 328`，无违规码。
- **判定**：**原本正常**。`leaf-detail-layout-v1` 已经统一过这一族（`main.detail-main` = `min(1120px, 100%)`），
  本版本**没有改它的任何取值**，只是把「布局族」这件事写成了机器可读声明（见 §D.2）。

> 证据：`research/_raw/secondary-page-layout-unification/geometry/before-after.md`（§2 对比表 `deal/017bdbc04e70/` 与
> `models/360zhinao-pro/` 各 6 行） · `research/secondary-page-layout-unification-self-audit.md`（§二 Q6）

### B.8 Archive（`/archive/` 索引页 + `/archive/<kind>/<id>/` 详情页）

**索引页 `/archive/` —— 原本正常。**

- **形态**：走 `renderModelsShell`（`none`）。
- **实测**：1440 档有 **5** 条说明：#0 `1380px`（`30..1410`，比例 **1.000**）、#1–#3 `1354px`（`43..1397`，比例 **0.980**）、
  #4 `1380px`（比例 **1.000**）。三条 1354px 是列表内部的次级说明行（自身有 26px 缩进），**在改动前后逐条相同**。
- **判定**：**原本正常**（`0.980` 不是缺陷；它既没被旧口径逮到，也不在新真值的 156 条窄说明里）。

**详情页 `/archive/<kind>/<id>/` —— 只是潜在风险（今天 0 个生产实例）。**

- **形态**：改动前该路由由 `renderModelsShell` 渲染、`<main>` **不带** `detail-main`。
  与 `/deal/<id>/`、`/models/<slug>/`（都带 `main.detail-main`）比，它**会**落进 1380px 的宽列而不是 1120px 的详情列。
- **实测**：三份日志 ended/restored 各 0 条 ⇒ 产物里该路由**0 页**（构建日志 `0 个档案详情页`）；
  因此**磁盘上没有任何一页可以拿去量宽度**。改动后 `<main id="main" class="detail-main">` 的实测只存在于
  `/models/<slug>/` 与 `/deal/<id>/`；`/archive/index.html`（wide 族）是 `<main id="main">`（不带 class）。
- **判定**：**只是潜在风险**，不是当前缺陷（无实例可量）。本版本按「替代性设计约束」闭合：
  常量 + 构建期接线 + 断言会响（见 §D.2 第三条）。

> 证据：`research/_raw/secondary-page-layout-unification/geometry/before-after.md`（§5.2 `archive/` 5 行） ·
> `.../t1/18-main-class-spotcheck.txt`（三行实测） · `.../t1/17-t1-summary.md`（§5 第 3 条：今天 0 个生产实例）

### B.9 Data Docs（`/docs/data/`，wide）—— **原本正常**

- **形态**：走 `renderModelsShell`（`none`）。
- **实测**：1440 档说明 **1380px** / 主数据区 **1380px**，比例 **1.000**；六档 `claim` 全部无违规码；
  该页有 **9** 条说明（全站第 3 多）。
- **判定**：**原本正常**。

> 证据：`research/_raw/secondary-page-layout-unification/geometry/before-after.md`（§2 对比表 `docs/data/` 6 行 · §5.1 条数行） ·
> `.../geometry/01-before-probe.log`（`docs/data/` 六档）

### B.10 §B 汇总

| 页面族 | 布局族 | 改动前的判定 | 关键读数（1440 档） |
| --- | --- | --- | --- |
| Directory（45 页） | wide | **真的有问题** | 452.81px / 1380px = **0.328** |
| Status（1 页） | wide | **真的有问题** | 452.81px / 1380px = **0.328** |
| Changes（1 页） | wide | **真的有问题** | 452.81px / 1380px = **0.328**（该页 13 条说明） |
| Feeds（1 页） | wide | **真的有问题** | 452.81px / 1380px = **0.328** |
| Plans（3 页） | wide | 原本正常 | 1380px / 1380px = **1.000**（`/plans/` 1328px ⇒ **1.039**） |
| Models 索引（1 页） | wide | 原本正常 | 1380px / 1380px = **1.000** |
| Models 详情（51 页） | detail | 原本正常 | 1120px，居中偏差 **≤ 1px** |
| Deal 详情（80 页） | detail | 原本正常 | 1120px，居中偏差 **≤ 1px**；无 `.snote` |
| Archive 索引（1 页） | wide | 原本正常 | 1380px（**1.000**）/ 1354px（**0.980**） |
| Archive 详情（0 页） | detail | **只是潜在风险** | 0 个生产实例，无法量宽 |
| Data Docs（1 页） | wide | 原本正常 | 1380px / 1380px = **1.000** |

> 证据：本节的逐族条目各自的证据文件（见 B.1–B.9） · 全站数字汇总见
> `research/_raw/secondary-page-layout-unification/geometry/before-after.md`（§1、§2） ·
> `research/_raw/secondary-page-layout-unification/geometry/truth-401.json`（401 条说明的分类真值：
> `caughtByOldCriteria 48` · `onlyNewTruth 108` · `alreadyFine 245`）

**另外一个必须写明的发现：旧口径只看得见其中一小半。**
改动前的 156 条窄说明里，**48 条**落在「文档序第一条」上（旧的 §22c 能逮到），
**108 条**在第 2 条及以后（旧口径完全看不见，因为 `<main>` 内 `.snote` ≥ 2 条的页面有 **105** 页、最多的一页 **13** 条）。
换句话说：**这次修的是 156 条，不是 48 条**。

| 读数 | before | after |
| --- | --- | --- |
| 说明总条数 | 401 | 401 |
| 有说明的页面 | 105 | 105 |
| `<main>` 内 `.snote` ≥ 2 条的页面 | **105** | **105** |
| 最多的一页有几条 | **13** | **13** |
| 比主数据区窄（< 0.85×列宽，1440 档） | **156 条** | **0 条** |
| 其中第 2 条及以后的 | **108 条** | **0 条** |
| 窄说明（390 档） | 0 条 | 0 条 |

> 证据：`research/_raw/secondary-page-layout-unification/geometry/before-after.md`（§5.1） ·
> `.../geometry/06-truth-401.log`（`改动前窄说明 156 条 → 改动后 0 条` ·
> `旧口径能逮到（第一条）48 条` · `只有新真值才覆盖（第 2 条+）108 条` · `本来正常（对照组）245 条`） ·
> `.../geometry/truth-401.json`（sha256 `46c28fa120a39ababf25826b86a08e57cf93e242baee8df264219e1d182e346e`）

---

## §C 根因

### C.1 直接根因：同一条规则在 8 个页面壳里各写一份，两种取值

改动前 `.snote` 的宽度规则**不在共享样式里**，而是每个页面壳在自己的局部 `<style>` 里复制一份：

- `renderStatusPage` / `renderChangesPage` / `renderFeedsPage` / `renderDirectoryPage` → `max-width: 70ch`（4 份）
- `renderPlansPage` / `renderApiPlansPage` / `renderPlansHubShell` / `renderModelsShell` → `max-width: none`（4 份）

`70ch` 在 12px 字体下算出来是 **452.81px**，而 `.wrap` 给出 1440 档正文容器 **1380px** ⇒ 比例 **0.328**。
`none` 的四个壳跟随容器 ⇒ 比例 **1.000**。

> 证据：`research/_raw/secondary-page-layout-unification/docs/01-shell-snote-map.txt`（8 行「行号 → 壳 → 取值」） ·
> `.../t1/01-before-snote-grep.txt` · `.../geometry/before-after.md`（§1.1 逐页 452.81px / 1380px）

### C.2 为什么「复制一份」必然漂移

`70ch` 与 `none` 这两个取值**没有一处共同的定义**：它们分散在 8 个互不引用的壳里，
所以「同一条规则、两种取值」这件事在代码里没有任何一处能被一眼看见 —— 只能靠真浏览器逐页量才发现。
本仓库里已经有一个反例：`.detail-main { width: min(1120px, 100%); margin-inline: auto; }` 一直只有**一处**定义
（改动前 `index.html:725`），所以详情族从头到尾没有漂移过。

> 证据：`research/_raw/secondary-page-layout-unification/audit/AUDIT-SUMMARY.md`（§一：`.detail-main` = 唯一出处，1 处声明 / 1 个规则体 / 0 份复制） ·
> `.../t1/01-before-snote-grep.txt`（改动前 `index.html:725` 就是 `.detail-main`）

### C.3 为什么详情族不受影响（对照组的作用）

同一个共享 `<style>`、同一套页面壳机制，详情族一直是好的 —— 差别只在「宽度有没有一个唯一出处」。
这条对照排除了「文档序 / 抽取顺序 / 作用域」这类猜测是主因：
它们是**机制**，机制在两边是一样的；不一样的是**取值有没有单点定义**。

> 证据：`research/_raw/secondary-page-layout-unification/geometry/before-after.md`（§2：`deal/*` 与 `models/*` 的
> before 列在改动前就是 `1120px / ratio 1.000`，与 after 列逐格相同） ·
> `.../audit/AUDIT-SUMMARY.md`（§一、§五 `local-shell-extraction-order`：抽取顺序已是被验证过的机制）

### C.4 次生根因：布局族没有机器可读的声明

产品侧已经事实上分成两族（宽数据页跟随 `.wrap`；叶子详情页居中收窄到 1120px），
但**没有任何一处代码/数据把这件事写下来**：
「哪个路由属于哪一族」只存在于各个渲染函数的实现里。
后果有两层：① 新页面壳可以随手复制一份宽度规则而不触发任何红灯；
② 门禁想断言「wide 族不该有 detail-main、detail 族必须有 detail-main」时，没有可读的族表。

> 证据：`research/secondary-page-layout-unification-self-audit.md`（§二 Q7：新页面不登记布局族 ⇒ `unclassified-layout` 红） ·
> `.../t1/17-t1-summary.md`（§1：`page-kinds.js` 新增 `LAYOUT_FAMILIES` + 18 个 kind 的 `layout` 字段是本次新增能力）

### C.5 门禁侧的根因：**判据量的是代理量**（四轮对抗的同一个病根）

产品侧的根因是 §C.1–C.4；**门禁侧的根因是另一件事，且它才是本版本最值钱的一条结论**：

| 轮次 | 判据量的是什么 | 被什么绕过（整轮 **EXIT=0**） |
| --- | --- | --- |
| **round 1**（round 1 复审；`review.md` §3） | `.snote` 的 **border-box**（盒宽） | `padding-right: calc(100% - 70ch)`：有字区域 **451px**、盒子仍是 **1380px**；条级覆盖只有 **105/401 = 26.2%**（每页只判文档序第一条） |
| **round 2**（round 2 复审；`review.md` 的 R2 段与 `adversary/**`） | **内容盒**（`textWidth`） | `display: grid; grid-template-columns: minmax(0, 70ch) 1fr`（`changes/` 13 条说明字迹只剩 **156–451.52px**，**只改一条 CSS、不动标记**）、`multicol`（单行最长 **447.3px**）、`float`（像素字迹 **411px**）、`overlay`（可见文字 **414px**）、伪元素承载正文（`字迹 null`） |
| **round 3**（t14 修复轮 3） | **内容盒 `textWidth` **∪** 逐行字迹宽**（**两条判据取并集，不是替换**） | 并集覆盖 **156 / 156**，A/C 误报 **0**；但作用域是**视口白名单**（只在 1440 / 1600 判）⇒ 见 round 4 |
| **round 4**（t19 修复轮 4） | 同上并集，作用域改成**物理前置条件** `min(主数据区, 页面列) > 现场 70ch`（现场 70ch = **452.81px**） | **R3-1 已闭合**：把 grid 窄化包进 `@media (max-width:760px)`，改前同产物整轮 **EXIT=0**（假绿），改后 **EXIT=1** 且命中 **6 条 `note-ink-narrow`** `[changes/#0 #1 #2 #4 #8 #12]`（最宽一行 **445.05 / 445.09 / 432 / 444 / 444 / 444.23**）。判据本身**未削弱**（见 §H.5） |

**round 3 为什么必须取并集（t11 的独立标定）**：单独用「行口径」会**漏掉 48 条** ——
那 48 条是「**行数 = 1 的单行说明 + 盒子被压窄**」（例 `category/agent/#1`：单行 **61.64px** / 盒宽 **452.81px**），
而现行的 `textWidth` 判据**已经全部咬到**它们。两条判据的覆盖面**不重合**：

| 码 | 管什么 | 覆盖（轮 4 复算） |
| --- | --- | --- |
| `note-narrow` | 内容盒被压窄 —— 盒量前置 `note.rendered`（盒宽 > 0 且高 > 0） | ①=**156**（盒宽全 **452.81**） |
| `note-ink-narrow` | 盒宽满宽但字迹铺不开：`rendered \|\| glyphRects > 0` **且** `lineCount ≥ 2` **且** `widestLine < 0.85 × min(主数据区, 页面列)` | ②=**108**，且 **② ⊆ ①** |
| **并集** | | **156 / 156**，A/C 误报 **0** |

另有 `note-hidden-text`（文本非空但无可见字形盒）。

**四轮对照（t22 的独立探针复算，8 种注入形态 × 四个档位）** —— 这张表是「每一轮各能咬住什么、漏什么」的唯一判据：

| 注入形态（路由） | @1440 R1/R2/R3/R4 | @760 R1/R2/R3/R4 | @360 R1/R2/R3/R4 | 谁漏了 |
| --- | --- | --- | --- | --- |
| `.snote{max-width:70ch}`（`status/`） | 2/2/2/2 | 2/2/2/2 | 0/0/0/0 | —（@360 无物理效果：70ch > 列宽） |
| `.snote{padding-right:calc(100% - 70ch)}`（`feeds/`）F1 原型 | **0**/8/8/8 | 0/8/8/8 | 0/0/0/0 | **R1 漏**（盒宽满宽） |
| `.snote{display:grid;grid-template-columns:minmax(0,70ch) 1fr}`（`student/`） | **0**/**0**/3/3 | 0/0/3/3 | 0/2/2/2 | **R1、R2 漏**（文字是直接文本节点，盒/内容盒都满宽） |
| 同上形态包进 `@media (max-width:760px)`（`changes/`） | 0/0/0/0 | **0/0/0/6** | 0/0/0/0 | **R3 在 760 漏**（视口白名单）、@1440 正确地不判 |
| `.snote{display:grid;grid-template-columns:200px 1fr}`（`plans/`） | 0/6/10/10 | 0/8/8/10 | 0/8/8/8 | R1 漏；@360 有 **2 条 ink-only 域外残余**（见 §J ⑨） |
| `.snote{transform:scaleX(0.35)}`（`vendor/ai360/`） | 3/**0**/1/1 | 3/0/0/2 | 3/0/0/0 | **R2 漏**（`clientWidth` 不变）；R1 因 `getBoundingClientRect` 含变换而咬中 |
| `.snote{white-space:nowrap}`（`need/free-tier/`） | 0/0/0/0（最宽一行 2470px） | 0/0/0/0 | 0/0/0/0 | 四条都不判**而且不该判**；命中 `note-clipped` + `page-overflow@*` |
| `.snote{font-size:0}`（`docs/data/` · `plans/`） | **0/0/0/0** | 0/0/0/0 | 0/0/0/0 | **四条全漏**（盒高 0 ⇒ 未渲染）→ **T22-F1**，由 **t24（轮 5）** 闭合，见 §J ⑩ |

**三条结论（都要写下来）**：

1. **前两轮修的是「覆盖面」（多量几条、多量几个视口），第三轮修的是「量纲」** ——
   把量纲从「盒子的某个代理宽度」换成「**文字最终被排成什么样**」，这一类漏洞才在**结构上**闭合。
2. **第三轮同时发现「新量纲不能替换旧量纲」—— 换掉就丢 48 条**：
   `note-ink-narrow` 与 `note-narrow` 覆盖的是**两类不同的坏法**，必须取**并集**才到 156/156。
   ⇒ **「换一个更好的判据」这件事本身，也要先证明它不丢旧覆盖面。**
3. **第四轮证明「作用域也不能靠视口白名单」**：同一条并集判据挂在「1440/1600」上是**枚举**，
   挂在「现场列宽 > 70ch」上才是**物理前置条件** —— 前者漏掉 ≤760 的媒体查询形态（R3-1），后者自动覆盖
   1440/1600/760 而把 360 正确地排除在外（理由见 §J ⑧）。

「布局类是否真的收敛」由 **t22** 独立复算（四轮对照表就是它的产物），本报告引用它的读数而不抢先下判。

> 证据：`research/_raw/secondary-page-layout-unification/review.md`（§§3 F1/F2 · §2 覆盖度量 · §R2-2 F-R2-1/F-R2-2 · §R2-3 · §R2-1.8） ·
> `.../adversary/forms-table.md` · `.../adversary/README.md` · `.../adversary/calibration-report.md` ·
> **四轮对照表**：`.../verify/T22-GATE-SELF-AUDIT.md`（§3.1 / §3.2 · §7 F4 断言数随轮次漂移） ·
> **R3-1 闭合**：`.../review/t20/T20-ROUND4.md`（§1.1 同一产物换口径 A/B · §1.2 独立物理探针 · §1.3 主张逐条核对） ·
> `.../t21/t21-summary.json`（step8 复现 · step9 不注入对照）

### C.6 与 §C.1–C.4 的关系

§C.1（8 份副本、两种取值）解释的是**页面上为什么会长出那根 452.81px 的柱子**；
§C.5 解释的是**门禁为什么四轮才把它钉死**。两者是同一个「唯一出处 / 单一量纲」纪律的两面：
产品侧要把宽度收成一处定义；门禁侧要把判据收到「**排版结果**」这个量纲上。
round 3 的标定补了一条：**新量纲与旧量纲取并集，不是替换**（换掉就丢 48 条）；
round 4 的标定再补一条：**作用域必须是物理前置条件，不能是视口白名单**（换掉就漏 ≤760 那一类）。

---

## §D 修复

### D.1 改了哪些文件

`git diff --stat 1f225d2`（工作区）给出的完整清单是 **7 个源文件**：

| 文件 | 增/删 | 性质 |
| --- | --- | --- |
| `scripts/lib/page-kinds.js` | **+119 / −0** | 布局族声明（新增字段与函数，既有数值一字未动） |
| `index.html` | **+9 / −0** | 共享 `<style>` 新增 8 行解释注释 + **唯一一条** `.snote` 规则（正文/脚本 0 改动） |
| `scripts/tools/build-local.js` | **+24 / −9** | 删除 8 条页面级 `.snote` 规则（**−8**）+ 档案详情 `mainClass` + 文件头样式纪律注释 |
| `scripts/lib/archive.js` | **+46 / −0** | `ARCHIVE_ENTRY_MAIN_CLASS` + `assertPageHonesty` 的整页布局约束 |
| `scripts/tools/archive-selftest.js` | **+58 / −0** | 新增独立小节 ⑦″（7 项断言，含 3 条牙） |
| `scripts/tools/seo-selftest.js` | **+59 / −0** | 新增小节 三′（6 项断言，含 2 条牙） |
| `scripts/tools/verify-site.js` | **+1109 / −0** | §22c 门禁（t2 落盘 + t7 修复轮） |

合计 `7 files changed, 1415 insertions(+), 9 deletions(-)`（其中 `scripts/tools/verify-site.js` 的 **+1109** 是门禁侧，
不是产品侧）。

> 证据：`research/_raw/secondary-page-layout-unification/t1/17-t1-summary.md`（§1 表格；该表逐文件给出增删行） ·
> `.../t1/08-scope-audit.txt`（改动清单与「未碰 verify-site.js / .github / package.json / 任何 *.json」） ·
> `.../diff/01-git-content-proof.txt`（A7 完整文件清单）

### D.2 三条产品侧改动

**① `.snote` 收成唯一出处（一条规则，两种取值变一种）。**

在 `index.html` 的共享 `<style>` 里新增**唯一一条**规则，**逐字**等于冻结串：

```
.snote { color: var(--mut); font-size: var(--fs-sm); line-height: 1.7; margin: 0 0 var(--s3); max-width: none; overflow-wrap: anywhere; }
```

同时删除 `build-local.js` 里 8 条页面级副本（4 条 `70ch` + 4 条 `none`）。
`.snote.chgwarn`（`/changes/` 的颜色修饰类，不含宽度）保留。

- **为什么这样改**：共享 `<style>` 在文档序上先于各页面壳的局部 `<style>`，删掉局部副本之后就是
  「一处定义、全站生效」—— 与 `.detail-main` 同一条纪律。
- **实测**：`build-local.js` 里 `.snote {` 规则残留 **0**；`index.html` 里 **1** 条；
  186 个产物页每页内联样式里冻结串**恰好 1 次**（`186/186`，`count != 1` 的页 **0**）；
  含 `.snote … max-width: 70ch` 的页 **0**；含字面量 `max-width: 70ch`（任何选择器）的页 **0**。
- `overflow-wrap: anywhere` 是本次**新增**的兜底（改动前那条 70ch 规则里没有），
  它挡的是「不可断长串把页面撑出横向滚动」—— 这是新增的**保护**，不是放宽。

> 证据：`research/_raw/secondary-page-layout-unification/t1/10-frozen-string-audit.txt`（冻结串逐字审计） ·
> `.../t1/07-dist-snote-audit.txt`（186/186 页恰好 1 次、70ch 页 0） ·
> `.../t1/11-no-other-snote-rules.txt`（`scripts/` 残留 0 · `index.html` 1 条 · `dist/changes/index.html` 只剩共享那条 + `.chgwarn`） ·
> `.../t1/12-final-verify-run.txt`（`build-local .snote 规则已清零`） ·
> `.../diff/04-before-after-compare.log`（样式行集合差 `+9 / −2` 的逐条清单）

**② 建立机器可读的布局族声明（`scripts/lib/page-kinds.js`）。**

新增 `LAYOUT_FAMILIES`（三族）与 18 个 kind 各自的 `layout` 字段：

| 族 | label | 归属的 kind | 实例数 |
| --- | --- | --- | --- |
| `wide` | Wide Data Page | home, collection, need, category, vendor, hub, status, changes, feeds, plans, alias, plans-hub, models-index, archive-index, data-docs（15 个） | **55** 页 |
| `detail` | Leaf Detail Page | deal, model, archive-detail（3 个） | **131** 页 |
| `prose` | Prose Page | 无（登记在无实例集里） | **0** 页 |

配套 `layoutOf(kind)`（未声明 → `null`）与 `assertLayoutDeclarations()`（返回问题字符串数组，空 = 全过；
检查「每个 kind 都有 layout」「取值落在已定义族内」「没有孤儿族」，另把「无实例族」做成显式登记
`LAYOUT_FAMILIES_WITHOUT_INSTANCES = new Set(['prose'])`：未登记的无实例族 ⇒ 红；登记了却有了实例 ⇒ 也红）。

- **为什么不影响既有行为**：`page-kinds.js` 的 `git diff` 删除行数为 **0** ⇒
  `FIXED_ROUTE_KINDS` / `ROUTE_PATTERNS` / `DEFAULT_FLOOR` / 各 kind 的 `textFloor` / `itemList` / `sitemap`
  的既有取值与行为一字未动，只**新增**字段与函数。
- **实测**：`assertLayoutDeclarations()` 返回空数组（`kinds 18 layouts ok`）；产物侧 186/186 页全部可解析出布局族，
  `unclassified-layout` **0**。

> 证据：`research/_raw/secondary-page-layout-unification/t1/17-t1-summary.md`（§1、§2 第 5 项、§5 第 1 条） ·
> `.../t1/12-final-verify-run.txt`（`kinds 18 layouts ok`） ·
> `.../teeth/README.md`（§3：186 页 wide 55 / detail 131 / other 0 · §4.2 布局族读数表）

**③ Archive Detail 接入统一内容列（替代性设计约束）。**

`scripts/lib/archive.js` 导出 `ARCHIVE_ENTRY_MAIN_CLASS = 'detail-main'`，
`build-local.js` 的档案详情渲染调用点传 `mainClass: archiveLib.ARCHIVE_ENTRY_MAIN_CLASS`，
并在 `assertPageHonesty(html, { kind: 'archive-entry' })` 里加**整页**布局约束：
恰好 1 个 `<main>` 且其 class 含 `detail-main`（缺失 / 多个 / 无 class 都返回问题 ⇒ 构建期硬失败）。

- **为什么是「替代性」**：今天该路由 **0 个生产实例**，磁盘上没有任何一页可以量宽。
  所以判据是「常量值 + 构建期接线 + 断言会响」三件事，`archive-selftest.js` 的 ⑦″ 里断言文案明写
  「今天无生产实例，这是替代性设计约束」。
- **实测**：`/models/deepseek-v3.2/` 与 `/deal/<id>/`（detail 族）是 `<main id="main" class="detail-main">`；
  `/archive/index.html`（wide 族索引页）是 `<main id="main">`（不带 class）；
  archive-selftest `76 项通过，0 项失败`（⑦″ 7 项含 3 条牙）。

> 证据：`research/_raw/secondary-page-layout-unification/t1/18-main-class-spotcheck.txt` ·
> `.../t1/17-t1-summary.md`（§5 第 2、3 条） · `.../t1/12-final-verify-run.txt`（archive-selftest 76/76）

### D.3 门禁侧改动（**轮 6 冻结读数**）

门禁侧是 `scripts/tools/verify-site.js` 的新增一节 §22c（轮 2 落盘时 **+1109 / −0**；五轮修复后该文件当前
sha256 = **`2cbc160dc64f8ade513824065b42d8e38ad7c72dd417cb418bde8d5526b44a5e`** / 522527 B / 8058 行）。
它把「页面级说明与主数据区同轴」做成了可判红的一节：全站 186 页的真浏览器几何扫描 + 逐条 401 条说明的**并集**判据 +
布局族一致性 + 冻结串锚点守卫 + 变异牙 + M0 前置反证 + **未渲染说明判据与上界断言**。

**轮 6 读数（判据 sha `2cbc160d…`；由 t28 落盘、t29 复审 **pass**）**：

| 项 | 轮 6 读数 | 出处 |
| --- | --- | --- |
| `--dir=dist`（绿轮） | exit **0** · **852 项 / 失败 0** · `layoutViolations 0` · 条级容器 `layoutNotes` **401 条**（@1440）/ **401 条**（@1600）· 每条都有读数 · 未渲染 **1 条**（= `<noscript>` 1 条 `[plans/coding/#1]` + `note-unrendered` **0 条**） | `…/teeth/_scratch/r6-green.json` · `…/teeth/T24-ROUND5.md` · `…/review/t26/T26-ROUND5.md` |
| `--dir=dist.baseline`（M0 反证） | exit **1** · **852 项 / 失败 36** · 窄柱并集 **156 条 / 48 页**（盒宽全 **452.81**）· `note-narrow 156` + `note-ink-narrow 108`（**② ⊆ ①**）· **新判据 0 命中** · 对照组零误报 —— 失败的 **33 → 36** 全部是 **M13 锚点类**（baseline 无冻结串 ⇒ 按纪律红，与加 M11/M12 同构） | `…/teeth/_scratch/r6-m0.json` · `…/teeth/T24-ROUND5.md`（诚实项①） · `…/review/t26/T26-ROUND5.md`（读数复核） |
| 与独立真值对账 | `--expect=green` **pass**（0 条 / 0 页）；`--expect=baseline` **pass**（156 / 48 逐条相同、漏判 0、误报 0） | `…/t21/geometry/gate-vs-truth-*.json`（轮 4 基线）+ 轮 5 / 轮 6 由 t26 / t29 复核同值 |\n| **轮 6 换掉了什么** | ④ 判据**删掉** `&& !note.noscriptSubtree`（豁免只剩「**可见文本长度为 0**」；`<noscript>` 降为**诊断量**）· 上界断言的两桶（`textLength === 0` ∪ `note-unrendered`）改为**显式不相交**并钉「交集 0 · 并集 = `unrenderedNotes` · 未归类 0」· 上界断言因语义变更**改名 1 条**（已逐字登记，非改名规避） | `…/teeth/T28-ROUND6.md` · `…/review/t29/T29-ROUND6.md` |\n| **轮 6 反证（标记级豁免键已死）** | `font-size:0` + 给 `plans/` **全部 12 条**说明各插一个**空** `<noscript></noscript>`：**改前 binary EXIT=0 / 852 项 / 0 失败**（轮 5 的免判路径）→ **改后 EXIT=1 / 852 项 / 4 条失败全部含 `note-unrendered`**；条级读数 `textLength>0 · glyphRects=0 · noscriptSubtree=true · codes=[note-unrendered]` ⇒ **标记在、照样咬** | `…/review/t29/T29-ROUND6.md`（A/B） · `…/teeth/_scratch/r6-empty-noscript-report.json` · `…/teeth/T28-ROUND6.md` |
| CI 口径 | `check-ci-consistency.js --expect-checks=38` → **38 项 / 失败 0** · exit 0 | `…/teeth/_scratch/r6-ci.log` |
| 字节对账（产物零变化） | dist **303 个文件**跑前/跑后 sha256 **0 差异** · 非 HTML **117/117** · HTML **186/186** 去 `<style>` 后逐字节相同 · 样式块行集合差 **+9 / −2** | `…/teeth/_scratch/r6-dist-{before,after}.txt` · `…/teeth/T24-ROUND5.md` |
| 本轮成本 | §22c 导航次数 **631**（轮 4 = 630；差 1 = M13 那一页） | `…/teeth/T24-ROUND5.md`（诚实项③） |
| **未削弱** | 0.85 与 `lineCount >= 2` 逐字未改 · 运行期 **848 → 852 缺失 0（新增 4）** · 静态 `check(` **481 → 483**（removed 0）· §22b 切片 37318 B / sha16 `077dc51ef68af7fd` **逐字节相同** · 新增 118 行**零像素/颜色 API** | `…/teeth/T24-ROUND5.md`（不变量 8/8） · `…/review/t26/T26-ROUND5.md`（未削弱 + 无像素） |
| **反证（T22-F1 闭合）** | 裸 `.snote{font-size:0}` 注入 scratch：改后整轮 **EXIT=1 / 852 项 / 5 条失败全部含 `note-unrendered`**（@1440 · @1600 · 上界断言 · @760/@360 各 12 条）；**同产物改前 binary EXIT=0 / 848 项 / 0 失败**（假绿复现）；同副本不注入 **EXIT=0** | `…/review/t26/T26-ROUND5.md`（T22-F1 闭合 · 独立反证） · `…/teeth/T24-ROUND5.md`（反证） |

**明确不在本报告结论里的东西**：判据的**最终完备性**裁定（t20 复审 round 4、t22 门禁侧 self-audit、t26 复审 round 5 各自登记，报告只引用它们的读数）；
以及发布后的线上读数（见 §I）。

> 证据：`research/_raw/secondary-page-layout-unification/teeth/T24-ROUND5.md`（判据 ④ / 上界断言 / 反证 / 读数 / 不变量 8/8 / 诚实项） ·
> `.../review/t26/T26-ROUND5.md`（**复审 verdict=pass**：独立反证 · 排除规则子树语义 · 上界断言真的会咬 · 未削弱 + 无像素 · 读数复核 · 残余面） ·
> `.../teeth/_scratch/r6-green.json` · `.../teeth/_scratch/r6-m0.json` · `.../teeth/verify-site.t24.diff` · `.../teeth/_backup/verify-site.pre-t24.bak` ·
> `.../teeth/T19-ROUND4.md` · `.../review/t20/T20-ROUND4.md` · `.../verify/T22-GATE-SELF-AUDIT.md`（前三轮的对应读数）

### D.4 为什么不影响数据与业务（机器证据，不是承诺）

**结论：数据 / 文案 / 路由 / 结构化数据 0 变化。** 四条相互独立的证据：

| # | 证据 | 读数 |
| --- | --- | --- |
| 1 | 数据文件在改动窗口内零 diff（提交区间、工作区 vs 索引、索引 vs HEAD 三处都查） | 四类查询结果**全为空** |
| 2 | 非 HTML 文件逐个 sha256 | **117 / 117** 相等 |
| 3 | HTML 页剥掉**全部** `<style>` 块后正文逐字节比对（`Buffer.compare`，不是先解码再比） | **186 / 186** 相同，正文字节差合计 **0** |
| 4 | 样式块**去重行集合**差 | **+9 / −2**，逐行看只有「`.snote` 规则 + 解释注释」 |

第 4 条的 11 行逐条内容：**新增 9 行** = 1 条 `.snote` 规则 + 8 行解释注释；
**删除 2 行** = 两条重复的 `.snote` 副本（`max-width: none` / `max-width: 70ch` 各一条）。
结构化数据（JSON-LD）在正文里 ⇒ 随第 3 条一并证明为逐字节相同。
路由（`sitemap` 183 条、186 个 HTML 页、80 个详情页、0 个档案详情页）在改动前后一致。

> 证据：`research/_raw/secondary-page-layout-unification/diff/01-git-content-proof.txt`（A2–A5 全空 + A8/A9 数据 sha256） ·
> `.../diff/03-nonhtml-sha256.log`（117/117） · `.../diff/04-before-after-compare.log`（186/186 + `+9 / −2` 逐条） ·
> `.../verify/byte-compare.json`（t4 用**自写**的剥样式状态机独立复算 303 文件，不引用 t3 的脚本） ·
> `.../t1/13-dist-vs-baseline.txt`（added 0 / removed 0 / unchanged 117 / changed 186；归一化后 186/186 相同） ·
> `.../t1/03-build-local.txt`（sitemap 183 条 · 详情页 80 个 · `0 个档案详情页`）

**业务侧的口径**：本版本只改**宽度来源**与**布局族的声明方式**，
没有改颜色 / 字号 / 行高 / 圆角 / 间距 / 文案 / 卡片设计 / 任何路由 / 任何 JSON-LD。
页面上唯一的可见变化是「页面级说明不再在 452.81px 的柱子里折行」——
它在 1440 档从 0.328 变成 1.000，**只会让页面变矮、不会变高**（59 个路由 @1440：47 页变矮、12 页不变、**0 页变高**；
差值 min `−224px` / median `−122px` / max `0`）。

> 证据：`research/secondary-page-layout-unification-self-audit.md`（§二 Q2/Q3/Q4） ·
> `.../verify/height-overflow.json`（59 路由 × 2 产物 × 3 档）

### D.5 本次**明确保留**的局部窄宽与**本次不动**的重复规则

**保留（有实测比例与理由）—— 完整口径见 §19/§20：**

| 规则 | 所在位置 | 实测比例 | 裁定 |
| --- | --- | --- | --- |
| `.lsum li small { max-width: 34ch }` | `build-local.js:2717` | 占所在 `<li>` 宽 **0.868 / 0.895 / 0.902**（min/median/max）；占 `.lsum` 容器宽 **0.105 / 0.136 / 0.146** | **保留，不是缺陷** |
| `.pdetailbody { max-width: 72ch }` | `build-local.js:1516` | 占所在 `<td>` 单元格宽 **0.3377** | **保留，登记 P1 / DEFERRED**（理由与未来两种候选处置见 §J ①） |

**本次不动（仍是多个页面壳各自复制一份）**：`.ph2`（9 处声明 / 5 个规则体 / 复制多出 4 份）·
`.plist`（8 / 2 / 6）· `.stop`（15 / 3 / 12）· `.cstop`（3 / 3 / 0）· `.ptable*`（42 / 22 / 20）。
其中只有 `.plist` 与 `.ptable*` 含宽度声明，且 `.plist` 的 4 份副本**逐字相同**（`max-width: none`）——
四份相同取值不产生漂移；真正的漂移来自「同一条规则、两种取值」（`.snote` 正是如此）。

> 证据：§19/§20 的完整证据链见下一节；本节只给结论指引。
> `research/_raw/secondary-page-layout-unification/audit/AUDIT-SUMMARY.md`（§一、§三、§五） ·
> `.../verify/retained-narrow.log` · `.../verify/pdetail-followup.log`

---

## §19–§20 审计（t9 只读审计）

> 本节全部读数来自 `research/_raw/secondary-page-layout-unification/audit/**`。
> 审计是**只读**的：扫描 `index.html` + `scripts/**` 共 **215** 个文件，未改动任何生产源码
> （接手时与结束时 `git status` 逐字相同）。

### 19.1 六个类名的重复度

| 类名 | 产物样式里的声明处数 | 不同规则体 | 复制多出来的份数 | 含宽度声明 | 判定 | 本次是否处理 |
| --- | --- | --- | --- | --- | --- | --- |
| `.snote` | 2 | 2 | 0 | 是 | 唯一出处（含宽度的 1 条；另 1 条是不含宽度的修饰类 `.snote.chgwarn`） | **是** |
| `.ph2` | 9 | 5 | 4 | 否 | 同一条规则被复制（多处逐字相同） | 否 |
| `.plist` | 8 | 2 | 6 | 是 | 同一条规则被复制（**4 份都带 `max-width: none`，取值一致**） | 否 |
| `.stop` | 15 | 3 | 12 | 否 | 同一条规则被复制（多处逐字相同） | 否 |
| `.cstop` | 3 | 3 | 0 | 否 | 同一类名的多处不同规则（各自页面壳独有） | 否 |
| `.detail-main` | 1 | 1 | 0 | 是 | 唯一出处（本次之前就已经是） | 否 |

**逐字复制的具体组**（审计逐条给出文件:行）：

- `.stop` ×5（`.stop` / `.stop h1` / `.stop .meta` 各 5 份，分布在 status / plans / api-plans / plans-hub / models）——**无宽度声明**
- `.ph2` ×4 —— 无宽度声明；另有 4 处带父级作用域的变体（`.pchanges .ph2` / `.pplandeals .ph2` / `.phubsec .ph2` / `.asec .ph2`）
- `.plist` ×4 —— **含宽度声明**（`max-width: none`，四处逐字相同）
- `.plist b` ×4 —— 无宽度声明

> 证据：`research/_raw/secondary-page-layout-unification/audit/AUDIT-SUMMARY.md`（§一及其逐组展开） ·
> `.../audit/layout-rule-inventory.json`

### 19.2 `max-width` 普查（§20 的第一半）

合计 **37 条** `max-width` 声明：

- 按分类：页面容器 **5** · 局部组件 **8** · 响应式断点 **13** · 阅读列 **7** · 其它 **4**
- 按单位：`px` **20** · keyword **10** · `ch` **5** · `em` **2**
- 按来源：rule **19** · media-condition **13** · media-inner-rule **5**

**`ch` 单位的全部 5 条**（这是「阅读列」这个词在仓库里的全部落点）：

| # | 位置 | 声明 | 分类 |
| --- | --- | --- | --- |
| 1 | `scripts/tools/build-local.js:1516` | `.pdetailbody → max-width: 72ch` | 阅读列 |
| 2 | `scripts/tools/build-local.js:2717` | `.lsum li small → max-width: 34ch` | 局部组件 |
| 3 | `scripts/tools/verify-site.js:6814` | `.snote ~ .snote → max-width: 70ch` | 其它（**测试夹具**，不是产物样式） |
| 4 | `scripts/tools/verify-site.js:6817` | `.snote:not(:first-of-type) → max-width: 70ch` | 其它（同上） |
| 5 | `scripts/tools/verify-site.js:6820` | `.snote → max-width: 70ch` | 其它（同上） |

**`%` 单位的 `max-width`：0 条**（本仓库没有任何 `%` 单位的 max-width 限宽）。

**独立对照（差额必须为 0）**：裸文本正则数 `max-width:` ↔ 解析器五个账目桶（注释 / 规则声明 / @media 条件 / 声明片段）：

| 文件 | 裸文本出现次数 | 注释里 | 规则声明 | @media 条件 | 声明片段 | 未解释差额 |
| --- | --- | --- | --- | --- | --- | --- |
| `index.html` | 19 | 1 | 12 | 6 | 0 | **0** |
| `scripts/lib/page-kinds.js` | 2 | 2 | 0 | 0 | 0 | **0** |
| `scripts/tools/build-local.js` | 15 | 0 | 8 | 7 | 0 | **0** |
| `scripts/tools/verify-site.js` | 12 | 4 | 4 | 0 | 4 | **0** |

⇒ 「解析器漏掉的 max-width」为 **0**。

> 证据：`research/_raw/secondary-page-layout-unification/audit/AUDIT-SUMMARY.md`（§二） ·
> `.../audit/narrow-width-census.json`

### 19.3 明确保留的局部窄宽（§20 的第二半）

`retained-narrow-widths.json` 登记 6 条，逐条给「保护什么 / 为什么可以保留」：

| 规则 | 位置 | 保护什么 | 为什么可以保留 |
| --- | --- | --- | --- |
| `.lsum li small { max-width: 34ch }` | `build-local.js:2717` | 目录页顶部「本页摘要条」里每一项的第二行小字（**计数卡片的副标题**） | 盒子本来就只有一个卡片宽；页面级说明由共享规则给宽，不受它影响；去掉会把这行小字拉成整张卡片宽、摘要条每格高度参差 |
| `.pdetailbody { max-width: 72ch }` | `build-local.js:1516` | `/plans/coding/` 表格**展开行**的详情正文 | 是**表内展开区**而不是页面正文列；服务「字段: 值」清单，72ch 是行长可读上限；父级就是那个 `<td>` |
| `.ptable thead th:nth-child(2), .ptable tbody td:nth-child(2) { max-width: 10em }` | `build-local.js:1575` | ≤760px 下宽表**第二列粘性单元格** | 只在 `@media (max-width: 760px)` 内生效；粘性列必须有有限宽否则横向滚动失效；限的是单元格不是页面内容列 |
| `.ptable … th:first-child { width: 6.5em }` | `build-local.js:1572,1791,2036` | 同一张宽表第一列在窄屏下的列宽 | 同上（两列粘性是一对）；不是页面内容列 |
| `.search { max-width: 440px }` | `index.html:284` | 顶栏搜索框最大宽度 | 控件尺寸，与页面内容列无关；≤940px 另有 `max-width: none` 覆盖它 |
| `.cmpchip { max-width: 210px }` | `index.html:968` | 对比条里每个已选条目的标签（配 `overflow:hidden; text-overflow:ellipsis`） | 省略号生效的前提；去掉会撑破对比条并造成页面级横向滚动 |

**实测比例（t4 的独立浏览器探针，1440×900，`retained-narrow.log`）**：

- `.lsum li small`：覆盖 **43 页 / 141 个元素**；盒宽 **144.83..201.61px**（`max-width` 计算值恒为 **201.609px** = 34ch @11px）；
  相对所在 `<li>` 宽 **0.868129 / 0.894737 / 0.901614**（min/median/max）；
  行数（当前）单行 **74** / 两行 **59** / 三行以上 **8**；把 `max-width` 临时置 `none` 后单行 **141** / 两行 **0** / 三行以上 **0**（**67 个**会从多行收成一行）；
  字迹填满盒子（字迹/盒宽 ≥ 0.95）**133 / 141**。
- `.pdetailbody`：`/plans/coding/` 上真的点开「详情」按钮后量到（`expandMethod = clicked:button:详情`）；
  可见 **1** 个，盒宽 **465.75px**（`max-width` 计算值等于盒宽），所在 `<td>` **1379px**，比例 **0.337745**；
  把 `max-width` 临时置 `none`：盒宽 **1356px**，`p` 从 **2 行 → 1 行**、`ul.pev` 从 **10 行 → 8 行**、最长字迹 **445px → 869.83px**。
- `.snote.aliasnote`（3 个别名页，9 条）：全部与 `<main>` 同轴 = **true**；会被判 `note-narrow` 的 = **false**。

> 证据：`research/_raw/secondary-page-layout-unification/audit/AUDIT-SUMMARY.md`（§三） ·
> `.../audit/retained-narrow-widths.json` · `.../verify/retained-narrow.log` · `.../verify/pdetail-followup.log` ·
> `.../verify/retained-narrow.json` · `.../verify/pdetail-followup.json`

### 19.4 结论（`conclusion.json`）

| 检查 | 结果 |
| --- | --- |
| 「页面级说明被 `ch` 限宽」的同缺陷残留 | **0 处** |
| 其中被排除的测试夹具命中 | **3** 处（`verify-site.js:6814/6817/6820` 的变异载荷 —— 是牙不是残留） |
| 「阅读列」类选择器上仍有 `ch` 限宽（§20 允许的局部保留） | **1** 处（`.pdetailbody` 72ch） |
| 同义规则扫描 | **PASS：0 处新增同义规则** |
| `.snote` 的规则定义有几处 | 唯一出处（`index.html:734`，共享 `<style>`） |
| `.detail-main` 的规则定义有几处 | 唯一出处（`index.html:725`，共享 `<style>`） |
| 有没有第二条规则再给 `.snote` 设宽度 | 没有（`index.html:734` 的 `max-width: none` 之外无第二条） |
| 本次是否引入第三/第四套同义规则（例如「居中列」的第二种写法） | **0 处** —— 本次没有新增任何居中/限宽机制 |
| 未分类条目 | **0** |

### 19.5 本次**故意不动**的三类东西（`notTouched`，附理由）

1. **`ph2-plist-stop-cstop-ptable`**：这五组类名仍是多个页面壳各自复制一份。
   理由：本次目标是**减少布局漂移风险**，不是「代码更漂亮」。这五组里只有 `.plist` 与 `.ptable*` 带宽度声明，
   而 `.plist` 的四处逐字相同（`max-width: none`）—— 相同取值不产生漂移。
   把它们一并收口需要改动 5 个页面壳的样式抽取顺序与作用域（选择器优先级、`${extraCss}` 注入点都要重新论证），
   收益是「更整齐」，风险是**新的、没有被本次变异牙覆盖的回归面**。
2. **`local-shell-extraction-order`**：「共享 `<style>` → 页面局部 `<style>`」的抽取顺序与会话作用域。
   理由：它已经是被验证过的机制（`.detail-main` 一直靠它工作）；改它会牵动全部 186 个页面，超出「布局漂移治理」的范围。
3. **`verify-site-fixtures`**：`verify-site.js` 里的 CSS 文本（变异锚点 / 断言载荷，如冻结串、`.detail-main` 的三处 anchor）。
   理由：它们是**测试工具的输入**，不是产物样式定义；它们**必须**逐字引用产品规则（否则变异就锚不住），
   把它们「去重」等于把变异牙拆掉。审计把它们单独归类（`fixtureMentions`），不计入重复度。

> 证据：`research/_raw/secondary-page-layout-unification/audit/AUDIT-SUMMARY.md`（§四、§五） ·
> `.../audit/conclusion.json` · `.../audit/layout-rule-inventory.json`（`notTouched` 字段）

---

## §E Before/After（真浏览器读数）

> ✅ **本节的产物侧数字不受三轮门禁修复影响**：t2 / t7 / t14 三次修复都只动 `scripts/tools/verify-site.js`，
> **产物自 t1 之后没有再改动**（t21 已复算并证明，见 §D.4 / §H）。所以本节与 §F 的读数是**最终证据**；
> §D.3 / §G / §H 的门禁读数才是过渡态。

改动前 = `dist.baseline`（commit `1f225d2` 的忠实产物），改动后 = `dist`（T1 构建）。
量测由**独立探针** `geometry/wide-probe.cjs` 完成：它**不 require `scripts/tools/verify-site.js`**，
自己起静态服务、自己量、自己判；样本 id/slug 现场从产物 + `deals.json` / `models.json` / `sitemap.xml` 推导（不写死）。
`ratio` = 说明宽 ÷ `min(主数据区宽, 页面列宽)`（**1.000 = 与数据区等宽的理想值**；`—` = 该页没有页面级说明）。
`overflow` = `documentElement.scrollWidth / clientWidth`（`0（x/x）` = 不溢出）。

### E.1 代表性路由 @1440×900

| 页面 | viewport | before 说明宽 | after 说明宽 | 主数据区宽 | ratio | overflow |
| --- | --- | --- | --- | --- | --- | --- |
| `/student/` | 1440×900 | **452.81px** | **1380px** | 1380px | 0.328 → **1.000** | 0（1440/1440） → 0（1440/1440） |
| `/developer/` | 1440×900 | **452.81px** | **1380px** | 1380px | 0.328 → **1.000** | 0（1440/1440） → 0（1440/1440） |
| `/free-api/` | 1440×900 | **452.81px** | **1380px** | 1380px | 0.328 → **1.000** | 0（1440/1440） → 0（1440/1440） |
| `/need/edu-identity/` | 1440×900 | **452.81px** | **1380px** | 1380px | 0.328 → **1.000** | 0（1440/1440） → 0（1440/1440） |
| `/status/` | 1440×900 | **452.81px** | **1380px** | 1380px | 0.328 → **1.000** | 0（1440/1440） → 0（1440/1440） |
| `/changes/` | 1440×900 | **452.81px** | **1380px** | 1380px | 0.328 → **1.000** | 0（1440/1440） → 0（1440/1440） |
| `/feeds/` | 1440×900 | **452.81px** | **1380px** | 1380px | 0.328 → **1.000** | 0（1440/1440） → 0（1440/1440） |
| `/category/agent/`（真实现扫） | 1440×900 | **452.81px** | **1380px** | 1380px | 0.328 → **1.000** | 0（1440/1440） → 0（1440/1440） |
| `/vendor/ai360/`（真实现扫） | 1440×900 | **452.81px** | **1380px** | 1380px | 0.328 → **1.000** | 0（1440/1440） → 0（1440/1440） |
| `/plans/coding/` | 1440×900 | 1380px（本来就是 `none` 那一组） | 1380px | 1380px | 1.000 → 1.000 | 0（1440/1440） → 0（1440/1440） |
| `/deal/017bdbc04e70/`（真实 id） | 1440×900 | （无页面级说明） | （无页面级说明） | 1120px（`.detail-main`） | — | 0（1440/1440） → 0（1440/1440） |
| `/models/360zhinao-pro/`（真实 slug） | 1440×900 | 1120px | 1120px | 1120px（`.detail-main`） | 1.000 → 1.000 | 0（1440/1440） → 0（1440/1440） |
| `/`（首页） | 1440×900 | （无页面级说明） | （无页面级说明） | 1380px | — | 0（1440/1440） → 0（1440/1440） |

> 证据：`research/_raw/secondary-page-layout-unification/t3/README.md`（§4.1 代表性几何表） ·
> `.../geometry/before-after.md`（§2 完整对比表：22 个路由 × 6 档 = 132 行，逐页逐档）

### E.2 一条页面的六档全展开：`/status/`（wide 族的代表）

| 页面 | viewport | before 说明宽 | after 说明宽 | 主数据区宽 | ratio | overflow |
| --- | --- | --- | --- | --- | --- | --- |
| `/status/` | 1440×900 | 452.81px | **1380px** | 1380px | 0.328 → **1.000** | 0（1440/1440） → 0（1440/1440） |
| `/status/` | 1280×800 | 452.81px | **1240px** | 1240px | 0.365 → **1.000** | 0（1280/1280） → 0（1280/1280） |
| `/status/` | 1024×768 | 452.81px | **984px** | 984px | 0.460 → **1.000** | 0（1024/1024） → 0（1024/1024） |
| `/status/` | 760×800 | 452.81px | **728px** | 728px | 0.622 → **1.000** | 0（760/760） → 0（760/760） |
| `/status/` | 390×800 | 358px | 358px | 495.39px | 1.000 → 1.000 | 0（390/390） → 0（390/390） |
| `/status/` | 360×800 | 328px | 328px | 495.39px | 1.000 → 1.000 | 0（360/360） → 0（360/360） |

**读法**：缺陷只在**桌面档**显形（760 档还能看出 0.622）；到了 390/360 档表格进入横向滚动容器、
说明本来就铺满可用宽，所以在改动前后**都是 1.000** —— 这也解释了为什么「手机上看不出来」不等于「没问题」。

> 证据：`research/_raw/secondary-page-layout-unification/geometry/before-after.md`（§2 `status/` 六行 · §3 after 完整矩阵对应行） ·
> `.../geometry/01-before-probe.log`（`status/` 六档） · `.../geometry/02-after-probe.log`（`status/` 六档）

### E.3 全站汇总（before → after）

| 读数 | before | after |
| --- | --- | --- |
| 扫描页数 | 186 | 186 |
| 有违规码的页面 | **48** | **0** |
| `note-narrow`（页 / 条） | **48 / 156** | **0 / 0** |
| `note-axis`（页） | **48** | **0** |
| `note-clipped` | 0 | 0 |
| `page-overflow@1440` | 0 | 0 |
| `page-overflow@390` | 0 | 0 |
| `page-overflow@1600` | 0 | 0 |
| 样本集违规条数（21 页 × 6 档） | **52** | **0** |
| 冻结串「每页恰好 1 次」 | **0 / 186** | **186 / 186** |

> 证据：`research/_raw/secondary-page-layout-unification/geometry/before-after.md`（§1） ·
> `.../geometry/01-before-probe.log`（末行） · `.../geometry/02-after-probe.log`（末行） ·
> `.../verify/height-overflow.json`（`overflow.before/after` 三档全 0） ·
> `.../t3/README.md`（§7.3 P1 / P5-P6）

### E.4 401 条说明的逐条 before → after

401 条里**宽度变化 156 条**（全部是「窄 → 同轴」）、**未变 245 条**。

| 分类 | 条数 | 含义 |
| --- | --- | --- |
| `caughtByOldCriteria` | **48** | 改动前是**第一条**说明且窄 —— 旧口径唯一逮到的那一批（页数 48） |
| `onlyNewTruth` | **108** | 改动前窄、但**不是第一条** —— 旧口径在形态上无法表达的那一批 |
| `alreadyFine` | **245** | 改动前本来就不窄的**对照组**（其中 `archive/` 5 条：1354–1380px / 0.980–1.000） |

不变量（机器核对，全部 `true`）：`48 + 108 == 156` · `after 窄 == 0` · `48 + 108 + 245 == 401` ·
**wide-probe 另一次独立扫描报的 48 页 `note-narrow` 与这里的 `caughtByOldCriteria` 页集合逐条一致** ·
`archive/` 的 5 条仍在 `alreadyFine` 里。

- 逐条表落点：`geometry/before-after.md` §5.2（多说明页面逐条）/ §5.3（全部 401 条 by 页面）。

> 证据：`research/_raw/secondary-page-layout-unification/t3/README.md`（§4.3） ·
> `.../geometry/truth-401.json`（sha256 `46c28fa120a39ababf25826b86a08e57cf93e242baee8df264219e1d182e346e`） ·
> `.../geometry/06-truth-401.log` · `.../geometry/before-after.md`（§5.1 / §5.2 / §5.3）

---

## §F Regression

> ✅ 与 §E 同理：本节是**产物侧**读数，不受三次门禁修复影响（`verify-site.js` 之外没有源码改动）。

### F.1 首页

| 读数 | before | after | 出处 |
| --- | --- | --- | --- |
| 页面级说明 | 无（首页本来就没有 `.snote`） | 无 | `.../geometry/before-after.md`（§2 `/` 六行） |
| `main` 宽（1440 / 1280 / 1024 / 760 / 390 / 360） | 1380 / 1240 / 984 / 728 / 358 / 328 | 同左（逐档相同） | 同上 |
| 横向溢出（六档） | 0 | 0 | 同上 |
| 卡片数（`--compare`） | 50 | 50 | `.../gate/steps/48-regression-verify-baseline-compare.txt`（§12） |
| 首屏完整可见（`--compare`） | 6 | 6 | 同上 |
| 覆盖的优惠条数（`--compare`） | 80 | 80 | 同上 |

⚠️ **口径必须写明**：`--compare` 的基线是 `research/_raw/ours-baseline/verify.json`（生成于 `2026-09-29T12:05:42.914Z`），
**不是**本次的 `dist.baseline`。所以它报的 `页高 4589px → 4787px`（容差 15%）跨了多个版本，**不能**当作「本次改动让首页变高」的证据；
本次改动对首页的**同版本**证据是上面三行的 before/after 几何（首页没有 `.snote`，逐档读数相同）。

> 证据：`research/_raw/secondary-page-layout-unification/gate/steps/48-regression-verify-baseline-compare.txt`（§12 六项 + 基线行 + `✅ 验收 848 项，失败 0 项`） ·
> `.../geometry/before-after.md`（§2 `/` 六行） · `.../t3/README.md`（§4.1 末行 `/`）

### F.2 Plans（`/plans/` · `/plans/coding/` · `/plans/api/`）

| 读数 | before | after | 出处 |
| --- | --- | --- | --- |
| `/plans/coding/` 说明 / 主数据区（1440） | 1380px / 1380px · ratio 1.000 | 同左 | `.../geometry/before-after.md`（§2） |
| `/plans/api/` 说明 / 主数据区（1440） | 1380px / 1380px · ratio 1.000 | 同左 | 同上 |
| `/plans/` 说明 / 主数据区（1440） | 1380px / 1328px · 显示 ratio 1.039 | 同左（逐档相同） | 同上 |
| `/plans/coding/` 平台筛选 | — | 20 个 chip 的可见集合都等于数据（20 个平台逐个对账） | `.../gate/steps/47-real-browser-acceptance-verify-site-js.txt` |
| `/plans/coding/` 搜索 | — | 中文显示值 / 平台别名 / 模型名 4 个词逐个通过 | 同上 |
| 三页 JS 错误 / 外部请求 | — | 0 / 0 | 同上 |

`/plans/` 的 1.039 不是缺陷：该页主数据区 `.pchglist` 自身内缩在 `.phubsec` 里（实测 `56..1384`），
而页面级说明落在页面列 `30..1410` 上 —— 「与主数据区同轴」在这页的正确语义就是与页面主容器同轴。

> 证据：`research/_raw/secondary-page-layout-unification/geometry/before-after.md`（§2 三页各 6 行） ·
> `.../teeth/README.md`（§3 第 2 条） · `.../gate/steps/47-real-browser-acceptance-verify-site-js.txt`

### F.3 Deal Detail（`/deal/<id>/`，80 页）

| 读数 | before | after | 出处 |
| --- | --- | --- | --- |
| 内容列宽 | 1120px | 1120px | `.../geometry/before-after.md`（§2 `deal/017bdbc04e70/` 六行） |
| 居中偏差（左留白 − 右留白） | 0 | 0 | `research/secondary-page-layout-unification-self-audit.md`（§二 Q6：10 个真实详情族路由内容列全部 1120px、居中偏差全部 ≤ 1px） |
| 页面级说明 | 无 | 无（80 个 deal 详情页属于「零说明」的 81 页） | `.../t3/README.md`（§4.1 末行） |
| 横向溢出（六档） | 0 | 0 | `.../geometry/before-after.md`（§2） |

### F.4 Model Detail（`/models/<slug>/`，51 页）

| 读数 | before | after | 出处 |
| --- | --- | --- | --- |
| 内容列宽（`main.detail-main`） | 1120px | 1120px | `.../geometry/before-after.md`（§2 `models/360zhinao-pro/` 六行） |
| 说明宽 / ratio（1440） | 1120px / 1.000 | 1120px / 1.000 | 同上 |
| 独立探针 10 个 detail 路由的宽度集合 | — | `widths [1120]` · `centeredDeltas [0,0,0,0,0,0,0,0,0,0]` · `allCenteredWithin1px = true` | `.../verify/height-overflow.json`（`detailMain`） |
| 横向溢出（六档） | 0 | 0 | `.../geometry/before-after.md`（§2） |

### F.5 移动端（390 / 360）

| 读数 | before | after | 出处 |
| --- | --- | --- | --- |
| 全站 390 档 `documentElement.scrollWidth` | 186 页全部 `≤ 391`（最宽 390） | 同左 | `.../teeth/README.md`（§4.2） · `.../t3/README.md`（§7.3 P1） |
| 溢出页数（1440 / 1600 / 390） | 0 / 0 / 0 | 0 / 0 / 0 | `.../verify/height-overflow.json`（`overflow`） |
| 样本集 760 / 360 档 | 29 条样本，0 违规 | 29 条样本，0 违规 | `.../teeth/README.md`（§3、§4.3） |
| `/status/` 390 / 360 ratio | 1.000 / 1.000 | 1.000 / 1.000 | `.../geometry/before-after.md`（§2） |

### F.6 回归比对（`--compare` 六项）与整轮验收

| 判据 | 基线 → 实测 | 结论 |
| --- | --- | --- |
| 覆盖的优惠条数不减少 | 80 → 80 | ✓ |
| 卡片数不减少 | 50 → 50 | ✓ |
| 首屏完整可见不减少 | 6 → 6 | ✓ |
| 页高不增加（容差 15%） | 4589px → 4787px | ✓（基线见 F.1 的口径说明） |
| 外部请求不增加 | 0 → 0 | ✓ |
| JS 错误仍为 0 | 0 个 | ✓ |

- 第 47 步（真浏览器验收，`--dir=dist`）：`✅ 验收 842 项，失败 0 项`；§22c 条级容器 **401 条**（@1440）/ **401 条**（@1600）；
  全站扫描 **628 次导航**；JS 错误 **0** · 外部请求 **0**；`§22b` 断言 **41 项（失败 0）**。
- 第 48 步（回归比对）：`✅ 验收 848 项，失败 0 项`。
- 独立探针的页面高度：59 路由 @1440 → **47 页变矮 · 12 页不变 · 0 页变高**；差值 `min −224 / median −122 / max 0px`。

> 证据：`research/_raw/secondary-page-layout-unification/gate/steps/48-regression-verify-baseline-compare.txt`（§12 六项 + 末行） ·
> `.../gate/steps/47-real-browser-acceptance-verify-site-js.txt`（条级容器行 + 末行） ·
> `.../verify/height-overflow.log` · `.../verify/height-overflow.json` · `.../t3/README.md`（§7.3 P1）

---

## §G Mutation（每一条都真的会红）

> **本节的牙分三批，各自带轮次标注（引用时不许混）**：
> - **G.1 / G.2 的 M1–M10 + M-disk（G.5）来自轮 2**（判据 sha `4f4cb2e3…`）—— 结构与「每条都真的会红」的结论不变，
>   但**断言数（842）是轮 2 的**。
> - **G.2b 的 M11 / M12 来自轮 4**（判据 sha **`fd3c9a3090dca11b…`**），轮 4 的计数是 **848**。
> - **M13 来自轮 5**（判据 sha **`610b25a809c6b337…`**），**轮 6 保持**（判据 sha **`2cbc160dc64f8ade…`**）；M1–M12 在轮 5 / 轮 6 复跑**全部仍 hit**。
> - 三轮变四轮、再到五轮的病根与结论见 §C.5 / §J 故事线。

> 全部变异在**浏览器页面内存**里发生；判据是 `verify-site.js` §22c 的同一份 `wideProblems()`（一处出口），
> 逐条 `route#index`。轮 2 的逐条 JSON 在 `mutations-real/M*.json` + `M-summary.json`；
> 轮 4 的逐条 JSON 由 `t21` 的 `extract-mutations` 从 `teeth/_scratch/r4-*` 抽出；**轮 6 的逐条 JSON 在 `teeth/_scratch/r6-*`**。

### G.1 M0 前置反证（改动前产物必须红）

| 读数 | 轮 2（判据 `4f4cb2e3`） | 轮 4（判据 `fd3c9a30`） | **轮 6（判据 `2cbc160d`，当前）** |
| --- | --- | --- | --- |
| 命令 | `verify-site.js --dir=dist.baseline` | 同左 | 同左 |
| exit | **1** | **1** | **1** |
| 断言 / 失败 | 842 / **27** | **848 / 33** | **852 / 36** |
| 其中**非 §22c** 的失败 | **0** | **0** | **0** |
| 命中 | `note-narrow` **48 页 / 156 条** | 并集 **156 条 / 48 页**：`note-narrow 156`（盒宽全 **452.81**）+ `note-ink-narrow 108`（**② ⊆ ①**）；页级码分布 `{note-narrow 48, note-ink-narrow 48}` | **并集仍 156 / 48**（逐条与 `truth-401.json` 双向零差集）· **新判据 `note-unrendered` 0 命中**；失败的 **33 → 36 全部是 M13 锚点类**（baseline 无冻结串 ⇒ 按纪律红，与加 M11/M12 同构） |
| 按族归类 | `vendor/* 26 · need/* 10 · category/* 6 · 集合页 3 · status 1 · changes 1 · feeds 1`（= 48） | 同左 | 同左 |
| 冻结串「每页恰好 1 次」 | **0 / 186** | **0 / 186** | **0 / 186** |

> 证据：轮 2 → `research/_raw/secondary-page-layout-unification/mutations-real/M0-baseline.json` · `.../mutations-real/M0-baseline-summary.json` · `.../t3/README.md`（§7.3 P5/P6） ·
> 轮 4 → `.../t21/t21-summary.json`（step4 `848 / 33 / failingNon22c 0`、step5 逐页清单与码分布、step7 `gate-vs-truth --expect=baseline` pass） · `.../review/t20/T20-ROUND4.md`（§3 `new-baseline` 行） ·
> **轮 6 → `.../teeth/_scratch/r6-m0.json` · `.../teeth/T24-ROUND5.md`（诚实项①：33→36 全为 M13 锚点类；**轮 5 与轮 6 的同一列读数逐项相同**，差别只有判据 sha 与豁免条件） · `.../review/t26/T26-ROUND5.md`（读数复核：并集仍 156/48、新判据 0 命中）**

### G.2 M0 + M1–M10 逐条（**轮 2 判据 `4f4cb2e3`**，真实 `dist/`）

| 牙 | 页面@视口 | 期望 | 实测 | 命中条（`route#index`） | 结果 |
| --- | --- | --- | --- | --- | --- |
| **M0** | `--dir=dist.baseline` | `note-narrow ×48 页 / 156 条` | 见 G.1（轮 2 列） | 156 条 | ✓ |
| **M1** | `student/@1440` | `note-narrow` | `[note-narrow, note-axis]` ×3 | `student/#0 #1 #2` | ✓ |
| **M2** | `status/@1440` | `note-narrow` | `[note-narrow, note-axis]` ×2 | `status/#0 #1` | ✓ |
| **M3** | `changes/@1440` | `note-narrow` | `[note-narrow, note-axis]` ×13 | `changes/#0 … #12` | ✓ |
| **M4** | `feeds/@1440` | `note-narrow` | `[note-narrow, note-axis]` ×8 | `feeds/#0 … #7` | ✓ |
| **M5** | §22b 的 M1–M5 | 既有牙全绿 | §22b 断言 41 项（失败 0）· M1=`[center]` M2=`[width]` M3=`[axis,src-width]` M4=`[self-overflow@390,page-overflow@390]` M5=`[leaf-consistency]` · M4 正对照=`[无]` | — | ✓ |
| **M6** | `student/@390` | `page-overflow@390` | `[note-clipped, page-overflow@390]`（`scrollWidth 1118` / 视口 390） | — | ✓ |
| **M6 正对照** | `student/@390` | 不得出现 `page-overflow` | `[]`（同样注入 200 字符不可断串、CSS 一字不动 ⇒ `scrollWidth 390`） | — | ✓ |
| **M7** | `status/@1440` | `unexpected-detail-main` | `[unexpected-detail-main]`（`detailMainCount 1`） | — | ✓ |
| **M8**（r2） | `student/@1440` | `note-narrow`（padding 型：盒宽不动、有字区域被压） | `[note-narrow]` ×3；要害读数 **盒 `1380px` / 有字区域 `452.81px`** | `student/#0 #1 #2` | ✓ |
| **M9a**（r2） | `docs/data/@1440` | `note-narrow`（只压非首个） | `[note-narrow, note-axis]` ×8；且「第 0 条不被压」✓ | `docs/data/#1 … #8` | ✓ |
| **M9b**（r2） | `changes/@1440` | `note-narrow`（`:not(:first-of-type)`） | `[note-narrow, note-axis]` ×5 | `changes/#1 #3 #4 #8 #12` | ✓ |
| **M10**（r2） | `student/@1600` | `note-narrow`（藏在 `@media(min-width:1500px)` 里，1440 档物理上看不见） | `[note-narrow, note-axis]` ×3 | `student/#0 #1 #2` | ✓ |
| **不注入正对照**（r2） | M8/M9a/M9b/M10 四个靶页 | 本来 0 条 `note-narrow` | 四个靶页 `noteNarrow 0` · `codes []` · `allClean = true` | — | ✓ |

M1–M4 的变异是**逐字**把冻结串里的 `max-width: none` 换成 `max-width: 70ch`（`overflow-wrap` 一字不动，隔离缺陷）；
M6 只把 `overflow-wrap: anywhere` 换成 `normal`；M8/M9a/M9b/M10 是**追加**一条收窄规则（冻结串保留）。

> 证据：`research/_raw/secondary-page-layout-unification/mutations-real/M-summary.json`（`rows[]` 逐条 + `noInjectionControl` + `m5Reuse`） ·
> `.../mutations-real/M1.json` … `M10.json` · `.../mutations-real/M5-reuse.json` · `.../mutations-real/M6-control.json` ·
> `.../mutations-real/no-injection-control.json` · `.../t3/README.md`（§7.3 P4）

### G.2b M11 / M12（**轮 4 判据 `fd3c9a30`**）—— 两条新牙对上新码

| 牙 | 页面@视口 | 针对的新码 | 轮 4 实测 | 结果 |
| --- | --- | --- | --- | --- |
| **M11** | `changes/@1440` | `note-ink-narrow`（盒宽满宽、字迹被排进窄轨） | **`note-ink-narrow` ×6**（`observed` 全为该码，无 `note-narrow` 混入） | ✓ |
| **M12** | `student/@1440` | `note-hidden-text`（文本非空但无可见字形盒） | **`note-hidden-text` ×3** | ✓ |
| **M13**（轮 5 引入 · 轮 6 保持） | 未渲染说明 | `note-unrendered`（**盒高 0 + 可见文本非空 + 字形盒 0**；**轮 6 起不再看 `<noscript>` 标记**）+ 上界断言 | 裸 `.snote{font-size:0}` 注入 `plans/`：整轮 **EXIT=1 / 852 项 / 5 条失败全部含 `note-unrendered`**；**同产物改前 binary EXIT=0 / 848 / 0 失败**（假绿复现）；同副本不注入 **EXIT=0** | ✓ |

**轮 4 / 轮 5 复跑时 M1–M12 的形态与命中条**（同一批靶页；因为新码是并集，多数条同时多出一个 `note-ink-narrow`）：

| 牙 | 页面@视口 | 轮 4 `narrowKeys` | 轮 5 |
| --- | --- | --- | --- |
| M1 | `student/@1440` | `student/#0 #1 #2` | 仍 hit |
| M2 | `status/@1440` | `status/#0 #1` | 仍 hit |
| M3 | `changes/@1440` | `changes/#0 … #12`（13 条） | 仍 hit |
| M4 | `feeds/@1440` | `feeds/#0 … #7`（8 条） | 仍 hit |
| M6 / M6 正对照 | `student/@390` | `[]`（`observed` 分别为 `[note-clipped, page-overflow@390]` / 空） | 仍 hit |
| M7 | `status/@1440` | `[]`（`observed` = `[unexpected-detail-main]`） | 仍 hit |
| M8 | `student/@1440` | `student/#0 #1 #2` | 仍 hit |
| M9a | `docs/data/@1440` | `docs/data/#1 … #8` | 仍 hit |
| M9b | `changes/@1440` | `changes/#1 #3 #4 #8 #12` | 仍 hit |
| M10 | `student/@1600` | `student/#0 #1 #2` | 仍 hit |
| M11 | `changes/@1440` | `note-ink-narrow` ×6 | 仍 hit |
| M12 | `student/@1440` | `note-hidden-text` ×3 | 仍 hit |
| M13 | 未渲染 | — | **新增（轮 5）** |

轮 4：`allHits: true` · **零磁盘污染**：变异前后 **303 个文件**的 sha256 清单逐字节相同。
轮 5：M1–M12 **全部仍 hit**（t24 自报 + t26 复核），M13 为新增；**不注入对照组 `allClean = true`**；§22b 的 M1–M5 复用仍 41 项 0 失败。

> 证据：轮 4 → `research/_raw/secondary-page-layout-unification/t21/geometry/mutations.json`（`rows[]` 逐条：id / route / viewport / expect / hit / `narrowKeys` / `observed`） ·
> `.../t21/t21-summary.json`（step3：`ids M1…M12 · m11Hit true · m12Hit true · allHits true · zeroDiskPollution true`） · `.../teeth/_scratch/mutations.json` ·
> **轮 6 → `.../teeth/_scratch/r6-green.json` · `.../teeth/_scratch/r6-empty-noscript-report.json`（M13 反证） · `.../teeth/T24-ROUND5.md`（不变量 8/8） · `.../review/t26/T26-ROUND5.md`（M13 复测 + M13 承重证明）**

### G.3 反空洞守卫（变异不生效就不许算通过）

- 每条变异替换前必须断言锚点在内联样式里**恰好出现 1 次**；**0 次或 ≥2 次都返回 `ok:false` 且不做任何替换**。
- 两处独立读数一致：浏览器内「出现 1 次」/ **磁盘静态** `<style>` 里 1 次，全文件也是 1 次（`anchorFromVerifySite` / `anchorFromDisk` 全为 1）。
- 守卫自身的负例自检：不存在的锚点 ⇒ 0 次 / `ok:false`；非唯一锚点（`color: var(--mut);`，实测 **61 次**）⇒ `ok:false`。
- 改动前产物上 M1–M7 的锚点守卫按设计**判红**（锚点 0 次 ⇒ 变异没落地就不许算通过），且**不做任何替换**、不留半截产物。

> 证据：`research/_raw/secondary-page-layout-unification/teeth/README.md`（§4.1、§4.3） ·
> `.../mutations-real/M-summary.json`（`anchorFromVerifySite` / `anchorFromDisk` 字段）

### G.4 零磁盘污染

- 全站：变异前后 **303 个文件**的 sha256 清单**逐字节相同**（`zeroDiskPollution.identical = true`）。
- 逐页：`student/` `status/` `changes/` `feeds/` 等被改产物的 `sha256Equal` 逐条为 `true`。
- `M6-control` 是**只注入内容、不改 CSS** 的正对照 ⇒ `sha256Equal = null`（如实体现在报告里，不造数据）。

> 证据：`research/_raw/secondary-page-layout-unification/mutations-real/M-summary.json`（`rows[*].sha256Equal` + `zeroDiskPollution`） ·
> `.../teeth/README.md`（§4.3）

### G.5 M-disk（落盘级变异循环，文字要求的「真的写到磁盘再构建」版本）

九阶段完整循环：① 前置状态（sha256 + `git status` + T1 diff + 字节备份）→ ② 把 70ch 塞回 `feeds` 壳（唯一锚点、可逆）
→ ③ **真实构建** `node scripts/tools/build-local.js` → ④ **独立探针判红** → ⑤ `git checkout --` → ⑥ 还原 T1 工作副本（`git apply`）
+ 可逆性自检 → ⑦ **真实构建** → ⑧ **独立探针判绿** → ⑨ 恢复证明。

| 阶段 | 读数 | 出处 |
| --- | --- | --- |
| ② 变异后 `build-local.js` sha256 | `264912c2…` → `2a103855…`（字节 407799 → 407914）；文件里含 `max-width: 70ch` 的行数 **0 → 1** | `.../mutations-real/M-disk.log`（②） |
| ③ 构建（带变异） | exit **0** · `✅ 产物自检通过` | 同上（③） |
| ④ 独立探针判红 | `wide-probe.cjs --dir=dist` exit **1** · 全站 186 页 · **违规页 1** · 违规码 `{"note-narrow":1,"note-axis":1}` · 违例页 `feeds/`（说明 **452.81px** / 主数据区 **1380px** `.flist`）· 样本违规 4 条 · `dist/feeds/index.html` 里 70ch 规则 **1 处** | 同上（④） · `.../mutations-real/M-disk.probe-red.json` |
| ⑤ `git checkout --` 的字面陷阱（**如实记录**） | 该 worktree `HEAD = 1f225d2` 是**基线**、T1 改动**未提交** ⇒ 拿到的是**改动前**版本（`75170c7f…`），**不是** T1 工作副本 | 同上（⑤） |
| ⑥ 还原 + 可逆性自检 | `git apply` 后 sha256 回到 `264912c2…`（与前置相等）· 另做 `apply → revert → apply → revert` 四次自检，四次的 sha256 分别等于期望值 | 同上（⑥） · `.../mutations-real/M-disk.build-local.t1.patch`（7593 字节） |
| ⑦ 构建（恢复后） | exit **0** | 同上（⑦） |
| ⑧ 独立探针判绿 | exit **0** · **违规页 0** · `dist/feeds/index.html` 里 70ch 规则 **0 处**、冻结串 **1 处** | 同上（⑧） · `.../mutations-real/M-disk.probe-green.json` |
| ⑨ 恢复证明（三证） | `sha256Equal true` · `gitStatusPorcelainEqual true` · `distManifestEqual true` | 同上（⑨） · `.../mutations-real/M-disk.json`（`recovery`） |

> 证据：`research/_raw/secondary-page-layout-unification/mutations-real/M-disk.json`（`verdict: pass`） ·
> `.../mutations-real/M-disk.log` · `.../mutations-real/M-disk.step3-probe-red.log` · `.../mutations-real/M-disk.step10-probe-green.log` ·
> `.../mutations-real/run-mdisk.cjs` · `.../t3/README.md`（§5）

### G.6 判据前后对照（**同一份改动前产物上** —— 牙齿真的变利了）

| 读数 | 修复前判据（`recovered/pre-t7`，sha `4cae2fb2…`） | 修复后判据（sha `4f4cb2e3…`） |
| --- | --- | --- |
| 断言 / 失败 | 827 / **19** | 842 / **27** |
| `layoutSweep.narrowNotes` | **48** | **156** |
| `layoutSweep.narrowNotePages` | （无此字段） | **48** |
| **条级容器** | **不存在**（`metrics.layoutNotes` 无、`layoutViolations[*].noteKeys` 无） | **401 行**（`route#index` 可逐条核对） |
| 逐条命中 | 不可知（每页只判第一条） | 156 条 / 48 页，其中 **108 条是 `index > 0`** |
| 同一支核对工具 `gate-vs-truth --expect=baseline`（严格默认） | **exit 1** —— 红的正是「没有条级容器」 | **exit 0** |
| 同上加 `--allow-page-only` | exit 0（页集合 48/48 一致） | exit 0 |

⇒ **结论句**：**页集合**当时就是对的（48 页），被低估的是**每页里的条数**：
旧判据在最理想的情况下也只能看见 **48 / 156** —— 剩下 **108 条在形态上无法表达**；
修复后同一产物上 156 条逐条可见，且**零误报**。

> 证据：`research/_raw/secondary-page-layout-unification/t3/README.md`（§7.4） ·
> `.../recovered/pre-t7-M0-baseline.json` · `.../recovered/gate-vs-truth-pre-t7-strict.json` ·
> `.../recovered/gate-vs-truth-pre-t7-page-only.json` · `.../mutations-real/M0-baseline.json` ·
> `.../recovered/README.md`（复原件身份与复原方法）

### G.7 集合级核对（与独立真值 `truth-401.json` 对账）

| | 绿轮（`dist`） | 基线轮（`dist.baseline`） |
| --- | --- | --- |
| verdict | **pass** | **pass** |
| 条级容器 | `metrics.layoutNotes` ✅ | `metrics.layoutNotes` ✅ |
| 命中条 / 页 | 0 / 0 | **156 / 48** |
| 漏判 | 0 | **0**（156 条逐条命中） |
| 误报 | 0 | **0**（245 条对照组一条没中） |
| 页集合 | 空 | **逐条相同（无新增、无减少）** |

> 证据：`research/_raw/secondary-page-layout-unification/geometry/gate-vs-truth-green.json` + `.log` ·
> `.../geometry/gate-vs-truth-baseline.json` + `.log`

---

## §H Full Gate

> **轮 6 读数**（判据 sha **`2cbc160dc64f8ade…`**；由 t28 落盘、t29 复审 **pass**）。
> 不变的是：步骤总数 49（从 `action.yml` 现场解析）、跳过的 4 步及其理由、
> 以及「每步都带 `verifySiteSha256`、不混版」这条纪律。**发布后的 CI `gate` 读数仍待回填（§H.3 / §I）。**

### H.1 本地 Full Gate（49 步）

| 读数 | **轮 6 值** | 出处 |
| --- | --- | --- |
| Gate action | `.github/actions/gate/action.yml`（**49 步**，sha256 `d1c4b0df6900edf8…`；步序从现场解析，不写死） | `.../gate/00-dry-run.txt` |
| 总步骤 | **49** | `.../teeth/_scratch/r6-gate/summary.json` |
| 执行 | **45** | 同上 |
| 通过 | **45** | 同上 |
| 失败 | **0** | 同上 |
| 跳过 | **4**（`Install dependencies` / `Prepare browser…` / `Browser availability decision` / `Gate conclusion`） | 同上 + `.../gate/00-dry-run.txt` |
| exit code | **0** | 同上 |
| 第 47 步（真浏览器验收） | ✓ exit 0 · **852 项 0 失败** | `.../teeth/T24-ROUND5.md`（读数） |
| 第 48 步（回归比对） | ✓ exit 0 · **858 项 0 失败**（**另一支计数器**：含 `--compare` 六项） | 同上 |
| `--only=47,48` 复跑 | **2/2 exit=0** | `.../teeth/_scratch/r6-gate/` |
| 每步的判据版本 | 第 47/48 步都带 `verifySiteSha256 = 2cbc160dc64f8ade`（轮 6 冻结值） | 同上 |
| 产物可复现 | dist **303 个文件**跑前/跑后 sha256 **0 差异** | `.../teeth/_scratch/r6-dist-{before,after}.txt` |

**跳过的 4 步（逐条写明理由，绝不静默跳过）**：

| # | 步骤 | 为什么不跑 |
| --- | --- | --- |
| 1 | `Install dependencies` | CI 的依赖准备；本机 worktree 的 `node_modules` 已按 lockfile 就位，该步不参与任何判定 |
| 45 | `Prepare browser for the real-browser gate` | CI 专用 shell：探测 runner 上的浏览器并写 `GITHUB_OUTPUT` / Step Summary；本机浏览器由 `DSH_EDGE` 直接给出 |
| 46 | `Browser availability decision (never silent)` | CI 专用：把「浏览器不可用」按规则判红；那段 shell 本身由 `check-ci-consistency.js` 的 (10) 真实执行守着（本机没有 `GITHUB_OUTPUT` 语义） |
| 49 | `Gate conclusion` | CI 专用：只把结论写 GitHub Step Summary，不参与判定 |

> 证据：`research/_raw/secondary-page-layout-unification/teeth/T24-ROUND5.md`（Full Gate 49 / 45 / 45 / 0 / 4 · exit 0 · 第 47 步 852、第 48 步 858） ·
> `.../teeth/_scratch/r6-gate/`（49 步日志 + `summary.json`） · `.../gate/00-dry-run.txt`（49 步现场解析） · `.../gate/run-full-gate.cjs`

### H.2 第 47/48 步：三轮并排（**引用时必须带轮次**）

| 读数 | 轮 2（判据 `4f4cb2e3`） | 轮 4（判据 `fd3c9a30`） | **轮 6（判据 `2cbc160d`，当前）** |
| --- | --- | --- | --- |
| 第 47 步（真浏览器验收） | ✓ 131.9s · exit 0 · **842 项 0 失败** | ✓ exit 0 · **848 项 0 失败** | ✓ exit 0 · **852 项 0 失败** |
| 轮次归属 | 轮 2 | 轮 4 | **轮 6**（**轮 5 的这两步读数与轮 6 逐项相同**：47 步 852 / 48 步 858；轮 6 改的是判据语义，不是计数） |
| 第 48 步（回归比对） | ✓ 119.2s · exit 0 · **848 项 0 失败** | ✓ exit 0 · **854 项 0 失败** | ✓ exit 0 · **858 项 0 失败** |
| 合并视图 | 49 / 45 / 45 / 0 / 4 · exit 0 | 49 / 45 / 45 / 0 / 4 · exit 0 | 49 / 45 / 45 / 0 / 4 · exit 0 |
| 版本标注 | `summary.json.runs[]` 各轮带 `verifySiteSha256` 与 `runAt` ⇒ **旧读数不会被冒充成新读数** | 同左 | 同左（轮 6 逐步记 `verifySiteSha256 = 2cbc160dc64f8ade`） |

⚠️ **「854/848/852/858」四个数不是同一件事，引用必须带轮次与上下文**：
① **轮 3 的 `--dir=dist`** 有**两个**数：**848**（未打补丁）/ **854**（内存补丁开启 760 覆盖，`review/runs/r3-green.json`）；
② **轮 4 的 `--dir=dist`** = **848**（第 47 步同）；
③ **轮 5 与轮 6 的 `--dir=dist`** 都是 **852**（第 47 步同；**轮 6 的判据 sha 是 `2cbc160d`，轮 5 是 `610b25a8`**）—— 轮 4 → 轮 5 的 848 → 852 = 新增 4 条断言（上界 1 + M13 锚点/复测/承重 3），轮 5 → 轮 6 **计数不变**（只换语义）；
④ **第 48 步（回归比对）** 是「套件 + `--compare` 六项」这一支，与 `--dir=dist` **不是同一个计数器**（轮 4 = 854、轮 5 与轮 6 = **858**）。
混引会被读成「判据被削弱/放水」（t22 §7 F4 专门点了这一条）。

> 证据：**轮 6 → `research/_raw/secondary-page-layout-unification/teeth/T24-ROUND5.md` · `.../teeth/_scratch/r6-gate/summary.json` · `.../review/t26/T26-ROUND5.md`（读数复核）** ·
> 轮 4 → `.../t21/t21-summary.json`（step13） · `.../verify/T22-GATE-SELF-AUDIT.md`（§5 N06/N17 · §7 F4） · 轮 2 → `.../gate/03-browser-rerun.txt`

### H.3 CI 的 required check 读数 —— **已回填（发布实跑）**

- 必需检查名是 **`gate`**（workflow 的 `name` 是 `Verify site (gate)`，但分支保护要填的是 **job 名 `gate`**）。
- **实测（发布实跑）**：PR **#45** 上的 `verify.yml`（job 名 `gate`）run **37501963346** → **pass · 4m53s**；
  master 上的同一 workflow run **37502684190** → **success**。详见 §I.2。
- 版本一致性风险另由**本地**证据兜住：`check-ci-consistency.js` **exit 0 · 38 项 0 失败**（含「断言名单与冻结清单等值」
  「实跑项数 == `--expect-checks=38`」）—— 轮 6 复算见 `teeth/_scratch/r6-ci.log`。

> 证据：`research/_raw/secondary-page-layout-unification/release/checklist.md`（§2.1 第 6 条：必需检查名；§2.3 第 1 条） ·
> `.../teeth/_scratch/r6-ci.log`（轮 6：38 项 / 失败 0） · **§I.2（发布实跑的 run id 与结论）**

### H.4 成本（CI 20 分钟超时是否安全）

| 读数 | 值 |
| --- | --- |
| 导航次数 / 次运行 | 轮 2 = 628 · 轮 4 = 630 · **轮 5 = 631**（差 1 = M13 那一页） |
| §22c 本节耗时 | 轮 2 实测 `layoutScan.seconds = { desktop1440: 9.0, desktop1600: 8.5, narrow390: 8.1, samples: 4, section: 32.1 }`；轮 4：1440 9s / 1600 10s / 390 9.8s / 样本 5.2s，段总 37.2s（baseline 39.3s） |
| 两步浏览器 gate 整轮 | 轮 2：`--dir=dist.baseline` **112.7s（exit 1）** · `--dir=dist` **118.8s（exit 0）** · 合计 **231.4s** |
| 与 CI 上限的关系 | CI `timeout-minutes: 20` ⇒ 仍有数量级余量 |

> 证据：`research/_raw/secondary-page-layout-unification/teeth/README.md`（§0.2） ·
> `.../teeth/T24-ROUND5.md`（诚实项③：导航 630→631） · `.../teeth/T19-ROUND4.md`（轮 4 分档耗时） · `.../release/checklist.md`（§2.1 第 8 条：`timeout-minutes: 20`）
> `.../release/checklist.md`（§2.1 第 8 条：`timeout-minutes: 20`）

### H.5 轮 4 的修理**不是靠削弱判据达成的**（t20 逐条比对）

| 检查 | 读数 |
| --- | --- |
| `WIDE_NOTE_RATIO = 0.85` | 改前/改后同一行、同值（`verify-site.js` L6185 → L6194） |
| `note-ink-narrow` 的前置 `note.lineCount >= 2` | 判据式**逐字未动**：`… && note.lineCount >= 2 && note.widestLine < threshold - 0.01`（改前 L6552 / 改后 L6607–6608） |
| `threshold = WIDE_NOTE_RATIO * column`、`column = min(region.width, main.width)` | 未动 |
| 运行期断言数 | `--dir=dist` 与 `--dir=dist.baseline` 改前/改后**都是 848**（4 次整轮实测） |
| 断言**名单** | 848 名逐名多重集比对：**删 2、增 2** —— 正是 `§22c @760/@360 样本集` 两条**改名**（旧名「旧口径 textWidth…只在桌面档判」→ 新名「同一份判据；逐行字迹按**物理前置条件**判」）；**无任何断言被删除或改名规避** |
| 静态 `check(` 字面量 | **481 → 481**；字面量多重集只差 1 条（样本集模板串） |
| `meta.inkRule` 调用点 | **3 → 0**（全文只剩 1 处注释） |
| §22b 区间（不许动） | `/* §22b` → `/* §22c` 切片 **37,318 B · sha16 `077dc51ef68af7fd` · 改前改后逐字节相同**（583 行窗口） |
| 改动落点 | 14 hunk（`-U3`）/ 24 hunk（`-U0`），**全部在 §22c 块内**，`+146 / −37`（与 t19 自报一致） |
| 新增的量 | `ch70Of` 现场尺子、`criteria.inkScope`、`metrics.layoutSweep.inkScope*`、`metrics.layoutSampleScope`、样本集 detail 里的物理作用域读数 |

**「760 档新增了覆盖，为什么断言数没变？」**：因为 @760 的样本集断言**改前就存在** ——
旧代码在循环体里用 `Object.assign({}, meta, { inkRule: false })` 把逐行字迹那一路**关掉**；
t19 只删掉了这个开关，没有新增断言。覆盖面的扩大发生在**同一条已有断言内部**。

> 证据：`research/_raw/secondary-page-layout-unification/review/t20/T20-ROUND4.md`（§2 逐条比对 · §1.3 主张核对） ·
> `.../teeth/T19-ROUND4.md`（修复轮 4 自述） · `.../teeth/verify-site.t19.diff` · `.../teeth/_backup/verify-site.pre-t19.bak`（改前备份）

---

## §I Online Smoke —— **已回填（发布态实测）**

> 本节全部是**发布之后**从 GitHub / 线上域名取回的**实测读数**；数据来源 = `gh` 的输出 + 线上 smoke 的落盘 JSON。
> **§30 十五项中「提交 / PR / 合并 / 部署 / 线上 smoke」四项已全部回填为实测值**（本节 I.1–I.4），不再有任何待回填字段。

### I.1 提交与合并

| 项 | 实测值 |
| --- | --- |
| 分支提交（最终） | **`8168251465a447da81d0de509a6be05519fca9a7`**（分支 `secondary-page-layout-unification`） |
| 合并提交（master） | **`9251e83b68a704cebe2ecd4d66f72126e12fb90c`** |
| PR | **#45** · <https://github.com/buguoshixc/ai-deals-aggregator/pull/45> · `mergedAt = **2026-10-06T17:19:39Z**` |

### I.2 CI（必需检查 `gate`）

| 运行 | run id | 结论 |
| --- | --- | --- |
| PR 上的 `Verify site (gate)` | **37501963346** | **pass · 4m53s** |
| master 上的 `Verify site (gate)` | **37502684190** | **success** |

### I.3 部署（`Deploy to GitHub Pages`）

| 项 | 实测值 |
| --- | --- |
| run id | **37502684227** |
| 结论 | **success** |
| 三个 job | **`prepublish` ✅ / `build` ✅ / `deploy` ✅**（全部 success） |

### I.4 线上几何 smoke（真浏览器，跑线上域名）

| 项 | 实测值 |
| --- | --- |
| 产物 | `research/_raw/secondary-page-layout-unification/release/online-smoke-result.json`（**107261 B**） |
| 模式 / 基线 | `mode = **online**` · `base = https://buguoshixc.github.io/ai-deals-aggregator/` |
| 采样时间 | `at = **2026-10-06T17:28:15.905Z**` |
| 结果 | **8 页 · 79 项断言 · `failed = 0` · `ok = true`** |
| 取样推导 | `derivation.source = sitemap:http` · `fallback = false` · `sitemapLocs 183` · `dealRoutes 80` · `modelRoutes 51` · 取样 `deal/2eae0e246de2/` 与 `models/claude-fable-5.1/`（**id / slug 现场推导，脚本里不写死**） |
| 判据阈值（与 §22c 同源） | `noteRatio 0.85` · `axisRatio 0.05` · `tol 1` · `detailColumnMax **1120**` · `detailCenterTol 8` · 视口 `[1440, 390]` |
| 冻结串 | 线上每页命中 `.snote { … max-width: none; overflow-wrap: anywhere; }` —— **`frozenCount = 1`** |

**这一步为什么能证明「线上跑的是新产物」**：改动前（`dist.baseline`）的产物里**根本没有那条共享规则**，同一支脚本对旧产物量到的 `frozenCount = **0**`；
线上 8/8 页量到 `frozenCount = 1` ⇒ **线上确为新产物**（不是 CDN 还在发旧版）。

**逐条关键读数（不给"通过"，给值）**：

| 页面 | 族 | 关键读数 |
| --- | --- | --- |
| `student/` | wide | `main 1380px` · 主数据区 `.ctable 1380px` · 说明 **3 条**；**#0 `textWidth=1380px` · 盒 `30~1410`（1380px）· 列 1380px · `ratio=1`** · 字迹 1364.86px/6 行；#1 `textWidth=1380px` · 盒 30~1410 · `ratio=1` |
| `status/` · `changes/` · `feeds/` | wide | 说明分别 **2 / 13 / 8 条**，各 #0 均 `textWidth=1380px` · 盒 `30~1410` · `ratio=1` · `frozenCount=1` |
| `need/edu-identity/` · `plans/coding/` | wide | 说明 **3 / 5 条**，#0 同样 `textWidth=1380px` · 盒 `30~1410` · `ratio=1` |
| `models/claude-fable-5.1/` | detail | `main **1120px**` · 主数据区 `.ptable 1120px` · 说明 **5 条**（#0 `1120px` / `ratio 1`）；#0 `textWidth=1120px` · 盒 `160~1280` · `ratio=1`；#1 `textWidth=1120px` · `ratio=1` |
| `deal/2eae0e246de2/` | detail | `main **1120px**`（`mainClass = detail-main`）· 主数据区（回落 `<main>`）`1120px` · 说明 0 条 |
| **全部 8 页 @390** | — | `documentElement.scrollWidth = 390 = clientWidth = innerWidth` ⇒ **无横向溢出**（8/8 页逐页一条断言） |

（`thresholds.viewports` 只有 `[1440, 390]` —— 线上 smoke 的判据面就是**桌面几何 + 窄屏溢出**两档；全站 186 页的逐条判据在 §G / §H 的门禁里，不在本节。）

### I.5 取证环境的网络事实（**属环境、不是产物问题 —— 必须写清，免得后人误读**）

- 本机 `github.com:443` 被**定点阻断**：DNS 解析到 `20.205.243.166` **不可达**，备用 IP 可达。
- 因此本轮的两条出网路径都经**本地代理 `127.0.0.1:7890`**：
  ① **推送**用**一次性**参数 `git -c http.proxy=http://127.0.0.1:7890 push`（**没有**写进任何全局/仓库 git 配置）；
  ② **浏览器取线上页**用环境变量 `HTTPS_PROXY=http://127.0.0.1:7890`。
- **对照（这条防的就是「把网络故障读成站点缺陷」）**：smoke **首次直连时 8/8 页面全部 `ERR_CONNECTION_CLOSED` 失败**；
  **改走代理后同一脚本、同一目标跑出 79/0 通过**。⇒ 首次失败是**取证环境的网络**问题，不是站点问题。
- 另一条边界：`release/online-smoke-result.json` 是**发布后新生成**的文件，**不在原 PR 证据索引的 59 条里**（索引是冻结在发布前那一刻的快照）——
  如实登记在此，**文件保留**。

> 证据：`research/_raw/secondary-page-layout-unification/release/online-smoke-result.json`（107261 B；`mode` / `base` / `at` / `checks` / `pages` / `derivation` / `thresholds` / `frozenSnoteRule` 全字段） ·
> `.../release/online-smoke.cjs`（脚本本体） · `.../release/checklist.md`（S7 必需检查 / S9 部署 / S10 线上冒烟 / S11 回填） ·
> `.../release/online-smoke-dryrun.json` 与 `.../release/online-smoke-negcontrol-baseline.json`（发布**前**的本地 dry-run 与负对照 ——
> 负对照在改动前产物上必须红，用来证明这套判据真的会响；**它们不是线上读数**）

## §J Self Audit

> **状态**：本章按 **轮 6 冻结读数**收口。判据 sha = **`2cbc160dc64f8ade…`**；
> 同一支套件在轮 2 = 842 项、轮 4 = 848 项、**轮 5 与轮 6 = 852 项**（**轮 5 与轮 6 计数相同、判据 sha 与豁免条件不同**）——
> **引用断言数必须带轮次**（见报告抬头）。**本章已无占位符**；③（`writing-mode`）已由 t31 **重测收口为 P1/DEFERRED**，
> 唯一仍待回填的是 **§I（发布后）**。

### 故事线：六轮对抗的**同一个病根 —— 判据量的是代理量**（本版最有价值的一段）

| 轮次 | 判据量的是什么 | 被什么绕过（整轮 **EXIT=0**） |
| --- | --- | --- |
| **round 1**（round 1 复审；`review.md` §3） | `.snote` 的 **border-box**（盒宽） | `padding-right: calc(100% - 70ch)`：有字区域 **451px**、盒子仍是 1380px（F1）；只判文档序第一条，401 条里 **296 条**没有几何判据（F2，条级覆盖 **105/401 = 26.2%**） |
| **round 2**（round 2 复审；`review.md` 的 R2 段与 `adversary/**`） | **内容盒**（`textWidth` = 直接承载文本的块级元素里最窄的 content box） | `display: grid; grid-template-columns: minmax(0, 70ch) 1fr`（`changes/` 13 条说明字迹只剩 **156–451.52px**，**只改一条 CSS、不动标记**）、`multicol`（单行最长 **447.3px**）、`float`（像素字迹 **411px**）、`overlay`（不透明伪元素盖右侧 70%，可见文字 **414px**）、伪元素承载正文（`字迹 null`） |
| **round 3**（轮 3 修复） | **内容盒 `textWidth` **∪** 逐行字迹宽**（**取并集，不是替换**）：`note-narrow` 管「内容盒被压窄、文本只有一行」，新增 `note-ink-narrow` 管「盒宽满宽但字迹铺不开」，另加 `note-hidden-text`（有文字却不可见） | 并集覆盖 **156 / 156**，A/C 误报 **0**；但作用域是**视口白名单**（1440/1600）⇒ 漏掉 ≤760 的媒体查询形态（R3-1） |
| **round 4**（轮 4 修复） | 同上并集，作用域改成**物理前置条件** `min(主数据区, 页面列) > 现场 70ch`（现场 **452.81px**） | **R3-1 已闭合**：grid 窄化包进 `@media (max-width:760px)`，改前同产物 **EXIT=0**（假绿），改后 **EXIT=1** 命中 **6 条 `note-ink-narrow`** `[changes/#0 #1 #2 #4 #8 #12]`；判据**未削弱**（§H.5） |
| **round 5**（轮 5 修复） | 同一并集 **+ 第四条「未渲染」**：`!rendered && textLength>0 && glyphRects===0 && !noscriptSubtree` ⇒ **`note-unrendered`**，并给 `metrics.unrenderedNotes` 加**上界断言** | **T22-F1 已闭合**：裸 `.snote{font-size:0}` 让盒高为 0 时，前四轮**三条牙齐默**（改前 binary **EXIT=0 / 848 / 0 失败**）；改后整轮 **EXIT=1 / 852 / 5 条失败全部含 `note-unrendered`**。**但同轮自己引入了一个标记级豁免键**（见 round 6） |
| **round 6**（轮 6 修复） | 同一并集 + 未渲染判据，**豁免条件换成「可见文本长度为 0」**（删掉 `&& !note.noscriptSubtree`，`<noscript>` 降为**诊断量**）；上界断言两桶改为**显式不相交** | **标记级豁免键已死**：`font-size:0` + 给 `plans/` 12 条说明各插一个**空** `<noscript></noscript>` ⇒ **改前 binary EXIT=0 / 852 / 0 失败**（轮 5 的免判路径）→ **改后 EXIT=1 / 852 / 4 条失败全部含 `note-unrendered`**（标记在、照样咬）。剩余出界面：**绘制类隐藏**（①）与**内容面的空说明口径变化**（⑭） |

**结论句（四条）**：

1. **前两轮修的是「覆盖面」（多量几条、多量几个视口），第三轮修的是「量纲」** ——
   把量纲从「盒子的某个代理宽度」换成「**文字最终被排成什么样**」，这一类漏洞才在**结构上**闭合，
   而不是追着一个个具体形态跑。
2. **新量纲不能替换旧量纲 —— 换掉就丢 48 条**：`note-ink-narrow`（② = **108**，`② ⊆ ①`）与 `note-narrow`（① = **156**，盒宽全 452.81）
   覆盖**两类不同的坏法**（单行说明 + 盒被压窄 vs 盒宽满宽但字迹铺不开），必须**取并集**才到 156/156。
   ⇒ **「换一个更好的判据」这件事本身，也要先证明它不丢旧的覆盖面。**
3. **作用域也不能靠枚举**：挂在「1440/1600」上是**视口白名单**（漏 ≤760 的媒体查询形态），
   挂在「现场列宽 > 70ch」上才是**物理前置条件**（自动覆盖 1440/1600/760，并**正确地**把 360 排除，理由见 ⑧）。
4. **「零码」本身也要有牙**：前四轮把「量到什么」修得很细，但「**根本没量到**」（未渲染）是个静默出口 ——
   第五轮补的是这条出口的**判据 + 上界断言**，让「metric 没人消费」这种状态不再可能。

「布局类是否真的收敛」由 **t22**（四轮对照）与 **t26**（五轮反证）独立复算，本报告**引用**它们的结论而不抢先下判。

> 证据：round 1 → `research/_raw/secondary-page-layout-unification/review.md`（§§3 F1/F2 · §2 覆盖度量） ·
> round 2 → 同文件（§R2-2 F-R2-1/F-R2-2 · §R2-3 · §R2-1.8） · t11 → `.../adversary/forms-table.md` · `.../adversary/README.md` · `.../adversary/calibration-report.md` ·
> **四轮对照表** → `.../verify/T22-GATE-SELF-AUDIT.md`（§3.1/§3.2 · §7 发现分级） ·
> **R3-1 闭合** → `.../review/t20/T20-ROUND4.md`（§1） · `.../t21/t21-summary.json`（step8/step9） ·
> **round 5（T22-F1 闭合）** → `.../teeth/T24-ROUND5.md` · `.../review/t26/T26-ROUND5.md`

### 残余项清单（逐条写成**具体形状**，都带证据）

#### ① 绘制类遮盖 / 不可见性 —— **不在本版承诺内（DEFERRED）**

覆盖的形态：`clip-path` / `mask-*` / 不透明覆盖层 / `color: transparent` / 伪元素承载正文。

**理由三条（写全）**：

1. **本仓库没有构建路径产出它们**：t11 的 `clip-census.cjs` 扫 **252 个源文件 + 186 个产物**，
   `clip-path` / `mask-image` / `mask`（简写）/ `-webkit-mask` / `mix-blend-mode` / `filter` **全部 0 文件 0 次**
   （产物侧同样全 0；对照：`opacity` 186 文件 / 789 次、`overflow:hidden` 186 文件 / 4942 次、`transform` 186 文件 / 372 次 ——
   说明普查确实在扫，不是没扫到）。
2. **完整修复不可行**：`clip-path` 可以是 `polygon()` / `path()`，`mask-image` 可以是位图；
   用有限规则穷尽「绘制后还剩多少可见文字」在实现上做不到。
3. **像素断言比漏判更糟**：把「可见字迹宽」做成像素级断言会让 CI 因**跨平台字体渲染差异**变 flaky 红 ——
   那比漏判更糟（假红会逼人不看门禁）。

**边界声明**：伪元素承载正文在轮 3 已被 `note-hidden-text` 收进承诺内（**带高度恢复器**的形态：`student/` 上 `rendered=true ×3 / glyphRects=0 ×3` ⇒ 命中 3 条）；
**去掉高度恢复器的裸变体仍出界** —— 见 ⑩（t24 闭合中）。

> 证据：`research/_raw/secondary-page-layout-unification/adversary/runs/clip-census.json` · `.../adversary/clip-census.cjs` ·
> `.../adversary/forms-table.md`（`clip-path-inset` / `overlay-opaque` 行 + 「仍放行的形态」段） ·
> `.../verify/T22-GATE-SELF-AUDIT.md`（§4 `note-hidden-text` 可达性行）

#### ② `.pdetailbody { max-width: 72ch }`（占单元格 **0.3377**）→ **保留 + P1 + 未来两种处置**

实测读数（t4 独立探针）：占其所在 `<td>` 单元格宽的 **0.3377** —— 与本次缺陷同量级。
但它**不是页面级说明**：它是 `/plans/coding/` 表格行内「详情」披露面板里的长文区块（`dl` + 引文），
放宽后最长字迹会到 **869.83px**。按 prompt §20（局部组件可保留合理限制）+ §9（不擅自扩大任务）⇒ **保留**。

未来版本的两种候选处置：**(a) 居中**（`margin-inline: auto`，对应 prompt §6.3「窄阅读列必须居中」）；
**(b) 放宽**。两者都留待未来版本裁定，本版本不动它。

> 证据：`research/_raw/secondary-page-layout-unification/verify/retained-narrow.log`（② 行：`相对单元格 min 0.337745 · median 0.337745 · max 0.337745`） ·
> `.../verify/pdetail-followup.log`（`max-width:none 后 bodyBox=1356` · `#5 ul.pev … 最长字迹 445px → 869.83px`） ·
> `research/secondary-page-layout-unification-self-audit.md`（§3.2）

#### ③ `writing-mode` 形态的覆盖面 —— **已重测 · P1 / DEFERRED**（用户裁定：如实披露，直接发布）

形态 **`writing-mode-vertical-fullwidth`**
（`.snote { writing-mode: vertical-rl; width: 100%; height: 5.6rem; overflow: hidden }`，页面 `category/agent/` 的 **#0** 条）。
**一句话结论**：在**轮 6 口径**（判据 sha **`2cbc160dc64f8ade…`**）下，它**没有被「窄柱」那两条牙咬中** ——
`note-narrow` 与 `note-ink-narrow` 在 **5 档（1440/1600/760/390/360）全是 0**；
**唯一咬到它的是 `note-clipped`，且只在 @360 一档**（说明**自身横向溢出 19px**，`scrollWidth 347 > clientWidth 328`），
整轮 **852 项 / 失败 1 ⇒ EXIT=1**。⇒ 正是本报告 §J ③ 原先预设的**第二种结局**（「仍只有 @360 靠溢出副作用接住」）。

**五档逐值（注入形态；由 t31 的自写探针实测 + 门禁自己的嘴双读）**：

| 档 | 盒宽 border-box | 内容盒代理量 | 字形盒数 | 横排归并 | 竖排归并 | 单字形盒宽 | 自身 scrollW/clientW | 页面 scrollW/clientW | **§22c 违规码** |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **1440** | 1380 | 1380 | 24 | 1 行（最宽 342.25） | **17 列**（最宽 87.3） | 16 | 1380/1380（0） | 1440/1440（0） | **无**（门禁标「竖排 3 条」却 0 码） |
| **1600** | 1380 | 1380 | 24 | 1 行（342.25） | 17 列（87.3） | 16 | 1380/1380（0） | 1600/1600（0） | **无** |
| **760** | 728 | 728 | 24 | 1 行（342.25） | 17 列（87.3） | 16 | 728/728（0） | 760/760（0） | **无**（@760 样本集 0 违规码） |
| **390** | 358 | 358 | 24 | 1 行（342.25） | 17 列（87.3） | 16 | 358/358（0） | 390/390（0） | **无**（390 档只量页面溢出 = 0） |
| **360** | 328 | 328 | 24 | 1 行（342.25） | 17 列（87.3） | 16 | **347/328（溢出 19）** | 360/360（0） | **`note-clipped`**（1 条，@360 样本集） |

现场尺子：**70ch = 452.81px**；列宽 1440/1600 = **1380** · 760 = **728** · 390 = **358** · 360 = **328**
⇒ ② 的物理前置条件 `min(列) > 70ch` 在 1440/1600/760 **成立**、在 390/360 **不成立**。
**线上产物原样（未注入）五档全绿**：该条是正常横排说明，字迹用满列宽（**1351.69/1380 = 98%** · 724.39/728 = 99.5% · 327.3/328 = 99.8%），0 码
⇒ **「修复后的产物本来是对的」也逐档量过了**。

**为什么两条「窄柱」牙咬不到它（物理原因，逐条）**：

1. **① `note-narrow` 量的是内容盒代理量**：竖排不改变盒子几何 —— 这条的盒/内容盒在 5 档**恒等于列宽**（1380/728/358/328），阈值 1173/618.8/304.3/278.8 全不满足。
2. **② `note-ink-narrow` 对竖排显式不判**（源码 §22c 头注释 **L6166–6169**：「竖排的『行』是竖列，横排意义的行宽在这里没有对应量 ⇒ 显式不判（`metrics` 里标 `vertical=true`）」）；
   即使不排除也过不了前置：按 y 重叠归并这条**只有 1 行**（17 个竖排片段按 x 重叠归并成 **17 列**），`lineCount >= 2` 不成立。
3. **③ 不是藏字**：24 个可见字形盒、并集 **342.25 × 87.3**，文字真的画出来了 ⇒ `note-hidden-text` **不该响**（响在这里才是误报），实测也没响。
4. **④ `note-clipped` 只在「盒子装不下那根竖条」时才响**：竖条并集宽 **342.25**，@360 盒 **328** ⇒ 溢出 **19px** ⇒ 咬中；
   **同页 @390 盒 358 ≥ 347 ⇒ 0 码** —— 同一根不可读的竖条、肉眼一样糟，判据却沉默，这就是覆盖不对称的边界所在。
5. **⑤ 页面级溢出不成立**：`overflow: hidden` 把溢出留在盒子内部，`documentElement.scrollWidth` 5 档恒等于视口 ⇒ `page-overflow@<vw>` 不响。

**用户裁定：记 P1（不是 P0），三条理由（逐条）**：

1. **「70ch 窄柱」这条承诺没有被绕过** —— 该条**可见正文在**（24 个字形盒、单字形盒宽 16px），**盒与内容盒都未被压窄**（两者 5 档恒满列宽）；
   它是「盒满宽 + 正文竖成一根 16px 细条」，属于同族**变体**，不是承诺里那一类。
2. **竖排不判是判据「显式声明的边界」，不是静默的洞** —— `verify-site.js` §22c 的 L6166–6169 明文写了「竖排不判」并给出理由，
   门禁也确实**看见了**这条是竖排（`metrics.layoutSweep.verticalNotes = 3` / 形态副本轮），只是按声明放过。
3. **产物本身五档全绿、无缺陷** —— 线上 `dist` 原样：`--dir=dist` **852 / 0**，几何逐档都量过（字迹用满列宽）。

**假绿路径（必须写清，这是它为什么仍是 P1 而不是「无事」）**：

- **1440 / 1600 是逐条判全站 186 页的唯一两档**，对它**完全无感**（两条牙都不响）。
- 能接住它的**只有 760/360 样本集（29 页）**里 @360 的自裁切副作用，而这需要**两个偶然条件同时成立**：
  (a) 该页在 29 页样本集内；(b) 盒子宽度小于那根竖条的并集宽（本轮 `328 < 347`）。
- **同一个形态若落在不在样本集里的 wide 页上、或 `height` 更小（竖条更短）使盒子装得下，就是全档 `852 / 0` 的假绿** ——
  **同一页的 @390 档（盒 358 ≥ 347）已经当场演示了「装得下 ⇒ 0 码」**。

**requiredFix（留给下一轮，属 `scripts/tools/verify-site.js`；本版本按用户裁定不修、不开修复轮 7）**：
把逐行归并按 `writing-mode` **参数化** —— 竖排改成**按列归并**并判列内字迹宽（t31 的探针已能稳定量到「单字形盒 16px / 竖排 17 列」这两个数）；
或对 `vertical === true` 的条改判「**单字形盒宽 < 0.85 × 列宽**」。两者都能在 **1440 档**咬中，从而把这条 P1 闭合。

**轮 3 当时为什么记为「未定」（补记）**：**轮 2 是唯一真测过本形态的一轮**（`4f4cb2e3` 口径）；
轮 3 的形态抽样里只有 **`vertical-rl` + `height` 的变体**（盒宽被内容反推 ⇒ 被 `note-narrow` 咬中），
**没有量过本轮的 `width: 100%` 变体**；轮 3 的机制登记（`adversary/calibration-report.md` L54）只把「归并容差没有参数化」记为**将来要细分**。
⇒ 本形态在轮 3–轮 6 之间一直**没有被任何装置重测**，直到 **t31 定点重测**才收口。

> 证据：**`research/_raw/secondary-page-layout-unification/verify/T31-WRITING-MODE.md`**（§1 定性 · §3 五档逐值 · §4 门禁两次读数 · §5 物理原因 · §6 P1 裁定与 requiredFix · §7 轮 3 为何未定） ·
> `.../verify/t31/writing-mode-probe.cjs`（自写探针） · `.../verify/t31/probe-{dist,form}.json` · `.../verify/t31/gate-{form,dist}.json` · `.../verify/t31/post-checks.txt` ·
> 历史读数：`.../adversary/runs/coverage-asymmetry-writing-mode.json`（轮 2） · `.../adversary/forms-table.md`（第 15 行） · `.../adversary/calibration-report.md`（L54 归并容差边界）

#### ④ 过程缺陷：t7 原地重写 `verify-site.js` 未留备份

t7 用 `teeth/_scratch/splice-22c.cjs` **原地整块替换**了 §22c，**没有留备份**，也没有把替换前后的 diff 落盘。
于是修复前那一版（sha256 `4cae2fb2ab2599997668feca8c26c3161fe882a518e61d01552b7adc95f95756`）**在磁盘上不复存在**：
`git show HEAD:` 给的是**未含 §22c** 的基线，git 悬空对象（190 个）、其它 worktree、`%TEMP%` **全部 0 命中**。
captain 从 T3 当初抓的 `diff/02-source-diff.patch` 里**逐字节复原**（`recovered/recover-pre-t7.cjs` 自带 sha 断言，
不等即退出码 4），并用 junction 沙箱让它可以被运行而不碰生产文件。

**流程改进（写进本版本的教训）**：**任何原地重写产物源码的动作，都必须先落 `<file>.pre-<task>.bak`
并把替换 diff 写进自己的证据目录。以当前 sha 为准 —— 文件一动，该轮读数即失效。**
**该要求已写进 t14 / t19 的契约（硬要求）**：t19 交回时确实留了 `teeth/_backup/verify-site.pre-t19.bak` 与 `teeth/verify-site.t19.diff`。

> 证据：`research/_raw/secondary-page-layout-unification/recovered/README.md` · `.../recovered/pre-t7-run-note.txt` · `.../diff/02-source-diff.patch` ·
> `.../teeth/_backup/verify-site.pre-t19.bak` · `.../teeth/verify-site.t19.diff`

#### ⑤ 已知的口径越界小疵：`verify/mutations.json` 的落点

`research/_raw/secondary-page-layout-unification/verify/mutations.json` 是**某次 `--url=` 模式运行的 `--json=` 落点越界**
（最可能是 t7）：文件里 `"target": "http://127.0.0.1:59729/"`、`"dir": "dist.baseline"`、
`generatedAt 2026-10-06T08:22:15.650Z`，而那一轮的 `layoutSweep`/`rows` 是**改动前产物**、**旧判据**的读数。
实测文件大小 **9415 字节**（captain 早前口述为「4 KB」—— 那是**估的、没量**；本条按实测写，
并把它作为「**连 captain 给的数字也要被量一遍**」这条纪律的一个实例登记在此）。
它**无害**（不影响任何判据、也不被任何断言消费），但会让「按目录名找证据」的人以为 `verify/` 里有一份当前轮的牙 ——
**轮 4 的权威牙在 `t21/geometry/mutations.json` 与 `teeth/_scratch/mutations.json`**。

> 证据：`research/_raw/secondary-page-layout-unification/verify/mutations.json` · `.../t21/geometry/mutations.json` · `.../teeth/_scratch/mutations.json`

#### ⑥ 报告自身的两条诚实性标注（保留）

1. **`--compare` 的「页高 4589px → 4787px」不能当成本次改动的证据**：它的基线是
   `research/_raw/ours-baseline/verify.json`（生成于 **2026-09-29T12:05:42.914Z**），**不是** `dist.baseline`，
   所以那 198px 跨了多个版本。首页的**同版本**证据是 `geometry/before-after.md` §2 的六档逐档相同（§F.1）。
2. **「26.2%」是推导值，不是实测值**：它由两个已引用读数相除得到（`notesChecked 105` ÷ `notesJudged 401`），
   报告里已明确标注为推导（§B.0 第 2 条）。t22 的独立抽查也复核了它。

> 证据：`research/_raw/secondary-page-layout-unification/gate/steps/48-regression-verify-baseline-compare.txt`（§12 + 基线行） ·
> `.../geometry/before-after.md`（§2 `/` 六行） · `.../verify/T22-GATE-SELF-AUDIT.md`（§5 N12）

#### ⑦ 判据的「消费者」也要跟着改（**已闭合 by t18**）

`geometry/gate-vs-truth.cjs` 原来按**单一码**判窄（`startsWith('note-narrow')`）⇒ 并集口径下那 **108 条** `note-ink-narrow`
会被判成「不窄」，`--expect=baseline` 会报**假的「漏判 108 条」**。
**t18 已修**：`NARROW_CODE_RE = /^note-(ink-)?narrow$/` + `isNarrowCode()`（页级与条级两处都换掉），
并用**合成输入**证明既不误放行也不误拦截；同时普查了硬编码违规码的消费者（`geometry/report-consumers.md`）。
轮 4 复算：`--expect=green` pass / `--expect=baseline` pass（漏判 0 · 误报 0 · 条级容器在位）。

**教训（单列）**：判据**扩容**（一个码拆两个、或改成并集）时，**所有按码名做判断的消费者都会静默过期** ——
它们不会红，只会给出**看起来合理但错**的结论。改判据的契约必须包含「消费者普查」。

> 证据：`research/_raw/secondary-page-layout-unification/geometry/report-consumers.md` · `.../geometry/gate-vs-truth.cjs` · `.../t21/t21-summary.json`（T6/T7）

#### ⑧ `display:contents` + 祖先 70ch 轨的**单行条**（low，认知边界；**页级断言仍红**）

**具体形状**：`display: contents` 挂在 `.snote` 上（**让元素自己不产生盒子**），同时祖先/网格轨把可用宽压到 **452.81px**。
此时那一条说明：`rendered = false`（盒宽 0）⇒ `note-narrow` / `note-axis` / `note-clipped` 三条**盒量前置**全部不成立；
若该条又是**单行**（`lineCount = 1`）⇒ `note-ink-narrow` 的 `lineCount ≥ 2` 前置也不成立 ⇒ **该条无任何码**。

**轮 4 的量化**：t20 的变体 V5 在 **3 页**里量到 **16 条单行**落在 452.81px 轨里（既无盒量、也无行证据 ⇒ 不判）；
同批 **14 条多行**被 `note-ink-narrow` 咬中（6/5/3）。**关键的一点：每一页都仍然红** ——
页级断言由同页那些多行条兜住，**不是整页假绿**。

**为什么不本轮修**：① 该形态**不是本版要防的缺陷形态**（它是「元素自己不产生盒子」，属渲染结构的极端写法）；
② 要收它需要给「无盒」的说明补一条**独立的**证据通道（例如从祖先网格轨反推可用宽），
而这条通道的误报面尚未标定；③ 它是**已经被量化、且页级有兜底**的认知边界，不是未知漏洞。
**`display:contents` 的假红面倒是已修好**：全站 186 页都挂 `display: contents` 时，
**改前 401/401 条全假红（`note-narrow 401` + `note-axis 401`）→ 改后 401 条全 0 码**（t19 的 R3-3 订正；t20 放大到全站复算）。

> 证据：`research/_raw/secondary-page-layout-unification/review/t20/T20-ROUND4.md`（§5 `display:contents` 不再假红 + 残余边界 V5 读数） ·
> `.../teeth/_scratch/r4-contents-before.log` / `r4-contents-after.log`（全站 `contents` 的改前/改后） ·
> `.../verify/T22-GATE-SELF-AUDIT.md`（§6.3 域外残余）

#### ⑨ @360 的**域外残余**：比 70ch 更窄的轨 + 直接文本节点（low）

**具体形状**：`plans/` 注入 `grid-template-columns: 200px 1fr`（**比 70ch 更窄的轨**），@360 档：
12 条里 **8 条**被 `note-narrow`（内容盒）咬中，但 **2 条**（`plans/#0`、`plans/#2`，最宽一行 **192.23 / 192.67px**，
内容盒 **328 / 302px**）**任何一轮都不判** —— 因为 @360 的物理前置条件 `328 < 452.81` 不成立（② 不适用），
而内容盒 328 ≥ `0.85 × 328 = 278.8`（① 也不判）。@1440 同样这 2 条会被 ② 咬中。
**性质**：域外（不是 70ch 家族）、需要「比 70ch 还窄的轨 + 直接文本节点」才会出现；**同页页级断言仍由被 ① 咬中的 8 条兜红**。
可选修法（未采纳）：把物理前置条件的尺子从「70ch」放宽到「`0.85 × 列宽` 以下的最小可排宽度」。

> 证据：`research/_raw/secondary-page-layout-unification/verify/T22-GATE-SELF-AUDIT.md`（§6.3 · §7 F2）

#### ⑩ **T22-F1：裸 `font-size:0` 让整条变成「未渲染」⇒ 假绿面** —— **已闭合（轮 5 立判据 · 轮 6 收掉豁免键）**

**具体形状**：`.snote { font-size: 0 }`（**没有**高度恢复器）⇒ 盒高被压成 **0** ⇒ `rendered = false`、`glyphRects = 0`，
但 `textLength > 0`（`plans/` 最长 **121** 字）。三条判据的入口都要求 `rendered`（或 `glyphRects > 0`）⇒ **该页零码**，而正文肉眼消失。
**触发面（轮 4 实测）**：`docs/data/` 9 条 / `plans/` 12 条，**全部** `rendered=false`。
**关键对照**：**逐字采用 M12 的规则**（`font-size:0` **+** `::before{content;display:block;max-width:70ch;font-size:var(--fs-sm)}`）时
`note-hidden-text` **正常命中 3 条** ⇒ **带高度恢复器的被咬住、去掉恢复器的反而全绿**。
**修复前的病灶**：`metrics.unrenderedNotes` 只是 metric —— t22 逐条查过源码，**没有任何断言引用它**
（`dist` 上原本只有 **1** 条未渲染说明：`plans/coding/#1` 的 `<noscript>` 条）。

**闭合过程**：

| 轮次 | 做了什么 | 反证读数 |
| --- | --- | --- |
| **轮 5** | 新增判据 ④ `!rendered && textLength>0 && glyphRects===0 && !noscriptSubtree` ⇒ **`note-unrendered`**；给 `unrenderedNotes` 加**上界断言**；新牙 **M13** | 裸 `font-size:0` 注入 `plans/`：改前 binary **EXIT=0 / 848 / 0 失败** → 改后 **EXIT=1 / 852 / 5 条失败全部含 `note-unrendered`** |
| **轮 6** | **收掉轮 5 自引入的标记级豁免键**：删掉 `&& !note.noscriptSubtree`（豁免只剩「**可见文本长度为 0**」）；上界断言两桶改为**显式不相交**（交集 0 · 并集 = `unrenderedNotes` · 未归类 0） | `font-size:0` + 每条说明插**空** `<noscript></noscript>`：改前 binary **EXIT=0 / 852 / 0 失败** → 改后 **EXIT=1 / 852 / 4 条失败全部含 `note-unrendered`**（`noscriptSubtree=true` 也照咬） |

> 证据：`research/_raw/secondary-page-layout-unification/verify/T22-GATE-SELF-AUDIT.md`（§6.4 · §7 F1） ·
> `.../teeth/T24-ROUND5.md`（轮 5） · `.../review/t26/T26-ROUND5.md`（轮 5 残余面） ·
> **`.../teeth/T28-ROUND6.md` + `.../review/t29/T29-ROUND6.md`（轮 6 闭合：A/B · 计数不相交 · 未削弱）** ·
> `.../teeth/_scratch/r6-empty-noscript-report.json` · `.../verify/forms-reach-r4.json` · `.../verify/t22-analysis.json`

#### ⑭ 轮 6 的两条如实登记（**本轮必须写**）

**① 被收掉的「标记级豁免键」——收法与反证**

- **缺陷形状**：轮 5 的判据 ④ 带了 `&& !note.noscriptSubtree`。于是**只要有标记**（哪怕是一个**空**的 `<noscript></noscript>`）就不会被判 ——
  同一份 `font-size:0` 正文消失的缺陷，在**每条说明里插一个空 `<noscript>`** 之后整轮回到 **EXIT=0 / 852 项 / 0 失败**。
  它是**本轮新引入**的（相对改前不是新增缺口：同形用改前 binary 跑也是 EXIT=0）。
- **收法**：`if (!note.rendered && note.textLength > 0 && note.glyphRects === 0)` —— **豁免只剩「可见文本长度为 0」**，
  `<noscript>` **降为诊断量**（`unrenderedNoscript`，不再吞并计数）；上界断言两桶（`textLength === 0` ∪ `note-unrendered`）
  改为**显式不相交**，并钉「交集 0 · 并集 = `unrenderedNotes` · 未归类 0」。
- **反证**：`fs0` + `plans/` **12 条**说明各插**空** `<noscript>` ⇒ 改前 **EXIT=0**、改后 **EXIT=1**（4 条失败全含 `note-unrendered`），
  条级读数 `textLength>0 · glyphRects=0 · noscriptSubtree=true · codes=["note-unrendered"]` ⇒ **标记在、照样咬**。
  合法的 `plans/coding/#1`（标记在、`textLength=0`、`rawTextLength 44`）**仍被放过** ⇒ 证明**豁免与标记无关**。
- **未削弱**：0.85 与 `lineCount>=2` 逐字未改；静态 `check(` **483 → 483**；运行期名字 852 → 852，**归一化后缺失 0 / 新增 1**
  （上界断言因**语义变更改名 1 条**，已逐字登记）；§22b 切片 37318 B / sha16 `077dc51ef68af7fd` **逐字节相同**；新增 48 行**零像素/颜色 API**。

**② 残余面：**空说明**的口径变化（P1 / DEFERRED，**内容面，不在 §22c 布局口径内**）

- **具体形状**：豁免从「带 `noscript` 标记」换成「可见文本长度为 0」之后，**空说明**
  （内容被清空：未渲染 + `textLength === 0` + **无标记**）从旧版上界断言的 **✗** 变成新版 **✓**
  （复审实测 `empty-notes`：`new ✓ / old ✗`）。
- **为什么不算布局缺陷**：空说明**没有可画的正文** ⇒ 它**不隐藏任何可见的布局缺陷**；
  而且「内容被清空」这件事本来就落在本版本的**两条不变量**上（文案 0 变化 · 剥掉 `<style>` 后正文逐字节相同）。
- **修法（将来）**：`metrics.unrenderedNoTextNotes` **已导出**，将来若要把「空说明」也守起来，单加一条上界断言即可
  （纯内容面口径，需要一轮单独裁定）。

> 证据：`research/_raw/secondary-page-layout-unification/teeth/T28-ROUND6.md`（修法 · 不变量 10/10 · 反证 · 诚实项） ·
> `.../review/t29/T29-ROUND6.md`（A/B 空 noscript · 豁免与标记无关 · 计数不相交 + 非恒真 · 登记的口径变化）

#### ⑪ 证据侧消费者：几何真值脚本的**过时归属前提** —— **已订正（t25）**

**具体形状**：`geometry/make-truth-401.cjs`（L6–7、L54–56 的 `index === 0 ? …`）与
`geometry/make-synthetic-reports.cjs`（L6、L96–97、L115）仍按**旧口径**叙述：
「旧口径只逮 48 条 / 108 条是 `index > 0` / 盒宽满宽」。
而轮 4 的实测是：**① = 156 条（盒宽全 452.81）· ② = 108 且 ② ⊆ ①**，`caughtByOldCriteria(48)` 只是**按序切分的位置切片**
（那 48 条**全是多行**、且都落在 ② 里；① 里那 48 条**单行**反而全在 `onlyNewTruth`）。
**影响**：**真值语义不受影响**（消费者只消费并集），但它会**误导后续复核/夹具作者**。
**处置（已完成 · t25）**：

| 项 | 结果 |
| --- | --- |
| 改动文件 | `geometry/make-truth-401.cjs` → sha256 **`a9e06e6b…`** · `geometry/make-synthetic-reports.cjs` → sha256 **`4f4d126d…`** |
| `truth-401.json` | **数值未变**：重跑深比 **NUMBER-DIFF 0 / STRUCT-DIFF 0** ⇒ 订正只动**说明性措辞**，不动真值 |
| 消费者复跑 | `gate-vs-truth` 对 **green 与 baseline 各两份报告**复跑：**pass、漏判 0、误报 0** |
| 交付说明 | `research/_raw/secondary-page-layout-unification/geometry/CONSUMER-FIX.md` |

> 证据：`research/_raw/secondary-page-layout-unification/geometry/CONSUMER-FIX.md` ·
> `.../geometry/attribution-census.cjs` + `.../geometry/attribution-census.json`（过时措辞的全仓普查） ·
> `.../review/t20/T20-ROUND4.md`（§4 R3-2 逐条复算 · §6 交接项 + append-only 补充）

#### ⑬ **同类过时措辞的残留清单**（P1 / **DEFERRED**，**不在 t25 范围内，未修**）

t25 在 `CONSUMER-FIX.md` **§7** 里留了一份**同类过时措辞**清单 —— 它们**仍是旧口径的表述**，
**没有被本轮修掉**（本报告**不写成已修**）：

| # | 位置（行号来自 `CONSUMER-FIX.md` §7） | 过时措辞 | 性质 |
| --- | --- | --- | --- |
| 1 | `geometry/gate-vs-truth.cjs` **L11 / L17** | 关于「48 条是 `index === 0` 命中」的说明 | **注释/说明性字符串**，不影响判据（该脚本的**代码**已由 t18 改成 `^note-(ink-)?narrow$`） |
| 2 | `geometry/report-consumers.md` **L52** | 同一口径的叙述 | **文档**，会误导后续复核/夹具作者 |
| 3 | `geometry/truth-401.json` 的**说明性字符串**（如 `usageForNewGate`） | 「旧口径只逮 48」的措辞 | **真值数值未变**（见 ⑪），但字段里的**文字**仍按旧口径叙述 |
| 4 | t21 **抽取产物的 `expectationNote`**（`t21/geometry/mutations.json` 等） | 抽取时带出的期望说明 | **产物**，下一轮重跑抽取即刷新 |

**为什么不本轮修**：① 四处**都不改变任何判定结果**（数值与代码判据都已正确）；
② 它们分散在 `geometry/**` 与**已冻结的抽取产物**里，改动会牵连已落盘的证据文件；
③ 性质与 §J ⑫（源码注释口径）同类，属「下一轮顺手订正」。

**将来收口时的一句话口径**：把「48 = 旧口径命中」统一改述为
「**48 = `index === 0` 的位置切片**；旧口径实际只能看见 **156** 条中的 **48** 条」。

> 证据：`research/_raw/secondary-page-layout-unification/geometry/CONSUMER-FIX.md`（**§7 同类过时措辞清单**，含逐条行号） ·
> `.../geometry/report-consumers.md` · `.../geometry/gate-vs-truth.cjs` · `.../t21/geometry/mutations.json`

#### ⑫ 源码注释的过时口径（low，纯注释）

`verify-site.js:6562` 的注释写「@1600 列 1240–1500」，而报告与 t22 的实测都是 **1120–1380**。
**纯注释口径过时，不影响任何判定**；**轮 4 / 轮 5 / 轮 6 都没有动它**（t24/t28 的改动全在 §22c 的判据与断言，没碰这一行注释）⇒ 留给下一次动这一段的轮次顺手订正（low）。

> 证据：`research/_raw/secondary-page-layout-unification/verify/T22-GATE-SELF-AUDIT.md`（§5 N03 · §7 F3）

### 已闭合项（本轮明确登记，避免被读成仍开着）

| 项 | 闭合轮次 | 闭合读数 |
| --- | --- | --- |
| **R3-1 · ≤760 的媒体查询限定窄化** | **轮 4（t19）** | 同一份产物：改前整轮 **EXIT=0**（假绿）/ 改后 **EXIT=1**，命中 **6 条 `note-ink-narrow`** `[changes/#0 #1 #2 #4 #8 #12]`；不注入的同一副本 EXIT=0 |
| **`display:contents` 的假红面** | 轮 4（t19 R3-3） | 全站 186 页挂 `display: contents`：**改前 401/401 条全假红 → 改后 401 条全 0 码** |
| **判据消费者的单码假设** | 轮 4（t18） | `^note-(ink-)?narrow$`；`--expect=green/baseline` 双 pass |
| **「48 / 108 的归属」表述** | 轮 4（t20 §4 复算） | ① = **156**（全 452.81）· ② = **108**（② ⊆ ①）· 「89 条」复算为 **319**（@1440 与 @1600 都是 319） |
| **T22-F1 · 裸 `font-size:0` 的「未渲染」假绿面** | **轮 5（立判据 + 上界断言）** | 改前 binary **EXIT=0 / 848 / 0 失败** → 改后 **EXIT=1 / 852 / 5 条失败全部含 `note-unrendered`** |
| **轮 5 自引入的「标记级豁免键」（空 `<noscript>` 让三牙静默）** | **轮 6（t28）** | 删掉 `&& !note.noscriptSubtree` + 上界计数改不相交；改前 **EXIT=0 / 852 / 0 失败** → 改后 **EXIT=1 / 852 / 4 条失败全部含 `note-unrendered`**（`noscriptSubtree=true` 也咬） |
| **几何真值脚本的过时归属前提** | **轮 4 后（t25）** | `make-truth-401.cjs` → `a9e06e6b…` · `make-synthetic-reports.cjs` → `4f4d126d…`；`truth-401.json` **NUMBER-DIFF 0 / STRUCT-DIFF 0**；`gate-vs-truth` 双报告复跑 pass（漏判 0 / 误报 0）。**同类措辞残留见 ⑬（未修）** |

> 证据：`research/_raw/secondary-page-layout-unification/review/t20/T20-ROUND4.md`（§1 / §4 / §5） · `.../t21/t21-summary.json`（step8/step9） ·
> `.../geometry/report-consumers.md`

---

## 附录 · 本文用到的证据索引

| 证据 | 覆盖的本文章节 | 路径（相对 worktree 根） |
| --- | --- | --- |
| 基线 commit | §A.1 | `research/_raw/secondary-page-layout-unification/t1/00-baseline-head.txt` |
| git 内容不变证明 | §A.1 / §D.4 | `research/_raw/secondary-page-layout-unification/diff/01-git-content-proof.txt` |
| 环境与产物计数 | §A.2 / §A.3 | `research/_raw/secondary-page-layout-unification/baseline/README.txt` |
| 构建读数 | §A.3 / §A.4 | `research/_raw/secondary-page-layout-unification/build/01-build-local.txt` · `.../build/03-build1-manifest.log` |
| 只读基线完整性 | §A.3 | `research/_raw/secondary-page-layout-unification/t1/09-baseline-integrity.txt` |
| 壳 ↔ `.snote` 规则映射（本文推导，机器生成） | §B.0 / §C.1 | `research/_raw/secondary-page-layout-unification/docs/01-shell-snote-map.txt` |
| 改动前 grep | §B.0 / §C.1 | `research/_raw/secondary-page-layout-unification/t1/01-before-snote-grep.txt` |
| 独立几何探针 before/after | §A.4 / §B.0–§B.9 | `research/_raw/secondary-page-layout-unification/geometry/01-before-probe.log` · `.../geometry/02-after-probe.log` |
| Before/After 对照表与逐条读数 | §B（全节） | `research/_raw/secondary-page-layout-unification/geometry/before-after.md` |
| 401 条说明的真值与分类 | §B.10 | `research/_raw/secondary-page-layout-unification/geometry/truth-401.json` · `.../geometry/06-truth-401.log` |
| 冻结串与一处定义 | §D.2 | `research/_raw/secondary-page-layout-unification/t1/10-frozen-string-audit.txt` · `.../t1/07-dist-snote-audit.txt` · `.../t1/11-no-other-snote-rules.txt` |
| 产物字节对账 | §D.4 | `research/_raw/secondary-page-layout-unification/diff/03-nonhtml-sha256.log` · `.../diff/04-before-after-compare.log` · `.../t1/13-dist-vs-baseline.txt` |
| 独立字节复核（不引用 t3 脚本） | §D.4 | `research/_raw/secondary-page-layout-unification/verify/byte-compare.json` |
| `mainClass` 实测 | §D.2 / §B.8 | `research/_raw/secondary-page-layout-unification/t1/18-main-class-spotcheck.txt` |
| T1 证据摘要 | §D.1 / §D.2 | `research/_raw/secondary-page-layout-unification/t1/17-t1-summary.md` |
| §19/§20 审计 | §19（全节） | `research/_raw/secondary-page-layout-unification/audit/AUDIT-SUMMARY.md` · `.../audit/*.json` |
| 保留窄宽实测 | §19.3 / §J ①② | `research/_raw/secondary-page-layout-unification/verify/retained-narrow.log` · `.../verify/pdetail-followup.log` |
| 门禁占位读数 | §D.3 | `research/_raw/secondary-page-layout-unification/teeth/README.md` · `.../geometry/gate-vs-truth-*.log` |
| 复原件与过程缺陷 | §J ④ | `research/_raw/secondary-page-layout-unification/recovered/README.md` |
| 独立复核 Self-Audit | §B / §D.4 / §J | `research/secondary-page-layout-unification-self-audit.md` |
| **§E/F/G/H 的权威读数汇总** | §E / §F / §G / §H | `research/_raw/secondary-page-layout-unification/t3/README.md`（§4.1–§4.3 · §5 · §6 · §7.0–§7.4） |
| 改动后权威几何报告 | §E / §F / §G | `research/_raw/secondary-page-layout-unification/geometry/after-verify.json` · `.../geometry/07-after-verify-green.log` |
| 高度 / 溢出 / `detail-main` 探针 | §F.3 / §F.4 / §F.5 / §F.6 | `research/_raw/secondary-page-layout-unification/verify/height-overflow.json` · `.../verify/height-overflow.log` |
| 变异牙逐条 | §G.2 / §G.3 / §G.4 | `research/_raw/secondary-page-layout-unification/mutations-real/M-summary.json` · `.../mutations-real/M1.json` … `M10.json` |
| M0 反证 | §G.1 / §G.6 | `research/_raw/secondary-page-layout-unification/mutations-real/M0-baseline.json` · `.../mutations-real/M0-baseline-summary.json` |
| M-disk 落盘级变异 | §G.5 | `research/_raw/secondary-page-layout-unification/mutations-real/M-disk.json` · `.../mutations-real/M-disk.log` |
| 判据前后对照 | §G.6 | `research/_raw/secondary-page-layout-unification/recovered/pre-t7-M0-baseline.json` · `.../recovered/gate-vs-truth-pre-t7-strict.json` |
| Full Gate 汇总与逐步日志 | §H.1 / §H.2 / §H.4 | `research/_raw/secondary-page-layout-unification/gate/01-static-run.txt` · `.../gate/03-browser-rerun.txt` · `.../gate/steps/summary.json` |
| 回归比对（`--compare` 六项） | §F.1 / §F.6 | `research/_raw/secondary-page-layout-unification/gate/steps/48-regression-verify-baseline-compare.txt` · `.../gate/steps/47-real-browser-acceptance-verify-site-js.txt` |
| CI 必需检查名与发布顺序 | §H.3 / §I | `research/_raw/secondary-page-layout-unification/release/checklist.md`（§2.1 / S7 / S11） |
| 三轮对抗的判据绕过（round 1 / round 2） | §C.5 / §J 故事线 / §J ① | `research/_raw/secondary-page-layout-unification/review.md`（§§3 · §R2-2 · §R2-3 · §R2-1.8） |
| 15 条绕过形态逐条判定 | §C.5 / §J ①③ | `research/_raw/secondary-page-layout-unification/adversary/forms-table.md` · `.../adversary/README.md` |
| 绘制/遮罩类普查（252 源文件 + 186 产物） | §J ① | `research/_raw/secondary-page-layout-unification/adversary/runs/clip-census.json` · `.../adversary/clip-census.cjs` |
| **`writing-mode` 覆盖不对称的定点重测（t31 · 结论 P1/DEFERRED）** | §J ③ | `research/_raw/secondary-page-layout-unification/verify/T31-WRITING-MODE.md` · `.../verify/t31/probe-{dist,form}.json` · `.../verify/t31/gate-{form,dist}.json` · `.../verify/t31/post-checks.txt` |
| `writing-mode` 覆盖不对称（轮 2 的历史读数） | §J ③ | `research/_raw/secondary-page-layout-unification/adversary/runs/coverage-asymmetry-writing-mode.json` · `.../adversary/runs/modeB-after-1.json` · `.../adversary/calibration-report.md`（L54） |
| `verify/mutations.json` 落点越界小疵 | §J ⑤ | `research/_raw/secondary-page-layout-unification/verify/mutations.json` |
| 判据扩容后的消费者（单码判窄的隐含假设） | §J ⑦ | `research/_raw/secondary-page-layout-unification/geometry/gate-vs-truth.cjs` |
| **t25 证据侧消费者订正（已闭合）+ 同类措辞残留** | §J ⑪ / §J ⑬ | `research/_raw/secondary-page-layout-unification/geometry/CONSUMER-FIX.md`（**§7 残留清单含行号**） · `.../geometry/attribution-census.json` |
| 三份长期文档的改动前后对照 | §J / 附录 | `research/_raw/secondary-page-layout-unification/docs/02-git-status-and-diffstat.txt` · `.../docs/03-docs-diff-stat.txt` |
| **轮 4 冻结读数（判据 sha `fd3c9a30…`）** | §D.3 / §G / §H | `research/_raw/secondary-page-layout-unification/t21/t21-summary.json`（step1/step3/step4/step5/step6/step7/step10/step11/step12/step13） · `.../t21/geometry/mutations.json` |
| 轮 4 修复与复审 | §C.5 / §H.5 / §J | `research/_raw/secondary-page-layout-unification/teeth/T19-ROUND4.md` · `.../teeth/verify-site.t19.diff` · `.../teeth/_backup/verify-site.pre-t19.bak` · `.../review/t20/T20-ROUND4.md` |
| 门禁侧 self-audit（四轮对照 / 数字抽查 / 残余盲区） | §C.5 / §G / §H / §J ⑧⑨⑩⑫ | `research/_raw/secondary-page-layout-unification/verify/T22-GATE-SELF-AUDIT.md` · `.../verify/t22-analysis.json` · `.../verify/forms-reach-r4.json` · `.../verify/probe-r4-forms.json` |
| 判据消费者的适配与普查（t18） | §J ⑦ | `research/_raw/secondary-page-layout-unification/geometry/report-consumers.md` · `.../geometry/gate-vs-truth.cjs` |
| **轮 5 / 轮 6 的修复与复审** | §D.3 / §G / §H / §J ⑩⑭ | `research/_raw/secondary-page-layout-unification/teeth/T24-ROUND5.md` · `.../teeth/T28-ROUND6.md` · `.../review/t26/T26-ROUND5.md` · `.../review/t29/T29-ROUND6.md` · `.../teeth/_scratch/r6-*.json` |

---


## §K 收口记录（**待填清单已清零**）

> **本节的旧「待填清单」（K01–K20）已全部填写完毕**：轮 5（t24 / t26）与轮 6（t28 / t29）的数字都已按行号回填，
> 报告内**不再有任何轮 5 的待定占位**（下一轮的填充清单已全部清空）。本节保留下来只为两件事：① 记录**这一轮到底改了哪几处**；
> ② 给后续版本一份「**这些数字下次该由谁产出**」的索引。
> **轮 6 与轮 5 的四个计数逐项相同**（`--dir=dist` 852/0 · `--dir=dist.baseline` 852/36 · 第 47 步 852 · 第 48 步 858），
> 区别只在 **判据 sha（`610b25a8…` → `2cbc160d…`）与豁免条件** —— 引用时**必须带轮次与 sha**。

### K.1 本轮（轮 6）实际回填的数字与位置

| # | 位置（章节） | 回填后的值（轮 6） | 数字来源 |
| --- | --- | --- | --- |
| K01 | 报告抬头「引用纪律」表 | 追加 **轮 6 行**（`2cbc160d` · 852 / 0 · 852 / 36）；轮 2–轮 5 行**保持不动**（历史值不覆盖） | t28 / t29 |
| K02 | §D.3 表 `--dir=dist` 行 | **852 项 / 失败 0** · `layoutViolations 0` · 未渲染 **1 条**（= `<noscript>` 1 + `note-unrendered` 0） | t28 / t29 |
| K03 | §D.3 表 `--dir=dist.baseline` 行 | **852 项 / 失败 36** · 并集 **156 / 48** · 新判据 0 命中 · M13 锚点类 **3** | t28 / t29 |
| K04 | §D.3 表 CI 口径行 | **38 项 / 失败 0**（判据清单未因轮 6 变动） | t28 |
| K05 | §G.1 表 | 「当前」列 = **轮 6（`2cbc160d`）**；与轮 5 同列读数**逐项相同**，已加注 | t28 / t29 |
| K06 | §G.2b | **M13**（轮 5 引入 · **轮 6 保持**）；M1–M12 在轮 5 / 轮 6 **全部仍 hit** | t28 |
| K07 | §H.1 表 第 47 / 48 步 | **852 项 0 失败** / **858 项 0 失败** | t28 / t29 |
| K08 | §H.2 表 | 第 3 列 = **轮 6**；表下已注明「轮 5 的这两步读数与轮 6 逐项相同」 | t28 / t29 |
| K09 | §H.4 表 | 导航 **631**（轮 6 未变；轮 2 = 628 · 轮 4 = 630） | t28 |
| K10 | §J ③ `writing-mode` | **仍待一次重测**（轮 3–轮 6 的装置都没有重测它）⇒ 保留 P1 / DEFERRED，收口办法写在那一节 | t11（历史读数） |
| K11 | §J ⑩ T22-F1 | **已闭合**（轮 5 立判据 + 上界断言；轮 6 收掉标记级豁免键） | t28 / t29 |
| K12 | §J ⑪ 几何真值脚本 | **已由 t25 完成**（无需再改） | t25 |
| K13 | §J ⑫ 源码注释 `verify-site.js:6562` | **仍开着**（轮 4/5/6 都没动它）⇒ 记为 low | t22（历史读数） |
| K14 | §J「已闭合项」表 | 现 **7 行**（新增 T22-F1、轮 6 标记级豁免键） | t28 / t29 |
| K15 | §J 残余项分级 | 已给出逐条形状与「已闭合 / 仍开着」的对照；**③ 与 ⑭② 是仅有的两个未决面** | 本文作者归并 |
| K16 | §I Online Smoke | **已回填（发布态实测）**：I.1 提交/合并 · I.2 CI · I.3 部署 · I.4 线上几何 smoke（8 页 / 79 项 / failed 0）· I.5 取证环境网络事实 | captain 发布 + t33 |
| K17 | `docs/DESIGN-RULES.md` | §6 S4 验证格 + 文末「落地情况」门禁行 → **轮 6（`2cbc160d`）** | t28 / t29 |
| K18 | `PROJECT_STATUS.md` | §0.3 表「门禁」行 → **轮 6**；「CI / Deploy / Online Smoke」行仍写「未发生」 | t28 / t29 |
| K19 | `NEXT-STEPS.md` | §0 剩余事项第 1 条 → **轮 6**（并清掉一处历史任务号） | t28 / t29 |
| K20 | `docs/03-docs-diff-stat.txt` | **整份重生成**（命令写在文件头） | 本文作者 |

### K.2 下次这些数字该由谁产出

| 数字 | 产出方 | 落点 |
| --- | --- | --- |
| 判据 sha / 断言数 / 失败数 | 修复轮（改 `verify-site.js`）+ 复审轮 | `teeth/T*-ROUND*.md` · `review/t*/T*-ROUND*.md` |
| 产物侧几何（§E / §F） | 已冻结，**不再需要重算** | `geometry/before-after.md` · `verify/*.json` |
| Full Gate 49 步 | 证据轮（改完判据后复跑 47/48） | `teeth/_scratch/r*-gate/summary.json` |
| CI `gate` / Deploy / 线上几何 | **captain 发布后** | `release/online-smoke-result.json` |

<!-- LINES:BEGIN -->
**行号索引（t33 回填 §I 后的快照；本块在文件末尾，改动它不会移动上面的行）**

| 章节 / 条目 | 行号 |
| --- | --- |
| §A 基线 | **L35** |
| §E Before/After | **L726** |
| §F Regression | **L818** |
| §G Mutation | **L906**（G.1 = **L919** · G.2b = **L961**） |
| §H Full Gate | **L1071**（H.1 = **L1077** · H.2 = **L1106** · **H.3 CI 已回填 = L1126** · H.4 = **L1137**） |
| **§I Online Smoke（已回填 · 发布态）** | **L1174** |
| §J Self Audit | **L1246**（故事线六轮表 = **L1253**） |
| §J ③ `writing-mode`（已重测 · P1/DEFERRED） | **L1322** |
| §J ⑩ T22-F1（已闭合） | **L1467** |
| §J ⑭ 轮 6 两条登记（豁免键 / 空说明口径） | **L1489** |
| §J ⑪ 几何真值脚本（t25 已闭合） | **L1518** |
| §J ⑬ 同类过时措辞残留（DEFERRED） | **L1539** |
| §J ⑫ 源码注释 `verify-site.js:6562`（low，仍开着） | **L1561** |
| §J「已闭合项」表 | **L1568** |
| 附录 · 证据索引 | **L1585** |
| §K 收口记录 | **L1637** |
<!-- LINES:END -->
