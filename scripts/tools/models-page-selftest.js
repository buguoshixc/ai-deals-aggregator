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
 * v3.0 T25 追加第 ⑨ 节：**逐格数值对账**（关闭 T20 的 N2）。T20 的 M19 证明
 * 「把某条记录的数值与相邻格对调」时行身份、行数、单位文案全都对得上，自带的门禁全绿
 * —— 缺的那一层是「每一格是否等于数据里那一条」。⑨ 用**独立第二实现**补上它：
 * 期望值自己从 `api-plans.json` 与关系层原文展开，实际值从渲染产物逐格读，
 * **不调用 models-page.js 的任何计算函数**（只读它渲染出来的 HTML）。
 *
 * registry / 映射 / 计价条目全部来自**仓库里的真实文件**（不是硬编码样例）：
 * `scripts/data/models.json`（`{slug: entry}`）+ `scripts/data/model-registry-links.json`
 * + `api-plans.json` + `plans.json` + `deal-plan-links.json` + `api-plan-history.json`。
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const modelsPage = require('../lib/models-page');
const modelRegistry = require('../lib/model-registry');
// 判据层（目录状态的唯一出处）：自测只读它的词表/默认集合与 `MODEL_CATALOG_STATUS` 枚举，
// 用来做**漂移对照** —— 页面自己再写一份词表就等于两个真相。
const modelFreshness = require('../lib/model-freshness');
const apiPlansPage = require('../lib/api-plans-page');
const apiSchema = require('../lib/api-plan-schema');
const plansPageLib = require('../lib/plans-page');
const providers = require('../lib/providers');
const pageKinds = require('../lib/page-kinds');
// §17 独立 join 对账：**它自己遍历 api-plans + links 原文**，不 require 被测判据。
// 让它的结果参与断言，页面自证就失效了（P1-12 正是"实现与期望同源"漏掉的）。
const joinAudit = require('./registry-join-audit');

const ROOT = path.join(__dirname, '..', '..');
const SITE_URL = 'https://buguoshixc.github.io/ai-deals-aggregator/';

/**
 * 产物目录与 fail-closed 前置（§10.9 · P2-10 / P2-26）。
 *
 * §17 独立 join 对账与第 ⑧ 节都要**从构建产物回读**页面。原先的写法是
 * 「候选目录里第一个存在 `models/` 的；都没有 ⇒ 跳过并计 ✓」—— 而门禁在构建**之前**跑，
 * 于是这两节在 CI 里永远绿（同一 commit 项数还会随环境在 27/32 之间变）。
 *
 * 六个产物依赖工具现在用同一套协议：
 *   · `--dir=<path>`            显式指定产物目录（默认 `<repo>/dist`；`QC_DIST` 仍被尊重，便于并行会话）；
 *   · 缺少必需产物 ⇒ **非 0**，并给出「先 build / 用 --dir 指到别的产物」的下一步；
 *   · 只有显式 `--allow-missing-dist` 才允许跳过，且会被标成 `⚠️ OPTIONAL DIAGNOSTIC`。
 *
 * 刻意**删掉**了原先写死的 `dist.qc-registry` 候选：那让默认跑法偷偷去读另一个任务的产物目录
 * （本地绿、CI 红），与「本地与 CI 行为一致」直接冲突。要验别的产物就显式 `--dir=`。
 */
const dirArg = process.argv.find(arg => arg.startsWith('--dir='));
const ALLOW_MISSING_DIST = process.argv.includes('--allow-missing-dist');
const DIST = path.resolve(ROOT, dirArg ? dirArg.slice('--dir='.length)
  : (process.env.QC_DIST || path.join(ROOT, 'dist')));

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

/**
 * t13：**索引页行序的判据**。返回问题列表（空 = 通过）。**只有这一处实现**，换位牙也调它。
 *
 * 口径是「集合 **与次序** 逐字相等」——`JSON.stringify(rendered) === JSON.stringify(expected)`
 * 比较整个数组，不是集合比较，也不先 sort。为什么必须是这个口径：只比"每一行的 slug 在集合里"
 * 抓不住**换位**（两行对调后集合完全一样），而换位意味着读者看到的目录顺序与发布数据集不一致。
 *
 * `expected` 必须是**发布数据集**的顺序（`publishedModels.models.map(m => m.slug)`），不是源层
 * `scripts/data/models.json` 的顶层键序 —— 后者是人工维护顺序（新身份追加在末尾），两者只在
 * "源层恰好也是排序的"这一巧合下相等。t13 的四条失败里第一条就是它。
 */
function indexOrderProblems(renderedSlugs, expectedSlugs, bySlug) {
  const problems = [];
  const missing = expectedSlugs.filter(slug => !renderedSlugs.includes(slug));
  const extra = renderedSlugs.filter(slug => !(bySlug && bySlug.has(slug)));
  if (missing.length) problems.push(`缺 ${missing.slice(0, 3).join('/')}${missing.length > 3 ? ' …' : ''}`);
  if (extra.length) problems.push(`多 ${extra.slice(0, 3).join('/')}${extra.length > 3 ? ' …' : ''}`);
  if (JSON.stringify(renderedSlugs) !== JSON.stringify(expectedSlugs)) {
    const at = renderedSlugs.findIndex((slug, index) => slug !== expectedSlugs[index]);
    problems.push(at < 0
      ? `行数不同（页面 ${renderedSlugs.length} / 期望 ${expectedSlugs.length}）`
      : `次序不是逐字相等（首个不同在第 ${at + 1} 位：页面 ${JSON.stringify(renderedSlugs[at])} vs 期望 ${JSON.stringify(expectedSlugs[at])}）`);
  }
  return problems;
}

/**
 * t13：**从关系层现读现算**"多变体"口径。返回 `{ groups, slugs }`：**只有这一处实现**。
 *
 *   · `groups` = api-plans 里"同一个 `(apiPlanId, modelKey)` 有 >1 条计价条目"的组数
 *     （与 `registry-join-audit.js` 的 `multiVariantGroups` 同一语义：按**条目数**数，不按去重变体数）；
 *   · `slugs`  = 关系层里"认领了某个多变体组的 ≥2 条真实 identity"的 registry 模型集合。
 *
 * 为什么要有它：页面侧（§17 独立 join 从**产物 HTML** 重算）与数据侧（从**关系层 + api-plans** 重算）
 * 必须给出同一批 slug —— 这条对账两侧的实现路径完全不同，唯一共同点是它们都在读真实的盘上文件。
 * 旧断言把 `12 组 / 9 个 slug` 写进判据（数据快照），本轮数据长到 13/10 就假红。
 */
function multiVariantFromLinks() {
  const links = modelRegistry.linksList(modelRegistry.loadLinks().doc);   // **现读**关系层文件
  const planById = new Map(apiPlans.filter(plan => plan && plan.id).map(plan => [plan.id, plan]));
  const multiVariantKeys = new Set();
  for (const plan of apiPlans) {
    const countByKey = new Map();
    for (const entry of (plan.models || [])) {
      if (!entry) continue;
      countByKey.set(entry.modelKey, (countByKey.get(entry.modelKey) || 0) + 1);
    }
    for (const [modelKey, count] of countByKey) {
      if (count > 1) multiVariantKeys.add(`${plan.id}\u0000${modelKey}`);
    }
  }
  const slugs = new Set();
  for (const link of links) {
    if (!link || !link.registrySlug || link.apiPlanId === undefined) continue;
    if (!planById.has(link.apiPlanId)) continue;
    const perGroup = new Map();
    for (const identity of modelRegistry.sourcePricingIdentitiesOf(link, apiPlans).identities) {
      const key = `${identity.apiPlanId}\u0000${identity.modelKey}`;
      if (!multiVariantKeys.has(key)) continue;
      perGroup.set(key, (perGroup.get(key) || 0) + 1);
    }
    if ([...perGroup.values()].some(count => count > 1)) slugs.add(link.registrySlug);
  }
  return { groups: multiVariantKeys.size, slugs };
}

/** t13：§17 四项计数必须**各自**为 0（不许只报一个合计）。返回非 0 的项。**只有这一处实现**。 */
function joinCountProblems(counts) {
  return ['missing', 'extra', 'duplicate', 'multiOwner']
    .filter(key => (counts || {})[key] !== 0)
    .map(key => `${key}=${(counts || {})[key]}`);
}

/** t13：两个 slug 集合是否**逐条**相等（排序后整数组比较，不是比个数）。**只有这一处实现**。 */
function slugSetsEqual(left, right) {
  const normalize = list => [...new Set(list || [])].sort();
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
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

/**
 * 目录状态派生（`catalogStatus` / `catalogReason`）—— 与 `build-local.js` / `rebuild-models.js`
 * 走**同一支**判据（`model-freshness.deriveCatalog`）。这里不另写一份判据，
 * 只把来源层字段映射成判据层的入参（少传一次 catalog，产物里每条都会落成 unknown）。
 */
function derivedCatalogOf(table) {
  return modelFreshness.deriveCatalog({
    models: Object.keys(table || {}).sort().map(slug => {
      const entry = table[slug] || {};
      return {
        slug,
        developer: entry.developer === undefined ? null : entry.developer,
        family: entry.family === undefined ? null : entry.family,
        modelRole: entry.modelRole === undefined ? null : entry.modelRole,
        releasedAt: entry.releasedAt === undefined ? null : entry.releasedAt,
        status: entry.status === undefined ? null : entry.status,
        freshnessGroup: entry.freshnessGroup === undefined ? null : entry.freshnessGroup
      };
    })
  });
}

const publishedModels = modelRegistry.publishedModels({
  table: modelsTable, links: linksDoc, apiPlans, plans, catalog: derivedCatalogOf(modelsTable)
});
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

/** 引用（每次用干净缓存，避免跨断言串味） */
function detectorRefs(model) {
  return modelsPage.modelReferencesOf(model, { ...ctx, prefix: '../../', __refCache: new Map() });
}

/* ================================================================== */
section('① 真实 registry：身份 / 映射 / 门槛');
/* ================================================================== */

check(`registry 载入 ${models.length} 个模型（slug 为键的人工来源层）`,
  models.length === Object.keys(modelsTable).length && models.length > 0);
check('registry 与关系层都通过同一支判据校验',
  modelRegistry.validateRegistry(modelsTable, { developers: modelDevelopers, extraDevelopers }).length === 0
  && modelRegistry.validateLinks(linksDoc, { table: modelsTable, apiPlans, plans, gaps: modelRegistry.loadGaps().doc }).length === 0
  && modelRegistry.validateGaps(modelRegistry.loadGaps().doc, { plans, links: linksDoc, table: modelsTable, apiPlans }).length === 0
  && modelRegistry.validatePlanModelCoverage({
    table: modelsTable, links: linksDoc, gaps: modelRegistry.loadGaps().doc, apiPlans, plans
  }).length === 0);
check(`全部 ${models.length} 个模型都被显式引用（门槛内 ${gated.length} 个）`,
  gated.length === models.length && gates.every(gate => gate.references > 0));
{
  const gapsDoc = modelRegistry.loadGaps().doc;
  const coverage = modelRegistry.coverageOf({ table: modelsTable, links: linksDoc, gaps: gapsDoc, apiPlans, plans });
  check(`覆盖：未映射 API modelKey ${coverage.unmappedModelKeys.length} 条 · 套餐模型串未判 ${coverage.unmappedPlanModels.length} 条（已声明不对应单一模型身份 ${coverage.declaredPlanModels.length} 条）`,
    coverage.unmappedModelKeys.length === 0
    && coverage.unmappedPlanModels.length === 0
    && coverage.apiLinks + coverage.codingLinks === publishedLinks.count
    && coverage.linkedModels === coverage.models);
}
check('派生产物两次构建逐字节相同（不读墙上时钟）',
  JSON.stringify(modelRegistry.publishedModels({
    table: modelsTable, links: linksDoc, apiPlans, plans, catalog: derivedCatalogOf(modelsTable)
  })) === JSON.stringify(publishedModels));

/* ================================================================== */
section('② 索引页：行 / ItemList / 筛选 / 静态可读（真实数据）');
/* ================================================================== */

{
  // 索引页渲染走**发布数据集**（`publishedModels`，带派生的 catalogStatus / catalogReason）——
  // 与 `build-local.js` 的调用点同源；来源层 `modelsTable` 里根本没有目录状态这个字段。
  const { html, jsonLd, ctx: indexCtx } = indexPageOf(publishedModels);
  const problems = modelsPage.assertPageHonesty(html + jsonLd, { kind: 'models-index', registry: publishedModels, ctx: indexCtx });
  check('真实数据上索引页断言零问题（断言不是恒红）', problems.length === 0, problems.slice(0, 3).join('；'));
  const markers = [...html.matchAll(/data-item="([^"]*)"/g)].map(match => match[1]);
  const tableSlugs = [...html.matchAll(/<tr data-model="([^"]*)"/g)].map(match => match[1]);
  check(`索引页 ${markers.length} 个 data-item == 过门槛的模型数（${gated.length}）`, markers.length === gated.length);
  check(`索引页静态表 ${tableSlugs.length} 行 == registry 全部模型数（${models.length}）—— 默认隐藏不许删行`,
    tableSlugs.length === models.length && new Set(tableSlugs).size === models.length);
  // 牙（T14-F2，独立审查抓到）：上面两条只做**计数**对账 —— 把索引里 13 处 `glm-5.3` 全改成
  // `glm-5.3x`（含 2 个详情链接）时，112 项断言**全过**，也就是说页面可以指着另一个身份而没人发现。
  // 计数对账与身份对账是两件事，这里补上后者：
  //   ① 每一行的 slug 必须能在发布数据集里找到（不许出现数据集里没有的行）；
  //   ② 行内的**详情链接**必须逐字指向该行那个身份的路由（链接指错 = 点进去是另一个人）；
  //   ③ 反向：数据集里每个模型都必须有自己那一行（不许少行）。
  {
    const bySlug = new Map(models.map(model => [model.slug, model]));
    const unknownRows = tableSlugs.filter(slug => !bySlug.has(slug));
    check('索引页每一行的 data-model 都指向发布数据集里真实存在的身份（计数对账之外的**身份**对账）',
      unknownRows.length === 0, unknownRows.slice(0, 3).join(' / '));

    // 集合 + 次序逐字相等：这是唯一能抓住「把某一行改名成另一个值」的判据
    // （只比链接与行内 slug 是否互相一致是抓不住的 —— 两处一起改就自洽了）。
    //
    // t13（本条失败的根因）：期望序必须取**发布数据集**的 slug 序列 —— 上面第 222 行的注释本来就是
    // 这么写的（"索引页渲染走**发布数据集**"），但代码用的是 `models.map(model => model.slug)`，
    // 那是源层 `modelsOf(modelsTable)` 的**人工维护键序**（`scripts/data/models.json` 的顶层键序，
    // 新身份追加在末尾）。两者在 HEAD 恰好一致（源层当时也是排序的），t8 追加 7 个新身份后才分叉 ——
    // 这是"断言用了另一个口径"，**不是页面渲染次序错了**（页面渲染的正是发布数据集，次序正确）。
    // 判据强度不变：仍是 JSON.stringify 整数组比较（换位必红），**没有**降级成集合比较。
    const expectedSlugs = publishedModels.models.map(model => model.slug);
    const indexOrderIssues = indexOrderProblems(tableSlugs, expectedSlugs, bySlug);
    check('索引页的行**集合与次序**逐字等于发布数据集的 slug 序列（改名 / 换位 / 多行少行都变红）',
      indexOrderIssues.length === 0, indexOrderIssues.join('；'));

    // t13 换位牙：把渲染出来的两行**对调**，同一支判据必须红 —— 证明次序维度真的有牙，
    // 不是"集合比较"在冒充（集合比较对换位是绿的）。只在内存里改 HTML 片段，不碰产物。
    const swappedIndex = (() => {
      const rows = [...html.matchAll(/<tr data-model="[^"]*"[\s\S]*?<\/tr>/g)].map(match => match[0]);
      if (rows.length < 2 || rows[0] === rows[1]) return null;
      return html.split(rows[0]).join('\u0000__ROW0__\u0000').split(rows[1]).join(rows[0]).split('\u0000__ROW0__\u0000').join(rows[1]);
    })();
    const swappedSlugs = swappedIndex === null ? [] : [...swappedIndex.matchAll(/<tr data-model="([^"]*)"/g)].map(match => match[1]);
    const swappedIssues = swappedIndex === null ? [] : indexOrderProblems(swappedSlugs, expectedSlugs, bySlug);
    check('【换位牙·t13】把索引页两行对调 ⇒ 同一支判据必红（次序维度真的有牙，不是集合比较冒充的）',
      swappedIndex !== null && swappedSlugs.length === tableSlugs.length && swappedIssues.length > 0,
      swappedIndex === null ? '样本不足（索引页少于两行）' : `对调后：${swappedIssues.join('；')}`);
    check('【换位牙·t13·对照】同一份对调后的行序在"集合口径"下是绿的 —— 所以旧口径抓不住换位，新口径能',
      swappedIndex !== null
      && [...swappedSlugs].sort().join('|') === [...expectedSlugs].sort().join('|')
      && swappedIssues.length > 0,
      swappedIndex === null ? '样本不足' : `集合相等 ${swappedSlugs.length} 行 / 次序问题 ${swappedIssues.length} 条`);
    // 现场输出：通过时也把命中信息打出来（验收要的就是这份逐条现场读数）
    console.log(`    ℹ t13 换位牙现场输出：把两行对调 ⇒ ${swappedIssues.join('；') || '(没有报红)'}`
      + `（同一份输入在"集合口径"下是绿的：${[...swappedSlugs].sort().join('|') === [...expectedSlugs].sort().join('|')}）`);

    // 行内详情链接必须指向**这一行自己的**路由（链接指错 = 点进去是另一个人）
    const rowHtml = new Map();
    for (const match of html.matchAll(/<tr data-model="([^"]*)"[\s\S]*?<\/tr>/g)) rowHtml.set(match[1], match[0]);
    const mislinked = [];
    for (const slug of tableSlugs) {
      const row = rowHtml.get(slug);
      if (!row) { mislinked.push(`${slug}(缺行)`); continue; }
      const linkMatch = row.match(/<a href="([^"]*)"/);
      const wantsLink = gated.some(item => item.slug === slug);
      if (!wantsLink) continue;
      if (!linkMatch) { mislinked.push(`${slug}(没有链接)`); continue; }
      // 索引页自己在 `models/` 这一层，行内链接带前缀（`../models/<slug>/`）。
      const linked = decodeURIComponent(String(linkMatch[1]).replace(/^(\.\.\/)+/, '').replace(/\/$/, ''));
      if (linked !== `models/${slug}`) mislinked.push(`${slug}(链接指向 ${linkMatch[1]})`);
    }
    check('每一行的详情链接逐字指向该行自己的路由（链接指错 = 点进去是另一个身份）',
      mislinked.length === 0, mislinked.slice(0, 3).join(' / '));
  }
  check('预渲染 HTML 里一行都不带 hidden（默认隐藏只发生在运行时 ⇒ 无 JS 读到完整表）',
    !/<tr[^>]*\shidden[\s>]/.test(modelsPage.markupOnly(html)));
  check('预渲染 HTML 里零控件（筛选整块由脚本建，无 JS 时是完整静态表）',
    !/<input|<select|<button/.test(modelsPage.markupOnly(html)));
  check('内联筛选脚本与 lib/models-page.js 逐字节同源', html.includes(modelsPage.MODELS_INDEX_FILTER_SCRIPT));
  check('每行都带七个筛选维度（开发者 / 模型族 / 状态 / 目录状态 / 角色 / 平台数 / 搜索串）',
    ['data-developer=', 'data-family=', 'data-status=', 'data-catalog-status=', 'data-role=', 'data-platforms=', 'data-search=']
      .every(attr => (html.match(new RegExp(attr.replace('=', '="'), 'g')) || []).length === tableSlugs.length));
  check('搜索串覆盖模型名 / 开发者 / 别名',
    models.some(model => {
      const row = modelsPage.modelsIndexRowOf(model, indexCtx);
      return row.name && row.search.includes(modelRegistry.normalizeText(row.name));
    })
    && models.some(model => {
      const row = modelsPage.modelsIndexRowOf(model, indexCtx);
      return row.aliases.some(alias => row.search.includes(modelRegistry.normalizeText(alias)));
    }));
  // 目录状态 / 模型角色两列：中性词表与判据层同源，真实数据的每一行都能显示成中文标签
  {
    const params = modelsPage.modelsIndexFilterParamsOf(html);
    check('内联脚本的默认隐藏集合 == 判据层的 DEFAULT_HIDDEN_CATALOG_STATUSES（构建期参数真的进了页面）',
      Array.isArray(params)
      && [...params].sort().join(',') === [...modelsPage.DEFAULT_HIDDEN_CATALOG_STATUS].sort().join(','),
      JSON.stringify(params));
    check('默认隐藏集合 == [legacy, historical]，且默认可见 = current / aging / unknown',
      [...modelsPage.DEFAULT_HIDDEN_CATALOG_STATUS].sort().join(',') === 'historical,legacy'
      && modelsPage.CATALOG_STATUSES
        .filter(status => !modelsPage.DEFAULT_HIDDEN_CATALOG_STATUS.includes(status))
        .sort().join(',') === 'aging,current,unknown');
    check('页面提供了「显示旧型号」入口（入口 id 在脚本里）', html.includes(modelsPage.MODELS_SHOW_OLD_ID));
    check('目录状态词表与判据层（model-freshness）逐字同源（两处不一致 = 两个真相）',
      JSON.stringify(modelsPage.CATALOG_STATUS_LABEL) === JSON.stringify(modelFreshness.CATALOG_STATUS_LABEL),
      JSON.stringify(modelsPage.CATALOG_STATUS_LABEL));
    check('中性词表里没有「下线 / 淘汰 / 过时 / 推荐」这类结论性或淘汰性用词',
      Object.values(modelsPage.CATALOG_STATUS_LABEL)
        .every(label => !/下线|淘汰|过时|推荐|最强|最佳/.test(label)),
      JSON.stringify(modelsPage.CATALOG_STATUS_LABEL));
    const unmappedRoles = [...new Set(publishedModels.models.map(model => model.modelRole).filter(Boolean))]
      .filter(role => !modelsPage.MODEL_ROLE_LABEL[role]);
    check('真实数据里出现的每个 modelRole 都有中文标签（新角色一进来就会被点名）',
      unmappedRoles.length === 0, unmappedRoles.join(' / '));
    check('每一行的目录状态格与角色格都等于词表里那一格',
      publishedModels.models.every(model => {
        const row = modelsPage.modelsIndexRowOf(model, indexCtx);
        return html.includes(`data-catalog-status="${row.catalogStatus}"`)
          && html.includes(`<td data-cell="catalog-status">${row.catalogStatusLabel}</td>`)
          && html.includes(`<td data-cell="role">${row.modelRoleLabel}</td>`);
      }));
    check('「已下线」只出现在 status=retired 的行上（数状态格，不数 data-status 这个筛选值）',
      (modelsPage.markupOnly(html).match(/<td data-cell="status">已下线<\/td>/g) || []).length
        === publishedModels.models.filter(model => model.status === 'retired').length,
      `页面状态格 ${(modelsPage.markupOnly(html).match(/<td data-cell="status">已下线<\/td>/g) || []).length} 次`);
  }
}

/* ================================================================== */
section('②b 目录状态 / 模型角色：默认隐藏与「显示旧型号」（合成五档夹具 + 变异）');
/* ================================================================== */

{
  // 合成夹具：五个目录状态各一条 —— 真实数据本轮可能一条 legacy 都没有，
  // 所以这一层不能只靠真实数据（"分支能不能工作"必须自己钉住）。
  // 映射只给 `cur-1` 与 `legacy-1`：另外三条**留在静态表里**但没有详情页。
  const entry = (name, status, modelRole, catalogStatus) => ({
    canonicalName: name, developer: '开发商甲', owner: null, family: '演练', aliases: [],
    officialUrl: 'https://a.example/', status, modelRole, releasedAt: null, releaseEvidence: [],
    freshnessGroup: null, catalogStatus, note: null
  });
  const catalogTable = {
    'cur-1': entry('演练当前模型', 'active', 'llm', 'current'),
    'aging-1': entry('演练较早模型', 'active', 'vlm', 'aging'),
    'legacy-1': entry('演练旧型号', 'active', 'llm', 'legacy'),
    'hist-1': entry('演练历史型号', 'retired', 'llm', 'historical'),
    'unk-1': entry('演练未判模型', 'active', '翻译专用角色-未登记', 'unknown')
  };
  const firstApiPlan = apiPlans[0];
  const firstModelKey = firstApiPlan.models[0].modelKey;
  const catalogLinks = {
    schemaVersion: 1,
    links: [
      { registrySlug: 'cur-1', apiPlanId: firstApiPlan.id, modelKey: firstModelKey, variant: null, basis: 'explicit-mapping', evidence: [], note: '演练' },
      { registrySlug: 'legacy-1', apiPlanId: firstApiPlan.id, modelKey: firstModelKey, variant: null, basis: 'explicit-mapping', evidence: [], note: '演练' }
    ]
  };
  const { html, jsonLd, ctx: catalogCtx } = indexPageOf(catalogTable, { links: catalogLinks });
  const catalogProblems = modelsPage.assertPageHonesty(html + jsonLd, {
    kind: 'models-index', registry: catalogTable, ctx: catalogCtx
  });
  check('合成五档夹具：索引页断言零问题（判据不是恒红）', catalogProblems.length === 0, catalogProblems.slice(0, 3).join('；'));
  const staticRows = [...html.matchAll(/<tr data-model="([^"]*)"/g)].map(match => match[1]);
  const itemRows = [...html.matchAll(/data-item="([^"]*)"/g)].map(match => match[1]);
  check('合成夹具：静态表 5 行（含没有详情页的 3 条），data-item 只有 2 行（有详情页的那两条）',
    staticRows.length === 5 && itemRows.length === 2 && itemRows.includes('legacy-1'),
    `静态 ${staticRows.length} · data-item ${itemRows.length}`);
  check('合成夹具：legacy / historical 的目录状态格用了中性词（旧型号 / 历史型号），没有借用下线用词',
    html.includes('<td data-cell="catalog-status">旧型号</td>')
    && html.includes('<td data-cell="catalog-status">历史型号</td>')
    && !/data-cell="catalog-status"[^>]*>已下线/.test(html));
  check('合成夹具：retired 那条的状态格是「已下线」，其余四条都不是（数状态格，不数筛选属性）',
    (modelsPage.markupOnly(html).match(/<td data-cell="status">已下线<\/td>/g) || []).length === 1);
  check('合成夹具：未登记的角色原样显示（不编词），已登记的角色显示中文标签',
    html.includes('<td data-cell="role">翻译专用角色-未登记</td>')
    && html.includes('<td data-cell="role">通用文本模型</td>'));
  check('合成夹具：默认隐藏集合从页面参数读回来 == legacy+historical',
    JSON.stringify([...(modelsPage.modelsIndexFilterParamsOf(html) || [])].sort()) === JSON.stringify(['historical', 'legacy']));

  // ---- 变异（每一条都必须当场变红）----
  const honestyOf = h => modelsPage.assertPageHonesty(h + jsonLd, { kind: 'models-index', registry: catalogTable, ctx: catalogCtx });
  const allDisplayed = html.replace(/var DEFAULT_HIDDEN = \[[^\]]*\];/, 'var DEFAULT_HIDDEN = [];');
  check('【变异】把页面脚本的默认隐藏集合改成 []（默认全显）→ 断言变红',
    allDisplayed !== html && honestyOf(allDisplayed).some(problem => problem.includes('默认隐藏集合')));
  const preHidden = html.replace('<tr data-model="legacy-1"', '<tr hidden data-model="legacy-1"');
  check('【变异】给静态行预先加 hidden（无 JS 时少一行）→ 断言变红',
    preHidden !== html && honestyOf(preHidden).some(problem => problem.includes('hidden')));
  const droppedStatic = html.replace(/<tr data-model="unk-1"[\s\S]*?<\/tr>/, '');
  check('【变异】静态表删掉一行（无详情页的那条）→ 断言变红（静态表 ≠ 全部模型）',
    droppedStatic !== html && honestyOf(droppedStatic).some(problem => problem.includes('静态表') || problem.includes('没有渲染成静态行')));
  const wrongLabel = html.replace('<td data-cell="catalog-status">旧型号</td>', '<td data-cell="catalog-status">当前型号</td>');
  check('【变异】把某一行的目录状态格换成另一档的词 → 断言变红',
    wrongLabel !== html && honestyOf(wrongLabel).some(problem => problem.includes('目录状态显示为')));
  const retiredOnActive = html.replace('<td data-cell="status">在售 / 可用</td>', '<td data-cell="status">已下线</td>');
  check('【变异】把 status=active 的行写成「已下线」→ 断言变红',
    retiredOnActive !== html && honestyOf(retiredOnActive).some(problem => problem.includes('已下线')));
  const itemDropped = html.replace(' data-item="legacy-1"', '');
  check('【变异】隐掉过门槛旧型号的 data-item（详情路由随目录状态消失）→ 断言变红',
    itemDropped !== html && honestyOf(itemDropped).some(problem => problem.includes('data-item') || problem.includes('行 ≠')));
  const itemAdded = html.replace('<tr data-model="unk-1"', '<tr data-item="unk-1" data-model="unk-1"');
  check('【变异】给不过门槛的行硬加 data-item（凭空生成详情页入口）→ 断言变红',
    itemAdded !== html && honestyOf(itemAdded).some(problem => problem.includes('不该生成详情页')));
  // 参数化是真的：换一个参数就是另一串字节，而且空集合 = "默认不隐藏任何一档"
  const noHiddenScript = modelsPage.buildModelsIndexFilterScript({ defaultHiddenStatus: [] });
  check('buildModelsIndexFilterScript 的默认隐藏集合是**真参数**（显式 [] ⇒ 脚本里就是空表，默认全显）',
    noHiddenScript.includes('var DEFAULT_HIDDEN = [];')
    && noHiddenScript !== modelsPage.MODELS_INDEX_FILTER_SCRIPT
    && noHiddenScript.includes("'use strict';"));
  const onlyLegacyScript = modelsPage.buildModelsIndexFilterScript({ defaultHiddenStatus: ['legacy'] });
  check('只隐藏 legacy 的参数也生效（脚本里的集合逐字等于传入值）',
    onlyLegacyScript.includes('var DEFAULT_HIDDEN = ["legacy"];'));
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
  check('详情页新增三项：目录状态（中性词）/ 模型角色 / 发布时间',
    ['目录状态', '模型角色', '发布时间'].every(label => html.includes(label)));
  check('详情页刻意没有 ItemList（详情叶子，不是集合页）', !/ItemList/.test(html + jsonLd));
}

/* ------------------------------------------------------------------ */
/* ③a 发布时间（官方证据链接）与中性状态词（真实数据 + 合成夹具 + 变异）    */
/* ------------------------------------------------------------------ */

{
  // 真实数据里**有**发布日期证据的模型页：日期必须渲染成 <time>，每条证据都必须可点。
  const withEvidence = publishedModels.models.find(model =>
    model.releasedAt && (model.releaseEvidence || []).length && gated.some(gate => gate.slug === model.slug));
  if (withEvidence) {
    const { html, jsonLd, ctx: detailCtx } = detailPageOf(withEvidence);
    const block = modelsPage.releaseBlockOf(withEvidence);
    check(`发布时间（${withEvidence.slug}）：页面断言零问题`, modelsPage.assertPageHonesty(html + jsonLd, {
      kind: 'model', model: withEvidence, ctx: detailCtx
    }).length === 0);
    check(`发布时间（${withEvidence.slug}）：日期渲染成 <time datetime>，每条官方证据链接都在页面上`,
      html.includes(`<time datetime="${block.date}">`)
      && block.evidence.every(item => html.includes(`href="${item.sourceUrl}"`)));
    check(`发布时间（${withEvidence.slug}）：页面的 data-release-date / data-release-evidence 与 registry 对得上`,
      html.includes(`data-release-date="${block.date}"`)
      && html.includes(`data-release-evidence="${block.evidence.length}"`));
    const noEvidenceLink = html.replace(`<a href="${block.evidence[0].sourceUrl}" rel="noopener">`, '<span>');
    check('【变异】把发布时间的官方证据链接摘掉 → 断言变红（这句话必须有出处）',
      noEvidenceLink !== html && modelsPage.assertPageHonesty(noEvidenceLink, {
        kind: 'model', model: withEvidence, ctx: detailCtx
      }).some(problem => problem.includes('证据') || problem.includes('出处')));
    const fabricated = html.replace(`data-release-date="${block.date}"`, 'data-release-date="2019-01-01"');
    check('【变异】把页面上的发布时间改成另一个日期 → 断言变红（页面不许自己造日期）',
      fabricated !== html && modelsPage.assertPageHonesty(fabricated, { kind: 'model', model: withEvidence, ctx: detailCtx })
        .some(problem => problem.includes('发布时间')));
  } else {
    check('真实数据里暂时没有「有发布日期证据」的模型页样本（如实跳过，不造数据）', true);
  }

  // 合成夹具：有证据 / 没证据两种形态都钉住（真实数据可能一条都没有）
  const releasedModel = {
    slug: 'rel-1', canonicalName: '演练已发布模型', developer: '开发商甲', owner: null, family: '演练',
    aliases: [], officialUrl: 'https://a.example/', status: 'active', modelRole: 'llm',
    releasedAt: '2026-01-02',
    releaseEvidence: [{ sourceUrl: 'https://a.example/news', quote: '官方公告原文', capturedAt: '2026-02-01' }],
    freshnessGroup: null, catalogStatus: 'current', catalogReason: null, note: null
  };
  const undatedModel = {
    ...releasedModel, slug: 'undated-1', canonicalName: '演练无日期模型', releasedAt: null,
    releaseEvidence: [], catalogStatus: 'unknown'
  };
  const synthLinks = { schemaVersion: 1, links: ['rel-1', 'undated-1'].map(slug => ({
    registrySlug: slug, apiPlanId: apiPlans[0].id, modelKey: apiPlans[0].models[0].modelKey,
    variant: null, basis: 'explicit-mapping', evidence: [], note: '演练'
  })) };
  const { html: relHtml, ctx: relCtx } = detailPageOf(releasedModel, { links: synthLinks });
  check('合成夹具（有发布日期）：断言零问题，且页面上有官方证据链接与引文原文',
    modelsPage.assertPageHonesty(relHtml, { kind: 'model', model: releasedModel, ctx: relCtx }).length === 0
    && relHtml.includes('href="https://a.example/news"') && relHtml.includes('官方公告原文')
    && relHtml.includes('<time datetime="2026-01-02">2026-01-02</time>'));
  const { html: undatedHtml, ctx: undatedCtx } = detailPageOf(undatedModel, { links: synthLinks });
  check('合成夹具（没有发布日期）：如实写「未标注」，且不拿「首次收录」当发布时间',
    modelsPage.assertPageHonesty(undatedHtml, { kind: 'model', model: undatedModel, ctx: undatedCtx }).length === 0
    && undatedHtml.includes('data-release-date=""') && undatedHtml.includes('不是它的发布时间'));
  const inventedDate = undatedHtml.replace('data-release-date=""', 'data-release-date="2020-03-04"');
  check('【变异】给没有官方发布日期的模型硬塞一个日期 → 断言变红',
    inventedDate !== undatedHtml && modelsPage.assertPageHonesty(inventedDate, {
      kind: 'model', model: undatedModel, ctx: undatedCtx
    }).some(problem => problem.includes('发布时间')));

  // 中性状态词：「已下线」只允许 status=retired
  const statusLabelRetired = modelsPage.STATUS_LABEL.retired;
  const activeSaysRetired = relHtml.replace('<dt>状态</dt><dd>', `<dt>状态</dt><dd>${statusLabelRetired}`);
  check('【变异】给 status=active 的详情页写上「已下线」→ 断言变红（目录状态不是下线状态）',
    activeSaysRetired !== relHtml && modelsPage.assertPageHonesty(activeSaysRetired, {
      kind: 'model', model: releasedModel, ctx: relCtx
    }).some(problem => problem.includes('已下线')));
  const retiredModel = { ...undatedModel, status: 'retired', catalogStatus: 'historical' };
  const retiredHtml = detailPageOf(retiredModel, { links: synthLinks }).html;
  check('合成夹具（retired）：状态写「已下线」、目录状态写中性词「历史型号」，两者不混用',
    retiredHtml.includes(statusLabelRetired)
    && retiredHtml.includes('data-cell="catalog-status">历史型号')
    && !/data-cell="catalog-status"[^>]*>已下线/.test(retiredHtml));
  const catalogMismatch = relHtml.replace('data-catalog-status="current"', 'data-catalog-status="legacy"');
  check('【变异】把详情页的 data-catalog-status 改成另一档 → 断言变红',
    catalogMismatch !== relHtml && modelsPage.assertPageHonesty(catalogMismatch, {
      kind: 'model', model: releasedModel, ctx: relCtx
    }).some(problem => problem.includes('catalogStatus') || problem.includes('data-catalog-status')));
}

/* ------------------------------------------------------------------ */
/* ③-pre F-v3-registry-001 / P1-12：多变体不许吞行                        */
/* ------------------------------------------------------------------ */

{
  // 真实数据里「一条通配映射覆盖多个真实 variant」的那 9 个模型页必须**一个计价条目一行**。
  // 期望集合**自己算**（api-plans 原文 + links 原文展开），不借 modelReferencesOf —— 后者正是被测判据。
  const expectedRowsBySlug = new Map();
  const planById = new Map(apiPlans.filter(plan => plan && plan.id).map(plan => [plan.id, plan]));
  for (const link of modelRegistry.linksList(linksDoc)) {
    if (!link || link.apiPlanId === undefined) continue;
    const plan = planById.get(link.apiPlanId);
    if (!plan) continue;
    const entries = (plan.models || []).filter(item => item && item.modelKey === link.modelKey);
    const wildcard = link.variant === null || link.variant === undefined || link.variant === '';
    const picked = wildcard ? entries : entries.filter(item => item.variant === link.variant);
    if (!picked.length) continue;
    if (!expectedRowsBySlug.has(link.registrySlug)) expectedRowsBySlug.set(link.registrySlug, []);
    for (const entry of picked) {
      expectedRowsBySlug.get(link.registrySlug).push({ plan, entry });
    }
  }
  const affected = [...expectedRowsBySlug.entries()]
    .filter(([, list]) => list.length > new Set(list.map(({ plan, entry }) => `${plan.id}|${entry.modelKey}`)).size);
  // t13：分母换成**关系层现读现算**（不再写死 9）。这里的两条实现路径**完全不同**：
  //   · `affected`（本段自算）手工展开 api-plans × links；
  //   · `multiVariantFromLinks()` 走 lib 的 `sourcePricingIdentitiesOf()`，并**重新读一次关系层文件**。
  // 两边必须给出**同一批 slug**（集合相等，不只是个数相等）。
  const multiVariantLinks = multiVariantFromLinks();
  const affectedSlugList = affected.map(([slug]) => slug).sort();
  const multiVariantSlugList = [...multiVariantLinks.slugs].sort();
  check(`独立重算：${affected.length} 个 registry 模型存在"一条映射覆盖多个真实 variant"（必须 == 关系层现读现算的 ${multiVariantSlugList.length} 个，且逐条集合相等）`,
    affectedSlugList.length > 0 && slugSetsEqual(affectedSlugList, multiVariantSlugList),
    `独立重算 ${affectedSlugList.join(' | ')} ⟷ 关系层现算 ${multiVariantSlugList.join(' | ')}`);
  check('【可证伪性·t13】"集合相等"不是"计数相等"的伪装：个数相同但内容不同的两批 slug ⇒ 同一支比对必红（正例同时给出，证明它不是恒红）',
    slugSetsEqual(['a', 'b', 'c'], ['a', 'b', 'd']) === false
    && slugSetsEqual(['a', 'b', 'c'], ['a', 'b', 'c']) === true
    && slugSetsEqual([], []) === true,
    `[a,b,c] vs [a,b,d] ⇒ ${slugSetsEqual(['a', 'b', 'c'], ['a', 'b', 'd'])}（应为 false）`);
  // 真实数据当场变异：把右侧某一格换成另一个 slug（**个数不变**），比对必须红。
  const perturbedMultiVariantSlugs = multiVariantSlugList.length
    ? [...multiVariantSlugList.slice(0, -1), `${multiVariantSlugList[multiVariantSlugList.length - 1]}-perturbed`].sort()
    : [];
  check('【可证伪性·t13·真实数据变异】把关系层现算的某一格换成另一个 slug（个数不变）⇒ 同一支集合比对必红',
    multiVariantSlugList.length > 0
    && perturbedMultiVariantSlugs.length === multiVariantSlugList.length
    && slugSetsEqual(affectedSlugList, perturbedMultiVariantSlugs) === false,
    `${multiVariantSlugList.length} → ${perturbedMultiVariantSlugs.length} 个（个数不变）· 集合相等 = ${slugSetsEqual(affectedSlugList, perturbedMultiVariantSlugs)}（应为 false）`);
  console.log(`    ℹ t13 集合比对可证伪性：[a,b,c] vs [a,b,d] ⇒ ${slugSetsEqual(['a', 'b', 'c'], ['a', 'b', 'd'])}（应 false）；`
    + `[a,b,c] vs [a,b,c] ⇒ ${slugSetsEqual(['a', 'b', 'c'], ['a', 'b', 'c'])}（应 true）；`
    + `真实数据把一格换成 "-perturbed"（个数仍 ${perturbedMultiVariantSlugs.length}）⇒ ${slugSetsEqual(affectedSlugList, perturbedMultiVariantSlugs)}（应 false）`);
  const affectedSlugs = affected.map(([slug]) => slug).sort();

  const shortPages = [];
  const wrongPrice = [];
  for (const slug of affectedSlugs) {
    const model = models.find(item => item.slug === slug);
    const { html } = detailPageOf(model);
    const expected = expectedRowsBySlug.get(slug);
    const rowCount = (html.match(/class="mapirow"/g) || []).length;
    if (rowCount !== expected.length) shortPages.push(`${slug}: ${rowCount} ≠ ${expected.length}`);
    for (const { entry } of expected) {
      const price = String(apiPlansPage.priceText(entry.rates ? entry.rates.input : null, 'CNY'));
      const priceUsd = String(apiPlansPage.priceText(entry.rates ? entry.rates.input : null, 'USD'));
      if (!html.includes(price) && !html.includes(priceUsd)) {
        wrongPrice.push(`${slug}: ${entry.modelKey}/${entry.variant} input ${price}/${priceUsd} 没出现在页面上`);
      }
    }
  }
  check(`受影响的 ${affectedSlugs.length} 个模型页每个都是"一个计价条目一行"（无吞行）`,
    shortPages.length === 0, shortPages.join(' · '));
  check('受影响页上每个变体的价格各自正确（例：glm-4.5v 同时有 standard ¥2/¥6 与 long_context ¥4/¥12）',
    wrongPrice.length === 0, wrongPrice.slice(0, 4).join(' · '));
  {
    const glm = models.find(item => item.slug === 'glm-4.5v');
    const { html } = detailPageOf(glm);
    check('glm-4.5v 页同时出现 standard ¥2（input）与 long_context ¥4（input），且两行 identity 不同',
      html.includes('data-item="646f01c662e6|glm-4.5v|standard"')
      && html.includes('data-item="646f01c662e6|glm-4.5v|long_context"')
      && html.includes('¥2') && html.includes('¥4'));
  }
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
/* ③b §17 独立 join 对账参与断言（自证失效）                              */
/* ================================================================== */

{
  const audit = joinAudit.runJoinAudit({ dist: DIST });
  if (audit.pages === 0 && !requireDist('§17 独立 join 的模型页', path.join('models', 'index.html'))) {
    // 缺产物：已记红（或显式 OPTIONAL DIAGNOSTIC），下面没有现场可对账。
  } else if (audit.pages === 0) {
    check(`§17 独立 join：产物目录 ${audit.dist}/models/ 下一个模型详情页都没有（索引页在、详情页 0 个）`, false);
  } else {
  console.log(`    独立 join（${audit.dist}）：模型 ${audit.models} · 页 ${audit.pages} · 期望行 ${audit.expectedRows}`
    + `（api-plans 真实计价条目 ${audit.pricingItems}）· missing ${audit.counts.missing} · extra ${audit.counts.extra}`
    + ` · duplicate ${audit.counts.duplicate} · multi-owner ${audit.counts.multiOwner}`);
  // t13：模型数分母换成**现读发布数据集**（不再写死 44）；四项计数仍然**各自**断言为 0
  // （`joinCountProblems()` 逐项点名，不许只在一个合计里蒙过去）。
  const publishedModelsOnDisk = readJson('models.json').models.length;
  const joinCountIssueList = joinCountProblems(audit.counts);
  check(`§17 独立 join：模型数 == 现读发布数据集的 ${publishedModelsOnDisk} 个，且 missing / extra / duplicate source identity / multi-owner 四项计数各自为 0`,
    audit.models === publishedModelsOnDisk && joinCountIssueList.length === 0,
    `audit.models=${audit.models} vs 发布数据集 ${publishedModelsOnDisk}；${joinCountIssueList.join('、') || JSON.stringify(audit.counts)}`);
  check('【可证伪性·t13】四项计数是**逐项**断言的：任意一项非 0 都会被单独点名（不是只报一个合计）',
    ['missing', 'extra', 'duplicate', 'multiOwner'].every(key => joinCountProblems({ missing: 0, extra: 0, duplicate: 0, multiOwner: 0, [key]: 1 }).join('、') === `${key}=1`)
    && joinCountProblems({ missing: 0, extra: 0, duplicate: 0, multiOwner: 0 }).length === 0,
    ['missing', 'extra', 'duplicate', 'multiOwner'].map(key => `${key}:${joinCountProblems({ missing: 0, extra: 0, duplicate: 0, multiOwner: 0, [key]: 1 }).join('、')}`).join(' · '));
  console.log('    ℹ t13 四项计数逐项点名现场输出：'
    + ['missing', 'extra', 'duplicate', 'multiOwner']
      .map(key => `${key}=1 ⇒ 「${joinCountProblems({ missing: 0, extra: 0, duplicate: 0, multiOwner: 0, [key]: 1 }).join('、')}」`)
      .join(' · ')
    + `；全 0 ⇒ 「${joinCountProblems({ missing: 0, extra: 0, duplicate: 0, multiOwner: 0 }).join('、')}」（空串 = 通过）`);
  // 计价条目的结局只有两种：**有一行**（被映射到某个 registry 身份）或**有一条 API 侧声明**
  // （`model-registry-gaps.json` 里声明"对不上任何 registry 身份"，因此按定义没有页面）。
  // 所以"期望行数 = 总条目 − 已声明条目"；等式两边都不许有第三种结局（静默消失）。
  const joinDeclaredApi = modelRegistry.coverageOf({
    table: modelsTable, links: linksDoc, gaps: modelRegistry.loadGaps().doc, apiPlans, plans
  }).declaredApiIdentities;
  check('§17 独立 join：期望行数 == api-plans 计价条目 − 已声明"不对应单一模型身份"的条目（每条都要有结局：要么一行、要么一条声明）',
    audit.expectedRows === audit.pricingItems - joinDeclaredApi,
    `${audit.expectedRows} vs ${audit.pricingItems} − ${joinDeclaredApi}`);
  // t13：写死的 `12 组 / 9 个 slug` 换成**现读关系层 → 分组 → 与页面口径对账**，
  // 保留「两个口径必须相等」的强度（而且从"计数相等"提到"集合逐条相等"）。
  const joinMultiVariant = multiVariantFromLinks();
  check(`§17 独立 join：受影响口径与关系层现读现算逐条相等（${joinMultiVariant.groups} 组 / ${joinMultiVariant.slugs.size} 个 slug）`,
    audit.multiVariantGroups === joinMultiVariant.groups
    && slugSetsEqual(audit.affectedSlugs, [...joinMultiVariant.slugs]),
    `页面口径 ${audit.multiVariantGroups} 组 / ${audit.affectedSlugs.length} 个 · 关系层现算 ${joinMultiVariant.groups} 组 / ${joinMultiVariant.slugs.size} 个`
    + ` · 差异 ${JSON.stringify([...new Set([...audit.affectedSlugs, ...joinMultiVariant.slugs])].filter(slug => !audit.affectedSlugs.includes(slug) || !joinMultiVariant.slugs.has(slug)))}`);
  // 交叉对账：产物的行数必须等于独立 join 的期望（逐页），且**不借被测判据**
  const expectedBySlug = audit.expectedBySlug;
  const mismatched = [];
  for (const [slug, list] of expectedBySlug) {
    const file = path.join(DIST, 'models', slug, 'index.html');
    const expectedCount = new Set(list).size;
    if (!expectedCount) continue;
    if (!fs.existsSync(file)) { mismatched.push(`${slug}: 缺页面`); continue; }
    const count = (fs.readFileSync(file, 'utf8').match(/class="mapirow"/g) || []).length;
    if (count !== expectedCount) mismatched.push(`${slug}: ${count} ≠ ${expectedCount}`);
  }
  check('§17 交叉对账：每个已发布模型页的 mapirow 行数 == 独立 join 的展开期望（逐页）',
    mismatched.length === 0, mismatched.slice(0, 5).join(' · '));
  // 反向：独立 join 必须真的会对缺行变红（把一页的行删掉一条，audit 立刻报 missing）
  const sample = [...expectedBySlug.entries()].find(([, list]) => list.length >= 2);
  if (sample) {
    const [slug, list] = sample;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qc-join-'));
    fs.mkdirSync(path.join(tmp, 'models', slug), { recursive: true });
    const source = fs.readFileSync(path.join(DIST, 'models', slug, 'index.html'), 'utf8');
    // 整页照搬，只删掉第一条 mapirow 行
    const dropped = source.replace(/<tr class="mapirow"[\s\S]*?<\/tr>/, '');
    fs.writeFileSync(path.join(tmp, 'models', slug, 'index.html'), dropped);
    const broken = joinAudit.runJoinAudit({ dist: tmp });
    check(`§17 牙：人为删掉一行（${slug}）⇒ 独立 join 报 missing>0（对账不是恒绿的摆设）`,
      broken.counts.missing > 0, JSON.stringify(broken.counts));
    fs.rmSync(tmp, { recursive: true, force: true });
  } else check('§17 牙：没有多变体样本（如实跳过）', true);
  }
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
  const merged = html.replace(/<tr data-model="alpha-2"[\s\S]*?<\/tr>/, '');
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
  const rowId = `${row.plan.id}|${row.entry.modelKey}|${row.entry.variant}`;

  const ghostRow = `<tr class="mapirow" data-item="${rowId}" data-plan="${row.plan.id}"`
    + ` data-model-key="${row.entry.modelKey}" data-variant="${row.entry.variant}" data-provider="ghost-provider">`
    + `<th scope="row">Ghost</th><td>x</td><td>y</td><td class="num">1</td><td class="num">1</td>`
    + `<td class="num">1</td><td class="punit">USD / 每 100 万 tokens</td><td>2026-10-01</td><td>—</td></tr>`;
  const polluted = html.replace('</tbody>', `${ghostRow}</tbody>`);
  check('【牙 #5】同一记录被渲染成另一个 Provider → 红',
    modelsPage.assertPageHonesty(polluted, { kind: 'model', model: detailModel, ctx: detailCtx })
      .some(problem => problem.includes('Provider') || problem.includes('行')));

  const phantomRow = ghostRow.replace(new RegExp(row.plan.id, 'g'), 'deadbeef0000')
    .replace(`data-item="${rowId}"`, 'data-item="deadbeef0000|phantom-model|standard"')
    .replace(`data-model-key="${row.entry.modelKey}"`, 'data-model-key="phantom-model"')
    .replace('data-provider="ghost-provider"', 'data-provider="phantom"');
  const polluted2 = html.replace('</tbody>', `${phantomRow}</tbody>`);
  check('【牙 #5】凭空出现的记录（不在显式引用里）→ 红',
    modelsPage.assertPageHonesty(polluted2, { kind: 'model', model: detailModel, ctx: detailCtx })
      .some(problem => problem.includes('凭空')));

  // 多变体互不冒充：把同一记录里的 standard 行改写成 long_context（价格不变）⇒ 必红。
  // 刻意**不借 `ranked[0]`**（它往往是多变体以外的高引用模型，样本会随机"如实跳过"）：
  // 直接挑一个"同一记录里带两个真实 variant"的模型页，样本必须存在。
  const swapModel = models.find(model => detectorRefs(model).apiItems
    .some(item => detectorRefs(model).apiItems.some(other => other.plan.id === item.plan.id && other.entry.variant !== item.entry.variant)));
  if (swapModel) {
    const swapRefs = detectorRefs(swapModel);
    const swapRow = swapRefs.apiItems.find(item => swapRefs.apiItems
      .some(other => other.plan.id === item.plan.id && other.entry.variant !== item.entry.variant));
    const other = swapRefs.apiItems.find(item => item.plan.id === swapRow.plan.id && item.entry.variant !== swapRow.entry.variant);
    const swapHtml = detailPageOf(swapModel).html;
    const swapRowId = `${swapRow.plan.id}|${swapRow.entry.modelKey}|${swapRow.entry.variant}`;
    const swapped = swapHtml
      .replace(`data-item="${swapRowId}"`, `data-item="${swapRow.plan.id}|${swapRow.entry.modelKey}|${other.entry.variant}"`)
      .replace(`data-variant="${swapRow.entry.variant}"`, `data-variant="${other.entry.variant}"`);
    check(`【牙 #5】同一记录里把一个 variant 的行冒充成另一个 variant → 红（${swapModel.slug}：${swapRow.entry.variant} → ${other.entry.variant}）`,
      swapped !== swapHtml
      && modelsPage.assertPageHonesty(swapped, {
        kind: 'model', model: swapModel, ctx: detailPageOf(swapModel).ctx
      }).length > 0);
  } else check('【牙 #5】全部模型页都没有同记录的多变体样本（如实跳过）', true);

  const withoutRow = html.replace(/<tr class="mapirow"[\s\S]*?<\/tr>/, '');
  check('【牙 #5】少渲染一行（同一模型在多个平台没列全）→ 红',
    modelsPage.assertPageHonesty(withoutRow, { kind: 'model', model: detailModel, ctx: detailCtx })
      .some(problem => problem.includes('行')));

  // 行身份漂移：把一行退回"只有 planId"的旧结构（去掉 data-variant）⇒ 必须红，
  // 否则解析器会静默少读一行，把"结构变了"伪装成"行数少了"。
  const drifted = html.replace(`data-item="${rowId}" data-plan="${row.plan.id}"`, `data-item="${row.plan.id}" data-plan="${row.plan.id}"`)
    .replace(` data-variant="${row.entry.variant}"`, '');
  check('【牙 #5】行身份退回旧结构（data-item 只有 planId、没有 data-variant）→ 红',
    drifted !== html
    && modelsPage.assertPageHonesty(drifted, { kind: 'model', model: detailModel, ctx: detailCtx }).length > 0);
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

  // 牙（T14-F2，独立审查抓到）：**索引页的身份对账必须落在产物上**。
  // 为什么放在这里而不是 §②：§② 是用数据集**在内存里重新渲染**页面再对账的，
  // 所以"把产物里的某一行改名"根本进不了它的视野（实测：产物里 13 处 glm-5.3 改成
  // glm-5.3x、含 2 个详情链接，112 项断言仍全过）。产物对账必须读**磁盘上的那一份**。
  if (modelsDoc) {
    const onDiskSlugs = [...markup.matchAll(/<tr data-model="([^"]*)"/g)].map(match => match[1]);
    const publishedSlugs = modelsDoc.models.map(model => model.slug);
    if (JSON.stringify(onDiskSlugs) !== JSON.stringify(publishedSlugs)) {
      const missing = publishedSlugs.filter(slug => !onDiskSlugs.includes(slug));
      const extra = onDiskSlugs.filter(slug => !publishedSlugs.includes(slug));
      problems.push(`索引页产物的行与发布数据集不一致（缺 ${missing.slice(0, 3).join('/') || '无'} · 多 ${extra.slice(0, 3).join('/') || '无'}）—— 改名 / 换位 / 多行少行都算`);
    }
    // 行内详情链接必须指向**这一行自己的**路由（链接指错 = 点进去是另一个人）
    const rowHtml = new Map();
    for (const match of markup.matchAll(/<tr data-model="([^"]*)"[\s\S]*?<\/tr>/g)) rowHtml.set(match[1], match[0]);
    const gatedSlugs = new Set(modelsDoc.models.map(model => model.slug));
    const mislinked = [];
    for (const slug of onDiskSlugs) {
      const row = rowHtml.get(slug);
      if (!row || !gatedSlugs.has(slug)) continue;
      const linkMatch = row.match(/<a href="([^"]*)"/);
      if (!linkMatch) { mislinked.push(`${slug}(没有链接)`); continue; }
      const linked = decodeURIComponent(String(linkMatch[1]).replace(/^(\.\.\/)+/, '').replace(/\/$/, ''));
      if (linked !== `models/${slug}`) mislinked.push(`${slug}(链接指向 ${linkMatch[1]})`);
    }
    if (mislinked.length) problems.push(`索引页有 ${mislinked.length} 行的详情链接没指向自己：${mislinked.slice(0, 3).join(' / ')}`);
  }

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

const DIST_MODELS_OK = requireDistFiles('dist 现场 /models/', [path.join('models', 'index.html'), 'sitemap.xml']);
if (DIST_MODELS_OK) {
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
}
// 缺产物不在这里「跳过并计 ✓」：requireDistFiles() 要么已记红，要么是显式 OPTIONAL DIAGNOSTIC。

/* ================================================================== */
/* ⑨ 逐格对账：每一格都必须等于数据里那一条（独立第二实现 · T25 / T20-N2） */
/* ================================================================== */

/**
 * ## 这一节补的是哪一层
 *
 * T20 的 M19：把某条计价记录的**数值与相邻格对调**（行身份 `data-item` 没变、行数没变、
 * 单位文案结构也没变）时，仓库自带门禁**全部保持绿色**，只有 verifier 自写的独立 join 抓到。
 * 缺的那一层是「**每一格**是否等于数据里那一条」。⑨ 把它补上。
 *
 * ## 判据是独立第二实现（不自证）
 *
 *   · **期望值自己算**：只读 `api-plans.json` 与 `scripts/data/model-registry-links.json` 的**原文**，
 *     按 `(apiPlanId, modelKey, 记录内真实 variant)` 展开 —— 与 §17 同一口径：
 *     `variant: null` 认领该 modelKey 在**这条记录**里的全部真实 variant（不是一个模型一行）；
 *   · **实际值从渲染产物读**：`<产物>/models/<slug>/index.html` 的 `<tr class="mapirow">` 逐格；
 *   · **不调用 models-page.js 的任何计算函数**（`apiPricingRowOf` / `modelReferencesOf` /
 *     `apiTargetsOf` / `modelPageGate` … 一个都不用），只读它渲染出来的 HTML
 *     ⇒ 渲染层与判据不可能"同源同错"。
 *
 * ## 覆盖与灵敏度
 *
 * 产物里**每一条**计价条目（0 豁免，含多变体展开后的每一行）；另加一个**合成多变体夹具**
 * 与三条就地灵敏度对照（换格 / 空格 / 删行），对照与干净样本成对断言 ⇒ 判据不可能恒绿也不可能恒红。
 */
const CELL_LABELS = {
  // 独立副本（**不是**从被测模块取）：词表变了必须在这里显式同步，下面有与原表的漂移对照
  channel: { standard: '标准', batch: '批处理', flex: '弹性', priority: '优先', fast: '快速', ultrafast: '极速', off_peak: '低峰时段', fine_tuned: '微调', other: '其他' },
  unit: { per_1M_tokens: '每 100 万 tokens', per_1K_tokens: '每 1000 tokens', per_1M_characters: '每 100 万字符' },
  variant: { standard: '标准', batch: '批处理', long_context: '长上下文', fine_tuned: '微调', priority: '优先', other: '其他' },
  currency: { CNY: '¥', USD: '$', HKD: 'HK$', EUR: '€', JPY: '¥', GBP: '£', SGD: 'S$' },
  unknownNum: '—',
  unknownText: '未标注'
};

/** 独立的价格数字格式：千分位、不用 toLocaleString（产物必须可复现） */
function cellNumberText(value) {
  const text = String(value);
  if (!/^-?\d+(\.\d+)?$/.test(text)) return text;
  const [int, frac] = text.split('.');
  const sign = int.startsWith('-') ? '-' : '';
  const digits = sign ? int.slice(1) : int;
  return `${sign}${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${frac ? `.${frac}` : ''}`;
}

/** 独立的价格文本：`null` → 「—」；`0` → 「免费」；其余带币种符号（两套缺值口径分得开） */
function cellPriceText(value, currency) {
  if (value === null || value === undefined) return CELL_LABELS.unknownNum;
  if (value === 0) return '免费';
  return `${CELL_LABELS.currency[currency] || ''}${cellNumberText(value)}`;
}

/** 独立的单位文本：`USD / 每 100 万 tokens`；记录没写单位 ⇒ 「未标注」 */
function cellUnitText(plan) {
  const pricing = (plan && plan.pricing) || {};
  if (!pricing.unit) return CELL_LABELS.unknownText;
  return `${pricing.currency || CELL_LABELS.unknownText} / ${CELL_LABELS.unit[pricing.unit] || pricing.unit}`;
}

function unescapeCell(text) {
  return String(text)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'').replace(/&amp;/g, '&');
}

function cellTextOf(cellHtml) {
  return unescapeCell(String(cellHtml).replace(/<[^>]*>/g, '')).trim();
}

/** 产物页面 → 一张逐格读出来的计价表（读不出结构时字段为 null，由调用方报"结构漂移"） */
function readMapiTable(html) {
  const rows = [];
  const rowRe = /<tr class="mapirow"([^>]*)>([\s\S]*?)<\/tr>/g;
  let match;
  while ((match = rowRe.exec(String(html))) !== null) {
    const attrs = match[1];
    const body = match[2];
    const attr = name => {
      const hit = attrs.match(new RegExp(`${name}="([^"]*)"`));
      return hit ? unescapeCell(hit[1]) : null;
    };
    const th = (body.match(/<th scope="row">([\s\S]*?)<\/th>/) || [])[1];
    const tds = [...body.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(item => item[1]);
    const timeTag = body.match(/<time datetime="([^"]*)">([\s\S]*?)<\/time>/) || [];
    const href = (body.match(/<a href="([^"]*)"/) || [])[1];
    const at = index => (tds[index] === undefined ? null : cellTextOf(tds[index]));
    rows.push({
      identity: `${attr('data-plan')}|${attr('data-model-key')}|${attr('data-variant')}`,
      item: attr('data-item'),
      planId: attr('data-plan'),
      modelKey: attr('data-model-key'),
      variant: attr('data-variant'),
      providerKey: attr('data-provider'),
      provider: th === undefined ? null : cellTextOf(th),
      channel: at(0),
      variantLabel: at(1),
      input: at(2),
      output: at(3),
      cache: at(4),
      unit: at(5),
      lastSeen: timeTag[2] === undefined ? at(6) : cellTextOf(timeTag[2]),
      lastSeenAttr: timeTag[1] === undefined ? null : timeTag[1],
      officialHref: href === undefined ? null : unescapeCell(href),
      officialText: at(7),
      cellCount: tds.length
    });
  }
  return rows;
}

/** 期望行：自己从原文展开（§17 口径）—— 一条真实计价条目 = 一个期望行 */
function cellExpectationsFor(rawLinks, rawApiPlans, providerNames) {
  const planById = new Map(rawApiPlans.filter(plan => plan && plan.id).map(plan => [plan.id, plan]));
  const bySlug = new Map();
  for (const link of rawLinks) {
    if (!link || typeof link !== 'object' || link.apiPlanId === undefined) continue;
    const plan = planById.get(link.apiPlanId);
    if (!plan) continue;
    const entries = (plan.models || []).filter(entry => entry && entry.modelKey === link.modelKey);
    const wildcard = link.variant === null || link.variant === undefined || link.variant === '';
    const picked = wildcard ? entries : entries.filter(entry => entry.variant === link.variant);
    if (!picked.length) continue;
    if (!bySlug.has(link.registrySlug)) bySlug.set(link.registrySlug, []);
    for (const entry of picked) {
      const rates = entry.rates || {};
      const pricing = plan.pricing || {};
      bySlug.get(link.registrySlug).push({
        identity: `${plan.id}|${entry.modelKey}|${entry.variant}`,
        planId: plan.id,
        modelKey: entry.modelKey,
        variant: entry.variant,
        providerKey: plan.provider,
        cells: {
          provider: providerNames.get(plan.provider) || plan.provider,
          channel: CELL_LABELS.channel[plan.channel] || plan.channel || CELL_LABELS.unknownText,
          variantLabel: CELL_LABELS.variant[entry.variant] || entry.variant || CELL_LABELS.unknownText,
          input: cellPriceText(rates.input, pricing.currency),
          output: cellPriceText(rates.output, pricing.currency),
          cache: cellPriceText(rates.cachedInput, pricing.currency),
          unit: cellUnitText(plan),
          lastSeen: plan.lastSeen || CELL_LABELS.unknownNum
        },
        officialUrl: plan.officialUrl || null,
        note: entry.note || null
      });
    }
  }
  return bySlug;
}

/** 逐格对账（一页）：每条问题都点名 (planId, modelKey, variant) + 哪一格 + 期望/实际 */
function cellProblemsOfPage(slug, html, expectedRows) {
  const problems = [];
  const rows = readMapiTable(html);
  const byIdentity = new Map(rows.map(row => [row.identity, row]));
  const expectedIdentities = new Set(expectedRows.map(row => row.identity));
  if (rows.length !== expectedRows.length) {
    problems.push(`${slug}: 计价表 ${rows.length} 行 ≠ 数据里 ${expectedRows.length} 条计价条目`);
  }
  for (const row of rows) {
    if (!expectedIdentities.has(row.identity)) problems.push(`${slug}: 页面出现数据里没有的行 ${row.identity}`);
  }
  for (const expected of expectedRows) {
    const where = `(${expected.planId}, ${expected.modelKey}, ${expected.variant})`;
    const actual = byIdentity.get(expected.identity);
    if (!actual) {
      problems.push(`${slug}: 计价条目 ${where} 没有渲染成行（一个真实计价条目在页面上不存在）`);
      continue;
    }
    if (actual.item !== expected.identity) {
      problems.push(`${slug} ${where}: 行身份 data-item=${JSON.stringify(actual.item)}，应为 ${JSON.stringify(expected.identity)}`);
    }
    if (actual.providerKey !== expected.providerKey) {
      problems.push(`${slug} ${where}: 行上的 data-provider=${JSON.stringify(actual.providerKey)}，按数据应为 ${JSON.stringify(expected.providerKey)}`);
    }
    if (actual.cellCount !== 8) {
      problems.push(`${slug} ${where}: 该行有 ${actual.cellCount} 个 <td>，计价表应为 8 个（结构漂移）`);
    }
    for (const [name, label] of Object.entries(CELL_FIELD_LABELS)) {
      if (actual[name] !== expected.cells[name]) {
        problems.push(`${slug} ${where}: 格「${label}」渲染为 ${JSON.stringify(actual[name])}，按数据应为 ${JSON.stringify(expected.cells[name])}`);
      }
    }
    if (actual.lastSeenAttr !== expected.cells.lastSeen) {
      problems.push(`${slug} ${where}: 格「Last Seen」的 <time datetime> 为 ${JSON.stringify(actual.lastSeenAttr)}，按数据应为 ${JSON.stringify(expected.cells.lastSeen)}`);
    }
    if (expected.officialUrl) {
      if (actual.officialHref !== expected.officialUrl) {
        problems.push(`${slug} ${where}: 格「官方定价页」链接为 ${JSON.stringify(actual.officialHref)}，按数据应为 ${JSON.stringify(expected.officialUrl)}`);
      }
    } else if (String(actual.officialText || '') !== CELL_LABELS.unknownNum) {
      problems.push(`${slug} ${where}: 记录没有 officialUrl 时该格应为「${CELL_LABELS.unknownNum}」，实得 ${JSON.stringify(actual.officialText)}`);
    }
    if (expected.note && !String(actual.officialText || '').includes(expected.note)) {
      problems.push(`${slug} ${where}: 格「官方定价页」没有带上该条目的 note（缺 ${JSON.stringify(expected.note)}）`);
    }
  }
  return problems;
}

/** 逐格字段 → 中文格名（失败信息里点名到"哪一格"） */
const CELL_FIELD_LABELS = {
  provider: 'Provider', channel: '计费通道', variantLabel: 'Variant',
  input: '输入价', output: '输出价', cache: 'Cache 价', unit: 'Unit（币种 + 文案）', lastSeen: 'Last Seen'
};

if (DIST_MODELS_OK) {
  const rawLinksPath = path.join(ROOT, 'scripts', 'data', 'model-registry-links.json');
  const cellRawLinks = JSON.parse(fs.readFileSync(rawLinksPath, 'utf8')).links;
  const cellRawApiPlans = JSON.parse(fs.readFileSync(path.join(ROOT, 'api-plans.json'), 'utf8')).plans;
  const rawProviders = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'data', 'providers.json'), 'utf8'));
  const providerNames = new Map(Object.entries(rawProviders)
    .filter(([key]) => !key.startsWith('_'))
    .map(([key, entry]) => [key, String((entry && entry.name) || key)]));

  // 独立副本与既有契约表的漂移对照：词表/格式变了必须显式同步这里（否则 ⑨ 会静默变成"另一套口径"）
  check('独立副本与契约表一致（计费通道 / 单位 / 变体词表）',
    JSON.stringify(CELL_LABELS.channel) === JSON.stringify(apiSchema.API_CHANNEL_LABEL)
    && JSON.stringify(CELL_LABELS.unit) === JSON.stringify(apiSchema.API_UNIT_LABEL)
    && JSON.stringify(CELL_LABELS.variant) === JSON.stringify(apiSchema.MODEL_VARIANT_LABEL),
    '词表漂移：请把新词同步进 models-page-selftest.js 的 CELL_LABELS');
  check('独立副本与契约表一致（币种符号 / 数字格式 / 缺值字面量）',
    JSON.stringify(CELL_LABELS.currency) === JSON.stringify(plansPageLib.CURRENCY_SYMBOL)
    && cellNumberText(1234567.5) === plansPageLib.formatNumber(1234567.5)
    && CELL_LABELS.unknownNum === modelsPage.UNKNOWN_NUM
    && CELL_LABELS.unknownText === modelsPage.UNKNOWN_TEXT);

  // 自证禁令的机器化：⑨ 这一段里**一个计算函数都不许出现**（只允许渲染入口 + 常量 + 读产物）
  {
    const ownSource = fs.readFileSync(__filename, 'utf8');
    const sectionSource = ownSource.slice(ownSource.indexOf('⑨ 逐格对账'));
    const forbidden = ['apiPricingRowOf', 'apiRowOf', 'apiTargetsOf', 'modelReferencesOf', 'modelPageGate',
      'modelReferenceOfCached']
      .filter(name => new RegExp(`modelsPage\\.${name}\\b`).test(sectionSource));
    check('⑨ 的判据不借 models-page 的计算函数自证（只调用渲染入口 renderModelPage / 读产物）',
      forbidden.length === 0, `出现了：${forbidden.join(' · ')}`);
    check('⑨ 明确调用了渲染入口（而不是自己拼 HTML —— 那样就不是在检查真实渲染层）',
      /modelsPage\.renderModelPage\(/.test(sectionSource));
  }

  const cellExpectations = cellExpectationsFor(cellRawLinks, cellRawApiPlans, providerNames);
  const cellItemTotal = cellRawApiPlans.reduce((sum, plan) => sum + ((plan && plan.models) || []).length, 0);
  // 已声明"不对应单一模型身份"的计价条目数（它们按定义没有页面行 —— 结局是"一条声明"，不是"一行"）
  const cellDeclaredApi = modelRegistry.coverageOf({
    table: modelsTable, links: linksDoc, gaps: modelRegistry.loadGaps().doc, apiPlans, plans
  }).declaredApiIdentities;
  let cellRowsChecked = 0;
  let cellPagesChecked = 0;
  const cellCoverageProblems = [];
  const cellValueProblems = [];
  for (const [slug, expectedRows] of cellExpectations) {
    const file = path.join(DIST, 'models', slug, 'index.html');
    if (!fs.existsSync(file)) {
      cellCoverageProblems.push(`${slug}: 缺少详情页产物 ${path.relative(ROOT, file)}（逐格对账无从谈起）`);
      continue;
    }
    cellPagesChecked += 1;
    cellRowsChecked += expectedRows.length;
    cellValueProblems.push(...cellProblemsOfPage(slug, fs.readFileSync(file, 'utf8'), expectedRows));
  }
  check(`逐格对账：${cellPagesChecked} 个模型页 · ${cellRowsChecked} 条计价条目 · ${cellRowsChecked * Object.keys(CELL_FIELD_LABELS).length} 个格，**全部**等于数据里那一条`,
    cellValueProblems.length === 0, cellValueProblems.slice(0, 4).join(' ｜ ').slice(0, 600));
  check(`逐格对账覆盖 = api-plans 计价条目 − 已声明"不对应单一模型身份"的条目（${cellRowsChecked}/${cellItemTotal}，其中已声明 ${cellItemTotal - cellRowsChecked} 条；${cellExpectations.size} 个 slug 逐页有产物）`,
    cellRowsChecked === cellItemTotal - cellDeclaredApi && cellCoverageProblems.length === 0
    && cellPagesChecked === cellExpectations.size && cellItemTotal > 0,
    cellCoverageProblems.slice(0, 3).join(' ｜ '));

  // ---- 合成多变体夹具：判据不只对生产数据有效 ----
  const synthPlan = {
    id: 'sy0000000001', kind: 'api', provider: 'zhipu', planName: '合成多变体记录', channel: 'standard',
    officialUrl: 'https://example.com/pricing', source: 'Official-Pricing', sourceUrl: 'https://example.com/pricing',
    region: 'cn', pricing: { currency: 'CNY', unit: 'per_1M_tokens', unitNote: null },
    models: [
      {
        name: 'synth-x', modelKey: 'synth-x', variant: 'standard', aliases: null,
        rates: { input: 1, output: 2, cachedInput: null, cacheWrite: null, cacheWriteLong: null, reasoning: null, batchInput: null, batchOutput: null },
        mediaRates: null, note: null
      },
      {
        name: 'synth-x', modelKey: 'synth-x', variant: 'long_context', aliases: null,
        rates: { input: 3, output: 4, cachedInput: 5, cacheWrite: null, cacheWriteLong: null, reasoning: null, batchInput: null, batchOutput: null },
        mediaRates: null, note: '合成夹具：长上下文档'
      }
    ],
    firstSeen: '2026-10-01', lastSeen: '2026-10-01', verified: true, verifiedAt: '2026-10-01', evidence: []
  };
  const synthTable = {
    'synth-model': {
      canonicalName: '合成模型', developer: '智谱AI', owner: '智谱AI', family: '合成',
      aliases: [], officialUrl: null, status: 'active', note: null
    }
  };
  const synthLinks = {
    schemaVersion: 1,
    links: [{
      registrySlug: 'synth-model', apiPlanId: 'sy0000000001', modelKey: 'synth-x', variant: null,
      basis: 'explicit-mapping', evidence: [], note: '合成夹具：通配映射认领两个变体'
    }]
  };
  const synthModel = modelsPage.modelsOf(synthTable)[0];
  const synthCtx = {
    ...ctx, links: synthLinks, apiPlans: [synthPlan], plans: [], deals: [],
    dealLinks: null, apiPlanHistoryStore: null, __refCache: new Map(), prefix: '../../'
  };
  const synthHtml = modelsPage.renderModelPage(synthModel, synthCtx);
  const synthExpected = cellExpectationsFor(synthLinks.links, [synthPlan], providerNames).get('synth-model') || [];
  const synthProblems = cellProblemsOfPage('synth-model', synthHtml, synthExpected);
  check(`合成多变体夹具：通配映射认领 2 个真实变体 ⇒ 2 行、逐格全对（${synthExpected.map(row => row.variant).join(' + ')}）`,
    synthExpected.length === 2 && synthProblems.length === 0, synthProblems.slice(0, 3).join(' ｜ '));
  check('合成夹具：cache=5 → 「¥5」、cache=null → 「—」（「免费 / 已公布 / 未公布」三套口径分得开）',
    synthHtml.includes('<td class="num">¥5</td>') && synthHtml.includes('<td class="num">—</td>'));
  check('合成夹具：逐格对账在干净样本上零问题（判据不是恒红）', synthProblems.length === 0);

  // ---- 就地灵敏度对照：换相邻格 / 空格 / 删行（只污染内存里的 HTML 副本，不碰任何文件） ----
  const swapCells = html => html.replace(
    /(<td class="num">)¥1(<\/td>\s*<td class="num">)¥2(<\/td>)/,
    '$1¥2$2¥1$3'
  );
  const swappedHtml = swapCells(synthHtml);
  const swappedProblems = cellProblemsOfPage('synth-model', swappedHtml, synthExpected);
  check('【对照】把 standard 行的「输入价」与「输出价」对调 → 逐格对账必须点名该条目与该格',
    swappedHtml !== synthHtml
    && swappedProblems.some(problem => problem.includes('(sy0000000001, synth-x, standard)')
      && problem.includes('输入价') && problem.includes('¥2') && problem.includes('¥1')),
    swappedProblems.slice(0, 2).join(' ｜ '));
  const blankedHtml = synthHtml.replace(/(<td class="num">)¥3(<\/td>)/, '$1$2');
  const blankedProblems = cellProblemsOfPage('synth-model', blankedHtml, synthExpected);
  check('【对照】把 long_context 的「输入价」整格置空（行仍在、行数不变）→ 必须点名该格（期望 ¥3、实际空）',
    blankedHtml !== synthHtml
    && blankedProblems.some(problem => problem.includes('(sy0000000001, synth-x, long_context)')
      && problem.includes('输入价') && problem.includes('""')),
    blankedProblems.slice(0, 2).join(' ｜ '));
  const removedCellHtml = synthHtml.replace(/<td class="num">¥3<\/td>/, '');
  const removedCellProblems = cellProblemsOfPage('synth-model', removedCellHtml, synthExpected);
  check('【对照】把 long_context 的「输入价」整格**删掉**（行仍在、行数不变）→ 必须点名该格（期望 ¥3、实际空）与列数漂移',
    removedCellHtml !== synthHtml
    && removedCellProblems.some(problem => problem.includes('(sy0000000001, synth-x, long_context)') && problem.includes('输入价'))
    && removedCellProblems.some(problem => problem.includes('7 个 <td>')),
    removedCellProblems.slice(0, 2).join(' ｜ '));
  const droppedRowHtml = synthHtml.replace(/<tr class="mapirow"(?:(?!<\/tr>)[\s\S])*long_context[\s\S]*?<\/tr>/, '');
  const droppedProblems = cellProblemsOfPage('synth-model', droppedRowHtml, synthExpected);
  check('【对照】整行删掉（少一条计价条目）→ 行数对账 + 该条目点名',
    droppedRowHtml !== synthHtml && droppedProblems.length > 0
    && droppedProblems.some(problem => problem.includes('计价表 1 行 ≠ 数据里 2 条')),
    droppedProblems.slice(0, 2).join(' ｜ '));
  // 真实页面上的同一条对照（证明判据在真实产物结构上也可用，而不是只认得合成夹具）
  {
    const sampleSlug = [...cellExpectations.keys()].find(slug => (cellExpectations.get(slug) || []).length >= 2);
    const sampleRows = cellExpectations.get(sampleSlug) || [];
    const realHtml = fs.readFileSync(path.join(DIST, 'models', sampleSlug, 'index.html'), 'utf8');
    const firstRow = sampleRows[0];
    const target = new RegExp(`(<td class="num">)${firstRow.cells.input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(</td>\\s*<td class="num">)${firstRow.cells.output.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(</td>)`);
    const dirtyReal = realHtml.replace(target, '$1DIRTY$2DIRTY$3');
    const dirtyRealProblems = cellProblemsOfPage(sampleSlug, dirtyReal, sampleRows);
    check(`【对照】真实页面（${sampleSlug}）上把两格数值改成占位 → 必须点名 ${firstRow.identity}`,
      dirtyReal !== realHtml && dirtyRealProblems.length >= 2
      && dirtyRealProblems.some(problem => problem.includes(`(${firstRow.planId}, ${firstRow.modelKey}, ${firstRow.variant})`)),
      dirtyRealProblems.slice(0, 2).join(' ｜ '));
  }
}

/* ================================================================== */

console.log(`\n=== v3.0 Model Registry 页面演练：${passed} 项通过，${failures.length} 项失败 ===`);
if (failures.length) {
  console.log('失败项：');
  failures.forEach(name => console.log(`  ✗ ${name}`));
  process.exit(1);
}
