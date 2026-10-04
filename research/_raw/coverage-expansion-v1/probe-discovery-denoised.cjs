#!/usr/bin/env node
/**
 * t13：候选来源的**去噪复核**（第二轮）。第一轮的数字暴露了三个问题，这里逐条修正：
 *
 *   1. 原始 HTML 里的 `deal` 命中会落在 JS/CSS/class 名上（theresanaiforthat 6.2MB、deal=387
 *      —— 那是脚本噪声，不是 387 条优惠）。所以先**剥掉 script/style** 再看正文。
 *   2. free-for.dev 的静态页只有 3.5KB 空壳（正文由脚本渲染），但它的**源文 README**
 *      是纯文本、结构清晰。要判断它值不值得接，就得看它到底有多少条、其中多少条与 AI 相关。
 *   3. 「不重复」要按**站内已有厂商**衡量，而不是按词。这里对剥离后的正文再数一遍已知厂商名。
 *
 * 只发公开 GET，不写任何生产文件。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const axios = require(path.join(ROOT, 'node_modules', 'axios'));

const DEAL_WORDS = [
  ['免费额度', /免费额度/g], ['免费试用', /免费试用/g], ['新用户', /新用户/g],
  ['限时', /限时/g], ['折扣', /折扣/g], ['赠送', /赠送/g],
  ['free tier', /free tier/gi], ['free plan', /free plan/gi], ['free trial', /free trial/gi],
  ['coupon', /coupon/gi], ['discount', /discount/gi], ['deal', /deal/gi]
];
const AI_WORDS = [/\bAI\b/g, /artificial intelligence/gi, /\bLLM\b/g, /GPT/g, /machine learning/gi, /大模型/g];

function stripHtml(text) {
  return String(text)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ');
}

function countAll(text, regexes) {
  return regexes.reduce((sum, re) => sum + ((String(text).match(re) || []).length), 0);
}

(async () => {
  const deals = JSON.parse(fs.readFileSync(path.join(ROOT, 'deals.json'), 'utf8'));
  const vendors = [...new Set((deals.deals || []).map(deal => String(deal.vendor || '').trim()).filter(Boolean))];
  const ua = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.9,*/*;q=0.8'
  };

  /* ---- A. HTML 候选：剥脚本后重数 ---- */
  for (const [label, url] of [
    ['theresanaiforthat', 'https://theresanaiforthat.com/'],
    ['toolify', 'https://www.toolify.ai/'],
    ['ai-bot.cn', 'https://ai-bot.cn/'],
    ['futuretools（对照）', 'https://www.futuretools.io/'],
    ['futurepedia（对照）', 'https://www.futurepedia.io/']
  ]) {
    try {
      const res = await axios.get(url, { timeout: 25000, maxRedirects: 5, validateStatus: s => s < 400, responseType: 'text', headers: ua });
      const raw = String(res.data);
      const text = stripHtml(raw);
      const hits = DEAL_WORDS.map(([name, re]) => [name, (text.match(re) || []).length]).filter(([, n]) => n > 0);
      const vendorsHit = vendors.filter(vendor => vendor.length > 1 && text.toLowerCase().includes(vendor.toLowerCase()));
      console.log(`\n[A] ${label} 原始 ${raw.length}B → 正文 ${text.length}B`);
      console.log(`    优惠词（剥脚本后）：${hits.length ? hits.map(([n, c]) => `${n}=${c}`).join(' · ') : '（零命中）'}`);
      console.log(`    已知厂商命中：${vendorsHit.length}/${vendors.length} → ${vendorsHit.slice(0, 8).join(', ')}${vendorsHit.length > 8 ? ' …' : ''}`);
    } catch (error) {
      console.log(`\n[A] ${label} → FAIL ${error.response ? `HTTP ${error.response.status}` : (error.code || error.message)}`);
    }
    await new Promise(r => setTimeout(r, 2000));
  }

  /* ---- B. free-for.dev 源文 README：多少条、多少与 AI 相关 ---- */
  try {
    const res = await axios.get('https://raw.githubusercontent.com/ripienaar/free-for-dev/master/README.md', {
      timeout: 25000, responseType: 'text', headers: ua
    });
    const md = String(res.data);
    const bullets = (md.match(/^\s*[-*]\s+\S/gm) || []).length;
    const headings = (md.match(/^#{2,3}\s+\S/gm) || []).length;
    const aiHits = DEAL_WORDS.length && countAll(md, AI_WORDS);
    const aiBullets = (md.match(/^\s*[-*].*(\bAI\b|LLM|GPT|machine learning)/gim) || []).length;
    const dealHits = DEAL_WORDS.map(([name, re]) => [name, (md.match(re) || []).length]).filter(([, n]) => n > 0);
    const vendorsHit = vendors.filter(vendor => vendor.length > 1 && md.toLowerCase().includes(vendor.toLowerCase()));
    console.log(`\n[B] free-for.dev README（源文）`);
    console.log(`    长度 ${md.length}B · 列表项 ${bullets} 条 · 章节 ${headings} 个`);
    console.log(`    优惠词：${dealHits.map(([n, c]) => `${n}=${c}`).join(' · ')}`);
    console.log(`    AI 相关词命中 ${aiHits} 次 · **AI 相关列表项仅 ${aiBullets} 条**（占 ${bullets ? (aiBullets / bullets * 100).toFixed(1) : '0'}%）`);
    console.log(`    已知厂商命中：${vendorsHit.length}/${vendors.length} → ${vendorsHit.slice(0, 8).join(', ') || '（无）'}`);
  } catch (error) {
    console.log(`\n[B] free-for.dev README → FAIL ${error.response ? `HTTP ${error.response.status}` : (error.code || error.message)}`);
  }
})();
