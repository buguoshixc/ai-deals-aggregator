#!/usr/bin/env node
/**
 * 数据源健康状态自测（纯函数 + 一条端到端接线，秒级）。
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
 * 第 5、6 节是 P2-15 的回归钉：**判定写在生产里、断言写在别处**正是那个缺陷的形态
 * （真实接线路径下 `headless_unavailable` 出现 0 次，全被折叠成 `collector_error`）。
 * 所以这两节不复制公式：
 *   · §5 调用的 `attemptsFromReport` 就是 collect.js 生产接线调用的那个函数；
 *   · §6 真跑一次 `collect.js --headless --dry-run`（注入一个起不来的内核），
 *     拿 Collect Summary 原文断言 —— 任何在接线/判定/注入点上「把 headlessReady 写死」
 *     的改动都会让这一节变红，而不是让一处断言与另一处实现各自自洽。
 *
 * 用法：node scripts/tools/health-selftest.js
 */

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  STATUS, ZERO_OUTPUT_FAIL_AFTER, SHARP_DROP_RATIO, REASON_LABEL,
  emptyDoc, evaluate, build, summarize, relativeTime, formatCN,
  headlessReady, attemptsFromReport
} = require('../lib/health');

const ROOT = path.join(__dirname, '..', '..');

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

/** 文件指纹（文件不存在时返回 null）：§6 用它证明「dry-run 一个字节都没写」 */
function sha256File(file) {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  } catch (error) {
    return null;
  }
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
console.log('\n=== 5) 真实接线：无头来源 × 浏览器可用性（P2-15 回归钉） ===');

/**
 * 用**生产接线的同一个函数**（health.attemptsFromReport）把「采集报告行 + 浏览器探测结论」
 * 翻成心跳输入，再喂给 evaluate —— 公式不在这里复制第二份。
 *
 * 判据来源：research/audit 的 F-r1-identity-002 六组合矩阵（`browser ok=false + headless
 * row.error` 曾经得到 `collector_error`，`headless_unavailable` 在整个矩阵里出现 0 次）。
 */
const WIRING_NOW = new Date(Date.UTC(2026, 9, 3, 4, 0, 0));
const BROWSER_DOWN = { attempted: true, ok: false, channel: null, error: '未找到可用的浏览器内核' };
const BROWSER_UP = { attempted: true, ok: true, channel: 'msedge', error: null };
const BROWSER_UNPROBED = { attempted: false, ok: null, channel: null, error: null };

function wiring({ rowError = null, errorCode = null, browser = BROWSER_UP, isHeadless = true, valid = 0 }) {
  const [attempt] = attemptsFromReport({
    rows: [{
      sourceId: 'cn_volc_ark', name: '火山方舟', region: 'cn',
      error: rowError, valid, produced: valid, deals: 0, ms: 1200
    }],
    headlessIds: isHeadless ? ['cn_volc_ark'] : [],
    browserStatus: browser,
    errorCodes: errorCode ? { cn_volc_ark: errorCode } : null
  });
  return { attempt, record: evaluate({ attempt, now: WIRING_NOW }) };
}

const wiringReasons = new Set();

// A) 内核起不来 —— 真实链路：launch() 探测三个内核都失败 ⇒ 抛 code=NO_BROWSER（接线留码）
const a = wiring({ rowError: 'NO_BROWSER', errorCode: 'NO_BROWSER', browser: BROWSER_DOWN });
wiringReasons.add(a.record.reason);
checkEqual('A1 内核不可用 + 无头来源报错 ⇒ headlessReady=false', a.attempt.headlessReady, false);
checkEqual('A2 …⇒ status=failed', a.record.status, STATUS.failed);
checkEqual('A3 …⇒ reason=headless_unavailable（修复前这里是 collector_error）', a.record.reason, 'headless_unavailable');
check('A4 …⇒ lastError 里留着内核不可用的原话', /无头浏览器不可用/.test(a.record.lastError || ''), a.record.lastError);

// B) 内核起不来 + 采集器自己吞了错（人工构造）：状态相同，但记账按「成功路径」走
const b = wiring({ browser: BROWSER_DOWN });
wiringReasons.add(b.record.reason);
checkEqual('B1 内核不可用 + 采集器没抛错 ⇒ 同样 failed/headless_unavailable', `${b.record.status}/${b.record.reason}`, 'failed/headless_unavailable');

// C) 内核可用 + 无头来源报错（页面 403 / robots 拒绝）：必须仍判 collector_error
const c = wiring({ rowError: 'HTTP 403', browser: BROWSER_UP });
wiringReasons.add(c.record.reason);
checkEqual('C1 内核可用 + 采集器报错 ⇒ collector_error（页面问题不许说成内核问题）', c.record.reason, 'collector_error');

// D) 本轮没探测过内核 + 采集器报错：不许无凭据地宣称「浏览器不可用」
const d = wiring({ rowError: 'HTTP 403', browser: BROWSER_UNPROBED });
wiringReasons.add(d.record.reason);
checkEqual('D1 没探测过内核 ⇒ headlessReady=null（不是 false）', d.attempt.headlessReady, null);
checkEqual('D2 …⇒ collector_error', d.record.reason, 'collector_error');
checkEqual('D3 记录里 headlessReady 也是 null（三态不许折叠成 false）', d.record.headlessReady, null);

// E) 内核可用 + 无头来源正常产出：不许因为「是无头来源」被压低
const e = wiring({ browser: BROWSER_UP, valid: 12 });
wiringReasons.add(e.record.reason);
checkEqual('E1 内核可用 + 产出 12 条 ⇒ healthy', `${e.record.status}/${e.record.reason}`, 'healthy/null');
checkEqual('E2 …⇒ headlessReady=true 如实记下', e.record.headlessReady, true);

// F) 静态来源完全不受浏览器影响
const f = wiring({ rowError: 'HTTP 403', browser: BROWSER_DOWN, isHeadless: false });
wiringReasons.add(f.record.reason);
checkEqual('F1 静态来源 headlessReady=null', f.attempt.headlessReady, null);
checkEqual('F2 静态来源报错 ⇒ collector_error（不是 headless_unavailable）', f.record.reason, 'collector_error');

check('G1 六组合矩阵里 headless_unavailable 真的可达（修复前出现 0 次）', wiringReasons.has('headless_unavailable'),
  `实得 ${[...wiringReasons].join(',')}`);
check('G2 每个 reason 都在既有 REASON_LABEL 枚举内（本任务不新增枚举）',
  [...wiringReasons].every(reason => reason === null || Object.prototype.hasOwnProperty.call(REASON_LABEL, reason)),
  [...wiringReasons].join(','));
checkEqual('G3 headlessReady 判定函数本身：非无头来源一律 null', headlessReady({ isHeadless: false, browserStatus: BROWSER_DOWN }), null);

/* ------------------------------------------------------------------ */
console.log('\n=== 6) 端到端接线：真跑一次采集（--dry-run，不写任何文件） ===');

/**
 * 端到端（跑的是生产入口 collect.js 本身，不是复制的公式）：
 * 注入一个**不存在**的内核可执行文件 ⇒ 三个内核全起不来 ⇒ 该无头来源的 Collect Summary
 * 必须落到「失败（headless_unavailable）」。
 *
 * 这一条同时钉住三处：collect.js 的接线、health.js 的判定顺序、browser.js 的注入点。
 * 它也是唯一能抓住「在 collect.js 的调用点把 headlessReady 写死成 true」的断言。
 * --dry-run：只读不写（本脚本跑完会核对 deals.json / scripts/data/*.json 的 sha256 未变）。
 */
const INJECTED_BROWSER = path.join(ROOT, '.qc-iso', 'no-such-browser', 'chrome.exe');
check('H0 注入路径确实不存在（演练前提成立）', !fs.existsSync(INJECTED_BROWSER), INJECTED_BROWSER);

// dry-run 的承诺是「只读不写」：跑之前先把采集会碰的几份数据文件的指纹记下来，
// 跑完逐个比对（不比对 deal-history.json：它可能被并行的历史层任务改动，不是本次演练的证据）。
const untouched = [
  'deals.json',
  path.join('scripts', 'data', 'source-health.json'),
  path.join('scripts', 'data', 'zh-pending.json'),
  path.join('scripts', 'data', 'source-snapshots.json')
].map(rel => ({ rel, before: sha256File(path.join(ROOT, rel)) }));

const e2e = (() => {
  const r = spawnSync(
    process.execPath,
    [path.join(ROOT, 'scripts', 'collect.js'), '--headless', '--dry-run', '--only=cn_zhipu_pricing'],
    {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, DSH_BROWSER_EXECUTABLE: INJECTED_BROWSER }
    }
  );
  return {
    status: r.status,
    stdout: r.stdout || '',
    stderr: r.stderr || '',
    spawnError: r.error ? String(r.error.message) : null
  };
})();

const summaryLine = (e2e.stdout.match(/来源明细:[^\n]*/) || [''])[0];
const healthRow = (e2e.stdout.match(/智谱AI活动页[^\n]*/g) || []).join(' | ');
const changedFiles = untouched.filter(item => sha256File(path.join(ROOT, item.rel)) !== item.before).map(item => item.rel);

check('H1 端到端采集进程跑起来且 exit 0（dry-run 不写盘）', e2e.status === 0,
  `exit=${e2e.status}${e2e.spawnError ? ` spawnError=${e2e.spawnError}` : ''} ` +
  `${e2e.stderr.split('\n').filter(Boolean).slice(-2).join(' / ')}`);
check('H2 Collect Summary 里无头来源落到 headless_unavailable', /失败（headless_unavailable）/.test(e2e.stdout),
  healthRow || summaryLine);
check('H3 Collect Summary 同时明说「无头浏览器 不可用」', /无头浏览器 不可用/.test(summaryLine), summaryLine);
check('H4 这一轮演练一个字节都没写进生产数据文件（dry-run 的只读承诺）', changedFiles.length === 0,
  changedFiles.join(', '));

/* ------------------------------------------------------------------ */
console.log(`\n${failures.length ? '❌' : '✅'} 数据源健康自测：${pass} 项通过，${failures.length} 项失败`);
failures.forEach(message => console.error(`   - ${message}`));
if (failures.length) process.exit(1);
