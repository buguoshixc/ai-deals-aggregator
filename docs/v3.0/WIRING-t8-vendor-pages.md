# t8 接线说明：`/vendor/<slug>/` 升级为厂商统一资料页（Stage E）

> 由 pages-builder 在 t8 产出。**模块与断言已完成并自测全绿**（`selftest:vendor` 42 项）。
> 按任务约定，`build-local.js` 的接线由队长执行 —— 本文给出**逐处、可直接照抄**的改动。
> 改完的验收命令：`npm run build && npm run verify:seo && npm run selftest:vendor && npm run verify`。

## 0. 交付物（已在仓库里，不需要再写代码）

| 文件 | 内容 |
|---|---|
| `scripts/lib/landing.js` | `shouldGenerateLandingPage('vendor')` 三条 OR（条数 / 事件 / 非优惠资料）；`planLandingPages()` 新增可选输入 `plans` / `apiPlans` / `providerTable` / `models` / `modelLinks`；新导出 `vendorMaterialOf()` |
| `scripts/lib/vendor-page.js` | `vendorViewOf()`（显式 join）、`renderVendorKnowledgeSections()` / `renderVendorKnowledgeBundle()`、`VENDOR_KNOWLEDGE_CSS`、`assertVendorPageHonesty()`、`assertVendorSlugCanonical()`（牙 #6）、`assertNoParallelProviderRoutes()`（牙 #7）、`assertVendorApiCounts()`（牙 #8） |
| `scripts/lib/seo.js` | `gate-threshold` 与 landing 门槛同步：vendor 描述符带 `eventCount` / `nonDealMaterial` 时按同一条 OR 判 |
| `scripts/tools/vendor-page-selftest.js` | 42 项（含 #6/#7/#8 三条牙与"纯追加"边界）；`npm run selftest:vendor` |

**纯追加边界（已由自测固定）**：不传新输入时 `planLandingPages()` 的输出与 v2.x 逐字节相同；
传入后只有「厂商页」与「厂商枢纽页的子页集合」变化，其余页面一个字节都没变；
`renderVendorKnowledgeSections()` 对非 vendor 页返回空串。

## 1. `planLandingPages()` 的调用点：补四份 join 输入

现状（`build-local.js` 的 `build()` 里，`const PLAN = landing.planLandingPages({...})`）：

```js
const PLAN = landing.planLandingPages({
  deals: payload.deals,
  vendorKeyOf: VENDOR_KEY_OF,
  vendorSlugs: feeds.VENDOR_SLUGS,
  thresholds: undefined,
  vendorThresholds: feeds.VENDOR_THRESHOLDS,
  eventCountOf: name => vendorEventCount.get(name) || 0,
  …
```

**问题**：这段代码现在位于 `plansStore` / `apiPlansStore` / Model Registry **之前**，拿不到四份输入。

**改法（推荐 A）**：

- **A. 把那一段整体后移**：把 `PLAN = landing.planLandingPages({...})` 起、
  经 `DIRECTORY_PAGES = PLAN.pages;`、`if (PLAN.problems.length) { throw … }`、
  到两段 `console.log`（`落地页计划` 与 `跳过 …`）为止（当前约 `build-local.js` 2666–2687 行），
  **整体移到 Model Registry 那一段之后**（`const modelsTable = …` 与
  `const modelLinksDoc = …` 已就绪的位置，当前约 2790 行附近）。
  `const vendorEventCount = (() => { … })();`（约 2656–2665 行）**留在原地**（它只依赖
  `payload.deals` 与 deals 历史）。
  `DIRECTORY_PAGES` 的第一次真正使用在 `for (const spec of DIRECTORY_PAGES)`（约 2995 行），
  因此后移安全；`landing.js` 里的 `landing.vendorOf` 只在被调用时读 `DIRECTORY_PAGES`（模块级变量）。
- **B. 把四份数据加载前移**：把 `plansStore` / `apiPlansStore` / Model Registry 的
  `load()` + 校验 + 派生 这一段整体挪到 `PLAN` 之前（重复行数更多，不推荐）。

然后给调用补上四行：

```js
  plans: plansStore.plans,
  apiPlans: apiPlansStore.plans,
  providerTable,                       // 已在同一作用域（providers.load().table）
  models: publishedModels.models,      // Model Registry 的派生产物（带 id / firstSeen / lastSeen）
  modelLinks: modelLinksDoc.links,     // scripts/data/model-registry-links.json 的 links
```

> 注意 `models` 传**派生产物**（有 `slug`/`developer`/`owner`），不要传 `scripts/data/models.json`
> 的来源层键值对象 —— `landing.vendorMaterialOf()` 两者都能读，但页面层需要 slug/developer。
> 如果这一段的 `PLAN.skipped` 日志格式要跟着更新，把 `eligible-nondeal` 这个 reason 也打出来
> （它表示"靠非优惠资料达标"）。

## 2. `renderDirectoryPage()`：加 `extraSections`（纯追加）

在函数体里（`const pageFeeds = …` 之后任意位置）加：

```js
  // v3.0 Stage E：厂商资料页的追加区块。其它 kind 不传 → extraHtml 为空串 → 输出逐字节不变。
  const extraBundle = typeof context.extraSections === 'function'
    ? (context.extraSections(spec) || { html: '', css: '' })
    : { html: context.extraSections || '', css: context.extraSectionsCss || '' };
  const extraHtml = extraBundle.html || '';
  const extraCss = extraBundle.css || '';
```

在 `<style>` 块的末尾（`@media (max-width: 760px)` 之后、`</style>` 之前）加 `${extraCss}`：

```js
  @media (max-width: 760px) { .ctable th, .ctable td { padding: 8px 9px; } }
${extraCss}
</style>
```

在 `<main>` 里 **`${topicHtml}` 与页脚那段 `<p class="snote">` 之间**插入：

```js
${topicHtml}

${extraHtml}
```

> `extraHtml` 为空串时这一行不会产生任何字节（模板里就是空行），非厂商页因此逐字节不变。

## 3. 目录页循环：把资料区块接上

在 `for (const spec of DIRECTORY_PAGES)`（约 2995 行）里，`renderDirectoryPage(...)` 的 context
里加一项：

```js
    const page = renderDirectoryPage(spec, matched, html, {
      lastmod, summary, topic, plan: PLAN, feedsForPage: pageFeeds, allFeeds: feedBundle.feeds, renderCore,
      // v3.0 Stage E：只有厂商页有资料区块；其余 kind 不进入这个分支（返回空 bundle）。
      extraSections: spec.kind === 'vendor'
        ? (page => vendorPage.renderVendorKnowledgeBundle(page, {
            deals: matched,                 // 本页判据筛过的当前有效优惠
            plans: plansStore.plans,
            apiPlans: apiPlansStore.plans,
            models: publishedModels.models,
            modelLinks: modelLinksDoc.links,
            planHistoryStore,               // 上面已加载的两份日志（可能为 null）
            apiPlanHistoryStore,
            providerTable,
            feeds: pageFeeds,               // 本页自己的订阅源（没有就是 []）
            prefix: '../'.repeat(spec.depth || 1),
            officialUrlOf: null             // 可选：显式厂商官方入口映射；不给就用记录里的官方地址
          }))
        : null,
    });
```

并把两个字段带进 `directoryPages.push({...})`（`gate-threshold` 同步要用）：

```js
      eventCount: spec.eventCount || 0,
      nonDealMaterial: Boolean(spec.nonDealMaterial),
```

## 4. SEO 描述符：把两个新字段传下去

`directoryDescriptors` 那一段（`readPage(page.route, { kind: page.kind, … })`）补两行：

```js
      eventCount: page.eventCount,
      nonDealMaterial: page.nonDealMaterial,
```

不传这两个字段时 `seo.js` 的行为与 v2.x 逐字相同（只查条数）——
但**接线之后必须传**，否则"靠非优惠资料达标的厂商页"会被 `gate-threshold` 判红。

## 5. 构建期回读对账（三条牙的落点）

在 `selfCheck(built)` 里「套餐对比页 / 模型页」那几段旁边，加一段：

```js
  // ---- v3.0 Stage E：厂商资料页（从磁盘回读对账）--------------------------------
  {
    const providerTable = providers.load().table;
    const problems = [
      ...vendorPage.assertVendorSlugCanonical(built.directoryPages, { providerTable, vendorSlugs: feeds.VENDOR_SLUGS }),
      // 队长补充：slug 必须来自**权威表**（不能只靠 providers.json 的隐式兜底）
      ...vendorPage.assertVendorSlugDeclared(built.directoryPages, { vendorSlugs: feeds.VENDOR_SLUGS }),
      ...vendorPage.assertVendorCandidateIdentity(built.directoryPages, { providerTable }),
      ...vendorPage.assertNoParallelProviderRoutes(built.directoryPages)
    ];
    const diskApiPlans = JSON.parse(fs.readFileSync(path.join(OUT, 'api-plans.json'), 'utf8')).plans;
    const diskPlans = JSON.parse(fs.readFileSync(path.join(OUT, 'plans.json'), 'utf8')).plans;
    const diskModels = JSON.parse(fs.readFileSync(path.join(OUT, 'models.json'), 'utf8')).models;
    const diskLinks = JSON.parse(fs.readFileSync(path.join(OUT, 'model-registry-links.json'), 'utf8')).links;
    const diskPlanHistory = fs.existsSync(path.join(OUT, 'plan-history.json'))
      ? JSON.parse(fs.readFileSync(path.join(OUT, 'plan-history.json'), 'utf8')) : null;
    const diskApiHistory = fs.existsSync(path.join(OUT, 'api-plan-history.json'))
      ? JSON.parse(fs.readFileSync(path.join(OUT, 'api-plan-history.json'), 'utf8')) : null;
    for (const spec of built.directoryPages.filter(page => page.kind === 'vendor')) {
      const file = path.join(OUT, spec.route, 'index.html');
      if (!fs.existsSync(file)) { problems.push(`${spec.route}: 缺少产物`); continue; }
      const pageHtml = fs.readFileSync(file, 'utf8');
      const ctx = {
        deals: (built.dealLinksView ? null : null) || [],
        plans: diskPlans, apiPlans: diskApiPlans, models: diskModels, modelLinks: diskLinks,
        planHistoryStore: diskPlanHistory, apiPlanHistoryStore: diskApiHistory,
        providerTable,
        feeds: feeds.feedsForPage(spec, built.feedBundle.feeds),
        prefix: '../'.repeat(spec.depth || 1),
        siteUrl: SITE_URL
      };
      problems.push(...vendorPage.assertVendorPageHonesty(pageHtml, spec, ctx).map(p => `${spec.route}: ${p}`));
      problems.push(...vendorPage.assertVendorApiCounts(pageHtml, spec, ctx).map(p => `${spec.route}: ${p}`));
    }
    if (problems.length) fail(`厂商资料页未通过诚实性断言：${problems.slice(0, 3).join('、')}`);
    else console.log(`  ✓ 厂商资料页: ${built.directoryPages.filter(p => p.kind === 'vendor').length} 页` +
      ` · slug 唯一 · 无 /provider/ · API 计数与 api-plans 逐个对账 · 资料区块六节齐`);
  }
```

> `ctx.deals` 是资料区块里「相关优惠」之外的**无**关项（优惠表格由主渲染出）。
> `vendorViewOf()` 用 `deals` 只算条目数与官方地址候选；从磁盘回读时可以传
> `landing.itemsOf(spec, diskDeals, { vendorKeyOf: VENDOR_KEY_OF })` 得准确值
> （`assertVendorApiCounts` 不读 `deals`，所以两者都不会产生假红）。

## 6. `deterministic` 与门禁登记

- **sitemap / pageRoutes / 页脚深度扫描 / 订阅声明扫描**：厂商路由本来就在
  `directoryPages` 里，**不需要新增清单**；条数断言会自动跟着变（预计 9 → **19** 个厂商页，见 §7）。
- `.github/actions/gate/action.yml` 与本地门禁脚本加一步：`node scripts/tools/vendor-page-selftest.js`
  （`npm run selftest:vendor`）。
- `/vendor/` 与 `/provider/` 的边界：**不许新增任何 `provider/` 路由**，
  `assertNoParallelProviderRoutes()` 会在构建期与自测里同时判红。
- **R5 身份门**：只给「在 A 空间有厂商名」（`providers.json` 的 `vendorKey !== null`）的 provider
  建路由；`assertVendorCandidateIdentity()`（可用 `renderCore.vendorKeyNames()` 的 A 空间表核验）
  会在构建期与自测里同时判红。

## 7. 接线后的预期变化（**参考值**；条数以构建期 `expectedLocs` 断言为准）

> 队长裁定：**sitemap / 页面条数不要手算** —— 唯一裁决是构建期断言（`expectedLocs` 等）。
> 本节数字是接线前预演的实测值，仅供"接线后应当接近"的对账参考，不作为验收依据。
>
> ⚠️ 数字按队长 **R5 修正**：实测 23 家里 **19 家**有 A 空间厂商名
> （zhipu / moonshot / minimax / github / cursor / openai / anthropic / google / deepseek /
> baidu / volcengine / coze / iflytek / microsoft / notion / aliyun / siliconflow / tencent / windsurf），
> 另外 4 家（trae / qoder / codebuddy / qoder-intl）`vendorKey=null`，**不建路由**，
> 在 `PLAN.skipped` 里以 `reason=no-vendor-identity` 逐条留痕（资料走 `/plans/coding/` 与 `/plans/`）。

- 厂商页 9 → **19**（新增 10 个：aliyun / siliconflow / tencent-cloud / deepseek / openai /
  anthropic / google / moonshot / cursor / windsurf）。
- sitemap / 可索引页面：**以 `expectedLocs` 断言为准**（预演值 158 → 168，+10）。
- 其中**只有 DeepSeek 一家**优惠条数为 0（0 条 deals + 2 条 API 记录 + 3 个模型），
  标题按设计变成「DeepSeek 的 AI 资料」；其余 18 家（含只有 1 条优惠的 openai 等）标题与 heading 不变。
- `/vendor/` 枢纽页的子页数 9 → **19**（这是**设计内**的变化，不是回归）。
- 三条联动清单按 **19** 算：SEO 描述符的 `count`、sitemap 条数断言、以及厂商页正文下限
  （DeepSeek 那一页正文靠资料区块 ≥600 字）。
- **前置条件**：`scripts/data/vendor-slugs.json` 必须补齐这 10 条（归 registry-curator；
  `assertVendorSlugDeclared()` 在补表前会红 —— 这正是它存在的意义）。补表**不改变任何 URL**，
  只是把 slug 从"provider 隐式兜底"改成"权威表显式登记"。
