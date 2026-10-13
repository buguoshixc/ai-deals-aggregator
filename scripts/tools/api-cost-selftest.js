#!/usr/bin/env node
/**
 * API 成本计算器演练（离线、零依赖、可重跑）。
 *
 * 它演练的是**计算器自己的承诺**（任务书 §4 / §5）：
 *   · 缺维度绝不回退标准价（cachedInput 缺了不能拿 input 价顶上）；
 *   · 0 与 null 是两句不同的话（官方免费 = 0 能算出 0，没有 = null 算不出）；
 *   · 每个维度的 cost = rate × tokens / divisor × requests，且与 total 一致；
 *   · mediaRates 条目不进 token 计算器；
 *   · input=null 的条目（gpt-live-1）不进 token 计算器。
 *
 * 两条 Tooth Test 都是**实跑**：把东西弄坏 → 断言必须变红 → 复原后必须回到绿。
 * 「断言不是恒红」与「断言真的会红」同等重要（本仓的既有纪律）。
 */

'use strict';

const path = require('path');
const costLib = require('../lib/api-cost');
const data = require(path.join(__dirname, '..', '..', 'api-plans.json'));

let passed = 0;
const failures = [];

function check(name, ok, detail) {
  if (ok) { passed++; console.log(`  \u2713 ${name}`); }
  else { failures.push(name); console.log(`  \u2717 ${name}${detail ? ` \u2014\u2014 ${detail}` : ''}`); }
}

function section(title) {
  console.log(`\n${title}`);
}

const computeCost = costLib.computeCost;
const isComputable = costLib.isComputable;
const parseTokens = costLib.parseTokens;
const formatNumber = costLib.formatNumber;
const UNIT_DIVISORS = costLib.UNIT_DIVISORS;

const FIXED_WORKLOAD = {
  inputTokens: 1000000,
  outputTokens: 500000,
  cachedInputTokens: 200000,
  cacheWriteTokens: 100000,
  cacheWriteLongTokens: 50000,
  requests: 1
};

const allModels = [];
for (const plan of data.plans) {
  for (const model of plan.models) {
    allModels.push({ plan, model });
  }
}

/* ================================================================== */
section('\u2460 108 条逐条对账：用固定 workload 跑全部模型');
/* ================================================================== */

let computableCount = 0;
let nonComputableCount = 0;

for (let i = 0; i < allModels.length; i++) {
  const { plan, model } = allModels[i];
  const label = `${plan.provider}/${model.modelKey}/${model.variant || 'standard'}`;
  const result = computeCost(plan, model, FIXED_WORKLOAD);

  // 1. isComputable 与 computeCost 的判断一致
  const ic = isComputable(model);
  check(`[${i + 1}] ${label}: isComputable 与 computeCost 一致`,
    ic.computable === result.computable,
    `isComputable=${ic.computable} computeCost=${result.computable}`);

  if (!result.computable) {
    nonComputableCount++;
    // 不可计算的原因必须是已知的
    check(`[${i + 1}] ${label}: 不可计算原因已知 (${result.reason})`,
      result.reason === 'non-token-pricing' || result.reason === 'no-input-price' || result.reason === 'unknown-unit' || result.reason === 'no-computable-dimensions',
      `reason=${result.reason}`);
    continue;
  }

  computableCount++;

  // 2. currency 与 plan 一致
  check(`[${i + 1}] ${label}: currency == plan.pricing.currency`,
    result.currency === plan.pricing.currency,
    `${result.currency} vs ${plan.pricing.currency}`);

  // 3. unit 与 plan 一致
  check(`[${i + 1}] ${label}: unit == plan.pricing.unit`,
    result.unit === plan.pricing.unit,
    `${result.unit} vs ${plan.pricing.unit}`);

  // 4. 每个维度的 cost 验证
  const divisor = UNIT_DIVISORS[plan.pricing.unit];
  let expectedTotal = 0;
  const dims = ['input', 'output', 'cachedInput', 'cacheWrite', 'cacheWriteLong'];

  for (const dim of dims) {
    const rate = model.rates[dim];
    const dimResult = result.dimensions[dim];
    const tokenKey = dim + 'Tokens';
    const tokens = FIXED_WORKLOAD[tokenKey] || 0;

    if (rate === null || rate === undefined) {
      // 无价：维度不可计算
      check(`[${i + 1}] ${label}: ${dim} 无价 -> 不可计算`,
        dimResult.computable === false,
        `computable=${dimResult.computable}`);

      // 用户填了 tokens 但没价 -> no-rate-for-filled-dimension
      if (tokens > 0) {
        check(`[${i + 1}] ${label}: ${dim} 用户填了但无价 -> no-rate-for-filled-dimension`,
          dimResult.reason === 'no-rate-for-filled-dimension',
          `reason=${dimResult.reason}`);
      }
    } else {
      // 有价：可计算
      check(`[${i + 1}] ${label}: ${dim} 有价 -> 可计算`,
        dimResult.computable === true,
        `computable=${dimResult.computable}`);

      // cost = rate * tokens / divisor * requests
      var expectedCost = costLib.round((rate * tokens * FIXED_WORKLOAD.requests) / divisor);
      check(`[${i + 1}] ${label}: ${dim} cost == rate*token/divisor*req`,
        dimResult.cost === expectedCost,
        `got=${dimResult.cost} expected=${expectedCost}`);

      // rate=0 -> cost=0 (free)
      if (rate === 0) {
        check(`[${i + 1}] ${label}: ${dim} rate=0 -> cost=0 (free)`,
          dimResult.cost === 0,
          `cost=${dimResult.cost}`);
      }

      expectedTotal += expectedCost;
    }
  }

  // 5. total == sum of computable dimensions
  check(`[${i + 1}] ${label}: total == sum of dimensions`,
    result.total === costLib.round(expectedTotal),
    `got=${result.total} expected=${costLib.round(expectedTotal)}`);

  // 6. planId / officialUrl / lastSeen 存在
  check(`[${i + 1}] ${label}: planId 存在`, !!result.planId);
  check(`[${i + 1}] ${label}: officialUrl 存在`, !!result.officialUrl);
  check(`[${i + 1}] ${label}: lastSeen 存在`, !!result.lastSeen);
}

check(`computable: ${computableCount} / non-computable: ${nonComputableCount} / total: ${allModels.length}`,
  computableCount + nonComputableCount === allModels.length);

/* ================================================================== */
section('\u2461 \u3014\u7259\u3015input/output \u4e92\u6362 => \u7ea2');
/* ================================================================== */

{
  // 取一个 input != output 的模型
  const entry = allModels.find(e => {
    const r = e.model.rates;
    return r.input !== null && r.output !== null && r.input !== r.output;
  });
  check('\u627e\u5230 input!=output \u7684\u6a21\u578b\uff08\u7259\u7684\u524d\u7f6e\u6761\u4ef6\uff09', !!entry,
    entry ? '' : '\u6ca1\u6709 input!=output \u7684\u6a21\u578b');

  if (entry) {
    const { plan, model } = entry;
    const original = computeCost(plan, model, FIXED_WORKLOAD);

    // \u6b63\u5e38\u60c5\u51b5\uff1ainput cost != output cost\uff08\u56e0\u4e3a rate \u4e0d\u540c\uff09
    check('\u6b63\u5e38\uff1ainput cost != output cost\uff08rate \u4e0d\u540c\u5219 cost \u4e0d\u540c\uff09',
      original.dimensions.input.cost !== original.dimensions.output.cost,
      `input=${original.dimensions.input.cost} output=${original.dimensions.output.cost}`);

    // \u4e92\u6362 rates.input \u548c rates.output
    const tamperedModel = JSON.parse(JSON.stringify(model));
    const tmp = tamperedModel.rates.input;
    tamperedModel.rates.input = tamperedModel.rates.output;
    tamperedModel.rates.output = tmp;

    const tampered = computeCost(plan, tamperedModel, FIXED_WORKLOAD);

    // \u4e92\u6362\u540e\uff1anew input cost = old output rate * inputTokens / divisor
    var divisor = UNIT_DIVISORS[plan.pricing.unit];
    var expectedNewInput = costLib.round(model.rates.output * FIXED_WORKLOAD.inputTokens / divisor);
    check('\u3014\u7259\u3015\u4e92\u6362\u540e\uff1anew input cost == old_output_rate * input_tokens',
      tampered.dimensions.input.cost === expectedNewInput,
      `new_input=${tampered.dimensions.input.cost} expected=${expectedNewInput}`);

    // \u4e92\u6362\u540e\uff1anew output cost = old input rate * outputTokens / divisor
    var expectedNewOutput = costLib.round(model.rates.input * FIXED_WORKLOAD.outputTokens / divisor);
    check('\u3014\u7259\u3015\u4e92\u6362\u540e\uff1anew output cost == old_input_rate * output_tokens',
      tampered.dimensions.output.cost === expectedNewOutput,
      `new_output=${tampered.dimensions.output.cost} expected=${expectedNewOutput}`);

    // \u5982\u679c computeCost \u6709 bug\uff08\u4e0d\u533a\u5206 input/output\uff09\uff0c\u4e92\u6362\u540e\u7ed3\u679c\u4e0d\u4f1a\u53d8
    check('\u3014\u7259\u3015\u4e92\u6362\u540e\u7ed3\u679c\u786e\u5b9e\u53d8\u4e86\uff08\u8bc1\u660e\u4e0d\u662f\u6052\u7eff\uff09',
      tampered.dimensions.input.cost !== original.dimensions.input.cost,
      `\u4e92\u6362\u524d\u540e input cost \u76f8\u540c\uff0c\u8bf4\u660e computeCost \u672a\u533a\u5206 input/output`);
  }
}

/* ================================================================== */
section('\u2462 \u3014\u7259\u3015\u7f3a cachedInput \u56de\u9000\u5230 input \u4ef7 => \u7ea2');
/* ================================================================== */

{
  // \u53d6\u4e00\u4e2a cachedInput=null \u4f46\u6709 input \u4ef7\u7684\u6a21\u578b
  const entry = allModels.find(e => {
    const r = e.model.rates;
    return r.input !== null && r.input !== undefined && r.cachedInput === null;
  });
  check('\u627e\u5230 cachedInput=null \u4f46\u6709 input \u4ef7\u7684\u6a21\u578b\uff08\u7259\u7684\u524d\u7f6e\u6761\u4ef6\uff09', !!entry,
    entry ? '' : '\u6ca1\u6709 cachedInput=null \u7684\u6a21\u578b');

  if (entry) {
    const { plan, model } = entry;
    const inputs = {
      inputTokens: 1000000,
      outputTokens: 500000,
      cachedInputTokens: 200000, // \u586b\u4e86 cachedInput tokens
      requests: 1
    };

    const result = computeCost(plan, model, inputs);

    // \u5173\u952e\u65ad\u8a00\uff1acachedInput \u7ef4\u5ea6\u4e0d\u53ef\u8ba1\u7b97\uff08\u6ca1\u6709\u56de\u9000\u5230 input \u4ef7\uff09
    check('\u7f3a cachedInput -> \u7ef4\u5ea6\u4e0d\u53ef\u8ba1\u7b97\uff08\u4e0d\u56de\u9000 input \u4ef7\uff09',
      result.dimensions.cachedInput.computable === false,
      `computable=${result.dimensions.cachedInput.computable}`);

    check('\u7f3a cachedInput -> reason=no-rate-for-filled-dimension',
      result.dimensions.cachedInput.reason === 'no-rate-for-filled-dimension',
      `reason=${result.dimensions.cachedInput.reason}`);

    check('\u7f3a cachedInput -> cost=null\uff08\u4e0d\u662f 0\uff09',
      result.dimensions.cachedInput.cost === null,
      `cost=${result.dimensions.cachedInput.cost}`);

    // total \u4e0d\u5305\u542b cachedInput\uff08\u56e0\u4e3a\u5b83\u4e0d\u53ef\u8ba1\u7b97\uff09
    // \u671f\u671b\u503c\u4ece**\u9010\u7ef4\u5ea6\u7ed3\u679c**\u6d3e\u751f\uff08\u53ea\u628a cost \u975e null \u7684\u7ef4\u5ea6\u52a0\u8fdb\u6765\uff09\uff0c
    // \u4e0d\u518d\u5728\u8fd9\u91cc\u91cd\u7b97\u4e00\u904d rate \u00d7 tokens / divisor \u516c\u5f0f\u3002\u4e24\u4e2a\u7406\u7531\uff1a
    //   \u2460 \u91cd\u7b97\u516c\u5f0f\u628a\u300c\u6c47\u603b\u300d\u8fd9\u4e00\u6b65\u7684\u5224\u636e\u964d\u7ea7\u6210\u300c\u6211\u6284\u7684\u516c\u5f0f\u5bf9\u4e0d\u5bf9\u300d\uff1b
    //     \u4ece\u7ef4\u5ea6\u6d3e\u751f\u624d\u771f\u7684\u5728\u95ee\u300c\u5e93\u91cc\u7684\u805a\u5408\u6709\u6ca1\u6709\u6f0f\u52a0 / \u591a\u52a0\u300d\u2014\u2014\u65ad\u8a00\u66f4\u5f3a\u3002
    //   \u2461 \u516c\u5f0f\u91cd\u7b97\u8981\u6c42\u5728\u8fd9\u91cc\u518d\u5199\u4e00\u6b21\u5355\u4f4d\u6362\u7b97\uff08\u4e58\u4e0a\u6bcf 1M \u7684\u56e0\u5b50\uff09\uff0c
    //     \u800c api-plans-selftest \u7684\u3010\u7259\u00b7\u4ee3\u7801\u9762\u3011\u626b\u63cf scripts/**\uff0c\u628a\u300c\u4ef7\u683c\u6807\u8bc6\u7b26\u4e0e
    //     \u6362\u7b97\u56e0\u5b50\u540c\u5904\u4e00\u4e2a\u7b97\u672f\u8868\u8fbe\u5f0f\u300d\u5224\u4e3a\u6362\u7b97\u8def\u5f84\u2014\u2014\u5b83\u4f1a\u626b\u5230\u672c\u6587\u4ef6\u81ea\u5df1\u3002
    //     \u5355\u4f4d\u6362\u7b97\u5728\u672c\u4ed3\u5e93\u552f\u4e00\u5408\u6cd5\u7684\u843d\u70b9\u662f lib/api-cost.js \u7684 UNIT_DIVISORS\u3002
    // \u6ce8\u610f\uff1a\u4e0d\u80fd\u62ff result.total \u5f53\u671f\u671b\u503c\u2014\u2014\u90a3\u662f\u628a\u65ad\u8a00\u5199\u6210\u6052\u771f\u3002
    var dimensionNames = ['input', 'output', 'cachedInput', 'cacheWrite', 'cacheWriteLong'];
    var expectedTotal = 0;
    for (var di = 0; di < dimensionNames.length; di++) {
      var dimCost = result.dimensions[dimensionNames[di]].cost;
      if (dimCost !== null && dimCost !== undefined) expectedTotal += dimCost;
    }
    expectedTotal = costLib.round(expectedTotal);
    check('total \u4e0d\u5305\u542b cachedInput\uff08\u53ea\u6709 input+output\uff09',
      result.total === expectedTotal,
      `got=${result.total} expected=${expectedTotal}`);

    // \u7259\uff1a\u5982\u679c\u6709\u4eba\u7be6\u6539 computeCost \u8ba9\u5b83\u56de\u9000\uff0c\u4f1a\u600e\u6837\uff1f
    // \u624b\u52a8\u6a21\u62df\u201c\u56de\u9000\u201d\uff1a\u628a cachedInput \u8bbe\u6210 input \u7684\u503c
    const fallbackModel = JSON.parse(JSON.stringify(model));
    fallbackModel.rates.cachedInput = model.rates.input; // \u4eba\u4e3a\u56de\u9000

    const fallbackResult = computeCost(plan, fallbackModel, inputs);

    // \u56de\u9000\u540e\uff1acachedInput \u53d8\u6210\u53ef\u8ba1\u7b97\uff08\u8bc1\u660e\u5982\u679c\u6709\u56de\u9000\uff0c\u7ed3\u679c\u4f1a\u4e0d\u540c\uff09
    check('\u3014\u7259\u3015\u5982\u679c\u56de\u9000\uff08\u624b\u52a8\u8bbe cachedInput=input\uff09\uff0c\u7ed3\u679c\u4f1a\u4e0d\u540c\uff08\u8bc1\u660e\u65ad\u8a00\u4e0d\u662f\u6052\u7eff\uff09',
      fallbackResult.dimensions.cachedInput.computable === true,
      `\u56de\u9000\u540e cachedInput \u4ecd\u4e0d\u53ef\u8ba1\u7b97\uff0c\u8bf4\u660e\u65ad\u8a00\u6709 bug`);

    check('\u3014\u7259\u3015\u56de\u9000\u540e total \u53d8\u5927\uff08\u591a\u7b97\u4e86 cachedInput \u7684\u94b1\uff09',
      fallbackResult.total > result.total,
      `\u56de\u9000\u524d ${result.total} \u540e ${fallbackResult.total}`);

    // \u539f\u59cb\u7ed3\u679c\u4e2d cachedInput.cost == null\uff08\u8bc1\u660e\u6ca1\u6709\u56de\u9000\uff09
    check('\u3014\u7259\u3015\u539f\u59cb\u7ed3\u679c cachedInput.cost == null\uff08\u8bc1\u660e\u672a\u56de\u9000\uff09',
      result.dimensions.cachedInput.cost === null);
  }
}

/* ================================================================== */
section('\u2463 parseTokens \u8f93\u5165\u89e3\u6790');
/* ================================================================== */

check('\u7a7a\u4e32 -> 0, valid', parseTokens('').value === 0 && parseTokens('').valid);
check('null -> 0, valid', parseTokens(null).value === 0 && parseTokens(null).valid);
check('\u5343\u5206\u4f4d 1,234,567 -> 1234567', parseTokens('1,234,567').value === 1234567);
check('\u8d1f\u6570 -> invalid', !parseTokens('-5').valid);
check('\u5168\u89d2\u6570\u5b57 -> \u534a\u89d2', parseTokens('\uFF11\uFF12\uFF13').value === 123);
check('\u8d85\u5927\u6570 -> overflow', !parseTokens('1e16').valid);

/* ================================================================== */
section('\u2464 formatNumber \u683c\u5f0f\u5316');
/* ================================================================== */

check('0 -> 0', formatNumber(0) === '0');
check('null -> \u2014', formatNumber(null) === '\u2014');
check('1234.5 -> 1,234.50', formatNumber(1234.5) === '1,234.50');
check('0.0001 -> 0.000100', formatNumber(0.0001) === '0.000100');
check('\u5c0f\u6570\u4e0d\u7528 toLocaleString\uff08\u8de8 locale \u4e0d\u6f02\uff09', formatNumber(1234567.89).includes(','));

/* ================================================================== */
section('\u2465 \u7981\u8bcd\u6e05\u5355\u5bfc\u5165');
/* ================================================================== */

check('FORBIDDEN_CLAIM_WORDS \u4ece plans-page.js \u5bfc\u5165',
  Array.isArray(costLib.FORBIDDEN_CLAIM_WORDS) && costLib.FORBIDDEN_CLAIM_WORDS.length > 0,
  `count=${costLib.FORBIDDEN_CLAIM_WORDS.length}`);

/* ================================================================== */
console.log(`\n=== API \u6210\u672c\u8ba1\u7b97\u5668\u6f14\u7ec3\uff1a${passed} \u9879\u901a\u8fc7\uff0c${failures.length} \u9879\u5931\u8d25 ===`);
process.exit(failures.length > 0 ? 1 : 0);
