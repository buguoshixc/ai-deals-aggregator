#!/usr/bin/env node
/**
 * secondary-page-layout-unification · Before/After 几何表（把两份探针 JSON 变成可读表格）
 *
 * 输入：geometry/before.json（dist.baseline）与 geometry/after.json（dist），
 *       由 `wide-probe.cjs` 同一次实现产出（同一样本集、同一套量法与判据）。
 * 输出：geometry/before-after.md —— 必须的对比表 + 全站读数 + 逐页完整矩阵 + 证据身份。
 *
 * 用法：
 *   node research/_raw/secondary-page-layout-unification/geometry/make-table.cjs \
 *        --before=.../geometry/before.json --after=.../geometry/after.json \
 *        --out=.../geometry/before-after.md
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const arg = name => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const ROOT = path.join(__dirname, '..', '..', '..', '..');
const resolve = p => (path.isAbsolute(p) ? p : path.join(ROOT, p));
const BEFORE = resolve(arg('before') || path.join(ROOT, 'research', '_raw', 'secondary-page-layout-unification', 'geometry', 'before.json'));
const AFTER = resolve(arg('after') || path.join(ROOT, 'research', '_raw', 'secondary-page-layout-unification', 'geometry', 'after.json'));
const OUT = resolve(arg('out') || path.join(ROOT, 'research', '_raw', 'secondary-page-layout-unification', 'geometry', 'before-after.md'));

const before = JSON.parse(fs.readFileSync(BEFORE, 'utf8'));
const after = JSON.parse(fs.readFileSync(AFTER, 'utf8'));
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const px = value => (value === null || value === undefined ? '—' : `${value}`);
const num = value => (typeof value === 'number' ? value : null);
const cell = (a, b) => (a === b ? `${px(a)}` : `${px(a)} → **${px(b)}**`);
const ratio = value => (value === null ? '—' : value.toFixed(3));

/** (route, viewport) → 读数 */
const index = report => {
  const map = new Map();
  for (const record of report.samples) {
    for (const [viewport, data] of Object.entries(record.viewports)) map.set(`${record.route}@${viewport}`, data);
  }
  return map;
};
const beforeIndex = index(before);
const afterIndex = index(after);
const routes = before.samples.map(record => record.route);
const VIEWPORTS = ['1440', '1280', '1024', '760', '390', '360'];

const lines = [];
const push = text => lines.push(text);
const noteWidth = data => (data && data.topNote ? data.topNote.width : null);
const overflow = data => {
  const client = num(data && data.doc ? data.doc.clientWidth : null);
  const scroll = num(data && data.doc ? data.doc.scrollWidth : null);
  if (client === null || scroll === null) return '—';
  return scroll > client + 1 ? `${scroll - client}px 溢出` : `0（${scroll}/${client}）`;
};

push('# Before（`dist.baseline`）→ After（`dist`）几何对照表');
push('');
push('> 由 `geometry/wide-probe.cjs` 生成的两份 JSON 汇总而成 —— **独立实现**（不 require `scripts/tools/verify-site.js`），');
push('> 自己起静态服务、自己量、自己判。样本 id/slug 现场从产物 + `deals.json` / `models.json` / `sitemap.xml` 推导。');
push('');
push('## 0. 证据身份');
push('');
push(`- before：\`${before.dir}\` · 探针 label \`${before.label}\` · 生成于 ${before.at}`);
push(`  - JSON sha256 \`${sha(BEFORE)}\`（\`${path.relative(ROOT, BEFORE).replace(/\\/g, '/')}\`）`);
push(`- after：\`${after.dir}\` · 探针 label \`${after.label}\` · 生成于 ${after.at}`);
push(`  - JSON sha256 \`${sha(AFTER)}\`（\`${path.relative(ROOT, AFTER).replace(/\\/g, '/')}\`）`);
push(`- 浏览器：\`${after.edge}\` · 页面路由 ${after.routesTotal} 个 · 导航次数 before ${before.navigations} / after ${after.navigations}`);
push(`- 判据：\`note-narrow\` = 顶部说明宽 < ${after.noteRatio} × min(主数据区宽, 页面列宽)；\`note-axis\` = 与主数据区**和**页面主容器都不同轴（容差 ${after.tolerance}px）；`);
push(`  \`note-clipped\` = 说明自身横向溢出；\`page-overflow@<vw>\` = documentElement.scrollWidth > clientWidth + ${after.tolerance}。`);
push(`- 三档桌面：${after.desktopViewports.map(v => `${v.width}×${v.height}`).join(' / ')}；三档窄屏：${after.narrowViewports.map(v => `${v.width}×${v.height}`).join(' / ')}。`);
push('');

push('## 1. 全站读数（独立探针的全站扫描：1440 量几何 + 390 量 scrollWidth）');
push('');
push('| 读数 | before（dist.baseline） | after（dist） |');
push('| --- | --- | --- |');
push(`| 扫描页数 | ${before.sweep.total} | ${after.sweep.total} |`);
push(`| 有违规码的页面 | **${before.sweep.violations.length}** | **${after.sweep.violations.length}** |`);
push(`| \`note-narrow\` | **${before.sweep.codes['note-narrow'] || 0}** | **${after.sweep.codes['note-narrow'] || 0}** |`);
push(`| \`note-axis\` | **${before.sweep.codes['note-axis'] || 0}** | **${after.sweep.codes['note-axis'] || 0}** |`);
push(`| \`note-clipped\` | ${before.sweep.codes['note-clipped'] || 0} | ${after.sweep.codes['note-clipped'] || 0} |`);
push(`| \`page-overflow@1440\` | ${before.sweep.codes['page-overflow@1440'] || 0} | ${after.sweep.codes['page-overflow@1440'] || 0} |`);
push(`| \`page-overflow@390\` | ${before.sweep.codes['page-overflow@390'] || 0} | ${after.sweep.codes['page-overflow@390'] || 0} |`);
push(`| 样本集违规条数（21 页 × 6 档） | **${before.sampleViolations.length}** | **${after.sampleViolations.length}** |`);
push('');

if (before.sweep.violations.length) {
  push(`### 1.1 before 的 ${before.sweep.violations.length} 个违规页（原样清单，逐页读数）`);
  push('');
  push('| # | 页面 | 违规码 | 说明宽 | 主数据区 | 主数据区选择器 | 有说明 | 390 scrollWidth |');
  push('| --- | --- | --- | --- | --- | --- | --- | --- |');
  before.sweep.violations.forEach((row, i) => {
    push(`| ${i + 1} | \`${row.route || '/'}\` | ${row.codes.join(', ')} | ${px(row.noteWidth)}px | ${px(row.regionWidth)}px | \`${row.regionSel || '<main>（回落）'}\` | ${row.noteCount} | ${row.scrollWidth} |`);
  });
  push('');
  const families = {};
  for (const row of before.sweep.violations) {
    const key = row.route === '' ? '（首页）'
      : /^category\//.test(row.route) ? 'category/*'
        : /^vendor\//.test(row.route) ? 'vendor/*'
          : /^deal\//.test(row.route) ? 'deal/*'
            : /^models\//.test(row.route) ? 'models/*'
              : /^need\//.test(row.route) ? 'need/*'
                : row.route;
    families[key] = (families[key] || 0) + 1;
  }
  push(`按路由族归类：${Object.entries(families).map(([k, v]) => `${k} ${v} 页`).join(' · ')}`);
  push('');
}

push('## 2. 必须的对比表（页面 | viewport | before 说明宽 | after 说明宽 | 主数据区宽 | ratio | overflow）');
push('');
push('`ratio` = 顶部说明宽 ÷ min(主数据区宽, 页面列宽)（1.000 = 与数据区等宽的理想值；`—` = 该页没有页面级说明）。');
push('`overflow` 列：`0（scrollWidth/clientWidth）` = 不溢出；否则给出溢出像素。');
push('');
push('| 页面 | viewport | before 说明宽 | after 说明宽 | 主数据区宽 | ratio | overflow |');
push('| --- | --- | --- | --- | --- | --- | --- |');
for (const route of routes) {
  for (const viewport of VIEWPORTS) {
    const b = beforeIndex.get(`${route}@${viewport}`);
    const a = afterIndex.get(`${route}@${viewport}`);
    if (!b || !a) continue;
    push(`| \`${route || '/'}\` | ${viewport}×${viewport === '1440' ? 900 : viewport === '1280' ? 800 : viewport === '1024' ? 768 : 800} | ${px(noteWidth(b))}px | ${px(noteWidth(a))}px | ${cell(num(b.region && b.region.width), num(a.region && a.region.width))}px | ${ratio(num(b.ratioTopToColumn))} → ${ratio(num(a.ratioTopToColumn))} | ${px(overflow(b))} → ${px(overflow(a))} |`);
  }
}
push('');

push('## 3. after 的完整几何矩阵（逐页逐档：main / 主数据区 / 顶部说明 / 底部说明 / 左右边缘）');
push('');
push('| 页面 | viewport | main 宽 | 主数据区（选择器） | 顶部说明宽 | 底部说明宽 | 说明 left..right | note÷data | scrollWidth / clientWidth | 违规码 |');
push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const record of after.samples) {
  for (const viewport of VIEWPORTS) {
    const data = record.viewports[viewport];
    if (!data) continue;
    push(`| \`${record.route || '/'}\` | ${viewport} | ${data.main ? data.main.width : '—'}px | ${data.region ? data.region.width : '—'}px（\`${data.regionSel || '<main>（回落）'}\`） | ${data.topNote ? `${data.topNote.width}px` : '（无页面级说明）'} | ${data.bottomNote ? `${data.bottomNote.width}px` : '—'} | ${data.topNote ? `${data.topNote.left}..${data.topNote.right}` : '—'} | ${ratio(num(data.ratioTopToRegion))} | ${data.doc.scrollWidth} / ${data.doc.clientWidth} | ${data.codes.join(', ') || '无'} |`);
  }
}
push('');

push('## 4. 样本推导（不写死的证据）');
push('');
for (const note of after.derivation.notes) push(`- ${note}`);
push(`- 固定样本（prompt §12）：\`${after.samples.map(r => r.route || '/').join('` `')}\``);
push(`- 数据规模：deals.json ${after.derivation.sourceIds.deals} 条 · models.json ${after.derivation.sourceIds.models} 条 · sitemap.xml ${after.derivation.sourceIds.sitemapRoutes} 条`);
push(`- JS 错误：before ${before.jsErrors.length} 个 / after ${after.jsErrors.length} 个`);
push('');

/* ---------------- 5. 每一条 .snote（captain 指令 A/B） ---------------- */
const NOTES_BEFORE = resolve(arg('notes-before') || path.join(path.dirname(BEFORE), 'all-notes-before.json'));
const NOTES_AFTER = resolve(arg('notes-after') || path.join(path.dirname(AFTER), 'all-notes-after.json'));
if (fs.existsSync(NOTES_BEFORE) && fs.existsSync(NOTES_AFTER)) {
  const notesBefore = JSON.parse(fs.readFileSync(NOTES_BEFORE, 'utf8'));
  const notesAfter = JSON.parse(fs.readFileSync(NOTES_AFTER, 'utf8'));
  const indexNotes = report => {
    const map = new Map();
    for (const page of report.pages) {
      for (const [viewport, data] of Object.entries(page.viewports)) {
        for (const note of data.notes) map.set(`${page.route}@${viewport}#${note.index}`, { page, viewport, data, note });
      }
    }
    return map;
  };
  const beforeNoteIndex = indexNotes(notesBefore);
  const afterNoteIndex = indexNotes(notesAfter);

  push('## 5. 每一条 `.snote` 的逐条读数（captain 指令 A/B：不只第一条）');
  push('');
  push('> §22c 之前只量 `<main>` 里**文档序第一条** `.snote`；这一节把 `<main>` 内**全部** `.snote`');
  push('> 都量出来（文档序，标出序号与位置），因此「改回 70ch 的是后面那一条」这种漏判在这里看得见。');
  push(`> 探针：\`geometry/all-notes-probe.cjs\` · before JSON sha256 \`${sha(NOTES_BEFORE)}\` · after JSON sha256 \`${sha(NOTES_AFTER)}\``);
  push('');
  push('### 5.1 指令 B：全站 `.snote` 条数分布（1440 档）');
  push('');
  push('| 读数 | before（dist.baseline） | after（dist） |');
  push('| --- | --- | --- |');
  push(`| 页面总数 | ${notesBefore.routesTotal} | ${notesAfter.routesTotal} |`);
  push(`| 有页面级说明的页面（≥1 条） | ${notesBefore.counts.pagesWithAnyNote} | ${notesAfter.counts.pagesWithAnyNote} |`);
  push(`| **` + '`<main>` 内 `.snote` ≥ 2 条的页面** | **' + `${notesBefore.counts.pagesWithMultiNotes}** | **${notesAfter.counts.pagesWithMultiNotes}** |`);
  push(`| **最多的一页有几条** | **${notesBefore.counts.maxNotesOnOnePage}** | **${notesAfter.counts.maxNotesOnOnePage}** |`);
  push(`| 说明总条数 | ${notesBefore.counts.totalNotes} | ${notesAfter.counts.totalNotes} |`);
  push(`| 条数直方图（0/1/2/…） | \`${JSON.stringify(notesBefore.counts.histogram1440)}\` | \`${JSON.stringify(notesAfter.counts.histogram1440)}\` |`);
  push(`| **「比主数据区窄」（< 0.85×列宽，1440 档）** | **${notesBefore.counts.notesNarrowerThanColumn1440} 条** | **${notesAfter.counts.notesNarrowerThanColumn1440} 条** |`);
  push(`| 其中**第 2 条及以后**的（§22c 旧口径看不见的那一批） | **${notesBefore.counts.notesNarrowerOnlyAfterFirst1440} 条** | **${notesAfter.counts.notesNarrowerOnlyAfterFirst1440} 条** |`);
  push(`| 窄说明（390 档） | ${notesBefore.counts.notesNarrowerThanColumn390} 条 | ${notesAfter.counts.notesNarrowerThanColumn390} 条 |`);
  push('');
  push(`最多说明条数的页面：${(() => {
    const sorted = [...notesAfter.pages].sort((a, b) => b.viewports['1440'].noteCount - a.viewports['1440'].noteCount);
    return sorted.slice(0, 8).map(page => `\`${page.route || '/'}\`=${page.viewports['1440'].noteCount}`).join(' · ');
  })()}`);
  push('');
  push('### 5.2 多说明页面（`.snote` ≥ 2）逐条对比');
  push('');
  push('| 页面 | # | 位置 | before 宽 | before left..right | before ratio | after 宽 | after left..right | after ratio | 结论 |');
  push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  const multiRoutes = notesAfter.pages.filter(page => page.viewports['1440'].noteCount >= 2).map(page => page.route);
  let changedNotes = 0;
  let unchangedNotes = 0;
  for (const route of multiRoutes) {
    const afterPage = notesAfter.pages.find(page => page.route === route);
    const count = afterPage.viewports['1440'].noteCount;
    for (let index = 0; index < count; index += 1) {
      const b = beforeNoteIndex.get(`${route}@1440#${index}`);
      const a = afterNoteIndex.get(`${route}@1440#${index}`);
      if (!b || !a) continue;
      const changed = b.note.width !== a.note.width;
      if (changed) changedNotes += 1; else unchangedNotes += 1;
      const verdict = !changed ? '不变'
        : (b.note.narrowerThanColumn && !a.note.narrowerThanColumn) ? '**窄 → 同轴**'
          : '宽度变了';
      push(`| \`${route || '/'}\` | ${index} | ${a.note.position} | ${b.note.width}px | ${b.note.left}..${b.note.right} | ${ratio(num(b.note.ratioToColumn))}${b.note.narrowerThanColumn ? '（窄）' : ''} | ${a.note.width}px | ${a.note.left}..${a.note.right} | ${ratio(num(a.note.ratioToColumn))}${a.note.narrowerThanColumn ? '（窄）' : ''} | ${verdict} |`);
    }
  }
  push('');
  push(`逐条汇总：多说明页面的说明条数 ${changedNotes + unchangedNotes} 条，其中**宽度发生变化 ${changedNotes} 条**、未变 ${unchangedNotes} 条；`);
  push(`before 的「窄」说明 ${notesBefore.counts.notesNarrowerThanColumn1440} 条在 after 里剩 ${notesAfter.counts.notesNarrowerThanColumn1440} 条。`);
  push('');

  // 把「全部说明」的完整表也落进 md（不只多说明页面）—— 修复后的 §22c 要覆盖的正是这一批
  push('### 5.3 全部 401 条说明的 before → after 宽度（按页面）');
  push('');
  push('| 页面 | # | 位置 | before 宽 / ratio | after 宽 / ratio | before 窄？ | after 窄？ |');
  push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const page of notesAfter.pages) {
    const data = page.viewports['1440'];
    if (!data.noteCount) continue;
    for (const note of data.notes) {
      const b = beforeNoteIndex.get(`${page.route}@1440#${note.index}`);
      const bNote = b ? b.note : null;
      push(`| \`${page.route || '/'}\` | ${note.index} | ${note.position} | ${bNote ? `${bNote.width}px / ${ratio(num(bNote.ratioToColumn))}` : '—'} | ${note.width}px / ${ratio(num(note.ratioToColumn))} | ${bNote ? (bNote.narrowerThanColumn ? '是' : '否') : '—'} | ${note.narrowerThanColumn ? '是' : '否'} |`);
    }
  }
  push('');
} else {
  push('## 5. 每一条 `.snote` 的逐条读数');
  push('');
  push(`⚠ 缺少 \`${path.relative(ROOT, NOTES_BEFORE).replace(/\\/g, '/')}\` 或 \`${path.relative(ROOT, NOTES_AFTER).replace(/\\/g, '/')}\`，本节未生成。`);
  push('');
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${lines.join('\n')}\n`, 'utf8');
console.log(`写出：${path.relative(ROOT, OUT).replace(/\\/g, '/')}（${lines.length} 行）`);
console.log(`before 违规页 ${before.sweep.violations.length} → after 违规页 ${after.sweep.violations.length}`);
