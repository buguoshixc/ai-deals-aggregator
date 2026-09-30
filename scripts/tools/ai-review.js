#!/usr/bin/env node
/**
 * 候选审阅表（只读）。
 *
 * 用法：
 *   node scripts/tools/ai-review.js                      # 最近一份候选
 *   node scripts/tools/ai-review.js --task=dedup
 *   node scripts/tools/ai-review.js --file=.ai-cache/candidates/extract-2026-10-01-0130.json
 *   node scripts/tools/ai-review.js --json               # 机器可读
 *
 * 它替代的是哪一段人工：**全库人眼排查**。
 * 所以这张表只做两件事：把「AI 想改什么」和「现在是什么」并排放，
 * 并把**没有依据的确定结论单独列出来** —— 那一栏是最容易被忽略、后果最重的一栏。
 *
 * 本工具**永不改文件**（连候选文件都不改）：审阅是看，接受是 `ai-accept`。
 */

'use strict';

const fs = require('fs');
const path = require('path');

const candidates = require('../ai/candidates');
const store = require('../lib/store');
const audience = require('../lib/audience');

const ROOT = path.join(__dirname, '..', '..');

function option(name, fallback = null) {
  const prefix = `--${name}=`;
  const hit = process.argv.find(arg => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

function flag(name) {
  return process.argv.includes(`--${name}`);
}

const FIELD_LABELS = {
  audience: '适用人群',
  benefitType: '福利类型',
  eligibilityDetail: '资格门槛',
  claimRequirements: '领取条件',
  availability: '中国大陆可用',
  discountInfo: '优惠文案',
  eligibility: '资格说明',
  validity: '有效期说明'
};

function label(field) {
  return FIELD_LABELS[field] || field;
}

function show(value) {
  if (value === undefined || value === null) return '（无）';
  if (Array.isArray(value)) return value.length ? value.join(' / ') : '（空）';
  if (typeof value === 'object') {
    const parts = Object.entries(value).map(([key, item]) => `${key}=${showScalar(item)}`);
    return parts.length ? parts.join(' ') : '（空）';
  }
  return showScalar(value);
}

function showScalar(value) {
  if (value === null || value === undefined) return '（无）';
  if (value === 'unknown') return 'unknown';
  return String(value);
}

/** 逐字段展开：map 型字段拆到子键，才能与现值并排比较 */
function rowsFor(candidate, deal) {
  const rows = [];
  const value = candidate.candidate || {};
  for (const field of Object.keys(value)) {
    if (field === 'relation' || field === 'reason' || field === 'evidence') continue;
    const current = deal ? deal[field] : undefined;
    if (value[field] && typeof value[field] === 'object' && !Array.isArray(value[field])) {
      for (const key of Object.keys(value[field])) {
        rows.push({
          field: `${label(field)}.${key}`,
          current: current && typeof current === 'object' ? showScalar(current[key]) : '（无）',
          next: showScalar(value[field][key])
        });
      }
    } else {
      rows.push({ field: label(field), current: show(current), next: show(value[field]) });
    }
  }
  return rows;
}

function evidenceFor(candidate, field) {
  const items = (candidate.evidence || []).filter(item => item && (item.field === field || item.field === candidate.field));
  return items.map(item => (typeof item === 'string' ? item : item.quote)).join(' ｜ ');
}

function main() {
  const task = option('task');
  const fileArg = option('file');
  const file = fileArg
    ? path.resolve(ROOT, fileArg)
    : candidates.latestCandidatesFile(task);

  if (!file || !fs.existsSync(file)) {
    console.log(`没有找到候选文件${task ? `（task=${task}）` : ''}。先跑一次维护任务，例如：`);
    console.log('  node scripts/ai/maintenance.js --task=extract --limit=10');
    return 0;
  }

  const payload = candidates.readCandidates(file);
  const deals = new Map(store.loadStore().deals.map(deal => [deal.id, deal]));

  if (flag('json')) {
    console.log(JSON.stringify(payload, null, 2));
    return 0;
  }

  console.log(`候选审阅 · ${payload.label || payload.task}（${payload.task}）`);
  console.log(`文件：${path.relative(ROOT, file)}`);
  console.log(`生成：${payload.generatedAt} · provider=${payload.provider} model=${payload.model} prompt=${payload.promptVersion}`);
  console.log(`候选 ${payload.counts.candidates} 条（需人工 ${payload.counts.needsHuman}）· 无效 ${payload.counts.invalid} · 跳过 ${payload.counts.skipped}`);
  console.log('');

  const needsHuman = payload.candidates.filter(item => item.status === 'needs_human');
  const normal = payload.candidates.filter(item => item.status !== 'needs_human');

  if (payload.task === 'dedup_pair') {
    const buckets = new Map();
    for (const item of payload.candidates) {
      const relation = (item.candidate && item.candidate.relation) || 'unknown';
      if (!buckets.has(relation)) buckets.set(relation, []);
      buckets.get(relation).push(item);
    }
    // `same_vendor` 单独一组：它是这里最危险的类别（同厂商 ≠ 同一优惠）
    const order = ['same_offer', 'same_product_different_offer', 'same_vendor', 'uncertain', 'unrelated'];
    for (const relation of order) {
      const items = buckets.get(relation);
      if (!items) continue;
      const note = relation === 'same_vendor'
        ? '  ← 同厂商**不等于**同一优惠；这一组只供参考，不接受合并'
        : (relation === 'same_offer' ? '  ← 值得人看的唯一一类（仍然不能自动合并）' : '');
      console.log(`【${relation}】${items.length} 对${note}`);
      for (const item of items) {
        const a = deals.get(item.pair ? item.pair.a : item.dealId);
        const b = deals.get(item.pair ? item.pair.b : item.field);
        console.log(`  ${item.id}  ${a ? a.title : '?'}  ↔  ${b ? b.title : '?'}`);
        console.log(`      理由：${(item.candidate && item.candidate.reason) || '（无）'}`);
        console.log(`      依据：${(item.candidate && (item.candidate.evidence || []).join(' ｜ ')) || '（无）'}  置信 ${item.confidence && item.confidence.relation}`);
      }
      console.log('');
    }
    console.log('提醒：AI 只能"发现"。要合并，只有一条人工路径 —— 在 scripts/data/aliases.json 登记别名。');
    return 0;
  }

  if (!normal.length && !needsHuman.length) {
    console.log('（本次没有可审阅的候选）');
    return 0;
  }

  console.log('=== 可直接审阅的候选 ===');
  for (const item of normal) {
    const deal = deals.get(item.dealId);
    console.log(`▸ ${item.id}  ${deal ? deal.title : item.dealId}${item.sourceUrl ? `  ${item.sourceUrl}` : ''}`);
    for (const row of rowsFor(item, deal)) {
      const changed = row.current !== row.next ? ' *' : '';
      console.log(`    ${row.field.padEnd(22)} 现：${row.current}  →  候选：${row.next}${changed}`);
    }
    const conf = Object.entries(item.confidence || {}).map(([key, value]) => `${key}=${value}`).join(' ');
    console.log(`    置信度：${conf || '（无）'}`);
    for (const entry of item.evidence || []) {
      if (entry && entry.quote) console.log(`    引文[${entry.field}]：${entry.quote}`);
    }
    if (item.notes) console.log(`    模型说明：${item.notes}`);
    console.log('');
  }

  if (needsHuman.length) {
    console.log('=== 需人工判断（AI 给了结论，但依据不足）===');
    console.log('    这一栏是本表最重要的部分：错的 unknown 只是少一行信息，错的确定值是平台对读者说假话。');
    for (const item of needsHuman) {
      const deal = deals.get(item.dealId);
      console.log(`▸ ${item.id}  ${deal ? deal.title : item.dealId}`);
      for (const row of rowsFor(item, deal)) {
        console.log(`    ${row.field.padEnd(22)} 现：${row.current}  →  候选：${row.next}`);
      }
      for (const flagItem of item.flags || []) {
        console.log(`    ⚠ ${flagItem.code}：${flagItem.detail}`);
      }
      console.log('');
    }
  }

  if (payload.invalid && payload.invalid.length) {
    console.log('=== 被确定性规则拦下的（不可接受）===');
    const byReason = new Map();
    for (const item of payload.invalid) byReason.set(item.reason, (byReason.get(item.reason) || 0) + 1);
    for (const [reason, count] of byReason) console.log(`  ${reason}: ${count} 条`);
    console.log('');
  }

  console.log('下一步：');
  console.log('  node scripts/tools/ai-accept.js --id=<候选 id> [--note="..."]');
  console.log('  node scripts/tools/ai-apply.js  --id=<候选 id>');
  return 0;
}

process.exit(main());
