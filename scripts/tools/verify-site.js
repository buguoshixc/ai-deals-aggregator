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

/** 极简静态服务器：只服务 dist/，避免依赖外部包。
 *  必须像真实静态托管那样把目录解析成 index.html —— 独立详情页的 URL 是
 *  `deal/<id>/`，早先这里直接对目录返回 404，于是「本地 404、线上正常」的假失败。 */
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

  const feeds = await page.evaluate(async () => {
    const links = [...document.querySelectorAll('link[rel="alternate"]')]
      .map(l => ({ type: l.type, href: l.getAttribute('href') }))
      .filter(l => /feed/.test(l.href || ''));
    const json = await (await fetch('feed.json', { cache: 'no-cache' })).json();
    const xml = await (await fetch('feed.xml', { cache: 'no-cache' })).text();
    return {
      links,
      version: json.version,
      jsonItems: json.items.length,
      xmlItems: (xml.match(/<item>/g) || []).length,
      firstUrl: json.items[0] ? json.items[0].url : ''
    };
  });
  check('页面声明了两份订阅源',
    feeds.links.some(l => /rss\+xml/.test(l.type)) && feeds.links.some(l => /feed\+json/.test(l.type)),
    feeds.links.map(l => `${l.type} → ${l.href}`).join(' · ') || '未声明');
  check('feed.json 是 JSON Feed 1.1 且条目与 feed.xml 一致',
    feeds.version === 'https://jsonfeed.org/version/1.1' && feeds.jsonItems > 0 && feeds.jsonItems === feeds.xmlItems,
    `${feeds.jsonItems} 条（xml ${feeds.xmlItems}）· 首条 ${String(feeds.firstUrl).slice(0, 44)}`);

  const ldTypes = await page.evaluate(() => [...document.querySelectorAll('script[type="application/ld+json"]')]
    .map(s => { try { return JSON.parse(s.textContent)['@type']; } catch (e) { return 'PARSE_ERROR'; } }));
  check('结构化数据含 WebSite 节点', ldTypes.includes('WebSite') && ldTypes.includes('Organization'),
    ldTypes.join(' / '));

  console.log('\n=== 15) 独立详情页 ===');
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
      heading: (document.querySelector('.dpane h2') || {}).textContent || '',
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
    heading: (document.querySelector('.dpane h2') || {}).textContent || '',
    official: [...document.querySelectorAll('a')].filter(a => /^https?:/.test(a.getAttribute('href') || '')).length
  }));
  // ⚠️ 取样必须在 `noJsContext.close()` **之前**做完（页面随 context 一起销毁）。
  // ⚠️ 路径必须用绝对 `/deals.json`：此刻页面停在 `deal/<id>/` 下，相对路径会解析成
  //    `deal/<id>/deals.json` → 404 → fetch 抛错 → 整段取样变成 null，
  //    报出来却是「取样失败」，看着像数据缺失。两处都踩过。
  const audienceSample = await noJsPage.evaluate(`(async () => {
    const payload = await (await fetch('/deals.json')).json();
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
    const payload = await (await fetch('/deals.json')).json();
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

  // 搜索：新字段的中文标签词必须能搜到，且 unknown **不进** haystack（否则搜索结果虚高）
  await page.goto(base, { waitUntil: 'load' });
  await waitForApp(page);
  await page.fill('#searchInput', '中国大陆');
  await page.waitForTimeout(350);
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
    const payload = await (await fetch('/deals.json')).json();
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
    check(`/${route.slug}/ 恰好两个订阅源 + 恰好三段 JSON-LD（CollectionPage / BreadcrumbList / ItemList）`,
      info.feeds === 2 && JSON.stringify(info.ldTypes.slice().sort()) === JSON.stringify(COLLECTION_LD),
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
    // 真值取机器可读的那一份：页面与它同源，但**浏览器里读出来的那一页**才算数
    const healthTruth = await page.evaluate(`(async () => {
      const doc = await (await fetch('/source-health.json')).json();
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
  check('列表视图：首屏完整可见 ≥ 12 行（实测 13，卡片视图 9）', rowsView.visible >= 12,
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
