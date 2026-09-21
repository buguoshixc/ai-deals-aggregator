#!/usr/bin/env node
/**
 * 渲染态探测：用无头浏览器渲染公开页，再判断"这个源值不值得写 headless 采集器"。
 *
 * 与 find-offers.js / term-count.js 的区别：那两个走静态 fetch，对 SPA 只能看到空壳；
 * 本工具渲染后取 DOM，因此能看到 JS 注入的真实正文。
 *
 * 用法：
 *   node scripts/tools/render-source.js <url> [url2 ...]        # 概览：正文比 + 优惠信号命中
 *   node scripts/tools/render-source.js <url> --rows            # 额外打印表格结构
 *   node scripts/tools/render-source.js <url> --text            # 额外打印正文前 2000 字
 *   node scripts/tools/render-source.js <url> --screenshot=a.png
 */

const cheerio = require('cheerio');
const { renderAll, detectChannel } = require('../lib/browser');

const DEFAULT_PATTERN = '免费|赠送|优惠|折扣|立减|限时|领取|试用|额度|免费额度|抵扣';

function offerHits($, html, pattern) {
  const re = new RegExp(pattern);
  const seen = new Set();
  const hits = [];

  const push = (text, where) => {
    const clean = String(text).replace(/\s+/g, ' ').trim();
    if (!clean || clean.length < 6 || !re.test(clean)) return;
    const key = clean.slice(0, 50);
    if (seen.has(key)) return;
    seen.add(key);
    hits.push({ where, text: clean.slice(0, 240) });
  };

  $('table tr').each((_, row) => push($(row).text(), 'table'));
  $('h1,h2,h3,h4').each((_, h) => push($(h).text(), 'heading'));
  $('li').each((_, li) => push($(li).text(), 'li'));
  $('p,div,span').each((_, el) => {
    if ($(el).children('p,div,table,ul,li').length === 0) push($(el).text(), 'text');
  });

  return hits;
}

function printRows($, grep) {
  let printed = 0;
  $('table').each((ti, table) => {
    if (printed >= 6) return;
    const rows = $(table).find('tr');
    if (rows.length < 2) return;
    if (grep && !grep.test($(table).text())) return;
    printed += 1;
    console.log(`\n  ── 表格 #${ti}（${rows.length} 行）`);
    rows.slice(0, 15).each((_, row) => {
      const cells = $(row)
        .find('td,th')
        .map((__, cell) => $(cell).text().replace(/\s+/g, ' ').trim().slice(0, 80))
        .get();
      console.log(`     | ${cells.join(' | ')}`);
    });
  });
}

function printHtml($, grep, limit = 4000) {
  let printed = 0;
  $('table').each((ti, table) => {
    if (printed >= 3) return;
    if (grep && !grep.test($(table).text())) return;
    printed += 1;
    console.log(`\n  ── 表格 #${ti} 原始 HTML（前 ${limit} 字）`);
    console.log($(table).html().replace(/\s+/g, ' ').slice(0, limit));
  });
}

async function main() {
  const args = process.argv.slice(2);
  const urls = args.filter(a => !a.startsWith('--'));
  const showRows = args.includes('--rows');
  const showHtml = args.includes('--html');
  const showText = args.includes('--text');
  const shot = args.find(a => a.startsWith('--screenshot='));
  const patternArg = args.find(a => a.startsWith('--pattern='));
  const grepArg = args.find(a => a.startsWith('--grep='));

  if (!urls.length) {
    console.error('用法: node scripts/tools/render-source.js <url> [url2 ...] [--rows] [--grep=文本] [--text]');
    process.exit(1);
  }

  const channel = await detectChannel();
  if (!channel) {
    console.error('未找到浏览器内核：请安装 Microsoft Edge / Google Chrome，或执行 npx playwright install chromium');
    process.exit(1);
  }
  console.log(`浏览器内核: ${channel}\n`);

  const results = await renderAll(urls, {
    screenshot: shot ? shot.slice('--screenshot='.length) : null
  });
  const pattern = patternArg ? patternArg.slice('--pattern='.length) : DEFAULT_PATTERN;

  for (const result of results) {
    console.log('='.repeat(72));
    console.log(`URL   : ${result.url}`);
    if (result.error) {
      console.log(`失败  : ${result.error}\n`);
      continue;
    }
    const $ = cheerio.load(result.html);
    $('script,style,noscript,svg').remove();

    const ratio = result.html.length ? ((result.text.length / result.html.length) * 100).toFixed(1) : '0';
    console.log(`标题  : ${result.title}`);
    console.log(`HTML  : ${result.html.length} 字节 / 正文 ${result.text.length} 字符 = ${ratio}%`);
    console.log(`表格  : ${$('table').length} 个`);

    const hits = offerHits($, result.html, pattern);
    console.log(`优惠信号: ${hits.length} 条`);
    hits.slice(0, 25).forEach((hit, index) => {
      console.log(`  [${index}] (${hit.where}) ${hit.text}`);
    });
    if (hits.length > 25) console.log(`  ...（其余 ${hits.length - 25} 条省略）`);

    if (showRows) printRows($, grepArg ? new RegExp(grepArg.slice('--grep='.length)) : null);
    if (showHtml) printHtml($, grepArg ? new RegExp(grepArg.slice('--grep='.length)) : null, 2500);
    if (showText) {
      console.log('\n  ── 正文前 2000 字');
      console.log(`  ${result.text.slice(0, 2000)}`);
    }
    console.log('');
  }
}

main().catch(error => {
  console.error('探测失败:', error.message);
  process.exit(1);
});
