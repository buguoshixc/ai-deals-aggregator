#!/usr/bin/env node
/**
 * t13 取证脚本（只读、只发公开 GET）：回答一个问题 ——
 * **futurepedia 的 HTTP 403 是「UA/头不完备」还是「对非浏览器客户端一律 403」？**
 *
 * 判据：同一 URL、同一台机器、只改请求头，看状态码是否变化。
 * 若加满浏览器头仍 403 ⇒ repair 路径（改头）无效，只能 headless migration 或 keep-degraded。
 * 本脚本**不修改任何生产文件**，只打印结果。
 */
'use strict';

const path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const axios = require(path.join(ROOT, 'node_modules', 'axios'));

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

const CASES = [
  ['A 现状（http.js 默认 UA + Accept-Language + Referer）', {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      Referer: 'https://www.futurepedia.io/'
    }
  }],
  ['B 满浏览器头（sec-ch-ua / sec-fetch-* / br）', {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
      'sec-ch-ua': '"Chromium";v="125", "Not.A/Brand";v="24", "Google Chrome";v="125"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1'
    }
  }],
  ['C 无 UA（对照：是否 UA 驱动）', { headers: {} }],
  ['D 只看 robots.txt（对照）', { headers: { 'User-Agent': UA }, url: 'https://www.futurepedia.io/robots.txt' }]
];

function shape(body) {
  const text = String(body || '');
  return {
    bytes: text.length,
    nextData: /__NEXT_DATA__/.test(text),
    toolLinks: (text.match(/\/tool\//g) || []).length,
    cfChallenge: /just a moment|cf-browser-verification|Enable JavaScript and cookies/i.test(text),
    title: (text.match(/<title[^>]*>([\s\S]{0,80}?)<\/title>/i) || [null, ''])[1].trim()
  };
}

(async () => {
  console.log('futurepedia 403 取证（同一 URL，只改请求头）');
  for (const [label, cfg] of CASES) {
    const url = cfg.url || 'https://www.futurepedia.io/';
    try {
      const res = await axios.get(url, {
        timeout: 20000,
        maxRedirects: 5,
        validateStatus: s => s < 400,
        responseType: 'text',
        headers: cfg.headers
      });
      console.log(`  ${label} → HTTP ${res.status} ${JSON.stringify(shape(res.data))}`);
    } catch (error) {
      const status = error.response && error.response.status;
      const server = error.response && error.response.headers && (error.response.headers.server || '');
      console.log(`  ${label} → FAIL ${status ? `HTTP ${status}` : (error.code || error.message)} server=${server}`);
      if (error.response && error.response.data) console.log(`       body: ${JSON.stringify(shape(error.response.data))}`);
    }
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
})();
