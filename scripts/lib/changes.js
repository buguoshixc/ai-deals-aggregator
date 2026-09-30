/**
 * v1.5 变化雷达（change radar）：把 v1.4 的变更日志翻译成「读者看得懂的分栏」。
 *
 * ## 它回答什么
 *
 *   · 今日新增    —— 今天首次收录的条目（`created` 且 `at === 基准日`）
 *   · 最近 7 天变化 —— 内容 / 领取条件 / 有效期的变化，以及过去 6 天内首次收录的条目
 *   · 即将结束    —— 写有绝对截止日期、且按基准日算 7 天内到期的条目（**状态量，不是事件**）
 *   · 已结束      —— `ended` 事件（最近 30 天）
 *   · 重新出现    —— `restored` 事件（最近 30 天）
 *   · 其他变化    —— 元信息更新（`updated` 类字段）与文案微调：**只在 `/changes/` 折叠块里**，
 *                    永不进入首页雷达
 *
 * ## 五条纪律（每一条都有自测盯着）
 *
 * 1. **只搬运，不猜测**。这里没有一个字节是生成的：分栏、标签、原值/新值全部来自
 *    `deal-history.json` 的事件或 `deals.json` 的既有字段。标题解析不到就如实说没有标题快照，
 *    不拿 id 之外的任何东西去凑（`titled: false`）。
 * 2. **纯函数、离线、零依赖**。同 `(deals, store, asOf, availability)` 一定产出同一份结果，
 *    不读盘、不联网、不改入参。它是首页条带与 `/changes/` 页的**唯一判据来源**，
 *    渲染层只做格式化（`changes-selftest` 有一条静态扫描：这个文件里不许出现网络调用）。
 * 3. **普通文案改写不是重大变化**。`description` / `lastSeen` / `zh` 在 v1.4 里就不被跟踪
 *    （产生 0 事件）；这里再补一道：被跟踪的**自由文本**字段若原值与新值在「文案归一」
 *    （去零宽字符、全角空格、折叠连续空白、trim）之后相同，一律降级为「文案微调」，
 *    进 `other.cosmetic`，**不上首页、不占「最近 7 天变化」**，但仍然计数、仍然展示（折叠块）。
 *    日期与枚举字段（`expiresAt` / `pricingModel` / `type` / …）不参与这条判定 ——
 *    它们差一个字符就是差一个语义。
 * 4. **窗口是有界的**。分栏各自最多 30 行（首页最多 3 项），超出只报「另有 N 条未显示」，
 *    **不删数据**：单条记录的完整历史仍在它自己的「变更记录」里。
 * 5. **缺失与「没有变化」必须分开说**。日志缺失/损坏（`unavailable`）时，
 *    页面必须说「没有拿到历史日志」，而不是说「没有变化」。空态还要按**原因**分开写：
 *    「即将结束」为空可能是「一条都没写截止日期」（数据缺口，附实测覆盖数），
 *    也可能是「有 N 条写了截止日期，但都不在 7 天内到期」。
 *
 * ## 与 v1.4 的分工
 *
 * v1.4 负责**记录**（什么时候、哪个字段、从什么变成什么，可重放验证）；v1.5 只负责**取视图**。
 * 因此这里不写历史、不改历史、不做任何裁剪：`scripts/data/deal-history.json` 始终是唯一真值，
 * 写入点仍然只有 `scripts/collect.js` 一处。
 */

/* ------------------------------------------------------------------ */
/* 措辞（唯一权威）                                                     */
/* ------------------------------------------------------------------ */

/**
 * 用户能读到的字。前端有一份**受控副本**（`index.html` 的 `AUDIENCE:START/END` 块里），
 * 由 `validate.js --strict` 的 `checkWordingContract()` 逐项文本比对 —— 改一边而没改另一边
 * 会立刻变红。事件类型 / 字段名 / 结束原因 / 免责句**不在这里**：它们直接复用
 * `history.HISTORY_WORDING`，同一件事在详情页与雷达上必须用同一个词。
 */
const CHANGES_WORDING = {
  CHANGES_SECTION: {
    created: '今日新增',
    changed: '最近 7 天变化',
    endingSoon: '即将结束',
    ended: '已结束',
    restored: '重新出现'
  },
  CHANGES_LABELS: {
    radar: '变化雷达',
    pageTitle: '优惠变化雷达',
    all: '全部变化',
    more: '另有 {n} 条未显示',
    base: '以最近一次数据更新 {date} 为基准',
    since: '变更记录自 {date} 起（此前状态没有记录）',
    homeEmpty: '当前没有观测到变化',
    homeEmptySince: '当前没有观测到变化（记录自 {date} 起）',
    // 窄屏短文案：全称在 390px 下比正文区宽、会被横滑容器裁掉半句（实测 16px）。
    // 两套文案同时在 DOM 里、由 CSS 媒体查询切换（**不用 JS**）—— 无 JS 的窄屏访客
    // 同样要看到完整的那一句。这与 v1.2 的按需求入口用同一套做法。
    homeEmptyShort: '自 {date} 起记录，暂无变化',
    tombstone: '已移除的记录（无标题快照）',
    other: '不计入高价值的其他变化',
    otherNote: '这些变化只影响记录的元信息或写法（分类、出处、空白与措辞），不改变优惠本身，因此不进入首页雷达。'
  },
  CHANGES_SOON: {
    today: '今天截止',
    days: '剩 {n} 天'
  },
  CHANGES_EMPTY: {
    created: '截至基准日，没有观测到首次收录的条目。',
    changed: '最近 7 天内没有观测到优惠内容、领取条件或有效期的变化。',
    endingSoonNone: '当前收录的条目里没有一条写有绝对截止日期，因此这一栏暂时为空。',
    endingSoonLater: '有 {n} 条写有截止日期，但没有一条在 {days} 天内到期。',
    ended: '自起算日起，没有观测到不再收录的条目。',
    restored: '没有观测到重新出现的条目。',
    other: '没有这类变化。'
  },
  CHANGES_NOTES: {
    scope: '本页五个分栏互不重叠：今日新增只列今天首次收录的条目；最近 7 天变化列内容与期限的变化，以及过去 6 天内首次收录的条目。',
    window: '已结束与重新出现只列最近 30 天；更早的记录仍留在该条目自己的「变更记录」里。',
    soonBasis: '「即将结束」只认数据里写有绝对截止日期（expiresAt）的条目，剩余天数按基准日计算。',
    unavailable: '本次构建没有拿到历史日志（deal-history.json 缺失或损坏），因此无法显示变化记录 —— 这不表示「没有变化」。',
    noEvents: '自起算日起还没有任何变更事件。'
  }
};

/* ------------------------------------------------------------------ */
/* 窗口、上限、分类                                                     */
/* ------------------------------------------------------------------ */

const WINDOWS = {
  /** 「最近 N 天变化」的窗口（含基准日当天） */
  recentDays: 7,
  /** 「已结束 / 重新出现」的展示窗口 */
  endedDays: 30,
  /** 「即将结束」的前瞻天数 */
  soonDays: 7
};

const LIMITS = {
  /** 每个分栏最多渲染多少行（超出只报条数，不删数据） */
  itemsPerSection: 30,
  /** 首页条带最多展示几项 */
  homeItems: 3
};

/** 分栏顺序（页面与条带共用；顺序是契约，自测按它逐项对账） */
const SECTION_ORDER = ['created', 'changed', 'endingSoon', 'ended', 'restored'];

/**
 * 取哪些事件的类型算「高价值」。
 * `updated` 是记录层面的元信息（分类 / 地区 / 收录来源 / 出处 / 人工核验声明），
 * 它变了对读者「要不要用这条优惠」几乎没有影响，因此单列到 `other.metadata`。
 */
const HIGH_VALUE_FIELD_TYPES = ['benefit_changed', 'eligibility_changed', 'expiry_changed'];
const LOW_VALUE_FIELD_TYPES = ['updated'];

/**
 * 首页条带的取用优先级（桶内按时间倒序）。
 * 「首次收录」排第一：新东西是最强的回访理由；「不再收录」第二：它会让之前看过的优惠消失。
 */
const HOME_PRIORITY = [
  'created',
  'ended',
  'restored',
  'benefit_changed',
  'expiry_changed',
  'eligibility_changed',
  'endingSoon'
];

/**
 * 参与「文案微调」判定的自由文本字段。
 * 刻意**不含** `features`（数组，改一个标签就是改一个卖点）、`evidence`（结构化引文对象）、
 * `priceLine` 之外的结构化字段 —— 见文件头第 3 条纪律。
 */
const COSMETIC_FIELDS = ['discountInfo', 'eligibility', 'validity', 'priceLine'];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/* ------------------------------------------------------------------ */
/* 小工具                                                               */
/* ------------------------------------------------------------------ */

/** 文案归一：只处理「不影响语义的写法差异」，不做任何近似或相似度比较 */
function cosmeticText(value) {
  if (typeof value !== 'string') return null;
  return value
    .replace(/[\u200b-\u200d\ufeff]/g, '') // 零宽字符
    .replace(/\u3000/g, ' ')               // 全角空格
    .replace(/\s+/g, ' ')
    .trim();
}

/** 该事件是否只是「写法变了」（仅自由文本字段；日期/枚举/数组一律不算） */
function isCosmetic(event) {
  if (!event || !COSMETIC_FIELDS.includes(event.field)) return false;
  const from = cosmeticText(event.from);
  const to = cosmeticText(event.to);
  if (from === null || to === null) return false;
  return from === to;
}

/** 日期差（later - earlier，单位天）。任一非法返回 null */
function daysBetween(later, earlier) {
  if (!DATE_RE.test(String(later || '')) || !DATE_RE.test(String(earlier || ''))) return null;
  const a = Date.parse(`${later}T00:00:00Z`);
  const b = Date.parse(`${earlier}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((a - b) / 86400000);
}

/** 基准日加减天数 */
function addDays(date, delta) {
  if (!DATE_RE.test(String(date || ''))) return null;
  const t = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(t)) return null;
  return new Date(t + delta * 86400000).toISOString().slice(0, 10);
}

/** 确定性排序：新的在前，同一天按 id / 字段 / 类型收敛（保证两次构建字节相同） */
function compareByRecency(a, b) {
  if (a.at !== b.at) return a.at < b.at ? 1 : -1;
  const ak = `${a.id}\u0000${a.field || ''}\u0000${a.type || ''}`;
  const bk = `${b.id}\u0000${b.field || ''}\u0000${b.type || ''}`;
  return ak < bk ? -1 : ak > bk ? 1 : 0;
}

/* ------------------------------------------------------------------ */
/* 主入口                                                               */
/* ------------------------------------------------------------------ */

/**
 * 由 v1.4 的历史文档 + 当前记录算出雷达视图。
 *
 * @param {object}   params
 * @param {object[]} params.deals         当前 `deals.json` 的记录（只读）
 * @param {object}   params.store         `deal-history.json` 解析后的对象（只读）
 * @param {string}   params.asOf          基准日 `YYYY-MM-DD`（**数据时间**，不是构建时刻）
 * @param {string}   [params.availability] `'ok'` / `'unavailable'`
 * @param {object}   [params.limits]      覆盖默认上限（自测用）
 * @returns {object} 见本文件头与 `docs/SCHEMA-v1.5.md`
 */
function buildRadar({ deals = [], store = null, asOf = null, availability = 'ok', limits = null } = {}) {
  const cfg = Object.assign({}, WINDOWS, LIMITS, limits || {});
  const dateOk = DATE_RE.test(String(asOf || ''));
  const storeOk = Boolean(store) && Array.isArray(store.events);
  const state = availability === 'ok' && dateOk && storeOk ? 'ok' : 'unavailable';

  const startedAt = store && typeof store.startedAt === 'string' ? store.startedAt : null;
  const events = state === 'ok' ? store.events : [];

  const byId = new Map();
  for (const deal of deals || []) if (deal && deal.id) byId.set(deal.id, deal);

  const scope = (deals || []).filter(deal => deal && deal.type === 'deal');
  const withDeadline = scope.filter(deal => DATE_RE.test(String(deal.expiresAt || '')));
  const coverage = { dealsTotal: scope.length, dealsWithExpiresAt: withDeadline.length };

  const base = {
    availability: state,
    asOf: dateOk ? asOf : null,
    startedAt,
    windows: { recentDays: cfg.recentDays, endedDays: cfg.endedDays, soonDays: cfg.soonDays },
    coverage,
    totals: { created: 0, changed: 0, endingSoon: 0, ended: 0, restored: 0, other: 0 },
    sections: {
      created: { items: [], truncated: 0 },
      changed: { items: [], truncated: 0 },
      endingSoon: { items: [], truncated: 0 },
      ended: { items: [], truncated: 0 },
      restored: { items: [], truncated: 0 }
    },
    other: { cosmetic: [], metadata: [], truncated: { cosmetic: 0, metadata: 0 } },
    home: { items: [] }
  };
  if (state !== 'ok') return base;

  /** 一条记录的展示身份：优先当前数据，其次 ended 事件上的标题快照，最后如实说没有 */
  const identityOf = (id, event) => {
    const deal = byId.get(id) || null;
    const label = event && event.label && typeof event.label === 'object' ? event.label : null;
    const title = (deal && deal.title) || (label && label.title) || null;
    const vendor = (deal && deal.vendor) || (label && label.vendor) || '';
    // 只有 `type === 'deal'` 的记录才有静态详情页（见 build-local 的 writeDetailPages），
    // 给工具条目或已离开数据集的条目挂链接就是造死链。
    const linkable = Boolean(deal && deal.type === 'deal');
    return {
      title: title ? String(title) : null,
      vendor: vendor ? String(vendor) : '',
      titled: Boolean(title),
      linkable,
      href: linkable ? `deal/${encodeURIComponent(id)}/` : null
    };
  };

  const itemOf = (event, kind, extra) => Object.assign({
    kind,
    id: event.id,
    at: event.at,
    type: event.type,
    field: event.field === undefined ? null : event.field,
    from: 'from' in event ? event.from : null,
    to: 'to' in event ? event.to : null,
    origin: event.origin === 'derived' ? 'derived' : 'observed',
    reason: typeof event.reason === 'string' ? event.reason : null
  }, identityOf(event.id, event), extra || {});

  // ---- 事件三分类：先全部收集（不截断），再排序、再分别裁剪 -------------
  const all = { created: [], changed: [], ended: [], restored: [], cosmetic: [], metadata: [] };
  const recentFrom = addDays(asOf, -(cfg.recentDays - 1));   // asOf-6 在内
  const endedFrom = addDays(asOf, -(cfg.endedDays - 1));     // asOf-29 在内

  for (const event of events) {
    if (!event || typeof event !== 'object') continue;
    if (typeof event.at !== 'string' || !DATE_RE.test(event.at)) continue;   // 脏事件不渲染
    const diff = daysBetween(event.at, asOf);
    // diff 是「事件日 − 基准日」：负数在过去。未来日期（diff > 0）先由 `check:history`
    // 拦下（它会报「at 是未来日期」），这里只是不渲染它 —— 雷达不拿未来的事当已发生。
    if (diff === null || diff > 0) continue;

    if (event.type === 'ended' || event.type === 'restored') {
      if (event.at < endedFrom) continue;                                    // 超出 30 天窗口
      const kind = event.type === 'ended' ? 'ended' : 'restored';
      all[kind].push(itemOf(event, kind));
      continue;
    }
    // 其余（created / 字段事件）只活在「最近 7 天」窗口里
    if (event.at < recentFrom) continue;
    if (event.type === 'created') {
      if (diff === 0) {
        // 今天首次收录 ⇒ 「今日新增」
        all.created.push(itemOf(event, 'created'));
      } else {
        // 过去 6 天内首次收录 ⇒ 并进「最近 7 天变化」（否则「3 天前新增」会哪儿都不显示）
        all.changed.push(itemOf(event, 'changed'));
      }
      continue;
    }
    if (LOW_VALUE_FIELD_TYPES.includes(event.type)) {
      all.metadata.push(itemOf(event, 'changed'));
      continue;
    }
    if (isCosmetic(event)) {
      all.cosmetic.push(itemOf(event, 'changed'));
      continue;
    }
    if (HIGH_VALUE_FIELD_TYPES.includes(event.type)) {
      all.changed.push(itemOf(event, 'changed'));
      continue;
    }
    // 认不出的类型：不猜、不丢 —— 记进元信息（check:history 会先一步拦未知类型）
    all.metadata.push(itemOf(event, 'changed'));
  }

  // ---- 即将结束（状态量，不是事件）-------------------------------------
  const endingSoon = [];
  for (const deal of withDeadline) {
    const daysLeft = daysBetween(deal.expiresAt, asOf);
    if (daysLeft === null || daysLeft < 0 || daysLeft > cfg.soonDays) continue;
    const identity = identityOf(deal.id, null);
    endingSoon.push(Object.assign({
      kind: 'endingSoon',
      id: deal.id,
      at: deal.expiresAt,
      type: 'ending_soon',
      expiresAt: deal.expiresAt,
      daysLeft,
      validity: typeof deal.validity === 'string' ? deal.validity : null
    }, identity));
  }
  endingSoon.sort((a, b) => (a.daysLeft - b.daysLeft) || (a.at < b.at ? -1 : a.at > b.at ? 1 : (a.id < b.id ? -1 : 1)));

  for (const key of Object.keys(all)) all[key].sort(compareByRecency);

  // ---- 组装分栏（有界）-------------------------------------------------
  const capInto = list => {
    const capped = list.slice(0, cfg.itemsPerSection);
    return { items: capped, truncated: Math.max(0, list.length - capped.length) };
  };
  base.sections.created = capInto(all.created);
  base.sections.changed = capInto(all.changed);
  base.sections.endingSoon = capInto(endingSoon);
  base.sections.ended = capInto(all.ended);
  base.sections.restored = capInto(all.restored);
  base.other = {
    cosmetic: all.cosmetic.slice(0, cfg.itemsPerSection),
    metadata: all.metadata.slice(0, cfg.itemsPerSection),
    truncated: {
      cosmetic: Math.max(0, all.cosmetic.length - cfg.itemsPerSection),
      metadata: Math.max(0, all.metadata.length - cfg.itemsPerSection)
    }
  };
  base.totals = {
    created: all.created.length,
    changed: all.changed.length,
    endingSoon: endingSoon.length,
    ended: all.ended.length,
    restored: all.restored.length,
    other: all.cosmetic.length + all.metadata.length
  };

  // ---- 首页条带：只取高价值，按优先级取（桶内已是时间倒序）---------------
  const pools = {
    created: all.created,
    ended: all.ended,
    restored: all.restored,
    benefit_changed: all.changed.filter(item => item.type === 'benefit_changed'),
    expiry_changed: all.changed.filter(item => item.type === 'expiry_changed'),
    eligibility_changed: all.changed.filter(item => item.type === 'eligibility_changed'),
    endingSoon
  };
  const home = [];
  for (const key of HOME_PRIORITY) {
    for (const item of pools[key] || []) {
      if (home.length >= cfg.homeItems) break;
      home.push(Object.assign({}, item, { homeKind: key }));
    }
    if (home.length >= cfg.homeItems) break;
  }
  base.home = { items: home };

  return base;
}

/** 日志/报告用的一句话摘要 */
function summarize(radar) {
  const t = (radar && radar.totals) || {};
  return {
    availability: radar ? radar.availability : 'unavailable',
    asOf: radar ? radar.asOf : null,
    startedAt: radar ? radar.startedAt : null,
    totals: Object.assign({ created: 0, changed: 0, endingSoon: 0, ended: 0, restored: 0, other: 0 }, t),
    hidden: radar ? {
      created: radar.sections.created.truncated,
      changed: radar.sections.changed.truncated,
      endingSoon: radar.sections.endingSoon.truncated,
      ended: radar.sections.ended.truncated,
      restored: radar.sections.restored.truncated,
      cosmetic: radar.other.truncated.cosmetic,
      metadata: radar.other.truncated.metadata
    } : null,
    coverage: radar ? radar.coverage : null,
    homeCount: radar && radar.home ? radar.home.items.length : 0
  };
}

module.exports = {
  CHANGES_WORDING,
  WINDOWS,
  LIMITS,
  SECTION_ORDER,
  HIGH_VALUE_FIELD_TYPES,
  LOW_VALUE_FIELD_TYPES,
  HOME_PRIORITY,
  COSMETIC_FIELDS,
  cosmeticText,
  isCosmetic,
  daysBetween,
  addDays,
  buildRadar,
  summarize
};
