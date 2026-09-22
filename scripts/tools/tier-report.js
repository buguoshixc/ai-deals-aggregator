#!/usr/bin/env node
/**
 * 优惠力度分档 / 厂商归一 报告。
 *
 * 分档规则全部写在 index.html 的 RENDER-CORE 里（纯函数），这个工具把它跑一遍并把
 * 每条卡片的「档位 + 命中的判据 + 判据看到的原文」逐条列出来——
 * 想调规则时先看这份报告，不用去猜。
 *
 * 用法：
 *   node scripts/tools/tier-report.js              # 默认视图（优惠 Tab、未过期）
 *   node scripts/tools/tier-report.js --all        # 全量（含工具条目）
 *   node scripts/tools/tier-report.js --vendor     # 厂商归一并计
 *   node scripts/tools/tier-report.js --tier=2     # 只看某一档
 */

const fs = require('fs');
const path = require('path');
const { load, ROOT } = require('../lib/render-core');

const args = process.argv.slice(2);
const flag = name => args.includes('--' + name);
const value = name => {
  const hit = args.find(a => a.startsWith('--' + name + '='));
  return hit ? hit.slice(name.length + 3) : null;
};

const core = load();
const payload = JSON.parse(fs.readFileSync(path.join(ROOT, 'deals.json'), 'utf8'));
const deals = payload.deals;

const all = flag('all');
const filters = core.defaultFilters();
if (all) filters.tab = 'tools';

const cards = core.cardsFor ? core.cardsFor(deals, filters) : core.defaultCards(deals);
const only = value('tier') ? Number(value('tier')) : null;

const TIER_NAMES = { 1: '① 完全免费', 2: '② 免费额度', 3: '③ 身份优惠', 4: '④ 折扣促销', 5: '⑤ 付费为主' };

if (flag('vendor')) {
  const tally = new Map();
  for (const deal of deals) {
    const vendor = core.vendorOf(deal);
    const key = vendor.key || '(未识别)';
    if (!tally.has(key)) tally.set(key, { name: vendor.name || '(未识别)', logo: vendor.logo, count: 0, raw: new Set() });
    const row = tally.get(key);
    row.count++;
    row.raw.add(deal.vendor);
  }
  const rows = [...tally.entries()].sort((a, b) => b[1].count - a[1].count);
  console.log('=== 厂商归一（共 ' + rows.length + ' 家）===');
  console.log('  条数  厂商            官方图形      名称缩写   原始 vendor 字符串');
  for (const [key, row] of rows) {
    const mark = row.logo ? '' : core.textMarkOf(row.name);
    console.log('  ' + String(row.count).padStart(4) + '  ' + row.name.padEnd(15) +
      '  ' + String(row.logo || '—').padEnd(12) + '  ' + String(mark || '—').padEnd(8) + ' ' + [...row.raw].join(' / '));
  }
  const withLogo = rows.filter(r => r[1].logo).length;
  console.log('\n官方品牌图形: ' + withLogo + ' 家 / 名称缩写兜底: ' + (rows.length - withLogo) + ' 家 / 共 ' + rows.length + ' 家');
  process.exit(0);
}

const dist = new Map();
for (const card of cards) dist.set(card.tier, (dist.get(card.tier) || 0) + 1);

console.log('=== 分档分布（' + (all ? '全量' : '默认视图') + '，' + cards.length + ' 张卡片）===');
for (const n of [1, 2, 3, 4, 5]) {
  const count = dist.get(n) || 0;
  const bar = '█'.repeat(Math.round(count / Math.max(1, cards.length) * 40));
  console.log('  ' + TIER_NAMES[n] + '  ' + String(count).padStart(3) + '  ' + bar);
}

const byRule = new Map();
for (const card of cards) {
  const tier = core.tierOf(card);
  byRule.set(tier.rule, (byRule.get(tier.rule) || 0) + 1);
}
console.log('\n判据命中次数: ' + [...byRule.entries()].map(([rule, n]) => rule + '=' + n).join('  '));

console.log('\n=== 逐条明细 ===');
const rows = cards.filter(card => !only || card.tier === only);
for (const card of rows) {
  const tier = core.tierOf(card);
  const vendor = core.vendorOf(card);
  // 判据实际读到的原文，逐条打印，方便判断规则有没有误判
  const seen = [card.eligibility, card.discountInfo].filter(Boolean).join(' | ').slice(0, 70);
  console.log('\n[' + tier.n + ' ' + tier.name + ' · ' + tier.rule + '] ' + card.title);
  console.log('    厂商 ' + (vendor.name || '—') + '（' + (vendor.key || '未识别') + '）' +
    ' · logo ' + (vendor.logo || '—') + ' · 定价 ' + (card.pricingModel || '未标注') +
    (card.models ? ' · 折叠 ' + card.models.length + ' 个模型' : ''));
  console.log('    判据读到的原文: ' + (seen || '(空)'));
}
console.log('\n共 ' + rows.length + ' 条。');
