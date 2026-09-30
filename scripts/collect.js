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
 *     容忍的。所以它只在报告里逐条点名、写进 CI Summary 与**跨运行的健康表**
 *     （scripts/data/source-health.json），不阻断写盘、不影响退出码。
 *   · 采集量骤降（stats.degraded：新采 < 既有 × 30%）：同样只告警。
 *     真正无法发布的情形由①兜住：零产出时本来就没有新东西可写。
 *
 * 本脚本**不是**唯一的把关点：collect.yml 在 `git push` **之前**还会跑一次完整门禁
 * （.github/actions/gate）——数据有问题就根本不入库。所以这里"不拦"的东西仍可能在
 * 门禁那一步被拦下（例如无头浏览器不可用 ⇒ 无头来源判 headless_unavailable ⇒ 门禁红）。
 * 旧注释里"deploy.yml 判 skipped → 线上停更"的说法自 2026-09-28 起已不成立：
 * 发布链现在自己先过门禁，采集失败会被 deploy.yml 的 prepublish 明确拒绝。
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
const { attach: attachZh, summarize: summarizeZh, pendingAge, loadPending, writePending, updatePending, PENDING_GRACE_DAYS } = require('./lib/zh');
const { createReport, printReport, printHealth } = require('./lib/report');
const { describeError } = require('./lib/http');
const health = require('./lib/health');
const domDigest = require('./lib/dom-digest');
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
  let digests = [];

  try {
    // v2.0：为这次抓取留一份**页面结构摘要**（不含正文）。
    // 打开捕获作用域后，lib/http.js 与 lib/browser.js 这两个仅有的网络出口会把
    // 每一次抓取的结构摘要记进来；采集器本身一行都不用改。
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

    report.finish(collector.id, {
      produced: (raw || []).length,
      valid,
      deals,
      droppedGarbage,
      droppedInvalid
    });
  } catch (error) {
    failed = true;
    digests = domDigest.isCapturing() ? domDigest.endCapture() : digests;
    report.finish(collector.id, { error: describeError(error) });
    console.error(`  ✗ ${collector.name}: ${describeError(error)}`);
  }

  return { items, failed, digests };
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
  const snapshotEntries = [];
  let collectorFailures = 0;
  for (const collector of picked) {
    console.log(`→ ${collector.name}`);
    const { items, failed, digests } = await collectFrom(collector, report);
    if (failed) collectorFailures++;
    fresh.push(...items);
    snapshotEntries.push({ source: collector.id, name: collector.name, digests: digests || [] });
  }

  printReport(report, { title: dryRun ? '采集报告（dry-run）' : '采集报告' });

  // 数据源健康：把本轮每个来源的结果推进**跨运行**的心跳文件。
  // 为什么必须有它：报告表只活在这次运行的内存里，而 store.js 会把策展条目的 lastSeen
  // 刷成今天，于是「某个源坏了几天」与「某个源这次没新东西」在页面上长得一模一样。
  const headlessIds = new Set(registry.list({ headless: true }).filter(c => c.headless).map(c => c.id));
  const browserStatus = (() => {
    try {
      return require('./lib/browser').getLaunchStatus();
    } catch (error) {
      return { attempted: false, ok: null, error: error.message };
    }
  })();
  const healthAttempts = report.list().map(row => {
    const isHeadless = headlessIds.has(row.sourceId);
    return {
      source: row.sourceId,
      name: row.name,
      region: row.region,
      kind: isHeadless ? 'headless' : 'static',
      ok: !row.error,
      error: row.error,
      valid: row.valid,
      produced: row.produced,
      deals: row.deals,
      ms: row.ms,
      // 无头来源失败时，区分「浏览器根本起不来」与「页面抓到了但规则变空」：
      // 只有前者能说成 headless_unavailable，后者是采集器该修了。
      headlessReady: isHeadless ? (row.error ? browserStatus.ok === true : true) : true
    };
  });
  const healthStore = health.load();
  if (healthStore.broken) {
    console.warn(`⚠️  ${health.HEALTH_FILE} 解析失败（${healthStore.broken}），本轮按空历史重算`);
  }
  const { doc: healthDoc, summary: healthSummary } = health.build({
    previousDoc: healthStore.doc,
    attempts: healthAttempts
  });
  printHealth(healthSummary);
  if (browserStatus.attempted && browserStatus.ok === false) {
    console.warn(`⚠️  无头浏览器不可用（${browserStatus.error || '未知原因'}）—— 无头来源本轮一律不报「正常」`);
  }

  const curated = loadCurated();
  for (const row of curated.report) {
    if (row.missing) continue;
    console.log(`策展 ${row.file}: ${row.ok}/${row.total} 条可用`);
    row.dropped.forEach(d => console.warn(`  ⚠️  策展丢弃 [${d.reason}] ${d.title}`));
    // v1.1：新字段「写了却没生效」。与上面那条「整条丢弃」是两回事——记录照收，
    // 只是某个字段被归一悄悄洗掉了（枚举拼错的表现与「本来就没写」一模一样）。
    // 采集期只告警不拦写盘：策展文件的门禁在 `npm run validate` 那边是**错误**级。
    (row.audienceDropped || []).forEach(d => console.warn(
      `  ⚠️  新字段落空 [${d.field}${d.key ? '.' + d.key : ''}] ${d.title} —— ${d.reason}`));
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
  // 这些关键数字一律**显式打印，0 也打印**。此前 removedExpired / removedOverflow 只被
  // 算出来、只有 migrate.js 那个一次性工具打印过，采集日志与 CI Summary 里根本看不到——
  // 「静默吞掉关键数字」本身就是要修的问题（报告里 0 与「没跑」是两回事）。
  console.log(`修剪明细: 下架过期 ${stats.removedExpired} 条 · 超出上限 ${stats.removedOverflow} 条 · ` +
    `退役垃圾 ${stats.removedGarbage} 条 · 重分类 ${stats.reclassified} 条`);
  // v1.1 受众字段的可信度仲裁明细。与其他关键数字同规矩：**0 也打印** ——
  // 「这一轮没有冲突」与「这段检查根本没跑」在日志里必须是两句话。
  // 冲突 = 两侧对同一个新字段给出了**不同且都已知**的值，此时按可信度择优（§5.1），
  // 输掉的那一方被记下来供人工复核 —— 静默择优等于把「人工核过的 false 被机器推的 true
  // 覆盖」这类事故藏起来（那正是本阶段要根除的形态）。
  console.log(`受众字段: 可信度仲裁冲突 ${stats.audienceConflicts} 处 · ` +
    `涉及 ${(stats.audienceConflictTitles || []).length} 条`);
  if (stats.audienceConflicts) {
    console.log(`  ↳ 冲突条目（最多 10 条）：${(stats.audienceConflictTitles || []).join('、')}`);
  }
  // v1.1 收口：声明式补充（scripts/data/audience-overrides.json）这一轮的命中情况。
  // 为什么必须打印命中数：这些值的**唯一权威**在那份文件里，采集期是唯一会大量改写
  // deals.json 的时刻。命中数掉了（比如某次采集改了标题 → id 变了），文件里就出现了
  // 指向不存在条目的孤儿条目 —— 而 deals.json 看起来一切正常，只是那些值「又变成没源的」。
  // check-reproducible.js 会在 CI 里拦，但日志里提前一轮看到更好定位。
  if (stats.overridesApplied !== undefined) {
    console.log(`声明式补充: 命中 ${stats.overridesApplied} 条 · 与文件不一致 ${stats.overrideConflicts} 处`);
    if (stats.overrideConflicts) {
      for (const item of (stats.overrideConflictList || []).slice(0, 5)) {
        console.log(`  ↳ ${item.title} · ${item.field}：文件 ${JSON.stringify(item.inOverrides)} / 记录 ${JSON.stringify(item.inFile)}（按可信度取文件值）`);
      }
    }
  }
  console.log(`来源明细: 采集器失败 ${collectorFailures}/${picked.length} 个 · ` +
    `零产出 ${healthSummary.zeroOutputSources.length} 个` +
    `${healthSummary.zeroOutputSources.length ? `（${healthSummary.zeroOutputSources.map(r => r.source).join('、')}）` : ''} · ` +
    `异常 ${healthSummary.degraded} 个 · 失败 ${healthSummary.failed} 个 · ` +
    `无头浏览器 ${browserStatus.attempted ? (browserStatus.ok ? '可用' : '不可用') : '未探测'}`);
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
    // 「还有几条没译」不够用：译文门禁是按**年龄**判的（超过宽限期就拦），所以必须把
    // 「最老多少天」一起说出来 —— 否则没人知道下一次 push 会不会红。
    // 年龄从「进入待译」那天算起（本轮结束时写回 zh-pending.json），不是 firstSeen：
    // 上游改写会让一条老条目的译文失效，用 firstSeen 计时等于「刚失效就超期」。
    const pendingStore = loadPending();
    const age = pendingAge(zhReport.missing, localized, { today, pending: pendingStore.doc });
    console.log(`  ℹ️  待译 ${zhReport.missing.length} 条（最老 ${age.oldestDays} 天，宽限 ${PENDING_GRACE_DAYS} 天）：` +
      `node scripts/tools/zh-todo.js 查看`);
    console.log(`      ${age.rows.slice(0, 5).map(row => `${row.title}（${row.days} 天）`).join('、')}` +
      `${age.rows.length > 5 ? ` 等 ${age.rows.length} 条` : ''}`);
  }

  if (dryRun) {
    // ⚠️ dry-run 也要过最终门禁 —— 它**不写盘**，所以校验在这里是纯只读的。
    //
    // 这里原先直接 return，把 `assertAllValid` 整条跳过了。后果实测过（2026-09-29）：
    // 一次真实采集里 merge 产出了 11 条 `provenance.fields` 指向只有 unknown 的字段，
    // `--dry-run` **一路绿灯**、把「新增/变更预览」照常打完，只有真正写盘的那一次才失败。
    // 那是这个项目里最不该出现的一种绿灯：预览的全部意义就是「先看看会不会出事」，
    // 而它恰好看不见唯一会拦下写盘的那道门。
    try {
      assertAllValid(localized);
      console.log('\n✓ 最终门禁：数据全部合规（dry-run 也跑这一步，它只读不写）');
    } catch (error) {
      console.error('\n❌ dry-run 期间最终门禁失败（没有写盘，既有 deals.json 未改动）：');
      console.error(`   ${error.message}`);
      process.exit(1);
    }
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
  // 心跳与数据同批写盘：`source-health.json` 入库（dist/ 是 gitignore 的，存不了跨运行状态）。
  // 注意：上面两条硬拦（译文不合规 / 零产出）会让本次提前退出，于是**这一次**的来源结果
  // 不会落盘——CI 里那两种情况本来也不会提交任何文件。设计上接受这个边界：单源失败而
  // 整体成功（最常见的情形）一定会被记下来。
  health.write(healthDoc);

  // v2.0：页面结构摘要的跨运行快照（每个来源保留两代，**不含页面正文**）。
  // 与健康表同批入库、同一个理由：不入库就永远是"首次抓取"，也就发现不了
  // 「昨天 td=42、今天 td=0」这种最能说明问题的变化。
  // 它只是**证据**，不参与任何取值：删掉它，采集/合并/构建的结果一字不变。
  const snapshotDoc = domDigest.buildSnapshotDoc({
    previousDoc: domDigest.loadSnapshots().doc,
    entries: snapshotEntries
  });
  domDigest.writeSnapshots(snapshotDoc);

  // 待译状态：记下每个 (条目, 字段) **进入待译的日期**，供译文门禁算年龄。
  // 为什么需要它：上游改写会让一条老条目的译文失效，用 firstSeen 计时等于「刚失效就超期」，
  // 第二天门禁就红而人没有反应时间。这里由**采集**写、门禁只读（会改文件的检查不是检查）。
  const pendingNext = updatePending(loadPending().doc, zhReport.missing, { today });
  writePending(pendingNext.doc);
  console.log(`\n✅ 已写入 deals.json：${payload.count} 条，updatedAt=${payload.updatedAt}${force ? '（--force 放行）' : ''}`);
  console.log(`✅ 已写入 source-health.json：${healthSummary.total} 个来源` +
    `（正常 ${healthSummary.healthy} · 异常 ${healthSummary.degraded} · 失败 ${healthSummary.failed}）`);
  console.log(`✅ 已写入 zh-pending.json：${Object.keys(pendingNext.doc.byKey).length} 个待译字段` +
    `（本轮新进入 ${pendingNext.entered.length} · 已译好清掉 ${pendingNext.cleared.length}）`);
  const snapshotCount = snapshotEntries.filter(entry => entry.digests.length).length;
  console.log(`✅ 已写入 source-snapshots.json：${snapshotCount}/${snapshotEntries.length} 个来源有结构摘要` +
    `（共 ${snapshotEntries.reduce((sum, entry) => sum + entry.digests.length, 0)} 份；不含页面正文）`);
}

main().catch(error => {
  console.error('\n❌ 采集失败:', error.message);
  if (error.validationErrors) {
    error.validationErrors.slice(0, 10).forEach(e => console.error(`   - ${e}`));
  }
  process.exit(1);
});
