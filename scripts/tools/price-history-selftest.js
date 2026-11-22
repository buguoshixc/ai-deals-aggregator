#!/usr/bin/env node
/**
 * v3.4 F1 价格历史演练（离线、零依赖、可重跑）。
 *
 * 它演练的是**这一层自己的承诺**：
 *   · 只连接日志里真实记录过的价格点 —— 两点之间画阶梯，不做线性插值；
 *   · 没有基线/首次收录快照就不画图（`no-baseline`），页面说「未载该维度价格」；
 *   · 单点序列 = 基线实心点 + 虚线延伸到数据日期 + 一句「以来无价格变化」；
 *   · 涨跌同时有**文字通道**（▼/▲ + 原值 → 新值 + 日期），不只靠颜色；
 *   · 单位标签只来自既有表（API_UNIT_LABEL / billing 周期表），不在本模块复制第二份；
 *   · 源码里没有墙钟（`Date.now()` / 无参 `new Date()`），日期算术只用 `Date.parse` 显式串。
 *
 * 牙（每条都实跑变红 → 逐字节还原）：
 *   ① 篡改事件的 from/to ⇒ 推导结果必须跟着变；
 *   ② 删掉基线/首次收录 ⇒ 必须退成 no-baseline，不许画出假图；
 *   ③ 名称注入 `<script>` / `&` ⇒ 输出必须转义；
 *   ④ 源码出现时钟 ⇒ 探针变红；
 *   ⑤ 源码硬编码单位标签（第二副本）⇒ 变红。
 */

'use strict';

const fs = require('fs');
const path = require('path');

const apiSchema = require('../lib/api-plan-schema');
const priceHistory = require('../lib/price-history');

const ROOT = path.join(__dirname, '..', '..');
const SOURCE_PATH = path.join(ROOT, 'scripts', 'lib', 'price-history.js');

let passed = 0;
const failures = [];

function check(name, ok, detail) {
  if (ok) { passed++; console.log(`  ✓ ${name}`); }
  else { failures.push(name); console.log(`  ✗ ${name}${detail ? ` —— ${detail}` : ''}`); }
}

function section(title) {
  console.log(`\n${title}`);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/* ------------------------------------------------------------------ */
/* 夹具：一个 API 计费条目 + 一份 Coding 套餐                            */
/* ------------------------------------------------------------------ */

const PLAN_ID = '4f8bae91f9f8';
const MODEL_KEY = 'claude-sonnet-5.5';

function apiEntry(overrides = {}) {
  return Object.assign({
    name: 'Claude Sonnet 5.5',
    modelKey: MODEL_KEY,
    variant: 'standard',
    aliases: null,
    rates: { input: 2, output: 10, cachedInput: 0.2, cacheWrite: 2.5, cacheWriteLong: 4, reasoning: null, batchInput: null, batchOutput: null },
    mediaRates: null,
    note: null
  }, overrides);
}

function apiPlan(overrides = {}) {
  return Object.assign({
    id: PLAN_ID,
    kind: 'api',
    provider: 'anthropic',
    planName: 'Claude 官方 API',
    channel: 'standard',
    pricing: { currency: 'USD', unit: 'per_1M_tokens', unitNote: null },
    models: [apiEntry()],
    firstSeen: '2026-10-01',
    lastSeen: '2026-10-08'
  }, overrides);
}

function planRecord(overrides = {}) {
  return Object.assign({
    id: '041e537ddecb',
    kind: 'plan',
    provider: 'anthropic',
    planName: 'Claude Pro',
    billing: { currency: 'USD', period: 'monthly', regularPrice: 20, promoPrice: 18 }
  }, overrides);
}

function baselineStore(overrides = {}) {
  return Object.assign({
    schemaVersion: 1,
    startedAt: '2026-10-01',
    baseline: {
      at: '2026-10-01',
      note: '演练用基线',
      fields: {
        [PLAN_ID]: {
          'pricing.currency': 'USD',
          'pricing.unit': 'per_1M_tokens',
          models: [apiEntry()]
        }
      }
    },
    absence: {},
    anomalies: [],
    events: []
  }, overrides);
}

function planStore(events = []) {
  return {
    schemaVersion: 1,
    startedAt: '2026-10-01',
    baseline: {
      at: '2026-10-01',
      note: '演练用基线',
      fields: {
        '041e537ddecb': {
          'billing.regularPrice': 20,
          'billing.promoPrice': 18,
          'billing.currency': 'USD',
          'billing.period': 'monthly'
        }
      }
    },
    absence: {},
    anomalies: [],
    events
  };
}

function priceEvent(overrides = {}) {
  const from = apiEntry();
  const to = apiEntry({ rates: { ...from.rates, cachedInput: 0.1 } });
  return Object.assign({
    planId: PLAN_ID,
    at: '2026-10-08',
    type: 'price_decreased',
    field: 'models',
    from,
    to,
    origin: 'observed',
    runAt: '2026-11-03T00:00:00.000Z',
    eventId: 'fixture00001'
  }, overrides);
}

const API = [apiPlan()];

/* ================================================================== */
section('① 推导：基线 + 真实事件');
/* ================================================================== */

const store = baselineStore({ events: [priceEvent()] });
const history = priceHistory.buildPriceHistory({ apiStore: store, apiPlans: API, asOf: '2026-10-08' });

check('只对非 null 维度建序列（本夹具 5 条：input/output/cachedInput/cacheWrite/cacheWriteLong）',
  history.api.size === 5, `实际 ${history.api.size}`);
check('counts.entries 按计价条目去重（5 条序列 = 1 个条目）',
  priceHistory.countsOf(history.api).entries === 1 && history.counts.api.series === 5,
  JSON.stringify(priceHistory.countsOf(history.api)));
check('只有 cachedInput 有变化，其余两条 changes=0',
  history.api.get(priceHistory.apiSeriesKeyOf(PLAN_ID, MODEL_KEY, 'standard', 'cachedInput')).changes.length === 1 &&
  history.api.get(priceHistory.apiSeriesKeyOf(PLAN_ID, MODEL_KEY, 'standard', 'input')).changes.length === 0);
const cached = history.api.get(priceHistory.apiSeriesKeyOf(PLAN_ID, MODEL_KEY, 'standard', 'cachedInput'));
check('价格变化被记成 0.2 → 0.1（from/to 来自事件两侧）',
  cached.changes[0].from === 0.2 && cached.changes[0].to === 0.1,
  JSON.stringify(cached.changes[0]));
check('序列点落在真实日期上（基线 2026-10-01、事件 2026-10-08）',
  cached.points.map(point => point.at).join(',') === '2026-10-01,2026-10-08');
check('序列键带 planId 前缀（apiSeriesKeyOf 是唯一构造器）',
  cached.key === `${PLAN_ID}|${MODEL_KEY}|standard|cachedInput`);

/* ================================================================== */
section('② 渲染：阶梯线 / 单点平线 / 文字通道');
/* ================================================================== */

const changedSvg = priceHistory.priceSparklineSvg(cached, { asOf: '2026-10-08', label: '缓存命中输入', unitText: '每 100 万 tokens' });
check('多点序列 = 阶梯路径（只用 M/H/V，没有斜线插值命令）', (() => {
  const d = (changedSvg.match(/ d="([^"]+)"/) || [])[1] || '';
  const commands = d.match(/[A-Za-z]/g) || [];
  return commands.length > 0 && commands.every(command => ['M', 'H', 'V'].includes(command));
})(), (changedSvg.match(/ d="([^"]+)"/) || [])[1]);
check('多点序列没有虚线（虚线只用于单点平线）', !changedSvg.includes('stroke-dasharray'));
check('降价变化点用 var(--ok)（颜色词来自 CSS 变量表）', changedSvg.includes('var(--ok)'));
check('role="img" + 非空 <title>/<desc>',
  changedSvg.includes('role="img"') && /<title[^>]*>[^<]+<\/title>/.test(changedSvg) && /<desc[^>]*>[^<]+<\/desc>/.test(changedSvg));
check('SVG 内没有十六进制颜色（全部走 CSS 变量）', !/#[0-9a-fA-F]{3,8}\b/.test(changedSvg));
check('单位文本由调用方传入，并出现在图注里', changedSvg.includes('每 100 万 tokens'));

const single = history.api.get(priceHistory.apiSeriesKeyOf(PLAN_ID, MODEL_KEY, 'standard', 'input'));
const singleSvg = priceHistory.priceSparklineSvg(single, { asOf: '2026-10-08', label: '输入', unitText: '每 100 万 tokens' });
check('单点序列 = 实心点 + 虚线延伸到数据日期',
  singleSvg.includes('stroke-dasharray="4 3"') && singleSvg.includes('<circle'));
const singleFigure = priceHistory.priceFigureHtml(single, { asOf: '2026-10-08', label: '输入', unitText: '每 100 万 tokens' });
check('单点序列有一句「以来无价格变化」', singleFigure.includes('基线 2026-10-01 以来无价格变化'));

const figure = priceHistory.priceFigureHtml(cached, { asOf: '2026-10-08', label: '缓存命中输入', unitText: '每 100 万 tokens' });
check('图注同时给日期、原值 → 新值、方向符号 ▼（颜色之外的第二通道）',
  figure.includes('2026-10-08') && figure.includes('0.2 USD → 0.1 USD') && figure.includes('▼'));

const blockHtml = priceHistory.priceHistoryBlockHtml({
  seriesList: [...history.api.values()],
  asOf: '2026-10-08',
  heading: '价格历史（演练）',
  labelOf: series => apiSchema.TOKEN_RATE_LABEL[series.rateKey],
  unitTextOf: () => '每 100 万 tokens'
});
check('区块计数来自序列本身：data-ph-series=5 / data-ph-changes=1',
  blockHtml.includes('data-ph-series="5"') && blockHtml.includes('data-ph-changes="1"'));
check('区块里每个 svg 都带 data-ph-key', (blockHtml.match(/data-ph-key="/g) || []).length === 5);

/* ================================================================== */
section('③ 无基线：不画假图');
/* ================================================================== */

const noBaselineStore = baselineStore({ baseline: null, events: [priceEvent()] });
const noBaseline = priceHistory.buildPriceHistory({ apiStore: noBaselineStore, apiPlans: API, asOf: '2026-10-08' });
const orphan = noBaseline.api.get(priceHistory.apiSeriesKeyOf(PLAN_ID, MODEL_KEY, 'standard', 'cachedInput'));
check('只有事件、没有基线 ⇒ status=no-baseline（变化仍被记录）',
  orphan && orphan.status === 'no-baseline' && orphan.changes.length === 1);
const orphanSvg = priceHistory.priceSparklineSvg(orphan, { asOf: '2026-10-08', label: '缓存命中输入' });
check('no-baseline 不出坐标图，如实写「未载该维度价格」',
  !orphanSvg.includes('<svg') && orphanSvg.includes('未载该维度价格'), orphanSvg.slice(0, 160));

const emptyHistory = priceHistory.buildPriceHistory({ apiStore: baselineStore({ baseline: null }), apiPlans: API, asOf: '2026-10-08' });
const emptyBlock = priceHistory.priceHistoryBlockHtml({
  seriesList: [], asOf: '2026-10-08', heading: '价格历史', emptyText: '本次构建没有拿到对应的 API 计费日志。'
});
check('完全无起点 ⇒ 空态文案，不出空图', emptyHistory.api.size === 0 && !emptyBlock.includes('<svg') && emptyBlock.includes('没有拿到'));

const createdStore = {
  schemaVersion: 1,
  startedAt: '2026-10-01',
  baseline: null,
  absence: {},
  anomalies: [],
  events: [{
    planId: PLAN_ID, at: '2026-10-01', type: 'created', field: null, from: null, to: null,
    fields: { 'pricing.currency': 'USD', 'pricing.unit': 'per_1M_tokens', models: [apiEntry()] }
  }]
};
const createdHistory = priceHistory.buildPriceHistory({ apiStore: createdStore, apiPlans: API, asOf: '2026-10-08' });
check('没有 baseline 时用首次收录快照当起点（tracked，单点）',
  createdHistory.api.size > 0 && [...createdHistory.api.values()].every(series => series.status === 'tracked' && series.points.length === 1));

/* ================================================================== */
section('④ 套餐价格字段（billing.regularPrice/promoPrice）');
/* ================================================================== */

const cPlanStore = planStore([{
  planId: '041e537ddecb', at: '2026-10-08', type: 'price_changed', field: 'billing.regularPrice',
  from: 20, to: 25, origin: 'observed', eventId: 'fixtureplan01'
}]);
const planHistory = priceHistory.buildPriceHistory({ planStore: cPlanStore, plans: [planRecord()], asOf: '2026-10-08' });
const regular = planHistory.plan.get(priceHistory.planSeriesKeyOf('041e537ddecb', 'billing.regularPrice'));
check('套餐价格序列按 planId|priceField 建键，变化被记录',
  regular && regular.changes.length === 1 && regular.changes[0].from === 20 && regular.changes[0].to === 25);
check('套餐价格变化的文字用既有字段标签与周期表',
  priceHistory.changeTextOf(regular, regular.changes[0]).includes('正常价格') &&
  priceHistory.changeTextOf(regular, regular.changes[0]).includes('25 USD'));

/* ================================================================== */
section('⑤ 牙：篡改输入 / 注入 / 源码探针');
/* ================================================================== */

{
  const tampered = clone(store);
  tampered.events[0].from.rates.cachedInput = 5;
  const tamperedHistory = priceHistory.buildPriceHistory({ apiStore: tampered, apiPlans: API, asOf: '2026-10-08' });
  const series = tamperedHistory.api.get(priceHistory.apiSeriesKeyOf(PLAN_ID, MODEL_KEY, 'standard', 'cachedInput'));
  check('【牙①】事件 from 改成 5 ⇒ 推导出的原值跟着变（5 → 0.1）',
    series.changes[0].from === 5 && series.changes[0].to === 0.1,
    JSON.stringify(series.changes[0]));
}

{
  const injectedLabel = priceHistory.priceHistoryBlockHtml({
    seriesList: [...history.api.values()],
    asOf: '2026-10-08',
    heading: '价格历史',
    labelOf: () => '<script>alert(1)</script> & 模型',
    unitTextOf: () => '每 100 万 tokens'
  });
  check('【牙③】名称里的 <script> 被转义，不会变成可执行标签',
    !injectedLabel.includes('<script>alert(1)</script>') && injectedLabel.includes('&lt;script&gt;'));
  check('【牙③】名称里的 & 被转义成 &amp;', injectedLabel.includes('&amp; 模型'));
}

{
  const rawSource = fs.readFileSync(SOURCE_PATH, 'utf8');
  // 探针只看**代码**：注释里可以讨论「墙钟」这件事，不能让注释里的字样把牙弄红/弄绿。
  const source = rawSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  check('【牙④】源码没有 Date.now()', !/Date\.now\s*\(/.test(source));
  check('【牙④】源码没有无参 new Date()', !/new\s+Date\s*\(\s*\)/.test(source));
  check('【牙④】源码用 Date.parse 显式串做日期算术', /Date\.parse\(/.test(source));

  const unitLabels = Object.values(apiSchema.API_UNIT_LABEL);
  const copied = unitLabels.filter(label => source.includes(label));
  check('【牙⑤】单位标签没有第二副本（源码不含 API_UNIT_LABEL 的任何字面量）',
    copied.length === 0, copied.join('、'));
}

/* ================================================================== */
section('⑥ 序列键唯一性与 asOf 默认值');
/* ================================================================== */

check('同一条目三个维度只有三个键，没有互相覆盖',
  new Set([...history.api.keys()]).size === history.api.size);
check('asOf 缺省时序列仍可渲染（只用最后一点的日期）', (() => {
  const svg = priceHistory.priceSparklineSvg(single, { label: '输入', unitText: '每 100 万 tokens' });
  return svg.includes('<svg') && svg.includes('2026-10-01');
})());

/* ================================================================== */

console.log(`\n=== v3.4 F1 价格历史演练：${passed} 项通过，${failures.length} 项失败 ===`);
if (failures.length) {
  console.log('失败项：');
  failures.forEach(name => console.log(`  ✗ ${name}`));
  process.exit(1);
}
