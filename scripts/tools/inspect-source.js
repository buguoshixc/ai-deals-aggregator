#!/usr/bin/env node
/**
 * 采集器调试工具：打印目标页面的结构线索，便于重写选择器。
 *
 * 用法：node scripts/tools/inspect-source.js <url> [cssSelector]
 */

const cheerio = require('cheerio');
const { getText } = require('../lib/http');

async function main() {
  const url = process.argv[2];
  const selector = process.argv[3] || null;
  if (!url) {
    console.error('用法: node scripts/tools/inspect-source.js <url> [cssSelector]');
    process.exit(1);
  }

  const html = await getText(url, { timeout: 20000 });
  const $ = cheerio.load(html);
  console.log(`URL     : ${url}`);
  console.log(`长度    : ${html.length} 字节`);
  console.log(`表格    : ${$('table').length} 个，tr ${$('tr').length} 行`);
  console.log(`标题    : h1=${$('h1').length} h2=${$('h2').length} h3=${$('h3').length}`);
  console.log(`链接    : a=${$('a').length}`);
  console.log(`脚本    : script=${$('script').length}，__NEXT_DATA__=${$('script#__NEXT_DATA__').length}`);

  $('table').slice(0, 5).each((ti, table) => {
    const rows = $('tr', table);
    console.log(`\n--- table[${ti}] 行数=${rows.length}`);
    rows.slice(0, 4).each((ri, row) => {
      const cells = $(row).find('td,th');
      const preview = cells.map((i, c) => $(c).text().trim().slice(0, 50)).get().join(' || ');
      console.log(`  row[${ri}] cells=${cells.length} :: ${preview}`);
    });
  });

  if (selector) {
    console.log(`\n--- 选择器 "${selector}" 命中 ${$(selector).length} 个`);
    $(selector).slice(0, 15).each((i, el) => {
      console.log(`  [${i}] ${$(el).text().trim().replace(/\s+/g, ' ').slice(0, 120)}`);
    });
  }

  if (process.argv.includes('--next-data')) {
    dumpNextData($);
  }

  if (process.argv.includes('--links')) {
    const pattern = process.argv[process.argv.indexOf('--links') + 1] || '/deal';
    const links = $(`a[href*="${pattern}"]`);
    console.log(`\n--- 含 "${pattern}" 的链接 ${links.length} 个`);
    links.slice(0, 15).each((i, el) => {
      console.log(`  [${i}] ${$(el).attr('href')} :: ${$(el).text().trim().slice(0, 60)}`);
    });
  }

  if (process.argv.includes('--rows')) {
    $('table').each((ti, table) => {
      $('tr', table).slice(0, 15).each((ri, row) => {
        const cells = $(row).find('td,th');
        const hrefs = cells.map((i, c) => $(c).find('a').attr('href') || '-').get().join(' ');
        console.log(`table[${ti}] row[${ri}] hrefs: ${hrefs}`);
      });
    });
  }
}

/** 打印 __NEXT_DATA__ 的顶层结构，便于定位内嵌数据 */
function dumpNextData($) {
  const raw = $('script#__NEXT_DATA__[type="application/json"]').first().contents().text();
  if (!raw) {
    console.log('\n--- 无 __NEXT_DATA__');
    return;
  }
  try {
    const json = JSON.parse(raw);
    console.log('\n--- __NEXT_DATA__ pageProps keys:');
    const props = json?.props?.pageProps || {};
    console.log('  ' + Object.keys(props).join(', '));
    for (const [key, value] of Object.entries(props)) {
      if (Array.isArray(value)) {
        console.log(`  ${key}: Array(${value.length})`);
        if (value[0] && typeof value[0] === 'object') {
          console.log(`     第一项字段: ${Object.keys(value[0]).slice(0, 20).join(', ')}`);
        }
      }
    }
  } catch (e) {
    console.log(`\n--- __NEXT_DATA__ 解析失败: ${e.message}`);
  }
}

main().catch(error => {
  console.error('调试失败:', error.message);
  process.exit(1);
});
