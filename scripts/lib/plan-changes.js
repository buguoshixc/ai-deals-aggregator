/**
 * v2.3 套餐变化视图（change radar for plans）：把套餐变化日志翻译成「读者看得懂的分栏」。
 *
 * ## 它回答什么
 *
 *   · 今日新增      —— 基准日当天首次收录的套餐（`created` 且 `at === 基准日`）
 *   · 最近 7 天变化 —— 价格 / 活动价 / 额度 / 模型 / 限制 / 地区的实质变化，
 *                      以及过去 6 天内首次收录的套餐
 *   · 不再收录      —— `ended` 事件（最近 30 天）
 *   · 重新出现      —— `restored` 事件（最近 30 天）
 *   · 其他变化      —— 记录级元信息（官方定价页 / 来源类型 / 来源地址）：只在时间线里出现，
 *                      **不进「最近变化」块、不进订阅源**
 *
 * ## 与 deals 的分工（为什么不复用 `changes.js`）
 *
 * 判据**共用**的部分只有时间轴工具（`daysBetween` / `addDays`），直接复用 `changes.js` 的实现。
 * 分栏本身刻意分开：deals 的雷达有「即将结束」一栏（依赖 `expiresAt`），而套餐没有绝对到期日；
 * deals 还有一套「文案微调降级」（被跟踪的自由文本在归一后相同 ⇒ 降级到 other），
 * 而 plans 的文案归一**前置在差异计算里**（`plan-history` 的 `compare` 覆写）——
 * 再实现一遍降级就是两套判据。
 *
 * ## 三条纪律
 *
 * 1. **只搬运，不猜测**：分栏、类型、原值/新值全部来自 `plan-history.json` 的事件与
 *    `plans.json` 的既有字段。拿不到标题快照就如实说没有（`titled: false`），不拿 id 去凑。
 * 2. **纯函数、离线、零依赖**：同 `(plans, store, asOf, availability)` 一定产出同一份结果，
 *    不读盘、不联网、不看时钟、不改入参。
 * 3. **缺失与「没有变化」分开说**：日志缺失/损坏时页面必须说「没有拿到日志」，而不是「没有变化」。
 */

'use strict';

const planHistory = require('./plan-history');
const changes = require('./changes');

/** 窗口。与 deals 的雷达同口径（7 天 / 30 天），但**不是同一个常量** —— 两页可以各自调整 */
const PLAN_CHANGES_WINDOWS = {
  recentDays: 7,
  endedDays: 30
};

const PLAN_CHANGES_LIMITS = {
  /** 每个分栏最多渲染多少行（超出只报条数，不删数据） */
  itemsPerSection: 30,
  /** `/plans/coding/` 顶部「最近变化」块最多几条 */
  homeItems: 5
};

/** 分栏顺序（页面与自测共用；顺序是契约） */
const PLAN_CHANGES_SECTION_ORDER = ['created', 'changed', 'ended', 'restored'];

/** 记录级元信息：变了也不是「套餐本身变了」，因此不进最近变化块与订阅源 */
const PLAN_META_FIELD_TYPES = ['updated'];

/** `/plans/coding/` 顶部块的取用优先级（桶内按时间倒序） */
const PLAN_HOME_PRIORITY = [
  'price_changed',
  'quota_increased', 'quota_decreased',
  'promo_started', 'promo_ended', 'promo_changed',
  'model_added', 'model_removed',
  'quota_changed', 'model_changed', 'restriction_changed', 'availability_changed', 'billing_changed',
  'created', 'ended', 'restored'
];

/** 分栏级措辞（类型 / 字段 / 结束原因的措辞在 `plan-history.js`，同一件事只有一种说法） */
const PLAN_CHANGES_WORDING = {
  PLAN_CHANGES_SECTION: {
    created: '今日新增',
    changed: '最近 7 天变化',
    ended: '不再收录',
    restored: '重新出现'
  },
  PLAN_CHANGES_LABELS: {
    sectionTitle: '套餐变化',
    anchor: 'plans',
    recentTitle: '最近变化',
    allChanges: '全部变化',
    homeMore: '另有 {n} 条更早的变化',
    more: '另有 {n} 条未显示',
    since: '变更记录自 {date} 起（此前状态没有记录）',
    empty: '当前没有观测到套餐变化',
    emptySection: {
      created: '截至基准日，没有观测到首次收录的套餐。',
      changed: '最近 7 天内没有观测到价格、活动价、额度、模型、限制或地区的变化。',
      ended: '自起算日起，没有观测到不再收录的套餐。',
      restored: '没有观测到重新出现的套餐。'
    },
    unavailable: '本次构建没有拿到套餐变更日志（plan-history.json 缺失或损坏）——这不表示「没有变化」。',
    plansSource: '套餐变化来自本站重建套餐数据时的观测记录；变更记录自 {date} 起。',
    disclaimer: '以上是本站重建套餐数据时留下的观测记录；「不再收录」表示人工来源层不再列出该套餐，'
      + '不表示厂商已经下架或套餐已经停售。价格、额度与条款最终以厂商官方页面为准。'
  }
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 确定性排序：新的在前，同一天按 planId / 类型 / 字段收敛（保证两次构建字节相同） */
function compareByRecency(a, b) {
  if (a.at !== b.at) return a.at < b.at ? 1 : -1;
  const ak = `${a.planId}\u0000${a.field || ''}\u0000${a.type || ''}`;
  const bk = `${b.planId}\u0000${b.field || ''}\u0000${b.type || ''}`;
  return ak < bk ? -1 : ak > bk ? 1 : 0;
}

/**
 * 由套餐变化日志 + 当前记录算出套餐变化视图。
 *
 * @param {object}   params
 * @param {object[]} params.plans       当前 `plans.json` 的记录（只读）
 * @param {object}   params.store       `plan-history.json` 解析后的对象（只读）
 * @param {string}   params.asOf        基准日 `YYYY-MM-DD`（**数据时间**，不是构建时刻）
 * @param {string}   [params.availability] `'ok'` / `'unavailable'`
 * @param {object}   [params.limits]    覆盖默认上限（自测用）
 * @returns {object}
 */
function buildPlanRadar({ plans = [], store = null, asOf = null, availability = 'ok', limits = null } = {}) {
  const cfg = Object.assign({}, PLAN_CHANGES_WINDOWS, PLAN_CHANGES_LIMITS, limits || {});
  const dateOk = DATE_RE.test(String(asOf || ''));
  const storeOk = Boolean(store) && Array.isArray(store.events);
  const state = availability === 'ok' && dateOk && storeOk ? 'ok' : 'unavailable';
  const startedAt = store && typeof store.startedAt === 'string' ? store.startedAt : null;

  const byId = new Map();
  for (const plan of plans || []) if (plan && plan.id) byId.set(plan.id, plan);

  const base = {
    availability: state,
    asOf: dateOk ? asOf : null,
    startedAt,
    windows: { recentDays: cfg.recentDays, endedDays: cfg.endedDays },
    coverage: {
      plansTotal: (plans || []).length,
      plansWithHistory: planHistory.eventsOf(store).length
        ? new Set(planHistory.eventsOf(store).map(event => event.planId)).size : 0
    },
    totals: { created: 0, changed: 0, ended: 0, restored: 0, meta: 0 },
    sections: {
      created: { items: [], truncated: 0 },
      changed: { items: [], truncated: 0 },
      ended: { items: [], truncated: 0 },
      restored: { items: [], truncated: 0 }
    },
    other: { metadata: [], truncated: 0 },
    home: { items: [] }
  };
  if (state !== 'ok') return base;

  /** 一条套餐的展示身份：优先当前数据，其次 `ended` 事件上的快照，最后如实说没有 */
  const identityOf = (id, event) => {
    const plan = byId.get(id) || null;
    const label = event && event.label && typeof event.label === 'object' ? event.label : null;
    const title = (plan && plan.planName) || (label && label.title) || null;
    const vendor = (plan && plan.provider) || (label && label.vendor) || '';
    return { title: title ? String(title) : null, vendor: vendor ? String(vendor) : '', titled: Boolean(title) };
  };

  const itemOf = (event, kind) => Object.assign({
    kind,
    planId: event.planId,
    at: event.at,
    type: event.type,
    field: event.field === undefined ? null : event.field,
    from: 'from' in event ? event.from : null,
    to: 'to' in event ? event.to : null,
    origin: event.origin === 'derived' ? 'derived' : 'observed',
    reason: typeof event.reason === 'string' ? event.reason : null,
    eventId: typeof event.eventId === 'string' ? event.eventId : null
  }, identityOf(event.planId, event));

  const all = { created: [], changed: [], ended: [], restored: [], metadata: [] };
  const recentFrom = changes.addDays(asOf, -(cfg.recentDays - 1));   // asOf-6 在内
  const endedFrom = changes.addDays(asOf, -(cfg.endedDays - 1));     // asOf-29 在内

  for (const event of planHistory.eventsOf(store)) {
    if (!event || typeof event !== 'object') continue;
    if (typeof event.at !== 'string' || !DATE_RE.test(event.at)) continue;   // 脏事件不渲染
    const diff = changes.daysBetween(event.at, asOf);
    // 未来日期（diff > 0）先由 check:plan-history 拦下（它会报「at 是未来日期」），
    // 这里只是不渲染 —— 雷达不拿未来的事当已发生。
    if (diff === null || diff > 0) continue;

    if (event.type === 'ended' || event.type === 'restored') {
      if (event.at < endedFrom) continue;
      all[event.type].push(itemOf(event, event.type));
      continue;
    }
    if (event.at < recentFrom) continue;
    if (event.type === 'created') {
      if (diff === 0) all.created.push(itemOf(event, 'created'));
      else all.changed.push(itemOf(event, 'created'));   // 过去 6 天内首次收录 ⇒ 并进「最近 7 天变化」
      continue;
    }
    if (PLAN_META_FIELD_TYPES.includes(event.type)) {
      all.metadata.push(itemOf(event, 'changed'));
      continue;
    }
    all.changed.push(itemOf(event, 'changed'));
  }

  for (const key of Object.keys(all)) all[key].sort(compareByRecency);

  const capInto = list => {
    const capped = list.slice(0, cfg.itemsPerSection);
    return { items: capped, truncated: Math.max(0, list.length - capped.length) };
  };
  base.sections.created = capInto(all.created);
  base.sections.changed = capInto(all.changed);
  base.sections.ended = capInto(all.ended);
  base.sections.restored = capInto(all.restored);
  base.other = {
    metadata: all.metadata.slice(0, cfg.itemsPerSection),
    truncated: Math.max(0, all.metadata.length - cfg.itemsPerSection)
  };
  base.totals = {
    created: all.created.length,
    changed: all.changed.length,
    ended: all.ended.length,
    restored: all.restored.length,
    meta: all.metadata.length
  };

  // ---- 「最近变化」块：按优先级取（桶内已是时间倒序）-------------------------
  const pools = {};
  const poolOf = type => all.changed.filter(item => item.type === type)
    .concat(type === 'created' ? all.created : [], type === 'ended' ? all.ended : [],
      type === 'restored' ? all.restored : []);
  for (const type of PLAN_HOME_PRIORITY) pools[type] = poolOf(type);
  const home = [];
  const used = new Set();
  for (const type of PLAN_HOME_PRIORITY) {
    for (const item of pools[type] || []) {
      if (home.length >= cfg.homeItems) break;
      const key = `${item.planId}\u0000${item.type}\u0000${item.field || ''}\u0000${item.at}`;
      if (used.has(key)) continue;
      used.add(key);
      home.push({ ...item, homeKind: type });
    }
    if (home.length >= cfg.homeItems) break;
  }
  base.home = { items: home, truncated: Math.max(0, base.totals.changed + base.totals.created + base.totals.ended + base.totals.restored - home.length) };

  return base;
}

/** 一句话摘要（日志 / 报告用） */
function summarize(radar) {
  const t = (radar && radar.totals) || {};
  return {
    availability: radar ? radar.availability : 'unavailable',
    asOf: radar ? radar.asOf : null,
    startedAt: radar ? radar.startedAt : null,
    totals: Object.assign({ created: 0, changed: 0, ended: 0, restored: 0, meta: 0 }, t),
    hidden: radar ? {
      created: radar.sections.created.truncated,
      changed: radar.sections.changed.truncated,
      ended: radar.sections.ended.truncated,
      restored: radar.sections.restored.truncated,
      metadata: radar.other.truncated
    } : null,
    coverage: radar ? radar.coverage : null,
    homeCount: radar && radar.home ? radar.home.items.length : 0
  };
}

/** 令牌式取值：把一个分栏（含其他变化）的全部条目摊平，供渲染与对账使用 */
function itemsOf(radar) {
  if (!radar) return [];
  const out = [];
  for (const key of PLAN_CHANGES_SECTION_ORDER) out.push(...radar.sections[key].items);
  out.push(...(radar.other.metadata || []));
  return out;
}

module.exports = {
  PLAN_CHANGES_WINDOWS,
  PLAN_CHANGES_LIMITS,
  PLAN_CHANGES_SECTION_ORDER,
  PLAN_META_FIELD_TYPES,
  PLAN_HOME_PRIORITY,
  PLAN_CHANGES_WORDING,
  buildPlanRadar,
  summarize,
  itemsOf
};
