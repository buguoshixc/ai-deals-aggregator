'use strict';
/**
 * v6-fix 原始截图（只读页面）。
 * 用法：node mockups/v6-fix/_tools/shoot-fix.js --page=after --w=1440 --h=1800 --theme=light
 * 说明：Linux headless 默认隐藏滚动条；这里用 ignoreDefaultArgs 关掉 --hide-scrollbars，
 * 只保留 .fmembers 这类内部滚动条（Windows 的缺陷条件），再单独隐藏页面级竖滚动条。
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '../../..');
const arg = (name, def) => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : def;
};
const PAGE = arg('page', 'before');
const W = Number(arg('w', 1440));
const H = Number(arg('h', 1800));
const THEME = arg('theme', 'light');
const OUT = arg('out', `mockups/v6-fix/shots/${PAGE}-${W}-${THEME}.png`);
const URL_ = `http://127.0.0.1:8081/mockups/v6-fix/${PAGE}.html`;

(async () => {
  const browser = await chromium.launch({
    headless: true,
    ignoreDefaultArgs: ['--hide-scrollbars'],
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  const ctx = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 2,
    colorScheme: THEME === 'dark' ? 'dark' : 'light'
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 300)));
  await page.route('**/*', route => {
    if (!route.request().url().startsWith('http://127.0.0.1:8081/')) return route.abort();
    return route.continue();
  });
  await page.goto(URL_, { waitUntil: 'load', timeout: 30000 });
  try { await page.waitForLoadState('networkidle', { timeout: 8000 }); } catch (e) {}
  await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), THEME);
  await page.waitForTimeout(500);
  if (PAGE === 'after') {
    await page.evaluate(() => { if (window.__v6patch) window.__v6patch(); });
    await page.waitForTimeout(400);
  }
  // 只隐藏页面级竖滚动条，保留 .fmembers 内部横向滚动条（Windows 条件）
  await page.addStyleTag({ content: 'html::-webkit-scrollbar{width:0!important;height:0!important;display:none!important}' });
  await page.waitForTimeout(250);

  const metrics = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('#dealsList article.g')];
    const fm = [...document.querySelectorAll('.fmembers')];
    const grid = document.getElementById('dealsList');
    return {
      cards: cards.length,
      documentClientWidth: document.documentElement.clientWidth,
      innerWidth,
      gridTop: grid ? +grid.getBoundingClientRect().top.toFixed(2) : null,
      fm: fm.map(e => { const card = e.closest('article.g'); const h3 = card && card.querySelector('h3'); return { card: h3 ? h3.textContent.trim() : '', scrollW: e.scrollWidth, clientW: e.clientWidth, offsetH: e.offsetHeight, clientH: e.clientHeight }; })
    };
  });

  const p = path.isAbsolute(OUT) ? OUT : path.join(ROOT, OUT);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  await page.screenshot({ path: p, fullPage: false });
  console.log(JSON.stringify({ page: PAGE, viewport: { W, H, THEME }, ...metrics, errors, out: p }, null, 1));
  await browser.close();
})().catch(e => { console.error('SHOOT FAIL', e); process.exit(1); });
