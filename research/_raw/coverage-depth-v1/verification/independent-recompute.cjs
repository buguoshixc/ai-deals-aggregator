#!/usr/bin/env node
/**
 * t9 / 题面 §60·§61：**独立重算**（不依赖被测 lib）。
 *
 * 纪律（本文件的全部意义所在）：
 *   · **不 require** 任何被测模块：`scripts/lib/coverage-targets.js`、`scripts/lib/model-freshness.js`、
 *     `scripts/tools/coverage-report.js`。本文件只 `require('fs' / 'path' / 'crypto')`，
 *     全部读数从**原始来源文件**现场重算；
 *   · 两份"权威数据表"允许复用（它们与判据代码不是同一层）：
 *       ① `index.html` 的 `VENDOR_RULES` 数组字面量（厂商归一的唯一权威，用文本切片求值，
 *          **不**经 `scripts/lib/render-core.js`）；
 *       ② `scripts/lib/model-freshness.js` 源码里的 `currentWindowDays / agingWindowDays` 数字
 *          （策略阈值的唯一权威；用正则从**源码文本**读，**不** require 该模块）。
 *     这样做是刻意的：**判据代码自己重写，权威常数只认原文** —— 硬编码一份阈值副本等于造第二套真相。
 *   · 与 `coverage-report.js --json` 的读数逐项对照；差异**逐条解释**（不抹平、不改判据）。
 *
 * 用法：
 *   node independent-recompute.cjs [--report-json=report-json.parsed.json] [--out=independent-recompute.json]
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const argOf = (name, fallback = null) => {
  const prefix = `--${name}=`;
  const hit = process.argv.slice(2).find(a => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
};

const REPORT_JSON = argOf('report-json', path.join(__dirname, 'report-json.parsed.json'));
const OUT = argOf('out', path.join(__dirname, 'independent-recompute.json'));

const readText = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const readJson = file => JSON.parse(readText(file).replace(/^\uFEFF/, ''));
const sha256 = text => crypto.createHash('sha256').update(text, 'utf8').digest('hex');
const normalizeLabel = value => String(value === null || value === undefined ? '' : value)
  .normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();

/** 只接受 YYYY-MM-DD（可带时间后缀）；日历合法性自校验 —— 与 `normalizeReleaseDate` 同口径，但**本文件自己实现** */
function normalizeDate(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/.exec(value.trim());
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}
const dayOf = iso => {
  const normalized = normalizeDate(iso);
  if (!normalized) return NaN;
  const [y, m, d] = normalized.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

/* ------------------------------------------------------------------ */
/* ② 策略阈值：从源码文本读（唯一权威，不 require）                       */
/* ------------------------------------------------------------------ */
function policyFromSourceText() {
  const text = readText('scripts/lib/model-freshness.js');
  // 只抓 tier 块里的 modelRoles / currentWindowDays / agingWindowDays 三个字段
  const tiers = {};
  const tierRe = /(\w+): Object\.freeze\(\{\s*\n\s*tier: '(\w+)',\s*\n\s*modelRoles: Object\.freeze\(\[([^\]]*)\]\),\s*\n\s*currentWindowDays: (\d+),\s*\n\s*agingWindowDays: (\d+)/g;
  let hit;
  while ((hit = tierRe.exec(text))) {
    tiers[hit[2]] = {
      tier: hit[2],
      modelRoles: hit[3].split(',').map(s => s.trim().replace(/^'|'$/g, '')).filter(Boolean),
      currentWindowDays: Number(hit[4]),
      agingWindowDays: Number(hit[5])
    };
  }
  const defaultTier = (/defaultTier: '(\w+)'/.exec(text) || [])[1] || null;
  if (!Object.keys(tiers).length || !defaultTier) {
    throw new Error('无法从 scripts/lib/model-freshness.js 源码文本里读出策略表（口径变了，重算脚本要跟着改读法）');
  }
  return { defaultTier, tiers, source: 'scripts/lib/model-freshness.js（正则读源码文本，未 require）' };
}

/**
 * ③ 厂商归一：用 index.html 的 VENDOR_RULES 数组字面量（数据表），自己实现匹配循环。
 * 与 `vendorOf()` 同判据：按声明顺序取首个命中的 key；`deal.vendor` 为空 ⇒ 空键。
 */
function vendorRulesFromHtml() {
  const html = readText('index.html');
  const start = html.indexOf('const VENDOR_RULES = [');
  if (start < 0) throw new Error('index.html 里找不到 VENDOR_RULES');
  const from = html.indexOf('[', start);
  const to = html.indexOf('];', from);
  const literal = html.slice(from, to + 1);
  // eslint-disable-next-line no-new-func
  const rules = new Function(`return ${literal}`)();
  return { rules, source: 'index.html#RENDER-CORE VENDOR_RULES（文本切片求值，未 require render-core）' };
}

function vendorKeyOf(deal, rules) {
  const raw = String((deal && deal.vendor) || '').trim();
  if (!raw) return '';
  for (const rule of rules) {
    const re = rule[0];
    const key = rule[1];
    if (re && typeof re.test === 'function' && re.test(raw)) return String(key);
  }
  return raw;
}

/* ------------------------------------------------------------------ */
/* 原始输入                                                             */
/* ------------------------------------------------------------------ */
function loadInputs() {
  const files = {
    registrySource: 'scripts/data/models.json',
    publishedModels: 'models.json',
    targets: 'scripts/data/coverage-targets.json',
    providers: 'scripts/data/providers.json',
    links: 'scripts/data/model-registry-links.json',
    gaps: 'scripts/data/model-registry-gaps.json',
    apiPlans: 'api-plans.json',
    plans: 'plans.json',
    deals: 'deals.json',
    sourceHealth: 'scripts/data/source-health.json',
    sourceRulings: 'scripts/data/source-rulings.json',
    policy: 'scripts/lib/model-freshness.js',
    renderCore: 'index.html'
  };
  const hashes = {};
  for (const [key, file] of Object.entries(files)) hashes[file] = sha256(readText(file));
  return {
    hashes,
    files,
    registry: readJson(files.registrySource),
    published: readJson(files.publishedModels),
    targets: readJson(files.targets),
    providers: readJson(files.providers),
    links: readJson(files.links),
    gaps: readJson(files.gaps),
    apiPlans: readJson(files.apiPlans),
    plans: readJson(files.plans),
    deals: readJson(files.deals),
    sourceHealth: readJson(files.sourceHealth),
    sourceRulings: readJson(files.sourceRulings)
  };
}

const alphaKeys = doc => Object.keys(doc).filter(key => !key.startsWith('_'));

/* ------------------------------------------------------------------ */
/* 读数 1：releasedAt 已知/未知 + Release Evidence 的存在性               */
/* ------------------------------------------------------------------ */
function releasedAtReading(input) {
  const entries = alphaKeys(input.registry).map(slug => {
    const entry = input.registry[slug] || {};
    const raw = entry.releasedAt;
    const provided = raw !== null && raw !== undefined && String(raw).trim() !== '';
    const normalized = provided ? normalizeDate(raw) : null;
    return {
      slug,
      developer: entry.developer || null,
      owner: entry.owner || null,
      modelRole: entry.modelRole || null,
      status: entry.status || null,
      releasedAtRaw: provided ? String(raw).trim() : null,
      releasedAt: normalized,
      provided,
      unparsable: provided && !normalized,
      hasReleaseEvidence: Array.isArray(entry.releaseEvidence) && entry.releaseEvidence.length > 0,
      evidenceCount: Array.isArray(entry.releaseEvidence) ? entry.releaseEvidence.length : 0,
      officialUrl: entry.officialUrl || null
    };
  });
  const known = entries.filter(e => e.releasedAt).length;
  const unknown = entries.filter(e => !e.releasedAt).length;
  const unparsable = entries.filter(e => e.unparsable).length;
  const withEvidence = entries.filter(e => e.hasReleaseEvidence).length;
  // 充要关系（本文件独立判据）：releasedAt != null ⇔ releaseEvidence 非空
  const dateWithoutEvidence = entries.filter(e => e.releasedAt && !e.hasReleaseEvidence).map(e => e.slug);
  const evidenceWithoutDate = entries.filter(e => !e.releasedAt && e.hasReleaseEvidence).map(e => e.slug);
  return {
    registryModels: entries.length,
    known,
    unknown,
    unparsable,
    withReleaseEvidence: withEvidence,
    dateWithoutEvidence,
    evidenceWithoutDate,
    knownPercent: entries.length ? Number(((known / entries.length) * 100).toFixed(1)) : null,
    entries
  };
}

/* ------------------------------------------------------------------ */
/* 读数 2：catalogStatus 分布（自己实现分组/赢家/gap 规则）               */
/* ------------------------------------------------------------------ */
function catalogStatusDistribution(input, policy) {
  const models = Array.isArray(input.published.models) ? input.published.models : [];
  const tierOf = role => {
    const wanted = normalizeLabel(role);
    if (wanted) {
      for (const tier of Object.values(policy.tiers)) {
        if (tier.modelRoles.some(r => normalizeLabel(r) === wanted)) return tier;
      }
    }
    return policy.tiers[policy.defaultTier];
  };
  const groupKeyOf = record => {
    const override = normalizeLabel(record.freshnessGroup);
    if (override) return override;
    return [normalizeLabel(record.developer), normalizeLabel(record.family), normalizeLabel(record.modelRole)].join('\u0000');
  };
  const groups = new Map();
  for (const record of models) {
    const key = groupKeyOf(record);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }
  const rows = [];
  for (const [key, members] of groups) {
    // 组内"最新可比记录"：active 且有可判发布日；同日期按 slug 规范序取唯一赢家
    const comparable = members
      .filter(m => String(m.status || '').toLowerCase() === 'active' && normalizeDate(m.releasedAt))
      .sort((a, b) => (normalizeLabel(a.slug) < normalizeLabel(b.slug) ? -1 : 1));
    let winner = null;
    for (const member of comparable) {
      const day = dayOf(member.releasedAt);
      if (!winner || day > winner.day) winner = { slug: member.slug, day, releasedAt: normalizeDate(member.releasedAt) };
    }
    const roles = members.map(m => normalizeLabel(m.modelRole)).filter(Boolean).sort();
    const tier = tierOf(roles[0] || null);
    for (const member of members) {
      const status = normalizeLabel(member.status);
      let catalogStatus;
      if (status === 'retired') catalogStatus = 'historical';
      else if (status === 'unknown') catalogStatus = 'unknown';
      else if (!normalizeDate(member.releasedAt)) catalogStatus = 'unknown';
      else if (!winner) catalogStatus = 'unknown';
      else {
        const gap = Math.round((winner.day - dayOf(member.releasedAt)) / 86400000);
        if (gap < tier.currentWindowDays) catalogStatus = 'current';
        else if (gap < tier.agingWindowDays) catalogStatus = 'aging';
        else catalogStatus = 'legacy';
      }
      rows.push({
        slug: member.slug,
        group: key,
        groupTier: tier.tier,
        window: `${tier.currentWindowDays}/${tier.agingWindowDays}`,
        latestComparable: winner ? winner.slug : null,
        releasedAt: normalizeDate(member.releasedAt),
        status,
        catalogStatus,
        publishedCatalogStatus: member.catalogStatus === undefined ? null : member.catalogStatus
      });
    }
  }
  const counts = { current: 0, aging: 0, legacy: 0, historical: 0, unknown: 0 };
  for (const row of rows) counts[row.catalogStatus] = (counts[row.catalogStatus] || 0) + 1;
  const mismatches = rows
    .filter(row => row.publishedCatalogStatus !== row.catalogStatus)
    .map(row => ({ slug: row.slug, recomputed: row.catalogStatus, published: row.publishedCatalogStatus }));
  return { models: models.length, counts, sum: rows.reduce((n, r) => n + 1, 0), mismatches, rows };
}

/* ------------------------------------------------------------------ */
/* 读数 3：Target 七态（自己实现判据链）                                  */
/* ------------------------------------------------------------------ */
const DIMENSIONS = ['deals', 'coding', 'api', 'models'];
const PAYLOAD_KEY = { deals: 'source', coding: 'planName', api: 'modelKey', models: 'registrySlug' };

function targetStates(input, vendorRules) {
  const providerEntries = alphaKeys(input.providers).map(key => ({
    key,
    name: String((input.providers[key] && input.providers[key].name) || key),
    vendorKey: input.providers[key] && input.providers[key].vendorKey !== undefined ? input.providers[key].vendorKey : null
  }));
  const keyByName = new Map();
  for (const entry of providerEntries) if (!keyByName.has(entry.name)) keyByName.set(entry.name, entry.key);
  const keyByVendorKey = new Map();
  for (const entry of providerEntries) if (entry.vendorKey) keyByVendorKey.set(String(entry.vendorKey), entry.key);

  const facts = { deals: {}, coding: {}, api: {}, models: {}, modelBySlug: {} };
  for (const deal of (Array.isArray(input.deals.deals) ? input.deals.deals : (Array.isArray(input.deals) ? input.deals : []))) {
    const vendorKey = vendorKeyOf(deal, vendorRules);
    const providerKey = vendorKey ? keyByVendorKey.get(vendorKey) || keyByName.get(vendorKey) || null : null;
    if (!providerKey) continue;
    if (!facts.deals[providerKey]) facts.deals[providerKey] = { count: 0, sources: {} };
    facts.deals[providerKey].count += 1;
    const source = String(deal.source || '');
    if (source) facts.deals[providerKey].sources[source] = (facts.deals[providerKey].sources[source] || 0) + 1;
  }
  for (const plan of (Array.isArray(input.plans.plans) ? input.plans.plans : [])) {
    if (!plan || !plan.provider) continue;
    if (!facts.coding[plan.provider]) facts.coding[plan.provider] = { count: 0, planNames: [] };
    facts.coding[plan.provider].count += 1;
    if (typeof plan.planName === 'string' && plan.planName.trim()) facts.coding[plan.provider].planNames.push(plan.planName);
  }
  for (const plan of (Array.isArray(input.apiPlans.plans) ? input.apiPlans.plans : [])) {
    if (!plan || !plan.provider) continue;
    if (!facts.api[plan.provider]) facts.api[plan.provider] = { count: 0, modelKeys: [] };
    facts.api[plan.provider].count += 1;
    for (const model of (plan.models || [])) if (model && model.modelKey) facts.api[plan.provider].modelKeys.push(String(model.modelKey));
  }
  for (const slug of alphaKeys(input.registry)) {
    const entry = input.registry[slug] || {};
    const providerKey = keyByName.get(String(entry.developer || '')) || keyByName.get(String(entry.owner || '')) || null;
    facts.modelBySlug[slug] = { developer: entry.developer || null, owner: entry.owner || null, provider: providerKey };
    if (providerKey) {
      if (!facts.models[providerKey]) facts.models[providerKey] = { count: 0, slugs: [] };
      facts.models[providerKey].count += 1;
      facts.models[providerKey].slugs.push(slug);
    }
  }
  const healthByName = {};
  for (const row of (input.sourceHealth.sources || [])) {
    if (!row || !row.name) continue;
    healthByName[String(row.name)] = { status: row.status || null, reason: row.reason || null, consecutiveFailures: row.consecutiveFailures || 0 };
  }

  const declaredOf = (target, dimension) => (Array.isArray(target.currentTargets) ? target.currentTargets : []).filter(item => item && item.dimension === dimension);
  const rulingOf = (target, dimension) => (Array.isArray(target.rulings) ? target.rulings : []).find(r => r && r.dimension === dimension) || null;
  const resolveItem = (item, dimension, target) => {
    const providerName = (keyByName.has(target.provider) ? undefined : undefined) // 占位：providerName 从 providerEntries 取
      ;
    const name = (providerEntries.find(p => p.key === target.provider) || {}).name || target.provider;
    if (dimension === 'models') {
      const entry = facts.modelBySlug[item.registrySlug];
      if (!entry) return false;
      return entry.developer === name || entry.owner === name;
    }
    const row = facts[dimension][target.provider] || { count: 0 };
    if (dimension === 'coding') return (row.planNames || []).includes(item.planName);
    if (dimension === 'api') return (row.modelKeys || []).includes(item.modelKey);
    return ((row.sources || {})[item.source] || 0) > 0;
  };

  const rows = [];
  for (const target of (Array.isArray(input.targets.targets) ? input.targets.targets : [])) {
    for (const dimension of DIMENSIONS) {
      const intent = target.dimensionIntent ? target.dimensionIntent[dimension] : null;
      const applicable = typeof intent === 'string' && intent.trim().length > 0;
      const declared = declaredOf(target, dimension);
      const row = facts[dimension][target.provider] || { count: 0 };
      const ruling = rulingOf(target, dimension);
      const resolved = declared.filter(item => resolveItem(item, dimension, target)).length;
      let state;
      if (!applicable) state = 'NOT_APPLICABLE';
      else if (ruling) state = ruling.decision === 'unverifiable' ? 'UNVERIFIABLE' : 'DEFERRED';
      else {
        const declaredSources = declared.filter(item => item && typeof item.source === 'string' && item.source.trim());
        const unhealthy = declaredSources.filter(item => {
          const health = healthByName[item.source];
          return health && health.status && health.status !== 'healthy';
        });
        if (row.count === 0 && declaredSources.length > 0 && unhealthy.length === declaredSources.length) state = 'BLOCKED_SOURCE';
        else if (!declared.length) state = row.count > 0 ? 'COVERED' : 'MISSING';
        else if (resolved === declared.length) state = 'COVERED';
        else if (resolved > 0) state = 'PARTIAL';
        else state = row.count > 0 ? 'PARTIAL' : 'MISSING';
      }
      rows.push({
        provider: target.provider,
        dimension,
        state,
        declared: declared.length,
        resolved,
        present: row.count,
        ruling: ruling ? ruling.decision : null
      });
    }
  }
  const states = {};
  for (const row of rows) states[row.state] = (states[row.state] || 0) + 1;
  const currentTargets = rows.reduce((acc, row) => {
    acc.declared += row.declared;
    acc.resolved += row.resolved;
    return acc;
  }, { declared: 0, resolved: 0 });
  return {
    providers: providerEntries.length,
    cells: rows.length,
    states,
    currentTargets,
    missing: rows.filter(r => r.state === 'MISSING'),
    partial: rows.filter(r => r.state === 'PARTIAL'),
    deferred: rows.filter(r => r.state === 'DEFERRED'),
    unverifiable: rows.filter(r => r.state === 'UNVERIFIABLE'),
    notApplicable: rows.filter(r => r.state === 'NOT_APPLICABLE'),
    blocked: rows.filter(r => r.state === 'BLOCKED_SOURCE'),
    rows
  };
}

/* ------------------------------------------------------------------ */
/* 读数 4：Registry 映射闭合 + API 记账方程                              */
/* ------------------------------------------------------------------ */
function registryClosure(input) {
  const table = alphaKeys(input.registry);
  const links = Array.isArray(input.links.links) ? input.links.links : [];
  const declarations = Array.isArray(input.gaps.declarations) ? input.gaps.declarations : [];
  const apiPlans = Array.isArray(input.apiPlans.plans) ? input.apiPlans.plans : [];
  const pricingIdentities = [];
  for (const plan of apiPlans) {
    for (const entry of (plan.models || [])) {
      pricingIdentities.push({ apiPlanId: plan.id, provider: plan.provider, modelKey: entry.modelKey, variant: entry.variant === undefined ? null : entry.variant });
    }
  }
  const identityKey = identity => `${identity.apiPlanId}\u0000${identity.modelKey}\u0000${identity.variant === undefined ? '' : identity.variant}`;

  /** 通配展开：variant 为 null/undefined ⇒ 该 (planId, modelKey) 的全部变体 */
  const expand = declaration => {
    const wanted = declaration.variant === undefined ? null : declaration.variant;
    return pricingIdentities.filter(identity => identity.apiPlanId === declaration.apiPlanId
      && identity.modelKey === declaration.modelKey
      && (wanted === null || identity.variant === wanted));
  };

  const mapped = new Set();
  const linkProblems = [];
  for (const link of links) {
    if (!link) continue;
    if (link.apiPlanId) {
      const expanded = pricingIdentities.filter(identity => identity.apiPlanId === link.apiPlanId
        && identity.modelKey === link.modelKey
        && (link.variant === undefined || link.variant === null || identity.variant === link.variant));
      if (!expanded.length) linkProblems.push({ kind: 'link-points-nowhere', link });
      for (const identity of expanded) mapped.add(identityKey(identity));
    }
    if (link.registrySlug && !table.includes(link.registrySlug)) linkProblems.push({ kind: 'link-registry-slug-missing', slug: link.registrySlug });
  }
  const apiDeclarations = declarations.filter(d => d && d.apiPlanId !== undefined && d.modelKey !== undefined);
  const codingDeclarations = declarations.filter(d => d && d.planId !== undefined && d.modelName !== undefined);
  const declaredIdentities = new Set();
  const declarationProblems = [];
  for (const declaration of apiDeclarations) {
    const expanded = expand(declaration);
    if (!expanded.length) declarationProblems.push({ kind: 'declaration-points-nowhere', declaration: { apiPlanId: declaration.apiPlanId, modelKey: declaration.modelKey, variant: declaration.variant } });
    for (const identity of expanded) declaredIdentities.add(identityKey(identity));
  }
  const undecided = pricingIdentities.filter(identity => !mapped.has(identityKey(identity)) && !declaredIdentities.has(identityKey(identity)));
  const unmappedModels = table.filter(slug => !links.some(link => link && link.registrySlug === slug));

  const equation = {
    A_mappedApiEntries: mapped.size,
    B_declaredApiIdentities: declaredIdentities.size,
    C_undecided: undecided.length,
    sum: mapped.size + declaredIdentities.size + undecided.length,
    apiModelPricingItems: pricingIdentities.length,
    holds: mapped.size + declaredIdentities.size + undecided.length === pricingIdentities.length
  };
  // t6-F1 / t12 的两处口径：声明行数（同一批声明行的两种视图）
  const declaredRows = apiDeclarations.length;
  const wildcardDeclarations = apiDeclarations.filter(d => d.variant === null || d.variant === undefined).length;
  return {
    registryModels: table.length,
    unmappedModels,
    links: links.length,
    linkProblems,
    declarationRowCount: declarations.length,
    apiDeclarationRows: declaredRows,
    codingDeclarationRows: codingDeclarations.length,
    wildcardDeclarations,
    declarationProblems,
    equation,
    caliber: {
      rowsVsIdentities: { rows: declaredRows, identities: declaredIdentities.size, equal: declaredRows === declaredIdentities.size, identitiesGeRows: declaredIdentities.size >= declaredRows },
      note: '声明行数 = 声明条目数；展开后 identity 数（＝方程的 B）只在没有 variant:null 通配时与它相等'
    }
  };
}

/* ------------------------------------------------------------------ */
/* 读数 5：Source health 普查 + 裁决三方对账                             */
/* ------------------------------------------------------------------ */
function sourceHealthCensus(input) {
  const rows = Array.isArray(input.sourceHealth.sources) ? input.sourceHealth.sources : [];
  const census = { healthy: 0, degraded: 0, failed: 0, other: 0 };
  for (const row of rows) census[row.status] === undefined ? census.other++ : census[row.status]++;
  const longFailing = rows.filter(r => Number(r.consecutiveFailures) >= 3)
    .map(r => ({ source: r.source, consecutiveFailures: r.consecutiveFailures, status: r.status, lastError: r.lastError, lastSuccessAt: r.lastSuccessAt }));
  const rulings = Array.isArray(input.sourceRulings.rulings) ? input.sourceRulings.rulings : [];
  const rulingSources = rulings.map(r => r.source);
  const missingRulings = longFailing.filter(row => !rulingSources.includes(row.source)).map(row => row.source);
  const unreconciled = rulingSources.filter(source => !rows.some(row => row.source === source));
  // 注册表一侧：从源码文本扫 id（不 require collectors）
  const collectorText = readText('scripts/collectors/index.js')
    + readText('scripts/collectors/cn_docs.js')
    + readText('scripts/collectors/global_deals.js')
    + readText('scripts/collectors/global_directories.js')
    + readText('scripts/collectors/headless.js');
  const collectorIds = [...collectorText.matchAll(/\bid:\s*'([a-z0-9_]+)'/g)].map(m => m[1]);
  const uniqueCollectorIds = [...new Set(collectorIds)].sort();
  return {
    generatedAt: input.sourceHealth.generatedAt,
    rowCount: rows.length,
    census,
    zeroOutput: rows.filter(r => r.lastItemCount === 0).map(r => r.source),
    longFailing,
    missingRulings,
    unreconciledRulingSources: unreconciled,
    decisionCounts: rulings.reduce((acc, r) => { acc[r.decision] = (acc[r.decision] || 0) + 1; return acc; }, {}),
    reviewedAt: input.sourceRulings.reviewedAt || null,
    collectorIdsFromSource: uniqueCollectorIds,
    rowsNotInCollectorIds: rows.map(r => r.source).filter(source => !uniqueCollectorIds.includes(source)),
    collectorIdsWithoutHealthRow: uniqueCollectorIds.filter(id => !rows.some(row => row.source === id))
  };
}

/* ------------------------------------------------------------------ */
/* 对照：与 coverage-report.js --json 的读数逐项比                        */
/* ------------------------------------------------------------------ */
function compare(recomputed, report) {
  const diffs = [];
  /** 状态字典按固定词表补 0 再比：报告会把 0 也印出来，独立重算只数出现过的 — 那是**形状**差异，不是读数差异 */
  const stateDict = (dict, wordlist) => {
    const out = {};
    for (const state of wordlist) out[state] = (dict && dict[state]) || 0;
    return out;
  };
  const STATE_WORDS = ['COVERED', 'PARTIAL', 'MISSING', 'DEFERRED', 'UNVERIFIABLE', 'NOT_APPLICABLE', 'BLOCKED_SOURCE'];
  const push = (metric, mine, theirs, note) => {
    const equal = JSON.stringify(mine) === JSON.stringify(theirs);
    diffs.push({ metric, recomputed: mine, report: theirs, equal, note: note || null });
  };
  if (!report) return { available: false, diffs };
  const ct = report.coverageTargets || {};
  push('registry.releasedAt.known', recomputed.releasedAt.known, ct.releaseEvidence ? ct.releaseEvidence.known : null, 'report 的 known 来自 lib/model-freshness.js 的 releaseDateOf().provided');
  push('registry.releasedAt.unknown', recomputed.releasedAt.unknown, ct.releaseEvidence ? ct.releaseEvidence.unknown : null);
  push('registry.releasedAt.unparsable', recomputed.releasedAt.unparsable, ct.releaseEvidence ? ct.releaseEvidence.unparsable : null);
  push('registry.withReleaseEvidence', recomputed.releasedAt.withReleaseEvidence, ct.releaseEvidence ? ct.releaseEvidence.withReleaseEvidence : null);
  push('catalogStatus.counts', recomputed.catalogStatus.counts, ct.catalogStatusCensus ? ct.catalogStatusCensus.counts : null);
  push('targets.states（补零后）', stateDict(recomputed.targets.states, STATE_WORDS), stateDict(ct.states, STATE_WORDS), '报告印 0 值键；独立重算只统计出现过的状态——补零后逐键相等');
  push('targets.missingCount', recomputed.targets.missing.length, (ct.missingTargets || []).length);
  push('targets.partialCount', recomputed.targets.partial.length, (ct.partialTargets || []).length);
  push('targets.deferredCount', recomputed.targets.deferred.length, (ct.deferred || []).length);
  push('targets.unverifiableCount', recomputed.targets.unverifiable.length, (ct.unverifiable || []).length);
  push('targets.notApplicableCount', recomputed.targets.notApplicable.length, (ct.notApplicable || []).length);
  push('registry.unmappedModels', recomputed.closure.unmappedModels, (report.registry && report.registry.unmappedModels) || null);
  push('api.equation.A', recomputed.closure.equation.A_mappedApiEntries, report.registry ? report.registry.mappedApiEntries : null);
  push('api.equation.B', recomputed.closure.equation.B_declaredApiIdentities, report.registry ? report.registry.declaredApiEntries : null);
  push('api.declaredRows', recomputed.closure.apiDeclarationRows, report.registry && Array.isArray(report.registry.declaredApiEntryRows) ? report.registry.declaredApiEntryRows.length : null);
  push('api.equation.C', recomputed.closure.equation.C_undecided, report.gaps ? report.gaps.unmappedModelCount : null);
  push('api.equation.sum', recomputed.closure.equation.sum, report.api ? report.api.modelPricingItems : null);
  push('sourceHealth.rowCount', recomputed.sourceHealth.rowCount, ct.sourceReliability ? ct.sourceReliability.healthRowCount : null);
  push('sourceHealth.generatedAt', recomputed.sourceHealth.generatedAt, ct.sourceReliability ? ct.sourceReliability.healthGeneratedAt : null);
  push('targets.cells', recomputed.targets.cells, Array.isArray(ct.rows) ? ct.rows.length : null);
  // 逐格状态对照（最细粒度）
  const reportRowKey = row => `${row.provider}\u0000${row.dimension}`;
  const reportRows = new Map((ct.rows || []).map(row => [reportRowKey(row), row.state]));
  const cellDiffs = recomputed.targets.rows
    .filter(row => reportRows.has(reportRowKey(row)) && reportRows.get(reportRowKey(row)) !== row.state)
    .map(row => ({ provider: row.provider, dimension: row.dimension, recomputed: row.state, report: reportRows.get(reportRowKey(row)), present: row.present, declared: row.declared, resolved: row.resolved, ruling: row.ruling }));
  const catalogDiffs = recomputed.catalogStatus.mismatches;
  return { available: true, diffs, mismatched: diffs.filter(d => !d.equal), cellDiffs, catalogDiffs };
}

/* ------------------------------------------------------------------ */
function main() {
  const startedAt = new Date();
  const input = loadInputs();
  const policy = policyFromSourceText();
  const vendor = vendorRulesFromHtml();

  const releasedAt = releasedAtReading(input);
  const catalogStatus = catalogStatusDistribution(input, policy);
  const targets = targetStates(input, vendor.rules);
  const closure = registryClosure(input);
  const sourceHealth = sourceHealthCensus(input);

  let report = null;
  let reportRaw = null;
  try {
    reportRaw = readText(path.relative(ROOT, REPORT_JSON));
    report = JSON.parse(reportRaw);
  } catch (error) {
    report = null;
  }
  const comparison = compare({ releasedAt, catalogStatus, targets, closure, sourceHealth }, report);

  const out = {
    probe: 'independent-recompute.cjs',
    ranAtUtc: startedAt.toISOString(),
    ranAtLocal: startedAt.toString(),
    independence: {
      requiredModules: ['fs', 'path', 'crypto'],
      forbiddenNotRequired: [
        'scripts/lib/coverage-targets.js',
        'scripts/lib/model-freshness.js',
        'scripts/tools/coverage-report.js'
      ],
      reusedAuthorityTables: [policy.source, vendor.source],
      note: '判据代码全部本文件自己实现；只复用"权威数据表"（策略阈值与厂商规则），且都是读源码/HTML 文本，不经被测模块'
    },
    inputHashes: input.hashes,
    reportJsonSource: reportRaw ? { file: path.relative(ROOT, REPORT_JSON), sha256: sha256(reportRaw), bytes: Buffer.byteLength(reportRaw, 'utf8') } : null,
    releasedAt: { registryModels: releasedAt.registryModels, known: releasedAt.known, unknown: releasedAt.unknown, unparsable: releasedAt.unparsable, withReleaseEvidence: releasedAt.withReleaseEvidence, knownPercent: releasedAt.knownPercent, dateWithoutEvidence: releasedAt.dateWithoutEvidence, evidenceWithoutDate: releasedAt.evidenceWithoutDate, entries: releasedAt.entries },
    catalogStatus: { models: catalogStatus.models, counts: catalogStatus.counts, sum: catalogStatus.sum, mismatches: catalogStatus.mismatches, rows: catalogStatus.rows },
    targets: { providers: targets.providers, cells: targets.cells, states: targets.states, currentTargets: targets.currentTargets, missing: targets.missing, partial: targets.partial, deferred: targets.deferred, unverifiable: targets.unverifiable, notApplicable: targets.notApplicable, blocked: targets.blocked, rows: targets.rows },
    closure,
    sourceHealth,
    comparison
  };

  fs.writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`, 'utf8');

  const mark = value => (value ? '✅' : '❌');
  console.log(`[recompute] 独立路径：require = ${out.independence.requiredModules.join(', ')}（未 require 被测 lib）`);
  console.log(`[recompute] releasedAt: 总 ${releasedAt.registryModels} · known ${releasedAt.known} · unknown ${releasedAt.unknown} · unparsable ${releasedAt.unparsable} · 带引文 ${releasedAt.withReleaseEvidence}`);
  console.log(`[recompute] 充要：有日期无引文 ${JSON.stringify(releasedAt.dateWithoutEvidence)} · 有引文无日期 ${JSON.stringify(releasedAt.evidenceWithoutDate)}`);
  console.log(`[recompute] catalogStatus: ${JSON.stringify(catalogStatus.counts)}（sum=${catalogStatus.sum}）与发布产物不一致 ${catalogStatus.mismatches.length} 条`);
  console.log(`[recompute] targets 七态: ${JSON.stringify(targets.states)} 格子 ${targets.cells}；current targets 兑现 ${targets.currentTargets.resolved}/${targets.currentTargets.declared}`);
  console.log(`[recompute] API 记账：A=${closure.equation.A_mappedApiEntries} + B=${closure.equation.B_declaredApiIdentities} + C=${closure.equation.C_undecided} = ${closure.equation.sum} / 总条目 ${closure.equation.apiModelPricingItems} ${mark(closure.equation.holds)}`);
  console.log(`[recompute] 声明行数=${closure.apiDeclarationRows}（通配 ${closure.wildcardDeclarations}）· B>=rows ${mark(closure.caliber.rowsVsIdentities.identitiesGeRows)} · B==rows ${mark(closure.caliber.rowsVsIdentities.equal)}`);
  console.log(`[recompute] 映射闭合：未映射模型 ${JSON.stringify(closure.unmappedModels)} · link 问题 ${closure.linkProblems.length} · 声明问题 ${closure.declarationProblems.length}`);
  console.log(`[recompute] source health: ${JSON.stringify(sourceHealth.census)} rows=${sourceHealth.rowCount} generatedAt=${sourceHealth.generatedAt} 缺裁决 ${JSON.stringify(sourceHealth.missingRulings)}`);
  if (comparison.available) {
    console.log(`[recompute] 与 report 对照：${comparison.mismatched.length} 项不等 / ${comparison.diffs.length} 项`);
    for (const diff of comparison.mismatched) console.log(`   ❌ ${diff.metric}: 独立=${JSON.stringify(diff.recomputed)} vs 报告=${JSON.stringify(diff.report)}`);
    console.log(`[recompute] 逐格状态差异 ${comparison.cellDiffs.length} 处；catalogStatus 差异 ${comparison.catalogDiffs.length} 处`);
  } else {
    console.log('[recompute] ⚠️ 没有可对照的 report JSON（--report-json 指向的文件不存在）');
  }
  console.log(`[recompute] 写出: ${path.relative(ROOT, OUT)}`);
}

main();
