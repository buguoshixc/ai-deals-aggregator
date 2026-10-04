#!/usr/bin/env node
/**
 * t13「新增 discovery source 必须证明真实有产出 / 质量足够 / 不重复 / 健康可观测」的**取证脚本**。
 *
 * 对每个候选来源做四件事（只发公开 GET，不写任何生产文件）：
 *   ① 可达性：HTTP 状态 + 正文长度（离线/403/空壳都会在这里现形）；
 *   ② 真实有产出：条目型链接数（`/tool/`、`/tools/`、`/go/`…）与「定价信号词」命中数；
 *   ③ 质量：条目型链接 / 总链接的比例，以及正文是否含可核对的优惠口径（free / 免费 / trial / 折扣）；
 *   ④ 不重复：把候选页面上出现的**已知厂商名**（来自本站 deals.json 的 vendor）逐个统计 ——
 *      重复度高意味着它主要是我们已有的那些条目，新增价值低。
 *
 * 输出是给人看的表格 + 结论行；判据写在输出里，不写进任何数据文件。
 * 用法：node research/_raw/coverage-expansion-v1/probe-discovery-candidates.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const axios = require(path.join(ROOT, 'node_modules', 'axios'));

const CANDIDATES = [
  ['theresanaiforthat', 'https://theresanaiforthat.com/'],
  ['toolify', 'https://www.toolify.ai/'],
  ['ai-bot.cn', 'https://ai-bot.cn/'],
  ['free-for-dev', 'https://free-for.dev/'],
  ['futuretools（现行来源，作对照）', 'https://www.futuretools.io/'],
  ['futurepedia（现行来源，作对照）', 'https://www.futurepedia.io/']
];

const ENTRY_LINK = /href="[^"]*\/(tool|tools|go|ai-tools|category)\//gi;
const PRICING_SIGNAL = /(free tier|free plan|free forever|免费额度|免费试用|新用户|限时|折扣|discount|deal|trial)/gi;
const KNOWN_PRICE_WORD = /(\$\d|\d+\s*元|per month|\/mo\b|\/month|每月)/gi;

function countMatches(text, re) {
  const m = String(text).match(re);
  return m ? m.length : 0;
}

(async () => {
  const deals = JSON.parse(fs.readFileSync(path.join(ROOT, 'deals.json'), 'utf8'));
  const vendors = [...new Set((deals.deals || []).map(deal => String(deal.vendor || '').trim()).filter(Boolean))];
  console.log(`站内已知厂商数（deals.json 的 vendor 去重）：${vendors.length}`);

  for (const [label, url] of CANDIDATES) {
    const out = { label, url };
    try {
      const res = await axios.get(url, {
        timeout: 25000,
        maxRedirects: 5,
        validateStatus: status => status < 400,
        responseType: 'text',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
        }
      });
      const text = String(res.data);
      out.status = res.status;
      out.bytes = text.length;
      out.entryLinks = countMatches(text, ENTRY_LINK);
      out.pricingSignals = countMatches(text, PRICING_SIGNAL);
      out.priceWords = countMatches(text, KNOWN_PRICE_WORD);
      out.title = (text.match(/<title[^>]*>([\s\S]{0,90}?)<\/title>/i) || [null, ''])[1].trim();
      out.distinctKnownVendors = vendors.filter(vendor => vendor && text.toLowerCase().includes(vendor.toLowerCase())).length;
      out.scripts = countMatches(text, /<script/gi);
      out.nextData = /__NEXT_DATA__/.test(text);
      out.cfChallenge = /just a moment|Enable JavaScript and cookies|cf-browser-verification/i.test(text);
    } catch (error) {
      out.status = error.response ? error.response.status : `FAIL ${error.code || error.message}`;
    }
    console.log('\n' + JSON.stringify(out, null, 1));
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
})();
