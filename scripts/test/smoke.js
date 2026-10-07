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
 *   node scripts/test/smoke.js                       # 站点地址取 lib/feeds.js 的 SITE_URL
 *   node scripts/test/smoke.js --url=https://…/      # 指定其它部署（预发 / PR preview）
 */
const https = require('https');
const http = require('http');
const { SITE_URL } = require('../lib/feeds');

const arg = name => (process.argv.find(a => a.startsWith(`--${name}=`)) || '').slice(name.length + 3);

/**
 * 关键页清单：每个**页面族**各取一条代表。
 * 之所以不是「全部 186 页」：那正是 Full Gate 做的事；smoke 要的是「部署没漏东西」的信号，
 * 一族一条就足以发现整族缺席（而整族缺席才是发布事故的常见形态）。
 */
const ROUTES = [
  ['', '首页'],
  ['student/', '专题集合页'],
  ['status/', '状态页'],
  ['changes/', '变化页'],
  ['feeds/', '订阅中心'],
  ['plans/coding/', '套餐对比页'],
  ['plans/api/', 'API 计费页'],
  ['models/', '模型资料索引'],
  ['vendor/', '厂商枢纽'],
  ['archive/', '历史档案'],
  ['docs/data/', '数据出口']
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

  const failed = results.filter(r => !r.ok);
  console.log(`\n${failed.length ? '❌' : '✅'} 线上冒烟 ${results.length} 项，失败 ${failed.length} 项`);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
