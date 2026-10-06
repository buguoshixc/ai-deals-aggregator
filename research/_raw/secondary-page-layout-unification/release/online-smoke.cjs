#!/usr/bin/env node
/**
 * secondary-page-layout-unification · Online Smoke（线上几何冒烟）
 *
 * ## 这一支是干什么的 / 不是干什么的
 *
 * 本地门禁（`scripts/tools/verify-site.js` §22c）在**构建产物**上判「页面级说明 vs 主数据区」；
 * 它证明不了**线上真的发出去的是这一份**（CDN 缓存、Pages 部署到一半、发的是上一版）。
 * 这一支只干那一件事：**在真实线上地址上，把 prompt §26 点名的 8 个页面重新量一遍**，
 * 量的是同一套判据里最要害的那几条：
 *
 *   · 桌面 1440×900：页面级说明的**有字区域宽** / 主数据区宽 / `ratio ≥ 0.85` /
 *                    说明与主数据区的**左右边缘**（同轴，容差 max(1px, 5%×列宽)）/
 *                    说明自身不裁切 / **文档级横向溢出**；
 *   · 窄屏 390：`documentElement.scrollWidth` 与 `clientWidth`（必须不溢出）；
 *   · 布局族：wide 族 0 个 `main.detail-main`；detail 族恰好 1 个且 1120px 居中；
 *   · 「一处定义、全站生效」：每页内联样式里那条**冻结的** `.snote` 规则恰好出现 1 次
 *     —— 这一条同时是「线上是不是新产物」的判据（旧产物里没有这条规则）。
 *
 * ## 与 §22c 的关系：**镜像判据，不 import 那份代码**
 *
 * 这里**不 require `scripts/tools/verify-site.js`**（那会把「被测的东西」当判据用）。
 * 常量与算法是**照着 §22c 抄的语义**，抄了三处，都逐字写在这里：
 *   · 主数据区选择器表 `DATA_SELECTORS`（§22c 的 `WIDE_DATA_SELECTORS`）；
 *   · 有字区域宽 `textWidth` = 「直接承载文本、且参与行布局的元素」里最窄的 content box；
 *   · 冻结串 `FROZEN_SNOTE_RULE`（§22c 的 `WIDE_SNOTE_FROZEN`，逐字一致，不许改空格）。
 * 三者任何一处与 `verify-site.js` 漂移，线上冒烟与门禁就会给出不同结论 —— 所以每条读数
 * 都带 `textFallback` / `bearingCount` / `inkWidth`，供人对账「量到的是不是同一个东西」。
 *
 * ## deal id / model slug **现场推导**（不许写死）
 *
 *   · 线上模式：从 `${BASE}sitemap.xml` 取 loc 列表，取第一条 `deal/<id>/` 与第一条
 *     `models/<slug>/`（**排除 `/models/` 索引本身**）；
 *   · 本地模式（`--dir=`）：从磁盘上的 `<dir>/sitemap.xml` 读同一份清单（同一套解析），
 *     读不到才退回 `deals.json` / `models.json`。
 * 两条路径都**不接受**命令行传进来的 id/slug：写死在脚本里的 id 会在数据更新那天静默失效
 * （页面 404 ⇒ 冒烟红在一件与布局无关的事上），而现场推导永远指向当天真实存在的那一页。
 *
 * ## 用法
 *
 *   线上（部署后跑，会访问真实线上域名 ≈ 8 页 × 2 档）：
 *     node research/_raw/secondary-page-layout-unification/release/online-smoke.cjs \
 *          --out=research/_raw/secondary-page-layout-unification/release/online-smoke-result.json
 *
 *   本地 dry-run（**绝不出网**：自己起一个只绑 127.0.0.1 的静态服务，指向 dist）：
 *     node research/_raw/secondary-page-layout-unification/release/online-smoke.cjs \
 *          --dir=dist --only=student/ \
 *          --out=research/_raw/secondary-page-layout-unification/release/online-smoke-dryrun.json
 *
 *   也可以 `--base=http://127.0.0.1:8123/`（外部静态服务，脚本不再自己起服务）。
 *
 * 参数：
 *   --base=<url>     线上/外部服务地址（缺省 = 生产 Pages 地址）
 *   --dir=<path>     本地产物目录（自动起 127.0.0.1:<随机端口> 的静态服务，且**禁止出网**）
 *   --out=<path>     机器可读 JSON 落盘位置（不传则只打印）
 *   --only=<list>    只跑这几页（逗号分隔）：路由原样（`student/`）或 `deal:*` / `model:*`
 *                    （= 现场推导出来的那一条）。**推导照常执行并记录**，只是不导航。
 *   --edge=<path>    浏览器可执行文件（缺省：$DSH_EDGE → Edge 默认路径 → playwright chromium）
 *   --timeout=<ms>   单页导航超时（缺省 30000）
 *   --sitemap-timeout=<ms>  取 sitemap 的超时（缺省 15000；超时 ⇒ 退出码 2，不会静默挂死）
 *
 * 退出码：0 = 全部断言通过；1 = 有断言失败（逐条打印）；2 = 环境/取数失败（同样是拒绝假绿）。
 *
 * ⚠️ 线上模式会产生**真实页面访问**（本仓库有私有 Analytics）。取样走 sitemap.xml 与 JSON，
 *    不额外访问页面；页面访问数恒等于上面的页面清单（8 页 × 2 档）。
 */

'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright-core');

/* ------------------------------------------------------------------ */
/* 判据常量（镜像 §22c，改这里必须同步 scripts/tools/verify-site.js）      */
/* ------------------------------------------------------------------ */

/** 主数据区：第一个命中的声明选择器；一个都不命中时回落 <main>（与 §22c 同一张表、同一顺序）。 */
const DATA_SELECTORS = ['.ctable', '.stable', '.chgsec', '.chglist', '.flist', '.fsec', '.ptable', '.lsum', '.pchglist'];

/** 冻结串：`index.html` 共享 <style> 里**唯一**的那条 `.snote` 规则（§22c 的 WIDE_SNOTE_FROZEN，逐字）。 */
const FROZEN_SNOTE_RULE = '.snote { color: var(--mut); font-size: var(--fs-sm); line-height: 1.7; margin: 0 0 var(--s3); max-width: none; overflow-wrap: anywhere; }';

const NOTE_RATIO = 0.85;   // 有字区域宽 ≥ 0.85 × min(主数据区宽, 页面列宽)
const AXIS_RATIO = 0.05;   // 轴容差 = max(1px, 5% × min(主数据区宽, 页面列宽))
const TOL = 1;             // 亚像素取整容差
const DETAIL_COL_MAX = 1120;   // detail 族内容列（.detail-main）
const DETAIL_CENTER_TOL = 8;   // 居中偏差容差（与 §22b/§22c 同口径）
const DESKTOP = { width: 1440, height: 900 };
const NARROW = { width: 390, height: 844 };

/**
 * prompt §26 点名的页面 + 两条现场推导出来的叶子页。
 *
 *   family        这一页属于哪个布局族（与 scripts/lib/page-kinds.js 的 LAYOUT_FAMILIES 对得上）
 *   requireNotes  是否要求本页**必须有**页面级说明（false = 没有就跳过该条，不算失败，与 §22c 同口径）
 *   why           为什么这一页在这张清单里（写下来，免得下一个人以为是随手挑的）
 */
const PAGE_SPECS = [
  { route: 'student/', family: 'wide', requireNotes: true, why: '宽数据页；曾被压成 70ch 的四个壳之一（§22c M1–M4 变异靶页）' },
  { route: 'need/edu-identity/', family: 'wide', requireNotes: true, why: '按需求页（注册表驱动，slug 随数据走）' },
  { route: 'status/', family: 'wide', requireNotes: true, why: '状态页；§22c 变异靶页，主数据区是 .stable' },
  { route: 'changes/', family: 'wide', requireNotes: true, why: '变化页：全站说明条数最多的一页（13 条），旧判据只看见第一条' },
  { route: 'feeds/', family: 'wide', requireNotes: true, why: '订阅中心；§22c 变异靶页，主数据区是 .flist' },
  { route: 'plans/coding/', family: 'wide', requireNotes: true, why: '套餐对比页：主数据区（.ptable）比页面列还宽的那一类' },
  { derive: 'dealRoute', label: '/deal/<id>/', family: 'detail', requireNotes: false, why: '叶子详情：内容列 1120px 居中；这类页面本来没有页面级说明' },
  { derive: 'modelRoute', label: '/models/<slug>/', family: 'detail', requireNotes: true, why: '叶子详情里**有**页面级说明的那一类（说明同样要 ≥0.85×1120）' }
];

/* ------------------------------------------------------------------ */
/* 参数                                                                */
/* ------------------------------------------------------------------ */

const argvArg = name => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

const PROD_BASE = 'https://buguoshixc.github.io/ai-deals-aggregator/';
const withSlash = url => (url.endsWith('/') ? url : `${url}/`);
const DIR_ARG = argvArg('dir');
const BASE_ARG = argvArg('base');
const OUT = argvArg('out');
const ONLY = (argvArg('only') || '').split(',').map(s => s.trim()).filter(Boolean);
const TIMEOUT = Number(argvArg('timeout') || 30000);
/**
 * 取 sitemap 的超时（毫秒）。**为什么必须有它**（t12 演练得出的结论，不是预防性设计）：
 * `fetch()` 默认**没有超时** —— 线上真出现"连得上但不响应"（CDN 卡住 / 中间设备吞包）时，
 * 没有这一行的话脚本会**静默挂死**（不是失败、不是跳过，是永远停在那里），
 * 而发布链上没人盯着一个不结束的进程。有它之后：超时 ⇒ 明确的 `AbortError` ⇒ 退出码 2。
 */
const SITEMAP_TIMEOUT = Number(argvArg('sitemap-timeout') || 15000);
const EDGE_CANDIDATES = [
  argvArg('edge'),
  process.env.DSH_EDGE,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
].filter(Boolean);

const results = [];
const check = (page, viewport, name, ok, detail) => {
  results.push({ page, viewport, name, ok: Boolean(ok), detail: detail || '' });
  console.log(`  ${ok ? '✓' : '✗'} [${page}${viewport ? ` @${viewport}` : ''}] ${name}${detail ? ' — ' + detail : ''}`);
};

/**
 * sitemap.xml → 站根相对路由（带尾斜杠）。
 *
 * ⚠️ 坑（2026-10-06 dry-run 实测踩到）：`<loc>` 是**绝对 URL**，而这个站部署在**子路径**
 * `/ai-deals-aggregator/` 上 —— 直接砍掉 origin 会得到 `ai-deals-aggregator/deal/<id>/`，
 * 于是 `^deal/…$` 一条都匹配不上，脚本会**静默退到 deals.json** 那条路（读数照样是数字，
 * 只是来源换了）。所以这里显式剥掉「站点根前缀」，前缀按两个来源取：
 *   ① 调用方给的 BASE 的 pathname（线上模式即 `/ai-deals-aggregator/`）；
 *   ② sitemap 里**最短的、以 `/` 结尾的** pathname（通常就是首页，本地模式也认得出）。
 * 两者都取不到时才回落「只去前导斜杠」—— 并把用了哪个来源写进证据里（`rootPrefix`）。
 */
const parseSitemapRoutes = (xml, baseUrlPath) => {
  const locs = [...String(xml).matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map(m => m[1]);
  const paths = locs.map(loc => {
    try { return new URL(loc).pathname; } catch { return String(loc).replace(/^\/+/, ''); }
  });
  const candidates = [];
  if (baseUrlPath && baseUrlPath !== '/') candidates.push(baseUrlPath);
  const roots = paths.filter(p => p.endsWith('/')).sort((a, b) => a.length - b.length);
  if (roots.length) candidates.push(roots[0]);
  const strip = p => {
    for (const prefix of candidates) {
      if (prefix && prefix !== '/' && p.startsWith(prefix)) return p.slice(prefix.length);
    }
    return p.replace(/^\/+/, '');
  };
  const routes = paths.map(strip).map(p => p.replace(/^\/+/, ''));
  return {
    locs,
    routes,
    rootPrefix: candidates.find(prefix => paths.every(p => !prefix || prefix === '/' || p.startsWith(prefix))) || null,
    deals: routes.filter(r => /^deal\/[^/]+\/$/.test(r)),
    // ⚠️ 排除 `/models/` 索引本身：它属于 wide 族，混进来会把 detail 判据打在错的一页上。
    models: routes.filter(r => /^models\/[^/]+\/$/.test(r))
  };
};

/**
 * 现场推导：线上走 HTTP，本地走磁盘（同一套解析）。
 * 两条路径都**不接受**硬编码 id/slug；推不出来就是退出码 2，不制造假绿。
 *
 * 返回里带 `source`：sitemap 那条路失败时会退到 deals.json / models.json，但**必须留痕**
 * （`fallback: true` + 打印一行 ⚠️）—— 静默改换来源与静默跳过一样，都是假绿的温床。
 */
async function deriveRoutes(base, dir) {
  const baseUrlPath = new URL(base).pathname;
  const localSitemap = dir ? path.join(dir, 'sitemap.xml') : null;
  let parsed = null;
  let sitemapError = null;
  if (dir) {
    if (fs.existsSync(localSitemap)) {
      parsed = parseSitemapRoutes(fs.readFileSync(localSitemap, 'utf8'), baseUrlPath);
    } else {
      sitemapError = `${localSitemap} 不存在`;
    }
  } else {
    const url = new URL('sitemap.xml', base).href;
    // ⚠️ 超时是**显式**的：没有 AbortSignal 时 fetch 会无限等（"连得上但不响应"会让你以为脚本在跑）。
    let resp;
    try {
      resp = await fetch(url, { signal: AbortSignal.timeout(SITEMAP_TIMEOUT) });
    } catch (error) {
      const why = error && (error.name === 'TimeoutError' || error.name === 'AbortError')
        ? `超过 ${SITEMAP_TIMEOUT}ms 未响应` : `${error && error.name ? error.name + ': ' : ''}${error && error.message}`;
      throw new Error(`取线上 sitemap 失败：${url} → ${why}（线上模式没有 JSON 退路；退出码 2，不制造假绿）`);
    }
    if (!resp.ok) throw new Error(`取线上 sitemap 失败：${url} → HTTP ${resp.status}（线上模式没有 JSON 退路；退出码 2，不制造假绿）`);
    parsed = parseSitemapRoutes(await resp.text(), baseUrlPath);
  }
  if (parsed && parsed.deals.length && parsed.models.length) {
    return { source: dir ? `sitemap:${localSitemap}` : 'sitemap:http', fallback: false, rootPrefix: parsed.rootPrefix, ...parsed };
  }
  // ⚠️ 这行"退路提示"只在**本地模式**下打：线上模式没有 JSON 退路（页面路由必须来自 sitemap），
  //    在那里说"退到 deals.json"会把人引到错误的方向（t12 演练时发现并修掉的一句话）。
  if (dir && (sitemapError || (parsed && (!parsed.deals.length || !parsed.models.length)))) {
    console.log(`⚠️  sitemap 推导不可用（${sitemapError || `deal ${parsed.deals.length} 条 / models ${parsed.models.length} 条`}）→ 退到 deals.json / models.json`);
  }
  if (!dir) throw new Error(`线上 sitemap 里 deal 路由 ${parsed ? parsed.deals.length : 0} 条 / models 路由 ${parsed ? parsed.models.length : 0} 条 —— 推不出取样页（线上模式没有 JSON 退路：页面路由必须来自 sitemap）`);
  const readJson = name => {
    const p = path.join(dir, name);
    return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
  };
  const deals = readJson('deals.json');
  const models = readJson('models.json');
  const dealRoutes = ((deals && deals.deals) || []).map(d => `deal/${d.id}/`);
  const modelRoutes = ((models && models.models) || []).map(m => `models/${m.slug}/`);
  if (!dealRoutes.length || !modelRoutes.length) {
    throw new Error(`本地模式取不到 deal/model 路由：${localSitemap} 与 deals.json / models.json 都推不出来`);
  }
  return { source: 'json:deals.json+models.json', fallback: true, rootPrefix: null, locs: [], routes: [], deals: dealRoutes, models: modelRoutes };
}

/* ------------------------------------------------------------------ */
/* 本地静态服务（只绑 127.0.0.1，端口由内核分配；只为 dry-run 存在）        */
/* ------------------------------------------------------------------ */

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json'
};

function startStaticServer(rootDir) {
  const root = path.resolve(rootDir);
  const server = http.createServer((req, res) => {
    let rel;
    try { rel = decodeURIComponent(String(req.url).split('?')[0]); } catch { res.writeHead(400).end('bad url'); return; }
    let file = path.resolve(root, rel.replace(/^\/+/, ''));
    if (!file.startsWith(root)) { res.writeHead(403).end('forbidden'); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, base: `http://127.0.0.1:${server.address().port}/` }));
  });
}

/* ------------------------------------------------------------------ */
/* 几何量测（一次 evaluate 拿全；与 §22c 的 wideMeasure 同算法、独立实现） */
/* ------------------------------------------------------------------ */

const measure = (page, cfg) => page.evaluate(({ dataSelectors, frozen }) => {
  const round = n => Math.round(n * 100) / 100;
  const boxOf = el => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      left: round(r.left + window.scrollX), right: round(r.right + window.scrollX), width: round(r.width),
      scrollW: el.scrollWidth, clientW: el.clientWidth,
      padLeft: round(parseFloat(cs.paddingLeft) || 0), padRight: round(parseFloat(cs.paddingRight) || 0),
      maxWidth: cs.maxWidth, overflowWrap: cs.overflowWrap, wordBreak: cs.wordBreak, display: cs.display
    };
  };
  const contentBoxOf = el => {
    const cs = getComputedStyle(el);
    return el.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
  };
  /** 直接含非空白文本节点 ⇒ 这个元素「承载文本」 */
  const bearsText = el => {
    for (const node of el.childNodes) if (node.nodeType === 3 && node.textContent.trim()) return true;
    return false;
  };
  /** 参与行布局才算候选（inline 的 clientWidth 恒为 0） */
  const laysOutLines = el => {
    const display = getComputedStyle(el).display;
    return display !== 'inline' && display !== 'none' && display !== 'contents';
  };
  /** Range 并集 = 字迹（只进报告，不当判据；理由见 §22c 节首：短文本天然填不满列宽） */
  const inkOf = el => {
    const texts = [];
    const walk = node => {
      for (const child of node.childNodes) {
        if (child.nodeType === 3) { if (child.textContent.trim()) texts.push(child); }
        else if (child.nodeType === 1) walk(child);
      }
    };
    walk(el);
    const rects = [];
    for (const text of texts) {
      const range = document.createRange();
      range.selectNodeContents(text);
      for (const rect of range.getClientRects()) if (rect.width > 0 && rect.height > 0) rects.push(rect);
    }
    if (!rects.length) return null;
    const left = Math.min.apply(null, rects.map(r => r.left));
    const right = Math.max.apply(null, rects.map(r => r.right));
    return { left: round(left), right: round(right), width: round(right - left), lines: rects.length };
  };

  const mains = document.querySelectorAll('main');
  const main = mains.length ? mains[0] : null;
  let regionSel = null;
  let regionEl = null;
  for (const sel of dataSelectors) {
    const hit = document.querySelector(sel);
    if (hit) { regionSel = sel; regionEl = hit; break; }
  }
  const styles = Array.prototype.slice.call(document.querySelectorAll('style'));
  let frozenCount = 0;
  for (const style of styles) frozenCount += style.textContent.split(frozen).length - 1;

  const notes = main ? Array.prototype.slice.call(main.querySelectorAll('.snote')) : [];
  return {
    doc: {
      innerWidth: window.innerWidth,
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth
    },
    mainCount: mains.length,
    detailMainCount: document.querySelectorAll('main.detail-main').length,
    mainClass: main ? String(main.className || '') : null,
    main: boxOf(main),
    regionSel,
    regionFallback: !regionSel,
    region: boxOf(regionEl || main),
    frozenCount,
    noteCount: notes.length,
    notes: notes.map((el, index) => {
      const noteBox = boxOf(el);
      const bearing = [];
      if (bearsText(el)) bearing.push(el);
      for (const descendant of el.querySelectorAll('*')) if (laysOutLines(descendant) && bearsText(descendant)) bearing.push(descendant);
      const widths = bearing.map(contentBoxOf).filter(w => w > 0);
      const contentBox = contentBoxOf(el);
      return {
        index,
        text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 32),
        box: noteBox,
        contentBox: round(contentBox),
        textWidth: round(widths.length ? Math.min.apply(null, widths) : (contentBox > 0 ? contentBox : noteBox.width)),
        textFallback: widths.length === 0,
        bearingCount: bearing.length,
        ink: inkOf(el)
      };
    })
  };
}, cfg);

/** §22c 的判据语义，逐条搬过来（返回值 = 问题字符串数组，空 = 全过）。 */
function layoutProblems(geo, spec) {
  const problems = [];
  const vw = geo.doc.clientWidth;
  if (geo.mainCount !== 1) problems.push(`<main> 数量 ${geo.mainCount} ≠ 1（主数据区与回落锚点都不唯一）`);

  if (spec.family === 'detail') {
    if (geo.detailMainCount !== 1) problems.push(`detail 族要求恰好 1 个 main.detail-main，实测 ${geo.detailMainCount} 个（class=${geo.mainClass}）`);
    if (geo.main && vw > DETAIL_COL_MAX) {
      if (Math.abs(geo.main.width - DETAIL_COL_MAX) > TOL) problems.push(`内容列 ${geo.main.width}px ≠ ${DETAIL_COL_MAX}px`);
      const skew = Math.abs(geo.main.left - (vw - geo.main.right));
      if (skew > DETAIL_CENTER_TOL) problems.push(`居中偏差 ${skew}px > ${DETAIL_CENTER_TOL}px（left=${geo.main.left} right=${geo.main.right} vw=${vw}）`);
    }
  } else if (geo.detailMainCount !== 0) {
    problems.push(`wide 族要求 0 个 main.detail-main，实测 ${geo.detailMainCount} 个`);
  }

  if (geo.main && geo.region) {
    const column = Math.min(geo.region.width, geo.main.width);
    const axisTol = Math.max(TOL, AXIS_RATIO * column);
    for (const note of geo.notes) {
      if (note.textWidth < NOTE_RATIO * column - 0.01) {
        problems.push(`#${note.index} 有字区域宽 ${note.textWidth}px < ${NOTE_RATIO} × ${(Math.round(column * 100) / 100)}px`
          + `（盒宽 ${note.box.width}px · 主数据区 ${geo.regionSel || '<main>'} ${geo.region.width}px · 页面列 ${geo.main.width}px`
          + `${note.textFallback ? ' · textFallback 回落' : ''}）`);
      }
      const aligned = [
        { label: `主数据区 ${geo.regionSel || '<main>'}`, box: geo.region },
        { label: '页面主容器 <main>', box: geo.main }
      ].filter(anchor => Math.abs(note.box.left - anchor.box.left) <= axisTol && Math.abs(note.box.right - anchor.box.right) <= axisTol);
      if (!aligned.length) {
        problems.push(`#${note.index} 说明盒 ${note.box.left}~${note.box.right} 与主数据区（${geo.region.left}~${geo.region.right}）`
          + ` 和 <main>（${geo.main.left}~${geo.main.right}）都不在同一轴（容差 ${Math.round(axisTol * 100) / 100}px）`);
      }
      if (note.box.scrollW > note.box.clientW + TOL) {
        problems.push(`#${note.index} 说明自身横向裁切 ${note.box.scrollW - note.box.clientW}px（scrollWidth ${note.box.scrollW} / clientWidth ${note.box.clientW}）`);
      }
    }
  }

  if (geo.doc.scrollWidth > vw + TOL) problems.push(`文档级横向溢出 ${geo.doc.scrollWidth - vw}px（scrollWidth ${geo.doc.scrollWidth} / clientWidth ${vw}）`);
  return problems;
}

/* ------------------------------------------------------------------ */
/* 主流程                                                              */
/* ------------------------------------------------------------------ */

(async () => {
  if (DIR_ARG && BASE_ARG) throw new Error('--dir= 与 --base= 互斥：本地模式请只给 --dir=');
  const evidence = {
    tool: 'secondary-page-layout-unification/online-smoke',
    schemaVersion: 1,
    at: new Date().toISOString(),
    node: process.version,
    playwrightCore: null,
    mode: DIR_ARG ? 'local-dir' : 'online',
    base: null,
    dir: DIR_ARG || null,
    derivation: null,
    thresholds: { noteRatio: NOTE_RATIO, axisRatio: AXIS_RATIO, tol: TOL, detailColumnMax: DETAIL_COL_MAX, detailCenterTol: DETAIL_CENTER_TOL, viewports: [DESKTOP.width, NARROW.width] },
    frozenSnoteRule: FROZEN_SNOTE_RULE,
    pages: [],
    checks: [],
    ok: false,
    failed: null
  };

  let server = null;
  let base;
  if (DIR_ARG) {
    const dirAbs = path.resolve(DIR_ARG);
    if (!fs.existsSync(dirAbs)) throw new Error(`--dir=${DIR_ARG} 不存在`);
    const started = await startStaticServer(dirAbs);
    server = started.server;
    base = started.base;
    console.log(`本地 dry-run：${dirAbs} → ${base}（只绑 127.0.0.1，端口由内核分配；本进程**不会**访问任何外部地址）`);
  } else {
    base = withSlash(BASE_ARG || PROD_BASE);
    console.log(`线上模式：${base}`);
  }
  evidence.base = base;

  // ---- ① 现场推导 deal / model 路由 ----
  const derived = await deriveRoutes(base, DIR_ARG ? path.resolve(DIR_ARG) : null);
  const dealRoute = derived.deals[0];
  const modelRoute = derived.models[0];
  evidence.derivation = {
    source: derived.source,
    fallback: derived.fallback,
    rootPrefix: derived.rootPrefix,
    sitemapLocs: derived.locs.length,
    dealRoutes: derived.deals.length,
    modelRoutes: derived.models.length,
    dealRoute,
    modelRoute,
    note: 'deal id / model slug 全部现场推导（线上 sitemap.xml / 本地 <dir>/sitemap.xml，退路 deals.json / models.json），脚本里不写死任何 id；'
      + '/models/ 索引本身在正则层被排除（^models/<slug>/$）'
  };
  console.log(`推导来源：${derived.source}${derived.fallback ? '（⚠️ 退路，不是 sitemap）' : ''}${derived.rootPrefix ? ` · 站点根前缀 ${derived.rootPrefix}` : ''}`);
  console.log(`推导：deal ${derived.deals.length} 条 → 取 ${dealRoute}`);
  console.log(`推导：models ${derived.models.length} 条（已排除 /models/ 索引） → 取 ${modelRoute}`);

  // ---- ② 组装页面清单（--only 过滤；推导照常执行并记录）----
  const resolveOnly = token => {
    if (token === 'deal:*') return dealRoute;
    if (token === 'model:*') return modelRoute;
    const norm = token === '' ? '' : withSlash(token);
    return norm;
  };
  let specs = PAGE_SPECS.map(spec => {
    if (!spec.derive) return { ...spec, route: spec.route };
    const route = spec.derive === 'dealRoute' ? dealRoute : modelRoute;
    return { ...spec, route, label: spec.label, family: spec.family, requireNotes: spec.requireNotes, why: spec.why };
  });
  if (ONLY.length) {
    const wanted = ONLY.map(resolveOnly);
    const unknown = ONLY.filter((token, i) => !specs.some(spec => spec.route === wanted[i]));
    if (unknown.length) throw new Error(`--only 里有对不上的条目：${unknown.join(' / ')}（可选：${specs.map(s => s.route).join(' / ')} / deal:* / model:*）`);
    specs = specs.filter(spec => wanted.includes(spec.route));
  }

  // ---- ③ 浏览器 ----
  const edge = EDGE_CANDIDATES.find(p => { try { return fs.existsSync(p); } catch { return false; } })
    || (() => { try { return chromium.executablePath(); } catch { return null; } })();
  if (!edge) throw new Error(`找不到浏览器可执行文件（试过：${EDGE_CANDIDATES.join(' / ')} 与 playwright chromium）`);
  const pwVersion = require('playwright-core/package.json').version;
  evidence.playwrightCore = pwVersion;
  evidence.browser = { executablePath: edge };
  console.log(`浏览器：${edge} · playwright-core ${pwVersion}`);
  const browser = await chromium.launch({ executablePath: edge, headless: true });

  // ---- ④ 逐页逐档 ----
  const baseOrigin = new URL(base).origin;
  const externalAll = [];
  for (const spec of specs) {
    const route = spec.route;
    const url = new URL(route, base).href;
    console.log(`\n▶ /${route}（${spec.family} 族${spec.why ? ' · ' + spec.why : ''}）`);
    const pageEvidence = { route, url, family: spec.family, requireNotes: spec.requireNotes, why: spec.why || null, status: null, desktop: null, narrow: null, externalRequests: [] };
    const page = await browser.newPage({ viewport: { ...DESKTOP } });
    // 出口采样：只记 http/https 且 origin ≠ 基线 origin 的请求。
    // 本地模式的用途是**证明 dry-run 绝不出网**（因此它在那里是硬判据）；
    // 线上模式只记不判 —— 线上页面本来就会带 Cloudflare 的 beacon 之类的外部请求。
    page.on('request', request => {
      try {
        const u = new URL(request.url());
        if (!/^https?:$/.test(u.protocol) || u.origin === baseOrigin) return;
        if (!pageEvidence.externalRequests.includes(u.origin)) pageEvidence.externalRequests.push(u.origin);
      } catch { /* data: / blob: 之类忽略 */ }
    });
    try {
      const resp = await page.goto(url, { waitUntil: 'load', timeout: TIMEOUT });
      pageEvidence.status = resp ? resp.status() : null;
      check(route, DESKTOP.width, 'HTTP 200', resp && resp.status() === 200, `status=${resp ? resp.status() : '无响应'}`);
      // 非 200 就跳过这一页的几何（但仍要进证据）——收集与关闭统一由下面的 finally 做，
      // 免得这里再手动 push/close 一次（continue 同样会走 finally）。
      if (!resp || resp.status() !== 200) continue;
      await page.waitForSelector('main', { timeout: TIMEOUT });

      const geo = await measure(page, { dataSelectors: DATA_SELECTORS, frozen: FROZEN_SNOTE_RULE });
      pageEvidence.desktop = geo;
      const problems = layoutProblems(geo, spec);
      check(route, DESKTOP.width, `几何判据（说明 ≥${NOTE_RATIO}×列宽 · 同轴 · 不裁切 · 无溢出 · ${spec.family} 族）`,
        problems.length === 0,
        problems.join('；') || `main ${geo.main && geo.main.width}px · 主数据区 ${geo.regionSel || '<main>（回落）'} ${geo.region && geo.region.width}px · 说明 ${geo.noteCount} 条`
          + (geo.noteCount ? `（#0 ${geo.notes[0].textWidth}px / ratio ${Math.round((geo.notes[0].textWidth / Math.min(geo.region.width, geo.main.width)) * 1000) / 1000}）` : ''));
      check(route, DESKTOP.width, '共享 <style> 里恰好 1 条冻结的 .snote 规则（一处定义、全站生效；同时证明线上是新产物）',
        geo.frozenCount === 1, `frozenCount=${geo.frozenCount}（旧产物 = 0；页面壳又复制第二份 = ≥2）`);
      check(route, DESKTOP.width, '页面级说明存在（§26 点名的页面必须有说明；0 条会让上面那条判据变成空断言）',
        !spec.requireNotes || geo.noteCount >= 1, `noteCount=${geo.noteCount}${spec.requireNotes ? '' : '（本页不要求）'}`);
      if (geo.notes.length) {
        pageEvidence.desktop.notes.forEach((note, index) => {
          const column = Math.min(geo.region.width, geo.main.width);
          check(route, DESKTOP.width, `说明 #${index} 有字区域 / ratio / 左右边缘`,
            note.textWidth >= NOTE_RATIO * column - 0.01,
            `textWidth=${note.textWidth}px · 盒 ${note.box.left}~${note.box.right}（${note.box.width}px）· 列 ${Math.round(column * 100) / 100}px`
              + ` · ratio=${Math.round((note.textWidth / column) * 1000) / 1000} · 字迹 ${note.ink ? note.ink.width : '—'}px/${note.ink ? note.ink.lines : 0} 行 · 文本「${note.text}」`);
        });
      }

      // 窄屏：只量 documentElement.scrollWidth / clientWidth（与 §22c 的 390 档同口径）
      await page.setViewportSize({ ...NARROW });
      await page.waitForTimeout(150);
      const narrow = await measure(page, { dataSelectors: DATA_SELECTORS, frozen: FROZEN_SNOTE_RULE });
      pageEvidence.narrow = narrow;
      check(route, NARROW.width, 'documentElement.scrollWidth ≤ clientWidth + 1（窄屏不横向溢出）',
        narrow.doc.scrollWidth <= narrow.doc.clientWidth + TOL,
        `scrollWidth=${narrow.doc.scrollWidth} · clientWidth=${narrow.doc.clientWidth} · innerWidth=${narrow.doc.innerWidth}`);
    } catch (error) {
      check(route, null, '导航/量测未抛异常', false, `${error.name}: ${error.message}`);
    } finally {
      externalAll.push(...pageEvidence.externalRequests);
      evidence.pages.push(pageEvidence);
      await page.close();
    }
  }

  // ---- ⑤ 出口采样：本地模式必须**一次都不出网**（dry-run 的"绝不出网"是可被机器否证的）----
  evidence.externalRequests = { origins: [...new Set(externalAll)], enforced: Boolean(DIR_ARG) };
  if (DIR_ARG) {
    check('（全轮）', null, '本地模式：整轮零外部请求（dry-run 绝不出网）',
      externalAll.length === 0, externalAll.length ? `出现了外部请求：${[...new Set(externalAll)].join(' / ')}` : '0 个外部 origin');
  } else {
    console.log(`\nℹ️  线上模式出口采样（只记录、不判红）：${[...new Set(externalAll)].join(' / ') || '0 个外部 origin'}`
      + '（线上页面自带的分析探针本来就属于第三方请求）');
  }

  await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));

  const failed = results.filter(r => !r.ok);
  evidence.checks = results;
  evidence.failed = failed.length;
  evidence.ok = failed.length === 0;
  if (OUT) {
    fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
    fs.writeFileSync(path.resolve(OUT), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
    console.log(`\n证据已写出：${OUT}`);
  }
  console.log(`\n${failed.length ? '❌' : '✅'} Online Smoke ${results.length} 项断言，失败 ${failed.length} 项`
    + `（${evidence.pages.length} 页 · ${evidence.mode} · ${evidence.base}）`);
  if (failed.length) {
    failed.forEach(f => console.log(`   ✗ [${f.page}${f.viewport ? ` @${f.viewport}` : ''}] ${f.name} — ${f.detail}`));
    process.exit(1);
  }
})().catch(error => {
  console.error(`FAILED: ${error.message}`);
  process.exit(2);
});
