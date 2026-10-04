#!/usr/bin/env node
/**
 * t13：候选来源的**逐词命中表** —— 把「有没有优惠信号」从一个形容词变成一组数字。
 *
 * 为什么需要：`pricingSignals` 之类的粗正则会把「free trial」与「pricing」混在一起。
 * 这里按**词**统计（每个词在本页出现多少次），于是"它有没有可采信的优惠口径"可以逐词复核：
 * 一个只有 "pricing"/"$" 的目录站与一个真的列「折扣 / 限时免费 / 新用户赠送」的来源，
 * 命中的列完全不同。
 *
 * 只发公开 GET，不写任何生产文件。
 */
'use strict';

const path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const axios = require(path.join(ROOT, 'node_modules', 'axios'));

const URLS = [
  ['theresanaiforthat', 'https://theresanaiforthat.com/'],
  ['toolify', 'https://www.toolify.ai/'],
  ['ai-bot.cn', 'https://ai-bot.cn/'],
  ['free-for-dev（静态）', 'https://free-for.dev/'],
  ['free-for-dev（README 原文）', 'https://raw.githubusercontent.com/ripienaar/free-for-dev/master/README.md'],
  ['futuretools（对照：现行来源）', 'https://www.futuretools.io/'],
  ['futurepedia（对照：现行来源）', 'https://www.futurepedia.io/']
];

/** 真正的「优惠/额度」词。前六条是中文侧口径，后六条是英文侧口径。 */
const WORDS = [
  ['免费额度', /免费额度/g],
  ['免费试用', /免费试用/g],
  ['新用户', /新用户/g],
  ['限时', /限时/g],
  ['折扣', /折扣/g],
  ['赠送', /赠送/g],
  ['free tier', /free tier/gi],
  ['free plan', /free plan/gi],
  ['free trial', /free trial/gi],
  ['coupon', /coupon/gi],
  ['discount', /discount/gi],
  ['deal', /deal/gi]
];

(async () => {
  for (const [label, url] of URLS) {
    try {
      const res = await axios.get(url, {
        timeout: 25000,
        maxRedirects: 5,
        validateStatus: status => status < 400,
        responseType: 'text',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8,text/plain;q=0.8'
        }
      });
      const text = String(res.data);
      const hits = WORDS.map(([name, re]) => [name, (text.match(re) || []).length]).filter(([, n]) => n > 0);
      const total = hits.reduce((sum, [, n]) => sum + n, 0);
      console.log(`\n${label} (HTTP ${res.status}, ${text.length} bytes) —— 优惠词合计 ${total}`);
      console.log('   ' + (hits.length ? hits.map(([name, n]) => `${name}=${n}`).join(' · ') : '（零命中）'));
    } catch (error) {
      console.log(`\n${label} → FAIL ${error.response ? `HTTP ${error.response.status}` : (error.code || error.message)}`);
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
})();
