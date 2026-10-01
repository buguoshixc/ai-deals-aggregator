/**
 * v2.3 Coding Plan 变化日志（append-only change log for `plans.json`）。
 *
 * ## 与 deals 的关系：共用内核，不共用判据
 *
 * 与业务无关的机制（确定性序列化、一次性基线 + 事件重放、链校验、「基线+事件 ⇒ 当前状态」
 * 的一致性校验、上限）在 `lib/history-core.js` 里**只有一份实现**；本文件只写
 * 「plans 的什么算变化」与「plans 怎么说话」。刻意**不**共享的东西逐条写在
 * `docs/SCHEMA-v2.3.md` §2，其中最重要的两条：
 *
 *   · **事件类型表**不同：deals 的 `benefit_changed` / `eligibility_changed` 在套餐里没有对应物；
 *   · **「消失」的判据**不同：plans 没有联网采集器，所以**不复用** `source-health.json`
 *     的连续失败计数（那是 deals 采集器的心跳），改用「输入合法 + 连续运行确认 + 批量熔断」。
 *
 * ## 事件结构
 *
 * ```json
 * { "planId": "154d2607b8ff", "eventId": "3c1d9f0a7b21", "at": "2026-10-01",
 *   "type": "price_changed", "field": "billing.regularPrice", "from": 99, "to": 68,
 *   "origin": "observed", "runAt": "2026-10-01T05:41:17.000Z" }
 * ```
 *
 * · 记录身份字段名是 `planId`（deals 是 `id`），由内核的 `profile.recordKey` 参数化；
 * · 生命周期事件（created / ended / restored）不带 `field`/`from`/`to`；
 * · `created` 带 `fields`（快照，同时是这条记录的历史锚点），可选带 `supersedes`
 *   （见下「周期重键」）；`ended` 带 `reason` 与可选 `label`（墓碑快照）。
 *
 * ## Stable event id
 *
 * `eventId` 是**派生字段**：由 `eventIdOf()` 计算，`verifyStore` 会重算并逐条比对 ——
 * 手写一个 `eventId` 必红（与 `plan.id` / `derivedMetrics` 同一条纪律）。
 * 「同一真实变化重复运行不重复产生事件」由两道保证：① 链校验（重放出的当前值 == 事件的 `to`
 * 就跳过）；② `seen` 集合按 `eventKey` 幂等。
 *
 * ## 时间只来自数据
 *
 * `at` = `plans.json` 的 `updatedAt`（= 全部 `lastSeen` 的最大值）前 10 位，**不读墙上时钟**。
 * 若某条套餐的新变化日期**早于**它上一条事件的日期，写入路径会**拒绝写盘**
 * （「请先更新 lastSeen」），而不是把日期倒填进日志。
 *
 * ## 周期重键（v2.1 契约点名要显式决策的那一条）
 *
 * `id = sha1(kind|provider|planNameKey|billing.period)`，所以「同一套餐从月付改年付」在数据层
 * 会是两条记录。处理：同一次运行里出现同 `(kind, provider, planNameKey)`、period 不同的新记录时，
 * 对旧记录**立即**记 `ended(reason='period_changed')`（不等缺席确认），新记录的 `created`
 * 带 `supersedes: <旧 planId>`。这样它不会被读成「下架 + 上架」两件互不相干的事。
 * （边界：如果旧记录先消失、新记录下一次运行才出现，则走常规的「连续两次确认」路径，
 * 那时 `supersedes` 无从建立 —— 如实记为两条记录的变化，不猜。）
 *
 * ## 退出保护（六条，逐条有自测）
 *
 * R1 **唯一写入点**：只有 `rebuild-plans.js` 成功写盘时写日志；`--dry-run` 与输入有硬问题的运行
 *    既不写数据也不写日志（坏输入根本进不了写盘路径 ⇒ 不可能「采集器坏了 → 全部套餐下线」）。
 * R2 **缺席确认**：连续 `PLAN_MISS_CONFIRM_RUNS` 次成功运行都未见，才记 `ended`。
 * R3 **批量熔断**：单次运行缺席数超过 `max(3, 半数已知套餐)` 或输出为空 ⇒ 不推进计数、不记 `ended`，
 *    只在 `anomalies[]` 留档；要真的批量下架必须显式 `--allow-mass-removal`。
 * R4 周期重键 → 立即 `ended(period_changed)`（见上）。
 * R5 fail-closed：`plans.json` 缺失/损坏/数据级校验失败 ⇒ 门禁红、写入路径拒绝写。
 * R6 已知限制：确认期为两次运行 ⇒ 人工删掉一条套餐后，数据里立刻没有它，而日志要到下一次成功
 *    重建才记 `ended`。工具会打印待确认清单，`check:plan-history` 把它列为 notice。
 */

'use strict';

const path = require('path');
const crypto = require('crypto');

const core = require('./history-core');
const planSchema = require('./plan-schema');

const PLAN_HISTORY_FILE = path.join(__dirname, '..', 'data', 'plan-history.json');
const PLAN_SCHEMA_VERSION = 1;

/** 连续多少次成功运行未见，才记 `ended`（plans 没有采集器，判据是「运行」而不是「天数」） */
const PLAN_MISS_CONFIRM_RUNS = 2;
/** 批量熔断：单次缺席数超过这个绝对下限……
 *  ……或者超过「已知套餐数的这一比例」，就认为这是一次**可疑的输入**而不是真实的批量下架。 */
const PLAN_MASS_MISSING_MIN = 3;
const PLAN_MASS_MISSING_RATIO = 0.5;
/** `anomalies` 只保留最近这么多条（确定性裁剪，超出丢最旧的） */
const PLAN_ANOMALY_LIMIT = 20;

const PLAN_ID_RE = /^[0-9a-f]{12}$/;

const PLAN_LIMITS = {
  eventsPerRecord: 200,
  eventsTotal: 20000,
  fileBytes: 1024 * 1024
};

const PLAN_RENDER_LIMIT = 20;
const PLAN_ABSENCE_RETENTION_DAYS = 365;

/* ------------------------------------------------------------------ */
/* 被跟踪字段（唯一真值表）                                             */
/* ------------------------------------------------------------------ */

/**
 * 事件的类型集合。**顺序即统计输出顺序**。
 *
 * 题面 §二 点名的 11 类全部保留；另外 6 类是 schema 逼出来的：
 * `promo_changed`（活动价换挡，既不是开始也不是结束）、`quota_changed`（额度口径/周期变化，
 * 或数值 ↔ null —— 不能谎称增减）、`model_changed`（同名模型的 role/note 变了，不是增删）、
 * `availability_changed`（题面 §三 点名的 availability，在 plans 里由 `region` 承担）、
 * `billing_changed`（币种变了）、`updated`（记录级元信息，与 deals 的 `updated` 同名同义）。
 */
const PLAN_EVENT_TYPES = [
  'created',
  'price_changed', 'promo_started', 'promo_ended', 'promo_changed', 'billing_changed',
  'quota_increased', 'quota_decreased', 'quota_changed',
  'model_added', 'model_removed', 'model_changed',
  'restriction_changed', 'availability_changed', 'updated',
  'ended', 'restored'
];

const PLAN_LIFECYCLE_TYPES = ['created', 'ended', 'restored'];
const PLAN_FIELD_TYPES = PLAN_EVENT_TYPES.filter(type => !PLAN_LIFECYCLE_TYPES.includes(type));

const PLAN_END_REASONS = ['source_no_longer_lists', 'period_changed', 'withdrawn'];

/**
 * 一个字段可对应的事件类型。**超过一个的那几个字段都是"值决定类型"**：
 * 活动价看 null 分型、额度数值看大小分型、模型清单按元素做集合差。
 * 校验器（内核的 `allowedEventTypes`）按这张表判，不用一个字段一个类型的简化假设。
 */
const PLAN_FIELD_EVENT_TYPES = {
  'billing.regularPrice': ['price_changed'],
  'billing.promoPrice': ['promo_started', 'promo_ended', 'promo_changed'],
  'billing.currency': ['billing_changed'],
  'quota.type': ['quota_changed'],
  'quota.amount': ['quota_increased', 'quota_decreased', 'quota_changed'],
  'quota.period': ['quota_changed'],
  'quota.description': ['quota_changed'],
  supportedModels: ['model_added', 'model_removed', 'model_changed'],
  restrictions: ['restriction_changed'],
  region: ['availability_changed'],
  officialUrl: ['updated'],
  source: ['updated'],
  sourceUrl: ['updated']
};

/**
 * `meaningfulPlanFields`：被跟踪字段的**顺序即基线与事件的序列化顺序**，
 * 也决定同一天多个变化的排序。逐条理由见 `docs/SCHEMA-v2.3.md` §3。
 */
const PLAN_TRACKED_FIELDS = Object.keys(PLAN_FIELD_EVENT_TYPES);

/** 字段的基准事件类型（值决定类型的字段取第一个，仅用于声明与排序） */
const PLAN_FIELD_EVENT = {};
for (const [field, types] of Object.entries(PLAN_FIELD_EVENT_TYPES)) PLAN_FIELD_EVENT[field] = types[0];

/**
 * **不**跟踪的字段与理由。少一个字段时先看这张表，别急着往 `PLAN_TRACKED_FIELDS` 里加。
 */
const PLAN_UNTRACKED_FIELDS = {
  id: '身份的一部分（id = sha1(kind|provider|planNameKey|period)），变了就是另一条记录 ⇒ ended + created',
  kind: '身份的一部分（见 id）',
  provider: '身份的一部分（见 id）；改 provider 只可能是错字，而且未登记的 provider 连写盘都过不了',
  planName: '身份的一部分（见 id）',
  'billing.period': '身份的一部分（见 id）—— 月付与年付是两个可售 SKU，走 ended(period_changed) + created',
  firstSeen: '簿记：首次收录日期，由 created 事件回答',
  lastSeen: '人工每次回访官方页都会刷新（把 9 条刷成同一天）—— 记它等于每轮造 9 条假事件',
  verified: '人工核验声明；核验是**我们**的动作，不是套餐的变化',
  verifiedAt: '同上（"重新核对过但事实没变"是合法状态，不该产生事件）',
  'billing.note': '自由文本备注（题面 §三点名：备注标点不算变化）',
  'billing.promoNote': '同上；活动价本身的开始/结束/换挡由 `billing.promoPrice` 记',
  evidence: '每条引文都可能被重新抄一遍，抄写差异不是套餐变化',
  derivedMetrics: '**派生值**：它的输入（billing / quota）变了自然有对应事件，再记一条就是同一件事报两次'
};

/** 量化型额度：这些类型的 `quota.description` 是解释性散文，不作为额度语义跟踪 */
const QUANTIFIED_QUOTA_TYPES = planSchema.QUANTIFIED_QUOTA_TYPES;

/* ------------------------------------------------------------------ */
/* 措辞（唯一权威；前端不需要副本——这些字只在服务端渲染）                */
/* ------------------------------------------------------------------ */

const PLAN_HISTORY_WORDING = {
  PLAN_HISTORY_LABELS: {
    sectionTitle: '变更记录',
    empty: '暂无变更记录',
    since: '变更记录自 {date} 起（此前状态没有记录）',
    more: '另有 {n} 条更早的记录未在此显示',
    from: '原',
    to: '新',
    unavailable: '本次构建没有拿到套餐变更日志（plan-history.json 缺失或损坏）——这不表示「没有变化」。'
  },
  PLAN_HISTORY_TYPES: {
    created: '首次收录',
    price_changed: '价格变化',
    promo_started: '活动价开始',
    promo_ended: '活动价结束',
    promo_changed: '活动价变化',
    billing_changed: '计费方式变化',
    quota_increased: '额度增加',
    quota_decreased: '额度减少',
    quota_changed: '额度口径变化',
    model_added: '新增模型',
    model_removed: '移除模型',
    model_changed: '模型权限变化',
    restriction_changed: '限制条件变化',
    availability_changed: '销售地区变化',
    updated: '记录信息更新',
    ended: '不再收录',
    restored: '重新出现'
  },
  PLAN_HISTORY_END_REASONS: {
    source_no_longer_lists: '人工来源层不再列出（连续两次重建未见）',
    period_changed: '计费周期变化（月付/年付是两个可售 SKU，视为新的记录）',
    withdrawn: '已移除（人工显式放行批量下架）'
  },
  PLAN_HISTORY_FIELD_LABELS: {
    'billing.regularPrice': '正常价格',
    'billing.promoPrice': '活动价',
    'billing.currency': '币种',
    'quota.type': '额度类型',
    'quota.amount': '额度数值',
    'quota.period': '额度刷新周期',
    'quota.description': '额度说明',
    supportedModels: '可用模型',
    restrictions: '限制条件',
    region: '销售地区',
    officialUrl: '官方定价页',
    source: '来源类型',
    sourceUrl: '来源地址'
  },
  PLAN_HISTORY_NOTES: {
    lifecycle: '本条记录的生命周期事件',
    emptyNote: '起算日之前的状态没有历史记录，因此这里不显示任何变化。',
    disclaimer: '以上是本站重建套餐数据时留下的观测记录；「不再收录」表示人工来源层不再列出该套餐，'
      + '不表示厂商已经下架或套餐已经停售。价格、额度与条款最终以厂商官方页面为准。'
  }
};

const PLAN_BASELINE_NOTE = 'v2.3 开工时的既有状态快照（只含被跟踪字段）。它不是创建事件——'
  + '这些套餐在此之前就存在，只是此前没有变化日志。';

/* ------------------------------------------------------------------ */
/* 字段投影与相等判据                                                   */
/* ------------------------------------------------------------------ */

/** 读字段：支持 `billing.regularPrice` 这样的路径；`quota.description` 带投影（见下） */
function readField(record, field) {
  if (!record) return undefined;
  // **投影**：`quota.description` 只在「额度语义全在文字里」的类型上才是被跟踪的额度口径
  // （rate_limited / unlimited_fair_use / other）。量化型（tokens / credits / …）的说明是
  // 解释性散文 —— 题面 §三 明确要求不因 description 文案产生变化事件。
  // 投影是**同一个函数**同时用在基线、事件与一致性校验三处，所以三者不可能分家。
  if (field === 'quota.description') {
    const type = record.quota && record.quota.type;
    if (QUANTIFIED_QUOTA_TYPES.includes(type)) return null;
  }
  if (field.indexOf('.') < 0) return record[field];
  let cursor = record;
  for (const part of field.split('.')) {
    if (cursor === null || typeof cursor !== 'object') return undefined;
    cursor = cursor[part];
  }
  return cursor;
}

/** 文案归一后的相等：只差**空白与标点**（含零宽字符、全角空格）⇒ 没有变化。
 *
 * 题面 §三 明确要求「备注标点」不产生变化事件。这里处理的正是这一类**写法差异**：
 * NFKC → 去掉空白类与标点类字符 → 逐字比较。刻意**不**做相似度比较、不做近似匹配 ——
 * 文字本身（含数字、字母、`≥`/`+`/`%` 这类符号）差一个字符就是差一个语义，照样记事件。
 */
function noteText(value) {
  if (typeof value !== 'string') return null;
  return value.normalize('NFKC').replace(/[\s\u200b-\u200d\ufeff\p{P}]+/gu, '');
}

function cosmeticEqual(a, b) {
  if (a === null || a === undefined || b === null || b === undefined) return core.sameValue(a, b);
  const left = noteText(a);
  const right = noteText(b);
  if (left === null || right === null) return core.sameValue(a, b);
  return left === right;
}

/** 模型名的归一键（与 `plan-schema.normalizeModels` 的去重键同一个尺子） */
function modelKeyOf(model) {
  return String((model && model.name) || '')
    .normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}

function modelMapOf(list) {
  const map = new Map();
  for (const model of Array.isArray(list) ? list : []) {
    if (model && typeof model === 'object') map.set(modelKeyOf(model), model);
  }
  return map;
}

/**
 * 两个模型对象是否"同一件事实"：role 必须一致，note 走文案归一。
 * 这一条同时供差异计算与一致性校验使用，所以「note 只改标点」在两边都是「没变」。
 */
function modelSame(a, b) {
  if (!a || !b) return a === b;
  return a.role === b.role && cosmeticEqual(a.note, b.note);
}

/**
 * 模型清单比较：**顺序无关**（题面 §六）。
 * 归一化名 → 模型对象，元素逐个比对 role 与 note。
 */
function modelArrayEqual(a, b) {
  const left = Array.isArray(a) ? a : null;
  const right = Array.isArray(b) ? b : null;
  if (!left && !right) return true;
  if (!left || !right) return false;
  const mapA = modelMapOf(left);
  const mapB = modelMapOf(right);
  if (mapA.size !== mapB.size) return false;
  for (const [key, item] of mapA) {
    const other = mapB.get(key);
    if (!other) return false;
    if (!modelSame(item, other)) return false;
  }
  return true;
}

/** 限制条件比较：按 kind 成对比较，value 严格、note 走文案归一；顺序无关 */
function restrictionArrayEqual(a, b) {
  const left = Array.isArray(a) ? a : null;
  const right = Array.isArray(b) ? b : null;
  if (!left && !right) return true;
  if (!left || !right) return false;
  if (left.length !== right.length) return false;
  const byKind = new Map();
  for (const item of left) if (item && item.kind) byKind.set(item.kind, item);
  for (const item of b || []) {
    if (!item || !item.kind) return false;
    const other = byKind.get(item.kind);
    if (!other) return false;
    if (!core.sameValue(other.value, item.value)) return false;
    if (!cosmeticEqual(other.note, item.note)) return false;
  }
  return true;
}

/** 按字段覆写的相等判据（差异计算与一致性校验共用同一份） */
const PLAN_COMPARE = {
  'quota.description': cosmeticEqual,
  supportedModels: modelArrayEqual,
  restrictions: restrictionArrayEqual
};

/** 模型清单的规范序（与 `plan-schema.normalizeModels` 同一把尺子：先 role 序、再 name） */
function sortModels(list) {
  return [...list].sort((a, b) => {
    const diff = planSchema.MODEL_ROLES.indexOf(a.role) - planSchema.MODEL_ROLES.indexOf(b.role);
    if (diff !== 0) return diff;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
}

/**
 * 把一条字段事件应用到值表上（内核的重放入口）。
 *
 * `supportedModels` 的事件是**按元素**记的（新增 / 移除 / 权限变化各一条），
 * 所以这里做的是「改清单里的那一个元素」，而不是把整份清单换成那一个模型对象。
 * 内核的重放与链校验都走这一个函数 —— 元素级事件与整表一致性因此不可能分家。
 */
function applyPlanEvent(values, event) {
  if (event.field !== 'supportedModels') {
    if (event.to === null || event.to === undefined) delete values[event.field];
    else values[event.field] = event.to;
    return values;
  }
  const key = modelKeyOf(event.to || event.from);
  let list = (Array.isArray(values.supportedModels) ? values.supportedModels : [])
    .filter(model => modelKeyOf(model) !== key);
  if (event.to) list.push(event.to);
  list = sortModels(list);
  if (list.length) values.supportedModels = list;
  else delete values.supportedModels;
  return values;
}

/**
 * 链校验里「当前值是否等于事件的 from」的判据。
 *
 * 元素级事件需要元素级判据：`from` 是一个模型对象（或 null = 此前不在清单里），
 * 而当前值是一整份清单。别的字段仍然逐字节比较。
 */
function planEventValueMatches(field, current, value, event) {
  if (field !== 'supportedModels') return core.valuesEqual(PROFILE, field, current, value);
  const list = Array.isArray(current) ? current : [];
  const probe = value === null || value === undefined ? event.to : value;
  const found = list.find(model => modelKeyOf(model) === modelKeyOf(probe));
  if (value === null || value === undefined) return !found;   // from = null：此前不该在清单里
  return Boolean(found) && modelSame(found, value);
}

/**
 * 「当前状态已经是这条事件的 `to` 了吗」——重复运行不重复追加的判据。
 * 同样要按元素判：`to = null` 表示「这个模型应当已不在清单里」。
 */
function planAlreadyAt(field, current, to, event) {
  if (field !== 'supportedModels') return core.valuesEqual(PROFILE, field, current, to);
  const list = Array.isArray(current) ? current : [];
  const probe = to === null || to === undefined ? event.from : to;
  const found = list.find(model => modelKeyOf(model) === modelKeyOf(probe));
  if (to === null || to === undefined) return !found;
  return Boolean(found) && modelSame(found, to);
}

/**
 * plans 剖面：机制交给 `history-core.js`，这里只声明「什么算变化」。
 *
 * v2.5：`record()` 改成**按 profile 参数化**（`params.profile`，缺省就是这一份），
 * 于是 API 计费（`lib/api-plan-history.js`）可以复用同一个写入内核而不复制它的算法。
 * 为此把原先散在 `record()` 里的模块级常量与两个领域函数收进这份剖面：
 *
 *   · 阈值：`massMissingMin` / `massMissingRatio` / `missConfirmRuns` / `anomalyLimit`；
 *   · 领域判据：`fieldEvents`（逐字段差异怎么算）· `identityWithoutAxis`（重键时的
 *     "除轴之外的身份"）· `axisOf`（身份轴上的那个值：plans 是 `billing.period`）·
 *     `alreadyAt`（"当前值已经是事件的 to 了吗"）。
 *
 * **profile 一旦传进来，`record()` 不再读任何模块级常量** —— 否则 API 那一份会静默地用
 * plans 的阈值，而账面上看起来完全正常（这正是最坏的一种坏法）。
 */
const PROFILE = {
  schemaVersion: PLAN_SCHEMA_VERSION,
  // 数据记录的字段是 `id`（plans.json 契约），事件上刻意写成 `planId`（题面 §四 的事件结构）。
  recordKey: 'id',
  eventKeyName: 'planId',
  trackedFields: PLAN_TRACKED_FIELDS,
  fieldEvent: PLAN_FIELD_EVENT,
  allowedEventTypes: field => PLAN_FIELD_EVENT_TYPES[field] || [PLAN_FIELD_EVENT[field]],
  eventTypes: PLAN_EVENT_TYPES,
  lifecycleTypes: PLAN_LIFECYCLE_TYPES,
  fieldTypes: PLAN_FIELD_TYPES,
  endReasons: PLAN_END_REASONS,
  fieldLabels: PLAN_HISTORY_WORDING.PLAN_HISTORY_FIELD_LABELS,
  baselineNote: PLAN_BASELINE_NOTE,
  limits: PLAN_LIMITS,
  renderLimit: PLAN_RENDER_LIMIT,
  absenceRetentionDays: PLAN_ABSENCE_RETENTION_DAYS,
  missConfirmRuns: PLAN_MISS_CONFIRM_RUNS,
  massMissingMin: PLAN_MASS_MISSING_MIN,
  massMissingRatio: PLAN_MASS_MISSING_RATIO,
  anomalyLimit: PLAN_ANOMALY_LIMIT,
  rankTypes: { created: 0, restored: 1, ended: 2 },
  fieldRankBase: 10,
  readField,
  compare: PLAN_COMPARE,
  applyEvent: applyPlanEvent,
  eventValueMatches: planEventValueMatches,
  alreadyAt: planAlreadyAt,
  fieldEvents: planFieldEvents,
  identityWithoutAxis: planIdentityWithoutPeriod,
  axisOf: plan => ((plan && plan.billing && plan.billing.period) || null),
  idRe: PLAN_ID_RE,
  // v3.0：派生身份的推导**由 profile 声明**（写入点与 verifyStore 都读它）。
  eventIdOf,
  docLabel: '套餐变更日志',
  recordsLabel: 'plans.json',
  passthroughKeys: ['anomalies'],
  emptyExtra: { anomalies: [] },
  normalizeExtra: {
    anomalies: value => (Array.isArray(value) ? value.filter(item => item && typeof item === 'object') : [])
  },
  validateExtra
};

/* ------------------------------------------------------------------ */
/* 事件身份                                                             */
/* ------------------------------------------------------------------ */

function sha1Hex(text) {
  return crypto.createHash('sha1').update(text).digest('hex');
}

/**
 * 派生事件身份：同一条记录 + 同一类型 + 同一字段 + 同一天 + 同一对值 + 同一原因
 * ⇒ 同一个 `eventId`。`verifyStore` 会重算并比对（派生字段不得手写）。
 */
function eventIdOf(event) {
  const basis = [
    event.planId, event.type, event.field || '', event.at,
    core.stableJson(event.from), core.stableJson(event.to), event.reason || '',
    event.type === 'created' ? core.stableJson(event.fields || {}) : '',
    event.type === 'ended' ? (event.firstMissedAt || '') : '',
    event.type === 'created' ? (event.supersedes || '') : ''
  ].join('|');
  return sha1Hex(basis).slice(0, 12);
}

/**
 * 派生身份的**统一入口**：写入点与校验点都必须走这里。
 *
 * 领域可以用 `profile.eventIdOf` 声明自己的推导（API 计费 = `api-plan-history.apiPlanEventIdOf`）；
 * 没有声明时用本文件的缺省推导。**必须只有这一个入口** —— 一旦写入点和校验点各算一次，
 * 「日志里的 id」与「重算的 id」就会分家，而那种分家平时完全看不出来（两边都是 12 位 hex）。
 */
function eventIdFor(profile, event) {
  return profile && typeof profile.eventIdOf === 'function' ? profile.eventIdOf(event) : eventIdOf(event);
}

/**
 * 「重算并比对」：**两条 profile 共用这一条实现**（`verifyStore` 的最后一步会走到它）。
 *
 * 只对**确实带了 eventId 的事件**判红：老日志里没有 `eventId` 的事件是历史事实
 * （v2.5 的基线就是那样落盘的），不能因为「没写」就报红；但**写了一个错的**必须红 ——
 * 这正是「派生字段不得手写」这句话唯一能被机器守住的地方。
 */
function eventIdProblems(events, profile) {
  const problems = [];
  (events || []).forEach((event, index) => {
    if (!event || typeof event !== 'object') return;
    if (event.eventId === undefined) return;
    if (event.eventId !== eventIdFor(profile, event)) {
      problems.push(`事件 #${index}: eventId 与重算值不一致（派生字段不得手写）`);
    }
  });
  return problems;
}

/* ------------------------------------------------------------------ */
/* 差异计算                                                             */
/* ------------------------------------------------------------------ */

function planIdentityWithoutPeriod(plan) {
  return `${plan.kind || 'coding'}|${plan.provider}|${planSchema.planNameKeyOf(plan.planName)}`;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 逐字段差异：给定「上一组被跟踪字段值」与当前记录，产出候选事件。
 *
 * `prevValues` 是**投影后**的扁平值表（字段路径 → 值，缺席 = 没有值），
 * 所以「新增记录」与「重现的记录」可以用同一个函数：前者的 prevValues 是空表。
 *
 * 五条语义都在这里，且只在这里：
 *  · 活动价：null→值 = `promo_started`，值→null = `promo_ended`，值→另一值 = `promo_changed`；
 *  · 额度数值：数字对数字比大小 = `quota_increased` / `quota_decreased`；数字 ↔ null 或
 *    **同一次额度类型也变了** = `quota_changed`（跨量纲比大小是假精确）；
 *  · 模型清单：按归一化名做**集合差**（顺序无关；只改标点不产生事件）；
 *  · 文案归一：`quota.description` / 模型 note / 限制条件 note 的写法差异不产生事件；
 *  · 其余字段按 `PLAN_FIELD_EVENT` 的单一类型。
 */
function planFieldEvents(plan, prevValues, { at, originFields = null, runAt = null } = {}) {
  const current = core.trackedValuesOf(plan, PLAN_TRACKED_FIELDS, PROFILE);
  const prev = prevValues || {};
  const events = [];
  const push = (field, type, from, to) => {
    events.push({
      planId: plan.id, at, type, field, from, to,
      origin: originFields instanceof Set && originFields.has(field) ? 'derived' : 'observed',
      ...(runAt ? { runAt } : {})
    });
  };

  const quotaTypeChanged = !core.valuesEqual(
    PROFILE, 'quota.type',
    Object.prototype.hasOwnProperty.call(prev, 'quota.type') ? prev['quota.type'] : null,
    Object.prototype.hasOwnProperty.call(current, 'quota.type') ? current['quota.type'] : null
  );

  for (const field of PLAN_TRACKED_FIELDS) {
    if (field === 'supportedModels') continue;                       // 集合差单独处理
    const from = Object.prototype.hasOwnProperty.call(prev, field) ? prev[field] : null;
    const to = Object.prototype.hasOwnProperty.call(current, field) ? current[field] : null;
    if (core.valuesEqual(PROFILE, field, from, to)) continue;
    let type = PLAN_FIELD_EVENT[field];
    if (field === 'billing.promoPrice') {
      type = from === null ? 'promo_started' : to === null ? 'promo_ended' : 'promo_changed';
    } else if (field === 'quota.amount') {
      type = (typeof from === 'number' && typeof to === 'number' && !quotaTypeChanged)
        ? (to > from ? 'quota_increased' : 'quota_decreased')
        : 'quota_changed';
    }
    push(field, type, from, to);
  }

  // 模型集合差：**顺序不敏感**，逐个模型一条事件（新增/移除/权限变化）
  const before = modelMapOf(prev.supportedModels);
  const after = modelMapOf(current.supportedModels);
  const names = [...new Set([...before.keys(), ...after.keys()])].sort();
  for (const key of names) {
    const old = before.get(key);
    const now = after.get(key);
    if (!old && now) push('supportedModels', 'model_added', null, now);
    else if (old && !now) push('supportedModels', 'model_removed', old, null);
    else if (old && now && !modelSame(old, now)) push('supportedModels', 'model_changed', old, now);
  }
  return events;
}

/* ------------------------------------------------------------------ */
/* 记录（唯一入口）                                                     */
/* ------------------------------------------------------------------ */

/**
 * 把一次重建的观测结果并进变化日志。**纯函数**：输入里的 `store` 不会被修改。
 *
 * @param {object} store   当前日志文档
 * @param {object} params
 * @param {object[]} params.previous 上一份已发布的 `plans.json` 记录（盘上那份）
 * @param {object[]} params.next     本次重建产出的记录
 * @param {string}  params.at       数据日期（= `plans.json` 的 updatedAt 前 10 位）
 * @param {string}  [params.runAt]  本次运行的 ISO 时间戳（精度审计用）
 * @param {boolean} [params.eligible=true] 本次运行是否可用于判断「消失」
 *        （输入合法 + 数据级校验通过；由调用方在**写盘路径**上决定）
 * @param {boolean} [params.allowMassRemoval=false] 显式放行批量下架（写进 anomalies 的 override）
 * @param {Map<string,{title:string,vendor?:string}>} [params.labels] 墓碑标签
 * @param {Set<string>} [params.originFields] 由规则推导（而非直接观测）的字段
 * @returns {{store:object, stats:object, problems:string[], missing:object[]}}
 *          `problems` 非空时调用方**必须拒绝写盘**（链已不同步 / 日期倒填）
 */
function record(store, params = {}) {
  // v2.5：profile 从参数取（缺省 = plans 自己这一份）。传进来之后就**不再读任何模块级常量** ——
  // 见 PROFILE 的注释：静默沿用 plans 的阈值比抛错更难查。
  const profile = params.profile || PROFILE;
  const trackedFields = profile.trackedFields;
  const lifecycleTypes = profile.lifecycleTypes;
  const massMissingMin = Number.isFinite(profile.massMissingMin) ? profile.massMissingMin : PLAN_MASS_MISSING_MIN;
  const massMissingRatio = Number.isFinite(profile.massMissingRatio) ? profile.massMissingRatio : PLAN_MASS_MISSING_RATIO;
  const missConfirmRuns = Number.isFinite(profile.missConfirmRuns) ? profile.missConfirmRuns : PLAN_MISS_CONFIRM_RUNS;
  const anomalyLimit = Number.isFinite(profile.anomalyLimit) ? profile.anomalyLimit : PLAN_ANOMALY_LIMIT;
  const fieldEvents = typeof profile.fieldEvents === 'function' ? profile.fieldEvents : planFieldEvents;
  const alreadyAt = typeof profile.alreadyAt === 'function' ? profile.alreadyAt : planAlreadyAt;
  const identityWithoutAxis = typeof profile.identityWithoutAxis === 'function' ? profile.identityWithoutAxis : planIdentityWithoutPeriod;
  const axisOf = typeof profile.axisOf === 'function' ? profile.axisOf : (plan => ((plan && plan.billing && plan.billing.period) || null));

  const base = core.normalizeStore(store, profile);
  const at = params.at;
  const runAt = params.runAt || null;
  const previous = params.previous || [];
  const next = (params.next || []).filter(plan => plan && plan.id);
  const labels = params.labels instanceof Map ? params.labels : new Map();
  const problems = [];

  if (!DATE_RE.test(String(at || ''))) {
    return { store: base, stats: emptyStats(base, profile), problems: [`数据日期非法（${at}）—— at 必须来自 plans.json 的 updatedAt`], missing: [] };
  }

  const labelOf = id => {
    const raw = labels.get(id);
    if (raw && typeof raw === 'object' && typeof raw.title === 'string' && raw.title.trim()) {
      const title = raw.title.trim();
      const vendor = typeof raw.vendor === 'string' && raw.vendor.trim() ? raw.vendor.trim() : '';
      return vendor ? { title, vendor } : { title };
    }
    return null;
  };

  const replayState = core.replay(base, profile);
  const lifecycle = new Map();
  for (const event of core.eventsOf(base)) {
    if (lifecycleTypes.includes(event.type)) lifecycle.set(event.planId, event.type);
  }
  const seen = new Set(core.eventsOf(base).map(event => core.eventKey(event, profile)));

  const beforeById = core.indexByKey(previous, 'id');
  const nextById = core.indexByKey(next, 'id');
  const absentCandidates = new Set([
    ...Object.keys((base.baseline && base.baseline.fields) || {}),
    ...core.eventsOf(base).map(event => event.planId),
    ...beforeById.keys()
  ]);
  const missingIds = [...absentCandidates].filter(id => !nextById.has(id)).sort();
  const knownTotal = absentCandidates.size;

  // ---- R3 批量熔断：可疑的输入不推进任何计数、不记任何 ended -----------------
  const overRatio = missingIds.length >= Math.max(
    massMissingMin,
    Math.ceil(knownTotal * massMissingRatio)
  );
  const emptied = next.length === 0 && knownTotal > 0;
  const override = params.allowMassRemoval === true;
  const massMissing = !override && (overRatio || emptied);
  const inputTrusted = params.eligible !== false;
  /** 熔断或输入不可信：观测态只留档，不推进、不判死 */
  const blocked = massMissing || !inputTrusted;
  const eligible = inputTrusted && !massMissing;

  // ---- R4 周期重键：旧记录 → 新记录（同一次运行里出现的同身份不同周期）--------
  const periodChangedOf = new Map(); // 旧 planId → 新的记录
  if (!blocked && typeof identityWithoutAxis === 'function') {
    const byIdentity = new Map();
    for (const plan of next) {
      const identity = identityWithoutAxis(plan);
      if (identity) byIdentity.set(identity, plan);
    }
    for (const id of missingIds) {
      const prev = beforeById.get(id);
      if (!prev || lifecycle.get(id) === 'ended') continue;
      const sibling = byIdentity.get(identityWithoutAxis(prev));
      if (!sibling) continue;
      const prevAxis = axisOf(prev);
      const nextAxis = axisOf(sibling);
      if (prevAxis && nextAxis && prevAxis !== nextAxis) periodChangedOf.set(id, sibling);
    }
  }

  const candidates = [];

  // ---- ① 新增 / 字段变化 / 重现 ------------------------------------------
  for (const plan of next) {
    const known = replayState.has(plan.id) || lifecycle.has(plan.id);
    const prev = beforeById.get(plan.id);

    if (!prev && !known) {
      // 全新记录：created 事件同时充当它自己的基线锚点。
      // 若它是这次「周期重键」产生的新身份，下面会补上 `supersedes` 指针。
      candidates.push({
        planId: plan.id, at, type: 'created', field: null, from: null, to: null,
        fields: core.trackedValuesOf(plan, trackedFields, profile),
        ...(runAt ? { runAt } : {})
      });
      continue;
    }

    if (!prev) {
      // 历史认识它，但上一份发布里没有它：如果它结束过，这一次是「重新出现」
      if (lifecycle.get(plan.id) === 'ended') {
        candidates.push({ planId: plan.id, at, type: 'restored', field: null, from: null, to: null, ...(runAt ? { runAt } : {}) });
      }
      const prevValues = {};
      for (const field of trackedFields) {
        const value = core.replayedValueFrom(replayState, plan.id, field);
        if (value !== null) prevValues[field] = value;
      }
      candidates.push(...fieldEvents(plan, prevValues, { at, originFields: params.originFields, runAt }));
      continue;
    }

    // 一直在 → 与上一份发布逐字段比对（链校验在下面统一做）
    const prevValues = core.trackedValuesOf(prev, trackedFields, profile);
    candidates.push(...fieldEvents(plan, prevValues, { at, originFields: params.originFields, runAt }));
  }

  // 周期重键产生的**新记录**（上一份发布里没有它，走的是 created 分支）——
  // 这里给它补上 `supersedes` 链接。分开写是因为 created 的两条来源不同。
  for (const [oldId, sibling] of periodChangedOf) {
    const created = candidates.find(event => event.type === 'created' && event.planId === sibling.id);
    if (created) created.supersedes = oldId;
  }

  // ---- ② 消失：确认计数 / 周期重键立即结束 / 熔断留档 ----------------------
  const absence = { ...(base.absence || {}) };
  const missingReport = [];
  for (const id of missingIds) {
    const prev = beforeById.get(id);
    const state = absence[id] || {};
    const label = labelOf(id) || state.label || null;
    const firstMissedAt = state.since || at;
    missingReport.push({
      planId: id,
      title: (label && label.title) || id,
      misses: state.misses || 0,
      since: firstMissedAt,
      blocked
    });

    if (override) {
      // 人工显式放行批量下架（`--allow-mass-removal`）：不再等确认，直接记为 `withdrawn`。
      // 用 `withdrawn`（"已移除"）而不是 `source_no_longer_lists`（"连续多次重建未见"）——
      // 后者在第一次运行上就是一句不成立的话。
      if (lifecycle.get(id) !== 'ended') {
        candidates.push({
          planId: id, at, type: 'ended', field: null, from: null, to: null,
          reason: 'withdrawn', firstMissedAt, ...(label ? { label } : {}), ...(runAt ? { runAt } : {})
        });
      }
      absence[id] = { misses: state.misses || 0, since: firstMissedAt, endedAt: at, ...(label ? { label } : {}) };
      continue;
    }

    if (blocked) {
      // 熔断（批量消失）或本次输入不可信：只留档，不推进计数、不记 ended。
      // 下次运行若输入恢复正常，计数从原值继续。
      absence[id] = {
        misses: state.misses || 0,
        since: firstMissedAt,
        endedAt: null,
        blockedAt: at,
        blockedReason: massMissing ? (emptied ? 'empty_dataset' : 'mass_missing') : 'input_invalid',
        ...(label ? { label } : {})
      };
      continue;
    }

    if (lifecycle.get(id) === 'ended') {
      absence[id] = { ...state, endedAt: state.endedAt || at, ...(label ? { label } : {}) };
      continue;
    }

    const sibling = periodChangedOf.get(id);
    if (sibling) {
      candidates.push({
        planId: id, at, type: 'ended', field: null, from: null, to: null,
        reason: profile.axisChangeReason || 'period_changed', firstMissedAt, ...(label ? { label } : {}), ...(runAt ? { runAt } : {})
      });
      absence[id] = { misses: state.misses || 0, since: firstMissedAt, endedAt: at, ...(label ? { label } : {}) };
      continue;
    }

    const misses = (state.misses || 0) + 1;
    if (misses >= missConfirmRuns) {
      candidates.push({
        planId: id, at, type: 'ended', field: null, from: null, to: null,
        reason: 'source_no_longer_lists', firstMissedAt, ...(label ? { label } : {}), ...(runAt ? { runAt } : {})
      });
      absence[id] = { misses, since: firstMissedAt, endedAt: at, ...(label ? { label } : {}) };
    } else {
      absence[id] = { misses, since: firstMissedAt, endedAt: null, ...(label ? { label } : {}) };
    }
  }

  // 回来的记录：清掉观测态（从未结束过 ⇒ 不产生事件；结束过 ⇒ 由 ① 记 restored）
  for (const plan of next) if (absence[plan.id]) delete absence[plan.id];

  // ---- ③ 链校验：只有当记录当前值确实等于 from、且 to 还不是当前值时才是新变化 --
  const appended = [];
  for (const event of core.sortEvents(candidates, profile)) {
    if (event.type !== 'created' && event.type !== 'ended' && event.type !== 'restored') {
      const current = core.replayedValueFrom(replayState, event.planId, event.field);
      if (alreadyAt(event.field, current, event.to, event)) continue;   // 已经是这个值
      if (!core.eventValueMatches(profile, event.field, current, event.from, event)) {
        problems.push(`${event.planId} · ${event.field}: 链对不上（日志里是 ${core.stableJson(current)}，`
          + `这次要记的 from 是 ${core.stableJson(event.from)}）—— 日志与 plans.json 已经不同步，拒绝写盘`);
        continue;
      }
    } else if (event.type === 'created') {
      if (replayState.has(event.planId) || lifecycle.has(event.planId)) continue;
    } else {
      const last = lifecycle.get(event.planId) || null;
      if (event.type === 'ended' && last === 'ended') continue;
      if (event.type === 'restored' && last !== 'ended') continue;
    }
    // 时间单调性：绝不把日期倒填进日志
    const lastAt = lastEventAtOf(base, event.planId);
    if (lastAt && event.at < lastAt) {
      problems.push(`${event.planId}: 变化日期 ${event.at} 早于该套餐上一条事件的日期 ${lastAt}`
        + ' —— 请先把这个套餐的 lastSeen 更新到核对当天，再重建（不猜日期）');
      continue;
    }
    const key = core.eventKey(event, profile);
    if (seen.has(key)) continue;
    seen.add(key);
    appended.push({ ...event, eventId: eventIdFor(profile, event) });
  }

  // ---- ④ 附加段：异常留档（有界、确定性）--------------------------------
  const anomalies = (base.anomalies || []).slice();
  if (missingIds.length && (massMissing || override)) {
    anomalies.push({
      at,
      kind: 'mass_missing',
      missing: missingIds.length,
      known: knownTotal,
      planIds: missingIds.slice().sort(),
      ...(override ? { override: true } : {})
    });
  }
  // v2.5：领域侧可以追加自己的有界异常（API 计费用它留档 `possible_rename`）。
  // 由 profile 提供、在**同一处**裁剪，因此两种数据的上限是同一条纪律。
  if (typeof profile.extraAnomalies === 'function') {
    for (const item of profile.extraAnomalies({ store: base, previous, next, at, missingIds, stats: { knownTotal } }) || []) {
      if (item && typeof item === 'object') anomalies.push(item);
    }
  }
  const anomaliesNext = anomalies.slice(-anomalyLimit);

  const nextIds = new Set(next.map(plan => plan.id));
  const out = {
    ...base,
    baseline: base.baseline,
    absence: core.pruneAbsence(absence, { nextIds, at, retentionDays: profile.absenceRetentionDays }),
    anomalies: anomaliesNext,
    events: [...core.eventsOf(base), ...appended]
  };

  const byType = {};
  for (const type of profile.eventTypes) byType[type] = 0;
  for (const event of appended) byType[event.type] = (byType[event.type] || 0) + 1;

  return {
    store: out,
    stats: {
      appended: appended.length,
      byType,
      absenceTracked: Object.keys(out.absence).length,
      pendingAbsence: Object.values(out.absence).filter(state => state && !state.endedAt).length,
      blockedAbsence: Object.values(out.absence).filter(state => state && state.blockedAt).length,
      massMissing,
      blocked,
      eligible,
      knownTotal
    },
    problems,
    missing: missingReport,
    appended
  };
}

function emptyStats(store, profile = PROFILE) {
  const byType = {};
  for (const type of profile.eventTypes) byType[type] = 0;
  return {
    appended: 0, byType,
    absenceTracked: Object.keys((store && store.absence) || {}).length,
    pendingAbsence: 0, blockedAbsence: 0, massMissing: false, blocked: false, eligible: false, knownTotal: 0
  };
}

/** 一条记录上已有的最后一条事件日期（时间单调性判据） */
function lastEventAtOf(store, planId) {
  let last = null;
  for (const event of core.eventsOf(store)) {
    if (event.planId !== planId) continue;
    if (typeof event.at === 'string' && (!last || event.at > last)) last = event.at;
  }
  return last;
}

/* ------------------------------------------------------------------ */
/* 附加校验（内核的 validateExtra 钩子）                                 */
/* ------------------------------------------------------------------ */

function validateExtra(doc, plans, problems, ctx) {
  const anomalies = doc.anomalies;
  if (anomalies !== undefined) {
    if (!Array.isArray(anomalies)) {
      problems.push('anomalies 必须是数组');
    } else {
      anomalies.forEach((item, index) => {
        const where = `anomalies[${index}]`;
        if (!item || typeof item !== 'object') { problems.push(`${where}: 不是对象`); return; }
        if (!DATE_RE.test(String(item.at || ''))) problems.push(`${where}: at 非法（${item.at}）`);
        if (item.kind !== 'mass_missing') problems.push(`${where}: 未知的 kind（${item.kind}）`);
        if (!Number.isInteger(item.missing) || item.missing <= 0) problems.push(`${where}: missing 必须是正整数`);
        if (!Number.isInteger(item.known) || item.known <= 0) problems.push(`${where}: known 必须是正整数`);
        if (!Array.isArray(item.planIds) || !item.planIds.length) {
          problems.push(`${where}: planIds 必须是非空数组`);
        } else {
          for (const id of item.planIds) if (!PLAN_ID_RE.test(String(id))) problems.push(`${where}: planIds 含非法 id（${id}）`);
        }
        if (item.override !== undefined && typeof item.override !== 'boolean') {
          problems.push(`${where}: override 必须是布尔`);
        }
      });
    }
  }

  // derived 字段：eventId 必须等于重算值（手写 ⇒ 红）。
  // 实现只有一份（`eventIdProblems`），API 计费那一份 profile 也调它 —— 两边不可能分家。
  problems.push(...eventIdProblems(core.eventsOf(doc), PROFILE));
  const periodChanged = new Set();
  for (const event of core.eventsOf(doc)) {
    if (event.type === 'ended' && event.reason === 'period_changed') periodChanged.add(event.planId);
  }
  core.eventsOf(doc).forEach((event, index) => {
    const where = `事件 #${index}`;
    if (event.type !== 'created' || event.supersedes === undefined) return;
    if (!PLAN_ID_RE.test(String(event.supersedes))) {
      problems.push(`${where}: created.supersedes 非法（${event.supersedes}）`);
    } else if (event.supersedes === event.planId) {
      problems.push(`${where}: created.supersedes 不能指向自己`);
    } else if (!periodChanged.has(event.supersedes)) {
      problems.push(`${where}: created.supersedes 指向 ${event.supersedes}，但日志里没有它的 ended(period_changed)`);
    }
  });
  void plans; void ctx;
}

/* ------------------------------------------------------------------ */
/* 读取 / 写入 / 基线 / 视图 / 统计                                     */
/* ------------------------------------------------------------------ */

function emptyStore({ at = null } = {}) {
  return core.emptyStore(PROFILE, { at });
}

/**
 * 读取日志文件。**不存在或损坏时不抛**（写入侧只告警，由门禁报错）；
 * `missing` / `broken` 与 `store` 一起返回，调用方必须自己判断 ——
 * 一份坏日志被当成空日志继续追加，会把整段历史洗掉。
 */
function load(file = PLAN_HISTORY_FILE) {
  const result = core.load(file);
  return { ...result, store: result.store || emptyStore() };
}

function save(store, file = PLAN_HISTORY_FILE) {
  return core.save(store, file);
}

function baselineOf(plans, { at, note = PLAN_BASELINE_NOTE } = {}) {
  return core.baselineOf(plans, {
    at, note, fields: PLAN_TRACKED_FIELDS, key: 'id', profile: PROFILE
  });
}

function replay(store) {
  return core.replay(store, PROFILE);
}

function eventsOf(store) {
  return core.eventsOf(store);
}

function verifyStore(store, plans, opts = {}) {
  return core.verifyStore(store, plans, PROFILE, opts);
}

/** 一条套餐的有界变化视图（时间线用） */
function historyFor(store, planId, opts = {}) {
  return core.historyFor(store, planId, PROFILE, opts);
}

/** 把有界变化视图挂到每条套餐上（构建期用；返回新数组，不改入参） */
function attachToPlans(plans, store, opts = {}) {
  return (plans || []).map(plan => {
    if (!plan || !plan.id) return plan;
    const history = historyFor(store, plan.id, opts);
    if (!history) return plan;
    return { ...plan, planHistory: history };
  });
}

function summarize(store, plans) {
  const base = core.summarize(store, plans, PROFILE);
  return {
    ...base,
    anomalies: Array.isArray(store && store.anomalies) ? store.anomalies.length : 0,
    pendingAbsence: Object.values((store && store.absence) || {}).filter(state => state && !state.endedAt).length
  };
}

/** 按 planId 取一条套餐的全部事件（新→旧；时间线渲染用，无上限，调用方自行裁剪） */
function timelineOf(store, planId) {
  return core.eventsOf(store)
    .filter(event => event.planId === planId)
    .slice()
    .sort((a, b) => {
      if (a.at !== b.at) return a.at < b.at ? 1 : -1;
      const rank = event => core.eventRank(event, PROFILE);
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      const fa = a.field || '';
      const fb = b.field || '';
      return fa < fb ? -1 : fa > fb ? 1 : 0;
    });
}

module.exports = {
  PLAN_HISTORY_FILE,
  PLAN_SCHEMA_VERSION,
  PLAN_MISS_CONFIRM_RUNS,
  PLAN_MASS_MISSING_MIN,
  PLAN_MASS_MISSING_RATIO,
  PLAN_ANOMALY_LIMIT,
  PLAN_LIMITS,
  PLAN_RENDER_LIMIT,
  PLAN_ABSENCE_RETENTION_DAYS,
  PLAN_ID_RE,
  PLAN_EVENT_TYPES,
  PLAN_LIFECYCLE_TYPES,
  PLAN_FIELD_TYPES,
  PLAN_END_REASONS,
  PLAN_FIELD_EVENT,
  PLAN_FIELD_EVENT_TYPES,
  PLAN_TRACKED_FIELDS,
  PLAN_UNTRACKED_FIELDS,
  PLAN_HISTORY_WORDING,
  PLAN_BASELINE_NOTE,
  PLAN_COMPARE,
  PROFILE,
  QUANTIFIED_QUOTA_TYPES,
  readField,
  cosmeticEqual,
  noteText,
  modelKeyOf,
  modelSame,
  modelArrayEqual,
  restrictionArrayEqual,
  sortModels,
  applyPlanEvent,
  planEventValueMatches,
  planAlreadyAt,
  planIdentityWithoutPeriod,
  eventIdOf,
  // v3.0：派生身份的写入 / 重算两个入口（写入点走 eventIdFor，verifyStore 走 eventIdProblems）。
  eventIdFor,
  eventIdProblems,
  planFieldEvents,
  record,
  /**
   * v2.5：`record()` 的显式别名 —— 调用方（API 计费变化日志）必须**显式**说明自己用的是
   * 哪一份 profile，而不是靠"参数里恰好带了 profile"这种隐式约定。
   * 两份日志共用同一个写入内核（阈值、熔断、链校验、异常留档全都只有一份实现）。
   */
  recordWithProfile: record,
  replay,
  eventsOf,
  verifyStore,
  historyFor,
  attachToPlans,
  timelineOf,
  summarize,
  emptyStore,
  load,
  save,
  baselineOf,
  lastEventAtOf
};
