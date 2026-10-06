# 违规码消费者普查（t18 · 并集口径 `^note-(ink-)?narrow$`）

> **背景**：t14（修复轮 3）把 §22c 的窄柱判据从**单一码**改成**并集**：
> · `note-narrow`（盒宽窄：内容盒宽 < 0.85×列宽）—— 原样保留，负责 **48** 条；
> · `note-ink-narrow`（字迹窄：行数 ≥ 2 且最宽行 < 0.85×列宽）—— 新增，负责 **108** 条；
> · `note-hidden-text`（文本非空但零可见字形盒）—— 独立缺陷，**不算窄**。
>
> 任何**按单一码名聚合**的消费者，在并集口径下都会少算那 108 条（读成"漏判"或"没违规"）。
> 本文件逐个清点，并给出「是否需要改」的判断。原始事实由 `geometry/code-census.cjs` 产出
> （`geometry/consumer-selftest/code-census.json`）：扫 **229 个代码文件**（`.cjs/.js/.mjs/.ps1`），
> 命中 **37 个文件 / 735 行**；日志（`.log`）、生成物（`.json`）、文档（`.md`）不计入消费者。
>
> 判据（本文件的分类标准）：**「消费者」= 读 §22c 的报告、并按码名决定行为**。
> 自己定义判据、自己产出码的（探针/审计器）= **生产者**，不属于本轮的并集适配面。

## 0. 「需要改」清单（一句话版）

| # | 文件 | 归属 | 结论 |
| --- | --- | --- | --- |
| 1 | `geometry/gate-vs-truth.cjs` | **我（已改）** | **必须改**：改前 `startsWith('note-narrow')` 会把 108 条 `note-ink-narrow` 判成"不窄" ⇒ 假的「漏判 108」。已改成接受码集合 `/^note-(ink-)?narrow$/`（`NARROW_CODE_RE`，110–123 行；页级/条级两处判定都走 `isNarrowCode`） |
| 2 | `mutations-real/extract-m0.cjs` | **我（已改）** | **必须改**：改前 `byCode('note-narrow')`（原第 44 行）在 t16 的 M0 报告上只会数到 48 条，156 条里的 108 条会被漏掉。现已改为并集（`NARROW_CODE_RE` / `narrowCodesOf`，50–56 行），并新增页级+条级两份码分布 |
| 3 | `verify/probe-vs-22c.cjs` | independent-verifier | **需要 owner 判断/改**：第 39/41/88 行按 `note-narrow` 取"§22c 的窄柱集合"，并集后 baseline 上是 156 vs 它的 48 ⇒ 会报集合不一致 |
| 4 | `review/audit-r3-notes.cjs` | reviewer | **需要 owner 判断/改**：第 24/64 行按 `note-narrow` 聚合（t15 复审逐条核对的入口） |
| 5 | `review/audit-r2-sets.cjs` / `review/audit-r2-report.cjs` | reviewer | **需要 owner 判断/改**：按 `note-narrow` 聚合/打印（r2 时代产物，r3 若复用会少算 108） |
| 6 | `adversary/harness.cjs` 等 `adversary/**` | adversary | **需要 owner 判断**：harness 里有 7 行码名；`build-reports.cjs` / `line-ink-calibration.cjs` 各 1 行 |
| 7 | `release/online-smoke.cjs` | release-engineer | **不需要改**（**0 命中**：它不按码名判窄，自己量 `textWidth` 自己判）；但见 §5 的覆盖观察 —— **我没有动它**（它在 release-engineer 的 inScope） |
| 8 | `scripts/tools/verify-site.js:7125` | teeth-engineer / captain | **建议（low，非阻塞）**：不注入正对照里的 `narrow` 只数 `note-narrow`（该断言同时要求 `codes.length === 0`，所以不会漏判，只是文案/计数口径不完整）。**我没有改**（`scripts/**` 是我的禁区） |
| 9 | `geometry/wide-probe.cjs` / `make-table.cjs` / `make-truth-401.cjs` | **我** | **不需要改**：它们读的是**我自己的探针**产出的码（那是另一套码空间，只有盒宽那一种量法），不是 §22c 报告的消费者 |
| 10 | `recovered/**`、`adversary/fixtures/**`、`adversary/sandbox-pre-t7/**` | 各 owner | **禁止改**：刻意的"修复前判据"冻结件，改了就没有对照物 |

## 1. §22c 报告的**消费者**（吃报告、按码名决定行为）

| 文件 | 行号 | 硬编码的码 | 上下文 | 需要改？ | 结论 |
| --- | --- | --- | --- | --- | --- |
| `geometry/gate-vs-truth.cjs` | 110–123（`NARROW_CODE_RE` + `isNarrowCode`）、137/139（页级/条级判定）、205–213（`acceptCodeSet`、码分布）、222（误报点名） | `note-narrow`（旧） | 判定报告里"哪些条是窄的"，再与 `truth-401.json` 做集合差 | **是（已改）** | 接受码集合 `/^note-(ink-)?narrow$/`；`note-hidden-text` 明确排除；输出新增 `acceptCodeSet`、`narrowCodeTally`（48/108 分列）与 `otherCodeTally`（防止把 pass 误读成"零违规"） |
| `mutations-real/extract-m0.cjs` | 50–56（`NARROW_CODE_RE` / `narrowCodesOf` / 两份码分布）、88（what）、121–126（其它码，本来就是单一码）、133（verdict 文案）、145（打印） | `note-narrow`（旧）、`note-axis`、`note-clipped`、`note-hidden-text`、`page-overflow@1440/390`、`unexpected-detail-main`、`missing-detail-main`、`unclassified-layout` | M0 反证的**逐页清单与条数** | **是（已改）** | 窄命中改为并集；新增 `narrowCodeTally`（页级）与 `narrowNoteCodeTally` / `narrowNoteKeyCount`（条级，48/108 分列）；其余码本来就是逐码单一判定，不受并集影响 |
| `t3/run-post-repair.cjs` | 14–15（头部口径）、106（P5 文案）；另有验收标签一行 `'M0 红（exit≠0 且窄码>0）'`（改成「窄码」后已不含旧码名，故不在普查命中里） | `note-narrow` | 只出现在**文案/验收标签**里 | 是（文案，已改） | 改成「窄码（`note-narrow` ∪ `note-ink-narrow`）」；它自己的判定逻辑走 `gate-vs-truth` / `extract-m0`，不直接按码名分支；`POST-REPAIR-PLAN.txt` 已用 `--dry-run` 重新生成 |
| `mutations-real/extract-mutations.cjs` | 230、236（另 217/256 是**变异期望码**：`page-overflow@390` / `leaf-consistency` / `src-width` / `center` / `width`） | `note-narrow` | 不注入正对照的说明文案 | 否（已顺手改成并集措辞） | 它**不按码过滤**：`narrowKeys` 直接取报告/`mutations.json` 的 `窄条 [...]`；M5 那几个期望码是 §22b 的**变异**期望，与窄柱并集无关。静态回归已跑（`consumer-selftest/50-extract-mutations-regress.log`，M1–M10 全部照常解析） |
| `verify/probe-vs-22c.cjs` | 39、41、88 | `note-narrow` | 独立探针与 §22c 的"窄柱集合"对账 | **需要 owner（independent-verifier）判断** | 并集后在 `dist.baseline` 上：§22c 报 156 条、它只取 48 条 ⇒ 「集合 === 」类断言会假红。建议同样改成接受码集合 |
| `review/audit-r3-notes.cjs` | 24、64 | `note-narrow` | t15 复审的逐条核对入口 | **需要 owner（reviewer）判断** | 同上：只数 48 会把 108 条当"没命中" |
| `review/audit-r2-sets.cjs` | 71、80 | `note-narrow` | r2 集合核对/打印 | **需要 owner（reviewer）判断** | r2 时代产物；若 r3 复用需同步 |
| `review/audit-r2-report.cjs` | 39、41–43、51–52 | `note-narrow`（另有 `note-axis`） | 报告摘要打印 | **需要 owner（reviewer）判断** | 摘要会少报 108 条 |
| `adversary/harness.cjs` | 7 行（见 `code-census.json`） | `note-narrow` 等 8 个码 | 对抗 harness 的码面 | **需要 owner（adversary）判断** | 对抗者自己的判据面；并集后靶页集合会变 |
| `review/adversarial*.cjs`、`review/analyze-report.cjs`、`adversary/build-reports.cjs`、`adversary/line-ink-calibration.cjs`、`verify/anti-false-green.cjs`、`teeth/adversarial-replay.cjs` | 各 1–3 行 | 散见 | 对抗/分析脚本 | 需要各自 owner 确认 | 与上同因：按单一码聚合就会少 108；但这些都是**别人的 inScope**，本任务只报告不改 |

## 2. **生产者**（自己定义判据、自己产码）—— 本轮不需要适配

| 文件 | 行号 | 说明 | 结论 |
| --- | --- | --- | --- |
| `geometry/wide-probe.cjs` | 203–219（产 `data-region-missing` / `note-narrow` / `note-axis` / `note-clipped` / `page-overflow@<vw>`） | t3 的**独立**几何探针：自己量盒宽、自己判 | **不需要改**（它产出的是**它自己**的码）。**已知边界**：只覆盖并集的"盒宽"那一半（=48），字迹那一半（=108）由 §22c 的 `note-ink-narrow` 负责 —— 所以它在 `dist.baseline` 上报 48 而不是 156，这是设计，不是漏判（t3 结论不受影响） |
| `geometry/all-notes-probe.cjs` | — | 逐条量 401 条说明的盒宽/比例，不产码 | 不需要改 |
| `geometry/make-table.cjs` / `geometry/make-truth-401.cjs` | 74–89 / 96–149 | 读 `geometry/before.json`、`after.json`（**wide-probe 的码空间**） | **不需要改**（不同码空间）。`make-truth-401.cjs` 里 `caughtByOldCriteria`（48，盒宽=旧口径）与 `onlyNewTruth`（108，正是并集新增码负责的那批）的划分**在并集下语义不变**，可直接作为 t16 的验收真值 |
| `geometry/make-synthetic-reports.cjs`、`geometry/code-census.cjs` | 全文 | t18 新增：合成夹具与本次普查 | 不需要改（本轮工具） |
| `scripts/tools/verify-site.js` §22c | 6121/6149/6181/6206–6208/6537–6551/6783–6797 | **产出侧**（判据与码表的唯一出处） | 不属本任务；已确认 t14 后码表含 `note-ink-narrow` + `note-hidden-text`，且 `union` 在产出侧已经算好（第 6785 行） |

## 3. 冻结件（**禁止改**）

| 文件 | 为什么不能改 |
| --- | --- |
| `recovered/verify-site.pre-t7.js`、`recovered/pre-t7/**` | t2 那版判据的**逐字节复原件**（sha `4cae2fb2…`），是"修复前判据"的对照物；改了 sha 就不再是对照物 |
| `adversary/fixtures/verify-site.no-WIDE_TOL.js`、`verify-site.no-wideProblems.js` | 对抗用的**残缺判据**夹具（故意把判据打坏），是负例基线 |
| `adversary/sandbox-pre-t7/**` | 同一版本的沙箱 |

## 4. 我自己的改动清单（t18 实际改了哪些文件）

> **写入面声明（如实披露）**：任务纪律写的是「只写 `geometry/**` 与 `t3/**`」。
> 我另外改了 **`mutations-real/extract-m0.cjs` 与 `mutations-real/extract-mutations.cjs`** ——
> 两处都在**我自己的证据/工具目录**里（`mutations-real/**`，t3 起由我维护），不在任何 teammate 的 inScope 内，
> 且它们是**同一个集成缺陷的另外两个消费者**：不改 `extract-m0.cjs`，t16 的 P6 仍只会数到 48 条
> （`run-post-repair.cjs` 的 P6 直接调用它）—— 那就等于把 blocker 留在了自己的流水线里。
> `scripts/**` **一个字节未改**（见 §6 的核对方法）。若 captain 要求严格按字面范围回退这两处，
> 请指示：回退会让 t16 的 P6 退回到"只认 48 条"的行为。

| 文件 | 改动 | 复核 |
| --- | --- | --- |
| `geometry/gate-vs-truth.cjs` | ① 窄判定改为接受码集合 `/^note-(ink-)?narrow$/`（`isNarrowCode`），页级/条级两处都换；② 新增 `acceptCodeSet`、`observed.narrowCodeTally`（48/108 分列）、`observed.otherCodeTally`（防止把 pass 误读成"零违规"）与误报**点名**输出；③ 头部注释写明"为什么不能用前缀匹配"与 `note-hidden-text` 不算窄 | `consumer-selftest/10/11/12-case*.log`、`20/21-real-*.log`、`22/23/24-regress-*.log`、`60/61-FINAL-*.txt` |
| `mutations-real/extract-m0.cjs`（**超字面写入面，已披露**） | 窄命中改为并集（`narrowCodesOf`），新增页级 `narrowCodeTally` 与条级 `narrowNoteCodeTally` / `narrowNoteKeyCount`；说明宽字段兼容 r2 `note`/`region` 与 r3 `textWidth`/`column`；文案与 `expectationNote` 同步（48 页 / 156 条） | `consumer-selftest/40-extract-m0-real.log`（r2 回归：48 页 / 156 条）、`41-extract-m0-synth.log`（并集合成：末级码分布 48+108） |
| `mutations-real/extract-mutations.cjs`（**超字面写入面，已披露**） | 仅措辞（不注入正对照的说明）；它不按码过滤 | `consumer-selftest/50-extract-mutations-regress.log`（M1–M10 全部照常解析，exit 0） |
| `t3/run-post-repair.cjs` + `t3/POST-REPAIR-PLAN.txt` | 文案/验收标签改为并集口径；`--dry-run` 计划重生成 | `t3/POST-REPAIR-PLAN.txt` 重新落盘（9 步不变） |
| `geometry/make-synthetic-reports.cjs`、`geometry/code-census.cjs`、`geometry/consumer-selftest/**` | t18 新增的合成夹具生成器 / 普查器 / 全部原始日志与结果 JSON | 见 §6 |

## 5. `release/online-smoke.cjs` 专节（**我没有动它**）

- **事实**：`code-census.json` 显示它 **0 命中** —— 文件里根本没有出现任何 §22c 违规码名。
  它自己定义阈值（第 85 行 `NOTE_RATIO = 0.85`）、自己量（`measure()` 里的 `textWidth` = 「直接承载文本、且参与行布局的元素」里**最窄的 content box**），
  自己判死（第 581–594 行按 `results` 里失败的断言数决定 exit 0/1）。
- **结论：不需要改**（它不是判据消费者；并集口径不改变它的输入输出契约）。
- **但有一条覆盖观察，供 captain / release-engineer 决定**（**我没有改，也不在本次 inScope**）：
  它的窄柱判据等价于并集的**盒宽那一半**（最窄文字承载盒的 content box）。t14 新增的 `note-ink-narrow`
  针对的是「盒宽满宽、但**渲染出来的行**仍窄」那一类（逐行字迹宽 `widestLine`）—— 这类缺陷
  **在 online-smoke 里目前没有对应断言**。它跑的是线上冒烟（发布后），属于 release 侧的门禁；
  若希望线上冒烟与 §22c 的覆盖面对齐，需要 release-engineer 补一条逐行字迹判据（或复用 §22c 的实现）。
  本任务**未改动该文件一个字节**。

## 6. 复查方法（任何人可复算）

```powershell
# ① 重新普查（原样事实，不含判断）
node research/_raw/secondary-page-layout-unification/geometry/code-census.cjs \
     --out=research/_raw/secondary-page-layout-unification/geometry/consumer-selftest/code-census.json

# ② 合成自检（不依赖 t14 是否落盘）
node research/_raw/secondary-page-layout-unification/geometry/make-synthetic-reports.cjs --emit
node research/_raw/secondary-page-layout-unification/geometry/gate-vs-truth.cjs \
     --report=<…>/consumer-selftest/case1-union-156.json --expect=baseline      # 期望 pass
node research/_raw/secondary-page-layout-unification/geometry/gate-vs-truth.cjs \
     --report=<…>/consumer-selftest/case2-narrow-only-48.json --expect=baseline # 期望 fail（漏 108）
node research/_raw/secondary-page-layout-unification/geometry/gate-vs-truth.cjs \
     --report=<…>/consumer-selftest/case3-false-positive.json --expect=baseline # 期望 fail（点名 archive/#0）

# ③ 真实报告复算（不回退）
node …/geometry/gate-vs-truth.cjs --report=…/teeth/M0-after-repair.json   --expect=baseline  # pass
node …/geometry/gate-vs-truth.cjs --report=…/geometry/after-verify.json   --expect=green     # pass

# ④ 写入面自查（证明 scripts/** 一个字节未改）
git status --porcelain                       # scripts/ 下仍是原来那 6 个 M，没有新增文件名
git diff --stat -- scripts/                  # 与 t18 开工前同一批文件、同一批行数
Get-FileHash -Algorithm SHA256 scripts\tools\verify-site.js   # t18 期间该文件由 t14 改动，不是本任务写的
```

> 一句话：**并集口径下，凡是"按 `note-narrow` 一个码聚合"的地方都要改成两个码**。
> 本次属于我的两处（`gate-vs-truth.cjs`、`extract-m0.cjs`）已改并自检；
> 其余按 §0/§1 的归属列给对应 owner（其中 `release/online-smoke.cjs` 经查**不需要改**）。

> 两次运行之间的**生产者仍在变动**（`scripts/tools/verify-site.js` 在 t18 期间被 t14 连续改动：
> 17:15 时是 `2919bcdd…`、17:22 时又变了）。这**不影响**本报告的结论 ——
> 本报告的全部自检输入都是**合成报告**与**已落盘的真实报告**，一个字节都不依赖生产者的当前版本。
