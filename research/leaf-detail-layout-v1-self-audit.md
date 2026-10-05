# leaf-detail-layout-v1 · 独立复查与 Self-Audit（T4，audit-repro）

**最终结论：pass。P0 = 0 · P1 = 0 · REPAIR_NOW = 0。**

复查对象：T1（`index.html` + `scripts/tools/build-local.js`）与 T3（`scripts/tools/verify-site.js` §22b）落到 `.worktrees/leaf-detail-layout-v1/dist` 的产物。
复查方式：**不复用 verify-site.js 的判据实现，也不复述它的日志**——用 T3 阶段自写的 `research/_raw/leaf-detail-layout-v1/audit/leaf-probe.cjs`（自写静态服务 + playwright-core/Edge，连续 3 次几何指纹一致才认定稳定）在改动前快照与改动后 dist 上跑**同一把尺子**，再自算判据。

---

## 1. 方法：同一把尺子的可证明性

| 证据 | 结论 |
| --- | --- |
| `before.json`（T3 交付物，sha256 `3226ecd24dbd82a8…`）与 `before-recheck.json`（本次用**当前**探针文件重跑，sha256 `58481f334bfffd6d…`）逐值比较 | **348 个数值，差异 0 个** ⇒ 前后两次测量口径完全一致 |
| 探针依赖 | 只 `require` Node 内建（fs/os/path/http/crypto）+ `playwright-core`；**不 require verify-site.js，不 require 仓库任何 lib**（`grep require(` 全部命中见证据清单） |
| 前/后输入 | 改动前 = Captain 快照 `baseline/baseline-dist`（三路由 sha256 与 `sha256-manifest.txt` 逐条一致）；改动后 = `dist`（本页表格里的 sha256 由探针现算） |
| 浏览器 | Edge（`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`），headless |

---

## 2. 改动前 / 改动后（同一把尺子，同一路由）

`w`=offsetWidth(px)；`Δ`=centerΔ（列左右留白差，0 = 居中）；`wb`=computed word-break；`mw`=computed max-width。

| 路由 | 视口 | main | .dpane (w\|Δ) | .dpane-src (w\|wb\|mw) | documentElement.scrollWidth |
| --- | --- | --- | --- | --- | --- |
| `/deal/2eae0e246de2/` | 1600 | 1380 → **1120** | 820\|560 → **1120\|0** | 820\|break-all\|820px → **1120\|normal\|none** | 1600 → 1600 |
| `/deal/2eae0e246de2/` | 1440 | 1380 → **1120** | 820\|560 → **1120\|0** | 同上 → **1120\|normal\|none** | 1440 → 1440 |
| `/deal/2eae0e246de2/` | 1280 | 1240 → **1120** | 820\|420 → **1120\|0** | 同上 → **1120\|normal\|none** | 1280 → 1280 |
| `/deal/2eae0e246de2/` | 390 | 358 → 358 | 358\|0 → 358\|0 | 358\|break-all\|820px → 358\|normal\|none | 390 → 390 |
| `/models/claude-opus-5.5/` | 1600/1440/1280 | 1380/1380/1240 → **1120/1120/1120** | 页面上没有 `.dpane`（改动前也不存在） | 同左 | 无溢出（= 视口） |
| `/`（首页，**必须不被波及**） | 1600/1440/1280/390 | 1380/1380/1240/358 → **1380/1380/1240/358** | — | — | 无溢出 |

外壳（@1440，前 → 后）：`.wrap` 1420 → 1420 · `.topin` 1420 → 1420 · `footer` 1380 → 1380（三个路由一致）。

契约点名的那两条取样路由（自算，非抄）：

| 路由 | provenance sha256 | 列 @1600/1440/1280 | centerΔ |
| --- | --- | --- | --- |
| `/deal/8e7b0fd03e73/`（deals.json 里 url 最长：129 字符） | `1ad7d3f5767d579c…` | 240..1360 / 160..1280 / 80..1200，W=1120 | 0 / 0 / 0 |
| `/models/360zhinao-pro/`（models.json[0].slug） | `562f37bfcebd1fa9…` | 240..1360 / 160..1280 / 80..1200，W=1120 | 0 / 0 / 0 |

---

## 3. 八条验收逐条

**① diff 基线 → HEAD 只含布局改动。**
`git rev-parse master HEAD` 两侧都是 `d09a1c5b13e0fb64be8b5c8fe294f19d76e769fd`，本轮工作**尚未提交**，所以 `git diff --stat master..HEAD` 天然为空——这条判据此刻量不到东西（见 §5 残余风险 R2）。等价且有效的证据是 `git diff`（工作区 vs HEAD）：

```
index.html                   |  8 +-        （只改 .detail-main 新增 / .dpane / .dpane-more / .dpane-src 三处规则）
scripts/tools/build-local.js | 10 +-        （deal 详情 <main> 加 class；renderModelsShell 增 mainClass 选项，缺省 ''）
scripts/tools/verify-site.js | 583 ++++++++ （纯新增 §22b，0 删除）
```

数据文件零 diff：`git diff --name-only -- deals.json plans.json api-plans.json models.json model-registry-links.json scripts/data` **输出为空**。
逐字复核 `index.html` 补丁：新增 `.detail-main { width: min(1120px, 100%); margin-inline: auto; }`；`.dpane` 由 `max-width: 820px` 改 `width: 100%; max-width: none`；`.dpane-src` 由 `max-width: 820px; word-break: break-all` 改 `width: 100%; max-width: none; word-break: normal; overflow-wrap: anywhere`；`.topin` / `.wrap` / `footer` 规则**一个字符都没动**（diff 里除了一行注释外无命中）。`build-local.js` 的 `mainClass` 只在模型详情调用点传 `'detail-main'`，索引页/档案页/数据文档页走缺省 `''`。

**② 无重复 CSS。**
`t4-static-checks.json`（186 个 `dist/**/index.html` 全量扫描）：每页恰好 **1** 条 `.detail-main` 规则、**1** 条 `.dpane` 规则、**1** 条 `.dpane-src` 规则，**0** 条 `max-width: 820px`；源码 `index.html` 同样是 1/1/1、0 残留。仓库里没有新建 `detail*.css`，`dist` 内只有 `dist/logos.css`（改动前就有）。全站仅存的 1 处 `word-break: break-all` 属于既有 `.cmpshare`（首页对比分享条），与详情列无关——按 impl-layout 的提醒，我的检查**限定在 `.dpane-src` 元素的计算样式**上，不做全文件级搜索。

**③ deal 与 model 真正统一（同一规则、同一宽度）。**
同一把 `.detail-main` 规则（源码里只有这一处定义），改动后 1600/1440/1280 三档：deal 列左 240/160/80、W=1120；model 列左 240/160/80、W=1120 ⇒ **同左同宽**（`leaf-pair-same-column` 3/3 ✓）。@768 两页都铺满可用宽 728/728；@390 两页都是 358/358 且无横向溢出。
改动前两侧并不统一：model 叶子页**根本没有** `.dpane/.dpane-more/.dpane-src` 元素（count=0），deal 叶子页被 820px 卡住 —— 这次改动是 deal「放宽」+ model「收窄」到同一条列上，不是把两边都改窄。

**④ 桌面 bounding box（独立复测）。**
deal `8e7b0fd03e73` 与 model `360zhinao-pro` 在 1600/1440/1280 三档：main 宽度全部 = **1120**（∈[1080,1120] ✓）、`|left-(vw-right)|` 全部 = **0**（≤8 ✓）、rect 分别是 240..1360 / 160..1280 / 80..1200。
同轴块左右极差（≤1px ✓，实测 0px）：deal `crumb / .dpane / .dpane-more / .dpane-src` = 240,240,240,240（@1600）；model `crumb / .stop / .minfo / .ptable-wrap` = 240,240,240,240（@1600）；1440 皆 160、1280 皆 80。
来源块宽 == 列宽：`.dpane-src` 1120 vs 列 1120（差 0px，三档一致）。

**⑤ mobile / 窄屏溢出（独立复测）。**
@390：deal 与 model 的 `documentElement.scrollWidth` 都是 **390**（≤391 ✓），溢出 0px；`.dpane`/`.dpane-src` 宽 = `.wrap` 可用宽 358。
@768：两个叶子页 `scrollWidth` = **768**（无横向溢出），列宽 = 可用宽 728（铺满、不另立断点）。
长 URL 页：`/deal/8e7b0fd03e73/`（官方页 URL 129 字符）@390 `scrollWidth` 390、@1440 `scrollWidth` 1440，自身与页面级都不溢出。

**⑥ Mutation 独立复算（M1–M5）。**
用自己的探针在**真实 dist 的临时副本**上跑自有锚点的五颗牙（`--mutate=M1..M5`，锚点必须恰好命中 1 次，否则退出码 2 报红；被测 dist 只读）：

| 牙 | 改什么 | 基准 → 变异（我实测） | 期望违规码 |
| --- | --- | --- | --- |
| M1 | `.detail-main` 的 `margin-inline:auto → 0` | 列 centerΔ 0 → **260**（@1440）/ 0 → **120**（@1280），deal 与 model 同时 | center |
| M2 | `min(1120px,100%) → 820px` | 列宽 1120 → **820**（<1080） | width |
| M3 | `.dpane-src` 的 `max-width:none → 820px` | 来源块 1120 → **820**，与列宽差 300px | src-width（+axis） |
| M4 | `min(1120px,100%) → 1120px`（固定宽） | @390 `scrollWidth` 390 → **1136** | page-overflow@390 |
| M5 | 只让 model 叶子丢 `class="detail-main"` | model 列 1120 → **1380**，deal 仍 1120，两页差 **260** | leaf-consistency |

五颗牙的锚点命中次数逐条记录在 `mutations-real/M*.json` 的 `mutations[].pages[].steps`（全部 = 1），并被 `t4-analyze.cjs` 折算成 `mutations-bite` 判据（✓）。

**守卫负例（T4 要求的那一条）**：我**自己构造**了一次锚点缺失——把 `dist` 整份拷贝到 `audit/.tmp/dist-anchor-missing`，只在 `deal/8e7b0fd03e73/index.html` 内联样式里把 M4 的锚点 `word-break: normal; overflow-wrap: anywhere;` 改写成 `word-break: normal;`（该文件锚点出现次数 1 → **0**，其余锚点仍在），然后跑 `node scripts/tools/verify-site.js --dir=research/_raw/leaf-detail-layout-v1/audit/.tmp/dist-anchor-missing`：

```
✗ §22b M4 变异锚点唯一（逐字替换前必须恰好出现 1 次） — 锚点「word-break: normal; overflow-wrap: anywhere;」
  锚点在内联样式里出现 0 次（必须恰好 1 次） ⇒ 变异未生效，判红（不允许「变异不生效却算通过」）
✗ §22b M4 变异后复测必须出现「page-overflow@390」违规码 — 锚点不唯一/不存在 ⇒ 变异没落地，按红处理
✓ §22b 反空洞守卫自检：锚点不存在（0 次）与锚点非唯一（>1 次）都必须 ok:false 并给出原因
❌ 验收 776 项，失败 4 项        ← 进程退出码 1
```

⇒ verify-site.js §22b 的反空洞守卫**真的会判红**，且拒绝在「变异没落地」时给出绿色结论。同一份日志里另外 3 条红是这次人为削弱的直接后果（`@390 .dpane-src` 计算样式变回 `overflow-wrap: normal`、M4 正对照真的溢出 1213px），因果正确，不是误报。原始日志：`audit/anchor-missing-guard.log`（122 KB）。

**⑦ 与实现者/验证者的数字对账。**

| 对方结论 | 我的独立读数 | 一致 |
| --- | --- | --- |
| T1：deal/model 详情 @1440 列 1120 居中（160..1280） | 列 1120，列左 160，centerΔ 0 | ✓ |
| T1：`.topin` 1420、footer 1380；80 deal + 51 model | `.topin` 1420 / footer 1380；`dist` 下 deal 目录 80、models 目录 51，带 class 的叶子页 131 | ✓ |
| T1：全站 186 页各 1 条 `.dpane` 规则、0 条 `max-width:820px`、无新增 CSS 文件 | 186 页全量扫描同值 | ✓ |
| T1：非叶子页 0 个带 `detail-main` | 186 页扫描：非叶子合计 0（首页/`/models/`/`/archive/`/`/category/**`/`/vendor/**` 逐页列举见 `t4-static-checks.json`） | ✓ |
| T3：取样 deal `8e7b0fd03e73`（129 字符）、model `360zhinao-pro` | 我自己从 `dist/deals.json`（135 条）与 `dist/models.json`（51 个）算出同一对 | ✓ |
| T3：M1–M5 的违规码分别是 center / width / src-width / page-overflow@390 / leaf-consistency | 我的自有变异牙得到同一组违规码语义 | ✓ |
| T3：零磁盘污染，两个产物 sha256 前后相等（`1ad7d3f5767d…` / `562f37bfcebd…`） | 我现算 `dist/deal/8e7b0fd03e73/index.html` = `1ad7d3f5767d…`、`dist/models/360zhinao-pro/index.html` = `562f37bfcebd…`，与对方一致；我的变异只写临时副本 | ✓ |
| T1 提醒：baseline 快照是**旧构建** | 复核属实（`before.json` 里 model 页元素构成与 HEAD 构建不同）；因此本页所有 before/after 对比都只落在**布局量**与**同一 deal id** 上 | ✓ |
| T1 提醒：全站仍有一处 `break-all` 属既有 `.cmpshare` | 复核属实（每页 1 处，位于 `.cmpshare` 规则；`.dpane-src` 的计算样式已是 `normal`） | ✓ |

**没有发现任何对不上的数字。**

**⑧ 结论**：见标题与 §6。

---

## 4. 覆盖面与"没被波及"的逐页证据

- 叶子页（应带列）：`dist/deal/*` 80 页 + `dist/models/*` 51 页 = **131 页全部** `<main id="main" class="detail-main">`。
- 非叶子页（不得带列）：首页 `/`、`/models/`、`/archive/`、`/docs/data/`、`/plans/`、`/plans/coding/`、`/plans/api/`、`/category/**`(13)、`/vendor/**`(25)、`/need/**`(10)、`/student/`、`/developer/`、`/free-api/`、`/status/`、`/changes/`、`/feeds/` —— 全量 186 页扫描里带该 class 的 **0 页**。
- 抽查 5 个非叶子页的真浏览器读数（`after-compare.json`）：`/`、`/models/`、`/archive/`、`/category/api/`、`/vendor/anthropic/` 的 main 在 1600/1440/1280/768 都是 **1380/1380/1240/728**，`class=""`，与改动前首页读数一致（`home main @1440：1380 → 1380`）。
- 外壳未缩窄：三个抽查路由 @1440 的 `.wrap`/`.topin`/`footer` = 1420/1420/1380，前后一致。

---

## 5. 残余风险与口径说明（均为低危，不构成 needs_revision）

- **R1（低）**：改动前基线用的是 Captain 的**旧构建**快照。布局量（820px / break-all / 无统一列）有效，但它不代表 d09a1c5 的忠实产物；因此本页**没有**用它做"结构/内容未变"的任何断言。
- **R2（低，流程）**：本轮改动仍在工作区、未提交（`master == HEAD == d09a1c5`）。所以 `git diff master..HEAD` 现在为空；若 PR 前不提交，这条判据与 CI 的同类检查都会"量了个寂寞"。修法：提交到 `leaf-detail-layout-v1` 分支后重跑 `git diff --stat master..HEAD`，预期恰好 3 个文件（`index.html` / `scripts/tools/build-local.js` / `scripts/tools/verify-site.js`）+ 文档。
- **R3（口径）**：headless Edge 在本机用 overlay 滚动条（`innerWidth == clientWidth`，scrollbarWidth=0）。若换成经典 15px 滚动条，1440 下可用宽 1425 仍 > `.wrap` 上限 1420，`.topin`/`.wrap`/列宽的数字不变；此说明仅用于解释 1420 的来源。
- **R4（口径）**：干净 `dist` 上 §22b 的 41 条绿**不是我的证据**（那是 T2/队长 Full Gate 的日志）。我在同一批属性上用自有探针独立复测（§3 的 ④⑤⑥），并额外做了守卫负例；两者结论一致。

---

## 6. 计数与结论

| 项 | 数量 |
| --- | --- |
| P0（阻断发布） | **0** |
| P1（应当修但不阻断） | **0** |
| REPAIR_NOW | **0** |
| 我的自算判据 | **32/32 通过**（`audit/t4-analysis.json`：`summary.passed=32, failed=0`） |
| 守卫负例 | 构造的锚点缺失 **被判红**（退出码 1，776 项里失败 4 项，原因逐条打印） |

**最终结论：pass。** deal 与 model 叶子详情页现在落在同一条 1120px 居中内容列上，Header/Footer 与集合页/索引页/档案页/首页均未被波及，窄屏无横向溢出，M1–M5 变异牙在真实产物上都能咬到，verify-site.js §22b 的反空洞守卫经独立负例验证会真的判红。

---

## 7. 证据清单（全部在 `research/_raw/leaf-detail-layout-v1/audit/`）

| 文件 | 大小 | sha256(前 16) | 说明 |
| --- | --- | --- | --- |
| `leaf-probe.cjs` | 38243 | `b09258a2a970062f` | 独立尺子（本页所有浏览器读数由它产出） |
| `before.json` | 83372 | `3226ecd24dbd82a8` | T3 改动前基线（未改动，hash 与 T3 交付时一致） |
| `before-recheck.json` | 83380 | `58481f334bfffd6d` | 当前探针重跑 → 348 个数值 0 差异 |
| `after-deal.json` | 33598 | `30f4ab3c87a6593e` | 契约命令① `/deal/8e7b0fd03e73/` |
| `after-models.json` | 22165 | `1673ab5bce4712f5` | 契约命令② `/models/360zhinao-pro/` |
| `after-axis.json` | 77784 | `d84a39cd3e4bb6d1` | 同轴块（`--extra-selectors=`）+ 变异基准 |
| `after-compare.json` | 198008 | `707df245a7c8719a` | 与 before 同路由 + 768 + 5 个非叶子页 |
| `mutations-real/M1..M5.json` | 55–56 KB ×5 | `b588cd09…` `2dbb705b…` `e3016e9b…` `a0ac5a12…` `2bc7d400…` | 真实 dist 上的变异牙（含锚点命中次数） |
| `t4-static-checks.json` | 61317 | `4f1399855f54466a` | 186 页规则唯一性 / 波及面 |
| `t4-analysis.json` | 27045 | `7b30ae5f6bae709e` | 32 条自算判据 + before/after 全量对账 |
| `anchor-missing-guard.log` | 122230 | `322da3e88b0c8482` | 守卫负例原始日志（退出码 1） |

复现命令（工作目录 = `.worktrees/leaf-detail-layout-v1`）：

```bash
node research/_raw/leaf-detail-layout-v1/audit/leaf-probe.cjs --dir=dist --route=deal/8e7b0fd03e73/ --expect=none --out=research/_raw/leaf-detail-layout-v1/audit/after-deal.json
node research/_raw/leaf-detail-layout-v1/audit/leaf-probe.cjs --dir=dist --route=models/360zhinao-pro/ --expect=none --out=research/_raw/leaf-detail-layout-v1/audit/after-models.json
node research/_raw/leaf-detail-layout-v1/audit/t4-static-checks.cjs
node research/_raw/leaf-detail-layout-v1/audit/t4-analyze.cjs     # 32/32
git diff --stat master..HEAD ; git diff --name-only -- deals.json plans.json api-plans.json models.json model-registry-links.json scripts/data
```

> 说明：`mutations-real/`、`.tmp/dist-anchor-missing/` 与临时副本只落在 `research/_raw/` 下；审计方对 `index.html`、`scripts/**`、`dist/**`、任何数据文件**零改动**（`git status --porcelain` 只有实现者的 3 个文件与 `?? research/_raw/leaf-detail-layout-v1/`）。
