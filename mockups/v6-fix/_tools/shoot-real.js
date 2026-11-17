#!/usr/bin/env node
/* v6 第 1 步收尾：从 dist（8080）截 3 张真图，口径与 mockups/v6-fix 的 after 图一致。
   1440×1800（第二屏）/ 1440×1800 暗色 / 390×900（首屏）。
   不写 dist；产物只落 mockups/v6-fix/real/。 */
const path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.resolve(__dirname, '../../..');
const OUT = path.join(ROOT, 'mockups/v6-fix/real');
const CHROME = path.join(process.env.HOME, '.cache/ms-playwright/chromium-1243/chrome-linux64/chrome');
const URL = 'http://127.0.0.1:8080/';

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROME,
    ignoreDefaultArgs: ['--hide-scrollbars'],
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  const jobs = [
    { name: 'after-1440-light', width: 1440, height: 1800, theme: 'light' },
    { name: 'after-1440-dark', width: 1440, height: 1800, theme: 'dark' },
    { name: 'after-390-light', width: 390, height: 900, theme: 'light' }
  ];
  for (const job of jobs) {
    const ctx = await browser.newContext({
      viewport: { width: job.width, height: job.height },
      deviceScaleFactor: 2,
      colorScheme: job.theme
    });
    const page = await ctx.newPage();
    await page.addInitScript(theme => {
      try { localStorage.setItem('theme', theme); } catch {}
    }, job.theme);
    await page.goto(URL, { waitUntil: 'load' });
    await page.waitForTimeout(900);
    await page.evaluate(theme => {
      document.documentElement.dataset.theme = theme;
      const s = document.createElement('style');
      s.textContent = 'html::-webkit-scrollbar{width:0!important;height:0!important;display:none!important}';
      document.head.appendChild(s);
    }, job.theme);
    await page.waitForTimeout(250);
    const out = path.join(OUT, `${job.name}.png`);
    await page.screenshot({ path: out });
    const stats = await page.evaluate(() => ({
      cards: document.querySelectorAll('#dealsList article.g').length,
      gridTop: Math.round(document.querySelector('#dealsList').getBoundingClientRect().top),
      firstTop: Math.round(document.querySelector('#dealsList article.g').getBoundingClientRect().top),
      firstBottom: Math.round(document.querySelector('#dealsList article.g').getBoundingClientRect().bottom),
      full900: [...document.querySelectorAll('#dealsList article.g')].filter(e => {
        const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= 900;
      }).length,
      openrouter: [...document.querySelectorAll('#dealsList article.g')].filter(e => e.querySelector('h3').textContent.includes('OpenRouter')).map(e => ({
        title: e.querySelector('h3').textContent.trim(), ids: e.dataset.dealIds.split(',').length,
        mc: e.dataset.modelCount, q: e.dataset.quota, links: e.querySelectorAll('.fmembers a').length
      })),
      fmembers: [...document.querySelectorAll('.fmembers')].map(e => ({ scrollW: e.scrollWidth, clientW: e.clientWidth, overflowX: getComputedStyle(e).overflowX }))
    }));
    console.log(job.name, JSON.stringify(stats));
    await ctx.close();
  }
  await browser.close();
})();
