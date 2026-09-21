/**
 * 国外目录站采集器：aitools.fyi / Futurepedia / Futuretools
 *
 * 这些来源主要提供"工具 + 定价层级"，真实优惠信号弱。
 * 采集器只负责产出原始条目，type 判定交给 lib/schema.js（保守策略：默认 tool）。
 */

const cheerio = require('cheerio');
const { getText, followRedirect, mapLimit, describeError } = require('../lib/http');
const { cleanText, inferPricingModel } = require('../lib/schema');

const PRICING_MAP = {
  free: '免费',
  freemium: '免费增值',
  paid: '付费',
  subscription: '订阅',
  Free: '免费',
  Freemium: '免费增值',
  Paid: '付费',
  Subscription: '订阅'
};

/** aitools.fyi：首页 __NEXT_DATA__ 内嵌全部工具数据 */
async function collectAitools() {
  const html = await getText('https://aitools.fyi/');
  const $ = cheerio.load(html);
  const items = [];

  let tools = null;
  $('script#__NEXT_DATA__[type="application/json"]').each((_, el) => {
    try {
      const json = JSON.parse($(el).contents().text());
      const candidate = json?.props?.pageProps?.regularTools;
      if (Array.isArray(candidate)) tools = candidate;
    } catch (e) {
      /* 忽略解析失败 */
    }
  });

  if (!tools) return items;

  for (const tool of tools) {
    if (!tool || !tool.name) continue;
    const website =
      tool.website ||
      (tool.zh_website && String(tool.zh_website).trim()) ||
      (tool.slug ? `https://aitools.fyi/tool/${tool.slug}` : null);
    if (!website) continue;

    const pricingType = typeof tool.pricingType === 'string' ? tool.pricingType : '';
    const category = tool.category && typeof tool.category === 'object'
      ? tool.category.name || ''
      : tool.category || '';

    items.push({
      title: tool.name,
      url: website,
      source: 'aitools.fyi',
      discount: pricingType ? (PRICING_MAP[pricingType] || pricingType) : '',
      description: tool.zhDescription || tool.description || '',
      category
    });
  }

  return items;
}

/** Futurepedia：首页卡片 + 详情页补全（官网 / 定价 / 描述） */
async function collectFuturepedia() {
  const headers = { Referer: 'https://www.futurepedia.io/' };
  const html = await getText('https://www.futurepedia.io/', { headers });
  const $ = cheerio.load(html);

  const seen = new Set();
  const pages = [];
  $('a[href*="/tool/"]').each((_, el) => {
    const href = $(el).attr('href');
    const title = cleanText($(el).text(), 120);
    if (!href || !title || title.length < 2 || seen.has(href)) return;
    seen.add(href);
    pages.push({
      title,
      pageUrl: href.startsWith('http') ? href : `https://www.futurepedia.io${href}`
    });
  });

  const details = await mapLimit(pages.slice(0, 40), 3, page => fetchFuturepediaDetail(page.pageUrl, headers));

  return pages.map((page, index) => {
    const detail = details[index] && !details[index].__error ? details[index] : {};
    return {
      title: page.title,
      url: detail.website || page.pageUrl,
      sourceUrl: page.pageUrl,
      source: 'Futurepedia',
      discount: detail.pricing || '',
      description: detail.description || '',
      category: ''
    };
  });
}

async function fetchFuturepediaDetail(pageUrl, headers) {
  const html = await getText(pageUrl, { headers, timeout: 12000 });
  const $ = cheerio.load(html);

  const description =
    $('meta[name="description"]').attr('content') ||
    $('meta[property="og:description"]').attr('content') ||
    '';

  let pricing = null;
  $('span').each((_, el) => {
    if (!pricing && /Pricing Model/i.test($(el).text())) {
      const next = $(el).next('div').text().trim();
      if (next) pricing = next.replace(/<!--\s*-->/g, '');
    }
  });

  let website = null;
  $('a[href*="utm_source=futurepedia"]').each((_, el) => {
    const href = $(el).attr('href');
    if (!website && href && !href.includes('futurepedia.io')) website = href;
  });

  return { description: cleanText(description, 200), pricing: cleanText(pricing, 60), website };
}

/** Futuretools：卡片列表 + 详情页描述 + /go/ 跳转解析官网 */
async function collectFuturetools() {
  const html = await getText('https://www.futuretools.io/', { timeout: 30000 });
  const $ = cheerio.load(html);

  const seen = new Set();
  const tools = [];
  $('a[href^="/tools/"]').each((_, el) => {
    const href = $(el).attr('href');
    const title = cleanText($(el).find('p.text-sm').first().text(), 120);
    const category = cleanText($(el).find('p.text-xs').first().text(), 60);
    if (!href || !title || title.length < 2 || seen.has(href)) return;
    seen.add(href);
    tools.push({ title, category, pageUrl: `https://futuretools.io${href}` });
  });

  const details = await mapLimit(tools.slice(0, 60), 5, tool => fetchFuturetoolsDetail(tool.pageUrl));

  return tools.map((tool, index) => {
    const detail = details[index] && !details[index].__error ? details[index] : {};
    return {
      title: tool.title,
      url: detail.website || tool.pageUrl,
      sourceUrl: tool.pageUrl,
      source: 'Futuretools',
      discount: '',
      description: detail.description || '',
      category: tool.category
    };
  });
}

async function fetchFuturetoolsDetail(pageUrl) {
  let description = '';
  let website = null;
  try {
    const html = await getText(pageUrl, { timeout: 12000 });
    const $ = cheerio.load(html);
    description = cleanText(
      $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || '',
      200
    );

    const goHref = $('a[href^="/go/"]').first().attr('href');
    if (goHref) {
      const location = await followRedirect(`https://futuretools.io${goHref}`);
      if (location && /^https?:\/\//i.test(location)) website = location;
    }
  } catch (error) {
    // 详情页失败：保留目录页兜底
  }
  return { description, website };
}

module.exports = [
  {
    id: 'aitools',
    name: 'aitools.fyi',
    region: 'global',
    collect: collectAitools
  },
  {
    id: 'futurepedia',
    name: 'Futurepedia',
    region: 'global',
    collect: collectFuturepedia
  },
  {
    id: 'futuretools',
    name: 'Futuretools',
    region: 'global',
    collect: collectFuturetools
  }
];
