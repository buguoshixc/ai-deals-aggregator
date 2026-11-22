'use strict';
const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox','--disable-dev-shm-usage'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
  const page = await ctx.newPage();
  const blocked = [];
  await page.route('**/*', r => { const u = r.request().url(); if (!u.startsWith('http://127.0.0.1:8081/')) { blocked.push(u); return r.abort(); } return r.continue(); });
  await page.goto('http://127.0.0.1:8081/mockups/v5-sig/home-light.html', { waitUntil: 'load' });
  await page.waitForTimeout(500);
  const out = await page.evaluate(() => {
    const cs = el => getComputedStyle(el);
    const info = el => { const r = el.getBoundingClientRect(); return { tag: el.tagName, cls: String(el.className).slice(0,70), fs: cs(el).fontSize, h: +r.height.toFixed(1), top: +r.top.toFixed(1) }; };
    const direct = el => [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('');
    const big = [...document.querySelectorAll('body *')].filter(el => parseFloat(cs(el).fontSize) >= 19.5).map(el => ({...info(el), direct: direct(el).trim().slice(0,40), txt: el.textContent.replace(/\s+/g,' ').trim().slice(0,50), parent: el.parentElement && el.parentElement.tagName + '.' + String(el.parentElement.className).slice(0,40)}));
    const need = [...document.querySelectorAll('.need-card')].slice(0,2).map(el => ({ rect: info(el), html: el.outerHTML.replace(/\s+/g,' ').slice(0,500) }));
    const jump = [...document.querySelectorAll('.jump a')].map(el => ({ html: el.outerHTML.replace(/\s+/g,' ').slice(0,300), rect: info(el) }));
    const tier = [...document.querySelectorAll('.tierhead')].map(el => ({ cls: el.className, h: +el.getBoundingClientRect().height.toFixed(1), html: el.outerHTML.replace(/\s+/g,' ').slice(0,600) }));
    const scripts = [...document.querySelectorAll('script')].map(s => ({ inHead: !!s.closest('head'), type: s.type, src: s.src, len: s.textContent.length, head: s.textContent.trim().slice(0,60) }));
    return { h1: [...document.querySelectorAll('h1')].map(info), big, need, jump, tier, scripts, bodyScripts: document.body.querySelectorAll('script').length, styleCount: document.querySelectorAll('style').length, bodyInnerTextHasCss: /--t1|font-size:|\{/.test(document.body.innerText) };
  });
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
