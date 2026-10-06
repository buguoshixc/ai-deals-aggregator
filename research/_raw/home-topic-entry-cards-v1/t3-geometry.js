#!/usr/bin/env node
/**
 * T3 首屏密度 / 响应式几何 / 无 JS / 真实点击导航 —— 实测取证脚本（只读 dist/）。
 *
 * 口径与 scripts/tools/verify-site.js **逐字相同**：
 *   · 浏览器：C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe（可用 DSH_EDGE 覆盖），headless；
 *   · page.goto(base, { waitUntil: 'load' }) 后 waitForApp()：#lastUpdated 由 '--' 变成真实时间戳；
 *   · 「完整可见」= bottom <= window.innerHeight；「含截断」= top < window.innerHeight；
 *   · slack = viewportH − 首屏最后一张「完整可见」卡的 bottom。
 *
 * 与 verify-site.js 的分工：verify-site.js 负责**断言**（红/绿），本脚本负责**把每个数字落盘** ——
 * 每张卡的 getBoundingClientRect()、6 档视口、无 JS 与有 JS 的逐条比对、10 张卡的真实点击导航。
 * Before 读数不手抄：直接读 research/_raw/home-topic-entry-cards-v1/t1-baseline-measure.json
 * （T1 的 Before 冻结件，带 BOM），Delta 由脚本算。
 *
 * 用法：node research/_raw/home-topic-entry-cards-v1/t3-geometry.js
 * 输出：research/_raw/home-topic-entry-cards-v1/t3-geometry.json（+ stdout 摘要）
 */
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.join(__dirname, '..', '..', '..');
const DIR = path.join(ROOT, 'dist');
const EDGE = process.env.DSH_EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = path.join(__dirname, 't3-geometry.json');
const T1_JSON = path.join(__dirname, 't1-baseline-measure.json');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8'
};

function serve(dir) {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
      let file = path.join(dir, rel);
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404).end('not found');
        return;
      }
      res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

async function waitForApp(page) {
  await page.waitForFunction(() => {
    const el = document.getElementById('lastUpdated');
    return !!el && el.textContent.trim() !== '' && el.textContent.trim() !== '--';
  }, { timeout: 20000 });
  await page.waitForTimeout(120);
}

/** 读出「专题导航卡」这一块的全部几何 + 首屏密度（口径与 verify-site.js 逐字相同） */
const MEASURE = () => {
  const cards = [...document.querySelectorAll('article.g')];
  const grid = document.querySelector('.grid');
  const nav = document.querySelector('nav.needs');
  const needCards = nav ? [...nav.querySelectorAll('a.need-card')] : [];
  const needGrid = nav ? nav.querySelector('.need-grid') : null;
  const rects = needCards.map(a => {
    const r = a.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
  });
  const tops = [...new Set(rects.map(r => Math.round(r.top)))].sort((x, y) => x - y);
  let needOverlaps = 0;
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i], b = rects[j];
    if (a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) needOverlaps++;
  }
  const fullCards = cards.filter(c => c.getBoundingClientRect().bottom <= window.innerHeight);
  const partCards = cards.filter(c => c.getBoundingClientRect().top < window.innerHeight);
  const lastFullBottom = fullCards.length
    ? Math.max(...fullCards.map(c => c.getBoundingClientRect().bottom)) : null;
  const navBox = nav ? nav.getBoundingClientRect() : null;
  const navStyle = nav ? getComputedStyle(nav) : null;
  const gridStyle = needGrid ? getComputedStyle(needGrid) : null;
  const deckStyle = grid ? getComputedStyle(grid) : null;
  return {
    viewport: { w: window.innerWidth, h: window.innerHeight },
    needs: nav ? {
      found: true,
      height: +navBox.height.toFixed(2),
      top: +navBox.top.toFixed(2),
      bottom: +navBox.bottom.toFixed(2),
      overflowX: navStyle.overflowX,
      scrollWidth: nav.scrollWidth,
      clientWidth: nav.clientWidth,
      scrollable: nav.scrollWidth > nav.clientWidth + 1,
      cards: needCards.length,
      links: nav.querySelectorAll('a').length,
      jsControls: nav.querySelectorAll('button, input, select').length,
      facetMarkers: nav.querySelectorAll('[data-facet], [aria-pressed], [role="button"]').length,
      gridTop: needGrid ? +needGrid.getBoundingClientRect().top.toFixed(2) : null,
      gridColumns: gridStyle ? gridStyle.gridTemplateColumns : null,
      gridTracks: gridStyle ? gridStyle.gridTemplateColumns.split(' ').filter(Boolean).length : null,
      gridOverflowX: gridStyle ? gridStyle.overflowX : null,
      rows: tops.length,
      perRow: tops.map(t => rects.filter(r => Math.round(r.top) === t).length),
      rowTops: tops,
      heights: [...new Set(rects.map(r => +r.height.toFixed(2)))],
      widths: [...new Set(rects.map(r => +r.width.toFixed(2)))],
      clipped: needCards.filter(a => a.scrollWidth > a.clientWidth + 1).length,
      inViewport: rects.filter(r => r.width > 0 && r.height > 0 && r.left >= -0.5 && r.right <= window.innerWidth + 1).length,
      overlaps: needOverlaps,
      minLeft: rects.length ? +Math.min(...rects.map(r => r.left)).toFixed(2) : null,
      maxRight: rects.length ? +Math.max(...rects.map(r => r.right)).toFixed(2) : null,
      rects: rects.map(r => ({
        left: +r.left.toFixed(2), right: +r.right.toFixed(2),
        top: +r.top.toFixed(2), bottom: +r.bottom.toFixed(2),
        width: +r.width.toFixed(2), height: +r.height.toFixed(2)
      }))
    } : { found: false },
    dealGrid: {
      top: grid ? +grid.getBoundingClientRect().top.toFixed(2) : null,
      cols: deckStyle ? deckStyle.gridTemplateColumns.split(' ').filter(Boolean).length : null,
      colGap: deckStyle ? deckStyle.columnGap : null,
      rowGap: deckStyle ? deckStyle.rowGap : null
    },
    cards: {
      count: cards.length,
      heights: [...new Set(cards.map(c => Math.round(c.getBoundingClientRect().height)))],
      firstScreenFull: fullCards.length,
      firstScreenPart: partCards.length,
      lastFullBottom: lastFullBottom === null ? null : +lastFullBottom.toFixed(2),
      slackFull: lastFullBottom === null ? null : +(window.innerHeight - lastFullBottom).toFixed(2)
    },
    facets: {
      count: document.querySelectorAll('[data-facet]').length,
      tags: [...new Set([...document.querySelectorAll('[data-facet]')].map(e => e.tagName))],
      heights: [...new Set([...document.querySelectorAll('[data-facet]')].map(e => Math.round(e.getBoundingClientRect().height)))]
    },
    pageHeight: Math.round(document.documentElement.scrollHeight),
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth
  };
};

/** 卡片逐条内容（无 JS / 有 JS 两侧要比的就是它） */
const CARD_TEXT = () => {
  const nav = document.querySelector('nav.needs');
  const cards = nav ? [...nav.querySelectorAll('a.need-card')] : [];
  return cards.map(a => {
    const g = sel => { const el = a.querySelector(sel); return el ? el.textContent.trim() : null; };
    return {
      tag: a.tagName,
      href: a.getAttribute('href'),
      label: g('.need-copy > strong'),
      badge: g('.need-copy b'),
      desc: g('.need-copy > small'),
      icon: g('.need-icon'),
      iconAriaHidden: a.querySelector('.need-icon') ? a.querySelector('.need-icon').getAttribute('aria-hidden') : null,
      arrow: g('.need-arrow'),
      arrowAriaHidden: a.querySelector('.need-arrow') ? a.querySelector('.need-arrow').getAttribute('aria-hidden') : null,
      fourPiece: a.querySelectorAll('.need-icon').length === 1 && a.querySelectorAll('.need-copy > strong').length === 1 &&
        a.querySelectorAll('.need-copy > small').length === 1 && a.querySelectorAll('.need-arrow').length === 1
    };
  });
};

(async () => {
  const started = await serve(DIR);
  const base = `http://127.0.0.1:${started.port}/`;
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(`${page.url()} :: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`${page.url()} :: ${m.text()}`); });

  const needPages = require(path.join(ROOT, 'scripts', 'lib', 'audience.js')).NEED_PAGES;

  // ① 1440×900：首屏密度（After）
  await page.goto(base, { waitUntil: 'load' });
  await waitForApp(page);
  const after1440 = await page.evaluate(MEASURE);
  const jsCards = await page.evaluate(CARD_TEXT);

  // ② 响应式：1600/1440/1280/768/430/390 逐档（高度 900，与 1440 档同口径）
  const responsive = {};
  for (const width of [1600, 1440, 1280, 768, 430, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(180);
    responsive[`${width}x900`] = await page.evaluate(MEASURE);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(120);

  // ③ 无 JS：javaScriptEnabled:false 打开首页，卡片必须在（构建期注入）
  const noJsCtx = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });
  const noJsPage = await noJsCtx.newPage();
  await noJsPage.goto(base, { waitUntil: 'load' });
  const noJs1440 = await noJsPage.evaluate(MEASURE);
  const noJsCards = await noJsPage.evaluate(CARD_TEXT);
  await noJsCtx.close();

  // ④ 真实点击导航：10 张卡逐张 page.click（不是比 href 字符串）
  const clicks = [];
  for (let i = 0; i < needPages.length; i++) {
    const spec = needPages[i];
    await page.goto(base, { waitUntil: 'load' });
    await waitForApp(page);
    const sel = `nav.needs a.need-card[href="need/${spec.slug}/"]`;
    const hits = await page.locator(sel).count();
    const errorsBefore = errors.length;
    let status = null, landed = '', h1 = '';
    if (hits === 1) {
      const waiting = page.waitForResponse(r => r.request().isNavigationRequest() &&
        r.url().split(/[?#]/)[0].endsWith(`/need/${spec.slug}/`), { timeout: 20000 }).catch(() => null);
      await page.click(sel);
      const resp = await waiting;
      status = resp ? resp.status() : null;
      await page.waitForURL(u => u.href.split(/[?#]/)[0].endsWith(`/need/${spec.slug}/`), { timeout: 20000 }).catch(() => {});
      await page.waitForLoadState('load');
      await page.waitForFunction(() => {
        const el = document.querySelector('h1');
        return !!el && el.textContent.trim().length > 0;
      }).catch(() => {});
      landed = (page.url() || '').split(/[?#]/)[0];
      h1 = await page.evaluate(() => ((document.querySelector('h1') || {}).textContent || '').trim());
    }
    clicks.push({
      index: i + 1, slug: spec.slug, label: spec.label, selectorHits: hits,
      httpStatus: status, landedUrl: landed, h1, h1Expected: spec.heading,
      jsErrors: errors.length - errorsBefore,
      ok: hits === 1 && status === 200 && landed.endsWith(`/need/${spec.slug}/`) &&
        h1 === spec.heading && errors.length === errorsBefore
    });
  }
  await browser.close();
  started.server.close();

  // ⑤ Before 读数（读 T1 的冻结件，不手抄）
  // ⚠️ T1 落盘用的重定向在 Windows 上写成了 **UTF-16LE + BOM**（首字节 ff fe），
  // 直接 readFileSync(...,'utf8') 会得到 `\uFFFD\uFFFD{` 而 JSON.parse 抛错。
  // 这里按 BOM 自动选编码，读取端不再依赖写入端的平台默认值。
  const readJsonAny = p => {
    const buf = fs.readFileSync(p);
    if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return JSON.parse(buf.slice(2).toString('utf16le'));
    if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
      const swapped = Buffer.from(buf.slice(2)); swapped.swap16();
      return JSON.parse(swapped.toString('utf16le'));
    }
    return JSON.parse(buf.toString('utf8').replace(/^\uFEFF/, ''));
  };
  let before1440 = null;
  let beforeNarrow = {};
  if (fs.existsSync(T1_JSON)) {
    const raw = readJsonAny(T1_JSON);
    const p = raw.probes && raw.probes['1440x900'];
    if (p) {
      before1440 = {
        needsHeight: p.navNeeds && p.navNeeds.height,
        gridTop: p.grid && p.grid.top,
        firstScreenFull: p.firstScreenFull,
        firstScreenPart: p.firstScreenPart,
        lastFullBottom: p.lastFullBottom !== undefined ? p.lastFullBottom : null,
        slackFull: p.slackFull,
        pageHeight: p.pageHeight,
        overflowX: p.overflowX,
        cards: p.cards && p.cards.count
      };
    }
    for (const [k, v] of Object.entries(raw.probes || {})) {
      beforeNarrow[k] = {
        needsHeight: v.navNeeds && v.navNeeds.height,
        gridTop: v.grid && v.grid.top,
        firstScreenFull: v.firstScreenFull,
        firstScreenPart: v.firstScreenPart,
        slackFull: v.slackFull,
        pageHeight: v.pageHeight,
        overflowX: v.overflowX,
        perRow: v.navLinks && v.navLinks.perRow
      };
    }
  }
  const delta = before1440 ? {
    needsHeight: { before: before1440.needsHeight, after: after1440.needs.height, delta: +(after1440.needs.height - before1440.needsHeight).toFixed(2) },
    gridTop: { before: before1440.gridTop, after: after1440.dealGrid.top, delta: +(after1440.dealGrid.top - before1440.gridTop).toFixed(2) },
    firstScreenFull: { before: before1440.firstScreenFull, after: after1440.cards.firstScreenFull, delta: after1440.cards.firstScreenFull - before1440.firstScreenFull },
    firstScreenPart: { before: before1440.firstScreenPart, after: after1440.cards.firstScreenPart, delta: after1440.cards.firstScreenPart - before1440.firstScreenPart },
    slackFull: { before: before1440.slackFull, after: after1440.cards.slackFull, delta: +(after1440.cards.slackFull - before1440.slackFull).toFixed(2) },
    pageHeight: { before: before1440.pageHeight, after: after1440.pageHeight, delta: after1440.pageHeight - before1440.pageHeight }
  } : null;

  const out = {
    generatedAt: new Date().toISOString(),
    target: base,
    browser: { executable: EDGE, headless: true, playwrightCore: require('playwright-core/package.json').version },
    measurementNote: '口径与 scripts/tools/verify-site.js 逐字相同：waitUntil:load + waitForApp（#lastUpdated 由 -- 变真实时间戳）；完整可见 = bottom <= innerHeight',
    distIndexSha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(DIR, 'index.html'))).digest('hex'),
    after: {
      '1440x900': after1440,
      responsive,
      noJs: { '1440x900': noJs1440 }
    },
    cards: {
      jsCount: jsCards.length,
      noJsCount: noJsCards.length,
      identical: JSON.stringify(jsCards) === JSON.stringify(noJsCards),
      js: jsCards,
      noJs: noJsCards
    },
    clicks,
    clicksAllOk: clicks.every(c => c.ok),
    before: { '1440x900': before1440, narrow: beforeNarrow },
    delta,
    jsErrors: errors
  };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n', 'utf8');

  // stdout 摘要（人读）
  const a = after1440;
  console.log(`dist/index.html sha256 ${out.distIndexSha256.slice(0, 16)}…`);
  console.log(`1440x900 After：needs ${a.needs.height}px（Before ${before1440 ? before1440.needsHeight : '—'}）· 网格起点 ${a.dealGrid.top}px · 卡 ${a.cards.count} 张/${a.dealGrid.cols} 列/${a.cards.heights.join('/')}px`);
  console.log(`  首屏完整 ${a.cards.firstScreenFull} 张 / 含截断 ${a.cards.firstScreenPart} 张 · 最后完整卡 bottom ${a.cards.lastFullBottom} · slack ${a.cards.slackFull} · 页高 ${a.pageHeight}px · 横向溢出 ${a.overflowX}px`);
  console.log(`  专题卡：${a.needs.cards} 张 · ${a.needs.rows} 行（${a.needs.perRow.join('/')}）· 轨道 ${a.needs.gridTracks} · 卡高 ${a.needs.heights.join('/')}px · 在视口内 ${a.needs.inViewport}/${a.needs.cards} · 重叠 ${a.needs.overlaps} · 被裁 ${a.needs.clipped}`);
  console.log(`  筛选器 [data-facet]：${a.facets.count} 个 ${a.facets.tags.join('/')} 各 ${a.facets.heights.join('/')}px`);
  for (const w of [1600, 1440, 1280, 768, 430, 390]) {
    const m = responsive[`${w}x900`];
    console.log(`  ${w}px：块 ${m.needs.height}px · ${m.needs.rows} 行（${m.needs.perRow.join('/')}）· 轨道 ${m.needs.gridTracks} · 在视口内 ${m.needs.inViewport}/${m.needs.cards} · 重叠 ${m.needs.overlaps} · 页面溢出 ${m.overflowX}px · 首屏完整卡 ${m.cards.firstScreenFull}`);
  }
  console.log(`无 JS：${noJsCards.length} 张卡 · 与有 JS 逐条相同 = ${JSON.stringify(jsCards) === JSON.stringify(noJsCards)}`);
  console.log(`真实点击：${clicks.filter(c => c.ok).length}/${clicks.length} 张卡点通（HTTP 200 + 落地 slug + h1 与注册项一致）`);
  console.log(`JS 错误：${errors.length}`);
  console.log(`\n已写出 ${path.relative(ROOT, OUT)}`);
})().catch(e => { console.error(e); process.exit(1); });
