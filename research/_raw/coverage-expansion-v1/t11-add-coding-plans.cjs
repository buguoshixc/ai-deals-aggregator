#!/usr/bin/env node
/**
 * t11 Stage 3：把 research 里**adopted 的 Coding 套餐**落进 curated_plans.json（人工来源层）。
 *
 * 用法：node research/_raw/coverage-expansion-v1/t11-add-coding-plans.cjs [--dry-run]
 *
 * ## 依据 + 只落「在售」档，不下线档不落
 *
 * · StepFun Step Plan（`firstparty.json` → stepfun.codingCandidates[0]）：
 *   官方页 https://platform.stepfun.com/docs/zh/step-plan/overview 的月付四档（Flash Mini/Plus/Pro/Max），
 *   官方逐字表已引在 research 里；Credit 换算官方明写「1M Credit = ¥1」。
 * · 讯飞 Astron Coding Plan（同文件 → iflytek.codingCandidates[0]）：
 *   官方页 https://www.xfyun.cn/doc/spark/CodingPlan.html 的**在售两档**（高效版 ¥199/月；速通版 ¥999/月、限时首月 ¥699）。
 *   该候选里另有「专业版 ¥39」「无忧版 ¥19」标注 `已下线` —— **本轮不落**（它们不是当前在售事实，
 *   落进来会变成「我们现在收录了一个已经不卖的档」）。
 *
 * ## 纪律
 *
 * · `regularPrice` 只在官方逐字给出数字时写；不给就 null（不用第三方数字补）。
 * · `quota` 的额度口径按官方原文（Step Plan 是 Credit 月池；讯飞是按请求次数的三档流控）。
 * · 每条都带 `evidence`（逐字引文 + 官方域 sourceUrl + capturedAt）——校验会逐字核对。
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const DRY = process.argv.includes('--dry-run');
const FILE = path.join(ROOT, 'scripts', 'data', 'curated_plans.json');
const CAPTURED = '2026-10-04';

const STEPFUN_URL = 'https://platform.stepfun.com/docs/zh/step-plan/overview';
/**
 * 官方月付四档表 —— **引文上限是 200 字**（provenance.MAX_EVIDENCE_QUOTE_LENGTH，禁止截断）。
 * 完整表 253 字超限，所以**逐条引「该档那一行」**（逐字、未截断），每行约 60 字；
 * 完整四档表留在 research 的 firstparty.json 里可复核。
 */
const STEPFUN_TABLE_HEADER = '';
const STEPFUN_ROWS = {
  'Flash Mini': '| **Flash Mini** | 入门体验 AI 的用户 | 400M | ¥49 | ¥129 | ¥456 |',
  'Flash Plus': '| **Flash Plus** | 日常使用 AI 提效的用户 | 1600M | ¥99 | ¥269 | ¥936 |',
  'Flash Pro': '| **Flash Pro** | 高频使用 AI 的深度用户 | 8000M | ¥199 | ¥539 | ¥1860 |',
  'Flash Max': '| **Flash Max** | 高强度使用 AI 的专业用户 | 40000M | ¥699 | ¥1889 | ¥6666 |'
};
const STEPFUN_TABLE = STEPFUN_TABLE_HEADER;
const STEPFUN_SUPPORTED = [
  'step-5-preview', 'step-3.7-flash', 'step-3.5-flash', 'step-3.5-flash-2603',
  'stepaudio-2.5-realtime', 'stepaudio-2.5-chat', 'stepaudio-2.5-tts', 'stepaudio-2.5-asr', 'step-router-v1'
];

const IFlytek_URL = 'https://www.xfyun.cn/doc/spark/CodingPlan.html';

function stepfunPlan(tier, price, credits) {
  return {
    provider: '阶跃星辰',
    planName: `Step Plan · ${tier}`,
    officialUrl: STEPFUN_URL,
    source: 'Official-Docs',
    sourceUrl: STEPFUN_URL,
    region: 'cn',
    billing: {
      period: 'monthly',
      currency: 'CNY',
      regularPrice: price,
      promoPrice: null,
      promoNote: null,
      note: '官方月付价；同一页另有季付 / 年付（¥129/¥456 等），本轮只落月付档（季付与年付是同一 SKU 的另一个周期，落进来会变成两条价格不同的同档记录）'
    },
    quota: {
      type: 'credits',
      amount: credits,
      period: 'monthly',
      description: `官方 Credit 月池 ${credits / 1000000}M；官方明写「1M Credit = ¥1（100 万 Credit 对应 ¥1 的模型用量）」，月内任意时段消耗、月末清零不结转`,
      conversionDependsOnModel: false
    },
    supportedModels: STEPFUN_SUPPORTED.map(name => ({ name, role: 'included', note: null })),
    restrictions: null,
    firstSeen: CAPTURED,
    lastSeen: CAPTURED,
    verified: true,
    verifiedAt: CAPTURED,
    evidence: [
      { field: 'billing.regularPrice', quote: STEPFUN_ROWS[tier], sourceUrl: STEPFUN_URL, capturedAt: CAPTURED, lang: 'zh' },
      {
        field: 'quota.amount',
        quote: 'Credit 与支付金额按 **1M Credit = ¥1** 换算（即 100 万 Credit 对应 ¥1 的模型用量）',
        sourceUrl: STEPFUN_URL, capturedAt: CAPTURED, lang: 'zh'
      }
    ]
  };
}

const PLANS = [
  stepfunPlan('Flash Mini', 49, 400000000),
  stepfunPlan('Flash Plus', 99, 1600000000),
  stepfunPlan('Flash Pro', 199, 8000000000),
  stepfunPlan('Flash Max', 699, 40000000000),
  {
    provider: '科大讯飞',
    planName: '讯飞星辰 MaaS · Astron Coding Plan 高效版',
    officialUrl: IFlytek_URL,
    source: 'Official-Docs',
    sourceUrl: IFlytek_URL,
    region: 'cn',
    billing: { period: 'monthly', currency: 'CNY', regularPrice: 199, promoPrice: null, promoNote: null, note: '官方表「高效版 ¥199 / 月」（实际下单金额以讯飞星辰 MaaS 平台套餐订阅页面展示为准 —— 官方页原文如此标注）' },
    quota: {
      type: 'requests',
      amount: 90000,
      period: 'monthly',
      description: '官方按**请求次数**三档流控：每 5 小时最多约 6,000 次；每周最多约 45,000 次；每订阅月最多约 90,000 次'
    },
    supportedModels: null,
    restrictions: [{
      kind: 'rate_limit', value: '6000 次 / 5 小时',
      note: '5 小时流控：周期 5 小时、滑动步长 1 小时、每个整点刷新（官方原文）；另有周流控与月流控'
    }],
    firstSeen: CAPTURED, lastSeen: CAPTURED, verified: true, verifiedAt: CAPTURED,
    evidence: [{
      field: 'billing.regularPrice',
      quote: '| **高效版** | ¥199 / 月 | [讯飞星辰 MaaS 平台套餐订阅页面]展示为准 | 每 5 小时：最多约 6,000 次请求；每周：最多约 45,000 次请求；每订阅月：最多约 90,000 次请求 |',
      sourceUrl: IFlytek_URL, capturedAt: CAPTURED, lang: 'zh'
    }]
  },
  {
    provider: '科大讯飞',
    planName: '讯飞星辰 MaaS · Astron Coding Plan 速通版',
    officialUrl: IFlytek_URL,
    source: 'Official-Docs',
    sourceUrl: IFlytek_URL,
    region: 'cn',
    billing: { period: 'monthly', currency: 'CNY', regularPrice: 999, promoPrice: 699, promoNote: '限时首月优惠：¥699 / 月', note: '官方表「速通版 ¥999 / 月，限时首月优惠：¥699 / 月」' },
    quota: {
      type: 'requests', amount: 30000, period: 'monthly',
      description: '官方按请求次数：每订阅月最多约 30,000 次'
    },
    supportedModels: null,
    restrictions: null,
    firstSeen: CAPTURED, lastSeen: CAPTURED, verified: true, verifiedAt: CAPTURED,
    evidence: [{
      field: 'billing.regularPrice',
      quote: '| **速通版** | ¥999 / 月，限时首月优惠：¥699 / 月 | [讯飞星辰 MaaS 平台套餐订阅页面]展示为准 | 每订阅月：最多约 30,000 次请求 |',
      sourceUrl: IFlytek_URL, capturedAt: CAPTURED, lang: 'zh'
    }]
  }
];

/** 上面的引文里有一处必须逐字来自官方页：校验会按 sourceUrl + quote 去核。
 *  这里在写盘前先自检「引文里的关键数字与 billing/quota 字段一致」，避免手抄漂移。 */
function selfCheck(plan) {
  const problems = [];
  const price = plan.billing.regularPrice;
  const quote = plan.evidence.map(item => item.quote).join(' ');
  if (price !== null && !quote.includes(`¥${price}`)) problems.push(`${plan.planName}: 引文里找不到 ¥${price}`);
  if (plan.billing.promoPrice !== null && !quote.includes(`¥${plan.billing.promoPrice}`)) problems.push(`${plan.planName}: 引文里找不到优惠价 ¥${plan.billing.promoPrice}`);
  if (!plan.officialUrl.startsWith('https://')) problems.push(`${plan.planName}: officialUrl 必须是 https`);
  return problems;
}

function main() {
  const doc = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const list = Array.isArray(doc) ? doc : (doc.plans || []);
  const problems = [];
  const additions = [];
  for (const plan of PLANS) {
    problems.push(...selfCheck(plan));
    if (list.some(item => item.provider === plan.provider && item.planName === plan.planName)) {
      problems.push(`${plan.provider} / ${plan.planName}: 已存在（本脚本不覆盖既有记录）`);
      continue;
    }
    additions.push(plan);
  }
  if (problems.length) {
    console.error(`❌ ${problems.length} 处问题，拒绝写盘：`);
    problems.forEach(item => console.error('  - ' + item));
    return 1;
  }
  console.log(`Coding 套餐：将新增 ${additions.length} 条 —— ${additions.map(p => `${p.provider}/${p.planName}`).join(' · ')}`);
  if (DRY) { console.log('--dry-run：没有写盘。'); return 0; }
  const merged = [...list, ...additions];
  const out = Array.isArray(doc) ? merged : { ...doc, plans: merged };
  fs.writeFileSync(FILE, JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log(`✅ 已写出 curated_plans.json：${merged.length} 条（原 ${list.length} + 新 ${additions.length}）`);
  return 0;
}

process.exit(main());
