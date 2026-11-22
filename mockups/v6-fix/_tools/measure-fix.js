'use strict';
/**
 * v6-fix 示意图度量（只读页面，不改产物）
 * 用法：
 *   LD_LIBRARY_PATH=$HOME/.local/lib/chromium-deps/usr/lib/x86_64-linux-gnu \
 *   node mockups/v6-fix/_tools/measure-fix.js --page=before --w=1440 --h=1800 [--theme=dark] [--shot=...] [--card=9]
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
const SHOT = arg('shot', '');
const CARD = arg('card', '');
const OUT = arg('out', '');
const URL_ = `http://127.0.0.1:8081/mockups/v6-fix/${PAGE}.html`;

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars=false']
  });
  const ctx = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 2,
    colorScheme: THEME === 'dark' ? 'dark' : 'light'
  });
  const page = await ctx.newPage();
  const errors = [];
  const blocked = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 300)));
  await page.route('**/*', route => {
    const u = route.request().url();
    if (!u.startsWith('http://127.0.0.1:8081/')) { blocked.push(u); return route.abort(); }
    return route.continue();
  });
  await page.goto(URL_, { waitUntil: 'load', timeout: 30000 });
  try { await page.waitForLoadState('networkidle', { timeout: 8000 }); } catch (e) {}
  await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), THEME);
  await page.waitForTimeout(500);
  // after 页的补丁可能被首页 fetch 后的重建覆盖：显式再压一次（幂等）
  const patched = await page.evaluate(() => {
    if (typeof window.__v6patch !== 'function') return false;
    window.__v6patch();
    return true;
  });
  await page.waitForTimeout(400);

  const data = await page.evaluate(() => {
    const r = el => { const b = el.getBoundingClientRect(); return { top: +b.top.toFixed(2), bottom: +b.bottom.toFixed(2), left: +b.left.toFixed(2), right: +b.right.toFixed(2), w: +b.width.toFixed(2), h: +b.height.toFixed(2) }; };
    const cs = el => getComputedStyle(el);
    const txt = el => (el.textContent || '').replace(/\s+/g, ' ').trim();
    const cards = [...document.querySelectorAll('#dealsList article.g')];
    const topin = document.querySelector('.topin');
    const topItems = [...topin.children].map(el => ({
      tag: el.tagName, cls: el.className && String(el.className), text: txt(el).slice(0, 40),
      display: cs(el).display, w: +el.getBoundingClientRect().width.toFixed(2),
      left: +el.getBoundingClientRect().left.toFixed(2), right: +el.getBoundingClientRect().right.toFixed(2)
    }));
    const fm = [...document.querySelectorAll('.fmembers')].map(el => {
      const card = el.closest('article.g');
      return {
        card: card ? txt(card.querySelector('h3')).slice(0, 50) : null,
        links: el.querySelectorAll('a').length,
        scrollW: el.scrollWidth, clientW: el.clientWidth,
        offsetH: el.offsetHeight, clientH: el.clientHeight,
        scrollbarH: el.offsetHeight - el.clientHeight,
        scrollbarW: el.offsetWidth - el.clientWidth,
        overflowX: cs(el).overflowX,
        whiteSpace: cs(el).whiteSpace,
        textOverflow: cs(el).textOverflow,
        rect: r(el)
      };
    });
    const facets = document.querySelector('.facetsin');
    const titles = cards.map(el => {
      const h3 = el.querySelector('h3');
      const lh = parseFloat(cs(h3).lineHeight) || 18;
      return { title: txt(h3).slice(0, 60), h: +h3.getBoundingClientRect().height.toFixed(2), lh, lines: Math.round(h3.getBoundingClientRect().height / lh), rect: r(h3) };
    });
    const first = cards[0] || null;
    const need = document.querySelector('nav.needs');
    return {
      url: location.href,
      viewport: { w: innerWidth, h: innerHeight },
      doc: { scrollW: document.documentElement.scrollWidth, scrollH: document.documentElement.scrollHeight },
      topbar: {
        rect: r(topin), clientW: topin.clientWidth, scrollW: topin.scrollWidth,
        overflow: topin.scrollWidth - topin.clientWidth,
        searchW: +document.querySelector('.search').getBoundingClientRect().width.toFixed(2),
        gap: cs(topin).gap, items: topItems
      },
      facets: facets ? {
        scrollW: facets.scrollWidth, clientW: facets.clientWidth,
        overflow: facets.scrollWidth - facets.clientWidth,
        mask: cs(facets).maskImage || cs(facets).webkitMaskImage
      } : null,
      fm,
      cardCount: cards.length,
      openrouterCards: cards.filter(el => /openrouter/i.test(el.querySelector('.tx') ? el.querySelector('.tx').textContent : '')).length,
      mergedCard: (() => { const m = document.querySelector('article.g[data-v6-merged="1"]'); return m ? { title: txt(m.querySelector('h3')), ids: m.getAttribute('data-deal-ids'), members: m.querySelectorAll('.fmembers a').length, rect: r(m) } : null; })(),
      titles: { total: titles.length, wrapped: titles.filter(t => t.lines > 1).length, samples: titles.filter(t => t.lines > 1).slice(0, 6) },
      layout: {
        top: document.querySelector('.top') ? r(document.querySelector('.top')) : null,
        facets: document.querySelector('.facets') ? r(document.querySelector('.facets')) : null,
        needs: need ? { rect: r(need), previous: need.previousElementSibling ? need.previousElementSibling.id || need.previousElementSibling.className : null, next: need.nextElementSibling ? need.nextElementSibling.id || need.nextElementSibling.className : null } : null,
        grid: (() => { const g = document.getElementById('dealsList'); return g ? { rect: r(g), prev: g.previousElementSibling ? g.previousElementSibling.id || g.previousElementSibling.className : null } : null; })(),
        firstCard: first ? r(first) : null
      }
    };
  });

  if (CARD !== '') {
    const idx = Number(CARD);
    const el = page.locator('#dealsList article.g').nth(idx);
    const p = path.isAbsolute(SHOT) ? SHOT : path.join(ROOT, SHOT);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    await el.screenshot({ path: p });
    data.cardShot = { index: idx, path: SHOT, box: await el.boundingBox() };
  } else if (SHOT) {
    const p = path.isAbsolute(SHOT) ? SHOT : path.join(ROOT, SHOT);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    await page.screenshot({ path: p, fullPage: false });
    data.shot = SHOT;
  }

  data.errors = errors;
  data.blockedExternal = blocked.slice(0, 8);
  data.patched = patched;
  if (OUT) {
    const p = path.isAbsolute(OUT) ? OUT : path.join(ROOT, OUT);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(data, null, 2));
  }
  console.log(JSON.stringify({
    page: PAGE, viewport: data.viewport, doc: data.doc, topbar: data.topbar,
    facets: data.facets, fm: data.fm, cards: data.cardCount, openrouter: data.openrouterCards, merged: data.mergedCard,
    wrapped: data.titles.wrapped, need: data.layout.needs, grid: data.layout.grid, firstCard: data.layout.firstCard,
    errors: data.errors.length, patched
  }, null, 1));
  await browser.close();
})().catch(e => { console.error('MEASURE FAIL', e); process.exit(1); });
