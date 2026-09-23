#!/usr/bin/env node
/**
 * 线上产物的真浏览器验收（dev 工具，需要 playwright-core）。
 *
 * 为什么必须有这一步：卡片是固定高度的，任何一处内容变高都会被 overflow:hidden 静默裁掉；
 * logo 簇是 hover 展开的，很容易把标题挤到换行、把网格行高顶动。这些在静态检查里都看不见。
 *
 * 用法：
 *   node scripts/tools/build-local.js && node scripts/tools/verify-site.js
 *   node scripts/tools/verify-site.js --dir=dist --keep        # 保留浏览器窗口（调试用）
 *   node scripts/tools/verify-site.js --url=https://…/         # 直接验收线上站点（部署后冒烟）
 *   node scripts/tools/verify-site.js --json=out.json          # 顺带写出机器可读指标（密度/页高/请求数/断言明细）
 *   node scripts/tools/verify-site.js --compare=base.json      # 与基线比回归：密度不得降、页高/请求不得涨
 *
 * 退出码非 0 = 有断言失败。
 */

const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.join(__dirname, '..', '..');
const dirArg = process.argv.find(a => a.startsWith('--dir='));
const urlArg = process.argv.find(a => a.startsWith('--url='));
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

/**
 * 等应用真正接管，而不是等一个固定毫秒数。
 *
 * `#lastUpdated` 初值是 `--`，**只有** loadDeals() 的 .then 里才会被填上时间——
 * 而 bindEvents() 与 render() 就在同一个 .then 里。预渲染不填它，所以它是
 * 「事件已绑定、state.cards 已就绪」的可靠信号。
 *
 * 为什么必须这么写：本地服务器毫秒级返回，固定 sleep 400ms 看着没问题；
 * 换成线上 GitHub Pages 要几百毫秒，卡片点击就会打在 bindEvents() 之前——
 * 事件没人接，弹层不开，后面断言全崩（`--url=` 跑线上时真的这样挂过）。
 */
async function waitForApp(page, timeout = 20000) {
  await page.waitForFunction(() => {
    const el = document.getElementById('lastUpdated');
    return !!el && el.textContent.trim() !== '' && el.textContent.trim() !== '--';
  }, { timeout });
  await page.waitForTimeout(120);
}

/**
 * 机器可读指标：`--json=` 把它写成文件，`--compare=` 拿它跟基线比。
 *
 * 为什么要有这个：改动前后的「密度有没有退、页高有没有涨、请求有没有多」必须是**脚本产出的数字**，
 * 不能手抄进文档（手抄的数字没人复核，也没有回归保护）。用法：
 *   node scripts/tools/verify-site.js --json=research/_raw/ours-baseline/verify.json
 *   node scripts/tools/verify-site.js --compare=research/_raw/ours-baseline/verify.json
 */
const metrics = {};
const jsonArg = process.argv.find(a => a.startsWith('--json='));
const compareArg = process.argv.find(a => a.startsWith('--compare='));

(async () => {
  let server = null;
  let base;
  if (urlArg) {
    base = urlArg.slice(6);
    if (!base.endsWith('/')) base += '/';
    console.log(`验收目标：${base}（线上站点，不启动本地服务器）`);
  } else {
    if (!fs.existsSync(path.join(DIR, 'index.html'))) {
      console.error(`找不到 ${path.relative(ROOT, DIR)}/index.html，请先 npm run build`);
      process.exit(1);
    }
    const started = await serve(DIR);
    server = started.server;
    base = `http://127.0.0.1:${started.port}/`;
  }
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
  await waitForApp(page);

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
      // 两个口径分开报：「完整可见」才是能一眼读完的卡片数
      firstScreenFull: cards.filter(c => c.getBoundingClientRect().bottom <= window.innerHeight).length,
      firstScreenPart: cards.filter(c => c.getBoundingClientRect().top < window.innerHeight).length,
      pageHeight: Math.round(document.documentElement.scrollHeight)
    };
  });
  check('卡片数与预渲染一致', rendered.cards >= 45, `${rendered.cards} 条`);
  check('桌面三列', rendered.cols === 3, `${rendered.cols} 列`);
  check('卡片高度统一', rendered.heights.length === 1, rendered.heights.join('/') + 'px');
  check('首屏完整可见卡片 ≥ 9', rendered.firstScreenFull >= 9,
    `完整 ${rendered.firstScreenFull} 张 / 含截断 ${rendered.firstScreenPart} 张 · 网格起点 ${rendered.gridTop}px · 页高 ${rendered.pageHeight}px`);
  Object.assign(metrics, {
    cards: rendered.cards,
    cols: rendered.cols,
    tierHeads: rendered.tierHeads,
    tiles: rendered.tiles,
    tileKeys: rendered.tileKeys.length,
    cardHeight: rendered.heights[0],
    firstScreenFull: rendered.firstScreenFull,
    firstScreenPart: rendered.firstScreenPart,
    gridTop: rendered.gridTop,
    pageHeight: rendered.pageHeight,
    prerenderedCards: noJs.cards,
    prerenderedLinks: noJs.links
  });
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

  // 名称缩写兜底块：必须真有字、不被裁、并且明确标注「不是官方图形」
  const textTile = await page.evaluate(() => {
    const tiles = [...document.querySelectorAll('.lg.text')];
    return {
      count: tiles.length,
      empty: tiles.filter(t => !t.textContent.trim()).length,
      clipped: tiles.filter(t => t.scrollWidth > t.clientWidth + 1).length,
      unlabeled: tiles.filter(t => !/名称缩写/.test(t.getAttribute('title') || '') ||
        !/名称缩写/.test(t.getAttribute('aria-label') || '')).length,
      sample: tiles.slice(0, 4).map(t => t.textContent.trim() + '=' + t.getAttribute('title').split('：')[0])
    };
  });
  check('缩写块有字 / 不裁切 / 已标注', textTile.empty === 0 && textTile.clipped === 0 && textTile.unlabeled === 0,
    `${textTile.count} 个（空 ${textTile.empty} / 裁切 ${textTile.clipped} / 未标注 ${textTile.unlabeled}）${textTile.sample.length ? ' 例：' + textTile.sample.join(' ') : ''}`);

  // 同一张卡不能既挂官方图形又挂缩写块
  const mixed = await page.evaluate(() => [...document.querySelectorAll('article.g')]
    .filter(c => c.querySelector('.lg[data-logo]') && c.querySelector('.lg.text')).length);
  check('官方图形与缩写块不混用', mixed === 0, mixed ? `${mixed} 张卡混用` : '每张卡二选一');

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
    await new Promise(r => setTimeout(r, 250));
    const dlg = document.getElementById('detail');
    const open = dlg.open;
    const shown = dlg.querySelector('h2') ? dlg.querySelector('h2').textContent.trim() : '';
    const cells = dlg.querySelectorAll('.dgrid .cv').length;
    const cta = !!dlg.querySelector('.dact .pri');
    // 弹层必须落在视口正中：*{margin:0} 会把 <dialog> 的 UA margin:auto 覆盖掉，
    // 结果钉在左上角——只看「打开了吗」是发现不了的，必须量位置。
    const box = dlg.getBoundingClientRect();
    const offset = {
      x: Math.round((box.left + box.width / 2) - window.innerWidth / 2),
      y: Math.round((box.top + box.height / 2) - window.innerHeight / 2)
    };
    // 弹层里的 logo 必须一行平铺（曾经因为容器没有布局规则而竖着叠起来）
    const dl = dlg.querySelector('.dh-logos');
    const tops = dl ? [...dl.querySelectorAll('.lg')].map(el => Math.round(el.getBoundingClientRect().top)) : [];
    const oneRow = tops.length > 1 && new Set(tops).size === 1;
    const tileW = dl && dl.querySelector('.lg') ? Math.round(dl.querySelector('.lg').getBoundingClientRect().width) : 0;
    const escaped = box.left >= -1 && box.top >= -1 &&
      box.right <= window.innerWidth + 1 && box.bottom <= window.innerHeight + 1;
    dlg.querySelector('.x').click();
    await new Promise(r => setTimeout(r, 200));
    return { title, shown, open, cells, cta, closed: !dlg.open, oneRow, tiles: tops.length, tileW, offset, escaped };
  });
  check('点卡片打开弹层', dialog.open, `「${dialog.title}」`);
  check('弹层标题与卡片一致', dialog.shown === dialog.title, `弹层「${dialog.shown}」`);
  check('弹层在视口正中', Math.abs(dialog.offset.x) <= 2 && Math.abs(dialog.offset.y) <= 2,
    `中心偏移 x=${dialog.offset.x}px y=${dialog.offset.y}px`);
  check('弹层未溢出视口', dialog.escaped);
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
    const glyphs = [...document.querySelectorAll('article.g .lg.text')];
    return {
      cards: document.querySelectorAll('article.g').length,
      toolCards: cards.length,
      // 工具条目不该出现「档位配色的优惠正文」——那是优惠专属的视觉语言
      tierColored: cards.filter(c => c.querySelector('.of:not(.plain)')).length,
      plain: cards.filter(c => c.querySelector('.of.plain')).length,
      textTiles: glyphs.length,
      realTiles: document.querySelectorAll('article.g .lg[data-logo]').length,
      samples: glyphs.slice(0, 6).map(t => t.textContent.trim()),
      stats: document.querySelector('#stats').textContent.trim()
    };
  });
  check('工具 Tab 有卡片', tools.cards > 53, `${tools.cards} 条（其中工具 ${tools.toolCards}）`);
  check('工具卡不冒充优惠', tools.tierColored === 0, `${tools.tierColored} 条越界，${tools.plain} 条用灰条简介`);
  check('长尾厂商走名称缩写兜底', tools.textTiles > 0 && tools.realTiles > 0,
    `官方图形 ${tools.realTiles} 个 / 缩写块 ${tools.textTiles} 个（${tools.samples.join(' ')}）`);

  if (process.argv.includes('--shots')) {
    const SHOT_DIR = path.join(ROOT, 'mockups', '.preview');
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(SHOT_DIR, 'site-桌面-全部工具.png') });
    console.log(`  截图已写入 ${path.relative(ROOT, SHOT_DIR)}/site-桌面-全部工具.png`);
  }
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

  // 手机上弹层更容易贴边：窄屏 + 高内容，必须再量一次位置
  const mobileDialog = await page.evaluate(async () => {
    document.querySelector('article.g').click();
    await new Promise(r => setTimeout(r, 300));
    const dlg = document.getElementById('detail');
    const box = dlg.getBoundingClientRect();
    const out = {
      open: dlg.open,
      offset: {
        x: Math.round((box.left + box.width / 2) - window.innerWidth / 2),
        y: Math.round((box.top + box.height / 2) - window.innerHeight / 2)
      },
      fits: box.width <= window.innerWidth + 1 && box.height <= window.innerHeight + 1,
      scrollable: dlg.scrollHeight >= dlg.clientHeight
    };
    dlg.querySelector('.x').click();
    await new Promise(r => setTimeout(r, 200));
    return out;
  });
  check('手机弹层也在正中', mobileDialog.open && Math.abs(mobileDialog.offset.x) <= 2 && Math.abs(mobileDialog.offset.y) <= 2,
    `中心偏移 x=${mobileDialog.offset.x}px y=${mobileDialog.offset.y}px`);
  check('手机弹层不超出屏幕', mobileDialog.fits);

  console.log('\n=== 11) 详情页中文翻译 ===');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(250);

  // 从头来一遍：清掉折叠偏好并重新加载，验证「默认展开」
  await page.evaluate(() => { try { localStorage.removeItem('dsh.dealZhOpen'); } catch (e) {} });
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('article.g', { timeout: 15000 });
  await waitForApp(page);

  const zh = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const cards = [...document.querySelectorAll('article.g')];
    const marked = cards.filter(c => c.querySelector('.zhmark'));
    const plain = cards.filter(c => !c.querySelector('.zhmark'));
    const dlg = document.getElementById('detail');

    const out = {
      cards: cards.length,
      marked: marked.length,
      markTitle: marked.length ? (marked[0].querySelector('.zhmark').getAttribute('title') || '') : '',
      hintVisible: marked.length ? marked[0].querySelector('.zhmark').offsetHeight > 0 : false
    };
    // 没有一张卡带提示就直接返回，让断言红着报出来——不要在后面拿 undefined 崩栈，
    // 崩栈只能看到 TypeError，看不出「线上一个提示都没有」这个真正的问题。
    if (!marked.length) return out;

    // ① 有提示的卡片：弹层里必须有译文块，且英文原文一字未改
    marked[0].click();
    await sleep(300);
    const boxes = [...dlg.querySelectorAll('.zht')];
    out.dialogBoxes = boxes.length;
    out.dialogOpenDefault = boxes.every(b => b.open);
    out.texts = boxes.map(b => (b.querySelector('.zbody').textContent || '').trim());
    // 译文必须是中文（有汉字），且和同一容器里的英文原文不是同一段文字
    const cjk = s => (s.match(/[\u4e00-\u9fa5]/g) || []).length;
    out.allChinese = out.texts.length > 0 && out.texts.every(t => cjk(t) >= 4);
    // 英文原文仍在：译文块的父容器里必须同时存在原文节点
    out.englishKept = boxes.every(b => {
      const holder = b.parentElement;
      const text = holder.textContent.replace(b.textContent, '');
      return /[A-Za-z]{4,}/.test(text);
    });
    // 版式：译文的顶边必须在英文原文之后（DOM 顺序 + 实际位置两重）
    out.afterEnglish = boxes.every(b => {
      const prev = b.previousElementSibling;
      if (!prev) return false;
      const follows = (prev.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
      const lower = b.getBoundingClientRect().top >= prev.getBoundingClientRect().bottom - 1;
      return follows || lower;
    });
    out.englishSample = (dlg.querySelector('.doffer p') || dlg.querySelector('.ddesc') || {}).textContent || '';
    out.zhSample = out.texts[0] || '';

    // ② 可折叠：点 summary 之后正文不再渲染
    boxes[0].querySelector('summary').click();
    await sleep(200);
    const first = dlg.querySelector('.zht');
    out.collapsed = first.open === false;
    // 注意：不能用 offsetHeight 判断「收起了没有」——Chromium 对关闭的 <details>
    // 用的是 content-visibility 语义，子元素仍会报出上一次的布局高度。checkVisibility()
    // 才会把 content-visibility 算进去。
    const body = first.querySelector('.zbody');
    out.collapsedHidesText = typeof body.checkVisibility === 'function'
      ? body.checkVisibility() === false
      : getComputedStyle(body).visibility === 'hidden';
    out.bodyProbe = { checkVisibility: body.checkVisibility ? body.checkVisibility() : null, offsetHeight: body.offsetHeight };
    // 同一份详情里的其它译文块要跟着同步，不能一半开一半关
    out.synced = [...dlg.querySelectorAll('.zht')].every(b => b.open === first.open);
    out.stored = (() => { try { return localStorage.getItem('dsh.dealZhOpen'); } catch (e) { return 'n/a'; } })();

    return out;
  });

  check('卡片提示只给有译文的条目', zh.marked > 0 && zh.marked < zh.cards,
    `${zh.cards} 张卡中 ${zh.marked} 张带「中文」提示`);
  check('提示语说明详情页有中文翻译', /中文翻译/.test(zh.markTitle) && zh.hintVisible, zh.markTitle);
  check('译文显示在英文原文下面', zh.afterEnglish && zh.englishKept,
    `英文仍保留：${zh.englishSample.slice(0, 34)}…`);
  check('译文确实是中文', zh.allChinese, zh.zhSample.slice(0, 30));
  check('译文默认展开', zh.dialogOpenDefault, `${zh.dialogBoxes} 个译文块`);
  check('点一下能收起', zh.collapsed && zh.collapsedHidesText,
    `open=${zh.collapsed} 隐藏=${zh.collapsedHidesText} localStorage=${zh.stored}`);
  check('同一份详情里的译文块同步折叠', zh.synced);

  // ③ 收起后重新加载：偏好必须还在（否则每次开卡片都又弹开，等于没做折叠）
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('article.g', { timeout: 15000 });
  await waitForApp(page);
  const zhAfterReload = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const card = [...document.querySelectorAll('article.g')].find(c => c.querySelector('.zhmark'));
    card.click();
    await sleep(300);
    const boxes = [...document.getElementById('detail').querySelectorAll('.zht')];
    const first = boxes[0];
    const out = { boxes: boxes.length, anyOpen: boxes.some(b => b.open) };
    // 再展开一次，顺便验证折叠是可逆的
    if (first) { first.querySelector('summary').click(); await sleep(200); }
    out.reopened = first ? first.open === true : false;
    return out;
  });
  check('刷新后仍记得「已收起」', zhAfterReload.boxes > 0 && !zhAfterReload.anyOpen,
    `${zhAfterReload.boxes} 个译文块，展开 ${zhAfterReload.anyOpen ? '有' : '无'}`);
  check('收起后还能再展开', zhAfterReload.reopened);

  // ③.5 同一会话内换卡片（不刷新）：偏好必须当场生效。
  // 这条是回归测试——最初只在启动时读一次偏好，收起后点开下一张卡又会全部弹开。
  const zhSameSession = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const dlg = document.getElementById('detail');
    dlg.querySelector('.x').click();
    await sleep(200);
    const marked = [...document.querySelectorAll('article.g')].filter(c => c.querySelector('.zhmark'));
    if (marked.length < 2) return { skipped: true };
    marked[0].click();
    await sleep(300);
    const firstOpen = dlg.querySelector('.zht').open;
    dlg.querySelector('.zht summary').click();
    await sleep(250);
    const afterCollapse = dlg.querySelector('.zht').open;
    dlg.querySelector('.x').click();
    await sleep(200);
    marked[1].click();
    await sleep(300);
    const nextOpen = [...dlg.querySelectorAll('.zht')].map(b => b.open);
    const nextTitle = dlg.querySelector('h2').textContent.trim();
    dlg.querySelector('.x').click();
    await sleep(200);
    return { skipped: false, firstOpen, afterCollapse, nextOpen, nextTitle };
  });
  check('同一会话内换卡片也保持收起（不刷新）',
    zhSameSession.skipped || (zhSameSession.afterCollapse === false && zhSameSession.nextOpen.every(o => o === false)),
    zhSameSession.skipped ? '（本页只有一张带译文的卡）'
      : `「${zhSameSession.nextTitle}」${zhSameSession.nextOpen.length} 个译文块全部收起`);

  // ④ 负向：没有提示的卡片，弹层里就不该冒出译文块
  const zhNegative = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const dlg = document.getElementById('detail');
    dlg.querySelector('.x').click();
    await sleep(200);
    const card = [...document.querySelectorAll('article.g')].find(c => !c.querySelector('.zhmark'));
    if (!card) return { skipped: true };
    card.click();
    await sleep(300);
    const out = { boxes: dlg.querySelectorAll('.zht').length, title: card.querySelector('h3').textContent.trim() };
    dlg.querySelector('.x').click();
    await sleep(200);
    return out;
  });
  check('无译文的卡片不出现译文块', zhNegative.skipped || zhNegative.boxes === 0,
    zhNegative.skipped ? '（本页无此类卡片）' : `「${zhNegative.title}」0 个译文块`);

  // ⑤ 工具卡片：正文就是英文 description（灰条），译文必须同样出现在详情里
  const zhTools = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    document.querySelector('[data-facet="tab"][data-value="tools"]').click();
    await sleep(350);
    const dlg = document.getElementById('detail');
    // 必须挑 type=tool 的卡（.g.tool）：那类卡片的正文才是英文 description
    const marked = [...document.querySelectorAll('article.g.tool')].filter(c => c.querySelector('.zhmark'));
    if (!marked.length) return { skipped: true };
    const card = marked[0];
    const cardText = ((card.querySelector('.of.plain .tx') || {}).textContent || '').trim();
    card.click();
    await sleep(400);
    const boxes = [...dlg.querySelectorAll('.zht')];
    // 卡片正文是 description，所以要比的就是「紧跟在 .ddesc 后面」的那个译文块。
    // 注意工具条目也可能带 discountInfo（详情里同样有译文块），取 boxes[0] 会拿错。
    const descBox = dlg.querySelector('.ddesc + .zht');
    const out = {
      skipped: false,
      markedTools: marked.length,
      boxes: boxes.length,
      cardIsTool: card.classList.contains('tool'),
      englishOnCard: cardText.slice(0, 40),
      hasDescBox: Boolean(descBox),
      zhText: descBox ? descBox.querySelector('.zbody').textContent.trim().slice(0, 30) : '',
      // 卡片上那句英文必须能在详情里原样找到，译文就挂在它下面
      englishInDialog: Boolean(descBox) && descBox.parentElement.textContent.includes(cardText),
      title: dlg.querySelector('h2').textContent.trim()
    };
    dlg.querySelector('.x').click();
    await sleep(200);
    document.querySelector('[data-facet="tab"][data-value="deals"]').click();
    await sleep(300);
    return out;
  });
  check('工具卡片的英文简介也带译文',
    zhTools.skipped || (zhTools.cardIsTool && zhTools.hasDescBox && zhTools.englishInDialog),
    zhTools.skipped ? '（工具 Tab 无带译文的卡片）'
      : `「${zhTools.title}」卡片英文「${zhTools.englishOnCard}」→ 详情 ${zhTools.boxes} 个译文块，简介译文：${zhTools.zhText}`);

  // ⑥ 手机上手也能收起
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const zhMobile = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const card = [...document.querySelectorAll('article.g')].find(c => c.querySelector('.zhmark'));
    card.click();
    await sleep(350);
    const dlg = document.getElementById('detail');
    const box = dlg.querySelector('.zht');
    if (!box) return { found: false };
    const fits = dlg.getBoundingClientRect().width <= window.innerWidth + 1;
    // 先归一到展开态，再点一次收起：两个方向都验，且不受上一步留下的偏好影响
    if (!box.open) { box.querySelector('summary').click(); await sleep(250); }
    const wasOpen = box.open;
    box.querySelector('summary').click();
    await sleep(250);
    const out = {
      found: true, fits, wasOpen, nowOpen: box.open, collapsed: box.open === false,
      boxes: dlg.querySelectorAll('.zht').length,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    };
    dlg.querySelector('.x').click();
    await sleep(200);
    return out;
  });
  check('手机端译文可折叠且不撑破弹层', zhMobile.found && zhMobile.fits && zhMobile.collapsed,
    zhMobile.found
      ? `宽度合规 / ${zhMobile.boxes} 块 ${zhMobile.wasOpen}→${zhMobile.nowOpen} / 横向溢出 ${zhMobile.overflow}px`
      : '未找到译文块');

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(200);

  console.log('\n=== 10) 请求与错误 ===');
  check('没有外部请求（无 CDN 热链）', externalRequests.length === 0,
    externalRequests.length ? externalRequests.slice(0, 3).join(', ') : '全部同源');
  check('没有加载失败', failedRequests.length === 0, failedRequests.slice(0, 3).join(', ') || '0 个');
  check('没有 JS 错误', errors.length === 0, errors.slice(0, 3).join(' | ') || '0 个');

  await browser.close();
  if (server) server.close();

  Object.assign(metrics, {
    externalRequests: externalRequests.length,
    failedRequests: failedRequests.length,
    jsErrors: errors.length,
    target: base,
    generatedAt: new Date().toISOString()
  });

  // 回归比对：只比「改了之后不能倒退」的量。密度不得下降，页高/请求不得增加，错误必须仍为 0。
  if (compareArg) {
    console.log('\n=== 12) 回归比对（--compare）===');
    const baselineFile = path.resolve(ROOT, compareArg.slice('--compare='.length));
    if (!fs.existsSync(baselineFile)) {
      check('回归基线文件存在', false, `找不到 ${path.relative(ROOT, baselineFile)}`);
    } else {
      const parsed = JSON.parse(fs.readFileSync(baselineFile, 'utf8'));
      const ref = parsed.metrics || parsed;
      const num = v => (typeof v === 'number' ? v : 0);
      check('回归：卡片数不减少', metrics.cards >= num(ref.cards), `${num(ref.cards)} → ${metrics.cards}`);
      check('回归：首屏完整可见不减少', metrics.firstScreenFull >= num(ref.firstScreenFull),
        `${num(ref.firstScreenFull)} → ${metrics.firstScreenFull}`);
      check('回归：页高不增加（容差 15%）', metrics.pageHeight <= Math.round(num(ref.pageHeight) * 1.15),
        `${num(ref.pageHeight)}px → ${metrics.pageHeight}px`);
      check('回归：外部请求不增加', metrics.externalRequests <= num(ref.externalRequests),
        `${num(ref.externalRequests)} → ${metrics.externalRequests}`);
      check('回归：JS 错误仍为 0', metrics.jsErrors === 0, `${metrics.jsErrors} 个`);
      console.log(`     基线：${path.relative(ROOT, baselineFile)}（生成于 ${parsed.generatedAt || '未知时间'}）`);
    }
  }

  if (jsonArg) {
    const outFile = path.resolve(ROOT, jsonArg.slice('--json='.length));
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    const failedCount = results.filter(r => !r.ok).length;
    fs.writeFileSync(outFile, `${JSON.stringify({
      target: base,
      generatedAt: metrics.generatedAt,
      total: results.length,
      failed: failedCount,
      metrics,
      checks: results
    }, null, 2)}\n`, 'utf8');
    console.log(`\n机器可读报告已写出：${path.relative(ROOT, outFile)}（${results.length} 项，失败 ${failedCount} 项）`);
  }

  const failed = results.filter(r => !r.ok);
  console.log(`\n${failed.length ? '❌' : '✅'} 验收 ${results.length} 项，失败 ${failed.length} 项`);
  if (failed.length) {
    failed.forEach(f => console.log(`   ✗ ${f.name} — ${f.detail}`));
    process.exit(1);
  }
})().catch(e => { console.error(e); process.exit(1); });
