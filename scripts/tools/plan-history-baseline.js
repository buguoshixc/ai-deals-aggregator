#!/usr/bin/env node
/**
 * 一次性生成 v2.3 的套餐变化基线（`scripts/data/plan-history.json` 的 `baseline` 段）。
 *
 * 用法：
 *   node scripts/tools/plan-history-baseline.js --dry-run   # 只打印将要冻结什么，不写盘
 *   node scripts/tools/plan-history-baseline.js             # 生成基线（已有事件时拒绝）
 *
 * ## 为什么必须是一次性、显式、且会拒绝重跑
 *
 * 基线是「v2.3 开工时的既有状态」。它**不是**创建事件 —— 这 9 条套餐更早就存在，
 * 只是此前没有变化日志。所以一旦有了事件，重新基线化会让旧事件的 `from` 对不上新基线，
 * 「基线 + 事件 ⇒ 当前状态」的可重放性当场失效 ⇒ **直接拒绝**，不加 `--force`。
 *
 * ## 起算日来自数据，不来自墙上时钟
 *
 * deals 的基线用 `todayCN()`（它有采集器，"今天是采集日"成立）。plans **没有采集器**，
 * 所以起算日只能是 `plans.json` 的 `updatedAt`（= 全部 `lastSeen` 的最大值）前 10 位 ——
 * 否则我们会给一份人工核对于 2026-10-01 的数据盖上一个"今天"的章，而那个章没有任何事实含义。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const PLANS = path.join(ROOT, 'plans.json');
const planHistory = require('../lib/plan-history');

const dryRun = process.argv.includes('--dry-run');

function main() {
  const loaded = planHistory.load();
  if (!loaded.missing && Array.isArray(loaded.store.events) && loaded.store.events.length) {
    console.error(`❌ ${path.relative(ROOT, planHistory.PLAN_HISTORY_FILE)} 已有 ${loaded.store.events.length} 条事件，拒绝重新基线化。`);
    console.error('   重新基线化会让旧事件的 from 对不上新基线，「基线 + 事件 ⇒ 当前状态」的可重放性当场失效。');
    console.error('   确有需要请人工删除该文件并说明理由，然后再跑。');
    return 1;
  }
  if (!loaded.missing && Object.keys((loaded.store.baseline && loaded.store.baseline.fields) || {}).length) {
    console.error(`❌ ${path.relative(ROOT, planHistory.PLAN_HISTORY_FILE)} 已经有一份基线，拒绝覆盖。`);
    console.error('   基线是「启用日志那一刻的既有状态」这一唯一事实，不能被第二次冻结覆盖。');
    return 1;
  }

  if (!fs.existsSync(PLANS)) {
    console.error(`❌ 缺少 ${path.relative(ROOT, PLANS)}（请先跑 npm run plans:rebuild）`);
    return 1;
  }
  const store = JSON.parse(fs.readFileSync(PLANS, 'utf8'));
  const plans = Array.isArray(store.plans) ? store.plans : [];
  const at = String(store.updatedAt || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(at)) {
    console.error(`❌ plans.json 的 updatedAt 不是合法日期（${store.updatedAt}）—— 起算日必须来自数据`);
    return 1;
  }
  if (!plans.length) {
    console.error('❌ plans.json 里没有任何套餐 —— 空数据集不该被冻成基线');
    return 1;
  }

  const baseline = planHistory.baselineOf(plans, { at });
  const records = Object.keys(baseline.fields).length;
  const covered = Object.values(baseline.fields).reduce((sum, values) => sum + Object.keys(values).length, 0);

  console.log('=== 套餐变化基线 ===');
  console.log(`起算日        : ${at}（来自 plans.json 的 updatedAt，不是墙上时钟）`);
  console.log(`套餐          : ${records} / ${plans.length}（只冻结有跟踪字段值的记录）`);
  console.log(`字段值        : ${covered} 个`);
  console.log(`跟踪字段      : ${planHistory.PLAN_TRACKED_FIELDS.join(' / ')}`);
  console.log('不跟踪（噪音）: lastSeen / verifiedAt / evidence / derivedMetrics / notes / id / provider / planName');
  console.log('说明          : 基线**不是**创建事件；一条 created 都不会补（不伪造历史）。');

  if (dryRun) {
    console.log('\n--dry-run：没有写盘。');
    return 0;
  }

  const next = { ...planHistory.emptyStore({ at }), baseline };
  const problems = planHistory.verifyStore(next, plans, { today: at });
  if (problems.length) {
    console.error(`\n❌ 生成的基线没有通过自校验（${problems.length} 处）：`);
    problems.slice(0, 10).forEach(problem => console.error(`   - ${problem}`));
    return 1;
  }
  planHistory.save(next);
  const { bytes } = planHistory.summarize(next, plans);
  console.log(`\n✅ 已写入 ${path.relative(ROOT, planHistory.PLAN_HISTORY_FILE)}（${(bytes / 1024).toFixed(1)} KB）`);
  console.log('   下一步：npm run check:plan-history');
  return 0;
}

process.exit(main());
