#!/usr/bin/env node
/**
 * t23 一次性落盘脚本（**幂等、自带断言、可复跑**）：把「API 计价条目必须有结局」这条门禁的
 * 出口真的用起来 ——
 *
 *   1. `scripts/data/model-registry-links.json`：新增 7 条 API 映射（原先被错当成"对不上"的那 7 条）
 *      + 修正 7 条已写但 basis 用错的映射（`official-model-id` + 空引文 ⇒ 红）；
 *   2. `scripts/data/model-registry-gaps.json`：把 19 条**伪造的套餐侧声明**（`planId` 写的是
 *      API 记录 id）换成 12 条**API 侧声明**（`apiPlanId` + `modelKey`，reason 只允许 off-registry-model）。
 *
 * 三条纪律：
 *   · **不猜**：12 条声明的 `sourceUrl` 从该 API 记录自己的 `officialUrl` 读出来（不硬编码）；
 *     引文类 basis 的 evidence **整条对象照抄**该记录自己的 evidence（field / quote / sourceUrl 逐字相同）；
 *   · **拒绝覆盖既有行**：同一条 (apiPlanId, modelKey) 若已存在且 `registrySlug` 与指定值不同 ⇒ 直接停；
 *     只允许把 basis / evidence / note 修正成指定值（并打印改了什么）；
 *   · **幂等**：重复跑不产生额外变化（第二次跑输出"已是目标状态"）。
 *
 * 用法：
 *   node research/_raw/coverage-expansion-v1/t23-land-api-dispositions.cjs --dry-run
 *   node research/_raw/coverage-expansion-v1/t23-land-api-dispositions.cjs
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const reg = require(path.join(ROOT, 'scripts', 'lib', 'model-registry.js'));

const LINKS_FILE = path.join(ROOT, 'scripts', 'data', 'model-registry-links.json');
const GAPS_FILE = path.join(ROOT, 'scripts', 'data', 'model-registry-gaps.json');
const API_PLANS_FILE = path.join(ROOT, 'api-plans.json');

const DRY_RUN = process.argv.includes('--dry-run');
const problems = [];
const notes = [];
const fail = message => { problems.push(message); };

/* ------------------------------------------------------------------ */
/* 输入                                                                */
/* ------------------------------------------------------------------ */

const apiPlansDoc = JSON.parse(fs.readFileSync(API_PLANS_FILE, 'utf8'));
const apiPlans = apiPlansDoc.plans || [];
const linksDoc = JSON.parse(fs.readFileSync(LINKS_FILE, 'utf8'));
const gapsDoc = JSON.parse(fs.readFileSync(GAPS_FILE, 'utf8'));
const links = reg.linksList(linksDoc);
const declarations = reg.declarationsList(gapsDoc);
const apiPlanIds = new Set(apiPlans.map(plan => plan.id));

const planOf = id => apiPlans.find(plan => plan && plan.id === id) || null;
const entryOf = (id, modelKey) => {
  const plan = planOf(id);
  if (!plan) return null;
  return (plan.models || []).find(item => item && item.modelKey === modelKey) || null;
};
const evidenceMentioning = (id, needle) => {
  const plan = planOf(id);
  if (!plan) return null;
  const hits = (plan.evidence || []).filter(item => item && String(item.quote).includes(needle));
  if (hits.length !== 1) fail(`${id}: 期望恰好 1 条引文逐字出现「${needle}」，实得 ${hits.length} 条`);
  return hits.length === 1 ? JSON.parse(JSON.stringify(hits[0])) : null;
};

/* ------------------------------------------------------------------ */
/* 目标：7 条新增 + 7 条修正                                            */
/* ------------------------------------------------------------------ */

// 引文类 basis 的判据：**只有**该记录自己的引文逐字点名了这个模型才用 official-pricing-page，
// 并把那一条 evidence 整条照抄；否则一律 explicit-mapping + evidence=[] + note 写明依据。
const NEW_LINKS = [
  {
    registrySlug: 'deepseek-v4-pro', apiPlanId: '8a26562011f2', modelKey: 'deepseek-ai.v4-pro-0813',
    basis: 'explicit-mapping',
    note: 'provider 官方显示名「DeepSeek V4 Pro 0813」折叠后 = registry 别名 `deepseek-v4-pro-0813`（该身份 releasedAt=2026-08-13，与 0813 同日）；本记录只有一条 pricing.currency 引文、未点名该模型 ⇒ 显式映射，不新造引文。'
  },
  {
    registrySlug: 'deepseek-flash', apiPlanId: '8a26562011f2', modelKey: 'deepseek-ai.v4.1-flash',
    basis: 'explicit-mapping',
    note: 'provider 官方显示名「DeepSeek V4.1 Flash」折叠后 = registry 别名 `DeepSeek-V4.1-Flash`；本记录引文未点名该模型 ⇒ 显式映射，不新造引文。'
  },
  {
    registrySlug: 'minimax-m3', apiPlanId: '8a26562011f2', modelKey: 'minimaxai.m3',
    basis: 'explicit-mapping',
    note: 'provider 官方显示名「MiniMax M3」折叠后 = registry slug `minimax-m3`（= canonicalName / 别名 `MiniMax/MiniMax-M3`）；本记录引文未点名该模型 ⇒ 显式映射，不新造引文。'
  },
  {
    registrySlug: 'deepseek-flash', apiPlanId: '929a1f3ec46c', modelKey: 'deepseek-v4p1-flash',
    basis: 'explicit-mapping',
    note: '官方显示名「DeepSeek V4.1 Flash」= registry 别名 `DeepSeek-V4.1-Flash`；官方 modelId 里的 `p1` 是该平台拼法，映射依据是**官方显示名**而不是版本号相似；引文未点名它 ⇒ 显式映射。'
  },
  {
    registrySlug: 'glm-5.3', apiPlanId: '929a1f3ec46c', modelKey: 'glm-5p3',
    basis: 'official-pricing-page', evidenceNeedle: 'GLM 5.3',
    note: '该记录的官方引文里逐字出现「GLM 5.3」⇒ 用引文类 basis；引文整条逐字照抄自该记录自己的 evidence（field/quote/sourceUrl 相同），不新造引文。'
  },
  {
    registrySlug: 'glm-5.3-flash', apiPlanId: '929a1f3ec46c', modelKey: 'glm-5p3-flash',
    basis: 'explicit-mapping',
    note: '官方显示名「GLM 5.3 Flash」= canonicalName `GLM-5.3-Flash`；本记录引文只抄到「GLM 5.3」那一行、没有逐字抄 Flash 行 ⇒ 显式映射，不新造引文。'
  },
  {
    registrySlug: 'qwen3.8-max', apiPlanId: '929a1f3ec46c', modelKey: 'qwen3p8-max',
    basis: 'explicit-mapping',
    note: '官方显示名「Qwen 3.8 Max」= registry slug/canonicalName `qwen3.8-max`；本记录引文未点名该模型 ⇒ 显式映射，不新造引文。'
  }
];

const FIX_LINKS = [
  {
    registrySlug: 'glm-5.3', apiPlanId: '8a26562011f2', modelKey: 'zai-org.glm-5.3',
    basis: 'explicit-mapping',
    note: 'modelKey 去掉命名空间前缀后与 slug `glm-5.3` 逐字相等（官方写法对官方写法）；本记录引文未点名 GLM ⇒ 显式映射，不新造引文。'
  },
  {
    registrySlug: 'glm-5.3-flash', apiPlanId: '8a26562011f2', modelKey: 'zai-org.glm-5.3-flash',
    basis: 'explicit-mapping',
    note: 'modelKey 去掉命名空间前缀后与 slug `glm-5.3-flash` 逐字相等（官方写法对官方写法）；本记录引文未点名 GLM ⇒ 显式映射，不新造引文。'
  },
  {
    registrySlug: 'kimi-k3', apiPlanId: '8a26562011f2', modelKey: 'moonshotai.kimi-k3',
    basis: 'official-pricing-page', evidenceNeedle: 'Kimi K3',
    note: '该记录官方引文逐字出现「Kimi K3」⇒ 用引文类 basis；引文整条照抄自记录自己的 evidence，不新造引文。'
  },
  {
    registrySlug: 'kimi-k3', apiPlanId: '929a1f3ec46c', modelKey: 'kimi-k3',
    basis: 'official-pricing-page', evidenceNeedle: 'Kimi K3',
    note: '该记录官方引文逐字出现「Kimi K3」⇒ 用引文类 basis；引文整条照抄自记录自己的 evidence，不新造引文。'
  },
  {
    registrySlug: 'minimax-m3', apiPlanId: '929a1f3ec46c', modelKey: 'minimax-m3',
    basis: 'explicit-mapping',
    note: '官方 modelKey `minimax-m3` 与 slug 逐字相等；本记录引文未点名 MiniMax ⇒ 显式映射，不新造引文。'
  },
  {
    registrySlug: 'qwen3.8-27b', apiPlanId: '036c5f09561e', modelKey: 'qwen.qwen3.8-27b',
    basis: 'explicit-mapping',
    note: 'modelKey 去掉命名空间前缀 `qwen.` 后与 slug `qwen3.8-27b` 逐字相等；本记录引文未点名 Qwen ⇒ 显式映射，不新造引文。'
  },
  {
    registrySlug: 'qwen3.8-27b', apiPlanId: '61aa6c3ed3ff', modelKey: 'qwen3.8-27b',
    basis: 'official-pricing-page', evidenceNeedle: 'Qwen 3.8 27B',
    note: '该记录官方引文逐字出现「Qwen 3.8 27B」⇒ 用引文类 basis；引文整条照抄自记录自己的 evidence，不新造引文。'
  }
];

/* ------------------------------------------------------------------ */
/* 目标：12 条 API 侧声明                                              */
/* ------------------------------------------------------------------ */

const API_DECLARATIONS = [
  ['036c5f09561e', 'meta-llama.prompt-guard-2-22m'],
  ['036c5f09561e', 'meta-llama.prompt-guard-2-86m'],
  ['036c5f09561e', 'openai.gpt-oss-120b'],
  ['036c5f09561e', 'openai.gpt-oss-20b'],
  ['036c5f09561e', 'openai.gpt-oss-safeguard-20b'],
  ['61aa6c3ed3ff', 'gpt-oss-120b'],
  ['8a26562011f2', 'openai.gpt-oss-120b'],
  ['8a26562011f2', 'thinkingmachines.inkling'],
  ['929a1f3ec46c', 'gpt-oss-120b'],
  ['929a1f3ec46c', 'ember-1'],
  ['929a1f3ec46c', 'nemotron-3-ultra-nvfp4'],
  ['929a1f3ec46c', 'nemotron-lightning-3p5-30b-a3b']
];

const displayNameOf = name => String(name || '').replace(/[（(][^（()）]*[）)]\s*$/, '').trim();

/* ------------------------------------------------------------------ */
/* 组装                                                                */
/* ------------------------------------------------------------------ */

function apiLinkOf(spec) {
  const plan = planOf(spec.apiPlanId);
  if (!plan) { fail(`links: apiPlanId ${spec.apiPlanId} 不存在`); return null; }
  if (!entryOf(spec.apiPlanId, spec.modelKey)) { fail(`links: ${spec.apiPlanId} 里没有 modelKey ${spec.modelKey}`); return null; }
  let evidence = [];
  if (spec.basis === 'official-pricing-page') {
    const item = evidenceMentioning(spec.apiPlanId, spec.evidenceNeedle);
    if (!item) return null;
    evidence = [item];
  }
  const link = {
    registrySlug: spec.registrySlug,
    apiPlanId: spec.apiPlanId,
    modelKey: spec.modelKey,
    variant: 'standard',
    basis: spec.basis,
    evidence,
    note: spec.note
  };
  if (JSON.stringify(Object.keys(link)) !== JSON.stringify(reg.API_LINK_KEY_ORDER)) {
    fail(`links: 键序不是规范序（${Object.keys(link).join(',')}）`);
  }
  if (link.note.length > reg.MAX_NOTE_LENGTH) fail(`links: note 超过 ${reg.MAX_NOTE_LENGTH} 字（${spec.modelKey}）`);
  return link;
}

function apiDeclarationOf(apiPlanId, modelKey) {
  const plan = planOf(apiPlanId);
  const entry = entryOf(apiPlanId, modelKey);
  if (!plan || !entry) { fail(`gaps: ${apiPlanId} / ${modelKey} 不存在`); return null; }
  const note = `官方定价记录点名了单一模型「${displayNameOf(entry.name)}」（modelKey \`${modelKey}\`）；registry 里没有它的身份（逐字/折叠/后缀不等）⇒ 判过：对不上。按 §29 它可进 registry，但需其官方身份证据（canonicalName/developer/officialUrl），本轮未收集 ⇒ 记为 off-registry-model，不硬塞、不留空。`;
  const declaration = {
    apiPlanId,
    modelKey,
    variant: 'standard',
    reason: 'off-registry-model',
    sourceUrl: plan.officialUrl, // 从记录读，不硬编码
    note
  };
  if (JSON.stringify(Object.keys(declaration)) !== JSON.stringify(reg.API_GAP_KEY_ORDER)) {
    fail(`gaps: 键序不是规范序（${Object.keys(declaration).join(',')}）`);
  }
  if (!declaration.sourceUrl || (declaration.sourceUrl !== plan.officialUrl && declaration.sourceUrl !== plan.sourceUrl)) {
    fail(`gaps: ${modelKey} 的 sourceUrl 不是该记录自己的官方页`);
  }
  if (declaration.note.length > reg.MAX_NOTE_LENGTH) fail(`gaps: note 超过 ${reg.MAX_NOTE_LENGTH} 字（${modelKey}，${declaration.note.length}）`);
  return declaration;
}

// 1) 19 条伪造的套餐侧声明：planId 落在 api-plans 的 id 空间里 ⇒ 它们本来就不是套餐侧声明
//    （**迁移后**这一批已经不在，所以只在"迁移前状态"里断言它必须恰好 19 条；
//     两种状态下 Coding 侧都必须是 42 条 —— 两次跑得到同一份目标文档，这就是幂等。）
const fakeDeclarations = declarations.filter(declaration => declaration && apiPlanIds.has(declaration.planId));
// Coding 侧 = **没有 apiPlanId / modelKey** 的那些（API 侧声明既没有 planId 也没有 modelName，
// 用 `!apiPlanIds.has(planId)` 过滤会把它们当成"coding"，这里必须按侧别的定义过滤）
const codingDeclarations = declarations.filter(declaration => declaration
  && declaration.apiPlanId === undefined && declaration.modelKey === undefined);
if (fakeDeclarations.length && fakeDeclarations.length !== 19) {
  fail(`期望 19 条伪造的套餐侧声明（或 0 条 = 已迁移），实得 ${fakeDeclarations.length}`);
}
if (fakeDeclarations.length) {
  const fakeKeys = new Set(fakeDeclarations.map(declaration => declaration.modelName));
  API_DECLARATIONS.concat(NEW_LINKS.map(link => [link.apiPlanId, link.modelKey])).forEach(([id, key]) => {
    if (!fakeKeys.has(key)) fail(`伪造声明里没有 ${id} / ${key} —— 这份脚本的前提变了，停下来人工看`);
  });
  notes.push(`删掉 ${fakeDeclarations.length} 条伪造的套餐侧声明（planId 是 API 记录 id）`);
}

// 2) 12 条 API 侧声明 + 42 条 Coding 侧声明 → 规范序
//    （逐条与磁盘现状对比：内容不同就打印"改了什么"，不是静默覆盖）
const targetDeclarations = API_DECLARATIONS.map(([id, key]) => apiDeclarationOf(id, key)).filter(Boolean);
const existingApiDeclarations = new Map(
  codingDeclarations.slice(0, 0).concat(declarations.filter(d => d.apiPlanId !== undefined)).map(d => [`${d.apiPlanId}\u0000${d.modelKey}`, d])
);
const touchedDeclarations = [];
targetDeclarations.forEach(declaration => {
  const key = `${declaration.apiPlanId}\u0000${declaration.modelKey}`;
  const before = existingApiDeclarations.get(key);
  if (before && JSON.stringify(before) !== JSON.stringify(declaration)) {
    touchedDeclarations.push({ key, before: JSON.stringify(before), after: JSON.stringify(declaration) });
  }
  if (!before) touchedDeclarations.push({ key, before: null, after: JSON.stringify(declaration) });
});
const nextDeclarations = reg.sortDeclarations(codingDeclarations.concat(targetDeclarations));

// 3) 链接：先按 (apiPlanId, modelKey) 建索引，再按目标覆盖/新增
const targetSpecs = NEW_LINKS.concat(FIX_LINKS);
const targetByKey = new Map(targetSpecs.map(spec => [`${spec.apiPlanId}\u0000${spec.modelKey}`, spec]));
const nextLinks = [];
const touched = [];
for (const link of links) {
  if (!link) continue;
  const key = `${link.apiPlanId}\u0000${link.modelKey}`;
  const spec = targetByKey.get(key);
  if (!spec) { nextLinks.push(link); continue; }
  // **拒绝覆盖既有行**：身份（registrySlug）与指定值不同 ⇒ 停（不许悄悄改判）
  if (link.registrySlug !== spec.registrySlug) {
    fail(`links: ${key} 已存在且 registrySlug=${link.registrySlug}，与指定值 ${spec.registrySlug} 不同 —— 拒绝改判身份`);
    continue;
  }
  const replacement = apiLinkOf(spec);
  if (!replacement) { nextLinks.push(link); continue; }
  if (JSON.stringify(link) !== JSON.stringify(replacement)) {
    touched.push({ key, before: JSON.stringify(link), after: JSON.stringify(replacement) });
  }
  nextLinks.push(replacement);
}
for (const spec of NEW_LINKS) {
  const key = `${spec.apiPlanId}\u0000${spec.modelKey}`;
  if (links.some(link => link && `${link.apiPlanId}\u0000${link.modelKey}` === key)) continue; // 已经在了（幂等）
  const link = apiLinkOf(spec);
  if (link) { nextLinks.push(link); touched.push({ key, before: null, after: JSON.stringify(link) }); }
}
const sortedLinks = reg.sortLinks(nextLinks);

/* ------------------------------------------------------------------ */
/* 断言                                                                */
/* ------------------------------------------------------------------ */

const apiLinks = sortedLinks.filter(link => link.apiPlanId !== undefined);
const codingLinks = sortedLinks.filter(link => link.planId !== undefined);
const apiDecls = nextDeclarations.filter(d => d.apiPlanId !== undefined);
const codingDecls = nextDeclarations.filter(d => d.planId !== undefined);

if (sortedLinks.length !== 82) fail(`links 总数应为 82，实得 ${sortedLinks.length}`);
if (apiLinks.length !== 69) fail(`API 侧 links 应为 69，实得 ${apiLinks.length}`);
if (codingLinks.length !== 13) fail(`Coding 侧 links 应为 13，实得 ${codingLinks.length}`);
if (nextDeclarations.length !== 54) fail(`declarations 总数应为 54，实得 ${nextDeclarations.length}`);
if (codingDecls.length !== 42) fail(`Coding 侧声明应为 42，实得 ${codingDecls.length}`);
if (apiDecls.length !== 12) fail(`API 侧声明应为 12，实得 ${apiDecls.length}`);

const linkKeys = sortedLinks.map(reg.orderKeyOfLink);
if (new Set(linkKeys).size !== linkKeys.length) fail('links 里有重复键');
const declKeys = nextDeclarations.map(reg.orderKeyOfDeclaration);
if (new Set(declKeys).size !== declKeys.length) fail('declarations 里有重复键');

// 引文类 basis 的引文必须**整条**等于该记录自己的一条 evidence（逐字）。
// 注意：只有**本任务触碰的那 14 条**才要求"引文逐字点名该模型"（本任务的新口径）；
// 历史 36 条 official-pricing-page 映射沿用旧口径（引文是记录自己的计价引文、未点名模型），
// 那批是**已登记的残余**，留给 t20/t21 写明，不在本任务里改。
const touchedKeys = new Set(targetSpecs.map(spec => `${spec.apiPlanId}\u0000${spec.modelKey}`));
for (const link of sortedLinks) {
  if (!link || link.basis !== 'official-pricing-page' || link.apiPlanId === undefined) continue;
  const plan = planOf(link.apiPlanId);
  const own = (plan && plan.evidence) || [];
  for (const item of link.evidence || []) {
    const match = own.some(ownItem => ownItem && ownItem.field === item.field && ownItem.quote === item.quote && ownItem.sourceUrl === item.sourceUrl);
    if (!match) fail(`links: ${link.apiPlanId}/${link.modelKey} 的引文不是该记录自己的 evidence（不许新造）`);
    const key = `${link.apiPlanId}\u0000${link.modelKey}`;
    if (touchedKeys.has(key) && !['Kimi K3', 'GLM 5.3', 'Qwen 3.8 27B'].some(needle => String(item.quote).includes(needle))) {
      fail(`links: 本任务新增/修正的 ${link.apiPlanId}/${link.modelKey} 的引文没有逐字点名该模型`);
    }
  }
}

/* ------------------------------------------------------------------ */
/* 折叠反绕过探测（真实数据反证：7 条搬走前命中、12 条 0 命中）          */
/* ------------------------------------------------------------------ */

const table = reg.load().table;
const folded = reg.foldedIndexOf(table);
const probe = key => reg.foldedHitsOf(key, folded);

const sevenProbe = [
  ['8a26562011f2', 'deepseek-ai.v4-pro-0813'],
  ['8a26562011f2', 'deepseek-ai.v4.1-flash'],
  ['8a26562011f2', 'minimaxai.m3'],
  ['929a1f3ec46c', 'deepseek-v4p1-flash'],
  ['929a1f3ec46c', 'glm-5p3'],
  ['929a1f3ec46c', 'glm-5p3-flash'],
  ['929a1f3ec46c', 'qwen3p8-max']
].map(([id, key]) => {
  const entry = entryOf(id, key);
  const hits = probe(key).concat(entry ? probe(entry.name) : []);
  const uniq = [...new Set(hits.map(hit => hit.slug))];
  return { id, key, name: entry ? entry.name : null, hits: uniq };
});
sevenProbe.forEach(row => {
  if (row.hits.length !== 1) fail(`折叠探测：${row.id}/${row.key} 期望恰好命中 1 个 registry 身份，实得 ${JSON.stringify(row.hits)}`);
});

const twelveProbe = API_DECLARATIONS.map(([id, key]) => {
  const entry = entryOf(id, key);
  return { id, key, name: entry ? entry.name : null, hits: [...new Set(probe(key).concat(entry ? probe(entry.name) : []).map(hit => hit.slug))] };
});
twelveProbe.forEach(row => {
  if (row.hits.length !== 0) fail(`折叠探测：声明 ${row.id}/${row.key} 竟然命中了 ${JSON.stringify(row.hits)} —— 能对上就必须写映射`);
});

/* ------------------------------------------------------------------ */
/* 输出                                                                */
/* ------------------------------------------------------------------ */

console.log('=== t23 API 侧处置落盘 ===');
console.log(`  伪造的套餐侧声明        : ${fakeDeclarations.length} 条${fakeDeclarations.length ? ' → 删除' : '（已迁除）'}`);
console.log(`  API 侧声明              : ${apiDecls.length} 条（reason=off-registry-model，sourceUrl 取自记录 officialUrl）`);
console.log(`  Coding 侧声明           : ${codingDecls.length} 条（未动）`);
console.log(`  映射                    : ${sortedLinks.length} 条 = API ${apiLinks.length} + Coding ${codingLinks.length}`);
console.log(`  本次触碰的映射          : ${touched.length} 条（新增 ${touched.filter(row => row.before === null).length} · 修正 ${touched.filter(row => row.before !== null).length}）`);
console.log(`  本次触碰的声明          : ${touchedDeclarations.length} 条（新增 ${touchedDeclarations.filter(row => row.before === null).length} · 归一化 ${touchedDeclarations.filter(row => row.before !== null).length}）`);
console.log('');
console.log('  折叠反绕过探测（真实数据）：');
console.log('    · 搬去写映射的那 7 条（若仍留在声明表里）会命中：');
sevenProbe.forEach(row => console.log(`        ${row.id} / ${row.key}  name=${JSON.stringify(row.name)}  → 命中 ${row.hits.join(' / ')}`));
console.log('    · 落成声明的 12 条：命中数 0');
twelveProbe.forEach(row => { if (row.hits.length) console.log(`        !! ${row.key} → ${row.hits.join(' / ')}`); });
console.log('');

if (problems.length) {
  console.error(`❌ ${problems.length} 处断言失败，不写盘：`);
  problems.forEach(message => console.error(`  - ${message}`));
  process.exit(1);
}

// 文件头（_note / _rules）也同步成"双侧"口径
const gapNote = 'v3.0 Stage D 补充层（coverage-expansion-v1 起为**双侧**）：**处置登记表**。两种结局都必须显式写下来 —— ① 落进 `scripts/data/model-registry-links.json`（能对应单一模型身份）；② 落进本表（明确**不对应单一模型身份**，逐条给理由）。本表**永远不写 registrySlug**。**Coding 侧**（`planId` + `modelName`）登记 `plans.json` 里对不上的自由文本串；**API 侧**（`apiPlanId` + `modelKey`）登记 `api-plans.json` 里对不上任何 registry 身份的计价条目 —— API 侧 reason 只允许 `off-registry-model`。本表**不发布**，它不是数据出口，只是让「每一条都必须有结局」变成硬门禁。';
const gapRules = String(gapsDoc._rules || '').replace(
  '② modelName 必须**逐字**等于该套餐',
  '② **每条声明恰好属于一侧**：Coding 侧（planId + modelName）或 API 侧（apiPlanId + modelKey），两侧都写或各缺一半即红；③ API 侧键序 `apiPlanId → modelKey → variant → reason → sourceUrl → note`，reason 只允许 `off-registry-model`（pool / series / multi-model / non-text-resource 是套餐侧概念）；④ API 侧的 apiPlanId 必须真实存在、modelKey 必须在该记录 models[] 里、variant 必须是 null（通配）或真实变体，通配展开一条都没匹配到即红；⑤ **反绕过**：API 侧的 modelKey 与记录的官方显示名会用「折叠精确相等」索引（NFKC → 去末尾注记 → 去空白与 - . _ / → 小写，含命名空间后缀探测）在 registry 的 slug+aliases 上探测，命中即红并点名那个 slug —— 能对上就必须去写映射（没有引文时 basis=explicit-mapping + note），或者把 registry 的别名补成真实写法；⑥ modelName 必须**逐字**等于该套餐'
);
if (gapRules === String(gapsDoc._rules || '')) fail('gaps 的 _rules 没能按预期更新（找不到锚点）');

const nextGapsDoc = { ...gapsDoc, _note: gapNote, _rules: gapRules, declarations: nextDeclarations };
const nextLinksDoc = { ...linksDoc, links: sortedLinks };
// 顶层键序保持原样（_note / _rules / schemaVersion / links|declarations）
if (JSON.stringify(Object.keys(nextGapsDoc)) !== JSON.stringify(Object.keys(gapsDoc))) fail('gaps 顶层键序被改动');
if (JSON.stringify(Object.keys(nextLinksDoc)) !== JSON.stringify(Object.keys(linksDoc))) fail('links 顶层键序被改动');

const gapsText = reg.serialize(nextGapsDoc);
const linksText = reg.serialize(nextLinksDoc);
const changed = [];
if (gapsText !== fs.readFileSync(GAPS_FILE, 'utf8')) changed.push(['scripts/data/model-registry-gaps.json', gapsText]);
if (linksText !== fs.readFileSync(LINKS_FILE, 'utf8')) changed.push(['scripts/data/model-registry-links.json', linksText]);

if (!changed.length) {
  console.log('✓ 已是目标状态（幂等：没有需要写盘的变化）');
  process.exit(0);
}
if (DRY_RUN) {
  changed.forEach(([file]) => console.log(`  · ${file} 需要写盘`));
  console.log('--dry-run：没有写盘。');
  process.exit(0);
}
changed.forEach(([file, text]) => fs.writeFileSync(file, text));
changed.forEach(([file]) => console.log(`✅ 已写出 ${file}`));
process.exit(0);
