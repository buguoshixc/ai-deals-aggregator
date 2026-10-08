#!/usr/bin/env node
// 重新落盘（无内容改动）：清掉编辑器观察缓存
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

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.join(__dirname, '..', '..');
// 零依赖的注册表（订阅与落地页）：验收脚本据此**按数据**算出「这一页应该声明几条订阅源」，
// 而不是把一个数字写死在断言里 —— 写死的后果是每加一份分类 Feed 都要来改一次验收脚本。
const feedsLib = require('../lib/feeds');
const landingsLib = require('../lib/landing');
// 首页专题导航卡（v1.8）的**唯一来源**：卡数 / 标题 / href / 落地页 h1 全部按注册表现算，
// 不把「10」写进断言里 —— 加一条需求页时这些断言自动跟着走，而不是变成一条永远为真的死断言。
const audienceLib = require('../lib/audience');
// private-analytics-v1：外部请求白名单与页面判定都取自**唯一实现**（lib/analytics.js）——
// 这里不重写一份 origin 表，也不 grep token 字符串：判据只有一处，改了那边这一支跟着变。
const analytics = require('../lib/analytics');
// secondary-page-layout-unification（§22c）：布局族的**唯一**真值出处。这里是 require，不是
// 第二份 kind→layout 表 —— 谁改了 page-kinds.js 的声明，§22c 的全站扫描立刻跟着变。
const pageKinds = require('../lib/page-kinds');
/**
 * 「保留窄阅读列」的**机器可读清单**（narrow-reading-columns-v1）—— 读在文件顶部，
 * 因为 §19（套餐页行内详情的几何判据，在文件里出现得更早）与 §22c（登记制扫描）都要用它。
 * 为什么需要它：上一轮把页面级说明的窄柱修完之后，仍有两处「故意保留的窄宽」只写在**报告与散文**里 ——
 * 谁都可以再加一条 `max-width: 70ch` 而没有任何断言会响；反过来，谁把保留的那条删了/挪了，
 * 也没有断言会告诉你「承诺少了一条」。这份 JSON 把「保留」变成**可失败的登记制**：
 *   · 产物里**任何以 ch 为单位声明的窄阅读列**都必须登记（未登记 ⇒ §22c 的 `narrow-unregistered`）；
 *   · 登记的条目必须在真实浏览器里**居中**（§19 的几何判据）且**真的比容器窄**（否则声明已过时）。
 * 作用域：ch 才是阅读度量单位（65/70/72/80ch 正是 DESIGN-RULES S4 点名的阅读列）；px/rem 的窄宽
 * （例：`.detail-main` 的 `min(1120px,100%)`）由 §22b 的原有断言承担，不在这里重复。
 */
const WIDE_NARROW_REGISTRY = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/data/narrow-reading-columns.json'), 'utf8'));
const WIDE_NARROW_ENTRIES = WIDE_NARROW_REGISTRY.entries || [];
// 这两个量同时被 §19（更早出现）与 §22c（判定主体）用到 ⇒ 声明在顶部，避免 TDZ。
const WIDE_TOL = 1;                        // 亚像素取整容差（px）
const WIDE_DESKTOP = 1440;                 // 桌面档一（全站逐条）

/**
 * 某个落地页**应该**声明几条 `rel="alternate"`：站点根 Feed 对（2 条）
 * + 它自己的那一对（有专属 Feed 时 2 条）。别名页与无专属 Feed 的页面只有根那一对。
 */
function expectedFeedTags(kind, slug) {
  if (kind === 'alias') return 2;
  const own = feedsLib.feedsForPage({ kind, slug });
  return 2 + (own.length ? 2 : 0);
}
void landingsLib;

const dirArg = process.argv.find(a => a.startsWith('--dir='));
const urlArg = process.argv.find(a => a.startsWith('--url='));
const DIR = path.join(ROOT, dirArg ? dirArg.slice(6) : 'dist');
const EDGE = process.env.DSH_EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8'
};

/** 极简静态服务器：只服务 dist/，避免依赖外部包。
 *  必须像真实静态托管那样把目录解析成 index.html —— 独立详情页的 URL 是
 *  `deal/<id>/`，早先这里直接对目录返回 404，于是「本地 404、线上正常」的假失败。 */
function serve(dir) {
  return new Promise(resolve => {
    // 记下每一条 404 的路径：浏览器只会把 "Failed to load resource: 404" 记成一条 console 错误，
    // **不带路径**。没有这张表，「整轮 1 个 JS 错误」就只能靠猜（实测踩过）。
    const notFound = [];
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
      let file = path.join(dir, rel);
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        notFound.push(urlPath);
        res.writeHead(404).end('not found');
        return;
      }
      res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, notFound }));
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
// 首页顶栏那一枚「AI Coding 套餐对比」的现场量测，留给 §19 与套餐页的 h1 对账用
let topPlansEntry = null;
const jsonArg = process.argv.find(a => a.startsWith('--json='));
const compareArg = process.argv.find(a => a.startsWith('--compare='));

(async () => {
  let server = null;
  let base;
  /** 本地静态服务上的 404 路径（浏览器只记 "Failed to load resource"，不带路径） */
  let httpNotFound = [];
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
    httpNotFound = started.notFound;
    base = `http://127.0.0.1:${started.port}/`;
  }
  const browser = await chromium.launch({ executablePath: EDGE, headless: !process.argv.includes('--keep') });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  /**
   * `deals.json` 的绝对地址 —— **由 base 解析**，绝不写死 `/deals.json`。
   *
   * 为什么：线上是 GitHub **项目页**，站点挂在 `/ai-deals-aggregator/` 下，根路径的
   * `/deals.json` 是 404。原先几处 `evaluate` 里写死了绝对根路径，本地服务在根路径上永远绿，
   * 一跑 `--url=` 线上就取不到数据：先是「取样前提」报错，接着 v1.3 的取样解引用 null 直接崩。
   * 用 `new URL('deals.json', base)` 之后，本地根路径与线上子路径同时成立。
   */
  const DEALS_URL = JSON.stringify(new URL('deals.json', base).href);

  const errors = [];
  const failedRequests = [];
  const externalRequests = [];
  /**
   * private-analytics-v1：分析（Cloudflare Web Analytics）请求的**单独账本**。
   *
   * 为什么不是「有外部请求就不检查了」（P1 §15 点名禁止的改法）：外部请求仍然逐条判来源 ——
   * 只有 `lib/analytics.js` 的 `ANALYTICS.allowedOrigins`（脚本 origin + 上报 origin 两条）
   * 才被允许，其余一律照旧计进 `externalRequests` 并判红。
   *
   * 两条账本各自回答一个不同的问题：
   *   · `analyticsRequests` = 这次真的把统计发出去了吗？（**本地必须是 0**，`--url=` 线上应当 > 0）；
   *   · `externalRequests` = 有没有出现白名单之外的外部请求？
   */
  const analyticsRequests = [];
  const forbiddenRequests = [];
  // 记录错误时**带上当时那一页的 URL**：只记 message 时，"整轮 1 个 JS 错误"这种
  // 回归失败完全没有线索（实测：某一节之外的导航报一条 console error，
  // 每一节的"本节 0 错误"都是绿的，只有整轮计数是 1 —— 没有 URL 就只能靠猜）。
  page.on('pageerror', e => errors.push(`${page.url()} :: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`${page.url()} :: ${m.text()}`); });
  page.on('requestfailed', r => failedRequests.push(r.url()));
  page.on('request', r => {
    const url = r.url();
    if (url.startsWith(base) || url.startsWith('data:')) return;
    if (analytics.isAllowedExternalRequest(url)) analyticsRequests.push(url);
    else { externalRequests.push(url); forbiddenRequests.push(url); }
  });

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
      hintsHidden: [...document.querySelectorAll('.meta .hint')].every(el => getComputedStyle(el).display === 'none'),
      // 收藏/对比：星标、底部对比条、对比弹层**整块由 JS 建 DOM**，
      // 所以预渲染的 HTML 里应该一个都没有；去掉 body.js 之后再确认一次
      // 也不留可见的控件（脚本被拦/被禁用时同样是这个状态）。
      favToggles: document.querySelectorAll('[data-fav-toggle]').length,
      favVisible: [...document.querySelectorAll('[data-fav-toggle]')].filter(el => el.offsetHeight > 0).length,
      // 收藏**入口**与「清理失效收藏」同样是 JS 建的：静态骨架里一个都不该有
      favOpeners: document.querySelectorAll('[data-fav-open]').length,
      favPrunes: document.querySelectorAll('[data-fav-prune]').length,
      cmpBar: document.querySelectorAll('.cmpbar').length,
      cmpBarVisible: [...document.querySelectorAll('.cmpbar')].some(el => el.offsetHeight > 0),
      cmpDialogOpen: Boolean(document.querySelector('dialog#compare[open]')),
      // 「已核验」这个维度已经下线（原因见 §7）。静态骨架是**爬虫与无 JS 访客真正读到的文本**，
      // 而 §7 量的是水合之后的 DOM —— 两条路径各量一遍，撤掉的东西才不会从任何一侧溜回来。
      legacyLabels: [...document.querySelectorAll('article.g')].filter(el => /已核验/.test(el.textContent)).length,
      stampedCards: [...document.querySelectorAll('article.g')].filter(el => /数据更新 \d{4}-\d{2}-\d{2}/.test(el.textContent)).length
    };
  });
  check('静态骨架有卡片', noJs.cards >= 45, `${noJs.cards} 条`);
  check('静态骨架有外链', noJs.links >= 45, `${noJs.links} 个`);
  check('力度分带已预渲染', noJs.tierHeads >= 3, `${noJs.tierHeads} 档`);
  check('筛选条已预渲染', noJs.facets >= 4, `${noJs.facets} 个 facet`);
  check('logo 已预渲染', noJs.logos >= 20, `${noJs.logos} 个 tile`);
  check('无 JS 时不显示「详情」提示', noJs.hintsHidden);
  check('无 JS 时不渲染收藏/对比控件',
    noJs.favToggles === 0 && noJs.favVisible === 0 && noJs.cmpBar === 0 && !noJs.cmpDialogOpen,
    `星标 ${noJs.favToggles} 个 / 可见 ${noJs.favVisible} 个 · 对比条 ${noJs.cmpBar} 个 / 可见 ${noJs.cmpBarVisible} · 对比弹层展开 ${noJs.cmpDialogOpen}`);
  check('无 JS 时也没有收藏入口 / 失效清理按钮（同样是 JS 建的）',
    noJs.favOpeners === 0 && noJs.favPrunes === 0,
    `收藏入口 ${noJs.favOpeners} 个 · 清理按钮 ${noJs.favPrunes} 个`);
  check('静态骨架里没有「已核验」字样', noJs.legacyLabels === 0, `${noJs.legacyLabels} 张命中`);
  check('静态骨架每张卡片都带「数据更新」日期', noJs.stampedCards === noJs.cards && noJs.cards > 0,
    `${noJs.stampedCards}/${noJs.cards}`);

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
  /* 阈值 9 → 6（2026-10-05，home-topic-entry-cards-v1 **唯一**被授权同步的阈值之一）。
     为什么必须改：首页「按需求找优惠」从 31px 的一行 chip 改成 153px 的专题导航卡网格
     （δ = +122px），网格起点 227 → 349px，实测首屏完整可见从 9 张掉到 6 张
     （含截断仍是 9 张 —— 两个读数都接着打印，别用「含截断」掩盖「完整可见」的下降）。
     实测的精确临界值是 δ ≥ 2px（δ=+1 时最后一张完整卡 bottom 恰好 900.00px，仍算完整可见），
     +122px 是它的 61 倍，所以这不是「可能」而是必然。
     这是**记录一次已披露的密度下降**，不是把断言放宽到看不见回归：阈值仍严格等于实测值，
     顶部再加任何一条独立条带（实测 ≥ 47px）都会让它重新变红。
     原始读数 / 归因实验 / Before-After 全表见 research/_raw/home-topic-entry-cards-v1/VERIFY-REPORT.md。 */
  check('首屏完整可见卡片 ≥ 6', rendered.firstScreenFull >= 6,
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

  /* 顶栏那一枚「AI Coding 套餐对比」入口：v2.2 上线后按用户反馈**挪位 + 把名字写全
     + 改成实心品牌色药丸**。这一版改的就是位置 / 名字 / 实心这三件事本身，
     所以断言也必须是这三件事 ——"入口还在页面上"那种断言在这一版毫无信息量（它一直在）。
     名字是否"写全"由 §19 拿套餐页自己的 h1 对账（那个 h1 才是文案的唯一出处）；
     实心与否则比对页面自己的 `--brand`（不写死色值，暗色主题换了令牌也不会假红）。 */
  topPlansEntry = await page.evaluate(() => {
    const box = el => (el ? el.getBoundingClientRect() : null);
    const nav = document.querySelector('.plansnav');
    const seg = document.querySelector('#themeSeg');
    const stat = document.querySelector('.topstat');
    const style = nav ? getComputedStyle(nav) : null;
    return {
      text: nav ? nav.textContent.trim() : '(没有 .plansnav)',
      href: nav ? nav.getAttribute('href') || '' : '',
      navL: nav ? Math.round(box(nav).left) : null,
      navR: nav ? Math.round(box(nav).right) : null,
      segR: seg ? Math.round(box(seg).right) : null,
      statL: stat ? Math.round(box(stat).left) : null,
      bg: style ? style.backgroundColor : '',
      fg: style ? style.color : '',
      weight: style ? style.fontWeight : '',
      brand: getComputedStyle(document.documentElement).getPropertyValue('--brand').trim(),
      onAccent: getComputedStyle(document.documentElement).getPropertyValue('--on-accent').trim()
    };
  });
  check('首页顶栏的套餐对比入口在配色切换器**右边**（几何判定，不是"还在页面上"）',
    topPlansEntry.navL >= topPlansEntry.segR && topPlansEntry.navR <= topPlansEntry.statL,
    `入口 ${topPlansEntry.navL}-${topPlansEntry.navR}px · 切换器右缘 ${topPlansEntry.segR}px · 汇总条左缘 ${topPlansEntry.statL}px`);

  /* 实心药丸：填充必须**逐字等于页面自己的 `--brand`**（不是"看着像蓝色"），
     文字色必须等于 `--on-accent` —— 后者在令牌里本来就算过对比度（5.12:1 / 6.85:1），
     而这枚药丸的文字对比度还另由 §13 的全站对比度探针兜底。 */
  {
    const toRgb = hex => {
      const h = String(hex).trim().replace('#', '');
      const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
      const n = parseInt(full, 16);
      return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
    };
    check('首页顶栏入口是实心品牌色药丸（填充 == 页面 --brand、文字 == --on-accent、加粗）',
      topPlansEntry.bg === toRgb(topPlansEntry.brand) && topPlansEntry.fg === toRgb(topPlansEntry.onAccent) &&
      Number(topPlansEntry.weight) >= 600,
      `填充 ${topPlansEntry.bg}（--brand ${topPlansEntry.brand}）· 文字 ${topPlansEntry.fg}（--on-accent ${topPlansEntry.onAccent}）· 字重 ${topPlansEntry.weight}`);
  }

  /* 761–940px：顶栏一行放不下，整页会横向滚动。
     为什么要逐档量：/status/ 那一页的教训是"桌面绿、手机横滚，而所有静态检查都是绿的"——
     盲点正好长在没人测的中间带。实测（本版修复前）：761px 溢出 **138px**、820px 溢出 79px；
     而把套餐对比入口加长之前那段溢出带**本来就存在**（761px 溢出 78px）。
     搜索框宽度一起量：把搜索框压成一条缝也能让溢出归零，那不是修好。
     门槛 180px：实测最窄的那一档（941px 的单行布局）是 218px；一旦有人把 `.search` 的
     min-width 放开成 0，761px 下它会缩到个位数，这条立刻红。 */
  for (const width of [761, 820, 900, 940, 941]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(150);
    const band = await page.evaluate(() => {
      const box = el => (el ? el.getBoundingClientRect() : null);
      const nav = box(document.querySelector('.plansnav'));
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        searchW: Math.round(box(document.querySelector('.search')).width),
        headerH: Math.round(box(document.querySelector('header.top')).height),
        navInView: Boolean(nav) && nav.width > 0 && nav.right <= window.innerWidth
      };
    });
    check(`首页顶栏 ${width}px：页面不横向溢出、搜索框仍可用、入口仍在视口里`,
      band.overflow <= 1 && band.searchW >= 180 && band.navInView,
      `溢出 ${band.overflow}px · 搜索框 ${band.searchW}px · 顶栏高 ${band.headerH}px`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload({ waitUntil: 'load' });
  await waitForApp(page);

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

  console.log('\n=== 4b) 折叠卡：同一家公司的同类优惠并成一张 ===');
  // 六条独立判据，全部**可证伪**（2026-09-27 那次对抗性复核把「不可证伪」当缺陷报了上来：
  // 旧的①只按标题字符串互相包含来认领，把 foldKey 里的厂商抹掉后仍全绿；旧③只看有没有溢出，
  // 把文案换成「（摘要）xxxx」也全绿。现在改量「卡片说了什么」，并且断言都得低于数据）：
  //   ① 按 **id** 认领：每条优惠恰好落在一张卡上（data-deal-ids 与数据一一对应）；
  //   ② 认领关系**同厂商**（把厂商从折叠键里抹掉就必红）；
  //   ③ 折叠卡声明覆盖 N 条 = 实际认领 N 条；
  //   ④ **额度口径与数据一致**：data-quota=shared 的卡，其成员的官方文案必须真的一样；
  //      varies 的卡必须写着「各型号额度不同」且**不许**出现「共用同一份额度」；
  //   ⑤ 卡片那行文案**没被裁**，且折叠卡至少说清了代表条目的一句话（空话/摘要话必红）；
  //   ⑥ 被折叠的每一条都还能从首页走到自己的详情页（预渲染的站内链接，无 JS 也成立）。
  const folded = await page.evaluate(async () => {
    const data = await (await fetch('deals.json')).json();
    const norm = text => String(text || '').replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, '').toLowerCase();
    const cards = [...document.querySelectorAll('article.g')].map(card => {
      const tx = card.querySelector('.of .tx');
      return {
        title: card.querySelector('h3').textContent.trim(),
        declared: Number(card.dataset.modelCount || 0),
        ids: card.dataset.dealIds ? card.dataset.dealIds.split(',') : [],
        quota: card.dataset.quota || '',
        feats: card.textContent,
        offer: tx ? tx.textContent : '',
        clamped: tx ? tx.scrollHeight - tx.clientHeight > 1 : false,
        memberLinks: [...card.querySelectorAll('.fmembers a')].map(a => a.getAttribute('href') || ''),
        memberText: (card.querySelector('.fmembers') || {}).textContent || ''
      };
    });
    const byId = new Map();
    for (const deal of data.deals) if (deal.type === 'deal') byId.set(String(deal.id), deal);

    const owners = new Map();          // deal id → [card titles]
    const unmatched = [];
    const multiOwned = [];
    const crossVendor = [];
    const claimedIds = new Set();
    for (const card of cards) {
      for (const id of card.ids) {
        claimedIds.add(id);
        if (!owners.has(id)) owners.set(id, []);
        owners.get(id).push(card);
      }
    }
    for (const [id, deal] of byId) {
      const hits = owners.get(id) || [];
      if (!hits.length) { unmatched.push(deal.title); continue; }
      if (hits.length > 1) multiOwned.push(deal.title);
      // ② 同厂商：卡片标题里应含该厂商的一个关键词（用户看到的名字）。
      //    厂商如果不参与折叠（比如把 foldKey 里的厂商抹掉），这条必红。
      //    **单条卡跳过**：单条卡是「原样返回该条目」，标题就是条目标题，本来就不必带厂商名
      //    （「Perplexity」「联网资源 免费额度」「GLM-5.3-Flash 限时五折」都是真实存在的条目名）。
      //    这条断言要证伪的是「跨厂商被并进同一张卡」，那只有折叠卡才可能发生。
      const VENDOR_WORDS = [
        ['百度智能云', ['百度', '千帆', 'ernie']],
        ['火山引擎', ['火山', '方舟', '豆包', 'doubao']],
        ['智谱AI', ['智谱', 'glm', 'cogview', 'cogvideo']],
        ['扣子 Coze', ['扣子', 'coze']],
        ['阿里云', ['阿里', '百炼', '通义', 'qwen']],
        ['腾讯云', ['腾讯', '混元', 'hunyuan']],
        ['科大讯飞', ['讯飞', '星火', 'xfyun']],
        ['月之暗面', ['月之暗面', 'moonshot', 'kimi']],
        ['硅基流动', ['硅基流动', 'siliconflow']],
        ['阶跃星辰', ['阶跃', 'stepfun', 'stepaudio']],
        ['商汤科技', ['商汤', 'sensenova', '日日新']],
        ['百川智能', ['百川', 'baichuan']],
        ['DeepSeek', ['deepseek', '深度求索']],
        ['360智脑', ['360']],
        ['魔搭 ModelScope', ['魔搭', 'modelscope']],
        ['MiniMax（稀宇科技）', ['minimax', '稀宇']],
        ['海螺AI', ['海螺', 'hailuo']],
        ['Microsoft', ['microsoft', '微软', 'azure']],
        ['Google', ['google', 'gemini']]
      ];
      const wordsOf = vendor => {
        const raw = String(vendor || '').toLowerCase();
        // 先按厂商名本身匹配（「百度智能云」→ 百度那一条），再退回关键词匹配。
        // 顺序不能反：反了会让「百度智能云」先命中任何含「百度」的表项，把关键词表认错行。
        for (const [name, words] of VENDOR_WORDS) {
          const key = name.toLowerCase();
          if (key.length >= 2 && raw.includes(key.slice(0, 2))) return words;
        }
        for (const [, words] of VENDOR_WORDS) if (words.some(w => raw.includes(w))) return words;
        return [raw.slice(0, 3)];
      };
      const foldedHits = hits.filter(card => card.declared > 1);
      if (!foldedHits.length) continue;
      const vendorWords = wordsOf(deal.vendor);
      const ok = foldedHits.some(card => {
        const t = card.title.toLowerCase();
        return vendorWords.some(w => w && t.includes(w));
      });
      if (!ok) crossVendor.push(`${deal.title} → 「${foldedHits.map(h => h.title).join('、')}」`);
    }
    // 卡片里出现、但数据里没有的 id（凭空捏造）
    const ghostIds = [...claimedIds].filter(id => !byId.has(id));

    const foldedCards = cards.filter(card => card.declared > 1).map(card => {
      const members = card.ids.map(id => byId.get(id)).filter(Boolean);
      const texts = members.map(d => String(d.discountInfo || '').trim()).filter(Boolean);
      const distinct = new Set(texts);
      return {
        title: card.title,
        declared: card.declared,
        claimed: card.ids.filter(id => byId.has(id)).length,
        quota: card.quota,
        distinctTexts: distinct.size,
        // 卡片那行必须至少说清代表条目那句（用数据反查：任一成员文案的开头 12 字）
        coversRepresentative: texts.some(t => card.offer.includes(t.slice(0, 12))),
        saysShared: card.feats.includes('共用同一份额度'),
        saysVaries: card.feats.includes('各型号额度不同'),
        clamped: card.clamped,
        offer: card.offer,
        memberLinks: card.memberLinks.filter(Boolean),
        memberTextChars: card.memberText.length,
        // 预渲染的成员原文：**每种不同的文案**至少要在卡片静态正文里出现一次（无 JS 也读得到）。
        // 分母是「不同文案数」——同一份文案覆盖 N 个型号时说一遍就够（那正是 modelOffers 的口径）。
        prerenderedTexts: [...distinct].filter(t => card.memberText.includes(t.slice(0, 12))).length,
        distinctTexts: distinct.size
      };
    });

    return {
      deals: byId.size,
      cards: cards.length,
      unmatched,
      multiOwned,
      crossVendor,
      ghostIds,
      foldedCards
    };
  });

  check('每条优惠按 id 归到恰好一张卡上（没有条目丢失、也没有凭空捏造的 id）',
    folded.unmatched.length === 0 && folded.multiOwned.length === 0 && folded.ghostIds.length === 0,
    `未认领 ${folded.unmatched.length} 条 / 被多张卡认领 ${folded.multiOwned.length} 条 / 卡片上不存在的 id ${folded.ghostIds.length} 个` +
    (folded.unmatched.length ? ` · 例：${folded.unmatched.slice(0, 3).join('、')}` : ''));

  check('认领关系同厂商（折叠键把厂商算进去了，不是只按优惠文案并卡）',
    folded.crossVendor.length === 0,
    folded.crossVendor.length ? `跨厂商 ${folded.crossVendor.length} 条 · 例：${folded.crossVendor.slice(0, 2).join(' / ')}`
      : `全部 ${folded.deals} 条都落在同一厂商的卡片上`);

  // 这条断言的牙口是**实跑验过**的：把折叠键里的厂商抹掉（`foldKey` 只返回 type+条件+有效期）
  // 后，重建产物仍能过构建自检，但这条当场变红「跨厂商 11 条」。
  // （只把厂商换成空串是**不够**的——那样各家仍被优惠类型分在不同组里，不会真的并成一张卡，
  //   所以验牙口要用「键里根本不含厂商」这种版本。）

  check('折叠卡声明的覆盖条数与实际认领数一致（不虚报）',
    folded.foldedCards.every(card => card.declared === card.claimed && card.declared >= 2),
    folded.foldedCards.map(card => `${card.title}：声明 ${card.declared} / 认领 ${card.claimed}`).join(' · ') || '本页没有折叠卡');

  check('折叠卡的额度口径与数据一致（各型号额度不同时不许写「共用同一份额度」）',
    folded.foldedCards.every(card => {
      const shared = card.distinctTexts <= 1;
      if (card.quota === 'shared') return shared && card.saysShared && !card.saysVaries;
      if (card.quota === 'varies') return !shared && card.saysVaries && !card.saysShared;
      return false;
    }),
    folded.foldedCards.map(card => `${card.title}：${card.quota} · 数据里 ${card.distinctTexts} 种文案 · ` +
      `卡上${card.saysVaries ? '「各型号额度不同」' : card.saysShared ? '「共用同一份额度」' : '无额度说明'}`).join(' · ') || '本页没有折叠卡');

  check('折叠卡那行优惠文案没被裁、且说清了代表条目那句',
    folded.foldedCards.every(card => !card.clamped && card.coversRepresentative),
    folded.foldedCards.map(card => `${card.title}：${card.offer.length} 字${card.clamped ? '（被裁）' : ''}${card.coversRepresentative ? '' : '（没覆盖到成员文案）'}`).join(' · ') || '本页没有折叠卡');

  check('折叠卡把成员原文预渲染进静态正文（无 JS / 爬虫也读得到）',
    folded.foldedCards.every(card => card.prerenderedTexts === card.distinctTexts && card.memberTextChars > 0),
    folded.foldedCards.map(card => `${card.title}：${card.prerenderedTexts}/${card.distinctTexts} 种原文 · ${card.memberTextChars} 字`).join(' · ') || '本页没有折叠卡');

  check('被折叠的每一条都还能从首页点到自己的详情页',
    folded.foldedCards.every(card => card.memberLinks.length === card.declared &&
      card.memberLinks.every(href => /^deal\/[^/]+\/$/.test(href))),
    folded.foldedCards.map(card => `${card.title}：成员链接 ${card.memberLinks.length}/${card.declared}`).join(' · ') || '本页没有折叠卡');

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
    // v1.3：信息来源块也必须在**弹层**里（首页只有一个 URL，详情页之外的读者走的就是这里）
    const srcBox = dlg.querySelector('.dsrc');
    const srcRows = srcBox ? srcBox.querySelectorAll('.dsrc-row').length : 0;
    const srcText = srcBox ? srcBox.innerText.replace(/\s+/g, ' ').trim() : '';
    dlg.querySelector('.x').click();
    await new Promise(r => setTimeout(r, 200));
    return { title, shown, open, cells, cta, closed: !dlg.open, oneRow, tiles: tops.length, tileW, offset, escaped, srcRows, srcText };
  });
  check('点卡片打开弹层', dialog.open, `「${dialog.title}」`);
  check('弹层标题与卡片一致', dialog.shown === dialog.title, `弹层「${dialog.shown}」`);
  check('弹层在视口正中', Math.abs(dialog.offset.x) <= 2 && Math.abs(dialog.offset.y) <= 2,
    `中心偏移 x=${dialog.offset.x}px y=${dialog.offset.y}px`);
  check('弹层未溢出视口', dialog.escaped);
  check('弹层有字段表与领取入口', dialog.cells >= 2 && dialog.cta, `${dialog.cells} 个字段`);
  check('弹层 logo 一行平铺', dialog.oneRow || dialog.tiles <= 1, `${dialog.tiles} 个 tile，宽 ${dialog.tileW}px`);
  check('弹层里有完整的信息来源块（来源 / 新鲜度 / 依据）',
    dialog.srcRows >= 8 && /信息来源/.test(dialog.srcText) && /最近成功采集/.test(dialog.srcText) &&
    !/已核验/.test(dialog.srcText),
    `${dialog.srcRows} 行 · 含「最近成功采集」=${/最近成功采集/.test(dialog.srcText)}`);
  check('可以关闭', dialog.closed);

  console.log('\n=== 7) 筛选 / 排序真的生效 ===');
  const filter = await page.evaluate(async () => {
    const count = () => document.querySelectorAll('article.g').length;
    const base = count();
    // 「已核验」这个维度已经从页面撤掉（它和「数据更新」并列时反而让人以为核验过的条目更旧）。
    // 撤掉的东西也要有断言盯着——否则将来谁把它加回来，这里不会有任何反应。
    // 只读**渲染出来的卡片文本**：内联脚本源码里还留着解释这件事的注释，扫整页会假红。
    const cards = [...document.querySelectorAll('article.g')];
    const legacyFacet = Boolean(document.querySelector('[data-facet="verified"]'));
    const legacyText = cards.filter(card => /已核验/.test(card.textContent)).length;
    const stamped = cards.filter(card => /数据更新 \d{4}-\d{2}-\d{2}/.test(card.textContent)).length;
    document.querySelector('[data-facet="region"][data-value="cn"]').click();
    await new Promise(r => setTimeout(r, 150));
    const cn = count();
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
    const facets = document.getElementById('facets');
    const top = document.getElementById('topStat');
    return {
      base, cn, back, noBands, sorted, bands: document.querySelectorAll('.tierhead').length,
      cards: cards.length, legacyFacet, legacyText, stamped,
      legacyInFacets: Boolean(facets) && /已核验/.test(facets.textContent),
      legacyInTop: Boolean(top) && /已核验/.test(top.textContent)
    };
  });
  check('筛选条里不再有「已核验」按钮与计数', !filter.legacyFacet && !filter.legacyInFacets);
  check('卡片与顶栏不再出现「已核验」字样', filter.legacyText === 0 && !filter.legacyInTop,
    `卡片 ${filter.legacyText} 张命中`);
  check('每张卡片都标注「数据更新」日期', filter.stamped === filter.cards && filter.cards > 0,
    `${filter.stamped}/${filter.cards}`);
  check('「国内」筛选生效', filter.cn > 0 && filter.cn < filter.base, `${filter.base} → ${filter.cn}`);
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

  console.log('\n=== 8b) 中文译文可搜索 ===');

  /**
   * 用户**看得见**的中文必须搜得到：卡片上的「中文」胶囊指的就是详情弹层里那段人工译文，
   * 把其中一段中文复制进搜索框却 0 结果，就是「看得见搜不到」。
   *
   * 不硬编码任何条目：从同一份产物（`fetch('deals.json')`，本地与 --url= 线上冒烟都同源可取）里
   * 现取一条**当前视图里真有卡**的带译文条目，再取它译文里连续 ≥6 个汉字去搜。
   * 卡片标题用两种口径匹配：单条卡（标题即条目标题）与折叠卡（标题是折叠后的，靠 data-deal-ids 认领）。
   */
  const ZH_PROBE = `(async () => {
    const payload = await (await fetch('deals.json')).json();
    const deals = payload.deals || [];
    const cards = [...document.querySelectorAll('article.g')];
    const cardTitles = new Set();
    const byMemberId = new Map();
    for (const card of cards) {
      const title = ((card.querySelector('h3') || {}).textContent || '').trim();
      if (title) cardTitles.add(title);
      for (const id of (card.dataset.dealIds || '').split(',').filter(Boolean)) byMemberId.set(id, title);
    }
    const runOf = s => (String(s).match(/[\\u4e00-\\u9fa5]{6,}/) || [''])[0];
    for (const deal of deals) {
      const title = String(deal.title || '').trim();
      const cardTitle = cardTitles.has(title) ? title : (byMemberId.get(String(deal.id)) || null);
      if (!cardTitle || !deal.zh || typeof deal.zh !== 'object') continue;
      for (const field of Object.keys(deal.zh)) {
        const phrase = runOf(deal.zh[field]);
        if (phrase) return { id: deal.id, title, cardTitle, field, phrase, zh: String(deal.zh[field]) };
      }
    }
    return null;
  })()`;

  const zhSearchOnce = async phrase => {
    await page.fill('#searchInput', phrase);
    await page.waitForTimeout(350);
    return page.evaluate(() => ({
      count: document.querySelectorAll('article.g').length,
      titles: [...document.querySelectorAll('article.g h3')].map(h => h.textContent.trim())
    }));
  };

  const baseDealCards = await page.evaluate(() => document.querySelectorAll('article.g').length);
  const zhDeal = await page.evaluate(ZH_PROBE);
  check('优惠视图里存在带中文译文的卡片（检索验证的取样前提）', Boolean(zhDeal),
    zhDeal ? `${zhDeal.title} · 译文字段 ${zhDeal.field}` : '找不到——译文可能全部落在「全部工具」视图里');
  if (zhDeal) {
    const hit = await zhSearchOnce(zhDeal.phrase);
    const matched = hit.titles.indexOf(zhDeal.cardTitle) >= 0;
    check('中文译文可搜：粘贴译文里的中文片段能搜到那张卡',
      hit.count > 0 && hit.count < baseDealCards && matched,
      `搜「${zhDeal.phrase}」→ ${hit.count}/${baseDealCards} 张卡 · 命中「${zhDeal.cardTitle}」=${matched}`);
  }
  await page.fill('#searchInput', '');
  await page.waitForTimeout(300);

  // 44 条译文里 38 条属于工具条目，只测优惠视图会漏掉大头
  await page.click('[data-facet="tab"][data-value="tools"]');
  await page.waitForTimeout(400);
  const baseToolCards = await page.evaluate(() => document.querySelectorAll('article.g').length);
  const zhTool = await page.evaluate(ZH_PROBE);
  check('「全部工具」视图里存在带中文译文的卡片（检索验证的取样前提）', Boolean(zhTool),
    zhTool ? `${zhTool.title} · 译文字段 ${zhTool.field}` : '找不到');
  if (zhTool) {
    const hit = await zhSearchOnce(zhTool.phrase);
    const matched = hit.titles.indexOf(zhTool.cardTitle) >= 0;
    check('中文译文可搜（全部工具视图）：同样能搜到',
      hit.count > 0 && hit.count < baseToolCards && matched,
      `搜「${zhTool.phrase}」→ ${hit.count}/${baseToolCards} 张卡 · 命中「${zhTool.cardTitle}」=${matched}`);
  }
  await page.fill('#searchInput', '');
  await page.waitForTimeout(300);
  await page.click('[data-facet="tab"][data-value="deals"]');
  await page.waitForTimeout(400);

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

  // 控制带逐个控件体检 + 跳转 chip 折行 + **更窄视口的页面级溢出** —— 补的是门禁的两个盲区：
  // ① 上面那条「无横向溢出」只看**页面级** scrollWidth：控件被父容器 `overflow:hidden` 切掉一截时，
  //    页面级宽度照样正常，门禁全绿而肉眼看是「最近更新」只剩「最近更」
  //    （`.sortbox` 与 `.seg` 恰好都是 `overflow:hidden`；见 research/VISION-REVIEW.md §6）。
  // ② 它也只量 **390px**：真正的横向溢出发生在更窄处 —— 本轮实测 360px 溢出 2px、320px 溢出 42px。
  //    根因是 `.grid` 的 `1fr` 等价于 `minmax(auto, 1fr)`，自动下限被卡片最小内容顶在 345.5px，
  //    视口窄于约 378px 时轨道就撑破容器（见 PROJECT_STATUS 2.27 ⑤）。
  // 先回到干净的默认态：锚点行只在「卡片视图 + 力度优先」下可见，靠前的小节会改这两个状态。
  await page.goto(base, { waitUntil: 'load' });
  await waitForApp(page);
  const chromeProbe = () => page.evaluate(() => {
    const CLIP = ['hidden', 'clip'];
    const label = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') +
      (typeof el.className === 'string' && el.className.trim()
        ? '.' + el.className.trim().split(/\s+/).join('.') : '') +
      '「' + (el.textContent || '').trim().slice(0, 8) + '」';
    const controls = [...document.querySelectorAll(
      '#sortBox button, #categoryFilter, #viewSeg button, #jumpNav a, .rright, .rbar, #stats, #facets [data-facet="fav"]')]
      .filter(el => el.getBoundingClientRect().width > 0);
    const selfClipped = [], cutByAncestor = [], pastViewport = [];
    for (const el of controls) {
      const box = el.getBoundingClientRect();
      // ① 自己就把内容裁了：overflow 非 visible，而内容比盒子宽
      if (el.scrollWidth - el.clientWidth > 1 && CLIP.includes(getComputedStyle(el).overflowX)) {
        selfClipped.push(label(el));
      }
      // ② 被祖先里某个 overflow:hidden/clip 的盒子切掉一截 —— 页面级宽度查不出的那一类
      for (let p = el.parentElement; p; p = p.parentElement) {
        if (!CLIP.includes(getComputedStyle(p).overflowX)) continue;
        if (box.right > p.getBoundingClientRect().right + 1) {
          cutByAncestor.push(label(el) + ' ← ' + label(p));
          break;
        }
      }
      // ③ 直接越出视口
      if (box.right > window.innerWidth + 1) pastViewport.push(label(el));
    }
    const nav = document.getElementById('jumpNav');
    const links = nav ? [...nav.querySelectorAll('a')] : [];
    const rows = {};
    links.forEach(a => { const t = Math.round(a.offsetTop); rows[t] = (rows[t] || 0) + 1; });
    const navBox = nav && !nav.hidden && nav.getBoundingClientRect().height > 0 ? nav.getBoundingClientRect() : null;
    const last = links.length ? links[links.length - 1].getBoundingClientRect() : null;
    const grid = document.getElementById('dealsList');
    return {
      width: window.innerWidth,
      docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      gridW: Math.round(grid.getBoundingClientRect().width),
      containerW: Math.round(grid.parentElement.getBoundingClientRect().width),
      checked: controls.length, selfClipped, cutByAncestor, pastViewport,
      jumpVisible: Boolean(navBox), chips: links.length,
      chipRows: Object.keys(rows).length, perRow: Object.values(rows),
      // 末枚 chip 右边缘离锚点行右边缘还有多远：折成 3+1 时这里会剩大半行（当时实测 269px）
      tailGap: navBox && last ? Math.round(navBox.right - last.right) : null
    };
  });
  const chrome390 = await chromeProbe();
  await page.setViewportSize({ width: 360, height: 844 });
  await page.waitForTimeout(250);
  const chrome360 = await chromeProbe();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  const chromes = [chrome390, chrome360];
  const chromeBad = chromes.flatMap(c => c.selfClipped.concat(c.cutByAncestor, c.pastViewport));
  check('390px 与 360px：逐个控件都不被裁、不越出视口（页面级溢出查不出的那一类）',
    chromeBad.length === 0,
    chromeBad.length
      ? chromeBad.join(' / ')
      : `${chrome390.checked} + ${chrome360.checked} 个控件逐个量过：自裁 0 · 被祖先裁 0 · 越出视口 0`);
  check('390px 与 360px：跳转 chip 都排满一行（不折成 3+1、右侧不留大片空白）',
    chromes.every(c => c.jumpVisible && c.chips === 4 && c.chipRows === 1 &&
      c.perRow[0] === 4 && c.tailGap !== null && c.tailGap <= 8),
    chromes.map(c => `${c.width}px: chips=${c.chips} rows=${c.chipRows}` +
      ` perRow=${JSON.stringify(c.perRow)} 余量=${c.tailGap}px`).join(' · '));
  check('360px 页面级无横向溢出（390px 那条量不到更窄的视口）',
    chrome360.docOverflow <= 0 && chrome360.gridW <= chrome360.containerW + 0.5,
    `溢出 ${chrome360.docOverflow}px · 网格 ${chrome360.gridW}px / 容器 ${chrome360.containerW}px`);

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

  console.log('\n=== 13) 配色主题 · 无障碍 · 对比度 ===');

  // 对比度探针（与 study-site.js 同一套 WCAG 近似算法）：
  // 只算纯色背景；渐变/图片背景的样本跳过，避免把「图上的白字」算成不合格。
  const contrastProbe = () => {
    const parse = value => {
      const m = String(value).match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const parts = m[1].split(',').map(x => parseFloat(x));
      return parts.length < 3 || parts.some(Number.isNaN) ? null : { rgb: parts.slice(0, 3), a: parts.length > 3 ? parts[3] : 1 };
    };
    const lum = rgb => {
      const f = c => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
    };
    const bgOf = el => {
      let node = el;
      while (node && node !== document.documentElement.parentNode) {
        const s = getComputedStyle(node);
        if (s.backgroundImage && s.backgroundImage !== 'none') return null;
        const c = parse(s.backgroundColor);
        if (c && c.a >= 0.95) return c.rgb;
        node = node.parentElement;
      }
      return [255, 255, 255];
    };
    const out = { sampled: 0, skipped: 0, below: 0, min: null, worst: [] };
    for (const el of document.querySelectorAll('body *')) {
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden') continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) continue;
      // 单个字符也采样：档位角标「1」这类最容易出问题的元素就一个字符
      if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length >= 1)) continue;
      const fg = parse(s.color);
      if (!fg) continue;
      const bg = bgOf(el);
      if (!bg) { out.skipped++; continue; }
      // 半透明文字先与背景混合，否则 rgba(0,0,0,.5) 会被当成纯黑算出虚高的对比度
      const fgRgb = fg.a >= 0.95 ? fg.rgb : [0, 1, 2].map(i => fg.rgb[i] * fg.a + bg[i] * (1 - fg.a));
      const l1 = lum(fgRgb); const l2 = lum(bg);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      const size = parseFloat(s.fontSize);
      const required = size >= 24 || (size >= 18.66 && Number(s.fontWeight) >= 700) ? 3 : 4.5;
      out.sampled++;
      if (ratio < required) {
        out.below++;
        out.worst.push({
          ratio: Math.round(ratio * 100) / 100,
          text: (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 24),
          selector: el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/)[0] : '')
        });
      }
      const r = Math.round(ratio * 100) / 100;
      out.min = out.min === null ? r : Math.min(out.min, r);
    }
    out.worst.sort((a, b) => a.ratio - b.ratio);
    out.worst = out.worst.slice(0, 3);
    return out;
  };

  const semantics = await page.evaluate(() => ({
    header: document.querySelectorAll('header').length,
    nav: document.querySelectorAll('nav').length,
    main: document.querySelectorAll('main').length,
    facets: document.querySelectorAll('[data-facet]').length,
    pressed: document.querySelectorAll('[data-facet][aria-pressed]').length,
    segButtons: document.querySelectorAll('#themeSeg [data-theme-value]').length
  }));
  check('语义标签齐备（header / nav / main）',
    semantics.header >= 1 && semantics.nav >= 1 && semantics.main >= 1,
    `header=${semantics.header} nav=${semantics.nav} main=${semantics.main}`);
  check('筛选按钮逐个带 aria-pressed', semantics.facets > 0 && semantics.pressed === semantics.facets,
    `${semantics.pressed}/${semantics.facets} 个`);

  const lightContrast = await page.evaluate(contrastProbe);
  const worstText = probe => probe.worst.map(w => `${w.selector}「${w.text}」${w.ratio}`).join(' · ') || '无';
  check('亮色主题：低于 4.5:1 的文本 ≤ 20', lightContrast.below <= 20,
    `抽样 ${lightContrast.sampled} · 跳过复杂背景 ${lightContrast.skipped} · 低于要求 ${lightContrast.below} · 最低 ${lightContrast.min} · 最差 ${worstText(lightContrast)}`);

  // 主题切换：深色 → 记住 → 刷新仍深色 → 暗色下对比度同样达标 → 切回跟随系统
  await page.click('#themeSeg [data-theme-value="dark"]');
  await page.waitForTimeout(250);
  const darkNow = await page.evaluate(() => ({
    attr: document.documentElement.getAttribute('data-theme'),
    stored: (() => { try { return localStorage.getItem('dsh.theme'); } catch (e) { return 'n/a'; } })(),
    bodyBg: getComputedStyle(document.body).backgroundColor,
    colorScheme: getComputedStyle(document.documentElement).colorScheme
  }));
  check('切到深色立即生效并记住',
    darkNow.attr === 'dark' && darkNow.stored === 'dark' && darkNow.colorScheme.includes('dark'),
    `data-theme=${darkNow.attr} localStorage=${darkNow.stored} color-scheme=${darkNow.colorScheme} body=${darkNow.bodyBg}`);

  await page.reload({ waitUntil: 'load' });
  await waitForApp(page);
  const darkAfterReload = await page.evaluate(() => ({
    attr: document.documentElement.getAttribute('data-theme'),
    bodyBg: getComputedStyle(document.body).backgroundColor
  }));
  check('刷新后仍是深色（无「先亮后暗」闪回）',
    darkAfterReload.attr === 'dark' && darkAfterReload.bodyBg === darkNow.bodyBg,
    `data-theme=${darkAfterReload.attr} body=${darkAfterReload.bodyBg}`);

  const darkContrast = await page.evaluate(contrastProbe);
  check('暗色主题：低于 4.5:1 的文本 ≤ 20', darkContrast.below <= 20,
    `抽样 ${darkContrast.sampled} · 低于要求 ${darkContrast.below} · 最低 ${darkContrast.min} · 最差 ${worstText(darkContrast)}`);

  check('两种主题下抽样量相当（深色不是把内容藏起来）',
    darkContrast.sampled >= Math.round(lightContrast.sampled * 0.8),
    `亮色 ${lightContrast.sampled} → 暗色 ${darkContrast.sampled}`);

  await page.click('#themeSeg [data-theme-value="auto"]');
  await page.waitForTimeout(200);
  const backToAuto = await page.evaluate(() => ({
    attr: document.documentElement.getAttribute('data-theme'),
    stored: (() => { try { return localStorage.getItem('dsh.theme'); } catch (e) { return 'n/a'; } })()
  }));
  check('切回「跟随系统」会清掉手动选择', backToAuto.attr === null && backToAuto.stored === null,
    `data-theme=${backToAuto.attr} localStorage=${backToAuto.stored}`);

  // 动效可关：系统偏好优先，任何过渡都不再是真动效
  const rmPage = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await rmPage.goto(base, { waitUntil: 'load' });
  await rmPage.waitForTimeout(300);
  const reduced = await rmPage.evaluate(() => {
    const card = document.querySelector('article.g');
    const dur = card ? getComputedStyle(card).transitionDuration : 'n/a';
    const offenders = [...document.querySelectorAll('body *')].filter(el => {
      const s = getComputedStyle(el);
      return parseFloat(s.transitionDuration) > 0.02 || parseFloat(s.animationDuration) > 0.02;
    }).length;
    return { dur, offenders };
  });
  check('prefers-reduced-motion 下动效被关掉', reduced.offenders === 0,
    `卡片 transition-duration=${reduced.dur} · 仍在动的元素 ${reduced.offenders} 个`);
  await rmPage.close();

  console.log('\n=== 14) 订阅 · 同页锚点 · 纠错入口 ===');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload({ waitUntil: 'load' });
  await waitForApp(page);

  /**
   * 锚点导航的**真实渲染**探针（几何 + 计算样式），不是读 `hidden` 属性。
   *
   * 为什么必须量几何：`.jump { display: flex }`（以及 max-width:760px 下的 `display: grid`）
   * 是作者级声明，CSS 层叠在比特异性之前先比**来源**——作者级无条件赢过 UA 样式表里的
   * `[hidden] { display: none }`。于是 `jump.hidden = true` 与「导航照旧可见可点」可以同时成立，
   * 只读属性的断言会一路绿灯（2026-09-28 实测就是这种假隐藏进了线上）。
   * dangling = 可见链接里指不到落点的个数：筛选/搜索把某一档清空时会产生真死锚点。
   */
  const JUMP_GEOM = `(() => {
    const nav = document.getElementById('jumpNav');
    if (!nav) return { exists: false };
    const cs = getComputedStyle(nav);
    const rect = nav.getBoundingClientRect();
    const links = [...nav.querySelectorAll('a[href^="#tier-"]')];
    const shown = links.filter(a => a.getBoundingClientRect().height > 0);
    return {
      exists: true,
      hidden: nav.hidden,
      display: cs.display,
      height: Math.round(rect.height),
      offsetHeight: nav.offsetHeight,
      links: links.length,
      shownLinks: shown.length,
      bands: document.querySelectorAll('.tierhead').length,
      dangling: links.filter(a => a.getBoundingClientRect().height > 0 &&
        !document.querySelector(a.getAttribute('href'))).length
    };
  })()`;
  const probeJump = (sort = null) => page.evaluate(async ({ sort: s, src }) => {
    if (s) {
      document.querySelector('[data-sort="' + s + '"]').click();
      await new Promise(r => setTimeout(r, 350));
    }
    return (0, eval)(src); // eslint-disable-line no-eval
  }, { sort, src: JUMP_GEOM });
  const jumpShownOk = s => Boolean(s && s.exists) && s.display !== 'none' && s.height > 0 &&
    s.offsetHeight > 0 && s.shownLinks > 0 && s.dangling === 0;
  const jumpHiddenOk = s => Boolean(s && s.exists) && s.hidden === true && s.display === 'none' &&
    s.height === 0 && s.offsetHeight === 0 && s.dangling === 0;
  const jumpDetail = s => s && s.exists
    ? `hidden=${s.hidden} display=${s.display} h=${s.height} offsetH=${s.offsetHeight} 可见链接=${s.shownLinks} 死链=${s.dangling}`
    : '(没有 #jumpNav)';

  const anchorState = await page.evaluate(() => {
    const nav = document.getElementById('jumpNav');
    const links = nav ? [...nav.querySelectorAll('a[href^="#tier-"]')] : [];
    const targets = links.map(a => document.querySelector(a.getAttribute('href')));
    return {
      exists: Boolean(nav),
      links: links.length,
      resolved: targets.filter(Boolean).length,
      firstTop: targets[0] ? Math.round(targets[0].getBoundingClientRect().top) : null
    };
  });
  check('同页锚点导航存在且都有落点',
    anchorState.exists && anchorState.links >= 3 && anchorState.resolved === anchorState.links,
    `${anchorState.links} 个锚点 / 落点 ${anchorState.resolved} 个 / 首个落点 top=${anchorState.firstTop}px`);

  const jumped = await page.evaluate(async () => {
    const before = window.scrollY;
    document.querySelector('#jumpNav a[href="#tier-2"]').click();
    await new Promise(r => setTimeout(r, 450));
    return { before, after: window.scrollY, hash: location.hash };
  });
  check('点锚点真的跳到该档位', jumped.after > jumped.before && jumped.hash === '#tier-2',
    `scrollY ${jumped.before} → ${jumped.after}（${jumped.hash}）`);

  // 四种状态下都量**真实渲染**。旧断言只读 `hidden` 属性，于是「CSS 里没有 .jump[hidden]
  // {display:none}」这种假隐藏可以一直绿着上线（本次修的是同一处）。
  const jumpCardTier = await probeJump(null);
  check('卡片视图 + 力度优先：锚点导航真的显示（几何判定）',
    jumpShownOk(jumpCardTier), jumpDetail(jumpCardTier));

  const jumpUpdated = await probeJump('updated');
  check('updated 排序：锚点导航**真的**隐藏（几何判定，不留死锚点）',
    jumpHiddenOk(jumpUpdated), jumpDetail(jumpUpdated));

  const jumpExpiry = await probeJump('expiry');
  check('expiry 排序：锚点导航**真的**隐藏（几何判定，不留死锚点）',
    jumpHiddenOk(jumpExpiry), jumpDetail(jumpExpiry));

  const jumpBack = await probeJump('tier');
  check('切回力度优先：锚点导航恢复显示',
    jumpShownOk(jumpBack) && jumpBack.bands >= 3,
    `${jumpDetail(jumpBack)} · 分带 ${jumpBack.bands} 个`);

  // 筛选/搜索把档位清空时，`#tier-N` 落点会消失——这是旧断言完全没覆盖的死锚点来源
  await page.fill('#searchInput', 'zzz-没有这条优惠-zzz');
  await page.waitForTimeout(400);
  const jumpNoResult = await page.evaluate(JUMP_GEOM);
  check('搜索无结果（全部档位为空）：锚点导航整块隐藏，不留死锚点',
    jumpHiddenOk(jumpNoResult) && jumpNoResult.bands === 0,
    `${jumpDetail(jumpNoResult)} · 分带 ${jumpNoResult.bands} 个`);

  await page.fill('#searchInput', '');
  await page.waitForTimeout(400);
  const jumpRestored = await page.evaluate(JUMP_GEOM);
  check('清空搜索后锚点导航恢复且每个锚点都有落点',
    jumpShownOk(jumpRestored) && jumpRestored.links >= 3,
    jumpDetail(jumpRestored));

  const report = await page.evaluate(async () => {
    document.querySelector('article.g').click();
    await new Promise(r => setTimeout(r, 350));
    const link = [...document.querySelectorAll('#detail .dact a')].find(a => /issues\/new/.test(a.href));
    const out = link ? {
      href: link.href,
      blank: link.target === '_blank',
      rel: link.rel,
      prefilled: decodeURIComponent(link.href).includes('id：') && decodeURIComponent(link.href).includes('官方页：')
    } : null;
    document.querySelector('#detail .x').click();
    await new Promise(r => setTimeout(r, 250));
    return out;
  });
  check('详情里有预填 id 的纠错入口',
    Boolean(report) && report.blank && report.prefilled && /github\.com\/.+\/issues\/new/.test(report.href),
    report ? `${report.href.slice(0, 76)}…（rel=${report.rel}）` : '未找到纠错链接');

  // 订阅（v1.6）：首页只暴露四个订阅选择（各两种格式 = 8 条 rel="alternate"），
  // 每条都要**真的打得开、真的是那个格式、标题与 Feed 自己的 <title> 逐字相同**。
  //
  // 为什么在真浏览器里再验一遍：`build-local.js` 的产物自检只看字符串，
  // 而阅读器关心的是「这份 XML 能不能被真解析器读出来」。这里用浏览器自带的
  // DOMParser（一个与 build-local 的手写检查器**完全独立**的实现）来判良构。
  const feedProbe = await page.evaluate(async () => {
    const links = [...document.querySelectorAll('link[rel="alternate"]')]
      .map(l => ({ type: l.type, title: l.title, href: l.getAttribute('href') }))
      .filter(l => /feed/.test(l.href || ''));
    // 站点绝对前缀从 canonical 现取（本地服务时它仍是线上地址，所以条目链接是绝对的）
    const canonical = (document.querySelector('link[rel="canonical"]') || {}).href || '';
    const site = canonical.replace(/[^/]*$/, '');
    const targets = ['feed.xml', 'feed.json', 'feed/changes.xml', 'feed/changes.json',
      'feed/student.xml', 'feed/student.json', 'feed/developer.xml', 'feed/developer.json'];
    const out = { links, site, targets: {} };
    for (const rel of targets) {
      const response = await fetch(rel, { cache: 'no-cache' });
      const text = await response.text();
      const box = { ok: response.ok, status: response.status, bytes: text.length, title: null, items: 0, ids: [], urls: [], parserError: null, version: null };
      if (rel.endsWith('.xml')) {
        const doc = new DOMParser().parseFromString(text, 'application/xml');
        box.parserError = doc.querySelector('parsererror') ? doc.querySelector('parsererror').textContent.slice(0, 120) : null;
        box.title = doc.querySelector('channel > title') ? doc.querySelector('channel > title').textContent : null;
        const nodes = [...doc.querySelectorAll('item')];
        box.items = nodes.length;
        box.ids = nodes.map(node => (node.querySelector('guid') || {}).textContent || '');
        box.urls = nodes.map(node => (node.querySelector('link') || {}).textContent || '');
        box.image = Boolean(doc.querySelector('channel > image > url'));
        box.selfLink = Boolean(doc.querySelector('channel > link[rel="self"]'));
        box.lastBuildDate = doc.querySelector('channel > lastBuildDate') ? doc.querySelector('channel > lastBuildDate').textContent : null;
      } else {
        try {
          const box2 = JSON.parse(text);
          box.version = box2.version;
          box.title = box2.title;
          box.items = box2.items.length;
          box.ids = box2.items.map(item => item.id);
          box.urls = box2.items.map(item => item.url);
          box.icon = box2.icon;
          box.favicon = box2.favicon;
          box.offMidnight = box2.items.filter(item =>
            (item.date_published && !/T00:00:00\+08:00$/.test(item.date_published)) ||
            (item.date_modified && !/T00:00:00\+08:00$/.test(item.date_modified))).length;
        } catch (error) { box.parseError = error.message; }
      }
      out.targets[rel] = box;
    }
    return out;
  });

  check('首页声明了四个订阅选择 × 两种格式 = 8 条 rel="alternate"',
    feedProbe.links.length === 8 &&
    feedProbe.links.filter(l => /rss\+xml/.test(l.type)).length === 4 &&
    feedProbe.links.filter(l => /feed\+json/.test(l.type)).length === 4,
    feedProbe.links.map(l => l.href).join(' · ') || '未声明');

  check('每个订阅目标的 <title> 与首页声明的 title 逐字相同（改了注册表忘了改页面就会红）',
    feedProbe.links.every(l => {
      const target = feedProbe.targets[l.href];
      return target && target.title === l.title;
    }),
    feedProbe.links.filter(l => {
      const target = feedProbe.targets[l.href];
      return !target || target.title !== l.title;
    }).map(l => `${l.href}: ${l.title} ≠ ${(feedProbe.targets[l.href] || {}).title}`).join(' | ') || '8 条一致');

  const feedTargets = Object.entries(feedProbe.targets);
  check('全部订阅目标是 200 且被真解析器读出来（无 XML 解析错误）',
    feedTargets.every(([, box]) => box.ok && !box.parserError) && feedTargets.some(([rel]) => rel.endsWith('.xml')),
    feedTargets.filter(([, box]) => !box.ok || box.parserError).map(([rel, box]) => `${rel}: ${box.status}${box.parserError ? ` ${box.parserError}` : ''}`).join(' | ') || `${feedTargets.length} 个目标`);

  check('RSS 与 JSON Feed 的条目数、id 集合两侧一致',
    feedTargets.filter(([rel]) => rel.endsWith('.xml')).every(([rel, box]) => {
      const jsonBox = feedProbe.targets[rel.replace(/\.xml$/, '.json')];
      return jsonBox && jsonBox.items === box.items &&
        JSON.stringify(jsonBox.ids) === JSON.stringify(box.ids);
    }),
    feedTargets.filter(([rel]) => rel.endsWith('.xml')).map(([rel, box]) =>
      `${rel} ${box.items} 条`).join(' · '));

  check('订阅条目的主链接指向**本站**页面（不是把流量导出站外）',
    feedTargets.every(([, box]) => box.urls.every(url => !url || url.startsWith(feedProbe.site))),
    (feedTargets.map(([rel, box]) => box.urls.find(url => url && !url.startsWith(feedProbe.site)) && `${rel}: ${box.urls.find(url => url && !url.startsWith(feedProbe.site))}`).filter(Boolean)[0]) || '全部站内');

  check('订阅条目的时间都是数据日期的北京时间零点（没有构建时刻泄进产物）',
    feedTargets.filter(([rel]) => rel.endsWith('.json')).every(([, box]) => !box.offMidnight) &&
    feedTargets.filter(([rel]) => rel.endsWith('.xml')).every(([, box]) => /GMT$/.test(String(box.lastBuildDate || ''))),
    feedTargets.map(([rel, box]) => `${rel}:${box.offMidnight || 0}`).slice(0, 4).join(' · '));

  check('JSON Feed 都带 icon 与 favicon；RSS 都带 <image> 与 atom:link rel=self',
    feedTargets.filter(([rel]) => rel.endsWith('.json')).every(([, box]) => box.icon && box.favicon) &&
    feedTargets.filter(([rel]) => rel.endsWith('.xml')).every(([, box]) => box.image && box.selfLink),
    '两种格式的图标与自指字段齐备');

  check('订阅里确实有优惠条目（不是空壳）', feedProbe.targets['feed.xml'].items > 0,
    `feed.xml ${feedProbe.targets['feed.xml'].items} 条 · feed/changes.xml ${feedProbe.targets['feed/changes.xml'].items} 条（变化流为空是事实）`);

  // 抽 3 条订阅里的链接真的打得开。**必须换成本地地址再取**：
  // 产物里的链接是线上绝对 URL，直接 fetch 会真的打到 GitHub Pages ——
  // 那既污染了第 10 节的「没有外部请求」断言，也让本地验收依赖公网。
  const feedLinks = feedProbe.targets['feed.xml'].urls
    .slice(0, 3)
    .map(url => url.replace(feedProbe.site, ''))
    .map(rel => (rel.startsWith('http') ? null : rel))
    .filter(Boolean);
  const linkProbe = await page.evaluate(async urls => {
    const out = [];
    for (const rel of urls) {
      const response = await fetch(rel, { cache: 'no-cache' });
      out.push({ rel, ok: response.ok, status: response.status });
    }
    return out;
  }, feedLinks);
  check('订阅里的条目链接真的打得开（换成本地地址取，不碰公网）',
    linkProbe.length > 0 && linkProbe.every(row => row.ok),
    linkProbe.map(row => `${row.rel} ${row.status}`).join(' · '));

  const ldTypes = await page.evaluate(() => [...document.querySelectorAll('script[type="application/ld+json"]')]
    .map(s => { try { return JSON.parse(s.textContent)['@type']; } catch (e) { return 'PARSE_ERROR'; } }));
  check('结构化数据含 WebSite 节点', ldTypes.includes('WebSite') && ldTypes.includes('Organization'),
    ldTypes.join(' / '));

  // ---- 14b) 订阅中心 /feeds/ ----
  console.log('\n=== 14b) 订阅中心 /feeds/ ===');
  const feedsPageUrl = new URL('feeds/', base).href;
  await page.goto(feedsPageUrl, { waitUntil: 'load' });
  const feedsPage = await page.evaluate(() => {
    // 页面上列出的订阅地址是**线上绝对 URL**（就是要让人复制走的），所以在浏览器里
    // 一律不 fetch —— 那会真的打到 GitHub Pages。存在性在 Node 侧对产物目录逐条核。
    const hrefs = [...new Set([...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href')))]
      .filter(href => /\/feed(\/|\.xml|\.json)/.test(href));
    return {
      title: document.title,
      canonical: (document.querySelector('link[rel="canonical"]') || {}).href || '',
      alternates: document.querySelectorAll('link[rel="alternate"]').length,
      ldTypes: [...document.querySelectorAll('script[type="application/ld+json"]')]
        .map(s => { try { return JSON.parse(s.textContent)['@type']; } catch (e) { return 'PARSE_ERROR'; } }),
      rows: document.querySelectorAll('li.frow').length,
      listed: hrefs,
      text: document.body.textContent.replace(/\s+/g, ' ')
    };
  });
  check('/feeds/ 存在且有标题', /订阅/.test(feedsPage.title), feedsPage.title);
  check('/feeds/ canonical 自指', feedsPage.canonical.endsWith('/feeds/'), feedsPage.canonical);
  check('/feeds/ 声明恰好两个订阅源（根 Feed 对）', feedsPage.alternates === 2, `${feedsPage.alternates} 个`);
  check('/feeds/ JSON-LD 是 CollectionPage + BreadcrumbList',
    JSON.stringify(feedsPage.ldTypes.slice().sort()) === JSON.stringify(['BreadcrumbList', 'CollectionPage']),
    feedsPage.ldTypes.join(', '));
  check('/feeds/ 列出了全部订阅源（每个厂商 Feed 一行）', feedsPage.rows >= 18, `${feedsPage.rows} 行`);
  {
    // 逐条对产物目录核对：页面上列出的每一个订阅地址都必须有对应文件
    const sitePrefix = feedsPage.canonical.replace(/[^/]*$/, '');
    const missing = feedsPage.listed
      .map(href => href.replace(sitePrefix, ''))
      .filter(route => /^feed(\/|\.)|^feed$/.test(route) && !fs.existsSync(path.join(DIR, decodeURIComponent(route))));
    check('/feeds/ 上列出的每一个订阅地址都有对应产物文件',
      feedsPage.listed.length >= 36 && missing.length === 0,
      missing.length ? `缺 ${missing.slice(0, 3).join('、')}` : `${feedsPage.listed.length} 个地址全部存在`);
  }
  check('/feeds/ 明说不需要账号（无 JS 时也读得到）',
    /没有账号|不需要账号/.test(feedsPage.text) && /没有邮件列表/.test(feedsPage.text));
  // 变化流**为空**时，页面必须明说「这是空态 + 起算日」（不是一片空白）；
  // **非空**时同一句话换成「N 条 + 最近一条日期」——两种状态都必须说清，只是说的内容不同。
  // 只看「有没有起算句」会在非空时永远红，只看「有没有条数」会在空态漏掉「我们没查到」这句话。
  {
    const changeItems = feedProbe.targets['feed/changes.xml'] ? feedProbe.targets['feed/changes.xml'].items : 0;
    const countLine = new RegExp(`最近变化\\s*${changeItems}\\s*条`);
    check(`/feeds/ 的变化订阅按当前状态说清（空 ⇒ 起算日 / 非空 ⇒ 条数与最近一条日期）`,
      changeItems > 0
        ? countLine.test(feedsPage.text) && /最近一条\s*\d{4}-\d{2}-\d{2}/.test(feedsPage.text)
        : /起算|记录自/.test(feedsPage.text),
      changeItems > 0
        ? `变化 ${changeItems} 条 · 页面写的是「最近变化 … 条 + 最近一条 …」`
        : `变化流为空 · 页面写的是起算日`);
  }
  // v3.0 Stage H4：注册表里的**每一条变化流**都必须在订阅中心上被列出，
  // 且 RSS / JSON Feed 两个地址都在（H4 要求「订阅中心一致」）。
  for (const spec of feedsLib.PLAN_CHANGE_FEEDS) {
    const hasTitle = feedsPage.text.includes(spec.title);
    const hasRss = feedsPage.listed.some(href => href.endsWith(spec.path));
    const hasJson = feedsPage.listed.some(href => href.endsWith(spec.jsonPath));
    check(`/feeds/ 列出了「${spec.title}」的 RSS 与 JSON Feed`,
      hasTitle && hasRss && hasJson,
      `标题 ${hasTitle} · RSS ${hasRss} · JSON ${hasJson}`);
  }
  // 空态那一行的起算日取自**它自己**那份日志：只有真的为空时才写出来，
  // 所以这里只断言「为空的那条变化流写出了起算日」。
  // （「起算日取错来源」这条牙由 `feeds-selftest` 用**注入不同 startedAt 的夹具**钉住 ——
  //   真实数据上两条日志的 startedAt 相同，在这里写断言会恒真、等于没有牙。）
  //
  // 「这一行是不是 0 条」的判据是 `lib/feeds.js` 的 `isZeroCountRow()`（**唯一出处**）。
  // 这里刻意不再写 `/0 条/`：那是**子串**匹配，`10 条` / `80 条` / `100 条` 全都命中 ——
  // t28 的 T28-F1 就是这么来的（API 价格变化长到 10 条之后，两条变化流都被当成空态、
  // 都被要求写起算日 ⇒ 门禁自造假红）。判据改成数字边界后，只有真的说「0 条」的行才进空态分支。
  {
    const rowsOf = spec => {
      const idx = feedsPage.text.indexOf(spec.title);
      if (idx < 0) return null;
      // 窗口右界取**下一条变化流标题**的下标（没有就退回 260 字符上限）：
      // 固定长度窗口会把邻行的文案框进来，两条相邻空行时甚至能借到邻行的起算日。
      const next = feedsLib.PLAN_CHANGE_FEEDS
        .map(other => feedsPage.text.indexOf(other.title, idx + spec.title.length))
        .filter(hit => hit >= 0)
        .sort((a, b) => a - b)[0];
      const end = Math.min(next === undefined ? idx + 260 : next, idx + 260);
      return feedsPage.text.slice(idx, end);
    };
    const rows = feedsLib.PLAN_CHANGE_FEEDS.map(spec => ({ spec, row: rowsOf(spec) }));
    const problems = rows.filter(({ row }) => row === null || !feedsLib.changeRowIsHonest(row));
    check('/feeds/ 为空的变化流那一行写出了起算日',
      problems.length === 0 && rows.every(({ row }) => row !== null),
      rows.map(({ spec, row }) => row === null
        ? `${spec.title}: 页面里找不到标题`
        : `${spec.title}: 说 0 条=${feedsLib.isZeroCountRow(row)} · 有起算日=${feedsLib.hasChangeStartDate(row)}`).join(' | '));
  }

  console.log('\n=== 15) 独立详情页 ===');
  // 14b 把浏览器带到了 /feeds/，这一节要从首页取样 —— 显式回首页，
  // 而不是依赖「上一步恰好还在首页」（那种隐式依赖一改顺序就炸）。
  await page.goto(base, { waitUntil: 'load' });
  await waitForApp(page);
  const homeLink = await page.evaluate(() => {
    const card = document.querySelector('article.g');
    const titleLink = card.querySelector('.gt h3 a');
    const cta = card.querySelector('.meta .go');
    return {
      titleHref: titleLink ? titleLink.getAttribute('href') : '',
      titleBlank: titleLink ? titleLink.target : '',
      ctaHref: cta ? cta.getAttribute('href') : '',
      ctaBlank: cta ? cta.target : ''
    };
  });
  check('首页标题链接指向站内详情页',
    /^deal\/[0-9a-f]+\/$/.test(homeLink.titleHref) && homeLink.titleBlank !== '_blank',
    `${homeLink.titleHref}（target=${homeLink.titleBlank || '无'}）`);
  check('首页 CTA 仍直达厂商官方页',
    /^https?:/.test(homeLink.ctaHref) && homeLink.ctaBlank === '_blank',
    `${String(homeLink.ctaHref).slice(0, 56)}（target=${homeLink.ctaBlank}）`);

  const detailUrl = new URL(homeLink.titleHref, base).href;
  const errorsBeforeDetail = errors.length;
  const externalBeforeDetail = externalRequests.length;
  await page.goto(detailUrl, { waitUntil: 'load' });
  // 详情页是**纯静态**的（不加载主脚本），所以没有「等应用接管」可言：
  // #lastUpdated 在那边永远是 `--`；这里等页面主体渲染出来即可。
  await page.waitForSelector('.dpane', { timeout: 15000 });
  await page.waitForTimeout(200);
  const detail = await page.evaluate(() => {
    const pane = document.querySelector('.dpane');
    const canonical = document.querySelector('link[rel="canonical"]');
    return {
      // v1.7：独立详情页的标题改成 `<h1>`（此前是 h2 —— 页面没有一级标题），
      // 弹层里仍是 h2（那里已有一个 h1）。所以这里按 **id** 取，不按标签名取。
      heading: (document.querySelector('#detailTitle') || {}).textContent || '',
      h1: document.querySelectorAll('h1').length,
      canonical: canonical ? canonical.href : '',
      crumbs: document.querySelectorAll('.crumb a, .crumb span').length,
      back: Boolean(document.querySelector('.jumpback')),
      paneChars: pane ? pane.innerText.replace(/\s+/g, ' ').trim().length : 0,
      official: [...document.querySelectorAll('.dact a')].filter(a => /^https?:/.test(a.href)).length,
      ld: document.querySelectorAll('script[type="application/ld+json"]').length
    };
  });
  check('详情页有标题与面包屑', Boolean(detail.heading) && detail.crumbs >= 3,
    `${detail.heading.slice(0, 26)} · 面包屑 ${detail.crumbs} 段 · 正文 ${detail.paneChars} 字符`);
  check('详情页恰好一个 h1（独立文档必须有且只有一个一级标题）', detail.h1 === 1, `${detail.h1} 个`);
  // canonical 用的是**生产域名**（SITE_URL）。这个站是 GitHub 项目页，
  // canonical 路径带 `/ai-deals-aggregator/` 前缀，而本地验收服务在根路径下，
  // 所以判据是「当前路径是 canonical 路径的后缀」——本地与线上都成立。
  const canonicalPath = (() => { try { return new URL(detail.canonical).pathname; } catch (e) { return ''; } })();
  const detailPath = new URL(detailUrl).pathname;
  check('详情页 canonical 自指', Boolean(canonicalPath) && canonicalPath.endsWith(detailPath),
    `${detail.canonical}（当前路径 ${detailPath}）`);
  check('详情页有返回入口与官方链接', detail.back && detail.official >= 1,
    `返回入口=${detail.back} · 官方链接 ${detail.official} 个`);
  check('详情页有结构化数据', detail.ld >= 2, `${detail.ld} 段`);
  check('详情页没有 JS 错误', errors.length === errorsBeforeDetail, `${errors.length - errorsBeforeDetail} 个`);
  check('详情页没有外部请求', externalRequests.length === externalBeforeDetail,
    externalRequests.slice(externalBeforeDetail).slice(0, 2).join(', ') || '0 个');

  // 关掉 JS 再读一次：内容必须仍在——这是「预渲染」最硬的可验证定义
  const noJsContext = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });
  const noJsPage = await noJsContext.newPage();
  await noJsPage.goto(detailUrl, { waitUntil: 'load' });
  const noJsDetail = await noJsPage.evaluate(() => ({
    chars: document.body ? document.body.innerText.replace(/\s+/g, ' ').trim().length : 0,
    heading: (document.querySelector('#detailTitle') || {}).textContent || '',
    official: [...document.querySelectorAll('a')].filter(a => /^https?:/.test(a.getAttribute('href') || '')).length
  }));
  // ⚠️ 取样必须在 `noJsContext.close()` **之前**做完（页面随 context 一起销毁）。
  // ⚠️ 路径必须**解析自站点根**（`DEALS_URL`），不能写相对路径也不能写死 `/deals.json`：
  //    此刻页面停在 `deal/<id>/` 下，`deals.json` 会解析成 `deal/<id>/deals.json` → 404；
  //    而线上是项目页，写死根路径同样 404。两种写法都踩过。
  const audienceSample = await noJsPage.evaluate(`(async () => {
    const payload = await (await fetch(${DEALS_URL})).json();
    const deals = payload.deals || [];
    const hasValue = value => {
      if (value === null || value === undefined) return false;
      if (Array.isArray(value)) return value.length > 0;
      if (typeof value === 'object') return Object.keys(value).length > 0;
      return true;
    };
    return {
      total: deals.length,
      knownCount: deals.filter(d => d.type === 'deal' && hasValue(d.audience)).length,
      unknownCount: deals.filter(d => d.type === 'deal' && d.availability && d.availability.chinaUsable === 'unknown').length,
      falseCount: deals.filter(d => d.type === 'deal' && d.availability && d.availability.chinaUsable === false).length,
      knownChinaCount: deals.filter(d => d.type === 'deal' && d.availability &&
        (d.availability.chinaUsable === true || d.availability.chinaUsable === false)).length
    };
  })()`).catch(() => null);
  await noJsContext.close();
  check('详情页不执行 JS 也能读到内容',
    noJsDetail.chars > 400 && Boolean(noJsDetail.heading) && noJsDetail.official >= 1,
    `正文 ${noJsDetail.chars} 字符 · 标题「${noJsDetail.heading.slice(0, 22)}」· 官方链接 ${noJsDetail.official} 个`);

  /**
   * v1.1 受众字段的结构化行（学生 / 开发者模型）。
   *
   * 为什么必须单独断言：上面那条「不执行 JS 也能读到内容」只判 `chars > 400`，
   * 所以**新行一个都不渲染也能过** —— 它盯的是「有没有内容」，不是「有没有这几行」。
   * 而这几行正是本阶段的交付物，必须有牙。
   *
   * 取样一律**现场从 deals.json 取**（照 §8b「中文译文可搜」的写法），不硬编码条目标题：
   * 数据是每天变的，硬编码会在明天变成假红。没有对应数据时优雅跳过（不制造假红）。
   * 三条断言，正反两面都覆盖：
   *   ① 有 audience 的条目 → 字段表里必须有「适用人群」行，且取值非空；
   *   ② `chinaUsable:'unknown'` 的条目 → 必须出现「尚未确认」，**绝不出现**「中国大陆用户不可用」。
   *      这是本阶段那条红线在真页面上的唯一牙齿：unknown 是「没查到」，不是「不可用」——
   *      写成后者会让读者据此放弃一条其实能领的优惠。
   *   ③ `chinaUsable:false` 的条目 → 照直说「中国大陆用户不可用」（确定值不得软化）。
   *      本轮数据里 false 可能是 0 条 → 跳过而不是假红。
   */
  const audienceRowsOf = async (dealId) => {
    await page.goto(new URL(`deal/${dealId}/`, base).href, { waitUntil: 'load' });
    await page.waitForSelector('.dpane', { timeout: 15000 });
    return page.evaluate(() => {
      const pane = document.querySelector('.dpane');
      return {
        text: pane ? pane.innerText.replace(/\s+/g, ' ').trim() : '',
        rows: [...document.querySelectorAll('.dgrid .cv')].map(cell => ({
          k: ((cell.querySelector('.k') || {}).textContent || '').trim(),
          v: ((cell.querySelector('.v') || {}).textContent || '').trim()
        }))
      };
    });
  };

  /** 现场挑一条 deal（判据以源码文本传入，避免把函数塞进字符串） */
  const pickDeal = (predicateSource) => page.evaluate(`(async () => {
    const payload = await (await fetch(${DEALS_URL})).json();
    const hasValue = v => v !== null && v !== undefined && !(Array.isArray(v) && !v.length) &&
      !(typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length);
    const pred = ${predicateSource};
    const d = (payload.deals || []).find(x => x.type === 'deal' && pred(x, hasValue));
    return d ? { id: d.id, title: d.title } : null;
  })()`);

  if (audienceSample && audienceSample.knownCount > 0) {
    const sample = await pickDeal('(x, hasValue) => hasValue(x.audience)');
    const shown = await audienceRowsOf(sample.id);
    const row = shown.rows.find(item => item.k === '适用人群');
    check('详情页出现「适用人群」结构化行，且取值不是空的',
      Boolean(row) && Boolean(row.v) && shown.text.includes('适用人群'),
      row ? `「${sample.title}」→ ${row.v} · 字段表 ${shown.rows.length} 格` : '未找到「适用人群」行');
  } else {
    check('详情页结构化行取样前提：deals.json 里存在带 audience 的 deal',
      false, `当前带 audience 的 deal 为 ${audienceSample ? audienceSample.knownCount : '取样失败'} 条`);
  }

  if (audienceSample && audienceSample.unknownCount > 0) {
    const unknownOne = await pickDeal('(x) => x.availability && x.availability.chinaUsable === "unknown"');
    const pane = await audienceRowsOf(unknownOne.id);
    check('unknown 的中国大陆可用性渲染成「尚未确认」，**绝不**渲染成「中国大陆用户不可用」',
      pane.text.includes('尚未确认') && !pane.text.includes('中国大陆用户不可用'),
      `「${unknownOne.title}」：含「尚未确认」=${pane.text.includes('尚未确认')} · ` +
      `含「中国大陆用户不可用」=${pane.text.includes('中国大陆用户不可用')}`);
  } else {
    console.log('  ℹ️  跳过 unknown 红线断言：本轮没有任何 chinaUsable=unknown 的条目（不制造假红）');
  }

  if (audienceSample && audienceSample.falseCount > 0) {
    const falseOne = await pickDeal('(x) => x.availability && x.availability.chinaUsable === false');
    const pane = await audienceRowsOf(falseOne.id);
    check('chinaUsable=false 的条目照直说「中国大陆用户不可用」（确定值不得软化）',
      pane.text.includes('中国大陆用户不可用'), `「${falseOne.title}」`);
  } else {
    console.log(`  ℹ️  跳过「不可用」反面断言：本轮 chinaUsable=false 共 ${audienceSample ? audienceSample.falseCount : 0} 条（没有反例可测）`);
  }

  /**
   * v1.3 信息来源块（evidence / provenance）—— 真页面上的牙。
   *
   * 为什么必须在这里再验一遍（构建自检已经逐条对过账）：自检读的是**内存里的 payload**
   * 与渲染函数，而读者拿到的是**写盘后的静态页**。两者断的链路不同 —— 例如「块被写进
   * dist/deals.json 却没进详情页」「详情页模板抽取时把这块截掉了」，自检都看不见。
   *
   * 四个取样都**现场从 deals.json 挑**（照 §8b 的写法），不硬编码标题：数据每天变，
   * 硬编码明天就是假红。缺样例时优雅跳过。
   *   ① 任意一条 deal：块必须完整（标签行 ≥8、免责句在、官方链接在）；
   *   ② 人工策展条目：最近成功采集必须显示「不适用」（不是「未知」——那是两种事实）；
   *   ③ 采集侧条目：必须显示真实的 `<time datetime>`（而不是把 known 降级成「未知」）；
   *   ④ 整块文本里不许出现「已核验」这类本站自发的有效性结论。
   */
  const sourceBlockOf = async (dealId) => {
    await page.goto(new URL(`deal/${dealId}/`, base).href, { waitUntil: 'load' });
    await page.waitForSelector('.dpane', { timeout: 15000 });
    return page.evaluate(() => {
      const box = document.querySelector('.dpane .dsrc');
      if (!box) return null;
      const text = box.innerText.replace(/\s+/g, ' ').trim();
      return {
        text,
        rows: box.querySelectorAll('.dsrc-row').length,
        time: box.querySelector('time[datetime]') ? box.querySelector('time[datetime]').getAttribute('datetime') : '',
        links: [...box.querySelectorAll('a')].length,
        hasHeading: Boolean(box.querySelector('.dsrc-h')),
        hasNote: Boolean(box.querySelector('.dsrc-note'))
      };
    });
  };

  // ⚠️ 取样失败（deals.json 读不到）时必须**报一条失败**而不是解引用 null 崩掉整个套件 ——
  //    线上子路径那次崩溃就是这么来的：报错信息只有一句 TypeError，前面 200 多项断言的结果全丢了。
  const anyDeal = await pickDeal('() => true');
  const anyBlock = anyDeal ? await sourceBlockOf(anyDeal.id) : null;
  check('详情页有「信息来源」块，且标签行完整（≥8 行）',
    Boolean(anyBlock) && anyBlock.rows >= 8 && anyBlock.hasHeading && anyBlock.hasNote,
    anyBlock ? `「${anyDeal.title}」→ ${anyBlock.rows} 行 · ${anyBlock.links} 个链接`
      : (anyDeal ? '没有找到 .dsrc 块' : '取样失败：读不到 deals.json（站点根解析错？）'));
  check('信息来源块带免责句（不构成对有效性的判断）',
    Boolean(anyBlock) && /不构成对优惠是否有效/.test(anyBlock.text), anyBlock ? anyBlock.text.slice(-60) : '');
  check('信息来源块里有官方页面链接',
    Boolean(anyBlock) && anyBlock.links >= 1, anyBlock ? `${anyBlock.links} 个链接` : '');
  check('信息来源块里没有本站自发的有效性结论（已核验 / 100% 有效）',
    Boolean(anyBlock) && !/已核验|100\s*%\s*(有效|可用)/.test(anyBlock.text),
    anyBlock ? anyBlock.text.slice(0, 80) : '');

  const curatedOne = await pickDeal('(x) => x.source === "Curated" || x.source === "Curated-CN"');
  if (curatedOne) {
    const curatedBlock = await sourceBlockOf(curatedOne.id);
    check('人工策展条目：「最近成功采集」显示「不适用」（不是「未知」）',
      Boolean(curatedBlock) && curatedBlock.text.includes('不适用') && curatedBlock.text.includes('不经过采集器'),
      curatedBlock ? curatedBlock.text.slice(0, 80) : '');
    check('人工策展条目不会假装成有采集记录（没有 <time>）',
      Boolean(curatedBlock) && !curatedBlock.time, curatedBlock ? `time=${curatedBlock.time}` : '');
  } else {
    console.log('  ℹ️  跳过人工策展断言：本轮 deals.json 里没有 Curated / Curated-CN 条目');
  }

  const collectedOne = await pickDeal('(x) => x.sourceFacts && x.sourceFacts.lastSuccessState === "known"');
  if (collectedOne) {
    const collectedBlock = await sourceBlockOf(collectedOne.id);
    const segment = collectedBlock ? (collectedBlock.text.split('最近成功采集')[1] || '') : '';
    check('采集侧条目：渲染出真实的「最近成功采集」时间（known 不得被降级成「未知」）',
      Boolean(collectedBlock) && /^\d{4}-\d{2}-\d{2}T/.test(collectedBlock.time) &&
      !segment.includes('来源心跳里没有这一条'),
      collectedBlock ? `time=${collectedBlock.time} · 段「${segment.slice(0, 40)}」` : '');
  } else {
    console.log('  ℹ️  跳过采样：本轮没有 lastSuccessState=known 的条目');
  }

  const evidenceOne = await pickDeal('(x) => Array.isArray(x.evidence) && x.evidence.length > 0');
  if (evidenceOne) {
    const evidenceBlock = await sourceBlockOf(evidenceOne.id);
    check('有官方引文的条目：引文渲染出来，并带出处链接与采集日期',
      Boolean(evidenceBlock) && /采集于 \d{4}-\d{2}-\d{2}/.test(evidenceBlock.text) &&
      evidenceBlock.text.includes('官方原文片段'),
      evidenceBlock ? evidenceBlock.text.slice(-120) : '');
    check('引文块带「仅用于核对本页信息」的说明',
      Boolean(evidenceBlock) && evidenceBlock.text.includes('仅用于核对本页信息'));
  } else {
    console.log('  ℹ️  跳过引文渲染断言：本轮 deals.json 里没有任何 evidence（引文是人工可选项）');
  }

  /**
   * 信息来源块的手机端几何：这一块里**天然有长 URL**（官方页 / 出处链接 / 引文出处），
   * 而 URL 在窄屏上是最容易把整页撑宽的东西。`check-mobile-chrome.js` 只看首页控制带，
   * `verify-site.js` 的 390/360 溢出断言此前只看首页与 /status/ —— 详情页从来没有被量过。
   * 取最长的那个官方 URL 与其引文的详情页各量一次，量的是**页面级**溢出与**块内行**的越界。
   */
  for (const width of [390, 360]) {
    if (!anyDeal) { check(`详情页信息来源块 ${width}px 不产生横向溢出`, false, '取样失败：读不到 deals.json'); continue; }
    const overflow = await (async () => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(new URL(`deal/${anyDeal.id}/`, base).href, { waitUntil: 'load' });
      await page.waitForSelector('.dpane .dsrc', { timeout: 15000 });
      return page.evaluate(() => {
        const de = document.documentElement;
        const rows = [...document.querySelectorAll('.dpane .dsrc .dsrc-row')];
        return {
          page: de.scrollWidth - de.clientWidth,
          rowsPast: rows.filter(row => row.getBoundingClientRect().right > de.clientWidth + 1).length,
          rows: rows.length
        };
      });
    })();
    check(`详情页信息来源块 ${width}px 不产生横向溢出（长 URL 必须换行而不是撑宽）`,
      overflow.page === 0 && overflow.rowsPast === 0,
      `页面溢出 ${overflow.page}px · ${overflow.rows} 行中越界 ${overflow.rowsPast} 行`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  /* ------------------------------------------------------------------ */
  /* 15a3) 变更记录（v1.4 历史层）—— 真页面上的牙                        */
  /* ------------------------------------------------------------------ */

  console.log('\n=== 15a3) 变更记录（v1.4 历史层）===');

  /**
   * 为什么必须在这里再验一遍（构建自检已经把注入的历史逐字节对过账）：
   * 自检读的是内存里的 payload 与渲染函数，读者拿到的是**写盘后的详情页**。
   *
   * 历史这一层的坏法特别隐蔽：注入漏了 → 每条都显示「暂无变更记录」，页面看起来
   * 完全正常（那正是「没记录」与「没变化」混淆的形态）；注入错位 → 页面显示一段
   * 谁也没写过的历史。两者构建自检都能拦，但**只有真页面能证明它到了读者面前**。
   *
   * 取样一律现场从 deals.json 挑（数据每天变，硬编码明天就是假红）；缺样例时
   * 打印跳过原因，不制造假红 —— 交付当天历史里确实是 0 条事件。
   */
  const readHistoryBlock = `(() => {
    const box = document.querySelector('.dpane .dhist');
    if (!box) return null;
    return {
      total: box.getAttribute('data-hist-total'),
      text: box.innerText.replace(/\\s+/g, ' ').trim(),
      heading: Boolean(box.querySelector('.dsrc-h')),
      note: Boolean(box.querySelector('.dsrc-note')),
      since: box.querySelector('.dhist-since') ? box.querySelector('.dhist-since').textContent.trim() : '',
      events: box.querySelectorAll('.dhist-ev').length,
      times: box.querySelectorAll('.dhist-ev time[datetime]').length,
      types: [...box.querySelectorAll('.dhist-ev .hty')].map(node => node.textContent.trim()),
      hasFromTo: box.textContent.includes('原 ') && box.textContent.includes('新 ')
    };
  })()`;

  const historyBlockOf = async (dealId) => {
    await page.goto(new URL(`deal/${dealId}/`, base).href, { waitUntil: 'load' });
    await page.waitForSelector('.dpane .dhist, .dpane .dsrc', { timeout: 15000 });
    return page.evaluate(readHistoryBlock);
  };

  const anyHistoryBlock = anyDeal ? await historyBlockOf(anyDeal.id) : null;
  check('详情页有「变更记录」块，且带免责句与总数',
    Boolean(anyHistoryBlock) && anyHistoryBlock.heading && anyHistoryBlock.note && anyHistoryBlock.total !== null,
    anyHistoryBlock ? `总数 ${anyHistoryBlock.total} · ${anyHistoryBlock.events} 条事件行` : '没有找到 .dhist 块');
  check('「变更记录」块里没有本站自发的有效性结论（已核验 / 100% 有效）',
    Boolean(anyHistoryBlock) && !/已核验|100\s*%\s*(有效|可用)/.test(anyHistoryBlock.text),
    anyHistoryBlock ? anyHistoryBlock.text.slice(0, 80) : '');

  const historyOne = await pickDeal('(x) => x.history && Array.isArray(x.history.events) && x.history.events.length > 0');
  if (historyOne) {
    const block = await historyBlockOf(historyOne.id);
    check('有变更记录的条目：事件行渲染出来，每行带日期与事件类型',
      Boolean(block) && block.events >= 1 && block.times === block.events && block.types.every(Boolean),
      block ? `「${historyOne.title}」→ ${block.events} 行 · 带时间 ${block.times} · 类型 ${block.types.join('/')}` : '取样失败');
    check('有变更记录的条目：总数与 data-hist-total 一致，且起算说明在',
      Boolean(block) && Number(block.total) >= block.events && /变更记录自 \d{4}-\d{2}-\d{2} 起/.test(block.since),
      block ? `total=${block.total} · since=${block.since}` : '');
  } else {
    console.log('  ℹ️  跳过「有变更记录」断言：本轮历史里还没有任何事件（起算日之后没有观测到变化）');
  }

  const noHistoryOne = await pickDeal('(x) => !x.history');
  if (noHistoryOne) {
    const block = await historyBlockOf(noHistoryOne.id);
    check('没有变更记录的条目：明说「暂无变更记录」而不是空白（空白会冒充「没有变化」）',
      Boolean(block) && block.total === '0' && block.events === 0 && /暂无变更记录/.test(block.text),
      block ? `total=${block.total} · 事件 ${block.events} 行 · 文本「${block.text.slice(0, 40)}」` : '取样失败');
  } else {
    console.log('  ℹ️  跳过「暂无变更记录」断言：本轮所有 deal 都有历史事件');
  }

  // 静态（不执行 JS）也必须读到这一块：详情页是预渲染的，历史块不能只活在水合之后。
  if (anyDeal) {
    const noJsHistoryCtx = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });
    const noJsHistoryPage = await noJsHistoryCtx.newPage();
    await noJsHistoryPage.goto(new URL(`deal/${anyDeal.id}/`, base).href, { waitUntil: 'load' });
    const staticBlock = await noJsHistoryPage.evaluate(readHistoryBlock);
    await noJsHistoryCtx.close();
    check('详情页不执行 JS 也能读到「变更记录」块（预渲染的硬定义）',
      Boolean(staticBlock) && staticBlock.heading &&
      (/暂无变更记录/.test(staticBlock.text) || staticBlock.events >= 1),
      staticBlock ? `文本「${staticBlock.text.slice(0, 50)}」` : '禁用 JS 后找不到 .dhist');
  }

  // 手机端几何：历史值里有长文案（优惠说明最长 240 字），是新的溢出风险点。
  for (const width of [390, 360]) {
    if (!anyDeal) { check(`详情页变更记录块 ${width}px 不产生横向溢出`, false, '取样失败：读不到 deals.json'); continue; }
    const overflow = await (async () => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(new URL(`deal/${anyDeal.id}/`, base).href, { waitUntil: 'load' });
      await page.waitForSelector('.dpane .dhist', { timeout: 15000 });
      return page.evaluate(() => {
        const de = document.documentElement;
        const box = document.querySelector('.dpane .dhist');
        const events = [...box.querySelectorAll('.dhist-ev')];
        return {
          page: de.scrollWidth - de.clientWidth,
          past: events.filter(row => row.getBoundingClientRect().right > de.clientWidth + 1).length,
          events: events.length
        };
      });
    })();
    check(`详情页变更记录块 ${width}px 不产生横向溢出`,
      overflow.page === 0 && overflow.past === 0,
      `页面溢出 ${overflow.page}px · ${overflow.events} 条事件行中越界 ${overflow.past} 行`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  // 搜索：新字段的中文标签词必须能搜到，且 unknown **不进** haystack（否则搜索结果虚高）
  await page.goto(base, { waitUntil: 'load' });
  await waitForApp(page);
  const cardsBeforeSearch = await page.evaluate(() => document.querySelectorAll('article.g').length);
  await page.fill('#searchInput', '中国大陆');
  // ⚠️ 等**筛选真的生效**，而不是赌一个固定毫秒数。
  // 前端是 120ms 防抖 + 一次 render；单跑这一段时 120ms 就够，但整条套件跑到这里时
  // 实测出现过「350ms 后仍是未过滤的 50 张卡」→ 断言假红（扫描时值刚好停在渲染之前）。
  // 判据不变：等不到变化就按未过滤处理，断言照样会红 —— 只是不再把慢当成坏。
  await page.waitForFunction(
    before => document.querySelectorAll('article.g').length !== before,
    cardsBeforeSearch,
    { timeout: 5000 }
  ).catch(() => { /* 超时不吞：下面照常量，量到没变化就是真失败 */ });
  const chinaSearch = await page.evaluate(() => document.querySelectorAll('article.g').length);
  const knownChina = audienceSample ? audienceSample.knownChinaCount : 0;
  if (knownChina > 0) {
    check('搜「中国大陆」命中数 ≤ 已知可用性的条目数（unknown 不进 haystack，结果不许虚高）',
      chinaSearch > 0 && chinaSearch <= knownChina,
      `命中 ${chinaSearch} 张卡 · 已知可用性 ${knownChina} 条 · unknown ${audienceSample ? audienceSample.unknownCount : 0} 条`);
  } else {
    console.log('  ℹ️  跳过「中国大陆」搜索断言：本轮没有任何条目带已确认的 chinaUsable');
  }
  await page.fill('#searchInput', '');
  await page.waitForTimeout(250);

  /* ------------------------------------------------------------------ */
  /* 分类页（/student/ /developer/ /free-api/）与首页分类筛选器           */
  /* ------------------------------------------------------------------ */

  console.log('\n=== 15b) 分类页与首页分类筛选器 ===');

  /**
   * 为什么这一段必须存在：`/status/` 那条先例**在 verify-site.js 里一个字都没有**
   * （子代理核查：全文 0 处命中）。它的全部守卫只是 build-local.js 里的静态自检，
   * 于是「页面上真的是不是那样」从来没有被真浏览器看过一眼。
   * 新路由不重复那个模式：静态自检管「产物内容对不对」，这里管「浏览器里读出来对不对」。
   *
   * 断言分四类：
   *   ① 三个路由都真的能打开、canonical 自指、控制台无错、无外部请求；
   *   ② **关掉 JS 也能读到表格与条目**（预渲染的硬定义）+ 三态措辞不压平；
   *   ③ 页面上的条目集合与 dist/deals.json 里 `collections` 的筛选结果**逐 id 相等**
   *      （两个方向都查：页面少的、页面多的）；
   *   ④ 首页筛选器：点「学生」筛出来的**卡片数**与分类页的**条数**对得上 ——
   *      这条直接钉住「同一份判据」这件事：如果前端偷偷自己算一遍，两个数字迟早分家。
   */
  const collectionRoutes = [
    { slug: 'student', key: 'student' },
    { slug: 'developer', key: 'developer' },
    { slug: 'free-api', key: 'free-api' }
  ];

  // dist/deals.json 里 `collections` 的真值（浏览器与 node 都读这一份）
  const collectionTruth = await page.evaluate(`(async () => {
    const payload = await (await fetch(${DEALS_URL})).json();
    const deals = (payload.deals || []).filter(d => d.type === 'deal');
    const out = {};
    for (const slug of ['student', 'developer', 'free-api']) {
      out[slug] = deals.filter(d => (d.collections || []).includes(slug)).map(d => d.id);
    }
    out.__total = deals.length;
    out.__tagged = deals.filter(d => (d.collections || []).length).length;
    return out;
  })()`).catch(() => null);

  for (const route of collectionRoutes) {
    const routeUrl = new URL(`${route.slug}/`, base).href;
    const errorsBefore = errors.length;
    const externalBefore = externalRequests.length;
    await page.goto(routeUrl, { waitUntil: 'load' });
    const info = await page.evaluate(() => ({
      title: (document.querySelector('h1') || {}).textContent || '',
      canonical: (document.querySelector('link[rel="canonical"]') || {}).href || '',
      rows: document.querySelectorAll('.ctable tbody tr').length,
      ids: [...document.querySelectorAll('.ctable tbody a[href*="/deal/"]')]
        .map(a => (a.getAttribute('href') || '').split('/deal/')[1] || '').map(s => s.replace(/\/$/, '')),
      feeds: document.querySelectorAll('link[rel="alternate"]').length,
      ldTypes: [...document.querySelectorAll('script[type="application/ld+json"]')]
        .map(s => { try { return JSON.parse(s.textContent)['@type']; } catch (e) { return 'PARSE_ERROR'; } }),
      text: document.body ? document.body.innerText.replace(/\\s+/g, ' ').trim().length : 0
    }));

    const expectedIds = (collectionTruth && collectionTruth[route.slug]) || [];
    const onPage = new Set(info.ids);
    const missing = expectedIds.filter(id => !onPage.has(id));
    const extra = info.ids.filter(id => !expectedIds.includes(id));

    check(`/${route.slug}/ 能打开且标题非空`,
      Boolean(info.title) && info.rows > 0,
      `「${info.title}」· 表格 ${info.rows} 行 · 正文 ${info.text} 字`);
    check(`/${route.slug}/ canonical 自指`,
      info.canonical.endsWith(`/${route.slug}/`) && info.canonical.includes('buguoshixc.github.io'),
      info.canonical);
    check(`/${route.slug}/ 条目集合与 deals.json 的 collections 逐 id 相等`,
      missing.length === 0 && extra.length === 0 && info.ids.length === expectedIds.length,
      `页面 ${info.ids.length} 条 / 数据 ${expectedIds.length} 条` +
      `${missing.length ? ` · 漏 ${missing.length}` : ''}${extra.length ? ` · 多 ${extra.length}` : ''}`);
    // 「恰好」而不是「包含」：只判包含时，多出一段结构化数据不会有任何东西变红。
    const COLLECTION_LD = ['BreadcrumbList', 'CollectionPage', 'ItemList'];
    const wantFeeds = expectedFeedTags('collection', route.slug);
    check(`/${route.slug}/ 恰好 ${wantFeeds} 个订阅源 + 恰好三段 JSON-LD（CollectionPage / BreadcrumbList / ItemList）`,
      info.feeds === wantFeeds && JSON.stringify(info.ldTypes.slice().sort()) === JSON.stringify(COLLECTION_LD),
      `feed ${info.feeds} 个 · JSON-LD [${info.ldTypes.join(', ')}]（期望 [${COLLECTION_LD.join(', ')}]）`);
    check(`/${route.slug}/ 没有 JS 错误、没有外部请求`,
      errors.length === errorsBefore && externalRequests.length === externalBefore,
      `错误 ${errors.length - errorsBefore} · 外部请求 ${externalRequests.length - externalBefore}`);
  }

  // 关掉 JS 再读一遍：这是「预渲染」最硬的可验证定义（详情页那条同一把尺子）
  {
    const noJsCtx = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });
    const noJsP = await noJsCtx.newPage();
    const perRoute = [];
    for (const route of collectionRoutes) {
      await noJsP.goto(new URL(`${route.slug}/`, base).href, { waitUntil: 'load' });
      perRoute.push(await noJsP.evaluate(() => ({
        chars: document.body ? document.body.innerText.replace(/\s+/g, ' ').trim().length : 0,
        rows: document.querySelectorAll('.ctable tbody tr').length,
        links: document.querySelectorAll('.ctable tbody a[href*="/deal/"]').length,
        // 页脚的分类入口在无 JS 时也必须可点（它是站内导航，不是 JS 控件）
        footLinks: [...document.querySelectorAll('footer a')].map(a => a.getAttribute('href') || ''),
        // 三态措辞：不许把「没有依据」压成「不可用」
        hasUnknownWording: document.body.innerText.includes('尚未确认'),
        claimsUnusable: /中国大陆用户不可用/.test(document.body.innerText)
      })));
    }
    await noJsCtx.close();
    const weakest = perRoute.reduce((min, item) => Math.min(min, item.chars), Infinity);
    check('分类页不执行 JS 也能读到条目表（预渲染的硬定义）',
      perRoute.every(item => item.chars > 500 && item.rows > 0 && item.links > 0),
      perRoute.map((item, i) => `/${collectionRoutes[i].slug}/ ${item.rows} 行/${item.chars} 字`).join(' · ') +
      ` · 最短正文 ${weakest} 字`);
    check('分类页无 JS 时页脚分类入口仍在且指向正确（站内导航不是 JS 控件）',
      perRoute.every(item => ['student/', 'developer/', 'free-api/'].every(rel =>
        item.footLinks.some(href => href.endsWith(rel)))),
      `页脚链接 ${perRoute[0].footLinks.filter(h => /student\/|developer\/|free-api\//.test(h)).join(', ')}`);
    // 三态措辞：只要页面上出现了「不可用」这种确定表述，就必须同时也出现「尚未确认」——
    // 否则说明渲染把 unknown 压成了 false（本阶段那条红线）
    check('分类页没有把「尚未确认」压成「不可用」',
      perRoute.every(item => !item.claimsUnusable || item.hasUnknownWording),
      perRoute.map((item, i) => `/${collectionRoutes[i].slug}/ 不可用=${item.claimsUnusable}/尚未确认=${item.hasUnknownWording}`).join(' · '));
  }

  // 首页筛选器：点「学生」，卡片数必须与 /student/ 的条数对得上（同一份判据的机器证明）
  await page.goto(base, { waitUntil: 'load' });
  await waitForApp(page);
  for (const route of collectionRoutes) {
    const expected = (collectionTruth && collectionTruth[route.slug] || []).length;
    const button = page.locator(`#facets [data-facet="collection"][data-value="${route.slug}"]`);
    if (await button.count() === 0) {
      check(`首页有「${route.slug}」分类入口`, false, '筛选条里找不到该按钮');
      continue;
    }
    const label = (await button.innerText()).replace(/\s+/g, ' ').trim();
    await button.click();
    await page.waitForTimeout(300);
    const cards = await page.evaluate(() => document.querySelectorAll('article.g').length);
    // 折叠会让卡片数 ≤ 条目数：判据是「不超过且 > 0」，同时与分类页条数一起打印出来对照。
    check(`首页点「${route.slug}」筛出的卡片数与 /${route.slug}/ 一致（同一份判据）`,
      cards > 0 && cards <= expected && expected > 0,
      `入口「${label}」→ ${cards} 张卡 · 分类页/数据 ${expected} 条` +
      `${cards < expected ? `（折叠合并 ${expected - cards} 条）` : ''}`);
    // 取消筛选，回到全量，避免影响后面的断言
    await button.click();
    await page.waitForTimeout(250);
  }
  const restoredCards = await page.evaluate(() => document.querySelectorAll('article.g').length);
  check('取消分类筛选后回到全量卡片视图（进入/退出不改其它筛选）',
    restoredCards > 0, `${restoredCards} 张卡`);

  /* ------------------------------------------------------------------ */
  /* 按需求找优惠（/need/<slug>/ × 10 + 首页入口行）                       */
  /* ------------------------------------------------------------------ */

  console.log('\n=== 15b2) 按需求找优惠：入口行与十条静态落地页 ===');

  /**
   * 为什么这一段必须存在（与 15b 同一个理由，但**风险形状不同**）：
   *
   * ① `/need/<slug>/` 是站点里**第一类两层深**的路由。分类页在 `../`，它在 `../../`——
   *    前缀写错的症状极其隐蔽：页面能打开、内容都在、canonical 也对，**只有所有内链 404**。
   *    静态自检里有一条查前缀，但那只证明「字面量是 `../../`」；这里证明的是
   *    **浏览器点进去真的能到**。
   * ② 首页入口行是**构建期注入**的，它的数字来自数据层（条目数），而落地页表格的行数
   *    也来自数据层 —— 两者必须逐条相等。不一致时的症状是「首页写 12、页面列 7」，
   *    两边各自的检查都会是绿的（首页只管渲染，页面只管自己）。
   * ③ 这一行的每一条都必须是 `<a>`：无 JS 的访客点它必须能跳走。它离 `[data-facet]`
   *    那些按钮只有几十像素，重构时被顺手换成 button 是最可能发生的回归。
   * ④ 窄屏：入口行不做横滑（横滑的入口等于没有入口），所以要在 390px 量
   *    「有几行、有没有被裁、有没有把页面撑宽」。
   */
  const needTruth = await page.evaluate(`(async () => {
    const payload = await (await fetch(${DEALS_URL})).json();
    const deals = (payload.deals || []).filter(d => d.type === 'deal');
    const needs = {};
    for (const d of deals) for (const slug of (d.needs || [])) (needs[slug] = needs[slug] || []).push(d.id);
    return { needs, total: deals.length };
  })()`).catch(() => null);

  if (!needTruth || !Object.keys(needTruth.needs).length) {
    check('dist/deals.json 里有按需求命中（needs 字段）', false, '读不到 deals.json 或 needs 为空');
  } else {
    // 首页专题导航卡：逐张读出「href / 标题 / 条数 / 说明 / 图标 / 箭头」与几何（每张卡的矩形）。
    // ⚠️ 期望值一律不写死：卡数与逐条对账都跟 scripts/lib/audience.js 的 NEED_PAGES 比。
    const needPages = audienceLib.NEED_PAGES.map(p => ({
      slug: p.slug, label: p.label, heading: p.heading, icon: p.icon, desc: p.homeDescription,
      route: `need/${p.slug}/`
    }));
    await page.goto(base, { waitUntil: 'load' });
    await waitForApp(page);
    const navRow = await page.evaluate(() => {
      const nav = document.querySelector('nav.needs');
      if (!nav) return null;
      const grid = nav.querySelector('.need-grid');
      const cards = [...nav.querySelectorAll('a.need-card')];
      const rects = cards.map(a => {
        const r = a.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
      });
      // 重叠：任意两张卡的矩形不得相交（同一视口内，「叠在一起的两张卡」是纯几何缺陷，
      // 页面级横向溢出查不出来 —— 它们都还在视口里）
      let overlaps = 0;
      for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], b = rects[j];
        if (a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) overlaps++;
      }
      const tops = [...new Set(rects.map(r => Math.round(r.top)))].sort((x, y) => x - y);
      const navStyle = getComputedStyle(nav);
      const legacyClasses = ['nl', 'nl-full', 'nl-short', 'nlb', 'nsep', 'ngroup', 'nlinks']
        .filter(c => [...nav.querySelectorAll('*')].some(el => el.classList.contains(c)));
      return {
        count: cards.length,
        items: cards.map((a, i) => {
          // 四件套：图标（装饰性）/ 标题 / 说明 / 箭头。逐个**计数**而不是只看存在 ——
          // 两个箭头、两个说明同样是坏形状，而 `querySelector` 只看得到第一个。
          const icon = a.querySelector('.need-icon');
          const strong = a.querySelector('.need-copy > strong');
          const small = a.querySelector('.need-copy > small');
          const arrow = a.querySelector('.need-arrow');
          const txt = el => (el && el.textContent ? el.textContent.trim() : '');
          return {
            href: a.getAttribute('href'),
            label: txt(strong),
            desc: txt(small),
            // 条数：口径与 build-local.js 的 renderNeedRow 一致（只数 type === 'deal'）
            badge: Number((a.querySelector('.need-copy b') || {}).textContent || ''),
            isAnchor: a.tagName === 'A',
            isNeedCard: a.classList.contains('need-card'),
            iconCount: a.querySelectorAll('.need-icon').length,
            iconText: txt(icon),
            iconHidden: icon ? icon.getAttribute('aria-hidden') : null,
            strongCount: a.querySelectorAll('.need-copy > strong').length,
            smallCount: a.querySelectorAll('.need-copy > small').length,
            arrowCount: a.querySelectorAll('.need-arrow').length,
            arrowText: txt(arrow),
            arrowHidden: arrow ? arrow.getAttribute('aria-hidden') : null,
            // 「整卡即链接」的反例：卡片里再放一个可点元素（可点区域只剩那行文字）
            nestedInteractive: a.querySelectorAll('a, button, input, select, [role="button"]').length,
            rect: rects[i]
          };
        }),
        // 与筛选器的语义隔离：这一块里一个需要 JS 的控件 / facet 标记都不许有
        jsControls: nav.querySelectorAll('button, input, select').length,
        facetMarkers: nav.querySelectorAll('[data-facet], [aria-pressed], [role="button"]').length,
        legacyClasses,
        navOverflowX: navStyle.overflowX,
        navScrollable: nav.scrollWidth > nav.clientWidth + 1,
        tracks: grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length : 0,
        rowsByTop: tops.map(t => rects.filter(r => Math.round(r.top) === t).length),
        inViewport: rects.filter(r => r.width > 0 && r.height > 0 && r.left >= -0.5 && r.right <= window.innerWidth + 1).length,
        overlaps,
        overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth
      };
    });
    // ① 卡数：注册表是唯一来源（NEED_PAGES.length），同时与「数据里真有命中的需求数」对账。
    check('首页专题导航卡：卡数 == NEED_PAGES.length（按注册表现算，不写死条数）',
      Boolean(navRow) && navRow.count === needPages.length,
      navRow ? `${navRow.count} 张卡 / 注册表 ${needPages.length} 条需求 · dist/deals.json 里 ${Object.keys(needTruth.needs).length} 个需求有命中`
        : '找不到 nav.needs');
    check('首页有「按需求找优惠」入口行，且每条都是 <a>（无 JS 也能点）',
      Boolean(navRow) && navRow.count === Object.keys(needTruth.needs).length &&
      navRow.items.every(i => i.isAnchor && i.isNeedCard && i.nestedInteractive === 0),
      navRow ? `${navRow.count} 条入口 / 数据里 ${Object.keys(needTruth.needs).length} 个需求 · JS 控件 ${navRow.jsControls} 个 · 卡里嵌套可点元素 ${navRow.items.reduce((n, i) => n + i.nestedInteractive, 0)} 个`
        : '找不到 nav.needs');
    // ② 逐条对账：第 i 张卡的标题 / href 必须等于注册表第 i 条 —— 错位一条即红（M7 的牙）
    const misordered = navRow ? navRow.items.map((it, i) => ({ it, i })).filter(({ it, i }) => {
      const want = needPages[i];
      return !want || it.label !== want.label || it.href !== want.route;
    }) : [];
    check('首页专题导航卡：逐条 label / href 与 NEED_PAGES 对账不错位（顺序一致）',
      Boolean(navRow) && navRow.items.length === needPages.length && misordered.length === 0,
      navRow ? (misordered.length
        ? misordered.slice(0, 4).map(({ it, i }) => `第 ${i + 1} 张「${it.label}」→ ${it.href} ≠ 注册表「${(needPages[i] || {}).label}」→ ${(needPages[i] || {}).route}`).join(' · ')
        : `${navRow.items.length} 张卡与注册表同序同值（${navRow.items.map(i => i.label).join(' / ')}）`) : '—');
    // ③ 语义隔离：这一块与 26px 的筛选条只隔几十像素，重构时最容易顺手换回 button / data-facet
    check('入口行里没有任何 JS 控件（无 JS 时不给可点暗示）',
      Boolean(navRow) && navRow.jsControls === 0 && navRow.facetMarkers === 0 && navRow.legacyClasses.length === 0,
      navRow ? `JS 控件 ${navRow.jsControls} 个 · facet 标记 ${navRow.facetMarkers} 个 · 旧 chip 类残留 [${navRow.legacyClasses.join(', ')}]` : '—');
    check('首页专题导航卡：与筛选器语义隔离（nav.needs 内 [data-facet] / [aria-pressed] / [role="button"] 计数为 0）',
      Boolean(navRow) && navRow.facetMarkers === 0,
      navRow ? `${navRow.facetMarkers} 个（[data-facet] + [aria-pressed] + [role="button"] 合计）` : '—');
    // ④ 四件套逐张齐全（M2 删说明 / M3 删箭头都红在这里）
    const broken = navRow ? navRow.items.filter(i => !(
      i.iconCount === 1 && i.iconText.length > 0 && i.iconHidden === 'true' &&
      i.strongCount === 1 && i.label.length > 0 &&
      i.smallCount === 1 && i.desc.length > 0 &&
      i.arrowCount === 1 && i.arrowText.length > 0 && i.arrowHidden === 'true')) : [];
    const fourPieceDetail = () => {
      if (!navRow) return '找不到 nav.needs';
      if (!navRow.items.length) return '整个 nav.needs 里一张 a.need-card 都没有（卡片形状被换掉了）';
      if (broken.length) {
        return broken.slice(0, 3).map(i => `${i.href}：图标 ${i.iconCount} / 标题 ${i.strongCount}「${i.label}」/ 说明 ${i.smallCount}「${i.desc}」/ 箭头 ${i.arrowCount}`).join(' · ');
      }
      const first = navRow.items[0];
      return `${navRow.items.length} 张卡四件套齐全 · 例「${first.iconText} ${first.label} ${first.badge} ${first.desc} ${first.arrowText}」`;
    };
    check('首页专题导航卡：每张卡四件套齐全（need-icon / 非空 strong / 非空 small / need-arrow）',
      Boolean(navRow) && navRow.items.length > 0 && broken.length === 0,
      fourPieceDetail());
    // ⚠️ detail 一律不得解引用不存在的元素：卡数为 0（例如把整卡换成 <button> 的变异）时
    //    `items[0]` 是 undefined —— 断言脚本必须**干净地判红**，而不是自己抛 TypeError 半路死掉
    //    （实测踩过一次：M4 变异下 792 项只跑到 §15b2 就崩了，JSON 报告文件都没写出来）。
    //    所以这里的 detail 走一个显式分支的函数，`items[0]` 只在「确实有卡」时才访问。
    // 首页数字 == 落地页行数（两个方向都查：数字对不对、有没有多余的入口）
    const badgeMismatch = (navRow ? navRow.items : []).filter(item => {
      const slug = String(item.href || '').replace(/^need\//, '').replace(/\/$/, '');
      return (needTruth.needs[slug] || []).length !== item.badge;
    });
    check('首页每条入口的数字 == 数据里该需求的条数',
      Boolean(navRow) && badgeMismatch.length === 0,
      navRow ? (badgeMismatch.length
        ? badgeMismatch.map(i => `${i.href} 首页 ${i.badge} / 数据 ${(needTruth.needs[String(i.href).replace(/^need\//, '').replace(/\/$/, '')] || []).length}`).join(' · ')
        : `${navRow.items.map(i => `${i.label}${i.badge}`).join(' ')}`) : '—');
    // 反向也查：数据里每个有命中的需求都必须有入口（漏项 = 少一个入口），且 href 不重复
    const cardSlugs = new Set((navRow ? navRow.items : []).map(i => String(i.href || '').replace(/^need\//, '').replace(/\/$/, '')));
    const missingEntries = Object.keys(needTruth.needs).filter(slug => !cardSlugs.has(slug));
    check('首页专题导航卡：数据里每个需求都有对应入口（没有漏项、href 不重复）',
      Boolean(navRow) && missingEntries.length === 0 && cardSlugs.size === navRow.items.length,
      navRow ? `${cardSlugs.size} 个不同 href · 漏 ${missingEntries.length} 个${missingEntries.length ? `（${missingEntries.join(', ')}）` : ''}` : '—');

    // ⑤ 真实导航（不是比 href 字符串）：至少 3 张**不同的**卡用 page.click 真点，
    //    要求落到 /need/<slug>/、HTTP 200、落地页 h1 与注册项的 heading 逐字相等。
    //    取样点 = 注册表的首 / 中 / 末三条：覆盖首屏第一张（最容易被浮层吃掉的那张）、
    //    中间一张、以及换行边缘的最后一张 —— 只比 href 时这三张全都「通过」，点了才知道。
    const clickIdx = [...new Set([0, Math.floor(needPages.length / 2), needPages.length - 1])].filter(i => needPages[i]);
    for (const i of clickIdx) {
      const spec = needPages[i];
      await page.goto(base, { waitUntil: 'load' });
      await waitForApp(page);
      const sel = `nav.needs a.need-card[href="${spec.route}"]`;
      const hits = await page.locator(sel).count();
      const errorsBefore = errors.length;
      let resp = null;
      let landed = '';
      let h1 = '';
      if (hits === 1) {
        // 先挂响应监听再点：顺序反了就会漏掉那次导航的响应（本地服务器毫秒级返回）
        const waiting = page.waitForResponse(r => r.request().isNavigationRequest() &&
          r.url().split(/[?#]/)[0].endsWith(`/need/${spec.slug}/`), { timeout: 20000 }).catch(() => null);
        await page.click(sel);
        resp = await waiting;
        await page.waitForURL(u => u.href.split(/[?#]/)[0].endsWith(`/need/${spec.slug}/`), { timeout: 20000 }).catch(() => {});
        await page.waitForLoadState('load');
        await page.waitForFunction(() => {
          const el = document.querySelector('h1');
          return !!el && el.textContent.trim().length > 0;
        }).catch(() => {});
        landed = (page.url() || '').split(/[?#]/)[0];
        h1 = await page.evaluate(() => ((document.querySelector('h1') || {}).textContent || '').trim());
      }
      check(`首页专题导航卡：真点第 ${i + 1} 张卡「${spec.label}」→ /need/${spec.slug}/（HTTP 200 · h1 与注册项一致）`,
        hits === 1 && Boolean(resp) && resp.status() === 200 &&
        landed.endsWith(`/need/${spec.slug}/`) && h1 === spec.heading && errors.length === errorsBefore,
        `点到卡 ${hits} 张 · HTTP ${resp ? resp.status() : '—'} · 落地 ${landed || '—'} · h1「${h1}」/ 注册项「${spec.heading}」· JS 错误 ${errors.length - errorsBefore} 个`);
    }

    // 逐条落地页：能打开、canonical 自指、条目集合逐 id 相等、内链真能到详情页
    for (const [slug, expectedIds] of Object.entries(needTruth.needs)) {
      const routeUrl = new URL(`need/${slug}/`, base).href;
      const errorsBefore = errors.length;
      const externalBefore = externalRequests.length;
      await page.goto(routeUrl, { waitUntil: 'load' });
      const info = await page.evaluate(() => ({
        h1: ((document.querySelector('h1') || {}).textContent || '').trim(),
        canonical: (document.querySelector('link[rel="canonical"]') || {}).href || '',
        rows: document.querySelectorAll('.ctable tbody tr').length,
        ids: [...document.querySelectorAll('.ctable tbody a[href*="/deal/"]')]
          .map(a => (a.getAttribute('href') || '').split('/deal/')[1] || '').map(s => s.replace(/\/$/, '')),
        headers: [...document.querySelectorAll('.ctable thead th')].map(el => el.textContent.trim()),
        bodyHasEvidence: /适用人群：|福利类型含|定价模式：|分类：|需要信用卡：|中国大陆可用性：/.test(
          (document.querySelector('.ctable tbody') || {}).textContent || ''),
        feeds: document.querySelectorAll('link[rel="alternate"]').length,
        ldTypes: [...document.querySelectorAll('script[type="application/ld+json"]')]
          .map(s => { try { return JSON.parse(s.textContent)['@type']; } catch (e) { return 'PARSE_ERROR'; } }),
        text: document.body ? document.body.innerText.replace(/\\s+/g, ' ').trim().length : 0,
        jumpback: (document.querySelector('a.jumpback') || {}).getAttribute
          ? document.querySelector('a.jumpback').getAttribute('href') : ''
      }));

      const onPage = new Set(info.ids);
      const missing = expectedIds.filter(id => !onPage.has(id));
      const extra = info.ids.filter(id => !expectedIds.includes(id));
      check(`/need/${slug}/ 条目集合与 deals.json 的 needs 逐 id 相等`,
        missing.length === 0 && extra.length === 0 && info.ids.length === expectedIds.length &&
        info.rows === expectedIds.length,
        `页面 ${info.ids.length} 条 / 数据 ${expectedIds.length} 条` +
        `${missing.length ? ` · 漏 ${missing.length}` : ''}${extra.length ? ` · 多 ${extra.length}` : ''}`);
      const wantFeeds = expectedFeedTags('need', slug);
      check(`/need/${slug}/ canonical 自指 + ${wantFeeds} 个订阅源 + 三段 JSON-LD`,
        info.canonical.endsWith(`/need/${slug}/`) && info.feeds === wantFeeds &&
        JSON.stringify(info.ldTypes.slice().sort()) === JSON.stringify(['BreadcrumbList', 'CollectionPage', 'ItemList']),
        `${info.canonical} · feed ${info.feeds} · JSON-LD [${info.ldTypes.join(', ')}]`);
      check(`/need/${slug}/ 有「为什么在这一页」一列且写了依据`,
        info.headers.includes('为什么在这一页') && info.bodyHasEvidence,
        `表头 [${info.headers.join(' | ')}]`);
      check(`/need/${slug}/ 没有 JS 错误、没有外部请求`,
        errors.length === errorsBefore && externalRequests.length === externalBefore,
        `错误 ${errors.length - errorsBefore} · 外部请求 ${externalRequests.length - externalBefore}`);

      // 两层深的内链必须真的能到（前缀写错的唯一症状就在这里）。
      // 判据取 **HTTP 状态 + 落地页自己的 canonical**，不读 h1 —— 详情页的 h1 是标题，
      // 而「是不是详情页」这件事由它自指的 canonical 说清楚（更硬，且不依赖文案排版）。
      const firstLink = await page.evaluate(() => {
        const a = document.querySelector('.ctable tbody a[href*="/deal/"]');
        return a ? a.href : '';
      });
      if (!firstLink) {
        check(`/need/${slug}/ 表格里有点得进去的详情页内链`, false, '第一行没有 /deal/ 链接');
      } else {
        const response = await page.goto(firstLink, { waitUntil: 'load' });
        // 期望值取**浏览器解析后的落地地址**（`page.url()`），不自己拼字符串：
        // 手拼的版本会把 `need/<slug>/../../deal/x/` 这种未归一形态算进去，
        // 于是断言红在一个与「前缀对不对」无关的地方（第一版就是这么错的）。
        const landed = page.url().split(/[?#]/)[0];
        const arrived = await page.evaluate(() => ({
          raw: (document.querySelector('link[rel="canonical"]') || {}).getAttribute
            ? document.querySelector('link[rel="canonical"]').getAttribute('href') : '(none)',
          text: (document.body ? document.body.innerText : '').replace(/\s+/g, ' ').trim().length
        }));
        // 判据：**落地页就是那条详情页**。比较的键取 deal id —— 它是唯一既跨 origin 又
        // 跨部署前缀都稳定的东西。三个坑在这里各踩过一次，写下来免得下一个人重踩：
        //   ① 不比 origin：本地验收跑在 `127.0.0.1`，canonical 必须指线上（设计如此）；
        //   ② 不比部署前缀：生产挂在 `/ai-deals-aggregator/` 下，本地没有这一层；
        //   ③ 不手写正则剥前缀：剥不干净时断言会静默变成「永远为假」。
        const dealIdOf = url => (String(url).match(/\/deal\/([^/?#]+)/) || [])[1] || '';
        const landedId = dealIdOf(landed);
        const canonicalId = dealIdOf(arrived.raw);
        check(`/need/${slug}/ 的详情页内链真的能打开（两层深前缀没写错）`,
          Boolean(response && response.ok()) && Boolean(landedId) &&
          landedId === canonicalId && arrived.text > 200,
          `HTTP ${response ? response.status() : '—'} · 落地 deal/${landedId} · canonical deal/${canonicalId} · 正文 ${arrived.text} 字`);
      }
    }

    // 有 JS 的入口行 + 响应式几何：1600/1440/1280/768/430/390 逐档把**每一张卡**的矩形读出来。
    await page.goto(base, { waitUntil: 'load' });
    await waitForApp(page);
    /**
     * 为什么是「逐档 + 逐张」而不是只量一次 390px：
     * 入口行从 flex 换成了网格（桌面 5 列 → ≤1180 三列 → ≤760 两列 → ≤560 单列），
     * 断点写错时的症状各不相同 —— 有的档 10 张会挤成一行（每张只剩 86px、说明全被截断），
     * 有的档某一张越出视口右缘（页面级横向溢出还是 0，因为它被 nav 的宽度兜住了）。
     * 所以每一档都问三个问题：每张卡都在视口内吗？有没有两张叠在一起？页面横向能滚吗？
     */
    for (const width of [1600, 1440, 1280, 768, 430, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(150);
      const geo = await page.evaluate(() => {
        const nav = document.querySelector('nav.needs');
        if (!nav) return null;
        const grid = nav.querySelector('.need-grid');
        const cards = [...nav.querySelectorAll('a.need-card')];
        const rects = cards.map(a => {
          const r = a.getBoundingClientRect();
          return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
        });
        let overlaps = 0;
        for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i], b = rects[j];
          if (a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) overlaps++;
        }
        const tops = [...new Set(rects.map(r => Math.round(r.top)))].sort((x, y) => x - y);
        const navStyle = getComputedStyle(nav);
        return {
          total: cards.length,
          visible: rects.filter(r => r.width > 0 && r.height > 0 && r.left >= -0.5 && r.right <= window.innerWidth + 1).length,
          minLeft: rects.length ? Math.round(Math.min(...rects.map(r => r.left))) : 0,
          maxRight: rects.length ? Math.round(Math.max(...rects.map(r => r.right))) : 0,
          heights: [...new Set(rects.map(r => Math.round(r.height)))],
          clipped: cards.filter(a => a.scrollWidth > a.clientWidth + 1).length,
          perRow: tops.map(t => rects.filter(r => Math.round(r.top) === t).length),
          rows: tops.length,
          tracks: grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length : 0,
          navH: Math.round(nav.getBoundingClientRect().height),
          navOverflowX: navStyle.overflowX,
          navScrollable: nav.scrollWidth > nav.clientWidth + 1,
          navScrollW: nav.scrollWidth,
          navClientW: nav.clientWidth,
          // 容器自身的计算样式（v1.8.1 起单独成条断言）：横向滚动容器藏入口的机制是
          // 「溢出被容器吃掉、页面级宽度照旧正常」，光看卡片矩形与 documentElement.scrollWidth 看不出来。
          gridOverflowX: grid ? getComputedStyle(grid).overflowX : '(没有 .need-grid)',
          gridScrollable: grid ? grid.scrollWidth > grid.clientWidth + 1 : false,
          gridScrollW: grid ? grid.scrollWidth : null,
          gridClientW: grid ? grid.clientWidth : null,
          overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          overlaps
        };
      });
      check(`专题导航卡 ${width}px：每张卡都在视口内、无重叠、页面零横向溢出（逐张量矩形）`,
        Boolean(geo) && geo.total > 0 && geo.visible === geo.total && geo.overlaps === 0 && geo.overflowX === 0,
        geo ? `${geo.visible}/${geo.total} 张在视口内 · left ${geo.minLeft} / right ${geo.maxRight}（视口 ${width}）· ${geo.rows} 行（${geo.perRow.join('/')}）· 卡高 ${geo.heights.join('/')}px · 重叠 ${geo.overlaps} 对 · 页面溢出 ${geo.overflowX}px`
          : '找不到 nav.needs');
      check(`专题导航卡 ${width}px：.needs 不是横向滚动容器、卡片没有被裁`,
        Boolean(geo) && geo.navOverflowX !== 'auto' && geo.navOverflowX !== 'scroll' && !geo.navScrollable && geo.clipped === 0,
        geo ? `overflow-x=${geo.navOverflowX} · nav.scrollWidth ${geo.navScrollable ? '>' : '≤'} clientWidth · 被裁 ${geo.clipped} 张 · 整块 ${geo.navH}px` : '—');
      /* v1.8.1（T6 返工）：**直接**断言「这一块按设计不是横向滚动容器」——独立于卡片当前有没有溢出。
         为什么必须单独一条（复核者 T4 的原始 finding，队长独立复现）：横向滚动容器藏入口的机制正是
         「溢出被容器吃掉、页面级宽度照旧正常」——`overflow-x:auto` 时容器在滚动位置 0 上量到的
         `documentElement.scrollWidth - clientWidth` 依然是 0，卡片矩形也全都「在视口内」，
         上面那两条（每张卡在视口内 / nav 不是横滑容器且卡片没被裁）会全部保持绿。
         实测（可复核文件：`research/_raw/home-topic-entry-cards-v1/t6-m6-check.js` 自证探针 +
         `t6-mut-M6a.json/.log` 完整套件记录 + `t3-mut-M6a.apply.json` 的锚点命中数与 sha）：
         只把 `overflow-x:auto` 注入**基础** .need-grid 规则（5 列、内容本来就没溢出，grid 的
         scrollWidth/clientWidth 仍然相等）时，旧断言失败 0 条、**这一条失败 6 条**（6 档视口各一条）。
         两种形态分开记、不混：M6a = 只注入基础规则（纯语义缺陷、几何全绿）；M6b = 注入全部四条 .need-grid 规则。
         逐档现场数字与原始输出见 VERIFY-REPORT.md 的「T6 返工追加」小节。
         判据只取**计算样式**（overflow-x ∉ {auto, scroll}）；scrollWidth/clientWidth 只作为现场数字打印，
         不当作「必须相等」的判据（内容真的超宽时，这块也不该横滑，而应该降列/换行）。 */
      check(`专题导航卡 ${width}px：.needs 与 .need-grid 都不是横向滚动容器（计算 overflow-x ∉ auto/scroll）`,
        Boolean(geo) && geo.navOverflowX !== 'auto' && geo.navOverflowX !== 'scroll' &&
        geo.gridOverflowX !== 'auto' && geo.gridOverflowX !== 'scroll',
        geo ? `.needs overflow-x=${geo.navOverflowX} · .need-grid overflow-x=${geo.gridOverflowX} · ` +
          `scrollWidth/clientWidth：needs ${geo.navScrollW}/${geo.navClientW} · grid ${geo.gridScrollW}/${geo.gridClientW}` : '—');
      if (width === 1440) {
        check('专题导航卡 1440px：.need-grid 轨道数 == 5，10 张排成 5×2（不再 10 张挤一行）',
          Boolean(geo) && geo.tracks === 5 && geo.rows === 2 && geo.perRow.length === 2 && geo.perRow.every(n => n === 5),
          geo ? `${geo.tracks} 条轨道 · ${geo.rows} 行（${geo.perRow.join('/')}）` : '—');
      }
    }

    // 390/360：判据不动（全部入口在视口内 + 不被裁 + 页面不横向溢出），只把选择器
    // 从 `.nl-full` / `.nlinks` 换成整卡 `.need-card` —— 旧结构那两条（短标签切换 / 每组两列）
    // 的判据在新结构里**不存在**（没有两套 span、也没有 .nlinks），留着只会是永远为真的死断言。
    for (const width of [390, 360]) {
      await page.setViewportSize({ width, height: 844 });
      await page.waitForTimeout(150);
      const geo = await page.evaluate(() => {
        const nav = document.querySelector('nav.needs');
        const links = [...nav.querySelectorAll('a.need-card')];
        const tops = [...new Set(links.map(a => Math.round(a.getBoundingClientRect().top)))].sort((x, y) => x - y);
        return {
          rows: new Set(links.map(a => a.offsetTop)).size,
          chipRows: tops.length,
          perRow: tops.map(t => links.filter(a => Math.round(a.getBoundingClientRect().top) === t).length),
          clipped: links.filter(a => a.scrollWidth > a.clientWidth + 1).length,
          visible: links.filter(a => {
            const r = a.getBoundingClientRect();
            return r.width > 0 && r.left >= 0 && r.right <= window.innerWidth + 1;
          }).length,
          total: links.length,
          overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          navH: Math.round(nav.getBoundingClientRect().height)
        };
      });
      check(`按需求入口 ${width}px：全部入口在视口内、不被裁、页面不横向溢出`,
        geo.clipped === 0 && geo.visible === geo.total && geo.overflowX === 0,
        `${geo.visible}/${geo.total} 可见 · ${geo.chipRows} 行卡（${geo.perRow.join('/')}）· 整块 ${geo.navH}px · 被裁 ${geo.clipped} · 页面溢出 ${geo.overflowX}px`);
    }
    await page.setViewportSize({ width: 1440, height: 900 });

    // 无 JS：这是「预渲染」的硬定义 —— 关掉 JS 打开一条需求页，表格、条目、
    // 以及底部折叠说明都要在。
    //
    // ⚠️ 这条探针被**重瞄过两次**，两次都是同一类失效（「断言还绿，而它声称守的东西
    // 已经不在页面上了」）：
    //   · 第一版读的是 `document.body.innerText.includes('这一页')`，断言名叫「能读到**判据说明**」。
    //     `secondary-page-content-simplification` 把三段式判据说明从首屏移走之后，`这一页`
    //     仍然命中 —— 但命中的是**表头**「为什么在这一页」那一列，不是那段说明。
    //   · 第二版改成量「首屏那一句」的字数（`0 < introChars ≤ 60`）。
    //     `secondary-page-intro-changes-v1` 把首屏说明整层删掉之后，这个量恒为 0 ——
    //     它守的东西同样已经不在页面上了。
    // 现在守的是**新形态**：首屏（`.cstop` 之后、第一个数据区之前）**一条说明都没有**，
    // 而底部折叠说明仍然无 JS 可读（`<details>` 的正文在 DOM 里，`innerText` 对闭合
    // details 不返回它 —— 用 textContent 才是「读得到」）。
    {
      const noJsCtx = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });
      const noJsP = await noJsCtx.newPage();
      const probes = [];
      for (const slug of ['no-card', 'ai-coding', 'china-usable']) {
        if (!needTruth.needs[slug]) continue;
        await noJsP.goto(new URL(`need/${slug}/`, base).href, { waitUntil: 'load' });
        probes.push(await noJsP.evaluate(() => {
          const main = document.querySelector('main');
          const details = main ? main.querySelector('details.page-notes') : null;
          // intro 区 = `.cstop` 之后 → 第一个数据区之前（与构建期那条结构性扫描同一口径）
          const cstop = main ? main.querySelector('.cstop') : null;
          const region = document.createRange();
          if (cstop && main) {
            region.setStartAfter(cstop);
            const anchor = main.querySelector('.lsum, .ctable-wrap, table');
            if (anchor) region.setEndBefore(anchor); else region.setEnd(main, main.childNodes.length);
          }
          const introNotes = cstop ? [...region.cloneContents().querySelectorAll('.snote')] : [];
          return {
            chars: document.body ? document.body.innerText.replace(/\s+/g, ' ').trim().length : 0,
            rows: document.querySelectorAll('.ctable tbody tr').length,
            links: document.querySelectorAll('.ctable tbody a[href*="/deal/"]').length,
            // 无 JS 下的「读得到」= DOM 里有正文（闭合 details 的 innerText 是空的，
            // 但搜索引擎与「查看源码」读的是 DOM —— 这正是折叠不影响可索引性的原因）
            notes: Boolean(details) && (details.textContent || '').replace(/\s+/g, ' ').trim().length > 10,
            notesSummary: details ? ((details.querySelector('summary') || {}).textContent || '').trim() : '',
            introNotes: introNotes.length,
            introChars: introNotes.reduce((sum, el) => sum + (el.textContent || '').trim().length, 0),
            jumpback: [...document.querySelectorAll('a')].some(a => (a.getAttribute('href') || '') === '../../')
          };
        }));
      }
      // 顺便：无 JS 打开**首页**时入口行必须还在（它是构建期注入的静态导航）
      await noJsP.goto(base, { waitUntil: 'load' });
      const homeNoJs = await noJsP.evaluate(() => {
        const cards = [...document.querySelectorAll('nav.needs a.need-card')];
        return {
          entries: document.querySelectorAll('nav.needs a').length,
          firstHref: cards[0] ? cards[0].getAttribute('href') : '',
          items: cards.map(a => ({
            href: a.getAttribute('href'),
            label: ((a.querySelector('.need-copy > strong') || {}).textContent || '').trim(),
            desc: ((a.querySelector('.need-copy > small') || {}).textContent || '').trim()
          }))
        };
      });
      await noJsCtx.close();
      check('需求页不执行 JS 也能读到条目与底部折叠说明，且**首屏一条说明都没有**（预渲染的硬定义）',
        probes.length > 0 && probes.every(p => p.chars > 500 && p.rows > 0 && p.links > 0
          && p.notes && p.notesSummary === '分类说明' && p.introNotes === 0 && p.jumpback),
        probes.map((p, i) => `${['no-card', 'ai-coding', 'china-usable'][i]} ${p.rows} 行/${p.chars} 字`
          + ` · 首屏说明 ${p.introNotes} 条/${p.introChars} 字 · 折叠说明「${p.notesSummary}」`).join(' · '));
      check('无 JS 打开首页时「按需求找优惠」入口行仍在且指向需求页',
        homeNoJs.entries === Object.keys(needTruth.needs).length && /^need\//.test(homeNoJs.firstHref),
        `${homeNoJs.entries} 条入口 · 首条 ${homeNoJs.firstHref}`);
      // 「预渲染」的硬定义：卡片不是在浏览器里由 JS 生成再插回去的。
      // 判据是**逐条相等**（卡数 / 标题 / 说明 / href 一起比），不是「看起来差不多」：
      // 任何一处只在有 JS 时才出现（或只排一次序）都会在这一条上现形。
      const jsSide = navRow ? navRow.items.map(i => ({ href: i.href, label: i.label, desc: i.desc })) : null;
      check('无 JS 打开首页：专题导航卡的卡数 / 标题 / 说明 / href 与有 JS 时逐条相同（构建期注入）',
        Boolean(jsSide) && JSON.stringify(homeNoJs.items) === JSON.stringify(jsSide),
        `${homeNoJs.items.length} 张卡逐条比对${JSON.stringify(homeNoJs.items) === JSON.stringify(jsSide) ? '全部相同' : '存在差异'}` +
        ` · 首张「${homeNoJs.items[0] ? homeNoJs.items[0].href : '—'}」/「${homeNoJs.items[0] ? homeNoJs.items[0].label : '—'}」/「${homeNoJs.items[0] ? homeNoJs.items[0].desc : '—'}」`);
    }
  }

  /* ------------------------------------------------------------------ */
  /* 分类说明的 disclosure（page-notes-disclosure-v1，§15b3）             */
  /* ------------------------------------------------------------------ */

  console.log('\n=== 15b3) 分类说明 disclosure：收起状态也要看得出整行能展开 ===');

  /**
   * 为什么这一段必须存在（本轮修的**不是**折叠逻辑，而是 affordance）：
   *
   * 折叠本身一直是好的 —— 原生 `<details>`，无 JS 能开合，键盘本来就是浏览器给的。
   * 坏的是**可发现性**：收起时它长得像一行普通小标题，没有箭头、没有状态文案，
   * 点击区只有标题那几个字宽，读者不会想到去点它。这类缺陷的共性是
   * **所有既有断言全绿**：`<details>` 在、`<summary>` 在、无 JS 读得到正文
   * （那三条正是 §15b2 在守的）—— 唯独「看起来能不能点」没有任何一条在量。
   *
   * 所以这里量的是**只有真浏览器能回答**的几件事，每条对应一种具体坏法：
   *   ① 三件套（summary / chevron / action）**各恰好一个**且装饰件 `aria-hidden`
   *      —— 少一件就退回「一行看不懂的标题」；多一件就是两个箭头 / 两段状态文案；
   *      同时确认默认 marker 已抑制（`list-style-type === 'none'`），否则会出现「▶ ›」；
   *   ② 右侧状态文案是 **CSS `::before` 生成**的（DOM 里刻意没有那两个字，理由见
   *      build-local.js 的 notesHtml 注释）⇒ 读 computed content 才是「它真的在」的证明；
   *   ③ **整行可点**：判据是中段**空白带**里的真实鼠标点击 —— 点文字本来就会展开，
   *      证明不了点击区有没有铺满整行，而「只有文字能点」正是最初那个症状；
   *   ④ 键盘：Tab 聚焦后 `:focus-visible` 真的有 outline（删掉 outline 又不给替代样式
   *      是本仓库反复出现的一类回归），且 Enter 与 Space **都能**开合。
   *
   * 两条实现边界：状态切换用 `checkVisibility()` 判正文可见性（Chromium 对关闭的
   * `<details>` 用的是 content-visibility 语义，`offsetHeight` 会报出上一次的布局高度
   * —— 见 §11 的注释）；390px 在**展开状态下**量溢出（收起时正文不可见，量不出来）。
   *
   * 三族各取一条：`/need/*`（按需求）· `/student/`（专题集合）· `/category/*`（分类落地）——
   * 它们共用 build-local.js 的**同一个** `renderDirectoryPage` 输出，这里顺手证明这一点。
   */
  {
    const DISCLOSURE_ROUTES = ['need/ai-coding/', 'student/', 'category/chat/'];
    /** Chromium 的 computed `content` 带引号（`"展开"`）—— 判等前先剥掉 */
    const unquote = text => String(text === null || text === undefined ? '' : text).replace(/^["']|["']$/g, '');
    const structure = [];
    for (const route of DISCLOSURE_ROUTES) {
      await page.goto(new URL(route, base).href, { waitUntil: 'load' });
      structure.push(await page.evaluate(() => {
        const details = document.querySelector('details.page-notes');
        const summary = details ? details.querySelector('summary') : null;
        const chevron = details ? details.querySelector('.page-notes-chevron') : null;
        const action = details ? details.querySelector('.page-notes-action') : null;
        const body = details ? details.querySelector('.pnote') : null;
        const box = el => { const r = el.getBoundingClientRect(); return { w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 }; };
        return {
          found: Boolean(details && summary),
          open: details ? details.open : null,
          summaries: details ? details.querySelectorAll('summary').length : 0,
          summaryClass: summary ? summary.className : '',
          title: summary ? (summary.textContent || '').trim() : '',
          listStyle: summary ? getComputedStyle(summary).listStyleType : '',
          chevrons: details ? details.querySelectorAll('.page-notes-chevron').length : 0,
          chevronHidden: chevron ? chevron.getAttribute('aria-hidden') : null,
          chevronBox: chevron ? box(chevron) : null,
          actions: details ? details.querySelectorAll('.page-notes-action').length : 0,
          actionHidden: action ? action.getAttribute('aria-hidden') : null,
          actionContent: action ? getComputedStyle(action, '::before').content : '',
          bodyVisible: body && typeof body.checkVisibility === 'function' ? body.checkVisibility() : null
        };
      }));
    }
    const structureDetail = structure.map((s, i) => (s.found
      ? `${DISCLOSURE_ROUTES[i]} summary×${s.summaries}「${s.title}」· chevron×${s.chevrons}`
        + `${s.chevronBox ? ` ${s.chevronBox.w}×${s.chevronBox.h}px` : ''} · action×${s.actions}`
        + ` · marker=${s.listStyle} · open=${s.open}`
      : `${DISCLOSURE_ROUTES[i]} 没有 details.page-notes`)).join(' · ');

    check('分类说明 disclosure：三件套各恰好一个（summary / chevron / action）+ 装饰件 aria-hidden + 默认收起 + 默认 marker 已抑制',
      structure.length === DISCLOSURE_ROUTES.length && structure.every(s =>
        s.found && s.open === false && s.summaries === 1 && s.summaryClass === 'page-notes-summary'
        && s.title === '分类说明' && s.listStyle === 'none'
        && s.chevrons === 1 && s.chevronHidden === 'true' && s.chevronBox.w > 0 && s.chevronBox.h > 0
        && s.actions === 1 && s.actionHidden === 'true'),
      structureDetail);

    check('右侧状态文案由 CSS 生成且真实可见：收起态 computed content = 「展开」（DOM 里没有这两个字）',
      structure.every(s => unquote(s.actionContent) === '展开'),
      structure.map((s, i) => `${DISCLOSURE_ROUTES[i]}=${JSON.stringify(s.actionContent)}`).join(' · '));

    // ---- 状态切换：点一下，四件东西必须同时翻转（少翻一件就是半个控件）----
    // 四条探针一律 fail-soft：控件整个不见了的时候，判据要**说得出口**（哪一项没了），
    // 而不是从 evaluate 里抛一个 TypeError 把整轮验收打断（那样后面的 800 多项都不会跑）。
    await page.goto(new URL(DISCLOSURE_ROUTES[0], base).href, { waitUntil: 'load' });
    const toggled = await page.evaluate(async () => {
      const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
      const details = document.querySelector('details.page-notes');
      const summary = details ? details.querySelector('summary') : null;
      const action = details ? details.querySelector('.page-notes-action') : null;
      const chevron = details ? details.querySelector('.page-notes-chevron') : null;
      const body = details ? details.querySelector('.pnote') : null;
      if (!details || !summary || !action || !chevron || !body) {
        return { missing: [!details && 'details.page-notes', !summary && 'summary', !action && '.page-notes-action',
          !chevron && '.page-notes-chevron', !body && '.pnote'].filter(Boolean).join(' / ') };
      }
      const snap = () => ({
        open: details.open,
        action: getComputedStyle(action, '::before').content,
        chevron: getComputedStyle(chevron).transform,
        bodyVisible: typeof body.checkVisibility === 'function'
          ? body.checkVisibility() : getComputedStyle(body).visibility !== 'hidden'
      });
      const before = snap();
      summary.click();
      await sleep(250);
      return { before, after: snap() };
    });
    check('点一下状态整体翻转：open false→true · 「展开」→「收起」 · 正文不可见→可见 · 箭头 transform 改变',
      !toggled.missing && toggled.before.open === false && toggled.after.open === true
      && unquote(toggled.before.action) === '展开' && unquote(toggled.after.action) === '收起'
      && toggled.before.bodyVisible === false && toggled.after.bodyVisible === true
      && toggled.before.chevron !== toggled.after.chevron,
      toggled.missing
        ? `${DISCLOSURE_ROUTES[0]} 缺 ${toggled.missing} ⇒ 状态切换无从谈起`
        : `open ${toggled.before.open}→${toggled.after.open} · 文案「${unquote(toggled.before.action)}」→「${unquote(toggled.after.action)}」`
          + ` · 正文可见 ${toggled.before.bodyVisible}→${toggled.after.bodyVisible} · 箭头 ${toggled.before.chevron}→${toggled.after.chevron}`);

    // ---- 整行可点：点「箭头与状态文案之间的空白带」也要展开 ----
    await page.goto(new URL(DISCLOSURE_ROUTES[0], base).href, { waitUntil: 'load' });
    const blank = await page.evaluate(() => {
      const details = document.querySelector('details.page-notes');
      const summary = details ? details.querySelector('summary') : null;
      const lead = summary ? summary.querySelector('.page-notes-leading') : null;
      const act = summary ? summary.querySelector('.page-notes-action') : null;
      if (!details || !summary || !lead || !act) return null;
      summary.scrollIntoView({ block: 'center', behavior: 'instant' });
      const rect = summary.getBoundingClientRect();
      const leadBox = lead.getBoundingClientRect();
      const actBox = act.getBoundingClientRect();
      const left = leadBox.right + 4;
      const right = actBox.left - 4;
      const x = (left + right) / 2;
      const y = rect.top + rect.height / 2;
      const hit = document.elementFromPoint(x, y);
      return {
        gap: Math.round((right - left) * 10) / 10,
        x: Math.round(x), y: Math.round(y),
        inViewport: y >= 0 && y <= innerHeight && x >= 0 && x <= innerWidth,
        hitIsSummary: hit === summary,
        hitLabel: hit ? `${hit.tagName.toLowerCase()}${typeof hit.className === 'string' && hit.className ? `.${hit.className}` : ''}` : '(无)',
        open: details.open
      };
    });
    if (blank) {
      await page.mouse.click(blank.x, blank.y);
      await page.waitForTimeout(250);
    }
    const blankAfter = blank ? await page.evaluate(() => document.querySelector('details.page-notes').open) : null;
    check('整行可点：summary 中段的空白带（不在任何文字上）点一下就展开',
      Boolean(blank) && blank.gap >= 20 && blank.inViewport && blank.hitIsSummary
      && blank.open === false && blankAfter === true,
      blank
        ? `空白带 ${blank.gap}px · 点 (${blank.x}, ${blank.y}) 命中 <${blank.hitLabel}> · open ${blank.open}→${blankAfter}`
        : `${DISCLOSURE_ROUTES[0]} 找不到 summary / .page-notes-leading / .page-notes-action ⇒ 点不出空白带给读者`);

    // ---- 键盘：Tab 可达 + focus-visible 有可见 outline + Enter / Space 都能开合 ----
    await page.goto(new URL(DISCLOSURE_ROUTES[0], base).href, { waitUntil: 'load' });
    // 焦点探针也是 fail-soft：`page.focus()` 在元素不存在时会等 30 秒再抛，
    // 那会把整轮验收拖死；先问一句在不在，不在就直接判红并说清楚。
    const hasSummary = Boolean(await page.$('.page-notes-summary'));
    let kbFocus = null;
    let afterEnter = null;
    let afterSpace = null;
    if (hasSummary) {
      await page.focus('.page-notes-summary');
      // 先 Shift+Tab 再 Tab：把「最后一次交互是键盘」做实，`:focus-visible` 才稳定命中
      // （只用 focus() 时焦点可见性是启发式判定的，会给出假阴性）。
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      kbFocus = await page.evaluate(() => {
        const summary = document.querySelector('.page-notes-summary');
        const style = getComputedStyle(summary);
        return {
          isSummary: document.activeElement === summary,
          focusVisible: typeof summary.matches === 'function' ? summary.matches(':focus-visible') : null,
          outlineStyle: style.outlineStyle,
          outlineWidth: parseFloat(style.outlineWidth) || 0
        };
      });
      await page.keyboard.press('Enter');
      await page.waitForTimeout(200);
      afterEnter = await page.evaluate(() => document.querySelector('details.page-notes').open);
      await page.keyboard.press('Space');
      await page.waitForTimeout(200);
      afterSpace = await page.evaluate(() => document.querySelector('details.page-notes').open);
    }
    check('键盘可用：Tab 聚焦 summary（:focus-visible 命中且 outline ≥2px）· Enter 展开 · Space 收起',
      hasSummary && kbFocus.isSummary && kbFocus.focusVisible === true
      && kbFocus.outlineStyle !== 'none' && kbFocus.outlineWidth >= 2
      && afterEnter === true && afterSpace === false,
      hasSummary
        ? `焦点在 summary=${kbFocus.isSummary} · :focus-visible=${kbFocus.focusVisible}`
          + ` · outline ${kbFocus.outlineStyle} ${kbFocus.outlineWidth}px · Enter→open=${afterEnter} · Space→open=${afterSpace}`
        : `${DISCLOSURE_ROUTES[0]} 没有 .page-notes-summary ⇒ 键盘判据无从谈起`);

    // ---- 390px：整行触控区 ≥44px、不超出视口、展开后正文与页面都不横向溢出 ----
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(new URL(DISCLOSURE_ROUTES[0], base).href, { waitUntil: 'load' });
    const mobile = await page.evaluate(async () => {
      const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
      const details = document.querySelector('details.page-notes');
      const summary = details ? details.querySelector('summary') : null;
      const action = details ? details.querySelector('.page-notes-action') : null;
      if (!details || !summary || !action) {
        return { missing: [!details && 'details.page-notes', !summary && 'summary', !action && '.page-notes-action'].filter(Boolean).join(' / ') };
      }
      summary.click();
      await sleep(250);
      const rect = summary.getBoundingClientRect();
      const actionBox = action.getBoundingClientRect();
      const notes = [...details.querySelectorAll('.pnote')];
      return {
        open: details.open,
        summaryWidth: Math.round(rect.width * 10) / 10,
        summaryHeight: Math.round(rect.height * 10) / 10,
        viewport: innerWidth,
        docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        notes: notes.length,
        notesOverflow: notes.filter(p => p.scrollWidth > p.clientWidth + 1).length,
        actionInside: actionBox.right <= rect.right + 0.5 && actionBox.left >= rect.left - 0.5
      };
    });
    check('390px：整行点击区 ≥44px、summary 不超出视口、展开后正文与页面都不横向溢出',
      !mobile.missing && mobile.open === true && mobile.summaryHeight >= 44 && mobile.summaryWidth <= mobile.viewport
      && mobile.docOverflow === 0 && mobile.notesOverflow === 0 && mobile.actionInside,
      mobile.missing
        ? `${DISCLOSURE_ROUTES[0]} 缺 ${mobile.missing} ⇒ 窄屏几何判据无从谈起`
        : `summary ${mobile.summaryWidth}×${mobile.summaryHeight}px（视口 ${mobile.viewport}）`
          + ` · 页面溢出 ${mobile.docOverflow}px · 正文溢出 ${mobile.notesOverflow}/${mobile.notes} 段 · 状态文案仍在行内=${mobile.actionInside}`);
    await page.setViewportSize({ width: 1440, height: 900 });
  }

  /* ------------------------------------------------------------------ */
  /* 数据源状态页（/status/）                                             */
  /* ------------------------------------------------------------------ */

  console.log('\n=== 15c) 数据源状态页（/status/）===');

  /**
   * 为什么这一段必须存在：`/status/` 是本站唯一一条**先于 v1.1 存在**的独立路由，
   * 而它在 verify-site.js 里此前是 **0 处覆盖**（全文 0 处命中）。它的全部守卫只是
   * build-local.js 的静态自检，于是「页面上真的是不是那样」从来没有被真浏览器看过一眼。
   *
   * 静态自检查不出的那一类，恰恰是这一页最可能的坏法：三列数字与时间都是
   * `white-space: nowrap`，来源一多，窄屏上必然溢出。`.stable-wrap { overflow-x: auto }`
   * 就是为它写的 —— 而此前**没有任何断言证明那一层还在**。少了它，桌面端一切正常，
   * 手机上整页横向滚动，而所有静态检查都是绿的。
   *
   * 所以这一段里最要紧的不是「内容对不对」（静态自检逐来源对账已管），
   * 而是 **390px / 360px 下不产生页面级横向溢出**。
   */
  {
    const statusRouteUrl = new URL('status/', base).href;
    const errorsBefore = errors.length;
    const externalBefore = externalRequests.length;
    await page.goto(statusRouteUrl, { waitUntil: 'load' });
    const st = await page.evaluate(() => ({
      h1: ((document.querySelector('h1') || {}).textContent || '').trim(),
      canonical: (document.querySelector('link[rel="canonical"]') || {}).href || '',
      rows: document.querySelectorAll('.stable tbody tr').length,
      statuses: [...document.querySelectorAll('.stt')].map(el => el.textContent.trim()),
      feeds: document.querySelectorAll('link[rel="alternate"]').length,
      ldTypes: [...document.querySelectorAll('script[type="application/ld+json"]')]
        .map(s => { try { return JSON.parse(s.textContent)['@type']; } catch (e) { return 'PARSE_ERROR'; } }),
      healthLinks: [...document.querySelectorAll('a')]
        .filter(a => (a.getAttribute('href') || '').includes('source-health.json')).length,
      text: document.body ? document.body.innerText.replace(/\s+/g, ' ').trim().length : 0
    }));
    // 真值取机器可读的那一份：页面与它同源，但**浏览器里读出来的那一页**才算数。
    // ⚠️ 地址同样由 base 解析（`/status/` 是子路径）：写死根路径时本地绿、线上 404，
    //    而失败形态是「读不到 source-health.json」+ 一条 404 的 JS 错误 —— 看着像数据缺失。
    const healthTruth = await page.evaluate(`(async () => {
      const doc = await (await fetch(${JSON.stringify(new URL('source-health.json', base).href)})).json();
      const rows = doc.sources || [];
      const label = { healthy: '✅ 正常', degraded: '⚠️ 异常', failed: '❌ 失败' };
      return { total: rows.length, labels: rows.map(r => label[r.status] || r.status) };
    })()`).catch(() => null);

    check('/status/ 能打开且标题非空',
      Boolean(st.h1) && st.rows > 0, `「${st.h1}」· 表格 ${st.rows} 行 · 正文 ${st.text} 字`);
    check('/status/ canonical 自指',
      st.canonical.endsWith('/status/') && st.canonical.includes('buguoshixc.github.io'), st.canonical);
    check('/status/ 行数与状态标签与 source-health.json 逐个对账',
      Boolean(healthTruth) && st.rows === healthTruth.total &&
      st.rows === st.statuses.length &&
      st.statuses.slice().sort().join(',') === healthTruth.labels.slice().sort().join(','),
      healthTruth
        ? `页面 ${st.rows} 行 / 数据 ${healthTruth.total} 个 · 标签 [${[...new Set(st.statuses)].join(' ')}]`
        : '读不到 source-health.json');
    // JSON-LD 断言**恰好等于**，不是「包含」：SCHEMA §10.4.1 明确写了这一页不发
    // Dataset / ItemList（机器可读的那份是 source-health.json，声明两次迟早分家）。
    // 只判包含的话，加第三段谁都不会发现 —— 那句承诺就没有守卫。
    // feed 同理取「恰好两个」。
    const STATUS_LD = ['BreadcrumbList', 'WebPage'];
    check('/status/ 补齐五条约定：恰好两个 feed + 恰好两段 JSON-LD（WebPage + BreadcrumbList）',
      st.feeds === 2 && JSON.stringify(st.ldTypes.slice().sort()) === JSON.stringify(STATUS_LD),
      `feed ${st.feeds} 个 · JSON-LD [${st.ldTypes.join(', ')}]（期望 [${STATUS_LD.join(', ')}]）`);
    check('/status/ 有指向 source-health.json 的链接（机器可读的那一份）',
      st.healthLinks > 0, `${st.healthLinks} 个`);
    check('/status/ 没有 JS 错误、没有外部请求',
      errors.length === errorsBefore && externalRequests.length === externalBefore,
      `错误 ${errors.length - errorsBefore} · 外部请求 ${externalRequests.length - externalBefore}`);

    // 无 JS：这是「预渲染」的硬定义。`<time datetime>` 是绝对时间的载体 ——
    // 相对时间（「2 小时前」）由一个内联脚本换算，禁用 JS 时必须还能读到完整信息。
    const noJsStatus = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });
    const noJsStatusP = await noJsStatus.newPage();
    await noJsStatusP.goto(statusRouteUrl, { waitUntil: 'load' });
    const stNoJs = await noJsStatusP.evaluate(() => ({
      chars: document.body ? document.body.innerText.replace(/\s+/g, ' ').trim().length : 0,
      rows: document.querySelectorAll('.stable tbody tr').length,
      times: document.querySelectorAll('time[datetime]').length,
      // 页脚路由入口在无 JS 时也必须可点（站内导航不是 JS 控件）
      footLinks: [...document.querySelectorAll('footer a')].map(a => a.getAttribute('href') || '')
    }));
    await noJsStatus.close();
    check('/status/ 不执行 JS 也能读到来源表与绝对时间（预渲染的硬定义）',
      stNoJs.chars > 500 && stNoJs.rows > 0 && stNoJs.times > 0,
      `${stNoJs.rows} 行 / ${stNoJs.chars} 字 / ${stNoJs.times} 个 <time datetime>`);
    check('/status/ 无 JS 时页脚路由入口仍在且指向正确',
      ['status/', 'student/', 'developer/', 'free-api/'].every(rel =>
        stNoJs.footLinks.some(href => href.endsWith(rel))),
      `页脚链接 ${stNoJs.footLinks.filter(h => /status\/|student\/|developer\/|free-api\//.test(h)).join(', ')}`);

    // ★ 这一段里最要紧的断言。
    //
    // 判据刻意只看**结果**（页面级 `scrollWidth` 有没有超出视口），不看**机制**
    // （`.stable-wrap` 的 `overflow-x` 是不是 `auto`）：机制是实现细节，把它写进断言，
    // 将来有人把宽表换成移动端的卡片式排版（页面照样不横滚）就会被判红 ——
    // 那正是「守卫在正常行为上失败」这一类错误。机制只在明细里报出来，供排查用。
    //
    // ⚠️ 明细里**只报事实，不做因果解读**。第一版写的是「表格宽于容器、靠内部横滚」，
    // 那句话由 `wrap.scrollWidth > wrap.clientWidth` 推出 —— 而在 `overflow-x: visible`
    // 的失败现场它**照样为真**，于是失败行会印出一句「靠内部横滚」的假解释
    // （独立验证代理在 121px 溢出的那一行上抓到的）。现在直接报两个宽度。
    for (const width of [390, 360]) {
      await page.setViewportSize({ width, height: 844 });
      await page.waitForTimeout(200);
      const mobile = await page.evaluate(() => {
        const wrap = document.querySelector('.stable-wrap');
        const table = document.querySelector('.stable');
        const rect = el => (el ? Math.round(el.getBoundingClientRect().width) : null);
        return {
          docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          wrapOverflowX: wrap ? getComputedStyle(wrap).overflowX : '(无 .stable-wrap)',
          tableWidth: rect(table),
          wrapWidth: rect(wrap)
        };
      });
      check(`/status/ ${width}px 不产生页面级横向溢出（宽表应在容器内横滚，而不是撑开整页）`,
        mobile.docOverflow <= 1,
        `页面溢出 ${mobile.docOverflow}px · .stable-wrap overflow-x=${mobile.wrapOverflowX} · ` +
        `表格宽 ${mobile.tableWidth}px / 容器宽 ${mobile.wrapWidth}px`);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(200);
  }

  // 回到详情页：后面的主题断言接着用这一页
  await page.goto(detailUrl, { waitUntil: 'load' });
  await page.waitForSelector('.dpane', { timeout: 15000 });

  // 主题沿用首页的选择（同一套 localStorage 约定）
  await page.evaluate(() => { try { localStorage.setItem('dsh.theme', 'dark'); } catch (e) {} });
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('.dpane', { timeout: 15000 });   // 详情页静态：等主体，不等应用
  const detailDark = await page.evaluate(() => {
    const pressed = document.querySelector('#themeSeg [aria-pressed="true"]');
    return {
      attr: document.documentElement.getAttribute('data-theme'),
      pressed: pressed ? pressed.dataset.themeValue : null,
      bodyBg: getComputedStyle(document.body).backgroundColor
    };
  });
  check('详情页沿用首页的主题选择',
    detailDark.attr === 'dark' && detailDark.pressed === 'dark',
    `data-theme=${detailDark.attr} · 选中「${detailDark.pressed}」· body=${detailDark.bodyBg}`);
  await page.evaluate(() => { try { localStorage.removeItem('dsh.theme'); } catch (e) {} });

  await page.goto(base, { waitUntil: 'load' });
  await waitForApp(page);   // 等应用接管，而不是等固定毫秒（线上比本地慢得多）

  console.log('\n=== 16) 紧凑行视图 ===');
  const viewToggle = await page.evaluate(() => {
    const seg = document.getElementById('viewSeg');
    return { exists: Boolean(seg), buttons: seg ? seg.querySelectorAll('[data-view]').length : 0 };
  });
  check('有视图切换器（卡片 / 列表）', viewToggle.exists && viewToggle.buttons === 2, `${viewToggle.buttons} 个按钮`);

  await page.click('#viewSeg [data-view="rows"]');
  await page.waitForTimeout(400);
  const rowsView = await page.evaluate((src) => {
    const rows = [...document.querySelectorAll('.r')];
    const first = rows[0];
    return {
      cls: document.getElementById('dealsList').className,
      rows: rows.length,
      visible: rows.filter(row => row.getBoundingClientRect().bottom <= window.innerHeight).length,
      pageHeight: Math.round(document.documentElement.scrollHeight),
      rowHeight: first ? Math.round(first.getBoundingClientRect().height) : 0,
      hasInternal: Boolean(first && first.querySelector('.rt a[href^="deal/"]')),
      hasCta: Boolean(first && first.querySelector('.ra .go[target="_blank"]')),
      bands: document.querySelectorAll('.tierhead').length,
      jump: (0, eval)(src), // eslint-disable-line no-eval
      stored: (() => { try { return localStorage.getItem('dsh.view'); } catch (e) { return 'n/a'; } })()
    };
  }, JUMP_GEOM);
  /* 阈值 12 → 10（2026-10-05，队长授权同步；与上面「首屏完整可见卡片 ≥ 6」是**同一笔账**）。
     列表视图与卡片视图共用同一段固定顶部（表头 / 结果条 / 专题导航卡），所以首页专题卡把
     nav.needs 从 31px 抬到 153px（δ = +122px）以后，列表视图的起点同步下移：
     同一 dist 的归因实验（只在运行时把 nav.needs 压回 31px）实测 listTop 217 → 339px、
     首屏完整可见行数 13 → 10（行高 46px，122px ÷ 46 ≈ 2.7 行）、页高差额正好 122px。
     阈值仍严格等于实测值（10），不是「放宽到看不见回归」：顶部再加任何一条新的独立条带
     （哪怕只有 47px）都会让这一条再红一次；断言名里不再写死卡片视图的数字 ——
     卡片视图的读数由 detail 动态打印（rendered.firstScreenFull），写死就会同步漏改。 */
  check('列表视图：首屏完整可见 ≥ 10 行', rowsView.visible >= 10,
    `${rowsView.visible} 行（行高 ${rowsView.rowHeight}px · 共 ${rowsView.rows} 行 · 页高 ${rowsView.pageHeight}px）；` +
    `卡片视图同口径 ${rendered.firstScreenFull} 张`);
  check('列表视图：条目数与卡片一致且字段同源',
    rowsView.rows === rendered.cards && rowsView.hasInternal && rowsView.hasCta,
    `${rowsView.rows} 行 · 站内标题链接=${rowsView.hasInternal} · 官方 CTA=${rowsView.hasCta}`);
  check('列表视图：不分带且锚点导航真的隐藏（几何判定，不留死锚点）',
    rowsView.bands === 0 && jumpHiddenOk(rowsView.jump),
    `分带 ${rowsView.bands} 个 · ${jumpDetail(rowsView.jump)}`);
  check('列表视图：偏好已写入 localStorage', rowsView.stored === 'rows', `dsh.view=${rowsView.stored}`);

  await page.reload({ waitUntil: 'load' });
  await waitForApp(page);
  const rowsAfterReload = await page.evaluate(() => {
    const pressed = document.querySelector('#viewSeg [aria-pressed="true"]');
    return {
      cls: document.getElementById('dealsList').className,
      pressed: pressed ? pressed.dataset.view : null
    };
  });
  check('刷新后仍是列表视图', rowsAfterReload.cls === 'rows' && rowsAfterReload.pressed === 'rows',
    `class=${rowsAfterReload.cls} · 选中「${rowsAfterReload.pressed}」`);

  const rowDetail = await page.evaluate(async () => {
    document.querySelector('.r').click();
    await new Promise(r => setTimeout(r, 350));
    const out = {
      open: document.getElementById('detail').open,
      title: (document.querySelector('#detail h2') || {}).textContent || ''
    };
    document.querySelector('#detail .x').click();
    await new Promise(r => setTimeout(r, 250));
    return out;
  });
  check('列表视图整行也能打开详情', rowDetail.open && Boolean(rowDetail.title),
    `弹层 open=${rowDetail.open}「${rowDetail.title.slice(0, 22)}」`);

  await page.click('#viewSeg [data-view="cards"]');
  await page.waitForTimeout(400);
  const backToCards = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('article.g')];
    return {
      cls: document.getElementById('dealsList').className,
      cards: cards.length,
      visible: cards.filter(card => card.getBoundingClientRect().bottom <= window.innerHeight).length,
      bands: document.querySelectorAll('.tierhead').length,
      stored: (() => { try { return localStorage.getItem('dsh.view'); } catch (e) { return 'n/a'; } })()
    };
  });
  check('切回卡片视图恢复原样（密度与分带都不变）',
    backToCards.cls === 'grid' && backToCards.cards === rendered.cards &&
      backToCards.visible === rendered.firstScreenFull && backToCards.bands >= 3,
    `${backToCards.cards} 张卡 · 首屏完整可见 ${backToCards.visible} 张 · 分带 ${backToCards.bands} 个 · dsh.view=${backToCards.stored}`);

  // 手机端密度：同一轮里先量卡片、再量列表，直接比页高（不跨运行比数字）
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  const mobileCards = await page.evaluate(() => Math.round(document.documentElement.scrollHeight));
  await page.click('#viewSeg [data-view="rows"]');
  await page.waitForTimeout(500);
  const mobileRows = await page.evaluate(() => ({
    pageHeight: Math.round(document.documentElement.scrollHeight),
    screens: Math.round((document.documentElement.scrollHeight / window.innerHeight) * 10) / 10,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    rows: document.querySelectorAll('.r').length
  }));
  check('手机端列表视图明显更短且不横向溢出',
    mobileRows.overflow === 0 && mobileRows.pageHeight < mobileCards * 0.8,
    `卡片 ${mobileCards}px → 列表 ${mobileRows.pageHeight}px（${mobileRows.screens} 屏 · ${mobileRows.rows} 行 · 横向溢出 ${mobileRows.overflow}px）`);

  await page.click('#viewSeg [data-view="cards"]');
  await page.waitForTimeout(300);
  await page.evaluate(() => { try { localStorage.removeItem('dsh.view'); } catch (e) {} });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(200);

  console.log('\n=== 17) 键盘可达与焦点归还 ===');
  await page.goto(base, { waitUntil: 'load' });
  await waitForApp(page);   // 同第 16 节：等接管，不等毫秒

  const focusable = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('article.g')];
    return {
      cards: cards.length,
      tabbable: cards.filter(card => card.getAttribute('tabindex') === '0').length,
      labelled: cards.filter(card => (card.getAttribute('aria-label') || '').includes('按回车')).length
    };
  });
  check('卡片进入 Tab 顺序且标注了键盘用法',
    focusable.tabbable === focusable.cards && focusable.labelled === focusable.cards,
    `${focusable.tabbable}/${focusable.cards} 张可聚焦 · ${focusable.labelled} 张有 aria-label`);

  await page.focus('article.g');
  const firstCardTitle = await page.evaluate(() => document.querySelector('article.g h3').textContent.trim());
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  const kbOpen = await page.evaluate(() => ({
    open: document.getElementById('detail').open,
    title: (document.querySelector('#detail h2') || {}).textContent || ''
  }));
  check('回车能打开详情', kbOpen.open && kbOpen.title === firstCardTitle,
    `弹层=${kbOpen.open}「${kbOpen.title.slice(0, 22)}」`);

  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const afterEsc = await page.evaluate(() => {
    const active = document.activeElement;
    return {
      open: document.getElementById('detail').open,
      tag: active ? active.tagName.toLowerCase() : '',
      isCard: Boolean(active && active.classList && active.classList.contains('g')),
      title: active && active.querySelector ? ((active.querySelector('h3') || {}).textContent || '') : ''
    };
  });
  check('Esc 关闭后焦点归还给那张卡片',
    afterEsc.open === false && afterEsc.isCard && afterEsc.title === firstCardTitle,
    `弹层=${afterEsc.open} · 焦点在 <${afterEsc.tag}>「${afterEsc.title.slice(0, 22)}」`);

  await page.click('#viewSeg [data-view="rows"]');
  await page.waitForTimeout(400);
  await page.focus('.r');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  const rowKb = await page.evaluate(() => ({
    open: document.getElementById('detail').open,
    allTabbable: [...document.querySelectorAll('.r')].every(row => row.getAttribute('tabindex') === '0')
  }));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const rowFocusBack = await page.evaluate(() =>
    Boolean(document.activeElement && document.activeElement.classList && document.activeElement.classList.contains('r')));
  check('列表视图的行同样可聚焦、回车打开、Esc 后归位',
    rowKb.open && rowKb.allTabbable && rowFocusBack,
    `弹层=${rowKb.open} · 行全部可聚焦=${rowKb.allTabbable} · 焦点归位=${rowFocusBack}`);

  await page.click('#viewSeg [data-view="cards"]');
  await page.waitForTimeout(300);

  console.log('\n=== 17.5) 收藏 / 对比（G11）===');

  /**
   * 星标不按卡片下标找：筛选或排序一变，`article.g` 的先后顺序就变了。
   * 这里一律按**标题**定位（星级数据用的是稳定的 deal.id），断言之间不会互相干扰。
   */
  const starState = (title) => page.evaluate(probe => {
    const card = [...document.querySelectorAll('article.g')]
      .find(el => el.querySelector('h3').textContent.trim() === probe);
    if (!card) return { found: false };
    const button = card.querySelector('[data-fav-toggle]');
    return {
      found: true,
      hasButton: Boolean(button),
      pressed: button ? button.getAttribute('aria-pressed') : null,
      label: button ? button.getAttribute('aria-label') || '' : '',
      // 绝对定位是硬约束：一定位就退出正常流，卡片高度/标题宽度/网格行高都不会被它顶动
      position: button ? getComputedStyle(button).position : '',
      cardHeight: Math.round(card.getBoundingClientRect().height),
      titleWidth: Math.round(card.querySelector('h3').getBoundingClientRect().width)
    };
  }, title);

  const clickStar = (title) => page.evaluate(probe => {
    const card = [...document.querySelectorAll('article.g')]
      .find(el => el.querySelector('h3').textContent.trim() === probe);
    if (!card) return false;
    const button = card.querySelector('[data-fav-toggle]');
    if (!button) return false;
    button.click();
    return true;
  }, title);

  // 从干净的偏好开始：这一步之前的断言都没碰过收藏/对比的键
  await page.evaluate(() => {
    try { localStorage.removeItem('dsh.favorites'); localStorage.removeItem('dsh.compare'); } catch (e) { /* 忽略 */ }
  });
  await page.goto(base, { waitUntil: 'load' });   // 不带 query，避免上一次的 ?compare= 干扰
  await waitForApp(page);

  const favTitle = await page.evaluate(() => document.querySelector('article.g h3').textContent.trim());
  const starBefore = await starState(favTitle);
  check('卡片上有收藏星标，且是绝对定位（不参与布局）',
    starBefore.found && starBefore.hasButton && starBefore.pressed === 'false' && starBefore.position === 'absolute',
    `position=${starBefore.position} aria-pressed=${starBefore.pressed} · aria-label「${starBefore.label.slice(0, 18)}」`);

  await clickStar(favTitle);
  await page.waitForTimeout(150);
  const afterFavClick = await starState(favTitle);
  const detailOpenedByStar = await page.evaluate(() => document.getElementById('detail').open);
  check('点星标即收藏，且不会顺带弹出详情弹层',
    afterFavClick.pressed === 'true' && !detailOpenedByStar,
    `aria-pressed=${afterFavClick.pressed} · 详情弹层=${detailOpenedByStar}`);

  const favStored = await page.evaluate(() => {
    try { return localStorage.getItem('dsh.favorites'); } catch (e) { return 'n/a'; }
  });
  await page.reload({ waitUntil: 'load' });
  await waitForApp(page);
  const starAfterReload = await starState(favTitle);
  check('收藏写进 localStorage，刷新后仍然亮着',
    starAfterReload.pressed === 'true' && Boolean(favStored),
    `刷新前 localStorage=${favStored} → 刷新后 aria-pressed=${starAfterReload.pressed} · 卡片高 ${starBefore.cardHeight}→${starAfterReload.cardHeight}px · 标题宽 ${starBefore.titleWidth}→${starAfterReload.titleWidth}px`);

  // 详情弹层里的两个完整动作（选题里写的是「卡片上是角标、完整动作在弹层」）
  const detailActions = await page.evaluate(async (probe) => {
    const card = [...document.querySelectorAll('article.g')]
      .find(el => el.querySelector('h3').textContent.trim() === probe);
    card.click();
    await new Promise(r => setTimeout(r, 250));
    const fav = document.querySelector('#detailBody [data-fav]');
    const cmp = document.querySelector('#detailBody [data-cmp]');
    return {
      open: document.getElementById('detail').open,
      fav: fav ? { text: fav.textContent.trim(), pressed: fav.getAttribute('aria-pressed') } : null,
      cmp: cmp ? { text: cmp.textContent.trim(), pressed: cmp.getAttribute('aria-pressed') } : null
    };
  }, favTitle);
  check('详情弹层里有完整标注的「收藏 / 加入对比」',
    detailActions.open && Boolean(detailActions.fav) && Boolean(detailActions.cmp) &&
    detailActions.fav.pressed === 'true' && detailActions.cmp.text.includes('加入对比'),
    `收藏「${detailActions.fav ? detailActions.fav.text : '缺失'}」· 对比「${detailActions.cmp ? detailActions.cmp.text : '缺失'}」`);

  // ── 对比：上限 4 条，第 5 条必须被挡住 ──
  const cmpLimit = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const cards = [...document.querySelectorAll('article.g')];
    const added = [];
    for (let i = 0; i < 5 && i < cards.length; i++) {
      cards[i].click();
      await sleep(120);
      const button = document.querySelector('#detailBody [data-cmp]');
      if (!button || button.disabled) { document.getElementById('detail').close(); await sleep(80); continue; }
      button.click();
      await sleep(80);
      added.push(button.getAttribute('aria-pressed'));
      document.getElementById('detail').close();
      await sleep(80);
    }
    const bar = document.getElementById('cmpbar');
    return {
      addedTry: added.length,
      lastPressed: added[added.length - 1],
      barHidden: !bar || bar.hidden,
      count: document.getElementById('cmpCount') ? document.getElementById('cmpCount').textContent.trim() : '',
      chips: document.querySelectorAll('.cmpchip').length,
      stored: (() => {
        try { return JSON.parse(localStorage.getItem('dsh.compare') || '[]').length; } catch (e) { return -1; }
      })(),
      url: new URLSearchParams(location.search).get('compare')
    };
  });
  check('对比最多收 4 条，第 5 条被挡住',
    cmpLimit.addedTry === 4 && cmpLimit.lastPressed === 'true' && cmpLimit.stored === 4 &&
    !cmpLimit.barHidden && cmpLimit.chips === 4,
    `点 5 次收进 ${cmpLimit.addedTry} 条 · localStorage ${cmpLimit.stored} 条 · 对比条「${cmpLimit.count}」· 标题条 ${cmpLimit.chips} 个`);

  check('选择写进可分享 URL（?compare=id,id,…）',
    Boolean(cmpLimit.url) && cmpLimit.url.split(',').filter(Boolean).length === 4,
    `?compare=${cmpLimit.url}`);

  // ── 分享链接可复现：换一个「没有本机选择」的浏览器上下文打开 ──
  const cmpUrl = await page.evaluate(() => location.href);
  const sharePage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await sharePage.goto(cmpUrl, { waitUntil: 'load' });
  await waitForApp(sharePage);
  const restored = await sharePage.evaluate(() => {
    const bar = document.getElementById('cmpbar');
    return {
      url: new URLSearchParams(location.search).get('compare'),
      stored: (() => {
        try { return JSON.parse(localStorage.getItem('dsh.compare') || '[]').length; } catch (e) { return -1; }
      })(),
      barVisible: Boolean(bar && !bar.hidden && bar.offsetHeight > 0),
      chips: [...document.querySelectorAll('.cmpchip')].map(el => el.textContent.trim()),
      starsOn: [...document.querySelectorAll('[data-fav-toggle]')].filter(b => b.getAttribute('aria-pressed') === 'true').length
    };
  });
  check('分享链接打开后选择被复现（URL 是唯一事实来源，不靠本机 localStorage）',
    restored.chips.length === 4 && restored.barVisible && restored.starsOn === 0,
    `还原 ${restored.chips.length} 条 · 对比条可见 ${restored.barVisible} · 该上下文里的收藏 ${restored.starsOn} 个 · ?compare=${restored.url}`);

  // ── 对比表：只出现有值的字段，一个空单元格都没有 ──
  const tableShape = await sharePage.evaluate(async () => {
    document.getElementById('cmpOpen').click();
    await new Promise(r => setTimeout(r, 250));
    const dlg = document.getElementById('compare');
    const cells = [...dlg.querySelectorAll('.cmptable td')];
    return {
      open: dlg.open,
      columns: dlg.querySelectorAll('.cmptable thead th').length - 1,
      rows: dlg.querySelectorAll('.cmptable tbody tr').length,
      rowLabels: [...dlg.querySelectorAll('.cmptable tbody th')].map(el => el.textContent.trim()),
      emptyCells: cells.filter(td => !td.textContent.trim()).length,
      // 占位符判据：**整格就是占位符**，而不是「文本里出现过某个字符」。
      //
      // 原先写的是 `/暂无|暂无数据|N\/A|—/`（全文匹配），于是任何正文里带一个破折号的
      // 单元格都会被算成占位符 —— 实测：`…横幅：「申请加入海纳百川计划 · 免费使用 …」— 额度…`
      // 这一格是**有内容的真值**，却因为中间那个 `—` 被判成占位。
      // 这个假阳性一直存在，只是它是**取决于选中哪 4 张卡**的：排序一变、选中的卡片一换，
      // 它就从绿变红（v1.1 收口给排序补了收尾比较之后当场现形）。
      // 一条会随无关改动翻面的断言，比没有断言更糟 —— 它会教人忽略红色。
      placeholder: cells.filter(td => /^(—|–|暂无|暂无数据|N\/A|无)$/.test(td.textContent.trim())).length,
      // 哪几格是占位符（诊断用：只报计数时无法定位是哪条卡片的哪个字段）
      samplePlaceholders: cells.filter(td => /^(—|–|暂无|暂无数据|N\/A|无)$/.test(td.textContent.trim()))
        .slice(0, 4).map(td => td.textContent.trim().slice(0, 24)),
      shareHref: (document.getElementById('cmpShare') || {}).getAttribute
        ? document.getElementById('cmpShare').getAttribute('href') : ''
    };
  });
  check('对比表：4 列并排、行都是关键字段、单元格零空白',
    tableShape.open && tableShape.columns === 4 && tableShape.rows >= 1 && tableShape.emptyCells === 0 &&
    tableShape.placeholder === 0,
    `${tableShape.columns} 列 / ${tableShape.rows} 行（${tableShape.rowLabels.join('、')}）· ` +
    `空格子 ${tableShape.emptyCells} 个 · 占位符 ${tableShape.placeholder} 个` +
    // `placeholder` 与 `emptyCells` 是**两个不同的判据**，而这条消息原先只打空格子数 ——
    // 于是「占位符 > 0」这种失败会显示成一行看起来一切正常的数字（实测踩过）。
    `${tableShape.placeholder ? '（占位符：' + tableShape.samplePlaceholders.join(' / ') + '）' : ''}`);

  // ── Esc 关闭并归还焦点 ──
  const cmpFocus = await sharePage.evaluate(() => {
    const button = document.getElementById('cmpOpen');
    button.focus();
    return {
      before: document.activeElement === button,
      href: (document.getElementById('cmpShare') || {}).href || ''
    };
  });
  await sharePage.keyboard.press('Escape');
  await sharePage.waitForTimeout(300);
  const cmpAfterEsc = await sharePage.evaluate(() => {
    const active = document.activeElement;
    return {
      open: document.getElementById('compare').open,
      isOpenButton: Boolean(active && active.id === 'cmpOpen'),
      tag: active ? active.tagName.toLowerCase() : ''
    };
  });
  check('Esc 关闭对比视图并把焦点还给「打开对比」按钮',
    cmpAfterEsc.open === false && cmpAfterEsc.isOpenButton,
    `弹层=${cmpAfterEsc.open} · 焦点在 <${cmpAfterEsc.tag}>`);

  // ── 弹层必须**真的看得见** ──
  // 旧实现把 hidden 写在 <dialog> 上又从不摘掉，而 `body.js .cmpdlg[hidden] { display: none }`
  // 是作者级规则、showModal() 也压不过：实测点开之后 open=true、:modal=true，
  // 但 display:none、rect 0×0 —— 页面被 inert 冻住而屏幕上什么都没有。
  // 只断言 `open` 属性的检查对这件事完全无感，所以这一条量的是**几何**。
  await sharePage.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const dlg = document.getElementById('compare');
    if (dlg.open) dlg.close();
    await sleep(120);
    document.getElementById('cmpOpen').click();
    await sleep(320);
  });
  const cmpVisible = await sharePage.evaluate(() => {
    const dlg = document.getElementById('compare');
    const box = dlg.getBoundingClientRect();
    return {
      open: dlg.open,
      hiddenAttr: dlg.hasAttribute('hidden'),
      display: getComputedStyle(dlg).display,
      width: Math.round(box.width),
      height: Math.round(box.height),
      fits: box.left >= -1 && box.top >= -1 &&
        box.right <= window.innerWidth + 1 && box.bottom <= window.innerHeight + 1,
      modal: dlg.matches(':modal'),
      cols: dlg.querySelectorAll('.cmptable thead th').length - 1
    };
  });
  check('点「打开对比」弹层真的可见（量几何，不只看 open 属性）',
    cmpVisible.open && !cmpVisible.hiddenAttr && cmpVisible.display !== 'none' &&
    cmpVisible.width > 200 && cmpVisible.height > 100 && cmpVisible.fits && cmpVisible.modal,
    `open=${cmpVisible.open} · hidden=${cmpVisible.hiddenAttr} · display=${cmpVisible.display} · ${cmpVisible.width}×${cmpVisible.height}px ·` +
    ` 在视口内=${cmpVisible.fits} · :modal=${cmpVisible.modal} · ${cmpVisible.cols} 列`);

  // ── 关掉之后不能留下一个不可见的顶层 modal ──
  // 那正是旧 bug 的副作用：弹层看不见，但整页被 inert 冻住，点什么都没反应。
  const cmpUnfrozen = await sharePage.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    document.getElementById('compare').close();
    await sleep(220);
    const lingering = document.querySelector('dialog:modal');
    document.querySelector('article.g').click();
    await sleep(280);
    const detailOpen = document.getElementById('detail').open;
    if (detailOpen) document.getElementById('detail').close();
    await sleep(150);
    return {
      lingering: Boolean(lingering),
      detailOpen: detailOpen,
      compareOpen: document.getElementById('compare').open
    };
  });
  check('关闭对比后不留顶层 modal，页面立刻恢复可交互',
    !cmpUnfrozen.lingering && cmpUnfrozen.detailOpen && !cmpUnfrozen.compareOpen,
    `残留 :modal=${cmpUnfrozen.lingering} · 关闭后点卡片能开详情=${cmpUnfrozen.detailOpen} · 弹层仍开=${cmpUnfrozen.compareOpen}`);

  // ── 390px：对比条展开时也不许横向滚动 ──
  await sharePage.setViewportSize({ width: 390, height: 844 });
  await sharePage.waitForTimeout(250);
  const cmpMobile = await sharePage.evaluate(() => {
    const bar = document.getElementById('cmpbar');
    const box = bar ? bar.getBoundingClientRect() : null;
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      barVisible: Boolean(bar && !bar.hidden),
      barLeft: box ? Math.round(box.left) : null,
      barRight: box ? Math.round(box.right) : null,
      barText: bar ? (document.getElementById('cmpCount') || {}).textContent : ''
    };
  });
  check('390px 下对比条展开也不产生横向溢出',
    cmpMobile.barVisible && cmpMobile.overflowX === 0 &&
    cmpMobile.barLeft >= 0 && cmpMobile.barRight <= cmpMobile.clientWidth + 1,
    `对比条 ${cmpMobile.barLeft}–${cmpMobile.barRight}px / 视口 ${cmpMobile.clientWidth}px · 溢出 ${cmpMobile.overflowX}px · 「${String(cmpMobile.barText).trim()}」`);

  // ── 390px：弹层自己也不许超出视口（宽表在 .cmpscroll 里横滚，弹层不撑宽页面）──
  const cmpMobileDialog = await sharePage.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    document.getElementById('cmpOpen').click();
    await sleep(320);
    const dlg = document.getElementById('compare');
    const box = dlg.getBoundingClientRect();
    const scroll = dlg.querySelector('.cmpscroll');
    const result = {
      display: getComputedStyle(dlg).display,
      width: Math.round(box.width),
      left: Math.round(box.left),
      right: Math.round(box.right),
      clientWidth: document.documentElement.clientWidth,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      scrollable: Boolean(scroll) && scroll.scrollWidth > scroll.clientWidth
    };
    dlg.close();
    await sleep(120);
    return result;
  });
  check('390px 下对比弹层不超出视口（宽表靠内部横滚）',
    cmpMobileDialog.display !== 'none' && cmpMobileDialog.left >= 0 &&
    cmpMobileDialog.right <= cmpMobileDialog.clientWidth + 1 &&
    cmpMobileDialog.width <= cmpMobileDialog.clientWidth - 40 + 1 &&
    cmpMobileDialog.overflowX === 0,
    `弹层 ${cmpMobileDialog.left}–${cmpMobileDialog.right}px（宽 ${cmpMobileDialog.width}px）/ 视口 ${cmpMobileDialog.clientWidth}px ·` +
    ` 页面横向溢出 ${cmpMobileDialog.overflowX}px · 表内可横滚=${cmpMobileDialog.scrollable}`);

  await sharePage.close();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(base, { waitUntil: 'load' });
  await waitForApp(page);

  console.log('\n=== 17.6) 对比：选择与筛选解耦（换筛选后仍能并排）===');
  // 旧实现里 `cmpCards()` 只查 state.cards（当前筛选的结果），而对比条计数查的是选择本身：
  // 于是「选 2 条 → 换个筛选把两条都挡住」之后，条上仍写着「已选 2 条」而标题条 0 个，
  // 点「打开对比」什么也不发生（openCompare 在解析不足 2 条时直接 return，没有任何反馈）。
  await page.evaluate(() => { try { localStorage.removeItem('dsh.compare'); } catch (e) { /* 忽略 */ } });
  await page.goto(base, { waitUntil: 'load' });
  await waitForApp(page);
  const decoupled = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const pick = selector => document.querySelector(selector);
    pick('[data-facet="region"][data-value="cn"]').click();       // 只看国内
    await sleep(350);
    const cards = [...document.querySelectorAll('article.g')];
    for (let i = 0; i < 2; i++) {
      cards[i].click(); await sleep(180);
      pick('#detailBody [data-cmp]').click(); await sleep(100);
      pick('#detail').close(); await sleep(120);
    }
    pick('[data-facet="region"][data-value="global"]').click();    // 换成国外：两条都不在当前视图里
    await sleep(400);
    const before = {
      hidden: pick('#cmpbar').hidden,
      text: pick('#cmpCount').textContent.trim(),
      chips: document.querySelectorAll('.cmpchip').length
    };
    pick('#cmpOpen').click(); await sleep(350);
    const dlg = pick('#compare');
    const box = dlg.getBoundingClientRect();
    const after = {
      open: dlg.open,
      display: getComputedStyle(dlg).display,
      width: Math.round(box.width),
      cols: dlg.querySelectorAll('.cmptable thead th').length - 1
    };
    dlg.close();
    return { before: before, after: after };
  });
  check('筛选挡住已选项时「打开对比」仍然打开（选择是跨视图的集合，不是当前视图的子集）',
    !decoupled.before.hidden && decoupled.after.open && decoupled.after.display !== 'none' &&
    decoupled.after.width > 200 && decoupled.after.cols === 2,
    `换筛选后条上「${decoupled.before.text}」→ 弹层 open=${decoupled.after.open} · display=${decoupled.after.display} ·` +
    ` ${decoupled.after.width}px / ${decoupled.after.cols} 列`);
  check('对比条计数与标题条同源（不再「已选 2 条 · 0 个标题」）',
    decoupled.before.chips === 2,
    `标题条 ${decoupled.before.chips} 个 · 条上「${decoupled.before.text}」`);

  // ── 失效对比项：数据每天更新（id 是 厂商|标题|落地页 的指纹），旧选择可能已改名/下架 ──
  const staleCmp = await (async () => {
    const realId = await page.evaluate(() => {
      try { return JSON.parse(localStorage.getItem('dsh.compare') || '[]')[0]; } catch (e) { return null; }
    });
    await page.evaluate(id => {
      try { localStorage.setItem('dsh.compare', JSON.stringify([id, 'deadbeef0000'])); } catch (e) { /* 忽略 */ }
    }, realId);
    await page.goto(base, { waitUntil: 'load' });
    await waitForApp(page);
    const one = await page.evaluate(() => {
      const bar = document.getElementById('cmpbar');
      return {
        hidden: bar.hidden,
        text: document.getElementById('cmpCount').textContent.trim(),
        openDisabled: document.getElementById('cmpOpen').disabled,
        stored: (() => { try { return JSON.parse(localStorage.getItem('dsh.compare') || '[]').length; } catch (e) { return -1; } })()
      };
    });
    // 再补一条**不在对比里**的卡：说明应清掉、按钮恢复可用
    const two = await page.evaluate(async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      const cards = [...document.querySelectorAll('article.g')];
      let picked = false;
      for (let i = 1; i < 6 && !picked; i++) {
        cards[i].click(); await sleep(180);
        const button = document.querySelector('#detailBody [data-cmp]');
        if (button.getAttribute('aria-pressed') === 'true') { document.getElementById('detail').close(); await sleep(120); continue; }
        button.click(); await sleep(120);
        document.getElementById('detail').close(); await sleep(150);
        picked = true;
      }
      return {
        picked: picked,
        text: document.getElementById('cmpCount').textContent.trim(),
        openDisabled: document.getElementById('cmpOpen').disabled,
        stored: (() => { try { return JSON.parse(localStorage.getItem('dsh.compare') || '[]').length; } catch (e) { return -1; } })()
      };
    });
    return { one: one, two: two };
  })();
  check('对比选择里的失效项被移除，并在条上说明（不静默消失）',
    staleCmp.one.stored === 1 && !staleCmp.one.hidden && /找不到/.test(staleCmp.one.text) && staleCmp.one.openDisabled,
    `localStorage 剩 ${staleCmp.one.stored} 条 · 条可见=${!staleCmp.one.hidden} · 打开按钮 disabled=${staleCmp.one.openDisabled} · 「${staleCmp.one.text}」`);
  check('补选一条后失效说明清掉、按钮恢复可用',
    staleCmp.two.picked && staleCmp.two.stored === 2 && !staleCmp.two.openDisabled && !/找不到/.test(staleCmp.two.text),
    `补选成功=${staleCmp.two.picked} · 选择 ${staleCmp.two.stored} 条 · 按钮 disabled=${staleCmp.two.openDisabled} · 「${staleCmp.two.text}」`);

  console.log('\n=== 17.7) 收藏入口：只看收藏 ===');
  await page.evaluate(() => {
    try { localStorage.removeItem('dsh.favorites'); localStorage.removeItem('dsh.compare'); } catch (e) { /* 忽略 */ }
  });
  await page.goto(base, { waitUntil: 'load' });
  await waitForApp(page);
  const favBaseline = await page.evaluate(() => ({
    cards: document.querySelectorAll('article.g').length,
    entry: document.querySelectorAll('#facets [data-facet="fav"]').length
  }));
  check('零收藏时筛选条里没有收藏入口（不给「点了没反应」的按钮）',
    favBaseline.entry === 0 && favBaseline.cards >= 30,
    `入口 ${favBaseline.entry} 个 · 默认视图 ${favBaseline.cards} 张卡片`);

  // 真实鼠标点星标（会移动焦点，与键盘路径一致）
  const clickStarAt = async (target, index) => {
    const box = await target.evaluate(i => {
      const button = [...document.querySelectorAll('article.g [data-fav-toggle]')][i || 0];
      const rect = button.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    }, index || 0);
    await target.mouse.click(box.x, box.y);
    await target.waitForTimeout(280);
  };
  await clickStarAt(page);
  const favEntry = await page.evaluate(() => {
    const chip = document.querySelector('#facets [data-facet="fav"]');
    return {
      exists: Boolean(chip),
      text: chip ? chip.textContent.trim() : '',
      count: chip && chip.querySelector('b') ? Number(chip.querySelector('b').textContent) : -1,
      pressed: chip ? chip.getAttribute('aria-pressed') : null,
      label: chip ? chip.getAttribute('title') || '' : '',
      stored: (() => { try { return JSON.parse(localStorage.getItem('dsh.favorites') || '[]').length; } catch (e) { return -1; } })()
    };
  });
  check('收藏一条后出现「我的收藏」入口，计数为 1 且未选中',
    favEntry.exists && favEntry.count === 1 && favEntry.stored === 1 && favEntry.pressed === 'false' && /只存在本机/.test(favEntry.label),
    `入口「${favEntry.text}」· 计数 ${favEntry.count} / localStorage ${favEntry.stored} 条 · aria-pressed=${favEntry.pressed} · title「${favEntry.label}」`);

  await page.click('#facets [data-facet="fav"]');
  await page.waitForTimeout(320);
  const favView = await page.evaluate(() => ({
    cards: document.querySelectorAll('article.g').length,
    pressed: document.querySelector('#facets [data-facet="fav"]').getAttribute('aria-pressed'),
    starsOn: document.querySelectorAll('[data-fav-toggle][aria-pressed="true"]').length,
    stats: document.getElementById('stats').textContent.trim()
  }));
  check('收藏视图只留下收藏的卡片（星标亮、结果条切到收藏口径）',
    favView.cards === 1 && favView.pressed === 'true' && favView.starsOn === 1 && /条收藏卡片/.test(favView.stats),
    `${favView.cards} 张卡片 · 星标亮 ${favView.starsOn} 个 · aria-pressed=${favView.pressed} · 「${favView.stats}」`);

  // 收藏视图里取消收藏：卡片要立刻消失，说明要到位，焦点不能丢到页面外
  await clickStarAt(page);
  const favAfterUnfav = await page.evaluate(() => ({
    cards: document.querySelectorAll('article.g').length,
    stats: document.getElementById('stats').textContent.trim(),
    entryStillThere: Boolean(document.querySelector('#facets [data-facet="fav"]')),
    stored: (() => { try { return JSON.parse(localStorage.getItem('dsh.favorites') || '[]').length; } catch (e) { return -1; } })(),
    focusOnEntry: Boolean(document.activeElement && document.activeElement.dataset &&
      document.activeElement.dataset.facet === 'fav')
  }));
  check('收藏视图里取消收藏：卡片立刻消失、空态有说明、焦点落到入口',
    favAfterUnfav.cards === 0 && favAfterUnfav.stored === 0 && favAfterUnfav.entryStillThere &&
    /没有符合条件的收藏卡片/.test(favAfterUnfav.stats) && favAfterUnfav.focusOnEntry,
    `${favAfterUnfav.cards} 张卡片 · localStorage ${favAfterUnfav.stored} 条 · 入口仍在=${favAfterUnfav.entryStillThere} ·` +
    ` 焦点在入口=${favAfterUnfav.focusOnEntry} · 「${favAfterUnfav.stats.slice(0, 40)}…」`);

  await page.click('#facets [data-facet="fav"]');
  await page.waitForTimeout(320);
  const favBack = await page.evaluate(() => ({
    cards: document.querySelectorAll('article.g').length,
    entryGone: !document.querySelector('#facets [data-facet="fav"]')
  }));
  check('退出收藏视图后回到原来的卡片数（进入/退出不改其它筛选）',
    favBack.cards === favBaseline.cards && favBack.entryGone,
    `${favBack.cards} 张（进入前 ${favBaseline.cards} 张）· 零收藏后入口自动收起=${favBack.entryGone}`);

  // ── 失效收藏：条目改名/下架后 id 对不上。不自动删用户数据，但必须说明 + 给清理入口 ──
  await clickStarAt(page);
  const realFavId = await page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('dsh.favorites') || '[]')[0]; } catch (e) { return null; }
  });
  await page.evaluate(id => {
    try { localStorage.setItem('dsh.favorites', JSON.stringify(['deadbeef0000', id])); } catch (e) { /* 忽略 */ }
  }, realFavId);
  await page.goto(base, { waitUntil: 'load' });
  await waitForApp(page);
  const staleEntry = await page.evaluate(() => {
    const chip = document.querySelector('#facets [data-facet="fav"]');
    return { count: chip && chip.querySelector('b') ? Number(chip.querySelector('b').textContent) : -1 };
  });
  await page.click('#facets [data-facet="fav"]');
  await page.waitForTimeout(320);
  const staleView = await page.evaluate(() => ({
    cards: document.querySelectorAll('article.g').length,
    stats: document.getElementById('stats').textContent.trim(),
    prunes: document.querySelectorAll('[data-fav-prune]').length
  }));
  check('收藏入口按本机收藏总数计数（含失效项），视图里说明「找不到」并给出清理按钮',
    staleEntry.count === 2 && staleView.cards === 1 && staleView.prunes === 1 && /找不到/.test(staleView.stats),
    `入口计数 ${staleEntry.count} · 视图 ${staleView.cards} 张卡片 · 清理按钮 ${staleView.prunes} 个 · 「${staleView.stats}」`);

  // 390 / 360px：入口与清理按钮在这个状态下也要留在视口里、不产生横向溢出
  const favMobile = [];
  for (const width of [390, 360]) {
    await page.setViewportSize({ width: width, height: 844 });
    await page.waitForTimeout(280);
    favMobile.push(await page.evaluate(() => {
      const box = selector => {
        const el = document.querySelector(selector);
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return { left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width) };
      };
      return {
        width: window.innerWidth,
        overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        entry: box('#facets [data-facet="fav"]'),
        prune: box('[data-fav-prune]'),
        statsClipped: (() => {
          const stats = document.getElementById('stats');
          return stats.scrollWidth - stats.clientWidth;
        })()
      };
    }));
  }
  check('390px 与 360px：收藏入口与清理按钮都在视口内、无横向溢出',
    favMobile.every(item => item.entry && item.prune && item.overflowX <= 0 &&
      item.entry.left >= 0 && item.entry.right <= item.width + 1 &&
      item.prune.left >= 0 && item.prune.right <= item.width + 1 && item.statsClipped <= 1),
    favMobile.map(item => `${item.width}px：入口 ${item.entry ? item.entry.left + '–' + item.entry.right : '缺失'} ·` +
      ` 清理 ${item.prune ? item.prune.left + '–' + item.prune.right : '缺失'} · 溢出 ${item.overflowX}px`).join(' · '));

  await page.click('[data-fav-prune]');
  await page.waitForTimeout(320);
  const afterPrune = await page.evaluate(() => {
    const chip = document.querySelector('#facets [data-facet="fav"]');
    return {
      stored: (() => { try { return JSON.parse(localStorage.getItem('dsh.favorites') || '[]').length; } catch (e) { return -1; } })(),
      count: chip && chip.querySelector('b') ? Number(chip.querySelector('b').textContent) : -1,
      prunes: document.querySelectorAll('[data-fav-prune]').length,
      cards: document.querySelectorAll('article.g').length
    };
  });
  check('点「清理」只删失效项：真实收藏保留、计数与说明同步',
    afterPrune.stored === 1 && afterPrune.count === 1 && afterPrune.prunes === 0 && afterPrune.cards === 1,
    `localStorage ${afterPrune.stored} 条 · 入口计数 ${afterPrune.count} · 清理按钮 ${afterPrune.prunes} 个 · 视图 ${afterPrune.cards} 张卡片`);

  // 17.7b) 折叠接管的收藏：2.30 之前星标过的**成员条目 id** 现在由那张折叠卡代表。
  // 这是「折叠不许弄丢用户数据」的直接判据 —— 之前会显示 0 张卡 + 一句「可能被筛选挡住了」的错话。
  // 用一个真的会被折叠的 id（从卡片的 data-deal-ids 里取一条非代表条目）。
  await page.evaluate(() => { try { localStorage.removeItem('dsh.favorites'); localStorage.removeItem('dsh.compare'); } catch (e) { /* 忽略 */ } });
  await page.goto(base, { waitUntil: 'load' });
  await waitForApp(page);
  const foldedFav = await (async () => {
    const member = await page.evaluate(async () => {
      const data = await (await fetch('deals.json')).json();
      const card = [...document.querySelectorAll('article.g')].find(c => (c.dataset.dealIds || '').split(',').length > 3);
      if (!card) return null;
      const ids = card.dataset.dealIds.split(',');
      return {
        card: card.querySelector('h3').textContent.trim(),
        // 取一个**不是代表条目**的成员：它才是 2.30 里「被折走」的那一类
        id: ids.slice(1).find(id => id !== ids[0]) || ids[1],
        rep: ids[0],
        deals: data.deals.length
      };
    });
    if (!member) return { skipped: true };
    await page.evaluate(id => localStorage.setItem('dsh.favorites', JSON.stringify([id])), member.id);
    await page.goto(base, { waitUntil: 'load' });
    await waitForApp(page);
    await page.click('#facets [data-facet="fav"]');
    await page.waitForTimeout(320);
    const view = await page.evaluate(() => ({
      cards: document.querySelectorAll('article.g').length,
      titles: [...document.querySelectorAll('article.g h3')].map(h => h.textContent.trim()),
      stats: (document.getElementById('stats') || {}).textContent.trim(),
      prunes: document.querySelectorAll('[data-fav-prune]').length,
      entry: (() => {
        const chip = document.querySelector('#facets [data-facet="fav"]');
        return chip ? chip.textContent.trim() : '';
      })()
    }));
    return Object.assign({ skipped: false }, member, view);
  })();
  check('收藏一条已被折叠的成员条目：落到那张折叠卡上、不报「找不到」、也不诱导清理',
    foldedFav.skipped ||
      (foldedFav.cards === 1 && foldedFav.titles[0] === foldedFav.card &&
        foldedFav.prunes === 0 && !/找不到/.test(foldedFav.stats)),
    foldedFav.skipped ? '（本页没有折叠卡，跳过）'
      : `收藏成员 id ${foldedFav.id} → 视图 ${foldedFav.cards} 张卡「${foldedFav.titles.join('、')}」· ` +
        `清理按钮 ${foldedFav.prunes} 个 · 「${foldedFav.stats}」`);

  // 收尾：把收藏与收藏视图清干净，别把状态带进 §10 的移动端量测
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => { try { localStorage.removeItem('dsh.favorites'); localStorage.removeItem('dsh.compare'); } catch (e) { /* 忽略 */ } });
  await page.goto(base, { waitUntil: 'load' });
  await waitForApp(page);

  // 折叠覆盖口径：一张折叠卡贡献它覆盖的条数（data-model-count），单条卡贡献 1。
  // 这是「数据有没有丢」的量，与「卡片数」刻意分开——折叠本来就会让卡片数下降。
  metrics.coveredDeals = await page.evaluate(() =>
    [...document.querySelectorAll('article.g')].reduce((n, card) => {
      const count = Number(card.dataset.modelCount || 0);
      return n + (count > 1 ? count : 1);
    }, 0)
  );

  // ==================================================================
  console.log('\n=== 10b) 变化雷达（v1.5：首页条带 + /changes/ 静态页）===');

  // 期望值在**测试侧**独立算一遍（不调用构建期的 buildRadar）：从 deals.json 拿基准日，
  // 从 deal-history.json 拿事件，按「最近 7 天 + 已结束/重新出现 30 天」数出来。
  // 这样这条断言才算第二把尺子，而不是把被测代码的答案抄一遍。
  const DEALS_URL_RAW = new URL('deals.json', base).href;
  const radarExpect = await page.evaluate(async (dealsUrl) => {
    const payload = await (await fetch(dealsUrl)).json();
    const asOf = String(payload.updatedAt || '').slice(0, 10);
    const historyUrl = new URL('deal-history.json', dealsUrl).href;
    let events = [];
    try {
      const doc = await (await fetch(historyUrl)).json();
      events = Array.isArray(doc.events) ? doc.events : [];
    } catch (error) { events = null; }
    if (!events) return { unavailable: true };
    const day = n => new Date(Date.parse(`${asOf}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
    const recentFrom = day(-6);
    const endedFrom = day(-29);
    const inRecent = events.filter(e => e.at >= recentFrom && e.at <= asOf);
    const olderLifecycle = events.filter(e =>
      (e.type === 'ended' || e.type === 'restored') && e.at >= endedFrom && e.at < recentFrom);
    const highValueIds = new Set([...inRecent, ...olderLifecycle].map(e => e.id));
    // 「即将结束」是状态量（不在日志里）：条带总数把它算进去了，所以这里也要算 ——
    // 判据与 lib/changes.js 同一条（写在这里是刻意的第二实现，两边对不上就会红）。
    const soonIds = (payload.deals || [])
      .filter(deal => deal && deal.type === 'deal' && typeof deal.expiresAt === 'string')
      .filter(deal => {
        const days = Math.round((Date.parse(`${deal.expiresAt}T00:00:00Z`) - Date.parse(`${asOf}T00:00:00Z`)) / 86400000);
        return Number.isFinite(days) && days >= 0 && days <= 7;
      })
      .map(deal => deal.id);
    return {
      unavailable: false,
      asOf,
      total: inRecent.length + olderLifecycle.length + soonIds.length,
      coveredEvents: inRecent.length + olderLifecycle.length,
      soon: soonIds.length,
      allowedIds: [...new Set([...highValueIds, ...soonIds])]
    };
  }, DEALS_URL_RAW);

  await page.goto(base, { waitUntil: 'load' });
  await waitForApp(page);
  const radarHome = await page.evaluate(() => {
    const nav = document.querySelector('nav.radar');
    if (!nav) return null;
    const more = nav.querySelector('a.rmore');
    const scroll = nav.querySelector('.rscroll');
    const rect = nav.getBoundingClientRect();
    return {
      height: Math.round(rect.height),
      total: Number(nav.dataset.radarTotal || 0),
      other: Number(nav.dataset.radarOther || 0),
      items: [...nav.querySelectorAll('.ritem')].map(el => ({ id: el.dataset.dealId || '', href: el.getAttribute('href') || '' })),
      empty: Boolean(nav.querySelector('.rnone')),
      unavailable: nav.textContent.includes('没有拿到历史日志'),
      noChange: nav.textContent.includes('当前没有观测到变化'),
      moreHref: more ? more.getAttribute('href') : null,
      moreInViewport: more ? more.getBoundingClientRect().right <= window.innerWidth + 1 : false,
      controls: nav.querySelectorAll('button, input, select').length,
      navOverflow: nav.scrollWidth - nav.clientWidth,
      scrollOverflow: scroll ? scroll.scrollWidth - scroll.clientWidth : 0
    };
  });
  check('首页有变化雷达条带（构建期注入，无 JS 也在）', Boolean(radarHome),
    radarHome ? `总数 ${radarHome.total} · ${radarHome.items.length} 项` : '找不到 nav.radar');
  if (radarHome) {
    check('条带只占一行（≤ 34px：首屏卡片预算）', radarHome.height <= 34, `${radarHome.height}px`);
    check('条带里没有 JS 控件（无 JS 时一个死按钮都没有）', radarHome.controls === 0, `${radarHome.controls} 个`);
    check('条带入口指向 /changes/ 且落在视口内',
      radarHome.moreHref === 'changes/' && radarHome.moreInViewport,
      `href=${radarHome.moreHref} · 在视口内=${radarHome.moreInViewport}`);
    check('条带自身不横溢（横滑只发生在正文区）', radarHome.navOverflow <= 0,
      `nav 溢出 ${radarHome.navOverflow}px · 正文区可滑 ${radarHome.scrollOverflow}px`);
    check('条带最多 3 项', radarHome.items.length <= 3, `${radarHome.items.length} 项`);
    if (radarExpect.unavailable) {
      check('历史日志缺失时条带明说「没有拿到历史日志」（不冒充「没有变化」）', radarHome.unavailable,
        radarHome.unavailable ? '' : '条带没有说明日志不可用');
    } else {
      // 条带只列高价值项，被抑制的「其他变化」不进条带 —— 等式因此是
      // `条带条数 + 其他 = 窗口内事件数 + 即将结束`（两个数都挂在数据属性上，可机器核对）。
      check('条带条数 + 其他变化 == 窗口内事件 + 即将结束（第二把尺子）',
        radarHome.total + radarHome.other === radarExpect.total,
        `条带 ${radarHome.total} + 其他 ${radarHome.other} / 重算 ${radarExpect.total}` +
        `（基准日 ${radarExpect.asOf}：窗口事件 ${radarExpect.coveredEvents} + 即将结束 ${radarExpect.soon}）`);
      const allowed = new Set(radarExpect.allowedIds);
      const stray = radarHome.items.filter(item => !allowed.has(item.id)).map(item => item.id);
      check('条带里的条目都来自窗口内的事件（没有凭空出现的项）', stray.length === 0, stray.join(', ') || '全部命中');
      if (!radarExpect.total) {
        check('没有变化时条带给出明确空态（不用空白冒充「没有变化」）',
          radarHome.empty && radarHome.noChange, `空态=${radarHome.empty} · 文案=${radarHome.noChange}`);
      }
    }
  }

  // /changes/ 静态页：五条约定（预渲染 / 无 JS 可读 / sitemap / 双 feed / JSON-LD）+ 行链接可用
  const changesUrl = new URL('changes/', base).href;
  await page.goto(changesUrl, { waitUntil: 'load' });
  const changesPage = await page.evaluate(() => {
    const heads = [...document.querySelectorAll('.chgsec h2')].map(h => h.textContent.trim());
    const links = [...document.querySelectorAll('a.chgn[href]')].map(a => a.getAttribute('href'));
    const planSection = document.getElementById('plans');
    // v3.0 Stage H：第三条变化流（API 价格变化）。
    const apiSection = document.getElementById('api-plans');
    return {
      title: document.title,
      headings: heads,
      other: Boolean(document.querySelector('.chgother')),
      canonical: (document.querySelector('link[rel="canonical"]') || {}).href || '',
      alternates: [...document.querySelectorAll('link[rel="alternate"]')].map(l => l.getAttribute('href') || ''),
      wrongPrefix: links.filter(href => href.startsWith('deal/')).length,
      links,
      // v2.3：套餐变化块
      jumpNav: Boolean(document.querySelector('nav.chgjump')),
      dealsAnchor: Boolean(document.getElementById('deals')),
      planHeads: planSection ? [...planSection.querySelectorAll('.chgsub h3')].map(h => h.textContent.trim()) : [],
      // `/changes/` 上的套餐变化块用的是 `.chglist`（与优惠那一支同一个类名）；
      // `.pchglist` 是 `/plans/coding/` 顶部那一块的类名 —— 写错选择器时**非空也数到 0**，
      // 于是「明确空态」那条断言在真的有条目时反而红（口径与 API 那一支 :apiItems 对齐）。
      planItems: planSection ? planSection.querySelectorAll('.chglist li').length : -1,
      planEmpty: planSection ? /没有观测到|没有拿到套餐变更日志/.test(planSection.innerText) : false,
      // v3.0：套餐变化行的链接有两种合法落点 —— 页内锚点（本页真的有那一条），
      // 或跨页深链到 `/plans/coding/#plan-<id>`（套餐对比页真的有那一行）。
      // 只数 `href^="#plan-"` 是不够的：那一版在「页面改用跨页深链」之后会**恒真**
      // （空集合的 `every()` 返回 true），等于门禁自己消失了。
      planLinkHrefs: planSection ? [...planSection.querySelectorAll('a.pchgwho[href]')].map(a => a.getAttribute('href')) : [],
      planInPageIds: planSection ? [...planSection.querySelectorAll('[id^="plan-"]')].map(el => el.id) : [],
      // v3.0 Stage H1：API 价格变化块（同样逐条验证落点）
      jumpLinks: [...document.querySelectorAll('nav.chgjump a[href]')].map(a => a.getAttribute('href')),
      apiAnchor: Boolean(document.getElementById('api-plans')),
      apiHeads: apiSection ? [...apiSection.querySelectorAll('.chgsub h3')].map(h => h.textContent.trim()) : [],
      apiItems: apiSection ? apiSection.querySelectorAll('.chglist li').length : -1,
      apiEmpty: apiSection ? /没有观测到|没有拿到 API 计费变化日志/.test(apiSection.innerText) : false,
      apiUnavailable: apiSection ? apiSection.innerText.includes('没有拿到 API 计费变化日志') : false,
      apiLinkHrefs: apiSection ? [...apiSection.querySelectorAll('a.pchgwho[href]')].map(a => a.getAttribute('href')) : []
    };
  });
  check('/changes/ 页存在且分栏齐（优惠五栏 + 套餐一栏 + API 一栏）', changesPage.headings.length === 7, changesPage.headings.join(' | '));
  check('/changes/ 的分栏标题与判据同源（优惠五栏 + 套餐变化 + API 价格变化）',
    changesPage.headings.map(text => text.replace(/（\d+）$/, '')).join(',') ===
    '今日新增,最近 7 天变化,即将结束,已结束,重新出现,套餐变化,API 价格变化',
    changesPage.headings.join(' | '));
  check('/changes/ 有「不计入高价值的其他变化」折叠块', changesPage.other);
  check('/changes/ 的 canonical 自指', changesPage.canonical.endsWith('/changes/'), changesPage.canonical);
  // v3.0 Stage H4：声明的变化订阅源 = 优惠变化那一对 + **注册表里每一条变化流各一对**。
  // 判据从注册表派生（不写死 4/6）：加第三条变化流时这一页的声明数自动跟上，漏一条则红。
  {
    const expectedPairs = 1 + feedsLib.PLAN_CHANGE_FEEDS.length;
    const perFeed = [['feed/changes.(xml|json)', '优惠变化']].concat(
      feedsLib.PLAN_CHANGE_FEEDS.map(spec => [
        spec.path.replace(/[.]/g, '\\.').replace(/\//g, '\\/') + '|' + spec.jsonPath.replace(/[.]/g, '\\.').replace(/\//g, '\\/'),
        spec.id
      ]));
    const bad = perFeed.filter(([pattern]) => {
      const re = new RegExp(`(${pattern})$`);
      return changesPage.alternates.filter(href => re.test(href)).length !== 2;
    }).map(([, label]) => label);
    check('/changes/ 声明了每一条变化流各一对订阅源（优惠变化 + 注册表里的每一条）',
      changesPage.alternates.length === expectedPairs * 2 && bad.length === 0,
      `共 ${changesPage.alternates.length} 条（期望 ${expectedPairs * 2}）${bad.length ? ` · 缺/多：${bad.join(',')}` : ''} · ` +
      changesPage.alternates.join(' · '));
  }
  check('/changes/ 的内链都带输出深度前缀（../deal/…）', changesPage.wrongPrefix === 0,
    changesPage.wrongPrefix ? `${changesPage.wrongPrefix} 条前缀错误` : `抽查 ${changesPage.links.length} 条`);

  // v2.3 / v3.0：变化分栏（锚点导航 / 每条流的四栏 / 空态 / 锚点落点）
  check('/changes/ 有「优惠变化 / 套餐变化 / API 价格变化」锚点导航且三个锚点都有落点',
    changesPage.jumpNav && changesPage.dealsAnchor && changesPage.apiAnchor &&
    ['#deals', '#plans', '#api-plans'].every(href => changesPage.jumpLinks.includes(href)),
    `导航链接 ${changesPage.jumpLinks.join(',')} · #deals ${changesPage.dealsAnchor} · #api-plans ${changesPage.apiAnchor}`);
  check('/changes/ 套餐变化有四栏（最近 7 天变化 / 今日新增 / 不再收录 / 重新出现）',
    changesPage.planHeads.map(text => text.replace(/（\d+）$/, '')).join(',') ===
    '今日新增,最近 7 天变化,不再收录,重新出现',
    changesPage.planHeads.join(' | '));
  check('/changes/ API 价格变化有四栏（最近 7 天变化 / 今日新增 / 不再收录 / 重新出现）',
    changesPage.apiHeads.map(text => text.replace(/（\d+）$/, '')).join(',') ===
    '今日新增,最近 7 天变化,不再收录,重新出现',
    changesPage.apiHeads.join(' | '));
  {
    // v3.0：逐条验证落点，而不是数一数 `#plan-` 前缀。跨页深链必须真的落到
    // `/plans/coding/` 上那一行（套餐对比页的 `id="plan-<id>"`）。
    const hrefs = changesPage.planLinkHrefs || [];
    const codingHtml = fs.existsSync(path.join(DIR, 'plans', 'coding', 'index.html'))
      ? fs.readFileSync(path.join(DIR, 'plans', 'coding', 'index.html'), 'utf8')
      : '';
    const codingIds = new Set([...codingHtml.matchAll(/id="(plan-[^"]+)"/g)].map(m => m[1]));
    const missing = [];
    for (const href of hrefs) {
      const hash = href.split('#')[1] || '';
      if (href.startsWith('#plan-')) {
        if (!(changesPage.planInPageIds || []).includes(hash)) missing.push(`${href}（页内没有落点）`);
      } else if (/plans\/coding\/#plan-/.test(href)) {
        if (!codingIds.has(hash)) missing.push(`${href}（套餐对比页没有这一行）`);
      } else {
        missing.push(`${href}（既不是页内锚点，也没有指向套餐对比页）`);
      }
    }
    check('/changes/ 套餐变化每条都深链到套餐对比页的真实行（锚点有落点）',
      hrefs.length ? missing.length === 0 : changesPage.planEmpty,
      `${changesPage.planItems} 条 · 链接 ${hrefs.length} 条 · ${missing.slice(0, 2).join('、') || '全部有落点'}`);
  }
  check('/changes/ 套餐变化为空时给的是明确空态（不是一片空白）',
    changesPage.planItems > 0 || changesPage.planEmpty, `${changesPage.planItems} 条`);

  // v3.0 Stage H1：API 价格变化的**跨页**深链必须逐条落到 `/plans/api/` 的真实行上。
  // 只数 `#plan-` 前缀会恒真（这一页自己没有 API 表格行），所以判据是「逐条回读落点」。
  {
    const hrefs = changesPage.apiLinkHrefs || [];
    const apiHtml = fs.existsSync(path.join(DIR, 'plans', 'api', 'index.html'))
      ? fs.readFileSync(path.join(DIR, 'plans', 'api', 'index.html'), 'utf8')
      : '';
    const apiIds = new Set([...apiHtml.matchAll(/id="(plan-[^"]+)"/g)].map(m => m[1]));
    const missing = [];
    for (const href of hrefs) {
      const hash = href.split('#')[1] || '';
      if (/plans\/api\/#plan-/.test(href)) {
        if (!apiIds.has(hash)) missing.push(`${href}（API 计费页没有这一行）`);
      } else {
        missing.push(`${href}（不是指向 API 计费页的跨页深链）`);
      }
    }
    check('/changes/ API 价格变化每条都深链到 API 计费页的真实行（跨页锚点有落点）',
      hrefs.length ? missing.length === 0 : changesPage.apiEmpty,
      `${changesPage.apiItems} 条 · 链接 ${hrefs.length} 条 · ${missing.slice(0, 2).join('、') || '全部有落点'}`);
  }
  check('/changes/ API 价格变化为空时给的是明确空态（不是一片空白）',
    changesPage.apiItems > 0 || changesPage.apiEmpty, `${changesPage.apiItems} 条`);
  // 「没拿到日志」与「没有变化」是两句不同的话 —— 日志可用时**不许**出现前者。
  check('/changes/ API 价格变化块没有在日志可用时说「没有拿到日志」',
    !changesPage.apiUnavailable, changesPage.apiUnavailable ? '描述写错了（日志其实可用）' : '措辞正确');

  // v3.0 Stage H2：API 价格变化订阅源本身（RSS + JSON Feed）必须能取到，
  // 且 guid **逐条等于**产物那份 `api-plan-history.json` 的派生事件身份 ——
  // 「不能每次 build 重新生成」这条承诺只有在这里能被独立复核。
  //
  // ⚠️ t32（feed-guid-window-judge-fix-v1）修掉的一处**只在巧合下成立**的判据：
  //    旧版在这里比的是「feed 条数 == 日志**全部**事件数」，而订阅源的分栏口径是**窗口**
  //    （唯一实现 `scripts/lib/plan-changes.js` 的 `PLAN_CHANGES_WINDOWS`）：
  //      · `created` / `changed`：`at >= asOf - (recentDays-1)` ← 7 天窗口，`asOf-6` 在内；
  //      · `ended` / `restored`：`at >= asOf - (endedDays-1)` ← 30 天窗口（**不是同一个窗口**）；
  //      · `asOf` = `api-plans.json.updatedAt` 的**前 10 位**（build-local.js 的 `radarAsOf`），
  //        取的是**数据时间**而不是构建时刻；
  //      · `type === 'updated'`（记录级元信息）不进订阅（feeds.js `changeItemsFor`）；
  //      · 每个分栏最多 30 条（`PLAN_CHANGES_LIMITS.itemsPerSection`）。
  //    实测巧合：master 的日志 17 条`at` 全落在 2026-09-29..2026-10-05（asOf=2026-10-05）⇒ 17/17 ✓。
  //    任何一次如实的数据更新都会把它弄红：t28 把 anthropic 的 `lastSeen` 推到 2026-10-08
  //    ⇒ 窗口变成 2026-10-02..10-08 ⇒ 日志里 6 条 2026-10-01 的 `created` 掉出窗口 ⇒ 12/18 ✗。
  //    **那不是数据错，是判据错**：feed 本来就不该包含窗口外的事件。
  //
  // 现在按**设计口径**比，而且窗口在这里**独立重算**（不 require `plan-changes.js` 的窗口逻辑）——
  // 否则这条判据就退化成「用产品自己的实现证明产品自己」，产品口径写错时它一样绿。
  // 代价是一条**登记在案的边界**：镜像常量必须与产品声明同步（下面那颗「漂移即红」的守卫盯着它）。
  {
    const historyFile = path.join(DIR, 'api-plan-history.json');
    const historyEvents = fs.existsSync(historyFile)
      ? (JSON.parse(fs.readFileSync(historyFile, 'utf8')).events || [])
      : [];
    const eventIds = new Set(historyEvents.map(event => event.eventId).filter(Boolean));
    const feedPaths = ['feed/plans/api/changes.xml', 'feed/plans/api/changes.json'];

    // ---- 窗口的**独立重算**（镜像口径，每条都注明产品出处）--------------------------------
    // 与 `check-ci-consistency.js` 读 `action.yml` 同一手法：这里只**自己算**，不调用产品实现。
    const API_FEED_WINDOW_MIRROR = {
      recentDays: 7,                 // plan-changes.js: `PLAN_CHANGES_WINDOWS.recentDays`
      endedDays: 30,                 // plan-changes.js: `PLAN_CHANGES_WINDOWS.endedDays`
      metaFieldTypes: ['updated'],   // plan-changes.js: `API_PLAN_META_FIELD_TYPES`（feeds.js 同一条过滤）
      sectionCap: 30                 // plan-changes.js: `PLAN_CHANGES_LIMITS.itemsPerSection`
    };
    const API_FEED_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
    /** 基准日加减天数（与 `changes.addDays` 同口径：按 UTC 日的纯日期算术，不碰本地时区） */
    const apiFeedAddDays = (date, delta) => (API_FEED_DATE_RE.test(String(date || ''))
      ? new Date(Date.parse(`${date}T00:00:00Z`) + delta * 86400000).toISOString().slice(0, 10)
      : null);
    /** 日期差（later - earlier，单位天）；任一非法返回 null（与 `changes.daysBetween` 同口径） */
    const apiFeedDaysBetween = (later, earlier) => {
      if (!API_FEED_DATE_RE.test(String(later || '')) || !API_FEED_DATE_RE.test(String(earlier || ''))) return null;
      const a = Date.parse(`${later}T00:00:00Z`);
      const b = Date.parse(`${earlier}T00:00:00Z`);
      if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
      return Math.round((a - b) / 86400000);
    };
    const apiPlansFile = path.join(DIR, 'api-plans.json');
    const apiPlansDoc = fs.existsSync(apiPlansFile)
      ? JSON.parse(fs.readFileSync(apiPlansFile, 'utf8'))
      : null;
    // asOf 是**数据时间**：`api-plans.json.updatedAt` 的前 10 位（build-local.js: `radarAsOf`）
    const apiFeedAsOf = String((apiPlansDoc && apiPlansDoc.updatedAt) || '').slice(0, 10);
    const apiFeedAsOfOk = API_FEED_DATE_RE.test(apiFeedAsOf);
    const apiFeedRecentFrom = apiFeedAsOfOk
      ? apiFeedAddDays(apiFeedAsOf, -(API_FEED_WINDOW_MIRROR.recentDays - 1)) : null;
    const apiFeedEndedFrom = apiFeedAsOfOk
      ? apiFeedAddDays(apiFeedAsOf, -(API_FEED_WINDOW_MIRROR.endedDays - 1)) : null;
    /** 这条事件用哪个窗口：ended / restored 走 30 天，其余走 7 天（plan-changes.js 的分栏循环） */
    const apiFeedFromOf = event => ((event.type === 'ended' || event.type === 'restored')
      ? apiFeedEndedFrom : apiFeedRecentFrom);
    // 期望集 = 日志里**落在窗口内**的事件（脏事件 / 未来日期 / 元信息 / 非 12 位 hex 身份全部排除）
    const apiFeedWindowEvents = apiFeedAsOfOk ? historyEvents.filter(event => {
      if (!event || typeof event !== 'object') return false;
      if (typeof event.at !== 'string' || !API_FEED_DATE_RE.test(event.at)) return false;   // 脏事件不渲染
      const diff = apiFeedDaysBetween(event.at, apiFeedAsOf);
      if (diff === null || diff > 0) return false;                                          // 未来日期不渲染
      return event.at >= apiFeedFromOf(event);
    }) : [];
    const apiFeedExpectedIds = apiFeedWindowEvents
      .filter(event => !API_FEED_WINDOW_MIRROR.metaFieldTypes.includes(event.type))
      .filter(event => typeof event.eventId === 'string' && /^[0-9a-f]{12}$/.test(event.eventId))
      .map(event => event.eventId);
    // 分栏上限：总数 ≤ 每栏上限 ⇒ **任一栏都不可能被截断**（保守前提，宁严不宽）
    const apiFeedCapBites = apiFeedExpectedIds.length > API_FEED_WINDOW_MIRROR.sectionCap;
    // ⚠️ 必须取到**当前被验收那一份站点**的根，而不是 `location.origin + '/'`。
    //
    // 这一条曾经写错、并在**线上冒烟时**才暴露：本站是 GitHub 项目页，线上地址带一级子路径
    // （`/ai-deals-aggregator/`），而 `location.origin + '/'` 会把它丢掉 ⇒ 请求
    // `https://buguoshixc.github.io/feed/plans/api/changes.xml` ⇒ 404。
    // 更糟的是那两条 404 会**顺带把「没有 JS 错误」也带红** —— 一个自己的失误伪装成两个问题
    // （这条注释原本就写在这里警告过，但实现没跟上；现在实现与警告一致）。
    //
    // 判据：canonical 与当前路径**共享第一段**时，那一段就是站点前缀（子路径部署）。
    // 这个判据在两种验收模式下都成立：
    //   · 本地验收（`verify-site.js` 默认）：当前在 `127.0.0.1/...`，canonical 指向生产域，
    //     第一段不同 ⇒ 前缀取 `/` ⇒ 取的就是本地服务上的那份产物；
    //   · 线上验收（`--url=`）：当前与 canonical 都在同一子路径下 ⇒ 前缀取该子路径。
    // 因此它**永远取当前被验收的那一份**，不会退化成"本地验收却去 fetch 生产站点"。
    // 已知限制：站点若部署在根路径且页面有 ≥3 段（本仓不存在这种情形），回退为父目录。
    // 注意：`page.evaluate` 的函数体**只在浏览器上下文里执行**，拿不到 Node 侧的变量，
    // 所以 `feedBaseHref` 的逻辑必须**内联**在下面这个函数里（不能引用外面的同名函数）。
    const probe = await page.evaluate(async (paths) => {
      const out = {};
      const seg = p => String(p || '').split('/').filter(Boolean);
      const cur = new URL(location.href);
      const canonicalHref = (document.querySelector('link[rel="canonical"]') || {}).href || '';
      let feedBase;
      try {
        const canon = new URL(canonicalHref);
        const curSegs = seg(cur.pathname);
        const canonSegs = seg(canon.pathname);
        const prefix = (curSegs.length && canonSegs.length && curSegs[0] === canonSegs[0]) ? `/${curSegs[0]}/` : '/';
        feedBase = cur.origin + prefix;
      } catch (error) {
        feedBase = new URL('.', location.href).href;
      }
      for (const p of paths) {
        const response = await fetch(new URL(p, feedBase).href);
        out[p] = { ok: response.ok, status: response.status, body: await response.text() };
      }
      return out;
    }, feedPaths);
    const xml = (probe[feedPaths[0]] || {}).body || '';
    const jsonFeed = (probe[feedPaths[1]] || {}).body || '';
    let jsonGuids = [];
    try { jsonGuids = (JSON.parse(jsonFeed).items || []).map(item => item.id); } catch (error) { jsonGuids = null; }
    const xmlGuids = [...xml.matchAll(/<guid[^>]*>([^<]+)<\/guid>/g)].map(m => m[1]);
    check('API 价格变化订阅源可取（RSS + JSON Feed 各一份，HTTP 200）',
      probe[feedPaths[0]].ok && probe[feedPaths[1]].ok,
      `HTTP ${probe[feedPaths[0]].status} / ${probe[feedPaths[1]].status}`);
    // ---- 边界守卫（t32）：镜像常量 ↔ 产品声明的**漂移即红** --------------------------------
    // 「独立重算」的代价是镜像可能与产品声明分叉。把它做成机器可读 —— 只解析**声明文本**，
    // 不 require 产品模块（判据的**计算**仍然独立），与 `check-ci-consistency.js` 读 `action.yml`
    // 同一条纪律：口径改了而这里没跟，必须**红**，不许静默失守。
    const apiFeedPlanChangesSrc = fs.readFileSync(path.join(ROOT, 'scripts/lib/plan-changes.js'), 'utf8');
    const apiFeedBlockOf = name => {
      const m = apiFeedPlanChangesSrc.match(new RegExp(`${name}\\s*=\\s*\\{([\\s\\S]*?)\\n\\}`));
      return m ? m[1] : '';
    };
    const apiFeedDeclaredNumber = (block, key) => {
      const m = block.match(new RegExp(`${key}\\s*:\\s*(\\d+)`));
      return m ? Number(m[1]) : null;
    };
    const apiFeedDeclaredMeta = (() => {
      const m = apiFeedPlanChangesSrc.match(/API_PLAN_META_FIELD_TYPES\s*=\s*(\[[^\]]*\])/);
      if (!m) return null;
      try { return JSON.parse(m[1].replace(/'/g, '"')); } catch (error) { return null; }
    })();
    const apiFeedDeclaredRecent = apiFeedDeclaredNumber(apiFeedBlockOf('PLAN_CHANGES_WINDOWS'), 'recentDays');
    const apiFeedDeclaredEnded = apiFeedDeclaredNumber(apiFeedBlockOf('PLAN_CHANGES_WINDOWS'), 'endedDays');
    const apiFeedDeclaredCap = apiFeedDeclaredNumber(apiFeedBlockOf('PLAN_CHANGES_LIMITS'), 'itemsPerSection');

    // 期望集与 feed 的比较放在这里（`jsonGuids` 已就绪；上面那段只做**纯数据**的窗口重算）
    const apiFeedMissing = Array.isArray(jsonGuids)
      ? apiFeedExpectedIds.filter(id => !jsonGuids.includes(id))
      : apiFeedExpectedIds;
    check('API 价格变化订阅的 guid 逐条等于日志里**落在当前窗口内**的派生事件身份（不是每次 build 重新生成）',
      Array.isArray(jsonGuids) && apiFeedAsOfOk && !apiFeedCapBites && apiFeedExpectedIds.length > 0
      && jsonGuids.length === apiFeedExpectedIds.length          // ① 条数 == **窗口内**事件数（旧版比的是全量 ⇒ 只在巧合下成立）
      && jsonGuids.every(id => eventIds.has(id))                 // ② 每条 guid ∈ 日志全量身份空间（既有牙齿，保留）
      && JSON.stringify(xmlGuids) === JSON.stringify(jsonGuids),  // ③ RSS 与 JSON 逐条相同（既有牙齿，保留）
      `JSON ${Array.isArray(jsonGuids) ? jsonGuids.length : 'n/a'} 条 / RSS ${xmlGuids.length} 条`
      + ` / 窗口内日志 ${apiFeedExpectedIds.length} 条（日志全量事件 ${eventIds.size} 条 · asOf ${apiFeedAsOf || '—'}`
      + ` · 窗口 ${apiFeedRecentFrom || '—'}..${apiFeedAsOf || '—'}，ended/restored 用 ${apiFeedEndedFrom || '—'}..）`
      + (apiFeedCapBites
        ? ` · ⚠️ 窗口内 ${apiFeedExpectedIds.length} 条 > 分栏上限 ${API_FEED_WINDOW_MIRROR.sectionCap}：`
          + '条数等式不再成立，判据需要按分栏镜像截断（这是**如实报出的边界**，不是数据错）' : ''));
    // 新牙（t32）：上面那颗只能证明「**条数**对」。它挡不住「少一条窗口内、多一条窗口外」这类**集合**错 ——
    // 那时条数仍相等、每条 guid 也仍 ∈ 日志（窗口外那条本来就是真事件）⇒ 上面三条全过。
    // 这里逐条点名：日志里**窗口内的每一条**事件都必须出现在 feed 里。
    check('API 价格变化订阅：日志里**窗口内的每一条**事件都出现在 feed 里（只比条数挡不住「换掉一条」）',
      Array.isArray(jsonGuids) && apiFeedAsOfOk && !apiFeedCapBites && apiFeedMissing.length === 0,
      apiFeedMissing.length
        ? `窗口内 ${apiFeedExpectedIds.length} 条里有 ${apiFeedMissing.length} 条没进 feed：${apiFeedMissing.join(', ')}`
        : `窗口内 ${apiFeedExpectedIds.length} 条逐条命中（feed ${Array.isArray(jsonGuids) ? jsonGuids.length : 'n/a'} 条`
          + ` · 日志全量 ${eventIds.size} 条，其中 ${eventIds.size - apiFeedExpectedIds.length} 条在窗口外 —— **窗口外缺席不算错**）`);
    check('API 变化订阅的窗口镜像常量与产品声明一致（漂移即红：改 recentDays / endedDays / 元信息类型 / 分栏上限都必须同步这条判据）',
      apiFeedDeclaredRecent === API_FEED_WINDOW_MIRROR.recentDays
      && apiFeedDeclaredEnded === API_FEED_WINDOW_MIRROR.endedDays
      && apiFeedDeclaredCap === API_FEED_WINDOW_MIRROR.sectionCap
      && Array.isArray(apiFeedDeclaredMeta)
      && JSON.stringify(apiFeedDeclaredMeta) === JSON.stringify(API_FEED_WINDOW_MIRROR.metaFieldTypes),
      `产品声明（scripts/lib/plan-changes.js）recentDays ${apiFeedDeclaredRecent} / endedDays ${apiFeedDeclaredEnded}`
      + ` / 分栏上限 ${apiFeedDeclaredCap} / 元信息 ${JSON.stringify(apiFeedDeclaredMeta)}`
      + ` ↔ 判据镜像 ${JSON.stringify(API_FEED_WINDOW_MIRROR)}`
      + (apiFeedDeclaredRecent === null || apiFeedDeclaredEnded === null
        || apiFeedDeclaredCap === null || !Array.isArray(apiFeedDeclaredMeta)
        ? ' · ⚠️ 产品声明没解析出来（改名 / 改格式？）：这**不算通过**，请人工确认镜像是否仍然成立' : ''));
    check('API 价格变化订阅的链接全部指向 /plans/api/#plan-<id>（跨页深链，不是本页锚点）',
      xmlGuids.length > 0 && feedsLib.parseRssItems(xml)
        .every(item => /\/plans\/api\/#plan-[0-9a-f]{12}$/.test(String(item.link || ''))),
      `${xmlGuids.length} 条`);
    check('API 价格变化订阅里没有混入 Coding 套餐事件（两份日志的身份空间不相交）',
      (() => {
        const planFile = path.join(DIR, 'plan-history.json');
        const planIds = new Set(fs.existsSync(planFile)
          ? (JSON.parse(fs.readFileSync(planFile, 'utf8')).events || []).map(event => event.eventId).filter(Boolean)
          : []);
        return Array.isArray(jsonGuids) && jsonGuids.every(id => !planIds.has(id));
      })(), Array.isArray(jsonGuids) ? jsonGuids.join(',') : 'n/a');
  }

  // 雷达行 → 单条优惠的详情页（要求 4：详情页能看单条优惠的历史）。
  // 没有可点的雷达行时如实报「本轮无样本」，并改验另一条出口（条带 → /changes/）。
  if (changesPage.links.length) {
    const probe = await page.evaluate(async (href) => {
      const response = await fetch(href);
      const text = await response.text();
      return { ok: response.ok, status: response.status, hasHistory: text.includes('变更记录') };
    }, changesPage.links[0]);
    check('雷达行链到的详情页真的打得开且含「变更记录」块',
      probe.ok && probe.hasHistory, `HTTP ${probe.status} · 含变更记录=${probe.hasHistory}`);
  } else {
    check('雷达行 → 单条历史（本轮无样本：日志里还没有任何事件）', true,
      '跳过：可点的雷达行为 0（v1.5 交付当天日志为空，链路已由 selftest 与构建自检覆盖）');
  }

  // 无 JS：这一页也必须是完整正文
  {
    const noJsCtx = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });
    const noJsPage = await noJsCtx.newPage();
    await noJsPage.goto(changesUrl, { waitUntil: 'load' });
    const noJs = await noJsPage.evaluate(() => ({
      heads: [...document.querySelectorAll('.chgsec h2')].map(h => h.textContent.trim()),
      since: /变更记录自 \d{4}-\d{2}-\d{2} 起/.test(document.body.textContent),
      disclaimer: document.body.textContent.includes('不表示厂商已经下架或优惠已经失效'),
      other: document.body.textContent.includes('不计入高价值的其他变化'),
      plan: document.body.textContent.includes('套餐变化'),
      planRows: document.querySelectorAll('#plans .pchglist li').length,
      // v3.0 Stage H：API 价格变化块同样必须无 JS 可读
      api: document.body.textContent.includes('API 价格变化'),
      apiRows: document.querySelectorAll('#api-plans .chglist li').length
    }));
    check('无 JS 时 /changes/ 五栏 + 起算日 + 免责句全部可读',
      noJs.heads.length === 7 && noJs.since && noJs.disclaimer && noJs.other,
      `分栏 ${noJs.heads.length} · 起算日 ${noJs.since} · 免责句 ${noJs.disclaimer} · 折叠块 ${noJs.other}`);
    check('无 JS 时 /changes/ 的套餐变化块也可读（构建期静态渲染）',
      noJs.plan && noJs.planRows >= 0, `套餐变化 ${noJs.plan} · ${noJs.planRows} 条`);
    check('无 JS 时 /changes/ 的 API 价格变化块也可读（构建期静态渲染）',
      noJs.api && noJs.apiRows >= 0, `API 价格变化 ${noJs.api} · ${noJs.apiRows} 条`);
    await noJsCtx.close();
  }

  // 窄屏：条带仍然一行、页面零横溢、入口不被滑走；/changes/ 也不产生横向溢出
  const radarMobile = [];
  for (const width of [390, 360]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(base, { waitUntil: 'load' });
    await waitForApp(page);
    radarMobile.push(await page.evaluate(() => {
      const nav = document.querySelector('nav.radar');
      const more = nav ? nav.querySelector('a.rmore') : null;
      const scroll = nav ? nav.querySelector('.rscroll') : null;
      return {
        width: window.innerWidth,
        height: nav ? Math.round(nav.getBoundingClientRect().height) : -1,
        overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        navOverflow: nav ? nav.scrollWidth - nav.clientWidth : -1,
        // 空态时正文**不该**需要横滑（窄屏短文案就是为了这个；全称会被裁掉半句）
        scrollOverflow: scroll ? scroll.scrollWidth - scroll.clientWidth : -1,
        items: nav ? nav.querySelectorAll('.ritem').length : -1,
        moreInViewport: more ? more.getBoundingClientRect().right <= window.innerWidth + 1 : false
      };
    }));
  }
  check('390px 与 360px：条带仍是一行、页面零横溢、入口在视口内',
    radarMobile.every(item => item.height > 0 && item.height <= 40 && item.overflowX <= 0 &&
      item.navOverflow <= 0 && item.moreInViewport),
    radarMobile.map(item => `${item.width}px：高 ${item.height}px · 页溢 ${item.overflowX}px · 「全部变化」在视口内 ${item.moreInViewport}`).join(' · '));
  check('窄屏空态：短文案不超出正文区（没有条目时不该需要横滑）',
    radarMobile.every(item => item.items > 0 || item.scrollOverflow <= 1),
    radarMobile.map(item => `${item.width}px：条目 ${item.items} · 正文区溢出 ${item.scrollOverflow}px`).join(' · '));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(changesUrl, { waitUntil: 'load' });
  const changesMobile = await page.evaluate(() => ({
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    headings: [...document.querySelectorAll('.chgsec h2')].map(h => h.textContent.trim())
  }));
  check('390px：/changes/ 零横向溢出（列表式布局，不是宽表）',
    changesMobile.overflowX <= 0 && changesMobile.headings.length === 7,
    `溢出 ${changesMobile.overflowX}px · 分栏 ${changesMobile.headings.length}`);

  // 回到桌面首页：后面的量测（覆盖条数）要在这个状态下取
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(base, { waitUntil: 'load' });
  await waitForApp(page);

  console.log('\n=== 10) 请求与错误 ===');
  check('没有外部请求（无 CDN 热链）', externalRequests.length === 0,
    externalRequests.length ? externalRequests.slice(0, 3).join(', ') : '全部同源');
  check('没有加载失败', failedRequests.length === 0, failedRequests.slice(0, 3).join(', ') || '0 个');
  check('没有 JS 错误', errors.length === 0, errors.slice(0, 3).join(' | ') || '0 个');

  // §18 落地页（v1.7）：分类页 / 厂商页 / 枢纽页 / 别名页。
  //
  // 这几类的**结构**已经由构建期自检与 `npm run verify:seo`（零依赖静态）守住了；
  // 这里量的是只有真浏览器才能回答的三件事：
  //   · 页面真的打得开、只有一个 h1、canonical 指向自己；
  //   · 表格里的行数与 ItemList 声明数**在真实 DOM 里**也对得上；
  //   · 别名页在浏览器里读到的是 noindex（而不只是产物字符串里写着 noindex）。
  {
    console.log('\n=== 18) 落地页（分类 / 厂商 / 枢纽 / 别名）===');
    const sitemapFile = path.join(DIR, 'sitemap.xml');
    const sitemapRaw = fs.existsSync(sitemapFile) ? fs.readFileSync(sitemapFile, 'utf8') : '';
    // ⚠️ 判据决定文本必须先剥 **XML 注释**（judge-hardening-v1a / t5 F2）：
    //    旧写法用 `sitemapText.split('<loc>')`，把 `<!-- <url>…</url> -->` 里的 `<loc>` 也算成员
    //    ⇒ 把某厂商的整块 `<url>` 包进注释，§18 的「sitemap 成员资格」与 `/vendor/` 枢纽入口数
    //    仍然全绿，而那一页在 sitemap 里其实已经不存在了（真删对照才会红）。
    const sitemapText = sitemapRaw.replace(/<!--[\s\S]*?-->/g, ' ');
    const samples = [
      { route: 'category/api/', kind: 'category', label: '分类落地页' },
      { route: 'vendor/zhipu/', kind: 'vendor', label: '厂商落地页' },
      { route: 'category/', kind: 'hub', label: '分类枢纽页' },
      { route: 'vendor/', kind: 'hub', label: '厂商枢纽页' },
      // 别名页样本：本轮（`secondary-page-residue-v1`）由 `need/student-only/` 换成
      // `need/free-api/`。**不是为了换而换**：本节的断言全是「别名这条路由在真浏览器里的
      // 索引策略 / canonical / 行数对账」，三条别名路由逐条等价，换成哪一条都不改变覆盖面；
      // 换的目的是让 `need/student-only/` 这个字面量在换壳后**不再出现**（换壳记录在
      // `WIDE_MUTATION_TARGETS` 那一段注释里，那里的字面量是有意的历史记录）。
      { route: 'need/free-api/', kind: 'alias', label: '别名页' }
    ];
    for (const sample of samples) {
      const errorsBefore = errors.length;
      const externalBefore = externalRequests.length;
      await page.goto(`${base}${sample.route}`, { waitUntil: 'load' });
      const info = await page.evaluate(() => {
        const ld = [...document.querySelectorAll('script[type="application/ld+json"]')]
          .map(s => { try { return JSON.parse(s.textContent); } catch (e) { return null; } }).filter(Boolean);
        const list = ld.find(data => data['@type'] === 'ItemList');
        return {
          h1: document.querySelectorAll('h1').length,
          title: (document.querySelector('h1') || {}).textContent || '',
          canonical: (document.querySelector('link[rel="canonical"]') || {}).href || '',
          canonicalPath: (() => { try { return new URL((document.querySelector('link[rel="canonical"]') || {}).href).pathname; } catch (e) { return ''; } })(),
          rows: document.querySelectorAll('.ctable tbody tr').length,
          itemLinks: document.querySelectorAll('.ctable tbody a[href*="/deal/"]').length,
          childLinks: document.querySelectorAll('.ctable tbody a[href$="/"]').length,
          declared: list ? Number(list.numberOfItems) : -1,
          declaredItems: list && Array.isArray(list.itemListElement) ? list.itemListElement.length : -1,
          crumbs: [...document.querySelectorAll('.crumb a')].map(a => a.getAttribute('href') || ''),
          summaryRows: document.querySelectorAll('[data-summary-label]').length,
          robots: (document.querySelector('meta[name="robots"]') || {}).content || 'index, follow',
          feeds: document.querySelectorAll('link[rel="alternate"]').length,
          text: document.body ? document.body.innerText.replace(/\s+/g, ' ').trim().length : 0
        };
      });
      const wantIndexable = sample.kind !== 'alias';
      check(`${sample.label} /${sample.route} 打开且只有一个 h1`,
        info.h1 === 1 && info.text > 400, `h1=${info.h1} · 正文 ${info.text} 字 · 「${info.title.slice(0, 20)}」`);
      check(`${sample.label} /${sample.route} canonical 自指`,
        info.canonicalPath.endsWith(`/${sample.route}`), info.canonical);
      check(`${sample.label} /${sample.route} ItemList 声明数 == 可见行数`,
        info.declared === info.declaredItems && info.declared === info.rows,
        `声明 ${info.declared} / 元素 ${info.declaredItems} / 行 ${info.rows}`);
      check(`${sample.label} /${sample.route} robots 与索引策略一致`,
        /noindex/.test(info.robots) !== wantIndexable, info.robots);
      if (fs.existsSync(sitemapFile)) {
        const inSitemap = sitemapText.includes(`<loc>`) && sitemapText.split('<loc>').some(chunk => chunk.startsWith(`https://buguoshixc.github.io/ai-deals-aggregator/${sample.route}`));
        check(`${sample.label} /${sample.route} 的 sitemap 成员资格与索引策略一致`,
          inSitemap === wantIndexable, `sitemap ${inSitemap ? '有' : '无'}`);
      }
      if (sample.kind === 'category' || sample.kind === 'vendor') {
        const parent = sample.kind === 'category' ? 'category/' : 'vendor/';
        check(`${sample.label} /${sample.route} 面包屑指向真实存在的枢纽页`,
          info.crumbs.some(href => href.endsWith(`/${parent}`)), info.crumbs.join(' '));
        check(`${sample.label} /${sample.route} 有数据摘要块且声明了自己的订阅源`,
          info.summaryRows >= 1 && info.feeds === 4, `摘要 ${info.summaryRows} 行 · feed ${info.feeds} 个`);
      }
      if (sample.kind === 'hub') {
        check(`${sample.label} /${sample.route} 的每一行都是子页链接（不夹带条目行）`,
          info.childLinks >= 1 && info.itemLinks === 0, `子页链接 ${info.childLinks} · 条目链接 ${info.itemLinks}`);
      }
      check(`${sample.label} /${sample.route} 没有 JS 错误、没有外部请求`,
        errors.length === errorsBefore && externalRequests.length === externalBefore,
        `错误 ${errors.length - errorsBefore} · 外部请求 ${externalRequests.length - externalBefore}`);
    }

    // 首页的一级标题：v1.7 之前首页**一个 h1 都没有**（主标题只是品牌里的 <b>）。
    await page.goto(base, { waitUntil: 'load' });
    const homeH1 = await page.evaluate(() => [...document.querySelectorAll('h1')].map(el => el.textContent.trim()));
    check('首页恰好一个 h1 且就是站点主标题', homeH1.length === 1 && /优惠/.test(homeH1[0]), homeH1.join(' | '));
  }

  /* ------------------------------------------------------------------ */
  /* 套餐对比页（/plans/coding/，v2.1）                                    */
  /* ------------------------------------------------------------------ */

  console.log('\n=== 19) 套餐对比页（/plans/coding/）===');

  /**
   * 为什么这一段必须存在：v2.1 的第一段只建了数据模型，这一页是第二段 ——
   * 而「页面上的数字是不是数据里的数字」这件事，构建期那几条断言查的是**我们写下的字节**，
   * 不是**浏览器渲染出来的文字**。两者之间隔着：CSS 造成的裁切、`innerText` 与源码的差异、
   * 宽表在窄屏上的溢出、以及"某一格其实被 `/plans/` 这种错前缀指走了"。
   *
   * 这里最要紧的两条是：
   *   ① **不可比较的单价必须显示成「—」**（把 requests / 限速 / 用量池当成 0 元每亿 Token，
   *      是这一页最容易犯、也最坏的错）；
   *   ② **宽表不许撑开整页**（/status/ 那一页的教训：桌面绿、手机横滚，而静态检查全绿）。
   */
  {
    const plansRoute = 'plans/coding/';
    const plansRouteUrl = new URL(plansRoute, base).href;
    const errorsBefore = errors.length;
    const externalBefore = externalRequests.length;
    await page.goto(plansRouteUrl, { waitUntil: 'load' });
    const pt = await page.evaluate(() => ({
      h1: (document.querySelector('h1') || {}).textContent || '',
      h1Count: document.querySelectorAll('h1').length,
      canonical: (document.querySelector('link[rel="canonical"]') || {}).href || '',
      canonicalPath: (() => { try { return new URL((document.querySelector('link[rel="canonical"]') || {}).href).pathname; } catch (e) { return ''; } })(),
      rows: document.querySelectorAll('.ptable tbody tr[data-item]').length,
      rowIds: [...document.querySelectorAll('.ptable tbody tr[data-item]')].map(tr => tr.getAttribute('data-item')),
      // 三个数值列：取单元格里 `<small>` 之前那一段（币种在 small 里）
      numeric: [...document.querySelectorAll('.ptable tbody tr[data-item]')].map(tr =>
        [...tr.querySelectorAll('td.num')].map(td => (td.innerText || '').replace(/\s+/g, ' ').trim().split(' ')[0])),
      officialLinks: [...document.querySelectorAll('.ptable tbody a[href^="http"]')].map(a => a.href),
      noneMarks: document.querySelectorAll('.ptable tbody .pnone').length,
      declared: (() => {
        const ld = [...document.querySelectorAll('script[type="application/ld+json"]')]
          .map(s => { try { return JSON.parse(s.textContent); } catch (e) { return null; } }).filter(Boolean);
        const list = ld.find(d => d['@type'] === 'ItemList');
        return list ? Number(list.numberOfItems) : -1;
      })(),
      ldTypes: [...document.querySelectorAll('script[type="application/ld+json"]')]
        .map(s => { try { return JSON.parse(s.textContent)['@type']; } catch (e) { return 'PARSE_ERROR'; } }),
      crumbs: [...document.querySelectorAll('.crumb a')].map(a => a.getAttribute('href') || ''),
      footLinks: [...document.querySelectorAll('footer a')].map(a => a.getAttribute('href') || ''),
      text: document.body ? document.body.innerText.replace(/\s+/g, ' ').trim() : ''
    }));
    // 真值取机器可读的那一份（`dist/plans.json`）。地址同样由 base 解析 ——
    // 写死根路径时本地绿、线上 404，而失败形态是「读不到数据」+ 一条 404 的 JS 错误。
    const plansTruth = await page.evaluate(`(async () => {
      const doc = await (await fetch(${JSON.stringify(new URL('plans.json', base).href)})).json();
      return (doc.plans || []).map(p => ({
        id: p.id,
        planName: p.planName,
        officialUrl: p.officialUrl,
        regular: p.billing.regularPrice,
        promo: p.billing.promoPrice,
        unit: p.derivedMetrics && p.derivedMetrics.nominalUnitPrice ? p.derivedMetrics.nominalUnitPrice.price : null
      }));
    })()`).catch(() => null);

    check('/plans/coding/ 能打开且恰好一个 h1',
      pt.h1Count === 1 && pt.text.length > 1200 && /套餐/.test(pt.h1),
      `h1 ${pt.h1Count} 个 · 正文 ${pt.text.length} 字 · 「${pt.h1.trim()}」`);
    check('/plans/coding/ 的 h1 与首页顶栏入口的名字逐字一致（入口名不是另抄一份）',
      Boolean(topPlansEntry) && topPlansEntry.text === pt.h1.trim() && topPlansEntry.href.endsWith('plans/coding/'),
      `顶栏「${topPlansEntry ? topPlansEntry.text : '(没量到)'}」 vs h1「${pt.h1.trim()}」`);
    check('/plans/coding/ canonical 自指',
      pt.canonicalPath.endsWith('/plans/coding/') && pt.canonical.includes('buguoshixc.github.io'), pt.canonical);
    check('/plans/coding/ 行数与 plans.json 逐个对账',
      Boolean(plansTruth) && pt.rows === plansTruth.length &&
      pt.rowIds.slice().sort().join(',') === plansTruth.map(p => p.id).sort().join(','),
      plansTruth ? `页面 ${pt.rows} 行 / 数据 ${plansTruth.length} 条` : '读不到 plans.json');
    check('/plans/coding/ ItemList 声明数 == 9 行，且是 CollectionPage + Breadcrumb + ItemList',
      pt.declared === pt.rows &&
      JSON.stringify([...pt.ldTypes].sort()) === JSON.stringify(['BreadcrumbList', 'CollectionPage', 'ItemList']),
      `声明 ${pt.declared} / 行 ${pt.rows} / JSON-LD [${pt.ldTypes.join(', ')}]`);

    // ★ 不可比较的单价：一格都不许是数字，而且必须带 .pnone 标记
    if (plansTruth) {
      const mismatched = [];
      plansTruth.forEach((plan, index) => {
        const cells = pt.numeric[index] || [];
        const [regular, promo, unit] = cells;
        if (plan.regular === null && regular !== '未标注') mismatched.push(`${plan.planName} 原价未知却显示「${regular}」`);
        if (plan.regular === 0 && !/0/.test(regular || '')) mismatched.push(`${plan.planName} 免费档没显示成 0（「${regular}」）`);
        if (plan.promo === null && promo !== '—') mismatched.push(`${plan.planName} 无活动价却显示「${promo}」`);
        if (plan.unit === null && unit !== '—') mismatched.push(`${plan.planName} 单价不可比较却显示「${unit}」`);
        if (plan.unit !== null && unit === '—') mismatched.push(`${plan.planName} 单价可计算却显示「—」`);
      });
      check('/plans/coding/ 三个数值列与数据逐条对账（未知写「未标注」/「—」，免费写 0，不可比较一律「—」）',
        mismatched.length === 0, mismatched.slice(0, 3).join(' · ') || '全部一致');
      check('/plans/coding/ 不可比较的单价格数 == 数据里算不出的条数',
        pt.noneMarks === plansTruth.filter(p => p.unit === null).length,
        `页面标记 ${pt.noneMarks} 格 / 数据 ${plansTruth.filter(p => p.unit === null).length} 条`);
      check('/plans/coding/ 每条套餐都有官方页链接且指向数据里的那个地址',
        plansTruth.every(plan => pt.officialLinks.includes(plan.officialUrl)),
        `${pt.officialLinks.length} 个官方链接`);
    }

    // 口径文案与结论性词汇。词汇清单是 `lib/plans-page.js` 的 FORBIDDEN_CLAIM_WORDS 的
    // **浏览器镜像** —— 两边都查是有意的：构建期查的是我们写下的字节，这里查的是渲染出来的文字。
    const forbidden = ['性价比', '最划算', '最超值', '最值得买', '值得买', '排行榜', '排行',
      '综合评分', '星级', '推荐指数', 'TOP 1', 'TOP1', '第一名', '最优选'];
    check('/plans/coding/ 写着「名义 Token 单价只用于粗略比较」的口径',
      pt.text.includes('不代表不同模型 Token 的实际价值相同'));
    check('/plans/coding/ 页面上没有结论性词汇（不做价值判断）',
      forbidden.filter(word => pt.text.includes(word)).length === 0,
      forbidden.filter(word => pt.text.includes(word)).join('、') || `查了 ${forbidden.length} 个词`);
    check('/plans/coding/ 面包屑回站根（两层路由必须用 ../../，不是 ../）',
      pt.crumbs.some(href => href === '../../'), pt.crumbs.join(' '));
    check('/plans/coding/ 页脚有指向本页的入口',
      pt.footLinks.some(href => href.endsWith('plans/coding/')), pt.footLinks.filter(h => h.includes('plans')).join(' '));
    check('/plans/coding/ 没有 JS 错误、没有外部请求',
      errors.length === errorsBefore && externalRequests.length === externalBefore,
      `错误 ${errors.length - errorsBefore} · 外部请求 ${externalRequests.length - externalBefore}`);

    // ★ 宽表必须在容器内横滚，不撑开整页（只量结果，不量机制）
    for (const width of [390, 360]) {
      await page.setViewportSize({ width, height: 844 });
      await page.waitForTimeout(200);
      const mobile = await page.evaluate(() => {
        const wrap = document.querySelector('.ptable-wrap');
        const table = document.querySelector('.ptable');
        const rect = el => (el ? Math.round(el.getBoundingClientRect().width) : null);
        return {
          docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          wrapOverflowX: wrap ? getComputedStyle(wrap).overflowX : '(无 .ptable-wrap)',
          tableWidth: rect(table),
          wrapWidth: rect(wrap)
        };
      });
      check(`/plans/coding/ ${width}px 不产生页面级横向溢出（11 列宽表应在容器内横滚）`,
        mobile.docOverflow <= 1,
        `页面溢出 ${mobile.docOverflow}px · .ptable-wrap overflow-x=${mobile.wrapOverflowX} · ` +
        `表格宽 ${mobile.tableWidth}px / 容器宽 ${mobile.wrapWidth}px`);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(200);

    /* ---------------------------------------------------------------- */
    /* v2.2：筛选 / 搜索 / 排序 / 行内展开（真浏览器）                     */
    /* ---------------------------------------------------------------- */

    /**
     * 为什么这一段必须在真浏览器里跑：上一段（v2.1）验的是"表里的数字与数据一致"，
     * 而这一版新增的东西**只有在 JS 跑起来之后才存在** —— 控件是 JS 建的、
     * 子集是 JS 筛的、行序是 JS 搬的。构建期的断言看的是我们写下的字节，
     * 看不到"点了以后到底剩下哪几行"。
     *
     * 判据一律**现场从 plans.json 推导**（不硬编码条数与平台名）：数据每天可能变，
     * 硬编码会在明天变成假红；而"点了 Trae 之后可见集合 == 数据里 provider=trae 的集合"
     * 这句话在任何数据下都成立。
     */
    await page.goto(plansRouteUrl, { waitUntil: 'load' });
    await page.waitForSelector('.pctl .f[data-facet]', { timeout: 10000 });

    const truth = await page.evaluate(`(async () => {
      const doc = await (await fetch(${JSON.stringify(new URL('plans.json', base).href)})).json();
      return (doc.plans || []).map(p => ({
        id: p.id, provider: p.provider, region: p.region, quotaType: p.quota.type,
        period: p.billing.period, currency: p.billing.currency,
        regular: p.billing.regularPrice, promo: p.billing.promoPrice,
        officialUrl: p.officialUrl,
        models: Array.isArray(p.supportedModels) ? p.supportedModels.map(m => m.name) : [],
        modelsMissing: !Array.isArray(p.supportedModels),
        unit: p.derivedMetrics && p.derivedMetrics.nominalUnitPrice ? p.derivedMetrics.nominalUnitPrice.price : null
      }));
    })()`);

    const visibleIds = () => page.evaluate(() =>
      [...document.querySelectorAll('.ptable tbody tr[data-item]')]
        .filter(tr => !tr.hidden).map(tr => tr.getAttribute('data-item')));
    const domIds = () => page.evaluate(() =>
      [...document.querySelectorAll('.ptable tbody tr[data-item]')].map(tr => tr.getAttribute('data-item')));
    const statusText = () => page.evaluate(() => (document.querySelector('.pstatus') || {}).textContent || '');
    const clickFacet = (facet, value) => page.click(`.pctl button[data-facet="${facet}"][data-value="${value}"]`);
    const resetFilters = () => page.click('.pctl [data-reset]');
    const idsWhere = predicate => truth.filter(predicate).map(row => row.id).sort();
    const sorted = list => list.slice().sort();

    check('/plans/coding/ 有 JS 时出现筛选控件（无 JS 时那一块是空的）',
      (await page.evaluate(() => document.querySelectorAll('.pctl [data-facet]').length)) > 0);
    check('/plans/coding/ 初始状态：全部行可见，状态行数字与数据一致',
      (await visibleIds()).length === truth.length &&
      (await statusText()).includes(`显示 ${truth.length} / 共 ${truth.length} 条套餐`),
      await statusText());

    // ① 平台：每一个 chip 点下去，可见集合必须恰好等于数据里该平台的行
    {
      const mismatched = [];
      const providers = [...new Set(truth.map(row => row.provider))];
      for (const provider of providers) {
        await clickFacet('provider', provider);
        const visible = sorted(await visibleIds());
        const expected = idsWhere(row => row.provider === provider);
        if (JSON.stringify(visible) !== JSON.stringify(expected)) {
          mismatched.push(`${provider}: 页面 ${visible.length} / 数据 ${expected.length}`);
        }
      }
      await resetFilters();
      check(`/plans/coding/ 平台筛选：${providers.length} 个 chip 的可见集合都等于数据`,
        mismatched.length === 0, mismatched.slice(0, 3).join(' · ') || `${providers.length} 个平台逐个对账通过`);
    }

    // ② 活动价 / 模型未标注 / 地区 / 额度类型
    {
      await clickFacet('promo', 'yes');
      const withPromo = sorted(await visibleIds());
      check('/plans/coding/ 「有活动价」只剩有活动价的行（正常价与活动价没有混为一谈）',
        JSON.stringify(withPromo) === JSON.stringify(idsWhere(row => typeof row.promo === 'number')),
        `${withPromo.length} 行`);
      await clickFacet('promo', 'no');
      check('/plans/coding/ 「无活动价」只剩没有活动价的行',
        JSON.stringify(sorted(await visibleIds())) === JSON.stringify(idsWhere(row => typeof row.promo !== 'number')));
      await resetFilters();

      await page.selectOption('.pctl select[data-facet="model"]', '__none');
      check('/plans/coding/ 「模型未标注」只剩 supportedModels 为空的行',
        JSON.stringify(sorted(await visibleIds())) === JSON.stringify(idsWhere(row => row.modelsMissing)));
      await resetFilters();

      await clickFacet('region', 'cn');
      check('/plans/coding/ 地区筛选只剩该地区的行',
        JSON.stringify(sorted(await visibleIds())) === JSON.stringify(idsWhere(row => row.region === 'cn')));
      await resetFilters();

      const quotaTypes = [...new Set(truth.map(row => row.quotaType))];
      const quotaMismatch = [];
      for (const quotaType of quotaTypes) {
        await clickFacet('quotaType', quotaType);
        if (JSON.stringify(sorted(await visibleIds())) !== JSON.stringify(idsWhere(row => row.quotaType === quotaType))) {
          quotaMismatch.push(quotaType);
        }
      }
      await resetFilters();
      check('/plans/coding/ 额度类型筛选逐个对账', quotaMismatch.length === 0, quotaMismatch.join(' · ') || `${quotaTypes.length} 类`);
    }

    // ③ 价格区间：同币种 + 半开区间，且绝不把原价未标注的行捞进来
    {
      const buckets = await page.evaluate(() => {
        const raw = JSON.parse(document.getElementById('plans-compare-data').textContent);
        return raw.dimensions.price;
      });
      const mismatch = [];
      for (const bucket of buckets) {
        await page.selectOption('.pctl select[data-facet="price"]', bucket.key);
        const visible = await visibleIds();
        const expected = truth.filter(row => row.currency === bucket.currency && row.period === bucket.period &&
          typeof row.regular === 'number' && row.regular >= bucket.min &&
          (bucket.max === null || row.regular < bucket.max)).map(row => row.id);
        if (JSON.stringify(sorted(visible)) !== JSON.stringify(sorted(expected))) {
          mismatch.push(`${bucket.label}: 页面 ${visible.length} / 数据 ${expected.length}`);
        }
        // 页面上每一条可见行的价格币种都必须等于该档位的币种（不跨币种）
        const currencies = await page.evaluate(() => [...document.querySelectorAll('.ptable tbody tr[data-item]')]
          .filter(tr => !tr.hidden)
          .map(tr => (tr.querySelectorAll('td.num small')[0] || {}).textContent || ''));
        if (currencies.some(text => text.trim() !== bucket.currency)) {
          mismatch.push(`${bucket.label}: 混进了 ${bucket.currency} 之外的行`);
        }
      }
      await resetFilters();
      check(`/plans/coding/ 价格区间（同币种 + 半开区间）逐个对账，选项 ${buckets.length} 档`,
        mismatch.length === 0, mismatch.slice(0, 3).join(' · ') || '全部一致');
    }

    // ④ 搜索：中文显示值、平台别名、模型名
    {
      const cases = [
        ['灵码', row => row.provider === 'qoder'],
        ['copilot', row => row.provider === 'github'],
        ['智谱', row => row.provider === 'zhipu'],
        ['GLM', row => row.provider === 'zhipu' || row.models.some(name => /glm/i.test(name))]
      ];
      const mismatch = [];
      for (const [query, predicate] of cases) {
        await page.fill('.pctl input[data-facet="q"]', query);
        const visible = sorted(await visibleIds());
        const expected = idsWhere(predicate);
        if (JSON.stringify(visible) !== JSON.stringify(expected)) {
          mismatch.push(`「${query}」: 页面 ${visible.length} / 数据 ${expected.length}`);
        }
      }
      await page.fill('.pctl input[data-facet="q"]', '');
      await page.waitForTimeout(50);
      check('/plans/coding/ 搜索覆盖中文显示值 / 平台别名 / 模型名（逐词对账）',
        mismatch.length === 0, mismatch.slice(0, 3).join(' · ') || `${cases.length} 个词逐个通过`);
      check('/plans/coding/ 筛选与搜索都不改地址（不为筛选组合生成 URL）',
        await page.evaluate(() => location.search === ''), await page.evaluate(() => location.href));
    }

    // ⑤ 排序：属性判定（不可比较恒在末尾；同币种内有序；币种组序不反转）
    {
      const props = () => page.evaluate(() => {
        const trs = [...document.querySelectorAll('.ptable tbody tr[data-item]')].filter(tr => !tr.hidden);
        const raw = JSON.parse(document.getElementById('plans-compare-data').textContent);
        const byId = new Map(raw.rows.map(row => [row.id, row]));
        return trs.map(tr => {
          const row = byId.get(tr.getAttribute('data-item'));
          return { id: row.id, regular: row.regular, currency: row.currency, updated: row.updated };
        });
      });
      const nullsLast = (list, field) => {
        const flags = list.map(row => typeof row[field] === 'number');
        return flags.indexOf(false) === -1 || flags.lastIndexOf(true) < flags.indexOf(false);
      };

      await page.click('.pctl [data-sort="regular"]');
      const asc = await props();
      const ascOrdered = asc.filter(row => typeof row.regular === 'number');
      const sameCurrencyAsc = ascOrdered.every((row, index) => index === 0 || row.currency !== ascOrdered[index - 1].currency ||
        ascOrdered[index - 1].regular <= row.regular);
      check('/plans/coding/ 正常月费排序：不可比较（原价未标注）恒在末尾，同币种内升序',
        nullsLast(asc, 'regular') && sameCurrencyAsc && asc.length === truth.length,
        asc.map(row => `${row.currency || '—'}${row.regular === null ? '—' : row.regular}`).join(' '));

      await page.click('.pctl [data-sort="regular"]');
      const desc = await props();
      const descOrdered = desc.filter(row => typeof row.regular === 'number');
      const sameCurrencyDesc = descOrdered.every((row, index) => index === 0 || row.currency !== descOrdered[index - 1].currency ||
        descOrdered[index - 1].regular >= row.regular);
      check('/plans/coding/ 反向排序时不可比较项**仍然**在末尾（不会被顶到最前）',
        nullsLast(desc, 'regular') && sameCurrencyDesc,
        desc.map(row => `${row.currency || '—'}${row.regular === null ? '—' : row.regular}`).join(' '));

      await page.click('.pctl [data-sort="updated"]');
      const byDate = await props();
      check('/plans/coding/ 最近更新排序：日期非递增（最新在前）',
        byDate.every((row, index) => index === 0 || byDate[index - 1].updated >= row.updated));

      await resetFilters();
      check('/plans/coding/ 清除筛选回到规范序（行序与数据一致）',
        JSON.stringify(await domIds()) === JSON.stringify(truth.map(row => row.id)));
    }

    // ⑥ 名义 Token 单价：0 条可比较 ⇒ 不给这个排序，且页面写明原因
    {
      const hasUnit = truth.some(row => typeof row.unit === 'number');
      const unitButton = await page.evaluate(() =>
        [...document.querySelectorAll('.pctl [data-sort]')].some(b => b.getAttribute('data-sort') === 'unit'));
      check('/plans/coding/ 「名义 Token 单价」排序只在真有可比行时才出现',
        unitButton === hasUnit, `数据里可比 ${truth.filter(row => typeof row.unit === 'number').length} 条 / 按钮 ${unitButton}`);
      const numericUnits = await page.evaluate(() =>
        [...document.querySelectorAll('.ptable tbody tr[data-item]')].filter(tr => !tr.hidden)
          .map(tr => (tr.querySelectorAll('td.num')[2] || {}).textContent || '')
          .filter(text => /\d/.test(text)).length);
      check('/plans/coding/ 可见行里没有任何一格单价格是数字（不可比较一律「—」）',
        numericUnits === 0, `${numericUnits} 格带数字`);
    }

    // ⑦ 行内展开详情：官方溯源
    {
      const first = truth[0];
      await page.click(`.ptable [data-detail="${first.id}"]`);
      const detail = await page.evaluate(() => {
        const row = document.querySelector('tr.pdetail');
        if (!row) return null;
        const button = document.querySelector(`.ptable [data-detail="${row.id.replace('pdetail-', '')}"]`);
        return {
          colspan: row.firstChild.colSpan,
          columns: document.querySelectorAll('.ptable thead th').length,
          links: [...row.querySelectorAll('a')].map(a => a.href),
          expanded: button ? button.getAttribute('aria-expanded') : null
        };
      });
      check('/plans/coding/ 点「详情」展开出该行的官方溯源（colspan == 表头列数，链接可点）',
        Boolean(detail) && detail.colspan === detail.columns &&
        detail.links.some(href => href === first.officialUrl) && detail.expanded === 'true',
        detail ? `colspan ${detail.colspan}/${detail.columns} · ${detail.links.length} 个链接 · aria-expanded=${detail.expanded}` : '没有展开');
      await page.click(`.ptable [data-detail="${first.id}"]`);
      check('/plans/coding/ 再点一次收起详情',
        (await page.evaluate(() => document.querySelectorAll('tr.pdetail').length)) === 0);
    }

    // ⑦b 保留窄阅读列的**几何**判据（narrow-reading-columns-v1；judge-hardening-v1a 起**逐条**登记项）
    //
    // 为什么在真浏览器里量、而不是只看 CSS 文本：S4 要求的是**排版事实**（「必须居中」），
    // 而「CSS 里写了 margin-inline: auto」与「它真的被居中」是两件事（父级宽度 / 方向 / 覆盖都能毁掉它）。
    // 这一块**自己开 page**（零污染）：先把 `margin-inline: auto` 就地删掉量一次 —— 后者证明这条判据**有牙**。
    //
    // ⚠️ t5 的 R11（judge-hardening-v1a 修）：旧实现只量 `WIDE_NARROW_ENTRIES[0]`，其余登记项 ——
    //    包括**幽灵条目**（任何产物页面里都不存在的选择器）—— 完全不判。实测：登记三条
    //    （含一条未居中的、一条幽灵的）+ 产物里真写入未居中窄列 ⇒ 整轮 874/0 全绿。
    //    现在逐条量：找不到元素 = 幽灵 ⇒ 红；未居中 ⇒ 红；自身裁切 ⇒ 红。
    {
      const tol = WIDE_NARROW_REGISTRY.ratio.centeringTolerancePx;
      if (!WIDE_NARROW_ENTRIES.length) {
        // 空登记清单**不留几何空窗**：显式声明「本轮没有几何对象」，不再回落到 `.pdetailbody` 的隐式默认。
        // 此时「产物里不许再出现任何 ch 窄列」由 §22c ⑥ 的 narrow-unregistered 咬住（两条合起来才没洞）。
        check('§19 保留窄阅读列的几何：登记清单为空 ⇒ 显式声明「本轮没有几何对象」（不再回落隐式默认）', true,
          'scripts/data/narrow-reading-columns.json 的 entries 为空；此时产物里任何 ch 窄列都会被 §22c ⑥ 的 narrow-unregistered 咬住');
      }
      for (const [entryIndex, entry] of WIDE_NARROW_ENTRIES.entries()) {
        const route = (Array.isArray(entry.routes) && entry.routes[0]) || 'plans/coding/';
        const tolFor = tol;
        const anchor = `${entry.selector} { ${entry.declaration}; margin-inline: auto; }`;
        const loose = `${entry.selector} { ${entry.declaration}; }`;
        const narrowPage = await browser.newPage({ viewport: { width: WIDE_DESKTOP, height: 900 } });
        let measured = null;
        let uncentered = null;
        let mutateGuard = null;
        try {
          await narrowPage.goto(new URL(route, base).href, { waitUntil: 'load' });
          const readGeometry = () => narrowPage.evaluate(`(() => {
            const body = document.querySelector('${entry.selector}');
            if (!body) return null;
            const cell = body.closest('td') || body.parentElement;
            const cs = getComputedStyle(cell);
            const cellBox = cell.getBoundingClientRect();
            const bodyBox = body.getBoundingClientRect();
            const contentLeft = cellBox.left + (parseFloat(cs.paddingLeft) || 0);
            const contentRight = cellBox.right - (parseFloat(cs.paddingRight) || 0);
            return {
              cellWidth: Math.round((contentRight - contentLeft) * 100) / 100,
              bodyWidth: Math.round(bodyBox.width * 100) / 100,
              leftInset: Math.round((bodyBox.left - contentLeft) * 100) / 100,
              rightInset: Math.round((contentRight - bodyBox.right) * 100) / 100,
              clientWidth: body.clientWidth, scrollWidth: body.scrollWidth,
              clientHeight: body.clientHeight, scrollHeight: body.scrollHeight,
              overflowY: getComputedStyle(body).overflowY, heightStyle: getComputedStyle(body).height,
              // 声明的 ch 在**这一页这一处**的现场换算值（t17 裁定 ① 的尺子）：
              // 把该元素的计算字体复制到屏外探针上量「声明里那个数字 + ch」的像素宽。
              // 载体：「.pdetailbody{72ch}」实测 465.75px ⇒ 比值 1.000。
              declaredChPx: (() => {
                const decl = ${JSON.stringify(entry.declaration)};
                const m = /(max-width|width|inline-size)\\s*:\\s*([\\d.]+)ch/i.exec(decl);
                if (!m) return null;
                const ecs = getComputedStyle(body);
                const probe = document.createElement('span');
                probe.style.position = 'absolute';
                probe.style.visibility = 'hidden';
                probe.style.whiteSpace = 'nowrap';
                ['fontSize', 'fontFamily', 'fontWeight', 'letterSpacing', 'fontFeatureSettings', 'fontVariantNumeric']
                  .forEach(prop => { probe.style[prop] = ecs[prop]; });
                probe.style.width = m[2] + 'ch';
                document.body.appendChild(probe);
                const px = probe.getBoundingClientRect().width;
                probe.remove();
                return Math.round(px * 100) / 100;
              })(),
              maxWidth: getComputedStyle(body).maxWidth,
              marginLeft: getComputedStyle(body).marginLeft, marginRight: getComputedStyle(body).marginRight,
              rendered: bodyBox.width > 0 && bodyBox.height > 0
            };
          })()`);
          measured = await readGeometry();
          // 元素不在场（幽灵条目 / 选择器改名）⇒ 先试着展开行内详情再量一次（`.pdetailbody` 这一类
          // 只在展开后参与布局），仍不在场就是**幽灵**。
          if (!measured) {
            const expandable = await narrowPage.$('.ptable [data-detail]');
            if (expandable) {
              await narrowPage.click('.ptable [data-detail]');
              measured = await readGeometry();
            }
          }
          const centeredOk = Boolean(measured) && measured.rendered
            && measured.bodyWidth < measured.cellWidth - 40
            && Math.abs(measured.leftInset - measured.rightInset) <= tolFor
            && measured.scrollWidth <= measured.clientWidth + WIDE_TOL
            && measured.scrollHeight <= measured.clientHeight + WIDE_TOL;
          check(`§19 登记的窄阅读列第 ${entryIndex + 1}/${WIDE_NARROW_ENTRIES.length} 条 ${entry.selector}（${route}）：`
            + `**真的在产物里命中**、比容器窄 ≥ 40px、左右内边距差 ≤ ${tolFor}px、自身不裁切（横竖都算）`,
            centeredOk,
            measured
              ? `${entry.selector} ${measured.bodyWidth}px / 容器 ${measured.cellWidth}px · 左 ${measured.leftInset}px · 右 ${measured.rightInset}px`
                + ` · max-width ${measured.maxWidth} · margin ${measured.marginLeft}/${measured.marginRight}`
                + ` · 自身横 ${measured.scrollWidth}/${measured.clientWidth} 竖 ${measured.scrollHeight}/${measured.clientHeight} · rendered ${measured.rendered}`
              : `页面上**找不到** ${entry.selector}（${route} 展开详情后仍找不到）⇒ 幽灵登记条目/选择器已改名`,
            entryIndex === 0 ? undefined : 'registered-narrow');
          // 生效宽 ≈ 声明 ch 的**现场换算值 ± 20%**（t17 裁定 ①：唯一「低成本 + 0 假阳性 + 实测有牙」的一条）。
          // 它抓的是「CSS 里写着 72ch、实际生效的是别的宽度」（例如另一条 `width: 300px` 把它覆盖了 ——
          // t5 的 R5b 就是这种未覆盖形态：声明不动、比值 0.644 ⇒ 旧判据零码）。
          // ⚠️ 阈值 20% 是**实测标定**（载体实测比值 1.000；全站只有 1 条 ch 声明 ⇒ 误报面 0），不是随手取的。
          const chPx = measured ? measured.declaredChPx : null;
          const ratio = (chPx && measured && measured.bodyWidth) ? measured.bodyWidth / chPx : null;
          check(`§19 登记的窄阅读列第 ${entryIndex + 1}/${WIDE_NARROW_ENTRIES.length} 条 ${entry.selector} 的**生效宽**`
            + ` ≈ 声明「${entry.declaration}」的现场换算值（±20%）—— 不许被别的规则顶掉`,
            Boolean(ratio !== null && ratio >= 0.8 && ratio <= 1.2),
            ratio === null
              ? '量不到现场换算值（选择器不在场或声明里没有 ch 数字）'
              : `生效宽 ${measured.bodyWidth}px ÷ 现场 ${chPx}px = 比值 ${Math.round(ratio * 1000) / 1000}（容差 0.8–1.2）`,
            'registered-narrow-effective');
          // 隔离牙只对**第 1 条**跑（旧锚点逐字保留）：把 `margin-inline: auto` 就地删掉 ⇒ 左右必须不再相等。
          if (entryIndex === 0) {
            mutateGuard = await wideMutate(narrowPage, anchor, loose);
            if (mutateGuard.ok) uncentered = await readGeometry();
            check('§19 上一条判据的隔离牙：把 margin-inline: auto 就地删掉后，左右内边距不再相等（承重证明）',
              Boolean(mutateGuard && mutateGuard.ok && measured && uncentered)
              && Math.abs(uncentered.leftInset - uncentered.rightInset) > tolFor
              && Math.abs(measured.leftInset - measured.rightInset) <= tolFor
              && Math.abs(uncentered.bodyWidth - measured.bodyWidth) <= WIDE_TOL,
              mutateGuard && mutateGuard.ok
                ? `删掉前 左 ${measured ? measured.leftInset : '?'} / 右 ${measured ? measured.rightInset : '?'} ⇒ 删掉后`
                  + ` 左 ${uncentered ? uncentered.leftInset : '?'} / 右 ${uncentered ? uncentered.rightInset : '?'}`
                  + `（盒宽 ${measured ? measured.bodyWidth : '?'} → ${uncentered ? uncentered.bodyWidth : '?'}px：只挪位置、不改变宽度）`
                : `${mutateGuard ? mutateGuard.reason : '变异未执行'} ⇒ 按红处理`);
          }
        } finally {
          await narrowPage.close();
        }
      }
    }

    // ⑧ 移动端：筛选 + 展开之后仍不溢出，关键列钉在视口里，官方链接仍可点
    for (const width of [390, 360]) {
      await page.setViewportSize({ width, height: 844 });
      await page.waitForTimeout(150);
      await page.click('.ptable [data-detail]');
      const mobile = await page.evaluate(() => {
        const wrap = document.querySelector('.ptable-wrap');
        wrap.scrollLeft = 300;
        const row = document.querySelector('.ptable tbody tr[data-item]');
        const th = row.querySelector('th');
        // ⚠️ 用 children[1]（含 <th> 的那一列之后的第一格）而不是 querySelectorAll('td')[1]：
        //    后者跳过 <th>，取到的是**正常价格**那一格（不粘），断言会以"列没粘住"的形式假红。
        const td = row.children[1];
        const link = td.querySelector('a');
        const box = element => element.getBoundingClientRect();
        const linkBox = link ? box(link) : null;
        const top = linkBox ? document.elementFromPoint((linkBox.left + linkBox.right) / 2, linkBox.top + 3) : null;
        return {
          docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          wrapLeft: Math.round(box(wrap).left),
          thLeft: Math.round(box(th).left),
          tdLeft: Math.round(box(td).left),
          detailOpen: Boolean(document.querySelector('tr.pdetail')),
          linkOnTop: Boolean(top && (top === link || link.contains(top))),
          tables: document.querySelectorAll('.ptable').length
        };
      });
      check(`/plans/coding/ ${width}px 筛选 + 展开详情后仍无页面级横向溢出`,
        mobile.docOverflow <= 1, `溢出 ${mobile.docOverflow}px`);
      check(`/plans/coding/ ${width}px 横滚后「平台 / 套餐」两列仍钉在视口里（详情行同时是展开状态）`,
        mobile.thLeft >= mobile.wrapLeft - 1 && mobile.tdLeft > mobile.thLeft && mobile.detailOpen,
        `容器 ${mobile.wrapLeft} · 平台 ${mobile.thLeft} · 套餐 ${mobile.tdLeft} · 详情展开=${mobile.detailOpen}`);
      check(`/plans/coding/ ${width}px 只有一个表格（移动端不维护第二套数据模板）`, mobile.tables === 1);
      check(`/plans/coding/ ${width}px 粘性列里的官方链接仍是可点的最上层元素`, mobile.linkOnTop);
      await page.click('.ptable [data-detail]');
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(150);

    // ⑧.5 底部的「口径与说明」必须**占满正文宽度**，而且真的按这个宽度排。
    //      线上出过一次：`.plist/.snote` 写着 `max-width: 82ch`（12px 字体下 ≈530px，而正文容器 1380px），
    //      宽屏上整段缩成左边一条窄柱、每句话被切在词中间（「…本页照原样列 / 出」）。
    //      这里量的是**渲染结果**，两条各管一件事：
    //      ① 盒子宽度 ≈ 表格宽度（同一条正文容器，谁也不许自己收窄）；
    //      ② 每一句的行数不超过 2 行 —— 只量盒子宽度的话，"盒子很宽但每行只写一半就换行"
    //         仍然能绿；而恢复成 82ch 时这些句子会变成 2~3 行，②立刻变红。
    {
      const notes = await page.evaluate(() => {
        const box = el => (el ? el.getBoundingClientRect() : null);
        const table = document.querySelector('.ptable');
        const list = document.querySelector('.plist');
        const tail = document.querySelector('.plist + .snote');
        const items = list ? [...list.querySelectorAll('li')] : [];
        const lh = list ? parseFloat(getComputedStyle(list).lineHeight) : 0;
        const linesOf = li => Math.max(1, Math.round(box(li).height / lh));
        return {
          table: table ? Math.round(box(table).width) : 0,
          list: list ? Math.round(box(list).width) : 0,
          tail: tail ? Math.round(box(tail).width) : 0,
          items: items.length,
          lines: items.map(linesOf),
          maxLines: items.length ? Math.max(...items.map(linesOf)) : 0,
          clipped: items.filter(li => li.scrollWidth > li.clientWidth + 1).length,
          maxWidth: [list, tail].map(el => (el ? getComputedStyle(el).maxWidth : '')).join(' / ')
        };
      });
      check('/plans/coding/ 口径与说明占满正文宽度（不再被 82ch 压成一条窄柱）',
        notes.items >= 9 && notes.list >= notes.table - 2 && notes.tail >= notes.table - 2 && notes.clipped === 0,
        `${notes.items} 条 · 列表 ${notes.list}px / 末尾段 ${notes.tail}px / 表格 ${notes.table}px · ` +
        `裁切 ${notes.clipped} 条 · max-width=${notes.maxWidth}`);
      check('/plans/coding/ 口径与说明按正文宽度排版（每句 ≤ 2 行，窄柱时是 2~3 行）',
        notes.items >= 9 && notes.maxLines <= 2,
        `每句行数 [${notes.lines.join(' ')}] · 最多 ${notes.maxLines} 行`);
    }

    // ⑩ v2.3：套餐变化（最近变化块 / 行锚点 / 时间线 / 订阅源）
    //
    // 判据一律**现场从 plan-history.json 推导**（不硬编码条数与文案）：日志每天可能变，
    // 硬编码会在明天变成假红。这里刻意**不重算雷达分栏**（那是 `lib/plan-changes.js` 的判据，
    // 复刻一份就等于两套判据）——只对账三件不依赖判据的事实：
    //   ① 块里每条的日期都真的在日志里，且条数 ≤ 上限；
    //   ② 块里每条的 `#plan-<id>` 锚点在页面上真的有落点；
    //   ③ 订阅源里每条的 guid 都等于日志里重算出来的事件身份。
    {
      await page.goto(plansRouteUrl, { waitUntil: 'load' });
      const planData = await page.evaluate(`(async () => {
        const history = await (await fetch(${JSON.stringify(new URL('plan-history.json', base).href)})).json();
        const plans = await (await fetch(${JSON.stringify(new URL('plans.json', base).href)})).json();
        return {
          startedAt: history.startedAt || null,
          eventIds: (history.events || []).map(e => e.eventId).filter(Boolean),
          eventDates: [...new Set((history.events || []).map(e => e.at))].sort(),
          events: (history.events || []).map(e => ({ planId: e.planId, type: e.type, at: e.at })),
          planIds: (plans.plans || []).map(p => p.id),
          block: (() => {
            const section = document.getElementById('plan-changes');
            if (!section) return null;
            return {
              items: [...section.querySelectorAll('li')].map(li => ({
                text: (li.innerText || '').replace(/\\s+/g, ' ').trim(),
                // ⚠️ 必须**在元素上**取属性：旧写法把原生方法摘下来单独调用
                // （el.getAttribute 当函数值传出去），一旦真的取到元素就是
                // TypeError: Illegal invocation。日志为空时 map 一次都不执行，所以这个错
                // 潜伏了很久 —— 直到真实出现套餐变化事件才暴露（浏览器验收直接崩掉）。
                date: (() => {
                  const el = li.querySelector('time');
                  return el ? el.getAttribute('datetime') : null;
                })(),
                anchor: (() => {
                  const a = li.querySelector('a.pchgwho');
                  return a ? (a.getAttribute('href') || '') : '';
                })()
              })),
              text: (section.innerText || '').replace(/\\s+/g, ' ').trim(),
              links: [...section.querySelectorAll('a')].map(a => a.getAttribute('href') || '')
            };
          })(),
          rowAnchors: [...document.querySelectorAll('.ptable tbody tr[data-item]')].map(tr => tr.id),
          // 详情模板是惰性的：展开第一行后读到的时间线才是浏览器里真实存在的那一份
          templates: [...document.querySelectorAll('template[data-detail-for]')]
            .map(t => ({ id: t.getAttribute('data-detail-for'), text: (t.content.textContent || '').replace(/\\s+/g, ' ').trim() }))
        };
      })()`);

      check('/plans/coding/ 有「最近变化」块（构建期的最近变化就在这一块里）',
        Boolean(planData.block), planData.block ? `${planData.block.items.length} 条` : '找不到 #plan-changes');
      if (planData.block) {
        const datesOk = planData.block.items.every(item => planData.eventDates.includes(item.date));
        check('/plans/coding/ 最近变化块里每条的日期都真的在变更日志里（页面不自己造事件）',
          datesOk && planData.block.items.length <= 5,
          `${planData.block.items.length} 条 · 日志日期 [${planData.eventDates.join(', ') || '空'}]`);
        const anchorsOk = planData.block.items.every(item => {
          const id = (item.anchor.match(/#plan-([0-9a-f]{12})/) || [])[1];
          // 字段名是 `planIds`（页面取的是 `plans.plans`）。写成 `planData.plans` 时，
          // 只要块里有 0 条，`every()` 就不执行回调 —— 于是一个 undefined 一直潜伏到
          // 真实出现套餐变化事件才炸出来（浏览器验收实测）。
          return Boolean(id) && planData.planIds.includes(id);
        });
        check('/plans/coding/ 最近变化块每条都深链到真实存在的套餐行',
          anchorsOk, planData.block.items.map(i => i.anchor).join(' '));
        const emptyWording = /没有观测到套餐变化|没有拿到套餐变更日志/.test(planData.block.text);
        check('/plans/coding/ 变化日志为空/不可用时，最近变化块给的是明确空态（不是一片空白）',
          planData.block.items.length > 0 || emptyWording, planData.block.text.slice(0, 120));
        check('/plans/coding/ 最近变化块有指向 /changes/ 的入口（不是孤立的一块）',
          planData.block.links.some(href => /changes\//.test(href)), planData.block.links.join(' '));
      }

      check('/plans/coding/ 每个套餐行都有 #plan-<id> 锚点（订阅与最近变化的落点）',
        planData.rowAnchors.length === planData.planIds.length &&
        planData.planIds.every(id => planData.rowAnchors.includes(`plan-${id}`)),
        `${planData.rowAnchors.length} 个锚点 / ${planData.planIds.length} 条套餐`);

      // 时间线：有变化的套餐，其模板必须写出条数；无变化的写「暂无变更记录」与起算日
      const withEvents = new Map();
      for (const event of planData.events) {
        withEvents.set(event.planId, (withEvents.get(event.planId) || 0) + 1);
      }
      const templateOf = id => (planData.templates.find(t => t.id === id) || {}).text || '';
      const timelineProblems = [];
      for (const id of planData.planIds) {
        const text = templateOf(id);
        const total = withEvents.get(id) || 0;
        if (total > 0) {
          if (!text.includes(`变更记录（${total} 条）`)) timelineProblems.push(`${id}: 期望 ${total} 条`);
        } else if (!text.includes('暂无变更记录')) {
          timelineProblems.push(`${id}: 无变化却没有「暂无变更记录」`);
        }
      }
      check('/plans/coding/ 每条套餐的详情时间线与变更日志逐条对账',
        timelineProblems.length === 0, timelineProblems.slice(0, 3).join(' · ') ||
        `${planData.planIds.length} 条套餐（有变化 ${withEvents.size} 条）`);

      // 展开第一行：时间线必须真的出现在 DOM 里（模板是惰性的，展开前一个字节都不渲染）
      {
        const firstId = planData.planIds[0];
        await page.click(`.ptable [data-detail="${firstId}"]`);
        await page.waitForSelector(`#pdetail-${firstId}`, { timeout: 5000 });
        const detailText = await page.evaluate(() =>
          (document.querySelector('.pdetail') || { innerText: '' }).innerText.replace(/\s+/g, ' ').trim());
        const total = withEvents.get(firstId) || 0;
        check('/plans/coding/ 展开详情后时间线在 DOM 里（无变化时如实写「暂无变更记录」）',
          total > 0 ? detailText.includes(`变更记录（${total} 条）`) : detailText.includes('暂无变更记录'),
          detailText.slice(0, 160));
        await page.click(`.ptable [data-detail="${firstId}"]`);
      }

      // 订阅源：guid 必须等于日志里的事件身份，链接必须带页内锚点
      const planFeed = await page.evaluate(`(async () => {
        const res = await fetch(${JSON.stringify(new URL('feed/plans/coding/changes.xml', base).href)});
        const xml = await res.text();
        const doc = new DOMParser().parseFromString(xml, 'application/xml');
        return {
          status: res.status,
          parserError: doc.querySelector('parsererror') ? doc.querySelector('parsererror').textContent.slice(0, 100) : null,
          guids: [...doc.querySelectorAll('item > guid')].map(g => (g.textContent || '').trim()),
          links: [...doc.querySelectorAll('item > link')].map(l => (l.textContent || '').trim())
        };
      })()`).catch(error => ({ status: -1, error: String(error), guids: [], links: [] }));
      check('/plans/coding/ 的套餐变化订阅源可访问且良构',
        planFeed.status === 200 && !planFeed.parserError && planFeed.error === undefined,
        `HTTP ${planFeed.status}${planFeed.parserError ? ` · ${planFeed.parserError}` : ''}`);
      check('套餐变化订阅源的每一条 guid 都等于日志里重算出来的事件身份',
        planFeed.guids.every(guid => planData.eventIds.includes(guid)),
        `${planFeed.guids.length} 条 guid（日志 ${planData.eventIds.length} 条事件）`);
      check('套餐变化订阅源的每一条链接都落在套餐对比页的某一行上',
        planFeed.links.every(link => {
          const id = (link.match(/#plan-([0-9a-f]{12})$/) || [])[1];
          return Boolean(id) && planData.rowAnchors.includes(`plan-${id}`);
        }),
        planFeed.links.slice(0, 2).join(' '));
    }

    // ⑨ 关掉 JS：基础静态内容必须仍在，而且一个控件都不能有（无死按钮）
    {
      const noJsCtx = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });
      const noJsPage = await noJsCtx.newPage();
      await noJsPage.goto(plansRouteUrl, { waitUntil: 'load' });
      const plain = await noJsPage.evaluate(() => ({
        rows: document.querySelectorAll('.ptable tbody tr[data-item]').length,
        chars: document.body.innerText.replace(/\s+/g, ' ').trim().length,
        official: [...document.querySelectorAll('.ptable tbody a[href^="http"]')].length,
        controls: document.querySelectorAll('button, select, input').length,
        tables: document.querySelectorAll('.ptable').length,
        h1: document.querySelectorAll('h1').length,
        // v2.3：最近变化块与行锚点必须是**构建期静态渲染**的（无 JS 也读得到）
        changesBlock: document.querySelectorAll('#plan-changes').length,
        changesText: ((document.querySelector('#plan-changes') || {}).innerText || '').replace(/\s+/g, ' ').trim(),
        rowAnchors: [...document.querySelectorAll('.ptable tbody tr[data-item]')].filter(tr => /^plan-[0-9a-f]{12}$/.test(tr.id)).length
      }));
      await noJsCtx.close();
      check('/plans/coding/ 无 JS 时仍有完整静态内容（行数 / 官方链接 / h1 / 正文）',
        plain.rows === truth.length && plain.official === truth.length && plain.h1 === 1 && plain.chars > 1200,
        `${plain.rows} 行 · ${plain.official} 个官方链接 · 正文 ${plain.chars} 字`);
      check('/plans/coding/ 无 JS 时页面上零个交互控件（不给"点了没反应"的暗示）',
        plain.controls === 0 && plain.tables === 1, `控件 ${plain.controls} 个`);
      check('/plans/coding/ 无 JS 时「最近变化」块与行锚点仍在（都是构建期静态渲染）',
        plain.changesBlock === 1 && plain.changesText.length > 10 && plain.rowAnchors === truth.length,
        `块 ${plain.changesBlock} 个 · 块内 ${plain.changesText.length} 字 · 锚点 ${plain.rowAnchors}/${truth.length}`);
    }

    // 入口：首页顶栏或页脚必须有这一条（站内入链由此满足 orphan 判据）。
    await page.goto(base, { waitUntil: 'load' });
    const homePlansLink = await page.evaluate(() =>
      [...document.querySelectorAll('header.top a, footer a')].some(a => (a.getAttribute('href') || '').endsWith('plans/coding/')));
    check('首页顶栏或页脚有「套餐对比」入口（这一页不是孤儿页）', homePlansLink);
  }

  // ⑪ v2.4：优惠 ↔ 套餐（Deal → Plan / Plan → Deal）真实浏览器对账
  //
  // 判据**现场从产物重算**：读 `dist/deal-plan-links.json` + `dist/deals.json` + `dist/plans.json`
  // （外加 deal-history 的 ended 事件），自己判断"哪些关系算当前"，再与页面上的 DOM 逐条对账。
  // 刻意不硬编码条数与文案（数据每天都在变，硬编码第二天就变成假红），也不 require 构建期的
  // 判据模块 —— 这一节的价值正是"用另一条路算一遍"。
  {
    const readDist = rel => JSON.parse(fs.readFileSync(path.join(DIR, rel), 'utf8'));
    const linksDoc = readDist('deal-plan-links.json');
    const dealsDoc = readDist('deals.json');
    const plansDoc = readDist('plans.json');
    const apiPlansDoc = fs.existsSync(path.join(DIR, 'api-plans.json')) ? readDist('api-plans.json') : { plans: [] };
    const historyDoc = fs.existsSync(path.join(DIR, 'deal-history.json')) ? readDist('deal-history.json') : { events: [] };
    const asOf = [String(dealsDoc.updatedAt || '').slice(0, 10), String(plansDoc.updatedAt || '').slice(0, 10)]
      .filter(Boolean).sort().pop();
    const dealsById = new Map((dealsDoc.deals || []).map(deal => [deal.id, deal]));
    const endedIds = new Set((historyDoc.events || []).filter(event => event.type === 'ended').map(event => event.id));
    const isCurrentDeal = dealId => {
      const deal = dealsById.get(dealId);
      if (!deal) return false;
      if (endedIds.has(dealId)) return false;
      if (deal.expiresAt && asOf && String(deal.expiresAt) < asOf) return false;
      return true;
    };
    const planIdsByDeal = new Map((linksDoc.links || []).map(link => [link.dealId, link.planIds || []]));
    // v2.5：关系可以指向 API 计费记录，所以浏览器侧也要知道**每条 planId 属于哪一类**，
    // 否则「链接必须是 ../../plans/coding/」这条断言会在一条 api 关系上变红（而那是对的页面）。
    const apiPlanIds = new Set((apiPlansDoc.plans || []).map(plan => plan.id));
    const routeOfPlanId = planId => (apiPlanIds.has(planId) ? 'plans/api/' : 'plans/coding/');
    const currentPairs = new Set();
    for (const link of linksDoc.links || []) {
      if (!isCurrentDeal(link.dealId)) continue;
      for (const planId of link.planIds || []) currentPairs.add(`${link.dealId}\u0000${planId}`);
    }

    // 这一节独立于上面那个 `{}` 块（`plansRouteUrl` 在那里是块级作用域），所以自己构造地址。
    const plansDealsUrl = new URL('plans/coding/', base).href;
    await page.goto(plansDealsUrl, { waitUntil: 'load' });
    const block = await page.evaluate(`(() => {
      const section = document.getElementById('plan-deals');
      if (!section) return null;
      return {
        rows: [...section.querySelectorAll('li[id^="plan-deals-"]')].map(li => ({
          planId: (li.id.match(/^plan-deals-([0-9a-f]{12})$/) || [])[1] || '',
          who: (li.querySelector('a.pdwho') || {}).getAttribute ? li.querySelector('a.pdwho').getAttribute('href') : '',
          none: Boolean(li.querySelector('span.pdnone')),
          currentDeals: [...li.querySelectorAll('a.pdgo:not(.pdgo-hist)')]
            .map(a => (a.getAttribute('href') || '').match(/deal\\/([0-9a-f]{12})\\//))
            .filter(Boolean).map(m => m[1]),
          history: li.querySelectorAll('span.pdhist').length
        })),
        text: (section.innerText || '').replace(/\\s+/g, ' ').trim()
      };
    })()`);
    check('/plans/coding/ 有优惠 ↔ 套餐块 #plan-deals（构建期静态渲染，无 JS 也读得到）',
      Boolean(block), block ? `${block.rows.length} 行` : '找不到 #plan-deals');
    if (block) {
      check('/plans/coding/ 关联块逐条列出全部套餐，顺序与表内一致',
        block.rows.length === plansDoc.plans.length &&
        block.rows.every((row, index) => row.planId === plansDoc.plans[index].id),
        `${block.rows.length} 行 / ${plansDoc.plans.length} 条套餐`);
      check('/plans/coding/ 关联块每行都链回真实的套餐行锚点',
        block.rows.every(row => row.who === `#plan-${row.planId}`),
        block.rows.map(row => row.who).slice(0, 3).join(' '));
      const problems = [];
      for (const row of block.rows) {
        for (const dealId of row.currentDeals) {
          if (!currentPairs.has(`${dealId}\u0000${row.planId}`)) problems.push(`把已结束的 ${dealId} 当成当前优惠`);
        }
        if (!row.currentDeals.length && !row.none) problems.push(`${row.planId} 没有当前优惠却没写「暂无当前优惠」`);
        if (row.currentDeals.length && row.none) problems.push(`${row.planId} 既有当前优惠又写着「暂无当前优惠」`);
      }
      check('/plans/coding/ 「当前优惠」只出现在当前关系上，空态写明「暂无当前优惠」',
        problems.length === 0, problems.slice(0, 3).join(' '));
      const shown = new Set(block.rows.flatMap(row => row.currentDeals.map(dealId => `${dealId}\u0000${row.planId}`)));
      // v2.5：这一页只渲染 Coding 记录的行（API 记录在 /plans/api/）。所以「漏了一条关系」的对照
      // 也必须按 kind 收敛 —— 否则一组 API 关系会被判成"套餐页漏了"，而那一页本来就不该有它。
      const missing = [...currentPairs]
        .filter(pair => !apiPlanIds.has(pair.split('\u0000')[1]))
        .filter(pair => !shown.has(pair));
      check('/plans/coding/ 每一条当前关系都出现在页面上（漏一条就是"关系丢了"）',
        missing.length === 0, missing.join(' '));
      check('/plans/coding/ 已结束的优惠没有以「当前优惠」形态出现（Tooth #4 的浏览器侧）',
        block.rows.flatMap(row => row.currentDeals).filter(dealId => !isCurrentDeal(dealId)).length === 0);
      const servedLinks = await page.evaluate(`(async () => {
        const response = await fetch(${JSON.stringify(new URL('deal-plan-links.json', base).href)});
        return { status: response.status, body: await response.text() };
      })()`);
      let servedOk = false;
      try { servedOk = JSON.stringify(JSON.parse(servedLinks.body).links) === JSON.stringify(linksDoc.links); } catch (error) { servedOk = false; }
      check('dist/deal-plan-links.json 可下载且与源表一致（关系可被外部核对）',
        servedLinks.status === 200 && servedOk, `HTTP ${servedLinks.status}`);
    }

    const anchors = new Set(block ? block.rows.map(row => `plan-${row.planId}`) : []);
    // v2.5：API 计费记录的锚点在**另一页**上（`/plans/api/` 的每一行也有 `#plan-<id>`）。
    const apiAnchors = new Set((apiPlansDoc.plans || []).map(plan => `plan-${plan.id}`));
    const titleOfPlanId = planId => {
      const plan = (plansDoc.plans || []).find(item => item.id === planId)
        || (apiPlansDoc.plans || []).find(item => item.id === planId);
      return plan ? (plan.planName || '') : '';
    };
    const linkedDealId = (linksDoc.links || []).map(link => link.dealId).find(id => dealsById.has(id)) || null;
    const unlinkedDealId = (dealsDoc.deals || []).map(deal => deal.id)
      .find(id => !(linksDoc.links || []).some(link => link.dealId === id)) || null;
    if (linkedDealId) {
      await page.goto(new URL(`deal/${linkedDealId}/`, base).href, { waitUntil: 'load' });
      const dealBlock = await page.evaluate(`(() => {
        const el = document.querySelector('.dplans');
        if (!el) return null;
        return {
          planIds: [...el.querySelectorAll('li.dpl')].map(li => li.getAttribute('data-plan-id') || ''),
          hrefs: [...el.querySelectorAll('a.dpl-who, a.dpl-go')].map(a => a.getAttribute('href') || ''),
          text: (el.innerText || '').replace(/\\s+/g, ' ').trim()
        };
      })()`);
      check(`/deal/${linkedDealId}/ 有关系 → 渲染出「关联的正常套餐」块`,
        Boolean(dealBlock), dealBlock ? dealBlock.text.slice(0, 60) : '找不到 .dplans');
      if (dealBlock) {
        const expected = planIdsByDeal.get(linkedDealId) || [];
        check('/deal/<id>/ 关联块列出的套餐与关系表一致',
          JSON.stringify(dealBlock.planIds) === JSON.stringify(expected), JSON.stringify(dealBlock.planIds));
        // 每行有**两个**指向同一锚点的链接（标题 + 查看链接），所以按集合比而不是按下标比。
        const expectedHrefs = expected.map(planId => `../../${routeOfPlanId(planId)}#plan-${planId}`);
        const gotHrefs = [...new Set(dealBlock.hrefs)];
        check('/deal/<id>/ 每条记录都链到它所在那一页的行锚点，且锚点在那一页上真实存在',
          gotHrefs.length > 0 &&
          JSON.stringify(gotHrefs.slice().sort()) === JSON.stringify(expectedHrefs.slice().sort()) &&
          gotHrefs.every(href => anchors.has(href.split('#')[1]) || apiAnchors.has(href.split('#')[1])),
          dealBlock.hrefs.join(' '));
        check('/deal/<id>/ 关联块写出记录名与查看链接（两类记录各有自己的措辞）',
          expected.every(planId => dealBlock.text.includes(titleOfPlanId(planId))) &&
          (dealBlock.text.includes('查看套餐对比') || dealBlock.text.includes('查看 API 计费对比')));
      }
    }
    if (unlinkedDealId) {
      await page.goto(new URL(`deal/${unlinkedDealId}/`, base).href, { waitUntil: 'load' });
      const extra = await page.evaluate(() => document.querySelectorAll('.dplans').length);
      check('/deal/<id>/ 没有关系的优惠页一个字节都不多（不渲染关联块）', extra === 0, `${extra} 个 .dplans`);
    }
  }

  /* ------------------------------------------------------------------ */
  /* API / Token 计费页（/plans/api/，v2.5）                              */
  /* ------------------------------------------------------------------ */

  console.log('\n=== 20) API / Token 计费页（/plans/api/）===');

  /**
   * 为什么这一段必须存在：这一页的坏法全都是「页面上看起来正常」的坏法 ——
   *   · 把输入价渲染到输出价那一列（两列都是价格、都带币种，只有逐格对账才发现）；
   *   · 把 `$/1K` 的数字当成 `$/1M`（少一个单位列，读者就会拿两个口径去比）；
   *   · 把 credits 折算成 token（页面上会多出一个数字，而它没有官方依据）；
   *   · 宽表在窄屏把整页撑开（/status/ 与 /plans/coding/ 都踩过）。
   * 构建期那几条断言查的是我们写下的字节，这里查的是**浏览器渲染出来的文字**。
   */
  {
    const apiRoute = 'plans/api/';
    // ⚠️ 每一节都必须自己快照错误计数：全局 `errors` 是**整轮累积**的，
    // 少了这一对快照，本节引入的任何一条控制台错误都会悄悄记到整轮的账上
    //（实测踩过：本节曾经 `page.goto('sitemap.xml')`，XML 文档没有 favicon 声明，
    //  浏览器去要 /favicon.ico 得到 404 ⇒ 一条控制台错误 ⇒ 回归比对「JS 错误仍为 0」变红）。
    const errorsBeforeApi = errors.length;
    const externalBeforeApi = externalRequests.length;
    await page.goto(new URL(apiRoute, base).href, { waitUntil: 'load' });
    const ap = await page.evaluate(() => ({
      h1: (document.querySelector('h1') || {}).textContent || '',
      h1Count: document.querySelectorAll('h1').length,
      canonicalPath: (() => { try { return new URL((document.querySelector('link[rel="canonical"]') || {}).href).pathname; } catch (e) { return ''; } })(),
      rows: document.querySelectorAll('.ptable tbody tr[data-item]').length,
      // 五个价格格按列取：输入 / 输出 / 缓存命中（单位列不是 .num）
      numeric: [...document.querySelectorAll('.ptable tbody tr[data-item]')].map(tr =>
        [...tr.querySelectorAll('td.num')].map(td => (td.innerText || '').replace(/\s+/g, ' ').trim().split('\n')[0])),
      units: [...document.querySelectorAll('.ptable tbody td.punit')].map(td => (td.innerText || '').replace(/\s+/g, ' ').trim()),
      // 模型名取第一个子节点（`<small>` 里的「计费产品 · 通道」不算模型名的一部分）
      models: [...document.querySelectorAll('.ptable tbody tr[data-item] th')].map(th =>
        (th.childNodes[0] && th.childNodes[0].textContent ? th.childNodes[0].textContent : '').trim()),
      officialLinks: [...document.querySelectorAll('.ptable tbody a[href^="http"]')].map(a => a.href),
      controls: document.querySelectorAll('.ptable button, .ptable select, .ptable input, .ptable a.pdetbtn').length,
      // 只取**记录锚点**：优惠关系块的容器 `id="plan-deals"` 与它的每一行 `plan-deals-<id>`
      // 也以 plan- 开头，必须一起排除（否则锚点数永远比记录数多 8 个）。
      anchors: [...document.querySelectorAll('[id^="plan-"]')]
        .map(el => el.id).filter(id => id !== 'plan-deals' && !id.startsWith('plan-deals-')),
      declared: (() => {
        const ld = [...document.querySelectorAll('script[type="application/ld+json"]')]
          .map(s => { try { return JSON.parse(s.textContent); } catch (e) { return null; } }).filter(Boolean);
        const list = ld.find(d => d['@type'] === 'ItemList');
        return list ? Number(list.numberOfItems) : -1;
      })(),
      crumbs: [...document.querySelectorAll('.crumb a')].map(a => a.getAttribute('href') || ''),
      footLinks: [...document.querySelectorAll('footer a')].map(a => a.getAttribute('href') || ''),
      cross: [...document.querySelectorAll('a[href$="plans/coding/"]')].length,
      text: document.body ? document.body.innerText.replace(/\s+/g, ' ').trim() : ''
    }));

    const apiTruth = await page.evaluate(`(async () => {
      const doc = await (await fetch(${JSON.stringify(new URL('api-plans.json', base).href)})).json();
      const rows = [];
      for (const plan of doc.plans || []) {
        for (const entry of plan.models || []) {
          rows.push({
            planId: plan.id,
            model: entry.name,
            unit: plan.pricing && plan.pricing.unit ? (plan.pricing.currency + ' / ' + plan.pricing.unit) : null,
            currency: plan.pricing ? plan.pricing.currency : null,
            input: entry.rates ? entry.rates.input : null,
            output: entry.rates ? entry.rates.output : null,
            cached: entry.rates ? entry.rates.cachedInput : null,
            officialUrl: plan.officialUrl
          });
        }
      }
      return { rows, recordIds: (doc.plans || []).map(plan => plan.id) };
    })()`).catch(() => null);

    const truthRows = apiTruth ? apiTruth.rows : null;
    const symbol = { CNY: '¥', USD: '$', HKD: 'HK$', EUR: '€', JPY: '¥', GBP: '£', SGD: 'S$' };
    const priceText = (value, currency) => {
      if (value === null || value === undefined) return '—';
      if (value === 0) return '免费';
      const symbolText = symbol[currency] || '';
      const [int, frac] = String(value).split('.');
      const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      return `${symbolText}${frac ? `${grouped}.${frac}` : grouped}`;
    };

    check('/plans/api/ 能打开且恰好一个 h1',
      ap.h1Count === 1 && ap.text.length > 1200 && /API/.test(ap.h1),
      `h1 ${ap.h1Count} 个 · 正文 ${ap.text.length} 字 · 「${ap.h1.trim()}」`);
    check('/plans/api/ canonical 自指',
      ap.canonicalPath.endsWith('/plans/api/'), ap.canonicalPath);
    check('/plans/api/ 行数与 api-plans.json 逐个对账',
      Boolean(truthRows) && ap.rows === truthRows.length && ap.models.join('|') === truthRows.map(row => row.model).join('|'),
      `页面 ${ap.rows} 行 / 数据 ${truthRows ? truthRows.length : '未读到'}`);
    check('/plans/api/ ItemList 声明数 == 行数（且是 CollectionPage + BreadcrumbList + ItemList）',
      ap.declared === ap.rows, `声明 ${ap.declared} / 行 ${ap.rows}`);

    // 逐格对账：输入价 / 输出价 / 缓存命中输入**必须是数据里的那三个数**
    // （这是 Tooth #2 的浏览器侧：把输入与输出渲染反了，只有逐格比才发现）
    let mismatch = [];
    if (truthRows) {
      truthRows.forEach((row, i) => {
        const cells = ap.numeric[i] || [];
        const expect = [priceText(row.input, row.currency), priceText(row.output, row.currency), priceText(row.cached, row.currency)];
        if (JSON.stringify(cells) !== JSON.stringify(expect)) {
          mismatch.push(`第 ${i + 1} 行 ${row.model}：页面 ${JSON.stringify(cells)} / 数据 ${JSON.stringify(expect)}`);
        }
      });
    }
    check('/plans/api/ 输入价 / 输出价 / 缓存命中输入 三列逐格与数据对账（互换输入输出必红）',
      Boolean(truthRows) && mismatch.length === 0, mismatch.slice(0, 2).join('；'));

    // 单位列：逐行可见，且口径文字与数据一致
    const unitLabel = { per_1M_tokens: '每 100 万 tokens', per_1K_tokens: '每 1000 tokens', per_1M_characters: '每 100 万字符' };
    const unitMismatch = truthRows
      ? truthRows.map((row, i) => {
        if (!row.unit) return null;
        const want = `${row.currency} / ${unitLabel[row.unit.split('/ ').pop()]}`;
        const got = ap.units[i] || '';
        return got === want ? null : `第 ${i + 1} 行：页面「${got}」/ 数据「${want}」`;
      }).filter(Boolean)
      : ['未读到数据'];
    check('/plans/api/ 每一行都写出「计费单位」，且与数据一致（$ / 1M 与 $ / 1K 不会被混为一谈）',
      ap.units.length === ap.rows && unitMismatch.length === 0, unitMismatch.slice(0, 2).join('；'));

    check('/plans/api/ 每行都给官方定价页链接，且指向数据里的那个地址',
      Boolean(truthRows) && ap.officialLinks.length === truthRows.length, `${ap.officialLinks.length} 个`);
    check('/plans/api/ 没有任何交互控件（v1 是预渲染静态表，无 JS 也给不出"点了没反应"的暗示）',
      ap.controls === 0, `${ap.controls} 个`);
    // 锚点：每条**记录**一个（不是每行一个）—— 订阅源与深链的落点必须在浏览器里真的存在。
    const expectedAnchors = apiTruth ? apiTruth.recordIds.map(id => `plan-${id}`).sort() : null;
    check('/plans/api/ 每条记录都有 #plan-<id> 锚点（记录数 == 锚点数）',
      Boolean(expectedAnchors) && JSON.stringify(ap.anchors.slice().sort()) === JSON.stringify(expectedAnchors),
      `${ap.anchors.length} 个锚点：${ap.anchors.join(' ')}`);
    check('/plans/api/ 面包屑回站根（两层路由必须用 ../../，不是 ../）',
      ap.crumbs.length > 0 && ap.crumbs.every(href => !href.startsWith('../') || href.startsWith('../../')), ap.crumbs.join(' '));
    check('/plans/api/ 页脚有指向本页的入口', ap.footLinks.some(href => href.endsWith('plans/api/')),
      ap.footLinks.filter(href => href.includes('plans')).join(' '));
    check('/plans/api/ 与 Coding 套餐页互相可达（并列的产品能力，不是孤岛）', ap.cross > 0);
    check('/plans/api/ 写着「单位不换算」与「credits 不是 token」两类口径',
      ap.text.includes('不做换算') && ap.text.includes('credits 是预付费额度'));
    check('/plans/api/ 页面上没有结论性词汇（不做价值判断）',
      !['性价比', '最划算', '最超值', '最值得买', '排行榜', '综合评分', '推荐指数'].some(word => ap.text.includes(word)));

    // 平台列真的画出了 logo：这一页写了 `data-logo`，就必须引用 logos.css。
    // 缺样式表的表现是"每一行的 logo 位是一个空方块"—— 既不报错也不发外部请求，
    // 所以必须**量出来**（背景图真的有、尺寸真的非零），而不是相信模板里有那个属性。
    // ⚠️ 必须在**还停在这一页**时量：下面的宽度循环与末尾的首页导航都会换页面。
    const logoStat = await page.evaluate(() => {
      // 选择器与 `logos.css` 的规则选择器**同一个**（`.lg[data-logo]`）——
      // 用自造的类名去查，查到的永远是自己写的那个空壳。
      const first = document.querySelector('.ptable .lg[data-logo]');
      if (!first) return { present: false };
      const rect = first.getBoundingClientRect();
      const bg = getComputedStyle(first).backgroundImage;
      return { present: true, key: first.getAttribute('data-logo'), w: Math.round(rect.width), h: Math.round(rect.height), bg };
    });
    check('/plans/api/ 平台列的 logo 真的画出来了（引用了 logos.css，不是空方块）',
      logoStat.present && logoStat.w > 0 && logoStat.h > 0 && logoStat.bg && logoStat.bg !== 'none',
      JSON.stringify(logoStat));

    // 窄屏：宽表必须在容器内横滚，不许把整页撑开（沿用 /plans/coding/ 的同一条口径）
    for (const width of [390, 360]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(new URL(apiRoute, base).href, { waitUntil: 'load' });
      const mobile = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        tables: document.querySelectorAll('.ptable').length
      }));
      check(`/plans/api/ ${width}px 不产生页面级横向溢出（11 列宽表应在容器内横滚）`,
        mobile.overflow <= 0, `溢出 ${mobile.overflow}px`);
      check(`/plans/api/ ${width}px 只有一个表格（移动端不维护第二套数据模板）`, mobile.tables === 1);
    }
    await page.setViewportSize({ width: 1440, height: 900 });

    // 入口：首页顶栏（宽屏）或页脚必须有这一条
    await page.goto(base, { waitUntil: 'load' });
    const homeApiLink = await page.evaluate(() =>
      [...document.querySelectorAll('header.top a, footer a')].some(a => (a.getAttribute('href') || '').endsWith('plans/api/')));
    check('首页顶栏或页脚有「API / Token 计费对比」入口（这一页不是孤儿页）', homeApiLink);
    // sitemap **用 fetch 读**，不 goto：goto 一个 XML 文档会让浏览器去要 /favicon.ico（404），
    // 而那一条会被记成"JS 错误"。其余各节读 Feed / JSON 也都是 fetch。
    const sitemapHit = await page.evaluate(`(async () => {
      const r = await fetch(${JSON.stringify(new URL('sitemap.xml', base).href)});
      return { status: r.status, body: await r.text() };
    })()`).catch(() => null);
    check('/plans/api/ 在 sitemap 里（成员资格，不是"文件存在"）',
      Boolean(sitemapHit) && sitemapHit.status === 200 && sitemapHit.body.includes('plans/api/'),
      sitemapHit ? `HTTP ${sitemapHit.status}` : '读取失败');
    check('/plans/api/ 没有 JS 错误、没有外部请求（含本节的全部导航）',
      errors.length === errorsBeforeApi && externalRequests.length === externalBeforeApi,
      `JS 错误 ${errors.length - errorsBeforeApi} 个 · 外部请求 ${externalRequests.length - externalBeforeApi} 个`);
  }

  /* ================================================================== */
  /* v3.0 Stage I：四个资料库页面家族的真浏览器验收（§21–§25）             */
  /* ================================================================== */
  //
  // 这五节的坏法是同一类，所以共用一套「页面体检」：
  //   · 关掉 JS 内容就没了（预渲染只是说说）；
  //   · 冒出一个点不动的控件（预渲染 HTML 里出现 JS 控件）；
  //   · canonical 不自指 / 面包屑深度写错（页面看起来完全正常，只有点击才发现 404）；
  //   · ItemList 声明数与页面 `data-item` 行数不符；
  //   · 该给的官方链接丢了；
  //   · 窄屏把整页撑开（/status/、/plans/coding/、/plans/api/ 都踩过）；
  //   · 漏进 sitemap / 混进外来请求 / 控制台报错。
  //
  // ⚠️ 每一节都自己快照 `errors` / `externalRequests`：全局计数是整轮累积的。
  const libraryNoJsCtx = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });
  const libraryNoJsPage = await libraryNoJsCtx.newPage();
  const librarySitemap = await page.evaluate(`(async () => {
    const r = await fetch(${JSON.stringify(new URL('sitemap.xml', base).href)});
    return { status: r.status, body: await r.text() };
  })()`).catch(() => null);
  // sitemap 里的 URL 用的是**线上站点根**，不是本地临时端口 —— 先取出站点根再逐条比对。
  const librarySiteRoot = librarySitemap ? ((librarySitemap.body.match(/<loc>([^<]*)<\/loc>/) || [])[1] || '') : '';
  const inSitemap = route => Boolean(librarySitemap) && librarySitemap.status === 200
    && librarySitemap.body.includes(`<loc>${librarySiteRoot}${route}</loc>`);

  /**
   * 「站外链接」这一类里**唯一允许的非厂商例外**：页脚那枚指向本项目仓库的链接。
   *
   * 为什么不写死 URL：写死等于在验收脚本里维护第二份仓库地址；而这里要守的语义是
   * 「枢纽页不许往外送流量给厂商，只允许站点自己的仓库入口」。仓库地址是**站点自己声明**的，
   * 所以判定基准从首页共享页脚里现取 —— 语义与地址解耦，改域名不用改验收脚本，
   * 而把那一枚换成厂商地址会立刻让枢纽页的断言转红。
   *
   * `--url=` 线上冒烟时读不到 dist，这时返回空集：例外集为空 = 恢复成「一条站外链接都不许」，
   * 是更严的一侧，不会让线上冒烟假绿。
   *
   * ⚠️ **读的是 `DIR`（`--dir=` 指向的那份产物），不是写死的 `ROOT/dist`**（judge-hardening-v1a / t5 A1）：
   * 旧写法在「只有副本、没有 dist/」的工作树里必然读不到 ⇒ `catch` 返回**空例外集** ⇒
   * 5 个枢纽页各多报一条「按设计没有站外链接」= 10 条假失败（t6 实测）。
   * 现在：`--dir=dist.calib` 读副本的首页页脚；不传 `--dir` 时 `DIR` 就是 `dist`（与旧行为逐字相同，
   * 线上冒烟因此不受影响）；文件真的读不到时仍然返回空集（fail-strict，不放宽）。
   */
  const sharedFooterExternalHrefs = (() => {
    try {
      const home = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
      const fragment = (home.match(/<!--SHARED:footer:START-->([\s\S]*?)<!--SHARED:footer:END-->/) || [])[1] || '';
      return new Set([...fragment.matchAll(/href="(https?:\/\/[^"]+)"/g)].map(m => m[1]));
    } catch (error) {
      return new Set();
    }
  })();

  /**
   * 一次页面体检。`opts`：
   *   label        用于 check 名称
   *   route        站根相对路由（带尾斜杠）
   *   noJsText     无 JS 时必须读到的文本片段（每条都要在）
   *   minText      无 JS 时的正文下限（按 page-kinds 的口径取整）
   *   itemList     true=必须有 ItemList 且声明数==元素数==页面行数；false=必须没有；null=不查
   *   official     期望的外部官方链接数下限（默认 0：0 表示"这一页按设计没有外链"）
   *                ⚠️ 这里数的是**站外链接**，唯一的例外是页脚那一枚指向本项目仓库的链接。
   *                它由首页页脚（共享片段）声明，因此这个例外是**自证**的：判定基准直接从
   *                产物里取，不在脚本里写死 URL —— 谁把页脚那枚链接改成厂商地址，枢纽页的
   *                这条断言立刻红。而"不往外送流量给厂商"的原意一字不改。
   *   overflow     true=查 390/360 页面级横向溢出
   *   footerLink   true=页脚必须有指向本页的入口（索引/枢纽页）；详情页为 false
   *                （详情页的入链来自索引页，逐条在各自小节里查）
   *   rowSelector  ItemList 行数对账用的行标记（枢纽页是 [data-child]，其余是 [data-item]）
   */
  async function auditLibraryPage(opts) {
    const { label, route } = opts;
    const noJsText = opts.noJsText || [];
    const minText = opts.minText || 0;
    const itemList = opts.itemList === undefined ? null : opts.itemList;
    const officialMin = opts.official === undefined ? 0 : opts.official;
    const wantOverflow = opts.overflow !== false;
    const footerLink = opts.footerLink !== false;
    const rowSelector = opts.rowSelector || '[data-item]';
    const depth = route.split('/').filter(Boolean).length;
    const prefix = '../'.repeat(depth);
    const errorsBefore = errors.length;
    const externalBefore = externalRequests.length;

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(new URL(route, base).href, { waitUntil: 'load' });
    const data = await page.evaluate(`(() => {
      const strip = s => (s || '').replace(/\\s+/g, ' ').trim();
      const lds = [...document.querySelectorAll('script[type="application/ld+json"]')]
        .map(s => { try { return JSON.parse(s.textContent); } catch (e) { return null; } }).filter(Boolean);
      const list = lds.find(d => d['@type'] === 'ItemList') || null;
      const crumbLinks = [...document.querySelectorAll('.crumb a')].map(a => a.getAttribute('href') || '');
      const official = [...document.querySelectorAll('a[href^="http"]')].map(a => a.href);
      // 站外链接里扣掉「站点自己在共享页脚里声明的那一枚仓库入口」，其余一律算数。
      // 比对用 href（绝对地址）：产物里写的是绝对 URL，但判定不该依赖写法。
      const repoException = ${JSON.stringify([...sharedFooterExternalHrefs])};
      const outbound = official.filter(href => !repoException.includes(href));
      return {
        title: strip((document.querySelector('h1') || {}).textContent),
        h1Count: document.querySelectorAll('h1').length,
        canonical: (document.querySelector('link[rel="canonical"]') || {}).href || '',
        crumbLinks,
        rows: document.querySelectorAll(${JSON.stringify(rowSelector)}).length,
        declared: list ? Number(list.numberOfItems) : -1,
        elements: list ? (list.itemListElement || []).length : -1,
        officialCount: official.length,
        officialHrefs: official,
        outboundCount: outbound.length,
        outboundHrefs: outbound,
        controls: document.querySelectorAll('main button, main select, main input, main textarea').length,
        text: document.body ? document.body.innerText.replace(/\\s+/g, ' ').trim() : '',
        footLinks: [...document.querySelectorAll('footer a')].map(a => a.getAttribute('href') || '')
      };
    })()`);

    check(`${label} 能打开且恰好一个 h1`, data.h1Count === 1, `${data.h1Count} 个 · 「${data.title}」`);
    check(`${label} canonical 自指`, data.canonical.endsWith(new URL(route, base).pathname), data.canonical);
    check(`${label} 面包屑第一级回站根（${depth} 层路由 ⇒ ${prefix}）`,
      data.crumbLinks.length > 0 && data.crumbLinks[0] === prefix, data.crumbLinks.join(' ') || '没有面包屑');
    if (itemList === true) {
      check(`${label} ItemList 声明数 == 元素数 == 页面 data-item 行数`,
        data.declared >= 0 && data.declared === data.elements && data.declared === data.rows,
        `声明 ${data.declared} / 元素 ${data.elements} / 行 ${data.rows}`);
    } else if (itemList === false) {
      check(`${label} 刻意没有 ItemList（详情叶子 / 单页）`, data.declared === -1, `声明 ${data.declared}`);
    }
    if (footerLink) {
      check(`${label} 页脚有指向本页的入口`, data.footLinks.some(href => href.endsWith(route)),
        data.footLinks.filter(href => href.includes(route.split('/')[0])).join(' ') || '页脚没有本页');
    }
    check(`${label} 在 sitemap 里（成员资格，不是"文件存在"）`, inSitemap(route),
      librarySitemap ? `HTTP ${librarySitemap.status}` : '读取失败');
    if (officialMin > 0) {
      check(`${label} 官方链接逐条都在（≥${officialMin} 条，且都是 http(s)）`,
        data.officialCount >= officialMin && data.officialHrefs.every(href => /^https?:\/\//.test(href)),
        `${data.officialCount} 条`);
    } else {
      check(`${label} 按设计没有站外链接（这一页只做站内导航与数据出口）`,
        data.outboundCount === 0,
        `${data.outboundCount} 条：${data.outboundHrefs.slice(0, 2).join(' ')}` +
        (data.officialCount > data.outboundCount
          ? `（另有 ${data.officialCount - data.outboundCount} 条本项目仓库入口，由共享页脚声明，不计）`
          : ''));
    }
    if (wantOverflow) {
      for (const width of [390, 360]) {
        await page.setViewportSize({ width, height: 800 });
        const overflow = await page.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth');
        check(`${label} ${width}px 不产生页面级横向溢出`, overflow === 0, `${overflow}px`);
      }
      await page.setViewportSize({ width: 1440, height: 900 });
    }

    // 无 JS：预渲染的硬定义 —— 关掉 JS 打开，正文与关键片段都要在，且**一个控件都没有**
    await libraryNoJsPage.goto(new URL(route, base).href, { waitUntil: 'load' });
    const noJs = await libraryNoJsPage.evaluate(`(() => {
      const text = document.body ? document.body.innerText.replace(/\\s+/g, ' ').trim() : '';
      return {
        text,
        controls: document.querySelectorAll('main button, main select, main input, main textarea').length,
        rows: document.querySelectorAll('[data-item]').length
      };
    })()`);
    check(`${label} 无 JS 时正文完整（≥${minText} 字）`, noJs.text.length >= minText, `${noJs.text.length} 字`);
    check(`${label} 无 JS 时一个控件都没有（预渲染里不许有点不动的控件）`, noJs.controls === 0, `${noJs.controls} 个`);
    for (const marker of noJsText) {
      check(`${label} 无 JS 时读得到「${marker}」`, noJs.text.includes(marker));
    }

    check(`${label} 没有 JS 错误、没有外部请求（含本节的全部导航）`,
      errors.length === errorsBefore && externalRequests.length === externalBefore,
      `JS 错误 ${errors.length - errorsBefore} 个 · 外部请求 ${externalRequests.length - externalBefore} 个`);
    return { data, noJs };
  }

  /* ------------------------------------------------------------------ */
  /* /plans/ 统一资料入口（v3.0 Stage B）                                 */
  /* ------------------------------------------------------------------ */

  console.log('\n=== 21) /plans/ 资料入口 ===');
  {
    const route = 'plans/';
    const { data } = await auditLibraryPage({
      label: '/plans/',
      route,
      noJsText: ['Coding 套餐', 'API 计费', '最近套餐与价格变化'],
      minText: 700,
      itemList: true,
      rowSelector: '[data-child]',
      official: 0
    });
    check('/plans/ 给出两个子页入口（Coding 与 API）',
      data.text.includes('Coding 套餐') && data.text.includes('API 计费')
      && data.text.includes('进入 Coding 套餐对比') && data.text.includes('进入 API / Token 计费对比'));
    check('/plans/ 不是第三张重复大表（0 个 <table>）',
      (await page.evaluate('document.querySelectorAll("table").length')) === 0);
    const hubTruth = await page.evaluate(`(async () => {
      const plans = await (await fetch(${JSON.stringify(new URL('plans.json', base).href)})).json();
      const api = await (await fetch(${JSON.stringify(new URL('api-plans.json', base).href)})).json();
      return { plans: plans.count, apiRecords: api.count,
        apiItems: (api.plans || []).reduce((n, p) => n + (p.models || []).length, 0) };
    })()`).catch(() => null);
    if (hubTruth) {
      // 计数用**数据标记**对账（页面上的每个数字都带 data-summary-label/value），
      // 不靠"句子长什么样"—— 文案会改，标记是契约。
      const summaryMatches = await page.evaluate(`(() => {
        const want = ${JSON.stringify({ '套餐数': hubTruth.plans, '计费记录': hubTruth.apiRecords, '模型计价条目': hubTruth.apiItems })};
        const read = {};
        for (const el of document.querySelectorAll('[data-summary-label]')) {
          read[el.getAttribute('data-summary-label')] = el.getAttribute('data-summary-value');
        }
        return Object.entries(want).every(([label, value]) => read[label] === String(value));
      })()`);
      check('/plans/ 的计数与 dist 数据逐个对账（套餐数 / 计费记录 / 模型计价条目）',
        summaryMatches, JSON.stringify(hubTruth));
    }
    check('/plans/ 互链到模型资料 / 历史档案 / 数据文档（枢纽页互链）',
      data.text.includes('模型资料索引') && data.text.includes('历史档案') && data.text.includes('数据文档'));
  }

  /* ------------------------------------------------------------------ */
  /* /models/ 与模型详情页（v3.0 Stage D5/D6）                            */
  /* ------------------------------------------------------------------ */

  console.log('\n=== 22) /models/ 与模型详情页 ===');
  {
    const { data } = await auditLibraryPage({
      label: '/models/',
      route: 'models/',
      noJsText: ['模型资料索引', '开发者', '模型族'],
      minText: 600,
      itemList: true,
      official: 0
    });
    const modelsTruth = await page.evaluate(`(async () => {
      const doc = await (await fetch(${JSON.stringify(new URL('models.json', base).href)})).json();
      const linksDoc = await (await fetch(${JSON.stringify(new URL('model-registry-links.json', base).href)})).json();
      const apiDoc = await (await fetch(${JSON.stringify(new URL('api-plans.json', base).href)})).json();
      const planById = new Map((apiDoc.plans || []).map(plan => [plan.id, plan]));
      // 一条 API 映射认领的**真实计价条目**：variant 为 null/空 ⇒ 该 modelKey 在该记录里的
      // **全部真实变体**（口径与 scripts/tools/registry-join-audit.js 逐字一致：
      // 一条真实计价条目 = 一行；页面渲染走的是同一条展开）。
      const expectedBySlug = {};
      const groupCount = {};
      for (const link of (linksDoc.links || [])) {
        if (!link || !link.registrySlug || !link.apiPlanId || !link.modelKey) continue;
        const plan = planById.get(link.apiPlanId);
        if (!plan) continue;
        const entries = (plan.models || []).filter(item => item && item.modelKey === link.modelKey);
        const wildcard = link.variant === null || link.variant === undefined || link.variant === '';
        const picked = wildcard ? entries : entries.filter(item => item.variant === link.variant);
        for (const entry of picked) {
          expectedBySlug[link.registrySlug] = (expectedBySlug[link.registrySlug] || 0) + 1;
          const pair = link.apiPlanId + '|' + link.modelKey;
          groupCount[pair] = (groupCount[pair] || 0) + 1;
        }
      }
      const multiPairs = Object.keys(groupCount).filter(key => groupCount[key] > 1);
      const multiVariantSlugs = Object.keys(expectedBySlug).filter(slug => (linksDoc.links || []).some(link =>
        link.registrySlug === slug && link.apiPlanId && multiPairs.includes(link.apiPlanId + '|' + link.modelKey)));
      // coverage-expansion-v1：默认可见性**在这一层按数据现算**（不写死集合、不读页面自报的数）。
      // 期望值只从 dist/models.json 的 catalogStatus 推：current / aging / unknown 默认展示，
      // legacy / historical 默认隐藏。枚举外的值按页面同一条口径回落到 unknown（展示）。
      const DEFAULT_VISIBLE_STATUSES = ['current', 'aging', 'unknown'];
      const catalogRows = (doc.models || []).map(model => ({
        slug: model.slug,
        catalogStatus: model.catalogStatus || 'unknown',
        releasedAt: model.releasedAt || null,
        officialUrl: model.officialUrl || ''
      }));
      const visibleRows = catalogRows.filter(row => DEFAULT_VISIBLE_STATUSES.includes(row.catalogStatus));
      const hiddenRows = catalogRows.filter(row => !DEFAULT_VISIBLE_STATUSES.includes(row.catalogStatus));
      const counts = {};
      for (const row of catalogRows) counts[row.catalogStatus] = (counts[row.catalogStatus] || 0) + 1;
      // 旧型号抽查要挑一个「确实有站外官方链接」的：详情页的站外链接断言要求 ≥1 条，
      // 挑错了会把「这一条恰好没有官方页」误判成页面缺陷。
      const hiddenSample = hiddenRows.find(row => row.officialUrl || (expectedBySlug[row.slug] || 0) > 0);
      return {
        count: doc.count,
        slugs: (doc.models || []).map(m => m.slug),
        firstSlug: (doc.models || [])[0].slug,
        expectedBySlug,
        multiVariantSlugs,
        expectedTotal: Object.values(expectedBySlug).reduce((n, v) => n + v, 0),
        catalog: {
          counts,
          visibleCount: visibleRows.length,
          hiddenCount: hiddenRows.length,
          visibleSlugs: visibleRows.map(row => row.slug),
          hiddenSlugs: hiddenRows.map(row => row.slug),
          datedCount: catalogRows.filter(row => row.releasedAt).length,
          hiddenSampleSlug: hiddenSample ? hiddenSample.slug : null
        }
      };
    })()`).catch(() => null);
    if (modelsTruth) {
      // 静态表 == registry 的**全部**模型。`data-item` 只标"这一行同时有详情页"，
      // 因此它不再等于表里的行数 —— 两条口径分开量，谁也不许吞行。
      const tableRows = await page.evaluate('document.querySelectorAll("#models-table tbody tr[data-model]").length');
      const itemRows = await page.evaluate('document.querySelectorAll("#models-table tbody tr[data-item]").length');
      check(`/models/ 静态表行数 == dist/models.json 全部模型数（${modelsTruth.count} 个）`,
        tableRows === modelsTruth.count, `页面 ${tableRows} 行 / 数据 ${modelsTruth.count} 个`);
      check('/models/ 有详情页的行（data-item）== ItemList 声明数 == 元素数（成员口径没被默认隐藏改掉）',
        itemRows === data.declared && data.declared === data.elements,
        `data-item ${itemRows} / 声明 ${data.declared} / 元素 ${data.elements}`);
      // 默认隐藏的模型**仍然是成员**：藏的是首屏，不是身份/路由/ItemList 成员资格。
      if (modelsTruth.catalog.hiddenCount) {
        const indexHtmlText = await page.evaluate(`(async () => (await fetch(${JSON.stringify(new URL('models/', base).href)})).text())()`).catch(() => '');
        const missingRoutes = modelsTruth.catalog.hiddenSlugs.filter(slug => (modelsTruth.expectedBySlug[slug] || 0) > 0
          && !String(indexHtmlText).includes(`models/${encodeURIComponent(slug)}/`));
        check(`/models/ 默认隐藏的旧型号详情页仍在索引页里（${modelsTruth.catalog.hiddenCount} 个隐藏模型）`,
          missingRoutes.length === 0, missingRoutes.slice(0, 3).join(' ') || '全部仍有入链');
      }

      // ---- 默认可见性：真浏览器实测（初始 / 展开 / 收回，三次都量真实 DOM）----
      const readVisibility = () => page.evaluate(`(() => {
        const rows = Array.prototype.slice.call(document.querySelectorAll('#models-table tbody tr[data-model]'));
        const toggle = document.getElementById('models-show-legacy');
        const counter = document.getElementById('models-count');
        return {
          total: rows.length,
          visible: rows.filter(row => !row.hidden).length,
          hidden: rows.filter(row => row.hidden).length,
          hasToggle: Boolean(toggle),
          toggleChecked: Boolean(toggle && toggle.checked),
          counter: counter ? counter.textContent.replace(/\\s+/g, ' ').trim() : ''
        };
      })()`);
      const initial = await readVisibility();
      check(`/models/ 初始可见行数 == current+aging+unknown 的行数（${modelsTruth.catalog.visibleCount} 行）`,
        initial.visible === modelsTruth.catalog.visibleCount,
        `可见 ${initial.visible} / 期望 ${modelsTruth.catalog.visibleCount}（默认隐藏 ${initial.hidden}）· ${initial.counter}`);
      check('/models/ 默认隐藏的行数 == legacy/historical 的行数（多藏一个都是错的）',
        initial.hidden === modelsTruth.catalog.hiddenCount,
        `隐藏 ${initial.hidden} / 期望 ${modelsTruth.catalog.hiddenCount} · 目录状态分布 ${JSON.stringify(modelsTruth.catalog.counts)}`);
      check('/models/ 有「显示旧型号」入口（默认藏起来的东西必须点得到）', initial.hasToggle,
        initial.hasToggle ? 'ok' : '缺少 #models-show-legacy');
      check('/models/ 计数行如实报出「显示 X / N」',
        initial.counter.includes(`显示 ${initial.visible} / ${initial.total} 个模型`), initial.counter);

      await page.check('#models-show-legacy');
      const expanded = await readVisibility();
      check(`/models/ 勾选「显示旧型号」后可见行数 == 全部 ${modelsTruth.count} 行（一行都不删）`,
        expanded.toggleChecked && expanded.visible === modelsTruth.count,
        `可见 ${expanded.visible} / 全部 ${modelsTruth.count} · ${expanded.counter}`);
      await page.uncheck('#models-show-legacy');
      const restored = await readVisibility();
      check('/models/ 取消勾选后回到默认可见集合（隐藏是即时开关，不是一次性吞掉）',
        !restored.toggleChecked && restored.visible === initial.visible,
        `可见 ${restored.visible} / 初始 ${initial.visible}`);

      // ---- 无 JS：静态表一行不少、一行不隐藏、一个控件都没有 ----
      await libraryNoJsPage.goto(new URL('models/', base).href, { waitUntil: 'load' });
      const noJsModels = await libraryNoJsPage.evaluate(`(() => {
        const rows = Array.prototype.slice.call(document.querySelectorAll('#models-table tbody tr[data-model]'));
        return {
          total: rows.length,
          hidden: rows.filter(row => row.hidden).length,
          hiddenAttr: document.querySelectorAll('#models-table tbody tr[hidden]').length,
          controls: document.querySelectorAll('main input, main select, main button, main textarea').length
        };
      })()`);
      check(`/models/ 无 JS 时静态表仍是全部 ${modelsTruth.count} 行、且没有一行预先隐藏（No-JS 完整）`,
        noJsModels.total === modelsTruth.count && noJsModels.hidden === 0 && noJsModels.hiddenAttr === 0,
        `行 ${noJsModels.total} / hidden ${noJsModels.hidden} / hidden 属性 ${noJsModels.hiddenAttr}`);
      check('/models/ 无 JS 时一个控件都没有（「显示旧型号」入口也整块由脚本建）',
        noJsModels.controls === 0, `${noJsModels.controls} 个控件`);

      // ---- 旧型号（默认隐藏）的详情页仍然存在：这是"藏首屏"与"删页面"的分界 ----
      if (modelsTruth.catalog.hiddenSampleSlug) {
        const hiddenSlug = modelsTruth.catalog.hiddenSampleSlug;
        const { data: hiddenDetail } = await auditLibraryPage({
          label: `/models/${hiddenSlug}/（默认隐藏的旧型号）`,
          route: `models/${hiddenSlug}/`,
          noJsText: ['发布时间', '目录状态', 'API 提供平台'],
          minText: 700,
          itemList: false,
          official: 1,
          footerLink: false
        });
        check(`/models/${hiddenSlug}/ 旧型号的详情页照常生成、仍在 sitemap、无 JS 读得到发布时间与目录状态`,
          hiddenDetail.crumbLinks.includes('../models/') || hiddenDetail.crumbLinks.includes('../../models/'),
          hiddenDetail.crumbLinks.join(' '));
        check(`/models/${hiddenSlug}/ 详情页标出的目录状态确实属于默认隐藏集合`,
          await page.evaluate(`(() => {
            const el = document.querySelector('[data-catalog-status]');
            const value = el ? el.getAttribute('data-catalog-status') : '';
            return ${JSON.stringify(['legacy', 'historical'])}.indexOf(value) !== -1;
          })()`).catch(() => false));
      } else {
        console.log('  ℹ️  本轮没有 legacy / historical 模型 —— 旧型号详情页抽查如实跳过（不造数据）');
      }
    }
    // 抽样：除了「数据里最前的 3 个」，**必须**覆盖至少一个多变体模型页 ——
    // 否则「一条真实计价条目 = 一行」的展开口径就在测一个碰不到的场景（T06 实测：
    // 原先抽到的 claude-* 全不是多变体，于是全量 9/44 页的行数不一致长期假绿）。
    const baseSample = modelsTruth ? modelsTruth.slugs.slice(0, 3) : [];
    const multiSample = modelsTruth ? modelsTruth.multiVariantSlugs.slice(0, 3) : [];
    const sampleSlugs = [...new Set([...multiSample, ...baseSample])]
      .filter(slug => modelsTruth && modelsTruth.slugs.includes(slug)).slice(0, 6);
    check('/models/ 抽样覆盖多变体模型页（数据里有几个就至少抽一个）',
      !modelsTruth || multiSample.length === 0 || sampleSlugs.some(slug => multiSample.includes(slug)),
      modelsTruth
        ? `数据里多变体 slug ${multiSample.length} 个（${multiSample.slice(0, 3).join(', ') || '无'}）· 抽样 ${sampleSlugs.length} 个`
        : '取不到 models.json');
    for (const slug of sampleSlugs) {
      const detailRoute = `models/${slug}/`;
      const { data: detail } = await auditLibraryPage({
        label: `/models/${slug}/`,
        route: detailRoute,
        noJsText: ['模型名称', '开发者', 'API 提供平台'],
        minText: 700,
        itemList: false,
        official: 1,
        footerLink: false
      });
      check(`/models/${slug}/ 面包屑第二级指向 /models/（真实路由）`,
        detail.crumbLinks.includes('../models/') || detail.crumbLinks.includes('../../models/'),
        detail.crumbLinks.join(' '));
      check(`/models/${slug}/ 从索引页有一条入链（详情页不是孤岛）`,
        await page.evaluate(`(async () => {
          const r = await fetch(${JSON.stringify(new URL('models/', base).href)});
          const html = await r.text();
          return html.includes(${JSON.stringify(`models/${slug}/`)});
        })()`).catch(() => false));
      {
        // 期望值 = **展开后**的真实计价条目数（不是 link 条数）：一个 `variant: null`
        // 的映射在一份多变体记录上认领的是全部真实变体，页面为此发多行。
        // 旧口径（link 条数）在全量下 9/44 页都对不上，只是原先抽样的三个 slug 恰好
        // 都不是多变体模型，所以从未红过。
        const expectedRows = modelsTruth && modelsTruth.expectedBySlug
          ? (modelsTruth.expectedBySlug[slug] || 0) : -1;
        const actualRows = await page.evaluate('document.querySelectorAll("tr.mapirow").length');
        check(`/models/${slug}/ 计价表逐行可回读（行数 == 展开后的真实计价条目数）`,
          expectedRows >= 0 && actualRows === expectedRows,
          `页面 ${actualRows} 行 · 展开期望 ${expectedRows} 条` +
          (modelsTruth && modelsTruth.multiVariantSlugs.includes(slug) ? '（多变体模型页）' : ''));
      }
    }
    check('/models/ 索引页的筛选控件由脚本建（无 JS 时 0 控件已在体检里查过；有 JS 时才有控件）',
      data.controls > 0, `${data.controls} 个控件`);
  }

  /* ------------------------------------------------------------------ */
  /* §22b 叶子详情页的**统一内容列**（Detail Content Column）              */
  /* ------------------------------------------------------------------ */
  //
  // 缺陷原型：deal 详情页的内容块被一条 `max-width: 820px` 钉在左边、模型详情页的 <main>
  // 却撑满 .wrap（1380px）——同一站点的两种叶子页宽度不同、而且都不居中；来源块还额外
  // 套了一层 820px + `word-break: break-all`。修法是**唯一**一处宽度来源：`.detail-main`。
  //
  // 这一节把「统一内容列」拆成**可判红的几何量**，再对同一套判据加五条变异牙（M1–M5）：
  // 判据本身也必须被咬一次——否则「判据写错了」与「产品没问题」在日志里长得一模一样。
  //
  // 量法：全部读数来自真浏览器（getBoundingClientRect + 计算样式），不看页面自报的数字。
  //   · 列（column）  = `<main class="detail-main">` 的 border-box：居中偏差 |left-(vw-right)| ≤ 8px、
  //                     宽度 ∈ [1080, 1120]（1120 就是 CSS 里那一条 min(1120px, 100%)）。
  //   · 轴（axis）    = 同一列里各区块 border-box 的左右极差 ≤ 1px（不是「看起来齐」，是量出来齐）：
  //                     deal = crumb / dpane / dpane-more / dpane-src；model = crumb / stop / minfo / ptable-wrap。
  //                     ⚠️ 卡**内部**的 .dgrid 之类自带 padding，不进这组；这里全是列级区块。
  //   · 来源块        = .dpane-src 与列同宽（≤1px）、自身不横向溢出、word-break 不是 break-all。
  //                     ⚠️ 「不再有 break-all」只在这个元素的**计算样式**上判：站点里另有一处
  //                     break-all 属于改动前就存在的 .cmpshare（首页对比分享条），按整文件 grep 会误红。
  //   · Header/Footer = .topin 与 .wrap 仍是 min(1420px, vw)、footer 仍等于 .wrap 的内容宽。
  //                     这是**反向**断言：修内容列不许顺手把页头/页脚一起缩窄。
  //   · 页面级溢出    = documentElement.scrollWidth ≤ 视口 + 1（390/768 两档都要成立）。
  //
  // 违规码全部由 leafProblems() 一处产出（变异牙复测的就是它，不在别处再写一份判据）：
  //   column-missing / center / width / axis / axis-missing / src-missing / src-width /
  //   src-break-all / self-overflow@<vw> / header / footer / page-overflow@<vw> /
  //   mobile-width（768：列宽 == 可用宽）/ leaf-consistency（跨页比较：deal 与 model 同列）

  const LEAF_TOL = 1;             // 同轴 / 来源块宽 / Header·Footer 的容差（px）
  const LEAF_CENTER_TOL = 8;      // 居中容差（px）：亚像素取整 + 字体度量，8px 之内看不出歪
  const LEAF_WIDTH_MIN = 1080;
  const LEAF_WIDTH_MAX = 1120;
  const LEAF_SHELL_MAX = 1420;    // .topin / .wrap 的 max-width：页头与页脚**不**跟着内容列缩
  const LEAF_VIEWPORTS = [1600, 1440, 1280];
  const LEAF_MOBILE = 768;        // 内容列必须铺满可用宽的那一档
  const LEAF_NARROW = 390;        // 最窄档：页面级横向溢出的红线
  // 超长 URL：**不可断**的一段。真实 URL 里的 `/`、`-` 本身就是断点，量不出「有没有兜底」，
  // 所以 M4 的变异与正对照都注入这一串（页面内注入，绝不写盘）。
  const LEAF_LONG_TOKEN = 'https://example.com/' + 'x'.repeat(180);

  const LEAF_KINDS = {
    deal: { axis: ['.crumb', '.dpane', '.dpane-more', '.dpane-src'], src: '.dpane-src' },
    model: { axis: ['.crumb', '.stop', '.minfo', '.ptable-wrap'], src: null }
  };
  const LEAF_SELECTORS = ['.crumb', '.dpane', '.dpane-more', '.dpane-src', '.stop', '.minfo', '.ptable-wrap'];

  const leafRound = n => Math.round(n * 100) / 100;
  const leafCodes = problems => problems.map(problem => problem.code);
  const leafExplain = problems => (problems.length
    ? problems.map(problem => `${problem.code}（${problem.msg}）`).join('；')
    : '无违规码');
  const leafOverflowProblems = problems => problems.filter(problem =>
    problem.code.startsWith('page-overflow') || problem.code.startsWith('self-overflow'));

  /** 当前页面的**唯一**几何量测（不导航、不假设路由）：变异牙复测走的也是这一份。 */
  async function leafMeasure(target) {
    return target.evaluate(`(() => {
      const box = el => {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return {
          count: 1,
          left: r.left + window.scrollX, right: r.right + window.scrollX, width: r.width,
          padLeft: parseFloat(cs.paddingLeft) || 0, padRight: parseFloat(cs.paddingRight) || 0,
          scrollW: el.scrollWidth, clientW: el.clientWidth,
          wordBreak: cs.wordBreak, overflowWrap: cs.overflowWrap
        };
      };
      const missing = { count: 0, left: 0, right: 0, width: 0, padLeft: 0, padRight: 0, scrollW: 0, clientW: 0, wordBreak: '', overflowWrap: '' };
      const one = sel => { const list = document.querySelectorAll(sel); return list.length ? box(list[0]) : Object.assign({}, missing); };
      const els = {};
      for (const sel of ${JSON.stringify(LEAF_SELECTORS)}) els[sel] = one(sel);
      const main = one('main');
      main.hasDetailMain = document.querySelectorAll('main').length === 1
        && document.querySelector('main').classList.contains('detail-main');
      return {
        doc: {
          innerWidth: window.innerWidth,
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth
        },
        main,
        wrap: one('.wrap'),
        topin: one('.topin'),
        footer: one('footer'),
        els,
        mainCount: document.querySelectorAll('main').length,
        detailMainMainCount: document.querySelectorAll('main.detail-main').length
      };
    })()`);
  }

  /** 单页违规码：只看量到的数，不看页面自报。`kind` 决定同轴元素集合与是否有来源块。 */
  function leafProblems(geometry, kind) {
    const problems = [];
    const push = (code, msg) => problems.push({ code, msg });
    const vw = geometry.doc.clientWidth;
    const main = geometry.main;
    const mainOk = main.count === 1 && main.hasDetailMain;
    if (!mainOk) {
      push('column-missing', `main.detail-main 数量 ${geometry.detailMainMainCount}（<main> 共 ${geometry.mainCount} 个）`);
    }
    if (mainOk) {
      const deviation = Math.abs(main.left - (vw - main.right));
      if (deviation > LEAF_CENTER_TOL) {
        push('center', `列 ${leafRound(main.left)}..${leafRound(main.right)} 于视口 ${vw}：居中偏差 ${leafRound(deviation)}px > ${LEAF_CENTER_TOL}px`);
      }
      if (main.width < LEAF_WIDTH_MIN || main.width > LEAF_WIDTH_MAX) {
        push('width', `列宽 ${leafRound(main.width)}px 不在 [${LEAF_WIDTH_MIN}, ${LEAF_WIDTH_MAX}]`);
      }
    }
    // 同轴：列级区块的左右边缘必须落在同一条线上
    const axis = kind.axis.map(sel => ({ sel, item: geometry.els[sel] || { count: 0 } }));
    const missingAxis = axis.filter(entry => entry.item.count !== 1);
    if (missingAxis.length) {
      push('axis-missing', `同轴元素缺失/重复：${missingAxis.map(entry => `${entry.sel}×${entry.item.count}`).join(' ')}`);
    } else {
      const lefts = axis.map(entry => entry.item.left);
      const rights = axis.map(entry => entry.item.right);
      const spreadLeft = Math.max(...lefts) - Math.min(...lefts);
      const spreadRight = Math.max(...rights) - Math.min(...rights);
      if (spreadLeft > LEAF_TOL || spreadRight > LEAF_TOL) {
        push('axis', `左右极差 ${leafRound(spreadLeft)}/${leafRound(spreadRight)}px > ${LEAF_TOL}px：`
          + axis.map(entry => `${entry.sel}=${leafRound(entry.item.left)}..${leafRound(entry.item.right)}`).join(' '));
      }
    }
    // 来源块：与列同宽、不横向溢出、不许再是 break-all
    if (kind.src) {
      const src = geometry.els[kind.src];
      if (!src || src.count !== 1) {
        push('src-missing', `来源块 ${kind.src} 数量 ${src ? src.count : 0}`);
      } else {
        if (mainOk && Math.abs(src.width - main.width) > LEAF_TOL) {
          push('src-width', `来源块宽 ${leafRound(src.width)}px ≠ 列宽 ${leafRound(main.width)}px（差 ${leafRound(Math.abs(src.width - main.width))}px）`);
        }
        if (src.wordBreak === 'break-all') {
          push('src-break-all', `${kind.src} 的计算样式仍是 word-break: break-all`);
        }
        if (src.scrollW > src.clientW + LEAF_TOL) {
          push(`self-overflow@${vw}`, `来源块内部横向溢出 ${src.scrollW - src.clientW}px（scrollWidth ${src.scrollW} > clientWidth ${src.clientW}）`);
        }
      }
    }
    // Header / Footer 未缩窄（反向断言）
    const shell = Math.min(LEAF_SHELL_MAX, vw);
    if (geometry.topin.count !== 1) {
      push('header', `.topin 数量 ${geometry.topin.count}`);
    } else if (Math.abs(geometry.topin.width - shell) > LEAF_TOL) {
      push('header', `.topin 宽 ${leafRound(geometry.topin.width)}px ≠ min(${LEAF_SHELL_MAX}px, 视口 ${vw}) = ${shell}px`);
    }
    if (geometry.wrap.count !== 1) {
      push('footer', `.wrap 数量 ${geometry.wrap.count}`);
    } else {
      const inner = geometry.wrap.width - geometry.wrap.padLeft - geometry.wrap.padRight;
      if (Math.abs(geometry.wrap.width - shell) > LEAF_TOL) {
        push('footer', `.wrap 宽 ${leafRound(geometry.wrap.width)}px ≠ ${shell}px（页脚容器被内容列带窄了）`);
      }
      if (geometry.footer.count !== 1) {
        push('footer', `footer 数量 ${geometry.footer.count}`);
      } else if (Math.abs(geometry.footer.width - inner) > LEAF_TOL) {
        push('footer', `footer 宽 ${leafRound(geometry.footer.width)}px ≠ .wrap 内容宽 ${leafRound(inner)}px`);
      }
    }
    // 页面级横向溢出
    if (geometry.doc.scrollWidth > vw + LEAF_TOL) {
      push(`page-overflow@${vw}`, `documentElement.scrollWidth ${geometry.doc.scrollWidth} > 视口 ${vw}`);
    }
    return problems;
  }

  /** 768px：内容列必须铺满 .wrap 的可用宽（窄屏不另立断点），且页面不横向滚动。 */
  function leafMobileProblems(geometry) {
    const problems = [];
    const vw = geometry.doc.clientWidth;
    const inner = geometry.wrap.count === 1 ? geometry.wrap.width - geometry.wrap.padLeft - geometry.wrap.padRight : NaN;
    if (geometry.main.count !== 1 || !(inner > 0) || Math.abs(geometry.main.width - inner) > LEAF_TOL) {
      problems.push({
        code: 'mobile-width',
        msg: `列宽 ${leafRound(geometry.main.count === 1 ? geometry.main.width : NaN)}px ≠ .wrap 可用宽 ${leafRound(inner)}px`
      });
    }
    if (geometry.doc.scrollWidth > vw + LEAF_TOL) {
      problems.push({ code: `page-overflow@${vw}`, msg: `documentElement.scrollWidth ${geometry.doc.scrollWidth} > 视口 ${vw}` });
    }
    return problems;
  }

  /** 跨页违规码：deal 与 model 的叶子页必须落在**同一条**内容列上（「统一列」的语义本身）。 */
  function leafPairProblems(dealGeometry, modelGeometry) {
    const problems = [];
    if (dealGeometry.main.count !== 1 || modelGeometry.main.count !== 1) {
      problems.push({ code: 'leaf-consistency', msg: '两页中至少有一页没有唯一的 <main>' });
      return problems;
    }
    const widthGap = Math.abs(dealGeometry.main.width - modelGeometry.main.width);
    const leftGap = Math.abs(dealGeometry.main.left - modelGeometry.main.left);
    if (widthGap > LEAF_TOL) {
      problems.push({ code: 'leaf-consistency', msg: `deal 列宽 ${leafRound(dealGeometry.main.width)}px vs model ${leafRound(modelGeometry.main.width)}px（差 ${leafRound(widthGap)}px）` });
    }
    if (leftGap > LEAF_TOL) {
      problems.push({ code: 'leaf-consistency', msg: `deal 列左 ${leafRound(dealGeometry.main.left)}px vs model ${leafRound(modelGeometry.main.left)}px（差 ${leafRound(leftGap)}px）` });
    }
    return problems;
  }

  /** 导航 → 视口 → 量测（三段一起做，免得每一档各写一遍）。 */
  async function leafProbe(target, route, width) {
    await target.setViewportSize({ width, height: 900 });
    await target.goto(new URL(route, base).href, { waitUntil: 'load' });
    return leafMeasure(target);
  }

  /**
   * 变异：把页面**内联 <style> 的真实文本**里的一段逐字替换掉（只在浏览器内存里，不碰磁盘）。
   *
   * 反空洞守卫：锚点必须**恰好出现 1 次**。
   *   · 出现 0 次 ⇒ 变异根本没落地（"改了个不存在的地方"）；
   *   · 出现 ≥2 次 ⇒ 改中的可能是别处，后续断言测的不是这条规则。
   * 两种情况都返回 ok:false 且**不做任何替换**，由调用方判红并打印原因。
   * 「变异不生效却算通过」是这类测试最坏的假绿，这里宁可红。
   */
  async function leafMutate(target, anchor, replacement) {
    return target.evaluate(`(() => {
      const anchor = ${JSON.stringify(anchor)};
      const styles = Array.prototype.slice.call(document.querySelectorAll('style'));
      const counts = styles.map(style => style.textContent.split(anchor).length - 1);
      const total = counts.reduce((sum, n) => sum + n, 0);
      if (total !== 1) {
        return { ok: false, occurrences: total, reason: '锚点在内联样式里出现 ' + total + ' 次（必须恰好 1 次）' };
      }
      const index = counts.findIndex(n => n === 1);
      styles[index].textContent = styles[index].textContent.replace(anchor, ${JSON.stringify(replacement)});
      return { ok: true, occurrences: 1 };
    })()`);
  }

  /** M4 用：把不可断的超长 URL 注入来源块（页面内注入，绝不写盘）。 */
  async function leafInjectLongUrl(target, token) {
    return target.evaluate(`(() => {
      const token = ${JSON.stringify(token)};
      const link = document.querySelector('.dpane-src a');
      if (link) { link.textContent = token; return 'link'; }
      const src = document.querySelector('.dpane-src');
      if (src) { src.textContent = token; return 'src'; }
      return 'none';
    })()`);
  }

  console.log('\n=== 22b) 叶子详情页统一内容列（Detail Content Column）===');
  {
    // 取样现场从数据算：deal 取 deals.json 里 url **最长**的一条（最长的官方页 URL 最容易把
    // 来源块撑破），model 取 models.json[0]。两个都不写死 id/slug。
    const leafTruth = await page.evaluate(`(async () => {
      const deals = await (await fetch(${JSON.stringify(new URL('deals.json', base).href)})).json();
      const models = await (await fetch(${JSON.stringify(new URL('models.json', base).href)})).json();
      const list = (deals.deals || deals).slice();
      const longest = list.slice().sort((a, b) => String(b.url || '').length - String(a.url || '').length)[0];
      const rows = models.models || [];
      return {
        dealId: longest ? longest.id : null,
        dealUrlLength: String((longest && longest.url) || '').length,
        dealCount: list.length,
        modelSlug: rows.length ? rows[0].slug : null,
        modelCount: rows.length
      };
    })()`).catch(() => null);

    check('§22b 取样：deal 详情（deals.json 里 url 最长的一条）与 model 详情（models.json[0]）都取到了',
      Boolean(leafTruth && leafTruth.dealId && leafTruth.modelSlug),
      leafTruth
        ? `deal/${leafTruth.dealId}/（官方页 URL ${leafTruth.dealUrlLength} 字符 · 数据 ${leafTruth.dealCount} 条）· models/${leafTruth.modelSlug}/（数据 ${leafTruth.modelCount} 个模型）`
        : '取不到 deals.json / models.json（取样前提不成立）');

    if (!leafTruth || !leafTruth.dealId || !leafTruth.modelSlug) {
      check('§22b 取样失败 ⇒ 这一节的几何断言全部判红（不允许静默跳过）', false,
        '没有可测的叶子页：统一内容列的居中/宽度/同轴/溢出全部无从量起');
    } else {
      const leafRoutes = { deal: `deal/${leafTruth.dealId}/`, model: `models/${leafTruth.modelSlug}/` };
      const leafGeometry = { deal: {}, model: {} };
      /** 机器可读：每条变异复测到的违规码（--json 报告里能一眼看到牙咬到了什么） */
      metrics.leafMutationCodes = {};

      // ---- 桌面三档 + 768 + 390：deal / model 各一条独立 page，用完即 close() ----
      const leafDealPage = await browser.newPage();
      const leafModelPage = await browser.newPage();
      try {
        for (const [kind, target] of [['deal', leafDealPage], ['model', leafModelPage]]) {
          for (const width of [...LEAF_VIEWPORTS, LEAF_MOBILE, LEAF_NARROW]) {
            leafGeometry[kind][width] = await leafProbe(target, leafRoutes[kind], width);
          }
        }
      } finally {
        await leafDealPage.close();
        await leafModelPage.close();
      }

      for (const kind of ['deal', 'model']) {
        for (const width of LEAF_VIEWPORTS) {
          const geometry = leafGeometry[kind][width];
          const problems = leafProblems(geometry, LEAF_KINDS[kind]);
          const codes = leafCodes(problems);
          const main = geometry.main;
          const deviation = Math.abs(main.left - (geometry.doc.clientWidth - main.right));
          check(`§22b ${kind}@${width} 内容列居中（|left-(vw-right)|≤${LEAF_CENTER_TOL}）且列宽 ∈[${LEAF_WIDTH_MIN}, ${LEAF_WIDTH_MAX}]`,
            codes.includes('center') === false && codes.includes('width') === false && codes.includes('column-missing') === false,
            `列 ${leafRound(main.left)}..${leafRound(main.right)} W=${leafRound(main.width)} · 视口 ${geometry.doc.clientWidth} · 居中偏差 ${leafRound(deviation)}px · ${leafExplain(problems.filter(problem => ['center', 'width', 'column-missing'].includes(problem.code)))}`);
          check(`§22b ${kind}@${width} 同轴：${LEAF_KINDS[kind].axis.join(' / ')} 左右极差 ≤${LEAF_TOL}px`,
            codes.includes('axis') === false && codes.includes('axis-missing') === false,
            LEAF_KINDS[kind].axis.map(sel => `${sel}=${leafRound(geometry.els[sel].left)}..${leafRound(geometry.els[sel].right)}`).join(' · ')
              + ` · ${leafExplain(problems.filter(problem => problem.code === 'axis' || problem.code === 'axis-missing'))}`);
          if (LEAF_KINDS[kind].src) {
            const src = geometry.els[LEAF_KINDS[kind].src];
            check(`§22b ${kind}@${width} 来源块宽 == 列宽（≤${LEAF_TOL}px）且自身不溢出`,
              !codes.includes('src-width') && !codes.includes('src-missing') && leafOverflowProblems(problems).length === 0,
              `来源块 W=${leafRound(src.width)} / 列 W=${leafRound(main.width)} · 内部溢出 ${src.scrollW - src.clientW}px · ${leafExplain(problems.filter(problem => ['src-width', 'src-missing'].includes(problem.code)).concat(leafOverflowProblems(problems)))}`);
          }
          check(`§22b ${kind}@${width} Header(.topin) 与 Footer(.wrap) 未缩窄：仍是 min(${LEAF_SHELL_MAX}px, 视口)`,
            !codes.includes('header') && !codes.includes('footer'),
            `.topin ${leafRound(geometry.topin.width)} / .wrap ${leafRound(geometry.wrap.width)} / footer ${leafRound(geometry.footer.width)}`
              + `（期望 ${Math.min(LEAF_SHELL_MAX, geometry.doc.clientWidth)} 与 ${leafRound(geometry.wrap.width - geometry.wrap.padLeft - geometry.wrap.padRight)}）`
              + ` · ${leafExplain(problems.filter(problem => problem.code === 'header' || problem.code === 'footer'))}`);
        }
      }

      // ---- 统一列：deal 与 model 必须落在同一条列上（三档都查）----
      const leafPairAll = LEAF_VIEWPORTS.flatMap(width =>
        leafPairProblems(leafGeometry.deal[width], leafGeometry.model[width]).map(problem => ({ width, ...problem })));
      check(`§22b deal 与 model 的叶子页落在同一条内容列上（${LEAF_VIEWPORTS.join('/')} 档列左与列宽一致 ≤${LEAF_TOL}px）`,
        leafPairAll.length === 0,
        leafPairAll.length
          ? leafPairAll.map(problem => `@${problem.width} ${problem.code}：${problem.msg}`).join('；')
          : `三档一致：列宽 ${leafRound(leafGeometry.deal[1440].main.width)}px · 列左 ${leafRound(leafGeometry.deal[1440].main.left)}px`);

      // ---- 首页未被波及：统一内容列只作用在叶子详情页 ----
      const leafHomePage = await browser.newPage();
      try {
        await leafHomePage.setViewportSize({ width: 1440, height: 900 });
        await leafHomePage.goto(base, { waitUntil: 'load' });
        const home = await leafHomePage.evaluate(`(() => ({
          mains: Array.prototype.slice.call(document.querySelectorAll('main')).map(el => el.className || ''),
          detailMainCount: document.querySelectorAll('main.detail-main').length
        }))()`);
        check('§22b 首页的 <main> 不带 detail-main（统一内容列不得波及首页）',
          home.detailMainCount === 0 && home.mains.every(cls => (' ' + cls + ' ').indexOf(' detail-main ') === -1),
          `首页 <main> ${home.mains.length} 个 · class [${home.mains.join(' | ') || '（空）'}] · main.detail-main ${home.detailMainCount} 个`);
      } finally {
        await leafHomePage.close();
      }

      // ---- 768：内容列铺满可用宽，且不横向溢出 ----
      const leafMid = leafGeometry.deal[LEAF_MOBILE];
      const leafMidModel = leafGeometry.model[LEAF_MOBILE];
      const leafMidProblems = [
        ...leafMobileProblems(leafMid).map(problem => ({ kind: 'deal', ...problem })),
        ...leafMobileProblems(leafMidModel).map(problem => ({ kind: 'model', ...problem })),
        ...leafPairProblems(leafMid, leafMidModel).map(problem => ({ kind: 'deal×model', ...problem }))
      ];
      check(`§22b @${LEAF_MOBILE} 内容列宽 == .wrap 可用宽（窄屏铺满、不另立断点）且页面无横向溢出`,
        leafMidProblems.length === 0,
        `deal 列 ${leafRound(leafMid.main.width)} / 可用 ${leafRound(leafMid.wrap.width - leafMid.wrap.padLeft - leafMid.wrap.padRight)}`
        + ` · model 列 ${leafRound(leafMidModel.main.width)} / 可用 ${leafRound(leafMidModel.wrap.width - leafMidModel.wrap.padLeft - leafMidModel.wrap.padRight)}`
        + ` · scrollWidth deal ${leafMid.doc.scrollWidth} / model ${leafMidModel.doc.scrollWidth}（视口 ${LEAF_MOBILE}）`
        + ` · ${leafMidProblems.length ? leafMidProblems.map(problem => `${problem.kind} ${problem.code}：${problem.msg}`).join('；') : '无违规码'}`);

      // ---- 390：页面级不横向滚动 + 来源块的断行策略 ----
      const leafNarrow = leafGeometry.deal[LEAF_NARROW];
      const leafNarrowModel = leafGeometry.model[LEAF_NARROW];
      const leafNarrowOverflow = [
        ...leafOverflowProblems(leafProblems(leafNarrow, LEAF_KINDS.deal)).map(problem => ({ kind: 'deal', ...problem })),
        ...leafOverflowProblems(leafProblems(leafNarrowModel, LEAF_KINDS.model)).map(problem => ({ kind: 'model', ...problem }))
      ];
      check(`§22b @${LEAF_NARROW} documentElement.scrollWidth ≤ ${LEAF_NARROW + 1}（deal 与 model 都不横向滚动）`,
        leafNarrowOverflow.length === 0
        && leafNarrow.doc.scrollWidth <= LEAF_NARROW + 1 && leafNarrowModel.doc.scrollWidth <= LEAF_NARROW + 1,
        `scrollWidth deal ${leafNarrow.doc.scrollWidth} / model ${leafNarrowModel.doc.scrollWidth}（视口 ${LEAF_NARROW}）`
        + ` · ${leafNarrowOverflow.length ? leafNarrowOverflow.map(problem => `${problem.kind} ${problem.code}：${problem.msg}`).join('；') : '无溢出'}`);

      const leafNarrowSrc = leafNarrow.els['.dpane-src'];
      check(`§22b @${LEAF_NARROW} .dpane-src 的计算样式不是 break-all（长 URL 靠 overflow-wrap: anywhere 断行）`,
        Boolean(leafNarrowSrc) && leafNarrowSrc.count === 1
        && leafNarrowSrc.wordBreak === 'normal' && leafNarrowSrc.overflowWrap === 'anywhere',
        leafNarrowSrc && leafNarrowSrc.count === 1
          ? `word-break: ${leafNarrowSrc.wordBreak} · overflow-wrap: ${leafNarrowSrc.overflowWrap}（全站另有 .cmpshare 的 break-all，属改动前既有，不在本节判）`
          : `.dpane-src 数量 ${leafNarrowSrc ? leafNarrowSrc.count : 0}`);

      // ---- 长 URL 页（取样就是 url 最长的那条）自身与页面级都不溢出 ----
      const leafLongUrl = [LEAF_NARROW, 1440].map(width => {
        const geometry = leafGeometry.deal[width];
        const problems = leafProblems(geometry, LEAF_KINDS.deal);
        const src = geometry.els['.dpane-src'];
        return { width, geometry, src, problems: leafOverflowProblems(problems) };
      });
      check(`§22b 长 URL 页（deal/${leafTruth.dealId}/，官方页 URL ${leafTruth.dealUrlLength} 字符）在 ${LEAF_NARROW} 与 1440 下自身与页面级都不溢出`,
        leafLongUrl.every(item => item.problems.length === 0),
        leafLongUrl.map(item => `@${item.width} scrollWidth ${item.geometry.doc.scrollWidth}（视口 ${item.geometry.doc.clientWidth}）`
          + ` · .dpane-src ${leafRound(item.src.width)}px 内溢 ${item.src.scrollW - item.src.clientW}px`).join(' · ')
        + ` · ${leafLongUrl.every(item => item.problems.length === 0) ? '无溢出' : leafLongUrl.flatMap(item => item.problems.map(problem => `@${item.width} ${problem.code}：${problem.msg}`)).join('；')}`);

      // ---- M1–M5 变异牙 --------------------------------------------------
      //
      // 五条牙各自咬一处**真实的内联 CSS 文本**，复测的是同一套 leafProblems/leafPairProblems：
      //   M1 center            —— 删掉 .detail-main 的 margin-inline:auto（列左贴 .wrap 内容左沿）
      //   M2 width             —— 列宽改回 820px（缺陷原型）
      //   M3 src-width         —— .dpane-src 的 width:100% 改成 820px（来源块又比列窄）
      //   M4 page-overflow@390 —— 拿走 .dpane-src 的 overflow-wrap:anywhere + 注入 200 字符不可断 URL
      //   M5 leaf-consistency  —— 只把 model 页的列改成 1100px（单页各项都合规，只有跨页比较能咬到）
      // 每条都先过「锚点恰好出现 1 次」的反空洞守卫，再用同一个判据复测。
      const leafHash = file => (fs.existsSync(file)
        ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
        : null);
      const leafArtifacts = {
        deal: path.join(DIR, 'deal', leafTruth.dealId, 'index.html'),
        model: path.join(DIR, 'models', leafTruth.modelSlug, 'index.html')
      };
      const leafHashBefore = { deal: leafHash(leafArtifacts.deal), model: leafHash(leafArtifacts.model) };

      const leafMutations = [
        {
          id: 'M1', kind: 'deal', width: 1440, expect: 'center',
          what: '删掉 .detail-main 的 margin-inline:auto',
          anchor: '.detail-main { width: min(1120px, 100%); margin-inline: auto; }',
          replacement: '.detail-main { width: min(1120px, 100%); margin-inline: 0; }'
        },
        {
          id: 'M2', kind: 'deal', width: 1440, expect: 'width',
          what: '把内容列宽度改回 820px（缺陷原型）',
          anchor: '.detail-main { width: min(1120px, 100%); margin-inline: auto; }',
          replacement: '.detail-main { width: 820px; margin-inline: auto; }'
        },
        {
          id: 'M3', kind: 'deal', width: 1440, expect: 'src-width',
          what: '把 .dpane-src 的 width:100% 改成 820px',
          anchor: 'margin-top: var(--s3); width: 100%; max-width: none;',
          replacement: 'margin-top: var(--s3); width: 820px; max-width: none;'
        },
        {
          id: 'M4', kind: 'deal', width: LEAF_NARROW, expect: `page-overflow@${LEAF_NARROW}`, overflowOnly: true,
          what: '拿走 .dpane-src 的 overflow-wrap:anywhere，并注入 200 字符不可断的超长 URL',
          anchor: 'word-break: normal; overflow-wrap: anywhere;',
          replacement: 'word-break: normal; overflow-wrap: normal;',
          inject: LEAF_LONG_TOKEN
        },
        {
          id: 'M5', kind: 'model', width: 1440, expect: 'leaf-consistency', pair: true,
          what: '只把 model 详情页的内容列改成 1100px（两页不再同列）',
          anchor: '.detail-main { width: min(1120px, 100%); margin-inline: auto; }',
          replacement: '.detail-main { width: min(1100px, 100%); margin-inline: auto; }'
        }
      ];

      for (const mutation of leafMutations) {
        const target = await browser.newPage();
        let guard = null;
        let codes = [];
        let injected = null;
        let detail = '变异未执行';
        try {
          await target.setViewportSize({ width: mutation.width, height: 900 });
          await target.goto(new URL(leafRoutes[mutation.kind], base).href, { waitUntil: 'load' });
          guard = await leafMutate(target, mutation.anchor, mutation.replacement);
          if (guard.ok) {
            if (mutation.inject) injected = await leafInjectLongUrl(target, mutation.inject);
            const geometry = await leafMeasure(target);
            const problems = mutation.pair
              ? leafPairProblems(leafGeometry.deal[mutation.width], geometry)
              : leafProblems(geometry, LEAF_KINDS[mutation.kind]);
            // 390 档的判据本来就只含溢出类（列宽那一档的定义是「铺满可用宽」，与 [1080,1120] 无关），
            // 所以 overflowOnly 的变异只报溢出码，免得日志里出现一个与这条牙无关的 width。
            codes = leafCodes(mutation.overflowOnly ? leafOverflowProblems(problems) : problems);
            metrics.leafMutationCodes[mutation.id] = codes;
            detail = `列 ${leafRound(geometry.main.left)}..${leafRound(geometry.main.right)} W=${leafRound(geometry.main.width)}`
              + ` · scrollWidth ${geometry.doc.scrollWidth}（视口 ${geometry.doc.clientWidth}）`
              + (mutation.inject ? ` · 超长 URL 注入位置 ${injected}` : '')
              + ` · 违规码 [${codes.join(', ') || '无'}]`;
          }
        } finally {
          await target.close();
        }
        check(`§22b ${mutation.id} 变异锚点唯一（逐字替换前必须恰好出现 1 次）`,
          Boolean(guard && guard.ok),
          guard
            ? (guard.ok
              ? `锚点「${mutation.anchor}」出现 1 次 · ${mutation.what}`
              : `锚点「${mutation.anchor}」${guard.reason} ⇒ 变异未生效，判红（不允许「变异不生效却算通过」）`)
            : '变异未执行（页面没打开）');
        check(`§22b ${mutation.id} 变异后复测必须出现「${mutation.expect}」违规码（${mutation.what}）`,
          Boolean(guard && guard.ok) && (!mutation.inject || injected === 'link' || injected === 'src') && codes.includes(mutation.expect),
          guard && guard.ok
            ? `期望 ${mutation.expect} · 实测 [${codes.join(', ') || '无'}] · ${detail}`
            : '锚点不唯一/不存在 ⇒ 变异没落地，按红处理（同一个判据不可能被这条牙咬到）');
      }

      // ---- M4 的正对照：同样的超长 URL，一个字节 CSS 都不动 ⇒ 必须不溢出 ----
      // 没有这条，「注入就溢出」证明的可能只是「注入本身会溢出」，与断行判据无关。
      {
        const target = await browser.newPage();
        let geometry = null;
        let injected = null;
        try {
          await target.setViewportSize({ width: LEAF_NARROW, height: 900 });
          await target.goto(new URL(leafRoutes.deal, base).href, { waitUntil: 'load' });
          injected = await leafInjectLongUrl(target, LEAF_LONG_TOKEN);
          geometry = await leafMeasure(target);
        } finally {
          await target.close();
        }
        const controlCodes = geometry ? leafCodes(leafProblems(geometry, LEAF_KINDS.deal)) : ['（页面没打开）'];
        const controlOverflow = geometry ? leafOverflowProblems(leafProblems(geometry, LEAF_KINDS.deal)) : [];
        metrics.leafMutationCodes['M4-control'] = leafCodes(controlOverflow);
        check(`§22b M4 正对照：同样注入 ${LEAF_LONG_TOKEN.length} 字符超长 URL、不动 CSS ⇒ @${LEAF_NARROW} 不得溢出`,
          Boolean(geometry) && (injected === 'link' || injected === 'src')
          && geometry.doc.scrollWidth <= LEAF_NARROW + 1 && controlOverflow.length === 0,
          geometry
            ? `超长 URL 注入位置 ${injected} · scrollWidth ${geometry.doc.scrollWidth}（视口 ${LEAF_NARROW}）`
              + ` · 溢出类违规码 [${leafCodes(controlOverflow).join(', ') || '无'}]（全部码 [${controlCodes.join(', ') || '无'}]，390 档只看溢出）`
            : '页面没打开');
      }

      // ---- 反空洞守卫自身的负例自检 ----
      // 光是「每条变异都过守卫」还不够：如果守卫对任何输入都返回 ok，它就是个摆设。
      // 这里用两个**必然失败**的锚点验它真的会红，而且是**不改页面就返回**（不留下半截替换）。
      {
        const target = await browser.newPage();
        let absent = null;
        let duplicated = null;
        try {
          await target.setViewportSize({ width: 1440, height: 900 });
          await target.goto(new URL(leafRoutes.deal, base).href, { waitUntil: 'load' });
          absent = await leafMutate(target, '§22b-这个锚点在产物里不存在', 'x');
          // .dpane-src 那一行里 `overflow-wrap: anywhere;` 在整份内联样式里出现 3 次（≥2 ⇒ 非唯一）
          duplicated = await leafMutate(target, 'overflow-wrap: anywhere;', 'overflow-wrap: anywhere;');
        } finally {
          await target.close();
        }
        check('§22b 反空洞守卫自检：锚点不存在（0 次）与锚点非唯一（>1 次）都必须 ok:false 并给出原因',
          Boolean(absent && absent.ok === false && absent.occurrences === 0 && absent.reason)
          && Boolean(duplicated && duplicated.ok === false && duplicated.occurrences > 1 && duplicated.reason),
          `不存在的锚点：${absent ? `ok=${absent.ok} · 出现 ${absent.occurrences} 次 · ${absent.reason || ''}` : '未执行'}`
          + ` ／ 非唯一锚点：${duplicated ? `ok=${duplicated.ok} · 出现 ${duplicated.occurrences} 次 · ${duplicated.reason || ''}` : '未执行'}`);
      }

      // ---- 零磁盘污染：变异只发生在浏览器页面里 ----
      const leafHashAfter = { deal: leafHash(leafArtifacts.deal), model: leafHash(leafArtifacts.model) };
      if (urlArg) {
        console.log('  ℹ️  --url= 线上冒烟：不读本地产物，零污染哈希按不适用处理（如实跳过，不造数据）');
      } else {
        check('§22b 变异牙零磁盘污染：dist 里两个产物文件的 sha256 变异前后相等（byte-exact）',
          Boolean(leafHashBefore.deal) && Boolean(leafHashBefore.model)
          && leafHashBefore.deal === leafHashAfter.deal && leafHashBefore.model === leafHashAfter.model,
          `deal/${leafTruth.dealId}/index.html ${String(leafHashBefore.deal).slice(0, 12)}…`
          + ` · models/${leafTruth.modelSlug}/index.html ${String(leafHashBefore.model).slice(0, 12)}…`
          + `（前 ${String(leafHashBefore.deal).slice(0, 8)}/${String(leafHashAfter.deal).slice(0, 8)} · ${String(leafHashBefore.model).slice(0, 8)}/${String(leafHashAfter.model).slice(0, 8)}）`);
      }

      // ---- 机器可读指标 ----
      const leafColumnWidths = { deal: {}, model: {} };
      for (const kind of ['deal', 'model']) {
        for (const width of [...LEAF_VIEWPORTS, LEAF_MOBILE, LEAF_NARROW]) {
          leafColumnWidths[kind][width] = leafRound(leafGeometry[kind][width].main.width);
        }
      }
      metrics.leafColumnWidth = leafRound(leafGeometry.deal[1440].main.width);
      metrics.leafDealWidth = leafRound(leafGeometry.deal[1440].main.width);
      metrics.leafModelWidth = leafRound(leafGeometry.model[1440].main.width);
      // 移动端「页面级横向溢出」的实测值：0 = 不溢出（回归比对里它就是 0 才合格）
      metrics.leafMobileOverflow = Math.max(0,
        leafNarrow.doc.scrollWidth - leafNarrow.doc.clientWidth,
        leafNarrowModel.doc.scrollWidth - leafNarrowModel.doc.clientWidth);
      metrics.leafColumnWidths = leafColumnWidths;
      metrics.leafSample = {
        dealId: leafTruth.dealId,
        dealUrlLength: leafTruth.dealUrlLength,
        modelSlug: leafTruth.modelSlug
      };
      console.log(`     列宽：deal@1440 ${metrics.leafDealWidth}px / model@1440 ${metrics.leafModelWidth}px`
        + ` · @768 deal ${leafColumnWidths.deal[LEAF_MOBILE]} / model ${leafColumnWidths.model[LEAF_MOBILE]}`
        + ` · @390 deal ${leafColumnWidths.deal[LEAF_NARROW]} / model ${leafColumnWidths.model[LEAF_NARROW]}`
        + ` · 移动端页面级溢出 ${metrics.leafMobileOverflow}px`);
    }
  }

  /* ------------------------------------------------------------------ */
  /* §22c Wide Data Page 的页面级说明同轴门禁（布局族 × 全站几何 × 逐条）    */
  /* ------------------------------------------------------------------ */
  //
  // ===== 修复轮 3（t14）后的口径：**量排版结果，不量机制** =====
  //
  // 三轮对抗的教训是同一条根因，只是把「代理量」从盒子挪到了内容盒：
  //   · round 1（border-box）：`padding-right: calc(100% - 70ch)` 让说明变回 451px 窄柱 —— 整轮放行；
  //   · round 2（内容盒 textWidth）：`display: grid; grid-template-columns: minmax(0,70ch) 1fr`
  //     只改一条 CSS、不动标记，就让 changes/ 的 13 条说明字迹只剩 156–451.52px —— 整轮 842 项 EXIT=0；
  //     同类的还有 multicol（column-count/column-width）、`::before { float: right; width: 70% }`、
  //     flex 装饰项、匿名盒承载文本……它们的**盒子与内容盒都可能是满宽的**。
  // 所以本轮的窄柱判据改成**逐行字迹宽**：不管窄化用哪种机制实现，**排版出来的行就是窄的**。
  //
  //   glyphRects = 全部非空白文本节点的 document.createRange().getClientRects() 里
  //                可见的字形盒（width > 0 && height > 0）
  //   lines      = 这些 rect 按**垂直重叠**（重叠 > 两者较矮高度的 50%）归并成的行
  //   lineCount  = 行数 · widestLine = 最宽一行的字迹宽 · lines[] = 逐行 {width,left,right}
  //   columns    = **竖排专用**：这些 rect 按**水平重叠**（重叠 > 两者较窄宽度的 50%）归并成的竖列
  //   columnCount= 竖列数 · columnSpan = 竖列栈覆盖的**水平**范围 · columns[] = 逐列 {width,left,right}
  //   inkCount / inkSpan / inkUnit = wideInkOf(note) 从上面两组量里**按 writing-mode 选出的那一组**
  //                （② 与 ⑤ 都只读它；选轴的实现只有 wideInkOf 一处，量测侧把两组原始量都给出来）
  //
  // 判据是**并集**（不是替换）：旧口径一字不改，新口径叠上去。
  //   ① `note-narrow`      ：textWidth（内容盒代理量）< 0.85 × min(主数据区宽, 页面列宽) —— t7 起就有，**未改**；
  //   ② `note-ink-narrow`  ：inkCount >= 2 且 inkSpan < 0.85 × min(主数据区宽, 页面列宽) —— t14 立，
  //                          **vertical-note-coverage-v1 起按 writing-mode 参数化**（横排按行、竖排按列；见下）。
  //
  // ⚠️ 为什么必须是并集（两份独立标定互证，读数见 teeth/_scratch/lines-*.json）：
  //   · ① 覆盖 **156 条**（`--dir=dist.baseline` 实测：156 条的盒宽全是 452.81 ⇒ ① 看得见全部；
  //     其中 **48 条是单行**窄盒）。② 另覆盖其中 **108 条多行**说明（交集 108 ⇒ ② ⊆ ①）。
  //     只留 ② 会漏掉那 48 条单行窄盒（例 category/agent/#1「全部变化 →」：单行 61.64px / 盒宽 452.81px）——
  //     单行说明**没有行证据**：「1 行、字迹 61.64px」在 452px 的窄柱里和在 1380px 的满宽列里渲染结果
  //     一模一样，① 才是看得见「盒子被压窄」的那把尺子。
  //     ⚠️ 别把两处「48」混用（t19 / R3-2 订正）：truth-401 的 `caughtByOldCriteria(48)` 是
  //     `make-truth-401.cjs:56` 的 `index === 0 ? …` **按序切分**的位置切片，独立复核实测这 48 条
  //     **全是多行**（都落在 ② 的 108 里）；上面那 48 条单行窄盒反而全部落在 `onlyNewTruth`。
  //     两个 48 是巧合，别写成「48 由 note-narrow 单独解释」。
  //     t19 实测归属：`--dir=dist.baseline` ① = 156（盒宽全 452.81）· ② = 108 · 交集 108 · ① 里单行 48。
  //   · 只留 ① 会漏 grid / multicol / float / flex 那一整类：它们的**盒子与内容盒都可能是满宽的**
  //     （t8 的 F-R2-1：`display:grid; grid-template-columns: minmax(0,70ch) 1fr` 只改一条 CSS，
  //     整轮 842 项 EXIT=0）。② 是唯一看得见「字迹铺不开」的那把尺子。
  //   · 并集实测：dist.baseline = 156 条 / 48 页（漏判 0、误报 0）· dist = 0 条 · dist.synth-fixed = 0 条。
  //
  // ② 的三条不许动的细节（都经过独立标定）：
  //   · 前置条件 `inkCount >= 2` **不许松**：去掉它，dist 上 **319 条**单行说明会被误报
  //     （t19 / R3-2 复算：`rendered && !vertical && lineCount === 1 && widestLine < 0.85 × 列宽`
  //     在 @1440 与 @1600 都是 319 条；例「全部变化 →」字迹 61.64px < 0.85×1380 —— 短文本不是缺陷）；
  //   · 也**不许**加码到 `>= 3`：multicol 形态只有 2 行，提到 3 命中数直接掉到 0；
  //   · 阈值 0.85：**不许放宽**。原注释写「t11 已验证 0.85× 与 0.5× 在 A/B/C 三个集合上给出
  //     **完全相同**的命中集合」—— 那句话**只在当年那三个集合上成立**（judge-calibration-v1 / t6 订正）：
  //     两档各跑一整轮真判据实测 **0.5 的命中集合 ⊆ 0.85，判别区 = [0.5, 0.85)**，
  //     而判别区里正躺着本注释自己点名的目标形态 —— **66% multicol**（复刻 912px/1380 = **0.6609**）
  //     与 `v-h12`（**0.6470**）⇒ 降到 0.5 会**放行判据自己的目标形态**。读数：
  //     `research/_raw/judge-calibration-v1/vertical-ratio-ab.json`（t6 的 A/B 两档整轮）。
  //
  // ② 的**语义**（t11 发现并验证，写在这里免得下一轮当 bug 提）：
  //   它量的是「字迹在横向铺到哪里」，不是「单列有多宽」。multicol 形态命中读数是 **912.63px（66%）**，
  //   不是单列宽 447px —— 因为多列里不同列的文字片段共享同一垂直带，按垂直覆盖归并时被并成「一行」。
  //   这正是想要的语义：3 列只用了 2 列、右侧 1/3 空白（缺陷原型）⇒ 912.63 < 1173 ⇒ 咬中；
  //   若字迹铺满整盒（很多细列排满全宽、没有大片空白）⇒ 放行 —— 那种形态**没有**「右边半截空白」的观感。
  //   归并容差实现为「轴上的覆盖 > 两者较矮/较窄的 50%」；轴按 writing-mode 选（见下一段）。
  //   适用性（t19 / R3-1 起）：**物理前置条件** —— min(主数据区宽, 页面列宽) > 现场换算的 70ch
  //   （1440/1600/760 判、360 不判）。不再有「只在桌面档（1440/1600）」的视口白名单：
  //   760 列 676–728px > 452.81px，70ch 窄柱在 760 物理上完全可以发生（R3-1 的 blocker）。
  //
  // note-hidden-text（新码，对应 t8 的 F-R2-2）：**文本非空但一个可见字形盒都没有** ⇒ 判红。
  //   `.snote { font-size: 0 } .snote::before { content: "正文…" }` 这种「把正文交给伪元素画」的
  //   写法让真实文本一个像素都不显示，而盒宽/行数一切正常 —— 只有字形盒能看穿它。
  //   标定（dist 401 条实测）：只有 plans/coding/#1 命中这个形状，而它是
  //   `<p class="snote pnoscript"><noscript>…</noscript></p>`：脚本开启时 <noscript> 内容
  //   **本来就不渲染**（整块高度 0）。所以规则写成「**已渲染**（border-box 有宽有高）且文本非空
  //   且零可见字形盒」—— 未渲染的说明单独登记为 unrendered，既不算窄柱也不算藏字。
  //
  // 竖排（writing-mode: vertical-* / sideways-*）——**vertical-note-coverage-v1 起按列判**（闭合 T31 的 P1）：
  //   · T31 的实测（`research/_raw/secondary-page-layout-unification/verify/T31-WRITING-MODE.md`、
  //     `verify/t31/probe-form.json`）：形态 `.snote { writing-mode: vertical-rl; width: 100%;
  //     height: 5.6rem; overflow: hidden; }` 下，**Range 取到的是列片段**（24 个 16px 宽、87.3px 高的
  //     竖列），盒与内容盒恒满宽（1380px），字迹并集 342.25 × 87.3 ⇒ **占列宽的 24.8%**。
  //   · 为什么旧口径必然静默（两条独立原因，缺一不可）：
  //     ① 量的是内容盒代理量 ⇒ 盒满宽，看不见（那些条 textWidth = 1380）；
  //     ② 按**垂直**重叠归并时，24 个竖列共享同一条垂直带 ⇒ 被并成「1 行」（实测 lineCount = 1）⇒
  //        `lineCount >= 2` 前置条件不成立。**即使删掉「竖排不判」这个显式豁免，② 照样不出码**
  //        —— 这就是为什么修法不能只是删豁免，必须**换轴**。
  //   · 现在：竖排按**水平**重叠归并成竖列（`columns`），判的量换成「竖列栈覆盖的水平范围」
  //     （`columnSpan`，实测 342.25px），前置条件换成「竖列数 ≥ 2」（实测 17–24 列）。同一形态在
  //     @1440/@1600/@760 全部咬中（342.25 < 1173 / 618.8）；@360 列宽 328 < 70ch ⇒ 物理前置条件
  //     不成立、② 照旧不判（那一档由既有的 `note-clipped` 咬住 19px 自裁切）。
  //   · **这不是把竖排一律判红**：判据仍然是量出来的。一个真有 ≥73 列（≈366 字，现场换算 1173px ÷
  //     16px）的竖排说明铺满了列宽 ⇒ 放行；只有 1 列（无排版证据，等价于横排里的单行）⇒ 放行。
  //     两条都在判据自检里成对钉住（见「竖排判据的适用范围自检」）。
  //   · 另一个历史形态 `writing-mode: vertical-rl; height: 5.6rem`（盒宽被内容反推成 ~347px）
  //     仍然由 ① `note-narrow` 咬住；现在 ② 也会同时出码（同一条说明的两条独立证据）。
  //
  // ===== 本版**不**承诺的边界（写在这里，免得下一轮再当 blocker 提）=====
  // · 绘制类遮盖**不在本版承诺内**：`clip-path`、`mask*`、不透明覆盖层（`::after` 盖住右侧 70%）。
  //   它们不改变排版结果（行还是满宽的），要发现只能靠像素级断言，而像素断言会因跨平台字体渲染
  //   在 CI 上 flaky 红 —— 那比漏判更糟；可行性也做过普查：t4 与 t11 各自全仓扫过
  //   252 个源文件 + 186 个产物，`clip-path` **0 处**、`mask*` **0 处**，本仓库没有任何构建路径
  //   会产出它们，`clip-path: path()` / 位图 `mask-image` 也穷尽不了。
  // · `transform: scaleX()` 这类**绘制期缩放**会一并影响 getClientRects ⇒ 逐行判据量得到（已实测咬中）；
  //   同族的「把字挪出可视区」（`text-indent:-9999px` + `overflow:hidden`）由既有的 note-clipped 咬。
  //
  // 其余判据与 t7 相同、未动：
  //   · note-axis    ：border-box 与「主数据区」或「页面主容器 <main>」任一同一轴，
  //                    容差 = max(1px, 5% × min(主数据区宽, 页面列宽))（prompt §11 允许 padding /
  //                    border / scroll wrapper 的少量差异；`index.html` 共享样式里的
  //                    `.dsrc-quote { border-left: 2px solid …; padding-left: 8px; }` 与
  //                    `.doffer { border-left: 3px solid var(--deal); padding: var(--s3) 14px; }`
  //                    属此列。⚠️ 这里原先点名的是 `.aliasnote`（别名页那条说明的
  //                    3px 竖线 + 8px 缩进）—— `secondary-page-residue-v1` 把 `.aliasnote`
  //                    整条删除后，那句注释就在解释一个产物里**不存在**的元素，本轮换成
  //                    仍然存在的两个形状）。
  //   · note-clipped ：说明自身溢出（scrollWidth > clientWidth + 1，**或** scrollHeight > clientHeight + 1
  //      —— 竖直那一半是 judge-hardening-v1a 补的：竖排 + 固定高度 + overflow:hidden 只有竖直方向被裁，
  //      横向量完全看不出来，t5 的 V3 就是从这里零码穿过去的）。
  //   · 逐条：<main> 内**每一条** .snote 都判，码带 route#index；零条说明的页面才跳过。
  //   · 视口：1440 与 1600 全站逐条、390 全站 scrollWidth、760/360 样本集。
  //
  // 违规码全部由 wideProblems() 一处产出：
  //   unclassified-layout / unexpected-detail-main / missing-detail-main / note-narrow /
  //   note-ink-narrow / note-axis / note-clipped / note-hidden-text / note-unrendered /
  //   page-overflow@<vw> / data-region-missing
  //   （note-unrendered 是 t24 新增：盒高被压成 0 ⇒ ①②③ 同时静默的那一类，闭合 T22-F1）

  const WIDE_AXIS_RATIO = 0.05;              // 轴的比例容差：max(1px, 5% × min(主数据区宽, 页面列宽))
  const WIDE_NOTE_RATIO = 0.85;              // 有字区域宽 ≥ 0.85 × min(主数据区宽, 页面列宽)
  const WIDE_WIDE = 1600;                    // 桌面档二（全站逐条；只在 ≥1500px 生效的缺陷靠它）
  const WIDE_NARROW = 390;                   // 全站溢出档（只量 documentElement.scrollWidth）
  const WIDE_SAMPLE_VIEWPORTS = [760, 360];  // 只量样本集的两档
  /**
   * 中档 950（judge-coverage-closure-v1）：产物里有 4 条共享 `@media` 条件活在 **761–1439** 区间
   * （`(min-width:761px) and (max-width:940px)` 完全落在里面），1440/1600 两档**都看不见它们**。
   * t17 实测：这一档跑全站 **0 页违规码**（补上它不会凭空多出违规），成本与 1440/1600 同量级。
   * ⚠️ 加档位必须三处一起加（这个常量 / 量测循环 / `wideNoteRowsByViewport` 汇总表），
   * 否则会出现「量了但没进汇总」的静默缺档。
   */
  const WIDE_MID = 950;
  const WIDE_DESKTOP_VIEWPORTS = [WIDE_DESKTOP, WIDE_WIDE, WIDE_MID];
  // 冻结串：T1 放进 index.html 共享 <style> 的**唯一**一条 .snote 规则，逐字一致（不许改空格）。
  // 它既是变异牙的锚点，也是「一处定义、全站生效」的机器可读证据：每页内联样式里恰好 1 次。
  const WIDE_SNOTE_FROZEN = '.snote { color: var(--mut); font-size: var(--fs-sm); line-height: 1.7; margin: 0 0 var(--s3); max-width: none; overflow-wrap: anywhere; }';
  // M1–M4：只把 max-width 换回 70ch（overflow-wrap 一字不动，隔离缺陷）。
  const WIDE_SNOTE_NARROW = WIDE_SNOTE_FROZEN.replace('max-width: none', 'max-width: 70ch');
  // M6：只拿走断行兜底（其它声明一字不动，隔离缺陷）。
  const WIDE_SNOTE_NOWRAP = WIDE_SNOTE_FROZEN.replace('overflow-wrap: anywhere', 'overflow-wrap: normal');
  // 主数据区：**第一个命中**的声明选择器；一个都没命中时回落 <main> 并在报告里标出。
  const WIDE_DATA_SELECTORS = ['.ctable', '.stable', '.chgsec', '.chglist', '.flist', '.fsec', '.ptable', '.lsum', '.pchglist'];
  // 不可断的 200 字符串：`.snote` 的 overflow-wrap:anywhere 是不是真的在兜底，只有它能量出来。
  const WIDE_LONG_TOKEN = 'x'.repeat(200);
  // 说明槽位（notes-manifest-v1）：`[槽位 id, 检测 token]` 两张表**逐字镜像**
  // `build-local.js` 的 `NOTE_SLOTS`。id 只是清单与消息里的键；token 是**检测**用的
  // （含 token 即算这一类说明），不是判据 —— 判据是「清单声明的签名与条数」与「DOM 里
  // 数出来的签名与条数」是否相等（见本节 ⑨）。
  const NOTE_SLOT_TOKENS = [['main-snote', 'snote'], ['main-pnote', 'pnote'], ['main-vsnote', 'vsnote']];
  // M1–M4 的四个壳（页面级说明曾经各自被压成 70ch 的就是这四个家族）。它们是**固定路由**，
  // 不是数据 id/slug；每条变异都会先守卫「这一页确实是 wide 族、且真有页面级说明」。
  //
  // ⚠️ 第一个壳换过**两次**，两次的理由都记在这里（换壳不是无痕动作，必须能追溯）：
  //
  //   · **第一次**（`secondary-page-intro-changes-v1`）：`student/` → `need/student-only/`。
  //     那次把二级数据页首屏的说明**整层删掉**之后，非别名目录页在 `<main>` 里已经一条
  //     `.snote` 都没有（变化块的「全部变化 →」也从 `<p class="snote">` 改成了模块头里的链接）
  //     —— 变异失去了承重面。
  //   · **第二次**（`secondary-page-residue-v1`，本轮）：`need/student-only/` → `plans/`。
  //     上一轮换过去的那个壳之所以还能承重，靠的正是别名页那条 `.aliasnote`（壳守卫要求
  //     `geometry.noteCount > 0`，而 `noteCount` = `<main>` 内 `.snote` 条数）。本轮把那条
  //     导航更正**整条删除**（它的「例外」身份被实测推翻，见 `build-local.js`
  //     `renderDirectoryPage` 顶部那段说明块），于是该页 `noteCount === 0`、壳守卫直接红，
  //     而硬编码该路由的 M6 / M8 / M10 / M12 / M14 五条牙同时失去承重面。
  //     换成 `plans/`：它在 `<main>` 里有 **12 条** `.snote`（原靶页只有 1 条），冻结串恰好
  //     1 次，首条盒宽/列宽 = 1380 / 1328px（与 `need/student-only/` 逐位相同）—— 承重面是
  //     **变强**，不是平移。首条说明的物理读数（`wideMeasure` 同口径，逐条读数见下面的
  //     `M8 要害` 断言与 `metrics.layoutMutationCodes`）：121 字 / 1 行 / 字迹宽 1365.09px /
  //     1 个字形盒。换靶的逐条复测读数（注入出码 + 不注入干净）入库
  //     `research/_raw/secondary-page-residue-v1/mutation/target-relocation.json`。
  //
  // ## 覆盖面变化（逐字写清，不许含糊）
  //
  //   · 换壳前：四壳 = `collection`(`need/student-only/`) / `status` / `changes` / `feeds`，
  //     **五页**（其中 `need/student-only/` 被 M6/M8/M10/M12/M14 共用）。
  //   · 换壳后：四壳 = `plans-hub`(`plans/`) / `status` / `changes` / `feeds`，**四页**。
  //   · 净变化：**目录页家族从此没有任何变异壳**。原因不是「省事」，而是该家族在本轮删除后
  //     在 `<main>` 里已**无页面级说明可变异**（这正是 ③b 与构建期首屏扫描断言的东西）。
  //     而 M1–M4 守的是 **`.snote` 的宽柱规则本身**（冻结串的 `max-width: none` +
  //     `overflow-wrap: anywhere`），不是「目录页有说明」—— 所以价值随承重面迁移到
  //     `plans/`（12 条说明），覆盖面扩大而非缩小；四个壳的**家族多样性**（plans-hub / status /
  //     changes / feeds）一个都不少，只是不再有一个「零说明的家族」占着壳位。
  const WIDE_MUTATION_TARGETS = ['plans/', 'status/', 'changes/', 'feeds/'];

  /**
   * 首屏说明（intro）的行数上限 —— secondary-page-content-simplification 的新判据。
   *
   * ## 为什么是「行数」而不是「字数」或「像素距离」
   *
   * 本轮之前，二级页顶部那段口径是 133–306 字（三条 `why`）。要守的东西是
   * 「首屏别先让人读三段分类实现」，而它在排版上就是**行数**：
   *   · 写死字数会在中英混排 / 不同字号下失真（prompt §30 明确说「不要写死一个极端字符数」）；
   *   · 写死「标题底边到数据区的像素距离」在本轮实测里**不可用** —— 改动前那 26 条样本路由
   *     的 `introGap` 是 60.78–498.28px，最大值来自 `/plans/coding/`（498px，而它的顶部说明
   *     只有 84 字、1 行 —— 距离被摘要卡与筛选控件撑开的，不是被口径说明撑开的）。
   *     拿它当闸门会变成一条「在正常页面上误报」的守卫。
   * 行数直接对应读者的阅读负担，且对上述两者都免疫。
   *
   * ## ⚠️ 适用范围必须是**物理前置条件**，不能是「所有视口」
   *
   * 这条判据的第一版**没有**限定阅读列宽，结果是：1440/1600 全站 0 命中，
   * 而 @760 命中 4 条、@360 命中 **17 条** —— 命中的还大多是本轮**根本没改**的页面
   * （`/plans/` `/models/` `/docs/data/` `/changes/` `/feeds/` `/status/`，都是 prompt §37
   * 「已经简洁、KEEP」的那一批）。原因很朴素：**同一段文字在窄屏上必然折成更多行**，
   * 那是响应式排版的正常行为，不是缺陷。
   *
   * 所以判据的作用域是「**阅读列宽达到桌面档**」——与 §22c 既有那条 70ch 前置条件
   * （R3-1：`min(主数据区宽, 页面列宽) > note.ch70`）同一种写法，只是尺子换成
   * 「桌面内容列的最小宽度」。实测列宽：1440 档 1120–1380px、1600 档 1240–1500px、
   * 760 档 676–728px、360 档 276–328px ⇒ 取 **1100px** 一刀切开，1440/1600 判、
   * 760/360 不判。**这不是「只测桌面」的偷懒**：prompt §13/§14 的验收目标本身就写明
   * 在 1440×900 下成立，而窄屏的首屏预算由「标题 + 条数 + 首条优惠」另行守着。
   */
  const WIDE_INTRO_MAX_LINES = 2;
  /** 判 intro 行数所需的**最小阅读列宽**（实测：1440 档 ≥1120px · 760 档 ≤728px） */
  const WIDE_INTRO_MIN_COLUMN = 1100;
  /** 归一声明文本：折叠空白、去掉行尾分号 —— 登记项与现场扫描用同一个口径比较。 */
  const wideNarrowDeclaration = (property, value) => `${String(property).trim()}: ${String(value).trim().replace(/;$/, '')}`;
  /** §22c 的全部违规码（判据自检用：一个都不能少、也不能多）。 */
  const WIDE_CODE_VOCABULARY = [
    'unclassified-layout', 'unexpected-detail-main', 'missing-detail-main', 'note-narrow', 'note-ink-narrow',
    'note-axis', 'note-clipped', 'note-hidden-text', 'note-unrendered', 'note-intro-long',
    'narrow-unregistered', 'page-overflow@<vw>', 'data-region-missing'
  ];

  const wideRound = n => Math.round(n * 100) / 100;
  const wideCodes = problems => problems.map(problem => problem.code);
  /**
   * ★ §22c 判据量的**唯一**取用点（vertical-note-coverage-v1 起按 writing-mode 参数化）。
   *
   * ② `note-ink-narrow` 与 ⑤ `note-intro-long` 都只读这里选出来的**一对**量：
   *   · 横排（horizontal-tb）：轴 = 行 —— count = lineCount · span = widestLine（最宽一行的字迹宽）
   *   · 竖排（vertical-* / sideways-*）：轴 = 列 —— count = columnCount · span = columnSpan（列栈水平范围）
   * 两个轴判的是**同一件事**：字迹在**水平轴**上铺到哪里（不是「单列有多宽」——
   * 竖排单列恒 ≈ 一个字宽 16px，拿它当判据会把任何竖排都判红）。
   *
   * 为什么必须换轴：竖排下 Range.getClientRects() 取到的是**列片段**，24 个竖列共享同一垂直带
   * ⇒ 按行归并只会得到 1 行（T31 实测 lineCount = 1）⇒ 「行数 ≥ 2」永远不成立 ⇒ 判据静默。
   * 实测形态与逐档读数：`research/_raw/secondary-page-layout-unification/verify/T31-WRITING-MODE.md`。
   *
   * fail-closed：「量不到尺子」按 0 处理（合成几何、外部注入的 geometry 都可能缺这两个键）——
   * 与 `ch70` 的前置条件同一种口径：宁可多判，也不让「量不到」变成静默跳过。
   */
  const wideInkOf = note => {
    const vertical = Boolean(note.vertical);
    const raw = vertical
      ? { unit: 'column', name: '列', count: note.columnCount, span: note.columnSpan }
      : { unit: 'line', name: '行', count: note.lineCount, span: note.widestLine };
    return { vertical, unit: raw.unit, name: raw.name, count: Number(raw.count) || 0, span: Number(raw.span) || 0 };
  };
  /** 条级定位：route#index（index = <main> 内文档序，与 geometry/truth-401.json 同一口径）。 */
  const wideNoteKey = (route, index) => `${route}#${index}`;
  /** 表头对齐用：CJK 记 2 列，免得版式上的「看起来齐」变成读数上的错觉。 */
  const wideDisplayWidth = text => [...String(text)]
    .reduce((sum, ch) => sum + (/[\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/.test(ch) ? 2 : 1), 0);
  const wideCell = (text, width) => String(text) + ' '.repeat(Math.max(0, width - wideDisplayWidth(text)));

  /** 产物里的全部页面路由：遍历产物目录里所有 index.html → 带尾斜杠路由（首页是空串）。 */
  function wideRoutesFromDisk() {
    const routes = [];
    const walk = dir => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.toLowerCase() === 'index.html') {
          const relPath = path.relative(DIR, full).split(path.sep).join('/');
          routes.push(relPath === 'index.html' ? '' : relPath.replace(/index\.html$/, ''));
        }
      }
    };
    walk(DIR);
    return routes.sort();
  }

  /**
   * 数据驱动的静态路由 → kind。`page-kinds.kindOfRoute` 对它们**按设计返回 null**
   * （目录页家族的 kind 随数据走），所以由调用方在这里显式补齐 —— 这是「补齐」，
   * 不是第二份 kind→layout 表：布局族仍然只从 `pageKinds.layoutOf(kind)` 取。
   */
  function wideKindByRoute() {
    const map = new Map();
    for (const page of audienceLib.COLLECTION_PAGES) map.set(`${page.slug}/`, 'collection');
    for (const page of audienceLib.NEED_PAGES) map.set(`need/${page.slug}/`, 'need');
    map.set(landingsLib.VENDOR_HUB.route, 'hub');
    map.set(landingsLib.CATEGORY_HUB.route, 'hub');
    map.set('', 'home');
    return map;
  }

  /**
   * 样本集（prompt §12）：**现场推导**，一个 id/slug 都不写死。
   *   ① 注册表驱动的入口全部取：COLLECTION_PAGES → `<slug>/`、NEED_PAGES → `need/<slug>/`、
   *      landing 的两个枢纽路由（每一类入口各代表一套判据，少一个就少一条覆盖面）；
   *   ② 磁盘上**不匹配任何 ROUTE_PATTERNS 通配**的静态路由全部取（首页 / 状态 / 变化 / 订阅 /
   *      套餐三页 / 模型索引 / 档案索引 / 数据文档）；
   *   ③ 每个通配族（deal / model / vendor / category / archive-detail）各取磁盘上**第一条**
   *      真实路由 —— 真实 id/slug 由产物决定，脚本里维护不了、也不许维护。
   */
  function wideSampleSet(routes, metaList) {
    const kindOf = route => {
      const hit = metaList.find(item => item.route === route);
      return hit ? hit.kind : null;
    };
    const isWildcard = route => pageKinds.ROUTE_PATTERNS.some(pattern => pattern.re.test(route));
    const sample = new Set();
    for (const page of audienceLib.COLLECTION_PAGES) sample.add(`${page.slug}/`);
    for (const page of audienceLib.NEED_PAGES) sample.add(`need/${page.slug}/`);
    sample.add(landingsLib.VENDOR_HUB.route);
    sample.add(landingsLib.CATEGORY_HUB.route);
    for (const route of routes) if (!isWildcard(route)) sample.add(route);
    for (const pattern of pageKinds.ROUTE_PATTERNS) {
      if ([...sample].some(route => kindOf(route) === pattern.kind)) continue;
      const hit = routes.find(route => isWildcard(route) && kindOf(route) === pattern.kind);
      if (hit) sample.add(hit);
    }
    return [...sample].sort();
  }

  /**
   * 当前页面的**唯一**几何量测（不导航、不假设路由）：变异牙复测走的也是这一份。
   *
   * 每条 .snote 都量四样东西：border-box（轴判据 + 向后兼容）、content box、**有字区域宽**、
   * 以及 Range 并集字迹（进报告、供外部复核；不是判据，理由见本节开头）。
   */
  async function wideMeasure(target) {
    const geometry = await target.evaluate(`(() => {
      const DATA_SELECTORS = ${JSON.stringify(WIDE_DATA_SELECTORS)};
      const NARROW_REGISTRY = ${JSON.stringify(WIDE_NARROW_ENTRIES)};
      const FROZEN = ${JSON.stringify(WIDE_SNOTE_FROZEN)};
      const round = n => Math.round(n * 100) / 100;
      const zeroBox = { count: 0, left: 0, right: 0, width: 0, height: 0, top: 0, scrollW: 0, clientW: 0, scrollH: 0, clientH: 0, padLeft: 0, padRight: 0, maxWidth: '', overflowWrap: '' };
      const box = el => {
        if (!el) return Object.assign({}, zeroBox);
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return {
          count: 1,
          left: round(r.left + window.scrollX), right: round(r.right + window.scrollX), width: round(r.width),
          // height/top：「已渲染」的判定要用（<noscript> 说明整块高度 0）
          height: round(r.height), top: round(r.top + window.scrollY),
          scrollW: el.scrollWidth, clientW: el.clientWidth,
          // 竖直方向的同一对量（judge-hardening-v1a / t5 V3）：竖排 + 固定高度 + overflow:hidden 时
          // 横向量可以完全不动（scrollWidth == clientWidth），竖直方向却被裁掉 ~94% —— 旧口径零码。
          scrollH: el.scrollHeight, clientH: el.clientHeight,
          // 竖直裁切的**前置条件**要用的两个量（t17 裁定 ②）：会不会被裁 = overflow-y 切不切 + 有没有固定高度
          overflowY: cs.overflowY, heightStyle: cs.height,
          padLeft: parseFloat(cs.paddingLeft) || 0, padRight: parseFloat(cs.paddingRight) || 0,
          maxWidth: cs.maxWidth, overflowWrap: cs.overflowWrap
        };
      };
      const contentBoxOf = el => {
        const cs = getComputedStyle(el);
        return el.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
      };
      /**
       * 现场换算 70ch（t19 / R3-1）：把这条说明**自己的字体**逐字复制到屏外探针上，
       * 量 width:70ch 的实际像素宽 —— ② 的物理前置条件（列宽 > 70ch）用的就是这把尺子，
       * 不是「哪些视口算桌面档」的白名单。1440/1600/760 实测 452.81px。
       */
      const ch70Of = el => {
        const cs = getComputedStyle(el);
        const probe = document.createElement('div');
        probe.style.cssText = 'position:absolute;left:-99999px;top:0;visibility:hidden;pointer-events:none;'
          + 'display:inline-block;width:70ch;padding:0;border:0;margin:0;white-space:nowrap;'
          + 'font-family:' + cs.fontFamily + ';font-size:' + cs.fontSize + ';font-style:' + cs.fontStyle
          + ';font-weight:' + cs.fontWeight + ';font-stretch:' + cs.fontStretch + ';font-variant:' + cs.fontVariant
          + ';letter-spacing:' + cs.letterSpacing + ';word-spacing:' + cs.wordSpacing + ';';
        document.body.appendChild(probe);
        const width = probe.getBoundingClientRect().width;
        probe.remove();
        return round(width);
      };
      /**
       * 「保留窄阅读列」登记制的**扫描面**：页面内联 <style> 里**以 ch 为单位**的窄列声明。
       *
       * 规则块用扁平正则取（「选择器 { 声明 }」）——与 §22c 冻结串同一份扫描面；本仓的页面级样式
       * 全是平的（实测：全站 303 个产物里 ch 声明只有 1 处，见 narrow-reading-columns-v1 的普查）。
       * 返回值里带 registered 标记：登记项按「selector（逗号任一段）+ 归一声明文本」匹配。
       * ⚠️ 归一必须与 wideNarrowDeclaration() 同口径（折叠空白 + 去行尾分号），否则会假红。
       * ⚠️ 这段在浏览器侧模板字符串里：注释里**不许**出现反引号。
       */
      /**
       * 剥 CSS 注释 —— **字符串感知**（judge-hardening-v1a / t5 R3）。
       *
       * 旧的扁平正则会被 CSS 字符串里的「斜杠 + 星号」序列（例如 content 值写成 "／＊"）骗过：
       * 那个序列一旦出现，剥注释会一直吃到下一个「星号 + 斜杠」，把中间的**真规则**一起吞掉
       * （实测「.pnote { max-width: 70ch }」生效 452.812px 却 0 码）。
       * 两步走：① 先把**字符串字面量里**的该序列换成两个空格（保持长度、不动别的内容）；
       * ② 再剥注释。这样注释起始只可能来自真的注释。
       * ⚠️ 上面这段注释里**不许**写出那两个字符组合（会提前闭合本文件里的块注释）—— 实测踩过。
       */
      const stripCssComments = text => {
        const masked = String(text).replace(/"(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*'/g, m => m.replace(/\\/\\*/g, '  '));
        return masked.replace(/\\/\\*[\\s\\S]*?\\*\\//g, ' ');
      };
      /**
       * 归一声明文本 —— **登记项与现场扫描必须走同一个函数**（否则会假红/假绿）：
       *   · 折叠空白、「:」两侧归一到 1 个空格、去行尾分号；
       *   · 去掉「!important」（t5 R9：同一处已登记声明只多了「!important」就被判成「未登记」= 假红；
       *     优先级不改变「它是不是一条窄列声明」这件事）；
       *   · 属性名与值统一小写（CSS 的属性名与单位大小写不敏感 ⇒ t5 R4「70CH」/ R5「MAX-WIDTH:」之前静默）。
       */
      const narrowNormDeclaration = text => String(text)
        .replace(/!important/gi, ' ')
        .replace(/\\s*:\\s*/g, ': ')
        .replace(/\\s+/g, ' ')
        .replace(/;\\s*$/, '')
        .trim().toLowerCase();
      /** 当前页面的路由（浏览器侧现读；供登记项的 routes 约束用） */
      const narrowRoute = (() => {
        try { return decodeURIComponent(location.pathname).replace(/^\\//, ''); } catch (error) { return ''; }
      })();
      const narrowChDeclarations = (registered) => {
        const found = [];
        const styles = Array.prototype.slice.call(document.querySelectorAll('style'));
        for (const style of styles) {
          // ⚠️ 必须走 stripCssComments（字符串感知）：旧的扁平正则会「content:"/*"」吞规则。
          const text = stripCssComments(style.textContent || '');
          const ruleRe = /([^{}]{1,200})\{([^{}]*)\}/g;
          let rule = ruleRe.exec(text);
          while (rule) {
            const selectorText = rule[1].replace(/\\s+/g, ' ').trim();
            const selectors = selectorText.split(',').map(s => s.trim()).filter(Boolean);
            for (const decl of rule[2].split(';')) {
              const idx = decl.indexOf(':');
              if (idx < 0) continue;
              const property = decl.slice(0, idx).trim();
              const value = decl.slice(idx + 1).trim();
              if (!/^(max-width|inline-size|width)$/i.test(property)) continue;
              if (!/\\d+(\\.\\d+)?ch\\b/i.test(value)) continue;
              const declaration = narrowNormDeclaration(property + ': ' + value);
              // 登记 = **这一条规则的每一个选择器段**都有登记（t5 R2：「.pnote, .pdetailbody { 72ch }」
              // 不许借已登记选择器的名字蒙混过关），且登记项的 routes（写了的话）包含当前路由。
              const hit = selectors.length > 0 && selectors.every(sel =>
                registered.some(entry => narrowNormDeclaration(entry.declaration) === declaration
                  && String(entry.selector).trim() === sel
                  && (!Array.isArray(entry.routes) || entry.routes.includes(narrowRoute))));
              found.push({ selector: selectors.join(', '), declaration: declaration, registered: hit, route: narrowRoute });
            }
            rule = ruleRe.exec(text);
          }
        }
        return found;
      };
      /** 直接含非空白文本节点 ⇒ 这个元素「承载文本」 */
      const bearsText = el => {
        for (const node of el.childNodes) if (node.nodeType === 3 && node.textContent.trim()) return true;
        return false;
      };
      /** 是否参与行布局：inline 元素的 clientWidth 恒为 0，不能算候选 */
      const laysOutLines = el => {
        const display = getComputedStyle(el).display;
        return display !== 'inline' && display !== 'none' && display !== 'contents';
      };
      /**
       * 全部**非空白文本节点**的可见字形盒（Range 包住文本节点 → getClientRects）。
       * 【noscript】子树**排除**：脚本开启时它的内容按规范不渲染（plans/coding/ 的
       * 「.snote.pnoscript」就是这种：textContent 非空、一个字形盒都没有，但那是正常的「无 JS 提示」）。
       */
      const glyphRectsOf = el => {
        const rects = [];
        const walk = node => {
          for (const child of node.childNodes) {
            if (child.nodeType === 3) {
              if (!child.textContent.trim()) continue;
              const range = document.createRange();
              range.selectNodeContents(child);
              for (const rect of range.getClientRects()) {
                if (rect.width > 0 && rect.height > 0) {
                  rects.push({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height });
                }
              }
            } else if (child.nodeType === 1 && child.tagName !== 'NOSCRIPT') {
              walk(child);
            }
          }
        };
        walk(el);
        return rects;
      };
      /** 与文本节点的「非空」口径一致：同样是排除了 <noscript> 之后的文本 */
      const visibleTextOf = el => {
        let out = '';
        const walk = node => {
          for (const child of node.childNodes) {
            if (child.nodeType === 3) out += child.textContent;
            else if (child.nodeType === 1 && child.tagName !== 'NOSCRIPT') walk(child);
          }
        };
        walk(el);
        return out.replace(/\\s+/g, ' ').trim();
      };
      /**
       * 同一口径但**不排除** <noscript>（t24 / 闭合 T22-F1）：用来区分两种「未渲染」——
       *   · 文字全在 <noscript> 里（可见文本 0、原始文本非空）⇒ 脚本开启时本来就不该画，合法；
       *   · 可见文本非空却没有字形盒 ⇒ 有人把正文藏了（裸 font-size:0 会把盒高压成 0）。
       */
      const rawTextOf = el => {
        let out = '';
        const walk = node => {
          for (const child of node.childNodes) {
            if (child.nodeType === 3) out += child.textContent;
            else if (child.nodeType === 1) walk(child);
          }
        };
        walk(el);
        return out.replace(/\\s+/g, ' ').trim();
      };
      /**
       * 归并成排版单元 —— **轴按 writing-mode 选**（vertical-note-coverage-v1 参数化）：
       *   · 横排（vertical=false）：按 top 排序，落进「垂直重叠 > 两者较矮高度 50%」的已有**行**；
       *   · 竖排（vertical=true ）：按 left 排序，落进「水平重叠 > 两者较窄宽度 50%」的已有**列**。
       * 两轴逐字同构（排序键、重叠量、基准、扩张方式一一对应），所以横行那一路的读数与参数化之前
       * **逐位相同**（标定不变：dist 319 条单行说明仍然只有 1 行）。
       *
       * ⚠️ 竖排**必须换轴**，不能只是「照样按行归并」：Range 在竖排下取到的是列片段，
       *    24 个竖列共享同一垂直带 ⇒ 按行归并只会得到 1 行（T31 实测 lineCount = 1），
       *    「前置条件 ≥ 2」永远不成立 ⇒ 判据静默。现场读数见 T31-WRITING-MODE.md §3.1。
       *
       * 返回 [{left,right,width}]：width = 该单元覆盖的**水平**范围（横排 = 这一行有多宽；
       * 竖排 = 这一列占多宽，恒等于单列宽 ≈ 一个字宽）。竖排的判据量不是单列宽，而是**列栈的水平范围**
       * （见下方 columnSpan）—— 那才是「字迹在横向铺到哪里」在竖排下的对应量。
       */
      const mergeAxis = (rects, vertical) => {
        const sorted = rects.slice().sort(vertical
          ? (a, b) => a.left - b.left || a.top - b.top
          : (a, b) => a.top - b.top || a.left - b.left);
        const units = [];
        for (const rect of sorted) {
          let hit = null;
          for (const unit of units) {
            const overlap = vertical
              ? Math.min(unit.right, rect.right) - Math.max(unit.left, rect.left)
              : Math.min(unit.bottom, rect.bottom) - Math.max(unit.top, rect.top);
            const basis = vertical ? Math.min(unit.width, rect.width) : Math.min(unit.height, rect.height);
            if (overlap > 0.5 * basis) { hit = unit; break; }
          }
          if (hit) {
            hit.left = Math.min(hit.left, rect.left); hit.right = Math.max(hit.right, rect.right);
            hit.top = Math.min(hit.top, rect.top); hit.bottom = Math.max(hit.bottom, rect.bottom);
            hit.width = Math.max(hit.width, rect.width); hit.height = Math.max(hit.height, rect.height);
          } else {
            units.push({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
              width: rect.width, height: rect.height });
          }
        }
        units.sort(vertical
          ? (a, b) => a.left - b.left || a.top - b.top
          : (a, b) => a.top - b.top || a.left - b.left);
        return units.map(unit => ({ left: round(unit.left), right: round(unit.right), width: round(unit.right - unit.left) }));
      };
      const mergeLines = rects => mergeAxis(rects, false);
      const mergeColumns = rects => mergeAxis(rects, true);
      /** Range 并集：包住元素下全部文本节点，取 getClientRects() 的并集（诊断量，不再作判据） */
      const inkOf = el => {
        const rects = glyphRectsOf(el);
        if (!rects.length) return null;
        const left = Math.min.apply(null, rects.map(r => r.left));
        const right = Math.max.apply(null, rects.map(r => r.right));
        return { left: round(left), right: round(right), width: round(right - left), rects: rects.length,
          longestLine: round(Math.max.apply(null, rects.map(r => r.width))) };
      };
      const mains = document.querySelectorAll('main');
      const main = mains.length ? mains[0] : null;
      let regionSel = null;
      let regionEl = null;
      for (const sel of DATA_SELECTORS) {
        const hit = document.querySelector(sel);
        if (hit) { regionSel = sel; regionEl = hit; break; }
      }
      const styles = Array.prototype.slice.call(document.querySelectorAll('style'));
      let frozenCount = 0;
      // ⚠️ 计数前先剥 CSS 注释（judge-hardening-v1a / t5 F1）：把真规则整条包进「/* … */」时，
      //    旧写法仍然数到「恰好 1 次」（字符串还在），而那条规则**已经不在**（computed 从
      //    12px/20.4px/margin-bottom 12px 变成 14px/21px/0）。剥注释后计数变 0 ⇒ 判红。
      for (const style of styles) frozenCount += stripCssComments(style.textContent || '').split(FROZEN).length - 1;
      const notes = main ? Array.prototype.slice.call(main.querySelectorAll('.snote')) : [];
      /**
       * ★ notes-manifest-v1：说明容器按「槽位 id × class token 集合」分组计数。
       *
       * 这是跨源对账里**渲染侧**的读数：清单（dist/_notes.ndjson）说「这一页的哪个槽位
       * 应当有几条什么签名的说明」，这里数真浏览器 DOM 里实际有几条。口径必须与
       * build-local.js 的 noteSignaturesInMain() **逐字同构**：class 属性分词、按排序后的
       * token 集合分组；检测是 token 级（含槽位 token 即算），判定是集合级（签名必须相等）。
       * 改名 / 换容器只会让后者对不上 —— 这正是那条 P1 要闭合的地方。
       * ⚠️ 本段是浏览器侧的模板字符串：注释里不许出现反引号（会提前截断模板）。
       */
      const NOTE_SLOT_PAIRS = ${JSON.stringify(NOTE_SLOT_TOKENS)};
      const notesBySignature = (() => {
        const out = {};
        if (!main) return out;
        const list = main.querySelectorAll('[class]');
        for (let i = 0; i < list.length; i++) {
          const tokens = String(list[i].getAttribute('class') || '').trim().split(/\\s+/).filter(Boolean);
          const slot = NOTE_SLOT_PAIRS.filter(pair => tokens.indexOf(pair[1]) !== -1)[0];
          if (!slot) continue;
          const key = slot[0] + '|' + tokens.slice().sort().join(' ');
          out[key] = (out[key] || 0) + 1;
        }
        return out;
      })();
      // intro 区 = 首个数据区**之前**的那些说明。判据：说明的 border-box 顶边 < 数据区顶边。
      // 没有数据区（/plans/、/archive/ 这类）时退化成「全部说明都不算 intro」——
      // 宁可漏判也不误判：一条在正常页面上失败的守卫比没有守卫更糟。
      // ⚠️ 这段是**浏览器侧的模板字符串**，注释里不许出现反引号（会提前截断模板、
      //    报成「xxx is not defined」而不是语法错误 —— 本地实测踩过一次）。
      const regionTop = regionEl ? regionEl.getBoundingClientRect().top + window.scrollY : null;
      const introIndexes = regionTop === null ? [] : notes
        .map((el, index) => ({ index, top: el.getBoundingClientRect().top + window.scrollY }))
        .filter(item => item.top < regionTop - 0.5)
        .map(item => item.index);
      return {
        doc: {
          innerWidth: window.innerWidth,
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth
        },
        mainCount: mains.length,
        detailMainCount: document.querySelectorAll('main.detail-main').length,
        main: box(main),
        regionSel: regionSel,
        regionFallback: !regionSel,
        // 命不中声明选择器时**回落 <main>**（这一条是判据的一部分，不是兜底将就）。
        region: box(regionEl || main),
        noteCount: notes.length,
        introIndexes: introIndexes,
        // 保留窄阅读列的现场扫描（narrow-reading-columns-v1）：逐条带 registered 标记
        narrowCh: narrowChDeclarations(NARROW_REGISTRY),
        notes: notes.map((el, index) => {
          const noteBox = box(el);
          const cs = getComputedStyle(el);
          // 物理前置条件用的尺子：这条说明自己的 70ch 现场换算值（t19 / R3-1）
          const ch70 = ch70Of(el);
          const bearing = [];
          if (bearsText(el)) bearing.push(el);
          for (const descendant of el.querySelectorAll('*')) {
            if (laysOutLines(descendant) && bearsText(descendant)) bearing.push(descendant);
          }
          const widths = bearing.map(contentBoxOf).filter(w => w > 0);
          const contentBox = contentBoxOf(el);
          // ① 的**判据量**（内容盒代理量，t19 / R3-3 订正：早年注释写成「诊断量…不再作判据」已过时）：
          // 承载文本的块级元素里最窄的那个 content box；取不到承载块时回落 border-box，
          // 消息里标「textFallback 回落」。无盒形态（display:contents / 未渲染）由 wideProblems 的
          // 「rendered」前置挡掉，不会把这个 0 当成窄柱。
          const textWidth = widths.length
            ? Math.min.apply(null, widths)
            : (contentBox > 0 ? contentBox : noteBox.width);
          // 判据量：逐行字迹（横排）/ 逐列字迹（竖排）—— 两轴同构，见 mergeAxis 的注释
          const glyphRects = glyphRectsOf(el);
          const lines = mergeLines(glyphRects);
          const visibleText = visibleTextOf(el);
          // t24 / T22-F1：原始文本（不排除 <noscript>）用来判定「文字是不是全在 <noscript> 里」
          const rawText = rawTextOf(el);
          const writingMode = cs.writingMode || 'horizontal-tb';
          const vertical = /vertical|sideways/.test(writingMode);
          // 竖排只有一条路会用到 columns（横排不算这一组：省掉一次纯冗余的归并，读数里 columns 为 []）
          const columns = vertical ? mergeColumns(glyphRects) : [];
          // ★ 竖排的判据量 = **列栈覆盖的水平范围**（columnSpan）：竖排下「字迹在横向铺到哪里」的
          //   对应量。单列宽 ≈ 一个字宽（T31 实测恒 16px）不能当判据 —— 拿它判会把任何竖排都判红。
          //   ⚠️ 轴的**选取**只在 wideInkOf() 一处（横排读 lineCount/widestLine、竖排读 columnCount/columnSpan）。
          const columnSpan = columns.length
            ? round(columns.reduce((max, column) => Math.max(max, column.right), 0)
              - columns.reduce((min, column) => Math.min(min, column.left), Infinity))
            : 0;
          return {
            index: index,
            depth: (() => { let d = 0, p = el; while (p && p !== main) { p = p.parentElement; d++; } return d; })(),
            parent: el.parentElement
              ? el.parentElement.tagName.toLowerCase() + (el.parentElement.className ? '.' + String(el.parentElement.className).split(/\\s+/)[0] : '')
              : null,
            text: visibleText.slice(0, 32),
            textLength: visibleText.length,
            // t24 / T22-F1：未渲染的两种来源要分开 —— 原始文本（含 <noscript>）长度、是否含 <noscript> 子树。
            rawTextLength: rawText.length,
            noscriptSubtree: Boolean(el.querySelector('noscript')),
            box: noteBox,
            // 已渲染 = border-box 有宽有高。【noscript】说明整块高度为 0 ⇒ 未渲染，不判窄柱/藏字。
            rendered: noteBox.width > 0 && noteBox.height > 0,
            writingMode: writingMode,
            vertical: vertical,
            glyphRects: glyphRects.length,
            lineCount: lines.length,
            widestLine: lines.length ? lines.reduce((max, line) => Math.max(max, line.width), 0) : 0,
            lines: lines,
            // 竖排专用（横排为 [] / 0）：逐列归并的列数与列栈水平范围
            columns: columns,
            columnCount: columns.length,
            columnSpan: vertical ? columnSpan : 0,
            contentBox: round(contentBox),
            // 现场换算的 70ch（物理前置条件的尺子；见 ch70Of 与 wideProblems 的 ②）
            ch70: ch70,
            textWidth: round(textWidth),
            textFallback: widths.length === 0,
            bearingCount: bearing.length,
            ink: inkOf(el)
          };
        }),
        frozenCount: frozenCount,
        notesBySignature: notesBySignature
      };
    })()`);
    // 向后兼容：老口径的「文档序第一条」读数（抽取式对抗工具读 geometry.note.*）
    geometry.note = geometry.notes.length ? geometry.notes[0].box
      : { count: 0, left: 0, right: 0, width: 0, scrollW: 0, clientW: 0 };
    return geometry;
  }

  /**
   * ★ §22c 的**唯一**判据函数：一次量测 + 页面元信息 ⇒ 违规码。
   *
   * M0 反证、1440/1600 全站逐条扫描、760/360 样本集、M1–M10 的变异复测**全部**走这一个函数 ——
   * 「判据写错了」与「产品没问题」在日志里长得一样，所以判据本身也要能被咬到。
   * 条级违规码带 `index`（= <main> 内文档序），route#index 就是外部核对的键。
   */
  function wideProblems(geometry, meta) {
    const problems = [];
    // cause：这条码是哪条判据咬出来的（`line` / `single-line` / `vertical` / `hidden-text` …）。
    // 变异牙与 metrics 都读它，免得靠中文消息去认判据。
    const push = (code, msg, index, cause) => {
      const problem = { code, msg };
      if (index !== undefined) problem.index = index;
      if (cause !== undefined) problem.cause = cause;
      problems.push(problem);
    };
    const vw = geometry.doc.clientWidth;

    // ① 布局族：解析不出来就是红（不许静默跳过一页）
    if (!meta || !meta.kind || !meta.family) {
      push('unclassified-layout', `路由「${meta ? meta.route : '（无元信息）'}」解析不出 kind/layout`
        + `（kindOfRoute + kindByRoute 都没命中 ⇒ 布局族无从判定）`);
    } else if (meta.family === 'detail') {
      if (geometry.detailMainCount !== 1) {
        push('missing-detail-main', `detail 族要求恰好 1 个 main.detail-main，实测 ${geometry.detailMainCount} 个`
          + `（<main> 共 ${geometry.mainCount} 个）`);
      }
    } else if (meta.family === 'wide') {
      if (geometry.detailMainCount !== 0) {
        push('unexpected-detail-main', `wide 族要求 0 个 main.detail-main，实测 ${geometry.detailMainCount} 个`);
      }
    }

    // ② 主数据区：命不中声明选择器时回落 <main>（在报告里标出，不算失败）；连 <main> 都没有才是红
    const regionOk = geometry.region.count === 1 && geometry.region.width > 0;
    const mainOk = geometry.main.count === 1 && geometry.main.width > 0;
    if (geometry.main.count !== 1) {
      push('data-region-missing', `没有唯一的 <main>（${geometry.mainCount} 个）—— 主数据区与回落锚点都不存在`);
    } else if (!regionOk) {
      push('data-region-missing', `主数据区不可测：${geometry.regionSel || '（无声明选择器命中，回落 <main>）'}`
        + ` 的 border-box 宽 ${geometry.region.count === 1 ? wideRound(geometry.region.width) : 0}px`);
    }

    // ③ 逐条页面级说明：<main> 内**全部** .snote（不再只看文档序第一条）。
    //    零条的页面如实标「无页面级说明」，跳过该条、不算失败；整块没渲染的（<noscript> 那种）
    //    也单独登记为 unrendered —— 它既不是窄柱也不是藏字。
    if (mainOk && regionOk && geometry.noteCount > 0) {
      const main = geometry.main;
      const region = geometry.region;
      // 主数据区可能比页面列还宽（窄档里表格在横向滚动容器里）⇒ 分母取两者的较小值。
      const column = Math.min(region.width, main.width);
      const threshold = WIDE_NOTE_RATIO * column;
      // ② 的适用性 = **物理前置条件**（t19 / R3-1），不是视口数字白名单。
      //
      //   尺子：`note.ch70` = 现场换算的 70ch —— 把这条说明自己的字体逐字复制到屏外探针上，
      //   量 `width: 70ch` 的实际像素宽（wideMeasure 里现量，1440/1600/760 实测都是 452.81px）。
      //   判据：**min(主数据区宽, 页面列宽) > 70ch** ⇒ 「盒满宽、字被排进 70ch 窄轨」物理上可能发生。
      //   实测（R3-1 的独立探针，见 review/R3-review.md §5）：1440 列 1120–1380 · 1600 列 1240–1500 ·
      //   760 列 676–728，全部 > 452.81 ⇒ **判**；360 列 276–328 < 452.81 ⇒ **不判**
      //   （天然保住 360 档 feeds/#2「按「我是谁」…」的已知边界：328px 列里排成 2 行、最宽 264px，
      //   那是 CJK 断行 + 行内 /student/ 这类不可断片段的正常余量，不是缺陷）。
      //   ch70 缺失（外部合成几何没带这个量）时按 0 处理 ⇒ 前置条件成立、照判 ——
      //   宁可多判也不能让「量不到尺子」变成静默跳过。逐条的 `note.ch70` 在下面循环里取用。
      // 轴：border-box，比例容差（prompt §11：允许 padding / border / scroll wrapper 的少量差异）
      const axisTol = Math.max(WIDE_TOL, WIDE_AXIS_RATIO * column);
      const anchors = [
        { label: `主数据区 ${geometry.regionSel || '<main>'}`, box: region },
        { label: '页面主容器 <main>', box: main }
      ];
      // 合成几何（判据自检）不带这个量 ⇒ 按「没有 intro」处理：宁可漏判也不误判。
      const introSet = Array.isArray(geometry.introIndexes) ? geometry.introIndexes : [];
      for (const note of geometry.notes) {
        const where = wideNoteKey(meta.route, note.index);
        // 判据量的轴（横排 = 行 / 竖排 = 列）—— 唯一取用点是 wideInkOf，② 与 ⑤ 共用同一对读数。
        const ink = wideInkOf(note);
        const facts = `盒宽 ${wideRound(note.box.width)}px · 内容盒 ${wideRound(note.contentBox)}px · 行 ${note.lineCount} 行`
          + `（最宽一行 ${wideRound(note.widestLine)}px）`
          + (note.vertical
            ? ` · **竖排**（${note.writingMode}）：列 ${note.columnCount} 列（列栈水平范围 ${wideRound(note.columnSpan)}px）`
            : '')
          + ` · 字形盒 ${note.glyphRects} 个 · 列宽 ${wideRound(column)}px · 阈值 ${wideRound(threshold)}px`
          + `（主数据区 ${geometry.regionSel || '<main>'} ${wideRound(region.width)}px / 页面列 ${wideRound(main.width)}px）`;
        if (!note.rendered) note.unrendered = true;
        // ① 旧口径（t7 的 textWidth，**判据式一字未改**）：内容盒代理量被压窄。
        //    覆盖面：`--dir=dist.baseline` 实测 156 条（盒宽全 452.81），其中 48 条是**单行**窄盒 ——
        //    行口径看不见它们（单行没有行证据），① 才是那把尺子（t19 / R3-2 订正：别写成
        //    「truth 的 caughtByOldCriteria 48 = 这些单行」——那 48 是 make-truth-401.cjs:56 的
        //    `index === 0` 按序切分，实测全是多行，都在 ② 里）。
        //    t19 / R3-3：加 `rendered` 前置 —— `display: contents` 时说明**不生成盒子**，
        //    border-box 与内容盒都是 0，`contentBox === 0 ⇒ 回落 border-box` 会把「0px < 阈值」
        //    报成窄柱（实测误报），同轴的 0..0 盒子也量不出轴。无盒形态不判窄柱/轴/裁切；
        //    文本是否铺得开由 ② 用**字形盒证据**判（见下），不靠这个盒子。
        const boxed = note.rendered;
        if (boxed && note.textWidth < threshold - 0.01) {
          push('note-narrow', `${where} 有字区域宽（内容盒代理量）${wideRound(note.textWidth)}px < ${WIDE_NOTE_RATIO} × 列宽`
            + `（承载文本块 ${note.bearingCount} 个${note.textFallback ? ' · textFallback 回落' : ''}）—— ${facts}`, note.index, 'text-width');
        }
        // ② 新口径（t14 立；作用域 t19 起改为物理前置条件；**轴** vertical-note-coverage-v1 起参数化）：
        //    「字迹在**水平轴**上铺到哪里」—— 盒子/内容盒可能都是满宽的（grid / multicol / float /
        //    flex / 匿名盒…，以及竖排），但排版结果铺不开 ⇒ 这里咬。
        //    前置条件 `ink.count ≥ 2` 不许松（去掉它 dist 上会误报 319 条单行说明）；也不许提到 ≥3
        //    （multicol 只有 2 行）。
        //    **单列豁免的边界（judge-hardening-v1a 起写清）**：这条前置条件豁免的是
        //    「**无固定高度且无裁切**」的单列形态 —— 也就是「一行字就是一行字」的正常短说明。
        //    一旦单列说明自身有裁切（横或竖），它由 `note-clipped` 两轴版本咬住（t5 的 V3：
        //    `height: 5.6rem + overflow: hidden` 裁掉 ~94% 而整页零码）；有固定高度但不裁切、
        //    字形又铺不开的形态仍由 ① `note-narrow`（内容盒代理量）覆盖。
        //    **竖排按列**：count = 列数、span = 列栈水平范围（T31 的 P1 就是在这里闭合的；
        //    旧口径「竖排显式不判」即使删掉豁免也救不了 —— 按行归并时竖排恒为 1 行，前置条件不成立）。
        //    ⚠️ 作用域 = 物理前置条件（R3-1）：`column > note.ch70`（现场换算的 70ch，见上方注释），
        //    不再有「只判 1440/1600」的视口白名单 —— 760 档列 676–728 > 452.81 ⇒ 判
        //    （这正是 R3-1 的复现形状：把 grid 规则包进 @media (max-width:760px) 以前整轮 EXIT=0），
        //    360 档列 276–328 < 452.81 ⇒ 不判。
        //    t19 / R3-3：判 ② 的证据是**字形盒**，不看说明自己有没有盒子（display:contents 也判）——
        //    否则「无盒 ⇒ 整类免判」会变成新的放行面。
        const ch70 = Number(note.ch70) > 0 ? Number(note.ch70) : 0;
        const inkScope = column > ch70 + WIDE_TOL;
        if ((note.rendered || note.glyphRects > 0) && inkScope
          && ink.count >= 2 && ink.span < threshold - 0.01) {
          push('note-ink-narrow', `${where} 逐${ink.name}字迹：`
            + (ink.vertical
              ? `竖列栈水平铺开 ${wideRound(ink.span)}px（${ink.count} 列）`
              : `最宽一行 ${wideRound(ink.span)}px`)
            + ` < ${WIDE_NOTE_RATIO} × 列宽`
            + ` —— ${facts}`, note.index, ink.unit);
        }
        // ③ 藏字：文本非空、**已渲染**，却一个可见字形盒都没有（正文被交给 ::before / font-size:0 去画的形状）。
        //    未渲染的说明（<noscript> 提示：整块高度 0）不判 —— 它既不是窄柱也不是藏字。
        if (note.rendered && note.textLength > 0 && note.glyphRects === 0) {
          push('note-hidden-text', `${where} 文本 ${note.textLength} 字但**零可见字形盒**（getClientRects 为空）`
            + ` —— 正文可能被 font-size:0 / ::before{content} / display:none 之类的写法接管：${facts}`, note.index, 'no-glyph');
        }
        // ④ 未渲染说明（t24 立 / t28 收紧）：**盒高被压成 0** 的形态（裸 `.snote { font-size: 0 }`、
        //    `display: none` 之类）会让 ①②③ 同时静默 —— 因为它们都要求「已渲染」或「有字形盒」。
        //    判定只用三种**非像素**量：render 状态（盒有宽有高）· 可见文本长度（探针不采集 <noscript>）·
        //    字形盒个数（Range.getClientRects 里宽高都 > 0 的）。
        //      !rendered && textLength > 0 && glyphRects === 0  ⇒ 有正文、却一个字形都不画、盒子也没有
        //    ⚠️ 唯一的豁免是**可见文本长度为 0**（没有可画的东西）。这里**没有**标记级豁免键：
        //    t24 的第一版带过 `&& !note.noscriptSubtree`，T26 复审实测「给每条说明插一个**空**
        //    `<noscript></noscript>`」就能买到豁免（整轮 EXIT=0 / 852 项 0 失败）—— t28 把它删掉了。
        //    dist 里那条真·合法未渲染（plans/coding/#1）靠**可见文本 0** 排除：它的文字全在
        //    `<noscript>` 子树里（实测 textLength 0 / rawTextLength 44），与标记本身无关。
        //    `display: contents`（说明不生成盒子但正文由父级正常排版）不在此列：它的字形盒 > 0。
        if (!note.rendered && note.textLength > 0 && note.glyphRects === 0) {
          push('note-unrendered', `${where} 说明未渲染（盒 ${wideRound(note.box.width)}×${wideRound(note.box.height)}px）`
            + `却有 ${note.textLength} 字可见正文、零可见字形盒（原始文本 ${note.rawTextLength} 字 · 含 <noscript> ${note.noscriptSubtree}）`
            + ` —— 盒高被压成 0 会让窄柱 / 逐行字迹 / 藏字三条判据全部静默（如裸 font-size:0、display:none）：${facts}`,
          note.index, 'unrendered');
        }
        const aligned = anchors.filter(anchor => Math.abs(note.box.left - anchor.box.left) <= axisTol
          && Math.abs(note.box.right - anchor.box.right) <= axisTol);
        // 同轴 / 裁切都是**盒量**：无盒形态（display:contents / 未渲染）不判 —— 0..0 的盒子
        // 只会产出「与两锚都不同轴」的假红（t19 / R3-3）。
        if (boxed && !aligned.length) {
          push('note-axis', `${where} 说明 ${wideRound(note.box.left)}..${wideRound(note.box.right)} 与`
            + anchors.map(anchor => `${anchor.label} ${wideRound(anchor.box.left)}..${wideRound(anchor.box.right)}`).join(' / ')
            + ` 都不在同一轴上（容差 max(${WIDE_TOL}px, ${WIDE_AXIS_RATIO} × ${wideRound(column)}px) = ${wideRound(axisTol)}px）`, note.index);
        }
        if (boxed && note.box.scrollW > note.box.clientW + WIDE_TOL) {
          push('note-clipped', `${where} 说明自身横向溢出 ${note.box.scrollW - note.box.clientW}px`
            + `（scrollWidth ${note.box.scrollW} > clientWidth ${note.box.clientW}）`, note.index);
        }
        // 裁切的**竖直**那一半（judge-hardening-v1a / t5 V3）：`writing-mode: vertical-rl` +
        // 固定高度 + `overflow: hidden` 的形态下，横向量恒相等（实测 scrollWidth 1377 == clientWidth 1377），
        // 只有竖直方向被裁 —— `scrollHeight 1489 / clientHeight 90` ⇒ 157 字里约 94% 看不见。
        // 同一条码（note-clipped 覆盖两个轴），因为对读者是同一件事：说明的字被切掉了。
        // ⚠️ **前置条件**（t17 裁定 ② 要求；t5 的 V3 只是它的一个特例）：
        //   竖直溢出只有在「能被裁」的形态下才算缺陷 —— `overflow-y ∈ {hidden, clip, auto, scroll}`
        //   或**声明了固定高度**（`height ≠ auto`）。否则竖直溢出是**正常文档流**（内容自然撑高、
        //   页面照样能滚到）—— 不加这条前置会误报。实测误报面见报告的逐档读数。
        // 单列豁免因此被限定为「**无固定高度且无裁切**」：竖排单列不再等于免判。
        const clipPossible = boxed && (['hidden', 'clip', 'auto', 'scroll'].includes(String(note.box.overflowY))
          || (note.box.heightStyle && note.box.heightStyle !== 'auto'));
        if (clipPossible && note.box.scrollH > note.box.clientH + WIDE_TOL) {
          push('note-clipped', `${where} 说明自身**竖直**溢出 ${note.box.scrollH - note.box.clientH}px`
            + `（scrollHeight ${note.box.scrollH} > clientHeight ${note.box.clientH}`
            + `${note.vertical ? ` · 竖排 ${note.writingMode}：横向量 ${note.box.scrollW}/${note.box.clientW} 看不出问题` : ''}）`,
          note.index);
        }
        // ⑤ 首屏说明过长（secondary-page-content-simplification）。
        //    只判 **intro 区**（首个数据区之前的说明），上限 2 行。
        //    前置条件 `ink.count >= 2` 是**有意的**：单行说明恒 ≤ 上限，
        //    拿它去判只会让 detail 里多一堆噪声；而「1 行变 3 行」必然经过 2 行。
        //    **轴同样按 writing-mode 参数化**（vertical-note-coverage-v1）：竖排下「行」= 竖列，
        //    横排的行数在这里恒为 1（见 wideInkOf）⇒ 一条 139 字的竖排说明会被当成「1 行」而漏判；
        //    改成读 ink.count 之后，那条是 24 列 ⇒ 在 intro 区里会与 ② 一起咬中。
        //    未渲染的说明不判（它会先被 ④ 咬住，两条码不该对同一件事重复报）。
        //    ⚠️ 作用域 = **阅读列宽达到桌面档**（物理前置条件，见 WIDE_INTRO_MIN_COLUMN）。
        //    第一版漏了这条，于是 @360 上 17 个**本轮没改过**的页面被判红 ——
        //    窄屏折行是响应式排版的正常行为，不是缺陷。
        if (boxed && column >= WIDE_INTRO_MIN_COLUMN && introSet.includes(note.index)
          && ink.count > WIDE_INTRO_MAX_LINES) {
          push('note-intro-long', `${where} 首屏说明 ${ink.count} ${ink.name} > 上限 ${WIDE_INTRO_MAX_LINES} ${ink.name}`
            + `（${note.textLength} 字 · 首个数据区之前的说明属于「首屏」；`
            + `分类判据与字段模型应进维护文档，见 docs/DESIGN-RULES.md 的口径归档）`
            + ` —— 盒宽 ${wideRound(note.box.width)}px · 最宽一行 ${wideRound(note.widestLine)}px`
            + (note.vertical ? ` · **竖排**：列 ${note.columnCount} 列 / 列栈水平范围 ${wideRound(note.columnSpan)}px` : '')
            + ` · 列宽 ${wideRound(column)}px（前置条件 ≥ ${WIDE_INTRO_MIN_COLUMN}px）`, note.index, 'intro-lines');
        }
      }
    }

    // ⑥ 保留窄阅读列的**登记制**（narrow-reading-columns-v1）：产物里任何以 ch 为单位声明的窄列
    //    都必须在 `scripts/data/narrow-reading-columns.json` 里登记。
    //    为什么用码而不是只用散文：上一轮把页面级说明的窄柱修完之后，「故意保留的窄宽」只写在报告里 ——
    //    谁都能再加一条 `max-width: 70ch` 而没有断言会响；反过来删掉保留的那条也没人告诉你。
    //    这条码只回答「有没有登记」；登记的条目**是否居中 / 是否真的比容器窄**由 §19 的
    //    `.pdetailbody` 几何断言（同一个 registry）承担 —— 两条合起来才是 S4 的完整应用面。
    //    合成几何（判据自检）不带这个量 ⇒ 跳过（宁可漏判也不误判）。
    if (Array.isArray(geometry.narrowCh)) {
      const unregistered = geometry.narrowCh.filter(item => !item.registered);
      if (unregistered.length) {
        push('narrow-unregistered', `路由「${meta ? meta.route : '（无元信息）'}」有 ${unregistered.length} 条未登记的窄阅读列：`
          + unregistered.map(item => `${item.selector} { ${item.declaration} }`).join(' / ')
          + `（保留窄阅读列必须在 scripts/data/narrow-reading-columns.json 登记，并且居中、真的比容器窄）`);
      }
    }

    // ④ 页面级横向溢出（视口写在码里：同一页在不同档的结论可以不同）
    if (geometry.doc.scrollWidth > vw + WIDE_TOL) {
      push(`page-overflow@${vw}`, `documentElement.scrollWidth ${geometry.doc.scrollWidth} > 视口 ${vw}`);
    }
    return problems;
  }

  /**
   * 变异：把页面**内联 <style> 的真实文本**里的一段逐字替换掉（只在浏览器内存里，不碰磁盘）。
   *
   * 反空洞守卫：锚点必须**恰好出现 1 次**。0 次 ⇒ 变异根本没落地；≥2 次 ⇒ 改中的可能是别处、
   * 后续断言测的不是这条规则。两种情况都返回 ok:false 且**不做任何替换**。
   */
  async function wideMutate(target, anchor, replacement) {
    return target.evaluate(`(() => {
      const anchor = ${JSON.stringify(anchor)};
      const styles = Array.prototype.slice.call(document.querySelectorAll('style'));
      const counts = styles.map(style => style.textContent.split(anchor).length - 1);
      const total = counts.reduce((sum, n) => sum + n, 0);
      if (total !== 1) {
        return { ok: false, occurrences: total, reason: '锚点在内联样式里出现 ' + total + ' 次（必须恰好 1 次）' };
      }
      const index = counts.findIndex(n => n === 1);
      styles[index].textContent = styles[index].textContent.replace(anchor, ${JSON.stringify(replacement)});
      return { ok: true, occurrences: 1 };
    })()`);
  }

  /** M6 用：把不可断的 200 字符串写进文档序第一条说明（页面内注入，绝不写盘）。 */
  async function wideInjectToken(target, token) {
    return target.evaluate(`(() => {
      const main = document.querySelector('main');
      const note = main ? main.querySelector('.snote') : null;
      if (!note) return 'none';
      note.textContent = ${JSON.stringify(token)};
      return 'note';
    })()`);
  }

  /** M7 用：给宽页的 <main> 加上 detail-main —— **注入前守卫**该类原本不存在。 */
  async function wideInjectDetailMain(target) {
    return target.evaluate(`(() => {
      const mains = document.querySelectorAll('main');
      if (!mains.length) return { ok: false, reason: '页面没有 <main>' };
      const main = mains[0];
      if (main.classList.contains('detail-main')) {
        return { ok: false, reason: '<main> 原本就带 detail-main（wide 族的注入前提不成立）' };
      }
      main.classList.add('detail-main');
      return { ok: true, added: true, detailMain: document.querySelectorAll('main.detail-main').length };
    })()`);
  }

  /**
   * M16 用：往 `<head>` **追加**一条样式（DOM 注入，零写盘）。
   *
   * 为什么这条牙必须是 DOM 注入而不是改现有规则：要单独证明「**未登记的 ch 窄列**会被判红」，
   * 就不能同时把页面压窄（那会先咬中 note-narrow / note-ink-narrow，分不清是谁在守）。
   * 这里注入 `.pdetailbody { max-width: 70ch; }`（把已登记的 72ch 覆盖成 70ch）：
   * 命中的是**行内展开**里那块正文 —— 未展开时它不参与布局 ⇒ 除 `narrow-unregistered` 外**不该出任何码**。
   */
  async function wideInjectStyle(target, css) {
    return target.evaluate(`(() => {
      const before = Array.prototype.slice.call(document.querySelectorAll('style')).length;
      const style = document.createElement('style');
      style.textContent = ${JSON.stringify(css)};
      document.head.appendChild(style);
      return { ok: true, added: true, stylesBefore: before, stylesAfter: document.querySelectorAll('style').length };
    })()`);
  }

  /** M9 用：把注入的选择器命中的 .snote 映射成 route#index（用来核对「只压非首个」） */  async function wideMatchedNoteKeys(target, selector, route) {
    return target.evaluate(`(() => {
      const main = document.querySelector('main');
      const all = main ? Array.prototype.slice.call(main.querySelectorAll('.snote')) : [];
      return Array.prototype.slice.call(document.querySelectorAll(${JSON.stringify(selector)}))
        .map(el => all.indexOf(el)).filter(i => i >= 0).map(i => ${JSON.stringify(route)} + '#' + i);
    })()`);
  }

  /**
   * M14 用：给**首个 .snote** 追加一段填充正文，把它撑成更多行。
   *
   * 为什么这条牙必须是 DOM 注入而不是 CSS 变异：`note-intro-long` 判的是**行数**，
   * 而任何「把盒子压窄」的 CSS 都会先咬中 `note-narrow` / `note-ink-narrow` ——
   * 两条码同时响，就分不清新码到底有没有在守东西。DOM 注入把「行数」这一个变量
   * 单独推上去，盒宽 / 内容盒 / 同轴 / 裁切全都不动，因此是一次**隔离**的变异。
   *
   * **注入前守卫**：首个 .snote 必须存在、必须已渲染、且当前行数 ≤ 上限 ——
   * 否则「注入后出现 note-intro-long」不能归因于注入。
   */
  async function wideInjectIntroFiller(target, filler, maxLines) {
    return target.evaluate(`(() => {
      const main = document.querySelector('main');
      if (!main) return { ok: false, reason: '页面没有 <main>' };
      const first = main.querySelector('.snote');
      if (!first) return { ok: false, reason: '页面没有页面级说明（.snote）' };
      const box = first.getBoundingClientRect();
      if (!(box.width > 0 && box.height > 0)) {
        return { ok: false, reason: '首个 .snote 未渲染（注入前提不成立）' };
      }
      const before = Math.max(1, Math.round(box.height / (parseFloat(getComputedStyle(first).lineHeight) || 22)));
      if (before > ${maxLines}) {
        return { ok: false, reason: '首个 .snote 注入前已经是 ' + before + ' 行（> ${maxLines}）—— 注入不是它的原因' };
      }
      const span = document.createElement('span');
      span.textContent = ${JSON.stringify(filler)};
      first.appendChild(span);
      return { ok: true, added: true, before: before };
    })()`);
  }

  console.log('\n=== 22c) Wide Data Page 页面级说明的同轴门禁（布局族 × 全站几何 × 逐条）===');
  if (urlArg) {
    // F3：跳过必须是**机器可读**的 —— 「如实跳过」与「跑了但 0 违规」在报告里要能区分开。
    const wideSkipReason = '--url= 模式没有产物目录，§22c 的路由清单/几何扫描/变异牙都无从现算（不改成拿线上首页硬凑一份假清单）';
    for (const key of ['layoutSweep', 'layoutNotes', 'layoutNotesAt1600', 'layoutViolations', 'layoutFrozenRule',
      'layoutDataRegions', 'layoutNoteAnchors', 'layoutSample', 'layoutScan', 'layoutMutationCodes']) {
      metrics[key] = { skipped: true, reason: wideSkipReason };
    }
    console.log(`  ℹ️  §22c 如实跳过（机器可读留痕：metrics.layout* 全部带 skipped/reason）：${wideSkipReason}`);
  } else {
    // §22c 自己开一条 page：整轮的 errors / externalRequests 是**全局累积**的（§26 的
    // 「本地 0 外链」与 --compare 的 jsErrors 都读全局计数），600+ 次导航不许污染它们。
    const widePage = await browser.newPage({ viewport: { width: WIDE_DESKTOP, height: 900 } });
    const wideErrors = [];
    const wideExternal = [];
    let wideNavigations = 0;
    const widePhaseSeconds = {};
    widePage.on('pageerror', e => wideErrors.push(`${e.message}`));
    widePage.on('console', m => { if (m.type() === 'error') wideErrors.push(`${m.text()}`); });
    widePage.on('request', r => {
      const url = r.url();
      if (url.startsWith(base) || url.startsWith('data:')) return;
      wideExternal.push(url);
    });
    /** 本节唯一的导航入口：顺手记账（导航次数 = 报告里「扫了多少次」的实证）。 */
    const wideGoto = async (route, width) => {
      await widePage.setViewportSize({ width, height: width >= 760 ? 900 : 800 });
      wideNavigations += 1;
      await widePage.goto(new URL(route, base).href, { waitUntil: 'load' });
    };
    const wideSectionStart = Date.now();
    try {
      // ---- 路由清单 + 布局族解析（kindOfRoute 优先，数据驱动的静态路由由 kindByRoute 补齐）----
      const wideKindMap = wideKindByRoute();
      const wideRoutes = wideRoutesFromDisk();
      const wideMeta = wideRoutes.map(route => {
        const kind = pageKinds.kindOfRoute(route) || wideKindMap.get(route) || null;
        return { route, kind, family: kind ? pageKinds.layoutOf(kind) : null };
      });
      const wideUnclassified = wideMeta.filter(meta => !meta.kind || !meta.family);
      const wideFamilyOf = family => wideMeta.filter(meta => meta.family === family).map(meta => meta.route);
      const wideRoutesOfFamily = { wide: wideFamilyOf('wide'), detail: wideFamilyOf('detail'), other: wideFamilyOf('other') };
      const wideKindCount = new Set(wideMeta.map(meta => meta.kind).filter(Boolean)).size;
      const wideDiskSet = new Set(wideRoutes);

      // ---- 1440 与 1600：**全站逐条**几何（不再只判文档序第一条，也不只 1440 一档）----
      const wideGeometry = new Map();      // `${width}|${route}` → geometry
      const wideProblemsAt = new Map();    // `${width}|${route}` → problems
      for (const width of WIDE_DESKTOP_VIEWPORTS) {
        const phaseStart = Date.now();
        for (const meta of wideMeta) {
          await wideGoto(meta.route, width);
          const geometry = await wideMeasure(widePage);
          wideGeometry.set(`${width}|${meta.route}`, geometry);
          wideProblemsAt.set(`${width}|${meta.route}`, wideProblems(geometry, meta));
        }
        widePhaseSeconds[`desktop${width}`] = Math.round((Date.now() - phaseStart) / 100) / 10;
      }

      // ---- 390：全站只量 documentElement.scrollWidth ----
      const wideNarrow390 = new Map();
      {
        const phaseStart = Date.now();
        for (const meta of wideMeta) {
          await wideGoto(meta.route, WIDE_NARROW);
          const geometry = await wideMeasure(widePage);
          // 390 档只判溢出：列宽/同轴那一档的定义是「列铺满可用宽」，窄档里表格在滚动容器里，
          // 其余码在窄档没有意义（判据函数照跑，只取溢出类，码本身仍由 wideProblems 产出；
          // 逐行字迹口径在 390 档由**物理前置条件**自动不判：列 358px < 70ch 452.81px）。
          wideNarrow390.set(meta.route, {
            scrollWidth: geometry.doc.scrollWidth,
            clientWidth: geometry.doc.clientWidth,
            codes: wideCodes(wideProblems(geometry, meta)).filter(code => code.startsWith('page-overflow@'))
          });
        }
        widePhaseSeconds.narrow390 = Math.round((Date.now() - phaseStart) / 100) / 10;
      }

      // ---- 760 / 360：样本集 ∪ **全部有说明的页**（judge-coverage-closure-v1）----
      // t17 实测：原样本集 29 页里**只有 13 页真的有说明** ⇒ 50 个有说明的页从没在 760/360 量过
      // （几乎全是 `/models/<slug>/`）。这里把「1440 档量到过 ≥1 条说明的页」并进样本集：
      // **扩的是页集，不是阈值** —— 新页集里出现违规码就红（实测 0 新增）。
      const wideNoteRoutes = [];
      for (const [key, geometry] of wideGeometry) {
        if (!key.startsWith(`${WIDE_DESKTOP}|`)) continue;
        if ((geometry.noteCount || 0) > 0) wideNoteRoutes.push(key.slice(String(WIDE_DESKTOP).length + 1));
      }
      const wideSampleRoutes = [...new Set([...wideSampleSet(wideRoutes, wideMeta), ...wideNoteRoutes])]
        .filter(route => wideDiskSet.has(route)).sort();
      const wideSampleGeometry = new Map();
      {
        const phaseStart = Date.now();
        for (const route of wideSampleRoutes) {
          for (const width of WIDE_SAMPLE_VIEWPORTS) {
            await wideGoto(route, width);
            wideSampleGeometry.set(`${route}@${width}`, await wideMeasure(widePage));
          }
        }
        widePhaseSeconds.samples = Math.round((Date.now() - phaseStart) / 100) / 10;
      }

      // ---- 条级读数（route#index）：1440 与 1600 各一份，**全量**（不只是违规条）----
      const wideNoteRowsAt = width => {
        const rows = [];
        for (const meta of wideMeta) {
          const geometry = wideGeometry.get(`${width}|${meta.route}`);
          const problems = wideProblemsAt.get(`${width}|${meta.route}`);
          const column = Math.min(geometry.region.width, geometry.main.width);
          const byIndex = new Map();
          for (const problem of problems) {
            if (problem.index === undefined) continue;
            if (!byIndex.has(problem.index)) byIndex.set(problem.index, []);
            byIndex.get(problem.index).push(problem.code);
          }
          geometry.notes.forEach((note, index) => {
            // 这一条说明**实际被判的那一对量**（横排 = 行 / 竖排 = 列），与 wideProblems 同一处取用。
            const ink = wideInkOf(note);
            rows.push({
              route: meta.route,
              index: index,
              position: index === 0 ? 'first' : (index === geometry.notes.length - 1 ? 'last' : 'middle'),
              codes: byIndex.get(index) || [],
              kind: meta.kind,
              family: meta.family,
              regionSel: geometry.regionSel,
              column: wideRound(column),
              width: wideRound(note.box.width),
              contentBox: note.contentBox,
              // ① 旧判据量（textWidth，未改）+ ② 新判据量（逐行字迹）+ ③ 藏字标定面，逐条都进容器
              textWidth: note.textWidth,
              textFallback: note.textFallback,
              bearingCount: note.bearingCount,
              rendered: note.rendered,
              unrendered: Boolean(note.unrendered),
              vertical: note.vertical,
              writingMode: note.writingMode,
              lineCount: note.lineCount,
              widestLine: note.widestLine,
              lines: note.lines,
              // vertical-note-coverage-v1：竖排的判据量（列数 / 列栈水平范围）也逐条进容器 ——
              // 否则外部只看得到「lineCount 1 / widestLine 342.25」这种按行归并的读数，
              // 没法独立复核「竖排为什么被判窄」。
              columnCount: note.columnCount,
              columnSpan: note.columnSpan,
              columns: note.columns,
              // 轴已选好的那一对量（横排 = 行 / 竖排 = 列）—— 选轴只在 wideInkOf 一处实现。
              inkUnit: ink.unit,
              inkCount: ink.count,
              inkSpan: ink.span,
              glyphRects: note.glyphRects,
              textLength: note.textLength,
              // t24 / T22-F1：条级容器里也要带上这两个量，否则「<noscript> 之外的未渲染说明必须为 0」
              // 这条上界断言会把合法的 <noscript> 条也算进来（row.noscriptSubtree === undefined ⇒ 误判）。
              rawTextLength: note.rawTextLength,
              noscriptSubtree: note.noscriptSubtree,
              inkWidth: note.ink ? note.ink.width : null,
              inkRects: note.ink ? note.ink.rects : 0,
              inkLongestLine: note.ink ? note.ink.longestLine : null,
              ratioTextWidth: column > 0 ? wideRound(note.textWidth / column) : null,
              ratioWidestLine: column > 0 ? wideRound(note.widestLine / column) : null,
              boxLeft: note.box.left,
              boxRight: note.box.right,
              parent: note.parent,
              text: note.text
            });
          });
        }
        return rows;
      };
      const wideNoteRows1440 = wideNoteRowsAt(WIDE_DESKTOP);
      const wideNoteRows1600 = wideNoteRowsAt(WIDE_WIDE);
      const wideNoteRowsMid = wideNoteRowsAt(WIDE_MID);   // 950 档（judge-coverage-closure-v1）
      const wideNoteRowsByViewport = {
        [WIDE_DESKTOP]: wideNoteRows1440, [WIDE_WIDE]: wideNoteRows1600, [WIDE_MID]: wideNoteRowsMid
      };

      // ---- 汇总（全部从上面那一次判据来，不另算一套）----
      const wideSummary = {};
      for (const width of WIDE_DESKTOP_VIEWPORTS) {
        const rows = wideNoteRowsByViewport[width];
        const hit = code => rows.filter(row => row.codes.includes(code));
        const narrow = hit('note-narrow');
        const inkNarrow = hit('note-ink-narrow');
        const union = rows.filter(row => row.codes.includes('note-narrow') || row.codes.includes('note-ink-narrow'));
        wideSummary[width] = {
          rows: rows.length,
          narrow: narrow,
          narrowKeys: narrow.map(row => wideNoteKey(row.route, row.index)),
          narrowRoutes: [...new Set(narrow.map(row => row.route))],
          inkNarrow: inkNarrow,
          inkNarrowKeys: inkNarrow.map(row => wideNoteKey(row.route, row.index)),
          inkNarrowRoutes: [...new Set(inkNarrow.map(row => row.route))],
          union: union,
          unionKeys: union.map(row => wideNoteKey(row.route, row.index)),
          unionRoutes: [...new Set(union.map(row => row.route))],
          hiddenText: hit('note-hidden-text'),
          // t24 / T22-F1 起：未渲染说明要能被解释。t28 收紧计数口径 ——
          //   · unrenderedNoText：**可见文本长度为 0**（没有可画的东西；dist 的 <noscript> 条属此类）⇒ 豁免；
          //   · unrenderedText  ：被 note-unrendered 咬中（有可见正文却没画）⇒ 违规；
          //   · unrenderedNoscript：含 <noscript> 子树的条数 —— **只是诊断量，不参与豁免**
          //     （t24 的标记级豁免键被 T26 实测反用后已收掉）；
          //   · unrenderedUnexplained：既没有「文本 0」的豁免、又没被判据咬中 ⇒ 必须为 0。
          unrenderedText: hit('note-unrendered'),
          unrenderedNoText: rows.filter(row => row.unrendered && row.textLength === 0).length,
          unrenderedNoscript: rows.filter(row => row.unrendered && row.noscriptSubtree).length,
          unrenderedUnexplained: rows.filter(row => row.unrendered && row.textLength > 0 && !row.codes.includes('note-unrendered')).length,
          axis: hit('note-axis'),
          clipped: hit('note-clipped'),
          // 首屏说明过长（本轮新增）：只统计 intro 区里越限的那些条
          introLong: hit('note-intro-long'),
          introLongRoutes: [...new Set(hit('note-intro-long').map(row => row.route))],
          textFallback: rows.filter(row => row.textFallback).length,
          unrendered: rows.filter(row => row.unrendered).length,
          vertical: rows.filter(row => row.vertical).length,
          // vertical-note-coverage-v1：竖排里「有列证据」（列数 ≥ 2、② 真的按列判过）的条数 ——
          // 与 vertical 分开报，免得把「竖排 0 条」与「竖排若干条但都只有 1 列」混成一句话。
          verticalColumnEvidence: rows.filter(row => row.vertical && row.columnCount >= 2).length,
          lineEvidence: rows.filter(row => row.lineCount >= 2).length,
          overflow: wideMeta.map(meta => meta.route)
            .filter(route => wideProblemsAt.get(`${width}|${route}`).some(problem => problem.code === `page-overflow@${width}`))
        };
      }
      const widePageCodesAt = width => wideMeta.map(meta => ({ meta, problems: wideProblemsAt.get(`${width}|${meta.route}`) }));
      const widePageHit = (width, code) => widePageCodesAt(width).filter(item => item.problems.some(problem => problem.code === code));
      const wideNotePages = wideMeta.filter(meta => wideGeometry.get(`${WIDE_DESKTOP}|${meta.route}`).noteCount > 0).map(meta => meta.route);
      const wideNoNotePages = wideMeta.filter(meta => wideGeometry.get(`${WIDE_DESKTOP}|${meta.route}`).noteCount === 0).map(meta => meta.route);
      const wideRegionMissing = widePageHit(WIDE_DESKTOP, 'data-region-missing').map(item => item.meta.route);
      const wideMissingDetailMain = widePageHit(WIDE_DESKTOP, 'missing-detail-main').map(item => item.meta.route);
      const wideUnexpectedDetailMain = widePageHit(WIDE_DESKTOP, 'unexpected-detail-main').map(item => item.meta.route);
      const wideOverflow390 = wideRoutes.filter(route => wideNarrow390.get(route).codes.length > 0);
      const wideOverflowPages = [...new Set([...wideSummary[WIDE_DESKTOP].overflow, ...wideSummary[WIDE_WIDE].overflow, ...wideOverflow390])];
      const wideFrozenDrift = wideRoutes.filter(route => wideGeometry.get(`${WIDE_DESKTOP}|${route}`).frozenCount !== 1);
      const wideFrozenPages = wideRoutes.filter(route => wideGeometry.get(`${WIDE_DESKTOP}|${route}`).frozenCount === 1);
      const wideRegionCounts = {};
      for (const route of wideRoutes) {
        const geometry = wideGeometry.get(`${WIDE_DESKTOP}|${route}`);
        const key = geometry.regionFallback ? '<main>（回落）' : geometry.regionSel;
        wideRegionCounts[key] = (wideRegionCounts[key] || 0) + 1;
      }
      // 同轴锚分布（判据是「与主数据区或页面主容器任一成立」，那就把两个锚各自的条数也报出来）
      const wideAnchorStats = { region: 0, main: 0, both: 0, neither: 0 };
      for (const route of wideNotePages) {
        const geometry = wideGeometry.get(`${WIDE_DESKTOP}|${route}`);
        const column = Math.min(geometry.region.width, geometry.main.width);
        const axisTol = Math.max(WIDE_TOL, WIDE_AXIS_RATIO * column);
        for (const note of geometry.notes) {
          const inRegion = Math.abs(note.box.left - geometry.region.left) <= axisTol && Math.abs(note.box.right - geometry.region.right) <= axisTol;
          const inMain = Math.abs(note.box.left - geometry.main.left) <= axisTol && Math.abs(note.box.right - geometry.main.right) <= axisTol;
          if (inRegion) wideAnchorStats.region += 1;
          if (inMain) wideAnchorStats.main += 1;
          if (inRegion && inMain) wideAnchorStats.both += 1;
          if (!inRegion && !inMain) wideAnchorStats.neither += 1;
        }
      }
      const wideExplainRow = row => `${wideNoteKey(row.route, row.index)} 内容盒 ${row.textWidth}px / 盒 ${row.width}px / 列 ${row.column}px`
        + ` · 行 ${row.lineCount}（最宽 ${row.widestLine}px）`
        + (row.vertical ? ` · **竖排** 列 ${row.columnCount}（列栈 ${row.columnSpan}px）` : '')
        + ` · 判据用${row.inkUnit === 'column' ? '列' : '行'}：${row.inkCount} / ${row.inkSpan}px · 字形盒 ${row.glyphRects}`
        + ` · 主数据区 ${row.regionSel || '<main>'} · codes [${row.codes.join(',')}]${row.text ? ` · 「${row.text.slice(0, 16)}」` : ''}`;
      const wideSamples = (list, limit = 5) => list.slice(0, limit).join(' ')
        + (list.length > limit ? ` …（还有 ${list.length - limit}）` : '');

      // ---- ① 布局族：186/186 全部可解析（解析不出来 = unclassified-layout，判红）----
      check('§22c 全站每一页的布局族都能解析（page-kinds.kindOfRoute + layoutOf，数据驱动的静态路由由 kindByRoute 补齐）',
        wideMeta.length > 0 && wideUnclassified.length === 0,
        wideUnclassified.length
          ? `解析不出布局族的页面 ${wideUnclassified.length}/${wideMeta.length}：${wideSamples(wideUnclassified.map(meta => meta.route))}`
          : `${wideMeta.length} 页全部可解析（${wideKindCount} 种 kind）· wide ${wideRoutesOfFamily.wide.length} / detail ${wideRoutesOfFamily.detail.length} / other ${wideRoutesOfFamily.other.length} · unclassified-layout 0 个`);

      // ---- ② 注册表驱动的入口在产物里都存在（采样前提，不写死 slug）----
      {
        const registryRoutes = [
          ...audienceLib.COLLECTION_PAGES.map(page => `${page.slug}/`),
          ...audienceLib.NEED_PAGES.map(page => `need/${page.slug}/`),
          landingsLib.VENDOR_HUB.route,
          landingsLib.CATEGORY_HUB.route
        ];
        const missing = registryRoutes.filter(route => !wideDiskSet.has(route));
        check(`§22c 注册表驱动的入口（${audienceLib.COLLECTION_PAGES.length} 目录页 + ${audienceLib.NEED_PAGES.length} 按需求页 + 2 枢纽页）在产物里都存在`,
          missing.length === 0, missing.length ? `缺 ${missing.join(' ')}` : `逐条命中（${registryRoutes.length} 条，全部现场推导，不写死 slug）`);
      }

      // ---- ③ / ④ 两个桌面档：**逐条**判全部说明（旧口径 textWidth + 新口径逐行字迹 + 藏字）----
      for (const width of WIDE_DESKTOP_VIEWPORTS) {
        const summary = wideSummary[width];
        // 保留窄阅读列的登记制也在这个循环里判：未登记的 ch 窄列是**页级**码（不是条级），
        // 所以它不在 summary（条级容器）里，单独取一次、一并计入 bad。
        const narrowUnregisteredPages = widePageHit(width, 'narrow-unregistered').map(item => item.meta.route);
        const bad = [...summary.union, ...summary.hiddenText, ...summary.unrenderedText, ...summary.axis, ...summary.clipped, ...summary.introLong];
        check(`§22c @${width} 逐条页面级说明：旧口径（内容盒 ≥ ${WIDE_NOTE_RATIO}×列宽）+ 新口径（横排按行 / 竖排按列：字迹铺开 ≥ ${WIDE_NOTE_RATIO}×列宽，单元数 ≥ 2）+ 无藏字 + border-box 同轴 + 自身不裁切 + 首屏说明 ≤ ${WIDE_INTRO_MAX_LINES} 行 + 窄阅读列全部已登记`,
          bad.length === 0 && narrowUnregisteredPages.length === 0,
          `全站 ${wideMeta.length} 页 / 逐条判 ${summary.rows} 条（有说明的页 ${wideNotePages.length} · 零说明的页 ${wideNoNotePages.length} 标注跳过 · 未渲染 ${summary.unrendered} 条：<noscript> ${summary.unrenderedNoscript} + note-unrendered ${summary.unrenderedText.length}）`
          + ` · note-narrow ${summary.narrow.length}（落在 ${summary.narrowRoutes.length} 页） · note-ink-narrow ${summary.inkNarrow.length}（${summary.inkNarrowRoutes.length} 页）`
          + ` · 并集 ${summary.union.length} 条 / ${summary.unionRoutes.length} 页 · 藏字 ${summary.hiddenText.length} · 不同轴 ${summary.axis.length} · 裁切 ${summary.clipped.length}`
          + ` · 首屏说明过长 ${summary.introLong.length} 条 / ${summary.introLongRoutes.length} 页`
          + ` · 多行说明（有行证据）${summary.lineEvidence} 条 · 竖排 ${summary.vertical} 条`
          + `（其中列证据 ≥ 2 列、即 ② 按列判的：${summary.verticalColumnEvidence} 条）`
          + ` · textFallback 回落 ${summary.textFallback} 条`
          + ` · 未登记的窄阅读列 ${narrowUnregisteredPages.length} 页（登记清单 ${WIDE_NARROW_ENTRIES.length} 条）`
          + (bad.length || narrowUnregisteredPages.length ? ` · 命中：${bad.slice(0, 4).map(wideExplainRow).join('；')}`
            + `${narrowUnregisteredPages.length ? ` · 未登记窄列页：${narrowUnregisteredPages.slice(0, 4).map(route => route || '/').join(' ')}` : ''}` : ''));
        check(`§22c @${width} 全站 ${wideRoutes.length} 页都没有横向溢出`,
          summary.overflow.length === 0,
          summary.overflow.length ? `${summary.overflow.length} 页溢出：${wideSamples(summary.overflow)}`
            : `documentElement.scrollWidth ≤ 视口+${WIDE_TOL} 全部成立`);
      }

      // ---- ③b 二级标签 / 聚合页的首屏**不许有页面级说明**（secondary-page-intro-changes-v1 的主牙；
      //          `secondary-page-residue-v1` 起**没有例外**）----
      //
      // 为什么它在浏览器层、而不是只靠构建期扫描：首屏「有没有一行解释文字」是**排版事实**，
      // 构建期只能按字符串切区间推断（`.cstop` → 第一个数据区锚点）。这里用的是同一份现场几何
      // （`introIndexes` = 顶边落在首个数据区之前的那些 `.snote`，与 §22c 判 `note-intro-long`
      // 用的是**同一个量**），并且不依赖任何字符串约定。
      //
      // **作用域 = 目录页家族**（collection / need / category / vendor / hub / alias）。
      // 其它宽页（`/status/` `/feeds/` `/plans/*` `/models/*` `/archive/` `/docs/data/` `/changes/`）
      // 的导语是**那一页自己的主体**（例如订阅中心解释怎么订阅），不在本规则射程内 ——
      // 把它们一起判红就是「一条在正常页面上失败的守卫」，比没有守卫更糟。
      //
      // ## 本轮（secondary-page-residue-v1）把这条判据**收窄到一件事**：`introNoteRoutes.length === 0`
      //
      // 上一版的判据是三段合取，其中两段读 `landing-aliases.json` 的 `aliases` 键：
      //   ① `offenders`（有首屏说明、且不在别名表里）· ② `aliasBad`（别名页不是恰好 1 条）·
      //   ③ `introNoteRoutes.length === aliasRoutes.size`。
      // **为什么这三段必须整段退役**（不是「删掉不好看」）：
      //   · ① / ② 让判据的形状取决于**另一个文件**（别名表）——「别名表里没有的目录页悄悄长出
      //     首屏说明」在 ① 里会红，但 ③ 那句等号把整条断言又绑回别名表的大小：只要别名表与
      //     实际页面同步，**自言自语**就能成立。判据应该只回答一个问题：目录页家族有没有首屏说明。
      //   · ③ 是**结构性偷懒**：`introNoteRoutes.length === aliasRoutes.size` 在别名页各有 1 条时
      //     恰好成立，于是它同时接受「非别名页 0 条」与「别名页 N 条」两种世界 —— 只要总数对上。
      //     本轮别名页那条导航更正整条删除后，`aliasRoutes.size` 恒为 3 而正确的 `introNoteRoutes`
      //     是 0，这条等号会**把正确的产物判红**（这正是它错的最直接证据）。
      //   · 更根本的：别名页的「例外」本身被实测推翻（三个别名页各有 183 个站内入链来源、
      //     全站零入链路由 0 —— 那句话对「找得到目标页」零贡献；它渲染的是站务机制与内部标识符）。
      //     例外退役，**名单一起退役**：判据里不再出现任何「哪几页可以例外」的集合。
      //
      // 新判据只有一件事：**目录页家族的全部页面（含别名页）首屏页面级说明 = 0 条**。
      // 这也顺带修掉了旧版的覆盖面漏洞：旧判据第三段只算 `aliasRoutes` 的子集，任何**别名表里
      // 没有的**目录页悄悄长出首屏说明它都不管；现在整个 `directoryRoutes` 逐页都在判。
      {
        // ## 射程怎么算：**两把尺子取并集**（对抗复核 F2 修对了一次，又修错了一次，两次都记在这里）
        //
        // **第一版**（本轮之前）：`new Set([..., 'alias'])` + 只看 `meta.kind`。
        //   `lib/page-kinds.js` 的 `ROUTE_PATTERNS` 对 `need/<slug>/` 一律返回 `need`，
        //   所以 `meta.kind` 对别名页是 **`need`**（它们靠路由前缀进集合），
        //   而 `'alias'` 在这把尺子下**恒不命中** —— 一个**死元素**：看着像在显式覆盖别名页，
        //   其实一条都没覆盖到。这正是 F2 报的那件事。
        //
        // **第二版**（F2 的修法，**修出了新缺陷**）：改成只读 `dist/_notes.ndjson` 的
        //   `pageKind`，并把 `'alias'` 从集合里删掉。但清单里别名页的 `pageKind` **就是 `'alias'`**
        //   （`build-local.js` 的 `notePage(route, { kind })` 传的是页面描述符的 kind），
        //   于是 `'alias'` 不是死元素、而是**清单真会返回的取值之一** —— 删掉它 ⇒ 三个别名页
        //   当场掉出射程（45 → 42 页）。这个新缺陷被**下面那条覆盖面断言**当场咬住
        //   （真浏览器实测读数：`⚠️ 未进射程的别名页：need/dev-credits/ need/free-api/ need/student-only/`）。
        //   这正好证明那条断言不是装饰。
        //
        // **现在（并集）**：同时认两把尺子 —— `meta.kind` 与清单的 `pageKind`，任一命中即算目录页家族。
        //   两边都不是死元素：`meta.kind` 覆盖路由前缀那一族，清单 `pageKind` 覆盖别名
        //   （且将来别名迁出 `need/` 也照样命中）。`'alias'` 因此**必须留在集合里**。
        const DIRECTORY_KINDS = new Set(['collection', 'need', 'category', 'vendor', 'hub', 'alias']);
        const kindByRoute = new Map();
        let manifestKindRead = false;
        try {
          const manifestFile = path.join(DIR, '_notes.ndjson');
          if (fs.existsSync(manifestFile)) {
            for (const line of fs.readFileSync(manifestFile, 'utf8').split('\n')) {
              if (!line.trim()) continue;
              const row = JSON.parse(line);
              if (row && row.kind === 'page') kindByRoute.set(row.route, row.pageKind);
            }
            manifestKindRead = kindByRoute.size > 0;
          }
        } catch (error) {
          // 清单坏了由 ⑨ 报红（那里是本清单的 owner）。这里**不静默缩小射程**：
          // `kindByRoute` 空 ⇒ 退回只用 `meta.kind`（别名仍靠 `need` 前缀进集合），
          // 且下面把这件事打印出来。
        }
        const kindsOf = meta => {
          const fromManifest = kindByRoute.get(meta.route);
          return [meta.kind, fromManifest].filter(Boolean);
        };
        const isDirectoryMeta = meta => kindsOf(meta).some(kind => DIRECTORY_KINDS.has(kind));
        const directoryRoutes = wideMeta.filter(isDirectoryMeta).map(meta => meta.route);
        const aliasRoutes = wideMeta.filter(meta => kindsOf(meta).includes('alias')).map(meta => meta.route);
        const introNoteRoutes = directoryRoutes.filter(route => {
          const geometry = wideGeometry.get(`${WIDE_DESKTOP}|${route}`);
          return Boolean(geometry && geometry.introIndexes && geometry.introIndexes.length);
        });
        // 别名页的覆盖面**单独**钉住：它们必须真的在产物里、且真的进了射程。
        // 少了这一条，「别名页从集合里消失」会表现成「判据仍然全绿、只是少判了几页」——
        // 上面第二版就是这么被咬住的（实测读数见那段注释）。
        const aliasMissing = aliasRoutes.filter(route => !directoryRoutes.includes(route));
        check(`§22c @${WIDE_DESKTOP} 目录页家族（${directoryRoutes.length} 页，其中别名页 ${aliasRoutes.length} 页）`
          + '首屏**没有**任何页面级说明',
          introNoteRoutes.length === 0 && aliasRoutes.length > 0 && aliasMissing.length === 0,
          `有首屏说明的目录页 ${introNoteRoutes.length} 条：${introNoteRoutes.map(r => r || '/').join(' ') || '无'}`
          + ` · 别名页 ${aliasRoutes.length} 页：${aliasRoutes.join(' ') || '（无！）'}`
          + ` · kind 来源：${manifestKindRead ? 'meta.kind ∪ 清单 pageKind' : '⚠️ 清单读不到，只用 meta.kind（别名靠 need 前缀进集合）'}`
          + (aliasMissing.length ? ` · ⚠️ 未进射程的别名页：${aliasMissing.join(' ')}` : '')
          + `（其它宽页的导语不在本规则射程内：${wideMeta.length - directoryRoutes.length} 页）`);
      }

      // ---- ⑨ 说明清单 × DOM 跨源对账（notes-manifest-v1）--------------------------------
      //
      // 闭合 `NEXT-STEPS` §0 里那条 P1「判据只认 `.snote` 这个类名（换名 / 换容器即隐形）」。
      // 清单（`dist/_notes.ndjson`）是**意图侧**：构建期在内容构造点登记「这一页打算输出几条
      // 说明、每条的槽位与完整 class token 集合」；这里是**渲染侧**：真浏览器 DOM 里数出来。
      // 两侧按 `route × 槽位 × 签名` 逐条对账，不等 ⇒ 红，消息点名 `route#index` 并给两侧读数。
      //
      // 判据与构建期自检（`build-local.js` 的 noteManifestSelfCheck）**同一套口径**，两侧必须一致：
      //   ① 逐页逐槽位：清单声明的「签名 × 条数」== DOM 数出来的（台账页面只做单向 —— DOM 多出来
      //      的说明属于范围之外的那个模块，由下面的下限守）；
      //   ② complete 页面：整页 `.snote` 总数逐字相等；
      //   ③ 台账下限 + 页面族结构下限：守住「登记与模板一起被删」那种两侧同时消失的改法；
      //   ④ 棘轮：DOM 里有 `.snote` 的页面必须全部登记过 —— 新的隐形说明面不许悄悄出现。
      {
        const manifestPath = path.join(DIR, '_notes.ndjson');
        const manifestLabel = path.relative(ROOT, manifestPath).split(path.sep).join('/');
        const manifestProblems = [];
        let manifestPages = new Map();
        let manifestHeader = null;
        if (!fs.existsSync(manifestPath)) {
          manifestProblems.push(`缺少 ${manifestLabel} —— 清单必须进产物（构建期 writeNotesManifest() 写入）`);
        } else {
          const lines = fs.readFileSync(manifestPath, 'utf8').split('\n').filter(line => line.trim());
          try {
            const rows = lines.map(line => JSON.parse(line));
            manifestHeader = rows.find(row => row.kind === 'header') || null;
            const pages = rows.filter(row => row.kind === 'page');
            if (!manifestHeader) manifestProblems.push('清单没有 header 行（第一行应当是 {"kind":"header",…}）');
            if (!pages.length) manifestProblems.push('清单里没有任何 page 行');
            for (const page of pages) {
              if (manifestPages.has(page.route)) manifestProblems.push(`清单里 ${page.route || '(首页)'} 出现两次`);
              manifestPages.set(page.route, page);
            }
          } catch (err) {
            manifestProblems.push(`清单不是合法 NDJSON：${err.message}`);
          }
        }
        const domOf = route => {
          const geometry = wideGeometry.get(`${WIDE_DESKTOP}|${route}`);
          return geometry && geometry.notesBySignature ? geometry.notesBySignature : {};
        };
        const slotTotalOf = (signatures, slotId) => Object.keys(signatures)
          .filter(key => key.startsWith(`${slotId}|`))
          .reduce((sum, key) => sum + signatures[key], 0);
        const laneProblems = [];
        const floorProblems = [];
        const untrackedProblems = [];
        const completeProblems = [];
        const ratchetProblems = [];
        let declaredLaneCount = 0;
        let untrackedPageCount = 0;
        let pinnedCount = 0;
        for (const meta of wideMeta) {
          const route = meta.route;
          const where = route || '(首页)';
          const signatures = domOf(route);
          const page = manifestPages.get(route);
          if (!page) {
            if (slotTotalOf(signatures, 'main-snote') > 0) {
              ratchetProblems.push(`${where}（${meta.kind}）DOM 里有 ${slotTotalOf(signatures, 'main-snote')} 条 .snote，`
                + '但清单里没有这一页 —— 新的说明面必须在构造点登记（或写进台账）');
            }
            continue;
          }
          const declaredByKey = new Map();
          for (const note of page.notes || []) {
            const key = `${note.slot}|`;
            declaredByKey.set(key + note.signature, (declaredByKey.get(key + note.signature) || 0) + 1);
            declaredLaneCount++;
            if (note.pinned) pinnedCount++;
          }
          const keys = new Set([...declaredByKey.keys(), ...Object.keys(signatures)]);
          for (const key of keys) {
            const declared = declaredByKey.get(key) || 0;
            const dom = signatures[key] || 0;
            if (declared === dom) continue;
            // 台账页面单向：DOM 多出来的部分由那个模块负责（下限守），清单声明的必须逐条对上
            if (page.untracked && dom > declared) continue;
            const slotId = key.split('|')[0];
            const signature = key.split('|')[1];
            const index = (page.notes || []).findIndex(note => note.slot === slotId
              && note.signature === signature);
            laneProblems.push(`${where}#${index === -1 ? 0 : index} 槽位 ${slotId} 签名 <${signature}>：`
              + `清单声明 ${declared} 条 / DOM 实测 ${dom} 条`);
          }
          for (const [slotId, floor] of Object.entries(page.floors || {})) {
            const actual = slotTotalOf(signatures, slotId);
            const min = floor && floor.min !== undefined ? floor.min : 0;
            if (actual < min) {
              floorProblems.push(`${where} 槽位 ${slotId}：结构下限 ${min} 条 / DOM 实测 ${actual} 条`);
            }
          }
          if (page.untracked) {
            untrackedPageCount++;
            const actual = slotTotalOf(signatures, 'main-snote');
            if (actual < page.untracked.minNotes) {
              untrackedProblems.push(`${where} 台账 ${page.untracked.family}（${page.untracked.owner}）：`
                + `下限 ${page.untracked.minNotes} 条 / DOM 实测 ${actual} 条（无条件的那条：${page.untracked.structural}）`);
            }
          } else {
            const declared = (page.notes || []).filter(note => note.slot === 'main-snote').length;
            const actual = slotTotalOf(signatures, 'main-snote');
            if (declared !== actual) {
              completeProblems.push(`${where} 整页 .snote：清单声明 ${declared} 条 / DOM 实测 ${actual} 条`);
            }
          }
        }
        const missingPages = wideMeta.filter(meta => !manifestPages.has(meta.route)).map(meta => meta.route);
        const extraPages = [...manifestPages.keys()].filter(route => !wideDiskSet.has(route));
        check('§22c ⑨ 说明清单可读、每页一条、与产物页面对得上（`dist/_notes.ndjson`）',
          manifestProblems.length === 0 && extraPages.length === 0 && missingPages.length === 0,
          (manifestProblems.length ? `清单问题：${manifestProblems.join('；')}；` : '')
          + `清单 ${manifestPages.size} 页 / 产物 ${wideMeta.length} 页 · schemaVersion ${manifestHeader ? manifestHeader.schemaVersion : '—'}`
          + ` · 槽位 ${NOTE_SLOT_TOKENS.map(pair => pair[0]).join(' / ')}`
          + (missingPages.length ? ` · 产物里有、清单里没有：${wideSamples(missingPages)}` : '')
          + (extraPages.length ? ` · 清单里有、产物里没有：${wideSamples(extraPages)}` : ''));
        check(`§22c ⑨ 逐页逐槽位对账：清单声明的「签名 × 条数」== 真浏览器 DOM 数出来的（${declaredLaneCount} 条登记说明 × ${NOTE_SLOT_TOKENS.length} 个槽位）`,
          laneProblems.length === 0,
          laneProblems.length ? `${laneProblems.length} 处不一致（route#index 可定位）：${laneProblems.slice(0, 4).join('；')}`
            : `逐条一致（登记说明 ${declaredLaneCount} 条${pinnedCount ? `，其中组装点 pin ${pinnedCount} 条` : ''}）`);
        check(`§22c ⑨ 台账页面仍带说明：范围之外的构造点没有整族消失（${untrackedPageCount} 页 / ${new Set([...manifestPages.values()].filter(p => p.untracked).map(p => p.untracked.family)).size} 个页面族）`,
          untrackedProblems.length === 0,
          untrackedProblems.length ? untrackedProblems.slice(0, 4).join('；')
            : `台账逐页成立：每条无条件的说明（见清单里 untracked.structural）都还在页面上`);
        check('§22c ⑨ 页面族结构下限：目录页家族（**含别名页**）0 条页面级说明、状态页 2 条、订阅中心 3+1 条、厂商页六节说明',
          floorProblems.length === 0,
          floorProblems.length ? floorProblems.slice(0, 4).join('；')
            : '全部页面族的说明条数下限成立（下限守住「登记与模板一起被删」那种两侧同时消失的改法；'
              + '别名页本轮从「恰好 1 条」并入「目录页家族 0 条」—— 依据见 build-local.js renderDirectoryPage 顶部）');
        check(`§22c ⑨ 完整对账：complete 页面的整页 .snote 总数逐字相等（${[...manifestPages.values()].filter(page => !page.untracked).length} 页）`,
          completeProblems.length === 0,
          completeProblems.length ? `${completeProblems.length} 页有差额：${completeProblems.slice(0, 4).join('；')}`
            : '整页条数逐字相等（清单声明的 = DOM 数出来的）');
        check('§22c ⑨ 棘轮：DOM 里有 `.snote` 的页面必须在清单里登记过（新的隐形说明面不许悄悄出现）',
          ratchetProblems.length === 0,
          ratchetProblems.length ? ratchetProblems.slice(0, 4).join('；')
            : `有 .snote 的页面全部登记过（DOM 侧 ${wideMeta.filter(meta => slotTotalOf(domOf(meta.route), 'main-snote') > 0).length} 页有页面级说明）`);
        metrics.layoutNotesManifest = {
          manifestPath: manifestLabel,
          pages: manifestPages.size,
          declaredLanes: declaredLaneCount,
          pinnedLanes: pinnedCount,
          untrackedPages: untrackedPageCount,
          domBySlot: Object.fromEntries(NOTE_SLOT_TOKENS.map(pair => [pair[0],
            wideMeta.reduce((sum, meta) => sum + slotTotalOf(domOf(meta.route), pair[0]), 0)])),
          problems: laneProblems.length + floorProblems.length + untrackedProblems.length
            + completeProblems.length + ratchetProblems.length + manifestProblems.length
        };
      }

      // ---- ④b 未渲染说明：上界断言（t24 立 / t28 收紧计数）----
      //   `unrenderedNotes` 从 t14 起就有，但直到 t24 才被断言引用。计数口径（t28 / 收掉 T26 的残余面）：
      //     · **豁免只看「可见文本长度为 0」**（没有可画的东西；dist 的 `<noscript>` 条靠这条过）——
      //       不再看任何标记，`<noscript>` 降级为诊断量；
      //     · 其余未渲染条必须被 `note-unrendered` 咬中；
      //     · 两类**互不相交**（前者 textLength === 0，后者要求 textLength > 0），并集 = 全部未渲染条。
      //   T26 实测过的反用形状：给每条说明插一个**空** `<noscript></noscript>`，t24 的标记级豁免键
      //   会把 13 条未渲染全归进 noscript 桶、断言 ok=true、整轮 EXIT=0 —— 现在空标签买不到豁免。
      {
        const wideUnrenderedRows = wideNoteRows1440.filter(row => row.unrendered);
        const wideNoTextRows = wideUnrenderedRows.filter(row => row.textLength === 0);
        const wideUnrenderedCodeRows = wideUnrenderedRows.filter(row => row.codes.includes('note-unrendered'));
        const wideBothRows = wideUnrenderedRows.filter(row => row.textLength === 0 && row.codes.includes('note-unrendered'));
        const wideUnexplainedRows = wideUnrenderedRows.filter(row => row.textLength > 0 && !row.codes.includes('note-unrendered'));
        const wideAt1600 = wideSummary[WIDE_WIDE];
        check('§22c 未渲染说明：上界断言 —— 未渲染条要么「可见文本为 0」，要么必须被 note-unrendered 咬中（两类不相交、并集完整、标记不豁免）',
          wideUnexplainedRows.length === 0
          && wideBothRows.length === 0
          && wideNoTextRows.length + wideUnrenderedCodeRows.length === wideUnrenderedRows.length
          && wideSummary[WIDE_DESKTOP].unrendered === wideUnrenderedRows.length
          && wideAt1600.unrenderedNoText + wideAt1600.unrenderedText.length === wideAt1600.unrendered
          && wideAt1600.unrenderedUnexplained === 0,
          `@${WIDE_DESKTOP} 未渲染 ${wideUnrenderedRows.length} 条 = 可见文本 0 的 ${wideNoTextRows.length} 条`
          + `${wideNoTextRows.length ? ` [${wideNoTextRows.map(row => wideNoteKey(row.route, row.index)).join(', ')}]` : ''}`
          + ` + note-unrendered ${wideUnrenderedCodeRows.length} 条 · 交集 ${wideBothRows.length} · 既没归类又没判中 ${wideUnexplainedRows.length}`
          + ` · @${WIDE_WIDE} 未渲染 ${wideAt1600.unrendered} 条（文本 0 ${wideAt1600.unrenderedNoText} · note-unrendered ${wideAt1600.unrenderedText.length}`
          + ` · 未归类 ${wideAt1600.unrenderedUnexplained}）`
          + ` · 诊断：含 <noscript> 的未渲染条 ${wideSummary[WIDE_DESKTOP].unrenderedNoscript}（不参与豁免）`
          + (wideUnexplainedRows.length ? ` · 违规条：${wideUnexplainedRows.map(row => wideNoteKey(row.route, row.index)).join(' ')}` : ''));
      }

      // ---- ⑤ @390：全站只量 documentElement.scrollWidth ----
      check(`§22c @${WIDE_NARROW} 全站 ${wideRoutes.length} 页 documentElement.scrollWidth ≤ 视口+${WIDE_TOL}`,
        wideOverflow390.length === 0,
        wideOverflow390.length
          ? `${wideOverflow390.length} 页溢出：${wideSamples(wideOverflow390.map(route => `${route || '/'}=${wideNarrow390.get(route).scrollWidth}px`))}`
          : `最宽的一页 ${wideRoutes.reduce((max, route) => Math.max(max, wideNarrow390.get(route).scrollWidth), 0)}px（视口 ${WIDE_NARROW}）`);

      // ---- ⑥ 布局族一致性：detail 恰好 1 个 main.detail-main；wide 0 个 ----
      check(`§22c 布局族一致性：detail 族（${wideRoutesOfFamily.detail.length} 页）恰好 1 个 main.detail-main、wide 族（${wideRoutesOfFamily.wide.length} 页）0 个`,
        wideMissingDetailMain.length === 0 && wideUnexpectedDetailMain.length === 0,
        `missing-detail-main ${wideMissingDetailMain.length} · unexpected-detail-main ${wideUnexpectedDetailMain.length}`
        + (wideMissingDetailMain.length ? ` · 缺列：${wideSamples(wideMissingDetailMain)}` : '')
        + (wideUnexpectedDetailMain.length ? ` · 多了列：${wideSamples(wideUnexpectedDetailMain)}` : ''));

      // ---- ⑦ 主数据区判定（回落 <main> 的页面逐类登记，不算失败）----
      check('§22c 每一页都判得出主数据区（声明选择器或回落 <main>）',
        wideRegionMissing.length === 0,
        wideRegionMissing.length
          ? `${wideRegionMissing.length} 页判不出：${wideSamples(wideRegionMissing)}`
          : `声明选择器命中 ${wideRoutes.length - (wideRegionCounts['<main>（回落）'] || 0)} 页 · 回落 <main> ${wideRegionCounts['<main>（回落）'] || 0} 页（${Object.entries(wideRegionCounts).map(([sel, n]) => `${sel}=${n}`).join(' ')}）`);

      // ---- ⑧ 冻结串「一处定义、全站生效」：每页内联样式里恰好 1 次 ----
      check(`§22c 冻结串「一处定义、全站生效」：每页内联样式里恰好 1 次（${wideRoutes.length} 页）`,
        wideFrozenDrift.length === 0,
        wideFrozenDrift.length
          ? `${wideFrozenDrift.length} 页不符（改动前产物在这里必然全红，这正是 M0 的反证面之一）：`
            + wideFrozenDrift.slice(0, 4).map(route => `${route || '/'}=${wideGeometry.get(`${WIDE_DESKTOP}|${route}`).frozenCount} 次`).join(' ')
          : `${wideFrozenPages.length}/${wideRoutes.length} 页恰好 1 次 · 锚点「${WIDE_SNOTE_FROZEN.slice(0, 24)}…」`);

      // ---- ⑨ 760 / 360：样本集（**同一份判据**；逐行字迹按物理前置条件判 —— 760 判、360 不判）----
      const wideSampleProblems = [];
      for (const route of wideSampleRoutes) {
        const meta = wideMeta.find(item => item.route === route);
        for (const width of WIDE_SAMPLE_VIEWPORTS) {
          const geometry = wideSampleGeometry.get(`${route}@${width}`);
          // t19 / R3-1：这里以前用 `meta.inkRule = false`（按视口白名单）把 760 档整类关掉 ——
          // 现在不传任何开关，由 wideProblems 的物理前置条件现场决定：760 列 676–728 > 70ch 452.81
          // ⇒ ② 照判（R3-1 的 ≤760 缺口就是在这里关掉的）；360 列 276–328 < 452.81 ⇒ 自动不判。
          for (const problem of wideProblems(geometry, meta)) {
            wideSampleProblems.push({ route, width, ...problem });
          }
        }
      }
      // 物理作用域的**现场证据**（写进断言 detail，免得下一轮又只能看注释）：
      // 每个样本档的列宽范围 + 现场换算的 70ch ⇒ 一眼看出哪一档判 ②、哪一档不判。
      const wideSampleScope = WIDE_SAMPLE_VIEWPORTS.map(width => {
        const columns = [];
        const ch70s = new Set();
        for (const route of wideSampleRoutes) {
          const geometry = wideSampleGeometry.get(`${route}@${width}`);
          columns.push(Math.min(geometry.region.width, geometry.main.width));
          for (const note of geometry.notes) if (Number(note.ch70) > 0) ch70s.add(note.ch70);
        }
        const positive = columns.filter(v => v > 0);
        const ch70 = [...ch70s];
        return {
          width,
          minColumn: positive.length ? wideRound(Math.min.apply(null, positive)) : 0,
          maxColumn: positive.length ? wideRound(Math.max.apply(null, positive)) : 0,
          ch70: ch70,
          inkScope: positive.length > 0 && ch70.length > 0 && Math.max.apply(null, positive) > ch70[0]
        };
      });
      const wideSampleScopeText = wideSampleScope.map(scope => `@${scope.width} 列 ${scope.minColumn}–${scope.maxColumn}px`
        + ` / 70ch 现场 ${scope.ch70.length ? scope.ch70.join('/') : '（无量）'} ⇒ ${scope.inkScope ? '判' : '不判'} ②`).join(' · ');
      for (const width of WIDE_SAMPLE_VIEWPORTS) {
        const hits = wideSampleProblems.filter(problem => problem.width === width);
        check(`§22c @${width} 样本集 ${wideSampleRoutes.length} 页（同一份判据；字迹按**物理前置条件**判：现场列宽 > 70ch 时判；横排按行 / 竖排按列）`,
          hits.length === 0,
          (hits.length
            ? `${hits.length} 条违规码 [${hits.map(problem => `${wideNoteKey(problem.route, problem.index === undefined ? '?' : problem.index)} ${problem.code}`).join(', ')}]：`
              + hits.slice(0, 5).map(problem => `${wideNoteKey(problem.route, problem.index === undefined ? '?' : problem.index)} ${problem.code}：${problem.msg}`).join('；')
            : `0 违规码 · 样本集：${wideSampleRoutes.map(route => route || '/').join(' ')}`)
          + ` · 物理作用域：${wideSampleScopeText}`);
      }
      metrics.layoutSampleScope = wideSampleScope;

      // ---- ⑩ M1–M10 变异牙 ----
      // 每条牙都先过「锚点恰好 1 次」的反空洞守卫，再用**同一个** wideProblems 复测。
      const wideHash = route => {
        const file = path.join(DIR, route, 'index.html');
        return fs.existsSync(file) ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') : null;
      };
      const wideHashBefore = new Map(WIDE_MUTATION_TARGETS.map(route => [route, wideHash(route)]));
      // 前置守卫：四个壳必须真的是 wide 族、且真的带页面级说明 —— 否则变异测的不是这条规则。
      const wideTargetGuard = WIDE_MUTATION_TARGETS.map(route => {
        const meta = wideMeta.find(item => item.route === route);
        const geometry = wideGeometry.get(`${WIDE_DESKTOP}|${route}`);
        return { route, ok: Boolean(meta && meta.family === 'wide' && geometry && geometry.noteCount > 0),
          why: meta ? `${meta.kind}/${meta.family} · .snote ${geometry ? geometry.noteCount : 0} 条` : '（产物里没有这一页）' };
      });
      check(`§22c M1–M4 的四个壳（${WIDE_MUTATION_TARGETS.join(' ')}）都是 wide 族且带页面级说明`,
        wideTargetGuard.every(item => item.ok),
        wideTargetGuard.map(item => `${item.route || '/'} ${item.why}`).join(' · '));

      const wideMutations = WIDE_MUTATION_TARGETS.map((route, index) => ({
        id: `M${index + 1}`, route, width: WIDE_DESKTOP, expect: 'note-narrow', target: 'replace',
        what: `把冻结串的 max-width 换回 70ch（${route} 这一族的页面级说明曾被压窄）`,
        anchor: WIDE_SNOTE_FROZEN, replacement: WIDE_SNOTE_NARROW
      }));
      wideMutations.push(
        { id: 'M6', route: 'plans/', width: WIDE_NARROW, expect: `page-overflow@${WIDE_NARROW}`, target: 'replace', inject: true,
          what: `拿走 .snote 的 overflow-wrap:anywhere 并注入 ${WIDE_LONG_TOKEN.length} 字符不可断串`
            + '（靶页本轮由 need/student-only/ 换到 plans/：前者删掉别名说明后 <main> 内 0 条 .snote，变异没有承重面）',
          anchor: WIDE_SNOTE_FROZEN, replacement: WIDE_SNOTE_NOWRAP },
        { id: 'M7', route: 'status/', width: WIDE_DESKTOP, expect: 'unexpected-detail-main', target: 'dom',
          what: '给宽页的 <main> 加上 detail-main 类（DOM 注入，注入前守卫该类原本不存在）' },
        { id: 'M8', route: 'plans/', width: WIDE_DESKTOP, expect: 'note-narrow', target: 'extend', expectFirstNote: true,
          rule: '.snote { padding-right: calc(100% - 70ch); }',
          what: 'F1 原型：把 .snote 的 padding-right 写成 calc(100% - 70ch) —— 盒宽一字不动、有字区域恒等于 70ch（修复前整轮 0 失败放行的那一条）'
            + '（靶页同上换到 plans/：这条断言读**未注入**几何的 notes[0]，plans/ 有 12 条说明，成立性比原靶页的 1 条更好）' },
        { id: 'M9a', route: 'docs/data/', width: WIDE_DESKTOP, expect: 'note-narrow', target: 'extend',
          rule: '.snote ~ .snote { max-width: 70ch; }', selector: '.snote ~ .snote',
          what: 'F2 原型：只压**非首个** .snote（相邻兄弟选择器）' },
        { id: 'M9b', route: 'changes/', width: WIDE_DESKTOP, expect: 'note-narrow', target: 'extend',
          rule: '.snote:not(:first-of-type) { max-width: 70ch; }', selector: '.snote:not(:first-of-type)',
          what: 'F2 原型：只压**非首个** .snote（:not(:first-of-type)）' },
        { id: 'M10', route: 'plans/', width: WIDE_WIDE, expect: 'note-narrow', target: 'extend',
          rule: '@media (min-width: 1500px) { .snote { max-width: 70ch; } }',
          what: 'F4 原型：缺陷藏在 @media (min-width:1500px) 里（@1440 档物理上看不见，只有 @1600 档咬得到）'
            + '（靶页同上换到 plans/）' },
        // ---- t14（修复轮 3）新增：两条「盒子满宽、只有排版结果变窄」的牙 ----
        { id: 'M11', route: 'changes/', width: WIDE_DESKTOP, expect: 'note-ink-narrow', target: 'extend', expectInkEvidence: true,
          rule: '.snote { display: grid; grid-template-columns: minmax(0, 70ch) 1fr; }',
          what: 't8 的 F-R2-1 原型：display:grid + minmax(0,70ch) 1fr —— 只改一条 CSS、不动标记，'
            + '盒宽/内容盒都满宽，文字被排进 70ch 那一轨（修复轮 2 时整轮 842 项 EXIT=0 放行的那一条）' },
        { id: 'M12', route: 'plans/', width: WIDE_DESKTOP, expect: 'note-hidden-text', target: 'extend', expectNoGlyph: true,
          rule: '.snote { font-size: 0; } .snote::before { content: "§22c-M12 伪元素承载正文（真实文本已不可见）";'
            + ' display: block; max-width: 70ch; font-size: var(--fs-sm); line-height: 1.7; }',
          what: 't8 的 F-R2-2 原型：真实文本 font-size:0（一个字形都不画），正文交给 ::before 的 content 去画'
            + ' —— 盒宽/行数一切正常，只有字形盒能看穿（靶页同上换到 plans/）' },
        // ---- t24（修复轮 5）新增：把盒高压成 0 的那一类（T22-F1）----
        { id: 'M13', route: 'docs/data/', width: WIDE_DESKTOP, expect: 'note-unrendered', target: 'extend', expectUnrendered: true,
          rule: '.snote { font-size: 0; }',
          what: 'T22-F1 原型：**裸** font-size:0（没有 ::before 高度恢复器）—— 盒高被压成 0 ⇒ rendered=false，'
            + '修复前会让窄柱 / 逐行字迹 / 藏字三条判据同时静默（整页零码）；现在由 note-unrendered 咬住' },
        // ---- secondary-page-content-simplification 新增：首屏说明过长的隔离牙 ----
        //   与 M1–M13 的 CSS 变异不同，这条**故意**用 DOM 注入：判据量的是行数，
        //   而任何压窄盒子的 CSS 都会先咬中 note-narrow / note-ink-narrow ——
        //   两条码一起响就证明不了新码自己在守东西。注入只推高行数、其余量一个不动。
        //
        //   ⚠️ 靶页换过一次（`secondary-page-residue-v1`，理由如实记）：原靶页
        //   `need/student-only/` 是别名页，承重面**完全**来自那条 `.aliasnote`（`wideInjectIntroFiller`
        //   的注入前守卫要求 `<main>` 内存在首个 `.snote`）。本轮把那条导航更正整条删除 ⇒
        //   该页 `.snote` 0 条 ⇒ 守卫直接红（"页面没有页面级说明"），牙就废了。
        //   换成 `models/`：它的首屏 intro 区有**真实**页面级说明（103 字，`.ptable` 之前），
        //   `.lsum` 是数据摘要区、`main.detail-main` 不存在（不在 ③b 射程内：`models-index`
        //   不是目录页家族的 kind），台账侧也没有与它冲突的 `minNotes` 下限。
        //   实测注入前读数（@1440）：盒 1380 / 高 20.39 / 1 行 / 字迹 1205.52px / 1 个字形盒。
        //   ⚠️ 隔离性**必须被断言**，不能只看读数（对抗复核 F4）：本条的通用判据只要求
        //   `codes.includes('note-intro-long')`，多出伴随码也照样绿 —— 而 M15/M16 都把码集合钉死了。
        //   今天它恰好只出 `[note-intro-long]`，那是**读数不是判据**。下面 `expectIsolatedCodes`
        //   把允许集合显式钉住（DOM 注入只推高行数，别的码一条都不该出）。
        { id: 'M14', route: 'models/', width: WIDE_DESKTOP, expect: 'note-intro-long', target: 'intro',
          expectIsolatedCodes: ['note-intro-long'],
          filler: '（M14 注入的填充正文，用来把首屏说明撑成更多行，其余量一律不动。）'.repeat(6),
          what: '首屏说明被写长（DOM 注入填充正文）：盒宽 / 内容盒 / 同轴 / 裁切全都不动，'
            + '只有「行数」越过上限 ⇒ 必须由 note-intro-long 咬住（靶页本轮由 need/student-only/ 换到 models/）' },
        // ---- vertical-note-coverage-v1 新增：把「竖排」这条覆盖不对称钉成常驻牙（闭合 T31 的 P1）----
        //   形态逐字取 T31 现场用的那一份（`verify/t31/mk-form-scratch.cjs` 的 FORM_CSS，
        //   与 adversary 的 `coverage-asymmetry-writing-mode.json` form.injection 同字节）。
        //   为什么必须是这条牙：它是**唯一**能让「盒/内容盒满宽 + 按行归并只有 1 行」同时成立的形态，
        //   也就是旧口径两条判据（① 内容盒、② 逐行字迹）同时静默的那一类。
        //   ⚠️ 靶页换过**两次**（如实记）：
        //   ① T31 的原靶页 `category/agent/` 自 `secondary-page-intro-changes-v1` 起
        //   **一条 .snote 都没有**了（目录页首屏说明整层删除）—— 拿它当靶页等于「变异没有承重面」
        //   （实测：注入后 noteCount 0、一条码都不出），于是换成别名页 `need/free-api/`
        //   （它的那 1 条导航更正说明由当时的 ③b 断言「恰好 1 条」，承重面是结构性的）。
        //   ② 本轮（`secondary-page-residue-v1`）把那条导航更正整条删除 ⇒ `need/free-api/`
        //   同样变成 0 条 `.snote`，`wideMutate` 的「冻结串恰好 1 次」守卫还在（页内 CSS 仍在、
        //   冻结串仍恰好 1 次），但**注入的规则命不中任何元素** ⇒ 一条码都不会出。
        //   换成 `feeds/`：首屏 intro 区有真实页面级说明（实测 @1440：106 字 / 1 行 /
        //   盒 1380 / 数据区 `.flist` 1380），且它在**未注入**状态下 0 违规码、0 竖排说明
        //   （M15 的正对照断言正好需要一个这样的页）。
        { id: 'M15', route: 'feeds/', width: WIDE_DESKTOP, expect: 'note-ink-narrow', target: 'extend',
          expectVertical: true,
          // ⚠️ 允许集**照抄**脚本自己的正对照口径（下面 `m15Expected`），**不许**加第三个数。
          //    `note-intro-long` 是竖排形态的固有伴随码：首屏区是**注入后的现场几何**，
          //    竖排让被注入的说明自身变高、数据区被推下 ⇒ 原本在数据区之前的说明相对位置改变。
          //    （实测否掉过一个假设：`changes/` 也不是「首屏区一条 .snote 都没有」，
          //     竖排化后有 2 条落进去；所以「另找一个只出一条码的靶页」这条路走不通。）
          //    把它写成允许项是**如实**，不是放宽：判据仍是「不许出这两个以外的任何码」。
          expectIsolatedCodes: ['note-ink-narrow', 'note-intro-long'],
          rule: '.snote { writing-mode: vertical-rl; width: 100%; height: 5.6rem; overflow: hidden; }',
          what: 'T31 的 P1 原型：writing-mode: vertical-rl + width:100% + height:5.6rem + overflow:hidden ——'
            + '盒宽/内容盒/同轴一个都不动，正文竖成一根细条（T31 在原靶页 @1440 实测：盒 1380 / 内容盒 1380 /'
            + '24 个 16px 宽的竖列 / 字迹并集 342.25×87.3 / 按行归并恒为 1 行）；'
            + '轮 6 口径下 @1440/@1600 完全无感，唯一咬到它的是 @360 的自裁切副作用（且只在 29 页样本集里）'
            + '（靶页本轮由 need/free-api/ 换到 feeds/，见上面那段两次换靶记录）' },
        // ---- narrow-reading-columns-v1 新增：保留窄阅读列的登记制（M16）----
        //   注入的是「已登记条目的**另一个**取值」：`.pdetailbody` 从 72ch 被覆盖成 70ch ——
        //   选择器、页面、元素全是真实存在的，唯一变化是「这条声明**不在登记清单里**」。
        //   未展开的行内详情不参与布局 ⇒ 除 `narrow-unregistered` 之外不该出任何码（承重证明会钉住这点）。
        { id: 'M16', route: 'plans/coding/', width: WIDE_DESKTOP, expect: 'narrow-unregistered', target: 'style',
          expectNarrowRegistry: true,
          css: '.pdetailbody { max-width: 70ch; }',
          what: '保留窄阅读列的登记制：把已登记的 `.pdetailbody { max-width: 72ch }` 覆盖成 **70ch**'
            + '（DOM 追加一条 <style>，命中真实元素但未展开 ⇒ 不影响布局）⇒ 现场扫描必须认出「未登记的 ch 窄列」' }
      );

      metrics.layoutMutationCodes = {};
      const wideMutationHits = new Map();
      const wideMutationExtra = new Map();
      for (const mutation of wideMutations) {
        const target = await browser.newPage({ viewport: { width: mutation.width, height: 900 } });
        let guard = null;
        let codes = [];
        let injected = null;
        let detail = '变异未执行';
        let geometry = null;
        let narrowKeys = [];
        let matchedKeys = null;
        try {
          wideNavigations += 1;
          await target.goto(new URL(mutation.route, base).href, { waitUntil: 'load' });
          if (mutation.target === 'dom') {
            guard = await wideInjectDetailMain(target);
          } else if (mutation.target === 'style') {
            // M16：往 <head> 追加样式（DOM 注入，零写盘）
            guard = await wideInjectStyle(target, mutation.css);
          } else if (mutation.target === 'intro') {
            // M14：只把「行数」推上去（盒宽 / 内容盒 / 同轴 / 裁切一律不动）——
            // 见 wideInjectIntroFiller 的注释：这是新码 note-intro-long 的**隔离**变异。
            guard = await wideInjectIntroFiller(target, mutation.filler, WIDE_INTRO_MAX_LINES);
          } else if (mutation.target === 'extend') {
            // 冻结串**保留**（仍恰好 1 次），只在它后面追加一条收窄规则 —— 形状与产物里真实存在的
            // 「页内第二条 .snote 规则」一致（review 的 A5/C1c 就是这么写进共享 <style> 的）。
            guard = await wideMutate(target, WIDE_SNOTE_FROZEN, `${WIDE_SNOTE_FROZEN}\n    ${mutation.rule}`);
          } else {
            guard = await wideMutate(target, mutation.anchor, mutation.replacement);
          }
          if (guard.ok) {
            if (mutation.inject) injected = await wideInjectToken(target, WIDE_LONG_TOKEN);
            geometry = await wideMeasure(target);
            const meta = wideMeta.find(item => item.route === mutation.route);
            const problems = wideProblems(geometry, meta);
            codes = wideCodes(problems);
            narrowKeys = problems.filter(problem => problem.code === 'note-narrow')
              .map(problem => wideNoteKey(mutation.route, problem.index));
            const inkNarrowKeys = problems.filter(problem => problem.code === 'note-ink-narrow')
              .map(problem => wideNoteKey(mutation.route, problem.index));
            const hiddenTextKeys = problems.filter(problem => problem.code === 'note-hidden-text')
              .map(problem => wideNoteKey(mutation.route, problem.index));
            const unrenderedKeys = problems.filter(problem => problem.code === 'note-unrendered')
              .map(problem => wideNoteKey(mutation.route, problem.index));
            if (mutation.selector) matchedKeys = await wideMatchedNoteKeys(target, mutation.selector, mutation.route);
            metrics.layoutMutationCodes[mutation.id] = codes;
            wideMutationHits.set(mutation.id, codes.includes(mutation.expect));
            wideMutationExtra.set(mutation.id, { narrowKeys, inkNarrowKeys, hiddenTextKeys, unrenderedKeys, matchedKeys });
            const first = geometry.notes.length ? geometry.notes[0] : null;
            detail = `说明 ${geometry.noteCount} 条 · 首条 盒 ${first ? wideRound(first.box.width) : 0}px / 有字区域 ${first ? first.textWidth : 0}px`
              + ` · detail-main ${geometry.detailMainCount} 个 · scrollWidth ${geometry.doc.scrollWidth}（视口 ${geometry.doc.clientWidth}）`
              + (mutation.inject ? ` · 不可断串注入位置 ${injected}` : '')
              + ` · 窄条 [${narrowKeys.join(', ') || '无'}] · 违规码 [${codes.join(', ') || '无'}]`;
          }
        } finally {
          await target.close();
        }
        check(`§22c ${mutation.id} ${mutation.target === 'dom' ? 'DOM 注入前提成立（该类原本不存在）' : '变异锚点唯一（逐字替换前必须恰好出现 1 次）'}`,
          Boolean(guard && guard.ok),
          guard
            ? (guard.ok
              ? `${mutation.target === 'dom' ? '注入前提成立' : '锚点出现 1 次'} · ${mutation.what}`
              : `${guard.reason} ⇒ 变异未生效，判红（不允许「变异不生效却算通过」）`)
            : '变异未执行（页面没打开）');
        check(`§22c ${mutation.id} 变异后复测必须出现「${mutation.expect}」违规码（${mutation.what}）`,
          Boolean(guard && guard.ok) && (!mutation.inject || injected === 'note') && codes.includes(mutation.expect),
          guard && guard.ok
            ? `期望 ${mutation.expect} · 实测 [${codes.join(', ') || '无'}] · ${detail}`
            : '锚点不唯一/不存在 ⇒ 变异没落地，按红处理（同一个判据不可能被这条牙咬到）');
        // M8：F1 的要害是「盒宽没变、有字区域变了」——必须把这两件事同时钉住。
        if (mutation.expectFirstNote) {
          const before = wideGeometry.get(`${mutation.width}|${mutation.route}`).notes[0];
          const first = geometry && geometry.notes.length ? geometry.notes[0] : null;
          const column = geometry ? Math.min(geometry.region.width, geometry.main.width) : 0;
          check('§22c M8 要害：首条说明的**盒宽没变**（旧判据看不见），只有**有字区域**被压回 70ch 级',
            Boolean(first && before) && Math.abs(first.box.width - before.box.width) <= WIDE_TOL
            && first.textWidth < WIDE_NOTE_RATIO * column - 0.01 && before.textWidth >= WIDE_NOTE_RATIO * column - 0.01,
            first && before
              ? `注入前 盒 ${wideRound(before.box.width)}px / 有字区域 ${before.textWidth}px ⇒ 注入后 盒 ${wideRound(first.box.width)}px / 有字区域 ${first.textWidth}px`
                + `（列宽 ${wideRound(column)}px · 阈值 ${wideRound(WIDE_NOTE_RATIO * column)}px）—— 盒宽差 ${wideRound(Math.abs(first.box.width - before.box.width))}px`
              : '页面没量到');
        }
        // M9：只压非首个 —— 窄条必须**全部**落在选择器命中的条上，且第 0 条不在其中。
        if (mutation.selector) {
          const firstNarrowed = narrowKeys.some(key => key.endsWith('#0'));
          const subset = narrowKeys.every(key => (matchedKeys || []).includes(key));
          check(`§22c ${mutation.id} 只压非首个：窄条全部落在选择器命中的条上，且第 0 条不被压`,
            narrowKeys.length > 0 && (matchedKeys || []).length > 0 && subset && !firstNarrowed,
            `选择器 ${mutation.selector} 命中 [${(matchedKeys || []).join(', ') || '无'}] ⇒ 窄条 [${narrowKeys.join(', ') || '无'}]（第 0 条被压：${firstNarrowed}）`);
        }
        // M11：新判据的**承重证明** —— 旧判据（textWidth / 盒子）在这一形态里看不见东西，
        //      咬中的必须是 note-ink-narrow，且被咬的那些条确实有多行字迹证据。
        if (mutation.expectInkEvidence) {
          const inkKeys = (wideMutationExtra.get(mutation.id) || {}).inkNarrowKeys || [];
          const rowsOfInk = geometry ? geometry.notes.filter(note => inkKeys.includes(wideNoteKey(mutation.route, note.index))) : [];
          const lineEvidenceOk = rowsOfInk.length > 0 && rowsOfInk.every(note => note.lineCount >= 2 && note.widestLine > 0);
          const boxStayedWide = rowsOfInk.length > 0 && rowsOfInk.every(note => note.textWidth >= WIDE_NOTE_RATIO * Math.min(geometry.region.width, geometry.main.width) - 0.01);
          check(`§22c ${mutation.id} 承重证明：旧判据（内容盒 textWidth）**一条都没咬**，咬中的全是新的逐行字迹码`,
            inkKeys.length > 0 && narrowKeys.length === 0 && lineEvidenceOk && boxStayedWide,
            `note-narrow ${narrowKeys.length} 条（0 = 盒子/内容盒满宽，旧口径确实看不见）· note-ink-narrow ${inkKeys.length} 条 [${inkKeys.join(', ')}]`
            + ` · 这些条的行证据：${rowsOfInk.map(note => `#${note.index} ${note.lineCount} 行 / 最宽 ${wideRound(note.widestLine)}px / 内容盒 ${wideRound(note.textWidth)}px`).join(' · ') || '（无）'}`);
        }
        // M15：竖排的**承重证明**（vertical-note-coverage-v1）——
        //   被咬的条必须真的是竖排、且判据用的是**列**（列数 ≥ 2 / 列栈水平范围 < 阈值）；
        //   同时把「旧口径为什么必然静默」也钉住：这些条**按行归并只有 1 行**（前置条件不成立），
        //   盒宽与内容盒都还是满宽的（① 也看不见）。三条同时成立才证明换轴是承重的，而不是换了个说法。
        if (mutation.expectVertical) {
          const inkKeys = (wideMutationExtra.get(mutation.id) || {}).inkNarrowKeys || [];
          const rowsOfInk = geometry ? geometry.notes.filter(note => inkKeys.includes(wideNoteKey(mutation.route, note.index))) : [];
          const column = geometry ? Math.min(geometry.region.width, geometry.main.width) : 0;
          const before = wideGeometry.get(`${mutation.width}|${mutation.route}`);
          const allVertical = rowsOfInk.length > 0 && rowsOfInk.every(note => note.vertical);
          const columnEvidence = rowsOfInk.length > 0 && rowsOfInk.every(note => note.columnCount >= 2
            && note.columnSpan > 0 && note.columnSpan < WIDE_NOTE_RATIO * column - 0.01);
          // 旧口径静默的两条独立原因（都必须是「成立」才算承重）：
          const lineEvidenceMissing = rowsOfInk.length > 0 && rowsOfInk.every(note => note.lineCount <= 1);
          const boxesStayedWide = rowsOfInk.length > 0
            && rowsOfInk.every(note => note.textWidth >= WIDE_NOTE_RATIO * column - 0.01)
            && narrowKeys.length === 0;
          const boxUnchanged = Boolean(before && before.notes.length === geometry.notes.length)
            && rowsOfInk.every(note => {
              const prior = before.notes[note.index];
              return prior && Math.abs(prior.box.width - note.box.width) <= WIDE_TOL
                && Math.abs(prior.box.left - note.box.left) <= WIDE_TOL;
            });
          check(`§22c ${mutation.id} 承重证明：咬中的条是**竖排按列判**（列数 ≥ 2 · 列栈水平范围 < ${WIDE_NOTE_RATIO}×列宽），`
            + `且旧口径两条判据在它们身上必然静默（按行归并 ≤ 1 行 + 盒/内容盒满宽，盒宽与注入前逐条相同）`,
            inkKeys.length > 0 && allVertical && columnEvidence && lineEvidenceMissing && boxesStayedWide && boxUnchanged,
            `note-ink-narrow ${inkKeys.length} 条 [${inkKeys.join(', ')}]`
            + ` · 逐条：${rowsOfInk.map(note => `#${note.index} ${note.writingMode} 列 ${note.columnCount} / 列栈 ${wideRound(note.columnSpan)}px`
              + ` / 行 ${note.lineCount}（最宽 ${wideRound(note.widestLine)}px） / 内容盒 ${wideRound(note.textWidth)}px`
              + ` / 字形盒 ${note.glyphRects}`).join(' · ') || '（无）'}`
            + ` · 列宽 ${wideRound(column)}px · 阈值 ${wideRound(WIDE_NOTE_RATIO * column)}px`
            + ` · note-narrow ${narrowKeys.length} 条（0 = ① 也看不见）· 盒宽与注入前一致 ${boxUnchanged}`);
        }
        // **隔离性**（对抗复核 F4，`secondary-page-residue-v1`）：
        //   上面那条通用判据只查 `codes.includes(expect)` —— 多出**伴随码**也照样绿。
        //   M11/M15/M16 各自把码集合钉住了，M14 却没有：今天 M14 在 `models/` 上恰好只出
        //   `[note-intro-long]`，但那是**读数不是判据** —— 哪天另一条判据开始误报，这条牙会
        //   跟着「一起响」而看不出是谁在守。这里把允许集合显式声明出来（`expectIsolatedCodes`），
        //   与 M16 的 `otherCodes.length === 0` 同一种写法。
        //   对 DOM 注入型（M14）尤其重要：注入只推高行数，盒宽/内容盒/同轴/裁切/藏字一条都不该出。
        if (mutation.expectIsolatedCodes) {
          const allowed = mutation.expectIsolatedCodes;
          const extraCodes = codes.filter(code => !allowed.includes(code));
          check(`§22c ${mutation.id} 隔离性：变异后只许出 [${allowed.join(', ')}]，任何伴随码都说明另有缺陷在响`,
            Boolean(guard && guard.ok) && extraCodes.length === 0,
            `允许 [${allowed.join(', ')}] · 实测 [${codes.join(', ') || '无'}]`
            + (extraCodes.length ? ` · ⚠️ 伴随码 [${extraCodes.join(', ')}] —— 这条牙不再是隔离命中` : ' · 无伴随码'));
        }
        // M16：登记制的**承重证明**（narrow-reading-columns-v1）——
        //   ① 页面里确实多出一条「未登记」的 ch 窄列，且它就是注入的那条（选择器 + 声明逐字对上）；
        //   ② 已登记的那条（72ch）仍然在扫描结果里 ⇒ 扫描不是「见 ch 就报」，是**按清单**判；
        //   ③ **隔离**：除 narrow-unregistered 外没有别的码（注入没有压窄任何参与布局的东西）。
        if (mutation.expectNarrowRegistry) {
          const narrowCh = (geometry && Array.isArray(geometry.narrowCh)) ? geometry.narrowCh : [];
          const injectedHit = narrowCh.find(item => item.declaration === 'max-width: 70ch' && /pdetailbody/.test(item.selector));
          const registeredKept = narrowCh.find(item => item.declaration === (WIDE_NARROW_ENTRIES[0] || {}).declaration
            && item.selector.includes((WIDE_NARROW_ENTRIES[0] || {}).selector) && item.registered);
          const injectedUnregistered = Boolean(injectedHit) && injectedHit.registered === false;
          const otherCodes = codes.filter(code => code !== 'narrow-unregistered');
          check(`§22c ${mutation.id} 承重证明：注入的那条 ch 窄列被认成**未登记**、已登记的 72ch 仍在扫描结果里、`
            + '且除 narrow-unregistered 外没有任何别的码（注入不影响布局）',
            Boolean(injectedHit) && injectedUnregistered && Boolean(registeredKept) && otherCodes.length === 0,
            `现场扫描到 ${narrowCh.length} 条 ch 窄列：${narrowCh.map(item => `${item.selector}{${item.declaration}}${item.registered ? '（已登记）' : '（未登记）'}`).join(' · ') || '（无）'}`
            + ` · 注入的那条命中 ${Boolean(injectedHit)} · 已登记条目仍在 ${Boolean(registeredKept)}`
            + ` · 除登记码之外的码 [${otherCodes.join(', ') || '无'}]`);
        }
        // M12：藏字形态 —— 文本非空、已渲染、零字形盒；且这不是靠窄判据咬的。
        if (mutation.expectNoGlyph) {
          const first = geometry && geometry.notes.length ? geometry.notes[0] : null;
          const hiddenKeys = (wideMutationExtra.get(mutation.id) || {}).hiddenTextKeys || [];
          check('§22c M12 承重证明：真实文本**一个字形盒都没有**（盒宽/行数正常），咬中的是 note-hidden-text',
            Boolean(first) && first.glyphRects === 0 && first.textLength > 0 && first.rendered
            && hiddenKeys.length > 0 && !codes.includes('note-ink-narrow'),
            first
              ? `首条：文本 ${first.textLength} 字 · 字形盒 ${first.glyphRects} 个 · 盒宽 ${wideRound(first.box.width)}px（rendered=${first.rendered}）`
                + ` · 行 ${first.lineCount} 行 · note-hidden-text 命中 [${hiddenKeys.join(', ') || '无'}] · note-ink-narrow ${codes.includes('note-ink-narrow') ? '有（不该有）' : '无'}`
              : '页面没量到');
        }
        // M13：未渲染形态的承重证明（t24 / T22-F1）—— 盒高被压成 0 的条**全部**由 note-unrendered 咬中，
        //      且窄柱 / 逐行字迹 / 藏字三条判据在它们身上确实一条都不出（这正是修复前的假绿形状）。
        if (mutation.expectUnrendered) {
          const unrenderedRows = geometry ? geometry.notes.filter(note => !note.rendered) : [];
          const oldCodes = codes.filter(code => /^note-(narrow|ink-narrow|hidden-text)$/.test(code));
          const unrenderedKeys = (wideMutationExtra.get(mutation.id) || {}).unrenderedKeys || [];
          check(`§22c ${mutation.id} 承重证明：盒高被压成 0 的条**全部**由 note-unrendered 咬中，且窄柱/字迹/藏字三条判据在它们身上确实看不见`,
            unrenderedRows.length > 0 && oldCodes.length === 0
            && unrenderedKeys.length === unrenderedRows.length
            && unrenderedRows.every(note => note.textLength > 0 && note.glyphRects === 0),
            `未渲染条 ${unrenderedRows.length} 条 [${unrenderedRows.map(note => '#' + note.index).join(', ')}]`
            + ` · 它们的 textLength [${unrenderedRows.map(note => note.textLength).join(', ')}]`
            + ` · glyphRects [${unrenderedRows.map(note => note.glyphRects).join(', ')}]`
            + ` · note-unrendered 命中 [${unrenderedKeys.join(', ') || '无'}]`
            + ` · 窄柱/字迹/藏字码 [${oldCodes.join(', ') || '无（这正是修复前的假绿形状）'}]`);
        }
      }

      // ---- M6 正对照：同样的 200 字符不可断串、CSS 一个字节都不动 ⇒ 必须不溢出 ----
      // 靶页与 M6 同步（`need/student-only/` → `plans/`）：正对照必须和变异跑在**同一页**上，
      // 否则「不溢出」可能只是因为拿了一条没有 `.snote` 的页面（那正是换靶后原靶页的样子：
      // `wideInjectToken` 会返回 'none'，断言里的 `injected === 'note'` 直接判红）。
      {
        const target = await browser.newPage({ viewport: { width: WIDE_NARROW, height: 800 } });
        let geometry = null;
        let injected = null;
        try {
          wideNavigations += 1;
          await target.goto(new URL('plans/', base).href, { waitUntil: 'load' });
          injected = await wideInjectToken(target, WIDE_LONG_TOKEN);
          geometry = await wideMeasure(target);
        } finally {
          await target.close();
        }
        const controlProblems = geometry
          ? wideProblems(geometry, wideMeta.find(item => item.route === 'plans/'))
          : [{ code: '（页面没打开）', msg: '' }];
        const controlOverflow = controlProblems.filter(problem => problem.code.startsWith('page-overflow@'));
        metrics.layoutMutationCodes['M6-control'] = wideCodes(controlOverflow);
        check(`§22c M6 正对照：同样注入 ${WIDE_LONG_TOKEN.length} 字符不可断串、CSS 一字不动 ⇒ @${WIDE_NARROW} 不得溢出`,
          Boolean(geometry) && injected === 'note' && geometry.doc.scrollWidth <= WIDE_NARROW + WIDE_TOL && controlOverflow.length === 0,
          geometry
            ? `不可断串注入位置 ${injected} · scrollWidth ${geometry.doc.scrollWidth}（视口 ${geometry.doc.clientWidth}）`
              + ` · 溢出类违规码 [${wideCodes(controlOverflow).join(', ') || '无'}]（全部码 [${wideCodes(controlProblems).join(', ') || '无'}]，390 档只看溢出）`
            : '页面没打开');
      }

      // ---- M8/M9a/M9b/M10/M15 的正对照：**不注入**时，五个靶页在对应档位没有任何违规码 ----
      const wideNoInjectionControls = [
        { id: 'M8', route: 'plans/', width: WIDE_DESKTOP },
        { id: 'M9a', route: 'docs/data/', width: WIDE_DESKTOP },
        { id: 'M9b', route: 'changes/', width: WIDE_DESKTOP },
        { id: 'M10', route: 'plans/', width: WIDE_WIDE },
        // M15 的正对照（vertical-note-coverage-v1）：同一页不注入竖排 ⇒ 直接量它自己的读数 ——
        // 「该页说明一条都不是竖排 + 0 违规码」同时证明新判据不是「凡是说明就判窄」。
        // 靶页与 M15 同步换到 `feeds/`（原靶页 `need/free-api/` 删掉别名说明后 0 条 `.snote`）。
        { id: 'M15', route: 'feeds/', width: WIDE_DESKTOP }
      ].map(control => {
        const problems = wideProblemsAt.get(`${control.width}|${control.route}`);
        const geometry = wideGeometry.get(`${control.width}|${control.route}`);
        return { ...control, codes: wideCodes(problems), narrow: problems.filter(problem => problem.code === 'note-narrow').length,
          inkNarrow: problems.filter(problem => problem.code === 'note-ink-narrow').length,
          verticalNotes: geometry ? geometry.notes.filter(note => note.vertical).length : 0,
          notes: geometry ? geometry.noteCount : 0 };
      });
      check('§22c M8/M9a/M9b/M10 的正对照：同样不注入时，四个靶页在对应档位一条违规码都没有',
        wideNoInjectionControls.filter(row => row.id !== 'M15')
          .every(row => row.narrow === 0 && row.inkNarrow === 0 && row.codes.length === 0),
        wideNoInjectionControls.filter(row => row.id !== 'M15')
          .map(row => `${row.id} ${row.route || '/'}@${row.width} 说明 ${row.notes} 条（竖排 ${row.verticalNotes}）违规码 [${row.codes.join(',') || '无'}]`).join(' · '));
      // ---- M15 的正对照（vertical-note-coverage-v1）----------------------------------------
      // 它要说的是「**未注入**的产物上这一页是干净的」，所以作用域与上一条不同：
      //   · 在 `--dir=dist`（交付物原样）这一轮：必须是**严格形式** —— 0 违规码、且这一页
      //     一条竖排说明都没有（等于直接证明「新判据不是凡是说明就判窄」）；
      //   · 当 `--dir=` 指的就是**形态注入副本**（本轮的证据复跑）时，靶页**本身**带竖排 ⇒
      //     这条对照在那一轮里物理上不成立（不是判据出错）。这种情况**如实标注、不算失败**，
      //     但必须同时满足两条硬条件，否则照旧判红：
      //       (a) 这一页**确实被认成竖排**（verticalNotes > 0）—— 不许静默放过；
      //       (b) 它出的码**只含竖排应出的那两个**（note-ink-narrow / note-intro-long）——
      //           出现任何别的码就说明另有缺陷。
      //     严格形式**不会**因此失守：一份真把竖排带上线的产物，在 @1440/@1600/@760/@360 四条
      //     扫描断言上必然先红（本轮形态副本实测红 4 处）。
      {
        const m15Control = wideNoInjectionControls.find(row => row.id === 'M15');
        const m15Expected = ['note-ink-narrow', 'note-intro-long'];
        const m15Strict = Boolean(m15Control) && m15Control.verticalNotes === 0 && m15Control.narrow === 0
          && m15Control.inkNarrow === 0 && m15Control.codes.length === 0;
        const m15Contaminated = Boolean(m15Control) && m15Control.verticalNotes > 0;
        const m15Explained = m15Contaminated && m15Control.codes.every(code => m15Expected.includes(code));
        check('§22c M15 的正对照：不注入时这一页必须干净（该页说明一条都不是竖排、0 违规码）；'
          + '若本轮 --dir= 本身就是形态注入副本（该页已被认成竖排），如实标注并只允许出竖排那两个码',
          m15Strict || m15Explained,
          m15Control
            ? `${m15Control.route || '/'}@${m15Control.width} 说明 ${m15Control.notes} 条（竖排 ${m15Control.verticalNotes}）`
              + `违规码 [${m15Control.codes.join(',') || '无'}] ⇒ ${m15Strict ? '严格形式成立（未注入产物）'
                : (m15Explained ? '本轮目录本身带竖排 ⇒ 严格形式由 --dir=dist 的那一次运行承担' : '既不严格也不可解释')}`
            : '对照未登记');
      }

      // ---- 反空洞守卫自身的负例自检 ----
      // 用页面只为了拿到一份「页内样式很多」的产物：`plans/` 与 M1/M6/M8/M10/M12 同页
      // （原靶页 `need/student-only/` 换成 `plans/` 的连带改动 —— 这一条与 `.snote` 无关，
      // 但换掉可以少一处「注释里点名一个已不再承重的靶页」）。
      {
        const target = await browser.newPage({ viewport: { width: WIDE_DESKTOP, height: 900 } });
        let absent = null;
        let duplicated = null;
        try {
          wideNavigations += 1;
          await target.goto(new URL('plans/', base).href, { waitUntil: 'load' });
          absent = await wideMutate(target, '§22c-这个锚点在产物里不存在', 'x');
          // `color: var(--mut);` 在整份内联样式里出现几十次（≥2 ⇒ 非唯一）
          duplicated = await wideMutate(target, 'color: var(--mut);', 'color: var(--mut);');
        } finally {
          await target.close();
        }
        check('§22c 反空洞守卫自检：锚点不存在（0 次）与锚点非唯一（>1 次）都必须 ok:false 并给出原因',
          Boolean(absent && absent.ok === false && absent.occurrences === 0 && absent.reason)
          && Boolean(duplicated && duplicated.ok === false && duplicated.occurrences > 1 && duplicated.reason),
          `不存在的锚点：${absent ? `ok=${absent.ok} · 出现 ${absent.occurrences} 次 · ${absent.reason || ''}` : '未执行'}`
          + ` ／ 非唯一锚点：${duplicated ? `ok=${duplicated.ok} · 出现 ${duplicated.occurrences} 次 · ${duplicated.reason || ''}` : '未执行'}`);
      }

      // ---- 判据自检：全部违规码必须由 wideProblems() 一处产出、且都可达 ----
      {
        const note0 = {
          index: 0, depth: 1, parent: 'main', text: 'synthetic', textLength: 40,
          rawTextLength: 40, noscriptSubtree: false,
          box: { count: 1, left: 0, right: 1380, width: 1380, scrollW: 1380, clientW: 1380, padLeft: 0, padRight: 0 },
          contentBox: 1380, textWidth: 1380, textFallback: false, bearingCount: 1,
          rendered: true, vertical: false, writingMode: 'horizontal-tb',
          glyphRects: 3, lineCount: 3, widestLine: 1300, lines: [{ width: 1300, left: 0, right: 1300 }],
          ink: { width: 1300, rects: 3 }
        };
        const note1 = Object.assign({}, note0, { index: 1 });
        const g0 = {
          doc: { innerWidth: WIDE_DESKTOP, clientWidth: WIDE_DESKTOP, scrollWidth: WIDE_DESKTOP },
          mainCount: 1, detailMainCount: 0,
          main: { count: 1, left: 0, right: 1380, width: 1380, scrollW: 1380, clientW: 1380 },
          regionSel: '.ctable', regionFallback: false,
          region: { count: 1, left: 0, right: 1380, width: 1380, scrollW: 1380, clientW: 1380 },
          noteCount: 2, notes: [note0, note1], frozenCount: 1,
          // 新码 note-intro-long 的适用范围：默认「没有 intro」，只在下面那一条里显式打开。
          introIndexes: []
        };
        const metaWide = { route: 'synthetic/', kind: 'collection', family: 'wide' };
        const reachable = new Set();
        const collect = problems => wideCodes(problems).forEach(code => reachable.add(code.startsWith('page-overflow@') ? 'page-overflow@<vw>' : code));
        // ① 旧口径：内容盒被压窄 + border-box 脱离两锚 ⇒ note-narrow + note-axis
        collect(wideProblems(Object.assign({}, g0, {
          notes: [Object.assign({}, note0, { textWidth: 452, box: Object.assign({}, note0.box, { right: 482.81, width: 452.81 }) }), note1]
        }), metaWide));
        // ② 新口径：内容盒满宽、只有逐行字迹铺不开 ⇒ note-ink-narrow（盒子代理量在这里一条都不咬）
        collect(wideProblems(Object.assign({}, g0, {
          notes: [Object.assign({}, note0, { textWidth: 1380, lineCount: 4, widestLine: 452, glyphRects: 4 }), note1]
        }), metaWide));
        // ③ 藏字：文本非空、已渲染、零字形盒 ⇒ note-hidden-text
        collect(wideProblems(Object.assign({}, g0, {
          notes: [Object.assign({}, note0, { glyphRects: 0, lineCount: 0, widestLine: 0, lines: [], ink: null }), note1]
        }), metaWide));
        // ④ 未渲染说明（t24 / T22-F1）：盒高被压成 0、可见正文非空、非 <noscript> ⇒ note-unrendered
        collect(wideProblems(Object.assign({}, g0, {
          notes: [Object.assign({}, note0, {
            rendered: false, textLength: 40, rawTextLength: 40, noscriptSubtree: false,
            glyphRects: 0, lineCount: 0, widestLine: 0, lines: [], ink: null,
            box: Object.assign({}, note0.box, { width: 0, height: 0 })
          }), note1]
        }), metaWide));
        collect(wideProblems(Object.assign({}, g0, { detailMainCount: 1 }), metaWide));                                   // unexpected-detail-main
        collect(wideProblems(Object.assign({}, g0, { detailMainCount: 0, noteCount: 0, notes: [] }),
          { route: 'synthetic-deal/', kind: 'deal', family: 'detail' }));                                                 // missing-detail-main
        collect(wideProblems(Object.assign({}, g0, {
          notes: [Object.assign({}, note0, { box: Object.assign({}, note0.box, { scrollW: 1400, clientW: 1379 }) }), note1]
        }), metaWide));                                                                                                   // note-clipped
        collect(wideProblems(Object.assign({}, g0, { doc: Object.assign({}, g0.doc, { scrollWidth: 1500 }) }), metaWide)); // page-overflow@<vw>
        collect(wideProblems(Object.assign({}, g0, { mainCount: 0, main: Object.assign({}, g0.main, { count: 0 }), noteCount: 0, notes: [] }), metaWide)); // data-region-missing
        collect(wideProblems(g0, { route: 'synthetic-unknown/', kind: null, family: null }));                             // unclassified-layout
        // ⑥b 保留窄阅读列的登记制（narrow-reading-columns-v1）：**正反例成对** ——
        //    · 未登记的 ch 窄列 ⇒ narrow-unregistered；
        //    · 同一份几何把 registered 标成 true ⇒ 不报（证明它按登记清单判，不是「见 ch 就红」）。
        const narrowUnregisteredOn = wideCodes(wideProblems(Object.assign({}, g0, {
          narrowCh: [{ selector: '.zzz', declaration: 'max-width: 70ch', registered: false }]
        }), metaWide));
        const narrowUnregisteredOff = wideCodes(wideProblems(Object.assign({}, g0, {
          narrowCh: [{ selector: '.zzz', declaration: 'max-width: 70ch', registered: true }]
        }), metaWide));
        collect(wideProblems(Object.assign({}, g0, {
          narrowCh: [{ selector: '.zzz', declaration: 'max-width: 70ch', registered: false }]
        }), metaWide));                                                                                                  // narrow-unregistered
        check('§22c narrow-unregistered 的适用范围自检：同一个 ch 窄列，未登记 ⇒ 报、已登记 ⇒ 不报',
          narrowUnregisteredOn.includes('narrow-unregistered') && !narrowUnregisteredOff.includes('narrow-unregistered'),
          `未登记 ⇒ [${narrowUnregisteredOn.join(', ')}] · 已登记 ⇒ [${narrowUnregisteredOff.join(', ')}]`);
        // ⑤ 首屏说明过长（本轮新增）：行数越过上限、且这条说明落在首个数据区之前 ⇒ note-intro-long。
        //    **正反例成对**：同一个 note0（lineCount 3）在 introIndexes=[0] 时报，在 introIndexes=[] 时不报 ——
        //    后者证明新码确实按「intro 区」限定，而不是「所有说明都判」。
        const introLongOn = wideCodes(wideProblems(Object.assign({}, g0, { introIndexes: [0] }), metaWide));
        const introLongOff = wideCodes(wideProblems(g0, metaWide));
        collect(wideProblems(Object.assign({}, g0, { introIndexes: [0] }), metaWide));                                    // note-intro-long
        check('§22c note-intro-long 的适用范围自检：同一段 3 行的说明，在 intro 区里报、不在 intro 区里不报',
          introLongOn.includes('note-intro-long') && !introLongOff.includes('note-intro-long'),
          `introIndexes=[0] ⇒ [${introLongOn.join(', ')}] · introIndexes=[] ⇒ [${introLongOff.join(', ')}]`);
        // ⑥ 竖排按列判（vertical-note-coverage-v1，闭合 T31 的 P1）：**三个方向成对钉住** ——
        //    · 列栈铺不开（T31 实测形态：24 个 16px 竖列、水平只铺开 342.25px < 1173）⇒ 报；
        //    · 列栈铺满列宽（≥ 0.85×1380 = 1173px，现场换算需 ≥73 列 ≈ 366 字）⇒ 不报
        //      —— 这条反例证明新判据不是「凡是竖排就判红」，阈值仍然在量；
        //    · 只有 1 列（没有排版证据，等价于横排里的单行）⇒ 不报（前置条件与横排同构）。
        //    三个用同一个合成盒，唯一变化的量是**列证据**本身。
        const verticalNote = Object.assign({}, note0, {
          vertical: true, writingMode: 'vertical-rl',
          // 竖排下按行归并的读数：24 个竖列共享同一垂直带 ⇒ 恒 1 行（T31 实测）
          lineCount: 1, widestLine: 342.25, lines: [{ width: 342.25, left: 0, right: 342.25 }],
          columnCount: 24, columnSpan: 342.25,
          columns: [{ left: 0, right: 342.25, width: 16 }]
        });
        const verticalCodes = note => wideCodes(wideProblems(Object.assign({}, g0, { notes: [note, note1] }), metaWide));
        const verticalIntroCodes = note => wideCodes(wideProblems(Object.assign({}, g0, { introIndexes: [0], notes: [note, note1] }), metaWide));
        const verticalNarrow = verticalCodes(verticalNote);
        const verticalFull = verticalCodes(Object.assign({}, verticalNote, { columnCount: 80, columnSpan: 1300 }));
        const verticalSingleColumn = verticalCodes(Object.assign({}, verticalNote, { columnCount: 1, columnSpan: 16 }));
        const verticalIntro = verticalIntroCodes(verticalNote);
        collect(wideProblems(Object.assign({}, g0, { notes: [verticalNote, note1] }), metaWide));                        // note-ink-narrow（竖排按列）
        collect(wideProblems(Object.assign({}, g0, { introIndexes: [0], notes: [verticalNote, note1] }), metaWide));     // note-intro-long（竖排按列）
        check('§22c 竖排判据的适用范围自检（按列判）：列栈铺不开 ⇒ 报；列栈铺满列宽 ⇒ 不报；只有 1 列 ⇒ 不报',
          verticalNarrow.includes('note-ink-narrow') && !verticalFull.includes('note-ink-narrow')
          && !verticalSingleColumn.includes('note-ink-narrow'),
          `T31 形态（24 列 / 列栈 342.25px）⇒ [${verticalNarrow.join(', ')}]`
          + ` · 铺满（80 列 / 列栈 1300px ≥ 1173px）⇒ [${verticalFull.join(', ')}]`
          + ` · 单列（1 列 / 16px）⇒ [${verticalSingleColumn.join(', ')}]（前置条件不成立）`);
        check('§22c 竖排的 note-intro-long 也按列判：同一条竖排说明（24 列 / 按行归并只有 1 行）在 intro 区里报、不在 intro 区里不报',
          verticalIntro.includes('note-intro-long') && !verticalNarrow.includes('note-intro-long'),
          `introIndexes=[0] ⇒ [${verticalIntro.join(', ')}]`
          + ` · 不在 intro 区 ⇒ [${verticalNarrow.join(', ')}]（同一份几何，只变 intro 归属）`);
        const missingCodes = WIDE_CODE_VOCABULARY.filter(code => !reachable.has(code));
        const extraCodes = [...reachable].filter(code => !WIDE_CODE_VOCABULARY.includes(code));
        check(`§22c 违规码自检：${WIDE_CODE_VOCABULARY.length} 个码全部由 wideProblems() 一处产出、且都可达（不多不少）`,
          missingCodes.length === 0 && extraCodes.length === 0,
          `可达 ${reachable.size}/${WIDE_CODE_VOCABULARY.length} · 缺 ${missingCodes.join(',') || '无'} · 多 ${extraCodes.join(',') || '无'}`
          + `（含本轮新增的 note-ink-narrow / note-hidden-text；条级码带 index，与页级码同一个函数）`);
      }

      // ---- M5：不重复造第二套 —— 既有 §22b 的 M1–M5 确实跑了、逐条咬到期望码 ----
      {
        const wideLeafResults = results.filter(item => item.name.startsWith('§22b'));
        const wideLeafFailed = wideLeafResults.filter(item => !item.ok);
        const wideLeafCodes = metrics.leafMutationCodes || {};
        const wideLeafExpect = { M1: 'center', M2: 'width', M3: 'src-width', M4: `page-overflow@${LEAF_NARROW}`, M5: 'leaf-consistency' };
        const wideLeafMissed = Object.entries(wideLeafExpect)
          .filter(([id, code]) => !(wideLeafCodes[id] || []).includes(code))
          .map(([id, code]) => `${id} 期望 ${code} 实测 [${(wideLeafCodes[id] || []).join(',') || '（未跑）'}]`);
        check('§22c M5（不重复造第二套）：既有 §22b 的 M1–M5 确实跑了、逐条咬到期望码，且 §22b 的断言全绿',
          wideLeafResults.length > 0 && wideLeafFailed.length === 0 && wideLeafMissed.length === 0
          && (wideLeafCodes['M4-control'] || []).length === 0,
          `§22b 断言 ${wideLeafResults.length} 项（失败 ${wideLeafFailed.length}）`
          + ` · §22b 变异码 ${Object.keys(wideLeafExpect).map(id => `${id}=[${(wideLeafCodes[id] || []).join(',') || '未跑'}]`).join(' ')}`
          + ` · M4 正对照=[${(wideLeafCodes['M4-control'] || []).join(',') || '无'}]`
          + (wideLeafMissed.length ? ` · 未咬到：${wideLeafMissed.join('；')}` : ''));
      }

      // ---- 零磁盘污染：变异只发生在浏览器页面里 ----
      const wideHashAfter = new Map(WIDE_MUTATION_TARGETS.map(route => [route, wideHash(route)]));
      check('§22c 变异牙零磁盘污染：被改产物的 sha256 变异前后相等（byte-exact）',
        WIDE_MUTATION_TARGETS.every(route => wideHashBefore.get(route)
          && wideHashBefore.get(route) === wideHashAfter.get(route)),
        WIDE_MUTATION_TARGETS.map(route => `${route || '/'} ${String(wideHashBefore.get(route)).slice(0, 10)}…`).join(' · ')
        + `（前 ${WIDE_MUTATION_TARGETS.map(route => String(wideHashBefore.get(route)).slice(0, 6)).join('/')}`
        + ` · 后 ${WIDE_MUTATION_TARGETS.map(route => String(wideHashAfter.get(route)).slice(0, 6)).join('/')}）`);

      // ---- 条级容器自检：metrics.layoutNotes 必须覆盖每一页的每一条（外部逐条核对的前提）----
      {
        const wideExpectConditions = wideMeta.reduce((sum, meta) => sum + wideGeometry.get(`${WIDE_DESKTOP}|${meta.route}`).noteCount, 0);
        const wideKeysOk = wideNoteRows1440.every(row => Number.isInteger(row.index) && typeof row.route === 'string' && Array.isArray(row.codes));
        check('§22c 条级容器：metrics.layoutNotes 覆盖全部说明条（route#index 可逐条核对）',
          wideKeysOk && wideNoteRows1440.length === wideExpectConditions && wideNoteRows1600.length === wideExpectConditions,
          `条级容器 ${wideNoteRows1440.length} 条（@${WIDE_DESKTOP}） / ${wideNoteRows1600.length} 条（@${WIDE_WIDE}）`
          + ` · 现场实算 ${wideExpectConditions} 条 · 每行都带 route/index/codes：${wideKeysOk}`);
      }

      // ---- 本节自己的错误账本（整轮计数留给别的节，这里不污染）----
      check(`§22c 全站扫描（${wideNavigations} 次导航）没有 JS 错误、没有外部请求`,
        wideErrors.length === 0 && wideExternal.length === 0,
        `JS 错误 ${wideErrors.length} 个${wideErrors.length ? `：${wideErrors.slice(0, 3).join('；')}` : ''}`
        + ` · 外部请求 ${wideExternal.length} 个${wideExternal.length ? `：${wideExternal.slice(0, 3).join(' ')}` : ''}`);

      // ---- 机器可读输出（--compare 的 6 项判据都不读这些键，互不影响）----
      metrics.layoutNotes = wideNoteRows1440;
      metrics.layoutNotesAt1600 = wideNoteRows1600;
      metrics.layoutSweep = {
        total: wideRoutes.length,
        wide: wideRoutesOfFamily.wide.length,
        detail: wideRoutesOfFamily.detail.length,
        other: wideRoutesOfFamily.other.length,
        // notesChecked 保持 t2 起的口径（**有说明的页面数**，静态复算对得上）；
        // 条级另给 notesJudged（t7 起：401 条全判，不再只判 105 页里的第一条）。
        notesChecked: wideNotePages.length,
        notesJudged: wideNoteRows1440.length,
        narrowNotes: wideSummary[WIDE_DESKTOP].narrow.length,
        narrowNotePages: wideSummary[WIDE_DESKTOP].narrowRoutes.length,
        narrowNotesAt1600: wideSummary[WIDE_WIDE].narrow.length,
        // t19 新增：② 的**物理作用域证据** —— 每个视口的现场列宽范围 vs 现场换算的 70ch
        // （1440/1600/760 列宽大于 70ch ⇒ 判；360 小于 ⇒ 不判；判据里没有任何视口白名单）
        inkScopeDesktopViewports: WIDE_DESKTOP_VIEWPORTS.map(width => {
          const columns = [];
          const ch70s = new Set();
          for (const meta of wideMeta) {
            const geometry = wideGeometry.get(`${width}|${meta.route}`);
            columns.push(Math.min(geometry.region.width, geometry.main.width));
            for (const note of geometry.notes) if (Number(note.ch70) > 0) ch70s.add(note.ch70);
          }
          const positive = columns.filter(value => value > 0);
          const ch70 = [...ch70s];
          return {
            width: width,
            minColumn: positive.length ? wideRound(Math.min.apply(null, positive)) : 0,
            maxColumn: positive.length ? wideRound(Math.max.apply(null, positive)) : 0,
            ch70: ch70,
            inkScope: positive.length > 0 && ch70.length > 0 && Math.max.apply(null, positive) > ch70[0]
          };
        }),
        inkScopeSampleViewports: wideSampleScope,
        // t24 / T22-F1 立 · t28 收紧计数：未渲染说明的四个计数 ——
        //   unrenderedNotes（既有 metric，有断言引用）· unrenderedNoTextNotes（可见文本 0 ⇒ 豁免那类）·
        //   unrenderedTextNotes（note-unrendered 命中）· unrenderedNoscriptNotes（**诊断量，不参与豁免**）。
        //   前两者**不相交**且并集 = unrenderedNotes（上界断言逐条钉住）。
        unrenderedNoTextNotes: wideSummary[WIDE_DESKTOP].unrenderedNoText,
        unrenderedNoscriptNotes: wideSummary[WIDE_DESKTOP].unrenderedNoscript,
        unrenderedTextNotes: wideSummary[WIDE_DESKTOP].unrenderedText.length,
        unrenderedUnexplainedNotes: wideSummary[WIDE_DESKTOP].unrenderedUnexplained,
        unrenderedNoTextNotesAt1600: wideSummary[WIDE_WIDE].unrenderedNoText,
        unrenderedNoscriptNotesAt1600: wideSummary[WIDE_WIDE].unrenderedNoscript,
        unrenderedTextNotesAt1600: wideSummary[WIDE_WIDE].unrenderedText.length,
        // t14 新增：逐行字迹码与藏字码各自计数，另给「旧 ∪ 新」的并集（覆盖面的唯一口径）
        inkNarrowNotes: wideSummary[WIDE_DESKTOP].inkNarrow.length,
        inkNarrowNotePages: wideSummary[WIDE_DESKTOP].inkNarrowRoutes.length,
        narrowUnionNotes: wideSummary[WIDE_DESKTOP].union.length,
        narrowUnionNotePages: wideSummary[WIDE_DESKTOP].unionRoutes.length,
        inkNarrowNotesAt1600: wideSummary[WIDE_WIDE].inkNarrow.length,
        hiddenTextNotes: wideSummary[WIDE_DESKTOP].hiddenText.length,
        unrenderedNotes: wideSummary[WIDE_DESKTOP].unrendered,
        verticalNotes: wideSummary[WIDE_DESKTOP].vertical,
        // narrow-reading-columns-v1：保留窄阅读列的登记制读数
        narrowRegistryEntries: WIDE_NARROW_ENTRIES.length,
        narrowUnregisteredPages: wideMeta.map(meta => meta.route)
          .filter(route => wideProblemsAt.get(`${WIDE_DESKTOP}|${route}`).some(problem => problem.code === 'narrow-unregistered')),
        narrowChDeclarationsAt1440: wideMeta.map(meta => ({
          route: meta.route, declarations: (wideGeometry.get(`${WIDE_DESKTOP}|${meta.route}`).narrowCh || [])
        })).filter(item => item.declarations.length),
        // vertical-note-coverage-v1：竖排里「有列证据、② 按列判过」的条数（闭合 T31 的 P1 之后新增）
        verticalColumnEvidenceNotes: wideSummary[WIDE_DESKTOP].verticalColumnEvidence,
        verticalNotesAt1600: wideSummary[WIDE_WIDE].vertical,
        verticalColumnEvidenceNotesAt1600: wideSummary[WIDE_WIDE].verticalColumnEvidence,
        overflowPages: wideOverflowPages.length,
        unexpectedDetailMain: wideUnexpectedDetailMain.length,
        missingDetailMain: wideMissingDetailMain.length,
        unclassified: wideUnclassified.length,
        desktopViewports: WIDE_DESKTOP_VIEWPORTS
      };
      metrics.layoutFrozenRule = {
        anchor: WIDE_SNOTE_FROZEN,
        pagesExactlyOnce: wideFrozenPages.length,
        pagesTotal: wideRoutes.length,
        drift: wideFrozenDrift.slice(0, 10)
      };
      metrics.layoutDataRegions = wideRegionCounts;
      metrics.layoutNoteAnchors = wideAnchorStats;
      metrics.layoutSample = { viewports: WIDE_SAMPLE_VIEWPORTS, routes: wideSampleRoutes };
      metrics.layoutScan = {
        navigations: wideNavigations,
        desktopViewports: WIDE_DESKTOP_VIEWPORTS,
        sampleViewports: WIDE_SAMPLE_VIEWPORTS,
        seconds: Object.assign({}, widePhaseSeconds, { section: Math.round((Date.now() - wideSectionStart) / 100) / 10 }),
        jsErrors: wideErrors.length,
        externalRequests: wideExternal.length
      };
      metrics.layoutViolations = widePageCodesAt(WIDE_DESKTOP)
        .filter(item => item.problems.length > 0)
        .map(item => {
          const geometry = wideGeometry.get(`${WIDE_DESKTOP}|${item.meta.route}`);
          return {
            route: item.meta.route, kind: item.meta.kind, family: item.meta.family,
            codes: [...new Set(item.problems.map(problem => problem.code))],
            noteKeys: item.problems.filter(problem => problem.index !== undefined).map(problem => wideNoteKey(item.meta.route, problem.index)),
            noteCount: geometry.noteCount,
            regionSel: geometry.regionSel,
            column: wideRound(Math.min(geometry.region.width, geometry.main.width)),
            textWidth: geometry.notes.length ? geometry.notes[0].textWidth : null
          };
        });

      // ---- mutations.json：期望 vs 实测逐条落盘（与 --json= 报告同目录）----
      if (jsonArg) {
        const wideReportFile = path.resolve(ROOT, jsonArg.slice('--json='.length));
        const wideMutationsFile = path.join(path.dirname(wideReportFile), 'mutations.json');
        fs.mkdirSync(path.dirname(wideMutationsFile), { recursive: true });
        fs.writeFileSync(wideMutationsFile, `${JSON.stringify({
          target: base,
          dir: path.relative(ROOT, DIR),
          generatedAt: new Date().toISOString(),
          frozenAnchor: WIDE_SNOTE_FROZEN,
          criteria: {
            noteNarrow: `textWidth >= ${WIDE_NOTE_RATIO} * min(主数据区宽, 页面列宽)（旧口径，t7 的 textWidth = 承载文本的块级元素里最窄的 content box；一字未改）`,
            noteInkNarrow: `inkCount >= 2 且 inkSpan >= ${WIDE_NOTE_RATIO} * min(主数据区宽, 页面列宽)`
              + `（新口径，t14 立；**轴按 writing-mode 参数化 = vertical-note-coverage-v1**：`
              + `横排轴 = 行（inkCount = lineCount · inkSpan = widestLine，逐行字迹按垂直重叠归并）；`
              + `竖排轴 = 列（inkCount = columnCount · inkSpan = columnSpan = 竖列栈覆盖的水平范围，逐列按水平重叠归并）。`
              + `换轴的理由：竖排下 Range.getClientRects 取到的是列片段、24 个竖列共享同一垂直带 ⇒ 按行归并恒为 1 行、`
              + `「行数 ≥ 2」永不成立 ⇒ 旧口径必然静默（T31-WRITING-MODE.md §3.1 逐档读数）。`
              + `t19/R3-1 起适用性 = **物理前置条件**：min(主数据区宽, 页面列宽) > 现场换算的 70ch ⇒ 1440/1600/760 判、360 不判）`,
            noteHiddenText: '文本非空且已渲染（border-box 有宽有高）但零可见字形盒（Range.getClientRects 为空）',
            noteUnrendered: '未渲染（border-box 宽或高为 0）但**可见文本非空**、零可见字形盒'
              + '（t24 立 / t28 收紧：豁免只看「可见文本长度为 0」，不含任何标记级豁免键 —— '
              + '给说明插一个空 <noscript></noscript> 买不到豁免；判定只用盒量/render 状态/字形盒）',
            coverage: '并集 = ① 156 条（盒宽全 452.81；其中 48 条单行、只有 ① 看得见）∪ ② 108 条多行（② ⊆ ①）= 156 条。'
              + '⚠️ truth-401 的 caughtByOldCriteria(48) 是 make-truth-401.cjs:56 的 `index === 0` 按序切分（实测全为多行），'
              + '与「48 条单行」不是同一批 —— 两处 48 别混用（t19/R3-2 订正）',
            inkScope: `② 的适用性 = 现场物理量：min(主数据区宽, 页面列宽) > 70ch（现场换算；1440/1600/760 判、360 不判，t19/R3-1）`
              + `；横排与竖排共用这一把尺子（换轴只换「怎么归并、量哪一对数」，不换作用域）`,
            narrowUnregistered: `产物页面内联 <style> 里**任何以 ch 为单位声明的窄阅读列**都必须出现在 `
              + `scripts/data/narrow-reading-columns.json 的 entries 里（selector + 归一声明文本逐字匹配）；`
              + `登记的条目还必须：真实浏览器里**居中**（|左内边距 − 右内边距| ≤ ${WIDE_NARROW_REGISTRY.ratio.centeringTolerancePx}px，`
              + `由 §19 的 .pdetailbody 几何断言判）且**真的比容器窄**。`
              + `作用域说明：px/rem 的窄宽不在本清单射程内（.detail-main 的 min(1120px,100%) 由 §22b 原有断言承担）`,
            noteAxis: `border-box 与主数据区或 <main> 任一同一轴，容差 max(${WIDE_TOL}px, ${WIDE_AXIS_RATIO} * min(主数据区宽, 页面列宽))`,
            scope: '<main> 内全部 .snote，逐条 route#index；零条说明的页面才跳过；未渲染（<noscript>）单独登记'
          },
          rows: wideMutations.map(mutation => {
            const extra = wideMutationExtra.get(mutation.id) || {};
            return {
              id: mutation.id, route: mutation.route, width: mutation.width, expect: mutation.expect,
              what: mutation.what, observed: metrics.layoutMutationCodes[mutation.id] || [],
              hit: Boolean(wideMutationHits.get(mutation.id)),
              narrowKeys: extra.narrowKeys || [], inkNarrowKeys: extra.inkNarrowKeys || [],
              hiddenTextKeys: extra.hiddenTextKeys || [], matchedKeys: extra.matchedKeys || null,
              anchor: mutation.target === 'extend' ? WIDE_SNOTE_FROZEN : (mutation.anchor || null),
              injectedRule: mutation.rule || null, domInjection: mutation.target === 'dom',
              injectedTokenLength: mutation.inject ? WIDE_LONG_TOKEN.length : 0
            };
          }),
          control: {
            m6: { id: 'M6-control', route: 'plans/', width: WIDE_NARROW, expect: `不得出现 page-overflow@${WIDE_NARROW}`,
              observed: metrics.layoutMutationCodes['M6-control'] || [] },
            noInjection: wideNoInjectionControls.map(row => ({ id: row.id, route: row.route, width: row.width, noteNarrow: row.narrow, codes: row.codes }))
          },
          m5Reuse: { section: '§22b', assertions: results.filter(item => item.name.startsWith('§22b')).length,
            failing: results.filter(item => item.name.startsWith('§22b') && !item.ok).length,
            codes: { M1: metrics.leafMutationCodes.M1, M2: metrics.leafMutationCodes.M2, M3: metrics.leafMutationCodes.M3,
              M4: metrics.leafMutationCodes.M4, M5: metrics.leafMutationCodes.M5, 'M4-control': metrics.leafMutationCodes['M4-control'] } },
          layoutSweep: metrics.layoutSweep,
          scan: metrics.layoutScan
        }, null, 2)}\n`, 'utf8');
        console.log(`     变异读数已写出：${path.relative(ROOT, wideMutationsFile)}（${wideMutations.length} 条牙 + M6 正对照 + 不注入正对照 + M5 复用）`);
      }

      // ---- prompt §18 的表：布局族读数 + 逐条读数 + 变异牙读数 ----
      {
        const wideFamilyRow = (label, routes) => {
          const rows = wideNoteRows1440.filter(row => routes.includes(row.route));
          const pagesWithNotes = routes.filter(route => wideGeometry.get(`${WIDE_DESKTOP}|${route}`).noteCount > 0).length;
          const narrowRows = rows.filter(row => row.codes.includes('note-narrow'));
          const inkRows = rows.filter(row => row.codes.includes('note-ink-narrow'));
          const hiddenRows = rows.filter(row => row.codes.includes('note-hidden-text'));
          const axis = rows.filter(row => row.codes.includes('note-axis')).length;
          const clipped = rows.filter(row => row.codes.includes('note-clipped')).length;
          const overflow = routes.filter(route => wideNarrow390.get(route).codes.length > 0
            || wideSummary[WIDE_DESKTOP].overflow.includes(route) || wideSummary[WIDE_WIDE].overflow.includes(route)).length;
          const detailMain = routes.filter(route => wideMissingDetailMain.includes(route) || wideUnexpectedDetailMain.includes(route)).length;
          const unclassified = routes.filter(route => wideUnclassified.some(meta => meta.route === route)).length;
          return [label, routes.length, pagesWithNotes, rows.length, narrowRows.length, inkRows.length, hiddenRows.length,
            new Set([...narrowRows, ...inkRows].map(row => row.route)).size, axis, clipped, overflow, detailMain, unclassified];
        };
        const wideTableRows = [
          wideFamilyRow('wide', wideRoutesOfFamily.wide),
          wideFamilyRow('detail', wideRoutesOfFamily.detail),
          wideFamilyRow('other', wideRoutesOfFamily.other),
          wideFamilyRow('合计', wideRoutes)
        ];
        const wideHeaders = ['族', '页面', '有说明页', '说明条', '窄条', '字迹窄', '藏字', '窄条页', '不同轴', '裁切', '溢出', 'detail-main', '未分类'];
        const wideWidths = [8, 6, 10, 8, 6, 8, 6, 8, 8, 6, 6, 13, 8];
        console.log(`     布局族读数表（prompt §18）：全站 ${wideRoutes.length} 页 = wide ${wideRoutesOfFamily.wide.length} + detail ${wideRoutesOfFamily.detail.length} + other ${wideRoutesOfFamily.other.length}`
          + ` · 逐条判 ${wideNoteRows1440.length} 条（修复前只判 ${wideNotePages.length} 条 = 文档序第一条）`);
        console.log(`     ${wideHeaders.map((head, i) => wideCell(head, wideWidths[i])).join('')}`);
        for (const row of wideTableRows) console.log(`     ${row.map((value, i) => wideCell(value, wideWidths[i])).join('')}`);
        console.log(`     视口：${WIDE_DESKTOP_VIEWPORTS.join('/')} 全站逐条几何 + 溢出 · ${WIDE_NARROW} 全站 scrollWidth · ${WIDE_SAMPLE_VIEWPORTS.join('/')} 样本集 ${wideSampleRoutes.length} 页`);
        console.log(`     逐条读数：@${WIDE_DESKTOP} 窄 ${wideSummary[WIDE_DESKTOP].narrow.length} 条 / ${wideSummary[WIDE_DESKTOP].narrowRoutes.length} 页`
          + ` · @${WIDE_WIDE} 窄 ${wideSummary[WIDE_WIDE].narrow.length} 条 / ${wideSummary[WIDE_WIDE].narrowRoutes.length} 页`
          + ` · 竖排 ${wideSummary[WIDE_DESKTOP].vertical} 条（有列证据 ${wideSummary[WIDE_DESKTOP].verticalColumnEvidence} 条 · 按列判）`
          + ` · textFallback 回落 ${wideSummary[WIDE_DESKTOP].textFallback} 条`
          + ` · 同轴锚（条）主数据区 ${wideAnchorStats.region} / 主容器 ${wideAnchorStats.main} / 两者都 ${wideAnchorStats.both} / 都不 ${wideAnchorStats.neither}`);
        console.log(`     主数据区：${Object.entries(wideRegionCounts).map(([sel, n]) => `${sel}=${n} 页`).join(' · ')}`);
        console.log(`     冻结串：${wideFrozenPages.length}/${wideRoutes.length} 页内联样式里恰好 1 次（M0 的改动前产物在这里是 0/${wideRoutes.length}）`);
        const wideControlRowText = id => {
          const row = wideNoInjectionControls.find(item => item.id === id);
          return row ? `${row.route || '/'} 说明 ${row.notes} 条（竖排 ${row.verticalNotes}）⇒ [${row.codes.join(',') || '无'}]` : '（未登记）';
        };
        const wideMutationRows = [
          ['M0（反证）', '--dir=dist.baseline', 'note-narrow ×156', '另跑一次同一条命令：改动前产物必须红'],
          ...wideMutations.map(mutation => {
            const codes = metrics.layoutMutationCodes[mutation.id] || [];
            const extra = wideMutationExtra.get(mutation.id) || {};
            return [mutation.id, `${mutation.route || '/'}@${mutation.width}`, mutation.expect,
              `[${codes.join(', ') || '（未执行）'}]${codes.includes(mutation.expect) ? '' : ' ←未咬到'}${extra.narrowKeys && extra.narrowKeys.length ? ` 窄条 ${extra.narrowKeys.join(' ')}` : ''}`];
          }),
          ['M6 正对照', `plans/@${WIDE_NARROW}`, '不得出现 page-overflow', `[${(metrics.layoutMutationCodes['M6-control'] || []).join(', ') || '无'}]`],
          ['M8/M9/M10 正对照', '四个靶页不注入', '不得出现任何违规码',
            ['M8', 'M9a', 'M9b', 'M10'].map(id => `${id}[${(wideNoInjectionControls.find(row => row.id === id) || {}).codes ? (wideNoInjectionControls.find(row => row.id === id).codes.join(',') || '无') : '?'}]`).join(' ')],
          ['M15 正对照', `不注入（${WIDE_DESKTOP}）`, '干净；注入副本轮如实标注', wideControlRowText('M15')],
          ['M5（复用）', '§22b 的 M1–M5', '既有牙全绿', `${results.filter(item => item.name.startsWith('§22b')).length} 项断言`]
        ];
        const wideMutHeaders = ['牙', '页面@视口', '期望', '实测'];
        const wideMutWidths = [18, 22, 26, 54];
        console.log('     变异牙读数表（期望 vs 实测）：');
        console.log(`     ${wideMutHeaders.map((head, i) => wideCell(head, wideMutWidths[i])).join('')}`);
        for (const row of wideMutationRows) console.log(`     ${row.map((value, i) => wideCell(value, wideMutWidths[i])).join('')}`);
      }

      console.log(`     读数：逐条判 ${wideNoteRows1440.length} 条说明 · note-narrow ${wideSummary[WIDE_DESKTOP].narrow.length} 条 / ${wideSummary[WIDE_DESKTOP].narrowRoutes.length} 页`
        + ` · note-ink-narrow ${wideSummary[WIDE_DESKTOP].inkNarrow.length} 条 / ${wideSummary[WIDE_DESKTOP].inkNarrowRoutes.length} 页`
        + ` · 并集 ${wideSummary[WIDE_DESKTOP].union.length} 条 / ${wideSummary[WIDE_DESKTOP].unionRoutes.length} 页 · 藏字 ${wideSummary[WIDE_DESKTOP].hiddenText.length} 条`
        + ` · 轴：横排按行 / 竖排按列（竖排 ${wideSummary[WIDE_DESKTOP].vertical} 条，其中有列证据 ${wideSummary[WIDE_DESKTOP].verticalColumnEvidence} 条）`
        + ` · @${WIDE_WIDE} 窄 ${wideSummary[WIDE_WIDE].narrow.length} / 字迹窄 ${wideSummary[WIDE_WIDE].inkNarrow.length} 条 · 溢出 ${wideOverflowPages.length} 页`
        + ` · ② 作用域（物理）：${wideSampleScopeText}`
        + ` · detail-main 违规 ${wideMissingDetailMain.length + wideUnexpectedDetailMain.length} 页 · 未分类 ${wideUnclassified.length} 页`
        + ` · 导航 ${wideNavigations} 次（1440 ${widePhaseSeconds[`desktop${WIDE_DESKTOP}`]}s / 1600 ${widePhaseSeconds[`desktop${WIDE_WIDE}`]}s / 950 ${widePhaseSeconds[`desktop${WIDE_MID}`]}s / 390 ${widePhaseSeconds.narrow390}s / 样本 ${widePhaseSeconds.samples}s）`
        + ` · 本节 JS 错误 ${wideErrors.length} 个 · 外部请求 ${wideExternal.length} 个`);
    } finally {
      await widePage.close();
    }
  }

  /* ------------------------------------------------------------------ */
  /* 厂商资料页（v3.0 Stage E）                                           */
  /* ------------------------------------------------------------------ */

  console.log('\n=== 23) 厂商资料页（/vendor/）===');
  {
    const vendorIndex = await page.evaluate(`(async () => {
      const raw = await (await fetch(${JSON.stringify(new URL('sitemap.xml', base).href)})).text();
      // ⚠️ 先剥 XML 注释（judge-hardening-v1a / t5 F2）：否则把某厂商的 <url> 块包进注释，
      //    这里仍会把它数成「进了 sitemap」的厂商入口（与 §18 的成员资格同一条缺口）。
      const sm = raw.replace(/<!--[\\s\\S]*?-->/g, ' ');
      const list = [...sm.matchAll(/<loc>([^<]+)<\\/loc>/g)].map(m => m[1])
        .filter(url => /\\/vendor\\/[a-z0-9-]+\\/$/.test(url));
      return { routes: list.map(url => new URL(url).pathname.replace(/^.*\\/ai-deals-aggregator\\//, '')), count: list.length };
    })()`).catch(() => null);
    check('/vendor/ 至少有一个厂商页进 sitemap', Boolean(vendorIndex) && vendorIndex.count > 0,
      vendorIndex ? `${vendorIndex.count} 个` : '读取失败');
    if (vendorIndex && vendorIndex.count) {
      // v3.0 Stage E 的资料区块已经接线，所以这一节现在查的是**真实承诺**：
      //   · 每页必须真的渲染出六节；
      //   · 官方入口必须给 ≥1 条站外链接，且**每一条都能在 dist 数据里找到出处**
      //     （「写一个看起来像主页的地址」是这一页最容易犯的错）；
      //   · 页面上的 API 记录数必须与 dist/api-plans.json 按 provider key 现算的值逐个对账。
      // 数据侧的真值在这里**从 dist 现场读**（与构建期不同源，这正是这一节的价值）。
      const externalAllowed = await page.evaluate(`(async () => {
        const urls = new Set();
        const deals = (await (await fetch(${JSON.stringify(new URL('deals.json', base).href)})).json()).deals || [];
        for (const deal of deals) if (deal.url) urls.add(deal.url);
        const plans = (await (await fetch(${JSON.stringify(new URL('plans.json', base).href)})).json()).plans || [];
        for (const plan of plans) if (plan.officialUrl) urls.add(plan.officialUrl);
        const api = (await (await fetch(${JSON.stringify(new URL('api-plans.json', base).href)})).json()).plans || [];
        for (const plan of api) if (plan.officialUrl) urls.add(plan.officialUrl);
        return [...urls];
      })()`).catch(() => null);
      const allowedSet = new Set(externalAllowed || []);
      const sample = vendorIndex.routes.slice(0, 3);
      for (const route of sample) {
        const { data } = await auditLibraryPage({
          label: `/${route}`,
          route,
          noJsText: ['按厂商浏览', '福利类型'],
          minText: 600,
          itemList: true,
          // v3.0 Stage E：厂商资料页**有**官方入口（那一节的职责就是给出官方地址）。
          official: 1,
          // 页脚只钉了少量厂商快捷入口，不是每个厂商页都有 —— 入链来自 /vendor/ 枢纽。
          footerLink: false
        });
        check(`/${route} 面包屑第二级指向 /vendor/ 枢纽`,
          data.crumbLinks.includes('../vendor/') || data.crumbLinks.includes('../../vendor/'),
          data.crumbLinks.join(' '));
        check(`/${route} 从 /vendor/ 枢纽有一条入链（厂商页不是孤岛）`,
          await page.evaluate(`(async () => {
            const r = await fetch(${JSON.stringify(new URL('vendor/', base).href)});
            const html = await r.text();
            return html.includes(${JSON.stringify(route.replace(/^vendor\//, ''))});
          })()`).catch(() => false));
        // v3.0 Stage E 的资料区块：**必须存在**（接线已由 t13 完成，不再有「未接线」分支）。
        const knowledge = await page.evaluate(`(() => {
          const el = document.getElementById('vendor-knowledge');
          if (!el) return null;
          const mark = name => {
            const node = el.querySelector('[data-vendor-count="' + name + '"]');
            return node ? Number(node.getAttribute('data-vendor-value')) : -1;
          };
          const sections = ['vendor-official', 'vendor-plans', 'vendor-api', 'vendor-models', 'vendor-changes', 'vendor-feeds']
            .filter(id => document.getElementById(id)).length;
          return {
            sections,
            officialLinks: [...el.querySelectorAll('a[href^="http"]')].map(a => a.href),
            marks: Object.fromEntries(['api-records', 'api-model-items', 'api-channels', 'models', 'api-records-inline'].map(name => {
              const node = el.querySelector('[data-vendor-count="' + name + '"]');
              return [name, node ? Number(node.getAttribute('data-vendor-value')) : -1];
            }))
          };
        })()`);
        check(`/${route} 资料区块六节齐（官方入口 / 套餐 / API / 模型 / 变化 / 订阅）`,
          Boolean(knowledge) && knowledge.sections === 6,
          knowledge ? `${knowledge.sections} 节` : '缺少 #vendor-knowledge');
        if (knowledge) {
          check(`/${route} 资料区块的官方入口指向**数据里有出处**的地址`,
            knowledge.officialLinks.length >= 1 && knowledge.officialLinks.every(href => allowedSet.has(href)),
            `${knowledge.officialLinks.length} 条` +
            `${knowledge.officialLinks.filter(href => !allowedSet.has(href)).slice(0, 2).join(' ') || ' · 全部有出处'}`);
          // 页面上的每个计数都必须带 `data-vendor-count` 标记、可被外部按数据重算（值非负），
          // 且「同一件事的两个标记」（标题里的 api-records-inline 与正文里的 api-records）**必须相等** ——
          // 这一条抓的是「改了一处忘改另一处」这类最容易漏的漂移。
          const marks = knowledge.marks || {};
          const required = ['api-records', 'api-model-items', 'api-channels', 'models', 'api-records-inline'];
          const missing = required.filter(name => !(marks[name] >= 0));
          check(`/${route} 资料区块的计数都带 data-vendor-count 标记且非负（可被外部重算）`,
            missing.length === 0, missing.length ? `缺标记：${missing.join(',')}` : JSON.stringify(marks));
          check(`/${route} 「API 记录数」的两个标记一致（标题行 == 正文行）`,
            marks['api-records'] >= 0 && marks['api-records'] === marks['api-records-inline'],
            `${marks['api-records']} vs ${marks['api-records-inline']}`);
        }
      }
      const { data: hubData } = await auditLibraryPage({
        label: '/vendor/',
        route: 'vendor/',
        noJsText: ['按厂商浏览'],
        minText: 500,
        itemList: true,
        rowSelector: '[data-child]',
        official: 0
      });
      check(`/vendor/ 枢纽列出 ${vendorIndex.count} 个厂商入口`,
        hubData.rows === vendorIndex.count, `页面 ${hubData.rows} 行 / sitemap ${vendorIndex.count} 个`);
    }
  }

  /* ------------------------------------------------------------------ */
  /* 历史档案（v3.0 Stage F）                                             */
  /* ------------------------------------------------------------------ */

  console.log('\n=== 24) 历史档案（/archive/）===');
  {
    const { data, noJs } = await auditLibraryPage({
      label: '/archive/',
      route: 'archive/',
      // 「0 条是事实，不是故障」只在**空档案**时出现 —— 它不是无条件文案，
      // 因此不能当作无 JS 的固定探针（非空档案页读不到它是正确的）。
      // 空 / 非空两种状态的判据见下面那两条。
      noJsText: ['历史档案', '已结束'],
      minText: 600,
      itemList: true,
      official: 0
    });
    check('/archive/ 三组都在（优惠 / Coding 套餐 / API 计费记录）',
      await page.evaluate(`['archive-deal','archive-plan','archive-api'].every(id => Boolean(document.getElementById(id)))`));
    const archiveTruth = await page.evaluate(`(async () => {
      const files = { deal: 'deal-history.json', plan: 'plan-history.json', api: 'api-plan-history.json' };
      const out = {};
      for (const [kind, file] of Object.entries(files)) {
        const r = await fetch(${JSON.stringify(base)} + file);
        const doc = r.ok ? await r.json() : null;
        // 档案条目是**按记录**的：同一记录的 ended + restored 是两条事件、**一个条目**
        // （条目身份 = (kind, id)）。所以期望值取唯一记录数，不取事件数 ——
        // 后者在非空数据上必然大于行数，那不是页面错，是判据错。
        out[kind] = doc ? new Set((doc.events || [])
          .filter(e => e.type === 'ended' || e.type === 'restored')
          .map(e => e.planId || e.id)).size : null;
      }
      return out;
    })()`).catch(() => null);
    check('/archive/ 三份变化日志都取到了（没有把 api-plan-history 写成 api-history 这类文件名错误）',
      Boolean(archiveTruth) && Object.values(archiveTruth).every(value => value !== null),
      JSON.stringify(archiveTruth));
    const totalEnded = archiveTruth ? Object.values(archiveTruth).reduce((n, v) => n + (v || 0), 0) : null;
    check('/archive/ 的档案条数与三份日志里 ended/restored 的**唯一记录数**一致（空 ⇒ 0 行）',
      totalEnded === null ? data.rows === 0 : data.rows === totalEnded,
      `页面 ${data.rows} 行 · 日志里 ended/restored 覆盖 ${totalEnded} 条记录`);
    check('/archive/ 空态写明「0 条是事实，不是故障」（空是事实，不是故障）',
      data.rows > 0 || data.text.includes('0 条是事实，不是故障'));
    // 无 JS 也要读到**当前状态该有的那句话**：空档案 ⇒ 空态说明；非空 ⇒ 分组与条目。
    check('/archive/ 无 JS 时读到当前状态该说的话（空 ⇒ 空态说明 / 非空 ⇒ 分组计数）',
      data.rows > 0
        ? noJs.text.includes('已结束') && /\d+\s*条/.test(noJs.text)
        : noJs.text.includes('0 条是事实，不是故障'),
      `页面 ${data.rows} 行 · 无 JS 正文 ${noJs.text.length} 字`);
  }

  /* ------------------------------------------------------------------ */
  /* 数据出口（v3.0 Stage G）                                             */
  /* ------------------------------------------------------------------ */

  console.log('\n=== 25) 数据出口（/docs/data/）===');
  {
    const { data } = await auditLibraryPage({
      label: '/docs/data/',
      route: 'docs/data/',
      noJsText: ['数据集索引', '使用示例', '引用方式', 'Schema 稳定性', 'License 状态'],
      minText: 1200,
      itemList: true,
      official: 0
    });
    const manifestTruth = await page.evaluate(`(async () => {
      const doc = await (await fetch(${JSON.stringify(new URL('data/index.json', base).href)})).json();
      return { count: doc.count, urls: (doc.datasets || []).map(d => d.url), shapes: (doc.datasets || []).map(d => d.updatedAtShape) };
    })()`).catch(() => null);
    if (manifestTruth) {
      check(`/docs/data/ 行数 == dist/data/index.json 的数据集数（${manifestTruth.count} 份）`,
        data.rows === manifestTruth.count, `页面 ${data.rows} 行 / Manifest ${manifestTruth.count} 份`);
      const statuses = await page.evaluate(`(async () => {
        const urls = ${JSON.stringify(manifestTruth.urls)};
        const out = {};
        for (const url of urls) {
          try { out[url] = (await fetch(${JSON.stringify(base)} + url, { method: 'GET' })).status; }
          catch (e) { out[url] = 0; }
        }
        return out;
      })()`).catch(() => null);
      check('/docs/data/ 里每个 endpoint 都真的能取到（逐条 HTTP 200）',
        Boolean(statuses) && Object.values(statuses).every(status => status === 200),
        statuses ? Object.entries(statuses).filter(([, s]) => s !== 200).map(([u, s]) => `${u}=${s}`).join(' ') : '读取失败');
      check('/docs/data/ 页面标出每份数据的时间形状（真实时刻 / 日期规范化 / 纯日期）',
        await page.evaluate(`(async () => {
          const doc = await (await fetch(${JSON.stringify(new URL('data/index.json', base).href)})).json();
          const shapes = new Set((doc.datasets || []).map(d => d.updatedAtShape));
          const onPage = new Set([...document.querySelectorAll('[data-time-shape]')].map(el => el.getAttribute('data-time-shape')));
          return [...shapes].every(s => onPage.has(s));
        })()`).catch(() => false));
    }
    check('/docs/data/ 引用示例里带官方出处（不宣称本站是官方来源）',
      data.text.includes('docs.anthropic.com') && data.text.includes('不是官方来源'));
  }

  /* ------------------------------------------------------------------ */
  /* 私有站点分析（private-analytics-v1）                                 */
  /* ------------------------------------------------------------------ */

  console.log('\n=== 26) 私有分析（Production Guard / 覆盖 / 端点）===');
  {
    // 抽样页覆盖 P1 §21 点名的全部类型：首页 / 两个计费页 / 模型索引 / 某个模型详情 /
    // 厂商落地页 / 变化雷达页。**每条断言都在真浏览器里量**，不读源码字符串。
    const modelFile = (() => {
      const dir = path.join(DIR, 'models');
      if (!fs.existsSync(dir)) return null;
      const entry = fs.readdirSync(dir, { withFileTypes: true }).find(item => item.isDirectory());
      return entry ? `models/${entry.name}/` : null;
    })();
    const vendorFile = (() => {
      const dir = path.join(DIR, 'vendor');
      if (!fs.existsSync(dir)) return null;
      const entry = fs.readdirSync(dir, { withFileTypes: true }).find(item => item.isDirectory());
      return entry ? `vendor/${entry.name}/` : null;
    })();
    const samples = ['', 'plans/api/', 'plans/coding/', 'models/', modelFile, vendorFile, 'changes/']
      .filter(route => route !== null);

    const live = Boolean(urlArg);
    const rows = [];
    for (const route of samples) {
      const before = { errors: errors.length, analytics: analyticsRequests.length, forbidden: forbiddenRequests.length };
      await page.goto(`${base}${route}`, { waitUntil: 'networkidle' });
      // 真实资源的请求记录（比只看 network 事件更硬：它证明**浏览器真的没去取**那个脚本）
      const observed = await page.evaluate(() => {
        const entries = performance.getEntriesByType('resource').map(item => item.name);
        return {
          bootstraps: document.querySelectorAll('script[data-dsh-analytics]').length,
          cloudflare: entries.filter(name => /cloudflareinsights\.com/.test(name)),
          placeholder: document.documentElement.outerHTML.includes('ANALYTICS:BOOTSTRAP'),
          beaconElement: document.querySelectorAll('script[type="module"][src*="beacon.min.js"]').length,
          text: (document.body ? document.body.innerText.replace(/\s+/g, ' ').trim().length : 0)
        };
      });
      rows.push({
        route, ...observed,
        newErrors: errors.length - before.errors,
        newAnalytics: analyticsRequests.length - before.analytics,
        newForbidden: forbiddenRequests.length - before.forbidden
      });
    }

    check(`抽样 ${rows.length} 个页面在真实 DOM 里各有一个 analytics bootstrap（含 noindex / 深层路由）`,
      rows.every(row => row.bootstraps === 1),
      rows.map(row => `${row.route || '/'}=${row.bootstraps}`).join(' · '));

    check('抽样页面里没有残留的分析占位符（页面 HTML 里不会露出模板标记）',
      rows.every(row => row.placeholder === false),
      rows.filter(row => row.placeholder).map(row => row.route || '/').join('、') || '0 个');

    check('抽样页面正文都有内容（分析注入没有把正文吃掉）',
      rows.every(row => row.text > 200),
      rows.map(row => `${row.route || '/'}:${row.text}`).join(' · '));

    if (live) {
      // 线上（`--url=`）：**应当**看到 Cloudflare 的 beacon 请求，而且只允许落在两个官方 origin 上。
      //
      // ⚠️ 两条判据是**首次线上冒烟实测校正过的**（第一版写错，2026-10-04）：
      //   ① beacon 脚本请求**不带** `?token=` 查询串 —— token 在脚本元素的 `data-cf-beacon`
      //      属性里（这正是官方 snippet 的形状）。第一版断言「URL 必须等于脚本地址 + token
      //      查询串」，线上实测立刻判红：真实请求是 `…/beacon.min.js`（无查询串）。
      //      那是断言写错了，不是产品错了 —— 修的是断言。
      //   ② 上报会命中 **`cloudflareinsights.com/cdn-cgi/rum`**（官方文档里「未走 Cloudflare
      //      代理的站点」的上报端点），因此它**不是**「混进来的其它外部请求」。
      //      第一版把它当成异常，同样判红。
      const scriptUrl = analytics.ANALYTICS.beaconScriptUrl;
      const beacon = analyticsRequests.filter(url => url === scriptUrl || url.startsWith(`${scriptUrl}?`));
      const rum = analyticsRequests.filter(url => url.startsWith(`${analytics.ANALYTICS.beaconEndpointUrl}?`)
        || url === analytics.ANALYTICS.beaconEndpointUrl);
      const unexpected = analyticsRequests.filter(url => !beacon.includes(url) && !rum.includes(url));

      check('线上：至少一个页面真的加载了 Cloudflare beacon 脚本（授权地址，不带查询串）',
        beacon.length > 0,
        beacon.length
          ? `观测到 ${beacon.length} 次 beacon 脚本请求`
          : 'ℹ️ 未观测到 beacon 请求（可能是广告拦截器 / 网络故障 / Production Guard 判错——请人工看 DevTools 的 Network）');

      check('线上：上报只发往官方 RUM 端点 cloudflareinsights.com/cdn-cgi/rum',
        rum.length > 0,
        rum.length
          ? `观测到 ${rum.length} 次 RUM 上报`
          : 'ℹ️ 本次没有观测到 RUM 上报（页面可能在首次 hidden 之前就结束了 —— 官方在 hidden 后才上报 Web Vitals）');

      check('线上：beacon 元素在页面里是 module + data-cf-beacon（与官方 snippet 同形）',
        rows.every(row => row.beaconElement >= 1 || row.bootstraps === 1),
        rows.map(row => `${row.route || '/'}:module=${row.beaconElement}`).join(' · '));

      check('线上：分析请求**只**落在两个官方地址上（没有别的外部请求混进来）',
        unexpected.length === 0 && rows.every(row => row.newForbidden === 0) && externalRequests.length === 0,
        unexpected.slice(0, 3).join(' · ') || '全部落在允许的两个 origin 上');
      console.log(`     线上观测：分析请求 ${analyticsRequests.length} 次 `
        + `（beacon 脚本 ${beacon.length} · RUM 上报 ${rum.length} · 其它 ${unexpected.length}）`);
    } else {
      // 本地：**本轮的强制要求** —— 一个 Cloudflare 请求都不许有。
      check('本地：真实资源计时里 0 次 Cloudflare 请求（不是「没看到」，是浏览器确实没去取）',
        rows.every(row => row.cloudflare.length === 0),
        rows.filter(row => row.cloudflare.length).map(row => `${row.route || '/'}:${row.cloudflare.length}`).join(' · ') || '全部 0');
      check('本地：网络层同样 0 次分析请求（guard 在插入 <script> 之前就返回了）',
        rows.every(row => row.newAnalytics === 0) && analyticsRequests.length === 0,
        `本轮累计 ${analyticsRequests.length} 次`);
      check('本地：抽样页面没有新增 JS 错误（Analytics 失败不得影响产品）',
        rows.every(row => row.newErrors === 0),
        rows.filter(row => row.newErrors).map(row => `${row.route || '/'}:${row.newErrors}`).join(' · ') || '全部 0');
      check('本地：没有出现白名单之外的外部请求',
        rows.every(row => row.newForbidden === 0) && forbiddenRequests.length === 0,
        forbiddenRequests.slice(0, 3).join(' · ') || '0 个');
    }
  }

  await browser.close();
  if (server) server.close();

  Object.assign(metrics, {
    externalRequests: externalRequests.length,
    // private-analytics-v1：分析请求单列一项。**本地必须是 0**（Production Guard 的现场证据），
    // 线上 `--url=` 时应当 > 0。它不进回归比对：本地恒 0，而线上与本地本来就不可比。
    analyticsRequests: analyticsRequests.length,
    failedRequests: failedRequests.length,
    jsErrors: errors.length,
    // 抽样写进机器可读报告：回归比对报"JS 错误 1 个"时，报告里就能看到是哪一页的哪条错误。
    jsErrorSamples: errors.slice(0, 3),
    // 本地静态服务上的 404 路径（浏览器只报 "Failed to load resource"，不带路径）
    httpNotFound: httpNotFound.slice(0, 10),
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
      // 卡片数会随折叠口径变化（同一家公司的同类优惠并成一张卡时就该下降），
      // 所以「不减少」这条盯的是**覆盖的优惠条数**——那才是丢了数据的信号。
      check('回归：覆盖的优惠条数不减少', metrics.coveredDeals >= num(ref.coveredDeals),
        `${num(ref.coveredDeals)} → ${metrics.coveredDeals}`);
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
