#!/usr/bin/env node
/**
 * 打印页面中所有「行内含指定链接特征」的表格行（含单元格文本），
 * 用于编写"按链接特征抽取行"的采集器。
 *
 * 用法：node scripts/tools/rows-by-link.js <url> <链接子串>
 */

const cheerio = require('cheerio');
const { getText } = require('../lib/http');

async function main() {
  const [url, needle] = process.argv.slice(2);
  if (!url || !needle) {
    console.error('用法: node scripts/tools/rows-by-link.js <url> <链接子串>');
    process.exit(1);
  }

  const html = await getText(url, { timeout: 25000 });
  const $ = cheerio.load(html);

  let count = 0;
  $('table').each((ti, table) => {
    $(table).find('tr').each((ri, row) => {
      const hrefs = $(row).find('a[href]').map((_, a) => $(a).attr('href')).get();
      if (!hrefs.some(h => h && h.includes(needle))) return;
      count++;
      const cells = $(row).find('td,th').map((_, c) => $(c).text().trim().replace(/\s+/g, ' ').slice(0, 60)).get();
      console.log(`table[${ti}] row[${ri}] :: ${cells.join(' || ')}`);
      console.log(`    links: ${hrefs.filter(h => h.includes(needle)).join(' ')}`);
    });
  });
  console.log(`\n共 ${count} 行命中 "${needle}"`);
}

main().catch(error => {
  console.error('失败:', error.message);
  process.exit(1);
});
