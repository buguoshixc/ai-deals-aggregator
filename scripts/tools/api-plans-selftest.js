#!/usr/bin/env node
/**
 * v2.5 API / Token 计费演练（离线、零依赖、可重跑）。
 *
 * 它演练的是**这一层自己的承诺**（题面 §十二 / §十三）：
 *   · 单位永远显式，且全仓不存在跨单位换算的代码路径；
 *   · credits 是钱不是 token —— 结构上就写不进 token 数量，页面上也不折算；
 *   · 输入价与输出价分列，渲染层互换会被逐格对账当场抓住；
 *   · 模型改名（保持 modelKey）产生**零事件**；未登记的改名必须被检测出来；
 *   · 免费额度只装稳定长期能力，`0` 表示"官方明说免费"而 `null` 表示"官方没公布"。
 *
 * 四条 Tooth Test 都是**实跑**：把东西弄坏 → 断言必须变红 → 复原后必须回到绿。
 * 「断言不是恒红」与「断言真的会红」同等重要（本仓的既有纪律）。
 */

'use strict';

const fs = require('fs');
const path = require('path');

const apiSchema = require('../lib/api-plan-schema');
const apiHistory = require('../lib/api-plan-history');
const apiPage = require('../lib/api-plans-page');
const providers = require('../lib/providers');
const links = require('../lib/deal-plan-links');

const ROOT = path.join(__dirname, '..', '..');
const PROVIDER_TABLE = providers.load().table;

let passed = 0;
const failures = [];

function check(name, ok, detail) {
  if (ok) { passed++; console.log(`  ✓ ${name}`); }
  else { failures.push(name); console.log(`  ✗ ${name}${detail ? ` —— ${detail}` : ''}`); }
}

function section(title) {
  console.log(`\n${title}`);
}

/* ------------------------------------------------------------------ */
/* 夹具                                                                */
/* ------------------------------------------------------------------ */

const BASE_MODELS = [
  {
    name: 'GLM-5.3',
    modelKey: 'glm-5.3',
    variant: 'standard',
    rates: { input: 8, output: 28, cachedInput: 2 },
    note: null
  },
  {
    name: 'GLM-5.3',
    modelKey: 'glm-5.3',
    variant: 'long_context',
    rates: { input: 16, output: 56 },
    note: '按输入长度分档'
  },
  {
    name: 'GLM-4.7-Flash',
    modelKey: 'glm-4.7-flash',
    variant: 'standard',
    rates: { input: 0, output: 0, cachedInput: 0 },
    note: '官方明说免费'
  }
];

function rawPlan(overrides = {}) {
  return Object.assign({
    provider: 'zhipu',
    planName: '演练用 API 计费',
    channel: 'standard',
    officialUrl: 'https://open.bigmodel.cn/pricing',
    source: 'Official-Pricing',
    sourceUrl: 'https://open.bigmodel.cn/pricing',
    region: 'cn',
    pricing: { currency: 'CNY', unit: 'per_1M_tokens', unitNote: null },
    models: JSON.parse(JSON.stringify(BASE_MODELS)),
    freeTier: {
      type: 'models',
      models: ['glm-4.7-flash'],
      description: '官方长期提供 GLM-4.7-Flash 免费调用',
      conversionDependsOnModel: null
    },
    limits: [{ kind: 'concurrency', value: 100, appliesTo: ['glm-5.3'], note: null }],
    credits: [{
      pay: 10, currency: 'CNY', gets: 10, unit: 'cny',
      usageNote: null, expires: null, description: '充值 10 元得 10 元额度'
    }],
    restrictions: [{ kind: 'region_restriction', value: '中国大陆', note: '面向中国大陆提供服务' }],
    firstSeen: '2026-10-01',
    lastSeen: '2026-10-01',
    verified: true,
    verifiedAt: '2026-10-01',
    evidence: [{
      field: 'models.glm-5.3',
      quote: 'GLM-5.3：输入 8 元 / M，输出 28 元 / M',
      sourceUrl: 'https://open.bigmodel.cn/pricing',
      capturedAt: '2026-10-01',
      lang: 'zh'
    }]
  }, overrides);
}

function build(overrides = {}) {
  return apiSchema.makeApiPlan(rawPlan(overrides), { providers: PROVIDER_TABLE, today: '2026-10-01' });
}

/**
 * 改**某一个**模型条目、其余照旧。
 *
 * 为什么单开一个 helper：夹具里 `freeTier.models` 必须在 `models` 里找得到，
 * 所以"只留一条模型"这种写法会让 `build()` 直接失败（返回 `ok:false`），
 * 而失败的下游表现是**事件数为 0** —— 看起来像"改名没有产生假变化"，
 * 实际是夹具根本没构造出第二条记录。这种假绿比假红更危险。
 */
function withModel(index, patch) {
  return BASE_MODELS.map((entry, i) => (i === index ? { ...entry, ...patch } : entry));
}

function rejects(name, overrides, needle) {
  const result = build(overrides);
  const ok = !result.ok && result.problems.some(problem => String(problem).includes(needle));
  check(name, ok, ok ? '' : `problems=${JSON.stringify((result.problems || []).slice(0, 2))}`);
}

/* ================================================================== */
section('① 数据契约：身份 / 单位 / 模型条目');
/* ================================================================== */

{
  const result = build();
  check('合法夹具通过', result.ok, JSON.stringify(result.problems));
  const plan = result.plan;

  check('id 是 12 位小写 hex 且由 makeApiPlanId 推导',
    /^[0-9a-f]{12}$/.test(plan.id)
    && plan.id === apiSchema.makeApiPlanId({ provider: 'zhipu', planName: '演练用 API 计费', channel: 'standard' }),
    plan.id);
  check('derivedMetrics 恒为 {}（本阶段不产出任何派生单价）',
    JSON.stringify(plan.derivedMetrics) === '{}', JSON.stringify(plan.derivedMetrics));

  // 改价 / 增删模型 / 换官方页都不换 id
  const repriced = build({ models: withModel(0, { rates: { input: 99, output: 99, cachedInput: 2 } }) });
  check('改价不换 id（同 provider + planName + channel 就是同一条记录）',
    repriced.ok && repriced.plan.id === plan.id, repriced.ok ? repriced.plan.id : JSON.stringify(repriced.problems));
  const moved = build({ officialUrl: 'https://open.bigmodel.cn/pricing/other' });
  check('换官方页不换 id', moved.ok && moved.plan.id === plan.id);

  // 通道进 id basis
  const batch = build({ channel: 'batch' });
  check('换 channel 换 id（标准 / 批处理是两个可售 SKU）', batch.ok && batch.plan.id !== plan.id);

  // 模型条目的键序固定（契约里键序就是序列化序）
  check('token 维度键序固定且齐全',
    JSON.stringify(Object.keys(plan.models[0].rates)) === JSON.stringify(apiSchema.TOKEN_RATE_KEYS),
    Object.keys(plan.models[0].rates).join(','));
  check('cacheWrite 与 cacheWriteLong 是两个独立维度（Anthropic 同时公布 5 分钟与 1 小时写价）',
    apiSchema.TOKEN_RATE_KEYS.includes('cacheWrite') && apiSchema.TOKEN_RATE_KEYS.includes('cacheWriteLong'));
  check('(modelKey, variant) 规范序：GLM-5.3 standard 在 GLM-5.3 long_context 之前',
    apiSchema.modelEntryKeyOf(plan.models[0]) === 'glm-5.3|standard'
    || plan.models.map(apiSchema.modelEntryKeyOf).join(' ') === plan.models.map(apiSchema.modelEntryKeyOf).slice().sort().join(' '),
    plan.models.map(apiSchema.modelEntryKeyOf).join(' '));
}

{
  rejects('pricing.unit 非法 → 红', { pricing: { currency: 'CNY', unit: 'per_1000_tokens' } }, 'pricing.unit 非法');
  rejects('有 token 价却没有单位 → 红', { pricing: { currency: 'CNY', unit: null } }, 'pricing.unit 缺失');
  rejects('没有 token 价却声明了单位 → 红', {
    pricing: { currency: 'CNY', unit: 'per_1M_tokens' },
    models: [{ name: '按分钟计费', modelKey: 'per-min', variant: 'standard', rates: {}, mediaRates: [{ kind: 'audio', price: 0.05, unit: 'per_minute', note: null }] }]
  }, '不能声明');
  rejects('非 token 计费项缺单位 → 红', {
    models: [{ name: 'x', modelKey: 'x', variant: 'standard', rates: { input: 1 }, mediaRates: [{ kind: 'image', price: 0.04, note: null }] }]
  }, 'unit 非法');
  rejects('模型条目什么都没有 → 红', {
    models: [{ name: 'x', modelKey: 'x', variant: 'standard', rates: {} }]
  }, '没有价格事实');
  rejects('(modelKey, variant) 重复 → 红', {
    models: [
      { name: 'a', modelKey: 'a', variant: 'standard', rates: { input: 1 } },
      { name: 'a2', modelKey: 'a', variant: 'standard', rates: { input: 2 } }
    ]
  }, '重复');
  rejects('modelKey 非规范形态 → 红', {
    models: [{ name: 'a', modelKey: 'A B', variant: 'standard', rates: { input: 1 } }]
  }, 'modelKey 非法');
  rejects('未知字段 → 红', { price: 1 }, '未知字段');
  rejects('provider 未登记 → 红', { provider: 'NoSuchVendor' }, '未在 providers.json 登记');
  rejects('limits.appliesTo 指向不存在的模型 → 红', {
    limits: [{ kind: 'rpm', value: 10, appliesTo: ['nope'], note: null }]
  }, '不在本记录的 models 里');
  rejects('freeTier.models 不在记录里 → 红', {
    freeTier: { type: 'models', models: ['nope'], description: 'x', conversionDependsOnModel: null }
  }, '不在本记录的 models 里');
  rejects('freeTier 三态：官方明说没有免费额度必须带 description → 红', {
    freeTier: { type: 'none', amount: null, period: null, models: null, description: null, conversionDependsOnModel: null }
  }, '必须用 description');
}

/* ================================================================== */
section('② 单位：显式保存，且全仓没有换算路径（Tooth #3）');
/* ================================================================== */

{
  const perM = build({ pricing: { currency: 'USD', unit: 'per_1M_tokens' } });
  const perK = build({ pricing: { currency: 'USD', unit: 'per_1K_tokens' } });
  check('同一数值 + 不同 unit 都能通过校验（单位是显式声明，不是隐含约定）', perM.ok && perK.ok);

  const rowM = apiPage.apiRowsOf([perM.plan])[0];
  const rowK = apiPage.apiRowsOf([perK.plan])[0];
  check('页面「计费单位」列把两种口径区分开',
    rowM.unitText === 'USD / 每 100 万 tokens' && rowK.unitText === 'USD / 每 1000 tokens',
    `${rowM.unitText} | ${rowK.unitText}`);
  check('价格数字本身**原样输出**（不做任何单位换算）',
    apiPage.priceText(rowM.rates.input, 'USD') === apiPage.priceText(rowK.rates.input, 'USD'),
    `${apiPage.priceText(rowM.rates.input, 'USD')}`);

  // 静态扫描：这一层的源码里不许出现"把每千换算成每百万"这类常数乘法
  const source = fs.readFileSync(path.join(__dirname, '..', 'lib', 'api-plan-schema.js'), 'utf8');
  const hasConvert = /(1000|1e3|1_000)\s*\*|\*\s*(1000|1e3|1_000)/.test(source)
    || /UNIT_PER|convertUnit|toPerMillion/i.test(source);
  check('【牙】api-plan-schema.js 里没有任何单位换算常数或函数', !hasConvert);
}

/* ================================================================== */
section('③ credits 是钱，不是 token（Tooth #1）');
/* ================================================================== */

{
  check('credits 的字段白名单里没有任何 token 数量字段',
    !apiSchema.CREDIT_FIELDS.some(field => /token/i.test(field)), apiSchema.CREDIT_FIELDS.join(','));

  rejects('credits 里塞 token 数量 → 红（键名含 token）', {
    credits: [{ pay: 10, currency: 'USD', gets: 10, unit: 'credits', usageNote: '按各模型单价扣减', description: 'x', tokenAmount: 5000000 }]
  }, '键名含 token');
  rejects('credits 里塞换算后的 token 数（别名写法）→ 红', {
    credits: [{ pay: 10, currency: 'USD', gets: 10, unit: 'credits', usageNote: 'x', description: 'x', tokens: 5000000 }]
  }, '键名含 token');
  rejects('unit=credits 缺 usageNote → 红', {
    credits: [{ pay: 10, currency: 'USD', gets: 10, unit: 'credits', usageNote: null, description: 'x' }]
  }, 'usageNote');
  rejects('unit=usd 但币种是 CNY（隐含汇率）→ 红', {
    credits: [{ pay: 10, currency: 'CNY', gets: 10, unit: 'usd', usageNote: null, description: 'x' }]
  }, '不做币种换算');

  const withCredits = build();
  const html = apiPage.apiPlansPageBody([withCredits.plan], { providerTable: PROVIDER_TABLE, prefix: '../../' });
  check('页面上 credits 只以「付 X 得 Y credits/cny」出现，不被折算成 token',
    html.includes('credits：付') && !/credits[^<]{0,60}(可购|可购买)/.test(apiPage.textOnly(html)));
  check('credits 明细节把扣减口径与描述都写出来',
    html.includes('预付费额度') && html.includes('充值 10 元得 10 元额度'));

  // 手写派生值必须被逐字节比对拦下
  const manual = JSON.parse(JSON.stringify(withCredits.plan));
  manual.derivedMetrics = { creditTokenEstimate: { tokens: 5000000 } };
  const verdict = apiSchema.validateApiPlan(manual, 0);
  check('【牙】手写派生值（把 $10 credits 估成 500 万 token）→ 校验红',
    !verdict.ok && verdict.errors.some(e => e.includes('derivedMetrics')),
    JSON.stringify(verdict.errors.slice(0, 1)));
}

/* ================================================================== */
section('④ 输入价 / 输出价分列（Tooth #2）');
/* ================================================================== */

{
  const built = build();
  const plan = built.plan;
  const html = apiPage.apiPlansPageBody([plan], { providerTable: PROVIDER_TABLE, prefix: '../../' });
  const clean = apiPage.assertPageHonesty(html, [plan], { providerTable: PROVIDER_TABLE });
  check('页面诚实性断言在正确渲染上零问题（断言不是恒红）', clean.length === 0, clean.slice(0, 2).join('；'));

  const row = apiPage.rowsOfHtml(html)[0];
  check('输入价单元格 == 数据的 rates.input', row.cells[4] === apiPage.priceText(plan.models[0].rates.input, 'CNY'),
    `${row.cells[4]} vs ${apiPage.priceText(plan.models[0].rates.input, 'CNY')}`);
  check('输出价单元格 == 数据的 rates.output', row.cells[5] === apiPage.priceText(plan.models[0].rates.output, 'CNY'));
  check('缓存命中输入单元格 == 数据的 rates.cachedInput', row.cells[6] === apiPage.priceText(plan.models[0].rates.cachedInput, 'CNY'));

  // 把渲染结果里的输入价与输出价对调 —— 页面看起来完全正常，但读者会得出反向结论。
  // ⚠️ 必须挑一**组两个数字不相等**的单元格：夹具的第一行是免费模型（输入/输出都是「免费」），
  // 在那一行上对调等于什么都没做（实测踩过：对调后产物字节完全相同，断言自然还是绿的）。
  const targetRow = html.match(/<tr data-item="glm-5\.3\|standard"[\s\S]*?<\/tr>/)[0];
  const swappedRow = targetRow.replace(
    /(<td class="num">[^<]*<\/td>)(\s*)(<td class="num">[^<]*<\/td>)/,
    (m, a, gap, b) => b + gap + a
  );
  const swapped = html.replace(targetRow, swappedRow);
  check('【牙】把输入价与输出价在渲染结果里对调 → 逐格对账当场报错',
    swapped !== html && apiPage.assertPageHonesty(swapped, [plan], { providerTable: PROVIDER_TABLE })
      .some(problem => problem.includes('输入价')),
    swapped === html ? '对调没有生效（夹具选错了行）' : '对调后断言仍为零问题');

  // 0 与 null 必须长得不一样
  const freeModel = plan.models.find(entry => entry.modelKey === 'glm-4.7-flash');
  check('官方明说免费（0）渲染成「免费」，不是 0、也不是 —',
    apiPage.priceText(freeModel.rates.input, 'CNY') === '免费');
  check('官方没公布（null）渲染成「—」', apiPage.priceText(null, 'CNY') === '—');
  check('两者互不顶替', apiPage.priceText(freeModel.rates.input, 'CNY') !== apiPage.priceText(null, 'CNY'));
}

/* ================================================================== */
section('⑤ 免费额度（稳定长期能力）');
/* ================================================================== */

{
  const built = build();
  const html = apiPage.apiPlansPageBody([built.plan], { providerTable: PROVIDER_TABLE, prefix: '../../' });
  check('免费模型列用**显示名**而不是 modelKey（读者认的是官方名）',
    html.includes('GLM-4.7-Flash'), '页面里找不到显示名');
  check('免费额度与 credits 有独立的明细节',
    html.includes('免费额度与 credits（厂商级事实）'));

  const nonePlan = build({
    freeTier: { type: 'none', amount: null, period: null, models: null, description: '官方 FAQ 明说按量计费没有免费额度', conversionDependsOnModel: null }
  });
  const noneHtml = apiPage.apiPlansPageBody([nonePlan.plan], { providerTable: PROVIDER_TABLE, prefix: '../../' });
  check('「官方明说没有免费额度」与「我们没查到（null）」是两种写法',
    noneHtml.includes('官方明说无免费额度') && nonePlan.plan.freeTier.type === 'none');

  const unknownPlan = build({ freeTier: null, credits: null });
  const unknownHtml = apiPage.apiPlansPageBody([unknownPlan.plan], { providerTable: PROVIDER_TABLE, prefix: '../../' });
  const unknownRow = apiPage.rowsOfHtml(unknownHtml)[0];
  check('未标注的免费额度写「—」', unknownRow.cells[8] === '—', unknownRow.cells[8]);
}

/* ================================================================== */
section('⑥ 变化日志：价格 / 单位 / 免费额度 / 改名（Tooth #4）');
/* ================================================================== */

function historyFixture(patch) {
  const before = build().plan;
  const after = build(patch).plan;
  return { before, after };
}

/**
 * 跑一次变化记录。**必须带基线** —— 没有基线时重放状态是空的，链校验会认为
 * 「事件的 from 对不上当前值」并拒绝推进（那是内核在正确工作，不是夹具可以省的步骤）。
 */
function eventsOf(before, after, extra = {}) {
  const store = {
    ...apiHistory.emptyStore({ at: '2026-10-01' }),
    baseline: apiHistory.baselineOf([before], { at: '2026-10-01' }),
    ...extra
  };
  return apiHistory.record(store, {
    previous: [before], next: [after], at: '2026-10-02', runAt: '2026-10-02T00:00:00.000Z'
  });
}

{
  // 涨价
  const up = eventsOf(build().plan, build({
    models: withModel(0, { rates: { input: 10, output: 28, cachedInput: 2 } })
  }).plan);
  check('输入价上升 → price_increased（方向明确，不是笼统的"价格变化"）',
    up.problems.length === 0 && up.appended.length === 1 && up.appended[0].type === 'price_increased',
    JSON.stringify(up.problems.concat(up.appended.map(e => e.type))));

  // 降价
  const down = eventsOf(build().plan, build({
    models: withModel(0, { rates: { input: 4, output: 28, cachedInput: 2 } })
  }).plan);
  check('输入价下降 → price_decreased',
    down.appended.length === 1 && down.appended[0].type === 'price_decreased',
    JSON.stringify(down.appended.map(e => e.type)));

  // 方向混杂 → model_changed（不挑一个方向说）
  const mixed = eventsOf(build().plan, build({
    models: withModel(0, { rates: { input: 10, output: 20, cachedInput: 2 } })
  }).plan);
  check('输入涨 / 输出降 → model_changed（绝不挑一个方向冒充单向变化）',
    mixed.appended.length === 1 && mixed.appended[0].type === 'model_changed',
    JSON.stringify(mixed.appended.map(e => e.type)));

  // 只改显示名 → 零事件（Tooth #4 上半）
  const renamed = eventsOf(build().plan, build({ models: withModel(0, { name: 'GLM-5.3-NewName' }) }).plan);
  check('【牙】只改模型显示名（modelKey 不变）→ **零事件**（alias 不产生假变化）',
    renamed.appended.length === 0 && renamed.problems.length === 0,
    JSON.stringify(renamed.appended.map(e => `${e.type}:${e.field}`)));

  // 未登记的改名 → 移除 + 新增 + 疑似改名异常（Tooth #4 下半）
  const rekeyed = eventsOf(build().plan, build({ models: withModel(0, { modelKey: 'glm-5.4' }) }).plan);
  const types = rekeyed.appended.map(e => e.type).sort();
  check('【牙】未登记的改名（换 modelKey）→ model_removed + model_added 同时出现',
    types.includes('model_added') && types.includes('model_removed'), JSON.stringify(types));
  check('【牙】同一运行里的"新增 + 移除且单价有相同项"→ 写出 possible_rename 异常（**检测不等于自动合并**）',
    rekeyed.renameCandidates.length === 1
    && rekeyed.renameCandidates[0].removed === 'glm-5.3|standard'
    && rekeyed.renameCandidates[0].added === 'glm-5.4|standard'
    && rekeyed.store.anomalies.some(item => item.kind === 'possible_rename'),
    JSON.stringify(rekeyed.renameCandidates));

  // 文案标点不算变化
  const punct = eventsOf(build().plan, build({ models: withModel(1, { note: '按输入长度分档。' }) }).plan);
  check('模型备注只改标点 → 零事件', punct.appended.length === 0, JSON.stringify(punct.appended.map(e => e.type)));

  // 单位变化
  const unit = eventsOf(build().plan, build({ pricing: { currency: 'CNY', unit: 'per_1K_tokens' } }).plan);
  check('单位变化 → unit_changed（单独一条，不混进价格变化）',
    unit.appended.some(e => e.type === 'unit_changed' && e.field === 'pricing.unit'),
    JSON.stringify(unit.problems.concat(unit.appended.map(e => `${e.type}:${e.field}`))));

  // freeTier / credits
  const credit = eventsOf(build().plan, build({
    credits: [{ pay: 20, currency: 'CNY', gets: 20, unit: 'cny', usageNote: null, expires: null, description: '充值 20 元得 20 元额度' }]
  }).plan);
  check('credits 变化 → credits_changed',
    credit.appended.some(e => e.type === 'credits_changed'), JSON.stringify(credit.appended.map(e => e.type)));

  const free = eventsOf(build().plan, build({
    freeTier: { type: 'none', amount: null, period: null, models: null, description: '官方已停止提供免费模型', conversionDependsOnModel: null }
  }).plan);
  check('免费额度变化 → free_tier_changed',
    free.appended.some(e => e.type === 'free_tier_changed'), JSON.stringify(free.appended.map(e => e.type)));
}

{
  // 基线 + 事件重放 == 当前
  const before = build().plan;
  const after = build({ models: withModel(0, { rates: { input: 9, output: 28, cachedInput: 2 } }) }).plan;
  const baseline = apiHistory.baselineOf([before], { at: '2026-10-01' });
  const store = { ...apiHistory.emptyStore({ at: '2026-10-01' }), baseline };
  const recorded = apiHistory.record(store, { previous: [before], next: [after], at: '2026-10-02' });
  const problems = apiHistory.verifyStore(recorded.store, [after], { today: '2026-10-02' });
  check('基线 + 事件重放逐字段等于当前数据（逆操作改不回来必红）', problems.length === 0, problems.slice(0, 2).join('；'));

  const tampered = JSON.parse(JSON.stringify(recorded.store));
  // 改的是**被跟踪的值**（价格）。顺带说明：往元素对象上加一个未跟踪的键（如 `entry.input`）
  // 是**不会**报错的 —— 那正是 `sameModelEntry` 只比 rates/aliases/mediaRates/note 的设计意图。
  tampered.events[0].to.rates.input = 12345;
  const tamperedProblems = apiHistory.verifyStore(tampered, [after], { today: '2026-10-02' });
  check('【牙】手改事件的值 → verifyStore 当场报错', tamperedProblems.length > 0);

  // 日期倒填
  const backdated = apiHistory.record(recorded.store, { previous: [after], next: [before], at: '2026-10-01' });
  check('【牙】日期早于上一条事件 → 拒绝推进（不猜日期）',
    backdated.problems.some(p => p.includes('早于')), JSON.stringify(backdated.problems.slice(0, 1)));
}

{
  // 缺席确认：一次未见不记 ended，两次才记。
  // ⚠️ 夹具必须有**两条**记录、只消失一条：`next` 为空会触发「整个数据集被清空」的熔断
  // （那是另一条保护，不是这里要测的东西）。
  const planA = build().plan;
  const planB = build({ planName: '演练用 API 计费 B' }).plan;
  const baseline = apiHistory.baselineOf([planA, planB], { at: '2026-10-01' });
  const store = { ...apiHistory.emptyStore({ at: '2026-10-01' }), baseline };
  const first = apiHistory.record(store, { previous: [planA, planB], next: [planB], at: '2026-10-02' });
  check('一次未见 → 不记 ended（观测期未满）',
    first.appended.filter(e => e.type === 'ended').length === 0 && first.stats.pendingAbsence === 1,
    JSON.stringify({ appended: first.appended.length, pending: first.stats.pendingAbsence }));
  const second = apiHistory.record(first.store, { previous: [planB], next: [planB], at: '2026-10-03' });
  check('连续两次未见 → 记 ended（reason=source_no_longer_lists）',
    second.appended.some(e => e.type === 'ended' && e.reason === 'source_no_longer_lists'),
    JSON.stringify(second.appended.map(e => e.type)));

  // 熔断：一次消失太多不放行
  const many = [planA, planB, build({ planName: '演练用 API 计费 C' }).plan, build({ planName: '演练用 API 计费 D' }).plan];
  const bigBaseline = apiHistory.baselineOf(many, { at: '2026-10-01' });
  const bigStore = { ...apiHistory.emptyStore({ at: '2026-10-01' }), baseline: bigBaseline };
  const blocked = apiHistory.record(bigStore, { previous: many, next: [], at: '2026-10-02' });
  check('【牙】批量消失（超过 max(3, 半数)）→ 熔断：不记 ended，只在 anomalies 留档',
    blocked.stats.massMissing && blocked.appended.length === 0
    && blocked.store.anomalies.some(item => item.kind === 'mass_missing'),
    JSON.stringify({ massMissing: blocked.stats.massMissing, appended: blocked.appended.length }));

  // 机制只有一份实现
  const historySource = fs.readFileSync(path.join(__dirname, '..', 'lib', 'api-plan-history.js'), 'utf8');
  check('变化日志的写入内核只有一份实现（api-plan-history 只薄封装 plan-history.recordWithProfile）',
    historySource.includes('planHistory.recordWithProfile') && !/function record\(store, params\) \{\s*const base = core\.normalizeStore/.test(historySource));
}

/* ================================================================== */
section('⑥′ 派生事件身份 eventId（v3.0 补的缺口：写入点打点 + 重算比对）');
/* ================================================================== */

{
  const before = build().plan;
  const after = build({ models: withModel(0, { rates: { input: 9, output: 28, cachedInput: 2 } }) }).plan;
  const recorded = eventsOf(before, after);
  const events = apiHistory.eventsOf(recorded.store);

  check('写入点给每条事件打上 eventId（12 位十六进制，派生字段）',
    events.length > 0 && events.every(event => /^[0-9a-f]{12}$/.test(String(event.eventId || ''))),
    JSON.stringify(events.map(event => event.eventId)));

  check('apiPlanEventIdOf 是纯函数：同一条事件两次计算 ⇒ 同一个身份',
    events.every(event => apiHistory.apiPlanEventIdOf(event) === apiHistory.apiPlanEventIdOf({ ...event })));

  check('落库的 eventId 逐条等于重算值（写入点与校验点用同一个推导，不可能分家）',
    events.every(event => event.eventId === apiHistory.apiPlanEventIdOf(event)));

  check('事件内容不同 ⇒ 身份不同（改一个单价数字就换一个身份）',
    apiHistory.apiPlanEventIdOf(events[0])
    !== apiHistory.apiPlanEventIdOf({
      ...events[0],
      to: { ...events[0].to, rates: { ...events[0].to.rates, input: 12345 } }
    }));

  check('事件日期不同 ⇒ 身份不同',
    apiHistory.apiPlanEventIdOf(events[0]) !== apiHistory.apiPlanEventIdOf({ ...events[0], at: '2026-10-03' }));

  check('干净日志的 verifyStore 不报 eventId 问题（负例不误报）',
    !apiHistory.verifyStore(recorded.store, [after], { today: '2026-10-02' })
      .some(problem => problem.includes('eventId')));

  const handwritten = JSON.parse(JSON.stringify(recorded.store));
  handwritten.events[0].eventId = 'deadbeef0000';
  const handwrittenProblems = apiHistory.verifyStore(handwritten, [after], { today: '2026-10-02' });
  check('【牙】手写 / 篡改 eventId ⇒ verifyStore 报「派生字段不得手写」',
    handwrittenProblems.some(problem => problem.includes('eventId') && problem.includes('不得手写')),
    JSON.stringify(handwrittenProblems.slice(0, 2)));

  // 「没写」与「写错」是两件事：老日志里没有 eventId 的事件不能因为「没写」被判红，
  // 但**写了一个错的**必须红 —— 否则这条派生字段纪律等于不存在。
  const withoutId = JSON.parse(JSON.stringify(recorded.store));
  delete withoutId.events[0].eventId;
  check('历史事件没带 eventId 时不判红（只有写了一个错的才红）',
    !apiHistory.verifyStore(withoutId, [after], { today: '2026-10-02' })
      .some(problem => problem.includes('eventId')));

  // 机制只有一份：API 侧的派生**只声明一次**，且直接复用内核那条基（不另写一套哈希基，
  // 否则写入点与校验点会算出两个都在 12 位 hex 形状里的不同值）。
  const apiSource = fs.readFileSync(path.join(__dirname, '..', 'lib', 'api-plan-history.js'), 'utf8');
  check('API 侧的事件身份推导只有一处，且与写入内核同源（不另写哈希基）',
    apiSource.includes('function apiPlanEventIdOf(event)')
    && apiSource.includes('return planHistory.eventIdOf(event);')
    && !/createHash|sha1Hex/.test(apiSource));
  check('派生字段的「重算并比对」只有一份实现（两条 profile 共用 plan-history.eventIdProblems）',
    fs.readFileSync(path.join(__dirname, '..', 'lib', 'plan-history.js'), 'utf8').includes('function eventIdProblems(events, profile)')
    && apiSource.includes('planHistory.eventIdProblems(core.eventsOf(doc), API_PROFILE)'));
}

/* ================================================================== */
section('⑥″ API 变化视图（/changes/ 的 API 分栏，订阅源的输入）');
/* ================================================================== */

{
  const planChanges = require('../lib/plan-changes');

  const before = build().plan;
  const after = JSON.parse(JSON.stringify(before));
  // 三件事：一次调价（models）、一次计费单位变化（pricing.unit）、一次元信息变化（officialUrl）
  after.models = after.models.map(entry => ({
    ...entry,
    rates: { ...entry.rates, input: (typeof entry.rates.input === 'number' ? entry.rates.input : 0) + 5 }
  }));
  after.pricing = { ...after.pricing, unit: 'per_1K_tokens' };
  after.officialUrl = 'https://open.bigmodel.cn/pricing/v2';
  const recordedStore = eventsOf(before, after).store;
  const rawTypes = apiHistory.eventsOf(recordedStore).map(event => event.type);

  const radar = planChanges.buildApiPlanRadar({
    plans: [after], store: recordedStore, asOf: '2026-10-02', availability: 'ok', providerTable: PROVIDER_TABLE
  });

  check('夹具确实产出了三类事件（价格 / 单位 / 元信息）—— 断言才有样本',
    rawTypes.includes('price_increased') && rawTypes.includes('unit_changed') && rawTypes.includes('updated'),
    JSON.stringify(rawTypes));
  check('API 分栏：可用时 availability=ok，窗口与套餐同口径',
    radar.availability === 'ok' && radar.windows.recentDays === 7 && radar.windows.endedDays === 30);
  check('API 分栏：实质变化进「最近 7 天变化」，记录级元信息进 other.metadata',
    radar.totals.changed === rawTypes.filter(type => type !== 'updated').length
    && radar.totals.meta === 1 && radar.other.metadata.length === 1
    && radar.sections.changed.items.every(item => item.type !== 'updated'),
    JSON.stringify(radar.totals));
  check('API 分栏：每条条目都带**日志里的**派生事件身份（订阅的 guid 直接用它）',
    radar.sections.changed.items.every(item => typeof item.eventId === 'string'
      && apiHistory.eventsOf(recordedStore).some(event => apiHistory.apiPlanEventIdOf(event) === item.eventId)));
  check('API 分栏：记录标题取当前数据，平台用显示名（不是内部键 zhipu）',
    radar.sections.changed.items.every(item => item.title === '演练用 API 计费'
      && item.vendor === PROVIDER_TABLE.zhipu.name && item.titled === true),
    JSON.stringify(radar.sections.changed.items.map(item => `${item.vendor}/${item.title}`)));
  check('API 分栏：同一份输入两次构建逐字节相同（纯函数）',
    JSON.stringify(radar) === JSON.stringify(planChanges.buildApiPlanRadar({
      plans: [after], store: recordedStore, asOf: '2026-10-02', availability: 'ok', providerTable: PROVIDER_TABLE
    })));
  check('API 分栏：「最近变化」块按 API 自己的优先级取（单价涨跌排在计费单位之前）',
    radar.home.items.length > 0 && radar.home.items[0].type === 'price_increased',
    JSON.stringify(radar.home.items.map(item => item.type)));

  const unavailable = planChanges.buildApiPlanRadar({
    plans: [after], store: null, asOf: '2026-10-02', availability: 'unavailable', providerTable: PROVIDER_TABLE
  });
  check('API 分栏：日志不可用时分栏全空、totals 归零（不拿「空」冒充「没有变化」的数据）',
    unavailable.availability === 'unavailable'
    && unavailable.sections.changed.items.length === 0 && unavailable.totals.changed === 0
    && unavailable.home.items.length === 0);

  // 「分栏骨架只有一份实现」：两个来源的差异必须全部登记在 RADAR_SOURCES 里。
  check('套餐与 API 两个来源共用一份分栏实现（差异只登记在 RADAR_SOURCES）',
    Object.keys(planChanges.RADAR_SOURCES).sort().join(',') === 'api,plans'
    && !/function buildApiPlanRadar[\s\S]{0,400}?sections\.created = /.test(fs.readFileSync(path.join(__dirname, '..', 'lib', 'plan-changes.js'), 'utf8')));
}

/* ================================================================== */
section('⑦ 优惠 ↔ API 计费记录（Deal Linking）');
/* ================================================================== */

{
  const plan = build().plan;
  const deal = {
    id: 'aaaaaaaaaaa1',
    type: 'deal',
    title: '新用户注册专享 2000 万免费 Tokens 资源包',
    vendor: '智谱AI',
    url: 'https://open.bigmodel.cn/pricing',
    expiresAt: null
  };
  const doc = {
    schemaVersion: 1,
    links: [{
      dealId: deal.id,
      planIds: [plan.id],
      provider: 'zhipu',
      basis: 'official-pricing-page',
      evidence: [{
        field: 'relation',
        quote: '新用户注册专享 2000万免费Tokens资源包',
        sourceUrl: 'https://open.bigmodel.cn/pricing',
        capturedAt: '2026-10-01',
        lang: 'zh'
      }],
      confirmedAt: '2026-10-01'
    }],
    retired: []
  };
  const ctx = {
    deals: [deal], plans: [], apiPlans: [plan],
    asOf: '2026-10-01', providerTable: PROVIDER_TABLE, strict: true
  };
  const result = links.validate(doc, ctx);
  check('关系可以指向 API 计费记录（id 空间合并，关系表格式未变）',
    result.errors.length === 0, JSON.stringify(result.errors.slice(0, 2)));

  const view = links.planDealsView(doc, ctx);
  check('API 计费记录也出现在关系视图里，且带 planKind', view.rows.length === 1 && view.rows[0].planKind === 'api');

  const related = links.relatedPlansOf(links.rowsOfLink(doc.links[0], ctx));
  check('注入 dist 的行带 planKind（渲染层据此切换标签与链接目标）',
    related.length === 1 && related[0].planKind === 'api', JSON.stringify(related[0] || null));
  check('API 计费记录算不出「节省金额」（它没有 billing，与订阅价不可相减）',
    related[0].savingsText === null);
  check('注入的字段键序固定（含新增的 planKind）',
    JSON.stringify(Object.keys(related[0])) === JSON.stringify(links.RELATED_PLAN_FIELDS),
    Object.keys(related[0]).join(','));

  const withKind = { ...doc, links: [{ ...doc.links[0], provider: 'deepseek' }] };
  const mismatch = links.validate(withKind, ctx);
  check('【牙】关系声明的 provider 与 API 记录的 provider 不一致 → 红',
    mismatch.errors.some(e => e.includes('provider')), JSON.stringify(mismatch.errors.slice(0, 1)));

  const missing = links.validate({ ...doc, links: [{ ...doc.links[0], planIds: ['deadbeef0000'] }] }, ctx);
  check('【牙】planId 指向不存在的记录 → 红',
    missing.errors.some(e => e.includes('不存在')), JSON.stringify(missing.errors.slice(0, 1)));
}

/* ================================================================== */
section('⑧ 诚实性：结论性词汇与页面承诺');
/* ================================================================== */

{
  const dirty = build({ planName: '最值得买的 API 计费' });
  check('数据层的结论性词汇必须判红（记录名里出现「最值得买」）',
    dirty.ok && apiPage.assertDataHonesty([dirty.plan]).length > 0);

  const plan = build().plan;
  const html = apiPage.apiPlansPageBody([plan], { providerTable: PROVIDER_TABLE, prefix: '../../' });
  const injected = html.replace('口径与说明（先读这一段）', '口径与说明（先读这一段）性价比最高');
  check('【牙】页面注入结论性词汇 → 诚实性断言变红',
    apiPage.assertPageHonesty(injected, [plan], { providerTable: PROVIDER_TABLE }).some(p => p.includes('结论性词汇')));

  check('页面没有交互控件（v1 是预渲染静态表）',
    !/<button|<select|<input/.test(html));
  check('页面承诺了「单位不跨口径换算」与「credits 不是 token」',
    html.includes('不做换算') && html.includes('credits 是预付费额度'));
  check('每条记录都有锚点（订阅与深链的落点）', html.includes(`id="plan-${plan.id}"`));
  check('页面给出了官方出处链接', html.includes('官方定价页 ↗'));

  const store = apiHistory.emptyStore({ at: '2026-10-01' });
  check('历史诚实性断言在空日志上零问题（断言不是恒红）',
    apiPage.assertHistoryHonesty([plan], store).length === 0);
}

/* ================================================================== */

console.log(`\n=== v2.5 API / Token 计费演练：${passed} 项通过，${failures.length} 项失败 ===`);
if (failures.length) {
  console.log('失败项：');
  failures.forEach(name => console.log(`  ✗ ${name}`));
  process.exit(1);
}
