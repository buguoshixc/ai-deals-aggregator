#!/usr/bin/env node
/**
 * 词频探测：抓取页面并统计关键词出现次数，并打印首处上下文。
 * 用于判断页面正文是否真的包含目标信息（而非被 JS 渲染的空壳）。
 *
 * 用法：node scripts/tools/term-count.js <url> 关键词1 关键词2 ...
 */

const cheerio = require('cheerio');
const { getText } = require('../lib/http');

async function main() {
  const [url, ...terms] = process.argv.slice(2);
  if (!url || !terms.length) {
    console.error('用法: node scripts/tools/term-count.js <url> 关键词...');
    process.exit(1);
  }

  const html = await getText(url, { timeout: 25000 });
  const $ = cheerio.load(html);
  $('script,style,noscript,svg').remove();
  const text = $('body').text().replace(/\s+/g, ' ').trim();

  console.log(`URL      : ${url}`);
  console.log(`HTML     : ${html.length} 字节`);
  console.log(`正文     : ${text.length} 字符`);
  console.log(`正文字数/HTML = ${(text.length / html.length * 100).toFixed(1)}%（过低说明是 JS 空壳）\n`);

  for (const term of terms) {
    const count = text.split(term).length - 1;
    const at = text.indexOf(term);
    console.log(`${term.padEnd(12)} ${String(count).padStart(4)} 次`);
    if (at >= 0) {
      console.log(`    …${text.slice(Math.max(0, at - 80), at + 160)}…\n`);
    } else {
      console.log('    (未出现)\n');
    }
  }
}

main().catch(error => {
  console.error('探测失败:', error.message);
  process.exit(1);
});
