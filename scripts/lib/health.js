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
 *  | 无头来源 + 本轮浏览器没起来              | failed   | 页面根本没渲染，不能报 healthy（reason=headless_unavailable）；**排在「采集器抛异常」之前** |
 *  | 采集器抛异常                            | failed   | consecutiveFailures+1；lastSuccessAt 不动 |
 *  | 成功且 cur>0，prev>0，cur < prev×0.5    | degraded | 条数骤降（reason=sharp_drop） |
 *  | 成功且 cur=0（prev>0，或 prev=0 有历史） | degraded | 零产出（reason=zero_output）；连续 3 次 → failed |
 *  | 成功且 cur=0 且从未产出过                | degraded | reason=zero_output_baseline（不是 failed：规则匹配不到≠服务坏了） |
 *  | 其余                                    | healthy  | 连续失败/连续零产出清零 |
 *
 * 为什么「浏览器没起来」必须排在「采集器抛异常」**前面**：内核不可用时 `withPage()` 必然抛错
 * （lib/browser.js 的 launch() 先探测内核，探测失败即抛 NO_BROWSER），于是两条同时成立。
 * 若先判抛异常，六类情形里的「Headless 浏览器不可用」就永远被折叠成 collector_error，
 * `/status/` 与 CI Summary 再也分不清「等 runner 装内核」与「改采集器规则」（P2-15）。
 * 账仍然照实记：这一轮采集器确实抛了错 ⇒ 连续失败 +1、lastSuccessAt 不前进。
 *
 * 两个刻意的取舍：
 *  · **单次零产出不算 failed**。国内厂商的活动页本来就可能长期没有新内容，规则匹配不到
 *    不等于来源坏了；但它也不能算 healthy —— 那正是「显示今天更新、其实某个源早坏了」的成因。
 *  · **连续 3 次零产出才升级为 failed**。次数写在常量里，改它要动这一行代码，不是调阈值。
 *  · **「零产出是预期内」的来源（B 类资讯线索雷达，2026-11 起）单独放行**：线索判据刻意严格
 *    （平台名 + 免费 + 时间词三闸同时命中），多数媒体源一天 0 条是**设计结果**而不是故障。
 *    这类来源由采集器声明 `zeroOutputExpected: true`，经 `attemptsFromReport({ zeroOutputExpectedIds })`
 *    传进来；零产出/条数波动都不改状态（采集器抛错仍然 failed —— 结构变了不能装成「今天没线索」）。
 *    没有这个放行，8 个媒体源会在 3 轮后集体被判 failed，再被 P3 的源级熔断关掉一个按设计空转的雷达。
 *
 * ## P3 源级熔断（2026-11 起）：连续抛错 ⇒ 自动暂停 ⇒ 半开恢复
 *
 * 状态仍只有 healthy / degraded / failed 三档（`/status/`、coverage-report、source-rulings、
 * build-local 多处消费这个枚举，**不许**加第四档）；"暂停"用**附加字段**表达：
 *
 *   · `pausedAt`    达到阈值那一刻（也记作**最近一次失败尝试**的时间）；null = 未暂停；
 *   · `pausedReason` 人类可读的原因（`circuit_open: 连续失败 N 次（最近错误：…）`）。
 *
 * 语义（**只对采集器抛错计数**，零产出 / 条数骤降 / zeroOutputExpected 一律不进熔断 —— 否则
 * 第一晚就会把按设计空转的线索雷达关掉，而那正是 P3 要避免的事）：
 *
 *   | 时刻 | 行为 |
 *   |---|---|
 *   | consecutiveFailures < `CIRCUIT_FAILURE_THRESHOLD` | 不暂停，照常每轮尝试 |
 *   | 第 `CIRCUIT_FAILURE_THRESHOLD` 次连续抛错 | 写 `pausedAt`/`pausedReason`，状态仍 failed |
 *   | 暂停中（`circuitState=open`，窗口未满） | collect **跳过**该来源（本轮不跑、不伪造 lastAttemptAt） |
 *   | 暂停满 `HALF_OPEN_AFTER_DAYS` 天（`half_open`） | 放行**一次**半开重试 |
 *   | 半开重试成功 | `pausedAt`/`pausedReason` 清空、`consecutiveFailures=0`、状态按成功规则 |
 *   | 半开重试再失败 | 保持暂停，`pausedAt` 刷新为本次失败时间（窗口重新计时） |
 *
 * 阈值取 5（> 3）是**与 `lib/source-rulings.js` 的分工**：那边规定 `consecutiveFailures >= 3`
 * 必须有人工裁决（repair / headless-migrate / keep-degraded / retire 四选一）。自动熔断若也在 3
 * 触发，就等于机器抢在人工裁决之前把来源关掉 —— 人工层看到的是一个"已经不跑了"的来源，
 * 裁决所需的新鲜读数（它到底是持续坏还是偶发）反而断供。取 5 留出 2 轮（约 2 天）的
 * 人工介入窗口；自动暂停**不替代**任何裁决，只把"连续抛错"这件事从每天空转降为每 N 天一次探针。
 *
 * 半开窗口取 3 天：采集是每日一次的 CI 定时任务，1 天太短（一次 runner/网络抖动就会反复试探，
 * 等于没熔断）；两周（source-rulings 的复查窗）太长（真坏了也无谓空转两周）。3 天 ≈ 连续 3 个
 * 自然日仍坏才算"持续"，之后每 3 天最多花 1 次尝试——永久坏源的成本从"每天 1 次"降到"每 3 天 1 次"，
 * 同时保证恢复是**确定性**的（不依赖人记得重跑，也不会永假死亡）。
 */

const fs = require('fs');
const path = require('path');

const HEALTH_FILE = path.join(__dirname, '..', 'data', 'source-health.json');
const SCHEMA_VERSION = 1;

/** 连续零产出达到这个次数即判 failed */
const ZERO_OUTPUT_FAIL_AFTER = 3;
/** 相对上次的条数下降超过这个比例即判 degraded（骤降） */
const SHARP_DROP_RATIO = 0.5;

/**
 * P3 源级熔断阈值：连续**采集器抛错**达到这个次数即自动暂停该来源。
 *
 * 为什么是 5 而不是 3：`lib/source-rulings.js` 的 `HEALTH_FAILURES_REQUIRING_RULING = 3`
 * 规定「连续失败 ≥ 3 必须有人工裁决」。自动熔断必须**晚于**人工裁决的触发线，否则机器会
 * 抢在人工表态之前把来源关掉，裁决层拿到的是一个"已经不再尝试"的来源（新鲜读数断供）。
 * 取 5 = 给人工留 2 轮（约 2 天）介入窗口；两个数字各自独立演化，**没有**互相 require。
 */
const CIRCUIT_FAILURE_THRESHOLD = 5;

/**
 * 半开窗口：暂停满这么多天自动放行**一次**重试（成功清零恢复，失败重新计时）。
 *
 * 为什么是 3 天：采集是每日一次的 CI 定时任务 —— 1 天太短（一次 runner/网络抖动就会
 * 反复试探，等于没熔断）；source-rulings 的复查窗是两周，太长（真坏了也无谓空转两周）。
 * 3 天 ≈ 连续 3 个自然日仍坏才算持续，之后每 3 天最多 1 次尝试：永久坏源的运行成本从
 * 「每天 1 次」降到「每 3 天 1 次」，恢复又**不依赖人记得重跑**（确定性半开）。
 */
const HALF_OPEN_AFTER_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
const HALF_OPEN_AFTER_MS = HALF_OPEN_AFTER_DAYS * DAY_MS;

/** 熔断状态（**不是** source-health 的 status 枚举，别混用）：closed = 正常运行 */
const CIRCUIT_STATE = { closed: 'closed', open: 'open', half_open: 'half_open' };

/** `pausedReason` 的前缀（机器可读；人读的后半句随最近错误变化） */
const CIRCUIT_OPEN_REASON_PREFIX = 'circuit_open';

const STATUS = { healthy: 'healthy', degraded: 'degraded', failed: 'failed' };

const STATUS_LABEL = { healthy: '✅ 正常', degraded: '⚠️ 异常', failed: '❌ 失败' };

const REASON_LABEL = {
  collector_error: '采集器报错',
  headless_unavailable: '无头浏览器不可用（页面没能渲染）',
  zero_output: '零产出',
  zero_output_baseline: '从未有过产出',
  sharp_drop: '条数骤降'
};

/** 无头来源这一轮到底发生了什么的原文（/status/ 的 reason 只给短标签，这句进日志与 lastError） */
const HEADLESS_UNAVAILABLE_ERROR = '无头浏览器不可用，该来源本轮没能渲染任何页面';

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
 * 「这个无头来源本轮有没有条件渲染页面」——把浏览器探测结论与采集器错误码翻译成
 * `evaluate` 需要的 `headlessReady` 输入。返回 true / false / null（null = 本轮拿不到结论）。
 *
 * 为什么这件事要单独一个函数、并且放在**生产与自测共用的这一处**（而不是内联在 collect.js 里）：
 * P2-15 的形态正是「判定公式写在生产接线里、断言在别处复制了一份」，两边各自看都自洽，
 * 而真实链路的组合矩阵里 `headless_unavailable` 出现 0 次。只要断言与被断言的判定是
 * **同一个函数对象**，改坏任何一边都不可能只红一边。
 *
 * 判据（顺序即优先级）：
 *   1. 不是无头来源 → null（这一路输入对它不适用）；
 *   2. 采集器抛出的错误码就是 NO_BROWSER → false（launch() 的直接证据：连内核都没起来）；
 *   3. 本轮探测过内核 → 以探测结论为准（ok===true ⇒ true，否则 false）；
 *   4. 没探测过 → null。**不许**把「没探过」当成「不可用」：那是无凭据的状态声明。
 *
 * @param {object} params
 * @param {boolean} params.isHeadless         该来源是不是无头来源
 * @param {object|null} params.browserStatus  lib/browser.js getLaunchStatus() 的快照
 * @param {string|null} params.errorCode      采集器本次抛出的原始错误码（collect.js 在 catch 处留的）
 */
function headlessReady({ isHeadless = false, browserStatus = null, errorCode = null } = {}) {
  if (!isHeadless) return null;
  if (String(errorCode || '') === 'NO_BROWSER') return false;
  if (browserStatus && browserStatus.attempted === true) return browserStatus.ok === true;
  return null;
}

/**
 * 采集报告行 + 浏览器探测结论 → `build()` 的 attempts 输入（**生产接线的唯一实现**）。
 *
 * 每一列都照实映射，不做二次解释：
 *   · kind      —— 注册表里的 headless 标记（只对**本轮真的跑了的**来源有意义）；
 *   · ok/error  —— 采集器这一轮有没有抛错；
 *   · headlessReady —— 见上面的 headlessReady()。
 *
 * @param {object} params
 * @param {object[]} params.rows             report.list() 的行
 * @param {Set|string[]} params.headlessIds  本轮跑了的无头来源 id
 * @param {object|null} params.browserStatus browser.getLaunchStatus() 快照
 * @param {Map|object|null} params.errorCodes 来源 id → 采集器抛出的原始错误码
 * @param {Set|string[]|null} params.zeroOutputExpectedIds
 *        本轮跑了的「零产出是预期内」来源 id（B 类资讯线索雷达；见文件头最后一条取舍）。
 *        不传 = 没有任何来源豁免（旧行为逐字节不变）。
 */
function attemptsFromReport({ rows = [], headlessIds = [], browserStatus = null, errorCodes = null, zeroOutputExpectedIds = null } = {}) {
  const headless = headlessIds instanceof Set ? headlessIds : new Set(headlessIds || []);
  const codes = errorCodes instanceof Map ? errorCodes : new Map(Object.entries(errorCodes || {}));
  const zeroExpected = zeroOutputExpectedIds instanceof Set
    ? zeroOutputExpectedIds
    : new Set(zeroOutputExpectedIds || []);
  return rows.map(row => {
    const isHeadless = headless.has(row.sourceId);
    return {
      source: row.sourceId,
      name: row.name,
      region: row.region,
      kind: isHeadless ? 'headless' : 'static',
      ok: !row.error,
      error: row.error || null,
      valid: row.valid,
      produced: row.produced,
      deals: row.deals,
      ms: row.ms,
      zeroOutputExpected: zeroExpected.has(row.sourceId),
      headlessReady: headlessReady({ isHeadless, browserStatus, errorCode: codes.get(row.sourceId) || null })
    };
  });
}

/**
 * 单源状态推进（纯函数）。
 *
 * @param {object|null} previous 上一次的记录（首次运行传 null）
 * @param {object} attempt 本次尝试：{ source, name, region, kind, ok, error, valid, produced, deals, ms, headlessReady }
 *   `headlessReady` 是三态：true/false = 本轮真的探到了；null/缺省 = 本轮没有结论（不参与判定）。
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
    // P3 源级熔断：暂停态先照抄上一行（成功分支会显式清空；失败分支到阈值会写/刷新）。
    // 这两个字段是**附加**语义，status 仍是 healthy/degraded/failed 三档，不新增枚举值。
    pausedAt: pausedAtOf(previous),
    pausedReason: pausedReasonOf(previous),
    // 三态：true / false 是**本轮真的探到了**的结论；null 表示本轮拿不到结论
    // （例如这个来源本轮根本没跑）。不许把「没探过」写成 false —— 那等于凭空空口
    // 宣称「浏览器不可用」，与把「没探过」写成 true 一样是伪造。
    headlessReady: kind === 'headless'
      ? (typeof attempt.headlessReady === 'boolean' ? attempt.headlessReady : null)
      : null
  };

  const cur = Number.isFinite(attempt.valid) ? attempt.valid : 0;
  const next = {
    ...base,
    lastSuccessAt: at,
    lastItemCount: cur,
    delta: prevCount === null ? cur : cur - prevCount,
    consecutiveFailures: 0,
    // 成功（采集器没有抛错）⇒ 无论条数多少都算一次真实恢复：熔断清零、解除暂停。
    // 「零产出」不是失败（见文件头），它当然也不该把来源继续关在熔断里。
    pausedAt: null,
    pausedReason: null
  };

  // ① 无头来源但本轮浏览器起不来：**优先级高于「采集器抛异常」**（理由见文件头）。
  //    两种子情形分开记账，别把「这一轮其实什么都没渲染出来」记成成功：
  //    · 采集器也抛了错（真实链路：内核不可用 ⇒ withPage 必然抛）→ 与 collector_error 同一套账
  //      （连续失败 +1、lastSuccessAt 停在上一轮、条数保持上次的值）；
  //    · 采集器没抛错却报「浏览器不可用」（人工构造/上游自行吞错）→ 沿用原来的成功路径记账。
  if (kind === 'headless' && attempt.headlessReady === false) {
    const alsoFailed = attempt.error ? `（采集器同时报错：${String(attempt.error).split('\n')[0]}）` : '';
    const lastError = `${HEADLESS_UNAVAILABLE_ERROR}${alsoFailed}`.slice(0, 200);
    if (!attempt.ok) {
      const failures = base.consecutiveFailures + 1;
      return {
        ...base,
        ...pauseFieldsAfterFailure(at, { failures, lastError }),
        consecutiveFailures: failures,
        status: STATUS.failed,
        reason: 'headless_unavailable',
        lastError
      };
    }
    return {
      ...next,
      // 这一支沿用原来的「成功路径记账」（采集器没抛错 ⇒ 连续失败清零、lastSuccessAt 前进）：
      // 它与「采集器同时报错」那一支是两种不同的真实形态，熔断只对**抛错**计数，这里不动计数。
      // next 已把 pausedAt/pausedReason 清空：既然按成功路径记账，就不能同时把来源关在熔断里。
      status: STATUS.failed,
      reason: 'headless_unavailable',
      lastError
    };
  }

  // ② 采集器抛异常
  if (!attempt.ok) {
    const failures = base.consecutiveFailures + 1;
    const lastError = String(attempt.error || '未知错误').split('\n')[0].slice(0, 200);
    return {
      ...base,
      ...pauseFieldsAfterFailure(at, { failures, lastError }),
      consecutiveFailures: failures,
      status: STATUS.failed,
      reason: 'collector_error',
      lastError
    };
  }

  // ②′「零产出是预期内」的来源（B 类资讯线索雷达）：成功解析了 feed、只是没有条目过三闸。
  //    零产出与条数波动都不进任何降级分支（理由见文件头最后一条取舍）；采集器抛错已在 ② 拦下。
  //    lastSuccessAt / lastItemCount 照常推进 —— 页面上的「最近成功采集」仍然是真话。
  if (attempt.zeroOutputExpected === true) {
    return { ...next, consecutiveZero: 0, status: STATUS.healthy, reason: null };
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
  // P3：被熔断暂停、collect 因而跳过的来源也走这一支 —— 原样保留（含 pausedAt/pausedReason），
  //     所以暂停字段绝不会因为"这一轮没跑"而丢失；lastAttemptAt/lastSuccessAt 也保持旧值，
  //     不会伪造出一次不存在的尝试。
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
  const pausedRows = rows.filter(row => isPaused(row));
  return {
    total: rows.length,
    healthy: pick(STATUS.healthy).length,
    degraded: pick(STATUS.degraded).length,
    failed: pick(STATUS.failed).length,
    // P3：熔断暂停是**附加读数**（status 仍是三档之一）；"暂停"与"失败"必须能分开数。
    paused: pausedRows.length,
    rows,
    pausedSources: pausedRows,
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

/* ------------------------------------------------------------------ */
/* P3 源级熔断：暂停态的判定与展示                                      */
/* 全部是纯函数 —— now 由调用方注入，测试不读墙上时钟。                 */
/* ------------------------------------------------------------------ */

/** 合法的暂停时刻（ISO）。没有 / 非法 ⇒ null（非法时间不得被当成"已暂停很久"自动半开） */
function pausedAtOf(row) {
  const at = row && row.pausedAt;
  if (!at) return null;
  return Number.isFinite(new Date(at).getTime()) ? String(at) : null;
}

function pausedReasonOf(row) {
  const reason = row && row.pausedReason;
  return typeof reason === 'string' && reason.trim() ? reason : null;
}

/** 这一行是不是处于熔断暂停态（仅看字段，不看时钟；window 是否到点由 circuitState 判） */
function isPaused(row) {
  return pausedAtOf(row) !== null;
}

/** 半开窗口到期时刻（ISO，绝对时间）。未暂停 / 时间非法 ⇒ null */
function halfOpenAt(row) {
  const at = pausedAtOf(row);
  if (!at) return null;
  return new Date(new Date(at).getTime() + HALF_OPEN_AFTER_MS).toISOString();
}

/**
 * 熔断状态：`closed` / `open` / `half_open`（**不是** source-health 的 status 枚举）。
 *
 * @param {object|null} row source-health 的一行
 * @param {Date|string} now 由调用方注入
 */
function circuitState(row, now = new Date()) {
  const at = pausedAtOf(row);
  if (!at) return CIRCUIT_STATE.closed;
  const elapsed = new Date(now).getTime() - new Date(at).getTime();
  if (!Number.isFinite(elapsed) || elapsed < 0) return CIRCUIT_STATE.open;
  return elapsed >= HALF_OPEN_AFTER_MS ? CIRCUIT_STATE.half_open : CIRCUIT_STATE.open;
}

/** 本轮是否应跳过该来源：只有 open 跳过；half_open 放行一次（确定性半开重试） */
function shouldSkipPaused(row, now = new Date()) {
  return circuitState(row, now) === CIRCUIT_STATE.open;
}

/** 熔断原因（写入 source-health.json 的 pausedReason；人读一句话 + 机器前缀） */
function circuitOpenReason(failures, lastError = null) {
  const oneLine = String(lastError || '').split('\n')[0].slice(0, 160);
  return `${CIRCUIT_OPEN_REASON_PREFIX}: 连续失败 ${failures} 次${oneLine ? `（最近错误：${oneLine}）` : ''}`;
}

/**
 * 抛错路径的暂停字段：
 *   · 未到阈值 ⇒ 不暂停（null）；
 *   · 到阈值   ⇒ 写 pausedAt + pausedReason。**半开重试再失败会走到这里**，
 *     于是 pausedAt 被刷新为本次失败时间 ⇒ 窗口重新计时（确定性：每 N 天最多 1 次重试）。
 */
function pauseFieldsAfterFailure(at, { failures, lastError = null }) {
  if (failures < CIRCUIT_FAILURE_THRESHOLD) return { pausedAt: null, pausedReason: null };
  return { pausedAt: at, pausedReason: circuitOpenReason(failures, lastError) };
}

/**
 * 暂停态的**唯一文案**（/status/、collect Summary、coverage 报告共用这一份，
 * 避免三处各写一句、迟早漂移）。时间一律绝对北京时间 —— 构建确定性要求不读墙上时钟。
 */
function pausedLabel(row, { reasonLimit = 120 } = {}) {
  if (!isPaused(row)) return '';
  const reason = pausedReasonOf(row);
  const clipped = reason && reason.length > reasonLimit ? `${reason.slice(0, reasonLimit)}…` : reason;
  const parts = [
    '⏸ 已暂停（熔断）',
    `暂停于 ${formatCN(pausedAtOf(row))}`,
    `半开重试窗口 ${formatCN(halfOpenAt(row))}`
  ];
  if (clipped) parts.push(clipped);
  return parts.join(' · ');
}

module.exports = {
  HEALTH_FILE,
  SCHEMA_VERSION,
  ZERO_OUTPUT_FAIL_AFTER,
  SHARP_DROP_RATIO,
  CIRCUIT_FAILURE_THRESHOLD,
  HALF_OPEN_AFTER_DAYS,
  HALF_OPEN_AFTER_MS,
  CIRCUIT_STATE,
  CIRCUIT_OPEN_REASON_PREFIX,
  HEADLESS_UNAVAILABLE_ERROR,
  STATUS,
  STATUS_LABEL,
  REASON_LABEL,
  emptyDoc,
  load,
  write,
  headlessReady,
  attemptsFromReport,
  evaluate,
  build,
  summarize,
  relativeTime,
  formatCN,
  pausedAtOf,
  pausedReasonOf,
  isPaused,
  halfOpenAt,
  circuitState,
  shouldSkipPaused,
  circuitOpenReason,
  pausedLabel
};
