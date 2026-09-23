#!/usr/bin/env node
/**
 * 采集编排器：注册表 → 采集 → 归一（makeDeal）→ 去重合并 → 门槛 → 写盘 → 报告。
 *
 * 写盘/退出只有两条**拦**的理由（其余一切都只是告警）：
 *   ① 真的没有可发布内容：本次采集零产出且未加 --force → 跳过写盘、非 0 退出。
 *      （零产出还要照写 updatedAt/策展 lastSeen，等于把一次失败伪装成"刚更新过"。）
 *   ② 译文不合规：zhReport.skipped 非空 → 与构建期同一把尺子，跳过写盘、非 0 退出。
 *
 * 明确区分两个**不拦**的概念，别把它们混成一个"降级"：
 *   · 单源失败（某个采集器抛错）：常态而非异常——collect.yml 的浏览器安装步骤本身就是
 *     continue-on-error，装不上时无头来源会各自报错并产出 0 条，而那条链路是设计上要
 *     容忍的。所以它只在报告里逐条点名 + 写进 CI Summary，不阻断写盘、不影响退出码。
 *   · 采集量骤降（stats.degraded：新采 < 既有 × 30%）：同样只告警。若它顺手拦写盘，
 *     一次 playwright 装不上就能让 deals.json 不落库 → deploy.yml 判 skipped → 线上停更。
 *     真正无法发布的情形由①兜住：零产出时本来就没有新东西可写。
 *
 * 用法：
 *   node scripts/collect.js                     # 全量采集并写盘
 *   node scripts/collect.js --dry-run           # 只采集并打印报告，不写盘
 *   node scripts/collect.js --headless          # 额外启用无头浏览器来源（抓 JS 渲染的公开页）
 *   node scripts/collect.js --only=cn_docs      # 只跑指定来源
 *   node scripts/collect.js --list              # 列出已注册来源
 *   node scripts/collect.js --force             # 即使零产出也照写（坏译文一律不写盘）
 */

const { makeDeal, todayCN } = require('./lib/schema');
const { loadStore, writeDeals, mergeAll, assertAllValid } = require('./lib/store');
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
  let failed = false;

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
    failed = true;
    report.finish(collector.id, { error: describeError(error) });
    console.error(`  ✗ ${collector.name}: ${describeError(error)}`);
  }

  return { items, failed };
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
  let collectorFailures = 0;
  for (const collector of picked) {
    console.log(`→ ${collector.name}`);
    const { items, failed } = await collectFrom(collector, report);
    if (failed) collectorFailures++;
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

  const force = flag('force');
  // 「没有可发布内容」= 本次采集一条都没产出来（含被丢弃的垃圾条目）。
  // 这与「单源失败」「采集量骤降」是三个不同的概念：后两者只告警，见文件头注释。
  const nothingCollected = fresh.length === 0;
  if (stats.degraded) {
    console.warn(
      `⚠️  降级告警：本次仅采到 ${stats.fresh} 条，低于既有 ${stats.existing} 条的 ` +
      `${Math.round(stats.circuitBreakerRatio * 100)}%（仅告警，不拦写盘；零产出时才拦）。`
    );
  }
  if (collectorFailures) {
    console.warn(
      `⚠️  来源失败 ${collectorFailures}/${picked.length} 个（advisory：逐条见报告表与「来源失败」清单，` +
      `不拦写盘——单源失败是常态，静默跳过才是问题）`
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
  if (stats.extractedDeadlines) {
    console.log(`  ↳ 其中 ${stats.extractedDeadlines} 条是从文案里抽到的绝对截止日（只认写死的日期，规则见 lib/expiry.js）`);
  }

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
  zhReport.skipped.forEach(row =>
    console.warn(`  ⚠️  译文不合规: [${row.id}] ${row.title} — ${row.message}`));
  if (zhReport.unmanaged.length) {
    console.warn(
      `  ⚠️  ${zhReport.unmanaged.length} 条译文不在覆盖层里（deals.json 自带、覆盖层管不到）：` +
      `${zhReport.unmanaged.slice(0, 5).map(row => row.title).join('、')}`
    );
  }
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

  // 译文不合规：与构建期同一把尺子。
  // build-local.js 遇到同一种数据直接 throw（阻止发布）；采集期在这里只 warn 的话，
  // CI 会把不合规的 zh 提交进 deals.json，下一次采集的 "Validate current data (before)"
  // 立刻变红——采集链路从此卡死，而真正的坏数据还躺在仓库里。
  if (zhReport.skipped.length) {
    console.error(
      `\n❌ 译文不合规 ${zhReport.skipped.length} 处，跳过写盘（构建期同样会硬失败，加 --force 也不放行）。` +
      `先修 scripts/data/translations_zh.json`
    );
    process.exit(1);
  }

  // 唯一会拦写盘的采集侧情形：真的没有可发布内容。
  // 零产出还要照写，会把 updatedAt 改成今天、把 32 条策展的 lastSeen 全刷成今天，
  // 站点看上去"刚更新过"，实际上这次什么都没采到 —— 那是在替一次失败背书。
  // 反过来，单源失败 / 采集量骤降**不**在这里拦：见文件头那两条"不拦"的概念。
  if (nothingCollected && !force) {
    console.error(
      `\n❌ 本次采集零产出（${picked.length} 个来源都没有可发布的条目），跳过写盘。` +
      `既有 deals.json 未被改动；确需照写请加 --force`
    );
    process.exit(1);
  }

  assertAllValid(localized);
  const payload = writeDeals(localized);
  console.log(`\n✅ 已写入 deals.json：${payload.count} 条，updatedAt=${payload.updatedAt}${force ? '（--force 放行）' : ''}`);
}

main().catch(error => {
  console.error('\n❌ 采集失败:', error.message);
  if (error.validationErrors) {
    error.validationErrors.slice(0, 10).forEach(e => console.error(`   - ${e}`));
  }
  process.exit(1);
});
