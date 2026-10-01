#!/usr/bin/env node
/**
 * v3.0 Model Registry 页面层演练（离线、零依赖、可重跑）—— `/models/` 与 `/models/<slug>/`。
 *
 * 演练题面 Stage D5–D9 的页面承诺，以及 §8 属于这一家族的五条牙：
 *   #1  两个同名模型来自不同开发者 → **不许被自动合并**（同名不同 slug，各自一行、各自一页）；
 *   #2  alias 指向两个 registry model → 红（别名与 slug 同一命名空间，一个别名只能指向一个模型）；
 *   #3  mapping 指向不存在的 api plan / modelKey → 红（页面也不许凭空补一行价格）；
 *   #4  modelKey 改名被工具直接自动 merge → 红（改名不改身份，必须显式映射）；
 *   #5  Model Page 展示不存在的 Provider → 红（表格逐行回读对账）；
 *   外加 #18 详情页 canonical 唯一、#19 未过门槛的模型页进 sitemap。
 *
 * registry / 映射 / 计价条目全部来自**仓库里的真实文件**（不是硬编码样例）：
 * `scripts/data/models.json`（`{slug: entry}`）+ `scripts/data/model-registry-links.json`
 * + `api-plans.json` + `plans.json` + `deal-plan-links.json` + `api-plan-history.json`。
 */

'use strict';

const fs = require('fs');
const path = require('path');

const modelsPage = require('../lib/models-page');
const modelRegistry = require('../lib/model-registry');
const apiPlansPage = require('../lib/api-plans-page');
const providers = require('../lib/providers');
const pageKinds = require('../lib/page-kinds');

const ROOT = path.join(__dirname, '..', '..');
const SITE_URL = 'https://buguoshixc.github.io/ai-deals-aggregator/';
const DIST = path.join(ROOT, 'dist');

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

const providerTable = providers.load().table;
const apiPlans = readJson('api-plans.json').plans;
const plans = readJson('plans.json').plans;
const deals = readJson('deals.json').deals;
const dealLinks = readJson('scripts/data/deal-plan-links.json');
const apiPlanHistoryStore = readJson('scripts/data/api-plan-history.json');
const modelsTable = modelRegistry.load().table;
const linksDoc = modelRegistry.loadLinks().doc;
const publishedModels = modelRegistry.publishedModels({ table: modelsTable, links: linksDoc, apiPlans, plans });
const publishedLinks = modelRegistry.publishedLinks(linksDoc, modelsTable);
const modelDevelopers = Object.values(providerTable).map(entry => String((entry && entry.name) || ''));
const modelsSourceRaw = JSON.parse(fs.readFileSync(modelRegistry.MODELS_FILE, 'utf8'));
const extraDevelopers = Object.keys((modelsSourceRaw && modelsSourceRaw._developers_extra) || {});

const ctx = {
  links: linksDoc,
  apiPlans,
  plans,
  deals,
  dealLinks,
  apiPlanHistoryStore,
  providerTable,
  asOf: '2026-10-01',
  siteUrl: SITE_URL,
  prefix: '../../'
};

const models = modelsPage.modelsOf(modelsTable);
const gates = models.map(model => modelsPage.modelPageGate(model, ctx));
const gated = gates.filter(gate => gate.shouldGenerate);

function indexPageOf(registry, extra = {}) {
  const indexCtx = { ...ctx, prefix: '../', __refCache: new Map(), ...extra };
  const html = modelsPage.renderModelsIndex(registry, indexCtx);
  const jsonLd = modelsPage.modelsIndexJsonLd(registry, indexCtx)
    .map(data => `<script type="application/ld+json">${JSON.stringify(data)}</script>`).join('');
  return { html, jsonLd, ctx: indexCtx };
}

function detailPageOf(model, extra = {}) {
  const detailCtx = { ...ctx, prefix: '../../', __refCache: new Map(), ...extra };
  const html = modelsPage.renderModelPage(model, detailCtx);
  const jsonLd = modelsPage.modelPageJsonLd(model, detailCtx)
    .map(data => `<script type="application/ld+json">${JSON.stringify(data)}</script>`).join('');
  return { html, jsonLd, ctx: detailCtx };
}

/* ================================================================== */
section('① 真实 registry：身份 / 映射 / 门槛');
/* ================================================================== */

check(`registry 载入 ${models.length} 个模型（slug 为键的人工来源层）`,
  models.length === Object.keys(modelsTable).length && models.length > 0);
check('registry 与关系层都通过同一支判据校验',
  modelRegistry.validateRegistry(modelsTable, { developers: modelDevelopers, extraDevelopers }).length === 0
  && modelRegistry.validateLinks(linksDoc, { table: modelsTable, apiPlans, plans }).length === 0);
check(`全部 ${models.length} 个模型都被显式引用（门槛内 ${gated.length} 个）`,
  gated.length === models.length && gates.every(gate => gate.references > 0));
{
  const coverage = modelRegistry.coverageOf({ table: modelsTable, links: linksDoc, apiPlans, plans });
  check(`覆盖：未映射 API modelKey ${coverage.unmappedModelKeys.length} 条 · 未映射套餐模型串 ${coverage.unmappedPlanModels.length} 条（后者只进候选报告）`,
    coverage.unmappedModelKeys.length === 0
    && coverage.apiLinks + coverage.codingLinks === publishedLinks.count
    && coverage.linkedModels === coverage.models);
}
check('派生产物两次构建逐字节相同（不读墙上时钟）',
  JSON.stringify(modelRegistry.publishedModels({ table: modelsTable, links: linksDoc, apiPlans, plans })) === JSON.stringify(publishedModels));

/* ================================================================== */
section('② 索引页：行 / ItemList / 筛选 / 静态可读（真实数据）');
/* ================================================================== */

{
  const { html, jsonLd, ctx: indexCtx } = indexPageOf(modelsTable);
  const problems = modelsPage.assertPageHonesty(html + jsonLd, { kind: 'models-index', registry: modelsTable, ctx: indexCtx });
  check('真实数据上索引页断言零问题（断言不是恒红）', problems.length === 0, problems.slice(0, 3).join('；'));
  const markers = [...html.matchAll(/data-item="([^"]*)"/g)].map(match => match[1]);
  check(`索引页 ${markers.length} 行 == 过门槛的模型数（${gated.length}）`, markers.length === gated.length);
  check('预渲染 HTML 里零控件（筛选整块由脚本建，无 JS 时是完整静态表）',
    !/<input|<select|<button/.test(modelsPage.markupOnly(html)));
  check('内联筛选脚本与 lib/models-page.js 逐字节同源', html.includes(modelsPage.MODELS_INDEX_FILTER_SCRIPT));
  check('每行都带五个筛选维度（开发者 / 模型族 / 状态 / 平台数 / 搜索串）',
    ['data-developer=', 'data-family=', 'data-status=', 'data-platforms=', 'data-search=']
      .every(attr => (html.match(new RegExp(attr.replace('=', '="'), 'g')) || []).length === markers.length));
  check('搜索串覆盖模型名 / 开发者 / 别名',
    models.some(model => {
      const row = modelsPage.modelsIndexRowOf(model, indexCtx);
      return row.name && row.search.includes(modelRegistry.normalizeText(row.name));
    })
    && models.some(model => {
      const row = modelsPage.modelsIndexRowOf(model, indexCtx);
      return row.aliases.some(alias => row.search.includes(modelRegistry.normalizeText(alias)));
    }));
}

/* ================================================================== */
section('③ 详情页：六项信息 / 计价表 / 套餐 / 优惠 / History');
/* ================================================================== */

const ranked = gated.map(gate => models.find(model => model.slug === gate.slug))
  .map(model => ({ model, refs: modelsPage.modelReferencesOf(model, ctx) }))
  .sort((a, b) => b.refs.apiItems.length - a.refs.apiItems.length);

{
  const multi = ranked[0];
  const { html, jsonLd, ctx: detailCtx } = detailPageOf(multi.model);
  const problems = modelsPage.assertPageHonesty(html + jsonLd, { kind: 'model', model: multi.model, ctx: detailCtx });
  check(`多平台模型（${multi.model.slug}：${multi.refs.apiItems.length} 条计价）详情页断言零问题`,
    problems.length === 0, problems.slice(0, 3).join('；'));
  check('同一模型在多个平台的计价条目**全部列出**',
    (html.match(/class="mapirow"/g) || []).length === multi.refs.apiItems.length);
  check('计价表列齐（Provider / 计费通道 / Variant / Input / Output / Cache / Unit / Last Seen）',
    ['Provider', '计费通道', 'Variant', 'Input', 'Output', 'Cache', 'Unit', 'Last Seen']
      .every(column => html.includes(`>${column}</th>`)));
  const rows = multi.refs.apiItems.map(item => modelsPage.apiPricingRowOf(item, detailCtx));
  check('每一行的价格文本逐格与数据一致（含「免费」与「—」两种缺值口径）',
    rows.every(row => html.includes(row.inputText) && html.includes(row.outputText)
      && html.includes(row.cacheText) && html.includes(row.unitText)));
  check('基本信息六项齐全（模型名称 / 开发者 / 别名 / 官方链接 / 状态 / 记录 id）',
    ['模型名称', '开发者', '别名', '官方链接', '状态', '记录 id'].every(label => html.includes(label)));
  check('详情页刻意没有 ItemList（详情叶子，不是集合页）', !/ItemList/.test(html + jsonLd));
}

{
  const withCoding = ranked.find(item => item.refs.codingPlans.length);
  if (withCoding) {
    const { html } = detailPageOf(withCoding.model);
    check(`相关 Coding 套餐只来自显式映射（${withCoding.model.slug}：${withCoding.refs.codingPlans.length} 条，链接落到套餐页的真实行）`,
      withCoding.refs.codingPlans.every(item => html.includes(`plans/coding/#plan-${item.plan.id}`)));
  } else check('相关 Coding 套餐：本轮没有样本（如实跳过，不编关系）', true);
}

{
  const withDeals = ranked.find(item => item.refs.deals.length);
  if (withDeals) {
    const { html } = detailPageOf(withDeals.model);
    check(`相关优惠只来自 deal-plan-links 的显式两跳关系（${withDeals.model.slug}：${withDeals.refs.deals.length} 条）`,
      withDeals.refs.deals.every(item => html.includes(`deal/${item.deal.id}/`)));
    check('相关优惠带状态（当前有效 / 已结束），不把已结束的写成当前',
      /class="mstatus">当前有效|class="mstatus">已结束/.test(html));
  } else check('相关优惠：本轮没有样本（如实跳过，不编关系）', true);
}

{
  const withEvents = ranked.find(item => item.refs.events.length);
  if (withEvents) {
    const { html } = detailPageOf(withEvents.model);
    check(`模型 History 是派生视图（${withEvents.model.slug}：${withEvents.refs.events.length} 条事件，逐条落在页面上）`,
      withEvents.refs.events.every(event => html.includes(`<time datetime="${event.at}">`)));
  } else check('模型 History：本轮没有样本（如实跳过）', true);
}

/* ================================================================== */
section('④ 牙 #1 / #2 / #4：同名不合并、别名唯一、改名不自动 merge');
/* ================================================================== */

{
  const twoSameName = {
    'alpha-1': { canonicalName: '演练同名模型', developer: '开发商甲', owner: null, family: '演练', aliases: [], officialUrl: 'https://a.example/', status: 'active', note: null },
    'alpha-2': { canonicalName: '演练同名模型', developer: '开发商乙', owner: null, family: '演练', aliases: [], officialUrl: 'https://b.example/', status: 'active', note: null }
  };
  const problems = modelRegistry.validateRegistry(twoSameName, { developers: ['开发商甲', '开发商乙'], extraDevelopers: [] });
  check('【牙 #1】两个同名模型来自不同开发者 → registry 判红（同名不等于同一模型）',
    problems.some(problem => problem.includes('canonicalName')), problems.slice(0, 1).join(''));

  const syntheticLinks = { schemaVersion: 1, links: [
    { registrySlug: 'alpha-1', apiPlanId: apiPlans[0].id, modelKey: apiPlans[0].models[0].modelKey, variant: null, basis: 'explicit-mapping', evidence: [], note: '演练' },
    { registrySlug: 'alpha-2', apiPlanId: apiPlans[0].id, modelKey: apiPlans[0].models[0].modelKey, variant: null, basis: 'explicit-mapping', evidence: [], note: '演练' }
  ] };
  const { html, ctx: indexCtx } = indexPageOf(twoSameName, { links: syntheticLinks });
  const rows = [...html.matchAll(/data-item="([^"]*)"/g)].map(match => match[1]);
  check('【牙 #1】页面侧：同名不同开发者的两条**各自一行**（没有被合并成一行）',
    rows.includes('alpha-1') && rows.includes('alpha-2') && rows.length === 2);
  const merged = html.replace(/<tr data-item="alpha-2"[\s\S]*?<\/tr>/, '');
  check('【牙 #1】把两条合并成一条（少一行）→ 行数对账变红',
    merged !== html
    && modelsPage.assertPageHonesty(merged, { kind: 'models-index', registry: twoSameName, ctx: indexCtx }).length > 0);
}

{
  const table = {
    'beta': { canonicalName: 'Beta', developer: '开发商甲', owner: null, family: 'B', aliases: ['gamma'], officialUrl: 'https://a.example/', status: 'active', note: null },
    'gamma': { canonicalName: 'Gamma', developer: '开发商乙', owner: null, family: 'G', aliases: [], officialUrl: 'https://b.example/', status: 'active', note: null }
  };
  const problems = modelRegistry.validateRegistry(table, { developers: ['开发商甲', '开发商乙'], extraDevelopers: [] });
  check('【牙 #2】alias 与另一个模型的 slug 撞车 → registry 判红',
    problems.some(problem => problem.includes('alias')), problems.slice(0, 1).join(''));

  const shared = {
    'delta': { canonicalName: 'Delta', developer: '开发商甲', owner: null, family: 'D', aliases: ['共享别名'], officialUrl: 'https://a.example/', status: 'active', note: null },
    'epsilon': { canonicalName: 'Epsilon', developer: '开发商甲', owner: null, family: 'E', aliases: ['共享别名'], officialUrl: 'https://b.example/', status: 'active', note: null }
  };
  const sharedProblems = modelRegistry.validateRegistry(shared, { developers: ['开发商甲'], extraDevelopers: [] });
  check('【牙 #2】同一个 alias 指向两个 registry model → registry 判红',
    sharedProblems.some(problem => problem.includes('已被')), sharedProblems.slice(0, 1).join(''));

  // 页面侧：别名**不是**页面身份 —— 关系层写别名时解析不到任何一页
  const byAliasLink = { schemaVersion: 1, links: [
    { registrySlug: 'gamma', apiPlanId: apiPlans[0].id, modelKey: apiPlans[0].models[0].modelKey, variant: null, basis: 'explicit-mapping', evidence: [], note: '演练' }
  ] };
  const aliasCtx = { ...ctx, links: byAliasLink };
  const aliasModels = modelsPage.modelsOf(table);
  const beta = aliasModels.find(model => model.slug === 'beta');
  const gamma = aliasModels.find(model => model.slug === 'gamma');
  check('【牙 #2】页面侧：引用按规范 slug 精确匹配，别名不会把引用挂到别家模型上',
    modelsPage.modelReferencesOf(beta, aliasCtx).apiItems.length === 0
    && modelsPage.modelReferencesOf(gamma, aliasCtx).apiItems.length === 1);
}

{
  const renamed = {
    'rename-old': { canonicalName: '演练旧名模型', developer: '开发商甲', owner: null, family: 'R', aliases: [], officialUrl: 'https://a.example/', status: 'active', note: null },
    'rename-new': { canonicalName: '演练新名模型', developer: '开发商甲', owner: null, family: 'R', aliases: [], officialUrl: 'https://a.example/', status: 'active', note: null }
  };
  const links = { schemaVersion: 1, links: [
    { registrySlug: 'rename-old', apiPlanId: apiPlans[0].id, modelKey: apiPlans[0].models[0].modelKey, variant: null, basis: 'explicit-mapping', evidence: [], note: '旧名' },
    { registrySlug: 'rename-new', apiPlanId: apiPlans[0].id, modelKey: apiPlans[0].models[0].modelKey, variant: null, basis: 'explicit-mapping', evidence: [], note: '新名' }
  ] };
  const renameCtx = { ...ctx, links };
  const renameModels = modelsPage.modelsOf(renamed);
  const oldName = renameModels.find(model => model.slug === 'rename-old');
  const newName = renameModels.find(model => model.slug === 'rename-new');
  check('【牙 #4】改名产生的两个 slug 各自独立（没有因为名字相近被自动 merge）',
    modelsPage.modelReferencesOf(oldName, renameCtx).apiItems.length === 1
    && modelsPage.modelReferencesOf(newName, renameCtx).apiItems.length === 1
    && modelsPage.modelIdOf(oldName) !== modelsPage.modelIdOf(newName));
  check('【牙 #4】registry 校验拒绝手写的派生 id（身份只能算出来）',
    modelRegistry.validateRegistry({
      'rename-old': { canonicalName: 'X', developer: null, owner: null, family: 'X', aliases: [], officialUrl: null, status: 'active', note: null, id: 'deadbeef0000' }
    }, { developers: [], extraDevelopers: [] }).some(problem => problem.includes('派生字段')));
}

/* ================================================================== */
section('⑤ 牙 #3 / #5：映射指向不存在的记录、页面展示不存在的 Provider');
/* ================================================================== */

{
  const badLinks = { schemaVersion: 1, links: [
    { registrySlug: models[0].slug, apiPlanId: 'deadbeef0000', modelKey: 'phantom-model', variant: null, basis: 'explicit-mapping', evidence: [], note: '演练' }
  ] };
  check('【牙 #3】映射指向不存在的 api plan / modelKey → registry 判红',
    modelRegistry.validateLinks(badLinks, { table: modelsTable, apiPlans, plans })
      .some(problem => problem.includes('不存在')));

  const badCtx = { ...ctx, links: badLinks };
  const refs = modelsPage.modelReferencesOf(models[0], badCtx);
  const { html } = detailPageOf(models[0], { links: badLinks });
  check('【牙 #3】页面**不凭空补一行价格**（坏映射只记进 missing）',
    refs.apiItems.length === 0 && refs.missing.length === 1 && !/class="mapirow"/.test(html));
  check('【牙 #3】坏映射让页面断言变红（数据层问题不许在页面层被静默吞掉）',
    modelsPage.assertPageHonesty(html, { kind: 'model', model: models[0], ctx: badCtx })
      .some(problem => problem.includes('不存在')));
}

{
  const detailModel = ranked[0].model;
  const refs = ranked[0].refs;
  const { html, ctx: detailCtx } = detailPageOf(detailModel);
  const row = refs.apiItems[0];

  const ghostRow = `<tr class="mapirow" data-item="${row.plan.id}" data-plan="${row.plan.id}"`
    + ` data-model-key="${row.entry.modelKey}" data-provider="ghost-provider">`
    + `<th scope="row">Ghost</th><td>x</td><td>y</td><td class="num">1</td><td class="num">1</td>`
    + `<td class="num">1</td><td class="punit">USD / 每 100 万 tokens</td><td>2026-10-01</td><td>—</td></tr>`;
  const polluted = html.replace('</tbody>', `${ghostRow}</tbody>`);
  check('【牙 #5】同一记录被渲染成另一个 Provider → 红',
    modelsPage.assertPageHonesty(polluted, { kind: 'model', model: detailModel, ctx: detailCtx })
      .some(problem => problem.includes('Provider') || problem.includes('行')));

  const phantomRow = ghostRow.replace(new RegExp(row.plan.id, 'g'), 'deadbeef0000')
    .replace(`data-model-key="${row.entry.modelKey}"`, 'data-model-key="phantom-model"')
    .replace('data-provider="ghost-provider"', 'data-provider="phantom"');
  const polluted2 = html.replace('</tbody>', `${phantomRow}</tbody>`);
  check('【牙 #5】凭空出现的记录（不在显式引用里）→ 红',
    modelsPage.assertPageHonesty(polluted2, { kind: 'model', model: detailModel, ctx: detailCtx })
      .some(problem => problem.includes('凭空')));

  const withoutRow = html.replace(/<tr class="mapirow"[\s\S]*?<\/tr>/, '');
  check('【牙 #5】少渲染一行（同一模型在多个平台没列全）→ 红',
    modelsPage.assertPageHonesty(withoutRow, { kind: 'model', model: detailModel, ctx: detailCtx })
      .some(problem => problem.includes('行')));
}

/* ================================================================== */
section('⑥ 牙 #18 / #19：canonical 唯一、空模型页不进 sitemap');
/* ================================================================== */

{
  const good = modelsPage.assertCanonicalUnique([
    { route: 'models/a/', canonical: `${SITE_URL}models/a/` },
    { route: 'models/b/', canonical: `${SITE_URL}models/b/` }
  ]);
  check('canonical 各不相同 → 零问题（断言不是恒红）', good.length === 0, good.join('；'));
  const bad = modelsPage.assertCanonicalUnique([
    { route: 'models/a/', canonical: `${SITE_URL}models/a/` },
    { route: 'models/b/', canonical: `${SITE_URL}models/a/` }
  ]);
  check('【牙 #18】两个模型页共用 canonical → 红', bad.length > 0, bad.join('；'));
}

{
  const routes = gates.filter(gate => gate.shouldGenerate).map(gate => gate.route);
  check('sitemap 正好等于过门槛的模型页 → 零问题',
    modelsPage.assertSitemapEligibility({ sitemapRoutes: ['', ...routes], gateResults: gates }).length === 0);

  const unmapped = { slug: 'ghost-unmapped', canonicalName: '演练用未映射模型', developer: null, owner: null, family: '演练', aliases: [], officialUrl: null, status: 'unknown', note: null };
  const ghostGate = modelsPage.modelPageGate(unmapped, ctx);
  check('未映射模型：门槛不通过（没有任何显式引用）', ghostGate.shouldGenerate === false && ghostGate.references === 0);
  check('【牙 #19】未过门槛的模型页进了 sitemap → 红',
    modelsPage.assertSitemapEligibility({ sitemapRoutes: [...routes, ghostGate.route], gateResults: gates.concat(ghostGate) })
      .some(problem => problem.includes('未过生成门槛')));
  check('【牙 #19】过门槛的模型页没进 sitemap → 红',
    modelsPage.assertSitemapEligibility({ sitemapRoutes: routes.slice(1), gateResults: gates })
      .some(problem => problem.includes('没有进 sitemap')));
}

/* ================================================================== */
section('⑦ 反猜测与声明表');
/* ================================================================== */

{
  const source = fs.readFileSync(path.join(ROOT, 'scripts', 'lib', 'models-page.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  check('models-page.js 不做相似度 / 编辑距离 / LLM 映射',
    !/levenshtein|similarity|jaro|fetch\(|axios/i.test(source));
  check('模型页的引用只来自显式映射（空映射 → 空引用）',
    modelsPage.modelReferencesOf(models[0], { ...ctx, links: [] }).apiItems.length === 0
    && modelsPage.modelReferencesOf(models[0], { ...ctx, links: [] }).deals.length === 0);
  check('page-kinds 声明齐了模型索引与详情页',
    pageKinds.kindOfRoute('models/') === 'models-index'
    && pageKinds.kindOfRoute('models/glm-5.3/') === 'model'
    && pageKinds.itemListRule('models-index').checkMembers === false
    && pageKinds.itemListRule('model').expect === false);
}

/* ================================================================== */
section('⑧ 真实产物：/models/ 在站上真的成立（构建后才有；构建前跳过）');
/* ================================================================== */

/**
 * 对 `dist/` 现场的检查。`overrides` 让每一条牙都能在**不改动真实产物**的前提下污染副本。
 *   `indexHtml` / `sitemapText` / `publishedModels` / `detailHtml`（slug → html）/ `extraDirs`
 */
function distProblems(overrides = {}) {
  const problems = [];
  const indexFile = path.join(DIST, 'models', 'index.html');
  if (!fs.existsSync(indexFile) && overrides.indexHtml === undefined) return ['缺少 models/index.html（先跑 npm run build）'];
  const indexHtml = overrides.indexHtml !== undefined ? overrides.indexHtml : fs.readFileSync(indexFile, 'utf8');
  const sitemapText = overrides.sitemapText !== undefined
    ? overrides.sitemapText : fs.readFileSync(path.join(DIST, 'sitemap.xml'), 'utf8');
  const modelsDoc = overrides.publishedModels !== undefined ? overrides.publishedModels
    : (fs.existsSync(path.join(DIST, 'models.json')) ? JSON.parse(fs.readFileSync(path.join(DIST, 'models.json'), 'utf8')) : null);
  if (!modelsDoc) problems.push('缺少 dist/models.json（发布数据集）');

  const markup = modelsPage.markupOnly(indexHtml);
  if (!sitemapText.includes(`<loc>${SITE_URL}models/</loc>`)) problems.push('sitemap 里没有 /models/');
  if (!indexHtml.includes(`<link rel="canonical" href="${SITE_URL}models/">`)) problems.push('索引页 canonical 不是自指');
  if ((markup.match(/<h1[\s>]/g) || []).length !== 1) problems.push('索引页 h1 数量不是 1');
  if (!indexHtml.includes(modelsPage.MODELS_INDEX_FILTER_SCRIPT)) problems.push('索引页缺少内联筛选脚本');

  if (modelsDoc) {
    for (const model of modelsDoc.models) {
      const route = modelsPage.modelHrefOf(model);
      const file = path.join(DIST, route, 'index.html');
      const html = overrides.detailHtml && overrides.detailHtml[model.slug] !== undefined
        ? overrides.detailHtml[model.slug] : (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null);
      if (html === null || html === undefined) { problems.push(`缺少详情页产物 ${route}`); continue; }
      if (!sitemapText.includes(`<loc>${SITE_URL}${route}</loc>`)) problems.push(`sitemap 漏了 ${route}`);
      const canonical = (html.match(/<link rel="canonical" href="([^"]*)"/) || [])[1] || '';
      if (canonical !== `${SITE_URL}${route}`) problems.push(`${route}: canonical=${canonical}`);
      if ((modelsPage.markupOnly(html).match(/<h1[\s>]/g) || []).length !== 1) problems.push(`${route}: h1 数量不是 1`);
    }
  }
  const detailDirs = overrides.extraDirs !== undefined ? overrides.extraDirs
    : (fs.existsSync(path.join(DIST, 'models'))
      ? fs.readdirSync(path.join(DIST, 'models'), { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name)
      : []);
  const slugs = new Set((modelsDoc ? modelsDoc.models : []).map(model => model.slug));
  for (const dir of detailDirs) {
    if (!slugs.has(dir)) problems.push(`/models/${dir}/ 不在发布数据集里（凭空生成的模型页）`);
  }
  // canonical 全局唯一（详情页之间）
  const canonicals = new Map();
  for (const slug of slugs) {
    const html = overrides.detailHtml && overrides.detailHtml[slug] !== undefined
      ? overrides.detailHtml[slug]
      : (fs.existsSync(path.join(DIST, 'models', slug, 'index.html')) ? fs.readFileSync(path.join(DIST, 'models', slug, 'index.html'), 'utf8') : '');
    const canonical = (html.match(/<link rel="canonical" href="([^"]*)"/) || [])[1] || '';
    if (canonicals.has(canonical)) problems.push(`${slug} 与 ${canonicals.get(canonical)} 共用 canonical`);
    else canonicals.set(canonical, slug);
  }
  return problems;
}

if (fs.existsSync(path.join(DIST, 'models', 'index.html'))) {
  const base = distProblems();
  check('dist 现场：索引 / 详情 / 发布数据集 / sitemap / canonical 全部对得上',
    base.length === 0, base.slice(0, 3).join('；'));

  const sitemapText = fs.readFileSync(path.join(DIST, 'sitemap.xml'), 'utf8');
  const noModels = sitemapText.replace(`<loc>${SITE_URL}models/</loc>`, '');
  check('【牙】sitemap 少了 /models/ → 产物检查变红',
    noModels !== sitemapText && distProblems({ sitemapText: noModels }).some(problem => problem.includes('sitemap')));

  const firstSlug = publishedModels.models[0].slug;
  const detailFile = path.join(DIST, 'models', firstSlug, 'index.html');
  const detailHtml = fs.readFileSync(detailFile, 'utf8');
  check('【牙】详情页 canonical 被改成另一个模型页 → 产物检查变红',
    distProblems({ detailHtml: { [firstSlug]: detailHtml.replace(`href="${SITE_URL}models/${firstSlug}/"`, `href="${SITE_URL}models/second-slug/"`) } })
      .some(problem => problem.includes('canonical')));

  check('【牙】凭空多出一个模型页目录 → 产物检查变红（发布数据集与磁盘逐一对账）',
    distProblems({ extraDirs: [firstSlug, 'ghost-not-in-registry'] })
      .some(problem => problem.includes('凭空生成的模型页')));

  check('【牙】详情页 h1 被删掉 → 产物检查变红',
    distProblems({ detailHtml: { [firstSlug]: detailHtml.replace(/<h1>[\s\S]*?<\/h1>/, '') } })
      .some(problem => problem.includes('h1')));

  const dealsArtifact = path.join(DIST, 'models.json');
  check('发布数据集 dist/models.json 与仓库里那份派生产物逐字节相同',
    fs.existsSync(dealsArtifact)
    && fs.readFileSync(dealsArtifact, 'utf8') === `${JSON.stringify(publishedModels, null, 2)}\n`);
} else {
  check('构建产物不存在时**跳过** dist 现场检查（先跑 npm run build）', true);
}

/* ================================================================== */

console.log(`\n=== v3.0 Model Registry 页面演练：${passed} 项通过，${failures.length} 项失败 ===`);
if (failures.length) {
  console.log('失败项：');
  failures.forEach(name => console.log(`  ✗ ${name}`));
  process.exit(1);
}
