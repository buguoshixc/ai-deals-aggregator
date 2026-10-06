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

console.log(`\n=== v1.7 SEO 门禁演练：${passed} 项通过，${failures.length} 项失败 ===`);
for (const row of failures) console.log(`  ✗ ${row.name}${row.detail ? ` —— ${row.detail}` : ''}`);
process.exit(failures.length ? 1 : 0);
