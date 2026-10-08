/**
 * v2.5 API 计费变化日志（append-only change log for `api-plans.json`）。
 *
 * ## 与 Coding Plan 变化日志的关系：共用内核，不共用判据
 *
 * 写入内核（阈值、缺席确认、批量熔断、链校验、Stable event id、上限、异常留档）
 * 只有一份实现 —— `lib/plan-history.js` 的 `record()`，v2.5 起它**按 profile 参数化**。
 * 本文件只声明「API 计费的什么算变化」与「API 计费怎么说话」：
 *
 *   · **事件类型表不同**：`price_increased` / `price_decreased` / `unit_changed` /
 *     `currency_changed` / `free_tier_changed` / `credits_changed` / `limits_changed`
 *     在 Coding Plan 里没有对应物；Coding Plan 的 `promo_*` / `quota_*` 在这里也没有；
 *   · **元素级字段不同**：plans 是 `supportedModels`（只有 role/note），
 *     这里是 `models`（**带价格**，身份键是 `(modelKey, variant)`），
 *     因此「同一份清单里的一个元素变了」要能分出涨价 / 降价 / 口径变化三种；
 *   · **重键轴不同**：plans 是 `billing.period`，这里是 `channel`（标准 / 批处理）。
 *
 * ## 模型改名（题面 §九 点名要求"避免 alias 产生假变化"）
 *
 * API 厂商频繁改模型名。本层的处理是**显式的三步**，不做任何模糊匹配：
 *
 *   1. 模型的身份键是人工写的 `modelKey`，显示名 `name` **不进**被跟踪字段
 *      —— 只改显示名（保持 modelKey 不变）**产生零事件**；
 *   2. 未登记的改名会表现为同一记录里一次 `model_removed` + `model_added`
 *      —— 这正是"假新增"，必须**被检测**；
 *   3. `renameCandidatesOf()` 把「同一条记录、同时新增/移除、且单价有完全相同项」
 *      的这一对找出来，写进日志的 `anomalies[]`（有界），并由
 *      `scripts/tools/api-model-rename-report.js` 展开成人可读清单。
 *
 * **检测不等于自动合并**：本文件里没有任何"把两个 modelKey 合并"的代码路径，
 * 修法只有一个 —— 人工把旧名写进 `aliases` 并保持 `modelKey` 不变。
 */

'use strict';

const core = require('./history-core');
const planHistory = require('./plan-history');
const planSchema = require('./plan-schema');
const apiSchema = require('./api-plan-schema');

const API_PLAN_HISTORY_FILE = require('path').join(__dirname, '..', 'data', 'api-plan-history.json');
const API_PLAN_SCHEMA_VERSION = 1;

/** 连续多少次成功运行未见，才记 `ended`（与 plans 同一条判据：没有采集器，判据是"运行"） */
const API_PLAN_MISS_CONFIRM_RUNS = 2;
const API_PLAN_MASS_MISSING_MIN = 3;
const API_PLAN_MASS_MISSING_RATIO = 0.5;
const API_PLAN_ANOMALY_LIMIT = 20;

const API_PLAN_ID_RE = /^[0-9a-f]{12}$/;

const API_PLAN_LIMITS = {
  eventsPerRecord: 400,
  eventsTotal: 40000,
  fileBytes: 2 * 1024 * 1024
};

const API_PLAN_RENDER_LIMIT = 20;
const API_PLAN_ABSENCE_RETENTION_DAYS = 365;

/* ------------------------------------------------------------------ */
/* 事件类型（唯一真值表）                                                */
/* ------------------------------------------------------------------ */

const API_PLAN_EVENT_TYPES = [
  'created',
  'price_increased', 'price_decreased', 'model_added', 'model_removed', 'model_changed',
  'unit_changed', 'currency_changed', 'free_tier_changed', 'credits_changed', 'limits_changed',
  'restriction_changed', 'availability_changed', 'updated',
  'ended', 'restored'
];

const API_PLAN_LIFECYCLE_TYPES = ['created', 'ended', 'restored'];
const API_PLAN_FIELD_TYPES = API_PLAN_EVENT_TYPES.filter(type => !API_PLAN_LIFECYCLE_TYPES.includes(type));

const API_PLAN_END_REASONS = ['source_no_longer_lists', 'channel_changed', 'withdrawn'];

/**
 * 一个字段可对应的事件类型。`models` 那一条是"值决定类型"的典型：
 * 同一个元素的变化可以是一次涨价、一次降价，或一次口径/别名变化。
 */
const API_PLAN_FIELD_EVENT_TYPES = {
  'pricing.currency': ['currency_changed'],
  'pricing.unit': ['unit_changed'],
  models: ['price_increased', 'price_decreased', 'model_added', 'model_removed', 'model_changed'],
  'freeTier.type': ['free_tier_changed'],
  'freeTier.amount': ['free_tier_changed'],
  'freeTier.period': ['free_tier_changed'],
  'freeTier.models': ['free_tier_changed'],
  'freeTier.description': ['free_tier_changed'],
  credits: ['credits_changed'],
  limits: ['limits_changed'],
  restrictions: ['restriction_changed'],
  region: ['availability_changed'],
  officialUrl: ['updated'],
  source: ['updated'],
  sourceUrl: ['updated']
};

const API_PLAN_TRACKED_FIELDS = Object.keys(API_PLAN_FIELD_EVENT_TYPES);

const API_PLAN_FIELD_EVENT = {};
for (const [field, types] of Object.entries(API_PLAN_FIELD_EVENT_TYPES)) API_PLAN_FIELD_EVENT[field] = types[0];

/**
 * **不**跟踪的字段与理由。少一个字段时先看这张表，别急着往 `API_PLAN_TRACKED_FIELDS` 里加。
 */
const API_PLAN_UNTRACKED_FIELDS = {
  id: '身份的一部分（id = sha1(api|provider|planNameKey|channel)），变了就是另一条记录 ⇒ ended + created',
  kind: '常量（api）',
  provider: '身份的一部分；改 provider 只可能是错字，且未登记的 provider 连写盘都过不了',
  planName: '身份的一部分',
  channel: '身份的一部分 —— 标准 / 批处理是两个可售 SKU，走 ended(channel_changed) + created',
  'models[].name': '模型的**显示名**（官方原文）。身份是 `modelKey`：只改显示名产生零事件 —— '
    + '这正是题面 §九 "避免 alias 产生假变化" 的落点。未登记的改名由 「移除+新增」检测出来',
  'models[].modelKey': '模型的**身份**（人写）。它变了就是另一个模型条目 —— 未被检测到的改名会表现为'
    + ' 同一记录里的 model_removed + model_added，并被 `possible_rename` 异常留档',
  'models[].variant': '元素身份的一部分（`(modelKey, variant)`）',
  firstSeen: '簿记：首次收录日期，由 created 事件回答',
  lastSeen: '人工每次回访官方页都会刷新 —— 记它等于每轮造一批假事件',
  verified: '人工核验声明；核验是**我们**的动作，不是厂商的变化',
  verifiedAt: '同上',
  evidence: '每条引文都可能被重新抄一遍，抄写差异不是价格变化',
  derivedMetrics: '**派生值**（本阶段恒为 {}）；它的输入变了自然有对应事件，再记一条就是同一件事报两次',
  'pricing.unitNote': '自由文本备注；单位本身的语义变化由 `pricing.unit` 记'
};

/* ------------------------------------------------------------------ */
/* 措辞（唯一权威；前端不需要副本 —— 这些字只在服务端渲染）                */
/* ------------------------------------------------------------------ */

// [T5-api-plan-history-192-disclaimer-tail]
// T5 删除（census B · 重复）：删「价格、免费额度与条款最终以厂商官方页面为准。」—— 与共享页脚同义。保留前半句。⚠️ 同一常量（`API_PLAN_HISTORY_NOTES.disclaimer`）也被 /plans/api/、/plans/ 与 API 变化 Feed 消费。
const API_PLAN_HISTORY_WORDING = {
  API_PLAN_HISTORY_LABELS: {
    sectionTitle: '价格变更记录',
    empty: '暂无价格变更记录',
    since: '价格变更记录自 {date} 起（此前状态没有记录）',
    more: '另有 {n} 条更早的记录未在此显示',
    from: '原',
    to: '新',
    /**
     * v3.0：记录已不在当前数据里、又没有留下标题快照时的那句话。
     * **唯一出处** —— `/changes/` 的 API 分栏、`/plans/api/` 与 API 订阅的正文都读它；
     * 各写一份就会立刻出现「同一件事两种说法」。
     */
    tombstone: '（已移除的计费记录，无标题快照）',
    unavailable: '本次构建没有拿到 API 计费变化日志（api-plan-history.json 缺失或损坏）——这不表示「没有变化」。'
  },
  API_PLAN_HISTORY_TYPES: {
    created: '首次收录',
    price_increased: '涨价',
    price_decreased: '降价',
    model_added: '新增模型',
    model_removed: '移除模型',
    model_changed: '计价口径变化',
    unit_changed: '计费单位变化',
    currency_changed: '币种变化',
    free_tier_changed: '免费额度变化',
    credits_changed: '预付费额度（credits）变化',
    limits_changed: '速率限制变化',
    restriction_changed: '限制条件变化',
    availability_changed: '销售地区变化',
    updated: '记录信息更新',
    ended: '不再收录',
    restored: '重新出现'
  },
  API_PLAN_HISTORY_END_REASONS: {
    source_no_longer_lists: '人工来源层不再列出（连续两次重建未见）',
    channel_changed: '计费通道变化（标准 / 批处理是两个可售 SKU，视为新的记录）',
    withdrawn: '已移除（人工显式放行批量下架）'
  },
  API_PLAN_HISTORY_FIELD_LABELS: {
    'pricing.currency': '币种',
    'pricing.unit': '计费单位',
    models: '模型价格',
    'freeTier.type': '免费额度类型',
    'freeTier.amount': '免费额度数值',
    'freeTier.period': '免费额度刷新周期',
    'freeTier.models': '免费模型清单',
    'freeTier.description': '免费额度说明',
    credits: '预付费额度',
    limits: '速率限制',
    restrictions: '限制条件',
    region: '销售地区',
    officialUrl: '官方定价页',
    source: '来源类型',
    sourceUrl: '来源地址'
  },
  API_PLAN_HISTORY_NOTES: {
    lifecycle: '本条记录的生命周期事件',
    emptyNote: '起算日之前的状态没有历史记录，因此这里不显示任何变化。',
    unitNote: '价格数字的口径由「计费单位」决定；单位变化会被单独记为一次变化，本站不做任何单位换算。',
    disclaimer: '以上是本站重建 API 计费数据时留下的观测记录；「不再收录」表示人工来源层不再列出该条记录，'
      + '不表示厂商已经下架或停止提供。'
  }
};

const API_PLAN_BASELINE_NOTE = 'v2.5 开工时的既有状态快照（只含被跟踪字段）。它不是创建事件——'
  + '这些 API 计费记录在此之前就存在，只是此前没有变化日志。';

/* ------------------------------------------------------------------ */
/* 字段投影与相等判据                                                   */
/* ------------------------------------------------------------------ */

const cosmeticEqual = planHistory.cosmeticEqual;
const noteText = planHistory.noteText;

/** 读字段：支持 `freeTier.amount` 这样的路径；`freeTier.description` 带投影（见下） */
function readApiField(record, field) {
  if (!record) return undefined;
  // **投影**：量化型免费额度（tokens / credits / requests）的 description 是解释性散文，
  // 不作为额度语义跟踪；语义全在文字里的类型（rate_limited / none / models / other）才跟踪它。
  if (field === 'freeTier.description') {
    const type = record.freeTier && record.freeTier.type;
    if (apiSchema.FREE_TIER_QUANTIFIED.includes(type)) return null;
  }
  if (field.indexOf('.') < 0) return record[field];
  let cursor = record;
  for (const part of field.split('.')) {
    if (cursor === null || typeof cursor !== 'object') return undefined;
    cursor = cursor[part];
  }
  return cursor;
}

/* ------------------------------ 元素级：模型价格 ------------------------------ */

const modelEntryKeyOf = apiSchema.modelEntryKeyOf;

function modelMapOf(list) {
  const map = new Map();
  for (const entry of Array.isArray(list) ? list : []) {
    if (entry && typeof entry === 'object') map.set(modelEntryKeyOf(entry), entry);
  }
  return map;
}

/**
 * 两个模型条目是不是"同一件事实"。
 *
 * **刻意不看 `name`**：显示名是官方原文，厂商改名（保持 modelKey）不该产生任何事件
 * —— 这是题面 §九 那一条的落点。也被差异计算与链校验共用，因此两边不可能分家。
 */
function sameModelEntry(a, b) {
  if (!a || !b) return a === b;
  if (JSON.stringify(a.rates) !== JSON.stringify(b.rates)) return false;
  if (core.stableJson(a.mediaRates) !== core.stableJson(b.mediaRates)) return false;
  if (core.stableJson(a.aliases) !== core.stableJson(b.aliases)) return false;
  return cosmeticEqual(a.note, b.note);
}

function modelArrayEqual(a, b) {
  const left = mapOfOrNull(a);
  const right = mapOfOrNull(b);
  if (!left && !right) return true;
  if (!left || !right) return false;
  if (left.size !== right.size) return false;
  for (const [key, entry] of left) {
    const other = right.get(key);
    if (!other) return false;
    if (!sameModelEntry(entry, other)) return false;
  }
  return true;
}

function mapOfOrNull(value) {
  if (!Array.isArray(value) || !value.length) return null;
  return modelMapOf(value);
}

/** 变了哪些 token 维度（旧值 ≠ 新值） */
function changedRateKeys(a, b) {
  const keys = [];
  for (const key of apiSchema.TOKEN_RATE_KEYS) {
    const from = (a.rates && a.rates[key] === undefined) ? null : a.rates[key];
    const to = (b.rates && b.rates[key] === undefined) ? null : b.rates[key];
    if (from !== to) keys.push(key);
  }
  return keys;
}

/**
 * 一次元素变化属于哪一类：
 *   · 所有变动的 token 维度**同向上升** ⇒ `price_increased`；
 *   · 全部**同向下降** ⇒ `price_decreased`；
 *   · 出现 null ↔ 数字（维度新增/取消）或方向混杂 ⇒ `model_changed`（口径变化）。
 *
 * 为什么不在"方向混杂"时挑一个方向：那会把「输入涨、输出降」写成一次单向变化，
 * 读者据此得出的结论是错的。宁可说"计价口径变化"并逐项列出。
 */
function priceEventTypeOf(a, b) {
  const keys = changedRateKeys(a, b);
  if (!keys.length) return 'model_changed';
  let up = 0;
  let down = 0;
  for (const key of keys) {
    const from = a.rates[key];
    const to = b.rates[key];
    if (typeof from !== 'number' || typeof to !== 'number') return 'model_changed';
    if (to > from) up++;
    else if (to < from) down++;
  }
  if (up && !down) return 'price_increased';
  if (down && !up) return 'price_decreased';
  return 'model_changed';
}

/* ------------------------------ 数组型标量字段 ------------------------------ */

function byKeyArrayEqual(a, b, keyOf, fieldEqual) {
  const left = Array.isArray(a) ? a : null;
  const right = Array.isArray(b) ? b : null;
  if (!left && !right) return true;
  if (!left || !right) return false;
  if (left.length !== right.length) return false;
  const map = new Map();
  for (const item of left) map.set(keyOf(item), item);
  for (const item of right) {
    const other = map.get(keyOf(item));
    if (!other) return false;
    if (!fieldEqual(other, item)) return false;
  }
  return true;
}

/**
 * 速率限制比较：按 `(kind, appliesTo)` 成对比较，`value` 严格、`note` 走文案归一，顺序无关。
 * 键必须带上 `appliesTo` —— 同一条记录里 `concurrency` 可以按模型分档出现两次，
 * 只按 `kind` 建索引会让两份不同的限速表被判成相同。
 */
function limitsArrayEqual(a, b) {
  return byKeyArrayEqual(a, b, item => `${(item && item.kind) || ''}|${item && item.appliesTo ? item.appliesTo.join(',') : ''}`, (x, y) => {
    if (x.value !== y.value) return false;
    return cosmeticEqual(x.note, y.note);
  });
}

function creditsArrayEqual(a, b) {
  const normalize = list => (Array.isArray(list) ? list : null);
  const left = normalize(a);
  const right = normalize(b);
  if (!left && !right) return true;
  if (!left || !right) return false;
  const keyOf = item => core.stableJson([
    item && item.pay, item && item.currency, item && item.gets, item && item.unit
  ]);
  const shape = item => core.stableJson({
    pay: item && item.pay,
    currency: item && item.currency,
    gets: item && item.gets,
    unit: item && item.unit,
    expires: noteText(item && item.expires),
    usageNote: noteText(item && item.usageNote),
    description: noteText(item && item.description)
  });
  return core.stableJson(left.map(keyOf).sort()) === core.stableJson(right.map(keyOf).sort())
    && core.stableJson(left.map(shape).sort()) === core.stableJson(right.map(shape).sort());
}

/** 按字段覆写的相等判据（差异计算与一致性校验共用同一份） */
const API_PLAN_COMPARE = {
  'freeTier.description': cosmeticEqual,
  models: modelArrayEqual,
  limits: limitsArrayEqual,
  credits: creditsArrayEqual,
  restrictions: planHistory.restrictionArrayEqual
};

/* ------------------------------------------------------------------ */
/* 元素级事件的应用与判据                                                */
/* ------------------------------------------------------------------ */

/**
 * 把一条字段事件应用到值表上。
 * 除 `models` 外与内核缺省一致；`models` 是**按元素**记的（新增/移除/涨价/降价/口径变化各一条），
 * 所以这里改的是"清单里的那一个元素"，而不是把整份清单换成那一个条目。
 */
function applyApiEvent(values, event) {
  if (event.field !== 'models') {
    if (event.to === null || event.to === undefined) delete values[event.field];
    else values[event.field] = event.to;
    return values;
  }
  const key = modelEntryKeyOf(event.to || event.from);
  let list = (Array.isArray(values.models) ? values.models : [])
    .filter(entry => modelEntryKeyOf(entry) !== key);
  if (event.to) list.push(event.to);
  list = list.slice().sort((a, b) => {
    const ka = modelEntryKeyOf(a);
    const kb = modelEntryKeyOf(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
  if (list.length) values.models = list;
  else delete values.models;
  return values;
}

function apiEventValueMatches(field, current, value, event) {
  if (field !== 'models') return core.valuesEqual(API_PROFILE, field, current, value);
  const list = Array.isArray(current) ? current : [];
  const probe = value === null || value === undefined ? event.to : value;
  const found = list.find(entry => modelEntryKeyOf(entry) === modelEntryKeyOf(probe));
  if (value === null || value === undefined) return !found;
  return Boolean(found) && sameModelEntry(found, value);
}

function apiAlreadyAt(field, current, to, event) {
  if (field !== 'models') return core.valuesEqual(API_PROFILE, field, current, to);
  const list = Array.isArray(current) ? current : [];
  const probe = to === null || to === undefined ? event.from : to;
  const found = list.find(entry => modelEntryKeyOf(entry) === modelEntryKeyOf(probe));
  if (to === null || to === undefined) return !found;
  return Boolean(found) && sameModelEntry(found, to);
}

/* ------------------------------------------------------------------ */
/* 差异计算（API 计费的语义在这里，且只在这里）                          */
/* ------------------------------------------------------------------ */

function apiFieldEvents(record, prevValues, { at, originFields = null, runAt = null } = {}) {
  const current = core.trackedValuesOf(record, API_PLAN_TRACKED_FIELDS, API_PROFILE);
  const prev = prevValues || {};
  const events = [];
  const push = (field, type, from, to) => {
    events.push({
      planId: record.id, at, type, field, from, to,
      origin: originFields instanceof Set && originFields.has(field) ? 'derived' : 'observed',
      ...(runAt ? { runAt } : {})
    });
  };

  for (const field of API_PLAN_TRACKED_FIELDS) {
    if (field === 'models') continue;   // 元素级单独处理
    const from = Object.prototype.hasOwnProperty.call(prev, field) ? prev[field] : null;
    const to = Object.prototype.hasOwnProperty.call(current, field) ? current[field] : null;
    if (core.valuesEqual(API_PROFILE, field, from, to)) continue;
    push(field, API_PLAN_FIELD_EVENT[field], from, to);
  }

  const before = modelMapOf(prev.models);
  const after = modelMapOf(current.models);
  const keys = [...new Set([...before.keys(), ...after.keys()])].sort();
  for (const key of keys) {
    const old = before.get(key);
    const now = after.get(key);
    if (!old && now) push('models', 'model_added', null, now);
    else if (old && !now) push('models', 'model_removed', old, null);
    else if (old && now && !sameModelEntry(old, now)) push('models', priceEventTypeOf(old, now), old, now);
  }
  return events;
}

/* ------------------------------------------------------------------ */
/* 疑似改名检测（题面 §九："model rename 制造大量假新增 → 必须检测"）      */
/* ------------------------------------------------------------------ */

/**
 * 在**同一条记录**里找「一次运行同时出现新增与移除、且单价存在完全相同的项」的对。
 *
 * 为什么判据是"单价有完全相同的项"而不是名字相似度：本仓对相似度匹配有实测教训
 * （`/krea/i` 命中 `Kreado AI`）。价格完全相同是**事实**，名字相似不是。
 * 代价是漏检（改名同时改价就查不到）—— 那就如实漏检，不由工具猜。
 *
 * @returns {object[]} 候选（按 planId、removed、added 排序，确定性）
 */
function renameCandidatesOf(previous, next) {
  const beforeById = new Map((previous || []).filter(Boolean).map(plan => [plan.id, plan]));
  const out = [];
  for (const plan of next || []) {
    if (!plan || !plan.id) continue;
    const prev = beforeById.get(plan.id);
    if (!prev) continue;
    const prevMap = modelMapOf(prev.models);
    const nextMap = modelMapOf(plan.models);
    const removed = [...prevMap.keys()].filter(key => !nextMap.has(key)).sort();
    const added = [...nextMap.keys()].filter(key => !prevMap.has(key)).sort();
    if (!removed.length || !added.length) continue;
    for (const oldKey of removed) {
      const oldEntry = prevMap.get(oldKey);
      for (const newKey of added) {
        const newEntry = nextMap.get(newKey);
        const same = apiSchema.TOKEN_RATE_KEYS.filter(key =>
          oldEntry.rates[key] !== null && oldEntry.rates[key] === newEntry.rates[key]);
        if (!same.length) continue;
        out.push({
          planId: plan.id,
          provider: plan.provider,
          planName: plan.planName,
          removed: oldKey,
          removedName: oldEntry.name,
          added: newKey,
          addedName: newEntry.name,
          sameRates: same
        });
      }
    }
  }
  return out.sort((a, b) => {
    if (a.planId !== b.planId) return a.planId < b.planId ? -1 : 1;
    if (a.removed !== b.removed) return a.removed < b.removed ? -1 : 1;
    return a.added < b.added ? -1 : a.added > b.added ? 1 : 0;
  });
}

/* ------------------------------------------------------------------ */
/* 事件身份（派生字段）                                                  */
/* ------------------------------------------------------------------ */

/**
 * API 计费变化事件的派生身份（v3.0 补的缺口）。
 *
 * ## 为什么之前"没有"这件事是缺口
 *
 * 写入内核（`plan-history.recordWithProfile`）一直会给事件打上 `eventId`，但
 * `api-plan-history` 这一侧**没有任何地方能重算它**：`verifyStore` 走的是
 * `API_PROFILE.validateExtra`，而那里此前不检查 `eventId`。于是「同一条事件只有一个身份」
 * 这条保证在 API 计费这份日志上只存在于**写入的瞬间**，事后手改、外部工具重写、
 * 或换一份推导公式，都不会有任何东西变红。
 *
 * ## 为什么基（basis）与 `plan-history.eventIdOf` **逐字相同**
 *
 * 事件身份是**日志内核**的性质，不是领域判据：两份日志共用 `history-core` 的事件键、
 * 链校验、重放与写入内核，那么「身份怎么算」也必须共用同一条推导 —— 领域差异体现在
 * 事件**内容**（字段表 / 事件类型表 / 重标识轴）上，不体现在哈希基上。
 *
 * 反过来说，如果这里另写一套基，那么写入点（内核按 `profile.eventIdOf` 打的）与
 * 校验点（本函数重算的）就会算出两个不同的值 —— 而两个值都是 12 位 hex，
 * 这种分家在人工检查里根本看不出来。
 *
 * @param {object} event 日志里的一条事件（`{planId, at, type, field, from, to, reason, ...}`）
 * @returns {string} 12 位十六进制的稳定身份
 */
function apiPlanEventIdOf(event) {
  return planHistory.eventIdOf(event);
}

/* ------------------------------------------------------------------ */
/* Profile                                                             */
/* ------------------------------------------------------------------ */

const API_PROFILE = {
  schemaVersion: API_PLAN_SCHEMA_VERSION,
  recordKey: 'id',
  eventKeyName: 'planId',
  trackedFields: API_PLAN_TRACKED_FIELDS,
  fieldEvent: API_PLAN_FIELD_EVENT,
  allowedEventTypes: field => API_PLAN_FIELD_EVENT_TYPES[field] || [API_PLAN_FIELD_EVENT[field]],
  eventTypes: API_PLAN_EVENT_TYPES,
  lifecycleTypes: API_PLAN_LIFECYCLE_TYPES,
  fieldTypes: API_PLAN_FIELD_TYPES,
  endReasons: API_PLAN_END_REASONS,
  fieldLabels: API_PLAN_HISTORY_WORDING.API_PLAN_HISTORY_FIELD_LABELS,
  baselineNote: API_PLAN_BASELINE_NOTE,
  limits: API_PLAN_LIMITS,
  renderLimit: API_PLAN_RENDER_LIMIT,
  absenceRetentionDays: API_PLAN_ABSENCE_RETENTION_DAYS,
  missConfirmRuns: API_PLAN_MISS_CONFIRM_RUNS,
  massMissingMin: API_PLAN_MASS_MISSING_MIN,
  massMissingRatio: API_PLAN_MASS_MISSING_RATIO,
  anomalyLimit: API_PLAN_ANOMALY_LIMIT,
  rankTypes: { created: 0, restored: 1, ended: 2 },
  fieldRankBase: 10,
  readField: readApiField,
  compare: API_PLAN_COMPARE,
  applyEvent: applyApiEvent,
  eventValueMatches: apiEventValueMatches,
  alreadyAt: apiAlreadyAt,
  fieldEvents: apiFieldEvents,
  identityWithoutAxis: plan => `api|${plan && plan.provider}|${planSchema.planNameKeyOf(plan && plan.planName)}`,
  axisOf: plan => (plan && plan.channel) || null,
  axisChangeReason: 'channel_changed',
  idRe: API_PLAN_ID_RE,
  /**
   * v3.0：派生 eventId 的推导由 profile 声明。写入点（内核）与重算点（`apiValidateExtra`）
   * 都读这一个函数，因此「日志里的 id」与「重算的 id」不可能分家。
   */
  eventIdOf: apiPlanEventIdOf,
  docLabel: 'API 计费变更日志',
  recordsLabel: 'api-plans.json',
  passthroughKeys: ['anomalies'],
  emptyExtra: { anomalies: [] },
  normalizeExtra: {
    anomalies: value => (Array.isArray(value) ? value.filter(item => item && typeof item === 'object') : [])
  },
  /**
   * 领域附加异常：疑似模型改名。由内核在**同一处**裁剪到 `anomalyLimit`，
   * 因此两种数据的上限是同一条纪律。
   */
  extraAnomalies: ({ previous, next, at }) => renameCandidatesOf(previous, next).map(item => ({
    at,
    kind: 'possible_rename',
    planId: item.planId,
    removed: item.removed,
    added: item.added,
    sameRates: item.sameRates
  })),
  validateExtra: apiValidateExtra
};

/** 领域附加段的校验（内核在看不懂附加段时只做形状检查） */
function apiValidateExtra(doc, plans, problems) {
  const list = Array.isArray(doc && doc.anomalies) ? doc.anomalies : [];
  list.forEach((item, index) => {
    const where = `anomalies[${index}]`;
    if (!item || typeof item !== 'object') { problems.push(`${where}: 不是对象`); return; }
    if (item.kind === 'mass_missing') return;
    if (item.kind !== 'possible_rename') {
      problems.push(`${where}: 未知的 kind（${item.kind}）`);
      return;
    }
    if (!API_PLAN_ID_RE.test(String(item.planId || ''))) problems.push(`${where}: planId 非法`);
    if (typeof item.removed !== 'string' || typeof item.added !== 'string') {
      problems.push(`${where}: 必须给出 removed / added 两个元素键`);
    }
    if (!Array.isArray(item.sameRates) || !item.sameRates.length) {
      problems.push(`${where}: sameRates 必须是非空数组（没有相同项就不该判为疑似改名）`);
    }
  });

  // 派生字段：`eventId` 必须等于重算值（手写 / 外部工具改写 ⇒ 红）。
  // 实现与 plans 那一边**共用同一条**（`plan-history.eventIdProblems`），
  // 因此「哪些事件必须带 id」「怎么重算」这两件事只有一份说法。
  problems.push(...planHistory.eventIdProblems(core.eventsOf(doc), API_PROFILE));
}

/* ------------------------------------------------------------------ */
/* 唯一写入入口（薄封装共享内核）                                        */
/* ------------------------------------------------------------------ */

/**
 * 把一次重建的观测结果并进变化日志。**纯函数**；内核在 `lib/plan-history.js`。
 *
 * @returns {{store, stats, problems, missing, appended, renameCandidates}}
 */
function record(store, params = {}) {
  const result = planHistory.recordWithProfile(store, { ...params, profile: API_PROFILE });
  return { ...result, renameCandidates: renameCandidatesOf(params.previous || [], params.next || []) };
}

/* ------------------------------------------------------------------ */
/* 读 / 写 / 视图                                                       */
/* ------------------------------------------------------------------ */

function emptyStore({ at = null } = {}) {
  return core.emptyStore(API_PROFILE, { at });
}

function load(file = API_PLAN_HISTORY_FILE) {
  const result = core.load(file);
  return { ...result, store: result.store || emptyStore() };
}

function save(store, file = API_PLAN_HISTORY_FILE) {
  return core.save(store, file);
}

function baselineOf(plans, { at, note = API_PLAN_BASELINE_NOTE } = {}) {
  return core.baselineOf(plans, { at, note, fields: API_PLAN_TRACKED_FIELDS, key: 'id', profile: API_PROFILE });
}

function replay(store) {
  return core.replay(store, API_PROFILE);
}

function eventsOf(store) {
  return core.eventsOf(store);
}

function verifyStore(store, plans, opts = {}) {
  return core.verifyStore(store, plans, API_PROFILE, opts);
}

function historyFor(store, planId, opts = {}) {
  return core.historyFor(store, planId, API_PROFILE, opts);
}

function attachToPlans(plans, store, opts = {}) {
  return (plans || []).map(plan => {
    if (!plan || !plan.id) return plan;
    const history = historyFor(store, plan.id, opts);
    if (!history) return plan;
    return { ...plan, planHistory: history };
  });
}

function timelineOf(store, planId) {
  return core.eventsOf(store)
    .filter(event => event.planId === planId)
    .slice()
    .sort((a, b) => {
      if (a.at !== b.at) return a.at < b.at ? 1 : -1;
      const rank = event => core.eventRank(event, API_PROFILE);
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      const fa = a.field || '';
      const fb = b.field || '';
      return fa < fb ? -1 : fa > fb ? 1 : 0;
    });
}

function summarize(store, plans) {
  const base = core.summarize(store, plans, API_PROFILE);
  return {
    ...base,
    anomalies: Array.isArray(store && store.anomalies) ? store.anomalies.length : 0,
    renameCandidates: Array.isArray(store && store.anomalies)
      ? store.anomalies.filter(item => item && item.kind === 'possible_rename').length
      : 0,
    pendingAbsence: Object.values((store && store.absence) || {}).filter(state => state && !state.endedAt).length
  };
}

function lastEventAtOf(store, planId) {
  return planHistory.lastEventAtOf(store, planId);
}

module.exports = {
  API_PLAN_HISTORY_FILE,
  API_PLAN_SCHEMA_VERSION,
  API_PLAN_MISS_CONFIRM_RUNS,
  API_PLAN_MASS_MISSING_MIN,
  API_PLAN_MASS_MISSING_RATIO,
  API_PLAN_ANOMALY_LIMIT,
  API_PLAN_LIMITS,
  API_PLAN_RENDER_LIMIT,
  API_PLAN_ABSENCE_RETENTION_DAYS,
  API_PLAN_ID_RE,
  API_PLAN_EVENT_TYPES,
  API_PLAN_LIFECYCLE_TYPES,
  API_PLAN_FIELD_TYPES,
  API_PLAN_END_REASONS,
  API_PLAN_FIELD_EVENT,
  API_PLAN_FIELD_EVENT_TYPES,
  API_PLAN_TRACKED_FIELDS,
  API_PLAN_UNTRACKED_FIELDS,
  API_PLAN_HISTORY_WORDING,
  API_PLAN_BASELINE_NOTE,
  API_PLAN_COMPARE,
  API_PROFILE,
  // v3.0：API 计费变化事件的派生身份（写入点与 verifyStore 共用同一个推导）。
  apiPlanEventIdOf,
  readApiField,
  modelEntryKeyOf,
  modelMapOf,
  sameModelEntry,
  modelArrayEqual,
  priceEventTypeOf,
  changedRateKeys,
  renameCandidatesOf,
  apiFieldEvents,
  record,
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
