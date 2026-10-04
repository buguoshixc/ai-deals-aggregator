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

/**
 * 【临时诊断】平台相关的失败需要 CI 侧的**原始字节**才能定位，而 CI 里无法交互式调试，
 * 所以把决定 `jsonOf()` 成败的那几步打进日志（每段有上限，不会淹掉日志）。
 * 定位到根因后本函数连同调用点在修复合入前移除。
 */
function diagnoseJsonExtraction(stdout) {
  const marker = '\nJSON:\n';
  const at = stdout.indexOf(marker);
  const rest = at < 0 ? '' : stdout.slice(at + marker.length);
  const end = rest.lastIndexOf('\n✅');
  const cut = end < 0 ? rest : rest.slice(0, end);
  const clamp = (s, n) => (s.length <= n ? s : `${s.slice(0, n)}…(+${s.length - n})`);
  const codes = s => JSON.stringify(Array.from(s.slice(0, 12)).map(c => c.codePointAt(0)));
  let parsed = 'not-attempted';
  try { JSON.parse(cut); parsed = 'ok'; } catch (error) { parsed = `THROW: ${error.message}`; }
  console.log('    ── 【诊断】jsonOf 分解 ──');
  console.log(`    stdout: 字符 ${stdout.length} · 字节 ${Buffer.byteLength(stdout, 'utf8')} · 含 CR=${stdout.includes('\r')}`);
  console.log(`    marker '\\nJSON:\\n' 位置: ${at}`);
  console.log(`    切割点 '\\n✅' lastIndexOf: ${end}  ⇒ 待解析段 ${cut.length} 字符`);
  console.log(`    待解析段首码位: ${codes(cut)}`);
  console.log(`    JSON.parse: ${parsed}`);
  console.log(`    末尾 80 字符: ${clamp(JSON.stringify(stdout.slice(-80)), 400)}`);
  if (at >= 0) console.log(`    marker 前 60 字符: ${clamp(JSON.stringify(stdout.slice(Math.max(0, at - 60), at)), 300)}`);
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

function runReport(args) {
  const result = spawnSync(process.execPath, [REPORT, ...args], {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024
  });
  return { status: result.status, stdout: result.stdout || '', stderr: result.stderr || '' };
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
 * 语义锚点（t29 补；t46 追加）——白名单里各键**锚在哪个读数**上：
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
  coverageTargets: ['catalogStatusCensus'],
  'coverageTargets.sourceHealth': ['registryRowCount', 'registryRows', 'registryOnlySources']
};

/** 点分路径取值（契约表里的嵌套节用 `a.b.c` 寻址）；取不到 ⇒ undefined（由契约判据判"缺键"） */
function valueAt(node, dotted) {
  return String(dotted).split('.').reduce((current, key) => (current === null || current === undefined ? undefined : current[key]), node);
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
  if (!payload1 || !payload2) {
    // 【临时诊断】只在失败时打印；定位后移除。
    console.log(`    第 1 次: status=${iso1.status} stderr 前 300 字符=${JSON.stringify(iso1.stderr.slice(0, 300))}`);
    diagnoseJsonExtraction(iso1.stdout);
    console.log(`    第 2 次与第 1 次 stdout 逐字节一致: ${iso1.stdout === iso2.stdout}`);
  }

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
        'notApplicable', 'blockedBySourceHealth', 'currentModels', 'sourceHealth', 'freshness']
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
    const reg = payload1.registry || {};
    const gap = payload1.gaps || {};
    check('t25：registry 新增 API 侧处置键（映射 A / 已处置 B / 逐条留档）且三者和 == 计价条目总数',
      reg.mappedApiEntries + reg.declaredApiEntries + gap.unmappedModelCount === payload1.api.modelPricingItems
      && reg.declaredApiEntries === gap.declaredApiEntryCount
      && Array.isArray(reg.declaredApiEntryRows));
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

console.log(`\n=== coverage-expansion-v1 覆盖意图层演练：${passed} 项通过，${failures.length} 项失败 ===`);
if (failures.length) {
  console.log('失败项：');
  failures.forEach(name => console.log(`  ✗ ${name}`));
  process.exit(1);
}
