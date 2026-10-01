/**
 * Anthropic provider（Messages API）。
 *
 * 与 openai-compat 的差别只有三处：认证头、请求体形状、`system` 是顶层字段而不是一条消息。
 * 响应里 `content` 是块数组，取第一个 `text` 块。
 */

'use strict';

const DEFAULT_BASE_URL = 'https://api.anthropic.com';
const ANTHROPIC_VERSION = '2023-06-01';

async function call(ctx) {
  const { system, content, model, timeoutMs = 60000, apiKey, baseUrl, signal } = ctx;
  if (!apiKey) return { ok: false, reason: 'no_provider', detail: '缺少 API key（AI_API_KEY / ANTHROPIC_API_KEY）' };
  if (!model) return { ok: false, reason: 'no_provider', detail: '缺少模型名（AI_MODEL）' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true });

  try {
    const res = await fetch(`${(baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '')}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        temperature: 0,
        system: `${system}\n\n只输出一个 JSON 对象，不要任何解释、不要 Markdown 代码块。`,
        messages: [{ role: 'user', content }]
      }),
      signal: controller.signal
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, reason: 'http', detail: `HTTP ${res.status}: ${text.slice(0, 200)}` };

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      return { ok: false, reason: 'http', detail: `响应不是 JSON: ${text.slice(0, 200)}` };
    }
    const blocks = Array.isArray(parsed.content) ? parsed.content : [];
    const out = blocks.filter(b => b && b.type === 'text').map(b => b.text).join('\n');
    if (!out.trim()) return { ok: false, reason: 'http', detail: `响应里没有文本: ${text.slice(0, 200)}` };

    const usage = parsed.usage || {};
    return {
      ok: true,
      text: out,
      model: parsed.model || model,
      usage: {
        inputTokens: Number(usage.input_tokens) || 0,
        outputTokens: Number(usage.output_tokens) || 0
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

module.exports = { id: 'anthropic', call, DEFAULT_BASE_URL };
