'use strict';
/**
 * 独立复核 harness（audit-verifier 自建，不依赖 _data/*.json 结论）。
 * 只读页面 / 只读 dist / 只写 _audit/。
 * 输出：_audit/measured.json + _audit/verify-*.png + _audit/thumb-zoom-*.png
 * 运行：LD_LIBRARY_PATH=$HOME/.local/lib/chromium-deps/usr/lib/x86_64-linux-gnu node mockups/v5-sig/_audit/audit.js
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '../../..');
const V5 = path.resolve(__dirname, '..');
const AUD = __dirname;
const BASE = 'http://127.0.0.1:8081/';
const sha256 = b => crypto.createHash('sha256').update(b).digest('hex');
const sha256f = p => sha256(fs.readFileSync(p));
const sleep = ms => new Promise(r => setTimeout(r, ms));

const SKIP_EXT = /(?:^https?:|^mailto:|^tel:|^data:|^javascript:|^#|^\/\/)/i;

async function newPage(browser, w, h, colorScheme = 'light') {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const blocked = [];
  const errors = [];
  await page.route('**/*', r => {
    const u = r.request().url();
    if (!u.startsWith(BASE)) { blocked.push(u); return r.abort(); }
    return r.continue();
  });
  page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 150)); });
  return { ctx, page, blocked, errors };
}

async function goto(page, rel, { waitJs = false } = {}) {
  await page.goto(BASE + rel, { waitUntil: 'load', timeout: 45000 });
  if (waitJs) {
    try { await page.waitForSelector('#dealsList article.g', { timeout: 15000 }); } catch (e) {}
    try { await page.waitForLoadState('networkidle', { timeout: 8000 }); } catch (e) {}
    await page.waitForTimeout(700);
  } else {
    try { await page.waitForLoadState('networkidle', { timeout: 5000 }); } catch (e) {}
    await page.waitForTimeout(300);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
}

/* ---------------- 通用页面度量（改前 / 改后共用同一套代码） ---------------- */
async function measureHome(page) {
  return page.evaluate(() => {
    const cs = el => getComputedStyle(el);
    const r2 = r => ({ top: +r.top.toFixed(2), bottom: +r.bottom.toFixed(2), left: +r.left.toFixed(2), right: +r.right.toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2) });
    const rect = el => el ? r2(el.getBoundingClientRect()) : null;
    const directText = el => [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').replace(/\s+/g, ' ').trim();
    const tx = el => (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    const desc = el => el ? el.tagName + (el.id ? '#' + el.id : '') + (el.className ? '.' + String(el.className).trim().replace(/\s+/g, '.') : '') : null;
    const rootCS = cs(document.documentElement);
    const tokens = {};
    for (const t of ['--bg', '--card', '--ink', '--ink2', '--mut', '--line', '--line2', '--t1', '--t2', '--t3', '--t4', '--t5', '--t1-ink', '--t2-ink', '--on-t1', '--on-t2', '--on-t3', '--on-t4', '--on-t5', '--fs-stat-sm', '--fs-stat', '--fs-stat-lg', '--brand', '--ok', '--warn', '--deal']) tokens[t] = rootCS.getPropertyValue(t).trim();

    const cards = [...document.querySelectorAll('#dealsList article.g, .grid article.g')];
    const VW = innerWidth, VH = innerHeight;
    const fully = cards.filter(el => { const r = el.getBoundingClientRect(); return r.top >= -0.5 && r.bottom <= VH + 0.5 && r.left >= -0.5 && r.right <= VW + 0.5; });
    const partial = cards.filter(el => { const r = el.getBoundingClientRect(); return r.top < VH && r.bottom > 0; });
    const grid = document.querySelector('#dealsList');
    const firstCard = cards[0] || null;

    const tierheads = [...document.querySelectorAll('.tierhead')].map(el => {
      const n = el.querySelector('.n'), line = el.querySelector('.line'), stat = el.querySelector('.stat'), hint = el.querySelector('.hint');
      return {
        id: el.id, cls: el.className, rect: rect(el), h: +el.getBoundingClientRect().height.toFixed(2),
        n: n ? { rect: rect(n), fs: cs(n).fontSize, bg: cs(n).backgroundColor, color: cs(n).color, radius: cs(n).borderRadius, shadow: cs(n).boxShadow } : null,
        line: line ? { rect: rect(line), h: +line.getBoundingClientRect().height.toFixed(2), bg: cs(line).backgroundColor, opacity: cs(line).opacity } : null,
        stat: stat ? { rect: rect(stat), fs: cs(stat).fontSize, color: cs(stat).color, direct: directText(stat), text: tx(stat) } : null,
        hint: hint ? { rect: rect(hint), display: cs(hint).display, text: tx(hint) } : null
      };
    });

    const needCards = [...document.querySelectorAll('.need-card')].map(el => {
      const b = el.querySelector('.need-copy b');
      const copy = el.querySelector('.need-copy');
      return {
        rect: rect(el), h: +el.getBoundingClientRect().height.toFixed(2),
        b: b ? { rect: rect(b), fs: cs(b).fontSize, lh: cs(b).lineHeight, color: cs(b).color, direct: directText(b), text: tx(b), scrollW: b.scrollWidth, clientW: b.clientWidth, textOverflow: cs(b).textOverflow, overflow: cs(b).overflow } : null,
        copyOverflowX: copy ? copy.scrollWidth - copy.clientWidth : null
      };
    });

    const statEls = [...document.querySelectorAll('.stat')].map(el => ({
      cls: el.className, fs: cs(el).fontSize, lh: cs(el).lineHeight, ls: cs(el).letterSpacing, fw: cs(el).fontWeight,
      fvn: cs(el).fontVariantNumeric, color: cs(el).color, direct: directText(el), text: tx(el), rect: rect(el), tag: el.tagName
    }));
    const statUnits = [...document.querySelectorAll('.stat-unit')].map(el => ({ fs: cs(el).fontSize, color: cs(el).color, ls: cs(el).letterSpacing, fvn: cs(el).fontVariantNumeric, fw: cs(el).fontWeight }));

    const bigText = [...document.querySelectorAll('body *')].filter(el => {
      const fs = parseFloat(cs(el).fontSize);
      const t = directText(el);
      return fs >= 20 && t.length > 0;
    }).map(el => ({ tag: el.tagName, cls: String(el.className || ''), fs: cs(el).fontSize, fw: cs(el).fontWeight, color: cs(el).color, direct: directText(el), text: tx(el), isStat: el.classList.contains('stat'), rect: rect(el) }));

    // 引文 / 竖条
    const ofGroups = {};
    for (const el of document.querySelectorAll('.of')) {
      const cls = el.className, bar = el.querySelector('.bar'), t = el.querySelector('.tx'), b = el.querySelector('.tx b');
      const key = cls;
      if (!ofGroups[key]) ofGroups[key] = { cls, count: 0, barW: bar ? cs(bar).width : null, barBg: bar ? cs(bar).backgroundColor : null, barRadius: bar ? cs(bar).borderRadius : null, txColor: t ? cs(t).color : null, bColor: b ? cs(b).color : null, bCount: 0 };
      ofGroups[key].count++;
      if (b) ofGroups[key].bCount++;
    }
    const bars = [...document.querySelectorAll('.of .bar')].map(el => ({ w: cs(el).width, bg: cs(el).backgroundColor, parent: el.parentElement.className }));
    const barWidths = [...new Set(bars.map(b => b.w))];
    const txColors = [...new Set([...document.querySelectorAll('.of .tx')].map(el => cs(el).color))];
    const txBoldColors = [...new Set([...document.querySelectorAll('.of .tx b')].map(el => cs(el).color))];

    // 跳到档位 / 图例
    const jump = document.querySelector('.jump');
    const jumpLinks = [...document.querySelectorAll('.jump a')].map(el => {
      const jn = el.querySelector('.jn');
      const textNode = [...el.childNodes].find(n => n.nodeType === 3 && n.textContent.trim());
      let textRect = null;
      if (textNode) { const rg = document.createRange(); rg.selectNodeContents(textNode); const rr = rg.getBoundingClientRect(); textRect = { w: +rr.width.toFixed(2), h: +rr.height.toFixed(2), top: +rr.top.toFixed(2), right: +rr.right.toFixed(2) }; }
      return {
        text: tx(el), rect: rect(el), display: cs(el).display, padding: cs(el).padding, gap: cs(el).gap,
        scrollW: el.scrollWidth, clientW: el.clientWidth, whiteSpace: cs(el).whiteSpace,
        jn: jn ? { rect: rect(jn), fs: cs(jn).fontSize, bg: cs(jn).backgroundColor, color: cs(jn).color, radius: cs(jn).borderRadius, display: cs(jn).display } : null,
        textRect
      };
    });

    // 代表性圆角 / 阴影 / 边框（对比改前改后）
    const deco = {};
    for (const sel of ['.tierhead .n', '.jump .jn', '.jump a', '.need-card', '.of .bar', '.of', '.stat', '.tierhead', '.g', 'article.g']) {
      const el = document.querySelector(sel);
      if (!el) { deco[sel] = null; continue; }
      const c = cs(el);
      deco[sel] = { radius: c.borderRadius, shadow: c.boxShadow, borderColor: c.borderColor, borderTopColor: c.borderTopColor, borderWidth: c.borderTopWidth };
    }

    // 所有直接承载文本的元素 color 分布（用于核对 t1-ink/t2-ink 未作文字色）
    const textColorCount = {};
    for (const el of document.querySelectorAll('body *')) {
      if (!directText(el)) continue;
      const c = cs(el).color;
      textColorCount[c] = (textColorCount[c] || 0) + 1;
    }

    // 横向溢出：页面级 + 越界元素 + 最近的裁剪/滚动祖先
    const overflowEls = [...document.querySelectorAll('body *')].map(el => ({ el, r: el.getBoundingClientRect() }))
      .filter(o => o.r.width > 0 && o.r.right > VW + 1)
      .slice(0, 40)
      .map(o => {
        let anc = o.el.parentElement, clip = null;
        while (anc && anc !== document.body) {
          const c = cs(anc);
          if (/(auto|scroll|hidden|clip)/.test(c.overflowX)) { clip = { desc: desc(anc), overflowX: c.overflowX, rect: rect(anc) }; break; }
          anc = anc.parentElement;
        }
        return { desc: desc(o.el), right: +o.r.right.toFixed(1), w: +o.r.width.toFixed(1), clip };
      });

    const h1 = document.querySelector('h1');
    return {
      url: location.href, viewport: { w: VW, h: VH }, theme: document.documentElement.getAttribute('data-theme'),
      scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight,
      bodyScrollHeight: document.body.scrollHeight, horizontalOverflow: document.documentElement.scrollWidth - VW,
      cardCount: cards.length, fullyVisibleCards: fully.length, intersectingCards: partial.length,
      fullyVisibleTiers: [...new Set(fully.map(el => el.getAttribute('data-tier')))],
      gridTop: grid ? +grid.getBoundingClientRect().top.toFixed(2) : null,
      gridHeight: grid ? +grid.getBoundingClientRect().height.toFixed(2) : null,
      firstCard: firstCard ? rect(firstCard) : null,
      layout: Object.fromEntries(['.top', '.topin', '.facets', '.facetsin', '.needs', '.need-grid', '.rbar', '.hubline', '#dealsList', '.tierhead', '.wrap', 'footer', '.jump', '.seg', '.rright'].map(sel => {
        const el = document.querySelector(sel); return [sel, el ? { rect: rect(el), h: +el.getBoundingClientRect().height.toFixed(2) } : null];
      })),
      tierheads, needCards, statEls, statUnits, bigText,
      ofGroups, bars, barWidths, txColors, txBoldColors,
      jump: jump ? { rect: rect(jump), h: +jump.getBoundingClientRect().height.toFixed(2), display: cs(jump).display } : null,
      jumpLinks, deco, textColorCount, overflowEls,
      tokens,
      h1: h1 ? { fs: cs(h1).fontSize, rect: rect(h1), text: tx(h1) } : null,
      bodyFont: cs(document.body).fontFamily,
      fontSizesUsed: [...new Set([...document.querySelectorAll('body *')].map(el => cs(el).fontSize))].sort((a, b) => parseFloat(a) - parseFloat(b)),
      styleText: [...document.querySelectorAll('style')].map(s => s.textContent),
      headScripts: [...document.querySelectorAll('head script')].map(s => ({ src: s.getAttribute('src'), type: s.getAttribute('type'), len: s.textContent.length, head: s.textContent.trim().slice(0, 80) })),
      bodyScripts: document.querySelectorAll('body script').length,
      jsonLd: document.querySelectorAll('script[type="application/ld+json"]').length,
      externalScripts: [...document.querySelectorAll('script[src]')].map(s => s.getAttribute('src'))
    };
  });
}

/* ---------------- 对比度 ---------------- */
function srgbToLin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function relLum(hex) {
  const m = hex.trim().replace('#', '');
  const n = m.length === 3 ? m.split('').map(x => x + x).join('') : m;
  const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16);
  return 0.2126 * srgbToLin(r) + 0.7152 * srgbToLin(g) + 0.0722 * srgbToLin(b);
}
function wcag(a, b) {
  const la = relLum(a), lb = relLum(b);
  const hi = Math.max(la, lb), lo = Math.min(la, lb);
  return +(hi + 0.05) / (lo + 0.05);
}
function rgbToHex(rgb) {
  const m = String(rgb).match(/rgba?\(([^)]+)\)/);
  if (!m) return String(rgb);
  const p = m[1].split(',').map(x => parseFloat(x));
  if (p.length > 3 && p[3] < 1) return String(rgb);
  return '#' + p.slice(0, 3).map(x => Math.round(x).toString(16).padStart(2, '0')).join('');
}
function hsl(hex) {
  const m = hex.replace('#', '');
  const r = parseInt(m.slice(0, 2), 16) / 255, g = parseInt(m.slice(2, 4), 16) / 255, b = parseInt(m.slice(4, 6), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let hh = 0;
  if (d !== 0) {
    if (mx === r) hh = ((g - b) / d) % 6; else if (mx === g) hh = (b - r) / d + 2; else hh = (r - g) / d + 4;
    hh *= 60; if (hh < 0) hh += 360;
  }
  const l = (mx + mn) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { h: +hh.toFixed(1), s: +(s * 100).toFixed(1), l: +(l * 100).toFixed(1) };
}
function classifyHue(c) {
  if (c.s < 30) return 'gray';
  if (c.h >= 90 && c.h < 165) return 'green';
  if (c.h >= 165 && c.h < 200) return 'cyan';
  if (c.h >= 200 && c.h < 260) return 'blue';
  if (c.h >= 15 && c.h < 60) return 'amber';
  return 'other';
}

/* ---------------- 工程纪律：静态文件扫描 ---------------- */
function scanMockupHtml(rel) {
  const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const headMatch = html.match(/<head>[\s\S]*?<\/head>/i);
  const head = headMatch ? headMatch[0] : '';
  const body = headMatch ? html.slice(html.indexOf('</head>') + 7) : html;
  const scriptTags = [...head.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/gi)].map(m => ({ tag: m[0].slice(0, 200), src: (m[0].match(/src\s*=\s*"([^"]*)"/) || [])[1] || null, type: (m[0].match(/type\s*=\s*"([^"]*)"/) || [])[1] || null, len: m[0].length }));
  const relHrefs = [...html.matchAll(/\b(?:href|src)\s*=\s*"([^"]*)"/gi)].map(m => m[1]).filter(v => !SKIP_EXT.test(v.trim()) && v.trim() !== '');
  const badRel = relHrefs.filter(v => !v.startsWith('../../dist/'));
  const styleInBody = /<style\b/i.test(body);
  const themeScript = /主题必须在首次绘制前决定/.test(head);
  const analytics = /googletagmanager|google-analytics|plausible|umami|baidu\.com\/hm|clarity\.ms|hotjar|matomo|segment\.|mixpanel/i.test(html);
  const appScript = /<script\b[^>]*src=/.test(head) || /<script\b[^>]*src=/.test(html);
  return { file: rel, bytes: Buffer.byteLength(html), headScripts: scriptTags, headScriptCount: scriptTags.length, bodyScriptCount: (body.match(/<script\b/gi) || []).length, jsonLd: (html.match(/application\/ld\+json/g) || []).length, themeScript, styleInBody, relHrefs: relHrefs.length, badRel, analytics, appScript };
}

/* ---------------- 25% 缩略图像素分析 ---------------- */
async function thumbAnalysis(browser) {
  const { ctx, page } = await newPage(browser, 1200, 900, 'light');
  await goto(page, 'mockups/v5-sig/home-light.html');
  const out = await page.evaluate(async () => {
    const load = src => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
    const COLOR = { t1: '#0b7a44', t2: '#1d4ed8', t3: '#155e75', t4: '#92400e', t5: '#475569' };
    const hexToRgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    const count = (data, rgb, tol) => {
      let n = 0; const [r, g, b] = rgb;
      for (let i = 0; i < data.length; i += 4) if (Math.abs(data[i] - r) <= tol && Math.abs(data[i + 1] - g) <= tol && Math.abs(data[i + 2] - b) <= tol) n++;
      return n;
    };
    const grab = (im, w, h) => {
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const cx = cv.getContext('2d'); cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high';
      cx.drawImage(im, 0, 0, w, h);
      return cx.getImageData(0, 0, w, h).data;
    };
    const res = {};
    // 原始缩略图（必须是 360x225）
    const thumb = await load('/mockups/v5-sig/shots/home-25pct.png');
    res.natural = { w: thumb.naturalWidth, h: thumb.naturalHeight };
    const data = grab(thumb, thumb.naturalWidth, thumb.naturalHeight);
    res.counts = {};
    for (const [k, hex] of Object.entries(COLOR)) {
      const rgb = hexToRgb(hex);
      res.counts[k] = { hex, tol20: count(data, rgb, 20), tol8: count(data, rgb, 8), tol3: count(data, rgb, 3) };
    }
    // 对照：把 after-1440.png 用 canvas 缩到 360x225，统计同一批颜色（判断缩略图是否与 after-1440 同源）
    const full = await load('/mockups/v5-sig/shots/after-1440.png');
    const data2 = grab(full, 360, 225);
    res.rescaledFromAfter = {};
    for (const [k, hex] of Object.entries(COLOR)) res.rescaledFromAfter[k] = count(data2, hexToRgb(hex), 20);
    // 对照：改前 1440 图缩到 25%，看它能测到几个档位色
    const before = await load('/mockups/v5-sig/shots/before-1440.png');
    const data3 = grab(before, 360, 225);
    res.beforeRescaled = {};
    for (const [k, hex] of Object.entries(COLOR)) res.beforeRescaled[k] = count(data3, hexToRgb(hex), 20);
    // 已存在的 home-before-after.png 尺寸
    return res;
  });
  // 25% 缩略图的 4x 像素化局部放大：viewport 360x225 + dpr4，CSS 坐标 = 缩略图坐标
  const zctx = await browser.newContext({ viewport: { width: 360, height: 225 }, deviceScaleFactor: 4 });
  const p2 = await zctx.newPage();
  await p2.route('**/*', r => r.request().url().startsWith(BASE) ? r.continue() : r.abort());
  await p2.setContent(`<body style="margin:0;background:#fff"><img id="im" src="${BASE}mockups/v5-sig/shots/home-25pct.png" style="display:block;width:360px;height:225px;image-rendering:pixelated"></body>`);
  await p2.waitForFunction(() => { const i = document.getElementById('im'); return i && i.complete && i.naturalWidth > 0; });
  await p2.waitForTimeout(150);
  // need 卡在缩略图 y≈27.5–64.5；图例/分带在 y≈75–95
  await p2.screenshot({ path: path.join(AUD, 'thumb-zoom-need.png'), clip: { x: 0, y: 25, width: 360, height: 42 } });
  await p2.screenshot({ path: path.join(AUD, 'thumb-zoom-legend.png'), clip: { x: 0, y: 75, width: 360, height: 14 } });
  await zctx.close();
  await ctx.close();
  return out;
}

/* ---------------- main ---------------- */
(async () => {
  const startedAt = new Date().toISOString();
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'] });
  const R = { startedAt, snapshot: {} };

  // 0. 文件哈希快照
  const files = [
    ...['home-light.html', 'home-dark.html', 'home-390.html', 'family.html', 'compare.html'].map(f => 'mockups/v5-sig/' + f),
    ...['build-sig.js', 'build-compare.js', 'contrast.js', 'measure.js', 'final-metrics.js', 'evidence-shots.js', 'sweep.js'].map(f => 'mockups/v5-sig/_tools/' + f),
    ...fs.readdirSync(path.join(V5, 'shots')).filter(f => f.endsWith('.png')).map(f => 'mockups/v5-sig/shots/' + f),
    ...fs.readdirSync(path.join(V5, '_data')).filter(f => f.endsWith('.json')).map(f => 'mockups/v5-sig/_data/' + f),
    'index.html', 'dist/index.html', 'dist/plans/api/index.html', 'dist/logos.css'
  ];
  for (const f of files) { try { R.snapshot[f] = sha256f(path.join(ROOT, f)); } catch (e) { R.snapshot[f] = 'MISSING'; } }

  // 1. 改后页面：1440 浅色 / 1440 深色 / 390 / family
  {
    const { ctx, page, blocked, errors } = await newPage(browser, 1440, 900, 'light');
    await goto(page, 'mockups/v5-sig/home-light.html');
    R.afterLight = await measureHome(page);
    R.afterLight.blockedExternal = blocked; R.afterLight.errors = errors;
    await page.screenshot({ path: path.join(AUD, 'verify-home-light-1440.png') });
    await ctx.close();
  }
  {
    const { ctx, page, blocked, errors } = await newPage(browser, 1440, 900, 'dark');
    await goto(page, 'mockups/v5-sig/home-dark.html');
    R.afterDark = await measureHome(page);
    R.afterDark.blockedExternal = blocked; R.afterDark.errors = errors;
    await page.screenshot({ path: path.join(AUD, 'verify-home-dark-1440.png') });
    await ctx.close();
  }
  {
    const { ctx, page, blocked, errors } = await newPage(browser, 390, 844, 'light');
    await goto(page, 'mockups/v5-sig/home-390.html');
    R.after390 = await measureHome(page);
    R.after390.blockedExternal = blocked; R.after390.errors = errors;
    await page.screenshot({ path: path.join(AUD, 'verify-home-390.png') });
    await ctx.close();
  }
  {
    const { ctx, page, blocked, errors } = await newPage(browser, 1440, 900, 'light');
    await goto(page, 'mockups/v5-sig/family.html');
    R.family = await measureHome(page);
    R.family.blockedExternal = blocked; R.family.errors = errors;
    R.family.head = await page.evaluate(() => ({
      title: document.title,
      h1: (() => { const h = document.querySelector('h1'); const r = h.getBoundingClientRect(); return { text: h.textContent.trim(), fs: getComputedStyle(h).fontSize, rect: { top: +r.top.toFixed(1), left: +r.left.toFixed(1), right: +r.right.toFixed(1), bottom: +r.bottom.toFixed(1) } }; })(),
      stopstats: (() => { const s = document.querySelector('.stopstats'); if (!s) return null; const r = s.getBoundingClientRect(); return { rect: { top: +r.top.toFixed(1), left: +r.left.toFixed(1), right: +r.right.toFixed(1), bottom: +r.bottom.toFixed(1) }, parent: s.parentElement.className, html: s.innerHTML.replace(/\s+/g, ' ').slice(0, 600) }; })(),
      meta: (() => { const m = document.querySelector('.stop .meta'); return m ? m.textContent.replace(/\s+/g, ' ').trim() : null; })(),
      styleTags: [...document.querySelectorAll('style')].map(s => ({ inHead: !!s.closest('head'), inBody: !!s.closest('body'), len: s.textContent.length })),
      bodyHasCssText: /--t[1-5]\s*:|font-size\s*:|box-shadow\s*:|\{\s*$/.test(document.body.innerText),
      bodyStyleTags: document.body.querySelectorAll('style').length,
      logos: [...document.querySelectorAll('link[rel=stylesheet]')].map(l => l.getAttribute('href')),
      metaThemeColor: [...document.querySelectorAll('meta[name=theme-color]')].map(m => m.getAttribute('content') + '|' + (m.getAttribute('media') || '')),
      fontFamily: getComputedStyle(document.body).fontFamily,
      headerHTML: (() => { const h = document.querySelector('header.top'); return h ? h.outerHTML.replace(/\s+/g, ' ').trim() : null; })(),
      footerHTML: (() => { const f = document.querySelector('footer'); return f ? f.outerHTML.replace(/\s+/g, ' ').trim() : null; })()
    }));
    await page.screenshot({ path: path.join(AUD, 'verify-family-1440.png') });
    await ctx.close();
  }

  // 2. 改前页面（dist，JS 运行）
  {
    const { ctx, page, blocked, errors } = await newPage(browser, 1440, 900, 'light');
    await goto(page, 'dist/index.html', { waitJs: true });
    R.beforeLight = await measureHome(page);
    R.beforeLight.blockedExternal = blocked; R.beforeLight.errors = errors;
    await page.screenshot({ path: path.join(AUD, 'verify-before-light-1440.png') });
    await ctx.close();
  }
  {
    const { ctx, page, blocked, errors } = await newPage(browser, 1440, 900, 'dark');
    await goto(page, 'dist/index.html', { waitJs: true });
    R.beforeDark = await measureHome(page);
    R.beforeDark.blockedExternal = blocked; R.beforeDark.errors = errors;
    await ctx.close();
  }
  {
    const { ctx, page } = await newPage(browser, 390, 844, 'light');
    await goto(page, 'dist/index.html', { waitJs: true });
    R.before390 = await measureHome(page);
    await ctx.close();
  }
  {
    const { ctx, page, blocked, errors } = await newPage(browser, 1440, 900, 'light');
    await goto(page, 'dist/plans/api/index.html', { waitJs: true });
    R.beforeFamily = await page.evaluate(() => {
      const cs = el => getComputedStyle(el);
      const meta = document.querySelector('.stop .meta');
      const h1 = document.querySelector('h1');
      const h1s = h1 ? [...h1.parentElement.querySelectorAll('.stat')] : [];
      return {
        meta: meta ? meta.textContent.replace(/\s+/g, ' ').trim() : null,
        h1: h1 ? { fs: cs(h1).fontSize, text: h1.textContent.trim().slice(0, 80) } : null,
        statCount: h1s.length,
        stopstats: !!document.querySelector('.stopstats'),
        headerHTML: (() => { const h = document.querySelector('header.top'); return h ? h.outerHTML.replace(/\s+/g, ' ').trim() : null; })(),
        footerHTML: (() => { const f = document.querySelector('footer'); return f ? f.outerHTML.replace(/\s+/g, ' ').trim() : null; })(),
        tokens: (() => { const r = cs(document.documentElement); const o = {}; ['--bg', '--card', '--ink', '--t1', '--t2', '--t3', '--t4', '--t5', '--line', '--mut'].forEach(k => o[k] = r.getPropertyValue(k).trim()); return o; })(),
        fontFamily: cs(document.body).fontFamily,
        styleCount: document.querySelectorAll('style').length
      };
    });
    R.beforeFamily.blockedExternal = blocked; R.beforeFamily.errors = errors;
    await ctx.close();
  }

  // 3. compare.html
  {
    const { ctx, page, blocked, errors } = await newPage(browser, 1440, 900, 'light');
    await goto(page, 'mockups/v5-sig/compare.html');
    R.compare = await page.evaluate(() => {
      const cs = el => getComputedStyle(el);
      const rect = el => { const r = el.getBoundingClientRect(); return { top: +r.top.toFixed(2), bottom: +r.bottom.toFixed(2), left: +r.left.toFixed(2), right: +r.right.toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2) }; };
      const imgs = [...document.querySelectorAll('img')].map(el => ({ src: el.getAttribute('src'), rect: rect(el), transform: cs(el).transform, complete: el.complete, nw: el.naturalWidth, nh: el.naturalHeight, parent: el.parentElement.className }));
      const tableRows = [...document.querySelectorAll('table tr')].map(tr => [...tr.children].map(td => td.textContent.replace(/\s+/g, ' ').trim()));
      const chips = [...document.querySelectorAll('.chip')].map(el => el.textContent.replace(/\s+/g, ' ').trim());
      const sws = [...document.querySelectorAll('.sw')].map(el => el.textContent.replace(/\s+/g, ' ').trim());
      const figNotes = [...document.querySelectorAll('.thumbnote')].map(el => el.textContent.replace(/\s+/g, ' ').trim());
      const figs = [...document.querySelectorAll('figure')].map(f => ({ cls: f.className, crops: [...f.querySelectorAll('.crop img')].map(i => i.getAttribute('src')), thumbs: [...f.querySelectorAll('.thumb img')].map(i => i.getAttribute('src')) }));
      const footer = document.querySelector('footer');
      return {
        scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight, innerWidth, innerHeight,
        bodyScrollHeight: document.body.scrollHeight, footerRect: footer ? rect(footer) : null,
        imgs, figs, tableRows, chips, sws, figNotes,
        allText: document.body.innerText.replace(/\s+/g, ' ').slice(0, 4000)
      };
    });
    R.compare.blockedExternal = blocked; R.compare.errors = errors;
    await page.screenshot({ path: path.join(AUD, 'verify-compare-1440.png') });
    await ctx.close();
  }

  // 4. 缩略图像素分析
  R.thumb = await thumbAnalysis(browser);

  // 5. 静态扫描（mockup HTML 工程纪律）
  R.htmlScan = {};
  for (const f of ['home-light.html', 'home-dark.html', 'home-390.html', 'family.html', 'compare.html']) {
    try { R.htmlScan[f] = scanMockupHtml('mockups/v5-sig/' + f); } catch (e) { R.htmlScan[f] = { error: String(e) }; }
  }

  // 6. build-sig.js 中声明的调色板 vs 渲染 token
  const bs = fs.readFileSync(path.join(V5, '_tools/build-sig.js'), 'utf8');
  const parsePal = name => {
    const m = bs.match(new RegExp(name + '\\s*=\\s*\\{([^}]*)\\}'));
    if (!m) return null;
    const o = {};
    for (const mm of m[1].matchAll(/t([1-5])\s*:\s*'(#[0-9a-fA-F]{6})'/g)) o['t' + mm[1]] = mm[2];
    return o;
  };
  R.declaredPalette = { light: parsePal('LIGHT'), dark: parsePal('DARK') };
  R.buildSigHas = {
    appendCss: /const V5_APPEND_CSS =/.test(bs),
    newRadiusTokenRule: /\.jump \.jn[\s\S]{0,200}border-radius:\s*var\(--r-sm\)/.test(bs),
    boxShadowInAppend: (() => { const i = bs.indexOf('const V5_APPEND_CSS'); const j = bs.indexOf('function applyCssPatches'); return /box-shadow/i.test(bs.slice(i, j)); })(),
    borderColorInAppend: (() => { const i = bs.indexOf('const V5_APPEND_CSS'); const j = bs.indexOf('function applyCssPatches'); return /border-color/i.test(bs.slice(i, j)); })()
  };

  // 7. CSS 声明级对比：改前 dist/index.html <style> vs 改后 home-light.html <style>
  const distHtml = fs.readFileSync(path.join(ROOT, 'dist/index.html'), 'utf8');
  const afterHtml = fs.readFileSync(path.join(V5, 'home-light.html'), 'utf8');
  const styleOf = html => (html.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '';
  const cssBefore = styleOf(distHtml), cssAfter = styleOf(afterHtml);
  const declSet = (css, prop) => {
    const s = new Set();
    const re = new RegExp(prop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*:\\s*([^;}]+)', 'g');
    for (const m of css.matchAll(re)) s.add(m[1].trim());
    return s;
  };
  const decoReport = {};
  for (const prop of ['border-radius', 'box-shadow', 'border-color', 'border', 'border-top', 'border-bottom', 'border-left', 'outline']) {
    const b = declSet(cssBefore, prop), a = declSet(cssAfter, prop);
    decoReport[prop] = { beforeVals: b.size, afterVals: a.size, added: [...a].filter(x => !b.has(x)), removed: [...b].filter(x => !a.has(x)) };
  }
  R.cssDiff = {
    deco: decoReport,
    t1inkUsageAfter: (cssAfter.match(/var\(--t1-ink\)/g) || []).length,
    t2inkUsageAfter: (cssAfter.match(/var\(--t2-ink\)/g) || []).length,
    statRule: /\.stat\s*\{[^}]*tabular-nums[^}]*letter-spacing:\s*-\s*\.02em[^}]*line-height:\s*1(?:[;}\s])[^}]*font-weight:\s*700/.test(cssAfter),
    stat22Rule: /\.stat-22\s*\{[^}]*font-size:\s*var\(--fs-stat-sm\)/.test(cssAfter),
    stat30Rule: /\.stat-30\s*\{[^}]*font-size:\s*var\(--fs-stat\)/.test(cssAfter),
    stat42Rule: /\.stat-42\s*\{[^}]*font-size:\s*var\(--fs-stat-lg\)/.test(cssAfter),
    fsStatTokens: /--fs-stat-sm:\s*22px/.test(cssAfter) && /--fs-stat:\s*30px/.test(cssAfter) && /--fs-stat-lg:\s*42px/.test(cssAfter),
    tierLineRules: ['t1', 't2', 't3', 't4', 't5'].map(t => new RegExp('\\.tierhead\\.' + t + '\\s+\\.line\\s*\\{[^}]*background:\\s*var\\(--' + t + '\\)[^}]*opacity:\\s*\\.4').test(cssAfter)),
    needCountRule: /\.need-card \.need-copy b\s*\{[^}]*font-size:\s*var\(--fs-stat\)[^}]*font-weight:\s*700[^}]*color:\s*var\(--ink\)/.test(cssAfter),
    quoteBarRule: /\.of \.bar\s*\{[^}]*width:\s*6px/.test(cssAfter),
    quoteInkRule: /\.of \.tx b\s*\{\s*color:\s*var\(--ink\);/.test(cssAfter),
    t4WarnBarRemoved: !/\.of\.t4 \.bar\s*\{\s*background:\s*var\(--warn\)/.test(cssAfter),
    tierSquareRule: /\.tierhead \.n\s*\{[^}]*width:\s*22px;[^}]*height:\s*22px;[^}]*font-size:\s*11px/.test(cssAfter),
    mediaHintHidden: /@media \(max-width: 760px\)\s*\{[^}]*\.tierhead \.hint\s*\{\s*display:\s*none/.test(cssAfter.replace(/\n/g, ' ')),
    mobileLegendRules: [...cssAfter.matchAll(/\.jump \.jn\s*\{\s*display:\s*none/g)].length
  };

  // 8. 对比度（从渲染后 computed token 计算）
  const palette = { light: R.afterLight.tokens, dark: R.afterDark.tokens };
  R.contrast = { light: {}, dark: {} };
  for (const theme of ['light', 'dark']) {
    const tk = palette[theme];
    const bg = rgbToHex(tk['--bg']), card = rgbToHex(tk['--card']);
    R.contrast[theme] = { bg, card, tiers: {}, on: {}, ink: {} };
    for (let i = 1; i <= 5; i++) {
      const hex = rgbToHex(tk['--t' + i]);
      const on = rgbToHex(tk['--on-t' + i]);
      const h = hsl(hex);
      R.contrast[theme].tiers['t' + i] = {
        hex, hsl: h, hueClass: classifyHue(h),
        blockVsBg: +wcag(hex, bg).toFixed(2), blockVsCard: +wcag(hex, card).toFixed(2),
        asTextVsBg: +wcag(hex, bg).toFixed(2), asTextVsCard: +wcag(hex, card).toFixed(2)
      };
      R.contrast[theme].on['t' + i] = { hex: on, onVsBlock: +wcag(on, hex).toFixed(2) };
    }
    R.contrast[theme].ink = {
      inkVsBg: +wcag(rgbToHex(tk['--ink']), bg).toFixed(2),
      inkVsCard: +wcag(rgbToHex(tk['--ink']), card).toFixed(2),
      mutVsBg: +wcag(rgbToHex(tk['--mut']), bg).toFixed(2),
      mutVsCard: +wcag(rgbToHex(tk['--mut']), card).toFixed(2)
    };
  }
  // 页面上实际渲染的色块 on 色（tierhead .n / jump .jn），核对 token 计算与真实 DOM 一致
  R.renderedOn = {};
  for (const theme of ['light', 'dark']) {
    const d = theme === 'light' ? R.afterLight : R.afterDark;
    R.renderedOn[theme] = {
      tierSquares: d.tierheads.map(t => t.n && ({ cls: t.cls, bg: rgbToHex(t.n.bg), color: rgbToHex(t.n.color), contrast: +wcag(rgbToHex(t.n.color), rgbToHex(t.n.bg)).toFixed(2), fs: t.n.fs })),
      legendSquares: d.jumpLinks.map(j => j.jn && ({ text: j.text, bg: rgbToHex(j.jn.bg), color: rgbToHex(j.jn.color), contrast: j.jn.bg && j.jn.color ? +wcag(rgbToHex(j.jn.color), rgbToHex(j.jn.bg)).toFixed(2) : null, fs: j.jn.fs }))
    };
  }

  // 9. 25% 缩略图：至少 3 个不同档位色可测
  const tol20 = R.thumb.counts;
  R.thumb.measurableTierColors = ['t1', 't2', 't3', 't4'].filter(k => tol20[k].tol20 >= 8);
  R.thumb.claimAtLeast3 = R.thumb.measurableTierColors.length >= 3;

  // 10. 工程纪律：git 状态 / 引用文件
  try { R.git = { statusPorcelain: execSync('git status --porcelain', { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter(Boolean) }; } catch (e) { R.git = { error: String(e) }; }
  try { R.git.diffNameOnly = execSync('git diff --name-only', { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter(Boolean); } catch (e) {}
  try { R.git.distIgnored = execSync('git check-ignore -v dist/index.html', { cwd: ROOT, encoding: 'utf8' }).trim(); } catch (e) { R.git.distIgnored = '(not ignored / command failed)'; }
  try {
    const headBlob = execSync('git show HEAD:index.html', { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    R.git.indexHtmlHeadSha = sha256(headBlob);
    R.git.indexHtmlWorkingSha = sha256f(path.join(ROOT, 'index.html'));
    R.git.indexHtmlUnmodified = R.git.indexHtmlHeadSha === R.git.indexHtmlWorkingSha;
  } catch (e) { R.git.indexHtmlError = String(e); }
  R.notesReferenced = /NOTES\.md/.test(bs);
  R.notesExists = ['NOTES.md', 'mockups/v5-sig/NOTES.md', 'mockups/v5-sig/_data/NOTES.md'].some(p => fs.existsSync(path.join(ROOT, p)));

  // 11. 结束快照（页面/脚本/数据/截图是否在复核期间被改动）
  R.finishedAt = new Date().toISOString();
  R.changedDuringAudit = [];
  for (const [f, h] of Object.entries(R.snapshot)) {
    try { const now = sha256f(path.join(ROOT, f)); if (now !== h) R.changedDuringAudit.push(f); } catch (e) { R.changedDuringAudit.push(f + ':missing'); }
  }

  fs.writeFileSync(path.join(AUD, 'measured.json'), JSON.stringify(R, null, 2));
  const pass = x => x ? 'PASS' : 'FAIL';
  console.log(JSON.stringify({
    afterLight: { cards: R.afterLight.cardCount, full: R.afterLight.fullyVisibleCards, gridTop: R.afterLight.gridTop, hOverflow: R.afterLight.horizontalOverflow, tierH: R.afterLight.tierheads.map(t => t.h), needH: [...new Set(R.afterLight.needCards.map(c => c.h))], bigText: R.afterLight.bigText.map(b => b.fs + ':' + b.direct + ':' + (b.isStat ? 'stat' : 'NON-STAT')) },
    afterDark: { cards: R.afterDark.cardCount, full: R.afterDark.fullyVisibleCards, gridTop: R.afterDark.gridTop, hOverflow: R.afterDark.horizontalOverflow, tierH: R.afterDark.tierheads.map(t => t.h) },
    beforeLight: { full: R.beforeLight.fullyVisibleCards, gridTop: R.beforeLight.gridTop, hOverflow: R.beforeLight.horizontalOverflow },
    beforeDark: { full: R.beforeDark.fullyVisibleCards, gridTop: R.beforeDark.gridTop, hOverflow: R.beforeDark.horizontalOverflow },
    after390: { hOverflow: R.after390.horizontalOverflow, needH: [...new Set(R.after390.needCards.map(c => c.h))], tierHeights: R.after390.tierheads.map(t => t.h), hint: R.after390.tierheads.map(t => t.hint && t.hint.display), n: R.after390.tierheads.map(t => t.n && [t.n.rect.w, t.n.rect.h].join('x')), stat: R.after390.tierheads.map(t => t.stat && t.stat.fs) },
    before390: { hOverflow: R.before390.horizontalOverflow, hublineH: R.before390.layout['.hubline'].h, gridTop: R.before390.gridTop, scrollH: R.before390.scrollHeight },
    family: { stats: R.family.statEls.map(s => s.fs + ':' + s.direct), statCount: R.family.statEls.length, hOverflow: R.family.horizontalOverflow, h1: R.family.head.h1, cssLeak: R.family.head.bodyHasCssText, styleInBody: R.family.head.bodyStyleTags, beforeMeta: R.beforeFamily.meta },
    compare: { scrollH: R.compare.scrollHeight, innerH: R.compare.innerHeight, footerBottom: R.compare.footerRect && R.compare.footerRect.bottom, imgs: R.compare.imgs.map(i => i.src + '|' + i.transform + '|' + i.nw + 'x' + i.nh) },
    contrastMin: { light: Math.min(...Object.values(R.contrast.light.tiers).map(t => Math.min(t.blockVsBg, t.blockVsCard, t.asTextVsBg, t.asTextVsCard))), dark: Math.min(...Object.values(R.contrast.dark.tiers).map(t => Math.min(t.blockVsBg, t.blockVsCard, t.asTextVsBg, t.asTextVsCard))), onLight: Math.min(...Object.values(R.contrast.light.on).map(o => o.onVsBlock)), onDark: Math.min(...Object.values(R.contrast.dark.on).map(o => o.onVsBlock)) },
    hueSequenceLight: Object.values(R.contrast.light.tiers).map(t => t.hsl.h + '/' + t.hsl.s + '%=' + t.hueClass),
    hueSequenceDark: Object.values(R.contrast.dark.tiers).map(t => t.hsl.h + '/' + t.hsl.s + '%=' + t.hueClass),
    thumb: { natural: R.thumb.natural, counts: R.thumb.counts, measurable: R.thumb.measurableTierColors },
    cssDiff: { deco: R.cssDiff.deco, t1inkUsage: R.cssDiff.t1inkUsageAfter, t2inkUsage: R.cssDiff.t2inkUsageAfter, statRule: R.cssDiff.statRule },
    htmlScan: Object.fromEntries(Object.entries(R.htmlScan).map(([k, v]) => [k, v.error ? v : { headScripts: v.headScriptCount, bodyScripts: v.bodyScriptCount, jsonLd: v.jsonLd, theme: v.themeScript, styleInBody: v.styleInBody, badRel: v.badRel, analytics: v.analytics }])),
    git: R.git,
    notes: { referenced: R.notesReferenced, exists: R.notesExists },
    changedDuringAudit: R.changedDuringAudit
  }, null, 1));
  await browser.close();
})().catch(e => { console.error('AUDIT FAIL', e); process.exit(1); });
