#!/usr/bin/env node
/**
 * t24 修复（第二部分）：把 4 家推理平台的 **coverage-targets 行**补回去。
 *
 * 与 `t24-restore-inference-providers.cjs` 同一件事的两半：我在本任务里对
 * `scripts/data/coverage-targets.json` 跑过 `git checkout --`，把 t11 那批**未提交**的
 * 4 行一并回退了（身份与意图必须成对，缺一行就是「这家平台没人宣称要覆盖」——
 * `coverage-targets-selftest` 的「意图层与身份层双向对上」当场抓住）。
 *
 * 行内容与 `t11-add-api-records.cjs` 的 `newRowsPlan` 逐字一致；`currentTargets` 只写
 * **api-plans.json 里真实存在**的 modelKey（判据：逐条在盘上核对，不在就拒绝写）。
 *
 * 用法：node research/_raw/coverage-expansion-v1/t24-restore-inference-targets.cjs [--dry-run]
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const DRY = process.argv.includes('--dry-run');
const TARGETS = path.join(ROOT, 'scripts', 'data', 'coverage-targets.json');

const ROWS = [
  {
    provider: 'groq', tier: 'major', role: 'inference-platform',
    intent: 'Groq 托管推理的官方按量计费（计价主体是 Groq，不是模型发行方）与速率限制',
    applicabilityNote: 'deals / coding / models 都不适用：① 本轮没有找到 Groq 官方页面上的优惠口径可引用；② 官方没有编程订阅套餐，只有按量 API 与企业合同；③ 平台托管的模型身份归各自的发行方（openai / meta / moonshot…），不归 Groq。',
    dimensionIntent: { deals: null, coding: null, api: 'GroqCloud 按量计费（production / preview 模型的公开单价表）', models: null },
    currentTargets: ['meta-llama.prompt-guard-2-22m', 'meta-llama.prompt-guard-2-86m', 'openai.gpt-oss-120b', 'openai.gpt-oss-20b', 'openai.gpt-oss-safeguard-20b', 'qwen.qwen3.8-27b'].map(modelKey => ({ dimension: 'api', modelKey })),
    rulings: [], note: null
  },
  {
    provider: 'together', tier: 'major', role: 'inference-platform',
    intent: 'Together AI Serverless 的官方按量计费与逐模型 cached input 价',
    applicabilityNote: 'deals / coding / models 都不适用：① 本轮没有取到 Together 官方页上的优惠口径；② 官方只有按量 API 与企业合同，没有编程订阅套餐；③ 托管模型身份归各发行方。',
    dimensionIntent: { deals: null, coding: null, api: 'Together Serverless 按量计费（chat 模型逐条公开单价）', models: null },
    currentTargets: ['deepseek-ai.v4-pro-0813', 'deepseek-ai.v4.1-flash', 'minimaxai.m3', 'moonshotai.kimi-k3', 'openai.gpt-oss-120b', 'thinkingmachines.inkling', 'zai-org.glm-5.3', 'zai-org.glm-5.3-flash'].map(modelKey => ({ dimension: 'api', modelKey })),
    rulings: [], note: null
  },
  {
    provider: 'fireworks', tier: 'major', role: 'inference-platform',
    intent: 'Fireworks AI Serverless 的官方按量计费（Standard 与 Priority 两个通道）',
    applicabilityNote: 'deals / coding / models 都不适用：① 本轮取到的 serverless pricing 页里没有任何 free tier 段落（freeTier 写 null=没查到，不得写 none）；② 官方没有编程订阅套餐；③ 托管模型身份归各发行方。',
    dimensionIntent: { deals: null, coding: null, api: 'Fireworks Serverless 按量计费（standard 通道；priority 通道本轮未逐条落）', models: null },
    currentTargets: ['deepseek-v4p1-flash', 'ember-1', 'glm-5p3', 'glm-5p3-flash', 'gpt-oss-120b', 'kimi-k3', 'minimax-m3', 'nemotron-3-ultra-nvfp4', 'nemotron-lightning-3p5-30b-a3b', 'qwen3p8-max'].map(modelKey => ({ dimension: 'api', modelKey })),
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

const DIMENSION_ORDER = ['deals', 'coding', 'api', 'models'];

function main() {
  const doc = JSON.parse(fs.readFileSync(TARGETS, 'utf8'));
  const apiPlans = JSON.parse(fs.readFileSync(path.join(ROOT, 'api-plans.json'), 'utf8')).plans || [];
  const known = new Set();
  for (const plan of apiPlans) for (const model of plan.models || []) known.add(`${plan.provider}\u0000${model.modelKey}`);

  const problems = [];
  const toAdd = [];
  for (const row of ROWS) {
    if (doc.targets.some(existing => existing.provider === row.provider)) { problems.push(`${row.provider}: 已有一行`); continue; }
    if (JSON.stringify(Object.keys(row.dimensionIntent)) !== JSON.stringify(DIMENSION_ORDER)) problems.push(`${row.provider}: dimensionIntent 键序不对`);
    for (const target of row.currentTargets) {
      if (!known.has(`${row.provider}\u0000${target.modelKey}`)) problems.push(`${row.provider}: currentTargets 里的「${target.modelKey}」在 api-plans.json 里不存在（不许写空头支票）`);
    }
    const sorted = [...row.currentTargets].sort((a, b) => (a.modelKey < b.modelKey ? -1 : a.modelKey > b.modelKey ? 1 : 0));
    if (JSON.stringify(sorted) !== JSON.stringify(row.currentTargets)) problems.push(`${row.provider}: currentTargets 不是规范序`);
    toAdd.push(row);
  }
  if (problems.length) {
    console.error(`❌ ${problems.length} 处问题，拒绝写盘：`);
    problems.forEach(item => console.error('  - ' + item));
    return 1;
  }
  console.log(`将补回 ${toAdd.length} 行：${toAdd.map(row => `${row.provider}(${row.currentTargets.length} 条 api target)`).join(' · ')}`);
  if (DRY || !toAdd.length) { console.log(DRY ? '--dry-run：没有写盘。' : '无需写盘。'); return 0; }
  const merged = [...doc.targets, ...toAdd].sort((a, b) => (a.provider < b.provider ? -1 : a.provider > b.provider ? 1 : 0));
  fs.writeFileSync(TARGETS, JSON.stringify({ ...doc, targets: merged }, null, 2) + '\n', 'utf8');
  console.log(`✅ 已写出 coverage-targets.json：${merged.length} 行`);
  return 0;
}

process.exit(main());
