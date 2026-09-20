const axios = require('axios');
const cheerio = require('cheerio');

/**
 * Collect AI tools from layer3labs.io/ai-discounts
 * Contains structured discount information for various AI tools
 */
async function collectLayer3Labs() {
  const deals = [];

  try {
    const response = await axios.get('https://www.layer3labs.io/ai-discounts', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      timeout: 20000
    });

    const $ = cheerio.load(response.data);

    // Look for discount table or structured data
    $('table tr').each((_, row) => {
      const cells = $(row).find('td');
      if (cells.length >= 3) {
        const title = $(cells[0]).text().trim();
        const discount = $(cells[1]).text().trim();
        const description = $(cells[2]).text().trim();

        if (title && discount) {
          deals.push({
            title,
            url: 'https://www.layer3labs.io/ai-discounts',
            source: 'Layer3Labs',
            discount,
            description: description.substring(0, 200),
            category: 'AI Discounts',
            date: new Date().toISOString().split('T')[0],
            endDate: null
          });
        }
      }
    });

    // Also check for FAQ items that might contain discount info
    $('.faq-section .faq-item').each((_, item) => {
      const question = $(item).find('h3, .question').first().text().trim();
      const answer = $(item).find('.answer, .faq-content').first().text().trim();

      if (question && answer) {
        deals.push({
          title: question,
          url: 'https://www.layer3labs.io/ai-discounts',
          source: 'Layer3Labs',
          discount: 'See Details',
          description: answer.substring(0, 200),
          category: 'AI Discounts',
          date: new Date().toISOString().split('T')[0],
          endDate: null
        });
      }
    });
  } catch (error) {
    console.error(`Layer3Labs collector error: ${error.message}`);
  }

  return deals;
}

/**
 * Collect AI tools from bitdegree.org/ai/deals
 * Contains AI tool deals with structured data
 */
async function collectBitDegree() {
  const deals = [];

  try {
    const response = await axios.get('https://www.bitdegree.org/ai/deals', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      timeout: 20000
    });

    const $ = cheerio.load(response.data);

    // Look for deal listings in grid format
    $('.container .row .col-md-6').each((_, element) => {
      const title = $(element).find('h2, h3, .deal-title').first().text().trim();
      const discount = $(element).find('.discount, .promo, [class*="save"]').first().text().trim();
      const description = $(element).find('.description, .desc, p').first().text().trim();

      if (title && discount) {
        deals.push({
          title,
          url: 'https://www.bitdegree.org/ai/deals',
          source: 'BitDegree',
          discount,
          description: description.substring(0, 200),
          category: 'AI Deals',
          date: new Date().toISOString().split('T')[0],
          endDate: null
        });
      }
    });

    // Also check for structured data
    $('[class*="deal"], [class*="offer"], [class*="promo"]').each((_, element) => {
      const title = $(element).find('h2, h3, .title').first().text().trim();
      const discount = $(element).find('[class*="discount"], [class*="percent"], [class*="save"]').first().text().trim();
      const description = $(element).find('p, .description').first().text().trim();

      if (title && discount && !deals.some(d => d.title === title)) {
        deals.push({
          title,
          url: 'https://www.bitdegree.org/ai/deals',
          source: 'BitDegree',
          discount,
          description: description.substring(0, 200),
          category: 'AI Deals',
          date: new Date().toISOString().split('T')[0],
          endDate: null
        });
      }
    });
  } catch (error) {
    console.error(`BitDegree collector error: ${error.message}`);
  }

  return deals;
}

/**
 * Collect AI tools from aitoolsdirectory.net
 * Contains 226+ tools across 10 categories
 */
async function collectAitoolsDirectoryNet() {
  const deals = [];

  try {
    const response = await axios.get('https://aitoolsdirectory.net/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      timeout: 20000
    });

    const $ = cheerio.load(response.data);

    // Look for tool listings
    $('.tool-card, .card, [class*="tool"], [class*="listing"]').each((_, element) => {
      const title = $(element).find('h2, h3, .title, .name').first().text().trim();
      const description = $(element).find('p, .description, .excerpt').first().text().trim();
      const category = $(element).find('.category, .tag').first().text().trim() || 'AI Tools';

      if (title) {
        deals.push({
          title,
          url: `https://aitoolsdirectory.net/search.php?q=${encodeURIComponent(title)}`,
          source: 'AitoolsDirectory',
          discount: 'View Details',
          description: description.substring(0, 200),
          category: category || 'AI Tools',
          date: new Date().toISOString().split('T')[0],
          endDate: null
        });
      }
    });
  } catch (error) {
    console.error(`AitoolsDirectory collector error: ${error.message}`);
  }

  return deals;
}

/**
 * Collect AI tools from zapier.com/blog/free-ai-tools
 * Contains free AI tools with descriptions
 */
async function collectZapierFreeAI() {
  const deals = [];

  try {
    const response = await axios.get('https://zapier.com/blog/free-ai-tools/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      timeout: 20000
    });

    const $ = cheerio.load(response.data);

    // Look for AI tool entries in the blog post
    $('h2, h3').each((_, header) => {
      const title = $(header).text().trim();
      const nextPara = $(header).next('p');
      const description = nextPara.text().trim();

      if (title && description && (title.toLowerCase().includes('ai') || title.toLowerCase().includes('tool'))) {
        // Check if this is a tool title by looking for keywords
        const lowerTitle = title.toLowerCase();
        if (lowerTitle.includes('free') || description.toLowerCase().includes('free') || 
            lowerTitle.includes('tool') || description.toLowerCase().includes('tool')) {
          
          deals.push({
            title: title.replace(/\d+\./, '').trim(), // Remove numbering like "1. "
            url: 'https://zapier.com/blog/free-ai-tools/',
            source: 'Zapier',
            discount: 'Free Tier Available',
            description: description.substring(0, 200),
            category: 'Free AI Tools',
            date: new Date().toISOString().split('T')[0],
            endDate: null
          });
        }
      }
    });

    // Also look for structured lists
    $('li').each((_, li) => {
      const text = $(li).text().trim();
      if (text && (text.toLowerCase().includes('ai') && 
                   (text.toLowerCase().includes('free') || text.toLowerCase().includes('tool')))) {
        
        // Extract title and description from list item
        const title = text.split(':')[0].substring(0, 100);
        const description = text.substring(text.indexOf(':') + 1).trim() || text;

        if (title && !deals.some(d => d.title.includes(title.split(' ')[0]))) {
          deals.push({
            title: title.replace(/\d+\./, '').trim(),
            url: 'https://zapier.com/blog/free-ai-tools/',
            source: 'Zapier',
            discount: 'Free Tier Available',
            description: description.substring(0, 200),
            category: 'Free AI Tools',
            date: new Date().toISOString().split('T')[0],
            endDate: null
          });
        }
      }
    });
  } catch (error) {
    console.error(`Zapier Free AI collector error: ${error.message}`);
  }

  return deals;
}

module.exports = { collectLayer3Labs, collectBitDegree, collectAitoolsDirectoryNet, collectZapierFreeAI };