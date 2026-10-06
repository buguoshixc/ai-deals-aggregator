#!/usr/bin/env node
/**
 * T4 反假绿对抗（产物侧 · 有界版）：构造「看起来仍是窄柱」的注入，**跑 §22c 自己的判据代码**看它红不红。
 *
 * 为什么能叫「跑 §22c」而不是「我另写一套」：
 *   · 判据代码**逐字从 scripts/tools/verify-site.js 里切出来**（`const WIDE_TOL = 1;` → §22c 主流程之前），
 *     连 wideMeasure / wideProblems / wideMutate 一行不改；脚本把切片的 sha256 与文件 sha256 一并落盘；
 *   · 断言的红/绿用的是 §22c 主流程里的**同一条谓词**（源码位置写在每条构造的 predicate 字段）：
 *       - `bad = [...summary.narrow, ...summary.axis, ...summary.clipped]; bad.length === 0`（6721）
 *       - `wideFrozenDrift = routes.filter(route => frozenCount !== 1); drift.length === 0`（6670/6757）
 *   · 唯一没跑的是「628 次导航 + M1–M10 变异牙」那部分主流程，由另一份整轮实跑覆盖：
 *     research/_raw/secondary-page-layout-unification/verify/22c-baseline-run.log（842 项 / 27 失败 / EXIT=1）。
 *
 * 注入全部在浏览器内存里，**不碰磁盘**（产物 sha256 由主流程的整轮实跑另行证明）。
 *
 * 用法：node anti-false-green.cjs --dir=dist --out=…/verify/anti-false-green.json
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = (() => {
  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error('找不到仓库根');
})();
const arg = (name, fallback) => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const DIR = path.join(ROOT, arg('dir', 'dist'));
const OUT = path.resolve(ROOT, arg('out', path.join(__dirname, 'anti-false-green.json')));
const EDGE = process.env.DSH_EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const VERIFY_SITE = path.join(ROOT, 'scripts', 'tools', 'verify-site.js');

// ── 从 verify-site.js 里**逐字切出** §22c 的判据核心 ─────────────────────────────
const source = fs.readFileSync(VERIFY_SITE, 'utf8');
const sourceSha = crypto.createHash('sha256').update(source).digest('hex');
const startMarker = '  const WIDE_TOL = 1;';
const endMarker = "  console.log('\\n=== 22c)";
const startAt = source.indexOf(startMarker);
const endAt = source.indexOf(endMarker);
if (startAt < 0 || endAt < 0 || endAt <= startAt) throw new Error('切不出 §22c 判据核心：锚点没找到');
const slice = source.slice(startAt, endAt);
const sliceSha = crypto.createHash('sha256').update(slice).digest('hex');
const core = new Function(`${slice}\n  return { wideMeasure, wideProblems, wideMutate, wideNoteKey,
  WIDE_SNOTE_FROZEN, WIDE_SNOTE_NARROW, WIDE_SNOTE_NOWRAP, WIDE_NOTE_RATIO, WIDE_TOL, WIDE_DATA_SELECTORS };`)();
const lineOf = needle => source.slice(0, source.indexOf(needle)).split('\n').length;
// ⚠️ 只用来给判据喂 meta（kind/family），**不借它的判据代码**：判据是上面切出来的 §22c 那一份。
const pageKinds = require(path.join(ROOT, 'scripts', 'lib', 'page-kinds.js'));
const metaOf = route => {
  const kind = typeof pageKinds.kindOfRoute === 'function' ? pageKinds.kindOfRoute(route) : null;
  const family = kind && typeof pageKinds.layoutOf === 'function' ? pageKinds.layoutOf(kind) : null;
  return { route, kind, family };
};

// ── 自己起静态服务器（与探针同一套写法，互不依赖） ───────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8'
};
function serve(dir) {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      let file = path.join(dir, urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, ''));
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end('not found'); return; }
      res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

const INJECT_STYLE = css => `(() => {
  const style = document.createElement('style');
  style.textContent = ${JSON.stringify(css)};
  document.head.appendChild(style);
  return { injected: 'style', bytes: style.textContent.length };
})()`;

const WRAP_INNER = () => `(() => {
  const note = document.querySelector('main .snote');
  if (!note) return { injected: false };
  const wrapper = document.createElement('div');
  wrapper.setAttribute('style', 'max-width: 70ch');
  while (note.firstChild) wrapper.appendChild(note.firstChild);
  note.appendChild(wrapper);
  return { injected: 'inner-wrapper', maxWidth: getComputedStyle(wrapper).maxWidth };
})()`;

const DUPLICATE_FROZEN = frozen => `(() => {
  const style = document.createElement('style');
  style.textContent = ${JSON.stringify(frozen)};
  document.head.appendChild(style);
  const count = Array.prototype.slice.call(document.querySelectorAll('style'))
    .reduce((sum, s) => sum + s.textContent.split(${JSON.stringify(frozen)}).length - 1, 0);
  return { injected: 'duplicate-frozen', occurrences: count };
})()`;

const SPLIT_STYLE = frozen => `(() => {
  const styles = Array.prototype.slice.call(document.querySelectorAll('style'));
  const target = styles.find(s => s.textContent.includes(${JSON.stringify(frozen)}));
  if (!target) return { injected: false, reason: '没有含冻结串的 <style>' };
  const text = target.textContent;
  const half = Math.floor(text.length / 2);
  target.textContent = text.slice(0, half);
  const second = document.createElement('style');
  second.textContent = text.slice(half);
  target.parentElement.insertBefore(second, target.nextSibling);
  const count = Array.prototype.slice.call(document.querySelectorAll('style'))
    .reduce((sum, s) => sum + s.textContent.split(${JSON.stringify(frozen)}).length - 1, 0);
  return { injected: 'split-style-block', blocks: document.querySelectorAll('style').length, occurrences: count };
})()`;

const PERTURB_FROZEN = frozen => `(() => {
  const styles = Array.prototype.slice.call(document.querySelectorAll('style'));
  const target = styles.find(s => s.textContent.includes(${JSON.stringify(frozen)}));
  if (!target) return { injected: false, reason: '没有含冻结串的 <style>' };
  target.textContent = target.textContent.replace('line-height: 1.7', 'line-height: 1.8');
  const count = Array.prototype.slice.call(document.querySelectorAll('style'))
    .reduce((sum, s) => sum + s.textContent.split(${JSON.stringify(frozen)}).length - 1, 0);
  return { injected: 'perturbed-frozen-text', occurrences: count };
})()`;

/** 与判据无关的**独立**读数：§22c 量的是排版盒（clientWidth / getBoundingClientRect），
 *  这里额外把「绘制层」的宽与字迹并集也量出来，用来看手法是不是只骗过了「绘制」。 */
const VISUAL_SOURCE = `(() => {
  const round = n => Math.round(n * 100) / 100;
  const main = document.querySelector('main');
  if (!main) return null;
  const inkOf = el => {
    const rects = [];
    const walk = node => { for (const child of node.childNodes) {
      if (child.nodeType === 3) { if (child.textContent.trim()) { const range = document.createRange(); range.selectNodeContents(child);
        for (const r of range.getClientRects()) if (r.width > 0 && r.height > 0) rects.push(r); } }
      else if (child.nodeType === 1) walk(child); } };
    walk(el);
    if (!rects.length) return null;
    return { width: round(Math.max.apply(null, rects.map(r => r.right)) - Math.min.apply(null, rects.map(r => r.left))),
      lines: rects.length, maxLine: round(Math.max.apply(null, rects.map(r => r.width))) };
  };
  return { docScrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth,
    notes: Array.prototype.slice.call(main.querySelectorAll('.snote')).map((el, index) => {
      const rect = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return { index, boxWidth: round(rect.width), clientWidth: el.clientWidth, scrollWidth: el.scrollWidth,
        transform: cs.transform, writingMode: cs.writingMode, clipPath: cs.clipPath, maxWidth: cs.maxWidth,
        paddingRight: cs.paddingRight, columnCount: cs.columnCount, ink: inkOf(el) };
    }) };
})()`;

const CONSTRUCTIONS = [
  {
    id: 'C0-control',
    what: '对照：不改任何东西（dist 上的 /status/ 应当判绿）',
    inject: async () => ({ injected: 'none' }),
    expect: 'green'
  },
  {
    id: 'C1-append-70ch',
    what: '在共享样式之后追加 `.snote { max-width: 70ch }`（页面级说明整体压回 70ch 窄柱）',
    inject: page => page.evaluate(INJECT_STYLE('.snote { max-width: 70ch; }')),
    expect: 'red'
  },
  {
    id: 'C2-padding-right-calc',
    what: 'F1 原型：`.snote { padding-right: calc(100% - 70ch) }` —— **盒宽一字不动**，只有有字区域被压成 70ch',
    inject: page => page.evaluate(INJECT_STYLE('.snote { padding-right: calc(100% - 70ch); }')),
    expect: 'red'
  },
  {
    id: 'C3-inner-max-width-container',
    what: '把说明文字塞进一个 `max-width: 70ch` 的内层容器（改的是子元素，不是 .snote 自己）',
    inject: page => page.evaluate(WRAP_INNER()),
    expect: 'red'
  },
  {
    id: 'C4-transform-scaleX',
    what: '`transform: scaleX(0.35)`（不改盒宽、只改绘制 —— 但会改 getBoundingClientRect）',
    inject: page => page.evaluate(INJECT_STYLE('.snote { transform: scaleX(0.35); transform-origin: left center; }')),
    expect: 'red'
  },
  {
    id: 'C5-only-non-first-note',
    what: 'F2 原型：`.snote ~ .snote { max-width: 70ch }` —— 只压**非首条**说明（旧口径只看第一条）',
    inject: page => page.evaluate(INJECT_STYLE('.snote ~ .snote { max-width: 70ch; }')),
    expect: 'red'
  },
  {
    id: 'C6-duplicate-frozen-rule',
    what: '锚点失效 A：把冻结串**再复制一份**（同名规则出现 2 次）⇒ 冻结串牙必须红，不许静默跳过',
    inject: page => page.evaluate(DUPLICATE_FROZEN(core.WIDE_SNOTE_FROZEN)),
    expect: 'red',
    predicate: 'frozen'
  },
  {
    id: 'C7-split-style-block',
    what: '锚点失效 B：把含冻结串的 `<style>` **拆成两块**（规则仍恰好 1 次）⇒ 拆块本身不是重复定义，绿是**正确**行为',
    inject: page => page.evaluate(SPLIT_STYLE(core.WIDE_SNOTE_FROZEN)),
    expect: 'green',
    predicate: 'frozen'
  },
  {
    id: 'C8-perturb-frozen-text',
    what: '锚点失效 C：把冻结串改一个字（line-height 1.7 → 1.8）⇒ 锚点 0 次，冻结串牙与 M1–M4 变异牙都必须红，不许静默跳过',
    inject: page => page.evaluate(PERTURB_FROZEN(core.WIDE_SNOTE_FROZEN)),
    expect: 'red',
    predicate: 'frozen'
  },
  {
    id: 'C9-writing-mode-vertical',
    what: '只改绘制/书写方向：`writing-mode: vertical-rl`（视觉上文字收成一竖列，盒宽不变）⇒ 预期**不被判红**',
    inject: page => page.evaluate(INJECT_STYLE('.snote { writing-mode: vertical-rl; }')),
    expect: 'escape'
  },
  {
    id: 'C10-clip-path',
    what: '只裁绘制：`clip-path: inset(0 65% 0 0)`（视觉上只剩三分之一，盒宽与有字区域都不变）⇒ 预期**不被判红**',
    inject: page => page.evaluate(INJECT_STYLE('.snote { clip-path: inset(0 65% 0 0); }')),
    expect: 'escape'
  }
];

(async () => {
  const routes = ['status/', 'student/', 'changes/'];
  const { server, port } = await serve(DIR);
  const base = `http://127.0.0.1:${port}/`;
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const results = [];
  for (const route of routes) {
    for (const construction of CONSTRUCTIONS) {
      await page.goto(base + route, { waitUntil: 'load' });
      const injection = await construction.inject(page);
      await page.evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
      const geometry = await core.wideMeasure(page);
      const meta = metaOf(route);
      const problems = core.wideProblems(geometry, meta);
      const codes = problems.map(problem => problem.code);
      const noteRows = geometry.notes.map(note => ({
        index: note.index, boxWidth: note.box.width, contentBox: note.contentBox, textWidth: note.textWidth,
        textFallback: note.textFallback, ratio: geometry.region.width > 0
          ? Math.round((note.textWidth / Math.min(geometry.region.width, geometry.main.width)) * 1000000) / 1000000 : null
      }));
      const narrow = noteRows.filter(row => row.textWidth < core.WIDE_NOTE_RATIO * Math.min(geometry.region.width, geometry.main.width) - 0.01);
      const axis = codes.filter(code => code === 'note-axis').length;
      const clipped = codes.filter(code => code === 'note-clipped').length;
      // §22c 主流程的两条谓词（源码行号写在报告里，逐条可核对）
      const narrowAxisPredicate = { red: narrow.length + axis + clipped > 0,
        detail: `bad = narrow ${narrow.length} + axis ${axis} + clipped ${clipped}` };
      const frozenPredicate = { red: geometry.frozenCount !== 1, detail: `frozenCount = ${geometry.frozenCount}` };
      const predicate = construction.predicate === 'frozen' ? frozenPredicate : narrowAxisPredicate;
      // ⚠️ 顺序要紧：绘制层读数必须在 wideMutate **之前**取 —— wideMutate 会把冻结串换成 70ch，
      // 之后再读到的就是「变异后的页面」，会把注入构造与变异混在一起（本脚本第一版踩过这个坑）。
      const visual = await page.evaluate(VISUAL_SOURCE);
      const mutate = await core.wideMutate(page, core.WIDE_SNOTE_FROZEN, core.WIDE_SNOTE_NARROW);
      results.push({
        route, id: construction.id, what: construction.what, expect: construction.expect,
        injection: injection && injection.injected !== undefined ? injection : { raw: String(injection) },
        judge: {
          primary: construction.predicate === 'frozen' ? frozenPredicate : narrowAxisPredicate,
          noteNarrowRows: narrow.map(row => `#${row.index} textWidth=${row.textWidth} ratio=${row.ratio}`),
          codes,
          frozenCount: geometry.frozenCount,
          noteCount: geometry.noteCount,
          region: { sel: geometry.regionSel, width: geometry.region.width, fallback: geometry.regionFallback },
          column: Math.min(geometry.region.width, geometry.main.width),
          mutateAnchor: `${mutate.ok ? 'ok（锚点唯一，变异能落地）' : 'ok:false（' + mutate.reason + '）'}`
        },
        verdict: predicate.red ? 'red' : 'green',
        expectedRed: construction.expect !== 'green',
        matchesExpectation: (construction.expect === 'escape') ? null : (predicate.red === (construction.expect === 'red')),
        notes: noteRows,
        visual
      });
      console.log(`${construction.id} @${route} → ${predicate.red ? 'RED' : 'GREEN'}（期望 ${construction.expect}）· ${construction.predicate || 'narrow/axis/clipped'} · frozenCount=${geometry.frozenCount} · ${mutate.ok ? 'mutate ok' : 'mutate ok:false'}`);
    }
  }

  await browser.close();
  server.close();

  const records = results.filter(item => item.id !== 'C0-control');
  const fakeGreen = records.filter(item => item.expectedRed && !(item.verdict === 'red'));
  const unexpectedGreen = results.filter(item => item.id === 'C0-control' && item.verdict !== 'green');
  const escapes = results.filter(item => item.verdict === 'green' && item.expectedRed);
  const report = {
    generatedAt: new Date().toISOString(),
    dir: path.relative(ROOT, DIR).split(path.sep).join('/'),
    viewport: 1440,
    judgeSource: {
      file: path.relative(ROOT, VERIFY_SITE).split(path.sep).join('/'),
      fileSha256: sourceSha,
      slice: 'WIDE_TOL 常量块 → §22c 主流程之前（wideMeasure / wideProblems / wideMutate 逐字切出）',
      sliceSha256: sliceSha,
      sliceLines: [source.slice(0, startAt).split('\n').length, source.slice(0, endAt).split('\n').length],
      predicates: {
        narrowAxis: `verify-site.js:${lineOf('const bad = [...summary.narrow, ...summary.axis, ...summary.clipped];')}（bad.length === 0）`,
        frozen: `verify-site.js:${lineOf('const wideFrozenDrift = wideRoutes.filter')} + ${lineOf("check(`§22c 冻结串「一处定义、全站生效」")}（frozenCount === 1）`
      }
    },
    control: results.filter(item => item.id === 'C0-control'),
    results,
    summary: {
      constructions: records.length,
      redAsExpected: records.filter(item => item.verdict === 'red').length,
      fakeGreen: fakeGreen.map(item => `${item.id}@${item.route}`),
      escapeWithReason: escapes.map(item => ({ id: item.id, route: item.route, verdict: item.verdict, visual: item.visual })),
      controlGreen: !unexpectedGreen.length,
      allRedAsExpected: fakeGreen.length === 0
    }
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(`\n判据来源 ${report.judgeSource.file}@${sourceSha.slice(0, 12)} · 切片 ${sliceSha.slice(0, 12)} · 行 ${report.judgeSource.sliceLines.join('-')}`);
  console.log(`构造 ${report.summary.constructions} 条 · 判红 ${report.summary.redAsExpected} · 假绿 ${report.summary.fakeGreen.length} · 对照绿=${report.summary.controlGreen}`);
  if (report.summary.fakeGreen.length) console.log(`假绿：${report.summary.fakeGreen.join(' ')}`);
  if (escapes.length) console.log(`未判红的构造：${escapes.map(item => item.id).join(' ')}（逐条理由见 JSON 的 escapeWithReason）`);
  console.log(`证据：${path.relative(ROOT, OUT).split(path.sep).join('/')}`);
  process.exit(report.summary.allRedAsExpected && report.summary.controlGreen ? 0 : 1);
})().catch(error => { console.error(error); process.exit(2); });
