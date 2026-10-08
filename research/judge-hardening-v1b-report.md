# judge-hardening-v1b：seo 侧的注释伪造面（sitemap XML / canonical HTML / A1 逐处清单）

> 任务：t10 · 分支 `judge-hardening-v1b`（基于 `origin/master` = `e1caef9`，rebase 干净、无冲突）
> 修复对象：`scripts/lib/seo.js`、`scripts/tools/seo-verify.js`（`seo-selftest.js` 只加断言）
> 来源：`research/criteria-adversary-v1-report.md` §6/§7 与 `research/_raw/registry-adversary-v1/findings.json` 的 F2 / F3 / A1
> `verify-site.js` 的那一半**不在本任务声明面**（归 t9），本文只记「seo 侧判据自己判红」。

## 0. 一句话结论

t5 的三条破防（F2 sitemap `<url>` 块被 XML 注释包住、F3 canonical 被 HTML 注释包住、A1「读原始文本」的 7 个读点）
**全部改成「先剥注释」**：唯一实现 `lib/seo.js` 的 `stripComments()`；`seo-verify.js` 的 `strip()` / `itemListOf()` /
sitemap `<loc>` 扫描三处都从它取词。**伪造副本现在与真删副本逐条同解**（同一批失败项、同一 exit），原样仍全绿。
顺带收口 t13/t24 的观察 2：登记表与转写**一起裁**时不再两门禁都绿 —— 独立门禁新增一条「登记集合 == 实时余量 < 150 的页面集合」。

**没有把任何判据改松**：断言 88 → **103**（+15）、`verify:seo` 18 → **19**（+1）、检查码 28 不变、产物 **304 文件逐文件 sha256 全等**。

## 1. 装置与复现（可复跑）

| 装置 | 干什么 | 在哪儿 |
| --- | --- | --- |
| `.arch-v1/forgery.cjs` | dist 整树副本 → 单文件单锚点改动（锚点未命中即抛错）→ `node scripts/tools/seo-verify.js --dir=<副本>` | 本机 scratch（Tier-3） |
| `.arch-v1/sb-registry.cjs` | 沙箱（scripts/ + index.html + 数据 JSON + `research/_raw/p2-residuals-v1/` 整目录 + dist/）：把登记表 6 行裁到 1 行 | 同上 |
| `.arch-v1/precheck-v1b.cjs` | 304 文件真产物的影响面普查 | 同上 |
| `.arch-v1/tree-digest.cjs` | 全树摘要（相对路径排序 → 逐文件 sha256 → 总摘要） | 同上 |
| `.arch-v1/make-evidence-v1b.cjs` | 把上面四份读数裁成 Tier-1 小 JSON | 同上 |

复跑（本机，`npm ci` 已装在 `.worktrees/judge-hardening-v1b` 内）：

```powershell
cd .worktrees/judge-hardening-v1b
npm run build; npm run selftest:seo; npm run verify:seo
git checkout origin/master -- scripts/lib/seo.js scripts/tools/seo-verify.js scripts/tools/seo-selftest.js   # pre-fix 三文件
node .arch-v1/forgery.cjs run --phase=before      # 18 项门禁：F2/F3/A1 伪造副本**全绿**（破防复现）
git checkout HEAD -- scripts/lib/seo.js scripts/tools/seo-verify.js scripts/tools/seo-selftest.js           # 逐字节还原
node .arch-v1/forgery.cjs run --phase=after       # 19 项门禁：伪造副本与真删**同解**（都红）
node .arch-v1/sb-registry.cjs                     # 观察 2 的四段读数
```

「真删对照」= 同一锚点**删掉**而不是包注释；两段读数必须成对看（只报伪造侧红，证明不了「与真删同解」）。

## 2. 三段读数

### 2.1 F2 · sitemap 的 `<url>` 块被 XML 注释包住（`vendor/zhipu/`）

| 阶段 | 门禁（`verify:seo --dir=<副本>`） | 判据点名 |
| --- | --- | --- |
| **pre-fix 伪造副本** | ✅ **18 项 / 0 失败**（t5 的 F2 破防复现：`sitemap entries` 仍是 183） | 无 |
| pre-fix 真删对照 | ❌ 18 项 / **2 失败** | `[sitemap-policy] vendor/zhipu/ 可索引页不在 sitemap 里` · `sitemap 成员 == 非 noindex 页面的集合 —— 漏 vendor/zhipu/` |
| **本分支 伪造副本** | ❌ **19 项 / 2 失败** | **与真删逐字相同的两条** |
| 本分支 真删对照 | ❌ 19 项 / 2 失败 | 同上 |
| **原样（dist）** | ✅ **19 项 / 0 失败** | 无 |

### 2.2 F3 · canonical 被 HTML 注释包住（`need/student-only/`）

| 阶段 | 门禁 | 判据点名 |
| --- | --- | --- |
| **pre-fix 伪造副本** | ✅ 18 项 / 0 失败（规则层被判据骗过；当时只有 verify-site 的 DOM 判据兜底） | 无 |
| pre-fix 真删对照 | ❌ 18 项 / 1 失败 | `[canonical-self] need/student-only/ 没有 canonical` |
| **本分支 伪造副本** | ❌ **19 项 / 1 失败** | **`[canonical-self] need/student-only/ 没有 canonical`（seo 侧自己判红，不靠 verify-site）** |
| 本分支 真删对照 | ❌ 19 项 / 1 失败 | 同上 |
| **原样（dist）** | ✅ 19 项 / 0 失败 | 无 |

### 2.3 A1 · 「读原始文本」的逐点读数

| 形态 | 文件 / 改动 | pre-fix 伪造 | 本分支 伪造 | 本分支 真删对照 | 结论 |
| --- | --- | --- | --- | --- | --- |
| `robotsOf` | `need/free-api/`：robots meta 包注释 | ✅ 假绿 | ❌ 2 失败（`[alias-indexable]` 等 + sitemap 集合） | ❌ 2 失败（**同解**） | 已闭合 |
| `titleOf` | `feeds/`：`<title>` 包注释 | ✅ 假绿 | ❌ 1 失败（`[title-length] 页面没有 <title>`） | ❌ 1 失败（**同解**） | 已闭合 |
| `rowMarkers` | `need/no-card/`：`data-item` 挪进注释 | ✅ 假绿（行数对账被买通） | ❌ 2 失败（行数 0 ≠ 重算 1；`[itemlist-arity]`） | ❌ 2 失败（**同解**） | 已闭合 |
| `h1Count` | `status/`：注释掉的第二个 `<h1>` | ❌ **假红**（h1 数量 2） | ✅ 0 失败（注释不再计数） | —（该形态无真删对照，注释掉的就是不存在的） | 假红已消 |
| `jsonLdBlocks` | `status/`：第一个 ld+json 块包注释 | ✅ 绿 | ✅ 绿 | ✅ 绿（真删也绿） | **在 seo 侧无判据**（见 §6.1） |
| `internalLinks` | `feeds/`：加一条单引号 `href='…'` 死链 | ✅ 假绿（正则只认双引号） | ❌ `[internal-link-exists] feeds/deal/does-not-exist/` | —（这是「看不见」而非「被注释骗」） | 已闭合 |

规则级矩阵（`seo-selftest.js` §九，两条断言）：`titleOf` / `canonicalOf` / `descriptionOf` / `robotsOf` / `h1Count` /
`rowMarkers` / `jsonLdBlocks` / `internalLinks` 八个读点，**「注释里的副本」与「该标记根本不存在」读数逐点相等**。

### 2.4 观察 2 · 登记表静默缩小（t13 提出 / t24 实测的强度上界）

四段读数（沙箱内裁，工作树零改动）：

| 阶段 | 工具链 | `verify:seo` | `selftest:seo` | 说明 |
| --- | --- | --- | --- | --- |
| 1 · 表 6→1 行 **且转写一起裁** | pre-fix（`origin/master` 三文件） | ✅ 18 / 0（**不响**） | ✅ 不响 | **复现 t24 的「两侧一起裁 ⇒ 两门禁都绿」** |
| 2 · 同上 | 本分支 | ❌ **19 / 1**（点名 5 页「未登记」） | ✅ 不响（两侧仍一致） | 新不变式独立于「表↔转写一致」 |
| 2b · **只裁表**（转写不动） | 本分支 | ❌ 19 / 1 | ❌ 红 | 预存牙（表↔转写逐字节）没被新不变式取代，两条同时在守 |
| 3 · 复位 6 行 | 本分支 | ✅ 19 / 0 | ✅ 绿 | 复位复绿 |

**与 t24 结论的关系（不冲突，是「上界被抬高」）**：t24 量的是**当时那两门禁**的强度上界 —— 它建议「拿
`floor-census.json` 对账」；本轮落地的对账**不依赖第三个文件**，直接拿 `dist/` 现场的可见正文重算余量集合
（`ownVisibleText(page.html).length - textFloor(kind,count)`），所以「表 + 转写 + census 三者一起裁」这条更强的
伪造路径也咬得住。反向（页面被裁薄而没登记）同样响：`need/edu-identity/` 可见正文 1429 → 1127（余量 107 < 150）
⇒ `verify:seo` 19 / 1 点名「未登记：need/edu-identity/(107)」，而 pre-fix 门禁对同一副本 18 / 0 全绿。

## 3. 逐处行号对照表（改前 → 改后）

`lib/seo.js`（t5 的行号取自其分支头 `2387d60`，本表同时给 `origin/master` 的实际行号）：

| # | 读点 | t5 行号 | origin/master（改前） | 本分支（改后） | 改法 |
| --- | --- | --- | --- | --- | --- |
| 1 | `stripComments()`（新） | — | — | **139–170** | 新函数：从左到右扫描，丢 `<!--…-->`；`<script>/<style>` 段整段抄过去（内联 RENDER-CORE 里的 `<!--` 字面量不被误判）；注释里的 ld+json 整段丢 |
| 2 | `stripless()` | — | 130–133 | **182–186** | `stripComments(摘 script/style 之后)` —— 先摘 script/style 再剥注释，与 `visibleText()` 同序 |
| 3 | `visibleText()` | — | 113–121 | **113–121** | 不动（本来就剥注释） |
| 4 | `attr()` | — | 136–139（**0 调用点、未导出**） | **193–196**（注释 188–192） | 接到 `stripless()`（死代码纪律化，避免复活成第四处漏点） |
| 5 | `titleOf` | 88 | 141–144（`stripless`） | **198–201**（读在第 199 行） | 经 `stripless()` ⇒ 已剥注释 |
| 6 | `canonicalOf` | 93 | 146–149 | **203–206**（读在第 204 行） | 同上 |
| 7 | `descriptionOf` | 98 | 151–154 | **208–211** | 同上 |
| 8 | `robotsOf` | 103 | 156–159 | **213–216** | 同上 |
| 9 | `h1Count` | 108 | 161–163 | **218–220**（读在第 219 行） | 同上 |
| 10 | `jsonLdBlocks` | 115 | 166–176（第 171 行读 `String(html\|\|'')`） | **229–243**（读在第 233 行 = `stripComments(html)`） | **只剥注释**（不能用 `stripless()`：会把 ld+json 本体一起摘掉） |
| 11 | `rowMarkers` | 163 | 216–218（读 `String(html\|\|'')`） | **286–288**（读在第 287 行 = `stripless(html)`） | 摘 script/style + 注释 |
| 12 | `internalLinks` | — | 221–238（只认 `href="`） | **297–311**（第 299 行 `stripless(html)`、第 301 行两种引号） | 走 `stripless()`；`href` 引号两种都认（`"…"` / `'…'`） |

`seo-verify.js`（刻意不复用 seo.js 的解析器，只有「剥注释」这一步共用实现 —— 它是纪律不是判据）：

| # | 读点 | t5 行号 | origin/master（改前） | 本分支（改后） | 改法 |
| --- | --- | --- | --- | --- | --- |
| 13 | `strip()` | 48 | 48（只摘 script/style） | **56–58** | `seo.stripComments(摘 script/style 之后)` |
| 14 | `itemListOf()` | 94 / 105–106 | 91–99 | **101–109**（第 106 行读 `seo.stripComments(html)` 的 ld+json） | 注释里的影子块不再算数 |
| 15 | sitemap `<loc>` 扫描 | 156 | 156 | **171** | `seo.stripComments(sitemapXml)` 之后再扫 `<loc>` |
| 16 | **新增** 登记集合不变式 | — | — | **427–455**（规则体 `RESIDUAL_RANGE` 在第 440 行） | 「登记集合 == 实时余量 < 150 的页面集合」（少登记 / 过期登记都红） |

## 4. 断言与牙

- `seo-selftest.js` **§八**（5 条）：**t7 的补丁原文逐字落地**（非空行 61 行逐字相同、`firstDiff` 为空；插入位置 =
  第 798 行起）。实测 88 → **103** 项 / 0 失败。
- `seo-selftest.js` **§九**（8 条）：`stripComments` 的两种边角（script 串里的 `<!--`、注释里的整段 ld+json）、
  F3 / F2 / A1 各读点、`seo-verify.js` 三处读点必须经过 `stripComments` 的静态护栏。
- `seo-selftest.js` **§九 追加**（2 条，本轮）：**A1 矩阵** —— 八个读点上「注释版 == 不存在版」逐点相等。
- `seo-verify.js` **+1 条**（19 项）：观察 2 的不变式（规则层与产物侧同一份声明 `TEXT_FLOOR_RESIDUALS`）。
- 牙的全部实跑都是 **红 → 逐字节还原 → 绿**：pre-fix/本分支两相位之间的切换一律 `git checkout --`，
  每次跑完 `git status --porcelain` 只留本轮真正的改动（`.arch-v1/` 已 gitignore）。

## 5. 读数总账（本机）

| 命令 | 读数 |
| --- | --- |
| `npm run build` | exit 0 · 304 文件 / 20,386,654 B · 全树 `b99fd06d…` |
| `npm run selftest:seo` | **103 项 / 0 失败**（origin/master 副本实跑 88 / 0） |
| `npm run verify:seo` | **19 项 / 0 失败**（origin/master 副本实跑 18 / 0） |
| `node scripts/tools/check-ci-consistency.js --expect-checks=39` | 39 项 / 0 失败 |
| `npm run check:evidence` | ✅ 绿（无新增 Tier-3） |
| `npm run gate` | **48 个脚本 / 0 失败 / 299.4s / exit 0**（含 `[47] SEO verification`、`[50] Real-browser acceptance` = verify-site.js 121.1s、`[51] Regression verify`）；跳过 4 个非 node 步骤（Install dependencies / Prepare browser / Browser availability decision / Gate conclusion） |

> gate 读数取自 job `pwsh-1513`（在**已提交**的干净状态上跑；此前有一次 gate 跑在被还原过的混合状态上，已 kill 且不引用，见自审 §3）。

**产物变化面（判据改动不许动产品）**：同一份数据上「pre-fix `lib/seo.js` 构建」与「本分支构建」逐文件 sha256
**304/304 相同**（全树摘要两侧都是 `b99fd06d…`，0 个文件变化、0 字节差异）；断言又追加 2 条之后再构建，摘要不变。
**影响面普查**（304 文件）：注释里出现的读点标记 `0` 处、`<script>/<style>` 段里的 `data-item/data-child` `0` 处、
非脚本文本里的单引号 `href='…'` `0` 处、sitemap `<loc>` 原始 183 == 剥注释后 183（注释字节 0）
⇒ **三处收紧在真产物上读数为零变化，只在伪造副本上生效**。

## 6. 未验证 / 边界（诚实清单）

1. **`jsonLdBlocks` 这条读点在 `verify:seo` 侧没有能响的判据**：`status/` 的第一个 ld+json 块「包注释」与「真删」
   都得到 `19 / 0` 全绿。这不是判据被骗（剥注释后两种输入的读数确实相同），而是**这条形状在该门禁上没有对应判据**
   —— 需要判据的话归 t9 的 `verify-site.js`（DOM 侧）。规则级的等价性有 §九 的矩阵断言钉住。
2. **`attr()` 是死代码**（0 调用点、未导出）：本轮把它纪律化，但它不是 A1 的「决定点」；若未来有人导出并当判据用，
   矩阵断言覆盖不到它（它不在导出表里）。
3. **`verify-site.js` 的那一半（sitemap DOM/`split('<loc>')`、登记制扫描、冻结串计数等）未动**：本任务声明面外，归 t9；
   本文所有「组合仍红」的表述都不作为本轮的功劳。
4. **没有跑 CI**：本机 `npm run gate` 与上面五条命令是本轮的完成证据；CI 侧的 PR 门禁读数以 PR 页面为准
   （推分支后由 captain 复核）。
5. **观察 2 的沙箱是「工具链副本」**：pre-fix 段用 `origin/master` 的**三个文件**一致退回（只退 `seo-verify.js`
   会造出历史不存在的混合态，其自测 §九 护栏会红 —— 那个红是沙箱造出来的，已在装置里注明）。
6. **未复现 t5 的「11 项」计数**：t5 当时的门禁是 11 项（t4 之前），本轮 pre-fix 基线是 18 项、本分支 19 项 ——
   形态与点名行一致，计数差异来自 t4/t7/t20 已合并的增量。

## 7. 给 captain 的收口建议（原文，≤5 行，未改 DESIGN-RULES.md / NEXT-STEPS.md）

`docs/DESIGN-RULES.md`：

> **凡是判据，先剥注释**：判据读的 HTML/CSS/XML 文本必须先剥掉注释（`<!-- … -->` / `/* … */`）或直接走解析器/DOM；
> 唯一实现 = `lib/seo.js` 的 `stripComments()`（`stripless()`、`seo-verify.js` 的 `strip()` 都从它取词）。注释里的标记不是产物。

`NEXT-STEPS.md`：

> **t11 再攻击**：F2 / F3 / A1 的伪造副本现已与真删同解 —— 下一轮请攻击 `stripComments()` 自身（未闭合注释、嵌套 `<!--`、`<script>` 串里的 `-->`）与 `verify-site.js` 的对应读点（t9 面）。

## 8. 交接

- **t11（再攻击）**：`stripComments()` 的边角（未闭合注释「余下全丢」的保守语义、`<script>` 内 `-->`、多重注释）、
  以及「读点新增时矩阵断言是否覆盖得到」。
- **t9（verify-site 侧）**：`verify-site.js` 的 sitemap `<loc>` 原始 `split`、登记制扫描（6789–6795）、冻结串计数（6940–6950）
  以及 `--dir` 副本那处读 `ROOT/dist` 的例外集。
- **t14（说明登记）**：与本任务无文件交叠，但 `seo.js` 的 `TEXT_FLOOR_RESIDUALS` 现在是**被 `verify:seo` 两方向守着**的
  声明表，若要动它请按 t4 的「重新登记 = 一次可见动作」流程（`--print-floor-margins`）。
