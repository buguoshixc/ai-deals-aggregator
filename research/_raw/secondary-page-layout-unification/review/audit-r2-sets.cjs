/**
 * T6 round-2 · 集合级独立复算（不采信 t7 的结论，只用它的 geometry/truth-401.json 作为「被测对象」）：
 *
 *   ① 静态独立复算：dist.baseline 里带 `.snote { … max-width: 70ch }` 规则的页面有哪些、
 *      这些页面在 <main> 里一共有多少条 .snote（预期 48 页 / 156 条，且窄条只可能来自这种规则）。
 *   ② 用**本轮新跑**的报告核对条集合：
 *        --dir=dist.baseline ：命中条集合 ⊇ 真值 156 条（漏判 0）、误报 0、页集合 = 48 页
 *        --dir=dist          ：命中条集合 = 空
 *   ③ 同时核对 metrics 侧的计数（narrowNotes / notesJudged / pagesCarryingNarrowNotes）。
 *
 * 用法：node audit-r2-sets.cjs <baseline报告.json> <green报告.json>
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..', '..');
const GEOM = path.join(ROOT, 'research', '_raw', 'secondary-page-layout-unification', 'geometry');

const truth = JSON.parse(fs.readFileSync(path.join(GEOM, 'truth-401.json'), 'utf8'));
const expected = [...truth.sets.caughtByOldCriteria, ...truth.sets.onlyNewTruth]
  .map(row => ({ key: `${row.route}#${row.index}`, route: row.route, index: row.index }));
const expectedKeys = new Set(expected.map(e => e.key));
const alreadyFine = new Set(truth.sets.alreadyFine.map(row => `${row.route}#${row.index}`));
const archive = new Set(truth.archiveControl.map(row => `${row.route}#${row.index}`));
console.log(`真值文件：${path.relative(ROOT, path.join(GEOM, 'truth-401.json'))}（生成于 ${truth.at}）`);
console.log(`  真值 156 条 = 旧口径命中 ${truth.sets.caughtByOldCriteria.length} + 只有新真值覆盖 ${truth.sets.onlyNewTruth.length}`
  + ` · 对照组 alreadyFine ${alreadyFine.size} 条 · archive 控制组 ${archive.size} 条`);
console.log(`  真值 totals：${JSON.stringify(truth.totals)}`);

// ---------- ① 静态独立复算 ----------
const DIR = path.join(ROOT, 'dist.baseline');
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.name.toLowerCase() === 'index.html') out.push(full);
  }
  return out;
}
const narrowRulePages = [];
let noteCountOnThem = 0;
for (const file of walk(DIR)) {
  const raw = fs.readFileSync(file, 'utf8');
  const route = path.relative(DIR, file).split(path.sep).join('/').replace(/index\.html$/, '') || '/';
  let styles = '';
  for (const m of raw.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) styles += m[1];
  if (!/\.snote[^{}]*\{[^{}]*max-width:\s*70ch/.test(styles)) continue;
  narrowRulePages.push(route);
  const html = raw.replace(/<script\b[\s\S]*?<\/script>/gi, '');
  const start = html.search(/<main[\s>]/);
  const end = start < 0 ? -1 : html.indexOf('</main>', start);
  const mainHtml = start < 0 ? '' : html.slice(start, end < 0 ? html.length : end);
  noteCountOnThem += (mainHtml.match(/class\s*=\s*"[^"]*\bsnote\b[^"]*"/g) || []).length;
}
console.log(`\n① 静态复算（dist.baseline）：内联样式里带「.snote … max-width: 70ch」的页面 ${narrowRulePages.length} 个`
  + ` · 这些页面 <main> 里的 .snote 共 ${noteCountOnThem} 条`);
console.log(`   真值声称：窄说明 156 条 / 48 页 ⇒ 静态复算与之${narrowRulePages.length === 48 && noteCountOnThem === 156 ? '**一致**' : '**不一致**'}`);

// ---------- ② 报告核对 ----------
function noteRows(report) {
  const metrics = report.metrics || {};
  const rows = Array.isArray(metrics.layoutNotes) ? metrics.layoutNotes : null;
  if (!rows) return null;
  return rows.map(r => ({ key: `${r.route}#${r.index}`, route: r.route, index: r.index, codes: r.codes || [] }));
}
function check(label, reportFile, expectNarrow) {
  const report = JSON.parse(fs.readFileSync(path.resolve(ROOT, reportFile), 'utf8'));
  const rows = noteRows(report);
  const metrics = report.metrics || {};
  console.log(`\n② ${label}（${reportFile}）：断言 ${report.total} · 失败 ${report.failed}`);
  if (!rows) { console.log('   ✗ 报告里没有条级容器 metrics.layoutNotes'); return false; }
  const narrow = rows.filter(r => r.codes.includes('note-narrow'));
  const narrowKeys = new Set(narrow.map(r => r.key));
  const missed = [...expectedKeys].filter(k => !narrowKeys.has(k));
  const extra = [...narrowKeys].filter(k => !expectedKeys.has(k));
  const extraInControl = extra.filter(k => alreadyFine.has(k) || archive.has(k));
  const routes = new Set(narrow.map(r => r.route));
  const expectedRoutes = new Set(expected.map(e => e.route));
  const routeMissed = [...expectedRoutes].filter(r => !routes.has(r));
  const routeExtra = [...routes].filter(r => !expectedRoutes.has(r));
  console.log(`   条级容器 ${rows.length} 条 · 命中 note-narrow ${narrow.length} 条 / ${routes.size} 页`);
  console.log(`   漏判 ${missed.length}${missed.length ? `：${missed.slice(0, 6).join(' ')}` : ''} · 误报 ${extra.length}${extra.length ? `：${extra.slice(0, 6).join(' ')}` : ''}（其中落在对照组 ${extraInControl.length} 条）`);
  console.log(`   页集合：漏 ${routeMissed.length} · 多 ${routeExtra.length}`);
  console.log(`   metrics.layoutSweep：notesChecked=${metrics.layoutSweep.notesChecked} · notesJudged=${metrics.layoutSweep.notesJudged}`
    + ` · narrowNotes=${metrics.layoutSweep.narrowNotes} · narrowNotePages=${metrics.layoutSweep.narrowNotePages}`
    + ` · narrowNotesAt1600=${metrics.layoutSweep.narrowNotesAt1600}`);
  ROWS_SEEN_LABEL[label] = rows.length;
  const ok = expectNarrow
    ? (missed.length === 0 && extra.length === 0 && routeMissed.length === 0 && routeExtra.length === 0 && narrow.length === expectedKeys.size)
    : (narrow.length === 0);
  console.log(`   ⇒ ${ok ? '✅ pass' : '❌ fail'}`);
  return ok;
}
const ROWS_SEEN_LABEL = {};

const args = process.argv.slice(2);
const results = [];
if (args[0]) results.push(check('baseline 报告', args[0], true));
if (args[1]) results.push(check('green 报告', args[1], false));
console.log(`\n③ 条级容器覆盖：${JSON.stringify(ROWS_SEEN_LABEL)} · 静态复算 401 条`
  + `${Object.values(ROWS_SEEN_LABEL).every(n => n === 401) ? ' ⇒ 覆盖率 401/401 = 100%（round-1 旧读数 105/401 = 26.2%）' : ' ⇒ 与 401 不符！'}`);
console.log(`\n总判定：${results.every(Boolean) ? '✅ 全部 pass' : '❌ 有失败项'}`);
process.exit(results.every(Boolean) ? 0 : 1);
