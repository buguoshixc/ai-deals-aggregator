/**
 * T15（reviewer-2 · round 3）**独立探针**。
 *
 * 目的：不复用被测判据的产出，自己在浏览器里把每一条 .snote 的
 *   · border-box / content box / textWidth（旧口径的代理量）
 *   · 逐行字迹（字形盒 Range → 垂直重叠归并 → 每行的横向跨度 / 最长单矩形）
 *   · 行数 / 可见文本长度 / 是否竖排 / 是否已渲染 / 字形盒数
 * 量出来，落盘成 JSON，供 verdict 用；**判据的谓词在本脚本里另写一份**（apply()），
 * 与 verify-site.js 的代码互不 import。
 *
 * 用法：
 *   node review/harness/probe-r3.cjs --dir=dist --widths=1440,1600,760,360 --out=review/runs/r3-probe-dist.json
 *   node review/harness/probe-r3.cjs --dir=review/scratch/r3-false-green-grid --widths=1440 --out=... --routes=changes/
 *
 * 不写任何生产文件；服务与浏览器都是本脚本自带的。
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright-core');

const arg = name => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const DIR = path.resolve(arg('dir') || 'dist');
const WIDTHS = (arg('widths') || '1440').split(',').map(Number);
const OUT = path.resolve(arg('out') || path.join(__dirname, '..', 'runs', 'probe.json'));
const ROUTE_FILTER = arg('routes'); // 前缀过滤（逗号分隔）
const EDGE = process.env.DSH_EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const VIEWPORT_H = 900;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.txt': 'text/plain; charset=utf-8'
};

function serve(root) {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      let rel = decodeURIComponent(req.url.split('?')[0]);
      if (rel.endsWith('/')) rel += 'index.html';
      const file = path.join(root, rel);
      if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); res.end('404'); return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

function routesFromDisk(root) {
  const out = [];
  const walk = dir => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.toLowerCase() === 'index.html') {
        const rel = path.relative(root, full).split(path.sep).join('/');
        out.push(rel === 'index.html' ? '' : rel.replace(/index\.html$/, ''));
      }
    }
  };
  walk(root);
  return out.sort();
}

/**
 * 页面内量测。语义按 verify-site.js §22c 的**定义**独立重写：
 *   · 文本节点 = 非空白、且**排除 <noscript> 子树**
 *   · 字形盒 = Range.getClientRects() 里 width>0 && height>0 的矩形
 *   · 行 = 按 top 排序后，落进「垂直重叠 > 两者较矮高度 50%」的已有行
 * 另外多量两个量（判据没用，但用来判断「行宽」这个说法的稳健性）：
 *   line.rectW = 该行**最长单个矩形**宽；line.spanW = 该行 min-left..max-right 跨度。
 */
const MEASURE_FN = (functions) => {
  const { DATA_SELECTORS, VIEWPORT_H } = functions;
  const round = n => Math.round(n * 100) / 100;
  const box = el => {
    if (!el) return { count: 0, left: 0, right: 0, width: 0, height: 0, scrollW: 0, clientW: 0, padLeft: 0, padRight: 0 };
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      count: 1, left: round(r.left + window.scrollX), right: round(r.right + window.scrollX),
      width: round(r.width), height: round(r.height),
      scrollW: el.scrollWidth, clientW: el.clientWidth,
      padLeft: parseFloat(cs.paddingLeft) || 0, padRight: parseFloat(cs.paddingRight) || 0
    };
  };
  const contentBoxOf = el => {
    const cs = getComputedStyle(el);
    return el.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
  };
  const bearsText = el => {
    for (const node of el.childNodes) if (node.nodeType === 3 && node.textContent.trim()) return true;
    return false;
  };
  const laysOutLines = el => {
    const d = getComputedStyle(el).display;
    return d !== 'inline' && d !== 'none' && d !== 'contents';
  };
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
        } else if (child.nodeType === 1 && child.tagName !== 'NOSCRIPT') walk(child);
      }
    };
    walk(el);
    return rects;
  };
  const visibleTextOf = el => {
    let out = '';
    const walk = node => {
      for (const child of node.childNodes) {
        if (child.nodeType === 3) out += child.textContent;
        else if (child.nodeType === 1 && child.tagName !== 'NOSCRIPT') walk(child);
      }
    };
    walk(el);
    return out.replace(/\s+/g, ' ').trim();
  };
  const mergeLines = rects => {
    const sorted = rects.slice().sort((a, b) => a.top - b.top || a.left - b.left);
    const lines = [];
    for (const rect of sorted) {
      let hit = null;
      for (const line of lines) {
        const overlap = Math.min(line.bottom, rect.bottom) - Math.max(line.top, rect.top);
        if (overlap > 0.5 * Math.min(line.height, rect.height)) { hit = line; break; }
      }
      if (hit) {
        hit.left = Math.min(hit.left, rect.left); hit.right = Math.max(hit.right, rect.right);
        hit.top = Math.min(hit.top, rect.top); hit.bottom = Math.max(hit.bottom, rect.bottom);
        hit.height = Math.max(hit.height, rect.height);
        hit.rectW = Math.max(hit.rectW, rect.width);
        hit.sourceRects += 1;
      } else {
        lines.push({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, height: rect.height, rectW: rect.width, sourceRects: 1 });
      }
    }
    lines.sort((a, b) => a.top - b.top || a.left - b.left);
    return lines.map(line => ({
      left: round(line.left), right: round(line.right), spanW: round(line.right - line.left),
      rectW: round(line.rectW), top: round(line.top), sourceRects: line.sourceRects
    }));
  };

  const mains = document.querySelectorAll('main');
  const main = mains.length ? mains[0] : null;
  let regionEl = null, regionSel = null;
  for (const sel of DATA_SELECTORS) { const hit = document.querySelector(sel); if (hit) { regionSel = sel; regionEl = hit; break; } }
  const region = regionEl || main;
  const notes = main ? Array.prototype.slice.call(main.querySelectorAll('.snote')) : [];
  const mainBox = box(main);
  const regionBox = box(region);
  // 70ch 的**现场实测**（同字体，临时元素，不改产物）：B 项要拿它跟列宽比
  const probe70 = document.createElement('div');
  probe70.style.cssText = 'position:absolute;left:-9999px;top:0;height:1px;font-size:var(--fs-sm);width:70ch;';
  document.body.appendChild(probe70);
  const probe70ch = Math.round(probe70.getBoundingClientRect().width * 100) / 100;
  probe70.remove();
  return {
    doc: { innerWidth: window.innerWidth, clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth },
    viewportHeight: VIEWPORT_H,
    probe70ch,
    main: mainBox,
    region: regionBox,
    regionSel: regionSel,
    noteCount: notes.length,
    notes: notes.map((el, index) => {
      const cs = getComputedStyle(el);
      const noteBox = box(el);
      const bearing = [];
      if (bearsText(el)) bearing.push(el);
      for (const d of el.querySelectorAll('*')) if (laysOutLines(d) && bearsText(d)) bearing.push(d);
      const widths = bearing.map(contentBoxOf).filter(w => w > 0);
      const contentBox = contentBoxOf(el);
      const textWidth = widths.length ? Math.min.apply(null, widths) : (contentBox > 0 ? contentBox : noteBox.width);
      const rects = glyphRectsOf(el);
      const lines = mergeLines(rects);
      const visibleText = visibleTextOf(el);
      const writingMode = cs.writingMode || 'horizontal-tb';
      const beforeContent = getComputedStyle(el, '::before').content;
      const afterContent = getComputedStyle(el, '::after').content;
      return {
        index, depth: (() => { let d = 0, p = el; while (p && p !== main) { p = p.parentElement; d++; } return d; })(),
        parent: el.parentElement ? el.parentElement.tagName.toLowerCase() + (el.parentElement.className ? '.' + String(el.parentElement.className).split(/\s+/)[0] : '') : null,
        className: el.className,
        text: visibleText.slice(0, 40),
        textLength: visibleText.length,
        box: noteBox,
        rendered: noteBox.width > 0 && noteBox.height > 0,
        writingMode, vertical: /vertical|sideways/.test(writingMode),
        display: cs.display, fontSize: cs.fontSize, content: cs.content,
        glyphRects: rects.length,
        lineCount: lines.length,
        widestLine: lines.length ? round(lines.reduce((m, l) => Math.max(m, l.spanW), 0)) : 0,
        widestRect: lines.length ? round(lines.reduce((m, l) => Math.max(m, l.rectW), 0)) : 0,
        lines,
        contentBox: round(contentBox),
        textWidth: round(textWidth),
        textFallback: widths.length === 0,
        bearingCount: bearing.length,
        beforeContent: beforeContent && beforeContent !== 'none' ? String(beforeContent).slice(0, 40) : null,
        afterContent: afterContent && afterContent !== 'none' ? String(afterContent).slice(0, 40) : null
      };
    })
  };
};

/** 判据谓词（本脚本自己的实现；语义锚点见 review.md 的锚点表） */
function apply(reading, ratio, width) {
  const column = Math.min(reading.region.width, reading.main.width);
  const threshold = ratio * column;
  return {
    column: Math.round(column * 100) / 100,
    threshold: Math.round(threshold * 100) / 100,
    notes: reading.notes.map(n => {
      const codes = [];
      if (n.textWidth < threshold - 0.01) codes.push('note-narrow');
      if (n.rendered && !n.vertical && n.lineCount >= 2 && n.widestLine < threshold - 0.01) codes.push('note-ink-narrow');
      if (n.rendered && n.textLength > 0 && n.glyphRects === 0) codes.push('note-hidden-text');
      // 变体（只用于稳健性讨论，不是判据）：最长单矩形 / 只看 >=3 行
      const variants = [];
      if (n.rendered && !n.vertical && n.lineCount >= 2 && n.widestRect < threshold - 0.01) variants.push('ink-rect-variant');
      if (n.rendered && !n.vertical && n.lineCount >= 3 && n.widestLine < threshold - 0.01) variants.push('ink-3lines-variant');
      return {
        index: n.index, codes, variants,
        textWidth: n.textWidth, boxWidth: n.box.width, contentBox: n.contentBox,
        lineCount: n.lineCount, widestLine: n.widestLine, widestRect: n.widestRect, glyphRects: n.glyphRects,
        ratioInk: column > 0 ? Math.round((n.widestLine / column) * 10000) / 10000 : null,
        ratioBox: column > 0 ? Math.round((n.textWidth / column) * 10000) / 10000 : null,
        rendered: n.rendered, vertical: n.vertical, textLength: n.textLength,
        text: n.text, className: n.className, parent: n.parent, display: n.display
      };
    }),
    reading
  };
}

(async () => {
  if (!fs.existsSync(path.join(DIR, 'index.html'))) { console.error('no index.html in ' + DIR); process.exit(2); }
  const allRoutes = routesFromDisk(DIR);
  const prefixes = ROUTE_FILTER ? ROUTE_FILTER.split(',') : null;
  const routes = prefixes ? allRoutes.filter(r => prefixes.some(p => r.startsWith(p))) : allRoutes;
  const { server, port } = await serve(DIR);
  const base = `http://127.0.0.1:${port}/`;
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const page = await browser.newPage({ viewport: { width: WIDTHS[0], height: VIEWPORT_H } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 160)));

  const result = { dir: DIR, routes: routes.length, widths: WIDTHS, generatedAt: new Date().toISOString(), byWidth: {} };
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: VIEWPORT_H });
    const perRoute = {};
    for (const route of routes) {
      await page.goto(base + route, { waitUntil: 'load', timeout: 20000 });
      const reading = await page.evaluate(MEASURE_FN, { DATA_SELECTORS: ['.ctable', '.stable', '.chgsec', '.chglist', '.flist', '.fsec', '.ptable', '.lsum', '.pchglist'], VIEWPORT_H });
      perRoute[route] = apply(reading, 0.85, width);
    }
    result.byWidth[width] = perRoute;
    const notes = Object.values(perRoute).reduce((s, r) => s + r.notes.length, 0);
    const hits = Object.values(perRoute).reduce((s, r) => s + r.notes.filter(n => n.codes.length).length, 0);
    console.log(`@${width}: ${routes.length} 页 · ${notes} 条说明 · 命中 ${hits} 条`);
  }
  result.jsErrors = errors;
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(result, null, 1));
  console.log(`写盘 ${path.relative(process.cwd(), OUT)}`);
  await browser.close();
  server.close();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
