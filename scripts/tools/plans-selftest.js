#!/usr/bin/env node
/**
 * v2.1 Coding Plan 数据模型门禁演练（零依赖、离线、秒级）。
 *
 * 它演练的不是"代码跑得通"，而是**这套套餐契约赖以成立的那些承诺**：
 *
 *   · 不该算的绝不算：requests / credits / rate_limited / fair use 一律不产出 Token 单价；
 *   · 不猜：原价未知写 null（不是 0）；没有固定额度就不编一个数；查过但没说明写 "unknown"（不是 false）；
 *   · 身份稳定：同一套餐改价 / 改额度 / 换官方页**不得换 id**；同平台不同套餐必须是不同 id；
 *   · 派生不可手写：id 与 derivedMetrics 只能由 makePlan 算出来，手改会被逐字段比对抓出来；
 *   · 来源只认官方页：聚合站出处、超长引文、未来日期一律拒收；
 *   · 可重建：人工来源层 → plans.json 是确定性的（打乱输入顺序仍逐字节相同）；
 *   · 与 deals 不互相污染：引文层参数化之后，不传新参数的行为与 v1.3 逐字节相同。
 *
 * 判据标准与既有的 selftest 一致：**红的时候没有别的步骤会替它红**，所以它进 CI 门禁。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const planSchema = require('../lib/plan-schema');
const providers = require('../lib/providers');
const provenance = require('../lib/provenance');
const landing = require('../lib/landing');

let passed = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push({ name, detail });
    console.log(`  ✗ ${name}${detail ? ` —— ${detail}` : ''}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
}

const TODAY = '2026-10-01';
const OFFICIAL = 'https://docs.bigmodel.cn/cn/coding-plan/overview';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/** 一个合法的人工来源层条目：tokens 套餐，**能算出名义 Token 单价**（60 元 / 60 亿 tokens = 1 元每亿） */
function rawTokens(overrides = {}) {
  const base = {
    provider: '智谱AI',
    planName: 'Lite',
    officialUrl: OFFICIAL,
    source: 'Official-Docs',
    sourceUrl: OFFICIAL,
    region: 'cn',
    billing: { period: 'monthly', currency: 'CNY', regularPrice: 60, promoPrice: null, promoNote: null, note: null },
    quota: { type: 'tokens', amount: 6000000000, period: 'monthly', description: null, conversionDependsOnModel: null },
    supportedModels: null,
    restrictions: null,
    firstSeen: TODAY,
    lastSeen: TODAY,
    verified: true,
    verifiedAt: TODAY,
    evidence: [{ field: 'quota.amount', quote: '套餐每月 60 亿 Tokens', sourceUrl: OFFICIAL, capturedAt: TODAY, lang: 'zh' }]
  };
  return Object.assign(base, overrides);
}

function make(raw) {
  return planSchema.makePlan(raw, { today: TODAY });
}

function accepts(name, raw) {
  const result = make(raw);
  check(name, result.ok, result.ok ? '' : result.problems.join(' | ').slice(0, 220));
  return result.plan;
}

function rejects(name, raw, fragment = '') {
  const result = make(raw);
  if (result.ok) return check(name, false, '本应判红，却通过了');
  const text = result.problems.join(' | ');
  return check(name, !fragment || text.includes(fragment), `错误信息里没有「${fragment}」：${text.slice(0, 200)}`);
}

/* ================================================================== */

section('① 构造与身份（id 必须稳定）');

const tokensPlan = accepts('tokens 套餐能构造出合规记录', rawTokens());
check('id 是 12 位小写 hex', /^[0-9a-f]{12}$/.test(tokensPlan.id), tokensPlan.id);
check('derivedMetrics 永远存在且算出单价', JSON.stringify(tokensPlan.derivedMetrics)
  === JSON.stringify({ nominalUnitPrice: { price: 1, currency: 'CNY', per: 1e8, basis: 'monthly', priceField: 'regularPrice' } }),
  JSON.stringify(tokensPlan.derivedMetrics));

// T5：改价不改 id（价格不进 id basis）
const repriced = make(rawTokens({
  billing: { period: 'monthly', currency: 'CNY', regularPrice: 49, promoPrice: null, promoNote: null, note: null }
}));
check('【牙】T5 同一套餐改价（60 → 49）id 不变', repriced.ok && repriced.plan.id === tokensPlan.id,
  repriced.ok ? `${repriced.plan.id} vs ${tokensPlan.id}` : repriced.problems.join(' | '));

const requota = make(rawTokens({
  quota: { type: 'tokens', amount: 3000000000, period: 'monthly', description: null, conversionDependsOnModel: null }
}));
check('【牙】T5 同一套餐改额度（60 亿 → 30 亿）id 不变', requota.ok && requota.plan.id === tokensPlan.id, requota.ok ? requota.plan.id : '构造失败');

const reurl = make(rawTokens({ officialUrl: 'https://bigmodel.cn/pricing', sourceUrl: 'https://bigmodel.cn/pricing' }));
check('【牙】T5 换官方页 id 不变', reurl.ok && reurl.plan.id === tokensPlan.id, reurl.ok ? reurl.plan.id : reurl.problems.join(' | '));

const renamed = make(rawTokens({ planName: 'Pro' }));
check('同平台不同套餐必须是不同 id（改 planName）', renamed.ok && renamed.plan.id !== tokensPlan.id, renamed.ok ? renamed.plan.id : '构造失败');

const yearly = make(rawTokens({
  billing: { period: 'yearly', currency: 'CNY', regularPrice: 600, promoPrice: null, promoNote: null, note: null },
  quota: { type: 'tokens', amount: 6000000000, period: 'yearly', description: null, conversionDependsOnModel: null }
}));
check('计费周期进 id basis（月付与年付是两个可售 SKU）', yearly.ok && yearly.plan.id !== tokensPlan.id, yearly.ok ? yearly.plan.id : '构造失败');
check('年付的派生指标以年为基础（不做 12 个月的隐含换算）',
  yearly.ok && yearly.plan.derivedMetrics.nominalUnitPrice && yearly.plan.derivedMetrics.nominalUnitPrice.basis === 'yearly'
    && yearly.plan.derivedMetrics.nominalUnitPrice.price === 10,
  yearly.ok ? JSON.stringify(yearly.plan.derivedMetrics) : '构造失败');
check('额度周期与计费周期不一致时不产出单价',
  make(rawTokens({
    billing: { period: 'yearly', currency: 'CNY', regularPrice: 600, promoPrice: null, promoNote: null, note: null }
  })).plan.derivedMetrics.nominalUnitPrice === null);

// T4：同 provider + 同 planName + 同 period 的两条
{
  const { payload, problems } = planSchema.buildStore({ curated: [rawTokens(), rawTokens({ officialUrl: 'https://bigmodel.cn/pricing' })], today: TODAY });
  check('【牙】T4 同 provider + 同 planName + 同 period 两条被拒', problems.some(p => p.reason.includes('身份重复')),
    JSON.stringify(problems).slice(0, 220));
  // 刻意**不静默去重**：buildStore 把两条都留着并报错，由写盘前的门禁拒绝 ——
  // "悄悄丢掉一条"比"红"更坏。
  check('【牙】T4 不静默合并，但这份 payload 被写盘门禁拒绝', payload.count === 2 && !planSchema.validatePlansStore(payload).ok,
    `count=${payload.count} ok=${planSchema.validatePlansStore(payload).ok}`);
}

// T12：手改 id
{
  const edited = clone(tokensPlan);
  edited.id = 'ffffffffffff';
  const result = planSchema.validatePlan(edited, 0);
  check('【牙】T12 手改 id 被判红', !result.ok && result.errors.join(' ').includes('id'), result.errors.join(' | ').slice(0, 200));
}

/* ================================================================== */

section('② 派生指标：什么时候算、什么时候必须为 null');

const promoPlan = accepts('带活动价的 tokens 套餐', rawTokens({
  billing: { period: 'monthly', currency: 'CNY', regularPrice: 60, promoPrice: 30, promoNote: '首月 5 折', note: null }
}));
check('当前使用价格取活动价，并记录用的是哪一个',
  promoPlan.derivedMetrics.nominalUnitPrice.price === 0.5 && promoPlan.derivedMetrics.nominalUnitPrice.priceField === 'promoPrice',
  JSON.stringify(promoPlan.derivedMetrics));

const requestsPlan = accepts('requests 套餐', rawTokens({
  quota: { type: 'requests', amount: 500, period: 'monthly', description: null, conversionDependsOnModel: null },
  evidence: [{ field: 'quota.amount', quote: '每月 500 次请求', sourceUrl: OFFICIAL, capturedAt: TODAY, lang: 'zh' }]
}));
check('requests 套餐的 nominalUnitPrice 是 null', requestsPlan.derivedMetrics.nominalUnitPrice === null, JSON.stringify(requestsPlan.derivedMetrics));

const creditsPlan = accepts('credits 套餐（折算随模型倍率变化）', rawTokens({
  quota: { type: 'credits', amount: 2000, period: 'monthly', description: null, conversionDependsOnModel: true },
  evidence: [{ field: 'quota.amount', quote: '每月 2,000 积分', sourceUrl: OFFICIAL, capturedAt: TODAY, lang: 'zh' }]
}));
check('credits 套餐（conversionDependsOnModel=true）的 nominalUnitPrice 是 null',
  creditsPlan.derivedMetrics.nominalUnitPrice === null, JSON.stringify(creditsPlan.derivedMetrics));

const ratePlan = accepts('rate_limited 套餐', rawTokens({
  quota: { type: 'rate_limited', amount: null, period: 'rolling', description: '每 5 小时刷新', conversionDependsOnModel: null },
  evidence: [{ field: 'quota.description', quote: '每 5 小时刷新', sourceUrl: OFFICIAL, capturedAt: TODAY, lang: 'zh' }]
}));
check('rate_limited 套餐的 nominalUnitPrice 是 null', ratePlan.derivedMetrics.nominalUnitPrice === null, JSON.stringify(ratePlan.derivedMetrics));

// T1：给 requests 套餐硬塞一个 Token 单价
{
  const evil = clone(requestsPlan);
  evil.derivedMetrics = { nominalUnitPrice: { price: 0.5, currency: 'CNY', per: 1e8, basis: 'monthly', priceField: 'regularPrice' } };
  const result = planSchema.validatePlan(evil, 0);
  check('【牙】T1 requests 套餐被强行生成 Token 单价 → 判红',
    !result.ok && result.errors.join(' ').includes('derivedMetrics'), result.errors.join(' | ').slice(0, 220));
}
// T1 的另一个方向：手算错值
{
  const evil = clone(tokensPlan);
  evil.derivedMetrics = { nominalUnitPrice: { price: 1.5, currency: 'CNY', per: 1e8, basis: 'monthly', priceField: 'regularPrice' } };
  const result = planSchema.validatePlan(evil, 0);
  check('【牙】T1 手算错的 Token 单价 → 判红', !result.ok, result.errors.join(' | ').slice(0, 200));
}

// 不可比较的几种情形
{
  const cases = [
    ['额度周期未标注', rawTokens({ quota: { type: 'tokens', amount: 6e9, period: null, description: null, conversionDependsOnModel: null } })],
    ['额度周期与计费周期不一致', rawTokens({ quota: { type: 'tokens', amount: 6e9, period: 'weekly', description: null, conversionDependsOnModel: null } })],
    ['计费周期不可比较(usage_based)', rawTokens({ billing: { period: 'usage_based', currency: 'CNY', regularPrice: 60, promoPrice: null, promoNote: null, note: null } })],
    ['当前使用价格不明确', rawTokens({ billing: { period: 'monthly', currency: null, regularPrice: null, promoPrice: null, promoNote: null, note: null } })]
  ];
  for (const [label, raw] of cases) {
    const result = make(raw);
    const metric = result.ok ? result.plan.derivedMetrics.nominalUnitPrice : '构造失败';
    check(`不可比较时该值为 null（${label}）`, metric === null, JSON.stringify(metric));
  }
}

// T8：tokens 上写 conversionDependsOnModel
rejects('【牙】T8 tokens 套餐写 conversionDependsOnModel → 判红', rawTokens({
  quota: { type: 'tokens', amount: 6e9, period: 'monthly', description: null, conversionDependsOnModel: true }
}), 'conversionDependsOnModel');
rejects('credits 套餐没有明确 conversionDependsOnModel → 判红', rawTokens({
  quota: { type: 'credits', amount: 2000, period: 'monthly', description: null, conversionDependsOnModel: null }
}), 'conversionDependsOnModel');

/* ================================================================== */

section('③ 价格模型：原价未知写 null，不写 0');

// T3 / T6
rejects('【牙】T3 regularPrice=0 + promoPrice=49 → 判红（原价未知不能用 0 占位）', rawTokens({
  billing: { period: 'monthly', currency: 'CNY', regularPrice: 0, promoPrice: 49, promoNote: null, note: null }
}), 'regularPrice');
rejects('【牙】T6 promoPrice > regularPrice → 判红', rawTokens({
  billing: { period: 'monthly', currency: 'CNY', regularPrice: 49, promoPrice: 68, promoNote: null, note: null }
}), 'regularPrice');

const onlyPromo = accepts('只有活动价、原价确实不知道 → regularPrice=null 合法', rawTokens({
  billing: { period: 'monthly', currency: 'CNY', regularPrice: null, promoPrice: 49, promoNote: '首月优惠', note: null }
}));
check('只有活动价时依然没有 Token 单价（原价未知，按活动价算也不越界）',
  onlyPromo.derivedMetrics.nominalUnitPrice !== null && onlyPromo.derivedMetrics.nominalUnitPrice.priceField === 'promoPrice',
  JSON.stringify(onlyPromo.derivedMetrics));

accepts('确实免费的套餐写 regularPrice=0 是合法的', rawTokens({
  billing: { period: 'monthly', currency: 'CNY', regularPrice: 0, promoPrice: null, promoNote: null, note: null }
}));
rejects('两个价格都是 null 却写了币种 → 判红', rawTokens({
  billing: { period: 'monthly', currency: 'CNY', regularPrice: null, promoPrice: null, promoNote: null, note: null }
}), 'currency');
accepts('两个价格都是 null 且币种也是 null → 合法（价格未知）', rawTokens({
  billing: { period: 'monthly', currency: null, regularPrice: null, promoPrice: null, promoNote: null, note: null }
}));
rejects('非法币种 RMB → 判红', rawTokens({
  billing: { period: 'monthly', currency: 'RMB', regularPrice: 60, promoPrice: null, promoNote: null, note: null }
}), 'currency');
rejects('负价 → 判红', rawTokens({
  billing: { period: 'monthly', currency: 'CNY', regularPrice: -1, promoPrice: null, promoNote: null, note: null }
}), 'regularPrice');
rejects('非法计费周期 → 判红', rawTokens({
  billing: { period: 'quarterly', currency: 'CNY', regularPrice: 60, promoPrice: null, promoNote: null, note: null }
}), 'billing.period');

/* ================================================================== */

section('④ 额度模型：不把限速/积分伪装成 Token');

// T2 / T9
rejects('【牙】T2 rate_limited 写了 amount → 判红', rawTokens({
  quota: { type: 'rate_limited', amount: 500, period: 'rolling', description: '每 5 小时刷新', conversionDependsOnModel: null }
}), '不允许 amount');
rejects('unlimited_fair_use 写了 amount → 判红', rawTokens({
  quota: { type: 'unlimited_fair_use', amount: 1000, period: null, description: '公平使用', conversionDependsOnModel: null }
}), '不允许 amount');
rejects('requests 没写 amount → 判红', rawTokens({
  quota: { type: 'requests', amount: null, period: 'monthly', description: null, conversionDependsOnModel: null }
}), '必须给出正数 amount');
rejects('tokens 的 amount=0 → 判红', rawTokens({
  quota: { type: 'tokens', amount: 0, period: 'monthly', description: null, conversionDependsOnModel: null }
}), 'quota.amount');
rejects('rate_limited 没写 description → 判红', rawTokens({
  quota: { type: 'rate_limited', amount: null, period: 'rolling', description: null, conversionDependsOnModel: null }
}), 'description');
rejects('other 没写 description → 判红', rawTokens({
  quota: { type: 'other', amount: null, period: null, description: null, conversionDependsOnModel: null }
}), 'description');
rejects('quota.type 拼错（token）→ 判红', rawTokens({
  quota: { type: 'token', amount: 6e9, period: 'monthly', description: null, conversionDependsOnModel: null }
}), 'quota.type');
rejects('【牙】T9 supportedModels 是空数组 → 判红', rawTokens({ supportedModels: [] }), 'supportedModels');
rejects('【牙】T9 restrictions 是空数组 → 判红', rawTokens({ restrictions: [] }), 'restrictions');
rejects('supportedModels 里同名重复 → 判红', rawTokens({
  supportedModels: [{ name: 'GLM-5.3', role: 'included', note: null }, { name: 'glm-5.3', role: 'included', note: null }]
}), '重复');
rejects('supportedModels 的 role 非法 → 判红', rawTokens({ supportedModels: [{ name: 'GLM-5.3', role: 'best', note: null }] }), 'role');
accepts('模型族与动态池用 role 表达（family / pool）', rawTokens({
  supportedModels: [{ name: 'GLM 系列', role: 'family', note: null }, { name: '动态模型池', role: 'pool', note: '平台未公布固定清单' }]
}));

/* ================================================================== */

section('⑤ 限制条件：三态不混（unknown 不是 false）');

// T10
rejects('【牙】T10 三态写 0 → 判红', rawTokens({
  restrictions: [{ kind: 'new_user_only', value: 0, note: null }]
}), 'new_user_only');
rejects('【牙】T10 三态写字符串 "true" → 判红', rawTokens({
  restrictions: [{ kind: 'new_user_only', value: 'true', note: null }]
}), 'new_user_only');
rejects('【牙】T10 value="unknown" 却没写 note → 判红', rawTokens({
  restrictions: [{ kind: 'new_user_only', value: 'unknown', note: null }]
}), 'note');
accepts('value="unknown" 且写了 note → 合法（查过但来源没说明）', rawTokens({
  restrictions: [{ kind: 'new_user_only', value: 'unknown', note: '官方页面未说明领取资格' }]
}));
accepts('value=false → 合法（来源明说"不是"）', rawTokens({
  restrictions: [{ kind: 'account_required', value: false, note: null }]
}));
rejects('同一 kind 写两条 → 判红', rawTokens({
  restrictions: [{ kind: 'invite_only', value: true, note: null }, { kind: 'invite_only', value: false, note: null }]
}), '重复');
rejects('concurrency 写字符串 → 判红', rawTokens({
  restrictions: [{ kind: 'concurrency', value: '2', note: null }]
}), 'concurrency');
rejects('restrictions 的 kind 非法 → 判红', rawTokens({
  restrictions: [{ kind: 'seats', value: 2, note: null }]
}), 'kind');
accepts('rolling_window 用文本表达窗口 → 合法', rawTokens({
  restrictions: [{ kind: 'rolling_window', value: '每 5 小时 + 每周', note: null }]
}));

/* ================================================================== */

section('⑥ 来源与证据：只认官方页');

// T11
rejects('【牙】T11 evidence 全部来自聚合站 → 归一后没有引文 → 判红', rawTokens({
  evidence: [{ field: 'quota.amount', quote: '每月 60 亿 Tokens', sourceUrl: 'https://layer3labs.io/ai-discounts', capturedAt: TODAY, lang: 'zh' }]
}), 'evidence');
rejects('evidence quote 超过 200 字 → 拒收 → 判红', rawTokens({
  evidence: [{ field: 'quota.amount', quote: '长'.repeat(201), sourceUrl: OFFICIAL, capturedAt: TODAY, lang: 'zh' }]
}), 'evidence');
rejects('evidence capturedAt 是未来日期 → 拒收 → 判红', rawTokens({
  evidence: [{ field: 'quota.amount', quote: '每月 60 亿 Tokens', sourceUrl: OFFICIAL, capturedAt: '2099-01-01', lang: 'zh' }]
}), 'evidence');
rejects('evidence 完全缺失 → 判红', rawTokens({ evidence: undefined }), 'evidence');
rejects('evidence.field 不在 plans 白名单（deals 的 discountInfo）→ 拒收 → 判红', rawTokens({
  evidence: [{ field: 'discountInfo', quote: '每月 60 亿 Tokens', sourceUrl: OFFICIAL, capturedAt: TODAY, lang: 'zh' }]
}), 'evidence');
rejects('officialUrl 指向聚合站 → 判红', rawTokens({ officialUrl: 'https://futuretools.io/tools/glm', sourceUrl: 'https://futuretools.io/tools/glm' }), '聚合站');
rejects('officialUrl 带追踪参数 → 判红（不静默清洗）', rawTokens({ officialUrl: `${OFFICIAL}?utm_source=x`, sourceUrl: `${OFFICIAL}?utm_source=x` }), '规范形态');
rejects('source 未登记（ThirdParty）→ 判红', rawTokens({ source: 'ThirdParty' }), 'source');
accepts('source=Official-Pricing 合法', rawTokens({ source: 'Official-Pricing' }));
rejects('manualApplication 之类的 deals 字段出现在 plans 里 → 判红（未知字段）', rawTokens({ claimRequirements: { accountRequired: true } }), '未知字段');

/* ================================================================== */

section('⑦ Provider 归一：未登记一律红，两边 slug 不许分家');

// T7
{
  const table = providers.load().table;
  const sameKey = ['智谱AI', 'zhipu', 'ZHIPU', ' 智谱AI '].map(raw => {
    const resolved = providers.resolveProvider(raw, table);
    return resolved ? resolved.key : null;
  });
  check('同一平台的多种写法落到同一个 key', new Set(sameKey).size === 1 && sameKey[0] === 'zhipu', JSON.stringify(sameKey));
  check('未登记的平台返回 null（不许原样放行）', providers.resolveProvider('OpenAI', table) === null);
  check('未登记时给出建议 key', providers.suggestProviderSlug('OpenAI') === 'openai', providers.suggestProviderSlug('OpenAI'));
  rejects('未登记的 provider → 判红并给出建议 key',
    rawTokens({ provider: 'OpenAI' }), '未在 providers.json 登记');
}
{
  const problems = providers.validateProviderTable(providers.load().table);
  check('真实的 providers.json 自身合法', problems.length === 0, problems.join(' | '));
  check('真实 provider 表与 vendor-slugs.json 的 slug 一致',
    providers.validateSlugAgreement(providers.load().table, providers.loadVendorSlugs()).length === 0);

  const bad1 = { BadKey: { name: 'x', slug: 'x', aliases: ['x'], logo: null } };
  check('key 非法 → 报红', providers.validateProviderTable(bad1).some(p => p.includes('key')));
  const bad2 = { ok: { name: 'x', slug: 'Bad_Slug', aliases: ['ok'], logo: null } };
  check('slug 非法 → 报红', providers.validateProviderTable(bad2).some(p => p.includes('slug')));
  const bad3 = { a: { name: 'n', slug: 'dup', aliases: ['a'], logo: null }, b: { name: 'm', slug: 'dup', aliases: ['b'], logo: null } };
  check('slug 重复 → 报红', providers.validateProviderTable(bad3).some(p => p.includes('重复')));
  const bad4 = { a: { name: 'n', slug: 'a', aliases: ['Full Width'], logo: null } };
  check('alias 不是归一形态 → 报红', providers.validateProviderTable(bad4).some(p => p.includes('归一形态')));
  const bad5 = { a: { name: 'n', slug: 'a', aliases: ['same'], logo: null }, b: { name: 'm', slug: 'b', aliases: ['same'], logo: null } };
  check('alias 冲突 → 报红', providers.validateProviderTable(bad5).some(p => p.includes('已被')));
  const clash = { zhipu: { name: '智谱AI', slug: 'zhipu-wrong', aliases: ['zhipu'], logo: null } };
  check('与 vendor-slugs.json 的 slug 分家 → 报红',
    providers.validateSlugAgreement(clash, providers.loadVendorSlugs()).some(p => p.includes('两个 slug')));
  check('两边的 slug 形状判据逐字相同', String(providers.SLUG_RE) === String(landing.SLUG_RE),
    `${providers.SLUG_RE} vs ${landing.SLUG_RE}`);
}

/* ================================================================== */

section('⑧ 日期、顶层形状与数据集级判据');

rejects('verified 非 true → 判红', rawTokens({ verified: false }), 'verified');
rejects('firstSeen 晚于 lastSeen → 判红', rawTokens({ firstSeen: '2026-10-02' }), 'firstSeen');
// verifiedAt 晚于 lastSeen：把 lastSeen 往前挪，避免同时踩到「未来日期」那条判据
rejects('verifiedAt 晚于 lastSeen → 判红', rawTokens({ firstSeen: '2026-09-30', lastSeen: '2026-09-30', verifiedAt: '2026-10-01' }), 'verifiedAt');
{
  const future = planSchema.makePlan(rawTokens({ lastSeen: '2099-01-01', firstSeen: '2099-01-01', verifiedAt: '2099-01-01' }), { today: TODAY });
  check('lastSeen 是未来日期 → 判红', !future.ok && future.problems.join(' ').includes('未来'), future.problems.join(' | ').slice(0, 160));
}
rejects('firstSeen 没有 4 位年份 → 判红', rawTokens({ firstSeen: '10-01' }), 'firstSeen');
rejects('planName 不是规范形态（前后空格）→ 判红', rawTokens({ planName: ' Lite ' }), 'planName');
rejects('planName 超长 → 判红（不静默截断）', rawTokens({ planName: 'x'.repeat(81) }), 'planName');
rejects('billing.note 超长 → 判红（不静默截断）', rawTokens({
  billing: { period: 'monthly', currency: 'CNY', regularPrice: 60, promoPrice: null, promoNote: null, note: 'n'.repeat(201) }
}), 'billing.note');
rejects('人工来源层里写 id → 判红（派生字段不是输入）', rawTokens({ id: 'aaaaaaaaaaaa' }), 'id');
rejects('人工来源层里写 derivedMetrics → 判红', rawTokens({
  derivedMetrics: { nominalUnitPrice: { price: 1, currency: 'CNY', per: 1e8, basis: 'monthly', priceField: 'regularPrice' } }
}), 'derivedMetrics');

{
  // T13：updatedAt 不是 lastSeen 的最大值
  const { payload } = planSchema.buildStore({ curated: [rawTokens()], today: TODAY });
  const tampered = clone(payload);
  tampered.updatedAt = '2026-10-02T00:00:00+08:00';
  const result = planSchema.validatePlansStore(tampered);
  check('【牙】T13 updatedAt 不等于 lastSeen 的最大值 → 判红',
    !result.ok && result.errors.join(' ').includes('updatedAt'), result.errors.join(' | ').slice(0, 200));

  const badCount = clone(payload);
  badCount.count = 2;
  check('count 与 plans 长度不一致 → 判红', !planSchema.validatePlansStore(badCount).ok);

  const badVersion = clone(payload);
  badVersion.schemaVersion = 2;
  check('schemaVersion 不是 1 → 判红', !planSchema.validatePlansStore(badVersion).ok);

  const shuffled = clone(payload);
  shuffled.plans = [shuffled.plans[0], clone(shuffled.plans[0])];
  shuffled.count = 2;
  check('重复 id / 重复身份 → 判红', !planSchema.validatePlansStore(shuffled).ok);

  // 顺序不是规范序
  const two = planSchema.buildStore({ curated: [rawTokens(), rawTokens({ planName: 'Pro', provider: 'Trae' })], today: TODAY });
  const reversed = clone(two.payload);
  reversed.plans = reversed.plans.reverse();
  check('记录顺序不是规范序 → 判红', !planSchema.validatePlansStore(reversed).ok,
    planSchema.validatePlansStore(reversed).errors.join(' | ').slice(0, 160));
}

// T14：输入顺序不影响产出字节
{
  const a = planSchema.buildStore({ curated: [rawTokens(), rawTokens({ planName: 'Pro' })], today: TODAY });
  const b = planSchema.buildStore({ curated: [rawTokens({ planName: 'Pro' }), rawTokens()], today: TODAY });
  check('【牙】T14 打乱人工输入顺序 → 产出逐字节相同',
    JSON.stringify(a.payload) === JSON.stringify(b.payload),
    JSON.stringify(a.payload).slice(0, 120));
}

/* ================================================================== */

section('⑨ 与 deals 的引文层不互相污染（参数化回归）');

// T15
{
  const dealEvidence = [{ field: 'discountInfo', quote: 'Save 50% now', sourceUrl: 'https://example.com/a', capturedAt: TODAY }];
  const withDefault = provenance.normalizeEvidence(dealEvidence, { today: TODAY });
  const withExplicit = provenance.normalizeEvidence(dealEvidence, { today: TODAY, fields: provenance.EVIDENCE_FIELDS });
  check('【牙】T15 不传 fields 时 deals 引文仍被接受', Array.isArray(withDefault) && withDefault.length === 1, JSON.stringify(withDefault));
  check('【牙】T15 显式传入 deals 白名单与默认行为逐字节相同',
    JSON.stringify(withDefault) === JSON.stringify(withExplicit));
  check('【牙】T15 deals 的 discountInfo 在 plans 白名单里被拒',
    provenance.normalizeEvidence(dealEvidence, { today: TODAY, fields: planSchema.PLANS_EVIDENCE_FIELDS }) === null);
  const planEvidence = [{ field: 'quota.amount', quote: '每月 60 亿 Tokens', sourceUrl: OFFICIAL, capturedAt: TODAY }];
  check('【牙】T15 plans 字段在 plans 白名单里被接受',
    Array.isArray(provenance.normalizeEvidence(planEvidence, { today: TODAY, fields: planSchema.PLANS_EVIDENCE_FIELDS })));
  check('【牙】T15 plans 字段在 deals 白名单里被拒（两个数据集不共享字段空间）',
    provenance.normalizeEvidence(planEvidence, { today: TODAY }) === null);
  const audit = provenance.auditEvidence([{ field: 'nope', quote: 'q', sourceUrl: OFFICIAL, capturedAt: TODAY }], null,
    { today: TODAY, fields: planSchema.PLANS_EVIDENCE_FIELDS });
  check('【牙】T15 入口对账用的是同一个白名单', audit.length === 1 && audit[0].reason.includes('quota.amount'), JSON.stringify(audit));
}

/* ================================================================== */

section('⑩ 真实数据不变量');

{
  const store = planSchema.loadPlans(planSchema.PLANS_FILE);
  const result = planSchema.validatePlansStore(store);
  check(`真实的 plans.json 通过数据集级校验（${store.count} 条）`, result.ok, result.errors.slice(0, 5).join(' | '));

  const stats = planSchema.summarize(store);
  check('条目数在 5–10 之间（题面 §十三：先建立小而可靠的数据集）',
    stats.total >= 5 && stats.total <= 10, String(stats.total));
  check('每一条都有官方引文', stats.evidenceItems >= stats.total, `${stats.evidenceItems} / ${stats.total}`);
  check('每条记录的 provider 都能在 providers.json 里反查到',
    store.plans.every(plan => providers.resolveProvider(plan.provider) && providers.resolveProvider(plan.provider).key === plan.provider));
  check('每条记录的 evidence 出处都不是聚合站',
    store.plans.every(plan => plan.evidence.every(item => !provenance.isAggregatorUrl(item.sourceUrl))));
  check('**不可比较的额度类型一律没有 Token 单价**（本阶段的核心不变量）',
    store.plans.filter(plan => plan.quota.type !== 'tokens')
      .every(plan => plan.derivedMetrics.nominalUnitPrice === null));
  check('非 null 的 Token 单价只可能出现在 tokens 类型上',
    store.plans.filter(plan => plan.derivedMetrics.nominalUnitPrice !== null)
      .every(plan => plan.quota.type === 'tokens'));
  check('计划名都已登记 provider 的规范 key（不是原始别名）',
    store.plans.every(plan => providers.load().table[plan.provider] !== undefined));

  // 与 check-plans-reproducible 同一条判据：盘上那份必须等于来源层产出的那份
  const reb = planSchema.loadCuratedPlans();
  check('人工来源层本身没有问题', reb.problems.length === 0 && reb.evidenceDropped.length === 0,
    JSON.stringify([...reb.problems, ...reb.evidenceDropped]).slice(0, 220));
  check('plans.json 与 curated_plans.json 的产出逐字节一致',
    `${JSON.stringify(reb.payload, null, 2)}\n` === fs.readFileSync(planSchema.PLANS_FILE, 'utf8'));

  console.log(`  · 统计：${stats.total} 条 / ${stats.providers} 个平台 · 额度类型 ${JSON.stringify(stats.byQuotaType)}`);
  console.log(`  · 名义 Token 单价：可计算 ${stats.computable} 条 · 不可计算 ${stats.total - stats.computable} 条（按额度类型 ${JSON.stringify(stats.notComputableByQuotaType)}）`);
  console.log(`  · 原价留空(null) ${stats.priceUnknown} 条 · 有活动价 ${stats.withPromo} 条 · 官方引文 ${stats.evidenceItems} 条`);
}

/* ================================================================== */

section('⑪ 边界：谁可以引用 plans，谁不可以');

{
  // v2.1 第二段起，**构建期**合法地引用了 plans（`/plans/coding/` 就是它渲染的），
  // 但这不等于「哪里都可以引用」。这条断言把边界写死成两句话：
  //   ① 采集 / 合并 / 历史 / 变化 / 订阅这条 deals 链路**一个字都不许提 plans** ——
  //      套餐数据不参与优惠采集，也不进任何 Feed；
  //   ② 前端 `index.html` 只允许出现一个页脚占位符（`__PLANS_HREF__`），
  //      不许直接读 plans.json —— 页面由构建期预渲染，浏览器不 fetch 套餐数据。
  const stripComments = source => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const forbiddenTokens = ['plans.json', 'plan-schema', 'curated_plans', 'plans-page', 'providers.json'];

  const dealsChain = [
    'scripts/collect.js', 'scripts/lib/store.js', 'scripts/lib/dedup.js', 'scripts/lib/history.js',
    'scripts/lib/changes.js', 'scripts/lib/feeds.js', 'scripts/lib/seo.js', 'scripts/lib/landing.js'
  ];
  const chainHits = [];
  for (const rel of dealsChain) {
    const source = stripComments(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
    for (const token of forbiddenTokens) if (source.includes(token)) chainHits.push(`${rel} 提到了 ${token}`);
  }
  check('采集 / 合并 / 历史 / 变化 / 订阅链路完全不引用 plans', chainHits.length === 0, chainHits.join(' | '));

  const indexSource = stripComments(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
  check('前端 index.html 只用页脚占位符引用套餐页（不直接读 plans.json）',
    indexSource.includes('__PLANS_HREF__') &&
    !indexSource.includes('plans.json') && !indexSource.includes('curated_plans') &&
    (indexSource.match(/__PLANS_HREF__/g) || []).length === 1,
    `占位符 ${(indexSource.match(/__PLANS_HREF__/g) || []).length} 个`);

  // 正向：构建期**必须**引用它，否则上面那些"不许引用"的断言会因为"整条线根本不存在"而假绿
  const buildSource = stripComments(fs.readFileSync(path.join(ROOT, 'scripts/tools/build-local.js'), 'utf8'));
  check('构建期确实接进了套餐页（占位符 → 路由 → 页面）',
    buildSource.includes('__PLANS_HREF__') && buildSource.includes('plansPage.PLANS_ROUTE') &&
    /PUBLIC_FILES\s*=\s*\[[^\]]*'plans\.json'/.test(buildSource),
    '占位符 / 路由 / PUBLIC_FILES 三者缺一不可');
}

/* ================================================================== */

section('⑫ 套餐页：页面上的数字必须是数据里的数字');

{
  const store = planSchema.loadPlans(planSchema.PLANS_FILE);
  const plans = store.plans;
  const page = require('../lib/plans-page');
  const html = page.plansPageBody(plans);

  check('页面级诚实性断言全部通过（行数 / 口径文案 / 结论性词汇 / 数值列逐格比对）',
    page.assertPageHonesty(html, plans).length === 0, page.assertPageHonesty(html, plans).slice(0, 3).join(' | '));
  check('数据层也不含结论性词汇（套餐名 / 备注 / 额度口径）',
    page.assertDataHonesty(plans).length === 0, page.assertDataHonesty(plans).join(' | '));
  check('行数 == 套餐数', page.rowHtmlById(html).size === plans.length, `${page.rowHtmlById(html).size} vs ${plans.length}`);
  check('页面上有且只有一个 <h1>', (html.match(/<h1>/g) || []).length === 1);
  check('口径文案在位', html.includes('不代表不同模型 Token 的实际价值相同'));

  // 深度：两层路由必须用 `../../` 回站根。构建期 SEO 的内链存在性检查抓到过一次
  // 「`../` 指向 /plans/」的 404 —— 这一条把它钉住，免得再犯。
  check('回站根用的是 ../../（两层路由的深度）', html.includes(`href="${page.PLANS_HOME_HREF}"`) && page.PLANS_HOME_HREF === '../../',
    page.PLANS_HOME_HREF);

  // 「未知」与「免费」必须长得不一样 —— 成对断言
  const rows = page.plansRows(plans);
  const unknownRegular = rows.filter(row => row.regularValue === null);
  const freeRegular = rows.filter(row => row.regularValue === 0);
  check('原价未知的行显示「未标注」', unknownRegular.length > 0 && unknownRegular.every(row => row.regularText === page.UNKNOWN_TEXT),
    unknownRegular.map(row => `${row.planName}=${row.regularText}`).join(' '));
  check('确实免费的行显示带 0 的价格（不是「未标注」）',
    freeRegular.length > 0 && freeRegular.every(row => /0/.test(row.regularText)),
    freeRegular.map(row => `${row.planName}=${row.regularText}`).join(' '));
  check('没有活动价的行显示「—」', rows.every(row => row.promoValue !== null || row.promoText === page.UNKNOWN_NUM));
  check('算不出 Token 单价的行显示「—」',
    rows.every(row => row.unitPriceComputable || row.unitPriceText === page.UNKNOWN_NUM));

  // JSON-LD：三段，且 ItemList 条数 == 行数 == 链接到官方页
  const ld = page.plansJsonLd(plans, { siteUrl: 'https://example.com/' });
  check('JSON-LD 是 CollectionPage + BreadcrumbList + ItemList',
    JSON.stringify(ld.map(block => block['@type'])) === JSON.stringify(['CollectionPage', 'BreadcrumbList', 'ItemList']),
    ld.map(block => block['@type']).join(', '));
  const list = ld[2];
  check('ItemList 声明数 == 元素数 == 套餐数',
    list.numberOfItems === list.itemListElement.length && list.numberOfItems === plans.length,
    `${list.numberOfItems} / ${list.itemListElement.length} / ${plans.length}`);
  check('ItemList 每一条指向该套餐的官方页（不伪造站内详情页）',
    list.itemListElement.every((item, index) => item.url === plans[index].officialUrl));

  // 【牙】渲染层的 fail-closed：即使有人绕过校验器塞进一个单价，非 tokens 的额度也不许显示数字
  {
    const forged = JSON.parse(JSON.stringify(plans.find(plan => plan.quota.type === 'requests')
      || plans.find(plan => plan.quota.type !== 'tokens')));
    forged.derivedMetrics = { nominalUnitPrice: { price: 0.0248, currency: 'CNY', per: 1e8, basis: 'monthly', priceField: 'regularPrice' } };
    const row = page.planRowOf(forged);
    check('【牙】非 tokens 的额度即使数据里带了单价也不显示数字（渲染层 fail-closed）',
      row.unitPriceComputable === false && row.unitPriceText === page.UNKNOWN_NUM,
      `${forged.quota.type} → ${row.unitPriceText}`);
  }

  // 【牙】页面断言真的会红：把一行的价格改成 0（未知却像 0）必须被抓出来
  {
    const broken = html.replace(/未标注/g, '¥0');
    check('【牙】把「未标注」改成 ¥0 → 页面断言必须变红',
      page.assertPageHonesty(broken, plans).length > 0,
      page.assertPageHonesty(broken, plans).slice(0, 2).join(' | '));
  }
  // 【牙】把口径文案删掉 → 必须变红
  {
    const broken = html.replace(/不代表不同模型 Token 的实际价值相同/g, '');
    check('【牙】删掉口径文案 → 页面断言必须变红',
      page.assertPageHonesty(broken, plans).some(problem => problem.includes('口径')),
      page.assertPageHonesty(broken, plans).slice(0, 2).join(' | '));
  }
  // 【牙】往数据里塞一个结论性词汇 → 数据层断言必须变红
  {
    const tampered = JSON.parse(JSON.stringify(plans));
    tampered[0].billing.note = '本平台性价比最高';
    check('【牙】数据里出现「性价比」→ 数据层断言必须变红',
      page.assertDataHonesty(tampered).some(problem => problem.includes('性价比')),
      page.assertDataHonesty(tampered).join(' | '));
  }
}

/* ================================================================== */

const summary = `=== v2.1 Coding Plan 数据模型演练：${passed} 项通过，${failures.length} 项失败 ===`;
if (failures.length) {
  console.log(`\n❌ ${summary}`);
  failures.forEach(failure => console.log(`  - ${failure.name}${failure.detail ? ` —— ${failure.detail}` : ''}`));
  process.exit(1);
}
console.log(`\n✅ ${summary}`);
