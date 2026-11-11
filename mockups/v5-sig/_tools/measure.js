'use strict';
/**
 * 通用页面度量 + 截图。用法：
 *   LD_LIBRARY_PATH=... node _tools/measure.js --url=http://127.0.0.1:8081/dist/index.html \
 *     --w=1440 --h=900 --out=_data/before-1440.json --shot=shots/before-1440.png [--theme=dark] [--scale=1]
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const arg = (name, def) => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : def;
};
const URL_ = arg('url');
const W = Number(arg('w', 1440));
const H = Number(arg('h', 900));
const SCALE = Number(arg('scale', 1));
const THEME = arg('theme', '');
const OUT = arg('out', '');
const SHOT = arg('shot', '');
const ROOT = path.resolve(__dirname, '../../..');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const ctx = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: SCALE,
    colorScheme: THEME === 'dark' ? 'dark' : 'light'
  });
  const page = await ctx.newPage();
  const external = [];
  await page.route('**/*', route => {
    const u = route.request().url();
    if (!u.startsWith('http://127.0.0.1:8081/')) { external.push(u); return route.abort(); }
    return route.continue();
  });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  await page.goto(URL_, { waitUntil: 'load', timeout: 30000 });
  try { await page.waitForLoadState('networkidle', { timeout: 8000 }); } catch (e) { /* ignore */ }
  await page.waitForTimeout(600);
  if (THEME) await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), THEME);
  await page.waitForTimeout(200);

  const data = await page.evaluate(() => {
    const rect = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { top: +r.top.toFixed(2), bottom: +r.bottom.toFixed(2), left: +r.left.toFixed(2), right: +r.right.toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2) }; };
    const cs = el => el ? getComputedStyle(el) : null;
    const px = v => parseFloat(v);
    const text = el => (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    const cards = [...document.querySelectorAll('#dealsList article.g, .grid article.g')];
    const viewportH = innerHeight, viewportW = innerWidth;
    const fully = cards.filter(el => { const r = el.getBoundingClientRect(); return r.top >= -0.5 && r.bottom <= viewportH + 0.5 && r.left >= -0.5 && r.right <= viewportW + 0.5; });
    const partial = cards.filter(el => { const r = el.getBoundingClientRect(); return r.top < viewportH && r.bottom > 0; });
    const bigText = [...document.querySelectorAll('body *')].filter(el => {
      if (!el.childNodes || ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) return false;
      return px(cs(el).fontSize) >= 20;
    }).map(el => ({ tag: el.tagName, cls: el.className && String(el.className).slice(0, 80), fs: cs(el).fontSize, fw: cs(el).fontWeight, text: text(el), color: cs(el).color, clsName: el.getAttribute('class') || '' }));
    const stats = [...document.querySelectorAll('.stat')].map(el => ({ cls: el.className, fs: cs(el).fontSize, lh: cs(el).lineHeight, text: text(el), rect: rect(el), color: cs(el).color, family: cs(el).fontFamily }));
    const tierheads = [...document.querySelectorAll('.tierhead')].slice(0, 6).map(el => ({ id: el.id, cls: el.className, h: +el.getBoundingClientRect().height.toFixed(2), rect: rect(el), n: rect(el.querySelector('.n')), nBg: el.querySelector('.n') ? cs(el.querySelector('.n')).backgroundColor : null, nColor: el.querySelector('.n') ? cs(el.querySelector('.n')).color : null, nFs: el.querySelector('.n') ? cs(el.querySelector('.n')).fontSize : null, lineBg: el.querySelector('.line') ? cs(el.querySelector('.line')).backgroundColor : null, hint: text(el.querySelector('.hint')), stat: el.querySelector('.stat') ? { text: text(el.querySelector('.stat')), fs: cs(el.querySelector('.stat')).fontSize, rect: rect(el.querySelector('.stat')) } : null }));
    const needCards = [...document.querySelectorAll('.need-card')].slice(0, 10).map(el => ({ h: +el.getBoundingClientRect().height.toFixed(2), rect: rect(el), b: el.querySelector('b') ? { text: text(el.querySelector('b')), fs: cs(el.querySelector('b')).fontSize, lh: cs(el.querySelector('b')).lineHeight, rect: rect(el.querySelector('b')) } : null, copyOverflowX: el.querySelector('.need-copy') ? el.querySelector('.need-copy').scrollWidth - el.querySelector('.need-copy').clientWidth : null, cardOverflow: el.scrollWidth - el.clientWidth }));
    const firstTierCard = document.querySelector('#dealsList article.g');
    const bars = [...document.querySelectorAll('.of .bar')].slice(0, 4).map(el => ({ w: cs(el).width, bg: cs(el).backgroundColor, rect: rect(el) }));
    const txB = [...document.querySelectorAll('.of .tx b')].slice(0, 4).map(el => ({ color: cs(el).color, text: text(el) }));
    const tokens = {};
    const rootStyle = getComputedStyle(document.documentElement);
    for (const t of ['--bg', '--card', '--ink', '--ink2', '--mut', '--line', '--t1', '--t2', '--t3', '--t4', '--t5', '--on-t1', '--on-t2', '--on-t3', '--on-t4', '--on-t5', '--fs-stat-sm', '--fs-stat', '--fs-stat-lg', '--brand']) tokens[t] = rootStyle.getPropertyValue(t).trim();
    const layout = {};
    for (const sel of ['.top', '.topin', '.facets', '.needs', '.need-grid', '.rbar', '.hubline', '#dealsList', '.tierhead', '.wrap', 'footer']) {
      const el = document.querySelector(sel);
      layout[sel] = el ? { rect: rect(el), h: +el.getBoundingClientRect().height.toFixed(2) } : null;
    }
    return {
      url: location.href, viewport: { w: viewportW, h: viewportH }, theme: document.documentElement.getAttribute('data-theme'),
      scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight,
      horizontalOverflow: document.documentElement.scrollWidth - viewportW,
      cardCount: cards.length, fullyVisibleCards: fully.length, intersectingCards: partial.length,
      fullyVisibleTiers: [...new Set(fully.map(el => el.getAttribute('data-tier')))],
      layout, tierheads, needCards, firstTierCard: firstTierCard ? { rect: rect(firstTierCard), h: +firstTierCard.getBoundingClientRect().height.toFixed(2) } : null,
      bars, txB, stats, bigText, tokens,
      h1: [...document.querySelectorAll('h1')].map(el => ({ text: text(el), fs: cs(el).fontSize, rect: rect(el) })),
      fontSizesUsed: [...new Set([...document.querySelectorAll('body *')].map(el => cs(el).fontSize))].sort((a, b) => px(a) - px(b))
    };
  });
  const out = { measuredAt: new Date().toISOString(), url: URL_, viewport: { w: W, h: H }, scale: SCALE, theme: THEME || 'auto', errors, blockedExternal: external.slice(0, 5), ...data };
  if (SHOT) {
    const p = path.isAbsolute(SHOT) ? SHOT : path.join(ROOT, SHOT);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    await page.screenshot({ path: p, fullPage: false });
    out.shot = SHOT;
  }
  if (OUT) {
    const p = path.isAbsolute(OUT) ? OUT : path.join(ROOT, OUT);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(out, null, 2));
  }
  console.log(JSON.stringify({ url: out.url, viewport: out.viewport, scrollWidth: out.scrollWidth, hOverflow: out.horizontalOverflow, cards: out.cardCount, fullyVisible: out.fullyVisibleCards, tiersVisible: out.fullyVisibleTiers, gridTop: out.layout['#dealsList'] && out.layout['#dealsList'].rect.top, tierheadH: out.tierheads.map(t => t.h), needCardH: out.needCards.map(c => c.h), stats: out.stats.map(s => s.fs + ':' + s.text), bigText: out.bigText.length, errors: out.errors.length }, null, 1));
  await browser.close();
})().catch(e => { console.error('MEASURE FAIL', e); process.exit(1); });
