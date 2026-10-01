#!/usr/bin/env node
/**
 * 一次性生成 v2.5 的 API 计费变化基线（`scripts/data/api-plan-history.json` 的 `baseline` 段）。
 *
 * 用法：
 *   node scripts/tools/api-plan-history-baseline.js --dry-run   # 只打印将要冻结什么，不写盘
 *   node scripts/tools/api-plan-history-baseline.js             # 生成基线（已有事件时拒绝）
 *
 * ## 为什么必须是一次性、显式、且会拒绝重跑
 *
 * 基线是「v2.5 开工时的既有状态」。它**不是**创建事件 —— 这些 API 计费记录更早就存在，
 * 只是此前没有变化日志。一旦有了事件，重新基线化会让旧事件的 `from` 对不上新基线，
 * 「基线 + 事件 ⇒ 当前状态」的可重放性当场失效 ⇒ **直接拒绝**，不提供 `--force`。
 *
 * ## 起算日来自数据，不来自墙上时钟
 *
 * API 计费**没有采集器**，所以起算日只能是 `api-plans.json` 的 `updatedAt`
 * （= 全部 `lastSeen` 的最大值）前 10 位 —— 否则我们会给一份人工核对于某天的数据
 * 盖上一个"今天"的章，而那个章没有任何事实含义（与 v2.3 同一条纪律）。
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const API_PLANS = path.join(ROOT, 'api-plans.json');
const apiHistory = require('../lib/api-plan-history');

const dryRun = process.argv.includes('--dry-run');

function main() {
  const loaded = apiHistory.load();
  if (!loaded.missing && Array.isArray(loaded.store.events) && loaded.store.events.length) {
    console.error(`❌ ${path.relative(ROOT, apiHistory.API_PLAN_HISTORY_FILE)} 已有 ${loaded.store.events.length} 条事件，拒绝重新基线化。`);
    console.error('   重新基线化会让旧事件的 from 对不上新基线，「基线 + 事件 ⇒ 当前状态」的可重放性当场失效。');
    return 1;
  }
  if (!loaded.missing && Object.keys((loaded.store.baseline && loaded.store.baseline.fields) || {}).length) {
    console.error(`❌ ${path.relative(ROOT, apiHistory.API_PLAN_HISTORY_FILE)} 已经有一份基线，拒绝覆盖。`);
    return 1;
  }

  if (!fs.existsSync(API_PLANS)) {
    console.error(`❌ 缺少 ${path.relative(ROOT, API_PLANS)}（请先跑 npm run api-plans:rebuild）`);
    return 1;
  }
  const store = JSON.parse(fs.readFileSync(API_PLANS, 'utf8'));
  const plans = Array.isArray(store.plans) ? store.plans : [];
  const at = String(store.updatedAt || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(at)) {
    console.error(`❌ api-plans.json 的 updatedAt 不是合法日期（${store.updatedAt}）—— 起算日必须来自数据`);
    return 1;
  }
  if (!plans.length) {
    console.error('❌ api-plans.json 里没有任何记录 —— 空数据集不该被冻成基线');
    return 1;
  }

  const baseline = apiHistory.baselineOf(plans, { at });
  const records = Object.keys(baseline.fields).length;
  const covered = Object.values(baseline.fields).reduce((sum, values) => sum + Object.keys(values).length, 0);

  console.log('=== API 计费变化基线 ===');
  console.log(`起算日        : ${at}（来自 api-plans.json 的 updatedAt，不是墙上时钟）`);
  console.log(`记录          : ${records} / ${plans.length}（只冻结有跟踪字段值的记录）`);
  console.log(`字段值        : ${covered} 个`);
  console.log(`跟踪字段      : ${apiHistory.API_PLAN_TRACKED_FIELDS.join(' / ')}`);
  console.log('不跟踪（噪音）: lastSeen / verifiedAt / evidence / derivedMetrics / id / provider / planName / channel / 模型显示名');
  console.log('说明          : 基线**不是**创建事件；一条 created 都不会补（不伪造历史）。');

  if (dryRun) {
    console.log('\n--dry-run：没有写盘。');
    return 0;
  }

  const next = { ...apiHistory.emptyStore({ at }), baseline };
  const problems = apiHistory.verifyStore(next, plans, { today: at });
  if (problems.length) {
    console.error(`\n❌ 生成的基线没有通过自校验（${problems.length} 处）：`);
    problems.slice(0, 10).forEach(problem => console.error(`   - ${problem}`));
    return 1;
  }
  apiHistory.save(next);
  const { bytes } = apiHistory.summarize(next, plans);
  console.log(`\n✅ 已写入 ${path.relative(ROOT, apiHistory.API_PLAN_HISTORY_FILE)}（${(bytes / 1024).toFixed(1)} KB）`);
  console.log('   下一步：npm run check:api-plan-history');
  return 0;
}

process.exit(main());
