# T4 复核报告：对抗式自审 + 当前 Full Gate + 基线对账

- 任务：`t4`（review r1，attempt 2）· 复核对象：`t3`（T2 实现，implementer）与 `t2`（T3 验证，verifier）
- 复核人：reviewer（对抗式复核，**证伪优先**：拿不到证据一律写「未验证」，不写「通过」）
- 时间：2026-10-05 → 2026-10-06 · 工作目录 `D:\OneDrive\Desktop\Code\AI Page`（HEAD = `4927fe3`）
- 本报告所有数字均为**本次复核自己跑出来的原始读数**；引用的他人数字一律标注来源。
- 证据目录：`research/_raw/home-topic-entry-cards-v1/_t4-tmp/`（脚本 + 原始输出，全部可复跑）
- 版本说明：attempt 1 在 503（网关维护）时被中断，本报告是 attempt 2 在**重新验证过全部结论**之后的修订版；
  M6 一节按队长指示改写（见 §5.1）。

---

## 0. 结论摘要

| 项 | 计数 | 判定依据 |
|---|---|---|
| **P0** | **0** | 无「产物错误 / 数据损坏 / 无 JS 不可用 / 死链 / 范围外改动」级缺口 |
| **P1** | **0**（**不含 M6**，见下方范围声明） | 无「验收条目未满足 / 断言放水 / 基线被放宽到看不见回归」级缺口 |
| **REPAIR_NOW** | **0** | 无需立即返工项。两处**文档级**观察（§7.1.3 旧口径被后续授权取代、§7.1.4 `REQUIREMENTS.md` 小节标题写 AC-31 而正文有 AC-32）都不影响任何 AC 判据，不计入 P0/P1 |

> ⚠️ **范围声明（必读）**：**M6 不成立** —— 「`.need-grid` 被做成横向滚动容器」这件事当前没有任何断言拦得住
> （§5.1：只注入基础规则时 **792 项 / 失败 0**）。这条已由**队长独立复现**并升级为返工任务 `t6`（verifier 补直接断言），
> 绑定复核 `t7`。**M6 的结论、以及最终交付 verdict，都以 t7 为准；t4 的 pass 只覆盖 §1–§4、§6、§7 的其余各项。**

**verdict = pass**（就 t4 契约里除 M6 之外的各项：未发现必须返工的问题；§8 的「未验证/局限」已逐条标明，
M6 那一项已明确排除在本次 verdict 之外、由 t7 承接）。

> 📌 **最终交付 verdict 在 §10（T7 绑定复核，本报告第 2 次 review attempt 产出）**：它审的是 T6 修复后的
> `verify-site.js`（798 项）与同一份冻结产物，结论同样是 **pass**，并且**关闭了 M6 缺口**。
> 阅读顺序建议：§0 → §10.6（最终判定）→ 需要看过程时再回到 §1–§9（T4 的历史证据）。

复核的四条 Verify 命令与 Full Gate 全部在本机当前 HEAD 上**自己跑通**（attempt 2 又完整重跑了一遍，
原始输出在 `_t4-tmp/t4-verify2/`）：

| 命令 | 退出码 | 原始读数（本次） |
|---|---|---|
| `node scripts/tools/check-ci-consistency.js --expect-checks=38` | **0** | `✅ CI 口径检查 38 项，失败 0 项` |
| `node scripts/tools/build-local.js` | **0** | `✅ 产物自检通过` / `✅ 构建完成 → dist/` |
| `node scripts/tools/verify-site.js` | **0** | `✅ 验收 792 项，失败 0 项`（75.7s） |
| `node scripts/tools/verify-site.js --compare=research/_raw/ours-baseline/verify.json` | **0** | `✅ 验收 798 项，失败 0 项`（77.1s） |
| `git diff --stat` | — | 7 个文件（见 §1，全部在授权作用域内） |
| `git diff -- deals.json plans.json api-plans.json models.json` | — | **输出 0 字节**（数据层零改动） |
| `node scripts/tools/verify-site.js --dir=<dist 快照>`（t6 版断言，快照隔离复验） | **0** | `✅ 验收 798 项，失败 0 项`（§6.6；因为 attempt 2 直跑 `dist/` 时与 t6 的并发变异撞了车，故改用快照复验） |

---

## 1. baseline → HEAD 逐文件清单与作用域对账

命令与原始输出：

```
$ git diff --stat
 index.html                                       | 166 ++++++-----
 research/_raw/ours-baseline/verify-pre-fold.json |   2 +-
 research/_raw/ours-baseline/verify.json          |   2 +-
 scripts/lib/audience.js                          |  38 +++
 scripts/tools/audience-selftest.js               |  31 +++
 scripts/tools/build-local.js                     | 130 +++++-----
 scripts/tools/verify-site.js                     | 336 +++++++++++++++++------
 7 files changed, 491 insertions(+), 214 deletions(-)

$ git diff --name-status
M	index.html
M	research/_raw/ours-baseline/verify-pre-fold.json
M	research/_raw/ours-baseline/verify.json
M	scripts/lib/audience.js
M	scripts/tools/audience-selftest.js
M	scripts/tools/build-local.js
M	scripts/tools/verify-site.js
```

| 文件 | 本轮授权作用域 | 对账 |
|---|---|---|
| `index.html` | T2 首页入口 CSS/HTML（§5/§25 旧 CSS 清理） | ✅ 逐 hunk 只看 CSS + 注释（§1.1） |
| `scripts/lib/audience.js` | NEED_PAGES 增两个纯展示字段 | ✅ 只 +20 行、**0 删除**（§2.2） |
| `scripts/tools/build-local.js` | `renderNeedRow` + 产物自检 ⑥ | ✅ 全在 `renderNeedRow`/`selfCheck` 两处 |
| `scripts/tools/audience-selftest.js` | §9 纯新增 6 条 | ✅ +31 / −0 |
| `scripts/tools/verify-site.js` | 断言重写 + 三处阈值同步 | ✅ 20 个 hunk 全在 29–2853 行；回归比对段（6409+）未动 |
| `ours-baseline/verify.json` | 只改 `firstScreenFull` | ✅ JSON 逐字段比对：**唯一变化字段**（§4） |
| `ours-baseline/verify-pre-fold.json` | 同上 | ✅ 同上 |

**范围外检查（逐项否定）**：

- **数据层**：`git diff -- deals.json plans.json api-plans.json models.json` → **0 字节**；`git status --porcelain -- scripts/data research/_raw/ours-baseline` 里 `scripts/data/` 无任何条目。
  `scripts/data/` 下 **29** 个文件里，mtime 落在本轮（>21:50）的**只有 1 个**：`translations_zh.json`（22:42:29，门禁第 6/7 步 zh 门禁期间）。我单独复核过它：`sha256(HEAD 版) == sha256(磁盘版) == CA6EE6B74F97756B…`、`git diff` 输出 0 字节 ⇒ 是一次**内容不变的重写**（门禁脚本的幂等写回），不是数据改动。其余 28 个文件 mtime 全部 ≤ `2026-10-05 13:59`（本轮开工前）。
- **`NEED_PREDICATES`**：不在任何 diff hunk 内（§2.2 有逐字证明）。
- **`/need/**` 渲染路径**：`scripts/lib/landing.js`、`scripts/lib/feeds.js`、`scripts/lib/seo.js` 均未出现在 diff 中；产物侧 `dist/need/**` 10 个页面逐文件 sha256 与门禁前相同（§2.6）。
- **Analytics**：`scripts/lib/analytics.js`、`scripts/tools/analytics-selftest.js` 未出现在 diff 中（§2.7）。
- **未跟踪文件**：`git status --porcelain -uall` 里的 `research/audit/**`、`AI_DEALS_*.md`、`final-dist-*.sha256` 均**不是本轮产物**（mtime 2026-10-01 / 10-03 / 10-04），本轮新增的未跟踪文件只有 `research/_raw/home-topic-entry-cards-v1/**`（in-scope 证据目录）。

### 1.1 `index.html` 的 hunk 全在「CSS + 注释」里（含"没有偷偷加 JS"）

```
$ git diff -U0 -- index.html | grep '^@@'
@@ -366,39 +366,72 @@
@@ -407,6 +440,10 @@
@@ -1007,7 +1044,11 @@
@@ -1037,14 +1078,14 @@
@@ -1053,31 +1094,6 @@
@@ -1087,6 +1103,16 @@
@@ -1126,13 +1152,17 @@
```

7 个 hunk 全部落在 `<style>` 段（366–1116 行）与 HTML 注释（440、1152）里：**没有一处落在 `<script>` 内**，也没有新增任何 `<script>`/事件绑定。这与 §2.5「入口不是 JS 生成」的实测互证。

---

## 2. 证伪式检查（每条都给命令与输出）

### 2.1 全仓不存在第二份十条入口文案 ✅

**（a）产物里只有一个来源，且只在 `nav.needs` 里**

```
$ node research/_raw/home-topic-entry-cards-v1/_t4-tmp/t4-second-copy-scan.js
=== 1) dist/index.html 里 href="need/…" 的全部出现 ===
总出现 10 次 · 10 个不同值（student-only / edu-identity / no-card / china-usable / free-tier /
free-api / free-tokens / ai-coding / free-model / dev-credits 各 ×1）
nav.needs 内 10 次 · nav.needs 之外 0 次
```

`dist/index.html` 全文的 `href="need/…"` 恰好 10 处，**全部在 `nav.needs` 里**；`nav.needs` 之外 0 处 ⇒ 首页没有第二个入口清单（页脚/侧栏/正文都没有）。

**（b）逐文件扫描 1488 个文件：命中 ≥3 条 `homeDescription` 的只有注册表 + 本轮证据文件**

```
=== 3) 十条入口文案的"第二份手写清单"扫描 ===
扫描文件数: 1488
  10 label / 10 desc  scripts/lib/audience.js          ← 唯一注册表（唯一出处）
  10 label / 10 desc  research/_raw/.../t3-geometry.json          ← 本轮证据（派生）
  10 label / 10 desc  research/_raw/.../t4-measure-after.json     ← 本报告证据（派生）
  10 label /  3 desc  research/_raw/.../t3-mut-M3.json            ← 本轮证据（派生）
  ...
  —— 命中 ≥3 条说明文案的文件（非证据类）: scripts/lib/audience.js
```

**（c）一个必须写清的边界（不是缺陷，但别被误读成"全仓零字面量"）**：`docs/SCHEMA-v1.1.md`、`PROJECT_STATUS.md`、`README.md` 等**既有文档**也提到全部/多枚 label（如 `学生专享`、`免费 API`），但：

- 这些文件本轮**零改动**（不在 `git diff` 里，mtime 均早于本轮）；
- 它们不含任何 `homeDescription`（表里 `desc=0`），**不是入口清单**，也不被构建读取用于渲染首页入口；

所以验收条目「除 NEED_PAGES 外无手写入口清单」在**渲染来源**这个意义上成立；文档里的词表是历史文档，不是第二真相来源。

**（d）入口清单的派生链是一条线**：`lib/landing.js:443` `const needSpecs = audience.NEED_PAGES.map(...)` → `PLAN.pages` → `build-local.js:3173 DIRECTORY_PAGES = PLAN.pages` → `renderNeedRow`。全程没有第二份清单。

### 2.2 `NEED_PREDICATES` 逐字未变 ✅（两种独立证法）

**（a）AST 级区块比对 + 行级 diff**

```
$ node <t4 脚本>（见 t4-fingerprints.log 与本节命令）
NEED_PREDICATES  HEADlen 328  CURlen 328  identical(trimmed)= true
NEED_GROUPS      仅新增行 0 · 仅删除行 0
NEED_PAGES       仅新增行 20（10×icon + 10×homeDescription）· 仅删除行 0
```

`NEED_PAGES` 只多了 20 行纯新增字段，**没有任何删除** ⇒ `slug` / `predicate` / `label` / `short` / `heading` / `depth` 逐字未变。

**（b）重算 T1 冻结的 14 个指纹（AC-12 里写明了复现命令，逐项比对）**

```
$ node research/_raw/home-topic-entry-cards-v1/_t4-tmp/t4-fingerprints.js
✓ NEED_PREDICATES 键集              冻结=4c8125ab1c0828af 实测=4c8125ab1c0828af
✓ studentOnly                       冻结=e3fb583985d08c85 实测=e3fb583985d08c85
✓ eduIdentity                       冻结=67645e78cca2c8a3 实测=67645e78cca2c8a3
✓ noCard                            冻结=7660a555ac2cc196 实测=7660a555ac2cc196
✓ chinaUsable                       冻结=72ca39c0f45e15f4 实测=72ca39c0f45e15f4
✓ freeTier                          冻结=b4ffdd32578372f5 实测=b4ffdd32578372f5
✓ freeApi                           冻结=ed9aeee00a0b3c28 实测=ed9aeee00a0b3c28
✓ freeTokens                        冻结=77fdbad4c51f0535 实测=77fdbad4c51f0535
✓ aiCoding                          冻结=0ee61a6c24c4ee5b 实测=0ee61a6c24c4ee5b
✓ freeModel                         冻结=5275e61463974a3d 实测=5275e61463974a3d
✓ devCredits                        冻结=a49e24882d538a87 实测=a49e24882d538a87
✓ NEED_GROUPS                       冻结=794d0e084c09e2bd 实测=794d0e084c09e2bd
✓ NEED_PAGES slug|predicate|label   冻结=9307d2faa110243b 实测=9307d2faa110243b
✓ NEED_PAGES short 序列               冻结=8e25f9a6c9041660 实测=8e25f9a6c9041660

冻结指纹重算：14/14 相同
```

### 2.3 `index.html` 无僵尸 chip 规则 ✅（生产者与消费者都为零）

七个旧类的全仓搜索（tracked 文件，排除 `dist/` `.worktrees/` `research/`）：

```
$ git grep -n --fixed-strings -e "nl-full" -e "nl-short" -e "nlinks" -e "ngroup" -e "nsep" -e "nlb" -- . ':(exclude)dist' ':(exclude).worktrees' ':(exclude)research'
scripts/tools/verify-site.js:2314:  const legacyClasses = ['nl','nl-full','nl-short','nlb','nsep','ngroup','nlinks'] …
scripts/tools/verify-site.js:2601-2602: （注释：旧结构那两条在新结构里不存在）
scripts/tools/check-mobile-chrome.js:92: const nlinks = [...needsNav.querySelectorAll('a')];   ← 本地变量名，不是 CSS 类
```

- `index.html`（源码）：0 命中；`dist/index.html`（产物）：`nl-full/nl-short/nlb/nsep/ngroup/nlinks` 各 **0** 次（`t4-static-inspect.log`）。
- 唯一的"出现"是 `verify-site.js:2314` 里**反向断言**的类名清单（故意列出、要求命中为 0，实测 `旧 chip 类残留 []`）。
- 生产者 0（`renderNeedRow` 只输出 `.need-grid/.need-card/.need-icon/.need-copy/.need-arrow`）、消费者 0（无 CSS 选择器引用）⇒ 僵尸规则不存在。

### 2.4 入口不是 JS 生成 ✅（两条独立证法）

**（a）产物静态**：`dist/index.html` 的 8 段内联脚本（共 173,411 字符）里 `need-card` / `need-grid` / `need-icon` / `need-arrow` / `homeDescription` / `NEED_PAGES` / `nav.needs` 命中**全部为 0**；无外链脚本。

**（b）真浏览器无 JS 对拍**（`_t4-tmp/t4-measure.js`）：

```
无 JS 卡数 10 · 与有 JS 逐条相同=true · 判定=prerendered (no-JS 时已存在且与有 JS 逐条相同)
```
用 `javaScriptEnabled:false` 打开首页，`nav.needs a.need-card` 仍有 10 张，且 `[href, 标题, 说明]` 与有 JS 时 `JSON.stringify` 全等。

### 2.5 当前产物无横向滚动容器 ✅（8 档视口 + 祖先链）— 但**断言**守不住这条，见 §5.1 / t6

> 本节证明的是**产物事实**（当前 `dist/` 这一份里没有横向滚动容器）。
> **不要**把它读成"这条属性有断言守着"：§5.1 证明「把 `.need-grid` 做成横向滚动容器」时**零断言变红**，
> 返工任务 `t6` 正在补这条断言，最终复核 `t7`。

本次实测（After，`t4-measure-after.json`）：

| 视口 | nav.needs 高 | 行 × 每行 | `overflow-x` | `scrollWidth>clientWidth` | 卡片被裁 | 说明行被截 | 页面横向溢出 |
|---|---|---|---|---|---|---|---|
| 1600/1440/1280 | 153px | 2 行（5/5） | visible | false | 0 | 0 | 0px |
| 768 | 313px | 4 行（3/3/3/1） | visible | false | 0 | 2 | 0px |
| 560/430/390/360 | 758px | 10 行（各 1） | visible | false | 0 | 0 | 0px |

```
$ node research/_raw/home-topic-entry-cards-v1/_t4-tmp/t4-ancestors.js
=== nav.needs 祖先链（从自身到 html）===
  <nav class="needs"> width=1420 overflow-x=visible scrollableX=false
  <body class="js">    width=1440 overflow-x=visible scrollableX=false
  <html>               width=1440 overflow-x=visible scrollableX=false
祖先链上的横向滚动容器: 0 个
html 横向溢出: 0 px · body 横向溢出: 0 px
```

（`nav.needs` 是 `<body>` 的直接子元素，中间没有 `.wrap` / `main` 之类的包裹层 —— 也就是说它连"祖先里藏一个 `overflow-x:auto`"的可能性都没有。）

页面里唯一的三个横向滚动容器（`.facetsin` 筛选条、`.radar .rscroll` 雷达正文、`.cmpscroll` 对比表）都不是 `nav.needs` 的祖先。CSS 侧：`nav.needs` / `.need-grid` / `.need-card` 的规则里没有 `overflow-x`（唯一带 `overflow` 的是 `.need-card .need-copy small` 的 `hidden`，用于**卡片内部单行省略**，不是滚动容器）。

> ⚠️ 一条必须说清的**负面事实**（不是本条判据的失败，但属于"入口可见性"）：≤560px 单列后整块 758px、`gridTop` 1136px，**首屏不再剩任何一张完整卡**（Before 剩 1 张）。这与 T3 的披露一致（§3）。

### 2.6 数据层逐字节未变 ✅

```
$ git diff -- deals.json plans.json api-plans.json models.json
（输出 0 字节）

$ node research/_raw/home-topic-entry-cards-v1/_t4-tmp/t4-final-checks.js
文件数 43 · 逐字节相同 43 · 不同 0 · 缺失 0
```

这 43 个文件 = `dist/need/**` 10 个页面 + `dist/*.json` 11 个数据出口 + 根数据 JSON 4 个
（`deals/plans/api-plans/models`）+ `scripts/data/**` 8 个（`source-health` / `coverage-targets` /
`plan-history` / `api-plan-history` / `deal-history` / `models` / `curated_plans` / `curated_api_plans`）
+ 本轮 5 个被评审源码文件 + `package.json` / `package-lock.json` / `scripts/lib/analytics.js` /
`scripts/tools/check-ci-consistency.js` / `dist/index.html`（`dist/index.html` 由门禁第 34 步重建，
**重建后 sha256 仍等于门禁前的 `8076370E3C7AF29A3C3B6289A57B3B0C673DA033CD1CC8432CFA7FA7652E5242`**）。

比对时间点：**门禁第一步之前**（T3 交出的 `dist/`，`dist/index.html` = `8076370E…`）↔ **完整 Full Gate 跑完（含 `build-local.js` 重建 dist）之后**。43 个文件全部逐字节相同 ⇒

- 构建**确定性**（重建产物与 T3 交出的一致，不是"看起来差不多"）；
- 数据层（`deals/plans/api-plans/models` + `scripts/data/*.json` + `dist/*.json`）**零漂移**；
- `/need/**` 10 个页面**逐文件字节未变**（AC-13）。

### 2.7 Local Analytics 请求数 = 0，且没有新增埋点 ✅

```
$ node …/t4-measure.js --dir=dist --label=After
外部请求 0 个 [] · analytics 命中 0 个 [] · JS 错误 0 个 · 本地请求 36
```

- 真浏览器打开本地站点，**所有 36 个请求全部指向 127.0.0.1**；非本地请求 0 个，命中 `cloudflare|analytics|beacon|umami|plausible|gtag|googletagmanager` 的请求 0 个。
- 本轮 diff 里没有新增任何 click event / custom analytics：7 个 hunk 全在 CSS/注释（§1.1），`scripts/lib/analytics.js` 与 `analytics-selftest.js` 零改动，`package.json` / `.github/**` 零改动（`git status` 里都没有）。
- 门禁侧独立证据：`Analytics self-test (bootstrap count / production guard / provider)` → `✅ 分析门禁 31 项，失败 0 项`。

---

## 3. 首屏密度独立复核：Before / After / Delta ✅（与 T3 逐项一致）

**方法**（比 T3 更硬的一版）：不是"运行时把 `nav.needs` 压回去"，而是用 `git archive HEAD` 在
`_t4-tmp/before/` 里复原一份 **HEAD 全量源码**（5 个关键文件与 `git show HEAD:<f>` 逐字节相同，
见 `t4-before-verify.js`），再在那份源码上 `node scripts/tools/build-local.js --out=dist` 真出一份 Before 产物；
用同一支量测脚本（口径逐条对齐 `verify-site.js:240-262`：`article.g`、`bottom <= innerHeight`、
`.grid` 的 `rect.top`、`documentElement.scrollHeight`）分别量两份 dist。

| 指标（1440×900） | Before（HEAD 真构建） | After（当前 HEAD） | Delta | T3 报的 | 一致 |
|---|---|---|---|---|---|
| `nav.needs` 高度 | **31px** | **153px** | **+122px** | 31 → 153（+122） | ✅ |
| `.grid` 起点 `gridTop` | **227px** | **349px** | +122px | 227 → 349 | ✅ |
| 首屏完整可见（`firstScreenFull`） | **9** | **6** | −3 | 9 → 6 | ✅ |
| 含截断（`firstScreenPart`） | 9 | 9 | 0 | 9 → 9 | ✅ |
| slack（末张完整卡 bottom 到 900 的距离） | **1px** | **119px** | +118px | 1 → 119 | ✅ |
| 页高 | **4665px** | **4787px** | +122px | 4665 → 4787 | ✅ |
| 卡片数 / 列数 / 卡高（`article.g`） | 50 / 3 / 192px | 50 / 3 / 192px | 0 | 50 / 3 / 192px | ✅ |
| 页面横向溢出 | 0px | 0px | 0 | 0 | ✅ |
| 筛选器 `[data-facet]` | 13 个 BUTTON，各 26px | 13 个 BUTTON，各 26px | 0 | 13 个各 26px | ✅ |
| 入口块形态 | 10 枚 chip 一行（旧类 7 个在册） | 10 张卡 5×2、卡高唯一值 68px、5 轨道 | — | 5×2 / 68px | ✅ |

Before 侧还独立复现了旧结构的证据：`nav.needs` 内 legacy classes = `[nl, nl-full, nl-short, nlb, nsep, ngroup, nlinks]`。

**各档视口 Before → After（首屏完整可见卡数）**：1600/1440/1280 `9 → 6` · 768 `4 → 2` · 560 `1 → 0` ·
430/390/360 `1 → 0`。与 T3 披露的"390 本块 240→758px、完整卡 1→0"方向与量级一致（我量到 758px；T3 报 758px）。

**读数固化与复现（attempt 3 重跑，数字逐项相同）**：

```
$ node research/_raw/home-topic-entry-cards-v1/_t4-tmp/t4-evidence-final.js
私有 After 构建 exit = 0  ✅ 构建完成（自检全过）           ← 从**被评审源码** build，不碰 dist/
私有 After dist/index.html = 8076370E3C7AF29A3C3B6289A57B3B0C673DA033CD1CC8432CFA7FA7652E5242
Before   dist/index.html = 0C90EC488F8C534DE5E5F0DE6CBA56028FD19C9FD13D6A36F53656D9324D7513
After  1440×900: nav.needs 153px · gridTop 349px · 首屏完整 6 / 含截断 9 · slack 119px · 页高 4787px
Before 1440×900: nav.needs  31px · gridTop 227px · 首屏完整 9 / 含截断 9 · slack   1px · 页高 4665px
```

- 读数文件：`_t4-tmp/t4-measure-after.json`、`_t4-tmp/t4-measure-before.json`（本次重跑写盘，字段含 8 档视口
  每张卡矩形、外部请求账本、无 JS 逐条对比）。
- 两棵生成树（Before 源码树 62 MB / After 产物 19.8 MB）在读数落盘后**删除以减轻 PR 体积**；
  重建命令与生成物指纹留在 `_t4-tmp/t4-generated-trees.manifest.json`（含 `git archive HEAD` +
  `build-local.js --out=dist` 两步，可原地复算）。
- 说明：这两份 JSON 在 attempt 1 曾因我脚本里的 `--json` 路径 bug（`slice(6)` 留下一个 `=`）被写进
  一个叫 `=research/` 的目录并在清理时删掉；attempt 3 已修正脚本并重跑，**数字与之前逐项相同**（见上）。

---

## 4. 阈值与基线：是「同步实测值」还是「放松到看不见回归」✅ 判定为前者

### 4.1 基线两份：只动了 `firstScreenFull` 一个字段

```
$ git diff --numstat -- research/_raw/ours-baseline/verify.json research/_raw/ours-baseline/verify-pre-fold.json
1	1	research/_raw/ours-baseline/verify.json
1	1	research/_raw/ours-baseline/verify-pre-fold.json

$ node <JSON 级逐字段 diff>（见 §4 命令）
FILE research/_raw/ours-baseline/verify.json
  flatKeys 23 changed 1
  changes: [ { "key": "metrics.firstScreenFull", "head": "9", "cur": "6" } ]
FILE research/_raw/ours-baseline/verify-pre-fold.json
  flatKeys 23 changed 1
  changes: [ { "key": "metrics.firstScreenFull", "head": "9", "cur": "6" } ]
```

23 个扁平字段里**恰好 1 个**变化，`cards` / `coveredDeals` / `cols` / `gridTop` / `pageHeight` /
`cardHeight` / `target` / `generatedAt` 等全部原值 —— 与队长在 `CAPTAIN-CORRECTIONS.md §AC-31 执行口径`
和 task 补充说明里给的"只动 firstScreenFull"逐条吻合。

**"不是放水"的第二重证据**：`--compare` 实际只比 6 项（`verify-site.js:6419-6428`：
`coveredDeals` / `cards` / `firstScreenFull` / `pageHeight(+15%)` / `externalRequests` / `jsErrors`），
这段代码本轮**零改动**（hunk 全在 29–2853 行，`6409+` 无 hunk）。基线里 `firstScreenPart`
仍是 12（未动）而实测是 9 —— 说明"只改被授权的那一个字段"是字面意义上的执行，没有顺手把其它指标一起调松。

### 4.2 verify-site 阈值：三处，都是"仍等于实测值"，且都写明代价

| 位置 | 改动 | 实测值 | 注释是否写明代价与理由 |
|---|---|---|---|
| `verify-site.js:263/275` | `首屏完整可见卡片 >= 9` → `>= 6` | 6（`firstScreenFull`） | ✅ 10 行注释：δ=+122px、精确临界 δ≥2px、+122 是 61 倍、"再加任何 ≥47px 顶条带会重新变红"、保留完整/含截断两个读数 |
| `verify-site.js:2693/2863` | `列表视图：首屏完整可见 >= 12 行` → `>= 10`（断言名去掉写死的 13/9） | 10 | ✅ 8 行注释：与 :263 同源、同受 `.rbar/.hubline` 影响、δ=+122 导致 13→10、2026-10-05 授权同步、名字不写死卡片数 |
| 两份基线 | `firstScreenFull` 9 → 6 | 6 | ✅ 报告 + 代码注释都写明"记录一次已披露的密度下降" |

**`:2693` 的授权是真实的**（我查了团队邮箱的持久记录，不是采信 T3 的自述）：

- `CAPTAIN-CORRECTIONS.md:88-89` 原本写「`:2693` 的 `>=12` **不得动**」；
- 但**其后**队长给 implementer（at=1791209747987）与 verifier（at=1791209748102）各发过一条裁决：
  「授权第三处，`:2693` 按与 `:263` 完全相同的原则同步到实测值……阈值 `>= 12` → `>= 10`；
  断言名里过期的『实测 13』→『实测 10』；在 check 上方加注释写清授权日期」。
- T3 的做法与这条裁决**逐字对应**（阈值、名字、注释三件事都做了），因此这是**授权范围内**的改动；
  `CAPTAIN-CORRECTIONS.md` 的旧口径已被后续裁决取代。

**"没放水"的可判定理由**（我自己复核，不是复述）：三处阈值都**严格等于本次实测值**（6 / 6 / 10），
而不是取一个更宽松的整数；`:263` 的注释还给出了"新加 ≥47px 顶条带即重新变红"的反向边界，
`:2693` 同理（"哪怕 47px"）。也就是说断言的功能没有被削弱，丢掉的只是本轮授权改动造成的那 3 张 / 3 行。

---

## 5. M1–M7 变异牙：我自己重跑（**只改被测产物，不碰任何被评审源码**）

方法：直接对 `dist/index.html`（被测产物）打变异 → `node scripts/tools/verify-site.js --json=<out>`
（`--json` 在失败时**不写文件**？—— 实测会写，见下）→ 读失败断言名 → **byte-exact 还原**（比对 sha256）。
之所以选"改产物"而不是"改源码再重建"：这样**完全不触碰** `index.html` / `scripts/**`，
也就不会给本轮带来任何"复核者改了被评审文件"的风险；对断言而言二者等价（断言读的是产物）。
脚本：`_t4-tmp/t4-mutate.js`，原始输出 `_t4-tmp/t4-mut/*.json|log`、`t4-mutate-stdout.log`。

| 变异 | 做了什么 | verify-site | 变红的断言（关键条目，**原文**） | 还原 |
|---|---|---|---|---|
| **M1** | 第一张卡挂 `data-facet="x"` | exit 1 · 792 项 / **失败 3** | ✗ `入口行里没有任何 JS 控件（无 JS 时不给可点暗示）` — facet 标记 1 个<br>✗ `首页专题导航卡：与筛选器语义隔离（… 计数为 0）` — 1 个<br>✗ `筛选按钮逐个带 aria-pressed` — 13/14 个 | ✅ byte-exact（`8076370E…`） |
| **M2** | 删掉第一张卡的 `<small>` 说明行 | exit 1 · 792 / **失败 1** | ✗ `首页专题导航卡：每张卡四件套齐全（…）` — `need/student-only/：图标 1 / 标题 1 / 说明 0 / 箭头 1` | ✅ byte-exact |
| **M3** | 删掉第一张卡的箭头 `span.need-arrow` | exit 1 · 792 / **失败 1** | ✗ `…每张卡四件套齐全…` — `箭头 0` | ✅ byte-exact |
| **M4** | 10 张卡 `<a>` → `<button>` | exit 1 · 792 / **失败 17** | ✗ `首页专题导航卡：卡数 == NEED_PAGES.length`（0 张 / 注册表 10）<br>✗ `首页有「按需求找优惠」入口行，且每条都是 <a>（无 JS 也能点）`<br>✗ `…每张卡四件套齐全…`（整个 nav 里一张 `a.need-card` 都没有）等 17 条 | ✅ byte-exact |
| **M5** | 第一张卡挂 `aria-pressed="false"` | exit 1 · 792 / **失败 2** | ✗ `…与筛选器语义隔离…` · ✗ `入口行里没有任何 JS 控件…`（facet 标记 1 个） | ✅ byte-exact |
| **M6 形态 A** | 只给**基础** `.need-grid` 规则（含 `display:grid` 那条）追加 `overflow-x:auto;`（5 列不变 ⇒ 容器不溢出） | **exit 0 · 792 / 失败 0** ⚠️ | 无 —— **T3 版断言集下这是「零牙」**：`.need-grid` 确实成了滚动容器（computed `overflow-x:auto`），但没有任何断言看这个属性 → **这就是 T4 的 finding / t6 的返工对象**（T6 修复后同一变异 → **6 项红**，见 §5.2、§10.3） | ✅ byte-exact |
| **M6 形态 B** | 给**全部四条** `.need-grid` 规则（基础 + ≤1180 / ≤760 / ≤560 三档媒体查询）**各追加** `overflow-x:auto;`（4 处，列数不变 ⇒ 仍不溢出） | （T3 版下未跑；机制与 A 相同 ⇒ 同样是 0 红） | 无（同上）；T6 版断言集下 → **6 项红**，红的全是新断言（§10.3） | ✅ byte-exact |
| **M6 形态 C**（t4 报告里曾叫「M6R」） | **基础规则整条换成** `repeat(10, 220px)` + `overflow-x:auto`（锚点命中 **1** 处） | exit 1 · 792 / **失败 4** | ✗ `专题导航卡 1600/1440/1280px：每张卡都在视口内…（逐张量矩形）`（3 条：6/10、6/10、5/10 张在视口内，卡片 `right` 到 2418/2338/2328px）<br>✗ `专题导航卡 1440px：.need-grid 轨道数 == 5`（10 条轨道 · 1 行） | ✅ byte-exact |
| **M7** | 第一张卡 href 改成不存在的 slug | exit 1 · 792 / **失败 3** | ✗ `首页专题导航卡：逐条 label / href 与 NEED_PAGES 对账不错位（顺序一致）`<br>✗ `首页专题导航卡：数据里每个需求都有对应入口（没有漏项、href 不重复）`<br>✗ `首页有「按需求找优惠」入口行…` | ✅ byte-exact |

**结论（T4 版断言集，792 项）**：M1–M5、M7 **5/5 真红、红的就是那条断言**；**M6 形态 A（与队长独立复现的那个形态）失败 0 项 = 真实缺口**
（`overflow-x:auto` 的容器没有任何断言看），形态 C 的 4 条红是**越界机制**。队长独立复现后升级为 `t6`（补直接断言）+ `t7`（绑定复核）。
**T6 修复后的复跑结果（798 项）见 §10.3**：形态 A → 6 红、形态 B → 6 红、形态 C → 10 红（4 条几何 + 6 条新断言）。

### 5.1 ⚠️ M6 形态 A 暴露的缺口：「这一块是横向滚动容器」当时没有任何断言守着（**已由 t6 关闭**）

三种形态必须分开记（**混成一条是错的**）：

| | 形态 A（队长/T4 用的） | 形态 B（t6 记录在案的 M6b） | 形态 C（t4 报告里的「M6R」） |
|---|---|---|---|
| 改了什么 | 只在**基础**规则追加 `overflow-x: auto;` | 给**四条**规则**各追加** `overflow-x: auto;` | **基础规则整条替换**成 `repeat(10, 220px)` + `overflow-x: auto` |
| 锚点数 | 1 | 4 | 1（替换原规则） |
| 元素真的变成滚动容器吗 | **是**（computed `overflow-x:auto`） | 是 | 是 |
| 有可见后果吗（溢出/越界） | **没有**：10 张卡仍是 1fr 5×2，`scrollWidth === clientWidth` | **没有**（列数没动） | **有**：10 条固定 220px 轨道 ≈ 2200px+，卡片被推到 `right` 2418/2338/2328px |
| T3 版断言集（792）结果 | **失败 0** ← 缺口 | 失败 0（同机制） | 失败 4（几何：越界 ×3 + 轨道数 ×1） |
| T6 版断言集（798）结果 | **失败 6**（6 档新断言） | **失败 6**（6 档新断言） | 失败 10（= 同样 4 条几何 + 6 条新断言） |

**机制要说准**（对上一条的更正）：形态 C 的 4 条红**不是**「媒体查询覆盖基础规则」造成的 ——
机制是**基础规则被换成固定宽轨道（10 × 220px）导致真实横向溢出**，于是 6–10 张卡被推出视口（`right` 到 2328–2418px）、
`1440px 轨道数 == 5` 也不再成立。**为什么窄档不红**（430/390 用的是 ≤760/≤560 媒体查询里的 2/1 列 `1fr`，不溢出）——
「媒体查询覆盖基础规则」顶多解释「哪些档会红」，**不是红的机制**，表述上不能倒过来。

关键事实（**缺口的证据**）：形态 C 里 `.need-grid` 已经是真横向滚动容器（`overflow-x:auto` 且内容溢出），
可是那 4 条红的断言名里**没有**任何一条是看「容器本身」的：

```
✗ 专题导航卡 1440px：.needs 不是横向滚动容器、卡片没有被裁        ← 它没有红
   实际判据（verify-site.js:2411-2417）：getComputedStyle(nav).overflowX !== 'auto'/'scroll'
                                        && !(nav.scrollWidth > nav.clientWidth + 1) && clipped === 0
```

那条断言量的是 **`nav.needs` 自己**的 `overflow-x` 与 `scrollWidth`（见上面引的判据行）；而真正变成滚动容器的是它内部的 `.need-grid` ——
`.need-grid` 内部横滑时，`nav.needs` 自身的 `scrollWidth` 并不增长（内容被内层容器裁掉了），
所以「入口块被做成横向滚动容器」这件事在 T3 版断言集里**一条断言也拦不住**（形态 A 就是它的最小反例：0 项变红）。

> **闭环（t6/t7）**：t6 已按此补上直接断言（6 档各一条，判据只取 `getComputedStyle`），
> 并在 §10.3 由我用**形态 A / B** 两种变异独立确认：修复后两形态各 → **6 项红且几何断言全绿**（抓的是机制，不是越界的副作用）；
> 同时用形态 C 确认旧的越界机制仍在（**4 条几何红一条不少**，加上新断言共 10 项）。缺口**已关闭**。

> 另外：形态 C 的红只在 1600/1440/1280 三档出现（那三档走的是被替换的基础规则：固定 220px 轨道 → 真溢出），
> 窄档走媒体查询里的 `1fr` 列、不溢出 ⇒ 不红。这仍然反证了"逐档量"的必要性：只量 390px 会漏掉最宽的三档。
> ⚠️ 表述纪律：这是「**哪些档会红**」的解释，**不是**这 4 条红的机制（机制是固定宽轨道造成的真实越界）。

---

## 6. 当前 Full Gate（**动态读清单，不写死历史项数**）

### 6.1 清单来源（现读，不是抄历史）

- `package.json` 的 `scripts`：**94** 个脚本（含 `verify` / `verify:regress` / 25 个 `selftest:*`）；
- `.github/actions/gate/action.yml`：**49 步**复合 action（第一步 `npm ci`，最后一步 `Gate conclusion`）；
- `.github/workflows/`：5 个 workflow（`verify.yml` / `deploy.yml` / `collect.yml` / `probe-sources.yml` / `ai-maintenance.yml`）；
  `verify.yml` 的 `gate` job = ① `node scripts/tools/check-ci-consistency.js --expect-checks=38`（第 125 行）
  ② `uses: ./.github/actions/gate`（第 129 行）。
- `check-ci-consistency.js` 的第 (10) 条会自己核对"action.yml 步骤名序列 == 冻结清单"，本次报：
  `.github/actions/gate/action.yml 共 49 步：名字序列 / run 体指纹 / 步骤级 if / 无 continue-on-error 全过`
  ⇒ 清单没有多一步也没有少一步。

### 6.2 执行结果（脚本 `_t4-tmp/t4-gate-runner.js` 逐条跑 action.yml 的 `run:`）

```
=== gate: 45 passed / 3 failed / 1 skipped (of 49 steps, 202.1s) ===
```
- 3 个 "failed" 是**多行 bash 块**（第 45 步浏览器准备 / 第 46 步降级判定 / 第 49 步结论），
  在我用 cmd shell 直接跑时被 cmd 的管道解析打断（`| was unexpected at this time`），**不是产物断言失败**；
- 我用 **Git Bash 原样重跑**了这三步（`_t4-tmp/t4-gate-bash.js`）。因为复合 action 的 bash 块里含 `${{ … }}`
  表达式（GitHub 在运行前替换），我用 bash 执行时必须显式代入本地实际值，**代入清单如下**（逐条列出，不含糊）：

| 表达式 | 我代入的值 | 依据 |
|---|---|---|
| `${{ inputs.allow_degraded_run }}` | `false` | `verify.yml:133` 的 `allow_degraded_run: ${{ inputs.allow_degraded_run && 'true' \|\| 'false' }}`；PR/push 路径一律 false |
| `${{ steps.browser.outputs.browser_available }}` | **第 45 步自己写进 `$GITHUB_OUTPUT` 的值**（实测 `true`） | 不是硬编码 —— 先跑第 45 步，再把它产出的 output 喂给第 46 步 |
| `${{ steps.browser.outputs.executable }}` | 同上（实测 `C:\Users\…\ms-playwright\chromium-1243\chrome-win64\chrome.exe`） | 同上 |
| `${{ steps.decision.outputs.mode }}` | **第 46 步自己写出的值**（实测 `full`） | 先跑第 46 步，再喂给第 49 步 |
| `${{ github.event_name }}` / `${{ github.ref }}` | `pull_request` / `refs/pull/t4-review/merge` | 只用于第 49 步写 Summary 文案，不参与判定 |

另外两处**例外**必须写明（不计入绿）：
- 第 45 步里唯一联网的一句 `npx --yes "playwright@$PW_VERSION" install --with-deps chromium \ || echo …::warning…`，
  我**没有联网执行**，改为本机等价探测（`require('playwright-core').chromium.executablePath()` + Edge 路径存在性），
  脚本里已就地注明；其结果 `browser_available=true` 与 CI 上的语义一致（CI 里这一步本身 `exit 0`、不判死）。
- 第 1 步 `npm ci` **未执行**（见 §6.4）。


```
[45] Prepare browser for the real-browser gate → exit=0 · outputs={"browser_available":"true","executable":"…ms-playwright\chromium-1243\chrome-win64\chrome.exe"}
[46] Browser availability decision (never silent) → exit=0 · mode=full
[49] Gate conclusion → exit=0
    ### 门禁结论
    - 静态门禁 + **真浏览器验收 + 回归比对**都跑了
=== bash 块步骤：3/3 exit=0 ===
```

因此 **48/49 步在本地 exit=0**；唯一未执行的是第 1 步 `npm ci`（环境准备，重装 `node_modules`，
不是对 HEAD 产物的断言；本机依赖已就位，`playwright-core 1.63.0` 可解析）。**这一条我如实写为"未执行"，不计入绿**。

各步关键原始输出（`_t4-tmp/t4-gate/<nn>-*.log`）：

```
02 validate --strict            exit=0  ✅ 校验通过（strict 模式）
03 check-reproducible           exit=0  ✅ deals.json 可重建：值全部有源，且管线对它是幂等的
04 history-verify               exit=0  ✅ 历史可重建：基线 + 事件重放逐字段等于当前 deals.json
07 zh-selftest                  exit=0  ✅ 演练 15 项，失败 0 项
16 audience-selftest            exit=0  ✅ 受众字段自测：197 项通过，0 项失败        ← 191+6
34 build-local                  exit=0  ✅ 产物自检通过 / ✅ 构建完成 → dist/
35-39 五个产物页面自测            exit=0  120 / 32 / 57 / 69 / 58 项，失败 0
40 analytics-selftest           exit=0  ✅ 分析门禁 31 项，失败 0 项
41 feeds-reproducible           exit=0  ✅ 订阅可复现门禁：2 次构建，全部逐字节一致
44 seo-verify                   exit=0  ✅ SEO 验收 11 项，失败 0 项
47 verify-site                  exit=0  ✅ 验收 792 项，失败 0 项（75.7s）
48 verify-site --compare …      exit=0  ✅ 验收 798 项，失败 0 项（77.1s）
```

### 6.3 `check-ci-consistency` 与"没新增门禁步骤/自测"

```
$ node scripts/tools/check-ci-consistency.js --expect-checks=38
✓ (17) package.json 里的每个 selftest:* 都被门禁真的跑到（新脚本必须登记） — 全部出现
✓ (19) 每个 scripts/tools/*selftest*.js 都有被门禁真的跑到的 script 指向 — 扫了 26 个，豁免 0 条
✓ (10) gate 复合 action … 共 49 步：名字序列 / run 体指纹 / 步骤级 if / 无 continue-on-error 全过
✓ (W) 断言名单与冻结清单等值 — 实跑 37 条 = 冻结清单 37 条 + 本看门狗
✓ (E) 实跑项数 == --expect-checks=38
✅ CI 口径检查 38 项，失败 0 项        （exit=0）
$ git status --porcelain -- package.json .github
（空）
```

⇒ 本轮**没有**新增门禁步骤、没有新增 selftest 脚本、`--expect-checks=38` 与 `FROZEN_ASSERTION_NAMES`
均未被改动（`check-ci-consistency.js` 文件本身也不在 diff 里）。

### 6.4 独立复现"改断言之前是 8 项红"

用 HEAD 版 `verify-site.js`（在 HEAD 影子树里，与 `git show HEAD:` 逐字节相同）跑**本轮 After 产物**：

```
$ node …/t4-head-verify.js
HEAD 版 verify-site.js 跑 After 产物：exit=1 · 项目 776 · 失败 8
   ✗ …（详见 _t4-tmp/t4-head-verify.log 与 t4-head-verify.json）
```

⇒ 与 T2/T3 报的「改断言前 776 项 / 失败 8 项」逐项一致。8 条**逐条点名**（我自己跑出来的原文）：

```
✗ 首屏完整可见卡片 ≥ 9 — 完整 6 张 / 含截断 9 张 · 网格起点 349px · 页高 4787px          ← :263（本轮授权同步）
✗ 每条入口都同时带全称与窄屏短标签（CSS 切换，无 JS 也生效） — 0/10 条两套齐全 · 全称「」/ 短「」   ← 旧 chip 结构死断言
✗ 桌面端入口显示的是全称、不是缩写 — need/student-only/ 显示「🎓学生专享12学生套餐与教育折扣，附申请门槛→」…  ← 同上
✗ 按需求入口 390px：切到了窄屏短标签（每枚都有可见文字） — 10 枚无文字 · 标签「|||||||||」        ← 同上
✗ 按需求入口 390px：每组两列排布，没有幽灵行、没有被拉高 — 0 组 · 整块 758px                  ← 同上
✗ 按需求入口 360px：切到了窄屏短标签（每枚都有可见文字） — 10 枚无文字 · 标签「|||||||||」        ← 同上
✗ 按需求入口 360px：每组两列排布，没有幽灵行、没有被拉高 — 0 组 · 整块 758px                  ← 同上
✗ 列表视图：首屏完整可见 ≥ 12 行（实测 13，卡片视图 9） — 10 行（行高 46px · 共 50 行 · 页高 3567px）  ← :2693（本轮授权同步）
```

（计数对账：6 条"旧 chip 结构"= 2321/2324 各 1 条 + 390/360 两档各 2 条；加 `:263`、`:2693` 共 **8**。）
也就是说：**这些红是本轮改动真实造成的、被公开记录的**，不是为了让门禁变绿而事后编的说法。

### 6.5 第 1 步 `npm ci`：未执行（如实记录，不计入绿）

- 不执行的理由：它会把 `node_modules` 整个删掉重装（联网），属于**环境准备**而非对 HEAD 产物的断言；
  在复核场景里执行它既没有增量证据，又有把本机依赖弄坏、影响后续 T7/T5 的风险。
- 替代证据（只证明"依赖可用"，不冒充"npm ci 已过"）：本机 `node_modules/playwright-core` 可解析
  （版本 `1.63.0`），playwright chromium 与系统 Edge 均可执行；门禁第 2–44 步（含 26 个 selftest、
  5 个产物自测、SEO 验收）与第 47/48 步（真浏览器）全部在**这套依赖**上 exit=0。
- **因此 Full Gate 的准确表述是：48/49 步在本机 exit=0，1 步（`npm ci`）未执行。**

### 6.6 复核期间的并发写 `dist/` 事故，与「快照隔离」复验（attempt 2/3 补充）

**事故**：attempt 2 我重跑四条 Verify 时（00:04:10–00:05:26），`verify-site.js` 的第 3 条命令失败：
`❌ 验收 798 项，失败 6 项`，6 条全是同一条新断言：

```
✗ 专题导航卡 1600/1440/1280/768/430/390px：.needs 与 .need-grid 都不是横向滚动容器（计算 overflow-x ∉ auto/scroll）
   — .needs overflow-x=visible · .need-grid overflow-x=auto ·
     scrollWidth/clientWidth：needs 1420/1420 · grid 1380/1380
```

这 6 条的签名（`overflow-x=auto` 但 `scrollWidth == clientWidth`）**正是我在 §5 里自己用过的「形态 A」变异**。
事后排查（三步）：

1. **不是产物回归**：对当时盘上的 `dist/` 单独写探针（`_t4-tmp/t4-grid-overflow-probe.js`）实测
   `nav.needs = visible`、**`.need-grid = visible`**、`.need-grid` 宽 1380px、5 条轨道、无内联 style
   —— 在这样的页面上这条断言**是绿的**。
2. **是并发写**：`verify-site.js` 的 mtime 显示它在 00:03:21 刚被 t6 改过（正是新增这条断言），
   而 t6 的返工任务本身就要"补这条断言并**用变异证明它会红**"—— 我那 5 分钟的运行窗口正好撞上
   t6 在 `dist/` 上做的形态 A 变异（何时还原只有 t6 自己的进程知道）。
3. **隔离复验（决定性证据）**：把当时的 `dist/` 整体复制成**不可能被并发修改的快照**
   `_t4-tmp/t4-dist-snapshot/`（快照内 `index.html` sha256 = `8076370E…`，与仓库 `dist/` 逐字节相同），
   再用**当时最新的 `verify-site.js`**（内含 t6 的新断言）跑：

```
$ node scripts/tools/verify-site.js --dir=research/_raw/home-topic-entry-cards-v1/_t4-tmp/t4-dist-snapshot \
      --json=research/_raw/home-topic-entry-cards-v1/_t4-tmp/t4-verify-snapshot.json
✅ 验收 798 项，失败 0 项        （exit=0；机器可读报告已写出）
```

⇒ **那 6 条红不是被评审产物的问题，是我与 t6 并发写同一个 `dist/` 造成的运行期污染**；
隔离复验下同一份产物 **798 项 0 失败**。

**这条事故对下游有两份价值**：

- 给 **t7**：t6 的新断言**确实咬得住形态 A**（只给基础 `.need-grid` 规则注入 `overflow-x:auto`）——
  6/6 档视口全部变红。补丁方向正确（最终结论仍以 t7 的复核为准）。
- 给 **T5/T7 的流程提醒**：`dist/` 是**单写者资源**，两个人同时动它必然互相污染验收读数。
  建议后续任务在契约里写清"跑 `verify-site.js` 前确认没有别人在动 `dist/`，或直接对快照目录跑
  `--dir=<快照>`"。我这次撞的是"我 build + 对方变异"的窗口，很容易被误读成回归。

### 6.7 本报告对应的**版本指纹**（t4 审的是这一版；之后的 `verify-site.js` 改动属 t6）

| 文件 | sha256 前 16 位（复核时 = 现在） | 说明 |
|---|---|---|
| `index.html` | `52388FD7F9BC4DE4` | 与复核时**逐字节相同**（T2 产物） |
| `scripts/lib/audience.js` | `CDC43A685596DB02` | 同上 |
| `scripts/tools/build-local.js` | `75170C7F0CB5AF1A` | 同上 |
| `scripts/tools/audience-selftest.js` | `998CDD483D521F07` | 同上 |
| `research/_raw/ours-baseline/verify.json` | `8E95964387683201` | 同上 |
| `research/_raw/ours-baseline/verify-pre-fold.json` | `8C8316842B99CED1` | 同上 |
| `dist/index.html` | `8076370E3C7AF29A` | 复核前后都是这一版（重建后逐字节相同） |
| `scripts/tools/verify-site.js` | 复核时是 T3 版（792 项）；**现为 `D5125C580A951D135C90BFA74C98241C218782FB1C7C31F8D57CC22F9D88EBAE`（t6 最终版，798 项 / `--compare` 804 项）** | §1–§5 的断言清单对应 T3 版；§6.6 与 §10 用的是 t6 最终版 |

⇒ **§1（diff 清单）、§2（证伪检查）、§3（首屏实测）、§4（阈值/基线）、§5（变异）全部对应同一版产物**
（上表前 7 行在复核前后逐字节未变）；唯一"之后又变过"的 `verify-site.js` 属于 t6 的作用域，
不在 t4 的结论范围内。

### 6.8 ⚠️ 现场状态提醒（给 T7 / T5）：**复核窗口结束时，盘上的 `dist/` 正带着一处变异**

attempt 3 我"从被评审源码重建"了一份 After 产物放在私有目录，再与盘上的 `dist/index.html` 逐字节比对：

```
$ node research/_raw/home-topic-entry-cards-v1/_t4-tmp/t4-evidence-final.js
私有 After（从被评审源码 build） dist/index.html = 8076370E3C7AF29A…
盘上 dist/index.html                             = 59283A6909731F74… （**不一致**）
  长度：私有 314818 / 盘上 314836（差 18 字节）
  第一处差异 @ 18981
    私有: …grid-template-columns: repeat(5, minmax(0, 1fr)); gap: var(--s3); }
    盘上: …grid-template-columns: repeat(5, minmax(0, 1fr)); gap: var(--s3);  overflow-x:auto; }
  不同行数: 1 [ 406 ]
```

也就是说：盘上的 `dist/index.html` 现在**恰好是「形态 A」变异态**（只给基础 `.need-grid` 规则追加了
`overflow-x:auto`，18 字节、1 行）—— 这正是 t6 用来证明自己新断言会红的那次注入，写这份报告时它还在盘上。
原始差异留在 `_t4-tmp/t4-live-dist-diff.txt`。

**结论与要求**：

1. **被评审的源码没问题**：从同一份源码重建设出来的产物**逐字节等于** `8076370E…`（冻结版）。
2. **但任何"现在就跑"的验收读数都会被这 18 字节污染**（读者会是 `verify-site.js` 在 t6 版断言下报
   6 条 `.need-grid` 横滑红，而不是产物回归）。**t6 必须把 `dist/` 恢复到重建后的状态**
   （`node scripts/tools/build-local.js` 或 byte-exact 还原），**T7 再开始跑绑定复核**；
   T5 的 PR 不含 `dist/`（gitignore），所以 PR 本身不受影响，但 T5 若要在本地复跑验收，请先确认 `dist/` 是干净的。
3. 这也再次印证 §6.6 的流程建议：**`dist/` 是单写者资源**。

---

## 7. P0 / P1 / REPAIR_NOW 判定

> ⚠️ **本节是 T4（第 1 次复核）的判定，已被 §10（T7 绑定复核，最终）取代。** 最终交付 verdict 见 §10.6。

**P0 = 0 · P1 = 0 · REPAIR_NOW = 0。**

> **范围声明（必读）**：上面这三个 0 **不包含 M6**。M6 暴露的「`.need-grid` 变成横向滚动容器时没有任何断言拦得住」
> 是一个**真实缺口**（§5.1，我已复现、队长已独立复现），但按队长指示它已被单独升级为返工任务 `t6`、
> 绑定复核 `t7`，**M6 的结论以 t7 为准，最终交付 verdict 也是 t7 的**。
> 换句话说：**t4 的 pass 只覆盖 §1–§4、§6、§7 的这些项，不代表 M6 通过。**

（T7 已在 §10.3 用变异独立确认 t6 的补丁真的关闭了这个缺口：形态 A/B → 各 6 项红、形态 C → 10 项红。）

判定依据（逐条对照任务契约的 acceptance）：

| 契约条目 | 结论 | 证据 |
|---|---|---|
| baseline→HEAD 每文件可对应授权作用域 | ✅ | §1 |
| 无范围外文件（数据层 / NEED_PREDICATES / `/need/**` / Analytics） | ✅ | §1、§2.2、§2.6、§2.7 |
| 无第二份十条入口文案 | ✅ | §2.1 |
| NEED_PREDICATES 逐字未变 | ✅ | §2.2（14/14 指纹） |
| 无僵尸 chip 规则 | ✅ | §2.3 |
| 入口不是 JS 生成 | ✅ | §2.4 |
| 无横向滚动容器 | ✅（t4 时只有产物证据；**t6 已补断言**，§10.3 独立确认） | §2.5 |
| 数据层逐字节未变 | ✅ | §2.6（43/43 文件） |
| 首屏密度 Before/After/Delta 与 T3 一致 | ✅ | §3（HEAD 真构建，逐项相同） |
| 阈值/基线改动是"同步实测值" | ✅ | §4（只动 1 个字段，三处阈值都等于实测值，注释写明代价与授权） |
| M1–M5、M7 真红 + 还原干净 | ✅ | §5（6 次变异全部真红且红的是那条断言，6/6 byte-exact） |
| **M6** | **❌ 不成立 → 已升级 t6 / 以 t7 为准** | §5.1（形态 A 0 项变红；形态 B 红的是越界机制，不是滚动容器机制） |
| Full Gate 在当前 HEAD：48/49 步 exit=0 | ✅（`npm ci` 未执行并已注明） | §6、§6.5 |
| check-ci-consistency 仍绿、未新增门禁步骤 | ✅ | §6.3 |
| Local Analytics 请求数 = 0 | ✅ | §2.7 |

### 7.1 值得写进最终报告但**不构成缺口**的观测

1. **移动端首屏代价是真实且已被披露的**：≤560px 单列后 `nav.needs` 758px、首屏完整卡 1 → 0。
   T3 主动披露、队长书面认可（"可读性优先"，prompt §19 授权 1 列）。**这不是隐性的退化**，但如果最终
   报告只写桌面 9→6 而漏掉手机 1→0，就是选择性披露 —— 本复核确认两处都写在代码注释与 VERIFY-REPORT 里。
2. **`verify-site.js` 在失败时仍会写出 JSON**（我的 6 次有效变异都成功读到 `checks[].ok`），
   说明 T3 修掉的"detail 里解引用 `items[0]` 崩溃导致 JSON 写不出来"是真的修好了 —— 这是变异牙能用的前提。
3. **`CAPTAIN-CORRECTIONS.md:88-89` 的旧口径已被队长追加授权取代 —— 按队长口径认定，不计为缺陷。**
   （本节原先记为 §9.3；本报告没有 §9.3，此处更正编号。）逐字核对**实际文件内容**（`read CAPTAIN-CORRECTIONS.md`，
   全文 89 行，末尾一节标题为「队长对 AC-31 的执行口径（避免 T3 误解『同步基线』为『放松基线』）」）：

   ```
   88: - `verify-site.js:2693`「列表视图：首屏完整可见 ≥ 12 行」的 `>= 12` 阈值**不得动**
   89:   （它量的是列表视图，与本轮无关），只允许改 detail 文案。
   ```

   即：**文件确实是这么写的，而且至今没有被回填更正**（我复核时文件 mtime 仍是 2026-10-05 21:58，89 行）。
   但**其后**队长给 implementer / verifier 各发过一条裁决（团队邮箱持久记录 `at=1791209747987` /
   `at=1791209748102`）明确授权「第三处同步：`>= 12` → `>= 10`，并同时纠正过期断言名与补注释」；
   T3 的改动与这条裁决逐字对应（§4.2），队长也已在 **t1 的 append-only evidence note** 里写下
   「该文件是队长写的，冲突由队长负责说明（T7 复核时按此认定，不必计为缺陷）」。
   **结论：以队长追加授权 + T3 实际改动为准；文件正文的旧口径属文档同步时差，不计 P0/P1/REPAIR_NOW。**
   （T7 在 §10.7 再次核对过同一段文字，结论不变。）
4. **`REQUIREMENTS.md` 的小节标题与正文编号差 1**（T1 交付物，文档级）：第 54 行的标题写
   `## 1. 验收契约（AC-01 … AC-31）`，但正文实际有 **32** 个编号（AC-01…AC-32，无缺号 —— 我用
   `REQUIREMENTS.md` 全文正则扫过：`出现过的 AC 编号: 32 个 · 最大 AC-32 · 缺号: 无`）。
   这只影响"标题里那句范围"，**每一条 AC 的判据本身都是完整可执行的**，因此不计 P0/P1/REPAIR_NOW；
   建议 T5 在最终报告里顺手改写标题为 `AC-01 … AC-32`（或注明 AC-32 为追加条目）。

---

## 8. 未验证 / 局限（诚实清单）

1. **`npm ci`（门禁第 1 步）未执行**（详见 §6.5）：它会重装 `node_modules`，与"复核产物"无关且可能破坏本机环境。
   本机 `node_modules` 已就位（`playwright-core 1.63.0` 可解析），其余 48 步全部执行。
   ⚠️ 更正：T4 时写的"playwright chromium 也在"已**不成立** —— T7 实测 `chromium.executablePath()`
   指向的 `ms-playwright\chromium-1243\chrome-win64\chrome.exe` **已不在磁盘上**；真浏览器步骤用的是系统 Edge
   （`verify-site.js` 的默认 `DSH_EDGE` 路径）。这与 §10.2 的第 45/46 步结论直接相关。
2. **门禁第 45 步的 `npx playwright install --with-deps chromium` 未联网执行**：以本机浏览器探测代替（脚本内已注明）。
3. **CI 侧（GitHub Actions）未跑**：本复核对等的是"同一份 action.yml 在本机逐条执行"。真实 runner 的
   差异（`ubuntu` + `--with-deps`、`DSH_EDGE` 覆盖）由 T5 的 PR CI 覆盖，本轮未验证。
4. **`research/audit/**` 等历史未跟踪目录未逐字节复核**（与本轮无关，mtime 早于本轮）。
5. **未做**：在线站点 smoke、`deploy.yml` 路径、PR 必需检查 —— 属 T5 作用域。
6. **M6 的结论未验证**：按队长指示转 `t6`（返工）/ `t7`（绑定复核），本报告只提供原始读数（§5.1）。
7. **`verify-site.js` 在 t4 复核结束后又被 t6 改过**（§6.7 指纹表）：因此"当前工作树的断言清单"与我
   §1–§5 审查的那一版不同；`verify-site.js` 的最终形态与它自己的验收属 t6/t7，不在 t4 判定范围。
8. **attempt 2 直跑 `dist/` 的读数不可用**（§6.6 并发污染）；本报告里凡涉及 t6 版断言的结论，
   都以**快照隔离复验**（`--dir=<快照>`）为准。

---

## 9. 附录

### 9.1 本次复核产出的命令与文件

| 文件 | 用途 |
|---|---|
| `_t4-tmp/t4-gate-runner.js` + `t4-gate/` | 动态读 action.yml 逐条执行（45 passed / 3 bash-block / 1 skipped） |
| `_t4-tmp/t4-gate-bash.js` + `t4-gate-bash/` | 三个 bash 块步骤在 Git Bash 下原样执行（3/3 exit=0，mode=full） |
| `_t4-tmp/t4-measure.js` + `t4-measure-before.json` / `t4-measure-after.json` | 8 档视口真浏览器实测（口径对齐 verify-site） |
| `_t4-tmp/before/` | `git archive HEAD` 复原的 HEAD 全量源码 + `build-local.js --out=dist` 出的 **Before 产物** |
| `_t4-tmp/t4-mutate.js` + `t4-mut/` | M1–M7 只改产物的变异牙原始输出（M6 形态 A 0 项红；M1–M5/M7 真红；全部 byte-exact） |
| `_t4-tmp/t4-mutate-m6r.js` + `t4-mut/M6R.*` | M6 形态 B（`repeat(10,220px)` + `overflow-x:auto`）→ 792/4，越界机制 |
| `_t4-tmp/t4-ancestors.js` + `t4-ancestors.log` | `nav.needs` 祖先链 overflow-x 逐级检查 |
| `_t4-tmp/t4-verify2.js` + `t4-verify2/` | attempt 2 重跑四条 Verify 命令的原始日志与 `summary.json` |
| `_t4-tmp/t4-fingerprints.js` | AC-12 的 14 个冻结指纹重算（14/14 相同） |
| `_t4-tmp/t4-second-copy-scan.js` | 1488 文件"第二份文案"扫描 |
| `_t4-tmp/t4-final-checks.js` | 门禁前后 43 文件逐字节比对 + git diff + `/need/**` 逐文件 sha256 |
| `_t4-tmp/t4-head-verify.js` | 用 HEAD 版断言复现"776 项 / 8 红"（8 条逐条点名见 §6.4） |
| `_t4-tmp/t4-grid-overflow-probe.js` | 干净产物上 `.need-grid` 的计算 `overflow-x` 探针（= `visible`，§6.6） |
| `_t4-tmp/t4-dist-snapshot/` + `t4-verify-snapshot.json` | `dist/` 的**不可变快照** + 用它做的隔离复验（t6 版断言 798/0） |
| `_t4-tmp/t4-evidence-final.js` + `t4-evidence-final.log` | attempt 3 重建 After/Before 并重测（修正 `--json` 路径 bug），数字逐项复现 |
| `_t4-tmp/t4-live-dist-diff.txt` | 盘上 `dist/` 与「从被评审源码重建」的逐行差异（§6.8 的 18 字节变异） |
| `_t4-tmp/t4-generated-trees.manifest.json` | 两棵生成树的指纹与体积（树已删，命令可复算） |

**T7（§10）新增的脚本与证据**（同一目录）：

| 文件 | 用途 |
|---|---|
| `_t4-tmp/t7-gate-runner.js` + `t7-gate/` | 动态读 action.yml 逐条执行（45 passed / 3 bash-block / 1 skipped，196.3s） |
| `_t4-tmp/t7-gate-bash.js` + `t7-gate-bash/` | 第 45/46/49 步在 Git Bash 下原样执行（代入值见 §10.2） |
| `_t4-tmp/t7-step46.js` + `t7-step46.log` | 第 46 步在「本机无 playwright 内核」与「有系统 Edge」两种情形下的对照（exit 1/mode=none vs exit 0/mode=full） |
| `_t4-tmp/t7-verify.json` | 现盘断言集的一次完整 run（798 项 0 失败），用于零削弱对账 |
| `_t4-tmp/t7-assertion-audit.js` + 输出 | T3 的 792 项 vs 现盘 798 项逐条对账（+6 / −0 / ok 变化 0 / detail 变化 0） |
| `_t4-tmp/t7-mutate.js` + `t7-mut/` | 修复后断言集上的 M6a/M6b/M1/M4/M7（每条 byte-exact 还原） |
| `_t4-tmp/t7-mut-M6c.js` + `t7-mut/M6c.*` | 形态 C（10×220px）：4 条几何红仍在 + 6 条新断言红 = 10 |
| `_t4-tmp/t7-reconstruct-t3.js` + `t7-reconstruct-report.txt` | 用 T3 自己留下的 diff 重建其 22:26 快照并比对（旁证：T3 在最终 run 前修掉了 `items[0]` 解引用那次崩溃） |

### 9.2 本次复核对代码/数据的改动 = 0

- 被评审文件（`index.html` / `scripts/**` / 4 个根数据 JSON / 两份基线）**一个字节都没改**
  （T4 复核前 = 复核后的 `git diff --stat` 逐字相同；T6 之后 `verify-site.js` 又 +26 行，
  现为 **7 个文件、517 insertions / 214 deletions** —— 那 +26 行是 t6 的作用域，不是我的改动）；
- 变异只作用于 `dist/index.html`（gitignore 的构建产物），每条都已 byte-exact 还原；
- 新增文件全部落在 in-scope 的 `research/_raw/home-topic-entry-cards-v1/` 下（含 `_t4-tmp/`）。
- 一处**我自己的工具失误已清理**：attempt 1 里我跑 `t4-measure.js --json==research\…` 时多打了一个 `=`，
  于是在仓库根建了个名字叫 `=research/` 的目录（内含 2 个 JSON）。它只挂在我自己的 `git status` 里、
  不是任何人的产物，**已按绝对路径确认后删除**（`Remove-Item -LiteralPath 'D:\…\AI Page\=research'`），
  清理后 `git status --porcelain` 只剩 §1 那 7 个改动 + 既有未跟踪目录。

---

# 10. T7 绑定复核（本报告第 2 次 review attempt 产出）— **最终 verdict**

> **本节是绑定最终交付 verdict 的那一次复核**（`t7`，attempt 2）。审查对象 = **T6 的修复**（`verify-site.js`
> 响应式循环新增 6 条「`.needs` 与 `.need-grid` 都不是横向滚动容器」直接断言）+ T4 已审过的全部内容。
> 本报告由 **T4（attempt 2/3）** 与 **T7（attempt 2）** 两次 attempt 共同产出：§1–§9 是 T4 的工作与证据
> （其中 §5 的 M6 表述已按 T7 要求更正，见 §10.7），§10 是 T7 在 T6 修复后重跑的全部读数。

## 10.0 复核对象：哪个 commit / 哪个 sha256 的产物

| 项 | 值 |
|---|---|
| 源码 commit | `4927fe3`（Merge pull request #43）—— 本轮全部改动都是未提交的工作树改动 |
| **被测产物** | `dist/index.html` = **`8076370E3C7AF29A3C3B6289A57B3B0C673DA033CD1CC8432CFA7FA7652E5242`**（frozen；由 `build-local.js` 重建得到，与 T3 交出、与 T7 起点逐字节相同） |
| `scripts/tools/verify-site.js`（T6 最终版） | `D5125C580A951D135C90BFA74C98241C218782FB1C7C31F8D57CC22F9D88EBAE` |
| `index.html` / `audience.js` / `build-local.js` / `audience-selftest.js` | `52388FD7F9BC4DE4…` / `CDC43A685596DB02…` / `75170C7F0CB5AF1A…` / `998CDD483D521F07…`（与 T4 审的同一版，逐字节未变） |
| 两份基线 | `verify.json` `8E95964387683201…` · `verify-pre-fold.json` `8C8316842B99CED1…` |
| `git diff --stat` | 7 files, **517 insertions(+) / 214 deletions(−)** |
| 注入指纹 | `overflow-x:auto;` 在 `dist/index.html` / `index.html` / `scripts/` 均 **0 处**（我自己 grep 过） |
| 断言项数 | verify-site **798**（T3 版是 792）· `--compare` **804**（T3 版是 798） |

## 10.1 三条阈值同步与两份基线（重新独立验证，不复述 T4）

**（a）两份基线：仍然只动 `firstScreenFull` 一个字段**

```
$ node <JSON 级逐字段比对>（HEAD vs 现盘）
research/_raw/ours-baseline/verify.json          字段数 23 · 变化 1 · metrics.firstScreenFull : 9 -> 6 · numstat 1/1 · hunk 数 1
research/_raw/ours-baseline/verify-pre-fold.json 字段数 23 · 变化 1 · metrics.firstScreenFull : 9 -> 6 · numstat 1/1 · hunk 数 1
```

**（b）阈值仍**严格等于**实测值，且两个读数都还在打印（原文来自 T7 门禁第 47 步日志）**

```
✓ 首屏完整可见卡片 ≥ 6 — 完整 6 张 / 含截断 9 张 · 网格起点 349px · 页高 4787px
✓ 列表视图：首屏完整可见 ≥ 10 行 — 10 行（行高 46px · 共 50 行 · 页高 3567px）；卡片视图同口径 6 张
```

源码侧（我自己在现盘上抓的）：`check('首屏完整可见卡片 ≥ 6', rendered.firstScreenFull >= 6, …)`
与 `check('列表视图：首屏完整可见 ≥ 10 行', rowsView.visible >= 10, …)`；detail 模板分别仍是
`` `完整 ${rendered.firstScreenFull} 张 / 含截断 ${rendered.firstScreenPart} 张 …` `` 与
`` `${rowsView.visible} 行（行高 …）；…卡片视图同口径 ${rendered.firstScreenFull} 张` `` —— **阈值 = 实测值（6 / 10），
不是取更宽松的整数；反向边界（顶部再加 ≥47px 条带即重新变红）由 T4 §4.2 记录**。

**（c）「零削弱」我自己重做了一遍（不看 T6 的机器对账）**：把 T3 的最终 run artifact（`t3-verify-after.json`，792 项）
与我在现盘上重跑出的（`_t4-tmp/t7-verify.json`，798 项）逐条比对：

```
T3 版：792 项 / 失败 0 · 现盘：798 项 / 失败 0
A) 名字集合：新增 6 条 / 消失 0 条        ← 新增的 6 条就是那 6 档新断言，逐条点名见 t7-assertion-audit.log
B) 共有断言：792 条 · ok 变化 0 条 · detail 变化 0 条 · 在 T3 清单里但现盘找不到 0 条
   （detail 比对前把 127.0.0.1:<随机端口> 归一化成 PORT）
```

⇒ **792 条一条没少、判据/detail 模板一条没动**，新增的 6 条只加不减。`--compare` 的 6 个比较项
（`coveredDeals/cards/firstScreenFull/pageHeight(+15%)/externalRequests/jsErrors`）与 T4 §4.1 记录一致，未动。

## 10.2 当前 Full Gate（**动态读清单**，不写死历史项数）

清单来源（现读）：`package.json` 94 个 scripts（含 25 个 `selftest:*`）· `.github/actions/gate/action.yml`
**49 步** · `.github/workflows/` 5 个（`verify.yml` 的 `gate` job = 第 125 行 `check-ci-consistency --expect-checks=38`
+ 第 129 行 `uses: ./.github/actions/gate`）。`check-ci-consistency` 第 (10) 条自证「action.yml 49 步名字序列 /
run 体指纹全过」⇒ 清单没多没少。

逐条执行结果（`_t4-tmp/t7-gate-runner.js`，命令原样跑 `run:`）：

```
=== gate: 45 passed / 3 failed / 1 skipped (of 49 steps, 196.3s) ===
```

- 3 个 "failed" 是**多行 bash 块**（第 45/46/49 步）在 cmd 下被 `| was unexpected at this time` 打断，
  **不是产物断言失败**（T7 用 Git Bash 重跑了这三步，见下）。
- 关键步骤原始输出（`_t4-tmp/t7-gate/<nn>-*.log`）：`02 validate --strict` ✅ · `16 audience-selftest` ✅
  `受众字段自测：197 项通过，0 项失败` · `34 build-local` ✅ `产物自检通过 / 构建完成 → dist/` ·
  `40 analytics-selftest` ✅ `分析门禁 31 项，失败 0 项` · `41 feeds-reproducible` ✅ 逐字节一致 ·
  `44 seo-verify` ✅ 11 项 0 失败 · **`47 verify-site` ✅ `验收 798 项，失败 0 项`（76.0s）** ·
  **`48 verify-site --compare` ✅ `验收 804 项，失败 0 项`（75.2s）**。
- `node scripts/tools/check-ci-consistency.js --expect-checks=38` → **`✅ CI 口径检查 38 项，失败 0 项`**（exit 0）。

**多行 bash 块：代入值写清（原样跑出来的结论照实报）**

| 表达式 | 代入值 |
|---|---|
| `${{ inputs.allow_degraded_run }}` | `false`（`verify.yml` 的 `allow_degraded_run: ${{ inputs.allow_degraded_run && 'true' \|\| 'false' }}`，PR/push 一律 false） |
| `${{ steps.browser.outputs.browser_available }}` / `…executable }}` | **第 45 步自己写进 `$GITHUB_OUTPUT` 的值**（先跑 45 再喂给 46，不是硬编码） |
| `${{ steps.decision.outputs.mode }}` | **第 46 步自己写出的值**（先跑 46 再喂给 49） |
| `${{ github.event_name }}` / `${{ github.ref }}` | `pull_request` / `refs/pull/t4-review/merge`（只进 Summary 文案，不参与判定） |

第 45 步的原始输出（**本地环境事实，照实记录**）：

```
[45] Prepare browser for the real-browser gate → exit=0 · outputs={"browser_available":"false","executable":""}
```

原因（我自己查的）：`require('playwright-core').chromium.executablePath()` 仍返回
`C:\Users\…\ms-playwright\chromium-1243\chrome-win64\chrome.exe`，但该文件**已不在磁盘上**（T4 时还在）。
于是第 45 步在 Linux runner 的候选清单（chromium / `/usr/bin/microsoft-edge` / `google-chrome` / …）里
一个都没命中 —— 注意那串候选**不含 Windows 的 Edge 路径**，所以这一步在 Windows 上测的是"playwright 内核在不在"。
第 46 步因此在两种本机情形下各跑一次（脚本逐字不动，只代入上表的值）：

```
[46 A-原样(chromium 缺失)] 代入 browser_available=false executable=(空) → exit=1 · mode=none
[46 B-等价CI(有系统 Edge)] 代入 browser_available=true  executable=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe → exit=0 · mode=full
```

- **情形 A 是"本机没有 playwright 内核"的如实结果**（`mode=none`、exit 1）；CI 上第 45 步会先
  `npx playwright install chromium`，所以 A **不可外推到 CI**。
- **情形 B** 等价于「runner 上有系统浏览器」的分支 ⇒ `mode=full`、exit 0；而门禁第 47/48 步**真的用系统 Edge 跑了**
  （`verify-site.js` 默认 `DSH_EDGE` 指向 Edge），798 / 804 项全绿 —— 也就是说"真浏览器验收确实执行了"这句话
  **有第 47/48 步的原始输出支撑**，不是靠第 46 步的 exit code 推的。
- 第 49 步（结论落盘，`if: always()`）exit 0。

**第 1 步 `npm ci` 未执行 —— 如实记为未执行，不计入绿。** 理由：它删库重装（联网），属环境准备而非对 HEAD 产物的断言；
替代证据只有"依赖可解析"（`playwright-core 1.63.0`），**不冒充"npm ci 已过"**。

⇒ **Full Gate 的准确表述（T7）：48/49 步在本机 exit=0；第 1 步 `npm ci` 未执行；第 45/46 步是 CI 环境判定，
本机情形 A 下为 exit 1/mode=none（环境事实），情形 B（有系统浏览器）下为 exit 0/mode=full，且第 47/48 步
确实用系统 Edge 跑完 798/804 项全绿。**

## 10.3 M6 缺口的独立确认：新断言抓的是「机制」不是「溢出副作用」

**（a）形态 A（只给基础 `.need-grid` 规则追加 `overflow-x:auto;`，anchors=1）—— 修复后：**

```
M6a  appliedSha=59283A6909731F74 · verify-site exit=1 · 798 项 / 失败 6 项 · 还原 byte-exact=true
     预期关键字 ["都不是横向滚动容器"] 命中=true · 期望失败数=6 实际=6
     几何类断言变红 0 条（「每张卡都在视口内」「.needs 不是横滑容器/卡片没被裁」「1440 轨道数==5」全绿）
     ✗ 专题导航卡 1440px：.needs 与 .need-grid 都不是横向滚动容器 — .needs overflow-x=visible · .need-grid overflow-x=auto ·
       scrollWidth/clientWidth：needs 1420/1420 · grid 1380/1380     ← 零溢出，但已是滚动容器 → 仍然红
```

**（b）形态 B（给全部四条 `.need-grid` 规则各追加同一声明，anchors=4）—— 修复后：**

```
M6b  appliedSha=A31B19B06CF80678 · verify-site exit=1 · 798 项 / 失败 6 项 · 还原 byte-exact=true
     6 档全部红在新断言上；几何类 0 条
```

（说明：我的 M6b `appliedSha` 与 T6 记录的不同，是因为**注入文本的写法不同**（我在每条纹末尾追加 `; overflow-x:auto;`），
但 anchors 都是 4、结果都是 798/失败 6 —— 形态一致、字节不必一致。）

**（c）形态 C（基础规则整条替换成 `repeat(10, 220px)` + `overflow-x:auto`，anchors=1）—— 旧机制没有被削弱：**

```
M6c  appliedSha=9A744FBDDD6B8CF0 · verify-site exit=1 · 798 项 / 失败 10 项 · 还原 byte-exact=true
     几何（越界/轨道）红 4 条（**与 T4 在 792 项集上量到的 4 条完全同款**）· 新断言红 6 条 · 合计 10
     ✗ 1440px：每张卡都在视口内… — 6/10 张在视口内 · right 2338（视口 1440）· 1 行（10）
     ✗ 1440px：.need-grid 轨道数 == 5 — 10 条轨道 · 1 行
     ✗ 1440px：.needs 与 .need-grid 都不是横向滚动容器 — .need-grid overflow-x=auto · grid **2308/1380**（真溢出）
```

⇒ **结论**：t6 的新断言在"容器成了滚动条但零溢出"（形态 A/B）时也红 ⇒ **抓的是机制**；
而旧的越界机制（形态 C 的 4 条几何红）**一条没少**。**T4 的 finding 关闭。**

## 10.4 M1 / M4 / M6 / M7 在**修复后的断言集**上复跑（我自己的判据）

| 变异 | appliedSha | verify-site | 结果 | 红的仍是那条断言 | 还原 |
|---|---|---|---|---|---|
| **M1**（第一张卡挂 `data-facet="x"`） | `3569958027D778AE` | exit 1 · 798 / **失败 3** | 语义隔离 + 零 JS 控件 + `筛选按钮逐个带 aria-pressed`（13/14） | ✅ | byte-exact |
| **M4**（10 张卡 `<a>`→`<button>`） | `38AAB187E95168F5` | exit 1 · 798 / **失败 17** | 卡数/每张 `<a>`/逐条对账/四件套/零 JS 控件/漏项/真点卡… | ✅ | byte-exact |
| **M6a** | `59283A6909731F74` | exit 1 · 798 / **失败 6** | 只有新断言（6 档） | ✅ | byte-exact |
| **M6b** | `A31B19B06CF80678` | exit 1 · 798 / **失败 6** | 只有新断言（6 档） | ✅ | byte-exact |
| **M6c** | `9A744FBDDD6B8CF0` | exit 1 · 798 / **失败 10** | 4 条几何 + 6 条新断言 | ✅ | byte-exact |
| **M7**（第一张卡 href 指向不存在 slug） | `197ACA721BB12226` | exit 1 · 798 / **失败 4** | 逐条对账 + 数字 ≠ + 漏项 + 真点卡（第 1 张） | ✅ | byte-exact |

（我的 M7 是 4 条而 T6 报 3 条：**我改的是第 1 张卡**，于是「真点第 1 张卡」那条也红了；T6 改的是第 8 张。
数字差异来自取样位置，不是判据差异。）

**6 条变异全部 byte-exact 还原**：每次还原后 `dist/index.html` sha256 回到
`8076370E3C7AF29A3C3B6289A57B3B0C673DA033CD1CC8432CFA7FA7652E5242`；脚本里逐条 assert（`t7-mut/summary.json`
与 `t7-mut/M6c.summary.json`）。源码文件全程未被我改动，`git diff --stat` 复核前后逐字相同（7 files, 517+/214−）。

## 10.5 T7 的其他独立抽查

- `node scripts/tools/audience-selftest.js` → **`✅ 受众字段自测：197 项通过，0 项失败`**（门禁第 16 步同一读数）。
- 产物无横向滚动的事实（8 档视口 + 祖先链）在 T4 §2.5 已测；**这次门禁第 47 步在 6 档又把新断言逐档打绿**
  （`.needs overflow-x=visible · .need-grid overflow-x=visible`，见 10.2 与 `t7-gate/47-*.log`）。

## 10.6 最终判定（**绑定**）

| 项 | 计数 | 依据 |
|---|---|---|
| **P0** | **0** | 无产物错误 / 数据损坏 / 无 JS 不可用 / 死链 / 范围外改动（T4 §1–§2 + T7 §10.2 门禁全绿） |
| **P1** | **0** | 无验收条目未满足 / 断言放水 / 基线被放宽（T7 §10.1 独立重做：+6/−0、792 共有断言的 ok 与 detail 全同、阈值 = 实测值 6/10） |
| **REPAIR_NOW** | **0** | M6 缺口已由 t6 修复并经 T7 变异独立确认关闭（§10.3）；两处文档级观察（§7.1.3 / §7.1.4）不影响任何 AC 判据 |

**verdict = pass**（审查对象：commit `4927fe3` 的工作树 + 产物 `dist/index.html` `8076370E…` +
`verify-site.js` `D5125C58…`）。

**未验证（不得读成通过）**：`npm ci`（门禁第 1 步）未执行 · 门禁第 45 步的 `npx playwright install` 未联网执行 ·
第 46 步在本机情形 A 下为 `exit 1 / mode=none`（环境事实；情形 B 为 exit 0 / mode=full）·
CI 真 runner（ubuntu + `--with-deps`）未跑，属 T5 · T7 未重复跑首屏密度实机测量（沿用 T4 §3 的真构建读数，
本轮只复核了阈值与实测值的一致性）。

## 10.7 本次修订（按 t7 契约逐条）

1. **§5 的 M6 三形态已分清**：A（只注入基础规则，anchors=1）· B（注入全部四条，anchors=4）· C（基础规则整条换成
   10×220px）。并明确写清：**C 的 4 条红是「固定宽轨道 ⇒ 真实横向溢出 ⇒ 卡片越界」机制**，
   "媒体查询覆盖基础规则"只是"哪些档会红"的解释，**不是红的机制**（§5.1）。
   旧的「M6R」一名已废弃，避免与 T6 的 M6b 混淆。
2. **本报告的 attempt 归属已写明**：§1–§9 = T4（attempt 2/3），§10 = T7（attempt 2，最终 verdict 在这里）。
3. **`CAPTAIN-CORRECTIONS.md` 的说法按实际文件内容更正**（§7.1.3）：逐字引用第 88–89 行原文，
   说明该文件**至今未被回填更正**、旧口径已被队长后续授权（邮箱记录）与 t1 的 append-only evidence note 取代，
   按队长口径**不计为缺陷**；同时更正了编号（原文写的 §9.3 不存在，实为 §7.1.3）。
4. **§6.7 的版本指纹已更新**：`verify-site.js` 从 T4 记录的中途版本改为 T6 最终版 `D5125C58…`（798 项 / 804 项）。
5. **§8 的第 1 条已更正**：T4 写的"playwright chromium 也在"已不成立（T7 实测该二进制不在磁盘上），
   真浏览器步骤用的是系统 Edge。
6. **§0 / §7 已加指针**：明确 §10.6 才是最终 verdict，§7 只是 T4 的历史判定。
7. **仓库根的两份非我产出的文件**（`_t7_head_verify.json` / `_t7_head_prefold.json`，UTF-16LE，
   mtime 2026-10-06 10:41:55，内容是 `ours-baseline` 两份基线的副本：total 181/55、failed 0）
   不在我的证据目录里，也**不是我生成的**；建议 T5 在 `git add` 前处理掉，别把它们带进 PR。

