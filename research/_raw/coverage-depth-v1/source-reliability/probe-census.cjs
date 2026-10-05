#!/usr/bin/env node
/**
 * 只读取证（t4 / Workstream C-1）：全部注册采集器的**实况普查**。
 *
 * 纪律：
 *   · 走生产代码路径（registry.select → collector.collect → makeDeal → report 行 → health.attemptsFromReport/build），
 *     不复制一份"看起来像"的实现；
 *   · **绝不写盘**：health.build() 只在内存里算「若本轮写盘，健康层会得出什么」，
 *     不调用 health.write / writeDeals / domDigest.writeSnapshots；
 *   · 输出只落在本目录（research/_raw/coverage-depth-v1/source-reliability/）。
 *
 * 用法：
 *   node probe-census.cjs --headless --tag=round1
 *   node probe-census.cjs --only=futurepedia --tag=fp-round2
 *   node probe-census.cjs --static --tag=static
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const registry = require(path.join(ROOT, 'scripts', 'collectors'));
const domDigest = require(path.join(ROOT, 'scripts', 'lib', 'dom-digest'));
const health = require(path.join(ROOT, 'scripts', 'lib', 'health'));
const reportLib = require(path.join(ROOT, 'scripts', 'lib', 'report'));
const { makeDeal } = require(path.join(ROOT, 'scripts', 'lib', 'schema'));
const { describeError } = require(path.join(ROOT, 'scripts', 'lib', 'http'));
const crypto = require('crypto');

const args = process.argv.slice(2);
const flag = name => args.includes(`--${name}`);
const opt = (name, fallback = null) => {
  const prefix = `--${name}=`;
  const found = args.find(a => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
};
const sha256 = text => crypto.createHash('sha256').update(String(text), 'utf8').digest('hex');

async function main() {
  const headless = flag('headless');
  const tag = opt('tag', 'census');
  const only = opt('only');
  const outFile = opt('out', path.join(__dirname, `census-${tag}.json`));
  const ids = only ? only.split(',').map(s => s.trim()).filter(Boolean) : [];
  const { picked, missing } = registry.select(ids, { headless });
  if (missing.length) {
    console.error(`未知采集器 id: ${missing.join(', ')}`);
    process.exit(1);
  }

  const startedAt = new Date();
  const startedMs = Date.now();
  const report = reportLib.createReport();
  const itemsBySource = {};
  const digestsBySource = {};
  const errorCodes = new Map();

  console.log(`[probe-census] tag=${tag} headless=${headless} picked=${picked.map(c => c.id).join(',')}`);
  console.log(`[probe-census] startedAt(UTC)=${startedAt.toISOString()} startedAt(local)=${startedAt.toString()}`);

  for (const collector of picked) {
    const sourceStart = Date.now();
    report.start(collector.id, collector.name, collector.region);
    let digests = [];
    const items = [];
    let failure = null;
    try {
      // 与 collect.js 的 collectFrom() 同一串动作
      const probes = domDigest.probesFor(collector.id);
      domDigest.beginCapture(probes);
      const raw = await collector.collect();
      digests = domDigest.endCapture();
      let valid = 0;
      let deals = 0;
      let droppedGarbage = 0;
      let droppedInvalid = 0;
      for (const entry of raw || []) {
        const deal = makeDeal(entry, {
          source: collector.name,
          region: collector.region,
          sourceUrl: entry.sourceUrl
        });
        if (!deal) {
          droppedGarbage++;
          continue;
        }
        if (deal.sourceUrl === null && entry.sourceUrl) droppedInvalid++;
        if (deal.type === 'deal') deals++;
        valid++;
        items.push(deal);
      }
      report.finish(collector.id, { produced: (raw || []).length, valid, deals, droppedGarbage, droppedInvalid });
      itemsBySource[collector.id] = { raw: raw || [], deals: items, error: null };
      console.log(`  ✓ ${collector.id} produced=${(raw || []).length} valid=${valid} deals=${deals} ms=${Date.now() - sourceStart}`);
    } catch (error) {
      failure = describeError(error);
      if (error && error.code) errorCodes.set(collector.id, String(error.code));
      if (domDigest.isCapturing()) digests = domDigest.endCapture();
      report.finish(collector.id, { error: failure });
      itemsBySource[collector.id] = { raw: [], deals: [], error: failure };
      console.log(`  ✗ ${collector.id} error=${failure} ms=${Date.now() - sourceStart}`);
    }
    digestsBySource[collector.id] = digests.map(d => ({
      url: d.url,
      httpStatus: d.httpStatus === undefined ? null : d.httpStatus,
      bytes: d.bytes,
      htmlSha256: d.htmlSha256,
      titleSha256: d.titleSha256,
      textLength: d.textLength,
      markers: d.markers,
      shape: d.shape,
      counts: d.counts,
      selectorHits: d.selectorHits,
      keywordHits: d.keywordHits,
      regexHits: d.regexHits,
      topClasses: (d.topClasses || []).slice(0, 8),
      error: d.error || null
    }));
  }

  const headlessIds = picked.filter(c => c.headless).map(c => c.id);
  const browserStatus = (() => {
    if (!headlessIds.length) return { attempted: false, ok: null, channel: null, error: null, checkedAt: null };
    try {
      return require(path.join(ROOT, 'scripts', 'lib', 'browser')).getLaunchStatus();
    } catch (error) {
      return { attempted: false, ok: null, channel: null, error: error.message, checkedAt: null };
    }
  })();

  // 生产接线：attemptsFromReport → health.build（只在内存里推进，不写盘）
  const attempts = health.attemptsFromReport({ rows: report.list(), headlessIds, browserStatus, errorCodes });
  const healthStore = health.load();
  const { doc: wouldBeDoc, summary } = health.build({ previousDoc: healthStore.doc, attempts });

  const onDiskById = {};
  for (const row of healthStore.doc.sources || []) onDiskById[row.source] = row;
  const wouldBeById = {};
  for (const row of wouldBeDoc.sources || []) wouldBeById[row.source] = row;

  const sources = attempts.map(attempt => {
    const before = onDiskById[attempt.source] || null;
    const after = wouldBeById[attempt.source] || null;
    return {
      source: attempt.source,
      name: attempt.name,
      kind: attempt.kind,
      region: attempt.region,
      ok: attempt.ok,
      error: attempt.error,
      valid: attempt.valid,
      produced: attempt.produced,
      deals: attempt.deals,
      ms: attempt.ms,
      headlessReady: attempt.headlessReady,
      onDisk: before && {
        status: before.status,
        reason: before.reason,
        consecutiveFailures: before.consecutiveFailures,
        consecutiveZero: before.consecutiveZero,
        lastItemCount: before.lastItemCount,
        lastSuccessAt: before.lastSuccessAt,
        lastError: before.lastError,
        generatedAt: healthStore.doc.generatedAt
      },
      wouldBe: after && {
        status: after.status,
        reason: after.reason,
        consecutiveFailures: after.consecutiveFailures,
        consecutiveZero: after.consecutiveZero,
        lastItemCount: after.lastItemCount,
        previousItemCount: after.previousItemCount,
        delta: after.delta,
        lastSuccessAt: after.lastSuccessAt,
        lastError: after.lastError,
        headlessReady: after.headlessReady
      },
      digests: digestsBySource[attempt.source] || []
    };
  });

  const artifact = {
    probe: 'probe-census.cjs',
    tag,
    headless,
    startedAtUtc: startedAt.toISOString(),
    startedAtLocal: startedAt.toString(),
    finishedAtUtc: new Date().toISOString(),
    wallMs: Date.now() - startedMs,
    onDiskHealth: {
      generatedAt: healthStore.doc.generatedAt,
      file: healthStore.file,
      sha256: sha256(fs.readFileSync(healthStore.file, 'utf8')),
      census: {
        healthy: (healthStore.doc.sources || []).filter(r => r.status === 'healthy').length,
        degraded: (healthStore.doc.sources || []).filter(r => r.status === 'degraded').length,
        failed: (healthStore.doc.sources || []).filter(r => r.status === 'failed').length
      }
    },
    wouldBeHealth: {
      generatedAt: wouldBeDoc.generatedAt,
      census: { healthy: summary.healthy, degraded: summary.degraded, failed: summary.failed },
      note: '内存推演值：本探针不写盘，故 source-health.json 保持上表 onDiskHealth 的值'
    },
    browserStatus,
    sources,
    items: itemsBySource
  };

  fs.writeFileSync(outFile, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  console.log(`[probe-census] 盘上读数 generatedAt=${healthStore.doc.generatedAt} 普查=${JSON.stringify(artifact.onDiskHealth.census)}`);
  console.log(`[probe-census] 本轮推演 generatedAt=${wouldBeDoc.generatedAt} 普查=${JSON.stringify(artifact.wouldBeHealth.census)}`);
  console.log(`[probe-census] 写出（本目录，非生产文件）: ${outFile}`);
}

main().catch(error => {
  console.error(`[probe-census] 失败: ${error.stack || error.message}`);
  process.exit(1);
});
