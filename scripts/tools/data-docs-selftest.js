#!/usr/bin/env node
/**
 * v3.0 Data Docs / 数据出口演练（离线、零依赖、可重跑）。
 *
 * 演练题面 §8 的三条 Data Docs 牙，外加两条结构性承诺：
 *   · #12 文档里的 JSON endpoint 不存在 → 红；
 *   · #13 schemaVersion 文档与真实数据不一致 → 红；
 *   · #14 Dataset Manifest 数量与真实数据不一致 → 红；
 *   · License 状态如实反映仓库现状（没有 LICENSE 就写"需要项目所有者决定"）；
 *   · Manifest 可复现（两次构建逐字节相同）。
 *
 * 对账用的"真实数据"直接来自仓库里的文件（不是硬编码样例）：
 * 每个数据集的 schemaVersion 与记录数都是从文件现场读出来再与 Manifest 比较的。
 */

'use strict';

const fs = require('fs');
const path = require('path');

const docs = require('../lib/data-docs');
const dealPlanLinks = require('../lib/deal-plan-links');
const pageKinds = require('../lib/page-kinds');

const ROOT = path.join(__dirname, '..', '..');
const SITE_URL = 'https://buguoshixc.github.io/ai-deals-aggregator/';

/**
 * 产物目录：默认 `dist/`，可用 `--dir=dist.qc-gate` 指到别的构建输出。
 *
 * 为什么要有这个参数（F-v3-export-002）：原先把 `dist` 写死，于是审计/分支成员用
 * `--out=dist.audit-*` 构建出来的产物**永远不会**被这一步检查 —— 它检查的始终是另一份目录。
 * 有了参数，同一份自测既能验默认发布产物，也能验任意一次构建的现场。
 */
const dirArg = process.argv.find(arg => arg.startsWith('--dir='));
/**
 * `--allow-missing-dist`：**只有显式声明为可选诊断时**才允许「缺产物 ⇒ 跳过」。
 * 默认（门禁与本地一样）缺产物 ⇒ **非 0** —— 见下面 `requireDist()`。
 */
const ALLOW_MISSING_DIST = process.argv.includes('--allow-missing-dist');
const DIST = path.resolve(ROOT, dirArg ? dirArg.slice('--dir='.length) : 'dist');

/** 必需的产物缺失时：显式允许 → OPTIONAL DIAGNOSTIC（通过）；否则记红并返回 false */
function requireDist(what, marker) {
  const file = path.join(DIST, marker);
  if (fs.existsSync(file)) return true;
  if (ALLOW_MISSING_DIST) {
    check(`⚠️ OPTIONAL DIAGNOSTIC（--allow-missing-dist）：跳过 ${what} 的现场检查（缺 ${marker}）`, true);
    return false;
  }
  check(`缺少必需产物：${what} —— 找不到 ${path.relative(ROOT, file) || file}` +
    `（先跑 npm run build，或用 --dir=<构建输出> 指到那份产物；只有显式 --allow-missing-dist 才允许跳过）`, false);
  return false;
}

/** 产物内全部文件的相对路径（方向 2 的扫描输入：读盘，不读任何清单） */
function listFiles(dir) {
  const out = [];
  const walk = (abs, rel) => {
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      const nextRel = rel ? `${rel}/${entry.name}` : entry.name;
      const nextAbs = path.join(abs, entry.name);
      if (entry.isDirectory()) walk(nextAbs, nextRel);
      else out.push(nextRel);
    }
  };
  if (fs.existsSync(dir)) walk(dir, '');
  return out.sort();
}

let passed = 0;
const failures = [];

function check(name, ok, detail) {
  if (ok) { passed++; console.log(`  ✓ ${name}`); }
  else { failures.push(name); console.log(`  ✗ ${name}${detail ? ` —— ${detail}` : ''}`); }
}

function section(title) {
  console.log(`\n${title}`);
}

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

/* ------------------------------------------------------------------ */
/* 数据集清单：**唯一注册表**（`lib/data-docs.js` 的 `PUBLIC_DATASETS`）  */
/* ------------------------------------------------------------------ */
//
// 这里原本有 SOURCE_OF / ESSENTIAL / CATEGORY_OF 三张硬编码清单 —— 与构建期那份数据集数组
// 各写一份，正是 P2-25（`F-v3-export-001`）说的「清单各自漂移」。现在：
//   · 有哪些数据集、属于哪一类、发布地址是什么、真值文件在哪，全部读注册表；
//   · 本文件只保留**取值**逻辑（怎么从真值文件里读出 schemaVersion / updatedAt / count）——
//     那是"怎么验证"，不是"清单"，按 id 分支写在这里。
const REGISTRY = docs.PUBLIC_DATASETS;

/** 注册表 + 真值文件 → 用于对账的数据集描述（缺真值文件返回 null，由调用方如实报红） */
function datasetOf(entry) {
  if (!entry.source || !exists(entry.source)) return null;
  const payload = readJson(entry.source);
  const base = { ...entry, schemaVersion: payload.schemaVersion };
  if (entry.id === 'deal-plan-links') {
    // `updatedAt` 与 `count` 在这份文件里是**构建期派生**的（手写即校验错误），
    // 因此这里用同一支库函数现算，而不是自己写一个日期。
    return { ...base, updatedAt: dealPlanLinks.canonicalUpdatedAt(payload), count: (payload.links || []).length };
  }
  if (/-history\.json$/.test(entry.url)) {
    return { ...base, updatedAt: payload.startedAt || null, count: (payload.events || []).length };
  }
  if (entry.id === 'model-registry-links') {
    return { ...base, updatedAt: payload.updatedAt || null, count: (payload.links || []).length };
  }
  const listKey = entry.url === 'models.json' ? 'models' : (entry.url === 'deals.json' ? 'deals' : 'plans');
  const list = Array.isArray(payload[listKey]) ? payload[listKey] : [];
  return {
    ...base,
    updatedAt: payload.updatedAt || null,
    count: typeof payload.count === 'number' ? payload.count : list.length
  };
}

const missingSources = REGISTRY.filter(entry => !entry.source || !exists(entry.source))
  .map(entry => `${entry.id} → ${entry.source}`);
const datasets = REGISTRY.map(datasetOf).filter(Boolean);
const manifest = docs.buildDatasetManifest(datasets);

const actualSchemaVersions = {};
const actualCounts = {};
const actualUpdatedAt = {};
for (const dataset of datasets) {
  actualSchemaVersions[dataset.id] = dataset.schemaVersion;
  actualCounts[dataset.id] = dataset.count;
  actualUpdatedAt[dataset.id] = dataset.updatedAt;
}

// endpoint 的"存在性"判据来自注册表：注册表同时声明了发布地址与真值文件，这里不再另写一张表。
const SOURCE_BY_URL = new Map(REGISTRY.map(entry => [entry.url, entry.source]));
const endpointExists = url => {
  const source = SOURCE_BY_URL.get(url);
  return Boolean(source) && exists(source);
};
const licensePresent = ['LICENSE', 'LICENSE.md', 'COPYING'].some(file => exists(file));
const license = licensePresent
  ? { status: 'present', file: ['LICENSE', 'LICENSE.md', 'COPYING'].find(file => exists(file)) }
  : { status: 'absent' };

const ctx = {
  manifest, license, siteUrl: SITE_URL, prefix: '../../',
  endpointExists, actualSchemaVersions, actualCounts, actualUpdatedAt
};

function fullPage() {
  return docs.renderDataDocsPage(ctx)
    + docs.dataDocsJsonLd(ctx)
      .map(data => `<script type="application/ld+json">${JSON.stringify(data)}</script>`).join('');
}

/* ================================================================== */
section('① Manifest：形状与可复现');
/* ================================================================== */

check(`Manifest 覆盖 ${datasets.length} 份真实数据集`,
  manifest.count === datasets.length && manifest.datasets.length === datasets.length);
check(`唯一注册表 PUBLIC_DATASETS 声明了 ${REGISTRY.length} 份数据集，且每一份真值文件都在仓库里`,
  missingSources.length === 0 && datasets.length === REGISTRY.length && REGISTRY.length === manifest.count,
  missingSources.length ? `缺真值文件：${missingSources.join('；')}` : `${REGISTRY.length} 份`);
check('Manifest 自身形状零问题', docs.assertManifestShape(manifest).length === 0,
  docs.assertManifestShape(manifest).slice(0, 2).join('；'));
check('Manifest 两次构建逐字节相同（按 id 排序）',
  JSON.stringify(docs.buildDatasetManifest(datasets)) === JSON.stringify(manifest));
check('schemaVersion 与真实文件一致', docs.assertSchemaVersions(manifest, actualSchemaVersions).length === 0,
  docs.assertSchemaVersions(manifest, actualSchemaVersions).slice(0, 2).join('；'));
check('记录数与真实文件一致', docs.assertManifestCounts(manifest, actualCounts).length === 0,
  docs.assertManifestCounts(manifest, actualCounts).slice(0, 2).join('；'));
check('每个 endpoint 在仓库里都真实存在', docs.assertEndpointsExist(manifest, endpointExists).length === 0,
  docs.assertEndpointsExist(manifest, endpointExists).slice(0, 2).join('；'));
check('updatedAt 与真实文件逐字段一致（含时间形状）', docs.assertUpdatedAt(manifest, actualUpdatedAt).length === 0,
  docs.assertUpdatedAt(manifest, actualUpdatedAt).slice(0, 2).join('；'));
check('六个类别齐全（deals / coding plans / api pricing / models / relationships / history）',
  docs.DATASET_CATEGORIES.every(category => manifest.datasets.some(dataset => dataset.category === category.key))
  && docs.DATASET_CATEGORIES.length === 6);
check('两种时间形状都被真实数据覆盖：deals 是真实时刻，plans/api/models 是日期规范化',
  docs.timeShapeOf(manifest.datasets.find(d => d.id === 'deals').updatedAt) === 'timestamp'
  && ['plans', 'api-plans', 'models'].every(id => docs.timeShapeOf(manifest.datasets.find(d => d.id === id).updatedAt) === 'date-normalized')
  && manifest.datasets.filter(d => d.category === 'history').every(d => docs.timeShapeOf(d.updatedAt) === 'date'));

/* ================================================================== */
section('② 页面：六个必需段落 + 断言');
/* ================================================================== */

const page = fullPage();
const problems = docs.assertPageHonesty(page, ctx);
check('真实数据上数据文档页断言零问题（断言不是恒红）', problems.length === 0, problems.slice(0, 2).join('；'));
check('六个必需段落齐全',
  ['数据集索引', '数据文档', '使用示例', '引用方式', 'Schema 稳定性', 'License 状态']
    .every(section_ => page.includes(section_)));
check('每份数据集都在页面上（endpoint + id）',
  datasets.every(dataset => page.includes(dataset.url) && page.includes(dataset.id)));
check('使用示例用的是真实 endpoint（JavaScript + Python）',
  docs.examplesOf(ctx).length === 2 && page.includes('fetch(') && page.includes('requests.get('));
check('引用方式同时要求本站 URL、官方 source URL 与更新时间',
  page.includes('本站记录 URL') && page.includes('官方 source URL') && page.includes('更新时间')
  && !page.includes('本站是官方来源。'));
check('引用示例里带官方出处与更新日期',
  docs.citationExampleOf(ctx).includes('https://docs.anthropic.com') && docs.citationExampleOf(ctx).includes('2026-10-01'));
check('页面显式标出每份数据的时间形状（读者不会以为它们是同一时刻产出的）',
  ['timestamp', 'date-normalized', 'date'].every(shape => page.includes(`data-time-shape="${shape}"`)));
check('页面给出 Manifest 地址并说明"只描述数据集"',
  page.includes('data/index.json') && page.includes('只描述数据集'));

/* ================================================================== */
section('③ License：如实反映仓库现状');
/* ================================================================== */

check(`仓库许可证状态：${licensePresent ? license.file : '没有 LICENSE 文件'}`,
  licensePresent ? page.includes(license.file) : page.includes('没有**许可证文件') === false || page.includes('许可证文件'));
check('没有 LICENSE 时写明"需要项目所有者决定"，不擅自决定',
  licensePresent || (page.includes('需要项目所有者决定') && page.includes('未定') && page.includes('不擅自决定')));

/* ================================================================== */
section('④ 牙 #12：文档里的 JSON endpoint 不存在');
/* ================================================================== */

{
  const bad = docs.buildDatasetManifest(datasets.concat([{
    id: 'ghost-dataset', label: '演练用不存在的数据', url: 'ghost-endpoint.json',
    schemaVersion: 1, updatedAt: '2026-10-01', count: 0, purpose: '演练用'
  }]));
  check('【牙】Manifest 里写了一个不存在的 endpoint → assertEndpointsExist 变红',
    docs.assertEndpointsExist(bad, endpointExists).some(problem => problem.includes('ghost-endpoint.json')),
    docs.assertEndpointsExist(bad, endpointExists).join('；'));
  const badPage = docs.renderDataDocsPage({ ...ctx, manifest: bad })
    + docs.dataDocsJsonLd({ ...ctx, manifest: bad })
      .map(data => `<script type="application/ld+json">${JSON.stringify(data)}</script>`).join('');
  check('【牙】同一个错误在页面断言里也会变红（模板与 Manifest 不一致）',
    docs.assertPageHonesty(badPage, { ...ctx, manifest: bad }).some(problem => problem.includes('ghost-endpoint.json')));
  const deleted = page.replace(`<tr data-item="deals">`, '<tr data-item="not-a-dataset">');
  check('【牙】页面上少列了一份数据集 → 红',
    docs.assertPageHonesty(deleted, ctx).length > 0);
}

/* ================================================================== */
section('⑤ 牙 #13：schemaVersion 与真实数据不一致');
/* ================================================================== */

{
  const lied = docs.buildDatasetManifest(datasets.map(dataset =>
    dataset.id === 'deals' ? { ...dataset, schemaVersion: 99 } : dataset));
  check('【牙】Manifest 把 deals 的 schemaVersion 写成 99 → 与真实数据对账变红',
    docs.assertSchemaVersions(lied, actualSchemaVersions).some(problem => problem.includes('99')),
    docs.assertSchemaVersions(lied, actualSchemaVersions).join('；'));
}

/* ================================================================== */
section('⑥ 牙 #14：Dataset Manifest 数量与真实数据不一致');
/* ================================================================== */

{
  const lied = docs.buildDatasetManifest(datasets.map(dataset =>
    dataset.id === 'deals' ? { ...dataset, count: dataset.count + 1 } : dataset));
  check('【牙】Manifest 把 deals 记录数多写 1 → 与真实数据对账变红',
    docs.assertManifestCounts(lied, actualCounts).some(problem => problem.includes('deals')),
    docs.assertManifestCounts(lied, actualCounts).join('；'));

  const notApplicable = docs.buildDatasetManifest(datasets.map(dataset =>
    dataset.id === 'plans' ? { ...dataset, count: null } : dataset));
  check('【牙】真实数据有记录却把 count 写成"不适用" → 红',
    docs.assertManifestCounts(notApplicable, actualCounts).length > 0);

  const shape = docs.assertManifestShape({ schemaVersion: 1, count: 3, datasets: [
    { id: 'a', url: '', schemaVersion: 1, updatedAt: '2026-10-01', count: 1, purpose: '' }
  ] });
  check('【牙】缺 url / 缺用途 / count 条数不符 → Manifest 形状校验变红', shape.length >= 3, shape.join('；'));
}

/* ================================================================== */
section('⑦ 时间形状与类别（v3.0 新增口径）');
/* ================================================================== */

{
  check('timeShapeOf 正确区分三种形状',
    docs.timeShapeOf('2026-10-01') === 'date'
    && docs.timeShapeOf('2026-10-01T00:00:00+08:00') === 'date-normalized'
    && docs.timeShapeOf('2026-10-01T12:20:35+08:00') === 'timestamp'
    && docs.timeShapeOf('') === null
    && docs.timeShapeOf('不是日期') === 'unknown');

  // 形状字段是 `datasetEntryOf()` 从值推出来的，所以"说谎"要发生在**构造之后**
  // （手改 Manifest）—— 这正是构建期回读要防的那一类。
  const shaped = docs.buildDatasetManifest(datasets);
  shaped.datasets.find(dataset => dataset.id === 'deals').updatedAtShape = 'date-normalized';
  check('【牙】把真实时刻标成「日期规范化」→ Manifest 形状校验变红',
    docs.assertManifestShape(shaped).some(problem => problem.includes('updatedAtShape')),
    docs.assertManifestShape(shaped).slice(0, 1).join('；'));

  const liedTime = docs.buildDatasetManifest(datasets.map(dataset =>
    dataset.id === 'plans' ? { ...dataset, updatedAt: '2026-10-01T09:30:00+08:00' } : dataset));
  check('【牙】updatedAt 与磁盘不一致 → assertUpdatedAt 变红',
    docs.assertUpdatedAt(liedTime, actualUpdatedAt).some(problem => problem.includes('plans')),
    docs.assertUpdatedAt(liedTime, actualUpdatedAt).slice(0, 1).join('；'));

  const missingCategory = docs.buildDatasetManifest(datasets.filter(dataset => dataset.id !== 'models'));
  check('【牙】六类里少一类（models）→ Manifest 形状校验变红',
    docs.assertManifestShape(missingCategory).some(problem => problem.includes('模型')),
    docs.assertManifestShape(missingCategory).slice(0, 1).join('；'));

  const badCategory = docs.buildDatasetManifest(datasets.map(dataset =>
    dataset.id === 'deals' ? { ...dataset, category: 'not-a-category' } : dataset));
  check('【牙】未知类别 → Manifest 形状校验变红',
    docs.assertManifestShape(badCategory).some(problem => problem.includes('category')),
    docs.assertManifestShape(badCategory).slice(0, 1).join('；'));

  const noShapeMarker = page.replace(/data-time-shape="timestamp"/g, 'data-time-shape="date"');
  check('【牙】页面上把某一份的时间形状标错 → 页面断言变红',
    noShapeMarker !== page
    && docs.assertPageHonesty(noShapeMarker, ctx).some(problem => problem.includes('时间形状')),
    docs.assertPageHonesty(noShapeMarker, ctx).slice(0, 1).join('；'));

  // 注意用**全局**替换：`data/index.json` 在页面上出现两次（href + 链接文字），
  // 只替一次会留下另一处，断言仍为绿 —— 假牙比没有牙更糟。
  const noManifestLink = page.replace(/data\/index\.json/g, 'data/manifest.json');
  check('【牙】页面上不写 Manifest 地址 → 页面断言变红',
    noManifestLink !== page && !noManifestLink.includes('data/index.json')
    && docs.assertPageHonesty(noManifestLink, ctx).some(problem => problem.includes('Manifest 地址')),
    docs.assertPageHonesty(noManifestLink, ctx).slice(0, 1).join('；'));
}

/* ================================================================== */
section('⑧ 结论性词汇与声明表');
/* ================================================================== */

{
  const dirty = page.replace('先说三件重要的事', '先说三件重要的事（性价比最高）');
  check('【牙】数据文档页注入结论性词汇 → 红',
    docs.assertPageHonesty(dirty, ctx).some(problem => problem.includes('结论性词汇')));
}

check('page-kinds 声明了 /docs/data/ 的 kind', pageKinds.kindOfRoute('docs/data/') === 'data-docs');
check('data-docs 页的 ItemList 要求已在声明表里（在场 + 行数对账）',
  pageKinds.itemListRule('data-docs').expect === true
  && pageKinds.itemListRule('data-docs').checkRows === true
  && pageKinds.itemListRule('data-docs').checkMembers === false);
check('assertDeclared() 零问题（新家族没漏登记）', docs.assertDeclared().length === 0);

/* ================================================================== */
section('⑨ 真实产物：/docs/data/ 与 /data/index.json（接线后才有；未接线时如实跳过）');
/* ================================================================== */

{
  const manifestFile = path.join(DIST, docs.MANIFEST_URL);
  const docsFile = path.join(DIST, docs.DATA_DOCS_ROUTE, 'index.html');
  // §10.9 / P2-10：**缺产物不再「跳过并计 ✓」**。门禁把这一步排在 Assemble site 之后
  // 并显式传 `--dir=dist`；独立/本地跑法缺产物即红，除非显式 --allow-missing-dist。
  if (!requireDist('dist 现场的 Dataset Manifest', docs.MANIFEST_URL) ||
      !requireDist('/docs/data/ 数据文档页', path.join(docs.DATA_DOCS_ROUTE, 'index.html'))) {
    // 已记红（或显式 OPTIONAL DIAGNOSTIC）：下面的现场对账没有输入可跑。
  } else {
    const diskManifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    const docsHtml = fs.readFileSync(docsFile, 'utf8');
    const actual = {};
    for (const dataset of diskManifest.datasets) {
      const file = path.join(DIST, dataset.url);
      if (!fs.existsSync(file)) continue;
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      actual[dataset.id] = {
        schemaVersion: parsed.schemaVersion,
        count: typeof parsed.count === 'number' ? parsed.count
          : (Array.isArray(parsed.events) ? parsed.events.length
            : (Array.isArray(parsed.links) ? parsed.links.length : null)),
        updatedAt: parsed.updatedAt || parsed.startedAt || null
      };
    }
    const problems = [
      ...docs.assertManifestShape(diskManifest),
      ...docs.assertEndpointsExist(diskManifest, url => fs.existsSync(path.join(DIST, url))),
      ...docs.assertSchemaVersions(diskManifest, Object.fromEntries(Object.entries(actual).map(([id, row]) => [id, row.schemaVersion]))),
      ...docs.assertManifestCounts(diskManifest, Object.fromEntries(Object.entries(actual).map(([id, row]) => [id, row.count]))),
      ...docs.assertUpdatedAt(diskManifest, Object.fromEntries(Object.entries(actual).map(([id, row]) => [id, row.updatedAt]))),
      ...docs.assertPageHonesty(docsHtml, {
        manifest: diskManifest, license, siteUrl: SITE_URL, prefix: '../../',
        endpointExists: url => fs.existsSync(path.join(DIST, url)),
        actualSchemaVersions: Object.fromEntries(Object.entries(actual).map(([id, row]) => [id, row.schemaVersion])),
        actualCounts: Object.fromEntries(Object.entries(actual).map(([id, row]) => [id, row.count])),
        actualUpdatedAt: Object.fromEntries(Object.entries(actual).map(([id, row]) => [id, row.updatedAt]))
      })
    ];
    check(`dist 现场：Manifest ${diskManifest.count} 份数据集与磁盘逐字段对账、页面断言零问题`,
      problems.length === 0, problems.slice(0, 3).join('；'));
    check('dist 现场：三份既有数据集与源文件逐字节相同（兼容承诺）',
      ['plans.json', 'api-plans.json'].every(file =>
        fs.readFileSync(path.join(DIST, file), 'utf8') === fs.readFileSync(path.join(ROOT, file), 'utf8')));
    check('dist 现场：/data/index.json 只描述数据集（不含任何数据记录数组）',
      !Array.isArray(diskManifest) && diskManifest.datasets.every(dataset =>
        !Array.isArray(dataset) && Object.keys(dataset).every(key =>
          ['id', 'label', 'category', 'url', 'schemaVersion', 'updatedAt', 'updatedAtShape', 'count', 'countNote', 'purpose', 'format'].includes(key))));
    // ---- 方向 2（§10.7）：产物里的**每个** JSON 都必须被某个注册表认领 ----
    const coverage = docs.assertArtifactCoverage(listFiles(DIST), diskManifest);
    check(`dist 现场：方向 2 扫描 ${coverage.counts.json} 个 JSON，未认领 ${coverage.counts.unclassified} 个`,
      coverage.problems.length === 0, coverage.problems.slice(0, 3).join('；'));
    check('dist 现场：覆盖统计对得上（公开数据集 == Manifest 条数 · Manifest 1 个 · 豁免项逐个在场）',
      coverage.counts.datasets === diskManifest.datasets.length
      && coverage.counts.manifest === 1
      && coverage.counts.internal === docs.INTERNAL_ARTIFACTS.length
      && coverage.counts.feeds > 0,
      docs.artifactCoverageSummary(coverage.counts));
  }
}

/* ================================================================== */
section('⑩ P2-25 方向 2：唯一注册表 + 产物 JSON 认领（含变异牙）');
/* ================================================================== */

{
  check('注册表形状零问题（唯一注册表自己也被校验）', docs.assertDatasetRegistryShape().length === 0,
    docs.assertDatasetRegistryShape().slice(0, 2).join('；'));
  check('注册表每一类都有数据集（六类齐 · 与 Manifest 同一口径）',
    docs.DATASET_CATEGORIES.every(category => REGISTRY.some(entry => entry.category === category.key)));
  check('注册表按 emit 分派：拷贝类进 PUBLIC_FILES、生成类进 GENERATED_FILES（两处都不再手写清单）',
    docs.datasetCopyUrls().every(url => exists(url))
    && docs.datasetGeneratedUrls().length + docs.datasetCopyUrls().length === REGISTRY.length);
  check('source-health.json 的豁免是"写明理由"的，不是静默白名单',
    docs.classifyJsonArtifact('source-health.json').kind === 'internal'
    && docs.INTERNAL_ARTIFACTS.every(row => row.path && row.reason && row.owner && row.documentedAt)
    && docs.INTERNAL_ARTIFACTS.every(row => !docs.datasetUrls().includes(row.path)));
  check('Feed 家族的归类带得出注册表归属（换的是另一份注册表，不是没人管）',
    docs.classifyJsonArtifact('feed/vendor/x.json').kind === 'feed'
    && /lib\/feeds\.js/.test(docs.classifyJsonArtifact('feed.json').reason));

  // 变异电池：全部在**纯函数**层做（注入文件清单 / 伪造 Manifest），不写盘。
  const realFiles = REGISTRY.map(entry => entry.url)
    .concat([docs.MANIFEST_URL, 'feed.json', 'feed/vendor/x.json', 'source-health.json', 'sitemap.xml']);
  const clean = docs.assertArtifactCoverage(realFiles, manifest);
  check('【防恒红】干净文件清单 → 零问题（先证明这条扫描在真实口径下会绿）',
    clean.problems.length === 0, clean.problems.slice(0, 2).join('；'));

  const stray = docs.assertArtifactCoverage(realFiles.concat(['experimental-feed.json']), manifest);
  check('【牙】产物里新增一份未登记的公开 JSON（dist/experimental-feed.json）→ 红，且点名文件与下一步',
    stray.problems.some(problem => problem.includes('experimental-feed.json') && problem.includes('PUBLIC_DATASETS')),
    stray.problems.slice(0, 2).join('；'));

  const strayDeep = docs.assertArtifactCoverage(realFiles.concat(['archive/extra.json']), manifest);
  check('【牙】子目录里新增未登记 JSON 同样红（扫描是全树，不是只看产物根）',
    strayDeep.problems.some(problem => problem.includes('archive/extra.json')));

  const dropped = docs.assertArtifactCoverage(realFiles, docs.buildDatasetManifest(datasets.filter(d => d.id !== 'models')));
  check('【牙】注册表有、Manifest 少一份（models）→ 注册表↔Manifest 双向红',
    dropped.problems.some(problem => problem.includes('models.json')), dropped.problems.slice(0, 2).join('；'));

  const ghostManifest = docs.buildDatasetManifest(datasets.concat([{
    id: 'ghost', url: 'ghost.json', category: 'deals', schemaVersion: 1, updatedAt: '2026-10-01', count: 0, purpose: '演练用'
  }]));
  check('【牙】Manifest 里出现注册表外的数据集 → 红（Manifest 不许绕过唯一注册表）',
    docs.assertArtifactCoverage(realFiles.concat(['ghost.json']), ghostManifest).problems
      .some(problem => problem.includes('ghost.json') && problem.includes('PUBLIC_DATASETS')));

  const noHealth = realFiles.filter(file => file !== 'source-health.json');
  check('【牙】豁免项在产物里不存在（过期豁免）→ 红',
    docs.assertArtifactCoverage(noHealth, manifest).problems.some(problem => problem.includes('过期豁免')));

  const feedDeclared = ['feed.json', 'feed/vendor/x.json'];
  check('【防恒红】Feed 产出清单与产物里的 Feed 文件一致 → 零问题',
    docs.assertArtifactCoverage(realFiles, manifest, { feedFiles: feedDeclared }).problems.length === 0,
    docs.assertArtifactCoverage(realFiles, manifest, { feedFiles: feedDeclared }).problems.slice(0, 2).join('；'));
  check('【牙】feed 目录里出现注册表没产出的 JSON → 红（结构性豁免不成立）',
    docs.assertArtifactCoverage(realFiles.concat(['feed/stray.json']), manifest, { feedFiles: feedDeclared })
      .problems.some(problem => problem.includes('feed/stray.json')));
  check('【牙】Feed 注册表声明产出、产物里却没有 → 红',
    docs.assertArtifactCoverage(realFiles, manifest, { feedFiles: feedDeclared.concat(['feed/ghost.json']) })
      .problems.some(problem => problem.includes('feed/ghost.json')));
}

/* ================================================================== */

console.log(`\n=== v3.0 数据出口演练：${passed} 项通过，${failures.length} 项失败 ===`);
if (failures.length) {
  console.log('失败项：');
  failures.forEach(name => console.log(`  ✗ ${name}`));
  process.exit(1);
}
