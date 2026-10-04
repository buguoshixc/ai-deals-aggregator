#!/usr/bin/env node
/**
 * t11 Stage 2：为四路 research 新增的 14 家 provider 补 coverage-targets 行。
 *
 * 用法：node research/_raw/coverage-expansion-v1/t11-add-coverage-targets.cjs [--dry-run]
 *
 * ## 只写「意图」，绝不写状态
 *
 * 本文件（scripts/data/coverage-targets.json）的契约要求：只写
 * `provider / tier / role / intent / applicabilityNote / dimensionIntent / currentTargets / rulings / note`，
 * 七态（COVERED / PARTIAL / MISSING / DEFERRED / UNVERIFIABLE / NOT_APPLICABLE / BLOCKED_SOURCE）
 * 一律由 scripts/lib/coverage-targets.js 从盘上事实派生。
 *
 * ## 三条自制判据（写在这里，避免"顺手多写一格"）
 *
 * 1. `currentTargets` **只写盘上已经兑现的那几条**（契约原文：盘上还没兑现的那些写进来就是「声称已覆盖」）。
 *    因此本轮：
 *      · `deals` 只在「source-health 的 name 或 deals.json 里出现过的 source」才写；
 *      · `models` 只在该 registrySlug 真的存在于 scripts/data/models.json 时才写；
 *      · `api` 只在该 modelKey 即将随本任务的 API 记录落盘时才写（本脚本只声明，不落记录）。
 * 2. 某个维度**不适用**（值为 null）时必须写 `applicabilityNote` 说明为什么。
 * 3. tier / role 的取值只允许契约里的枚举；档位判断依据写在本文件的 `basis` 字段里（供人复核），
 *    不进生产文件。
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const DRY = process.argv.includes('--dry-run');
const TARGETS_FILE = path.join(ROOT, 'scripts', 'data', 'coverage-targets.json');
const HEALTH_FILE = path.join(ROOT, 'scripts', 'data', 'source-health.json');
const DEALS_FILE = path.join(ROOT, 'deals.json');
const MODELS_FILE = path.join(ROOT, 'scripts', 'data', 'models.json');

/**
 * 14 家新 provider 的意图行。
 * `basis` = 这个档位判断的依据（人工复核用；不写进生产文件）。
 */
const ROWS = {
  /* ---------------- 第一方模型开发者（中国侧） ---------------- */
  stepfun: {
    tier: 'major', role: 'model-developer',
    intent: '阶跃星辰（StepFun）开放平台的官方优惠、API 按量计费、Step Plan 订阅与当前模型身份',
    dimensionIntent: {
      deals: '阶跃星辰官方活动 / 新用户额度（只收官方来源）',
      coding: 'Step Plan 订阅档位（Credit 月池，官方页共四档）',
      api: 'StepFun 开放平台按 token 计费的公开价目（文本 / 多模态 / 语音）',
      models: 'Step 系列当前主力模型（旗舰基模与 Flash 档）'
    },
    applicabilityNote: null,
    currentTargets: [{ dimension: 'api', modelKey: 'step-3.7-flash' }, { dimension: 'api', modelKey: 'step-5-preview' }],
    rulings: [],
    basis: 'research：adopted（官方定价页 200 且正文完整、Step Plan 页 200）⇒ 四维度都适用'
  },
  sensetime: {
    tier: 'major', role: 'model-developer',
    intent: '商汤科技日日新（SenseNova）与大装置的官方优惠、按量计费、Token Plan 与当前模型身份',
    dimensionIntent: {
      deals: '商汤官方活动 / 新用户额度（只收官方来源）',
      coding: 'Token Plan 订阅档位（当前只有公测免费档有官方价）',
      api: '大装置日日新 V6.x 线按量计费与 SenseNova 当前线的公开口径',
      models: 'SenseNova 当前主力模型（含大装置线）'
    },
    applicabilityNote: null,
    currentTargets: [{ dimension: 'api', modelKey: 'SenseNova-V6.5-Pro' }],
    rulings: [
      {
        dimension: 'models',
        decision: 'deferred',
        reason: '日日新当前线（6.8 Flash Lite / U1.5 Lite）在官网有模型页与文案，但还没有登记进 Model Registry（registry 里本轮没有任何商汤模型）⇒ 本维度本轮不写 currentTargets，等模型身份登记后补',
        revisitBy: '当 scripts/data/models.json 里出现第一个 Sensetime 归属的 registrySlug 时'
      }
    ],
    basis: 'research：partial（大装置页公开 V6.x 按量价；当前线只有 Token 权益、无按量价）'
  },
  baichuan: {
    tier: 'major', role: 'model-developer',
    intent: '百川智能开放平台的官方优惠、按量计费与当前模型身份',
    dimensionIntent: {
      deals: '百川智能官方活动 / 新用户额度（只收官方来源）',
      coding: '编程订阅套餐（官方公开面只有按量、知识库与 Embeddings，没有 Coding 订阅）',
      api: '百川 M 系列按量计费（元/千 tokens，输入输出分明）',
      models: 'Baichuan-M 系列当前主力模型'
    },
    applicabilityNote: 'coding 不适用：官方公开面（platform.baichuan-ai.com/prices）只有按量计费、搜索增强、知识库与 Embeddings 价目，没有任何编程/订阅套餐。',
    currentTargets: [{ dimension: 'api', modelKey: 'Baichuan-M3' }, { dimension: 'api', modelKey: 'Baichuan-M3-Plus' }],
    rulings: [],
    basis: 'research：partial（M 系列四条可诚实落盘；官方 6 条打包价 schema 无 blended 字段 ⇒ 记 gap）'
  },
  ai360: {
    tier: 'long-tail', role: 'model-developer',
    intent: '360 智脑开放平台自研模型（360zhinao 系列）的官方优惠、按量计费与模型身份',
    dimensionIntent: {
      deals: '360 智脑官方活动 / 新用户额度（只收官方来源）',
      coding: '自营编码订阅套餐（官方只有第三方工具的接入文档，没有自营 Coding 套餐）',
      api: '360zhinao 自研模型按量计费（¥/1M tokens）',
      models: '360zhinao 自研当前模型'
    },
    applicabilityNote: 'coding 不适用：官方只有「第三方工具接入」文档（CC Switch + Claude Code / Codex），没有自营编码订阅套餐。',
    currentTargets: [{ dimension: 'api', modelKey: '360zhinao-turbo-llm-geo' }],
    rulings: [],
    basis: 'research：partial（只采纳 360zhinao/* 自研；同站转售的第三方路由一律不登记到 ai360 名下）'
  },
  /* ---------------- 国际推理平台（provider-only） ---------------- */
  groq: {
    tier: 'major', role: 'inference-platform',
    intent: 'Groq 托管推理的官方按量计费（计价主体是 Groq，不是模型发行方）与速率限制',
    dimensionIntent: {
      deals: null,
      coding: null,
      api: 'GroqCloud 按量计费（production / preview 模型的公开单价表）',
      models: null
    },
    applicabilityNote: 'deals / coding / models 都不适用：① 本轮没有找到 Groq 官方页面上的优惠口径（新用户赠送等）可引用；② 官方没有编程订阅套餐，只有按量 API 与企业合同；③ 平台托管的模型身份归各自的发行方（openai / meta / moonshot…），不归 Groq。',
    currentTargets: [
      { dimension: 'api', modelKey: 'gpt-oss-120b' }, { dimension: 'api', modelKey: 'gpt-oss-20b' },
      { dimension: 'api', modelKey: 'gpt-oss-safeguard-20b' }, { dimension: 'api', modelKey: 'llama-prompt-guard-2-22m' },
      { dimension: 'api', modelKey: 'llama-prompt-guard-2-86m' }, { dimension: 'api', modelKey: 'qwen3.8-27b' }
    ],
    rulings: [],
    basis: 'research：adopt（官方 docs/models 页 369KB 可逐字取价；cache/batch 只有折扣比例 ⇒ 记 derived-not-published gap）'
  },
  together: {
    tier: 'major', role: 'inference-platform',
    intent: 'Together AI Serverless 的官方按量计费与逐模型 cached input 价',
    dimensionIntent: {
      deals: null,
      coding: null,
      api: 'Together Serverless 按量计费（chat 模型逐条公开单价）',
      models: null
    },
    applicabilityNote: 'deals / coding / models 都不适用：① 本轮没有取到 Together 官方页上的优惠口径；② 官方只有按量 API 与企业合同，没有编程订阅套餐；③ 托管模型身份归各发行方。',
    currentTargets: [
      { dimension: 'api', modelKey: 'deepseek-v4-pro-0813' }, { dimension: 'api', modelKey: 'deepseek-v4.1-flash' },
      { dimension: 'api', modelKey: 'glm-5.3' }, { dimension: 'api', modelKey: 'glm-5.3-flash' },
      { dimension: 'api', modelKey: 'gpt-oss-120b' }, { dimension: 'api', modelKey: 'inkling' },
      { dimension: 'api', modelKey: 'kimi-k3' }, { dimension: 'api', modelKey: 'llama-3.3-70b-instruct-turbo' },
      { dimension: 'api', modelKey: 'minimax-m3' }, { dimension: 'api', modelKey: 'ternary-bonsai-27b' }
    ],
    rulings: [],
    basis: 'research：adopt（官方 docs .md 端点 16.6KB 可逐字取表；freeTier=models 有官方 Free 行）'
  },
  fireworks: {
    tier: 'major', role: 'inference-platform',
    intent: 'Fireworks AI Serverless 的官方按量计费（Standard 与 Priority 两个通道）',
    dimensionIntent: {
      deals: null,
      coding: null,
      api: 'Fireworks Serverless 按量计费（standard / priority 两个计价通道）',
      models: null
    },
    applicabilityNote: 'deals / coding / models 都不适用：① 本轮取到的 serverless pricing 页里没有任何 free tier 段落（freeTier 只能写 null=没查到，不得写 none）；② 官方没有编程订阅套餐；③ 托管模型身份归各发行方。',
    currentTargets: [
      { dimension: 'api', modelKey: 'deepseek-v4.1-flash' }, { dimension: 'api', modelKey: 'ember-1' },
      { dimension: 'api', modelKey: 'glm-5.3' }, { dimension: 'api', modelKey: 'glm-5.3-flash' },
      { dimension: 'api', modelKey: 'gpt-oss-120b' }, { dimension: 'api', modelKey: 'kimi-k3' },
      { dimension: 'api', modelKey: 'minimax-m3' }, { dimension: 'api', modelKey: 'nemotron-3-ultra' },
      { dimension: 'api', modelKey: 'nemotron-3.5-lightning-30b-a3b' }, { dimension: 'api', modelKey: 'qwen3.8-max' }
    ],
    rulings: [],
    basis: 'research：adopt（官方 .md 定价页；Fast / US-only / 按参数量兜底价 / embedding 价记 gap）'
  },
  cerebras: {
    tier: 'long-tail', role: 'inference-platform',
    intent: 'Cerebras Inference Developer 档的官方按量计费与一次性赠送额度',
    dimensionIntent: {
      deals: null,
      coding: null,
      api: 'Cerebras Developer 档按量计费（官方页可逐字取到的两条模型行）',
      models: null
    },
    applicabilityNote: 'deals / coding / models 都不适用：① 官方 $5 一次性 promotional credit 属优惠而不属 freeTier，本轮没有可引用的公开优惠页；② 官方没有编程订阅套餐；③ 托管模型身份归各发行方。',
    currentTargets: [{ dimension: 'api', modelKey: 'gpt-oss-120b' }, { dimension: 'api', modelKey: 'qwen3.8-27b' }],
    rulings: [],
    basis: 'research：adopt-with-deferral（完整 Tier 价目表客户端渲染取不到 ⇒ 只落两条可逐字取的）'
  },
  /* ---------------- 国际 Coding 产品 ---------------- */
  jetbrains: {
    tier: 'major', role: 'coding-product',
    intent: 'JetBrains AI 订阅档位的官方价格与可用模型',
    dimensionIntent: {
      deals: null,
      coding: 'JetBrains AI Pro / Ultimate 订阅档位',
      api: null,
      models: null
    },
    applicabilityNote: 'deals / api / models 都不适用：① JetBrains 的 AI 是订阅产品，官方页没有可引用的独立优惠口径；② 它不对外提供公开的按量 API 计费；③ 它不发行自己的模型身份（订阅里列出的是别人的模型）。',
    currentTargets: [{ dimension: 'coding', planName: 'JetBrains AI Pro' }],
    rulings: [],
    basis: 'research（coding.json）：adopt（官方定价页给出 Pro 档明确价格）'
  },
  replit: {
    tier: 'major', role: 'coding-product',
    intent: 'Replit Core / Pro 订阅档位的官方价格与额度口径',
    dimensionIntent: {
      deals: null,
      coding: 'Replit Core / Pro 订阅档位',
      api: null,
      models: null
    },
    applicabilityNote: 'deals/api/models 不适用：① 没有任何一路采集来源覆盖 Replit 官方优惠（deals.json 的 source 只有 11 个）⇒ 不写 deals target；② 官方没有公开的按量 API 价目；③ 它不发行自己的模型身份。',
    currentTargets: [{ dimension: 'coding', planName: 'Replit Core' }],
    rulings: [],
    basis: 'research（coding.json）：adopt（官方定价页给出 Core 档明确价格；A 空间已有 Replit 厂商键）'
  },
  aws: {
    tier: 'major', role: 'coding-product',
    intent: 'Amazon Q Developer 订阅档位的官方价格与停支公告',
    dimensionIntent: {
      deals: null,
      coding: 'Amazon Q Developer Free / Pro 档位',
      api: null,
      models: null
    },
    applicabilityNote: 'deals/api/models 不适用（本轮）：① 没有专门覆盖 AWS 官方优惠的采集来源；② Bedrock 按量价目表本轮未取证（研究只覆盖 Q Developer）⇒ 该维度只留意图、不写 target，复查条件=有一轮研究取到 Bedrock 官方价目页并可逐字引用；③ AWS 是托管平台，Bedrock 上的模型身份归各自发行方。',
    currentTargets: [{ dimension: 'coding', planName: 'Amazon Q Developer Pro' }],
    rulings: [],
    basis: 'research（coding.json）：adopt（Q Developer Pro 档有官方价；另有 2027-04-30 IDE 插件停支公告）'
  },
  /* ---------------- 三家 unverifiable：只登记身份，四维度全部 null + unverifiable 裁决 ---------------- */
  xai: {
    tier: 'major', role: 'model-developer',
    intent: 'xAI（Grok）官方定价与当前模型身份',
    dimensionIntent: { deals: null, coding: null, api: null, models: null },
    applicabilityNote: '四个维度全部不适用（本轮）：x.ai 全域（含 docs 子域）在本环境一律抓取失败（TypeError: fetch failed），连「官方是否公开定价」都无法回答。**UNVERIFIABLE 由派生层从这份「四维度无面 + 身份已登记」的事实算出来**，不在这里手写状态；四个维度的复查条件是同一条：在可访问 x.ai 的网络出口重跑 https://x.ai/ 与 https://docs.x.ai/docs/models。',
    currentTargets: [],
    rulings: [],
    basis: 'research：unverifiable / coverageRecommendation=defer-until-reachable'
  },
  mistral: {
    tier: 'major', role: 'model-developer',
    intent: 'Mistral AI 官方定价与当前模型身份',
    dimensionIntent: { deals: null, coding: null, api: null, models: null },
    applicabilityNote: '四个维度全部不适用（本轮）：mistral.ai 全域在本环境抓取失败（多次 fetch failed），没有任何官方原文可引。UNVERIFIABLE 由派生层算出来，不手写；复查条件：换网络出口重跑 https://mistral.ai/pricing 与 https://docs.mistral.ai/getting-started/models/models_overview。',
    currentTargets: [],
    rulings: [],
    basis: 'research：unverifiable / defer-until-reachable'
  },
  cohere: {
    tier: 'major', role: 'model-developer',
    intent: 'Cohere（Command 系列）官方定价与当前模型身份',
    dimensionIntent: { deals: null, coding: null, api: null, models: null },
    applicabilityNote: '四个维度全部不适用（本轮）：cohere.com/pricing 返回 200 但正文只抽到导航与一句 banner（价格表在抽取窗口之外/前端渲染），既不能说公开也不能说不公开。UNVERIFIABLE 由派生层算出来，不手写；复查条件：换抓取方式（真实浏览器 / 官方文档站内的定价页）重取 https://cohere.com/pricing；取到之前不得为 Cohere 落任何价格记录。',
    currentTargets: [],
    rulings: [],
    basis: 'research：unverifiable / defer-until-extractable'
  }
};

const DIMENSION_ORDER = ['deals', 'coding', 'api', 'models'];
const RULING_DECISIONS = ['deferred', 'unverifiable', 'schema-not-supported'];

function main() {
  const doc = JSON.parse(fs.readFileSync(TARGETS_FILE, 'utf8'));
  const health = JSON.parse(fs.readFileSync(HEALTH_FILE, 'utf8'));
  const deals = JSON.parse(fs.readFileSync(DEALS_FILE, 'utf8'));
  const models = JSON.parse(fs.readFileSync(MODELS_FILE, 'utf8'));

  const knownSources = new Set(health.sources.map(row => row.name));
  for (const deal of deals.deals || []) if (deal.source) knownSources.add(String(deal.source));
  const knownSlugs = new Set(Object.keys(models).filter(key => !key.startsWith('_')));

  const problems = [];
  const additions = [];

  for (const [provider, spec] of Object.entries(ROWS)) {
    if (doc.targets.some(row => row.provider === provider)) { problems.push(`${provider}: 已有一行（本脚本不覆盖既有行）`); continue; }
    // 维度键序
    const keys = Object.keys(spec.dimensionIntent);
    if (JSON.stringify(keys) !== JSON.stringify(DIMENSION_ORDER)) problems.push(`${provider}: dimensionIntent 键序必须是 ${DIMENSION_ORDER.join('→')}（实得 ${keys.join('→')}）`);
    const hasNull = DIMENSION_ORDER.some(key => spec.dimensionIntent[key] === null);
    if (hasNull && !spec.applicabilityNote) problems.push(`${provider}: 有维度为 null 就必须写 applicabilityNote`);
    // currentTargets：先按维度、再按目标名升序；且只写盘上已兑现的
    const sorted = [...spec.currentTargets].sort((a, b) => {
      const da = DIMENSION_ORDER.indexOf(a.dimension); const db = DIMENSION_ORDER.indexOf(b.dimension);
      if (da !== db) return da - db;
      const na = a.source || a.planName || a.modelKey || a.registrySlug || '';
      const nb = b.source || b.planName || b.modelKey || b.registrySlug || '';
      return na < nb ? -1 : na > nb ? 1 : 0;
    });
    if (JSON.stringify(sorted) !== JSON.stringify(spec.currentTargets)) problems.push(`${provider}: currentTargets 顺序不是规范序（应为 ${JSON.stringify(sorted)}）`);
    for (const target of spec.currentTargets) {
      if (target.dimension === 'deals' && !knownSources.has(target.source)) problems.push(`${provider}: deals source「${target.source}」既不是 source-health 的 name 也不在 deals.json 里`);
      if (target.dimension === 'models' && !knownSlugs.has(target.registrySlug)) problems.push(`${provider}: registrySlug「${target.registrySlug}」不在 models.json 里`);
      if (target.dimension === 'models') problems.push(`${provider}: 本轮没有任何新 registrySlug 可声明（${target.registrySlug}）—— 这条不该写`);
    }
    // rulings：决定枚举、deferred 必须 revisitBy、同维度至多一条、不适用维度不许写裁决
    const seen = new Map();
    for (const ruling of spec.rulings) {
      if (!RULING_DECISIONS.includes(ruling.decision)) problems.push(`${provider}: ruling decision 非法（${ruling.decision}）`);
      if (ruling.decision === 'deferred' && !ruling.revisitBy) problems.push(`${provider}/${ruling.dimension}: deferred 必须写 revisitBy`);
      if (seen.has(ruling.dimension)) problems.push(`${provider}/${ruling.dimension}: 同维度至多一条裁决`);
      seen.set(ruling.dimension, true);
      if (spec.dimensionIntent[ruling.dimension] === null && ruling.decision === 'schema-not-supported') {
        // schema-not-supported 说的是「官方定价存在但 schema 表达不了」——那就必须有定价面，
        // 与「这个维度不适用 / 还没有取证面」互斥。
        problems.push(`${provider}/${ruling.dimension}: 该维度在 dimensionIntent 里是 null，却写 schema-not-supported 裁决（自相矛盾）`);
      }
      if (spec.dimensionIntent[ruling.dimension] === null && ruling.decision === 'deferred' && !spec.applicabilityNote) {
        problems.push(`${provider}/${ruling.dimension}: null 维度上的 deferred 必须在 applicabilityNote 里说明「为什么这维度现在没有面」`);
      }
    }
    additions.push({
      provider, tier: spec.tier, role: spec.role, intent: spec.intent,
      applicabilityNote: spec.applicabilityNote, dimensionIntent: spec.dimensionIntent,
      currentTargets: spec.currentTargets, rulings: spec.rulings, note: null
    });
  }

  if (problems.length) {
    console.error(`❌ ${problems.length} 处问题，拒绝写盘：`);
    problems.forEach(item => console.error('  - ' + item));
    return 1;
  }

  console.log(`coverage-targets：将新增 ${additions.length} 行（${additions.map(row => row.provider).join(', ')}）`);
  console.log(`  档位分布：${[...new Set(additions.map(row => row.tier))].map(tier => `${tier}×${additions.filter(row => row.tier === tier).length}`).join(' · ')}`);
  console.log(`  角色分布：${[...new Set(additions.map(row => row.role))].map(role => `${role}×${additions.filter(row => row.role === role).length}`).join(' · ')}`);
  if (DRY) { console.log('--dry-run：没有写盘。'); return 0; }

  const merged = [...doc.targets, ...additions].sort((a, b) => (a.provider < b.provider ? -1 : a.provider > b.provider ? 1 : 0));
  const out = {};
  for (const [key, value] of Object.entries(doc)) {
    if (key === 'targets') { out.targets = merged; continue; }
    out[key] = value;
  }
  fs.writeFileSync(TARGETS_FILE, JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log(`✅ 已写出 coverage-targets.json：${merged.length} 行（原 ${doc.targets.length} + 新 ${additions.length}）`);
  return 0;
}

process.exit(main());
