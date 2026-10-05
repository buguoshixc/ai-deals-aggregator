#!/usr/bin/env node
'use strict';
/* eslint-disable no-console */
/**
 * leaf-probe.cjs —— 叶子详情页的**独立**几何探针（audit-repro 自建；T3 脚手架，T4 原样复用）
 *
 * 为什么另起一份：verify-site.js 是实现者/验证者共用的判据实现。独立复查不能靠「再读一遍它的日志」，
 * 也不能 require 它——这里从头写静态服务、等到稳定、量 bounding box，一把尺子量改动前后。
 * 本文件**不 require** scripts/tools/verify-site.js，也不 require 仓库里任何 lib（只 require playwright-core）。
 *
 * 用法：
 *   node research/_raw/leaf-detail-layout-v1/audit/leaf-probe.cjs \
 *     --dir=research/_raw/leaf-detail-layout-v1/baseline/baseline-dist \
 *     --expect=baseline --label=before \
 *     --out=research/_raw/leaf-detail-layout-v1/audit/before.json
 *
 *   node research/_raw/leaf-detail-layout-v1/audit/leaf-probe.cjs --dir=dist --route=deal/2eae0e246de2/
 *   node research/_raw/leaf-detail-layout-v1/audit/leaf-probe.cjs --dir=dist --route=models/claude-opus-5.5/
 *
 * 参数：
 *   --dir=<目录>        被测产物目录（默认 dist；相对路径按 cwd 解析）
 *   --route=<路由>      可重复；也可 --routes=a,b,c。省略时自动发现（/ + 首个 deal 叶子 + 首个 model 叶子）
 *   --out=<文件>        把结果写成 JSON（不写则只打印）
 *   --label=<文本>      JSON 里的运行标签（before / after / mutation-M1 …）
 *   --desktop=1600,1440,1280     桌面视口
 *   --mobile=390                 移动视口
 *   --exe=<路径>        浏览器可执行文件（默认 DSH_EDGE → 系统 Edge → ms-playwright chromium）
 *   --expect=none|baseline|<file.json>   判据集（默认 none：只测量，不下结论）
 *   --mutate=M1|M2|M3|M4|M5|all          在临时副本上做变异后再测（T4 的变异牙；锚点不唯一即报红）
 *   --tmp=<目录>        变异副本根（默认 audit/.tmp）
 *   --quiet             少打印表
 *   --strict-settle     布局未稳定时以退出码 2 报「探针不可信」（默认只警告）
 *
 * 退出码：0 = 判据全过（或无判据）；1 = 判据未过；2 = 探针本身不成立（目录/路由/浏览器/锚点问题）
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

const PROBE_VERSION = '1';
/** 量测对象：叶子详情页的骨架 + 详情列 + Header/Footer。顺序即打印顺序。 */
const SELECTORS = ['.wrap', 'main', '.dpane', '.dpane-more', '.dpane-src', '.topin', 'footer'];

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.ico': 'image/x-icon', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.map': 'application/json; charset=utf-8'
};

// ────────────────────────────────── 参数 ──────────────────────────────────

function parseArgs(argv) {
  const o = {
    dir: null, routes: [], out: null, label: null, exe: null,
    desktop: [1600, 1440, 1280], mobile: 390, expect: 'none', mutate: null,
    extra: [], tmp: null, quiet: false, strictSettle: false, help: false, unknown: null
  };
  for (const a of argv.slice(2)) {
    if (a.startsWith('--dir=')) o.dir = a.slice(6);
    else if (a.startsWith('--route=')) o.routes.push(a.slice(8));
    else if (a.startsWith('--routes=')) o.routes.push(...a.slice(9).split(',').map(s => s.trim()).filter(Boolean));
    else if (a.startsWith('--extra-selectors=')) o.extra.push(...a.slice(18).split(',').map(s => s.trim()).filter(Boolean));
    else if (a.startsWith('--out=')) o.out = a.slice(6);
    else if (a.startsWith('--label=')) o.label = a.slice(8);
    else if (a.startsWith('--exe=')) o.exe = a.slice(6);
    else if (a.startsWith('--desktop=')) o.desktop = a.slice(10).split(',').map(Number).filter(n => Number.isFinite(n) && n > 0);
    else if (a.startsWith('--mobile=')) o.mobile = Number(a.slice(9));
    else if (a.startsWith('--expect=')) o.expect = a.slice(9);
    else if (a.startsWith('--mutate=')) o.mutate = a.slice(9);
    else if (a.startsWith('--tmp=')) o.tmp = a.slice(6);
    else if (a === '--quiet') o.quiet = true;
    else if (a === '--strict-settle') o.strictSettle = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else o.unknown = a;
  }
  return o;
}

function usage() {
  console.log([
    'leaf-probe.cjs —— 叶子详情页独立几何探针',
    '  --dir=<目录>      被测产物目录（默认 dist）',
    '  --route=<路由>    可重复；如 deal/2eae0e246de2/ 或 /models/claude-opus-5.5/',
    '  --out=<文件>      写 JSON',
    '  --label=<文本>    before / after / mutation-M1 …',
    '  --expect=none|baseline|<file.json>',
    '  --mutate=M1|M2|M3|M4|M5|all   在临时副本上变异后再测（副本根用 --tmp= 指定，默认 audit/.tmp）',
    '  --extra-selectors=.crumb,.stop,.minfo,.ptable-wrap   在固定 7 项之外追加量测（对轴检查用）',
    '  --strict-settle / --quiet / --exe=<浏览器路径>'
  ].join('\n'));
}

// ───────────────────────────── 路由与目录 ─────────────────────────────

function normRoute(r) {
  let s = String(r).trim();
  if (s === '' || s === '/') return '/';
  if (!s.startsWith('/')) s = '/' + s;
  if (!s.endsWith('/')) s += '/';
  return s.replace(/\/{2,}/g, '/');
}

function kindOf(route) {
  if (route === '/') return 'home';
  if (/^\/deal\/[^/]+\/$/.test(route)) return 'deal';
  if (/^\/models\/[^/]+\/$/.test(route)) return 'models';
  if (route === '/models/') return 'models-index';
  return 'other';
}

/** 路由 → 该路由实际会被服务的文件（目录路由 → <dir>/index.html）。 */
function routeFile(dir, route) {
  const rel = route.replace(/^\/+/, '').replace(/\/+$/, '');
  return rel === '' ? path.join(dir, 'index.html') : path.join(dir, rel, 'index.html');
}

function listDirs(p) {
  try {
    return fs.readdirSync(p, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort();
  } catch { return []; }
}

/** 自动发现：首页 + 排序后的首个 deal 叶子 + 首个 model 叶子（确定性，不依赖目录枚举顺序）。 */
function discoverRoutes(dir) {
  const routes = ['/'];
  const deals = listDirs(path.join(dir, 'deal'));
  const models = listDirs(path.join(dir, 'models'));
  if (deals.length) routes.push(`/deal/${deals[0]}/`);
  if (models.length) routes.push(`/models/${models[0]}/`);
  return routes;
}

// ──────────────────────────── 自带静态服务 ────────────────────────────

function startServer(rootDir) {
  const root = path.resolve(rootDir);
  const notFound = [];
  const ledger = [];
  const server = http.createServer((req, res) => {
    const raw = (req.url || '/').split('?')[0];
    let urlPath;
    try { urlPath = decodeURIComponent(raw); } catch { urlPath = raw; }
    let rel = urlPath.replace(/^\/+/, '');
    if (rel === '' || rel.endsWith('/')) rel += 'index.html';
    let file = path.resolve(root, rel);
    // 目录 → index.html；无扩展名的裸路径也试 index.html（静态托管的常见行为）
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file) && !path.extname(file)) {
      const alt = path.join(file, 'index.html');
      if (fs.existsSync(alt)) file = alt;
    }
    const inside = file === root || file.startsWith(root + path.sep);
    if (!inside || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      notFound.push(urlPath);
      ledger.push({ path: urlPath, status: 404 });
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found');
      return;
    }
    ledger.push({ path: urlPath, status: 200 });
    res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({ server, root, port: server.address().port, notFound, ledger }));
  });
}

// ───────────────────────────── 浏览器解析 ─────────────────────────────

function loadPlaywright() {
  const local = path.join(__dirname, '..', '..', '..', '..', 'node_modules', 'playwright-core');
  const local2 = path.join(__dirname, '..', '..', '..', '..', '..', 'node_modules', 'playwright-core');
  for (const spec of ['playwright-core', local, local2]) {
    try { return require(spec); } catch { /* 下一个 */ }
  }
  throw new Error('找不到 playwright-core：请在装了 devDependencies 的工作树里跑（npm ci），或用 NODE_PATH 指定');
}

function findBrowser(explicit) {
  const cands = [];
  if (explicit) cands.push(explicit);
  if (process.env.DSH_EDGE) cands.push(process.env.DSH_EDGE);
  cands.push('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe');
  cands.push('C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe');
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright');
  for (const d of listDirs(cache)) {
    if (!/^chromium(_headless_shell)?(-\d+)?$/.test(d)) continue;
    const base = path.join(cache, d);
    for (const rel of ['chrome-win\\chrome.exe', 'chrome-win64\\chrome.exe',
      'chrome-headless-shell-win64\\chrome-headless-shell.exe', 'chrome-win\\headless_shell.exe']) {
      const p = path.join(base, rel);
      if (fs.existsSync(p)) cands.push(p);
    }
  }
  for (const c of cands) { try { if (c && fs.existsSync(c)) return c; } catch { /* ignore */ } }
  return null;
}

// ───────────────────────────── 等到布局稳定 ─────────────────────────────

/**
 * 等真实稳定，而不是等一个魔法毫秒数：连续 3 次采样的几何指纹完全相同才算稳定。
 * 指纹只覆盖被测选择器（骨架/列/页脚），不会因为无关动画抖动而永不收敛。
 */
async function settle(page, selectors, opts = {}) {
  const maxSamples = opts.maxSamples || 25;
  const intervalMs = opts.intervalMs || 120;
  const needStable = opts.needStable || 3;
  const t0 = Date.now();
  const fpOf = () => page.evaluate((sels) => JSON.stringify(sels.map((s) => {
    const el = document.querySelector(s);
    if (!el) return [s, null];
    const r = el.getBoundingClientRect();
    return [s, Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
  })), selectors);
  let prev = null;
  let stable = 0;
  let samples = 0;
  while (samples < maxSamples) {
    const fp = await fpOf();
    samples++;
    if (fp === prev) stable++; else { stable = 0; prev = fp; }
    if (stable >= needStable) break;
    await page.waitForTimeout(intervalMs);
  }
  return { settled: stable >= needStable, samples, stable, elapsedMs: Date.now() - t0 };
}

/** 在页面里量一组选择器：rect + 居中度 + 关键 computed 值。 */
function measureInPage(sels) {
  return (sels) => {
    const docEl = document.documentElement;
    const clientWidth = docEl.clientWidth;
    const box = (el) => {
      const r = el.getBoundingClientRect();
      const round = (n) => Math.round(n * 1000) / 1000;
      return {
        x: round(r.x), y: round(r.y), width: round(r.width), height: round(r.height),
        top: round(r.top), right: round(r.right), bottom: round(r.bottom), left: round(r.left)
      };
    };
    const elements = {};
    for (const sel of sels) {
      const nodes = document.querySelectorAll(sel);
      if (!nodes.length) { elements[sel] = { selector: sel, count: 0, found: false }; continue; }
      const el = nodes[0];
      const cs = getComputedStyle(el);
      const rect = box(el);
      // 居中判据：相对**文档可视宽**（documentElement.clientWidth，已扣掉滚动条）的左右留白差。
      const centerDelta = Math.round(Math.abs(rect.left - (clientWidth - rect.right)) * 1000) / 1000;
      const rec = {
        selector: sel, count: nodes.length, found: true,
        tag: el.tagName.toLowerCase(),
        classes: typeof el.className === 'string' ? el.className : '',
        rect,
        offsetWidth: el.offsetWidth, offsetHeight: el.offsetHeight,
        centerDelta,
        computed: {
          display: cs.display,
          width: cs.width,
          maxWidth: cs.maxWidth,
          wordBreak: cs.wordBreak,
          overflowWrap: cs.overflowWrap,
          boxSizing: cs.boxSizing,
          marginLeft: cs.marginLeft,
          marginRight: cs.marginRight,
          marginInline: cs.marginInline || '',
          paddingLeft: cs.paddingLeft,
          paddingRight: cs.paddingRight,
          flexGrow: cs.flexGrow
        }
      };
      if (nodes.length > 1) {
        rec.matches = [];
        for (let i = 0; i < Math.min(nodes.length, 5); i++) rec.matches.push(box(nodes[i]));
      }
      elements[sel] = rec;
    }
    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      clientWidth,
      clientHeight: docEl.clientHeight,
      scrollWidth: docEl.scrollWidth,
      scrollHeight: docEl.scrollHeight,
      bodyScrollWidth: document.body ? document.body.scrollWidth : null,
      documentElementScrollWidth: docEl.scrollWidth,
      scrollbarWidth: window.innerWidth - clientWidth,
      devicePixelRatio: window.devicePixelRatio,
      elements
    };
  };
}

// ───────────────────────────── 判据（可插拔） ─────────────────────────────

const EXPECT_PRESETS = {
  /**
   * baseline = **改动前**的签名（Captain 快照）。只有三条是 Captain 点名的硬判据，
   * 其余标 extra:true 只作对账参考，不参与退出码——避免「顺手加的红」冒充主线判据。
   */
  baseline: {
    name: 'baseline(pre-fix)',
    note: 'Captain 基线快照签名：deal .dpane=820±1、deal main=1380@1440、.dpane-src word-break=break-all。对不上=快照或探针有问题，报红，不改数字。',
    expectations: [
      { id: 'baseline-deal-dpane-width', kind: 'deal', viewport: 1440, selector: '.dpane', prop: 'offsetWidth', approx: 820, tolerance: 1 },
      { id: 'baseline-deal-main-width', kind: 'deal', viewport: 1440, selector: 'main', prop: 'offsetWidth', approx: 1380, tolerance: 1 },
      { id: 'baseline-deal-dpane-src-wordbreak', kind: 'deal', viewport: 1440, selector: '.dpane-src', prop: 'computed.wordBreak', equals: 'break-all' },
      { id: 'ref-deal-dpane-src-maxwidth', kind: 'deal', viewport: 1440, selector: '.dpane-src', prop: 'computed.maxWidth', equals: '820px', extra: true },
      { id: 'ref-deal-dpane-maxwidth', kind: 'deal', viewport: 1440, selector: '.dpane', prop: 'computed.maxWidth', equals: '820px', extra: true },
      { id: 'ref-model-no-dpane-element', kind: 'models', viewport: 1440, selector: '.dpane', prop: 'count', equals: 0, extra: true },
      { id: 'ref-deal-mobile-scrollwidth', kind: 'deal', viewport: 390, prop: 'documentElementScrollWidth', lte: 390, extra: true },
      { id: 'ref-model-mobile-scrollwidth', kind: 'models', viewport: 390, prop: 'documentElementScrollWidth', lte: 390, extra: true }
    ]
  }
};

/**
 * 从「视口记录」里取值。没有 selector 的属性（documentElementScrollWidth / scrollWidth / clientWidth）
 * 取自视口本身；有 selector 的属性（offsetWidth / rect.width / computed.wordBreak / count）取自该元素。
 * count 是例外：元素不存在时 count=0 仍然是有效观测值（「页面里就没有这个元素」本身是结论）。
 */
function readProp(vp, e) {
  if (!vp) return undefined;
  const prop = e.prop || 'offsetWidth';
  if (!e.selector) return vp[prop];
  const el = vp.elements && vp.elements[e.selector];
  if (!el) return undefined;
  if (prop === 'count') return el.count;
  if (!el.found) return undefined;
  return prop.split('.').reduce((acc, k) => (acc == null ? undefined : acc[k]), el);
}

function evaluateExpectations(spec, measured) {
  const out = [];
  for (const e of spec.expectations) {
    const rec = { id: e.id, extra: !!e.extra, route: e.route || null, kind: e.kind || null, viewport: e.viewport, selector: e.selector || null, prop: e.prop || 'offsetWidth' };
    let target = e.route ? measured.find(m => m.route === normRoute(e.route)) : measured.find(m => m.kind === e.kind);
    if (!target) target = measured.find(m => m.kind === e.kind);
    if (!target) {
      rec.status = 'not-applicable';
      rec.reason = `本次运行里没有 kind=${e.kind || e.route} 的路由`;
      out.push(rec); continue;
    }
    rec.routeUsed = target.route;
    const vp = target.viewports[String(e.viewport)];
    if (!vp) {
      rec.status = 'not-applicable';
      rec.reason = `没有量 ${e.viewport} 视口`;
      out.push(rec); continue;
    }
    const actual = readProp(vp, e);
    rec.actual = actual === undefined ? null : actual;
    if (actual === undefined || actual === null) {
      rec.status = 'failed';
      rec.expected = e.equals !== undefined ? e.equals : (e.approx !== undefined ? `≈${e.approx}±${e.tolerance || 0}` : `<=${e.lte}`);
      rec.reason = e.selector ? `选择器 ${e.selector} 在该页面不存在` : '量不到该属性';
      out.push(rec); continue;
    }
    if (e.equals !== undefined) {
      rec.expected = e.equals;
      rec.status = actual === e.equals ? 'passed' : 'failed';
    } else if (e.approx !== undefined) {
      const tol = e.tolerance || 0;
      rec.expected = `${e.approx}±${tol}`;
      rec.status = Math.abs(Number(actual) - e.approx) <= tol ? 'passed' : 'failed';
    } else if (e.lte !== undefined) {
      rec.expected = `<=${e.lte}`;
      rec.status = Number(actual) <= e.lte ? 'passed' : 'failed';
    } else if (e.gte !== undefined) {
      rec.expected = `>=${e.gte}`;
      rec.status = Number(actual) >= e.gte ? 'passed' : 'failed';
    } else {
      rec.status = 'not-applicable';
      rec.reason = '期望未定义';
    }
    out.push(rec);
  }
  return out;
}

function loadExpectationSpec(name) {
  if (!name || name === 'none') return null;
  if (EXPECT_PRESETS[name]) return EXPECT_PRESETS[name];
  const p = path.resolve(process.cwd(), name);
  if (!fs.existsSync(p)) throw new Error(`--expect=${name} 既不是内置预设，也不是存在的文件`);
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (!Array.isArray(j.expectations)) throw new Error(`${name} 里没有 expectations 数组`);
  return { name: j.name || path.basename(name), note: j.note || '', expectations: j.expectations };
}

// ─────────────────────────────── 变异（牙） ───────────────────────────────
/**
 * 变异牙的两条铁律：
 *  1) 锚点必须唯一（同一文本出现 ≥2 次即锚点不唯一 → 判红，绝不「改了但不知改了哪」）；
 *  2) 变异后必须真的让判据变红（T4 复算时核对），所以这里只负责把「改动前应有的违规码」做出来，
 *     不在这里下结论。
 * 全部改动都发生在**临时副本**上，绝不碰被测目录。
 */
const MUTATIONS = {
  M1: {
    title: '详情列不再居中（.detail-main 的 margin-inline:auto → 0）',
    scope: ['deal', 'models'],
    target: 'css-block', block: '\\.detail-main\\s*\\{[^}]*\\}',
    edits: [{ id: 'kill-center', find: 'margin-inline:\\s*auto', replace: 'margin-inline: 0' }],
    expectViolations: ['center']
  },
  M2: {
    title: '详情列宽退回 820（min(1120px,100%) → 820px）',
    scope: ['deal', 'models'],
    target: 'css-block', block: '\\.detail-main\\s*\\{[^}]*\\}',
    edits: [{ id: 'narrow-column', find: 'min\\(\\s*1120px\\s*,\\s*100%\\s*\\)', replace: '820px' }],
    expectViolations: ['width']
  },
  M3: {
    title: '来源块重新被 820 限宽（.dpane-src max-width:none → 820px）',
    scope: ['deal', 'models'],
    target: 'css-block', block: '\\.dpane-src\\s*\\{[^}]*\\}',
    edits: [{ id: 'src-width', find: 'max-width:\\s*none', replace: 'max-width: 820px' }],
    expectViolations: ['src-width']
  },
  M4: {
    title: '列固定 1120px（min(1120px,100%) → 1120px，小屏必然横向溢出）',
    scope: ['deal', 'models'],
    target: 'css-block', block: '\\.detail-main\\s*\\{[^}]*\\}',
    edits: [{ id: 'fixed-width', find: 'min\\(\\s*1120px\\s*,\\s*100%\\s*\\)', replace: '1120px' }],
    expectViolations: ['page-overflow@390']
  },
  M5: {
    title: '叶子列不再统一（model 叶子的 <main> 丢 class="detail-main"）',
    scope: ['models'],
    target: 'html-main-class', cls: 'detail-main',
    expectViolations: ['leaf-consistency']
  }
};

function resolveMutations(name) {
  if (!name) return [];
  if (name === 'all') return Object.keys(MUTATIONS);
  return name.split(',').map(s => s.trim()).filter(Boolean).map((id) => {
    if (!MUTATIONS[id]) throw new Error(`未知变异 ${id}（可用：${Object.keys(MUTATIONS).join('/')}/all）`);
    return id;
  });
}

/** 在一段文本里做「锚点唯一」替换；出现 0 次 = 锚点缺失，≥2 次 = 锚点不唯一，两种都报红。 */
function applyEdit(text, edit) {
  const re = new RegExp(edit.find, 'g');
  const hits = text.match(re);
  const count = hits ? hits.length : 0;
  if (count !== 1) {
    return { ok: false, count, text, reason: `锚点 /${edit.find}/ 在页面里出现 ${count} 次（要求恰好 1 次）` };
  }
  return { ok: true, count, text: text.replace(re, edit.replace), reason: null };
}

/** 对单个页面的 HTML 文本施加一个变异。返回 { ok, text, steps }。 */
function mutateHtml(html, mut) {
  const steps = [];
  if (mut.target === 'html-main-class') {
    const re = /<main\b([^>]*)>/g;
    const matches = [...html.matchAll(re)];
    const withCls = matches.filter(m => new RegExp(`class="[^"]*\\b${mut.cls}\\b`).test(m[1]));
    if (withCls.length !== 1) {
      return { ok: false, steps, reason: `<main> 上带 class="${mut.cls}" 的恰好 1 个（实际 ${withCls.length} 个；共 ${matches.length} 个 <main>）` };
    }
    const m = withCls[0];
    const attrs = m[1].replace(/\s*class="([^"]*)"/, (_all, cls) => {
      const rest = cls.split(/\s+/).filter(c => c && c !== mut.cls);
      return rest.length ? ` class="${rest.join(' ')}"` : '';
    });
    steps.push({ id: 'drop-main-class', anchor: `<main … class="${mut.cls}">`, hits: 1, ok: true });
    return { ok: true, text: html.slice(0, m.index) + `<main${attrs}>` + html.slice(m.index + m[0].length), steps, reason: null };
  }
  // css-block
  const blockRe = new RegExp(mut.block, 'g');
  const blocks = [...html.matchAll(blockRe)];
  if (blocks.length !== 1) {
    return { ok: false, steps, reason: `CSS 块 /${mut.block}/ 出现 ${blocks.length} 次（要求恰好 1 次，防重复规则）` };
  }
  const b = blocks[0];
  let blockText = b[0];
  for (const e of mut.edits) {
    const r = applyEdit(blockText, e);
    if (!r.ok) return { ok: false, steps, reason: `${e.id}：${r.reason}` };
    blockText = r.text;
    steps.push({ id: e.id, anchor: e.find, hits: r.count, ok: true });
  }
  return { ok: true, text: html.slice(0, b.index) + blockText + html.slice(b.index + b[0].length), steps, reason: null };
}

// ──────────────────────────────── 打印 ────────────────────────────────

function pad(s, n) { s = String(s); return s.length >= n ? s : s + ' '.repeat(n - s.length); }
function lpad(s, n) { s = String(s); return s.length >= n ? s : ' '.repeat(n - s.length) + s; }

function printRoute(m, opts) {
  console.log('');
  console.log(`─ ${m.route}  [${m.kind}]  http ${m.httpStatus}  sha256 ${m.provenance.sha256.slice(0, 16)}…  bytes ${m.provenance.bytes}`);
  console.log(`   settle: ${m.settle.settled ? 'ok' : '未稳定'}（${m.settle.samples} 次采样 / ${m.settle.elapsedMs}ms）` +
    (m.consoleErrors.length ? `  控制台错误 ${m.consoleErrors.length}` : '') +
    (m.pageErrors.length ? `  页面异常 ${m.pageErrors.length}` : ''));
  const vps = [...opts.desktop.map(String), String(opts.mobile)];
  for (const key of vps) {
    const vp = m.viewports[key];
    if (!vp) continue;
    const isMobile = Number(key) === opts.mobile;
    console.log(`   视口 ${key}×${isMobile ? 844 : 900}  inner=${vp.innerWidth} client=${vp.clientWidth} scrollbar=${vp.scrollbarWidth} documentElement.scrollWidth=${vp.documentElementScrollWidth}`);
    if (!opts.quiet) {
      console.log('     ' + pad('selector', 12) + lpad('n', 3) + lpad('x', 11) + lpad('width', 11) + lpad('left', 11) + lpad('right', 11) + lpad('centerΔ', 9) + '  computed(max-width | word-break | overflow-wrap)');
      for (const sel of (opts.selectors || SELECTORS)) {
        const e = vp.elements[sel];
        if (!e || !e.found) {
          console.log('     ' + pad(sel, 12) + lpad(e ? e.count : '?', 3) + '   ' + '(页面里没有这个元素)');
          continue;
        }
        console.log('     ' + pad(sel, 12) + lpad(e.count, 3) + lpad(e.rect.x, 11) + lpad(e.rect.width, 11) +
          lpad(e.rect.left, 11) + lpad(e.rect.right, 11) + lpad(e.centerDelta, 9) +
          `  ${e.computed.maxWidth} | ${e.computed.wordBreak} | ${e.computed.overflowWrap}`);
      }
      if (isMobile) console.log(`     移动端横向溢出 = documentElement.scrollWidth - clientWidth = ${vp.documentElementScrollWidth - vp.clientWidth}px`);
    }
  }
}

function printCriteria(title, list) {
  if (!list.length) return;
  console.log('');
  console.log(`=== ${title} ===`);
  for (const c of list) {
    const mark = c.status === 'passed' ? '✓' : c.status === 'failed' ? '✗' : '—';
    const where = `${c.routeUsed || c.kind || ''}${c.viewport ? ' @' + c.viewport : ''}`;
    console.log(`  ${mark} ${pad(c.id, 34)} ${pad(where, 34)} ${c.prop}` +
      (c.selector ? ` ${c.selector}` : '') +
      ` = ${c.actual === null || c.actual === undefined ? '(量不到)' : c.actual}` +
      `  （期望 ${c.expected === undefined ? c.reason : c.expected}）`);
  }
}

// ──────────────────────────────── 主流程 ────────────────────────────────

(async () => {
  const t0 = Date.now();
  const opts = parseArgs(process.argv);
  if (opts.help) { usage(); process.exit(0); }
  if (opts.unknown) { console.error(`未知参数：${opts.unknown}`); usage(); process.exit(2); }

  const warnings = [];
  const dirRel = opts.dir || 'dist';
  const dir = path.resolve(process.cwd(), dirRel);
  if (!fs.existsSync(path.join(dir, 'index.html'))) {
    console.error(`✗ ${dir} 下没有 index.html —— 目录不对（--dir=）`);
    process.exit(2);
  }

  const routes = (opts.routes.length ? opts.routes.map(normRoute) : discoverRoutes(dir));
  const expectSpec = loadExpectationSpec(opts.expect);
  const mutIds = resolveMutations(opts.mutate);
  /** 本次运行量测的选择器 = 固定 7 个（前后同一把尺子）+ 本次追加的对轴检查项（--extra-selectors=）。 */
  const RUN_SELECTORS = SELECTORS.concat(opts.extra);

  // —— 变异：先复制到临时目录，再在被服务的**副本**上做替换；被测目录只读。
  let serveDir = dir;
  let tempDir = null;
  const mutationLog = [];
  if (mutIds.length) {
    // 变异在**副本**上做，副本根默认落在探针旁边的 .tmp/（只在 research/_raw 下），
    // 因为本机 %TEMP% 对 node 的 cpSync 报 EIO（Access denied）——用 --tmp= 可换。
    const tmpRoot = path.resolve(process.cwd(), opts.tmp || path.join(__dirname, '.tmp'));
    fs.mkdirSync(tmpRoot, { recursive: true });
    tempDir = fs.mkdtempSync(path.join(tmpRoot, 'leaf-probe-mut-'));
    try {
      fs.cpSync(dir, tempDir, { recursive: true });
    } catch (err) {
      console.error(`✗ 复制被测目录到临时副本失败（${tempDir}）：${(err && err.message) || err}\n  可用 --tmp=<可写目录> 换一个副本根`);
      process.exit(2);
    }
    serveDir = tempDir;
    for (const rid of mutIds) {
      const mut = MUTATIONS[rid];
      const rec = { id: rid, title: mut.title, scope: mut.scope, pages: [], ok: true, reason: null };
      for (const route of routes) {
        const kind = kindOf(route);
        if (!mut.scope.includes(kind)) { rec.pages.push({ route, kind, applied: false, skipped: '变异范围外' }); continue; }
        const f = routeFile(tempDir, route);
        if (!fs.existsSync(f)) { rec.pages.push({ route, kind, applied: false, skipped: '页面文件不存在' }); continue; }
        const html = fs.readFileSync(f, 'utf8');
        const r = mutateHtml(html, mut);
        if (!r.ok) {
          rec.ok = false;
          rec.reason = `${route}: ${r.reason}`;
          rec.pages.push({ route, kind, applied: false, steps: r.steps, error: r.reason });
          continue;
        }
        fs.writeFileSync(f, r.text, 'utf8');
        rec.pages.push({ route, kind, applied: true, steps: r.steps });
      }
      if (!rec.pages.some(p => p.applied)) { rec.ok = false; rec.reason = rec.reason || '没有任何页面被改动（锚点缺失或范围外）→ 该牙没有咬到东西'; }
      mutationLog.push(rec);
    }
  }

  const started = await startServer(serveDir);
  const { chromium } = loadPlaywright();
  const exe = findBrowser(opts.exe);
  if (!exe) { console.error('✗ 找不到浏览器可执行文件（--exe= 或 DSH_EDGE 或系统 Edge）'); process.exit(2); }

  const browser = await chromium.launch({ executablePath: exe, headless: true });
  const measured = [];
  try {
    for (const route of routes) {
      const url = `http://127.0.0.1:${started.port}${route}`;
      const file = routeFile(serveDir, route);
      const provenance = fs.existsSync(file)
        ? {
          file,
          sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
          bytes: fs.statSync(file).size,
          mtimeIso: fs.statSync(file).mtime.toISOString()
        }
        : { file, sha256: '', bytes: 0, mtimeIso: null };
      const before = started.notFound.length;
      const page = await browser.newPage({ viewport: { width: opts.desktop[0], height: 900 } });
      const consoleErrors = [];
      const pageErrors = [];
      const failedRequests = [];
      page.on('console', (msg) => { if (msg.type() === 'error' && consoleErrors.length < 20) consoleErrors.push(msg.text().slice(0, 300)); });
      page.on('pageerror', (err) => { if (pageErrors.length < 20) pageErrors.push(String((err && err.message) || err).slice(0, 300)); });
      page.on('requestfailed', (req) => { if (failedRequests.length < 20) failedRequests.push({ url: req.url(), error: ((req.failure() || {}).errorText || '') }); });

      let httpStatus = 0;
      try {
        const resp = await page.goto(url, { waitUntil: 'load', timeout: 30000 });
        httpStatus = resp ? resp.status() : 0;
      } catch (err) {
        httpStatus = 0;
        pageErrors.push(`goto 失败：${err && err.message}`);
      }
      await page.evaluate(() => (document.fonts && document.fonts.ready ? document.fonts.ready.then(() => true) : true)).catch(() => {});
      const settleInfo = await settle(page, RUN_SELECTORS);

      const viewports = {};
      for (const w of opts.desktop) {
        await page.setViewportSize({ width: w, height: 900 });
        await page.waitForTimeout(30);
        viewports[String(w)] = await page.evaluate(measureInPage(RUN_SELECTORS), RUN_SELECTORS);
      }
      await page.setViewportSize({ width: opts.mobile, height: 844 });
      await page.waitForTimeout(30);
      viewports[String(opts.mobile)] = await page.evaluate(measureInPage(RUN_SELECTORS), RUN_SELECTORS);
      await page.close();

      const notFoundHere = started.notFound.slice(before);
      measured.push({
        route, kind: kindOf(route), url, httpStatus, provenance,
        settle: settleInfo, consoleErrors, pageErrors, failedRequests,
        notFound: [...new Set(notFoundHere)],
        viewports
      });
    }
  } finally {
    await browser.close();
    started.server.close();
    if (tempDir) { try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* 临时目录，交给 OS */ } }
  }

  const criteria = expectSpec ? evaluateExpectations(expectSpec, measured) : [];
  const required = criteria.filter(c => !c.extra);
  const extra = criteria.filter(c => c.extra);
  const failedRequired = required.filter(c => c.status === 'failed');
  const failedExtra = extra.filter(c => c.status === 'failed');

  console.log('');
  console.log('=== leaf-probe.cjs (独立几何探针) ===');
  console.log(`dir    : ${dirRel}  →  ${dir}${mutIds.length ? `  （变异后服务临时副本：${mutIds.join(',')}）` : ''}`);
  console.log(`label  : ${opts.label || '(未命名)'}`);
  console.log(`视口   : desktop ${opts.desktop.join('/')} , mobile ${opts.mobile}`);
  console.log(`routes : ${routes.map(r => `${r}[${kindOf(r)}]`).join('  ')}`);
  console.log(`expect : ${expectSpec ? expectSpec.name : 'none（只测量，不下结论）'}`);
  console.log(`browser: ${exe}`);
  for (const m of measured) {
    printRoute(m, Object.assign({}, opts, { selectors: RUN_SELECTORS }));
    if (m.notFound.length) console.log(`   ! 该路由有 ${m.notFound.length} 条 404：${m.notFound.slice(0, 8).join(', ')}${m.notFound.length > 8 ? ' …' : ''}`);
  }
  if (mutationLog.length) {
    console.log('');
    console.log('=== 变异（在临时副本上）===');
    for (const r of mutationLog) {
      console.log(`  ${r.ok ? '✓' : '✗'} ${r.id} ${r.title}`);
      for (const p of r.pages) {
        console.log(`      ${p.applied ? '已改' : '未改'} ${p.route}${p.skipped ? ' — ' + p.skipped : ''}${p.error ? ' — ' + p.error : ''}` +
          (p.steps && p.steps.length ? `  锚点 ${p.steps.map(s => s.id + '×' + s.hits).join(', ')}` : ''));
      }
      if (!r.ok) console.log(`      ✗ 报红：${r.reason}`);
    }
  }
  printCriteria(`判据（${expectSpec ? expectSpec.name : 'none'}）`, required);
  printCriteria('参考项（不参与退出码）', extra);
  if (expectSpec && expectSpec.note) console.log(`  注：${expectSpec.note}`);

  const unsettled = measured.filter(m => !m.settle.settled);
  for (const m of unsettled) warnings.push(`${m.route} 布局在采样预算内未稳定（${m.settle.samples} 次）`);
  if (failedExtra.length) warnings.push(`参考项未过 ${failedExtra.length} 条（不参与退出码，但值得对账）：${failedExtra.map(c => c.id).join(', ')}`);
  if (unsettled.length) console.log(`\n  ! 布局未稳定：${unsettled.map(m => m.route).join(', ')} —— 数字不可信，请复核`);

  const result = {
    probe: 'leaf-probe.cjs', probeVersion: PROBE_VERSION, label: opts.label || null,
    generatedAt: new Date().toISOString(), node: process.version, cwd: process.cwd(),
    dir, dirRel, serveDir: mutIds.length ? '(临时副本)' : dir, elapsedMs: Date.now() - t0,
    viewports: { desktop: opts.desktop, mobile: opts.mobile },
    selectors: RUN_SELECTORS,
    expect: expectSpec ? { name: expectSpec.name, note: expectSpec.note || '' } : null,
    browser: { executablePath: exe },
    mutations: mutationLog,
    routes: measured.map(m => ({
      route: m.route, kind: m.kind, url: m.url, httpStatus: m.httpStatus, provenance: m.provenance,
      settle: m.settle, consoleErrors: m.consoleErrors, pageErrors: m.pageErrors,
      failedRequests: m.failedRequests, notFound: m.notFound, viewports: m.viewports
    })),
    criteria, extraCriteria: extra,
    verdict: {
      required: failedRequired.length ? 'failed' : (required.length ? 'passed' : 'skipped'),
      requiredPassed: required.filter(c => c.status === 'passed').length,
      requiredTotal: required.length,
      extraPassed: extra.filter(c => c.status === 'passed').length,
      extraTotal: extra.length,
      mutationAnchorsOk: mutationLog.every(r => r.ok)
    },
    warnings
  };

  if (opts.out) {
    const outPath = path.resolve(process.cwd(), opts.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n', 'utf8');
    console.log(`\n→ JSON 已写出：${outPath}`);
  }

  console.log('');
  if (mutationLog.length && !result.verdict.mutationAnchorsOk) {
    console.log('✗ 变异锚点不唯一/缺失 —— 牙没咬到东西，判红（不许算通过）');
    process.exit(2);
  }
  if (unsettled.length && opts.strictSettle) {
    console.log('✗ 布局未稳定（--strict-settle）');
    process.exit(2);
  }
  if (failedRequired.length) {
    console.log(`✗ 判据未过 ${failedRequired.length}/${required.length}：${failedRequired.map(c => c.id).join(', ')}`);
    process.exit(1);
  }
  console.log(`✓ 判据通过 ${required.filter(c => c.status === 'passed').length}/${required.length}${required.length ? '' : '（无判据）'}`);
  process.exit(0);
})().catch((err) => {
  console.error(`✗ 探针异常：${(err && err.stack) || err}`);
  process.exit(2);
});
