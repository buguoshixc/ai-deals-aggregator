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
const pageKinds = require('../lib/page-kinds');
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
  // ⚠️ 不先 `strip()`：那个函数会把 `<script>` 整段摘掉（它服务的是「数可见标记」的调用方），
  // 而 JSON-LD 恰恰住在 `<script>` 里 —— 走 strip 的话这里恒返回 null（历史上正是如此）。
  for (const m of String(html).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
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
//
// v3.0 Stage E：厂商页的门槛从「只有优惠条数」变成三条 OR（条数 / 历史事件 / **非优惠资料**），
// 所以这里的重算也必须交出与构建期同样的五份 join 输入 —— 否则这个「独立门禁」会拿一份
// **过时的计划**去判产物，把 10 个真实生成的厂商页判成「多出来的子页」（实测正是如此）。
// 五份数据全部**从 dist 现场读**（与构建期的来源不同源，这正是这一支的价值）。
const providerTable = require('../lib/providers').load().table;
const plansForPlan = JSON.parse(fs.readFileSync(path.join(OUT, 'plans.json'), 'utf8')).plans;
const apiPlansForPlan = JSON.parse(fs.readFileSync(path.join(OUT, 'api-plans.json'), 'utf8')).plans;
const modelsForPlan = JSON.parse(fs.readFileSync(path.join(OUT, 'models.json'), 'utf8')).models;
const modelLinksForPlan = JSON.parse(fs.readFileSync(path.join(OUT, 'model-registry-links.json'), 'utf8')).links;
const plan = landing.planLandingPages({
  deals,
  vendorKeyOf,
  vendorSlugs: feeds.VENDOR_SLUGS,
  thresholds: undefined,
  vendorThresholds: feeds.VENDOR_THRESHOLDS,
  eventCountOf: () => 0,
  pinned: landing.loadPinned(),
  aliases: landing.loadAliases(),
  plans: plansForPlan,
  apiPlans: apiPlansForPlan,
  providerTable,
  models: modelsForPlan,
  modelLinks: modelLinksForPlan
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
 * v3.0：这张表**搬进了 `lib/page-kinds.js`**（唯一声明表），本工具只读它。
 * `kind` 在这一层决定三件事：**ItemList 是否必须在场**、**可见正文下限**（`textFloor`）、
 * 以及**行数/成员对账用哪个标记**。单层路由（`status/` `changes/` `feeds/`）可以由路由字符串
 * 直接推出来，但 `/plans/coding/` 与 `/plans/` 都是两级、且**含义不同** ——
 * 从路由字符串猜会把 `/plans/` 猜成套餐对比页。**显式登记**比"碰巧能用"可靠。
 *
 * ⚠️ 这一层仍然**自己从 dist 解析页面 HTML**（见上面的 `rowsOf` / `itemListOf` /
 * `listPages`）。共享的只是一份**声明**；解析路径没有、也不允许合并 ——
 * 独立门禁的价值就在于它的输入来源与构建期不同。
 */

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
  // 路由 → kind 的唯一出处：固定路由表 + 动态路由模式（`models/<slug>/`、`archive/<k>/<id>/`…）。
  // 目录页家族（collection / hub）的 kind 随数据走（`spec.kind`），因此仍以计划为准。
  let kind = spec ? spec.kind : (pageKinds.kindOfRoute(route) || route.replace(/\/$/, ''));

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

  // ItemList 的三条要求**从声明表读**（v3.0）：在场性 / 行数对账 / 成员归属。
  // 成员归属只在"成员就是站内条目"的页面上成立：首页与对比页的 ItemList 指向**厂商官方页**
  // （本站的既定口径：主链接给到官方），模型索引的成员判据按 `deal/<id>/` 也对不上 ——
  // 关掉的是**成员归属**，不是 ItemList 本身：在场性、声明数 == 元素数、
  // 以及声明数 == 页面数据行数三条都照常查。
  const rules = pageKinds.itemListRule(kind);

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
    marker: rules.marker,
    expectItemList: rules.expect,
    checkItemListRows: rules.checkRows,
    checkItemListMembers: rules.checkMembers,
    feedMatch: []
  });
}
check('每个落地页的可见数据行 == 按 dist/deals.json 重新算出的条目集合',
  rowMismatches.length === 0, rowMismatches.slice(0, 4).join('；'));

/* ------------------------------------------------------------------ */
/* ②′ 变化页的 ItemList：产物内自洽（判据不复制雷达，但也绝不真空）         */
/* ------------------------------------------------------------------ */

/**
 * `changes/` 的**成员集合**由构建期的 `lib/changes.js` 判据决定（一个记录只出现一次、
 * 取最强事件、不可链接的条目不入列表），`page-kinds.js` 因此对这一页声明
 * `checkMembers: false` —— 独立门禁只读产物，**不建立第二份雷达判据**。
 *
 * 但「不查成员归属」不等于「什么都不查」。下面三条只读产物本身，任何一条坏了都说明
 * 页面自相矛盾，且都能被「删一个成员 / 改一个数字 / 删一行」这类变异抓住：
 *   ① 成员按 id 唯一（同一个记录不许占两个位置）；
 *   ② 每个成员的 URL 在产物里**真实存在**（结构化数据里不许有死链）；
 *   ③ 声明数 == 元素数 == 页面 `data-item` 行数（三份数同一份事实）。
 */
{
  const route = 'changes/';
  const rel = `${route}index.html`;
  const html = fs.existsSync(path.join(OUT, rel)) ? fs.readFileSync(path.join(OUT, rel), 'utf8') : '';
  const list = itemListOf(html);
  const markers = rowsOf(html).items;
  const members = list && Array.isArray(list.itemListElement) ? list.itemListElement : [];
  const routesSet = new Set(routes);
  const memberRoutes = members.map(element => {
    const href = String((element && (element.url || element.item)) || '');
    return href.startsWith(feeds.SITE_URL) ? href.slice(feeds.SITE_URL.length) : href;
  });
  const memberIds = memberRoutes.map(relRoute => {
    const match = relRoute.match(/^deal\/([^/]+)\/$/);
    return match ? decodeURIComponent(match[1]) : '';
  });
  const dangling = memberRoutes.filter(relRoute => {
    const target = decodeURIComponent(relRoute);
    return !relRoute || (!routesSet.has(target) && !files.has(target));
  });

  check('changes/ ItemList 成员按 id 唯一（一个记录不许占两个位置）',
    Boolean(list) && memberIds.every(Boolean) && new Set(memberIds).size === memberIds.length,
    list ? `${members.length} 项 · 重复 ${members.length - new Set(memberIds).size} 个` : '没有 ItemList');
  check('changes/ ItemList 的每个成员 URL 都指向真实存在的页面（结构化数据里没有死链）',
    Boolean(list) && dangling.length === 0 && memberIds.every(Boolean),
    list
      ? `成员 ${members.length} 项 · 死链 ${dangling.length} 条${dangling.length ? `（${dangling.slice(0, 2).join(' ')}）` : ''}`
      : '没有 ItemList');
  check('changes/ ItemList 声明数 == 元素数 == 页面 data-item 行数',
    Boolean(list) && Number(list.numberOfItems) === members.length && members.length === markers.length,
    list ? `声明 ${list.numberOfItems} / 元素 ${members.length} / 行 ${markers.length}` : '没有 ItemList');
}

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
