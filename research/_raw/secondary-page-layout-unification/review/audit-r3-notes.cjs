/**
 * T15（round 3）· 逐条读数复核：
 *   ① `--dir=dist` 报告：401 条说明逐条有 lineCount/widestLine、layoutViolations=0；
 *      并抽 ≥15 条人工核对（最短单行 / 最长多行 / 3 个别名页 / archive/ 那 5 条）。
 *   ② `--dir=dist.baseline` 报告：覆盖 401 条、命中 156 条 / 48 页，与 truth-401.json 集合逐条相同。
 *   ③ 独立静态复算：dist.baseline 里带「.snote … max-width: 70ch」的页面数与其上 .snote 条数。
 *
 * 用法：node audit-r3-notes.cjs <green.json> <m0.json>
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..', '..');
const GEOM = path.join(ROOT, 'research', '_raw', 'secondary-page-layout-unification', 'geometry');

const truth = JSON.parse(fs.readFileSync(path.join(GEOM, 'truth-401.json'), 'utf8'));
const expected = [...truth.sets.caughtByOldCriteria, ...truth.sets.onlyNewTruth].map(r => ({ key: `${r.route}#${r.index}` }));
const expectedKeys = new Set(expected.map(e => e.key));
const alreadyFine = new Set(truth.sets.alreadyFine.map(r => `${r.route}#${r.index}`));

const notesOf = report => {
  const m = report.metrics || {};
  return Array.isArray(m.layoutNotes) ? m.layoutNotes : null;
};
const narrowKeysOf = rows => new Set(rows.filter(r => (r.codes || []).includes('note-narrow')).map(r => `${r.route}#${r.index}`));

const greenReport = JSON.parse(fs.readFileSync(path.resolve(ROOT, process.argv[2]), 'utf8'));
const m0Report = process.argv[3] ? JSON.parse(fs.readFileSync(path.resolve(ROOT, process.argv[3]), 'utf8')) : null;

console.log(`① green（${path.relative(ROOT, path.resolve(ROOT, process.argv[2]))}）：断言 ${greenReport.total} · 失败 ${greenReport.failed}`);
const greenRows = notesOf(greenReport);
if (!greenRows) { console.log('   ✗ 报告里没有条级容器 metrics.layoutNotes'); process.exit(1); }
const greenCodes = new Map();
for (const r of greenRows) for (const c of (r.codes || [])) greenCodes.set(c, (greenCodes.get(c) || 0) + 1);
const haveLineFields = greenRows.filter(r => typeof r.lineCount === 'number' && typeof r.widestLine === 'number').length;
console.log(`   条级容器 ${greenRows.length} 条 · 有 lineCount+widestLine 的 ${haveLineFields} 条 · 违规码分布 ${[...greenCodes.entries()].map(([c, n]) => `${c}=${n}`).join(' ') || '（无）'}`);
console.log(`   layoutViolations ${(greenReport.metrics.layoutViolations || []).length} 页 · layoutSweep ${JSON.stringify(greenReport.metrics.layoutSweep)}`);

// ---- 人工抽查：最短单行 / 最长多行 / 别名页 / archive ----
const withLine = greenRows.filter(r => typeof r.widestLine === 'number');
const pick = (label, rows, n = 3) => {
  console.log(`   [抽查] ${label}（${rows.length} 条，列 ${Math.min(n, rows.length)} 条）：`);
  for (const r of rows.slice(0, n)) {
    console.log(`      ${r.route}#${r.index} · 行数 ${r.lineCount} · 最宽行 ${r.widestLine} · 最窄行 ${r.narrowestLine === undefined ? '—' : r.narrowestLine}`
      + ` · 列 ${r.column} · textWidth ${r.textWidth} · 盒 ${r.width} · 字迹 ${r.inkWidth === undefined ? '—' : r.inkWidth} · 「${(r.text || '').slice(0, 22)}」`);
  }
};
console.log('\n   条级抽查（要求逐条合理）：');
pick('单行说明（行数 = 1）', withLine.filter(r => r.lineCount === 1).sort((a, b) => a.widestLine - b.widestLine));
pick('多行说明里最宽的行（行数 ≥2，按最宽行降序）', withLine.filter(r => r.lineCount >= 2).sort((a, b) => b.widestLine - a.widestLine));
pick('别名页 need/*（.aliasnote）', withLine.filter(r => r.route.startsWith('need/')));
pick('archive/（本来正常的 5 条）', withLine.filter(r => r.route === 'archive/'), 5);
pick('最短的单行说明（按字迹升序）', withLine.filter(r => r.lineCount === 1).sort((a, b) => (a.inkWidth || a.widestLine) - (b.inkWidth || b.widestLine)));
pick('changes/（round-2 的假绿靶页）', withLine.filter(r => r.route === 'changes/'), 13);
const aliasCheck = withLine.filter(r => r.route.startsWith('need/'));
const bogus = aliasCheck.filter(r => (r.codes || []).length);
console.log(`   别名页 3 条命中违规码的：${bogus.length}（必须 0）`);

// ---- baseline ----
if (m0Report) {
  console.log(`\n② baseline（${path.relative(ROOT, path.resolve(ROOT, process.argv[3]))}）：断言 ${m0Report.total} · 失败 ${m0Report.failed}`);
  const rows = notesOf(m0Report);
  if (!rows) { console.log('   ✗ 没有条级容器'); process.exit(1); }
  const narrow = narrowKeysOf(rows);
  const routes = new Set(rows.filter(r => (r.codes || []).includes('note-narrow')).map(r => r.route));
  const missed = [...expectedKeys].filter(k => !narrow.has(k));
  const extra = [...narrow].filter(k => !expectedKeys.has(k));
  const extraControl = extra.filter(k => alreadyFine.has(k));
  console.log(`   条级容器 ${rows.length} 条 · 命中 note-narrow ${narrow.size} 条 / ${routes.size} 页`);
  console.log(`   漏判 ${missed.length}${missed.length ? `：${missed.slice(0, 5).join(' ')}` : ''} · 误报 ${extra.length}（落在 alreadyFine 的 ${extraControl.length}）`);
  const ok = missed.length === 0 && extra.length === 0 && narrow.size === expectedKeys.size && routes.size === 48;
  console.log(`   ⇒ ${ok ? '✅ 156 条 / 48 页，集合逐条相同' : '❌ 集合不一致'}`);
}

// ---- 静态独立复算 ----
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.name.toLowerCase() === 'index.html') out.push(full);
  }
  return out;
}
const DIR = path.join(ROOT, 'dist.baseline');
let pages = 0; let notes = 0;
for (const file of walk(DIR)) {
  const raw = fs.readFileSync(file, 'utf8');
  let styles = '';
  for (const m of raw.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) styles += m[1];
  if (!/\.snote[^{}]*\{[^{}]*max-width:\s*70ch/.test(styles)) continue;
  pages += 1;
  const html = raw.replace(/<script\b[\s\S]*?<\/script>/gi, '');
  const start = html.search(/<main[\s>]/);
  const end = start < 0 ? -1 : html.indexOf('</main>', start);
  const mainHtml = start < 0 ? '' : html.slice(start, end < 0 ? html.length : end);
  notes += (mainHtml.match(/class\s*=\s*"[^"]*\bsnote\b[^"]*"/g) || []).length;
}
console.log(`\n③ 静态独立复算（dist.baseline）：带 70ch .snote 规则的页面 ${pages} 个 · 这些页面 <main> 里的 .snote ${notes} 条`);
console.log(`   与真值 156 条 / 48 页 ${pages === 48 && notes === 156 ? '一致 ✅' : '不一致 ❌'}`);
