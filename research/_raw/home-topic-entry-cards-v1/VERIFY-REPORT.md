# T3 验证报告：首页「按需求找优惠」Topic Entry Card

- 团队 `home-topic-entry-cards-v1` · 任务 `t2`（kind = verification, round 1）· 执行者 **verifier** · attempt `b5dd0150-c733-44df-aa57-02a986c218a0`
- 被测对象：`dist/`（实现者用最新源码重建，T3 先 `build-local.js` 复建并确认逐位相同）
- 判据来源：T1 的 `REQUIREMENTS.md`（AC-01…AC-32）+ T3 任务契约 + captain 2026-10-05 的三条决定（含**追加授权** `:2693`）
- 时间：2026-10-05（本机 Asia/Shanghai）
- 结论：**通过**（0 个 P0/P1 缺口；1 条已披露、已被队长明确接受的手机端退步，见 §12）

---

## 0. 一页结论

| 验收项 | 实测 | 结论 |
|---|---|---|
| `verify-site.js` §15b2 按新结构等价重写（注册表对账 / 语义隔离 / 四件套 / 数字口径） | 新增 22 条断言，全部绿 | ✅ |
| 真实点击导航（≥3 张卡 `page.click`） | **10/10** 张卡点通：HTTP 200 + 落地 `/need/<slug>/` + h1 与注册项逐字相同 | ✅ |
| 响应式 1600/1440/1280/768/430/390 逐张矩形 | 6 档全部「在视口内 / 无重叠 / 页面零横向溢出」；1440 轨道数 = 5 | ✅ |
| 无 JS | 10 张卡的 href/标题/说明与有 JS **逐条相同**（JSON 全等） | ✅ |
| 首屏阈值与基线同步（3 处） | `:263` ≥9→≥6 · `:2693` ≥12→≥10 · 两份基线只改 `firstScreenFull` 一行 | ✅ |
| M1–M7 变异真红 | 7/7 真红，每条只改一处，命中数逐一校验；还原 byte-exact（sha256 相等） | ✅ |
| 首屏密度 Before/After | 本块 31→153px · 网格起点 227→349px · 完整 9→6 张 · 含截断 9→9 · slack 1→119px · 页高 4665→4787px | ✅（已披露的密度下降） |
| 数据层零漂移 | `git diff -- deals.json plans.json api-plans.json models.json scripts/data` 空输出 + 17 个数据/产物文件 sha256 前后一致（其中 8 个与 T1 冻结表逐位相同） | ✅ |
| `check-mobile-chrome.js` @390px | nav.needs clipped 0 · outOfViewport 0 · overflowX visible | ✅ |
| 门禁口径不变 | `check-ci-consistency` 38 项 0 失败；`.github/` `package.json` `FROZEN_ASSERTION_NAMES` 零改动 | ✅ |

**四条 Verify 命令**：`build-local.js` exit 0 · `verify-site.js` **792 项 0 失败** exit 0 · `verify-site.js --compare=…/verify.json` **798 项 0 失败** exit 0 · `audience-selftest.js` 197 项 0 失败 exit 0。

---

## 1. T3 改了什么（只动作用域内 3 个文件）

| 文件 | 改动 | git diff |
|---|---|---|
| `scripts/tools/verify-site.js` | §15b2 按新结构等价重写（删 4 个调用点、新增 22 条断言、4 条判据加强）+ 三处首屏阈值同步 | `252 insertions(+), 84 deletions(-)` |
| `research/_raw/ours-baseline/verify.json` | `firstScreenFull: 9 → 6`（**唯一**变化字段） | 1 行 |
| `research/_raw/ours-baseline/verify-pre-fold.json` | 同上 | 1 行 |

证据目录新增（`research/_raw/home-topic-entry-cards-v1/`）：
`t3-verify-pre-fix.{json,log}`（改断言之**前**的原始红）、`t3-verify-after.{json,log}`（改完之后的全绿）、
`t3-geometry.{js,json,log}`（首屏密度/6 档几何/无 JS/真实点击）、`t3-attribution.{js,json}`（归因实验）、
`t3-mutate.js` + `t3-mut-M{1..7}.{apply.json,json,log,restore.log}` + `t3-mutations.json` + `t3-mutations-run.log`（变异牙）、
`t3-baseline-patch.js`（基线同步脚本，逐行自证「只改 1 行」）、`t3-selftest.log`、`t3-build.log`。

**未触碰**（列出以便复核）：`scripts/lib/audience.js`、`scripts/tools/build-local.js`、`index.html`、
`scripts/tools/audience-selftest.js`、`scripts/tools/check-mobile-chrome.js`、`package.json`、`.github/**`、`NEED_PREDICATES`、
`deals.json` / `plans.json` / `api-plans.json` / `models.json`。

---

### 1.1 四条 Verify 命令实测（commandsRun 的原始读数）

| # | 命令 | 退出码 | 耗时 | 关键输出 |
|---|---|---|---|---|
| 1 | `node scripts/tools/build-local.js` | **0** | 3.3s | `✅ 产物自检通过` / `✅ 构建完成 → dist/（自检全过，已从暂存目录就位）`；构建**确定性**：rebuild 前后 `dist/index.html` sha256 同为 `8076370E3C7A…` |
| 2 | `node scripts/tools/verify-site.js --json=…/t3-verify-after.json` | **0** | 78.0s | `✅ 验收 792 项，失败 0 项`（改断言之**前**同一命令：`❌ 验收 776 项，失败 8 项`，见 §2.1） |
| 3 | `node scripts/tools/verify-site.js --compare=research/_raw/ours-baseline/verify.json` | **0** | 76.5s | `✅ 验收 798 项，失败 0 项`；6 条回归全绿：覆盖 80→80 · 卡片 50→50 · **首屏完整可见 6→6** · 页高 4589→4787（容差内）· 外部请求 0→0 · JS 错误 0 |
| 4 | `node scripts/tools/audience-selftest.js` | **0** | —（秒级，未计时） | `✅ 受众字段自测：197 项通过，0 项失败`（`HEAD` 版同一份注册表 = 191 项，⇒ 新增 6 条） |

> 契约里写的 `scripts/tools/validate.js` **不存在**（实测 `Cannot find module`），真实路径是 `scripts/validate.js` —— 按队长口径，
> T3 的 Verify 清单里也没有它，故未执行；`audience-selftest.js` 与 `verify-site.js` 已覆盖同源判据。

---

## 2. §15b2 重写明细（断言级，可逐条复核）

### 2.1 删除的 4 个调用点（运行时 **−6** 条）——判据在新结构里**不存在**

| 断言名（源码原文） | 原位置 | 运行时条数 | 为什么必须删 |
|---|---|---|---|
| `每条入口都同时带全称与窄屏短标签（CSS 切换，无 JS 也生效）` | `:2321` | 1 | 判据是「每张卡同时有 `.nl-full` 与 `.nl-short`」——新结构没有两套标签，**不可能为真** |
| `桌面端入口显示的是全称、不是缩写` | `:2324` | 1 | 没有两套 span 就没有「当前显示的是哪一个」 |
| `按需求入口 {390,360}px：切到了窄屏短标签（每枚都有可见文字）` | `:2456` | 2 | selector `.nl-full, .nl-short` 已不存在（`querySelectorAll` 返回空集 ⇒ 恒假） |
| `按需求入口 {390,360}px：每组两列排布，没有幽灵行、没有被拉高` | `:2477` | 2 | 量的是 `.nlinks` × 2 组 × `perRow=[2,2,1]`——新结构是整卡网格，`.nlinks` 已删（AC-20） |

删除前的原始红（`t3-verify-pre-fix.log`，与实现者报告逐字一致）：

```
✗ 每条入口都同时带全称与窄屏短标签（CSS 切换，无 JS 也生效） — 0/10 条两套齐全 · 全称「」/ 短「」
✗ 桌面端入口显示的是全称、不是缩写 — need/student-only/ 显示「🎓学生专享12学生套餐与教育折扣，附申请门槛→」 · …
✗ 按需求入口 390px：切到了窄屏短标签（每枚都有可见文字） — 10 枚无文字 · 标签「|||||||||」
✗ 按需求入口 390px：每组两列排布，没有幽灵行、没有被拉高 — 0 组 ·  · 整块 758px
✗ 按需求入口 360px：切到了窄屏短标签（每枚都有可见文字） — 10 枚无文字 · 标签「|||||||||」
✗ 按需求入口 360px：每组两列排布，没有幽灵行、没有被拉高 — 0 组 ·  · 整块 758px
```

### 2.2 新增的 22 条断言（全部真浏览器、期望值全部取自注册表 `NEED_PAGES`）

| # | 断言名 | 判据 |
|---|---|---|
| 1 | `首页专题导航卡：卡数 == NEED_PAGES.length（按注册表现算，不写死条数）` | `.need-card` 数 === `require('./scripts/lib/audience.js').NEED_PAGES.length`（断言里**没有字面量 10**） |
| 2 | `首页专题导航卡：逐条 label / href 与 NEED_PAGES 对账不错位（顺序一致）` | 第 i 张卡的 `<strong>` 文本 === `NEED_PAGES[i].label`，`href` === `need/${slug}/`，错位 1 条即红 |
| 3 | `首页专题导航卡：与筛选器语义隔离（nav.needs 内 [data-facet] / [aria-pressed] / [role="button"] 计数为 0）` | 三类标记合计 0 |
| 4 | `首页专题导航卡：每张卡四件套齐全（need-icon / 非空 strong / 非空 small / need-arrow）` | 四件套各命中**恰好 1 个**且文本非空；图标/箭头 `aria-hidden="true"` |
| 5 | `首页专题导航卡：数据里每个需求都有对应入口（没有漏项、href 不重复）` | href 反向对账（漏项 / 重复都红） |
| 6–8 | `首页专题导航卡：真点第 1/6/10 张卡「…」→ /need/<slug>/（HTTP 200 · h1 与注册项一致）` | `page.click` 真点 + `waitForResponse` 取 HTTP 状态 + 落地 URL + h1 === `NEED_PAGES[i].heading` |
| 9–14 | `专题导航卡 {1600,1440,1280,768,430,390}px：每张卡都在视口内、无重叠、页面零横向溢出（逐张量矩形）` | 每张卡 `getBoundingClientRect()`：`left≥−0.5 && right≤innerWidth+1 && w>0 && h>0`；两两矩形不相交；`documentElement.scrollWidth − clientWidth === 0` |
| 15–20 | `专题导航卡 {…}px：.needs 不是横向滚动容器、卡片没有被裁` | `overflow-x ∉ {auto, scroll}` ∧ `nav.scrollWidth ≤ clientWidth+1` ∧ 单卡 `scrollWidth ≤ clientWidth+1` |
| 21 | `专题导航卡 1440px：.need-grid 轨道数 == 5，10 张排成 5×2（不再 10 张挤一行）` | `getComputedStyle(grid).gridTemplateColumns` 轨道数 === 5 ∧ 2 行 ∧ `perRow=[5,5]` |
| 22 | `无 JS 打开首页：专题导航卡的卡数 / 标题 / 说明 / href 与有 JS 时逐条相同（构建期注入）` | `javaScriptEnabled:false` 的 `[{href,label,desc}]` 与有 JS 的 **JSON 全等** |

### 2.3 保留并加强的 4 条（判据不变 / 只扩选择器）

| 断言名 | 处理 |
|---|---|
| `首页有「按需求找优惠」入口行，且每条都是 <a>（无 JS 也能点）` | **加强**：加「`class` 含 `need-card`」与「卡内零嵌套可点元素（`a, button, input, select, [role=button]`）」 |
| `入口行里没有任何 JS 控件（无 JS 时不给可点暗示）` | **加强**：`button, input, select` → 追加 `[data-facet], [aria-pressed], [role="button"]`，并加「7 个旧 chip 类零残留」 |
| `首页每条入口的数字 == 数据里该需求的条数` | **判据不动**；口径仍是 `dist/deals.json` 里 `type === 'deal'` 过滤后的条数（实测 12/7/1/30/60/45/44/4/12/67） |
| `按需求入口 {390,360}px：全部入口在视口内、不被裁、页面不横向溢出` | **判据不动**；只把选择器从 `.nl-full/.nlinks` 换成 `a.need-card`（原始判据 `clipped===0 && visible===total && overflowX===0` 逐字保留） |
| `无 JS 打开首页时「按需求找优惠」入口行仍在且指向需求页` | **判据不动** |

**条数对账**：`776 − 6 + 22 = 792`（改前实测 `776 项 / 失败 8 项`；改后实测 `792 项 / 失败 0 项`）。

---

## 3. 三处首屏阈值与基线的同步（含「为什么不是放松」）

### 3.1 `verify-site.js:263`（T1 授权，AC-31）

```diff
-  check('首屏完整可见卡片 ≥ 9', rendered.firstScreenFull >= 9,
+  check('首屏完整可见卡片 ≥ 6', rendered.firstScreenFull >= 6,
     `完整 ${rendered.firstScreenFull} 张 / 含截断 ${rendered.firstScreenPart} 张 · 网格起点 ${rendered.gridTop}px · 页高 ${rendered.pageHeight}px`);
```
「完整 / 含截断」两个读数**都保留**在同一行 detail 里（改后实测：`完整 6 张 / 含截断 9 张 · 网格起点 349px · 页高 4787px`）。

### 3.2 `verify-site.js:2693`（**队长 2026-10-05 追加授权**）

```diff
-  check('列表视图：首屏完整可见 ≥ 12 行（实测 13，卡片视图 9）', rowsView.visible >= 12,
+  check('列表视图：首屏完整可见 ≥ 10 行', rowsView.visible >= 10,
```
- 断言名里过期的「实测 13」已改；名字里**不再写死卡片视图数字**（那个由 detail 动态打印 `rendered.firstScreenFull`）。
- 为什么这不是放松：它与 `:263` 是同一笔账（同一段固定顶部），实测阈值仍**严格等于**实测值 10；顶部再加任何一条新的独立条带（哪怕 47px）都会让它再红一次。
- 归因实验（**T3 自己跑的**，`t3-attribution.js/.json`：运行时把 `nav.needs` 压回 31px、不改任何文件）见 §10。

### 3.3 两份基线（**只动 `firstScreenFull` 一个字段**）

`t3-baseline-patch.js` 逐行自证（不是嘴上说）：替换前断言 `"firstScreenFull": 9,` **恰好 1 行**，替换后逐行比对**只有第 13 行**变化，其余 926 / 27 行逐字节未变。

```
✓ research/_raw/ours-baseline/verify.json
   第 13 行（唯一变化行）：
     - "firstScreenFull": 9,
     + "firstScreenFull": 6,
   其余 926 行逐字节未变
✓ research/_raw/ours-baseline/verify-pre-fold.json
   第 13 行（唯一变化行）：
     - "firstScreenFull": 9,
     + "firstScreenFull": 6,
   其余 27 行逐字节未变
```

`git diff` 原始输出（`generatedAt` / `target` / `cards` / `coveredDeals` / `firstScreenPart` / `gridTop` / `pageHeight` 全部原值）：

```diff
diff --git a/research/_raw/ours-baseline/verify-pre-fold.json b/research/_raw/ours-baseline/verify-pre-fold.json
@@ -10,7 +10,7 @@
     "tileKeys": 32,
     "cardHeight": 192,
-    "firstScreenFull": 9,
+    "firstScreenFull": 6,
     "firstScreenPart": 12,
     "gridTop": 160,
     "pageHeight": 5334,
diff --git a/research/_raw/ours-baseline/verify.json b/research/_raw/ours-baseline/verify.json
@@ -10,7 +10,7 @@
     "tileKeys": 32,
     "cardHeight": 192,
-    "firstScreenFull": 9,
+    "firstScreenFull": 6,
     "firstScreenPart": 12,
     "gridTop": 196,
     "pageHeight": 4589,
```

**性质声明（写进提交信息）**：这是**记录一次已披露的密度下降**，不是把基线放宽到看不见回归 ——
`firstScreenFull` 的语义（「首屏完整可见卡数」）没变，变的只是被本轮结构性改动打下来的那 3 张；
`:6254` 的 `回归：首屏完整可见不减少`（`>= num(ref.firstScreenFull)`）判据一字未改，改后 `6 >= 6` 通过。

---

## 4. §15b2 新断言的实测原始输出（`t3-verify-after.log`，逐字）

```
=== 15b2) 按需求找优惠：入口行与十条静态落地页 ===
  ✓ 首页专题导航卡：卡数 == NEED_PAGES.length（按注册表现算，不写死条数） — 10 张卡 / 注册表 10 条需求 · dist/deals.json 里 10 个需求有命中
  ✓ 首页有「按需求找优惠」入口行，且每条都是 <a>（无 JS 也能点） — 10 条入口 / 数据里 10 个需求 · JS 控件 0 个 · 卡里嵌套可点元素 0 个
  ✓ 首页专题导航卡：逐条 label / href 与 NEED_PAGES 对账不错位（顺序一致） — 10 张卡与注册表同序同值（学生专享 / 教育身份可领 / 无需信用卡 / 国内可用 / 完全免费 / 免费 API / 免费 Tokens / AI Coding / 免费模型 / 开发者 Credits）
  ✓ 入口行里没有任何 JS 控件（无 JS 时不给可点暗示） — JS 控件 0 个 · facet 标记 0 个 · 旧 chip 类残留 []
  ✓ 首页专题导航卡：与筛选器语义隔离（nav.needs 内 [data-facet] / [aria-pressed] / [role="button"] 计数为 0） — 0 个（[data-facet] + [aria-pressed] + [role="button"] 合计）
  ✓ 首页专题导航卡：每张卡四件套齐全（need-icon / 非空 strong / 非空 small / need-arrow） — 10 张卡四件套齐全 · 例「🎓 学生专享 12 学生套餐与教育折扣，附申请门槛 →」
  ✓ 首页每条入口的数字 == 数据里该需求的条数 — 学生专享12 教育身份可领7 无需信用卡1 国内可用30 完全免费60 免费 API45 免费 Tokens44 AI Coding4 免费模型12 开发者 Credits67
  ✓ 首页专题导航卡：数据里每个需求都有对应入口（没有漏项、href 不重复） — 10 个不同 href · 漏 0 个
  ✓ 首页专题导航卡：真点第 1 张卡「学生专享」→ /need/student-only/（HTTP 200 · h1 与注册项一致） — 点到卡 1 张 · HTTP 200 · 落地 http://127.0.0.1:61128/need/student-only/ · h1「面向学生的 AI 优惠」/ 注册项「面向学生的 AI 优惠」· JS 错误 0 个
  ✓ 首页专题导航卡：真点第 6 张卡「免费 API」→ /need/free-api/（HTTP 200 · h1 与注册项一致） — 点到卡 1 张 · HTTP 200 · 落地 http://127.0.0.1:61128/need/free-api/ · h1「可以免费调用的 API」/ 注册项「可以免费调用的 API」· JS 错误 0 个
  ✓ 首页专题导航卡：真点第 10 张卡「开发者 Credits」→ /need/dev-credits/（HTTP 200 · h1 与注册项一致） — 点到卡 1 张 · HTTP 200 · 落地 http://127.0.0.1:61128/need/dev-credits/ · h1「面向开发者的赠送额度」/ 注册项「面向开发者的赠送额度」· JS 错误 0 个
  ✓ 专题导航卡 1600px：每张卡都在视口内、无重叠、页面零横向溢出（逐张量矩形） — 10/10 张在视口内 · left 110 / right 1490（视口 1600）· 2 行（5/5）· 卡高 68px · 重叠 0 对 · 页面溢出 0px
  ✓ 专题导航卡 1600px：.needs 不是横向滚动容器、卡片没有被裁 — overflow-x=visible · nav.scrollWidth ≤ clientWidth · 被裁 0 张 · 整块 153px
  ✓ 专题导航卡 1440px：每张卡都在视口内、无重叠、页面零横向溢出（逐张量矩形） — 10/10 张在视口内 · left 30 / right 1410（视口 1440）· 2 行（5/5）· 卡高 68px · 重叠 0 对 · 页面溢出 0px
  ✓ 专题导航卡 1440px：.needs 不是横向滚动容器、卡片没有被裁 — overflow-x=visible · nav.scrollWidth ≤ clientWidth · 被裁 0 张 · 整块 153px
  ✓ 专题导航卡 1440px：.need-grid 轨道数 == 5，10 张排成 5×2（不再 10 张挤一行） — 5 条轨道 · 2 行（5/5）
  ✓ 专题导航卡 1280px：每张卡都在视口内、无重叠、页面零横向溢出（逐张量矩形） — 10/10 张在视口内 · left 20 / right 1260（视口 1280）· 2 行（5/5）· 卡高 68px · 重叠 0 对 · 页面溢出 0px
  ✓ 专题导航卡 1280px：.needs 不是横向滚动容器、卡片没有被裁 — overflow-x=visible · nav.scrollWidth ≤ clientWidth · 被裁 0 张 · 整块 153px
  ✓ 专题导航卡 768px：每张卡都在视口内、无重叠、页面零横向溢出（逐张量矩形） — 10/10 张在视口内 · left 20 / right 748（视口 768）· 4 行（3/3/3/1）· 卡高 68px · 重叠 0 对 · 页面溢出 0px
  ✓ 专题导航卡 768px：.needs 不是横向滚动容器、卡片没有被裁 — overflow-x=visible · nav.scrollWidth ≤ clientWidth · 被裁 0 张 · 整块 313px
  ✓ 专题导航卡 430px：每张卡都在视口内、无重叠、页面零横向溢出（逐张量矩形） — 10/10 张在视口内 · left 16 / right 414（视口 430）· 10 行（1/1/1/1/1/1/1/1/1/1）· 卡高 68px · 重叠 0 对 · 页面溢出 0px
  ✓ 专题导航卡 430px：.needs 不是横向滚动容器、卡片没有被裁 — overflow-x=visible · nav.scrollWidth ≤ clientWidth · 被裁 0 张 · 整块 758px
  ✓ 专题导航卡 390px：每张卡都在视口内、无重叠、页面零横向溢出（逐张量矩形） — 10/10 张在视口内 · left 16 / right 374（视口 390）· 10 行（1/1/1/1/1/1/1/1/1/1）· 卡高 68px · 重叠 0 对 · 页面溢出 0px
  ✓ 专题导航卡 390px：.needs 不是横向滚动容器、卡片没有被裁 — overflow-x=visible · nav.scrollWidth ≤ clientWidth · 被裁 0 张 · 整块 758px
  ✓ 按需求入口 390px：全部入口在视口内、不被裁、页面不横向溢出 — 10/10 可见 · 10 行卡（1/1/1/1/1/1/1/1/1/1）· 整块 758px · 被裁 0 · 页面溢出 0px
  ✓ 按需求入口 360px：全部入口在视口内、不被裁、页面不横向溢出 — 10/10 可见 · 10 行卡（1/1/1/1/1/1/1/1/1/1）· 整块 758px · 被裁 0 · 页面溢出 0px
  ✓ 需求页不执行 JS 也能读到判据说明与全部条目（预渲染的硬定义） — no-card 1 行/1131 字 · ai-coding 4 行/1432 字 · china-usable 30 行/4744 字
  ✓ 无 JS 打开首页时「按需求找优惠」入口行仍在且指向需求页 — 10 条入口 · 首条 need/student-only/
  ✓ 无 JS 打开首页：专题导航卡的卡数 / 标题 / 说明 / href 与有 JS 时逐条相同（构建期注入） — 10 张卡逐条比对全部相同 · 首张「need/student-only/」/「学生专享」/「学生套餐与教育折扣，附申请门槛」
```

改前 / 改后（同一台机器、同一 dist、同一口径）：

```
改前 ✗ 首屏完整可见卡片 ≥ 9 — 完整 6 张 / 含截断 9 张 · 网格起点 349px · 页高 4787px
改后 ✓ 首屏完整可见卡片 ≥ 6 — 完整 6 张 / 含截断 9 张 · 网格起点 349px · 页高 4787px
改前 ✗ 列表视图：首屏完整可见 ≥ 12 行（实测 13，卡片视图 9） — 10 行（行高 46px · 共 50 行 · 页高 3567px）；卡片视图同口径 6 张
改后 ✓ 列表视图：首屏完整可见 ≥ 10 行 — 10 行（行高 46px · 共 50 行 · 页高 3567px）；卡片视图同口径 6 张
```

---

## 5. 首屏密度 Before / After 实测（1440×900，AC-28 的 6 个数字）

口径与 `verify-site.js` 逐字相同（Edge headless + `playwright-core` 1.63.0 · `waitUntil:'load'` + `waitForApp`：
`#lastUpdated` 由 `--` 变真实时间戳 · 「完整可见」= `bottom <= innerHeight` · `slack = 900 − 最后一张完整卡 bottom`）。
After 由 **T3 自己**跑（`t3-geometry.js`）；Before 不手抄，直接读 T1 的冻结件 `t1-baseline-measure.json`。

| # | 指标 | Before（T1 冻结） | After（T3 实测） | Delta |
|---|---|---|---|---|
| ① | `nav.needs` 块高 | **31px** | **153px** | **+122px** |
| ② | `.grid` 网格起点 | **227px** | **349px** | **+122px** |
| ③ | 首屏**完整**可见 Deal Card | **9 张** | **6 张** | **−3 张** |
| ④ | 首屏**含截断**可见 Deal Card | **9 张** | **9 张** | 0 |
| ⑤ | slack（900 − 最后完整卡 bottom） | **1.00px**（bottom 899） | **119.00px**（bottom 781） | **+118px** |
| ⑥ | 页高 | **4665px** | **4787px** | **+122px** |

旁证（判据不变的那些）：`article.g` 仍 **50 张 / 3 列 / 192px 高**；横向溢出 **0px**；筛选器 `[data-facet]` 仍 **13 个 BUTTON、各 26px**。
「32 张卡 + 3 列」这两个读数与 `verify.json` 基线里 `cards=50 / cols=3 / cardHeight=192` 也一致。

**逐档 Before / After**（`B:` = T1 冻结，`A:` = T3 实测，格式 `块高/完整/含截断/slack/页高/横向溢出`）：

| 视口 | Before | After | 入口 perRow（B→A） |
|---|---|---|---|
| 1600×900 | 31 / 9 / 9 / 1 / 4665 / 0 | 153 / 6 / 9 / 119 / 4787 / 0 | `[10]` → `[5,5]` |
| 1440×900 | 31 / 9 / 9 / 1 / 4665 / 0 | 153 / 6 / 9 / 119 / 4787 / 0 | `[10]` → `[5,5]` |
| 1280×900 | 31 / 9 / 9 / 1 / 4665 / 0 | 153 / 6 / 9 / 119 / 4787 / 0 | `[10]` → `[5,5]` |
| 768×900 | 63 / 4 / 6 / 131.25 / 6430 / 0 | 313 / 2 / 4 / 85.25 / 6680 / 0 | `[5,5]` → `[3,3,3,1]` |
| 430×900 | 240 / 1 / 2 / 56.56 / 11168 / 0 | 758 / 0 / 0 / – / 11686 / 0 | `[2,2,1,2,2,1]` → 10 行 × 1 |
| 390×900 | 240 / 1 / 2 / 56.56 / 11312 / 0 | 758 / 0 / 0 / – / 11830 / 0 | `[2,2,1,2,2,1]` → 10 行 × 1 |

> 手机端的退步是**已披露并被队长明确接受**的代价（单列可读性优先），见 §14。桌面三档（1600/1440/1280）的
> `[10] → [5,5]` 正是本轮要修的反例形状。

### 5.1 归因实验（T3 自跑，不改任何文件）

`t3-attribution.js` 在同一份 dist 上、**只在运行时**给 `nav.needs` 加 `height:31px; overflow:hidden`（inline `!important`）：

| 读数 | 现状（153px 块） | 运行时压回 31px | 差额 |
|---|---|---|---|
| 卡片视图 `nav.needs` 高 | 153px | 31px | **+122px** |
| 卡片视图 `.grid` 起点 | 349px | 227px | **+122px** |
| 卡片视图首屏完整 | 6 张 | **9 张** | **−3 张** |
| 卡片视图页高 | 4787px | **4665px** | **+122px** |
| 列表视图首屏完整行 | 10 行 | **13 行** | **−3 行** |
| 列表视图 `.r` 首行 top | 339px | **217px** | **+122px** |

⇒ 首屏卡片 9→6 与列表行 13→10 **全部**由这一块（δ=+122px）造成，没有第二处漂移；
压回 31px 后三个读数**逐字回到** T1 冻结的 Before 值（227 / 9 / 4665），这是对 Before 冻结件的独立交叉验证。

---

## 6. 响应式几何（6 档 × 每张卡矩形）

完整逐张矩形（每档 10 个 `getBoundingClientRect()`）在 `t3-geometry.json` 的 `after.responsive[<W>x900].needs.rects`。
断言版见 §4；下面是摘要：

| 视口 | 块高 | 每行张数 | 轨道数 | 卡高（唯一值） | 在视口内 | 重叠对数 | 被裁 | 页面横向溢出 | `nav` overflow-x |
|---|---|---|---|---|---|---|---|---|---|
| 1600 | 153px | 5/5 | 5 | 68px | 10/10 | 0 | 0 | 0px | visible |
| 1440 | 153px | 5/5 | 5 | 68px | 10/10 | 0 | 0 | 0px | visible |
| 1280 | 153px | 5/5 | 5 | 68px | 10/10 | 0 | 0 | 0px | visible |
| 768 | 313px | 3/3/3/1 | 3 | 68px | 10/10 | 0 | 0 | 0px | visible |
| 430 | 758px | 1×10 | 1 | 68px | 10/10 | 0 | 0 | 0px | visible |
| 390 | 758px | 1×10 | 1 | 68px | 10/10 | 0 | 0 | 0px | visible |

- 卡高 68px 落在 AC-17 的 64–80px 区间内，且同视口内**取值集合大小 === 1**。
- 桌面 5 列、≤1180 三列、≤760 两列、≤560 单列 —— 断点行为在真浏览器里逐档确认。
- `.needs` / `.need-grid` 都不是横向滚动容器（`navOverflowX=visible`、`nav.scrollWidth ≤ clientWidth`），
  这是 AC-15「禁止用横向滚动隐藏入口」的直接判据。

---

## 7. 无 JS（构建期预渲染的硬定义）

`browser.newContext({ javaScriptEnabled: false })` 打开首页，`nav.needs a.need-card` 的
`[href, 标题, 说明]` 三条数组与有 JS 的**JSON 全等**（`t3-geometry.json` → `cards.identical = true`）：

```
卡片数：有 JS 10 / 无 JS 10
逐条对比：identical = true
无 JS 首条：href=need/student-only/ · 标题「学生专享」· 说明「学生套餐与教育折扣，附申请门槛」
无 JS 块几何：153px 高、网格起点 349px、首屏完整 6 张、横向溢出 0px（与有 JS 逐项相同）
```

---

## 8. 真实点击导航（不是比 href 字符串）

10 张卡**逐张** `page.click`（`waitForResponse` 取导航响应的 HTTP 状态 + `waitForURL` + 落地页 `h1` 与注册项 `heading` 逐字比对）：

```
真实点击：10/10 张卡点通（HTTP 200 + 落地 slug + h1 与注册项一致）
```

断言版只抽样 3 张（第 1 / 中 / 末），证据版（`t3-geometry.json` → `clicks[]`）全点 10 张，`clicksAllOk = true`，JS 错误 0。

---

## 9. M1–M7 变异牙

**方法**：每条变异**只改一处**，打在**被测产物** `dist/index.html` 上（断言读的就是这一份；
源码 `index.html` / `scripts/tools/build-local.js` **不在 T3 写作用域，一个字节都没碰**）。
打之前先校验「当前 `dist/index.html` === 起始 sha256」，再校验**锚点命中数**（不符就拒绝写盘）；
打完后跑**完整** `verify-site.js`（792 项，不是只跑 §15b2），再 `build-local.js` 还原并校验 sha256 byte-exact。
数据源：`t3-mutations.json`、`t3-mut-M*.apply.json`、`t3-mut-M*.json`（verify-site 的机器可读报告）、`t3-mut-M*.log`（原始输出）。

| 变异 | 一句话（只改这一处） | 锚点命中 | 变异后 sha（前 12） | 字节变化 | `verify-site` 结果 | 变红的关键断言 |
|---|---|---|---|---|---|---|
| **M1** | 每张卡加 `data-facet="need"`（退回标签式入口的语义） | 10 | `E6D17988F3C2` | 403822→404002 | **792 / 失败 3** | `首页专题导航卡：与筛选器语义隔离…` · `入口行里没有任何 JS 控件…` · `筛选按钮逐个带 aria-pressed`（13/23） |
| **M2** | 删掉卡上的说明行 `<small>…</small>` | 10 | `E45A8A63624E` | 403822→403276 | **792 / 失败 1** | `首页专题导航卡：每张卡四件套齐全…` |
| **M3** | 删掉 `<span class="need-arrow">…</span>`（导航暗示消失） | 10 | `63EED99EC2BC` | 403822→403282 | **792 / 失败 1** | `首页专题导航卡：每张卡四件套齐全…` |
| **M4** | 整卡 `<a href>` → `<button data-href>` | 10 | `9DDB9512E1CA` | 403822→403972 | **792 / 失败 17** | 8 条新增断言全部真红（卡数 / `<a>` / 逐条对账 / JS 控件 / 四件套 / 漏项 / 3 条真点导航）+ 6 档视口完整性 + 无 JS 入口行 |
| **M5** | 每张卡加 `aria-pressed="false"` | 10 | `FEFC61BABBE3` | 403822→404032 | **792 / 失败 2** | `首页专题导航卡：与筛选器语义隔离…` · `入口行里没有任何 JS 控件…` |
| **M6** | `.need-grid` 换成 `repeat(10, 220px)` + `overflow-x:auto`（横滑藏入口） | 1（CSS 规则唯一） | `9A744FBDDD6B` | 403822→403832 | **792 / 失败 4** | 1600 / 1440 / 1280 的 `每张卡都在视口内…`（1600：6/10 在视口内，right 2418 > 1600）· `1440px：.need-grid 轨道数 == 5`（实测 10 条轨道、1 行 10 张） |
| **M7** | 第 8 张卡 href 指向错 slug（`need/ai-coding/` → `need/ai-coding-x/`） | 1 | `9C9499D0BE9B` | 403822→403824 | **792 / 失败 3** | `逐条 label / href 与 NEED_PAGES 对账不错位` · `首页每条入口的数字 == 数据里该需求的条数` · `数据里每个需求都有对应入口` |

**原始输出（每条只摘关键行；完整在 `t3-mut-M*.log`）**

```
M1  ✗ 筛选按钮逐个带 aria-pressed — 13/23 个
    ✗ 入口行里没有任何 JS 控件（无 JS 时不给可点暗示） — JS 控件 0 个 · facet 标记 10 个 · 旧 chip 类残留 []
    ✗ 首页专题导航卡：与筛选器语义隔离（nav.needs 内 [data-facet] / [aria-pressed] / [role="button"] 计数为 0） — 10 个
M2  ✗ 首页专题导航卡：每张卡四件套齐全（need-icon / 非空 strong / 非空 small / need-arrow） — need/student-only/：图标 1 / 标题 1「学生专享」/ 说明 0「」/ 箭头 1 · …
M3  ✗ 首页专题导航卡：每张卡四件套齐全（…） — need/student-only/：图标 1 / 标题 1「学生专享」/ 说明 1「学生套餐与教育折扣，附申请门槛」/ 箭头 0 · …
M4  ✗ 首页专题导航卡：卡数 == NEED_PAGES.length（按注册表现算，不写死条数） — 0 张卡 / 注册表 10 条需求 · dist/deals.json 里 10 个需求有命中
    ✗ 首页有「按需求找优惠」入口行，且每条都是 <a>（无 JS 也能点） — 0 条入口 / 数据里 10 个需求 · JS 控件 10 个 · 卡里嵌套可点元素 0 个
    ✗ 首页专题导航卡：每张卡四件套齐全（…） — 整个 nav.needs 里一张 a.need-card 都没有（卡片形状被换掉了）
    ✗ 首页专题导航卡：真点第 1 张卡「学生专享」→ /need/student-only/（HTTP 200 · h1 与注册项一致） — 点到卡 0 张 · HTTP — · 落地 — · …
    ✗ 专题导航卡 1600px：每张卡都在视口内、无重叠、页面零横向溢出（逐张量矩形） — 0/0 张在视口内 · 0 行（）· …
    ❌ 验收 792 项，失败 17 项
M5  ✗ 入口行里没有任何 JS 控件（无 JS 时不给可点暗示） — JS 控件 0 个 · facet 标记 10 个 · 旧 chip 类残留 []
    ✗ 首页专题导航卡：与筛选器语义隔离（…） — 10 个
M6  ✗ 专题导航卡 1600px：每张卡都在视口内、无重叠、页面零横向溢出（逐张量矩形） — 6/10 张在视口内 · left 110 / right 2418（视口 1600）· 1 行（10）· 卡高 68px · 重叠 0 对 · 页面溢出 0px
    ✗ 专题导航卡 1440px：每张卡都在视口内、无重叠、页面零横向溢出（逐张量矩形） — 6/10 张在视口内 · left 30 / right 2338（视口 1440）· 1 行（10）· …
    ✗ 专题导航卡 1440px：.need-grid 轨道数 == 5，10 张排成 5×2（不再 10 张挤一行） — 10 条轨道 · 1 行（10）
    ✗ 专题导航卡 1280px：每张卡都在视口内、无重叠、页面零横向溢出（逐张量矩形） — 5/10 张在视口内 · left 20 / right 2328（视口 1280）· 1 行（10）· …
M7  ✗ 首页专题导航卡：逐条 label / href 与 NEED_PAGES 对账不错位（顺序一致） — 第 8 张「AI Coding」→ need/ai-coding-x/ ≠ 注册表「AI Coding」→ need/ai-coding/
    ✗ 首页每条入口的数字 == 数据里该需求的条数 — need/ai-coding-x/ 首页 4 / 数据 0
    ✗ 首页专题导航卡：数据里每个需求都有对应入口（没有漏项、href 不重复） — 10 个不同 href · 漏 1 个（ai-coding）
```

**M6 未在 768/430/390 变红，原因已核实**：那三档的 `.need-grid` 列数由媒体查询（`≤1180` / `≤760` / `≤560`）在后覆盖，
变异只改了**基础规则**——所以横滑只出现在 1600/1440/1280 三档。这不是漏判，而是「变异只改一处」的必然结果，
也说明**逐档**测量是必要的（只量 1440 会看不出断点覆盖关系，只量 390 会完全漏掉这个变异）。

**一次真实的事故与修复（如实记录）**：M4 第一次跑时 `verify-site.js` 自己崩了 ——
新增的「四件套」断言在 detail 字符串里解引用 `navRow.items[0]`，而 M4 让 `items.length === 0` ⇒
`TypeError: Cannot read properties of undefined (reading 'iconText')`，**792 项只跑到 §15b2 就中断，JSON 报告都没写出来**。
修复：detail 改走显式分支函数（`!items.length` 时返回「整个 nav.needs 里一张 a.need-card 都没有」），
断言脚本必须**干净地判红**而不是自己抛异常。修完重跑 M4 → **792 项 / 失败 17 项**、报告完整落盘。
（这条同时是对 M4 的额外验证：换成 `<button>` 以后，报告里 17 条红全部指向「整卡/导航」这一类判据。）

**还原证据（byte-exact）**：7 条变异全部 `byteExactRestore=True`（`t3-mutations-run.log` 原始行）：

```
M1 apply=0 verifySite(exit)=1 rebuild=0 byteExactRestore=True elapsed=82.2s
M2 apply=0 verifySite(exit)=1 rebuild=0 byteExactRestore=True elapsed=80.9s
M3 apply=0 verifySite(exit)=1 rebuild=0 byteExactRestore=True elapsed=79.4s
M4 apply=0 verifySite(exit)=1 rebuild=0 byteExactRestore=True elapsed=33.1s   ← 崩在 §15b2，已修后重跑（下表为准）
M5 apply=0 verifySite(exit)=1 rebuild=0 byteExactRestore=True elapsed=80.3s
M6 apply=0 verifySite(exit)=1 rebuild=0 byteExactRestore=True elapsed=79.8s
M7 apply=0 verifySite(exit)=1 rebuild=0 byteExactRestore=True elapsed=79.9s
```

M4 重跑（修复后，同一条变异、同一份 dist 起点）：

```
M4 verifySite exit=1 · rebuild exit=0 · 机器可读报告 792 项，失败 17 项
$ node research/_raw/home-topic-entry-cards-v1/t3-mutate.js verify
✓ dist/index.html sha256 8076370E3C7AF29A3C3B6289A57B3B0C673DA033CD1CC8432CFA7FA7652E5242
  期望（t3-geometry.json 记录的原始字节）8076370E3C7AF29A3C3B6289A57B3B0C673DA033CD1CC8432CFA7FA7652E5242
  byte-exact 还原 = true
```

**「还原后重跑必须回绿」**：全部变异跑完、dist 已 byte-exact 回到原始 sha 之后，跑了两轮完整验收：
`verify-site.js` 792 项 0 失败（§4）与 `verify-site.js --compare=…/verify.json` **798 项 0 失败**（§3.3 / `t3-verify-compare.log`）。
由于 sha256 逐次证明「还原后的字节 === 起始字节」，这两轮绿就是**所有**变异还原后的同一份字节上的绿。

**还原后 `git status` / `git diff`（空输出本身也是证据）**：

```
$ git status --short
 M index.html                                     ← 实现者（T2）的改动，不是 T3 的
 M research/_raw/ours-baseline/verify-pre-fold.json   ← T3：只改 firstScreenFull
 M research/_raw/ours-baseline/verify.json            ← T3：只改 firstScreenFull
 M scripts/lib/audience.js                         ← 实现者
 M scripts/tools/audience-selftest.js              ← 实现者
 M scripts/tools/build-local.js                    ← 实现者
 M scripts/tools/verify-site.js                    ← T3
?? AI_DEALS_AGGREGATOR_ROADMAP_AND_PROMPTS.md      ← 本轮之前就在（未跟踪）
?? AI_DEALS_CODING_PLAN_PHASES_PROMPTS.md          ← 同上
?? final-dist-A.sha256                             ← 同上
?? final-dist-B.sha256                             ← 同上
?? research/_raw/home-topic-entry-cards-v1/        ← 本任务证据目录
?? research/audit/                                 ← 同上

$ git diff --stat -- scripts/tools/verify-site.js
 scripts/tools/verify-site.js | 336 ++++++++++++++++++++++++++++-----------
 1 file changed, 252 insertions(+), 84 deletions(-)
```

**变异文件零残留**：`dist/` 不在 git 索引里，但 7 条变异全部通过「rebuild + sha256 相等」还原，
最终校验（§10.1）通过；`git status --short` 里**没有任何** 被变异文件残留。

---

## 10. byte-exact 还原与数据层零漂移

### 10.1 变异的还原方式与 byte-exact 证明

- 变异只打在 `dist/index.html`（断言读的就是它）；**源码一个字节都没碰** —— `index.html` / `scripts/tools/build-local.js` 不在 T3 写作用域内。
- 还原 = `node scripts/tools/build-local.js`（构建对同一份源码是**确定性**的：本轮实测 rebuild 前后 `dist/index.html` sha256 **逐位相同** `8076370E3C7AF29A…`）。
- 每条变异在打之前先校验「当前 dist/index.html === 原始 sha」，打完记录 `shaBefore/shaAfter`，还原后再校验一次；7 条全部 `byteExactRestore=True`。

### 10.2 数据层零漂移

```
$ git diff -- deals.json plans.json api-plans.json models.json
（空输出 —— 上面这一行之后没有任何内容）

$ git diff -- .github/ package.json scripts/tools/check-ci-consistency.js
（空输出）
```

产物侧 sha256（T3 在构建前后各测一次，逐位相同；前 16 位与 T1 冻结表一致）：

| 文件 | 字节数 | sha256（前 16） | 与 T1 冻结值 |
|---|---|---|---|
| `deals.json` | 242373 | `1CF4733901206580` | 一致 |
| `plans.json` | 91744 | `1668D19CADBCE7E2` | 一致 |
| `api-plans.json` | 106148 | `ACEBDE3A35BEBBC6` | 一致 |
| `models.json` | 48014 | `CE69F006F0FA481A` | 一致 |
| `dist/deals.json` | 293515 | `4BAA1F758FD88566` | 一致 |
| `dist/plans.json` | 91744 | `1668D19CADBCE7E2` | 一致 |
| `dist/api-plans.json` | 106148 | `ACEBDE3A35BEBBC6` | 一致 |
| `dist/models.json` | 48014 | `CE69F006F0FA481A` | 一致 |
| `dist/source-health.json` | 4564 | `BC701E63A7E276EA` | — |
| `dist/feed.json` | 82334 | `E9668600C2A50E4A` | — |
| `dist/feed.xml` | 84796 | `AAE1603629A10EC6` | — |
| `dist/sitemap.xml` | 36504 | `45000B56C904BC9F` | — |

`coverage` / `history` / `source-health` 类产物（这一组 T3 接手时没有机会先测一次「改动前」的基线，所以判据换成两条更硬的）：
1. **源侧数据**（git 跟踪）：`git diff -- scripts/data` **空输出** ⇒ `scripts/data/{deal-history,plan-history,api-plan-history,source-health,coverage-targets}.json` 与 `HEAD` 逐字节相同；
2. **产物侧**：`dist/{deal-history,plan-history,api-plan-history,source-health}.json` 的 sha256 与对应的 `scripts/data/*` **逐位相等**
   （`DB7BC088E1AEC758…` / `8C0003AA37521C86…` / `D5FFDCAF8F935351…` / `BC701E63A7E276EA…`）⇒
   构建只是把它们原样拷过去，没有重算、没有掺进构建时刻。
   这一条之所以成立，是因为这些文件在**多轮 rebuild**（1 次基线构建 + 7 次变异还原构建 + 1 次 M4 重跑还原）之后仍是同一串 hash。

### 10.3 门禁口径不变性（AC-27）

```
$ node scripts/tools/check-ci-consistency.js
  ✓ (W) 断言名单与冻结清单等值（删一条或改名都会红；本看门狗保护不了自己被删） — 实跑 37 条 = 冻结清单 37 条 + 本看门狗
  ✓ (E) 实跑项数 == --expect-checks=38（期望值来自 verify.yml 的 gate 调用行；数字钉在调用方，与看门狗互相独立）
✅ CI 口径检查 38 项，失败 0 项
```

`--expect-checks=38`（`.github/workflows/verify.yml:125`）与 `FROZEN_ASSERTION_NAMES`（`check-ci-consistency.js:547`）
**都没动**（`git diff` 空）—— 它们冻结的是 `check-ci-consistency.js` 自己的 37+1 项，不数 `verify-site.js` 的断言。

`audience-selftest.js`：当前 **197 项通过 / 0 失败**；把 `HEAD` 版本用同一份注册表跑一遍是 **191 项通过 / 0 失败**
（`git show HEAD:scripts/tools/audience-selftest.js | node -`，cwd = `scripts/tools`）⇒ 实现者声称的「§9 纯新增 6 条」与实测增量一致。

---

## 11. `check-mobile-chrome.js` @390px（手工工具复核）

命令（注意必须 `--dir=dist`：不带它时 `serve.js` 服务的是**仓库根**的源码 `index.html`，
里面只有 `<!--PRERENDER:needs-->` 标记、没有注入后的卡片 —— 第一次就是这么跑出 `nav.needs: MISSING` 的）：

```powershell
node scripts/serve.js --dir=dist --port 8080      # 另开终端
node scripts/tools/check-mobile-chrome.js http://127.0.0.1:8080/
```

原始输出（`t3-mobile-chrome-390.log`，逐字）：

```
=== (1) 390px 控件裁切 / 折行 ===
  document overflowX = 0px (scrollW=390, clientW=390)
  …
  nav.needs        w= 390 scrollW= 390 clientW= 390 clipped=   0 right= 390 pastParent=   0 pastViewport=   0 overflowX=visible
  nav.radar        w= 358 scrollW= 358 clientW= 358 clipped=   0 right= 374 pastParent=   0 pastViewport= -16 overflowX=visible
  #jumpNav: chips=4 rows=1 perRow=[4] scrollW=289 clientW=289 lastChipRight=305
  nav.needs: links=10 rows=10 perRow=[1,1,1,1,1,1,1,1,1,1] clipped=0 outOfViewport=0 scrollW=390 clientW=390 overflowX=visible
  nav.radar: height=18px items=0 clipped=0 navOverflow=0px scrollOverflow=0px moreRight=374 moreInViewport=true
```

读法（正是任务契约要求的三项）：
- **clipped = 0**：10 张卡一张都没被裁（`scrollWidth > clientWidth + 1` 的计数为 0）；
- **outOfViewport = 0**：没有一张卡越出视口（`left < 0 || right > 391 || width === 0`）；
- **overflowX = `visible`**：`nav.needs` **不是**横向滚动容器 —— 与 `verify-site.js` 的判据同源、互相独立的一条手工复核。
- `scrollW = clientW = 390`：这一块自身没有隐藏的横向内容。

工具退出码 0；页面级 `document overflowX = 0px`（390/390）。

---

## 12. 已知退步与未覆盖项（如实披露）

1. **手机端首屏（队长已明确接受）**：390×900 下本块 240→758px、`.grid` 起点 617.75→1135.75px，
   首屏**完整可见 Deal Card 从 1 张变 0 张**（含截断也从 2 变 0）；430 / 360 同量级。768px 下 4→2 张。
   这是「单列可读性优先」的代价（两条路都写在 `index.html` 的 CSS 注释里），T3 **未**为了首屏把它压回两列。
2. **Before 读数的来源**：T3 接手时 `dist/` 已是实现者用新源码重建的产物，**无法**再回到改动前状态去直测 Before。
   Before 数字取自 T1 的冻结件 `t1-baseline-measure.json`（AC-28 允许并要求与之对齐），并做了两层独立交叉验证：
   （a）§5.1 的运行时归因实验（压回 31px 后 227 / 9 / 4665 逐字回到 Before）；
   （b）`index.html:1162-1168` 里**本轮之前就存在**的注释（227 / 192 / 12 / 899 / slack 1 / 9→6）与本轮实测逐项吻合。
3. **变异的作用面**：M1–M7 打在**被测产物**（`dist/index.html`）上而不是源码上 —— 因为断言读的就是这一份，
   且源码文件（`index.html` / `build-local.js`）不在 T3 写作用域。变异前先校验锚点命中数（M1/M2/M3/M4/M5 = 10、M6 = 1、M7 = 1），
   命中数不符就拒绝写盘。**源码级**变异（改生成器后 rebuild）留给 T4 抽查时可自行补做。
4. **`t1-baseline-measure.json` / `t1-growth-sim.json` 是 UTF-16LE + BOM**（首字节 `ff fe`）——
   直接 `readFileSync(...,'utf8')` + `JSON.parse` 会抛 `Unexpected token '\uFFFD'`。T3 的读取端已按 BOM 自动选编码
   （`t3-geometry.js` 的 `readJsonAny`）。**给 T4 的提醒**：读这两个文件时别把编码问题误判成数据损坏。
5. `check-mobile-chrome.js` 的 `nav.needs` 统计走的是 `querySelectorAll('a')`（该块内 10 个 `<a>` 恰等于 10 张卡）；
   它不区分 `a.need-card` 与块内可能新增的其它链接 —— 本轮的判据在 `verify-site.js` 里是更严的 `a.need-card`。
6. **T3 自己的一次工具事故（已修，如实记录）**：M4 变异下新增的「四件套」断言在 detail 里解引用 `items[0]`，
   让断言脚本自己抛 `TypeError`、792 项只跑到 §15b2 就中断（JSON 报告都没落盘）。
   已改成显式分支函数（详见 §9 末尾），重跑得到完整的 `792 / 失败 17`。**这类「断言脚本自己崩」比断言变红更危险**
   —— 它会把「跑不完」伪装成「跑过了」，所以留在这里给下一轮当反面教材。

---

## 13. 复现命令（逐字）

```powershell
# 0) 构建（确定性：rebuild 前后 dist/index.html sha256 相同）
node scripts/tools/build-local.js

# 1) 断言（792 项；改前是 776 项 / 失败 8 项）
node scripts/tools/verify-site.js --json=research/_raw/home-topic-entry-cards-v1/t3-verify-after.json
node scripts/tools/verify-site.js --compare=research/_raw/ours-baseline/verify.json

# 2) 注册表自测（197 项；HEAD 版本 191 项 ⇒ 新增 6 条）
node scripts/tools/audience-selftest.js

# 3) 首屏密度 / 6 档几何 / 无 JS / 10 张卡真实点击
node research/_raw/home-topic-entry-cards-v1/t3-geometry.js

# 4) 归因实验（运行时把 nav.needs 压回 31px，不改文件）
node research/_raw/home-topic-entry-cards-v1/t3-attribution.js

# 5) 变异牙（每条：打变异 → verify-site 真跑 → rebuild 还原 → sha256 校验）
node research/_raw/home-topic-entry-cards-v1/t3-mutate.js apply M1
node scripts/tools/verify-site.js --json=research/_raw/home-topic-entry-cards-v1/t3-mut-M1.json
node scripts/tools/build-local.js
node research/_raw/home-topic-entry-cards-v1/t3-mutate.js verify
node research/_raw/home-topic-entry-cards-v1/t3-mutate.js summarize

# 6) 手工窄屏工具（另开终端起服务；**必须 --dir=dist**，否则服务的是源码 index.html）
node scripts/serve.js --dir=dist --port 8080
node scripts/tools/check-mobile-chrome.js http://127.0.0.1:8080/

# 7) 门禁口径不变性
node scripts/tools/check-ci-consistency.js
git diff -- deals.json plans.json api-plans.json models.json
```

---

## 14. 结论

**通过。** 四条 Verify 命令全部 exit 0；11 条 acceptance 逐条有实测证据（§2–§11）；M1–M7 七条变异全部真红且逐条 byte-exact 还原。
唯一需要下游知情的两件事：① 产品侧的密度代价（桌面 9→6 张完整卡、390px 首屏 0 张）已在 §5/§12 如实披露并写进基线注释；
② `verify-site.js` 的断言总数由 776 变为 792（删 6 / 增 22，逐条列在 §2）。

---

# T6 返工追加（2026-10-06）：补「这一块按设计不是横向滚动容器」的直接断言

> 本节是 **T6（repair，attempt 2）** 的追加证据，接在 t2 的 T3 报告之后 —— 按队长口径**不新开报告**。
> 只补断言、不改业务实现；三条阈值同步与两份基线一字未动（§15.8 有现场取证）。

## 15.0 一句话结论

复核者 T4 的原始 finding **已关闭**：把 `overflow-x:auto` **只**注入基础 `.need-grid` 规则（5 列、内容毫无溢出）时，
新断言 **6/6 档全红**（修复前同一变异 **失败 0 项**）；同一变异下「每张卡都在视口内 / 页面零横向溢出」仍然**全绿**
—— 这正是「溢出被容器吃掉」那条旧断言永远看不见的路。既有 792 项断言**一条都没动**（机器对账：新增 6 / 删除 0 / 判定与 detail 全同，§15.7）。

## 15.1 finding 是什么（为什么老断言看不见）

横向滚动容器藏入口的机制不是「页面变宽」，而是**溢出被容器自己吃掉**：容器处于滚动位置 0，
`documentElement.scrollWidth - clientWidth` 依然等于 0，每一张卡的矩形也都在视口里。旧断言只有两把尺子：

- `专题导航卡 <W>px：每张卡都在视口内、无重叠、页面零横向溢出`（几何）
- `专题导航卡 <W>px：.needs 不是横向滚动容器、卡片没有被裁`（只量 `.needs` 自己的 overflow-x 与卡片是否自裁）

两把尺子在「基础规则加了 `overflow-x:auto`」时**全绿**。T6 的变异记录（§15.4）把这件事钉在原始输出里：

```
✗ 专题导航卡 1440px：.needs 与 .need-grid 都不是横向滚动容器（计算 overflow-x ∉ auto/scroll）
   — .needs overflow-x=visible · .need-grid overflow-x=auto · scrollWidth/clientWidth：needs 1420/1420 · grid 1380/1380
✓ 专题导航卡 1440px：每张卡都在视口内、无重叠、页面零横向溢出（逐张量矩形） — 10/10 张在视口内 · … · 页面溢出 0px
✓ 专题导航卡 1440px：.needs 不是横向滚动容器、卡片没有被裁 — overflow-x=visible · nav.scrollWidth ≤ clientWidth · 被裁 0 张
✓ 专题导航卡 1440px：.need-grid 轨道数 == 5，10 张排成 5×2（不再 10 张挤一行） — 5 条轨道 · 2 行（5/5）
```

`grid 1380/1380`（**毫无溢出**）而 `overflow-x=auto` —— 新断言咬的就是这个组合。

队长在 T6 开工前用独立探针复现过**修复前**的同一变异：**失败断言数 = 0**（`.need-grid` 已经是滚动容器，没人管）。

## 15.2 改了什么（只加一条断言 × 6 档，判据不动）

`scripts/tools/verify-site.js` 的响应式循环（1600/1440/1280/768/430/390 六档）里新增一条独立断言，
并在 `geo` 里多读四个容器现场量（`.need-grid` 的 `overflow-x` / `scrollWidth` / `clientWidth`，`.needs` 的 scroll/client 宽）：

```js
check(`专题导航卡 ${width}px：.needs 与 .need-grid 都不是横向滚动容器（计算 overflow-x ∉ auto/scroll）`,
  Boolean(geo) && geo.navOverflowX !== 'auto' && geo.navOverflowX !== 'scroll' &&
  geo.gridOverflowX !== 'auto' && geo.gridOverflowX !== 'scroll',
  geo ? `.needs overflow-x=${geo.navOverflowX} · .need-grid overflow-x=${geo.gridOverflowX} · ` +
    `scrollWidth/clientWidth：needs ${geo.navScrollW}/${geo.navClientW} · grid ${geo.gridScrollW}/${geo.gridClientW}` : '—');
```

- **判据只取计算样式**：`overflow-x ∉ {auto, scroll}`（`visible` / `clip` 都算通过）。
  `scrollWidth/clientWidth` 只作为现场数字打印，**不**当作「必须相等」的判据 —— 内容真的超宽时这一块也不该横滑，而应该降列/换行。
- **独立于卡片当前有没有溢出**：它不看任何卡片矩形、不看 `documentElement`，所以容器吃了溢出也照样红。
- 覆盖档位：6 档（含任务要求的 1440 与 390；390 那一档的现场数字是 `needs 390/390 · grid 358/358`）。
- 断言总数 **792 → 798**；`--compare` 相应 **798 → 804**（§15.3）。
- **没有改任何既有断言的判据**：唯一的另一次改动是修掉注释里对队长已删除探针的引用（§15.9）。

## 15.3 干净产物上的绿态：6 档现场数字（原始输出）

`node scripts/tools/verify-site.js --json=…/t6-verify-after.json` → **798 项 0 失败**（exit 0，76.5s）：

```
  ✓ 专题导航卡 1600px：.needs 与 .need-grid 都不是横向滚动容器（计算 overflow-x ∉ auto/scroll） — .needs overflow-x=visible · .need-grid overflow-x=visible · scrollWidth/clientWidth：needs 1420/1420 · grid 1380/1380
  ✓ 专题导航卡 1440px：… — .needs overflow-x=visible · .need-grid overflow-x=visible · scrollWidth/clientWidth：needs 1420/1420 · grid 1380/1380
  ✓ 专题导航卡 1280px：… — .needs overflow-x=visible · .need-grid overflow-x=visible · scrollWidth/clientWidth：needs 1280/1280 · grid 1240/1240
  ✓ 专题导航卡 768px：… — .needs overflow-x=visible · .need-grid overflow-x=visible · scrollWidth/clientWidth：needs 768/768 · grid 728/728
  ✓ 专题导航卡 430px：… — .needs overflow-x=visible · .need-grid overflow-x=visible · scrollWidth/clientWidth：needs 430/430 · grid 398/398
  ✓ 专题导航卡 390px：… — .needs overflow-x=visible · .need-grid overflow-x=visible · scrollWidth/clientWidth：needs 390/390 · grid 358/358
✅ 验收 798 项，失败 0 项
```

`node scripts/tools/verify-site.js --compare=research/_raw/ours-baseline/verify.json` → **804 项 0 失败**（exit 0，75.6s），
6 条回归全绿：覆盖 80→80 · 卡片 50→50 · **首屏完整可见 6→6** · 页高 4589→4787（容差内）· 外部请求 0→0 · JS 错误 0。
（原始输出：`t6-verify-after.log` / `t6-verify-compare.log`；`--compare` 按队长本轮口径只跑这一次，未重复长套件。）

## 15.4 形态 A：**只注入基础规则**（复核者 T4 的原始 finding 形态）→ 6 红，几何全绿

两个证据源，都留了原始输出：

**① 自证探针 `t6-m6-check.js`**（Buffer 读写；注入前逐个校验命中数；跑完整套件；明细见 `t6-m6-check.log`）：

```
start sha256 = 8076370E3C7AF29A3C3B6289A57B3B0C673DA033CD1CC8432CFA7FA7652E5242
锚点校验：.need-grid 规则共 4 条（期望 4），其中含 display:grid 的 1 条（期望 1）
injected = 1 （只注入基础规则）
套件结果：验收 798 项，失败 6 项
变红断言（去重）6 条：
  ✗ 专题导航卡 1600px：.needs 与 .need-grid 都不是横向滚动容器（计算 overflow-x ∉ auto/scroll）
  ✗ 专题导航卡 1440px：…   ✗ 专题导航卡 1280px：…   ✗ 专题导航卡 768px：…
  ✗ 专题导航卡 430px：…    ✗ 专题导航卡 390px：…
其中含「都不是横向滚动容器」的 6 条
restored sha256 = 8076370E3C7AF29A3C3B6289A57B3B0C673DA033CD1CC8432CFA7FA7652E5242 byteExact = true
✓ 还原 byte-exact，且新断言确实变红
```

**② 变异套件记录 `t6-mut-M6a.{json,log}`**（同一形态走 `t3-mutate.js apply M6a`，锚点命中数 1、逐条断言明细可查）：

```
M6a anchors=1  8076370E3C7A -> 59283A690973  bytes 403822->403840   （manifest：t3-mut-M6a.apply.json）
M6a apply=0 verifySite(exit)=1 rebuild=0 byteExactRestore=True elapsed=84.9s
✗ 专题导航卡 1440px：.needs 与 .need-grid 都不是横向滚动容器（…） — .needs overflow-x=visible · .need-grid overflow-x=auto · scrollWidth/clientWidth：needs 1420/1420 · grid 1380/1380
（1600/1280/768/430/390 同形；**失败总数 6，且全部是这一条**）
```

**独立性证据**（同一份变异下这些断言仍然全绿，逐档原始行）：

```
✓ 专题导航卡 1600px：每张卡都在视口内、无重叠、页面零横向溢出（逐张量矩形） — 10/10 张在视口内 · left 110 / right 1490 · 2 行（5/5）· 页面溢出 0px
✓ 专题导航卡 1440px：… — 10/10 张在视口内 · left 30 / right 1410 · 页面溢出 0px
✓ 专题导航卡 1280px：… / 768px：… / 430px：… / 390px：… — 均 10/10 在视口内、页面溢出 0px
✓ 专题导航卡 1440px：.need-grid 轨道数 == 5，10 张排成 5×2 — 5 条轨道 · 2 行（5/5）
✓ 专题导航卡 <W>px：.needs 不是横向滚动容器、卡片没有被裁 — overflow-x=visible · nav.scrollWidth ≤ clientWidth · 被裁 0 张
```

## 15.5 形态 B：**注入全部四条 `.need-grid` 规则** → 6 红（另一条机制）

```
M6b anchors=4  8076370E3C7A -> 6665E2411B62  bytes 403822->403894   （两条：基础 + ≤1180 + ≤760 + ≤560）
M6b apply=0 verifySite(exit)=1 rebuild=0 byteExactRestore=True elapsed=83.5s
✗ 专题导航卡 1440px：.needs 与 .need-grid 都不是横向滚动容器（…） — .need-grid overflow-x=auto · grid 1380/1380
（1600/1280/768/430/390 同形；**失败总数 6，全部是这一条**）
```

> 两种形态**分开记、各自带 appliedHash 与失败断言名**（不重演 T4 那份 summary 里「把 M6R 的失败记成 M6」的混淆）。
> 顺带保留 t3 的第三种形态作对照：`M6`（把基础规则换成 `repeat(10, 220px)` + `overflow-x:auto`，**内容真的溢出**）
> → **失败 10 项** = 几何 4 项（1600/1440/1280 卡片越界 + 1440 轨道数 10）+ 新断言 6 项；
> 它的详情里 `grid 2308/1380` 正是「真的溢出」的样子 —— 与形态 A 的 `1380/1380` 形成对照，两条路各有各的牙。

## 15.6 M1–M7 在**修复后 798 项断言集**上重跑

```
M1 apply=0 verifySite(exit)=1 rebuild=0 byteExactRestore=True elapsed=82.4s
M2 … 80.6s   M3 … 80.7s   M4 … 79.4s   M5 … 78.8s   M6 … 82.4s   M7 … 83.6s
（M6a … 84.9s、M6b … 83.5s，见 §15.4/§15.5）
```

| 变异 | appliedHash（shaAfter 前 12） | anchors | 失败项 | 变红的断言（关键项） | byte-exact |
|---|---|---|---|---|---|
| M1 facet 标记 | `E6D17988F3C2` | 10 | 3 | 语义隔离 · 零 JS 控件 · 筛选按钮 aria-pressed 13/23 | ✓ |
| M2 删说明 | `E45A8A63624E` | 10 | 1 | 四件套齐全 | ✓ |
| M3 删箭头 | `63EED99EC2BC` | 10 | 1 | 四件套齐全 | ✓ |
| M4 `<a>`→`<button>` | `9DDB9512E1CA` | 10 | 17 | 卡数 / `<a>` / 逐条对账 / 零 JS 控件 / 四件套 / 漏项 / 3 条真点导航 / 6 档几何 / 无 JS 入口行 | ✓ |
| M5 `aria-pressed` | `FEFC61BABBE3` | 10 | 2 | 语义隔离 · 零 JS 控件 | ✓ |
| M6 基础规则→10×220 横滑轮播 | `9A744FBDDD6B` | 1 | **10** | 几何 4（越界 + 轨道数）+ **新断言 6** | ✓ |
| **M6a 只注入基础规则** | `59283A690973` | 1 | **6** | **新断言 6（全部；几何全绿）** | ✓ |
| **M6b 注入四条规则** | `6665E2411B62` | 4 | **6** | **新断言 6（全部；几何全绿）** | ✓ |
| M7 错 slug | `9C9499D0BE9B` | 1 | 3 | 逐条对账 · 数字 4/0 · 漏 1 个 ai-coding | ✓ |

**结论：修复后每条变异红的仍是那条（或那组）断言**，没有一条变成「别的地方红了」；
M1–M5、M7 的失败项数与 t2 完全一致（3/1/1/17/2/3），M6 由 4 变 10 只是因为新断言在同一变异下**也**响了。
逐条明细（含 detail 原文）：`t6-mut-summary.json`、`t6-mut-<id>.json/.log`。

## 15.7 既有断言零削弱（机器对账，不是嘴上说）

`node research/_raw/home-topic-entry-cards-v1/t6-assertion-diff.js`（比对 T6 修改前的 `t3-verify-after.json`
与修改后的 `t6-verify-after.json`，逐条按 **名字 + ok + detail（去掉本地端口号）** 对账）：

```
改前 792 项（失败 0）→ 改后 798 项（失败 0）
新增 6 条 / 删除 0 条 / 共有 792 条
  + 专题导航卡 1600px：.needs 与 .need-grid 都不是横向滚动容器（计算 overflow-x ∉ auto/scroll）
  + 专题导航卡 1440px：…   + 1280px：…   + 768px：…   + 430px：…   + 390px：…
共有名里 ok 变化的：0 条；detail 变化（去掉本地端口号后）：0 条
结论：✓ 只增不减、既有断言的判定结果全部不变
```

（原始输出 `t6-assertion-diff.log` / `t6-assertion-diff.json`；退出码 0。）

## 15.8 dist 恢复自证（队长硬要求的三条，现场取证）

1. **sha256 回读等于 frozen**（还原走 `node scripts/tools/build-local.js` —— 源码全程未变，重建是确定性的）：

```
$ (Get-FileHash dist/index.html -Algorithm SHA256).Hash
8076370E3C7AF29A3C3B6289A57B3B0C673DA033CD1CC8432CFA7FA7652E5242
$ node research/_raw/home-topic-entry-cards-v1/t3-mutate.js verify
✓ dist/index.html sha256 8076370E3C7AF29A3C3B6289A57B3B0C673DA033CD1CC8432CFA7FA7652E5242
  期望（t3-geometry.json 记录的原始字节）8076370E3C7AF29A3C3B6289A57B3B0C673DA033CD1CC8432CFA7FA7652E5242
  byte-exact 还原 = true
```

2. **注入残留 grep（三条命令的现场输出）** —— 注入指纹是 `overflow-x:auto;`（我的注入器写的就是这个**无空格**形态，
   正常产物里的横滑规则都写作 `overflow-x: auto;`）：

```
$ grep -r "overflow-x:auto;" dist/          → No matches found          (0 处)
$ grep -r "overflow-x:auto;" scripts/       → No matches found          (0 处)
$ grep -r "overflow-x:auto;" index.html     → 0 处（同一次扫描里未出现）
$ dist/index.html 里四条 .need-grid 规则（逐字）：
  行 406 : .need-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: var(--s3); }
  行 1057: .need-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  行 1094: .need-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--s2); }
  行 1122: @media (max-width: 560px) { .need-grid { grid-template-columns: minmax(0, 1fr); } }
$ 「含 overflow-x 的 .need-grid 规则」计数 = 0
```

   全仓（含证据目录）只剩 5 处命中，**全部是注入器源码与评审/证据文档本身**，没有一处是产物或站点源码：
   `research/_raw/home-topic-entry-cards-v1/{t3-mutate.js, t6-m6-check.js}`（注入载荷写在源码里）、
   `REVIEW-REPORT.md`（复核者 T4 的正文）、`_t4-tmp/{t4-evidence-final.log, t4-live-dist-diff.txt}`（T4 的临时证据）。

3. **紧接着跑一次完整套件，0 失败**（`t6-verify-post-restore.{json,log}`，exit 0，80.5s）：

```
✅ 验收 798 项，失败 0 项
$ (Get-FileHash dist/index.html -Algorithm SHA256).Hash   # 跑完之后再回读
8076370E3C7AF29A3C3B6289A57B3B0C673DA033CD1CC8432CFA7FA7652E5242
```

4. **git 现场**（`git diff --stat` 与 `git status --short` 与 T6 前**逐字相同**；`dist/` 被 `.gitignore:2` 忽略，
   变异从不进入 git 视野；被改的 7 个跟踪文件里没有一个是本轮新增的）：

```
$ git diff --stat
 index.html                                       | 166 ++++++-----
 research/_raw/ours-baseline/verify-pre-fold.json |   2 +-
 research/_raw/ours-baseline/verify.json          |   2 +-
 scripts/lib/audience.js                          |  38 +++
 scripts/tools/audience-selftest.js               |  31 ++
 scripts/tools/build-local.js                     | 130 ++++----
 scripts/tools/verify-site.js                     | 362 +++++++++++++++++------
 7 files changed, 517 insertions(+), 214 deletions(-)      ← verify-site.js 由 t2 的 252/84 增至 278/84（T6 新增断言块）
```

**三条阈值同步与两份基线保持不动**（现场取证）：`verify-site.js:275` 仍是 `首屏完整可见卡片 ≥ 6`、
`:2887` 仍是 `列表视图：首屏完整可见 ≥ 10 行`；`git diff research/_raw/ours-baseline/` **只有** `firstScreenFull` 各一行
（`-  "firstScreenFull": 9,` / `+  "firstScreenFull": 6,`），其余字段逐字节未变。

## 15.9 两处口径说明

1. 契约 Verify 第 4 条点名的 `_captain-m6-check.js` 已被队长删除（它是在研的临时探针）。
   T6 改用**自己维护的等价探针** `research/_raw/home-topic-entry-cards-v1/t6-m6-check.js`：
   同样的「Buffer 读写 + 只注入基础规则 + 跑完整套件 + byte-exact 还原」，但退出码更严 ——
   **变红 0 条 → exit 1**（断言没牙就是失败）、锚点命中数不符或还原后字节不等 → exit 2。
   `verify-site.js` 的注释里也改成指向这份探针与 `t6-mut-M6a.*` 记录，不再引用任何不存在的文件。
2. 形态 A / 形态 B **分开记录**（§15.4 与 §15.5），各自带 `appliedHash`、锚点命中数与失败断言名；
   另外保留 t3 的第三种形态（§15.5 引用块）作对照。

**T6 结论：通过 —— finding 关闭（形态 A 由 0 红变 6 红）、既有断言零削弱（+6/−0）、
两轮 verify 全绿（798 / 804）、dist 已交回 frozen 版（sha256 8076370E…、注入残留 0 处、跑完仍 frozen）。**
