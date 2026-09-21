/**
 * 国外"真实优惠"采集器。
 *
 * Layer3Labs 的折扣表结构：表头 Provider | Current deal / discount | Best for | How to get it | Source
 * 每行自带官方链接（官方定价页 / 官方活动页），因此落地页天然满足"指向官方页"的要求。
 *
 * 注：AppSumo 首页为纯客户端渲染（__NEXT_DATA__ 中无 deal 数据，页面 0 个 /deal 链接），
 * 实测产出为 0，按"零产出的采集器不上线"原则不注册；其 lifetime deal 数据改由人工策展维护。
 */

const cheerio = require('cheerio');
const { getText } = require('../lib/http');
const { cleanText } = require('../lib/schema');
const { resolveOfficialUrl } = require('../lib/official');

const PAGE_URL = 'https://www.layer3labs.io/ai-discounts';

/** 伪行：不是具体产品，只是受众分类指引（来自第二张表） */
const PSEUDO_TITLES = /^(students?|teachers?|nonprofits?|startups?|veterans?|audience)\b/i;

function headerLooksLikeDealTable(text) {
  return /provider/i.test(text) && /deal|discount/i.test(text);
}

async function collectLayer3Labs() {
  const html = await getText(PAGE_URL, { timeout: 20000 });
  const $ = cheerio.load(html);
  const items = [];

  $('table').each((_, table) => {
    const headerText = $(table).find('tr').first().text();
    if (!headerLooksLikeDealTable(headerText)) return;

    $(table).find('tr').slice(1).each((__, row) => {
      const cells = $(row).find('td');
      if (cells.length < 3) return;

      const title = cleanText($(cells[0]).text(), 150);
      const discountInfo = cleanText($(cells[1]).text(), 240);
      const bestFor = cleanText($(cells[2]).text(), 120);
      const howTo = cleanText($(cells[3]) ? $(cells[3]).text() : '', 200);

      if (!title || PSEUDO_TITLES.test(title)) return;

      // 行内首个链接即官方页；缺失时按标题查官方页映射
      let rowUrl = null;
      $(row).find('a[href^="http"]').each((___, a) => {
        if (!rowUrl) rowUrl = $(a).attr('href');
      });
      const { url } = resolveOfficialUrl(title, rowUrl || PAGE_URL);

      items.push({
        title,
        url,
        sourceUrl: PAGE_URL,
        source: 'Layer3Labs',
        discountInfo,
        description: howTo || bestFor,
        eligibility: bestFor || null,
        category: ''
      });
    });
  });

  return items;
}

module.exports = [
  {
    id: 'layer3labs',
    name: 'Layer3Labs',
    region: 'global',
    collect: collectLayer3Labs
  }
];
