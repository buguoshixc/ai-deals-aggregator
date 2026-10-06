#!/usr/bin/env node
/**
 * secondary-page-layout-unification · Before/After 几何探针（t3 证据，独立实现）
 *
 * 它是**独立的一份**：不 require `scripts/tools/verify-site.js` 的任何东西，自己起静态服务、
 * 自己量、自己判。存在的理由有两条：
 *   ① §22c 的权威读数必须有一份**不同实现**的对照 —— 同一个判据在一处写错时，两份独立读数
 *      不会一起错（也正是 t4 独立复核要对的东西）；
 *   ② M-disk 落盘级变异循环要在**产物侧**判红/判绿，不依赖被测脚本本身（自己判自己）。
 *
 * 量什么（prompt §12 的全部样本页）：
 *   · 三档桌面 1440×900 / 1280×800 / 1024×768：
 *     `main` 宽 / 主数据区宽（声明选择器，命不中回落 <main>）/ **顶部说明**宽 / **底部说明**宽 /
 *     左右边缘（note、main、region 各自的 left..right）/ note÷data 比例；
 *   · 三档窄屏 760 / 390 / 360：`documentElement.scrollWidth` 与 `clientWidth`。
 * 另加一轮**全站扫描**（产物里的每个 index.html）：1440 量几何、390 量 scrollWidth ——
 * 这样"48 个窄说明页"这类全站读数也是独立可数的。
 *
 * 样本 id/slug **现场推导**（不写死）：路由来自产物目录（遍历 index.html），
 * 真实 deal id / model slug 与 deals.json、models.json 逐个对账；分类与厂商来自 sitemap.xml。
 *
 * 判据（本脚本自带的一份，写法与 §22c 的 `wideProblems()` 同义但独立实现）：
 *   note-narrow  topNote.width < 0.85 × min(主数据区宽, 页面列宽)
 *   note-axis    说明与「主数据区」和「页面主容器 <main>」**都不**同轴（左右各容差 1px）
 *   note-clipped 说明自身 scrollWidth > clientWidth + 1
 *   page-overflow@<vw>  documentElement.scrollWidth > clientWidth + 1
 *   data-region-missing 没有唯一 <main>，或主数据区宽 ≤ 0
 *
 * 用法：
 *   node research/_raw/secondary-page-layout-unification/geometry/wide-probe.cjs \
 *        --dir=dist --label=after --out=<json> [--no-sweep] [--allow-violations]
 * 退出码：发现违规码 ⇒ 1（可用作独立门禁）；否则 0。
 */

'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright-core');

const arg = name => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const ROOT = path.join(__dirname, '..', '..', '..', '..');
const resolve = p => (path.isAbsolute(p) ? p : path.join(ROOT, p));
const DIR = resolve(arg('dir') || 'dist');
const LABEL = arg('label') || path.basename(DIR);
const OUT = arg('out') ? resolve(arg('out')) : null;
const NO_SWEEP = process.argv.includes('--no-sweep');
const ALLOW_VIOLATIONS = process.argv.includes('--allow-violations');
const EDGE = process.env.DSH_EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
/** M-disk 用：只量一个路由（快速判红/判绿），但仍然走完整判据 */
const ONLY = arg('only');

const TOL = 1;
const NOTE_RATIO = 0.85;
const DESKTOP_VIEWPORTS = [
  { width: 1440, height: 900 }, { width: 1280, height: 800 }, { width: 1024, height: 768 }
];
const NARROW_VIEWPORTS = [
  { width: 760, height: 800 }, { width: 390, height: 800 }, { width: 360, height: 800 }
];
/** 主数据区候选选择器：与生产判据同一张表（**定义**是从生产借来的，**实现**是本脚本自己的） */
const DATA_SELECTORS = ['.ctable', '.stable', '.chgsec', '.chglist', '.flist', '.fsec', '.ptable', '.lsum', '.pchglist'];
const SAMPLE_FIXED = [
  '', 'student/', 'developer/', 'free-api/', 'need/edu-identity/', 'need/free-tier/', 'need/dev-credits/',
  'category/', 'vendor/', 'status/', 'changes/', 'feeds/', 'plans/', 'plans/coding/', 'plans/api/',
  'models/', 'archive/', 'docs/data/'
];

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2'
};

function serve(dir) {
  return new Promise(resolvePromise => {
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
    server.listen(0, '127.0.0.1', () => resolvePromise({ server, port: server.address().port, notFound }));
  });
}

/** 产物里的全部页面路由（遍历 index.html），与 canonical 同一口径：带尾斜杠、首页是空串 */
function routesFromDisk() {
  const routes = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.toLowerCase() === 'index.html') {
        const rel = path.relative(DIR, full).split(path.sep).join('/');
        routes.push(rel === 'index.html' ? '' : rel.replace(/index\.html$/, ''));
      }
    }
  };
  walk(DIR);
  return routes.sort();
}

/** 样本 id/slug 现场推导：磁盘路由 ∩ 数据文件 */
function deriveSamples(routes) {
  const notes = [];
  const onDisk = new Set(routes);
  const deals = JSON.parse(fs.readFileSync(path.join(ROOT, 'deals.json'), 'utf8')).deals.map(d => d.id);
  const models = JSON.parse(fs.readFileSync(path.join(ROOT, 'models.json'), 'utf8')).models.map(m => m.slug);
  const sitemapFile = path.join(DIR, 'sitemap.xml');
  const sitemap = fs.existsSync(sitemapFile)
    ? [...fs.readFileSync(sitemapFile, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)]
      .map(hit => new URL(hit[1]).pathname.replace(/^.*\/ai-deals-aggregator\//, '').replace(/^\//, ''))
    : [];
  const sitemapSet = new Set(sitemap);

  const picks = {};
  const pick = (family, test, validate, label) => {
    const hit = routes.find(route => test(route) && validate(route));
    if (hit) {
      picks[family] = hit;
      notes.push(`${family}：${hit}（${label}）`);
    } else {
      notes.push(`${family}：产物里没有可用路由（跳过，如实记录）`);
    }
    return hit;
  };

  pick('deal', route => /^deal\/[^/]+\/$/.test(route), route => deals.includes(route.split('/')[1]), 'id 在 deals.json 里');
  pick('model', route => /^models\/[^/]+\/$/.test(route), route => models.includes(route.split('/')[1]), 'slug 在 models.json 里');
  pick('category', route => /^category\/[^/]+\/$/.test(route), route => sitemapSet.has(route), '在 sitemap.xml 里');
  pick('vendor', route => /^vendor\/[^/]+\/$/.test(route), route => sitemapSet.has(route), '在 sitemap.xml 里');
  pick('archive-detail', route => /^archive\/[^/]+\/[^/]+\/$/.test(route), () => true, '磁盘上真实存在');

  const samples = [...new Set([...SAMPLE_FIXED, ...Object.values(picks)])].filter(route => onDisk.has(route));
  const missingFixed = SAMPLE_FIXED.filter(route => !onDisk.has(route));
  return { samples, picks, notes, missingFixed, sourceIds: { deals: deals.length, models: models.length, sitemapRoutes: sitemap.length } };
}

/** 当前页面的几何量测（一次 evaluate，不导航） */
async function measure(target) {
  return target.evaluate(`(() => {
    const DATA_SELECTORS = ${JSON.stringify(DATA_SELECTORS)};
    const round = n => Math.round(n * 100) / 100;
    const box = el => {
      if (!el) return null;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        left: round(r.left + window.scrollX), right: round(r.right + window.scrollX), width: round(r.width),
        scrollWidth: el.scrollWidth, clientWidth: el.clientWidth,
        maxWidth: cs.maxWidth, overflowWrap: cs.overflowWrap
      };
    };
    const mains = Array.prototype.slice.call(document.querySelectorAll('main'));
    const main = mains.length ? mains[0] : null;
    let regionEl = null;
    let regionSel = null;
    for (const sel of DATA_SELECTORS) {
      const hit = document.querySelector(sel);
      if (hit) { regionSel = sel; regionEl = hit; break; }
    }
    const notes = main ? Array.prototype.slice.call(main.querySelectorAll('.snote')) : [];
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
      region: box(regionEl || main),
      noteCount: notes.length,
      topNote: box(notes.length ? notes[0] : null),
      bottomNote: box(notes.length > 1 ? notes[notes.length - 1] : null),
      topNoteText: notes.length ? notes[0].textContent.replace(/\\s+/g, ' ').trim().slice(0, 28) : '',
      frozenRuleCount: Array.prototype.slice.call(document.querySelectorAll('style'))
        .reduce((sum, s) => sum + (s.textContent.split('.snote { color: var(--mut); font-size: var(--fs-sm); line-height: 1.7; margin: 0 0 var(--s3); max-width: none; overflow-wrap: anywhere; }').length - 1), 0)
    };
  })()`);
}

/** 本脚本自带的判据：一次量测 ⇒ 违规码（与 §22c 同义、独立实现） */
function problemsOf(g) {
  const out = [];
  const vw = g.doc.clientWidth;
  if (g.mainCount !== 1) out.push({ code: 'data-region-missing', msg: `<main> ${g.mainCount} 个` });
  else if (!g.region || !(g.region.width > 0)) out.push({ code: 'data-region-missing', msg: '主数据区宽为 0' });
  if (g.mainCount === 1 && g.region && g.region.width > 0 && g.noteCount > 0 && g.topNote) {
    const column = Math.min(g.region.width, g.main.width);
    if (g.topNote.width < NOTE_RATIO * column - 0.01) {
      out.push({ code: 'note-narrow', msg: `说明宽 ${g.topNote.width}px < ${NOTE_RATIO}×${column}px（主数据区 ${g.regionSel || '<main>'} ${g.region.width}px · 页面列 ${g.main.width}px）` });
    }
    const inRegion = Math.abs(g.topNote.left - g.region.left) <= TOL && Math.abs(g.topNote.right - g.region.right) <= TOL;
    const inMain = Math.abs(g.topNote.left - g.main.left) <= TOL && Math.abs(g.topNote.right - g.main.right) <= TOL;
    if (!inRegion && !inMain) {
      out.push({ code: 'note-axis', msg: `说明 ${g.topNote.left}..${g.topNote.right} vs 主数据区 ${g.region.left}..${g.region.right} / 页面列 ${g.main.left}..${g.main.right}` });
    }
    if (g.topNote.scrollWidth > g.topNote.clientWidth + TOL) {
      out.push({ code: 'note-clipped', msg: `说明自身溢出 ${g.topNote.scrollWidth - g.topNote.clientWidth}px` });
    }
  }
  if (g.doc.scrollWidth > vw + TOL) out.push({ code: `page-overflow@${vw}`, msg: `scrollWidth ${g.doc.scrollWidth} > 视口 ${vw}` });
  return out;
}

const slim = g => ({
  main: g.main, region: g.region, regionSel: g.regionSel, regionFallback: g.regionFallback,
  topNote: g.topNote, bottomNote: g.bottomNote, noteCount: g.noteCount, topNoteText: g.topNoteText,
  doc: g.doc, mainCount: g.mainCount, detailMainCount: g.detailMainCount, frozenRuleCount: g.frozenRuleCount,
  ratioTopToRegion: g.topNote && g.region && g.region.width ? Math.round((g.topNote.width / g.region.width) * 10000) / 10000 : null,
  ratioTopToColumn: g.topNote && g.main && g.region && g.main.width
    ? Math.round((g.topNote.width / Math.min(g.region.width, g.main.width)) * 10000) / 10000 : null
});

(async () => {
  if (!fs.existsSync(path.join(DIR, 'index.html'))) {
    console.error(`找不到 ${path.relative(ROOT, DIR)}/index.html`);
    process.exit(2);
  }
  const routes = routesFromDisk();
  const derived = deriveSamples(routes);
  const sampleRoutes = ONLY ? [ONLY] : derived.samples;
  const started = await serve(DIR);
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(`${page.url()} :: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`${page.url()} :: ${m.text()}`); });
  let navigations = 0;
  const goto = async (route, viewport) => {
    await page.setViewportSize(viewport);
    navigations += 1;
    await page.goto(new URL(route, `http://127.0.0.1:${started.port}/`).href, { waitUntil: 'load' });
  };

  /** 样本页：三档桌面全量几何 + 三档窄屏 scrollWidth */
  const samples = [];
  for (const route of sampleRoutes) {
    const record = { route, viewports: {} };
    for (const viewport of DESKTOP_VIEWPORTS) {
      await goto(route, viewport);
      const g = await measure(page);
      record.viewports[String(viewport.width)] = { mode: 'desktop', ...slim(g), codes: problemsOf(g).map(p => p.code), messages: problemsOf(g) };
    }
    for (const viewport of NARROW_VIEWPORTS) {
      await goto(route, viewport);
      const g = await measure(page);
      record.viewports[String(viewport.width)] = { mode: 'narrow', ...slim(g), codes: problemsOf(g).map(p => p.code), messages: problemsOf(g) };
    }
    samples.push(record);
  }

  /** 全站扫描：1440 几何 + 390 scrollWidth */
  const sweep = { total: 0, viewports: [1440, 390], violations: [], codes: {} };
  if (!NO_SWEEP && !ONLY) {
    for (const route of routes) {
      await goto(route, DESKTOP_VIEWPORTS[0]);
      const g1440 = await measure(page);
      await goto(route, NARROW_VIEWPORTS[1]);
      const g390 = await measure(page);
      sweep.total += 1;
      const codes = [...problemsOf(g1440).map(p => p.code), ...problemsOf(g390).map(p => p.code)];
      for (const code of codes) sweep.codes[code] = (sweep.codes[code] || 0) + 1;
      if (codes.length) {
        sweep.violations.push({
          route, codes,
          noteWidth: g1440.topNote ? g1440.topNote.width : null,
          regionWidth: g1440.region ? g1440.region.width : null,
          regionSel: g1440.regionSel, noteCount: g1440.noteCount,
          scrollWidth: g390.doc.scrollWidth, clientWidth: g390.doc.clientWidth
        });
      }
    }
  }

  await browser.close();
  started.server.close();

  const sampleViolations = [];
  for (const record of samples) {
    for (const [viewport, data] of Object.entries(record.viewports)) {
      if (data.codes.length) sampleViolations.push({ route: record.route, viewport: Number(viewport), codes: data.codes, messages: data.messages });
    }
  }

  const report = {
    label: LABEL,
    dir: path.relative(ROOT, DIR).replace(/\\/g, '/'),
    at: new Date().toISOString(),
    edge: EDGE,
    desktopViewports: DESKTOP_VIEWPORTS, narrowViewports: NARROW_VIEWPORTS,
    dataSelectors: DATA_SELECTORS, noteRatio: NOTE_RATIO, tolerance: TOL,
    routesTotal: routes.length,
    derivation: { notes: derived.notes, picks: derived.picks, missingFixed: derived.missingFixed, sourceIds: derived.sourceIds, sampleCount: sampleRoutes.length },
    navigations,
    jsErrors: errors,
    samples,
    sampleViolations,
    sweep,
    problems: [
      ...sampleViolations.map(v => `${v.route || '/'}@${v.viewport} [${v.codes.join(', ')}]`),
      ...sweep.violations.map(v => `${v.route || '/'} [${v.codes.join(', ')}]`)
    ]
  };

  if (OUT) {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }

  console.log(`探针：${report.dir}（label=${LABEL}）· 页面 ${routes.length} 个 · 导航 ${navigations} 次 · JS 错误 ${errors.length}`);
  console.log(`样本推导：${derived.notes.join(' · ')}`);
  console.log(`样本集 ${sampleRoutes.length} 个：${sampleRoutes.map(r => r || '/').join(' ')}`);
  if (derived.missingFixed.length) console.log(`  ⚠ 磁盘上缺的固定样本：${derived.missingFixed.join(' ')}`);
  const header = ['页面', '@vw', 'main宽', '数据区', '顶部说明', '底部说明', '说明left..right', 'ratio', 'scrollW', '码'];
  const widths = [26, 6, 9, 9, 10, 10, 22, 8, 9, 40];
  const cjk = txt => [...String(txt)].reduce((n, ch) => n + (/[\u2E80-\uA4CF\uFF00-\uFF60]/.test(ch) ? 2 : 1), 0);
  const cell = (txt, w) => String(txt) + ' '.repeat(Math.max(0, w - cjk(txt)));
  console.log(`\n${header.map((h, i) => cell(h, widths[i])).join('')}`);
  for (const record of samples) {
    for (const viewport of ['1440', '1280', '1024', '760', '390', '360']) {
      const d = record.viewports[viewport];
      const top = d.topNote ? `${d.topNote.width}px` : '（无）';
      const bottom = d.bottomNote ? `${d.bottomNote.width}px` : '—';
      const edges = d.topNote ? `${d.topNote.left}..${d.topNote.right}` : '—';
      console.log([
        cell(record.route || '/', widths[0]), cell(viewport, widths[1]),
        cell(d.main ? d.main.width : '-', widths[2]), cell(d.region ? `${d.region.width}` : '-', widths[3]),
        cell(top, widths[4]), cell(bottom, widths[5]), cell(edges, widths[6]),
        cell(d.ratioTopToColumn === null ? '-' : d.ratioTopToColumn.toFixed(3), widths[7]),
        cell(d.doc.scrollWidth, widths[8]), cell(d.codes.join(',') || '无', widths[9])
      ].join(''));
    }
  }
  console.log(`\n全站扫描：${sweep.total} 页 · 违规页 ${sweep.violations.length} · 违规码计数 ${JSON.stringify(sweep.codes)}`);
  console.log(`样本违规：${sampleViolations.length} 条`);
  console.log(`${report.problems.length ? '❌' : '✅'} 探针结论：${report.problems.length ? `${report.problems.length} 处违规码` : '0 违规码'}${OUT ? ` · 证据 ${path.relative(ROOT, OUT).replace(/\\/g, '/')}` : ''}`);
  process.exit(report.problems.length && !ALLOW_VIOLATIONS ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
