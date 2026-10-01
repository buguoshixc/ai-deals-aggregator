/**
 * 成本估算：token → 美元。
 *
 * 设计上刻意**保守**：
 *  · 价目表在 `scripts/data/ai-pricing.json`（人工维护），只有 `verified: true` 的条目参与估算；
 *  · 查不到 / 未复核 ⇒ `costKnown: false`、`estimatedCostUsd: 0`，报表显示「未知」。
 *
 * 为什么不内置一张"常见模型价格表"：价格是外部事实且会变，写死在代码里迟早变成
 * 一个**看起来精确、实际过期**的数字，比"未知"更坏。token 数是我们自己数出来的，照常记。
 */

'use strict';

const fs = require('fs');
const path = require('path');

const PRICING_FILE = path.join(__dirname, '..', 'data', 'ai-pricing.json');
const PER_TOKENS = 1e6;

function loadTable(file = process.env.AI_PRICING_FILE || PRICING_FILE) {
  if (!fs.existsSync(file)) return { entries: {}, file, missing: true };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    const entries = parsed && parsed._entries && typeof parsed._entries === 'object' ? parsed._entries : {};
    return { entries, file, missing: false };
  } catch (error) {
    return { entries: {}, file, missing: false, broken: error.message };
  }
}

/** 模型名匹配：API 常返回带日期后缀的名字（gpt-4o-mini-2024-07-18），所以按前缀取最长命中 */
function lookup(model, entries) {
  if (!model) return null;
  const names = Object.keys(entries).filter(name => name && !name.startsWith('_'));
  let best = null;
  for (const name of names) {
    if (model === name || model.startsWith(name)) {
      if (!best || name.length > best.length) best = name;
    }
  }
  return best ? { name: best, entry: entries[best] } : null;
}

function allowUnverified() {
  return process.env.AI_ALLOW_UNVERIFIED_PRICING === '1';
}

/**
 * @param {string} model
 * @param {{inputTokens:number, outputTokens:number}} usage
 * @returns {{estimatedCostUsd:number, costKnown:boolean, priceBasis:string|null, unverified:boolean}}
 */
function estimateCost(model, usage = {}, table = null) {
  const t = table || loadTable();
  const hit = lookup(model, t.entries || {});
  const unknown = { estimatedCostUsd: 0, costKnown: false, priceBasis: null, unverified: false };
  if (!hit) return unknown;
  const { entry } = hit;
  if (typeof entry.in !== 'number' || typeof entry.out !== 'number') return unknown;
  const unverified = entry.verified !== true;
  if (unverified && !allowUnverified()) {
    return { ...unknown, priceBasis: hit.name, unverified: true };
  }
  const inputTokens = Number(usage.inputTokens) || 0;
  const outputTokens = Number(usage.outputTokens) || 0;
  const cost = (inputTokens / PER_TOKENS) * entry.in + (outputTokens / PER_TOKENS) * entry.out;
  return {
    estimatedCostUsd: Math.round(cost * 1e6) / 1e6,
    costKnown: true,
    priceBasis: hit.name,
    unverified
  };
}

module.exports = { PRICING_FILE, loadTable, lookup, estimateCost, allowUnverified };
