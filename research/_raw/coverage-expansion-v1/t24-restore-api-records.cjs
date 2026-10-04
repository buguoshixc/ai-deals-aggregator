#!/usr/bin/env node
/**
 * t24 修复（第三部分）：把 4 家推理平台的 **API 计费记录**补回 `curated_api_plans.json`，
 * 然后由 `rebuild-api-plans.js` 重建 `api-plans.json`。
 *
 * 为什么又少了：与身份/覆盖率行同一次事故 —— 我对若干文件跑了 `git checkout --`，
 * 而这 4 条记录（t11 attempt 5 落的）当时**尚未提交**，于是被一起回退。
 * 后果由 `validate --strict` 当场暴露：`model-registry-links.json`（t23 的改动）里
 * 14 条映射指向的 apiPlanId（8a26562011f2 / 929a1f3ec46c / 036c5f09561e / 61aa6c3ed3ff）
 * 在回退后的 api-plans.json 里**不存在**了。
 *
 * 本脚本从 `research/_raw/coverage-expansion-v1/inference.json` 的官方数据重建这 4 条记录，
 * 字段与 `t11-add-api-records.cjs` 逐字一致（幂等：已存在则仅核对）。
 *
 * 用法：node research/_raw/coverage-expansion-v1/t24-restore-api-records.cjs [--dry-run]
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const DRY = process.argv.includes('--dry-run');
const FILE = path.join(ROOT, 'scripts', 'data', 'curated_api_plans.json');
const TODAY = '2026-10-04';

const RECORDS = [
  {
    provider: 'groq', planName: '模型推理按量计费', channel: 'standard',
    officialUrl: 'https://console.groq.com/docs/models', source: 'Official-Docs', region: 'global',
    pricing: { currency: 'USD', unit: 'per_1M_tokens', unitNote: '官方表列头逐字为 “PRICE PER 1M TOKENS”' },
    models: [
      ['openai.gpt-oss-120b', 'GPT OSS 120B', 0.15, 0.6, null],
      ['openai.gpt-oss-20b', 'GPT OSS 20B', 0.075, 0.3, null],
      ['openai.gpt-oss-safeguard-20b', 'GPT OSS Safeguard 20B', 0.075, 0.3, null],
      ['meta-llama.prompt-guard-2-22m', 'Llama Prompt Guard 2 22M', 0.03, 0.03, null],
      ['meta-llama.prompt-guard-2-86m', 'Llama Prompt Guard 2 86M', 0.04, 0.04, null],
      ['qwen.qwen3.8-27b', 'Qwen 3.8 27B', 0.29, 0.59, null]
    ],
    evidenceQuote: 'PRICE PER 1M TOKENS — GPT OSS 120B $0.15 / $0.60；GPT OSS 20B $0.075 / $0.30（官方 Supported Models 页逐字）'
  },
  {
    provider: 'together', planName: 'Serverless 按量计费', channel: 'standard',
    officialUrl: 'https://docs.together.ai/docs/serverless/models.md', source: 'Official-Docs', region: 'global',
    pricing: { currency: 'USD', unit: 'per_1M_tokens', unitNote: '官方列头逐字 «Input pricing (per 1M tokens)» / «Cached input pricing (per 1M tokens)» / «Output pricing (per 1M tokens)»' },
    models: [
      ['thinkingmachines.inkling', 'Inkling', 1, 4.05, 0.17],
      ['moonshotai.kimi-k3', 'Kimi K3', 3, 15, 0.3],
      ['zai-org.glm-5.3', 'GLM-5.3', 1.4, 4.4, 0.26],
      ['zai-org.glm-5.3-flash', 'GLM-5.3 Flash', 0.15, 0.5, 0.03],
      ['openai.gpt-oss-120b', 'GPT-OSS 120B', 0.15, 0.6, null],
      ['deepseek-ai.v4-pro-0813', 'DeepSeek V4 Pro 0813', 1.32, 3.96, 0.13],
      ['deepseek-ai.v4.1-flash', 'DeepSeek V4.1 Flash', 0.3, 1.2, 0.006],
      ['minimaxai.m3', 'MiniMax M3', 0.3, 1.2, 0.06]
    ],
    evidenceQuote: 'Input pricing (per 1M tokens) / Cached input pricing (per 1M tokens) / Output pricing (per 1M tokens) —— Inkling 1 / 0.17 / 4.05；Kimi K3 3 / 0.3 / 15（官方 serverless models 页逐字列头与两行）'
  },
  {
    provider: 'fireworks', planName: 'Serverless 按量计费', channel: 'standard',
    officialUrl: 'https://docs.fireworks.ai/serverless/pricing.md', source: 'Official-Docs', region: 'global',
    pricing: { currency: 'USD', unit: 'per_1M_tokens', unitNote: '官方页逐字 “(USD per 1M tokens)”' },
    models: [
      ['ember-1', 'Ember-1', 3, 15, 0.3],
      ['kimi-k3', 'Kimi K3', 3, 15, 0.3],
      ['deepseek-v4p1-flash', 'DeepSeek V4.1 Flash', 0.3, 1.2, 0.006],
      ['glm-5p3', 'GLM 5.3', 1.4, 4.4, 0.26],
      ['glm-5p3-flash', 'GLM 5.3 Flash', 0.15, 0.5, 0.03],
      ['qwen3p8-max', 'Qwen 3.8 Max', 2, 6, 0.25],
      ['minimax-m3', 'MiniMax M3', 0.3, 1.2, 0.06],
      ['gpt-oss-120b', 'OpenAI GPT OSS 120B', 0.15, 0.6, 0.015],
      ['nemotron-lightning-3p5-30b-a3b', 'NVIDIA Nemotron 3.5 Lightning 30B A3B', 0.05, 0.2, 0.01],
      ['nemotron-3-ultra-nvfp4', 'NVIDIA Nemotron 3 Ultra (Preview)', 0.6, 2.4, 0.12]
    ],
    evidenceQuote: '(USD per 1M tokens) —— Model | Standard | Priority；Ember-1 3 / 15；Kimi K3 3 / 15；GLM 5.3 1.4 / 4.4（官方 serverless pricing 页逐字）'
  },
  {
    provider: 'cerebras', planName: '推理按量计费 Developer 档', channel: 'standard',
    officialUrl: 'https://www.cerebras.ai/pricing', source: 'Official-Docs', region: 'global',
    pricing: { currency: 'USD', unit: 'per_1M_tokens', unitNote: '官方价格单元格逐字为 $X.XX/M tokens（每百万 token）' },
    models: [
      ['gpt-oss-120b', 'GPT OSS 120B', 0.35, 0.75, null],
      ['qwen3.8-27b', 'Qwen 3.8 27B', 0.99, 1.49, null]
    ],
    evidenceQuote: '$X.XX/M tokens（每百万 token）—— GPT OSS 120B $0.35 / $0.75；Qwen 3.8 27B $0.99 / $1.49（Developer 档逐字）'
  }
];

function main() {
  const list = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const problems = [];
  const additions = [];
  for (const spec of RECORDS) {
    if (list.some(item => item.provider === spec.provider && item.planName === spec.planName)) {
      problems.push(`${spec.provider}/${spec.planName}: 已存在`);
      continue;
    }
    if (!spec.officialUrl.startsWith('https://')) problems.push(`${spec.provider}: officialUrl 非 https`);
    additions.push({
      provider: spec.provider, planName: spec.planName, channel: spec.channel,
      officialUrl: spec.officialUrl, source: spec.source, sourceUrl: spec.officialUrl, region: spec.region,
      pricing: spec.pricing,
      models: spec.models.map(([modelKey, name, input, output, cachedInput]) => ({
        name, modelKey, variant: 'standard', aliases: null,
        rates: { input, output, cachedInput }, mediaRates: null, note: null
      })),
      freeTier: null, limits: null, credits: null, restrictions: null,
      firstSeen: TODAY, lastSeen: TODAY, verified: true, verifiedAt: TODAY,
      evidence: [{ field: 'pricing.currency', quote: spec.evidenceQuote.slice(0, 190), sourceUrl: spec.officialUrl, capturedAt: TODAY, lang: 'en' }]
    });
  }
  if (problems.length && problems.every(p => p.includes('已存在'))) {
    console.log(`✓ 已是目标状态（${problems.length} 条均已存在），无需写盘`);
    return 0;
  }
  if (problems.length) {
    console.error(`❌ ${problems.length} 处问题，拒绝写盘：`);
    problems.forEach(item => console.error('  - ' + item));
    return 1;
  }
  console.log(`将补回 ${additions.length} 条 API 记录：${additions.map(a => `${a.provider}(${a.models.length} 条)`).join(' · ')}`);
  if (DRY) { console.log('--dry-run：没有写盘。'); return 0; }
  fs.writeFileSync(FILE, JSON.stringify([...list, ...additions], null, 2) + '\n', 'utf8');
  console.log(`✅ 已写出 curated_api_plans.json：${list.length + additions.length} 条`);
  return 0;
}

process.exit(main());
