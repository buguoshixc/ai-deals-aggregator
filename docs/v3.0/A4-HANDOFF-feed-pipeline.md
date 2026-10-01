# A4 流水线基建 —— 交付物与接线说明（t4 / feed-pipeline）

> 本文件是 t4 的交接单：**前半是已实现的东西（可直接读的 API）**，
> **后半是必须在 `build-local.js` 里接线的地方（t13 的写入范围）**。
> 行号基于 t4 完成时的 worktree；按锚点（函数名 / 注释）定位更稳。

---

## 一、已实现（t4 提交范围）

| # | 交付物 | 位置 |
|---|---|---|
| 1 | `apiPlanEventIdOf()` + 写入点打点 + `verifyStore` 重算比对 | `scripts/lib/api-plan-history.js`、`scripts/lib/plan-history.js` |
| 2 | 多 spec 变化 Feed 注册表 | `scripts/lib/feeds.js` 的 `PLAN_CHANGE_FEEDS` |
| 3 | API 变化分栏（第二个来源，共用分栏骨架） | `scripts/lib/plan-changes.js` 的 `buildApiPlanRadar()` |
| 4 | 页面与订阅共用的 API 变化句子 | `scripts/lib/api-plans-page.js` 的 `apiPlanChangeTextOf()` |
| 5 | 牙（实跑变红） | `feeds-selftest.js`（+26 项）、`api-plans-selftest.js`（+19 项）、`check-api-plan-history.js`（独立复算 + 样本数） |

### 1. 派生事件身份

```js
const ah = require('./scripts/lib/api-plan-history');
ah.apiPlanEventIdOf(event);            // 12 位 hex，与 plan-history.eventIdOf 同一套基
ah.API_PROFILE.eventIdOf === ah.apiPlanEventIdOf;   // 写入内核读它
```

- 写入点：`plan-history.js` 的 `record()` 里 `eventId: eventIdFor(profile, event)`（读 `profile.eventIdOf`）。
- 校验点：`plan-history.eventIdProblems(events, profile)` —— 两条 profile **共用这一条实现**；
  `apiValidateExtra` 与 `plan-history` 的 `validateExtra` 都调它。
- 「没写」（老日志里 `eventId === undefined`）**不判红**；「写了一个错的」**必红**。

### 2. 多 spec 注册表

```js
feeds.PLAN_CHANGE_FEEDS;              // [{id:'plan-changes', changeSource:'plans', pageKind:'plans-coding', pageRoute:'plans/coding/', alwaysGenerated:true},
                                      //  {id:'api-plan-changes', changeSource:'api', pageKind:'plans-api', pageRoute:'plans/api/', alwaysGenerated:false}]
feeds.changeFeedSpecOf('api');        // → api 那条 spec
feeds.changeSpecForPage({route:'plans/api/'});   // 按 route 解析
feeds.changeSpecForPage({kind:'plans-api'});     // 按 kind 解析
feeds.feedsForPage({route:'plans/api/'}, allFeeds);
feeds.PLAN_CHANGE_FEED;               // v2.3 兼容别名 = PLANS 那条（老调用点不用改）
feeds.CHANGE_SOURCES;                 // {plans, api} —— 领域差异**只**登记在这里
feeds.changeItemsFor(spec, {view, records, providerTable});   // 唯一的条目实现
```

**关键设计：`alwaysGenerated`**

- `plans`（coding）—— v2.3 起**始终生成**：日志不可用时它说「没有拿到日志」。
- `api` —— 只有调用方交出**变化视图**（`changeViews.api`）时才登记。
  未接线时不登记，并把这件事记在 `bundle.changeFeedsSkipped = [{id, reason:'no_change_view'}]`。
  **理由**：接线前生成一份空 Feed，会把「这条链路还没接线」说成「没有变化」或「日志不可用」，两种都是假话。
  接线完成后（t13）把 `alwaysGenerated` 改成 `true` 即可，条目代码一个字都不用动。

### 3. `buildFeeds` 入参（两种形状等价）

```js
// 推荐（v3.0）
feeds.buildFeeds({
  changeViews: {
    plans: { radar: planRadar, availability: planHistoryAvailability, records: plansStore.plans, providerTable },
    api:   { radar: apiPlanRadar, availability: apiPlanHistoryAvailability, records: apiPlansStore.plans, providerTable }
  },
  …其余参数不变
});
// 兼容（v2.3 老参数；build-local 现在就是这一种）
feeds.buildFeeds({ planRadar, planAvailability, plans, providerTable,
                   apiPlanRadar, apiPlanAvailability, apiPlans, apiProviderTable, … });
```

`feeds.validate()` 同样两种形状：
`changeViews: {plans:{events,availability}, api:{events,availability}}` 或
老的 `planEvents/planAvailability` + 新的 `apiPlanEvents/apiPlanAvailability`。

> ⚠️ `validate()` 的对账是**按来源分开**的：API Feed 的条目只认 `api-plan-history` 的事件身份。
> 把两份日志合成一个集合，「API 订阅里混进了套餐事件」这条最该报红的事会静默通过。

### 4. API 变化分栏

```js
const apiPlanRadar = planChanges.buildApiPlanRadar({
  plans: apiPlansStore.plans,          // 与 api-plans.json 的数组键同名
  store: apiPlanHistoryStore,          // null ⇒ availability 由 availability 参数决定
  asOf: String(apiPlansStore.updatedAt).slice(0, 10),
  availability: apiPlanHistoryAvailability,
  providerTable                        // 平台键 → 显示名（不传则回落成键）
});
// 形状与 buildPlanRadar 完全一致：{availability, asOf, startedAt, windows, coverage, totals, sections, other, home}
```

---

## 二、`build-local.js` 里需要接线的 7 处（**已由 t11 全部完成**，见 §六）

> ✅ **2026-10-01 t11 已按本节的 ①–⑦ 逐处接线并验证**（`build-local.js` 的写入权在阶段 J 交给我，
> t11 需要 H1/H2/H4 真的上线，因此就地完成）。本节保留为**当时的接线单**，
> 用来核对「有没有哪一处被漏掉」；t13 不需要再做一遍，只需要按 §六 的清单复核。

### ① 构造 API 变化视图（在 `apiPlanHistoryStore` 之后，约 `2480` 行后）

```js
const apiPlanRadar = planChanges.buildApiPlanRadar({
  plans: apiPlansStore.plans,
  store: apiPlanHistoryStore,
  asOf: String(apiPlansStore.updatedAt || '').slice(0, 10),
  availability: apiPlanHistoryAvailability,
  providerTable
});
const apiPlanRadarStats = planChanges.summarize(apiPlanRadar);
```
（`planChanges` 已在 build-local 顶部 require。）

### ② `buildFeeds({…})`（约 `2544-2556`）加四个参数

```js
    apiPlanRadar,
    apiPlanAvailability: apiPlanHistoryAvailability,
    apiPlans: apiPlansStore.plans,
    apiProviderTable: providerTable,
```
传了这两个之后 `bundle.feeds` 从 **24** 变 **26**，多出
`feed/plans/api/changes.xml` / `.json`。

### ③ `/feeds/` 分组表（约 `1645-1668`）——**必改，否则订阅中心漏列**

```js
    {
      key: 'plans', label: '套餐与 API 计费',
      // 用注册表展开，不要在分组表里写死 id：加第三个来源时这里不用再改第二次。
      ids: feeds.PLAN_CHANGE_FEEDS.map(spec => spec.id),
      note: '套餐变化来自 plans.json，API 价格变化来自 api-plans.json —— 两份互不注入的数据；'
        + '每条变化都能在<a href="../plans/coding/">套餐对比页</a>或<a href="../plans/api/">API 计费对比页</a>找到落点。'
    },
```

### ④ `rowHtml` 的起算日 / 措辞（约 `1677-1683`）——**必改，否则 API 那条用的是套餐日志的起算日**

```js
    const changeKind = spec.kind === 'changes' || spec.kind === 'plan-changes';
    const sinceLabels = spec.kind !== 'plan-changes'
      ? changes.CHANGES_WORDING.CHANGES_LABELS
      : (spec.changeSource === 'api'
        ? planChanges.API_PLAN_CHANGES_WORDING.API_PLAN_CHANGES_LABELS
        : planChanges.PLAN_CHANGES_WORDING.PLAN_CHANGES_LABELS);
    // buildFeeds 已经按**来源**把 startedAt 写进 spec 了 —— 别再拿 context.planStartedAt 顶替
    const sinceDate = spec.kind === 'plan-changes'
      ? (spec.startedAt || context.asOf || '未知')
      : (context.startedAt || context.asOf || '未知');
```

### ⑤ 空态说明 `emptyPlanNote`（约 `1716-1721`）——**必改，否则 API 的空态会说套餐的话**

按 feed 逐条生成，起算日与可用性都取**它自己**那一份：

```js
  const changeAvailabilityOf = feed => (feed.spec.changeSource === 'api'
    ? context.apiPlanAvailability : context.planAvailability);
  const emptyChangeNotes = feedList
    .filter(feed => feed.spec.kind === 'plan-changes' && !feed.items.length)
    .map(feed => `<p class="snote">${htmlEscape(feed.spec.title)}现在是空的：这套变更记录自 `
      + `${htmlEscape(feed.spec.startedAt || context.asOf || '未知')} 起算……`
      + `${changeAvailabilityOf(feed) !== 'ok' ? '（本次构建没有拿到这份变化日志，因此无法确认有没有变化。）' : ''}</p>`)
    .join('\n');
```
（`context` 里要新增 `apiPlanAvailability`，见 ⑥。）

### ⑥ `/plans/api/` 页面声明自己的订阅源（`renderApiPlansPage` 约 `1443`，调用点约 `2777`）

`/plans/coding/` 现在用 `feeds.PLAN_CHANGE_FEED.id` 硬编码取；`/plans/api/` 一行都没声明。
两处都收敛到注册表：

```js
// renderPlansPage（约 1229-1230）
const pageFeeds = feeds.feedsForPage({ route: plansPage.PLANS_ROUTE }, context.allFeeds || []);
const changeFeedTags = (pageFeeds.length ? feeds.feedLinkTags(pageFeeds, '../../') + '\n' : '')
  + feeds.rootFeedTags('../../');
// renderApiPlansPage（约 1489）
const apiPageFeeds = feeds.feedsForPage({ route: apiPlansPage.API_PLANS_ROUTE }, context.allFeeds || []);
${feeds.feedLinkTags(apiPageFeeds, prefix)}
${feeds.rootFeedTags(prefix)}
```
调用点（约 2777）补 `allFeeds: feedBundle.feeds`。

> 连带影响：`verify-site.js` 的 `expectedFeedTags()` 是**按 `feedsForPage` 算**的
> （只传 `{kind, slug}`，目前不覆盖固定路由页）。`/plans/api/` 的真浏览器断言要按
> `feedsForPage({route:'plans/api/'}, built.feeds)` 的条数来写，**不要写死 2 或 4**。

### ⑦ 产物自检里两处「只找第一条 plan-changes」的地方（t13 必改）

| 位置 | 现状 | 改法 |
|---|---|---|
| `build-local.js` 约 `4464` | `feeds.find(f => f.spec.kind === 'plan-changes')` → 只拿到套餐那条，API 条目**深链锚点不会被检查** | 逐条 feed 检查，锚点所在页面按 `spec.pageRoute` 取（`plans/coding/#plan-*` ↔ `/plans/coding/`，`plans/api/#plan-*` ↔ `/plans/api/`）：锚点 id 都是 `plan-<planId>`，直接回读该页 HTML |
| `build-local.js` 约 `4455`（`feeds.validate` 入参） | 只传 `planEvents/planAvailability` | 加 `apiPlanEvents: JSON.parse(fs.readFileSync(OUT/api-plan-history.json)).events`、`apiPlanAvailability` |
| `build-local.js` 约 `4669`（SEO `fixed` 描述符 `feedMatch`） | `[feeds.PLAN_CHANGE_FEED.id]` | `feeds.feedsForPage({route: apiPlansPage.API_PLANS_ROUTE}, built.feedBundle.feeds).map(f => f.spec.id)`；API 页的描述符同样要写 `feedMatch` |

> ⚠️ 题面牙 #16：「API Feed event 指向不存在页面锚点」。
> `feeds.validate()` 的 `link-exists` 只判**路由**存在（锚点是片段，不改变「哪一页」），
> 所以锚点的存在性必须由上面的构建期断言盯着 —— 那是唯一会红的地方。

---

## 三、t4 完成时的实测数字（可复核）

| 命令 | 结果 |
|---|---|
| `node scripts/tools/feeds-selftest.js` | 110 项通过 / 0 失败（t4 前 84 项） |
| `node scripts/tools/api-plans-selftest.js` | 95 项通过 / 0 失败（t4 前 76 项） |
| `node scripts/tools/plan-history-selftest.js` | 132 项通过 / 0 失败 |
| `node scripts/tools/plans-selftest.js` | 202 项通过 / 0 失败（t4 时点；该文件此后被其他任务的改动覆盖） |
| `node scripts/tools/check-api-plan-history.js` | exit 0（`派生 eventId: 0/0 条事件带 id · 重算比对 0 处不一致（本轮这份日志是 0 事件…）`） |
| `node scripts/tools/check-plan-history.js` / `check-feeds-reproducible.js` | exit 0 |
| `node scripts/tools/build-local.js` | exit 0（订阅：24 个 Feed × 2 格式 = 48 个文件 · 显式允许为空的：new、changes、plan-changes） |
| `node scripts/tools/verify-site.js`（真浏览器，`DSH_EDGE`） | 验收 **440** 项，失败 0 项 |
| 其余离线门禁（`validate --strict` / 21 支 selftest / 三条 reproducible / `check:ci` / `verify:seo`） | 全绿（29 步 0 失败） |

### 牙（实跑变红 → 逐条还原 → 复绿）

| # | 污染方式（精确替换） | 预期失败 | 实际失败 | 还原 |
|---|---|---|---|---|
| A | `api-plan-history.js`：摘掉 `problems.push(...planHistory.eventIdProblems(...))` | 手写 eventId 那条牙变红 | 2 项红：`【牙】手写 / 篡改 eventId ⇒ verifyStore 报「派生字段不得手写」`、`派生字段的「重算并比对」只有一份实现…`（93 通过 / 2 失败，exit 1） | 文件还原 ⇒ 95/0 |
| B | `feeds.js`：api spec 的 `alwaysGenerated: false` → `true` | 「未接线时不登记」变红 | 4 项红：`未交出 API 变化视图时不登记 API 订阅`、`未篡改的真实产物：0 个问题`（`page-exists: 主页指向不存在的页面：plans/api/`）、`套餐变化 Feed 未篡改时 0 个问题`、`空 Feed 会被判红…`（exit 1） | 文件还原 ⇒ 110/0 |
| D | `feeds.js`：`changeMaterialOf` 恒返回套餐那份材料（两份日志不分明） | API 订阅的对账失去来源 | 1 项红：`API 价格变化订阅未篡改时 0 个问题` → `change-event-exists:… 在 api-plan-history.json 里找不到对应事件`（109/1，exit 1） | 文件还原 ⇒ 110/0 |
| E | `feeds.js`：`changeSpecForPage` 里删掉 `page.route` 分支 | 按路由解析变红 | 2 项红：`feedsForPage 按 page.route 解析到 API 那一份`、`…到套餐那一份（老路由不回退）`（108/2，exit 1） | 文件还原 ⇒ 110/0 |
| F | `plan-changes.js`：api 来源改用套餐的判据表（`metaFieldTypes`/`homePriority`） | API 分栏优先级变红 | 1 项红：`API 分栏：「最近变化」块按 API 自己的优先级取…`（94/1，exit 1） | 文件还原 ⇒ 95/0 |

**注意**：t4 阶段 `build-local.js` 未接线，所以 `dist/` 的 Feed 数与基点逐字节相同
（`PLAN_CHANGE_FEEDS` 里 API 那条因 `alwaysGenerated:false` 被跳过）——
这不是「没做」，而是「登记了但还没启用」，且这件事在 `changeFeedsSkipped` 里可读。

---

## 四、t13 接线后的预期变化

> ⚠️ **本节在 t4 完成后更新过一次**：t4 交付时 `api-plan-history.json` 是 0 事件，
> 此后 A3（数据扩充）往日志里落了 **6 条 `created` 事件**，于是「API 变化 Feed 必然为空」
> 这句话**不再成立**。下表是**在真实数据上只读干跑**（不改 build-local）得到的实测值。

- Feed 数 **+1**（+`feed/plans/api/changes.*`）；`/feeds/` 多一行「API 价格变化」。
- `/plans/api/` 的 `<head>` 多一对 `rel="alternate"`（RSS + JSON Feed）。
- **实测（干跑，`asOf = 2026-10-01`）**：

  | 项 | 值 |
  |---|---|
  | `buildApiPlanRadar` totals | `{created:6, changed:0, ended:0, restored:0, meta:0}`，availability `ok`，startedAt `2026-10-01` |
  | API Feed 条目数 | **6**（非空！） |
  | guid 序列 | `721e0657c80d, 422949164f14, ac2f68ab9fc3, d67c4c1a37dc, 989143bdd068, bbacdbbbeb44`（== 日志里 6 条事件的 `eventId`） |
  | 深链 | 全部 `…/plans/api/#plan-<planId>`（这 6 个锚点必须真实落在 `/plans/api/` 上 —— 见 §五 B3） |
  | 条目标题 | 腾讯云 · 混元生文按量计费 / 硅基流动 · 模型推理按量计费 / MiniMax（稀宇科技） · API 按量计费 / 火山引擎 · 豆包模型 API 按量计费 / 阿里云 · 模型推理按量计费(中国内地) / 阿里云 · 模型推理按量计费(闲时) |

  干跑路径（只读，可直接复核）：
  `buildApiPlanRadar({plans: api-plans.plans, store: api-plan-history, asOf, availability:'ok', providerTable})`
  → `feeds.buildFeeds({…, apiPlanRadar, apiPlanAvailability:'ok', apiPlans, apiProviderTable})`。
  同时复核过：6/6 条事件的 `eventId` 与 `apiPlanEventIdOf` 重算值一致（0 处不一致）。

  同一次干跑里另外两个数（t13 做 B1/B2 断言时会用到）：
  · **套餐那条**（`plan-changes`）在同一份数据上是 **14 条**条目（`plan-history` 14 条 created）；
  · 两条日志的 `startedAt` **都是 `2026-10-01`** ⇒ 这正是 §五 B2 要求「必须用注入不同
    `startedAt` 的夹具」的原因：拿真实数据写断言，两条起算日相同，把起算日取错来源也照样绿。
  · 干跑时 `feeds.buildFeeds` 的总 Feed 数是 23（含 api 那条）；它与 build-local 的 24 差 1，
    原因是干跑没有 build-local 的厂商门槛上下文（`vendorKeyOf` 等），**不要把这个差值当回归**。

- **空态仍然必须存在且必须说对话**：`FEEDS_WORDING.FEEDS_NOTES.emptyApiPlanChanges` 与
  「没有拿到日志」是两句不同的话，将来日志被清空 / 不可用时由它们兜底；
  真实数据非空只说明**这一轮**没有样本，不是把空态断言删掉的理由。
- 若把 `alwaysGenerated` 改成 `true` 而忘了传 `changeViews.api`，
  症状是描述里出现「没有拿到日志」而日志其实在盘上 —— 这是**假话**，不要在 t13 里那么做。

### 给 t11（`/changes/` API 分栏）的接口提示

`pages-builder` 在 t5 给 `plans-page.planChangeItemHtml(item, opts)` 加了**可选** `opts.planHref(item)`
（缺省仍是页内锚点 `#plan-<id>`，逐字节不变）；`planChangesPageBlockHtml`（`/changes/` 那一支）
传的是 `${prefix}plans/coding/#plan-<id>` —— 因为 `/changes/` 上没有那些表格行，
页内锚点会变成点不动的死链（真浏览器实测 14 条 + 资料入口 5 条 = 19 条）。

API 分栏在 `/changes/` 上复用时**沿用同一个做法**：行内链接必须显式写成
`${prefix}plans/api/#plan-<planId>`（API 记录的行锚点在 `/plans/api/`，不在 `/changes/`）。
相应地 `/changes/` 的锚点断言必须是「**逐条验证落点**」，不能是「数 `#plan-` 前缀」——
后者在跨页深链之后恒真。另外复用 `api-plans-page.js` 的块时要保留
`<b>…</b>` 这种写法（作者正文里不得残留 Markdown `**`，t5 修过的那个 `snote` 就是这么红的）。

**t11 会撞到的两条硬编码断言（已实测定位，必须一起改，否则真浏览器门禁假红/假绿）**：

| 位置 | 现状 | t11 改法 |
|---|---|---|
| `verify-site.js:3490-3494` | `/changes/` 分栏标题**逐字**等于 `今日新增,最近 7 天变化,即将结束,已结束,重新出现,套餐变化`，且 `headings.length === 6` | 加 API 分栏后必须变成 7 栏并把「API 价格变化」列进期望串；**不要**把这句改成 `>= 6`（那是放宽容差） |
| `verify-site.js:3497-3501` | `/changes/` 的 `rel="alternate"` **硬编码 4 条**（`feed/changes.*` 一对 + `feed/plans/coding/changes.*` 一对） | 加 API 后应为 6 条；判据**从注册表派生**（`feeds.PLAN_CHANGE_FEEDS` + `changes` Feed），别再写死数字 |

（另注：`verify-site.js` 的 `expectedFeedTags()` 只被 collection / need 两类页面用到，
**不覆盖**厂商页与固定路由页 —— 所以 t8 把厂商页从 9 扩到 18、其中 9 家没有 Feed，
**不会**让这条断言假红；但反过来也意味着「厂商页少声明了它该有的 Feed」目前无牙，
如果 t13 要补，判据必须传 `built.feedBundle.feeds` 而不是空数组。）

---

## 五、队长验收 t4 时下的「t13 硬要求」（**必须做成断言，不许人工目检**）

> 来源：队长对 t4 的验收回复（t4 判定 = **通过**）。以下各条属于 t13 的完成判据，
> 缺一条即判「API Feed 名义存在、实际没接线」= 偷工减料。

### A. `alwaysGenerated` 的启用必须三条同时成立

| # | 要求 | 断言落点（建议） |
|---|---|---|
| A1 | `alwaysGenerated` 改为 `true` **且**调用方确实传入了 API 变化视图 | `feeds-selftest`：未传视图 ⇒ 必须不登记（现有断言）；`build-local` 自检：`built.feedBundle.changeFeedsSkipped` 必须为空 |
| A2 | `feed/plans/api/changes.xml` 与 `.json` **真实存在于 dist**，且产物自检对它们**逐字节/逐字段对账**（不是「文件在就算过」） | 现有「订阅文件缺失」循环覆盖存在性；**必须**再加：RSS 回读 guid 序列 == `api-plan-history.json` 重算身份序列、JSON 回读同序（`feeds.validate()` 的三方对账已含 —— 关键是把 `apiPlanEvents` 传进去，见 §二⑦） |
| A3 | `/feeds/` 页面**真的列出**「API 价格变化」分组，`/changes/` 页面**真的有** API 分栏 | 两处都要可失败断言：`/feeds/` 侧「注册表里每个变化源都出现在页面上」；`/changes/` 侧由 t11 的 verify-site 分节负责 |

### B. 三处最易漏点（t4 指出、队长认下并转为断言）

| # | 要求 | 断言要求 |
|---|---|---|
| B1 | `/feeds/` 分组表改用 `feeds.PLAN_CHANGE_FEEDS.map(spec => spec.id)` 同源展开（连既有的 `plans: [plan-changes]` 也一起改） | 加「注册表里每个变化源都出现在 /feeds/ 页面上」的断言（漏一个就红） |
| B2 | `rowHtml` 起算日改用 `spec.startedAt`（真 bug 风险：继续用 `context.planStartedAt` 会让 API 那条显示套餐日志的起算日 = **假话**） | 断言「每条变化源在 /feeds/ 上显示的起算日 == 它自己日志的 `startedAt`」；⚠️ 两条日志的 `startedAt` 当前相同（2026-10-01），**必须用注入不同 `startedAt` 的夹具**钉住，否则这条断言在真实数据上恒真 = 没有牙 |
| B3 | 产物自检「只找第一条 plan-changes」改成**逐条** feed 做锚点回读 | 明确「逐条」：`plans/coding/#plan-*` ↔ `/plans/coding/`、`plans/api/#plan-*` ↔ `/plans/api/`；这是题面牙 #16（API Feed 指向不存在锚点）的**唯一**触发点（`feeds.validate()` 的 `link-exists` 只判路由、不判 `#片段`） |

### C. 归属与提交（多成员共享 worktree）

- `providers.json` / `index.html` / `package.json` / `seo.js` / `validate.js` 等可能是 t1/t2/t3 的在途改动。
- **禁止** `git add -A` / `git commit -a`；如需提交只挑归属自己的文件，最终由 t13 统一提交。
- t4 的 9 个文件（§一 + 本交接单）：
  `scripts/lib/api-plan-history.js`、`scripts/lib/plan-history.js`、`scripts/lib/feeds.js`、
  `scripts/lib/plan-changes.js`、`scripts/lib/api-plans-page.js`、
  `scripts/tools/feeds-selftest.js`、`scripts/tools/api-plans-selftest.js`、
  `scripts/tools/check-api-plan-history.js`、`docs/v3.0/A4-HANDOFF-feed-pipeline.md`。

### D. `expectedLocs` / `pageRoutes`

t4 不新增路由，sitemap 条数不变；`plans/api/` 已在 `pageRoutes`（基点 2993 行）。
t13 新增 `/plans/`、`/models/`、`/models/<slug>/`、`/archive/`、`/docs/data/` 时
`expectedLocs` 的公式必须同步改 —— 那部分归 t13。

---

## 六、t11（Stage H）完成记录：接线 + 硬要求落地（t13 只需复核）

**改动文件**：`scripts/lib/feeds.js`、`scripts/lib/plan-changes.js`（无）、
`scripts/lib/api-plans-page.js`、`scripts/lib/api-plan-history.js`（tombstone 唯一出处）、
`scripts/tools/build-local.js`、`scripts/tools/feeds-selftest.js`、`scripts/tools/verify-site.js`。

### ① §二 的七处接线：全部完成

| §二 | 落点 | 完成状态 |
|---|---|---|
| ① API 变化视图 | `build-local.js` 的 `const apiPlanRadar = planChanges.buildApiPlanRadar({…})`（紧随 `apiPlanHistoryStore` 之后） | ✅ |
| ② `buildFeeds` 四个新参数 | `apiPlanRadar` / `apiPlanAvailability` / `apiPlans` / `apiProviderTable` | ✅ |
| ③ `/feeds/` 分组表 | `ids: feeds.PLAN_CHANGE_FEEDS.map(spec => spec.id)`（标签改为「套餐与 API 计费」） | ✅ |
| ④ `rowHtml` 起算日 | 改成 `spec.startedAt`；措辞走 `feeds.changeWordingOf(spec)` | ✅ |
| ⑤ 空态说明 | 按 feed 逐条生成（各自 `spec.startedAt` + 各自可用性） | ✅ |
| ⑥ 页面声明订阅源 | `renderPlansPage` 与 `renderApiPlansPage` 都改为 `feeds.feedsForPage({route}, allFeeds)` | ✅ |
| ⑦ 产物自检 | 锚点**逐条 feed** 回读（判据是**链接自己的片段**，不是拿 planId 拼一个锚点）+ `validate` 传 `apiPlanEvents`/`apiPlanAvailability` + SEO `feedMatch` 两页都由注册表派生 | ✅ |

**t11 额外补的两处**（都不在原接线单里，但 H4「Feed Discovery 一致」要求）：
- `/changes/` 的锚点导航加第三项 `#api-plans`（三个落点都要在）；
- `/feeds/` 的产物自检加「注册表里每个变化源都出现在这一页上」（标题 + 两个地址）。

### ② §五 的硬要求：A1–A3 / B1–B3 全部落地

| 要求 | 落地方式 |
|---|---|
| **A1** `alwaysGenerated: true` **且**确实交了视图 | `PLAN_CHANGE_FEEDS` 两条都是 `true`；`build-local` 自检：`changeFeedsSkipped` 非空即红 **+** 「日志可用时描述里出现『没有拿到日志』即红」（专门拦「只把 true 打开、忘了交视图」） |
| **A2** 两个文件真实存在于 dist + 逐字节/逐字段对账 | 产物自检的「订阅文件缺失」循环 + `feeds.validate` 三方对账（传了 `apiPlanEvents`）；真浏览器另加：HTTP 200、**guid 逐条 == `dist/api-plan-history.json` 的 `eventId`**、RSS↔JSON guid 序列相同 |
| **A3** `/feeds/` 真的列出 + `/changes/` 真的有分栏 | `/feeds/`：构建期断言每条变化源的标题与两个地址都在页面上；`/changes/`：构建期断言四栏标题 + 条数 + 跨页锚点，真浏览器再有 5 条独立断言 |
| **B1** 分组表同源展开 | 见 ①③；断言见 ①（额外补的那条） |
| **B2** 起算日按来源取 | `spec.startedAt` 由 `buildFeeds` 按来源算；牙在 `feeds-selftest` 用**注入两个不同 `startedAt`** 的夹具钉住（真实数据两条都是 2026-10-01，不注入就恒真） |
| **B3** 锚点**逐条**回读 | 见 ①⑦；**M2 牙实测**：把 API 深链改成 `#plan-<eventId>`（形状合法、落点不存在）⇒ 构建红「有 6 条深链在 plans/api/ 上没有落点」 |

### ③ t11 三条牙（实跑变红 → 还原 → 复绿）

| # | 污染方式 | 实际失败（逐字） | 还原 |
|---|---|---|---|
| M1 | `changeItemsFor` 的 `id` 改成 `entry.eventId + 自增计数`（每次构建重新生成） | `✗ GUID 两次构建逐字节相同（不是每次 build 重新生成）` 等 4 项（feeds-selftest 111/4，exit 1） | 文件还原 ⇒ 115/0 |
| M2 | API 深链 `linkOf` 改成 `#plan-${entry.eventId}` | 构建红：`✗ 变化订阅 api-plan-changes 里有 6 条深链在 plans/api/ 上没有落点（如 …#plan-721e0657c80d）` + `❌ 产物自检失败`，exit 1 | 文件还原 ⇒ 构建 exit 0 |
| M3 | `buildFeeds` 给变化条目一律用**套餐**的变化视图（两份日志混在一起） | 构建红：`✗ 订阅[change-event-exists] feed/plans/api/changes.xml：02b3bb67f05e 在 api-plan-history.json 里找不到对应事件`（10 项），exit 1 | 文件还原 ⇒ 构建 exit 0 |

> **M2 抓到过我自己的一个真缺陷**：锚点回读最初是「拿 `item.planId` 拼锚点去页面上找」，
> 那样链接拼错也照样通过（M2 第一次跑居然全绿）。判据已改成**读链接自己的片段**。

### ④ t11 完成时的实测数字

| 项 | 值 |
|---|---|
| Feed 数 / 文件数 | **25** / **50**（t4 时 24 / 48） |
| `/changes/` 分栏 | **7** 栏（优惠五栏 + 套餐变化 + API 价格变化）；`rel="alternate"` **6** 条 |
| `/plans/api/` | `rel="alternate"` **4** 条（根 Feed 对 + API 价格变化对） |
| dist 产物 | `feed/plans/api/changes.xml` + `changes.json`（6 条条目，guid == 日志 6 条 `eventId`） |
| `feeds-selftest` | **115** 项 0 失败（t4 时 110） |
| 真浏览器 `verify-site` | **452 项 0 失败**（t4 时 440） |
| sitemap | **160** 条（t11 不新增路由，`expectedLocs` 未动） |
| 离线门禁 | validate --strict / test:strict / 可重建 ×3 / 历史 ×2 / check:ci(35) / verify:seo（8/8）/ build —— 全绿 |
