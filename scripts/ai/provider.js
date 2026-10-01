/**
 * `generateStructured()` —— **AI 的唯一出口**。
 *
 * 为什么不许采集器/工具直接调模型：
 *  · 一次调用要同时满足六件事（输入上限、净化、结构化校验、缓存、记账、失败收敛），
 *    散在各处就一定会有一处漏掉其中三件；
 *  · 换厂商时只改这里，不改 20 个调用点；
 *  · 「AI 挂了不影响采集」这条承诺靠的是**调用方结构**（AI 不在采集链路里），
 *    而「AI 输出不合格绝不当成数据」这条承诺靠的是这里 —— 返回结构里没有"半成品"这个状态。
 *
 * 契约（`docs/AI-MAINTENANCE-v2.0.md` 第三节）：
 *   **本函数永不 throw**；失败一律收敛成 `{ok:false, invalid:{reason, detail, rawExcerpt}}`。
 */

'use strict';

const cache = require('./cache');
const usage = require('./usage');
const pricing = require('./pricing');
const schemas = require('./schemas');
const secretScan = require('../lib/secret-scan');
const { validateValue, classify } = require('./json-schema');

const openaiCompat = require('./providers/openai-compat');
const anthropic = require('./providers/anthropic');
const mock = require('./providers/mock');
const fail = require('./providers/fail');

/** provider 注册表。`off` 不是适配器，是"没有可用 provider"的显式状态。 */
const PROVIDERS = {
  'openai-compat': openaiCompat,
  anthropic,
  mock,
  fail
};

const REASONS = [
  'json_parse', 'schema_invalid', 'enum_invalid', 'missing_required',
  'too_large', 'timeout', 'http', 'no_provider', 'budget_exceeded',
  'mock_missing', 'provider_error'
];

/** 环境变量里的 key 候选：按 provider 取，全部来自环境/Secret，绝不进仓库 */
function apiKeyFor(provider) {
  const shared = ['AI_API_KEY'];
  const specific = provider === 'anthropic'
    ? ['ANTHROPIC_API_KEY']
    : ['OPENAI_API_KEY', 'DEEPSEEK_API_KEY', 'MOONSHOT_API_KEY', 'DASHSCOPE_API_KEY', 'OPENROUTER_API_KEY'];
  for (const name of [...shared, ...specific]) {
    if (process.env[name]) return { key: process.env[name], from: name };
  }
  return { key: null, from: null };
}

function resolveConfig({ provider, model, baseUrl } = {}) {
  const chosen = provider || process.env.AI_PROVIDER || 'off';
  if (chosen === 'off' || chosen === 'none' || chosen === '') {
    return { provider: 'off', model: null, key: null, keyFrom: null, baseUrl: null };
  }
  if (!PROVIDERS[chosen]) {
    return { provider: chosen, model: null, key: null, keyFrom: null, baseUrl: null, unknownProvider: true };
  }
  const { key, from } = chosen === 'mock' || chosen === 'fail' ? { key: null, from: null } : apiKeyFor(chosen);
  return {
    provider: chosen,
    model: model || process.env.AI_MODEL || null,
    key,
    keyFrom: from,
    baseUrl: baseUrl || process.env.AI_BASE_URL || null
  };
}

/**
 * 从模型输出里取 JSON。
 *
 * 只做一件事：**剥掉一层 Markdown 代码围栏**。这是传输层的常见包装，不是语义修复。
 * 除此之外不做任何"猜"——截取花括号、补全引号、修尾逗号都属于自动修复，
 * 而本版本的纪律是「parse 失败就是 invalid」。是否剥过围栏会记在 meta 里，可追溯。
 */
function extractJson(text) {
  const raw = String(text || '').trim();
  try {
    return { value: JSON.parse(raw), salvaged: null };
  } catch (error) {
    /* 继续尝试剥围栏 */
  }
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(raw);
  if (fence) {
    try {
      return { value: JSON.parse(fence[1]), salvaged: 'fence' };
    } catch (error) {
      return { value: null, salvaged: 'fence_failed' };
    }
  }
  return { value: null, salvaged: null };
}

function invalidResult(reason, detail, extra = {}) {
  if (!REASONS.includes(reason)) reason = 'provider_error';
  return { ok: false, result: null, invalid: { reason, detail: String(detail).slice(0, 400), ...extra } };
}

/**
 * @param {object} args 见 docs/AI-MAINTENANCE-v2.0.md 第三节
 * @returns {Promise<object>} 永不 throw
 */
async function generateStructured(args = {}) {
  const started = Date.now();
  const {
    task, promptVersion, system = '', content = '', schema = null,
    provider, model, baseUrl, timeoutMs = 60000,
    maxInputChars = schemas.TASK_LIMITS[task] || 4000,
    cache: useCache = true, budgetUsd = null, spentUsd = 0, signal
  } = args;

  if (!task) return invalidResult('provider_error', '缺少 task');
  const effectiveSchema = schema || schemas.SCHEMAS[task] || null;
  const effectivePromptVersion = promptVersion || schemas.PROMPT_VERSIONS[task] || `${task}-v0`;
  const conf = resolveConfig({ provider, model, baseUrl });

  const baseMeta = {
    task,
    provider: conf.provider,
    model: conf.model,
    promptVersion: effectivePromptVersion,
    inputHash: cache.inputHashOf(content),
    cacheKey: null,
    cached: false,
    generatedAt: new Date().toISOString(),
    durationMs: 0,
    usage: { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0, costKnown: false }
  };

  const finish = (result, metaPatch = {}) => {
    const meta = { ...baseMeta, ...metaPatch };
    meta.durationMs = Date.now() - started;
    if (meta.cacheKey) {
      usage.record({
        generatedAt: meta.generatedAt,
        task,
        provider: meta.provider,
        model: meta.model,
        promptVersion: effectivePromptVersion,
        inputHash: meta.inputHash,
        cacheKey: meta.cacheKey,
        cached: meta.cached,
        ok: result.ok === true,
        invalidReason: result.ok ? null : result.invalid.reason,
        inputTokens: meta.usage.inputTokens,
        outputTokens: meta.usage.outputTokens,
        estimatedCostUsd: meta.usage.estimatedCostUsd,
        costKnown: meta.usage.costKnown,
        unverifiedCost: Boolean(meta.usage.unverified),
        inputChars: String(content).length
      });
    }
    return { ...result, meta };
  };

  /* ---- ① 输入上限：超了就拒绝，不裁剪后硬送 ----------------------------------
   * 裁剪会让模型在"看不到的部分"上给出确定结论（本该 unknown），
   * 所以宁可让调用方先去净化/取样，也不在这里偷偷截断。 */
  const chars = String(content).length;
  if (maxInputChars && chars > maxInputChars) {
    return finish(invalidResult('too_large', `输入 ${chars} 字 > 上限 ${maxInputChars} 字（请先净化/取样）`), { rejectedAt: 'input' });
  }

  /* ---- ② 没有可用 provider：明确的"跳过"，不是失败 ------------------------- */
  if (conf.provider === 'off') {
    return finish(invalidResult('no_provider', '没有配置 AI provider（AI_PROVIDER=off 或未设置）'), { skipped: true });
  }
  if (conf.unknownProvider) {
    return finish(invalidResult('no_provider', `未知 provider "${conf.provider}"`), { skipped: true });
  }
  if (conf.provider !== 'mock' && conf.provider !== 'fail' && !conf.key) {
    return finish(invalidResult('no_provider', `provider ${conf.provider} 缺少 API key`), { skipped: true });
  }
  if (conf.provider !== 'mock' && conf.provider !== 'fail' && !conf.model) {
    return finish(invalidResult('no_provider', '缺少模型名（AI_MODEL）'), { skipped: true });
  }

  /* ---- ③ 预算 -------------------------------------------------------------- */
  if (budgetUsd != null && Number(spentUsd) >= Number(budgetUsd)) {
    return finish(invalidResult('budget_exceeded', `已花费/上限 ${spentUsd}/${budgetUsd} USD`), { skipped: true });
  }

  /* ---- ④ 缓存 -------------------------------------------------------------- */
  const key = cache.cacheKeyOf({
    task,
    promptVersion: effectivePromptVersion,
    provider: conf.provider,
    model: conf.model || 'none',
    inputHash: baseMeta.inputHash
  });
  baseMeta.cacheKey = key;

  if (useCache) {
    const hit = cache.read(task, key);
    if (hit.hit && hit.payload && hit.payload.response) {
      const cachedModel = hit.payload.model || conf.model;
      return finish(
        { ok: true, result: hit.payload.response, invalid: null },
        {
          cached: true,
          model: cachedModel,
          generatedAt: hit.payload.generatedAt || baseMeta.generatedAt,
          usage: {
            inputTokens: 0,
            outputTokens: 0,
            estimatedCostUsd: 0,
            costKnown: true
          },
          cacheBroken: hit.broken || null
        }
      );
    }
  }

  /* ---- ⑤ 真的调用 ---------------------------------------------------------- */
  const adapter = PROVIDERS[conf.provider];
  let response;
  try {
    response = await adapter.call({
      system, content, model: conf.model, timeoutMs,
      apiKey: conf.key, baseUrl: conf.baseUrl,
      schema: effectiveSchema, schemaName: task, task,
      promptVersion: effectivePromptVersion, cacheKey: key, signal
    });
  } catch (error) {
    return finish(invalidResult('provider_error', `provider 抛异常: ${(error && error.message) || error}`));
  }

  if (!response || !response.ok) {
    const reason = response && REASONS.includes(response.reason) ? response.reason : 'provider_error';
    const detail = (response && response.detail) || 'provider 未返回可用的文本';
    return finish(invalidResult(reason, detail), {
      usage: { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0, costKnown: false },
      model: response && response.model ? response.model : conf.model
    });
  }

  const usedModel = response.model || conf.model;
  const rawUsage = response.usage || { inputTokens: 0, outputTokens: 0 };
  const cost = pricing.estimateCost(usedModel, rawUsage);
  const metaPatch = {
    model: usedModel,
    usage: {
      inputTokens: rawUsage.inputTokens || 0,
      outputTokens: rawUsage.outputTokens || 0,
      estimatedCostUsd: cost.estimatedCostUsd,
      costKnown: cost.costKnown,
      unverified: cost.unverified,
      priceBasis: cost.priceBasis
    }
  };

  /* ---- ⑥ 解析 -------------------------------------------------------------- */
  const extracted = extractJson(response.text);
  if (extracted.value === null) {
    return finish(
      invalidResult('json_parse', `模型输出不是合法 JSON（${extracted.salvaged || '未剥围栏'}）`, {
        rawExcerpt: secretScan.redactText(String(response.text).slice(0, 400))
      }),
      metaPatch
    );
  }

  /* ---- ⑦ 严格校验：schema → enum → 必填 ------------------------------------ */
  if (effectiveSchema) {
    const check = validateValue(effectiveSchema, extracted.value);
    if (!check.ok) {
      const reason = classify(check.errors);
      return finish(
        invalidResult(reason, check.errors.slice(0, 6).map(e => `${e.path}: ${e.message}`).join('; '), {
          errors: check.errors.slice(0, 12).map(e => ({ path: e.path, code: e.code, message: e.message })),
          rawExcerpt: secretScan.redactText(JSON.stringify(extracted.value).slice(0, 400))
        }),
        metaPatch
      );
    }
  }

  cache.write(task, key, {
    key,
    task,
    promptVersion: effectivePromptVersion,
    provider: conf.provider,
    model: usedModel,
    inputHash: baseMeta.inputHash,
    generatedAt: baseMeta.generatedAt,
    request: { systemChars: String(system).length, contentChars: chars, maxInputChars },
    usage: metaPatch.usage,
    response: extracted.value
  });

  return finish(
    { ok: true, result: extracted.value, invalid: null },
    { ...metaPatch, jsonSalvage: extracted.salvaged }
  );
}

module.exports = {
  generateStructured,
  resolveConfig,
  extractJson,
  PROVIDERS,
  REASONS,
  apiKeyFor
};
