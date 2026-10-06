/**
 * T6 round-2 复审 · 对抗式驱动 v2（判据仍从 verify-site.js **逐字抽取**，绝不重写）。
 *
 * 与 round-1 的 adversarial.cjs 的差别：
 *   · 判据换成修复后的版本（宽判据 = textWidth；轴 = border-box + 5% 比例容差；<main> 内全部 .snote 逐条判）；
 *   · 输出改成**逐条**（route#index / 盒宽 / content box / textWidth / 字迹 ink / 违规码带 index）；
 *   · 新增：F1 兼容性三条（aliasnote / 60px / 450px）、round-2 新增绕过尝试（transform / grid 匿名盒 /
 *     伪元素承载文本 / text-indent+overflow / writing-mode）。
 *
 * 纪律：只在浏览器内存里注入；产物级验证一律写 review/scratch/**，从不碰 dist。
 */
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.join(__dirname, '..', '..', '..', '..');
const SRC_FILE = path.join(ROOT, 'scripts', 'tools', 'verify-site.js');
const SRC = fs.readFileSync(SRC_FILE, 'utf8');
const srcLines = SRC.split('\n');

function slice(startNeedle, fromNeedle, endLine) {
  const start = srcLines.findIndex(line => line.includes(startNeedle));
  if (start < 0) throw new Error(`抽不到起点：${startNeedle}`);
  const from = srcLines.findIndex((line, i) => i >= start && line.includes(fromNeedle));
  if (from < 0) throw new Error(`抽不到终点引导行：${fromNeedle}`);
  const end = srcLines.findIndex((line, i) => i >= from && line === endLine);
  if (end < 0) throw new Error(`抽不到终点：${endLine}`);
  return { start: start + 1, end: end + 1, text: srcLines.slice(start, end + 1).join('\n') };
}

const judgeSlice = slice('  const WIDE_TOL = 1;', '  function wideProblems(geometry, meta) {', '  }');
const mutateSlice = slice('  async function wideMutate(target, anchor, replacement) {', '  async function wideMutate(target, anchor, replacement) {', '  }');
const JUDGE_SHA = crypto.createHash('sha256').update(judgeSlice.text).digest('hex');
const MUTATE_SHA = crypto.createHash('sha256').update(mutateSlice.text).digest('hex');

const dir = path.join(ROOT, process.argv[2] || 'dist');
const runTag = process.argv[3] || path.basename(dir);
const only = process.argv[4] ? process.argv[4].split(',') : null;

const pageKinds = require(path.join(ROOT, 'scripts', 'lib', 'page-kinds.js'));
const audienceLib = require(path.join(ROOT, 'scripts', 'lib', 'audience.js'));
const landingsLib = require(path.join(ROOT, 'scripts', 'lib', 'landing.js'));

const judge = new Function('fs', 'path', 'DIR', 'pageKinds', 'audienceLib', 'landingsLib', `
${judgeSlice.text}
return { wideMeasure, wideProblems, wideRoutesFromDisk, wideKindByRoute, wideSampleSet, WIDE_SNOTE_FROZEN, WIDE_DATA_SELECTORS, WIDE_NOTE_RATIO, WIDE_TOL, WIDE_AXIS_RATIO, WIDE_DESKTOP, WIDE_WIDE };
`)(fs, path, dir, pageKinds, audienceLib, landingsLib);

const mutator = new Function('fs', 'path', 'DIR', 'pageKinds', 'audienceLib', 'landingsLib', `
${mutateSlice.text}
return { wideMutate };
`)(fs, path, dir, pageKinds, audienceLib, landingsLib);

const kindByRoute = judge.wideKindByRoute();
const metaOf = route => {
  const kind = pageKinds.kindOfRoute(route) || kindByRoute.get(route) || null;
  return { route, kind, family: kind ? pageKinds.layoutOf(kind) : null };
};

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8'
};
function serve(dirPath) {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
      let file = path.join(dirPath, rel);
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      if (!file.startsWith(dirPath) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
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
async function scenario(browser, base, spec) {
  if (only && !only.includes(spec.id)) return null;
  const width = spec.width || 1440;
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  const out = { id: spec.id, route: spec.route, width, what: spec.what, expect: spec.expect, injected: null };
  try {
    await page.goto(new URL(spec.route, base).href, { waitUntil: 'load' });
    if (spec.css) { await page.addStyleTag({ content: spec.css }); out.injected = 'addStyleTag'; }
    if (spec.js) { out.injected = (out.injected ? out.injected + '+' : '') + 'evaluate'; out.jsResult = await page.evaluate(spec.js(spec)); }
    const geometry = await judge.wideMeasure(page);
    const problems = judge.wideProblems(geometry, metaOf(spec.route));
    out.codes = problems.map(p => p.code);
    out.coded = problems.map(p => (p.index === undefined ? p.code : `${p.code}#${p.index}`));
    out.messages = problems.map(p => p.msg);
    out.column = Math.round(Math.min(geometry.region.width, geometry.main.width) * 100) / 100;
    out.threshold = Math.round((judge.WIDE_NOTE_RATIO * out.column - 0.01) * 100) / 100;
    out.axisTol = Math.round(Math.max(judge.WIDE_TOL, judge.WIDE_AXIS_RATIO * out.column) * 100) / 100;
    out.regionSel = geometry.regionSel;
    out.scrollWidth = geometry.doc.scrollWidth;
    out.notes = geometry.notes.map(n => ({
      key: `${spec.route}#${n.index}`, box: n.box.width, inner: n.contentBox, textWidth: n.textWidth,
      fallback: n.textFallback, bearing: n.bearingCount, ink: n.ink ? n.ink.width : null,
      inkLongest: n.ink ? n.ink.longestLine : null, parent: n.parent, maxWidth: n.box.maxWidth,
      padRight: n.box.padRight, padLeft: n.box.padLeft, text: n.text
    }));
    out.textWidthOf = idx => (out.notes[idx] ? out.notes[idx].textWidth : null);
  } finally {
    await page.close();
  }
  results.push(out);
  const verdict = out.codes.length ? '红' : '绿';
  const mark = spec.expect ? ((out.codes.length > 0) === (spec.expect === 'red') ? ' ✅符合预期' : ' ❌与预期不符') : '';
  console.log(`\n[${out.id}] ${verdict}${mark}  ${out.route}@${width} — ${out.what}`);
  console.log(`     注入：${out.injected || '（无）'} · 违规码 [${out.coded.join(', ') || '无'}] · 主数据区 ${out.regionSel} ${out.column}px · 阈值 textWidth ≥ ${out.threshold}px · 轴容差 ${out.axisTol}px`);
  for (const n of out.notes) {
    const flag = n.textWidth < out.threshold ? ' ←窄' : '';
    console.log(`     ${n.key}  盒 ${n.box} · contentBox ${n.inner} · **textWidth ${n.textWidth}**（fallback=${n.fallback} 承载块 ${n.bearing}）· 字迹 ${n.ink}px/${n.inkLongest}px 最长行 · 父 ${n.parent}${flag}`);
  }
  if (out.messages.length) for (const m of out.messages.slice(0, 3)) console.log(`     ! ${m.slice(0, 180)}`);
  return out;
}

(async () => {
  const { server, port } = await serve(dir);
  const base = `http://127.0.0.1:${port}/`;
  const browser = await chromium.launch({ executablePath: process.env.DSH_EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true });
  console.log(`判据逐字抽取：${path.relative(ROOT, SRC_FILE)} 第 ${judgeSlice.start}–${judgeSlice.end} 行（${judgeSlice.text.split('\n').length} 行）sha256 ${JUDGE_SHA.slice(0, 16)}…`);
  console.log(`wideMutate 第 ${mutateSlice.start}–${mutateSlice.end} 行 sha256 ${MUTATE_SHA.slice(0, 16)}… · 目标产物 ${path.relative(ROOT, dir)}`);

  try {
    // ---- 对照 ----
    await scenario(browser, base, { id: 'R2-C0', route: 'student/', what: '不注入（现场基线）', expect: 'green' });
    await scenario(browser, base, { id: 'R2-G0', route: 'changes/', what: 'changes/ 不注入的现场读数（用于量 scratch 产物里被烘焙的规则）' });
    await scenario(browser, base, { id: 'R2-C0narrow', route: 'student/', css: '.snote { max-width: 70ch; }', what: '正对照：整页压窄', expect: 'red' });

    // ---- F1 反转：round-1 放行过的 5 种「不改盒宽」形态 ----
    await scenario(browser, base, { id: 'R2-F1-calc', route: 'student/', css: '.snote { padding-right: calc(100% - 70ch); }', what: 't5 的假绿原型（产物级复现用的就是这条）', expect: 'red' });
    await scenario(browser, base, { id: 'R2-F1-px', route: 'student/', css: '.snote { padding-right: 900px; }', what: '写死像素的 padding-right', expect: 'red' });
    await scenario(browser, base, { id: 'R2-F1-both', route: 'category/', css: '.snote { padding: 0 450px; }', what: '两侧 padding 各 450px', expect: 'red' });
    await scenario(browser, base, { id: 'R2-F1-innerwrap', route: 'student/',
      js: () => `(() => { const note = document.querySelector('main .snote'); const holder = document.createElement('div'); holder.style.maxWidth = '70ch'; while (note.firstChild) holder.appendChild(note.firstChild); note.appendChild(holder); return 'wrapped'; })()`,
      what: '把内容装进 max-width:70ch 的容器', expect: 'red' });
    await scenario(browser, base, { id: 'R2-F1-innerblock', route: 'docs/data/', css: '.snote > a, .snote > b, .snote > code { display: block; max-width: 70ch; }', what: '子元素块级化后压 70ch', expect: 'red' });

    // ---- F1 兼容性三条 ----
    await scenario(browser, base, { id: 'R2-compat-60', route: 'student/',
      js: () => `(() => { const note = document.querySelector('main .snote'); const wrap = document.createElement('div'); wrap.style.padding = '0 60px'; note.parentNode.insertBefore(wrap, note); wrap.appendChild(note); return 60; })()`,
      what: '60px 内缩容器（prompt §11 允许）', expect: 'green' });
    await scenario(browser, base, { id: 'R2-compat-30', route: 'student/',
      js: () => `(() => { const note = document.querySelector('main .snote'); const wrap = document.createElement('div'); wrap.style.padding = '0 30px'; note.parentNode.insertBefore(wrap, note); wrap.appendChild(note); return 30; })()`,
      what: '30px 内缩容器', expect: 'green' });
    await scenario(browser, base, { id: 'R2-compat-450', route: 'student/',
      js: () => `(() => { const note = document.querySelector('main .snote'); const wrap = document.createElement('div'); wrap.style.padding = '0 450px'; note.parentNode.insertBefore(wrap, note); wrap.appendChild(note); return 450; })()`,
      what: '450px 级内缩（必须红）', expect: 'red' });
    await scenario(browser, base, { id: 'R2-compat-alias1', route: 'need/student-only/', what: '别名页 .aliasnote#1（padding-left 8px + border-left 3px）不得判 note-axis', expect: 'green' });
    await scenario(browser, base, { id: 'R2-compat-alias2', route: 'need/free-api/', what: '别名页 .aliasnote#2', expect: 'green' });
    await scenario(browser, base, { id: 'R2-compat-alias3', route: 'need/dev-credits/', what: '别名页 .aliasnote#3', expect: 'green' });

    // ---- F2 反转：只压非首个 ----
    await scenario(browser, base, { id: 'R2-F2-sibling', route: 'docs/data/', css: '.snote ~ .snote { max-width: 70ch; }', what: '只压非首个（相邻兄弟选择器，9 条压 8 条）', expect: 'red' });
    await scenario(browser, base, { id: 'R2-F2-notfirst', route: 'changes/', css: '.snote:not(:first-of-type) { max-width: 70ch; }', what: '只压非首个（:not(:first-of-type)）', expect: 'red' });
    await scenario(browser, base, { id: 'R2-F2-section', route: 'changes/', css: '.chgsec .snote { max-width: 70ch; }', what: '只压分节里的（round-1 的 A5）', expect: 'red' });
    await scenario(browser, base, { id: 'R2-F2-inline', route: 'student/',
      js: () => `(() => { const notes = [...document.querySelectorAll('main .snote')]; notes.slice(1).forEach(el => { el.style.maxWidth = '70ch'; }); return notes.length; })()`,
      what: '行内样式只压非首个', expect: 'red' });

    // ---- round-2 新增绕过尝试 ----
    await scenario(browser, base, { id: 'R2-N1-transform', route: 'student/', css: '.snote { transform: scaleX(0.33); transform-origin: left top; }', what: 'transform: scaleX(0.33)（布局盒不变、绘制盒变窄）', expect: 'red' });
    await scenario(browser, base, { id: 'R2-N1b-transform-center', route: 'student/', css: '.snote { transform: scaleX(0.33); transform-origin: center top; }', what: 'transform: scaleX 居中缩放', expect: 'red' });
    await scenario(browser, base, { id: 'R2-N2-grid', route: 'student/', css: '.snote { display: grid; grid-template-columns: 70ch 1fr; }', what: 'display:grid + 70ch 列 ⇒ 文本落在**匿名网格项**里（不是元素）' });
    await scenario(browser, base, { id: 'R2-N2b-flex', route: 'student/', css: '.snote { display: flex; } .snote::first-line { }', what: 'display:flex（匿名弹性项）' });
    await scenario(browser, base, { id: 'R2-N3-pseudo', route: 'student/',
      js: () => `(() => { const note = document.querySelector('main .snote'); const text = note.textContent.replace(/\\s+/g, ' ').trim().replace(/"/g, '\\\\"'); const st = document.createElement('style'); st.textContent = '.snote { font-size: 0; } .snote::before { content: "' + text + '"; display: block; max-width: 70ch; font-size: 12px; line-height: 1.7; }'; document.head.appendChild(st); return text.length; })()`,
      what: '把正文搬进 ::before（真实文本 font-size:0 不可见）' });
    await scenario(browser, base, { id: 'R2-N4-indent', route: 'student/', css: '.snote { padding-left: 900px; text-indent: -900px; overflow: hidden; }', what: 'text-indent 负值 + padding + overflow:hidden（字被推出可视区）' });
    await scenario(browser, base, { id: 'R2-N5-writing', route: 'student/', css: '.snote { writing-mode: vertical-rl; }', what: 'writing-mode: vertical-rl（竖排窄条）' });
    await scenario(browser, base, { id: 'R2-N6-border', route: 'student/', css: '.snote { border-right: 900px solid transparent; margin-right: -900px; }', what: 'border-right 900px + 负 margin（盒对齐、内容被挤到 480px）' });
    await scenario(browser, base, { id: 'R2-N7-spanwrap', route: 'student/',
      js: () => `(() => { const note = document.querySelector('main .snote'); const holder = document.createElement('div'); holder.style.maxWidth = '70ch'; const span = document.createElement('span'); while (note.firstChild) span.appendChild(note.firstChild); holder.appendChild(span); note.appendChild(holder); return 'div>span'; })()`,
      what: '内容包进 max-width:70ch 的 div，div 里的文本又包在 inline span（承载文本的不是元素本身）' });
    await scenario(browser, base, { id: 'R2-N8-shrinkboth', route: 'student/', css: '.snote { max-width: 70ch; } .ctable { max-width: 70ch; }', what: '说明与主数据区**一起**压到 70ch（分母同缩：按「同轴」语义应当绿）' });
    await scenario(browser, base, { id: 'R2-N9-grid-puretext', route: 'changes/', css: '.snote { display: grid; grid-template-columns: 70ch 1fr; }', what: '**纯文本**说明 + grid 70ch 列（文本成为匿名网格项，DOM 里没有任何承载它的元素）' });
    await scenario(browser, base, { id: 'R2-N9b-grid-puretext-data', route: 'docs/data/', css: '.snote { display: grid; grid-template-columns: 70ch 1fr; }', what: '同上，在 docs/data/ 的纯文本说明上' });
    await scenario(browser, base, { id: 'R2-N9c-grid-mixed', route: 'docs/data/', css: '.snote { display: grid; grid-template-columns: 70ch 1fr; } .snote > a, .snote > code { display: inline; }', what: '同上 + 强制子元素保持 inline（减少被 blockify 的机会）' });
    await scenario(browser, base, { id: 'R2-N10-inline-span-narrow', route: 'student/',
      js: () => `(() => { const note = document.querySelector('main .snote'); const holder = document.createElement('div'); holder.style.maxWidth = '70ch'; const span = document.createElement('span'); span.textContent = note.textContent; note.textContent = ''; holder.appendChild(span); note.appendChild(holder); return 'span only'; })()`,
      what: '把整段文字放进 div>span（span 保持 inline）—— 文本节点没有任何块级承载者' });

    // ---- F4：只在 ≥1500px 生效的缺陷 ----
    await scenario(browser, base, { id: 'R2-F4-media1440', route: 'student/', width: 1440, css: '@media (min-width: 1500px) { .snote { max-width: 70ch; } }', what: 'F4 原型在 1440 档（物理上看不见，必须不误报）', expect: 'green' });
    await scenario(browser, base, { id: 'R2-F4-media1600', route: 'student/', width: 1600, css: '@media (min-width: 1500px) { .snote { max-width: 70ch; } }', what: 'F4 原型在 1600 档（必须咬中）', expect: 'red' });

    // ---- 「判不出来」与守卫 ----
    await scenario(browser, base, { id: 'R2-C4-nomain', route: 'student/', js: () => `(() => { document.querySelector('main').remove(); return 'removed'; })()`, what: '移除 <main> ⇒ data-region-missing', expect: 'red' });
    {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      try {
        await page.goto(new URL('student/', base).href, { waitUntil: 'load' });
        const frozen = judge.WIDE_SNOTE_FROZEN;
        const absent = await mutator.wideMutate(page, '§22c-这个锚点在产物里不存在', 'x');
        const many = await mutator.wideMutate(page, 'color: var(--mut);', 'color: var(--mut);');
        await page.evaluate(`(() => { const st = document.querySelectorAll('style')[0]; document.head.appendChild(st.cloneNode(true)); })()`);
        const twice = await mutator.wideMutate(page, frozen, 'x');
        await page.evaluate(`(() => { const st = document.querySelectorAll('style'); st[st.length - 1].remove(); })()`);
        const unique = await mutator.wideMutate(page, frozen, `${frozen}\n    .snote { padding-right: calc(100% - 70ch); }`);
        const after = await judge.wideMeasure(page);
        const afterProblems = judge.wideProblems(after, metaOf('student/')).map(p => (p.index === undefined ? p.code : `${p.code}#${p.index}`));
        const guardRows = [
          { id: 'G0-absent', result: absent },
          { id: 'G1-many', result: many },
          { id: 'G3-twice', result: twice },
          { id: 'G2-unique', result: unique, codes: afterProblems, textWidth: after.notes[0].textWidth }
        ];
        results.push({ id: 'guard', rows: guardRows });
        console.log('\n[guard] 反空洞守卫（生产文件里逐字抽出）');
        for (const row of guardRows) console.log(`     ${row.id}: ok=${row.result.ok} occurrences=${row.result.occurrences} ${row.result.reason || ''}${row.codes ? ` · 落地后码 [${row.codes.join(', ')}] · 首条 textWidth ${row.textWidth}px` : ''}`);
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
    server.close();
  }

  const outFile = path.join(__dirname, 'runs', `adversarial2-${runTag}.json`);
  fs.writeFileSync(outFile, `${JSON.stringify({
    generatedAt: new Date().toISOString(), dir: path.relative(ROOT, dir),
    extracted: {
      judge: { file: path.relative(ROOT, SRC_FILE), lines: `${judgeSlice.start}-${judgeSlice.end}`, sha256: JUDGE_SHA },
      mutate: { file: path.relative(ROOT, SRC_FILE), lines: `${mutateSlice.start}-${mutateSlice.end}`, sha256: MUTATE_SHA }
    },
    results
  }, null, 2)}\n`, 'utf8');
  console.log(`\n对抗读数已写出：${path.relative(ROOT, outFile)}`);
})().catch(e => { console.error(e); process.exit(1); });
