#!/usr/bin/env node
/**
 * t5 取证：**裁决的采集器侧落地**是否自洽（只读，不写任何生产文件）。
 *
 * T04 结论：唯一长期失败来源 `futurepedia`（consecutiveFailures=10）的裁决 = `keep-degraded`。
 * 「keep-degraded」在代码侧的落地要求是「不改采集代码」，因此本探针要做的是**证明三处对账同时为真、
 * 且历史零改动**，而不是产出 diff：
 *   ① 注册的采集器 ↔ source-probes.json 双向无差集（用生产函数 domDigest.probeCoverage）；
 *   ② collectors/index.js 的 BASE(+headless) ↔ source-health.json 注册表一致（含 kind 一致、无 stale 行）；
 *   ③ fixture 目录 ↔ 注册表无孤儿（双向，且每个目录的三件套齐全）。
 * 另附：
 *   ④ provenance.SOURCE_TYPES 对历史 Deals 的 sourceType 解析（keep-degraded 下必须保持 directory）；
 *   ⑤ 历史安全：deals.json 行数、生命周期字段、deal-history 的 ended 事件（必须 0）。
 *
 * 输出只落本目录（research 下，属「临时实验」允许区）。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const registry = require(path.join(ROOT, 'scripts', 'collectors'));
const domDigest = require(path.join(ROOT, 'scripts', 'lib', 'dom-digest'));
const provenance = require(path.join(ROOT, 'scripts', 'lib', 'provenance'));
const health = require(path.join(ROOT, 'scripts', 'lib', 'health'));

const FIXTURES_DIR = path.join(ROOT, 'scripts', 'data', 'fixtures');

function main() {
  const all = registry.all({ headless: true });
  const base = registry.BASE;
  const registryIds = all.map(c => c.id).sort();
  const baseIds = base.map(c => c.id).sort();
  const headlessIds = all.filter(c => c.headless === true).map(c => c.id).sort();

  // ① 采集器 ↔ 探针表
  const probes = domDigest.loadProbes();
  const coverage = domDigest.probeCoverage(registryIds, probes);

  // ② BASE(+headless) ↔ source-health 注册表
  const healthStore = health.load();
  const healthRows = healthStore.doc.sources || [];
  const healthIds = healthRows.map(r => r.source).sort();
  const kindOf = id => (all.find(c => c.id === id) || {}).kind || (headlessIds.includes(id) ? 'headless' : 'static');
  const kindMismatch = healthRows
    .filter(row => all.some(c => c.id === row.source))
    .filter(row => {
      const expected = headlessIds.includes(row.source) ? 'headless' : 'static';
      return row.kind !== expected;
    })
    .map(row => ({ source: row.source, healthKind: row.kind, registryKind: headlessIds.includes(row.source) ? 'headless' : 'static' }));

  // ③ fixture 目录 ↔ 注册表
  const fixtureDirs = fs.readdirSync(FIXTURES_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort();
  const declaredFixtures = all.filter(c => c.fixture).map(c => ({ id: c.id, fixture: c.fixture }));
  const declaredNames = declaredFixtures.map(f => f.fixture).sort();
  const fixtureFiles = {};
  for (const dir of fixtureDirs) {
    fixtureFiles[dir] = fs.readdirSync(path.join(FIXTURES_DIR, dir)).sort();
  }
  const fixtureDirOrphans = fixtureDirs.filter(dir => !declaredNames.includes(dir));
  const fixtureDeclaredMissing = declaredNames.filter(name => !fixtureDirs.includes(name));
  const fixtureIncomplete = fixtureDirs.filter(dir => {
    const files = fixtureFiles[dir];
    return !(files.includes('expected.json') && files.includes('page.min.html') && files.includes('PROVENANCE.md'));
  });

  // ④ provenance.SOURCE_TYPES → 历史 Deals 的 sourceType
  const dealsDoc = JSON.parse(fs.readFileSync(path.join(ROOT, 'deals.json'), 'utf8'));
  const deals = Array.isArray(dealsDoc) ? dealsDoc : (dealsDoc.deals || []);
  const sourceCensus = {};
  for (const deal of deals) sourceCensus[deal.source] = (sourceCensus[deal.source] || 0) + 1;
  const sourceTypes = Object.entries(sourceCensus)
    .map(([source, count]) => ({ source, count, sourceType: provenance.sourceTypeOf({ source }) }))
    .sort((a, b) => b.count - a.count);
  const unknownSourceTypes = sourceTypes.filter(row => row.sourceType === 'unknown');
  const futurepediaRecords = deals.filter(deal => deal.source === 'Futurepedia');
  const futurepediaIds = futurepediaRecords.map(deal => deal.id);

  // ⑤ 历史安全：行数 / 生命周期字段 / ended 事件
  const lifecycleKeys = ['endedAt', 'ended', 'status', 'lifecycle', 'removedAt'];
  const lifecycleTouched = deals.filter(deal => lifecycleKeys.some(key => deal[key] !== undefined)).map(deal => deal.id);
  const historyDoc = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'data', 'deal-history.json'), 'utf8'));
  const events = (historyDoc && (historyDoc.events || (historyDoc.store && historyDoc.store.events))) || [];
  const endedEvents = events.filter(e => e && e.type === 'ended');
  const endedForFuturepedia = endedEvents.filter(e => futurepediaIds.includes(e.id));

  // ⑥ 反向对照（证明上面五条对账**有牙**：不是「怎么写都绿」）
  const negativeControls = {
    probeCoverage_withoutFuturepedia: domDigest.probeCoverage(registryIds.filter(id => id !== 'futurepedia'), probes),
    probeCoverage_withGhostCollector: domDigest.probeCoverage([...registryIds, 'ghost_source'], probes),
    fixtureOrphanSimulation: (() => {
      const simulated = [...fixtureDirs, 'retired.list'];
      return { simulatedDirs: simulated, orphans: simulated.filter(dir => !declaredNames.includes(dir)) };
    })(),
    fixtureDeclaredButMissingSimulation: ['futurepedia.list', 'ghost.list'].filter(name => !fixtureDirs.includes(name)),
    sourceTypeFallbackSimulation: {
      knownKey: provenance.sourceTypeOf({ source: 'Futurepedia' }),
      unknownKey: provenance.sourceTypeOf({ source: 'Futurepedia (retired)' }),
      recordsAffectedIfDropped: futurepediaRecords.length
    },
    kindMismatchSimulation: healthRows
      .filter(row => row.source === 'cn_volc_ark')
      .map(row => ({ source: row.source, healthKind: row.kind, wrongExpectation: 'static', wouldFlag: row.kind !== 'static' }))
  };

  // ⑦ 交给 T06 的裁决字段（本任务**不写** scripts/data/source-rulings.json —— 那是 T06 的写域）
  const t06Handoff = {
    file: 'scripts/data/source-rulings.json',
    entries: [{
      source: 'futurepedia',
      decision: 'keep-degraded',
      whyKept: '跨环境观测不一致（本机 5 变体 + 9 轮全成功；CI 连续 10 次 HTTP 403；请求头不是变量，唯一无法本机复现的变量是出口 IP/机房）；无可复现缺陷可修；失败不污染数据（失败源不进 absenceEligibleSources）；它是 2 条独占记录（Midjourney / HubSpot AEO Sensor）的唯一发现通道；成本 55 行代码 / 0 新增依赖',
      revisitBy: '2026-10-19',
      evidence: 'research/coverage-depth-v1-source-reliability.md §3/§5/§7（t4，读数时间戳 2026-10-05T03:30Z–03:45Z）',
      escalationTriggers: [
        'CI 侧连续失败 ≥ 20 次且队长判定不再等待',
        '另一来源开始覆盖 Midjourney / HubSpot AEO Sensor ⇒ 独占价值消失，可转 retire',
        'CI 侧出现与 403 不同形态的失败（结构变化 / 零产出）⇒ 转 repair',
        '决意保留其内容贡献 ⇒ 先补 CI 出口的无头稳定性读数，再走 headless-migrate'
      ]
    }],
    note: '本任务只提供字段与判据；裁决落盘与 schema 由 T06 负责。'
  };

  const artifact = {
    probe: 'probe-ruling-landing.cjs',
    ranAtUtc: new Date().toISOString(),
    ranAtLocal: new Date().toString(),
    head: null,
    longFailingSources: healthRows
      .filter(row => Number(row.consecutiveFailures) >= 3)
      .map(row => ({ source: row.source, consecutiveFailures: row.consecutiveFailures, status: row.status, lastError: row.lastError, healthGeneratedAt: healthStore.doc.generatedAt })),
    rulingUnderTest: {
      source: 'futurepedia',
      decision: 'keep-degraded',
      codeSideLanding: '不改采集代码（契约：理由与复查条件写进 T06 的裁决数据文件）',
      evidence: 'research/coverage-depth-v1-source-reliability.md §7（t4，2026-10-05）'
    },
    check1_registryVsProbes: {
      registryIds,
      probeIds: Object.keys(probes.probes).filter(key => !key.startsWith('_')).sort(),
      missing: coverage.missing,
      unknown: coverage.unknown,
      broken: coverage.broken,
      pass: coverage.missing.length === 0 && coverage.unknown.length === 0 && !coverage.broken
    },
    check2_baseVsHealth: {
      baseIds,
      headlessIds,
      unionIds: registryIds,
      healthRows: healthIds,
      healthGeneratedAt: healthStore.doc.generatedAt,
      healthFile: healthStore.file,
      rowsNotInRegistry: healthIds.filter(id => !registryIds.includes(id)),
      registryNotInHealth: registryIds.filter(id => !healthIds.includes(id)),
      staleRows: healthRows.filter(row => row.stale || row.lastRunMissing).map(row => row.source),
      kindMismatch,
      pass: healthIds.length === registryIds.length &&
        healthIds.every(id => registryIds.includes(id)) &&
        kindMismatch.length === 0 &&
        !healthRows.some(row => row.stale || row.lastRunMissing)
    },
    check3_fixtures: {
      fixtureDirs,
      declaredFixtures,
      fixtureFiles,
      dirOrphans: fixtureDirOrphans,
      declaredMissing: fixtureDeclaredMissing,
      incompleteDirs: fixtureIncomplete,
      pass: fixtureDirOrphans.length === 0 && fixtureDeclaredMissing.length === 0 && fixtureIncomplete.length === 0
    },
    check4_sourceTypes: {
      sourceTypes,
      unknownSourceTypes,
      futurepediaRecords: futurepediaRecords.map(deal => ({ id: deal.id, title: deal.title, sourceType: provenance.sourceTypeOf(deal), lastSeen: deal.lastSeen })),
      sourceTypesEntryForFuturepedia: provenance.SOURCE_TYPES['Futurepedia'] || null,
      pass: unknownSourceTypes.length === 0 && provenance.SOURCE_TYPES['Futurepedia'] === 'directory'
    },
    check5_historySafety: {
      dealsCount: deals.length,
      dealsUpdatedAt: dealsDoc.updatedAt || null,
      lifecycleTouchedIds: lifecycleTouched,
      historyEvents: events.length,
      endedEvents: endedEvents.length,
      endedForFuturepedia: endedForFuturepedia.length,
      futurepediaIds,
      pass: lifecycleTouched.length === 0 && endedForFuturepedia.length === 0
    },
    negativeControls,
    t06Handoff
  };

  artifact.allChecksPass = ['check1_registryVsProbes', 'check2_baseVsHealth', 'check3_fixtures', 'check4_sourceTypes', 'check5_historySafety']
    .every(key => artifact[key].pass === true);

  const outFile = path.join(__dirname, 'ruling-landing-checks.json');
  fs.writeFileSync(outFile, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');

  const mark = value => (value ? '✅' : '❌');
  console.log(`[landing] ① 采集器↔探针表: missing=${JSON.stringify(coverage.missing)} unknown=${JSON.stringify(coverage.unknown)} broken=${coverage.broken} ${mark(artifact.check1_registryVsProbes.pass)}`);
  console.log(`[landing] ② BASE(${baseIds.length})+无头(${headlessIds.length})↔health(${healthIds.length}, generatedAt=${healthStore.doc.generatedAt}): rowsNotInRegistry=${JSON.stringify(artifact.check2_baseVsHealth.rowsNotInRegistry)} registryNotInHealth=${JSON.stringify(artifact.check2_baseVsHealth.registryNotInHealth)} stale=${JSON.stringify(artifact.check2_baseVsHealth.staleRows)} kindMismatch=${artifact.check2_baseVsHealth.kindMismatch.length} ${mark(artifact.check2_baseVsHealth.pass)}`);
  console.log(`[landing] ③ fixture: dirs=${JSON.stringify(fixtureDirs)} dirOrphans=${JSON.stringify(fixtureDirOrphans)} declaredMissing=${JSON.stringify(fixtureDeclaredMissing)} incomplete=${JSON.stringify(fixtureIncomplete)} ${mark(artifact.check3_fixtures.pass)}`);
  console.log(`[landing] ④ SOURCE_TYPES: unknown 来源=${JSON.stringify(unknownSourceTypes)}；Futurepedia 记录 ${futurepediaRecords.length} 条 → sourceType=${JSON.stringify(futurepediaRecords.map(d => provenance.sourceTypeOf(d)))} ${mark(artifact.check4_sourceTypes.pass)}`);
  console.log(`[landing] ⑤ 历史安全: deals=${deals.length} 生命周期字段被写=${lifecycleTouched.length} ended 事件=${endedEvents.length}（其中 Futurepedia=${endedForFuturepedia.length}） ${mark(artifact.check5_historySafety.pass)}`);
  console.log(`[landing] ⑥ 反向对照（对账的牙）: 去掉 futurepedia 后 unknown=${JSON.stringify(negativeControls.probeCoverage_withoutFuturepedia.unknown)}；加 ghost 后 missing=${JSON.stringify(negativeControls.probeCoverage_withGhostCollector.missing)}；fixture 孤儿模拟=${JSON.stringify(negativeControls.fixtureOrphanSimulation.orphans)}；不存在的 SOURCE_TYPES key → ${negativeControls.sourceTypeFallbackSimulation.unknownKey}（影响 ${negativeControls.sourceTypeFallbackSimulation.recordsAffectedIfDropped} 条历史记录）`);
  console.log(`[landing] ⑦ 长期失败来源（本刻 live 读数 generatedAt=${healthStore.doc.generatedAt}，cf>=3）: ${JSON.stringify(artifact.longFailingSources)}`);
  console.log(`[landing] 全部检查通过 = ${artifact.allChecksPass}`);
  console.log(`[landing] 写出: ${outFile}`);
  if (!artifact.allChecksPass) process.exitCode = 1;
}

main();
