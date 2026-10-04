#!/usr/bin/env node
/**
 * v3.0 Stage E 演练：**厂商统一资料页**（`/vendor/<slug>/`）。
 *
 * 这一支负责的是「模块与断言」：`landing.js` 的门槛/join、`lib/vendor-page.js` 的
 * 资料区块与三个断言、以及 `seo.js` 的 `gate-threshold` 同步。
 * （`build-local.js` 的接线由队长按本文件末尾的说明改。）
 *
 * 题面 §8 属于这一家族的三条牙，全部实跑变红：
 *   #6 同一 provider 出现两个 canonical slug；
 *   #7 `/vendor/` 与 `/provider/` 两套 indexable 重复页面；
 *   #8 Provider Page 的 API 数量与 api-plans 数据不一致（渲染数字 vs 数据重算）。
 * 另外覆盖：门槛的第三条 OR 支（非优惠资料）、seo 的 gate-threshold 同步、纯追加边界。
 */

'use strict';

const fs = require('fs');
const path = require('path');

const landing = require('../lib/landing');
const vendorPage = require('../lib/vendor-page');
const seo = require('../lib/seo');
const feeds = require('../lib/feeds');
const providers = require('../lib/providers');
const renderCore = require('../lib/render-core');

const ROOT = path.join(__dirname, '..', '..');
const SITE_URL = 'https://buguoshixc.github.io/ai-deals-aggregator/';

/* ------------------------------------------------------------------ */
/* 产物目录与 fail-closed 前置（§10.9 · P2-10 / P2-26）                  */
/* ------------------------------------------------------------------ */
//
// 第 ⑧ 节要读**构建产物**（`<dist>/vendor/**` 与四份数据集）。原先的写法是
// 「dist 里没有接线好的资料区块 ⇒ 跳过并计 ✓」—— 而门禁在构建**之前**跑，
// 于是这一节在 CI 里永远是绿的；接线确实完成之后，这条「尚未接线」的出口
// 还会把真正的接线回归（资料区块消失）静默吞掉。
//
// 六个产物依赖工具现在用同一套协议：
//   · `--dir=<path>`            显式指定产物目录（默认 `<repo>/dist`）；
//   · 缺少必需产物 ⇒ **非 0**，并给出「先 build / 用 --dir 指到别的产物」的下一步；
//   · 只有显式 `--allow-missing-dist` 才允许跳过，且会被标成 `⚠️ OPTIONAL DIAGNOSTIC`。
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
/* 真实数据                                                            */
/* ------------------------------------------------------------------ */

const deals = readJson('deals.json').deals;
const plans = readJson('plans.json').plans;
const apiPlans = readJson('api-plans.json').plans;
const models = readJson('models.json').models;
const modelLinks = readJson('scripts/data/model-registry-links.json').links;
const planHistoryStore = readJson('scripts/data/plan-history.json');
const apiPlanHistoryStore = readJson('scripts/data/api-plan-history.json');
const providerLoad = providers.load();
const providerTable = providerLoad.table;
const renderCoreBundle = renderCore.load(path.join(ROOT, 'index.html'));
const vendorKeyOf = deal => renderCoreBundle.vendorOf(deal).name;

const vendorThresholds = feeds.VENDOR_THRESHOLDS;
const planOptions = {
  deals, vendorKeyOf, vendorSlugs: feeds.VENDOR_SLUGS, vendorThresholds, eventCountOf: () => 0
};
const basePlan = landing.planLandingPages(planOptions);
const extPlan = landing.planLandingPages({
  ...planOptions, plans, apiPlans, providerTable, models, modelLinks
});
const vendorPages = extPlan.pages.filter(page => page.kind === 'vendor');

function ctxFor(spec, extra = {}) {
  return {
    deals: landing.itemsOf(spec, deals, { vendorKeyOf }),
    plans, apiPlans, models, modelLinks,
    planHistoryStore, apiPlanHistoryStore, providerTable,
    feeds: feeds.feedsForPage({ kind: 'vendor', slug: spec.slug }, []),
    prefix: '../',
    ...extra
  };
}

/** 资料区块是**正文片段**（h1 在套壳里），断言整页时先补一个 h1 */
function wrapFragment(fragment, spec) {
  return `<!DOCTYPE html><html lang="zh-CN"><body><main>`
    + `<h1>${spec.heading}</h1>\n${fragment}\n</main></body></html>`;
}

/* ================================================================== */
section('① 真实数据：join 出来的资料区块与断言');
/* ================================================================== */

check(`真实数据上厂商页从 ${basePlan.pages.filter(p => p.kind === 'vendor').length} 个增到 ${vendorPages.length} 个（非优惠资料 + A 空间身份，R5）`,
  vendorPages.length > basePlan.pages.filter(page => page.kind === 'vendor').length);
check('候选集合 == 「有 A 空间厂商名 且 达标」的 provider 集合（不再多、不再少）',
  (() => {
    const identityProviders = Object.entries(providerTable).filter(([, entry]) => entry && entry.vendorKey).map(([, entry]) => String(entry.name));
    const expected = identityProviders.filter(name => {
      const material = landing.vendorMaterialOf({ vendorName: name, providerTable, plans, apiPlans, models, modelLinks });
      return material.nonDeal || vendorPages.some(page => page.key === name);
    });
    return expected.every(name => vendorPages.some(page => page.key === name))
      && vendorPages.every(page => identityProviders.includes(page.key));
  })());
check('三种资料类型都被真实数据覆盖（Coding 套餐 / API 记录 / 模型归属）',
  vendorPages.some(page => page.material.codingPlans > 0)
  && vendorPages.some(page => page.material.apiRecords > 0)
  && vendorPages.some(page => page.material.models > 0));
check('至少一家厂商是「没有优惠、靠非优惠资料达标」的',
  vendorPages.some(page => page.count === 0 && page.nonDealMaterial));
check('provider key 与厂商显示名对得上（身份来自 providers.json，不是猜的）',
  vendorPages.every(page => !page.material.providerKey || providers.providerNameOf(page.material.providerKey, providerTable) === page.key));

{
  const problems = [];
  for (const spec of vendorPages) {
    const ctx = ctxFor(spec);
    const view = vendorPage.vendorViewOf(spec, ctx);
    const fragment = vendorPage.renderVendorKnowledgeSections(spec, { ...ctx, view });
    problems.push(...vendorPage.assertVendorPageHonesty(wrapFragment(fragment, spec), spec, { ...ctx, view })
      .map(problem => `${spec.slug}: ${problem}`));
    problems.push(...vendorPage.assertVendorApiCounts(fragment, spec, { ...ctx, view })
      .map(problem => `${spec.slug}: ${problem}`));
  }
  check(`全部 ${vendorPages.length} 个厂商页的资料区块零问题（断言不是恒红）`,
    problems.length === 0, problems.slice(0, 3).join('；'));
}

check('资料区块的计数标记与数据一致（API 记录 / 模型计价条目 / 计费通道 / 模型数）',
  vendorPages.some(page => page.material.apiRecords > 0)
  && vendorPages.every(spec => {
    const ctx = ctxFor(spec);
    const view = vendorPage.vendorViewOf(spec, ctx);
    const fragment = vendorPage.renderVendorKnowledgeSections(spec, { ...ctx, view });
    return vendorPage.assertVendorApiCounts(fragment, spec, { ...ctx, view }).length === 0;
  }));
check('资料区块里没有 data-item / data-child（否则 ItemList 行数对账会失真）',
  vendorPages.every(spec => !/data-item=|data-child=/.test(vendorPage.renderVendorKnowledgeSections(spec, ctxFor(spec)))));

// F-v3-registry-001 / P1-12：per-model「在这一家的计价条目 N 条」必须按**展开后的条目**算。
// 旧口径把一条 `variant: null` 映射记成 1 条，而模型页现在为它渲染 n 行 —— 同一个事实两个数字。
{
  const planById = new Map(apiPlans.filter(plan => plan && plan.id).map(plan => [plan.id, plan]));
  const expandedCountOf = link => {
    const plan = planById.get(link.apiPlanId);
    if (!plan) return 0;
    const entries = (plan.models || []).filter(item => item && item.modelKey === link.modelKey);
    if (!entries.length) return 0;
    if (link.variant === null || link.variant === undefined || link.variant === '') return entries.length;
    return entries.filter(item => item.variant === link.variant).length;
  };
  const mismatched = [];
  const seen = new Map();
  for (const spec of vendorPages) {
    const ctx = ctxFor(spec);
    const view = vendorPage.vendorViewOf(spec, ctx);
    // 口径：只算**本厂商自己的** API 记录（与本页 providerKey 一致），再按展开后的条目数计
    const ownPlanIds = new Set(apiPlans.filter(plan => plan && plan.provider === view.providerKey).map(plan => plan.id));
    for (const model of view.models) {
      const refs = modelLinks.filter(link => link
        && (String(link.registrySlug || '') === model.slug || String(link.registryModelId || '') === model.id)
        && link.apiPlanId && ownPlanIds.has(link.apiPlanId));
      const expected = refs.reduce((sum, link) => sum + expandedCountOf(link), 0);
      if (model.apiItemCount !== expected) mismatched.push(`${spec.slug}/${model.slug}: ${model.apiItemCount} ≠ ${expected}`);
      if (expected > 0 && !seen.has(model.slug)) seen.set(model.slug, expected);
    }
  }
  check('厂商页 per-model 计价条目数 = 本厂商记录里独立展开后的条目数（通配映射不按 1 条算）',
    mismatched.length === 0, mismatched.slice(0, 4).join(' · '));
  const multi = [...seen.entries()].filter(([, count]) => count > 1);
  check(`真实数据里至少有一个模型在厂商页上记的条目数是展开出来的（如 qwen3-max: ${seen.get('qwen3-max')}）`,
    multi.length >= 1 && seen.get('qwen3-max') === 2, JSON.stringify(multi.slice(0, 6)));
}
check('没有 Coding 套餐的厂商写的是明确空态（不是空白、也不是 0 条记录）',
  vendorPages.filter(spec => !vendorPage.vendorViewOf(spec, ctxFor(spec)).codingPlans.length)
    .every(spec => /尚未收录这家厂商的 Coding 套餐/.test(vendorPage.renderVendorKnowledgeSections(spec, ctxFor(spec)))));
check('模型区块只链到真实存在的 registry 模型',
  vendorPages.every(spec => {
    const ctx = ctxFor(spec);
    return vendorPage.vendorViewOf(spec, ctx).models.every(model => models.some(row => row.slug === model.slug));
  }));

/* ================================================================== */
section('② 门槛：三条 OR 支（条数 / 事件 / 非优惠资料）');
/* ================================================================== */

{
  const t = { minDeals: 2, minEvents: 3 };
  const cases = [
    ['条数达标', { count: 2, eventCount: 0, nonDealMaterial: false }, true],
    ['事件达标', { count: 0, eventCount: 3, nonDealMaterial: false }, true],
    ['非优惠资料达标', { count: 0, eventCount: 0, nonDealMaterial: true }, true],
    ['三条都不达标', { count: 1, eventCount: 2, nonDealMaterial: false }, false]
  ];
  for (const [label, candidate, expected] of cases) {
    const gate = landing.shouldGenerateLandingPage('vendor', candidate, { vendorThresholds: t });
    check(`门槛「${label}」→ ${expected ? '生成' : '不生成'}（reason=${gate.reason}）`, gate.ok === expected);
  }
  check('靠非优惠资料达标时 reason 明确写出来（日志里读得懂为什么这一页存在）',
    landing.shouldGenerateLandingPage('vendor', { count: 0, eventCount: 0, nonDealMaterial: true }, { vendorThresholds: t }).reason === 'eligible-nondeal');
  check('不传 nonDealMaterial 时门槛与 v2.x 逐字相同（纯追加）',
    landing.shouldGenerateLandingPage('vendor', { count: 1, eventCount: 0 }, { vendorThresholds: t }).ok === false
    && landing.shouldGenerateLandingPage('vendor', { count: 2, eventCount: 0 }, { vendorThresholds: t }).ok === true);
}

/* ================================================================== */
section('③ 牙 #6：同一 provider 两个 canonical slug');
/* ================================================================== */

{
  const good = vendorPage.assertVendorSlugCanonical(vendorPages, { providerTable, vendorSlugs: feeds.VENDOR_SLUGS });
  check('真实数据上 slug 唯一且与两份登记表一致（断言不是恒红）', good.length === 0, good.slice(0, 2).join('；'));

  // R5（队长裁定）：只有「在 A 空间有厂商名」的 provider 才建 /vendor/ 路由
  const skippedNoIdentity = extPlan.skipped.filter(row => row.reason === 'no-vendor-identity');
  check(`【R5】没有 A 空间厂商名的 provider 不建路由、逐条记 skip（${skippedNoIdentity.map(row => row.key).join(' / ') || '无'}）`,
    skippedNoIdentity.length === 4
    && ['Trae', 'Qoder CN', 'Qoder International', '腾讯 CodeBuddy'].every(name => skippedNoIdentity.some(row => row.key === name))
    && skippedNoIdentity.every(row => !vendorPages.some(page => page.key === row.key)));
  check('【R5】候选厂商名全部在 A 空间有身份（vendorKey 非 null）',
    vendorPage.assertVendorCandidateIdentity(vendorPages, { providerTable }).length === 0);

  // 队长补充：slug 必须来自权威表（不能只靠 providers.json 兜底）
  const declared = vendorPage.assertVendorSlugDeclared(vendorPages, { vendorSlugs: feeds.VENDOR_SLUGS });
  check(`【R5 续】${vendorPages.length} 个厂商页的 slug 全部来自 vendor-slugs.json（权威表，不靠 provider 兜底）`,
    declared.length === 0, declared.slice(0, 2).join('；'));
  check('【R5 续牙】某家未登记 slug（只靠 provider 兜底）→ 红',
    vendorPage.assertVendorSlugDeclared([
      { kind: 'vendor', key: '演练厂商', slug: 'demo', route: 'vendor/demo/' }
    ], { vendorSlugs: {} }).some(problem => problem.includes('没有在 scripts/data/vendor-slugs.json 里登记')));
  check('【R5 续牙】登记值与页面 slug 不一致 → 红',
    vendorPage.assertVendorSlugDeclared([
      { kind: 'vendor', key: '智谱AI', slug: 'zhipu-x', route: 'vendor/zhipu-x/' }
    ], { vendorSlugs: { 智谱AI: 'zhipu' } }).some(problem => problem.includes('登记的是')));
  check('【R5 牙】给没有 A 空间厂商名的 provider 生成路由 → 红',
    vendorPage.assertVendorCandidateIdentity([
      ...vendorPages,
      { kind: 'vendor', key: 'Trae', slug: 'trae', route: 'vendor/trae/' }
    ], { providerTable }).some(problem => problem.includes('A 空间厂商名')));
  {
    const aSpaceNames = renderCoreBundle.vendorKeyNames().map(pair => pair.name);
    check(`【R5】用 index.html 的真实 A 空间厂商名表（${aSpaceNames.length} 个）核验：页面厂商名全部命中`,
      vendorPage.assertVendorCandidateIdentity(vendorPages, { providerTable, vendorNames: aSpaceNames }).length === 0,
      vendorPage.assertVendorCandidateIdentity(vendorPages, { providerTable, vendorNames: aSpaceNames }).slice(0, 1).join('；'));
  }

  const duplicated = vendorPage.assertVendorSlugCanonical([
    { kind: 'vendor', key: '甲', slug: 'acme', route: 'vendor/acme/' },
    { kind: 'vendor', key: '乙', slug: 'acme', route: 'vendor/acme/' }
  ], {});
  check('【牙 #6】两个厂商页共用同一个 slug → 红',
    duplicated.some(problem => problem.includes('canonical slug')), duplicated.slice(0, 1).join(''));

  const mismatched = vendorPage.assertVendorSlugCanonical([
    { kind: 'vendor', key: '智谱AI', slug: 'zhipu', route: 'vendor/zhipu/' }
  ], { providerTable, vendorSlugs: { 智谱AI: 'zhipu-ai' } });
  check('【牙 #6】两份登记表 slug 不一致 → 红',
    mismatched.some(problem => problem.includes('不一致')), mismatched.slice(0, 1).join(''));

  const pageMismatch = vendorPage.assertVendorSlugCanonical([
    { kind: 'vendor', key: '智谱AI', slug: 'zhipu-ai', route: 'vendor/zhipu-ai/' }
  ], { providerTable, vendorSlugs: feeds.VENDOR_SLUGS });
  check('【牙 #6】页面用的 slug 与 canonical 不一致 → 红',
    pageMismatch.some(problem => problem.includes('canonical')), pageMismatch.slice(0, 1).join(''));
}

/* ================================================================== */
section('④ 牙 #7：/vendor/ 与 /provider/ 两套重复页面');
/* ================================================================== */

{
  const good = vendorPage.assertNoParallelProviderRoutes(vendorPages);
  check('只有 /vendor/<slug>/ → 零问题（断言不是恒红）', good.length === 0, good.slice(0, 1).join(''));

  const polluted = vendorPage.assertNoParallelProviderRoutes([
    ...vendorPages,
    { kind: 'provider', route: 'provider/zhipu/', indexable: true }
  ]);
  check('【牙 #7】出现可索引的 /provider/<slug>/ → 红',
    polluted.some(problem => problem.includes('/provider/')), polluted.slice(0, 1).join(''));

  const noindex = vendorPage.assertNoParallelProviderRoutes([{ kind: 'alias', route: 'provider/zhipu/', indexable: false }]);
  check('【牙 #7】即便 noindex，/provider/ 路由本身也不允许（方案 A 只保留 /vendor/）', noindex.length > 0);
}

/* ================================================================== */
section('⑤ 牙 #8：API 数量与 api-plans 数据不一致');
/* ================================================================== */

{
  const spec = vendorPages.find(page => page.material.apiRecords > 0);
  const ctx = ctxFor(spec);
  const view = vendorPage.vendorViewOf(spec, ctx);
  const fragment = vendorPage.renderVendorKnowledgeSections(spec, { ...ctx, view });
  check('真实数据上 API 计数断言零问题（断言不是恒红）',
    vendorPage.assertVendorApiCounts(fragment, spec, { ...ctx, view }).length === 0);

  const lied = fragment.replace(
    `data-vendor-count="api-records" data-vendor-value="${view.apiRecords.length}"`,
    `data-vendor-count="api-records" data-vendor-value="${view.apiRecords.length + 1}"`);
  check('【牙 #8】页面上的 API 记录数被写多 1 → 红',
    lied !== fragment && vendorPage.assertVendorApiCounts(lied, spec, { ...ctx, view })
      .some(problem => problem.includes('api-records')), lied === fragment ? '（替换没生效）' : '');

  const wrongView = { ...view, apiModelCount: view.apiModelCount + 3 };
  check('【牙 #8】视图与数据不一致（模型计价条目数）→ 红',
    vendorPage.assertVendorApiCounts(fragment, spec, { ...ctx, view: wrongView }).length > 0);

  const truncated = fragment.replace(/<li>[\s\S]*?<\/li>/, '');
  check('【牙 #8】少渲染一条计费记录 → 红',
    vendorPage.assertVendorApiCounts(truncated, spec, { ...ctx, view }).length > 0
    || vendorPage.assertVendorPageHonesty(wrapFragment(truncated, spec), spec, { ...ctx, view }).length > 0);
}

/* ================================================================== */
section('⑥ seo.js 的 gate-threshold 与 landing 门槛同步');
/* ================================================================== */

function gateProblems(page) {
  const descriptor = {
    route: page.route || 'vendor/demo/',
    kind: 'vendor',
    indexable: true,
    inSitemap: true,
    html: '<html><head><title>t</title></head><body><h1>x</h1></body></html>',
    itemIds: [], childRoutes: [], summary: [], count: page.count, pinned: false,
    eventCount: page.eventCount, nonDealMaterial: page.nonDealMaterial,
    expectItemList: false, checkItemListRows: false, checkItemListMembers: false
  };
  const result = seo.validate([descriptor], {
    siteUrl: SITE_URL,
    sitemap: [`${SITE_URL}${descriptor.route}`],
    thresholds: { categoryMinDeals: 4, vendorMinDeals: vendorThresholds.minDeals, vendorMinEvents: vendorThresholds.minEvents },
    gate: { skipped: [] }
  });
  return result.problems.filter(problem => problem.code === 'gate-threshold');
}

check('条数达标 → 不报 gate-threshold', gateProblems({ count: 2, eventCount: 0, nonDealMaterial: false }).length === 0);
check('【牙】靠非优惠资料达标 → 不报 gate-threshold（否则 v3.0 新增的厂商页会被门禁判死）',
  gateProblems({ count: 0, eventCount: 0, nonDealMaterial: true }).length === 0);
check('事件数达标 → 不报 gate-threshold', gateProblems({ count: 1, eventCount: 3, nonDealMaterial: false }).length === 0);
check('三条都不达标 → 仍然报 gate-threshold（没有放宽任何东西）',
  gateProblems({ count: 1, eventCount: 0, nonDealMaterial: false }).length === 1);
check('描述符不给新字段时行为与 v2.x 相同（count=1 仍红）',
  gateProblems({ count: 1 }).length === 1);

/* ================================================================== */
section('⑦ 纯追加：非厂商页与既有厂商页的边界');
/* ================================================================== */

{
  const stripVendorAndHub = pages => JSON.stringify(pages
    .filter(page => page.kind !== 'vendor' && !(page.kind === 'hub' && page.key === 'vendor'))
    .map(page => ({ ...page, children: undefined })));
  check('不传 Stage E 的四份 join 输入时，计划与 v2.x 逐字节相同（老调用方零影响）',
    JSON.stringify(basePlan.pages) === JSON.stringify(landing.planLandingPages(planOptions).pages));
  check('传入后：厂商页与厂商枢纽之外的页面一个字节都没变',
    stripVendorAndHub(basePlan.pages) === stripVendorAndHub(extPlan.pages));
  check('厂商枢纽的子页集合**按设计**跟随（枢纽本来就要列全部厂商页）',
    extPlan.pages.find(page => page.kind === 'hub' && page.key === 'vendor').children.length === vendorPages.length);
  const baseSlugs = basePlan.pages.filter(page => page.kind === 'vendor').map(page => page.slug);
  check(`既有 ${baseSlugs.length} 个厂商页全部保留（没有因为新门槛而消失）`,
    baseSlugs.every(slug => vendorPages.some(page => page.slug === slug)));
  check('非厂商页调用资料区块渲染器返回空串（纯追加：一个字节都不加）',
    vendorPage.renderVendorKnowledgeSections({ kind: 'collection', key: 'student', slug: 'student' }, {}) === '');
  check('有条数的厂商页 title/heading 未被改写（只有 0 优惠的资料页换标题）',
    vendorPages.filter(page => page.count > 0).every(page => page.title === `${page.key} 的 AI 优惠`)
    && vendorPages.filter(page => page.count === 0 && page.nonDealMaterial).every(page => page.title === `${page.key} 的 AI 资料`));
}

check('vendor-page.js 是纯函数（不读盘、不看时钟）',
  !/require\('fs'\)/.test(fs.readFileSync(path.join(ROOT, 'scripts', 'lib', 'vendor-page.js'), 'utf8'))
  && !/Date\.now|new Date\s*\(/.test(fs.readFileSync(path.join(ROOT, 'scripts', 'lib', 'vendor-page.js'), 'utf8')));
check('接线用的 bundle 对非厂商页返回空 html + 空 css（纯追加：一个字节都不加）',
  JSON.stringify(vendorPage.renderVendorKnowledgeBundle({ kind: 'category', slug: 'x' }, {})) === JSON.stringify({ html: '', css: '' })
  && vendorPage.renderVendorKnowledgeBundle(vendorPages[0], ctxFor(vendorPages[0])).css.includes('.vknow'));
check('没有新增「厂商数据」真值文件（join，不是 duplicate）',
  !fs.existsSync(path.join(ROOT, 'scripts', 'data', 'vendor-pages.json'))
  && !fs.existsSync(path.join(ROOT, 'scripts', 'data', 'vendors.json')));

/* ================================================================== */
section('⑧ 真实产物（接线后才有；未接线时如实跳过）');
/* ================================================================== */

{
  const providerDir = path.join(DIST, 'provider');
  check('dist 里没有 /provider/ 目录（方案 A 只保留 /vendor/<slug>/）', !fs.existsSync(providerDir));

  const wired = fs.existsSync(path.join(DIST, 'vendor'))
    && fs.readdirSync(path.join(DIST, 'vendor'))
      .some(slug => fs.existsSync(path.join(DIST, 'vendor', slug, 'index.html'))
        && fs.readFileSync(path.join(DIST, 'vendor', slug, 'index.html'), 'utf8').includes(vendorPage.KNOWLEDGE_WRAPPER_ID));
  const ready = requireDistFiles('dist 现场的厂商资料页', ['vendor', 'api-plans.json', 'plans.json',
    'models.json', 'model-registry-links.json', 'sitemap.xml']);
  if (!ready) {
    // 缺产物：已记红（或显式 OPTIONAL DIAGNOSTIC）。
  } else if (!wired) {
    // 接线完成后「没接线」不再是可跳过状态：资料区块消失 = 用户可见回归。
    check('厂商资料区块在产物里不存在（build-local 的 extraSections 没有接线 / 接线回归）', false);
  } else {
    const problems = [];
    const diskApiPlans = JSON.parse(fs.readFileSync(path.join(DIST, 'api-plans.json'), 'utf8')).plans;
    const diskPlans = JSON.parse(fs.readFileSync(path.join(DIST, 'plans.json'), 'utf8')).plans;
    const diskModels = JSON.parse(fs.readFileSync(path.join(DIST, 'models.json'), 'utf8')).models;
    const diskLinks = JSON.parse(fs.readFileSync(path.join(DIST, 'model-registry-links.json'), 'utf8')).links;
    const sitemap = fs.readFileSync(path.join(DIST, 'sitemap.xml'), 'utf8');
    for (const spec of vendorPages) {
      const file = path.join(DIST, spec.route, 'index.html');
      if (!fs.existsSync(file)) { problems.push(`${spec.route}: 缺少产物`); continue; }
      const html = fs.readFileSync(file, 'utf8');
      if (!sitemap.includes(`<loc>${SITE_URL}${spec.route}</loc>`)) problems.push(`${spec.route}: sitemap 漏了`);
      const ctx = {
        ...ctxFor(spec), apiPlans: diskApiPlans, plans: diskPlans, models: diskModels, modelLinks: diskLinks
      };
      const view = vendorPage.vendorViewOf(spec, ctx);
      problems.push(...vendorPage.assertVendorPageHonesty(html, spec, { ...ctx, view }).map(problem => `${spec.route}: ${problem}`));
      problems.push(...vendorPage.assertVendorApiCounts(html, spec, { ...ctx, view }).map(problem => `${spec.route}: ${problem}`));
    }
    check(`dist 现场：${vendorPages.length} 个厂商页的资料区块与数据逐项对账`,
      problems.length === 0, problems.slice(0, 3).join('；'));
  }
}

/* ================================================================== */

console.log(`\n=== v3.0 厂商统一资料页演练：${passed} 项通过，${failures.length} 项失败 ===`);
if (failures.length) {
  console.log('失败项：');
  failures.forEach(name => console.log(`  ✗ ${name}`));
  process.exit(1);
}
