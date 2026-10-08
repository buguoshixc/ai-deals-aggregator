#!/usr/bin/env node
/**
 * SEO 门禁的规则演练 —— `npm run selftest:seo`（v1.7）。
 *
 * 这个文件回答两个问题，两个都必须用**跑出来的结果**回答：
 *
 *   ① **每一条检查码都真的会响吗？** 逐个检查码构造一次定向篡改，断言它**确实**
 *      出现在结果里。一个永远不响的检查码比没有检查码更糟 —— 它看起来在守着什么。
 *   ② **没有篡改时它是静默的吗？** 一份干净的夹具必须得到 0 个问题。
 *      （没有这一条，把验证器写成「永远报错」也能通过 ①。）
 *
 * 与 `feeds-selftest.js` 同一套做法：先把验证器当纯函数在深拷贝上调用，
 * 再断言它报的 code 恰好是我们注入的那一类。
 *
 * 另外三节是注册表层的不变量：门槛函数的分支、slug 表、钉住/别名/排除表的一致性。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const seo = require('../lib/seo');
const landing = require('../lib/landing');
const feeds = require('../lib/feeds');
const audience = require('../lib/audience');

let passed = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) { passed++; console.log(`  ✓ ${name}`); }
  else { failures.push({ name, detail }); console.log(`  ✗ ${name}${detail ? ` —— ${detail}` : ''}`); }
}
function section(title) { console.log(`\n${title}`); }
const clone = value => JSON.parse(JSON.stringify(value));

const SITE = feeds.SITE_URL;
const depthOf = route => route.split('/').filter(Boolean).length;
const prefixOf = route => '../'.repeat(depthOf(route));

/* ------------------------------------------------------------------ */
/* 夹具：一份「干净」的页面集合                                          */
/* ------------------------------------------------------------------ */

const FEED_SPECS = [
  { id: 'all', path: 'feed.xml', jsonPath: 'feed.json', title: '全部优惠' },
  { id: 'category-api', path: 'feed/category-api.xml', jsonPath: 'feed/category-api.json', title: '分类 API' }
];
const STATIC_FILES = new Set(['feed/category-api.xml', 'feed/category-api.json', 'feed.xml', 'feed.json', 'logos.css']);

const DEALS = {
  aaa: { id: 'aaa', type: 'deal', vendor: 'Acme', category: 'API服务', firstSeen: '2026-09-29', claimRequirements: { creditCardRequired: false }, availability: { chinaUsable: true }, benefitType: ['free_api'] },
  bbb: { id: 'bbb', type: 'deal', vendor: 'Acme', category: 'API服务', firstSeen: '2026-09-29', claimRequirements: {}, availability: { chinaUsable: true } },
  ccc: { id: 'ccc', type: 'deal', vendor: 'Beta', category: '对话模型', firstSeen: '2026-09-29' }
};

function pageHtml(opts) {
  const {
    route, title, canonical, desc, h1 = 1, robots = 'index, follow',
    listUrls = [], listCount = listUrls.length, crumbs = [], links = [],
    rows = [], childRows = [], summary = [], text = '正文'.repeat(2000)
  } = opts;
  const prefix = prefixOf(route);
  const ld = [];
  if (listUrls.length || listCount) {
    ld.push({
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      numberOfItems: listCount,
      itemListElement: listUrls.map((url, i) => ({ '@type': 'ListItem', position: i + 1, url, name: `条目 ${i + 1}` }))
    });
  }
  ld.push({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: crumb.name,
      ...(crumb.route === null ? {} : { item: crumb.route === '' ? SITE : `${SITE}${crumb.route}` })
    }))
  });
  return `<!DOCTYPE html>
<html lang="zh-CN"><head>
<meta charset="utf-8">
<title>${title}</title>
<meta name="description" content="${desc}">
<meta name="robots" content="${robots}">
<link rel="canonical" href="${canonical}">
<link rel="alternate" type="application/rss+xml" title="分类 API" href="${prefix}feed/category-api.xml">
<link rel="alternate" type="application/feed+json" title="分类 API" href="${prefix}feed/category-api.json">
<link rel="alternate" type="application/rss+xml" title="全部优惠" href="${prefix}feed.xml">
<link rel="alternate" type="application/feed+json" title="全部优惠" href="${prefix}feed.json">
${ld.map(data => `<script type="application/ld+json">${JSON.stringify(data)}</script>`).join('\n')}
</head><body>
${'<h1>标题</h1>'.repeat(h1)}
<ul class="lsum">${summary.map(row => `<li data-summary-label="${row.label}" data-summary-value="${row.value}">${row.label} ${row.value}</li>`).join('')}</ul>
<table><tbody>${rows.map(id => `<tr data-item="${id}"><td><a href="${prefix}deal/${id}/">x</a></td></tr>`).join('')}${
  childRows.map(r => `<tr data-child="${r}"><td><a href="${prefix}${r}">x</a></td></tr>`).join('')}</tbody></table>
${links.map(link => `<p><a href="${prefix}${link}">${link}</a></p>`).join('')}
<p>${text}</p>
</body></html>`;
}

function cleanPages() {
  const mk = (route, extra = {}, htmlOpts = {}) => {
    const canonical = extra.canonical !== undefined ? extra.canonical : `${SITE}${route}`;
    return Object.assign({
      route,
      html: pageHtml(Object.assign({ route, title: `标题 ${route}`, canonical, desc: `描述 ${route}`, crumbs: [{ name: '首页', route: '' }, { name: '本页', route }], links: [''] }, htmlOpts)),
      kind: 'category',
      indexable: true,
      inSitemap: true,
      itemIds: [],
      childRoutes: [],
      // 摘要行来自 HTML 参数（页面上真的有这些标记），描述符里带同样的值 ——
      // 这正是「页面写的」与「按数据重算的」两个来源要分开的原因。
      summary: htmlOpts.summary || [],
      count: 0,
      expectItemList: true
    }, extra);
  };
  return [
    mk('', { kind: 'home', checkItemListRows: false, checkItemListMembers: false }, {
      title: '首页标题', desc: '首页描述', listUrls: [`${SITE}deal/aaa/`], listCount: 1
    }),
    mk('category/api/', { kind: 'category', slug: 'api', itemIds: ['aaa', 'bbb'], count: 2, pinned: true, feedMatch: ['category-api'] }, {
      title: '分类页标题', desc: '分类页描述', rows: ['aaa', 'bbb'],
      listUrls: [`${SITE}deal/aaa/`, `${SITE}deal/bbb/`],
      summary: [{ label: '当前条目', value: 2 }],
      links: ['vendor/acme/', '']
    }),
    mk('vendor/acme/', { kind: 'vendor', slug: 'acme', itemIds: ['ccc'], count: 1, pinned: true }, {
      title: '厂商页标题', desc: '厂商页描述', rows: ['ccc'],
      listUrls: [`${SITE}deal/ccc/`],
      summary: [{ label: '当前条目', value: 1 }],
      links: ['category/api/', '']
    }),
    mk('need/old/', { kind: 'alias', slug: 'old', indexable: false, inSitemap: false, aliasOf: 'category/api/', itemIds: ['aaa', 'bbb'], count: 2, pinned: true }, {
      title: '旧地址标题', desc: '旧地址描述', robots: 'noindex, follow', rows: ['aaa', 'bbb'],
      listUrls: [`${SITE}deal/aaa/`, `${SITE}deal/bbb/`],
      summary: [{ label: '当前条目', value: 2 }],
      links: ['category/api/', '']
    }),
    ...[['aaa', 'vendor/acme/'], ['bbb', 'category/api/'], ['ccc', 'vendor/acme/']].map(([id, link]) =>
      mk(`deal/${id}/`, { kind: 'deal', expectItemList: false, itemIds: [id], count: 1, checkItemListRows: false, checkItemListMembers: false }, {
        title: `详情页标题 ${id}`, desc: `详情页描述 ${id}`, rows: [id],
        summary: [{ label: '当前条目', value: 1 }], links: [link, '']
      }))
  ];
}

const BASE_OPTS = {
  siteUrl: SITE,
  sitemap: [`${SITE}`, `${SITE}category/api/`, `${SITE}vendor/acme/`, `${SITE}deal/aaa/`, `${SITE}deal/bbb/`, `${SITE}deal/ccc/`],
  pinned: ['category/api/', 'vendor/acme/', 'need/old/'],
  aliases: { 'need/old/': { target: 'category/api/', reason: '测试' } },
  thresholds: { categoryMinDeals: 2, vendorMinDeals: 2 },
  dealsById: new Map(Object.values(DEALS).map(deal => [deal.id, deal])),
  asOf: '2026-09-30',
  vendorKeyOf: deal => String(deal.vendor || ''),
  feedSpecs: FEED_SPECS,
  staticFiles: STATIC_FILES,
  gate: { skipped: [] }
};

const run = (pages, opts = {}) => seo.validate(clone(pages), Object.assign({}, BASE_OPTS, opts));
const codesOf = result => new Set(result.problems.map(problem => problem.code));

/**
 * P2 残留 e1 的夹具：一页**已登记**的路由（`need/no-card/`，kind=need count=1 ⇒ 下限 660），
 * 正文长度按目标余量 `gap` 反推。
 *
 * 两遍定位（先量、再补差）而不是手写字符数：改夹具的标题/链接文案不会让数字悄悄飘。
 * 除正文长度外一切照「干净夹具」的形状来 —— 它进 sitemap、有入链、条目集合与别的
 * 集合页不同，所以这一页**只**该被 `thin-content-margin` 咬到。
 *
 * @returns `[pages, opts]`，可直接 `run(...)`。
 */
function registeredPageFixture(gap) {
  const entry = seo.TEXT_FLOOR_RESIDUALS.find(row => row.route === 'need/no-card/');
  const target = seo.textFloor(entry.kind, entry.count) + gap;
  const build = fillerChars => {
    const pages = cleanPages();
    // 入链：这一页是孤儿的话会被 orphan 咬到 —— 那是噪声，不是本夹具要证明的事
    pages[1].html = pages[1].html.replace('</body>', '<p><a href="../../need/no-card/">need/no-card/</a></p></body>');
    pages.push(Object.assign(clone(pages[1]), {
      route: 'need/no-card/', slug: 'no-card', kind: 'need', count: 1,
      itemIds: ['aaa'], summary: [], pinned: true, feedMatch: [],
      html: pageHtml({
        route: 'need/no-card/', title: '需求页标题', canonical: `${SITE}need/no-card/`, desc: '需求页描述',
        rows: ['aaa'], listUrls: [`${SITE}deal/aaa/`], links: ['category/api/', 'vendor/acme/', ''],
        text: '字'.repeat(fillerChars)
      })
    }));
    return pages;
  };
  let filler = 0;
  let pages = null;
  for (let pass = 0; pass < 3; pass++) {
    pages = build(filler);
    const length = seo.visibleText(pages[pages.length - 1].html).length;
    if (length === target) break;
    filler = Math.max(0, filler + (target - length));
  }
  return [pages, { sitemap: [...BASE_OPTS.sitemap, `${SITE}need/no-card/`] }];
}

/* ------------------------------------------------------------------ */
section('一、干净夹具必须静默（验证器不能是永远红的噪声）');

{
  const result = run(cleanPages());
  check('未篡改的夹具：0 个问题', result.problems.length === 0,
    result.problems.slice(0, 4).map(p => `[${p.code}] ${p.route} ${p.detail}`).join('；'));
  check('统计口径齐全（报告用的一组数字）',
    result.stats && ['indexable', 'dealPages', 'landingPages', 'vendorPages', 'categoryPages', 'sitemapEntries', 'orphans', 'duplicateCanonical', 'invalidLinks']
      .every(key => typeof result.stats[key] === 'number'));
}

/* ------------------------------------------------------------------ */
section('二、每一条检查码都必须真的会响（逐个定向篡改）');

{
  const fixtures = [];

  // gate-*：只有构建期能查（它知道谁被跳过了）
  fixtures.push(['gate-threshold', () => {
    const pages = cleanPages();
    pages.push(Object.assign(clone(pages[2]), { route: 'vendor/small/', slug: 'small', count: 1, pinned: false }));
    return run(pages);
  }]);
  fixtures.push(['gate-pinned-missing', () => run(cleanPages(), { gate: { skipped: [{ route: 'vendor/acme/', reason: 'below-threshold', count: 1 }] } })]);
  fixtures.push(['gate-pinned-empty', () => {
    const pages = cleanPages();
    pages[2].count = 0;
    return run(pages);
  }]);

  fixtures.push(['alias-target-exists', () => run(cleanPages(), { aliases: { 'need/old/': { target: 'vendor/nope/', reason: '测试' } } })]);
  fixtures.push(['alias-item-set', () => {
    const pages = cleanPages();
    pages[3].itemIds = ['aaa'];
    return run(pages);
  }]);
  fixtures.push(['alias-indexable', () => {
    const pages = cleanPages();
    pages[3].indexable = true;
    pages[3].inSitemap = true;
    pages[3].html = pageHtml({ route: 'need/old/', title: '旧地址标题', canonical: `${SITE}need/old/`, desc: '旧地址描述', rows: ['aaa', 'bbb'], listUrls: [`${SITE}deal/aaa/`, `${SITE}deal/bbb/`], links: ['category/api/', ''], summary: [{ label: '当前条目', value: 2 }] });
    return run(pages);
  }]);

  fixtures.push(['slug-shape', () => {
    const pages = cleanPages();
    pages[1].slug = 'Bad Slug';
    return run(pages);
  }]);
  fixtures.push(['slug-unique', () => {
    const pages = cleanPages();
    pages[2].slug = 'api';
    return run(pages);
  }]);

  fixtures.push(['title-unique', () => {
    const pages = cleanPages();
    pages[2].html = pageHtml({ route: 'vendor/acme/', title: '分类页标题', canonical: `${SITE}vendor/acme/`, desc: '厂商页描述', rows: ['ccc'], listUrls: [`${SITE}deal/ccc/`], links: ['category/api/', ''], summary: [{ label: '当前条目', value: 1 }] });
    return run(pages);
  }]);
  fixtures.push(['title-length', () => {
    const pages = cleanPages();
    pages[1].html = pageHtml({ route: 'category/api/', title: 'X'.repeat(90), canonical: `${SITE}category/api/`, desc: '分类页描述', rows: ['aaa', 'bbb'], listUrls: [`${SITE}deal/aaa/`, `${SITE}deal/bbb/`], links: ['vendor/acme/', ''], summary: [{ label: '当前条目', value: 2 }] });
    return run(pages);
  }]);
  fixtures.push(['desc-nonempty', () => {
    const pages = cleanPages();
    pages[1].html = pages[1].html.replace(/<meta name="description"[^>]*>/, '');
    return run(pages);
  }]);
  fixtures.push(['desc-unique', () => {
    const pages = cleanPages();
    pages[2].html = pageHtml({ route: 'vendor/acme/', title: '厂商页标题', canonical: `${SITE}vendor/acme/`, desc: '分类页描述', rows: ['ccc'], listUrls: [`${SITE}deal/ccc/`], links: ['category/api/', ''], summary: [{ label: '当前条目', value: 1 }] });
    return run(pages);
  }]);

  fixtures.push(['canonical-self', () => {
    const pages = cleanPages();
    pages[1].html = pages[1].html.replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${SITE}vendor/acme/">`);
    return run(pages);
  }]);
  fixtures.push(['canonical-unique', () => {
    const pages = cleanPages();
    // 两个可索引页面声称自己是同一个地址（Tooth Test #1 的场景）
    pages[1].html = pages[1].html.replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${SITE}vendor/acme/">`);
    pages[2].html = pages[2].html.replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${SITE}vendor/acme/">`);
    return run(pages);
  }]);

  fixtures.push(['h1-count', () => {
    const pages = cleanPages();
    pages[1].html = pageHtml({ route: 'category/api/', title: '分类页标题', canonical: `${SITE}category/api/`, desc: '分类页描述', h1: 2, rows: ['aaa', 'bbb'], listUrls: [`${SITE}deal/aaa/`, `${SITE}deal/bbb/`], links: ['vendor/acme/', ''], summary: [{ label: '当前条目', value: 2 }] });
    return run(pages);
  }]);
  fixtures.push(['robots-policy', () => {
    const pages = cleanPages();
    pages[1].html = pages[1].html.replace('content="index, follow"', 'content="noindex, follow"');
    return run(pages);
  }]);

  fixtures.push(['itemlist-arity', () => {
    const pages = cleanPages();
    pages[1].html = pages[1].html.replace(/"numberOfItems":2/, '"numberOfItems":10');
    return run(pages);
  }]);
  fixtures.push(['itemlist-members', () => {
    const pages = cleanPages();
    pages[1].html = pageHtml({ route: 'category/api/', title: '分类页标题', canonical: `${SITE}category/api/`, desc: '分类页描述', rows: ['aaa', 'bbb'], listUrls: [`${SITE}deal/zzz/`, `${SITE}deal/bbb/`], links: ['vendor/acme/', ''], summary: [{ label: '当前条目', value: 2 }] });
    return run(pages);
  }]);

  fixtures.push(['breadcrumb-target-exists', () => {
    const pages = cleanPages();
    pages[1].html = pageHtml({ route: 'category/api/', title: '分类页标题', canonical: `${SITE}category/api/`, desc: '分类页描述', rows: ['aaa', 'bbb'], listUrls: [`${SITE}deal/aaa/`, `${SITE}deal/bbb/`], crumbs: [{ name: '首页', route: '' }, { name: '厂商', route: 'vendor/nope/' }, { name: '本页', route: 'category/api/' }], links: ['vendor/acme/', ''], summary: [{ label: '当前条目', value: 2 }] });
    return run(pages);
  }]);

  fixtures.push(['sitemap-target-exists', () => run(cleanPages(), { sitemap: [...BASE_OPTS.sitemap, `${SITE}vendor/ghost/`] })]);
  fixtures.push(['sitemap-policy', () => {
    const pages = cleanPages();
    pages[2].inSitemap = false;
    return run(pages, { sitemap: [`${SITE}`, `${SITE}category/api/`, `${SITE}deal/aaa/`] });
  }]);

  fixtures.push(['orphan', () => {
    const pages = cleanPages();
    // 把指向厂商页的**全部**入链去掉（上面两处；少了任何一处都还有入链，也就不会 orphan）
    for (const page of pages) {
      page.html = page.html.replace(/<p><a href="[^"]*vendor\/acme\/">[\s\S]*?<\/p>/g, '');
    }
    return run(pages);
  }]);
  fixtures.push(['internal-link-exists', () => {
    const pages = cleanPages();
    pages[1].html = pages[1].html.replace('</body>', '<p><a href="../vendor/nope/">nope</a></p></body>');
    return run(pages);
  }]);

  fixtures.push(['thin-content', () => {
    const pages = cleanPages();
    pages[2].html = pages[2].html.replace(/<p>[^<]*<\/p>/, '<p>短</p>');
    return run(pages);
  }]);
  fixtures.push(['thin-content-margin', () => {
    // P2 残留 e1：只对**已登记**的路由判（`lib/seo.js` 的 TEXT_FLOOR_RESIDUALS）。
    // 要证明的是它比 thin-content **更早**响：正文还在下限之上，但余量已跌破登记值。
    const gap = seo.TEXT_FLOOR_RESIDUALS[0].margin - 1;
    return run(...registeredPageFixture(gap));
  }]);
  fixtures.push(['duplicate-item-set', () => {
    const pages = cleanPages();
    // 再加一页，条目集合与分类页逐条相同（另一条主题路径收到同一批条目）
    const twin = clone(pages[1]);
    twin.route = 'category/api2/';
    twin.slug = 'api2';
    twin.html = pageHtml({ route: 'category/api2/', title: '分类页标题二', canonical: `${SITE}category/api2/`, desc: '分类页描述二', rows: ['aaa', 'bbb'], listUrls: [`${SITE}deal/aaa/`, `${SITE}deal/bbb/`], links: ['category/api/', ''], summary: [{ label: '当前条目', value: 2 }] });
    pages.push(twin);
    return run(pages, { sitemap: [...BASE_OPTS.sitemap, `${SITE}category/api2/`] });
  }]);
  fixtures.push(['summary-source', () => {
    const pages = cleanPages();
    pages[1].html = pages[1].html.replace('data-summary-value="2"', 'data-summary-value="7"');
    return run(pages);
  }]);
  fixtures.push(['feed-declared', () => {
    const pages = cleanPages();
    // RSS 与 JSON 指向同一份 Feed：两份都要摘掉，只摘一份时「已声明」仍然成立
    pages[1].html = pages[1].html.replace(/<link rel="alternate"[^>]*feed\/category-api\.(xml|json)"[^>]*>\n?/g, '');
    return run(pages);
  }]);

  const covered = new Set();
  for (const [code, build] of fixtures) {
    let result = null;
    try { result = build(); } catch (error) { check(`${code} 会响`, false, `构造夹具时抛错：${error.message}`); continue; }
    const codes = codesOf(result);
    covered.add(code);
    check(`${code} 会响`, codes.has(code),
      `实得 [${[...codes].join(', ')}]${result.problems.length ? ` · ${result.problems[0].detail}` : ''}`);
  }
  const missing = seo.PROBLEM_CODES.filter(code => !covered.has(code));
  check(`检查码表里的 ${seo.PROBLEM_CODES.length} 条全部有对应的演练夹具`, missing.length === 0, missing.join(', '));
}

/* ------------------------------------------------------------------ */
section('三、门槛函数的分支（shouldGenerateLandingPage）');

{
  const thresholds = feeds.VENDOR_THRESHOLDS;
  const gate = (kind, candidate) => landing.shouldGenerateLandingPage(kind, candidate, {
    vendorThresholds: thresholds, categoryMinDeals: landing.CATEGORY_MIN_DEALS
  });
  check('厂商：有效优惠 ≥ 2 → 生成', gate('vendor', { count: 2 }).ok);
  check('厂商：1 条且未钉住 → 不生成', !gate('vendor', { count: 1 }).ok && gate('vendor', { count: 1 }).reason === 'below-threshold');
  check('厂商：1 条但钉住 → 生成（收录过的 URL 不消失）', gate('vendor', { count: 1, pinned: true }).ok);
  check('厂商：钉住但 0 条 → 不生成（空页面对读者没有价值）',
    !gate('vendor', { count: 0, pinned: true }).ok && gate('vendor', { count: 0, pinned: true }).reason === 'pinned-empty');
  check('厂商：历史事件 ≥ 3 → 生成（门槛的第二条腿）', gate('vendor', { count: 0, eventCount: 3 }).ok);
  check(`分类：≥ ${landing.CATEGORY_MIN_DEALS} 条 → 生成`, gate('category', { count: landing.CATEGORY_MIN_DEALS }).ok);
  check('分类：少一条 → 不生成', !gate('category', { count: landing.CATEGORY_MIN_DEALS - 1 }).ok);
  check('分类：条目集合与既有页面完全相同 → 不生成（同一主题不重复建 URL）',
    !gate('category', { count: 99, alreadyCovered: true }).ok);
  check('枢纽：有子页才生成', gate('hub', { children: 1 }).ok && !gate('hub', { children: 0 }).ok);
  check('别名：目标不存在就不生成', !gate('alias', { targetExists: false }).ok && gate('alias', { targetExists: true }).ok);
  check('未知类型直接抛错（不静默放行）', (() => {
    try { landing.shouldGenerateLandingPage('nope', {}); return false; } catch (error) { return true; }
  })());
}

/* ------------------------------------------------------------------ */
section('三′、页面种类的布局族声明（scripts/lib/page-kinds.js 是唯一出处）');

{
  // 布局族是「一页的正文该长成什么形状」的唯一声明处（宽度本身在 index.html 的共享 <style>）。
  // 这一节守的是**声明自洽**：进门（每个 kind 都有 layout）+ 值合法（族真的存在）+
  // 反向完整（没有孤儿族）。三件事缺一件，"声明表"就会重新变成"看起来统一、实际只有一半是真的"。
  const pageKinds = require('../lib/page-kinds');

  const layoutProblems = pageKinds.assertLayoutDeclarations();
  check('布局族声明自洽：每个 kind 都有 layout 且落在已定义族内，也没有孤儿族',
    layoutProblems.length === 0, layoutProblems.slice(0, 3).join('；'));

  check('每个 KIND_TABLE 的 kind 都有 layout，且该 layout 是 LAYOUT_FAMILIES 里真实存在的族',
    pageKinds.allKinds().every(kind => Object.prototype.hasOwnProperty.call(
      pageKinds.LAYOUT_FAMILIES, pageKinds.layoutOf(kind))),
    pageKinds.allKinds()
      .filter(kind => !Object.prototype.hasOwnProperty.call(pageKinds.LAYOUT_FAMILIES, pageKinds.layoutOf(kind)))
      .join(', '));

  check('未声明的 kind 没有布局族（layoutOf 返回 null，不回落成某个默认族）',
    pageKinds.layoutOf('这个-kind-不存在') === null);

  // `prose` 是唯一"当前站点无实例"的族 —— 无实例是**登记过的事实**，不是漏网：
  // 它写在 LAYOUT_FAMILIES_WITHOUT_INSTANCES 里，而 assertLayoutDeclarations() 会双向反查
  // （没登记的无实例族 ⇒ 红；登记了却有了实例 ⇒ 那条登记过期，也红）。
  check('prose 是唯一登记的"当前无实例"族，且它确实没有实例',
    [...pageKinds.LAYOUT_FAMILIES_WITHOUT_INSTANCES].join(',') === 'prose'
    && pageKinds.allKinds().every(kind => pageKinds.layoutOf(kind) !== 'prose'),
    `无实例族=${[...pageKinds.LAYOUT_FAMILIES_WITHOUT_INSTANCES].join(',')}，` +
    `用到的族=${[...new Set(pageKinds.allKinds().map(kind => pageKinds.layoutOf(kind)))].join(',')}`);

  // 【牙】按同一份声明做两处定向篡改，确认上面那条"零问题"不是恒真。
  let missingLayoutProblems = null;
  const savedHomeLayout = pageKinds.KIND_TABLE.home.layout;
  try {
    delete pageKinds.KIND_TABLE.home.layout;
    missingLayoutProblems = pageKinds.assertLayoutDeclarations();
  } finally {
    pageKinds.KIND_TABLE.home.layout = savedHomeLayout;
  }
  check('【牙】抹掉一个 kind 的 layout → 声明检查变红，且复位后重新为零问题',
    missingLayoutProblems.some(problem => problem.includes('home'))
    && pageKinds.assertLayoutDeclarations().length === 0,
    (missingLayoutProblems || []).slice(0, 2).join('；'));

  let orphanProblems = null;
  try {
    pageKinds.LAYOUT_FAMILIES['probe-family'] = { label: 'Probe', summary: '探针族（临时）' };
    orphanProblems = pageKinds.assertLayoutDeclarations();
  } finally {
    delete pageKinds.LAYOUT_FAMILIES['probe-family'];
  }
  check('【牙】新加一个没有任何实例的族 → 报成孤儿族，且复位后重新为零问题',
    orphanProblems.some(problem => problem.includes('probe-family'))
    && pageKinds.assertLayoutDeclarations().length === 0,
    (orphanProblems || []).slice(0, 2).join('；'));
}

/* ------------------------------------------------------------------ */
section('四、注册表与产物的一致性（用真实数据）');

{
  const payload = JSON.parse(fs.readFileSync(path.join(ROOT, 'deals.json'), 'utf8'));
  const renderCore = require('../lib/render-core').load(path.join(ROOT, 'index.html'));
  const vendorKeyOf = deal => renderCore.vendorOf(deal).name;
  const plan = landing.planLandingPages({
    deals: payload.deals, vendorKeyOf, vendorSlugs: feeds.VENDOR_SLUGS,
    vendorThresholds: feeds.VENDOR_THRESHOLDS, eventCountOf: () => 0
  });

  check('计划里没有问题（违规在构建期就直接抛错）', plan.problems.length === 0, plan.problems.join('；'));
  // v3.0 Stage E（D13，队长收紧一格）：`/vendor/<slug>/` 的**身份来源只有 A 空间**
  // （RENDER-CORE 的 `vendorKeyNames()`）。所以这张 slug 表的键的合法集合就是 A 空间规范名：
  // 逐字属于它 ⇒ 合法；采集来的原始串（「火山引擎（字节跳动）」）不在其中 ⇒ 红。
  //
  // 为什么不再并列 provider 的 name 集合（我上一版那样写）：① 与"身份来源只有 A 空间"自相矛盾
  // ——同一句话里引用了 `vendorKeyNames()`，却把 provider 的全部 name 一起放行，等于没用上 `vendorKey`；
  // ② 实测 19 个键**全部**落在 A 空间，第二个集合纯属多余。Stage E 起厂商页多出来的那批
  // （例如 DeepSeek：只有 api-plans 记录、0 条 deal）本来就是靠 A 空间键（`vendorKey`）拿到资格的。
  const aSpaceNames = new Set(renderCore.vendorKeyNames().map(pair => pair.name));
  check('slug 表：厂商键全部是 A 空间的**规范显示名**（不是采集时的原始字符串）', (() => {
    const bad = Object.keys(feeds.VENDOR_SLUGS).filter(name => !aSpaceNames.has(name));
    return bad.length === 0;
  })(), Object.keys(feeds.VENDOR_SLUGS).filter(name => !aSpaceNames.has(name)).join(', '));
  // 姊妹断言（队长要求，补上另一半判据）：**A 空间是厂商页身份的唯一来源** ⇒ 一个 provider
  // 只有在 A 空间有名（name 逐字属于 A 空间规范名）时才有 `/vendor/` 路由资格；name 不在 A 空间里的
  // provider 必须 `vendorKey === null`（"没有厂商名 ⇒ 不参与厂商身份空间"）。两个说法同时成立才算对。
  check('provider 的 name 不在 A 空间规范名里 ⇒ 它的 vendorKey 必须是 null（无厂商名就不参与 /vendor/ 身份空间）', (() => {
    const providerTable = require('../lib/providers').load().table;
    const stray = Object.values(providerTable).filter(entry => {
      const name = String((entry && entry.name) || '');
      return name && !aSpaceNames.has(name) && entry.vendorKey !== null;
    });
    return stray.length === 0;
  })(), (() => {
    const providerTable = require('../lib/providers').load().table;
    return Object.entries(providerTable)
      .filter(([, entry]) => {
        const name = String((entry && entry.name) || '');
        return name && !aSpaceNames.has(name) && entry.vendorKey !== null;
      })
      .map(([key, entry]) => `${key}(${entry.name}, vendorKey=${entry.vendorKey})`).join(', ');
  })());
  check('slug 表与分类 slug 表的形状合法且全局唯一',
    landing.validateSlugTable(feeds.VENDOR_SLUGS, '厂商').length === 0 &&
    landing.validateSlugTable(landing.loadCategorySlugs(), '分类').length === 0,
    [...landing.validateSlugTable(feeds.VENDOR_SLUGS, '厂商'), ...landing.validateSlugTable(landing.loadCategorySlugs(), '分类')].join('；'));
  check('分类 slug 表里没有 categories.js 之外的枚举值',
    Object.keys(landing.loadCategorySlugs()).every(category => require('../lib/categories').CATEGORIES.includes(category)));
  check('每个分类页都登记了 slug 与理由（或进了排除表）', (() => {
    const slugs = landing.loadCategorySlugs();
    return landing.CATEGORY_PAGES.every(page => Boolean(slugs[page.category])) &&
      landing.CATEGORY_EXCLUSIONS.every(row => typeof row.reason === 'string' && row.reason.length > 10);
  })());
  check('钉住表覆盖全部别名路由（别名不允许是无人看管的路由）', (() => {
    const pinned = new Set(landing.loadPinned().map(row => row.route));
    return Object.keys(landing.loadAliases()).every(route => pinned.has(route));
  })());
  check('别名目标都能在计划里找到且可索引', (() => {
    const byRoute = new Map(plan.pages.map(page => [page.route, page]));
    return Object.entries(landing.loadAliases()).every(([route, alias]) => {
      const target = byRoute.get(alias.target);
      const page = byRoute.get(route);
      return Boolean(page && target && target.indexable && !page.indexable);
    });
  })());
  check('别名页的条目集合与目标页逐条相同（用真实数据重算一遍）', (() => {
    return Object.entries(landing.loadAliases()).every(([route, alias]) => {
      const page = plan.pages.find(item => item.route === route);
      const target = plan.pages.find(item => item.route === alias.target);
      if (!page || !target) return false;
      const ids = spec => landing.itemsOf(spec, payload.deals, { vendorKeyOf }).map(deal => deal.id).sort().join(',');
      return ids(page) === ids(target);
    });
  })());
  check('没有任何两个可索引集合页的条目集合逐条相同（用真实数据重算一遍）', (() => {
    const seen = new Map();
    for (const page of plan.pages) {
      if (!page.indexable) continue;
      if (!['collection', 'need', 'category', 'vendor', 'hub'].includes(page.kind)) continue;
      const ids = landing.itemsOf(page, payload.deals, { vendorKeyOf }).map(deal => deal.id).sort().join(',');
      if (!ids) continue;
      if (seen.has(ids)) return false;
      seen.set(ids, page.route);
    }
    return true;
  })());
  check('被跳过的页面都带原因（「悄悄少了一页」不允许）',
    plan.skipped.every(row => typeof row.reason === 'string' && row.reason.length > 0));
  check('摘要的数字与 seo.recomputeSummary 的重算逐项一致（同一份数据的两种算法）', (() => {
    const problems = [];
    for (const page of plan.pages) {
      if (page.kind === 'hub') continue;
      const items = landing.itemsOf(page, payload.deals, { vendorKeyOf });
      const rows = landing.summaryOf(page, items, { asOf: String(payload.updatedAt).slice(0, 10), vendorKeyOf });
      const recomputed = seo.recomputeSummary({ itemIds: items.map(deal => deal.id) }, {
        dealsById: new Map(payload.deals.map(deal => [deal.id, deal])),
        asOf: String(payload.updatedAt).slice(0, 10), vendorKeyOf
      });
      for (const row of rows) {
        if (recomputed[row.label] !== row.value) problems.push(`${page.route} ${row.label}: ${row.value} ≠ ${recomputed[row.label]}`);
      }
    }
    if (problems.length) { failures.push({ name: '摘要重算', detail: problems.slice(0, 3).join('；') }); return false; }
    return true;
  })());
}

/* ------------------------------------------------------------------ */
section('五、零依赖与无时钟（这两个文件必须能在门禁链里裸跑）');

{
  for (const rel of ['scripts/lib/seo.js', 'scripts/lib/landing.js']) {
    const source = fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const banned = [
      ['Date.now', /Date\.now/],
      ['无参 new Date(', /new Date\(\s*\)/],
      ['网络调用', /require\(['"]https?['"]\)|fetch\(|axios/],
      ['文件写入', /writeFileSync|mkdirSync/],
      ['外部依赖', /require\(['"](?!\.|fs|path|crypto)/]
    ];
    for (const [label, re] of banned) check(`${rel} 里没有 ${label}`, !re.test(source));
  }
}

/* ------------------------------------------------------------------ */
section('六、正文下限**余量**登记（P2 残留 e1：/need/no-card/ 只剩 50 字）');

{
  // 这一节守的是「离红线多远」这件事本身：下限公式不许调低（page-kinds 的口径 +
  // v3.0-antigaming 的单调性规则），所以真正的风险全在**正文继续变薄**。
  // 登记表在 `lib/seo.js`（唯一出处），判据是「实时余量 ≥ 登记值」，
  // 构建期（刚写下的页面）与独立门禁（从 dist 重新解析）两侧都会跑。
  const rows = seo.TEXT_FLOOR_RESIDUALS;
  const REGISTRY_JSON = path.join(ROOT, 'research/_raw/p2-residuals-v1/text-floor-margins.json');

  check('登记表非空且字段齐全（页路由 / 当前字数 / 下限 / 余量 / 登记日期）',
    rows.length > 0 && rows.every(row =>
      typeof row.route === 'string' && /^(?:[a-z0-9-]+\/)+$/.test(row.route)
      && typeof row.kind === 'string' && Number.isInteger(row.count) && row.count >= 0
      && Number.isInteger(row.chars) && Number.isInteger(row.floor) && Number.isInteger(row.margin)
      && /^\d{4}-\d{2}-\d{2}$/.test(row.registeredAt)),
    JSON.stringify(rows.map(row => row.route)));

  check('登记表的算术自洽：chars − textFloor(kind, count) === margin（不许只改一个数）',
    rows.every(row => seo.textFloor(row.kind, row.count) === row.floor && row.chars - row.floor === row.margin),
    rows.filter(row => !(seo.textFloor(row.kind, row.count) === row.floor && row.chars - row.floor === row.margin))
      .map(row => `${row.route}: ${row.chars}−${row.floor}≠${row.margin}`).join('；'));

  check('同一个路由只登记一条（登记表里没有互相打架的两条）',
    new Set(rows.map(row => row.route)).size === rows.length);

  // 被点名的那条残留：它可以从登记表里「毕业」（补内容补到余量够厚就删掉），
  // 但不许**悄悄消失** —— 消失意味着这一页没人看着了。
  check('被点名的 /need/no-card/ 在登记表里（P2 残留 e1 的对象不许静默下架）',
    rows.some(row => row.route === 'need/no-card/'));

  // 登记过期即红：路由没了、kind 变了、条数变了，登记表就不再是「这一页的底线」。
  // 条数按**构建期同一条判据**重算（`needsOf` / `collectionsOf` 是派生字段的唯一来源，
  // 根目录的 deals.json 里还没有它们 —— 那是构建期补的）。
  const payload = JSON.parse(fs.readFileSync(path.join(ROOT, 'deals.json'), 'utf8'));
  const renderCore = require('../lib/render-core').load(path.join(ROOT, 'index.html'));
  const vendorKeyOf = deal => renderCore.vendorOf(deal).name;
  const dealsWithDerived = payload.deals.map(deal => Object.assign({}, deal, {
    needs: audience.needsOf(deal), collections: audience.collectionsOf(deal)
  }));
  const plan = landing.planLandingPages({
    deals: dealsWithDerived, vendorKeyOf, vendorSlugs: feeds.VENDOR_SLUGS,
    vendorThresholds: feeds.VENDOR_THRESHOLDS, eventCountOf: () => 0
  });
  const staleRows = rows.filter(row => {
    const spec = plan.pages.find(page => page.route === row.route);
    if (!spec) return true;
    const count = spec.kind === 'hub'
      ? (spec.children || []).length
      : landing.itemsOf(spec, dealsWithDerived, { vendorKeyOf }).length;
    return spec.kind !== row.kind || count !== row.count;
  });
  check('登记的每一页都还在计划里，且 kind / 条数与登记时一致（登记过期即红）',
    staleRows.length === 0,
    staleRows.map(row => `${row.route}（登记 kind=${row.kind} count=${row.count}）`).join('；'));

  // 机器可读的 JSON 转写（`research/_raw/p2-residuals-v1/text-floor-margins.json`）与声明
  // **逐字节对账**：两份不许漂移。要让 JSON 重新等于声明，用
  // `node scripts/tools/seo-verify.js --print-floor-margins`（唯一出处仍是 lib/seo.js）。
  const transcript = fs.existsSync(REGISTRY_JSON) ? fs.readFileSync(REGISTRY_JSON, 'utf8') : null;
  check('登记的 JSON 转写与声明逐字节相同（research/_raw/p2-residuals-v1/text-floor-margins.json）',
    transcript === JSON.stringify(rows, null, 2) + '\n',
    transcript === null ? '文件不存在' : `文件 ${transcript.length} 字节 ≠ 声明 ${JSON.stringify(rows, null, 2).length + 1} 字节`);

  // ---- 边界与牙：判的必须是**登记值**，不是别的什么数 ----
  const registered = rows.find(row => row.route === 'need/no-card/');
  const atBoundary = run(...registeredPageFixture(registered.margin));
  check('【对照组】余量正好等于登记值 ⇒ 不响（边界是「≥」，不是「>」）',
    !codesOf(atBoundary).has('thin-content-margin'),
    atBoundary.problems.map(problem => `[${problem.code}] ${problem.route}`).join('；'));

  const belowBoundary = run(...registeredPageFixture(registered.margin - 1));
  const belowCodes = belowBoundary.problems.filter(problem => problem.code === 'thin-content-margin');
  check('【牙】余量掉到登记值 − 1 ⇒ 变红并点名 /need/no-card/（此时 thin-content 还没到红线）',
    belowCodes.length === 1 && belowCodes[0].route === 'need/no-card/'
    && !codesOf(belowBoundary).has('thin-content'),
    belowBoundary.problems.map(problem => `[${problem.code}] ${problem.route} ${problem.detail}`).join('；') || '（一个问题都没有）');
  check('【牙】那一条红写清了三个数与出处（实测字数 / 下限 / 登记值 + 登记日期 + 重新登记的入口）',
    belowCodes.length === 1
    && belowCodes[0].detail.includes(String(registered.chars))
    && belowCodes[0].detail.includes(String(registered.floor))
    && belowCodes[0].detail.includes(String(registered.margin))
    && belowCodes[0].detail.includes(registered.registeredAt)
    && belowCodes[0].detail.includes('--print-floor-margins'),
    belowCodes.length === 1 ? belowCodes[0].detail : '没有那条红');

  // 反证：把登记值改一格，判据必须跟着动（否则登记的这 50 是装饰品）。
  const savedMargin = registered.margin;
  let raisedVerdict = null;
  let loweredVerdict = null;
  try {
    registered.margin = savedMargin + 1;
    raisedVerdict = codesOf(run(...registeredPageFixture(savedMargin)));
    registered.margin = savedMargin - 1;
    loweredVerdict = codesOf(run(...registeredPageFixture(savedMargin - 1)));
  } finally {
    registered.margin = savedMargin;
  }
  check('【牙】登记值 +1 ⇒ 边界那一页跟着变红（比的是登记值，不是硬编码的 50）',
    raisedVerdict.has('thin-content-margin'));
  check('【牙】登记值 −1 ⇒ 原本跌破的那一页变绿（同一方向的反证）',
    !loweredVerdict.has('thin-content-margin'));
  check('复位后回到绿（两次牙都没有改到真实登记表）',
    registered.margin === savedMargin
    && !codesOf(run(...registeredPageFixture(savedMargin))).has('thin-content-margin'));
}

/* ------------------------------------------------------------------ */
section('七、入口文案契约（P2 残留 e3：「全部变化 →」而不是「查看全部 →」）');

{
  const ENTRY_WORD = '全部变化';
  const FORBIDDEN = '查看全部';
  const changesWording = require('../lib/changes').CHANGES_WORDING;
  const planWording = require('../lib/plan-changes');

  check(`三张措辞表里的入口词都是同一个「${ENTRY_WORD}」`,
    changesWording.CHANGES_LABELS.all === ENTRY_WORD
    && planWording.PLAN_CHANGES_WORDING.PLAN_CHANGES_LABELS.allChanges === ENTRY_WORD
    && planWording.API_PLAN_CHANGES_WORDING.API_PLAN_CHANGES_LABELS.allChanges === ENTRY_WORD,
    [changesWording.CHANGES_LABELS.all,
      planWording.PLAN_CHANGES_WORDING.PLAN_CHANGES_LABELS.allChanges,
      planWording.API_PLAN_CHANGES_WORDING.API_PLAN_CHANGES_LABELS.allChanges].join(' / '));

  // 前端的受控副本（首页条带与无 JS 首屏都读它）：`validate.js --strict` 的
  // checkWordingContract() 会把它与 changes.js 逐项比对，这里再从入口文案这一侧钉一次。
  const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const wordingMatch = indexHtml.match(/const CHANGES_WORDING = (\{[^\n]*?\});/);
  let frontCopy = null;
  try { frontCopy = wordingMatch ? JSON.parse(wordingMatch[1]) : null; } catch (error) { frontCopy = null; }
  check('首页 RENDER-CORE 的受控副本里，入口词同样是「全部变化」（与 changes.js 同词）',
    Boolean(frontCopy && frontCopy.CHANGES_LABELS && frontCopy.CHANGES_LABELS.all === ENTRY_WORD),
    frontCopy && frontCopy.CHANGES_LABELS ? String(frontCopy.CHANGES_LABELS.all) : '解析不到 CHANGES_WORDING');
  check("首页条带的入口是从措辞键拼出来的（escapeHtml(L.all) + 箭头），不是写死的字面量",
    /escapeHtml\(L\.all\)\s*\+\s*' →/.test(indexHtml));

  // 会渲染这条入口的源文件（页面壳 + 措辞表）：一个「查看全部」都不许有。
  // 改名的正确做法是改措辞表，而不是在某处手写一个新词。
  const wordingSources = [
    'index.html',
    'scripts/lib/changes.js', 'scripts/lib/plan-changes.js', 'scripts/lib/feeds.js',
    'scripts/lib/plans-hub-page.js', 'scripts/lib/plans-page.js', 'scripts/lib/api-plans-page.js'
  ];
  const offenders = wordingSources.filter(rel => fs.readFileSync(path.join(ROOT, rel), 'utf8').includes(FORBIDDEN));
  check(`渲染入口的 ${wordingSources.length} 个源文件里没有「${FORBIDDEN}」`,
    offenders.length === 0, offenders.join(', '));

  // 硬编码字面量：措辞**只有一处出处**（三张措辞表）。
  //
  // 这一条在 t4 那一版是"登记表"式的（允许 plans-hub-page.js 手写一处）；本轮
  // （`p2-honesty-single-source-v1`）把那一处收回了措辞表，于是判据从"位置 == 登记的那一处"
  // 升级成**零容忍**：`scripts/lib/` 里任何"指向 /changes/ 的锚 + 手写文字 + 箭头"
  // 都是同一个词的第二处定义。判据写成**代码形状**而不是某个词：
  //   · 从措辞表派生的写法是 `>${escapeHtml(...)} →`，`$`/`{`/`}` 让它天然不匹配；
  //   · 手写的 `>全部变化 →` / `>查看全部 →` / 任何别的词都会匹配 ⇒ 红。
  const libDir = path.join(ROOT, 'scripts/lib');
  const libFiles = fs.readdirSync(libDir).filter(name => name.endsWith('.js')).sort();
  const handWritten = libFiles.filter(name => {
    const source = fs.readFileSync(path.join(libDir, name), 'utf8');
    // 逐行看，避免跨行的模板串把选择器扩得太宽（只在同一行里找「锚 + 字面量 + 箭头」）
    return source.split('\n').some(line => /href="[^"]*changes\/[^"]*"[^>]*>\s*[^<$*{}`]{1,16}?→/.test(line));
  });
  check(`scripts/lib/ 里没有把入口文案手写成字面量（${libFiles.length} 个文件扫描：措辞只从三张措辞表取）`,
    handWritten.length === 0,
    handWritten.length ? `${handWritten.join(', ')} —— 请改成从 changes.CHANGES_WORDING 取词` : '（0 处手写；/plans/ 枢纽块已改为渲染时取词）');

  // 【牙】/plans/ 枢纽块的入口锚**必须**跟着措辞表变 ——
  // 在内存里把表里的词换掉再渲染一次：锚文本跟着变 ⇒ 它不是独立字面量；
  // 若哪天有人把它写死，这条牙立刻红（那是"看起来统一、实际只有一半是真的"的回潮）。
  const hub = require('../lib/plans-hub-page');
  const hubCtx = {
    plans: [], apiPlans: [], providerTable: new Map(),
    planHistoryStore: null, apiPlanHistoryStore: null, dealLinks: null, deals: [], asOf: null, prefix: '../../'
  };
  const anchorTextOf = html => {
    const match = html.match(/<a[^>]*href="[^"]*changes\/"[^>]*>([\s\S]*?)<\/a>/);
    return match ? match[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : null;
  };
  const anchorBefore = anchorTextOf(hub.renderPlansHubPage(hubCtx));
  let anchorMutated = null;
  try {
    changesWording.CHANGES_LABELS.all = '形变词·牙';
    anchorMutated = anchorTextOf(hub.renderPlansHubPage(hubCtx));
  } finally {
    changesWording.CHANGES_LABELS.all = ENTRY_WORD;
  }
  const anchorRestored = anchorTextOf(hub.renderPlansHubPage(hubCtx));
  check('【牙】/plans/ 入口锚随 changes.js 的措辞表变（把表里的词换掉 ⇒ 渲染跟着变；逐字复位 ⇒ 回到原词）',
    anchorBefore === `${ENTRY_WORD} →` && anchorMutated === '形变词·牙 →' && anchorRestored === anchorBefore,
    `原词「${anchorBefore}」· 换表后「${anchorMutated}」· 复位后「${anchorRestored}」`);
}

console.log(`\n=== v1.7 SEO 门禁演练：${passed} 项通过，${failures.length} 项失败 ===`);
for (const row of failures) console.log(`  ✗ ${row.name}${row.detail ? ` —— ${row.detail}` : ''}`);
process.exit(failures.length ? 1 : 0);
