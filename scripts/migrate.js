#!/usr/bin/env node
/**
 * 一次性迁移：把 v1（裸数组、discount 语义混装）的 deals.json 迁移为 v2。
 *
 * 用法：
 *   node scripts/migrate.js            # 写盘
 *   node scripts/migrate.js --dry-run  # 只打印结果，不写盘
 */

const fs = require('fs');
const path = require('path');
const { makeDeal, isGarbage, hasDiscountSignal, cleanText } = require('./lib/schema');
const { inferRegion, extractExpiry } = require('./lib/classify');
const { loadStore, writeDeals, mergeAll, assertAllValid, DEALS_FILE } = require('./lib/store');
const { loadCurated } = require('./lib/curated');

const DRY_RUN = process.argv.includes('--dry-run');

/** 整源丢弃：这些来源在核查中确认产出全是垃圾/零产出 */
const DROP_SOURCES = new Set(['Zapier', 'BitDegree', 'AitoolsDirectory']);

function migrate() {
  const store = loadStore();
  const dropped = { garbage: [], unknownSource: [], invalid: [] };
  const fresh = [];

  for (const raw of store.deals) {
    if (DROP_SOURCES.has(raw.source)) {
      dropped.garbage.push({ title: raw.title, reason: `整源丢弃（${raw.source}）` });
      continue;
    }

    const region = inferRegion(raw.source);
    const discountText = cleanText(raw.discount, 240);
    const expiry = extractExpiry(`${discountText} ${raw.description || ''}`);

    const deal = makeDeal(
      {
        ...raw,
        region,
        expiresAt: raw.expiresAt || raw.endDate || raw.expiry || expiry,
        date: raw.date || raw.firstSeen
      },
      { source: raw.source, region }
    );

    if (!deal) {
      const reason = isGarbage(raw.title) || !cleanText(raw.title)
        ? '标题为垃圾/空'
        : '缺少可用 URL';
      dropped.garbage.push({ title: raw.title, reason });
      continue;
    }

    if (deal.type === 'deal' && !hasDiscountSignal(deal.discountInfo || '')) {
      deal.type = 'tool';
    }
    fresh.push(deal);
  }

  const curated = loadCurated().deals;

  const { deals, stats } = mergeAll({ fresh, existing: [], curated });
  assertAllValid(deals);

  console.log('=== 迁移报告 ===');
  console.log(`原始条数      : ${store.deals.length}`);
  console.log(`整源/垃圾丢弃 : ${dropped.garbage.length}`);
  dropped.garbage.forEach(d => console.log(`   - [${d.reason}] ${d.title}`));
  console.log(`策展数据      : ${curated.length}`);
  console.log(`去重合并      : ${stats.mergedDuplicates}`);
  console.log(`过期修剪      : ${stats.removedExpired}`);
  console.log(`最终条数      : ${deals.length}`);
  console.log(`  其中优惠    : ${deals.filter(d => d.type === 'deal').length}`);
  console.log(`  国内        : ${deals.filter(d => d.region === 'cn').length}`);
  console.log(`  含截止时间  : ${deals.filter(d => d.expiresAt).length}`);
  console.log(`  分类分布    : ${Object.entries(
    deals.reduce((acc, d) => ({ ...acc, [d.category]: (acc[d.category] || 0) + 1 }), {})
  ).map(([k, v]) => `${k}:${v}`).join(' ')}`);

  if (DRY_RUN) {
    console.log('\n(dry-run，未写盘)');
    return;
  }

  writeDeals(deals);
  console.log(`\n✅ 已写入 ${path.relative(process.cwd(), DEALS_FILE)}`);
}

migrate();
