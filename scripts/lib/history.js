/**
 * v1.4 优惠历史（append-only change event log）—— **deals 领域层**。
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
 * ## v2.3：机制搬进了 `lib/history-core.js`
 *
 * 本文件从 v2.3 起只保留 **deals 领域**的东西：跟踪哪些字段、字段变了算哪一类事件、
 * 「来源不再列出」怎么判、以及一套中文措辞。与业务无关的机制（确定性序列化、
 * 重放、链校验、一致性校验、上限）在 `history-core.js` 里**只有一份实现** ——
 * Coding Plan 的变化日志（`lib/plan-history.js`）用的是同一份内核。
 * 两份日志的机制分家是最坏的写法：分家之后两边都还是绿的。
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

const path = require('path');
const core = require('./history-core');
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
const EVENT_ORIGINS = core.EVENT_ORIGINS;

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

/** 观测状态（absence）保留窗口：已 ended 且离开数据集超过这么多天的条目不再保留 */
const ABSENCE_RETENTION_DAYS = 365;

// [T5-history-201-disclaimer-tail]
// T5 删除（census B · 重复）：删尾句「最终以厂商官方页面为准。」—— 它与共享页脚（每页都有「优惠信息来自各厂商官方页面与公开折扣页，最终以官方页面为准。」）同义，属 B 类「同一句话的第二个容器」。保留前半句（「不再收录」的必要解释，C 类口径）。⚠️ 这条常量当时还被 Feed 产物消费（feeds.js 对 ended 事件推入）⇒ 曾经是「改它就是全站同改」；**订阅子系统整体下架后那条消费者已经不存在**（`lib/feeds.js` 已删除、产物里不再有 `dist/feed/**`），所以现在改这句话只落在页面侧。门禁：无既有断言引用这句；台账/清单由 noteDeclare 自动同步。
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
    disclaimer: '以上是本站采集与合并过程留下的观测记录；「不再收录」表示本站未再观测到该条目，不表示厂商已经下架或优惠已经失效。'
  }
};

const BASELINE_NOTE = 'v1.4 开工时的既有状态快照（只含被跟踪字段）。它不是创建事件——这些记录更早就存在，只是此前没有历史。';

/** deals 剖面：机制交给 `history-core.js`，这里只声明「什么算变化」 */
const PROFILE = {
  schemaVersion: SCHEMA_VERSION,
  recordKey: 'id',
  trackedFields: TRACKED_FIELDS,
  fieldEvent: FIELD_EVENT,
  eventTypes: EVENT_TYPES,
  lifecycleTypes: LIFECYCLE_TYPES,
  fieldTypes: FIELD_TYPES,
  endReasons: END_REASONS,
  fieldLabels: HISTORY_WORDING.HISTORY_FIELD_LABELS,
  baselineNote: BASELINE_NOTE,
  limits: LIMITS,
  renderLimit: RENDER_LIMIT,
  absenceRetentionDays: ABSENCE_RETENTION_DAYS,
  rankTypes: { created: 0, restored: 1, ended: 2 },
  fieldRankBase: 10,
  // 校验报错里的容器名（措辞与 v1.4 逐字一致）
  docLabel: '历史文档',
  recordsLabel: 'deals.json'
};

/* ------------------------------------------------------------------ */
/* 值归一（转出内核，保留同名导出）                                     */
/* ------------------------------------------------------------------ */

const normValue = core.normValue;
const stableJson = core.stableJson;
const sameValue = core.sameValue;

/** 一条记录里被跟踪字段的当前值（缺席 → null；只保留有值的，基线因此不写一堆 null） */
function trackedValuesOf(deal) {
  return core.trackedValuesOf(deal, TRACKED_FIELDS);
}

/* ------------------------------------------------------------------ */
/* 读取 / 写入                                                          */
/* ------------------------------------------------------------------ */

function emptyStore({ at = null } = {}) {
  return core.emptyStore(PROFILE, { at });
}

/**
 * 读取历史文件。
 * **不存在或损坏时不抛**：采集不该因为一份历史文件写坏就跑不动；
 * 损坏由 `check:history` 门禁拦（采集侧只告警）。
 */
function load(file = HISTORY_FILE) {
  const result = core.load(file);
  return { ...result, store: result.store || emptyStore() };
}

/** 写盘。key 顺序固定，`events` 追加式；无事发生的运行必须字节不变 */
function save(store, file = HISTORY_FILE) {
  return core.save(store, file);
}

/** 从一批当前记录构造基线（一次性；只在 v1.4 开工时由 `history-baseline` 生成） */
function baselineOf(deals, { at, note = BASELINE_NOTE } = {}) {
  return core.baselineOf(deals, { at, note, fields: TRACKED_FIELDS });
}

/* ------------------------------------------------------------------ */
/* 重放（基线 + 事件 ⇒ 当前状态）                                       */
/* ------------------------------------------------------------------ */

function replay(store) {
  return core.replay(store, PROFILE);
}

/** 由日志重建一条记录某个字段的当前值（缺席 → null） */
function replayedValue(store, id, field) {
  return core.replayedValue(store, id, field, PROFILE);
}

/** 一条记录最近一次生命周期事件（created / ended / restored） */
function lastLifecycleOf(store, id) {
  return core.lastLifecycleOf(store, id, PROFILE);
}

const eventsOf = core.eventsOf;

/* ------------------------------------------------------------------ */
/* 差异计算                                                             */
/* ------------------------------------------------------------------ */

function indexById(deals) {
  return core.indexByKey(deals, 'id');
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
  const events = [];
  for (const deal of next || []) {
    if (!deal || !deal.id) continue;
    if (before.has(deal.id)) continue;
    // 新记录：created 事件同时充当它自己的基线（否则「创建后再没变过」的字段没有锚点）
    events.push({ id: deal.id, at, type: 'created', field: null, from: null, to: null, fields: trackedValuesOf(deal) });
  }
  events.push(...core.diffFields(previous, next, { profile: PROFILE, at, originFields: ctx.originFields }));
  return core.sortEvents(events, PROFILE);
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
 * @param {Map<string,{title:string,vendor?:string}>} [params.labels]
 *        墓碑标签（v1.5）：记录**离开数据集**或来源不再列出时的标题 / 厂商快照，挂在 `ended` 上。
 *        为什么需要它：`title` / `vendor` 是身份字段、刻意不被跟踪（它们变了就是另一条记录），
 *        于是记录一旦从 `deals.json` 消失，变化雷达上就只剩一个 12 位 id —— 那样的「已结束」
 *        对读者没有价值。标签是**快照**，不是被跟踪的值：不参与链校验、不参与重放，
 *        只回答「这条是谁」。v1.5 起可选写入；缺席的 `ended` 依然完全合法（向后兼容）。
 * @param {Set<string>} [params.derivedFields] 本轮由规则推导（而非直接观测）的字段
 * @returns {{store:object, stats:object}}
 */
function record(store, params = {}) {
  const base = core.normalizeStore(store, PROFILE);
  const at = params.at;
  const runAt = params.runAt || null;
  const previous = params.previous || [];
  const next = params.next || [];
  const freshIds = new Set(params.freshIds || []);
  const eligible = new Set(params.absenceEligibleSources || []);
  const removed = params.removed instanceof Map ? params.removed : new Map();
  const labels = params.labels instanceof Map ? params.labels : new Map();

  /** 归一墓碑标签：只保留非空 title 与可选 vendor；拿不到就当作没有（不写半个空对象） */
  const labelOf = id => {
    const raw = labels.get(id);
    if (!raw || typeof raw !== 'object') return null;
    const title = typeof raw.title === 'string' ? raw.title.trim() : '';
    if (!title) return null;
    const vendor = typeof raw.vendor === 'string' ? raw.vendor.trim() : '';
    return vendor ? { title, vendor } : { title };
  };

  const replayState = core.replay(base, PROFILE);
  const lifecycle = new Map(); // id → 最后一次生命周期事件类型
  for (const event of eventsOf(base)) if (LIFECYCLE_TYPES.includes(event.type)) lifecycle.set(event.id, event.type);

  const candidates = [];
  const seen = new Set();          // 幂等去重（同一份输入重复调用不重复追加）
  for (const event of eventsOf(base)) seen.add(core.eventKey(event, PROFILE));

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
    const current = core.replayedValueFrom(replayState, event.id, event.field);
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
      const current = core.replayedValueFrom(replayState, deal.id, field);
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
    const label = labelOf(id);
    candidates.push({ id, at, type: 'ended', field: null, from: null, to: null, reason, runAt, ...(label ? { label } : {}) });
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
      // 来源不再列出：记录**仍在** deals.json 里，但将来它若被 prune，这个墓碑标签就是
      // 雷达上「它叫什么」的唯一来源 —— 因此在这里也一并写上（此刻拿得到标题）。
      const label = labelOf(deal.id);
      absentEvents.push({
        id: deal.id, at, type: 'ended', field: null, from: null, to: null,
        reason: 'source_no_longer_lists', firstMissedAt: since, runAt, ...(label ? { label } : {})
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
  for (const event of core.sortEvents(candidates, PROFILE)) {
    const key = core.eventKey(event, PROFILE);
    if (seen.has(key)) continue;
    seen.add(key);
    appended.push(event);
  }
  const events = [...eventsOf(base), ...appended];
  const absenceNext = core.pruneAbsence(absence, { nextIds, at, retentionDays: ABSENCE_RETENTION_DAYS });

  const out = {
    ...base,
    baseline: base.baseline,
    absence: absenceNext,
    events
  };

  return { store: out, stats: statsOf(appended, { absenceNext }) };
}

function withRun(event, runAt) {
  return runAt ? { ...event, runAt } : event;
}

function statsOf(events, { absenceNext } = {}) {
  const byType = {};
  for (const type of EVENT_TYPES) byType[type] = 0;
  for (const event of events) byType[event.type] = (byType[event.type] || 0) + 1;
  return { appended: events.length, byType, absenceTracked: Object.keys(absenceNext || {}).length };
}

/* ------------------------------------------------------------------ */
/* 校验：链完整性 + 与当前状态一致                                      */
/* ------------------------------------------------------------------ */

function verifyStore(store, deals, opts = {}) {
  return core.verifyStore(store, deals, PROFILE, opts);
}

/* ------------------------------------------------------------------ */
/* 渲染视图（构建期注入 dist）                                          */
/* ------------------------------------------------------------------ */

/** 一条记录的有界历史视图，供 RENDER-CORE 渲染。**只进 dist**：源数据里没有这个字段。 */
function historyFor(store, id, opts = {}) {
  return core.historyFor(store, id, PROFILE, opts);
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
  return core.summarize(store, deals, PROFILE);
}

module.exports = {
  HISTORY_FILE,
  SCHEMA_VERSION,
  PROFILE,
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
  // 「事件身份」这把尺子的对外出口：订阅层当年直接用它算变化条目的稳定 id（`lib/feeds.js` 的
  // `eventFeedId`，已随订阅子系统删除）；模块内的幂等集合与自测仍在用同一条判据。
  // 留着的理由：**同一件事只允许有一种身份定义** —— 谁要再算「同一件事」，仍然从这里取。
  eventKey: event => core.eventKey(event, PROFILE),
  verifyStore,
  historyFor,
  attachToDeals,
  summarize
};
