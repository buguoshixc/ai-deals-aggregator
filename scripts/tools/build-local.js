#!/usr/bin/env node
/**
 * 本地/CI 共用的发布产物组装：
 *   校验数据 → 组装 dist/ → 预渲染静态骨架 → 自检产物内容
 *
 * deploy.yml 直接调用本脚本，保证「本地验证」与「线上发布」是同一条路径。
 * 零外部依赖，CI 中无需 npm install。
 *
 * 预渲染（本脚本的核心职责）：
 *   index.html 里保留三个注释标记，构建期把它们替换成真实内容——
 *     <!--PRERENDER:deals-->     默认视图的卡片 HTML
 *     <!--PRERENDER:jsonld-->    Organization / BreadcrumbList / FAQPage / ItemList
 *     __SITE_URL__               站点绝对地址（避免源码里硬编码第二份 URL）
 *   卡片 HTML 与浏览器用的是同一份模板：脚本按 RENDER-CORE 标记从 index.html 抽出
 *   纯渲染核心，在无 DOM 的沙箱里求值。模板只有一处，不会分叉。
 *
 * 用法：node scripts/tools/build-local.js [--out=dist]
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { render: renderOgImage, selfCheck: selfCheckOgImage } = require('../lib/og-image');
const { load: loadLogos, write: writeLogos } = require('../lib/logos');
const { load: loadRenderCore } = require('../lib/render-core');
const { attach: attachZh, summarize: summarizeZh } = require('../lib/zh');
const health = require('../lib/health');
const audience = require('../lib/audience');

const ROOT = path.join(__dirname, '..', '..');
const outArg = process.argv.find(a => a.startsWith('--out='));
/** 最终输出目录。--out 语义不变：用户给什么路径，产物最终就落在什么路径上。 */
const FINAL_OUT = path.join(ROOT, outArg ? outArg.slice(6) : 'dist');
/**
 * 组装暂存目录：最终输出目录的**兄弟目录**（同卷 ⇒ 可用 renameSync 原子替换）。
 *
 * 第 2 阶段的一切写入都指向它，只有全部自检通过之后才替换到 FINAL_OUT。
 * 这样「自检失败」不再等于「上一份好的产物已经被删掉、磁盘上留下一个像构建成功的
 * 半成品目录」：失败路径清掉暂存目录，FINAL_OUT 原封不动。
 */
const STAGE_OUT = `${FINAL_OUT}.building`;
/** 组装期间的写入目标（下称 OUT）。失败时它会被整个清掉，FINAL_OUT 不动。 */
let OUT = STAGE_OUT;

/** 对外报的路径一律是最终目录（相对仓库根），不报暂存目录。 */
function showOut(dir) {
  return `${path.relative(ROOT, dir) || '.'}/`;
}

const PUBLIC_FILES = ['index.html', 'deals.json', 'favicon.svg', 'robots.txt', '.nojekyll'];
/** 构建期生成、不走源码拷贝的产物 */
const GENERATED_FILES = ['logos.css', 'sitemap.xml', 'og-image.png', 'feed.xml', 'feed.json', 'source-health.json'];
const SITE_URL = 'https://buguoshixc.github.io/ai-deals-aggregator/';
const SITE_NAME = 'AI 优惠聚合器';
const SITE_DESCRIPTION = '聚合国内外 AI 大模型的真实优惠：新用户免费额度、免费模型、学生/教师/非营利折扣、限时促销。全部指向厂商官方页。';

/**
 * 站内独立路由（非首页、非详情页）的**唯一清单**：占位符 → 相对路径。
 *
 * 为什么要有这张表：页脚是**一份共享片段**，被写进 4 种深度的输出（首页 / 详情页 / 状态页 /
 * 三个分类页）。原先每加一条路由就要在 3 个写入点各补一次 `.replace(/__XXX_HREF__/g, ...)`，
 * 而「漏了某一层」的症状是页脚出现一个字面量 `__XXX_HREF__` 的死链 ——
 * 站内导航少一条不会有人发现，直到有人正好从那一层点进去。
 *
 * 改成按深度统一解析之后，加一条路由 = 在**这里**加一行 + 把链接写进页脚，
 * 结构上不可能只补一半；`selfCheck()` 还会逐层扫残留占位符兜底。
 */
const ROUTE_HREFS = [
  ['__STATUS_HREF__', 'status/'],
  ['__STUDENT_HREF__', 'student/'],
  ['__DEVELOPER_HREF__', 'developer/'],
  ['__FREEAPI_HREF__', 'free-api/']
];
/** 残留占位符的扫描清单（与 ROUTE_HREFS 同源，避免两处各写一份） */
const ROUTE_MARKERS = ROUTE_HREFS.map(([marker]) => marker);

/**
 * 把共享片段里的路由占位符按**输出深度**解析成相对路径。
 * @param {string} html 含占位符的 HTML
 * @param {string} prefix 该输出相对站点根的路径前缀（'' / '../' / '../../'）
 */
function resolveRouteHrefs(html, prefix) {
  let out = html;
  for (const [marker, rel] of ROUTE_HREFS) out = out.split(marker).join(prefix + rel);
  return out;
}

/**
 * 预渲染正文的纯文本 —— **同时剥掉 `<script>` 与 `<style>`**。
 *
 * 为什么必须剥 `<style>`：站点的样式是内联进每一页的（约 39 KB）。只剥 `<script>` 时，
 * 「正文长度」这个数字有 **98% 是 CSS**：实测状态页 39947 字里只有 1188 字是内容
 * （空状态 646）。拿它当阈值等于在数样式表 —— 页面整张表都没渲染出来，数字照样四万。
 *
 * 这条是 2026-09-29 收口时发现的：`/status/` 与分类页两处「预渲染正文过短」的断言
 * 都在数 CSS，而它们各自看起来都在守着「无 JS 可读」这条约定。
 * **一个量错了东西的断言比没有断言更糟，因为它看起来在守着什么。**
 */
function prerenderedText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}


/**
 * 预渲染卡片数的下限：低于此值说明抽取或过滤逻辑坏了，宁可构建失败。
 *
 * 原为 60（对应 71 条优惠逐条成卡）。引入「同一张官方表格 = 一条优惠」的折叠后，
 * 默认视图稳定在 53 张卡片，因此下调到 45 留出余量。真正防止折叠丢条目的是
 * renderDeals() 里的无损断言（Σ模型数 === 未过期优惠条数），不是这个数字。
 */
const MIN_PRERENDERED_CARDS = 45;

/** 骨架里所有必须被构建期填掉的标记 */
const PRERENDER_MARKERS = [
  'PRERENDER:deals', 'PRERENDER:facets', 'PRERENDER:topstat',
  'PRERENDER:stats', 'PRERENDER:categories', 'PRERENDER:jsonld'
];

function runValidate() {
  console.log('=== 1) 发布前数据校验 ===');
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'validate.js')], { stdio: 'inherit' });
}

/* ------------------------------------------------------------------ */
/* 渲染核心抽取                                                         */
/* ------------------------------------------------------------------ */

/**
 * 从 index.html 抽出 RENDER-CORE 区块并在无 DOM 的沙箱里求值。
 *
 * 沙箱里只提供 escapeHtml/escapeAttr 需要的那个 createElement 垫片；
 * 一旦有人在区块内引用 document/window/state，这里立即抛错——构建立刻失败，
 * 而不是悄悄产出一个坏页面。
 */
/**
 * 渲染核心引用的 logo key 必须全部登记在 assets/logos/manifest.json 里。
 * 缺一个就构建失败——否则页面上会静默出现一个空白方块。
 */
function checkLogoCoverage(renderCore, logos) {
  const referenced = renderCore.logoKeys();
  const missing = referenced.filter(key => !logos[key]);
  if (missing.length) {
    throw new Error(`RENDER-CORE 引用了未登记的 logo: ${missing.join(', ')}（请补进 assets/logos/manifest.json）`);
  }
  const used = new Set(referenced);
  const unused = Object.keys(logos).filter(key => !used.has(key));
  console.log(`  logo 覆盖: 模板引用 ${referenced.length} 个 / 已登记 ${Object.keys(logos).length} 个` +
    (unused.length ? `（暂未使用: ${unused.join(', ')}）` : ''));
}

/* ------------------------------------------------------------------ */
/* 预渲染                                                              */
/* ------------------------------------------------------------------ */

function replaceMarker(html, marker, replacement) {
  if (!html.includes(marker)) {
    throw new Error(`index.html 缺少预渲染标记 ${marker}`);
  }
  return html.split(marker).join(replacement);
}

/** 默认视图（优惠 Tab、无筛选）的卡片 HTML */
function renderDeals(renderCore, payload) {
  const visible = renderCore.defaultVisible(payload.deals);
  const filters = renderCore.defaultFilters();
  const cards = renderCore.defaultCards(payload.deals);

  // 无损断言：折叠只改变呈现粒度，不能丢条目。
  // 折叠卡贡献 models.length 条，未折叠的单条卡贡献 1 条——两者之和必须等于未过期优惠数。
  const covered = cards.reduce((n, card) => n + (Array.isArray(card.models) ? card.models.length : 1), 0);
  if (covered !== visible.length) {
    throw new Error(`折叠丢失条目：卡片覆盖 ${covered} 条，未过期优惠 ${visible.length} 条`);
  }

  if (cards.length < MIN_PRERENDERED_CARDS) {
    throw new Error(`预渲染卡片只有 ${cards.length} 条，低于下限 ${MIN_PRERENDERED_CARDS}（数据或过滤逻辑异常）`);
  }

  // 分档分布：分档规则改了之后，这里是第一时间能看出「档位塌了」的地方
  const dist = new Map();
  cards.forEach(card => dist.set(card.tier, (dist.get(card.tier) || 0) + 1));
  const distText = [...dist.entries()].sort((a, b) => a[0] - b[0])
    .map(([tier, n]) => `档${tier}:${n}`).join(' ');

  return {
    html: renderCore.gridHtml(cards, filters),
    count: cards.length,
    cards: cards,
    visibleCount: visible.length,
    dist: distText,
    facets: renderCore.facetBarHtml(payload.deals, filters),
    categories: renderCore.categoryOptionsHtml(payload.deals),
    stats: renderCore.statsHtml(payload.deals, filters),
    topStat: renderCore.topStatHtml(payload.deals, payload.updatedAt)
  };
}

/* ---------------- FAQ：生成侧解析 + 复核侧独立解析 ---------------- */

/**
 * HTML 片段 → 页面可见的纯文本（单行）。
 *
 * 顺序是硬的：**先剥标签、后解码实体**。反过来的话，正文里合法写出的 `&lt;b&gt;`
 * 会在解码后变成真标签、再被剥掉——把内容吃掉。decodeEntities 的 `&amp;` 必须最后
 * 替换（否则 `&amp;lt;` 会被二次解码成 `<`），这条既有顺序不动。
 */
function plainText(fragment) {
  return decodeEntities(String(fragment).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/**
 * 取出 FAQ 区块（`<section class="faq">`）的 HTML，并先摘掉 `<script>`。
 *
 * 为什么必须摘脚本：渲染核心的源码就内联在页面里，里面有
 * `return '<details class="zht"' + …` 这样的**字符串字面量**。不摘掉的话，
 * 「扫全页 `<details>`」的实现会把它当成第 6 个问答（升级后的自检正是这样当场发现的）。
 *
 * 找不到 FAQ 区块就抛错而不是静默回退全页：那样「逐字一致」就无法被验证，
 * 应该让构建红掉，而不是拿一个错误的比对结果报绿。
 */
function faqSectionHtml(html) {
  const noScript = String(html).replace(/<script[\s\S]*?<\/script>/gi, '');
  const section = noScript.match(/<section[^>]*class="[^"]*\bfaq\b[^"]*"[^>]*>([\s\S]*?)<\/section>/);
  if (!section) throw new Error('找不到 FAQ 区块（<section class="faq">），无法核对可见文案与 FAQPage 是否一致');
  return section[1];
}

/**
 * 从已渲染的 HTML 中解析 FAQ 条目（**生成** FAQPage 用）。
 *
 * FAQPage 结构化数据必须与页面上可见的问答逐字一致，因此这里以 HTML 为唯一事实来源，
 * 而不是在 JS 里再抄一份文案（抄一份就一定会漂移）。
 *
 * 一个问答可以有多段（`<p>` 不止一个）。早先的正则写死了「一问一答只有一个 `<p>`」，
 * 遇到两段的问答（本站第 3 条就是这样）会把 `</p><p>` 当成答案文本的一部分带进 JSON-LD
 * ——这段脏数据已随线上产物发布过。现在按 `<details>` 整块取，答案里每个 `<p>` 当作一段，
 * 段落之间用单个空格连接，得到与页面可见文字一致、且不含任何标记的纯文本。
 */
function extractFaq(html) {
  const items = [];
  const re = /<details\b[^>]*>\s*<summary\b[^>]*>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g;
  const scope = faqSectionHtml(html);
  let m;
  while ((m = re.exec(scope)) !== null) {
    const paragraphs = [...m[2].matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)]
      .map(p => plainText(p[1]))
      .filter(Boolean);
    // 没有 <p> 的问答也要能解析：退回整块纯文本，绝不静默丢条目
    const answer = paragraphs.length ? paragraphs.join(' ') : plainText(m[2]);
    items.push({ question: plainText(m[1]), answer });
  }
  if (items.length < 3) {
    throw new Error(`只解析到 ${items.length} 条 FAQ，至少需要 3 条才能生成 FAQPage`);
  }
  return items;
}

/**
 * 从**最终 HTML** 里回读可见 FAQ（**复核**用）。刻意与 extractFaq() 不同源。
 *
 * extractFaq() 是生成结构化数据的那条路；可见侧若也调它，比较就是恒等的
 * （结构化数据本来就是它生成的），「逐字一致」这句断言永远不可能失败——
 * 上一个已发布缺陷（答案里夹带 `</p><p>`）正是这样溜过去的。
 *
 * 这里走第二条路，而且**段落拆法也不同**：生成侧匹配 `<p>…</p>` 成对标签，
 * 复核侧直接按「段落结束」切分。任何一侧出分歧——丢了一段、多带标签、
 * 边界处理不同、文案只改了一边——都会在下面的自检里报红。
 * 两侧共用「FAQ 区块」这个取景范围（取景错了会被下面的条数断言抓住）。
 */
function visibleFaq(html) {
  const items = [];
  const re = /<details\b[^>]*>([\s\S]*?)<\/details>/g;
  let m;
  while ((m = re.exec(faqSectionHtml(html))) !== null) {
    const body = m[1];
    const summary = body.match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/);
    if (!summary) continue;
    const paragraphs = body.slice(summary.index + summary[0].length)
      .split(/<\/(?:p|li|div)\s*>|<br\s*\/?>/i)
      .map(chunk => plainText(chunk))
      .filter(Boolean);
    items.push({ question: plainText(summary[1]), paragraphs });
  }
  return items;
}

function decodeEntities(text) {
  return String(text)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

/** 序列化 JSON-LD，转义可能提前闭合 </script> 的字符 */
function toJsonLd(data) {
  return JSON.stringify(data, null, 2)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function buildJsonLd(faqItems, cards) {
  const pageUrl = SITE_URL;
  const ogImage = SITE_URL + 'og-image.png';

  const organization = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': SITE_URL + '#organization',
    name: SITE_NAME,
    url: pageUrl,
    logo: SITE_URL + 'favicon.svg',
    description: SITE_DESCRIPTION
  };

  // WebSite：站点级身份节点。同类标杆里 devtk.ai 只有 2 类结构化数据就包含它，
  // 我们原先 4 类反而缺它（见 research/GAP-MATRIX.md G8 的补注）。
  const website = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': SITE_URL + '#website',
    url: pageUrl,
    name: SITE_NAME,
    description: SITE_DESCRIPTION,
    inLanguage: 'zh-CN',
    publisher: { '@id': SITE_URL + '#organization' }
  };

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: '首页', item: pageUrl },
      { '@type': 'ListItem', position: 2, name: 'AI 工具优惠', item: pageUrl }
    ]
  };

  const faqPage = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems.map(item => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer }
    }))
  };

  // ItemList：与页面可见卡片一一对应（折叠后一条优惠一张卡），顺序与页面一致。
  // 折叠卡把覆盖的模型名写进 description，保留「模型名 + 免费额度」这类长尾检索词。
  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'AI 工具优惠与免费额度',
    numberOfItems: cards.length,
    itemListElement: cards.map((card, index) => {
      const item = {
        '@type': 'ListItem',
        position: index + 1,
        name: card.title,
        url: card.url
      };
      if (Array.isArray(card.models)) {
        item.description = `覆盖 ${card.models.length} 个模型：${card.models.join('、')}`;
      }
      return item;
    })
  };

  return [organization, website, breadcrumb, faqPage, itemList]
    .map(data => `  <script type="application/ld+json">\n${toJsonLd(data)}\n  </script>`)
    .join('\n');
}

/** XML 文本转义：RSS 里一个裸 & 就能让整份 feed 解析失败 */
function xmlEscape(value) {  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** 详情页模板里做 HTML 转义：字符集与 XML 转义相同，直接复用 */
const htmlEscape = xmlEscape;

/**
 * 订阅产物：feed.xml（RSS 2.0）+ feed.json（JSON Feed 1.1）。
 *
 * 为什么放在构建期：本站没有后端，也不打算加。订阅说到底是「把已经预渲染的内容再序列化一遍」，
 * 只用 Node 内置模块就能做完，仍然零依赖、零外部请求。
 * 只收录 type=deal 的条目，按最近一次采集时间倒序，最多 100 条。
 */
function renderFeeds(payload) {
  const deals = (payload.deals || [])
    .filter(deal => deal.type === 'deal')
    .sort((a, b) => String(b.lastSeen || '').localeCompare(String(a.lastSeen || '')))
    .slice(0, 100);
  const updated = payload.updatedAt ? new Date(payload.updatedAt) : new Date();

  const describe = deal => [
    deal.discountInfo,
    deal.zh && deal.zh.discountInfo ? `中文：${deal.zh.discountInfo}` : '',
    deal.eligibility ? `适用：${deal.eligibility}` : '',
    deal.validity ? `有效期：${deal.validity}` : ''
  ].filter(Boolean).join(' ');

  const items = deals.map(deal => `    <item>
      <title>${xmlEscape(deal.title)}</title>
      <link>${xmlEscape(deal.url)}</link>
      <guid isPermaLink="false">${xmlEscape(deal.id)}</guid>
      <pubDate>${new Date(deal.lastSeen || updated).toUTCString()}</pubDate>
      <description>${xmlEscape(describe(deal))}</description>
    </item>`).join('\n');

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${xmlEscape(SITE_NAME)}</title>
    <link>${SITE_URL}</link>
    <description>${xmlEscape(SITE_DESCRIPTION)}</description>
    <language>zh-CN</language>
    <lastBuildDate>${updated.toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>
`;

  const json = {
    version: 'https://jsonfeed.org/version/1.1',
    title: SITE_NAME,
    home_page_url: SITE_URL,
    feed_url: SITE_URL + 'feed.json',
    description: SITE_DESCRIPTION,
    language: 'zh-CN',
    items: deals.map(deal => {
      const item = { id: deal.id, url: deal.url, title: deal.title, content_text: describe(deal) };
      if (deal.lastSeen) item.date_modified = deal.lastSeen;
      const tags = [deal.vendor, deal.category].filter(Boolean);
      if (tags.length) item.tags = tags;
      return item;
    })
  };

  return { rss, json: JSON.stringify(json, null, 2) + '\n', count: deals.length };
}

/* ------------------------------------------------------------------ */
/* 独立详情页                                                          */
/* ------------------------------------------------------------------ */

/**
 * 每条优惠一个独立静态页：`dist/deal/<id>/index.html`
 *
 * **为什么要做**：同类站里 11/12 都有路径型条目页（futuretools `/tools/:slug ×40`、
 * toolify `/tool/:slug ×27`、artificialanalysis `/models/:slug ×49`），而我们原先全站
 * 只有 1 个 URL、1 条内链（见 research/GAP-MATRIX.md G1）。这是「可发现性」的根因。
 *
 * **只共用一半，边界要写清楚**：页面主体直接调用 RENDER-CORE 的 `detailHtml()`——与首页详情弹层
 * 是同一个函数；`<style>`、主题前置脚本、页脚三者从**已组装好的 index.html** 里抽出来
 * （页脚靠 `<!--SHARED:footer:START/END-->` 标记，抽不到就抛错，见下面的 `writeDetailPages()`）。
 *
 * **但这三块是硬编码的第二份，没有任何标记或断言保证两边一致**：
 *   ① 品牌头部文案与 mark SVG（本文件下面 `<header class="top">` 里 `<a class="brand">` 那段 ↔ index.html:806-813）；
 *   ② `#themeSeg` 三个主题按钮（本文件下面的 `themeSeg` 常量 ↔ index.html:819-823）；
 *   ③ 详情页的主题切换脚本（本文件下面的 `themeBind` 常量 ↔ index.html:2163-2199，且把 `THEME_KEY`
 *      的值 `'dsh.theme'` 直接抄成字面量，不引用首页那个常量）。
 * 所以**改首页品牌文案或主题行为不会同步到 80 个详情页**，也不会报错。详见
 * PROJECT_STATUS.md「七、审计发现」的模板分叉那一节（那里记了 2026-09-23 工作区的确切行号；
 * 本文件自己的行号刻意不写——加几行注释就会整体位移）。
 *
 * **纯静态**：详情页不加载主脚本，不 fetch deals.json——没有列表要渲染，也就没有控制台错误；
 * 只保留一个极小的主题切换脚本（与首页同一套 localStorage 约定）。
 */
function writeDetailPages(payload, indexHtml, renderCore) {
  const style = (indexHtml.match(/<style>[\s\S]*?<\/style>/) || [''])[0];
  const themeScript = (indexHtml.match(/<script>\s*\/\* 主题必须在首次绘制前决定[\s\S]*?<\/script>/) || [''])[0];
  const footerRaw = (indexHtml.match(/<!--SHARED:footer:START-->([\s\S]*?)<!--SHARED:footer:END-->/) || [])[1];
  if (!style || !themeScript || !footerRaw) {
    throw new Error('抽取详情页共用片段失败（style / 主题脚本 / 页脚）——检查 index.html 里的标记是否还在');
  }
  const footer = resolveRouteHrefs(
    footerRaw.replace(/<span id="lastUpdated">--<\/span>/, '<span>见首页</span>'),
    '../../'
  ).trim();

  const themeSeg = `<div class="seg" id="themeSeg" role="group" aria-label="配色主题">
        <button type="button" data-theme-value="auto" aria-pressed="true">跟随系统</button>
        <button type="button" data-theme-value="light" aria-pressed="false">浅色</button>
        <button type="button" data-theme-value="dark" aria-pressed="false">深色</button>
      </div>`;

  const themeBind = `<script>
    /* 详情页是纯静态的：只需要主题切换，不拉数据、不渲染列表 */
    (function () {
      var seg = document.getElementById('themeSeg');
      document.body.classList.add('js');
      function current() {
        var t = document.documentElement.getAttribute('data-theme');
        return t === 'light' || t === 'dark' ? t : 'auto';
      }
      function paint() {
        var now = current();
        seg.querySelectorAll('[data-theme-value]').forEach(function (button) {
          var on = button.dataset.themeValue === now;
          button.classList.toggle('on', on);
          button.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
      }
      seg.addEventListener('click', function (event) {
        var button = event.target.closest('[data-theme-value]');
        if (!button) return;
        var value = button.dataset.themeValue;
        try {
          if (value === 'light' || value === 'dark') {
            document.documentElement.setAttribute('data-theme', value);
            localStorage.setItem('dsh.theme', value);
          } else {
            document.documentElement.removeAttribute('data-theme');
            localStorage.removeItem('dsh.theme');
          }
        } catch (error) { /* 隐私模式：本次会话内仍生效，只是记不住 */ }
        paint();
      });
      paint();
    })();
  </script>`;

  const deals = (payload.deals || []).filter(deal => deal.type === 'deal' && deal.id);
  const pages = [];

  for (const deal of deals) {
    const vendor = renderCore.vendorOf(deal);
    const tier = renderCore.tierOf(deal);
    const pageUrl = `${SITE_URL}deal/${encodeURIComponent(deal.id)}/`;
    const title = `${deal.title} — 官方优惠与免费额度 | ${SITE_NAME}`;
    const desc = String(deal.discountInfo || deal.description || SITE_NAME).replace(/\s+/g, ' ').slice(0, 150);
    const official = String(deal.url || '');

    // 结构化数据：WebPage（说清这一页是什么）+ BreadcrumbList（说清它在站内的位置）。
    // 刻意不用 Product/Offer：我们不是售卖方，标成商品会构成过度声明。
    const webPage = {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      '@id': pageUrl + '#page',
      url: pageUrl,
      name: deal.title,
      description: desc,
      inLanguage: 'zh-CN',
      isPartOf: { '@id': SITE_URL + '#website' },
      about: { '@type': 'Thing', name: [vendor.name, deal.category].filter(Boolean).join(' · ') }
    };
    const breadcrumb = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '首页', item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: deal.category || '全部优惠', item: SITE_URL },
        { '@type': 'ListItem', position: 3, name: deal.title, item: pageUrl }
      ]
    };
    const jsonLd = [webPage, breadcrumb]
      .map(data => `  <script type="application/ld+json">\n${toJsonLd(data)}\n  </script>`)
      .join('\n');

    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${htmlEscape(title)}</title>
<meta name="description" content="${htmlEscape(desc)}">
<meta name="robots" content="index, follow, max-image-preview:large">
<link rel="canonical" href="${htmlEscape(pageUrl)}">
<link rel="alternate" hreflang="zh-CN" href="${htmlEscape(pageUrl)}">
<link rel="alternate" hreflang="x-default" href="${htmlEscape(pageUrl)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="${htmlEscape(SITE_NAME)}">
<meta property="og:url" content="${htmlEscape(pageUrl)}">
<meta property="og:title" content="${htmlEscape(deal.title)}">
<meta property="og:description" content="${htmlEscape(desc)}">
<meta property="og:image" content="${SITE_URL}og-image.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#f6f7f9" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0b0d10" media="(prefers-color-scheme: dark)">
<link rel="icon" href="../../favicon.svg" type="image/svg+xml">
<link rel="alternate" type="application/rss+xml" title="${htmlEscape(SITE_NAME)} · RSS" href="../../feed.xml">
<link rel="alternate" type="application/feed+json" title="${htmlEscape(SITE_NAME)} · JSON Feed" href="../../feed.json">
<link rel="stylesheet" href="../../logos.css">
${themeScript}
${jsonLd}
${style}
</head>
<body>
  <header class="top">
    <div class="topin">
      <a class="brand" href="../../">
        <span class="mark" aria-hidden="true">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0l-7.2-7.2A2 2 0 0 1 3 12V4.6A1.6 1.6 0 0 1 4.6 3H12a2 2 0 0 1 1.4.6l7.2 7.2a2 2 0 0 1 0 2.6Z"/>
            <path d="M12 8v6"/><path d="m9.5 11.5 2.5 2.5 2.5-2.5"/>
          </svg>
        </span>
        <span class="btxt"><b>AI <em>优惠</em>聚合器</b><small>真实优惠 · 每日更新</small></span>
      </a>
      <a class="jumpback" href="../../">← 返回全部优惠</a>
      ${themeSeg}
    </div>
  </header>

  <div class="wrap">
    <main id="main">
      <nav class="crumb" aria-label="面包屑">
        <a href="../../">首页</a> › <span>${htmlEscape(deal.category || '全部优惠')}</span> › <span>${htmlEscape(deal.title)}</span>
      </nav>
      <article class="dbody dpane" data-tier="${tier.n}">
${renderCore.detailHtml(deal)}
      </article>
      <p class="dpane-src">
        官方页：<a href="${htmlEscape(official)}" target="_blank" rel="noopener noreferrer">${htmlEscape(official)}</a>
        · 本站只做收录与整理，最终以厂商官方页面为准；排序与推荐理由不出售。
      </p>
    </main>
    ${footer}
  </div>
  ${themeBind}
</body>
</html>
`;

    const dir = path.join(OUT, 'deal', deal.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf8');
    pages.push({ id: deal.id, url: pageUrl, title: deal.title, text: String(deal.discountInfo || '') });
  }

  return pages;
}

/* ------------------------------------------------------------------ */
/* 数据源状态页（/status/）                                             */
/* ------------------------------------------------------------------ */

/**
 * 「数据源状态」静态页。
 *
 * 给谁看：项目维护者、技术用户、以及任何想核对「这个站到底还在不在更新」的人。
 * 它回答的是采集报告回答不了的那个问题：**某个来源是不是已经坏了几天**
 * （报告表只活在当次运行的内存里，而 store.js 会把策展条目的 lastSeen 刷成今天，
 * 于是「源坏了」与「源这次没新内容」在首页上长得一模一样）。
 *
 * 实现取舍：
 *  · 不引入任何外部请求，复用 index.html 的 `<style>` / 主题前置脚本 / 页脚，
 *    与详情页同一套抽取方式（样式只有一处，不会漂移）；
 *  · **构建确定性**：页面上只写绝对时间（北京时间），相对时间（「2 小时前」）由一个
 *    内联小脚本在浏览器里换算 —— 否则同一个数据在不同时刻构建会产出不同字节，
 *    与「连续两次 build 产物一致」的规矩冲突；无 JS 时读到的仍是完整信息。
 *  · 数据缺失（还没有过一次成功采集）时生成一页说明，而不是让构建失败。
 */
function renderStatusPage(healthDoc, indexHtml) {
  const style = (indexHtml.match(/<style>[\s\S]*?<\/style>/) || [''])[0];
  const themeScript = (indexHtml.match(/<script>\s*\/\* 主题必须在首次绘制前决定[\s\S]*?<\/script>/) || [''])[0];
  const footerRaw = (indexHtml.match(/<!--SHARED:footer:START-->([\s\S]*?)<!--SHARED:footer:END-->/) || [])[1];
  if (!style || !themeScript || !footerRaw) {
    throw new Error('抽取状态页共用片段失败（style / 主题脚本 / 页脚）——检查 index.html 里的标记是否还在');
  }
  const footer = resolveRouteHrefs(
    footerRaw.replace(/<span id="lastUpdated">--<\/span>/, '<span>见首页</span>'),
    '../'
  ).trim();
  const summary = health.summarize(healthDoc);
  const rows = summary.rows;

  // 标题与描述各只写一遍：它们同时出现在 <title> / <meta description> / 面包屑 / <h1> /
  // JSON-LD 里（5 处）。抄 5 份的后果不是「不一致得很难看」，而是**搜索引擎读到的那份
  // 与读者看到的那份不是同一句话**，而两边都不会报错。
  const STATUS_HEADING = '数据源状态';
  const STATUS_DESCRIPTION = '每个采集来源的最近一次结果：条数变化、最近成功时间、连续失败次数。用于核对本站的数据是不是真的还在更新。';

  // JSON-LD：#1 WebPage、#2 BreadcrumbList。
  //
  // 与分类页同一条约定：**一段一个对象**（塞成数组时 `JSON.parse(block)['@type']` 得到
  // undefined，自检既不抛错也不命中 —— 分类页第一版就是这么写的，被自检当场拦下）。
  //
  // 为什么不给这张表再发一份 `ItemList` / `Dataset`：机器可读的那一份是
  // `source-health.json`，页面上直接链着它。把同一份事实声明两次，两次迟早会分家，
  // 而分家时**没有任何东西会红**（两边各自看都自洽）。宁可少声明一次。
  const jsonLdBlocks = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: `${STATUS_HEADING} · ${SITE_NAME}`,
      description: STATUS_DESCRIPTION,
      url: `${SITE_URL}status/`,
      inLanguage: 'zh-CN',
      isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: SITE_URL }
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '首页', item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: STATUS_HEADING, item: `${SITE_URL}status/` }
      ]
    }
  ].map(data => `<script type="application/ld+json">
${JSON.stringify(data, null, 2).split('\n').map(line => `  ${line}`).join('\n')}
</script>`).join('\n');

  const rowHtml = row => {
    const label = health.STATUS_LABEL[row.status] || row.status;
    const reason = row.reason ? (health.REASON_LABEL[row.reason] || row.reason) : '';
    const missing = row.lastRunMissing ? '<small>本轮未跑（沿用上次结果）</small>' : '';
    return `
        <tr>
          <th scope="row">${htmlEscape(row.name || row.source)}<small>${htmlEscape(row.source)} · ${
  row.kind === 'headless' ? '无头浏览器' : '静态抓取'}${row.region === 'cn' ? ' · 国内' : ' · 国外'}</small>${missing}</th>
          <td class="st"><span class="stt ${htmlEscape(row.status)}">${htmlEscape(label)}</span>${
  reason ? `<small>${htmlEscape(reason)}</small>` : ''}</td>
          <td class="num">${Number(row.lastItemCount) || 0}</td>
          <td class="num">${row.previousItemCount === null || row.previousItemCount === undefined ? '—' : Number(row.previousItemCount)}</td>
          <td class="num">${Number(row.consecutiveFailures) || 0} / ${Number(row.consecutiveZero) || 0}</td>
          <td><time datetime="${htmlEscape(row.lastSuccessAt || '')}" data-rel>${htmlEscape(health.formatCN(row.lastSuccessAt))}</time></td>
        </tr>`;
  };

  const body = rows.length
    ? rows.map(rowHtml).join('')
    : '<tr><td colspan="6">还没有采集记录：这份文件由 `node scripts/collect.js` 写入，第一次采集成功后这里会有数据。</td></tr>';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${htmlEscape(STATUS_HEADING)} · ${htmlEscape(SITE_NAME)}</title>
<meta name="description" content="${htmlEscape(STATUS_DESCRIPTION)}">
<link rel="canonical" href="${SITE_URL}status/">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#f6f7f9" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0b0d10" media="(prefers-color-scheme: dark)">
<link rel="icon" href="../favicon.svg" type="image/svg+xml">
<!-- feed 约定：状态页自己不产出条目（订阅是「内容更新」语义，一页运维表不是更新），
     但必须能被订阅发现 —— 与首页、详情页、分类页声明同两个 feed。
     这一条是 v1.1 收口补的：此页原先只满足五条既有约定里的两条。 -->
<link rel="alternate" type="application/rss+xml" title="${htmlEscape(SITE_NAME)} · RSS" href="../feed.xml">
<link rel="alternate" type="application/feed+json" title="${htmlEscape(SITE_NAME)} · JSON Feed" href="../feed.json">
${themeScript}
${style}
<style>
  /* 只用首页已有的设计变量，不新建一套视觉语言 */
  .stop { display: flex; align-items: baseline; gap: var(--s2); flex-wrap: wrap; margin-bottom: var(--s2); }
  .stop h1 { font-size: 19px; margin: 0; }
  .stop .meta { color: var(--mut); font-size: var(--fs-sm); }
  .snote { color: var(--mut); font-size: var(--fs-sm); line-height: 1.7; margin: 0 0 var(--s3); max-width: 70ch; }
  .stable { width: 100%; border-collapse: collapse; background: var(--card); border: 1px solid var(--line); border-radius: var(--r); overflow: hidden; }
  .stable caption { text-align: left; color: var(--mut); font-size: var(--fs-sm); padding: 0 0 var(--s2); }
  .stable th, .stable td { text-align: left; padding: 10px 12px; border-top: 1px solid var(--line); font-weight: 400; font-size: var(--fs-sm); vertical-align: top; }
  .stable thead th { border-top: 0; color: var(--mut); font-weight: 600; white-space: nowrap; }
  .stable tbody th { font-weight: 600; }
  .stable small { display: block; color: var(--mut); font-weight: 400; font-size: 11.5px; margin-top: 2px; }
  .stable .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .stt { display: inline-block; padding: 2px 8px; border-radius: var(--r-pill); border: 1px solid var(--line); white-space: nowrap; }
  .stt.healthy { color: var(--ok, #137a4b); border-color: currentColor; }
  .stt.degraded { color: var(--warn, #a35a00); border-color: currentColor; }
  .stt.failed { color: var(--bad, #b3261e); border-color: currentColor; }
  .stable-wrap { overflow-x: auto; }
  @media (max-width: 760px) { .stable th, .stable td { padding: 8px 9px; } }
</style>
${jsonLdBlocks}
</head>
<body>
  <header class="top">
    <div class="topin">
      <a class="brand" href="../">
        <span class="mark" aria-hidden="true">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0l-7.2-7.2A2 2 0 0 1 3 12V4.6A1.6 1.6 0 0 1 4.6 3H12a2 2 0 0 1 1.4.6l7.2 7.2a2 2 0 0 1 0 2.6Z"/>
            <path d="M12 8v6"/><path d="m9.5 11.5 2.5 2.5 2.5-2.5"/>
          </svg>
        </span>
        <span class="btxt"><b>AI <em>优惠</em>聚合器</b><small>真实优惠 · 每日更新</small></span>
      </a>
      <a class="jumpback" href="../">← 返回全部优惠</a>
    </div>
  </header>

  <div class="wrap">
    <main id="main">
      <nav class="crumb" aria-label="面包屑"><a href="../">首页</a> › <span>${htmlEscape(STATUS_HEADING)}</span></nav>

      <div class="stop">
        <h1>${htmlEscape(STATUS_HEADING)}</h1>
        <span class="meta">数据生成时间 ${htmlEscape(health.formatCN(healthDoc && healthDoc.generatedAt))}（北京时间）</span>
      </div>
      <p class="snote">
        这里列出每个采集来源<b>最近一次</b>的结果与跨运行的连续性。为什么要公开它：
        首页只写「数据更新 {日期}」，而人工策展的条目每天都在刷新，所以「某个来源坏了几天」
        与「某个来源这次没有新内容」在首页上看起来是一样的——这一页把它们分开。
        状态规则：采集器报错、或连续 3 次零产出即 <b>❌ 失败</b>；请求成功但条数掉到上次一半以下、
        或零产出但还没到 3 次即 <b>⚠️ 异常</b>；其余为 <b>✅ 正常</b>。
        「连续失败 / 连续零产出」两列分别是这两个计数器的当前值。
      </p>

      <div class="stable-wrap">
      <table class="stable">
        <caption>共 ${summary.total} 个来源 · 正常 ${summary.healthy} · 异常 ${summary.degraded} · 失败 ${summary.failed}</caption>
        <thead>
          <tr>
            <th scope="col">来源</th>
            <th scope="col">状态</th>
            <th scope="col" class="num">本次条数</th>
            <th scope="col" class="num">上次条数</th>
            <th scope="col" class="num">连续失败 / 零产出</th>
            <th scope="col">最近成功</th>
          </tr>
        </thead>
        <tbody>${body}
        </tbody>
      </table>
      </div>

      <p class="snote" style="margin-top: var(--s3)">
        机器可读的同一份数据：<a href="../source-health.json">source-health.json</a>。
        本站只做收录与整理，来源站点的可用性、内容与最终条款以官方页面为准。
      </p>
    </main>
    ${footer}
  </div>
  <script>
    /* 相对时间只在浏览器里换算：页面字节因此与构建时刻无关（连续两次 build 产物一致）。
       禁用 JS 时读到的仍是完整的绝对时间。 */
    (function () {
      document.body.classList.add('js');
      var now = Date.now();
      Array.prototype.forEach.call(document.querySelectorAll('time[data-rel]'), function (el) {
        var at = Date.parse(el.getAttribute('datetime'));
        if (isNaN(at)) return;
        var minutes = Math.round((now - at) / 60000);
        var text = minutes < 1 ? '刚刚'
          : minutes < 60 ? minutes + ' 分钟前'
            : minutes < 1440 ? Math.round(minutes / 60) + ' 小时前'
              : Math.round(minutes / 1440) + ' 天前';
        el.setAttribute('title', el.textContent);
        el.textContent = text;
      });
    })();
  </script>
</body>
</html>
`;
}

/* ------------------------------------------------------------------ */
/* 分类页（/student/ /developer/ /free-api/）                           */
/* ------------------------------------------------------------------ */

/**
 * 分类页：**一条优惠一个静态 URL 之外的第二类落地页**。
 *
 * ## 为什么要它们
 *
 * 首页是一个「按力度分档」的大列表，适合逛，不适合回答「我是学生，哪些能用」。
 * 这三个页面回答的就是那一问。它们不是首页的替代品，是入口。
 *
 * ## 为什么是一个函数而不是三个
 *
 * 站点有 `/status/` 这条先例，但子代理核查发现它**只满足五条既有约定里的两条**
 * （预渲染、无 JS 可读），sitemap / feed / JSON-LD 三条当时根本没做。
 * 三条路由各写一遍，等于把「哪一条忘了进 sitemap」变成一个靠记性维持的不变量：
 * sitemap 的条数断言会红，但「忘了加 JSON-LD」不会 —— 那正是最坏的一类缺失。
 * 一个生成循环 + 一张注册表（`audience.COLLECTION_PAGES`）让漏一条在结构上不可能。
 *
 * ## 诚实性约束（与详情页同一把尺子）
 *
 * 页面上只写**有明确依据**的东西：`unknown` 渲染成「尚未确认」而不是「不可用」，
 * 缺席的字段不写。分类归属本身也只认**肯定信号**（见 `audience.studentSignal` 的注释：
 * 覆盖率口径与分类口径在这里刻意不同）。
 */
function renderCollectionPage(spec, deals, indexHtml, context) {
  const style = (indexHtml.match(/<style>[\s\S]*?<\/style>/) || [''])[0];
  const themeScript = (indexHtml.match(/<script>\s*\/\* 主题必须在首次绘制前决定[\s\S]*?<\/script>/) || [''])[0];
  const footerRaw = (indexHtml.match(/<!--SHARED:footer:START-->([\s\S]*?)<!--SHARED:footer:END-->/) || [])[1];
  if (!style || !themeScript || !footerRaw) {
    throw new Error(`抽取分类页共用片段失败（style / 主题脚本 / 页脚）——检查 index.html 里的标记是否还在`);
  }
  const footer = resolveRouteHrefs(
    footerRaw.replace(/<span id="lastUpdated">--<\/span>/, '<span>见首页</span>'),
    '../'
  ).trim();

  const triText = value => (value === true ? '是' : value === false ? '否' : '尚未确认');

  // 门槛 / 领取要求：只写**已知**的键，一个都没有就明说来源没写。
  // 刻意不写「无门槛」——「没查到」与「没有门槛」是两件事。
  const knownLabelList = (map, labels) => Object.keys(labels)
    .filter(key => map && (map[key] === true || map[key] === false))
    .map(key => `${labels[key]}：${triText(map[key])}`);

  const rowHtml = deal => {
    const audienceText = audience.audienceSummary(deal) || '未标注';
    const benefitText = audience.benefitSummary(deal) || '未标注';
    const barriers = knownLabelList(deal.eligibilityDetail, audience.ELIGIBILITY_LABELS)
      .concat(knownLabelList(deal.claimRequirements, audience.CLAIM_LABELS));
    const china = audience.chinaUsableLine(deal);
    const zh = deal.zh && deal.zh.title ? deal.zh.title : '';
    return `
        <tr>
          <th scope="row"><a href="../deal/${encodeURIComponent(deal.id)}/">${htmlEscape(deal.title)}</a>${
  zh ? `<small class="zh">${htmlEscape(zh)}</small>` : ''}<small>${htmlEscape(deal.vendor || '')}</small></th>
          <td>${htmlEscape(audienceText)}</td>
          <td>${htmlEscape(benefitText)}</td>
          <td>${barriers.length ? barriers.map(htmlEscape).join('<br>') : '<span class="none">来源未标注</span>'}</td>
          <td>${china ? htmlEscape(china) : '<span class="none">尚未确认</span>'}</td>
        </tr>`;
  };

  const body = deals.length
    ? deals.map(rowHtml).join('')
    : '<tr><td colspan="5">当前没有符合这一分类、且有明确依据的条目。</td></tr>';

  const why = spec.why.map(line => `        ${line}`).join('\n');

  // JSON-LD：#1 CollectionPage、#2 BreadcrumbList、#3 ItemList。
  // `/status/` 那页连面包屑都只有可见侧、结构化数据一条都没有 —— 这里补齐。
  //
  // ⚠️ **一段一个对象**，不是把三个塞进一个 `<script>` 数组里。
  // 站点的既有约定（首页 5 段、详情页 2 段）就是「每段一个顶层 `@type`」，
  // 自检按 `JSON.parse(block)['@type']` 读；塞成数组时那个表达式得到 `undefined`，
  // 既不抛错也不命中 —— 自检会报「缺少 JSON-LD」而真正的原因是**形状不对**。
  // （第一版就是这么写的，被这条自检当场拦下。）
  const jsonLdBlocks = [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: `${spec.heading} · ${SITE_NAME}`,
      description: spec.description,
      url: `${SITE_URL}${spec.slug}/`,
      inLanguage: 'zh-CN',
      isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: SITE_URL }
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '首页', item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: spec.title, item: `${SITE_URL}${spec.slug}/` }
      ]
    },
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: spec.heading,
      numberOfItems: deals.length,
      itemListElement: deals.slice(0, 50).map((deal, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: `${SITE_URL}deal/${encodeURIComponent(deal.id)}/`,
        name: deal.title
      }))
    }
  ].map(data => `<script type="application/ld+json">
${JSON.stringify(data, null, 2).split('\n').map(line => `  ${line}`).join('\n')}
</script>`).join('\n');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${htmlEscape(spec.heading)} · ${htmlEscape(SITE_NAME)}</title>
<meta name="description" content="${htmlEscape(spec.description)}">
<link rel="canonical" href="${SITE_URL}${spec.slug}/">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#f6f7f9" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0b0d10" media="(prefers-color-scheme: dark)">
<link rel="icon" href="../favicon.svg" type="image/svg+xml">
<!-- feed 约定：分类页自己不产出条目（订阅是「内容更新」语义，一页目录不是更新），
     但必须能被订阅发现 —— 与首页、详情页声明同两个 feed。 -->
<link rel="alternate" type="application/rss+xml" title="${htmlEscape(SITE_NAME)} · RSS" href="../feed.xml">
<link rel="alternate" type="application/feed+json" title="${htmlEscape(SITE_NAME)} · JSON Feed" href="../feed.json">
${themeScript}
${style}
<style>
  /* 只用首页已有的设计变量，不新建一套视觉语言 */
  .cstop { display: flex; align-items: baseline; gap: var(--s2); flex-wrap: wrap; margin-bottom: var(--s2); }
  .cstop h1 { font-size: 19px; margin: 0; }
  .cstop .meta { color: var(--mut); font-size: var(--fs-sm); }
  .snote { color: var(--mut); font-size: var(--fs-sm); line-height: 1.7; margin: 0 0 var(--s3); max-width: 70ch; }
  .ctable { width: 100%; border-collapse: collapse; background: var(--card); border: 1px solid var(--line); border-radius: var(--r); overflow: hidden; }
  .ctable caption { text-align: left; color: var(--mut); font-size: var(--fs-sm); padding: 0 0 var(--s2); }
  .ctable th, .ctable td { text-align: left; padding: 10px 12px; border-top: 1px solid var(--line); font-weight: 400; font-size: var(--fs-sm); vertical-align: top; }
  .ctable thead th { border-top: 0; color: var(--mut); font-weight: 600; white-space: nowrap; }
  .ctable tbody th { font-weight: 600; }
  .ctable small { display: block; color: var(--mut); font-weight: 400; font-size: 11.5px; margin-top: 2px; }
  .ctable small.zh { color: var(--fg); opacity: .72; }
  .ctable .none { color: var(--mut); }
  .ctable-wrap { overflow-x: auto; }
  @media (max-width: 760px) { .ctable th, .ctable td { padding: 8px 9px; } }
</style>
${jsonLdBlocks}
</head>
<body>
  <header class="top">
    <div class="topin">
      <a class="brand" href="../">
        <span class="mark" aria-hidden="true">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0l-7.2-7.2A2 2 0 0 1 3 12V4.6A1.6 1.6 0 0 1 4.6 3H12a2 2 0 0 1 1.4.6l7.2 7.2a2 2 0 0 1 0 2.6Z"/>
            <path d="M12 8v6"/><path d="m9.5 11.5 2.5 2.5 2.5-2.5"/>
          </svg>
        </span>
        <span class="btxt"><b>AI <em>优惠</em>聚合器</b><small>真实优惠 · 每日更新</small></span>
      </a>
      <a class="jumpback" href="../">← 返回全部优惠</a>
    </div>
  </header>

  <div class="wrap">
    <main id="main">
      <nav class="crumb" aria-label="面包屑"><a href="../">首页</a> › <span>${htmlEscape(spec.title)}</span></nav>

      <div class="cstop">
        <h1>${htmlEscape(spec.heading)}</h1>
        <span class="meta">共 ${deals.length} 条 · 数据更新 ${htmlEscape(String(context.lastmod || ''))}</span>
      </div>
      <p class="snote">
${why}
      </p>

      <div class="ctable-wrap">
      <table class="ctable">
        <caption>共 ${deals.length} 条。每一行的依据都在对应的详情页上；没有依据的字段写「尚未确认」，不写成「不可用」。
          首页会把同一厂商的同类优惠折叠成一张卡片，所以首页筛选项上的数字（卡片数）通常少于这里的条数。</caption>
        <thead>
          <tr>
            <th scope="col">优惠</th>
            <th scope="col">适用人群</th>
            <th scope="col">福利类型</th>
            <th scope="col">门槛 / 领取要求</th>
            <th scope="col">中国大陆可用性</th>
          </tr>
        </thead>
        <tbody>${body}
        </tbody>
      </table>
      </div>

      <p class="snote" style="margin-top: var(--s3)">
        分类之间<b>不互斥</b>：一条优惠可以同时出现在多个分类页里（既是给学生的、也是免费 API 的情况很常见）。
        本站只做收录与整理，来源站点的可用性、内容与最终条款以官方页面为准。
      </p>
    </main>
    ${footer}
  </div>
</body>
</html>
`;
}

/* ------------------------------------------------------------------ */
/* 组装                                                                 */
/* ------------------------------------------------------------------ */

function assemble() {
  console.log(`\n=== 2) 组装产物 ${showOut(FINAL_OUT)} ===`);
  console.log(`  写入暂存目录 ${showOut(STAGE_OUT)}`);
  console.log(`  自检全过之后才替换到 ${showOut(FINAL_OUT)}；失败则清掉暂存目录，${showOut(FINAL_OUT)} 保持原样`);
  // maxRetries/retryDelay：Windows 上杀软、同步客户端、静态服务都可能短暂占住目录，
  // 默认 0 重试会直接 EPERM/EBUSY 失败。
  fs.rmSync(STAGE_OUT, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  fs.mkdirSync(STAGE_OUT, { recursive: true });

  for (const file of PUBLIC_FILES) {
    const from = path.join(ROOT, file);
    if (!fs.existsSync(from)) throw new Error(`缺少发布文件: ${file}`);
    fs.copyFileSync(from, path.join(OUT, file));
  }

  // 厂商 logo：品牌矢量现场生成为独立 SVG，官网文件原样拷贝，规则写进 logos.css。
  // 全部落盘、不热链任何第三方 CDN。
  const logoSet = loadLogos();
  const logoStat = writeLogos(OUT, logoSet.logos);
  console.log(`  logo 资产: ${logoStat.count} 个 → logos/ ${logoStat.files} 个文件 + logos.css（${(logoStat.bytes / 1024).toFixed(1)} KB）`);

  const payload = JSON.parse(fs.readFileSync(path.join(ROOT, 'deals.json'), 'utf8'));

  // 中文译文覆盖层：构建期贴一次，并把**贴好的**那份写进 dist/deals.json。
  // 关键点——浏览器 fetch('deals.json') 拿到的和下面预渲染用的是同一份对象，
  // 于是「构建期预渲染」与「浏览器端渲染」仍然只有一条代码路径。
  // 译文只在 zh 字段，英文原文字段一个字节都不动。
  const zhAttached = attachZh(payload.deals);
  payload.deals = zhAttached.deals;

  // 译文门禁。第 1 步的校验跑在**未贴译文**的 deals.json 上，所以 validateDeal 里的 zh
  // 规则在那里永远不会被触发——必须在这里补一道，否则「译文不是中文 / 字段名写错 / 超长」
  // 这类错误会一路静默发到线上。
  // 分级处理：不合规 = 硬失败（译文文件只有人维护，永远能改对）；
  //          原文已变 = 警告 + 该字段译文停用（采集器改英文不该把发布卡死）。
  if (zhAttached.report.skipped.length) {
    const lines = zhAttached.report.skipped.map(row => `  - ${row.title} [${row.id}]: ${row.message}`);
    throw new Error(`中文译文不合规（${zhAttached.report.skipped.length} 处），已阻止发布：\n${lines.join('\n')}`);
  }

  // 分类归属在**构建期**由 `audience.collectionsOf` 一处算出，写进 `dist/deals.json` 的
  // `collections` 字段；分类页与首页筛选器都读它。
  //
  // 于是「首页筛出来的条数」与「分类页列出的条数」**不可能不一致** —— 它们读的是同一份
  // 算好的数据，而不是同一套判据的两份实现（一份在 node、一份在 RENDER-CORE）。
  // 这正是这一阶段反复吃到的教训：判据写两遍，两份会各自「看起来对」。
  //
  // 它只进 dist：源 deals.json 保持「只有事实」，派生结果跟着产物走 ——
  // 可重建性门禁因此不需要认识这个字段。
  for (const deal of payload.deals) {
    const list = audience.collectionsOf(deal);
    if (list.length) deal.collections = list;
    else delete deal.collections;
  }

  fs.writeFileSync(path.join(OUT, 'deals.json'), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`  中文译文: ${summarizeZh(zhAttached.report)}`);
  zhAttached.report.stale.forEach(row =>
    console.warn(`    🔁 原文已变，译文已停用待复核: ${row.title} — ${row.message}`));
  zhAttached.report.orphaned.forEach(row =>
    console.warn(`    ⚠️  译文对不上任何条目 id（条目可能改名/换 URL）: ${row.id} ${row.title}`));
  zhAttached.report.warnings.forEach(row =>
    console.warn(`    ℹ️  ${row.title}: ${row.message}`));
  if (zhAttached.report.unmanaged.length) {
    // 覆盖层管不到的译文：指纹比对（lib/zh.js）对它们不会执行，原文被改写时停用逻辑失效，
    // 旧译文会一直发到线上。这里按告警打出来，并由 check:zh（zh-todo.js --check）计为漂移。
    console.warn(
      `    ⚠️  ${zhAttached.report.unmanaged.length} 条译文不在覆盖层里（deals.json 自带、覆盖层管不到）：` +
      `${zhAttached.report.unmanaged.slice(0, 5).map(row => row.title).join('、')}`
    );
  }
  if (zhAttached.report.missing.length) {
    console.log(`    ℹ️  仍有 ${zhAttached.report.missing.length} 条英文文案待翻译（node scripts/tools/zh-todo.js）`);
  }

  const indexFile = path.join(OUT, 'index.html');
  let html = fs.readFileSync(indexFile, 'utf8');

  console.log('\n=== 3) 预渲染静态骨架 ===');
  const renderCore = loadRenderCore(indexFile);
  checkLogoCoverage(renderCore, logoSet.logos);

  // 默认视图卡片：同时移除「加载数据中…」占位（预渲染内容已经可读）
  const rendered = renderDeals(renderCore, payload);
  html = replaceMarker(html, '<!--PRERENDER:deals-->', rendered.html);
  html = html.replace(/\s*<div class="loading">加载数据中…<\/div>/g, '');
  console.log(`  卡片预渲染: ${rendered.count} 条（${rendered.dist}）`);

  // 骨架的其余部分：筛选条计数、顶栏汇总、结果条、分类选项
  html = replaceMarker(html, '<!--PRERENDER:facets-->', rendered.facets);
  html = replaceMarker(html, '<!--PRERENDER:topstat-->', rendered.topStat);
  html = replaceMarker(html, '<!--PRERENDER:stats-->', rendered.stats);
  html = replaceMarker(html, '<!--PRERENDER:categories-->', rendered.categories);
  console.log(`  筛选条 / 汇总 / 分类选项: 已填充`);

  // 站点绝对地址：源码里不硬编码第二份 URL
  const urlSlots = html.split('__SITE_URL__').length - 1;
  html = html.split('__SITE_URL__').join(SITE_URL);
  console.log(`  站点地址替换: ${urlSlots} 处`);

  // FAQ 结构化数据：以页面可见文案为唯一来源
  const faqItems = extractFaq(html);
  console.log(`  FAQ 解析: ${faqItems.length} 条`);

  const jsonLd = buildJsonLd(faqItems, rendered.cards);
  html = replaceMarker(html, '<!--PRERENDER:jsonld-->', jsonLd);
  console.log(`  JSON-LD: ${(jsonLd.match(/application\/ld\+json/g) || []).length} 段`);

  // 标记必须全部消失——残留意味着某个替换静默失败了
  for (const marker of PRERENDER_MARKERS) {
    if (html.includes(marker)) throw new Error(`预渲染标记未被替换: ${marker}`);
  }

  // 页脚的「数据源状态」链接：站内相对路径在不同深度下不一样
  // （首页 `status/`、详情页 `../../status/`、状态页自己 `../status/`），
  // 所以源码里只有一处占位符，各自在写出前替换。这里先只处理**首页那一份**，
  // 详情页与状态页的替换在各自的写出函数里做（它们拿到的是同一份含占位符的 html）。
  fs.writeFileSync(indexFile, resolveRouteHrefs(html, ''), 'utf8');

  // OG 分享图。
  // 画完立刻自检（og-image.selfCheck）：点阵字模没有自动换行，排版一变文字就会被静默裁掉，
  // 而只查 PNG 头部与尺寸是看不出来的。自检失败直接抛出 → 组装中止、构建非 0 退出、
  // deploy.yml 不会发布。自检必须留在构建路径上——早先它只在 og-image.js 的 main() 里跑
  // （require.main === module 守卫），构建走的是 require，于是这一段从未被执行过。
  // 这里写的是暂存目录，所以这一抛不会碰到上一份 FINAL_OUT。（和下面 selfCheck() 的
  // 「返回 false」失败路径一样，两者都在替换输出目录之前。）
  const og = renderOgImage();
  fs.writeFileSync(path.join(OUT, 'og-image.png'), og);
  const ogStats = selfCheckOgImage(og);
  console.log(`  OG 分享图: ${(og.length / 1024).toFixed(1)} KB`);
  console.log(`    OG 自检: 标记 ${ogStats.white}px · 副标题 ${ogStats.pale}px · 底部说明 ${ogStats.faint}px`);

  // 独立详情页（每条优惠一个静态 URL）+ sitemap
  const lastmod = String(payload.updatedAt || '').slice(0, 10);
  const detailPages = writeDetailPages(payload, html, renderCore);
  console.log(`  详情页: ${detailPages.length} 个 → deal/<id>/index.html`);

  // 分类页（/student/ /developer/ /free-api/）：归属已在上面算好写进 dist/deals.json，
  // 这里只按同一份 `collections` 取条目 —— 不再重算一遍判据。
  const collectionPages = [];
  for (const spec of audience.COLLECTION_PAGES) {
    const matched = payload.deals.filter(deal => deal.type === 'deal' && (deal.collections || []).includes(spec.slug));
    const dir = path.join(OUT, spec.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'),
      renderCollectionPage(spec, matched, html, { lastmod }), 'utf8');
    collectionPages.push({ slug: spec.slug, title: spec.title, count: matched.length, url: `${SITE_URL}${spec.slug}/` });
  }
  console.log(`  分类页: ${collectionPages.map(p => `/${p.slug}/ ${p.count} 条`).join(' · ')}`);

  const dealUrls = detailPages.map(page => `  <url>
    <loc>${page.url}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`).join('\n');

  // 分类页进 sitemap，优先级高于详情页：它们是入口，详情页是叶子。
  const collectionUrls = collectionPages.map(page => `  <url>
    <loc>${page.url}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>`).join('\n');

  // 状态页也进 sitemap（五条既有约定的第三条，v1.1 收口补）。
  //
  // priority 0.3 **低于**详情页 0.7，也低于分类页 0.9：它是给维护者与技术读者核对
  // 「本站还在不在更新」的工具页，不是搜索入口。给它 0.9 会把「哪一页才是入口」说反 ——
  // priority 是**声明**，不是排序实现的细节。
  const statusUrl = `  <url>
    <loc>${SITE_URL}status/</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.3</priority>
  </url>`;

  fs.writeFileSync(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE_URL}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
${collectionUrls}
${statusUrl}
${dealUrls}
</urlset>
`, 'utf8');

  // 订阅：RSS 2.0 + JSON Feed（构建期生成，零依赖）
  const feeds = renderFeeds(payload);
  fs.writeFileSync(path.join(OUT, 'feed.xml'), feeds.rss, 'utf8');
  fs.writeFileSync(path.join(OUT, 'feed.json'), feeds.json, 'utf8');
  console.log(`  订阅产物: feed.xml + feed.json（各 ${feeds.count} 条）`);

  // 数据源状态：把采集写入的心跳文件发布出去（机器可读），并生成一页可读的 /status/。
  // 文件缺失（还没跑过一次成功采集）时生成「暂无数据」页，而不是让构建失败——
  // 一份状态页缺席不该阻断发布。
  const healthStore = health.load();
  const healthDoc = healthStore.missing || healthStore.broken ? health.emptyDoc() : healthStore.doc;
  if (healthStore.broken) console.log(`  ⚠️  ${health.HEALTH_FILE} 解析失败：${healthStore.broken}（状态页按无数据渲染）`);
  fs.writeFileSync(path.join(OUT, 'source-health.json'), `${JSON.stringify(healthDoc, null, 2)}\n`, 'utf8');
  const statusDir = path.join(OUT, 'status');
  fs.mkdirSync(statusDir, { recursive: true });
  fs.writeFileSync(path.join(statusDir, 'index.html'), renderStatusPage(healthDoc, html), 'utf8');
  const healthSummary = health.summarize(healthDoc);
  console.log(`  数据源状态: source-health.json + status/index.html（${healthSummary.total} 个来源：` +
    `正常 ${healthSummary.healthy} · 异常 ${healthSummary.degraded} · 失败 ${healthSummary.failed}）`);

  // 交给自检：折叠覆盖的条目总数需与页面卡片内容对得上；译文条数用于产物回读比对
  return Object.assign({}, rendered, {
    zhWithZh: zhAttached.report.withZh,
    healthSources: healthSummary.total,
    healthStatusText: healthSummary.rows.map(row => `${row.source}=${row.status}`).join(','),
    // 分类页交给自检做**逐条回读对账**：文件存在不算数，页面上的条目集合
    // 必须与 dist/deals.json 里 `collections` 的筛选结果逐个 id 对得上。
    collectionPages
  });
}

function selfCheck(built) {
  console.log('\n=== 4) 产物自检 ===');
  let failed = 0;
  const fail = (message) => { console.log('  ✗ ' + message); failed++; };

  for (const file of [...PUBLIC_FILES, ...GENERATED_FILES]) {
    const ok = fs.existsSync(path.join(OUT, file));
    console.log(`  ${ok ? '✓' : '✗'} ${file}`);
    if (!ok) failed++;
  }

  // logo 资产：目录存在、文件数与 manifest 对得上、CSS 里每条规则都有对应文件
  const logoDir = path.join(OUT, 'logos');
  if (!fs.existsSync(logoDir)) fail('缺少 logos/ 目录');
  else {
    const sheet = fs.readFileSync(path.join(OUT, 'logos.css'), 'utf8');
    const rules = [...new Set([...sheet.matchAll(/^\.lg\[data-logo="([^"]+)"\]\{/gm)].map(m => m[1]))];
    const missing = rules.filter(key => !fs.existsSync(path.join(logoDir, `${key}.svg`)) &&
      !fs.existsSync(path.join(logoDir, `${key}.png`)));
    if (!rules.length) fail('logos.css 里没有任何 logo 规则');
    else if (missing.length) fail(`logos.css 引用了不存在的图形: ${missing.join(', ')}`);
    else console.log(`  ✓ logo: ${rules.length} 条规则 → logos/ ${fs.readdirSync(logoDir).length} 个文件`);
  }

  const payload = JSON.parse(fs.readFileSync(path.join(OUT, 'deals.json'), 'utf8'));
  console.log(`  deals.json: schemaVersion=${payload.schemaVersion}, count=${payload.count}, updatedAt=${payload.updatedAt}`);
  if (payload.schemaVersion !== 2) fail('schemaVersion 不是 2');
  if (payload.count !== payload.deals.length) fail('count 与 deals 长度不一致');

  // ---- 源数据 vs 发布数据的一致性门禁（v1.0 就记着的债，v1.1 收口补上）----
  //
  // 为什么必须有：`dist/deals.json` 是**发布出去的那一份** —— 浏览器 fetch 的是它，
  // 首页的每个数字、每张卡片都从它来。而在此之前，没有任何东西比对过它与源 `deals.json`：
  // 构建只断言了它的几个**属性**（schemaVersion / count），属性对了而**内容**是旧的、
  // 或者少了一批字段，照样发布。v1.0 的报告里就记着这条债，一直没还。
  //
  // 口径：dist 必须**恰好等于** 源 + 构建期**声明过的**变换，多一个字段少一个字段都算不一致。
  //   ① `collections` —— 构建期算出的分类归属（**只增**的派生字段）
  //   ② `zh`         —— 中文译文覆盖层。⚠️ 它**不是只增**：覆盖层会按指纹停用「原文已变」
  //      的译文、也会把撤回的译文从产物里去掉（`selftest:zh` 的两个用例正是这两件事）。
  //      所以它**不比字节**，只断言「不多出别的字段」；译文自身的正确性由它自己的门禁管
  //      （构建期的 zh 断言：译文没写进产物 / 译文顶掉了英文原文；以及 `check:zh` 的漂移检查）。
  //
  // ⚠️ 第一版把 `zh` 也按字节比了，于是 `selftest:zh` 的两个用例当场变红 ——
  // 那不是译文坏了，是**这条门禁对 `zh` 的语义断言错了**：它假设覆盖层只增不减。
  // 一个把正常行为判成失败的守卫，比没有守卫更糟（它会被绕过或被改松）。
  const BUILD_ADDED = new Set(['collections']);
  const BUILD_MANAGED = new Set(['zh']);
  {
    const source = JSON.parse(fs.readFileSync(path.join(ROOT, 'deals.json'), 'utf8'));
    const problems = [];
    if (source.schemaVersion !== payload.schemaVersion) problems.push('schemaVersion 不一致');
    if (source.updatedAt !== payload.updatedAt) problems.push(`updatedAt 不一致（源 ${source.updatedAt} / 产物 ${payload.updatedAt}）`);
    if (source.count !== payload.count) problems.push(`count 不一致（源 ${source.count} / 产物 ${payload.count}）`);
    if (source.deals.length !== payload.deals.length) {
      problems.push(`条目数不一致（源 ${source.deals.length} / 产物 ${payload.deals.length}）`);
    } else {
      for (let i = 0; i < source.deals.length; i++) {
        const a = source.deals[i];
        const b = payload.deals[i];
        if (a.id !== b.id) { problems.push(`第 ${i} 条 id 不一致（${a.id} / ${b.id}）`); break; }
        for (const key of Object.keys(a)) {
          if (BUILD_MANAGED.has(key)) continue;
          if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) {
            problems.push(`${a.id} 的 ${key} 与源不一致`);
            break;
          }
        }
        for (const key of Object.keys(b)) {
          if (!(key in a) && !BUILD_ADDED.has(key) && !BUILD_MANAGED.has(key)) {
            problems.push(`${a.id} 多了源里没有的字段 ${key}`);
            break;
          }
        }
        if (problems.length > 8) break;
      }
    }
    if (problems.length) fail(`deals.json 与发布产物不一致：${problems.slice(0, 8).join('；')}`);
    else console.log(`  ✓ 源/产物一致: ${payload.deals.length} 条逐字段相同（构建期只动 zh / collections）`);
  }

  // 数据源状态页：与 source-health.json 逐个来源对账（状态标签、条数、行数），
  // 而不是只看「文件存在」——状态页最容易的坏法是「页面上写着正常，数据里其实是失败」。
  const statusFile = path.join(OUT, 'status', 'index.html');
  if (!fs.existsSync(statusFile)) fail('缺少 status/index.html');
  else {
    const page = fs.readFileSync(statusFile, 'utf8');
    const doc = JSON.parse(fs.readFileSync(path.join(OUT, 'source-health.json'), 'utf8'));
    const summary = health.summarize(doc);
    const rows = [...page.matchAll(/<span class="stt ([a-z]+)">/g)].map(m => m[1]);
    const problems = [];
    if (summary.total !== built.healthSources) {
      problems.push(`来源数不一致：产物里 ${rows.length} 行 / 数据里 ${summary.total} 个`);
    }
    for (const row of summary.rows) {
      const expected = health.STATUS_LABEL[row.status];
      if (!page.includes(expected)) problems.push(`${row.source} 的状态标签 ${expected} 不在页面上`);
    }
    const expectedStatuses = summary.rows.map(row => row.status).sort().join(',');
    if (rows.slice().sort().join(',') !== expectedStatuses) {
      problems.push(`状态序列不一致：页面 ${rows.join(',')} / 数据 ${expectedStatuses}`);
    }
    if (summary.total > 0 && !/<time datetime="[^"]*"/.test(page)) {
      problems.push('状态页没有任何 <time datetime>（无 JS 时可读性依赖它）');
    }
    if (summary.total === 0 && !/还没有采集记录/.test(page)) {
      problems.push('没有采集数据时，状态页必须明说，而不是给一张空表');
    }
    if (!page.includes('source-health.json')) problems.push('状态页没有指向 source-health.json 的链接');

    // ── 五条既有约定：这一页原先只满足两条（预渲染、无 JS 可读）────────────────
    //
    // 为什么必须在这里断言：sitemap / feed / JSON-LD 三条当时根本没做，而
    // **没有任何东西会因此变红** —— 连 `verify-site.js` 都 0 处覆盖（子代理核查结论）。
    // 一条「写漏了不会红」的约定等于没有这条约定：它靠记性维持，而记性不随构建变红。
    // 分类页那三条能站住，靠的就是这一段形状的自检 + 浏览器侧各一条断言。
    if (!page.includes(`<link rel="canonical" href="${SITE_URL}status/">`)) problems.push('canonical 不是自指');
    if (!page.includes('href="../feed.xml"') || !page.includes('href="../feed.json"')) {
      problems.push('没有声明两个订阅源');
    }
    let statusLd = [];
    try {
      statusLd = [...page.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
        .map(m => JSON.parse(m[1])['@type']);
    } catch (error) {
      problems.push(`JSON-LD 解析失败: ${error.message}`);
    }
    for (const need of ['WebPage', 'BreadcrumbList']) {
      if (!statusLd.includes(need)) problems.push(`缺少 JSON-LD ${need}`);
    }
    // 「多了」也要拦，而且要拦得完整（重复的 WebPage 也算多）。
    //
    // §10.4.1 明确写了这一页**不发** Dataset / ItemList，理由是「机器可读的那一份是
    // source-health.json，同一份事实声明两次、两次迟早分家，而分家时没有任何东西会红」。
    // 只断言「包含」的话，那句话本身就是一句没有守卫的承诺 —— 加第三个 JSON-LD
    // （乃至加一个 Dataset）谁都不会发现。独立验证代理指出的正是这一点。
    const STATUS_LD_EXPECTED = ['BreadcrumbList', 'WebPage'];
    const statusLdActual = statusLd.slice().sort();
    if (JSON.stringify(statusLdActual) !== JSON.stringify(STATUS_LD_EXPECTED)) {
      problems.push(`JSON-LD 集合不是恰好 [${STATUS_LD_EXPECTED.join(', ')}]，实得 [${statusLdActual.join(', ')}]`);
    }
    // 预渲染正文的**下限按状态分档**，两个数字都取自实测的**内容**长度（剥掉 style 之后）：
    //   · 9 个来源、表格正常 → 1188 字
    //   · 一个来源都没有（合法状态）→ 646 字，页面明说「还没有采集记录」
    //   · 有来源但**表格没渲染出来** → 约 600 字（页头页脚 + 说明段，表体是空的）
    //
    // 所以「有来源」那一档取 **900**：它必须**高于**表格消失时的字数，否则这条断言
    // 在「表没了」这个最该红的情况下只差几个字就放行（第一版取 600，正好卡在边界上 ——
    // 反证时实测到的）。空数据那一档取 350：它只需证明「页面不是空的」。
    const statusText = prerenderedText(page);
    const statusFloor = summary.total > 0 ? 900 : 350;
    if (statusText.length < statusFloor) {
      problems.push(`预渲染正文过短（内容 ${statusText.length} 字 < ${statusFloor}），无 JS 时读不到内容`);
    }
    // 光有长度不算数：内容里必须真的有那张表。这条与上面的字数是**互相独立**的两件事 ——
    // 字数够而表是空的，说明渲染路径断了；表在而字数不够，说明文案被丢了。
    // ⚠️ 先把 `<script>` 摘掉再取 tbody：本文件自己的纪律是「数标记先摘 script」，
    //    不摘的话，将来某个内联脚本里出现 `<tbody>…<tr>…</tr>…</tbody>` 就会让这条断言
    //    变成**永远为真**的空转（独立验证代理指出这一点）。
    const statusBody = (page.replace(/<script[\s\S]*?<\/script>/gi, '').match(/<tbody>([\s\S]*?)<\/tbody>/) || [])[1] || '';
    if (summary.total > 0 && !/<tr>/.test(statusBody)) {
      problems.push('预渲染正文够长，但 <tbody> 里一行都没有（表格没渲染出来）');
    }
    if (ROUTE_MARKERS.some(marker => page.includes(marker))) problems.push('残留路由占位符');
    if (problems.length) fail(`数据源状态页：${problems.join('；')}`);
    else console.log(`  ✓ 数据源状态: ${summary.total} 个来源与 source-health.json 逐个对账一致` +
      `（正常 ${summary.healthy} · 异常 ${summary.degraded} · 失败 ${summary.failed}）` +
      ` · 五条约定齐（sitemap/canonical/双 feed/JSON-LD ${statusLd.length} 段/预渲染 ${statusText.length} 字）`);
  }

  // 译文必须真的落到产物里：浏览器 fetch('deals.json') 拿的就是这一份，
  // 这里漏写不会报错，只会让线上详情页静悄悄没有中文。
  const zhDeals = payload.deals.filter(deal => deal.zh && Object.keys(deal.zh).length);
  const zhFields = zhDeals.reduce((n, deal) => n + Object.keys(deal.zh).length, 0);
  if (zhDeals.length !== built.zhWithZh) {
    fail(`译文没写进产物：贴了 ${built.zhWithZh} 条，产物里只有 ${zhDeals.length} 条`);
  } else if (zhDeals.length) {
    // 英文原文必须原样保留：译文只能新增字段，不能顶掉原文
    const clobbered = zhDeals.filter((deal, i) => {
      return Object.keys(deal.zh).some(key => {
        const value = deal[key];
        return typeof value !== 'string' || !value.trim();
      });
    });
    if (clobbered.length) fail(`译文顶掉了英文原文: ${clobbered.slice(0, 3).map(d => d.title).join('、')}`);
    else console.log(`  ✓ 中文译文: ${zhDeals.length} 条 / ${zhFields} 个字段（英文原文原样保留）`);
  }
  const markCount = ((fs.readFileSync(path.join(OUT, 'index.html'), 'utf8')
    .replace(/<script[\s\S]*?<\/script>/gi, '').match(/class="zhmark"/g)) || []).length;
  if (zhDeals.length && !markCount) fail('有译文但预渲染卡片上没有「中文」提示');
  if (markCount) console.log(`  ✓ 卡片「中文」提示: 预渲染 ${markCount} 处`);

  // 产物里不该出现源码/依赖/文档
  for (const forbidden of ['scripts', 'node_modules', 'package.json', 'package-lock.json', '.git', '.github', 'PROJECT_STATUS.md', 'README.md']) {
    if (fs.existsSync(path.join(OUT, forbidden))) fail(`产物中不应出现 ${forbidden}`);
  }

  // --- 预渲染与 SEO 自检 ---
  const html = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
  // 内联脚本里含模板字符串字面量（class="go" / data-logo="…" 之类），
  // 数标记时必须先把 <script> 摘掉，否则会把源码当成已渲染的卡片数进去。
  //
  // `<style>` 同样要摘掉，而且**必须**摘：样式注释里写到某个控件标记（例如
  // 「实测 data-fav-prune 只在有失效收藏时出现」）时，标记扫描会把注释当成控件本身——
  // 本次就是这么假失败过一次。这与下面 tier 计数那次踩的是同一个坑
  // （CSS 选择器 `[data-tier="1"] .rnum` 被算成档位角标）：**要数的是元素，不是文本。**
  const markup = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');

  if (/PRERENDER:/.test(html)) fail('产物 index.html 仍残留 PRERENDER 标记');
  if (/__SITE_URL__/.test(html)) fail('产物 index.html 仍残留 __SITE_URL__ 占位');
  {
    // 页脚链接的占位符必须被各自那一份替换掉：残留会变成一条 404 的死链。
    //
    // 扫描面 = **全部输出深度 × 全部路由占位符**（`ROUTE_HREFS` / `ROUTE_MARKERS` 同源）。
    // 原先只查 `__STATUS_HREF__`，而且只抽查首页 / 状态页 / 详情页三处 ——
    // 于是加一条路由时「漏了某一层」不会有任何东西变红，直到有人正好从那一层点页脚。
    // 现在两层都做成结构性检查：漏一层、漏一条路由，都会指名道姓地报出来。
    const indexHtml = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
    const dealDirs = fs.existsSync(path.join(OUT, 'deal')) ? fs.readdirSync(path.join(OUT, 'deal')) : [];
    const routeOutputs = [
      ['index.html', ''],
      ['status/index.html', '../'],
      ...built.collectionPages.map(page => [`${page.slug}/index.html`, '../']),
      ...dealDirs.map(id => [`deal/${id}/index.html`, '../../'])
    ];
    const leftovers = [];
    for (const [rel, prefix] of routeOutputs) {
      const file = path.join(OUT, rel);
      if (!fs.existsSync(file)) { leftovers.push(`${rel}（文件缺失）`); continue; }
      const page = fs.readFileSync(file, 'utf8');
      for (const marker of ROUTE_MARKERS) {
        if (page.includes(marker)) leftovers.push(`${rel} 残留 ${marker}`);
      }
      // 正向断言：每一条路由都必须按**这一层**的深度解析出来。
      // 只查「没有残留」是不够的 —— 把整行页脚删掉同样没有残留。
      for (const [, target] of ROUTE_HREFS) {
        if (!page.includes(`href="${prefix}${target}"`)) leftovers.push(`${rel} 缺少 ${prefix}${target} 的链接`);
      }
    }
    if (leftovers.length) {
      fail(`页脚路由链接不对（残留占位符或深度前缀错误）：${leftovers.slice(0, 6).join('、')}` +
        `${leftovers.length > 6 ? ` 等 ${leftovers.length} 处` : ''}`);
    } else {
      console.log(`  ✓ 页脚路由链接: ${ROUTE_HREFS.length} 条路由 × ${routeOutputs.length} 个输出，深度前缀与去占位逐项对账`);
    }

    // 作者写的正文里不许残留 Markdown 记号 —— 它是**直接写进 HTML 的**，不是 Markdown。
    //
    // 为什么要有这条：`audience.js` 的 `why` 与状态页/分类页的正文都曾把强调写成 `**这样**`、
    // 把字段名写成 `` `这样` ``，于是 **16 个 `**` 与 14 个反引号原样出现在读者眼前**
    // （独立验证代理在 4 类页面上数出来的），而没有任何门禁会因此变红。
    // 更糟的是「预渲染正文过短」那条长度断言还把星号当成内容算进去了 ——
    // 一条在数自己造成的排版噪声的守卫。
    //
    // 扫描面刻意收在**作者写的容器**（`.snote` / `<caption>`）里，而不是整页文本：
    // 采集来的文案（标题 / discountInfo）里出现 `**` 或反引号是**数据**，不是我们的排版错误；
    // 拿它判红会变成一条「在正常数据上失败」的守卫，而那比没有守卫更糟。
    const mdMarkers = [];
    for (const [rel] of routeOutputs) {
      const file = path.join(OUT, rel);
      if (!fs.existsSync(file)) continue;
      const page = fs.readFileSync(file, 'utf8');
      const prose = [
        ...[...page.matchAll(/<p class="snote"[^>]*>([\s\S]*?)<\/p>/g)].map(m => m[1]),
        ...[...page.matchAll(/<caption>([\s\S]*?)<\/caption>/g)].map(m => m[1])
      ].map(chunk => chunk.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
      for (const chunk of prose) {
        const stars = (chunk.match(/\*\*/g) || []).length;
        const ticks = (chunk.match(/`/g) || []).length;
        if (stars || ticks) {
          mdMarkers.push(`${rel}（**×${stars} · 反引号×${ticks}）：${chunk.slice(0, 50)}…`);
        }
      }
    }
    if (mdMarkers.length) {
      fail(`作者正文里残留 Markdown 记号（读者会原样看到）：${mdMarkers.slice(0, 4).join('；')}`);
    } else {
      console.log('  ✓ 作者正文无 Markdown 记号: .snote / <caption> 里的强调一律用 <b>，字段名直接写');
    }
  }

  const cardCount = (markup.match(/<article class="g /g) || []).length;
  if (cardCount < MIN_PRERENDERED_CARDS) {
    fail(`预渲染卡片 ${cardCount} 条 < ${MIN_PRERENDERED_CARDS}`);
  } else {
    console.log(`  ✓ 预渲染卡片: ${cardCount} 条`);
  }

  // 分档分带：默认按力度排序，五档里有卡片的档必须都有带
  const tierHeads = [...markup.matchAll(/<div class="tierhead t(\d)"[^>]*>/g)].map(m => Number(m[1]));
  // 只在**卡片本体**里数 data-tier：早先是在整份 markup 里数，于是 CSS 里
  // `[data-tier="1"] .rnum { … }` 这类选择器会被算成「档位角标」，一加样式就假失败。
  const cardChunks = markup.split('<article class="g ').slice(1).map(chunk => chunk.split('</article>')[0]);
  const tierDots = cardChunks.filter(chunk => /data-tier="\d"/.test(chunk)).length;
  if (built) {
    const expected = new Set(built.cards.map(card => card.tier));
    const missingTier = [...expected].filter(tier => !tierHeads.includes(tier));
    if (missingTier.length) fail(`档位 ${missingTier.join(', ')} 有卡片但缺少分带标题`);
    else if (tierDots !== cardCount) fail(`带档位角标的卡片 ${tierDots} 张 ≠ 卡片 ${cardCount} 条`);
    else console.log(`  ✓ 力度分带: ${tierHeads.length} 档（${built.dist}）`);
  }

  // 厂商 logo：卡片上的 data-logo 必须都能在产物里找到图形文件
  const tileKeys = [...new Set([...markup.matchAll(/data-logo="([^"]+)"/g)].map(m => m[1]))];
  const brokenLogos = tileKeys.filter(key => !fs.existsSync(path.join(logoDir, `${key}.svg`)) &&
    !fs.existsSync(path.join(logoDir, `${key}.png`)));
  const textTiles = (markup.match(/class="lg text"/g) || []).length;
  if (brokenLogos.length) fail(`卡片引用了产物里不存在的 logo: ${brokenLogos.join(', ')}`);
  else console.log(`  ✓ 卡片 logo: 官方图形 ${tileKeys.length} 个 / 名称缩写兜底 ${textTiles} 个`);

  // 「官方图形」与「名称缩写兜底」必须二选一：混在同一张卡上会让人以为缩写块也是官方 logo
  const cardsMarkup = markup.split('<article class="g ').slice(1).map(chunk => chunk.split('</article>')[0]);
  const mixed = cardsMarkup.filter(card => /data-logo="/.test(card) && /class="lg text"/.test(card)).length;
  if (mixed) fail(`有 ${mixed} 张卡片同时出现官方图形与名称缩写块（应二选一）`);
  else console.log(`  ✓ 图形与缩写不混用: ${cardsMarkup.length} 张卡片均为二选一`);

  // 骨架的其余部分不能留空
  if (/<!--PRERENDER:/.test(html)) fail('产物仍有未替换的预渲染标记');
  const facetCount = (markup.match(/data-facet="/g) || []).length;
  if (facetCount < 4) fail(`筛选条只有 ${facetCount} 个按钮（预渲染失败）`);
  else console.log(`  ✓ 筛选条: ${facetCount} 个 facet 按钮`);

  // 同页锚点：导航里的 #tier-N 必须在预渲染正文里有对应 id，否则就是死锚点
  const anchors = [...markup.matchAll(/href="#(tier-\d)"/g)].map(m => m[1]);
  const dangling = anchors.filter(id => !markup.includes(`id="${id}"`));
  if (!anchors.length) fail('找不到「跳到档位」锚点');
  else if (dangling.length) fail(`锚点没有落点：${[...new Set(dangling)].join(', ')}`);
  else console.log(`  ✓ 同页锚点: ${[...new Set(anchors)].length} 个都有落点`);

  // 收藏 / 对比（G11）：预渲染的 HTML 里**一个控件都不能有**。
  // 整块由 JS 建 DOM（星标挂在卡片上、对比条与对比弹层都是 createElement），
  // 所以无 JS 时页面上连一个「点了没反应」的死按钮都不存在——这是 PLAN.md G11 的硬要求，
  // 在这里用产物本身证明，而不是靠人读代码相信。
  //
  // 标记要写得足够具体：`.cmpbar` / `.fav` 这类**类名**在 <style> 里本来就有
  // （样式块不属于 markup），拿类名去找必然假失败——要找的是「控件元素」本身。
  // `data-fav-open`（收藏入口）/ `data-fav-prune`（清理失效收藏）与星标同源：
  // 收藏入口按「本机收藏数 > 0」才渲染，而构建期没有 localStorage ⇒ 预渲染里必然是零。
  const g11Controls = ['data-fav-toggle', 'data-fav=', 'data-fav-open', 'data-fav-prune',
    'data-cmp-open', 'data-cmp-clear', 'data-cmp-remove', 'class="cmpbar"', 'id="cmpbar"', 'id="compare"'];
  const g11Leaked = g11Controls.filter(token => markup.includes(token));
  if (g11Leaked.length) fail(`预渲染 HTML 里出现了收藏/对比控件（无 JS 时的死按钮）: ${g11Leaked.join(', ')}`);
  else console.log('  ✓ 收藏/对比: 预渲染 HTML 零控件（整块由 JS 建，无 JS 时不给可点暗示）');

  // 字段与表头口径：JS 里写死「最多 4 条」，产物自检跟着对一遍，避免两处漂移
  if (!/const CMP_MAX = 4;/.test(html)) fail('index.html 里找不到 const CMP_MAX = 4（对比上限口径变了？）');
  else console.log('  ✓ 对比上限: CMP_MAX = 4（与页脚提示文案同源）');

  // 纠错入口：详情弹层是 JS 渲染的（与弹层本身一致），所以这里只断言模板存在，
  // 真实行为（点开详情能看到带 id 的 Issue 链接）由 verify-site.js 在浏览器里验。
  if (!/issues\/new\?title=/.test(html)) fail('详情模板里没有纠错入口');
  else console.log('  ✓ 纠错入口: 详情模板已内置（真实行为由 npm run verify 验）');

  // 只在「已渲染的卡片」里数，避免把内联脚本里的模板字符串字面量也算进去
  // （cardHtml 的源码里含有 class="go" / data-model-count 这些字面量）。
  const ctaCount = (markup.match(/class="go" href="https?:/g) || []).length;
  console.log(`  ✓ 官方页入口: ${ctaCount} 个`);
  if (ctaCount < cardCount) fail(`官方页入口 ${ctaCount} 个少于卡片 ${cardCount} 条`);

  // 首页内链：标题指向站内详情页（可索引、可内链），CTA 仍直达官方页
  const titleHrefs = [...markup.matchAll(/<h3><a href="([^"]+)"/g)].map(m => m[1]);
  const toDetail = titleHrefs.filter(href => href.startsWith('deal/')).length;
  if (!titleHrefs.length) fail('首页没有卡片标题链接');
  else if (toDetail !== titleHrefs.length) fail(`首页标题链接有 ${titleHrefs.length - toDetail} 个没指向站内详情页`);
  else console.log(`  ✓ 首页内链: ${toDetail} 个标题链接全部指向站内详情页（CTA 仍指官方）`);

  // 独立详情页：数量、canonical 自指、静态正文、纯静态（不拉数据）、sitemap 一致
  const dealEntries = payload.deals.filter(deal => deal.type === 'deal' && deal.id);
  const detailRoot = path.join(OUT, 'deal');
  const detailDirs = fs.existsSync(detailRoot)
    ? fs.readdirSync(detailRoot, { withFileTypes: true }).filter(entry => entry.isDirectory()).length
    : 0;
  if (detailDirs !== dealEntries.length) fail(`详情页 ${detailDirs} 个 ≠ type=deal ${dealEntries.length} 条`);
  else console.log(`  ✓ 详情页数量: ${detailDirs} 个（= type=deal 条数）`);

  const sitemapLocs = [...fs.readFileSync(path.join(OUT, 'sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map(match => match[1]);
  // ⚠️ 这里的算术**必须把分类页与状态页算进去**。原先写死 `dealEntries.length + 1`，
  // 加任何一条 URL 都会让构建直接失败 —— 这是刻意的硬门禁（sitemap 是发布面），
  // 所以新增路由时改这里不是「为了让测试通过」，而是契约变更的显式落点。
  //
  // 每一项都写成自述的：数字对不上时，报错信息里的分项就是排查路径。
  const expectedLocs = dealEntries.length + 1 /* 首页 */ + built.collectionPages.length + 1 /* 状态页 */;
  if (sitemapLocs.length !== expectedLocs) {
    fail(`sitemap ${sitemapLocs.length} 条 ≠ 首页 1 + 分类页 ${built.collectionPages.length} + 状态页 1 + 详情页 ${dealEntries.length}`);
  } else {
    const notListed = dealEntries.filter(deal => !sitemapLocs.some(loc => loc.endsWith(`/deal/${encodeURIComponent(deal.id)}/`)));
    const collectionsNotListed = built.collectionPages.filter(page => !sitemapLocs.includes(page.url));
    if (notListed.length) fail(`sitemap 漏了 ${notListed.length} 个详情页`);
    else if (collectionsNotListed.length) fail(`sitemap 漏了分类页: ${collectionsNotListed.map(p => p.slug).join(', ')}`);
    else if (!sitemapLocs.includes(`${SITE_URL}status/`)) fail('sitemap 漏了状态页 status/');
    else console.log(`  ✓ sitemap: ${sitemapLocs.length} 条（首页 + ${built.collectionPages.length} 个分类页 + 状态页 + ${dealEntries.length} 个详情页，无遗漏）`);
  }

  // 分类页：**逐条回读对账**，而不是「文件存在就算过」。
  //
  // 与 /status/ 同一套机制（读回产物 + 与机器可读的那份对账），但断言更硬：
  //   · 表格里的详情页链接集合 == dist/deals.json 里 `collections` 筛出来的 id 集合
  //   · 每个分类页都要有 canonical 自指、要声明两个 feed、要有三段 JSON-LD（含 BreadcrumbList）
  //   · 无 JS 可读：表格是构建期写的，正文长度必须够
  // 为什么 jsonld / feed 要有断言：`/status/` 那页恰恰是「有五条约定里的两条」——
  // 没有断言的三条，写漏了不会有任何东西红（子代理核查结论）。新路由不重复那个模式。
  {
    const problems = [];
    const published = JSON.parse(fs.readFileSync(path.join(OUT, 'deals.json'), 'utf8'));
    const publishedById = new Map(published.deals.map(deal => [deal.id, deal]));
    for (const page of built.collectionPages) {
      const file = path.join(OUT, page.slug, 'index.html');
      if (!fs.existsSync(file)) { problems.push(`缺少 ${page.slug}/index.html`); continue; }
      const body = fs.readFileSync(file, 'utf8');

      // ① 条目集合逐个 id 对账（页面 → 数据 与 数据 → 页面 两个方向）
      const onPage = new Set([...body.matchAll(/href="\.\.\/deal\/([^/"]+)\/"/g)].map(m => decodeURIComponent(m[1])));
      const expected = new Set(published.deals
        .filter(deal => deal.type === 'deal' && (deal.collections || []).includes(page.slug))
        .map(deal => deal.id));
      const missing = [...expected].filter(id => !onPage.has(id));
      const extra = [...onPage].filter(id => !expected.has(id));
      if (missing.length) problems.push(`${page.slug}/ 漏了 ${missing.length} 条（如 ${missing.slice(0, 3).join(', ')}）`);
      if (extra.length) problems.push(`${page.slug}/ 多了 ${extra.length} 条不该在这个分类里的（如 ${extra.slice(0, 3).join(', ')}）`);
      if (page.count !== expected.size) problems.push(`${page.slug}/ 报告条数 ${page.count} ≠ 数据 ${expected.size}`);

      // ② 该有的元信息一个都不能少
      if (!body.includes(`<link rel="canonical" href="${SITE_URL}${page.slug}/">`)) problems.push(`${page.slug}/ canonical 不是自指`);
      if (!body.includes('href="../feed.xml"') || !body.includes('href="../feed.json"')) problems.push(`${page.slug}/ 没有声明订阅源`);
      let ldTypes = [];
      try {
        ldTypes = [...body.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
          .map(m => JSON.parse(m[1])['@type']);
      } catch (error) {
        problems.push(`${page.slug}/ JSON-LD 解析失败: ${error.message}`);
      }
      for (const need of ['CollectionPage', 'BreadcrumbList', 'ItemList']) {
        if (!ldTypes.includes(need)) problems.push(`${page.slug}/ 缺少 JSON-LD ${need}`);
      }
      // 「多了」同样要拦：只断言「包含」的话，多出一段不属于本页类型的结构化数据
      // （比如把状态页的 WebPage 抄过来、或给目录页发 Dataset）不会有任何东西变红。
      const COLLECTION_LD_EXPECTED = ['BreadcrumbList', 'CollectionPage', 'ItemList'];
      const ldActual = ldTypes.slice().sort();
      if (JSON.stringify(ldActual) !== JSON.stringify(COLLECTION_LD_EXPECTED)) {
        problems.push(`${page.slug}/ JSON-LD 集合不是恰好 [${COLLECTION_LD_EXPECTED.join(', ')}]，实得 [${ldActual.join(', ')}]`);
      }
      // ③ 预渲染正文（无 JS 可读）：表格是构建期写死的。
      //    阈值**按条目数成比例**，不是常数。常数版本连续踩了两次：
      //      · 第一版只剥 `<script>`，量到的 4 万字里 38950 是 CSS（等于没量）；
      //      · 改成量内容后取常数 500，而**表体空掉**时实测 610 / 659 / 691 字
      //        （/developer/ /free-api/ /student/）—— 全部大于 500，**照样放行**。
      //    实测每条约 90–100 字（/student/ 12 行 1884 · /developer/ 67 行 6593 ·
      //    /free-api/ 45 行 4820），页头页脚等固定部分约 650 字。取 60 字/条留余量：
      //    条目越多阈值越紧，而「表体空掉」在 count>0 时必然低于它。
      const text = prerenderedText(body);
      const textFloor = 600 + 60 * page.count;
      if (text.length < textFloor) {
        problems.push(`${page.slug}/ 预渲染正文过短（内容 ${text.length} 字 < ${textFloor} = 600 + 60×${page.count}）`);
      }
      // 结构断言与上面的字数是**互相独立**的两件事：字数够而表是空的，说明渲染路径断了。
      // ⚠️ 先把 `<script>` 摘掉再取 tbody（本文件自己的纪律：数标记先摘 script）——
      //    不摘的话，将来某个内联脚本里出现 `<tbody>…</tbody>` 就会让这条断言永远为真。
      const bodyNoScript = body.replace(/<script[\s\S]*?<\/script>/gi, '');
      const tbody = (bodyNoScript.match(/<tbody>([\s\S]*?)<\/tbody>/) || [])[1] || '';
      if (page.count > 0 && !/href="\.\.\/deal\//.test(tbody)) {
        problems.push(`${page.slug}/ <tbody> 里一个详情页链接都没有（表格没渲染出来）`);
      }
      if (/__[A-Z_]+_HREF__/.test(body)) problems.push(`${page.slug}/ 残留路由占位符`);
      // ④ 三态措辞：不许把「没有依据」写成「不可用」
      if (/中国大陆[^。；]{0,12}不可用/.test(body) && !/尚未确认/.test(body)) {
        problems.push(`${page.slug}/ 出现了「不可用」却没有任何「尚未确认」——三态措辞可能被压平`);
      }
    }

    // ⑤ 首页筛选器的分类入口必须与分类页注册表**逐个 slug 对齐**。
    //
    // 判据不重复（前端读的是数据），但「有哪些分类」这件事在两处各写了一份：
    // 一处是 `audience.COLLECTION_PAGES`（生成页面），一处是 index.html 的
    // `COLLECTION_FACETS`（渲染按钮）。写错 slug、漏一个、多一个 ——
    // 症状分别是「点了没反应」「入口消失」，两边都不会报错。所以在这里对齐一次。
    const facetBlock = (html.match(/const COLLECTION_FACETS = \[([\s\S]*?)\];/) || ['', ''])[1];
    if (!facetBlock) {
      problems.push('index.html 里找不到 COLLECTION_FACETS（首页分类入口没了？）');
    } else {
      const facetKeys = [...facetBlock.matchAll(/key:\s*'([^']+)'/g)].map(m => m[1]);
      const expectedSlugs = audience.COLLECTION_PAGES.map(page => page.slug);
      const missing = expectedSlugs.filter(slug => !facetKeys.includes(slug));
      const extra = facetKeys.filter(slug => !expectedSlugs.includes(slug));
      if (missing.length) problems.push(`首页筛选器缺少分类入口: ${missing.join(', ')}`);
      if (extra.length) problems.push(`首页筛选器有分类页注册表里没有的入口: ${extra.join(', ')}`);
    }
    if (problems.length) fail(`分类页: ${problems.slice(0, 6).join('；')}`);
    else {
      const summary = built.collectionPages.map(p => `/${p.slug}/ ${p.count} 条`).join(' · ');
      console.log(`  ✓ 分类页: ${summary}（逐条 id 对账 · canonical · 双 feed · 三段 JSON-LD · 预渲染正文）`);
    }
  }

  const sampleDeals = [dealEntries[0], dealEntries[Math.floor(dealEntries.length / 2)], dealEntries[dealEntries.length - 1]].filter(Boolean);  let detailBad = 0;
  for (const deal of sampleDeals) {
    const pageFile = path.join(OUT, 'deal', deal.id, 'index.html');
    if (!fs.existsSync(pageFile)) { fail(`缺少详情页 ${deal.id}`); detailBad++; continue; }
    const page = fs.readFileSync(pageFile, 'utf8');
    if (!page.includes(`/deal/${encodeURIComponent(deal.id)}/`)) { fail(`详情页 canonical 不是自指: ${deal.id}`); detailBad++; }
    const prose = String(deal.discountInfo || '').slice(0, 12);
    if (prose && !page.includes(prose)) { fail(`详情页缺少本条优惠文案（不执行 JS 读不到）: ${deal.id}`); detailBad++; }
    if (/fetch\('deals\.json'/.test(page)) { fail(`详情页仍会拉 deals.json（应纯静态）: ${deal.id}`); detailBad++; }
  }
  if (!detailBad) console.log(`  ✓ 详情页抽样: ${sampleDeals.length} 个均自指 canonical、含本条文案、纯静态`);

  // 折叠无损：产物里「折叠卡覆盖的模型数 + 单条卡数」必须等于未过期优惠条数，
  // 即数据层的无损断言确实落到了静态正文里（覆盖模型数真的被输出，而不是只写在内存里）
  if (built) {
    const modelsSum = [...markup.matchAll(/data-model-count="(\d+)"/g)]
      .reduce((n, m) => n + Number(m[1]), 0);
    const foldedCards = (markup.match(/<article class="g [^>]*data-model-count="/g) || []).length;
    const covered = (cardCount - foldedCards) + modelsSum;
    if (covered !== built.visibleCount) {
      fail(`折叠覆盖条目 ${covered} 条 ≠ 未过期优惠 ${built.visibleCount} 条（折叠卡 ${foldedCards} 张 / 覆盖模型 ${modelsSum} 个）`);
    } else {
      console.log(`  ✓ 折叠无损: ${cardCount} 张卡片覆盖 ${built.visibleCount} 条优惠（${foldedCards} 张折叠卡 / ${modelsSum} 个模型）`);
    }
  }

  if (!/rel="canonical"/.test(html)) fail('缺少 canonical');
  if (!/hreflang="x-default"/.test(html)) fail('缺少 hreflang');
  if (!/property="og:image"/.test(html)) fail('缺少 og:image');
  if (!/name="twitter:card"/.test(html)) fail('缺少 twitter card');
  if (/__SITE_URL__|buguoshixc\.github\.io\/ai-deals-aggregator\/"\/>/.test(html) === false && !html.includes(SITE_URL)) {
    fail('产物中找不到站点绝对地址');
  }

  const ldBlocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const expectedTypes = ['Organization', 'WebSite', 'BreadcrumbList', 'FAQPage', 'ItemList'];
  const foundTypes = [];
  for (const [i, block] of ldBlocks.entries()) {
    try {
      const data = JSON.parse(block);
      foundTypes.push(data['@type']);
    } catch (e) {
      fail(`JSON-LD 第 ${i + 1} 段解析失败: ${e.message}`);
    }
  }
  for (const type of expectedTypes) {
    if (!foundTypes.includes(type)) fail(`缺少 JSON-LD ${type}`);
  }
  if (ldBlocks.length === expectedTypes.length && foundTypes.length === expectedTypes.length) {
    console.log(`  ✓ JSON-LD: ${foundTypes.join(' / ')}`);
  }

  // 订阅产物：两份必须条目数一致、能被解析、且声明的版本正确
  const feedXml = fs.readFileSync(path.join(OUT, 'feed.xml'), 'utf8');
  const feedItems = (feedXml.match(/<item>/g) || []).length;
  let feedJsonBox = null;
  try {
    feedJsonBox = JSON.parse(fs.readFileSync(path.join(OUT, 'feed.json'), 'utf8'));
  } catch (e) {
    fail(`feed.json 解析失败: ${e.message}`);
  }
  if (feedJsonBox) {
    if (!/^<\?xml version="1\.0" encoding="UTF-8"\?>/.test(feedXml)) fail('feed.xml 缺少 XML 声明');
    if (feedJsonBox.version !== 'https://jsonfeed.org/version/1.1') fail('feed.json 不是 JSON Feed 1.1');
    if (feedItems !== feedJsonBox.items.length) {
      fail(`订阅条目数不一致：feed.xml ${feedItems} 条 vs feed.json ${feedJsonBox.items.length} 条`);
    } else if (!feedItems) {
      fail('订阅里没有任何条目（应至少有 type=deal 的条目）');
    } else {
      console.log(`  ✓ 订阅条目一致: ${feedItems} 条（feed.xml / feed.json）`);
    }
  }

  // FAQ 可见文案与 FAQPage 必须逐字一致。
  //
  // 两层断言，缺一不可：
  //   ① 用 visibleFaq() 从产物**独立**回读可见文案（与生成侧不同源，段落拆法也不同），
  //      逐条比对问题与「各段用单空格拼接」的答案 —— 抓截断、丢段、边界处理分叉；
  //   ② 结构化答案里**不许出现 HTML 标签** —— 标签不是答案文本，搜索引擎会把它们
  //      当字面文字读给用户；这一层不依赖任何解析实现，是最硬的兜底。
  // （原来的实现可见侧也调 extractFaq()，两侧同源 ⇒ 比较恒等、永远不可能失败。）
  try {
    const faq = ldBlocks.map(b => JSON.parse(b)).find(d => d['@type'] === 'FAQPage');
    if (faq) {
      const visible = visibleFaq(html);
      const schema = faq.mainEntity.map(q => ({ question: q.name, answer: q.acceptedAnswer.text }));
      const problems = [];

      if (visible.length !== schema.length) {
        problems.push(`条数：可见 ${visible.length} / 结构化 ${schema.length}`);
      }
      visible.forEach((item, i) => {
        if (!schema[i]) return;
        if (item.question !== schema[i].question) problems.push(`第 ${i + 1} 条问题不一致`);
        if (item.paragraphs.join(' ') !== schema[i].answer) problems.push(`第 ${i + 1} 条答案不一致`);
      });
      schema.forEach((item, i) => {
        const tags = item.answer.match(/<\/?[a-z][^>]*>/gi);
        if (tags) problems.push(`第 ${i + 1} 条答案夹带 HTML 标签 ${[...new Set(tags)].join(' ')}`);
      });

      if (problems.length) fail(`FAQ 可见文案与 FAQPage 不一致：${problems.join('；')}`);
      else console.log(`  ✓ FAQ 文案与结构化数据一致: ${visible.length} 条（可见侧独立回读 + 无标签残留）`);
    }
  } catch (e) {
    fail('FAQ 一致性校验失败: ' + e.message);
  }

  // OG 图必须是合法 PNG 且尺寸正确
  const png = fs.readFileSync(path.join(OUT, 'og-image.png'));
  const isPng = png.slice(0, 8).toString('hex') === '89504e470d0a1a0a';
  const pngW = png.readUInt32BE(16);
  const pngH = png.readUInt32BE(20);
  if (!isPng) fail('og-image.png 不是合法 PNG');
  else if (pngW !== 1200 || pngH !== 630) fail(`og-image.png 尺寸异常 ${pngW}x${pngH}`);
  else console.log(`  ✓ og-image.png: ${pngW}x${pngH}`);

  const size = fs.readdirSync(OUT).reduce((n, f) => n + fs.statSync(path.join(OUT, f)).size, 0);
  console.log(`  产物总大小: ${(size / 1024).toFixed(1)} KB`);
  console.log(failed ? `\n❌ 产物自检失败（${failed} 项）` : '\n✅ 产物自检通过');
  return failed === 0;
}

/* ------------------------------------------------------------------ */
/* 暂存 → 最终：只有全部自检通过才替换                                  */
/* ------------------------------------------------------------------ */

/** 自检失败（selfCheck 已经逐项打印过原因）——不是异常，只是构建不通过 */
class SelfCheckFailed extends Error {}

function sleepMs(ms) {
  // 同步脚本里等一小会儿：Windows 上杀软/同步客户端/静态服务可能短暂占住目录，
  // rename 会 EPERM/EBUSY，一次瞬时占用不该把一份已经造好的产物判死。
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function renameWithRetry(from, to, attempts = 10) {
  for (let i = 1; ; i++) {
    try {
      fs.renameSync(from, to);
      return;
    } catch (err) {
      if (i >= attempts) throw err;
      sleepMs(50 * i);
    }
  }
}

/**
 * 暂存目录 → 最终目录。
 *
 * 不做「先 rmSync(FINAL_OUT) 再 rename」：那样在两步之间磁盘上没有任何完整产物，
 * 中途挂掉就等于旧产物没了、新产物还没就位。这里的两步 rename 让旧目录先整块搬到
 * 备份名（同卷 rename，内容始终完整），新目录就位之后才删备份；第二步 rename 失败
 * 还能把旧目录原样搬回来——构建失败绝不等于产物消失。
 */
function promoteStaging() {
  const backup = `${FINAL_OUT}.stale`;
  fs.rmSync(backup, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  const hadOld = fs.existsSync(FINAL_OUT);
  if (hadOld) renameWithRetry(FINAL_OUT, backup);
  try {
    renameWithRetry(STAGE_OUT, FINAL_OUT);
  } catch (err) {
    // 回滚：最终目录回到替换之前的样子，绝不留下「没有产物」的状态
    if (hadOld && !fs.existsSync(FINAL_OUT)) renameWithRetry(backup, FINAL_OUT);
    throw err;
  }
  if (hadOld) fs.rmSync(backup, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}

function removeDirWithRetry(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  } catch (err) {
    console.error(`  ⚠️  清理失败 ${showOut(dir)}: ${err.message}`);
  }
}

/**
 * 替换中途失败时的兜底：最终目录不在、备份还在，就把备份搬回去。
 * （promoteStaging 内部已经回滚过一次，这里防的是「连回滚那次 rename 也失败」。）
 */
function restoreBackupIfNeeded() {
  const backup = `${FINAL_OUT}.stale`;
  if (!fs.existsSync(backup) || fs.existsSync(FINAL_OUT)) return;
  try {
    renameWithRetry(backup, FINAL_OUT);
    console.error(`  ↩️  已把上一份产物从 ${showOut(backup)} 恢复到 ${showOut(FINAL_OUT)}`);
  } catch (err) {
    console.error(`  ⚠️  ${showOut(FINAL_OUT)} 缺失且备份恢复失败（原样保留 ${showOut(backup)}）：${err.message}`);
  }
}

/** 失败路径：清掉暂存目录；FINAL_OUT 原封不动 */
function discardStaging() {
  removeDirWithRetry(STAGE_OUT);
  // 备份目录只在最终目录确实存在时才删。否则它可能是上一份产物的唯一一份
  // （替换失败且回滚也失败），删掉就等于把用户仅有的产物弄丢了。
  if (fs.existsSync(FINAL_OUT)) removeDirWithRetry(`${FINAL_OUT}.stale`);
  else if (fs.existsSync(`${FINAL_OUT}.stale`)) {
    console.error(`  ⚠️  保留备份目录 ${showOut(`${FINAL_OUT}.stale`)}（${showOut(FINAL_OUT)} 不在，它是上一份产物）`);
  }
}

function main() {
  runValidate();
  const built = assemble();
  // selfCheck 用「返回 false」而不是抛错表示失败；抛错（如 og-image 自检）与返回 false
  // 都必须走下面同一个 catch。只有全部自检通过，才允许把暂存目录换成最终目录。
  if (!selfCheck(built)) throw new SelfCheckFailed('产物自检未通过');
  promoteStaging();
  console.log(`\n✅ 构建完成 → ${showOut(FINAL_OUT)}（自检全过，已从暂存目录就位）`);
}

try {
  main();
} catch (err) {
  restoreBackupIfNeeded();
  discardStaging();
  console.error(`\n❌ 构建失败：${err instanceof SelfCheckFailed ? err.message : (err && err.stack) || String(err)}`);
  console.error(`   ${showOut(FINAL_OUT)} 未被改动${fs.existsSync(FINAL_OUT) ? '' : '（原本不存在，现在仍不存在）'}；暂存目录已清理，可直接重跑。`);
  process.exit(1);
}
