# T15 · round 3 对抗复审（reviewer-2 · 全新会话）

被测标的：`scripts/tools/verify-site.js` sha256 `108818856cdf40a4812feb35ecd6917f7ad328681206b3457ed5dc11c7edef06`（内存补丁运行前后各记一次，sha 相同）。
基线：`HEAD=1f225d2`。工作树只改了本团队的生产源码；**我本轮零写入生产文件**（只写 `research/_raw/secondary-page-layout-unification/review.md`（追加指针）与 `review/**`）。
独立性：浏览器侧结论全部来自**自己的探针** `review/harness/probe-r3.cjs`（不 import verify-site.js、不读它的产出）；需要"被测工具本人怎么判"时用**内存补丁**跑它（`review/harness/patched-760.cjs`，只在内存改一处调用点，生产文件零写入）。

## 0. 结论

**verdict = needs_revision。**

- 上轮两条 blocker（F-R2-1 grid / F-R2-2 伪元素）**确实反转**：grid ⇒ 整轮 EXIT=1 且命中的是 `note-ink-narrow`（旧码 `note-narrow` 0 条）；伪元素 ⇒ `note-hidden-text`（13/13）。
- 并集两向、t11 三形态、零误报/零漏判、前置条件、不变量（§22b/反空洞/--compare/CI/--url）**全部达标**。
- **唯一 blocker = 覆盖窗口（R3-1）**：逐行字迹口径只在 1440/1600 判，而 760 档**物理上能发生同一条 70ch 窄柱**（列宽 728 > 70ch 实测 452.81），把口径开到 760 **零误报**（我的探针 186 页/401 条 = 0；被测工具内存补丁实跑 @760 断言 = `0 违规码`）⇒ 没有理由排除 760。复现：把 F-R2-1 那条 CSS 包进 `@media (max-width:760px)` ⇒ `changes/` 6 条说明在 760 的最宽行只有 432–445px（比值 0.60，与 1440 被咬中的是同 6 条），而**整轮 848 项 EXIT=0**。
- 另两条 low（不改变结论但也应修）：R3-2 分码归属表述与实测不符；R3-3 ① 的 `contentBox===0 ⇒ 回落 border-box` 在无盒形态上误报 + 一处过时注释。

## 1. 前置自检（锚点式；缺失即判红）

| 检查 | 读数 | 结论 |
|---|---|---|
| 判据锚点（不按行号按源码串） | ① `L6540-6543` → `note-narrow`，量 `textWidth`；② `L6552-6555` → `note-ink-narrow`，量 `lineCount>=2 && widestLine`；③ `L6558-6561` → `note-hidden-text`，量 `rendered && textLength>0 && glyphRects===0` | 与自述一致（§6） |
| 前置条件 `lineCount >= 2` | L6552 子句仍在 | ✓（§5 反证） |
| 作用域 | L6524 `inkRuleOn = !meta \|\| meta.inkRule !== false`；样本集调用点 L6929 传 `inkRule:false` ⇒ **760/360 不判 ②** | 见 R3-1 |
| §22b 一行未改 | 纯新增机械验证：当前 417988 B / 基线 338291 B；插入区间 **2 段**（顶部 3 行 + §22c 第 6101–7434 行 = 1334 行/79513 B）；**把两段删掉后与基线逐字节相同**；`git diff --numstat HEAD` = `1337 0`（删除 0 行） | ✓ |
| CI 口径 | `node scripts/tools/check-ci-consistency.js` ⇒ `✅ CI 口径检查 38 项，失败 0 项` | ✓ 38/38 |

## 2. A · 上轮两条 blocker 的反转（自己重跑，不引用 t14 读数）

**F-R2-1（grid：一条 CSS、不动标记）** — 副本 `review/scratch/r3-false-green-grid`，`changes/` 共享 `<style>` 注入 `.snote { display: grid; grid-template-columns: minmax(0, 70ch) 1fr; }`（冻结串仍 1 次）：

- 完整套件 **EXIT=1**（848 项 3 处失败）。§22c @1440/@1600 读数为 `note-narrow 0（0 页）· note-ink-narrow 6（1 页）`：
  `changes/#0 445.05 · #1 445.09 · #2 432 · #4 444 · #8 444（3 行）· #12 444.23（3 行）`，六条**盒 1380 / 内容盒 1380 / 列 1380** ⇒ 旧口径一条看不见。
- 第三处失败是工具自己的正对照（M9b changes/@1440）在我这份**永久注入**的副本上如实报出同样 6 条 —— 归因清楚，不是新问题。
- **同副本不注入**（`plain`，逐字节等于 dist 的复制）：**EXIT=0，848/848**。
- 残留（设计取舍，非缺陷）：`changes/` 13 条里 7 条在 70ch 轨里仍是单行（`lineCount=1`）⇒ ② 不判；`.snote` 无背景/边框，单行短文本在 452px 轨与 1380px 列里渲染完全相同（如 `#7` 两处都是 156px），不构成可见窄化。

**F-R2-2（伪元素承载正文）** — 副本 `r3-pseudo`，`changes/` 注入 `.snote{font-size:0}` + `.snote::before{content:"…"}`：

- 完整套件 **EXIT=1**；@1440/@1600：`note-hidden-text 13（changes/ 全部）· note-narrow 0 · note-ink-narrow 0`，逐条读数 `文本 40–68 字 · 字形盒 0 · 行 0 · 盒 1380 · rendered=true`。
- @760/@360 也报同码 ⇒ ③ 无作用域收窄。
- 其余失败（M11 期望 ②、M9b 正对照）由永久注入把该页字藏起来导致，可归因。

## 3. 并集 · dist.baseline 的分码归因（自己复算，不采信 t7/t11/t14）

`--dir=dist.baseline`（`review/runs/r3-m0.json`）：401 条说明；**① `note-narrow` = 156 条 / 48 页**；**② `note-ink-narrow` = 108 条**；交集 108；**并集 156 条 / 48 页 = `geometry/truth-401.json` 的并集（逐条集合相同、漏判 0、误报 0）**；藏字 0。

- 156 条的盒宽分布 **全是 452.81**（内容盒 453）——基线压的是 `.snote` 元素本身，所以 ① 看得见**全部 156**。
- 156 条里**单行 48 / 多行 108**：② 恰好覆盖多行那 108；单行 48 条没有行证据，只能靠 ①（与 §22c 注释 L6124-6128 一致）。
- 但 `truth-401` 的 48/108 **不是按码切分**：`geometry/make-truth-401.cjs:56` 写的是 `return index === 0 ? 'caughtByOldCriteria' : 'onlyNewTruth'`（每页第 0 条 = 48；实测这 48 条**全部是多行**，48 条单行反而都落在 `onlyNewTruth` 里；② 与 `onlyNewTruth` 只交 60 条）。
- ⇒ 正确表述：**① 覆盖 156（含 48 条单行窄盒）· ② 另覆盖 108 条多行窄字迹**。验收括号里"48 由 note-narrow + 108 由 note-ink-narrow"作为分码归属**不成立**（R3-2）；但实质要求（并集 156/48、集合级等于真值、零漏判）**成立**。

## 4. t11 三形态重判 + §22c 边界注释核对

副本 `r3-multicol-float`（`changes/`：`column-count:3; column-gap:24px`；`student/`：`::before{float:right;width:70%;height:12em}`）：

- **multicol ⇒ EXIT=1，② 命中 8 条**（`changes/#0,#1,#2,#3,#4,#8,#9,#12`，最宽 421.81–564px；内容盒全 1380 ⇒ ① 看不见）。
- **float ⇒ ② 命中 2 条**（`student/#0` 6 行最宽 409.8px、`student/#2` 3 行最宽 **411.52px**，与 t11 的 411.3px 一致）。
- **overlay（绘制类）⇒ 预期绿**（我用两种：`clip-path: inset(0 70% 0 0)`（vendor/ai360/）与不透明 `::after` 盖右 70%（plans/））：两页读数与 dist 完全一致（如 `vendor/ai360/#0` 3 行最宽 1375.98），**零违规码**。
- 注释核对：§22c 的边界注释**确实存在**（L6162-6169），明确"绘制类遮盖**不在本版承诺内**：clip-path、mask*、不透明覆盖层"，理由 = 像素断言跨平台 flaky + 全仓普查 0 处；**并且 L6141-6147 明确写了**"它量的是「字迹在横向铺到哪里」… multicol 形态命中读数是 **912.63px（66%）**…这正是想要的语义"（"语义而非 bug"在，且写了"免得下一轮当 bug 提"）；L6157-6160 披露竖排不判 ②。断言名里**没有**"任何窄柱都会被拦下"这类无限定语（@760 断言名自己写了"逐行字迹只在桌面档判"）。
- 一处措辞建议（非 blocker）：我这份 3 列 multicol 构造读数是 421.81–564px（≈单列宽），不是 912.63px —— 归并是否跨列取决于各列文字是否垂直对齐；两种都被咬中，注释里的数字是 t11 那个构造的读数，建议写成"以该构造为例"。

## 5. B · 覆盖窗口（本轮最关键的诚实点）—— 立案依据

**① 物理量测（独立探针，186 页逐页现场量）**

| 档 | Wide Data Page 列宽 = min(主数据区, 页面列) | `70ch` 现场实测 |
|---|---|---|
| 1440 | 1120–1380 | **452.81px** |
| **760** | **676–728** | 452.81px |
| 360 | 276–328 | 452.81px |

⇒ **728 > 452.81**：760 档"盒满宽、字进 70ch 窄轨"**物理上可以发生**。

**② 决定性实验：把 ② 开到 760，误报几条？**

- 独立探针（186 页 / 401 条；谓词按锚点另写一份；在 1440 与工具逐条对账 **401/401 完全一致**）：@760 **命中 0 条**（@1440 也 0；@360 1 条 = 已知 `feeds/#2`：328px 列 CJK 断行余量）。
- 被测工具实跑（内存补丁 `inkRule: width === 760`）：`✓ §22c @760 样本集 29 页 … 0 违规码`；该次运行 EXIT=1 的唯一失败是与布局无关的键盘焦点 flake（`Esc 关闭对比视图并把焦点还给…`）。
- ⇒ **760 档误报 0 条**，没有理由排除 760。

**③ 缺口形状（可复现）**：副本 `r3-b760` = **与 F-R2-1 一模一样的那条 CSS**，包进 `@media (max-width: 760px)`（`changes/`，冻结串 1 次）：

- 探针 @760：`盒 728 / 内容盒 728 / textWidth 728 / 列 728`，**6 条多行说明最宽 432–445px（比值 0.60）**，与 1440 被咬中的 **同 6 条**（`changes/#0,#1,#2,#4,#8,#12`）。
- 冻结套件：样本集 @760 的确访问了 `changes/`，但 ② 被 `inkRule:false` 关掉、① 只有满宽内容盒 ⇒ **`✅ 验收 848 项，失败 0 项`（EXIT=0）**。
- 这不是"模型外"形态：工具自己的 **M10 变异牙**就是"缺陷藏在 `@media (min-width:1500px)` 里（1440 看不见、1600 才咬得到）"——同一攻击面在 ≥1500 被建模，≤760 的镜像面没有任何牙。

**④ 裁定**：按 captain 的决策规则（0 误报 ⇒ 无理由排除 760）⇒ **needs_revision**，见 R3-1。requiredFix：作用域改成**物理前置条件**（如 `min(主数据区, 页面列) > 70ch` = 452.81px：760 档 728>452.81 判、360 档 328<452.81 不判，正好保住 360 的已知边界），或等效显式列宽判据；并把注释 L6523/L6548 与 @760 断言名里的"只在桌面档标定"改成写明的物理边界。若坚持排除 760：按 P1/DEFERRED 写明盲区形状"仅在 ≤760 生效的窄化" + 760 误报 0 的证据。

## 6. 边界诚实性：自称口径 vs 实际量

- **② 自述 = 实际**：`lineCount >= 2 && widestLine < 0.85 × min(主数据区, 页面列)`，`widestLine` = 文本节点字形盒 Range 按"垂直重叠 > 较矮高度 50%"归并后每行 `right-left` 的最大值（L6114-6117 / L6552）。我按定义另写实现，在 1440 与工具逐条一致 **401/401**。**没有拿盒子冒充实测字迹。**
- **① 自称就是代理量**：消息写"有字区域宽（**内容盒代理量**）"，回落时附 `textFallback 回落` —— 不是本轮病根。但两处要改（R3-3）：L6428 注释"诊断量（**不再作判据**，单行回落除外）"已过时（`textWidth` 就是 ① 的判据量）；`contentBox===0 ⇒ 回落 border-box` 作为**绕过面已被 ② 兜住**（`padding: 0 50%` ⇒ 内容盒 0、border-box 满宽 ⇒ ② 咬中 3 条：283 行/最宽 16.48px、88 行/12px、5 行/12px），但作为**误报面**在无盒形态上会红（`display: contents` ⇒ ① `0px < 阈值` + `note-axis`，而文本实际满宽 1378.75px）。
- **③ 边界如实**：`rendered`（盒有宽有高）是显式条件（L6556-6558）；dist `unrenderedNotes: 1`（`plans/coding/#1` `<noscript>`，盒高 0、零字形盒、无码）。同形状的 `.snote{font-size:0}` 单独写法也落进 unrendered（3 条零码）——属"不可见性"一类（验收明示放行），但 `unrenderedNotes` 只有计数没有断言（观察项）。
- 结论：**没有**发现"自称口径 ≠ 实际量"的放行型不一致；1440/1600 上 t5→t7→t8 的病确实治好了。剩下的不诚实只有 §5 的作用域理由与 §3 的分码归属表述。

## 7. 新形态逐条判定（≥3 个新机制）

`r3-newforms`（12 处注入）+ `r3-balance` + `r3-b760`：

| # | 形态 | 读数（自己量） | 判定 |
|---|---|---|---|
| 1 | `display:table; table-layout:fixed` + `::before{display:table-cell;width:60%}`（docs/data/） | 盒/内容盒 1380；3 行，最宽 539.83–552 | **咬中（②×3）** ✓ |
| 2 | `padding: 0 50%`（内容盒 0 ⇒ 回落 border-box）（need/china-usable/） | ① 看不见；283/88/5 行，最宽 16.48/12/12px | **咬中（②×3）** ✓ 堵住回落旁路 |
| 3 | `text-wrap: balance`（vendor/aliyun/，该页确有 3 行说明） | 盒 1380；3 行，**最宽 1012.69（0.7338）** | **咬中（②，工具实跑 EXIT=1：`note-ink-narrow 1（1 页）· note-narrow 0`，命中 `vendor/aliyun/#0`）** ✓ |
| 4 | `zoom: 0.5`（student/） | 盒 1380、**内容盒 2760**、全变单行 | 放行且**正确**：不是窄化（行仍铺满列） |
| 5 | `direction: rtl; unicode-bidi: bidi-override`（status/） | 2 行最宽 1376.39（1.00） | 放行且正确：未窄化 |
| 6 | `clip-path: inset(0 70% 0 0)`（vendor/ai360/） | 同 dist | 放行 = 预期（§22c 明示不承诺） |
| 7 | 不透明 `::after` 覆盖右 70%（plans/） | 同 dist | 放行 = 预期 |
| 8 | `color: transparent`（need/free-tier/） | 2 行最宽 1375.06（1.00） | 放行 = 预期（不可见性另一类） |
| 9 | `font-size: 4px`（need/free-api/）**前置条件反证** | 3 条变单行（最宽 349–753px，比值 0.25–0.55），盒满宽 | **未被 ② 命中 = 要求行为** ✓ |
| 10 | `.snote{font-size:0}` 单独写（vendor/anthropic/） | 3 条：行 0/字形盒 0/unrendered=true/零码 | 放行 = 不可见性一类（L6556-6558 已披露） |
| 11 | `display: contents`（developer/） | 盒 0；① 误报 + note-axis；文本实际满宽 1378.75 | 误报面（R3-3） |
| 12 | `@media (max-width:760px)` 里的同一条 grid（changes/） | @760：盒/内容盒/textWidth 728；6 条最宽 432–445（0.60） | **放行 = R3-1（blocker）** |

## 8. 零误报 / 零漏判 + 抽查

- `--dir=dist --compare=research/_raw/ours-baseline/verify.json`：**EXIT=0，854 项 0 失败**；`layoutViolations = []`；`notesJudged=401`、① / ② / 并集 / 藏字 = 0、`unrenderedNotes=1`、`verticalNotes=0`；条级容器 @1440/@1600 各 401 条、逐行带 route/index/codes。`--compare` 6 项全绿（80→80 · 50→50 · 6→6 · 页高 4589→4787px（容差内）· 外链 0→0 · JS 错误 0）。
- 独立探针 @1440：401 条、**0 码**，与工具逐条对账 **401/401**。
- 抽查 ≥15 条（`review/runs/r3-samples.txt`、`r3-probe-dist.json`）：最短单行 `docs/data/#7`（36px）、`category/*/#1「全部变化 →」`（61.64px）；最长多行 `vendor/*/#0`（3 行 1375.98）；`/archive/` 5 条（1104.39 / 256.36×3 / 448.28，盒 1354–1380）；`plans/coding/#1`（noscript 未渲染）；**3 个别名页** `need/dev-credits/#0 · need/free-api/#0 · need/student-only/#0`（`class="snote aliasnote"`，2 行，最宽 1312.28/1356.45/1358.97，内容盒 1369/1380 = 0.99）。全部读数合理、全部无码。
- 漏判方向：`dist.baseline` 并集 156/48 = 真值并集（逐条相同）✓。
- 前置条件量化：若去掉 `lineCount>=2`，dist@1440 会有 **319 条**单行说明被误报（@760 182、@360 71）——注释 L6135 的"89 条"在现口径下复算不出（无任何变体复现 89），方向对、数字要改（并入 R3-2）。

## 9. 不变量复验

| 项 | 读数 |
|---|---|
| §22b 一行未改 | 纯新增验证：删两处插入后与基线**逐字节相同**；`git diff --numstat` 删除行 0 |
| 反空洞守卫 0 次 / ≥2 次 | `✓ §22b 反空洞守卫自检…（0 次 ⇒ ok=false · 4 次 ⇒ ok=false）`、`✓ §22c 反空洞守卫自检…（0 次 · 61 次 ⇒ ok=false）`（clean 副本 848/848） |
| §22c 变异牙 | M1–M4/M8/M9a/M9b/M10 咬 ①；**M11 咬 ②**（`note-narrow 0 条 · note-ink-narrow 6 条 [changes/#0,#1,#2,#4,#8,#12]`）；**M12 咬 ③**（`字形盒 0 · 渲染 true`）；`违规码自检：10 个码全部由 wideProblems() 一处产出、且都可达`；`变异牙零磁盘污染` |
| `--compare` 6 项 | 全绿（§8） |
| 整轮 dist 0 失败、§22c 之外零新增失败 | 854/854 ✓ |
| check-ci-consistency | 38/38 ✓ |
| `--url=` 的 layout* 键 | 实跑（本地服务 dist → `--url=http://127.0.0.1:8123/`）：**10 个 layout* 键全部 `{"skipped":true,"reason":"--url= 模式没有产物目录，§22c 的路由清单/几何扫描/变异牙都无从现算（不改成拿线上首页硬凑一份假清单）"}`**；该次 EXIT=1 的 2 条失败都是线上 analytics beacon 期望（本地无 beacon，与布局无关） |

## 10. 运行清单（本轮的 verify 命令与读数）

| 命令 | 读数 |
|---|---|
| `make-scratch.cjs r3-false-green-grid` + `verify-site --dir=…/scratch/r3-false-green-grid` | EXIT=**1**（②×6；正对照如实报同 6 条） |
| `make-scratch.cjs plain` + `--dir=…/scratch/plain` | EXIT=**0**（848/848） |
| `--dir=…/scratch/r3-pseudo` | EXIT=**1**（③×13） |
| `--dir=…/scratch/r3-multicol-float` | EXIT=**1**（②×10：multicol 8 + float 2） |
| `--dir=…/scratch/r3-newforms` | EXIT=**1**（②×6：table-layout 3 + padding 50% 3；① 误报 3 = display:contents） |
| `--dir=…/scratch/r3-balance` | EXIT=**1**（②×1：`vendor/aliyun/#0`（balance）；① 0 条；@760 样本集 0 违规码） |
| `--dir=…/scratch/r3-b760` | EXIT=**0**（848/848 —— ≤760 窄化放行，R3-1 的复现） |
| `--dir=dist.baseline` | ①=156 / ②=108 / 并集 156 条 48 页（= 真值并集） |
| `--dir=dist --compare=…/ours-baseline/verify.json` | EXIT=**0**（854/854；layoutViolations 0） |
| `patched-760.cjs`（内存补丁，dist） | @760 样本集 **0 违规码**；生产文件 sha 不变 |
| `--url=http://127.0.0.1:8123/`（serve dist） | 10 个 layout* 键全 `{skipped:true, reason}`；EXIT=1 的 2 条失败均为本地无 beacon 的线上分析期望 |
| `node scripts/tools/check-ci-consistency.js` | 38/38 |

## 11. 证据索引（全部在 `review/**`；`dist` / `dist.baseline` / 生产源码零写入）

- 脚手架：`harness/probe-r3.cjs`（独立探针，含 70ch 现场实测）· `harness/analyze-probe.cjs` · `harness/probe-stats.cjs` · `harness/check-truth-sets.cjs` · `harness/check-22b-bytes.cjs`（纯新增机械验证）· `harness/patched-760.cjs`（内存补丁）· `harness/pick-samples.cjs` · `harness/check-89.cjs` · `harness/list-22c-checks.cjs` · `harness/extract-r3.cjs`
- 造产物：`make-scratch.cjs`（`r3-false-green-grid` / `r3-pseudo` / `r3-multicol-float` / `r3-newforms` / `r3-balance` / `r3-b760`；每次回执打印"冻结串=1"与"dist 未被触碰=true"）
- 读数：`runs/r3-{grid,plain,pseudo,mcf,newforms,balance,b760,m0,green,patched-760,url}.json/.log/.exit.txt`、`runs/r3-invariant-22b.txt`、`runs/r3-probe-{dist,balance,b760}.json`、`runs/r3-m0-truth.txt`、`runs/r3-samples.txt`、`runs/r3-check-89.txt`、`runs/r3-plain-22c-checks.txt`

---

## Findings

### R3-1 · blocker · 760 档窄化整类放行（作用域拿"桌面档标定"顶替物理前置条件）
- problem：② 只在 1440/1600 生效（`L6524`、样本集调用点 `L6929` 传 `inkRule:false`）。实测 **W760 = 676–728px > 70ch = 452.81px**（现场量）⇒ 70ch 窄柱在 760 物理上可以发生；把 ② 开到 760 **误报 0 条**（独立探针 186 页/401 条 = 0；被测工具内存补丁 `✓ §22c @760 样本集 29 页 … 0 违规码`）。复现 `r3-b760`：把 F-R2-1 那条 CSS 包进 `@media (max-width:760px)` ⇒ `changes/` 6 条在 760 最宽 432–445px（比值 0.60，与 1440 被咬中的同 6 条），而**整轮 848 项 EXIT=0**。工具自己的 M10 牙证明"缺陷藏在媒体查询里"是本门禁建模过的攻击面，≤760 的镜像面没有牙。
- requiredFix：把作用域条件从"桌面档（1440/1600）"改成**物理前置条件**（例：`min(主数据区, 页面列) > 70ch`（现场实测 452.81px）——760 档 728>452.81 判、360 档 328<452.81 不判，保住 360 的已知误报边界），或等效显式列宽判据；并把 `L6523/L6548` 与 @760 断言名里的"只在桌面档标定"改成写明的物理边界。若坚持排除 760：按 P1/DEFERRED 写明盲区形状（"仅在 ≤760 生效的窄化"）+ 760 误报 0 的证据，且全站不得出现"任何窄柱都会被拦下"的定语。
- file/line：`scripts/tools/verify-site.js:6524`、`:6548`、`:6929`

### R3-2 · low · 分码归属表述与实测不符（验收 / 真值生成器 / 合成器注释 / 注释里的 89）
- problem：实测 `--dir=dist.baseline`：**①=156 条**（156 条的盒宽全是 452.81 ⇒ ① 看得见全部）、**②=108 条**（= 多行）、交集 108；`truth-401` 的 48/108 来自 `make-truth-401.cjs:56` 的 `index === 0 ? …`（按序切分；这 48 条实测全是多行，48 条单行反而都在 `onlyNewTruth`）。§22c 注释 `L6135` 的"89 条单行短说明"在现口径下复算为 **319 条**@1440（182@760、71@360，无变体复现 89）。`geometry/make-synthetic-reports.cjs:96-97` 的"index>0、盒宽满宽但字迹窄"前提在真实产物上不成立。
- requiredFix：把表述统一改成"① 覆盖 156（含 48 条单行窄盒）· ② 另覆盖 108 条多行窄字迹"；`L6135` 的数字用当前口径复算值（或写明定义）；更正合成器注释的前提。判据行为本身不用改。
- file/line：`scripts/tools/verify-site.js:6135`；`geometry/make-truth-401.cjs:56`；`geometry/make-synthetic-reports.cjs:96-97`

### R3-3 · low · ① 的 `contentBox===0 ⇒ 回落 border-box` 在无盒形态上误报 + 一处过时注释
- problem：`display: contents`（`.snote` 不生成盒子）时 `textWidth` 落地为 0 ⇒ ① 报 `note-narrow … 0px < 阈值（textFallback 回落）` 并连带 `note-axis`；该条文本实际由父级满宽排版（最宽一行 1378.75px）⇒ **误报**（不是放行）。同处 `L6428` 注释"诊断量（**不再作判据**，单行回落除外）"与实现矛盾（`textWidth` 就是 ① 的判据量）。
- requiredFix：给 ① 加 `rendered` 守卫（或沿父级链找承载文本的块级元素，取不到就不判），并把 `L6428` 注释改成"① 的判据量（代理量；无承载块时回落 border-box，消息里标 textFallback）"。
- file/line：`scripts/tools/verify-site.js:6428-6431`、`:6540`

### 不计入 finding 的观察项（都不是"布局类放行"）
- `zoom: 0.5`、`direction: rtl` 的放行是**正确**的（行仍铺满列，不是窄化）；`clip-path` / 不透明覆盖层 / `color: transparent` / `.snote{font-size:0}` 单独写（落进 `unrendered` 桶）属 §22c 明示不承诺的绘制/不可见性类。建议下一轮把 `unrenderedNotes`（dist=1）也钉一条断言：否则"用 font-size:0 把说明藏起来"只体现在明细文字里。
- multicol 的 912.63px 是 t11 构造的读数（我这份 3 列构造读 421.81–564px，两种都被咬中），建议注释标注"以该构造为例"。
