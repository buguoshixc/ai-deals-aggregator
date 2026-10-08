# judge-target-relocation-control-v1 报告（t31）

> 补齐两条「只答了一半」的承重证明：**M15 的靶位依赖**（`vertical-note-coverage-v1` 起）与 **M10 的锚点在靶位挪走后会不会失效**
> （t22 `judge-coverage-closure-v1` / PR #93 自审 §1.3 自认没做）。
>
> **只读验证**：`scripts/**`、`dist/**`、阈值、登记表**一个字节未改**；全部注入发生在 `.arch-v1/` 下的 dist **副本**与一份**探针副本**里。

| 项 | 值 |
|---|---|
| 基线 | `origin/master` = `9b72b9d7cda4021cb59ace9df0b075a901e00374`（含 #93） |
| 工作树 | `.worktrees/judge-target-relocation-v1`（新工作树；`npm ci` 装在本树内、非 junction） |
| 被验目录 | `.arch-v1/dist-copy` = `dist/` 的逐字节副本（**304 文件 / 20,386,654 B**，304/304 逐字节相同） |
| 装置 | `.arch-v1/probe/verify-site.probe.js`（从**只读**的 `scripts/tools/verify-site.js` 复制：**5 个 hunk / +18 −10 行**） |
| 产物零改动 | `dist` 全树摘要 before = **after** = `67d1d0bdcdffe29f1b2bd0185c35408da897d53d20e44c495fec385f7ec1337d`；`scripts/tools/verify-site.js` sha256 前后 = `bcd4ceaad71ce60b07ce31db82a6099d3dceed0d17e65cfc5fbd7da2926fa9c0`；`git status --porcelain -- scripts/ dist/` **空** |

## 0. 一屏结论

| # | 问题 | 答案 | 一句话证据 |
|---|---|---|---|
| C1 | **M15 的承重依赖靶位选择吗？** | **不依赖「选哪一页」**（3 个同类页面都咬得住）；**依赖「靶页有 ≥1 条页面级说明」这个结构性前提** | 靶页挪到 `need/dev-credits/`、`need/student-only/` 后 M15 的三颗牙**全绿**，承重证明四条同时成立，命中路由随之变成 `need/dev-credits/#0` / `need/student-only/#0` |
| C2 | M15 的**读数落点**会不会被「形态落在靶页上」改变？（t9/t22 踩过） | **会**：红落在**全站扫描断言**上（4 档 5 条），M15 自己的三颗牙全绿，正对照**降级为豁免形式** | 注入靶页磁盘副本 ⇒ `883/5 · exit 1`；5 条失败全是 `§22c @1440/@1600/@950/@760 样本/@360 样本`；M15 正对照变成「本轮目录本身带竖排 ⇒ 严格形式由 `--dir=dist` 的那一次运行承担」 |
| C3 | **M10 的靶位挪走 ⇒ 会不会失效？** | **会**，而且**只依赖「靶位宽度 ≥ 1500px」这一件事**（那条 `@media (min-width:1500px)` 就是靶心）；把路由挪走（宽度仍 1600）**不失效** | 宽度 1600→**950**：`883/1 · exit 1`，唯一失败 = M10 复测断言（期望 `note-narrow`，实测 `[narrow-unregistered]`），**锚点唯一守卫仍绿**；宽度→**1440** 同样；路由→`need/dev-credits/`@1600：`883/0`，命中 `need/dev-credits/#0` |
| C4 | 失效形态是「静默」还是「响亮」？ | **响亮**：牙自己红（措辞 = 期望码没出现 ⇒ 判「变异没落地」），不是静默放行 | 三次失效模式的唯一失败项都带 `期望 … 实测 [ … ]` 全文；锚点唯一守卫（`锚点出现 1 次`）在失效模式下**仍然是绿**的 ⇒ 能区分「靶位失效」与「锚点失效」 |

## 1. 装置：为什么是「探针副本」，以及它与原工具等价吗

### 1.1 为什么不能直接改靶位

M15/M10 的靶位在 `scripts/tools/verify-site.js` 里是**字面量**：

```
{ id: 'M10', route: 'need/student-only/', width: WIDE_WIDE,  … }   // WIDE_WIDE = 1600（§22c 块内常量）
{ id: 'M15', route: 'need/free-api/',     width: WIDE_DESKTOP, … }  // WIDE_DESKTOP = 1440
```

而本轮硬约束是 `scripts/**` 一个字都不许改 ⇒ 只能拿一份**副本**改靶位（与本仓 t17/t22 的既有做法一致：
「把 `verify-site.js` 拷成探针，只改 ROOT/requires + 靶位常量」）。

### 1.2 探针的改动面（全文 diff 在 `.arch-v1/probe/probe.diff`）

| # | 改什么 | 怎么改 | 锚点出现次数 |
|---|---|---|---|
| ① | `ROOT` | `path.join(__dirname,'..','..')` → 显式指回工作树根（探针住在 `.arch-v1/probe/`） | 1 |
| ② | 5 处 `require('../lib/…')` | → `require(path.join(ROOT,'scripts/lib/…'))` | 5 |
| ③ | M15 变异靶页 / M15 正对照靶页 | → `PROBE.m15Route` / `PROBE.m15ControlRoute`（环境变量） | 各 1 |
| ④ | M10 变异靶位（route + width）/ M10 正对照靶位 | → `PROBE.m10Route` / `PROBE.m10Width` / `PROBE.m10ControlWidth` | 各 1 |
| ⑤ | 插入 `PROBE` 常量块（在 §22c 块内 `WIDE_WIDE` 定义之后） | 缺省值 = 产物原值 ⇒ **不设 env 时与原工具语义等价** | 1 |

**没动**：`WIDE_NOTE_RATIO`(0.85) / `WIDE_TOL` / `WIDE_DESKTOP` / `WIDE_WIDE` / `WIDE_MID` 等**全部阈值** ·
`wideProblems()` / `wideCodes()` / `wideMeasure()` 等**判据函数** · **全部断言文本**。

### 1.3 两次对照，证明读数不是探针造出来的

| 对照 | 读数 |
|---|---|
| 探针 + 缺省 env（`base` 模式） | **883 项 / 失败 0 / exit 0** |
| **仓库里那一份** `scripts/tools/verify-site.js`（未改）在同一副本上 | **883 项 / 失败 0 / exit 0**（同一份 `--dir=.arch-v1/dist-copy`） |

⇒ 探针对基准行为**没有**影响；`883` 是本轮基线（`origin/master` `9b72b9d`）的项数（t22 报告当时是 **882** —— #89–#93 合并后多 1 项，与本轮的靶位无关）。

### 1.4 每个模式怎么跑（单条命令）

```powershell
# 探针（8 个模式由 .arch-v1/run-modes.cjs 驱动，逐模式落 .arch-v1/log/<mode>.log 与 .arch-v1/json/<mode>.json）
$env:PROBE_M15_ROUTE='need/dev-credits/'; node .arch-v1/probe/verify-site.probe.js --dir=.arch-v1/dist-copy --json=.arch-v1/json/x.json
```

## 2. M15 靶位挪走对照（承重面）

靶位候选来自现场普查：186 页里 **`.snote` 恰好 1 条的只有 3 页** —— `need/free-api`（现靶位）、`need/dev-credits`、`need/student-only`
（其余 183 页是 0 条或 ≥2 条）。所以「同类页面」的可选集合就是把靶页换成后两者。

| 模式 | M15 靶页 / 正对照靶页 | 项数·失败数·exit | M15 锚点唯一 | M15 复测 | M15 承重证明 | 命中路由与关键量 | 正对照 |
|---|---|---|---|---|---|---|---|
| `base` | `need/free-api/` / 同 | 883·0·0 | ✓ | ✓ `[note-ink-narrow, note-intro-long]` | ✓（四条全成立） | `need/free-api/#0` · 竖排 vertical-rl · **列 18** / 列栈 362.64px / 行 1 / 内容盒 1369px / 列宽 1380 · 阈值 1173 | ✓ 严格形式 |
| `m15-target-devcredits` | `need/dev-credits/` / 同 | **883·0·0** | ✓ | ✓ 同左 | ✓ | **`need/dev-credits/#0`** · **列 20** / 列栈 403.42px / 行 1 / 内容盒 1369px | ✓ 严格形式（该页未注入时竖排 0、0 违规码） |
| `m15-target-student` | `need/student-only/` / 同 | **883·0·0** | ✓ | ✓ 同左 | ✓ | **`need/student-only/#0`** · 列 20 / 列栈 403.42px / 行 1 / 内容盒 1369px | ✓ 严格形式 |
| `m15-split-…`（只挪变异、对照留原靶位） | `need/dev-credits/` / `need/free-api/` | **883·0·0** | ✓ | ✓ 同左 | ✓ | `need/dev-credits/#0`（同 dev-credits 行） | ✓ 严格形式（`need/free-api/@1440` 说明 1 条、竖排 0、违规码 无） |

**结论（C1）**：M15 的承重**不依赖「选哪一页」** —— 三个同类靶页上，`note-ink-narrow` 都把注入的竖排条咬住，
且承重证明的四条（`inkKeys>0` · 全部 `vertical` · `列数≥2 且 列栈<0.85×列宽` · 旧口径两条判据必然静默且盒宽与注入前一致）**同时成立**。
靶位之间只有**列数/列栈**这类形态量上的差异（18 列 362.64px vs 20 列 403.42px），**不影响判定**。

但它**依赖一个结构性前提**：靶页必须有 ≥1 条页面级说明、且盒宽满宽（三页都是 **盒 1380px / 内容盒 1369px / 列宽 1380px**）。
这正是 `vertical-note-coverage-v1` 当初**必须换靶页**的原因（原靶页 `category/agent/` 自 `secondary-page-intro-changes-v1` 起已无 `.snote` ⇒ 注入后 `noteCount 0`、一条码都不出 = 「变异没有承重面」）。
⇒ 靶位不是随便挑的：**同一「布局族 × 有说明 × 别页未占用」** 的页面之间可换，**没有说明的页面**不能当靶。

## 3. 「形态落在靶页上」时红的落点（t9/t22 那条已知形态）

把 M15 的**同一条形态**落到靶页的**磁盘副本**里（`need/free-api/index.html`：冻结串出现恰好 1 次 ⇒ 在它后面追加同一条规则，
与工具的 DOM 变异**同形**），再照常跑（靶位不动）：

| 读数 | 值 |
|---|---|
| 项数 · 失败数 · exit | **883 · 5 · 1** |
| 5 条失败断言 | `§22c @1440 逐条页面级说明` · `§22c @1600 逐条…` · `§22c @950 逐条…` · `§22c @760 样本集 79 页…` · `§22c @360 样本集 79 页…` |
| 它们为什么红 | **副本里确实有那条缺陷**：@1440/@1600/@950 各报 `note-ink-narrow 1（1 页）`（逐条判 271 条 / 有说明的页 63）；@760 样本报 `need/free-api/#0 note-ink-narrow`（列栈 362.64px（18 列）< 0.85×728）；@360 报 `need/free-api/#0 note-clipped`（说明自身横向溢出 50px） |
| **M15 三颗牙** | 锚点唯一 ✓ · 复测 ✓（`[note-ink-narrow, note-intro-long]`）· 承重证明 ✓（`need/free-api/#0`，18 列 / 362.64px） |
| **M15 正对照** | ✓ 但**降级**：`need/free-api/@1440 说明 1 条（竖排 1）违规码 [note-ink-narrow,note-intro-long] ⇒ 本轮目录本身带竖排 ⇒ 严格形式由 --dir=dist 的那一次运行承担` |
| 命中路由 | `need/free-api/#0`（1440 / 1600 / 950 / 760 四档一致） |

**结论（C2）**：t9/t22 说的「读数会被误读」在**此形态下**的精确形状不是「控制组变红」，而是两件事同时发生：

1. **红落在全站扫描断言上**（4 档 5 条）——那是**判据正确地抓住了副本里的缺陷**，不是判据坏了；
2. **正对照从「严格形式成立」降级为「豁免形式」**——工具内置的豁免路径（`verticalNotes>0` 且码只含竖排那两个）让这条对照**仍然绿**，
   但它**不再证明**「未注入的产物上这一页是干净的」；严格形式这一刻只能由 `--dir=dist` 的那一次运行承担。

⇒ 纪律仍然成立：**形态不要落在变异靶页上**。踩上去不会制造假绿（红照样出），但会**让这一轮的对照少证明一件事**（严格形式），
而读数表里那一行会从「严格形式成立」变成「由另一次运行承担」——只看 ✓/✗ 的人会漏掉这个降级。

## 4. M10 靶位挪走对照（锚点唯一性）

M10 的注入规则是 `@media (min-width: 1500px) { .snote { max-width: 70ch; } }` —— 它**自己**就带一个宽度前置条件。

| 模式 | M10 靶位（route @ width） | 项数·失败数·exit | M10 锚点唯一 | M10 复测 | M10 正对照 | 命中路由与关键量 |
|---|---|---|---|---|---|---|
| `base` | `need/student-only/` @ **1600** | 883·0·0 | ✓ | ✓ `[note-narrow, note-ink-narrow, note-axis, note-intro-long, narrow-unregistered]` | ✓（该页 @1600 0 违规码） | `need/student-only/#0` · 盒 **452.81px** / 有字区域 442px / 视口 1600 |
| `m10-width-950` | 同 route @ **950** | **883·1·1** | ✓ `锚点出现 1 次` | **✗** 期望 `note-narrow` · 实测 **`[narrow-unregistered]`** | ✓（@950 0 违规码） | 无命中 · 盒 **910px** / 有字区域 899px / 视口 950 · 窄条 `[无]` |
| `m10-width-1440` | 同 route @ **1440** | **883·1·1** | ✓ `锚点出现 1 次` | **✗** 期望 `note-narrow` · 实测 **`[narrow-unregistered]`** | ✓（@1440 0 违规码） | 无命中 · 盒 **1380px** / 有字区域 1369px / 视口 1440 · 窄条 `[无]` |
| `m10-target-devcredits-1600` | **`need/dev-credits/`** @ 1600 | **883·0·0** | ✓ | ✓ 同 base 的码集合 | ✓（新靶页 @1600 0 违规码） | **`need/dev-credits/#0`** · 盒 452.81px / 有字区域 442px / 视口 1600 |

**结论（C3/C4）**：

* **M10 的承重依赖「靶位宽度 ≥ 1500px」这一件事**。950 与 1440 两档下，注入的规则**不生效**（media query 不匹配），
  于是 `note-narrow` 一条都不出 —— 这**正是**「把 1600 换掉 ⇒ M10 立刻红」（t17 的既有观察）的机制，本轮把它**补成了完整对照**。
  失效时**锚点唯一守卫仍然是绿**的：锚点（冻结串）与靶位宽度是**两件事**，锚点没有失效。
* **M10 不依赖靶页路由**：换成 `need/dev-credits/`（宽度仍 1600）后照样咬住，命中路由随之变成 `need/dev-credits/#0`。
  靶页只需满足与 M15 同一类前提（有页面级说明 + 盒宽满宽）。
* **失效形态是响亮的**：唯一失败项就是 M10 自己的复测断言，细节里带全文 `期望 note-narrow · 实测 [narrow-unregistered] · 首条 盒 …`。
  也就是说，将来若有人**删掉 1600 档**（而不是新增 950），M10 会在同一轮里**报红**，不会被静默放过 ——
  但代价是**误报面**：读红的人会先怀疑「牙坏了」，需要知道这条边界才能立刻定位。
* 副作用读数：950/1440 两档的复测码集合里都出现了 `narrow-unregistered`（来自 §22c 保留窄阅读列的登记制扫描，与本靶位无关），
  它**不是**这次失效的原因（`narrow-unregistered` 在 base 模式的 M10 码集合里也有）。

## 5. 没证明的东西（如实登记）

1. **只测了 2 个替代靶页**（`need/dev-credits/`、`need/student-only/`）与 **1 个替代属性轴**（M10 的宽度）。结论「不依赖靶位选择」的射程**就是这两个页面**，
   不是「任意同类页面都行」的证明（可选集合本身只有 3 页 —— 全站 `.snote` 恰好 1 条的页只有这 3 页）。
2. **M10 的宽度边界没有扫出来**：只测了 950 与 1440（都 < 1500），**没有测 1500 / 1501 / 1600 边界**。
   「≥1500 才咬」是从 `@media (min-width:1500px)` 的语义推的，不是实测扫描的结论。
3. **只在本机 Windows + msedge（headless）上跑**：没有跨浏览器（chromium/firefox）与跨平台（Linux/CI）实测。
4. **探针是副本**：所有结论都是关于「靶位」的；仓库里那一份 `verify-site.js` 在本轮**从未**被改（运行前后 sha256 相同）。
   反过来说：本报告**没有**证明「直接改仓库里那份脚本的靶位会怎样」——那正是没做的（也不该做）。
5. **§3 的 4 档全站扫描红是构造出来的**：副本里确实带着缺陷，所以那些红证明的是「判据抓得住注入的形态」，
   **不是**「真实产物上有竖排缺陷」。真实产物上四档 0 违规码由 `base` 模式的 `883/0` 承担。
6. **没有跑 Full Gate、没有重跑 CI**（按任务指示：纯只读验证，`npm run check:evidence` 绿即可）。
   本报告里所有读数都是 `verify-site.js` 单支工具的读数，**没有**「它在 CI 的 Ubuntu 上也这样」的证据。
7. **M15「盒宽与注入前一致」用的是同一轮的 1440 全站扫描**（`wideGeometry`），不是独立第二次测量 ⇒ 这一条是「同一轮内自洽」，不是外部复核。
8. **没有测「靶位挪到没有说明的页面」**（如 `category/agent/`）：那一类按 `vertical-note-coverage-v1` 的注释是「变异没有承重面」（`noteCount 0`），
   本轮**没有**实测复现它（没有把它加进模式表）。
9. **模式之间是串行跑的本机读数**：耗时列（145–206s）受机器负载影响，**不构成**任何性能结论。

## 6. 复现命令

```powershell
# 1) 干净副本 + 形态注入副本（只读 dist）
node .arch-v1/make-dist-copies.cjs

# 2) 从只读的 verify-site.js 生成探针（5 hunk / +18−10 行，全文 diff 在 .arch-v1/probe/probe.diff）
node .arch-v1/probe/make-probe.cjs

# 3) 8 个模式串行跑（逐模式 log + json）
node .arch-v1/run-modes.cjs
#    单个模式：node .arch-v1/run-modes.cjs base

# 4) 对照：仓库里那一份未改的工具在同一副本上
node scripts/tools/verify-site.js --dir=.arch-v1/dist-copy --json=.arch-v1/json/repo-tool-control.json
```

## 7. 交付物与改动面

* 证据（Tier-1，进仓）：`research/_raw/judge-target-relocation-control-v1/{readings.json, probe.json, dist-copies.json, README.md}`
* 报告 / 自审：本文件与 `research/judge-target-relocation-control-v1-self-audit.md`
* **产品零改动**：`scripts/**`、`dist/**`、`docs/`、`NEXT-STEPS.md` 一个字节未改；
  装置与原始读数（探针、8 份模式 JSON、日志、dist 副本）全部在 `.arch-v1/`（gitignore，Tier-3 scratch）。
