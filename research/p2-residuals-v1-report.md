# p2-residuals-v1 报告：三条 P2 残留的现场复核与安全落地

> **一句话**：三条 P2 都拿到了**现场读数**，全部与现行规定**一致**；其中「文本下限余量」这一条
> 落地成了**机器可读的余量登记 + 一条新检查码**（`thin-content-margin`，27 → 28），
> 另外两条各补了一组独立断言（含沙箱实跑变红）。
> **下限公式一个字都没动**（`600 + 60×count` 与 `page-kinds.js` 的声明逐字未改）；
> **产物逐文件未变**（303/303 字节相同，全树摘要相同）。
>
> 基线：`origin/master = 4b366d2`（已 rebase 到 `narrow-reading-columns-v1` 合并之后）。
> 原始读数：`research/_raw/p2-residuals-v1/`（`readings.json` · `floor-census.json` ·
> `mutations.json` · `e2-unavailable-log-build.json` · `product-digest.json` ·
> `text-floor-margins.json`）。
> **四处沙箱实跑**（全部先变红、再逐字节还原、再复跑全绿）见 §4。

---

## 0. 三条 P2 的结论表（先看这张）

| # | NEXT-STEPS §0 / DESIGN-RULES 里的原话 | 现场读数 | 结论 | 落地 |
|---|---|---|---|---|
| **e1** | 「`/need/no-card/` 的文本下限余量只有 **50 字符**（下限公式**不许调低**）」 | 可见正文 **710** 字 − 下限 **660**（`600 + 60×1`）= 余量 **50**；全站最薄，次薄 123 | **不是缺陷，是真残留**：离红线还有 50 字，但没有东西在看着它 | 新增**余量登记**（6 页）+ 新检查码 `thin-content-margin`（跌破登记值即红，**比 `thin-content` 早 50 个字**）+ 沙箱实跑变红 |
| **e2** | 「不可用日志的处置（历史日志读不到时『最近变化』模块隐藏）」 | 真函数三层实跑：日志不可用 ⇒ HTML **0 字节**；日志正常但本页零变化 ⇒ **0 字节**；正对照 ⇒ 478 字节模块在场 | **渲染口径已与 H14 一致，无需修复**；但**构建链上有一处新发现**（日志不可用时构建在 Dataset Manifest 那一步就失败 ⇒ 诚实性措辞上不了线，见 §2.2′） | 补一条**产物级独立复查**（§③″，逐页自洽）+ 沙箱注入空壳模块实跑变红；判据出处见 §2 |
| **e3** | 「入口文案用『全部变化 →』而不是『查看全部 →』」 | 全站 186 页：入口锚 **4 个 / 3 页**（`/`、`/plans/`×2、`/plans/coding/`），逐字都是「全部变化 →」；「查看全部」在产物 **0 处**、在 7 个渲染源文件 **0 处** | **文案口径守住**；但「唯一出处」**不完全成立**（有 1 处硬编码字面量，如实登记） | 新增**源文件级**口径断言（5 条）+ **产物级**独立复查（2 条）+ 沙箱改名实跑变红 |

---

## 1. e1 —— `/need/no-card/` 的文本下限余量

### 1.1 现场读数（命令 + 输出摘录 + 判别式）

```console
$ node .arch-v1/p2-census.cjs dist          # 一次性探针：kind/count 取自构建期同一份计划
共 186 页
=== 余量最薄的 12 页 ===
     50  need/no-card/                    710 字 −  660（kind=need count=1）
    123  category/                        923 字 −  800（kind=hub count=5）
    123  category/audio/                 1083 字 −  960（kind=category count=6）
    136  need/ai-coding/                  976 字 −  840（kind=need count=4）
    139  category/image/                 1039 字 −  900（kind=category count=5）
    142  category/agent/                  982 字 −  840（kind=category count=4）
    409  need/edu-identity/              1429 字 − 1020（kind=need count=7）   ← 从这一页起就是三位数以上
```

```console
$ node scripts/tools/seo-verify.js --dir=dist     # 独立门禁（从 dist 重新数一遍）
=== 正文下限余量登记（P2 残留 e1）· 从 dist 重新数一遍 ===
  need/no-card/          710 字 − 下限  660 = 余量   50（登记值 50）· kind=need count=1
  category/              923 字 − 下限  800 = 余量  123（登记值 123）· kind=hub count=5
  ...（6 行）
  ✓ 正文下限余量登记：6 页的实时余量 ≥ 登记值（独立重算，零调低下限）
```

**判别式**（为什么 50 这个数就是那一页的「离红线距离」）：

```
余量 = visibleText(页面).length − textFloor(kind, count)
     = 710 − (600 + 60 × 1) = 50              # count = 这一页的条目数（/need/no-card/ 只有 1 条）
```

- 计数口径：`scripts/lib/seo.js` 的 `visibleText()`（剥 script/style/注释/标签，折叠空白）；
  独立门禁里我**另写了一个计数器**（`seo-verify.js` 的 `ownVisibleText`），两者在登记页上逐字相同
  ——「登记的字数」这句话因此有两个实现互证。
- 下限口径：`scripts/lib/page-kinds.js` 的 `textFloor()`，`need` 走 `DEFAULT_FLOOR = floor(600, 60)`
  （即 v1.2 起的老口径）。**公式未调低，声明表一个字未改**（`git diff` 里没有 `page-kinds.js`）。
- 复推：`thin-content` 要再掉 **51** 个字才第一次变红 ⇒ 这一页在「全绿」的状态下**只剩 50 字的余量**，
  所以它值得被单独登记，而不是「两道检查全过 ⇒ 没事」。

### 1.2 处置：内容不动 + 机器可读的余量登记（唯一出处 = 代码声明）

**内容一个字都没动**（见 §5 的产物对账）。新增的是「有人在看着它」这件事：

| 位置 | 是什么 |
|---|---|
| `scripts/lib/seo.js` 的 `TEXT_FLOOR_RESIDUALS` | **登记表本体（唯一出处）**：`route / kind / count / chars / floor / margin / registeredAt`，6 条（全站余量 < 150 字的**全部**页面） |
| `research/_raw/p2-residuals-v1/text-floor-margins.json` | 同一张表的**机器可读 JSON 转写**；`seo-selftest` 与声明**逐字节对账**（两份不许漂移） |
| `research/_raw/p2-residuals-v1/floor-census.json` | 全站 186 页的余量普查（机器可读，登记范围的依据） |
| 新检查码 `thin-content-margin` | 构建期（`seo.validate()` 拿到刚写下的页面）与独立门禁（从 dist 重新解析）**两侧都跑** |

**判据**：`实时余量 ≥ 登记值`（相等算过）。跌破时的报错逐字长这样：

```console
$ node scripts/tools/seo-verify.js --dir=.arch-v1/mut-dist-floor      # 沙箱副本：正文砍掉 8 个字符
  ✗ 规则层 28 个检查码全过 —— [thin-content-margin] need/no-card/ 可见正文 702 字符，下限 660，
    余量 42 < 登记值 50（登记于 2026-10-08：本页 710 字 − 下限 660 = 余量 50）；
    余量已跌破登记底线（还没到 thin-content 的红线，但这一页是全站最薄的几页之一）——
    补回内容，或显式重新登记：node scripts/tools/seo-verify.js --print-floor-margins
  ✗ 正文下限余量登记：6 页的实时余量 ≥ 登记值（独立重算，零调低下限）—— need/no-card/：余量 42 < 登记值 50（702 字 − 下限 660）
❌ SEO 验收 17 项，失败 2 项
```

关键读数是**它没有报 `thin-content`**：702 仍在 660 之上，旧红线沉默 —— 新牙**提前 8 个字**抓到了这次变薄
（登记值 50 ⇒ 最多提前 50 个字）。

**重新登记的入口**（有意做成 1 分钟的动作，而不是手数字符）：

```console
$ node scripts/tools/seo-verify.js --dir=dist --print-floor-margins --registered-at=2026-10-08
=== 重新登记：把下面这块贴回 scripts/lib/seo.js 的 TEXT_FLOOR_RESIDUALS ===
  { route: 'need/no-card/', kind: 'need', count: 1, chars: 710, floor: 660, margin: 50, registeredAt: '2026-10-08' },
  ...（6 行，与声明逐字相同）
```

### 1.3 自测里的牙（`npm run selftest:seo` §六，12 条）

| 断言 | 实跑读数 |
|---|---|
| 登记表字段齐全 / 算术自洽（`chars − textFloor(kind,count) === margin`）/ 无重复路由 | ✓ |
| 被点名的 `/need/no-card/` 必须在登记表里（不许静默下架） | ✓ |
| 登记的每一页都还在计划里，且 **kind / 条数与登记时一致**（登记过期即红） | ✓（用 `needsOf`/`collectionsOf` 与构建期同一条判据重算） |
| JSON 转写与声明**逐字节相同** | ✓ |
| 【对照组】余量**正好**等于登记值 ⇒ 不响（边界是「≥」不是「>」） | ✓ |
| 【牙】余量掉到登记值 − 1 ⇒ 红，**点名 `/need/no-card/`**，且此时 `thin-content` 还没响 | ✓ |
| 【牙】那条红里必须写清三个数 + 登记日期 + 重新登记入口 | ✓ |
| 【牙】登记值 **+1** ⇒ 边界那一页跟着变红（证明比的是登记值，不是硬编码的 50） | ✓ |
| 【牙】登记值 **−1** ⇒ 原本跌破的那一页变绿（反方向反证） | ✓ |
| 复位后回到绿（两次牙都没改到真实登记表） | ✓ |

---

## 2. e2 —— 历史日志不可用时「最近变化」的处置

### 2.1 规定原文（H14，`docs/DESIGN-RULES.md` §8）

> **二级页「最近变化」是条件模块：只有存在与当前页面相关的真实变化事件时才渲染。**
> 零变化（含历史日志不可用）**整块不渲染** —— 不留标题、不留空态、不留「记录自 x 起」；
> 基准日 / 起算日 / 变化系统口径**只在 `/changes/` 解释**（诚实性信号由 `/changes/`、首页条带
> 与变化 Feed 承担，三处各有断言）。

### 2.2 现场读数：真函数三层实跑（不是读文档，也不是读源码）

```console
$ node .arch-v1/p4-e2-unavailable.cjs
=== P2 e2：历史日志不可用时「最近变化」的处置（真函数三层实跑）===
  基准日 2026-10-08 · 日志 startedAt=2026-09-30 · 事件 19 条
  A 日志不可用（store=null, availability='unavailable'）：radar=unavailable · totals=0 · HTML 长度 0（**零字节，整块不渲染**）
  B 日志正常但这一页零相关变化（2eae0e246de2）：totals=0 · HTML 长度 0（**零字节，整块不渲染**）
  C 正对照（1fff4784ec9d）：totals=1 · HTML 长度 478 · 模块在场=true · 标题逐字=true · 入口=true
```

链路是**真的三层**（没有任何一层是替身）：
`changes.buildRadar()`（真 `scripts/data/deal-history.json`，19 条事件）→
`landing.topicChangesOf()`（真判据）→ `render-core.changesTopicHtml()`（真渲染函数，从 `index.html` 加载）。

**C 是必须的**：没有正对照，A/B 两个「0 字节」可能只是「这个函数永远返回空串」的假绿。
正对照证明了同一批字节、同一条链路上，模块**是能渲染出来的**（478 字节、标题逐字「最近变化」、入口在场）。

**产物侧读数**（独立门禁 §③″）：186 页里**当前 0 页**渲染这个模块
（生产数据下没有任何目录页收到相关变化）—— 与 H14 的预期一致；模块在场时逐页自洽。

### 2.2′ 一条新发现（如实登记）：这一半是**防御性分支**，在产物上到不了

「日志不可用」在**产物**里照不到的原因不止是「生产现在有日志」。我做了一次源码级副本的实跑
（把沙箱里的 `scripts/data/deal-history.json` 分别**删掉**与**改成坏 JSON**，各构建一次）：

```console
$ node .arch-v1/sandbox-src/scripts/tools/build-local.js       # 沙箱：日志缺失 / 损坏
  变化雷达: 不可用（无历史日志） · 基准日 2026-10-08 · 今日新增 0 · …
❌ 构建失败：Error: Dataset Manifest 形状不合法（1 处）：
  - dataset deal-history: 缺少 updatedAt
```

- 构建**认出了**日志不可用（`变化雷达: 不可用（无历史日志）`，损坏时还打了一行
  「⚠️ 历史日志不可用（…）——本次产物里没有变更记录，`check:history` 会报错」），
- 但它在**更早的一步**就中止了：`build-local.js` 的 `buildManifestFromRegistry` 把
  `historyStore.store.startedAt` 当 `deal-history` 的 `updatedAt`，拿不到 ⇒ `data-docs.assertManifestShape` 抛错。
- 后果：**「产物自检」（含 5197–5203 那条日志不可用的诚实性自检）与 SEO 门禁都没跑到**
  （两次实跑的日志里 `=== 4) 产物自检 ===` 一节**不存在**）。
- 因此：**今天不可能有一份「日志不可用」的产物上线**。H14 的这一半（以及 `/changes/`、首页条带、
  Feed 三处的「没有拿到历史日志」措辞）是**防御性分支** —— 演练它的是 `selftest:changes` R2c 与
  构建期那份合成雷达，不是线上状态。

**这与「H14 是否一致」不冲突**（渲染口径确实按 H14 实现了，且有断言），但它是 e2 真正的残留：
**规定里承诺的诚实性信号，在当前构建链上到不了读者眼前。** 处置见 §7 第 1 条（一行补丁，在
`build-local.js`，不在本轮写作用域）。

**判据出处（逐条点名）**：

| 判据 | 位置 | 实跑 |
|---|---|---|
| 零变化 ⇒ 整块空串（无标题/空态/起算日/空容器） | `scripts/tools/changes-selftest.js` **R2** | ✓ |
| 零变化时连「最近变化」四个字都不留 | **R2b** | ✓ |
| **日志不可用 ⇒ 同样整块不输出** | **R2c**（`rc.changesTopicHtml({availability:'unavailable', …}) === ''`） | ✓ |
| 枢纽页 / 别名页（`topic = null`）⇒ 不输出 | **R2d** | ✓ |
| 旧空态文案一个字都不再出现 | **R2e** | ✓ |
| 有变化时的形态（标题/上限 3 条/顺序/入口/无基准日/不再是 `.snote`） | **R3–R4** | ✓ |
| 日志不可用时**诚实性信号**仍在（`/changes/` 与首页条带都说「没有拿到历史日志」，且**不许**用「没有变化」冒充） | `build-local.js` 5197–5203（用一份 `store: null` 的雷达重跑真渲染函数） | ✓（构建日志见 §4） |
| 诚实性信号的**产物级**守卫 | `verify-site.js` §22c / `/changes/` 与首页条带的既有断言 | 未改（`874 项 / 0 失败`） |

### 2.3 结论与新增的牙

**结论：已一致（H14），不需要修复。** 本轮补的是「独立复查」这一层：

- `seo-verify.js` **§③″**（1 条断言）：186 页逐页 —— 模块在场 ⟺ 页面自报 ≥ 1 条
  （`data-topic-total ≥ 1`、`data-topic-shown ∈ [1, total]`、标题逐字「最近变化」）；
  模块不在场 ⇒ **连 `data-topic-*` 标记都不许留**（零变化 / 日志不可用应当逐字空串）。
  ⚠️ 刻意**不**断言「现在必须是 0 页」：哪天某个目录页真的收到一条相关变化，模块**应该**出现。
- 沙箱实跑变红（注入 H14 修复前的形态）：
  ```console
  $ node .arch-v1/mutate.cjs .arch-v1/mut-dist-topic/need/no-card/index.html topic-zero
  $ node scripts/tools/seo-verify.js --dir=.arch-v1/mut-dist-topic
    ✗ H14 条件模块：186 页逐页自洽（在场必有 ≥1 条；不在场连标记都不留）
        —— need/no-card/：模块在场但 data-topic-total/shown 是 0/0 个 —— 零变化就该整块不渲染，不该留一个空壳
  ```

---

## 3. e3 —— 入口文案「全部变化 →」

### 3.1 全站核对读数

```console
$ node .arch-v1/p3b-wording-dom.cjs dist          # 剥掉 script/style，只看静态 DOM
页面 186 个（静态 DOM，已剥 script/style）
=== ① 静态 DOM 里指向 changes/ 的锚（按文本分组）===
  186 个锚 / 186 页  「变化雷达」          ← 全站导航
    4 个锚 /   3 页  「全部变化 →」        ← **入口**
    4 个锚 /   4 页  「最近变化」          ← 条件模块标题 / 折叠块标题
    2 个锚 /   1 页  「看这一页」          ← /feeds/
=== ③「查看全部」：静态 DOM 0 页 / 含 script 的原始文件 0 页 ===
=== ⑤ 首页 RENDER-CORE 里拼入口的那几行（运行时）===
  '<a class="rmore" href="changes/">' + escapeHtml(L.all) + ' →</a>' +
```

| 读数 | 值 |
|---|---|
| 出现「全部变化 →」的页面 | **3 页 / 4 个锚**：`/`（首页条带 1）· `/plans/`（枢纽块 1 + 套餐变化块 1）· `/plans/coding/`（套餐变化块 1） |
| 出现「查看全部」的页面 | **0**（静态 DOM 0 · 含 `<script>` 模板的原始文件 0） |
| 「查看全部」在源码里 | **0 处**（渲染入口的 7 个源文件全扫）；**全仓 1 处**，在 `research/secondary-page-intro-changes-v1-report.md` 的 R4 行 —— 那是**决定记录**（「有意用『全部变化』，不用字面的『查看全部』」），不是产物文案 |
| 运行时（首页条带） | 由措辞键拼出：`escapeHtml(L.all) + ' →'`（不是字面量） |

**措辞的声明处（4 处，如实列清）**：

| 出处 | 键 | 守卫 |
|---|---|---|
| `scripts/lib/changes.js` | `CHANGES_WORDING.CHANGES_LABELS.all = '全部变化'` | `validate.js --strict` 的 `checkWordingContract()` 与 `index.html` 的**受控副本逐项比对**（改一边不改另一边立刻红） |
| `scripts/lib/plan-changes.js` | `PLAN_CHANGES_WORDING.PLAN_CHANGES_LABELS.allChanges` | 本轮新增（`seo-selftest` §七「三张措辞表同词」） |
| `scripts/lib/plan-changes.js` | `API_PLAN_CHANGES_WORDING.API_PLAN_CHANGES_LABELS.allChanges` | 同上 |
| `scripts/lib/plans-hub-page.js:251` | **字面量** `全部变化 →`（无措辞键） | 本轮新增（「字面量登记」一条：新增第二处手写、或这一处改成读措辞表，**两种都会红**，逼人回来更新登记） |

### 3.2 如实偏差：「唯一出处」不完全成立

e3 的验收词是「**唯一出处** + 出现的页面数」。页面数与文案**成立**（3 页 / 4 锚 / 0 处「查看全部」），
但「唯一出处」**不成立**：`plans-hub-page.js` 把入口写成硬编码字面量，而不是读 `CHANGES_LABELS.all`。

- 本轮**没有**顺手改它：`scripts/lib/plans-hub-page.js` 不在我的写作用域内（见 §7 的建议补丁）。
- 本轮把它**登记成机器可检查的一处**（`seo-selftest` §七最后一条），所以它至少不会再多出第二处。
- 建议的最小补丁（交给 captain 排下一轮）：
  ```js
  // scripts/lib/plans-hub-page.js:251 附近（前缀与类名保持不变）
  const allChanges = require('./changes').CHANGES_WORDING.CHANGES_LABELS.all;
  // …
  <p class="snote"><a href="${escapeHtml(`${prefix}changes/`)}">${escapeHtml(allChanges)} →</a> ·
  ```
  改完之后 `seo-selftest` §七 的「字面量登记」会**变红**（`scripts/lib/` 里一处字面量都没有了）
  —— 这是设计好的：把那一条改成登记 `''`（并写清「已无硬编码」）即可。

### 3.3 新增的牙

- `seo-verify.js` **§③‴**（2 条）：186 页逐字扫「查看全部」（**含 script 模板**）；
  指向 `changes/` 的**箭头锚**必须逐字等于「全部变化 →」（同一件事只有一个词）。
- `seo-selftest.js` **§七**（5 条）：三张措辞表同词 · 首页受控副本同词 · 首页条带用措辞键拼 ·
  7 个渲染源文件无「查看全部」 · `scripts/lib/` 里硬编码字面量的位置 = 登记的那一处。
- 沙箱实跑变红：
  ```console
  $ node .arch-v1/mutate.cjs .arch-v1/mut-dist-wording/plans/index.html wording
  $ node scripts/tools/seo-verify.js --dir=.arch-v1/mut-dist-wording
    ✗ 入口文案：186 页里没有一处「查看全部」（逐字，含 script 模板） —— plans/
    ✗ 入口文案：指向 /changes/ 的箭头锚逐字都是「全部变化 →」（同一件事只有一个词） —— plans/：「查看全部 →」
  ```

---

## 4. 牙的实跑清单（三个沙箱副本，全部变红后逐字节还原）

| 沙箱 | 改了什么 | 期望 | 实跑 |
|---|---|---|---|
| `.arch-v1/mut-dist-floor` | `/need/no-card/` 正文砍掉 **8 个字符**（710 → 702，余量 50 → 42） | 新牙点名该页；`thin-content` 保持沉默 | ✅ 2 条红（规则层 + 登记复核），均点名 `need/no-card/`；`thin-content` 未响 |
| `.arch-v1/mut-dist-topic` | 往 `need/no-card/` 注入**零变化空壳模块**（H14 修复前的形态） | §③″ 点名该页 | ✅ 1 条红，点名 `need/no-card/` |
| `.arch-v1/mut-dist-wording` | `/plans/` 的一处入口改名成「查看全部 →」 | §③‴ 两条都点名 | ✅ 2 条红，均点名 `plans/` |
| `.arch-v1/sandbox-src`（**源码级副本 + 改数据**） | no-card 那条优惠的 `title` 砍掉 9 个字符（改 `.arch-v1/sandbox-src/deals.json`） | **构建期**路径也要红（不是只在独立门禁里红） | ✅ 构建 exit 1：`✗ SEO[thin-content-margin] need/no-card/：可见正文 701 字符，下限 660，余量 41 < 登记值 50`；还原数据后重建 **exit 0**、`✓ SEO 安全门禁: 28 个检查码 × 186 个页面全过` |

第 4 条是关键的一条：它证明**构建期**（`seo.validate()` 拿到的是刚从磁盘回读的页面）与
**独立门禁**（从 dist 重新解析）**两条路径都会响**，而且响的是同一页、同一个判别式。

**还原证明**（`research/_raw/p2-residuals-v1/mutations.json`）：

- 变异**只发生在 `.arch-v1/` 的副本上**；`dist/` 与源码树在整轮实验中一个字节都没动：
  - 变异前 `dist` 全树摘要 `75ecb98344a855b7a72df9df83440b9ebb33eacd3daaa2821f7e4e653fd003a2`
  - 变异后 `dist` 全树摘要**同一个值**（抽查 4 次：`digest-before3` / `digest-pristine2` /
    `digest-withchanges2` / 三次变异实验后的复算，见 `product-digest.json` 与 `mutations.json`）
- 沙箱副本还原后（从 `dist` 逐字节拷回）复跑：**303 文件 / 20282063 B 全树摘要回到同一个值**、门禁
  `✅ SEO 验收 17 项，失败 0 项`。

---

## 5. 产物变化面：逐文件对账（303/303 字节相同）

同一棵树，两次构建：① 判据**原样**（`git stash` 掉本轮脚本改动）② 判据**带本轮改动 + 登记**。

```console
$ node .arch-v1/tree-digest.cjs dist --out=.arch-v1/digest-pristine2.json
dist: 303 文件 / 20282063 B · 全树摘要 75ecb98344a855b7a72df9df83440b9ebb33eacd3daaa2821f7e4e653fd003a2
$ node .arch-v1/tree-digest.cjs dist --out=.arch-v1/digest-withchanges2.json
dist: 303 文件 / 20282063 B · 全树摘要 75ecb98344a855b7a72df9df83440b9ebb33eacd3daaa2821f7e4e653fd003a2
```

| 量 | 值 |
|---|---|
| 文件数 | 303 / 303 |
| 逐文件 sha256 差异 | **0** |
| 只在原样一边的文件 | **0** |
| 只在本轮一边的文件 | **0** |
| 全树摘要 / 清单摘要 | 两次**相同**（`75ecb983…` / `1398a352…`） |

逐文件明细在 `research/_raw/p2-residuals-v1/product-digest.json`（含两次的 per-file sha256 清单摘要）。
**产物变化面 = 0 个文件**，所以没有「必须解释的产物差异」这一栏。

> 说明：`research/_raw/p2-residuals-v1/text-floor-margins.json` 是**本轮新增的登记转写**（不是产物），
> 它由 `seo-selftest` 与代码声明逐字节对账，改登记只能改 `scripts/lib/seo.js`。

---

## 6. 断言数与门禁读数（只增不减）

| 门禁 | 基线（判据原样） | 本轮 | 变化 |
|---|---|---|---|
| `npm run selftest:seo` | **69 项 / 0 失败** | **87 项 / 0 失败** | **+18** |
| `npm run verify:seo` | **11 项 / 0 失败** | **17 项 / 0 失败** | **+6** |
| `seo.js` 的检查码 | 27 个 | **28 个**（+`thin-content-margin`） | +1 |
| `npm run verify`（真浏览器） | 874 项 / 0 失败 | **874 项 / 0 失败** | 0（本工具未被本轮改动碰过） |
| `npm run selftest:changes` | 119 项 / 0 失败 | **119 项 / 0 失败** | 0（e2 的判据原样保留） |
| `npm run check:ci` | 39 / 0 | **39 / 0** | 0 |
| `npm run check:evidence` | 绿 | **绿**（无新增 Tier-3） | 0 |
| `node scripts/tools/build-local.js` | exit 0 | **exit 0**（`✓ SEO 安全门禁: 28 个检查码 × 186 个页面全过`） | +1 码 |

---

## 7. 我没动的、需要 captain 排下一轮的（写作用域之外）

1. **`scripts/tools/build-local.js` 的 Dataset Manifest（e2 的真残留，一处）**：日志不可用时
   `buildManifestFromRegistry` 拿不到 `deal-history` 的 `updatedAt`（它取的是 `historyStore.store.startedAt`）
   ⇒ 构建在那一步硬失败 ⇒ 「日志不可用」的诚实性措辞**永远上不了线**（§2.2′ 的两次实跑）。
   最小补丁方向（二选一，都需要 captain 拍）：
   - **(a)** `updatedAt` 改成「有日志用 `startedAt`，没日志用数据基准日 / 显式 `unavailable`」，
     并让 `data-docs.assertManifestShape` 接受这个显式状态 —— 这样产物才会真的以「日志不可用」上线；
   - **(b)** 明确写成**策略**：「日志不可用 ⇒ 不上线（fail-closed）」，那就要在 DESIGN-RULES 里
     说明 H14 的这一半是**防御性分支**，并把「什么时候它会真的到读者眼前」写清楚。
   我倾向 (a)：措辞、自检、三处诚实性信号都已经写好了，只差这一步不再拦它。
2. **`scripts/lib/plans-hub-page.js`**（e3 的「唯一出处」）——补丁见 §3.2。
3. **`scripts/tools/check-ci-consistency.js:191` 的注释漂移**：注释里写着
   「SEO 门禁自测（**27** 个检查码逐条定向篡改…）」，现在是 **28**。这是**注释**，不是判据
   （`check:ci` 实跑 39/0 与它无关），但它会误导下一个读书的人。
4. **`docs/DESIGN-RULES.md`**（本轮不许动）——建议插入的两行 + 一处追加，原文见 §8。
5. **`NEXT-STEPS.md` §0**（本轮不许动）——三条 P2 的收口写法见 §8。

### 另外三条我**没有**做的判定（如实说明边界）

- **verify-site.js 侧没有再补判据**：那是我写作用域之外的文件。本轮的独立复查全部落在
  `seo-verify.js`；`verify-site.js` 的 §22c 与变化模块断言**原样**跑过（874/0）。
- **e2 的「日志不可用」在产物里照不到**（生产现在有日志）。我用三条实跑读数 + 构建期的
  真函数自检（`build-local.js` 5197–5203）+ `selftest:changes` R2c 三处合起来覆盖；
  唯一没有做的，是**端到端跑一次「删掉 `deal-history.json` 再构建」**（见 §9 的自审边界）。
- **下限公式的单调性**没有新增断言：`page-kinds.js` 的 `textFloor` 不在我的写作用域，
  且本轮**一个数字都没改**（`git diff` 可证）。

---

## 8. 建议交给 captain 落进收口文件的行（原文，可直接粘贴）

### 8.1 `docs/DESIGN-RULES.md` §9（依赖与工程）表格新增一行

```markdown
| N7 | **正文下限的「余量」要登记，跌破登记值就红 —— 不许等跌破下限才响**。下限公式**只增不减**（`page-kinds.js` 的口径 + `v3.0-antigaming` 的单调性规则），所以「还没红」不等于「没事」：离红线最近的那几页必须有一张**机器可读的登记**（页路由 / 当前字数 / 下限 / 余量 / 登记日期），判据是**实时余量 ≥ 登记值**。余量变小有两条路（正文变少 / 条数变多 ⇒ 下限涨得比正文快），两条都要被人看见；处置只有两条：补回内容，或**显式重新登记**（`node scripts/tools/seo-verify.js --print-floor-margins` 打印可逐字贴回的登记块） | 2026-10-08 实测：`/need/no-card/` 可见正文 **710** 字 − 下限 **660**（`600 + 60×1`）= 余量 **50**，全站最薄（次薄 123 字）；`thin-content` 要再掉 51 字才第一次变红。全站余量 < 150 字的共 **6 页**（50 / 123 / 123 / 136 / 139 / 142），第 7 页起是 409 | 断言：新检查码 **`thin-content-margin`**（27 → 28，构建期与独立门禁两侧都跑）+ `seo-selftest` §六 **12 条**（字段齐全 / 算术自洽 / 无重复 / 被点名页必须在登记里 / 登记过期即红 / JSON 转写逐字节对账 / 边界「≥」对照组 / 登记值 ±1 的两条反证）+ `seo-verify.js` 的独立复核。沙箱实跑：正文砍 8 个字 ⇒ 余量 42 < 50 ⇒ 点名该页变红，而 `thin-content` 保持沉默 |
```

### 8.2 `docs/DESIGN-RULES.md` §8（内容与诚实性）表格新增一行

```markdown
| H15 | **「同一件事只有一个词」是可检查的口径**：「全部变化 →」是全站对「变化全量入口」唯一的写法，**任何地方都不许出现「查看全部」**；入口文案必须来自措辞键（`CHANGES_LABELS.all`），页面壳不许自己写死一份 —— 若确实要硬编码，必须**登记**（新增第二处 = 红） | 2026-10-08 实测：186 页里入口锚 **4 个 / 3 页**（`/` 首页条带、`/plans/` 两处、`/plans/coding/`），逐字都是「全部变化 →」；「查看全部」在产物 **0 处**（静态 DOM 0 / 含 `<script>` 模板 0）、在 7 个渲染源文件 **0 处**。**如实偏差**：`plans-hub-page.js:251` 是硬编码字面量（不是措辞键），已登记为唯一一处，补丁待下一轮 | 断言：`seo-verify.js` §③‴ 两条（186 页逐字扫「查看全部」含 script 模板；指向 `changes/` 的箭头锚必须逐字等于「全部变化 →」）+ `seo-selftest` §七 五条（三张措辞表同词 / 首页受控副本同词 / 首页条带用措辞键拼 / 7 个源文件无「查看全部」/ `scripts/lib/` 里字面量的位置 = 登记的那一处）。沙箱实跑：把 `/plans/` 一处改名 ⇒ 两条断言同时点名 `plans/` |
```

### 8.3 `docs/DESIGN-RULES.md` 里 `> **唯一 DEFERRED（P2）**`（`secondary-page-content-simplification` 小节）后面追加一段

```markdown
> **2026-10-08 更新（p2-residuals-v1）**：这条残留的处置不是「补内容」，而是**把它登记成一条底线**。
> 实测：`/need/no-card/` **710 − 660 = 50**（`/category/` 枢纽现为 **123**，不是当时写的 146 —— 那一轮的
> 数量基于当时的子页数与正文）。全站余量 < 150 字的 **6 页** 登记在 `scripts/lib/seo.js` 的
> `TEXT_FLOOR_RESIDUALS`（JSON 转写：`research/_raw/p2-residuals-v1/text-floor-margins.json`），
> 判据是**实时余量 ≥ 登记值**，跌破即 `thin-content-margin` 红（27 → 28）。**下限公式依旧不许调低。**
> 报告：`research/p2-residuals-v1-report.md`；自审：`research/p2-residuals-v1-self-audit.md`；
> 原始读数：`research/_raw/p2-residuals-v1/`。
```

### 8.4 `NEXT-STEPS.md` §0 的「剩余事项」里，把三条 P2 改成收口写法

```markdown
6. **P2 残留（三条）—— ✅ 已收口（`p2-residuals-v1`，2026-10-08）**：
   ① **文本下限余量**：`/need/no-card/` 实测 **710 字 / 下限 660 / 余量 50**（全站最薄，次薄 123）。
   **下限公式一个字未改**；处置是新增**余量登记**（6 页，`scripts/lib/seo.js` 的 `TEXT_FLOOR_RESIDUALS`
   + JSON 转写 `research/_raw/p2-residuals-v1/text-floor-margins.json`）与检查码 **`thin-content-margin`**
   （27 → 28，跌破登记值即红，比 `thin-content` 至多早 50 个字；沙箱砍 8 个字实跑点名变红）。
   ② **不可用日志的处置**：与 **H14** 一致（零变化 / 日志不可用 ⇒ 整块不渲染），**无需修复**；
   真函数三层实跑：不可用 ⇒ 0 字节、零变化 ⇒ 0 字节、正对照 478 字节；判据出处 `selftest:changes`
   的 R2 / R2b / R2c / R2d，另补产物级独立复查（`verify:seo` §③″）。
   ③ **入口文案**：全站 186 页里入口锚 **4 个 / 3 页**（`/` `/plans/`×2 `/plans/coding/`）逐字
   「全部变化 →」，「查看全部」**0 处**（产物与 7 个渲染源文件都扫过）；**如实偏差**：
   `plans-hub-page.js:251` 是硬编码字面量（已登记，补丁待下一轮）。
   交付读数：`verify:seo` **11 → 17 项 / 0 失败**、`selftest:seo` **69 → 87 项 / 0 失败**、
   `verify` **874 / 0**、`check:ci` **39 / 0**、产物 **303/303 逐字节未变**。
```

---

## 9. 复现命令（一条一条都能跑）

```console
# 现场读数（一次性探针，不进库）
node .arch-v1/p2-census.cjs dist --json=.arch-v1/p2-census.json     # e1 全站余量普查
node .arch-v1/p4-e2-unavailable.cjs --json=…                        # e2 真函数三层实跑
node .arch-v1/p3b-wording-dom.cjs dist --json=…                     # e3 入口文案全站普查

# 门禁
node scripts/tools/build-local.js
node scripts/tools/seo-selftest.js            # 87 / 0
node scripts/tools/seo-verify.js --dir=dist   # 17 / 0
node scripts/tools/verify-site.js --dir=dist --json=.arch-v1/p2-after.json   # 874 / 0
npm run check:ci                              # 39 / 0
npm run check:evidence

# 重新登记（改登记表之后）
node scripts/tools/seo-verify.js --dir=dist --print-floor-margins --registered-at=YYYY-MM-DD
node -e "const fs=require('fs'),seo=require('./scripts/lib/seo');\
fs.writeFileSync('research/_raw/p2-residuals-v1/text-floor-margins.json', JSON.stringify(seo.TEXT_FLOOR_RESIDUALS,null,2)+'\n')"
```

**本轮改动的文件**：`scripts/lib/seo.js` · `scripts/tools/seo-selftest.js` · `scripts/tools/seo-verify.js`
· `research/_raw/p2-residuals-v1/`（6 个文件）· 本报告 · `research/p2-residuals-v1-self-audit.md`。
**没有碰**：`scripts/tools/build-local.js` · `scripts/tools/verify-site.js` · `scripts/lib/landing.js`
· `scripts/lib/plans-hub-page.js` · `docs/DESIGN-RULES.md` · `NEXT-STEPS.md` · `dist/` · `package.json`
· `.github/`。

### 沙箱实验（一次性，全部在 `.arch-v1/`，不进库）

```console
# ① 产物级：正文砍短 ⇒ 独立门禁点名（余量 42 < 50，thin-content 仍沉默）
Copy-Item -Recurse dist .arch-v1/mut-dist-floor
node .arch-v1/mutate.cjs .arch-v1/mut-dist-floor/need/no-card/index.html floor-8
node scripts/tools/seo-verify.js --dir=.arch-v1/mut-dist-floor          # exit 1
Copy-Item dist/need/no-card/index.html .arch-v1/mut-dist-floor/need/no-card/index.html -Force
node scripts/tools/seo-verify.js --dir=.arch-v1/mut-dist-floor          # exit 0（逐字节还原后复绿）

# ② 产物级：注入零变化空壳模块（H14 的老形态）⇒ §③″ 点名
node .arch-v1/mutate.cjs .arch-v1/mut-dist-topic/need/no-card/index.html topic-zero
node scripts/tools/seo-verify.js --dir=.arch-v1/mut-dist-topic          # exit 1

# ③ 产物级：入口改名「查看全部 →」⇒ §③‴ 两条点名
node .arch-v1/mutate.cjs .arch-v1/mut-dist-wording/plans/index.html wording
node scripts/tools/seo-verify.js --dir=.arch-v1/mut-dist-wording        # exit 1

# ④ 源码级：改数据（title 砍 9 字）⇒ **构建期**点名；还原数据后重建全绿
node .arch-v1/sandbox-src/scripts/tools/build-local.js                 # 先确认沙箱基线 green
#   改 .arch-v1/sandbox-src/deals.json 里 no-card 那条的 title
node .arch-v1/sandbox-src/scripts/tools/build-local.js                 # exit 1（thin-content-margin）
Copy-Item deals.json .arch-v1/sandbox-src/deals.json -Force
node .arch-v1/sandbox-src/scripts/tools/build-local.js                 # exit 0

# ⑤ e2：源码级副本里把日志删掉 / 改坏，各构建一次（读数见 §2.2′）
```
