/**
 * t26：复核 14 条新增映射的 **basis 选择**与**引文逐字性**（acceptance ③ 的后半）。
 *
 * 判据（只用精确相等类）：
 *   · 记录自己的 evidence 里若**逐字点名**了这条映射指向的模型（按折叠相等判断），
 *     那么这条映射必须用引文类 basis（official-*），且所附 evidence 必须与记录里的某一条**逐字段相同**；
 *   · 若引文没有点名它，则必须用 explicit-mapping（且 note 非空）。
 *
 * 用法：node research/_raw/t26/basis-audit.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const read = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

const apiDoc = read('api-plans.json');
const linksSrc = read('scripts/data/model-registry-links.json');
const planById = new Map((apiDoc.plans || []).map(plan => [plan.id, plan]));

function fold(value) {
  return String(value === null || value === undefined ? '' : value).normalize('NFKC')
    .replace(/[（(][^（()）]*[）)]\s*$/, '')
    .replace(/[\s\-.‐–—_/／]/g, '')
    .toLowerCase();
}

/** 这条记录的 evidence 里是否有引文提到该条目（modelKey 或官方显示名） */
function quoteNamesEntry(plan, entry) {
  const needles = [fold(entry.modelKey), fold(entry.name)].filter(Boolean);
  const hits = [];
  for (const item of (plan.evidence || [])) {
    const quote = fold(item && item.quote);
    if (!quote) continue;
    // 反向包含也算"点名"：引文里出现该名字的折叠形式（如 "GLM 5.3 1.4 / 4.4"）
    if (needles.some(needle => needle.length >= 4 && quote.includes(needle))) hits.push(item);
  }
  return hits;
}

const apiLinks = linksSrc.links.filter(link => link && link.apiPlanId !== undefined);
const problems = [];
const rows = [];
for (const link of apiLinks) {
  const plan = planById.get(link.apiPlanId);
  if (!plan) { problems.push(`${link.apiPlanId}: 记录不存在`); continue; }
  const entry = (plan.models || []).find(item => item.modelKey === link.modelKey);
  if (!entry) { problems.push(`${link.apiPlanId}|${link.modelKey}: 条目不存在`); continue; }
  const named = quoteNamesEntry(plan, entry);
  const evidenceBased = link.basis !== 'explicit-mapping';
  const evidence = Array.isArray(link.evidence) ? link.evidence : [];
  rows.push({
    key: `${link.apiPlanId}|${link.modelKey}`,
    basis: link.basis,
    quoteNames: named.length,
    evidenceCount: evidence.length,
    note: Boolean(link.note && String(link.note).trim())
  });
  if (named.length && !evidenceBased) {
    problems.push(`${link.apiPlanId}|${link.modelKey}: 记录引文逐字点名了它（${named.length} 条），但它用了 ${link.basis} —— 有官方引文就必须用引文类 basis`);
  }
  if (!named.length && evidenceBased) {
    problems.push(`${link.apiPlanId}|${link.modelKey}: 记录引文没有点名它，却用了 ${link.basis}`);
  }
  if (evidenceBased) {
    for (const item of evidence) {
      const verbatim = (plan.evidence || []).some(source => JSON.stringify(source) === JSON.stringify(item));
      if (!verbatim) problems.push(`${link.apiPlanId}|${link.modelKey}: 所附引文不是记录自己的 evidence 的逐字段副本（new quote）`);
    }
  } else if (!link.note || !String(link.note).trim()) {
    problems.push(`${link.apiPlanId}|${link.modelKey}: explicit-mapping 却没写 note`);
  }
}

console.log(`=== 14+ 条 API 映射的 basis 复核（共 ${rows.length} 条 API 映射，其中 HEAD 之后新增的 14 条在下表标 ★） ===`);
const newKeys = new Set([
  '8a26562011f2|deepseek-ai.v4.1-flash', '929a1f3ec46c|deepseek-v4p1-flash',
  '8a26562011f2|deepseek-ai.v4-pro-0813', '8a26562011f2|zai-org.glm-5.3',
  '929a1f3ec46c|glm-5p3', '8a26562011f2|zai-org.glm-5.3-flash', '929a1f3ec46c|glm-5p3-flash',
  '8a26562011f2|moonshotai.kimi-k3', '929a1f3ec46c|kimi-k3', '8a26562011f2|minimaxai.m3',
  '929a1f3ec46c|minimax-m3', '036c5f09561e|qwen.qwen3.8-27b', '61aa6c3ed3ff|qwen3.8-27b',
  '929a1f3ec46c|qwen3p8-max'
]);
for (const row of rows) {
  if (!newKeys.has(row.key)) continue;
  console.log(`${newKeys.has(row.key) ? '★' : ' '} ${row.key} | basis=${row.basis} | 引文点名=${row.quoteNames} | evidence=${row.evidenceCount} | note=${row.note}`);
}
console.log(`\n复核问题：${problems.length}`);
for (const problem of problems) console.log('  ✗', problem);
console.log(problems.length === 0 ? '✅ basis 选择与引文逐字性全部成立' : '❌ 见上');
