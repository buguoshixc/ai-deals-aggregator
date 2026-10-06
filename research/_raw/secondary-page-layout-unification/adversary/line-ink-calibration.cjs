#!/usr/bin/env node
/**
 * t11 · 只读标定实验：把「逐行字迹」判据作为**独立探针**跑出来（不接入套件、不改 verify-site.js）。
 *
 * 候选判据（captain 指定的口径）：
 *   对每条 .snote：把其内全部非空白文本节点的 getClientRects() **按行归并**（按垂直覆盖分组），
 *   取「最宽那一行」的字迹宽 widestLine；当 **行数 ≥ 2** 且 `widestLine < 0.85 × min(主数据区宽, 页面列宽)` ⇒ 判为窄。
 * 另给两个敏感度变体：阈值 0.5×列宽；行数前置条件 ≥3。
 *
 * 四个集合（captain 的 acceptance）：
 *   A  dist              —— 正确产物，候选判据必须 **0 条**（有误判就逐条列出）
 *   B  dist.baseline     —— 缺陷产物，必须**不漏** geometry/truth-401.json 的 156 条（48 页）
 *   C  dist.synth-fixed  —— 合成修复产物，应 0 条
 *   D  scratch 三形态     —— multicol / float 必须判中；overlay 预期判不中（绘制遮盖 ⇒ DEFERRED）
 *
 * 用法：node …/adversary/line-ink-calibration.cjs [--set=dist|baseline|synth|forms|all] [--dir=] [--tag=]
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright-core');

const HERE = __dirname;
const WT = path.join(HERE, '..', '..', '..', '..');
const EVID = path.join(HERE, '..');
const RUNS = path.join(HERE, 'runs');
const EDGE = process.env.DSH_EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const VERIFY_SITE = path.resolve(WT, String(argOf('verify-site', 'scripts/tools/verify-site.js')));
const WIDTH = Number(argOf('width', 1440));
const ONLY_SET = String(argOf('set', 'all'));
const RATIO = Number(argOf('ratio', 0.85));
const JSON_OUT = path.resolve(WT, String(argOf('json', path.join(EVID, 'adversary', 'runs', `calibration-${ONLY_SET}.json`))));

function argOf(name, dflt) {
  const hit = process.argv.slice(2).find(a => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return dflt;
  const eq = hit.indexOf('=');
  return eq < 0 ? true : hit.slice(eq + 1);
}

// ── 锚点式抽取判据（与 harness.cjs 同法；只用来算**现行**判据的读数做对照） ──
function matchBrace(text, openIdx) {
  let i = openIdx; let mode = 'code'; const interp = []; let depth = 0; let started = false;
  while (i < text.length) {
    const ch = text[i]; const nx = text[i + 1];
    if (mode === 'code') {
      if (ch === '/' && nx === '/') { const e = text.indexOf('\n', i); i = e < 0 ? text.length : e + 1; continue; }
      if (ch === '/' && nx === '*') { const e = text.indexOf('*/', i + 2); i = e < 0 ? text.length : e + 2; continue; }
      if (ch === "'" || ch === '"') { const q = ch; i += 1; while (i < text.length && text[i] !== q) { if (text[i] === '\\') i += 1; i += 1; } i += 1; continue; }
      if (ch === '`') { mode = 'template'; i += 1; continue; }
      if (ch === '{') { depth += 1; started = true; i += 1; continue; }
      if (ch === '}') {
        depth -= 1;
        if (interp.length && depth === interp[interp.length - 1]) { interp.pop(); mode = 'template'; i += 1; continue; }
        if (started && depth === 0) return i + 1;
        i += 1; continue;
      }
      i += 1; continue;
    }
    if (ch === '\\') { i += 2; continue; }
    if (ch === '`') { mode = 'code'; i += 1; continue; }
    if (ch === '$' && nx === '{') { interp.push(depth); depth += 1; started = true; mode = 'code'; i += 2; continue; }
    i += 1;
  }
  return -1;
}
function extractJudge(srcPath) {
  const src = fs.readFileSync(srcPath, 'utf8');
  const lines = src.split('\n');
  const aLine = lines.findIndex(l => l.includes('const WIDE_TOL = 1;'));
  const pLine = lines.findIndex(l => l.includes('function wideProblems(geometry, meta) {'));
  if (aLine < 0 || pLine < 0) throw new Error('锚点缺失（const WIDE_TOL / function wideProblems）');
  const offset = idx => lines.slice(0, idx).reduce((n, l) => n + l.length + 1, 0);
  const judgeEnd = matchBrace(src, src.indexOf('{', offset(pLine)));
  if (judgeEnd < 0) throw new Error('wideProblems 花括号配对失败');
  return { text: src.slice(offset(aLine), judgeEnd), sha256: crypto.createHash('sha256').update(src.slice(offset(aLine), judgeEnd)).digest('hex') };
}

const pageKinds = require(path.join(WT, 'scripts', 'lib', 'page-kinds.js'));
const audienceLib = require(path.join(WT, 'scripts', 'lib', 'audience.js'));
const landingsLib = require(path.join(WT, 'scripts', 'lib', 'landing.js'));
const extraction = extractJudge(VERIFY_SITE);

function loadJudge(text, dir) {
  const want = ['wideMeasure', 'wideProblems', 'wideRoutesFromDisk', 'wideKindByRoute', 'WIDE_SNOTE_FROZEN', 'WIDE_DATA_SELECTORS'];
  const fn = new Function('fs', 'path', 'DIR', 'pageKinds', 'audienceLib', 'landingsLib',
    `${text}\nconst out = {}; for (const n of ${JSON.stringify(want)}) { try { out[n] = eval(n); } catch (e) { out[n] = undefined; } } return out;`);
  return fn(fs, path, dir, pageKinds, audienceLib, landingsLib);
}

// ── 独立逐行字迹探针 ─────────────────────────────────────────────────────────
const LINE_PROBE = `(() => {
  const round = n => Math.round(n * 100) / 100;
  const main = document.querySelector('main');
  const notes = main ? Array.prototype.slice.call(main.querySelectorAll('.snote')) : [];
  const fragmentsOf = el => {
    const out = [];
    const walk = node => {
      for (const child of node.childNodes) {
        if (child.nodeType === 3) {
          if (!child.textContent.trim()) continue;
          const r = document.createRange();
          r.selectNodeContents(child);
          for (const rect of r.getClientRects()) if (rect.width > 0 && rect.height > 0) out.push({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom });
        } else if (child.nodeType === 1) walk(child);
      }
    };
    walk(el);
    return out;
  };
  /** 按垂直覆盖把片段归并成行（覆盖 > 50% 片高算同一行） */
  const groupLines = frags => {
    const rows = [];
    for (const f of frags.slice().sort((a, b) => a.top - b.top || a.left - b.left)) {
      const row = rows.find(r => Math.min(r.bottom, f.bottom) - Math.max(r.top, f.top) > 0.5 * (f.bottom - f.top));
      if (row) { row.left = Math.min(row.left, f.left); row.right = Math.max(row.right, f.right); row.top = Math.min(row.top, f.top); row.bottom = Math.max(row.bottom, f.bottom); }
      else rows.push({ left: f.left, right: f.right, top: f.top, bottom: f.bottom });
    }
    return rows.sort((a, b) => a.top - b.top).map(r => ({ left: round(r.left), right: round(r.right), width: round(r.right - r.left) }));
  };
  return notes.map((el, index) => {
    const frags = fragmentsOf(el);
    const lines = groupLines(frags);
    const widths = lines.map(l => l.width).sort((a, b) => a - b);
    const box = el.getBoundingClientRect();
    return {
      index,
      text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 40),
      boxWidth: round(box.width),
      fragments: frags.length,
      lineCount: lines.length,
      lines: lines.slice(0, 12),
      widestLine: widths.length ? widths[widths.length - 1] : 0,
      medianLine: widths.length ? widths[Math.floor(widths.length / 2)] : 0,
      narrowestLine: widths.length ? widths[0] : 0
    };
  });
})()`;

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8' };
function serve(dirPath) {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
      let file = path.join(dirPath, rel);
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      if (!file.startsWith(dirPath) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end('not found'); return; }
      res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

function routesOf(dir) {
  const routes = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f);
      else if (e.name.toLowerCase() === 'index.html') {
        const rel = path.relative(dir, f).split(path.sep).join('/');
        routes.push(rel === 'index.html' ? '' : rel.replace(/index\.html$/, ''));
      }
    }
  })(dir);
  return routes.sort();
}

const truth = JSON.parse(fs.readFileSync(path.join(EVID, 'geometry', 'truth-401.json'), 'utf8'));
const key = (route, index) => `${route}#${index}`;
const truthSets = {
  caughtByOldCriteria: new Set((truth.sets.caughtByOldCriteria || []).map(o => key(o.route, o.index))),
  onlyNewTruth: new Set((truth.sets.onlyNewTruth || []).map(o => key(o.route, o.index))),
  alreadyFine: new Set((truth.sets.alreadyFine || []).map(o => key(o.route, o.index)))
};
const truthNarrow = new Set([...truthSets.caughtByOldCriteria, ...truthSets.onlyNewTruth]);

async function scanSet(browser, dir, label, onlyRoutes = null) {
  const judge = loadJudge(extraction.text, dir);
  const kindByRoute = judge.wideKindByRoute();
  const { server, port } = await serve(dir);
  const base = `http://127.0.0.1:${port}/`;
  const rows = [];
  const routes = onlyRoutes || routesOf(dir);
  try {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: 900 } });
    for (const route of routes) {
      let geometry = null;
      let currentCodes = [];
      try {
        await page.goto(new URL(route, base).href, { waitUntil: 'load' });
        geometry = await judge.wideMeasure(page);
        if (geometry.noteCount === 0) continue;
        const kind = pageKinds.kindOfRoute(route) || kindByRoute.get(route) || null;
        currentCodes = judge.wideProblems(geometry, { route, kind, family: kind ? pageKinds.layoutOf(kind) : null }).map(p => p.code);
        const probe = await page.evaluate(LINE_PROBE);
        const column = Math.min(geometry.region.width, geometry.main.width);
        probe.forEach(note => {
          const norrowByCurrent = (geometry.notes || []).find(n => n.index === note.index);
          rows.push({
            route, index: note.index, column, text: note.text,
            boxWidth: note.boxWidth,
            lineCount: note.lineCount, widestLine: note.widestLine, medianLine: note.medianLine, narrowestLine: note.narrowestLine,
            ratioWidestToColumn: column ? Math.round((note.widestLine / column) * 1000) / 1000 : null,
            currentTextWidth: norrowByCurrent ? norrowByCurrent.textWidth : null,
            currentNarrow: currentCodes.includes('note-narrow'),
            currentCodes
          });
        });
      } catch (e) {
        rows.push({ route, error: String((e && e.message) || e) });
      }
    }
    await page.close();
  } finally { server.close(); }
  const evaluated = rows.filter(r => !r.error);
  const rule = (r, ratio, minLines) => r.lineCount >= minLines && r.column > 0 && r.widestLine < ratio * r.column - 0.01;
  const sets = {
    A_0p85_2lines: evaluated.filter(r => rule(r, RATIO, 2)).map(r => key(r.route, r.index)),
    V_0p5_2lines: evaluated.filter(r => rule(r, 0.5, 2)).map(r => key(r.route, r.index)),
    V_0p85_3lines: evaluated.filter(r => rule(r, RATIO, 3)).map(r => key(r.route, r.index))
  };
  console.log(`\n=== ${label}（${path.relative(WT, dir)} @${WIDTH}）===`);
  console.log(`  页 ${routes.length} · 有说明的页 ${new Set(evaluated.map(r => r.route)).size} · 逐条 ${evaluated.length} · 扫描错误 ${rows.filter(r => r.error).length}`);
  for (const [name, list] of Object.entries(sets)) console.log(`  候选 ${name}：命中 ${list.length} 条 / ${new Set(list.map(k => k.split('#')[0])).size} 页`);
  return { label, dir: path.relative(WT, dir), width: WIDTH, rows, sets };
}

/** D 集合：把三种形态写进 scratch 副本的共享 <style>（冻结串仍恰好 1 次），只量那一页，然后还原。 */
const D_FORMS = {
  'multicol-narrow-columns': '.snote { column-count: 3; column-width: 340px; column-gap: 16px; }',
  'float-narrow-column': '.snote::before { content: ""; float: right; width: 70%; height: 6em; }',
  'overlay-opaque': ".snote { position: relative; }\n.snote::after { content: ''; position: absolute; top: 0; right: 0; bottom: 0; left: 30%; background: #f6f7f9; }"
};

async function scanForms(browser, scratchDir, route) {
  const frozen = loadJudge(extraction.text, scratchDir).WIDE_SNOTE_FROZEN;
  const target = path.join(scratchDir, route, 'index.html');
  const pristine = fs.readFileSync(target, 'utf8');
  const out = {};
  try {
    for (const [id, css] of Object.entries(D_FORMS)) {
      const count = pristine.split(frozen).length - 1;
      if (count !== 1) throw new Error(`冻结串在 scratch 里出现 ${count} 次`);
      const injected = `${frozen}\n${css}`;
      fs.writeFileSync(target, pristine.replace(frozen, injected), 'utf8');
      const scan = await scanSet(browser, scratchDir, `D · ${id}`, [route]);
      const row = scan.rows[0] || null;
      const column = row ? row.column : null;
      const rule = row ? (row.lineCount >= 2 && row.widestLine < RATIO * column - 0.01) : null;
      out[id] = { css, route, screenshot: null, row, candidateVerdict: rule === null ? 'n/a' : (rule ? '咬中' : '放行') };
      console.log(`  D/${id}：行数 ${row ? row.lineCount : '—'} · 最宽行 ${row ? row.widestLine : '—'}px / 列宽 ${column}px` +
        ` · 盒宽 ${row ? row.boxWidth : '—'} · 候选判据 ⇒ ${out[id].candidateVerdict}`);
      fs.writeFileSync(target, pristine, 'utf8');
    }
  } finally { fs.writeFileSync(target, pristine, 'utf8'); }
  return out;
}

(async () => {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const out = {
    generatedAt: new Date().toISOString(), host: 't11 adversary · 逐行字迹标定探针（独立探针，不接入套件）',
    rule: `行数 ≥ 2 且 最宽行 < ${RATIO} × min(主数据区宽, 页面列宽)`,
    verifySite: { path: path.relative(WT, VERIFY_SITE), judgeSha256: extraction.sha256 },
    width: WIDTH,
    sets: {}
  };
  try {
    if (['all', 'dist'].includes(ONLY_SET)) out.sets.dist = await scanSet(browser, path.join(WT, 'dist'), 'A · 正确产物 dist');
    if (['all', 'baseline'].includes(ONLY_SET)) out.sets.baseline = await scanSet(browser, path.join(WT, 'dist.baseline'), 'B · 缺陷产物 dist.baseline');
    if (['all', 'synth'].includes(ONLY_SET)) out.sets.synth = await scanSet(browser, path.join(WT, 'dist.synth-fixed'), 'C · 合成修复产物 dist.synth-fixed');
    if (['all', 'forms'].includes(ONLY_SET)) {
      const scratch = path.join(HERE, 'scratch', 'dist-probe-after');
      if (!fs.existsSync(path.join(scratch, 'index.html'))) throw new Error(`D 集合需要 scratch 副本：${path.relative(WT, scratch)}（先跑一次 harness --mode=B）`);
      console.log(`\n=== D · scratch 三形态（${path.relative(WT, scratch)} · 只量 category/agent/）===`);
      out.sets.forms = await scanForms(browser, scratch, 'category/agent/');
    }
  } finally { await browser.close(); }

  // ── 与 truth-401 的集合对账 ──────────────────────────────────────────────
  const compare = (scan, expectedNarrow, expectedFine) => {
    const got = new Set(scan.sets.A_0p85_2lines);
    const missed = [...expectedNarrow].filter(k => !got.has(k));
    const extra = [...got].filter(k => !expectedNarrow.has(k));
    return {
      expectedNarrow: expectedNarrow.size, got: got.size,
      missedCount: missed.length, missed: missed.slice(0, 40),
      extraCount: extra.length, extra: extra.slice(0, 60),
      extraRows: extra.slice(0, 60).map(k => {
        const [route, idx] = [k.slice(0, k.lastIndexOf('#')), Number(k.slice(k.lastIndexOf('#') + 1))];
        const r = scan.rows.find(x => x.route === route && x.index === idx) || {};
        return { key: k, lineCount: r.lineCount, widestLine: r.widestLine, column: r.column, ratio: r.ratioWidestToColumn, text: r.text };
      }),
      expectedFineCount: expectedFine ? expectedFine.size : null
    };
  };
  const summary = {};
  if (out.sets.dist) summary.dist = compare(out.sets.dist, new Set(), truthSets.alreadyFine);
  if (out.sets.baseline) summary.baseline = compare(out.sets.baseline, truthNarrow, null);
  if (out.sets.synth) summary.synth = compare(out.sets.synth, new Set(), null);
  out.truthComparison = summary;

  console.log('\n===== 与 geometry/truth-401.json 的集合对账 =====');
  if (summary.dist) console.log(`A dist：候选命中 ${summary.dist.got} 条（期望 0）· 误报 ${summary.dist.extraCount} 条`);
  if (summary.baseline) console.log(`B baseline：候选命中 ${summary.baseline.got} 条 · 期望窄 156 条 —— **漏 ${summary.baseline.missedCount} 条** · 额外命中 ${summary.baseline.extraCount} 条`);
  if (summary.synth) console.log(`C synth-fixed：候选命中 ${summary.synth.got} 条（期望 0）· 误报 ${summary.synth.extraCount} 条`);
  if (out.sets.forms) {
    console.log('D scratch 三形态：' + Object.entries(out.sets.forms).map(([k, v]) =>
      `${k}=${v.candidateVerdict}（行 ${v.row ? v.row.lineCount : '—'} · 最宽行 ${v.row ? v.row.widestLine : '—'}px / 列 ${v.row ? v.row.column : '—'}px）`).join(' · '));
  }

  fs.mkdirSync(path.dirname(JSON_OUT), { recursive: true });
  fs.writeFileSync(JSON_OUT, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
  console.log(`\n写出 ${path.relative(WT, JSON_OUT)}`);
})().catch(e => { console.error(e); process.exit(1); });
