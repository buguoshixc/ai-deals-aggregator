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
const { render: renderOgImage } = require('../lib/og-image');
const { load: loadLogos, write: writeLogos } = require('../lib/logos');
const { load: loadRenderCore } = require('../lib/render-core');
const { attach: attachZh, summarize: summarizeZh } = require('../lib/zh');

const ROOT = path.join(__dirname, '..', '..');
const outArg = process.argv.find(a => a.startsWith('--out='));
const OUT = path.join(ROOT, outArg ? outArg.slice(6) : 'dist');

const PUBLIC_FILES = ['index.html', 'deals.json', 'favicon.svg', 'robots.txt', '.nojekyll'];
/** 构建期生成、不走源码拷贝的产物 */
const GENERATED_FILES = ['logos.css', 'sitemap.xml', 'og-image.png', 'feed.xml', 'feed.json'];
const SITE_URL = 'https://buguoshixc.github.io/ai-deals-aggregator/';
const SITE_NAME = 'AI 优惠聚合器';
const SITE_DESCRIPTION = '聚合国内外 AI 大模型的真实优惠：新用户免费额度、免费模型、学生/教师/非营利折扣、限时促销。全部指向厂商官方页。';

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

/**
 * 从已渲染的 HTML 中解析 FAQ 条目。
 * FAQPage 结构化数据必须与页面上可见的问答逐字一致，因此这里以 HTML 为唯一事实来源，
 * 而不是在 JS 里再抄一份文案（抄一份就一定会漂移）。
 */
function extractFaq(html) {
  const items = [];
  const re = /<details>\s*<summary>([\s\S]*?)<\/summary>\s*<p>([\s\S]*?)<\/p>\s*<\/details>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    items.push({
      question: decodeEntities(m[1]).replace(/\s+/g, ' ').trim(),
      answer: decodeEntities(m[2]).replace(/\s+/g, ' ').trim()
    });
  }
  if (items.length < 3) {
    throw new Error(`只解析到 ${items.length} 条 FAQ，至少需要 3 条才能生成 FAQPage`);
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
 * **不引入第二份模板**：页面主体直接调用 RENDER-CORE 的 `detailHtml()`——与首页详情弹层
 * 是同一个函数；样式块、页脚也从**已组装好的 index.html** 里抽出来（index.html 里有
 * `<!--SHARED:footer:START/END-->` 标记）。因此首页与详情页不会分叉。
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
  const footer = footerRaw.replace(/<span id="lastUpdated">--<\/span>/, '<span>见首页</span>').trim();

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
        <span class="btxt"><b>AI <em>优惠</em>聚合器</b><small>真实优惠 · 每日核验</small></span>
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
        · 本站只做收录与核验，最终以厂商官方页面为准；排序与推荐理由不出售。
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
/* 组装                                                                */
/* ------------------------------------------------------------------ */

function assemble() {
  console.log(`\n=== 2) 组装产物 ${path.relative(ROOT, OUT)}/ ===`);
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

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

  fs.writeFileSync(path.join(OUT, 'deals.json'), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`  中文译文: ${summarizeZh(zhAttached.report)}`);
  zhAttached.report.stale.forEach(row =>
    console.warn(`    🔁 原文已变，译文已停用待复核: ${row.title} — ${row.message}`));
  zhAttached.report.orphaned.forEach(row =>
    console.warn(`    ⚠️  译文对不上任何条目 id（条目可能改名/换 URL）: ${row.id} ${row.title}`));
  zhAttached.report.warnings.forEach(row =>
    console.warn(`    ℹ️  ${row.title}: ${row.message}`));
  if (zhAttached.report.unmanaged.length) {
    console.log(`    ℹ️  ${zhAttached.report.unmanaged.length} 条译文不在覆盖层里（deals.json 自带，覆盖层管不到）`);
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

  fs.writeFileSync(indexFile, html, 'utf8');

  // OG 分享图
  const og = renderOgImage();
  fs.writeFileSync(path.join(OUT, 'og-image.png'), og);
  console.log(`  OG 分享图: ${(og.length / 1024).toFixed(1)} KB`);

  // 独立详情页（每条优惠一个静态 URL）+ sitemap
  const lastmod = String(payload.updatedAt || '').slice(0, 10);
  const detailPages = writeDetailPages(payload, html, renderCore);
  console.log(`  详情页: ${detailPages.length} 个 → deal/<id>/index.html`);

  const dealUrls = detailPages.map(page => `  <url>
    <loc>${page.url}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`).join('\n');

  fs.writeFileSync(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE_URL}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
${dealUrls}
</urlset>
`, 'utf8');

  // 订阅：RSS 2.0 + JSON Feed（构建期生成，零依赖）
  const feeds = renderFeeds(payload);
  fs.writeFileSync(path.join(OUT, 'feed.xml'), feeds.rss, 'utf8');
  fs.writeFileSync(path.join(OUT, 'feed.json'), feeds.json, 'utf8');
  console.log(`  订阅产物: feed.xml + feed.json（各 ${feeds.count} 条）`);

  // 交给自检：折叠覆盖的条目总数需与页面卡片内容对得上；译文条数用于产物回读比对
  return Object.assign({}, rendered, { zhWithZh: zhAttached.report.withZh });
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
  const markup = html.replace(/<script[\s\S]*?<\/script>/gi, '');

  if (/PRERENDER:/.test(html)) fail('产物 index.html 仍残留 PRERENDER 标记');
  if (/__SITE_URL__/.test(html)) fail('产物 index.html 仍残留 __SITE_URL__ 占位');

  const cardCount = (markup.match(/<article class="g /g) || []).length;
  if (cardCount < MIN_PRERENDERED_CARDS) {
    fail(`预渲染卡片 ${cardCount} 条 < ${MIN_PRERENDERED_CARDS}`);
  } else {
    console.log(`  ✓ 预渲染卡片: ${cardCount} 条`);
  }

  // 分档分带：默认按力度排序，五档里有卡片的档必须都有带
  const tierHeads = [...markup.matchAll(/<div class="tierhead t(\d)"[^>]*>/g)].map(m => Number(m[1]));
  const tierDots = [...markup.matchAll(/data-tier="(\d)"/g)].map(m => Number(m[1]));
  if (built) {
    const expected = new Set(built.cards.map(card => card.tier));
    const missingTier = [...expected].filter(tier => !tierHeads.includes(tier));
    if (missingTier.length) fail(`档位 ${missingTier.join(', ')} 有卡片但缺少分带标题`);
    else if (tierDots.length !== cardCount) fail(`档位角标 ${tierDots.length} 个 ≠ 卡片 ${cardCount} 条`);
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
  if (sitemapLocs.length !== dealEntries.length + 1) {
    fail(`sitemap ${sitemapLocs.length} 条 ≠ 首页 1 + 详情页 ${dealEntries.length}`);
  } else {
    const notListed = dealEntries.filter(deal => !sitemapLocs.some(loc => loc.endsWith(`/deal/${encodeURIComponent(deal.id)}/`)));
    if (notListed.length) fail(`sitemap 漏了 ${notListed.length} 个详情页`);
    else console.log(`  ✓ sitemap: ${sitemapLocs.length} 条（首页 + ${dealEntries.length} 个详情页，无遗漏）`);
  }

  const sampleDeals = [dealEntries[0], dealEntries[Math.floor(dealEntries.length / 2)], dealEntries[dealEntries.length - 1]].filter(Boolean);
  let detailBad = 0;
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

  // FAQ 可见文案与 FAQPage 必须逐字一致
  try {
    const faq = ldBlocks.map(b => JSON.parse(b)).find(d => d['@type'] === 'FAQPage');
    if (faq) {
      const visible = extractFaq(html);
      const schemaQuestions = faq.mainEntity.map(q => q.name);
      const schemaAnswers = faq.mainEntity.map(q => q.acceptedAnswer.text);
      const mismatch = visible.some((item, i) => item.question !== schemaQuestions[i] || item.answer !== schemaAnswers[i]);
      if (mismatch || visible.length !== schemaQuestions.length) {
        fail(`FAQ 可见文案与 FAQPage 不一致（可见 ${visible.length} 条 / 结构化 ${schemaQuestions.length} 条）`);
      } else {
        console.log(`  ✓ FAQ 文案与结构化数据一致: ${visible.length} 条`);
      }
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

runValidate();
const built = assemble();
if (!selfCheck(built)) process.exit(1);
