#!/usr/bin/env node
/**
 * SEO 独立验收门禁（v1.7）—— `npm run verify:seo`。
 *
 * ## 它与构建期那一遍的区别（这才是它存在的理由）
 *
 * 构建期的 `seo.validate()` 拿到的描述符里，条目集合、索引策略、sitemap 清单都是
 * **构建过程自己记下来的**。那样能抓住「写坏了」，但抓不住「一开始就算错了」——
 * 两份数据同源时，一个错误的判据会在两边一致地错下去。
 *
 * 这个工具**只读 dist/**：页面 HTML、sitemap.xml、deals.json、目录结构。
 * 条目集合、可索引性、Feed 清单、sitemap 成员全部**从产物现场重新推导**：
 *
 *   · 可索引性 ← 页面自己的 `<meta name="robots">`（不读任何注册表）；
 *   · 条目集合 ← `dist/deals.json` + 厂商归一 + 页面类型判据，重新算一遍，
 *     再与页面上的 `data-item` 标记**逐个 id 对账**；
 *   · sitemap 成员 ← 解析 sitemap.xml，与「非 noindex 的页面集合」比；
 *   · Feed 清单 ← 磁盘上真实存在的 feed 文件（不读 feeds.js 的注册表）。
 *
 * 规则本身仍调用 `lib/seo.js`（规则只有一份），但**输入完全不同源**。
 *
 * 用法：`node scripts/tools/seo-verify.js [--dir=dist]`
 * 退出码：0 全过 / 1 有问题。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const seo = require('../lib/seo');
const landing = require('../lib/landing');
const feeds = require('../lib/feeds');

const dirArg = process.argv.find(a => a.startsWith('--dir='));
const OUT = path.resolve(ROOT, dirArg ? dirArg.slice(6) : 'dist');

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${!ok && detail ? ` —— ${detail}` : ''}`);
}

/* ------------------------------------------------------------------ */
/* 自己的解析（刻意不复用 seo.js 的解析器：两边独立，才能互相证伪）        */
/* ------------------------------------------------------------------ */

const strip = html => String(html).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');

function firstMatch(text, re) {
  const m = String(text).match(re);
  return m ? m[1] : '';
}

function unescapeHtml(text) {
  return String(text).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}

function listPages() {
  const out = [];
  const walk = (dir, base) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = base ? `${base}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path.join(dir, entry.name), rel);
      else if (entry.name === 'index.html') {
        // 目录 URL 一律**带尾斜杠**（首页是空串）—— 与 canonical / sitemap / 站内链接同一口径。
        // 第一版漏了这一步，于是 112 个页面的 canonical 自指检查全部误报。
        const bare = rel.replace(/\/?index\.html$/, '');
        out.push(bare === '' ? '' : `${bare}/`);
      }
    }
  };
  walk(OUT, '');
  return out.sort();
}

function listFiles() {
  const out = new Set();
  const walk = (dir, base) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = base ? `${base}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path.join(dir, entry.name), rel);
      else if (entry.name !== 'index.html') out.add(rel);
    }
  };
  walk(OUT, '');
  return out;
}

function itemListOf(html) {
  for (const m of strip(html).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      const data = JSON.parse(m[1]);
      if (data['@type'] === 'ItemList') return data;
    } catch (error) { /* 解析失败在下面按「没有 ItemList」处理 */ }
  }
  return null;
}

/** 页面上的数据行（`data-item` / `data-child`）——自己的正则，不看构建期记了什么 */
const rowsOf = html => ({
  items: [...strip(html).matchAll(/data-item="([^"]*)"/g)].map(m => unescapeHtml(m[1])),
  children: [...strip(html).matchAll(/data-child="([^"]*)"/g)].map(m => unescapeHtml(m[1]))
});

/* ------------------------------------------------------------------ */
/* 从产物重新推导                                                     */
/* ------------------------------------------------------------------ */

if (!fs.existsSync(path.join(OUT, 'index.html'))) {
  console.error(`❌ 找不到 ${path.relative(ROOT, OUT)}/index.html —— 先跑 npm run build`);
  process.exit(1);
}

const renderCore = require('../lib/render-core').load(path.join(ROOT, 'index.html'));
const vendorKeyOf = deal => renderCore.vendorOf(deal).name;
const payload = JSON.parse(fs.readFileSync(path.join(OUT, 'deals.json'), 'utf8'));
const deals = payload.deals;
const dealsById = new Map(deals.map(deal => [deal.id, deal]));
const asOf = String(payload.updatedAt || '').slice(0, 10);

// 计划**从数据重新算一遍**（不读构建期的 PLAN）
const plan = landing.planLandingPages({
  deals,
  vendorKeyOf,
  vendorSlugs: feeds.VENDOR_SLUGS,
  thresholds: undefined,
  vendorThresholds: feeds.VENDOR_THRESHOLDS,
  eventCountOf: () => 0,
  pinned: landing.loadPinned(),
  aliases: landing.loadAliases()
});
const specByRoute = new Map(plan.pages.map(spec => [spec.route, spec]));

const routes = listPages();
const files = listFiles();
const sitemapXml = fs.readFileSync(path.join(OUT, 'sitemap.xml'), 'utf8');
const sitemap = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
const feedFiles = [...files].filter(rel => /^feed.*\.(xml|json)$/.test(rel));
const feedSpecs = feedFiles.map(rel => ({ id: rel, path: rel, jsonPath: rel, title: '' }));

console.log(`\n=== SEO 独立验收（${path.relative(ROOT, OUT)}/ · ${routes.length} 个页面 · ${files.size} 个静态文件）===`);

/* ------------------------------------------------------------------ */
/* ① 页面集合与计划对账（独立重算的门槛）                                */
/* ------------------------------------------------------------------ */

const plannedRoutes = [...specByRoute.keys()];
const missingPages = plannedRoutes.filter(route => !routes.includes(route));
check('计划里的每个落地页都在磁盘上（门槛层没谎报）', missingPages.length === 0, missingPages.slice(0, 5).join(', '));

const pinned = landing.loadPinned();
const missingPinned = pinned.map(row => row.route).filter(route => !routes.includes(route));
check(`钉住的 ${pinned.length} 条路由全部存在（收录过的 URL 不会静默消失）`, missingPinned.length === 0, missingPinned.join(', '));

const aliases = landing.loadAliases();
const aliasMissing = Object.keys(aliases).filter(route => !routes.includes(route));
check('别名表登记的旧路由都有对应页面', aliasMissing.length === 0, aliasMissing.join(', '));

/* ------------------------------------------------------------------ */
/* ② 逐页：条目集合与页面数据行对账（本工具最硬的一条）                   */
/* ------------------------------------------------------------------ */

const descriptors = [];
const rowMismatches = [];
const flat = m => String(m).split('/').filter(s => s && s !== '.').join('/');

/**
 * 固定静态路由 → 页面类型。
 *
 * `kind` 在这一层决定两件事：**ItemList 是否必须在场**、以及**可见正文下限**（`textFloor`）。
 * 单层路由（`status/` `changes/` `feeds/`）可以由路由字符串直接推出来，但
 * `/plans/coding/` 是两级，推出来会变成 `plans/coding` —— 那既不是任何一条 textFloor 分支，
 * 也让 ItemList 的判定落在默认值上。**显式登记**比"碰巧能用"可靠。
 */
const FIXED_KINDS = { 'status/': 'status', 'changes/': 'changes', 'feeds/': 'feeds', 'plans/coding/': 'plans', 'plans/api/': 'plans' };

for (const route of routes) {
  const rel = route === '' ? 'index.html' : `${route}/index.html`;
  const html = fs.readFileSync(path.join(OUT, rel), 'utf8');
  const spec = specByRoute.get(route);
  const crumbless = route;
  const robots = firstMatch(strip(html), /<meta[^>]+name="robots"[^>]+content="([^"]*)"/i).toLowerCase();
  const indexable = !/noindex/.test(robots);
  const rows = rowsOf(html);

  let itemIds = [];
  let childRoutes = [];
  let kind = route === '' ? 'home'
    : (route.startsWith('deal/') ? 'deal' : (FIXED_KINDS[route] || route.replace(/\/$/, '')));

  if (spec) {
    kind = spec.kind;
    if (spec.kind === 'hub') {
      childRoutes = (spec.children || []).map(child => child.route);
      const onPage = rows.children.map(flat);
      const expected = childRoutes.map(flat);
      if (JSON.stringify(onPage.slice().sort()) !== JSON.stringify(expected.slice().sort())) {
        rowMismatches.push(`${route} 子页行 ${onPage.length} 条 ≠ 计划 ${expected.length} 条`);
      }
    } else {
      itemIds = landing.itemsOf(spec, deals, { vendorKeyOf }).map(deal => deal.id);
      const onPage = rows.items.slice().sort();
      const expected = itemIds.slice().sort();
      if (JSON.stringify(onPage) !== JSON.stringify(expected)) {
        rowMismatches.push(`${route} 行 ${onPage.length} 条 ≠ 按数据重算的 ${expected.length} 条`);
      }
    }
  } else if (route.startsWith('deal/')) {
    itemIds = [decodeURIComponent(route.split('/')[1])];
  }
  void crumbless;

  descriptors.push({
    route,
    html,
    kind,
    indexable,
    inSitemap: undefined, // 由 sitemap-policy 断言（下面按 sitemap 现场算）
    itemIds,
    childRoutes,
    summary: [], // 摘要数字由 seo.validate 按 data-summary-* 标记独立重算（这里不给「答案」）
    count: spec ? (spec.kind === 'hub' ? childRoutes.length : itemIds.length)
      : (kind === 'plans' ? rows.items.length : itemIds.length),
    pinned: Boolean(spec && spec.pinned),
    expectItemList: !['deal', 'status', 'feeds'].includes(kind),
    checkItemListRows: kind !== 'home',
    // 首页与套餐页的 ItemList 都指向**厂商官方页**（本站的既定口径：主链接给到官方），
    // 因此「ItemList 里的 url 必须是本页的站内条目」这条判据对它们不适用 ——
    // 关掉的是**成员归属**，不是 ItemList 本身：在场性、声明数 == 元素数、以及
    // 声明数 == 页面数据行数三条都照常查。
    checkItemListMembers: kind !== 'home' && kind !== 'plans',
    feedMatch: []
  });
}
check('每个落地页的可见数据行 == 按 dist/deals.json 重新算出的条目集合',
  rowMismatches.length === 0, rowMismatches.slice(0, 4).join('；'));

/* ------------------------------------------------------------------ */
/* ③ 规则层（与构建期同一份规则，输入完全不同源）                        */
/* ------------------------------------------------------------------ */

const sitemapSet = new Set(sitemap.map(url => url.slice(feeds.SITE_URL.length)));
for (const page of descriptors) page.inSitemap = sitemapSet.has(page.route);

const verdict = seo.validate(descriptors, {
  siteUrl: feeds.SITE_URL,
  sitemap,
  pinned: pinned.map(row => row.route),
  aliases,
  thresholds: { categoryMinDeals: landing.CATEGORY_MIN_DEALS, vendorMinDeals: feeds.VENDOR_THRESHOLDS.minDeals },
  dealsById,
  asOf,
  vendorKeyOf,
  feedSpecs,
  staticFiles: files,
  // 门槛层不在这里重跑（它需要「谁被跳过了」这份构建期信息）；
  // 这里独立验的是它的**结果**：计划里的页面都在、钉住的页面都在、行数对得上（见 ②）。
  gate: null
});

const byCode = seo.summarize(verdict).byCode;
check(`规则层 ${seo.PROBLEM_CODES.length} 个检查码全过`, verdict.problems.length === 0,
  verdict.problems.slice(0, 5).map(p => `[${p.code}] ${p.route} ${p.detail}`).join('；'));

if (verdict.problems.length) {
  console.log(`\n  按码统计：${JSON.stringify(byCode)}`);
}

/* ------------------------------------------------------------------ */
/* ④ 只属于独立验收的三条：sitemap 成员、noindex、Feed 文件              */
/* ------------------------------------------------------------------ */

{
  const indexableRoutes = descriptors.filter(page => page.indexable).map(page => page.route);
  const sitemapRoutes = sitemap.map(url => url.slice(feeds.SITE_URL.length));
  const notInSitemap = indexableRoutes.filter(route => !sitemapRoutes.includes(route));
  const extraInSitemap = sitemapRoutes.filter(route => !indexableRoutes.includes(route));
  check('sitemap 成员 == 非 noindex 页面的集合（现场按 robots meta 判定）',
    notInSitemap.length === 0 && extraInSitemap.length === 0,
    `漏 ${notInSitemap.slice(0, 3).join(',')} / 多 ${extraInSitemap.slice(0, 3).join(',')}`);
}

{
  const noindexPages = descriptors.filter(page => !page.indexable);
  check(`noindex 页面 ${noindexPages.length} 条，且都出现在别名表或策略里`,
    noindexPages.every(page => Boolean(aliases[page.route]) || page.kind === 'hub'),
    noindexPages.filter(page => !aliases[page.route]).map(page => page.route).join(', '));
}

{
  const missingFeedFiles = feedFiles.filter(rel => !fs.existsSync(path.join(OUT, rel)));
  check(`磁盘上的 ${feedFiles.length} 个 Feed 文件都存在且非空`,
    missingFeedFiles.length === 0 && feedFiles.every(rel => fs.statSync(path.join(OUT, rel)).size > 0),
    missingFeedFiles.join(', '));
}

/* ------------------------------------------------------------------ */
/* ⑤ 统计与结论                                                       */
/* ------------------------------------------------------------------ */

const failed = results.filter(row => !row.ok);
const stats = verdict.stats;
console.log('\n=== 口径统计（v1.7 报告用的就是这一组数字）===');
console.log(`  indexable URLs   : ${stats.indexable}`);
console.log(`  deal pages       : ${stats.dealPages}`);
console.log(`  landing pages    : ${stats.landingPages}`);
console.log(`  vendor pages     : ${stats.vendorPages}`);
console.log(`  category pages   : ${stats.categoryPages}`);
console.log(`  sitemap entries  : ${stats.sitemapEntries}`);
console.log(`  orphan pages     : ${stats.orphans}`);
console.log(`  duplicate canon. : ${stats.duplicateCanonical}`);
console.log(`  invalid links    : ${stats.invalidLinks}`);
console.log(`  noindex pages    : ${stats.noindex}`);
console.log(`  dist 文件数      : ${files.size + routes.length}`);

console.log(`\n${failed.length ? '❌' : '✅'} SEO 验收 ${results.length} 项，失败 ${failed.length} 项`);
for (const row of failed) console.log(`   - ${row.name}${row.detail ? `：${row.detail}` : ''}`);
process.exit(failed.length ? 1 : 0);
