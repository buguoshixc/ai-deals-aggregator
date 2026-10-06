# T2 / T7 · §22c 的牙齿证据（Wide Data Page 页面级说明同轴门禁）

这一目录是 **T2（门禁工程师）** 的产物与证据：把「二级数据页的页面级说明要与主数据区同轴」
做成 `scripts/tools/verify-site.js` 里可判红的一节（§22c），并留下红/绿/变异三种读数。
**T7（修复轮 2）** 在同一块里修掉了 T6 复审的两处 blocker 与两处 low，读法以 §0 为准。

> 本节只加**门禁**：产品改动（`.snote` 收成唯一一处、宽度 `max-width: none`）由 T1 做，
> §22c 负责证明它「作用在产物上之后全站 186 页都成立」，以及「判据本身真的会被咬到」。

---

## 0. T7 修复轮：口径变了什么、读数是什么（**先看这一节**）

T6 复审判了两处 blocker（`review.md` F1/F2）：判据量的是 border-box（`padding-right: calc(100% - 70ch)`
能让有字区域变回 451px 窄柱而整轮 EXIT=0），而且只判 `<main>` 里**文档序第一条** `.snote`
（401 条说明里 296 条没有几何判据）。T7 的修法：

| 项 | 修复前 | 修复后 |
| --- | --- | --- |
| 宽判据 | `note.width`（border-box） | **`textWidth`（有字区域）** = 说明自己与「直接承载文本、且参与行布局」的块级后代里**最窄的 content box**；一条承载文本的块级元素都没有时回落 content box / border-box 并标 `textFallback`（dist 上 41 条）。<br>Range 并集字迹仍每条都量（`inkWidth`/`inkLines`）进 `metrics.layoutNotes`，但**不当判据**：短文本天然填不满列（dist 上 89 条单行说明字迹 < 0.85×列宽，例「全部变化 →」61.64px），拿它当判据会误报 230 条 / 79 页 —— 读数见 `_scratch/measure-v2-dist-1440.json`。 |
| 轴判据 | 固定 1px 容差 | 仍用 border-box（`.aliasnote` 的 3px 竖线 + 8px 缩进是**有意设计**），容差改成 `max(1px, 5% × min(主数据区宽, 页面列宽))` —— 60px 级内缩不再误报，450px 级交给宽判据咬。 |
| 判据范围 | `<main>` 内**第一条**（105 条） | `<main>` 内**全部** `.snote`（401 条），逐条 `route#index`；「无说明 ⇒ 跳过」只对**零条**的 81 页成立。 |
| 条级容器 | 无 | `metrics.layoutNotes`（@1440）与 `metrics.layoutNotesAt1600`（@1600）各 401 行，含 `route/index/codes/width/textWidth/inkWidth/inkLines/ratio/column/parent/text`。 |
| 桌面档 | 只有 1440 | **1440 + 1600 全站逐条**（`@media (min-width:1500px)` 里藏的缺陷 1440 档物理上看不见）。 |
| `--url=` | 只 console 一行 | `metrics.layout*` 全部写成 `{ skipped: true, reason }`（机器可读，「跳过」≠「跑了但 0 违规」）。 |

新增的变异牙：**M8**（`.snote { padding-right: calc(100% - 70ch) }`，F1 原型）、
**M9a/M9b**（`.snote ~ .snote` 与 `.snote:not(:first-of-type)` 只压非首个，F2 原型）、
**M10**（`@media (min-width: 1500px) { .snote { max-width: 70ch } }`，F4 原型）；
M1–M7 与 M5 复用不变。

### 0.1 读数（本次修复轮，产物 = 真实 `dist/` 与只读的 `dist.baseline/`）

| 命令（工作目录 = worktree 根） | 结果 |
| --- | --- |
| `node scripts/tools/verify-site.js --dir=dist.baseline --json=teeth/M0-after-repair.json` | **exit 1** · 842 项断言失败 **27 项，全部 §22c**（非 §22c 的 0 项）· 逐条判 401 条：**窄条 156 条 / 48 页**、不同轴 156 · @1600 同 156/48 · 冻结串 0/186 · M8–M10 锚点守卫与正对照按设计红 |
| `node scripts/tools/verify-site.js --dir=dist --json=teeth/M-green-after-repair.json` | **exit 0** · 842 项断言 **0 失败** · 逐条判 401 条：窄 0 / 不同轴 0 / 裁切 0 · @1600 窄 0 · 冻结串 186/186 · 628 次导航 0 JS 错误 0 外部请求 |
| `node …/geometry/gate-vs-truth.cjs --report=teeth/M0-after-repair.json --expect=baseline` | **pass** · 条级容器 `metrics.layoutNotes` · 真值 156 条/48 页 vs 实测 156 条/48 页 · **漏判 0 · 误报 0** |
| `node …/geometry/gate-vs-truth.cjs --report=teeth/M-green-after-repair.json --expect=green` | **pass** · 命中 0 条 / 0 页 · 245 条对照组零误报 |
| `node teeth/adversarial-replay.cjs dist dist` | **exit 0** · 19 个对抗形态重放：**12 条该翻的全翻**（A1–A5 / C1 / C1b / C1c / C2 / C3 / D1@1440 / 新增 B3），C0 / C0′ / C4 / D1@1600 保持原判定，B1（60px）/ B2（30px）两处**假红修好**，3 个别名页的 `.aliasnote` 零误报 |
| `node scripts/tools/verify-site.js --dir=dist --compare=research/_raw/ours-baseline/verify.json` | 见 §0.3（既有 6 项回归判据） |
| `node scripts/tools/check-ci-consistency.js` | 见 §0.3 |

关键的一条 M8 读数（F1 的要害 —— 盒宽没变、有字区域变了）：
`注入前 盒 1380px / 有字区域 1380px ⇒ 注入后 盒 1380px / 有字区域 452.81px（列宽 1380px · 阈值 1173px）—— 盒宽差 0px`。

### 0.2 成本（CI 20 分钟超时是否安全）

- **628 次导航 / 次运行**：1440 全站 186 + 1600 全站 186 + 390 全站 186 + 760/360 样本集 58 + 变异牙/正对照/守卫 12。
- §22c 本节实测：`layoutScan.seconds = { desktop1440: 9.0, desktop1600: 8.5, narrow390: 8.1, samples: 4, section: 32.1 }`（本地，绿轮）。
- **两步浏览器 gate 整轮实测（本地，T7）**：
  `--dir=dist.baseline` **112.7s（exit 1）** · `--dir=dist` **118.8s（exit 0）** · 两步合计 **231.4s ≈ 3.9 分钟**。
- 结论：距离 CI 的 **20 分钟**超时还有一个数量级的余量（即使把 `--compare` 与 `check-ci-consistency.js`
  再加进来，仍远低于上限）。修复前 reviewer 记的 101s 与本轮的 112.7s 之差 ≈ 新增 1600 全站档的 8.5s + 逐条读数开销。

### 0.3 回归与 CI 一致性

| 命令 | 结果 |
| --- | --- |
| `node scripts/tools/verify-site.js --dir=dist --compare=research/_raw/ours-baseline/verify.json` | **exit 0** · 848 项断言 0 失败 · `--compare` 既有 6 项全绿（覆盖 80→80 · 卡片 50→50 · 首屏完整 6→6 · 页高 4589→4787px（容差 15%） · 外部请求 0→0 · JS 错误 0） |
| `node scripts/tools/check-ci-consistency.js` | **exit 0** · CI 口径检查 38 项 0 失败（含「断言名单与冻结清单等值」「实跑项数 == --expect-checks=38」） |

---

## 1. 文件（T2 起，T7 追加的部分标 ✚）

| 文件 | 是什么 | 谁写的 |
| --- | --- | --- |
| `M0-after-repair.json` ✚ | **T7 的 M0 反证**：`--dir=dist.baseline` 整轮报告（842 项 · 失败 27 项全部 §22c · 窄条 156/48 页） | `verify-site.js --json=` |
| `M-green-after-repair.json` ✚ | **T7 的绿线**：`--dir=dist`（**真实产物**）整轮报告（842 项 · 0 失败 · 逐条判 401 条 · 窄 0） | 同上 |
| `gate-vs-truth-baseline.json` ✚ / `gate-vs-truth-green.json` ✚ | 与 `geometry/truth-401.json` 的**集合差**核对（两份都 pass；条级容器 = `metrics.layoutNotes`） | `geometry/gate-vs-truth.cjs`（T3 写，只读） |
| `adversarial-replay.cjs` ✚ / `adversarial-replay-dist.json` ✚ | T6 的 19 个对抗形态**重放**（判据按**锚点**抽取，不按行号）+ 翻转表 | T7 |
| `M0-baseline.json` | T2 期的 M0 反证（旧口径：只判第一条、只 1440 档；失败 14 项） | `verify-site.js --json=` |
| `make-synth-fixed.cjs` | 把 `dist.baseline` 整份复制成 `dist.synth-fixed` 并按 T1 的改法逐页改产物的**脚手架**（T7 保留，但权威读数已改用真实 `dist/`） | T2 |
| `M-synth-green.json` | T2 期的合成绿线（`--dir=dist.synth-fixed`，827 项 0 失败，旧口径） | `verify-site.js --json=` |
| `mutations.json` | M1–M10 / M6 正对照 / 不注入正对照 / M5 复用的**期望 vs 实测违规码**（含条级 `narrowKeys`/`matchedKeys`） | `verify-site.js`（与 `--json=` 同目录，最近一次运行的读数） |
| `_scratch/` | 定判据之前用的探针与原始读数（**非交付物**，见 §6） | T2/T7 |
| `../baseline/dist-baseline-sha256.txt` | `dist.baseline` 303 个文件的 sha256 清单（只读基线） | T1/证据侧 |

命令（工作目录 = worktree 根；T7 的六条 verify 命令）：

```bash
node scripts/tools/verify-site.js --dir=dist.baseline \
  --json=research/_raw/secondary-page-layout-unification/teeth/M0-after-repair.json      # 必须 exit 1
node scripts/tools/verify-site.js --dir=dist \
  --json=research/_raw/secondary-page-layout-unification/teeth/M-green-after-repair.json # 必须 exit 0
node research/_raw/secondary-page-layout-unification/geometry/gate-vs-truth.cjs \
  --report=research/_raw/secondary-page-layout-unification/teeth/M0-after-repair.json --expect=baseline
node research/_raw/secondary-page-layout-unification/geometry/gate-vs-truth.cjs \
  --report=research/_raw/secondary-page-layout-unification/teeth/M-green-after-repair.json --expect=green
node scripts/tools/verify-site.js --dir=dist --compare=research/_raw/ours-baseline/verify.json
node scripts/tools/check-ci-consistency.js
# 附加（对抗重放）：
node research/_raw/secondary-page-layout-unification/teeth/adversarial-replay.cjs dist dist
```

**一次只跑一个 verify-site**（浏览器套件会抢同一个 Edge/端口资源）。

---

## 2. `dist.synth-fixed` 与真实 `dist/` 的关系（别把脚手架当产品读数）

- `dist.baseline/` = commit `1f225d2` 的忠实**改动前**产物（303 文件 / 186 HTML / 117 非 HTML，只读）。
- `dist.synth-fixed/` = **预测版本**：把 baseline 整份复制后逐页做两件与 T1 等价的事 ——
  ① 删掉页面内联样式里任何 `.snote { … }` 规则（105 条：48 条 `70ch` + 57 条 `none`），
  ② 往第一个 `<style>` 块（= index.html 的共享样式块）的 `.detail-main` 规则后注入冻结串一次。
  实测：186/186 页内联样式里冻结串**恰好 1 次**，页面级 `.snote` 规则残留 0 条，
  `.snote.chgwarn` 保留 1 页（changes/），117 个非 HTML 文件逐字节等于源。
- **权威读数**来自 T3 在真实 `dist/`（T1 构建）上复跑同一条命令。`dist.synth-fixed` 只用来
  在不等 T1 的前提下把「判据能不能被咬到」证完；它证明的是**判据与脚手架的等价性**，
  不是「T1 一定做对了」。
- 本脚手架**不碰** `dist.baseline`：跑完自己会与 sha256 清单逐条对账（**303/303 命中、漂移 0**；
  清单是 UTF-8 BOM + CRLF，解析前先剥 BOM 再 `trimEnd`），并在自检里比对复制前后的源 sha256
  （漂移 0 个）。重复跑得到的产物**逐字节相同**：303 个文件的树哈希 `6f44788dc833…` 在两次运行
  前后一致（`_scratch/hash-tree.cjs` 可复算）。

---

## 3. §22c 的判据（一处函数产出，别处不再写第二份）

路由清单**从产物现算**：遍历产物目录里所有 `index.html` → 带尾斜杠路由（首页是空串）。
布局族解析走 `require('../lib/page-kinds')` 的 `kindOfRoute` + `layoutOf`（唯一真值出处，
脚本里**没有**第二份 kind→layout 表）；数据驱动的静态路由由调用方传入的 `kindByRoute` 补齐
（`audience.COLLECTION_PAGES → collection`、`audience.NEED_PAGES → need`、
`landing.VENDOR_HUB.route` / `CATEGORY_HUB.route → hub`、空串 → `home`）。

| 量 | 定义 | 判红条件 |
| --- | --- | --- |
| 页面级说明 | `<main>` 里**文档序第一个** `.snote` | 没有 `.snote` ⇒ 标为「无页面级说明」，跳过、**不算失败** |
| 主数据区 | 第一个命中的声明选择器 `.ctable / .stable / .chgsec / .chglist / .flist / .fsec / .ptable / .lsum / .pchglist`；命不中回落 `<main>` 并在报告里标出 | 连 `<main>` 都测不到 ⇒ `data-region-missing` |
| 宽度（比例，不是像素） | `note.width ≥ 0.85 × min(主数据区宽, 页面列宽)` | `note-narrow` |
| 同轴 | `│note.left-锚.left│ ≤ 1` 且 `│note.right-锚.right│ ≤ 1`，锚取**主数据区或页面主容器 `<main>`** 任一成立 | `note-axis` |
| 自身裁切 | `note.scrollWidth ≤ note.clientWidth + 1` | `note-clipped` |
| 布局族一致性 | detail 族必须**恰好 1 个** `main.detail-main`；wide 族必须 **0 个** | `missing-detail-main` / `unexpected-detail-main` |
| 布局族可解析 | 解析不出 kind/layout | `unclassified-layout` |
| 页面级溢出 | `documentElement.scrollWidth > 视口 + 1` | `page-overflow@<vw>` |

视口覆盖：**1440 全站几何 + 溢出**、**390 全站 `documentElement.scrollWidth`**、
**760 / 360 只量样本集**（样本集现场推导：`COLLECTION_PAGES` 全部 + `NEED_PAGES` 全部 +
两个枢纽路由 + 磁盘上所有非通配静态路由 + 每个通配族各一条真实路由 ⇒ 实测 29 条；
脚本里没有写死任何 id/slug）。

### 两处必须写明的判据细节（都是量出来的，不是让步）

1. **分母取 `min(主数据区, 页面列)`**：窄档里表格处在横向滚动容器中，border-box 比视口还宽
   （实测 360 档 `/student/` 的 `.ctable` 是 424px 而视口只有 360px），拿它当分母是范畴错误。
   1440 档两者相等（1380 / 1380），所以这条只在窄档起作用。
2. **同轴的锚是「或」**：`/plans/` 的主数据区 `.pchglist` 自身内缩在 `.phubsec` 里
   （实测 56..1384），而页面级说明落在页面列上（30..1410）—— 这一页「与主数据区同轴」的正确
   语义就是与页面主容器同轴。实测（修复后产物）105 页有页面级说明：**105 页与页面主容器同轴、
   104 页同时与主数据区同轴、0 页两者都不同轴**（唯一只与 `<main>` 同轴的就是 `/plans/`）；
   改动前产物上这两个数分别是 57 / 56 / 48（48 = 那批被压成 70ch 的页面，两个锚都不成立）。
   所以这条「或」不是放宽：**没有任何一页是靠它蒙混过去的**，两锚分布逐轮写进
   `metrics.layoutNoteAnchors = { region, main, both, neither }`，可直接复核。
3. **390 档只判溢出**（契约如此）：列宽/同轴那一档的定义是「列铺满可用宽」，窄档里表格在
   滚动容器里，其余码在窄档没有意义 —— 判据函数照跑，只取溢出类。

---

## 4. 三种读数

### 4.1 M0 反证（改动前产物必须红）

`--dir=dist.baseline` ⇒ **exit 1**，整轮 827 项断言**失败 14 项，全部是 §22c 新增**（§22c 自己
共 29 项），既有断言（§1–§26 里其余全部）**零新增失败**（用 `M0-baseline.json` 复核：失败项里
非 §22c 的有 **0** 个）。§22c 的红是这几条：

| 检查 | 读数 |
| --- | --- |
| `@1440 页面级说明与主数据区同轴` | 105 页有说明，**窄说明 48 · 不同轴 48**（`category/` `category/agent/` `category/api/` … `status/` `changes/` `feeds/`：说明 452.81px vs 主数据区 1380px，比例 0.328） |
| `冻结串每页恰好 1 次` | 0/186 页（改动前这条规则还不存在） |
| `@760 样本集` | 70ch 的页面在 760 档同样咬出 `note-narrow`（说明 452.81px vs 可用 728px） |
| `M1–M4`（各 2 项） | 锚点在内联样式里出现 **0 次** ⇒ 变异未生效，按红处理（**这是设计行为**） |
| `M6`（2 项） | 同上（锚点不存在） |
| `M6 正对照` | 改动前 `.snote` 没有 `overflow-wrap: anywhere`，同样注入 200 字符不可断串 ⇒ **溢出 1118px**，正对照按红（**这也是设计行为**：兜底规则还没落地） |

> 改动前产物上 M1–M7 的锚点守卫判红、正对照判红，正是「锚点不存在 ⇒ 变异没落地就不许算通过」
> 这条纪律要的结果。**没有为了让日志好看而绕过**：本轮不做任何替换、不留半截产物。

48 = 目录页族 45（`category/` + 20 个分类页 + `student/` `developer/` `free-api/` 等） + `status/` + `changes/` + `feeds/`，
与「4 个壳把页面级说明压成 70ch」完全对上。

### 4.2 绿线（合成修复产物）

`--dir=dist.synth-fixed` ⇒ **exit 0**：**827 项断言 · 失败 0 项**（§22c 29 项全绿）。

```
     布局族读数表（prompt §18）：全站 186 页 = wide 55 + detail 131 + other 0
     族      页面  有说明  窄说明  不同轴  裁切  溢出  detail-main  未分类
     wide    55    54      0       0       0     0     0            0
     detail  131   51      0       0       0     0     0            0
     other   0     0       0       0       0     0     0            0
     合计    186   105     0       0       0     0     0            0
     视口：1440 全站几何 + 溢出 · 390 全站 scrollWidth · 760/360 样本集 29 页
     主数据区：<main>（回落）=82 页 · .ctable=45 页 · .chgsec=1 页 · .ptable=55 页 · .flist=1 页 · .pchglist=1 页 · .stable=1 页
     冻结串：186/186 页内联样式里恰好 1 次（M0 的改动前产物在这里是 0/186）
```

- 81 页「无页面级说明」= 首页 + 80 个 deal 详情页（如实跳过、不算失败）。
- 主数据区回落 `<main>` 的 82 页 = 首页 + 80 个 deal 详情 + `archive/`。
- 390 档全站最宽的一页 `scrollWidth` = 390px（视口 390）⇒ 全站无横向溢出。
- §22c 自己开了独立 page：**438 次导航 · 本节 JS 错误 0 个 · 外部请求 0 个**，整轮的
  `errors` / `externalRequests` 全局账本不受影响（§26 的「本地 0 外链」与 `--compare` 的
  `jsErrors` 都读全局计数，所以这里必须隔离）。

### 4.3 变异牙（期望 vs 实测）

`mutations.json`（绿轮）逐条落盘；日志里的表：

| 牙 | 页面@视口 | 期望 | 实测 |
| --- | --- | --- | --- |
| M0（反证） | `--dir=dist.baseline` | `note-narrow ×48` | 另跑一次同一条命令：改动前产物必须红 |
| M1 | `student/@1440` | `note-narrow` | `[note-narrow, note-axis]` |
| M2 | `status/@1440` | `note-narrow` | `[note-narrow, note-axis]` |
| M3 | `changes/@1440` | `note-narrow` | `[note-narrow, note-axis]` |
| M4 | `feeds/@1440` | `note-narrow` | `[note-narrow, note-axis]` |
| M6 | `student/@390` | `page-overflow@390` | `[note-clipped, page-overflow@390]` |
| M7 | `status/@1440` | `unexpected-detail-main` | `[unexpected-detail-main]` |
| M6 正对照 | `student/@390` | 不得出现 `page-overflow` | `[无]`（同样注入 200 字符不可断串、CSS 一字不动 ⇒ scrollWidth 390） |
| M5（复用） | §22b 的 M1–M5 | 既有牙全绿 | §22b 41 项断言失败 0 · M1=`[center]` M2=`[width]` M3=`[axis,src-width]` M4=`[self-overflow@390,page-overflow@390]` M5=`[leaf-consistency]` · M4 正对照=`[无]` |

M1–M4 的变异是**逐字**把冻结串里的 `max-width: none` 换成 `max-width: 70ch`
（`overflow-wrap` 一字不动，隔离缺陷）；M6 只把 `overflow-wrap: anywhere` 换成 `normal`。
每条牙在替换前都过「锚点在内联样式里**恰好出现 1 次**」的反空洞守卫：0 次或 ≥2 次都返回
`ok:false` 且**不做任何替换**。守卫自身的负例自检：不存在的锚点 ⇒ 0 次 / `ok:false`；
非唯一锚点（`color: var(--mut);`，实测 61 次）⇒ `ok:false`。

**零磁盘污染**：`student/` `status/` `changes/` `feeds/` 四个产物文件的 sha256 在整段变异
前后逐条相等（byte-exact）；变异只发生在浏览器页面的内存 DOM 里。

---

## 5. 机器可读输出

`metrics.layoutSweep = { total, wide, detail, other, notesChecked, narrowNotes, overflowPages,
unexpectedDetailMain, missingDetailMain, unclassified }`，另加：

- `metrics.layoutFrozenRule`：冻结串原文 + 「恰好 1 次」的页数 + 偏离页清单；
- `metrics.layoutDataRegions`：主数据区判定分布（回落 `<main>` 的页数单列一项）；
- `metrics.layoutNoteAnchors`：同轴锚分布 `{region, main, both, neither}`（见 §3 第 2 条）；
- `metrics.layoutSample`：样本集的视口与逐条路由（现场推导的结果，可复核）；
- `metrics.layoutScan`：本节导航次数 / JS 错误 / 外部请求；
- `metrics.layoutViolations`：违规页逐条 `{route, kind, family, codes, note, region, column, regionSel}`；
- `metrics.layoutMutationCodes`：每条牙的违规码。

绿轮的 `metrics.layoutSweep`：
`{"total":186,"wide":55,"detail":131,"other":0,"notesChecked":105,"narrowNotes":0,"overflowPages":0,"unexpectedDetailMain":0,"missingDetailMain":0,"unclassified":0}`；
M0 轮只差 `"narrowNotes":48`。两轮的 6 个 `--compare` 键（`coveredDeals / cards /
firstScreenFull / pageHeight / externalRequests / jsErrors`）都照旧存在，新增键**不参与**
`--compare` 的既有判据（它只读那 6 个），所以回归比对不受影响。

---

## 6. 诚实的边界

- **`dist.synth-fixed` 是脚手架，不是产品读数**：真正的权威读数是 T3 在真实 `dist/` 上复跑
  同一条命令。若真实产物与合成产物有差异，以真实产物为准。
- **`mutations.json` 反映最近一次运行**：`--dir=dist.baseline` 那轮的读数在 `M0-baseline.json`
  的 `metrics.layoutMutationCodes` 里；绿轮会覆盖同名文件（这是刻意的：交付物就是绿轮的咬合证据）。
- **`data-region-missing` 在当前产物上没有实例**（每一页都有 `<main>`，命不中声明选择器时按契约
  回落 `<main>`）。它是结构性兜底（页面连 `<main>` 都没有），由 §22c 的「违规码自检」用合成几何
  证明**可达**：8 个码全部由 `wideProblems()` 一处产出、不多不少。
- **`--url=` 模式如实跳过本节**：路由清单从产物目录现算，线上没有产物目录 —— 不硬凑一份假清单，
  也不伪造几何读数。
- **`_scratch/` 是定判据之前的探针与复核脚本**（非交付物）：`sweep-synth.cjs` 把 186 页的候选几何一次
  量完（§3 里「分母取 min」「锚取或」这两条就是它的读数决定的）、`sweep-samples.cjs` 量样本集在
  760/360 档的表现、`sweep-mutations.cjs` 先验了 M1–M4/M6/M6c/M7 会不会咬、`probe-dom.cjs` 与
  `probe-styles.cjs` 是改动前产物的静态/DOM 结构探针、`hash-tree.cjs` 给产物树哈希（幂等性证据）、
  `check-reports.cjs` 汇总复核两份 `--json=` 报告（含「失败项里非 §22c 的有几个」）。
  它们只读产物，不写任何 `dist*`。
