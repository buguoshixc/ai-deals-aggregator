/**
 * mock / replay provider：把「模型会说什么」变成一份**可提交、可复现**的文件。
 *
 * 为什么需要它（而不是"有 key 才能测"）：
 *  ① 门禁里必须能跑 AI 自检与牙测试，而 CI 里**没有** API key，也不该有；
 *  ② 评测要可复现：同一份输入必须得到同一份输出，否则「AI 这次准了多少」这句话不可复核；
 *  ③ 断网、欠费、厂商改接口都不该让我们的门禁变红 —— 那是别人的可用性，不是我们的正确性。
 *
 * 取响应的顺序：
 *  1. `AI_MOCK_RESPONSE`（直接给一段 JSON 文本，测试里最方便）；
 *  2. `AI_MOCK_FILE` 指向的 JSON 映射：`{ "<cacheKey>": "<响应文本>", "*": "<兜底响应>" }`；
 *  3. `.ai-cache/mock/<cacheKey>.json` / `.ai-cache/mock/<task>.json`。
 *
 * 都不命中 ⇒ `mock_missing`。**刻意不返回一个"看起来像样"的空对象**：
 * 静默兜底会让"其实没测到"伪装成"测试通过"。
 */

'use strict';

const fs = require('fs');
const path = require('path');
const cache = require('../cache');

function loadMap(file) {
  if (!file || !fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    return { __broken: error.message };
  }
}

function pick(map, cacheKey, task) {
  if (!map || map.__broken) return null;
  if (map[cacheKey] !== undefined) return map[cacheKey];
  if (map[task] !== undefined) return map[task];
  if (map['*'] !== undefined) return map['*'];
  return null;
}

async function call(ctx) {
  const { task, cacheKey } = ctx;

  if (process.env.AI_MOCK_RESPONSE) {
    return { ok: true, text: process.env.AI_MOCK_RESPONSE, model: 'mock', usage: { inputTokens: 0, outputTokens: 0 } };
  }

  const explicit = loadMap(process.env.AI_MOCK_FILE);
  const picked = pick(explicit, cacheKey, task);
  if (typeof picked === 'string') {
    return { ok: true, text: picked, model: 'mock', usage: { inputTokens: 0, outputTokens: 0 } };
  }

  const dir = cache.mockDir();
  for (const name of [`${cacheKey}.json`, `${task}.json`]) {
    const file = path.join(dir, name);
    if (!fs.existsSync(file)) continue;
    try {
      const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
      const text = typeof payload === 'string' ? payload : payload.response;
      if (typeof text === 'string') {
        return {
          ok: true,
          text,
          model: payload.model || 'mock',
          usage: payload.usage || { inputTokens: 0, outputTokens: 0 }
        };
      }
    } catch (error) {
      return { ok: false, reason: 'mock_missing', detail: `${file} 解析失败: ${error.message}` };
    }
  }

  return {
    ok: false,
    reason: 'mock_missing',
    detail: `mock provider 没有 ${task} 的录制响应（找过 AI_MOCK_RESPONSE / AI_MOCK_FILE / ${path.relative(cache.ROOT, dir)}）`
  };
}

module.exports = { id: 'mock', call };
