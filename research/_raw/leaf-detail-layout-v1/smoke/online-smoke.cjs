#!/usr/bin/env node
/**
 * leaf-detail-layout-v1 · Online Smoke（**只打 3 个页面**）
 *
 * 为什么不用 verify-site.js --url=：那一支会把整站遍历一遍（含全部落地页/ID 页），
 * 而这个站有**真实 Analytics**。本轮的题面明确要求线上只检查「一个 Deal Detail /
 * 一个 Model Detail / 首页」。所以这里是一支一次性小脚本：
 *   · 首页       —— 只用来取一条真实 deal 路由，并断言首页**没有**被详情列波及；
 *   · deal 详情  —— 详情内容列的居中 / 宽度 / 同一轴 / 来源块宽度 / 390px 无横滚；
 *   · model 详情 —— 与 deal 用同一条宽度规则（叶子页一致性）。
 *
 * 数据取样全部走 HTTP JSON（deals.json / models.json）——取数据不是页面访问，
 * 不产生页面级 Analytics 事件。
 *
 * 用法（在 worktree 里跑，node_modules 里有 playwright-core）：
 *   node research/_raw/leaf-detail-layout-v1/smoke/online-smoke.cjs \
 *        --base=https://buguoshixc.github.io/ai-deals-aggregator/ \
 *        --out=research/_raw/leaf-detail-layout-v1/smoke/online-smoke.json
 *
 * 退出码：0 = 全部通过；1 = 有断言失败（逐条打印失败原因）。
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const arg = name => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

const BASE = (() => {
  const raw = arg('base') || 'https://buguoshixc.github.io/ai-deals-aggregator/';
  return raw.endsWith('/') ? raw : `${raw}/`;
})();
const OUT = arg('out');
const EDGE = process.env.DSH_EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

/** 与 index.html 的 .detail-main 同源：改样式必须同步改这里（这条断言的意义就是"线上真的是这个值"） */
const DETAIL_COL_MAX = 1120;
const WIDTH_BAND = [1080, 1120];
const CENTER_TOL = 8;
const AXIS_TOL = 1;

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: Boolean(ok), detail: detail || '' });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
};

/** 页面上量几何（与 verify-site.js 的判据**各自实现**：线上冒烟不依赖本地那份代码） */
const measure = page => page.evaluate(() => {
  const rect = sel => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) };
  };
  const src = document.querySelector('.dpane-src');
  const main = document.querySelector('main');
  const wrap = document.querySelector('.wrap');
  return {
    vw: window.innerWidth,
    docScroll: document.documentElement.scrollWidth,
    // ⚠️ 不要返回 DOM 节点本身（跨进程序列化会炸）：只要它的类名与几何
    mainClass: main ? String(main.className || '') : null,
    mainRect: rect('main'),
    wrapRect: rect('.wrap'),
    crumb: rect('.crumb'),
    pane: rect('.dpane'),
    more: rect('.dpane-more'),
    src: rect('.dpane-src'),
    srcWordBreak: src ? getComputedStyle(src).wordBreak : null,
    srcOverflowWrap: src ? getComputedStyle(src).overflowWrap : null,
    srcSelfOverflow: src ? src.scrollWidth - src.clientWidth : null
  };
});

const layoutProblems = (geo, { expectColumn = true } = {}) => {
  const problems = [];
  if (!geo.mainRect) { problems.push('没有 <main>'); return problems; }
  const m = geo.mainRect;
  if (expectColumn) {
    if (!String(geo.mainClass || '').split(/\s+/).includes('detail-main')) problems.push(`<main> 没有 detail-main（class=${geo.mainClass}）`);
    const skew = Math.abs(m.left - (geo.vw - m.right));
    if (skew > CENTER_TOL) problems.push(`居中偏差 ${skew}px > ${CENTER_TOL}px（left=${m.left} right=${m.right} vw=${geo.vw}）`);
    if (m.width < WIDTH_BAND[0] || m.width > WIDTH_BAND[1]) problems.push(`列宽 ${m.width}px 不在 [${WIDTH_BAND[0]}, ${WIDTH_BAND[1]}]（目标 ${DETAIL_COL_MAX}）`);
    const axis = [geo.crumb, geo.pane, geo.more, geo.src].filter(Boolean);
    if (axis.length >= 2) {
      const lefts = axis.map(r => r.left), rights = axis.map(r => r.right);
      const spread = Math.max(Math.max(...lefts) - Math.min(...lefts), Math.max(...rights) - Math.min(...rights));
      if (spread > AXIS_TOL) problems.push(`内容轴不一致：左右极差 ${spread}px > ${AXIS_TOL}px（${axis.map(r => `${r.left}~${r.right}`).join(' / ')}）`);
    }
  } else if (String(geo.mainClass || '').split(/\s+/).includes('detail-main')) {
    problems.push('首页 <main> 被加上了 detail-main（详情列波及了首页）');
  }
  if (geo.docScroll > geo.vw + 1) problems.push(`页面级横向溢出 ${geo.docScroll - geo.vw}px`);
  return problems;
};

(async () => {
  console.log(`Online Smoke · ${BASE}（只打 3 个页面 + 2 份 JSON）`);
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const evidence = { base: BASE, at: new Date().toISOString(), pages: {} };

  // ---------- ① 首页：取一条真实 deal 路由；断言首页没被波及 ----------
  const home = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const homeResp = await home.goto(BASE, { waitUntil: 'load' });
  check('首页 HTTP 200', homeResp && homeResp.status() === 200, `status=${homeResp ? homeResp.status() : '无响应'}`);
  const homeGeo = await measure(home);
  const homeProblems = layoutProblems(homeGeo, { expectColumn: false });
  check('首页没有被详情列波及（<main> 无 detail-main，且无横向溢出）', homeProblems.length === 0, homeProblems.join('；') || `main ${homeGeo.mainRect.width}px / wrap ${homeGeo.wrapRect.width}px`);
  const dealHref = await home.evaluate(() => {
    const a = document.querySelector('article.g .gt h3 a');
    return a ? a.getAttribute('href') : null;
  });
  evidence.pages.home = { status: homeResp ? homeResp.status() : null, geo: homeGeo };
  await home.close();

  // 取样用 JSON（不是页面访问）
  const dealId = await (async () => {
    try {
      const doc = await (await fetch(new URL('deals.json', BASE))).json();
      const deals = (doc.deals || []).filter(d => d.type === 'deal' && d.url);
      deals.sort((a, b) => String(b.url).length - String(a.url).length);
      const ernie = deals.find(d => /ERNIE-4\.5-Turbo-128K/.test(String(d.title || '')));
      return { longest: deals[0] ? deals[0].id : null, ernie: ernie ? ernie.id : null };
    } catch (error) {
      return { longest: null, ernie: null, error: error.message };
    }
  })();
  const dealRoute = dealId.ernie ? `deal/${dealId.ernie}/` : (dealHref || (dealId.longest ? `deal/${dealId.longest}/` : null));
  check('能确定一条 deal 详情路由（首页卡片链接 / deals.json）', Boolean(dealRoute), `${dealRoute}（ernie=${dealId.ernie || '无'} longest=${dealId.longest || '无'}）`);

  // ---------- ② deal 详情：桌面 + 手机 ----------
  if (dealRoute) {
    const deal = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const resp = await deal.goto(new URL(dealRoute, BASE).href, { waitUntil: 'load' });
    await deal.waitForSelector('.dpane', { timeout: 20000 });
    const geo = await measure(deal);
    const problems = layoutProblems(geo);
    check(`/${dealRoute} 桌面详情内容列（HTTP ${resp ? resp.status() : '?'}）`, resp && resp.status() === 200 && problems.length === 0,
      `main=${geo.mainRect ? `${geo.mainRect.width}px @${geo.mainRect.left}~${geo.mainRect.right}` : '无'} · 居中偏差 ${geo.mainRect ? Math.abs(geo.mainRect.left - (geo.vw - geo.mainRect.right)) : '?'}px` +
      (problems.length ? ` · ${problems.join('；')}` : ''));
    check(`/${dealRoute} 来源块与正文同宽（dpane-src ≈ detail-main，且不是 820）`,
      Boolean(geo.src && geo.mainRect) && Math.abs(geo.src.width - geo.mainRect.width) <= 1 && geo.src.width >= WIDTH_BAND[0],
      geo.src ? `src=${geo.src.width}px / main=${geo.mainRect.width}px` : '没有 .dpane-src');
    check(`/${dealRoute} 普通文本不被逐字符断行（word-break=normal）`,
      geo.srcWordBreak === 'normal' && geo.srcOverflowWrap === 'anywhere',
      `word-break=${geo.srcWordBreak} overflow-wrap=${geo.srcOverflowWrap}`);
    evidence.pages.deal = { route: dealRoute, status: resp ? resp.status() : null, geo };

    await deal.setViewportSize({ width: 390, height: 844 });
    await deal.waitForTimeout(150);
    const mobile = await measure(deal);
    check(`/${dealRoute} 390px 无横向溢出`, mobile.docScroll <= 391 && (mobile.srcSelfOverflow === null || mobile.srcSelfOverflow <= 1),
      `docScroll=${mobile.docScroll} · 来源块自身溢出=${mobile.srcSelfOverflow}`);
    evidence.pages.dealMobile = { geo: mobile };
    await deal.close();
  }

  // ---------- ③ model 详情：与 deal 同一条规则 ----------
  const slug = await (async () => {
    try {
      const doc = await (await fetch(new URL('models.json', BASE))).json();
      const models = doc.models || [];
      return models[0] ? models[0].slug : null;
    } catch (error) { return null; }
  })();
  if (slug) {
    const modelRoute = `models/${slug}/`;
    const model = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const resp = await model.goto(new URL(modelRoute, BASE).href, { waitUntil: 'load' });
    await model.waitForSelector('main', { timeout: 20000 });
    const geo = await measure(model);
    const problems = layoutProblems(geo);
    check(`/${modelRoute} 桌面详情内容列（HTTP ${resp ? resp.status() : '?'}）`, resp && resp.status() === 200 && problems.length === 0,
      `main=${geo.mainRect ? `${geo.mainRect.width}px @${geo.mainRect.left}~${geo.mainRect.right}` : '无'}` + (problems.length ? ` · ${problems.join('；')}` : ''));
    const dealWidth = evidence.pages.deal ? evidence.pages.deal.geo.mainRect.width : null;
    check('/deal 与 /models 叶子页共用同一条内容列宽度（一致性）',
      dealWidth !== null && geo.mainRect && Math.abs(geo.mainRect.width - dealWidth) <= 1,
      `deal=${dealWidth}px / model=${geo.mainRect ? geo.mainRect.width : '?'}px`);
    evidence.pages.model = { route: modelRoute, status: resp ? resp.status() : null, geo };
    await model.close();
  } else {
    check('能从线上 models.json 取到一个模型 slug', false, 'models.json 取不到（不制造假绿）');
  }

  await browser.close();

  const failed = results.filter(r => !r.ok);
  evidence.checks = results;
  evidence.failed = failed.length;
  if (OUT) {
    fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
    fs.writeFileSync(path.resolve(OUT), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
    console.log(`\n证据已写出：${OUT}`);
  }
  console.log(`\n${failed.length ? '❌' : '✅'} Online Smoke ${results.length} 项，失败 ${failed.length} 项`);
  if (failed.length) {
    failed.forEach(f => console.log(`   ✗ ${f.name} — ${f.detail}`));
    process.exit(1);
  }
})().catch(error => { console.error(`FAILED: ${error.message}`); process.exit(1); });
