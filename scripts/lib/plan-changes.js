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
 *
 * ## v3.0：第二个来源（API 计费），**共用一份分栏骨架**
 *
 * 题面 Stage H 要点名「让用户可以区分优惠变化 / Coding 套餐变化 / API 价格变化」。
 * 本文件因此从「一个来源」变成「两个来源 + 一份实现」：
 *
 *   · `buildPlanRadar()` —— 套餐（`plan-history.json`，v2.3 起）；
 *   · `buildApiPlanRadar()` —— API 计费（`api-plan-history.json`，v3.0 起）；
 *   · 两者都是 `buildChangeRadar(params, source)` 的薄封装，差异**全部**登记在 `RADAR_SOURCES` 里
 *     （取哪份日志 / 哪些类型算元信息 / 首页优先级 / 措辞 / 记录展示身份）。
 *
 * **不建立第二套变化检测**：事件本身由 `api-plan-history.js` 的差异计算产出，
 * 这里只负责「取出来给人看」。分栏循环里**没有**任何按来源分叉的 if ——
 * 一旦分叉，两份视图的窗口、上限与排序就会各自演化，而那种漂移两边看起来都正常。
 */

'use strict';

const planHistory = require('./plan-history');
const apiPlanHistory = require('./api-plan-history');
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

/* ------------------------------------------------------------------ */
/* 第二个来源：API 计费（v3.0）                                          */
/* ------------------------------------------------------------------ */

/**
 * API 计费的「记录级元信息」：与套餐同一条纪律 —— 官方定价页地址 / 来源类型 / 来源地址
 * 变了不等于「价格变了」，所以只在时间线里出现，**不进「最近变化」块、不进订阅源**。
 *
 * 判据不是在这儿新写的：`API_PLAN_FIELD_EVENT_TYPES` 里只有这三个字段映射到 `updated`，
 * 所以「元信息事件」在 API 这份日志里就等于 `type === 'updated'`。
 */
const API_PLAN_META_FIELD_TYPES = ['updated'];

/**
 * `/plans/api/` 顶部「最近变化」块的取用优先级（桶内按时间倒序）。
 *
 * 顺序表达的是**读者最该先看到什么**：单价涨跌 → 模型计价条目增减/口径 → 免费额度与
 * credits → 限速 → 单位/币种/限制/地区 → 生命周期。与套餐那一份**分开列**：
 * 两边的类型表本来就不相交（API 没有 `promo_*`，套餐没有 `price_*`）。
 */
const API_PLAN_HOME_PRIORITY = [
  'price_increased', 'price_decreased',
  'model_added', 'model_removed', 'model_changed',
  'free_tier_changed', 'credits_changed', 'limits_changed',
  'unit_changed', 'currency_changed', 'restriction_changed', 'availability_changed',
  'created', 'ended', 'restored'
];

/**
 * API 计费变化视图的措辞。
 *
 * **能复用的一律复用**：`since` / `unavailable` / `from` / `to` / 免责句都已经在
 * `api-plan-history.js` 的措辞表里（那也是 `/plans/api/` 页面用的同一份），这里只覆盖
 * 「分栏标题 / 空态 / 本页摘要」这些**只有 /changes/ 这一层才需要**的槽位 ——
 * 抄一份句子就会立刻出现「同一件事两种说法」。
 */
const API_PLAN_CHANGES_LABELS = Object.assign(
  {},
  apiPlanHistory.API_PLAN_HISTORY_WORDING.API_PLAN_HISTORY_LABELS,
  {
    sectionTitle: 'API 价格变化',
    anchor: 'api-plans',
    recentTitle: '最近变化',
    allChanges: '全部变化',
    homeMore: '另有 {n} 条更早的变化',
    more: '另有 {n} 条未显示',
    empty: '当前没有观测到 API 价格变化',
    // 分栏空态：**逐栏说清是什么没有变化**。复用套餐那几句会让读者以为这份读数漏了套餐。
    emptySection: {
      created: '截至基准日，没有观测到首次收录的 API 计费记录。',
      changed: '最近 7 天内没有观测到单价、计费单位、模型计价条目、免费额度、限速或 credits 的变化。',
      ended: '自起算日起，没有观测到不再收录的 API 计费记录。',
      restored: '没有观测到重新出现的 API 计费记录。'
    },
    plansSource: 'API 价格变化来自本站重建 API 计费数据时的观测记录；变更记录自 {date} 起。',
    disclaimer: apiPlanHistory.API_PLAN_HISTORY_WORDING.API_PLAN_HISTORY_NOTES.disclaimer
  }
);

const API_PLAN_CHANGES_WORDING = {
  API_PLAN_CHANGES_SECTION: PLAN_CHANGES_WORDING.PLAN_CHANGES_SECTION,
  API_PLAN_CHANGES_LABELS
};

/**
 * 平台键 → 显示名。**只读调用方交进来的表**：本模块是离线纯函数，
 * 不读盘、不联网（缺表时回落到键本身，而不是偷偷 `providers.load()`）。
 */
function providerNameOf(key, table) {
  const entry = table && table[key];
  return (entry && entry.name) || key;
}

/** 确定性排序：新的在前，同一天按 planId / 类型 / 字段收敛（保证两次构建字节相同） */
function compareByRecency(a, b) {
  if (a.at !== b.at) return a.at < b.at ? 1 : -1;
  const ak = `${a.planId}\u0000${a.field || ''}\u0000${a.type || ''}`;
  const bk = `${b.planId}\u0000${b.field || ''}\u0000${b.type || ''}`;
  return ak < bk ? -1 : ak > bk ? 1 : 0;
}

/**
 * 视图来源（v3.0：**两个来源共用一份分栏骨架**）。
 *
 * 分栏骨架 —— 窗口、分栏顺序、每栏上限、确定性排序、「最近变化」块的优先级取用 ——
 * 只有一份实现（`buildChangeRadar`）。来源之间只允许有四样差异：
 *
 *   1. 事件从哪份日志取（`eventsOf`）；
 *   2. 哪些事件类型属于「记录级元信息」（`metaFieldTypes`）；
 *   3. 首页优先级块取用顺序（`homePriority`）；
 *   4. 措辞表与「这条记录现在叫什么」（`wording` / `identityOf`）。
 *
 * **不许**再加第五样差异：一旦某个来源在分栏循环里分叉，就会出现两套判据，
 * 而「两边看起来都对、只有一边悄悄漂了」是最坏的坏法。
 */
const RADAR_SOURCES = {
  plans: {
    key: 'plans',
    eventsOf: store => planHistory.eventsOf(store),
    metaFieldTypes: PLAN_META_FIELD_TYPES,
    homePriority: PLAN_HOME_PRIORITY,
    wording: PLAN_CHANGES_WORDING,
    identityOf(id, event, byId) {
      const plan = byId.get(id) || null;
      const label = event && event.label && typeof event.label === 'object' ? event.label : null;
      const title = (plan && plan.planName) || (label && label.title) || null;
      const vendor = (plan && plan.provider) || (label && label.vendor) || '';
      return { title: title ? String(title) : null, vendor: vendor ? String(vendor) : '', titled: Boolean(title) };
    }
  },
  api: {
    key: 'api',
    eventsOf: store => apiPlanHistory.eventsOf(store),
    metaFieldTypes: API_PLAN_META_FIELD_TYPES,
    homePriority: API_PLAN_HOME_PRIORITY,
    wording: API_PLAN_CHANGES_WORDING,
    identityOf(id, event, byId, { providerTable = null } = {}) {
      const plan = byId.get(id) || null;
      const label = event && event.label && typeof event.label === 'object' ? event.label : null;
      const title = (plan && plan.planName) || (label && label.title) || null;
      // 平台用**显示名**（`providers.json` 的表：openai → OpenAI）——页面上就是这么写的，
      // 订阅源里写内部键会让同一个东西在页面与订阅里叫两个名字。
      const vendor = plan ? providerNameOf(plan.provider, providerTable) : ((label && label.vendor) || '');
      return { title: title ? String(title) : null, vendor: vendor ? String(vendor) : '', titled: Boolean(title) };
    }
  }
};

/**
 * 由一个变化日志 + 当前记录算出变化视图（**两个来源共用的唯一实现**）。
 *
 * @param {object}   params
 * @param {object[]} params.plans       当前记录（`plans.json` 或 `api-plans.json` 的 `plans`，只读）
 * @param {object}   params.store        对应的变化日志（只读）
 * @param {string}   params.asOf         基准日 `YYYY-MM-DD`（**数据时间**，不是构建时刻）
 * @param {string}   [params.availability] `'ok'` / `'unavailable'`
 * @param {object}   [params.limits]     覆盖默认上限（自测用）
 * @param {object}   [params.providerTable] 平台键 → 记录的表（API 侧取显示名用）
 * @param {string}   sourceKey           `RADAR_SOURCES` 的键
 * @returns {object}
 */
function buildChangeRadar({ plans = [], store = null, asOf = null, availability = 'ok', limits = null, providerTable = null } = {}, sourceKey) {
  const source = RADAR_SOURCES[sourceKey];
  if (!source) throw new Error(`未知的变化视图来源：${sourceKey}`);
  const cfg = Object.assign({}, PLAN_CHANGES_WINDOWS, PLAN_CHANGES_LIMITS, limits || {});
  const dateOk = DATE_RE.test(String(asOf || ''));
  const storeOk = Boolean(store) && Array.isArray(store.events);
  const state = availability === 'ok' && dateOk && storeOk ? 'ok' : 'unavailable';
  const startedAt = store && typeof store.startedAt === 'string' ? store.startedAt : null;

  const byId = new Map();
  for (const plan of plans || []) if (plan && plan.id) byId.set(plan.id, plan);

  const events = source.eventsOf(store);

  const base = {
    availability: state,
    asOf: dateOk ? asOf : null,
    startedAt,
    windows: { recentDays: cfg.recentDays, endedDays: cfg.endedDays },
    coverage: {
      // 名字沿用 plans 的槽位（消费方读的是这两个键），意思是「当前记录数 / 有历史的记录数」。
      plansTotal: (plans || []).length,
      plansWithHistory: events.length ? new Set(events.map(event => event.planId)).size : 0
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

  /** 一条记录的展示身份：优先当前数据，其次 `ended` 事件上的快照，最后如实说没有 */
  const identityOf = (id, event) => source.identityOf(id, event, byId, { providerTable });

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

  for (const event of events) {
    if (!event || typeof event !== 'object') continue;
    if (typeof event.at !== 'string' || !DATE_RE.test(event.at)) continue;   // 脏事件不渲染
    const diff = changes.daysBetween(event.at, asOf);
    // 未来日期（diff > 0）先由 check:*-history 拦下（它会报「at 是未来日期」），
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
    if (source.metaFieldTypes.includes(event.type)) {
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
  for (const type of source.homePriority) pools[type] = poolOf(type);
  const home = [];
  const used = new Set();
  for (const type of source.homePriority) {
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

/**
 * 由套餐变化日志 + 当前记录算出套餐变化视图（`/plans/coding/`、`/changes/` 的套餐分栏、
 * `feed/plans/coding/changes.*` 都读它）。
 *
 * @param {object}   params
 * @param {object[]} params.plans       当前 `plans.json` 的记录（只读）
 * @param {object}   params.store       `plan-history.json` 解析后的对象（只读）
 * @param {string}   params.asOf        基准日 `YYYY-MM-DD`（**数据时间**，不是构建时刻）
 * @param {string}   [params.availability] `'ok'` / `'unavailable'`
 * @param {object}   [params.limits]    覆盖默认上限（自测用）
 * @returns {object}
 */
function buildPlanRadar(params = {}) {
  return buildChangeRadar(params, 'plans');
}

/**
 * 由 API 计费变化日志 + 当前记录算出 API 计费变化视图（v3.0 的第二个来源）。
 *
 * 与 `buildPlanRadar` **同一个实现、同一套分栏**，差异只在判据表与措辞（见 `RADAR_SOURCES`）。
 * **不建立第二套变化检测**：事件本身来自 `api-plan-history.js`（`record` 的差异计算），
 * 这里只做「取出来给人看」。
 *
 * @param {object}   params
 * @param {object[]} params.plans       当前 `api-plans.json` 的记录（只读）
 * @param {object}   params.store       `api-plan-history.json` 解析后的对象（只读）
 * @param {string}   params.asOf        基准日 `YYYY-MM-DD`
 * @param {string}   [params.availability] `'ok'` / `'unavailable'`
 * @param {object}   [params.limits]    覆盖默认上限（自测用）
 * @param {object}   [params.providerTable] 平台键 → 记录的表（取显示名用）
 * @returns {object}
 */
function buildApiPlanRadar(params = {}) {
  return buildChangeRadar(params, 'api');
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
  // v3.0：第二个来源（API 计费）。分栏骨架与套餐共用 `buildChangeRadar`，
  // 两个来源的差异全部登记在 `RADAR_SOURCES` 里。
  API_PLAN_META_FIELD_TYPES,
  API_PLAN_HOME_PRIORITY,
  API_PLAN_CHANGES_WORDING,
  RADAR_SOURCES,
  buildChangeRadar,
  buildPlanRadar,
  buildApiPlanRadar,
  summarize,
  itemsOf
};
