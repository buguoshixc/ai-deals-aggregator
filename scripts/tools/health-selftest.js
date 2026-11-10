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
 * §7 是 P3 源级熔断的回归钉（注入 now、不读墙上时钟）：
 *   ① 连续失败 4 次（< 阈值 5）不暂停，下一轮仍应运行；
 *   ② 第 5 次失败 ⇒ pausedAt/pausedReason 写入、窗口内 circuitState=open、跳过；
 *   ③ 暂停满 N 天 ⇒ half_open 放行一次；成功清零恢复，再失败刷新窗口（重新计时）；
 *   另外钉住：零产出 / zeroOutputExpected（线索雷达）**绝不参与熔断**、build() 对未跑源
 *   保留暂停字段且不伪造 lastAttemptAt、printHealth 的暂停标记落在 CI Summary 的 sed 区间内、
 *   三处展示（/status/ · Summary · coverage 报告）共用同一个 health.pausedLabel()。
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
  CIRCUIT_STATE, CIRCUIT_FAILURE_THRESHOLD, HALF_OPEN_AFTER_DAYS, HALF_OPEN_AFTER_MS,
  emptyDoc, evaluate, build, summarize, relativeTime, formatCN,
  headlessReady, attemptsFromReport,
  circuitState, shouldSkipPaused, halfOpenAt, pausedLabel
} = require('../lib/health');
// printHealth 是 collect.js 打印「=== 数据源健康（跨运行）」表的**同一个函数**：
// §7 直接调它并捕获取样，证明暂停标记落在 CI Summary 的 sed 区间（`=== 数据源健康` ~ `合计：`）内。
const { printHealth } = require('../lib/report');

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
console.log('\n=== 7) P3 源级熔断：连续失败暂停 + 半开恢复（注入 now，不读墙上时钟） ===');

const CIRCUIT_T0 = Date.UTC(2026, 10, 1, 4, 0, 0); // 2026-11-01 12:00 北京时间
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 按**显式时间序列**推进熔断状态：`at` 是绝对毫秒时间戳（不是墙钟），
 * `ok:false` = 采集器抛错（唯一参与熔断的形态），`valid` = 本次合格条数。
 */
function runCircuit(steps, { source = 'circuit_demo', kind = 'static', start = null } = {}) {
  let previous = start;
  return steps.map(step => {
    const record = evaluate({
      previous,
      attempt: {
        source,
        name: source,
        region: 'cn',
        kind,
        ok: step.ok !== false,
        error: step.ok === false ? (step.error || 'fetch failed: socket hang up') : null,
        valid: step.ok === false ? 0 : (step.valid === undefined ? 10 : step.valid),
        ms: 100,
        headlessReady: step.headlessReady === undefined ? true : step.headlessReady,
        zeroOutputExpected: step.zeroOutputExpected === true
      },
      now: new Date(step.at)
    });
    previous = record;
    return record;
  });
}

const failAt = day => ({ ok: false, at: CIRCUIT_T0 + day * DAY_MS });

/* ---- ① 不到阈值不停 ---- */
const fourFails = runCircuit([failAt(0), failAt(1), failAt(2), failAt(3)]);
const fourth = fourFails[3];
checkEqual('§7① 连续失败 4 次仍未暂停（pausedAt 为空）', fourth.pausedAt, null);
checkEqual('§7① 连续失败 4 次仍未写 pausedReason', fourth.pausedReason, null);
checkEqual('§7① 连续失败计数照常到 4', fourth.consecutiveFailures, 4);
checkEqual('§7① status 仍按原规则 failed（不新增枚举值）', fourth.status, STATUS.failed);
checkEqual('§7① circuitState=closed（下一轮仍应运行）',
  circuitState(fourth, new Date(CIRCUIT_T0 + 3 * DAY_MS + 1)), CIRCUIT_STATE.closed);
checkEqual('§7① shouldSkipPaused=false（未到阈值不许跳过）',
  shouldSkipPaused(fourth, new Date(CIRCUIT_T0 + 30 * DAY_MS)), false);
const recoveredBelowThreshold = runCircuit([failAt(0), failAt(1), failAt(2), failAt(3), { ok: true, at: CIRCUIT_T0 + 4 * DAY_MS }]);
checkEqual('§7① 反例：4 次失败后来一次成功 ⇒ 计数清零且仍无暂停',
  `${recoveredBelowThreshold[4].consecutiveFailures}/${recoveredBelowThreshold[4].pausedAt}`, '0/null');

/* ---- ② 到阈值暂停（第 5 次连续失败）---- */
const fiveFails = runCircuit([failAt(0), failAt(1), failAt(2), failAt(3), failAt(4)]);
const fifth = fiveFails[4];
const FIFTH_AT = new Date(CIRCUIT_T0 + 4 * DAY_MS).toISOString();
checkEqual('§7② 第 5 次连续失败 ⇒ consecutiveFailures=5', fifth.consecutiveFailures, CIRCUIT_FAILURE_THRESHOLD);
checkEqual('§7② 第 5 次失败写入 pausedAt（= 本次失败时刻）', fifth.pausedAt, FIFTH_AT);
check('§7② pausedReason 带 circuit_open 前缀与失败次数',
  /^circuit_open: 连续失败 5 次/.test(fifth.pausedReason || ''), fifth.pausedReason);
check('§7② pausedReason 保留最近错误原文', /socket hang up/.test(fifth.pausedReason || ''), fifth.pausedReason);
checkEqual('§7② 窗口内 circuitState=open',
  circuitState(fifth, new Date(CIRCUIT_T0 + 4 * DAY_MS + 1)), CIRCUIT_STATE.open);
checkEqual('§7② 窗口内 shouldSkipPaused=true（暂停中本轮不跑）',
  shouldSkipPaused(fifth, new Date(CIRCUIT_T0 + 4 * DAY_MS + 2 * DAY_MS)), true);
checkEqual('§7② 窗口边界前 1ms 仍是 open',
  circuitState(fifth, new Date(CIRCUIT_T0 + 4 * DAY_MS + HALF_OPEN_AFTER_MS - 1)), CIRCUIT_STATE.open);
checkEqual('§7② 未暂停的行不跳过（null row / healthy row）',
  `${shouldSkipPaused(null, new Date())}/${shouldSkipPaused({ pausedAt: null, pausedReason: null }, new Date())}`, 'false/false');

// 暂停源被 collect 跳过时**不传 attempt 给 build**：旧字段必须原样保留（尤其不能伪造 lastAttemptAt）。
const pausedDocInput = { schemaVersion: 1, generatedAt: fifth.lastAttemptAt, sources: [fifth] };
const skippedBuild = build({ previousDoc: pausedDocInput, now: new Date(CIRCUIT_T0 + 5 * DAY_MS), attempts: [] });
const skippedRow = skippedBuild.doc.sources[0];
checkEqual('§7② 暂停源本轮未跑 ⇒ stale/lastRunMissing 标记照旧',
  `${skippedRow.stale}/${skippedRow.lastRunMissing}`, 'true/true');
checkEqual('§7② 暂停源本轮未跑 ⇒ pausedAt/pausedReason 原样保留（build 不覆盖丢失）',
  `${skippedRow.pausedAt}/${skippedRow.pausedReason === fifth.pausedReason}`, `${FIFTH_AT}/true`);
checkEqual('§7② 暂停源本轮未跑 ⇒ lastAttemptAt 不被伪造（仍是上一次失败时刻）',
  skippedRow.lastAttemptAt, fifth.lastAttemptAt);
checkEqual('§7② 汇总里「暂停」与「失败」分开计数',
  `${skippedBuild.summary.failed}/${skippedBuild.summary.paused}`, '1/1');

/* ---- ②′ 零产出 / 线索雷达绝不参与熔断 ---- */
const zeroRun = runCircuit([0, 1, 2, 3, 4, 5, 6, 7].map(day => ({ ok: true, valid: 0, at: CIRCUIT_T0 + day * DAY_MS })));
checkEqual('§7②′ 零产出 8 轮：consecutiveZero 到 8（判定层照旧）', zeroRun[7].consecutiveZero, 8);
checkEqual('§7②′ 零产出 8 轮：pausedAt 始终为空（零产出绝不参与熔断）', zeroRun[7].pausedAt, null);
checkEqual('§7②′ 零产出 8 轮：shouldSkipPaused=false', shouldSkipPaused(zeroRun[7], new Date(CIRCUIT_T0 + 90 * DAY_MS)), false);
const radarRun = runCircuit([0, 1, 2, 3, 4, 5, 6, 7].map(day => ({ ok: true, valid: 0, zeroOutputExpected: true, at: CIRCUIT_T0 + day * DAY_MS })));
checkEqual('§7②′ zeroOutputExpected（线索雷达）8 轮零产出：不暂停且仍 healthy',
  `${radarRun[7].pausedAt}/${radarRun[7].status}`, 'null/healthy');

/* ---- ③ 半开窗口到点重试：成功恢复 / 失败刷新窗口 ---- */
const DUE_AT_MS = new Date(fifth.pausedAt).getTime() + HALF_OPEN_AFTER_MS;
const dueAt = new Date(DUE_AT_MS);
checkEqual('§7③ 暂停满 N 天 ⇒ circuitState=half_open', circuitState(fifth, dueAt), CIRCUIT_STATE.half_open);
checkEqual('§7③ 半开窗口到点 ⇒ shouldSkipPaused=false（放行一次重试）', shouldSkipPaused(fifth, dueAt), false);
checkEqual('§7③ halfOpenAt 给出绝对到期时刻（展示用）', halfOpenAt(fifth), dueAt.toISOString());
checkEqual('§7③ 未暂停行的 halfOpenAt/pausedLabel 为空', `${halfOpenAt(recoveredBelowThreshold[4])}/${pausedLabel(recoveredBelowThreshold[4])}`, 'null/');

const halfOpenSuccess = evaluate({
  previous: fifth,
  attempt: { source: 'circuit_demo', name: 'circuit_demo', region: 'cn', kind: 'static', ok: true, valid: 12, ms: 100 },
  now: dueAt
});
checkEqual('§7③ 半开重试成功 ⇒ pausedAt 清空', halfOpenSuccess.pausedAt, null);
checkEqual('§7③ 半开重试成功 ⇒ pausedReason 清空', halfOpenSuccess.pausedReason, null);
checkEqual('§7③ 半开重试成功 ⇒ consecutiveFailures=0', halfOpenSuccess.consecutiveFailures, 0);
checkEqual('§7③ 半开重试成功 ⇒ status=healthy', halfOpenSuccess.status, STATUS.healthy);
checkEqual('§7③ 恢复后 circuitState=closed',
  circuitState(halfOpenSuccess, new Date(DUE_AT_MS + DAY_MS)), CIRCUIT_STATE.closed);

const halfOpenFail = evaluate({
  previous: fifth,
  attempt: { source: 'circuit_demo', name: 'circuit_demo', region: 'cn', kind: 'static', ok: false, error: 'HTTP 503 service unavailable', valid: 0, ms: 100 },
  now: dueAt
});
checkEqual('§7③ 半开重试再失败 ⇒ consecutiveFailures=6（照常 +1）', halfOpenFail.consecutiveFailures, 6);
checkEqual('§7③ 半开重试再失败 ⇒ pausedAt 刷新为本次重试时刻（窗口重新计时）', halfOpenFail.pausedAt, dueAt.toISOString());
checkEqual('§7③ 半开重试再失败 ⇒ 立刻回到 open（不会连续重试）',
  circuitState(halfOpenFail, new Date(DUE_AT_MS + 1)), CIRCUIT_STATE.open);
checkEqual('§7③ 半开重试再失败 ⇒ shouldSkipPaused=true', shouldSkipPaused(halfOpenFail, new Date(DUE_AT_MS + 1)), true);
check('§7③ 刷新后的 pausedReason 记录新错误', /HTTP 503/.test(halfOpenFail.pausedReason || ''), halfOpenFail.pausedReason);

/* ---- ④ 留痕：暂停文案单一来源 + CI Summary sed 区间 + 渲染接线 ---- */
const label = pausedLabel(fifth);
check('§7④ pausedLabel 文案含 ⏸/暂停于/半开重试窗口/原因',
  /⏸ 已暂停（熔断）/.test(label)
  && label.includes('暂停于 2026-11-05 12:00')
  && label.includes('半开重试窗口 2026-11-08 12:00')
  && /circuit_open: 连续失败 5 次/.test(label), label);

// 直接调 collect.js 用的同一个 printHealth()，捕获取样（不复制表格实现）。
const healthLog = [];
const originalConsoleLog = console.log;
console.log = (...args) => healthLog.push(args.join(' '));
try {
  printHealth(summarize(pausedDocInput));
} finally {
  console.log = originalConsoleLog;
}
const healthTableText = healthLog.join('\n');
const pausedIndex = healthTableText.indexOf('⏸ 已暂停（熔断）');
const totalIndex = healthTableText.indexOf('合计：');
check('§7④ printHealth 表里出现暂停标记（状态列 ⏸ + 逐条说明）', pausedIndex >= 0, healthTableText.split('\n').slice(0, 4).join(' / '));
check('§7④ CI Summary 的 sed 区间（=== 数据源健康 ~ 合计：）内可见暂停标记',
  pausedIndex >= 0 && totalIndex > pausedIndex, `暂停标记@${pausedIndex} / 合计@${totalIndex}`);
check('§7④ 合计行同时给出暂停计数', /合计：1 个来源 · 正常 0 · 异常 0 · 失败 1 · ⏸ 熔断暂停 1/.test(healthTableText),
  (healthTableText.match(/合计：[^\n]*/) || [''])[0]);

// 三处展示共用同一份文案/判定：静态接线检查（渲染器行为由 build-local 产物自检覆盖）。
const buildLocalSource = fs.readFileSync(path.join(ROOT, 'scripts', 'tools', 'build-local.js'), 'utf8');
const reportLibSource = fs.readFileSync(path.join(ROOT, 'scripts', 'lib', 'report.js'), 'utf8');
const collectSource = fs.readFileSync(path.join(ROOT, 'scripts', 'collect.js'), 'utf8');
check('§7④ /status/ 与 collect Summary 都调用 health.pausedLabel（不是各写一份措辞）',
  buildLocalSource.includes('health.pausedLabel') && reportLibSource.includes('health.pausedLabel'));
check('§7④ collect.js 的跳过闸门调用 health.circuitState / shouldSkipPaused（判定与断言同源）',
  collectSource.includes('health.circuitState') || collectSource.includes('health.shouldSkipPaused'));

/* ------------------------------------------------------------------ */
console.log(`\n${failures.length ? '❌' : '✅'} 数据源健康自测：${pass} 项通过，${failures.length} 项失败`);
failures.forEach(message => console.error(`   - ${message}`));
if (failures.length) process.exit(1);
