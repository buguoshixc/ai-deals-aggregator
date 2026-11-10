#!/usr/bin/env node
/**
 * 采集编排器：注册表 → 采集 → 归一（makeDeal）→ 去重合并 → 门槛 → 写盘 → 报告。
 *
 * 写盘/退出只有**一条**拦的理由（其余一切都只是告警）：
 *   ① 真的没有可发布内容：本次采集零产出且未加 --force → 跳过写盘、非 0 退出。
 *      （零产出还要照写 updatedAt/策展 lastSeen，等于把一次失败伪装成"刚更新过"。）
 *
 * 译文层（scripts/data/translations_zh.json）自 2026-11-08 起是**纯附加信息**：
 * 不合规 / 原文已变 / 孤儿 / 覆盖层之外，全部只告警 + 相关字段回退英文，**绝不拦写盘**。
 * 理由：线上英文原文一直都在，翻译坏掉最多让某一块显示英文；而 2026-11-02 的停更证明
 * 「译文漂移 ⇒ 门禁红 ⇒ 采集不提交 ⇒ 站点冻住」的代价远大于收益（上游改写英文是常态）。
 *
 * 明确区分两个**不拦**的概念，别把它们混成一个"降级"：
 *   · 单源失败（某个采集器抛错）：常态而非异常——collect.yml 的浏览器安装步骤本身就是
 *     continue-on-error，装不上时无头来源会各自报错并产出 0 条，而那条链路是设计上要
 *     容忍的。所以它只在报告里逐条点名、写进 CI Summary 与**跨运行的健康表**
 *     （scripts/data/source-health.json），不阻断写盘、不影响退出码。
 *   · 采集量骤降（stats.degraded：新采 < 既有 × 30%）：同样只告警。
 *     真正无法发布的情形由①兜住：零产出时本来就没有新东西可写。
 *   · **源级熔断**（P3，2026-11 起）：连续 `CIRCUIT_FAILURE_THRESHOLD`(5) 次**采集器抛错**
 *     才把该来源标为暂停（source-health.json 的 `pausedAt` / `pausedReason`），此后 collect
 *     直接**跳过**（本轮不跑、不伪造 lastAttemptAt）；暂停满 `HALF_OPEN_AFTER_DAYS`(3) 天
 *     放行一次半开重试，成功即清零恢复、再失败则窗口重新计时。零产出 / 条数骤降 /
 *     `zeroOutputExpected` 一律**不进**熔断（否则按设计空转的线索雷达会先被关掉）。
 *     跳过与真正跑失败一样**显式打印**（日志 + CI Summary + /status/），同样只告警、不拦写盘。
 *
 * 本脚本**不是**唯一的把关点：collect.yml 在 `git push` **之前**还有一道**数据正确性**硬门禁
 * （9 条命令，见 workflow 的 Data correctness gate）——坏数据根本不入库。所以这里"不拦"的东西
 * 仍可能在提交前被拦下。**发布就绪**类检查（完整 gate：真浏览器验收 / 产物自检 / 确定性构建 /
 * SEO 对账）自 P3「门禁拆锁」起排在提交**之后**，失败只自动降级并留痕，不再阻塞入库；
 * 真正的发布裁定在 deploy.yml 的 prepublish 严格门禁（那边任何事件都不许降级）。
 * 旧注释里"deploy.yml 判 skipped → 线上停更"的说法自 2026-09-28 起已不成立：
 * 发布链现在自己先过门禁，采集失败会被 deploy.yml 的 prepublish 明确拒绝。
 *
 * 用法：
 *   node scripts/collect.js                     # 全量采集并写盘
 *   node scripts/collect.js --dry-run           # 只采集并打印报告，不写盘
 *   node scripts/collect.js --headless          # 额外启用无头浏览器来源（抓 JS 渲染的公开页）
 *   node scripts/collect.js --only=cn_docs      # 只跑指定来源
 *   node scripts/collect.js --list              # 列出已注册来源
 *   node scripts/collect.js --force             # 即使零产出也照写
 */

const { makeDeal, todayCN } = require('./lib/schema');
const { loadStore, writeDeals, mergeAll, assertAllValid } = require('./lib/store');
const { loadCurated } = require('./lib/curated');
const { attach: attachZh, summarize: summarizeZh, pendingAge, loadPending, writePending, updatePending, PENDING_GRACE_DAYS } = require('./lib/zh');
const { createReport, printReport, printHealth } = require('./lib/report');
const { describeError } = require('./lib/http');
const health = require('./lib/health');
const history = require('./lib/history');
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
  let errorCode = null;

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
    // describeError() 会把 error.code 折成一行文本（NO_BROWSER 就是它），而心跳判定要的是
    // **错误码本身**：只有「内核根本起不来」才叫 headless_unavailable，「页面抓到了但规则变空」
    // 是采集器该修了。所以在这里单独留一份原始 code 给 lib/health.js（见 P2-15）。
    errorCode = error && error.code ? String(error.code) : null;
    digests = domDigest.isCapturing() ? domDigest.endCapture() : digests;
    report.finish(collector.id, { error: describeError(error) });
    console.error(`  ✗ ${collector.name}: ${describeError(error)}`);
  }

  return { items, failed, digests, errorCode };
}

/**
 * v1.4：把本次观测并进历史日志（纯计算，落盘由调用方在 writeDeals 之后做）。
 *
 * 三个输入的口径必须写清楚，否则「来源不再列出」会变成误报机器：
 *   · freshIds  —— 本次采集器真的产出过的 id；
 *   · absenceEligibleSources —— 允许参与「未见」计数的来源：本轮心跳 healthy、
 *     不是上一轮遗留（stale）、且确实跑出了条目。失败 / 骤降 / 零产出的来源一律不计 ——
 *     否则一次坏采集（无头浏览器装不上、页面改版）会把整片条目误判成「消失」。
 *   · removed —— id → 移除原因，直接取 mergeAll 手里已有的对象（不在历史层重写规则）。
 *   · labels  —— v1.5：id → 标题 / 厂商快照，挂在 `ended` 事件上（记录离开数据集后，
 *     它是变化雷达回答「这条是谁」的唯一来源）。
 */
function recordHistory({ previous, next, fresh, stats, healthSummary, today, only }) {
  if (only) {
    console.log('历史层: 本次为 --only 子集运行，跳过（避免把未跑的来源误判成「不再列出」）');
    return null;
  }
  const loaded = history.load();
  if (loaded.missing) {
    console.warn(`⚠️  未找到 ${history.HISTORY_FILE} —— 本次不记录历史（**不会**自动生成基线）。`);
    console.warn('   首次启用请跑一次 `npm run history:baseline`（一次性，且会拒绝重跑）。');
    return null;
  }
  if (loaded.broken) {
    console.warn(`⚠️  ${history.HISTORY_FILE} 解析失败（${loaded.broken}）—— 本次不记录历史，由 check:history 报错。`);
    return null;
  }

  const removal = new Map();
  const reasonPairs = [
    [stats.removedExpiredIds, 'pruned_expired'],
    [stats.removedOverflowIds, 'pruned_overflow'],
    [stats.removedGarbageIds, 'retired_garbage']
  ];
  for (const [ids, reason] of reasonPairs) {
    for (const id of ids || []) removal.set(id, reason);
  }

  // 由本站规则推导出来的字段：`expiresAt` 是 applyDeadline 从文案里抽的、`type` 是
  // 重分类算的。两者都要如实标成 derived —— 读者得能分清「来源变了」与「我们的规则变了」。
  const derivedFields = new Set();
  if (stats.extractedDeadlines > 0) derivedFields.add('expiresAt');
  if (stats.reclassified > 0) derivedFields.add('type');

  const rows = (healthSummary && healthSummary.rows) || [];
  const absenceEligibleSources = rows
    .filter(row => row && row.status === 'healthy' && !row.stale && Number(row.lastItemCount) > 0)
    .map(row => row.source);

  // v1.5 墓碑标签：`ended` 事件上的标题 / 厂商快照。记录**离开数据集**之后，
  // `deals.json` 里就查不到它是谁了（title/vendor 是身份字段、刻意不被跟踪），
  // 而变化雷达的「已结束」栏需要回答「这条是谁」。来源取**上一份发布**（previous）——
  // 那正是即将消失的那一条；本节之前的 old→new 映射已经把它从 next 里剔除了。
  const labels = new Map();
  for (const deal of previous || []) {
    if (deal && deal.id && deal.title) labels.set(deal.id, { title: deal.title, vendor: deal.vendor || '' });
  }

  const { store, stats: historyStats } = history.record(loaded.store, {
    previous,
    next,
    at: today,
    runAt: new Date().toISOString(),
    freshIds: fresh.map(deal => deal.id).filter(Boolean),
    absenceEligibleSources,
    removed: removal,
    labels,
    derivedFields
  });
  return { store, stats: historyStats, eligibleSources: absenceEligibleSources.length };
}

function printHistoryStats({ stats, store, eligibleSources }) {
  const byType = stats.byType || {};
  console.log(`历史层: 新增事件 ${stats.appended} 条（` +
    `${history.EVENT_TYPES.map(type => `${type} ${byType[type] || 0}`).join(' · ')}）· ` +
    `观测态 ${stats.absenceTracked} 条 · 可判定「未见」的来源 ${eligibleSources} 个`);
  if (stats.appended === 0) {
    console.log('        （本次没有任何重要字段变化——description 文案微调与 lastSeen 刷新不记事件）');
  }
  const total = history.eventsOf(store).length;
  console.log(`        历史累计 ${total} 条事件 · 起算日 ${store.startedAt}`);
}

async function main() {  const headless = flag('headless');

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

  // P3 源级熔断：健康文件必须在**采集循环之前**读 —— 已暂停的源本轮不跑。
  // 为什么提前：原先 health.load() 在采集循环之后（先跑 collector、后算健康），于是
  // 「已经熔断」的源仍会每天被真实抓取一次，熔断等于没接上。这里读的是**盘上的旧状态**
  // （上一轮写下的 pausedAt）；本轮自己的结果不参与本轮的跳过判定。
  // 状态：open = 暂停窗口内 ⇒ 跳过；half_open = 窗口已满 ⇒ 放行一次重试（确定性半开，见 lib/health.js）。
  const runStartedAt = new Date();
  const healthStore = health.load();
  if (healthStore.broken) {
    console.warn(`⚠️  ${health.HEALTH_FILE} 解析失败（${healthStore.broken}），本轮按空历史重算`);
  }
  const pausedSkipped = [];
  const halfOpenRetries = [];
  const runnable = picked.filter(collector => {
    const row = healthStore.byId[collector.id] || null;
    const state = health.circuitState(row, runStartedAt);
    if (state === health.CIRCUIT_STATE.open) {
      pausedSkipped.push({ collector, row });
      return false;
    }
    if (state === health.CIRCUIT_STATE.half_open) halfOpenRetries.push({ collector, row });
    return true;
  });
  // 暂停 / 半开都**显式打印**：一个源"已经停了"与"今天没数据"必须是两句不同的话
  // （否则熔断会变成静默删除一个来源）。
  console.log(`开始采集（${today}）：${runnable.length} 个来源${dryRun ? '，dry-run 模式' : ''}${headless ? '，含无头浏览器来源' : ''}`
    + `${pausedSkipped.length ? `（另有 ${pausedSkipped.length} 个来源已熔断暂停，本轮跳过）` : ''}`);
  for (const { collector, row } of pausedSkipped) {
    console.warn(`⏸  ${collector.name}（${collector.id}）已熔断暂停：连续失败 ${row.consecutiveFailures} 次，本轮跳过`
      + ` —— ${health.pausedLabel(row)}`);
  }
  for (const { collector, row } of halfOpenRetries) {
    console.log(`⏳ ${collector.name}（${collector.id}）半开重试：暂停已满 ${health.HALF_OPEN_AFTER_DAYS} 天，本轮放行一次`
      + `（${health.pausedLabel(row)}）`);
  }

  const report = createReport();
  const fresh = [];
  const snapshotEntries = [];
  let collectorFailures = 0;
  const collectorErrorCodes = new Map();
  for (const collector of runnable) {
    console.log(`→ ${collector.name}`);
    const { items, failed, digests, errorCode } = await collectFrom(collector, report);
    if (failed) collectorFailures++;
    if (errorCode) collectorErrorCodes.set(collector.id, errorCode);
    fresh.push(...items);
    snapshotEntries.push({ source: collector.id, name: collector.name, digests: digests || [] });
  }

  printReport(report, { title: dryRun ? '采集报告（dry-run）' : '采集报告' });

  // 数据源健康：把本轮每个来源的结果推进**跨运行**的心跳文件。
  // 为什么必须有它：报告表只活在这次运行的内存里，而 store.js 会把策展条目的 lastSeen
  // 刷成今天，于是「某个源坏了几天」与「某个源这次没新东西」在页面上长得一模一样。
  //
  // 「这个无头来源本轮有没有条件渲染」的判定**不在这一层内联**：它是 lib/health.js 的
  // headlessReady()，由 health-selftest 与生产调用同一个函数（P2-15 的根因就是这条公式
  // 只存在于生产里：headlessReady===false 的前提是 row.error 存在，而 row.error 存在即
  // ok=false，于是先撞上「采集器报错」分支，headless_unavailable 永远不可达）。
  //
  // 无头来源只认**本轮真的跑了的**collector（runnable = picked 去掉熔断跳过的），
  // 不再无条件 list 全部无头来源：
  // 后者会在普通（不带 --headless）采集里 require playwright-core，与「默认链路完全不依赖它」
  // 的边界相冲突——那个边界正是「内核装不上也不该拖垮静态链路」的第一道保障。
  const headlessIds = runnable.filter(c => c.headless).map(c => c.id);
  // B 类资讯线索雷达（beta）：判据严格 ⇒ 多数媒体源一天 0 条是**设计结果**，不是故障。
  // 把这些 id 传给健康判定（lib/health.js 的同名字段），零产出不会把它们推成 degraded/failed
  // （否则 3 轮后会被 P3 的源级熔断当成坏源关掉）。采集器抛错仍然照常记失败。
  const zeroOutputExpectedIds = runnable.filter(c => c.zeroOutputExpected === true).map(c => c.id);
  const browserStatus = (() => {
    if (!headlessIds.length) return { attempted: false, ok: null, channel: null, error: null, checkedAt: null };
    try {
      return require('./lib/browser').getLaunchStatus();
    } catch (error) {
      return { attempted: false, ok: null, channel: null, error: error.message, checkedAt: null };
    }
  })();
  const healthAttempts = health.attemptsFromReport({
    rows: report.list(),
    headlessIds,
    browserStatus,
    errorCodes: collectorErrorCodes,
    zeroOutputExpectedIds
  });
  // 注意 healthStore 是**采集循环之前**读的（暂停过滤要用旧状态）：这里不再重复 load。
  // 本轮没跑的来源（含被熔断跳过的）由 build() 标记 stale/lastRunMissing 并原样保留旧读数
  // —— lastAttemptAt 不会被伪造，pausedAt/pausedReason 也不会丢。
  // now 传同一个 runStartedAt：整轮只取一次时间，文档里所有 lastAttemptAt 口径一致。
  const { doc: healthDoc, summary: healthSummary } = health.build({
    previousDoc: healthStore.doc,
    attempts: healthAttempts,
    now: runStartedAt
  });
  printHealth(healthSummary);
  if (halfOpenRetries.length) {
    const rowById = new Map(healthSummary.rows.map(row => [row.source, row]));
    const recovered = halfOpenRetries.filter(({ collector }) => {
      const row = rowById.get(collector.id);
      return row && !health.isPaused(row);
    }).length;
    console.log(`⏳ 半开重试结果：${recovered} 个恢复（连续失败清零、解除暂停）· `
      + `${halfOpenRetries.length - recovered} 个未恢复（保持 failed，若抛错则窗口从本轮重新计时）`);
  }
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
    // 分母用**本轮实际运行的**来源数（runnable）：被熔断跳过的来源这一轮根本没尝试，
    // 把它们算进"失败 x/N"会让读数比实际更难看，也会让"跳过"与"失败"两个概念混在一起。
    console.warn(
      `⚠️  来源失败 ${collectorFailures}/${runnable.length} 个（advisory：逐条见报告表与「来源失败」清单，` +
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
  // P3 熔断：暂停跳过必须与"零产出/失败"并排打印（且 0 也打印）——否则"某个源已经停了"
  // 与"今天没数据"在日志/Summary 里长得一样，熔断就等于静默删除一个来源。
  console.log(`来源明细: 采集器失败 ${collectorFailures}/${runnable.length} 个 · ` +
    `零产出 ${healthSummary.zeroOutputSources.length} 个` +
    `${healthSummary.zeroOutputSources.length ? `（${healthSummary.zeroOutputSources.map(r => r.source).join('、')}）` : ''} · ` +
    `异常 ${healthSummary.degraded} 个 · 失败 ${healthSummary.failed} 个 · ` +
    `⏸ 熔断暂停 ${healthSummary.paused} 个` +
    `${healthSummary.paused ? `（本轮跳过 ${pausedSkipped.map(item => item.collector.id).join('、')}；半开重试 ${halfOpenRetries.length} 个）` : ''} · ` +
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
    zhReport.stale.forEach(row => console.warn(`  🔁 原文已变，译文停用（已回退英文）: ${row.title} — ${row.message}`));
  }
  if (zhReport.orphaned.length) {
    zhReport.orphaned.forEach(row => console.warn(`  ⚠️  译文对不上任何条目 id: ${row.id} ${row.title}`));
  }
  zhReport.skipped.forEach(row =>
    console.warn(`  ⚠️  译文不合规（已回退英文）: [${row.id}] ${row.title} — ${row.message}`));
  if (zhReport.unmanaged.length) {
    console.warn(
      `  ⚠️  ${zhReport.unmanaged.length} 条译文不在覆盖层里（deals.json 自带、覆盖层管不到）：` +
      `${zhReport.unmanaged.slice(0, 5).map(row => row.title).join('、')}`
    );
  }
  if (zhReport.missing.length) {
    // 「还有几条没译」只是提示，不参与发布判定（2026-11-08 起译文层不再拦写完/发布）。
    // 但「最老多少天」仍要说：它是「中文覆盖度在退化」的唯一可见信号。
    // 年龄从「进入待译」那天算起（本轮结束时写回 zh-pending.json），不是 firstSeen：
    // 上游改写会让一条老条目的译文失效，用 firstSeen 计时等于「刚失效就超期」。
    const pendingStore = loadPending();
    const age = pendingAge(zhReport.missing, localized, { today, pending: pendingStore.doc });
    console.log(`  ℹ️  待译 ${zhReport.missing.length} 条（最老 ${age.oldestDays} 天；` +
      `超过 ${PENDING_GRACE_DAYS} 天只会提醒，不影响发布）：node scripts/tools/zh-todo.js 查看`);
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
    // 历史层也做一次**只读**预览：record() 是纯函数，这里不落盘。
    // 预览里能看到「这一轮将记下哪些事件」，正是 dry-run 存在的意义。
    const preview = recordHistory({ previous: existing, next: deals, fresh, stats, healthSummary, today, only });
    if (preview) console.log('历史层预览（未写盘）:');
    if (preview) printHistoryStats(preview);
    console.log('\n新增/变更预览（前 15 条优惠）：');
    localized.filter(d => d.type === 'deal').slice(0, 15).forEach(d => {
      console.log(`  · [${d.region}] ${d.title} — ${(d.discountInfo || '').slice(0, 70)}`);
      console.log(`      ${d.url}`);
    });
    return;
  }

  // 译文不合规**不再拦写盘**（2026-11-08 起）：lib/zh.js 的 normalizeZh 已经把不合规字段
  // 从 zh 里删掉（回退英文），这里上面已经逐条告警。写进 deals.json 的只会是**贴成功的**译文，
  // 所以下一轮「Validate current data (before)」也不会因为坏译文变红。
  // 原先这里硬拦的理由是「构建期同款 throw，CI 会把坏 zh 提交进库」——构建期现在同样只告警，
  // 两边的判据一致：译文是附加信息，不参与发布可用性。

  // 唯一会拦写盘的采集侧情形：真的没有可发布内容。
  // 零产出还要照写，会把 updatedAt 改成今天、把 32 条策展的 lastSeen 全刷成今天，
  // 站点看上去"刚更新过"，实际上这次什么都没采到 —— 那是在替一次失败背书。
  // 反过来，单源失败 / 采集量骤降**不**在这里拦：见文件头那两条"不拦"的概念。
  if (nothingCollected && !force) {
    console.error(
      `\n❌ 本次采集零产出（本轮实际运行 ${runnable.length} 个来源都没有可发布的条目` +
      `${pausedSkipped.length ? `；另有 ${pausedSkipped.length} 个已熔断暂停、本轮未尝试` : ''}），跳过写盘。` +
      `既有 deals.json 未被改动；确需照写请加 --force`
    );
    process.exit(1);
  }

  assertAllValid(localized);

  // v1.4：历史层（append-only 变更日志）—— 与 deals.json **同批**写入。
  //
  // 为什么放在这里而不是 mergeAll 里：mergeAll 被可重建性门禁重放调用（它会剥字段、
  // 传 existing: []），把落盘副作用塞进去会让「重放产出同一份文件」变成「重放顺便
  // 改写历史」。写入点只有一个：这条采集路径。
  //
  // 跳过条件（与 deals.json 同进退）：
  //   · --dry-run（在上面已经 return）与 --only 子集运行 —— 一次子集运行会把其余来源
  //     的条目整片误判成「来源不再列出」；
  //   · 历史文件缺失 —— 只告警，**不自动生成基线**（无人看见地把当前状态冻成
  //     「起始状态」正是本层最该避免的伪造历史；缺文件由 CI 的 check:history 拦）。
  const historyStats = recordHistory({ previous: existing, next: deals, fresh, stats, healthSummary, today, only });
  const payload = writeDeals(localized);
  // 心跳与数据同批写盘：`source-health.json` 入库（dist/ 是 gitignore 的，存不了跨运行状态）。
  // 注意：唯一的硬拦（零产出）会让本次提前退出，于是**这一次**的来源结果不会落盘——
  // CI 里那种情况本来也不会提交任何文件。设计上接受这个边界：单源失败而整体成功
  // （最常见的情形）一定会被记下来。
  health.write(healthDoc);
  if (historyStats) {
    history.save(historyStats.store);
    printHistoryStats(historyStats);
  }

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
