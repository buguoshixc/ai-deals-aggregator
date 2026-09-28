/**
 * 采集运行报告：每个来源的产出 / 丢弃 / 错误，结束时打印汇总表。
 */

function createReport() {
  const entries = new Map();

  function entry(sourceId) {
    if (!entries.has(sourceId)) {
      entries.set(sourceId, {
        sourceId,
        name: sourceId,
        region: '-',
        produced: 0,
        valid: 0,
        droppedGarbage: 0,
        droppedInvalid: 0,
        droppedDuplicate: 0,
        deals: 0,
        error: null,
        ms: 0
      });
    }
    return entries.get(sourceId);
  }

  return {
    /** 开始一个来源的采集 */
    start(sourceId, name, region) {
      const e = entry(sourceId);
      e.name = name || sourceId;
      e.region = region || e.region;
      e.startedAt = Date.now();
      return e;
    },
    /** 采集结束 */
    finish(sourceId, { produced = 0, valid = 0, droppedGarbage = 0, droppedInvalid = 0, deals = 0, error = null } = {}) {
      const e = entry(sourceId);
      e.produced += produced;
      e.valid += valid;
      e.droppedGarbage += droppedGarbage;
      e.droppedInvalid += droppedInvalid;
      e.deals += deals;
      if (error) e.error = error;
      e.ms += Date.now() - (e.startedAt || Date.now());
      return e;
    },
    list() {
      return [...entries.values()].sort((a, b) => b.valid - a.valid);
    },
    summary() {
      const rows = this.list();
      return {
        sources: rows.length,
        produced: rows.reduce((n, r) => n + r.produced, 0),
        valid: rows.reduce((n, r) => n + r.valid, 0),
        deals: rows.reduce((n, r) => n + r.deals, 0),
        failed: rows.filter(r => r.error).length,
        // 失败来源逐条留下（id / 名称 / 错误），供采集日志与 CI Summary 直接引用。
        // 单源失败是常态（见 collect.yml 的浏览器安装步骤：装不上也要继续跑静态链路），
        // 所以它只进报告与 Summary，不参与拦写盘判定。
        failedSources: rows
          .filter(r => r.error)
          .map(r => ({ id: r.sourceId, name: r.name, error: String(r.error) })),
        emptySources: rows.filter(r => r.valid === 0).map(r => r.name)
      };
    }
  };
}

function pad(text, width) {
  const str = String(text === null || text === undefined ? '' : text);
  // 中日韩字符按两个宽度计算，保证表格对齐
  let display = 0;
  for (const ch of str) display += /[\u3000-\u9fff\uff00-\uffef]/.test(ch) ? 2 : 1;
  return str + ' '.repeat(Math.max(0, width - display));
}

function printReport(report, { title = '采集报告' } = {}) {
  const rows = report.list();
  const header = [pad('来源', 18), pad('地区', 7), pad('产出', 6), pad('合格', 6), pad('优惠', 6), pad('垃圾', 6), pad('耗时', 8), '错误'];
  const line = header.join(' ');
  console.log(`\n=== ${title} ===`);
  console.log(line);
  console.log('-'.repeat(line.length + 6));
  for (const row of rows) {
    console.log([
      pad(row.name, 18),
      pad(row.region === 'cn' ? '国内' : '国外', 7),
      pad(row.produced, 6),
      pad(row.valid, 6),
      pad(row.deals, 6),
      pad(row.droppedGarbage, 6),
      pad(`${(row.ms / 1000).toFixed(1)}s`, 8),
      row.error ? String(row.error).slice(0, 60) : ''
    ].join(' '));
  }
  const s = report.summary();
  console.log('-'.repeat(line.length + 6));
  console.log(`合计：${s.sources} 个来源，产出 ${s.produced} 条，合格 ${s.valid} 条，其中优惠 ${s.deals} 条，失败 ${s.failed} 个`);
  if (s.failedSources.length) {
    // 逐条点名，而不是只在表格最右列塞一截错误文本：单源失败不阻断写盘，
    // 所以它是唯一能让人注意到"这个来源坏了"的地方（CI Summary 也抓这一行）。
    console.log(`来源失败（advisory，不阻断写盘）：`);
    s.failedSources.forEach(f => console.log(`  ✗ ${f.id} ${f.name}: ${String(f.error).slice(0, 100)}`));
  }
  if (s.emptySources.length) {
    console.log(`⚠️  零产出来源（不应长期保留在注册表）：${s.emptySources.join('、')}`);
  }
}

/** 健康状态的中文简写（表格里用的短标签，与 health.STATUS_LABEL 的符号版区分开） */
const STATUS_TEXT = { healthy: '正常', degraded: '异常', failed: '失败' };

/**
 * 数据源健康表（跨运行状态，不是当次运行的表）。
 *
 * 列：来源 / 上次 / 本次 / 增减 / 状态 / 最近成功。刻意把「上次」放在「本次」左边 ——
 * 判断一个来源是不是坏了，看的是这两个数的关系，不是本次的绝对值。
 */
function printHealth(summary, { title = '数据源健康（跨运行）' } = {}) {
  const rows = summary.rows || [];
  console.log(`\n=== ${title} ===`);
  if (!rows.length) {
    console.log('（本轮没有任何来源记录）');
    return;
  }
  const header = [pad('来源', 18), pad('上次', 6), pad('本次', 6), pad('增减', 6), pad('状态', 10), '最近成功'];
  console.log(header.join(' '));
  console.log('-'.repeat(header.join(' ').length + 6));
  for (const row of rows) {
    const status = STATUS_TEXT[row.status] || row.status;
    const last = row.lastSuccessAt ? row.lastSuccessAt.replace('T', ' ').slice(0, 16) : '从未';
    const extra = row.reason && row.reason !== 'zero_output' ? `（${row.reason}）` : '';
    console.log([
      pad(row.name || row.source, 18),
      pad(row.previousItemCount === null ? '—' : row.previousItemCount, 6),
      pad(row.lastItemCount, 6),
      pad(row.delta > 0 ? `+${row.delta}` : row.delta, 6),
      pad(status + extra, 10),
      last
    ].join(' '));
  }
  console.log('-'.repeat(header.join(' ').length + 6));
  console.log(`合计：${summary.total} 个来源 · 正常 ${summary.healthy} · 异常 ${summary.degraded} · 失败 ${summary.failed}`);
  if (summary.failedSources.length) {
    // 逐条点名 + 连续次数：这是「某个源已经坏了几天」唯一会开口说话的地方
    console.log('失败来源：');
    summary.failedSources.forEach(row => console.log(
      `  ✗ ${row.source} ${row.name}：连续失败 ${row.consecutiveFailures} 次 / 连续零产出 ${row.consecutiveZero} 次` +
      `${row.lastError ? ` — ${String(row.lastError).slice(0, 100)}` : ''}`
    ));
  }
  if (summary.degradedSources.length) {
    console.log('异常来源（继续观察，连续零产出达到阈值会升级为失败）：');
    summary.degradedSources.forEach(row => console.log(
      `  ⚠️  ${row.source} ${row.name}：上次 ${row.previousItemCount === null ? '—' : row.previousItemCount} 条 → 本次 ${row.lastItemCount} 条` +
      `${row.reason ? `（${row.reason}）` : ''}`
    ));
  }
}

module.exports = { createReport, printReport, printHealth, pad };

