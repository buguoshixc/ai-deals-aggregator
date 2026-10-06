/**
 * T15（round 3）· 对抗式驱动 v3 —— 判据**按锚点**逐字抽取（不按行号），缺锚点即**判红退出**。
 *
 * 与 v2 的差别：
 *   · preflight：源文件里必须存在 round-3 的新口径标记（`note-hidden-text` + 逐行量
 *     `lineCount`/`widestLine`/`lines`）。**缺任何一个 ⇒ exit 1 并打印原因**（绝不静默跳过）。
 *   · 抽出判据后还要断言「判据函数体里真的用了逐行量」，避免「文件里有标记、判据没用」。
 *   · 场景：F-R2-1（grid 一条 CSS）、F-R2-2（伪元素承载正文）、t11 三形态（multicol / float / overlay）、
 *     以及 round-3 新增布局类形态（max-inline-size / display:table / columns+balance / zoom / shape-outside /
 *     line-clamp / rtl+unicode-bidi / contain:inline-size）。
 *
 * 用法：
 *   node adversarial3.cjs --preflight                     # 只做锚点体检
 *   node adversarial3.cjs dist dist [场景过滤,逗号分隔]
 */
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..', '..');
const SRC_FILE = path.join(ROOT, 'scripts', 'tools', 'verify-site.js');
const SRC = fs.readFileSync(SRC_FILE, 'utf8');
const srcLines = SRC.split('\n');
const SRC_SHA = crypto.createHash('sha256').update(SRC).digest('hex');

/** round-3 的判据标记：文件里必须都有，且判据函数体里必须真的用逐行量。 */
const REQUIRED_FILE_MARKERS = ['note-hidden-text', 'lineCount', 'widestLine'];
const REQUIRED_JUDGE_MARKERS = ['note-hidden-text', 'widestLine'];

function failPreflight(reason) {
  console.error(`\n❌ preflight 判红：${reason}`);
  console.error(`   源文件 ${path.relative(ROOT, SRC_FILE)} · sha256 ${SRC_SHA.slice(0, 16)}… · mtime ${fs.statSync(SRC_FILE).mtime.toISOString()}`);
  console.error('   ⇒ 修复轮（t14）的判据没有落盘，本轮**不做任何几何结论**（不静默跳过）。');
  process.exit(1);
}

for (const marker of REQUIRED_FILE_MARKERS) {
  if (!SRC.includes(marker)) failPreflight(`源文件里找不到标记「${marker}」（round-3 的逐行字迹口径尚未落盘）`);
}
console.log(`preflight：源文件标记齐备（${REQUIRED_FILE_MARKERS.join(' / ')}）· sha256 ${SRC_SHA.slice(0, 16)}…`);

function slice(startNeedle, fromNeedle, endLine) {
  const start = srcLines.findIndex(line => line.includes(startNeedle));
  if (start < 0) failPreflight(`抽不到起点锚：${startNeedle}`);
  const from = srcLines.findIndex((line, i) => i >= start && line.includes(fromNeedle));
  if (from < 0) failPreflight(`抽不到终点引导锚：${fromNeedle}`);
  const end = srcLines.findIndex((line, i) => i >= from && line === endLine);
  if (end < 0) failPreflight(`抽不到终点锚（第一个 === "${endLine}" 的行）`);
  return { start: start + 1, end: end + 1, text: srcLines.slice(start, end + 1).join('\n') };
}

const judgeSlice = slice('  const WIDE_TOL = 1;', '  function wideProblems(geometry, meta) {', '  }');
const mutateSlice = slice('  async function wideMutate(target, anchor, replacement) {', '  async function wideMutate(target, anchor, replacement) {', '  }');
for (const marker of REQUIRED_JUDGE_MARKERS) {
  if (!judgeSlice.text.includes(marker)) failPreflight(`抽出的判据（第 ${judgeSlice.start}–${judgeSlice.end} 行）里没有用「${marker}」——口径与自述不一致`);
}
const JUDGE_SHA = crypto.createHash('sha256').update(judgeSlice.text).digest('hex');
const MUTATE_SHA = crypto.createHash('sha256').update(mutateSlice.text).digest('hex');
console.log(`判据逐字抽取：第 ${judgeSlice.start}–${judgeSlice.end} 行（${judgeSlice.text.split('\n').length} 行）· sha256 ${JUDGE_SHA.slice(0, 16)}…`);
console.log(`wideMutate：第 ${mutateSlice.start}–${mutateSlice.end} 行 · sha256 ${MUTATE_SHA.slice(0, 16)}…`);

if (process.argv.includes('--preflight')) {
  console.log('preflight：通过（可以跑几何场景了）');
  process.exit(0);
}

const { chromium } = require('playwright-core');
const dir = path.join(ROOT, process.argv[2] || 'dist');
const runTag = process.argv[3] || path.basename(dir);
const only = process.argv[4] ? process.argv[4].split(',') : null;

const pageKinds = require(path.join(ROOT, 'scripts', 'lib', 'page-kinds.js'));
const audienceLib = require(path.join(ROOT, 'scripts', 'lib', 'audience.js'));
const landingsLib = require(path.join(ROOT, 'scripts', 'lib', 'landing.js'));

const judge = new Function('fs', 'path', 'DIR', 'pageKinds', 'audienceLib', 'landingsLib', `
${judgeSlice.text}
return { wideMeasure, wideProblems, wideRoutesFromDisk, wideKindByRoute, wideSampleSet, WIDE_SNOTE_FROZEN, WIDE_NOTE_RATIO, WIDE_TOL, WIDE_AXIS_RATIO };
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
function noteLineText(note) {
  const lineWidths = note.lineWidths || note.lines || null;
  return {
    key: note.key, box: note.box, textWidth: note.textWidth,
    lineCount: note.lineCount, widestLine: note.widestLine,
    narrowestLine: note.narrowestLine, ink: note.ink === undefined ? note.inkWidth : note.ink,
    lineWidths: Array.isArray(lineWidths) ? lineWidths.map(w => (typeof w === 'number' ? Math.round(w * 100) / 100 : w)) : null,
    hidden: note.hiddenText === true || note.hidden === true
  };
}

async function scenario(browser, base, spec) {
  if (only && !only.includes(spec.id)) return null;
  const width = spec.width || 1440;
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  const out = { id: spec.id, route: spec.route, width, what: spec.what, expect: spec.expect, injected: null };
  try {
    await page.goto(new URL(spec.route, base).href, { waitUntil: 'load' });
    if (spec.css) { await page.addStyleTag({ content: spec.css }); out.injected = 'addStyleTag'; }
    if (spec.js) { out.injected = (out.injected ? out.injected + '+' : '') + 'evaluate'; out.jsResult = await page.evaluate(spec.js()); }
    const geometry = await judge.wideMeasure(page);
    const problems = judge.wideProblems(geometry, metaOf(spec.route));
    out.codes = problems.map(p => p.code);
    out.coded = problems.map(p => (p.index === undefined ? p.code : `${p.code}#${p.index}`));
    out.messages = problems.map(p => p.msg);
    out.column = Math.round(Math.min(geometry.region.width, geometry.main.width) * 100) / 100;
    out.threshold = Math.round((judge.WIDE_NOTE_RATIO * out.column - 0.01) * 100) / 100;
    out.regionSel = geometry.regionSel;
    out.scrollWidth = geometry.doc.scrollWidth;
    out.notes = (geometry.notes || []).map(noteLineText);
  } finally {
    await page.close();
  }
  results.push(out);
  const verdict = out.codes.length ? '红' : '绿';
  const mark = spec.expect ? ((out.codes.length > 0) === (spec.expect === 'red') ? ' ✅符合预期' : ' ❌与预期不符') : '';
  console.log(`\n[${out.id}] ${verdict}${mark}  ${out.route}@${width} — ${out.what}`);
  console.log(`     注入：${out.injected || '（无）'} · 违规码 [${out.coded.join(', ') || '无'}] · 主数据区 ${out.regionSel} ${out.column}px · 阈值 widestLine ≥ ${out.threshold}px`);
  for (const n of out.notes.slice(0, spec.showNotes || 4)) {
    const flag = (typeof n.widestLine === 'number' && n.widestLine < out.threshold) ? ' ←窄柱' : '';
    console.log(`     ${n.key}  盒 ${n.box} · textWidth ${n.textWidth} · **行数 ${n.lineCount} / 最宽行 ${n.widestLine} / 最窄行 ${n.narrowestLine}** · 字迹 ${n.ink}${n.hidden ? ' · hiddenText' : ''}${flag}`);
    if (n.lineWidths) console.log(`        各行宽：${n.lineWidths.join(' ')}`);
  }
  if (out.messages.length) for (const m of out.messages.slice(0, 3)) console.log(`     ! ${m.slice(0, 190)}`);
  return out;
}

(async () => {
  const { server, port } = await serve(dir);
  const base = `http://127.0.0.1:${port}/`;
  const browser = await chromium.launch({ executablePath: process.env.DSH_EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true });
  console.log(`目标产物：${path.relative(ROOT, dir)}`);

  try {
    // ---- 对照 ----
    await scenario(browser, base, { id: 'R3-C0', route: 'student/', what: '不注入（现场基线）', expect: 'green' });
    await scenario(browser, base, { id: 'R3-C0narrow', route: 'student/', css: '.snote { max-width: 70ch; }', what: '正对照：整页压窄', expect: 'red' });

    // ---- F-R2-1 / F-R2-2 反转 ----
    await scenario(browser, base, { id: 'R3-FR21-grid', route: 'changes/', css: '.snote { display: grid; grid-template-columns: minmax(0, 70ch) 1fr; }', what: 'F-R2-1：一条 CSS 把纯文本说明挤进匿名网格项（round 2 曾整轮绿）', expect: 'red' });
    await scenario(browser, base, { id: 'R3-FR21-grid-student', route: 'student/', css: '.snote { display: grid; grid-template-columns: minmax(0, 70ch) 1fr; }', what: '同上，在 student/（说明里有内联 <b>/<a>）', expect: 'red' });
    await scenario(browser, base, { id: 'R3-FR21-spanwrap', route: 'student/',
      js: () => `(() => { const note = document.querySelector('main .snote'); const holder = document.createElement('div'); holder.style.maxWidth = '70ch'; const span = document.createElement('span'); while (note.firstChild) span.appendChild(note.firstChild); holder.appendChild(span); note.appendChild(holder); return 'div>span'; })()`,
      what: 'F-R2-1 的 div>span 形态（round 2 曾绿：承载块 0 / fallback）', expect: 'red' });
    await scenario(browser, base, { id: 'R3-FR22-pseudo', route: 'student/',
      js: () => `(() => { const note = document.querySelector('main .snote'); const text = note.textContent.replace(/\\s+/g, ' ').trim().replace(/"/g, '\\\\"'); const st = document.createElement('style'); st.textContent = '.snote { font-size: 0; } .snote::before { content: "' + text + '"; display: block; max-width: 70ch; font-size: 12px; line-height: 1.7; }'; document.head.appendChild(st); return text.length; })()`,
      what: 'F-R2-2：伪元素承载正文（真实文本 font-size:0）', expect: 'red' });

    // ---- t11 三形态 ----
    await scenario(browser, base, { id: 'R3-t11-multicol', route: 'changes/', css: '.snote { column-count: 3; column-width: 340px; }', what: 't11：multicol（column-count:3; column-width:340px）', expect: 'red', showNotes: 3 });
    await scenario(browser, base, { id: 'R3-t11-multicol-balance', route: 'changes/', css: '.snote { columns: 70ch; column-fill: balance; }', what: 'round3 新：columns:70ch + column-fill:balance', expect: 'red', showNotes: 3 });
    await scenario(browser, base, { id: 'R3-t11-float', route: 'changes/',
      css: '.snote::before { content: ""; float: right; width: 70%; height: 400px; }',
      what: 't11：float（::before float:right width:70% 撑满整段高度）', expect: 'red', showNotes: 3 });
    await scenario(browser, base, { id: 'R3-t11-overlay', route: 'changes/',
      css: '.snote { position: relative; } .snote::after { content: ""; position: absolute; top: 0; right: 0; bottom: 0; left: 30%; background: var(--card); }',
      what: 't11：overlay（不透明伪元素盖右侧 70%）—— 绘制类，**预期仍绿**', expect: 'green', showNotes: 2 });

    // ---- round-3 新增布局类形态 ----
    await scenario(browser, base, { id: 'R3-N1-inline-size', route: 'changes/', css: '.snote { max-inline-size: 70ch; }', what: 'round3 新：逻辑属性侧 max-inline-size:70ch', expect: 'red', showNotes: 2 });
    await scenario(browser, base, { id: 'R3-N2-table', route: 'changes/', css: '.snote { display: table; width: 70ch; }', what: 'round3 新：display:table + width:70ch（收缩盒）', expect: 'red', showNotes: 2 });
    await scenario(browser, base, { id: 'R3-N3-zoom', route: 'changes/', css: '.snote { zoom: 0.34; }', what: 'round3 新：zoom:0.34（渲染缩放 ⇒ 行盒变窄）', expect: 'red', showNotes: 2 });
    await scenario(browser, base, { id: 'R3-N4-shape', route: 'changes/',
      css: '.snote::before { content: ""; float: left; width: 70%; height: 600px; shape-outside: inset(0 0 0 0); }',
      what: 'round3 新：shape-outside 撑满高度的浮动体（所有行被挤到 30%）', expect: 'red', showNotes: 2 });
    await scenario(browser, base, { id: 'R3-N5-contain', route: 'changes/', css: '.snote { contain: inline-size; max-inline-size: 70ch; }', what: 'round3 新：contain:inline-size + max-inline-size', expect: 'red', showNotes: 2 });
    await scenario(browser, base, { id: 'R3-N6-lineclamp', route: 'changes/', css: '.snote { display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; }', what: 'round3 新：-webkit-line-clamp 截断（截断类，不是窄化）', showNotes: 2 });
    await scenario(browser, base, { id: 'R3-N7-rtl', route: 'changes/', css: '.snote { direction: rtl; unicode-bidi: bidi-override; }', what: 'round3 新：direction:rtl + unicode-bidi:bidi-override（文字反向，行宽不变）', showNotes: 2 });

    // ---- 判不出来 / 守卫 ----
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
        const unique = await mutator.wideMutate(page, frozen, `${frozen}\n    .snote { max-width: 70ch; }`);
        const after = await judge.wideMeasure(page);
        const codes = judge.wideProblems(after, metaOf('student/')).map(p => (p.index === undefined ? p.code : `${p.code}#${p.index}`));
        const guardRows = [
          { id: 'G0-absent', result: absent },
          { id: 'G1-many', result: many },
          { id: 'G3-twice', result: twice },
          { id: 'G2-unique', result: unique, codes }
        ];
        results.push({ id: 'guard', rows: guardRows });
        console.log('\n[guard] 反空洞守卫（逐字抽取）');
        for (const row of guardRows) console.log(`     ${row.id}: ok=${row.result.ok} occurrences=${row.result.occurrences} ${row.result.reason || ''}${row.codes ? ` · 落地后码 [${row.codes.join(', ')}]` : ''}`);
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
    server.close();
  }

  const outFile = path.join(__dirname, 'runs', `adversarial3-${runTag}.json`);
  fs.writeFileSync(outFile, `${JSON.stringify({
    generatedAt: new Date().toISOString(), dir: path.relative(ROOT, dir), srcSha256: SRC_SHA,
    extracted: {
      judge: { file: path.relative(ROOT, SRC_FILE), lines: `${judgeSlice.start}-${judgeSlice.end}`, sha256: JUDGE_SHA },
      mutate: { file: path.relative(ROOT, SRC_FILE), lines: `${mutateSlice.start}-${mutateSlice.end}`, sha256: MUTATE_SHA }
    },
    results
  }, null, 2)}\n`, 'utf8');
  console.log(`\n对抗读数已写出：${path.relative(ROOT, outFile)}`);
})().catch(e => { console.error(e); process.exit(1); });
