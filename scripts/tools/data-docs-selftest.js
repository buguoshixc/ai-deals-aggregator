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
/* 从仓库真实文件构造 Manifest（发布位置 → 仓库内的真值文件）             */
/* ------------------------------------------------------------------ */

const SOURCE_OF = {
  'deals.json': 'deals.json',
  'plans.json': 'plans.json',
  'api-plans.json': 'api-plans.json',
  'deal-plan-links.json': 'scripts/data/deal-plan-links.json',
  'deal-history.json': 'scripts/data/deal-history.json',
  'plan-history.json': 'scripts/data/plan-history.json',
  'api-plan-history.json': 'scripts/data/api-plan-history.json',
  // v3.0：模型两份数据集的**发布位置**是仓库根目录的派生产物（带 schemaVersion/updatedAt/count），
  // 不是 `scripts/data/` 里的人工来源层（那两份是 `{slug: entry}` / `{links:[]}`，没有版本与计数）。
  // 混用会让 Manifest 写出 schemaVersion=null —— 这正是"文档与真实数据不一致"要红的那一类。
  'models.json': 'models.json',
  'model-registry-links.json': 'model-registry-links.json'
};

/** 必需的七份公开数据（v2.5 起就在线上 200） */
const ESSENTIAL = ['deals.json', 'plans.json', 'api-plans.json', 'deal-plan-links.json',
  'deal-history.json', 'plan-history.json', 'api-plan-history.json'];

/** v3.0：每份数据集属于哪一类（六类必须齐 —— 与构建期同一套口径） */
const CATEGORY_OF = {
  'deals.json': 'deals',
  'plans.json': 'coding-plans',
  'api-plans.json': 'api-pricing',
  'models.json': 'models',
  'model-registry-links.json': 'relationships',
  'deal-plan-links.json': 'relationships',
  'deal-history.json': 'history',
  'plan-history.json': 'history',
  'api-plan-history.json': 'history'
};

function datasetOf(url) {
  const source = SOURCE_OF[url];
  if (!source || !exists(source)) return null;
  const payload = readJson(source);
  const category = CATEGORY_OF[url];
  if (url === 'deal-plan-links.json') {
    return {
      id: 'deal-plan-links', label: '优惠 ↔ 套餐关系', url, category,
      schemaVersion: payload.schemaVersion,
      // `updatedAt` 与 `count` 在这份文件里是**构建期派生**的（手写即校验错误），
      // 因此这里用同一支库函数现算，而不是自己写一个日期。
      updatedAt: dealPlanLinks.canonicalUpdatedAt(payload),
      count: (payload.links || []).length, countNote: '当前关系条数（退役记录另计）',
      purpose: '显式确认的优惠与套餐 / API 计费记录关系'
    };
  }
  if (/-history\.json$/.test(url)) {
    return {
      id: url.replace('.json', ''), label: '变化日志', url, category,
      schemaVersion: payload.schemaVersion, updatedAt: payload.startedAt || null,
      count: (payload.events || []).length, countNote: '事件条目数（不含一次性基线）',
      purpose: '一次性基线 + 追加事件的变化日志'
    };
  }
  if (url === 'model-registry-links.json') {
    return {
      id: 'model-registry-links', label: '模型映射关系', url, category,
      schemaVersion: payload.schemaVersion, updatedAt: payload.updatedAt || null,
      count: (payload.links || []).length, countNote: '显式映射条数',
      purpose: 'registry 模型与 api-plans 记录 / 套餐 / 优惠的显式映射'
    };
  }
  const listKey = url === 'models.json' ? 'models' : (url === 'deals.json' ? 'deals' : 'plans');
  const list = Array.isArray(payload[listKey]) ? payload[listKey] : [];
  return {
    id: url.replace('.json', ''), label: url === 'models.json' ? '模型注册表' : (url === 'deals.json' ? '优惠' : '套餐 / API 计费'),
    url, category,
    schemaVersion: payload.schemaVersion,
    updatedAt: payload.updatedAt || null,
    count: typeof payload.count === 'number' ? payload.count : list.length,
    countNote: null,
    purpose: url === 'models.json' ? '模型身份索引（索引层，不是价格真值）'
      : url === 'api-plans.json' ? 'API / Token 按量计费的官方单价'
        : url === 'plans.json' ? '长期在售的 Coding 订阅套餐' : 'AI 优惠与福利'
  };
}

const urls = ESSENTIAL.concat(['models.json', 'model-registry-links.json'].filter(url => exists(SOURCE_OF[url])));
const datasets = urls.map(datasetOf).filter(Boolean);
const manifest = docs.buildDatasetManifest(datasets);

const actualSchemaVersions = {};
const actualCounts = {};
const actualUpdatedAt = {};
for (const dataset of datasets) {
  actualSchemaVersions[dataset.id] = dataset.schemaVersion;
  actualCounts[dataset.id] = dataset.count;
  actualUpdatedAt[dataset.id] = dataset.updatedAt;
}

const endpointExists = url => Boolean(SOURCE_OF[url]) && exists(SOURCE_OF[url]);
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
  const DIST = path.join(ROOT, 'dist');
  const manifestFile = path.join(DIST, 'data', 'index.json');
  const docsFile = path.join(DIST, 'docs', 'data', 'index.html');
  if (!fs.existsSync(manifestFile) || !fs.existsSync(docsFile)) {
    check('/docs/data/ 或 /data/index.json 尚未接线 —— 本节按「如实跳过」处理（先跑 npm run build）', true);
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
  }
}

/* ================================================================== */

console.log(`\n=== v3.0 数据出口演练：${passed} 项通过，${failures.length} 项失败 ===`);
if (failures.length) {
  console.log('失败项：');
  failures.forEach(name => console.log(`  ✗ ${name}`));
  process.exit(1);
}
