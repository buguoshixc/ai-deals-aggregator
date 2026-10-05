#!/usr/bin/env node
/**
 * coverage-expansion-v1：**Coverage Target 层 + report:coverage v2** 的演练（离线、可重跑）。
 *
 * 这一层最该防的事只有一个：**"我声称覆盖了"与"盘上真的有"混成一格**。
 * 所以本自测分四段，逐段钉住不同的东西：
 *
 *   ① 真实文件与事实快照 —— `scripts/data/coverage-targets.json` 合法、与身份层双向对上、
 *      没有手写状态、没有指向不存在的 provider / registrySlug / 来源；
 *   ② 七态派生（夹具驱动、零依赖）—— 七种状态**每一种都真的能派出来**，
 *      且 DEFERRED / UNVERIFIABLE / NOT_APPLICABLE / BLOCKED_SOURCE **永不算 MISSING**；
 *   ③ 牙（变异即红）—— provider 不存在、registrySlug 不存在、来源编造、身份层少一行、
 *      手写状态字段、重复键、deferred 缺复查条件、不适用缺理由、同一维度两条裁决、
 *      词汇表不匹配、规范序被打乱 …… 逐条必须红；
 *   ④ 端到端契约 —— `report:coverage --json` 两次运行**逐字节一致**、旧 JSON 键一个不少、
 *      新键结构完整、并且"本层不引入任何自检问题"。
 *
 * 为什么第 ② 段用夹具而不是盘上数据：真实盘面此刻只可能出现七态中的一部分
 * （有数据的都是 COVERED，缺口多半是 MISSING）。**用真实数据证明不了 PARTIAL / BLOCKED_SOURCE
 * 真的能派出来** —— 那两格永远绿的空断言正是本仓库反复抓到的那类假绿。
 *
 * 用法：node scripts/tools/coverage-targets-selftest.js
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ct = require('../lib/coverage-targets');
const sr = require('../lib/source-rulings');
const providers = require('../lib/providers');
const registry = require('../lib/model-registry');
const freshnessLib = require('../lib/model-freshness');
const { load: loadRenderCore } = require('../lib/render-core');
const dataDocs = require('../lib/data-docs');

const ROOT = path.join(__dirname, '..', '..');
const REPORT = path.join(ROOT, 'scripts', 'tools', 'coverage-report.js');

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

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/** 与 lib 的规范序判据**同一支**比较（code-unit 序，不用 localeCompare —— 两份判据不许分家） */
const orderKeyOfTargetItem = (item) => `${ct.DIMENSIONS.indexOf(item.dimension)}\u0000${String(item[ct.PAYLOAD_KEY_OF[item.dimension]] || '')}`;
function sortCurrentTargets(items) {
  return [...items].sort((a, b) => (orderKeyOfTargetItem(a) < orderKeyOfTargetItem(b) ? -1
    : orderKeyOfTargetItem(a) > orderKeyOfTargetItem(b) ? 1 : 0));
}

/* ------------------------------------------------------------------ */
/* 盘上事实（真实文件；①④两段用它）                                     */
/* ------------------------------------------------------------------ */

const registryDoc = readJson('scripts/data/models.json');
const registryTable = ct.withoutMeta(registryDoc);
const providerLoad = providers.load();
const providerTable = providerLoad.table;
const dealsDoc = readJson('deals.json');
const plansDoc = readJson('plans.json');
const apiDoc = readJson('api-plans.json');
const healthDoc = readJson('scripts/data/source-health.json');
const targetsLoaded = ct.load();
const realFacts = ct.buildFacts({
  providerTable,
  deals: dealsDoc.deals,
  dealVendorOf: (deal) => loadRenderCore().vendorOf(deal),
  today: '2026-10-04',
  plans: plansDoc.plans,
  apiPlans: apiDoc.plans,
  modelsTable: registryTable,
  sourceHealthDoc: healthDoc
});
const knownSources = [...new Set([...Object.keys(realFacts.sourceHealth), ...realFacts.dealSources])];
const realProblems = ct.validateTargets(targetsLoaded.doc, {
  providerTable,
  modelsTable: registryTable,
  knownSources,
  duplicateKeys: targetsLoaded.duplicateKeys
});
const realDerived = ct.deriveTargets(targetsLoaded.doc, realFacts);

/* ------------------------------------------------------------------ */
/* ① 真实文件与事实快照                                                 */
/* ------------------------------------------------------------------ */

section('① 真实文件与事实快照（scripts/data/coverage-targets.json）');

check('coverage-targets.json 在盘上且是合法 JSON', !targetsLoaded.missing && !targetsLoaded.broken,
  targetsLoaded.broken || '文件不存在');
check('顶层没有重复键（判据来自原文，JSON.parse 看不见这类事故）',
  targetsLoaded.duplicateKeys.length === 0, targetsLoaded.duplicateKeys.join('；'));
check(`真实文件通过全部硬校验（0 处问题，实际 ${realProblems.length} 处）`, realProblems.length === 0,
  realProblems.slice(0, 3).join('；'));
check('意图层与身份层双向对上：providers.json 每一个 provider 都有一行',
  Object.keys(providerTable).every(key => ct.targetsList(targetsLoaded.doc).some(target => target.provider === key)),
  Object.keys(providerTable).filter(key => !ct.targetsList(targetsLoaded.doc).some(target => target.provider === key)).join(', '));
check('每一条 current target 的 registrySlug 都真实存在于 scripts/data/models.json',
  ct.targetsList(targetsLoaded.doc).every(target => ct.declaredTargetsOf(target, 'models')
    .every(item => Object.prototype.hasOwnProperty.call(registryTable, item.registrySlug))));
check('每一条 current target 的 deals source 都真实存在过（source-health 的 name 或 deals.json 的 source）',
  ct.targetsList(targetsLoaded.doc).every(target => ct.declaredTargetsOf(target, 'deals')
    .every(item => knownSources.includes(item.source))));
check('意图层没有手写状态字段（state / status / coverage / selfStatus …）',
  ct.targetsList(targetsLoaded.doc).every(target => Object.keys(target)
    .every(key => !ct.FORBIDDEN_STATE_KEYS.includes(key))));
check('tier / role 全部落在枚举内',
  ct.targetsList(targetsLoaded.doc).every(target => ct.TIERS.includes(target.tier) && ct.ROLES.includes(target.role)));
check('reviewedAt 是 null 或 YYYY-MM-DD',
  targetsLoaded.doc.reviewedAt === null || /^\d{4}-\d{2}-\d{2}$/.test(String(targetsLoaded.doc.reviewedAt)));
check('派生行数 == Target 行数 × 维度数',
  realDerived.rows.length === ct.targetsList(targetsLoaded.doc).length * ct.DIMENSIONS.length,
  `实得 ${realDerived.rows.length}`);
check('真实盘面上每一个格子的状态都在七态之内',
  realDerived.rows.every(row => ct.STATE_ORDER.includes(row.state)));
check('真实盘面：COVERED 的格子必须真的有记录（不许空口算覆盖）',
  realDerived.rows.filter(row => row.state === ct.STATES.COVERED).every(row => row.present > 0 || row.resolved > 0));
check('真实盘面：MISSING 的格子必须真的没有记录、且没有被裁决挡掉',
  realDerived.rows.filter(row => row.state === ct.STATES.MISSING)
    .every(row => row.present === 0 && !row.ruling));

// 意图层**不发布**：它不是公开数据集，也不进 Feed / Manifest / Sitemap 的数据集清单
const docsText = JSON.stringify(dataDocs.PUBLIC_DATASETS);
check('coverage-targets 没有被登记成公开数据集（PUBLIC_DATASETS）', !/coverage-targets/.test(docsText));
const manifestUrls = typeof dataDocs.datasetUrls === 'function' ? dataDocs.datasetUrls() : [];
check('coverage-targets 不在 Manifest 的数据集地址里', !manifestUrls.some(url => /coverage-targets/.test(url)));
const feedsSource = fs.readFileSync(path.join(ROOT, 'scripts', 'lib', 'feeds.js'), 'utf8');
check('coverage-targets 没有进 Feed 层（lib/feeds.js 里不出现）', !/coverage-targets/.test(feedsSource));
const targetsLibSource = fs.readFileSync(path.join(ROOT, 'scripts', 'lib', 'coverage-targets.js'), 'utf8');
check('判据层是纯函数：不读墙上时钟、不联网、不写盘',
  !/Date\.now|new Date\(/.test(targetsLibSource) && !/https?:\/\//.test(targetsLibSource.replace(/^[\s\S]*?\*\//, ''))
  && !/writeFileSync|appendFileSync/.test(targetsLibSource));

/* ------------------------------------------------------------------ */
/* ② 七态派生（夹具驱动）                                               */
/* ------------------------------------------------------------------ */

section('② 七态派生（夹具：每种状态都必须真的能派出来）');

const FIXTURE_PROVIDERS = {
  alpha: { name: 'Alpha', slug: 'alpha', aliases: ['alpha'], vendorKey: 'alpha' },
  beta: { name: 'Beta', slug: 'beta', aliases: ['beta'], vendorKey: 'beta' },
  gamma: { name: 'Gamma', slug: 'gamma', aliases: ['gamma'], vendorKey: null },
  delta: { name: 'Delta', slug: 'delta', aliases: ['delta'], vendorKey: 'delta' }
};
const FIXTURE_MODELS = {
  'alpha-1': {
    canonicalName: 'Alpha 1', developer: 'Alpha', owner: 'Alpha', family: 'Alpha',
    aliases: [], officialUrl: null, status: 'active', note: null
  }
};
const FIXTURE_HEALTH = {
  sources: [
    { source: 'alpha_official', name: 'Alpha Official', status: 'healthy', reason: null, consecutiveFailures: 0 },
    { source: 'delta_official', name: 'Delta Official', status: 'failed', reason: 'collector_error', consecutiveFailures: 9 }
  ]
};
const FIXTURE_FACTS = ct.buildFacts({
  providerTable: FIXTURE_PROVIDERS,
  deals: [
    { type: 'deal', vendor: 'Alpha', source: 'Alpha Official', expiresAt: null },
    { type: 'deal', vendor: 'Alpha', source: 'Alpha Official', expiresAt: null }
  ],
  dealVendorOf: (deal) => (deal && deal.vendor ? { key: String(deal.vendor).toLowerCase() } : null),
  today: '2026-10-04',
  plans: [
    { provider: 'alpha', planName: 'Alpha Pro' },
    { provider: 'alpha', planName: 'Alpha Free' }
  ],
  apiPlans: [{ provider: 'alpha', models: [{ modelKey: 'alpha-1', variant: 'standard' }] }],
  modelsTable: FIXTURE_MODELS,
  sourceHealthDoc: FIXTURE_HEALTH
});

const FIXTURE_TARGETS = [
  {
    provider: 'alpha',
    tier: 'core',
    role: 'model-developer',
    intent: '夹具：三格全部兑现，coding 一格部分兑现',
    applicabilityNote: null,
    dimensionIntent: { deals: '官方来源的优惠', coding: '订阅档位', api: '按量计费', models: '当前模型' },
    currentTargets: [
      { dimension: 'deals', source: 'Alpha Official' },
      { dimension: 'coding', planName: 'Alpha Free' },
      { dimension: 'coding', planName: 'Alpha Max（盘上没有）' },
      { dimension: 'coding', planName: 'Alpha Pro' },
      { dimension: 'api', modelKey: 'alpha-1' },
      { dimension: 'models', registrySlug: 'alpha-1' }
    ],
    rulings: [],
    note: null
  },
  {
    provider: 'beta',
    tier: 'major',
    role: 'inference-platform',
    intent: '夹具：延期的两格永不算 MISSING',
    applicabilityNote: 'deals 不适用：这家在 deals 侧没有独立身份。',
    dimensionIntent: { deals: null, coding: '订阅档位', api: '按量计费（延期）', models: '当前模型（schema 表达不了）' },
    currentTargets: [],
    rulings: [
      { dimension: 'api', decision: 'deferred', reason: '按区域分档，口径待裁决', revisitBy: '口径裁决后复查' },
      { dimension: 'models', decision: 'schema-not-supported', reason: '当前 schema 表达不了这类身份', revisitBy: null }
    ],
    note: null
  },
  {
    provider: 'delta',
    tier: 'major',
    role: 'coding-product',
    intent: '夹具：来源全坏且无记录',
    applicabilityNote: 'coding / api / models 不适用：夹具里只关心 deals 这一格。',
    dimensionIntent: { deals: '官方来源的优惠', coding: null, api: null, models: null },
    currentTargets: [
      { dimension: 'deals', source: 'Delta Official' }
    ],
    rulings: [],
    note: null
  },
  {
    provider: 'gamma',
    tier: 'long-tail',
    role: 'tool-vendor',
    intent: '夹具：不可核 / 真缺口 / 归属不符',
    applicabilityNote: 'deals 不适用：这家在 deals 侧没有独立身份。',
    dimensionIntent: { deals: null, coding: '订阅档位（不可核）', api: '按量计费', models: '当前模型（声明了一条不属于它的）' },
    currentTargets: [
      { dimension: 'models', registrySlug: 'alpha-1' }
    ],
    rulings: [
      { dimension: 'coding', decision: 'unverifiable', reason: '官方页渲染不出价格表', revisitBy: null }
    ],
    note: null
  }
];
const FIXTURE_DOC = { schemaVersion: ct.SCHEMA_VERSION, reviewedAt: '2026-10-04', targets: FIXTURE_TARGETS };

const fixtureProblems = ct.validateTargets(FIXTURE_DOC, {
  providerTable: FIXTURE_PROVIDERS,
  modelsTable: FIXTURE_MODELS,
  knownSources: ['Alpha Official', 'Delta Official']
});
check(`夹具本身是合法输入（0 处问题，实际 ${fixtureProblems.length} 处）`, fixtureProblems.length === 0,
  fixtureProblems.slice(0, 3).join('；'));

const fixtureDerived = ct.deriveTargets(FIXTURE_DOC, FIXTURE_FACTS);
const cell = (provider, dimension) => fixtureDerived.targets.find(row => row.provider === provider).dimensions[dimension];

check('COVERED：声明的 current target 全部兑现（deals / api / models 三格）',
  ['deals', 'api', 'models'].every(dimension => cell('alpha', dimension).state === ct.STATES.COVERED));
check('PARTIAL：声明三条只兑现两条 ⇒ PARTIAL（不是 COVERED，也不是 MISSING）',
  cell('alpha', 'coding').state === ct.STATES.PARTIAL
  && cell('alpha', 'coding').declared === 3 && cell('alpha', 'coding').resolved === 2,
  `实得 ${cell('alpha', 'coding').state}（${cell('alpha', 'coding').resolved}/${cell('alpha', 'coding').declared}）`);
check('PARTIAL 的未兑现项逐条给出理由（哪一条没兑现、为什么）',
  cell('alpha', 'coding').items.filter(item => !item.resolved)
    .every(item => typeof item.reason === 'string' && item.reason.length > 0));
check('MISSING：可覆盖、未延期、来源健康，但盘上一条记录都没有（beta.coding）',
  cell('beta', 'coding').state === ct.STATES.MISSING && cell('beta', 'coding').present === 0);
check('【关键牙】DEFERRED 永不算 MISSING：beta.api 延期且盘上无记录 ⇒ DEFERRED',
  cell('beta', 'api').state === ct.STATES.DEFERRED, `实得 ${cell('beta', 'api').state}`);
check('【关键牙】schema-not-supported 同样归 DEFERRED（当前 schema 表达不了 ≠ 漏了）',
  cell('beta', 'models').state === ct.STATES.DEFERRED, `实得 ${cell('beta', 'models').state}`);
check('UNVERIFIABLE：查过、官方来源不可核 ⇒ 不算 MISSING（gamma.coding）',
  cell('gamma', 'coding').state === ct.STATES.UNVERIFIABLE, `实得 ${cell('gamma', 'coding').state}`);
check('NOT_APPLICABLE：维度标 null ⇒ 不适用，且理由来自 applicabilityNote',
  cell('beta', 'deals').state === ct.STATES.NOT_APPLICABLE && /没有独立身份/.test(cell('beta', 'deals').reason));
check('BLOCKED_SOURCE：声明的来源全部不健康且盘上无记录 ⇒ 不算 MISSING（delta.deals）',
  cell('delta', 'deals').state === ct.STATES.BLOCKED_SOURCE, `实得 ${cell('delta', 'deals').state}`);
check('BLOCKED_SOURCE 只在"无记录 + 来源全坏"时成立：alpha.deals 来源健康 ⇒ COVERED',
  cell('alpha', 'deals').state === ct.STATES.COVERED);
check('声明了 registry 里存在但**归属别家**的模型 ⇒ 不算兑现，逐条给出归属理由（gamma.models）',
  cell('gamma', 'models').state === ct.STATES.MISSING
  && cell('gamma', 'models').items[0].resolved === false
  && /归属/.test(cell('gamma', 'models').items[0].reason),
  `实得 ${cell('gamma', 'models').state} / ${cell('gamma', 'models').items[0].reason}`);
check('MISSING / DEFERRED 的优先级：延期盖过"盘上无记录"',
  cell('beta', 'api').state === ct.STATES.DEFERRED && cell('gamma', 'api').state === ct.STATES.MISSING);
check('overallState：按"需要人来看"的优先级挑一格代表 provider（beta 有 MISSING 一格 ⇒ MISSING 压过 DEFERRED）',
  fixtureDerived.targets.find(row => row.provider === 'beta').overall === ct.STATES.MISSING);
check('overallState：BLOCKED_SOURCE 压过 NOT_APPLICABLE（delta）',
  fixtureDerived.targets.find(row => row.provider === 'delta').overall === ct.STATES.BLOCKED_SOURCE);
check('overallState：四格都好 ⇒ COVERED（alpha 的 COVERED/NOT_APPLICABLE/PARTIAL 里 PARTIAL 优先）',
  fixtureDerived.targets.find(row => row.provider === 'alpha').overall === ct.STATES.PARTIAL);
check('states 计数 == 派生行数（不多不少）',
  Object.values(fixtureDerived.states).reduce((sum, n) => sum + n, 0) === fixtureDerived.rows.length);
check('七态在夹具里**全部出现过**',
  Object.values(ct.STATES).every(state => fixtureDerived.rows.some(row => row.state === state)),
  Object.values(ct.STATES).filter(state => !fixtureDerived.rows.some(row => row.state === state)).join(', '));

/* ------------------------------------------------------------------ */
/* ③ 牙：变异即红                                                       */
/* ------------------------------------------------------------------ */

section('③ 牙（每一条变异都必须让 validateTargets 报红）');

const baseCtx = {
  providerTable: FIXTURE_PROVIDERS,
  modelsTable: FIXTURE_MODELS,
  knownSources: ['Alpha Official', 'Delta Official']
};
const problemsOf = (doc, ctx = {}) => ct.validateTargets(doc, { ...baseCtx, ...ctx });
const red = (name, doc, needle, ctx) => {
  const found = problemsOf(doc, ctx);
  check(`【牙】${name}`, found.length > 0 && (!needle || found.some(problem => problem.includes(needle))),
    found.length ? `Problems: ${found.slice(0, 2).join('；')}` : '没有报红');
};

const mutate = (fn) => { const doc = clone(FIXTURE_DOC); fn(doc); return doc; };
const targetOf = (doc, provider) => doc.targets.find(target => target.provider === provider);

red('provider 指向不存在的身份 → 红', mutate(doc => { targetOf(doc, 'alpha').provider = 'nope'; }),
  '不在 scripts/data/providers.json');
red('registrySlug 指向不存在的模型 → 红', mutate(doc => {
  const alpha = targetOf(doc, 'alpha');
  alpha.currentTargets = sortCurrentTargets(alpha.currentTargets.concat([{ dimension: 'models', registrySlug: 'ghost-1' }]));
}), '不在 scripts/data/models.json');
red('deals source 编造一个不存在的来源 → 红', mutate(doc => {
  const alpha = targetOf(doc, 'alpha');
  alpha.currentTargets = sortCurrentTargets(alpha.currentTargets
    .filter(item => item.dimension !== 'deals')
    .concat([{ dimension: 'deals', source: 'Ghost Source' }]));
}), '不是真实存在过的采集来源');
red('身份层有 provider，意图层少一行 → 红（双向对账）',
  FIXTURE_DOC, '没有任何一行意图', { providerTable: { ...FIXTURE_PROVIDERS, epsilon: { name: 'Epsilon', slug: 'epsilon' } } });
red('手写状态字段（state）→ 红', mutate(doc => { targetOf(doc, 'alpha').state = 'COVERED'; }), '手写状态字段');
red('手写 selfStatus → 红（研究结论要写成 rulings，不是状态字段）',
  mutate(doc => { targetOf(doc, 'alpha').selfStatus = 'adopted'; }), '手写状态字段');
red('deferred 缺 revisitBy（复查条件）→ 红', mutate(doc => {
  targetOf(doc, 'beta').rulings[0].revisitBy = null;
}), '必须写 revisitBy');
red('标了"不适用"却没写 applicabilityNote → 红', mutate(doc => {
  targetOf(doc, 'beta').applicabilityNote = null;
}), '必须写 applicabilityNote');
red('同一个维度两条裁决 → 红', mutate(doc => {
  targetOf(doc, 'beta').rulings.push({ dimension: 'api', decision: 'unverifiable', reason: '再来一条', revisitBy: null });
}), '有不止一条裁决');
red('dimensionIntent 缺一个维度 → 红', mutate(doc => {
  delete targetOf(doc, 'alpha').dimensionIntent.api;
}), '四个维度必须逐个表态');
red('currentTargets 词汇表不匹配（models 写成 modelKey）→ 红', mutate(doc => {
  targetOf(doc, 'alpha').currentTargets.push({ dimension: 'models', modelKey: 'alpha-1' });
}), '未知字段');
red('给"不适用"的维度写裁决 → 红', mutate(doc => {
  targetOf(doc, 'beta').rulings.push({ dimension: 'deals', decision: 'deferred', reason: '不该在这里', revisitBy: 'x' });
}), '不适用维度');
red('targets 记录顺序不是规范序 → 红', mutate(doc => { doc.targets.reverse(); }), '不是规范序');
red('currentTargets 顺序不是规范序 → 红', mutate(doc => { targetOf(doc, 'alpha').currentTargets.reverse(); }), '不是规范序');
red('未知字段 → 红', mutate(doc => { targetOf(doc, 'alpha').foo = 1; }), '未知字段');
red('intent 为空 → 红', mutate(doc => { targetOf(doc, 'alpha').intent = ''; }), 'intent 不能为空');
red('tier 非法 → 红', mutate(doc => { targetOf(doc, 'alpha').tier = 'platinum'; }), 'tier 非法');
red('rulinss 不是数组 → 红', mutate(doc => { targetOf(doc, 'alpha').rulings = null; }), 'rulings 必须是数组');
red('顶层 schemaVersion 不对 → 红', mutate(doc => { doc.schemaVersion = 99; }), 'schemaVersion 应为');
red('顶层未知字段 → 红', mutate(doc => { doc.extra = true; }), '顶层未知字段');
red('【原文牙】引用重复键 → 红',
  FIXTURE_DOC, '重复出现', { duplicateKeys: ['targets[0] 的键 "provider" 重复出现'] });
red('空表（一条意图都没有）→ 红', { schemaVersion: ct.SCHEMA_VERSION, reviewedAt: null, targets: [] }, '一条 target 都没有');

// 反向牙：**没覆盖到不算校验错误**（那是派生结论，不是输入错误）
const declaredButMissing = mutate(doc => {
  targetOf(doc, 'gamma').currentTargets = [{ dimension: 'coding', planName: 'Gamma Ultra（盘上没有）' }];
});
check('【反向牙】声明了一条盘上没有的 current target 不是校验错误 —— 它是 PARTIAL/MISSING 的事实',
  problemsOf(declaredButMissing).length === 0
  && ct.deriveTargets(declaredButMissing, FIXTURE_FACTS)
    .targets.find(row => row.provider === 'gamma').dimensions.coding.state === ct.STATES.UNVERIFIABLE);
// （gamma.coding 有 unverifiable 裁决 ⇒ 裁决优先；换 beta.coding 看 MISSING）
const betaDeclared = mutate(doc => {
  targetOf(doc, 'beta').currentTargets = [{ dimension: 'coding', planName: 'Beta Max（盘上没有）' }];
});
check('【反向牙】声明落空 + 盘上无记录 ⇒ MISSING（不是校验错误）',
  problemsOf(betaDeclared).length === 0
  && ct.deriveTargets(betaDeclared, FIXTURE_FACTS)
    .targets.find(row => row.provider === 'beta').dimensions.coding.state === ct.STATES.MISSING);

/* --- 重复键检测器（纯函数，直测） --- */
const dupScan = ct.duplicateKeysDeep('{"a":{"b":1,"b":2},"c":[{"d":1,"d":2}]}');
check('重复键检测器认得嵌套对象里的重复键（含数组下标路径）',
  dupScan.some(text => /^a 的键 "b"/.test(text)) && dupScan.some(text => /^c\[0\] 的键 "d"/.test(text)), dupScan.join('；'));
check('重复键检测器认得顶层重复键（路径为空时报顶层）',
  ct.duplicateKeysDeep('{"targets":[],"targets":[]}').some(text => /^\(顶层\) 的键 "targets"/.test(text)));
check('重复键检测器不把字符串值误当键', ct.duplicateKeysDeep('{"a":":","b":"x"}').length === 0);
const dupFile = path.join(os.tmpdir(), `coverage-targets-dup-${process.pid}.json`);
fs.writeFileSync(dupFile, '{"schemaVersion":1,"reviewedAt":null,"targets":[],"targets":[]}\n');
const dupLoaded = ct.load(dupFile);
fs.unlinkSync(dupFile);
check('load() 从**原文**扫出重复键并交给校验收口',
  dupLoaded.duplicateKeys.length > 0
  && ct.validateTargets(dupLoaded.doc, { duplicateKeys: dupLoaded.duplicateKeys })
    .some(problem => problem.includes('重复出现')));

/* ------------------------------------------------------------------ */
/* ④ 端到端契约：report:coverage --json                                 */
/* ------------------------------------------------------------------ */

section('④ 端到端：report:coverage（文本 + deterministic JSON）');

/**
 * 跑一次报告并取回它的 stdout。
 *
 * 为什么**不再**用 `spawnSync({encoding:'utf8'})` 直接读 stdout：报告在 `--json` 下的 stdout
 * 约 218 KB，超过管道缓冲；父进程若没及时排空管道，子进程已经写到管道里的尾巴会**静默丢失**
 * （实测 CI(Linux/Node 24.21) 只拿到 152,627 字符 / 185,186 字节，且正好切在一个多字节字符中间）。
 * 截断的 JSON 解析必然失败，于是「（隔离上游）JSON 可解析」在 CI 红、在本机绿 —— 那是一条
 * **与产品无关、只与取数方式有关**的假红。
 *
 * 改成让子进程把 stdout 直接写进**文件**（fd 重定向，不经管道），再整份读回：取到的字节
 * 与子进程真正写出的字节完全一致，不受管道缓冲影响。stderr 仍走管道（它很小，用于报错）。
 */
function runReport(args) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coverage-report-stdout-'));
  const stdoutFile = path.join(dir, 'stdout.txt');
  const fd = fs.openSync(stdoutFile, 'w');
  let result;
  try {
    result = spawnSync(process.execPath, [REPORT, ...args], {
      cwd: ROOT, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, stdio: ['ignore', fd, 'pipe']
    });
  } finally {
    fs.closeSync(fd);
  }
  const stdout = fs.existsSync(stdoutFile) ? fs.readFileSync(stdoutFile, 'utf8') : '';
  return { status: result.status, stdout, stderr: result.stderr || '' };
}

function jsonOf(stdout) {
  const marker = '\nJSON:\n';
  const at = stdout.indexOf(marker);
  if (at < 0) return null;
  const rest = stdout.slice(at + marker.length);
  const end = rest.lastIndexOf('\n✅');
  try {
    return JSON.parse(end < 0 ? rest : rest.slice(0, end));
  } catch (error) {
    return null;
  }
}

const plain1 = runReport(['--json']);
const plain2 = runReport(['--json']);
check('【确定性】两次 `report:coverage --json` 输出逐字节一致',
  plain1.stdout === plain2.stdout && plain1.status === plain2.status,
  `status ${plain1.status}/${plain2.status}，长度 ${plain1.stdout.length}/${plain2.stdout.length}`);
check('【确定性】退出码在两次运行里一致', plain1.status === plain2.status, `${plain1.status} / ${plain2.status}`);

// 本层不许给报告引入任何自检问题。别的层此刻可能在飞（例如 registry schemaVersion 迁移），
// 那些问题**逐条打印出来**，但不许与本层混为一谈：报告 allow 上游红，不许 allow 本层红。
const plainProblems = plain1.stderr.split('\n').filter(text => text.trim().startsWith('- ')).map(text => text.trim().slice(2));
const targetOwnProblems = plainProblems.filter(text => /coverage-targets|Target 层|意图层/.test(text));
check('本层不引入任何报告自检问题（上游在飞的问题逐条打印，不计在本层）',
  targetOwnProblems.length === 0, targetOwnProblems.slice(0, 3).join('；'));
if (plainProblems.length) {
  console.log(`    ℹ 本次运行里来自上游（非本层）的自检问题 ${plainProblems.length} 处：`);
  plainProblems.slice(0, 6).forEach(text => console.log(`       · ${text}`));
}

// JSON 结构契约（t25 升级）：**旧键必须是前缀（逐字逐序）+ 追加键必须恰好等于一张显式白名单**。
//
// 为什么不再是全等断言：报告从这一轮起要新增 API 侧处置的键（`mappedApiEntries` /
// `declaredApiEntries` / `declaredApiEntryRows` / `gaps.declaredApiEntryCount`），追加在既有键之后。
// 全等会把**合法的追加**与**偷偷改名/挪位**判成同一件事；而放宽成全等会丢掉冻结的意义。
// 于是契约收紧成两条规则（规则本身是下面的纯函数，反证牙与真实断言共用同一支）：
//   ① 旧键的名字与顺序必须逐字逐序地出现在最前面（前缀）；
//   ② 多出来的键必须**恰好**等于白名单（多一个、少一个、换个顺序都红）。
// 这一层最该防的是"新增键时顺手把旧键挪了位"——那种改动不会有任何报错，只会让下游的
// 位置假设静默失效（§42 冻结契约的理由）。
const LEGACY_CONTRACT = {
  deals: ['providers', 'currentDeals', 'expiredDeals', 'tools', 'providerRows'],
  coding: ['providers', 'plans', 'providerRows'],
  api: ['providers', 'pricingRecords', 'modelPricingItems', 'distinctModelKeys', 'providerRows'],
  registry: ['registryPresent', 'linksPresent', 'gapsPresent', 'unmappedModels', 'planModelStrings',
    'mappedPlanModelCount', 'unmappedPlanModels', 'declaredPlanModels'],
  gaps: ['dealsWithoutPlans', 'plansWithoutDeals', 'unmappedModelCount', 'unmappedPlanModelCount',
    'declaredPlanModelCount', 'notAdoptedProviders'],
  candidates: ['total', 'adopted', 'notAdopted'],
  // t46 起把 v2 那一块也冻住：`coverageTargets` 是**新键**，但它自己内部的键序同样只许"追加在既有键之后"
  // （R4 五态普查就是追加在 `freshness` 之后的）。嵌套节用点分路径寻址（见 `valueAt()`）。
  coverageTargets: ['file', 'present', 'schemaVersion', 'reviewedAt', 'validationProblemCount', 'validationProblems',
    'stateOrder', 'states', 'universe', 'dimensions', 'rows', 'missingTargets', 'partialTargets', 'deferred',
    'unverifiable', 'notApplicable', 'blockedBySourceHealth', 'currentModels', 'sourceHealth', 'freshness'],
  'coverageTargets.sourceHealth': ['declaredSources', 'unhealthyDeclaredSources', 'blockedTargets']
};
const LEGACY_TOP_LEVEL = ['generatedAt', 'deals', 'coding', 'api', 'registry', 'gaps', 'candidates'];
/**
 * 追加键白名单：报告新增键必须**逐个登记在这里**（t25 = API 侧处置键；t46 = R4 五态普查 + 候选明细 + 来源宇宙）。
 *
 * 语义锚点（t29 补；t46 追加；v3 再追加）——白名单里各键**锚在哪个读数**上：
 *   · `registry.mappedApiEntries`     = lib `coverageOf().mappedApiEntries`（**数**：展开后被映射认领的计价条目数 = 方程的 A）
 *   · `registry.declaredApiEntries`   = lib `coverageOf().declaredApiIdentities`（**数**：展开后被处置声明覆盖的计价条目数 = 方程的 B）
 *   · `registry.declaredApiEntryRows` = lib `coverageOf().declaredApiEntries`（**数组**：声明本身逐条留档，长度 = 声明条数）
 *   · `gaps.declaredApiEntryCount`    = 上面的 `declaredApiEntryRows.length`（**数**；**不是**方程的 B）
 *   · `coverageTargets.catalogStatusCensus` = 五态普查：词表 = lib `CATALOG_STATUSES`、逐条值 = 发布产物
 *       `models.json` 的 `catalogStatus`、计数 = lib `censusOf()`；`sum` **必须等于** `currentModels.registryModels`
 *   · `candidates.rows`               = 候选来源审查的**逐条明细**（url / checkedAt / 是否采信 / 失败原因），
 *       排序 = provider → url → checkedAt → slug 的 code-unit 序
 *   · `coverageTargets.sourceHealth.{registryRowCount,registryRows,registryOnlySources}` = R8 的来源宇宙对照
 *       （注册表几行 / 本节收几行 / 差集是哪几个）
 *   · `coverageTargets.releaseEvidence` = v3 第①节：registry 模型数 / 已知 releasedAt / 未知 / 已知率，
 *       并**按 developer、modelRole、catalogStatus 三维拆分**；判据全部来自 lib（`releaseDateOf()` /
 *       `resolveModelRole()` / `CATALOG_STATUSES`），报告只分组、不重算口径。百分比是观测指标，不是 KPI。
 *   · `coverageTargets.releaseEvidenceQueue` = v3 第②节：只读的"优先补哪几条发布日期"队列，
 *       五条规则原文随队列一起输出；规则①的判据与第①节的 known/unknown **同源**（同一支
 *       `releaseDateOf().provided`），队列条数 = registry 模型数。
 *   · `coverageTargets.gapClosureQueue` = v3 第③节：MISSING / PARTIAL 的 A/B/C/D 分层，
 *       每条带「目标 N / 已兑现 M / 缺 K」；`counts` 之和 == 队列长度 == `states.MISSING + states.PARTIAL`。
 *   · `coverageTargets.sourceReliability` = v3 第④节：`scripts/data/source-rulings.json` 的裁决
 *       × `scripts/data/source-health.json` 的 live 读数（**必须带 healthGeneratedAt**）；
 *       `registryRowCount/registryRows/registryOnlySources` 与 `coverageTargets.sourceHealth` 的那三个键
 *       **逐字相等**（同一口径，不另算一份）；三方对账的问题清单在 `reconciliation.problems` 里。
 * ⚠️ 陷阱：lib 的 `declaredApiEntries`（数组）与报告的 `registry.declaredApiEntries`（数）**同名不同义**；
 *    报告层那个冻结键名已经占了"数"的位置，所以"声明行数组"只能另起一名 `declaredApiEntryRows`。
 *    两层的词是**交叉**的：报告 `registry.declaredApiEntries`（数）↔ lib `declaredApiIdentities`（数）、
 *    报告 `registry.declaredApiEntryRows`（数组）↔ lib `declaredApiEntries`（数组）。
 */
const APPENDED_KEY_WHITELIST = {
  deals: [],
  coding: [],
  api: [],
  registry: ['mappedApiEntries', 'declaredApiEntries', 'declaredApiEntryRows'],
  gaps: ['declaredApiEntryCount'],
  candidates: ['rows'],
  // v3（coverage-depth-v1）：四节新键**追加在 v2 既有键之后**（`catalogStatusCensus` 是 t46 追加的最后一位，
  // 它前面的冻结点一位都没动 —— 这正是 LEGACY_CONTRACT 那一条前缀判据的意义）。
  coverageTargets: ['catalogStatusCensus', 'releaseEvidence', 'releaseEvidenceQueue', 'gapClosureQueue', 'sourceReliability'],
  'coverageTargets.sourceHealth': ['registryRowCount', 'registryRows', 'registryOnlySources']
};

/** 点分路径取值（契约表里的嵌套节用 `a.b.c` 寻址）；取不到 ⇒ undefined（由契约判据判"缺键"） */
function valueAt(node, dotted) {
  return String(dotted).split('.').reduce((current, key) => (current === null || current === undefined ? undefined : current[key]), node);
}

/**
 * t12（修复 T6-F1）：**API 侧处置记账的判据**。返回问题列表（空 = 通过）。
 *
 * 为什么要有这一支：原来这里是一条**跨语义等值**断言
 * `registry.declaredApiEntries === gaps.declaredApiEntryCount`，它把两个**不同语义**的量拿来比：
 *
 *   · `registry.declaredApiEntryRows.length` / `gaps.declaredApiEntryCount` = **声明行数**
 *     （同一批声明行的两种视图，见白名单注释：它"**不是**方程里的 B"）；
 *   · `registry.declaredApiEntries`                                     = **展开后的计价条目数**（方程里的 B）。
 *
 * `variant: null` 的**通配声明**会一行展开成多条（见 lib `sourcePricingIdentitiesOf()`：
 * 通配 = 该记录中这个 modelKey 的全部真实变体）⇒ 两者只在「一条通配声明都没有」时巧合相等。
 * 2026-10-05 的 T6-F1 就是这么发生的：并发成员加了一条通配声明（1 行 / 2 个变体），
 * 合法数据把这条断言顶红。修法不是删掉它，而是换成三条**一般成立**的关系（严格更强）：
 *
 *   ① 同一批声明行的两种视图必须相等：`rows.length === gaps.declaredApiEntryCount`；
 *   ② 展开只会让计价条目数**不少于**声明行数：`declaredApiEntries >= rows.length`
 *      （通配一行展开多条 ⇒ 可以大于；某一行一条 identity 都没覆盖 ⇒ 才会小于 ⇒ 必红）；
 *   ③ 方程仍必须闭合：`A + B + C === items`（原样保留，不许因本次修复丢掉）；
 *   ④ 载荷里的行数必须与**现读的文件**逐字对上：`rows.length === expectedDeclarationRows`
 *      （调用方把 `scripts/data/model-registry-gaps.json` 现场数一遍传进来 —— 这是"文件 ↔ 载荷"的
 *      独立第二读数，不是把载荷里的数再抄一遍）；
 *   ⑤ 展开数超出行数的部分必须**恰好等于**通配声明多覆盖的变体数：`B - rows.length === wildcardSurplus`
 *      （逐格复算：每一条 `variant: null` 的行贡献 `该 modelKey 真实变体数 - 1`；没有通配行时两边都是 0）。
 *
 * ④ 与 ⑤ 是 t7 审查（F3）之后补的：原来的第三条检查写成了
 * `X === Y + (X - Y)`（把差值加回去），那是**代数恒真式** —— 永远绿、永远不会红，连被它替掉的
 * 旧断言都不如。凡是要"证明自洽"的地方，都必须拿**另一个来源**的数来比（④ 拿文件、⑤ 拿逐格复算），
 * 而不是把同一个数拆成两项再加回去。
 *
 * **只有这一处实现**：下面的真实断言与全部反证牙（含 5 种变异与「旧断言漏抓/假红」对照）都调它。
 *
 * @param {object} registryBlock 报告 JSON 的 `registry` 节
 * @param {object} gapsBlock     报告 JSON 的 `gaps` 节
 * @param {object} apiBlock      报告 JSON 的 `api` 节
 * @param {{expectedDeclarationRows?:number, wildcardSurplus?:number}} [context] ④⑤ 的独立输入（缺省则不判那一条）
 */
function apiDispositionProblems(registryBlock, gapsBlock, apiBlock, context = {}) {
  const problems = [];
  const rows = registryBlock && registryBlock.declaredApiEntryRows;
  if (!Array.isArray(rows)) {
    return ['逐条留档 declaredApiEntryRows 必须是数组（声明行没有出口 ⇒ 下面的两条关系无从核对）'];
  }
  const declaredRowCount = gapsBlock && gapsBlock.declaredApiEntryCount;
  if (rows.length !== declaredRowCount) {
    problems.push(`① 声明行的两种视图不等：registry.declaredApiEntryRows.length=${rows.length} ≠ gaps.declaredApiEntryCount=${declaredRowCount}`);
  }
  const expanded = registryBlock.declaredApiEntries;
  if (!(expanded >= rows.length)) {
    problems.push(`② 展开后的计价条目数 ${expanded} < 声明行数 ${rows.length} —— 展开只会让条目数不少于行数（variant:null 一行展开多条）；小于说明有声明行一条 identity 都没覆盖到位（或两个视图本来就是不同的量）`);
  }
  const sum = registryBlock.mappedApiEntries + registryBlock.declaredApiEntries + gapsBlock.unmappedModelCount;
  if (sum !== apiBlock.modelPricingItems) {
    problems.push(`③ API 侧记账不闭合：A ${registryBlock.mappedApiEntries} + B ${registryBlock.declaredApiEntries} + C ${gapsBlock.unmappedModelCount} = ${sum} ≠ 计价条目 ${apiBlock.modelPricingItems}`);
  }
  if (Number.isInteger(context.expectedDeclarationRows) && rows.length !== context.expectedDeclarationRows) {
    problems.push(`④ 载荷里的声明行数 ${rows.length} ≠ 现读文件里的 API 侧声明行数 ${context.expectedDeclarationRows} —— 载荷与盘上文件必须逐字对上（两边各数一遍，不是同一个数抄两处）`);
  }
  if (Number.isInteger(context.wildcardSurplus)) {
    const surplus = expanded - rows.length;
    if (surplus !== context.wildcardSurplus) {
      problems.push(`⑤ 展开数超出行数的部分 ${surplus} ≠ 逐格复算出来的通配多余覆盖 ${context.wildcardSurplus} —— 展开的增量只能来自 variant:null 行（每行贡献"该 modelKey 真实变体数 − 1"），别处冒出来的增量必红`);
    }
  }
  return problems;
}

/**
 * t12-⑤ 的**独立复算**：声明行里那些 `variant: null` 的通配行，各自多覆盖了几个变体。
 *
 * 这不是把 `declaredApiEntries - rows.length` 抄一遍 —— 走的是**另一条来源**：拿 api-plans 逐条
 * 数真实变体（与 lib `realVariantsOf()` 同一口径，但这里现场重算一份，用来与载荷里的 B 对账）。
 * 一条通配行覆盖 k 个真实变体时，它对 B 的贡献是 k、对行数的贡献是 1 ⇒ 多余覆盖 = k − 1。
 */
function wildcardSurplusOf(rows, apiDoc) {
  const plans = Array.isArray(apiDoc && apiDoc.plans) ? apiDoc.plans : [];
  let surplus = 0;
  for (const row of (Array.isArray(rows) ? rows : [])) {
    if (!row || !(row.variant === null || row.variant === undefined)) continue;
    const plan = plans.find(item => item && item.id === row.apiPlanId) || null;
    if (!plan) continue;
    const realVariants = new Set((plan.models || [])
      .filter(model => model && model.modelKey === row.modelKey && model.variant !== null && model.variant !== undefined)
      .map(model => String(model.variant)));
    surplus += Math.max(0, realVariants.size - 1);
  }
  return surplus;
}

/**
 * v3③：**MISSING 行的判据**。返回问题列表（空 = 通过）。**只有这一处实现**，反证牙也调它。
 *
 * 为什么要有这一支（t7-F1）：原来这条检查写成
 * `gapQueue.filter(row => row.state === 'MISSING').every(row => row.present === 0)`。
 * 语法上完全正确，但本轮缺口收口之后 MISSING = 0 ⇒ `filter` 出**空集** ⇒ `every` 在空集上**恒真**
 * ⇒ 这条检查已经**永远绿**了。它不会报错，只会静静地把一格保护力交出去 —— 比"没有这条检查"更坏，
 * 因为它读起来像有人在看着。
 *
 * 修法是两条各自可证伪的判据：
 *   ① 集合大小必须与 `states.MISSING` 计数相等（空集也必须对上 0 —— 把"没有行"这件事本身钉住）；
 *   ② 集合里每一格 `present` 必须为 0。
 * 两条都能被"扰动一格 present"或"把计数改一位"打红（见 t12 交付里的可证伪性对照表）。
 */
function missingRowsProblems(rows, expectedCount) {
  const problems = [];
  const missing = (Array.isArray(rows) ? rows : []).filter(row => row && row.state === 'MISSING');
  if (Number.isInteger(expectedCount) && missing.length !== expectedCount) {
    problems.push(`MISSING 行集合大小 ${missing.length} ≠ states.MISSING 计数 ${expectedCount} —— 两处读数必须一致（空集也要对上 0，不许靠"没有行"蒙过去）`);
  }
  const withRecords = missing.filter(row => row.present !== 0);
  if (withRecords.length) {
    problems.push(`有 ${withRecords.length} 格 MISSING 却在盘上有记录（present ≠ 0）：${withRecords.slice(0, 3).map(row => `${row.provider}/${row.dimension}=${row.present}`).join('、')} —— MISSING 的定义是"可覆盖、未延期、来源健康，但盘上一条都没有"`);
  }
  return problems;
}

/**
 * t12：**每一条 API 侧声明行的逐条留档都要能按 `(apiPlanId, modelKey, variant)` 逐字对回 api-plans 记录**。
 * 返回问题列表（空 = 通过）。**只有这一处实现**，反证牙也调它。
 *
 * 为什么要有它：关系式 ② 只保证「展开数 ≥ 行数」，它**不能**单独抓住「用一条对不上的声明凑数」——
 * 例如一条通配声明指向不存在的 modelKey：它一条 identity 都没覆盖，但如果同时还有别的行多覆盖了几条，
 * ② 的总量关系可能仍然成立。所以这里逐行回查**声明本身站不站得住**（与 ② 是两个正交的口径）：
 *   · apiPlanId 必须在 api-plans.json 里；
 *   · 该记录里必须有这个 modelKey；
 *   · 显式 variant 必须是该 modelKey 的**真实变体**；通配（null）必须至少匹配到 1 条真实变体。
 * 逐字（`===`）比对，不做任何归一 —— 声明是"逐字引用计价记录"的登记表。
 */
function apiDeclarationRowProblems(rows, apiDoc) {
  const problems = [];
  if (!Array.isArray(rows)) return ['逐条留档 declaredApiEntryRows 必须是数组'];
  const plans = Array.isArray(apiDoc && apiDoc.plans) ? apiDoc.plans : [];
  rows.forEach((row, index) => {
    const where = `declaredApiEntryRows[${index}]`;
    if (!row || typeof row !== 'object') { problems.push(`${where}: 必须是对象`); return; }
    const spot = `${where} ${row.apiPlanId}/${row.modelKey}/${row.variant === undefined ? 'undefined' : row.variant}`;
    const plan = plans.find(item => item && item.id === row.apiPlanId) || null;
    if (!plan) { problems.push(`${spot}: apiPlanId「${row.apiPlanId}」不在 api-plans.json 里 —— 声明行必须指向真实存在的计价记录`); return; }
    const models = (plan.models || []).filter(item => item && item.modelKey === row.modelKey);
    if (!models.length) { problems.push(`${spot}: modelKey「${row.modelKey}」不在记录 ${plan.id} 里 —— 这条声明对不上任何计价条目`); return; }
    const realVariants = [...new Set(models.map(item => item.variant).filter(variant => variant !== null && variant !== undefined))];
    if (row.variant === null || row.variant === undefined) {
      if (!realVariants.length) problems.push(`${spot}: 通配声明在记录 ${plan.id} 里一条真实变体都没匹配到 —— 它什么都没声明（不许用通配兜底一条对不上的声明）`);
    } else if (!models.some(item => item.variant === row.variant)) {
      problems.push(`${spot}: variant「${row.variant}」不是记录 ${plan.id} 的 modelKey「${row.modelKey}」真实变体（实得 ${JSON.stringify([...new Set(models.map(item => item.variant))])}）`);
    }
  });
  return problems;
}

/**
 * t12：**旧断言**（被修掉的那条）的纯函数版本 —— 只用于对照，**不是判据**。
 *
 * 为什么要把已经删掉的写法再写一遍：验收要求「证明新断言抓得住旧断言抓得住的一切」。
 * 唯一能证明的方式就是让两支判据跑同一批输入、把差异逐条摆出来：
 *   · 旧断言**漏抓**的（两种视图脱钩而 B == count 仍成立）⇒ 新断言必红、旧断言绿；
 *   · 旧断言**假红**的（合法通配态 B > 行数）⇒ 旧断言红、新断言绿 —— T6-F1 本体；
 *   · 真正该红的（B < 行数 / 方程不闭合 / 行数与计数脱钩）⇒ 两支都红。
 */
function legacyT25Problems(registryBlock, gapsBlock, apiBlock) {
  const problems = [];
  if (registryBlock.declaredApiEntries !== gapsBlock.declaredApiEntryCount) {
    problems.push('旧断言：展开后的计价条目数 ≠ 声明行数');
  }
  if (registryBlock.mappedApiEntries + registryBlock.declaredApiEntries + gapsBlock.unmappedModelCount !== apiBlock.modelPricingItems) {
    problems.push('旧断言：方程不闭合');
  }
  if (!Array.isArray(registryBlock.declaredApiEntryRows)) problems.push('旧断言：逐条留档不是数组');
  return problems;
}

/** 冻结契约判据：返回问题列表（空 = 通过）。**只有这一处实现**，反证牙也调它。 */
function contractProblems(actualKeys, legacyKeys, whitelist) {
  const problems = [];
  const prefix = actualKeys.slice(0, legacyKeys.length);
  if (JSON.stringify(prefix) !== JSON.stringify(legacyKeys)) {
    problems.push(`旧键必须是前缀且逐字逐序（期望 ${legacyKeys.join(',')}；实得 ${prefix.join(',')}）`);
  }
  const appended = actualKeys.slice(legacyKeys.length);
  if (JSON.stringify(appended) !== JSON.stringify(whitelist)) {
    problems.push(`追加键必须恰好等于白名单（期望 [${whitelist.join(',')}]；实得 [${appended.join(',')}]）`);
  }
  return problems;
}

check('【反证牙】冻结契约规则：把旧键顺序打乱 ⇒ 必须报问题',
  contractProblems(['coding', 'deals'], ['deals', 'coding'], []).length > 0);
check('【反证牙】冻结契约规则：删掉一个旧键 ⇒ 必须报问题',
  contractProblems(['deals'], ['deals', 'coding'], []).length > 0);
check('【反证牙】冻结契约规则：追加键不在白名单里 ⇒ 必须报问题',
  contractProblems(['deals', 'coding', 'zzz'], ['deals', 'coding'], []).length > 0);
check('【反证牙】冻结契约规则：白名单里的键少了或顺序不对 ⇒ 必须报问题',
  contractProblems(['deals', 'coding'], ['deals', 'coding'], ['a', 'b']).length > 0
  && contractProblems(['deals', 'coding', 'b', 'a'], ['deals', 'coding'], ['a', 'b']).length > 0);
check('【正向】冻结契约规则：旧键原样 + 白名单内的追加 ⇒ 通过',
  contractProblems(['deals', 'coding', 'extra'], ['deals', 'coding'], ['extra']).length === 0);

// 把上游在飞的问题隔离掉（--links / --gaps 指向临时副本，**只**把顶层 schemaVersion 对齐到
// 当前 registry 值），确认报告成功时 JSON 的键结构完整、两次逐字节一致。
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coverage-report-'));
const isoArgs = [];
try {
  const alignSchemaVersion = (rel, name) => {
    const doc = readJson(rel);
    doc.schemaVersion = registry.MODEL_SCHEMA_VERSION;
    const file = path.join(tmpDir, name);
    fs.writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`);
    return file;
  };
  isoArgs.push(`--links=${alignSchemaVersion('scripts/data/model-registry-links.json', 'links.json')}`);
  isoArgs.push(`--gaps=${alignSchemaVersion('scripts/data/model-registry-gaps.json', 'gaps.json')}`);

  const iso1 = runReport(['--json', ...isoArgs]);
  const iso2 = runReport(['--json', ...isoArgs]);
  const payload1 = jsonOf(iso1.stdout);
  const payload2 = jsonOf(iso2.stdout);
  const isoProblems = iso1.stderr.split('\n').filter(text => text.trim().startsWith('- ')).map(text => text.trim().slice(2));
  check('（隔离上游）报告自检 0 处问题，退出码 0', iso1.status === 0 && iso2.status === 0,
    `status ${iso1.status}/${iso2.status}；问题 ${isoProblems.length} 处：${isoProblems.slice(0, 2).join('；')}`);
  check('（隔离上游）两次运行逐字节一致', iso1.stdout === iso2.stdout && iso1.stdout.length > 0);
  check('（隔离上游）JSON 可解析', Boolean(payload1) && Boolean(payload2));

  if (payload1) {
    const topKeys = Object.keys(payload1);
    check('旧 JSON 顶层键一个不少，且只多出 coverageTargets',
      LEGACY_TOP_LEVEL.every(key => topKeys.includes(key))
      && Object.keys(payload1).filter(key => !LEGACY_TOP_LEVEL.includes(key)).join(',') === 'coverageTargets',
      `顶层键：${topKeys.join(',')}`);
    check('generatedAt 仍是顶层字符串日期', typeof payload1.generatedAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(payload1.generatedAt));
    for (const [section_, keys] of Object.entries(LEGACY_CONTRACT)) {
      const actual = Object.keys(valueAt(payload1, section_) || {});
      const problems = contractProblems(actual, keys, APPENDED_KEY_WHITELIST[section_] || []);
      check(`冻结契约（旧键前缀 + 追加键白名单）：${section_}`, problems.length === 0,
        problems.join('；') || `实得 ${actual.join(',')}`);
    }
    check('【反证牙】点分路径取值器：嵌套取得到、缺一层给 undefined（否则嵌套节会静默变成"空对象 ⇒ 全缺"而报红）',
      valueAt({ a: { b: { c: 1 } } }, 'a.b.c') === 1 && valueAt({ a: {} }, 'a.b.c') === undefined
      && valueAt(null, 'a.b') === undefined);
    // 端到端反证：拿**这一轮真实的 payload** 把键序打乱 / 删掉一个旧键，同一条规则必须红。
    const shuffledRegistry = Object.keys(payload1.registry || {}).slice().reverse();
    check('【反证牙·端到端】真实 payload 的 registry 键序被打乱 ⇒ 同一条契约规则报红',
      contractProblems(shuffledRegistry, LEGACY_CONTRACT.registry, APPENDED_KEY_WHITELIST.registry).length > 0);
    const droppedRegistry = Object.keys(payload1.registry || {}).filter(key => key !== 'linksPresent');
    check('【反证牙·端到端】真实 payload 删掉一个旧键 linksPresent ⇒ 同一条契约规则报红',
      contractProblems(droppedRegistry, LEGACY_CONTRACT.registry, APPENDED_KEY_WHITELIST.registry).length > 0);

    const cov = payload1.coverageTargets;
    check('新键 coverageTargets 结构完整（universe / dimensions / rows / 清单 / currentModels / sourceHealth / freshness）',
      Boolean(cov) && ['file', 'present', 'schemaVersion', 'reviewedAt', 'validationProblems', 'states',
        'universe', 'dimensions', 'rows', 'missingTargets', 'partialTargets', 'deferred', 'unverifiable',
        'notApplicable', 'blockedBySourceHealth', 'currentModels', 'sourceHealth', 'freshness',
        // v3 追加的四个新键：存在性断言（缺一个即红 —— 白名单里的键必须真的出现）
        'releaseEvidence', 'releaseEvidenceQueue', 'gapClosureQueue', 'sourceReliability']
        .every(key => Object.prototype.hasOwnProperty.call(cov, key)),
      Object.keys(cov || {}).join(','));
    check('universe.declared == 意图层行数，且与 providers.json 身份数逐字相等',
      cov.universe.declared === ct.targetsList(targetsLoaded.doc).length
      && cov.universe.declared === Object.keys(providerTable).length);
    check('dimensions 与 rows 自洽：每个维度的状态计数之和 == 该维度行数',
      ct.DIMENSIONS.every(dimension => Object.values(cov.dimensions[dimension]).reduce((sum, n) => sum + n, 0)
        === cov.rows.filter(row => row.dimension === dimension).length));
    check('states 与 rows 自洽：状态计数之和 == 行数',
      Object.values(cov.states).reduce((sum, n) => sum + n, 0) === cov.rows.length);
    check('七态每一项都出现在 states 里（不许少报一种状态）',
      ct.STATE_ORDER.every(state => Object.prototype.hasOwnProperty.call(cov.states, state)));
    check('missingTargets 与 states.MISSING 对得上（清单不是另一份数字）',
      cov.missingTargets.length === cov.states.MISSING);
    check('deferred / unverifiable 清单与 states 对得上',
      cov.deferred.length === cov.states.DEFERRED && cov.unverifiable.length === cov.states.UNVERIFIABLE);
    check('currentModels 的 target 条数与意图层声明逐字相等',
      cov.currentModels.declaredTargets === ct.targetsList(targetsLoaded.doc)
        .reduce((sum, target) => sum + ct.declaredTargetsOf(target, 'models').length, 0));
    check('sourceHealth 的声明来源与意图层写过的 source 一致',
      cov.sourceHealth.declaredSources.map(row => row.name).sort().join('|')
      === ct.targetsList(targetsLoaded.doc)
        .reduce((list, target) => list.concat(ct.declaredTargetsOf(target, 'deals').map(item => item.source)), [])
        .filter((name, index, list) => list.indexOf(name) === index).sort().join('|'));
    check('freshness 块如实反映模块状态（ok / broken / missing 三选一）',
      ['ok', 'broken', 'missing'].includes(cov.freshness.status));

    /* ---- t46 / F1（§41 第 4 条）：Current / Aging / Legacy / Historical / Unknown 五态普查 ---- */
    const census = cov.catalogStatusCensus;
    const publishedModels = readJson('models.json').models;
    check('t46：coverageTargets.catalogStatusCensus 存在，且词表就是 lib 的 CATALOG_STATUSES（判据层单一出处）',
      Boolean(census) && JSON.stringify(census.statusOrder) === JSON.stringify(freshnessLib.CATALOG_STATUSES),
      JSON.stringify(census && census.statusOrder));
    check('t46：五态每一档都与发布产物 models.json 的 catalogStatus 直接过滤一致（不是报告自算的另一份数字）',
      Boolean(census) && census.landed
      && freshnessLib.CATALOG_STATUSES.every(status => census.counts[status]
        === publishedModels.filter(model => model.catalogStatus === status).length)
      && Object.keys(census.counts).join(',') === freshnessLib.CATALOG_STATUSES.join(','),
      JSON.stringify(census && census.counts));
    check('t46：五态之和 == registry 模型数 == 发布产物模型数（不闭合即报告自检非 0）',
      Boolean(census) && census.landed && census.sum === census.registryModels
      && census.registryModels === cov.currentModels.registryModels
      && census.registryModels === publishedModels.length
      && cov.currentModels.registryModels === Object.keys(registryTable).length,
      `sum=${census && census.sum} / registryModels=${census && census.registryModels} / 发布产物 ${publishedModels.length} / registry 表 ${Object.keys(registryTable).length}`);
    check('t46：没有词表外的 catalogStatus 值（未知值不许静默并进 unknown，也不许自己加一档）',
      Boolean(census) && census.statusesOutsideWordList.length === 0,
      JSON.stringify(census && census.statusesOutsideWordList));
    const censusLine = /current (\d+) · aging (\d+) · legacy (\d+) · historical (\d+) · unknown (\d+)（和 (\d+)）/.exec(iso1.stdout);
    const censusTextNumbers = censusLine ? [1, 2, 3, 4, 5, 6].map(index => Number(censusLine[index])) : null;
    check('t46：文本那一行的五态读数与 JSON 的 counts 逐档一致，且「（和 N）」== sum（文本/JSON 不许各说各话）',
      Boolean(censusLine) && Boolean(census) && census.landed
      && freshnessLib.CATALOG_STATUSES.every((status, index) => censusTextNumbers[index] === census.counts[status])
      && censusTextNumbers[5] === census.sum,
      censusLine ? censusLine[0] : '文本里没有五态普查行');

    /* ---- t46 / F2（§42）：候选来源审查的明细同步进 JSON ---- */
    const candidateRows = payload1.candidates.rows;
    check('t46：candidates.rows 逐条带 url / 检查日期 / 是否采信 / 失败原因（这三样此前在 JSON 里各 0 次）',
      Array.isArray(candidateRows) && candidateRows.length === payload1.candidates.total
      && candidateRows.every(row => typeof row.url === 'string' && /^https?:/.test(row.url)
        && typeof row.checkedAt === 'string' && row.checkedAt.length > 0
        && typeof row.decision === 'string' && row.flags && typeof row.flags === 'object')
      && candidateRows.filter(row => row.adopted === true).length === payload1.candidates.adopted
      && candidateRows.filter(row => row.decision === 'not_adopted').length === payload1.candidates.notAdopted
      && candidateRows.filter(row => row.failedReason).length >= payload1.candidates.notAdopted,
      `rows=${Array.isArray(candidateRows) ? candidateRows.length : '(缺)'} / url=${Array.isArray(candidateRows) ? candidateRows.filter(row => /^https?:/.test(String(row.url))).length : 0}`
      + ` / checkedAt=${Array.isArray(candidateRows) ? candidateRows.filter(row => row.checkedAt).length : 0}`
      + ` / failedReason=${Array.isArray(candidateRows) ? candidateRows.filter(row => row.failedReason).length : 0}`);
    check('t46：candidates.rows 排序稳定（两次运行逐字节相同）',
      Array.isArray(candidateRows) && JSON.stringify(payload1.candidates.rows) === JSON.stringify(payload2.candidates.rows));

    /* ---- t46 / F5（R8）：来源宇宙对照 —— 注册表几行 / 本节收几行 / 差集是哪几个 ---- */
    const sh = cov.sourceHealth;
    const declaredHealthNames = sh.declaredSources.map(row => row.name);
    const healthRegistry = readJson('scripts/data/source-health.json').sources;
    check('t46：sourceHealth 追加了来源宇宙对照，且注册表行数 == source-health.json 的实际行数',
      sh.registryRowCount === sh.registryRows.length && sh.registryRowCount === healthRegistry.length,
      `registryRowCount=${sh.registryRowCount} / registryRows=${sh.registryRows.length} / 文件 ${healthRegistry.length} 行`);
    check('t46：差集 == 注册表 ∖ 本节已列（两项相加恰好等于注册表行数，不多不少）',
      sh.registryOnlySources.every(name => sh.registryRows.includes(name))
      && sh.registryOnlySources.length + declaredHealthNames.filter(name => sh.registryRows.includes(name)).length === sh.registryRowCount,
      `差集 ${JSON.stringify(sh.registryOnlySources)} / 本节已列 ${JSON.stringify(declaredHealthNames)}`);

    // t25：报告必须把 API 侧处置如实暴露出来（三者和必须等于计价条目总数，逐项在 JSON 里可核）。
    //
    // t12（修复 T6-F1）：这条检查的**名字没变**（它是冻结标签，下游证据按名引用它），但判据从
    // 一条"只在没有通配声明时巧合成立"的**跨语义等值**换成了 `apiDispositionProblems()` 里的
    // 三条**一般成立**的关系（① 两种视图相等 ② 展开数 ≥ 行数 ③ 方程闭合）。严格更强：
    // 旧等式 = ②在"一条通配声明都没有"时的特例，而 ① 与 ③ 原样保留。
    const reg = payload1.registry || {};
    const gap = payload1.gaps || {};
    // ④ 的独立输入：**现读盘上的处置登记表**，按 lib `coverageOf()` 的同一条条件数一遍
    //   （`apiPlanId !== undefined && modelKey !== undefined` ⇒ 这条声明走 API 侧分支）。
    //   为什么要现场再数一遍：如果只比"载荷里的行数 == 载荷里的计数"，两边同源，永远自洽 —— 那是假牙。
    const gapsFileApiDeclarationRows = readJson('scripts/data/model-registry-gaps.json').declarations
      .filter(declaration => declaration && declaration.apiPlanId !== undefined && declaration.modelKey !== undefined).length;
    // ⑤ 的独立输入：拿 api-plans 逐格复算通配行多覆盖了几个变体。
    const declaredWildcardSurplus = wildcardSurplusOf(reg.declaredApiEntryRows, apiDoc);
    const apiDispositionIssueList = apiDispositionProblems(reg, gap, payload1.api, {
      expectedDeclarationRows: gapsFileApiDeclarationRows,
      wildcardSurplus: declaredWildcardSurplus
    });
    check('t25：registry 新增 API 侧处置键（映射 A / 已处置 B / 逐条留档）且三者和 == 计价条目总数',
      apiDispositionIssueList.length === 0, apiDispositionIssueList.join('；'));
    check('t12：声明行的两种视图必须相等、且展开数 ≥ 行数（A/B/行数三项在 JSON 里逐项可核）',
      reg.declaredApiEntryRows.length === gap.declaredApiEntryCount
      && reg.declaredApiEntries >= reg.declaredApiEntryRows.length,
      `rows=${reg.declaredApiEntryRows.length} / count=${gap.declaredApiEntryCount} / B=${reg.declaredApiEntries}`);
    const declaredRowRoundTripProblems = apiDeclarationRowProblems(reg.declaredApiEntryRows, apiDoc);
    check('t12：每条 API 侧声明行都能按 (apiPlanId, modelKey, variant) 逐字对回 api-plans 记录（通配行必须展开到 ≥1 条真实变体）',
      declaredRowRoundTripProblems.length === 0, declaredRowRoundTripProblems.slice(0, 2).join('；'));
    // t7-F3 修复：这里原来是一条**代数恒真式**（`X === Y + (X - Y)`），永远绿 —— 已换成两条各有独立来源的真不变量。
    check('t12：【不许同源自证】声明行数必须与**现读文件**数出来的 API 侧声明行数相等，且展开增量必须等于逐格复算出的通配多余覆盖',
      reg.declaredApiEntryRows.length === gapsFileApiDeclarationRows
      && reg.declaredApiEntries - reg.declaredApiEntryRows.length === declaredWildcardSurplus,
      `载荷行数=${reg.declaredApiEntryRows.length} / 文件行数=${gapsFileApiDeclarationRows} / 展开增量=${reg.declaredApiEntries - reg.declaredApiEntryRows.length} / 通配多余覆盖复算=${declaredWildcardSurplus}`);

    /* ---- t12 定向夹具：`variant: null` 通配声明（合成输入，零依赖、不读盘上变动数据） ---- */
    //
    // 为什么必须是合成夹具：盘上此刻**恰好没有**通配声明（t3 把那条拆成了逐变体），所以真实数据
    // 证明不了"通配态真的能派出来"。这里直接喂 lib 的 `coverageOf()` 一份最小 api-plans，
    // 让通配语义（1 行 → 该 modelKey 的全部真实变体）真的跑一遍。
    const WILDCARD_FIXTURE_API_PLANS = [{
      id: 'fixture-plan-1',
      provider: 'alpha',
      officialUrl: 'https://example.invalid/alpha/pricing',
      sourceUrl: 'https://example.invalid/alpha/pricing',
      models: [
        { modelKey: 'alpha-1', variant: 'standard', name: 'Alpha 1（标准）' },
        { modelKey: 'alpha-1', variant: 'long_context', name: 'Alpha 1（长上下文）' }
      ]
    }];
    const wildcardFixtureGaps = {
      schemaVersion: readJson('scripts/data/model-registry-gaps.json').schemaVersion,
      declarations: [{
        apiPlanId: 'fixture-plan-1', modelKey: 'alpha-1', variant: null,
        reason: 'off-registry-model', sourceUrl: 'https://example.invalid/alpha/pricing',
        note: '夹具：一条通配声明覆盖 alpha-1 的全部真实变体'
      }]
    };
    const wildcardFixtureCoverage = registry.coverageOf({
      table: {}, links: { links: [] }, gaps: wildcardFixtureGaps, apiPlans: WILDCARD_FIXTURE_API_PLANS, plans: []
    });
    const wildcardFixtureClaims = registry.sourcePricingIdentitiesOf(wildcardFixtureGaps.declarations[0], WILDCARD_FIXTURE_API_PLANS);
    const wildcardFixtureDisposition = {
      registry: {
        mappedApiEntries: wildcardFixtureCoverage.mappedApiEntries,
        declaredApiEntries: wildcardFixtureCoverage.declaredApiIdentities,
        declaredApiEntryRows: wildcardFixtureCoverage.declaredApiEntries
      },
      gaps: {
        declaredApiEntryCount: wildcardFixtureCoverage.declaredApiEntries.length,
        unmappedModelCount: wildcardFixtureCoverage.unmappedModelKeys.length
      },
      api: { modelPricingItems: wildcardFixtureCoverage.apiPricingItems }
    };
    check('t12：【定向夹具·通配】variant:null 通配声明 1 行展开成 2 条计价条目 ⇒ 展开数**严格大于**声明行数（不是等于）',
      wildcardFixtureCoverage.declaredApiEntries.length === 1
      && wildcardFixtureCoverage.declaredApiIdentities === 2
      && wildcardFixtureCoverage.declaredApiIdentities > wildcardFixtureCoverage.declaredApiEntries.length
      && wildcardFixtureClaims.expanded === true && wildcardFixtureClaims.unresolved === false,
      `rows=${wildcardFixtureCoverage.declaredApiEntries.length} / 展开数=${wildcardFixtureCoverage.declaredApiIdentities} / expanded=${wildcardFixtureClaims.expanded}`);
    check('t12：【定向夹具·通配】展开出的每条 identity 都能**逐字**对回同一份 api-plans 的 (apiPlanId, modelKey, variant)',
      wildcardFixtureClaims.identities.length === 2
      && wildcardFixtureClaims.identities.every(identity => identity.apiPlanId === 'fixture-plan-1'
        && WILDCARD_FIXTURE_API_PLANS[0].models.some(model => model.modelKey === identity.modelKey && model.variant === identity.variant)),
      JSON.stringify(wildcardFixtureClaims.identities));
    const wildcardFixtureIssues = apiDispositionProblems(wildcardFixtureDisposition.registry, wildcardFixtureDisposition.gaps,
      wildcardFixtureDisposition.api, { expectedDeclarationRows: 1, wildcardSurplus: wildcardSurplusOf(wildcardFixtureCoverage.declaredApiEntries, { plans: WILDCARD_FIXTURE_API_PLANS }) });
    check('t12：【定向夹具·通配】在这个**合法**通配态下新判据 0 问题（0 映射 + 2 已处置 + 0 未判 == 2 计价条目；行数对得上文件、增量对得上逐格复算）',
      wildcardFixtureIssues.length === 0
      && wildcardFixtureCoverage.apiPricingItems === 2
      && wildcardFixtureCoverage.declaredApiEntries.length === 1
      && wildcardFixtureCoverage.declaredApiIdentities - wildcardFixtureCoverage.declaredApiEntries.length === 1
      && wildcardSurplusOf(wildcardFixtureCoverage.declaredApiEntries, { plans: WILDCARD_FIXTURE_API_PLANS }) === 1
      && apiDeclarationRowProblems(wildcardFixtureCoverage.declaredApiEntries, { plans: WILDCARD_FIXTURE_API_PLANS }).length === 0,
      wildcardFixtureIssues.join('；') || `rows=1 / B=${wildcardFixtureCoverage.declaredApiIdentities} / 通配多余覆盖复算=1`);
    // 方向牙（两例，都是"用通配掩护一条对不上的声明"）：
    //   a) 通配声明指向**不存在的 modelKey**；
    //   b) 通配声明指向**存在、但记录自己就没有任何真实变体**的 modelKey（最典型的兜底形态）。
    const WILDCARD_FIXTURE_API_PLANS_NO_VARIANT = [{
      id: 'fixture-plan-2',
      provider: 'beta',
      officialUrl: 'https://example.invalid/beta/pricing',
      sourceUrl: 'https://example.invalid/beta/pricing',
      models: [{ modelKey: 'beta-1', variant: null, name: 'Beta 1（记录自己就没写变体）' }]
    }];
    const t12GhostCases = [
      {
        label: '指向不存在的 modelKey',
        plans: WILDCARD_FIXTURE_API_PLANS,
        modelKey: 'ghost-model-000',
        rowNeedle: '不在记录'
      },
      {
        label: '指向存在但一条真实变体都没有的 modelKey',
        plans: WILDCARD_FIXTURE_API_PLANS_NO_VARIANT,
        modelKey: 'beta-1',
        rowNeedle: '一条真实变体都没匹配到'
      }
    ];
    for (const ghostCase of t12GhostCases) {
      const ghostGaps = clone(wildcardFixtureGaps);
      ghostGaps.declarations[0].apiPlanId = ghostCase.plans[0].id;
      ghostGaps.declarations[0].sourceUrl = ghostCase.plans[0].officialUrl;
      ghostGaps.declarations[0].modelKey = ghostCase.modelKey;
      const ghostCoverage = registry.coverageOf({
        table: {}, links: { links: [] }, gaps: ghostGaps, apiPlans: ghostCase.plans, plans: []
      });
      const ghostClaims = registry.sourcePricingIdentitiesOf(ghostGaps.declarations[0], ghostCase.plans);
      const ghostProblems = apiDispositionProblems(
        { mappedApiEntries: ghostCoverage.mappedApiEntries, declaredApiEntries: ghostCoverage.declaredApiIdentities, declaredApiEntryRows: ghostCoverage.declaredApiEntries },
        { declaredApiEntryCount: ghostCoverage.declaredApiEntries.length, unmappedModelCount: ghostCoverage.unmappedModelKeys.length },
        { modelPricingItems: ghostCoverage.apiPricingItems },
        { expectedDeclarationRows: 1, wildcardSurplus: wildcardSurplusOf(ghostCoverage.declaredApiEntries, { plans: ghostCase.plans }) }
      );
      const ghostRowProblems = apiDeclarationRowProblems(ghostCoverage.declaredApiEntries, { plans: ghostCase.plans });
      check(`t12：【方向牙·通配】通配声明${ghostCase.label} ⇒ 一条 identity 都没覆盖（unresolved）⇒ 展开数 < 行数 ⇒ 同一支判据**必红**`,
        ghostClaims.unresolved === true && ghostClaims.identities.length === 0
        && ghostCoverage.declaredApiIdentities === 0 && ghostCoverage.declaredApiEntries.length === 1
        && ghostProblems.length > 0 && ghostProblems.some(text => text.includes('展开后的计价条目数')),
        ghostProblems.join('；') || '(没有报红)');
      check(`t12：【方向牙·通配】同一份声明（${ghostCase.label}）也被**逐行回查**抓住：${ghostCase.rowNeedle}`,
        ghostRowProblems.some(text => text.includes(ghostCase.rowNeedle)),
        ghostRowProblems.join('；') || '(没有报红)');
    }

    /* ---- t12 反证完整性：新判据抓得住旧判据抓得住的一切 + 旧判据漏抓/假红各一例 ---- */
    //
    // 判据共用同一支纯函数（`apiDispositionProblems`），变异施加在**载荷对象**上 —— 不碰盘上数据。
    const t12BasePayload = {
      registry: {
        mappedApiEntries: reg.mappedApiEntries,
        declaredApiEntries: reg.declaredApiEntries,
        declaredApiEntryRows: clone(reg.declaredApiEntryRows)
      },
      gaps: { declaredApiEntryCount: gap.declaredApiEntryCount, unmappedModelCount: gap.unmappedModelCount },
      api: { modelPricingItems: payload1.api.modelPricingItems }
    };
    const t12Evidence = [];
    const t12BaseContext = { expectedDeclarationRows: gapsFileApiDeclarationRows, wildcardSurplus: declaredWildcardSurplus };
    const t12Mutation = (name, mutate, needle, mutateContext) => {
      const payload = clone(t12BasePayload);
      const context = clone(t12BaseContext);
      mutate(payload);
      if (mutateContext) mutateContext(context);
      const nextProblems = apiDispositionProblems(payload.registry, payload.gaps, payload.api, context);
      const legacyProblems = legacyT25Problems(payload.registry, payload.gaps, payload.api);
      const hit = nextProblems.find(text => !needle || text.includes(needle));
      t12Evidence.push({
        name,
        newRed: nextProblems.length > 0,
        legacyRed: legacyProblems.length > 0,
        observed: hit || nextProblems[0] || '(没有报红)'
      });
      check(`【反证牙·t12】${name} ⇒ 新判据必红`, nextProblems.length > 0 && Boolean(hit),
        nextProblems.length ? nextProblems.join('；') : '没有报红');
      return { nextProblems, legacyProblems };
    };
    t12Mutation('变异①-a：声明行数与展开数不一致（count = 行数 − 1）',
      payload => { payload.gaps.declaredApiEntryCount = payload.registry.declaredApiEntryRows.length - 1; }, '两种视图不等');
    t12Mutation('变异①-b：声明行数与展开数不一致（count = 行数 + 1）',
      payload => { payload.gaps.declaredApiEntryCount = payload.registry.declaredApiEntryRows.length + 1; }, '两种视图不等');
    t12Mutation('变异②：声明计数与数组长度脱钩（逐条留档被换成非数组）',
      payload => { payload.registry.declaredApiEntryRows = null; }, '必须是数组');
    t12Mutation('变异③：B 与行数脱钩（B = 行数 − 1，方程仍闭合）',
      payload => {
        payload.registry.mappedApiEntries += 1;
        payload.registry.declaredApiEntries = payload.registry.declaredApiEntryRows.length - 1;
      }, '展开后的计价条目数');
    t12Mutation('变异④：方程不闭合（C 多算一条）',
      payload => { payload.gaps.unmappedModelCount += 1; }, '记账不闭合');
    // t7-F3 之后补的两条：④⑤ 的输入是**另一个来源的数**（现读文件行数 / 逐格复算的增量），
    // 所以它们可以被"只扰动那一个来源"证伪 —— 这正是恒真式做不到的。
    t12Mutation('变异⑤：现读文件与载荷的行数对不上（文件多一行 —— 例如有人删了声明却忘了同步）',
      () => { /* 载荷不动 */ }, '现读文件里的 API 侧声明行数', context => { context.expectedDeclarationRows += 1; });
    t12Mutation('变异⑥：展开增量对不上逐格复算的通配多余覆盖（增量多 1，别处冒出来的）',
      () => { /* 载荷不动 */ }, '通配多余覆盖', context => { context.wildcardSurplus += 1; });

    const t12ViewDecoupled = clone(t12BasePayload);
    t12ViewDecoupled.registry.declaredApiEntryRows = t12ViewDecoupled.registry.declaredApiEntryRows.slice(1);   // 行数 −1，count 与 B 不动
    const t12ViewDecoupledNew = apiDispositionProblems(t12ViewDecoupled.registry, t12ViewDecoupled.gaps, t12ViewDecoupled.api);
    const t12ViewDecoupledLegacy = legacyT25Problems(t12ViewDecoupled.registry, t12ViewDecoupled.gaps, t12ViewDecoupled.api);
    t12Evidence.push({
      name: '旧判据漏抓的一例：两种视图脱钩（B == count 仍成立）',
      newRed: t12ViewDecoupledNew.length > 0,
      legacyRed: t12ViewDecoupledLegacy.length > 0,
      observed: t12ViewDecoupledNew[0] || '(没有报红)'
    });
    check('【反证牙·t12】旧判据**漏抓**、新判据抓住的一例：声明行的两种视图脱钩（B == count 仍成立 ⇒ 旧绿）',
      t12ViewDecoupledLegacy.length === 0 && t12ViewDecoupledNew.length > 0,
      `旧：${t12ViewDecoupledLegacy.join('；') || '绿'}；新：${t12ViewDecoupledNew.join('；') || '绿'}`);

    const t12LegalWildcard = {
      registry: { mappedApiEntries: 0, declaredApiEntries: 2, declaredApiEntryRows: [{ apiPlanId: 'p', modelKey: 'm', variant: null }] },
      gaps: { declaredApiEntryCount: 1, unmappedModelCount: 0 },
      api: { modelPricingItems: 2 }
    };
    const t12LegalWildcardNew = apiDispositionProblems(t12LegalWildcard.registry, t12LegalWildcard.gaps, t12LegalWildcard.api);
    const t12LegalWildcardLegacy = legacyT25Problems(t12LegalWildcard.registry, t12LegalWildcard.gaps, t12LegalWildcard.api);
    t12Evidence.push({
      name: '旧判据假红的一例（T6-F1 本体）：合法通配态 B(2) > 行数(1) 且方程闭合',
      newRed: t12LegalWildcardNew.length > 0,
      legacyRed: t12LegalWildcardLegacy.length > 0,
      observed: `旧：${t12LegalWildcardLegacy.join('；') || '绿'} ⇒ 新：${t12LegalWildcardNew.join('；') || '绿'}`
    });
    check('【反证牙·t12】旧判据**假红**（T6-F1 本体）、新判据正确的一例：合法通配态 B=2 > 行数=1 且方程闭合 ⇒ 旧红 / 新绿',
      t12LegalWildcardLegacy.length > 0 && t12LegalWildcardNew.length === 0,
      `旧：${t12LegalWildcardLegacy.join('；') || '绿'}；新：${t12LegalWildcardNew.join('；') || '绿'}`);

    const t12Decoupled = {
      registry: { mappedApiEntries: t12BasePayload.registry.mappedApiEntries + 1, declaredApiEntries: t12BasePayload.registry.declaredApiEntryRows.length - 1, declaredApiEntryRows: clone(t12BasePayload.registry.declaredApiEntryRows) },
      gaps: clone(t12BasePayload.gaps),
      api: clone(t12BasePayload.api)
    };
    check('【反证牙·t12】B 与行数的**脱钩**（B < 行数、方程仍闭合）⇒ 新旧两支判据**都**必红（没有放松）',
      apiDispositionProblems(t12Decoupled.registry, t12Decoupled.gaps, t12Decoupled.api).length > 0
      && legacyT25Problems(t12Decoupled.registry, t12Decoupled.gaps, t12Decoupled.api).length > 0,
      `新：${apiDispositionProblems(t12Decoupled.registry, t12Decoupled.gaps, t12Decoupled.api).join('；')}`);

    // 现场输出：把每条变异点了哪一句话打出来（通过时也打，验收要的就是这份逐条现场读数）
    console.log('    ℹ t12 反证牙现场输出（每条变异 ⇒ 新判据必红；标注旧判据当时的表现）:');
    t12Evidence.forEach(item => {
      console.log(`       · ${item.name} ⇒ 新判据${item.newRed ? '红' : '绿'} / 旧判据${item.legacyRed ? '红' : '绿'}：${item.observed}`);
    });

    /* ---- t12 报告层现场反证：拿 `--gaps=` 喂两份被改坏的处置登记表，报告必须当场红 ---- */
    const t12GapsRealDoc = readJson('scripts/data/model-registry-gaps.json');
    const t12ApiDeclaration = t12GapsRealDoc.declarations.find(declaration => declaration && declaration.apiPlanId !== undefined);
    const t12WriteGaps = (name, mutate) => {
      const doc = clone(t12GapsRealDoc);
      mutate(doc);
      const file = path.join(tmpDir, name);
      fs.writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`);
      return file;
    };
    if (!t12ApiDeclaration) {
      check('t12：报告层现场反证需要至少一条真实 API 侧声明（拿它克隆出被改坏的两份）', false,
        'scripts/data/model-registry-gaps.json 里一条 API 侧声明都没有 —— 反证无法进行');
    } else {
      const t12GhostGaps = t12WriteGaps('t12-gaps-ghost-wildcard.json', doc => {
        const ghost = Object.assign(clone(t12ApiDeclaration), { modelKey: 'ghost-model-000', variant: null });
        doc.declarations = registry.sortDeclarations(doc.declarations.concat([ghost]));
      });
      const t12GhostRun = runReport([`--gaps=${t12GhostGaps}`]);
      check('【反证牙·t12·报告层】处置登记表里加一条"对不上任何计价条目"的通配声明 ⇒ 报告自检非 0，并点名「一条真实变体都没匹配到」',
        t12GhostRun.status !== 0 && t12GhostRun.stderr.includes('一条真实变体都没匹配到'),
        `exit ${t12GhostRun.status}；${(t12GhostRun.stderr.split('\n').find(line => line.includes('真实变体')) || '(没有点到)').trim().slice(0, 140)}`);

      const t12UnorderedGaps = t12WriteGaps('t12-gaps-unordered.json', doc => { doc.declarations = doc.declarations.slice().reverse(); });
      const t12UnorderedRun = runReport([`--gaps=${t12UnorderedGaps}`]);
      check('【反证牙·t12·报告层】处置登记表顺序被打乱（声明数组乱序）⇒ 报告自检非 0，并点名「记录顺序不是规范序」',
        t12UnorderedRun.status !== 0 && t12UnorderedRun.stderr.includes('记录顺序不是规范序'),
        `exit ${t12UnorderedRun.status}；${(t12UnorderedRun.stderr.split('\n').find(line => line.includes('规范序')) || '(没有点到)').trim().slice(0, 140)}`);
    }

    check('t25：逐条留档是稳定排序（两次运行里 registry.declaredApiEntryRows 逐字节相同）',
      JSON.stringify(payload1.registry.declaredApiEntryRows) === JSON.stringify(payload2.registry.declaredApiEntryRows));
  } else {
    // 不许静默跳过：拿不到 payload 时，契约**没有**被核对过 —— 这一条必须显式红，并点名上游原因。
    check('（隔离上游）JSON 契约可核对：报告成功运行并在 stdout 给出 JSON', false,
      `报告退出码 ${iso1.status}；上游自检问题 ${isoProblems.length} 处：${isoProblems.slice(0, 3).join('；')}`);
  }

  /* ---- t46 反证牙（验收 ②）：五态普查的两条不变量，构造违反它的输入 ⇒ 报告自检必红 ---- */
  //
  // 为什么这两条必须动态跑报告而不是纯函数驱动：判据长在 `main()` 里（报告是 CLI，没有导出面），
  // 唯一能证明「这条不变量真的有牙」的方式就是喂一份**被改坏**的发布产物给它。用 `--published-models=`
  // （报告自带的验证开关）而不是改盘上的 `models.json`：反证不许碰生产数据。
  const publishedDoc = readJson('models.json');
  const shortDoc = Object.assign({}, publishedDoc, {
    count: publishedDoc.models.length - 1,
    models: publishedDoc.models.slice(0, -1)
  });
  const shortFile = path.join(tmpDir, 't46-published-models-short.json');
  fs.writeFileSync(shortFile, `${JSON.stringify(shortDoc, null, 2)}\n`);
  const shortRun = runReport([`--published-models=${shortFile}`]);
  check('【反证牙】发布产物少一个模型（五态之和 ≠ registry 模型数）⇒ 报告自检非 0，并点名「五态普查不闭合」',
    shortRun.status !== 0 && shortRun.stderr.includes('五态普查不闭合'),
    `exit ${shortRun.status}；${(shortRun.stderr.split('\n').find(line => line.includes('普查')) || '(没有点到普查)').trim().slice(0, 120)}`);

  const bogusDoc = clone(publishedDoc);
  bogusDoc.models[bogusDoc.models.length - 1].catalogStatus = 'retired';   // retired 不是目录状态（lib 的封闭枚举里没有它）
  const bogusFile = path.join(tmpDir, 't46-published-models-bogus-status.json');
  fs.writeFileSync(bogusFile, `${JSON.stringify(bogusDoc, null, 2)}\n`);
  const bogusRun = runReport([`--published-models=${bogusFile}`]);
  check('【反证牙】出现词表外的 catalogStatus（retired）⇒ 报告自检非 0，并点名「不在词表里」',
    bogusRun.status !== 0 && bogusRun.stderr.includes('不在词表里'),
    `exit ${bogusRun.status}；${(bogusRun.stderr.split('\n').find(line => line.includes('词表')) || '(没有点到词表)').trim().slice(0, 120)}`);
} finally {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (error) { /* 临时目录清不掉不影响判据 */ }
}

/* ================================================================== */
/* ⑤ v3（coverage-depth-v1）：source-rulings 判据层 + 报告新增四节        */
/* ================================================================== */
//
// 这一段的纪律与 ①②③④ 逐字相同：**纯函数驱动 + 夹具反证**。
// 为什么 source-rulings 的 schema / 对账必须用夹具而不是盘上文件：盘上那份文件由 workstream C 落盘，
// 它此刻可能还不存在、也可能只有一条裁决 —— **用真实文件证明不了"retire 还在注册表里会红"**。
// 反面同样重要：报告对"尚未落盘"必须优雅降级（不崩、不静默当通过），所以那条路径也要用
// 一份**不存在的路径**去驱动，而不是靠"碰巧还没落盘"。

section('⑤ source-rulings 判据层（纯函数、零依赖、不读墙钟）+ v3 四节');

const srLibSource = fs.readFileSync(path.join(ROOT, 'scripts', 'lib', 'source-rulings.js'), 'utf8');
check('source-rulings 判据层是纯函数：不读墙上时钟、不联网、不写盘',
  !/Date\.now|new Date\(/.test(srLibSource) && !/https?:\/\//.test(srLibSource.replace(/^[\s\S]*?\*\//, ''))
  && !/writeFileSync|appendFileSync/.test(srLibSource));
check('source-rulings 判据层零依赖（只 require fs / path，没有别的模块）',
  [...srLibSource.matchAll(/require\(([^)]*)\)/g)].every(hit => /'fs'|'path'/.test(hit[1])),
  [...srLibSource.matchAll(/require\(([^)]*)\)/g)].map(hit => hit[1]).join(' '));
check('source-rulings 冻结 schema 的词表与题面一致（四裁决 / 三成本档 / 三条必填关系）',
  JSON.stringify(sr.DECISIONS) === JSON.stringify(['repair', 'headless-migrate', 'keep-degraded', 'retire'])
  && JSON.stringify(sr.MAINTENANCE_COSTS) === JSON.stringify(['low', 'medium', 'high'])
  && JSON.stringify(sr.REQUIRED_BY_DECISION['keep-degraded']) === JSON.stringify(['whyKept', 'revisitBy'])
  && JSON.stringify(sr.REQUIRED_BY_DECISION.repair) === JSON.stringify(['revisitBy'])
  && JSON.stringify(sr.REQUIRED_BY_DECISION['headless-migrate']) === JSON.stringify(['headlessStability'])
  && sr.HEALTH_FAILURES_REQUIRING_RULING === 3,
  JSON.stringify({ decisions: sr.DECISIONS, required: sr.REQUIRED_BY_DECISION }));

/* ---- 稳定序：**code-unit 序**，不是 localeCompare（后者随 ICU 版本变） ---- */
check('稳定序：sortRulings 与输入顺序无关，且按 source 的 code-unit 序（大写在前的 code-unit 事实）',
  sr.sortRulings([{ source: 'zeta' }, { source: 'alpha' }, { source: 'Zulu' }]).map(row => row.source).join(',')
  === 'Zulu,alpha,zeta'
  && sr.orderKeyOfRuling({ source: 'beta' }) === 'beta',
  JSON.stringify(sr.sortRulings([{ source: 'zeta' }, { source: 'alpha' }, { source: 'Zulu' }]).map(row => row.source)));

/* ---- schema 夹具：合法输入 + 每一条变异必须报红 ---- */
const FIXTURE_SOURCE_RULINGS = {
  schemaVersion: sr.SCHEMA_VERSION,
  reviewedAt: '2026-10-05',
  _note: '夹具：不落盘，只用于驱动判据层',
  rulings: [
    {
      source: 'delta_official',
      decision: 'headless-migrate',
      reason: '夹具：静态链路拿不到，迁无头',
      evidence: [{ url: 'https://example.invalid/source', capturedAt: '2026-10-05', reading: '夹具：HTTP 403' }],
      overlap: { historicalItems: 3, uniqueItems: 1, overlapItems: 2, maintenanceCost: 'medium' },
      whyKept: null,
      revisitBy: null,
      headlessStability: '夹具：连跑 3 轮稳定'
    },
    {
      source: 'gamma_official',
      decision: 'keep-degraded',
      reason: '夹具：独有价值大于维护成本',
      evidence: [],
      overlap: { historicalItems: 0, uniqueItems: 5, overlapItems: 0, maintenanceCost: 'low' },
      whyKept: '夹具：只有这一家给出这类条目',
      revisitBy: '夹具：连续失败再翻倍时复查',
      headlessStability: null
    }
  ]
};
const FIXTURE_REGISTRY_SOURCES = [
  { id: 'delta_official', name: 'Delta Official', region: 'global', headless: false },
  { id: 'gamma_official', name: 'Gamma Official', region: 'global', headless: false },
  { id: 'epsilon_official', name: 'Epsilon Official', region: 'global', headless: false }
];
const FIXTURE_HEALTH_SOURCES = [
  { source: 'delta_official', name: 'Delta Official', status: 'failed', reason: 'collector_error', consecutiveFailures: 9 },
  { source: 'gamma_official', name: 'Gamma Official', status: 'healthy', reason: null, consecutiveFailures: 0 }
];

check(`source-rulings 夹具本身合法（0 处问题，实际 ${sr.validateRulings(FIXTURE_SOURCE_RULINGS).length} 处）`,
  sr.validateRulings(FIXTURE_SOURCE_RULINGS).length === 0,
  sr.validateRulings(FIXTURE_SOURCE_RULINGS).slice(0, 3).join('；'));
check('三方对账夹具本身合法（0 处问题）',
  sr.reconcileRulings({
    doc: FIXTURE_SOURCE_RULINGS, registrySources: FIXTURE_REGISTRY_SOURCES, healthSources: FIXTURE_HEALTH_SOURCES
  }).problems.length === 0,
  sr.reconcileRulings({
    doc: FIXTURE_SOURCE_RULINGS, registrySources: FIXTURE_REGISTRY_SOURCES, healthSources: FIXTURE_HEALTH_SOURCES
  }).problems.slice(0, 3).join('；'));

const rulingsRed = (name, mutate, needle) => {
  const doc = clone(FIXTURE_SOURCE_RULINGS);
  mutate(doc);
  const found = sr.validateRulings(doc);
  check(`【牙】source-rulings schema：${name}`, found.length > 0 && (!needle || found.some(text => text.includes(needle))),
    found.length ? `Problems: ${found.slice(0, 2).join('；')}` : '没有报红');
};
rulingsRed('schemaVersion 不对 → 红', doc => { doc.schemaVersion = 99; }, 'schemaVersion 应为');
rulingsRed('顶层未知字段 → 红', doc => { doc.extra = true; }, '顶层未知字段');
rulingsRed('decision 非法（watch = 变相的"待定"）→ 红', doc => { doc.rulings[0].decision = 'watch'; }, 'decision 非法');
rulingsRed('reason 为空 → 红', doc => { doc.rulings[0].reason = '   '; }, 'reason 不能为空');
rulingsRed('同一个来源两条裁决 → 红',
  doc => { doc.rulings.push(clone(doc.rulings[0])); }, '出现了不止一次');
rulingsRed('rulings 不是按 source 的 code-unit 序 → 红', doc => { doc.rulings.reverse(); }, '不是规范序');
rulingsRed('裁决里出现未知字段 → 红', doc => { doc.rulings[0].verdict = 'ok'; }, '未知字段');
rulingsRed('裁决字段顺序不是规范序 → 红',
  doc => { const row = doc.rulings[0]; const moved = row.source; delete row.source; row.source = moved; }, '不是规范序');
rulingsRed('evidence 不是数组 → 红', doc => { doc.rulings[0].evidence = null; }, 'evidence 必须是数组');
rulingsRed('evidence 缺 url → 红', doc => { doc.rulings[0].evidence[0].url = ''; }, 'url 不能为空');
rulingsRed('evidence 的 url 不是绝对地址 → 红',
  doc => { doc.rulings[0].evidence[0].url = '看过了，页面上有'; }, '不是绝对地址');
rulingsRed('evidence 的 capturedAt 不是日期 → 红',
  doc => { doc.rulings[0].evidence[0].capturedAt = '2026年10月'; }, 'capturedAt 必须是');
rulingsRed('evidence 的 reading 为空 → 红', doc => { doc.rulings[0].evidence[0].reading = ''; }, 'reading 不能为空');
rulingsRed('overlap 不是对象 → 红', doc => { doc.rulings[0].overlap = null; }, 'overlap 必须是对象');
rulingsRed('overlap 计数是负数 → 红', doc => { doc.rulings[0].overlap.uniqueItems = -1; }, '必须是非负整数');
rulingsRed('maintenanceCost 非法 → 红', doc => { doc.rulings[0].overlap.maintenanceCost = 'very-high'; }, 'maintenanceCost 非法');
rulingsRed('keep-degraded 缺 whyKept → 红', doc => { doc.rulings[1].whyKept = null; }, '必须写 whyKept');
rulingsRed('keep-degraded 缺 revisitBy → 红', doc => { doc.rulings[1].revisitBy = ''; }, '必须写 revisitBy');
rulingsRed('headless-migrate 缺 headlessStability → 红',
  doc => { doc.rulings[0].headlessStability = null; }, '必须写 headlessStability');
rulingsRed('repair 缺 revisitBy → 红',
  doc => { doc.rulings[0].decision = 'repair'; doc.rulings[0].headlessStability = null; }, '必须写 revisitBy');

/* ---- 三方对账夹具：三条硬关系 + 一条反向牙 ---- */
const rulingsReconcileRed = (name, doc, needle) => {
  const result = sr.reconcileRulings({
    doc, registrySources: FIXTURE_REGISTRY_SOURCES, healthSources: FIXTURE_HEALTH_SOURCES
  });
  check(`【牙】三方对账：${name}`,
    result.problems.length > 0 && (!needle || result.problems.some(text => text.includes(needle))),
    result.problems.length ? `Problems: ${result.problems.slice(0, 2).join('；')}` : '没有报红');
};
const reconcileFixture = mutate => { const doc = clone(FIXTURE_SOURCE_RULINGS); mutate(doc); return doc; };

rulingsReconcileRed('已裁决 retire 的来源仍挂在采集器注册表里 → 红',
  reconcileFixture(doc => { doc.rulings[1].decision = 'retire'; doc.rulings[1].whyKept = null; doc.rulings[1].revisitBy = null; }),
  'retire');
rulingsReconcileRed('连续失败 ≥ 3 次的来源没有裁决 → 红（清空裁决表）',
  reconcileFixture(doc => { doc.rulings = []; }), '连续失败');
rulingsReconcileRed('repair 的来源不在注册表里 → 红',
  reconcileFixture(doc => {
    doc.rulings[0].decision = 'repair';
    doc.rulings[0].headlessStability = null;
    doc.rulings[0].revisitBy = '夹具：改版后复查';
    doc.rulings.unshift({
      source: 'ghost_official', decision: 'repair', reason: '夹具：不在注册表的来源',
      evidence: [], overlap: { historicalItems: 0, uniqueItems: 0, overlapItems: 0, maintenanceCost: 'low' },
      whyKept: null, revisitBy: '夹具：复查', headlessStability: null
    });
  }), 'repair');
rulingsReconcileRed('非 retire 的裁决命不中任何身份（名字写错）→ 红',
  reconcileFixture(doc => { doc.rulings[1].source = 'gamma_officiall'; }), '都找不到同一个身份');
check('【反向牙】retire 的来源**完全不在任何一层**不算错（退出去的来源本来就该从注册表与心跳里消失）',
  sr.reconcileRulings({
    doc: {
      schemaVersion: sr.SCHEMA_VERSION,
      reviewedAt: null,
      rulings: [{
        source: 'already_gone', decision: 'retire', reason: '夹具：已下线', evidence: [],
        overlap: { historicalItems: 0, uniqueItems: 0, overlapItems: 0, maintenanceCost: 'low' },
        whyKept: null, revisitBy: null, headlessStability: null
      }]
    },
    registrySources: [{ id: 'gamma_official', name: 'Gamma Official' }],
    healthSources: []
  }).problems.join('；') === '');
check('【夹具】裁决 → 身份命中：id 与 name 两种写法都能命中同一个来源',
  (() => {
    const byId = sr.reconcileRulings({
      doc: FIXTURE_SOURCE_RULINGS, registrySources: FIXTURE_REGISTRY_SOURCES, healthSources: FIXTURE_HEALTH_SOURCES
    }).rows[0];
    const byName = sr.reconcileRulings({
      doc: {
        schemaVersion: sr.SCHEMA_VERSION, reviewedAt: null,
        rulings: [Object.assign(clone(FIXTURE_SOURCE_RULINGS.rulings[0]), { source: 'Delta Official' })]
      },
      registrySources: FIXTURE_REGISTRY_SOURCES, healthSources: FIXTURE_HEALTH_SOURCES
    }).rows[0];
    return byId.registry.id === 'delta_official' && byName.registry.id === 'delta_official'
      && byId.health.consecutiveFailures === 9 && byName.health.consecutiveFailures === 9
      && byId.resolvedBy === 'registry-id' && byName.resolvedBy === 'registry-name';
  })());

/* ---- 报告端到端：v3 四节的**同一批数字** + 夹具反证 ---- */
const v3Tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'coverage-v3-'));
try {
  /* ① 优雅降级：把裁决表指向一个**不存在的路径** —— 这比"碰巧还没落盘"更可靠（落盘之后也照样能跑）。 */
  const absentRun = runReport([`--source-rulings=${path.join(v3Tmp, 'does-not-exist.json')}`]);
  const absentProblems = absentRun.stderr.split('\n').filter(text => text.trim().startsWith('- ')).map(text => text.trim().slice(2));
  check('v3：裁决表不在盘上时**优雅降级**（退出码 0、文本如实说「尚未落盘」、不崩）',
    absentRun.status === 0 && absentRun.stdout.includes('尚未落盘') && absentProblems.length === 0,
    `exit ${absentRun.status}；问题 ${absentProblems.slice(0, 2).join('；')}`);
  check('v3：未落盘层**计入报告自检口径**（同一行相邻打印，不静默当通过）',
    absentRun.stdout.includes('报告自检待落盘层：1 项')
    && absentRun.stdout.includes('scripts/data/source-rulings.json')
    && absentRun.stdout.includes('计入自检口径'),
    (absentRun.stdout.split('\n').find(text => text.includes('待落盘层')) || '(没有这一行)').trim().slice(0, 140));

  /* ② 落盘分支：喂一份**合法夹具**（覆盖真实心跳里的每一个来源），报告必须绿、且四节结构完整。 */
  const liveHealth = readJson('scripts/data/source-health.json');
  const fixtureDoc = {
    schemaVersion: sr.SCHEMA_VERSION,
    reviewedAt: '2026-01-01',
    _note: '夹具：由 coverage-targets-selftest 现场生成，不落盘',
    rulings: sr.sortRulings(liveHealth.sources.map(source => ({
      source: source.source,
      decision: 'keep-degraded',
      reason: `夹具：${source.name} 保留降级（自测专用）`,
      evidence: [],
      overlap: { historicalItems: 0, uniqueItems: 1, overlapItems: 0, maintenanceCost: 'low' },
      whyKept: '夹具：为覆盖"每个注册来源都有裁决"这一分支而生成',
      revisitBy: '夹具：下一次复查',
      headlessStability: null
    })))
  };
  const fixtureProblems = sr.validateRulings(fixtureDoc);
  check(`v3：现场生成的合法夹具通过 schema 校验（0 处问题，实际 ${fixtureProblems.length} 处）`,
    fixtureProblems.length === 0, fixtureProblems.slice(0, 2).join('；'));
  const fixtureFile = path.join(v3Tmp, 'source-rulings.fixture.json');
  fs.writeFileSync(fixtureFile, `${JSON.stringify(fixtureDoc, null, 2)}\n`);

  const landed1 = runReport(['--json', `--source-rulings=${fixtureFile}`]);
  const landed2 = runReport(['--json', `--source-rulings=${fixtureFile}`]);
  const payload = jsonOf(landed1.stdout);
  const landedProblems = landed1.stderr.split('\n').filter(text => text.trim().startsWith('- ')).map(text => text.trim().slice(2));
  check('v3：【确定性】喂同一份夹具的两次 --json 输出逐字节一致',
    landed1.stdout === landed2.stdout && landed1.status === 0 && landed2.status === 0,
    `status ${landed1.status}/${landed2.status}，长度 ${landed1.stdout.length}/${landed2.stdout.length}`);
  check('v3：裁决表落盘（夹具）后报告自检 0 处问题，且不再有待落盘层',
    landedProblems.length === 0 && !landed1.stdout.includes('报告自检待落盘层'),
    `问题 ${landedProblems.length} 处：${landedProblems.slice(0, 2).join('；')}`);

  if (!payload) {
    check('v3：v3 四节的 JSON 结构可核对：报告成功运行并在 stdout 给出 JSON', false,
      `报告退出码 ${landed1.status}；问题 ${landedProblems.slice(0, 3).join('；')}`);
  } else {
    const cov3 = payload.coverageTargets;
    const eq = cov3.releaseEvidence;
    const queue = cov3.releaseEvidenceQueue;
    const gap = cov3.gapClosureQueue;
    const rel = cov3.sourceReliability;

    /* --- ① Release Evidence Coverage --- */
    check('v3①：Release Evidence Coverage 四要素齐全（registry / known / unknown / known%），且已知 + 未知 == registry 模型数',
      eq.registryModels === cov3.currentModels.registryModels
      && eq.known + eq.unknown === eq.registryModels
      && typeof eq.knownPercent === 'number'
      && eq.knownPercent === Number(((eq.known / eq.registryModels) * 100).toFixed(1)),
      `registry=${eq.registryModels} known=${eq.known} unknown=${eq.unknown} known%=${eq.knownPercent}`);
    check('v3①：三维拆分（developer / modelRole / catalogStatus）各自闭合 —— 各档之和 == registry 模型数',
      ['byDeveloper', 'byModelRole', 'byCatalogStatus'].every(name => Array.isArray(eq[name])
        && eq[name].reduce((total, bucket) => total + bucket.total, 0) === eq.registryModels)
      && typeof eq.byDeveloper[0].known === 'number' && typeof eq.byDeveloper[0].unknown === 'number'
      && typeof eq.byDeveloper[0].knownPercent === 'number',
      ['byDeveloper', 'byModelRole', 'byCatalogStatus'].map(name => `${name}=${(eq[name] || []).reduce((total, bucket) => total + bucket.total, 0)}`).join(' '));
    check('v3①：已知/未知的判据是 lib 的 releaseDateOf().provided —— 与现有 unknownReleaseDates 读数**同源**（两处必须相等）',
      eq.unknown === cov3.currentModels.unknownReleaseDates.length
      && eq.known === Object.entries(registryTable).filter(([, entry]) => entry.releasedAt !== null && entry.releasedAt !== undefined).length
      && eq.known + eq.unknown === Object.keys(registryTable).length,
      `unknown=${eq.unknown} / unknownReleaseDates=${cov3.currentModels.unknownReleaseDates.length} / known=${eq.known}`);
    check('v3①：catalogStatus 拆分带完整词表（一档不落地也印出来 —— 与 R4 五态普查同一纪律）',
      eq.byCatalogStatus.map(bucket => bucket.key).join(',') === freshnessLib.CATALOG_STATUSES.join(','),
      eq.byCatalogStatus.map(bucket => `${bucket.key}:${bucket.total}`).join(' '));
    check('v3①：百分比写明「不是 KPI」（不许把观测量当目标线）',
      /不是 KPI/.test(eq.percentNote || '') && /观测指标/.test(eq.percentNote || '')
      && landed1.stdout.includes('百分比是观测指标，不是 KPI'),
      (eq.percentNote || '').slice(0, 80));

    /* --- ② Model Release Evidence Queue --- */
    const queueRules = Array.isArray(queue.rules) ? queue.rules.join(' ') : '';
    check('v3②：五条规则**原文**随队列一起输出（① ~ ⑤ 一条不少）',
      ['①', '②', '③', '④', '⑤'].every(mark => queueRules.includes(mark))
      && /comparableGroupOf/.test(queueRules) && /code-unit/.test(queueRules)
      && /api-plans\.json/.test(queueRules) && /plans\.json/.test(queueRules) && /long-tail/.test(queueRules),
      queueRules.slice(0, 120));
    check('v3②：队列覆盖全部 registry 模型，且 unknownCount 与第①节的 unknown **同源**',
      queue.total === eq.registryModels && queue.unknownCount === eq.unknown
      && queue.knownCount === eq.known && queue.unknownCount + queue.knownCount === queue.total);
    check('v3②：打印 N 是固定常量并在 JSON 里写明（前 N 条 = min(limit, total)）',
      Number.isInteger(queue.limit) && queue.limit > 0
      && queue.queue.length === Math.min(queue.limit, queue.total)
      && queue.queue.every((row, index) => row.rank === index + 1));
    check('v3②：队列次序**逐条复算**五条规则（① 未知优先 → ② 组规模降序 → ③ tier → ④ 下游引用 → ⑤ slug code-unit）',
      (() => {
        const tierRank = { core: 0, major: 1, 'long-tail': 2 };
        for (let index = 1; index < queue.queue.length; index += 1) {
          const a = queue.queue[index - 1];
          const b = queue.queue[index];
          if (a.releasedAtUnknown !== b.releasedAtUnknown) { if (!a.releasedAtUnknown) return false; continue; }
          if (a.groupSize !== b.groupSize) { if (a.groupSize < b.groupSize) return false; continue; }
          if (tierRank[a.tier] !== tierRank[b.tier]) { if (tierRank[a.tier] > tierRank[b.tier]) return false; continue; }
          if (a.referenced !== b.referenced) { if (!a.referenced) return false; continue; }
          if (!(a.slug < b.slug)) return false;
        }
        return queue.queue.every(row => ['core', 'major', 'long-tail'].includes(row.tier)
          && typeof row.groupSize === 'number'
          && row.referenced === (row.referencedByApiPlans || row.referencedByPlans));
      })(),
      queue.queue.slice(0, 3).map(row => `${row.rank}:${row.slug}/g${row.groupSize}/${row.tier}`).join(' '));
    check('v3②：tier 判据来自 coverage-targets（够不到 target 的按 long-tail），且与意图层逐行一致',
      queue.queue.every(row => {
        const target = ct.targetsList(targetsLoaded.doc).find(item => item.provider === row.provider);
        return row.tier === (target ? target.tier : 'long-tail');
      }));
    check('v3②：组键由 lib 的 comparableGroupOf() 给出（报告没有另写一份组键算法）',
      queue.groupJudgeAvailable === true && queue.queue.every(row => {
        const group = freshnessLib.comparableGroupOf(registryTable[row.slug] || {});
        return row.groupKey === group.key && row.groupKind === group.source;
      }));

    /* --- ③ Gap Closure Queue --- */
    const gapQueue = gap.queue;
    check('v3③：队列条数 == MISSING + PARTIAL，且 counts 之和 == 队列条数（每个格子恰好落进一档）',
      gapQueue.length === cov3.states.MISSING + cov3.states.PARTIAL
      && gap.counts.A + gap.counts.B + gap.counts.C + gap.counts.D === gapQueue.length
      && ['A', 'B', 'C', 'D'].every(priority => gap.counts[priority] === gapQueue.filter(row => row.priority === priority).length),
      JSON.stringify(gap.counts) + ` / ${gapQueue.length}`);
    check('v3③：每一条都带「目标 N / 已兑现 M / 缺 K / 出口状态」，且 K == N − M、M ≤ N',
      gapQueue.every(row => Number.isInteger(row.targetN) && Number.isInteger(row.coveredM) && Number.isInteger(row.missingK)
        && row.missingK === row.targetN - row.coveredM && row.coveredM <= row.targetN
        && ['MISSING', 'PARTIAL'].includes(row.state) && row.exitState === row.state
        && typeof row.present === 'number' && typeof row.reason === 'string'));
    check('v3③：分层规则**原文**随队列一起输出（A ~ D 四档 + 判据定义一条不少）',
      ['A = ', 'B = ', 'C = ', 'D = '].every(mark => gap.rules.join(' ').includes(mark))
      && /HIGH_VALUE_DIMENSIONS/.test(gap.rules.join(' ')) && /先命中先归/.test(gap.rules.join(' '))
      && /官方来源明确/.test(gap.rules.join(' ')) && /来源困难/.test(gap.rules.join(' '))
      && JSON.stringify(gap.highValueDimensions) === JSON.stringify(['api', 'models']));
    check('v3③：每一条的 priority 都能**逐条复算**出来（判据全部在 payload 里，不靠信任）',
      gapQueue.every(row => {
        const highCost = row.highCost === true;
        const hard = row.sourceHard === true || highCost;
        const expected = (row.tier === 'core' || row.tier === 'major')
          ? (row.tier === 'core' && row.highValue && row.explicitSource && !hard ? 'A'
            : (row.tier === 'major' && row.explicitSource && !hard ? 'B' : 'C'))
          : 'D';
        return row.priority === expected
          && row.explicitSource === (row.targetN > 0)
          && Array.isArray(row.declaredSources) && Array.isArray(row.hardSources) && Array.isArray(row.costlySources);
      }));
    // t7-F1 修复：原来这一条是 `gapQueue.filter(MISSING).every(present === 0)` —— 本轮 MISSING 已收口到 0，
    // `filter` 出**空集**、`every` 在空集上恒真 ⇒ 它已经**永远绿**了（假牙）。现在判据换成共用纯函数
    // `missingRowsProblems()`：先把"集合大小 == states.MISSING 计数"钉住（空集也要对上 0），再逐格判 present，
    // 并用三种扰动输入证明它**能被证伪**。
    const missingRowIssues = missingRowsProblems(gapQueue, cov3.states.MISSING);
    // 检查名**保持原样**（冻结标签：t6/t7 的证据按名引用它），但判据已经比原来更强：
    // 原来只有"每一格 present === 0"（本轮 MISSING=0 时是空集恒真），现在还额外钉住
    // "集合大小 == states.MISSING 计数"，并另加一条专门的**可证伪性**检查（下面那条）。
    check('v3③：MISSING 行的盘上记录必须是 0（MISSING 的定义：可覆盖、未延期、来源健康，但盘上一条都没有）',
      missingRowIssues.length === 0, missingRowIssues.join('；'));
    const missingRowTeeth = [
      {
        name: '合成单格 present 扰动（present=1）',
        problems: missingRowsProblems([{ state: 'MISSING', provider: '(合成)', dimension: 'deals', present: 1 }], 1)
      },
      {
        name: '集合大小与计数脱钩（空集 vs states.MISSING=1）',
        problems: missingRowsProblems([], 1)
      },
      {
        name: '真实载荷 ∨ 合成行：把一格 MISSING 的 present 改成 1',
        problems: missingRowsProblems(
          (gapQueue.some(row => row.state === 'MISSING') ? gapQueue : [{ state: 'MISSING', provider: '(合成)', dimension: 'deals', present: 1 }])
            .map(row => (row && row.state === 'MISSING' ? Object.assign({}, row, { present: 1 }) : row)),
          cov3.states.MISSING)
      }
    ];
    check('v3③【可证伪性·t7-F1】同一支判据在三种扰动输入下**必红**（否则 MISSING=0 时它就是空集恒真的假牙）',
      missingRowTeeth.every(teeth => teeth.problems.length > 0),
      missingRowTeeth.map(teeth => `${teeth.name} ⇒ ${teeth.problems[0] || '(没有报红)'}`).join('；'));
    console.log('    ℹ v3③ MISSING 判据可证伪性现场输出（三种扰动 ⇒ 必红）:');
    missingRowTeeth.forEach(teeth => console.log(`       · ${teeth.name} ⇒ ${teeth.problems[0] || '(没有报红)'}`));

    /* --- ④ Source Reliability summary --- */
    const sv = cov3.sourceHealth;
    check('v3④：Source Reliability 必须打印 generatedAt —— 且它与心跳文件里写的**逐字相等**（不是跑报告的墙钟时间）',
      typeof rel.healthGeneratedAt === 'string' && rel.healthGeneratedAt === readJson('scripts/data/source-health.json').generatedAt
      && landed1.stdout.includes(rel.healthGeneratedAt),
      `${rel.healthGeneratedAt}`);
    check('v3④：沿用既有 sourceHealth.registryRowCount / registryRows / registryOnlySources 口径（两处逐字相等，不另算一份）',
      rel.registryRowCount === sv.registryRowCount && rel.registryRowCount === rel.registryRows.length
      && JSON.stringify(rel.registryRows) === JSON.stringify(sv.registryRows)
      && JSON.stringify(rel.registryOnlySources) === JSON.stringify(sv.registryOnlySources));
    check('v3④：裁决 × live 读数 join 成型（每条裁决都带身份命中与心跳读数，且 health 的连续失败次数来自文件）',
      rel.present === true && rel.notLanded === false
      && rel.rulings.length === rel.decisionOrder.reduce((total, decision) => total + rel.decisionCounts[decision], 0)
      && rel.rulings.every(row => row.health && typeof row.health.consecutiveFailures === 'number'
        && row.resolvedBy !== null
        && (row.registry
          ? row.health.consecutiveFailures === readJson('scripts/data/source-health.json').sources
            .find(source => source.source === row.registry.id).consecutiveFailures
          : /health/.test(row.resolvedBy)))
      && rel.rulings.every((row, index) => index === 0 || rel.rulings[index - 1].source < row.source),
      `裁决 ${rel.rulings.length} 条：${rel.decisionOrder.map(decision => `${decision}=${rel.decisionCounts[decision]}`).join(' ')}`);
    check('v3④：三方对账（裁决 ↔ 采集器注册表 ↔ source-health）0 处问题，且规则原文写进 JSON',
      rel.reconciliation.problemCount === 0 && rel.reconciliation.problems.length === 0
      && rel.reconciliation.ruleCount === 4
      && /retire/.test(rel.reconciliation.ruleNote) && /consecutiveFailures/.test(rel.reconciliation.ruleNote)
      && rel.collectorRegistryCount === require('../collectors').list().length,
      JSON.stringify(rel.reconciliation.problems).slice(0, 160));
    check('v3④：面板上的差异集是**算出来的**（未裁决的注册表行 == 注册表 ∖ 已裁决，不多不少）',
      rel.reconciliation.unruledRegistrySources.length
      === require('../collectors').list().filter(source => !rel.rulings.some(row => row.registry && row.registry.id === source.id)).length);

    /* --- 文本 / JSON 同源 --- */
    const gapCountsLine = /队列共 (\d+) 条：A (\d+) · B (\d+) · C (\d+) · D (\d+)/.exec(landed1.stdout);
    check('v3：文本与 JSON **同源**（分层计数行、已知/未知行、队列长度在两侧逐字一致）',
      Boolean(gapCountsLine)
      && Number(gapCountsLine[1]) === gapQueue.length
      && Number(gapCountsLine[2]) === gap.counts.A && Number(gapCountsLine[3]) === gap.counts.B
      && Number(gapCountsLine[4]) === gap.counts.C && Number(gapCountsLine[5]) === gap.counts.D
      && landed1.stdout.includes(`未知 official release date`) && landed1.stdout.includes(`未知发布日期 ${queue.unknownCount} 条`),
      gapCountsLine ? gapCountsLine[0] : '(文本里没有分层计数行)');
    check('v3：四节的标题在文本里都在（文本侧不是只写了 JSON）',
      ['Release Evidence Coverage', 'Model Release Evidence Queue', 'Gap Closure Queue', 'Source Reliability summary']
        .every(title => landed1.stdout.includes(title)));

    /* --- 夹具反证（非法输入 ⇒ 必红），逐键覆盖 --- */
    const writeFixture = (name, mutate) => {
      const doc = clone(fixtureDoc);
      mutate(doc);
      const file = path.join(v3Tmp, name);
      fs.writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`);
      return file;
    };
    const redRun = (file, needle) => {
      const result = runReport([`--source-rulings=${file}`]);
      return {
        ok: result.status !== 0 && result.stderr.includes(needle),
        exit: result.status,
        hit: (result.stderr.split('\n').find(text => text.includes(needle)) || '(没有点到要害)').trim().slice(0, 140)
      };
    };

    const noWhyKept = writeFixture('bad-whykept.json', doc => { doc.rulings[0].whyKept = null; });
    const noWhyKeptRun = redRun(noWhyKept, '必须写 whyKept');
    check('【反证牙·v3④】keep-degraded 缺 whyKept ⇒ 报告自检非 0，并点名「必须写 whyKept」',
      noWhyKeptRun.ok, `exit ${noWhyKeptRun.exit}；${noWhyKeptRun.hit}`);

    const retireRegistered = writeFixture('bad-retire.json', doc => {
      doc.rulings[0].decision = 'retire';
      doc.rulings[0].whyKept = null;
      doc.rulings[0].revisitBy = null;
    });
    const retireRun = redRun(retireRegistered, '仍然挂在采集器注册表里');
    check('【反证牙·v3④】已裁决 retire 的来源仍在采集器注册表 ⇒ 报告自检非 0，并点名「仍然挂在采集器注册表里」',
      retireRun.ok, `exit ${retireRun.exit}；${retireRun.hit}`);

    const emptyRulings = writeFixture('bad-empty.json', doc => { doc.rulings = []; });
    const emptyRun = redRun(emptyRulings, '却没有在 scripts/data/source-rulings.json 里留下裁决');
    check('【反证牙·v3④】连续失败 ≥ 3 次的来源一条裁决都没有 ⇒ 报告自检非 0，并点名「没有在 source-rulings.json 里留下裁决」',
      emptyRun.ok, `exit ${emptyRun.exit}；${emptyRun.hit}`);

    const unordered = writeFixture('bad-order.json', doc => { doc.rulings.reverse(); });
    const unorderedRun = redRun(unordered, '不是规范序');
    check('【反证牙·v3④】裁决数组不是按 source 的 code-unit 序 ⇒ 报告自检非 0，并点名「不是规范序」',
      unorderedRun.ok, `exit ${unorderedRun.exit}；${unorderedRun.hit}`);

    const brokenJson = path.join(v3Tmp, 'bad-json.json');
    fs.writeFileSync(brokenJson, '{ this is not json }\n');
    const brokenRun = redRun(brokenJson, '解析失败');
    check('【反证牙·v3④】裁决表在盘上但读不出来 ⇒ 报告自检非 0（"坏文件"与"尚未落盘"必须是两件事）',
      brokenRun.ok, `exit ${brokenRun.exit}；${brokenRun.hit}`);

    /* --- ① / ② 的反证：判据层被喂进"写了但判不了的发布日期"与"空串日期" --- */
    const sourceDoc = readJson('scripts/data/models.json');
    const unparsableDoc = clone(sourceDoc);
    unparsableDoc['deepseek-flash'].releasedAt = '2026-10';            // 写了，但解析不出可判日
    const unparsableFile = path.join(v3Tmp, 'models-unparsable.json');
    fs.writeFileSync(unparsableFile, `${JSON.stringify(unparsableDoc, null, 2)}\n`);
    const unparsableRun = runReport([`--models=${unparsableFile}`]);
    check('【反证牙·v3①】有模型的 releasedAt 写了却解析不出可判日 ⇒ 报告自检非 0，并点名「解析不出可判日」',
      unparsableRun.status !== 0 && unparsableRun.stderr.includes('解析不出可判日'),
      `exit ${unparsableRun.status}；${(unparsableRun.stderr.split('\n').find(text => text.includes('解析不出')) || '(没有点到)').trim().slice(0, 120)}`);

    const blankDoc = clone(sourceDoc);
    blankDoc['deepseek-flash'].releasedAt = '';                        // 空串：两处读数会分家
    const blankFile = path.join(v3Tmp, 'models-blank-date.json');
    fs.writeFileSync(blankFile, `${JSON.stringify(blankDoc, null, 2)}\n`);
    const blankRun = runReport([`--models=${blankFile}`]);
    check('【反证牙·v3②】releasedAt 写成空串（规则①的判据与既有 unknown release dates 分家）⇒ 报告自检非 0，并点名「两处读数不一致」',
      blankRun.status !== 0 && blankRun.stderr.includes('两处读数不一致'),
      `exit ${blankRun.status}；${(blankRun.stderr.split('\n').find(text => text.includes('不一致')) || '(没有点到)').trim().slice(0, 140)}`);

    /* --- ③ 的反证：gap queue 的输入层被改成非法 --- */
    const targetsDoc = readJson('scripts/data/coverage-targets.json');
    const badTargets = clone(targetsDoc);
    const gamma = badTargets.targets.find(target => target.currentTargets
      .some(item => item.dimension === 'models'));
    gamma.currentTargets = gamma.currentTargets
      .filter(item => item.dimension !== 'models')
      .concat([{ dimension: 'models', registrySlug: 'ghost-model-000' }]);
    const badTargetsFile = path.join(v3Tmp, 'targets-bad-slug.json');
    fs.writeFileSync(badTargetsFile, `${JSON.stringify(badTargets, null, 2)}\n`);
    const badTargetsRun = runReport([`--targets=${badTargetsFile}`]);
    check('【反证牙·v3③】gap queue 的输入层非法（current target 指向不存在的 registrySlug）⇒ 报告自检非 0，并点名「不在 scripts/data/models.json」',
      badTargetsRun.status !== 0 && badTargetsRun.stderr.includes('不在 scripts/data/models.json'),
      `exit ${badTargetsRun.status}；${(badTargetsRun.stderr.split('\n').find(text => text.includes('models.json')) || '(没有点到)').trim().slice(0, 140)}`);
  }
} finally {
  try { fs.rmSync(v3Tmp, { recursive: true, force: true }); } catch (error) { /* 临时目录清不掉不影响判据 */ }
}

/* ================================================================== */

console.log(`\n=== coverage-expansion-v1 覆盖意图层演练：${passed} 项通过，${failures.length} 项失败 ===`);
if (failures.length) {
  console.log('失败项：');
  failures.forEach(name => console.log(`  ✗ ${name}`));
  process.exit(1);
}
