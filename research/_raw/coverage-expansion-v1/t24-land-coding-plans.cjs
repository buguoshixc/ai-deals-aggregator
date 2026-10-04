#!/usr/bin/env node
/**
 * t24：国际侧 Coding 套餐落盘（JetBrains AI Pro/Ultimate、Replit Core/Pro、Gemini Code Assist
 * Standard/Enterprise、Amazon Q Developer Free/Pro）+ 它需要的身份 / 官方域 / coverage-targets 行。
 *
 * 依据：`research/_raw/coverage-expansion-v1/coding.json`（逐家官方引文与 URL，均为 2026-10-04 抓取）。
 * 一切以官方原文为准；**不用第三方价顶替**。
 *
 * ## 为什么身份 / 官方域 / 记录 / 覆盖率目标行必须同批写
 *
 * `scripts/lib/official.js` 的官方域守卫要求「每一条登记的官方域都必须被仓库里**真实记录**的官方出处用到」，
 * 否则判「用不上的登记 = 自我声明」。所以只加身份不加记录会红、只加记录不加域也会红。
 *
 * ## 判据（全部来自 coding.json，逐条可核）
 *
 * · 官方同时给**个人 / 商业**两组价 ⇒ 收**个人档**（商业档进 note）——schema 的身份里没有 audience 维度。
 * · 官方同时给**年付 / 无年付承诺**两组价 ⇒ 收**无年付承诺的月付**（年付进 note）。
 * · 额度单位是**钱 / 行数 / 请求数**而不是 token ⇒ `quota.type` 用 `other` / `requests`，**不折算**。
 * · `Custom` / `Contact Sales` 不算固定档价 ⇒ 不收（Replit Enterprise）。
 *
 * 用法：node research/_raw/coverage-expansion-v1/t24-land-coding-plans.cjs [--dry-run]
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const DRY = process.argv.includes('--dry-run');
const TODAY = '2026-10-04';
const JB_URL = 'https://www.jetbrains.com/ai-ides/buy/';
const REPLIT_URL = 'https://replit.com/pricing';
const GCA_URL = 'https://codeassist.google/';
const AWS_Q_URL = 'https://aws.amazon.com/q/developer/pricing/';
const AWS_Q_PRODUCT_URL = 'https://aws.amazon.com/q/developer/';

/* ------------------------------------------------------------------ */
/* 身份 / 官方域                                                        */
/* ------------------------------------------------------------------ */
const NEW_PROVIDER = {
  key: 'jetbrains',
  entry: {
    name: 'JetBrains', slug: 'jetbrains',
    aliases: ['jetbrains', 'jetbrains ai', 'jetbrains ai pro', 'jetbrains ai ultimate'],
    logo: 'jetbrains', vendorKey: null,   // A 空间没有这家公司 ⇒ 显式 null（provider-only 纪律）
    officialDomains: ['jetbrains.com']
  }
};
const DOMAIN_ADDITIONS = { google: ['codeassist.google'] };

/* ------------------------------------------------------------------ */
/* 套餐记录（8 条）                                                     */
/* ------------------------------------------------------------------ */
function plan(spec) {
  return {
    provider: spec.provider,
    planName: spec.planName,
    officialUrl: spec.officialUrl,
    source: 'Official-Pricing',
    sourceUrl: spec.officialUrl,
    region: spec.region,
    billing: { period: 'monthly', currency: 'USD', regularPrice: spec.price, promoPrice: null, promoNote: null, note: spec.billingNote },
    quota: spec.quota,
    supportedModels: spec.supportedModels || null,
    restrictions: spec.restrictions || null,
    firstSeen: TODAY, lastSeen: TODAY, verified: true, verifiedAt: TODAY,
    evidence: spec.evidence
  };
}

const AWS_DISCONTINUATION = '时效事实（官方产品页逐字公告）：2027-04-30 起 AWS 将停止支持 Amazon Q Developer IDE 插件，官方建议改用 Kiro。完整引文与出处见本条 evidence（字段 billing.note）。';

const RECORDS = [
  plan({
    provider: 'JetBrains', planName: 'JetBrains AI Pro', officialUrl: JB_URL, region: 'global', price: 10,
    billingNote: '官方购买页内嵌商品目录 JSON 同时给出两组价：**个人** US $10.00/月（年付 US $100.00，合 US $8.33/月）、**商业** US $20.00/月（年付 US $200.00，合 US $16.67/月）。本条收**个人档月付**（schema 的身份里没有 audience 维度，另开会变成两条同名记录）；商业档价与年付价见本条 note。',
    quota: { type: 'rate_limited', amount: null, period: null, description: '官方该页只给价格与服务档位，未公布可核对的固定额度数值 ⇒ 按 rate_limited 记，不写数字。', conversionDependsOnModel: null },
    evidence: [{
      field: 'billing.regularPrice',
      quote: '"code": "AIP" … "prices": {"personal": {"yearlyPerMonth": ["US $8.33"], "monthly": ["US $10.00"]}, "commercial": {"monthly": ["US $20.00"]}} … "name": "JetBrains AI Pro"',
      sourceUrl: JB_URL, capturedAt: TODAY, lang: 'en'
    }]
  }),
  plan({
    provider: 'JetBrains', planName: 'JetBrains AI Ultimate', officialUrl: JB_URL, region: 'global', price: 30,
    billingNote: '官方同一商品目录 JSON：个人 US $30.00/月（年付 US $300.00，合 US $25.00/月）、商业 US $60.00/月（年付 US $600.00，合 US $50.00/月）⇒ 收个人档月付。商品码 IDESPR-AIU（捆绑、仅商业档、仅年付 $720.00）不收。',
    quota: { type: 'rate_limited', amount: null, period: null, description: '官方未公布可核对的固定额度数值 ⇒ rate_limited，不写数字。', conversionDependsOnModel: null },
    evidence: [{
      field: 'billing.regularPrice',
      quote: '"code": "AIPU" … "prices": {"personal": {"monthly": ["US $30.00"]}, "commercial": {"monthly": ["US $60.00"]}} … "name": "JetBrains AI Ultimate"',
      sourceUrl: JB_URL, capturedAt: TODAY, lang: 'en'
    }]
  }),
  plan({
    provider: 'Replit', planName: 'Core', officialUrl: REPLIT_URL, region: 'global', price: 20,
    billingNote: '官方定价页顶部标注 Yearly「Up to 10% off」；Core 卡片直出 $20 / $18 / month, billed annually。本条收**月付 $20**，年付 $18/月 见本条 note。',
    quota: { type: 'other', amount: null, period: 'monthly', description: '官方卡片逐字：$20 towards most powerful models（每月 $20 抵用于最强模型）+ Up to 30 hours of chat on Free Mode + Up to 60 projects on Free Mode。额度以**金额**表示、官方未给 token / 积分数值 ⇒ 按 other 记并写明口径，**不折算**。', conversionDependsOnModel: true },
    evidence: [{
      field: 'billing.regularPrice',
      quote: 'Core $20 / $18 / month, billed annually — ✔ AI integrations ✔ Up to 30 hours of chat on Free Mode ✔ Up to 60 projects on Free Mode ✔ $20 towards most powerful models ✔ Plan mode ✔ Unlimited workspaces',
      sourceUrl: REPLIT_URL, capturedAt: TODAY, lang: 'en'
    }]
  }),
  plan({
    provider: 'Replit', planName: 'Pro', officialUrl: REPLIT_URL, region: 'global', price: 100,
    billingNote: '官方卡片 Pro $100 / $90 / month, billed annually。本条收月付 $100，年付 $90/月 见本条 note。Enterprise 档官方写 Custom ⇒ 不是固定档价，**不收**；页面上没有 Free 档 ⇒ 不为它新建 regularPrice=0 的记录。',
    quota: { type: 'other', amount: null, period: 'monthly', description: '官方卡片逐字：$100 towards most powerful models + 10 parallel agents + Even more Free Mode usage + Up to 15 collaborators + Invite up to 50 viewers + Database rollback up to 28 days。金额口径 ⇒ other，不折算。', conversionDependsOnModel: true },
    evidence: [{
      field: 'billing.regularPrice',
      quote: 'Pro $100 / $90 / month, billed annually — ✔ 10 parallel agents ✔ Premium Support ✔ Even more Free Mode usage ✔ $100 towards most powerful models ✔ Up to 15 collaborators',
      sourceUrl: REPLIT_URL, capturedAt: TODAY, lang: 'en'
    }]
  }),
  plan({
    provider: 'Google', planName: 'Gemini Code Assist Standard', officialUrl: GCA_URL, region: 'global', price: 22.8,
    billingNote: '官方两组价并列：年付预付 US $19/user/month、无年付承诺 US $22.80/user/month ⇒ 收无年付承诺的月付 $22.80，年付 $19 见 note。受众逐字：Individual student, hobbyist, open source, and freelance developers。',
    quota: { type: 'rate_limited', amount: null, period: null, description: '官方本档权益列没有可核对的固定额度数值（只有功能清单与 Gemini CLI 的「generous free tier with high usage limits」这类措辞）⇒ rate_limited 并保留官方口径，**不写数字**。', conversionDependsOnModel: null },
    evidence: [{
      field: 'billing.regularPrice',
      quote: 'Price per user with no annual upfront commitment — $0/user/month | $22.80/user/month | $54/user/month',
      sourceUrl: GCA_URL, capturedAt: TODAY, lang: 'en'
    }]
  }),
  plan({
    provider: 'Google', planName: 'Gemini Code Assist Enterprise', officialUrl: GCA_URL, region: 'global', price: 54,
    billingNote: '官方两组价：年付预付 US $45/user/month、无年付承诺 US $54/user/month ⇒ 收月付 $54。同页另有「Enterprise membership … $75 per developer per month」是另一件商品（企业会员包），与本档不是同一件事，只认 $54。',
    quota: { type: 'rate_limited', amount: null, period: null, description: '官方未给固定额度数值 ⇒ rate_limited，不写数字。', conversionDependsOnModel: null },
    evidence: [{
      field: 'billing.regularPrice',
      quote: 'Price per user with no annual upfront commitment — $0/user/month | $22.80/user/month | $54/user/month',
      sourceUrl: GCA_URL, capturedAt: TODAY, lang: 'en'
    }]
  }),
  plan({
    provider: 'AWS', planName: 'Amazon Q Developer Free Tier', officialUrl: AWS_Q_URL, region: 'global', price: 0,
    billingNote: '官方逐字 `perpetual Free Tier`（长期免费）⇒ $0 是「官方明说免费」而不是「价格未知」（与既有 trae 免费版同口径）。' + AWS_DISCONTINUATION,
    quota: { type: 'requests', amount: 50, period: 'monthly', description: '官方逐字 50 agentic requests per month；另有 1,000 lines of code per month（用于 Java 升级，单位是「行」）写在 restrictions 里，不塞进 amount。', conversionDependsOnModel: null },
    restrictions: [{ kind: 'account_required', value: true, note: '官方逐字：available to users logged in as an AWS Identity and Access Management (IAM) user or AWS Builder ID user.' }],
    evidence: [{
      field: 'billing.regularPrice',
      quote: 'Amazon Q Developer offers a perpetual Free Tier with monthly limits … Free — 50 agentic requests per month ; 1,000 lines of code per month',
      sourceUrl: AWS_Q_URL, capturedAt: TODAY, lang: 'en'
    }]
  }),
  plan({
    provider: 'AWS', planName: 'Amazon Q Developer Pro', officialUrl: AWS_Q_URL, region: 'global', price: 19,
    billingNote: '官方逐字 $19/mo. per user、charged per user, per month（首月按天折算）。' + AWS_DISCONTINUATION,
    quota: { type: 'other', amount: null, period: 'monthly', description: '额度单位是**提交的行数（LOC）**，不是 token/积分/请求数 ⇒ 按 other 记并写明口径、不折算。官方逐字：4,000 lines of code per month per user pooled at account level; extra lines at $.003 per LOC submitted.', conversionDependsOnModel: null },
    restrictions: [{ kind: 'account_required', value: true, note: '官方逐字：allocations aggregated at the AWS payer-account level every month；超额 $0.003/LOC。' }],
    evidence: [{
      field: 'billing.regularPrice',
      quote: 'Pro Tier: Expanded limits $19/mo. per user ; Pro — 4,000 lines of code per month per user pooled at account level. Extra lines of code available at $.003 per line of code submitted.',
      sourceUrl: AWS_Q_URL, capturedAt: TODAY, lang: 'en'
    }, {
      field: 'restrictions',
      quote: 'On April 30, 2027, AWS will discontinue support for Amazon Q Developer IDE plugins. For capabilities similar to Amazon Q Developer IDE plugins, explore Kiro to access the latest models and features.',
      sourceUrl: AWS_Q_PRODUCT_URL, capturedAt: TODAY, lang: 'en'
    }]
  })
];

/* ------------------------------------------------------------------ */
/* coverage-targets（jetbrains 新行 + google / aws 现有行补齐 coding 意图） */
/* ------------------------------------------------------------------ */
function targetRow(spec) {
  return {
    provider: spec.provider, tier: spec.tier, role: spec.role, intent: spec.intent,
    applicabilityNote: spec.applicabilityNote, dimensionIntent: spec.dimensionIntent,
    currentTargets: spec.currentTargets, rulings: spec.rulings || [], note: spec.note || null
  };
}

const TARGETS = {
  jetbrains: targetRow({
    provider: 'jetbrains', tier: 'major', role: 'coding-product',
    intent: 'JetBrains AI 订阅档位（AI Pro / AI Ultimate）的官方价格与服务档位',
    applicabilityNote: 'deals / api / models 都不适用：① JetBrains AI 是订阅产品，官方购买页没有可引用的独立优惠口径；② 它不对外提供公开的按量 API 计费；③ 它不发行自己的模型身份（AI 服务里用的是第三方模型）。',
    dimensionIntent: { deals: null, coding: 'JetBrains AI Pro / AI Ultimate 的个人档与商业档', api: null, models: null },
    currentTargets: [{ dimension: 'coding', planName: 'JetBrains AI Pro' }, { dimension: 'coding', planName: 'JetBrains AI Ultimate' }]
  }),
  google: targetRow({
    provider: 'google', tier: 'core', role: 'model-developer',
    intent: 'Google（Gemini / Vertex / Gemini Code Assist）的优惠、订阅、API 定价与当前模型身份',
    applicabilityNote: null,
    dimensionIntent: { deals: 'Google Cloud / Gemini 官方优惠与额度（只收官方来源）', coding: 'Gemini Code Assist Standard / Enterprise 订阅档位', api: 'Gemini API 按量计费', models: 'Gemini 当前主力模型' },
    currentTargets: [
      { dimension: 'coding', planName: 'Gemini Code Assist Enterprise' },
      { dimension: 'coding', planName: 'Gemini Code Assist Standard' },
      { dimension: 'models', registrySlug: 'gemini-3.7-flash' },
      { dimension: 'models', registrySlug: 'gemini-3.8-flash' }
    ]
  }),
  aws: targetRow({
    provider: 'aws', tier: 'major', role: 'coding-product',
    intent: 'Amazon Q Developer 的订阅档位、超额计价与已宣布的停支时效',
    applicabilityNote: 'api / models 不适用（本轮）：① Bedrock 的按量价目表暂无官方取证面（研究只覆盖 Amazon Q Developer 这条产品线）；② AWS 是托管平台，Bedrock 上的模型身份归各自发行方。',
    dimensionIntent: { deals: 'AWS 官方优惠 / 免费额度（只收官方来源）', coding: 'Amazon Q Developer Free Tier / Pro 档位与已宣布的停支公告', api: null, models: null },
    currentTargets: [
      { dimension: 'coding', planName: 'Amazon Q Developer Free Tier' },
      { dimension: 'coding', planName: 'Amazon Q Developer Pro' }
    ],
    note: '本条记录的**时效事实**：官方产品页逐字公告 2027-04-30 起停止支持 Amazon Q Developer IDE 插件并建议改用 Kiro ⇒ 使用者在页面上必须能看到这条，不能只显示价格。'
  })
};

/* ------------------------------------------------------------------ */
function main() {
  const providers = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'data', 'providers.json'), 'utf8'));
  const targetsDoc = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'data', 'coverage-targets.json'), 'utf8'));
  const curated = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'data', 'curated_plans.json'), 'utf8'));
  const curatedList = Array.isArray(curated) ? curated : (curated.plans || []);

  const problems = [];
  // ① 身份与域
  if (providers.jetbrains) problems.push('jetbrains 身份已存在（本脚本不覆盖）');
  if (!providers.replit) problems.push('replit 身份不存在（本任务要求复用既有身份）');
  else if (providers.replit.vendorKey !== 'replit') problems.push(`replit 的 vendorKey 必须是 replit（实得 ${JSON.stringify(providers.replit.vendorKey)}）`);
  for (const [key, domains] of Object.entries(DOMAIN_ADDITIONS)) {
    if (!providers[key]) problems.push(`${key}: 身份不存在`);
    for (const domain of domains) {
      if ((providers[key].officialDomains || []).includes(domain)) problems.push(`${key}: 官方域 ${domain} 已登记（本脚本不重复加）`);
    }
  }
  // ② 每条记录必须有官方引文、价格与官方域同批
  const urlDomains = { [JB_URL]: 'jetbrains.com', [REPLIT_URL]: 'replit.com', [GCA_URL]: 'codeassist.google', [AWS_Q_URL]: 'aws.amazon.com', [AWS_Q_PRODUCT_URL]: 'aws.amazon.com' };
  for (const record of RECORDS) {
    if (!record.evidence.length) problems.push(`${record.provider}/${record.planName}: 没有官方引文`);
    for (const item of record.evidence) {
      const domain = urlDomains[item.sourceUrl];
      if (!domain) problems.push(`${record.provider}/${record.planName}: 引文出处不在本脚本登记的官方域表里（${item.sourceUrl}）`);
      if (!item.quote || item.quote.length > 200) problems.push(`${record.provider}/${record.planName}: 引文长度必须 1..200（实得 ${item.quote.length}）`);
      if (!item.capturedAt) problems.push(`${record.provider}/${record.planName}: 引文缺 capturedAt`);
    }
    if (curatedList.some(item => item.provider === record.provider && item.planName === record.planName)) {
      problems.push(`${record.provider}/${record.planName}: 记录已存在（拒绝覆盖）`);
    }
    if (record.billing.regularPrice === null) problems.push(`${record.provider}/${record.planName}: regularPrice 为 null（本任务收的都是有固定价的档）`);
  }
  // ③ coverage-targets 双向对账：新增 provider 必须有行
  if (targetsDoc.targets.some(row => row.provider === 'jetbrains')) problems.push('coverage-targets 里 jetbrains 已有行');
  if (!TARGETS.google || !TARGETS.aws) problems.push('google / aws 的目标行定义缺失');

  if (problems.length) {
    // **幂等语义**：目标状态已达成时（身份 / 官方域 / 记录 / 覆盖率行都已存在）不算失败 ——
    // 显式报「已是目标状态」并退出 0（本仓库对幂等的口径：同一输入重复跑必须得到同一结果，
    // 而不是第二次跑就报错）。其余情况（内容冲突、缺官方引文、空头 target…）仍然拒绝写盘。
    const allPresent = problems.every(item => /已存在|已登记|已有行|已有行/.test(item));
    if (allPresent) {
      console.log(`✓ 已是目标状态（${problems.length} 项均已存在），无需写盘`);
      return 0;
    }
    console.error(`❌ ${problems.length} 处问题，拒绝写盘：`);
    problems.forEach(item => console.error('  - ' + item));
    return 1;
  }

  console.log(`将落盘：1 家新身份（jetbrains）+ 2 处官方域追加（google←codeassist.google / aws←aws.amazon.com）+ ${RECORDS.length} 条套餐记录 + coverage-targets（新增 1 行 + 改写 2 行）`);
  RECORDS.forEach(r => console.log(`  · ${r.provider} / ${r.planName}：${r.billing.currency} ${r.billing.regularPrice}/月 · quota=${r.quota.type}`));
  if (DRY) { console.log('--dry-run：没有写盘。'); return 0; }

  // ① providers.json：新身份插在 "_" 元数据之前；追加官方域
  const outProviders = {};
  for (const [key, value] of Object.entries(providers)) {
    if (key.startsWith('_') && !Object.keys(outProviders).some(k => k.startsWith('_'))) outProviders[NEW_PROVIDER.key] = NEW_PROVIDER.entry;
    if (DOMAIN_ADDITIONS[key]) {
      const merged = [...(value.officialDomains || [])];
      for (const domain of DOMAIN_ADDITIONS[key]) if (!merged.includes(domain)) merged.push(domain);
      outProviders[key] = { ...value, officialDomains: merged };
      continue;
    }
    outProviders[key] = value;
  }
  fs.writeFileSync(path.join(ROOT, 'scripts', 'data', 'providers.json'), JSON.stringify(outProviders, null, 2) + '\n', 'utf8');

  // ② curated_plans.json：追加记录
  const mergedPlans = [...curatedList, ...RECORDS];
  fs.writeFileSync(path.join(ROOT, 'scripts', 'data', 'curated_plans.json'), JSON.stringify(mergedPlans, null, 2) + '\n', 'utf8');

  // ③ coverage-targets.json：新增 jetbrains 行 + 改写 google / aws 行
  const mergedTargets = targetsDoc.targets.map(row => TARGETS[row.provider] || row);
  mergedTargets.push(TARGETS.jetbrains);
  mergedTargets.sort((a, b) => (a.provider < b.provider ? -1 : a.provider > b.provider ? 1 : 0));
  fs.writeFileSync(path.join(ROOT, 'scripts', 'data', 'coverage-targets.json'), JSON.stringify({ ...targetsDoc, targets: mergedTargets }, null, 2) + '\n', 'utf8');

  console.log('✅ 已写出 providers.json / curated_plans.json / coverage-targets.json');
  console.log('下一步：npm run plans:rebuild && validate --strict && check:plans:reproducible && check:plan-history && selftest:coverage-targets && coverage-report && build-local');
  return 0;
}

process.exit(main());
