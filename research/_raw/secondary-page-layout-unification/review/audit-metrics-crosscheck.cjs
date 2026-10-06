/**
 * T6 复审 · 独立复算 §22c 的每一个计数：**从产物静态重算**，再与 --json 报告里的 metrics 对账。
 *
 * 复算口径刻意与 §22c 不同源：这里不跑浏览器、不调用 wideProblems，只用 page-kinds 的声明
 * （kindOfRoute / layoutOf）+ 静态 HTML 解析。两套口径给出同一个数，才说明 metrics 不是自证。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..', '..');
const DIR = path.join(ROOT, process.argv[2] || 'dist');
const reportFile = process.argv[3] ? path.resolve(ROOT, process.argv[3]) : null;

const pageKinds = require(path.join(ROOT, 'scripts', 'lib', 'page-kinds.js'));
const audienceLib = require(path.join(ROOT, 'scripts', 'lib', 'audience.js'));
const landingsLib = require(path.join(ROOT, 'scripts', 'lib', 'landing.js'));

const kindByRoute = new Map();
for (const page of audienceLib.COLLECTION_PAGES) kindByRoute.set(`${page.slug}/`, 'collection');
for (const page of audienceLib.NEED_PAGES) kindByRoute.set(`need/${page.slug}/`, 'need');
kindByRoute.set(landingsLib.VENDOR_HUB.route, 'hub');
kindByRoute.set(landingsLib.CATEGORY_HUB.route, 'hub');
kindByRoute.set('', 'home');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.name.toLowerCase() === 'index.html') out.push(full);
  }
  return out;
}

const DATA_SELECTORS = ['.ctable', '.stable', '.chgsec', '.chglist', '.flist', '.fsec', '.ptable', '.lsum', '.pchglist'];
const routes = walk(DIR).map(file => {
  const rel = path.relative(DIR, file).split(path.sep).join('/');
  return { route: rel === 'index.html' ? '' : rel.replace(/index\.html$/, ''), file };
}).sort((a, b) => (a.route < b.route ? -1 : 1));

const FROZEN = '.snote { color: var(--mut); font-size: var(--fs-sm); line-height: 1.7; margin: 0 0 var(--s3); max-width: none; overflow-wrap: anywhere; }';

const stats = {
  total: routes.length, wide: 0, detail: 0, other: 0, unclassified: 0,
  notesChecked: 0, noNote: 0, frozenExactlyOnce: 0, frozenDrift: [],
  regionCounts: {}, multiNoteInMain: 0, mainMissing: 0
};
const perRoute = [];
for (const { route, file } of routes) {
  const rawHtml = fs.readFileSync(file, 'utf8');
  // 与浏览器同口径：<script> 文本里的 class="..." 不是 DOM 元素（首页的变化雷达就在 inline JS 里拼串）。
  const html = rawHtml.replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<style\b[\s\S]*?<\/style>/gi, '');
  const kind = pageKinds.kindOfRoute(route) || kindByRoute.get(route) || null;
  const family = kind ? pageKinds.layoutOf(kind) : null;
  if (!kind || !family) stats.unclassified += 1;
  if (family === 'wide') stats.wide += 1;
  else if (family === 'detail') stats.detail += 1;
  else if (family === 'other') stats.other += 1;

  // <main> 里的 .snote 计数
  const mainStart = html.search(/<main[\s>]/);
  const mainEnd = mainStart < 0 ? -1 : html.indexOf('</main>', mainStart);
  const mainHtml = mainStart < 0 ? '' : html.slice(mainStart, mainEnd < 0 ? html.length : mainEnd);
  const noteCount = (mainHtml.match(/class\s*=\s*"[^"]*\bsnote\b[^"]*"/g) || []).length;
  if (noteCount > 0) stats.notesChecked += 1; else stats.noNote += 1;
  if (noteCount > 1) stats.multiNoteInMain += 1;
  if (mainStart < 0) stats.mainMissing += 1;

  // 主数据区：第一个在文档里出现的声明选择器（与浏览器同口径：存在即命中）
  let regionSel = null;
  for (const sel of DATA_SELECTORS) {
    const cls = sel.slice(1);
    if (new RegExp(`class\\s*=\\s*"[^"]*\\b${cls}\\b[^"]*"`).test(html)) { regionSel = sel; break; }
  }
  const key = regionSel || '<main>（回落）';
  stats.regionCounts[key] = (stats.regionCounts[key] || 0) + 1;

  let styles = '';
  for (const m of rawHtml.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) styles += m[1];
  const frozenCount = styles.split(FROZEN).length - 1;
  if (frozenCount === 1) stats.frozenExactlyOnce += 1; else stats.frozenDrift.push(`${route || '/'}=${frozenCount}`);

  perRoute.push({ route, kind, family, noteCount, regionSel });
}

console.log(`静态复算：${DIR}`);
console.log(JSON.stringify(stats, null, 2));
if (reportFile && fs.existsSync(reportFile)) {
  const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
  const m = report.metrics;
  const compare = [
    ['total', stats.total, m.layoutSweep.total],
    ['wide', stats.wide, m.layoutSweep.wide],
    ['detail', stats.detail, m.layoutSweep.detail],
    ['other', stats.other, m.layoutSweep.other],
    ['unclassified', stats.unclassified, m.layoutSweep.unclassified],
    ['notesChecked', stats.notesChecked, m.layoutSweep.notesChecked],
    ['unexpectedDetailMain', 0, m.layoutSweep.unexpectedDetailMain],
    ['missingDetailMain', 0, m.layoutSweep.missingDetailMain],
    ['frozen pagesExactlyOnce', stats.frozenExactlyOnce, m.layoutFrozenRule.pagesExactlyOnce],
    ['layoutViolations.length', 0, m.layoutViolations.length]
  ];
  console.log('\n逐项对账（静态 vs 报告）：');
  let bad = 0;
  for (const [label, a, b] of compare) {
    const ok = a === b;
    if (!ok) bad += 1;
    console.log(`   ${ok ? '一致' : '不一致'}  ${label}: 静态 ${a} / 报告 ${b}`);
  }
  console.log(`\n主数据区分布：静态 ${JSON.stringify(stats.regionCounts)}`);
  console.log(`          报告 ${JSON.stringify(m.layoutDataRegions)}`);
  const sKeys = Object.keys(stats.regionCounts).sort().join('|');
  const rKeys = Object.keys(m.layoutDataRegions).sort().join('|');
  console.log(`   键集合一致：${sKeys === rKeys}（静态 ${sKeys} / 报告 ${rKeys}）`);
  if (sKeys === rKeys) {
    for (const k of Object.keys(stats.regionCounts)) {
      if (stats.regionCounts[k] !== m.layoutDataRegions[k]) { console.log(`   ✗ ${k}: 静态 ${stats.regionCounts[k]} / 报告 ${m.layoutDataRegions[k]}`); bad += 1; }
    }
  } else bad += 1;
  console.log(`\n对账结论：${bad === 0 ? '✅ 全部一致' : `❌ ${bad} 项不一致`}`);
  console.log(`   多说明页（<main> 里 ≥2 个 .snote）：${stats.multiNoteInMain} 页 —— §22c 只对文档序第一个判几何`);
  console.log(`   冻结串漂移：${stats.frozenDrift.length ? stats.frozenDrift.join(' ') : '无'}`);
}
