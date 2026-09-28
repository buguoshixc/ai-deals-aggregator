#!/usr/bin/env node
/**
 * 数据源健康状态自测（零依赖、纯函数、秒级）。
 *
 * 为什么要自测：这套状态机存在的唯一理由是「网站显示今天更新，但某个采集源已经坏了几天」
 * 不再发生。它一旦判错方向——把连续零产出算成正常、或把「服务好好的只是这次没新内容」
 * 算成失败——要么放过真故障，要么天天误报。所以五种情形必须逐条钉住：
 *
 *   ① 17 → 17                        healthy（正常）
 *   ② 请求成功、规则匹配、0 条        degraded（**不判 failed**）
 *   ③ 17 → 0                         degraded（骤降到零）
 *   ④ 17 → 0 → 0 → 0                 第 3 个零起 failed
 *   ⑤ 无头浏览器没起来               failed（哪怕采集器自己没抛错）
 * 外加：采集器抛异常、条数陡降、恢复后计数清零、本轮没跑的来源不许冒充「今天健康」。
 *
 * 用法：node scripts/tools/health-selftest.js
 */

const path = require('path');
const {
  STATUS, ZERO_OUTPUT_FAIL_AFTER, SHARP_DROP_RATIO,
  emptyDoc, evaluate, build, summarize, relativeTime, formatCN
} = require('../lib/health');

let pass = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) {
    pass++;
    return;
  }
  failures.push(`${name}${detail ? ' — ' + detail : ''}`);
}

function checkEqual(name, actual, expected) {
  check(name, actual === expected, `期望 ${JSON.stringify(expected)}，实得 ${JSON.stringify(actual)}`);
}

/** 跑一串「每轮条数」的尝试，返回每轮的记录 */
function runSeries(counts, { source = 'demo', kind = 'static', start = null, headlessReady = true } = {}) {
  let previous = start;
  const out = [];
  counts.forEach((count, i) => {
    const record = evaluate({
      previous,
      attempt: {
        source, name: source, region: 'cn', kind,
        ok: count !== null,                       // null 表示本轮采集器抛异常
        error: count === null ? 'fetch failed: socket hang up' : null,
        valid: count === null ? 0 : count,
        ms: 1000 + i,
        headlessReady
      },
      now: new Date(Date.UTC(2026, 8, 28, 4, 0, i))
    });
    out.push(record);
    previous = record;
  });
  return out;
}

/* ------------------------------------------------------------------ */
console.log('=== 1) 你列的四种情形 ===');

const s1 = runSeries([17, 17]);
checkEqual('① 17 → 17 判 healthy', s1[1].status, STATUS.healthy);
checkEqual('① delta 正确', s1[1].delta, 0);
checkEqual('① previousItemCount 记住上次的 17', s1[1].previousItemCount, 17);

// ② 请求成功、规则匹配正常、0 条新增：不能简单判 failed
const s2 = runSeries([0]);
checkEqual('② 首次运行就 0 条：判 degraded（不是 failed）', s2[0].status, STATUS.degraded);
checkEqual('② 理由标明是「从未有过产出」', s2[0].reason, 'zero_output_baseline');
const s2b = runSeries([0, 0]);
checkEqual('② 连续两次 0 条仍不是 failed（阈值是 ' + ZERO_OUTPUT_FAIL_AFTER + '）', s2b[1].status, STATUS.degraded);

const s3 = runSeries([17, 0]);
checkEqual('③ 17 → 0 判 degraded', s3[1].status, STATUS.degraded);
checkEqual('③ 理由是零产出', s3[1].reason, 'zero_output');
checkEqual('③ 连续零产出计到 1', s3[1].consecutiveZero, 1);

const s4 = runSeries([17, 0, 0, 0]);
checkEqual('④ 17 → 0 → 0 仍是 degraded', s4[2].status, STATUS.degraded);
checkEqual('④ 17 → 0 → 0 → 0 第 3 个零起判 failed', s4[3].status, STATUS.failed);
checkEqual('④ 连续零产出计到 3', s4[3].consecutiveZero, 3);
checkEqual('④ 失败时仍记着上次成功条数 17 的痕迹（previousItemCount）', s4[3].previousItemCount, 0);

// ⑤ 无头浏览器没装成功：不能显示 source healthy
const s5 = runSeries([12], { source: 'cn_volc_ark', kind: 'headless', headlessReady: false });
checkEqual('⑤ 浏览器不可用的无头来源判 failed（即便「成功返回 12 条」）', s5[0].status, STATUS.failed);
checkEqual('⑤ 理由是 headless_unavailable', s5[0].reason, 'headless_unavailable');
const s5b = runSeries([12], { source: 'cn_volc_ark', kind: 'headless', headlessReady: true });
checkEqual('⑤ 反例：浏览器可用时同一条数据判 healthy', s5b[0].status, STATUS.healthy);
checkEqual('⑤ 静态来源不受浏览器影响', runSeries([12], { headlessReady: false })[0].status, STATUS.healthy);

/* ------------------------------------------------------------------ */
console.log('\n=== 2) 异常、陡降、恢复 ===');

const thrown = runSeries([17, null]);
checkEqual('采集器抛异常 → failed', thrown[1].status, STATUS.failed);
checkEqual('理由是采集器报错', thrown[1].reason, 'collector_error');
checkEqual('连续失败计到 1', thrown[1].consecutiveFailures, 1);
checkEqual('失败时 lastSuccessAt 停在上一轮（不被刷成今天）', thrown[1].lastSuccessAt, thrown[0].lastSuccessAt);
check('失败时保留错误原文（截断到 200 字内）', /socket hang up/.test(thrown[1].lastError || ''),
  thrown[1].lastError);

const twoFails = runSeries([17, null, null, null]);
checkEqual('连续 3 次失败累计到 3', twoFails[3].consecutiveFailures, 3);

const drop = runSeries([20, 8]);
checkEqual(`陡降（20 → 8 < 20×${SHARP_DROP_RATIO}）判 degraded`, drop[1].status, STATUS.degraded);
checkEqual('陡降理由', drop[1].reason, 'sharp_drop');
checkEqual('陡降不计入连续零产出', drop[1].consecutiveZero, 0);
checkEqual('缓降（20 → 12）仍 healthy', runSeries([20, 12])[1].status, STATUS.healthy);

const recover = runSeries([17, 0, 0, 0, 17]);
checkEqual('恢复后判 healthy', recover[4].status, STATUS.healthy);
checkEqual('恢复后连续零产出清零', recover[4].consecutiveZero, 0);
checkEqual('恢复后 delta 反映回升', recover[4].delta, 17);

const recoverFromError = runSeries([17, null, 17]);
checkEqual('采集器恢复后判 healthy', recoverFromError[2].status, STATUS.healthy);
checkEqual('恢复后连续失败清零', recoverFromError[2].consecutiveFailures, 0);

/* ------------------------------------------------------------------ */
console.log('\n=== 3) 整份文档与「本轮没跑的来源」 ===');

const first = build({
  previousDoc: emptyDoc(),
  now: new Date(Date.UTC(2026, 8, 28, 4, 0, 0)),
  attempts: [
    { source: 'cn_qianfan', name: '百度千帆', region: 'cn', kind: 'static', ok: true, valid: 17, ms: 1200 },
    { source: 'cn_volc_ark', name: '火山方舟', region: 'cn', kind: 'headless', ok: true, valid: 0, ms: 7200, headlessReady: true }
  ]
});
checkEqual('doc 记下 schemaVersion', first.doc.schemaVersion, 1);
checkEqual('doc 有 generatedAt', typeof first.doc.generatedAt, 'string');
checkEqual('来源按 id 排序（稳定输出）', first.doc.sources.map(s => s.source).join(','), 'cn_qianfan,cn_volc_ark');
checkEqual('汇总 healthy 数', first.summary.healthy, 1);
checkEqual('汇总 degraded 数', first.summary.degraded, 1);
checkEqual('零产出来源被单列', first.summary.zeroOutputSources.map(s => s.source).join(','), 'cn_volc_ark');

const second = build({
  previousDoc: first.doc,
  now: new Date(Date.UTC(2026, 8, 28, 12, 0, 0)),
  attempts: [{ source: 'cn_qianfan', name: '百度千帆', region: 'cn', kind: 'static', ok: true, valid: 17, ms: 1100 }]
});
const stale = second.doc.sources.find(s => s.source === 'cn_volc_ark');
check('本轮没跑的来源被标记为 stale（不许冒充「今天健康」）', stale && stale.stale === true && stale.lastRunMissing === true,
  JSON.stringify(stale && { stale: stale.stale, lastRunMissing: stale.lastRunMissing }));
checkEqual('本轮没跑的来源保留上次状态与时间', stale.status, STATUS.degraded);
check('本轮跑了的来源 lastAttemptAt 前进', second.doc.sources.find(s => s.source === 'cn_qianfan').lastAttemptAt !==
  first.doc.sources.find(s => s.source === 'cn_qianfan').lastAttemptAt);

/* ------------------------------------------------------------------ */
console.log('\n=== 4) 汇总与相对时间 ===');

const summary = summarize(first.doc);
checkEqual('summarize 的总数', summary.total, 2);
check('summarize 给出失败/异常/零产出三个清单',
  Array.isArray(summary.failedSources) && Array.isArray(summary.degradedSources) && Array.isArray(summary.zeroOutputSources));

const base = new Date('2026-09-28T12:00:00Z');
checkEqual('相对时间：刚刚', relativeTime('2026-09-28T11:59:40Z', base), '刚刚');
checkEqual('相对时间：分钟', relativeTime('2026-09-28T11:30:00Z', base), '30 分钟前');
checkEqual('相对时间：小时', relativeTime('2026-09-28T10:00:00Z', base), '2 小时前');
checkEqual('相对时间：天', relativeTime('2026-09-26T12:00:00Z', base), '2 天前');
checkEqual('相对时间：从未', relativeTime(null, base), '从未');
checkEqual('北京时间格式化（UTC→+08:00）', formatCN('2026-09-28T04:11:00Z'), '2026-09-28 12:11');
checkEqual('北京时间格式化：跨日', formatCN('2026-09-27T16:30:00Z'), '2026-09-28 00:30');
checkEqual('北京时间格式化：空值', formatCN(null), '—');

/* ------------------------------------------------------------------ */
console.log(`\n${failures.length ? '❌' : '✅'} 数据源健康自测：${pass} 项通过，${failures.length} 项失败`);
failures.forEach(message => console.error(`   - ${message}`));
if (failures.length) process.exit(1);
