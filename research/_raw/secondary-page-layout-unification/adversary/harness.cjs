#!/usr/bin/env node
/**
 * §22c 门禁的**第二套对抗 harness**（t11 · adversary）—— 锚点式抽取 + 两种模式。
 *
 * 与 t5（reviewer）的手法的区别（这是本文件存在的理由）：
 *   · t5 的 `review/adversarial.cjs` 按**行号区间**抽取判据（6144–6356 / 6365–6378）。
 *     t7 修复后行号必漂（实测已从 213 行变 299 行）⇒ 那一份在修复后**抽不到**判据。
 *   · 本 harness 按**锚点 + 花括号配对**抽取：
 *       起点  `const WIDE_TOL = 1;`
 *       终点  `function wideProblems(geometry, meta) {` 的函数体闭合
 *       另一段 `async function wideMutate(target, anchor, replacement) {` 的函数体闭合
 *     锚点找不到 ⇒ **判红并写明原因**（exit 3），绝不静默跳过 —— 静默失效的测试正是本版在打的东西。
 *   · 判据文本逐字装进本进程运行（不是重写一份），并按 sha256 记账。
 *
 * 两种模式（acceptance 原文口径）：
 *   A（快）  浏览器内存注入（addStyleTag）⇒ 抽取出的 wideMeasure/wideProblems 逐条判定。
 *   B（硬）  把形态写进 **scratch 副本的共享 `<style>`**（冻结串仍恰好 1 次、注入可逐字节回退），
 *            跑**完整套件** `node <verify-site> --dir=<scratch>`。**EXIT=0 = 已证实的假绿。**
 *
 * 独立量测（不复用被测判据的数字）：Range 字迹 + **截图像素级字迹**（PNG 解码，不依赖判据任何量）。
 * 后者能看见判据看不见的东西：被遮罩盖住的、被人为裁掉的、伪元素画出来的正文。
 *
 * 用法：
 *   node research/_raw/secondary-page-layout-unification/adversary/harness.cjs \
 *     --mode=A [--verify-site=scripts/tools/verify-site.js] [--dir=dist] \
 *     [--forms=id1,id2] [--route=category/agent/] [--json=…] [--require-sha256=…]
 *   node …/harness.cjs --mode=B [--scratch-root=…/adversary/scratch] [--only-green-from=…json]
 *
 * 退出码：0 = 全部形态按期望判定；1 = 有形态与期望不符（或模式 B 出现 EXIT=0 的假绿）；
 *         2 = 用法错误；3 = 判据抽取失败（判红，不跑形态）。
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const zlib = require('zlib');
const { spawnSync } = require('child_process');
const { chromium } = require('playwright-core');

// ── 目录与参数 ────────────────────────────────────────────────────────────────
const HERE = __dirname;                                   // …/adversary
const EVIDENCE = path.join(HERE, '..');                   // …/secondary-page-layout-unification
const WORKTREE = path.join(HERE, '..', '..', '..', '..');  // worktree 根

const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const hit = argv.find(a => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return dflt;
  const eq = hit.indexOf('=');
  return eq < 0 ? true : hit.slice(eq + 1);
};
const MODE = String(arg('mode', 'A')).toUpperCase();
const VERIFY_SITE = path.resolve(WORKTREE, String(arg('verify-site', 'scripts/tools/verify-site.js')));
const DIR = path.resolve(WORKTREE, String(arg('dir', 'dist')));
const FORM_FILTER = arg('forms', null) ? String(arg('forms')).split(',').map(s => s.trim()).filter(Boolean) : null;
const REQUIRE_SHA = arg('require-sha256', null) ? String(arg('require-sha256')).toLowerCase() : null;
const ROUTE_OVERRIDE = arg('route', null) ? String(arg('route')) : null;
const SCRATCH_ROOT = path.resolve(WORKTREE, String(arg('scratch-root', path.join(EVIDENCE, 'adversary', 'scratch'))));
const ONLY_GREEN_FROM = arg('only-green-from', null) ? path.resolve(WORKTREE, String(arg('only-green-from'))) : null;
const SUITE_TIMEOUT_MS = Number(arg('suite-timeout-ms', 25 * 60 * 1000));
const KEEP_SCRATCH = Boolean(arg('keep-scratch', false));
const TAG = String(arg('tag', MODE === 'A' ? 'modeA' : 'modeB'));
const JSON_OUT = path.resolve(WORKTREE, String(arg('json', path.join(EVIDENCE, 'adversary', 'runs', `${TAG}.json`))));
const EDGE = process.env.DSH_EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

if (!['A', 'B'].includes(MODE)) { console.error('用法：--mode=A|B'); process.exit(2); }
if (!fs.existsSync(VERIFY_SITE)) { console.error(`找不到 verify-site：${VERIFY_SITE}`); process.exit(2); }
if (!fs.existsSync(path.join(DIR, 'index.html'))) { console.error(`找不到 --dir 产物：${DIR}`); process.exit(2); }

// ── 锚点式抽取（不按行号） ────────────────────────────────────────────────────
/** 花括号配对：从 text 的 openIdx（应指向 '{'）扫到配对的 '}'，返回其后一位。跳过注释/字符串/模板插值。 */
function matchBrace(text, openIdx) {
  let i = openIdx;
  let mode = 'code';
  const interpDepths = [];  // 模板插值 `${` 进入时的深度：回到该深度就回模板态
  let depth = 0;
  let started = false;
  while (i < text.length) {
    const ch = text[i];
    const nx = text[i + 1];
    if (mode === 'code') {
      if (ch === '/' && nx === '/') { const e = text.indexOf('\n', i); i = e < 0 ? text.length : e + 1; continue; }
      if (ch === '/' && nx === '*') { const e = text.indexOf('*/', i + 2); i = e < 0 ? text.length : e + 2; continue; }
      if (ch === "'" || ch === '"') {
        const q = ch; i += 1;
        while (i < text.length && text[i] !== q) { if (text[i] === '\\') i += 1; i += 1; }
        i += 1; continue;
      }
      if (ch === '`') { mode = 'template'; i += 1; continue; }
      if (ch === '{') { depth += 1; started = true; i += 1; continue; }
      if (ch === '}') {
        depth -= 1;
        if (interpDepths.length && depth === interpDepths[interpDepths.length - 1]) {
          interpDepths.pop(); mode = 'template'; i += 1; continue;
        }
        if (started && depth === 0) return i + 1;
        i += 1; continue;
      }
      i += 1; continue;
    }
    // template literal 态
    if (ch === '\\') { i += 2; continue; }
    if (ch === '`') { mode = 'code'; i += 1; continue; }
    if (ch === '$' && nx === '{') { interpDepths.push(depth); depth += 1; started = true; mode = 'code'; i += 2; continue; }
    i += 1;
  }
  return -1;
}

/** 找锚点行（可给多个候选，命中谁记账）。 */
function findAnchor(lines, anchors) {
  for (const anchor of anchors) {
    const idx = lines.findIndex(line => line.includes(anchor));
    if (idx >= 0) return { idx, anchor };
  }
  return { idx: -1, anchor: null };
}

function extractJudge(srcPath) {
  const src = fs.readFileSync(srcPath, 'utf8');
  const lines = src.split('\n');
  const problems = [];
  const A = findAnchor(lines, ['const WIDE_TOL = 1;', 'const WIDE_TOL =']);
  const P = findAnchor(lines, ['function wideProblems(geometry, meta) {', 'function wideProblems(']);
  const M = findAnchor(lines, ['async function wideMutate(target, anchor, replacement) {', 'async function wideMutate(']);
  if (A.idx < 0) problems.push('锚点缺失：`const WIDE_TOL` 在源文件里找不到（判据区起点定不下来）');
  if (P.idx < 0) problems.push('锚点缺失：`function wideProblems(` 在源文件里找不到（判据区终点定不下来）');
  if (M.idx < 0) problems.push('锚点缺失：`async function wideMutate(` 在源文件里找不到');
  if (problems.length) return { ok: false, problems };

  const problemsBraceIdx = src.indexOf('{', lines.slice(0, P.idx).reduce((n, l) => n + l.length + 1, 0));
  const judgeEndIdxExcl = matchBrace(src, problemsBraceIdx);
  if (judgeEndIdxExcl < 0) problems.push('花括号配对失败：`wideProblems` 的函数体没闭合（判据区终点不可信）');
  const mutateBraceIdx = src.indexOf('{', lines.slice(0, M.idx).reduce((n, l) => n + l.length + 1, 0));
  const mutateEndIdxExcl = matchBrace(src, mutateBraceIdx);
  if (mutateEndIdxExcl < 0) problems.push('花括号配对失败：`wideMutate` 的函数体没闭合');
  if (problems.length) return { ok: false, problems };

  const judgeStartOffset = lines.slice(0, A.idx).reduce((n, l) => n + l.length + 1, 0);
  const judgeText = src.slice(judgeStartOffset, judgeEndIdxExcl);
  const mutateText = src.slice(lines.slice(0, M.idx).reduce((n, l) => n + l.length + 1, 0), mutateEndIdxExcl);

  const requiredSymbols = ['wideMeasure', 'wideProblems', 'wideRoutesFromDisk', 'wideKindByRoute',
    'wideSampleSet', 'WIDE_SNOTE_FROZEN', 'WIDE_DATA_SELECTORS', 'WIDE_TOL'];
  const missing = requiredSymbols.filter(sym => !judgeText.includes(sym));
  if (missing.length) problems.push(`判据区里缺必需符号：${missing.join(', ')}（抽取到的不是 §22c 判据）`);
  if (problems.length) return { ok: false, problems };

  const lineOf = offset => src.slice(0, offset).split('\n').length;
  const sha = t => crypto.createHash('sha256').update(t).digest('hex');
  return {
    ok: true,
    problems: [],
    judge: {
      anchors: { start: A.anchor, problems: P.anchor, mutate: M.anchor },
      lines: `${lineOf(judgeStartOffset)}–${lineOf(judgeEndIdxExcl - 1)}`,
      lineCount: judgeText.split('\n').length,
      sha256: sha(judgeText),
      text: judgeText
    },
    mutate: {
      lines: `${M.idx + 1}–${lineOf(mutateEndIdxExcl - 1)}`,
      lineCount: mutateText.split('\n').length,
      sha256: sha(mutateText),
      text: mutateText
    },
    file: { path: path.relative(WORKTREE, srcPath), sha256: sha(src), bytes: Buffer.byteLength(src), lines: lines.length - 1 }
  };
}

const extraction = extractJudge(VERIFY_SITE);
const fileSha = crypto.createHash('sha256').update(fs.readFileSync(VERIFY_SITE)).digest('hex');

if (!extraction.ok) {
  const report = {
    generatedAt: new Date().toISOString(), mode: MODE, host: 't11-adversary harness',
    verifySite: { path: path.relative(WORKTREE, VERIFY_SITE), sha256: fileSha },
    extraction: { ok: false, problems: extraction.problems },
    verdict: 'RED', reason: '判据锚点抽取失败 ⇒ 形态一律不跑（不许静默跳过）'
  };
  fs.mkdirSync(path.dirname(JSON_OUT), { recursive: true });
  fs.writeFileSync(JSON_OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.error(`\n❌ 判据抽取失败（判红）—— ${VERIFY_SITE}`);
  extraction.problems.forEach(p => console.error(`   · ${p}`));
  console.error(`   报告：${path.relative(WORKTREE, JSON_OUT)}`);
  process.exit(3);
}
if (REQUIRE_SHA && fileSha !== REQUIRE_SHA) {
  const report = {
    generatedAt: new Date().toISOString(), mode: MODE,
    verifySite: { path: path.relative(WORKTREE, VERIFY_SITE), sha256: fileSha, required: REQUIRE_SHA },
    extraction: { ok: true, judge: { lines: extraction.judge.lines, sha256: extraction.judge.sha256 } },
    verdict: 'RED', reason: `--require-sha256=${REQUIRE_SHA} 与实际 ${fileSha} 不符（文件在判定之前被改过）`
  };
  fs.mkdirSync(path.dirname(JSON_OUT), { recursive: true });
  fs.writeFileSync(JSON_OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.error(`❌ verify-site.js 的 sha256 与 --require-sha256 不符：${fileSha} ≠ ${REQUIRE_SHA}`);
  process.exit(3);
}

// ── 判据装进本进程（逐字，不重写） ────────────────────────────────────────────
const pageKinds = require(path.join(WORKTREE, 'scripts', 'lib', 'page-kinds.js'));
const audienceLib = require(path.join(WORKTREE, 'scripts', 'lib', 'audience.js'));
const landingsLib = require(path.join(WORKTREE, 'scripts', 'lib', 'landing.js'));

function loadJudge(text, dir) {
  const want = ['wideMeasure', 'wideProblems', 'wideRoutesFromDisk', 'wideKindByRoute', 'wideSampleSet',
    'WIDE_SNOTE_FROZEN', 'WIDE_DATA_SELECTORS', 'WIDE_NOTE_RATIO', 'WIDE_TOL'];
  const fn = new Function('fs', 'path', 'DIR', 'pageKinds', 'audienceLib', 'landingsLib',
    `${text}
     const out = {};
     for (const name of ${JSON.stringify(want)}) { try { out[name] = eval(name); } catch (e) { out[name] = undefined; } }
     return out;`);
  return fn(fs, path, dir, pageKinds, audienceLib, landingsLib);
}

function metaOf(route, judge, kindByRoute) {
  const kind = pageKinds.kindOfRoute(route) || kindByRoute.get(route) || null;
  return { route, kind, family: kind ? pageKinds.layoutOf(kind) : null };
}

// ── PNG 解码（截图像素级字迹：完全独立于判据） ────────────────────────────────
function decodePng(buf) {
  if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) throw new Error('不是 PNG');
  let pos = 8; let ihdr = null; const idat = [];
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.slice(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      ihdr = { width: data.readUInt32BE(0), height: data.readUInt32BE(4), bitDepth: data[8], colorType: data[9], interlace: data[12] };
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (!ihdr) throw new Error('PNG 无 IHDR');
  if (ihdr.bitDepth !== 8 || ihdr.interlace !== 0) throw new Error(`不支持的 PNG：${JSON.stringify(ihdr)}`);
  const channels = ihdr.colorType === 6 ? 4 : ihdr.colorType === 2 ? 3 : 0;
  if (!channels) throw new Error(`不支持的 PNG colorType=${ihdr.colorType}`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = ihdr.width * channels;
  const out = Buffer.alloc(ihdr.height * stride);
  let rp = 0;
  for (let y = 0; y < ihdr.height; y += 1) {
    const filter = raw[rp]; rp += 1;
    const line = raw.slice(rp, rp + stride); rp += stride;
    const prev = y ? out.slice((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    const cur = out.slice(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x += 1) {
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      const v = line[x];
      let val;
      if (filter === 0) val = v;
      else if (filter === 1) val = v + a;
      else if (filter === 2) val = v + b;
      else if (filter === 3) val = v + ((a + b) >> 1);
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c);
        val = v + (pa <= pb && pa <= pc ? a : (pb <= pc ? b : c));
      } else throw new Error(`未知 PNG filter ${filter}`);
      cur[x] = val & 0xff;
    }
  }
  return { width: ihdr.width, height: ihdr.height, channels, data: out };
}

/** 像素级字迹：先取众数色当背景，再把显著不同的像素列当「有笔画」。 */
function inkFromPng(png, boxWidthCss) {
  const { width: W, height: H, channels: C, data } = png;
  const hist = new Map();
  for (let y = 0; y < H; y += 3) {
    for (let x = 0; x < W; x += 3) {
      const i = (y * W + x) * C;
      const key = `${data[i] >> 3},${data[i + 1] >> 3},${data[i + 2] >> 3}`;
      hist.set(key, (hist.get(key) || 0) + 1);
    }
  }
  let bgKey = null; let best = -1;
  for (const [k, n] of hist) if (n > best) { best = n; bgKey = k; }
  const bg = bgKey.split(',').map(n => (Number(n) << 3) + 4);
  const isInk = (x, y) => {
    const i = (y * W + x) * C;
    const d = Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]);
    return d > 72;
  };
  const minPix = Math.max(1, Math.floor(H * 0.01));
  const cols = [];
  for (let x = 0; x < W; x += 1) {
    let n = 0;
    for (let y = 0; y < H; y += 1) if (isInk(x, y)) { n += 1; if (n >= minPix) break; }
    cols.push(n >= minPix);
  }
  let first = -1; let last = -1;
  for (let x = 0; x < W; x += 1) if (cols[x]) { if (first < 0) first = x; last = x; }
  const runs = [];
  let cur = null;
  for (let x = 0; x < W; x += 1) {
    if (cols[x]) { if (cur === null) cur = { start: x, end: x }; else cur.end = x; }
    else if (cur) { runs.push(cur); cur = null; }
  }
  if (cur) runs.push(cur);
  const gaps = [];
  for (let i = 1; i < runs.length; i += 1) gaps.push({ start: runs[i - 1].end + 1, end: runs[i].start - 1, width: runs[i].start - runs[i - 1].end - 1 });
  const scale = boxWidthCss ? W / boxWidthCss : 1;
  const round = n => Math.round(n * 10) / 10;
  return {
    imageWidth: W, imageHeight: H, scale: Math.round(scale * 1000) / 1000,
    paintInkLeft: round(first / scale), paintInkRight: round((last + 1) / scale),
    paintInkWidth: first < 0 ? 0 : round((last + 1 - first) / scale),
    paintRuns: runs.length,
    paintLongestRun: runs.length ? round(Math.max(...runs.map(r => r.end + 1 - r.start)) / scale) : 0,
    paintGaps: gaps.filter(g => g.width / scale >= 2).map(g => ({ leftCss: round(g.start / scale), widthCss: round(g.width / scale) })),
    paintInkColumns: cols.filter(Boolean).length
  };
}

// ── 独立浏览器探针（Range 字迹 + 计算样式 + 冻结串计数） ─────────────────────
function probeScript(frozen) {
  return `(() => {
  const round = n => Math.round(n * 100) / 100;
  const main = document.querySelector('main');
  const notes = main ? Array.prototype.slice.call(main.querySelectorAll('.snote')) : [];
  const lineRects = el => {
    const out = [];
    const walk = node => {
      for (const child of node.childNodes) {
        if (child.nodeType === 3) {
          if (child.textContent.trim()) {
            const r = document.createRange();
            r.selectNodeContents(child);
            for (const rect of r.getClientRects()) if (rect.width > 0 && rect.height > 0) out.push(rect);
          }
        } else if (child.nodeType === 1) walk(child);
      }
    };
    walk(el);
    return out;
  };
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const clipTo = (r, box) => {
    const left = Math.max(r.left, box.left, 0);
    const top = Math.max(r.top, box.top, 0);
    const right = Math.min(r.right, box.right, vw);
    const bottom = Math.min(r.bottom, box.bottom, vh);
    return right > left && bottom > top ? { left, right, width: right - left } : null;
  };
  const pseudoOf = (el, sel) => {
    const s = getComputedStyle(el, sel);
    return { content: s.content, display: s.display, maxWidth: s.maxWidth, position: s.position,
      background: s.backgroundColor, width: s.width, height: s.height, fontSize: s.fontSize };
  };
  const notesData = notes.map((el, i) => {
    const b = el.getBoundingClientRect();
    const box = { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width, height: b.height };
    const rects = lineRects(el);
    const clipped = rects.map(r => clipTo(r, box)).filter(Boolean);
    const span = arr => arr.length
      ? { left: round(Math.min.apply(null, arr.map(r => r.left))), right: round(Math.max.apply(null, arr.map(r => r.right))) }
      : null;
    const inked = span(rects);
    const clippedSpan = span(clipped);
    const cs = getComputedStyle(el);
    return {
      index: i, text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 48),
      box: { left: round(box.left), right: round(box.right), width: round(box.width), height: round(box.height) },
      rectCount: rects.length,
      inkUnion: inked ? { left: inked.left, right: inked.right, width: round(inked.right - inked.left) } : null,
      inkLongestLine: rects.length ? round(Math.max.apply(null, rects.map(r => r.width))) : null,
      inkMedianLine: rects.length ? round(rects.map(r => r.width).sort((a, b) => a - b)[Math.floor(rects.length / 2)]) : null,
      inkClippedUnion: clippedSpan ? { left: round(clippedSpan.left), right: round(clippedSpan.right), width: round(clippedSpan.right - clippedSpan.left) } : null,
      inkClippedLongest: clipped.length ? round(Math.max.apply(null, clipped.map(r => r.width))) : null,
      style: { maxWidth: cs.maxWidth, paddingLeft: cs.paddingLeft, paddingRight: cs.paddingRight, fontSize: cs.fontSize,
        letterSpacing: cs.letterSpacing, writingMode: cs.writingMode, transform: cs.transform, columnCount: cs.columnCount,
        columnWidth: cs.columnWidth, textIndent: cs.textIndent, overflow: cs.overflow, whiteSpace: cs.whiteSpace,
        display: cs.display, clipPath: cs.clipPath, position: cs.position, height: cs.height },
      before: pseudoOf(el, '::before'), after: pseudoOf(el, '::after')
    };
  });
  let frozenCount = 0;
  for (const st of document.querySelectorAll('style')) frozenCount += st.textContent.split(${JSON.stringify(frozen)}).length - 1;
  return {
    doc: { innerWidth: window.innerWidth, clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth },
    mainWidth: main ? round(main.getBoundingClientRect().width) : null,
    noteCount: notes.length, frozenCount: frozenCount, notes: notesData
  };
})()`;
}

// ── 形态登记表 ───────────────────────────────────────────────────────────────
// 每条：id / direction（acceptance 要求覆盖的方向）/ what / css（纯 CSS，A/B 同源）/ expect
//   expect: 'bite' = 期望被门禁咬到（红）；'pass' = 期望放行（绿，即绕过）
//   realism: 能不能由一次**正常的产品改动**引入（给真实写法，而不是只有注入脚本能造）
const TARGET_NOTE_ROUTE = 'category/agent/';
const PAGE_BG = '#f6f7f9';   // dist/category/agent/index.html 的 :root --bg（body background: var(--bg)）

function formsFor(ctx) {
  const noteText = ctx.noteText;
  return [
    {
      id: 'ctl-no-inject', direction: 'control', route: TARGET_NOTE_ROUTE, expect: 'pass',
      what: '不注入（现场基线，正对照：装置不是对什么都判红）',
      css: null,
      realism: { level: 'n/a', how: '—', note: '对照' }
    },
    {
      id: 'ctl-maxwidth-70ch', direction: 'control', route: TARGET_NOTE_ROUTE, expect: 'bite',
      what: '正对照：`.snote { max-width: 70ch }`（改动前那根窄柱）—— 门禁必须咬到',
      css: '.snote { max-width: 70ch; }',
      realism: { level: 'high', how: '把 .snote 的 max-width 从 none 改回 70ch（就是本版要修的原缺陷）', note: '正对照，必须红' }
    },
    {
      id: 'transform-scaleX', direction: 'transform: scaleX()', route: TARGET_NOTE_ROUTE, expect: 'bite',
      what: '`.snote { transform: scaleX(0.33); transform-origin: left center }`：视觉上压到 1/3 宽，布局盒宽不变',
      css: '.snote { transform: scaleX(0.33); transform-origin: left center; }',
      realism: { level: 'low', how: '给说明加一个缩放动画/装饰（`transform: scaleX()`），正常改动一般不这么写', note: '预计被 note-axis 咬到（getBoundingClientRect 含 transform）—— 这条是「判据真的在动」的对照组' }
    },
    {
      id: 'pseudo-content-narrow', direction: '伪元素承载正文（::before/::after 的 content）', route: TARGET_NOTE_ROUTE, expect: 'pass',
      what: '正文交给自己 `::before` 的 `content` 画（`display:block; max-width:70ch`），真实文本节点缩到 0 号字 ⇒ 判据不把伪元素算进「有字区域」',
      css: `.snote { font-size: 0; }\n.snote::before { content: ${JSON.stringify(noteText)}; display: block; max-width: 70ch; font-size: var(--fs-sm); line-height: 1.7; color: var(--mut); white-space: normal; }`,
      realism: { level: 'low', how: '要把整段说明正文搬进 CSS 的 `content` —— 正常产品改动不会这么干（除非常年 SEO/文案兜底 hack）', note: '伪元素内容对 Range/`clientWidth` 都不可见；本条用来量化「文字面判据对伪元素的盲区」' }
    },
    {
      id: 'text-indent-clip', direction: 'text-indent 负值 + overflow: hidden', route: TARGET_NOTE_ROUTE, expect: 'bite',
      what: '`.snote { text-indent: -9999px; white-space: nowrap; overflow: hidden }`：经典「视觉隐藏文字」，盒宽一字不动，整段说明**一个字都看不见**',
      css: '.snote { text-indent: -9999px; white-space: nowrap; overflow: hidden; }',
      realism: { level: 'medium', how: '视觉隐藏（image-replacement / `.sr-only` 那类）是复制粘贴常见写法；把 `.snote` 误伤进去只需一次手滑', note: '实测：两版判据都咬到，但咬的是 **note-clipped（自身横向溢出）** 而不是「字看不见」——闸门拦得住，理由对不上缺陷（像素字迹 0px）' }
    },
    {
      id: 'text-indent-shift', direction: 'text-indent 负值 + overflow: hidden（多行变体）', route: TARGET_NOTE_ROUTE, expect: 'bite',
      what: '`.snote { text-indent: -9999px; overflow: hidden }`：只把**首行**移出盒外（其余行照常），盒宽不变',
      css: '.snote { text-indent: -9999px; overflow: hidden; }',
      realism: { level: 'low', how: '同上写法的变体（不配 nowrap），只影响首行', note: '实测：被 note-clipped 顺带咬到；像素字迹 0px ⇒ 整条说明在视觉上不存在' }
    },
    {
      id: 'writing-mode-vertical', direction: 'writing-mode', route: TARGET_NOTE_ROUTE, expect: 'bite',
      what: '`.snote { writing-mode: vertical-rl; height: 5.6rem; overflow: hidden }`：正文改竖排 —— 盒宽被内容反推成 346.64px',
      css: '.snote { writing-mode: vertical-rl; height: 5.6rem; overflow: hidden; }',
      realism: { level: 'medium', how: 'CJK 站点做竖排/侧栏标题时 `writing-mode` 很常见；一条规则落到 `.snote` 上即可', note: '实测：盒宽自己缩到 346.64px ⇒ 被 note-narrow **顺带**咬到（不是因为看见竖排）' }
    },
    {
      id: 'writing-mode-vertical-fullwidth', direction: 'writing-mode（盒宽锁满宽）', route: TARGET_NOTE_ROUTE, expect: 'pass',
      what: '`.snote { writing-mode: vertical-rl; width: 100%; height: 5.6rem; overflow: hidden }`：**盒宽锁死满宽**，正文竖排成一根 ~24px 竖条',
      css: '.snote { writing-mode: vertical-rl; width: 100%; height: 5.6rem; overflow: hidden; }',
      realism: { level: 'medium', how: '同 writing-mode；`width: 100%` 是几乎必然跟着写的（否则盒子会被内容反推）', note: '★ 真正的 writing-mode 绕过形态：盒宽与内容盒宽都满宽，可见文字是一根竖条' }
    },
    {
      id: 'font-size-tiny', direction: 'font-size 极小但盒宽满宽', route: TARGET_NOTE_ROUTE, expect: 'pass',
      what: '`.snote { font-size: 1px }`：盒宽满宽，文字缩到不可读（实测像素字迹只剩 112px —— 「窄柱」外观是字号造成的，不是宽度造成的）',
      css: '.snote { font-size: 1px; }',
      realism: { level: 'low', how: '把 `--fs-sm`/字号变量改错（比如 token 写错一位）就可能出现极小字号', note: '**不是窄柱缺陷**：本条用来说明门禁的边界（它不该管字号）；放行不算假绿，算越界观察' }
    },
    {
      id: 'letter-spacing-huge', direction: 'letter-spacing 极大', route: TARGET_NOTE_ROUTE, expect: 'pass',
      what: '`.snote { letter-spacing: 40px }`：每行只剩几个字，盒宽与行宽都还是满宽',
      css: '.snote { letter-spacing: 40px; }',
      realism: { level: 'low', how: '`letter-spacing` 通常写在标题/徽标上；落到 `.snote` 需要一次误伤（如选择器漏了层级）', note: '同为**越界观察**：不是窄柱' }
    },
    {
      id: 'multicol-narrow-columns', direction: 'CSS 多列（column-width/column-count）', route: TARGET_NOTE_ROUTE, expect: 'pass',
      what: '`.snote { column-count: 3; column-width: 340px; column-gap: 16px }`：**盒宽一字不动**，文字被排成 3 根 ~340px 窄列 —— 缺陷外观（窄柱）一字不差地回来了',
      css: '.snote { column-count: 3; column-width: 340px; column-gap: 16px; }',
      realism: { level: 'medium', how: '「把长说明排成两栏/三栏」是很正常的一次排版改动：`.snote { columns: 2 }` 一行就够', note: '★ 重点形态：任何「文字区并集宽」口径都看不见它（并集横跨整盒，单行却很窄）' }
    },
    {
      id: 'overlay-opaque', direction: '不透明覆盖层遮住右侧文本', route: TARGET_NOTE_ROUTE, expect: 'pass',
      what: '`.snote { position: relative } .snote::after { inset: 0 0 0 30%; background: #f6f7f9 }`：右侧 70% 被底色盖死 ⇒ 可见文字只剩左边 ~414px',
      css: `.snote { position: relative; }\n.snote::after { content: ''; position: absolute; top: 0; right: 0; bottom: 0; left: 30%; background: ${PAGE_BG}; }`,
      realism: { level: 'low', how: '需要一个不明所以的伪元素盖层；真实场景更接近「装饰层/骨架屏盖住了正文」', note: '文字排版一字没动，只是被盖住 —— 宽度类判据天然看不见「被盖住」' }
    },
    {
      id: 'float-narrow-column', direction: '浮动占位把正文挤成窄列（补充）', route: TARGET_NOTE_ROUTE, expect: 'pass',
      what: '`.snote::before { content:""; float: right; width: 70%; height: 6em }`：右侧 70% 被浮动占位吃掉，正文被迫排进左侧 30% ≈ 414px',
      css: '.snote::before { content: ""; float: right; width: 70%; height: 6em; }',
      realism: { level: 'medium', how: '真实写法：说明里放一张图/图标并 `float: right`（`img { float: right }`）——正是这个形状', note: '★ 与「改动前 70ch 窄柱」外观最像的一条：左边一根窄柱、右边整块空白' }
    },
    {
      id: 'flex-decorator-item', direction: 'flex 容器 + 装饰项吃掉 70%（补充）', route: TARGET_NOTE_ROUTE, expect: 'pass',
      what: '`.snote { display: flex } .snote::after { content:""; flex: 0 0 70% }`：正文变成匿名 flex 项，被挤进左侧 30% ≈ 414px；伪元素（不是元素、也不是「承载文本的块」）占掉右边 70%',
      css: '.snote { display: flex; }\n.snote::after { content: ""; flex: 0 0 70%; }',
      realism: { level: 'medium', how: '真实写法：说明条改成 flex 布局并在末尾放一个装饰块/占位（`.snote { display:flex }` + `.snote::after { content:""; flex:1 }`）', note: '★ 匿名 flex 项在 DOM 里没有对应元素 ⇒ 任何「遍历元素量 content box」的口径都看不见它' }
    },
    {
      id: 'grid-narrow-track', direction: 'grid 单轨变窄（补充）', route: TARGET_NOTE_ROUTE, expect: 'pass',
      what: '`.snote { display: grid; grid-template-columns: 340px 1fr }`：文本落进 340px 的第一轨，盒宽仍满宽',
      css: '.snote { display: grid; grid-template-columns: 340px 1fr; }',
      realism: { level: 'low', how: '把说明块改成 grid 布局（分栏/图标+文字）时的常见写法', note: '补充：与 multicol 同一类盲区（宽盒里排窄行）' }
    },
    {
      id: 'clip-path-inset', direction: 'clip-path 裁掉右侧（补充）', route: TARGET_NOTE_ROUTE, expect: 'pass',
      what: '`.snote { clip-path: inset(0 70% 0 0) }`：绘制期裁掉右侧 70%，盒宽/文字排版都不动',
      css: '.snote { clip-path: inset(0 70% 0 0); }',
      realism: { level: 'low', how: '`clip-path` 多用于装饰性裁切；落到 `.snote` 是误伤', note: '补充：与遮罩同类（绘制期隐藏）' }
    }
  ];
}
function TARGET_NOTE_ROOT_PLACEHOLDER() { return TARGET_NOTE_ROUTE; }

// ── 目标页正文提取（伪元素形态要把正文搬进 CSS content） ─────────────────────
function extractNoteText(dir, route) {
  const file = path.join(dir, route, 'index.html');
  const html = fs.readFileSync(file, 'utf8');
  const mainIdx = html.indexOf('<main');
  const body = mainIdx >= 0 ? html.slice(mainIdx) : html;
  const m = body.match(/<p class="snote"[^>]*>([\s\S]*?)<\/p>/);
  if (!m) throw new Error(`目标页 ${route} 的 <main> 里找不到 .snote：无法为该形态取正文`);
  const text = m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  if (!text) throw new Error(`目标页 ${route} 的第一条 .snote 正文是空的`);
  return text;
}

// ── 静态服务（与 §22c/§22b 同一套极简规则） ──────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8'
};
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

// ── 形态判定 ─────────────────────────────────────────────────────────────────
const BITE_CODES = ['note-narrow', 'note-axis', 'note-clipped', 'unclassified-layout', 'data-region-missing',
  'missing-detail-main', 'unexpected-detail-main'];
const isBite = codes => codes.some(code => BITE_CODES.includes(code) || code.startsWith('page-overflow@'));

async function scenario(browser, base, judge, kindByRoute, form, opts = {}) {
  const route = form.route;
  const width = form.width || 1440;
  const out = { id: form.id, what: form.what, direction: form.direction, route, width,
    injectedCss: form.css || null, realism: form.realism, expect: form.expect, files: [], errors: [] };
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  try {
    await page.goto(new URL(route, base).href, { waitUntil: 'load' });
    if (form.css) { await page.addStyleTag({ content: form.css }); out.injected = 'addStyleTag'; }
    const geometry = await judge.wideMeasure(page);
    const problems = judge.wideProblems(geometry, metaOf(route, judge, kindByRoute));
    out.codes = problems.map(p => p.code);
    out.messages = problems.map(p => p.msg);
    out.verdict = out.codes.length ? 'bite' : 'pass';
    out.judgeGeometry = {
      noteCount: geometry.noteCount, frozenCount: geometry.frozenCount,
      regionSel: geometry.regionSel, regionWidth: geometry.region.width, mainWidth: geometry.main.width,
      column: Math.min(geometry.region.width, geometry.main.width),
      notes: (geometry.notes || []).map(n => ({
        index: n.index, boxWidth: n.box.width, boxLeft: n.box.left, boxRight: n.box.right,
        contentBox: n.contentBox, textWidth: n.textWidth, textFallback: n.textFallback, bearingCount: n.bearingCount,
        ink: n.ink ? { width: n.ink.width, lines: n.ink.lines, longestLine: n.ink.longestLine } : null
      })),
      noteLegacy: geometry.note ? { width: geometry.note.width, left: geometry.note.left, right: geometry.note.right } : null
    };
    out.probe = await page.evaluate(probeScript(judge.WIDE_SNOTE_FROZEN));
    if (out.probe.noteCount > 0) {
      const idx = 0;
      const el = page.locator('main .snote').nth(idx);
      try {
        const shot = await el.screenshot({ timeout: 20000 });
        const boxWidth = out.probe.notes[idx].box.width;
        out.paint = Object.assign({ noteIndex: idx }, inkFromPng(decodePng(shot), boxWidth));
        if (opts.shotDir) {
          const p = path.join(opts.shotDir, `${form.id}.png`);
          fs.mkdirSync(path.dirname(p), { recursive: true });
          fs.writeFileSync(p, shot);
          out.files.push(path.relative(WORKTREE, p));
        }
      } catch (e) {
        out.paint = { error: String(e.message || e) };
      }
      // 逐条也量一遍像素字迹里最窄的（多条说明全部被注入影响时，报最小值）
      try {
        const n = out.probe.noteCount;
        if (n > 1) {
          const widths = [];
          for (let i = 0; i < n; i += 1) {
            const shotI = await page.locator('main .snote').nth(i).screenshot({ timeout: 20000 });
            const w = inkFromPng(decodePng(shotI), out.probe.notes[i].box.width).paintInkWidth;
            widths.push(w);
          }
          out.paintAll = widths;
          out.paintInkWidthMin = Math.min.apply(null, widths);
        } else out.paintInkWidthMin = out.paint.paintInkWidth;
      } catch (e) {
        out.paintInkWidthMin = null;
        out.errors.push(`多条像素量测失败：${String(e.message || e)}`);
      }
    }
  } catch (e) {
    out.verdict = 'error';
    out.errors.push(String((e && e.stack) || e));
  } finally {
    await page.close();
  }
  return out;
}

// ── 模式 A ───────────────────────────────────────────────────────────────────
async function runModeA(judge, kindByRoute, forms) {
  const { server, port } = await serve(DIR);
  const base = `http://127.0.0.1:${port}/`;
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const rows = [];
  try {
    for (const form of forms) {
      const row = await scenario(browser, base, judge, kindByRoute, form, { shotDir: path.join(HERE, 'runs', 'shots') });
      rows.push(row);
      const probeNote = row.probe && row.probe.notes[0];
      console.log(`\n[${row.id}] ${row.verdict === 'bite' ? '咬中' : row.verdict === 'pass' ? '放行' : '错误'} · 期望 ${row.expect === 'bite' ? '咬中' : '放行'}`
        + ` · ${row.route}@${row.width}`);
      console.log(`     注入：${row.injectedCss ? row.injectedCss.replace(/\n/g, ' ⏎ ') : '（无）'}`);
      console.log(`     违规码 [${(row.codes || []).join(', ') || '无'}]`);
      if (row.judgeGeometry) {
        const g = row.judgeGeometry;
        const noteText = g.notes.length
          ? g.notes.map(n => n.boxWidth).join('/')
          : (g.noteLegacy ? `${g.noteLegacy.width}` : '—');
        const tw = g.notes.length
          ? g.notes.map(n => n.textWidth).join('/')
          : `（修复前口径没有 textWidth；box 即判据输入：${g.noteLegacy ? g.noteLegacy.width : '—'}）`;
        console.log(`     判据读数：盒宽 ${noteText}px · textWidth ${tw} · 列宽 ${Math.round(g.column)}px`
          + (g.notes.length ? ` · bearing ${g.notes.map(n => n.bearingCount).join('/')} · textFallback ${g.notes.map(n => n.textFallback).join('/')}` : ''));
      }
      if (probeNote) {
        console.log(`     独立量测：Range 字迹并集 ${probeNote.inkUnion ? probeNote.inkUnion.width : '—'}px`
          + ` · 最长行 ${probeNote.inkLongestLine}px · 中位行 ${probeNote.inkMedianLine}px`
          + ` · 裁进盒内最长 ${probeNote.inkClippedLongest}px`);
      }
      if (row.paint && !row.paint.error) {
        console.log(`     像素字迹：宽 ${row.paint.paintInkWidth}px（${row.paint.paintInkLeft}..${row.paint.paintInkRight}）`
          + ` · 最长连续段 ${row.paint.paintLongestRun}px · 段数 ${row.paint.paintRuns}`
          + ` · 缝 ${row.paint.paintGaps.map(g => `${g.leftCss}+${g.widthCss}`).join(' ') || '无'}`);
      } else if (row.paint) console.log(`     像素字迹：量测失败 ${row.paint.error}`);
      if (row.errors.length) row.errors.forEach(e => console.log(`     ⚠️ ${e.split('\n')[0]}`));
    }
  } finally {
    await browser.close();
    server.close();
  }
  return rows;
}

// ── 模式 B ───────────────────────────────────────────────────────────────────
function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function injectIntoSharedStyle(file, css) {
  const original = fs.readFileSync(file, 'utf8');
  const frozen = judgeForInjection.frozen;
  const count = original.split(frozen).length - 1;
  if (count !== 1) return { ok: false, reason: `冻结串在 ${path.basename(file)} 里出现 ${count} 次（必须恰好 1 次）` };
  const injected = `${frozen}\n${css}`;
  const next = original.replace(frozen, injected);
  const nextCount = next.split(frozen).length - 1;
  if (nextCount !== 1) return { ok: false, reason: `注入后冻结串变成 ${nextCount} 次` };
  const reverted = next.replace(injected, frozen);
  if (reverted !== original) return { ok: false, reason: '注入不可逐字节回退（替换不是单点）' };
  fs.writeFileSync(file, next, 'utf8');
  return { ok: true, frozenCountBefore: count, frozenCountAfter: nextCount, revertible: true, bytesAdded: Buffer.byteLength(next) - Buffer.byteLength(original) };
}

let judgeForInjection = { frozen: '' };

function parseSuiteOutput(stdout) {
  const lines = String(stdout || '').split('\n');
  const failures = lines.filter(l => /^\s*✗/.test(l)).map(l => l.trim());
  const total = (stdout.match(/验收\s*(\d+)\s*项[，,]\s*失败\s*(\d+)\s*项/) || []);
  const s22c = lines.filter(l => l.includes('§22c'));
  const frozen = s22c.find(l => l.includes('冻结串'));
  const summary = s22c.find(l => l.includes('逐条判'));
  const sweep = lines.find(l => l.includes('布局族读数表') || l.includes('逐条读数：@'));
  const mutationRows = lines.filter(l => /^\s*(M\d|M0)/.test(l.trim()));
  return {
    assertions: total[1] ? Number(total[1]) : null,
    failedAssertions: total[2] ? Number(total[2]) : null,
    failingLines: failures,
    failingCount: failures.length,
    section22cLines: s22c.slice(0, 40),
    frozenLine: frozen || null, summaryLine: summary || null, sweepLine: sweep || null,
    mutationRows: mutationRows.slice(0, 30)
  };
}

function runModeB(judge, kindByRoute, forms) {
  judgeForInjection = { frozen: judge.WIDE_SNOTE_FROZEN };
  // 套件自己的 ROOT = <verify-site>/../..（§22c 的 DIR = path.join(ROOT, --dir)）——
  // 因此 --dir 必须是**相对该 ROOT** 的路径，沙箱（recovered/pre-t7）与生产路径都适用。
  const suiteRoot = path.resolve(path.dirname(VERIFY_SITE), '..', '..');
  const scratchName = String(arg('scratch-name', `${path.basename(DIR)}-probe`));
  const scratch = path.join(SCRATCH_ROOT, scratchName);
  const relScratch = path.relative(suiteRoot, scratch).split(path.sep).join('/');
  if (!fs.existsSync(scratch)) {
    console.log(`模式 B：拷贝 scratch 副本 ${path.relative(WORKTREE, DIR)} → ${path.relative(WORKTREE, scratch)}（一次性）`);
    copyDir(DIR, scratch);
  } else {
    console.log(`模式 B：复用 scratch 副本 ${path.relative(WORKTREE, scratch)}`);
  }
  const scratchHtml = path.join(scratch, 'index.html');
  if (!fs.existsSync(scratchHtml)) throw new Error('scratch 副本不完整');
  const rows = [];
  return { scratch, relScratch, suiteRoot, rows };
}

// 模式 B 的逐形态执行（同步：跑套件；异步部分在 main 里做探针）
function modeBRunForm(form, ctx) {
  const { scratch, relScratch } = ctx;
  const row = { id: form.id, what: form.what, direction: form.direction, route: form.route, width: form.width || 1440,
    injectedCss: form.css || null, realism: form.realism, expect: form.expect, targets: [] };
  const targetFiles = form.targets || [`${form.route.replace(/\/$/, '')}/index.html`];
  // 1) 还原 + 注入
  for (const rel of targetFiles) {
    const src = path.join(DIR, rel);
    const dst = path.join(scratch, rel);
    fs.copyFileSync(src, dst);
  }
  if (form.css) {
    for (const rel of targetFiles) {
      const dst = path.join(scratch, rel);
      const res = injectIntoSharedStyle(dst, form.css);
      row.targets.push(Object.assign({ file: rel, sha256After: crypto.createHash('sha256').update(fs.readFileSync(dst)).digest('hex') }, res));
      if (!res.ok) { row.verdict = 'error'; row.errors = [res.reason]; return row; }
    }
  } else {
    row.targets.push({ file: targetFiles[0], injected: false, reason: '对照：不注入' });
  }
  // 2) 跑完整套件
  const jsonAbs = path.resolve(HERE, 'runs', `suite-${form.id}.json`);
  const args = [VERIFY_SITE, `--dir=${relScratch}`, `--json=${jsonAbs}`];
  const shaBefore = crypto.createHash('sha256').update(fs.readFileSync(VERIFY_SITE)).digest('hex');
  const t0 = Date.now();
  const proc = spawnSync(process.execPath, args, { cwd: WORKTREE, encoding: 'utf8', maxBuffer: 1 << 28, timeout: SUITE_TIMEOUT_MS });
  const seconds = Math.round((Date.now() - t0) / 1000);
  const shaAfter = crypto.createHash('sha256').update(fs.readFileSync(VERIFY_SITE)).digest('hex');
  row.suite = {
    command: `node ${path.relative(WORKTREE, VERIFY_SITE)} --dir=${relScratch} --json=${path.relative(WORKTREE, jsonAbs)}  (cwd=worktree 根；--dir 相对套件自己的 ROOT)`,
    exitCode: proc.status, seconds,
    signal: proc.signal || null,
    verifySiteShaBefore: shaBefore, verifySiteShaAfter: shaAfter,
    pinnedStable: shaBefore === shaAfter,
    stdoutTail: String(proc.stdout || '').split('\n').slice(-25),
    stderrTail: String(proc.stderr || '').split('\n').slice(-10)
  };
  row.suite.parsed = parseSuiteOutput(proc.stdout);
  if (proc.status === 0) row.verdict = 'false-green';
  else if (proc.status === null) row.verdict = 'timeout';
  else row.verdict = 'bite';
  try {
    const report = JSON.parse(fs.readFileSync(jsonAbs, 'utf8'));
    const m = report.metrics || {};
    const violations = m.layoutViolations || null;
    const routeKey = form.route;
    row.metrics = {
      layoutViolations: Array.isArray(violations) ? violations.length : violations,
      targetViolation: Array.isArray(violations) ? (violations.find(v => v.route === routeKey) || null) : null,
      layoutSweep: m.layoutSweep || null,
      layoutNotesForTarget: m.layoutNotes && m.layoutNotes[routeKey] ? m.layoutNotes[routeKey] : (m.layoutNotes ? 'target-not-in-layoutNotes' : null),
      layoutMutationCodes: m.layoutMutationCodes || null
    };
  } catch (e) {
    row.reportReadError = String(e.message || e);
  }
  // 注意：这里**不还原** —— 调用方要在「注入仍在文件里」的状态下先做独立像素探针，
  // 再调 restoreTargets()。顺序反了就会拿未注入的页面去量（假证据）。
  return row;
}

/** 把 scratch 里的目标页还原成源产物（每个形态跑完必须调一次）。 */
function restoreTargets(form, ctx) {
  const targetFiles = form.targets || [`${form.route.replace(/\/$/, '')}/index.html`];
  for (const rel of targetFiles) fs.copyFileSync(path.join(DIR, rel), path.join(ctx.scratch, rel));
}

// ── 主流程 ───────────────────────────────────────────────────────────────────
(async () => {
  const judge = loadJudge(extraction.judge.text, DIR);
  const missing = Object.entries(judge).filter(([, v]) => v === undefined).map(([k]) => k);
  const fileNow = crypto.createHash('sha256').update(fs.readFileSync(VERIFY_SITE)).digest('hex');
  const baseReport = {
    generatedAt: new Date().toISOString(),
    host: 't11 adversary · anchor-based harness',
    mode: MODE,
    verifySite: {
      path: path.relative(WORKTREE, VERIFY_SITE), sha256: fileNow,
      judge: { anchors: extraction.judge.anchors, lines: extraction.judge.lines, lineCount: extraction.judge.lineCount, sha256: extraction.judge.sha256 },
      mutate: { lines: extraction.mutate.lines, lineCount: extraction.mutate.lineCount, sha256: extraction.mutate.sha256 }
    },
    dir: path.relative(WORKTREE, DIR),
    extraction: { ok: missing.length === 0, missingSymbols: missing },
    forms: []
  };
  if (missing.length) {
    baseReport.verdict = 'RED';
    baseReport.reason = `判据区缺符号：${missing.join(', ')} ⇒ 判红（不跑形态）`;
    fs.mkdirSync(path.dirname(JSON_OUT), { recursive: true });
    fs.writeFileSync(JSON_OUT, `${JSON.stringify(baseReport, null, 2)}\n`, 'utf8');
    console.error(`❌ 判据抽取区缺符号：${missing.join(', ')}`);
    process.exit(3);
  }

  console.log(`harness · 模式 ${MODE}`);
  console.log(`判据抽取自 ${path.relative(WORKTREE, VERIFY_SITE)}（锚点式：${extraction.judge.anchors.start} → ${extraction.judge.anchors.problems} 函数结束）`);
  console.log(`  区间行 ${extraction.judge.lines}（${extraction.judge.lineCount} 行）· sha256 ${extraction.judge.sha256.slice(0, 16)}…`);
  console.log(`  wideMutate 行 ${extraction.mutate.lines}（${extraction.mutate.lineCount} 行）· sha256 ${extraction.mutate.sha256.slice(0, 16)}…`);
  console.log(`  整文件 sha256 ${fileNow}`);

  const noteText = extractNoteText(DIR, ROUTE_OVERRIDE || TARGET_NOTE_ROUTE);
  let forms = formsFor({ noteText });
  if (ROUTE_OVERRIDE) forms = forms.map(f => Object.assign({}, f, { route: ROUTE_OVERRIDE }));
  // --no-inject：只量「文件里已经带着形态」的产物（模式 B 的 scratch 就是这样），不再二次注入。
  if (arg('no-inject', false)) forms = forms.map(f => Object.assign({}, f, { css: null }));
  let filter = FORM_FILTER;
  if (ONLY_GREEN_FROM) {
    const prev = JSON.parse(fs.readFileSync(ONLY_GREEN_FROM, 'utf8'));
    filter = (prev.forms || []).filter(f => f.verdict === 'pass' && !String(f.id).startsWith('ctl-no-inject')).map(f => f.id);
    console.log(`（--only-green-from：只跑模式 A 里放行的 ${filter.length} 条 + 正对照）`);
  }
  if (filter) forms = forms.filter(f => filter.includes(f.id) || f.id === 'ctl-maxwidth-70ch');
  console.log(`形态 ${forms.length} 条 · 目标页 ${ROUTE_OVERRIDE || TARGET_NOTE_ROUTE} · 注入正文 ${noteText.length} 字`);

  const kindByRoute = judge.wideKindByRoute ? judge.wideKindByRoute() : new Map();

  if (MODE === 'A') {
    baseReport.forms = await runModeA(judge, kindByRoute, forms);
  } else {
    const ctx = runModeB(judge, kindByRoute, forms);
    baseReport.scratch = { dir: path.relative(WORKTREE, ctx.scratch), source: path.relative(WORKTREE, DIR), suiteRoot: path.relative(WORKTREE, ctx.suiteRoot), dirArgPassed: ctx.relScratch };
    const { server, port } = await serve(ctx.scratch);
    const base = `http://127.0.0.1:${port}/`;
    const browser = await chromium.launch({ executablePath: EDGE, headless: true });
    try {
      for (const form of forms) {
        console.log(`\n===== 模式 B · ${form.id} =====`);
        const row = modeBRunForm(form, ctx);
        // 套件跑完后，对**同一份 scratch** 做独立探针（判据看不见的东西用像素量）
        console.log(`     套件 EXIT=${row.suite.exitCode}（${row.suite.seconds}s）· ${row.suite.parsed.assertions} 项断言 / 失败 ${row.suite.parsed.failedAssertions}`
          + ` · sha 稳定 ${row.suite.pinnedStable}`);
        if (row.verdict === 'false-green') {
          const probeRow = await scenario(browser, base, judge, kindByRoute, { id: form.id, route: form.route, width: form.width, what: form.what, direction: form.direction, css: null, expect: form.expect, realism: form.realism }, { shotDir: path.join(HERE, 'runs', 'shots', 'modeB') });
          row.scratchJudge = { codes: probeRow.codes, verdict: probeRow.verdict, judgeGeometry: probeRow.judgeGeometry };
          row.scratchProbe = probeRow.probe;
          row.scratchPaint = probeRow.paint;
          row.scratchPaintMin = probeRow.paintInkWidthMin;
          console.log(`     ★ 假绿：套件整轮 EXIT=0，而同一份 scratch 现场量到`
            + ` 判据 textWidth ${(probeRow.judgeGeometry.notes || []).map(n => n.textWidth).join('/') || (probeRow.judgeGeometry.noteLegacy ? probeRow.judgeGeometry.noteLegacy.width : '—')}px`
            + ` · 像素字迹 ${probeRow.paint ? probeRow.paint.paintInkWidth : '—'}px`
            + ` · 违规码 [${probeRow.codes.join(', ') || '无'}]`);
        } else {
          console.log(`     咬中：失败断言 ${row.suite.parsed.failingCount} 条 · 前 3 条：`);
          row.suite.parsed.failingLines.slice(0, 3).forEach(l => console.log(`       ${l.slice(0, 160)}`));
        }
        restoreTargets(form, ctx);
        baseReport.forms.push(row);
        fs.writeFileSync(JSON_OUT, `${JSON.stringify(baseReport, null, 2)}\n`, 'utf8');
      }
    } finally {
      await browser.close();
      server.close();
    }
  }

  // ── 判定 ────────────────────────────────────────────────────────────────
  const rows = baseReport.forms;
  const mismatches = rows.filter(r => (r.verdict === 'bite' || r.verdict === 'false-green')
    ? r.expect !== (MODE === 'B' ? (r.verdict === 'bite' ? 'bite' : 'pass') : 'bite')
    : false);
  baseReport.summary = {
    forms: rows.length,
    bite: rows.filter(r => r.verdict === 'bite').length,
    pass: rows.filter(r => r.verdict === 'pass' || r.verdict === 'false-green').length,
    error: rows.filter(r => r.verdict === 'error' || r.verdict === 'timeout').length,
    falseGreenConfirmed: rows.filter(r => r.verdict === 'false-green').map(r => r.id),
    unexpected: mismatches.map(r => ({ id: r.id, verdict: r.verdict, expect: r.expect })),
    judgeSha256: extraction.judge.sha256, verifySiteSha256: fileNow
  };
  fs.mkdirSync(path.dirname(JSON_OUT), { recursive: true });
  fs.writeFileSync(JSON_OUT, `${JSON.stringify(baseReport, null, 2)}\n`, 'utf8');

  console.log(`\n===== 汇总（模式 ${MODE}）=====`);
  console.log(`  咬中 ${baseReport.summary.bite} · 放行 ${baseReport.summary.pass} · 错误 ${baseReport.summary.error}`);
  if (MODE === 'B') console.log(`  模式 B 已证实的假绿（整轮 EXIT=0）：${baseReport.summary.falseGreenConfirmed.join(', ') || '（无）'}`);
  if (baseReport.summary.unexpected.length) {
    console.log(`  与期望不符：${baseReport.summary.unexpected.map(u => `${u.id}(实测 ${u.verdict} / 期望 ${u.expect})`).join(', ')}`);
  }
  console.log(`  报告：${path.relative(WORKTREE, JSON_OUT)}`);
  if (MODE === 'A') {
    rows.forEach(r => console.log(`  ${r.id.padEnd(28)} ${r.verdict === 'bite' ? '咬中' : r.verdict === 'pass' ? '放行' : r.verdict.padEnd(4)}  期望 ${r.expect === 'bite' ? '咬中' : '放行'}  [${(r.codes || []).join(', ') || '无'}]`));
  }
  const bad = MODE === 'A'
    ? rows.some(r => r.verdict === 'error')
    : rows.some(r => r.verdict === 'error' || (r.expect === 'bite' && r.verdict !== 'bite') || (r.expect === 'pass' && r.verdict === 'bite'));
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
