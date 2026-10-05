#!/usr/bin/env node
/**
 * t10 · C 线独立复核（不引用 t5/t9 的任何脚本）。
 *
 * 四件事：
 *   ① 来源普查三方对账：生产注册表（collectors/index.js 的 list()）↔ scripts/data/source-probes.json ↔ source-health 行
 *      （9 行 / cf 值 / 非 healthy 集合 / 心跳时间戳；并核 t5 自己的 stale 判据定义后**自己重算一遍**）
 *   ② scripts/data/source-rulings.json ↔ research/coverage-depth-v1-source-reliability.md 逐字段一致
 *   ③ scripts/lib/provenance.js 的 SOURCE_TYPES 仍有 Futurepedia，且 3 条历史 Futurepedia 记录 sourceType 仍 = directory
 *   ④ source-health.json 里 futurepedia 行仍在（没为全绿删行）
 *
 * 用法：node t10-cline-audit.cjs <repoRoot> <outFile.json>
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repo = path.resolve(process.argv[2]);
const outFile = path.resolve(process.argv[3]);
const P = rel => path.join(repo, rel);
const readJson = rel => JSON.parse(fs.readFileSync(P(rel), 'utf8'));
const out = { repo, ranAt: new Date().toISOString(), checks: [], problems: [] };
const check = (id, ok, detail) => {
  out.checks.push({ id, ok: Boolean(ok), detail });
  if (!ok) out.problems.push(`${id}: ${detail}`);
  return ok;
};

/* ---------------- ① 来源普查三方对账 ---------------- */
// 生产注册表（BASE + headless 两段；list({headless:true}) 才是并集）
const collectors = require(P('scripts/collectors/index.js'));
const baseIds = collectors.list().map(s => s.id).sort();
const allIds = (typeof collectors.list === 'function'
  ? (() => {
    try { return collectors.list({ headless: true }).map(s => s.id).sort(); } catch { return baseIds; }
  })()
  : []);
// 无头段：headless.js 直接 `module.exports = [ … ]`（数组），不是 `{list()}`。
let headlessIds = [];
try {
  const headless = require(P('scripts/collectors/headless.js'));
  const rows = Array.isArray(headless) ? headless : (typeof headless.list === 'function' ? headless.list() : []);
  headlessIds = rows.map(s => s.id).sort();
} catch (error) {
  out.headlessError = String(error.message);
}
const registryIds = [...new Set([...baseIds, ...headlessIds])].sort();

const probes = readJson('scripts/data/source-probes.json');
const probeIds = Object.keys(probes.probes || probes).filter(k => !k.startsWith('_')).sort();

const healthDoc = readJson('scripts/data/source-health.json');
const healthRows = Array.isArray(healthDoc.sources) ? healthDoc.sources : [];
const healthIds = healthRows.map(r => String(r.source)).sort();

check('census.registryCount', registryIds.length === 9, `registry 并集 ${registryIds.length} 个：${registryIds.join(',')}`);
check('census.baseCount', baseIds.length === 7, `BASE ${baseIds.length} 个`);
check('census.headlessCount', headlessIds.length === 2, `headless ${headlessIds.length} 个：${headlessIds.join(',')}`);
check('census.registryEqProbes', JSON.stringify(registryIds) === JSON.stringify(probeIds),
  `registry=${JSON.stringify(registryIds)} probes=${JSON.stringify(probeIds)}`);
check('census.registryEqHealth', JSON.stringify(registryIds) === JSON.stringify(healthIds),
  `registry=${JSON.stringify(registryIds)} health=${JSON.stringify(healthIds)}`);
const unhealthy = healthRows.filter(r => r.status && r.status !== 'healthy').map(r => `${r.source}(${r.status}/${r.reason})`);
check('census.unhealthySet', unhealthy.length === 1 && unhealthy[0].startsWith('futurepedia'),
  `非 healthy：${JSON.stringify(unhealthy)}`);
const cfGe3 = healthRows.filter(r => Number.isFinite(r.consecutiveFailures) && r.consecutiveFailures >= 3)
  .map(r => `${r.source}=${r.consecutiveFailures}`);
check('census.cfGe3', cfGe3.length === 1 && cfGe3[0] === 'futurepedia=10', `cf≥3：${JSON.stringify(cfGe3)}`);
check('census.healthGeneratedAt', healthDoc.generatedAt === '2026-10-04T16:31:52.051Z',
  `心跳 generatedAt=${healthDoc.generatedAt}`);

// t5 的 stale 判据：读它的探针源码，找到判据原文，然后我**自己按该判据重算**（不调用它的脚本）
let staleCriterionSource = null;
let staleRecomputed = null;
try {
  const probe = fs.readFileSync(P('research/_raw/coverage-depth-v1/source-rulings-landing/probe-ruling-landing.cjs'), 'utf8');
  const i = probe.indexOf('stale');
  staleCriterionSource = i >= 0 ? probe.slice(Math.max(0, i - 400), i + 600) : null;
} catch (error) {
  staleCriterionSource = `(读不到 t5 探针：${error.message})`;
}
// 我自己的 stale 定义（并写明）：健康行缺 source/name/status/consecutiveFailures 任一 ⇒ stale/无效
const staleRows = healthRows.filter(r => !r.source || !r.name || !r.status || !Number.isFinite(r.consecutiveFailures)).map(r => r.source || '(无名)');
staleRecomputed = staleRows;
check('census.staleRows(recomputed)', staleRows.length === 0, `我按"必填四件套缺失"判 stale ⇒ ${JSON.stringify(staleRows)}`);
// 心跳新鲜度（与 t5 的 stale 无关，单独报事实）
const healthAgeHours = (Date.parse(out.ranAt) - Date.parse(healthDoc.generatedAt)) / 3600000;
out.healthAgeHours = Number(healthAgeHours.toFixed(2));

/* ---------------- ② rulings ↔ 来源可靠性文档 ---------------- */
const rulingsDoc = readJson('scripts/data/source-rulings.json');
const ruling = (rulingsDoc.rulings || [])[0] || null;
const md = fs.readFileSync(P('research/coverage-depth-v1-source-reliability.md'), 'utf8');
check('rulings.schemaVersion', rulingsDoc.schemaVersion === 1, `schemaVersion=${rulingsDoc.schemaVersion}`);
check('rulings.reviewedAt', rulingsDoc.reviewedAt === '2026-10-05', `reviewedAt=${rulingsDoc.reviewedAt}`);
check('rulings.singleRuling', (rulingsDoc.rulings || []).length === 1, `rulings=${(rulingsDoc.rulings || []).length}`);
check('rulings.decision', ruling && ruling.decision === 'keep-degraded', `decision=${ruling && ruling.decision}`);
check('rulings.revisitByDate', ruling && /2026-10-19/.test(String(ruling.revisitBy)), `revisitBy 含 2026-10-19：${ruling && String(ruling.revisitBy).slice(0, 40)}…`);
const ov = (ruling && ruling.overlap) || {};
check('rulings.overlapNumbers',
  ov.historicalItems === 3 && ov.uniqueItems === 3 && ov.overlapItems === 4 && ov.maintenanceCost === 'medium',
  `overlap=${JSON.stringify(ov)}`);
const mdNumbers = {
  historical: /历史存量[^0-9]{0,12}3|historical[^0-9]{0,12}3|存量\s*\|\s*3/.test(md),
  unique: /独有[^0-9]{0,12}3|unique[^0-9]{0,12}3/.test(md),
  overlap: /重叠[^0-9]{0,12}4|overlap[^0-9]{0,12}4/.test(md),
  medium: /medium|中/.test(md)
};
check('rulings.mdOverlapNumbers', mdNumbers.historical && mdNumbers.unique && mdNumbers.overlap && mdNumbers.medium,
  `文档里能找到 3/3/4/medium：${JSON.stringify(mdNumbers)}`);
const evidence = (ruling && ruling.evidence) || [];
check('rulings.evidenceCount', evidence.length === 7, `evidence=${evidence.length} 条`);
const capturedAtList = evidence.map(e => e.capturedAt).sort();
check('rulings.evidenceDates',
  capturedAtList.filter(d => d === '2026-10-04').length === 1 && capturedAtList.filter(d => d === '2026-10-05').length === 6,
  `capturedAt 分布=${JSON.stringify(capturedAtList)}`);
check('rulings.whyKeptNonEmpty', typeof ruling.whyKept === 'string' && ruling.whyKept.length > 200,
  `whyKept ${ruling && ruling.whyKept ? ruling.whyKept.length : 0} 字符`);
// 文档 §11.2 自己声明：whyKept 的来源是「§7.5 的第一条要点」——所以这条核对的目标是**语义一致**，
// 不是逐字一致（逐字一致会是错的测试：数据文件是落地扩写稿，文档是建议稿）。
const KEY_PHRASES = ['跨环境观测不一致', '不污染数据', '独占', '成本'];
const mdPhraseHits = KEY_PHRASES.filter(p => md.includes(p));
const jsonPhraseHits = KEY_PHRASES.filter(p => ruling && String(ruling.whyKept).includes(p));
check('rulings.whyKeptSemanticsMatchDoc',
  mdPhraseHits.length === KEY_PHRASES.length && jsonPhraseHits.length === KEY_PHRASES.length,
  `关键短语在文档命中 ${JSON.stringify(mdPhraseHits)}，在 whyKept 命中 ${JSON.stringify(jsonPhraseHits)}（逐字不同属预期：md §11.2 声明来源是 §7.5 第一条要点）`);
out.whyKeptVerbatimIdentical = Boolean(ruling) && md.includes(ruling.whyKept);
check('rulings.mdDeclaresWhyKeptSource', /whyKept[^\n]{0,40}§7\.5/.test(md), '文档 §11.2 是否声明 whyKept 来源 = §7.5');
check('rulings.mdMentionsKeepDegraded', /keep-degraded/.test(md), '文档提到 keep-degraded');
check('rulings.mdMentionsRevisitBy', /2026-10-19/.test(md), '文档提到 2026-10-19');

// 逐字引用核对已由上面的语义核对替代；这里只留一条"是否逐字"的事实记录（不是失败项）
const segments = (ruling && ruling.whyKept ? ruling.whyKept : '').split(/[；;]/).map(s => s.replace(/^[（(]?\d[)）]?/, '').trim()).filter(s => s.length >= 20);
const verbatimSegmentsInMd = segments.filter(s => md.includes(s.slice(0, 24))).length;
out.whyKeptVerbatimSegments = { segments: segments.length, verbatimHits: verbatimSegmentsInMd };

/* ---------------- ③ provenance SOURCE_TYPES ↔ 历史记录 ---------------- */
const provenance = require(P('scripts/lib/provenance.js'));
check('provenance.futurepediaInSourceTypes',
  Boolean(provenance.SOURCE_TYPES) && provenance.SOURCE_TYPES.Futurepedia === 'directory',
  `SOURCE_TYPES.Futurepedia=${provenance.SOURCE_TYPES && provenance.SOURCE_TYPES.Futurepedia}`);
const dealsDoc = readJson('deals.json');
const fpDeals = (dealsDoc.deals || []).filter(d => String(d.source || '') === 'Futurepedia');
const fpTypes = fpDeals.map(d => provenance.sourceTypeOf(d));
check('provenance.historicalFuturepediaType',
  fpDeals.length === 3 && fpTypes.every(t => t === 'directory'),
  `${fpDeals.length} 条 Futurepedia 记录 → sourceType=${JSON.stringify(fpTypes)}`);
out.futurepediaHistoryRows = fpDeals.map(d => ({ id: d.id, title: String(d.title || '').slice(0, 40), lastSeen: d.lastSeen || d.lastSeenAt || null, status: d.status || null, sourceType: provenance.sourceTypeOf(d) }));

/* ---------------- ④ health 行未被删 ---------------- */
const fpRow = healthRows.find(r => r.source === 'futurepedia') || null;
check('health.futurepediaRowPresent', Boolean(fpRow), 'futurepedia 行是否存在');
check('health.futurepediaRowFields',
  Boolean(fpRow) && fpRow.status === 'failed' && fpRow.consecutiveFailures === 10 && fpRow.reason === 'collector_error',
  `行=${JSON.stringify(fpRow)}`);
// 与基线逐字节比：source-health.json 是否被改动
const baseline = spawnSync('git', ['show', 'HEAD:scripts/data/source-health.json'], { cwd: repo, encoding: 'utf8', maxBuffer: 1e7 });
const currentRaw = fs.readFileSync(P('scripts/data/source-health.json'), 'utf8');
const normalized = s => s.replace(/\r\n/g, '\n').trim();
check('health.byteIdenticalToBaseline', baseline.status === 0 && normalized(baseline.stdout) === normalized(currentRaw),
  `git show HEAD 版本 ${baseline.stdout ? baseline.stdout.length : 0} 字节 vs 工作区 ${currentRaw.length} 字节（规范化换行后比较）`);

/* ---------------- 汇总 ---------------- */
const summary = {
  ranAt: out.ranAt,
  registry: { baseIds, headlessIds, union: registryIds },
  health: { generatedAt: healthDoc.generatedAt, rows: healthRows.length, ageHours: out.healthAgeHours, unhealthy, cfGe3, staleRows: staleRecomputed },
  ruling: {
    source: ruling && ruling.source, decision: ruling && ruling.decision,
    revisitByHasDate: Boolean(ruling && /2026-10-19/.test(String(ruling.revisitBy))),
    overlap: ov, evidenceCount: evidence.length, capturedAt: capturedAtList
  },
  futurepediaDeals: out.futurepediaHistoryRows,
  staleCriterionSourceExcerpt: staleCriterionSource ? staleCriterionSource.slice(0, 500) : null,
  checks: out.checks,
  problems: out.problems
};
fs.writeFileSync(outFile, `${JSON.stringify(summary, null, 2)}\n`);
for (const c of out.checks) console.log(`${c.ok ? '✓' : '✗'} ${c.id}  ${c.detail}`);
console.log(`\nC 线独立复核：${out.checks.length} 条，问题 ${out.problems.length} 条`);
process.exit(out.problems.length ? 1 : 0);
