#!/usr/bin/env node
/**
 * t43 —— 发布说明里「首页有没有变」的现场读数（只读）。
 *
 * 卡片计数用与 `verify-site.js` 同一支选择器语义（`article.g`），在 HTML 上按
 * `<article … class="… g …">` 数；同时给出字节数与两个可读信号（feed 声明条数、页脚路由链接数）。
 *
 * 用法：node research/_raw/t43/homepage-probe.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const BASE = 'https://buguoshixc.github.io/ai-deals-aggregator/';
const count = (text, needle) => text.split(needle).length - 1;
const cards = text => (text.match(/<article[^>]*class="[^"]*\bg\b[^"]*"/g) || []).length;

(async () => {
  const live = await (await fetch(BASE, { cache: 'no-store', signal: AbortSignal.timeout(30000) })).text();
  const local = fs.readFileSync(path.join(ROOT, 'dist/index.html'), 'utf8');
  const row = {
    liveCards: cards(live),
    localCards: cards(local),
    liveAlternates: count(live, 'rel="alternate"'),
    localAlternates: count(local, 'rel="alternate"'),
    liveFooterRoutes: count(live, 'class="flink"') || count(live, 'href="../'),
    localFooterRoutes: count(local, 'class="flink"') || count(local, 'href="../'),
    liveBytes: Buffer.byteLength(live, 'utf8'),
    localBytes: Buffer.byteLength(local, 'utf8'),
    bytesIdentical: Buffer.byteLength(live, 'utf8') === Buffer.byteLength(local, 'utf8'),
    liveHasModelsEntry: live.includes('模型资料索引'),
    localHasModelsEntry: local.includes('模型资料索引')
  };
  console.log('=== 首页：线上（旧版）vs 本地（新版）===');
  for (const [key, value] of Object.entries(row)) console.log(`  ${key} = ${value}`);
  fs.writeFileSync(path.join(__dirname, 'homepage-probe.json'), `${JSON.stringify(row, null, 2)}\n`, 'utf8');
})().catch(error => {
  console.error(`⛔ 首页对照失败：${String((error && error.message) || error)}`);
  process.exit(2);
});
