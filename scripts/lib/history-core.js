/**
 * 通用变更日志内核（append-only change log core）。
 *
 * ## 为什么会有这个文件
 *
 * v1.4 的 `lib/history.js` 里，真正**与业务无关**的东西只有一半：确定性序列化、
 * 一次性基线 + 追加事件的重放、链校验、「基线+事件 ⇒ 当前状态」的一致性校验。
 * 另一半是 deals 独有的：跟踪哪些字段、字段变了算哪一类事件、「来源不再列出」怎么判。
 *
 * v2.3 要给 Coding Plan 建第二份变化日志。**复制一份 history.js 是最坏的写法**：
 * 两份「重放」实现迟早会分家，而分家之后两边都还是绿的 —— 这类日志一旦分家，
 * 「日志与当前状态一致」这条保证就只剩一半是真的。所以这里把无关业务的那一半抽出来，
 * `history.js`（deals）与 `plan-history.js`（plans）各自只提供一份 **profile**。
 *
 * ## profile 是什么
 *
 * 领域侧只提供「什么算变化」与「怎么说话」，机制全部在内核里：
 *
 *   schemaVersion   历史文件版本
 *   recordKey       记录身份字段名（deals: `id`；plans: `planId`）
 *   trackedFields   被跟踪字段（**顺序即序列化顺序与排序序**）
 *   fieldEvent      字段 → 事件类型
 *   eventTypes      合法事件类型（含生命周期）
 *   lifecycleTypes  不带 field/from/to 的那几种
 *   endReasons      `ended` 的合法 reason
 *   fieldLabels     字段的中文标签（校验报错用）
 *   baselineNote    基线文件的固定说明
 *   limits / renderLimit / absenceRetentionDays
 *   readField       读字段（缺省 `record[field]`；plans 的字段是 `billing.regularPrice` 这种带点的路径）
 *   compare         可选的**按字段相等判据覆写**（plans 的自由文本字段走文案归一）
 *   passthroughKeys / emptyExtra / normalizeExtra  领域自己的附加顶层段（plans 的 `anomalies`）
 *   validateExtra   可选的附加校验钩子
 *
 * ## 三条纪律（与两个领域共同）
 *
 * 1. **一次性基线 + 追加事件**，不做每日全量快照、不做 git diff（理由见 `docs/SCHEMA-v1.4.md`）。
 * 2. **不伪造历史**：存量数据在启用日志之前没有历史，只有一份明确标注「不是创建事件」的基线。
 * 3. **超限是门禁红，不自动截断**：静默丢历史比没有历史更糟。
 *
 * 内核对两个领域**行为完全一致**：同样的 `(store, 输入)` 必须产出同一串字节。
 * deals 侧的行为等价性由 `selftest:history`（61 项）与 `check:history` 钉住。
 */

'use strict';

const fs = require('fs');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** 记录身份的默认形状：12 位小写 hex（deals 与 plans 同用） */
const DEFAULT_ID_RE = /^[0-9a-f]{12}$/;
/** 事件来源：observed = 直接观测到的新值；derived = 由本站规则推导出来的值 */
const EVENT_ORIGINS = ['observed', 'derived'];

/* ------------------------------------------------------------------ */
/* 值归一与确定性序列化                                                 */
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

/** 读字段：缺省直取；领域可以覆写成路径读取（`billing.regularPrice`） */
function readField(profile, record, field) {
  if (typeof profile.readField === 'function') return profile.readField(record, field);
  return record ? record[field] : undefined;
}

/**
 * 两个值在**这个字段的语义下**是否相同。
 *
 * 缺省是逐字节比较；领域可以用 `profile.compare[field]` 换成更松的判据
 * （plans 的自由文本字段走「文案归一」：只差空白与标点不算变化）。
 * 注意这是**差异计算**这一层的判据 —— 一旦某个字段在这里被判定为「没变」，
 * 它就根本不会产生事件，因此不存在「产生了事件再降级」的第二套逻辑。
 */
function valuesEqual(profile, field, a, b) {
  const compare = profile.compare && profile.compare[field];
  if (typeof compare === 'function') return compare(a, b);
  return sameValue(a, b);
}

/**
 * 记录身份在**事件**上的字段名。
 * deals 用 `id`；plans 的数据记录是 `id`、而事件上刻意写成 `planId`
 * （题面 §四 的事件结构就是这么写的）—— 所以这两个名字必须分开，不能混用。
 */
function eventKeyNameOf(profile) {
  return profile.eventKeyName || profile.recordKey;
}

/** 事件上的记录身份 */
function keyOf(profile, event) {
  return event ? event[eventKeyNameOf(profile)] : undefined;
}

/** 一条记录里被跟踪字段的当前值（缺席 → 不写进对象，基线因此不写一堆 null） */
function trackedValuesOf(record, fields, profile = null) {
  const out = {};
  for (const field of fields) {
    const raw = profile ? readField(profile, record, field) : (record ? record[field] : null);
    const value = normValue(raw);
    if (value !== null) out[field] = value;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 读取 / 写入 / 基线                                                   */
/* ------------------------------------------------------------------ */

function cloneDefault(value) {
  if (Array.isArray(value)) return value.slice();
  if (value && typeof value === 'object') return { ...value };
  return value;
}

/** 空文档：键序固定（schemaVersion · startedAt · baseline · absence · 领域附加段 · events） */
function emptyStore(profile, { at = null } = {}) {
  const store = {
    schemaVersion: profile.schemaVersion,
    startedAt: at,
    baseline: { at, note: profile.baselineNote, fields: {} },
    absence: {}
  };
  for (const key of profile.passthroughKeys || []) {
    store[key] = cloneDefault((profile.emptyExtra || {})[key]);
  }
  store.events = [];
  return store;
}

/** 归一 store：缺段补齐、非法值回落（只清洗，报错交给 verifyStore） */
function normalizeStore(store, profile) {
  const base = emptyStore(profile, { at: (store && store.startedAt) || null });
  if (!store || typeof store !== 'object') return base;
  const out = {
    schemaVersion: profile.schemaVersion,
    startedAt: typeof store.startedAt === 'string' ? store.startedAt : null,
    baseline: store.baseline && typeof store.baseline === 'object' && !Array.isArray(store.baseline)
      ? {
        at: typeof store.baseline.at === 'string' ? store.baseline.at : null,
        note: typeof store.baseline.note === 'string' ? store.baseline.note : profile.baselineNote,
        fields: store.baseline.fields && typeof store.baseline.fields === 'object' && !Array.isArray(store.baseline.fields)
          ? store.baseline.fields : {}
      }
      : base.baseline,
    absence: store.absence && typeof store.absence === 'object' && !Array.isArray(store.absence) ? store.absence : {}
  };
  for (const key of profile.passthroughKeys || []) {
    const normalize = profile.normalizeExtra && profile.normalizeExtra[key];
    out[key] = typeof normalize === 'function' ? normalize(store[key]) : base[key];
  }
  out.events = Array.isArray(store.events) ? store.events : [];
  return out;
}

/**
 * 读取日志文件。
 * **不存在或损坏时不抛**：写入方不该因为一份日志文件写坏就跑不动；
 * 损坏由门禁拦（写入侧只告警）。
 */
function load(file) {
  const missing = !fs.existsSync(file);
  if (missing) return { store: null, file, missing: true, broken: null };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { store: null, file, missing: false, broken: '不是 JSON 对象' };
    }
    return { store: parsed, file, missing: false, broken: null };
  } catch (error) {
    return { store: null, file, missing: false, broken: error.message };
  }
}

/** 写盘。key 顺序固定，`events` 追加式；无事发生的运行必须字节不变 */
function save(store, file) {
  fs.writeFileSync(file, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
  return store;
}

/** 从一批当前记录构造基线（一次性；只在启用日志时由 baseline 工具生成） */
function baselineOf(records, { at, note, fields, key = 'id', profile = null }) {
  const values = {};
  for (const record of records || []) {
    if (!record || !record[key]) continue;
    const tracked = trackedValuesOf(record, fields, profile);
    if (Object.keys(tracked).length) values[record[key]] = tracked;
  }
  const sorted = {};
  for (const id of Object.keys(values).sort()) sorted[id] = values[id];
  return { at, note, fields: sorted };
}

function eventsOf(store) {
  return store && Array.isArray(store.events) ? store.events : [];
}

/* ------------------------------------------------------------------ */
/* 排序与重放                                                           */
/* ------------------------------------------------------------------ */

/** 事件排序键：生命周期在前（created 最先），字段事件按 trackedFields 顺序 */
function eventRank(event, profile) {
  const fixed = profile.rankTypes && profile.rankTypes[event.type];
  if (fixed !== undefined) return fixed;
  const at = profile.trackedFields.indexOf(event.field);
  return (profile.fieldRankBase || 10) + (at < 0 ? profile.trackedFields.length : at);
}

function sortEvents(events, profile) {
  const key = eventKeyNameOf(profile);
  return [...events].sort((a, b) => {
    if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1;
    const ra = eventRank(a, profile);
    const rb = eventRank(b, profile);
    if (ra !== rb) return ra - rb;
    const fa = a.field || '';
    const fb = b.field || '';
    return fa < fb ? -1 : fa > fb ? 1 : 0;
  });
}

/**
 * 把一条**字段事件**应用到一份字段值表上。
 *
 * 缺省就是「`to` 为 null 即删除、否则覆盖」——deals 的每个被跟踪字段都是标量，够用。
 * plans 的 `supportedModels` 是**按元素**记事件的（新增/移除/权限变化各一条），
 * 所以它用 `profile.applyEvent` 覆写成"改这一份清单里的那一个元素"。
 * 这一层是重放与链校验共用的唯一入口 —— 两处不可能分家。
 */
function applyFieldEvent(profile, values, event) {
  if (typeof profile.applyEvent === 'function') return profile.applyEvent(values, event);
  if (event.to === null || event.to === undefined) delete values[event.field];
  else values[event.field] = event.to;
  return values;
}

/** 链校验里「当前值是否等于事件的 from」的判据（领域可覆写，见上） */
function eventValueMatches(profile, field, current, value, event) {
  if (typeof profile.eventValueMatches === 'function') return profile.eventValueMatches(field, current, value, event);
  return sameValue(current, value);
}

/**
 * 重放整份日志，得到每条记录每个被跟踪字段的**当前值**。
 * 链上的每一步都约束住，因此「日志被手改」一定会与当前数据对不上。
 *
 * @returns {Map<string, object>} 记录身份 → { field: value }
 */
function replay(store, profile) {
  const state = new Map();
  const fields = (store && store.baseline && store.baseline.fields) || {};
  for (const id of Object.keys(fields)) state.set(id, { ...fields[id] });
  for (const event of eventsOf(store)) {
    const id = keyOf(profile, event);
    if (!state.has(id)) state.set(id, {});
    const current = state.get(id);
    if (event.type === 'created') {
      const snapshot = event.fields && typeof event.fields === 'object' ? event.fields : {};
      state.set(id, { ...snapshot });
      continue;
    }
    if (event.type === 'ended' || event.type === 'restored') continue;
    applyFieldEvent(profile, current, event);
  }
  return state;
}

function replayedValueFrom(stateMap, keyId, field) {
  const rec = stateMap.get(keyId);
  return rec && Object.prototype.hasOwnProperty.call(rec, field) ? rec[field] : null;
}

/** 由日志重建一条记录某个字段的当前值（缺席 → null） */
function replayedValue(store, keyId, field, profile) {
  return replayedValueFrom(replay(store, profile), keyId, field);
}

/** 一条记录最近一次生命周期事件（created / ended / restored） */
function lastLifecycleOf(store, keyId, profile) {
  let last = null;
  for (const event of eventsOf(store)) {
    if (keyOf(profile, event) !== keyId) continue;
    if (profile.lifecycleTypes.includes(event.type)) last = event;
  }
  return last;
}

function indexByKey(records, key = 'id') {
  const map = new Map();
  for (const record of records || []) if (record && record[key]) map.set(record[key], record);
  return map;
}

/* ------------------------------------------------------------------ */
/* 差异计算（机械部分）                                                 */
/* ------------------------------------------------------------------ */

/**
 * 逐字段差异：给定「上一份状态」与「这一份状态」，产出**同一批被跟踪字段**上的候选事件。
 *
 * 这一层只做机械比对（读值 → 判等 → 取类型）；「新增记录怎么算 created」
 * 与「数组字段怎么按元素做集合差」由领域侧负责 —— 那两件事两种数据确实不一样。
 *
 * @param {object[]} previous 上一份已发布状态
 * @param {object[]} next     本次状态
 * @param {object}   ctx      { profile, at, originFields?, typeOf? }
 *        typeOf(field, from, to, { record, prev }) 返回事件类型；返回假值表示跳过该字段
 * @returns {object[]} 候选事件（未去重、未排序）
 */
function diffFields(previous, next, ctx) {
  const { profile, at } = ctx;
  const key = profile.recordKey;
  const eventKey = eventKeyNameOf(profile);
  const before = indexByKey(previous, key);
  const originFields = ctx.originFields instanceof Set ? ctx.originFields : new Set();
  const events = [];
  for (const record of next || []) {
    if (!record || !record[key]) continue;
    const prev = before.get(record[key]);
    if (!prev) continue;                       // 新增记录由领域侧处理（created 需要快照）
    for (const field of profile.trackedFields) {
      const from = normValue(readField(profile, prev, field));
      const to = normValue(readField(profile, record, field));
      if (valuesEqual(profile, field, from, to)) continue;
      const type = typeof ctx.typeOf === 'function'
        ? ctx.typeOf(field, from, to, { record, prev })
        : profile.fieldEvent[field];
      if (!type || !profile.fieldTypes.includes(type)) continue;
      events.push({
        [eventKey]: record[key],
        at,
        type,
        field,
        from,
        to,
        origin: originFields.has(field) ? 'derived' : 'observed'
      });
    }
  }
  return events;
}

/* ------------------------------------------------------------------ */
/* 事件身份与观测态                                                     */
/* ------------------------------------------------------------------ */

/**
 * 事件的**幂等身份**：同一件事（同一条记录 + 同一类型 + 同一字段 + 同一天 + 同一对值 + 同一原因）
 * 只允许有一种身份。它同时是「重复写入不重复追加」的判据与订阅源的稳定 guid。
 */
function eventKey(event, profile) {
  return [keyOf(profile, event), event.type, event.field || '', event.at,
    stableJson(event.from), stableJson(event.to), event.reason || '',
    event.type === 'created' ? stableJson(event.fields || {}) : ''].join('\u0000');
}

function daysBetween(later, earlier) {
  const a = new Date(`${later}T00:00:00Z`).getTime();
  const b = new Date(`${earlier}T00:00:00Z`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((a - b) / 86400000);
}

/** 观测态保留窗口：已 ended 且离开数据集超过窗口的记录不再保留（避免无限增长） */
function pruneAbsence(absence, { nextIds, at, retentionDays }) {
  const out = {};
  for (const id of Object.keys(absence).sort()) {
    const state = absence[id];
    if (!state) continue;
    if (state.endedAt && !nextIds.has(id) && daysBetween(at, state.endedAt) > retentionDays) continue;
    out[id] = state;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 校验：形状 + 链 + 与当前状态一致 + 上限                              */
/* ------------------------------------------------------------------ */

/**
 * 逐项校验日志与当前记录。返回问题清单（空 = 通过）。
 *
 * 四类问题分开，因为红的含义不同：
 *   ① 形状   —— 字段非法 / 未知字段 / 未知事件类型
 *   ② 链     —— 同一 (记录, 字段) 上 `to` 与下一条 `from` 必须相等；生命周期必须成对
 *   ③ 一致   —— **基线 + 事件重放**的结果必须等于当前数据
 *   ④ 上限   —— 事件数 / 单条事件数 / 文件体积
 *
 * 为什么 ③ 是核心：「日志与当前状态一致」如果不可验证，日志就是一段自说自话的文本。
 */
function verifyStore(store, records, profile, { today = null, bytes = null } = {}) {
  const problems = [];
  const doc = store;
  const key = profile.recordKey;
  const idRe = profile.idRe || DEFAULT_ID_RE;
  const fieldLabel = field => (profile.fieldLabels && profile.fieldLabels[field]) || field;
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return [`${profile.docLabel || '日志'}不是 JSON 对象`];
  if (doc.schemaVersion !== profile.schemaVersion) {
    problems.push(`schemaVersion 应为 ${profile.schemaVersion}，实得 ${doc.schemaVersion}`);
  }
  if (!DATE_RE.test(String(doc.startedAt || ''))) problems.push(`startedAt 缺失或非法（${doc.startedAt}）`);
  if (!doc.baseline || !DATE_RE.test(String(doc.baseline.at || ''))) problems.push('baseline.at 缺失或非法');
  if (!doc.baseline || typeof doc.baseline.fields !== 'object' || Array.isArray(doc.baseline.fields)) {
    problems.push('baseline.fields 不是对象');
  }

  const events = eventsOf(doc);
  const perRecord = new Map();
  const allIds = new Set();
  events.forEach((event, index) => {
    const where = `事件 #${index}`;
    if (!event || typeof event !== 'object') { problems.push(`${where}: 不是对象`); return; }
    const recordId = keyOf(profile, event);
    if (!idRe.test(String(recordId || ''))) problems.push(`${where}: ${key} 非法（${recordId}）`);
    if (!DATE_RE.test(String(event.at || ''))) problems.push(`${where}: at 非法（${event.at}）`);
    if (today && DATE_RE.test(String(event.at || '')) && String(event.at) > today) {
      problems.push(`${where}: at 是未来日期（${event.at}）`);
    }
    if (!profile.eventTypes.includes(event.type)) { problems.push(`${where}: 未知事件类型（${event.type}）`); return; }
    if (profile.lifecycleTypes.includes(event.type)) {
      if (event.field !== null && event.field !== undefined) problems.push(`${where}: ${event.type} 不应带 field`);
      if (event.from !== null && event.from !== undefined) problems.push(`${where}: ${event.type} 不应带 from`);
      if (event.to !== null && event.to !== undefined) problems.push(`${where}: ${event.type} 不应带 to`);
      if (event.type === 'ended' && !profile.endReasons.includes(event.reason)) {
        problems.push(`${where}: ended 的 reason 非法（${event.reason}）`);
      }
      if (event.type === 'created' && (event.fields === null || typeof event.fields !== 'object' || Array.isArray(event.fields))) {
        problems.push(`${where}: created 必须带 fields（它同时是这条记录的基线锚点）`);
      }
      for (const field of Object.keys(event.fields || {})) {
        if (!profile.trackedFields.includes(field)) problems.push(`${where}: created.fields 含未跟踪字段 ${field}`);
      }
      if (event.type !== 'ended' && event.reason !== undefined) problems.push(`${where}: ${event.type} 不应带 reason`);
      // v1.5：`ended` 可带可选墓碑标签（标题 / 厂商快照）。它**不是**被跟踪的值 ——
      // 不参与链校验、不参与重放，因此这里只校验形状，且只允许 ended 携带。
      if (event.label !== undefined) {
        if (event.type !== 'ended') {
          problems.push(`${where}: ${event.type} 不应带 label（只有 ended 可以有墓碑标签）`);
        } else if (!event.label || typeof event.label !== 'object' || Array.isArray(event.label)) {
          problems.push(`${where}: ended 的 label 必须是对象`);
        } else {
          for (const labelKey of Object.keys(event.label)) {
            if (labelKey !== 'title' && labelKey !== 'vendor') problems.push(`${where}: ended.label 含未知键 ${labelKey}`);
          }
          if (typeof event.label.title !== 'string' || !event.label.title.trim()) {
            problems.push(`${where}: ended.label.title 必须是非空字符串（空标本等于没有标本）`);
          }
          if (event.label.vendor !== undefined && typeof event.label.vendor !== 'string') {
            problems.push(`${where}: ended.label.vendor 必须是字符串`);
          }
        }
      }
    } else {
      if (!profile.trackedFields.includes(event.field)) { problems.push(`${where}: 未跟踪字段（${event.field}）`); return; }
      // 一个字段可以对应多种事件类型（plans 的 `billing.promoPrice` 有 started/ended/changed 三种），
      // 领域用 `allowedEventTypes(field)` 声明；缺省就是「一个字段一种类型」。
      const allowed = typeof profile.allowedEventTypes === 'function'
        ? profile.allowedEventTypes(event.field)
        : [profile.fieldEvent[event.field]];
      if (!allowed.includes(event.type)) {
        problems.push(`${where}: ${event.field} 的事件类型应为 ${allowed.join(' / ')}，实得 ${event.type}`);
      }
      if (!('from' in event) || !('to' in event)) problems.push(`${where}: 字段事件必须同时带 from 与 to`);
      else if (sameValue(event.from, event.to)) problems.push(`${where}: 字段事件的 from 与 to 相同（那不是一个变化）`);
      if (event.origin !== undefined && !EVENT_ORIGINS.includes(event.origin)) {
        problems.push(`${where}: origin 非法（${event.origin}）`);
      }
      if (event.reason !== undefined) problems.push(`${where}: 字段事件不应带 reason`);
      // 墓碑标签只属于 `ended`：字段事件带它说明有人把两种事件混在一起了
      if (event.label !== undefined) problems.push(`${where}: 字段事件不应带 label（墓碑标签只属于 ended）`);
    }
    allIds.add(recordId);
    if (!perRecord.has(recordId)) perRecord.set(recordId, []);
    perRecord.get(recordId).push(event);
  });

  // ② 链完整性 + 生命周期成对
  const lifecycleState = new Map(); // id → 最后一次生命周期事件类型
  for (const [id, list] of perRecord) {
    const fieldState = {};
    const baseFields = (doc.baseline && doc.baseline.fields && doc.baseline.fields[id]) || {};
    for (const field of profile.trackedFields) {
      fieldState[field] = Object.prototype.hasOwnProperty.call(baseFields, field) ? baseFields[field] : null;
    }
    let created = false;
    let ended = false;
    for (const event of list) {
      if (event.type === 'created') {
        created = true;
        for (const field of profile.trackedFields) {
          const snapshot = event.fields || {};
          fieldState[field] = Object.prototype.hasOwnProperty.call(snapshot, field) ? snapshot[field] : null;
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
      const current = Object.prototype.hasOwnProperty.call(fieldState, event.field) ? fieldState[event.field] : null;
      if (!eventValueMatches(profile, event.field, current, event.from, event)) {
        problems.push(`${id} · ${event.field}: 链断裂（上一步是 ${short(current)}，事件的 from 是 ${short(event.from)}）`);
      }
      applyFieldEvent(profile, fieldState, event);
    }
    lifecycleState.set(id, ended ? 'ended' : created ? 'created' : null);
  }

  // ②′ 覆盖「只有基线、没有事件」的记录：从当前数据消失却没有 ended 也要红。
  // 只查 perRecord 会漏掉它们 —— 而它们恰恰是最容易被静默删掉的一批。
  const baselineIds = Object.keys((doc.baseline && doc.baseline.fields) || {});
  const knownIds = new Set([...baselineIds, ...allIds]);
  const recordIds = new Set((records || []).map(record => record && record[key]).filter(Boolean));
  for (const id of knownIds) {
    if (recordIds.has(id)) continue;
    if (lifecycleState.get(id) === 'ended') continue;
    // 观测期未满：plans 的「消失」要连续多次运行确认（`profile.missConfirmRuns`）。
    // 在缺席计数还在推进（或被熔断挡住）的那段时间里，数据里已经没有它、日志里也还没有 ended ——
    // 这是**合法**的中间态，不是链断裂。deals 侧永远走不到这里：它的观测态只记
    // 「仍在数据集里、但来源本轮没列出」的条目，真正消失的那批走 `ended` 分支。
    const pending = (doc.absence && doc.absence[id]) || null;
    if (pending && !pending.endedAt && profile.missConfirmRuns
      && (pending.blockedAt
        || (Number(pending.misses) > 0 && Number(pending.misses) < profile.missConfirmRuns))) continue;
    problems.push(`${id}: 已从 ${profile.recordsLabel || '当前数据'} 消失，但日志里没有对应的 ended 事件`);
  }

  for (const id of knownIds) {
    const list = perRecord.get(id) || [];
    const baseFields = (doc.baseline && doc.baseline.fields && doc.baseline.fields[id]) || {};
    const hasCreated = list.some(event => event.type === 'created');
    const record = (records || []).find(item => item && item[key] === id);
    if (!record) continue; // 不在数据集里的由上一段负责
    if (!hasCreated && Object.keys(baseFields).length === 0) {
      problems.push(`${id}: 记录没有历史锚点（既不在基线里，也没有 created 事件）`);
      continue;
    }
    // ③ 与当前状态一致（记录仍在数据集里就必须逐字段对上，`ended` 只表示来源不再列出）
    const fieldState = {};
    for (const field of profile.trackedFields) {
      fieldState[field] = Object.prototype.hasOwnProperty.call(baseFields, field) ? baseFields[field] : null;
    }
    for (const event of list) {
      if (event.type === 'created') {
        for (const field of profile.trackedFields) {
          const snapshot = event.fields || {};
          fieldState[field] = Object.prototype.hasOwnProperty.call(snapshot, field) ? snapshot[field] : null;
        }
      } else if (event.type === 'ended' || event.type === 'restored') {
        continue;
      } else {
        applyFieldEvent(profile, fieldState, event);
      }
    }
    for (const field of profile.trackedFields) {
      const expected = normValue(readField(profile, record, field));
      const actual = Object.prototype.hasOwnProperty.call(fieldState, field) ? fieldState[field] : null;
      if (!valuesEqual(profile, field, expected, actual)) {
        problems.push(`${id} · ${fieldLabel(field)}: 现状与历史不一致（文件 ${short(expected)} / 日志 ${short(actual)}）`);
      }
    }
  }

  // 每条当前记录都必须有锚点（基线 / created）——否则历史对它是空的，
  // 而页面会把它渲染成「暂无变更记录」，等于用「没记录」冒充「没变化」。
  for (const record of records || []) {
    if (!record || !record[key]) continue;
    if (!knownIds.has(record[key])) {
      problems.push(`${record[key]}: 记录没有历史锚点（既不在基线里，也没有 created 事件）`);
    }
  }

  // ④ 领域附加段（plans 的 anomalies / supersedes）
  if (typeof profile.validateExtra === 'function') {
    profile.validateExtra(doc, records, problems, { knownIds, recordIds, today, fieldLabel });
  }

  // ⑤ 上限
  if (events.length > profile.limits.eventsTotal) {
    problems.push(`事件总数 ${events.length} 超过上限 ${profile.limits.eventsTotal}（不自动截断，需人工处置）`);
  }
  for (const [id, list] of perRecord) {
    if (list.length > profile.limits.eventsPerRecord) {
      problems.push(`${id}: 事件 ${list.length} 条超过单条上限 ${profile.limits.eventsPerRecord}`);
    }
  }
  if (Number.isFinite(bytes) && bytes > profile.limits.fileBytes) {
    problems.push(`日志文件 ${bytes} 字节超过上限 ${profile.limits.fileBytes}`);
  }
  return problems;
}

function short(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (text === undefined) return 'null';
  return text.length > 40 ? `${text.slice(0, 37)}…` : text;
}

/* ------------------------------------------------------------------ */
/* 渲染视图与统计                                                       */
/* ------------------------------------------------------------------ */

/**
 * 一条记录的有界变化视图，供渲染层使用。
 *
 * @returns {object|null} 无任何事件时返回 null（页面说「暂无变更记录」，不注入空对象）
 */
function historyFor(store, keyId, profile, { limit = profile.renderLimit } = {}) {
  const key = profile.recordKey;
  const events = eventsOf(store).filter(event => keyOf(profile, event) === keyId);
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

function summarize(store, records, profile) {
  const events = eventsOf(store);
  const byType = {};
  for (const type of profile.eventTypes) byType[type] = 0;
  for (const event of events) byType[event.type] = (byType[event.type] || 0) + 1;
  const key = profile.recordKey;
  const ids = new Set(events.map(event => keyOf(profile, event)));
  const withHistory = (records || []).filter(record => record && ids.has(record[key])).length;
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
  DATE_RE,
  DEFAULT_ID_RE,
  EVENT_ORIGINS,
  normValue,
  stableJson,
  sameValue,
  readField,
  valuesEqual,
  applyFieldEvent,
  eventValueMatches,
  eventKeyNameOf,
  keyOf,
  trackedValuesOf,
  emptyStore,
  normalizeStore,
  load,
  save,
  baselineOf,
  eventsOf,
  eventRank,
  sortEvents,
  replay,
  replayedValueFrom,
  replayedValue,
  lastLifecycleOf,
  indexByKey,
  diffFields,
  eventKey,
  daysBetween,
  pruneAbsence,
  verifyStore,
  historyFor,
  summarize
};
