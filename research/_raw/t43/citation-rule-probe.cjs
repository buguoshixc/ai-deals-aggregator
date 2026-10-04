#!/usr/bin/env node
/**
 * t43 —— 把「引文未点名的历史映射」这个数字的**口径**现场钉清楚。
 *
 * 背景：残余登记表 §2 的写死规则给出 **34**（清单 sha256 b9d97c44…），
 * 而 t43 的第一版自算规则给出 30 —— 两者都"现场跑"，差别只可能在**归一与子句**上。
 * 这个脚本把若干口径变体一次算出来，看哪一种能复现 34 与那个 sha256，从而把差异归因写清楚。
 *
 * 只读；用法：node research/_raw/t43/citation-rule-probe.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const links = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/data/model-registry-links.json'), 'utf8')).links;
const plans = JSON.parse(fs.readFileSync(path.join(ROOT, 'api-plans.json'), 'utf8')).plans;
const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'models.json'), 'utf8')).models;
const byId = new Map(plans.map(plan => [plan.id, plan]));

const REGISTER_COUNT = 34;
const REGISTER_SHA = 'b9d97c444e7e59d0d90b2855165a1bc67422b2d0dc573805569d2cc5e6c6f696';

const norm = value => String(value === null || value === undefined ? '' : value).normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
const fold = value => String(value === null || value === undefined ? '' : value).normalize('NFKC')
  .replace(/[（(][^（()）]*[）)]\s*$/, '').replace(/[\s\-.‐–—_/／]/g, '').toLowerCase();
const sha = text => crypto.createHash('sha256').update(text).digest('hex');

/**
 * @param {object} opts
 *   normer       'raw' | 'norm' | 'fold'
 *   useName      记录内 name 这一支
 *   useSlug      registry slug 这一支
 *   includeExplicit  是否把 explicit-mapping（本来就无引文）也算进来
 */
function compute(opts) {
  const normer = opts.normer === 'fold' ? fold : opts.normer === 'norm' ? norm : (value => String(value === null || value === undefined ? '' : value));
  const hits = [];
  for (const link of links) {
    if (link.apiPlanId === undefined) continue;
    const plan = byId.get(link.apiPlanId);
    if (!plan) continue;
    const entry = (plan.models || []).find(item => item.modelKey === link.modelKey);
    if (!entry) continue;
    const evidenceBased = link.basis !== 'explicit-mapping';
    if (!opts.includeExplicit && !evidenceBased) continue;
    const needles = [normer(entry.modelKey)];
    if (opts.useName) needles.push(normer(entry.name));
    if (opts.useSlug) needles.push(normer(link.registrySlug));
    const quotes = (plan.evidence || []).map(item => normer(item && item.quote)).filter(Boolean)
      .concat((link.evidence || []).map(item => normer(item && item.quote)).filter(Boolean));
    const named = quotes.some(quote => needles.some(needle => needle && quote.includes(needle)));
    if (!named) hits.push(`${link.apiPlanId}|${link.modelKey}|${link.registrySlug}`);
  }
  hits.sort();
  return { count: hits.length, sha256: sha(hits.join('\n')), sample: hits.slice(0, 3) };
}

const variants = [];
for (const normer of ['raw', 'norm', 'fold']) {
  for (const useName of [true, false]) {
    for (const useSlug of [true, false]) {
      for (const includeExplicit of [false, true]) {
        const result = compute({ normer, useName, useSlug, includeExplicit });
        variants.push({ rule: `归一=${normer} · name=${useName ? '用' : '不用'} · slug=${useSlug ? '用' : '不用'} · explicit-mapping=${includeExplicit ? '算' : '不算'}`, ...result });
      }
    }
  }
}

console.log('=== 口径变体（现场重算）===');
for (const variant of variants) {
  const mark = variant.count === REGISTER_COUNT ? '  ← 与登记表 34 相同' : '';
  const shaMark = variant.sha256 === REGISTER_SHA ? '  ← sha256 也相同' : '';
  console.log(`  ${String(variant.count).padStart(3)}  ${variant.rule}${mark}${shaMark}`);
}
console.log(`\n登记表口径：count=${REGISTER_COUNT} · sha256=${REGISTER_SHA}`);
console.log('登记表 §2 的写死子句（原文）：「apiPlanId 侧 · basis != explicit-mapping · evidence.quote 里不出现 modelKey / 记录内 name / registry slug」');
console.log('登记表 §2 自列的变体：去掉「记录内 name」这一支 → 38；连 explicit-mapping 一起算 → 44');
console.log('\n注：引文搜索同时覆盖**记录自带引文**（plan.evidence）与**链接自带引文**（link.evidence）—— 前者是记录层出处，后者是抄件。');
fs.writeFileSync(path.join(__dirname, 'citation-rule-probe.json'), `${JSON.stringify({ register: { count: REGISTER_COUNT, sha256: REGISTER_SHA }, variants }, null, 2)}\n`, 'utf8');
