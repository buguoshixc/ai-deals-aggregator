#!/usr/bin/env node
/**
 * 把**已被人工接受**的翻译草稿写进 `scripts/data/translations_zh.json`。
 *
 * 与 `ai-apply.js` 同一条纪律，但对象不同：译文覆盖层是**人工维护**的，
 * 所以 AI 只能送草稿，落地的动作必须有人点过。
 *
 * 为什么落地前要**重新跑一遍守卫**（而不是信生成时那次结果）：
 * 草稿是照那一刻的英文写的。如果这期间上游改写了英文，草稿与新英文已经对不上，
 * 而把它写进去会让门禁在第二天才红（甚至更晚）。所以这里拿**当前的英文**再判一次，
 * 并对不上就拒绝 —— 拒绝比"先写进去再说"便宜得多。
 *
 * 用法：
 *   node scripts/tools/zh-apply-candidates.js --id=<候选 id> [--file=…] [--dry-run]
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const candidates = require('../ai/candidates');
const guard = require('../ai/translate-guard');
const translate = require('../ai/translate');
const store = require('../lib/store');

const ROOT = path.join(__dirname, '..', '..');
const OVERLAY = path.join(__dirname, '..', 'data', 'translations_zh.json');

function option(name, fallback = null) {
  const prefix = `--${name}=`;
  const hit = process.argv.find(arg => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

function flag(name) {
  return process.argv.includes(`--${name}`);
}

function main() {
  const id = option('id');
  const dryRun = flag('dry-run');
  const file = option('file')
    ? path.resolve(ROOT, option('file'))
    : path.join(__dirname, '..', 'data', 'translations_zh.candidates.json');

  if (!fs.existsSync(file)) {
    console.error(`找不到候选文件：${path.relative(ROOT, file)}`);
    return 1;
  }
  const payload = candidates.readCandidates(file);
  const accepted = (payload.candidates || []).filter(item => item.review && item.review.decision === 'accept');
  const wanted = id ? accepted.filter(item => item.id === id || item.id.startsWith(id)) : accepted;

  if (!wanted.length) {
    console.log('没有"已接受"的翻译候选。生成草稿：');
    console.log('  node scripts/ai/maintenance.js --task=translate --out=scripts/data/translations_zh.candidates.json --limit=20');
    console.log('  node scripts/tools/ai-accept.js --task=translate --id=<候选 id> --note="…"');
    return 0;
  }

  const deals = new Map(store.loadStore().deals.map(deal => [deal.id, deal]));
  const overlay = JSON.parse(fs.readFileSync(OVERLAY, 'utf8'));
  overlay.byId = overlay.byId || {};
  const before = fs.readFileSync(OVERLAY, 'utf8');

  let applied = 0;
  let refused = 0;

  for (const item of wanted) {
    const deal = deals.get(item.dealId);
    const field = item.field;
    const draft = item.candidate && item.candidate.zh;
    console.log(`▸ ${item.id}  ${deal ? deal.title : item.dealId} / ${field}`);

    if (!deal) {
      console.log('  ✗ 拒绝：deals.json 里找不到这条记录');
      refused++;
      continue;
    }
    if (typeof draft !== 'string' || !draft.trim()) {
      console.log('  ✗ 拒绝：候选里没有译文');
      refused++;
      continue;
    }
    const en = deal[field];
    if (typeof en !== 'string' || !en.trim()) {
      console.log(`  ✗ 拒绝：当前记录里 ${field} 没有英文原文（上游可能已改写）`);
      refused++;
      continue;
    }

    // 用**当前**英文重判一次
    const check = guard.check({ en, zh: draft, terms: translate.termsOf(deal), field });
    if (!check.ok) {
      console.log(`  ✗ 拒绝：译文守卫未通过 —— ${check.violations.map(v => `${v.code}(${v.detail})`).join('；')}`);
      refused++;
      continue;
    }

    const existing = overlay.byId[deal.id] && typeof overlay.byId[deal.id] === 'object' ? overlay.byId[deal.id] : {};
    existing[field] = draft;
    existing.src = existing.src && typeof existing.src === 'object' ? existing.src : {};
    existing.src[field] = en;
    if (!existing._title) existing._title = deal.title;
    overlay.byId[deal.id] = existing;

    applied++;
    console.log(`  ✓ 写入 ${field}（${draft.length} 字）`);
  }

  if (!applied) {
    console.log(`\n没有落地任何译文（拒绝 ${refused} 条）。`);
    return 1;
  }
  if (dryRun) {
    console.log(`\ndry-run：会写入 ${applied} 条，未改文件。`);
    return 0;
  }

  fs.writeFileSync(OVERLAY, `${JSON.stringify(overlay, null, 2)}\n`, 'utf8');

  // 写完全套译文门禁；红了就回滚（与 ai-apply.js 同一条理由：半成品状态更坏）
  let gateOk = true;
  let output = '';
  try {
    output = execFileSync(process.execPath, [path.join(ROOT, 'scripts/tools/zh-todo.js'), '--check'], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
    });
  } catch (error) {
    gateOk = false;
    output = `${error.stdout || ''}${error.stderr || ''}`;
  }

  if (!gateOk) {
    fs.writeFileSync(OVERLAY, before, 'utf8');
    console.log('\n✗ 译文门禁未通过，已回滚：');
    String(output).split('\n').filter(Boolean).slice(-8).forEach(line => console.log(`    ${line}`));
    return 1;
  }

  console.log(`\n已落地 ${applied} 条译文字段 · 拒绝 ${refused} 条`);
  console.log(String(output).split('\n').filter(Boolean).slice(-3).join('\n'));
  console.log('提示：译文指纹已同步写入 src，无需再跑 --scaffold；如需核对请跑 npm run check:zh。');
  return 0;
}

process.exit(main());
