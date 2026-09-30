#!/usr/bin/env node
/**
 * AI 维护任务的唯一 CLI。
 *
 * 用法：
 *   node scripts/ai/maintenance.js --task=extract   [--limit=10] [--only=Futuretools]
 *                                   [--provider=openai-compat] [--model=…] [--source=fetch|record]
 *   node scripts/ai/maintenance.js --task=dedup     [--limit=20]
 *   node scripts/ai/maintenance.js --task=translate [--limit=20]
 *   node scripts/ai/maintenance.js --task=diagnose  [--only=cn_qianpu]
 *   node scripts/ai/maintenance.js --task=audit     [--limit=20]
 *   node scripts/ai/maintenance.js --task=patch     --source=<sourceId>
 *
 * 通用开关：
 *   --dry-run        只算「有多少个单元、要不要调模型」，不真的调
 *   --no-cache       绕过缓存
 *   --fresh          先清掉该任务的缓存目录（不清 usage 账本）
 *   --budget=1.0     运行级成本上限（美元）；用尽后剩余单元标 skipped
 *   --json           额外打印一份机器可读摘要
 *
 * **退出码语义**：AI 层面的任何失败（无 key、超时、非法 JSON、预算用尽）都是 **0**；
 * 只有「我们自己写错了」（未知任务、模块缺失、坏参数）才是 1。
 * 理由见 `docs/AI-MAINTENANCE-v2.0.md` 第十一节：AI 是增强层，不是单点故障。
 */

'use strict';

const fs = require('fs');
const path = require('path');

const provider = require('./provider');
const schemas = require('./schemas');
const candidates = require('./candidates');
const cache = require('./cache');
const usage = require('./usage');
const store = require('../lib/store');
const { todayCN } = require('../lib/schema');

const MODULES = {
  extract: { file: './extract', task: 'extract_offer', label: '优惠字段提取' },
  dedup: { file: './dedup', task: 'dedup_pair', label: '疑似重复检测' },
  translate: { file: './translate', task: 'translate_field', label: '翻译草稿' },
  diagnose: { file: './diagnose', task: 'diagnose_source', label: '采集器 DOM drift 诊断' },
  audit: { file: './audit', task: 'audit_record', label: '数据质量审计' },
  patch: { file: './patch', task: 'patch_collector', label: '采集器补丁候选' }
};

function flag(name) {
  return process.argv.includes(`--${name}`);
}

function option(name, fallback = null) {
  const prefix = `--${name}=`;
  const hit = process.argv.find(arg => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

function stampCN(now = new Date()) {
  const shifted = new Date(now.getTime() + 8 * 3600 * 1000);
  const iso = shifted.toISOString();
  return `${iso.slice(0, 10)}-${iso.slice(11, 16).replace(':', '')}`;
}

async function main() {
  const taskName = option('task');
  if (!taskName) {
    console.error(`用法：node scripts/ai/maintenance.js --task=<${Object.keys(MODULES).join('|')}>`);
    process.exit(1);
  }
  const spec = MODULES[taskName];
  if (!spec) {
    console.error(`未知任务 "${taskName}"（可用：${Object.keys(MODULES).join(' / ')}）`);
    process.exit(1);
  }

  let mod;
  try {
    mod = require(spec.file);
  } catch (error) {
    console.error(`任务模块 ${spec.file} 不可用：${error.message}`);
    process.exit(1);
  }

  const limit = Number(option('limit', '20'));
  const only = option('only');
  const dryRun = flag('dry-run');
  const useCache = !flag('no-cache');
  const budget = option('budget') != null ? Number(option('budget')) : Number(process.env.AI_MAX_COST_USD || 1.0);
  const outFile = option('out') || candidates.candidatesPath(taskName, stampCN());
  const conf = provider.resolveConfig({ provider: option('provider'), model: option('model') });

  const storeDoc = store.loadStore();
  const deals = storeDoc.deals || [];
  const options = {
    only: only ? only.split(',').map(s => s.trim()).filter(Boolean) : null,
    limit,
    // `--source` 有两个完全不同的含义，取决于任务：extract 的输入来源（fetch / record），
    // patch 的目标采集器 id。给所有任务都默认成 'fetch' 会让 patch 去找一个叫 fetch 的采集器
    // （实测踩过：`--task=patch --dry-run` 报「没有注册的采集器 fetch」）。
    source: option('source', taskName === 'extract' ? 'fetch' : null),
    fields: option('fields') ? option('fields').split(',').map(s => s.trim()) : null,
    maxPairs: option('max-pairs') ? Number(option('max-pairs')) : undefined,
    maxInputChars: option('max-chars') ? Number(option('max-chars')) : undefined,
    timeoutMs: option('timeout') ? Number(option('timeout')) : undefined
  };

  console.log(`AI 维护任务：${spec.label}（${taskName}）`);
  console.log(`provider=${conf.provider} model=${conf.model || '(未设置)'} 缓存=${useCache ? '开' : '关'} 预算=$${budget}`);
  console.log(`数据：${deals.length} 条（${todayCN()}）`);

  if (flag('fresh')) {
    cache.resetTask(spec.task);
    console.log(`已清空缓存目录：${path.relative(cache.ROOT, path.join(cache.cacheDir(), spec.task))}`);
  }

  const units = await mod.units({ deals, options });
  const runnable = units.filter(unit => !unit.skipped);
  console.log(`待处理单元 ${units.length} 个（可调用 ${runnable.length} 个，跳过 ${units.length - runnable.length} 个）`);

  if (dryRun) {
    for (const unit of units.slice(0, 10)) {
      console.log(`  · ${unit.key}${unit.skipped ? `  [跳过] ${unit.skipped}` : `  ${String(unit.content || '').length} 字`}`);
    }
    if (units.length > 10) console.log(`  … 另有 ${units.length - 10} 个`);
    console.log('--dry-run：没有调用模型。');
    return 0;
  }

  const collected = [];
  const invalids = [];
  const skipped = units.filter(unit => unit.skipped);
  let spentUsd = 0;
  let calls = 0;
  let cachedCalls = 0;
  let invalidCalls = 0;

  // limit 限制的是「真的调用模型」的单元数（dry-run 不受限制）
  const queue = Number.isFinite(limit) && limit > 0 ? runnable.slice(0, limit) : runnable;

  for (const unit of queue) {
    const response = await provider.generateStructured({
      task: spec.task,
      promptVersion: mod.PROMPT_VERSION || schemas.PROMPT_VERSIONS[spec.task],
      system: mod.SYSTEM,
      content: unit.content,
      provider: option('provider'),
      model: option('model'),
      maxInputChars: options.maxInputChars || schemas.TASK_LIMITS[spec.task],
      timeoutMs: options.timeoutMs || 60000,
      cache: useCache,
      budgetUsd: budget,
      spentUsd
    });
    calls++;
    if (response.meta.cached) cachedCalls++;
    if (response.meta.usage && response.meta.usage.costKnown) spentUsd += response.meta.usage.estimatedCostUsd;

    if (!response.ok) {
      invalidCalls++;
      const record = {
        task: spec.task,
        dealId: unit.dealId || null,
        field: unit.field || null,
        key: unit.key,
        reason: response.invalid.reason,
        detail: response.invalid.detail,
        provider: response.meta.provider,
        model: response.meta.model,
        promptVersion: response.meta.promptVersion,
        inputHash: response.meta.inputHash,
        generatedAt: response.meta.generatedAt
      };
      invalids.push(record);
      cache.appendInvalid(spec.task, record);
      if (response.invalid.reason !== 'no_provider' && response.invalid.reason !== 'budget_exceeded') {
        console.log(`  ✗ ${unit.key}  ${response.invalid.reason}: ${response.invalid.detail.slice(0, 120)}`);
      }
      if (response.invalid.reason === 'no_provider') {
        console.log('  · 没有可用的 AI provider，停止调用（这不影响任何确定性链路）。');
        break;
      }
      continue;
    }

    const interpreted = mod.interpret(response.result, unit, response.meta);
    if (!interpreted || interpreted.skip) {
      skipped.push({ key: unit.key, dealId: unit.dealId, reason: (interpreted && interpreted.skipReason) || '模型没有提出任何可断言的内容' });
      continue;
    }
    const extra = mod.extraRules ? mod.extraRules(unit, interpreted.candidate, response.result) : {};
    const built = candidates.buildFromResult({
      result: response.result,
      meta: response.meta,
      task: spec.task,
      dealId: unit.dealId,
      sourceUrl: unit.sourceUrl,
      candidateValue: interpreted.candidate,
      evidence: interpreted.evidence || [],
      confidence: interpreted.confidence || {},
      extraErrors: extra.errors || [],
      extraFlags: extra.flags || [],
      extraDeterministic: extra.deterministic || null,
      notes: interpreted.notes || null
    });
    if (built.invalid) {
      invalidCalls++;
      invalids.push(built.invalid);
      cache.appendInvalid(spec.task, built.invalid);
      console.log(`  ✗ ${unit.key}  确定性规则拦下：${built.invalid.detail.slice(0, 120)}`);
      continue;
    }
    if (unit.pair) {
      built.candidate.pair = { a: unit.pair.a.id, b: unit.pair.b.id, signals: unit.pair.signals };
    }
    if (unit.meta) built.candidate.sourceMeta = unit.meta;
    collected.push(built.candidate);
    const mark = built.candidate.status === 'needs_human' ? '⚠' : '✓';
    console.log(`  ${mark} ${unit.key}  ${built.candidate.status}${built.candidate.flags.length ? ` (${built.candidate.flags.map(f => f.code).join(',')})` : ''}`);
  }

  const parts = candidates.partition(collected);
  const payload = {
    schemaVersion: 1,
    task: spec.task,
    label: spec.label,
    promptVersion: mod.PROMPT_VERSION || schemas.PROMPT_VERSIONS[spec.task],
    provider: conf.provider,
    model: conf.model,
    generatedAt: new Date().toISOString(),
    generatedForDate: todayCN(),
    counts: {
      units: units.length,
      runnable: runnable.length,
      candidates: collected.length,
      needsHuman: parts.needsHuman.length,
      invalid: invalids.length,
      skipped: skipped.length,
      cachedCalls,
      calls
    },
    invalid: invalids,
    skipped,
    candidates: collected
  };
  candidates.writeCandidates(outFile, payload);

  console.log('');
  console.log(`候选文件：${path.relative(cache.ROOT, outFile)}`);
  console.log(`候选 ${collected.length} 条（其中需人工判断 ${parts.needsHuman.length} 条）· 无效 ${invalids.length} 条 · 跳过 ${skipped.length} 条 · 调用 ${calls} 次（缓存命中 ${cachedCalls}）`);
  console.log(`本轮估算成本：${spentUsd > 0 ? `$${spentUsd.toFixed(4)}` : '未知/0'}`);

  if (flag('json')) {
    console.log(JSON.stringify({ outFile: path.relative(cache.ROOT, outFile), ...payload.counts }, null, 2));
  }
  return 0;
}

main()
  .then(code => process.exit(code || 0))
  .catch(error => {
    console.error(`AI 维护任务异常：${error && error.stack ? error.stack : error}`);
    process.exit(1);
  });
