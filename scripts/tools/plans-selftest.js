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
// v3.0 A1：身份层要读 deals 侧 A 空间（RENDER-CORE 的 VENDOR_RULES）。
// `VENDOR_RULES` 是顶层 const，在沙箱里不会挂到 context 上，所以只能经
// `vendorKeyNames()` 这个纯函数取值器读（只读常量、不碰 DOM）。
const renderCore = require('../lib/render-core');
const dataDocs = require('../lib/data-docs');

/* ------------------------------------------------------------------ */
/* 静态扫描的小工具（§14：字符串型断言必须先剥注释、按访问形态判）        */
/* ------------------------------------------------------------------ */

function stripComments(source) {
  return String(source).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** 订阅层不许自己去读的套餐侧数据文件 / 模块（判据只盯这三个 token） */
const FEEDS_FORBIDDEN_DATA = ['plans.json', 'curated_plans', 'plan-schema'];

/** 「真的会去读一个东西」的调用名。`JSON.parse` 在内：它只解析已经被读进来的内容。 */
const READ_CALL_RE = /\b(?:require|import|readFileSync|readFile|createReadStream|JSON\.parse|fetch|axios\.(?:get|request))\s*\(/g;

/**
 * 把每个"读取调用"的**实参文本**取出来（括号配平、跳过字符串里的括号）。
 * 取实参而不是整行，是因为判据要回答的是"这次调用读的是不是这个文件"。
 */
function readCallArguments(source) {
  const stripped = stripComments(source);
  const args = [];
  READ_CALL_RE.lastIndex = 0;
  let match;
  while ((match = READ_CALL_RE.exec(stripped)) !== null) {
    const start = match.index + match[0].length;
    let depth = 1;
    let i = start;
    let quote = null;
    while (i < stripped.length && depth > 0) {
      const ch = stripped[i];
      if (quote) {
        if (ch === '\\') { i += 2; continue; }
        if (ch === quote) quote = null;
        i += 1;
        continue;
      }
      if (ch === '"' || ch === '\'' || ch === '`') { quote = ch; i += 1; continue; }
      if (ch === '(') depth += 1;
      else if (ch === ')') depth -= 1;
      i += 1;
    }
    args.push({ call: match[0].replace(/\s*\($/, ''), text: stripped.slice(start, Math.max(start, i - 1)) });
  }
  return args;
}

/** 把"拼出来的字符串"还原成连续文本：去掉引号 / 反引号 / 加号 / 空白 */
function stringSkeleton(text) {
  return String(text).replace(/['"`]/g, '').replace(/\+/g, '').replace(/\s+/g, '');
}

/**
 * token 的**词边界**形态：`plans.json` 不得命中 `api-plans.json`（那正是订阅层合法的另一半：
 * API 价格变化源）。裸 `includes()` 会把 `api-plans.json` 也算成"读了 plans.json"，
 * 于是判据连"哪一个文件"都分不清。
 */
function tokenPattern(token) {
  return new RegExp(`(?<![A-Za-z0-9_.\\-])${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
}

/**
 * **访问形态**判据：文件名字符串出现在一个真的会读它的调用里 ⇒ 报红。
 *
 * 为什么不能按裸子串判：`lib/feeds.js` 的 feed source note 里**正当**写着
 * 「套餐数据（plans.json）」—— 那是给读者的说明，不是读取。旧实现
 * `source.includes('plans.json')` 把散文判成违规，于是别人在同一个文件里写一句
 * 文档就会把这条门禁染红（实测 233/1，回退该文件立刻 234/0）。
 * 判据改成"谁在读"之后，**写文档的自由**与**读数据的禁令**不再互相撞车。
 *
 * 覆盖：`path.join(ROOT, 'plans.json')`（拼接）、`` `${ROOT}/plans.json` ``（模板串）、
 * `'plans' + '.json'`（分段拼接）、`require('./plan-schema')`（模块名）、静态 `import … from`。
 * 注释先剥掉（§14 / F-verify-x-004：注释里的示例代码不算）。
 *
 * 已知边界（如实写出）：先把路径存进变量、再 `readFileSync(变量)` 是静态判据抓不到的 ——
 * 那条支路只能靠 review。本判据保证的是"文件名与读取动作写在同一个表达式里"必红。
 */
function dataFileAccessHits(source, tokens) {
  const hits = [];
  for (const { call, text } of readCallArguments(source)) {
    const skeleton = stringSkeleton(text);
    for (const token of tokens) {
      const pattern = tokenPattern(token);
      if (pattern.test(text) || pattern.test(skeleton)) hits.push(`${call}(…) 里读取了 ${token}`);
    }
  }
  const stripped = stripComments(source);
  const importRe = /\bimport\s+(?:[^;'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  let match;
  while ((match = importRe.exec(stripped)) !== null) {
    for (const token of tokens) {
      if (tokenPattern(token).test(match[1])) hits.push(`import … from '${match[1]}'（${token}）`);
    }
  }
  return [...new Set(hits)];
}

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
// v3.0 §10.4 修订：`false` 不再"有 note 没 note 都行"—— 说"不是"必须能兑现官方否定表述。
// 这条改动正面拦住的正是审计 P2-12（F-r2-plans-002）的形态：把 unknown 降级成 false。
const falseWithWitness = accepts('value=false 且 note 给出官方否定表述 → 合法（来源明说"不是"）', rawTokens({
  restrictions: [{ kind: 'account_required', value: false, note: '官方原文「无需注册账号即可试用」' }]
}));
check('false 走完构造仍**保持 false**（不落 null、不落 "unknown"）',
  falseWithWitness.restrictions[0].value === false && typeof falseWithWitness.restrictions[0].value === 'boolean',
  JSON.stringify(falseWithWitness.restrictions));
rejects('【牙】§10.4 value=false 却不写 note → 判红（"不是"必须给官方原文，不许凭感觉）', rawTokens({
  restrictions: [{ kind: 'account_required', value: false, note: null }]
}), '官方否定表述');
rejects('【牙】§10.4 value=false 的 note 只写「未说明」→ 判红（这就是把 unknown 降级成 false 的形态）', rawTokens({
  restrictions: [{ kind: 'account_required', value: false, note: '官方页面未说明是否需要账号' }]
}), '否定表述');
rejects('【牙】§10.4 value="unknown" 的 note 只写官方否定表述 → 判红（该写 false 就别写 unknown）', rawTokens({
  restrictions: [{ kind: 'account_required', value: 'unknown', note: '官方原文「无需注册账号」' }]
}), '未说明');
rejects('【牙】§10.4 restrictions 缺 value 字段 → 判红（缺字段不得被当成 false）', rawTokens({
  restrictions: [{ kind: 'account_required', note: '故意不写 value' }]
}), 'value 缺失');
rejects('【牙】§10.4 value=null → 判红（null 不在计划侧三态里，它是"没写"不是"否"）', rawTokens({
  restrictions: [{ kind: 'account_required', value: null, note: 'null 不是答案' }]
}), '必须');
accepts('value=true 不要求见证词（本契约只盯 unknown / false 两个方向，不改变其它语义）', rawTokens({
  restrictions: [{ kind: 'fair_use', value: true, note: '官方写「Usage limits apply.」' }]
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

section('⑤b §10.4 三态契约：重建 / 渲染 / 派生三条路径都不得把 unknown 或缺失变成 false');

{
  // 契约常量：三态只有三个字面量，**且它是唯一清单**（任何"顺手加一档"都要先改这里）
  check('三态契约常量 = true / false / "unknown"（唯一清单）',
    JSON.stringify(planSchema.RESTRICTION_TRISTATE) === JSON.stringify([true, false, 'unknown'])
    && planSchema.TRISTATE_UNKNOWN === 'unknown',
    JSON.stringify(planSchema.RESTRICTION_TRISTATE));

  const unknownRaw = rawTokens({
    restrictions: [{ kind: 'new_user_only', value: 'unknown', note: '官方页面未说明领取资格（查过官网与文档）' }]
  });
  const unknownPlan = accepts('unknown 记录能构造', unknownRaw);

  // ---- 路径 ①：重建（构造 → 序列化 → 再校验，即 rebuild + validate 的那条链）----
  check('重建路径：unknown 经 JSON 往返后仍是 "unknown"（不落 false、不落 null）',
    JSON.parse(JSON.stringify(unknownPlan)).restrictions[0].value === 'unknown');
  {
    const again = planSchema.makePlan(unknownPlan, { fromRecord: true, today: TODAY });
    check('重建路径：把记录再喂回归一器，unknown 一字不变（幂等）',
      again.ok && again.plan.restrictions[0].value === 'unknown', again.problems.join(' | ').slice(0, 160));
  }
  {
    const verdict = planSchema.validatePlan(unknownPlan, 0);
    check('重建路径：unknown 记录通过 validatePlan（三态是合法状态，不是"待修"）', verdict.ok, verdict.errors.join(' | ').slice(0, 160));
  }
  {
    // 缺字段：不许被补成 false —— 归一器必须直接报红
    const missingValue = make(rawTokens({ restrictions: [{ kind: 'new_user_only', note: '没有 value' }] }));
    check('重建路径：缺 value 的记录被拒（缺字段不得被补成 false）',
      !missingValue.ok && !/false/.test(JSON.stringify(missingValue.plan && missingValue.plan.restrictions)),
      missingValue.problems.join(' | ').slice(0, 160));
  }
  {
    // 「来源层把 unknown 降级成 false」的完整形态：note 还是那句"未说明" ⇒ 必红
    const downgraded = make(rawTokens({
      restrictions: [{ kind: 'new_user_only', value: false, note: '官方页面未说明领取资格（查过官网与文档）' }]
    }));
    check('重建路径：来源层把 unknown 降级成 false（note 未变）→ 拒收（P2-12 的原始形态）',
      !downgraded.ok && downgraded.problems.join(' ').includes('否定表述'),
      downgraded.problems.join(' | ').slice(0, 160));
  }

  // ---- 路径 ②：渲染（页面那一行给读者看的到底是什么）----
  const pageLib = require('../lib/plans-page');
  const unknownRow = pageLib.planRowOf(unknownPlan, { providerTable: providers.load().table });
  const falseRow = pageLib.planRowOf(falseWithWitness, { providerTable: providers.load().table });
  const noRestrictionRow = pageLib.planRowOf(accepts('没有限制条件的套餐能构造', rawTokens({ restrictions: null })), {});
  check('渲染路径：unknown 渲染成「未确认」而不是「否」',
    unknownRow.restrictions.join(' ').includes('未确认') && !unknownRow.restrictions.join(' ').includes('否'),
    unknownRow.restrictions.join(' · '));
  check('渲染路径：false 渲染成「否」（明确的"不是"与"没查到"在页面上必须长得不一样）',
    falseRow.restrictions.join(' ').includes('否') && !falseRow.restrictions.join(' ').includes('未确认'),
    falseRow.restrictions.join(' · '));
  check('渲染路径：没有限制条件 / 缺失时不产生任何一行（不得凭空印出一个「否」）',
    noRestrictionRow.restrictions.length === 0, JSON.stringify(noRestrictionRow.restrictions));

  // ---- 路径 ③：派生指标（未知量不得变成 0 / false）----
  {
    // 直接驱动派生函数：四种"未知"都必须是 null，而不是 0 / false
    const unknownShapes = [
      ['额度数量未知', { quota: { type: 'tokens', amount: null, period: 'monthly' } }],
      ['额度周期未知', { quota: { type: 'tokens', amount: 6e9, period: null } }],
      ['价格未知', { quota: { type: 'tokens', amount: 6e9, period: 'monthly' }, billing: { period: 'monthly', currency: 'CNY', regularPrice: null } }],
      ['额度类型未知', { quota: { type: null, amount: 6e9, period: 'monthly' }, billing: { period: 'monthly', currency: 'CNY', regularPrice: 60 } }]
    ];
    const bad = [];
    for (const [label, shape] of unknownShapes) {
      const { metric, reason } = planSchema.deriveMetricsWithReason(shape);
      if (!Object.is(metric, null)) bad.push(`${label} → ${JSON.stringify(metric)}`);
      if (/false/i.test(String(reason))) bad.push(`${label} 的理由里出现 false：${reason}`);
    }
    check('派生指标路径：四种「未知」一律 null（严格 null，不是 0 / false / undefined）',
      bad.length === 0, bad.join(' · '));
  }
  {
    const amountless = accepts('unlimited_fair_use 套餐（没有固定额度数值）', rawTokens({
      quota: { type: 'unlimited_fair_use', amount: null, period: null, description: '官方写「不设固定额度，按公平使用策略调度」', conversionDependsOnModel: null },
      evidence: [{ field: 'quota.description', quote: '不设固定额度，按公平使用策略调度', sourceUrl: OFFICIAL, capturedAt: TODAY, lang: 'zh' }]
    }));
    check('派生指标路径：没有固定额度的记录 ⇒ nominalUnitPrice 严格为 null（不编一个数）',
      amountless.derivedMetrics.nominalUnitPrice === null, JSON.stringify(amountless.derivedMetrics));
  }
  check('派生指标路径：不可比较的既有三种情形仍然 null（回归）',
    [requestsPlan, creditsPlan, ratePlan].every(plan => Object.is(plan.derivedMetrics.nominalUnitPrice, null)));
}

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
  // v2.5：这条断言原来拿 'OpenAI' 当"未登记"的例子 —— 而 API 计费层把 OpenAI 正式登记了
  // （见 providers.json 的 _v25_note）。断言**意图不变**（未登记一律硬红），换一个确实没登记的
  // 名字：拿已登记的名字当反例，会让这条牙在没有任何人注意的情况下变成恒真/恒假。
  check('未登记的平台返回 null（不许原样放行）', providers.resolveProvider('NoSuchVendor', table) === null);
  check('未登记时给出建议 key', providers.suggestProviderSlug('NoSuchVendor') === 'nosuchvendor', providers.suggestProviderSlug('NoSuchVendor'));
  rejects('未登记的 provider → 判红并给出建议 key',
    rawTokens({ provider: 'NoSuchVendor' }), '未在 providers.json 登记');
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

/* ------------------------------------------------------------------ */

section('⑦b v3.0 A1 身份层：A 空间冻结表 + vendorKey 恒等式 + /vendor/ 路由不变');

/**
 * A 空间（index.html RENDER-CORE 的 `VENDOR_RULES`）的**冻结期望表**：
 * `[厂商键, 显示名]`，顺序就是规则表里的顺序（第 2 / 第 3 槽位）。
 *
 * 为什么冻结而不是"看着对就行"：这两个字段一起决定 `/vendor/<slug>/` 这个 URL ——
 * 显示名是 `scripts/data/vendor-slugs.json` 的键，厂商键是 deals 侧筛选 / 折叠的身份。
 * 任何一处漂移（改键名、改显示名、插一条、删一条）都必须有人**停下来**看会不会破 URL。
 * v3.0 之前这里没人守：`AGENT-REFERENCE.md` §2.2 的 `moonshotai`/`moonshot` 误报就是
 * 靠人眼读规则表读错了槽位读出来的（实测 A 键一直是 `moonshot`，`moonshotai` 是 logo 键）。
 *
 * 确实要加厂商 / 改名时：先跑 `npm run build` 看 `/vendor/` 路由集合变了没有，变了就在
 * `scripts/data/landing-aliases.json` 登记旧路由 → 新路由，然后**同步更新这张表和
 * `FROZEN_VENDOR_SLUGS`**。冻结表不是"不许改"，是"改之前必须有人看过 URL"。
 */
const FROZEN_VENDOR_KEYS = [
  ['baidu', '百度智能云'],
  ['volcengine', '火山引擎'],
  ['coze', '扣子 Coze'],
  ['tencent', '腾讯云'],
  ['zhipu', '智谱AI'],
  ['iflytek', '科大讯飞'],
  ['modelscope', '魔搭 ModelScope'],
  ['aliyun', '阿里云'],
  ['moonshot', '月之暗面'],
  ['siliconflow', '硅基流动'],
  ['stepfun', '阶跃星辰'],
  ['sensetime', '商汤科技'],
  ['baichuan', '百川智能'],
  ['deepseek', 'DeepSeek'],
  ['ai360', '360智脑'],
  ['github', 'GitHub'],
  ['microsoft', 'Microsoft'],
  ['google', 'Google'],
  ['anthropic', 'Anthropic'],
  ['openai', 'OpenAI'],
  ['perplexity', 'Perplexity'],
  ['canva', 'Canva'],
  ['cursor', 'Cursor'],
  ['replit', 'Replit'],
  ['zapier', 'Zapier'],
  ['make', 'Make'],
  ['notion', 'Notion'],
  ['figma', 'Figma'],
  ['elevenlabs', 'ElevenLabs'],
  ['runway', 'Runway'],
  ['aws', 'AWS'],
  ['windsurf', 'Windsurf'],
  ['groq', 'Groq'],
  ['n8n', 'n8n'],
  ['cohere', 'Cohere'],
  ['recraft', 'Recraft'],
  ['midjourney', 'Midjourney'],
  ['ideogram', 'Ideogram'],
  ['leonardo', 'Leonardo AI'],
  ['krea', 'KREA'],
  ['xai', 'xAI'],
  ['huggingface', 'Hugging Face'],
  ['mistral', 'Mistral'],
  ['together', 'Together AI'],
  ['minimax', 'MiniMax（稀宇科技）']
];

/**
 * deals 侧的 slug 表（显示名 → slug）的冻结期望表。slug 是**已经发布出去的 URL**。
 *
 * v3.0 Stage E（D13）：本表从 9 条扩到 **19 条** —— 厂商页的候选集合在 Stage E 扩大到
 * 「有优惠的 A 空间厂商名 ∪ 在 A 空间有厂商名且有非优惠资料的 provider」，后者的 slug
 * 以前只能从 providers.json 隐式兜底。补表**不新增、不改名任何路由**（补表前后的
 * `/vendor/` route 集合逐条比对完全相同，证据见 t6 交付说明与 research/_raw/v3.0-gate/）；
 * 它只是把"隐式兜底"变成"权威表显式登记"，好让只读 dist 的独立门禁有表可对。
 * 值逐字等于 providers.json 里同名条目的 slug（validateSlugAgreement 守着这条）。
 * `vendorKey === null` 的 4 家（Trae / Qoder CN / 腾讯 CodeBuddy / Qoder International）**不在此表**。
 */
const FROZEN_VENDOR_SLUGS = {
  '百度智能云': 'baidu-ai-cloud',
  '智谱AI': 'zhipu',
  '火山引擎': 'volcengine',
  '扣子 Coze': 'coze',
  'GitHub': 'github',
  '科大讯飞': 'iflytek',
  'Microsoft': 'microsoft',
  'Notion': 'notion',
  'MiniMax（稀宇科技）': 'minimax',
  '月之暗面': 'moonshot',
  'Cursor': 'cursor',
  'OpenAI': 'openai',
  'Anthropic': 'anthropic',
  'Google': 'google',
  'DeepSeek': 'deepseek',
  '阿里云': 'aliyun',
  '硅基流动': 'siliconflow',
  '腾讯云': 'tencent-cloud',
  'Windsurf': 'windsurf',
  /* coverage-expansion-v1 / t11 修订（**新增路由**，不是改名，逐条登记原因）：
   * 这 6 家原先只能靠 landing.js 的 `vendorSlugs[name] || providerEntry.slug` 隐式兜底；
   * t11 把身份正式落进 providers.json 后，按 v3.0 Stage E 的纪律**显式补表**（值逐字等于
   * providers.json 里同名条目的 slug，由 validateSlugAgreement 与 assertVendorSlugDeclared 双重把守）：
   *   · 阶跃星辰 / 商汤科技 / 百川智能 / 360智脑 → 第一方开发者（官方定价页与记录均已落盘）
   *   · Replit → A 空间已有厂商键；Coding 套餐候选 adopted
   *   · AWS → A 空间厂商键 `aws`；Amazon Q Developer 候选 adopted
   * 冻结表的本意是「改 URL 前必须有人看过」——这里是**新增**，既有路由一个字节未改。 */
  '阶跃星辰': 'stepfun',
  '商汤科技': 'sensetime',
  '百川智能': 'baichuan',
  '360智脑': 'ai360',
  'Replit': 'replit',
  'AWS': 'aws'
};

/** 逐条比对 A 空间的 `[键, 显示名]` 序列（顺序也算）；返回漂移列表（空 = 未漂移） */
function vendorTableDrift(actual, expected) {
  const drift = [];
  if (actual.length !== expected.length) drift.push(`条数 ${actual.length} ≠ 冻结表 ${expected.length}`);
  for (let i = 0; i < Math.min(actual.length, expected.length); i++) {
    const got = [actual[i].key, actual[i].name];
    const want = [expected[i][0], expected[i][1]];
    if (got[0] !== want[0] || got[1] !== want[1]) {
      drift.push(`第 ${i + 1} 条：${JSON.stringify(got)} ≠ 冻结 ${JSON.stringify(want)}`);
    }
  }
  return drift;
}

/** 逐条比对 slug 表（两侧键集合的并集都要看：多一行、少一行、改值都算漂移） */
function vendorSlugDrift(actual, expected) {
  const drift = [];
  const names = [...new Set([...Object.keys(actual), ...Object.keys(expected)])].sort();
  for (const name of names) {
    if (actual[name] !== expected[name]) drift.push(`${name}: ${JSON.stringify(actual[name])} ≠ 冻结 ${JSON.stringify(expected[name])}`);
  }
  return drift;
}

{
  const core = renderCore.load();
  const vendorKeys = core.vendorKeyNames();
  const table = providers.load().table;
  const slugs = providers.loadVendorSlugs();
  const pairs = providers.vendorKeyPairs(vendorKeys);

  check('RENDER-CORE 导出了 A 空间的键/名取值器（只读常量、不碰 DOM）',
    typeof core.vendorKeyNames === 'function' && pairs.length > 0);
  check('A 空间里没有重复厂商键（同一个键挂两个显示名 ⇒ 身份自己就分裂了）',
    new Set(pairs.map(pair => pair.key)).size === pairs.length,
    pairs.map(pair => pair.key).filter((key, i, all) => all.indexOf(key) !== i).join(' | '));

  const keyDrift = vendorTableDrift(pairs, FROZEN_VENDOR_KEYS);
  check('VENDOR_RULES 的 [厂商键, 显示名] 序列与冻结表逐条相同（漂移即红，见本文件 FROZEN_VENDOR_KEYS）',
    keyDrift.length === 0, keyDrift.slice(0, 5).join(' | '));

  const slugDrift = vendorSlugDrift(slugs, FROZEN_VENDOR_SLUGS);
  check('vendor-slugs.json 与冻结表逐条相同（slug 是已发布的 URL，改名会破链接）',
    slugDrift.length === 0, slugDrift.slice(0, 5).join(' | '));

  // 硬断言 ①（v3.0 A1 扩展）：同一显示名上的 slug 必须逐字相同；vendor-slugs 取不到东西不许假绿
  check('硬断言 ①：providers.json[].name 与 vendor-slugs.json 同名条目的 slug 逐字相同',
    providers.validateSlugAgreement(table, slugs).length === 0,
    providers.validateSlugAgreement(table, slugs).join(' | '));
  check('硬断言 ①：vendor-slugs.json 为空 → 报红（缺文件/坏文件不是通过）',
    providers.validateSlugAgreement(table, {}).length > 0 &&
    providers.validateSlugAgreement(table, {}).some(p => p.includes('假绿')));

  // 硬断言 ②（v3.0 A1 新增）：每个非 null vendorKey 从 VENDOR_RULES 取回的显示名 == providers.json[].name
  check('硬断言 ②：每个非 null vendorKey 从 VENDOR_RULES 取回的显示名逐字等于 providers.json[].name',
    providers.validateVendorKeyAgreement(table, vendorKeys).length === 0,
    providers.validateVendorKeyAgreement(table, vendorKeys).join(' | '));
  check('硬断言 ②：A 空间取不到键/名表 → 报红（取不到不是通过）',
    providers.validateVendorKeyAgreement(table, []).length > 0 &&
    providers.validateVendorKeyAgreement(table, []).some(p => p.includes('假绿')));

  // 真实数据：A1 补齐的 6 家必须在表里、且 vendorKey 能取回同名显示名
  const NEW_SIX = { baidu: '百度智能云', volcengine: '火山引擎', coze: '扣子 Coze', iflytek: '科大讯飞', microsoft: 'Microsoft', notion: 'Notion' };
  const sixMissing = [];
  for (const [key, name] of Object.entries(NEW_SIX)) {
    const entry = table[key];
    if (!entry || entry.name !== name) { sixMissing.push(`${key} 缺失或显示名不是「${name}」`); continue; }
    if (providers.vendorKeyOf(key, table) !== key) sixMissing.push(`${key} 的 vendorKey 不是 ${key}`);
    if (providers.vendorDisplayNameFrom(vendorKeys, entry.vendorKey) !== name) sixMissing.push(`${key} 的 vendorKey 取不回「${name}」`);
  }
  check('A1 补齐的 6 家（baidu / volcengine / coze / iflytek / microsoft / notion）在表里且 vendorKey 闭环',
    sixMissing.length === 0, sixMissing.join(' | '));
  check('provider-only 的三家（trae / qoder / codebuddy）显式写 vendorKey=null',
    ['trae', 'qoder', 'codebuddy'].every(key => Object.prototype.hasOwnProperty.call(table[key] || {}, 'vendorKey') && table[key].vendorKey === null));
  check('每条 provider 都显式写了 vendorKey 字段（缺席 = 静默退化，必须写出来）',
    Object.values(table).every(entry => Object.prototype.hasOwnProperty.call(entry, 'vendorKey')));

  /* ---- 牙：全部在内存里污染，不碰盘 ---- */

  // ① 最要紧的一颗：把 vendorKey 写成 logo 资产键（AGENT-REFERENCE §2.2 误报的形态）
  const logoKeyAsVendorKey = clone(table);
  logoKeyAsVendorKey.moonshot.vendorKey = 'moonshotai';
  const poison1 = providers.validateVendorKeyAgreement(logoKeyAsVendorKey, vendorKeys);
  check('【牙】vendorKey 写成 logo 资产键 moonshotai → 硬断言 ② 报红',
    poison1.length > 0 && poison1.some(p => p.includes('moonshotai')), poison1.join(' | '));

  // ② 指向 A 空间里不存在的键
  const ghostKey = clone(table);
  ghostKey.moonshot.vendorKey = 'kimi';
  const poison2 = providers.validateVendorKeyAgreement(ghostKey, vendorKeys);
  check('【牙】vendorKey 指向 A 空间里不存在的键 → 硬断言 ② 报红',
    poison2.length > 0 && poison2.some(p => p.includes('不存在')), poison2.join(' | '));

  // ③ A 空间显示名与 provider 的 name 分家（同一家公司两个名字）
  const splitName = clone(table);
  splitName.google.name = '谷歌';
  const poison3 = providers.validateVendorKeyAgreement(splitName, vendorKeys);
  check('【牙】VENDOR_RULES 显示名与 providers.json 的 name 分家 → 硬断言 ② 报红',
    poison3.length > 0 && poison3.some(p => p.includes('名字不同')), poison3.join(' | '));

  // ④ 两条 provider 抢同一个 A 空间键
  const twoOwners = clone(table);
  twoOwners.notion.vendorKey = 'microsoft';
  const poison4 = providers.validateProviderTable(twoOwners);
  check('【牙】两条 provider 抢同一个 A 空间键 → validateProviderTable 报红',
    poison4.some(p => p.includes('已被') && p.includes('vendorKey')), poison4.join(' | '));

  // ⑤ 缺 vendorKey 字段（看起来"没约束"，实际是身份没登记）
  const noField = clone(table);
  delete noField.notion.vendorKey;
  check('【牙】provider 缺 vendorKey 字段 → 报红',
    providers.validateProviderTable(noField).some(p => p.includes('缺少 vendorKey')));

  // ⑥ 规范显示名认不回自己（v2.4 那条 providerOverride 的根因）
  const unresolvableName = clone(table);
  unresolvableName.minimax.aliases = ['minimax', '稀宇科技', '海螺ai', '海螺 ai'];
  check('【牙】显示名归一后不在 aliases 里（认不回自己）→ 报红',
    providers.validateProviderTable(unresolvableName).some(p => p.includes('认回自己')));

  // ⑦ 冻结表自身：改一个显示名（漂移）必须被同一条比对函数抓住
  const drifted = clone(pairs);
  drifted[8].name = 'Moonshot';
  check('【牙】A 空间键/名表漂移（显示名被改）→ 冻结比对报红',
    vendorTableDrift(drifted, FROZEN_VENDOR_KEYS).length > 0,
    vendorTableDrift(drifted, FROZEN_VENDOR_KEYS).join(' | '));
  check('【牙】冻结比对能抓出少一条 / 多一条',
    vendorTableDrift(pairs.slice(1), FROZEN_VENDOR_KEYS).some(m => m.includes('条数')) &&
    vendorTableDrift(pairs.concat([{ key: 'ghost', name: 'Ghost' }]), FROZEN_VENDOR_KEYS).some(m => m.includes('条数')));
  check('【牙】slug 冻结比对能抓出改值 / 多一行',
    vendorSlugDrift({ ...slugs, zhipu: 'zhipu-ai' }, FROZEN_VENDOR_SLUGS).length > 0 &&
    vendorSlugDrift({ ...slugs, '新厂商': 'new-vendor' }, FROZEN_VENDOR_SLUGS).length > 0);

  /* ---- A1 效果：87 个 deal 原始串的解析率（真实数据，不是估计） ---- */
  const dealsDoc = JSON.parse(fs.readFileSync(path.join(ROOT, 'deals.json'), 'utf8'));
  const dealList = Array.isArray(dealsDoc.deals) ? dealsDoc.deals : [];
  const distinct = [...new Set(dealList.map(deal => String(deal.vendor || '')))];
  const resolved = distinct.filter(raw => providers.resolveProvider(raw, table));
  check('A1 后 deals 侧厂商串的解析率（去重后）> 6 个（改前实测 6/87）',
    resolved.length > 6, `${resolved.length}/${distinct.length}`);
  check('6 家的全部原始写法都能解析（含全角括号形态）',
    ['百度智能云', '火山引擎', '火山引擎（字节跳动）', '扣子 Coze（字节跳动）', '科大讯飞 讯飞开放平台', 'Microsoft', 'Notion', 'MiniMax（稀宇科技）', '海螺AI（MiniMax）']
      .every(raw => {
        const hit = providers.resolveProvider(raw, table);
        return hit && hit.key;
      }));
  check('不靠子串/正则：明显的另一个平台不许被并进来（Kreado AI ≠ KREA，Vercel 仍未登记）',
    providers.resolveProvider('Kreado AI', table) === null &&
    providers.resolveProvider('Verla', table) === null);

  /* ---- v3.0 A1 硬断言 ③：两套空间对同一条真实 vendor 串的归属必须一致 ---- */
  const aKeyOf = raw => {
    const vendor = core.vendorOf({ vendor: raw });
    return vendor && vendor.key ? vendor.key : null;
  };
  check('硬断言 ③：每条真实 deal vendor 串，A 空间归到的键 == B 空间解析出的 provider 的 vendorKey',
    providers.validateVendorSpaceAgreement(table, vendorKeys, distinct, aKeyOf).length === 0,
    providers.validateVendorSpaceAgreement(table, vendorKeys, distinct, aKeyOf).slice(0, 3).join(' | '));
  check('硬断言 ③：没有输入时不许假绿（vendor 串为空 / A 空间取值器缺失都报红）',
    providers.validateVendorSpaceAgreement(table, vendorKeys, [], aKeyOf).some(p => p.includes('假绿')) &&
    providers.validateVendorSpaceAgreement(table, vendorKeys, distinct, null).some(p => p.includes('取值器')));

  // 队长裁决（t3 落盘时定的）：批准 `chatgpt`→openai、`notebooklm`→google（依据是官方域名）；
  // 否决 `chatgpt plus`、`gpt image`。「批准 2 条」不等于「顺带并进第 3 条」—— 证明就在这两个 null 上。
  check('队长裁决：chatgpt → openai、notebooklm → google（两条都按官方域名批准）',
    providers.resolveProvider('ChatGPT', table) && providers.resolveProvider('ChatGPT', table).key === 'openai' &&
    providers.resolveProvider('NotebookLM', table) && providers.resolveProvider('NotebookLM', table).key === 'google');
  check('队长裁决：chatgpt plus / gpt image 仍解析不出来（被否决的两条没有被顺带并进来）',
    providers.resolveProvider('ChatGPT Plus', table) === null &&
    providers.resolveProvider('GPT Image', table) === null);

  // 牙：把 `chatgpt` 从 openai 挪到 google（A 空间把它归到 openai）→ 硬断言 ③ 必须红。
  // 注意必须**先从 openai 摘掉**：resolveProvider 命中第一个含该别名的条目，
  // 两边都留着时它仍会解析成 openai，这条牙就变成了恒真。
  const stolenAlias = clone(table);
  stolenAlias.openai.aliases = stolenAlias.openai.aliases.filter(alias => alias !== 'chatgpt');
  stolenAlias.google.aliases = stolenAlias.google.aliases.filter(alias => alias !== 'notebooklm').concat(['chatgpt']);
  const stolen = providers.validateVendorSpaceAgreement(stolenAlias, vendorKeys, distinct, aKeyOf);
  check('【牙】把 A 空间归到 openai 的串挪进 google 的别名 → 硬断言 ③ 报红',
    stolen.length > 0 && stolen.some(p => p.includes('归属不同')), stolen.slice(0, 2).join(' | '));

  // 牙：provider 的 vendorKey 写成 null（B 空间却认得它，A 空间也有归属）→ 硬断言 ③ 必须红
  const nulledKey = clone(table);
  nulledKey.microsoft.vendorKey = null;
  const nulled = providers.validateVendorSpaceAgreement(nulledKey, vendorKeys, distinct, aKeyOf);
  check('【牙】provider 的 vendorKey 写成 null（A 空间却把它归到某厂商）→ 硬断言 ③ 报红',
    nulled.length > 0 && nulled.some(p => p.includes('归属不同')), nulled.slice(0, 2).join(' | '));
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
  // v3.0 Stage C 数据扩充（队长验收）把 Coding 套餐从 9 条扩到 23 条，原来的「条目数在 5–10 之间」
  // 是按 9 条数据集定的**油表**，现在必然恒红 —— 恒红的断言不是门禁而是噪音，所以换成两条：
  //   ① 全局上限 count <= 60：防"数据集无止境膨胀"这个真实失效模式；
  //   ② **新增**单家上限：每家 provider 的套餐数 <= 6（实测 23 条 / 12 家 / 单家最大 4 = codebuddy），
  //      防"某一家误把多个 SKU 灌成几十条"—— 这正是本次扩充会触发的失效模式；
  //   ③ 下限 count >= 5 **一个字没放松**。
  // 为什么不是"把 10 调成 60"：那只是抬高容差、不多引入任何一条新判据；换成"全局上限 + 单家上限"
  // 比原口径更严（原本只看总数，现在某一家灌水也红），并把两个边界各自实跑变红过一次。
  check('条目数 >= 5（下限不放松；题面 §十三：先建立小而可靠的数据集）',
    stats.total >= 5, String(stats.total));
  check('条目数 <= 60（全局上限：防数据集无止境膨胀）',
    stats.total <= 60, String(stats.total));
  const plansPerProvider = new Map();
  for (const plan of store.plans) plansPerProvider.set(plan.provider, (plansPerProvider.get(plan.provider) || 0) + 1);
  const worstProvider = [...plansPerProvider.entries()].sort((a, b) => b[1] - a[1])[0] || ['(无)', 0];
  check('单家 provider 的套餐数 <= 6（新增的牙：防一家把多个 SKU 灌成几十条）',
    worstProvider[1] <= 6, `${worstProvider[0]} ${worstProvider[1]} 条 · 共 ${plansPerProvider.size} 家`);
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
  // 但这不等于「哪里都可以引用」。v2.3 又多了**一条**合法通道（订阅层里的套餐变化源），
  // 所以边界被写成四句话：
  //   ① deals 那半边（采集 / 合并 / 历史 / 优惠雷达 / 落地页 / SEO）**一个字都不许提 plans** ——
  //      套餐数据不参与优惠采集，也不进优惠的任何判据；
  //   ② 订阅层（`lib/feeds.js`）是**唯一**可以引用 plans 的地方，而且只能用来产出一份
  //      **独立**的套餐变化源：不许直接读数据文件（plans.json / curated_plans / plan-schema），
  //      数据一律由构建期传入 ——「谁来读文件」这件事只有一处（build-local）；
  //   ③ 前端 `index.html` 只允许出现页脚/顶栏两个路由占位符（`__PLANS_HREF__`），
  //      不许直接读 plans.json —— 页面由构建期预渲染，浏览器不 fetch 套餐数据；
  //   ④ 机制内核 `lib/history-core.js` 由两份日志共用（它在 plan-history-selftest 里被静态
  //      断言「不含任何一方的专有字段」）。
  // 判据工具 `stripComments` / `dataFileAccessHits` 在文件顶部（模块级）：这一段与下面那些
  // **对照断言**共用同一份实现 —— 判据写两遍就会慢慢分家。
  const planTokens = ['plans.json', 'plan-schema', 'curated_plans', 'plans-page', 'providers.json',
    'plan-history', 'plan-changes', 'PLAN_CHANGE', 'pchanges'];

  const dealsChain = [
    'scripts/collect.js', 'scripts/lib/store.js', 'scripts/lib/dedup.js', 'scripts/lib/history.js',
    'scripts/lib/changes.js', 'scripts/lib/seo.js', 'scripts/lib/landing.js'
  ];
  const chainHits = [];
  for (const rel of dealsChain) {
    const source = stripComments(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
    for (const token of planTokens) if (source.includes(token)) chainHits.push(`${rel} 提到了 ${token}`);
  }
  check('deals 链路（采集 / 合并 / 历史 / 优惠雷达 / 落地页 / SEO）完全不引用 plans',
    chainHits.length === 0, chainHits.join(' | '));

  // ② 订阅层：允许引用 plans 的模块，但不许自己读数据文件，也不许把套餐混进优惠的判据里
  const feedsSource = fs.readFileSync(path.join(ROOT, 'scripts/lib/feeds.js'), 'utf8');
  const feedsDataHits = dataFileAccessHits(feedsSource, FEEDS_FORBIDDEN_DATA);
  check('订阅层不自己读套餐数据文件（判据是**访问形态**：真的去读才红，提到文件名不算）',
    feedsDataHits.length === 0, feedsDataHits.join(' | '));

  // ②-对照（常驻）：这条判据必须能真的红、也必须不冤枉文档
  //   正向 ①：`path.join` 拼接 + readFileSync（最常见的那一种）
  check('【对照】插入一处真实读取（path.join + readFileSync）→ 必须报红',
    dataFileAccessHits(`const fs = require('fs');\nconst raw = fs.readFileSync(path.join(ROOT, 'plans.json'), 'utf8');\n`,
      FEEDS_FORBIDDEN_DATA).length > 0);
  //   正向 ②：模板串写法
  check('【对照】插入一处真实读取（模板串 + JSON.parse）→ 必须报红',
    dataFileAccessHits('const raw = JSON.parse(fs.readFileSync(`${ROOT}/curated_plans.json`, \'utf8\'));\n',
      FEEDS_FORBIDDEN_DATA).length > 0);
  //   正向 ③：require 模块名（订阅层自己去解析 schema 也是越界）
  check('【对照】require(\'./plan-schema\') → 必须报红',
    dataFileAccessHits("const planSchema = require('./plan-schema');\n", FEEDS_FORBIDDEN_DATA).length > 0);
  //   正向 ④：字符串拼接把文件名拼出来（'plans' + '.json'）—— 拼接必须与整串等价
  check('【对照】把文件名拼成两段（\'plans\' + \'.json\'）→ 必须报红',
    dataFileAccessHits("const raw = fs.readFileSync(path.join(ROOT, 'plans' + '.json'), 'utf8');\n",
      FEEDS_FORBIDDEN_DATA).length > 0);
  //   正向 ⑤：先存进变量再读 —— 静态判据**抓不到**（已知边界）。这条断言把边界钉住：
  //   它现在必须是绿的，将来若有人把它变成"能抓"，这条对照会失败并提醒更新文档。
  check('【对照·已知边界】先把路径存进变量再 readFileSync → 静态判据抓不到（只能靠 review）',
    dataFileAccessHits("const p = path.join(ROOT, 'plans.json');\nconst raw = fs.readFileSync(p, 'utf8');\n",
      FEEDS_FORBIDDEN_DATA).length === 0);
  //   反向 ①：现行 feeds.js 里那种**散文**（feed source note 写到文件名）→ 不得报红
  check('【对照】只提到文件名（散文 / 说明文字）→ 不得报红（门禁不许限制别人怎么写文档）',
    dataFileAccessHits("const note = '套餐变化来自人工逐条核对官方页后重建的套餐数据（plans.json），API 价格变化来自 api-plans.json';\n",
      FEEDS_FORBIDDEN_DATA).length === 0);
  //   反向 ②：注释里的示例代码 → 不得报红（§14：字符串型断言必须先剥注释）
  check('【对照】注释里的读取代码 → 不得报红（字符串型断言必须先剥注释）',
    dataFileAccessHits("// const raw = fs.readFileSync(path.join(ROOT, 'plans.json'), 'utf8');\nconst x = 1;\n",
      FEEDS_FORBIDDEN_DATA).length === 0);
  //   反向 ③：读的是别的数据文件 → 不得报红（判据只盯这三个 token）
  check('【对照】读 api-plans.json（合法：订阅层有 API 变化源）→ 不得报红',
    dataFileAccessHits("const raw = fs.readFileSync(path.join(ROOT, 'api-plans.json'), 'utf8');\n",
      FEEDS_FORBIDDEN_DATA).length === 0);

  check('订阅层对 plans 的引用只有「套餐变化」这一条通道（kind = plan-changes）',
    feedsSource.includes("kind: 'plan-changes'") && feedsSource.includes('PLAN_CHANGE_FEED') &&
    /kind === 'plan-changes'/.test(feedsSource));

  const indexSource = stripComments(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
  const plansHrefs = (indexSource.match(/__PLANS_HREF__/g) || []).length;
  check('前端 index.html 只用路由占位符引用套餐页（不直接读 plans.json）',
    plansHrefs === 2 &&
    !indexSource.includes('plans.json') && !indexSource.includes('curated_plans'),
    // v2.2 起是**两处**：共享页脚那一行（每一种深度都解析）+ 顶栏那一枚并列入口。
    // 数量写死是刻意的 —— 多出第三处时应该有人停下来想一下它是不是又一条要维护的入链。
    `占位符 ${plansHrefs} 个（页脚 + 顶栏）`);

  // 正向：构建期**必须**引用它，否则上面那些"不许引用"的断言会因为"整条线根本不存在"而假绿。
  // 发布清单的**唯一出处**已经搬到 Dataset Manifest（`lib/data-docs.js` 的 datasetCopyUrls()），
  // 所以这里问模块，而不是在 build-local.js 的源码里正则一个数组字面量 ——
  // 后者会在清单搬家那天变成一条"看起来还在守、其实已经失配"的断言（本轮实测：它先红了）。
  const buildSource = stripComments(fs.readFileSync(path.join(ROOT, 'scripts/tools/build-local.js'), 'utf8'));
  const publishedCopies = dataDocs.datasetCopyUrls();
  check('构建期确实接进了套餐页（占位符 → 路由 → 发布清单）',
    buildSource.includes('__PLANS_HREF__') && buildSource.includes('plansPage.PLANS_ROUTE') &&
    publishedCopies.includes('plans.json'),
    `占位符 / 路由 / 发布清单三者缺一不可（发布清单含 plans.json：${publishedCopies.includes('plans.json')}）`);
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

section('⑬ 交互载荷：构建期算出来的每一个键都要有出处');

const compare = require('../lib/plans-compare');

{
  const store = planSchema.loadPlans(planSchema.PLANS_FILE);
  const plans = store.plans;
  const page = require('../lib/plans-page');
  const html = page.plansPageBody(plans);
  const payload = page.comparePayloadOf(html).payload;

  check('载荷能被解析出来，且带 schema / core 版本',
    Boolean(payload) && payload.schema === 1 && typeof payload.core === 'string',
    payload ? `schema=${payload.schema} core=${payload.core}` : '读不到载荷');
  check('载荷行数 == 表格行数 == plans.json 条数',
    payload.rows.length === page.rowHtmlById(html).size && payload.rows.length === plans.length,
    `${payload.rows.length} / ${page.rowHtmlById(html).size} / ${plans.length}`);
  check('载荷 columns == 列模型长度 == 表头列数',
    payload.columns === page.PLANS_COLUMNS.length &&
    (html.match(/<th scope="col"/g) || []).length === page.PLANS_COLUMNS.length,
    `columns=${payload.columns} 列模型=${page.PLANS_COLUMNS.length} 表头=${(html.match(/<th scope="col"/g) || []).length}`);

  // 逐条对账 + 单价的 fail-closed（这层错了，表格看上去完全正常）
  check('载荷逐字段等于 plans.json，且交互层断言本身无问题',
    page.assertCompareHonesty(html, plans).length === 0,
    page.assertCompareHonesty(html, plans).slice(0, 3).join(' | '));

  // 选项清单只含有命中的档位（零计数入口不渲染）
  const hitCount = (dimension, value) => payload.rows.filter(row =>
    compare.matches(row, Object.assign(compare.emptyState(), { [dimension]: value }), payload.dimensions.price)).length;
  const zeroOptions = [];
  for (const dimension of ['provider', 'region', 'quotaType', 'model']) {
    for (const item of payload.dimensions[dimension]) {
      if (!hitCount(dimension, item.key)) zeroOptions.push(`${dimension}:${item.key}`);
    }
  }
  for (const bucket of payload.dimensions.price) {
    if (!hitCount('price', bucket.key)) zeroOptions.push(`price:${bucket.key}`);
  }
  check('所有筛选档位都至少命中 1 行（没有点了空空如也的入口）', zeroOptions.length === 0, zeroOptions.join(' | '));

  // 排序档位：unit 只在真有可比行时出现 —— 本阶段的真实数据里 0 条可计算
  const sortKeys = payload.dimensions.sort.map(item => item.key);
  const unitRows = payload.rows.filter(row => typeof row.unit === 'number').length;
  check('排序档位与「有没有可比项」一致（不可比较时不给这个排序）',
    sortKeys.includes('unit') === (unitRows > 0),
    `unit 可比较 ${unitRows} 条 / 档位 [${sortKeys.join(', ')}]`);
  check('本期真实数据里名义 Token 单价 0 条可计算，页面上写明了原因',
    unitRows === 0 && html.includes(page.NO_UNIT_SORT_NOTE),
    `可比较 ${unitRows} 条`);

  // 价格档：同币种 + 半开区间 + 只认正常月费
  const cnyBucket = payload.dimensions.price.find(bucket => bucket.key === 'CNY-50-100');
  const cnyHits = payload.rows.filter(row =>
    compare.matches(row, Object.assign(compare.emptyState(), { price: 'CNY-50-100' }), payload.dimensions.price));
  check('价格档只命中同币种、同周期、原价落在 [min,max) 里的行',
    Boolean(cnyBucket) && cnyHits.length > 0 && cnyHits.every(row =>
      row.currency === 'CNY' && row.period === 'monthly' && row.regular >= 50 && row.regular < 100),
    `命中 ${cnyHits.length} 行`);
  check('价格档不会把原价未标注 / 非月付的行捞进来',
    cnyHits.every(row => typeof row.regular === 'number') &&
    payload.rows.filter(row => row.regular === null).every(row =>
      !compare.matches(row, Object.assign(compare.emptyState(), { price: 'CNY-50-100' }), payload.dimensions.price)));

  // 搜索：中文显示值、平台别名、模型名都要覆盖
  const hay = id => payload.rows.find(row => row.id === id).search;
  const findByName = text => payload.rows.filter(row =>
    compare.matches(row, Object.assign(compare.emptyState(), { q: text }), payload.dimensions.price));
  // v3.0 Stage C：`github` 真实新增了 Copilot Pro+ / Copilot Max，`copilot` 现在正确地命中 3 条。
  // 原来那句 `=== 1` 绑的是旧数据规模（当时 GitHub 只有 Pro 一条），数据扩充后它变成假牙 ——
  // 改法是**把口径改对并补一条更强的**，而不是把数字从 1 调到 3：
  //   ① 命中数 >= 1（这条断言本来要守的是"搜索能按平台别名命中"）；
  //   ② 每一行都必须真的与 copilot 相关 —— 载荷行里没有 planName，所以守卫写成
  //      provider === 'github'（copilot 就是 github 的平台别名），防它退化成"随便什么词都能命中"。
  const copilotRows = findByName('copilot');
  check('搜索覆盖平台中文显示名与别名（智谱 / 灵码 / copilot）',
    findByName('智谱').length > 0 && findByName('灵码').length > 0 && copilotRows.length >= 1,
    `智谱 ${findByName('智谱').length} · 灵码 ${findByName('灵码').length} · copilot ${copilotRows.length}`);
  check('copilot 命中的每一行都真的属于 github（防宽匹配退化成"什么词都能命中"）',
    copilotRows.length > 0 && copilotRows.every(row => row.provider === 'github'),
    copilotRows.map(row => `${row.provider}/${row.id}`).join(' · '));
  check('搜索覆盖模型名，且大小写与全角都能搜到',
    findByName('glm').length >= 2 && JSON.stringify(findByName('ｇｌｍ').map(row => row.id)) === JSON.stringify(findByName('glm').map(row => row.id)),
    `glm ${findByName('glm').length} 条`);
  check('搜索是子串匹配、不做模糊（搜一个不存在的词得到 0 条）', findByName('zzz-不存在').length === 0);

  // 详情模板：每条一个，引文逐条对上
  const templates = [...html.matchAll(/<template data-detail-for="([^"]+)"/g)].map(m => m[1]);
  check('每条套餐恰好一个详情模板',
    templates.length === plans.length && plans.every(plan => templates.includes(plan.id)),
    `${templates.length} 个 / ${plans.length} 条`);

  // 无 JS 时的死控件：预渲染的标记里一个控件都不能有
  const markup = page.markupOnly(html);
  check('预渲染标记里零交互控件（无 JS 时不给可点暗示）',
    !/<button|<select|<input|data-facet=|data-sort=|data-reset/.test(markup));
  check('<noscript> 明确说出"没有 JS 时看到的就是全部"', /<noscript>[\s\S]*全部 \d+ 条套餐/.test(html));
}

/* ================================================================== */

section('⑭ 筛选 / 排序语义（require 浏览器里的同一份 core）');

{
  const page = require('../lib/plans-page');
  const store = planSchema.loadPlans(planSchema.PLANS_FILE);
  const plans = store.plans;
  const payload = page.planComparePayloadOf(plans);
  const rows = payload.rows;
  const buckets = payload.dimensions.price;
  const state = patch => Object.assign(compare.emptyState(), patch);

  // ---- 命中判定 ----
  const trae = rows.filter(row => row.provider === 'trae');
  check('平台维度只命中该平台', compare.filterRows(rows, state({ provider: 'trae' }), buckets).length === trae.length,
    `${compare.filterRows(rows, state({ provider: 'trae' }), buckets).length} vs ${trae.length}`);
  check('「模型未标注」档只命中 supportedModels 为空的行',
    compare.filterRows(rows, state({ model: compare.MODEL_NONE_KEY }), buckets)
      .every(row => row.modelsMissing === true));
  check('模型档只命中清单里真的列了该模型的行',
    compare.filterRows(rows, state({ model: 'GLM-5.3' }), buckets).every(row => row.models.includes('GLM-5.3')));
  check('活动价档是二分的：有 / 无互补且合起来是全集',
    compare.filterRows(rows, state({ promo: 'yes' }), buckets).length +
    compare.filterRows(rows, state({ promo: 'no' }), buckets).length === rows.length);
  check('地区档只命中该地区', compare.filterRows(rows, state({ region: 'cn' }), buckets)
    .every(row => row.region === 'cn'));
  check('多个维度是 AND（Trae + 有活动价 只剩 1 条）',
    compare.filterRows(rows, state({ provider: 'trae', promo: 'yes' }), buckets).length === 1);
  check('筛选不会改变行的内容（只按载荷键判定）',
    JSON.stringify(compare.filterRows(rows, state({ provider: 'trae' }), buckets)) === JSON.stringify(trae));

  // ---- 计数语义：点下去会看到多少条 ----
  const before = compare.filterRows(rows, state({}), buckets).length;
  check('计数与"点下去会看到多少条"一致（空状态下等于全集）',
    compare.countFor(rows, state({}), buckets, 'provider', 'trae') === trae.length && before === rows.length);
  check('已选中那一档的计数恰好等于当前结果数',
    compare.countFor(rows, state({ provider: 'trae' }), buckets, 'provider', 'trae') ===
    compare.filterRows(rows, state({ provider: 'trae' }), buckets).length);

  // ---- 排序：不可比较恒在末尾，且方向反转不越过 ----
  const lastIsNull = (list, field) => {
    const flags = list.map(row => typeof row[field] === 'number');
    return flags.indexOf(false) === -1 || flags.lastIndexOf(true) < flags.indexOf(false);
  };
  for (const sort of ['regular', 'promo', 'unit']) {
    for (const dir of ['asc', 'desc']) {
      const list = compare.sortRows(rows, sort, dir);
      check(`排序 ${sort}/${dir}：不可比较项全部排在可比较项之后`,
        lastIsNull(list, sort === 'unit' ? 'unit' : sort), `${sort}/${dir}`);
    }
  }
  check('排序返回新数组，且不改动传入的数组与行对象',
    compare.sortRows(rows, 'regular', 'desc') !== rows &&
    rows.every((row, index) => row.index === index) &&
    JSON.stringify(compare.sortRows(rows, 'regular', 'desc').map(row => row.id).slice().sort()) ===
    JSON.stringify(rows.map(row => row.id).slice().sort()));

  // ---- 价格排序不跨币种 ----
  const byRegularAsc = compare.sortRows(rows, 'regular', 'asc');
  const comparableCurrencies = byRegularAsc.filter(row => typeof row.regular === 'number').map(row => row.currency);
  const firstSeen = [];
  for (const currency of comparableCurrencies) if (!firstSeen.includes(currency)) firstSeen.push(currency);
  check('正常月费排序按币种分组（不跨币种比大小）',
    JSON.stringify(comparableCurrencies) === JSON.stringify(
      comparableCurrencies.slice().sort((a, b) => firstSeen.indexOf(a) - firstSeen.indexOf(b))),
    comparableCurrencies.join(','));
  check('最近更新排序默认最新在前，且全序稳定',
    compare.sortRows(rows, 'updated', 'desc').map(row => row.updated)
      .every((value, index, all) => index === 0 || all[index - 1] >= value));
  check('默认排序恒等于规范序（不受任何状态影响）',
    JSON.stringify(compare.sortRows(rows, 'default', 'asc').map(row => row.id)) ===
    JSON.stringify(compare.sortRows(rows, 'default', 'desc').map(row => row.id)) &&
    compare.sortRows(rows, 'default', 'asc').every((row, index) => row.index === index));

  // ---- 与"把 null 当成 0"的对照实现逐项比对：两者必须给出不同的顺序 ----
  {
    const coerce = (list, field, dir) => list.slice().sort((a, b) => {
      const va = typeof a[field] === 'number' ? a[field] : 0;
      const vb = typeof b[field] === 'number' ? b[field] : 0;
      return (va - vb) * (dir === 'desc' ? -1 : 1) || a.index - b.index;
    }).map(row => row.id);
    const honest = compare.sortRows(rows, 'regular', 'asc').map(row => row.id);
    check('【牙】"把不可比较当 0"的实现会给出不同顺序（诚实实现可被区分）',
      JSON.stringify(honest) !== JSON.stringify(coerce(rows, 'regular', 'asc')));
    check('诚实实现里"原价未知"的行排在任何有价行之后',
      honest.indexOf(rows.find(row => row.regular === null).id) > honest.findIndex(id =>
        typeof rows.find(row => row.id === id).regular === 'number'));
  }

  // ---- 用一条人造的 tokens 行证明：可比较的行真的会参与排序，且排在不可比较项之前 ----
  //      （真实数据 0 条可计算，所以这条路径必须用夹具证明它活着 —— 否则
  //       "unit 排序"就是一段从没跑过、谁也不知道对不对的代码。）
  {
    const withUnit = JSON.parse(JSON.stringify(rows));
    withUnit.push({
      id: 'ffffffffffff', index: withUnit.length, provider: 'zhipu', region: 'cn', quotaType: 'tokens',
      period: 'monthly', currency: 'CNY', regular: 60, promo: null, unit: 10, unitCurrency: 'CNY',
      models: [], modelsMissing: true, updated: '2026-10-01', search: 'zhipu 智谱'
    });
    const list = compare.sortRows(withUnit, 'unit', 'asc');
    check('有可比单价的行会参与「名义 Token 单价」排序并排在最前',
      list[0].id === 'ffffffffffff' && compare.sortsOf(withUnit).includes('unit'));
    check('可比较的行出现后，排序档位里才出现 unit',
      !compare.sortsOf(rows).includes('unit') && compare.sortsOf(withUnit).includes('unit'));
  }

  // ---- 三维组合不会再造出第四个状态 ----
  check('状态默认值 = 全部空 + default/asc，且 isDefault 只认它',
    compare.isDefault(compare.emptyState()) && !compare.isDefault(state({ promo: 'yes' })) &&
    !compare.isDefault(state({ sort: 'regular' })));
  check('activeCount 把搜索也算作一项', compare.activeCount(state({ q: 'glm', promo: 'yes' })) === 2);
}

/* ================================================================== */

section('⑮ 本阶段的牙：这些断言必须真的会红');

{
  const page = require('../lib/plans-page');
  const store = planSchema.loadPlans(planSchema.PLANS_FILE);
  const plans = store.plans;
  const html = page.plansPageBody(plans);
  const payload = page.comparePayloadOf(html).payload;

  /** 把载荷改掉再塞回页面，然后看断言是否变红（返回问题列表） */
  const withPayload = mutate => {
    const next = JSON.parse(JSON.stringify(payload));
    mutate(next);
    const swapped = html.replace(
      /<script type="application\/json" id="plans-compare-data">[\s\S]*?<\/script>/,
      `<script type="application/json" id="plans-compare-data">${page.jsonForScript(next)}</script>`
    );
    return page.assertCompareHonesty(swapped, plans);
  };

  // 牙 1：给一条 credits 套餐硬塞单价
  {
    const problems = withPayload(next => { next.rows[0].unit = 0.0248; next.rows[0].unitCurrency = 'CNY'; });
    check('【牙】给 credits 套餐硬塞名义 Token 单价 → 变红',
      problems.some(p => p.includes('不可比较')), problems.slice(0, 2).join(' | '));
  }
  // 牙 2：正常价与活动价互换
  {
    const problems = withPayload(next => {
      const row = next.rows.find(item => typeof item.promo === 'number');
      const regular = row.regular; row.regular = row.promo; row.promo = regular;
    });
    check('【牙】把正常价格与活动价互换 → 变红',
      problems.some(p => p.includes('regular')), problems.slice(0, 2).join(' | '));
  }
  // 牙 3：载荷少一行（页面显示条数与数据不一致）
  {
    const problems = withPayload(next => { next.rows.pop(); next.count = next.rows.length; });
    check('【牙】载荷少一行（页面上报的条数与 plans.json 不一致）→ 变红',
      problems.some(p => p.includes('≠ plans.json')), problems.slice(0, 2).join(' | '));
  }
  // 牙 4：某行的 provider 不在选项清单里 → 筛完会出现"不该出现的套餐"
  {
    const problems = withPayload(next => { next.rows[0].provider = 'not-registered'; });
    check('【牙】某行的平台键不在筛选选项清单里 → 变红',
      problems.some(p => p.includes('不在 provider 选项清单')), problems.slice(0, 2).join(' | '));
  }
  // 牙 5：往预渲染标记里塞一个筛选控件（无 JS 时的死按钮）
  {
    const problems = page.assertCompareHonesty(
      html.replace('<div class="pctl" id="plans-compare"', '<button data-facet="provider" class="f"></button><div class="pctl" id="plans-compare"'),
      plans);
    check('【牙】预渲染标记里塞进筛选控件 → 变红',
      problems.some(p => p.includes('死控件')), problems.slice(0, 2).join(' | '));
  }
  // 牙 6：把不可比较项当成 0（对照实现必须给出不同顺序）
  {
    const rows = page.planComparePayloadOf(plans).rows;
    const coerce = rows.slice().sort((a, b) =>
      ((typeof a.regular === 'number' ? a.regular : 0) - (typeof b.regular === 'number' ? b.regular : 0)) || a.index - b.index)
      .map(row => row.id);
    const honest = compare.sortRows(rows, 'regular', 'asc').map(row => row.id);
    check('【牙】把不可比较项当 0 排 → 与诚实排序结果不同（这条判据分得清两者）',
      JSON.stringify(coerce) !== JSON.stringify(honest));
  }
  // 牙 7：价格档不按币种分组 → 该断言会红（用一个跨币种实现对照）
  {
    const rows = page.planComparePayloadOf(plans).rows;
    const crossCurrency = rows.filter(row => typeof row.regular === 'number')
      .sort((a, b) => a.regular - b.regular).map(row => row.id);
    const honest = compare.sortRows(rows, 'regular', 'asc').map(row => row.id).filter(id => crossCurrency.includes(id));
    check('【牙】跨币种混排的结果与诚实排序不同（币种分组不是装饰）',
      JSON.stringify(crossCurrency) !== JSON.stringify(honest));
  }
}

/* ================================================================== */

section('⑯ 变化展示：页面上的每一条变化都必须来自日志（v2.3）');

{
  const planHistory = require('../lib/plan-history');
  const planChanges = require('../lib/plan-changes');
  const page = require('../lib/plans-page');
  const store = planSchema.loadPlans(planSchema.PLANS_FILE);
  const plans = store.plans;

  // 夹具：真实套餐 + 一次改价 + 一次新增模型 ⇒ 两条价格/模型变化
  const pricePlan = plans.find(plan => plan.billing.promoPrice === null && typeof plan.billing.regularPrice === 'number');
  const modelPlan = plans.find(plan => !Array.isArray(plan.supportedModels));
  const next = clone(plans).map(plan => {
    if (pricePlan && plan.id === pricePlan.id) plan.billing.regularPrice = pricePlan.billing.regularPrice - 10;
    if (modelPlan && plan.id === modelPlan.id) plan.supportedModels = [{ name: 'DeepSeek V4.1', role: 'included', note: null }];
    return plan;
  });
  const seeded = planHistory.emptyStore({ at: '2026-10-01' });
  seeded.baseline = planHistory.baselineOf(plans, { at: '2026-10-01' });
  const recorded = planHistory.record(seeded, {
    previous: plans,
    next,
    at: '2026-10-02',
    runAt: '2026-10-02T00:00:00.000Z',
    labels: new Map(plans.map(plan => [plan.id, { title: plan.planName, vendor: plan.provider }]))
  });
  check('夹具：改价 + 新增模型各产生一条事件', recorded.appended.length === 2,
    `${recorded.appended.length} 条：${recorded.appended.map(e => e.type).join(',')}`);
  check('夹具：日志与数据自洽', planHistory.verifyStore(recorded.store, next, { today: '2026-10-02' }).length === 0);

  const radar = planChanges.buildPlanRadar({
    plans: next, store: recorded.store, asOf: '2026-10-02', availability: 'ok'
  });
  check('雷达：两条变化都进了「最近 7 天变化」', radar.totals.changed === 2, JSON.stringify(radar.totals));

  const html = page.plansPageBody(next, { planChanges: radar, planHistoryStore: recorded.store, prefix: '../../' });

  check('页面级诚实性断言全部通过（含最近变化块与时间线）',
    page.assertPageHonesty(html, next, { planChanges: radar, planHistoryStore: recorded.store }).length === 0,
    page.assertPageHonesty(html, next, { planChanges: radar, planHistoryStore: recorded.store }).slice(0, 3).join(' | '));

  const block = (html.match(/<section class="pchanges" id="plan-changes"[\s\S]*?<\/section>/) || [])[0] || '';
  check('最近变化块里恰好两条', (block.match(/<li>/g) || []).length === 2, block.slice(0, 200));
  check('改价那条写成「正常价格 旧 → 新」',
    /正常价格 [^→]+→ [^<]+/.test(block) && block.includes('正常价格'), block.slice(0, 300));
  check('模型那条写成「新增模型 DeepSeek V4.1」',
    block.includes('新增模型 DeepSeek V4.1'), block.slice(0, 300));
  check('块里有指向 /changes/#plans 的入口', block.includes('changes/#plans'));

  // 行锚点：订阅源与最近变化块都靠它深链
  check('每个数据行都有 #plan-<id> 锚点',
    next.every(plan => html.includes(`id="plan-${plan.id}"`)));
  check('锚点与 data-item 在同一行上（都指向同一条套餐）',
    next.every(plan => html.includes(`id="plan-${plan.id}" data-item="${plan.id}"`)));

  // 时间线
  const target = next.find(plan => plan.id === (pricePlan || plans[0]).id);
  const template = (html.match(new RegExp(`<template data-detail-for="${target.id}">([\\s\\S]*?)</template>`)) || [])[1] || '';
  check('详情模板里有变更记录标题与总条数', template.includes('变更记录（1 条）'), template.slice(0, 300));
  check('详情模板里的时间线写明了「正常价格 … → …」', template.includes('正常价格'), template.slice(0, 300));

  // 「没有拿到日志」与「没有变化」不许混为一谈
  const unavailable = planChanges.buildPlanRadar({ plans: next, store: null, asOf: '2026-10-02', availability: 'unavailable' });
  const unavailableHtml = page.plansPageBody(next, { planChanges: unavailable, prefix: '../../' });
  check('日志不可用时页面说的是「没有拿到日志」',
    unavailableHtml.includes('没有拿到套餐变更日志') && !unavailableHtml.includes('当前没有观测到套餐变化'));
  const emptyHtml = page.plansPageBody(next, {
    planChanges: planChanges.buildPlanRadar({ plans: next, store: planHistory.emptyStore({ at: '2026-10-01' }), asOf: '2026-10-02' }),
    prefix: '../../'
  });
  const emptyBlock = (emptyHtml.match(/<section class="pchanges" id="plan-changes"[\s\S]*?<\/section>/) || [])[0] || '';
  check('日志可用但没有变化时说「当前没有观测到套餐变化」',
    emptyBlock.includes('当前没有观测到套餐变化') && !emptyBlock.includes('没有拿到套餐变更日志'), emptyBlock);

  // 【牙】少渲染一条变化 → 必须红
  {
    const broken = html.replace(/<li>[\s\S]*?<\/li>/, '');
    check('【牙】最近变化块少一条 → 页面断言必须变红',
      page.assertPageHonesty(broken, next, { planChanges: radar, planHistoryStore: recorded.store })
        .some(problem => problem.includes('最近变化块')),
      page.assertPageHonesty(broken, next, { planChanges: radar, planHistoryStore: recorded.store }).slice(0, 2).join(' | '));
  }
  // 【牙】事件值里塞结论性词汇 → 数据层必须红
  {
    const tampered = clone(recorded.store);
    tampered.events[0].to = '性价比最高的额度';
    check('【牙】事件值里出现「性价比」→ 变化数据层断言必须变红',
      page.assertHistoryHonesty(next, tampered).some(problem => problem.includes('性价比')),
      page.assertHistoryHonesty(next, tampered).join(' | '));
  }
  // 【牙】时间线总条数被改错 → 必须红
  {
    const broken = html.replace('变更记录（1 条）', '变更记录（9 条）');
    check('【牙】时间线总条数与日志不符 → 页面断言必须变红',
      page.assertPageHonesty(broken, next, { planChanges: radar, planHistoryStore: recorded.store })
        .some(problem => problem.includes('时间线')),
      page.assertPageHonesty(broken, next, { planChanges: radar, planHistoryStore: recorded.store }).slice(0, 2).join(' | '));
  }
  // 【牙】日志不可用却仍列着变化 → 必须红
  {
    const broken = unavailableHtml.replace('没有拿到套餐变更日志（plan-history.json 缺失或损坏）——这不表示「没有变化」。', '当前没有观测到套餐变化');
    check('【牙】日志不可用却说「没有变化」→ 页面断言必须变红',
      page.assertPageHonesty(broken, next, { planChanges: unavailable, planHistoryStore: recorded.store }).length > 0);
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
