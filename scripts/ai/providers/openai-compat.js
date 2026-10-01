/**
 * OpenAI 兼容 provider。
 *
 * 「兼容」指的是几乎所有自建/第三方端点（OpenAI、DeepSeek、Moonshot、通义、vLLM、Ollama、
 * OpenRouter…）都实现同一个 `/chat/completions`。所以这里**只有一个适配器**，
 * 换厂商只改 `AI_BASE_URL` / `AI_MODEL`，不改代码。
 *
 * ## 关于 response_format
 *
 * 有些兼容端点接受 `json_schema`（严格模式），有些只接受 `json_object`，还有的会直接 400。
 * 默认用最广的 `json_object` + **我们自己的校验器**（`json-schema.js`）；
 * 需要严格模式时设 `AI_JSON_SCHEMA=1`。
 * 这不是"放宽要求"：真正的严格来自本地校验 —— 不合格一律 `invalid`，不进候选。
 *
 * 只输出 JSON 的指令同时写在 system 里，因为 `json_object` 只保证"是合法 JSON"，
 * 不保证"是我们要的那个对象"。
 */

'use strict';

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

async function call(ctx) {
  const { system, content, model, timeoutMs = 60000, apiKey, baseUrl, schema, schemaName, signal } = ctx;
  if (!apiKey) return { ok: false, reason: 'no_provider', detail: '缺少 API key（AI_API_KEY / OPENAI_API_KEY）' };
  if (!model) return { ok: false, reason: 'no_provider', detail: '缺少模型名（AI_MODEL）' };

  const body = {
    model,
    temperature: 0,
    max_tokens: 2048,
    messages: [
      { role: 'system', content: `${system}\n\n只输出一个 JSON 对象，不要任何解释、不要 Markdown 代码块。` },
      { role: 'user', content }
    ]
  };
  if (process.env.AI_JSON_SCHEMA === '1' && schema) {
    body.response_format = {
      type: 'json_schema',
      json_schema: { name: schemaName || 'candidate', strict: true, schema }
    };
  } else {
    body.response_format = { type: 'json_object' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true });

  try {
    const res = await fetch(`${(baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, reason: 'http', detail: `HTTP ${res.status}: ${text.slice(0, 200)}` };
    }
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      return { ok: false, reason: 'http', detail: `响应不是 JSON: ${text.slice(0, 200)}` };
    }
    const choice = parsed.choices && parsed.choices[0];
    const out = choice && choice.message ? choice.message.content : null;
    if (typeof out !== 'string' || !out.trim()) {
      return { ok: false, reason: 'http', detail: `响应里没有内容: ${text.slice(0, 200)}` };
    }
    const usage = parsed.usage || {};
    return {
      ok: true,
      text: out,
      model: parsed.model || model,
      usage: {
        inputTokens: Number(usage.prompt_tokens) || 0,
        outputTokens: Number(usage.completion_tokens) || 0
      }
    };
  } catch (error) {
    if (error && (error.name === 'AbortError' || error.code === 'ABORT_ERR')) {
      return { ok: false, reason: 'timeout', detail: `超过 ${timeoutMs}ms 未返回` };
    }
    return { ok: false, reason: 'http', detail: String((error && error.message) || error).slice(0, 200) };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { id: 'openai-compat', call, DEFAULT_BASE_URL };
