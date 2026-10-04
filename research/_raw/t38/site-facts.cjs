#!/usr/bin/env node
/**
 * t38 预映射的第二台只读盘点器：专查"页面 / 目录 / 站点产物"侧的事实
 * （这些是 §87 里最容易被"应该有"糊过去的地方）。
 *
 * 只读；用法：node research/_raw/t38/site-facts.cjs
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = rel => fs.existsSync(path.join(ROOT, rel));

const published = JSON.parse(read('models.json'));
const slugs = published.models.map(model => model.slug);
const byCatalog = {};
published.models.forEach(model => { byCatalog[model.catalogStatus] = (byCatalog[model.catalogStatus] || 0) + 1; });

/* ---- 1. /models/ 静态页：No-JS 是否有全部行 + 默认隐藏集合 ---- */
let indexHtml = '';
if (exists('dist/models/index.html')) indexHtml = read('dist/models/index.html');
const rowsInStatic = (indexHtml.match(/<tr\b/g) || []).length;
const hiddenDefaults = (indexHtml.match(/legacy|historical/g) || []).length;
console.log('── /models/ 静态产物');
console.log(`   dist/models/index.html 存在: ${exists('dist/models/index.html')} · 静态 <tr> 数: ${rowsInStatic}（registry 模型 ${published.models.length}）`);
console.log(`   页面出现 legacy/historical 字样次数: ${hiddenDefaults}（默认隐藏集合必须能被看到）`);

/* ---- 2. sitemap：detail route 是否保留（含 legacy） ---- */
let sitemap = '';
if (exists('dist/sitemap.xml')) sitemap = read('dist/sitemap.xml');
const sitemapModels = [...sitemap.matchAll(/\/models\/([a-z0-9.-]+)\//g)].map(match => match[1]);
const uniqueSitemapModels = [...new Set(sitemapModels)];
const missingInSitemap = slugs.filter(slug => !uniqueSitemapModels.includes(slug));
console.log('\n── sitemap');
console.log(`   dist/sitemap.xml 存在: ${exists('dist/sitemap.xml')} · 总 <loc> 数: ${(sitemap.match(/<loc>/g) || []).length}`);
console.log(`   /models/<slug>/ 去重后: ${uniqueSitemapModels.length} · registry 44 个 slug 里缺: ${missingInSitemap.length ? missingInSitemap.join(', ') : '（无）'}`);

/* ---- 3. legacy / unknown 的详情页在不在 ---- */
const detailChecks = ['legacy', 'unknown', 'current'].map(status => {
  const model = published.models.find(item => item.catalogStatus === status);
  if (!model) return `${status}: （registry 里没有这一档的模型）`;
  const dir = path.join(ROOT, 'dist', 'models', model.slug);
  const file = path.join(dir, 'index.html');
  const inPage = fs.existsSync(file) ? read(path.join('dist', 'models', model.slug, 'index.html')) : '';
  return `${status}: ${model.slug} → 详情页 ${fs.existsSync(file) ? '存在' : '缺失'}${inPage ? `（${inPage.length} 字节）` : ''}`;
});
console.log('\n── 每档抽一个模型的详情页');
detailChecks.forEach(line => console.log(`   ${line}`));

/* ---- 4. API Pricing 是否与 catalogStatus 解耦（页面/产物里有没有按目录状态过滤价格） ---- */
const apiPlans = JSON.parse(read('api-plans.json'));
const apiRecords = apiPlans.plans.length;
let apiPages = 0;
const apiDir = path.join(ROOT, 'dist', 'plans', 'api');
if (fs.existsSync(apiDir)) {
  const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
    if (entry.isDirectory()) walk(path.join(dir, entry.name));
    else if (entry.name.endsWith('.html')) apiPages += 1;
  });
  walk(apiDir);
}
console.log('\n── API Pricing 与目录状态解耦');
console.log(`   api-plans 记录 ${apiRecords} 条 · dist/plans/api 下 HTML ${apiPages} 个（价格真值不随 catalogStatus 变化）`);

/* ---- 5. 目录状态词表与"默认展示/默认隐藏"（单一策略模块导出） ---- */
const freshness = require(path.join(ROOT, 'scripts', 'lib', 'model-freshness.js'));
console.log('\n── Freshness 单一策略（lib/model-freshness.js）');
console.log(`   CATALOG_STATUSES           : ${JSON.stringify(freshness.CATALOG_STATUSES)}`);
console.log(`   DEFAULT_VISIBLE            : ${JSON.stringify(freshness.DEFAULT_VISIBLE_CATALOG_STATUSES)}`);
console.log(`   DEFAULT_HIDDEN             : ${JSON.stringify(freshness.DEFAULT_HIDDEN_CATALOG_STATUSES)}`);
console.log(`   MODEL_FRESHNESS_POLICY 指纹 : ${typeof freshness.policyDigestOf === 'function' ? freshness.policyDigestOf(freshness.MODEL_FRESHNESS_POLICY) : '(无 policyDigestOf)'}`);
console.log(`   发布产物 catalogStatus 分布 : ${JSON.stringify(byCatalog)}`);

/* ---- 6. 墙上时钟 / 版本号判新旧（静态证据：策略模块里不许有 Date.now / 版本号解析） ---- */
const freshnessSource = read('scripts/lib/model-freshness.js');
console.log('\n── "不读墙上时钟" / "不用版本号判新旧" 的静态证据');
console.log(`   model-freshness.js 里 Date.now/new Date 出现次数: ${(freshnessSource.match(/Date\.now|new Date\(/g) || []).length}`);
console.log(`   model-freshness.js 里 \`today\` 形参出现次数: ${(freshnessSource.match(/\btoday\b/g) || []).length}（判定只吃调用方传进来的日期）`);

/* ---- 7. Analytics：本地零请求（自测里的断言原话） ---- */
const analyticsSelftest = read('scripts/tools/analytics-selftest.js');
const zeroAssert = analyticsSelftest.split('\n').filter(line => /零请求|0 次外发|local|不发网络|no-network/i.test(line)).map(line => line.trim()).slice(0, 4);
console.log('\n── Analytics 本地零请求（自测里的断言原话）');
zeroAssert.forEach(line => console.log(`   ${line.slice(0, 140)}`));
