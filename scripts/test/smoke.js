#!/usr/bin/env node
'use strict';
/**
 * Release smoke（L5）—— 部署之后对**线上站点**抽少量关键页。
 *
 * ## 为什么它不是「再跑一遍门禁」
 *
 * Full Gate 有 852 项真浏览器断言、48 个步骤，跑的是本地 `dist/`。发布之后要回答的问题
 * 完全不同，而且只有三个：
 *   ① **线上真的存在这些页面吗**（部署有没有漏文件 / 路由有没有 404）；
 *   ② **线上那一份和本地构建的那一份是同一份吗**（canonical 指向线上、占位符没有漏解析）；
 *   ③ **最要命的几个 SEO 事实还在吗**（title / JSON-LD 可解析、canonical 自指）。
 * 所以这里只取**一条路由清单 + 五条断言**，用普通 HTTP（不起浏览器）——
 * 快、稳、不重复门禁，失败了也知道该去看什么。
 *
 * 用法：
 *   node scripts/test/smoke.js                       # 站点地址取 lib/site.js 的 SITE_URL
 *   node scripts/test/smoke.js --url=https://…/      # 指定其它部署（预发 / PR preview）
 */
const https = require('https');
const http = require('http');
// 站点常量（SITE_URL）的唯一出处：t2 起从订阅层的 `feeds.js` 改指 `site.js`
// （订阅层整体下架，常量不能跟着陪葬；这个脚本只用它的 SITE_URL 拼线上地址）。
const { SITE_URL } = require('../lib/site');
// 订阅文件名与 MIME 的唯一出处（`FEED_FILES`）—— 本文件**不写第二份文件名 / MIME 字面量**，
// 与 `feed-selftest` 的「4 个读写方扫描」是同一条纪律（那份扫描面里没有本文件，
// 但「唯一表」这件事不该靠「有没有被扫到」来决定）。
const { FEED_FILES } = require('../lib/feed');

const arg = name => (process.argv.find(a => a.startsWith(`--${name}=`)) || '').slice(name.length + 3);

/**
 * 关键页清单：每个**页面族**各取一条代表。
 * 之所以不是「全部 186 页」：那正是 Full Gate 做的事；smoke 要的是「部署没漏东西」的信号，
 * 一族一条就足以发现整族缺席（而整族缺席才是发布事故的常见形态）。
 *
 * t2：`feeds/`（订阅中心）与 `docs/data/`（数据出口）两条从一个清单里删掉 —— 这两个页面族
 * 本轮整体下架，线上不再存在。留着它们等于让冒烟门禁去请求两个**注定 404** 的地址。
 */
const ROUTES = [
  ['', '首页'],
  ['student/', '专题集合页'],
  ['status/', '状态页'],
  ['changes/', '变化页'],
  ['plans/coding/', '套餐对比页'],
  ['plans/api/', 'API 计费页'],
  ['tools/api-cost/', 'API 成本计算器'],
  ['models/', '模型资料索引'],
  ['vendor/', '厂商枢纽'],
  ['archive/', '历史档案']
];

const ORIGIN = (arg('url') || SITE_URL).replace(/\/$/, '');

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https:') ? https : http;
    const req = mod.get(url, { headers: { 'user-agent': 'ai-deals-smoke/1 (+architecture-modernization-v1)' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(fetchText(new URL(res.headers.location, url).href));
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', c => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(new Error('timeout')); });
  });
}

const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); };

(async () => {
  console.log(`Release smoke → ${ORIGIN}（${ROUTES.length} 条关键路由）\n`);
  let dealRoute = null;
  try {
    const sitemap = await fetchText(`${ORIGIN}/sitemap.xml`);
    const locs = (sitemap.body.match(/<loc>([^<]*)<\/loc>/g) || []).map(s => s.replace(/<\/?loc>/g, ''));
    const deal = locs.find(u => /\/deal\/[^/]+\/$/.test(u));
    const model = locs.find(u => /\/models\/[^/]+\/$/.test(u.replace(ORIGIN, '')) && !/\/models\/$/.test(u));
    if (deal) dealRoute = deal.replace(ORIGIN, '').replace(/^\//, '');
    if (model) ROUTES.push([model.replace(ORIGIN, '').replace(/^\//, ''), '模型详情页（抽样）']);
    check('线上 sitemap 可读且非空', locs.length > 0, `${locs.length} 条 URL`);
  } catch (e) {
    check('线上 sitemap 可读且非空', false, e.message);
  }
  if (dealRoute && !ROUTES.some(([r]) => r === dealRoute)) ROUTES.push([dealRoute, '优惠详情页（抽样）']);

  for (const [route, label] of ROUTES) {
    const url = `${ORIGIN}/${route}`;
    try {
      const { status, body } = await fetchText(url);
      const problems = [];
      if (status !== 200) problems.push(`HTTP ${status}`);
      const title = (body.match(/<title>([\s\S]*?)<\/title>/i) || ['', ''])[1].trim();
      if (!title) problems.push('无 <title>');
      const canonical = (body.match(/<link\s+rel="canonical"\s+href="([^"]*)"/i) || ['', ''])[1];
      if (!canonical) problems.push('无 canonical');
      else if (canonical.replace(/\/$/, '') !== url.replace(/\/$/, '')) problems.push(`canonical 不是自指：${canonical}`);
      // 占位符漏解析 = 构建/部署链断在了中间，这是最该在线上抓到的形态
      const leftover = ['__SITE_URL__', '__PREFIX__', 'ANALYTICS:BOOTSTRAP', 'PRERENDER:'].filter(m => body.includes(m));
      if (leftover.length) problems.push(`残留占位符：${leftover.join(', ')}`);
      const ld = body.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi) || [];
      if (!ld.length) problems.push('无 JSON-LD');
      else {
        for (const block of ld) {
          const inner = block.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '');
          try { JSON.parse(inner); } catch (e) { problems.push('JSON-LD 不可解析'); break; }
        }
      }
      check(`${label}  /${route}`, problems.length === 0, problems.length ? problems.join('；') : `${title.slice(0, 40)}`);
    } catch (e) {
      check(`${label}  /${route}`, false, e.message);
    }
  }

  /* ── 订阅产物探针（v3.2 新增；**刻意不进 ROUTES**）─────────────────────────────
   *
   * 为什么不能当页面走 ROUTES：那一条链路的判据是 title / canonical 自指 / JSON-LD 可解析 /
   * 无残留占位符 —— 一份 Atom 文档四样都没有，必然全红；而「feed 不是页面」恰恰是它该有的样子。
   *
   * 为什么要有这条探针：订阅产物是「**整族缺席**」型发布事故的典型 —— 文件没进产物、
   * 或部署漏掉了根目录下的那两个文件，而**所有页面、sitemap、canonical 全都正常**，
   * 只有订阅者拿到 404 / 一个空文档 / 一份被中间层改过的 HTML 错误页。
   * 所以这里只问三件事：HTTP 200、响应体非空、文档里带着**该格式**的预期标记；
   * 失败必须**点名是哪一个文件**（订阅者遇到的是哪一个，就修哪一个）。
   *
   * 标记为什么在本文件里独立写出（而不是从 feed.js 的渲染器取）：这是对**线上那一份**的
   * 外部验收 —— 判据要与生成侧不同源，否则「两边一起错」也能过；Atom 的根元素命名空间与
   * JSON Feed 的版本串是协议常量，不是本仓的「唯一表」（唯一表是文件名与 MIME，见上）。
   * -------------------------------------------------------------------------- */
  for (const [file, type] of FEED_FILES) {
    const label = `订阅产物 ${file}`;
    const url = `${ORIGIN}/${file}`;
    try {
      const { status, body } = await fetchText(url);
      const problems = [];
      if (status !== 200) problems.push(`HTTP ${status}`);
      if (!body.trim()) problems.push('响应体是空的');
      // 只有在真的拿到一份文档时才看格式标记：404 / 空响应体下那份错误页会让
      // 「不是 Atom / 不是 JSON」这类判据变成噪声，把第一原因（HTTP 404）淹在后面。
      if (!problems.length) {
        if (String(type).includes('xml')) {
          if (!/^<\?xml\b/.test(body.trim())) problems.push('缺 XML 声明（<?xml … ?>）');
          if (!/<feed\b[^>]*xmlns="http:\/\/www\.w3\.org\/2005\/Atom"/.test(body)) problems.push('不是 Atom 文档（缺 <feed xmlns="…/2005/Atom">）');
        } else {
          let parsed = null;
          try { parsed = JSON.parse(body); } catch (e) { problems.push(`不是合法 JSON（${e.message.slice(0, 40)}）`); }
          if (parsed) {
            if (String(parsed.version || '') !== 'https://jsonfeed.org/version/1.1') {
              problems.push(`不是 JSON Feed 1.1（version=${JSON.stringify(parsed.version)}）`);
            }
            if (!Array.isArray(parsed.items)) problems.push('缺 items 数组');
          }
        }
      }
      check(`${label}  /${file}`, problems.length === 0,
        problems.length ? problems.join('；') : `${Buffer.byteLength(body, 'utf8')} 字节 · ${type}`);
    } catch (e) {
      check(`${label}  /${file}`, false, e.message);
    }
  }

  const failed = results.filter(r => !r.ok);
  console.log(`\n${failed.length ? '❌' : '✅'} 线上冒烟 ${results.length} 项，失败 ${failed.length} 项`);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
