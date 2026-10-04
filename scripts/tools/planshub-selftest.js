#!/usr/bin/env node
/**
 * v3.0 `/plans/` 资料入口演练（离线、零依赖、可重跑）。
 *
 * 它演练的是这一层自己的承诺：
 *   · 页面上的每个数字都能由输入数据重算出来；
 *   · 当前相关优惠**只**来自显式关系，且已结束的关联结构性地拿不到"当前"标记；
 *   · 变化块复用既有日志与措辞，不写第二套判据；
 *   · page-kinds 是"路由 → kind / 下限 / ItemList / sitemap priority"的唯一声明，
 *     构建期规则层与独立门禁都读它，但**各自从 dist 解析**（执行路径没有合并）。
 *
 * 牙是**实跑**的：污染 → 断言必须变红 → 复原后必须回到绿。
 */

'use strict';

const fs = require('fs');
const path = require('path');

const hub = require('../lib/plans-hub-page');
const pageKinds = require('../lib/page-kinds');
const providers = require('../lib/providers');

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
check('页面结构：h1 + 面包屑 + 两个入口 + 变化块 + 数据出口',
  /<h1>/.test(page) && page.includes('class="crumb"')
  && page.includes('href="../plans/coding/"') && page.includes('href="../plans/api/"')
  && page.includes('id="plans-hub-changes"') && page.includes('href="../api-plans.json"'));
check('未生成 /docs/data/ 时不给指向它的死链（站内链接存在性是硬门禁）',
  !page.includes('href="../docs/data/"'));
check('生成 /docs/data/ 之后（dataDocs: true）才链接数据文档',
  fullPage({ ctx: { ...ctx, dataDocs: true } }).includes('href="../docs/data/"'));
check('两个子页各有一个 data-child 行（ItemList 靠它对账）',
  (page.match(/data-child="/g) || []).length === 2);
check('ItemList 声明数 == 元素数 == data-child 行数',
  hub.assertItemListHonesty(page, ctx).length === 0, hub.assertItemListHonesty(page, ctx).join('；'));

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
  const legacy = [
    ['hub', 3, 500 + 60 * 3], ['deal', 0, 500], ['status', 0, 600], ['changes', 0, 600],
    ['feeds', 0, 600], ['plans', 9, 600 + 60 * 9], ['home', 0, 3000], ['collection', 2, 600 + 60 * 2]
  ];
  const wrong = legacy.filter(([kind, count, expected]) => pageKinds.textFloor(kind, count) !== expected);
  check(`既有 ${legacy.length} 个 kind 的正文下限逐字未变`, wrong.length === 0,
    JSON.stringify(wrong));
  check('新家族的下限都已声明（不是落在缺省 600+60n 上）',
    pageKinds.textFloor('plans-hub', 2) === 700 + 60 * 2
    && pageKinds.textFloor('models-index', 3) === 600 + 60 * 3
    && pageKinds.textFloor('model', 0) === 700
    && pageKinds.textFloor('archive-index', 1) === 600 + 60
    && pageKinds.textFloor('archive-detail', 0) === 600
    && pageKinds.textFloor('data-docs', 0) === 1200);
  check('sitemap priority 是声明（入口 0.9 / 枢纽 0.8 / 详情 0.7 / 工具页更低）',
    pageKinds.sitemapMeta('plans-hub').priority === '0.9'
    && pageKinds.sitemapMeta('model').priority === '0.7'
    && pageKinds.sitemapMeta('status').priority === '0.3'
    && pageKinds.sitemapMeta('data-docs').priority === '0.6');
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
  if (/<table[\s>]/.test(html)) problems.push('出现了 <table>（不该复制 Coding / API 页的大表）');  const withoutAllowedScripts = html
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

if (requireDistFiles('dist 现场 /plans/', [path.join('plans', 'index.html'), 'sitemap.xml', 'index.html'])) {
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

  // 牙：把变化块里的深链改回页内死锚点 → 必须变红
  const deadLinked = hubHtml.replace(/href="\.\.\/plans\/coding\/#plan-[0-9a-f]{12}"/, 'href="#plan-deadbeef0000"');
  check('【牙】变化行的深链被换成页内死锚点 → 变红',
    deadLinked !== hubHtml && distProblems(DIST, { hubHtml: deadLinked })
      .some(p => p.includes('页内锚点没有落点')));
}
// 缺产物不在这里「跳过并计 ✓」：requireDistFiles() 要么已记红，要么是显式 OPTIONAL DIAGNOSTIC。

/* ================================================================== */

console.log(`\n=== v3.0 /plans/ 资料入口演练：${passed} 项通过，${failures.length} 项失败 ===`);
if (failures.length) {
  console.log('失败项：');
  failures.forEach(name => console.log(`  ✗ ${name}`));
  process.exit(1);
}
