#!/usr/bin/env node
/**
 * 一次性生成 v1.4 的历史基线（`scripts/data/deal-history.json` 的 `baseline` 段）。
 *
 * 用法：
 *   node scripts/tools/history-baseline.js --dry-run     # 只打印将要冻结什么，不写盘
 *   node scripts/tools/history-baseline.js               # 生成基线（文件必须不存在）
 *
 * ## 为什么必须是一次性、显式、且会拒绝重跑
 *
 * 基线是「v1.4 开工时的既有状态」。它**不是**创建事件 —— 存量记录更早就存在，
 * 只是此前没有历史。所以：
 *
 *  · 它只能在历史还没有任何事件时生成一次；
 *  · 一旦有了事件，重新基线化等于把「基线 + 事件 ⇒ 当前状态」的可重放性抹掉
 *    （旧事件的 `from` 会对不上新基线），所以**直接拒绝执行**，而不是加个 --force
 *    让人顺手绕过去。真要重来必须人工删除文件并说明理由。
 *
 * 采集路径（scripts/collect.js）在历史文件缺失时**不会**自动生成基线：无人看见地
 * 把「当前状态」冻成一份「起始状态」，正是本层最该避免的伪造历史。缺文件由
 * CI 的 `check:history` 拦下。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const DEALS = path.join(ROOT, 'deals.json');
const { todayCN } = require('../lib/schema');
const history = require('../lib/history');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

function main() {
  const store = history.load();
  if (!store.missing && Array.isArray(store.store.events) && store.store.events.length) {
    console.error(`❌ ${history.HISTORY_FILE} 已有 ${store.store.events.length} 条事件，拒绝重新基线化。`);
    console.error('   重新基线化会让旧事件的 from 对不上新基线，「基线 + 事件 ⇒ 当前状态」的可重放性当场失效。');
    console.error('   确有需要请人工删除该文件并说明理由，然后再跑。');
    process.exit(1);
  }

  const payload = JSON.parse(fs.readFileSync(DEALS, 'utf8'));
  const deals = Array.isArray(payload.deals) ? payload.deals : [];
  const at = todayCN();
  const baseline = history.baselineOf(deals, { at });
  const records = Object.keys(baseline.fields).length;
  const covered = Object.values(baseline.fields).reduce((sum, values) => sum + Object.keys(values).length, 0);

  console.log('=== 历史基线 ===');
  console.log(`起算日        : ${at}`);
  console.log(`记录          : ${records} / ${deals.length}（只冻结有跟踪字段值的记录）`);
  console.log(`字段值        : ${covered} 个`);
  console.log(`跟踪字段      : ${history.TRACKED_FIELDS.join(' / ')}`);
  console.log('不跟踪（噪音）: description / lastSeen / firstSeen / zh / id / title / vendor / url');

  if (dryRun) {
    console.log('\n(dry-run，未写盘)');
    return;
  }

  const next = { ...history.emptyStore({ at }), baseline };
  history.save(next);
  const { bytes } = history.summarize(next, deals);
  console.log(`\n✅ 已写入 ${path.relative(ROOT, history.HISTORY_FILE)}（${(bytes / 1024).toFixed(1)} KB）`);
  console.log('   下一步：npm run check:history 验证链完整性与上限。');
}

main();
