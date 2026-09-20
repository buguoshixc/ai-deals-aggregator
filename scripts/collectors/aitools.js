const axios = require('axios');
const cheerio = require('cheerio');

/**
 * Collect AI tools from aitools.fyi
 * Best source: embeds all tool data as JSON in __NEXT_DATA__ script tag
 */
async function collectAitoolsFyi() {
  const deals = [];

  try {
    const response = await axios.get('https://aitools.fyi/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      timeout: 20000
    });

    const $ = cheerio.load(response.data);
    let toolData = null;

    $('script#__NEXT_DATA__[type="application/json"]').each((_, el) => {
      try {
        const json = JSON.parse($(el).contents().text());
        const tools = json?.props?.pageProps?.regularTools;
        if (Array.isArray(tools)) {
          toolData = tools;
        }
      } catch (e) {
        // ignore parse errors
      }
    });

    if (toolData) {
      for (const tool of toolData) {
        if (!tool.name) continue;

        const url = tool.website ||
                    (tool.zh_website && tool.zh_website.trim()) ||
                    (tool.slug ? `https://aitools.fyi/tool/${tool.slug}` : null);
        if (!url) continue;

        const description = tool.zhDescription || tool.description || '';
        const pricingMap = {
          'free': '免费',
          'freemium': '免费增值',
          'paid': '付费',
          'subscription': '订阅',
          'Free': '免费',
          'Freemium': '免费增值',
          'Paid': '付费',
          'Subscription': '订阅'
        };
        const pricingType = typeof tool.pricingType === 'string' ? tool.pricingType : '';
        const discount = pricingType ? (pricingMap[pricingType] || pricingType) : '查看';
        const category = (tool.category && typeof tool.category === 'object') ? (tool.category.name || 'AI Tools') : (tool.category || 'AI Tools');

        deals.push({
          title: tool.name,
          url: url.startsWith('http') ? url : `https://${url}`,
          source: 'aitools.fyi',
          discount,
          description: description.substring(0, 200),
          category,
          date: new Date().toISOString().split('T')[0],
          endDate: null
        });
      }
    }
  } catch (error) {
    console.error(`aitools.fyi collector error: ${error.message}`);
  }

  return deals;
}

/**
 * Collect AI tools from Futurepedia homepage
 * Tool cards are plain anchors containing /tool/ in the href.
 * Then fetches each detail page (concurrently) to extract the real
 * website URL, meta description, and pricing model.
 */
async function collectFuturepedia() {
  const deals = [];

  const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.futurepedia.io/'
  };

  try {
    const response = await axios.get('https://www.futurepedia.io/', {
      headers: HEADERS,
      timeout: 20000
    });

    const $ = cheerio.load(response.data);

    // Collect tool entries from homepage anchors
    const seen = new Set();
    const tools = [];
    $('a[href*="/tool/"]').each((_, el) => {
      const href = $(el).attr('href');
      const title = $(el).text().trim();

      if (title && title.length > 1 && title.length < 100 && href && !seen.has(href)) {
        seen.add(href);
        tools.push({
          title,
          pageUrl: href.startsWith('http') ? href : `https://www.futurepedia.io${href}`
        });
      }
    });

    // Fetch detail pages concurrently (limit 3 at a time) to enrich data
    const CONCURRENCY = 3;
    for (let i = 0; i < tools.length; i += CONCURRENCY) {
      const batch = tools.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        batch.map(tool => fetchToolDetails(tool.pageUrl, HEADERS))
      );

      results.forEach((detail, idx) => {
        const tool = batch[idx];
        deals.push({
          title: tool.title,
          url: detail.website || tool.pageUrl,
          source: 'Futurepedia',
          discount: detail.pricing || '查看定价',
          description: detail.description || '',
          category: 'AI Tools',
          date: new Date().toISOString().split('T')[0],
          endDate: null
        });
      });
    }
  } catch (error) {
    console.error(`Futurepedia collector error: ${error.message}`);
  }

  return deals;
}

/**
 * Fetch a Futurepedia tool detail page and extract website URL,
 * meta description, and pricing model.
 */
async function fetchToolDetails(pageUrl, headers) {
  try {
    const res = await axios.get(pageUrl, { headers, timeout: 15000 });
    const $ = cheerio.load(res.data);

    // Meta description
    const description = $('meta[name="description"]').attr('content') ||
                        $('meta[property="og:description"]').attr('content') ||
                        '';

    // Pricing model: <span>Pricing Model: </span><div>Freemium, $20/mo</div>
    let pricing = null;
    $('span').each((_, el) => {
      if (!pricing && /Pricing Model/i.test($(el).text())) {
        const next = $(el).next('div').text().trim();
        if (next) pricing = next.replace(/<!--\s*-->/g, '');
      }
    });

    // Real website URL: external link carrying utm_source=futurepedia
    let website = null;
    $('a[href*="utm_source=futurepedia"]').each((_, el) => {
      const href = $(el).attr('href');
      if (!website && href && !href.includes('futurepedia.io')) {
        website = href;
      }
    });

    return { description, pricing, website };
  } catch (error) {
    return { description: null, pricing: null, website: null };
  }
}

/**
 * Collect AI tools from Futuretools.io
 * Extracts tool names and URLs from homepage tool cards
 */
async function collectFuturetools() {
  const deals = [];

  try {
    const response = await axios.get('https://www.futuretools.io/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br'
      },
      timeout: 45000,
      decompress: true,
      maxRedirects: 5
    });

    const $ = cheerio.load(response.data);

    // Futuretools cards: name in p.text-sm, category in p.text-xs
    const seen = new Set();
    const tools = [];
    $('a[href^="/tools/"]').each((_, el) => {
      const href = $(el).attr('href');
      const title = $(el).find('p.text-sm').first().text().trim();
      const category = $(el).find('p.text-xs').first().text().trim();

      if (title && title.length > 1 && title.length < 150 && href && !seen.has(href)) {
        seen.add(href);
        tools.push({ title, pageUrl: `https://futuretools.io${href}`, category: category || 'AI Tools' });
      }
    });

    // Enrich concurrently: description from detail page + real website via /go/ redirect
    const CONCURRENCY = 5;
    for (let i = 0; i < tools.length; i += CONCURRENCY) {
      const batch = tools.slice(i, i + CONCURRENCY);
      const details = await Promise.all(batch.map(t => fetchFuturetoolsDetails(t.pageUrl)));

      details.forEach((detail, idx) => {
        const tool = batch[idx];
        deals.push({
          title: tool.title,
          url: detail.website || tool.pageUrl,
          source: 'Futuretools',
          discount: '查看',
          description: detail.description || '',
          category: tool.category,
          date: new Date().toISOString().split('T')[0],
          endDate: null
        });
      });
    }
  } catch (error) {
    console.error(`Futuretools collector error: ${error.message}`);
  }

  return deals;
}

/**
 * Fetch a Futuretools detail page: extract meta description,
 * then follow the /go/ redirect to find the tool's real website.
 */
async function fetchFuturetoolsDetails(pageUrl) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9'
  };

  let description = '';
  let website = null;

  try {
    const res = await axios.get(pageUrl, { headers, timeout: 15000, maxRedirects: 5 });
    const $ = cheerio.load(res.data);

    description = $('meta[name="description"]').attr('content') ||
                  $('meta[property="og:description"]').attr('content') ||
                  '';

    // CTA link pattern: /go/{slug}
    const goHref = $('a[href^="/go/"]').first().attr('href');
    if (goHref) {
      const goUrl = `https://futuretools.io${goHref}`;
      try {
        const head = await axios.head(goUrl, { headers, timeout: 8000, maxRedirects: 0, validateStatus: s => s < 400 });
        if (head.status === 302 && head.headers.location) {
          website = head.headers.location.split('?')[0];
        }
      } catch (e) {
        // 302 responses arrive as errors when maxRedirects: 0; extract location anyway
        if (e.response && e.response.status === 302 && e.response.headers && e.response.headers.location) {
          website = e.response.headers.location.split('?')[0];
        }
      }
    }
  } catch (error) {
    // Failures fall back to directory URL with no description
  }

  return { description, website };
}

module.exports = { collectAitoolsFyi, collectFuturepedia, collectFuturetools };