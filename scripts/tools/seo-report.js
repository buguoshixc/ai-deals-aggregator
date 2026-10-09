#!/usr/bin/env node
/**
 * 落地页人读报告 —— `npm run report:seo`（v1.7，不进 CI 门禁）。
 *
 * 回答三个问题，都是构建日志里看不全的：
 *   ① 现在到底有哪些落地页，各收多少条，谁可索引、谁不在 sitemap；
 *   ② **哪些主题没有成页，以及为什么**（条数不足 / 已有专页 / 内部兜底枚举）；
 *   ③ 门槛、slug、别名、钉住表四个契约当前长什么样。
 *
 * 判据不重算：页面集合与条目归属都来自 `landing.planLandingPages()`（构建期同一个函数）。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const landing = require('../lib/landing');
// 站点常量（SITE_URL / VENDOR_SLUGS / VENDOR_THRESHOLDS）的唯一出处：t2 起从订阅层的
// `feeds.js` 改指本模块（订阅层整体下架，常量不能跟着陪葬）。本报告只用到 slug 表与门槛。
const site = require('../lib/site');
const history = require('../lib/history');
const audience = require('../lib/audience');

const payload = JSON.parse(fs.readFileSync(path.join(ROOT, 'deals.json'), 'utf8'));
// 分类归属与需求命中是**构建期派生字段**（源数据里没有）：报告自己算一遍，
// 否则按集合/需求切的页面会全部显示 0 条，并被判成「空入口」而跳过 ——
// 那正是第一版报告的样子（一个数错了东西的报告比没有报告更糟）。
for (const deal of payload.deals) {
  const collections = audience.collectionsOf(deal);
  const needs = audience.needsOf(deal);
  if (collections.length) deal.collections = collections; else delete deal.collections;
  if (needs.length) deal.needs = needs; else delete deal.needs;
}
const renderCore = require('../lib/render-core').load(path.join(ROOT, 'index.html'));
const vendorKeyOf = deal => renderCore.vendorOf(deal).name;
const store = history.load();
const vendorEventCount = (() => {
  const counts = new Map();
  const byId = new Map(payload.deals.map(deal => [deal.id, vendorKeyOf(deal)]));
  for (const event of history.eventsOf(store.store)) {
    const name = byId.get(event && event.id);
    if (name) counts.set(name, (counts.get(name) || 0) + 1);
  }
  return counts;
})();

const plan = landing.planLandingPages({
  deals: payload.deals,
  vendorKeyOf,
  vendorSlugs: site.VENDOR_SLUGS,
  vendorThresholds: site.VENDOR_THRESHOLDS,
  eventCountOf: name => vendorEventCount.get(name) || 0
});
const pinned = new Set(landing.loadPinned().map(row => row.route));
const aliases = landing.loadAliases();
const stats = landing.statsOf(plan.pages);
const asOf = String(payload.updatedAt || '').slice(0, 10);

const pad = (text, width) => String(text).padEnd(width, ' ');

console.log(`\n=== 落地页报告（数据更新 ${asOf}）===`);
console.log(`页面 ${stats.total} 个：可索引 ${stats.indexable} · noindex ${stats.noindex}` +
  `（${Object.entries(stats.byKind).map(([kind, n]) => `${kind} ${n}`).join(' · ')}）`);
console.log(`门槛：厂商 有效优惠 ≥ ${site.VENDOR_THRESHOLDS.minDeals} 条 或 历史事件 ≥ ${site.VENDOR_THRESHOLDS.minEvents} 条` +
  ` · 分类 有效优惠 ≥ ${landing.CATEGORY_MIN_DEALS} 条（且有人工文案）`);

console.log('\n--- 页面清单 ---');
console.log(`${pad('路由', 30)}${pad('类型', 12)}${pad('条数', 8)}${pad('索引', 10)}${pad('sitemap', 9)}钉住`);
for (const page of plan.pages) {
  const count = page.kind === 'hub' ? `${(page.children || []).length} 入口` : `${landing.itemsOf(page, payload.deals, { vendorKeyOf }).length} 条`;
  console.log(`${pad(page.route, 30)}${pad(page.kind, 12)}${pad(count, 8)}` +
    `${pad(page.indexable ? '是' : 'noindex', 10)}${pad(page.indexable ? '是' : '—', 9)}${pinned.has(page.route) ? '是' : ''}`);
}

console.log('\n--- 没有成页的主题与原因 ---');
const skipped = plan.skipped.slice().sort((a, b) => (a.kind.localeCompare(b.kind)) || (b.count - a.count));
for (const row of skipped) {
  console.log(`  ${pad(row.kind, 9)}${pad(row.key, 22)}${pad(`${row.count} 条`, 8)}${pad(row.reason, 24)}${row.detail || ''}`);
}
console.log(`  合计 ${skipped.length} 项。原因码：below-threshold（不够门槛）· already-covered（与既有页面同一批条目）` +
  ` · excluded-by-policy（人工排除，理由见上）· empty（空入口页不生成）`);

if (plan.problems.length) {
  console.log('\n--- 计划层问题（构建会直接失败）---');
  for (const line of plan.problems) console.log(`  ! ${line}`);
}

console.log('\n--- 别名（旧地址 → 目标页）---');
for (const [route, alias] of Object.entries(aliases)) {
  const page = plan.pages.find(item => item.route === route);
  console.log(`  ${pad(route, 22)}→ ${pad(alias.target, 18)}${page ? `${landing.itemsOf(page, payload.deals, { vendorKeyOf }).length} 条` : '（未生成）'}`);
}

console.log('\n--- 索引策略 ---');
// t6：两处事实陈述随本轮收口改掉 —— ① 索引清单里不再有「订阅中心」（`/feeds/` 已下架）；
// ② 「非页面资源」清单按**产物允许清单**重写（唯一注册表在 `lib/published-assets.js`）：
//    数据文件整族下架后，产物里的非 HTML 文件只剩下面这些 + 首页自己那份数据资源。
console.log('  可索引（进 sitemap）：首页 · 分类页 3 · 按需求页 7 · 分类落地页 ' + stats.byKind.category +
  ' · 厂商落地页 ' + stats.byKind.vendor + ' · 枢纽 ' + (stats.byKind.hub || 0) + ' · 详情页 · 状态页 · 变化雷达页');
console.log('  noindex（不进 sitemap）：' + Object.keys(aliases).join(' · '));
console.log('  非页面资源（从不进 sitemap）：.nojekyll · favicon.svg · logos.css · og-image.png · robots.txt · sitemap.xml · logos/** · assets/data/offers.json');

console.log('\n--- slug 契约 ---');
console.log(`  厂商 slug（${Object.keys(site.VENDOR_SLUGS).length} 条，键是规范显示名）：`);
for (const [name, slug] of Object.entries(site.VENDOR_SLUGS)) {
  const count = payload.deals.filter(deal => deal.type === 'deal' && vendorKeyOf(deal) === name).length;
  console.log(`    ${pad(name, 22)}${pad(slug, 20)}${count} 条`);
}
console.log(`  分类 slug（${Object.keys(landing.loadCategorySlugs()).length} 条）：` +
  Object.entries(landing.loadCategorySlugs()).map(([c, s]) => `${c}→${s}`).join(' · '));

console.log('\n--- 钉住的页面（跌破门槛也不消失）---');
for (const row of landing.loadPinned()) console.log(`  ${pad(row.route, 26)}${pad(row.kind, 10)}${row.since}`);

console.log(`\n--- 摘要数字口径（全部现算，seo 门禁会独立重算一遍）---`);
console.log('  当前条目 / 无需信用卡 / 确认中国大陆可申请 / 含免费 API / 含免费模型 / 最近 7 天新增 / 覆盖来源 / 覆盖分类');
console.log('  值为 0 的项不渲染（缺值不占位）；「最近 7 天」以数据更新日为基准。\n');
