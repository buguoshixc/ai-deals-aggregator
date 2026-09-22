#!/usr/bin/env node
/**
 * 线上产物的真浏览器验收（dev 工具，需要 playwright-core）。
 *
 * 为什么必须有这一步：卡片是固定高度的，任何一处内容变高都会被 overflow:hidden 静默裁掉；
 * logo 簇是 hover 展开的，很容易把标题挤到换行、把网格行高顶动。这些在静态检查里都看不见。
 *
 * 用法：
 *   node scripts/tools/build-local.js && node scripts/tools/verify-site.js
 *   node scripts/tools/verify-site.js --dir=dist --keep   # 保留浏览器窗口（调试用）
 *
 * 退出码非 0 = 有断言失败。
 */

const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.join(__dirname, '..', '..');
const dirArg = process.argv.find(a => a.startsWith('--dir='));
const DIR = path.join(ROOT, dirArg ? dirArg.slice(6) : 'dist');
const EDGE = process.env.DSH_EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8'
};

/** 极简静态服务器：只服务 dist/，避免依赖外部包 */
function serve(dir) {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
      const file = path.join(dir, rel);
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

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
}

(async () => {
  if (!fs.existsSync(path.join(DIR, 'index.html'))) {
    console.error(`找不到 ${path.relative(ROOT, DIR)}/index.html，请先 npm run build`);
    process.exit(1);
  }
  const { server, port } = await serve(DIR);
  const base = `http://127.0.0.1:${port}/`;
  const browser = await chromium.launch({ executablePath: EDGE, headless: !process.argv.includes('--keep') });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const errors = [];
  const failedRequests = [];
  const externalRequests = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('requestfailed', r => failedRequests.push(r.url()));
  page.on('request', r => { if (!r.url().startsWith(base) && !r.url().startsWith('data:')) externalRequests.push(r.url()); });

  console.log('\n=== 1) 无 JS：预渲染骨架 ===');
  await page.route('**/deals.json', route => route.abort());   // 断掉数据，只看静态 HTML
  await page.goto(base, { waitUntil: 'load' });
  const noJs = await page.evaluate(() => {
    const body = document.body;
    body.classList.remove('js');   // 模拟没有 JS 接管
    return {
      cards: document.querySelectorAll('article.g').length,
      links: document.querySelectorAll('article.g a[href^="http"]').length,
      tierHeads: document.querySelectorAll('.tierhead').length,
      facets: document.querySelectorAll('[data-facet]').length,
      logos: document.querySelectorAll('.lg').length,
      hintsHidden: [...document.querySelectorAll('.meta .hint')].every(el => getComputedStyle(el).display === 'none')
    };
  });
  check('静态骨架有卡片', noJs.cards >= 45, `${noJs.cards} 条`);
  check('静态骨架有外链', noJs.links >= 45, `${noJs.links} 个`);
  check('力度分带已预渲染', noJs.tierHeads >= 3, `${noJs.tierHeads} 档`);
  check('筛选条已预渲染', noJs.facets >= 4, `${noJs.facets} 个 facet`);
  check('logo 已预渲染', noJs.logos >= 20, `${noJs.logos} 个 tile`);
  check('无 JS 时不显示「详情」提示', noJs.hintsHidden);

  // 第 1 步故意断掉了 deals.json，这里把收集器清空，后面测的是正常加载
  errors.length = 0;
  failedRequests.length = 0;
  externalRequests.length = 0;

  console.log('\n=== 2) 有 JS：接管后的默认视图 ===');
  await page.unroute('**/deals.json');
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  const rendered = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('article.g')];
    const grid = document.querySelector('.grid');
    const style = getComputedStyle(grid);
    const cols = style.gridTemplateColumns.split(' ').length;
    const gridBox = grid.getBoundingClientRect();
    return {
      cards: cards.length,
      cols,
      facets: document.querySelectorAll('[data-facet]').length,
      tierHeads: document.querySelectorAll('.tierhead').length,
      tiles: document.querySelectorAll('.lg').length,
      tileKeys: [...new Set([...document.querySelectorAll('.lg[data-logo]')].map(el => el.dataset.logo))],
      heights: [...new Set(cards.map(c => Math.round(c.getBoundingClientRect().height)))],
      gridTop: Math.round(gridBox.top),
      stats: document.querySelector('#stats').textContent.trim(),
      topStat: document.querySelector('#topStat').textContent.trim(),
      firstScreen: cards.filter(c => c.getBoundingClientRect().top < window.innerHeight).length,
      pageHeight: Math.round(document.documentElement.scrollHeight)
    };
  });
  check('卡片数与预渲染一致', rendered.cards >= 45, `${rendered.cards} 条`);
  check('桌面三列', rendered.cols === 3, `${rendered.cols} 列`);
  check('卡片高度统一', rendered.heights.length === 1, rendered.heights.join('/') + 'px');
  check('首屏卡片数 ≥ 9', rendered.firstScreen >= 9, `${rendered.firstScreen} 条 / 页高 ${rendered.pageHeight}px`);
  check('汇总条已填充', /显示\s*\d+\s*条卡片/.test(rendered.stats), rendered.stats.slice(0, 40));
  check('顶栏汇总已填充', /\d+\s*条优惠/.test(rendered.topStat), rendered.topStat);
  console.log(`     logo key: ${rendered.tileKeys.length} 个 → ${rendered.tileKeys.join(' ')}`);

  console.log('\n=== 3) logo 图形真的画出来了 ===');
  const logoProbe = await page.evaluate(async (keys) => {
    const fails = [];
    for (const key of keys) {
      const el = document.querySelector(`.lg[data-logo="${key}"]`);
      const bg = getComputedStyle(el).backgroundImage;
      const url = bg.match(/url\("?([^")]+)"?\)/);
      if (!url) { fails.push(key + ': 没有 background-image'); continue; }
      const ok = await new Promise(resolve => {
        const img = new Image();
        img.onload = () => resolve(img.naturalWidth > 0);
        img.onerror = () => resolve(false);
        img.src = url[1];
      });
      const box = el.getBoundingClientRect();
      if (!ok) fails.push(key + ': 图形加载失败');
      else if (box.width < 12 || box.height < 12) fails.push(`${key}: tile ${Math.round(box.width)}x${Math.round(box.height)} 过小`);
    }
    return fails;
  }, rendered.tileKeys);
  check('全部 logo 可加载且有尺寸', logoProbe.length === 0, logoProbe.join('; ') || `${rendered.tileKeys.length} 个`);

  console.log('\n=== 4) 内容没有被裁掉 ===');
  const clip = await page.evaluate(() => {
    const bad = [];
    for (const card of document.querySelectorAll('article.g')) {
      const box = card.getBoundingClientRect();
      const overflowY = card.scrollHeight - card.clientHeight;
      // 真正的判据：最后一个可见子元素的底边是否越过卡片内边距
      const kids = [...card.children].filter(k => getComputedStyle(k).display !== 'none');
      const last = kids[kids.length - 1];
      const lastBottom = last ? last.getBoundingClientRect().bottom : box.bottom;
      const innerBottom = box.bottom - parseFloat(getComputedStyle(card).paddingBottom);
      if (overflowY > 1 || lastBottom > innerBottom + 1) {
        bad.push({
          title: card.querySelector('h3').textContent.trim().slice(0, 22),
          overflowY: Math.round(overflowY),
          over: Math.round(lastBottom - innerBottom)
        });
      }
    }
    return bad;
  });
  check('卡片内容无溢出', clip.length === 0,
    clip.length ? `${clip.length} 条溢出，例如 ${JSON.stringify(clip.slice(0, 3))}` : '全部卡片内容在高度内');

  console.log('\n=== 5) logo 簇 hover 展开不影响布局 ===');
  // 用真实鼠标悬停触发 :hover（不是注入 CSS 模拟），measure 前后四个量。
  const probe = await page.evaluateHandle(() => {
    const card = [...document.querySelectorAll('article.g')].find(c => c.querySelectorAll('.lg').length >= 3)
      || document.querySelector('article.g');
    window.__probeCard = card;
    return card.querySelector('.logos');
  });
  const measure = () => page.evaluate(() => {
    const card = window.__probeCard;
    const strip = card.querySelector('.logos');
    const title = card.querySelector('h3');
    return {
      card: Math.round(card.getBoundingClientRect().height),
      strip: Math.round(strip.getBoundingClientRect().width),
      tileGap: Math.round(strip.querySelectorAll('.lg')[1] ? strip.querySelectorAll('.lg')[1].getBoundingClientRect().left - strip.querySelector('.lg').getBoundingClientRect().right : 0),
      title: Math.round(title.getBoundingClientRect().width),
      titleBox: Math.round(title.getBoundingClientRect().height),
      tiles: strip.querySelectorAll('.lg').length
    };
  });
  const before = await measure();
  await probe.hover();
  await page.waitForTimeout(400);
  const after = await measure();
  const stable = before.card === after.card && before.strip === after.strip &&
    before.title === after.title && before.titleBox === after.titleBox;
  const expanded = after.tileGap > before.tileGap;
  check('悬停确实展开了 logo 簇', expanded, `间距 ${before.tileGap}px → ${after.tileGap}px（${before.tiles} 个 tile）`);
  check('展开前后：卡片高 / logo 簇宽 / 标题宽 均不变', stable, JSON.stringify({ before, after }));
  await page.mouse.move(0, 0);
  await page.waitForTimeout(250);

  console.log('\n=== 6) 详情弹层 ===');
  const dialog = await page.evaluate(async () => {
    const card = [...document.querySelectorAll('article.g')].find(c => c.querySelectorAll('.lg').length >= 2)
      || document.querySelector('article.g');
    const title = card.querySelector('h3').textContent.trim();
    card.click();
    await new Promise(r => setTimeout(r, 200));
    const dlg = document.getElementById('detail');
    const open = dlg.open;
    const shown = dlg.querySelector('h2') ? dlg.querySelector('h2').textContent.trim() : '';
    const cells = dlg.querySelectorAll('.dgrid .cv').length;
    const cta = !!dlg.querySelector('.dact .pri');
    // 弹层里的 logo 必须一行平铺（曾经因为容器没有布局规则而竖着叠起来）
    const dl = dlg.querySelector('.dh-logos');
    const tops = dl ? [...dl.querySelectorAll('.lg')].map(el => Math.round(el.getBoundingClientRect().top)) : [];
    const oneRow = tops.length > 1 && new Set(tops).size === 1;
    const tileW = dl && dl.querySelector('.lg') ? Math.round(dl.querySelector('.lg').getBoundingClientRect().width) : 0;
    dlg.querySelector('.x').click();
    await new Promise(r => setTimeout(r, 200));
    return { title, shown, open, cells, cta, closed: !dlg.open, oneRow, tiles: tops.length, tileW };
  });
  check('点卡片打开弹层', dialog.open, `「${dialog.title}」`);
  check('弹层标题与卡片一致', dialog.shown === dialog.title, `弹层「${dialog.shown}」`);
  check('弹层有字段表与领取入口', dialog.cells >= 2 && dialog.cta, `${dialog.cells} 个字段`);
  check('弹层 logo 一行平铺', dialog.oneRow || dialog.tiles <= 1, `${dialog.tiles} 个 tile，宽 ${dialog.tileW}px`);
  check('可以关闭', dialog.closed);

  console.log('\n=== 7) 筛选 / 排序真的生效 ===');
  const filter = await page.evaluate(async () => {
    const count = () => document.querySelectorAll('article.g').length;
    const base = count();
    document.querySelector('[data-facet="verified"]').click();
    await new Promise(r => setTimeout(r, 150));
    const verified = count();
    document.querySelector('[data-facet="region"][data-value="cn"]').click();
    await new Promise(r => setTimeout(r, 150));
    const cn = count();
    document.querySelector('[data-facet="verified"]').click();
    document.querySelector('[data-facet="region"][data-value="cn"]').click();
    await new Promise(r => setTimeout(r, 150));
    const back = count();
    const box = document.querySelector('#sortBox [data-sort="expiry"]');
    box.click();
    await new Promise(r => setTimeout(r, 150));
    const noBands = document.querySelectorAll('.tierhead').length;
    const sorted = count();
    document.querySelector('#sortBox [data-sort="tier"]').click();
    await new Promise(r => setTimeout(r, 150));
    return { base, verified, cn, back, noBands, sorted, bands: document.querySelectorAll('.tierhead').length };
  });
  check('「已核验」筛选生效', filter.verified > 0 && filter.verified < filter.base, `${filter.base} → ${filter.verified}`);
  check('「国内」筛选生效', filter.cn > 0 && filter.cn <= filter.verified, `→ ${filter.cn}`);
  check('取消筛选后回到全量', filter.back === filter.base, `${filter.back}`);
  check('非力度排序时不显示分带', filter.noBands === 0, `分带 ${filter.noBands} 个`);
  check('切回力度排序恢复分带', filter.bands >= 3, `分带 ${filter.bands} 个，卡片 ${filter.sorted}`);

  console.log('\n=== 8) 搜索 ===');
  await page.fill('#searchInput', 'DeepSeek');
  await page.waitForTimeout(300);
  const search = await page.evaluate(() => ({
    count: document.querySelectorAll('article.g').length,
    hits: [...document.querySelectorAll('article.g h3')].map(h => h.textContent.trim()).slice(0, 3)
  }));
  check('搜索有结果且收窄', search.count > 0 && search.count < filter.base, `${search.count} 条 → ${search.hits.join(' / ')}`);
  await page.fill('#searchInput', '');
  await page.waitForTimeout(300);

  console.log('\n=== 9) 全部工具 Tab ===');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(200);
  await page.click('[data-facet="tab"][data-value="tools"]');
  await page.waitForTimeout(300);
  const tools = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('article.g.tool')];
    return {
      cards: document.querySelectorAll('article.g').length,
      toolCards: cards.length,
      // 工具条目不该出现「档位配色的优惠正文」——那是优惠专属的视觉语言
      tierColored: cards.filter(c => c.querySelector('.of:not(.plain)')).length,
      plain: cards.filter(c => c.querySelector('.of.plain')).length,
      stats: document.querySelector('#stats').textContent.trim()
    };
  });
  check('工具 Tab 有卡片', tools.cards > 53, `${tools.cards} 条（其中工具 ${tools.toolCards}）`);
  check('工具卡不冒充优惠', tools.tierColored === 0, `${tools.tierColored} 条越界，${tools.plain} 条用灰条简介`);
  await page.click('[data-facet="tab"][data-value="deals"]');
  await page.waitForTimeout(300);

  if (process.argv.includes('--shots')) {
    const SHOT_DIR = path.join(ROOT, 'mockups', '.preview');
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(SHOT_DIR, 'site-桌面-首屏.png') });
    await page.screenshot({ path: path.join(SHOT_DIR, 'site-桌面-整页.png'), fullPage: true });
    await page.hover('article.g .logos');
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SHOT_DIR, 'site-桌面-logo展开.png') });
    await page.evaluate(() => document.querySelector('article.g').click());
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SHOT_DIR, 'site-桌面-详情弹层.png') });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SHOT_DIR, 'site-手机-首屏.png') });
    console.log(`\n  截图已写入 ${path.relative(ROOT, SHOT_DIR)}/`);
  }

  console.log('\n=== 10) 移动端 390px ===');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const mobile = await page.evaluate(() => ({
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    cols: getComputedStyle(document.querySelector('.grid')).gridTemplateColumns.split(' ').length,
    cards: document.querySelectorAll('article.g').length,
    tiles: document.querySelectorAll('.lg').length
  }));
  check('无横向溢出', mobile.overflowX <= 0, `溢出 ${mobile.overflowX}px`);
  check('移动端单列', mobile.cols === 1, `${mobile.cols} 列`);
  check('移动端卡片完整', mobile.cards >= 45 && mobile.tiles >= 20, `${mobile.cards} 卡片 / ${mobile.tiles} tile`);

  console.log('\n=== 10) 请求与错误 ===');
  check('没有外部请求（无 CDN 热链）', externalRequests.length === 0,
    externalRequests.length ? externalRequests.slice(0, 3).join(', ') : '全部同源');
  check('没有加载失败', failedRequests.length === 0, failedRequests.slice(0, 3).join(', ') || '0 个');
  check('没有 JS 错误', errors.length === 0, errors.slice(0, 3).join(' | ') || '0 个');

  await browser.close();
  server.close();

  const failed = results.filter(r => !r.ok);
  console.log(`\n${failed.length ? '❌' : '✅'} 验收 ${results.length} 项，失败 ${failed.length} 项`);
  if (failed.length) {
    failed.forEach(f => console.log(`   ✗ ${f.name} — ${f.detail}`));
    process.exit(1);
  }
})().catch(e => { console.error(e); process.exit(1); });
