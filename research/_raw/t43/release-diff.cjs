#!/usr/bin/env node
/**
 * t43 —— 发布说明要用的**现场对照**：线上（旧版，只读抓取）vs 本地构建产物（新版，只读读取）。
 *
 * 只比可机器数的信号：
 *   · `sitemap.xml` 的路由集合差（新增 / 消失的路由逐条列出）
 *   · 首页卡片数（`article.g`）、/models/ 行数、/plans/coding/ 与 /plans/api/ 的 `data-item` 行数
 *   · `/models/` 的三件新事实（data-model / models-show-legacy / data-release-date）
 *
 * 只读：线上 GET，本地读文件；只写本目录的 release-diff.json。
 * 用法：node research/_raw/t43/release-diff.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const BASE = 'https://buguoshixc.github.io/ai-deals-aggregator/';

const count = (text, needle) => text.split(needle).length - 1;
const locsOf = text => [...text.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
const rel = url => url.replace(BASE, '');

async function live(route) {
  const response = await fetch(`${BASE}${route}`, { cache: 'no-store', signal: AbortSignal.timeout(30000) });
  return response.text();
}
const local = route => fs.readFileSync(path.join(ROOT, 'dist', route), 'utf8');

(async () => {
  const out = { measuredAt: new Date().toISOString(), base: BASE, routes: {} };

  const liveSitemap = await live('sitemap.xml');
  const localSitemap = local('sitemap.xml');
  const liveSet = new Set(locsOf(liveSitemap).map(rel));
  const localSet = new Set(locsOf(localSitemap).map(rel));
  out.routes['sitemap.xml'] = {
    liveLocCount: liveSet.size,
    localLocCount: localSet.size,
    addedRoutes: [...localSet].filter(route => !liveSet.has(route)).sort(),
    removedRoutes: [...liveSet].filter(route => !localSet.has(route)).sort()
  };

  const homepageLive = await live('');
  const homepageLocal = local('index.html');
  out.routes['/'] = {
    liveCards: count(homepageLive, 'article class="g"'),
    localCards: count(homepageLocal, 'article class="g"'),
    liveBytes: Buffer.byteLength(homepageLive, 'utf8'),
    localBytes: Buffer.byteLength(homepageLocal, 'utf8')
  };

  for (const route of ['models/', 'plans/coding/', 'plans/api/', 'feeds/']) {
    const liveHtml = await live(route);
    const localHtml = local(path.posix.join(route, 'index.html'));
    out.routes[`/${route}`] = {
      liveDataItem: count(liveHtml, 'data-item='),
      localDataItem: count(localHtml, 'data-item='),
      liveDataModel: count(liveHtml, 'data-model='),
      localDataModel: count(localHtml, 'data-model='),
      liveShowLegacy: count(liveHtml, 'models-show-legacy'),
      localShowLegacy: count(localHtml, 'models-show-legacy'),
      liveBytes: Buffer.byteLength(liveHtml, 'utf8'),
      localBytes: Buffer.byteLength(localHtml, 'utf8')
    };
  }

  const detailRoute = 'models/deepseek-v3.2/';
  const liveDetail = await live(detailRoute);
  const localDetail = local(path.posix.join(detailRoute, 'index.html'));
  out.routes[`/${detailRoute}`] = {
    liveReleaseDateMarker: count(liveDetail, 'data-release-date='),
    localReleaseDateMarker: count(localDetail, 'data-release-date='),
    liveBytes: Buffer.byteLength(liveDetail, 'utf8'),
    localBytes: Buffer.byteLength(localDetail, 'utf8')
  };

  // 本地产物里的厂商页清单（新版）
  const vendorDirs = fs.readdirSync(path.join(ROOT, 'dist/vendor'), { withFileTypes: true })
    .filter(item => item.isDirectory()).map(item => item.name).sort();
  out.vendorPagesLocal = { count: vendorDirs.length, slugs: vendorDirs };
  out.vendorPagesLive = [...liveSet].filter(route => /^vendor\/[^/]+\/$/.test(route)).sort();

  fs.writeFileSync(path.join(__dirname, 'release-diff.json'), `${JSON.stringify(out, null, 2)}\n`, 'utf8');

  console.log('=== 线上（旧版）vs 本地构建（新版）===');
  for (const [route, row] of Object.entries(out.routes)) {
    console.log(`\n  ${route}`);
    for (const [key, value] of Object.entries(row)) {
      if (Array.isArray(value)) console.log(`    ${key}: ${value.length} 条${value.length ? ` —— ${value.slice(0, 8).join(' · ')}${value.length > 8 ? ' …' : ''}` : ''}`);
      else console.log(`    ${key}: ${value}`);
    }
  }
  console.log(`\n  厂商页：线上 ${out.vendorPagesLive.length} 个 · 本地 ${out.vendorPagesLocal.count} 个`);
  console.log(`  新增厂商页：${out.vendorPagesLocal.slugs.filter(slug => !out.vendorPagesLive.includes(`vendor/${slug}/`)).join(' · ') || '（无）'}`);
})().catch(error => {
  console.error(`⛔ 对照失败：${String((error && error.message) || error)}`);
  process.exit(2);
});
