'use strict';
const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox','--disable-dev-shm-usage'] });
  const mk = async (w,h,cs2='light') => { const ctx = await browser.newContext({ viewport:{width:w,height:h}, colorScheme: cs2 }); const page = await ctx.newPage(); await page.route('**/*', r => { const u=r.request().url(); if(!u.startsWith('http://127.0.0.1:8081/')) return r.abort(); return r.continue(); }); return {ctx,page}; };
  const cs = el => getComputedStyle(el);
  // family
  {
    const {ctx,page} = await mk(1440,900);
    await page.goto('http://127.0.0.1:8081/mockups/v5-sig/family.html',{waitUntil:'load'}); await page.waitForTimeout(400);
    const d = await page.evaluate(() => {
      const info = el => { const r=el.getBoundingClientRect(); return {tag:el.tagName, cls:String(el.className).slice(0,60), fs:getComputedStyle(el).fontSize, top:+r.top.toFixed(1), bottom:+r.bottom.toFixed(1), left:+r.left.toFixed(1), right:+r.right.toFixed(1), h:+r.height.toFixed(1)}; };
      const stats = [...document.querySelectorAll('.stat')].map(el => ({...info(el), direct:[...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join(''), txt: el.textContent.trim()}));
      const h1 = document.querySelector('h1'); const h1r = h1 && h1.getBoundingClientRect();
      const cssLeak = /--t[1-5]|font-size:\s*|box-shadow|\{\s*$/.test(document.body.innerText);
      return { title: document.title, scrollW: document.documentElement.scrollWidth, innerW: innerWidth, scrollH: document.documentElement.scrollHeight,
        h1: h1 ? info(h1) : null, stats, stopstats: document.querySelector('.stopstats') ? {rect: info(document.querySelector('.stopstats')), parent: document.querySelector('.stopstats').parentElement.className} : null,
        meta: document.querySelector('.stop .meta') ? document.querySelector('.stop .meta').outerHTML.slice(0,300) : null,
        cssLeak, styleTags: [...document.querySelectorAll('style')].map(s => ({inHead: !!s.closest('head'), inBody: !!s.closest('body'), len: s.textContent.length})),
        scripts: [...document.querySelectorAll('script')].map(s => ({inHead: !!s.closest('head'), len: s.textContent.length, head: s.textContent.trim().slice(0,50)})),
        headerCls: document.querySelector('header') ? document.querySelector('header').className : null,
        footerCls: document.querySelector('footer') ? document.querySelector('footer').className : null,
        bodyFont: getComputedStyle(document.body).fontFamily, tokens: (() => { const r=getComputedStyle(document.documentElement); const o={}; ['--bg','--card','--ink','--t1','--t2','--t3','--t4','--t5'].forEach(k=>o[k]=r.getPropertyValue(k).trim()); return o; })(),
        logos: [...document.querySelectorAll('link[rel=stylesheet]')].map(l=>l.getAttribute('href')),
        nextSib: h1 && h1.parentElement ? h1.parentElement.outerHTML.replace(/\s+/g,' ').slice(0,1200) : null
      };
    });
    console.log('=== FAMILY ==='); console.log(JSON.stringify(d,null,1));
    await ctx.close();
  }
  // dist plans api meta
  {
    const {ctx,page} = await mk(1440,900);
    await page.goto('http://127.0.0.1:8081/dist/plans/api/index.html',{waitUntil:'load'}); await page.waitForTimeout(800);
    const d = await page.evaluate(() => ({ meta: document.querySelector('.stop .meta') ? document.querySelector('.stop .meta').textContent.replace(/\s+/g,' ').trim() : null, h1: document.querySelector('h1') ? (()=>{const r=document.querySelector('h1').getBoundingClientRect(); return {fs:getComputedStyle(document.querySelector('h1')).fontSize,text:document.querySelector('h1').textContent.trim().slice(0,60)};})() : null, scripts: [...document.querySelectorAll('script')].length }));
    console.log('=== DIST PLANS API ==='); console.log(JSON.stringify(d,null,1));
    await ctx.close();
  }
  // 390
  {
    const {ctx,page} = await mk(390,844);
    await page.goto('http://127.0.0.1:8081/mockups/v5-sig/home-390.html',{waitUntil:'load'}); await page.waitForTimeout(400);
    const d = await page.evaluate(() => {
      const info = el => { const r=el.getBoundingClientRect(); return {tag:el.tagName, cls:String(el.className).slice(0,50), fs:getComputedStyle(el).fontSize, top:+r.top.toFixed(1), bottom:+r.bottom.toFixed(1), left:+r.left.toFixed(1), right:+r.right.toFixed(1), w:+r.width.toFixed(1), h:+r.height.toFixed(1)}; };
      const cs2 = el => getComputedStyle(el);
      const need = [...document.querySelectorAll('.need-card')].map(el => { const b=el.querySelector('b'); return { card: info(el), b: info(b), cardCls: el.className, bScrollW: b.scrollWidth, bClientW: b.clientWidth, bWhite: cs2(b).whiteSpace, copyOverflow: (()=>{const c=el.querySelector('.need-copy'); return c.scrollWidth-c.clientWidth;})() }; });
      const tier = [...document.querySelectorAll('.tierhead')].map(el => ({ cls: el.className, rect: info(el), n: el.querySelector('.n') ? info(el.querySelector('.n')) : null, stat: el.querySelector('.stat') ? info(el.querySelector('.stat')) : null, hintDisplay: el.querySelector('.hint') ? cs2(el.querySelector('.hint')).display : null, hintRect: el.querySelector('.hint') ? info(el.querySelector('.hint')) : null, line: el.querySelector('.line') ? {h:+el.querySelector('.line').getBoundingClientRect().height.toFixed(1), bg:cs2(el.querySelector('.line')).backgroundColor, op:cs2(el.querySelector('.line')).opacity} : null }));
      const over = [...document.querySelectorAll('body *')].map(el => ({el: el.tagName+'.'+String(el.className).slice(0,40), r: el.getBoundingClientRect()})).filter(o => o.r.right > innerWidth + 0.5 && o.r.width > 0).slice(0,15).map(o => ({el:o.el, right:+o.r.right.toFixed(1), w:+o.r.width.toFixed(1)}));
      const controls = {};
      for (const sel of ['.seg button', '.jump a', '.facets a', '.facets button', '.rbar select', '.rbar a', '.top .brand', '.need-arrow', '.need-icon']) {
        const els = [...document.querySelectorAll(sel)];
        controls[sel] = els.slice(0,6).map(el => { const r=el.getBoundingClientRect(); return { text: el.textContent.replace(/\s+/g,' ').trim().slice(0,20), w:+r.width.toFixed(1), h:+r.height.toFixed(1), scrollW: el.scrollWidth, clientW: el.clientWidth, whiteSpace: cs2(el).whiteSpace, overflow: cs2(el).overflow, textOverflow: cs2(el).textOverflow }; });
      }
      return { scrollW: document.documentElement.scrollWidth, innerW: innerWidth, hOverflow: document.documentElement.scrollWidth - innerWidth, scrollH: document.documentElement.scrollHeight, need, tier, over, controls, bigText: [...document.querySelectorAll('body *')].filter(el => parseFloat(getComputedStyle(el).fontSize)>=20 && [...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())).map(info) };
    });
    console.log('=== 390 ==='); console.log(JSON.stringify(d,null,1));
    await ctx.close();
  }
  // compare
  {
    const {ctx,page} = await mk(1440,900);
    await page.goto('http://127.0.0.1:8081/mockups/v5-sig/compare.html',{waitUntil:'load'}); await page.waitForTimeout(600);
    const d = await page.evaluate(() => {
      const info = el => { const r=el.getBoundingClientRect(); return {tag:el.tagName, cls:String(el.className).slice(0,40), top:+r.top.toFixed(1), bottom:+r.bottom.toFixed(1), w:+r.width.toFixed(1), h:+r.height.toFixed(1), transform:getComputedStyle(el).transform, src: el.getAttribute && el.getAttribute('src')}; };
      return { scrollW: document.documentElement.scrollWidth, innerW: innerWidth, scrollH: document.documentElement.scrollHeight, innerH: innerHeight,
        imgs: [...document.querySelectorAll('img')].map(el => ({...info(el), complete: el.complete, nw: el.naturalWidth, nh: el.naturalHeight})),
        crops: [...document.querySelectorAll('.crop')].map(info), thumbs: [...document.querySelectorAll('.thumb')].map(info),
        text: document.body.innerText.replace(/\s+/g,' ').slice(0,2500) };
    });
    console.log('=== COMPARE ==='); console.log(JSON.stringify(d,null,1));
    await ctx.close();
  }
  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
