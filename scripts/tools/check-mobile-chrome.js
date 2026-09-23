#!/usr/bin/env node
/**
 * 手机端「控制带」体检：**逐个可交互控件**量它有没有被裁、有没有折行留大片空白。
 *
 * 为什么需要它（门禁的盲区）：`verify-site.js` 只断言**页面级**没有横向溢出
 * （`documentElement.scrollWidth === clientWidth`）。控件被父容器 `overflow:hidden` 裁掉一截时，
 * 页面级宽度可以完全正常 —— 门禁全绿，而肉眼看是「最近更新」只剩「最近更」。
 * 这个盲区是视觉复核带回来的：见 `research/VISION-REVIEW.md` §6。
 *
 * 用法：
 *   node scripts/serve.js --dir=dist                    # 另开一个终端
 *   node scripts/tools/check-mobile-chrome.js [url]     # 默认 http://127.0.0.1:8080/
 *
 * 输出：每个控件的 width / scrollWidth / clientWidth / clipped（被裁多少）/ 相对父与视口的越界量，
 *       以及 #jumpNav 的 chip 折行情况（rows、每行几枚）与亮/暗两套下顶栏与正文的底色。
 */
const { chromium } = require('playwright-core');
const EDGE = process.env.DSH_EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const URL = process.argv[2] || 'http://127.0.0.1:8080/';

(async () => {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const out = [];

  // ---------- ① 390px：控件是否被裁 / chip 是否折行 ----------
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const el = document.getElementById('lastUpdated');
    return !!el && el.textContent.trim() !== '' && el.textContent.trim() !== '--';
  }, { timeout: 20000 });
  await page.waitForTimeout(200);

  const mobile = await page.evaluate(() => {
    const res = { doc: null, items: [] };
    res.doc = {
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth
    };
    const pick = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return { sel, missing: true };
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const parent = el.parentElement ? el.parentElement.getBoundingClientRect() : null;
      return {
        sel,
        right: Math.round(r.right),
        left: Math.round(r.left),
        width: Math.round(r.width),
        scrollW: el.scrollWidth,
        clientW: el.clientWidth,
        clippedBy: el.scrollWidth - el.clientWidth,
        overflowX: cs.overflowX,
        parentRight: parent ? Math.round(parent.right) : null,
        pastParent: parent ? Math.round(r.right - parent.right) : null,
        pastViewport: Math.round(r.right - window.innerWidth)
      };
    };
    for (const s of ['#sortBox', '#categoryFilter', '.catpick', '#jumpNav', '#viewSeg', '#stats', '.rbar', '.rright']) {
      res.items.push(pick(s));
    }
    // 跳转 chip 是否折行：按 offsetTop 分组
    const jump = document.getElementById('jumpNav');
    if (jump) {
      const links = [...jump.querySelectorAll('a')];
      const rows = {};
      links.forEach(a => { const t = a.offsetTop; rows[t] = (rows[t] || 0) + 1; });
      res.jump = {
        count: links.length,
        rows: Object.keys(rows).length,
        perRow: Object.values(rows),
        navScrollW: jump.scrollWidth,
        navClientW: jump.clientWidth,
        lastChipRight: links.length ? Math.round(links[links.length - 1].getBoundingClientRect().right) : null,
        gapAfterRow1: links.length > 2 ? Math.round(links[3] ? links[3].getBoundingClientRect().left : 0) : null
      };
    }
    // 排序按钮本身是否被裁
    const sortBtns = [...document.querySelectorAll('#sortBox button')].map(b => {
      const r = b.getBoundingClientRect();
      return { text: (b.textContent || '').trim().slice(0, 6), w: Math.round(r.width), sw: b.scrollWidth, right: Math.round(r.right) };
    });
    res.sortBtns = sortBtns;
    return res;
  });

  out.push('=== (1) 390px 控件裁切 / 折行 ===');
  out.push('  document overflowX = ' + mobile.doc.overflowX + 'px (scrollW=' + mobile.doc.scrollW + ', clientW=' + mobile.doc.clientW + ')');
  for (const it of mobile.items) {
    if (it.missing) { out.push('  ' + it.sel + ': MISSING'); continue; }
    out.push('  ' + it.sel.padEnd(16) + ' w=' + String(it.width).padStart(4) +
      ' scrollW=' + String(it.scrollW).padStart(4) + ' clientW=' + String(it.clientW).padStart(4) +
      ' clipped=' + String(it.clippedBy).padStart(4) +
      ' right=' + String(it.right).padStart(4) + ' pastParent=' + String(it.pastParent).padStart(4) +
      ' pastViewport=' + String(it.pastViewport).padStart(4) + ' overflowX=' + it.overflowX);
  }
  if (mobile.jump) {
    out.push('  #jumpNav: chips=' + mobile.jump.count + ' rows=' + mobile.jump.rows + ' perRow=' + JSON.stringify(mobile.jump.perRow) +
      ' scrollW=' + mobile.jump.navScrollW + ' clientW=' + mobile.jump.navClientW +
      ' lastChipRight=' + mobile.jump.lastChipRight);
  }
  out.push('  #sortBox buttons: ' + JSON.stringify(mobile.sortBtns));

  // ---------- ② 主题：顶栏 vs 正文底色 ----------
  out.push('');
  out.push('=== (2) 亮/暗两套下：顶栏与正文底色 ===');
  for (const theme of ['light', 'dark']) {
    const info = await page.evaluate((t) => {
      document.documentElement.setAttribute('data-theme', t);
      const g = (sel, prop) => { const el = document.querySelector(sel); return el ? getComputedStyle(el)[prop] : 'N/A'; };
      return {
        theme: t,
        htmlAttr: document.documentElement.getAttribute('data-theme'),
        headerBg: g('header.top', 'backgroundColor'),
        headerInBg: g('.topin', 'backgroundColor'),
        bodyBg: g('body', 'backgroundColor'),
        cardBg: g('article.g', 'backgroundColor'),
        pageBgVar: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
        cardVar: getComputedStyle(document.documentElement).getPropertyValue('--card').trim()
      };
    }, theme);
    out.push('  [' + info.theme + '] html[data-theme]=' + info.htmlAttr +
      '  header.top=' + info.headerBg + '  .topin=' + info.headerInBg +
      '  body=' + info.bodyBg + '  card=' + info.cardBg + '  --bg=' + info.pageBgVar + '  --card=' + info.cardVar);
  }

  await browser.close();
  console.log(out.join('\n'));
})().catch(e => { console.error('FAILED: ' + e.message); process.exit(1); });
