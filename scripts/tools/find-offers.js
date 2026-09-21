#!/usr/bin/env node
/**
 * 优惠信号探测：抓取页面并打印包含"优惠/免费/赠送/额度/折扣"的上下文，
 * 用于判断某个来源是否真的存在可采集的优惠内容（而不是又一张价格表）。
 *
 * 用法：node scripts/tools/find-offers.js <url> [关键词正则]
 */

const cheerio = require('cheerio');
const { getText } = require('../lib/http');

const DEFAULT_PATTERN = '免费|赠送|优惠|折扣|立减|限时|白嫖|领取|试用|额度';

async function main() {
  const url = process.argv[2];
  const pattern = process.argv[3] || DEFAULT_PATTERN;
  if (!url) {
    console.error(`用法: node scripts/tools/find-offers.js <url> ["关键词正则"]`);
    process.exit(1);
  }

  const html = await getText(url, { timeout: 25000 });
  const $ = cheerio.load(html);
  $('script,style,noscript,svg').remove();

  const re = new RegExp(pattern, 'g');
  const seen = new Set();
  const hits = [];

  const push = (text, where) => {
    const clean = String(text).replace(/\s+/g, ' ').trim();
    if (!clean || clean.length < 6) return;
    if (!re.test(clean)) return;
    re.lastIndex = 0;
    const key = clean.slice(0, 60);
    if (seen.has(key)) return;
    seen.add(key);
    hits.push({ where, text: clean.slice(0, 260) });
  };

  $('table tr').each((_, row) => push($(row).text(), 'table'));
  $('li').each((_, li) => push($(li).text(), 'li'));
  $('h1,h2,h3,h4').each((_, h) => push($(h).text(), 'heading'));
  $('p,div').each((_, el) => {
    if ($(el).children('p,div,table,ul').length === 0) push($(el).text(), 'text');
  });

  console.log(`URL   : ${url}`);
  console.log(`长度  : ${html.length} 字节`);
  console.log(`命中  : ${hits.length} 条\n`);
  hits.slice(0, 40).forEach((hit, index) => {
    console.log(`[${index}] (${hit.where}) ${hit.text}`);
  });
  if (hits.length > 40) console.log(`...（其余 ${hits.length - 40} 条省略）`);
}

main().catch(error => {
  console.error('探测失败:', error.message);
  process.exit(1);
});
