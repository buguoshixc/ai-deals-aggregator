#!/usr/bin/env node
/**
 * t7 审查工具：把 `coverage-report.js --json` 的真字节捕获拆成
 *   ① 文本段（stdout 的文本报告）
 *   ② JSON 段（"JSON:" 之后的那个对象）
 * 并打印顶层键序 / coverageTargets 键序 / 四节读数。
 *
 * 用法：node extract-json.cjs <captured.json-file> [--keys]
 * 只读；不 require 任何被测 lib。
 */
'use strict';
const fs = require('fs');

const file = process.argv[2];
if (!file) {
  console.error('usage: node extract-json.cjs <captured --json output file>');
  process.exit(2);
}
const raw = fs.readFileSync(file, 'utf8');
const marker = '\nJSON:\n';
const at = raw.indexOf(marker);
if (at < 0) {
  console.error('NO "\\nJSON:\\n" marker found — --json 输出里没有 JSON 段');
  process.exit(3);
}
const text = raw.slice(0, at);
const tail = raw.slice(at + marker.length);
// 尾部有 "\n\n✅ 覆盖报告自检通过（0 处问题）。\n"
const end = tail.lastIndexOf('\n\n✅ ');
const jsonText = end < 0 ? tail : tail.slice(0, end);
const doc = JSON.parse(jsonText);

const out = {
  file,
  rawBytes: Buffer.byteLength(raw, 'utf8'),
  textBytes: Buffer.byteLength(text, 'utf8'),
  jsonBytes: Buffer.byteLength(jsonText, 'utf8'),
  topKeys: Object.keys(doc),
  coverageTargetsKeys: Object.keys(doc.coverageTargets),
  coverageTargetsKeyCount: Object.keys(doc.coverageTargets).length,
  generatedAt: doc.generatedAt,
  releaseEvidence: null,
  releaseEvidenceQueue: null,
  gapClosureQueue: null,
  sourceReliability: null
};

const ct = doc.coverageTargets;
if (process.argv.includes('--keys')) {
  console.log(JSON.stringify({
    topKeys: out.topKeys,
    coverageTargetsKeys: out.coverageTargetsKeys,
    coverageTargetsKeyCount: out.coverageTargetsKeyCount,
    generatedAt: out.generatedAt
  }, null, 2));
  process.exit(0);
}
const re = ct.releaseEvidence;
out.releaseEvidence = {
  status: re.status,
  registryModels: re.registryModels,
  releasedAtLanded: re.releasedAtLanded,
  catalogStatusLanded: re.catalogStatusLanded,
  known: re.known,
  unknown: re.unknown,
  unparsable: re.unparsable,
  withReleaseEvidence: re.withReleaseEvidence,
  knownPercent: re.knownPercent,
  groupOrder: re.groupOrder,
  byDeveloper: Array.isArray(re.byDeveloper) ? re.byDeveloper.map(b => `${b.key}:${b.total}/${b.known}`) : re.byDeveloper,
  byModelRole: Array.isArray(re.byModelRole) ? re.byModelRole.map(b => `${b.key}:${b.total}/${b.known}`) : re.byModelRole,
  byCatalogStatus: Array.isArray(re.byCatalogStatus) ? re.byCatalogStatus.map(b => `${b.key}:${b.total}/${b.known}`) : re.byCatalogStatus
};
const q = ct.releaseEvidenceQueue;
out.releaseEvidenceQueue = {
  limit: q.limit, total: q.total, unknownCount: q.unknownCount, knownCount: q.knownCount,
  groupJudgeAvailable: q.groupJudgeAvailable,
  rulesCount: q.rules.length,
  queueLen: q.queue.length,
  queueKeys: q.queue.length ? Object.keys(q.queue[0]) : [],
  queue: q.queue.map(r => `#${r.rank} ${r.slug} unknown=${r.releasedAtUnknown} group=${r.groupLabel}(${r.groupSize}) tier=${r.tier}/${r.tierRank} ref=${r.referenced} releasedAt=${JSON.stringify(r.releasedAt)}`)
};
const g = ct.gapClosureQueue;
out.gapClosureQueue = {
  total: g.total, counts: g.counts, rulesCount: g.rules.length,
  highValueDimensions: g.highValueDimensions, priorityOrder: g.priorityOrder,
  queueLen: g.queue.length,
  queue: g.queue.map(r => `${r.priority} ${r.provider}/${r.dimension} state=${r.state} N=${r.targetN} M=${r.coveredM} K=${r.missingK} present=${r.present} hv=${r.highValue} explicit=${r.explicitSource} hard=${r.sourceHard} highCost=${r.highCost}`)
};
const s = ct.sourceReliability;
out.sourceReliability = {
  file: s.file, present: s.present, notLanded: s.notLanded, broken: s.broken,
  schemaVersion: s.schemaVersion, reviewedAt: s.reviewedAt,
  healthFile: s.healthFile, healthGeneratedAt: s.healthGeneratedAt, healthRowCount: s.healthRowCount,
  collectorRegistryFile: s.collectorRegistryFile, collectorRegistryCount: s.collectorRegistryCount,
  decisionOrder: s.decisionOrder, decisionCounts: s.decisionCounts, rulingsCount: s.rulings.length,
  validationProblemCount: s.validationProblemCount, validationProblems: s.validationProblems,
  reconciliation: {
    judge: s.reconciliation.judge, ruleCount: s.reconciliation.ruleCount, problemCount: s.reconciliation.problemCount,
    problems: s.reconciliation.problems,
    unruledRegistrySources: s.reconciliation.unruledRegistrySources,
    failuresRequiringRuling: s.reconciliation.failuresRequiringRuling,
    missingRulingsForFailures: s.reconciliation.missingRulingsForFailures,
    retireStillRegistered: s.reconciliation.retireStillRegistered,
    retireStillInHealth: s.reconciliation.retireStillInHealth,
    repairOrMigrateUnregistered: s.reconciliation.repairOrMigrateUnregistered,
    unresolvedSources: s.reconciliation.unresolvedSources
  },
  registryRowCount: s.registryRowCount,
  registryOnlySources: s.registryOnlySources,
  notLandedNote: s.notLandedNote
};

if (process.argv.includes('--keys-old')) {
  console.log(JSON.stringify({ topKeys: out.topKeys, coverageTargetsKeys: out.coverageTargetsKeys }, null, 2));
} else if (process.argv.includes('--text')) {
  process.stdout.write(text);
  process.exit(0);
} else if (process.argv.includes('--queue')) {
  console.log(JSON.stringify(out.releaseEvidenceQueue, null, 2));
  console.log(JSON.stringify(out.gapClosureQueue, null, 2));
} else {
  console.log(JSON.stringify(out, null, 2));
}
