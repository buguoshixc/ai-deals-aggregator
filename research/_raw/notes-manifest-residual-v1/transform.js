#!/usr/bin/env node
/**
 * t14 机械改造（Tier-3，住 .arch-v1/）—— 把 `.snote` 构造点改成「先登记、后输出」。
 *
 * 每个模块：① 插入 `noteIn(x)` 辅助（x 可以是 ctx 对象，也可以是 `note` 函数本身；
 * 与 lib/vendor-page.js 同形，未注入时恒等）；② 把每一处 `<p class="snote…">…</p>` 包成
 * `noteIn(CTX)({kind, slot, classes, declaredBy}, `…`)`；③ build-local.js 注入
 * `note: noteDeclarerFor(route)`；④ 删掉对应的台账登记。
 *
 * 纪律：每个替换断言**恰好命中 1 次**；span 数与 ctx 表达式数必须相等。
 * 用法：node .arch-v1/transform.js <step>
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const step = process.argv[2];

const HELPER = declaredBy => `
/**
 * 说明登记（notes-manifest-residual-v1）：\`.snote\` 构造点不再直接写进页面 —— 每个构造点在
 * 产出那一段 HTML 的**同一次调用**里登记（\`ctx.note\` 由 \`build-local.js\` 按 route 注入）。
 * 与 \`lib/vendor-page.js\` 同形：参数可以是 ctx 对象（含 \`.note\`），也可以是 note 函数本身；
 * 都没有时是恒等函数（断言 / selftest 路径不产出页面）。
 */
const NOTES_DECLARED_BY = '${declaredBy}';
const noteIn = source => {
  if (typeof source === 'function') return source;
  if (source && typeof source.note === 'function') return source.note;
  return (decl, html) => html;
};
`;

function spansOf(text) {
  const out = [];
  const re = /<p class="snote([^"]*)"/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const start = m.index;
    const endMark = text.indexOf('</p>', start);
    if (endMark < 0) throw new Error('span 没有闭合的 </p>');
    out.push({ start, end: endMark + 4, classes: ('snote' + (m[1] || '')).trim(), text: text.slice(start, endMark + 4) });
  }
  return out;
}

const kindOf = classes => (/pnoscript/.test(classes) ? 'noscript-hint'
  : /(awarn|chgwarn)/.test(classes) ? 'page-note-warn'
    : /(pnone|mnone)/.test(classes) ? 'page-note-empty'
      : /mcount/.test(classes) ? 'page-note-count'
        : 'page-note');

function wrapSpans(rel, mode, ctxExprs) {
  const file = path.join(ROOT, rel);
  let text = fs.readFileSync(file, 'utf8');
  const spans = spansOf(text);
  if (spans.length !== ctxExprs.length) {
    throw new Error(`${rel}：span 数 ${spans.length} ≠ ctx 表达式数 ${ctxExprs.length}`);
  }
  for (let i = spans.length - 1; i >= 0; i--) {
    const span = spans[i];
    const decl = `{ kind: '${kindOf(span.classes)}', slot: 'main-snote', classes: '${span.classes}', declaredBy: NOTES_DECLARED_BY }`;
    const replacement = mode === 'template'
      // span 原文逐字放进嵌套模板：里面的 `${…}` 仍是插值、嵌套反引号仍是嵌套模板。
      ? '${noteIn(' + ctxExprs[i] + ')(' + decl + ', `' + span.text + '`)}'
      : 'noteIn(' + ctxExprs[i] + ')(' + decl + ', ' + span.text + ')';
    text = text.slice(0, span.start) + replacement + text.slice(span.end);
  }
  fs.writeFileSync(file, text, 'utf8');
  console.log(`  ${rel}：包了 ${spans.length} 处（${mode}）`);
  return spans.length;
}

function insertHelper(rel, anchor, declaredBy) {
  const file = path.join(ROOT, rel);
  let text = fs.readFileSync(file, 'utf8');
  if (text.includes('NOTES_DECLARED_BY')) throw new Error(`${rel}: helper 已存在`);
  if (!text.includes(anchor)) throw new Error(`${rel}: 锚点找不到「${anchor}」`);
  fs.writeFileSync(file, text.replace(anchor, anchor + '\n' + HELPER(declaredBy)), 'utf8');
  console.log(`  ${rel}：helper 已插入`);
}

function replaceOnce(rel, from, to, label) {
  const file = path.join(ROOT, rel);
  const text = fs.readFileSync(file, 'utf8');
  const hits = text.split(from).length - 1;
  if (hits !== 1) throw new Error(`${rel}: ${label} 命中 ${hits} 次（要求恰好 1 次）\n  from=${from.slice(0, 140)}`);
  fs.writeFileSync(file, text.replace(from, to), 'utf8');
  console.log(`  ${rel}：${label} ✓`);
}

const BUILD = 'scripts/tools/build-local.js';
let total = 0;

if (step === 'data-docs') {
  insertHelper('scripts/lib/data-docs.js', "const pageKinds = require('./page-kinds');", 'lib/data-docs.js');
  total += wrapSpans('scripts/lib/data-docs.js', 'template', Array(8).fill('ctx'));
  replaceOnce(BUILD, '    manifest: dataManifest,',
    '    note: noteDeclarerFor(dataDocs.DATA_DOCS_ROUTE),\n    manifest: dataManifest,', '注入 note（/docs/data/）');
  replaceOnce(BUILD,
    "    notePage(dataDocs.DATA_DOCS_ROUTE, { kind: 'data-docs' });\n    noteUntracked(dataDocs.DATA_DOCS_ROUTE, {\n      family: 'data-docs',\n      owner: 'lib/data-docs.js',\n      structural: 'lib/data-docs.js:794（DATA_DOCS_DESCRIPTION 口径说明，无条件输出）',\n      minNotes: 1\n    });",
    "    notePage(dataDocs.DATA_DOCS_ROUTE, { kind: 'data-docs' });", '删台账（docs/data）');
}

if (step === 'archive') {
  insertHelper('scripts/lib/archive.js', "'use strict';", 'lib/archive.js');
  total += wrapSpans('scripts/lib/archive.js', 'template', Array(6).fill('ctx'));
  replaceOnce(BUILD,
    "    const indexBody = archiveLib.renderArchiveIndex(archives, { prefix: '../', siteUrl: SITE_URL });",
    "    const indexBody = archiveLib.renderArchiveIndex(archives, {\n      prefix: '../', siteUrl: SITE_URL, note: noteDeclarerFor(archiveLib.ARCHIVE_INDEX_ROUTE)\n    });",
    '注入 note（/archive/ 索引）');
  replaceOnce(BUILD,
    "    notePage(archiveLib.ARCHIVE_INDEX_ROUTE, { kind: 'archive-index' });\n    noteUntracked(archiveLib.ARCHIVE_INDEX_ROUTE, {\n      family: 'archive-index',\n      owner: 'lib/archive.js',\n      structural: 'lib/archive.js:589 与 601（ARCHIVE_DESCRIPTION 与资料入口说明，均无条件输出）',\n      minNotes: 2\n    });",
    "    notePage(archiveLib.ARCHIVE_INDEX_ROUTE, { kind: 'archive-index' });", '删台账（/archive/ 索引）');
}

if (step === 'plans-hub') {
  insertHelper('scripts/lib/plans-hub-page.js', "'use strict';", 'lib/plans-hub-page.js');
  for (const [sig, label] of [
    ['function codingSectionHtml(view, prefix) {', 'codingSectionHtml'],
    ['function apiSectionHtml(view, prefix) {', 'apiSectionHtml'],
    ['function changesSectionHtml(view, prefix) {', 'changesSectionHtml'],
    ['function currentOffersHtml(view, prefix) {', 'currentOffersHtml']
  ]) {
    replaceOnce('scripts/lib/plans-hub-page.js', sig, sig.replace('(view, prefix) {', '(view, prefix, note = null) {'), `签名 +note（${label}）`);
  }
  replaceOnce('scripts/lib/plans-hub-page.js', '${codingSectionHtml(view, prefix)}', '${codingSectionHtml(view, prefix, ctx.note)}', '接线 coding');
  replaceOnce('scripts/lib/plans-hub-page.js', '${apiSectionHtml(view, prefix)}', '${apiSectionHtml(view, prefix, ctx.note)}', '接线 api');
  replaceOnce('scripts/lib/plans-hub-page.js',
    '${changesSectionHtml({ ...view, apiPlanHistoryStore: ctx.apiPlanHistoryStore || null, apiPlans: ctx.apiPlans || [] }, prefix)}',
    '${changesSectionHtml({ ...view, apiPlanHistoryStore: ctx.apiPlanHistoryStore || null, apiPlans: ctx.apiPlans || [] }, prefix, ctx.note)}',
    '接线 changes');
  replaceOnce('scripts/lib/plans-hub-page.js',
    "`${currentOffersHtml(view, prefix)}\\n`", "`${currentOffersHtml(view, prefix, ctx.note)}\\n`", '接线 offers');
  total += wrapSpans('scripts/lib/plans-hub-page.js', 'template',
    ['note', 'note', 'note', 'note', 'note', 'note', 'note', 'note', 'ctx', 'ctx', 'ctx']);
  replaceOnce(BUILD, '  const plansHubHtml = renderPlansHubShell(html, {',
    '  const plansHubHtml = renderPlansHubShell(html, {\n    note: noteDeclarerFor(plansHubPage.PLANS_HUB_ROUTE),', '注入 note（/plans/）');
  replaceOnce(BUILD,
    "  notePage(plansHubPage.PLANS_HUB_ROUTE, { kind: 'plans-hub' });\n  noteUntracked(plansHubPage.PLANS_HUB_ROUTE, {\n    family: 'plans-hub',\n    owner: 'lib/plans-hub-page.js',\n    structural: 'lib/plans-hub-page.js:313（PLANS_HUB_DESCRIPTION 口径说明，无条件输出）',\n    minNotes: 1\n  });",
    "  notePage(plansHubPage.PLANS_HUB_ROUTE, { kind: 'plans-hub' });", '删台账（/plans/）');
}

if (step === 'plans-page') {
  insertHelper('scripts/lib/plans-page.js', "const planHistory = require('./plan-history');", 'lib/plans-page.js');
  total += wrapSpans('scripts/lib/plans-page.js', 'template', Array(11).fill('opts'));
  replaceOnce(BUILD,
    '  const body = plansPage.plansPageBody(plans, {\n    providerTable,',
    '  const body = plansPage.plansPageBody(plans, {\n    note: noteDeclarerFor(plansPage.PLANS_ROUTE),\n    providerTable,', '注入 note（/plans/coding/）');
  replaceOnce(BUILD,
    "  notePinned('plans/coding/', {\n    kind: 'noscript-hint', slot: 'main-snote', classes: 'snote pnoscript',\n    declaredBy: 'build-local.js:renderPlansPage（组装点登记）'\n  }, {\n    source: 'lib/plans-page.js:1013',\n    reason: '无 JS 可读性是这一页的产品口径（筛选/搜索/排序全由内联脚本建控件），'\n      + '而构造点在范围之外的模块里 —— 先按容器签名钉住，下一轮接管构造点时改成 noteDeclare()'\n  });\n  notePage('plans/coding/', { kind: 'plans' });\n  noteUntracked('plans/coding/', {\n    family: 'plans-coding',\n    owner: 'lib/plans-page.js',\n    structural: 'lib/plans-page.js:1010（PLANS_DESCRIPTION 口径说明，无条件输出）',\n    minNotes: 1\n  });",
    "  notePage('plans/coding/', { kind: 'plans' });", '删 pin + 台账（/plans/coding/）');
  // /changes/ 上的套餐变化块也由 plans-page.js 渲染 —— 绑定 changes/ 的登记入口
  replaceOnce(BUILD,
    '      plansById: context.plansById || null\n    })',
    '      plansById: context.plansById || null,\n      note: noteDeclarerFor(\'changes/\')\n    })', '注入 note（/changes/ 的套餐块）');
}

if (step === 'api-plans') {
  insertHelper('scripts/lib/api-plans-page.js', "const plansPage = require('./plans-page');", 'lib/api-plans-page.js');
  replaceOnce('scripts/lib/api-plans-page.js', 'function freeTierSectionHtml(plans) {', 'function freeTierSectionHtml(plans, note = null) {', '签名 +note（freeTier）');
  replaceOnce('scripts/lib/api-plans-page.js', 'function crossLinkHtml(prefix) {', 'function crossLinkHtml(prefix, note = null) {', '签名 +note（crossLink）');
  replaceOnce('scripts/lib/api-plans-page.js', 'function apiChangesBlockHtml(store, plans, { limit = 12 } = {}) {', 'function apiChangesBlockHtml(store, plans, { limit = 12 } = {}, note = null) {', '签名 +note（apiChanges）');
  replaceOnce('scripts/lib/api-plans-page.js', '${freeTierSectionHtml(plans)}', '${freeTierSectionHtml(plans, opts.note)}', '接线 freeTier');
  replaceOnce('scripts/lib/api-plans-page.js', '${apiChangesBlockHtml(opts.historyStore || null, plans)}', '${apiChangesBlockHtml(opts.historyStore || null, plans, {}, opts.note)}', '接线 apiChanges');
  replaceOnce('scripts/lib/api-plans-page.js', '${crossLinkHtml(prefix)}', '${crossLinkHtml(prefix, opts.note)}', '接线 crossLink');
  total += wrapSpans('scripts/lib/api-plans-page.js', 'template',
    ['note', 'note', 'note', 'note', 'note', 'opts', 'opts', 'opts', 'opts', 'opts', 'opts', 'opts']);
  replaceOnce(BUILD,
    '  const apiPlansHtml = renderApiPlansPage(apiPlansStore, html, {',
    '  const apiPlansHtml = renderApiPlansPage(apiPlansStore, html, {\n    note: noteDeclarerFor(apiPlansPage.API_PLANS_ROUTE),', '注入 note（/plans/api/）');
  replaceOnce(BUILD,
    "  notePage(apiPlansPage.API_PLANS_ROUTE, { kind: 'api-plans' });\n  noteUntracked(apiPlansPage.API_PLANS_ROUTE, {\n    family: 'api-plans-index',\n    owner: 'lib/api-plans-page.js',\n    structural: 'lib/api-plans-page.js:613（API_PLANS_DESCRIPTION 口径说明，无条件输出）',\n    minNotes: 1\n  });",
    "  notePage(apiPlansPage.API_PLANS_ROUTE, { kind: 'api-plans' });", '删台账（/plans/api/）');
}

if (step === 'models') {
  insertHelper('scripts/lib/models-page.js', "'use strict';", 'lib/models-page.js');
  total += wrapSpans('scripts/lib/models-page.js', 'template', Array(12).fill('ctx'));
  replaceOnce(BUILD, '    const modelsIndexCtx = { ...modelsCtx, prefix: \'../\', __refCache: new Map() };',
    '    const modelsIndexCtx = {\n      ...modelsCtx, prefix: \'../\', __refCache: new Map(),\n      note: noteDeclarerFor(modelsPage.MODELS_INDEX_ROUTE)\n    };', '注入 note（/models/ 索引）');
  replaceOnce(BUILD, "      const detailCtx = { ...modelsCtx, prefix, __refCache: new Map() };",
    "      const detailCtx = { ...modelsCtx, prefix, __refCache: new Map(), note: noteDeclarerFor(route) };", '注入 note（模型详情页）');
  replaceOnce(BUILD,
    "    notePage(modelsPage.MODELS_INDEX_ROUTE, { kind: 'models-index' });\n    noteUntracked(modelsPage.MODELS_INDEX_ROUTE, {\n      family: 'models-index',\n      owner: 'lib/models-page.js',\n      structural: 'lib/models-page.js:845（MODELS_INDEX_DESCRIPTION 口径说明，无条件输出）',\n      minNotes: 1\n    });",
    "    notePage(modelsPage.MODELS_INDEX_ROUTE, { kind: 'models-index' });", '删台账（/models/ 索引）');
  replaceOnce(BUILD,
    "      notePage(route, { kind: 'model' });\n      noteUntracked(route, {\n        family: 'models-detail',\n        owner: 'lib/models-page.js',\n        structural: 'lib/models-page.js:1112 与 1123（计价条目口径 / 派生视图说明，均无条件输出）',\n        minNotes: 2\n      });",
    "      notePage(route, { kind: 'model' });", '删台账（模型详情页）');
}

if (step === 'render-core') {
  total += wrapSpans('index.html', 'concat', Array(7).fill('note'));
  replaceOnce('index.html', 'function changesPageHtml(radar, prefix) {',
    'function changesPageHtml(radar, prefix, note = null) {\n      // 说明登记（notes-manifest-residual-v1）：本函数产出的每一条 `.snote` 都要登记；\n      // `note` 由构建期注入（`build-local.js` 的 renderChangesPage 按 changes/ 路由绑定）。\n      const noteIn = typeof note === \'function\' ? note : (decl, html) => html;',
    '签名 +note（changesPageHtml）');
  replaceOnce(BUILD, "  const marked = markChangesRows(renderCore.changesPageHtml(radar, '../'), itemListRecords, changes.renderOrderOf(radar).length);",
    "  const marked = markChangesRows(renderCore.changesPageHtml(radar, '../', noteDeclarerFor('changes/')), itemListRecords, changes.renderOrderOf(radar).length);",
    '注入 note（/changes/ 的 RENDER-CORE）');
  replaceOnce(BUILD,
    "  notePage('changes/', { kind: 'changes' });\n  noteUntracked('changes/', {\n    family: 'changes',\n    owner: 'index.html 的 RENDER-CORE 区块（changesPageHtml）+ lib/plans-page.js + lib/api-plans-page.js',\n    structural: 'index.html:3930（分栏口径说明 N.scope，无条件输出）',\n    minNotes: 2\n  });",
    "  notePage('changes/', { kind: 'changes' });", '删台账（/changes/）');
  // /changes/ 上的 API 变化块（真实文本见 build-local.js:1584）
  replaceOnce(BUILD,
    "    ? apiPlansPage.apiPlanChangesPageBlockHtml(context.apiPlanChanges, { prefix: '../', providerTable: context.providerTable || null })",
    "    ? apiPlansPage.apiPlanChangesPageBlockHtml(context.apiPlanChanges, {\n      prefix: '../', providerTable: context.providerTable || null, note: noteDeclarerFor('changes/')\n    })",
    '注入 note（/changes/ 的 API 块）');
}

console.log(`完成 ${step}：共包 ${total} 处`);
