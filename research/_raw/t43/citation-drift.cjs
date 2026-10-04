#!/usr/bin/env node
/**
 * t43 —— 把「引文未点名」的**数字漂移**定位到具体提交（acceptance ⑤ 要求"数字不同要写清原因"）。
 *
 * 做法：拿若干历史提交的 `scripts/data/model-registry-links.json` + `api-plans.json`，
 * 用**同一支规则**重算，看数字在哪一跳从 34 变成别的值。
 *
 * 只读（`git show`）；用法：node research/_raw/t43/citation-drift.cjs
 */
'use strict';

const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const show = (sha, rel) => JSON.parse(execFileSync('git', ['-C', ROOT, 'show', `${sha}:${rel}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));

const COMMITS = [
  ['a4dd40f', '基线'],
  ['aea3e70', 't23 落地（API 侧处置 + 14 条映射）'],
  ['5657fd8', 't31/t34 检查点（修假红 + 反绕过牙）'],
  ['af92d5d', 't33 收口（4 条引文改官方逐字片段 + 同步抄件）'],
  ['9f27836', 't35（残余登记表最后一次改动的时点）'],
  ['e437e9f', 'HEAD（t41/t42 全量 Gate 报告）']
];

/** 与 citation-rule-probe 相同的规则：raw 子串 · 用 modelKey/name/slug 三支 · 不算 explicit-mapping */
function countAt(sha, { quoteSource }) {
  const links = show(sha, 'scripts/data/model-registry-links.json').links;
  const plans = show(sha, 'api-plans.json').plans;
  const byId = new Map(plans.map(plan => [plan.id, plan]));
  const hits = [];
  for (const link of links) {
    if (link.apiPlanId === undefined) continue;
    const plan = byId.get(link.apiPlanId);
    if (!plan) continue;
    const entry = (plan.models || []).find(item => item.modelKey === link.modelKey);
    if (!entry) continue;
    if (link.basis === 'explicit-mapping') continue;
    const needles = [String(entry.modelKey), String(entry.name), String(link.registrySlug)].filter(Boolean);
    const quotes = quoteSource === 'plan'
      ? (plan.evidence || []).map(item => String((item && item.quote) || ''))
      : quoteSource === 'link'
        ? (link.evidence || []).map(item => String((item && item.quote) || ''))
        : [...(plan.evidence || []).map(item => String((item && item.quote) || '')),
           ...(link.evidence || []).map(item => String((item && item.quote) || ''))];
    const named = quotes.some(quote => needles.some(needle => quote.includes(needle)));
    if (!named) hits.push(`${link.apiPlanId}|${link.modelKey}|${link.registrySlug}`);
  }
  return { count: hits.length, hits };
}

console.log('=== 同一支规则（raw 子串 · modelKey/name/slug · 不算 explicit-mapping）在不同提交上的读数 ===');
for (const source of ['plan', 'link', 'both']) {
  console.log(`\n引文来源 = ${source}：`);
  for (const [sha, label] of COMMITS) {
    const { count } = countAt(sha, { quoteSource: source });
    console.log(`  ${count.toString().padStart(3)}  ${sha}  ${label}`);
  }
}

console.log('\n=== HEAD 上的逐条命中（引文来源=both）===');
const head = countAt('e437e9f', { quoteSource: 'both' });
for (const hit of head.hits) console.log(`  · ${hit}`);
