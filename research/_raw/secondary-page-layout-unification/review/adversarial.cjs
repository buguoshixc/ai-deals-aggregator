/**
 * T6 复审（寻假绿）· 对抗式驱动。
 *
 * 纪律：
 *   · **不改任何生产源码 / 产物**：判据函数是从 scripts/tools/verify-site.js 里**逐字抽取**出来的
 *     文本（抽取区间用 sha256 记账），evaluate 进本进程；注入全部发生在浏览器内存里。
 *   · 静态服务与 §22c 用的是同一套极简 http server（同一份 MIME/目录解析规则）。
 *
 * 输出：控制台表格 + runs/adversarial.json（含每条形态的几何读数、违规码、视觉代理读数）。
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

/**
 * 逐字抽取一段：起始行包含 startNeedle；从 `fromNeedle` 那一行**之后**开始找第一个 === endLine 的行。
 * （不用「起点之后的第一个 2 空格 }」当终点 —— wideRoutesFromDisk / wideMeasure 都以它收尾，会截断。）
 */
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

/** 把 §22c 的常量 + wideMeasure + wideProblems 原样装进本进程（不复制、不重写）。 */
const judge = new Function('fs', 'path', 'DIR', 'pageKinds', 'audienceLib', 'landingsLib', `
${judgeSlice.text}
return { wideMeasure, wideProblems, wideRoutesFromDisk, wideKindByRoute, wideSampleSet, WIDE_SNOTE_FROZEN, WIDE_DATA_SELECTORS, WIDE_NOTE_RATIO, WIDE_TOL };
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

/** 视觉代理读数：说明块里「真正有字的区域」有多宽（Range 包住全部文本 ⇒ 行盒并集）。 */
const VISUAL_PROBE = `(() => {
  const main = document.querySelector('main');
  const notes = main ? [...main.querySelectorAll('.snote')] : [];
  const rangeBox = el => {
    if (!el) return null;
    const r = document.createRange();
    r.selectNodeContents(el);
    const rects = [...r.getClientRects()].filter(x => x.width > 0 && x.height > 0);
    if (!rects.length) return null;
    const left = Math.min(...rects.map(x => x.left));
    const right = Math.max(...rects.map(x => x.right));
    return { left: Math.round(left * 100) / 100, right: Math.round(right * 100) / 100, width: Math.round((right - left) * 100) / 100, lines: rects.length };
  };
  const cs = el => { const s = getComputedStyle(el); return { maxWidth: s.maxWidth, paddingLeft: s.paddingLeft, paddingRight: s.paddingRight, boxSizing: s.boxSizing }; };
  return {
    noteCount: notes.length,
    notes: notes.map((el, i) => ({
      i,
      box: { left: Math.round(el.getBoundingClientRect().left * 100) / 100, right: Math.round(el.getBoundingClientRect().right * 100) / 100, width: Math.round(el.getBoundingClientRect().width * 100) / 100, top: Math.round(el.getBoundingClientRect().top * 100) / 100 },
      text: rangeBox(el),
      style: cs(el),
      parent: el.parentElement ? el.parentElement.tagName.toLowerCase() + (el.parentElement.className ? '.' + String(el.parentElement.className).split(/\\s+/)[0] : '') : null
    }))
  };
})()`;

const results = [];
async function scenario(browser, base, spec) {
  if (only && !only.includes(spec.id)) return null;
  const page = await browser.newPage({ viewport: { width: spec.width || 1440, height: 900 } });
  const out = { id: spec.id, route: spec.route, width: spec.width || 1440, what: spec.what, injected: null, codes: null, geometry: null, visual: null, note: spec.note };
  try {
    await page.goto(new URL(spec.route, base).href, { waitUntil: 'load' });
    if (spec.css) { await page.addStyleTag({ content: spec.css }); out.injected = 'addStyleTag'; }
    if (spec.js) { out.injected = (out.injected ? out.injected + '+' : '') + 'evaluate'; out.jsResult = await page.evaluate(spec.js); }
    const geometry = await judge.wideMeasure(page);
    const problems = judge.wideProblems(geometry, metaOf(spec.route));
    out.codes = problems.map(p => p.code);
    out.messages = problems.map(p => p.msg);
    out.geometry = {
      noteWidth: geometry.note.width, noteLeft: geometry.note.left, noteRight: geometry.note.right,
      regionSel: geometry.regionSel, regionWidth: geometry.region.width, regionLeft: geometry.region.left, regionRight: geometry.region.right,
      mainWidth: geometry.main.width, mainLeft: geometry.main.left, mainRight: geometry.main.right,
      column: Math.min(geometry.region.width, geometry.main.width),
      noteCount: geometry.noteCount, frozenCount: geometry.frozenCount, scrollWidth: geometry.doc.scrollWidth, clientWidth: geometry.doc.clientWidth
    };
    out.visual = await page.evaluate(VISUAL_PROBE);
    if (spec.shot) {
      await page.locator('main .snote').first()
        .screenshot({ path: path.join(__dirname, 'runs', spec.shot.file) })
        .catch(() => {});
    }
  } finally {
    await page.close();
  }
  results.push(out);
  const verdict = out.codes.length ? '红' : '绿';
  console.log(`\n[${out.id}] ${verdict}  ${out.route}@${out.width} — ${out.what}`);
  console.log(`     注入：${out.injected || '（无）'} · 违规码 [${out.codes.join(', ') || '无'}]`);
  console.log(`     说明盒 ${out.geometry.noteWidth}px（${out.geometry.noteLeft}..${out.geometry.noteRight}）· 锚 ${out.geometry.regionSel} ${out.geometry.regionWidth}px · <main> ${out.geometry.mainWidth}px · 比例下限 ${judge.WIDE_NOTE_RATIO * out.geometry.column}px`);
  if (out.visual) {
    out.visual.notes.forEach(note => {
      console.log(`     note[${note.i}] 盒宽 ${note.box.width}  有字区域 ${note.text ? `${note.text.width}px（${note.text.left}..${note.text.right}，${note.text.lines} 行）` : '—'}  ${JSON.stringify(note.style)} 父=${note.parent}`);
    });
  }
  return out;
}

(async () => {
  const { server, port } = await serve(dir);
  const base = `http://127.0.0.1:${port}/`;
  const browser = await chromium.launch({ executablePath: process.env.DSH_EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true });
  console.log(`判据抽取自 ${path.relative(ROOT, SRC_FILE)} 第 ${judgeSlice.start}–${judgeSlice.end} 行 · sha256 ${JUDGE_SHA.slice(0, 16)}…（${judgeSlice.text.split('\n').length} 行）`);
  console.log(`wideMutate 抽取自第 ${mutateSlice.start}–${mutateSlice.end} 行 · sha256 ${MUTATE_SHA.slice(0, 16)}…`);

  try {
    // ---- 0. 对照组 ----
    await scenario(browser, base, { id: 'C0-control', route: 'student/', what: '不注入（现场基线）', shot: { file: `note-control-${runTag}.png` } });
    await scenario(browser, base, { id: 'C0-narrow-all', route: 'student/', css: '.snote { max-width: 70ch; }',
      what: '正对照：把整页 .snote 全部压回 70ch（判据必须咬到）' });

    // ---- 1. 只对部分 .snote 收窄 ----
    await scenario(browser, base, { id: 'A1-partial-css', route: 'student/',
      css: 'main > section .snote { max-width: 70ch; }',
      what: '只收窄 section 里的 .snote（第 2 个），页面级那条保持满宽' });
    await scenario(browser, base, { id: 'A2-partial-js', route: 'student/',
      js: `(() => { const notes = [...document.querySelectorAll('main .snote')]; notes.slice(1).forEach(el => { el.style.maxWidth = '70ch'; }); return notes.map(el => Math.round(el.getBoundingClientRect().width)); })()`,
      what: '用行内样式只收窄第 2、3 条 .snote（document 序非首个）' });
    await scenario(browser, base, { id: 'A3-partial-changes', route: 'changes/',
      css: 'main .chgdeals > .snote:not(:first-of-type) { max-width: 70ch; }',
      what: 'changes/（13 条 .snote）只收窄首个之外的那些' });
    await scenario(browser, base, { id: 'A4-partial-siblings', route: 'docs/data/',
      css: '.snote ~ .snote { max-width: 70ch; }',
      what: 'docs/data/（9 条 .snote）用相邻兄弟选择器收窄「首个之外的全部」' });
    await scenario(browser, base, { id: 'A5-section-rules', route: 'changes/',
      css: '.chgsec .snote { max-width: 70ch; }',
      what: 'changes/ 只给分节里的 .snote 加一条收窄规则（页内新增第二条 .snote 规则，冻结串仍 1 次）' });

    // ---- 2. 说明塞进带 padding 的容器 ----
    await scenario(browser, base, { id: 'B1-padded-wrapper', route: 'student/',
      js: `(() => { const note = document.querySelector('main .snote'); const wrap = document.createElement('div'); wrap.style.padding = '0 60px'; note.parentNode.insertBefore(wrap, note); wrap.appendChild(note); return Math.round(note.getBoundingClientRect().width); })()`,
      what: '把页面级说明套进 padding:0 60px 的容器（说明盒缩到 1260px、左移 60px）' });
    await scenario(browser, base, { id: 'B2-padded-tight', route: 'student/',
      js: `(() => { const note = document.querySelector('main .snote'); const wrap = document.createElement('div'); wrap.style.padding = '0 30px'; note.parentNode.insertBefore(wrap, note); wrap.appendChild(note); return Math.round(note.getBoundingClientRect().width); })()`,
      what: 'padding 只留 30px：说明盒仍 ≥0.85×主数据区，靠同轴判据兜底' });

    // ---- 3. 不改盒宽的手法 ----
    await scenario(browser, base, { id: 'C1-padding-right', route: 'student/', css: '.snote { padding-right: 900px; }',
      what: 'border-box 盒宽一字不动，靠 padding-right 把有字区域压成 480px（原来 70ch 的样子）', shot: { file: 'C1-padding-right.png' } });
    await scenario(browser, base, { id: 'C1b-padding-both', route: 'category/', css: '.snote { padding-left: 450px; padding-right: 450px; }',
      what: '两侧 padding 各 450px（说明居中成 480px 窄柱，盒宽不变）' });
    await scenario(browser, base, { id: 'C2-inner-block', route: 'docs/data/', css: '.snote > a, .snote > b, .snote > code { display: block; max-width: 70ch; }',
      what: '说明的子元素块级化并压到 70ch（有字区域变窄）' });
    await scenario(browser, base, { id: 'C3-inner-wrapper', route: 'student/',
      js: `(() => { const note = document.querySelector('main .snote'); const holder = document.createElement('div'); holder.style.maxWidth = '70ch'; while (note.firstChild) holder.appendChild(note.firstChild); note.appendChild(holder); return Math.round(holder.getBoundingClientRect().width); })()`,
      what: '把说明的**内容**装进一个 max-width:70ch 的容器（.snote 的盒子丝毫不动，只有有字区域变窄）' });
    await scenario(browser, base, { id: 'C1c-calc-70ch', route: 'student/', css: '.snote { padding-right: calc(100% - 70ch); }',
      what: '有字区域恒等于 70ch（改动前那 4 个壳的样子），border-box 宽度一字不动' });
    await scenario(browser, base, { id: 'C1-padding-right@1600', route: 'student/', width: 1600, css: '.snote { padding-right: 900px; }',
      what: 'C1 在 1600 档复测（证明它与视口无关，1440 那一档同样漏）' });

    // ---- 3b. 「判不出来」的码：主数据区 / 布局族 ----
    await scenario(browser, base, { id: 'C4-no-main', route: 'student/',
      js: `(() => { const main = document.querySelector('main'); main.remove(); return 'main 已移除'; })()`,
      what: '把 <main> 整个拿掉 ⇒ 必须判 data-region-missing（不是静默跳过）' });

    // ---- 4. 视口边界：只在更宽的档位坏掉 ----
    await scenario(browser, base, { id: 'D1-media-1500@1440', route: 'student/', width: 1440,
      css: '@media (min-width: 1500px) { .snote { max-width: 70ch; } }',
      what: '把缺陷藏在 @media(min-width:1500px) 里，在套件的 1440 档量' });
    await scenario(browser, base, { id: 'D1-media-1500@1600', route: 'student/', width: 1600,
      css: '@media (min-width: 1500px) { .snote { max-width: 70ch; } }',
      what: '同一注入，在 1600 档量（套件从不来这一档）' });

    // ---- 5. 反空洞守卫：三种锚点（用生产文件里逐字抽出的 wideMutate） ----
    {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      try {
        await page.goto(new URL('student/', base).href, { waitUntil: 'load' });
        const frozen = await judge.WIDE_SNOTE_FROZEN;
        const absent = await mutator.wideMutate(page, '§22c-这个锚点在产物里不存在', 'x');
        const duplicated = await mutator.wideMutate(page, 'color: var(--mut);', 'color: var(--mut);');
        // ≥2 但只有 2 次：把共享 <style> 复制一份，让冻结串恰好出现 2 次（边界不是「很多次」）
        await page.evaluate(`(() => { const st = document.querySelectorAll('style')[0]; document.head.appendChild(st.cloneNode(true)); })()`);
        const twice = await mutator.wideMutate(page, frozen, 'x');
        const twiceCount = await page.evaluate(`(() => { let n = 0; for (const st of document.querySelectorAll('style')) n += st.textContent.split(${JSON.stringify(frozen)}).length - 1; return n; })()`);
        // 去掉副本，再验真锚点唯一时会落地（证明守卫的 ok:true 不是空转）
        await page.evaluate(`(() => { const st = document.querySelectorAll('style'); st[st.length - 1].remove(); })()`);
        const unique = await mutator.wideMutate(page, frozen, frozen.replace('max-width: none', 'max-width: 70ch'));
        const afterUnique = await page.evaluate(`(() => { const note = document.querySelector('main .snote'); return { maxWidth: getComputedStyle(note).maxWidth, width: Math.round(note.getBoundingClientRect().width * 100) / 100 }; })()`);
        const guardRows = [
          { id: 'G0-absent', anchor: '（不存在的锚点）', result: absent },
          { id: 'G1-many', anchor: 'color: var(--mut);', result: duplicated },
          { id: 'G3-exactly-2', anchor: 'WIDE_SNOTE_FROZEN（页面里出现 2 次）', result: twice, occurrences: twiceCount },
          { id: 'G2-unique', anchor: 'WIDE_SNOTE_FROZEN（真实锚点，唯一）', result: unique, effect: afterUnique }
        ];
        results.push({ id: 'guard', rows: guardRows });
        console.log('\n[guard] 反空洞守卫（生产文件里逐字抽出的 wideMutate）');
        for (const row of guardRows) {
          console.log(`     ${row.id}: ok=${row.result.ok} · occurrences=${row.result.occurrences} · ${row.result.reason || ''}${row.effect ? ` · 落地后 maxWidth=${row.effect.maxWidth} 宽=${row.effect.width}px` : ''}`);
        }
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
    server.close();
  }

  const outFile = path.join(__dirname, 'runs', `adversarial-${runTag}.json`);
  fs.writeFileSync(outFile, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    dir: path.relative(ROOT, dir),
    extracted: { judge: { file: path.relative(ROOT, SRC_FILE), lines: `${judgeSlice.start}-${judgeSlice.end}`, sha256: JUDGE_SHA },
      mutate: { file: path.relative(ROOT, SRC_FILE), lines: `${mutateSlice.start}-${mutateSlice.end}`, sha256: MUTATE_SHA } },
    results
  }, null, 2)}\n`, 'utf8');
  console.log(`\n对抗读数已写出：${path.relative(ROOT, outFile)}`);
})().catch(e => { console.error(e); process.exit(1); });
