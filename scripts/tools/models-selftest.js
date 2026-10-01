#!/usr/bin/env node
/**
 * v3.0 Stage D：Model Registry 门禁演练（离线、秒级）。
 *
 * 它演练的不是"代码跑得通"，而是**这套身份层赖以成立的承诺**（题面 Stage D + §8 的牙）：
 *
 *   · 身份靠显式映射：同名 ≠ 同一模型；alias 不许指向两个模型；modelKey 改名只能进候选、不许自动 merge；
 *   · 派生字段不可手写：id / firstSeen / lastSeen 只能由构建期算出来；
 *   · 引文不许新造：链接的引文必须逐字来自被引用记录自己的官方引文；
 *   · 可重建：打乱来源层键序仍得到同一串字节；
 *   · 没有输入不许假绿：空 registry / 空关系层都必须报红。
 *
 * 判据标准与既有 selftest 一致：**红的时候没有别的步骤会替它红**，所以它进 CI 门禁。
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const reg = require('../lib/model-registry');
const providers = require('../lib/providers');

let passed = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) { passed++; console.log(`  ✓ ${name}`); }
  else { failures.push({ name, detail }); console.log(`  ✗ ${name}${detail ? ` —— ${detail}` : ''}`); }
}
function section(title) { console.log(`\n${title}`); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }

const apiPlans = JSON.parse(fs.readFileSync(path.join(ROOT, 'api-plans.json'), 'utf8')).plans;
const plans = JSON.parse(fs.readFileSync(path.join(ROOT, 'plans.json'), 'utf8')).plans;
const providerTable = providers.load().table;
const DEVELOPERS = Object.values(providerTable).map(entry => String((entry && entry.name) || ''));

const modelsLoad = reg.load();
const linksLoad = reg.loadLinks();
const table = modelsLoad.table;
const links = linksLoad.doc;
const EXTRA = Object.keys((modelsLoad.doc && modelsLoad.doc._developers_extra) || {});
const ctx = { developers: DEVELOPERS, extraDevelopers: EXTRA };
const linkCtx = { table, apiPlans, plans };

function hasProblem(problems, needle) {
  return problems.some(problem => String(problem).includes(needle));
}

/* ================================================================== */

section('① 真实数据自洽');

{
  const problems = reg.validateRegistry(table, ctx);
  check(`真实的 models.json 通过身份校验（${Object.keys(table).length} 条）`, problems.length === 0, problems.slice(0, 5).join(' | '));
  const linkProblems = reg.validateLinks(links, linkCtx);
  check(`真实的 model-registry-links.json 通过关系校验（${reg.linksList(links).length} 条）`, linkProblems.length === 0, linkProblems.slice(0, 5).join(' | '));

  const coverage = reg.coverageOf({ table, links, apiPlans, plans });
  check('每个 registry 模型都至少被一条显式映射引用（未映射的不生成页面）',
    coverage.unlinkedModels.length === 0, coverage.unlinkedModels.join(' | '));
  check('没有任何 API modelKey 未映射（覆盖报告里的 0 是结论，不是没算）',
    coverage.unmappedModelKeys.length === 0,
    coverage.unmappedModelKeys.slice(0, 5).map(item => `${item.provider}/${item.modelKey}`).join(' | '));
  console.log(`    未映射的套餐模型串：${coverage.unmappedPlanModels.length} 条（如实登记，见 check-model-registry-links 的输出）`);

  const published = reg.publishedModels({ table, links, apiPlans, plans });
  const badTimeline = published.models.filter(model => model.firstSeen && model.lastSeen && model.firstSeen > model.lastSeen);
  check('派生时间线自洽：firstSeen ≤ lastSeen', badTimeline.length === 0, badTimeline.map(model => model.slug).join(' | '));
  check('派生 id 全部是 12 位十六进制且两两不同',
    published.models.every(model => /^[0-9a-f]{12}$/.test(model.id)) &&
    new Set(published.models.map(model => model.id)).size === published.models.length);
  check('id 与 slug 一致（同一 slug 永远同一个 id）',
    published.models.every(model => model.id === reg.modelIdOf(model.slug)));

  // officialUrl 交叉：模型的官方页必须是它某条 API 映射记录里引用过的那个 URL
  const apiUrlsBySlug = new Map();
  for (const link of reg.linksList(links)) {
    if (!link.apiPlanId) continue;
    const plan = apiPlans.find(item => item.id === link.apiPlanId);
    if (!plan) continue;
    if (!apiUrlsBySlug.has(link.registrySlug)) apiUrlsBySlug.set(link.registrySlug, new Set());
    apiUrlsBySlug.get(link.registrySlug).add(plan.officialUrl);
    for (const item of (plan.evidence || [])) apiUrlsBySlug.get(link.registrySlug).add(item.sourceUrl);
  }
  const strayUrls = published.models.filter(model => {
    if (!model.officialUrl) return false;
    const allowed = apiUrlsBySlug.get(model.slug);
    return !allowed || !allowed.has(model.officialUrl);
  });
  check('每个模型的 officialUrl 都是它某条映射记录里真实引用过的官方页（不许出现凭空的链接）',
    strayUrls.length === 0, strayUrls.map(model => `${model.slug} → ${model.officialUrl}`).slice(0, 3).join(' | '));
}

/* ================================================================== */

section('② 题面 §8 的 5 条 Model Registry 牙');

{
  // 牙 #1：两个同名模型来自不同开发者，被错误自动合并 → 红
  const sameName = clone(table);
  sameName['ghost-model'] = {
    canonicalName: sameName['glm-5.3'].canonicalName,
    developer: 'OpenAI',
    owner: 'OpenAI',
    family: 'GLM',
    aliases: [],
    officialUrl: null,
    status: 'active',
    note: null
  };
  const problem1 = reg.validateRegistry(sameName, ctx);
  check('【牙 #1】同名不同开发者的两条模型（被合并成一个名字）→ 红',
    hasProblem(problem1, '同名不等于同一模型'), problem1.slice(0, 2).join(' | '));

  // 牙 #2：alias 指向两个 registry 模型 → 红
  const aliasClash = clone(table);
  aliasClash['ghost-model-2'] = Object.assign({}, aliasClash['glm-5.3'], { canonicalName: 'Ghost Model 2', aliases: ['zai-org/GLM-5.3'] });
  const problem2 = reg.validateRegistry(aliasClash, ctx);
  check('【牙 #2】同一个 alias 指向两个 registry 模型 → 红',
    hasProblem(problem2, '同一个别名只能指向一个模型'), problem2.slice(0, 2).join(' | '));
  const slugClash = clone(table);
  slugClash['ghost-model-3'] = Object.assign({}, slugClash['glm-5.3'], { canonicalName: 'Ghost Model 3', aliases: ['glm-5.3-flash'] });
  check('【牙 #2】alias 与另一个模型的 slug 撞车 → 红',
    hasProblem(reg.validateRegistry(slugClash, ctx), '与某个 registry slug 冲突'));

  // 牙 #3：mapping 指向不存在 api plan / modelKey（以及不存在的 planId / modelName）→ 红
  const ghostPlan = { schemaVersion: 1, links: [Object.assign({}, clone(reg.linksList(links)[0]), { apiPlanId: 'ffffffffffff' })] };
  check('【牙 #3】映射指向不存在的 apiPlanId → 红',
    hasProblem(reg.validateLinks(ghostPlan, linkCtx), '不存在'));
  const ghostKey = { schemaVersion: 1, links: [Object.assign({}, clone(reg.linksList(links)[0]), { modelKey: 'no-such-model-key' })] };
  check('【牙 #3】映射指向不存在的 modelKey → 红',
    hasProblem(reg.validateLinks(ghostKey, linkCtx), 'modelKey'));
  const codingLink = reg.linksList(links).find(link => link.planId);
  const ghostPlanId = { schemaVersion: 1, links: [Object.assign({}, clone(codingLink), { planId: 'ffffffffffff' })] };
  check('【牙 #3】Coding 映射指向不存在的 planId → 红',
    hasProblem(reg.validateLinks(ghostPlanId, linkCtx), 'planId'));
  const ghostModelName = { schemaVersion: 1, links: [Object.assign({}, clone(codingLink), { modelName: '不存在的模型' })] };
  check('【牙 #3】Coding 映射的 modelName 不在套餐里 → 红',
    hasProblem(reg.validateLinks(ghostModelName, linkCtx), 'supportedModels'));
  const ghostSlug = { schemaVersion: 1, links: [Object.assign({}, clone(reg.linksList(links)[0]), { registrySlug: 'no-such-slug' })] };
  check('【牙 #3】映射指向不存在的 registrySlug → 红',
    hasProblem(reg.validateLinks(ghostSlug, linkCtx), '不在 models.json 里'));

  // 牙 #4：modelKey 改名被工具直接自动 merge → 红（+ 结构上不允许自动 merge）
  const renamed = { schemaVersion: 1, links: reg.linksList(links).map(link => Object.assign({}, clone(link))) };
  renamed.links = renamed.links.map(link => (link.apiPlanId === '646f01c662e6' && link.modelKey === 'glm-5.3'
    ? Object.assign({}, link, { modelKey: 'glm-5.4-renamed' })
    : link));
  const problem4 = reg.validateLinks(renamed, linkCtx);
  check('【牙 #4】api-plans 里 modelKey 改名后，旧映射必须红（工具不许自动 merge 到新键）',
    hasProblem(problem4, 'modelKey'), problem4.slice(0, 2).join(' | '));
  const libSource = fs.readFileSync(path.join(ROOT, 'scripts/lib/model-registry.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  check('【牙 #4】身份层没有任何写生产映射的代码路径（不出现 writeFileSync）',
    !/writeFileSync|createWriteStream/.test(libSource));
  check('【牙 #4】身份层没有任何相似度算法（去掉注释后不出现 levenshtein / similarity / dice / jaro）',
    !/levenshtein|similarit|dice|jaro/i.test(libSource), (libSource.match(/levenshtein|similarit|dice|jaro/gi) || []).join(','));
  const candidates = reg.candidatesOf({ table, apiPlans });
  check('【牙 #4】相似度/归一匹配只能产出候选：每条候选都带 status=candidate，且没有生产字段',
    candidates.length > 0 && candidates.every(item => item.status === 'candidate' && item.registrySlug && !item.evidence));

  // 牙 #5：Model Page 会展示一个"不存在的 Provider / 开发者" → 红
  const ghostDev = clone(table);
  ghostDev['ghost-dev-model'] = Object.assign({}, clone(ghostDev['glm-5.3']), { canonicalName: 'Ghost Dev Model', developer: 'OpenAI 公司（未登记）', owner: 'OpenAI 公司（未登记）' });
  const problem5 = reg.validateRegistry(ghostDev, ctx);
  check('【牙 #5】页面会展示一个未登记的 developer（"不存在的 Provider"）→ 红',
    hasProblem(problem5, '不在允许的开发者名单里'), problem5.slice(0, 2).join(' | '));
  const nullOk = clone(table);
  nullOk['ghost-dev-model'] = Object.assign({}, clone(nullOk['glm-5.3']), { canonicalName: 'Ghost Dev Model', developer: null, owner: null });
  check('【牙 #5】反向：开发者判不出来时写 null 是合法的（不是一律禁止缺字段）',
    !hasProblem(reg.validateRegistry(nullOk, ctx), '不在允许的开发者名单里'));
}

/* ================================================================== */

section('③ 派生字段、引文与"没有输入不许假绿"');

{
  const handwritten = clone(table);
  handwritten['glm-5.3'] = Object.assign({}, handwritten['glm-5.3'], { id: 'deadbeefcafe', firstSeen: '2026-01-01' });
  const problem = reg.validateRegistry(handwritten, ctx);
  check('手写派生字段 id / firstSeen → 红（它们只能算出来）',
    hasProblem(problem, '派生字段 id') && hasProblem(problem, '派生字段 firstSeen'), problem.slice(0, 3).join(' | '));

  const sourceLinks = reg.linksList(links);
  const withId = { schemaVersion: 1, links: sourceLinks.map(link => Object.assign({}, clone(link))) };
  withId.links[0].registryModelId = 'deadbeefcafe';
  check('来源关系层里手写 registryModelId → 红（它是发布时注入的派生字段）',
    hasProblem(reg.validateLinks(withId, linkCtx), '派生字段'));

  const invented = { schemaVersion: 1, links: sourceLinks.map(link => Object.assign({}, clone(link))) };
  invented.links[0].evidence = [{ field: 'models.编造的字段', quote: '编造的引文', sourceUrl: 'https://example.com/x', capturedAt: '2026-10-01', lang: 'zh' }];
  check('凭空写一条引文（不在被引用记录的 evidence 里）→ 红',
    hasProblem(reg.validateLinks(invented, linkCtx), '不是被引用记录自己的官方引文'));

  const explicitWithEvidence = { schemaVersion: 1, links: sourceLinks.map(link => Object.assign({}, clone(link))) };
  const codingIndex = explicitWithEvidence.links.findIndex(link => link.basis === 'explicit-mapping');
  explicitWithEvidence.links[codingIndex].evidence = [];
  explicitWithEvidence.links[codingIndex].note = null;
  check('basis=explicit-mapping 却不写 note → 红（"没有引文"也必须说出来）',
    hasProblem(reg.validateLinks(explicitWithEvidence, linkCtx), '必须写 note'));

  const noEvidence = { schemaVersion: 1, links: sourceLinks.map(link => Object.assign({}, clone(link))) };
  noEvidence.links[0].evidence = [];
  check('引文类 basis 却没有引文 → 红',
    hasProblem(reg.validateLinks(noEvidence, linkCtx), '要求至少一条官方引文'));

  const emptyTable = reg.validateRegistry({}, ctx);
  check('空 registry → 红（"什么都没有"不是通过）', hasProblem(emptyTable, '没有任何模型'));
  check('registry 里有模型、关系层却一条映射都没有 → 红（"没写"不是"干净"）',
    hasProblem(reg.validateLinks({ schemaVersion: 1, links: [] }, { table, apiPlans, plans }), '关系层没写'));
  check('空表 + 空关系层 → 红（模型一个都不存在 / registry 为空）',
    reg.validateRegistry({}, ctx).length > 0);

  const wrongVersion = { schemaVersion: 99, links: sourceLinks.map(link => clone(link)) };
  check('schemaVersion 不对 → 红', hasProblem(reg.validateLinks(wrongVersion, linkCtx), 'schemaVersion'));

  const unordered = { schemaVersion: 1, links: [...sourceLinks].reverse().map(link => clone(link)) };
  check('关系层顺序不是规范序 → 红（打乱输入仍必须得到同一串字节）',
    hasProblem(reg.validateLinks(unordered, linkCtx), '规范序'));
}

/* ================================================================== */

section('④ 可重建与身份稳定性');

{
  const publishedA = reg.serialize(reg.publishedModels({ table, links, apiPlans, plans }));
  const publishedB = reg.serialize(reg.publishedModels({ table, links, apiPlans, plans }));
  check('同一份来源层两次产出逐字节相同', publishedA === publishedB);

  const shuffled = {};
  for (const slug of Object.keys(table).sort().reverse()) shuffled[slug] = table[slug];
  const shuffledText = reg.serialize(reg.publishedModels({ table: shuffled, links, apiPlans, plans }));
  check('打乱来源层键序 → 产物逐字节不变（规范排序不是装饰）', shuffledText === publishedA);

  const publishedLinksText = reg.serialize(reg.publishedLinks(links, table));
  const linkDoc = JSON.parse(publishedLinksText);
  check('发布关系层给每条记录注入了 registryModelId（渲染层按 id 匹配）',
    linkDoc.links.every(link => link.registryModelId === reg.modelIdOf(link.registrySlug)));
  check('发布关系层的字段顺序是规范序（registrySlug 后紧跟 registryModelId）',
    linkDoc.links.every(link => {
      const keys = Object.keys(link);
      return keys.indexOf('registryModelId') === keys.indexOf('registrySlug') + 1;
    }));

  const resolveChecks = [
    ['glm-5.3', 'glm-5.3'],
    ['zai-org/GLM-5.3', 'glm-5.3'],
    ['GLM-5.3', null],
    ['glm-5.3 ', null],
    ['deepseek-v4.1-flash', 'deepseek-flash']
  ];
  check('slug / 别名的解析是精确相等（不做大小写折叠、不做 trim、不猜）',
    resolveChecks.every(([input, expected]) => reg.resolveSlug(input, table) === expected),
    resolveChecks.map(([input, expected]) => `${input}→${reg.resolveSlug(input, table)}(期望 ${expected})`).join(' · '));

  const summary = reg.summarize(reg.publishedModels({ table, links, apiPlans, plans }));
  check('汇总：44 个模型全部 active、0 retired（退役只由人工依据驱动）',
    summary.total === 44 && summary.byStatus.active === 44 && summary.byStatus.retired === 0,
    JSON.stringify(summary));
}

/* ================================================================== */

console.log('');
if (failures.length) {
  console.log(`❌ === v3.0 Model Registry 演练：${passed} 项通过，${failures.length} 项失败 ===`);
  failures.forEach(item => console.log(`   - ${item.name}${item.detail ? ` —— ${item.detail}` : ''}`));
  process.exit(1);
}
console.log(`✅ === v3.0 Model Registry 演练：${passed} 项通过，0 项失败 ===`);
process.exit(0);
