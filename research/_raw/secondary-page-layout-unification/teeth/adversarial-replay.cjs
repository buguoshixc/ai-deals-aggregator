#!/usr/bin/env node
/**
 * T7 修复轮 · **重放** reviewer（T6）的 19 个对抗形态（`review/adversarial.cjs` 的只读副本 + 改锚点）。
 *
 * 与 review 版的三处差别：
 *   ① 抽取判据**按函数名锚点**（`const WIDE_TOL = 1;` → `console.log('\n=== 22c)` 之间的整区），
 *      不再按行号 —— 行号会随修复漂移，而「静默失效的测试」正是这一轮在打的东西。
 *      抽取区逐字 evaluate 进本进程（sha256 记账），判据不在本文件里重写一份。
 *   ② 每条形态多记两个判定：**本档实测**（注入后在这一档量到的违规码）与**形态级判定**
 *      （门禁在它自己会跑的所有档位里会不会咬到 —— D1@1440 的媒体查询只在 1600 生效，
 *      形态级判定看的是门禁的 1600 全站扫描）。
 *   ③ 多三条本轮新增的兼容性/对抗形态：B3（450px 内缩容器 ⇒ 必须由**宽判据**咬）、
 *      ALIAS（3 个别名页的 .aliasnote 有意缩进 ⇒ 不许误报）、C1c@1600（跨档复测）。
 *
 * 用法：node teeth/adversarial-replay.cjs [dir] [runTag]
 * 输出：控制台翻转表 + teeth/adversarial-replay-<tag>.json
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

/** 按**锚点**抽取（不是行号）：起点 = `const WIDE_TOL = 1;` 那一行，终点 = §22c 的 console.log 之前。 */
const START_NEEDLE = '  const WIDE_TOL = 1;';
const END_NEEDLE = "console.log('\\n=== 22c)";
const startIdx = srcLines.findIndex(line => line.includes(START_NEEDLE));
const endIdx = srcLines.findIndex(line => line.includes(END_NEEDLE));
if (startIdx < 0 || endIdx < 0 || endIdx <= startIdx) {
  throw new Error(`抽不到判据区：起点「${START_NEEDLE}」=${startIdx} · 终点「${END_NEEDLE}」=${endIdx}`);
}
const REGION = srcLines.slice(startIdx, endIdx).join('\n');
const REGION_SHA = crypto.createHash('sha256').update(REGION).digest('hex');

const dir = path.join(ROOT, process.argv[2] || 'dist');
const runTag = process.argv[3] || path.basename(dir);
const only = process.argv[4] ? process.argv[4].split(',') : null;
const pageKinds = require(path.join(ROOT, 'scripts', 'lib', 'page-kinds.js'));
const audienceLib = require(path.join(ROOT, 'scripts', 'lib', 'audience.js'));
const landingsLib = require(path.join(ROOT, 'scripts', 'lib', 'landing.js'));

const judge = new Function('fs', 'path', 'DIR', 'pageKinds', 'audienceLib', 'landingsLib', `
${REGION}
return { wideMeasure, wideProblems, wideRoutesFromDisk, wideKindByRoute, wideSampleSet, wideMutate, WIDE_SNOTE_FROZEN, WIDE_DATA_SELECTORS, WIDE_NOTE_RATIO, WIDE_AXIS_RATIO, WIDE_TOL, WIDE_DESKTOP_VIEWPORTS };
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

/** 视觉代理读数：每条说明的盒宽 + 有字区域（Range 并集）+ 计算样式 + 父元素。 */
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
    return { left: Math.round(left * 100) / 100, right: Math.round(right * 100) / 100,
      width: Math.round((right - left) * 100) / 100, lines: rects.length };
  };
  const cs = el => { const s = getComputedStyle(el); return { maxWidth: s.maxWidth, paddingLeft: s.paddingLeft, paddingRight: s.paddingRight, boxSizing: s.boxSizing }; };
  return {
    noteCount: notes.length,
    notes: notes.map((el, i) => ({
      i,
      box: { left: Math.round(el.getBoundingClientRect().left * 100) / 100, right: Math.round(el.getBoundingClientRect().right * 100) / 100, width: Math.round(el.getBoundingClientRect().width * 100) / 100 },
      text: rangeBox(el),
      style: cs(el),
      parent: el.parentElement ? el.parentElement.tagName.toLowerCase() + (el.parentElement.className ? '.' + String(el.parentElement.className).split(/\\s+/)[0] : '') : null
    }))
  };
})()`;

/** 原始判定（逐字抄自 review.md §1 的表，「⛔放行」= 修复前的假绿）。 */
const ORIGINAL_VERDICT = {
  'C0-control': '绿（对照✅）',
  'C0-narrow-all': '红 ✅有牙',
  'B1-padded-wrapper': '红（假红：60px 内缩被 1px 轴判据误报）',
  'B2-padded-tight': '红（假红：30px 内缩同类）',
  'A1-partial-css': '绿 ⛔放行',
  'A2-partial-js': '绿 ⛔放行',
  'A3-partial-changes': '绿 ⛔放行',
  'A4-partial-siblings': '绿 ⛔放行',
  'A5-section-rules': '绿 ⛔放行',
  'C1-padding-right': '绿 ⛔放行',
  'C1b-padding-both': '绿 ⛔放行',
  'C1c-calc-70ch': '绿 ⛔放行',
  'C2-inner-block': '绿 ⛔放行',
  'C3-inner-wrapper': '绿 ⛔放行',
  'D1-media-1500@1440': '绿 ⛔放行',
  'D1-media-1500@1600': '红（判据没问题，是档位没量）',
  'C4-no-main': '红（data-region-missing）',
  'B3-450px-wrapper': '（本轮新增：450px 内缩的兼容性对偶）',
  'ALIAS-notes': '（本轮新增：.aliasnote 有意缩进不许误报）',
  'C1c-calc-70ch@1600': '（本轮新增：跨档复测）'
};
/** 门禁（会跑的档位）会不会咬到这条形态。 */
const GATE_CATCH = {
  'C0-control': false, 'B1-padded-wrapper': false, 'B2-padded-tight': false, 'ALIAS-notes': false,
  'D1-media-1500@1440': true   // 1440 档媒体查询不生效，但门禁的 1600 全站扫描咬得到
};

const wrapJs = padding => `(() => { const note = document.querySelector('main .snote'); const wrap = document.createElement('div'); wrap.style.padding = '0 ${padding}px'; note.parentNode.insertBefore(wrap, note); wrap.appendChild(note); return Math.round(note.getBoundingClientRect().width); })()`;

const SCENARIOS = [
  { id: 'C0-control', route: 'student/', what: '不注入（现场基线）' },
  { id: 'C0-narrow-all', route: 'student/', css: '.snote { max-width: 70ch; }', what: '正对照：整页 .snote 全压回 70ch' },
  { id: 'B1-padded-wrapper', route: 'student/', js: wrapJs(60), what: '说明外套 padding:0 60px 的容器（prompt §11 允许的少量差异 ⇒ 不该红）' },
  { id: 'B2-padded-tight', route: 'student/', js: wrapJs(30), what: '同上，padding 只留 30px' },
  { id: 'B3-450px-wrapper', route: 'student/', js: wrapJs(450), what: '本轮新增：450px 级内缩 ⇒ 必须由**宽判据**咬（不是轴判据）' },
  { id: 'A1-partial-css', route: 'student/', css: 'main > section .snote { max-width: 70ch; }', what: '只收窄 section 里的 .snote（第 2 条）' },
  { id: 'A2-partial-js', route: 'student/', js: `(() => { const notes = [...document.querySelectorAll('main .snote')]; notes.slice(1).forEach(el => { el.style.maxWidth = '70ch'; }); return notes.map(el => Math.round(el.getBoundingClientRect().width)); })()`, what: '行内样式只收窄第 2、3 条' },
  { id: 'A3-partial-changes', route: 'changes/', css: 'main .chgdeals > .snote:not(:first-of-type) { max-width: 70ch; }', what: 'changes/（13 条）只收窄首个之外的' },
  { id: 'A4-partial-siblings', route: 'docs/data/', css: '.snote ~ .snote { max-width: 70ch; }', what: 'docs/data/（9 条）相邻兄弟选择器收窄首个之外的全部' },
  { id: 'A5-section-rules', route: 'changes/', css: '.chgsec .snote { max-width: 70ch; }', what: 'changes/ 分节里的 .snote 另加一条收窄规则（冻结串仍 1 次）' },
  { id: 'C1-padding-right', route: 'student/', css: '.snote { padding-right: 900px; }', what: '盒宽一字不动，padding-right 把有字区域压成 480px' },
  { id: 'C1b-padding-both', route: 'category/', css: '.snote { padding-left: 450px; padding-right: 450px; }', what: '两侧 padding 各 450px（居中窄柱）' },
  { id: 'C1c-calc-70ch', route: 'student/', css: '.snote { padding-right: calc(100% - 70ch); }', what: '★ blocker 原型：有字区域恒等于 70ch、border-box 一字不动' },
  { id: 'C1c-calc-70ch@1600', route: 'student/', width: 1600, css: '.snote { padding-right: calc(100% - 70ch); }', what: '本轮新增：C1c 在 1600 档复测' },
  { id: 'C2-inner-block', route: 'docs/data/', css: '.snote > a, .snote > b, .snote > code { display: block; max-width: 70ch; }', what: '说明的子元素块级化并压到 70ch' },
  { id: 'C3-inner-wrapper', route: 'student/', js: `(() => { const note = document.querySelector('main .snote'); const holder = document.createElement('div'); holder.style.maxWidth = '70ch'; while (note.firstChild) holder.appendChild(note.firstChild); note.appendChild(holder); return Math.round(holder.getBoundingClientRect().width); })()`, what: '把说明的**内容**装进 max-width:70ch 的容器（盒子丝毫不动）' },
  { id: 'C1-padding-right@1600', route: 'student/', width: 1600, css: '.snote { padding-right: 900px; }', what: 'C1 在 1600 档复测' },
  { id: 'C4-no-main', route: 'student/', js: `(() => { const main = document.querySelector('main'); main.remove(); return 'main 已移除'; })()`, what: '把 <main> 拿掉 ⇒ 必须判 data-region-missing' },
  { id: 'D1-media-1500@1440', route: 'student/', width: 1440, css: '@media (min-width: 1500px) { .snote { max-width: 70ch; } }', what: '缺陷藏在 @media(min-width:1500px) 里，在 1440 档量（物理上无缺陷）' },
  { id: 'D1-media-1500@1600', route: 'student/', width: 1600, css: '@media (min-width: 1500px) { .snote { max-width: 70ch; } }', what: '同一注入，在**门禁新增的 1600 档**量' },
  { id: 'ALIAS-notes', route: null, what: '本轮新增：3 个别名页的 .aliasnote（border-left 3px + padding-left 8px 是有意设计）', aliasScan: true }
];

const results = [];
async function scenario(browser, base, spec) {
  if (only && !only.includes(spec.id)) return null;
  const page = await browser.newPage({ viewport: { width: spec.width || 1440, height: 900 } });
  const out = { id: spec.id, route: spec.route, width: spec.width || 1440, what: spec.what, injected: null, codes: null, geometry: null, visual: null };
  try {
    await page.goto(new URL(spec.route, base).href, { waitUntil: 'load' });
    if (spec.css) { await page.addStyleTag({ content: spec.css }); out.injected = 'addStyleTag'; }
    if (spec.js) { out.injected = (out.injected ? out.injected + '+' : '') + 'evaluate'; out.jsResult = await page.evaluate(spec.js); }
    const geometry = await judge.wideMeasure(page);
    const problems = judge.wideProblems(geometry, metaOf(spec.route));
    out.codes = problems.map(p => p.code + (p.index === undefined ? '' : '#' + p.index));
    out.messages = problems.map(p => p.msg);
    out.geometry = {
      noteCount: geometry.noteCount,
      noteWidth: geometry.note.width, noteLeft: geometry.note.left, noteRight: geometry.note.right,
      firstTextWidth: geometry.notes.length ? geometry.notes[0].textWidth : null,
      regionSel: geometry.regionSel, regionWidth: geometry.region.width,
      mainWidth: geometry.main.width, column: Math.min(geometry.region.width, geometry.main.width),
      frozenCount: geometry.frozenCount, scrollWidth: geometry.doc.scrollWidth, clientWidth: geometry.doc.clientWidth
    };
    out.visual = await page.evaluate(VISUAL_PROBE);
  } finally {
    await page.close();
  }
  results.push(out);
  console.log(`\n[${out.id}] ${out.codes.length ? '红' : '绿'}  ${out.route}@${out.width} — ${out.what}`);
  console.log(`     注入：${out.injected || '（无）'} · 违规码 [${out.codes.join(', ') || '无'}]`);
  console.log(`     说明 ${out.geometry.noteCount} 条 · 首条 盒 ${out.geometry.noteWidth}px / 有字区域 ${out.geometry.firstTextWidth}px · 锚 ${out.geometry.regionSel} ${out.geometry.regionWidth}px · <main> ${out.geometry.mainWidth}px · 阈值 ${Math.round(judge.WIDE_NOTE_RATIO * out.geometry.column * 100) / 100}px`);
  const sample = out.visual.notes.slice(0, 3);
  for (const note of sample) {
    console.log(`     note[${note.i}] 盒 ${note.box.width}  字迹 ${note.text ? `${note.text.width}px（${note.text.lines} 行）` : '—'}  ${JSON.stringify(note.style)} 父=${note.parent}`);
  }
  return out;
}

(async () => {
  const { server, port } = await serve(dir);
  const base = `http://127.0.0.1:${port}/`;
  const browser = await chromium.launch({ executablePath: process.env.DSH_EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true });
  console.log(`判据抽取（按锚点，不看行号）：${path.relative(ROOT, SRC_FILE)} 第 ${startIdx + 1}–${endIdx} 行（${endIdx - startIdx} 行）`);
  console.log(`   起点锚「${START_NEEDLE.trim()}」 · 终点锚「${END_NEEDLE.slice(0, 24)}…」 · sha256 ${REGION_SHA.slice(0, 16)}…`);
  console.log(`   门禁会跑的档位：${JSON.stringify(judge.WIDE_DESKTOP_VIEWPORTS)} 全站 + [390] 全站 + [760,360] 样本集`);

  try {
    for (const spec of SCENARIOS) {
      if (spec.aliasScan) {
        // 别名页：产物里带 class="snote aliasnote" 的页面，逐页量（有意缩进不许误报）
        const aliasRoutes = judge.wideRoutesFromDisk().filter(route => {
          const file = path.join(dir, route === '' ? 'index.html' : `${route}index.html`);
          return fs.existsSync(file) && fs.readFileSync(file, 'utf8').includes('snote aliasnote');
        });
        const rows = [];
        for (const route of aliasRoutes) {
          const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
          try {
            await page.goto(new URL(route, base).href, { waitUntil: 'load' });
            const geometry = await judge.wideMeasure(page);
            const problems = judge.wideProblems(geometry, metaOf(route));
            rows.push({ route, codes: problems.map(p => p.code), noteCount: geometry.noteCount,
              firstBox: geometry.note.width, firstTextWidth: geometry.notes.length ? geometry.notes[0].textWidth : null });
          } finally {
            await page.close();
          }
        }
        const bad = rows.filter(row => row.codes.length > 0);
        results.push({ id: 'ALIAS-notes', aliasRoutes: rows, codes: bad.flatMap(row => row.codes) });
        console.log(`\n[ALIAS-notes] ${bad.length ? '红' : '绿'}  ${rows.length} 个别名页 — ${spec.what}`);
        for (const row of rows) console.log(`     ${row.route || '/'} 说明 ${row.noteCount} 条 · 首条 盒 ${row.firstBox}px / 有字区域 ${row.firstTextWidth}px · 违规码 [${row.codes.join(', ') || '无'}]`);
      } else {
        await scenario(browser, base, spec);
      }
    }

    // ---- 反空洞守卫：三种锚点（用生产文件里按锚点抽出的 wideMutate） ----
    {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      try {
        await page.goto(new URL('student/', base).href, { waitUntil: 'load' });
        const frozen = judge.WIDE_SNOTE_FROZEN;
        const absent = await judge.wideMutate(page, '§22c-这个锚点在产物里不存在', 'x');
        const duplicated = await judge.wideMutate(page, 'color: var(--mut);', 'color: var(--mut);');
        await page.evaluate(`(() => { const st = document.querySelectorAll('style')[0]; document.head.appendChild(st.cloneNode(true)); })()`);
        const twice = await judge.wideMutate(page, frozen, 'x');
        const twiceCount = await page.evaluate(`(() => { let n = 0; for (const st of document.querySelectorAll('style')) n += st.textContent.split(${JSON.stringify(frozen)}).length - 1; return n; })()`);
        await page.evaluate(`(() => { const st = document.querySelectorAll('style'); st[st.length - 1].remove(); })()`);
        const unique = await judge.wideMutate(page, frozen, frozen.replace('max-width: none', 'max-width: 70ch'));
        const afterUnique = await page.evaluate(`(() => { const note = document.querySelector('main .snote'); return { maxWidth: getComputedStyle(note).maxWidth, width: Math.round(note.getBoundingClientRect().width * 100) / 100 }; })()`);
        const guardRows = [
          { id: 'G0-absent', anchor: '（不存在的锚点）', result: absent },
          { id: 'G1-many', anchor: 'color: var(--mut);', result: duplicated },
          { id: 'G3-exactly-2', anchor: 'WIDE_SNOTE_FROZEN（页面里出现 2 次）', result: twice, occurrences: twiceCount },
          { id: 'G2-unique', anchor: 'WIDE_SNOTE_FROZEN（真实锚点，唯一）', result: unique, effect: afterUnique }
        ];
        results.push({ id: 'guard', rows: guardRows });
        console.log('\n[guard] 反空洞守卫（按锚点抽出的 wideMutate）');
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

  // ---- 翻转表 ----
  const rowOf = id => results.find(r => r.id === id);
  const flipRows = SCENARIOS.filter(spec => !spec.aliasScan).map(spec => {
    const row = rowOf(spec.id);
    const judgeRed = Boolean(row && row.codes.length);
    const gateCatches = spec.id in GATE_CATCH ? GATE_CATCH[spec.id] : judgeRed;
    const original = ORIGINAL_VERDICT[spec.id] || '（无原始判定）';
    const originalRed = original.startsWith('红');
    const flipped = originalRed !== gateCatches;
    return { id: spec.id, route: spec.route, width: row ? row.width : spec.width, original, originalRed,
      judgeRed, judgeCodes: row ? row.codes : null, gateCatches, flipped,
      note: spec.id === 'D1-media-1500@1440' ? '1440 档媒体查询不生效（物理上无缺陷）；门禁新增的 1600 全站扫描咬到它' : '' };
  });
  console.log('\n================ 翻转表（原判定 → 修复后）================');
  for (const row of flipRows) {
    const now = row.gateCatches ? '红' : '绿';
    console.log(`  ${row.id.padEnd(24)} 原 ${row.original.padEnd(22)} → 现 ${now}${row.judgeRed ? `（本档实测码 [${row.judgeCodes.join(', ')}]）` : `（本档实测无码${row.gateCatches ? '，由门禁其它档咬' : ''}）`}${row.flipped ? '  ★翻转' : ''}`);
  }
  const mustFlip = ['A1-partial-css', 'A2-partial-js', 'A3-partial-changes', 'A4-partial-siblings', 'A5-section-rules',
    'C1-padding-right', 'C1b-padding-both', 'C1c-calc-70ch', 'C2-inner-block', 'C3-inner-wrapper', 'D1-media-1500@1440', 'B3-450px-wrapper'];
  const mustStayRed = ['C0-narrow-all', 'C4-no-main', 'D1-media-1500@1600'];
  const mustStayGreen = ['C0-control', 'B1-padded-wrapper', 'B2-padded-tight'];
  const violations = [
    ...mustFlip.filter(id => !rowOf(id) || (id in GATE_CATCH ? !GATE_CATCH[id] : !rowOf(id).codes.length)).map(id => `${id} 应当被咬中，实测没有`),
    ...mustStayRed.filter(id => !rowOf(id) || !rowOf(id).codes.length).map(id => `${id} 应当保持红，实测没有`),
    ...mustStayGreen.filter(id => rowOf(id) && rowOf(id).codes.length).map(id => `${id} 应当保持绿，实测红了：${rowOf(id).codes.join(', ')}`)
  ];
  const aliasRow = rowOf('ALIAS-notes');
  if (aliasRow && aliasRow.codes.length) violations.push(`ALIAS-notes 不许误报，实测红了：${aliasRow.codes.join(', ')}`);
  console.log(`\n必须翻转：${mustFlip.length} 条 · 必须保持红：${mustStayRed.length} 条 · 必须保持绿：${mustStayGreen.length + 1} 条（含 ALIAS）`);
  console.log(violations.length ? `❌ ${violations.length} 条不合预期：\n   ${violations.join('\n   ')}` : '✅ 全部符合预期（该翻的都翻了，正对照都没被误伤）');

  const outFile = path.join(__dirname, `adversarial-replay-${runTag}.json`);
  fs.writeFileSync(outFile, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    dir: path.relative(ROOT, dir).replace(/\\/g, '/'),
    extracted: { file: path.relative(ROOT, SRC_FILE).replace(/\\/g, '/'), startAnchor: START_NEEDLE.trim(), endAnchor: END_NEEDLE.slice(0, 40), lines: `${startIdx + 1}-${endIdx}`, sha256: REGION_SHA },
    gateViewports: judge.WIDE_DESKTOP_VIEWPORTS,
    flipRows, violations, results
  }, null, 2)}\n`, 'utf8');
  console.log(`\n重放读数已写出：${path.relative(ROOT, outFile).replace(/\\/g, '/')}`);
  process.exit(violations.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
