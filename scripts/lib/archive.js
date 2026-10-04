/**
 * 历史档案（v3.0 Stage F）—— **纯函数 `buildArchive()` + 页面渲染 + 完整性断言**。
 *
 * ## 第一原则
 *
 * > 资料失效不等于资料删除。
 *
 * 归档层**不落新真值文件**：它只从三份既有日志的 `baseline + events + absence`
 * （以及 `ended` 事件上的墓碑 `label`）重建"哪些资料结束了 / 又回来了"。
 * 因此这里没有网络、没有磁盘、**没有时钟** —— 基准日 `asOf` 必须由调用方给，
 * 缺省就是"没有基准日"，绝不读运行环境的当前时刻。
 *
 * ## 三条纪律（都有断言与牙）
 *
 * 1. **归档只依赖事件，不依赖当前数据**。一条优惠从 `deals.json` 消失之后，
 *    它的档案必须仍然在（§8 第 9 条牙）。`records` 只用来补"最后已知内容"与墓碑，
 *    传空数组不会让任何档案消失。
 * 2. **来源故障不得被写成"资料结束"**。同一天出现的大批 `ended`
 *    （超过 `max(3, 基线记录数 / 2)`）一律标为 `suspect`，并给出一条
 *    `mass_ended_suspect` 异常留档（§8 第 10 条牙）—— 这些条目仍然展示，
 *    但必须带着"疑似来源故障"的标记，不许伪装成正常归档。
 * 3. **ended → restored 之后状态必须是 restored**（§8 第 11 条牙）。
 *    状态由**最后一条生命周期事件**决定，并且 `assertArchiveIntegrity()`
 *    会从条目自带的时间线**重新推导一遍**再比对 —— 手写成 ended 不可能蒙混过去。
 */

'use strict';

const plansPage = require('./plans-page');

const ARCHIVE_INDEX_ROUTE = 'archive/';
const ARCHIVE_HEADING = '历史档案';
const ARCHIVE_DESCRIPTION = '本站的原则是：资料失效不等于资料删除。'
  + '这里保留已经结束或下线的优惠、Coding 套餐与 API 计费记录 —— 它们的状态、首次发现、'
  + '最后有效时间、结束发现时间、最后已知内容、官方来源与变化时间线。';

const UNKNOWN_TEXT = plansPage.UNKNOWN_TEXT;
const UNKNOWN_NUM = plansPage.UNKNOWN_NUM;
const escapeHtml = plansPage.escapeHtml;
const FORBIDDEN_CLAIM_WORDS = plansPage.FORBIDDEN_CLAIM_WORDS;

/**
 * 极简行内标记：**先转义、再**把 `**加粗**` 变成 `<b>`。
 * 只用于我们自己写的常量文案；数据原文一律 `escapeHtml`（数据不是 Markdown）。
 */
function rich(text) {
  return escapeHtml(text).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
}

/** 生命周期事件的排序权重（三份日志共用同一套：created 最先，ended 最后） */
const LIFECYCLE_RANK = { created: 0, restored: 1, ended: 2 };
const LIFECYCLE_TYPES = ['created', 'ended', 'restored'];

const ARCHIVE_KIND_LABEL = {
  deal: '优惠',
  plan: 'Coding 套餐',
  api: 'API 计费记录'
};

/**
 * 三个领域（索引页**无条件**列这三组，哪怕全为空）。
 * 顺序是契约：页面分组、sitemap、报告都按它走。
 */
const ARCHIVE_KINDS = ['deal', 'plan', 'api'];

/** 档案条目的 `kind` → `/archive/<kind>/<id>/` 路由 */
function archiveEntryRoute(entry) {
  return `${ARCHIVE_INDEX_ROUTE}${entry.kind}/${encodeURIComponent(entry.id)}/`;
}

/**
 * **相对前缀的唯一实现**：把「路由深度」换算成 `'../'.repeat(depth)`。
 *
 * 为什么必须是唯一实现、并且必须由路由推出来：`/archive/<kind>/<id>/` 的深度是 **3**，
 * 而详情页原先写死 `'../../'`（2 层）——页面上 favicon / feed / 面包屑 / 全站导航因此
 * 全部解析到 `archive/…` 而不是站点根。生产一条 ended/restored 都没有，所以这个写死
 * 在交付日一次都没被构建照到（审计 F-r1-history-ai-002：每页 27 条相对引用里 24 条死链）。
 *
 * 同一个数字写在两处（这里与调用方各写一遍）就是同一个坑的下一形态：改一边不会红。
 * 所以调用方一律用 `archiveEntryPrefix(entry)`，页面层再也看不到一个字面量前缀。
 */
function routePrefixOf(route) {
  const depth = String(route || '').split('/').filter(Boolean).length;
  return '../'.repeat(depth);
}

/** 某个档案条目的详情页前缀（= 它自己那条路由的深度） */
function archiveEntryPrefix(entry) {
  return routePrefixOf(archiveEntryRoute(entry));
}

/**
 * 详情页门槛（题面 §4）：**必须存在可重建的事件链与快照**。
 *
 *   · 事件链：至少一条 `ended` / `restored`（`buildArchive()` 已经只产出这种条目，
 *     这里显式再查一遍 —— 门槛不能只靠上游"应该"）；
 *   · 快照：能重建出"最后已知内容"（重放字段非空）**或**至少有标题/墓碑快照。
 *     两者都没有时，页面只剩一行 id 与两个日期，那对读者不是资料、对搜索也不是内容。
 *
 * 未过门槛的条目**仍然留在索引页**（资料不删除），只是不生成独立 URL、
 * 也不进 sitemap —— 这就是"不为每条历史 event 建 SEO 页面"的落点。
 */
function archiveDetailGate(entry) {
  const reasons = [];
  const lifecycle = Array.isArray(entry && entry.lifecycle) ? entry.lifecycle : [];
  if (!lifecycle.some(event => event && (event.type === 'ended' || event.type === 'restored'))) {
    reasons.push('没有可重建的结束 / 恢复事件链');
  }
  const knownKeys = Object.keys((entry && entry.lastKnown) || {});
  if (!knownKeys.length && !(entry && entry.title)) {
    reasons.push('既没有可重建的最后已知内容，也没有标题 / 墓碑快照');
  }
  return {
    ok: reasons.length === 0,
    route: entry ? archiveEntryRoute(entry) : null,
    id: entry ? entry.id : null,
    kind: entry ? entry.kind : null,
    status: entry ? entry.status : null,
    suspect: Boolean(entry && entry.suspect),
    snapshotFields: knownKeys.length,
    timelineEvents: Array.isArray(entry && entry.timeline) ? entry.timeline.length : 0,
    reasons
  };
}

/**
 * 详情页的 sitemap 资格：**过门槛的必须进、没过门槛的必须不在**。
 * 与 `models-page.assertSitemapEligibility` 同一套口径（同一个错误在两个家族里不该有两种判法）。
 */
function assertArchiveSitemapEligibility({ sitemapRoutes = [], gateResults = [] } = {}) {
  const problems = [];
  const inSitemap = new Set(sitemapRoutes);
  for (const gate of gateResults) {
    if (!gate || !gate.route) continue;
    if (!gate.ok && inSitemap.has(gate.route)) {
      problems.push(`${gate.route}: 未过详情页门槛（${(gate.reasons || []).join('；')}）却出现在 sitemap 里`);
    }
    if (gate.ok && !inSitemap.has(gate.route)) {
      problems.push(`${gate.route}: 已过详情页门槛却没有进 sitemap`);
    }
  }
  return problems;
}

/**
 * 「不为每条历史 event 生成 SEO 页面」的硬断言：
 *   · 每一条详情路由都必须对应**一个过门槛的实体**（不是一条事件）；
 *   · 详情页条数 == 过门槛的实体条数（不是事件条数）。
 * 事件数量级通常是实体的数倍，一旦有人"顺手给每条事件也建一页"，这两条会立刻红。
 */
function assertArchiveDetailRoutes(routes, entries) {
  const problems = [];
  const expected = new Map();
  for (const entry of entries || []) {
    const gate = archiveDetailGate(entry);
    if (gate.ok) expected.set(gate.route, gate);
  }
  const seen = new Set();
  for (const route of routes || []) {
    if (!expected.has(route)) problems.push(`${route}: 不是任何过门槛实体的详情路由（历史 event 不该有自己的 SEO 页）`);
    seen.add(route);
  }
  for (const route of expected.keys()) {
    if (!seen.has(route)) problems.push(`${route}: 过门槛的实体缺少详情页`);
  }
  return problems;
}

/** 默认的大批结束判据：同一天结束的记录数超过 `max(min, baseline/2)` 即可疑 */
function defaultMassThreshold(baselineCount) {
  return Math.max(3, Math.floor((Number(baselineCount) || 0) / 2));
}

/* ------------------------------------------------------------------ */
/* 输入归一                                                            */
/* ------------------------------------------------------------------ */

function baselineFieldsOf(baseline) {
  if (!baseline) return {};
  if (baseline.fields && typeof baseline.fields === 'object' && !Array.isArray(baseline.fields)) {
    return baseline.fields;
  }
  return {};
}

function recordsByIdOf(records) {
  if (!records) return new Map();
  if (records instanceof Map) return records;
  if (Array.isArray(records)) return new Map(records.filter(Boolean).map(record => [record.id, record]));
  return new Map(Object.entries(records));
}

/** 确定性排序：`at` → 生命周期权重 → 字段 → 类型（两次构建必须字节相同） */
function sortEvents(events) {
  return [...(events || [])].sort((a, b) => {
    if (a.at !== b.at) return a.at < b.at ? -1 : 1;
    const ra = LIFECYCLE_RANK[a.type] === undefined ? 5 : LIFECYCLE_RANK[a.type];
    const rb = LIFECYCLE_RANK[b.type] === undefined ? 5 : LIFECYCLE_RANK[b.type];
    if (ra !== rb) return ra - rb;
    const fa = a.field || '';
    const fb = b.field || '';
    if (fa !== fb) return fa < fb ? -1 : 1;
    return String(a.type) < String(b.type) ? -1 : String(a.type) > String(b.type) ? 1 : 0;
  });
}

/** 字段事件应用（与 `history-core.applyFieldEvent` 同一口径；这里只处理标量/对象覆盖） */
function applyFieldEvent(values, event) {
  if (event.to === null || event.to === undefined) delete values[event.field];
  else values[event.field] = event.to;
}

/* ------------------------------------------------------------------ */
/* buildArchive —— 归档层唯一入口                                        */
/* ------------------------------------------------------------------ */

/**
 * 从**一份日志**重建归档条目。
 *
 * @param {object} params
 *   `kind`       'deal' | 'plan' | 'api'（只影响标签与路由，不改变判据）
 *   `recordKey`  事件上的记录身份字段名（deals 是 `id`，套餐 / API 是 `planId`；缺省自动识别）
 *   `baseline`   `{ at, fields }`（`deal-history` / `plan-history` / `api-plan-history` 的基线段）
 *   `events`     事件数组（`ended` / `restored` / 字段事件；**不读盘**）
 *   `absence`    观测态对象（`{ id: {misses, endedAt, blockedAt, ...} }`）
 *   `tombstones` 额外墓碑（`{ id: { title, vendor } }`）；`ended.label` 优先
 *   `records`    当前仍在数据集里的记录（**可选**：只用来补最后已知内容）
 *   `asOf`       数据基准日 `YYYY-MM-DD`（缺省 null）
 *   `massThreshold` 覆盖"大批结束"的阈值（自测用）
 *   `anomalies`  日志里的异常段（可选；含 `mass_missing` 时对应的 ended 一律可疑）
 *   `startedAt`  日志的 startedAt（可选，只用于展示"记录自 … 起"）
 */
function buildArchive({
  kind = 'deal',
  recordKey = null,
  baseline = null,
  events = [],
  absence = {},
  tombstones = {},
  records = null,
  asOf = null,
  massThreshold = null,
  anomalies = [],
  startedAt = null
} = {}) {
  const keyOfEvent = event => {
    if (!event || typeof event !== 'object') return '';
    if (recordKey) return event[recordKey] === undefined ? '' : String(event[recordKey]);
    // 自动识别：deals 的事件用 `id`，套餐 / API 的事件用 `planId`（两套契约都稳定，不改）。
    return String(event.id !== undefined ? event.id : (event.planId !== undefined ? event.planId : ''));
  };
  const baselineAt = baseline && baseline.at ? String(baseline.at) : null;
  const fields = baselineFieldsOf(baseline);
  const baselineIds = Object.keys(fields);
  const sorted = sortEvents(events);
  const recordsById = recordsByIdOf(records);
  const tombstoneMap = tombstones instanceof Map ? tombstones : new Map(Object.entries(tombstones || {}));
  const absenceMap = absence && typeof absence === 'object' ? absence : {};
  const hasInput = baselineIds.length > 0 || sorted.length > 0;

  const base = {
    kind,
    kindLabel: ARCHIVE_KIND_LABEL[kind] || kind,
    availability: hasInput ? 'ok' : 'unavailable',
    asOf: asOf || null,
    baselineAt,
    startedAt: startedAt || null,
    counts: {
      baseline: baselineIds.length,
      events: sorted.length,
      ended: 0,
      restored: 0,
      entries: 0,
      suspect: 0,
      created: sorted.filter(event => event.type === 'created').length,
      fieldEvents: sorted.filter(event => !LIFECYCLE_TYPES.includes(event.type)).length,
      blockedAbsence: Object.values(absenceMap).filter(state => state && state.blockedAt).length
    },
    entries: [],
    anomalies: []
  };
  if (!hasInput) return base;

  // 每个 id 的事件（只保留日志里出现过的 id；基线里只有值没有事件的 id 不构成"结束"）
  const byId = new Map();
  const ensure = id => {
    if (!byId.has(id)) byId.set(id, []);
    return byId.get(id);
  };
  for (const id of baselineIds) ensure(id);
  for (const event of sorted) {
    const id = keyOfEvent(event);
    if (!id) continue;
    ensure(id).push(event);
  }

  const entries = [];
  for (const [id, list] of byId) {
    const orderedEvents = sortEvents(list);
    const lifecycle = orderedEvents.filter(event => LIFECYCLE_TYPES.includes(event.type));
    if (!lifecycle.some(event => event.type === 'ended' || event.type === 'restored')) continue; // 门槛：必须有结束或恢复

    const lastLifecycle = lifecycle[lifecycle.length - 1];
    const status = lastLifecycle.type === 'restored' ? 'restored' : 'ended';
    const endedEvents = lifecycle.filter(event => event.type === 'ended');
    const lastEnded = endedEvents[endedEvents.length - 1] || null;
    const restoredEvents = lifecycle.filter(event => event.type === 'restored');
    const lastRestored = restoredEvents[restoredEvents.length - 1] || null;
    const createdEvent = lifecycle.find(event => event.type === 'created') || null;

    // 最后已知内容：按事件重放到**最后一条 ended**（恢复之后的字段事件不属于"结束时的内容"）
    const lastEndedIndex = lastEnded ? orderedEvents.indexOf(lastEnded) : orderedEvents.length - 1;
    const lastKnown = {};
    for (const [field, value] of Object.entries(fields[id] || {})) lastKnown[field] = value;
    for (let index = 0; index <= lastEndedIndex; index++) {
      const event = orderedEvents[index];
      if (!event) continue;
      if (event.type === 'created') {
        for (const key of Object.keys(lastKnown)) delete lastKnown[key];
        for (const [field, value] of Object.entries(event.fields || {})) lastKnown[field] = value;
      } else if (event.type === 'ended' || event.type === 'restored') {
        continue;
      } else {
        applyFieldEvent(lastKnown, event);
      }
    }

    const record = recordsById.get(id) || null;
    const label = (lastEnded && lastEnded.label && typeof lastEnded.label === 'object') ? lastEnded.label : null;
    const tombstone = label || tombstoneMap.get(id) || null;
    const title = (record && record.title) || (record && record.planName) || (tombstone && tombstone.title) || null;
    const vendor = (record && record.vendor) || (record && record.provider) || (tombstone && tombstone.vendor) || null;

    const lastEventAt = orderedEvents.length ? orderedEvents[orderedEvents.length - 1].at : baselineAt;

    entries.push({
      id,
      kind,
      status,
      lifecycleType: lastLifecycle.type,
      firstSeen: createdEvent
        ? { at: createdEvent.at, origin: 'created' }
        : { at: baselineAt, origin: 'baseline' },
      lastEffectiveAt: lastEventAt,
      endedAt: lastEnded ? lastEnded.at : null,
      endDiscoveredAt: lastEnded ? (lastEnded.firstMissedAt || lastEnded.at) : null,
      endReason: lastEnded ? (lastEnded.reason || null) : null,
      restoredAt: status === 'restored' && lastRestored ? lastRestored.at : null,
      title,
      vendor,
      tombstone: tombstone ? { title: (tombstone.title || null), vendor: (tombstone.vendor || null) } : null,
      lastKnown,
      source: {
        officialUrl: (lastKnown.officialUrl || null),
        sourceUrl: (lastKnown.sourceUrl || null),
        source: (lastKnown.source || null)
      },
      timeline: orderedEvents.map(event => ({
        at: event.at,
        type: event.type,
        field: event.field === undefined ? null : event.field,
        from: 'from' in event ? event.from : null,
        to: 'to' in event ? event.to : null,
        reason: typeof event.reason === 'string' ? event.reason : null,
        origin: event.origin === 'derived' ? 'derived' : 'observed'
      })),
      lifecycle: lifecycle.map(event => ({
        at: event.at,
        type: event.type,
        reason: typeof event.reason === 'string' ? event.reason : null
      })),
      suspect: false,
      suspectReason: null,
      absence: absenceMap[id] || null
    });
  }

  // ---- 大批结束（来源故障）检测 --------------------------------------
  // 判据是**分批**的：同一天结束的记录数超过 `max(3, 基线一半)` 就不是"资料自然结束"的规模。
  // 覆盖 `asOf` 之前所有日期，因此不需要读时钟；`anomalies` 里的 `mass_missing` 会强制标记对应日期。
  const threshold = massThreshold === null || massThreshold === undefined
    ? defaultMassThreshold(base.counts.baseline) : Number(massThreshold);
  const endedByDate = new Map();
  for (const entry of entries) {
    if (!entry.endedAt) continue;
    if (!endedByDate.has(entry.endedAt)) endedByDate.set(entry.endedAt, []);
    endedByDate.get(entry.endedAt).push(entry.id);
  }
  const forcedDates = new Set();
  for (const anomaly of anomalies || []) {
    if (anomaly && typeof anomaly.kind === 'string' && /mass|batch|outage|failure/.test(anomaly.kind) && anomaly.at) {
      forcedDates.add(String(anomaly.at));
    }
  }
  for (const [at, ids] of endedByDate) {
    const suspicious = ids.length > threshold || forcedDates.has(at);
    if (!suspicious) continue;
    base.anomalies.push({
      kind: 'mass_ended_suspect',
      at,
      ids: ids.slice().sort(),
      count: ids.length,
      threshold,
      reason: forcedDates.has(at) ? '日志里记有疑似来源故障的异常' : `同一天结束 ${ids.length} 条，超过阈值 ${threshold}`
    });
    for (const entry of entries) {
      if (entry.endedAt !== at) continue;
      entry.suspect = true;
      entry.suspectReason = `同一天有 ${ids.length} 条资料被记为结束（阈值 ${threshold}）—— 疑似来源故障，不是资料真的下线`;
    }
  }

  entries.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
    if (a.endedAt !== b.endedAt) return a.endedAt < b.endedAt ? 1 : -1;   // 新的在前
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  base.entries = entries;
  base.counts.ended = entries.filter(entry => entry.status === 'ended').length;
  base.counts.restored = entries.filter(entry => entry.status === 'restored').length;
  base.counts.entries = entries.length;
  base.counts.suspect = entries.filter(entry => entry.suspect).length;
  return base;
}

/* ------------------------------------------------------------------ */
/* 完整性断言（牙的落点）                                                */
/* ------------------------------------------------------------------ */

/**
 * 从条目自带的时间线**重新推导**状态，与 `entry.status` 比对；
 * 同时检查 recovered 条目的时间顺序与"大批结束"的可疑标记是否真的在。
 *
 * @param {object} archive `buildArchive()` 的产物
 * @returns {string[]} 问题清单
 */
function assertArchiveIntegrity(archive) {
  const problems = [];
  if (!archive) return ['归档为空（没有可断言的产物）'];
  if (archive.availability === 'unavailable') return [];
  for (const entry of archive.entries || []) {
    const lifecycle = Array.isArray(entry.lifecycle) ? entry.lifecycle : null;
    if (!lifecycle || !lifecycle.length) { problems.push(`${entry.id}: 档案条目没有生命周期时间线`); continue; }
    const last = lifecycle[lifecycle.length - 1];
    const derived = last.type === 'restored' ? 'restored' : (last.type === 'ended' ? 'ended' : null);
    if (derived === null) { problems.push(`${entry.id}: 最后一条生命周期事件是 ${last.type}，不是结束或恢复`); continue; }
    if (derived !== entry.status) {
      problems.push(`${entry.id}: 状态写成 ${entry.status}，按时间线应为 ${derived}（ended → restored 之后必须是 restored）`);
    }
    if (entry.status === 'restored') {
      if (!entry.endedAt) problems.push(`${entry.id}: 状态是 restored 却没有 ended 时间`);
      if (entry.restoredAt && entry.endedAt && entry.restoredAt < entry.endedAt) {
        problems.push(`${entry.id}: restoredAt（${entry.restoredAt}）早于 endedAt（${entry.endedAt}）`);
      }
    }
    if (entry.suspect) {
      const anomaly = (archive.anomalies || []).find(item => item.at === entry.endedAt);
      if (!anomaly) problems.push(`${entry.id}: 标了 suspect 却没有对应的异常留档`);
    }
  }
  return problems;
}

/**
 * §8 第 9 条牙的判据：**归档只依赖事件**。
 *
 * 同一份日志，传 `records` 与不传 `records`，条目集合必须逐条相同
 * （`records` 只是"最后已知内容"的补充来源，不是档案存在的前提）。
 */
function assertEntrySetStable(archiveA, archiveB) {
  const problems = [];
  const idsOf = archive => new Set((archive && archive.entries || []).map(entry => `${entry.kind}\u0000${entry.id}`));
  const a = idsOf(archiveA);
  const b = idsOf(archiveB);
  for (const key of a) if (!b.has(key)) problems.push(`${key.replace('\u0000', '/')}: 有当前记录时存在，去掉当前记录后就消失了（档案不能依赖当前数据）`);
  for (const key of b) if (!a.has(key)) problems.push(`${key.replace('\u0000', '/')}: 只在没有当前记录时存在`);
  return problems;
}

/* ------------------------------------------------------------------ */
/* 渲染                                                                */
/* ------------------------------------------------------------------ */

function markupOnly(html) {
  return plansPage.markupOnly(html);
}

/** 去掉全部标签，只留可读文本（比对"文案是否出现在页面上"时用） */
function stripTags(html) {
  return String(html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/** 反转义 `escapeHtml` 写下的实体（`rich()` 会转义引号，比对文案前要先还原） */
function decodeEntities(text) {
  return String(text || '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}

function archiveStatusLabel(entry) {
  if (entry.suspect) return '疑似来源故障（结束记录待复核）';
  return entry.status === 'restored' ? '曾结束，现已恢复' : '已结束 / 已下线';
}

function archiveEmptyText(kind, archive) {
  const label = ARCHIVE_KIND_LABEL[kind] || kind;
  if (archive.availability === 'unavailable') {
    return `本次构建没有拿到${label}的变更日志 —— 这不表示「没有已结束的资料」。`;
  }
  const counts = archive.counts || {};
  // 「为什么这一组是空的」要具体到事件类型，不能只说一句"暂无数据"：
  // 读者真正要知道的是"日志里到底有没有 ended/restored 事件、日志从哪天开始记"。
  const breakdown = `该日志共 ${Number(counts.events) || 0} 条事件`
    + `（首次收录 ${Number(counts.created) || 0} 条 · 字段变化 ${Number(counts.fieldEvents) || 0} 条 ·`
    + ` 不再收录 ${Number(counts.ended) || 0} 条 · 重新出现 ${Number(counts.restored) || 0} 条）`;
  return `截至数据基准日，${label}里还没有观测到结束或恢复记录（变更记录自 ${archive.baselineAt || UNKNOWN_TEXT} 起）：`
    + `${breakdown}。**0 条是事实，不是故障**：本站不会为了填满这一页而编造历史事件。`;
}

/** 一条档案的列表行（索引页 + 详情页共用同一套事实） */
function archiveEntryRowHtml(entry, prefix) {
  const title = entry.title || `${entry.id}（无标题快照）`;
  const vendor = entry.vendor ? `${escapeHtml(entry.vendor)} · ` : '';
  const times = [
    entry.firstSeen.at ? `首次发现 ${entry.firstSeen.at}${entry.firstSeen.origin === 'baseline' ? '（基线，不是创建事件）' : ''}` : null,
    entry.endedAt ? `结束发现 ${entry.endDiscoveredAt || entry.endedAt}` : null,
    entry.restoredAt ? `恢复 ${entry.restoredAt}` : null
  ].filter(Boolean).join(' · ');
  const suspect = entry.suspect ? `<span class="amark">疑似来源故障</span>` : '';
  return `        <li class="arow" data-item="${escapeHtml(entry.id)}">
          <a class="atitle" href="${escapeHtml(`${prefix}archive/${entry.kind}/${encodeURIComponent(entry.id)}/`)}">${escapeHtml(title)}</a>
          <span class="awho">${vendor}${escapeHtml(entry.kindLabel || ARCHIVE_KIND_LABEL[entry.kind] || entry.kind)}</span>
          <span class="astatus">${escapeHtml(archiveStatusLabel(entry))}</span>${suspect}
          <span class="atimes">${escapeHtml(times)}</span>
        </li>`;
}

/**
 * `/archive/` 索引页正文。`archives` 是三个领域各自的 `buildArchive()` 产物。
 */
function renderArchiveIndex(archives, ctx = {}) {
  const prefix = ctx.prefix === undefined ? '' : ctx.prefix;
  const list = Array.isArray(archives) ? archives : [archives];
  const all = list.flatMap(archive => archive.entries || []);
  const suspectCount = all.filter(entry => entry.suspect).length;
  const sections = list.map(archive => {
    const rows = (archive.entries || []);
    const body = rows.length
      ? rows.map(entry => archiveEntryRowHtml(entry, prefix)).join('\n')
      : `        <li class="anone">${rich(archiveEmptyText(archive.kind, archive))}</li>`;
    return `      <section class="asec" id="archive-${escapeHtml(archive.kind)}">
        <h2 class="ph2">${escapeHtml(ARCHIVE_KIND_LABEL[archive.kind] || archive.kind)}（${rows.length} 条）</h2>
        <p class="snote">结束 ${archive.counts.ended} 条 · 恢复 ${archive.counts.restored} 条
          · 变更记录自 ${escapeHtml(archive.baselineAt || UNKNOWN_TEXT)} 起</p>
        <ul class="alist">
${body}
        </ul>
      </section>`;
  }).join('\n\n');

  const suspectNote = suspectCount
    ? `      <p class="snote awarn">${rich(`有 ${suspectCount} 条结束记录被标为**疑似来源故障**：同一天结束的数量超过了阈值。`
      + '它们仍然列在这里（资料不删除），但不应当被当成"厂商已经下架"的证据。')}</p>\n`
    : '';

  return `      <nav class="crumb" aria-label="面包屑"><a href="${escapeHtml(prefix)}">首页</a> › <span>${escapeHtml(ARCHIVE_HEADING)}</span></nav>

      <div class="stop">
        <h1>${escapeHtml(ARCHIVE_HEADING)}</h1>
        <span class="meta">${all.length} 条已结束 / 已恢复资料 · 覆盖 ${list.length} 个领域</span>
      </div>

      <p class="snote">${escapeHtml(ARCHIVE_DESCRIPTION)}</p>

      <h2 class="ph2" id="archive-notes">怎么读这一页</h2>
      <ul class="plist">
        <li>${rich('「已结束」表示**本站不再观测到该资料**（人工来源层不再列出），不表示厂商已经下架或优惠已经失效。')}</li>
        <li>${rich('每条档案都给出**首次发现、最后有效时间、结束发现时间与最后已知内容**，以及它自己的变化时间线；这些全部来自三份变更日志，本站不另建一份历史。')}</li>
        <li>${rich('结束记录**不会被删除**：后续采集看不到它时，墓碑与时间线仍然保留（墓碑标签超过保留窗口后，内容由基线重放重建）。')}</li>
        <li>${rich('只给**有独立资料价值**的实体建详情页；单条事件只出现在时间线里，不单独生成 SEO 页面。')}</li>
      </ul>
${suspectNote}
${sections}

      <p class="snote" id="archive-links">相关页面：
        <a href="${escapeHtml(`${prefix}changes/`)}">最近变化</a> ·
        <a href="${escapeHtml(`${prefix}plans/`)}">套餐与 API 计费资料库</a> ·
        <a href="${escapeHtml(`${prefix}models/`)}">模型资料索引</a> ·
        <a href="${escapeHtml(`${prefix}vendor/`)}">按厂商浏览</a> ·
        <a href="${escapeHtml(`${prefix}docs/data/`)}">数据文档</a>
      </p>
`;
}

/** `/archive/` JSON-LD：CollectionPage + BreadcrumbList + ItemList（每个领域一个子页锚点） */
function archiveIndexJsonLd(archives, ctx = {}) {
  const siteUrl = ctx.siteUrl || '';
  const pageUrl = `${siteUrl}${ARCHIVE_INDEX_ROUTE}`;
  const list = Array.isArray(archives) ? archives : [archives];
  const entries = list.flatMap(archive => archive.entries || []);
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: `${ARCHIVE_HEADING} · AI 优惠聚合器`,
      description: ARCHIVE_DESCRIPTION,
      url: pageUrl,
      inLanguage: 'zh-CN',
      isPartOf: { '@type': 'WebSite', name: 'AI 优惠聚合器', url: siteUrl }
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '首页', item: siteUrl },
        { '@type': 'ListItem', position: 2, name: ARCHIVE_HEADING, item: pageUrl }
      ]
    },
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: ARCHIVE_HEADING,
      numberOfItems: entries.length,
      itemListElement: entries.map((entry, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: entry.title || entry.id,
        url: `${siteUrl}${archiveEntryRoute(entry)}`
      }))
    }
  ];
}

/**
 * `/archive/<kind>/<id>/` 详情：状态 / 时间 / 最后已知内容 / 官方来源 / 时间线。
 *
 * `ctx.prefix` **必填**（用 `archiveEntryPrefix(entry)` 取）：这里不再有默认值 ——
 * 一个猜错的默认值（曾经的 `'../../'`）会让整页的相对引用静默地少一层，而页面本身
 * 看起来完全正常。缺失时直接抛错，让「谁忘了传」在构建期就暴露。
 */
function renderArchiveEntry(entry, ctx = {}) {
  if (ctx.prefix === undefined || ctx.prefix === null) {
    throw new Error('renderArchiveEntry 需要 ctx.prefix（请用 archiveEntryPrefix(entry) 按路由深度派生，不要写死层级）');
  }
  const prefix = ctx.prefix;
  if (typeof prefix !== 'string' || !/^(?:\.\.\/)*$/.test(prefix)) {
    throw new Error(`renderArchiveEntry 的 ctx.prefix 非法（${JSON.stringify(prefix)}）——只接受 '' 或若干层 '../'`);
  }
  const title = entry.title || `${entry.id}（无标题快照）`;
  const known = entry.lastKnown || {};
  const knownRows = Object.keys(known).sort().map(field => {
    const value = known[field];
    const text = value === null || value === undefined ? UNKNOWN_NUM
      : (typeof value === 'object' ? JSON.stringify(value) : String(value));
    return `        <dt>${escapeHtml(field)}</dt><dd>${escapeHtml(text)}</dd>`;
  }).join('\n');
  const timeline = (entry.timeline || []).map(event => {
    const what = event.type === 'ended'
      ? `不再收录（${event.reason || '未标注原因'}）`
      : event.type === 'restored' ? '重新出现'
        : event.type === 'created' ? '首次收录'
          : `${event.field || ''} ${event.from === null ? UNKNOWN_NUM : JSON.stringify(event.from)} → ${event.to === null ? UNKNOWN_NUM : JSON.stringify(event.to)}`;
    return `        <li><span class="pchgwhen"><time datetime="${escapeHtml(event.at)}">${escapeHtml(event.at)}</time></span>
          <span class="pchgtype">${escapeHtml(event.type)}</span>
          <span class="pchgwhat">${escapeHtml(what)}</span></li>`;
  }).join('\n');
  const sourceLines = [
    entry.source.officialUrl ? `<a href="${escapeHtml(entry.source.officialUrl)}" rel="noopener">官方页面 ↗</a>` : null,
    entry.source.sourceUrl ? `<a href="${escapeHtml(entry.source.sourceUrl)}" rel="noopener">原始出处 ↗</a>` : null,
    entry.source.source ? `来源类型：${escapeHtml(entry.source.source)}` : null
  ].filter(Boolean).join(' · ') || UNKNOWN_TEXT;

  const suspectBlock = entry.suspect
    ? `      <p class="snote awarn">${rich(`这条结束记录被标为**疑似来源故障**：${entry.suspectReason || ''}。`
      + '它仍然是本站的观测记录，但不应当被当成"厂商已经下架"的证据。')}</p>\n`
    : '';

  return `      <nav class="crumb" aria-label="面包屑"><a href="${escapeHtml(prefix)}">首页</a> ›
        <a href="${escapeHtml(`${prefix}${ARCHIVE_INDEX_ROUTE}`)}">${escapeHtml(ARCHIVE_HEADING)}</a> › <span>${escapeHtml(title)}</span></nav>

      <div class="stop">
        <h1>${escapeHtml(title)}</h1>
        <span class="meta">${escapeHtml(entry.kindLabel || ARCHIVE_KIND_LABEL[entry.kind] || entry.kind)}
          · ${escapeHtml(archiveStatusLabel(entry))}</span>
      </div>
${suspectBlock}
      <dl class="ainfo">
        <dt>状态</dt><dd>${escapeHtml(entry.suspect ? '疑似来源故障（结束记录待复核）' : (entry.status === 'restored' ? '曾结束，现已恢复' : '已结束 / 已下线'))}</dd>
        <dt>首次发现</dt><dd>${escapeHtml(entry.firstSeen.at || UNKNOWN_TEXT)}${entry.firstSeen.origin === 'baseline' ? '（基线快照，不是创建事件）' : ''}</dd>
        <dt>最后有效时间</dt><dd>${escapeHtml(entry.lastEffectiveAt || UNKNOWN_TEXT)}</dd>
        <dt>结束发现时间</dt><dd>${escapeHtml(entry.endDiscoveredAt || UNKNOWN_TEXT)}</dd>
        <dt>结束原因</dt><dd>${escapeHtml(entry.endReason || UNKNOWN_TEXT)}</dd>
        <dt>恢复时间</dt><dd>${escapeHtml(entry.restoredAt || UNKNOWN_NUM)}</dd>
        <dt>官方来源</dt><dd>${sourceLines}</dd>
        <dt>记录 id</dt><dd>${escapeHtml(entry.id)}</dd>
      </dl>

      <h2 class="ph2" id="archive-known">最后已知内容</h2>
      <p class="snote">${rich('这是**结束那一刻**的字段值（按基线 + 事件重放得到），不是当前值。')}</p>
      <dl class="aknown">
${knownRows || `        <dt>${escapeHtml(UNKNOWN_TEXT)}</dt><dd>${escapeHtml('结束时没有可重建的字段值')}</dd>`}
      </dl>

      <h2 class="ph2" id="archive-timeline">变化时间线（${(entry.timeline || []).length} 条）</h2>
      <ul class="pchglist">
${timeline || `        <li>${escapeHtml('没有可展示的事件')}</li>`}
      </ul>
`;
}

/** 详情页 JSON-LD：Article + BreadcrumbList（详情页刻意没有 ItemList） */
function archiveEntryJsonLd(entry, ctx = {}) {
  const siteUrl = ctx.siteUrl || '';
  const route = archiveEntryRoute(entry);
  const pageUrl = `${siteUrl}${route}`;
  const title = entry.title || entry.id;
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: `${title} · 历史档案`,
      description: `${title} 的结束 / 恢复记录：首次发现、最后有效时间、结束发现时间与变化时间线。资料失效不等于资料删除。`,
      url: pageUrl,
      inLanguage: 'zh-CN',
      isPartOf: { '@type': 'WebSite', name: 'AI 优惠聚合器', url: siteUrl }
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '首页', item: siteUrl },
        { '@type': 'ListItem', position: 2, name: ARCHIVE_HEADING, item: `${siteUrl}${ARCHIVE_INDEX_ROUTE}` },
        { '@type': 'ListItem', position: 3, name: title, item: pageUrl }
      ]
    }
  ];
}

/* ------------------------------------------------------------------ */
/* 页面诚实性断言                                                       */
/* ------------------------------------------------------------------ */

/**
 * 页面级诚实性断言。
 *
 * @param {string} html
 * @param {object} page `{ kind: 'archive-index', archives }` 或 `{ kind: 'archive-entry', entry }`
 */
function assertPageHonesty(html, page = {}) {
  const problems = [];
  const text = markupOnly(String(html || ''));
  if (!/<h1[\s>]/.test(text)) problems.push('缺少 <h1>');
  for (const word of FORBIDDEN_CLAIM_WORDS) {
    if (text.includes(word)) problems.push(`页面出现结论性词汇「${word}」—— 档案页只列事实`);
  }

  if (page.kind === 'archive-index') {
    if (!text.includes(ARCHIVE_HEADING)) problems.push(`缺少标题「${ARCHIVE_HEADING}」`);
    const archives = Array.isArray(page.archives) ? page.archives : [page.archives];
    const entries = archives.flatMap(archive => archive.entries || []);
    const markers = [...text.matchAll(/class="arow" data-item="([^"]*)"/g)].map(match => match[1]);
    if (markers.length !== entries.length) {
      problems.push(`索引页 ${markers.length} 行 ≠ 档案条目 ${entries.length} 条`);
    }
    for (const entry of entries) {
      if (!markers.includes(entry.id)) problems.push(`索引页缺少档案条目 ${entry.id}`);
    }
    // v3.0 Stage F：**三组必须都在**（「已结束优惠 / 已下线 Coding 套餐 / 已下线 API 计费记录」）。
    // 路由消失比一页说明更糟；某一组为空时它更要有明确的空态，而不是整组不见。
    //
    // ⚠️ 计数必须**在该组自己的 section 里**查：三组的计数行长得一样（0/0 时逐字相同），
    // 用整页 `includes` 会命中另一组的那一行 —— 断言看着在守着什么，其实永远为真。
    const sectionById = new Map([...String(html).matchAll(/<section[^>]*id="archive-([a-z]+)"[\s\S]*?<\/section>/g)]
      .map(match => [match[1], match[0]]));
    for (const kind of ARCHIVE_KINDS) {
      const archive = archives.find(item => item.kind === kind);
      if (!archive) { problems.push(`索引页缺少「${ARCHIVE_KIND_LABEL[kind]}」这一组`); continue; }
      const section = sectionById.get(kind);
      if (!section) { problems.push(`索引页缺少分组锚点 #archive-${kind}`); continue; }
      if (!section.includes(`结束 ${archive.counts.ended} 条 · 恢复 ${archive.counts.restored} 条`)) {
        problems.push(`「${ARCHIVE_KIND_LABEL[kind]}」这一组的结束 / 恢复计数与数据不一致`);
      }
    }
    // 空态：每个领域都必须有一句明确的空态，而不是空白。
    // 比对的文本要先**去掉标签**：空态文案里的 `**加粗**` 会被渲染成 `<b>`，
    // 拿带标签的 HTML 去 includes 原始文案会永远为假（这正是"断言看起来在守着什么"的坏味道）。
    const plain = stripTags(text);
    for (const archive of archives) {
      if ((archive.entries || []).length) continue;
      const empty = archiveEmptyText(archive.kind, archive);
      // 期望文本也要走**同一条渲染链**（rich → 去标签 → 反转义）再比对，
      // 否则 `**加粗**` 与实体转义会让 includes 永远为假。
      const expected = decodeEntities(stripTags(rich(empty)));
      if (!plain.includes(expected)) problems.push(`${archive.kind} 领域为空时没有明确的空态说明`);
    }
    // ItemList（页面带 JSON-LD 时）：声明数 == 元素数 == 页面行数，且成员就是这些条目
    if (/<script[^>]+type="application\/ld\+json"/.test(String(html || ''))) {
      const blocks = [...String(html).matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
      let list = null;
      for (const block of blocks) {
        try {
          const data = JSON.parse(block[1]);
          if (data && data['@type'] === 'ItemList') list = data;
        } catch (error) { /* 解析失败按"没有 ItemList"处理 */ }
      }
      if (!list) problems.push('索引页缺少 ItemList 结构化数据');
      else {
        const elements = Array.isArray(list.itemListElement) ? list.itemListElement : [];
        if (Number(list.numberOfItems) !== elements.length) {
          problems.push(`ItemList 声明 ${list.numberOfItems} 项，实际 ${elements.length} 项`);
        }
        if (elements.length !== markers.length) {
          problems.push(`ItemList ${elements.length} 项 ≠ 页面行 ${markers.length} 行`);
        }
      }
    }
    return problems;
  }

  if (page.kind === 'archive-entry') {
    const entry = page.entry;
    const title = entry.title || entry.id;
    if (!text.includes(title)) problems.push(`缺少标题「${title}」`);
    for (const required of ['状态', '首次发现', '最后有效时间', '结束发现时间', '最后已知内容', '变化时间线', '官方来源']) {
      if (!text.includes(required)) problems.push(`详情页缺少「${required}」`);
    }
    const timelineCount = (entry.timeline || []).length;
    if (!text.includes(`变化时间线（${timelineCount} 条）`)) {
      problems.push(`时间线条数与数据不一致（应为 ${timelineCount} 条）`);
    }
    // 门槛：不该生成详情页的条目被渲染出来也要红（与 models-page 同一条纪律）
    const gate = archiveDetailGate(entry);
    if (!gate.ok) problems.push(`该条目未过详情页门槛（${gate.reasons.join('；')}），不应有详情页`);
    if (entry.status === 'restored' && !text.includes('曾结束，现已恢复')) {
      problems.push('恢复的记录没有写成「曾结束，现已恢复」');
    }
    if (entry.suspect && !text.includes('疑似来源故障')) {
      problems.push('可疑的结束记录没有带「疑似来源故障」标记');
    }
    return problems;
  }

  problems.push(`未知的页面类型 ${page.kind}（assertPageHonesty 只认 archive-index / archive-entry）`);
  return problems;
}

module.exports = {
  ARCHIVE_INDEX_ROUTE,
  ARCHIVE_HEADING,
  ARCHIVE_DESCRIPTION,
  ARCHIVE_KIND_LABEL,
  ARCHIVE_KINDS,
  LIFECYCLE_RANK,
  LIFECYCLE_TYPES,
  FORBIDDEN_CLAIM_WORDS,
  UNKNOWN_TEXT,
  UNKNOWN_NUM,
  escapeHtml,
  rich,
  markupOnly,
  stripTags,
  decodeEntities,
  archiveEntryRoute,
  routePrefixOf,
  archiveEntryPrefix,
  archiveDetailGate,
  assertArchiveSitemapEligibility,
  assertArchiveDetailRoutes,
  defaultMassThreshold,
  sortEvents,
  buildArchive,
  assertArchiveIntegrity,
  assertEntrySetStable,
  archiveStatusLabel,
  archiveEmptyText,
  archiveEntryRowHtml,
  renderArchiveIndex,
  archiveIndexJsonLd,
  renderArchiveEntry,
  archiveEntryJsonLd,
  assertPageHonesty
};
