/**
 * 一次性关系层补写工具（只增不改）：
 *   ① 为 t3 本轮新增的 API 计价条目补出口 —— 能对上既有 registrySlug 的写 link（引文逐字复制记录自己的），
 *      对不上的写 API 侧 off-registry-model 声明；
 *   ② 既有 82 条 link / 54 条声明一条都不改（脚本只做 push，然后用 lib 的规范序排序器重排）；
 *   ③ 排序与校验全部复用 scripts/lib/model-registry.js，不另建一套判据。
 *
 * 用法：node research/_raw/coverage-depth-v1/gap-closure/_reladd.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const registry = require(path.join(ROOT, 'scripts', 'lib', 'model-registry.js'));

const LINKS_FILE = path.join(ROOT, 'scripts', 'data', 'model-registry-links.json');
const GAPS_FILE = path.join(ROOT, 'scripts', 'data', 'model-registry-gaps.json');
const API_PLANS_FILE = path.join(ROOT, 'api-plans.json');

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function writeJson(file, doc) { fs.writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`, 'utf8'); }

const apiDoc = readJson(API_PLANS_FILE);
function planOf(provider, planName) {
  const plan = apiDoc.plans.find(x => x.provider === provider && x.planName === planName);
  if (!plan) throw new Error(`找不到 API 记录：${provider} / ${planName}`);
  return plan;
}
/** 逐字复制记录自己的引文（关系层禁止新造引文） */
function copyEvidence(plan, modelKey) {
  const item = (plan.evidence || []).find(e => e.field === `models.${modelKey}`);
  if (!item) throw new Error(`记录 ${plan.planName} 没有 models.${modelKey} 的引文可复制`);
  return { field: item.field, quote: item.quote, sourceUrl: item.sourceUrl, capturedAt: item.capturedAt, lang: item.lang };
}

/* ---------------------------------------------------------------- */
/* 出口选择：能对上既有 registrySlug ⇒ link；对不上 ⇒ off-registry-model */

const LINK_SPECS = [
  { provider: 'moonshot', planName: 'Kimi 开放平台模型推理按量计费', modelKey: 'kimi-k3', registrySlug: 'kimi-k3' },
  { provider: 'moonshot', planName: 'Kimi 开放平台模型推理按量计费', modelKey: 'kimi-k2.7-code', registrySlug: 'kimi-k2.7-code' },
  { provider: 'stepfun', planName: 'StepFun 开放平台模型推理按量计费', modelKey: 'step-3.5-flash', registrySlug: 'step-3.5-flash' }
];

const DECLARATION_SPECS = [
  { provider: 'ai360', planName: '360zhinao 模型广场按量计费', modelKey: '360zhinao-pro', why: '360 自研当前线；registry 里没有任何 360 归属身份（逐字 / 折叠 / 命名空间后缀都不等）' },
  { provider: 'ai360', planName: '360zhinao 模型广场按量计费', modelKey: '360zhinao-turbo-llm-geo', why: '360 自研业务专用模型；registry 里没有 360 归属身份，逐字 / 折叠探测均不等' },
  { provider: 'baichuan', planName: '百川大模型按量计费', modelKey: 'baichuan-m3', why: '百川 M 系列当期线；registry 里没有百川归属身份' },
  { provider: 'baichuan', planName: '百川大模型按量计费', modelKey: 'baichuan-m3-plus', why: '百川 M 系列当期线；registry 里没有百川归属身份' },
  { provider: 'baidu', planName: '千帆模型按量后付费', modelKey: 'ernie-4.5-turbo-128k', why: '文心 4.5 Turbo 的 128K 版本名；registry 里没有文心归属身份' },
  { provider: 'baidu', planName: '千帆模型按量后付费', modelKey: 'ernie-5.1', variant: null, why: '文心当前旗舰；registry 里没有文心归属身份（standard 与 long_context 两个变体都逐字 / 折叠不等）' },
  { provider: 'iflytek', planName: '星火大模型 API 按量计费', modelKey: 'spark-x2.5', why: '讯飞自研旗舰；registry 里没有讯飞归属身份' },
  { provider: 'sensetime', planName: '日日新大模型 Tokens 按量后付费', modelKey: 'sensenova-v6.5-pro', why: '商汤融合模态当前线；registry 里没有商汤归属身份' },
  { provider: 'sensetime', planName: '日日新大模型 Tokens 按量后付费', modelKey: 'sensenova-v6.5-turbo', why: '商汤融合模态当前线；registry 里没有商汤归属身份' },
  { provider: 'stepfun', planName: 'StepFun 开放平台模型推理按量计费', modelKey: 'step-3.7-flash', why: '阶跃 Flash 档单一模型；registry 目前只有 step-3.5-flash，逐字 / 折叠均不等（版本号不同不得推定同一身份）' },
  { provider: 'stepfun', planName: 'StepFun 开放平台模型推理按量计费', modelKey: 'step-5-preview', why: '阶跃旗舰预览档单一模型；registry 里没有精确身份，逐字 / 折叠均不等' }
];

/* ---------------------------------------------------------------- */

const linksLoad = registry.loadLinks(LINKS_FILE);
if (linksLoad.broken || !linksLoad.doc) throw new Error(`读不到 ${LINKS_FILE}`);
const gapsLoad = registry.loadGaps(GAPS_FILE);
if (gapsLoad.broken || !gapsLoad.doc) throw new Error(`读不到 ${GAPS_FILE}`);

const beforeLinks = registry.linksList(linksLoad.doc);
const beforeDeclarations = registry.declarationsList(gapsLoad.doc);
const beforeLinkKeys = new Set(beforeLinks.map(registry.orderKeyOfLink));
const beforeDeclKeys = new Set(beforeDeclarations.map(registry.orderKeyOfDeclaration));

const newLinks = [];
for (const spec of LINK_SPECS) {
  const plan = planOf(spec.provider, spec.planName);
  const link = {
    registrySlug: spec.registrySlug,
    apiPlanId: plan.id,
    modelKey: spec.modelKey,
    variant: null,
    basis: 'official-pricing-page',
    evidence: [copyEvidence(plan, spec.modelKey)],
    note: null
  };
  if (beforeLinkKeys.has(registry.orderKeyOfLink(link))) { console.log(`  · link 已存在，跳过：${spec.registrySlug}`); continue; }
  newLinks.push(link);
}

const newDeclarations = [];
for (const spec of DECLARATION_SPECS) {
  const plan = planOf(spec.provider, spec.planName);
  const model = (plan.models || []).find(m => m.modelKey === spec.modelKey);
  if (!model) throw new Error(`记录 ${plan.planName} 里没有 modelKey ${spec.modelKey}`);
  const declaration = {
    apiPlanId: plan.id,
    modelKey: spec.modelKey,
    variant: spec.variant === undefined ? model.variant : spec.variant,
    reason: 'off-registry-model',
    sourceUrl: plan.sourceUrl,
    note: `官方定价页点名的单一模型；${spec.why} ⇒ 判过：对不上（不代表它不值得进 registry —— 身份登记属 Workstream B-2 / t8）。`
  };
  if (beforeDeclKeys.has(registry.orderKeyOfDeclaration(declaration))) { console.log(`  · 声明已存在，跳过：${spec.modelKey}`); continue; }
  newDeclarations.push(declaration);
}

const nextLinks = registry.sortLinks([...beforeLinks, ...newLinks]);
const nextGaps = [...beforeDeclarations, ...newDeclarations];
// 声明与 link 的地基是同一支排序器：用 lib 的规范序排（api 组在 coding 组之前）
const sortedGaps = registry.sortDeclarations(nextGaps);

const linksDoc = { ...linksLoad.doc, links: nextLinks };
const gapsDoc = { ...gapsLoad.doc, declarations: sortedGaps };

const linkProblems = registry.validateLinks(linksDoc, {
  table: registry.load().table || {},
  apiPlans: apiDoc.plans,
  plans: JSON.parse(fs.readFileSync(path.join(ROOT, 'plans.json'), 'utf8')).plans,
  gaps: gapsDoc
});
const gapProblems = registry.validateGaps(gapsDoc, {
  plans: JSON.parse(fs.readFileSync(path.join(ROOT, 'plans.json'), 'utf8')).plans,
  links: linksDoc,
  table: registry.load().table || {},
  apiPlans: apiDoc.plans
});

console.log(`links：改前 ${beforeLinks.length} → 改后 ${nextLinks.length}（新增 ${newLinks.length}）`);
console.log(`declarations：改前 ${beforeDeclarations.length} → 改后 ${sortedGaps.length}（新增 ${newDeclarations.length}）`);
const afterLinkKeys = new Set(nextLinks.map(registry.orderKeyOfLink));
const afterDeclKeys = new Set(sortedGaps.map(registry.orderKeyOfDeclaration));
console.log(`消失的 link：${[...beforeLinkKeys].filter(k => !afterLinkKeys.has(k)).length}`);
console.log(`消失的声明：${[...beforeDeclKeys].filter(k => !afterDeclKeys.has(k)).length}`);
if (linkProblems.length || gapProblems.length) {
  console.error('❌ 关系层校验未通过：');
  linkProblems.slice(0, 10).forEach(p => console.error('  - ' + p));
  gapProblems.slice(0, 10).forEach(p => console.error('  - ' + p));
  process.exit(1);
}
if (!process.argv.includes('--dry-run')) {
  writeJson(LINKS_FILE, linksDoc);
  writeJson(GAPS_FILE, gapsDoc);
  console.log('✅ 已写盘（只增不改）');
} else {
  console.log('--dry-run：没有写盘');
  newLinks.forEach(l => console.log('  + link ' + JSON.stringify([l.registrySlug, l.apiPlanId, l.modelKey])));
  newDeclarations.forEach(d => console.log('  + decl ' + JSON.stringify([d.apiPlanId, d.modelKey, d.variant])));
}
