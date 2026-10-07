#!/usr/bin/env node
'use strict';
/**
 * secondary-page-content-simplification —— Before / After 读数工具（一次性验收装置）。
 *
 * 为什么它是**一次性装置**而不是门禁：
 *   本轮的门禁落在既有的 §22c（`verify-site.js`）与 `build-local.js` 的产物自检里。
 *   这个脚本只负责回答「改动前后各是多少」——那是报告里的数字，不是不变量。
 *   放在 `research/<轮次>-verify/`（与 `research/architecture-modernization-v1/verify/`
 *   同一惯例）而不是 `research/_raw/`：`.gitignore:93-95` 会把 `_raw/**` 下的
 *   `.txt` / `.log` / `.cjs` 全部忽略掉 —— 一次性装置要能被评审打开才有意义。
 *
 * 用法：
 *   node research/secondary-page-content-simplification-verify/readings.cjs \
 *     --dir=dist.baseline --label=before --out=research/_raw/secondary-page-content-simplification/before.json
 *   node research/secondary-page-content-simplification-verify/readings.cjs \
 *     --dir=dist --label=after --out=research/_raw/secondary-page-content-simplification/after.json
 *
 * 两部分读数：
 *   ① 静态（全部路由，逐个读 HTML）：正文长度 / 下限 / 余量、数据行数、
 *      详情链接指纹、JSON-LD、canonical、title、description、各 .snote 块文本；
 *   ② 真浏览器（样本路由 × 三档视口）：标题块底边、**首个数据区顶边**、两者距离、
 *      页高、首个 .snote 的行数与字数、底部 `details.page-notes` 是否存在。
 */

const fs = require('fs');
const http = require('http');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const arg = name => (process.argv.find(a => a.startsWith(`--${name}=`)) || '').slice(name.length + 3);
const DIR = path.resolve(ROOT, arg('dir') || 'dist');
const LABEL = arg('label') || 'unlabeled';
const OUT = arg('out') ? path.resolve(ROOT, arg('out')) : null;
const EDGE = process.env.DSH_EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const pageKinds = require(path.join(ROOT, 'scripts', 'lib', 'page-kinds.js'));

/* ------------------------------------------------------------------ */
/* 静态读数                                                             */
/* ------------------------------------------------------------------ */

/** 与 build-local.js 的 prerenderedText 同一口径（剥 script / style / 标签 / 空白） */
function prerenderedText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const stripTags = chunk => chunk.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

/** 站内全部路由（'' 表示首页），来自磁盘 */
function routesFromDisk(dir) {
  const out = [];
  const walk = (rel) => {
    const abs = path.join(dir, rel);
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const child = `${rel}${entry.name}/`;
      if (fs.existsSync(path.join(dir, child, 'index.html'))) out.push(child);
      walk(child);
    }
  };
  if (fs.existsSync(path.join(dir, 'index.html'))) out.push('');
  walk('');
  return out.sort();
}

/** 路由 → kind。动态路由按目录形态判定（与 build-local 的目录页家族一致） */
function kindByRoute(route) {
  const fixed = pageKinds.kindOfRoute(route);
  if (fixed) return fixed;
  if (/^need\/[^/]+\/$/.test(route)) return 'need';
  if (/^vendor\/[^/]+\/$/.test(route)) return 'vendor';
  if (/^category\/[^/]+\/$/.test(route)) return 'category';
  if (/^(student|developer|free-api)\/$/.test(route)) return 'collection';
  if (route === 'category/' || route === 'vendor/') return 'hub';
  return null;
}

/**
 * `data-item` / `data-child` 的行数 —— 与门禁同一口径（先摘 `<script>`，
 * 否则内联 RENDER-CORE 里的标记会被算成真实行）。
 */
function rowCount(html) {
  const noScript = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  return (noScript.match(/data-item="/g) || []).length + (noScript.match(/data-child="/g) || []).length;
}

/** 全部 href 的集合（排序后比较，不看顺序）——「链接 0 变化」的机器证据。
 *  存**计数 + sha256** 而不是整个数组：186 页 × 约 100 条 href 会让这份读数
 *  膨胀到几十万行，而「集合相同」这件事由 `diff-verify.cjs` 逐页判过、
 *  这里只需要一个可复核的指纹（两个 JSON 的同名字段一比即知）。 */
function hrefDigest(html) {
  const noScript = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  const set = [...new Set([...noScript.matchAll(/href="([^"]*)"/g)].map(m => m[1]))].sort();
  return { hrefCount: set.length, hrefSha: require('crypto').createHash('sha256').update(set.join('\n')).digest('hex') };
}

/** 三段 JSON-LD 的原文（逐字节比较 —— 本轮要求 0 semantic change） */
function jsonLd(html) {
  const noScript = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  return [...noScript.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => m[1]);
}

function staticReading(dir, route) {
  const file = path.join(dir, route, 'index.html');
  const html = fs.readFileSync(file, 'utf8');
  const kind = kindByRoute(route);
  const rows = rowCount(html);
  const text = prerenderedText(html).length;
  const floor = kind ? pageKinds.textFloor(kind, rows) : null;
  const main = (html.match(/<main\b[\s\S]*?<\/main>/) || [''])[0];
  const snoteBlocks = [...main.matchAll(/<p class="snote"[^>]*>([\s\S]*?)<\/p>/g)].map(m => stripTags(m[1]));
  const caption = (main.match(/<caption>([\s\S]*?)<\/caption>/) || [, ''])[1];
  const summarySmall = [...main.matchAll(/data-summary-label="[^"]*"[^>]*>[\s\S]*?<small[^>]*>([\s\S]*?)<\/small>/g)]
    .map(m => stripTags(m[1]));
  const pageNotes = main.match(/<details class="page-notes">([\s\S]*?)<\/details>/);
  return {
    route,
    kind,
    rows,
    textLength: text,
    textFloor: floor,
    headroom: floor === null ? null : text - floor,
    snoteCount: snoteBlocks.length,
    snoteBlocks,
    introChars: snoteBlocks.length ? snoteBlocks[0].length : 0,
    captionChars: stripTags(caption).length,
    captionText: stripTags(caption),
    summarySmallChars: summarySmall.join('').length,
    pageNotesPresent: Boolean(pageNotes),
    pageNotesChars: pageNotes ? stripTags(pageNotes[1]).length : 0,
    jsonLdSha: jsonLd(html).map(s => require('crypto').createHash('sha256').update(s).digest('hex')),
    title: (html.match(/<title>([\s\S]*?)<\/title>/) || [, ''])[1],
    description: (html.match(/<meta name="description" content="([^"]*)"/) || [, ''])[1],
    canonical: (html.match(/<link rel="canonical" href="([^"]*)"/) || [, ''])[1],
    robots: (html.match(/<meta name="robots" content="([^"]*)"/) || [, ''])[1],
    ...hrefDigest(html)
  };
}

/* ------------------------------------------------------------------ */
/* 真浏览器读数                                                          */
/* ------------------------------------------------------------------ */

const MIME = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.xml': 'application/xml', '.svg': 'image/svg+xml', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.txt': 'text/plain' };

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

/** 页面内量测：几何 + 首个 .snote 的行数。与 verify-site.js §22c 的 mergeLines 同一口径。 */
const MEASURE = `(() => {
  const round = v => Math.round(v * 100) / 100;
  const rect = el => (el ? el.getBoundingClientRect() : null);
  const main = document.querySelector('main');
  if (!main) return { missingMain: true };

  // 首个数据区：文档序最先命中的那个（与 §22c 的 DATA_SELECTORS 同一族，另加 .chgsec/.flist）
  const DATA = ['.lsum', '.ctable', '.stable', '.ptable', '.chgsec', '.flist'];
  let region = null, regionSel = null;
  for (const sel of DATA) {
    const hit = main.querySelector(sel);
    if (!hit) continue;
    const box = rect(hit);
    if (!region || box.top < region.top) { region = box; regionSel = sel; }
  }

  const cstop = main.querySelector('.cstop, .stop');
  const titleBottom = cstop ? rect(cstop).bottom : null;

  // 首个 .snote 的行数与字数（逐行归并，与 §22c 的 ② 同口径）
  const mergeLines = rects => {
    const sorted = rects.slice().sort((a, b) => a.top - b.top || a.left - b.left);
    const lines = [];
    for (const r of sorted) {
      const hit = lines.find(l => {
        const overlap = Math.min(l.bottom, r.bottom) - Math.max(l.top, r.top);
        return overlap > 0.5 * Math.min(l.height, r.height);
      });
      if (hit) { hit.left = Math.min(hit.left, r.left); hit.right = Math.max(hit.right, r.right);
        hit.top = Math.min(hit.top, r.top); hit.bottom = Math.max(hit.bottom, r.bottom); }
      else lines.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom, height: r.height });
    }
    return lines;
  };
  const glyphRects = el => {
    const out = [];
    const walk = node => {
      for (const child of node.childNodes) {
        if (child.nodeType === 3) {
          if (!child.textContent.trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(child);
          for (const r of range.getClientRects()) if (r.width > 0 && r.height > 0) out.push(r);
        } else if (child.nodeType === 1 && child.tagName !== 'NOSCRIPT') walk(child);
      }
    };
    walk(el);
    return out;
  };
  const visibleText = el => {
    let s = '';
    const walk = node => {
      for (const c of node.childNodes) {
        if (c.nodeType === 3) s += c.textContent;
        else if (c.nodeType === 1 && c.tagName !== 'NOSCRIPT') walk(c);
      }
    };
    walk(el);
    return s.replace(/\\s+/g, ' ').trim();
  };

  const snotes = [...main.querySelectorAll('.snote')];
  const first = snotes.length ? snotes[0] : null;
  const firstLines = first ? mergeLines(glyphRects(first)) : [];

  const details = main.querySelector('details.page-notes');

  return {
    missingMain: false,
    titleBottom: titleBottom === null ? null : round(titleBottom + window.scrollY),
    firstDataTop: region ? round(region.top + window.scrollY) : null,
    firstDataSel: regionSel,
    introGap: (titleBottom !== null && region) ? round(region.top + window.scrollY - (titleBottom + window.scrollY)) : null,
    pageHeight: Math.round(document.documentElement.scrollHeight),
    snoteCount: snotes.length,
    firstSnoteLines: firstLines.length,
    firstSnoteChars: first ? visibleText(first).length : 0,
    pageNotesPresent: Boolean(details),
    // 折叠块的外围盒（闭合态只有 summary 有盒）——同轴判据的输入
    pageNotesBox: details ? (() => { const b = rect(details); return { left: round(b.left), right: round(b.right), top: round(b.top + window.scrollY), height: round(b.height) }; })() : null,
    mainBox: (() => { const b = rect(main); return { left: round(b.left), right: round(b.right), width: round(b.width) }; })(),
    regionBox: region ? { left: round(region.left), right: round(region.right), width: round(region.width) } : null,
    docScrollWidth: document.documentElement.scrollWidth,
    docClientWidth: document.documentElement.clientWidth
  };
})()`;

/** 抽查路由（prompt §16 指定的那几条 + 最紧下限页） */
const SAMPLE = [
  '', 'student/', 'developer/', 'free-api/',
  'need/edu-identity/', 'need/free-tier/', 'need/free-model/', 'need/dev-credits/',
  'need/ai-coding/', 'need/no-card/', 'need/china-usable/', 'need/free-api/', 'need/free-tokens/',
  'category/', 'category/api/', 'vendor/', 'vendor/zhipu/',
  'status/', 'changes/', 'feeds/', 'plans/', 'plans/coding/', 'plans/api/', 'models/', 'archive/', 'docs/data/'
];
const VIEWPORTS = [{ w: 1440, h: 900 }, { w: 1280, h: 800 }, { w: 390, h: 844 }];

/* ------------------------------------------------------------------ */

(async () => {
  const allRoutes = routesFromDisk(DIR);
  const directoryRoutes = allRoutes.filter(r => kindByRoute(r) && !['deal', 'model', 'archive-detail', 'home'].includes(kindByRoute(r)));

  console.log(`[${LABEL}] dir=${path.relative(ROOT, DIR)} · 路由 ${allRoutes.length} 个 · 目录页族 ${directoryRoutes.length} 个`);

  const staticAll = {};
  for (const route of allRoutes) staticAll[route] = staticReading(DIR, route);

  let geometry = {};
  let browserNote = '';
  if (fs.existsSync(EDGE)) {
    const { chromium } = require(path.join(ROOT, 'node_modules', 'playwright-core'));
    const started = await serve(DIR);
    const browser = await chromium.launch({ executablePath: EDGE, headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e.message)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    for (const route of SAMPLE) {
      if (!fs.existsSync(path.join(DIR, route, 'index.html'))) { geometry[route] = { missing: true }; continue; }
      geometry[route] = {};
      for (const vp of VIEWPORTS) {
        await page.setViewportSize({ width: vp.w, height: vp.h });
        await page.goto(`http://127.0.0.1:${started.port}/${route}`, { waitUntil: 'load' });
        const g = await page.evaluate(MEASURE);
        geometry[route][`${vp.w}x${vp.h}`] = g;
      }
    }
    browserNote = `真浏览器：Edge headless · 样本 ${SAMPLE.length} 路由 × ${VIEWPORTS.length} 档 · JS 错误 ${errors.length}`;
    if (errors.length) browserNote += `：${errors.slice(0, 3).join(' | ')}`;
    await browser.close();
    started.server.close();
  } else {
    browserNote = `浏览器不可用（${EDGE} 不存在）—— 几何读数缺失`;
  }

  const payload = { label: LABEL, dir: path.relative(ROOT, DIR), generatedAt: new Date().toISOString(), browserNote, static: staticAll, geometry };
  if (OUT) {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`);
    console.log(`→ ${path.relative(ROOT, OUT)}`);
  }

  // 控制台摘要：最紧的 6 页 + 样本几何
  const tight = directoryRoutes.map(r => staticAll[r]).filter(x => x.headroom !== null)
    .sort((a, b) => a.headroom - b.headroom).slice(0, 6);
  console.log('\n最紧正文余量（目录页族）:');
  for (const t of tight) {
    console.log(`  ${t.route || '/'} [${t.kind}] rows=${t.rows} text=${t.textLength} floor=${t.textFloor} headroom=${t.headroom} intro=${t.introChars} caption=${t.captionChars} notes=${t.pageNotesPresent ? t.pageNotesChars : '-'}`);
  }
  console.log(`\n${browserNote}`);
  console.log('样本几何 @1440（titleBottom → firstDataTop，distance）:');
  for (const route of SAMPLE) {
    const g = geometry[route] && geometry[route]['1440x900'];
    if (!g || g.missingMain) { console.log(`  ${route || '/'} —— 无读数`); continue; }
    console.log(`  ${(route || '/').padEnd(22)} title=${g.titleBottom} data=${g.firstDataTop}${g.firstDataSel ? `(${g.firstDataSel})` : ''} gap=${g.introGap} height=${g.pageHeight} introLines=${g.firstSnoteLines} introChars=${g.firstSnoteChars} notes=${g.pageNotesPresent ? 'Y' : 'N'}`);
  }
})();
