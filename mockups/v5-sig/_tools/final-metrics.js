'use strict';
/** 汇总 NOTES 需要的最后几个数字：390 首屏 need 卡数、25% 缩略图档位色像素、大字号合规、暗色 bars。 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');
const OUT = path.resolve(__dirname, '..');
const BASE = 'http://127.0.0.1:8081/mockups/v5-sig';
const hex2rgb = h => { const n = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(n.slice(i, i + 2), 16)); };
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const PALETTE = { '#0b7a44': [11, 122, 68], '#1d4ed8': [29, 78, 216], '#155e75': [21, 94, 117], '#92400e': [146, 64, 14] };

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const out = {};

  // 1) 390：首屏 need 卡完整可见数 + 分带在页面的纵向位置
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/home-390.html`, { waitUntil: 'load' });
    await page.waitForTimeout(250);
    out.mobile390 = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.need-card')];
      const fully = cards.filter(el => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }).length;
      const th = document.querySelector('.tierhead').getBoundingClientRect();
      return {
        needCards: cards.length, needFullyVisible: fully,
        tierheadTop: +(th.top + window.scrollY).toFixed(1), tierheadHeight: +th.height.toFixed(1),
        scrollWidth: document.documentElement.scrollWidth, innerWidth,
        needStatFont: getComputedStyle(document.querySelector('.need-card .stat')).fontSize,
        tierheadHintDisplay: getComputedStyle(document.querySelector('.tierhead .hint')).display,
        tierheadStatFont: getComputedStyle(document.querySelector('.tierhead .stat')).fontSize
      };
    });
    await ctx.close();
  }

  // 2) 25% 缩略图像素：4 个档位色的近似像素量与 30px 数字行（Y 带）是否仍有深色像素密集
  {
    const ctx = await browser.newContext({ viewport: { width: 500, height: 300 } });
    const page = await ctx.newPage();
    const imgUrl = `${BASE}/shots/home-25pct.png`;
    await page.goto(`${BASE}/home-25pct.png`, { waitUntil: 'load' }).catch(() => {});
    const counts = await page.evaluate(async ({ imgUrl, palette }) => {
      const img = new Image(); img.src = imgUrl; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const data = g.getImageData(0, 0, c.width, c.height).data;
      const counts = {}; for (const k of Object.keys(palette)) counts[k] = 0;
      for (let i = 0; i < data.length; i += 4) {
        const px = [data[i], data[i + 1], data[i + 2]];
        for (const [k, col] of Object.entries(palette)) {
          const d = Math.hypot(px[0] - col[0], px[1] - col[1], px[2] - col[2]);
          if (d < 26) { counts[k]++; break; }
        }
      }
      return { size: { w: c.width, h: c.height }, counts };
    }, { imgUrl, palette: PALETTE }).catch(e => ({ error: String(e).slice(0, 200) }));
    out.thumb25 = counts;
    await ctx.close();
  }

  // 3) 1440 浅/深：大字号直接文本合规、bars、tierhead line
  for (const [theme, page_] of [['light', 'home-light'], ['dark', 'home-dark']]) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/${page_}.html`, { waitUntil: 'load' });
    await page.waitForTimeout(250);
    out[theme] = await page.evaluate(() => {
      const directText = el => [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
      const big = [...document.querySelectorAll('body *')].filter(el => parseFloat(getComputedStyle(el).fontSize) >= 20 && directText(el));
      return {
        bigText: big.map(el => ({ fs: getComputedStyle(el).fontSize, cls: el.className, direct: directText(el), isStat: el.classList.contains('stat') })),
        bigNonNumeric: big.filter(el => !/^[\d,.\s%+￥$¥元/]+$/.test(directText(el)) || !el.classList.contains('stat')).length,
        bar: getComputedStyle(document.querySelector('.of .bar')).width,
        barBg: getComputedStyle(document.querySelector('.of .bar')).backgroundColor,
        quoteInk: getComputedStyle(document.querySelector('.of .tx')).color,
        quoteBoldInk: getComputedStyle(document.querySelector('.of .tx b')).color,
        tierheadLine: (() => { const el = document.querySelector('.tierhead .line'); return { bg: getComputedStyle(el).backgroundColor, opacity: getComputedStyle(el).opacity }; })(),
        jumpSquares: [...document.querySelectorAll('.jump .jn')].map(el => ({ w: getComputedStyle(el).width, bg: getComputedStyle(el).backgroundColor }))
      };
    });
    await ctx.close();
  }

  // 4) 对比度（从渲染后的 token 计算）
  out.contrast = {};
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/home-light.html`, { waitUntil: 'load' });
    out.contrast = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      const get = k => cs.getPropertyValue(k).trim();
      const tokens = {}; for (const k of ['--bg', '--card', '--t1', '--t2', '--t3', '--t4', '--t5', '--on-t1', '--on-t2', '--on-t3', '--on-t4', '--on-t5']) tokens[k] = get(k);
      return tokens;
    });
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    out.contrastDark = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      const get = k => cs.getPropertyValue(k).trim();
      const tokens = {}; for (const k of ['--bg', '--card', '--t1', '--t2', '--t3', '--t4', '--t5', '--on-t1', '--on-t2', '--on-t3', '--on-t4', '--on-t5']) tokens[k] = get(k);
      return tokens;
    });
    await ctx.close();
  }

  fs.writeFileSync(path.join(OUT, '_data', 'final-metrics.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
