/**
 * v1.4 优惠历史（append-only change event log）。
 *
 * ## 这一层要回答的六个问题
 *
 *   ① 首次发现        → `created` 事件（`at`）
 *   ② 免费额度变化    → `benefit_changed`
 *   ③ 新增截止日期    → `expiry_changed`（`from === null`）
 *   ④ 领取条件变化    → `eligibility_changed`
 *   ⑤ 从官方页面消失  → `ended`（带 `reason`，措辞只说「来源不再列出」）
 *   ⑥ 消失后重现      → `ended` → `restored` 成对
 *
 * ## 为什么是「显式事件 + 一次性基线」，而不是每日快照或 git diff
 *
 * 四方案（A 每日快照 / B git diff / C 显式事件 / D 混合）的逐步比较写在
 * `docs/SCHEMA-v1.4.md`。结论：**C 是唯一运行时存储，加一份一次性值基线使
 * 「基线 + 事件 ⇒ 当前状态」可被机器重放验证**（纯 C 没有任何锚点，日志被手改
 * 不会有东西变红）；B 的「git 是审计日志」这个洞见被保留为一个**离线**工具
 * （`scripts/tools/history-audit.js`），刻意不进 CI —— CI 默认浅克隆，且本仓
 * 有过历史重写，它只配当交叉证据。
 *
 * 体积对比（实测，见报告）：每日全量快照 = `deals.json` 236 KB × 2/天 ≈ 170 MB/年；
 * 本方案 = 一次性基线约 60 KB + 只记变化（当前数据规模约 KB/年）。
 *
 * ## 三条纪律
 *
 * 1. **只记「重要字段」的变化**。`description` 文案微调、`lastSeen` 每日刷新、
 *    `zh` 译文更新**一律不产生事件** —— 否则历史会被噪音淹掉，等于没有历史。
 *    重要字段表见 `TRACKED_FIELDS`，理由逐条写在旁边。
 * 2. **不伪造历史**。存量 134 条在 v1.4 之前没有历史，所以只有一份
 *    `baseline`（明确标注「不是创建事件」），一条 `created` 都不会补。
 *    页面必须如实说「变更记录自 … 起」。
 * 3. **超限是门禁红，不自动截断**。静默丢历史比没有历史更糟；上限见 `LIMITS`。
 *
 * ## 写入点只有一个
 *
 * `scripts/collect.js` 在 `mergeAll` 之后、与 `writeDeals` 同批调用 `record()`。
 * dry-run / `--only` 子集 / 被硬拦（译文不合规、零产出）的运行**不写历史** ——
 * 否则一次子集运行会把其余来源的条目整片误判成「消失」。
 */

const fs = require('fs');
const path = require('path');
const { CURATED_SOURCES } = require('./provenance');

const HISTORY_FILE = path.join(__dirname, '..', 'data', 'deal-history.json');
const SCHEMA_VERSION = 1;

/* ------------------------------------------------------------------ */
/* 重要字段（唯一真值表）                                               */
/* ------------------------------------------------------------------ */

/**
 * 事件分类 → 字段。**顺序即序列化顺序**（基线与事件的 key 顺序必须确定，
 * 否则同一份状态两次写入的字节不同，diff 失去意义）。
 */
const FIELD_EVENT = {
  // 优惠内容 / 力度：读者最关心的那一类
  discountInfo: 'benefit_changed',
  pricingModel: 'benefit_changed',
  priceLine: 'benefit_changed',
  features: 'benefit_changed',
  // v1.1 优惠类型（free_api / free_credits / student_plan …）
  benefitType: 'benefit_changed',
  // 领取条件：原文条件 + v1.1 三态明细
  eligibility: 'eligibility_changed',
  eligibilityDetail: 'eligibility_changed',
  claimRequirements: 'eligibility_changed',
  audience: 'eligibility_changed',
  availability: 'eligibility_changed',
  // 有效期
  expiresAt: 'expiry_changed',
  validity: 'expiry_changed',
  // 记录层面的重要变化（不是优惠本身，但会影响读者判断）
  type: 'updated',        // deal ⇄ tool 的重分类
  category: 'updated',
  region: 'updated',
  source: 'updated',      // 收录来源换了
  sourceUrl: 'updated',   // 原始出处换了
  evidence: 'updated',    // 人工补/改官方引文
  verified: 'updated',    // 人工核验声明
  verifiedAt: 'updated'
};

const TRACKED_FIELDS = Object.keys(FIELD_EVENT);

/**
 * 明确**不**跟踪的字段与理由。这张表是给后来人看的：少一个字段时先看这里，
 * 别急着往 `FIELD_EVENT` 里加（`history-selftest` 有一条专门的噪音夹具盯着）。
 */
const UNTRACKED_FIELDS = {
  description: '普通文案微调 —— 本阶段点名要避免的噪音源',
  lastSeen: '每轮采集都会刷新（策展条目每轮刷成今天），记它等于每天造 32 条假事件',
  firstSeen: '由 created 事件回答；它是簿记，不是「变化」',
  id: '身份的一部分（id = sha1(vendor|title|url)），变了就是另一条记录 ⇒ ended + created',
  title: '身份的一部分（见 id）',
  vendor: '身份的一部分（见 id）',
  url: '身份的一部分（见 id）',
  zh: '人工译文是展示层覆盖，不是优惠本身',
  needs: '构建期派生字段，源数据里不存在',
  collections: '构建期派生字段，源数据里不存在',
  sourceFacts: '构建期派生字段，源数据里不存在',
  history: '构建期派生字段，源数据里不存在'
};

const EVENT_TYPES = ['created', 'updated', 'benefit_changed', 'eligibility_changed', 'expiry_changed', 'ended', 'restored'];
/** 生命周期事件（不带 field / from / to） */
const LIFECYCLE_TYPES = ['created', 'ended', 'restored'];
/** 字段事件的类型集合 */
const FIELD_TYPES = EVENT_TYPES.filter(type => !LIFECYCLE_TYPES.includes(type));

const END_REASONS = [
  'source_no_longer_lists', // 连续多次成功采集未见该条目
  'pruned_expired',         // 过期下架（见 store.prune）
  'pruned_overflow',        // 超出收录上限（见 store.prune）
  'retired_garbage',        // 判定为无效数据后退役（见 store.mergeAll）
  'withdrawn'               // 其它移除路径（保留位；当前极少出现）
];

/** 连续多少次「来源健康且确实跑出条目」的采集未见它，才记 ended（两次/天 ⇒ 约 1 天） */
const MISS_CONFIRM_RUNS = 2;

/** 事件来源：observed = 直接观测到的新值；derived = 由本站规则推导出来的值 */
const EVENT_ORIGINS = ['observed', 'derived'];

/**
 * 上限。**超限 = 门禁红**，绝不自动截断（静默丢历史比没有历史更糟）。
 * 数值按实测设定并留足余量，实测值写进报告。
 */
const LIMITS = {
  eventsPerDeal: 200,
  eventsTotal: 20000,
  fileBytes: 1024 * 1024
};

/** 渲染层：一条记录最多注入多少条事件（全量仍在 deal-history.json 里） */
const RENDER_LIMIT = 20;

/** 观测状态（absence）保留窗口：已 ended 且离开数据集超过这么多天的条目不再保留观测态 */
const ABSENCE_RETENTION_DAYS = 365;

const HISTORY_WORDING = {
  HISTORY_LABELS: {
    sectionTitle: '变更记录',
    empty: '暂无变更记录',
    since: '变更记录自 {date} 起（此前状态没有记录）',
    more: '另有 {n} 条更早的记录未在此显示',
    from: '原',
    to: '新'
  },
  HISTORY_TYPES: {
    created: '首次收录',
    updated: '信息更新',
    benefit_changed: '优惠内容变化',
    eligibility_changed: '领取条件变化',
    expiry_changed: '有效期变化',
    ended: '不再收录',
    restored: '重新出现'
  },
  HISTORY_END_REASONS: {
    source_no_longer_lists: '来源不再列出（连续多次成功采集未见）',
    pruned_expired: '过期下架',
    pruned_overflow: '超出收录上限',
    retired_garbage: '判定为无效数据后退役',
    withdrawn: '已移除'
  },
  HISTORY_FIELD_LABELS: {
    discountInfo: '优惠说明',
    pricingModel: '计费模式',
    priceLine: '价格阶梯',
    features: '特性标签',
    benefitType: '优惠类型',
    eligibility: '适用条件',
    eligibilityDetail: '领取资格',
    claimRequirements: '领取要求',
    audience: '适用人群',
    availability: '可用性',
    expiresAt: '截止日期',
    validity: '有效期说明',
    type: '记录类型',
    category: '分类',
    region: '地区',
    source: '收录来源',
    sourceUrl: '原始出处',
    evidence: '官方原文片段',
    verified: '人工核验声明',
    verifiedAt: '人工核验日期'
  },
  HISTORY_NOTES: {
    derived: '（由本站规则推导）',
    lifecycle: '本条记录的生命周期事件',
    emptyNote: '起算日之前的状态没有历史记录，因此这里不显示任何变化。',
    disclaimer: '以上是本站采集与合并过程留下的观测记录；「不再收录」表示本站未再观测到该条目，不表示厂商已经下架或优惠已经失效。最终以厂商官方页面为准。'
  }
};

/* ------------------------------------------------------------------ */
/* 值归一                                                               */
/* ------------------------------------------------------------------ */

/** 缺字段与 null 同义（v1.1 六字段「只挂有值的」） */
function normValue(value) {
  return value === undefined ? null : value;
}

/**
 * 确定性序列化：对象 key 排序。事件链的「值是否相同」全部走这一把尺子，
 * 因此事件的 `from` / `to` 与基线值可以逐字节比较。
 */
function stableJson(value) {
  const v = normValue(value);
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`;
  return `{${Object.keys(v).sort().map(key => `${JSON.stringify(key)}:${stableJson(v[key])}`).join(',')}}`;
}

function sameValue(a, b) {
  return stableJson(a) === stableJson(b);
}

/** 一条记录里被跟踪字段的当前值（缺席 → null；只保留有值的，基线因此不写一堆 null） */
function trackedValuesOf(deal) {
  const out = {};
  for (const field of TRACKED_FIELDS) {
    const value = normValue(deal ? deal[field] : null);
    if (value !== null) out[field] = value;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 读取 / 写入                                                          */
/* ------------------------------------------------------------------ */

const BASELINE_NOTE = 'v1.4 开工时的既有状态快照（只含被跟踪字段）。它不是创建事件——这些记录更早就存在，只是此前没有历史。';

function emptyStore({ at = null } = {}) {
  return { schemaVersion: SCHEMA_VERSION, startedAt: at, baseline: { at, note: BASELINE_NOTE, fields: {} }, absence: {}, events: [] };
}
/**
 * 读取历史文件。
 * **不存在或损坏时不抛**：采集不该因为一份历史文件写坏就跑不动；
 * 损坏由 `check:history` 门禁拦（采集侧只告警）。
 */
function load(file = HISTORY_FILE) {
  if (!fs.existsSync(file)) return { store: emptyStore(), file, missing: true, broken: null };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { store: emptyStore(), file, missing: false, broken: '不是 JSON 对象' };
    }
    return { store: parsed, file, missing: false, broken: null };
  } catch (error) {
    return { store: emptyStore(), file, missing: false, broken: error.message };
  }
}

/** 写盘。key 顺序固定，`events` 追加式；无事发生的运行必须字节不变 */
function save(store, file = HISTORY_FILE) {
  fs.writeFileSync(file, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
  return store;
}

/** 从一批当前记录构造基线（一次性；只在 v1.4 开工时由 `history-baseline` 生成） */
function baselineOf(deals, { at, note = BASELINE_NOTE } = {}) {
  const fields = {};
  for (const deal of deals || []) {
    if (!deal || !deal.id) continue;
    const values = trackedValuesOf(deal);
    if (Object.keys(values).length) fields[deal.id] = values;
  }
  const sorted = {};
  for (const id of Object.keys(fields).sort()) sorted[id] = fields[id];
  return { at, note, fields: sorted };
}

/* ------------------------------------------------------------------ */
/* 重放（基线 + 事件 ⇒ 当前状态）                                       */
/* ------------------------------------------------------------------ */

/**
 * 重放整份日志，得到每条记录每个被跟踪字段的**当前值**。
 * 链上的每一步都约束住，因此「日志被手改」一定会与 deals.json 对不上。
 *
 * @returns {Map<string, object>} id → { field: value }
 */
function replay(store) {
  const state = new Map();
  const fields = (store && store.baseline && store.baseline.fields) || {};
  for (const id of Object.keys(fields)) state.set(id, { ...fields[id] });
  for (const event of eventsOf(store)) {
    if (!state.has(event.id)) state.set(event.id, {});
    const current = state.get(event.id);
    if (event.type === 'created') {
      const snapshot = event.fields && typeof event.fields === 'object' ? event.fields : {};
      state.set(event.id, { ...snapshot });
      continue;
    }
    if (event.type === 'ended' || event.type === 'restored') continue;
    if (event.to === null || event.to === undefined) delete current[event.field];
    else current[event.field] = event.to;
  }
  return state;
}

/** 由日志重建一条记录某个字段的当前值（缺席 → null） */
function replayedValue(store, id, field) {
  const all = replay(store);
  const rec = all.get(id);
  return rec && Object.prototype.hasOwnProperty.call(rec, field) ? rec[field] : null;
}

/** 一条记录最近一次生命周期事件（created / ended / restored） */
function lastLifecycleOf(store, id) {
  let last = null;
  for (const event of eventsOf(store)) {
    if (event.id !== id) continue;
    if (LIFECYCLE_TYPES.includes(event.type)) last = event;
  }
  return last;
}

function eventsOf(store) {
  return store && Array.isArray(store.events) ? store.events : [];
}

/* ------------------------------------------------------------------ */
/* 差异计算                                                             */
/* ------------------------------------------------------------------ */

function indexById(deals) {
  const map = new Map();
  for (const deal of deals || []) if (deal && deal.id) map.set(deal.id, deal);
  return map;
}

/** 事件排序键：生命周期在前（created 最先），字段事件按 TRACKED_FIELDS 顺序 */
function eventRank(event) {
  if (event.type === 'created') return 0;
  if (event.type === 'restored') return 1;
  if (event.type === 'ended') return 2;
  const at = TRACKED_FIELDS.indexOf(event.field);
  return 10 + (at < 0 ? TRACKED_FIELDS.length : at);
}

function sortEvents(events) {
  return [...events].sort((a, b) => {
    if (a.id !== b.id) return a.id < b.id ? -1 : 1;
    const ra = eventRank(a);
    const rb = eventRank(b);
    if (ra !== rb) return ra - rb;
    const fa = a.field || '';
    const fb = b.field || '';
    return fa < fb ? -1 : fa > fb ? 1 : 0;
  });
}

/**
 * 纯差异：给定「上一份发布状态」与「这一份发布状态」，算出候选事件。
 * **不读盘、不看 store** —— 上一份状态里已经消失的记录由调用方通过 `removed` 传入。
 *
 * @param {object[]} previous 上一份 deals.json 的记录（已发布）
 * @param {object[]} next     本次合并后的记录
 * @param {object}   ctx      { at, originFields?:Set<string>, createdById?:Map<string,object> }
 * @returns {object[]} 候选事件（未去重、未排序）
 */
function diffStates(previous, next, ctx = {}) {
  const at = ctx.at;
  const before = indexById(previous);
  const originFields = ctx.originFields instanceof Set ? ctx.originFields : new Set();
  const events = [];
  for (const deal of next || []) {
    if (!deal || !deal.id) continue;
    const prev = before.get(deal.id);
    if (!prev) {
      // 新记录：created 事件同时充当它自己的基线（否则「创建后再没变过」的字段没有锚点）
      events.push({ id: deal.id, at, type: 'created', field: null, from: null, to: null, fields: trackedValuesOf(deal) });
      continue;
    }
    for (const field of TRACKED_FIELDS) {
      const from = normValue(prev[field]);
      const to = normValue(deal[field]);
      if (sameValue(from, to)) continue;
      const type = FIELD_EVENT[field];
      if (!FIELD_TYPES.includes(type)) continue;
      events.push({
        id: deal.id, at, type, field, from, to,
        origin: originFields.has(field) ? 'derived' : 'observed'
      });
    }
  }
  return sortEvents(events);
}

/* ------------------------------------------------------------------ */
/* 记录（唯一入口）                                                     */
/* ------------------------------------------------------------------ */

/**
 * 把一次采集的观测结果并进历史日志。
 *
 * **纯函数**：同样的 `(store, inputs)` 一定产出同一份 store（自测有夹具）；
 * 输入里的 `store` 不会被修改。
 *
 * @param {object} store   当前历史文档
 * @param {object} params
 * @param {object[]} params.previous 上一份 deals.json
 * @param {object[]} params.next     本次合并结果
 * @param {string}  params.at       北京时间 YYYY-MM-DD
 * @param {string}  params.runAt    本次运行的 ISO 时间戳（精度审计用）
 * @param {Iterable<string>} [params.freshIds] 本次采集器真的产出过的 id
 * @param {Iterable<string>} [params.absenceEligibleSources] 允许参与「未见」计数的来源名
 *        （= 本轮健康且确实跑出条目的来源；失败/骤降/零产出的来源一律不计，
 *         否则一次坏采集会把整片条目误判成「消失」）
 * @param {Map<string,string>} [params.removed] 本份发布里消失的 id → reason
 * @param {Set<string>} [params.derivedFields] 本轮由规则推导（而非直接观测）的字段
 * @returns {{store:object, stats:object}}
 */
function record(store, params = {}) {
  const base = normalizeStore(store);
  const at = params.at;
  const runAt = params.runAt || null;
  const previous = params.previous || [];
  const next = params.next || [];
  const freshIds = new Set(params.freshIds || []);
  const eligible = new Set(params.absenceEligibleSources || []);
  const removed = params.removed instanceof Map ? params.removed : new Map();

  const replayState = replay(base);
  const lifecycle = new Map(); // id → 最后一次生命周期事件类型
  for (const event of eventsOf(base)) if (LIFECYCLE_TYPES.includes(event.type)) lifecycle.set(event.id, event.type);

  const candidates = [];
  const seen = new Set();          // 幂等去重（同一份输入重复调用不重复追加）
  for (const event of eventsOf(base)) seen.add(eventKey(event));

  // ---- ① 新增 / 字段变化 ------------------------------------------------
  for (const event of diffStates(previous, next, { at, originFields: params.derivedFields })) {
    if (event.type === 'created') {
      // 历史已经认识它（基线或既有事件）→ 不是创建，交给下面的 restored 分支
      if (replayState.has(event.id) || lifecycle.has(event.id)) continue;
      candidates.push(withRun(event, runAt));
      continue;
    }
    // 链校验：只有当记录的当前值确实等于 from、且 to 还不等于当前值时才是新变化。
    // 这条同时保证了「重复调用 record 同一份输入」不会追加第二条。
    const current = replayedValueFrom(replayState, event.id, event.field);
    if (sameValue(current, event.to)) continue;      // 已经是这个值了
    if (!sameValue(current, event.from)) continue;   // 链对不上（数据被外部改过）→ 不猜，门禁去报
    candidates.push(withRun(event, runAt));
  }

  // ---- ② 消失了又出现 ----------------------------------------------------
  const beforeIds = new Set(indexById(previous).keys());
  for (const deal of next) {
    if (!deal || !deal.id) continue;
    if (beforeIds.has(deal.id)) continue;                       // 一直都在
    if (!lifecycle.has(deal.id)) continue;                      // 全新记录已由 created 处理
    if (lifecycle.get(deal.id) !== 'ended') continue;           // 没结束过
    candidates.push({ id: deal.id, at, type: 'restored', field: null, from: null, to: null, runAt });
    // 重现后，字段若与离开时不同，按链补字段事件（from = 链上的旧值）
    for (const field of TRACKED_FIELDS) {
      const current = replayedValueFrom(replayState, deal.id, field);
      const to = normValue(deal[field]);
      if (sameValue(current, to)) continue;
      candidates.push({
        id: deal.id, at, type: FIELD_EVENT[field], field, from: current, to,
        origin: (params.derivedFields instanceof Set && params.derivedFields.has(field)) ? 'derived' : 'observed'
      });
    }
  }

  // ---- ③ 本份发布里消失的记录 -------------------------------------------
  const nextIds = new Set(next.map(deal => deal && deal.id).filter(Boolean));
  for (const id of beforeIds) {
    if (nextIds.has(id)) continue;
    if (lifecycle.get(id) === 'ended') continue;                 // 已经记过
    const reason = removed.get(id) || 'withdrawn';
    candidates.push({ id, at, type: 'ended', field: null, from: null, to: null, reason, runAt });
  }

  // ---- ④ 来源不再列出（连续多次成功采集未见）-----------------------------
  const absence = { ...(base.absence || {}) };
  const absentEvents = [];
  for (const deal of next) {
    if (!deal || !deal.id) continue;
    const source = deal.source || '';
    const curated = CURATED_SOURCES.includes(source);
    const state = absence[deal.id];
    const eligibleSource = eligible.has(source);
    const seenThisRun = freshIds.has(deal.id);

    if (curated || seenThisRun) {
      // 见过 → 清掉观测态。若此前已经记过 ended，则这一次是「重新出现」。
      if (state && state.endedAt && lifecycle.get(deal.id) === 'ended') {
        absentEvents.push({ id: deal.id, at, type: 'restored', field: null, from: null, to: null, runAt });
      }
      if (state) delete absence[deal.id];
      continue;
    }
    if (!eligibleSource) continue;               // 来源本轮不可信 → 不推进、不清除
    if (state && state.endedAt) continue;        // 已经记过 ended，不再重复计数
    const misses = (state && state.misses ? state.misses : 0) + 1;
    const since = (state && state.since) || at;
    if (misses >= MISS_CONFIRM_RUNS) {
      absentEvents.push({
        id: deal.id, at, type: 'ended', field: null, from: null, to: null,
        reason: 'source_no_longer_lists', firstMissedAt: since, runAt
      });
      absence[deal.id] = { source, misses, since, endedAt: at };
    } else {
      absence[deal.id] = { source, misses, since, endedAt: null };
    }
  }
  candidates.push(...absentEvents);

  // ---- ⑤ 消失的记录：观测态也要标成 ended（便于日后 restored）------------
  for (const event of candidates) {
    if (event.type !== 'ended') continue;
    const prior = absence[event.id];
    absence[event.id] = {
      source: prior && prior.source ? prior.source : (indexById(previous).get(event.id) || {}).source || '',
      misses: prior && prior.misses ? prior.misses : 0,
      since: (prior && prior.since) || at,
      endedAt: at
    };
  }

  // ---- ⑥ 落库：去重、排序、裁剪观测态 ------------------------------------
  const appended = [];
  for (const event of sortEvents(candidates)) {
    const key = eventKey(event);
    if (seen.has(key)) continue;
    seen.add(key);
    appended.push(event);
  }
  const events = [...eventsOf(base), ...appended];
  const absenceNext = pruneAbsence(absence, { nextIds, at });

  const out = {
    ...base,
    baseline: base.baseline,
    absence: absenceNext,
    events
  };

  return { store: out, stats: statsOf(appended, { absenceNext }) };
}

function replayedValueFrom(stateMap, id, field) {
  const rec = stateMap.get(id);
  return rec && Object.prototype.hasOwnProperty.call(rec, field) ? rec[field] : null;
}

function withRun(event, runAt) {
  return runAt ? { ...event, runAt } : event;
}

function eventKey(event) {
  return [event.id, event.type, event.field || '', event.at,
    stableJson(event.from), stableJson(event.to), event.reason || '',
    event.type === 'created' ? stableJson(event.fields || {}) : ''].join('\u0000');
}

function statsOf(events, { absenceNext } = {}) {
  const byType = {};
  for (const type of EVENT_TYPES) byType[type] = 0;
  for (const event of events) byType[event.type] = (byType[event.type] || 0) + 1;
  return { appended: events.length, byType, absenceTracked: Object.keys(absenceNext || {}).length };
}

/** 观测态保留窗口：已 ended 且离开数据集超过一年的条目不再保留（避免无限增长） */
function pruneAbsence(absence, { nextIds, at }) {
  const out = {};
  for (const id of Object.keys(absence).sort()) {
    const state = absence[id];
    if (!state) continue;
    if (state.endedAt && !nextIds.has(id) && daysBetween(at, state.endedAt) > ABSENCE_RETENTION_DAYS) continue;
    out[id] = state;
  }
  return out;
}

function daysBetween(later, earlier) {
  const a = new Date(`${later}T00:00:00Z`).getTime();
  const b = new Date(`${earlier}T00:00:00Z`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((a - b) / 86400000);
}

/** 归一 store：缺段补齐、非法值回落（只清洗，报错交给 verifyStore） */
function normalizeStore(store) {
  const base = emptyStore({ at: (store && store.startedAt) || null });
  if (!store || typeof store !== 'object') return base;
  return {
    schemaVersion: SCHEMA_VERSION,
    startedAt: typeof store.startedAt === 'string' ? store.startedAt : null,
    baseline: store.baseline && typeof store.baseline === 'object'
      ? {
        at: typeof store.baseline.at === 'string' ? store.baseline.at : null,
        note: typeof store.baseline.note === 'string' ? store.baseline.note : BASELINE_NOTE,
        fields: store.baseline.fields && typeof store.baseline.fields === 'object' && !Array.isArray(store.baseline.fields)
          ? store.baseline.fields : {}
      }
      : base.baseline,
    absence: store.absence && typeof store.absence === 'object' && !Array.isArray(store.absence) ? store.absence : {},
    events: Array.isArray(store.events) ? store.events : []
  };
}

/* ------------------------------------------------------------------ */
/* 校验：链完整性 + 与当前状态一致                                      */
/* ------------------------------------------------------------------ */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[0-9a-f]{12}$/;

/**
 * 逐项校验历史文档与当前记录。返回问题清单（空 = 通过）。
 *
 * 四类问题分开，因为红的含义不同：
 *   ① 形状   —— 字段非法 / 未知字段 / 未知事件类型
 *   ② 链     —— 同一 (id, field) 上 `to` 与下一条 `from` 必须相等；生命周期必须成对
 *   ③ 一致   —— **基线 + 事件重放**的结果必须等于当前 `deals.json`
 *   ④ 上限   —— 事件数 / 文件体积
 *
 * 为什么 ③ 是本层的核心：「日志与当前状态一致」如果不可验证，日志就是一段自说自话的文本。
 */
function verifyStore(store, deals, { today = null, bytes = null } = {}) {
  const problems = [];
  const doc = store;
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return ['历史文档不是 JSON 对象'];
  if (doc.schemaVersion !== SCHEMA_VERSION) problems.push(`schemaVersion 应为 ${SCHEMA_VERSION}，实得 ${doc.schemaVersion}`);
  if (!DATE_RE.test(String(doc.startedAt || ''))) problems.push(`startedAt 缺失或非法（${doc.startedAt}）`);
  if (!doc.baseline || !DATE_RE.test(String(doc.baseline.at || ''))) problems.push('baseline.at 缺失或非法');
  if (!doc.baseline || typeof doc.baseline.fields !== 'object' || Array.isArray(doc.baseline.fields)) {
    problems.push('baseline.fields 不是对象');
  }

  const events = eventsOf(doc);
  const perDeal = new Map();
  const allIds = new Set();
  events.forEach((event, index) => {
    const where = `事件 #${index}`;
    if (!event || typeof event !== 'object') { problems.push(`${where}: 不是对象`); return; }
    if (!ID_RE.test(String(event.id || ''))) problems.push(`${where}: id 非法（${event.id}）`);
    if (!DATE_RE.test(String(event.at || ''))) problems.push(`${where}: at 非法（${event.at}）`);
    if (today && DATE_RE.test(String(event.at || '')) && String(event.at) > today) {
      problems.push(`${where}: at 是未来日期（${event.at}）`);
    }
    if (!EVENT_TYPES.includes(event.type)) { problems.push(`${where}: 未知事件类型（${event.type}）`); return; }
    if (LIFECYCLE_TYPES.includes(event.type)) {
      if (event.field !== null && event.field !== undefined) problems.push(`${where}: ${event.type} 不应带 field`);
      if (event.from !== null && event.from !== undefined) problems.push(`${where}: ${event.type} 不应带 from`);
      if (event.to !== null && event.to !== undefined) problems.push(`${where}: ${event.type} 不应带 to`);
      if (event.type === 'ended' && !END_REASONS.includes(event.reason)) problems.push(`${where}: ended 的 reason 非法（${event.reason}）`);
      if (event.type === 'created' && (event.fields === null || typeof event.fields !== 'object' || Array.isArray(event.fields))) {
        problems.push(`${where}: created 必须带 fields（它同时是这条记录的基线锚点）`);
      }
      for (const key of Object.keys(event.fields || {})) {
        if (!TRACKED_FIELDS.includes(key)) problems.push(`${where}: created.fields 含未跟踪字段 ${key}`);
      }
      if (event.type !== 'ended' && event.reason !== undefined) problems.push(`${where}: ${event.type} 不应带 reason`);
    } else {
      if (!TRACKED_FIELDS.includes(event.field)) { problems.push(`${where}: 未跟踪字段（${event.field}）`); return; }
      if (FIELD_EVENT[event.field] !== event.type) {
        problems.push(`${where}: ${event.field} 的事件类型应为 ${FIELD_EVENT[event.field]}，实得 ${event.type}`);
      }
      if (!('from' in event) || !('to' in event)) problems.push(`${where}: 字段事件必须同时带 from 与 to`);
      else if (sameValue(event.from, event.to)) problems.push(`${where}: 字段事件的 from 与 to 相同（那不是一个变化）`);
      if (event.origin !== undefined && !EVENT_ORIGINS.includes(event.origin)) {
        problems.push(`${where}: origin 非法（${event.origin}）`);
      }
      if (event.reason !== undefined) problems.push(`${where}: 字段事件不应带 reason`);
    }
    allIds.add(event.id);
    if (!perDeal.has(event.id)) perDeal.set(event.id, []);
    perDeal.get(event.id).push(event);
  });

  // ② 链完整性 + 生命周期成对
  const lifecycleState = new Map(); // id → 最后一次生命周期事件类型
  for (const [id, list] of perDeal) {
    const fieldState = new Map();
    const baseFields = (doc.baseline && doc.baseline.fields && doc.baseline.fields[id]) || {};
    for (const field of TRACKED_FIELDS) {
      fieldState.set(field, Object.prototype.hasOwnProperty.call(baseFields, field) ? baseFields[field] : null);
    }
    let created = false;
    let ended = false;
    for (const event of list) {
      if (event.type === 'created') {
        created = true;
        for (const field of TRACKED_FIELDS) {
          const snapshot = event.fields || {};
          fieldState.set(field, Object.prototype.hasOwnProperty.call(snapshot, field) ? snapshot[field] : null);
        }
        continue;
      }
      if (event.type === 'ended') {
        if (ended) problems.push(`${id}: 连续两个 ended 之间没有 restored`);
        ended = true;
        continue;
      }
      if (event.type === 'restored') {
        if (!ended) problems.push(`${id}: restored 之前没有 ended`);
        ended = false;
        continue;
      }
      const current = fieldState.get(event.field);
      if (!sameValue(current, event.from)) {
        problems.push(`${id} · ${event.field}: 链断裂（上一步是 ${short(current)}，事件的 from 是 ${short(event.from)}）`);
      }
      fieldState.set(event.field, event.to === undefined ? null : event.to);
    }
    lifecycleState.set(id, ended ? 'ended' : created ? 'created' : null);
  }

  // ②′ 覆盖「只有基线、没有事件」的 id：从 deals.json 消失却没有 ended 也要红。
  // 只查 perDeal 会漏掉它们 —— 而它们恰恰是最容易被静默删掉的一批。
  const baselineIds = Object.keys((doc.baseline && doc.baseline.fields) || {});
  const knownIds = new Set([...baselineIds, ...allIds]);
  const dealIds = new Set((deals || []).map(deal => deal && deal.id).filter(Boolean));
  for (const id of knownIds) {
    if (dealIds.has(id)) continue;
    if (lifecycleState.get(id) === 'ended') continue;
    problems.push(`${id}: 已从 deals.json 消失，但日志里没有对应的 ended 事件`);
  }

  for (const id of knownIds) {
    const list = perDeal.get(id) || [];
    const baseFields = (doc.baseline && doc.baseline.fields && doc.baseline.fields[id]) || {};
    const hasCreated = list.some(event => event.type === 'created');
    const deal = (deals || []).find(item => item && item.id === id);
    if (!deal) continue; // 不在数据集里的由上一段负责
    if (!hasCreated && Object.keys(baseFields).length === 0) {
      problems.push(`${id}: 记录没有历史锚点（既不在基线里，也没有 created 事件）`);
      continue;
    }
    // ③ 与当前状态一致（记录仍在数据集里就必须逐字段对上，`ended` 只表示来源不再列出）
    const fieldState = new Map();
    for (const field of TRACKED_FIELDS) {
      fieldState.set(field, Object.prototype.hasOwnProperty.call(baseFields, field) ? baseFields[field] : null);
    }
    for (const event of list) {
      if (event.type === 'created') {
        for (const field of TRACKED_FIELDS) {
          const snapshot = event.fields || {};
          fieldState.set(field, Object.prototype.hasOwnProperty.call(snapshot, field) ? snapshot[field] : null);
        }
      } else if (event.type === 'ended' || event.type === 'restored') {
        continue;
      } else {
        fieldState.set(event.field, event.to === undefined ? null : event.to);
      }
    }
    for (const field of TRACKED_FIELDS) {
      const expected = normValue(deal[field]);
      const actual = fieldState.has(field) ? fieldState.get(field) : null;
      if (!sameValue(expected, actual)) {
        problems.push(`${id} · ${eventFieldLabel(field)}: 现状与历史不一致（文件 ${short(expected)} / 日志 ${short(actual)}）`);
      }
    }
  }

  // 每条当前记录都必须有锚点（基线 / created）——否则历史对它是空的，
  // 而页面会把它渲染成「暂无变更记录」，等于用「没记录」冒充「没变化」。
  for (const deal of deals || []) {
    if (!deal || !deal.id) continue;
    if (!knownIds.has(deal.id)) {
      problems.push(`${deal.id}: 记录没有历史锚点（既不在基线里，也没有 created 事件）`);
    }
  }

  // ④ 上限
  if (events.length > LIMITS.eventsTotal) problems.push(`事件总数 ${events.length} 超过上限 ${LIMITS.eventsTotal}（不自动截断，需人工处置）`);
  for (const [id, list] of perDeal) {
    if (list.length > LIMITS.eventsPerDeal) problems.push(`${id}: 事件 ${list.length} 条超过单条上限 ${LIMITS.eventsPerDeal}`);
  }
  if (Number.isFinite(bytes) && bytes > LIMITS.fileBytes) {
    problems.push(`历史文件 ${bytes} 字节超过上限 ${LIMITS.fileBytes}`);
  }
  return problems;
}

function short(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (text === undefined) return 'null';
  return text.length > 40 ? `${text.slice(0, 37)}…` : text;
}

function eventFieldLabel(field) {
  return HISTORY_WORDING.HISTORY_FIELD_LABELS[field] || field;
}

/* ------------------------------------------------------------------ */
/* 渲染视图（构建期注入 dist）                                          */
/* ------------------------------------------------------------------ */

/**
 * 一条记录的有界历史视图，供 RENDER-CORE 渲染。
 * **只进 dist**：源 `deals.json` 里没有这个字段（`validateDeal` 的白名单会拒）。
 *
 * @returns {object|null} 无任何事件时返回 null（页面说「暂无变更记录」，不注入空对象）
 */
function historyFor(store, id, { limit = RENDER_LIMIT } = {}) {
  const events = eventsOf(store).filter(event => event.id === id);
  if (!events.length) return null;
  const total = events.length;
  const shown = events.slice(-limit).map(event => ({
    at: event.at,
    type: event.type,
    field: event.field === undefined ? null : event.field,
    from: 'from' in event ? event.from : undefined,
    to: 'to' in event ? event.to : undefined,
    reason: event.reason,
    origin: event.origin
  }));
  return { startedAt: store.startedAt, total, shown: shown.length, events: shown };
}

/** 把有界历史挂到每条记录上（构建期用；返回新数组，不改入参） */
function attachToDeals(deals, store, opts = {}) {
  return (deals || []).map(deal => {
    if (!deal || !deal.id) return deal;
    const history = historyFor(store, deal.id, opts);
    if (!history) return deal;
    return { ...deal, history };
  });
}

/* ------------------------------------------------------------------ */
/* 统计（报告 / 日志）                                                  */
/* ------------------------------------------------------------------ */

function summarize(store, deals) {
  const events = eventsOf(store);
  const byType = {};
  for (const type of EVENT_TYPES) byType[type] = 0;
  for (const event of events) byType[event.type] = (byType[event.type] || 0) + 1;
  const ids = new Set(events.map(event => event.id));
  const withHistory = (deals || []).filter(deal => deal && ids.has(deal.id)).length;
  return {
    startedAt: store && store.startedAt ? store.startedAt : null,
    baselineRecords: Object.keys((store && store.baseline && store.baseline.fields) || {}).length,
    events: events.length,
    byType,
    recordsWithHistory: withHistory,
    absenceTracked: Object.keys((store && store.absence) || {}).length,
    bytes: Buffer.byteLength(`${JSON.stringify(store, null, 2)}\n`, 'utf8')
  };
}

module.exports = {
  HISTORY_FILE,
  SCHEMA_VERSION,
  FIELD_EVENT,
  TRACKED_FIELDS,
  UNTRACKED_FIELDS,
  EVENT_TYPES,
  LIFECYCLE_TYPES,
  FIELD_TYPES,
  END_REASONS,
  EVENT_ORIGINS,
  MISS_CONFIRM_RUNS,
  LIMITS,
  RENDER_LIMIT,
  ABSENCE_RETENTION_DAYS,
  BASELINE_NOTE,
  HISTORY_WORDING,
  emptyStore,
  load,
  save,
  baselineOf,
  normValue,
  stableJson,
  sameValue,
  trackedValuesOf,
  diffStates,
  record,
  replay,
  replayedValue,
  lastLifecycleOf,
  eventsOf,
  verifyStore,
  historyFor,
  attachToDeals,
  summarize
};
