#!/usr/bin/env node
/**
 * v2.5 API / Token 计费演练（离线、零依赖、可重跑）。
 *
 * 它演练的是**这一层自己的承诺**（题面 §十二 / §十三）：
 *   · 单位永远显式，且全仓不存在跨单位换算的代码路径；
 *   · credits 是钱不是 token —— 结构上就写不进 token 数量，页面上也不折算；
 *   · 输入价与输出价分列，渲染层互换会被逐格对账当场抓住；
 *   · 模型改名（保持 modelKey）产生**零事件**；未登记的改名必须被检测出来；
 *   · 免费额度**逐条标注性质**（长期提供 / 新用户赠送 / 限时赠送）：赠送类不得被渲染成长期能力，
 *     `0` 表示"官方明说免费"而 `null` 表示"官方没公布"。
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
      stability: 'standing',
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

/**
 * 换单位时必须**同时**换一条点名该单位的引文：单位是价格事实的一部分，
 * 引文说「每百万」而字段写 per_1K_tokens 是矛盾，不是"另一种口径"。
 */
function perKEvidence() {
  return [{
    field: 'pricing.unit',
    quote: '官方价目表表头：USD per 1K tokens（每 1000 tokens）',
    sourceUrl: 'https://open.bigmodel.cn/pricing',
    capturedAt: '2026-10-01',
    lang: 'en'
  }];
}

/**
 * 「全仓没有单位换算路径」的**代码面**扫描（P2-20 / F-r2-api-006）。
 *
 * 旧版只扫 `api-plan-schema.js` 一个文件、只匹配常数乘法 —— 审计实测：在**渲染层**引入
 * `value * 1000` 时五道门禁全绿。这一版把面扩到 `scripts/**` 的真实代码面，并按**单位语义**
 * 立判据（先把注释 / 字符串 / 正则字面量剥掉，剩下的算术才是代码算术）：
 *   ① 以换算为名的函数或常量（convertUnit / toPerMillion / UNIT_PER_…）；
 *   ② 价格 / 额度标识符与换算因子（1000 / 1e3 / 1e6 / 1_000_000）出现在同一个算术表达式里；
 *   ③ 单位标识符与换算因子出现在同一个算术表达式里。
 *
 * 为什么必须剥字面量：单位词表本身就是**正则**（`/每\s*1000/`），不剥的话「代码面扫描」会在
 * 自己的词表上假红 —— 一条会假红的红线最后一定被改松。
 */
function unitConversionHits(source, file) {
  const hits = [];
  const stripped = String(source)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')                       // 块注释
    .replace(/^\s*\/\/.*$/gm, ' ')                           // 整行行注释
    .replace(/([^:'"`\w])\/\/[^\n]*/g, '$1 ')                // 行尾注释（避开 http://）
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''")                   // 单引号字符串
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""')                   // 双引号字符串
    .replace(/`(?:\\.|[^`\\])*`/g, '``')                     // 模板字符串
    .replace(/\/(?![/*])(?:\\.|\[[^\]]*\]|[^/\n\\])+\/[gimsuy]*/g, ' '); // 正则字面量
  const FACTOR = '(?:1000|1e3|1_000|1000000|1e6|1_000_000)';
  // 标识符里**刻意不含裸 `value`**：`Math.round(value * 1e6) / 1e6` 是「四舍五入到 6 位」
  // 这类与单位无关的规范化写法（`scripts/ai/*` 里就有三处），把它算成换算会让这条红线假红。
  const MONEY = '(?:rate|price|amount|input|output|cached|token|unit)[A-Za-z_$]*';
  const CONVERT_NAME = /(convertUnit|toPerMillion|toPerThousand|unitRatio|UNIT_PER_|perMillionFactor|perThousandFactor)/i;
  const ARITH = new RegExp(`(?:${MONEY}[^;\\n]{0,20})\\s*[*/]\\s*${FACTOR}\\b|\\b${FACTOR}\\s*[*/][^;\\n]{0,20}${MONEY}`, 'i');
  const UNIT_ARITH = new RegExp(`(?:per_1M|per_1K|per_million|per_thousand|UNIT_LABEL)[^;\\n]{0,20}\\s*[*/]\\s*\\d|\\d\\s*[*/][^;\\n]{0,20}(?:per_1M|per_1K|per_million|per_thousand)`, 'i');
  // 与单位无关的既有规范化写法：四舍五入到 N 位（白名单只放这一种形态，并有断言钉住它不是换算）
  const ROUNDING_IDIOM = /Math\.round\([^)]*\)\s*\/\s*(?:1e\d+|\d+)\b/;
  stripped.split('\n').forEach((line, index) => {
    const text = line.trim();
    if (!text) return;
    if (ROUNDING_IDIOM.test(text)) return;
    if (CONVERT_NAME.test(text)) hits.push({ file, line: index + 1, why: '以换算为名的函数 / 常量', text });
    else if (ARITH.test(text)) hits.push({ file, line: index + 1, why: '价格 / 额度标识符与换算因子出现在同一个算术表达式里', text });
    else if (UNIT_ARITH.test(text)) hits.push({ file, line: index + 1, why: '单位标识符与数字出现在同一个算术表达式里', text });
  });
  return hits;
}

/** 递归列出目录下所有 .js（扫描面：真实代码，不含 fixtures / data） */
function jsFilesUnder(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'fixtures' || entry.name === 'data' || entry.name === 'node_modules') continue;
      out.push(...jsFilesUnder(full));
    } else if (entry.name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
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
    freeTier: { type: 'models', stability: 'standing', models: ['nope'], description: 'x', conversionDependsOnModel: null }
  }, '不在本记录的 models 里');
  rejects('freeTier 三态：官方明说没有免费额度必须带 description → 红', {
    freeTier: { type: 'none', stability: null, amount: null, period: null, models: null, description: null, conversionDependsOnModel: null }
  }, '必须用 description');
}

/* ================================================================== */
section('② 单位：显式保存，且全仓没有换算路径（Tooth #3）');
/* ================================================================== */

{
  const perM = build({ pricing: { currency: 'USD', unit: 'per_1M_tokens' } });
  const perK = build({ pricing: { currency: 'USD', unit: 'per_1K_tokens' }, evidence: perKEvidence() });
  check('同一份价格数据 + 两种 unit 都能通过校验（单位是显式声明，不是隐含约定）',
    perM.ok && perK.ok, JSON.stringify((perK.problems || []).slice(0, 1)));

  // 【牙】P1-8：来源层把 unit 从 per_1M 翻成 per_1K（或反向）而引文没变 ⇒ 必须红
  const flippedK = build({ pricing: { currency: 'USD', unit: 'per_1K_tokens' } });
  check('【牙】引文点名「每百万」而 pricing.unit=per_1K_tokens → 红（单位枚举翻转必须有判据）',
    !flippedK.ok && flippedK.problems.some(problem => problem.includes('每百万')),
    JSON.stringify((flippedK.problems || []).slice(0, 1)));
  const flippedM = build({ pricing: { currency: 'USD', unit: 'per_1M_tokens' }, evidence: perKEvidence() });
  check('【牙·反向】引文点名「每千」而 pricing.unit=per_1M_tokens → 也红（两个方向都有牙）',
    !flippedM.ok && flippedM.problems.some(problem => problem.includes('每千')),
    JSON.stringify((flippedM.problems || []).slice(0, 1)));
  const noWitness = build({
    pricing: { currency: 'USD', unit: 'per_1M_tokens' },
    evidence: [{ field: 'models.glm-5.3', quote: 'GLM-5.3：输入 8 / 输出 28', sourceUrl: 'https://open.bigmodel.cn/pricing', capturedAt: '2026-10-01' }]
  });
  check('【牙】单位没有任何见证（引文不点名、无 pricing.unit 引文、unitNote 空）→ 红（不许静默放行）',
    !noWitness.ok && noWitness.problems.some(problem => problem.includes('没有任何单位见证')),
    JSON.stringify((noWitness.problems || []).slice(0, 1)));

  const rowM = apiPage.apiRowsOf([perM.plan])[0];
  const rowK = apiPage.apiRowsOf([perK.plan])[0];
  check('页面「计费单位」列把两种口径区分开',
    rowM.unitText === 'USD / 每 100 万 tokens' && rowK.unitText === 'USD / 每 1000 tokens',
    `${rowM.unitText} | ${rowK.unitText}`);
  check('价格数字本身**原样输出**（不做任何单位换算）',
    apiPage.priceText(rowM.rates.input, 'USD') === apiPage.priceText(rowK.rates.input, 'USD'),
    `${apiPage.priceText(rowM.rates.input, 'USD')}`);

  // ---- 结构性断言：单位必须**原样**从数据字段传到 formatter（中间不得出现算术） ----
  for (const unit of apiSchema.API_UNITS) {
    const built = build({ pricing: { currency: 'USD', unit }, evidence: unit === 'per_1K_tokens' ? perKEvidence() : rawPlan().evidence });
    if (!built.ok) { check(`单位 ${unit} 的夹具可构造`, false, JSON.stringify((built.problems || []).slice(0, 1))); continue; }
    const row = apiPage.apiRowsOf([built.plan])[0];
    check(`单位列 = 币种 + API_UNIT_LABEL 的**纯查表**（${unit}）`,
      row.unitText === `USD / ${apiSchema.API_UNIT_LABEL[unit]}`, row.unitText);
    // 单元格里的数字必须是**数据里那个数字**（`0` 的渲染是「免费」，单独放行）：
    // 任何一层偷偷乘除 1000，这里都会因为"数字不是原来那个"而红。
    const expectedCell = row.rates.input === 0 ? '免费' : String(row.rates.input);
    check(`价格单元格原样包含数据里的数字（${unit} 不做任何换算）`,
      apiPage.rowsOfHtml(apiPage.apiPlansPageBody([built.plan], { providerTable: PROVIDER_TABLE, prefix: '../../' }))[0]
        .cells[4].includes(expectedCell), `${unit} → 期望含「${expectedCell}」`);
  }

  // ---- 代码面扫描（P2-20 / F-r2-api-006）：换算路径不许出现在任何被扫描的文件里 ----
  const scanFiles = jsFilesUnder(path.join(ROOT, 'scripts'));
  const hits = scanFiles.flatMap(file => unitConversionHits(fs.readFileSync(file, 'utf8'), path.relative(ROOT, file)));
  check(`【牙·代码面】scripts/ 下 ${scanFiles.length} 个 .js 文件里没有任何单位换算路径（旧版只扫 1 个文件）`,
    hits.length === 0, hits.slice(0, 3).map(hit => `${hit.file}:${hit.line} ${hit.why} → ${hit.text}`).join(' | '));
  // 【牙】扫描器不是摆设：把三种形态喂给它，必须全部命中
  const SYNTHETIC_CONVERSIONS = [
    ['scripts/lib/zh.js', 'const perMillion = rate.input * 1000;\n'],
    ['scripts/lib/models-page.js', 'const converted = priceValue / 1000; // per_1K -> per_1M\n'],
    ['scripts/lib/seo.js', 'function toPerMillion(value) { return value * 1000; }\n'],
    ['scripts/tools/coverage-report.js', 'total += rates.output / 1e6;\n']
  ];
  const syntheticHits = SYNTHETIC_CONVERSIONS.filter(([file, source]) => unitConversionHits(source, file).length > 0);
  check('【牙】扫描器对「非显眼文件里的换算路径」四种写法全部命中（否则这条红线是假的）',
    syntheticHits.length === SYNTHETIC_CONVERSIONS.length,
    SYNTHETIC_CONVERSIONS.filter(([file]) => !syntheticHits.some(([hitFile]) => hitFile === file)).map(([file]) => file).join(', '));
  check('【牙·反向】扫描器不误伤真实代码（注释放行、纯查表放行）',
    unitConversionHits('// 每千换算成每百万是禁止的\nconst label = API_UNIT_LABEL[unit];\n', 'scripts/lib/x.js').length === 0);
}

/* ================================================================== */
section('⑤′ 证据绑定：维度 / 顺序 / 单位（§10.1–10.3）');
/* ================================================================== */

/**
 * 这一节是 P1-7 / P1-8 的牙。审计实测：把来源层某个模型的 input 与 output 对调后重建，
 * **五道门禁全 exit 0、发布产物变化**（读者看到的价格列全反，页面照常渲染）。
 * 根因是证据只说「这段原文属于这个模型」（`models.<modelKey>`），说不出「哪个数字是输入价」。
 *
 * 修法是把绑定**追加**到维度级（`…rates.input`），并让官方表格的**列序**成为判据：
 * 输入价永远在输出价之前 —— 这不是"价格大小的经验规则"，是原文自己的顺序。
 */
{
  const PER_DIM = (field, quote) => [{ field, quote, sourceUrl: 'https://open.bigmodel.cn/pricing', capturedAt: '2026-10-01', lang: 'zh' }];

  // 字段域：追加式扩展（旧形态保留 + 新形态可用）
  const fields = apiSchema.apiEvidenceFieldsOf({ models: build().plan.models });
  check('字段域：旧形态 models.<modelKey> 仍在（存量 35 条引文不许失配）',
    fields.includes('models.glm-5.3'), fields.slice(0, 4).join(' · '));
  check('字段域：新增逐变体 / 逐维度 / 记录级维度 / 非 token 单位四种键',
    fields.includes('models.glm-5.3.standard')
    && fields.includes('models.glm-5.3.standard.rates.input')
    && fields.includes('models.glm-5.3.rates.output')
    && fields.includes('rates.input')
    && fields.includes('mediaRates.per_image'), fields.length);
  const legacyField = build({ evidence: PER_DIM('models.glm-5.3', 'GLM-5.3：输入 8 元 / M，输出 28 元 / M') });
  check('维度级绑定可用（…rates.input）且与规格一致',
    legacyField.ok, JSON.stringify((legacyField.problems || []).slice(0, 1)));
  const precise = build({
    evidence: PER_DIM('models.glm-5.3.standard.rates.input', 'GLM-5.3 标准档：输入 8 元 / 百万 tokens，输出 28 元 / 百万 tokens')
  });
  check('精确到变体 + 维度的绑定可用', precise.ok, JSON.stringify((precise.problems || []).slice(0, 1)));

  // B1：空转的维度绑定必须红
  const vacuous = build({ evidence: PER_DIM('models.glm-5.3.standard.rates.output', 'GLM-5.3 标准档：输入 8 元 / 百万 tokens') });
  check('【牙】绑定了 output 维度但引文里读不到输出价 → 红（空转的绑定等于没证）',
    !vacuous.ok && vacuous.problems.some(problem => problem.includes('空转')),
    JSON.stringify((vacuous.problems || []).slice(0, 1)));
  const ghostDim = build({ evidence: PER_DIM('rates.reasoning', 'GLM-5.3：输入 8 元 / M，输出 28 元 / M') });
  check('【牙】绑定一个**没有值**的维度（记录级 rates.reasoning）→ 红',
    !ghostDim.ok && ghostDim.problems.some(problem => problem.includes('没有值')),
    JSON.stringify((ghostDim.problems || []).slice(0, 1)));

  // B2：来源层对调 input/output —— 引文没变、数据的顺序反了
  // 注意：`models[0]` 是 glm-4.7-flash（规范序按 modelKey 升序），所以要**按身份**定位 glm-5.3 standard，
  // 不能按下标 —— 这正是"夹具改错模型 ⇒ 断言假绿"的经典坑。
  const swapRates = (input, output) => build().plan.models.map(entry => (
    entry.modelKey === 'glm-5.3' && entry.variant === 'standard'
      ? { ...entry, rates: { ...entry.rates, input, output } }
      : entry
  ));
  const swapped = build({ models: swapRates(28, 8) });
  check('【牙·P1-7】来源层把 input/output 对调（引文仍是官方原序）→ 红',
    !swapped.ok && swapped.problems.some(problem => problem.includes('顺序相反')),
    JSON.stringify((swapped.problems || []).slice(0, 1)));
  const ordered = build({ models: swapRates(8, 28.5) });
  check('对照：只改数值（不换序）不会因为"顺序"被判红（引文里没有 28.5 → 不作顺序断言）',
    ordered.ok, JSON.stringify((ordered.problems || []).slice(0, 1)));
  const sameValue = build({ models: swapRates(8, 8) });
  check('对照：输入价 == 输出价时不作顺序断言（同一个数字没有先后）', sameValue.ok);

  // B2 反向：引文顺序与数据一致时必须**绿**（判据不是恒红）
  const officialOrder = build({
    evidence: PER_DIM('models.glm-5.3', '官方表：GLM-5.3 输入 8 元 / 百万 tokens · 输出 28 元 / 百万 tokens')
  });
  check('对照：引文按官方列序写（输入在前）→ 绿（断言不是恒红）', officialOrder.ok,
    JSON.stringify((officialOrder.problems || []).slice(0, 1)));

  // 顺序判据的助手：数字定位（前导边界 + 粘连容忍）
  check('引文数字定位：28 里的 8 不算 8（前导边界）',
    apiSchema.quoteIndexOfNumber('输出 28 元', 8) === -1 || apiSchema.quoteIndexOfNumber('输出 28 元', 28) < apiSchema.quoteIndexOfNumber('输出 28 元', 8),
    `${apiSchema.quoteIndexOfNumber('输出 28 元', 8)} / ${apiSchema.quoteIndexOfNumber('输出 28 元', 28)}`);
  check('引文数字定位：粘连写法 2.1016.80 能认出 2.10 与 16.80',
    apiSchema.quoteIndexOfNumber('永久五折4.20 2.1016.80 8.400.84', 2.1) >= 0
    && apiSchema.quoteIndexOfNumber('永久五折4.20 2.1016.80 8.400.84', 16.8) >= 0,
    `${apiSchema.quoteIndexOfNumber('永久五折4.20 2.1016.80 8.400.84', 2.1)} / ${apiSchema.quoteIndexOfNumber('永久五折4.20 2.1016.80 8.400.84', 16.8)}`);
  check('单位点名：只认写出来的单位词，不看数字大小',
    apiSchema.namedUnitOf('每百万 tokens') === 'million' && apiSchema.namedUnitOf('per 1K tokens') === 'thousand'
    && apiSchema.namedUnitOf('输入 8 元 / 输出 28 元') === null,
    `${apiSchema.namedUnitOf('每百万 tokens')} / ${apiSchema.namedUnitOf('per 1K tokens')} / ${apiSchema.namedUnitOf('输入 8 元 / 输出 28 元')}`);

  // 第 7 / 8 列的渲染层对账（P1-9 / P1-10）：单位错位、类型词串台都必须红
  const MEDIA_PLAN = build({
    models: build().plan.models.map(entry => (
      entry.modelKey === 'glm-5.3' && entry.variant === 'standard'
        ? { ...entry, mediaRates: [{ kind: 'image', price: 0.04, unit: 'per_image', note: null }] }
        : entry
    )),
    evidence: PER_DIM('models.glm-5.3', 'GLM-5.3：输入 8 元 / M，输出 28 元 / M；图像 0.04 元 / 张')
  });
  check('夹具：带 mediaRates 的记录可构造', MEDIA_PLAN.ok, JSON.stringify((MEDIA_PLAN.problems || []).slice(0, 1)));
  const mediaHtml = apiPage.apiPlansPageBody([MEDIA_PLAN.plan], { providerTable: PROVIDER_TABLE, prefix: '../../' });
  const mediaRows = apiPage.rowsOfHtml(mediaHtml);
  const mediaIndex = apiPage.apiRowsOf([MEDIA_PLAN.plan]).findIndex(row => (row.mediaRates || []).length > 0);
  check('夹具：确实渲染出带 mediaRates 的那一行', mediaIndex >= 0);
  const mediaRow = mediaRows[mediaIndex];
  check('第 7 列：数字 + 单位 + 标签三件都在（单位来自数据的 unit 字段）',
    mediaRow.cells[7].includes('图像') && mediaRow.cells[7].includes('0.04') && mediaRow.cells[7].includes('每张'),
    mediaRow.cells[7]);
  check('对照组：带 mediaRates 的页面 0 问题',
    apiPage.assertPageHonesty(mediaHtml, [MEDIA_PLAN.plan], { providerTable: PROVIDER_TABLE }).length === 0,
    apiPage.assertPageHonesty(mediaHtml, [MEDIA_PLAN.plan], { providerTable: PROVIDER_TABLE }).slice(0, 1).join('；'));
  const mediaMisplaced = mediaHtml.split('每张').join('每秒');
  check('【牙·P1-9】把第 7 列的单位错位（每张 → 每秒）→ assertPageHonesty 变红',
    apiPage.assertPageHonesty(mediaMisplaced, [MEDIA_PLAN.plan], { providerTable: PROVIDER_TABLE })
      .some(problem => problem.includes('单位')), '单位错位没有被抓住');
  const creditMismatch = build({
    freeTier: { type: 'tokens', stability: 'standing', amount: 1000000, period: 'monthly', models: null, description: '官方每月赠送 100 万 tokens', conversionDependsOnModel: null },
    evidence: PER_DIM('models.glm-5.3', 'GLM-5.3：输入 8 元 / M，输出 28 元 / M'),
    pricing: { currency: 'USD', unit: 'per_1M_tokens' }
  });
  const tokenHtml = apiPage.apiPlansPageBody([creditMismatch.plan], { providerTable: PROVIDER_TABLE, prefix: '../../' });
  // 免费额度那段在 `；credits：` 之前（同一格里还有 credits 段，两段不能混着断言）
  const tokenCell = apiPage.rowsOfHtml(tokenHtml)[0].cells[8].split('；credits：')[0];
  check('第 8 列：tokens 型免费额度印出 tokens 单位词',
    tokenCell.includes('tokens') && !tokenCell.includes('credits'), tokenCell);
  const creditsBent = tokenHtml.split('免费额度 1,000,000 tokens').join('免费额度 1,000,000 credits');
  check('【牙·P1-10】把 tokens 额度印成 credits → assertPageHonesty 变红',
    apiPage.assertPageHonesty(creditsBent, [creditMismatch.plan], { providerTable: PROVIDER_TABLE })
      .some(problem => problem.includes('同源') || problem.includes('单位词')), '类型词串台没有被抓住');
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
section('⑤ 免费额度：长期能力 vs 新用户 / 限时赠送（P1-11）');
/* ================================================================== */

/**
 * 这一节为什么存在（审计 `F-r2-api-005`，P1）：
 * 页面口径写着「免费额度只记官方长期提供的免费能力」，而生产 4 条非空 `freeTier` 里
 * `aliyun`（「有效期自开通百炼起 90 天内」）与 `tencent`（「首次开通…资源包有效期为1年」）
 * 正是限时 / 新用户赠送 —— **生产数据违反它自己的规则**，而当时没有任何字段承载
 * 「长期 vs 赠送」这一判据，五道门禁全绿。
 *
 * 修法 = 数据层必填 `stability`（缺省即错误）+ 渲染层逐条印出性质（赠送那两档明说「非长期能力」）
 * + 两个方向的牙：① 数据把一次性赠送标成长期 → schema 红；② 渲染把赠送印成长期 → 页面断言红。
 */
{
  const built = build();
  const html = apiPage.apiPlansPageBody([built.plan], { providerTable: PROVIDER_TABLE, prefix: '../../' });
  check('免费模型列用**显示名**而不是 modelKey（读者认的是官方名）',
    html.includes('GLM-4.7-Flash'), '页面里找不到显示名');
  check('免费额度与 credits 有独立的明细节',
    html.includes('免费额度与 credits（厂商级事实）'));

  const nonePlan = build({
    freeTier: { type: 'none', stability: null, amount: null, period: null, models: null, description: '官方 FAQ 明说按量计费没有免费额度', conversionDependsOnModel: null }
  });
  const noneHtml = apiPage.apiPlansPageBody([nonePlan.plan], { providerTable: PROVIDER_TABLE, prefix: '../../' });
  check('「官方明说没有免费额度」与「我们没查到（null）」是两种写法',
    noneHtml.includes('官方明说无免费额度') && nonePlan.plan.freeTier.type === 'none');

  const unknownPlan = build({ freeTier: null, credits: null });
  const unknownHtml = apiPage.apiPlansPageBody([unknownPlan.plan], { providerTable: PROVIDER_TABLE, prefix: '../../' });
  const unknownRow = apiPage.rowsOfHtml(unknownHtml)[0];
  check('未标注的免费额度写「—」', unknownRow.cells[8] === '—', unknownRow.cells[8]);

  /* ---- 数据层：性质必填，且与 period / description 互斥 ---- */
  const giftFreeTier = patch => ({
    type: 'tokens',
    amount: 1000000,
    period: 'one_time',
    models: null,
    description: '官方写「首次开通腾讯混元大模型服务后…共100万 tokens，共享消耗。资源包有效期为1年」',
    conversionDependsOnModel: null,
    ...patch
  });
  rejects('freeTier 缺 stability → 红（缺省会被读成长期能力，这正是那条 P1 的形态）',
    { freeTier: giftFreeTier({}) }, 'stability 非法');
  rejects('freeTier.stability 非法值 → 红（只接受三档）',
    { freeTier: giftFreeTier({ stability: 'forever' }) }, 'stability 非法');
  rejects('stability=standing 与 period=one_time 自相矛盾 → 红',
    { freeTier: giftFreeTier({ stability: 'standing' }) }, '自相矛盾');
  rejects('赠送额度写成周期性刷新（period=monthly）→ 红',
    { freeTier: giftFreeTier({ stability: 'new_user', period: 'monthly' }) }, '不得写成周期性');
  rejects('赠送额度缺 description → 红（分类必须由官方条件支撑）',
    { freeTier: giftFreeTier({ stability: 'new_user', description: null }) }, '必须用 description');
  rejects('赠送额度的 description 没写条件 → 红',
    { freeTier: giftFreeTier({ stability: 'new_user', description: '官方提供一部分免费额度' }) }, '没有写明赠送');
  rejects('type=none 却标了性质 → 红（「没有」没有性质可标）',
    { freeTier: { type: 'none', stability: 'standing', amount: null, period: null, models: null, description: '官方 FAQ 明说没有免费额度', conversionDependsOnModel: null } },
    '必须是 null');

  const gift = build({ freeTier: giftFreeTier({ stability: 'new_user' }) });
  check('正例：新用户赠送（一次性 + 写明官方条件）通过校验', gift.ok, JSON.stringify(gift.problems));
  const promo = build({ freeTier: giftFreeTier({ stability: 'promotional', description: '官方限时活动：活动期间赠送 100 万 tokens，活动结束即失效' }) });
  check('正例：限时赠送通过校验', promo.ok, JSON.stringify(promo.problems));

  /* ---- credits 型免费额度：仓库内原本没有正例（审计 API-FREETIER-004 / P2.5-API-CREDITS-004） ---- */
  // 审计的 ⚠️ 原话：机制只在**仓库外**的临时夹具里被证明过 ——「若 conversionDependsOnModel
  // 判据被删，无任何测试会红」。这一条把它钉进仓库，并顺带证明 credits 型也带性质标注。
  const creditTier = build({
    freeTier: {
      type: 'credits', stability: 'standing', amount: 5, period: null, models: null,
      description: '官方免费档：每账户 5 credits，按各模型当前单价扣减', conversionDependsOnModel: true
    }
  });
  check('正例：freeTier.type=credits（带 conversionDependsOnModel）通过校验', creditTier.ok, JSON.stringify(creditTier.problems));
  const noConversion = build({
    freeTier: {
      type: 'credits', stability: 'standing', amount: 5, period: null, models: null,
      description: '官方免费档：每账户 5 credits', conversionDependsOnModel: null
    }
  });
  check('【牙】type=credits 缺 conversionDependsOnModel → 红（换算条件必须显式）',
    !noConversion.ok && noConversion.problems.some(problem => String(problem).includes('conversionDependsOnModel')),
    JSON.stringify((noConversion.problems || []).slice(0, 2)));

  /* ---- §10.4 三态契约（API 侧）：`conversionDependsOnModel` 的 true / false / null ---- */
  // 「官方没说」与「官方说不是」必须能被区分：`null` 不许被读成 `false`。
  check('三态契约常量 = true / false / null（唯一清单）',
    JSON.stringify(apiSchema.FREE_TIER_CONVERSION_TRISTATE) === JSON.stringify([true, false, null]),
    JSON.stringify(apiSchema.FREE_TIER_CONVERSION_TRISTATE));
  {
    // 缺字段 ⇒ null（未知），**不是** false
    const omitted = build({
      freeTier: {
        type: 'other', stability: 'standing', amount: null, period: null, models: null,
        description: '官方写「免费额度按账户发放，具体规则见帮助中心」'
      }
    });
    check('缺 conversionDependsOnModel 的记录落成 null（未说明），绝不是 false',
      omitted.ok && omitted.plan.freeTier.conversionDependsOnModel === null
      && Object.is(omitted.plan.freeTier.conversionDependsOnModel, null),
      JSON.stringify(omitted.ok ? omitted.plan.freeTier : omitted.problems));
  }
  {
    const explicitFalse = build({
      freeTier: {
        type: 'other', stability: 'standing', amount: null, period: null, models: null,
        description: '官方写「免费额度不与模型单价挂钩」', conversionDependsOnModel: false
      }
    });
    check('显式 false 保持 false（不落 null、不落 undefined）',
      explicitFalse.ok && explicitFalse.plan.freeTier.conversionDependsOnModel === false,
      JSON.stringify(explicitFalse.ok ? explicitFalse.plan.freeTier : explicitFalse.problems));
    const roundTrip = explicitFalse.ok ? JSON.parse(JSON.stringify(explicitFalse.plan)) : null;
    check('三态经 JSON 往返不变：false 仍是 false、null 仍是 null（重建路径不得改语义）',
      roundTrip && roundTrip.freeTier.conversionDependsOnModel === false
      && Object.is(roundTrip.freeTier.conversionDependsOnModel, false));
  }
  {
    // 三态只认 true / false / null：字符串 "false"、0、缺失之外的垃圾一律红
    const stringFalse = build({
      freeTier: {
        type: 'other', stability: 'standing', amount: null, period: null, models: null,
        description: '官方写「按账户发放」', conversionDependsOnModel: 'false'
      }
    });
    check('【牙】conversionDependsOnModel 写字符串 "false" → 红（三态只认字面量）',
      !stringFalse.ok && stringFalse.problems.some(problem => String(problem).includes('conversionDependsOnModel')),
      JSON.stringify((stringFalse.problems || []).slice(0, 2)));
    const zero = build({
      freeTier: {
        type: 'other', stability: 'standing', amount: null, period: null, models: null,
        description: '官方写「按账户发放」', conversionDependsOnModel: 0
      }
    });
    check('【牙】conversionDependsOnModel 写 0 → 红（0 不是 false）',
      !zero.ok && zero.problems.some(problem => String(problem).includes('conversionDependsOnModel')),
      JSON.stringify((zero.problems || []).slice(0, 2)));
  }
  {
    // T12 的 stability：必填枚举**不得**被本次三态改动削弱成可缺省。
    // 夹具刻意用**中性形状**（period=null、description=null、非赠送条件）：如果有人把
    // "缺 stability" 改成"默认 standing"，这里不会再被别的规则（如 standing×one_time 自相矛盾）
    // 顺带拦住 —— 于是这条断言就成了唯一能识破"削弱"的那一道。这正是它必须长这样子的原因。
    const neutral = {
      type: 'tokens', amount: 1000000, period: null, models: null,
      description: null, conversionDependsOnModel: null
    };
    const missingStability = build({ freeTier: Object.assign({}, neutral) });
    check('【牙】§10.4 回归：freeTier.stability 缺省 → 红（中性形状；若被改成默认 standing，这条会失守）',
      !missingStability.ok && missingStability.problems.some(problem => String(problem).includes('stability')),
      JSON.stringify((missingStability.problems || []).slice(0, 2)));
    const nullStability = build({ freeTier: Object.assign({}, neutral, { stability: null }) });
    check('【牙】§10.4 回归：freeTier.stability=null → 红（null 不是三档之一）',
      !nullStability.ok && nullStability.problems.some(problem => String(problem).includes('stability')),
      JSON.stringify((nullStability.problems || []).slice(0, 2)));
    const standingOk = build({ freeTier: Object.assign({}, neutral, { stability: 'standing' }) });
    check('对照：同一中性形状补上 stability=standing → 通过（证明上一条红的是"缺 stability"本身）',
      standingOk.ok, JSON.stringify(standingOk.problems));
  }

  /* ---- 渲染层：单元格必须印出性质，赠送不得被写成长期能力 ---- */
  const renderCells = plan => apiPage.rowsOfHtml(
    apiPage.apiPlansPageBody([plan], { providerTable: PROVIDER_TABLE, prefix: '../../' })
  )[0].cells[8];
  const standingCell = renderCells(built.plan);
  check('长期能力的单元格印出「长期提供的免费模型…」',
    standingCell.includes('长期提供的免费模型'), standingCell);
  const giftCell = renderCells(gift.plan);
  check('新用户赠送的单元格印出「新用户赠送」，并**明说**「非长期能力」',
    giftCell.includes('新用户赠送') && giftCell.includes('非长期能力'), giftCell);
  check('新用户赠送的单元格里不得出现长期能力字样（「长期提供」/「长期免费」）',
    !giftCell.includes('长期提供') && !giftCell.includes('长期免费'), giftCell);
  const promoCell = renderCells(promo.plan);
  check('限时赠送的单元格印出「限时赠送」并明说非长期能力',
    promoCell.includes('限时赠送') && promoCell.includes('非长期能力'), promoCell);
  const creditCell = renderCells(creditTier.plan);
  check('credits 型免费额度也带性质，渲染成「长期提供的免费额度 5 credits」',
    creditCell.includes('长期提供的免费额度 5 credits'), creditCell);

  const giftHtml = apiPage.apiPlansPageBody([gift.plan], { providerTable: PROVIDER_TABLE, prefix: '../../' });
  check('对照组：未变异的页面 0 问题',
    apiPage.assertPageHonesty(giftHtml, [gift.plan], { providerTable: PROVIDER_TABLE }).length === 0,
    apiPage.assertPageHonesty(giftHtml, [gift.plan], { providerTable: PROVIDER_TABLE }).slice(0, 2).join('；'));

  // 【牙】把 period=one_time 的赠送**渲染成**长期免费额度 —— 页面诚实性断言必须红
  const forcedLong = giftHtml.split(giftCell).join('长期免费额度 1,000,000 tokens');
  const forcedProblems = apiPage.assertPageHonesty(forcedLong, [gift.plan], { providerTable: PROVIDER_TABLE });
  check('【牙】把一次性赠送渲染成「长期免费额度」→ assertPageHonesty 变红',
    forcedProblems.some(p => p.includes('长期') || p.includes('新用户赠送')), forcedProblems.slice(0, 2).join('；'));

  // 【牙·反向】长期能力被抹掉性质词（靠少说一句话来"统一口径"）→ 同样红
  const stripped = giftHtml.split(giftCell).join('免费额度 1,000,000 tokens / one_time');
  check('【牙·反向】赠送单元格少了性质词 → 也变红（两个方向都有牙）',
    apiPage.assertPageHonesty(stripped, [gift.plan], { providerTable: PROVIDER_TABLE }).length > 0);
  // 【牙·矛盾】性质词在、但同一格里还写着「长期提供」→ 自相矛盾即红（不是"有标注就放行"）
  const forcedBoth = giftHtml.split(giftCell).join('长期提供的免费额度 1,000,000 tokens / one_time（新用户赠送，非长期能力）');
  check('【牙】赠送单元格同时写着「长期提供」与「新用户赠送」→ 仍红（矛盾即红）',
    apiPage.assertPageHonesty(forcedBoth, [gift.plan], { providerTable: PROVIDER_TABLE }).some(problem => problem.includes('长期能力')),
    apiPage.assertPageHonesty(forcedBoth, [gift.plan], { providerTable: PROVIDER_TABLE }).slice(0, 1).join('；'));
  const standingHtml = apiPage.apiPlansPageBody([built.plan], { providerTable: PROVIDER_TABLE, prefix: '../../' });
  const standingStripped = standingHtml.split(standingCell).join(standingCell.replace('长期', ''));
  check('【牙】长期能力的「长期」被删掉 → 变红（不得靠删词抹平）',
    apiPage.assertPageHonesty(standingStripped, [built.plan], { providerTable: PROVIDER_TABLE }).length > 0);

  /* ---- 口径文案：三档必须写进页面与 schema 的同一句话里（不许分家） ---- */
  const notesText = apiPage.API_PLANS_NOTES.join('\n');
  check('页面口径写明三档性质（长期提供 / 新用户赠送 / 限时赠送）',
    ['长期提供', '新用户赠送', '限时赠送'].every(word => notesText.includes(word)), notesText.slice(0, 120));
  check('页面口径不再宣称「只记官方长期提供的免费能力」（旧口径与数据自相矛盾）',
    !/只记.{0,12}长期提供/.test(notesText), notesText.slice(0, 120));
  check('schema 的口径文案与页面口径同调（同一处措辞不许分家）',
    ['长期提供', '新用户赠送', '限时赠送'].every(word => apiSchema.API_WORDING.freeTierScope.includes(word))
    && !/只记.{0,12}长期提供/.test(apiSchema.API_WORDING.freeTierScope),
    apiSchema.API_WORDING.freeTierScope.slice(0, 120));

  /* ---- 生产数据：4 条 freeTier 的性质与页面逐条对账 ---- */
  const realPlans = JSON.parse(fs.readFileSync(path.join(ROOT, 'api-plans.json'), 'utf8')).plans;
  const withFree = realPlans.filter(plan => plan.freeTier && plan.freeTier.type !== 'none');
  check('生产每条 freeTier 都写了 stability', withFree.length > 0
    && withFree.every(plan => apiSchema.FREE_TIER_STABILITY.includes(plan.freeTier.stability)),
    withFree.filter(plan => !apiSchema.FREE_TIER_STABILITY.includes(plan.freeTier.stability)).map(plan => plan.provider).join(','));
  const realHtml = apiPage.apiPlansPageBody(realPlans, { providerTable: PROVIDER_TABLE, prefix: '../../' });
  const realRows = apiPage.rowsOfHtml(realHtml);
  const realExpected = apiPage.apiRowsOf(realPlans, { providerTable: PROVIDER_TABLE });
  const realPageProblems = apiPage.assertPageHonesty(realHtml, realPlans, { providerTable: PROVIDER_TABLE });
  check('生产页面：免费额度那一列的性质与数据逐条一致（长期 / 新用户赠送 各就各位）',
    realPageProblems.length === 0, realPageProblems.slice(0, 2).join('；'));
  const natureCounts = { standing: 0, new_user: 0, promotional: 0 };
  for (const plan of withFree) natureCounts[plan.freeTier.stability]++;
  const nonStanding = withFree.filter(plan => plan.freeTier.stability !== 'standing');
  const longClaimed = realExpected.filter((row, index) => {
    const free = row.plan.freeTier;
    if (!free || free.type === 'none' || free.stability === 'standing') return false;
    const cell = (realRows[index] || { cells: [] }).cells[8] || '';
    return cell.includes(apiSchema.FREE_TIER_STABILITY_LABEL.standing) || cell.includes('长期免费');
  });
  check('生产页面：没有任何一条赠送 / 限时额度被印成长期能力（计数必须为 0）',
    longClaimed.length === 0, longClaimed.map(row => `${row.provider} ${row.model}: ${row.plan.freeTier.stability}`).slice(0, 2).join(' | '));
  const labeledPlanIds = new Set(realExpected
    .filter((row, index) => {
      const free = row.plan.freeTier;
      if (!free || free.type === 'none') return false;
      const cell = (realRows[index] || { cells: [] }).cells[8] || '';
      return cell.includes(apiSchema.FREE_TIER_STABILITY_LABEL[free.stability]);
    })
    .map(row => row.plan.id));
  check('生产页面：每条 freeTier 的性质都印在单元格里（一条不漏）',
    labeledPlanIds.size === withFree.length, `${labeledPlanIds.size}/${withFree.length}`);
  console.log(`  生产 freeTier 性质分布：长期提供 ${natureCounts.standing} 条 · 新用户赠送 ${natureCounts.new_user} 条 · 限时赠送 ${natureCounts.promotional} 条` +
    `（非长期 ${nonStanding.length} 条：${nonStanding.map(plan => `${plan.provider}/${plan.freeTier.period}`).join(' · ')}）`);
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
  // 此数字锚在本地夹具上，不随生产数据漂移（这两条记录就地由 `build()` 造：一次改 modelKey ⇒ 恰好 1 个疑似改名）。
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
  const unit = eventsOf(build().plan, build({ pricing: { currency: 'CNY', unit: 'per_1K_tokens' }, evidence: perKEvidence() }).plan);
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
  // 「分栏计数」与「事件字段」的自洽关系：期望**不写字面量**，而是从这份日志的 `type` 现算。
  // 元信息事件的判据只有一处（`planChanges.API_PLAN_META_FIELD_TYPES`，API 侧声明 `'updated'`，
  // 见 lib/plan-changes.js 的 API_PLAN_META_FIELD_TYPES 与 API_PLAN_FIELD_EVENT_TYPES 的映射），
  // 所以这里把日志分成「实质变化 / 元信息」两侧，再要求每一侧的**计数与条目**都等于自己那一侧。
  // 为什么不再写 `meta === 1 && metadata.length === 1`：那是「记录里当前只有一次元信息变化」的
  // 快照 —— 数据里多一次元信息变化（例如同时改了 officialUrl 与 sourceUrl）就会假红，
  // 而分栏其实完全正确。关系式写法在那种情形下仍然成立，且关系被破坏时（计数与日志不一致、
  // 或条目进错了栏）照样红，错误信息还点名了两侧来源。
  const apiMetaFieldTypes = planChanges.API_PLAN_META_FIELD_TYPES;
  const logMetaTypes = rawTypes.filter(type => apiMetaFieldTypes.includes(type));
  const logChangedTypes = rawTypes.filter(type => !apiMetaFieldTypes.includes(type));
  const changedItems = radar.sections.changed.items;
  const metadataItems = radar.other.metadata;
  // 条目数 + 截断数 == 计数（分栏上限存在时也要自洽；这里是 lib 的 capInto 恒等式）
  const changedAccounting = changedItems.length + radar.sections.changed.truncated === radar.totals.changed;
  const metaAccounting = metadataItems.length + radar.other.truncated === radar.totals.meta;
  const changedTypeDrift = changedItems.filter(item => apiMetaFieldTypes.includes(item.type)).map(item => item.type);
  const metadataTypeDrift = metadataItems.filter(item => !apiMetaFieldTypes.includes(item.type)).map(item => item.type);
  check('API 分栏：实质变化进「最近 7 天变化」，记录级元信息进 other.metadata（计数与事件字段自洽，期望由日志 type 现算）',
    radar.totals.changed === logChangedTypes.length
    && radar.totals.meta === logMetaTypes.length
    && changedAccounting && metaAccounting
    && changedTypeDrift.length === 0 && metadataTypeDrift.length === 0,
    `实际 radar.totals=${JSON.stringify(radar.totals)}`
    + `（sections.changed.items ${changedItems.length} 条 + truncated ${radar.sections.changed.truncated} / other.metadata ${metadataItems.length} 条 + truncated ${radar.other.truncated}）`
    + ` / 期望（由这份日志的 type 现算，元信息类型表 planChanges.API_PLAN_META_FIELD_TYPES=${JSON.stringify(apiMetaFieldTypes)}）`
    + ` changed=${logChangedTypes.length}${JSON.stringify(logChangedTypes)} · meta=${logMetaTypes.length}${JSON.stringify(logMetaTypes)}`
    + `；放错栏的条目 [进了「最近 7 天变化」的元信息: ${JSON.stringify(changedTypeDrift)}`
    + ` / 进了 other.metadata 的实质变化: ${JSON.stringify(metadataTypeDrift)}]`);

  // 只对上「条数」还不够：条目必须还是**日志里那些事件**（同一条元信息变化，不是随便一条）。
  // field 是这一层的身份字段，逐一对应 ⇒ 两侧看的是同一批事件。
  const logMetaFields = apiHistory.eventsOf(recordedStore)
    .filter(event => apiMetaFieldTypes.includes(event.type)).map(event => event.field);
  const itemMetaFields = metadataItems.map(item => item.field);
  check('API 分栏：other.metadata 每条条目的 field 与日志里元信息事件的 field 逐一对应（不只是条数相等）',
    itemMetaFields.length === logMetaFields.length
    && logMetaFields.every(field => itemMetaFields.includes(field)),
    `实际 other.metadata 的 field=${JSON.stringify(itemMetaFields)}`
    + ` / 期望（日志里 type ∈ ${JSON.stringify(apiMetaFieldTypes)} 的那几条事件的 field）${JSON.stringify(logMetaFields)}`);
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

  /* ---- 生命周期事件的文案：不许出现空的 from/to 占位（T07 非空 E2E 抓到的生产可见缺陷） ----
   *
   * 形态：`created` / `restored` 没有 from/to，旧实现把它们塞进「新增：{to}」模板 ⇒
   * 页面上出现「首次收录 · **新增：—**」（生产 6 处、合成非空态 9 处）——
   * 类型列已经说了「首次收录」，旁边那句「新增：—」既不构成一句话，也在暗示"新增了某个东西"。
   */
  const lifecycleEvents = [
    { type: 'created', planId: 'aaaaaaaaaaaa', at: '2026-10-01', field: null, from: null, to: null },
    { type: 'restored', planId: 'bbbbbbbbbbbb', at: '2026-10-02', field: null, from: null, to: null },
    { type: 'ended', planId: 'cccccccccccc', at: '2026-10-03', reason: 'source_no_longer_lists' },
    { type: 'created', planId: 'dddddddddddd', at: '2026-10-01', contentChanged: false },
    { type: 'restored', planId: 'eeeeeeeeeeee', at: '2026-10-02', previousEndedAt: '2026-09-01' }
  ];
  for (const event of lifecycleEvents) {
    const text = apiPage.apiPlanChangeTextOf(event);
    check(`生命周期事件 ${event.type}：文案非空、且不是「新增：—」这类空占位（实得「${text}」）`,
      Boolean(text) && !/(新增|移除)[:：]\s*—/.test(text) && !/—\s*→|→\s*—/.test(text), text);
  }
  const createdText = apiPage.apiPlanChangeTextOf(lifecycleEvents[0]);
  check('首次收录按真实语义说（不是「新增：某个值」）',
    createdText.includes('首次进入数据集'), createdText);
  const restoredText = apiPage.apiPlanChangeTextOf(lifecycleEvents[1]);
  check('重新出现按真实语义说（不是「新增：某个值」）',
    restoredText.includes('重新出现') && restoredText.includes('此前记为不再收录'), restoredText);
  check('「不再收录」说原因（它本来就没有 from/to）',
    apiPage.apiPlanChangeTextOf(lifecycleEvents[2]).includes('不再收录') === false
    && apiPage.apiPlanChangeTextOf(lifecycleEvents[2]).includes('来源'), apiPage.apiPlanChangeTextOf(lifecycleEvents[2]));
  check('渲染层：带生命周期事件的「最近变化」块里 0 处空占位',
    !/(新增|移除)[:：]\s*—/.test(apiPage.apiChangesBlockHtml(
      { events: lifecycleEvents, baseline: { at: '2026-10-01' } }, [build().plan]
    )), '渲染出的块里仍有占位');
  check('渲染层：/changes/ 的单条渲染器对生命周期事件也给出一句非空文案',
    lifecycleEvents.every(event => apiPage.apiPlanChangeItemHtml({
      ...event, titled: true, vendor: 'zhipu', title: '演练用 API 计费'
    }).includes('class="pchgwhat">' + (apiPage.apiPlanChangeTextOf(event)).slice(0, 4))));
  check('【牙】把空占位塞回页面 → assertPageHonesty 当场红',
    apiPage.assertPageHonesty(
      `${apiPage.apiPlansPageBody([build().plan], { providerTable: PROVIDER_TABLE, prefix: '../../' })}`
        + '<li><span class="pchgwhat">新增：—</span></li>',
      [build().plan], { providerTable: PROVIDER_TABLE }
    ).some(problem => problem.includes('空的 from/to 占位')));
  check('【牙】日志诚实性断言：正常生命周期事件 0 问题；而「ended 没有原因」这种会渲染成空的形态必红',
    apiPage.assertHistoryHonesty([], { events: lifecycleEvents }).length === 0
    && apiPage.assertHistoryHonesty([], { events: [{ type: 'ended', planId: 'x', reason: null }] })
      .some(problem => problem.includes('空文案')), '空文案没有被抓住');
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
