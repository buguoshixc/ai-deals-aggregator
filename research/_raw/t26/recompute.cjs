/**
 * t26 独立复算（第二条路径）——**不 require `scripts/lib/**` 的任何东西**。
 *
 * 只用 `fs` 直接读四份原始文件 + 派生文件，自己实现：
 *   · 计价条目的枚举与身份键（与 lib 的 `(apiPlanId, modelKey, variant)` 同形，但这里自己写）；
 *   · 链接（links）与处置声明（gaps）的**展开**口径；
 *   · registry 身份索引与三种**精确相等类**探测（逐字 / 归一 / 折叠 + 命名空间后缀）。
 *
 * 输出：数字表 + 逐条裁决 + 反绕过嫌疑清单（声明了却其实能对上的条目）。
 *
 * 用法：node research/_raw/t26/recompute.cjs [repoRoot]
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '..', '..', '..');
const read = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

const apiDoc = read('api-plans.json');
const linksDoc = read('model-registry-links.json');
const linksSrc = read('scripts/data/model-registry-links.json');
const gapsDoc = read('scripts/data/model-registry-gaps.json');
const modelsDoc = read('models.json');
const modelsSrc = read('scripts/data/models.json');

/* ------------------------------------------------------------------ */
/* 1) registry 身份索引（我自己建）                                      */
/* ------------------------------------------------------------------ */

const metaKeys = obj => Object.keys(obj).filter(key => !key.startsWith('_'));
const sourceEntries = metaKeys(modelsSrc).map(slug => ({ slug, ...modelsSrc[slug] }));

const bySlug = new Map();
const byAlias = new Map();
for (const entry of sourceEntries) {
  bySlug.set(entry.slug, entry);
  for (const alias of (entry.aliases || [])) {
    if (!byAlias.has(alias)) byAlias.set(alias, entry.slug);
  }
}

/** NFKC + 折叠空白 + 小写（"逐字相等"用） */
function norm(value) {
  return String(value === null || value === undefined ? '' : value)
    .normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** NFKC + 去末尾括注 + 去空白与分隔符 + 小写（"折叠相等"用；精确相等类，无相似度） */
function fold(value) {
  return String(value === null || value === undefined ? '' : value).normalize('NFKC')
    .replace(/[（(][^（()）]*[）)]\s*$/, '')
    .replace(/[\s\-.‐–—_/／]/g, '')
    .toLowerCase();
}

/** 命名空间后缀组合（按 / 与 . 切，长的在前） */
function suffixes(value) {
  const parts = String(value === null || value === undefined ? '' : value).split(/[/．.]/).filter(Boolean);
  const out = [];
  for (let start = 0; start < parts.length; start += 1) {
    const tail = parts.slice(start).join('.');
    if (tail && !out.includes(tail)) out.push(tail);
  }
  return out;
}

const exactIndex = new Map();
const foldIndex = new Map();
for (const [key, slug] of [...bySlug.keys()].map(slug => [slug, slug])) {
  if (!exactIndex.has(norm(key))) exactIndex.set(norm(key), slug);
  if (!foldIndex.has(fold(key))) foldIndex.set(fold(key), slug);
}
for (const [alias, slug] of byAlias) {
  if (!exactIndex.has(norm(alias))) exactIndex.set(norm(alias), slug);
  if (!foldIndex.has(fold(alias))) foldIndex.set(fold(alias), slug);
}

/** 我自己的探测：返回 [{slug, rule}]（规则只用精确相等类） */
function probe(value) {
  const hits = [];
  const push = (slug, rule) => {
    if (!slug || hits.some(hit => hit.slug === slug)) return;
    hits.push({ slug, rule });
  };
  push(exactIndex.get(norm(value)), 'exact-normalized');
  push(foldIndex.get(fold(value)), 'folded');
  for (const suffix of suffixes(value)) push(foldIndex.get(fold(suffix)), 'namespace-suffix');
  return hits;
}

/* ------------------------------------------------------------------ */
/* 2) 计价条目枚举 + 展开口径                                            */
/* ------------------------------------------------------------------ */

const plans = apiDoc.plans || [];
const planById = new Map(plans.map(plan => [plan.id, plan]));

const entries = [];
for (const plan of plans) {
  for (const entry of (plan.models || [])) {
    entries.push({
      apiPlanId: plan.id, modelKey: entry.modelKey, variant: entry.variant,
      name: entry.name, provider: plan.provider, planName: plan.planName
    });
  }
}
const idKeyOf = identity => `${identity.apiPlanId}\u0000${identity.modelKey}\u0000${identity.variant}`;

/** 与页面层同形的展开：variant 为 null/空 ⇒ 该 modelKey 在该记录里的全部真实变体 */
function expand(record) {
  const plan = planById.get(record.apiPlanId);
  if (!plan) return { identities: [], unresolved: true };
  const same = (plan.models || []).filter(item => item && item.modelKey === record.modelKey);
  if (!same.length) return { identities: [], unresolved: true, missingKey: true };
  const wildcard = record.variant === null || record.variant === undefined || record.variant === '';
  const picked = wildcard ? same : same.filter(item => item.variant === record.variant);
  return {
    identities: picked.map(item => ({ apiPlanId: plan.id, modelKey: item.modelKey, variant: item.variant })),
    unresolved: picked.length === 0
  };
}

const apiLinks = (linksDoc.links || []).filter(link => link && link.apiPlanId !== undefined);
const codingLinks = (linksDoc.links || []).filter(link => link && link.planId !== undefined);
const apiLinkSrc = (linksSrc.links || []).filter(link => link && link.apiPlanId !== undefined);

const mapped = new Map(); // idKey → link
const conflicts = [];
for (const link of apiLinks) {
  const { identities, unresolved } = expand(link);
  if (unresolved) conflicts.push({ kind: 'unresolved-link', link });
  for (const identity of identities) {
    const key = idKeyOf(identity);
    if (mapped.has(key) && mapped.get(key).registrySlug !== link.registrySlug) {
      conflicts.push({ kind: 'double-claim', key, a: mapped.get(key), b: link });
    }
    mapped.set(key, link);
  }
}

const declarations = gapsDoc.declarations || [];
const apiDecls = declarations.filter(d => d && (d.apiPlanId !== undefined || d.modelKey !== undefined));
const codingDecls = declarations.filter(d => d && (d.planId !== undefined || d.modelName !== undefined));
const declared = new Map();
for (const declaration of apiDecls) {
  const { identities, unresolved } = expand(declaration);
  if (unresolved) conflicts.push({ kind: 'unresolved-declaration', declaration });
  for (const identity of identities) declared.set(idKeyOf(identity), declaration);
}

const bothSides = [];
const unmapped = [];
for (const entry of entries) {
  const key = idKeyOf(entry);
  if (mapped.has(key) && declared.has(key)) bothSides.push(entry);
  if (!mapped.has(key) && !declared.has(key)) unmapped.push(entry);
}

/* ------------------------------------------------------------------ */
/* 3) 逐条独立再裁决                                                     */
/* ------------------------------------------------------------------ */

const adjudication = entries.map(entry => {
  const key = idKeyOf(entry);
  const isMapped = mapped.has(key);
  const isDeclared = declared.has(key);
  const keyHits = probe(entry.modelKey);
  const nameHits = probe(entry.name);
  const hits = [...keyHits, ...nameHits].filter((hit, index, list) =>
    list.findIndex(other => other.slug === hit.slug) === index);
  return {
    ...entry,
    key,
    mappedSlug: isMapped ? mapped.get(key).registrySlug : null,
    basis: isMapped ? mapped.get(key).basis : null,
    evidenceCount: isMapped ? ((mapped.get(key).evidence || []).length) : 0,
    declared: isDeclared,
    hits,
    // 反绕过嫌疑：声明成"对不上"，但我的探测说它其实折叠/逐字落在某个身份上
    bypassSuspect: isDeclared && !isMapped && hits.length > 0,
    // 反向嫌疑：映射到 A，但探测命中 B（或没有任何命中却也没写依据）
    mapMismatch: isMapped && hits.length > 0 && !hits.some(hit => hit.slug === mapped.get(key).registrySlug)
  };
});

const bypassSuspects = adjudication.filter(row => row.bypassSuspect);
const mapMismatches = adjudication.filter(row => row.mapMismatch);
const declaredRows = adjudication.filter(row => row.declared);
const mappedRows = adjudication.filter(row => row.mappedSlug);

/* ------------------------------------------------------------------ */
/* 4) 数字表 + 打印                                                     */
/* ------------------------------------------------------------------ */

const sourceIds = sourceEntries.map(entry => entry.slug);
const publishedIds = (modelsDoc.models || []).map(model => model.slug);

const numbers = {
  apiPlans: plans.length,
  pricingItems: entries.length,
  apiLinks: apiLinks.length,
  codingLinks: codingLinks.length,
  declarations: declarations.length,
  apiDeclarations: apiDecls.length,
  codingDeclarations: codingDecls.length,
  mappedIdentities: mapped.size,
  declaredIdentities: declared.size,
  bothMappedAndDeclared: bothSides.length,
  unmappedIdentities: unmapped.length,
  registrySourceEntries: sourceIds.length,
  registryPublishedModels: publishedIds.length,
  identityDrift: sourceIds.filter(slug => !publishedIds.includes(slug)).length
    + publishedIds.filter(slug => !sourceIds.includes(slug)).length,
  linksSrcVsPublishedSameCount: apiLinkSrc.length === apiLinks.length
};

console.log('=== t26 独立复算（第二条路径，不 require lib） ===');
console.log('ROOT:', ROOT);
console.log(JSON.stringify(numbers, null, 2));
console.log(`\n条目身份记账：${mapped.size} 映射 + ${declared.size} 处置 + ${unmapped.length} 未判 = ${mapped.size + declared.size + unmapped.length}（总条目 ${entries.length}）`);
console.log(`声明/映射重叠（双向检查）：${bothSides.length}`);
console.log(`冲突（未展开成功的 link/declaration、同 identity 双归属）：${conflicts.length}`);
if (conflicts.length) console.log(JSON.stringify(conflicts, null, 2));

console.log('\n--- 12 条处置声明：独立探测结果（应当 0 命中） ---');
for (const row of declaredRows) {
  console.log(`${row.declared ? '声明' : '    '} ${row.apiPlanId} | ${row.modelKey} | variant=${row.variant} | name=${JSON.stringify(row.name)} | hits=${JSON.stringify(row.hits)}`);
}

console.log('\n--- 14 条映射：独立探测结果（命中应当与 registrySlug 一致，或有引文/note 依据） ---');
for (const row of mappedRows) {
  console.log(`映射→${row.mappedSlug} | basis=${row.basis} | evidence=${row.evidenceCount} | ${row.apiPlanId} | ${row.modelKey} | hits=${JSON.stringify(row.hits)}`);
}

console.log(`\n反绕过嫌疑（声明了却能被精确相等类探测命中）：${bypassSuspects.length}`);
for (const row of bypassSuspects) {
  console.log(`  ✗ ${row.apiPlanId} | ${row.modelKey} | hits=${JSON.stringify(row.hits)}`);
}
console.log(`映射-身份不一致嫌疑：${mapMismatches.length}`);
for (const row of mapMismatches) {
  console.log(`  ✗ ${row.apiPlanId} | ${row.modelKey} → ${row.mappedSlug} | hits=${JSON.stringify(row.hits)}`);
}

if (unmapped.length) {
  console.log(`\n未判条目 ${unmapped.length} 条：`);
  for (const row of unmapped.slice(0, 20)) console.log(`  ? ${row.apiPlanId} | ${row.modelKey} | ${row.variant}`);
}

console.log('\n=== 判定 ===');
console.log(bypassSuspects.length === 0 && unmapped.length === 0 && bothSides.length === 0 && conflicts.length === 0
  ? '✅ 独立复算未发现绕过：每条计价条目恰好一个结局，声明里没有"其实能对上"的条目'
  : '❌ 独立复算发现异常，见上');

/* ------------------------------------------------------------------ */
/* 5) 家族诊断：12 条声明点名的 5 个家族，registry 里到底有没有别的拼法    */
/* ------------------------------------------------------------------ */
//
// 子串检索在这里**只是诊断**（回答"registry 里有没有写着这个名字的东西"），
// 不是身份判据：身份判据只有上面的逐字 / 归一 / 折叠三类精确相等。
{
  const families = ['oss', 'guard', 'nemotron', 'ember', 'inkling'];
  console.log('\n=== 家族诊断（子串检索只作诊断，不作身份判据） ===');
  for (const family of families) {
    const hits = [];
    for (const entry of sourceEntries) {
      const bag = [entry.slug, entry.canonicalName, ...(entry.aliases || [])].join(' ').toLowerCase();
      if (bag.includes(family)) hits.push(`${entry.slug}（${entry.canonicalName}${(entry.aliases || []).length ? ` / 别名 ${(entry.aliases || []).join('、')}` : ''}）`);
    }
    const declaredWithFamily = declaredRows.filter(row =>
      `${row.modelKey} ${row.name}`.toLowerCase().includes(family)).length;
    console.log(`  「${family}」：registry 命中 ${hits.length} 个${hits.length ? ` —— ${hits.join('；')}` : ''} · 处置声明里 ${declaredWithFamily} 条`);
  }
  console.log(`\n  registry 的 ${sourceEntries.length} 个身份的折叠键（供人工核对"有没有漏掉一种拼法"）：`);
  console.log('   ', sourceEntries.map(entry => fold(entry.slug)).sort().join(' '));
  console.log('  声明侧探测键：');
  console.log('   ', [...new Set(declaredRows.flatMap(row => [fold(row.modelKey), fold(row.name)]))].filter(Boolean).sort().join(' '));
}
