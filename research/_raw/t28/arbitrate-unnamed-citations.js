#!/usr/bin/env node
'use strict';
/**
 * t28 · 残余条数仲裁：**「历史 API 映射中引文没有点名该模型」到底几条**。
 *
 * 判据（写死，逐字来自 t28 任务书 acceptance ⑤）：
 *   规则 = links 中 apiPlanId 侧 且 basis != explicit-mapping 且
 *          其 evidence 的 quote 里**不出现**该条 modelKey / 记录内该条目的 name / registrySlug
 *          （大小写不敏感，逐条子串）。
 *
 * 本脚本只读原始 JSON，**不复用** lib / 报告的任何函数（第二条路径），
 * 并额外把「两种旧读数（36 / 52）」用一组显式变体复现出来，逐条说明各自口径错在哪。
 *
 * 用法：
 *   node research/_raw/t28/arbitrate-unnamed-citations.js             # 人读
 *   node research/_raw/t28/arbitrate-unnamed-citations.js --json      # 机器读（stdout 只有一段 JSON）
 * 退出码 0 = 仲裁跑通（结果本身是"数据"）；1 = 自洽性断言失败（说明脚本或数据有一致性问题）。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', '..', '..');
const read = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

const linksDoc = read('scripts/data/model-registry-links.json');
const apiDoc = read('api-plans.json');
const modelsSrc = read('scripts/data/models.json');

const links = Array.isArray(linksDoc.links) ? linksDoc.links : [];

/** api-plans 记录里每个 (planId, modelKey, variant) 条目 → name（"记录内该条目的 name"） */
const entryNameByKey = new Map();
for (const plan of apiDoc.plans || []) {
  for (const m of plan.models || []) {
    entryNameByKey.set(`${plan.id}\u0000${m.modelKey}\u0000${m.variant}`, m.name || '');
  }
}

const lower = s => String(s === null || s === undefined ? '' : s).toLowerCase();
const quotesOf = link => (Array.isArray(link.evidence) ? link.evidence : [])
  .map(e => (e && typeof e.quote === 'string' ? e.quote : ''));

/** 一条 link 的「要出现在引文里的三个名字」 */
function namesOf(link) {
  const entryName = entryNameByKey.get(`${link.apiPlanId}\u0000${link.modelKey}\u0000${link.variant}`) || '';
  return {
    modelKey: String(link.modelKey || ''),
    entryName,
    registrySlug: String(link.registrySlug || ''),
  };
}

/** 判据核心：任一 quote 命中三个名字之一 ⇒ 这条引文"点名了该模型" */
function quoteNames(link, { useEntryName = true, useRegistrySlug = true, caseSensitive = false } = {}) {
  const names = namesOf(link);
  const needles = [names.modelKey, useEntryName ? names.entryName : '', useRegistrySlug ? names.registrySlug : '']
    .filter(Boolean)
    .map(n => (caseSensitive ? n : lower(n)));
  const quotes = quotesOf(link).map(q => (caseSensitive ? q : lower(q)));
  return quotes.some(q => needles.some(n => q.includes(n)));
}

const apiSide = link => Boolean(link && link.apiPlanId);

/** 写死的规则（仲裁值） */
function unnamedPerRule() {
  return links.filter(link => apiSide(link)
    && String(link.basis || '') !== 'explicit-mapping'
    && !quoteNames(link));
}

const canonical = rows => rows.map(l => ({
  registrySlug: l.registrySlug || null,
  apiPlanId: l.apiPlanId,
  modelKey: l.modelKey,
  variant: l.variant === undefined ? null : l.variant,
  basis: l.basis || null,
  quotes: quotesOf(l).length,
})).sort((a, b) => (String(a.registrySlug) + a.apiPlanId + a.modelKey).localeCompare(String(b.registrySlug) + b.apiPlanId + b.modelKey));

const main = unnamedPerRule();
const payload = canonical(main);
const listJson = JSON.stringify(payload, null, 2) + '\n';
const sha = crypto.createHash('sha256').update(listJson).digest('hex');

/* ── 两种旧读数的口径复现 ─────────────────────────────────────── */
const variants = {
  'V1 写死规则（仲裁值）：apiPlanId 侧 · basis≠explicit-mapping · 引文不含 modelKey/name/registrySlug':
    main.length,
  'V2 只看"完全没有 evidence 条目"（把"有引文但没点名"漏掉）':
    links.filter(l => apiSide(l) && String(l.basis || '') !== 'explicit-mapping' && quotesOf(l).filter(Boolean).length === 0).length,
  'V3 不认"记录内 name"这一支（只比 modelKey + registrySlug）':
    links.filter(l => apiSide(l) && String(l.basis || '') !== 'explicit-mapping' && !quoteNames(l, { useEntryName: false })).length,
  'V4 不认 registrySlug 这一支（只比 modelKey + name）':
    links.filter(l => apiSide(l) && String(l.basis || '') !== 'explicit-mapping' && !quoteNames(l, { useRegistrySlug: false })).length,
  'V5 大小写敏感（同一句引文因大小写差异被误判为"没点名"）':
    links.filter(l => apiSide(l) && String(l.basis || '') !== 'explicit-mapping' && !quoteNames(l, { caseSensitive: true })).length,
  'V6 把 basis=explicit-mapping 也算进来（那一类**本来就**不写引文，是设计）':
    links.filter(l => apiSide(l) && !quoteNames(l)).length,
  'V7 不限定 API 侧（把 Coding 侧映射也算进来）':
    links.filter(l => String(l.basis || '') !== 'explicit-mapping' && !quoteNames(l)).length,
  'V8 按**展开后的计价条目**而不是按 link 计（通配声明会展开成多条）':
    links.filter(l => apiSide(l) && String(l.basis || '') !== 'explicit-mapping' && !quoteNames(l))
      .reduce((n, l) => n + (l.variant === null || l.variant === undefined ? 2 : 1), 0),
};

const out = {
  generatedAt: new Date().toISOString(),
  rule: 'links 中 apiPlanId 侧 且 basis != explicit-mapping 且 其 evidence 的 quote 里不出现该条 modelKey / 记录内该条目的 name / registrySlug（大小写不敏感，逐条子串）',
  totals: { links: links.length },
  authoritativeCount: main.length,
  listSha256: sha,
  list: payload,
  variants,
};

if (process.argv.includes('--json')) {
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
} else {
  console.log('仲裁判据（逐字）：' + out.rule);
  console.log('links 总数 ' + links.length + ' · API 侧 ' + links.filter(apiSide).length);
  console.log('\n★ 仲裁结果：**' + main.length + '** 条（清单 sha256 = ' + sha + '）');
  console.log('\n逐条：');
  payload.forEach((r, i) => console.log('  ' + String(i + 1).padStart(2) + '. '
    + String(r.registrySlug) + ' · apiPlanId=' + r.apiPlanId + ' · modelKey=' + r.modelKey
    + ' · variant=' + JSON.stringify(r.variant) + ' · basis=' + r.basis + ' · quotes=' + r.quotes));
  console.log('\n口径变体（用来解释 36 / 52 两个旧读数）：');
  for (const [k, v] of Object.entries(variants)) console.log('  ' + String(v).padStart(3) + '  ' + k);
}
process.exitCode = 0;
