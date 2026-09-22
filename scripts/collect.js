#!/usr/bin/env node
/**
 * 采集编排器：注册表 → 采集 → 归一（makeDeal）→ 去重合并 → 熔断 → 写盘 → 报告。
 *
 * 用法：
 *   node scripts/collect.js                     # 全量采集并写盘
 *   node scripts/collect.js --dry-run           # 只采集并打印报告，不写盘
 *   node scripts/collect.js --headless          # 额外启用无头浏览器来源（抓 JS 渲染的公开页）
 *   node scripts/collect.js --only=cn_docs      # 只跑指定来源
 *   node scripts/collect.js --list              # 列出已注册来源
 *   node scripts/collect.js --force             # 即使零产出也写盘（默认零产出跳过写盘）
 */

const { makeDeal, todayCN } = require('./lib/schema');
const { loadStore, loadDeals, writeDeals, mergeAll, assertAllValid } = require('./lib/store');
const { loadCurated } = require('./lib/curated');
const { attach: attachZh, summarize: summarizeZh } = require('./lib/zh');
const { createReport, printReport } = require('./lib/report');
const { describeError } = require('./lib/http');
const registry = require('./collectors');

const args = process.argv.slice(2);

function flag(name) {
  return args.includes(`--${name}`);
}

function option(name, fallback = null) {
  const prefix = `--${name}=`;
  const found = args.find(a => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

async function collectFrom(collector, report) {
  report.start(collector.id, collector.name, collector.region);
  const items = [];

  try {
    const raw = await collector.collect();
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

    report.finish(collector.id, {
      produced: (raw || []).length,
      valid,
      deals,
      droppedGarbage,
      droppedInvalid
    });
  } catch (error) {
    report.finish(collector.id, { error: describeError(error) });
    console.error(`  ✗ ${collector.name}: ${describeError(error)}`);
  }

  return items;
}

async function main() {
  const headless = flag('headless');

  if (flag('list')) {
    console.log(`已注册采集器${headless ? '（含无头浏览器来源）' : ''}：`);
    for (const c of registry.list({ headless })) {
      const tag = c.headless ? '无头' : (c.region === 'cn' ? '国内' : '国外');
      console.log(`  ${c.id.padEnd(18)} ${tag}  ${c.name}`);
    }
    if (!headless) console.log('\n（加 --headless 可看到无头浏览器来源）');
    return;
  }

  const dryRun = flag('dry-run');
  const only = option('only');
  const ids = only ? only.split(',').map(s => s.trim()).filter(Boolean) : [];
  const { picked, missing } = registry.select(ids, { headless });

  if (missing.length) {
    console.error(`未知采集器 id: ${missing.join(', ')}（用 --list 查看）`);
    process.exit(1);
  }

  const today = todayCN();
  console.log(`开始采集（${today}）：${picked.length} 个来源${dryRun ? '，dry-run 模式' : ''}${headless ? '，含无头浏览器来源' : ''}`);

  const report = createReport();
  const fresh = [];
  for (const collector of picked) {
    console.log(`→ ${collector.name}`);
    const items = await collectFrom(collector, report);
    fresh.push(...items);
  }

  printReport(report, { title: dryRun ? '采集报告（dry-run）' : '采集报告' });

  const curated = loadCurated();
  for (const row of curated.report) {
    if (row.missing) continue;
    console.log(`策展 ${row.file}: ${row.ok}/${row.total} 条可用`);
    row.dropped.forEach(d => console.warn(`  ⚠️  策展丢弃 [${d.reason}] ${d.title}`));
  }

  const store = loadStore();
  const existing = Array.isArray(store.deals) ? store.deals : [];
  console.log(`\n既有 deals.json: ${existing.length} 条${store.legacy ? '（v1 格式，将在写入时升级为 v2）' : ''}`);

  const { deals, stats } = mergeAll({ fresh, existing, curated: curated.deals, today });

  if (stats.degraded) {
    console.warn(
      `⚠️  熔断告警：本次仅采到 ${stats.fresh} 条，低于既有 ${stats.existing} 条的 ` +
      `${Math.round(stats.circuitBreakerRatio * 100)}%。已保留既有数据（合并不删除）。`
    );
  }

  console.log(`合并结果: 新采 ${stats.fresh} + 既有 ${stats.existing} + 策展 ${stats.curated} ` +
    `→ 去重合并 ${stats.mergedDuplicates} → 修剪前 ${stats.beforePrune} → 最终 ${stats.afterPrune}`);
  if (stats.removedGarbage) {
    console.log(`退役垃圾/无效旧条目 ${stats.removedGarbage} 条：${stats.retiredTitles.join('、')}`);
  }
  if (stats.reclassified) {
    console.log(`按当前规则重分类 ${stats.reclassified} 条（deal → tool）：${stats.reclassifiedTitles.join('、')}`);
  }
  const dealCount = deals.filter(d => d.type === 'deal').length;
  const cnCount = deals.filter(d => d.region === 'cn').length;
  console.log(`其中：优惠 ${dealCount} 条，国内 ${cnCount} 条，含截止时间 ${deals.filter(d => d.expiresAt).length} 条`);

  // 贴上人工中文译文（scripts/data/translations_zh.json）。
  // 放在这里而不是渲染期：写盘后浏览器 fetch('deals.json') 拿到的就是同一份，
  // 构建期预渲染与浏览器渲染因此共用一条代码路径，不会分叉。
  const { deals: localized, report: zhReport } = attachZh(deals);
  console.log(`中文译文: ${summarizeZh(zhReport)}`);
  if (zhReport.stale.length) {
    zhReport.stale.forEach(row => console.warn(`  🔁 原文已变，译文停用待复核: ${row.title} — ${row.message}`));
  }
  if (zhReport.orphaned.length) {
    zhReport.orphaned.forEach(row => console.warn(`  ⚠️  译文对不上任何条目 id: ${row.id} ${row.title}`));
  }
  zhReport.skipped.forEach(row => console.warn(`  ⚠️  译文不合规被丢弃: ${row.title} — ${row.message}`));
  if (zhReport.missing.length) {
    console.log(`  ℹ️  仍有 ${zhReport.missing.length} 条英文文案待翻译（node scripts/tools/zh-todo.js 查看）`);
  }

  if (dryRun) {
    console.log('\n(dry-run，未写盘)');
    console.log('\n新增/变更预览（前 15 条优惠）：');
    localized.filter(d => d.type === 'deal').slice(0, 15).forEach(d => {
      console.log(`  · [${d.region}] ${d.title} — ${(d.discountInfo || '').slice(0, 70)}`);
      console.log(`      ${d.url}`);
    });
    return;
  }

  if (fresh.length === 0 && !flag('force')) {
    console.log('\n本次零产出，跳过写盘（避免误报"数据已更新"）。如需强制写入请加 --force');
    return;
  }

  assertAllValid(localized);
  const payload = writeDeals(localized);
  console.log(`\n✅ 已写入 deals.json：${payload.count} 条，updatedAt=${payload.updatedAt}`);
}

main().catch(error => {
  console.error('\n❌ 采集失败:', error.message);
  if (error.validationErrors) {
    error.validationErrors.slice(0, 10).forEach(e => console.error(`   - ${e}`));
  }
  process.exit(1);
});
