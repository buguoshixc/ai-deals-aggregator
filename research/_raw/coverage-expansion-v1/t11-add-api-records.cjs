#!/usr/bin/env node
/**
 * t11 Stage 4：落 **API 定价记录**（4 家国际推理平台）+ 同批补回它们的身份行与覆盖率目标行。
 *
 * 为什么「同批」是硬要求：`official.js` 的官方域守卫要求「每一条官方域登记都必须被仓库里
 * 真实记录的官方出处用到」——先加身份会红（我上一轮实测 7 处红），先加记录也会红（域没登记）。
 * 所以身份 / 官方域 / 记录 / 覆盖率目标行必须在**同一次运行**里一起写。
 *
 * 数据来源：`research/_raw/coverage-expansion-v1/inference.json` 的 `providers[*].publishedRates`
 * （逐条都是从官方页逐字取到的单价，modelId 即官方写法）。
 *
 * 用法：node research/_raw/coverage-expansion-v1/t11-add-api-records.cjs [--dry-run]
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const DRY = process.argv.includes('--dry-run');
const CAPTURED = '2026-10-04';
const TODAY = '2026-10-04';

const PROVIDERS_FILE = path.join(ROOT, 'scripts', 'data', 'providers.json');
const API_PLANS_FILE = path.join(ROOT, 'scripts', 'data', 'curated_api_plans.json');
const TARGETS_FILE = path.join(ROOT, 'scripts', 'data', 'coverage-targets.json');

/** 四家推理平台：身份（vendorKey 必须显式 null —— A 空间没有这家公司）+ 官方域 + 计价页 */
const PROVIDERS = {
  groq: {
    name: 'Groq', slug: 'groq', aliases: ['groq'], logo: 'groq', vendorKey: null,
    officialDomains: ['groq.com'],
    tier: 'major', intent: 'Groq 托管推理的官方按量计费（计价主体是 Groq，不是模型发行方）与速率限制'
  },
  together: {
    name: 'Together AI', slug: 'together', aliases: ['together ai', 'together'], logo: 'together', vendorKey: null,
    officialDomains: ['together.ai'],
    tier: 'major', intent: 'Together AI Serverless 的官方按量计费与逐模型 cached input 价'
  },
  fireworks: {
    name: 'Fireworks AI', slug: 'fireworks', aliases: ['fireworks ai', 'fireworks'], logo: 'fireworks', vendorKey: null,
    officialDomains: ['fireworks.ai'],
    tier: 'major', intent: 'Fireworks AI Serverless 的官方按量计费（Standard 与 Priority 两个通道）'
  },
  cerebras: {
    name: 'Cerebras', slug: 'cerebras', aliases: ['cerebras'], logo: 'cerebras', vendorKey: null,
    officialDomains: ['cerebras.ai'],
    tier: 'long-tail', intent: 'Cerebras Inference Developer 档的官方按量计费与一次性赠送额度'
  }
};

/** 官方计费记录（逐条来自 inference.json 的 publishedRates） */
const RECORDS = [
  {
    provider: 'groq', planName: '模型推理按量计费', channel: 'standard',
    officialUrl: 'https://console.groq.com/docs/models', region: 'global',
    pricing: { currency: 'USD', unit: 'per_1M_tokens', unitNote: '官方表列头逐字为 “PRICE PER 1M TOKENS”' },
    evidenceQuote: 'PRICE PER 1M TOKENS — GPT OSS 120B $0.15 / $0.60；GPT OSS 20B $0.075 / $0.30（官方 Supported Models 页逐字）',
    models: [
      { modelKey: 'openai.gpt-oss-120b', name: 'GPT OSS 120B', rates: { input: 0.15, output: 0.6, cachedInput: null }, note: '上下文 131,072 / 最大输出 65,536；速率限制 250K TPM / 1K RPM' },
      { modelKey: 'openai.gpt-oss-20b', name: 'GPT OSS 20B', rates: { input: 0.075, output: 0.3, cachedInput: null }, note: '上下文 131,072 / 最大输出 65,536；速率限制 250K TPM / 1K RPM' },
      { modelKey: 'openai.gpt-oss-safeguard-20b', name: 'GPT OSS Safeguard 20B', rates: { input: 0.075, output: 0.3, cachedInput: null }, note: null },
      { modelKey: 'meta-llama.prompt-guard-2-22m', name: 'Llama Prompt Guard 2 22M', rates: { input: 0.03, output: 0.03, cachedInput: null }, note: null },
      { modelKey: 'meta-llama.prompt-guard-2-86m', name: 'Llama Prompt Guard 2 86M', rates: { input: 0.04, output: 0.04, cachedInput: null }, note: null },
      { modelKey: 'qwen.qwen3.8-27b', name: 'Qwen 3.8 27B', rates: { input: 0.29, output: 0.59, cachedInput: null }, note: null }
    ],
    notesMustCarry: 'cache 折扣是 50% 比例（官方未给任一模型的 cached input 单价）；batch 折扣 50% 且不与 cache 叠加；flex 与标准同价；Llama 3.1 8B / 3.3 70B / MiniMax M2.7 仅企业档（官方价目格逐字 Contact Sales）；Whisper 的 per hour 与 Orpheus 的 per 1M characters 属非 token 计价，本轮未收'
  },
  {
    provider: 'together', planName: 'Serverless 按量计费', channel: 'standard',
    officialUrl: 'https://docs.together.ai/docs/serverless/models.md', region: 'global',
    pricing: { currency: 'USD', unit: 'per_1M_tokens', unitNote: '官方列头逐字 «Input pricing (per 1M tokens)» / «Cached input pricing (per 1M tokens)» / «Output pricing (per 1M tokens)»' },
    evidenceQuote: 'Input pricing (per 1M tokens) / Cached input pricing (per 1M tokens) / Output pricing (per 1M tokens) —— Inkling 1 / 0.17 / 4.05；Kimi K3 3 / 0.3 / 15（官方 serverless models 页逐字列头与两行）',
    models: [
      { modelKey: 'thinkingmachines.inkling', name: 'Inkling', rates: { input: 1, output: 4.05, cachedInput: 0.17 }, note: '上下文 524,288' },
      { modelKey: 'moonshotai.kimi-k3', name: 'Kimi K3', rates: { input: 3, output: 15, cachedInput: 0.3 }, note: '上下文 1,048,576' },
      { modelKey: 'zai-org.glm-5.3', name: 'GLM-5.3', rates: { input: 1.4, output: 4.4, cachedInput: 0.26 }, note: null },
      { modelKey: 'zai-org.glm-5.3-flash', name: 'GLM-5.3 Flash', rates: { input: 0.15, output: 0.5, cachedInput: 0.03 }, note: null },
      { modelKey: 'openai.gpt-oss-120b', name: 'GPT-OSS 120B', rates: { input: 0.15, output: 0.6, cachedInput: null }, note: '官方 Cached input 列是 `-`（不提供缓存计价）⇒ 按官方语义写 null，不是 0' },
      { modelKey: 'deepseek-ai.v4-pro-0813', name: 'DeepSeek V4 Pro 0813', rates: { input: 1.32, output: 3.96, cachedInput: 0.13 }, note: null },
      { modelKey: 'deepseek-ai.v4.1-flash', name: 'DeepSeek V4.1 Flash', rates: { input: 0.3, output: 1.2, cachedInput: 0.006 }, note: null },
      { modelKey: 'minimaxai.m3', name: 'MiniMax M3', rates: { input: 0.3, output: 1.2, cachedInput: 0.06 }, note: null }
    ],
    notesMustCarry: 'batch 是「up to 50%」且官方只点名模型；cached input 逐模型给出（没有该列的模型全部输入按标准价，官方原文如此）；图像/视频/音频另计且部分官方自称 estimate；表里的 Organization 列是模型发行方而不是计价方'
  },
  {
    provider: 'fireworks', planName: 'Serverless 按量计费', channel: 'standard',
    officialUrl: 'https://docs.fireworks.ai/serverless/pricing.md', region: 'global',
    pricing: { currency: 'USD', unit: 'per_1M_tokens', unitNote: '官方页逐字 “(USD per 1M tokens)”' },
    evidenceQuote: '(USD per 1M tokens) —— Model | Standard | Priority；Ember-1 3 / 15；Kimi K3 3 / 15；GLM 5.3 1.4 / 4.4（官方 serverless pricing 页逐字）',
    models: [
      // **Fireworks 的 modelKey 用官方页上的短名**（去掉 `fireworks/` 前缀）：schema 的 modelKey
      // 上限 60 字符且只允许 [a-z0-9._-]，而 `fireworks/nemotron-lightning-3p5-30b-a3b` 是 70 字符 /
      // 含斜杠 ⇒ 官方全名写进 name，modelKey 用可用的短名（这是 schema 的硬约束，不是改写官方写法）。
      { modelKey: 'ember-1', name: 'Ember-1（官方 modelId: fireworks/ember-1）', rates: { input: 3, output: 15, cachedInput: 0.3 }, note: null },
      { modelKey: 'kimi-k3', name: 'Kimi K3（官方 modelId: fireworks/kimi-k3）', rates: { input: 3, output: 15, cachedInput: 0.3 }, note: '官方同表另有 Fast 与 (US) 两行变体，本轮未收（见研究里的 DEFER-INF-05）' },
      { modelKey: 'deepseek-v4p1-flash', name: 'DeepSeek V4.1 Flash（官方 modelId: fireworks/deepseek-v4p1-flash）', rates: { input: 0.3, output: 1.2, cachedInput: 0.006 }, note: null },
      { modelKey: 'glm-5p3', name: 'GLM 5.3（官方 modelId: fireworks/glm-5p3）', rates: { input: 1.4, output: 4.4, cachedInput: 0.26 }, note: null },
      { modelKey: 'glm-5p3-flash', name: 'GLM 5.3 Flash（官方 modelId: fireworks/glm-5p3-flash）', rates: { input: 0.15, output: 0.5, cachedInput: 0.03 }, note: null },
      { modelKey: 'qwen3p8-max', name: 'Qwen 3.8 Max（官方 modelId: fireworks/qwen3p8-max）', rates: { input: 2, output: 6, cachedInput: 0.25 }, note: null },
      { modelKey: 'minimax-m3', name: 'MiniMax M3（官方 modelId: fireworks/minimax-m3）', rates: { input: 0.3, output: 1.2, cachedInput: 0.06 }, note: null },
      { modelKey: 'gpt-oss-120b', name: 'OpenAI GPT OSS 120B（官方 modelId: fireworks/gpt-oss-120b）', rates: { input: 0.15, output: 0.6, cachedInput: 0.015 }, note: null },
      { modelKey: 'nemotron-lightning-3p5-30b-a3b', name: 'NVIDIA Nemotron 3.5 Lightning 30B A3B', rates: { input: 0.05, output: 0.2, cachedInput: 0.01 }, note: '官方 modelId: fireworks/nemotron-lightning-3p5-30b-a3b' },
      { modelKey: 'nemotron-3-ultra-nvfp4', name: 'NVIDIA Nemotron 3 Ultra (Preview)', rates: { input: 0.6, output: 2.4, cachedInput: 0.12 }, note: '官方 modelId: fireworks/nemotron-3-ultra-nvfp4' }
    ],
    notesMustCarry: 'batch 50% 且与 prompt caching 叠加（两层折扣，官方明写）；Fast / US-only 变体未收；按参数量分档的兜底价与 embedding 价未收；Reserved Throughput 是非按量产品'
  },
  {
    provider: 'cerebras', planName: '推理按量计费 Developer 档', channel: 'standard',
    officialUrl: 'https://www.cerebras.ai/pricing', region: 'global',
    evidenceQuote: '$X.XX/M tokens（每百万 token）—— GPT OSS 120B $0.35 / $0.75；Qwen 3.8 27B $0.99 / $1.49（Developer 档逐字）',
    pricing: { currency: 'USD', unit: 'per_1M_tokens', unitNote: '官方价格单元格逐字为 `$X.XX/M tokens`（每百万 token）；同行的 Input / Output 是两个独立单元格，都使用该单位', },
    models: [
      { modelKey: 'gpt-oss-120b', name: 'GPT OSS 120B', rates: { input: 0.35, output: 0.75, cachedInput: null }, note: '官方 owner 标注 [OPENAI]；速度 ~3000 tokens/s' },
      { modelKey: 'qwen3.8-27b', name: 'Qwen 3.8 27B', rates: { input: 0.99, output: 1.49, cachedInput: null }, note: '官方 owner 标注 [QWEN]；速度 ~1,850 tokens/s' }
    ],
    notesMustCarry: '官方脚注逐字：For development, evaluation, and experimentation; not intended for production use。其余模型（Kimi K2.7 Code / GLM 5.1 / MiniMax M2.5 / Gemma 4 31B 等）只在 Dedicated Inference 下提供、走 Enterprise quote ⇒ 没有公开单价就不收进 models[]（schema 要求一条模型条目至少有一个价格事实）。$5 一次性 promotional credit 属优惠而不属 freeTier。官网完整 Tier 价目表是客户端渲染，本轮取不到',
    freeTier: null
  }
];

function orderedRecord(record) {
  const order = ['provider', 'planName', 'channel', 'officialUrl', 'source', 'sourceUrl', 'region', 'pricing', 'models', 'freeTier', 'limits', 'credits', 'restrictions', 'firstSeen', 'lastSeen', 'verified', 'verifiedAt', 'evidence'];
  const out = {};
  for (const key of order) if (record[key] !== undefined) out[key] = record[key];
  for (const key of Object.keys(record)) if (!(key in out)) out[key] = record[key];
  return out;
}

function buildRecord(spec) {
  const models = spec.models.map(item => ({
    name: item.name,
    modelKey: item.modelKey,
    variant: 'standard',
    aliases: null,
    rates: { input: item.rates.input, output: item.rates.output, cachedInput: item.rates.cachedInput },
    mediaRates: null,
    note: item.note
  }));
  return orderedRecord({
    provider: spec.provider,
    planName: spec.planName,
    channel: spec.channel,
    officialUrl: spec.officialUrl,
    source: 'Official-Docs',
    sourceUrl: spec.officialUrl,
    region: spec.region,
    pricing: spec.pricing,
    models,
    freeTier: spec.freeTier === undefined ? null : spec.freeTier,
    limits: null,
    credits: null,
    restrictions: null,
    firstSeen: TODAY,
    lastSeen: TODAY,
    verified: true,
    verifiedAt: TODAY,
    // 引文只允许挂在**允许表里的字段名**上（`models` 不在表里；`pricing.currency` 在）。
    // 官方引文逐字来自该记录自己的官方页；上限 200 字。
    evidence: [{
      field: 'pricing.currency',
      quote: spec.evidenceQuote.slice(0, 190),
      sourceUrl: spec.officialUrl,
      capturedAt: CAPTURED,
      lang: 'en'
    }]
  });
}

function main() {
  const providers = JSON.parse(fs.readFileSync(PROVIDERS_FILE, 'utf8'));
  const apiPlans = JSON.parse(fs.readFileSync(API_PLANS_FILE, 'utf8'));
  const targets = JSON.parse(fs.readFileSync(TARGETS_FILE, 'utf8'));
  const providersLib = require(path.join(ROOT, 'scripts', 'lib', 'providers.js'));
  const settings = providersLib.load();

  /* 覆盖率目标行：与身份/记录**同一批**写入（四维度按各自事实表态，只写盘上即将兑现的 api 目标） */
  const newRowsPlan = [
    {
      provider: 'groq', tier: 'major', role: 'inference-platform',
      intent: 'Groq 托管推理的官方按量计费（计价主体是 Groq，不是模型发行方）与速率限制',
      applicabilityNote: 'deals / coding / models 都不适用：① 本轮没有找到 Groq 官方页面上的优惠口径可引用；② 官方没有编程订阅套餐，只有按量 API 与企业合同；③ 平台托管的模型身份归各自的发行方（openai / meta / moonshot…），不归 Groq。',
      dimensionIntent: { deals: null, coding: null, api: 'GroqCloud 按量计费（production / preview 模型的公开单价表）', models: null },
      currentTargets: ['meta-llama.prompt-guard-2-22m', 'meta-llama.prompt-guard-2-86m', 'openai.gpt-oss-120b', 'openai.gpt-oss-20b', 'openai.gpt-oss-safeguard-20b', 'qwen.qwen3.8-27b'].sort().map(modelKey => ({ dimension: 'api', modelKey })),
      rulings: [], note: null
    },
    {
      provider: 'together', tier: 'major', role: 'inference-platform',
      intent: 'Together AI Serverless 的官方按量计费与逐模型 cached input 价',
      applicabilityNote: 'deals / coding / models 都不适用：① 本轮没有取到 Together 官方页上的优惠口径；② 官方只有按量 API 与企业合同，没有编程订阅套餐；③ 托管模型身份归各发行方。',
      dimensionIntent: { deals: null, coding: null, api: 'Together Serverless 按量计费（chat 模型逐条公开单价）', models: null },
      currentTargets: ['deepseek-ai.v4-pro-0813', 'deepseek-ai.v4.1-flash', 'minimaxai.m3', 'moonshotai.kimi-k3', 'openai.gpt-oss-120b', 'thinkingmachines.inkling', 'zai-org.glm-5.3', 'zai-org.glm-5.3-flash'].sort().map(modelKey => ({ dimension: 'api', modelKey })),
      rulings: [], note: null
    },
    {
      provider: 'fireworks', tier: 'major', role: 'inference-platform',
      intent: 'Fireworks AI Serverless 的官方按量计费（Standard 与 Priority 两个通道）',
      applicabilityNote: 'deals / coding / models 都不适用：① 本轮取到的 serverless pricing 页里没有任何 free tier 段落（freeTier 写 null=没查到，不得写 none）；② 官方没有编程订阅套餐；③ 托管模型身份归各发行方。',
      dimensionIntent: { deals: null, coding: null, api: 'Fireworks Serverless 按量计费（standard 通道；priority 通道本轮未逐条落）', models: null },
      currentTargets: ['fireworks/ember-1', 'fireworks/kimi-k3', 'fireworks/deepseek-v4p1-flash', 'fireworks/glm-5p3', 'fireworks/glm-5p3-flash', 'fireworks/qwen3p8-max', 'fireworks/minimax-m3', 'fireworks/gpt-oss-120b', 'fireworks/nemotron-lightning-3p5-30b-a3b', 'fireworks/nemotron-3-ultra-nvfp4'].sort().map(modelKey => ({ dimension: 'api', modelKey })),
      rulings: [], note: null
    },
    {
      provider: 'cerebras', tier: 'long-tail', role: 'inference-platform',
      intent: 'Cerebras Inference Developer 档的官方按量计费与一次性赠送额度',
      applicabilityNote: 'deals / coding / models 都不适用：① 官方 $5 一次性 promotional credit 属优惠而不属 freeTier，本轮没有可引用的公开优惠页；② 官方没有编程订阅套餐；③ 托管模型身份归各发行方。',
      dimensionIntent: { deals: null, coding: null, api: 'Cerebras Developer 档按量计费（官方页可逐字取到的两条模型行）', models: null },
      currentTargets: ['gpt-oss-120b', 'qwen3.8-27b'].map(modelKey => ({ dimension: 'api', modelKey })),
      rulings: [], note: null
    }
  ];

  const problems = [];
  const additions = [];

  for (const [key, meta] of Object.entries(PROVIDERS)) {
    if (!RECORDS.some(record => record.provider === key)) problems.push(`${key}: 没有对应的 API 记录（身份不能单独落——官方域守卫会红）`);
    if (Object.prototype.hasOwnProperty.call(providers, key)) problems.push(`${key}: providers.json 里已有该键（本脚本不覆盖）`);
    if (Object.values(providers).some(entry => entry && entry.slug === meta.slug)) problems.push(`${key}: slug「${meta.slug}」已被占用`);
    if (Object.values(providers).some(entry => entry && entry.name === meta.name)) problems.push(`${key}: 显示名「${meta.name}」已被占用`);
    // 覆盖率目标行**由本脚本同一批写入**（见下方的 newRows），所以这里只检查「本批会不会漏掉它」
    if (!newRowsPlan.some(row => row.provider === key)) problems.push(`${key}: 本批没有为它准备 coverage-targets 行`);
  }
  for (const spec of RECORDS) {
    const record = buildRecord(spec);
    if (apiPlans.some(item => item.provider === spec.provider && item.planName === spec.planName)) {
      problems.push(`${spec.provider}/${spec.planName}: 记录已存在`);
      continue;
    }
    // 模型键不得在同一记录里重复
    const keys = record.models.map(model => model.modelKey);
    if (new Set(keys).size !== keys.length) problems.push(`${spec.provider}: 同一记录里 modelKey 重复`);
    additions.push(record);
  }

  if (problems.length) {
    console.error(`❌ ${problems.length} 处问题，拒绝写盘：`);
    problems.forEach(item => console.error('  - ' + item));
    return 1;
  }

  console.log(`将落盘：${Object.keys(PROVIDERS).length} 家身份 + ${Object.keys(PROVIDERS).length} 条官方域 + ${additions.length} 条 API 记录（共 ${additions.reduce((sum, r) => sum + r.models.length, 0)} 个模型计价条目）`);
  console.log(`  记录：${additions.map(r => `${r.provider}/${r.planName}(${r.models.length} 条)`).join(' · ')}`);
  if (DRY) { console.log('--dry-run：没有写盘。'); return 0; }

  /* ① providers.json：新键插在 "_" 元数据之前 */
  const outProviders = {};
  for (const [key, value] of Object.entries(providers)) {
    if (key.startsWith('_') && !Object.keys(outProviders).some(k => k.startsWith('_'))) {
      for (const [pid, meta] of Object.entries(PROVIDERS)) {
        outProviders[pid] = { name: meta.name, slug: meta.slug, aliases: meta.aliases, logo: meta.logo, vendorKey: meta.vendorKey, officialDomains: meta.officialDomains };
      }
    }
    outProviders[key] = value;
  }
  fs.writeFileSync(PROVIDERS_FILE, JSON.stringify(outProviders, null, 2) + '\n', 'utf8');

  /* ② curated_api_plans.json：追加记录 */
  const outApi = [...apiPlans, ...additions];
  fs.writeFileSync(API_PLANS_FILE, JSON.stringify(outApi, null, 2) + '\n', 'utf8');

  /* ③ coverage-targets：补四行（四维度按各自事实表态） */
  const newRows = [
    {
      provider: 'groq', tier: 'major', role: 'inference-platform',
      intent: 'Groq 托管推理的官方按量计费（计价主体是 Groq，不是模型发行方）与速率限制',
      applicabilityNote: 'deals / coding / models 都不适用：① 本轮没有找到 Groq 官方页面上的优惠口径可引用；② 官方没有编程订阅套餐，只有按量 API 与企业合同；③ 平台托管的模型身份归各自的发行方（openai / meta / moonshot…），不归 Groq。',
      dimensionIntent: { deals: null, coding: null, api: 'GroqCloud 按量计费（production / preview 模型的公开单价表）', models: null },
      currentTargets: ['meta-llama.prompt-guard-2-22m', 'meta-llama.prompt-guard-2-86m', 'openai.gpt-oss-120b', 'openai.gpt-oss-20b', 'openai.gpt-oss-safeguard-20b', 'qwen.qwen3.8-27b'].sort().map(modelKey => ({ dimension: 'api', modelKey })),
      rulings: [], note: null
    },
    {
      provider: 'together', tier: 'major', role: 'inference-platform',
      intent: 'Together AI Serverless 的官方按量计费与逐模型 cached input 价',
      applicabilityNote: 'deals / coding / models 都不适用：① 本轮没有取到 Together 官方页上的优惠口径；② 官方只有按量 API 与企业合同，没有编程订阅套餐；③ 托管模型身份归各发行方。',
      dimensionIntent: { deals: null, coding: null, api: 'Together Serverless 按量计费（chat 模型逐条公开单价）', models: null },
      currentTargets: ['deepseek-ai.v4-pro-0813', 'deepseek-ai.v4.1-flash', 'minimaxai.m3', 'moonshotai.kimi-k3', 'openai.gpt-oss-120b', 'thinkingmachines.inkling', 'zai-org.glm-5.3', 'zai-org.glm-5.3-flash'].sort().map(modelKey => ({ dimension: 'api', modelKey })),
      rulings: [], note: null
    },
    {
      provider: 'fireworks', tier: 'major', role: 'inference-platform',
      intent: 'Fireworks AI Serverless 的官方按量计费（Standard 与 Priority 两个通道）',
      applicabilityNote: 'deals / coding / models 都不适用：① 本轮取到的 serverless pricing 页里没有任何 free tier 段落（freeTier 写 null=没查到，不得写 none）；② 官方没有编程订阅套餐；③ 托管模型身份归各发行方。',
      dimensionIntent: { deals: null, coding: null, api: 'Fireworks Serverless 按量计费（standard 通道；priority 通道本轮未逐条落）', models: null },
      currentTargets: ['fireworks/ember-1', 'fireworks/kimi-k3', 'fireworks/deepseek-v4p1-flash', 'fireworks/glm-5p3', 'fireworks/glm-5p3-flash', 'fireworks/qwen3p8-max', 'fireworks/minimax-m3', 'fireworks/gpt-oss-120b', 'fireworks/nemotron-lightning-3p5-30b-a3b', 'fireworks/nemotron-3-ultra-nvfp4'].sort().map(modelKey => ({ dimension: 'api', modelKey })),
      rulings: [], note: null
    },
    {
      provider: 'cerebras', tier: 'long-tail', role: 'inference-platform',
      intent: 'Cerebras Inference Developer 档的官方按量计费与一次性赠送额度',
      applicabilityNote: 'deals / coding / models 都不适用：① 官方 $5 一次性 promotional credit 属优惠而不属 freeTier，本轮没有可引用的公开优惠页；② 官方没有编程订阅套餐；③ 托管模型身份归各发行方。',
      dimensionIntent: { deals: null, coding: null, api: 'Cerebras Developer 档按量计费（官方页可逐字取到的两条模型行）', models: null },
      currentTargets: ['gpt-oss-120b', 'qwen3.8-27b'].map(modelKey => ({ dimension: 'api', modelKey })),
      rulings: [], note: null
    }
  ];
  const mergedTargets = [...targets.targets, ...newRows]
    .sort((a, b) => (a.provider < b.provider ? -1 : a.provider > b.provider ? 1 : 0));
  fs.writeFileSync(TARGETS_FILE, JSON.stringify({ ...targets, targets: mergedTargets }, null, 2) + '\n', 'utf8');

  console.log('✅ 已写出 providers.json / curated_api_plans.json / coverage-targets.json');
  console.log('下一步：npm run api-plans:rebuild && check:api-plans:reproducible && validate --strict && coverage-targets-selftest');
  return 0;
}

process.exit(main());
