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
  if (s.emptySources.length) {
    console.log(`⚠️  零产出来源（不应长期保留在注册表）：${s.emptySources.join('、')}`);
  }
}

module.exports = { createReport, printReport, pad };
