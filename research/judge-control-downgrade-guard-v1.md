# judge-control-downgrade-guard-v1 报告（t34）

> 收口 t31（`judge-target-relocation-control-v1`，PR #96 已合并）发现的**静默降级面**：
> 当变异形态落在 M15 靶页**自己的磁盘副本**上时，M15 的正对照会**悄悄降级成「豁免形式」**，
> 而断言照样是 ✓ —— 降级只写在一行 `detail` 文案里，**只看 ✓/✗ 的人完全看不出来**。
> 本任务把它变成**响亮的**两件事（默认判红 + 显式登记），并把「M15 靶页必须含 ≥1 条页面级说明」
> 这个**隐含前提**写成显式断言。

| 项 | 值 |
|---|---|
| 基线 | `origin/judge-hardening-v1c-pr` @ `2ad0e97`（= master `2253be8` + t33 的 `verify-site.js` 改动 **+169/−5**）—— **合并顺序建议：#103 → 本 PR**（本分支基于 t33 的那一笔之上，故 PR diff 只含本轮改动；若先合本 PR，会捎带 t33 的提交） |
| 工作树 | `.worktrees/judge-control-downgrade-v1`（`npm ci` 装在本树内、非 junction） |
| 代码改动 | **只有** `scripts/tools/verify-site.js`：**+87 / −0**（`git diff --numstat` = `87\t0\tscripts/tools/verify-site.js`，**无删除行**） |
| 断言数 | **887 → 890（+3，只增不减）**；旧断言一条未删、未改松 |
| 交付 | 本报告 · `research/judge-control-downgrade-guard-v1-self-audit.md` · `research/_raw/judge-control-downgrade-guard-v1/{readings.json, tooling.json, README.md}` |
| 未改动 | `scripts/lib` · `scripts/data` · `scripts/tools/build-local.js` · `dist` · `docs` · `NEXT-STEPS.md`（`git status --porcelain` 为空）；`dist` 在全部用例期间**逐字节未变**（用例结束后与**用例之前**建的副本重比：**不同 0 个文件**） |

## 0. 一屏结论

| # | 问题 | 结论 | 一句话证据 |
|---|---|---|---|
| C1 | **现状复现** | 形态落在靶页磁盘副本 ⇒ **887 项 / 失败 5 / exit 1**；5 条红**全在全站扫描**；M15 三颗牙**全绿**；正对照 **✓ 但降级**（判词逐字见 §2.3） | `before-contaminated` 用例；且 `grep -c 'CONTROL-EXEMPTION\|对照豁免'` = **0**、`metrics.layoutControlExemptions` **这个键根本不存在** |
| C2 | **降级现在响亮** | ① 默认**判红**（新增命名断言，未声明 `--allow-control-exemption` 即红）；② 声明后**逐条登记**：可 grep 的码 `M15-CONTROL-EXEMPTION` + 计数 + 专用读数列 + 变异牙读数表新行 + `metrics.layoutControlExemptions/…Count` | `after-contaminated` **890/6**（比改前多 1 条红，就是这条）；`after-contaminated-allow` **890/5**（只剩那 5 条扫描红）+ 4 处登记可见 |
| C3 | **隐含前提显式化** | 新增 `§22c M15 靶页前提…`：靶页换成 **0 条说明**的页（`category/agent/`）⇒ **判红并点名**「靶页不含页面级说明（0 条）」 | `after-m15-target-nonotes` **890/3 / exit 1**；还原（靶页回到 `need/free-api/`）⇒ **890/0** |
| C4 | **只变严** | +3 条断言（887→890）；旧断言一条未删/未改松（diff **+87/−0**）；干净产物 **890/0** | `after-clean`；`check:ci` 39/0；`check:evidence` 绿；`npm run gate` 全绿 |

## 1. 装置：改前/改后 = **两支工具 × 同一批目录**

「改前 vs 改后」的差别必须只有工具本身，所以：

| 装置 | 做法 | 身份 |
|---|---|---|
| **改前工具**（冻结副本） | `.arch-v1/base/verify-site.base.js` = 改前 `verify-site.js` 的副本，**只改** `ROOT` + 5 处 `require('../lib/…')`（靶位/阈值/判据/断言文本一字不动） | 源 sha256 `1b2774b183c8…` → 副本 `bee064340daf…` |
| **改后工具** | 仓库里那一份 `scripts/tools/verify-site.js`（本轮 +87/−0） | `bcd4ceaad7…`(t33) + 本轮补丁 = `61b7d6607c…` |
| `dist` 副本 ×2 | `.arch-v1/dist-clean`（304/304 逐字节等于 `dist`）· `.arch-v1/dist-contaminated`（在 `need/free-api/index.html` 的冻结串**后面**追加 M15 同一条规则；冻结串仍**恰好 1 次**） | 见 `tooling.json` 的 `distCopies` |
| 靶位探针（**只用于换靶页那一个用例**） | `.arch-v1/probe/verify-site.probe.js` = **改后**工具的副本，仅把 M15 靶页/正对照靶页改成环境变量 `PROBE_M15_ROUTE`（与 t31 同法） | 源 `61b7d660…` → 探针 `2e4e49ae…`；5 hunk / +18 −10 行 |

> 探针只用来回答「靶页换成 0 条说明的页会怎样」——**仓库里那一份的 M15 靶页始终是 `need/free-api/`，没有被改**。

## 2. 改前：复现现状（`before-clean` / `before-contaminated`）

### 2.1 总账

| 用例 | 项数 · 失败 · exit | 豁免登记（机器读的那一侧） | 可 grep 的行 |
|---|---|---|---|
| `before-clean`（改前 × 干净副本） | 887 · **0** · 0 | **`metrics.layoutControlExemptions` 键不存在** | 0 |
| `before-contaminated`（改前 × 形态副本） | 887 · **5** · **1** | **键不存在** | **0** |

### 2.2 5 条红**全在全站扫描断言**（M15 的三颗牙一条都没红）

```
✗ §22c @1440 逐条页面级说明：旧口径（内容盒 ≥ 0.85×列宽）+ 新口径（横排按行 / 竖排按列 …）
✗ §22c @1600 逐条页面级说明：…
✗ §22c @950  逐条页面级说明：…
✗ §22c @760 样本集 79 页（同一份判据；字迹按**物理前置条件**判 …）
✗ §22c @360 样本集 79 页（同一份判据 …）
✓ §22c M15 变异锚点唯一（逐字替换前必须恰好出现 1 次）
✓ §22c M15 变异后复测必须出现「note-ink-narrow」违规码（T31 的 P1 原型 …）
✓ §22c M15 承重证明：咬中的条是**竖排按列判**（列数 ≥ 2 · 列栈水平范围 < 0.85×列宽）…
```

这 5 条红是**判据正确地抓住了副本里的缺陷**（副本确实带着那条形态），不是判据坏了 —— 与 t31 报告 §3 一致。

### 2.3 正对照：**✓**，但降级只写在这行 detail 里（逐字）

```
✓ §22c M15 的正对照：不注入时这一页必须干净（该页说明一条都不是竖排、0 违规码）；若本轮 --dir= 本身
   就是形态注入副本（该页已被认成竖排），如实标注并只允许出竖排那两个码
   — need/free-api/@1440 说明 1 条（竖排 1）违规码 [note-ink-narrow,note-intro-long]
     ⇒ 本轮目录本身带竖排 ⇒ 严格形式由 --dir=dist 的那一次运行承担
```

**这就是那个静默面**：断言是 ✓，只有读完 `detail` 最后 30 个字才知道「这一轮的严格形式没有被证明」。
改前的两条可验证的「看不见」：`grep 'CONTROL-EXEMPTION\|对照豁免'` **0 命中**；`--json=` 报告里
**没有**任何机器可读字段记录这件事（`metrics.layoutControlExemptions` 不存在）。只看 ✓/✗ 或只看 metrics 的人**两条路都漏**。

## 3. 改后：降级响亮（默认判红 + 显式登记）

### 3.1 未声明 ⇒ **默认判红**（`after-contaminated`）

**890 项 / 失败 6 / exit 1** —— 比改前**多出的那一条红**就是新断言：

```
✗ §22c 对照豁免必须显式声明（--allow-control-exemption）：走豁免形式 ⇒ 默认判红
   — M15-CONTROL-EXEMPTION ×1：need/free-api/@1440 竖排 1 条 违规码 [note-ink-narrow,note-intro-long]
     ⇒ 未声明 ⇒ 判红：要么这一轮的 --dir= 是形态注入副本（请显式声明 --allow-control-exemption），
       要么这一页真的坏了
```

同时那条新断言在**干净产物**上是绿的（见 §3.3）⇒ 不是「一律红」，只在真的发生降级时才咬。

### 3.2 显式声明 ⇒ **登记放行**，四处可见、可 grep、可计数（`after-contaminated-allow`）

**890 项 / 失败 5 / exit 1**（红回到那 5 条全站扫描 —— 它们与对照降级无关）。

| # | 可见位置 | 逐字 |
|---|---|---|
| ① | 专用读数行（固定键名，可 grep） | `对照豁免登记（CONTROL-EXEMPTION）：1 条 · M15-CONTROL-EXEMPTION need/free-api/@1440（竖排 1 条 · 违规码 [note-ink-narrow,note-intro-long]） · 声明 --allow-control-exemption：是` |
| ② | 变异牙读数表**新增一行** | `对照豁免  CONTROL-EXEMPTION  0 条（只允许显式声明后出现）  1 条 M15-CONTROL-EXEMPTION need/free-api/@1440（已声明）` |
| ③ | 断言 ①（此时 ✓） | `… ⇒ 已显式声明 --allow-control-exemption ⇒ 登记放行（严格形式由 --dir=dist 的那一次运行承担）` |
| ④ | 机器可读 `metrics` | `layoutControlExemptionCount: 1` + `layoutControlExemptions: [{id:"M15", code:"M15-CONTROL-EXEMPTION", route:"need/free-api/", width:1440, notes:1, verticalNotes:1, codes:[…], declared:true}]` |

⇒ 现在「这一轮降级了 1 条」与「这一轮全部是严格形式」在**人读的表**与**机器读的 JSON**里都分得开；
计数是 1 还是 0 可以按轮比对（改前是「没有这个键」）。

### 3.3 干净产物：**890 / 0**，豁免**显式 0**（`after-clean`）

```
✓ §22c M15 靶页前提：靶页必须含 ≥1 条页面级说明（否则变异没有承重面 —— 注入后一条码都不会出）
   — 靶页 need/free-api/@1440 · 布局族 wide · 页面级说明 1 条 · 首条盒宽 1380px
✓ §22c 对照豁免必须显式声明（--allow-control-exemption）：走豁免形式 ⇒ 默认判红
   — 本轮 0 条豁免（所有正对照都是严格形式）
✓ §22c 对照豁免登记制：被污染的对照行必须逐条登记（可 grep 的码 + 计数），登记数 == 独立重算的污染行数
   — 独立重算污染行 [无] ×0 · 登记表 [无] ×0
```

### 3.4 靶页前提显式化：换成 0 条说明的页 ⇒ **红并点名**（`after-m15-target-nonotes`）

用探针把 M15 靶页换成 `category/agent/`（T31 的原靶页：它的首屏说明自 `secondary-page-intro-changes-v1`
起整层删除 ⇒ 现场 **0 条** `.snote`）：

**890 项 / 失败 3 / exit 1**

```
✗ §22c M15 靶页前提：靶页必须含 ≥1 条页面级说明（否则变异没有承重面 —— 注入后一条码都不会出）
   — 靶页 category/agent/@1440 · 布局族 wide · 页面级说明 0 条 · 首条盒宽 0px
     ⇒ 靶页不含页面级说明（0 条）：请换一个有说明的页当靶页，或先确认这一页的页面级说明没有被删掉
       —— 把靶位留在 0 条说明的页上等于这条牙没有承重面
✗ §22c M15 变异后复测必须出现「note-ink-narrow」违规码（…）        ← 旧行为：这里会以「期望码没出现」报红
✗ §22c M15 承重证明：咬中的条是**竖排按列判**（…）
```

**这正是要点**：改前靶页 0 条说明时，红只有后两条（措辞是「期望码没出现」），读红的人会**先去怀疑牙坏了**；
现在**第一条就把原因点名**（靶页不含页面级说明）。**还原**（探针不设 env ⇒ 靶页回到 `need/free-api/`）：

| 用例 | 读数 |
|---|---|
| `after-m15-target-restore` | **890 项 / 失败 0 / exit 0**（前提断言回到 ✓） |

## 4. 改了什么（逐条 + 为什么这么设计）

| # | 新增断言 / 机制 | 判据（只变严） | 为什么 |
|---|---|---|---|
| ① | `§22c M15 靶页前提：靶页必须含 ≥1 条页面级说明` | 靶页在它自己的档位必须量到 `noteCount ≥ 1` 且首条盒宽 > 0；否则红并点名靶页与「0 条」 | t31 证明 M15 的承重**依赖这个结构性前提**，而它此前只是注释（「为什么必须是这条牙」）。把靶页留在 0 条说明的页上 = 这条牙没有承重面，且**红会以误导的形式出现**（像牙坏了） |
| ② | `§22c 对照豁免必须显式声明（--allow-control-exemption）` | 出现豁免且未声明 ⇒ **红** | 降级此前是纯文案。默认 fail-closed：调用方必须承认「这一轮的 `--dir=` 是形态注入副本」；**不声明就红**，声明才放行 |
| ③ | `§22c 对照豁免登记制：…登记数 == 独立重算的污染行数` | 登记表与「独立从对照表重算出的污染行数」必须相等，且每条登记都带码/说明数/码集合 | 让豁免**不能绕开登记表**：将来若有别的代码路径走了豁免却不登记（或反之），这条会红 |
| ④ | 登记面：专用读数行 + 变异牙读数表新行 + `metrics.layoutControlExemptions/…Count/…Declared` | — | 「可 grep（固定码 `M15-CONTROL-EXEMPTION`）· 可计数（0/1/…）· 人读与机读两侧都看得见」 |

**设计取舍**：任务允许「一律判红」或「显式登记项」。我选了**两者都要、但分工明确** ——
**默认判红**保证「忘了声明」不会静默；**显式登记**保证「合法的形态注入副本复跑」仍然能跑完整轮
（这类复跑是本仓既有的证据手法，见 t31 报告 §6 与 `vertical-note-coverage-v1`）。**只变严**：干净产物上三条新断言全绿，旧断言一条没改。

> ⚠️ **对既有复跑配方的影响（如实记）**：历史上那些「`--dir=` 指向形态注入副本」的复跑命令
> （t31 报告 §6、`vertical-note-coverage-v1` 等）现在需要补 `--allow-control-exemption`，
> 否则那一轮会多一条红（就是断言 ②）。本报告点名这件事，但**没有回去改那些历史报告**（不在 inScope）。

## 5. 七个用例总账（`readings.json`）

| 用例 | 工具 | 被验目录 | 声明 | 项数·失败·exit | 豁免计数 | 关键读数 |
|---|---|---|---|---|---|---|
| `before-clean` | 改前 | 干净副本 | — | 887·0·0 | 键不存在 | M15 三颗牙 ✓ + 正对照 **严格形式成立** |
| `before-contaminated` | 改前 | 形态副本 | — | 887·**5**·**1** | 键不存在 | 5 红全在扫描；三颗牙 ✓；正对照 **✓ 降级**（§2.3 逐字）；grep 0 命中 |
| `after-clean` | 改后 | 干净副本 | — | **890·0·0** | **0**（显式） | 三条新断言全绿 |
| `after-contaminated` | 改后 | 形态副本 | — | **890·6·1** | **1**（未声明 ⇒ 红） | 5 条扫描红 + **新增那条红** |
| `after-contaminated-allow` | 改后 | 形态副本 | `--allow-control-exemption` | **890·5·1** | **1**（已登记） | 红回到 5 条；登记四处可见 |
| `after-m15-target-nonotes` | 改后（探针） | 干净副本 | — | **890·3·1** | 0 | 靶页前提 ✗ 点名 `category/agent/`（0 条说明） |
| `after-m15-target-restore` | 改后（探针，缺省 env） | 干净副本 | — | **890·0·0** | 0 | **还原回绿** |

## 6. 验证命令读数

| 命令 | 读数 | exit |
|---|---|---|
| `npm run build` | 产物自检全过；`dist` 304 文件 / 20,408,439 B / 全树摘要 `5a1ddfa99563c07b…` | 0 |
| `npm run check:ci` | **39 项 / 失败 0**（(W) 实跑 38 条 = 冻结清单 38 条 + 本看门狗） | 0 |
| `npm run check:evidence` | 绿（1283 个已跟踪 Tier-3 全在清单内、无新增） | 0 |
| `npm run gate` | **48 个脚本全部执行 / 343.3s / 失败 0 / exit 0**（读同一份 `.github/actions/gate/action.yml`，本地跳过 4 个非 node 步骤）；含 `[50] Real-browser acceptance (verify-site.js)` **145.7s** · `[51] Regression verify (baseline compare)` **145.8s** —— 说明新增的三个 `metrics` 键没有打扰 `--compare` 归回比对 | 0 |

## 7. 没证明的东西（如实登记）

1. **M10 的 1500px 边界仍未扫**（t31 的自认边界原样保留）：本轮只做「正对照降级 + M15 靶页前提」两件事，
   **没有**重测 `M10` 靶位宽度 950/1440/1500/1600 那组读数。
2. **替代靶页样本极少**：t31 只测了 `need/dev-credits/`、`need/student-only/` 两个**有说明**的替代靶页；
   本轮对「0 条说明」只测了 **1 个**页（`category/agent/`）—— 全站 122 个 0 条说明的页**没有穷举**。
3. **只在本机 Windows + msedge（headless）上跑**：没有 chromium/firefox、没有 Linux/CI 实测。
4. **探针是副本**：本轮的「换靶页」红读数来自**探针副本**（`PROBE_M15_ROUTE`），
   仓库那一份的 M15 靶页**没有被真改成 0 条说明的页**（也不该改）。因此「真改靶页会怎样」是**推断**，
   实测的是「靶页读数为 0 条说明时新断言会红」。
5. **断言 ③ 的「独立重算」不是独立预言机**：它用的是**同一份** `wideNoInjectionControls` 表重数一遍
   （`verticalNotes > 0` 的行数），能抓住「走了豁免却没登记」，但抓不住「两处同时写错」。
6. **没有把豁免登记接进 `check:ci` 的冻结表 / 门禁步骤清单**：它不新增门禁步骤，故不需要登记；
   但反过来说，**没有人**在门禁层面断言「豁免计数必须是 0」——那是运行 `verify-site` 的那一轮自己的事。
7. **历史复跑配方没有同步更新**（见 §4 的 ⚠️）：`--allow-control-exemption` 只写进本报告与自审，
   `docs/DESIGN-RULES.md` / `NEXT-STEPS.md` 不在 inScope，没有回写。
8. **`--allow-control-exemption` 是个新 CLI 开关，但没有负例自检**：本轮没有专门跑「声明了但没有豁免」的一轮
   （那种情况下断言 ① 仍是绿的：`0 条豁免` 分支不看开关）—— 结论是推断，不是实测。
9. **没跑 Full Gate 之外的其它装置**（24 副本回归等）：本轮只跑了 §6 的四条命令 + §5 的七个用例。

## 8. 复现命令

```powershell
cd "D:\OneDrive\Desktop\Code\AI Page\.worktrees\judge-control-downgrade-v1"
npm ci; npm run build

node .arch-v1/setup.cjs                  # 冻结改前工具 + 建 dist 的两份副本
node .arch-v1/probe/make-probe.cjs       # 从**改后**工具生成靶位探针
node .arch-v1/run-cases.cjs              # 7 个用例（每个 ~2.5 分钟；逐个落 .arch-v1/{log,json}/）
node .arch-v1/make-evidence.cjs          # 重算 research/_raw/judge-control-downgrade-guard-v1/

# 单跑某一条：
node .arch-v1/run-cases.cjs after-contaminated
node scripts/tools/verify-site.js --dir=dist          # 890/0（干净产物）
node scripts/tools/verify-site.js --dir=.arch-v1/dist-contaminated --allow-control-exemption
```

**改动面**：`scripts/tools/verify-site.js`（+87/−0）· 本报告 · 自审 · `research/_raw/judge-control-downgrade-guard-v1/`。
**没有碰**：`scripts/lib` · `scripts/data` · `scripts/tools/build-local.js` · `dist` · `docs/DESIGN-RULES.md` · `NEXT-STEPS.md`。
