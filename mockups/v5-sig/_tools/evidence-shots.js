'use strict';
/** 两张补充证据图：390 下的分带区、以及裁掉顶栏的 home/family 并排。 */
const path = require('path');
const { chromium } = require('playwright-core');
const OUT = path.resolve(__dirname, '..');
const BASE = 'http://127.0.0.1:8081/mockups/v5-sig';
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  // 1. 390 分带区
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/home-390.html`, { waitUntil: 'load' });
    await page.waitForTimeout(250);
    await page.evaluate(() => {
      const th = document.querySelector('.tierhead');
      const headerH = document.querySelector('.top').getBoundingClientRect().height;
      window.scrollTo(0, th.getBoundingClientRect().top + window.scrollY - headerH - 40);
    });
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(OUT, 'shots', 'home-390-tiers.png') });
    await ctx.close();
    console.log('shot home-390-tiers.png');
  }
  // 2. 裁掉顶栏的 home / family 并排
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 470 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      *{margin:0;padding:0;box-sizing:border-box}body{background:#eef0f3;font:12px/1.4 -apple-system,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;padding:10px 20px}
      h1{font-size:15px;color:#111827;margin-bottom:8px}
      .row{display:flex;gap:20px}.pane{width:690px}
      .cap{font-size:11px;color:#4b5563;margin-bottom:4px}
      .crop{position:relative;width:690px;height:400px;overflow:hidden;background:#fff;border:1px solid #d1d5db;border-radius:6px}
      .crop img{position:absolute;left:0;top:-58px;width:1440px;height:900px}
    </style></head><body>
      <h1>自查 2：裁掉顶栏后，home-light 与 family(/plans/api/) 并排 —— 同一站？哪一站？</h1>
      <div class="row">
        <div class="pane"><div class="cap">home-light.html（识别层 v5，y=58–458）</div><div class="crop"><img src="shots/after-1440.png"></div></div>
        <div class="pane"><div class="cap">family.html = dist/plans/api/ 换肤（同一裁切带，y=58–458）</div><div class="crop"><img src="shots/family-after-1440.png"></div></div>
      </div></body></html>`;
    await page.route('**/__evidence.html', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
    // 用 mockup 目录作为 base，让 shots/*.png 解析到本地文件
    await page.goto(`${BASE}/__evidence.html`, { waitUntil: 'load' }).catch(async () => {
      await page.setContent(html, { waitUntil: 'load' });
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, 'shots', 'home-vs-family.png') });
    await ctx.close();
    console.log('shot home-vs-family.png');
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
