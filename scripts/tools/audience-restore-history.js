#!/usr/bin/env node
/**
 * 修复 2026-09-29 被 merge 推晚的 `firstSeen`（以及被置空的 `sourceUrl`）。
 *
 * 用法：
 *   node scripts/tools/audience-restore-history.js --dry-run
 *   node scripts/tools/audience-restore-history.js
 *
 * ## 背景
 *
 * 一次真实 merge 把 32 条策展记录的 `firstSeen` 从 `2026-09-21/22/23` 刷成了当天，
 * 另把 6 条的 `sourceUrl`（指向 layer3labs / futuretools 等聚合站的原始出处）置空。
 * 根因（策展文件不带 `firstSeen` → `makeDeal` 盖当天 → 策展侧赢了记录）已在
 * `lib/store.js` 的 `injectFirstSeen` 与 `lib/dedup.js` 的取更早逻辑里修掉；
 * 但**已经被推晚的值不会自己回来**，需要从 git 历史里取回。
 *
 * ## 取值来源与纪律
 *
 * 只从 `git show HEAD:<file>` 取，且**只在「修复方向明确」时写**：
 *   · `firstSeen`：当前值 **晚于** HEAD 值时才改回 HEAD 值（历史只会被推晚，不会被推早）；
 *   · `sourceUrl`：当前为空、且 HEAD 有值时才补回（原始出处不该被静默丢掉）。
 *
 * 两个方向都不是「以 HEAD 为准」的无条件回滚 —— 那样会把本轮真实新增的条目也拉回旧状态。
 * 除此之外**不碰任何字段**（含六个新字段）：脚本逐条断言这一点。
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { writeDeals, assertAllValid } = require('../lib/store');
const { validateDeal } = require('../lib/schema');

const ROOT = path.join(__dirname, '..', '..');
const DEALS = path.join(ROOT, 'deals.json');
const DRY_RUN = process.argv.includes('--dry-run');

function main() {
  const store = JSON.parse(fs.readFileSync(DEALS, 'utf8'));
  const head = JSON.parse(execSync('git show HEAD:deals.json', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
  const headById = new Map(head.deals.map(d => [d.id, d]));

  const fixedFirstSeen = [];
  const fixedSourceUrl = [];
  const deals = store.deals.map(deal => {
    const old = headById.get(deal.id);
    if (!old) return deal;
    let next = deal;
    if (old.firstSeen && deal.firstSeen && deal.firstSeen > old.firstSeen) {
      fixedFirstSeen.push(`${deal.title} · ${deal.firstSeen} → ${old.firstSeen}`);
      next = { ...next, firstSeen: old.firstSeen };
    }
    if (!deal.sourceUrl && old.sourceUrl) {
      fixedSourceUrl.push(`${deal.title} · ${old.sourceUrl}`);
      next = { ...next, sourceUrl: old.sourceUrl };
    }
    return next;
  });

  console.log('=== 历史字段修复 ===');
  console.log(`firstSeen 被推晚并修复 : ${fixedFirstSeen.length} 条`);
  fixedFirstSeen.slice(0, 5).forEach(x => console.log(`   · ${x}`));
  console.log(`sourceUrl 被置空并补回 : ${fixedSourceUrl.length} 条`);
  fixedSourceUrl.slice(0, 5).forEach(x => console.log(`   · ${x}`));

  // 不变量：除这两个字段外，逐字节不变
  const OTHER = Object.keys(store.deals[0]).filter(k => k !== 'firstSeen' && k !== 'sourceUrl');
  let otherChanges = 0;
  deals.forEach((deal, i) => {
    const before = store.deals[i];
    for (const key of OTHER) {
      if (JSON.stringify(before[key]) !== JSON.stringify(deal[key])) otherChanges++;
    }
  });
  console.log(`其他字段变化           : ${otherChanges}（必须为 0）`);

  const bad = deals.filter(d => !validateDeal(d).ok);
  console.log(`校验不通过             : ${bad.length}`);

  if (otherChanges || bad.length) {
    console.error('\n❌ 修复会动到别的字段或产出不合规数据 —— 拒绝写盘。');
    process.exit(1);
  }
  if (!fixedFirstSeen.length && !fixedSourceUrl.length) {
    console.log('\n无需修复（历史字段已经是对的）。');
    return;
  }
  if (DRY_RUN) {
    console.log('\n(dry-run，未写盘)');
    return;
  }

  assertAllValid(deals);
  const payload = writeDeals(deals, DEALS, new Date(), { preserveUpdatedAt: store.updatedAt });
  console.log(`\n✅ 已写入 ${path.relative(ROOT, DEALS)}：${payload.count} 条，updatedAt=${payload.updatedAt}（未变）`);
}

main();
