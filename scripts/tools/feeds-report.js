#!/usr/bin/env node
/**
 * v1.6 订阅层人读报告（**不进 CI**）。
 *
 * 与 `build-local.js` 用同一套判据与同一份注册表，但输出是给人看的：
 * 每个 Feed 收了什么、多少条、第一条是什么、为什么某一个 Feed 是空的。
 * 排查「订阅里怎么少了/多了某条」时先看这里，比翻 36 个文件快。
 *
 * 用法：node scripts/tools/feeds-report.js [--full]
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const feeds = require('../lib/feeds');
const changes = require('../lib/changes');
const history = require('../lib/history');

const full = process.argv.includes('--full');
const payload = JSON.parse(fs.readFileSync(path.join(ROOT, 'deals.json'), 'utf8'));
const store = history.load();
const asOf = String(payload.updatedAt).slice(0, 10);
const radar = changes.buildRadar({
  deals: payload.deals, store: store.store, asOf,
  availability: store.missing || store.broken ? 'unavailable' : 'ok'
});
const bundle = feeds.buildFeeds({
  deals: payload.deals, store: store.store, radar, asOf,
  updatedAt: payload.updatedAt,
  availability: store.missing || store.broken ? 'unavailable' : 'ok'
});
const stats = feeds.summarize(bundle.feeds);

console.log(`\n=== v1.6 订阅层报告 ===`);
console.log(`基准日 ${asOf} · 记录 ${payload.deals.length} 条（优惠 ${payload.deals.filter(d => d.type === 'deal').length} / 工具 ${payload.deals.filter(d => d.type !== 'deal').length}）`);
console.log(`Feed ${stats.count} 个 × 2 种格式 = ${stats.files} 个文件 · 条目合计 ${stats.items} 条`);
console.log(`厂商门槛：当前有效优惠 ≥ ${feeds.VENDOR_THRESHOLDS.minDeals} 条，或历史变更事件 ≥ ${feeds.VENDOR_THRESHOLDS.minEvents} 条`);
if (bundle.vendorUnmapped.length) console.log(`未映射 slug 的厂商：${bundle.vendorUnmapped.join('、')}`);
if (bundle.vendorSkipped.length) console.log(`够门槛但当前 0 条、未生成的厂商：${bundle.vendorSkipped.map(r => r.vendor).join('、')}`);

for (const kind of ['collection', 'changes']) {
  const rows = bundle.feeds.filter(feed => feed.spec.kind === kind);
  if (!rows.length) continue;
  console.log(`\n—— ${kind === 'collection' ? '优惠 Feed（当前有哪些符合这个条件的优惠）' : '变化 Feed（最近发生了什么）'} ——`);
  for (const feed of rows) {
    const head = `${feed.spec.id.padEnd(18)} ${String(feed.items.length).padStart(4)} 条  ${feed.spec.path}`;
    console.log(head);
    console.log(`   标题：${feed.spec.title}`);
    if (feed.items.length) {
      const first = feed.items[0];
      const last = feed.items[feed.items.length - 1];
      console.log(`   时间：最新 ${first.dateModified || first.datePublished} · 最早 ${last.dateModified || last.datePublished}`);
      console.log(`   首条：${first.title}`);
      if (full) {
        for (const item of feed.items) console.log(`     · ${item.datePublished} ${item.id} ${item.title}`);
      }
    } else {
      console.log(`   空：${feed.description.split('。').slice(-2).join('。')}`);
    }
  }
}

console.log('\n—— 提示 ——');
console.log('· 变化 Feed 为空是**事实**（变更记录自 ' + (store.store.startedAt || '未知') + ' 起算），不是故障。');
console.log('· 变化 Feed 只收高价值事件：文案微调与记录元信息永远不会进订阅。');
console.log('· 带宽限：单份 Feed 最多 ' + feeds.LIMITS.itemsPerFeed + ' 条；超出只计数并写进 description，不删数据。');
