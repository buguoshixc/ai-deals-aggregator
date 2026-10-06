#!/usr/bin/env node
/**
 * T22 自算汇总：把四轮对照 / 违规码可达性 / 报告数字抽查 / 残余盲区，全部从**我自己的探针读数**
 * 与盘上**原始**证据重算成一张机器可读表（不改任何生产文件）。
 *
 * 用法：node t22-analyze.cjs   → 写 verify/t22-analysis.json
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = (() => { let dir = __dirname;
  for (let i = 0; i < 8; i++) { if (fs.existsSync(path.join(dir, 'package.json'))) return dir; dir = path.dirname(dir); }
  throw new Error('找不到仓库根'); })();
const V = path.join(ROOT, 'research/_raw/secondary-page-layout-unification/verify');
const RAW = path.join(ROOT, 'research/_raw/secondary-page-layout-unification');
const OUT = path.join(V, 't22-analysis.json');
const load = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const read = f => load(path.join(V, f));
const RATIO = 0.85;

const before = read('probe-r4-before.json');
const after = read('probe-r4-after.json');
const forms = read('probe-r4-forms.json');
const reach = read('probe-r4-reach.json');
const VIEWPORTS = [1440, 1600, 760, 360];

const noteRows = (probe, viewport) => probe.pages.flatMap(p => p.viewport[viewport].notes.map(n => ({ route: p.route, ...n })));
const hasInk = n => n.rendered === undefined ? false : ((n.glyphRects > 0 || n.rendered) && !n.vertical && n.lineCount >= 2
  && n.widestLine < RATIO * n.column - 0.01);
const hasTextNarrow = n => n.rendered && n.textArea < RATIO * n.column - 0.01;
const hasBoxNarrow = n => n.rendered && n.boxWidth < RATIO * n.column - 0.01;

// ── A. 四轮对照（各档：咬中什么、漏什么） ─────────────────────────────────────
const roundsTable = {};
for (const [name, probe] of [['dist.baseline', before], ['dist', after]]) {
  roundsTable[name] = {};
  for (const width of VIEWPORTS) {
    const rows = probe.rounds[width];
    roundsTable[name][width] = {
      R1: `${rows.R1.notes}/${rows.R1.pages}`, R2: `${rows.R2.notes}/${rows.R2.pages}`,
      R3: `${rows.R3.notes}/${rows.R3.pages}`, R4: `${rows.R4.notes}/${rows.R4.pages}`,
      column: `${probe.columns[width].min}–${probe.columns[width].max}`, pagesOverCh70: probe.columns[width].overCh70,
      ch70: probe.ch70Values.join('/')
    };
  }
}
// 注入形态逐条：哪个轮次咬中、哪个轮次漏
const formTable = {};
for (const page of forms.pages) {
  formTable[page.route] = { inject: forms.inject[page.route] };
  for (const width of VIEWPORTS) {
    const notes = page.viewport[width].notes;
    const rows = page.viewport[width];
    formTable[page.route][`@${width}`] = {
      column: rows.column, notes: notes.length,
      R1: rows.rounds.R1.length, R2: rows.rounds.R2.length, R3: rows.rounds.R3.length, R4: rows.rounds.R4.length,
      inkFired: notes.filter(hasInk).length, inkScopeOn: rows.column > (notes[0] ? Number(notes[0].ch70) : 0) + 1,
      boxNarrow: notes.filter(hasBoxNarrow).length, textNarrow: notes.filter(hasTextNarrow).length,
      maxWidestLine: notes.length ? Math.round(Math.max(...notes.map(n => n.widestLine)) * 100) / 100 : 0,
      minWidestLine: notes.length ? Math.round(Math.min(...notes.map(n => n.widestLine)) * 100) / 100 : 0,
      unrendered: notes.filter(n => n.unrendered).length
    };
  }
}

// ── B. 违规码可达性 ──────────────────────────────────────────────────────────
const VOCAB = ['unclassified-layout', 'unexpected-detail-main', 'missing-detail-main', 'note-narrow',
  'note-ink-narrow', 'note-axis', 'note-clipped', 'note-hidden-text', 'page-overflow@<vw>', 'data-region-missing'];
// 盘上原始报告的存在性扫描（只是旁证：这些是别人跑出来的报告，不是我本轮的读数）
const scanFiles = [];
for (const dir of [path.join(RAW, 'review/runs'), path.join(RAW, 'teeth/_scratch')]) {
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    const full = path.join(dir, f);
    if (fs.statSync(full).size > 4 * 1024 * 1024) continue;
    scanFiles.push({ rel: path.relative(RAW, full).split(path.sep).join('/'), full });
  }
}
const onDisk = {};
for (const code of VOCAB) onDisk[code] = { reports: [], routes: [] };
for (const file of scanFiles) {
  let raw;
  try { raw = JSON.parse(fs.readFileSync(file.full, 'utf8')); } catch { continue; }
  const metrics = raw.metrics || {};
  const collect = (codes, route) => {
    for (const code of codes || []) {
      const hit = VOCAB.find(v => v === code || (v === 'page-overflow@<vw>' && String(code).startsWith('page-overflow@')));
      if (!hit) continue;
      if (!onDisk[hit].reports.includes(file.rel)) onDisk[hit].reports.push(file.rel);
      if (route && !onDisk[hit].routes.includes(route)) onDisk[hit].routes.push(route);
    }
  };
  for (const v of (Array.isArray(metrics.layoutViolations) ? metrics.layoutViolations : [])) collect(v.codes, v.route);
  for (const n of (Array.isArray(metrics.layoutNotes) ? metrics.layoutNotes : [])) collect(n.codes, n.route);
  for (const list of Object.values(metrics.layoutMutationCodes || {})) collect(Array.isArray(list) ? list : [], null);
  for (const c of raw.checks || []) for (const code of VOCAB) {
    if (c.name && c.name.includes(code === 'page-overflow@<vw>' ? 'page-overflow@' : code) && c.ok === false) {
      if (!onDisk[code].reports.includes(file.rel)) onDisk[code].reports.push(file.rel + '（失败断言名里出现）');
    }
  }
}
// 我自己的探针产出的码（reach/forms 注入轮）
const myCodes = {};
const collectMine = probe => {
  for (const page of probe.pages) for (const width of VIEWPORTS) {
    for (const code of page.viewport[width].codes) {
      myCodes[code] = myCodes[code] || { routes: [], viewports: [], runs: [] };
      if (!myCodes[code].routes.includes(page.route)) myCodes[code].routes.push(page.route);
      if (!myCodes[code].viewports.includes(width)) myCodes[code].viewports.push(width);
    }
  }
  if (probe !== forms) return;
  for (const page of probe.pages) for (const width of VIEWPORTS) {
    for (const note of page.viewport[width].notes) {
      if (hasInk(note)) { myCodes['note-ink-narrow'] = myCodes['note-ink-narrow'] || { routes: [], viewports: [], runs: [] };
        if (!myCodes['note-ink-narrow'].routes.includes(page.route)) myCodes['note-ink-narrow'].routes.push(page.route);
        if (!myCodes['note-ink-narrow'].viewports.includes(width)) myCodes['note-ink-narrow'].viewports.push(width); }
    }
  }
};
for (const [tag, probe] of [['forms', forms], ['reach', reach]]) {
  for (const page of probe.pages) for (const width of VIEWPORTS) {
    for (const code of page.viewport[width].codes) {
      if (!myCodes[code]) myCodes[code] = { routes: [], viewports: [], runs: [] };
      if (!myCodes[code].routes.includes(page.route)) myCodes[code].routes.push(page.route);
      if (!myCodes[code].viewports.includes(width)) myCodes[code].viewports.push(width);
      if (!myCodes[code].runs.includes(tag)) myCodes[code].runs.push(tag);
    }
  }
}
collectMine(forms);
collectMine(reach);
const REACH_FORMS = {
  'note-narrow': { form: '.snote { max-width: 70ch }（status/ 注入）· 或 .snote { padding-right: calc(100% - 70ch) }（内容盒窄、盒宽不动）', route: 'status/ · changes/' },
  'note-ink-narrow': { form: '.snote { display: grid; grid-template-columns: minmax(0, 70ch) 1fr }（feeds/、1440 档）', route: 'feeds/' },
  'note-axis': { form: '.snote { transform: scaleX(0.35); transform-origin: left center }（盒宽 1380→483，轴偏）', route: 'vendor/ai360/' },
  'note-clipped': { form: '.snote { white-space: nowrap }（自身 scrollWidth > clientWidth）', route: 'need/free-tier/' },
  'note-hidden-text': { form: '.snote { font-size: 0; min-height: 24px }（渲染着但零字形盒）', route: 'docs/data/' },
  'page-overflow@<vw>': { form: '.snote { white-space: nowrap }（同一页在 390/760/1440/1600 都溢出）', route: 'need/free-tier/' },
  'data-region-missing': { form: 'document.querySelector("main").remove()（无 <main>）', route: 'developer/' },
  'missing-detail-main': { form: 'document.querySelector("main.detail-main").classList.remove("detail-main")（detail 族丢列）', route: 'models/360zhinao-pro/' },
  'unexpected-detail-main': { form: 'document.querySelector("main").classList.add("detail-main")（wide 族多列）', route: 'category/' },
  'unclassified-layout': { form: '在产物目录里新增一个未登记路由目录（route → kind 解析不出来）', route: '（需 scratch 产物 + 整轮套件）' }
};
const myCodeOf = code => {
  if (myCodes[code]) return myCodes[code];
  if (code === 'page-overflow@<vw>') {
    const hits = Object.entries(myCodes).filter(([k]) => k.startsWith('page-overflow@'));
    if (hits.length) return { routes: [...new Set(hits.flatMap(([, v]) => v.routes))], viewports: [...new Set(hits.flatMap(([, v]) => v.viewports))],
      runs: [...new Set(hits.flatMap(([, v]) => v.runs))], matchedCodes: hits.map(([k]) => k) };
  }
  return null;
};
const reachability = VOCAB.map(code => ({
  code,
  myProbeCodes: myCodeOf(code),
  injection: REACH_FORMS[code],
  onDiskEvidence: onDisk[code],
  reachableByMyProbe: Boolean(myCodeOf(code)),
  reachableOnDisk: onDisk[code].reports.length > 0,
  note: code === 'unclassified-layout'
    ? '按构造我的探针不产出该码：它要求 route→kind 注册表，而本任务禁止 require scripts/lib/page-kinds.js。门禁侧的分支在 verify-site.js 的 wideProblems ①（meta.kind/meta.family 解析不出）；最小复现 = 在 scratch 产物目录里加一个未登记路由目录，再跑整轮套件。'
    : undefined
}));

// ── C. 残余盲区 ─────────────────────────────────────────────────────────────
const baselineAt = width => before.rounds[width];
const blind = {
  '760 媒体查询闭合（round3 → round4）': {
    form: forms.inject['changes/'] || '(未注入)',
    at760: formTable['changes/'] ? formTable['changes/']['@760'] : null,
    at1440: formTable['changes/'] ? formTable['changes/']['@1440'] : null,
    note: 'R3 在 760 档对逐行字迹「不判」（当时是视口白名单），R4 按物理前置条件判 ⇒ 同一形态 R3 漏、R4 中',
    verdict: (() => {
      const f760 = formTable['changes/'] && formTable['changes/']['@760'];
      return f760 ? (f760.inkFired > 0 && f760.inkScopeOn) : null;
    })()
  },
  '360 不判逐行字迹的理由': {
    column360: before.columns[360].min + '–' + before.columns[360].max,
    ch70: before.ch70Values.join('/'),
    baselineRounds360: baselineAt(360),
    baselineRounds1440: baselineAt(1440),
    note: '列宽 ≤ 328 < 70ch(452.81) ⇒ 70ch 级的收窄在物理上不可能发生：同一批 156 条缺陷在 360 档盒宽=列宽、四条轮次全 0',
    verdict: (() => {
      const c = before.columns[360].max;
      const ch = Number(before.ch70Values[0]);
      return { physicallyImpossibleFor70ch: c <= ch, minColumn: before.columns[360].min, maxColumn: c, ch70: ch };
    })()
  },
  '360 档其他窄轨（非 70ch 家族）': (() => {
    const page = forms.pages.find(p => p.route === 'plans/');
    if (!page) return null;
    const at360 = page.viewport[360];
    const notes = at360.notes;
    return {
      form: forms.inject['plans/'], column360: at360.column,
      textNarrow: notes.filter(hasTextNarrow).length, boxNarrow: notes.filter(hasBoxNarrow).length,
      inkFired: notes.filter(hasInk).length, R4: at360.rounds.R4.length,
      minWidestLine: notes.length ? Math.min(...notes.map(n => n.widestLine)) : null,
      note: '200px 轨在 360 档：内容盒/盒宽口径能不能咬到，看 textNarrow/boxNarrow；逐行字迹口径因物理前置条件不判'
    };
  })(),
  'font-size:0 导致盒高 0 ⇒ 整条被登记为 unrendered、零码': (() => {
    const page = reach.pages.find(p => p.route === 'plans/');
    if (!page) return null;
    const notes = page.viewport[1440].notes;
    return {
      form: reach.inject['plans/'], page: 'plans/',
      notesTotal: notes.length, unrendered: notes.filter(n => n.unrendered).length,
      withGlyphs: notes.filter(n => n.glyphRects > 0).length, textLengthMax: Math.max(...notes.map(n => n.textLength)),
      codesOnPage: page.viewport[1440].codes,
      note: '文本仍在（textLength>0）但盒高 0：① 需 rendered、② 需 rendered||字形盒、③ 需 rendered ⇒ 三条全不判'
    };
  })(),
  'M12 原型的伪元素形态（同一次注入轮）': (() => {
    const page = reach.pages.find(p => p.route === 'student/');
    if (!page) return null;
    const notes = page.viewport[1440].notes;
    return { form: reach.inject['student/'], rendered: notes.map(n => n.rendered), glyphRects: notes.map(n => n.glyphRects),
      hiddenText: notes.filter(n => n.hiddenText).length, codesOnPage: page.viewport[1440].codes };
  })()
};

// ── D. 报告数字抽查（报告值 / 我方实测值 / 一致或差异） ─────────────────────────
const gateR4Green = load(path.join(RAW, 'teeth/_scratch/r4-green.json'));
const gateR4M0 = load(path.join(RAW, 'teeth/_scratch/r4-m0.json'));
const gateR3Green = load(path.join(RAW, 'review/runs/r3-green.json'));
const gateUnionKeys = raw => (Array.isArray(raw.metrics.layoutNotes) ? raw.metrics.layoutNotes : [])
  .filter(n => (n.codes || []).some(c => c === 'note-narrow' || c === 'note-ink-narrow'))
  .map(n => `${n.route}#${n.index}`).sort();
const myBaselineKeys = before.rounds[1440].R4.keys;
const baselineRows = noteRows(before, 1440);
const multlineNarrow = baselineRows.filter(n => myBaselineKeys.includes(n.key) && n.lineCount >= 2).length;
const singleLineNarrow = baselineRows.filter(n => myBaselineKeys.includes(n.key) && n.lineCount === 1).length;
const distRows = noteRows(after, 1440);
const distSingleShortInk = distRows.filter(n => n.lineCount === 1 && n.widestLine < RATIO * n.column - 0.01).length;
const distShortInk1600 = noteRows(after, 1600).filter(n => n.lineCount === 1 && n.widestLine < RATIO * noteRows(after, 1600)[0].column - 0.01).length;
const verifySrc = fs.readFileSync(path.join(ROOT, 'scripts/tools/verify-site.js'), 'utf8');
const checkCount = (verifySrc.match(/^\s*check\(/gm) || []).length;
const vocabInSrc = (verifySrc.match(/const WIDE_CODE_VOCABULARY = \[([\s\S]*?)\];/) || [])[1] || '';
const vocabList = [...vocabInSrc.matchAll(/'([^']+)'/g)].map(m => m[1]);
const grid760At760 = formTable['changes/'] ? formTable['changes/']['@760'].inkFired : null;

const numbers = [
  { id: 'N01', what: '70ch 现场换算', report: '452.81px', src: 'teeth/T19-ROUND4.md:48,54-57 · report.md:119', mine: before.ch70Values.join('/') + 'px', ok: before.ch70Values.length === 1 && Math.abs(before.ch70Values[0] - 452.81) < 0.005 },
  { id: 'N02', what: '@1440 页面列范围', report: '1120–1380', src: 'teeth/T19-ROUND4.md:54', mine: `${before.columns[1440].min}–${before.columns[1440].max}`, ok: before.columns[1440].min === 1120 && before.columns[1440].max === 1380 },
  { id: 'N03', what: '@1600 页面列范围', report: '1120–1380', src: 'teeth/T19-ROUND4.md:55', mine: `${before.columns[1600].min}–${before.columns[1600].max}`, ok: before.columns[1600].min === 1120 && before.columns[1600].max === 1380,
    note: '源码注释 scripts/tools/verify-site.js:6562 写的是「1600 列 1240–1500」，与报告/我的实测都不符 —— 注释口径过时（不影响判定）' },
  { id: 'N04', what: '@760 页面列范围', report: '676–728', src: 'teeth/T19-ROUND4.md:56 · review/t20/T20-ROUND4.md:55,66', mine: `${before.columns[760].min}–${before.columns[760].max}`, ok: false,
    note: '差异：我按「最宽数据容器的 border-box」量到全站 728–728；报告里的 676 一侧是 plans/ 的 .pchglist **内容盒**基准（T20:55 自述）。判定结论不受影响（728 与 676 都 > 452.81）' },
  { id: 'N05', what: '@360 页面列范围', report: '276–328', src: 'teeth/T19-ROUND4.md:57 · review/t20/T20-ROUND4.md:66', mine: `${before.columns[360].min}–${before.columns[360].max}`, ok: false,
    note: '差异：同上 —— 我量到 328–328（border-box 基准）。结论不受影响（276/328 都 < 452.81 ⇒ 不判）' },
  { id: 'N06', what: '整轮断言数（round-4）', report: '848', src: 'teeth/T19-ROUND4.md:17,18 · review/t20/T20-ROUND4.md:79', mine: `r4-green.json total=${gateR4Green.total} · r4-m0.json total=${gateR4M0.total}`, ok: gateR4Green.total === 848 && gateR4M0.total === 848,
    note: `源码静态 check( 计数 ${checkCount}（运行期断言数 ≠ 静态计数）。另注：round-3 的 dist 报告 review/runs/r3-green.json 是 854 项 —— 断言总数会随轮次/产物变，引用 848 时必须带轮次` },
  { id: 'N07', what: '--dir=dist.baseline 失败数', report: '33', src: 'teeth/T19-ROUND4.md:18 · review/t20/T20-ROUND4.md:96', mine: `r4-m0.json failed=${gateR4M0.failed}`, ok: gateR4M0.failed === 33 },
  { id: 'N08', what: '窄柱并集（baseline）', report: '156 条 / 48 页', src: 'teeth/T19-ROUND4.md:18,101 · review/t20/T20-ROUND4.md:96', mine: `我的独立 R4@1440 = ${myBaselineKeys.length} 条 / ${new Set(myBaselineKeys.map(k => k.split('#')[0])).size} 页 · 判据报告 r4-m0.json = ${gateUnionKeys(gateR4M0).length} 条`, ok: myBaselineKeys.length === 156 && gateUnionKeys(gateR4M0).length === 156 },
  { id: 'N09', what: '① 里 48 条单行 / ② 108 条多行', report: '156（其中 48 单行）· ② 108 多行', src: 'teeth/T19-ROUND4.md:101-102', mine: `单行 ${singleLineNarrow} · 多行 ${multlineNarrow}`, ok: singleLineNarrow === 48 && multlineNarrow === 108 },
  { id: 'N10', what: '「单行且窄字迹」条数（dist）', report: '319', src: 'scripts/tools/verify-site.js:6597（t19 把旧注释的 89 复算为 319）', mine: `@1440 ${distSingleShortInk} · @1600 ${distShortInk1600}`, ok: distSingleShortInk === 319 && distShortInk1600 === 319 },
  { id: 'N11', what: '说明条数 / 有说明的页数', report: '401 条 / 105 页', src: 'research/…-report.md:95,112', mine: `${after.totals.notes} 条 / ${after.totals.pagesWithNotes} 页`, ok: after.totals.notes === 401 && after.totals.pagesWithNotes === 105 },
  { id: 'N12', what: '旧口径覆盖率 26.2%', report: '26.2%（= 105 ÷ 401）', src: 'research/…-report.md:23,112-113', mine: `${Math.round((105 / 401) * 1000) / 10}%`, ok: Math.abs((105 / 401) * 100 - 26.2) < 0.05 },
  { id: 'N13', what: 'grid760 形态在 760 档咬中的条数', report: '6 条 note-ink-narrow', src: 'review/t20/T20-ROUND4.md:33', mine: `${grid760At760} 条（changes/ 全 13 条里逐行字迹命中）`, ok: grid760At760 === 6 },
  { id: 'N14', what: '违规码词表大小', report: '10 个码', src: 'scripts/tools/verify-site.js:6215-6217', mine: `${vocabList.length} 个`, ok: vocabList.length === 10 && VOCAB.every(c => c === 'page-overflow@<vw>' ? vocabList.includes('page-overflow@<vw>') : vocabList.includes(c)) },
  { id: 'N15', what: '§22c 导航次数', report: '630', src: 'teeth/T19-ROUND4.md（成本行）· r4-green.json metrics.layoutScan.navigations', mine: `${gateR4Green.metrics.layoutScan ? gateR4Green.metrics.layoutScan.navigations : 'n/a'}（盘上原始字段）`, ok: gateR4Green.metrics.layoutScan && gateR4Green.metrics.layoutScan.navigations === 630 },
  { id: 'N16', what: 'dist 整轮零失败', report: '848 项 / 失败 0', src: 'teeth/T19-ROUND4.md:17', mine: `r4-green.json failed=${gateR4Green.failed}`, ok: gateR4Green.failed === 0 },
  { id: 'N17', what: 'round-3 的 dist 断言数（对照）', report: '（报告未提）', src: 'review/runs/r3-green.json', mine: `${gateR3Green.total} 项 / 失败 ${gateR3Green.failed}`, ok: gateR3Green.total !== 848,
    note: '同一产物在 round-3 运行时是 854 项 —— 说明「848」是 round-4 专属读数，跨轮引用会错' }
];

const report = {
  generatedAt: new Date().toISOString(),
  probe: { file: 'verify/layout-probe.cjs', requiresOnly: ['playwright-core', 'fs', 'http', 'path'],
    notRequired: ['scripts/tools/verify-site.js', 'scripts/lib/page-kinds.js'],
    runs: { before: before.dir, after: after.dir, forms: Object.keys(forms.inject), reach: Object.keys(reach.inject),
      seconds: { before: before.seconds, after: after.seconds, forms: forms.seconds, reach: reach.seconds } } },
  reconciliation: {
    baseline: before.reconcile, dist: after.reconcile,
    truthBaseline: before.truthCheck, truthDist: after.truthCheck,
    gateReportUsed: { baseline: 'teeth/_scratch/r4-m0.json', dist: 'teeth/_scratch/r4-green.json' }
  },
  roundsTable, formTable, reachability, blind, numbers,
  numbersSummary: { checked: numbers.length, consistent: numbers.filter(n => n.ok).length, differ: numbers.filter(n => !n.ok).map(n => n.id) }
};
fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log(`四轮对照（条/页）`);
for (const [name, table] of Object.entries(roundsTable)) {
  console.log(`  ${name}`);
  for (const [w, row] of Object.entries(table)) console.log(`    @${w} 列 ${row.column} · R1 ${row.R1} · R2 ${row.R2} · R3 ${row.R3} · R4 ${row.R4}`);
}
console.log(`可达性：${reachability.map(r => `${r.code}[我=${r.reachableByMyProbe ? '有' : '无'} · 盘上=${r.reachableOnDisk ? '有' : '无'}]`).join(' ')}`);
console.log(`数字抽查 ${report.numbersSummary.checked} 处：一致 ${report.numbersSummary.consistent} · 差异 ${report.numbersSummary.differ.join(',') || '无'}`);
console.log(`证据：${path.relative(ROOT, OUT).split(path.sep).join('/')}`);
