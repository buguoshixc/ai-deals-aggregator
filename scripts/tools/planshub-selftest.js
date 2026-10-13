#!/usr/bin/env node
/**
 * v3.0 `/plans/` 资料入口演练（离线、零依赖、可重跑）。
 *
 * 它演练的是这一层自己的承诺：
 *   · 页面上的每个数字都能由输入数据重算出来；
 *   · 当前相关优惠**只**来自显式关系，且已结束的关联结构性地拿不到"当前"标记；
 *   · 变化块复用既有日志与措辞，不写第二套判据，且**与 `/plans/coding/` 上是同一个块**
 *     （同一个基准日、同一批事件、同一句「另有 N 条」）；
 *   · page-kinds 是"路由 → kind / 下限 / ItemList / sitemap priority"的唯一声明，
 *     构建期规则层与独立门禁都读它，但**各自从 dist 解析**（执行路径没有合并）。
 *
 * 牙是**实跑**的：污染 → 断言必须变红 → 复原后必须回到绿。
 * ⚠️ 变化块那几条牙跑在**夹具**上（`FIXTURE_AT`），不用当天产物当夹具：变化窗口合法地为空的日子
 *    （最近没有变化 ≠ 出错了）产物里一条深链都没有，替换就成了 no-op —— 牙会静默变绿。
 *    2026-10-12 起采集链连红 4 轮报的正是这条牙：它自己的前提没了，却报成产物有问题。
 */

'use strict';

const fs = require('fs');
const path = require('path');

const hub = require('../lib/plans-hub-page');
const pageKinds = require('../lib/page-kinds');
const providers = require('../lib/providers');
// 夹具与牙要用到写入内核与变化块渲染器（**同一份实现**，不在这里手搓形状）：
// `planHistory.record()` 造合成日志，`plansPage.planChangesBlockHtml()` 造「锚错日子那一版」的块。
const planHistory = require('../lib/plan-history');
const planChanges = require('../lib/plan-changes');
const plansPage = require('../lib/plans-page');

const ROOT = path.join(__dirname, '..', '..');
const SITE_URL = 'https://buguoshixc.github.io/ai-deals-aggregator/';

/* ------------------------------------------------------------------ */
/* 产物目录与 fail-closed 前置（§10.9 · P2-10 / P2-26）                  */
/* ------------------------------------------------------------------ */
//
// 第 ⑤ 节要读**构建产物**（`<dist>/plans/index.html` 等）。原先是
// 「产物不存在 ⇒ 跳过并计 ✓」—— 而门禁在构建**之前**跑，dist/ 根本不存在，
// 于是这一节在 CI 里永远是绿的（同一 commit，项数随环境在 27/32 之间变）。
//
// 六个产物依赖工具现在用同一套协议：
//   · `--dir=<path>`            显式指定产物目录（默认 `<repo>/dist`）；
//   · 缺少必需产物 ⇒ **非 0**，并给出「先 build / 用 --dir 指到别的产物」的下一步；
//   · 只有显式 `--allow-missing-dist` 才允许跳过，且会被标成 `⚠️ OPTIONAL DIAGNOSTIC`。
//
// 「产物该不该存在」不由本工具猜：门禁 action 把这一步排在 `Assemble site` 之后，
// 并把 `--dir=dist` 显式传进来（`check-ci-consistency` 的 (17) 守着这个调用形态）。
const dirArg = process.argv.find(arg => arg.startsWith('--dir='));
const ALLOW_MISSING_DIST = process.argv.includes('--allow-missing-dist');
const DIST = path.resolve(ROOT, dirArg ? dirArg.slice('--dir='.length) : 'dist');
// private-analytics-v1：产物里那份共享的分析 bootstrap 用**唯一实现**剥离
// （不在这里重写一份正则 —— 判据只有一处，改了那边这里跟着变）。
const analyticsLib = require('../lib/analytics');

/** 必需的产物缺失时：显式允许 → OPTIONAL DIAGNOSTIC（通过）；否则记红并返回 false */
function requireDist(what, marker) {
  const file = path.join(DIST, marker);
  if (fs.existsSync(file)) return true;
  if (ALLOW_MISSING_DIST) {
    check(`⚠️ OPTIONAL DIAGNOSTIC（--allow-missing-dist）：跳过 ${what} 的现场检查（缺 ${marker}）`, true);
    return false;
  }
  check(`缺少必需产物：${what} —— 找不到 ${path.relative(ROOT, file) || file}` +
    `（先跑 npm run build，或用 --dir=<构建输出> 指到那份产物；只有显式 --allow-missing-dist 才允许跳过）`, false);
  return false;
}

/** 一组必需产物：整个 dist 缺失时只记一条红；否则逐个点名缺了哪个 */
function requireDistFiles(what, markers) {
  if (!fs.existsSync(DIST)) return requireDist(what, markers[0]);
  let ok = true;
  for (const marker of markers) {
    if (fs.existsSync(path.join(DIST, marker))) continue;
    ok = requireDist(what, marker) && ok;
  }
  return ok;
}

let passed = 0;
const failures = [];

function check(name, ok, detail) {
  if (ok) { passed++; console.log(`  ✓ ${name}`); }
  else { failures.push(name); console.log(`  ✗ ${name}${detail ? ` —— ${detail}` : ''}`); }
}

function section(title) {
  console.log(`\n${title}`);
}

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

/* ------------------------------------------------------------------ */
/* 真实数据（不是硬编码样例）                                            */
/* ------------------------------------------------------------------ */

const plans = readJson('plans.json').plans;
const apiPlans = readJson('api-plans.json').plans;
const deals = readJson('deals.json').deals;
const planHistoryStore = readJson('scripts/data/plan-history.json');
const apiPlanHistoryStore = readJson('scripts/data/api-plan-history.json');
const dealLinks = readJson('scripts/data/deal-plan-links.json');
const PROVIDER_TABLE = providers.load().table;

const ctx = {
  plans, apiPlans, deals, dealLinks, planHistoryStore, apiPlanHistoryStore,
  providerTable: PROVIDER_TABLE, asOf: '2026-10-01', prefix: '../', siteUrl: SITE_URL
};

/** 正文 + 套壳注入的 JSON-LD = 构建期真正写下的那一份 */
function fullPage(options = {}) {
  const html = hub.renderPlansHubPage(options.ctx || ctx);
  const jsonLd = hub.plansHubJsonLd(options.ctx || ctx)
    .map(data => `<script type="application/ld+json">${JSON.stringify(data)}</script>`).join('');
  return html + jsonLd;
}

/* ------------------------------------------------------------------ */
/* 变化块的两条判据（两页对账 + 夹具）                                   */
/* ------------------------------------------------------------------ */
//
// ⚠️ 背景（2026-10-13 实测，不是推断）：这一页原先把**关系层**基准日（`max(deals, plans)`，
// 跟着 deals.json 每天走）当成 Coding 变化窗口的基准日，于是
//   · 同一个块在两页上给出两个数（本地实测：`/plans/` 上「另有 2 条更早的变化」，
//     `/plans/coding/` 上「另有 30 条更早的变化」）；
//   · deals 的数据日再往前走 7 天，窗口就整个空了：块变成「当前没有观测到套餐变化」，
//     而日志里那 35 条事件、`/plans/coding/` 上那 5 条都还在。
// 采集链从 2026-10-12 起连红 4 轮就是它（门禁报的是下面那条深链牙 —— 牙在空块上成了 no-op）。
// 判据本身在 `lib/plans-hub-page.js` 的 `codingAsOf`；这里守的是**产物上看得见的结果**。

/** 从一整页里取出套餐变化块（`#plan-changes`；两页各只有一块） */
function changesBlockOf(html) {
  return (String(html || '').match(/<section class="pchanges" id="plan-changes"[\s\S]*?<\/section>/) || [])[0] || '';
}

/**
 * 两个变化块是不是**同一件事**。
 *
 * 比的是事实而不是形式：同一个 `planId` 的链接在两页上形式不同（资料入口必须跨页
 * `../plans/coding/#plan-<id>`，`/plans/coding/` 上是页内锚点 `#plan-<id>`），
 * 所以先把链接形式归一，再逐字比对整块 —— 事件、顺序、措辞、块尾那句「另有 N 条更早的变化」
 * 与空态都必须一致。**空态也是结论**：一边空、一边列出 5 条，同样是红的。
 */
function changesBlockProblems(hubBlock, codingBlock) {
  const problems = [];
  if (!hubBlock) problems.push('资料入口页里没有 #plan-changes 块');
  if (!codingBlock) problems.push('/plans/coding/ 里没有 #plan-changes 块');
  if (problems.length) return problems;

  // 首尾缩进是"从整页里抠出来"的产物（块函数自己会带缩进与结尾换行），先归一再比。
  const canon = block => String(block).trim()
    .replace(/href="(?:\.\.\/)+plans\/coding\/#plan-/g, 'href="#plan-')
    .replace(/href="(?:\.\.\/)+changes\/#plans"/g, 'href="changes/#plans"');
  const idsOf = block => [...String(block).matchAll(/#plan-([0-9a-f]{12})/g)].map(m => m[1]);
  const noteOf = block => (String(block).match(/另有 (\d+) 条更早的变化/) || [])[1] || null;
  const emptyOf = block => /<p class="pchnone">/.test(String(block));

  const hubIds = idsOf(hubBlock);
  const codingIds = idsOf(codingBlock);
  if (hubIds.join(',') !== codingIds.join(',')) {
    problems.push(`两页的变化不是同一批：入口 ${hubIds.length} 条[${hubIds.slice(0, 3).join(' ')}]`
      + ` vs /plans/coding/ ${codingIds.length} 条[${codingIds.slice(0, 3).join(' ')}]`);
  }
  if (noteOf(hubBlock) !== noteOf(codingBlock)) {
    problems.push(`「另有 N 条更早的变化」不一致：入口「${noteOf(hubBlock) ?? '（无此行）'}」`
      + ` vs /plans/coding/「${noteOf(codingBlock) ?? '（无此行）'}」`);
  }
  if (emptyOf(hubBlock) !== emptyOf(codingBlock)) {
    problems.push('一页是「没有观测到变化」的空态、另一页列出了变化');
  }
  if (canon(hubBlock) !== canon(codingBlock)) {
    problems.push('链接形式归一之后两页的块仍然不是逐字相同（事件顺序 / 措辞 / 起算日有一处漂了）');
  }
  return problems;
}

/* ------------------------------------------------------------------ */
/* 夹具：一份**合成**的套餐变化日志（让牙不依赖「今天恰好有变化」）        */
/* ------------------------------------------------------------------ */
//
// 为什么必须有夹具：变化窗口的基准日是 plans 自己的数据日，窗口里有没有事件由数据决定 ——
// 「产物里有跨页深链」在真实数据上**可能合法地为空**（最近没有变化 ≠ 出错了）。
// 牙若拿当天产物当夹具，那种日子就会静默退化成 no-op。
//
// 夹具的两半都走**唯一实现**：日志由 `planHistory.record()` 从空基线录入（全部 created），
// plans 记录是真实记录的克隆（只把 `lastSeen` 挪到夹具日 ⇒ 这一页的「数据最近核对」= 夹具日，
// 与窗口的基准日同一件事）。夹具一变，下面的断言会跟着红，不会悄悄退化成"永远绿"。
const FIXTURE_AT = '2026-10-01';
const fixturePlans = plans.map(plan => ({ ...plan, lastSeen: FIXTURE_AT }));
const fixtureRecorded = (() => {
  const seeded = planHistory.emptyStore({ at: FIXTURE_AT });
  seeded.baseline = planHistory.baselineOf([], { at: FIXTURE_AT });
  return planHistory.record(seeded, {
    previous: [],
    next: fixturePlans,
    at: FIXTURE_AT,
    runAt: `${FIXTURE_AT}T00:00:00.000Z`,
    labels: new Map(fixturePlans.map(plan => [plan.id, { title: plan.planName, vendor: plan.provider }]))
  });
})();
const fixtureStore = fixtureRecorded.store;
// 关系层基准日**故意**推到 2030 年：那是另一个数据集的日子，不许拿来开变化窗口。
const fixtureCtx = {
  ...ctx, plans: fixturePlans, planHistoryStore: fixtureStore, deals: [], dealLinks: null, asOf: '2030-01-01'
};
/** 跨页深链的形状（资料入口这一页**只许**有这一种 `#plan-` 链接：页内锚点在这页上没有落点） */
const DEEP_LINK_RE = /href="\.\.\/plans\/coding\/#plan-[0-9a-f]{12}"/g;

/* ================================================================== */
section('① 真实数据：页面与断言');
/* ================================================================== */

const view = hub.plansHubView(ctx);
check(`Coding 统计与数据一致（${view.coding.plans} 条 / ${view.coding.providers} 个平台）`,
  view.coding.plans === plans.length && view.coding.providers === new Set(plans.map(plan => plan.provider)).size);
check(`API 统计与数据一致（${view.api.records} 条记录 / ${view.api.modelItems} 个模型计价条目 / ${view.api.providers} 个平台）`,
  view.api.records === apiPlans.length
  && view.api.providers === new Set(apiPlans.map(plan => plan.provider)).size
  && view.api.modelItems === apiPlans.reduce((sum, plan) => sum + plan.models.length, 0));

const page = fullPage();
check('真实数据上页面诚实性断言零问题（断言不是恒红）',
  hub.assertPageHonesty(page, ctx).length === 0, hub.assertPageHonesty(page, ctx).slice(0, 2).join('；'));
check('页面结构：h1 + 面包屑 + 两个入口 + 变化块',
  /<h1>/.test(page) && page.includes('class="crumb"')
  && page.includes('href="../plans/coding/"') && page.includes('href="../plans/api/"')
  && page.includes('id="plans-hub-changes"'));
// t6 改写（三条断言 → 一条更强的反向断言）：原来这里是
//   ① 结构断言里的 `page.includes('href="../api-plans.json"')`（页面必须链到数据出口）；
//   ② 「未生成 /docs/data/ 时不给指向它的死链」；
//   ③ 「dataDocs: true 之后才链接数据文档」。
// 数据出口整族下架后 ①②③ 的被测对象全部消失（`dataDocs` 参数也已从 `lib/plans-hub-page.js` 删除），
// 而**新契约**是「/plans/ 一个数据文件/文档页都不许链接」。所以正向断言换成反向断言 ——
// 它比原来三条加起来更严：对「哪天有人再挂一条 *.json 或 /docs/data/ 的链」直接敏感。
check('页面不链接任何数据文件或数据出口页（读者面零暴露：无 /docs/data/、无 *.json 链接）',
  !/href="[^"]*(?:docs\/data\/|\.json)/.test(page));
check('两个子页各有一个 data-child 行（ItemList 靠它对账）',
  (page.match(/data-child="/g) || []).length === 2);
check('ItemList 声明数 == 元素数 == data-child 行数',
  hub.assertItemListHonesty(page, ctx).length === 0, hub.assertItemListHonesty(page, ctx).join('；'));

/* ================================================================== */
section('①b 变化窗口的基准日 = plans 自己的数据日（2026-10-12 起采集链连红 4 轮的真缺陷）');
/* ================================================================== */

{
  const plansDataDate = String(readJson('plans.json').updatedAt || '').slice(0, 10);

  // 前提（也是 lib 里 `codingAsOf` 的依据）：页面上的「数据最近核对」恒等于 plans.json 的
  // `updatedAt` —— `plan-schema` 的 `canonicalUpdatedAt` 强制「全部 lastSeen 的最大值」，
  // 不一致时 `validate.js` 直接报错。这条红了说明 schema 的恒等式没了：去看门禁，别改断言。
  check('前提：页面上的「数据最近核对」= plans.json 的 updatedAt（schema 强制的恒等式）',
    view.coding.updatedAt === plansDataDate, `${view.coding.updatedAt} vs ${plansDataDate}`);

  check(`真实数据：Coding 变化窗口锚在 plans 的数据日（${plansDataDate}），不是关系层基准日（ctx.asOf=${ctx.asOf}）`,
    view.codingRadar.asOf === plansDataDate,
    `雷达基准日 ${view.codingRadar.asOf} · 「数据最近核对」${view.coding.updatedAt}`);

  check(`夹具：合成日志 = ${fixturePlans.length} 条 created（走唯一写入内核，零 problems）`,
    fixtureRecorded.problems.length === 0
    && fixtureStore.events.length === fixturePlans.length
    && fixtureStore.events.every(event => event.type === 'created'),
    `${fixtureStore.events.length} 条 · problems：${fixtureRecorded.problems.join('；') || '（无）'}`);

  const fixtureView = hub.plansHubView(fixtureCtx);
  check('夹具：关系层基准日推到 2030 年，Coding 雷达的基准日仍然是夹具的 plans 数据日',
    fixtureView.codingRadar.asOf === FIXTURE_AT, `雷达基准日 ${fixtureView.codingRadar.asOf}`);

  const fixturePage = fullPage({ ctx: fixtureCtx });
  const fixtureDeep = (fixturePage.match(DEEP_LINK_RE) || []).length;
  check('夹具：变化块渲染出跨页深链，且一个页内 `#plan-` 锚点都没有（深链牙的前提；与当天数据无关）',
    fixtureDeep > 0 && !/href="#plan-/.test(fixturePage), `深链 ${fixtureDeep} 条`);
  check('夹具页面自己通过诚实性断言（夹具不是脏的，断言不是恒红）',
    hub.assertPageHonesty(fixturePage, fixtureCtx).length === 0,
    hub.assertPageHonesty(fixturePage, fixtureCtx).slice(0, 2).join('；'));
}

/* ================================================================== */
section('② 结论性词汇与计数：两条牙');
/* ================================================================== */

{
  const dirty = page.replace('这一页收录什么', '这一页收录什么（性价比最高）');
  check('【牙】页面注入结论性词汇「性价比」→ 诚实性断言变红',
    hub.assertPageHonesty(dirty, ctx).some(problem => problem.includes('结论性词汇')),
    hub.assertPageHonesty(dirty, ctx).slice(0, 1).join(''));
}

{
  const lied = page.replace(`data-summary-label="套餐数" data-summary-value="${view.coding.plans}"`,
    `data-summary-label="套餐数" data-summary-value="${view.coding.plans + 1}"`);
  check('【牙】页面把套餐数写大 1 → 计数对账变红',
    hub.assertPageHonesty(lied, ctx).some(problem => problem.includes('套餐数')),
    hub.assertPageHonesty(lied, ctx).slice(0, 1).join(''));
}

{
  const brokenJsonLd = page.replace('"numberOfItems":2', '"numberOfItems":3');
  check('【牙】ItemList 声明数与元素数不一致 → 红',
    brokenJsonLd !== page && hub.assertItemListHonesty(brokenJsonLd, ctx).length > 0,
    hub.assertItemListHonesty(brokenJsonLd, ctx).slice(0, 1).join(''));
}

/* ================================================================== */
section('③ 当前相关优惠：只认显式关系（Tooth v2.4 的延续）');
/* ================================================================== */

{
  // 合成一条**已结束**的优惠关联：`expiresAt` 早于基准日 ⇒ dealStatus 是 expired ⇒ 不是 current。
  const endedDeal = {
    id: 'eeeeeeeeeee1',
    type: 'deal',
    title: '演练用已结束优惠',
    vendor: '智谱AI',
    url: 'https://open.bigmodel.cn/pricing',
    expiresAt: '2026-09-01'
  };
  const synthetic = {
    schemaVersion: 1,
    links: [{
      dealId: endedDeal.id,
      planIds: [plans[0].id],
      provider: plans[0].provider,
      basis: 'official-pricing-page',
      promo: { appliesTo: 'all', price: 0.01, currency: 'CNY', period: 'monthly', note: '演练用' },
      confirmedAt: '2026-09-01'
    }],
    retired: []
  };
  const syntheticCtx = { ...ctx, deals: [...deals, endedDeal], dealLinks: synthetic };
  const syntheticView = hub.plansHubView(syntheticCtx);
  check('已结束的关联不进「当前相关优惠」（视图层面）', syntheticView.currentOffers.length === 0);
  const syntheticPage = fullPage({ ctx: syntheticCtx });
  check('已结束的关联不进「当前相关优惠」（页面层面：明确空态）',
    syntheticPage.includes('暂无当前优惠'));

  const polluted = syntheticPage.replace('暂无当前优惠',
    `暂无当前优惠<a class="phubgo" href="../deal/${endedDeal.id}/">查看优惠 →</a>`);
  check('【牙】把已结束的关联挂上「查看优惠」→ 变红',
    hub.assertPageHonesty(polluted, syntheticCtx).some(problem => problem.includes('已结束')),
    hub.assertPageHonesty(polluted, syntheticCtx).slice(0, 1).join(''));
}

{
  const blocked = { ...ctx, dealLinks: null };
  const blockedPage = fullPage({ ctx: blocked });
  check('没有关系表时不渲染该块（不伪造"0 条当前优惠"）',
    !blockedPage.includes('id="plans-hub-deals"') && hub.assertPageHonesty(blockedPage, blocked).length === 0);
}

/* ================================================================== */
section('④ page-kinds：唯一声明表 + 两个独立读者');
/* ================================================================== */

check('路由 → kind：/plans/ 与 /plans/coding/ 是两个不同的 kind',
  pageKinds.kindOfRoute('plans/') === 'plans-hub' && pageKinds.kindOfRoute('plans/coding/') === 'plans');
check('路由 → kind：模型详情 / 档案详情按模式识别',
  pageKinds.kindOfRoute('models/glm-5-3/') === 'model'
  && pageKinds.kindOfRoute('archive/deal/abc123/') === 'archive-detail');
check('未登记的路由会被审计报出来（新增家族必须显式登记）',
  pageKinds.auditRouteKinds(['plans/', 'mystery/']).join(',') === 'mystery/');
check('目录页家族可由调用方补交 kind（不靠 startsWith 绕过声明表）',
  pageKinds.auditRouteKinds(['student/'], new Map([['student/', 'collection']])).length === 0);

{
  // 既有 kind 的下限**一个都没改**（反作弊检查第 2 条：下限只增不减）。
  // t6：`feeds` 一项随订阅层整族下架删除 —— 那个 kind 已从 `page-kinds.js` 移除，
  // 而它在旧列表里之所以还能"通过"，靠的只是**缺省值恰好等于 600**（`600 + 60×0`）——
  // 一条对不存在 kind 的断言按缺省值蒙对，正是本仓最忌讳的假绿。
  const legacy = [
    ['hub', 3, 500 + 60 * 3], ['deal', 0, 500], ['status', 0, 600], ['changes', 0, 600],
    ['plans', 9, 600 + 60 * 9], ['home', 0, 3000], ['collection', 2, 600 + 60 * 2]
  ];
  const wrong = legacy.filter(([kind, count, expected]) => pageKinds.textFloor(kind, count) !== expected);
  check(`既有 ${legacy.length} 个 kind 的正文下限逐字未变`, wrong.length === 0,
    JSON.stringify(wrong));
  // t6：`data-docs` 一项随数据出口整族下架删除（那个 kind 已从 `page-kinds.js` 移除）。
  check('新家族的下限都已声明（不是落在缺省 600+60n 上）',
    pageKinds.textFloor('plans-hub', 2) === 700 + 60 * 2
    && pageKinds.textFloor('models-index', 3) === 600 + 60 * 3
    && pageKinds.textFloor('model', 0) === 700
    && pageKinds.textFloor('archive-index', 1) === 600 + 60
    && pageKinds.textFloor('archive-detail', 0) === 600);
  // t6：`data-docs` 一项同上删除。其余四条（入口 0.9 / 详情 0.7 / 工具页 0.3）一字未改。
  check('sitemap priority 是声明（入口 0.9 / 枢纽 0.8 / 详情 0.7 / 工具页更低）',
    pageKinds.sitemapMeta('plans-hub').priority === '0.9'
    && pageKinds.sitemapMeta('model').priority === '0.7'
    && pageKinds.sitemapMeta('status').priority === '0.3');
}

{
  const seoSource = fs.readFileSync(path.join(ROOT, 'scripts', 'lib', 'seo.js'), 'utf8');
  const verifySource = fs.readFileSync(path.join(ROOT, 'scripts', 'tools', 'seo-verify.js'), 'utf8');
  const kindsSource = fs.readFileSync(path.join(ROOT, 'scripts', 'lib', 'page-kinds.js'), 'utf8');

  check('seo.js（规则层）读 page-kinds 的下限与 ItemList 默认值',
    seoSource.includes("require('./page-kinds')")
    && seoSource.includes('pageKinds.textFloor(kind, itemCount)')
    && seoSource.includes('pageKinds.itemListRule(page.kind)'));
  check('seo-verify.js（独立门禁）也读同一份声明',
    verifySource.includes("require('../lib/page-kinds')")
    && verifySource.includes('pageKinds.kindOfRoute(route)')
    && verifySource.includes('pageKinds.itemListRule(kind)'));
  check('两者**各自从 dist 解析**，执行路径没有合并',
    verifySource.includes('function listPages()') && verifySource.includes('const strip = html =>')
    && verifySource.includes('function itemListOf(html)')
    && !verifySource.includes('seo.internalLinks(') && !verifySource.includes('seo.jsonLdBlocks('));
  check('声明表自己不读盘、不看时钟（纯数据）',
    !/require\('fs'\)/.test(kindsSource) && !/require\('path'\)/.test(kindsSource)
    && !/Date\.now/.test(kindsSource) && !/new Date\(/.test(kindsSource));
}

/* ================================================================== */
section('⑤ 真实产物：/plans/ 在站上真的成立（构建后才有；构建前跳过）');
/* ================================================================== */

/**
 * 对 `dist/` 现场做一组**独立于构建期自检**的检查。
 *
 * 刻意接受 `overrides`：每一条牙都要能在**不改动真实产物**的前提下污染一个副本再变红
 * （写坏了 dist 再去复原是这类牙最容易出事的地方）。
 */
function distProblems(distDir, overrides = {}) {
  const problems = [];
  const hubFile = path.join(distDir, 'plans', 'index.html');
  if (!fs.existsSync(hubFile) && overrides.hubHtml === undefined) return ['缺少 plans/index.html（先跑 npm run build）'];
  const html = overrides.hubHtml !== undefined ? overrides.hubHtml : fs.readFileSync(hubFile, 'utf8');
  const sitemapText = overrides.sitemapText !== undefined
    ? overrides.sitemapText
    : (fs.existsSync(path.join(distDir, 'sitemap.xml')) ? fs.readFileSync(path.join(distDir, 'sitemap.xml'), 'utf8') : '');
  const indexHtml = overrides.indexHtml !== undefined
    ? overrides.indexHtml
    : (fs.existsSync(path.join(distDir, 'index.html')) ? fs.readFileSync(path.join(distDir, 'index.html'), 'utf8') : '');

  // ① sitemap 成员（可索引 + 自指 canonical 是同一件事的两面）
  // ⚠️ 结构与 h1 必须在**摘掉 script / style / 注释**之后再数：共享样式里那句
  // 「首页此前一个 <h1> 都没有」的注释会被朴素正则数成一个 h1（这个仓库吃过同款假红）。
  const markup = hub.markupOnly(html);
  if (!sitemapText.includes(`<loc>${SITE_URL}plans/</loc>`)) problems.push('sitemap 里没有 /plans/');
  if (!html.includes(`<link rel="canonical" href="${SITE_URL}plans/">`)) problems.push('canonical 不是自指');
  if (/<meta[^>]+name="robots"[^>]*noindex/.test(markup)) problems.push('这一页不该是 noindex');
  if ((markup.match(/<h1[\s>]/g) || []).length !== 1) problems.push('h1 数量不是 1');
  if (!/BreadcrumbList/.test(html)) problems.push('缺少 BreadcrumbList JSON-LD');
  if (!/ItemList/.test(html)) problems.push('缺少 ItemList JSON-LD');

  // ② 无 JS 仍有完整内容：正文按 page-kinds 的下限量一次，且四块事实与两个入口都在
  const visible = markup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const floor = pageKinds.textFloor('plans-hub', hub.PLANS_HUB_CHILDREN.length);
  if (visible.length < floor) problems.push(`可见正文 ${visible.length} 字 < 下限 ${floor}`);
  for (const needle of ['id="plans-hub-coding"', 'id="plans-hub-api"', 'id="plans-hub-changes"', 'id="plans-hub-deals"',
    'data-summary-label="套餐数"', 'data-summary-label="模型计价条目"',
    `href="../plans/coding/"`, `href="../plans/api/"`]) {
    if (!html.includes(needle)) problems.push(`无 JS 内容缺一项：${needle}`);
  }

  // ③ 不是第三张重复大表，也不是死控件页
  if (/<table[\s>]/.test(html)) problems.push('出现了 <table>（不该复制 Coding / API 页的大表）');
  //
  // private-analytics-v1：页脚里的分析 bootstrap 是**全站共享页脚的一部分**（内联，
  // 但加载的是外部观测脚本、不改变页面行为），因此与「主题脚本 / JSON-LD」同属允许的共享内联段。
  // 剥掉它之后这条断言仍然守着原来那件事：**这一页自己没有内联交互脚本**。
  // 剥离用的是唯一实现（`lib/analytics.js` 的 `stripBootstrap()`），不在这里重写一份正则。
  const withoutAllowedScripts = analyticsLib.stripBootstrap(html)
    .replace(/<script>\s*\/\* 主题必须在首次绘制前决定[\s\S]*?<\/script>/g, '')
    .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '');
  if (/<script(?![^>]*\bsrc=)[^>]*>/.test(withoutAllowedScripts)) problems.push('出现了内联脚本');
  if (/<button|<select|<input/.test(markup)) problems.push('预渲染 HTML 里出现了 JS 控件');

  // ④ 页内锚点必须有落点：变化块在别的页面上复用时会带出 `#plan-<id>`，
  //    而这一页并没有套餐表格行 —— 那种链接在浏览器里点了不动，页面上却看不出来。
  const inPageIds = new Set([...markup.matchAll(/id="([^"]*)"/g)].map(m => m[1]));
  const deadAnchors = [...markup.matchAll(/href="#([^"]+)"/g)].map(m => m[1]).filter(id => !inPageIds.has(id));
  if (deadAnchors.length) problems.push(`页内锚点没有落点：${[...new Set(deadAnchors)].slice(0, 3).join('、')}`);

  // ⑤ 不产生孤儿页：至少有一条来自其它页面的入链（共享页脚是这一站的做法）
  if (!/href="plans\/"/.test(indexHtml)) problems.push('首页（以及共享页脚）没有指向 /plans/ 的入口 —— 这会变成孤儿页');
  return problems;
}

//
// `plans/coding/index.html` 也是必需的：⑤b 要把这一页的变化块与它逐条对账（同一个块的 owner）。
if (requireDistFiles('dist 现场 /plans/', [path.join('plans', 'index.html'), path.join('plans', 'coding', 'index.html'), 'sitemap.xml', 'index.html'])) {
  const problems = distProblems(DIST);
  check('dist 现场：sitemap 成员 / 自指 canonical / 唯一 h1 / 面包屑 / ItemList / 无孤儿',
    problems.length === 0, problems.slice(0, 3).join('；'));

  // 牙：把 sitemap 里那一条删掉 → 必须变红
  const sitemapText = fs.readFileSync(path.join(DIST, 'sitemap.xml'), 'utf8');
  const noLoc = sitemapText.replace(`<loc>${SITE_URL}plans/</loc>`, '');
  check('【牙】sitemap 少了 /plans/ → 产物检查变红',
    noLoc !== sitemapText && distProblems(DIST, { sitemapText: noLoc }).some(p => p.includes('sitemap')));

  // 牙：把共享页脚里的入口删掉（模拟孤儿）→ 必须变红
  const indexHtml = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
  const orphaned = indexHtml.replace(/href="plans\/"/, 'href="plans-not-here/"');
  check('【牙】页脚入口消失（孤儿页）→ 产物检查变红',
    orphaned !== indexHtml && distProblems(DIST, { indexHtml: orphaned })
      .some(p => p.includes('孤儿')));

  // 牙：抽掉一个区块（无 JS 读者看不到那一块）→ 必须变红
  const hubHtml = fs.readFileSync(path.join(DIST, 'plans', 'index.html'), 'utf8');
  const gutted = hubHtml.replace(/<section class="phubsec" id="plans-hub-api"[\s\S]*?<\/section>/, '');
  check('【牙】API 计费块被抽掉 → 无 JS 完整性检查变红',
    gutted !== hubHtml && distProblems(DIST, { hubHtml: gutted })
      .some(p => p.includes('plans-hub-api')));

  // 牙：把一张大表塞进来（"第三张重复大表"）→ 必须变红
  const withTable = hubHtml.replace('</main>', '<table class="ptable"><tbody><tr><td>x</td></tr></tbody></table></main>');
  check('【牙】塞进一张大表 → 「不是第三张表」这条变红',
    withTable !== hubHtml && distProblems(DIST, { hubHtml: withTable })
      .some(p => p.includes('大表')));

  // 牙：把变化块里的深链改回页内死锚点 → 必须变红。
  //
  // ⚠️ 污染的是**夹具块**（同一个渲染器产出），不是当天产物里的那一块：变化窗口合法地为空的日子
  //    （最近没有变化 ≠ 出错了）产物里一条 `#plan-` 链接都没有，替换就成了 no-op ——
  //    这条牙 2026-10-12 就是这么静默失效的（它报红，报的却是"自己没前提了"）。
  //    夹具块拼进**真实产物**再污染，所以下面两条测的仍然是真产物上的那套检查。
  const fixtureBlock = changesBlockOf(hub.renderPlansHubPage(fixtureCtx));
  const spliced = hubHtml.replace(/<section class="pchanges" id="plan-changes"[\s\S]*?<\/section>/, fixtureBlock);
  const splicedDeep = (spliced.match(DEEP_LINK_RE) || []).length;
  const deadLinked = spliced.replace(DEEP_LINK_RE, 'href="#plan-deadbeef0000"');
  const splicedProblems = distProblems(DIST, { hubHtml: spliced });
  check('夹具块拼进真实产物后产物检查仍然零问题（夹具块自己是干净的）',
    spliced !== hubHtml && splicedDeep > 0 && splicedProblems.length === 0,
    splicedProblems.slice(0, 2).join('；'));
  check('【牙】变化行的深链被换成页内死锚点 → 变红',
    splicedDeep > 0 && deadLinked !== spliced
    && distProblems(DIST, { hubHtml: deadLinked }).some(p => p.includes('页内锚点没有落点')),
    splicedDeep === 0 ? '夹具块里一条跨页深链都没有（夹具坏了，不是产物坏了）' : '');

  // ⑤b 变化块：`/plans/` 与 `/plans/coding/` 必须是**同一个块**。
  // 这是 2026-10-12 起采集链连红 4 轮的真缺陷的产物级 owner：入口页把变化窗口锚在关系层基准日上，
  // 于是同一个块在两页上给出两批事件 + 两个「另有 N 条」，窗口空掉之后还会一边说
  // 「当前没有观测到套餐变化」、一边列出 5 条。
  const codingPageHtml = fs.readFileSync(path.join(DIST, 'plans', 'coding', 'index.html'), 'utf8');
  const agreement = changesBlockProblems(changesBlockOf(hubHtml), changesBlockOf(codingPageHtml));
  check('变化块与 /plans/coding/ 是同一个块（同 planId 顺序 · 同一个「另有 N 条」· 链接形式归一后逐字相同）',
    agreement.length === 0, agreement.slice(0, 2).join('；'));

  // 牙：三种走样都必须红 —— 第一种就是 2026-10-12 的**回归形状**
  //（把同一份日志锚到另一个数据日 ⇒ 窗口空掉 ⇒ 一边 5 条、一边「没有观测到变化」）。
  const adriftRadar = planChanges.buildPlanRadar({
    plans: fixturePlans, store: fixtureStore, asOf: '2030-01-01', availability: 'ok'
  });
  const adriftBlock = plansPage.planChangesBlockHtml(adriftRadar, {
    prefix: '../',
    planHref: item => (item.planId ? `../plans/coding/#plan-${item.planId}` : null)
  });
  const driftShapes = [
    ['块被锚到别的数据日（回归形状）', adriftBlock],
    ['深链不是同一批', fixtureBlock.replace(/#plan-[0-9a-f]{12}/, '#plan-deadbeef0000')],
    ['「另有 N 条」不同', fixtureBlock.replace(/另有 \d+ 条更早的变化/, '另有 999 条更早的变化')]
  ];
  const missed = driftShapes
    .filter(([, block]) => changesBlockProblems(block, fixtureBlock).length === 0)
    .map(([what]) => what);
  // 三种污染都作用在夹具块上，所以夹具块必须是**有事件的那一版**（有深链、有「另有 N」）：
  // 空态块上"改一个 planId / 改 N"都是 no-op，那样红的是夹具、不是对账。
  const fixtureBlockReady = (fixtureBlock.match(DEEP_LINK_RE) || []).length > 0
    && /另有 \d+ 条更早的变化/.test(fixtureBlock);
  check('【牙】两页对账的三种走样都会红（锚错数据日 / 深链不同 / 「另有 N」不同）',
    fixtureBlockReady && missed.length === 0,
    fixtureBlockReady
      ? `没抓住：${missed.join('、')}`
      : '基准用的夹具块是空态（没有深链 / 没有「另有 N」）—— 夹具坏了（见 ①b 那两条），不是对账没牙');
}
// 缺产物不在这里「跳过并计 ✓」：requireDistFiles() 要么已记红，要么是显式 OPTIONAL DIAGNOSTIC。

/* ================================================================== */

console.log(`\n=== v3.0 /plans/ 资料入口演练：${passed} 项通过，${failures.length} 项失败 ===`);
if (failures.length) {
  console.log('失败项：');
  failures.forEach(name => console.log(`  ✗ ${name}`));
  process.exit(1);
}
