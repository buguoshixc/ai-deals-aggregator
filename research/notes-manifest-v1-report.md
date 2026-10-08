# notes-manifest-v1：构建期「每页说明条数」清单 + 跨源对账

- 分支：`notes-manifest-v1`（`git worktree add .worktrees/notes-manifest-v1`，rebase 到 `origin/master` = `4b366d2`）
- 闭合对象：`NEXT-STEPS.md` §0 剩余事项 4 里那条 P1 逐字 —— 「判据只认 `.snote` 这个类名（换名 / 换容器即隐形）」
- 判据落点：`scripts/tools/build-local.js`（意图侧 + 构建期自检）、`scripts/tools/verify-site.js` §22c ⑨（真浏览器 DOM 侧）
- 产物：新增 `dist/_notes.ndjson`（**唯一**产物变化；其余 303 个文件逐字节不变）
- 机读证据：`research/_raw/notes-manifest-v1/`　·　一次性/大件探针：`.arch-v1/`（Tier-3，未进仓库）

---

## 1. 结论

「页面级说明有几条」这件事现在有**两个互相独立的来源**，并且逐页对账：

| 来源 | 在哪 | 它知道什么 | 它**不**知道什么 |
| --- | --- | --- | --- |
| **意图侧** | 内容构造点（`noteDeclare()`，先登记、后输出） | 这一页打算输出几条说明、每条的槽位、**完整 class token 集合**、类型标签、哪一处构造分支产出的 | 产物里实际渲染成什么样 |
| **渲染侧** | 构建期回读刚生成的 HTML + `verify-site.js` §22c ⑨ 回读**真浏览器 DOM** | `<main>` 里实际有几条、class token 集合是什么 | 这一页本来**打算**输出几条 |

两侧按 `route × 槽位 × 签名` 逐条相等才放行；不等即红，消息点名 **`route#index`** 并**同时给出两侧读数**。

于是那条 P1 的三种坏法都变成会红的决定：

- **改名**（`.snote` → 别的）：意图侧仍声明 `snote …`，渲染侧 0 条 ⇒ 红（实测见 §6 牙 M1/M3）；
- **换容器**（`<p>` → `<div>`、或换成不含该 token 的 class）：同上，签名对不上 ⇒ 红；
- **漏渲染**：同上；**故意把「清单里的条数改错」**⇒ 另一侧读数不等 ⇒ 红（牙 M2）；
- **整族被删**（登记与模板一起消失，逐条对账两侧同时少）：由**页面族结构下限**与**台账下限**咬住（§3 判据 ③/④）；
- **新的隐形说明面**（新增带说明的页面族但没登记）：由**棘轮**咬住（判据 ⑤）。

---

## 2. 交付面（一次读数）

```
dist/_notes.ndjson   104,591 B   sha256 58a7373b502dbbde…   186 页 × 3 个槽位
```

| 槽位 | 清单声明 | 真浏览器 DOM（1440，186 页合计） |
| --- | ---: | ---: |
| `main-snote`（页面级说明，§22c 逐条几何判据的对象） | 14 | 271 |
| `main-pnote`（底部折叠说明 `<details class="page-notes">`） | 159 | 159 |
| `main-vsnote`（厂商资料页六节区段说明） | 150 | 150 |
| 合计 | **323** | **580** |

`.snote` 那一列的差额是**本轮如实声明的边界**，不是漏账：

```
271 = 13（构造点逐条登记：status 2 · feeds 8 · 3 条别名页各 1）
    +  1（组装点 pin：/plans/coding/ 的无 JS 提示）
    + 257（台账：构造点在本轮 in-scope 路径之外的 8 个页面族）
```

- **纳管页 128 页**（`complete: true`）：整页 `.snote` 总数**逐字相等**，且两侧签名集合**双向**相等
  （多出一条没登记的说明同样红）；
- **台账页 58 页 × 8 个页面族**：逐条对账只做单向（清单声明的必须渲染出来），另加 `minNotes` 下限；
- **组装点 pin 1 条**：`/plans/coding/` 的 `.snote.pnoscript`（构造点在范围之外，见 §5）。

每条说明都带**类型标签**（`kind`），清单里可逐条读：`alias-note` 3 · `status-reading-guide` /
`status-machine-readable` 各 1 · `noscript-hint` 1 · `feed-*` 8（订阅中心） · `scope-note` 25 ·
`vendor-material-note` 22 · `official-entry` / `api-counts` / `models-count` / `changes-lanes` 各 25 ·
`shared-overlap-note` / `shared-tristate-note` 各 40 · `hub-*-note` 各 2 · `page-note` 28 · …共 24 类。

清单长这样（节选：首行 header 的全部槽位定义太长，这里只留字段名；两页分别是「纳管页」与「台账页」原样）：

```jsonc
{"kind":"header","schemaVersion":1,"generator":"scripts/tools/build-local.js","slots":[…],"totals":{"pages":186,"declaredNotes":323,"declaredBySlot":{"main-snote":14,"main-pnote":159,"main-vsnote":150},"untrackedPages":58}}
{"kind":"page","route":"need/student-only/","pageKind":"alias","complete":true,"declared":{"main-snote":1,"main-pnote":1,"main-vsnote":0},"floors":{"main-snote":{"min":1},"main-pnote":{"min":0},"main-vsnote":{"min":0}},"untracked":null,"notes":[{"index":0,"kind":"page-note","slot":"main-pnote","signature":"pnote","declaredBy":"build-local.js:renderDirectoryPage(page-notes)","pinned":null,"pinnedReason":null},{"index":1,"kind":"alias-note","slot":"main-snote","signature":"aliasnote snote","declaredBy":"build-local.js:renderDirectoryPage(aliasnote)","pinned":null,"pinnedReason":null}]}
{"kind":"page","route":"models/","pageKind":"models-index","complete":false,"declared":{"main-snote":0,"main-pnote":0,"main-vsnote":0},"floors":{},"untracked":{"family":"models-index","owner":"lib/models-page.js","structural":"lib/models-page.js:845（MODELS_INDEX_DESCRIPTION 口径说明，无条件输出）","minNotes":1},"notes":[]}
```

---

## 3. 设计

### 3.1 意图侧：先登记、后输出

`build-local.js` 新增一节「页面级说明的**构建期意图清单**」（文件里带完整论证的注释）：

- `noteDeclare(route, decl, html)` —— **登记一条并原样返回它的 HTML**。这是唯一入口：
  「登记不出来的说明也输出不出去」。`decl` 要说出槽位（`main-snote` / `main-pnote` / `main-vsnote`）、
  **完整** class token 串、类型标签、构造点位置（`文件:函数`）；声明与容器不符、空 HTML、缺构造点
  一律**硬失败**（不是静默跳过）。
- `notePinned(route, decl, {source, reason})` —— **组装点登记**：构造点在范围之外的模块里时，
  由组装点按容器签名把意图说出来（清单里带 `pinned: <file:line>`，是下一轮接管构造点时该删的标记）。
- `notePage(route, {kind, floors})` —— 页面族与**结构下限**（与「具体哪几条」无关的不变式）。
- `noteUntracked(route, {family, owner, structural, minNotes})` —— **台账**：这一页的说明由范围之外的
  模块构造；必须写明归属模块与那个模块里**无条件**产出的那一条在哪一行。
- `writeNotesManifest()` —— 把意图写成 `dist/_notes.ndjson`（首行 header，其余每行一页，**按 route 排序**、
  无时间戳 ⇒ 连续两次构建逐字节一致）。
- `noteManifestSelfCheck()` —— 构建期自检：回读**刚生成的 HTML**，逐页逐槽位对账。

登记点覆盖四类命名的构造分支，且都在它们各自的分支里：

| 分支 | 位置 | 说明 |
| --- | --- | --- |
| 别名页 `aliasnote` | `build-local.js:renderDirectoryPage` | `<p class="snote aliasnote">`，3 条别名页 |
| `userNotes` / `scopeNote`（底部折叠） | `renderDirectoryPage` + `lib/landing.js`（`noteRows` 带 `kind`） | `.pnote`，159 条（含 `scope-note` 25 / `vendor-material-note` 22） |
| `/status/` 两条页面级说明 | `renderStatusPage` | 判读口径 + 机器可读出口 |
| `/feeds/` 八条说明 | `renderFeedsPage`（每条在**它自己的分支里**登记：分组口径 / 未分组兜底 / 变化空态 / 套餐与 API 空态 / 厂商门槛 / 怎么订阅 / 两段「怎么读」） | 分支不触发就不登记，清单与渲染两侧同时少 ⇒ 不产生假警报 |
| 厂商页六节 `.vsnote` | `lib/vendor-page.js:renderVendorKnowledgeSections`（`vsnote()` 包装，`vnote` 缺数据形态是**另一个签名**） | 登记入口由 `build-local.js` 按 route 注入（`noteDeclarerFor`），25 页 × 6 条 |
| `/plans/coding/` 无 JS 提示 | `renderPlansPage` 的组装点 **pin** | `.snote.pnoscript`，见 §5 |

### 3.2 渲染侧：两处、同一把尺子

- 构建期：`noteSignaturesInMain(html)` —— 取 `<main>`、去注释 / `<script>` / `<style>`，
  按 `class` 属性**分词**、按**排序后的 token 集合**分组计数；
- 真浏览器：`verify-site.js` §22c 的 `wideMeasure()` 新增 `notesBySignature`，`main.querySelectorAll('[class]')`
  + `getAttribute('class')` 分词，**逐字同构**的同一把尺子；
- 说明：**检测**是 token 级（含槽位 token 即算这一类），**判定**是集合级（签名必须逐字相等）。
  前者决定「能不能看见」，后者才是判据 —— 改名只会让后者对不上。

### 3.3 五条判据（构建期自检与 §22c ⑨ 同一套口径）

| # | 判据 | 咬住的坏法 |
| --- | --- | --- |
| ① | 逐页逐槽位：清单声明的「签名 × 条数」== 渲染侧数出来的（双向；台账页单向） | 改名 / 换容器 / 漏渲染 / 绕过登记直接写页面 |
| ② | `complete` 页面：整页 `.snote` 总数**逐字相等**（两侧读数都进报告） | 上面任一种，且在整页层面留下差额 |
| ③ | 页面族**结构下限**（别名页恰好 1 条、非别名目录页 0 条、状态页 2 条、订阅中心 4 条、厂商页六节） | 「登记与模板一起被删」——逐条对账两侧同时少 |
| ④ | 台账下限：台账页面仍必须有 `minNotes` 条 `.snote` | 范围之外的那一族被整族改名 / 整族删除 |
| ⑤ | 棘轮：DOM 里有 `.snote` 的页面必须全部登记过（清单页 ↔ 产物页双向相等；新增页面族必须显式登记） | 新的隐形说明面悄悄出现 |

`verify-site.js` §22c 新增 6 条检查（`⑨`），失败信息统一是 `route#index + 两侧读数`。

### 3.4 为什么清单是 `_notes.ndjson` 而不是 `_notes.json`

产物里**每一个 `*.json` 都必须被某个注册表认领**（`lib/data-docs.js` §10.7 方向 2 的 fail-closed 判据：
Manifest 自身 / Feed 家族 / `INTERNAL_ARTIFACTS` / 已登记的公开数据集）。本轮 in-scope 路径**不含**
`lib/data-docs.js`，而把它塞进 `PUBLIC_DATASETS` 会让 `dist/_notes.json` 变成一份**公开数据集**
（进 `/docs/data/` 的索引与 Dataset Manifest）—— 那是产品面变化，不只是多一个文件。
所以清单用 **NDJSON**（一行一个 JSON 对象：首行头部、其余每行一页）：机器可读、可 `grep`、
可逐字节重建，且不冒充公开数据集。若 captain 愿意在下一轮加一行注册表（`INTERNAL_ARTIFACTS`），
可以无痛改成 `_notes.json`（见 §7 的建议行）。

---

## 4. 逐字节可重建 + 产物变化面

| 读数 | 值 |
| --- | --- |
| 构建 #1 全树摘要 | `67d1d0bdcdffe29f1b2bd0185c35408da897d53d20e44c495fec385f7ec1337d`（304 文件 / 20,386,654 B） |
| 构建 #2 全树摘要 | 与 #1 **逐字节相同**（同上） |
| 基线 = `origin/master` `4b366d2` 干净检出（`.worktrees/nm-baseline`，`--out=dist.master`） | `75ecb983…`（303 文件 / 20,282,063 B） |
| 与基线的**逐文件** sha256 对账 | **新增 1 个**：`_notes.ndjson`　·　**改变 0 个**　·　**删除 0 个** |

即：**本轮产物变化面 = 清单文件本身**（104,591 B），其余页面/数据逐字节不变 —— 与「预期只多出清单文件本身」一致，
不存在需要逐条解释的例外。

---

## 5. 覆盖边界（**如实**，含下一轮的接管清单）

本轮 in-scope 路径是 `build-local.js` / `verify-site.js` / `lib/landing.js` / `lib/audience.js` /
`lib/vendor-page.js` / `scripts/data/` / `research/**`。**全站 `<main>` 里的 `.snote` 并不都长在这几个文件里**：

| 页面族 | 页数 | 构造点在哪（**本轮之外**） | 台账里那条**无条件**说明 |
| --- | ---: | --- | --- |
| `models-detail` | 51 | `lib/models-page.js` | `:1112` 与 `:1123` |
| `models-index` | 1 | `lib/models-page.js` | `:845` |
| `api-plans-index` | 1 | `lib/api-plans-page.js` | `:613` |
| `plans-hub` | 1 | `lib/plans-hub-page.js` | `:313` |
| `data-docs` | 1 | `lib/data-docs.js` | `:794` |
| `archive-index` | 1 | `lib/archive.js` | `:589` 与 `:601` |
| `changes` | 1 | `index.html` 的 RENDER-CORE（`changesPageHtml`）+ `lib/plans-page.js` + `lib/api-plans-page.js` | `index.html:3930` |
| `plans-coding` | 1 | `lib/plans-page.js` | `:1010` |

这 58 页 / 257 条 `.snote` 本轮**没有逐条纳管**，而是：① 台账写明「下一轮接管哪一处」；
② 要求这些页面仍必须有 `minNotes` 条 `.snote`（整族被改名 / 被删 ⇒ 红）；
③ 棘轮保证**不会**再出现没登记的说明面。**下一轮的机械改动**是：给这 7 处模块注入登记入口
（与 `lib/vendor-page.js` 的做法完全相同 —— `ctx.note` 由 `build-local.js` 按 route 注入），
把每处 `<p class="snote">` 换成 `ctx.note({kind, slot:'main-snote', classes:'snote', declaredBy:'…'}, html)`，
台账随之逐族删除；那时 `.snote` 槽位会从「13 + 1 + 257」变成「271 全部逐条对账」。
**残余风险因此是明确的、可量化的**：`/models/*`、`/plans/*`、`/docs/data/`、`/archive/`、`/changes/`
这五个族里「改一条说明的类名」目前仍不会被逐条对账咬住（只会被整族下限与棘轮咬住）。

另外两处**有意的**设计选择：

1. **`/plans/coding/` 的无 JS 提示是「组装点 pin」而不是构造点登记**：它的构造点在
   `lib/plans-page.js:1013`（本轮之外）。pin 不是豁免 —— 它声明「这一页应当恰好有 1 条
   `snote pnoscript`」，改名 / 换容器 / 不再输出都会让渲染侧与它差一条（并已有牙 M3 同形验证）。
   清单里它带 `pinned` / `pinnedReason` 字段，下一轮接管构造点时删掉这两个字段即可。
2. **`scripts/lib/audience.js` 本轮没有改动**：目录页的自有说明（`userNotes`）登记在
   `renderDirectoryPage`（真正的构造点是那一行 HTML 模板），文案来自 `audience.js` 的页面拷贝注册表；
   给它加一层间接登记只会把「构造点」移走，不会增加判据强度。

---

## 6. 牙（三颗，全部实跑变红、随后逐字节还原）

牙具：`.arch-v1/nm-mutations.cjs`（Tier-3；`restore` 用 `git checkout --`）。

| # | 变异 | 期望 | 实测（读数） |
| --- | --- | --- | --- |
| **M1** | **只改模板里的类名**：别名页 `<p class="snote aliasnote">` → `<p class="xnote aliasnote">`，登记那句一字不动 | 构建期红 + 点名 route | ✅ 构建 **exit 1**，逐页点名：`need/dev-credits/#2 槽位 main-snote 签名 <aliasnote snote>：清单声明 1 条、产物里数出 0 条 —— 说明没有按登记的容器渲染（换名 / 换容器 / 漏渲染）`；同页还有结构下限与整页差额两条（`need/free-api/`、`need/student-only/` 同理） |
| **M2** | **把清单里的条数改错**：给 `/status/` 多登记一条同签名说明（清单 3 / 页面 2） | 构建期红 + 两侧读数 | ✅ 构建 **exit 1**：`status/#0 槽位 main-snote 签名 <snote>：清单声明 3 条、产物里数出 2 条` + `status/ 整页 .snote：清单声明 3 条、产物里数出 2 条` |
| **M3** | **只改产物**：复制 dist 到 `.arch-v1/dist-tampered`，把 `status/index.html` 第一条说明的 `class="snote"` 改成 `xnote`，源码与清单一字未动，跑 `verify-site.js --dir=.arch-v1/dist-tampered` | §22c ⑨ 红 + 点名 route#index | ✅ verify **exit 1**，⑥ 条 ⑨ 检查里 3 条红：`status/#0 槽位 main-snote 签名 <snote>：清单声明 2 条 / DOM 实测 1 条`；`status/ 槽位 main-snote：结构下限 2 条 / DOM 实测 1 条`；`status/ 整页 .snote：清单声明 2 条 / DOM 实测 1 条` |
| **还原** | 三份源码 `git checkout --` | 逐字节还原并重新全绿 | ✅ `git status` 干净、`git diff` 为空；重建后全树摘要回到 `67d1d0bd…`（与变异前**同一串**）；干净 dist 的 verify 回到 **880 项 / 0 失败** |

---

## 7. 门禁读数

| 命令 | 读数 |
| --- | --- |
| `node scripts/tools/build-local.js`（两次） | ✅ 自检全过；两次全树摘要相同；清单 186 页 / 声明 323 条 / 台账 58 页 / pin 1 条 |
| `node scripts/tools/verify-site.js --dir=dist --json=.arch-v1/nm-after.json` | ✅ **880 项 / 失败 0**（独立复核：拿 **master 自己的** `verify-site.js`（`4b366d2`）对**同一份 dist** 复跑 = **874 项 / 0 失败** ⇒ 本轮 **+6**，只增不减；见 `research/_raw/notes-manifest-v1/verify-note-checks.json` 的 `masterBaseline`） |
| `node scripts/tools/verify-site.js --dir=.arch-v1/dist-tampered`（M3 变异） | ❌ **红**（3 条 ⑨，点名 `status/#0`）——见 §6 |
| `npm run check:ci` | ✅ 39 项 / 0 失败（断言名单与冻结清单等值） |
| `npm run check:evidence` | ✅ 见下一行的小 JSON 名单；`.arch-v1/` 未进仓库 |
| `npm run verify:seo` | ✅ 11 项 / 0 失败 |
| `npm run selftest:zh` / `selftest:analytics` | ✅ 15 项 / 0 失败 · 页面覆盖 186 个 HTML（bootstrap 186） |
| `npm run check:feeds:reproducible` | ✅ 2 次构建逐字节一致 |
| `selftest:audience` / `vendor` / `planshub` / `models` / `archive` / `data-docs` / `feeds` / `changes` | ✅ 205 / 57 / 32 / 148 / 76 / 58 / 145 / 119 项，全部 0 失败 |

### 建议插进 `docs/DESIGN-RULES.md` 的行（原文，供 captain 直接用）

主表新增一行（沿用现有列：规则 / 状态 / 依据 / 断言）：

```
| **S5** | **页面级说明的条数是「两个来源对账」的事，不是「一个类名」的事**：凡是往页面里放页面级说明的地方，必须在**内容构造点**登记（`build-local.js` 的 `noteDeclare()`：槽位 + 完整 class token 集合 + 类型标签 + 构造点），由构建期把它落成 `dist/_notes.ndjson`；构建期自检与 `verify-site.js` §22c ⑨ 各自回读**产物 / 真浏览器 DOM** 与它逐页逐槽位对账（`route#index` 可定位，两侧读数都给）。**登记与输出是同一次调用**（`noteDeclare()` 返回它收到的 HTML）—— 登记不出来的说明也输出不出去；构造点暂时在范围之外的模块，按容器签名做**组装点 pin** 或写进**台账**（写明归属模块与那条无条件说明的位置），台账不是豁免：仍要有下限、且不许出现没登记的说明面 | ✅ 新增（`notes-manifest-v1`） | 长期挂在 §0 的那条 P1：「判据只认 `.snote` 这个类名（换名 / 换容器即隐形）」。此前所有与说明有关的断言都只看渲染结果（§22c 逐条几何、Markdown 记号扫描、冻结串计次），一次故意改名是**静默失效**而非会红的决定。实测：只改模板类名（登记不动）⇒ 构建 exit 1 并点名 `need/dev-credits/#2`；只改产物类名 ⇒ §22c ⑨ exit 1 并点名 `status/#0` | 断言：构建期 `noteManifestSelfCheck()`（逐页逐槽位 + 结构下限 + 台账下限 + 棘轮）+ `verify-site.js` §22c ⑨ 6 条（真浏览器 DOM）；读数 = **880 项 / 0 失败**（master `4b366d2` 为 874 ⇒ +6），产物变化面只多出 `dist/_notes.ndjson`（其余 303 文件逐文件 sha256 不变；清单 186 页 × 3 槽位：声明 323 条 / DOM 580 条，58 页 8 族在台账里、1 条组装点 pin） |
```

若采纳「把清单改成 `_notes.json`」的后续动作，另需在 `lib/data-docs.js` 的 `INTERNAL_ARTIFACTS` 加一条（本轮 in-scope 不含该文件，故未做）：

```
  {
    path: '_notes.json',
    reason: '构建期「页面级说明意图清单」：每页打算输出几条说明、每条在哪个槽位与容器里'
      + '（`notes-manifest-v1`）。它是**构建期判据的意图侧**，不是可供引用的公开数据集；'
      + '构建期自检与 verify-site §22c ⑨ 各自回读产物/DOM 与它逐页对账。',
    owner: 'scripts/tools/build-local.js（writeNotesManifest()）',
    documentedAt: 'docs/DESIGN-RULES.md 的 S5 一行 · research/notes-manifest-v1-report.md'
  }
```

### 建议加进 `NEXT-STEPS.md` §0 的记录行（原文）

```
4. ~~判据只认 .snote 这个类名（换名 / 换容器即隐形）~~ → **notes-manifest-v1 已闭合「这一半」**：
   构建期意图清单（`dist/_notes.ndjson`，323 条登记说明 × 3 槽位）+ 构建期自检 + §22c ⑨ 真浏览器
   逐页对账（880 项 / 0 失败，master 874 ⇒ +6）。**残余**：`/models/*`（52 页）· `/plans/*`（3 页）·
   `/docs/data/` · `/archive/` · `/changes/` 这 58 页的 257 条 `.snote` 构造点仍在
   `lib/models-page.js` / `lib/plans-page.js` / `lib/api-plans-page.js` / `lib/plans-hub-page.js` /
   `lib/data-docs.js` / `lib/archive.js` / `index.html` 的 RENDER-CORE 区块里，本轮以**台账 + 下限 +
   棘轮**守（整族被删/改名⇒红；新说明面⇒红），但**单条改名**还咬不住。下一轮的机械改动：
   给这些模块注入 `ctx.note`（与 `lib/vendor-page.js` 同形），逐条登记后删掉台账。
```

---

## 8. 复现命令

```powershell
# 1) 意图清单 + 构建期自检（两次，逐字节一致）
node scripts/tools/build-local.js
node .arch-v1/tree-digest.cjs dist --out=.arch-v1/nm-build-1.json
node scripts/tools/build-local.js
node .arch-v1/tree-digest.cjs dist --out=.arch-v1/nm-build-2.json

# 2) §22c（真浏览器）—— 干净 dist 期望 880 / 0
node scripts/tools/verify-site.js --dir=dist --json=.arch-v1/nm-after.json

# 3) 三颗牙（M1/M2 构建期红；M3 在产物副本上跑 §22c 红）+ 还原
node .arch-v1/nm-mutations.cjs m1-class-rename ; node scripts/tools/build-local.js   # 期望 exit 1
node .arch-v1/nm-mutations.cjs restore
node .arch-v1/nm-mutations.cjs m2-count-wrong  ; node scripts/tools/build-local.js   # 期望 exit 1
node .arch-v1/nm-mutations.cjs restore
node .arch-v1/nm-mutations.cjs m3-dist-tamper
node scripts/tools/verify-site.js --dir=.arch-v1/dist-tampered --json=.arch-v1/nm-tampered.json   # 期望 exit 1
git status --short                                                                   # 期望空

# 4) 产物变化面（与 master 干净检出的构建逐文件对账）
#    .worktrees/nm-baseline 是 origin/master 4b366d2 的干净检出：node scripts/tools/build-local.js --out=dist.master
node .arch-v1/tree-digest.cjs ../nm-baseline/dist.master --out=.arch-v1/nm-master.json
node .arch-v1/nm-evidence.cjs     # 生成 research/_raw/notes-manifest-v1/ 的四份小 JSON

# 5) 门禁
npm run check:ci ; npm run check:evidence ; npm run verify:seo
```
