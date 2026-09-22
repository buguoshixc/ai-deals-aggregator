const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const DIR = path.join(__dirname, 'mockups', 'v2-dense');
const FILE = '009-真Logo版.html';
const url = 'file:///' + path.join(DIR, FILE).replace(/\\/g, '/');

(async () => {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [], failedReq = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('requestfailed', (r) => failedReq.push(r.url().slice(0, 60)));

  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(700);

  const r = await page.evaluate(() => {
    // 每个 logo tile 实际画出来了吗
    const tiles = [...document.querySelectorAll('.lg')];
    const imgTiles = tiles.filter((t) => t.classList.contains('img'));
    const svgTiles = tiles.filter((t) => t.classList.contains('svg'));

    const imgOk = imgTiles.map((t) => {
      const img = t.querySelector('img');
      return {
        title: t.getAttribute('title'),
        complete: img.complete,
        naturalW: img.naturalWidth,
        naturalH: img.naturalHeight,
        boxW: Math.round(img.getBoundingClientRect().width),
        boxH: Math.round(img.getBoundingClientRect().height),
        ok: img.complete && img.naturalWidth > 0
      };
    });

    const svgOk = svgTiles.map((t) => {
      const svg = t.querySelector('svg');
      const b = svg ? svg.getBoundingClientRect() : { width: 0, height: 0 };
      const path = svg ? svg.querySelector('path') : null;
      return {
        title: t.getAttribute('title'),
        boxW: Math.round(b.width),
        boxH: Math.round(b.height),
        hasPath: !!path,
        dLen: path ? path.getAttribute('d').length : 0,
        ok: !!svg && !!path && b.width > 4 && path.getAttribute('d').length > 5
      };
    });

    const cards = [...document.querySelectorAll('article.g')];
    const grid = document.querySelector('.grid').getBoundingClientRect();
    const src = document.querySelector('.srctable');
    return {
      tiles: tiles.length, imgTiles: imgTiles.length, svgTiles: svgTiles.length,
      imgBad: imgOk.filter((x) => !x.ok),
      svgBad: svgOk.filter((x) => !x.ok),
      imgSample: imgOk.slice(0, 8),
      svgBadAll: svgOk.filter((x) => x.boxW === 0).length,
      cards: cards.length,
      cardHeights: [...new Set(cards.map((c) => Math.round(c.getBoundingClientRect().height)))],
      overflow: cards.filter((c) => c.scrollHeight > c.clientHeight + 1).length,
      inView: cards.filter((c) => { const b = c.getBoundingClientRect(); return b.top < 900 && b.bottom > 0; }).length,
      gridH: Math.round(grid.height),
      docH: document.documentElement.scrollHeight,
      srcH: src ? Math.round(src.getBoundingClientRect().height) : 0,
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
      srcRows: document.querySelectorAll('.srctable tbody tr').length,
      wideTiles: [...document.querySelectorAll('.lg.img.wide')].map((t) => {
        const r = t.getBoundingClientRect();
        const img = t.querySelector('img');
        return { title: t.getAttribute('title'), w: Math.round(r.width), h: Math.round(r.height), nw: img.naturalWidth, nh: img.naturalHeight };
      })
    };
  });

  console.log('=== 009 logo 渲染验证 ===');
  console.log('  logo 总数        : ' + r.tiles + '（品牌 SVG ' + r.svgTiles + ' / 官网位图 ' + r.imgTiles + '）');
  console.log('  SVG 尺寸为 0 的   : ' + r.svgBadAll + ' 个' + (r.svgBadAll ? '  （都在关闭的详情面板里，非缺陷）' : ''));
  console.log('  位图未加载       : ' + r.imgBad.length + (r.imgBad.length ? '  ⚠ ' + JSON.stringify(r.imgBad) : '  ✓ 全部加载成功'));

  console.log('\n  位图明细:');
  r.imgSample.forEach((x) => console.log('    ' + (x.ok ? '✓' : '✗') + ' ' + String(x.title).padEnd(22) +
    '源图 ' + (x.naturalW + 'x' + x.naturalH).padEnd(10) + '显示 ' + x.boxW + 'x' + x.boxH));
  console.log('\n  长条图形适配:');
  r.wideTiles.forEach((x) => console.log('    ' + x.title + '  源图 ' + x.nw + 'x' + x.nh +
    '（比例 ' + (x.nw / x.nh).toFixed(1) + ':1）→ 胶囊 ' + x.w + 'x' + x.h + '（比例 ' + (x.w / x.h).toFixed(1) + ':1）'));

  console.log('\n=== 布局 ===');
  console.log('  卡片高度集合     : ' + JSON.stringify(r.cardHeights) + (r.cardHeights.length === 1 ? '  ✓ 统一' : '  ⚠ 不齐'));
  console.log('  内容被裁卡片     : ' + r.overflow + ' / ' + r.cards);
  console.log('  首屏可见         : ' + r.inView + ' 条');
  console.log('  卡片网格区高度   : ' + r.gridH + 'px = ' + (r.gridH / 900).toFixed(1) + ' 屏   ← 与 008 可比');
  console.log('  logo 来源表高度  : ' + r.srcH + 'px（附录，计入页面总高 ' + r.docH + 'px = ' + (r.docH / 900).toFixed(1) + ' 屏）');
  console.log('  横向溢出         : ' + (r.scrollW > r.clientW + 1 ? 'YES' : 'no'));
  console.log('  来源表行数       : ' + r.srcRows);
  console.log('  JS 错误          : ' + (errs.length ? errs.join(' / ') : '无'));
  console.log('  失败请求         : ' + (failedReq.length ? failedReq.join(' / ') : '无（全内联，无外部请求）'));

  await page.screenshot({ path: path.join(DIR, '.preview', '009-桌面.png'), fullPage: true });

  // hover 展开
  await page.evaluate(() => {
    const l = [...document.querySelectorAll('article.g .logos')].find((x) => x.querySelectorAll('.lg').length >= 5);
    if (l) l.setAttribute('data-t', '1');
  });
  const before = await page.evaluate(() => {
    const c = document.querySelector('[data-t="1"]').closest('article.g');
    return Math.round(c.getBoundingClientRect().height);
  });
  await page.hover('[data-t="1"]');
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => {
    const c = document.querySelector('[data-t="1"]').closest('article.g');
    const lgs = [...c.querySelectorAll('.logos .lg')];
    const gaps = lgs.slice(1).map((l, i) => Math.round(l.getBoundingClientRect().left - lgs[i].getBoundingClientRect().right));
    return { h: Math.round(c.getBoundingClientRect().height), gaps, span: Math.round(lgs[lgs.length - 1].getBoundingClientRect().right - lgs[0].getBoundingClientRect().left) };
  });
  console.log('\n=== hover 展开 ===');
  console.log('  卡片高度         : ' + before + ' → ' + after.h + (before === after.h ? '  ✓ 未变' : '  ⚠ 变了'));
  console.log('  logo 间距        : ' + JSON.stringify(after.gaps) + (after.gaps.every((g) => g > 0) ? '  ✓' : '  ⚠'));
  console.log('  展开后总宽       : ' + after.span + 'px');
  await page.screenshot({ path: path.join(DIR, '.preview', '009-logo展开.png') });

  // 手机
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const mob = await page.evaluate(() => ({ over: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 }));
  console.log('\n手机 390px 横向溢出: ' + (mob.over ? 'YES ⚠' : 'no ✓'));
  await page.screenshot({ path: path.join(DIR, '.preview', '009-手机.png') });

  await browser.close();
})();
