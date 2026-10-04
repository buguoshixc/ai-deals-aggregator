#!/usr/bin/env node
'use strict';
/**
 * t41 · 派生式判据的**现场读数**（只读）：
 *   ① providers.json 里每个 vendorKey === null 的身份逐条 → 有没有 no-vendor-identity 记录 / 有没有页 / 有没有登记
 *   ② 22 个有身份厂商页逐条 → 计划 route 与磁盘目录逐一对上
 *   ③ 反向：有身份且靠非优惠资料达标的身份里，有没有谁**没有**页
 * 产出：research/_raw/coverage-expansion-v1/t41-derived-r5-readings.json
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const WT = path.join(__dirname, '..', '..', '..');
const read = rel => JSON.parse(fs.readFileSync(path.join(WT, rel), 'utf8'));
const dist = path.join(WT, 'dist');

const landing = require(path.join(WT, 'scripts/lib/landing.js'));
const providers = require(path.join(WT, 'scripts/lib/providers.js'));
const feeds = require(path.join(WT, 'scripts/lib/feeds.js'));
const renderCore = require(path.join(WT, 'scripts/lib/render-core.js'));

const deals = read('deals.json').deals;
const plans = read('plans.json').plans;
const apiPlans = read('api-plans.json').plans;
const models = read('models.json').models;
const modelLinks = read('scripts/data/model-registry-links.json').links;
const vendorSlugs = read('scripts/data/vendor-slugs.json');
const table = providers.load().table;
const core = renderCore.load(path.join(WT, 'index.html'));

const plan = landing.planLandingPages({
  deals,
  vendorKeyOf: d => core.vendorOf(d).name,
  vendorSlugs: feeds.VENDOR_SLUGS,
  vendorThresholds: feeds.VENDOR_THRESHOLDS,
  eventCountOf: () => 0,
  // 与产品/自测同一组输入：少了这五项，厂商页只会按 deals 侧算出来（9 个），
  // 而 R5 要判的恰恰是「靠非优惠资料（Coding 套餐 / API 记录 / 模型归属）达标」的那一批。
  providerTable: table, plans, apiPlans, models, modelLinks,
});

const pages = plan.pages.filter(p => p.kind === 'vendor');
const slugOf = route => String(route || '').replace(/^vendor\//, '').replace(/\/$/, '');
const plannedSlugs = pages.map(p => slugOf(p.route)).sort();
const diskDirs = fs.readdirSync(path.join(dist, 'vendor'), { withFileTypes: true })
  .filter(e => e.isDirectory()).map(e => e.name).sort();

const nullIdentity = Object.entries(table).filter(([, e]) => e && !e.vendorKey).map(([, e]) => String(e.name));
const identityNames = Object.entries(table).filter(([, e]) => e && e.vendorKey).map(([, e]) => String(e.name));

const nullIdentityRows = nullIdentity.map(name => {
  const skips = plan.skipped.filter(r => r.reason === 'no-vendor-identity' && r.key === name);
  const page = pages.find(p => p.key === name);
  return {
    name,
    skipRows: skips.length,
    skipRoute: skips.length ? skips[0].route : null,
    hasPage: Boolean(page),
    pageRoute: page ? page.route : null,
    declaredInVendorSlugs: Object.prototype.hasOwnProperty.call(vendorSlugs, name),
    detail: skips.length ? String(skips[0].detail).slice(0, 160) : null,
  };
});

const pageRows = pages.map(p => ({
  name: p.key, slug: p.slug, route: p.route,
  diskDirPresent: diskDirs.includes(slugOf(p.route)),
  count: p.count, nonDealMaterial: Boolean(p.nonDealMaterial),
  codingPlans: p.material ? p.material.codingPlans : null,
  apiRecords: p.material ? p.material.apiRecords : null,
  models: p.material ? p.material.models : null,
}));

const out = {
  generatedAt: new Date().toISOString(),
  head: execFileSync('git', ['-C', WT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  judgement: '派生式：对 providers.json 里每个 vendorKey === null 的身份，逐条要求 (a) 恰好 1 条 no-vendor-identity 记录且不带路由 (b) 计划层无页 (c) vendor-slugs.json 无登记 (d) dist/vendor/ 目录集合 == 计划 slug 集合',
  counts: {
    providersTotal: Object.keys(table).length,
    nullIdentity: nullIdentity.length,
    identity: identityNames.length,
    vendorPages: pages.length,
    plannedSlugs: plannedSlugs.length,
    diskVendorDirs: diskDirs.length,
  },
  nullIdentityRows,
  pageRows,
  disk: {
    dirs: diskDirs, plannedSlugs,
    equal: JSON.stringify(diskDirs) === JSON.stringify(plannedSlugs),
    orphan: diskDirs.filter(d => !plannedSlugs.includes(d)),
    missing: plannedSlugs.filter(s => !diskDirs.includes(s)),
  },
  reverseDirection: {
    identityWithMaterialButNoPage: identityNames.filter(name => {
      const material = landing.vendorMaterialOf({ vendorName: name, providerTable: table, plans, apiPlans, models, modelLinks });
      return material.nonDeal && !pages.some(p => p.key === name);
    }),
  },
  sha256: {
    'scripts/data/providers.json': crypto.createHash('sha256').update(fs.readFileSync(path.join(WT, 'scripts/data/providers.json'))).digest('hex'),
    'scripts/data/vendor-slugs.json': crypto.createHash('sha256').update(fs.readFileSync(path.join(WT, 'scripts/data/vendor-slugs.json'))).digest('hex'),
    'dist/vendor 目录清单': crypto.createHash('sha256').update(diskDirs.join('\n')).digest('hex'),
  },
};
fs.writeFileSync(path.join(WT, 'research/_raw/coverage-expansion-v1/t41-derived-r5-readings.json'), JSON.stringify(out, null, 2) + '\n', 'utf8');

console.log('HEAD ' + out.head.slice(0, 7) + ' · providers ' + out.counts.providersTotal
  + ' · null 身份 ' + out.counts.nullIdentity + ' · 有身份 ' + out.counts.identity
  + ' · 厂商页 ' + out.counts.vendorPages + ' · 磁盘目录 ' + out.counts.diskVendorDirs);
console.log('\nnull 身份逐条（必须有 skip、无页、无登记）：');
nullIdentityRows.forEach(r => console.log('  ' + (r.skipRows === 1 && !r.hasPage && !r.declaredInVendorSlugs ? 'OK' : 'NG')
  + '  ' + r.name.padEnd(22) + ' skip=' + r.skipRows + ' route=' + JSON.stringify(r.skipRoute)
  + ' 有页=' + r.hasPage + ' 登记=' + r.declaredInVendorSlugs));
console.log('\n磁盘 vs 计划：相等=' + out.disk.equal + ' · 孤儿=' + JSON.stringify(out.disk.orphan) + ' · 缺目录=' + JSON.stringify(out.disk.missing));
console.log('反向（有身份+达标却无页）：' + JSON.stringify(out.reverseDirection.identityWithMaterialButNoPage));
console.log('厂商页 ' + pageRows.length + ' 条（磁盘目录齐全）：' + pageRows.filter(p => p.diskDirPresent).length + '/' + pageRows.length);
