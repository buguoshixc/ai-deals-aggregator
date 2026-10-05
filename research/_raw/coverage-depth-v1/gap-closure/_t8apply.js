/**
 * t8（Workstream B-2）一次性落盘脚本：新增 registry 身份 → 映射 → 清掉已被映射覆盖的处置声明 → 意图层声明。
 * 只用 lib 的判据与排序器（scripts/lib/model-registry.js · coverage-targets.js），不另建一套。
 * 权限：只做「新增身份」；不改任何既有条目的 releasedAt / releaseEvidence / slug。
 *
 * 用法：node research/_raw/coverage-depth-v1/gap-closure/_t8apply.js [--dry-run]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const registry = require(path.join(ROOT, 'scripts', 'lib', 'model-registry.js'));
const ct = require(path.join(ROOT, 'scripts', 'lib', 'coverage-targets.js'));
const providers = require(path.join(ROOT, 'scripts', 'lib', 'providers.js'));

const MODELS_FILE = path.join(ROOT, 'scripts', 'data', 'models.json');
const LINKS_FILE = path.join(ROOT, 'scripts', 'data', 'model-registry-links.json');
const GAPS_FILE = path.join(ROOT, 'scripts', 'data', 'model-registry-gaps.json');
const TARGETS_FILE = path.join(ROOT, 'scripts', 'data', 'coverage-targets.json');
const API_PLANS_FILE = path.join(ROOT, 'api-plans.json');

const read = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const write = (f, doc) => fs.writeFileSync(f, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');

/* ---------------- ① 新增 registry 身份 ---------------- */

const CAPTURED = '2026-10-05';
const A360_PRO = 'https://ai.360.com/open/zh/models/360zhinao/360zhinao-pro';
const A360_TURBO = 'https://ai.360.com/open/zh/models/360zhinao/360zhinao-turbo-llm-geo';
const BC = 'https://platform.baichuan-ai.com/prices';
const BD = 'https://cloud.baidu.com/doc/qianfan-docs/s/Jm8r1826a';
const XF = 'https://xinghuo.xfyun.cn/sparkapi';

function entry(canonicalName, developer, family, officialUrl, modelRole, releasedAt, releaseEvidence, note) {
  return {
    canonicalName, developer, owner: developer, family, aliases: [], officialUrl,
    status: 'active', modelRole, releasedAt, releaseEvidence, freshnessGroup: null, note
  };
}

const NEW_ENTRIES = {
  '360zhinao-pro': entry(
    '360zhinao-pro', '360智脑', '360zhinao', A360_PRO, null, '2026-08-05',
    [{ field: 'releasedAt', quote: '360zhinao/360zhinao-pro 在线对话 360智脑 发布时间 2026/8/5 模型系列 360智脑 … 上下文窗口 32,000 最大输出长度 8,192', sourceUrl: A360_PRO, capturedAt: CAPTURED }],
    '官方模型页逐字写「发布时间 2026/8/5」（斜杠、未补零），releasedAt 规范化成 2026-08-05，引文保留官方原写法；官方全名带命名空间前缀 `360zhinao/`。modelRole 留 null：官方页只给系列 / 模态 / 定价，没有能力标记。'
  ),
  '360zhinao-turbo-llm-geo': entry(
    '360zhinao-turbo-llm-geo', '360智脑', '360zhinao', A360_TURBO, null, '2026-08-24',
    [{ field: 'releasedAt', quote: '360zhinao/360zhinao-turbo-llm-geo 在线对话 360智脑 发布时间 2026/8/24 模型系列 360智脑 … 业务内部专用模型', sourceUrl: A360_TURBO, capturedAt: CAPTURED }],
    '官方模型页逐字写「发布时间 2026/8/24」（斜杠、未补零），releasedAt 规范化成 2026-08-24；官方写「业务内部专用模型」。modelRole 留 null：官方页无可落进枚举的能力标记。'
  ),
  'baichuan-m3': entry(
    'Baichuan-M3', '百川智能', 'Baichuan M', BC, 'general', null, [],
    '官方价目页逐字写「模型调用 Baichuan-M3」；官方页面无发布日（只有计费行）⇒ releasedAt 留 null / releaseEvidence 为空。modelRole=general 的依据是官方按「对话全流程节点产生的 Token 总数」计费；同页「医疗搜索」不落进 MODEL_ROLES 枚举，不据此改角色。'
  ),
  'baichuan-m3-plus': entry(
    'Baichuan-M3-Plus', '百川智能', 'Baichuan M', BC, 'general', null, [],
    '官方价目页逐字写「模型调用 Baichuan-M3-Plus」（上下文 32k）；官方页面无发布日 ⇒ releasedAt 留 null。modelRole=general 的依据同 Baichuan-M3（官方按对话全流程计费）。'
  ),
  'ernie-4.5-turbo-128k': entry(
    'ERNIE-4.5-Turbo-128K', '百度智能云', 'ERNIE', BD, 'general', null, [],
    '官方「价格」页把该模型列在「文本生成」节下，版本名称逐字为「ERNIE-4.5-Turbo-128K」；页面只有更新时间（2026-07-09），不是发布日 ⇒ releasedAt 留 null。modelRole=general 取自官方分节「文本生成」。'
  ),
  'ernie-5.1': entry(
    'ERNIE-5.1', '百度智能云', 'ERNIE', BD, 'general', null, [],
    '官方「价格」页把该模型列在「文本生成」节下，模型名称/版本名称逐字为「ERNIE 5.1 / ERNIE-5.1」（另有按输入长度分的两档，见 api-plans 的 variant）；页面只有更新时间，不是发布日 ⇒ releasedAt 留 null。'
  ),
  'spark-x2.5': entry(
    'Spark-X2.5', '科大讯飞', 'Spark', XF, 'general', null, [],
    '官方产品页逐字写「星火大模型 Spark-X2.5 星火新一代通用旗舰模型」；页面无发布日 ⇒ releasedAt 留 null。modelRole=general 取自官方「通用旗舰模型」的能力表述。'
  )
};

const modelsDoc = read(MODELS_FILE);
for (const [slug, value] of Object.entries(NEW_ENTRIES)) {
  if (modelsDoc[slug]) throw new Error(`slug 已存在（禁止 churn）：${slug}`);
  modelsDoc[slug] = value;
}
const providerLoad = providers.load();
const DEVELOPERS = Object.values(providerLoad.table).map(e => String((e && e.name) || ''));
const EXTRA_DEVELOPERS = Object.keys(modelsDoc._developers_extra || {});
const registryProblems = registry.validateRegistry(registry.withoutMeta(modelsDoc), {
  developers: DEVELOPERS, extraDevelopers: EXTRA_DEVELOPERS, duplicateKeys: []
});
if (registryProblems.length) { registryProblems.slice(0, 12).forEach(p => console.error('  - ' + p)); throw new Error(`registry 校验未通过（${registryProblems.length}）`); }

/* ---------------- ② 映射（带官方引文，逐字复制记录自己的引文） ---------------- */

const apiDoc = read(API_PLANS_FILE);
const planOf = (provider, planName) => {
  const plan = apiDoc.plans.find(p => p.provider === provider && p.planName === planName);
  if (!plan) throw new Error(`找不到 API 记录 ${provider} / ${planName}`);
  return plan;
};
const copyEvidence = (plan, modelKey) => {
  const item = (plan.evidence || []).find(e => e.field === `models.${modelKey}`);
  if (!item) throw new Error(`${plan.planName} 没有 models.${modelKey} 引文`);
  return { field: item.field, quote: item.quote, sourceUrl: item.sourceUrl, capturedAt: item.capturedAt, lang: item.lang };
};
const LINK_SPECS = [
  ['360zhinao-pro', 'ai360', '360zhinao 模型广场按量计费', '360zhinao-pro'],
  ['360zhinao-turbo-llm-geo', 'ai360', '360zhinao 模型广场按量计费', '360zhinao-turbo-llm-geo'],
  ['baichuan-m3', 'baichuan', '百川大模型按量计费', 'baichuan-m3'],
  ['baichuan-m3-plus', 'baichuan', '百川大模型按量计费', 'baichuan-m3-plus'],
  ['ernie-4.5-turbo-128k', 'baidu', '千帆模型按量后付费', 'ernie-4.5-turbo-128k'],
  ['ernie-5.1', 'baidu', '千帆模型按量后付费', 'ernie-5.1'],
  ['spark-x2.5', 'iflytek', '星火大模型 API 按量计费', 'spark-x2.5']
];

const linksDoc = read(LINKS_FILE);
const beforeLinks = registry.linksList(linksDoc);
const newLinks = LINK_SPECS.map(([registrySlug, provider, planName, modelKey]) => {
  const plan = planOf(provider, planName);
  return {
    registrySlug, apiPlanId: plan.id, modelKey, variant: null, basis: 'official-pricing-page',
    evidence: [copyEvidence(plan, modelKey)], note: null
  };
});
linksDoc.links = registry.sortLinks([...beforeLinks, ...newLinks]);

/* ---------------- ③ 处置声明：已被映射覆盖的 8 条必须移出（否则与映射打架） ---------------- */

const gapsDoc = read(GAPS_FILE);
const beforeDeclarations = registry.declarationsList(gapsDoc);
const mappedPlanIds = new Map(newLinks.map(l => [l.apiPlanId, slug => l.registrySlug]));
const droppedKeys = [];
const keptDeclarations = beforeDeclarations.filter(d => {
  const hit = newLinks.some(l => l.apiPlanId === d.apiPlanId && l.modelKey === d.modelKey);
  if (hit) droppedKeys.push(`${d.apiPlanId}|${d.modelKey}|${d.variant}`);
  return !hit;
});
gapsDoc.declarations = registry.sortDeclarations(keptDeclarations);

const plansDoc = read(path.join(ROOT, 'plans.json'));
const MODELS_TABLE = registry.withoutMeta(modelsDoc);
const linkProblems = registry.validateLinks(linksDoc, { table: MODELS_TABLE, apiPlans: apiDoc.plans, plans: plansDoc.plans, gaps: gapsDoc });
const gapProblems = registry.validateGaps(gapsDoc, { plans: plansDoc.plans, links: linksDoc, table: MODELS_TABLE, apiPlans: apiDoc.plans });
[...linkProblems, ...gapProblems].slice(0, 12).forEach(p => console.error('  - ' + p));
if (linkProblems.length || gapProblems.length) throw new Error(`关系层校验未通过（${linkProblems.length + gapProblems.length}）`);

/* ---------------- ④ 意图层：models 维度的 currentTargets ---------------- */

const targetsLoad = ct.load(TARGETS_FILE);
const targetsDoc = targetsLoad.doc;
const byProvider = {};
for (const t of targetsDoc.targets) byProvider[t.provider] = t;
const DIMS = ['deals', 'coding', 'api', 'models'];
const PAYLOAD = { deals: 'source', coding: 'planName', api: 'modelKey', models: 'registrySlug' };
const MODELS_TARGETS = {
  ai360: ['360zhinao-pro', '360zhinao-turbo-llm-geo'],
  baichuan: ['baichuan-m3', 'baichuan-m3-plus'],
  baidu: ['ernie-4.5-turbo-128k', 'ernie-5.1'],
  iflytek: ['spark-x2.5']
};
for (const [provider, slugs] of Object.entries(MODELS_TARGETS)) {
  const target = byProvider[provider];
  const withoutModels = target.currentTargets.filter(i => i.dimension !== 'models');
  const merged = [...withoutModels, ...slugs.map(registrySlug => ({ dimension: 'models', registrySlug }))];
  target.currentTargets = merged.sort((a, b) => {
    const ka = `${DIMS.indexOf(a.dimension)}\u0000${a[PAYLOAD[a.dimension]]}`;
    const kb = `${DIMS.indexOf(b.dimension)}\u0000${b[PAYLOAD[b.dimension]]}`;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
}

const health = read(path.join(ROOT, 'scripts', 'data', 'source-health.json'));
const knownSources = new Set((health.sources || []).map(s => s.name));
for (const deal of (read(path.join(ROOT, 'deals.json')).deals || [])) if (deal.source) knownSources.add(deal.source);
const targetProblems = ct.validateTargets(targetsDoc, {
  providerTable: providers.load().table, modelsTable: registry.withoutMeta(modelsDoc),
  knownSources: [...knownSources], duplicateKeys: targetsLoad.duplicateKeys
});
targetProblems.slice(0, 12).forEach(p => console.error('  - ' + p));
if (targetProblems.length) throw new Error(`意图层校验未通过（${targetProblems.length}）`);

/* ---------------- 落盘 ---------------- */
console.log(`新增 registry 身份：${Object.keys(NEW_ENTRIES).length}（${Object.keys(NEW_ENTRIES).join(', ')}）`);
console.log(`links：${beforeLinks.length} → ${linksDoc.links.length}（+${newLinks.length}）`);
console.log(`declarations：${beforeDeclarations.length} → ${gapsDoc.declarations.length}（移出 ${droppedKeys.length} 条已被映射覆盖的声明）`);
console.log(`  移出：${droppedKeys.join(' · ')}`);
const beforeSlugs = Object.keys(read(MODELS_FILE)).filter(k => !k.startsWith('_'));
const afterSlugs = Object.keys(modelsDoc).filter(k => !k.startsWith('_'));
console.log(`slug 集合：${beforeSlugs.length} → ${afterSlugs.length}（消失 ${beforeSlugs.filter(s => !afterSlugs.includes(s)).length}）`);

if (process.argv.includes('--dry-run')) { console.log('--dry-run：没有写盘'); process.exit(0); }
write(MODELS_FILE, modelsDoc);
write(LINKS_FILE, linksDoc);
write(GAPS_FILE, gapsDoc);
write(TARGETS_FILE, ct.serialize(targetsDoc));
console.log('✅ 已写出 models.json / model-registry-links.json / model-registry-gaps.json / coverage-targets.json');
