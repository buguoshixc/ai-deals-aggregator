/**
 * 数据源健康状态（跨运行持久化的采集心跳）。
 *
 * 要解决的问题：站点头部写着「数据更新 {今天}」，但某个采集源可能已经坏了几天。
 * 原因在 store.js —— 合并时会把**策展条目**的 lastSeen 刷成今天（那是真的：策展数据确实
 * 每天都在），于是「某个来源死了」与「某个来源这次没有新东西」在页面上长得一模一样。
 * 采集报告只在当次运行里存在（report.js 是内存表），CI 一结束就没了。
 *
 * 所以这里做两件事：
 *  1. 把每个来源的**上次/本次条数、最近成功时间、连续失败次数、连续零产出次数**落成一份
 *     入库的文件（`scripts/data/source-health.json`），跨运行累积；
 *  2. 用一张写死的规则表把它翻译成 healthy / degraded / failed，并保留判定理由（reason）。
 *
 * 状态规则（顺序即优先级；三个状态各自都有明确触发条件，不靠感觉）：
 *
 *  | 条件                                   | 状态     | 说明 |
 *  |---|---|---|
 *  | 采集器抛异常                            | failed   | consecutiveFailures+1；lastSuccessAt 不动 |
 *  | 无头来源 + 本轮浏览器没起来              | failed   | 页面根本没渲染，不能报 healthy（reason=headless_unavailable） |
 *  | 成功且 cur>0，prev>0，cur < prev×0.5    | degraded | 条数骤降（reason=sharp_drop） |
 *  | 成功且 cur=0（prev>0，或 prev=0 有历史） | degraded | 零产出（reason=zero_output）；连续 3 次 → failed |
 *  | 成功且 cur=0 且从未产出过                | degraded | reason=zero_output_baseline（不是 failed：规则匹配不到≠服务坏了） |
 *  | 其余                                    | healthy  | 连续失败/连续零产出清零 |
 *
 * 两个刻意的取舍：
 *  · **单次零产出不算 failed**。国内厂商的活动页本来就可能长期没有新内容，规则匹配不到
 *    不等于来源坏了；但它也不能算 healthy —— 那正是「显示今天更新、其实某个源早坏了」的成因。
 *  · **连续 3 次零产出才升级为 failed**。次数写在常量里，改它要动这一行代码，不是调阈值。
 */

const fs = require('fs');
const path = require('path');

const HEALTH_FILE = path.join(__dirname, '..', 'data', 'source-health.json');
const SCHEMA_VERSION = 1;

/** 连续零产出达到这个次数即判 failed */
const ZERO_OUTPUT_FAIL_AFTER = 3;
/** 相对上次的条数下降超过这个比例即判 degraded（骤降） */
const SHARP_DROP_RATIO = 0.5;

const STATUS = { healthy: 'healthy', degraded: 'degraded', failed: 'failed' };

const STATUS_LABEL = { healthy: '✅ 正常', degraded: '⚠️ 异常', failed: '❌ 失败' };

const REASON_LABEL = {
  collector_error: '采集器报错',
  headless_unavailable: '无头浏览器不可用（页面没能渲染）',
  zero_output: '零产出',
  zero_output_baseline: '从未有过产出',
  sharp_drop: '条数骤降'
};

function nowIso(now = new Date()) {
  return new Date(now).toISOString();
}

function emptyDoc() {
  return { schemaVersion: SCHEMA_VERSION, generatedAt: null, sources: [] };
}

/** 读取健康文件；不存在或损坏时返回空文档（不抛——采集不该因为一份心跳文件写坏了就跑不动） */
function load(file = HEALTH_FILE) {
  if (!fs.existsSync(file)) return { doc: emptyDoc(), byId: {}, file, missing: true, broken: null };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    const sources = Array.isArray(parsed && parsed.sources) ? parsed.sources : [];
    const byId = {};
    for (const row of sources) if (row && row.source) byId[row.source] = row;
    return { doc: { ...emptyDoc(), ...parsed, sources }, byId, file, missing: false, broken: null };
  } catch (error) {
    return { doc: emptyDoc(), byId: {}, file, missing: false, broken: error.message };
  }
}

function write(doc, file = HEALTH_FILE) {
  fs.writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
  return doc;
}

/**
 * 单源状态推进（纯函数）。
 *
 * @param {object|null} previous 上一次的记录（首次运行传 null）
 * @param {object} attempt 本次尝试：{ source, name, region, kind, ok, error, valid, produced, deals, ms, headlessReady }
 * @param {Date|string} now
 * @returns {object} 新的记录
 */
function evaluate({ previous = null, attempt, now = new Date() } = {}) {
  if (!attempt || !attempt.source) throw new Error('evaluate 需要 attempt.source');
  const at = nowIso(now);
  const kind = attempt.kind || (previous && previous.kind) || 'static';
  const prevCount = previous && Number.isFinite(previous.lastItemCount) ? previous.lastItemCount : null;
  const base = {
    source: attempt.source,
    name: attempt.name || (previous && previous.name) || attempt.source,
    region: attempt.region || (previous && previous.region) || 'global',
    kind,
    lastAttemptAt: at,
    lastSuccessAt: (previous && previous.lastSuccessAt) || null,
    lastItemCount: prevCount === null ? 0 : prevCount,
    previousItemCount: prevCount,
    delta: 0,
    consecutiveFailures: (previous && previous.consecutiveFailures) || 0,
    consecutiveZero: (previous && previous.consecutiveZero) || 0,
    status: STATUS.healthy,
    reason: null,
    lastError: null,
    lastDurationMs: Number.isFinite(attempt.ms) ? attempt.ms : null,
    headlessReady: kind === 'headless' ? Boolean(attempt.headlessReady) : null
  };

  // ① 采集器抛异常
  if (!attempt.ok) {
    return {
      ...base,
      consecutiveFailures: base.consecutiveFailures + 1,
      status: STATUS.failed,
      reason: 'collector_error',
      lastError: String(attempt.error || '未知错误').split('\n')[0].slice(0, 200)
    };
  }

  const cur = Number.isFinite(attempt.valid) ? attempt.valid : 0;
  const next = {
    ...base,
    lastSuccessAt: at,
    lastItemCount: cur,
    delta: prevCount === null ? cur : cur - prevCount,
    consecutiveFailures: 0
  };

  // ② 无头来源但本轮浏览器没起来：页面没渲染，谈不上「健康」
  if (kind === 'headless' && attempt.headlessReady === false) {
    return {
      ...next,
      status: STATUS.failed,
      reason: 'headless_unavailable',
      lastError: '无头浏览器不可用，该来源本轮没能渲染任何页面'
    };
  }

  if (cur === 0) {
    const zero = base.consecutiveZero + 1;
    const reason = prevCount === null || prevCount === 0 ? 'zero_output_baseline' : 'zero_output';
    return {
      ...next,
      consecutiveZero: zero,
      status: zero >= ZERO_OUTPUT_FAIL_AFTER ? STATUS.failed : STATUS.degraded,
      reason,
      lastError: attempt.error ? String(attempt.error).split('\n')[0].slice(0, 200) : null
    };
  }

  if (prevCount !== null && prevCount > 0 && cur < prevCount * SHARP_DROP_RATIO) {
    return { ...next, consecutiveZero: 0, status: STATUS.degraded, reason: 'sharp_drop' };
  }

  return { ...next, consecutiveZero: 0, status: STATUS.healthy, reason: null };
}

/**
 * 推进整份文档。
 *
 * @param {object} params
 * @param {object} params.previousDoc load() 出来的 doc（或 emptyDoc()）
 * @param {object[]} params.attempts   本次每个来源的尝试记录
 * @returns {{doc:object, summary:object}}
 */
function build({ previousDoc = emptyDoc(), attempts = [], now = new Date() } = {}) {
  const prevById = {};
  for (const row of previousDoc.sources || []) if (row && row.source) prevById[row.source] = row;

  const sources = attempts.map(attempt => evaluate({
    previous: prevById[attempt.source] || null,
    attempt,
    now
  }));

  // 本轮没跑的来源（例如 --only 指定了子集）保留上一次的记录，但**明确标出它本轮没跑**，
  // 不然「昨天 healthy」会在页面上冒充「今天 healthy」。
  const seen = new Set(sources.map(row => row.source));
  const untouched = (previousDoc.sources || [])
    .filter(row => row && row.source && !seen.has(row.source))
    .map(row => ({ ...row, stale: true, lastRunMissing: true }));

  const doc = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: nowIso(now),
    sources: [...sources, ...untouched].sort((a, b) => String(a.source).localeCompare(String(b.source)))
  };
  return { doc, summary: summarize(doc) };
}

/** 汇总：给 collect 摘要、CI Summary 与 /status/ 共用 */
function summarize(doc) {
  const rows = (doc && doc.sources) || [];
  const pick = status => rows.filter(row => row.status === status).map(row => row.source);
  const zero = rows.filter(row => row.lastItemCount === 0).map(row => row.source);
  return {
    total: rows.length,
    healthy: pick(STATUS.healthy).length,
    degraded: pick(STATUS.degraded).length,
    failed: pick(STATUS.failed).length,
    rows,
    failedSources: rows.filter(row => row.status === STATUS.failed),
    degradedSources: rows.filter(row => row.status === STATUS.degraded),
    zeroOutputSources: rows.filter(row => row.lastItemCount === 0)
  };
}

/** 人类可读的相对时间；用于 /status/ 页面上的内联增强（无 JS 时看绝对时间） */
function relativeTime(iso, now = new Date()) {
  if (!iso) return '从未';
  const diff = new Date(now).getTime() - new Date(iso).getTime();
  if (!Number.isFinite(diff)) return '未知';
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.round(hours / 24)} 天前`;
}

/**
 * 北京时间 "YYYY-MM-DD HH:mm"。
 * 文件里存的是 ISO（UTC），直接 `replace('T',' ').slice(0,16)` 会把 UTC 当北京时间显示
 * ——本项目的所有时间口径都是北京时间（CI 里 TZ=Asia/Shanghai），所以统一走这里。
 */
function formatCN(iso) {
  if (!iso) return '—';
  const at = new Date(iso);
  if (!Number.isFinite(at.getTime())) return '—';
  const shifted = new Date(at.getTime() + 8 * 3600 * 1000).toISOString();
  return `${shifted.slice(0, 10)} ${shifted.slice(11, 16)}`;
}

module.exports = {
  HEALTH_FILE,
  SCHEMA_VERSION,
  ZERO_OUTPUT_FAIL_AFTER,
  SHARP_DROP_RATIO,
  STATUS,
  STATUS_LABEL,
  REASON_LABEL,
  emptyDoc,
  load,
  write,
  evaluate,
  build,
  summarize,
  relativeTime,
  formatCN
};
