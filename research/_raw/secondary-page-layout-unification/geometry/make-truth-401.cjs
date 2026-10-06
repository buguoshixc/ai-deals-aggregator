#!/usr/bin/env node
/**
 * secondary-page-layout-unification · `geometry/truth-401.json` 生成器（t3 证据 · captain 指令）
 *
 * 为什么要有这份清单：t2 的 §22c 只量 `<main>` 里**文档序第一条** `.snote`（**位置口径**），
 * 于是「改动前有 48 处说明被压成 70ch」这个读数**低估**了真实缺陷面 —— 独立探针量出的是
 * **105 页 / 401 条说明，其中 156 条在改动前比主数据区窄（`before.width` 全 = 452.81px）**，
 * 而那 156 条里有 **108 条不是文档序第一条**。
 *
 * ⚠️ 本文件切出来的三个集合是**位置切分**，不要按名字读成「判据命中」（R3-2 就是从这里被读错的）：
 *   · `caughtByOldCriteria`（48）= `index === 0` 的**位置切片**（每页文档序第一条）。它与
 *     「旧口径命中」只是**数量巧合**：实测 48/48 都是**多行**说明（真实 `--dir=dist.baseline`
 *     报告里这 48 条**同时**带 `note-narrow` 与 `note-ink-narrow`）。
 *   · `onlyNewTruth`（108）= 其余 108 条 = 60 条多行 + **48 条单行**（单行说明的盒子同样被压窄）。
 *   · **实测归属**（逐条回查真实报告得出，独立于本文件的切分方式；复算工具
 *     `geometry/attribution-census.cjs`，读数 `geometry/attribution-census.json`）：
 *       ① 盒宽窄 `note-narrow`     = **156**（156 条的盒宽全 452.81，含上面那 48 条单行）
 *       ② 字迹窄 `note-ink-narrow` = **108 且 ② ⊆ ①**（多行的那 108 条）
 *     ⇒ 并集仍是 156；消费者（`geometry/gate-vs-truth.cjs:74`）只消费**两者的并集**，
 *       集合怎么切都不影响它的判读与结论。
 *   · 键名保留是**有意**的：已发布的 `truth-401.json` schema 与消费者都按这三个键读；
 *     把历史命名留着、把真实语义写在这里，比改键名安全（改键名要同步改消费者与所有引用）。
 *
 * 这份清单是**真值对照物**，有两个用途：
 *   ① 修复完成后，用它**逐条核对**新 §22c：新判据命中的说明集合必须与这里的
 *      `caughtByOldCriteria ∪ onlyNewTruth`（= 改动前 156 条窄说明）逐条对得上，
 *      而 `alreadyFine` 的 245 条（含 `archive/` 那 5 条本来正常的）**一条都不许被误报**；
 *   ② 它是 t4 独立复核的输入 —— 第三次交叉验证的锚点。
 *
 * 数据来源（两份都是**独立探针**的产物，不是被测脚本自报的）：
 *   `geometry/all-notes-before.json`（dist.baseline，1440 档）
 *   `geometry/all-notes-after.json` （dist，1440 档）
 *   交叉核对：`geometry/before.json`（wide-probe 的 48 页 note-narrow 清单）
 *
 * 用法：node …/geometry/make-truth-401.cjs
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..', '..');
const G = path.join(ROOT, 'research', '_raw', 'secondary-page-layout-unification', 'geometry');
const BEFORE_NOTES = path.join(G, 'all-notes-before.json');
const AFTER_NOTES = path.join(G, 'all-notes-after.json');
const BEFORE_PROBE = path.join(G, 'before.json');
const argOf = name => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const rel = file => path.relative(ROOT, file).replace(/\\/g, '/');

const beforeNotes = JSON.parse(fs.readFileSync(BEFORE_NOTES, 'utf8'));
const afterNotes = JSON.parse(fs.readFileSync(AFTER_NOTES, 'utf8'));
const beforeProbe = JSON.parse(fs.readFileSync(BEFORE_PROBE, 'utf8'));

const noteMap = report => {
  const map = new Map();
  for (const page of report.pages) {
    const data = page.viewports['1440'];
    for (const note of data.notes) map.set(`${page.route}#${note.index}`, { page, data, note });
  }
  return map;
};
const B = noteMap(beforeNotes);
const A = noteMap(afterNotes);

/**
 * 分类：改动前窄 ⇒ 按**位置**切分（`index === 0` = 文档序第一条；其余 = 第 2 条及以后）；不窄 ⇒ 对照组。
 *
 * ⚠️ 两个返回键名是**历史命名**，不要按字面读成「旧口径（盒宽 / textWidth）的命中集合」：
 *   位置切片 48 与「旧口径命中」只是数量巧合（实测 48/48 全为多行，真实报告里同时带两个窄码）；
 *   实测归属：盒宽窄 ① = 156（盒宽全 452.81，含 48 条单行）· 字迹窄 ② = 108 ⊆ ①。
 *   键名保留 = 不破坏已发布 JSON 的 schema 与消费者（后者只读并集）。
 */
const classify = (bNote, index) => {
  if (!bNote || !bNote.narrowerThanColumn) return 'alreadyFine';
  return index === 0 ? 'caughtByOldCriteria' : 'onlyNewTruth';
};

const pages = [];
const sets = { caughtByOldCriteria: [], onlyNewTruth: [], alreadyFine: [] };
let narrowBefore = 0;
let narrowAfter = 0;

for (const page of afterNotes.pages) {
  const data = page.viewports['1440'];
  if (!data.noteCount) continue;
  const record = { route: page.route, regionWidth: data.regionWidth, regionSel: data.regionSel, mainWidth: data.mainWidth, noteCount: data.noteCount, notes: [] };
  for (const note of data.notes) {
    const b = B.get(`${page.route}#${note.index}`);
    const bNote = b ? b.note : null;
    const classification = classify(bNote, note.index);
    if (bNote && bNote.narrowerThanColumn) narrowBefore += 1;
    if (note.narrowerThanColumn) narrowAfter += 1;
    const entry = {
      index: note.index,
      position: note.position,
      classification,
      after: {
        width: note.width, left: note.left, right: note.right,
        ratioToColumn: note.ratioToColumn, ratioToRegion: note.ratioToRegion,
        maxWidth: note.maxWidth, narrow: note.narrowerThanColumn, clipped: note.clipped
      },
      before: bNote ? {
        width: bNote.width, left: bNote.left, right: bNote.right,
        ratioToColumn: bNote.ratioToColumn, ratioToRegion: bNote.ratioToRegion,
        maxWidth: bNote.maxWidth, narrow: bNote.narrowerThanColumn, clipped: bNote.clipped
      } : null,
      text: note.text
    };
    record.notes.push(entry);
    sets[classification].push({ route: page.route, index: note.index, beforeWidth: bNote ? bNote.width : null, afterWidth: note.width, ratioAfter: note.ratioToColumn });
  }
  pages.push(record);
}

/**
 * 交叉核对：wide-probe（另一支独立探针）报的 48 页 note-narrow 清单，与这里的 **index===0 位置切片**
 * 页集合必须一致 —— 两支独立口径在「哪 48 页的文档序第一条被压窄」这件事上互为佐证。
 * ⚠️ 这**不是**在核对「旧口径（盒宽）命中集」：盒宽命中集实测是 **156 条**（见文件头 ⚠️ 段）。
 */
const probeNarrowRoutes = [...new Set(beforeProbe.sweep.violations
  .filter(row => (row.codes || []).includes('note-narrow'))
  .map(row => row.route))].sort();
const truthOldRoutes = [...new Set(sets.caughtByOldCriteria.map(row => row.route))].sort();
const onlyInProbe = probeNarrowRoutes.filter(route => !truthOldRoutes.includes(route));
const onlyInTruth = truthOldRoutes.filter(route => !probeNarrowRoutes.includes(route));

const archiveControl = sets.alreadyFine.filter(row => row.route === 'archive/');

/**
 * ⚠️ 必须分开的两个口径（本项目踩过一次坑，写在这里防止再被读错）：
 *   · `pagesWithNotes` = **有说明的页面数**（105）—— 与"缺陷面"无关；
 *   · `pagesCarryingNarrowNotes` = **含有窄说明的页面数**（48）—— 这才是缺陷面的页数。
 *   156 条窄说明**全部落在那 48 页上**（其中 3 页各 2 条、43 页各 3 条、feeds/ 8 条、changes/ 13 条），
 *   另外 57 个"有说明但没被压窄"的页面完全是正常页。把 105 当成缺陷页数是错的。
 */
const narrowRows = [...sets.caughtByOldCriteria, ...sets.onlyNewTruth];
const narrowPerPage = {};
for (const row of narrowRows) narrowPerPage[row.route] = (narrowPerPage[row.route] || 0) + 1;
const narrowPerPageHistogram = {};
for (const count of Object.values(narrowPerPage)) narrowPerPageHistogram[count] = (narrowPerPageHistogram[count] || 0) + 1;
const pagesCarryingNarrowNotes = Object.keys(narrowPerPage).length;

const report = {
  what: '改动后产物（dist）里**每一条** `.snote` 的逐条真值（1440 档）。改动前的 156 条窄说明按**位置**切成两批（`index===0` 每页文档序第一条 / 其余），另加对照组；⚠️ 这是位置切分，不是判据命中集（盒宽窄实测 ①=156，含 48 条单行；字迹窄 ②=108 ⊆ ① —— 消费者只消费并集）',
  at: new Date().toISOString(),
  generatedBy: 'research/_raw/secondary-page-layout-unification/geometry/make-truth-401.cjs',
  viewport: 1440,
  source: {
    'all-notes-before.json': { path: rel(BEFORE_NOTES), sha256: sha256(BEFORE_NOTES), dir: beforeNotes.dir, label: beforeNotes.label },
    'all-notes-after.json': { path: rel(AFTER_NOTES), sha256: sha256(AFTER_NOTES), dir: afterNotes.dir, label: afterNotes.label },
    'before.json（交叉核对用）': { path: rel(BEFORE_PROBE), sha256: sha256(BEFORE_PROBE), probeNote: 'wide-probe 的 48 页 note-narrow 清单' }
  },
  totals: {
    pagesScanned: afterNotes.routesTotal,
    pagesWithNotes: afterNotes.counts.pagesWithAnyNote,
    pagesWithMultiNotes: afterNotes.counts.pagesWithMultiNotes,
    maxNotesOnOnePage: afterNotes.counts.maxNotesOnOnePage,
    notes: pages.reduce((sum, page) => sum + page.notes.length, 0),
    narrowBefore, narrowAfter,
    caughtByOldCriteria: sets.caughtByOldCriteria.length,
    onlyNewTruth: sets.onlyNewTruth.length,
    alreadyFine: sets.alreadyFine.length,
    // ⚠️ 「有说明的页数」与「含窄说明的页数」是两个口径，别混：
    pagesCarryingNarrowNotes,
    pagesWithNotesButNoNarrowNotes: afterNotes.counts.pagesWithAnyNote - pagesCarryingNarrowNotes,
    narrowPerPageHistogram
  },
  invariants: {
    '窄说明 before = 位置切片(index===0) + 其余（并集，不是判据命中集）': sets.caughtByOldCriteria.length + sets.onlyNewTruth.length === narrowBefore,
    '窄说明 after = 0（修复完整）': narrowAfter === 0,
    '三类之和 = 总条数': sets.caughtByOldCriteria.length + sets.onlyNewTruth.length + sets.alreadyFine.length === pages.reduce((sum, page) => sum + page.notes.length, 0),
    'wide-probe 的 48 页 note-narrow 与这里的 index===0 位置切片页集合逐条一致': onlyInProbe.length === 0 && onlyInTruth.length === 0,
    'archive/ 的 5 条（本来正常）留在 alreadyFine 里': archiveControl.length === 5,
    '含窄说明的页面数 = 位置切片页集合大小（156 条窄说明全部落在那 48 页上）': pagesCarryingNarrowNotes === truthOldRoutes.length,
    archiveControlCount: archiveControl.length,
    probeNarrowRoutes: probeNarrowRoutes.length,
    truthOldRoutes: truthOldRoutes.length,
    onlyInProbe, onlyInTruth
  },
  usageForNewGate: {
    '新 §22c 在 dist.baseline 上应当命中的**条集合**': 'sets.caughtByOldCriteria ∪ sets.onlyNewTruth（156 条；两个键是**位置切分**，别把 48 读成"旧口径命中"——实测盒宽窄 ①=156、字迹窄 ②=108⊆①）',
    '新 §22c 在 dist.baseline 上应当命中的**页集合**': `${pagesCarryingNarrowNotes} 页（= 156 条窄说明**所在**的页面；**不是** 105 —— 105 是"有说明的页面数"，与缺陷面无关）`,
    '新 §22c 不应当误报的集合': 'sets.alreadyFine（245 条，含 archive/ 的 5 条对照组）+ 另外 57 个"有说明但没被压窄"的页面',
    '注意事项': '本清单是**改动后产物**的逐条真值；在 dist.baseline 上核对新判据时，用 before 字段，在 dist 上核对时，用 after 字段。核对请用集合差（geometry/gate-vs-truth.cjs），不要只看数字。注意 §22c 现在按**并集**判窄（note-narrow ∪ note-ink-narrow），接受码集合与实测码分布见 geometry/attribution-census.json'
  },
  sets: {
    caughtByOldCriteria: sets.caughtByOldCriteria,
    onlyNewTruth: sets.onlyNewTruth,
    alreadyFine: sets.alreadyFine
  },
  archiveControl,
  pages
};

/**
 * 输出目标：默认仍是 `geometry/truth-401.json`（**值语义不变**）。
 * `--out=<path>` 用来把**同一份数值**写到别的路径做等价对照（例如 t25 的「重生成后数值是否逐项相同」
 * 检验）——这样就不必为了让脚本可复查而去覆盖已发布的那份真值（t21 正在只读消费它）。
 */
const OUT = argOf('out') ? path.resolve(argOf('out')) : path.join(G, 'truth-401.json');
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`真值清单：${rel(OUT)}${OUT === path.join(G, 'truth-401.json') ? '' : '（--out= 指定：**未**覆盖 geometry/truth-401.json）'}`);
console.log(`总条数 ${report.totals.notes} · 页数（有说明）${report.totals.pagesWithNotes} · 最多 ${report.totals.maxNotesOnOnePage} 条/页`);
console.log(`改动前窄说明 ${narrowBefore} 条 → 改动后 ${narrowAfter} 条`);
console.log(`  · **位置切片**（文档序第一条 ⇒ index===0）**${sets.caughtByOldCriteria.length} 条**（历史键名 caughtByOldCriteria；实测这 48 条全是多行，别读成"旧口径命中"）`);
console.log(`  · 其余（第 2 条及以后）        **${sets.onlyNewTruth.length} 条**（含 48 条单行；历史键名 onlyNewTruth）`);
console.log(`  · 本来正常（对照组）          ${sets.alreadyFine.length} 条（其中 archive/ ${archiveControl.length} 条）`);
console.log(`实测归属（独立口径，见 geometry/attribution-census.cjs）：盒宽窄 ①=156（盒宽全 452.81，含 48 条单行）· 字迹窄 ②=108⊆① ⇒ 消费者按并集判窄（gate-vs-truth.cjs:74）`);
console.log(`不变量：${Object.entries(report.invariants).filter(([, v]) => typeof v === 'boolean').map(([k, v]) => `${v ? '✓' : '✗'} ${k}`).join(' · ')}`);
console.log(`sha256 ${sha256(OUT)}`);
