/**
 * SEO 安全门禁的**规则层**（v1.7）。
 *
 * 形状刻意与 scripts/lib/feeds.js 的 `validate()` 一致：
 *   · **纯函数**：输入是页面描述符数组，输出是 `{ problems, warnings, stats }`；
 *   · **可在被篡改的深拷贝上调用**（`seo-selftest` 就是这么演练每一条检查码的）；
 *   · **不读盘、不联网、不看时钟** —— 描述符由调用方给（构建期给内存里刚写下的页面，
 *     `seo-verify.js` 给从 dist/ 独立解析出来的页面）。
 *
 * 这样「同一套规则」有两个独立的输入来源：构建期知道自己写了什么，
 * 独立门禁只相信磁盘上真的有什么。字节不一致时，两边都会红。
 *
 * ## 为什么检查码要分成三段
 *
 *   · `gate-*`  —— 生成门槛（页面**该不该存在**）。只有构建期能查（它知道被跳过了谁）。
 *   · `alias-*`  —— 别名页与目标页的关系。
 *   · 其余       —— 产物本身的形状（标题/canonical/h1/JSON-LD/面包屑/sitemap/内链/摘要），
 *                   这两个来源都能查，因此两边都跑。
 */

const PROBLEM_CODES = [
  'gate-threshold', 'gate-pinned-missing', 'gate-pinned-empty',
  'alias-target-exists', 'alias-item-set', 'alias-indexable',
  'slug-shape', 'slug-unique',
  'title-unique', 'title-length', 'desc-nonempty', 'desc-unique',
  'canonical-self', 'canonical-unique', 'h1-count', 'robots-policy',
  'itemlist-arity', 'itemlist-members',
  'breadcrumb-target-exists', 'sitemap-target-exists', 'sitemap-policy',
  'orphan', 'internal-link-exists', 'thin-content', 'duplicate-item-set',
  'summary-source', 'feed-declared'
];

/**
 * 每个页面类型的正文长度下限。
 *
 * 集合页沿用既有的 `600 + 60×条目数`（v1.2 定的口径：条目越多阈值越紧，
 * 表体空掉时必然低于它）；其余页面各给一个下限，与既有断言（状态页 600、
 * 变化页 600、首页 3000）同源，不另立一套标准。
 */
function textFloor(kind, itemCount) {
  const n = Number(itemCount) || 0;
  switch (kind) {
    case 'hub': return 500 + 60 * n;
    case 'deal': return 500;
    case 'status': return 600;
    case 'changes': return 600;
    case 'feeds': return 600;
    case 'home': return 3000;
    default: return 600 + 60 * n;
  }
}

function decodeEntities(text) {
  return String(text || '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/** 只数「用户能看见的正文」：去掉 script / style / 注释标记 */
function visibleText(html) {
  return decodeEntities(String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 数标记前先摘掉 `<script>` / `<style>` —— 本文件自己的纪律，也是这个项目反复吃到的教训。
 *
 * 首页与变化页把 RENDER-CORE 的模板字符串内联在 `<script>` 里（`'<h1>' + escapeHtml(...)`），
 * 不摘的话：`<h1>` 会被数成 3 个、`href="…"` 会被当成真实链接（实测一次报出 **90 条
 * 不存在的内链**）。**一个数错了东西的门禁比没有门禁更糟**，因为它看起来在守着什么。
 */
function stripless(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');
}

function attr(html, name) {
  const match = String(html || '').match(new RegExp(`${name}="([^"]*)"`));
  return match ? decodeEntities(match[1]) : '';
}

function titleOf(html) {
  const match = stripless(html).match(/<title>([\s\S]*?)<\/title>/i);
  return match ? decodeEntities(match[1].trim()) : '';
}

function canonicalOf(html) {
  const match = stripless(html).match(/<link[^>]+rel="canonical"[^>]+href="([^"]*)"/i);
  return match ? decodeEntities(match[1]) : '';
}

function descriptionOf(html) {
  const match = stripless(html).match(/<meta[^>]+name="description"[^>]+content="([^"]*)"/i);
  return match ? decodeEntities(match[1]) : '';
}

function robotsOf(html) {
  const match = stripless(html).match(/<meta[^>]+name="robots"[^>]+content="([^"]*)"/i);
  return match ? decodeEntities(match[1]).toLowerCase() : '';
}

function h1Count(html) {
  return (stripless(html).match(/<h1[\s>]/gi) || []).length;
}

/** 抽全部 JSON-LD 块（解析失败的单独记下来，不静默吞掉） */
function jsonLdBlocks(html) {
  const blocks = [];
  const broken = [];
  const re = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(String(html || '')))) {
    try {
      blocks.push(JSON.parse(match[1]));
    } catch (error) {
      broken.push(error.message);
    }
  }
  return { blocks, broken };
}

function typeOf(block) {
  return block && block['@type'];
}

/** ItemList 的口径：声明数、元素数、元素指向的 URL */
function itemListOf(blocks) {
  for (const block of blocks) {
    if (typeOf(block) !== 'ItemList') continue;
    const elements = Array.isArray(block.itemListElement) ? block.itemListElement : [];
    return {
      numberOfItems: Number(block.numberOfItems),
      elements: elements.map(element => ({
        position: element && element.position,
        url: element && element.url ? String(element.url) : '',
        name: element && element.name ? String(element.name) : ''
      }))
    };
  }
  return null;
}

function breadcrumbsOf(blocks) {
  for (const block of blocks) {
    if (typeOf(block) !== 'BreadcrumbList') continue;
    const elements = Array.isArray(block.itemListElement) ? block.itemListElement : [];
    return elements.map(element => ({
      position: element && element.position,
      name: element && element.name ? String(element.name) : '',
      item: element && element.item ? String(element.item) : ''
    }));
  }
  return null;
}

/** 表格里的行：模板给每行写一个 data-item / data-child，检查器只数标记，不信任何人报的数 */
function rowMarkers(html, name) {
  return (String(html || '').match(new RegExp(`data-${name}="`, 'g')) || []).length;
}

/** 页面里的内部链接（相对路由，已规范化；外链与锚点丢弃）。先摘 `<script>`/`<style>`。 */
function internalLinks(html, route) {
  const out = [];
  const source = stripless(html);
  const base = route.split('/').filter(Boolean).length;
  const re = /href="([^"]+)"/gi;
  let match;
  while ((match = re.exec(source))) {
    let href = decodeEntities(match[1]).trim();
    if (!href || href.startsWith('#') || /^(https?:|mailto:|data:)/i.test(href)) continue;
    href = href.split('#')[0].split('?')[0];
    if (!href) continue;
    const up = (href.match(/^(?:\.\.\/)+/) || [''])[0];
    const rest = href.slice(up.length).replace(/^\.\//, '');
    const upCount = up ? up.length / 3 : 0;
    const parts = route.split('/').filter(Boolean);
    const anchor = parts.slice(0, Math.max(0, base - upCount));
    out.push([...anchor, ...rest.split('/').filter(Boolean)].join('/') + (rest.endsWith('/') ? '/' : ''));
  }
  return out;
}

/** 把站内链接规范化成路由键：'vendor/zhipu/' —— 静态文件保留扩展名，便于分开对账 */
function normalizeRoute(href) {
  if (!href) return '';
  if (/\.(xml|json|css|svg|png|txt|ico)$/i.test(href)) return href;
  return href.endsWith('/') ? href : `${href}/`;
}

function uuid(label) {
  return `${label}`;
}

/**
 * @param {Array} pages 页面描述符：
 *   `{ route, kind, indexable, inSitemap, html, itemIds, childRoutes, summary, count }`
 *   —— `route` 站根相对、带尾斜杠（首页是 `''`）。
 * @param {object} opts
 *   `{ siteUrl, sitemap: string[], pinned: string[], aliases: {route:{target,reason}},
 *      thresholds: {categoryMinDeals, vendorMinDeals}, dealsById, asOf, vendorKeyOf, staticFiles: Set }`
 * @returns {{problems: Array, warnings: Array, stats: object}}
 */
function validate(pages, opts = {}) {
  const list = pages || [];
  const problems = [];
  const warnings = [];
  const siteUrl = opts.siteUrl || '';
  const sitemap = new Set((opts.sitemap || []).map(url => String(url).replace(siteUrl, '')));
  const pinned = new Set(opts.pinned || []);
  const aliases = opts.aliases || {};
  const thresholds = Object.assign({ categoryMinDeals: 4, vendorMinDeals: 2 }, opts.thresholds || {});
  const dealsById = opts.dealsById || new Map();
  const asOf = String(opts.asOf || '').slice(0, 10);
  const vendorKeyOf = opts.vendorKeyOf || (deal => String((deal && deal.vendor) || ''));
  const staticFiles = opts.staticFiles || new Set();
  const fail = (code, route, detail) => problems.push({ code, route, detail });

  const byRoute = new Map(list.map(page => [page.route, page]));
  const routeSet = new Set(list.map(page => page.route));

  // ---- 逐页形状 ----------------------------------------------------
  const titleSeen = new Map();
  const descSeen = new Map();
  const canonicalSeen = new Map();
  const itemKeySeen = new Map();
  const summaryRowsByRoute = new Map();

  for (const page of list) {
    const route = page.route;
    const html = page.html || '';
    const title = titleOf(html);
    const canonical = canonicalOf(html);
    const description = descriptionOf(html);
    const robots = robotsOf(html);
    const h1 = h1Count(html);
    const text = visibleText(html);
    const expectedUrl = `${siteUrl}${route}`;

    if (!title) fail('title-length', route, '页面没有 <title>');
    else if (title.length > 80) fail('title-length', route, `标题 ${title.length} 字符，超过 80：${title}`);
    // 唯一性只在**可索引**页面之间要求：别名页（noindex）与目标页共用标题是刻意的
    // ——它就是「同一主题的旧地址」，标题不同反而会让读者以为进错了页。
    if (title && page.indexable) {
      if (titleSeen.has(title)) fail('title-unique', route, `标题与 ${titleSeen.get(title)} 逐字相同：${title}`);
      else titleSeen.set(title, route);
    }

    if (!description) fail('desc-nonempty', route, '没有 meta description');
    else if (page.indexable) {
      if (descSeen.has(description)) fail('desc-unique', route, `description 与 ${descSeen.get(description)} 逐字相同`);
      else descSeen.set(description, route);
    }

    if (!canonical) fail('canonical-self', route, '没有 canonical');
    else if (canonical !== expectedUrl) fail('canonical-self', route, `canonical 是 ${canonical}，自指应为 ${expectedUrl}`);
    if (canonical && page.indexable) {
      // 唯一性口径：**可索引页面之间**不许共用 canonical。自指检查在上一行，
      // 但两者都要有 —— 自指只能保证「每个页面说自己是自己」，
      // 而「两个页面说自己是同一个地址」是一种自指检查照不到的重复（Tooth Test #1）。
      if (canonicalSeen.has(canonical)) fail('canonical-unique', route, `canonical 与 ${canonicalSeen.get(canonical)} 相同：${canonical}`);
      else canonicalSeen.set(canonical, route);
    }

    if (page.indexable && h1 !== 1) fail('h1-count', route, `可索引页的 <h1> 数量是 ${h1}，应为 1`);

    const wantNoindex = !page.indexable;
    const hasNoindex = /noindex/.test(robots);
    if (wantNoindex !== hasNoindex) {
      fail('robots-policy', route, wantNoindex
        ? '策略表判它 noindex，但页面没有 noindex（或 robots meta 缺失）'
        : `策略表判它可索引，但页面带了 robots=${robots}`);
    }

    // sitemap 与索引策略必须一致
    const inSitemap = sitemap.has(route);
    if (page.inSitemap !== undefined && page.inSitemap !== inSitemap) {
      fail('sitemap-policy', route, `描述符声明 inSitemap=${page.inSitemap}，实际 sitemap ${inSitemap ? '有' : '没有'}这一条`);
    }
    if (page.indexable && !inSitemap) fail('sitemap-policy', route, '可索引页不在 sitemap 里');
    if (!page.indexable && inSitemap) fail('sitemap-policy', route, '不可索引页出现在 sitemap 里');

    if (text.length < textFloor(page.kind, page.count)) {
      fail('thin-content', route, `可见正文 ${text.length} 字符 < 下限 ${textFloor(page.kind, page.count)}（kind=${page.kind} count=${page.count}）`);
    }

    // ---- JSON-LD / ItemList / 面包屑 ----
    const { blocks, broken } = jsonLdBlocks(html);
    for (const message of broken) fail('itemlist-arity', route, `JSON-LD 解析失败：${message}`);
    const expectItemList = page.expectItemList !== false;
    const list_ = itemListOf(blocks);
    if (!list_) {
      // 详情页/状态页/订阅中心**刻意没有** ItemList（它们不是集合页）；
      // 集合页（分类页/需求页/分类落地页/厂商页/枢纽页/变化页）必须有。
      if (expectItemList) fail('itemlist-arity', route, '没有 ItemList 结构化数据');
    } else {
      const markers = page.kind === 'hub' ? rowMarkers(html, 'child') : rowMarkers(html, 'item');
      if (list_.numberOfItems !== list_.elements.length) {
        fail('itemlist-arity', route, `ItemList 声明 ${list_.numberOfItems} 项，但 itemListElement 只有 ${list_.elements.length} 项`);
      }
      // 首页的卡片没有 `data-item` 标记（它用的是折叠卡，一张卡可能覆盖多条优惠），
      // 页面行数与 ItemList 条数的对应关系由首页自己那几条断言守着（卡片数/CTA 数/折叠无损）。
      // 这里只查「声明数 = 实际发出的元素数」。
      if (page.checkItemListRows !== false && list_.elements.length !== markers) {
        fail('itemlist-arity', route, `ItemList 有 ${list_.elements.length} 项，页面上的数据行有 ${markers} 行`);
      }
      if (page.checkItemListMembers !== false) {
        const expected = new Set(page.kind === 'hub' ? (page.childRoutes || []) : (page.itemIds || []).map(id => `deal/${encodeURIComponent(id)}/`));
        for (const element of list_.elements) {
          const rel = String(element.url || '').replace(siteUrl, '');
          if (!rel) { fail('itemlist-members', route, 'ItemList 里有一项的 url 为空'); continue; }
          if (!expected.has(rel)) fail('itemlist-members', route, `ItemList 里的 ${rel} 不属于本页（不在可见行集合内）`);
        }
      }
    }

    const crumbs = breadcrumbsOf(blocks);
    if (!crumbs) {
      fail('breadcrumb-target-exists', route, '没有 BreadcrumbList 结构化数据');
    } else {
      for (const crumb of crumbs) {
        if (!crumb.item) continue; // 没有对应页面时**省略 item** 是允许的（保留 name）
        const rel = normalizeRoute(String(crumb.item).replace(siteUrl, ''));
        if (rel === '') continue; // 首页
        if (!routeSet.has(rel) && !staticFiles.has(rel)) {
          fail('breadcrumb-target-exists', route, `面包屑「${crumb.name}」指向不存在的页面：${rel}`);
        }
      }
    }

    // ---- 摘要：每个数字都要能被独立重算出来 ----
    const summary = Array.isArray(page.summary) ? page.summary : [];
    summaryRowsByRoute.set(route, summary);
    if (summary.length) {
      const recomputed = recomputeSummary(page, { dealsById, asOf, vendorKeyOf });
      for (const row of summary) {
        const value = Number(row.value);
        if (!(row.label in recomputed)) {
          fail('summary-source', route, `摘要里的「${row.label}」不在可重算的项里`);
          continue;
        }
        if (recomputed[row.label] !== value) {
          fail('summary-source', route, `摘要「${row.label}」写的是 ${value}，按数据重算是 ${recomputed[row.label]}`);
        }
        if (!new RegExp(`data-summary-label="${escapeRe(row.label)}"[^>]*data-summary-value="${value}"`).test(html)) {
          fail('summary-source', route, `摘要行「${row.label}=${value}」在 HTML 里没有对应的数据标记`);
        }
      }
    }

    // ---- 内链存在性 ----
    for (const link of internalLinks(html, route)) {
      const rel = normalizeRoute(link);
      if (rel === '') continue;
      if (routeSet.has(rel) || staticFiles.has(rel)) continue;
      fail('internal-link-exists', route, `站内链接指向不存在的目标：${link}`);
    }
  }

  // ---- 跨页：重复条目集合、孤儿页、别名 ----
  // 跨页：**集合页之间**的条目集合不允许逐条相同（详情页天然只有一条，不参与这条）。
  const COLLECTION_KINDS = ['collection', 'need', 'category', 'vendor', 'alias', 'hub'];
  for (const page of list) {
    if (!page.indexable) continue;
    if (!COLLECTION_KINDS.includes(page.kind)) continue;
    const key = (page.itemIds || []).slice().sort().join(',');
    if (!key) continue;
    if (itemKeySeen.has(key)) {
      fail('duplicate-item-set', page.route, `与本页条目集合逐条相同的还有 ${itemKeySeen.get(key)}（同一主题不重复建 URL）`);
    } else {
      itemKeySeen.set(key, page.route);
    }
  }

  const inbound = new Map(list.map(page => [page.route, new Set()]));
  for (const page of list) {
    for (const link of internalLinks(page.html || '', page.route)) {
      const rel = normalizeRoute(link);
      if (inbound.has(rel)) inbound.get(rel).add(page.route);
    }
  }
  for (const page of list) {
    if (!page.indexable) continue;
    if (page.route === '') continue; // 首页天然没有入链
    const sources = inbound.get(page.route);
    if (!sources || sources.size === 0) fail('orphan', page.route, '可索引页没有任何站内入链');
  }

  for (const [route, alias] of Object.entries(aliases)) {
    const page = byRoute.get(route);
    const target = byRoute.get(alias.target);
    if (!page) { fail('alias-target-exists', route, '别名表登记了这一路由，但页面没有生成'); continue; }
    if (!target) { fail('alias-target-exists', route, `别名目标是 ${alias.target}，但它不在生成的页面里`); continue; }
    if (!target.indexable) fail('alias-target-exists', route, `别名目标 ${alias.target} 自己就是别名页（别名链必须只有 1 跳）`);
    const a = (page.itemIds || []).slice().sort().join(',');
    const b = (target.itemIds || []).slice().sort().join(',');
    if (a !== b) fail('alias-item-set', route, `别名页与目标页的条目集合不同（本页 ${(page.itemIds || []).length} 条 / 目标 ${(target.itemIds || []).length} 条）`);
    if (page.indexable) fail('alias-indexable', route, '别名页必须是 noindex');
  }

  // ---- 门槛（只有构建期能查：它知道谁被跳过） ----
  if (opts.gate) {
    for (const row of opts.gate.skipped || []) {
      if (row.route && pinned.has(row.route)) {
        fail('gate-pinned-missing', row.route, `钉住的路由被跳过了（原因 ${row.reason}）`);
      }
    }
    for (const page of list) {
      if (page.kind !== 'vendor' && page.kind !== 'category') continue;
      if (page.pinned) {
        if (!page.count) fail('gate-pinned-empty', page.route, '钉住的页面条数为 0');
        continue;
      }
      const min = page.kind === 'vendor' ? thresholds.vendorMinDeals : thresholds.categoryMinDeals;
      if (page.count < min) {
        fail('gate-threshold', page.route, `${page.kind} 页只有 ${page.count} 条，低于门槛 ${min}，且未钉住 —— 不该生成`);
      }
    }
  }

  // ---- slug 形状与唯一性 ----
  const slugSeen = new Map();
  for (const page of list) {
    if (!page.slug) continue;
    if (!/^[a-z0-9][a-z0-9-]*$/.test(page.slug)) fail('slug-shape', page.route, `slug "${page.slug}" 不符合 ^[a-z0-9][a-z0-9-]*$`);
    if (slugSeen.has(page.slug)) fail('slug-unique', page.route, `slug "${page.slug}" 与 ${slugSeen.get(page.slug)} 重复`);
    else slugSeen.set(page.slug, page.route);
  }

  // ---- sitemap 里的每一条都必须真实存在 ----
  for (const url of opts.sitemap || []) {
    const rel = normalizeRoute(String(url).replace(siteUrl, ''));
    if (rel === '') continue;
    if (!routeSet.has(rel)) fail('sitemap-target-exists', rel, 'sitemap 里的这条 URL 没有对应的页面');
  }

  // ---- Feed 声明 ----
  // 声明的 Feed 从 HTML 里**现读**（不信任调用方传进来的清单）：页面声明了什么，
  // 只有页面自己说了算。`feedMatch` 是「这一页**应该**有哪份 Feed」（由注册表推导）。
  if (opts.feedSpecs) {
    const byPath = new Map();
    for (const spec of opts.feedSpecs) {
      byPath.set(spec.path, spec);
      byPath.set(spec.jsonPath, spec);
    }
    for (const page of list) {
      const declared = internalLinks(page.html || '', page.route)
        .filter(link => /^feed.*\.(xml|json)$/.test(link));
      for (const rel of declared) {
        if (!byPath.has(rel)) fail('feed-declared', page.route, `声明了不存在的订阅源：${rel}`);
      }
      const declaredIds = new Set(declared.map(rel => (byPath.get(rel) || {}).id).filter(Boolean));
      for (const id of page.feedMatch || []) {
        if (!declaredIds.has(id)) fail('feed-declared', page.route, `本页有对应的订阅源 ${id}，但页面没有声明它`);
      }
    }
  }

  void uuid;
  void summaryRowsByRoute;

  const stats = {
    pages: list.length,
    indexable: list.filter(page => page.indexable).length,
    noindex: list.filter(page => !page.indexable).length,
    dealPages: list.filter(page => page.route.startsWith('deal/')).length,
    landingPages: list.filter(page => !page.route.startsWith('deal/')).length,
    vendorPages: list.filter(page => page.kind === 'vendor').length,
    categoryPages: list.filter(page => page.kind === 'category').length,
    sitemapEntries: (opts.sitemap || []).length,
    orphans: new Set(problems.filter(p => p.code === 'orphan').map(p => p.route)).size,
    duplicateCanonical: new Set(problems.filter(p => p.code === 'canonical-unique').map(p => p.route)).size,
    invalidLinks: problems.filter(p => p.code === 'internal-link-exists' || p.code === 'breadcrumb-target-exists' || p.code === 'sitemap-target-exists').length
  };

  return { problems, warnings, stats, codes: PROBLEM_CODES };
}

function escapeRe(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 摘要的独立重算。
 *
 * 刻意与 landing.summaryOf 分开写一遍：两处若各写错一半、恰好错成一样，那是巧合；
 * 而「页面写 12、实际列 7」这类错误只需要一处判据就够露馅。这里只读数据，不看页面。
 */
function recomputeSummary(page, ctx) {
  const ids = page.itemIds || [];
  const dealsById = ctx.dealsById || new Map();
  const vendorKeyOf = ctx.vendorKeyOf || (deal => String((deal && deal.vendor) || ''));
  const items = ids.map(id => dealsById.get(id)).filter(Boolean);
  const out = { 当前条目: ids.length };
  const noCard = items.filter(deal => deal.claimRequirements && deal.claimRequirements.creditCardRequired === false).length;
  if (noCard) out['无需信用卡'] = noCard;
  const china = items.filter(deal => deal.availability && deal.availability.chinaUsable === true).length;
  if (china) out['确认中国大陆可申请'] = china;
  const freeApi = items.filter(deal => Array.isArray(deal.benefitType) && deal.benefitType.includes('free_api')).length;
  if (freeApi) out['含免费 API'] = freeApi;
  const freeModel = items.filter(deal => Array.isArray(deal.benefitType) && deal.benefitType.includes('free_model')).length;
  if (freeModel) out['含免费模型'] = freeModel;
  if (ctx.asOf) {
    const recent = items.filter(deal => {
      const from = new Date(`${String(deal.firstSeen).slice(0, 10)}T00:00:00+08:00`);
      const to = new Date(`${ctx.asOf}T00:00:00+08:00`);
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return false;
      const days = Math.round((to - from) / 86400000);
      return days >= 0 && days < 7;
    }).length;
    if (recent) out['最近 7 天新增'] = recent;
  }
  const vendors = new Set(items.map(vendorKeyOf).filter(Boolean)).size;
  if (vendors > 1) out['覆盖来源'] = vendors;
  const categories = new Set(items.map(deal => deal.category).filter(Boolean)).size;
  if (categories > 1) out['覆盖分类'] = categories;
  return out;
}

/** 报告里的一行行统计（口径集中在四处，报告与门禁读同一份） */
function summarize(result) {
  const problems = (result && result.problems) || [];
  const byCode = {};
  for (const problem of problems) byCode[problem.code] = (byCode[problem.code] || 0) + 1;
  return { stats: (result && result.stats) || {}, byCode, total: problems.length };
}

module.exports = {
  PROBLEM_CODES,
  textFloor,
  validate,
  recomputeSummary,
  summarize,
  // 解析器单独导出：seo-selftest 与 seo-verify 都要用同一套「怎么读页面」的实现
  titleOf,
  canonicalOf,
  descriptionOf,
  robotsOf,
  h1Count,
  jsonLdBlocks,
  itemListOf,
  breadcrumbsOf,
  rowMarkers,
  internalLinks,
  normalizeRoute,
  visibleText
};
