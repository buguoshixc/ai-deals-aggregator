'use strict';

/**
 * 价格历史（基线以来的价格走势）—— **唯一判据**。
 *
 * 这一层只做三件事，而且每件都只有一份实现：
 *   ① 从两份历史日志 + 当前记录里推导出「每个价格维度的时间序列」
 *      （`buildPriceHistory()`）；
 *   ② 把一条序列画成**阶梯线** SVG（`priceSparklineSvg()`）；
 *   ③ 把若干条序列排成一个带计数标记的区块（`priceHistoryBlockHtml()`）。
 *
 * 为什么需要它：页面已经在展示「当前价格」，变化日志也已经存在；但读者看不出
 * 「这条价格是一路没动过，还是刚刚降过」。走势图回答的正是这个问题。
 *
 * ## 三条不变量（判据只在这里）
 *
 * ① **不插值**。两个记录点之间用水平线连接（阶梯），绝不用斜线暗示中间发生过
 *    渐变 —— 我们只在日志日期上观测过价格，中间的每一天都是未知的。
 * ② **没有基线就不画**。序列的起点只能来自 `baseline` 或 `created` 事件的字段快照；
 *    只有后续事件、没有起点的维度记 `status: 'no-baseline'`，页面如实写
 *    「基线未载该维度价格」，而不是拿第一次变化当起点画一条假曲线。
 * ③ **颜色不是唯一通道**。降价 / 涨价的箭头旁边一定同时有「日期 + 原值 → 新值」
 *    的文字；`role="img"` 的 `<title>` / `<desc>` 也把这几件事说全。
 *
 * ## 没有墙钟
 *
 * 本文件不调用 `Date.now()`、`new Date()`；唯一的日期算术是
 * `Date.parse('<数据里的日期>T00:00:00Z')` —— 显式字符串、输入来自数据文件。
 * 横轴终点 `asOf` 由调用方从 `deals.json` 的 `updatedAt` 传入（构建期同一个基准日）。
 */

const site = require('./site');
const apiSchema = require('./api-plan-schema');
const apiHistory = require('./api-plan-history');
const planHistory = require('./plan-history');

/** API 侧「价格变化」事件：只有这三类代表价格本身的升降/口径变化。 */
const API_PRICE_EVENT_TYPES = ['price_increased', 'price_decreased', 'model_changed'];

/**
 * 模型详情页默认画哪些维度：题面点名的 input / output / cachedInput。
 * 其余维度（缓存写入、推理、批处理……）**只在真的有过价格事件时**才画 ——
 * 每个模型页上都铺满 8 张小图会把「最近变过」的信号淹没。
 */
const API_DRAW_DIMENSIONS = ['input', 'output', 'cachedInput'];

/** Coding 套餐侧被跟踪的价格字段（与 plan-history 的字段表同源，只列价格）。 */
const PLAN_PRICE_FIELDS = ['billing.regularPrice', 'billing.promoPrice'];

const API_RATE_LABEL = apiSchema.TOKEN_RATE_LABEL || {};
const API_UNIT_LABEL = apiSchema.API_UNIT_LABEL || {};
const PLAN_LABELS = planHistory.PLAN_HISTORY_WORDING || {};
const PLAN_FIELD_LABELS = PLAN_LABELS.PLAN_HISTORY_FIELD_LABELS || {};
const PLAN_TYPE_LABELS = PLAN_LABELS.PLAN_HISTORY_TYPES || {};
const API_TYPE_LABELS = (apiHistory.API_PLAN_HISTORY_WORDING || {}).API_PLAN_HISTORY_TYPES || {};

/** 序列键：API = planId|modelKey|variant|rateKey；套餐 = planId|priceField。 */
function seriesKeyOf(planId, a, b, c) {
  return c === undefined ? `${planId}|${a}` : `${planId}|${a}|${b}|${c}`;
}

function apiSeriesKeyOf(planId, modelKey, variant, rateKey) {
  return seriesKeyOf(planId, modelKey, variant, rateKey);
}

function planSeriesKeyOf(planId, priceField) {
  return seriesKeyOf(planId, priceField);
}

/** 一条序列唯一对应的「条目」：API 是 (记录 × 模型 × 变体)，套餐是记录本身。 */
function entryKeyOf(series) {
  if (!series) return null;
  if (series.kind === 'plan') return String(series.planId);
  return `${series.planId}|${series.modelKey}|${series.variant}`;
}

/** 数据里显式写下的日期 → 天序号（只用于横轴定位，不读当前时间）。 */
function dayOf(dateStr) {
  const text = String(dateStr || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const ms = Date.parse(`${text}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.round(ms / 86400000) : null;
}

/** 数字文本：只在确实是数字时写字，null / 非数字一律 `—`（与表格同一条诚实口径）。 */
function numberText(value) {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '—';
}

function valueTextOf(series, value) {
  const currency = series && series.currency ? ` ${series.currency}` : '';
  return `${numberText(value)}${currency}`;
}

/** 一条变化的中文句子（日期 + 维度 + 原值 → 新值 + 类型；颜色之外的第二通道）。 */
function changeTextOf(series, change) {
  const isPlan = series.kind === 'plan';
  const labels = isPlan ? PLAN_TYPE_LABELS : API_TYPE_LABELS;
  const dimension = isPlan
    ? (PLAN_FIELD_LABELS[series.priceField] || series.priceField)
    : (API_RATE_LABEL[change.rateKey] || change.rateKey || '价格');
  const type = labels[change.type] || change.type;
  // 方向符号是**文字通道**的一部分：颜色（var(--ok)/var(--warn)）之外，读者仍能从
  // 「▼ / ▲ + 原值 → 新值」读到方向；只靠颜色区分涨跌在灰度或色觉差异下会丢信息。
  const arrow = change.type === 'price_decreased' ? ' ▼' : (change.type === 'price_increased' ? ' ▲' : '');
  return `${change.at} · ${dimension}：${valueTextOf(series, change.from)} → ${valueTextOf(series, change.to)}（${type}${arrow}）`;
}

/* ------------------------------------------------------------------ */
/* 推导                                                                */
/* ------------------------------------------------------------------ */

function newSeries(fields) {
  return {
    status: fields.hasBaseline ? 'tracked' : 'no-baseline',
    hasBaseline: !!fields.hasBaseline,
    kind: fields.kind,
    planId: fields.planId,
    modelKey: fields.modelKey === undefined ? null : fields.modelKey,
    variant: fields.variant === undefined ? null : fields.variant,
    rateKey: fields.rateKey === undefined ? null : fields.rateKey,
    priceField: fields.priceField === undefined ? null : fields.priceField,
    unit: fields.unit || null,
    currency: fields.currency || null,
    entryKey: null,
    points: [],
    changes: [],
    endedAt: null
  };
}

function seedOf(store, planId) {
  if (!store) return null;
  const baseline = store.baseline;
  if (baseline && baseline.fields && baseline.fields[planId]) {
    return { at: baseline.at, fields: baseline.fields[planId], from: 'baseline' };
  }
  const created = (store.events || []).find(event => event && event.planId === planId && event.type === 'created');
  if (created && created.fields) {
    return { at: created.at, fields: created.fields, from: 'created' };
  }
  return null;
}

/** 把一条事件追加到序列；没有基线时序列仍是 `no-baseline`（只有文字，没有图）。 */
function appendPoint(series, { at, value, change }) {
  if (value === null || value === undefined) {
    series.endedAt = at;
  } else if (typeof value === 'number' && Number.isFinite(value)) {
    series.points.push({ at, value });
    series.endedAt = null;
  }
  if (change) series.changes.push(change);
}

/**
 * 推导价格历史。
 *
 * @param {object} input
 * @param {object|null} input.apiStore `scripts/data/api-plan-history.json` 的解析结果
 * @param {object[]} input.apiPlans `api-plans.json` 的 `plans`（当前记录，用来取单位/币种与条目集合）
 * @param {object|null} input.planStore `scripts/data/plan-history.json` 的解析结果
 * @param {object[]} input.plans `plans.json` 的 `plans`
 * @param {string|null} input.asOf 横轴终点（`deals.json` 的 `updatedAt` 日期）
 * @returns {{api: Map<string, object>, plan: Map<string, object>, counts: object, asOf: string|null}}
 */
function buildPriceHistory({ apiStore = null, apiPlans = [], planStore = null, plans = [], asOf = null } = {}) {
  const api = new Map();
  const plan = new Map();
  const apiPlansById = new Map((Array.isArray(apiPlans) ? apiPlans : []).map(record => [record.id, record]));
  const plansById = new Map((Array.isArray(plans) ? plans : []).map(record => [record.id, record]));

  // ── API 计费：每个 (记录 × 模型 × 变体 × 费率维度) 一条序列 ─────────────────
  for (const record of apiPlansById.values()) {
    const seed = seedOf(apiStore, record.id);
    if (!seed || !Array.isArray(seed.fields.models)) continue;
    const unit = (seed.fields['pricing.unit'] === undefined ? null : seed.fields['pricing.unit'])
      || (record.pricing && record.pricing.unit) || null;
    const currency = (seed.fields['pricing.currency'] === undefined ? null : seed.fields['pricing.currency'])
      || (record.pricing && record.pricing.currency) || null;
    for (const entry of seed.fields.models) {
      if (!entry || !entry.modelKey) continue;
      const variant = entry.variant === undefined ? null : entry.variant;
      for (const rateKey of apiSchema.TOKEN_RATE_KEYS) {
        const value = entry.rates ? entry.rates[rateKey] : null;
        if (value === null || value === undefined) continue; // null = 未载该维度价格，不建序列
        const series = newSeries({
          hasBaseline: true, kind: 'api', planId: record.id,
          modelKey: entry.modelKey, variant, rateKey, unit, currency
        });
        series.entryKey = entryKeyOf(series);
        series.points.push({ at: seed.at, value });
        const key = apiSeriesKeyOf(record.id, entry.modelKey, variant, rateKey);
        series.key = key;
        api.set(key, series);
      }
    }
  }
  const apiEvents = (apiStore && Array.isArray(apiStore.events) ? apiStore.events : [])
    .filter(event => event && event.field === 'models' && API_PRICE_EVENT_TYPES.includes(event.type))
    .slice()
    .sort((a, b) => (a.at === b.at ? 0 : a.at < b.at ? 1 : -1));
  for (const event of apiEvents) {
    const from = event.from || null;
    const to = event.to || null;
    const entry = to || from;
    if (!entry || !entry.modelKey) continue;
    const variant = entry.variant === undefined ? null : entry.variant;
    const keys = (from && from.rates && to && to.rates)
      ? apiHistory.changedRateKeys(from, to)
      : apiSchema.TOKEN_RATE_KEYS.slice();
    for (const rateKey of keys) {
      const key = apiSeriesKeyOf(event.planId, entry.modelKey, variant, rateKey);
      let series = api.get(key);
      if (!series) {
        const record = apiPlansById.get(event.planId) || null;
        series = newSeries({
          hasBaseline: false, kind: 'api', planId: event.planId,
          modelKey: entry.modelKey, variant, rateKey,
          unit: (record && record.pricing && record.pricing.unit) || null,
          currency: (record && record.pricing && record.pricing.currency) || null
        });
        series.entryKey = entryKeyOf(series);
        series.key = key;
        api.set(key, series);
      }
      const fromValue = from && from.rates ? from.rates[rateKey] : null;
      const toValue = to && to.rates ? to.rates[rateKey] : null;
      if (fromValue === toValue) continue;
      appendPoint(series, {
        at: event.at, value: toValue,
        change: { at: event.at, rateKey, from: fromValue, to: toValue, type: event.type }
      });
    }
  }

  // ── Coding 套餐：每个 (记录 × 价格字段) 一条序列 ───────────────────────────
  for (const record of plansById.values()) {
    const seed = seedOf(planStore, record.id);
    if (!seed) continue;
    const currency = (seed.fields['billing.currency'] === undefined ? null : seed.fields['billing.currency'])
      || (record.billing && record.billing.currency) || null;
    const unit = (seed.fields['billing.period'] === undefined ? null : seed.fields['billing.period'])
      || (record.billing && record.billing.period) || null;
    for (const priceField of PLAN_PRICE_FIELDS) {
      const value = seed.fields[priceField];
      if (value === null || value === undefined) continue;
      const series = newSeries({
        hasBaseline: true, kind: 'plan', planId: record.id, priceField, unit, currency
      });
      series.entryKey = entryKeyOf(series);
      series.points.push({ at: seed.at, value });
      const key = planSeriesKeyOf(record.id, priceField);
      series.key = key;
      plan.set(key, series);
    }
  }
  const planEvents = (planStore && Array.isArray(planStore.events) ? planStore.events : [])
    .filter(event => event && PLAN_PRICE_FIELDS.includes(event.field))
    .slice()
    .sort((a, b) => (a.at === b.at ? 0 : a.at < b.at ? 1 : -1));
  for (const event of planEvents) {
    const key = planSeriesKeyOf(event.planId, event.field);
    let series = plan.get(key);
    if (!series) {
      const record = plansById.get(event.planId) || null;
      series = newSeries({
        hasBaseline: false, kind: 'plan', planId: event.planId, priceField: event.field,
        unit: (record && record.billing && record.billing.period) || null,
        currency: (record && record.billing && record.billing.currency) || null
      });
      series.entryKey = entryKeyOf(series);
      series.key = key;
      plan.set(key, series);
    }
    const fromValue = event.from === undefined ? null : event.from;
    const toValue = event.to === undefined ? null : event.to;
    if (fromValue === toValue) continue;
    appendPoint(series, {
      at: event.at, value: toValue,
      change: { at: event.at, rateKey: null, from: fromValue, to: toValue, type: event.type }
    });
  }

  return { api, plan, counts: { api: countsOf(api), plan: countsOf(plan) }, asOf: asOf || null };
}

/** 一组序列的计数（data-* 标记与页面陈述的唯一来源）。 */
function countsOf(seriesMapOrList) {
  const list = seriesMapOrList instanceof Map
    ? [...seriesMapOrList.values()]
    : (Array.isArray(seriesMapOrList) ? seriesMapOrList : []);
  const entries = new Set();
  let tracked = 0;
  let noBaseline = 0;
  let changes = 0;
  for (const series of list) {
    if (!series) continue;
    entries.add(series.entryKey || entryKeyOf(series));
    if (series.status === 'tracked' && series.points.length) tracked++;
    else noBaseline++;
    changes += series.changes.length;
  }
  return { entries: entries.size, series: list.length, tracked, noBaseline, changes };
}

/* ------------------------------------------------------------------ */
/* 渲染：一张图                                                         */
/* ------------------------------------------------------------------ */

function priceSparklineSvg(series, opts = {}) {
  const width = Number(opts.width) || 360;
  const height = Number(opts.height) || 86;
  const padL = 10;
  const padR = 10;
  const padT = 26;
  const padB = 10;
  const label = opts.label || '价格';
  const unitLabel = opts.unitText || '';
  const points = (series && Array.isArray(series.points) ? series.points : [])
    .filter(point => point && typeof point.value === 'number' && Number.isFinite(point.value));
  if (!series || series.status !== 'tracked' || !points.length) {
    const counted = series && series.changes && series.changes.length
      ? `（已记录 ${series.changes.length} 次价格变化，见下方文字）` : '';
    return `<p class="ph-none">基线未载该维度价格——无法绘制走势${counted}。</p>`;
  }
  const endAt = series.endedAt || opts.asOf || points[points.length - 1].at;
  const startAt = points[0].at;
  const startDay = dayOf(startAt);
  const endDay = dayOf(endAt);
  const span = startDay === null || endDay === null ? 0 : Math.max(0, endDay - startDay);
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const xOf = (dateStr) => {
    if (!span) return padL;
    const day = dayOf(dateStr);
    if (day === null) return padL;
    const ratio = Math.min(1, Math.max(0, (day - startDay) / span));
    return padL + ratio * plotW;
  };
  const values = points.map(point => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spanValue = max - min;
  const yOf = (value) => {
    if (!spanValue) return padT + plotH / 2;
    return padT + ((max - value) / spanValue) * plotH;
  };

  // 阶梯线：先水平走到下一个观测日，再垂直换价 —— 中间的日子保持上一个观测值。
  const segments = [];
  points.forEach((point, index) => {
    const x = xOf(point.at);
    const y = yOf(point.value);
    if (index === 0) segments.push(`M${x.toFixed(2)} ${y.toFixed(2)}`);
    else segments.push(`H${x.toFixed(2)} V${y.toFixed(2)}`);
  });
  if (points.length === 1) {
    segments.push(`H${(width - padR).toFixed(2)}`);
  } else {
    segments.push(`H${(width - padR).toFixed(2)}`);
  }
  const lineDash = points.length === 1 ? ' stroke-dasharray="4 3"' : '';
  const marks = points.slice(1).map((point, index) => {
    const previous = points[index] || points[0];
    const x = xOf(point.at);
    const y = yOf(point.value);
    const up = point.value > previous.value;
    const d = up
      ? `M${(x - 4).toFixed(1)} ${(y - 6).toFixed(1)} L${(x + 4).toFixed(1)} ${(y - 6).toFixed(1)} L${x.toFixed(1)} ${(y - 14).toFixed(1)} Z`
      : `M${(x - 4).toFixed(1)} ${(y - 14).toFixed(1)} L${(x + 4).toFixed(1)} ${(y - 14).toFixed(1)} L${x.toFixed(1)} ${(y - 6).toFixed(1)} Z`;
    return `<path d="${d}" fill="${up ? 'var(--warn)' : 'var(--ok)'}" aria-hidden="true"></path>`;
  }).join('');
  const dots = points.map(point => `<circle cx="${xOf(point.at).toFixed(2)}" cy="${yOf(point.value).toFixed(2)}" r="2.6" fill="var(--ink)"></circle>`).join('');
  const first = points[0];
  const last = points[points.length - 1];
  const descParts = [
    `${label}：${first.at} 记录 ${valueTextOf(series, first.value)}`,
    points.length > 1 ? `${last.at} 记录 ${valueTextOf(series, last.value)}` : '',
    series.changes.length ? `期间 ${series.changes.length} 次价格变化：${series.changes.map(change => changeTextOf(series, change)).join('；')}` : '期间没有价格变化',
    series.endedAt ? `该维度在 ${series.endedAt} 之后不再有价格记录` : ''
  ].filter(Boolean);
  const keyText = String(series.key || 'ph');
  const domId = `ph-${keyText.replace(/[^A-Za-z0-9_-]/g, '-')}`;
  return `<svg class="ph-svg" data-ph-key="${site.xmlEscape(keyText)}" data-ph-points="${points.length}" data-ph-changes="${series.changes.length}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${domId}-t" focusable="false">
  <title id="${domId}-t">${site.xmlEscape(label)} 价格走势（${site.xmlEscape(first.at)} 至 ${site.xmlEscape(endAt)}）</title>
  <desc>${site.xmlEscape(descParts.join('；'))}</desc>
  <text x="${padL}" y="12" fill="var(--mut)" font-size="10">${site.xmlEscape(`${first.at} · ${valueTextOf(series, first.value)}`)}</text>
  <text x="${width - padR}" y="12" text-anchor="end" fill="var(--mut)" font-size="10">${site.xmlEscape(points.length > 1 ? `${last.at} · ${valueTextOf(series, last.value)}` : `${endAt} · 无变化`)}</text>
  <text x="${padL}" y="${height - 2}" fill="var(--mut)" font-size="9">${site.xmlEscape(unitLabel)}</text>
  <path d="${segments.join(' ')}" fill="none" stroke="var(--ink)" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"${lineDash}></path>
  ${dots}${marks}
</svg>`;
}

/** 一张图 + 图注 + 变化文字（颜色之外的完整文字替代）。 */
function priceFigureHtml(series, opts = {}) {
  const label = opts.label || `${series.planId} · ${series.rateKey || series.priceField || ''}`;
  const unitText = opts.unitText || null;
  const body = priceSparklineSvg(series, { ...opts, label });
  const flat = series.status === 'tracked' && series.points.length && !series.changes.length && !series.endedAt
    ? `<p class="ph-flat">基线 ${site.xmlEscape(series.points[0].at)} 以来无价格变化。</p>` : '';
  const ended = series.endedAt
    ? `<p class="ph-flat">该维度在 ${site.xmlEscape(series.endedAt)} 之后不再有价格记录（不是 0 元）。</p>` : '';
  const changes = series.changes.length
    ? `<ul class="ph-chg">${series.changes.map(change => `<li>${site.xmlEscape(changeTextOf(series, change))}</li>`).join('')}</ul>`
    : '';
  return `<figure class="ph-fig">
  <figcaption>${site.xmlEscape(label)}${unitText ? `<span class="ph-unit">${site.xmlEscape(unitText)}</span>` : ''}</figcaption>
  ${body}
  ${flat}${ended}${changes}
</figure>`;
}

/* ------------------------------------------------------------------ */
/* 渲染：一个区块                                                       */
/* ------------------------------------------------------------------ */

/**
 * @param {object} opts
 * @param {object[]} opts.seriesList 要画的序列（已按页面口径筛好）
 * @param {string} opts.heading 区块标题
 * @param {string} [opts.headingId] 锚点 id
 * @param {string} [opts.headingTag] 默认 h2
 * @param {string} [opts.headingClass]
 * @param {string} [opts.summaryText] 聚合陈述（含 data-ph-* 的容器里同时显示）
 * @param {string} [opts.intro] 口径说明（一行）
 * @param {string} [opts.emptyText] 没有序列时的诚实空态
 * @param {function} [opts.labelOf]
 * @param {function} [opts.unitTextOf]
 */
function priceHistoryBlockHtml(opts = {}) {
  const list = (opts.seriesList || []).filter(Boolean);
  const headingTag = opts.headingTag || 'h2';
  const headingClass = opts.headingClass ? ` class="${site.xmlEscape(opts.headingClass)}"` : '';
  const headingId = opts.headingId ? ` id="${site.xmlEscape(opts.headingId)}"` : '';
  const charts = list.filter(series => series.status === 'tracked' && series.points.length);
  const changes = list.reduce((sum, series) => sum + series.changes.length, 0);
  const figures = list.map(series => priceFigureHtml(series, {
    asOf: opts.asOf,
    label: typeof opts.labelOf === 'function' ? opts.labelOf(series) : undefined,
    unitText: typeof opts.unitTextOf === 'function' ? opts.unitTextOf(series) : null
  })).join('\n');
  const empty = !list.length && opts.emptyText
    ? `<p class="ph-none">${site.xmlEscape(opts.emptyText)}</p>` : '';
  if (!list.length && !empty) return '';
  return `<section class="ph-block"${headingId} data-ph-series="${charts.length}" data-ph-changes="${changes}">
  <${headingTag}${headingClass}>${site.xmlEscape(opts.heading || '价格历史')}</${headingTag}>
  ${opts.intro ? `<p class="ph-intro">${site.xmlEscape(opts.intro)}</p>` : ''}
  ${opts.summaryText ? `<p class="ph-sum">${site.xmlEscape(opts.summaryText)}</p>` : ''}
  ${empty}
  <div class="ph-grid">
${figures}
  </div>
</section>`;
}

/**
 * 页面级样式。只用首页已有的设计变量（`--card/--line/--mut/--ink` 等），
 * 不新建一套视觉语言；暗色主题随变量自动生效。
 */
const PRICE_HISTORY_CSS = `  .ph-block { margin: var(--s3) 0 var(--s4); }
  .ph-intro { color: var(--mut); font-size: var(--fs-sm); margin: 0 0 var(--s2); }
  .ph-sum { color: var(--mut); font-size: var(--fs-sm); margin: 0 0 var(--s2); font-variant-numeric: tabular-nums; }
  .ph-none { color: var(--mut); font-size: var(--fs-sm); margin: var(--s2) 0; }
  .ph-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: var(--s3); }
  .ph-fig { margin: 0; background: var(--card); border: 1px solid var(--line); border-radius: var(--r); padding: var(--s2) var(--s3); }
  .ph-fig figcaption { color: var(--ink); font-size: var(--fs-sm); line-height: 1.5; }
  .ph-unit { color: var(--mut); font-size: var(--fs-xs); display: block; }
  .ph-svg { width: 100%; height: auto; display: block; margin: 4px 0 2px; }
  .ph-flat { color: var(--mut); font-size: var(--fs-xs); margin: 2px 0 0; }
  .ph-chg { margin: 4px 0 0; padding-left: 18px; color: var(--mut); font-size: var(--fs-xs); line-height: 1.55; }
  .ph-chg li { margin: 1px 0; }
  .ph-h4 { font-size: var(--fs-sm); color: var(--ink); margin: var(--s3) 0 var(--s2); }
  .ph3 { font-size: 13px; color: var(--ink); margin: var(--s3) 0 var(--s2); }
  @media (max-width: 760px) { .ph-grid { grid-template-columns: 1fr; } }`;

module.exports = {
  API_PRICE_EVENT_TYPES,
  API_DRAW_DIMENSIONS,
  PLAN_PRICE_FIELDS,
  PRICE_HISTORY_CSS,
  seriesKeyOf,
  apiSeriesKeyOf,
  planSeriesKeyOf,
  entryKeyOf,
  buildPriceHistory,
  countsOf,
  valueTextOf,
  changeTextOf,
  priceSparklineSvg,
  priceFigureHtml,
  priceHistoryBlockHtml
};
