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
const vm = require('vm');
const { execFileSync } = require('child_process');
const { render: renderOgImage } = require('../lib/og-image');

const ROOT = path.join(__dirname, '..', '..');
const outArg = process.argv.find(a => a.startsWith('--out='));
const OUT = path.join(ROOT, outArg ? outArg.slice(6) : 'dist');

const PUBLIC_FILES = ['index.html', 'deals.json', 'favicon.svg', 'robots.txt', '.nojekyll'];
const SITE_URL = 'https://buguoshixc.github.io/ai-deals-aggregator/';
const SITE_NAME = 'AI 优惠聚合器';
const SITE_DESCRIPTION = '聚合国内外 AI 大模型的真实优惠：新用户免费额度、免费模型、学生/教师/非营利折扣、限时促销。全部指向厂商官方页。';

/** 预渲染卡片数的下限：低于此值说明抽取或过滤逻辑坏了，宁可构建失败 */
const MIN_PRERENDERED_CARDS = 60;

const RENDER_CORE_RE = /\/\* =+\s*\n\s*\* RENDER-CORE:START[\s\S]*?\/\* =+\s*\n\s*\* RENDER-CORE:END[\s\S]*?\*\//;

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
function loadRenderCore(html) {
  const match = html.match(RENDER_CORE_RE);
  if (!match) {
    throw new Error('index.html 中找不到 RENDER-CORE 标记区块（纯渲染核心），无法预渲染');
  }

  const shim = {
    document: {
      createElement() {
        let text = '';
        return {
          set textContent(value) { text = value === null || value === undefined ? '' : String(value); },
          get textContent() { return text; },
          get innerHTML() {
            return text
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;');
          }
        };
      }
    }
  };

  const context = vm.createContext(shim);
  new vm.Script(match[0], { filename: 'index.html#RENDER-CORE' }).runInContext(context);

  for (const name of ['cardHtml', 'defaultVisible', 'defaultOrder']) {
    if (typeof context[name] !== 'function') {
      throw new Error(`RENDER-CORE 区块缺少函数 ${name}()`);
    }
  }
  return context;
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
  const list = renderCore.defaultOrder(renderCore.defaultVisible(payload.deals));
  if (list.length < MIN_PRERENDERED_CARDS) {
    throw new Error(`预渲染卡片只有 ${list.length} 条，低于下限 ${MIN_PRERENDERED_CARDS}（数据或过滤逻辑异常）`);
  }
  return { html: list.map(deal => renderCore.cardHtml(deal)).join('\n      '), count: list.length };
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

function buildJsonLd(payload, faqItems) {
  const pageUrl = SITE_URL;
  const ogImage = SITE_URL + 'og-image.png';

  const organization = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: pageUrl,
    logo: SITE_URL + 'favicon.svg',
    description: SITE_DESCRIPTION
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

  // ItemList：只列默认视图里的真实优惠，顺序与页面一致
  const deals = payload.deals.filter(deal => deal.type === 'deal' && !isExpired(deal));
  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'AI 工具优惠与免费额度',
    numberOfItems: deals.length,
    itemListElement: deals.map((deal, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: deal.title,
      url: deal.url
    }))
  };

  return [organization, breadcrumb, faqPage, itemList]
    .map(data => `  <script type="application/ld+json">\n${toJsonLd(data)}\n  </script>`)
    .join('\n');
}

/** 与前端 isExpired 等价的判定（构建期用当天日期） */
function isExpired(deal) {
  if (!deal.expiresAt) return false;
  const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  return deal.expiresAt < today;
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

  const payload = JSON.parse(fs.readFileSync(path.join(ROOT, 'deals.json'), 'utf8'));
  const indexFile = path.join(OUT, 'index.html');
  let html = fs.readFileSync(indexFile, 'utf8');

  console.log('\n=== 3) 预渲染静态骨架 ===');
  const renderCore = loadRenderCore(html);

  // 默认视图卡片：同时移除「加载数据中…」占位（预渲染内容已经可读）
  const rendered = renderDeals(renderCore, payload);
  html = replaceMarker(html, '<!--PRERENDER:deals-->', rendered.html);
  html = html.replace(/\s*<div class="loading">加载数据中…<\/div>/g, '');
  console.log(`  卡片预渲染: ${rendered.count} 条`);

  // 站点绝对地址：源码里不硬编码第二份 URL
  const urlSlots = html.split('__SITE_URL__').length - 1;
  html = html.split('__SITE_URL__').join(SITE_URL);
  console.log(`  站点地址替换: ${urlSlots} 处`);

  // FAQ 结构化数据：以页面可见文案为唯一来源
  const faqItems = extractFaq(html);
  console.log(`  FAQ 解析: ${faqItems.length} 条`);

  const jsonLd = buildJsonLd(payload, faqItems);
  html = replaceMarker(html, '<!--PRERENDER:jsonld-->', jsonLd);
  console.log(`  JSON-LD: ${(jsonLd.match(/application\/ld\+json/g) || []).length} 段`);

  // 标记必须全部消失——残留意味着某个替换静默失败了
  for (const marker of ['PRERENDER:deals', 'PRERENDER:jsonld']) {
    if (html.includes(marker)) throw new Error(`预渲染标记未被替换: ${marker}`);
  }

  fs.writeFileSync(indexFile, html, 'utf8');

  // OG 分享图
  const og = renderOgImage();
  fs.writeFileSync(path.join(OUT, 'og-image.png'), og);
  console.log(`  OG 分享图: ${(og.length / 1024).toFixed(1)} KB`);

  // sitemap
  const lastmod = String(payload.updatedAt || '').slice(0, 10);
  fs.writeFileSync(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE_URL}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`, 'utf8');
}

function selfCheck() {
  console.log('\n=== 4) 产物自检 ===');
  let failed = 0;
  const fail = (message) => { console.log('  ✗ ' + message); failed++; };

  for (const file of [...PUBLIC_FILES, 'sitemap.xml', 'og-image.png']) {
    const ok = fs.existsSync(path.join(OUT, file));
    console.log(`  ${ok ? '✓' : '✗'} ${file}`);
    if (!ok) failed++;
  }

  const payload = JSON.parse(fs.readFileSync(path.join(OUT, 'deals.json'), 'utf8'));
  console.log(`  deals.json: schemaVersion=${payload.schemaVersion}, count=${payload.count}, updatedAt=${payload.updatedAt}`);
  if (payload.schemaVersion !== 2) fail('schemaVersion 不是 2');
  if (payload.count !== payload.deals.length) fail('count 与 deals 长度不一致');

  // 产物里不该出现源码/依赖/文档
  for (const forbidden of ['scripts', 'node_modules', 'package.json', 'package-lock.json', '.git', '.github', 'PROJECT_STATUS.md', 'README.md']) {
    if (fs.existsSync(path.join(OUT, forbidden))) fail(`产物中不应出现 ${forbidden}`);
  }

  // --- 预渲染与 SEO 自检 ---
  const html = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');

  if (/PRERENDER:/.test(html)) fail('产物 index.html 仍残留 PRERENDER 标记');
  if (/__SITE_URL__/.test(html)) fail('产物 index.html 仍残留 __SITE_URL__ 占位');

  const cardCount = (html.match(/<article class="deal-card/g) || []).length;
  if (cardCount < MIN_PRERENDERED_CARDS) {
    fail(`预渲染卡片 ${cardCount} 条 < ${MIN_PRERENDERED_CARDS}`);
  } else {
    console.log(`  ✓ 预渲染卡片: ${cardCount} 条`);
  }

  const ctaCount = (html.match(/class="cta"/g) || []).length;
  console.log(`  ✓ CTA 按钮: ${ctaCount} 个`);
  if (ctaCount < cardCount) fail(`CTA 按钮 ${ctaCount} 个少于卡片 ${cardCount} 条`);

  if (!/rel="canonical"/.test(html)) fail('缺少 canonical');
  if (!/hreflang="x-default"/.test(html)) fail('缺少 hreflang');
  if (!/property="og:image"/.test(html)) fail('缺少 og:image');
  if (!/name="twitter:card"/.test(html)) fail('缺少 twitter card');
  if (/__SITE_URL__|buguoshixc\.github\.io\/ai-deals-aggregator\/"\/>/.test(html) === false && !html.includes(SITE_URL)) {
    fail('产物中找不到站点绝对地址');
  }

  const ldBlocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const expectedTypes = ['Organization', 'BreadcrumbList', 'FAQPage', 'ItemList'];
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
assemble();
if (!selfCheck()) process.exit(1);
