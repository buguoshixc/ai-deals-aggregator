#!/usr/bin/env node
/**
 * v3.0 历史档案演练（离线、零依赖、可重跑）。
 *
 * 演练的是题面 §8 的三条 Archive 牙，外加两条结构性承诺：
 *   · #9  当前资料消失后，档案**不消失**（归档只依赖 baseline + events）；
 *   · #10 来源故障导致的大批 ended 必须被标为可疑，不许伪装成"资料自然结束"；
 *   · #11 ended → restored 之后状态必须是 restored；
 *   · `buildArchive()` 不读盘、不看时钟（静态扫描）；
 *   · 交付日 0 条记录时，页面必须给出**明确的空态**（0 是事实，不是故障）。
 *
 * 真实三份日志当前都是"纯基线 0 事件"，因此 ended/restored 分支由合成夹具驱动 ——
 * 这一点如实写在测试输出里，不补造任何生产事件。
 */

'use strict';

const fs = require('fs');
const path = require('path');

const archiveLib = require('../lib/archive');
const pageKinds = require('../lib/page-kinds');

const ROOT = path.join(__dirname, '..', '..');
const SITE_URL = 'https://buguoshixc.github.io/ai-deals-aggregator/';

/* ------------------------------------------------------------------ */
/* 产物目录与 fail-closed 前置（§10.9 · P2-10 / P2-26）                  */
/* ------------------------------------------------------------------ */
//
// 本工具最后一节必须读**构建产物**（`<dist>/archive/index.html`）。原先是
// 「产物不存在 ⇒ 跳过并计 ✓」—— 而门禁在构建之前跑，`dist/` 根本不存在，
// 于是这一步在 CI 里**永远是绿的**：同一份代码、同一个 commit，项数随环境变。
//
// 六个产物依赖工具现在用同一套协议：
//   · `--dir=<path>`            显式指定产物目录（默认 `<repo>/dist`）；
//   · 缺少必需产物 ⇒ **非 0**，并给出「先 build / 用 --dir 指到别的产物」的下一步；
//   · 只有显式 `--allow-missing-dist` 才允许跳过，且会被标成
//     `⚠️ OPTIONAL DIAGNOSTIC` —— 那是给本地诊断的口子，门禁里不传。
//
// 「产物该不该存在」不由本工具猜：门禁 action 把这一节排在 `Assemble site` 之后，
// 并把 `--dir=dist` 显式传进来（`check-ci-consistency` 的 (17) 守着这个调用形态）。
const dirArg = process.argv.find(arg => arg.startsWith('--dir='));
const ALLOW_MISSING_DIST = process.argv.includes('--allow-missing-dist');
const DIST = path.resolve(ROOT, dirArg ? dirArg.slice('--dir='.length) : 'dist');

/** 必需的产物缺失时：显式允许 → 记一条 OPTIONAL DIAGNOSTIC（通过）；否则记红并返回 false */
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

/* ================================================================== */
section('① 真实日志：归档层跑得通，且 0 条时断言不是恒红');
/* ================================================================== */

const realStores = {
  deal: readJson('scripts/data/deal-history.json'),
  plan: readJson('scripts/data/plan-history.json'),
  api: readJson('scripts/data/api-plan-history.json')
};
const realRecords = {
  deal: readJson('deals.json').deals,
  plan: readJson('plans.json').plans,
  api: readJson('api-plans.json').plans
};

const realArchives = Object.keys(realStores).map(kind => archiveLib.buildArchive({
  kind,
  baseline: realStores[kind].baseline,
  events: realStores[kind].events,
  absence: realStores[kind].absence,
  anomalies: realStores[kind].anomalies || [],
  records: realRecords[kind],
  startedAt: realStores[kind].startedAt,
  asOf: '2026-10-01'
}));

check(`三份真实日志都被识别为可用（${realArchives.map(a => `${a.kind}:${a.counts.baseline}条基线`).join(' / ')}）`,
  realArchives.every(archive => archive.availability === 'ok'));
check('真实日志 0 事件 ⇒ 0 条档案（这是事实，不是故障）',
  realArchives.every(archive => archive.entries.length === 0 && archive.counts.ended === 0));
check('0 条时完整性断言为零问题（断言不是恒红）',
  realArchives.every(archive => archiveLib.assertArchiveIntegrity(archive).length === 0));

{
  const withoutRecords = archiveLib.buildArchive({
    kind: 'deal',
    baseline: realStores.deal.baseline,
    events: realStores.deal.events,
    absence: realStores.deal.absence,
    asOf: '2026-10-01'
  });
  check('去掉当前记录后条目集合不变（归档不依赖当前数据）',
    archiveLib.assertEntrySetStable(realArchives[0], withoutRecords).length === 0);
}

{
  const indexHtml = archiveLib.renderArchiveIndex(realArchives, { prefix: '', siteUrl: SITE_URL });
  const problems = archiveLib.assertPageHonesty(indexHtml, { kind: 'archive-index', archives: realArchives });
  check('0 条时索引页仍然完整可读（空态逐域写明）', problems.length === 0, problems.slice(0, 2).join('；'));
  check('空态明说"0 条是事实，不是故障"，并给出**具体到事件类型**的为空原因',
    indexHtml.includes('0 条是事实，不是故障')
    && /该日志共 \d+ 条事件（首次收录 \d+ 条 · 字段变化 \d+ 条 · 不再收录 0 条 · 重新出现 0 条）/.test(indexHtml));
  check('空态没有把"没有拿到日志"与"没有记录"混为一谈',
    indexHtml.includes('还没有观测到结束或恢复记录') && !indexHtml.includes('没有拿到'));

  // 牙：把空态抹掉（留一个空列表）→ 页面断言必须变红
  const stripped = indexHtml.replace(/<li class="anone">[\s\S]*?<\/li>/g, '');
  check('【牙】空态被抹掉（只剩空列表）→ 页面断言变红',
    archiveLib.assertPageHonesty(stripped, { kind: 'archive-index', archives: realArchives })
      .some(problem => problem.includes('空态')),
    archiveLib.assertPageHonesty(stripped, { kind: 'archive-index', archives: realArchives }).slice(0, 1).join(''));

  // 牙：三组里少一组 → 变红（"路由消失比一页说明更糟"）
  const missingGroup = indexHtml.replace(/<section class="asec" id="archive-api"[\s\S]*?<\/section>/, '');
  check('【牙】索引页少了「API 计费记录」这一组 → 页面断言变红',
    missingGroup !== indexHtml
    && archiveLib.assertPageHonesty(missingGroup, { kind: 'archive-index', archives: realArchives })
      .some(problem => problem.includes('archive-api')),
    archiveLib.assertPageHonesty(missingGroup, { kind: 'archive-index', archives: realArchives }).slice(0, 1).join(''));

  // 牙：某一组的结束/恢复计数被改掉 → 变红
  // ⚠️ 三组的计数行在 0/0 时逐字相同，所以断言必须在**该组自己的 section 里**查
  // （整页 includes 会命中另一组，永远为真）—— 这里同时验证了那个口径。
  const liedCount = indexHtml.replace('结束 0 条 · 恢复 0 条', '结束 3 条 · 恢复 0 条');
  check('【牙】某组的结束计数与数据不一致 → 变红（且是逐组核对，不是整页 substring）',
    liedCount !== indexHtml
    && archiveLib.assertPageHonesty(liedCount, { kind: 'archive-index', archives: realArchives })
      .some(problem => problem.includes('计数')),
    archiveLib.assertPageHonesty(liedCount, { kind: 'archive-index', archives: realArchives }).slice(0, 1).join(''));
}

{
  const unknown = archiveLib.buildArchive({});
  check('没有任何输入时如实报 unavailable（不假装是 0 条）', unknown.availability === 'unavailable');
  const html = archiveLib.renderArchiveIndex([unknown], { prefix: '' });
  check('日志缺失时页面说「没有拿到日志」', /没有拿到.+的变更日志/.test(html));
}

/* ================================================================== */
section('② 合成夹具：ended / restored 状态机');
/* ================================================================== */

const baseline = {
  at: '2026-09-01',
  fields: {
    aaaaaaaaaaa1: { title: '演练优惠 A', sourceUrl: 'https://example.com/a', source: 'Official-Announcement' },
    bbbbbbbbbbb2: { title: '演练优惠 B', sourceUrl: 'https://example.com/b' },
    ccccccccccc3: { title: '演练优惠 C' },
    ddddddddddd4: { title: '演练优惠 D' }
  }
};

const lifecycleEvents = [
  { id: 'aaaaaaaaaaa1', at: '2026-09-02', type: 'created', fields: { title: '演练优惠 A', sourceUrl: 'https://example.com/a' } },
  { id: 'aaaaaaaaaaa1', at: '2026-09-10', type: 'ended', reason: 'source_no_longer_lists', label: { title: '演练优惠 A', vendor: '演练厂商' } },
  { id: 'aaaaaaaaaaa1', at: '2026-09-20', type: 'restored' },
  { id: 'bbbbbbbbbbb2', at: '2026-09-11', type: 'ended', reason: 'pruned_expired', label: { title: '演练优惠 B', vendor: '演练厂商' } }
];

const synthetic = archiveLib.buildArchive({
  kind: 'deal',
  baseline,
  events: lifecycleEvents,
  records: [{ id: 'aaaaaaaaaaa1', title: '演练优惠 A', vendor: '演练厂商' }],
  asOf: '2026-10-01'
});

// 此数字锚在本地夹具上，不随生产数据漂移（`lifecycleEvents` 就在上面几行就地构造：两条链）。
check('两条生命周期链都被重建（A 恢复、B 结束）',
  synthetic.entries.length === 2
  && synthetic.counts.ended === 1 && synthetic.counts.restored === 1,
  JSON.stringify(synthetic.counts));
check('B 的结束原因与墓碑被完整保留',
  synthetic.entries.some(entry => entry.id === 'bbbbbbbbbbb2'
    && entry.status === 'ended' && entry.endReason === 'pruned_expired' && entry.title === '演练优惠 B'));
check('完整性断言在正确产物上为零问题', archiveLib.assertArchiveIntegrity(synthetic).length === 0);

/* ================================================================== */
section('②′ 另外两份日志的事件键（planId）与派生视图');
/* ================================================================== */

{
  // 三份日志的**事件键不同**：deals 用 `id`，套餐 / API 日志用 `planId`（契约如此）。
  // `buildArchive()` 必须两种都认（自动识别，也可由 `recordKey` 显式指定）——
  // 只测 deals 形状会让"另外两份日志永远归档不出条目"这种缺陷潜伏到线上。
  const planStoreFixture = {
    schemaVersion: 1,
    startedAt: '2026-09-01',
    baseline: { at: '2026-09-01', note: '演练', fields: { '111111111111': { planName: '演练套餐 A' } } },
    absence: {},
    anomalies: [],
    events: [
      { planId: '111111111111', at: '2026-09-10', type: 'ended', reason: 'source_no_longer_lists', field: null, from: null, to: null, label: { title: '演练套餐 A', vendor: '演练厂商' }, eventId: 'abc123abc123' },
      { planId: '111111111111', at: '2026-09-20', type: 'restored', field: null, from: null, to: null }
    ]
  };
  const planArchive = archiveLib.buildArchive({
    kind: 'plan',
    baseline: planStoreFixture.baseline,
    events: planStoreFixture.events,
    asOf: '2026-10-01'
  });
  check('【跨日志】planId 事件键被识别：Coding 套餐日志也归档得出条目',
    planArchive.entries.length === 1 && planArchive.entries[0].id === '111111111111');
  check('【跨日志】ended → restored 的状态在套餐日志上同样判成 restored',
    planArchive.entries[0].status === 'restored'
    && planArchive.entries[0].endedAt === '2026-09-10' && planArchive.entries[0].restoredAt === '2026-09-20');
  check('【跨日志】套餐日志的墓碑 label 被保留', planArchive.entries[0].title === '演练套餐 A');

  const apiArchive = archiveLib.buildArchive({
    kind: 'api',
    recordKey: 'planId',
    baseline: { at: '2026-09-01', fields: { '222222222222': { planName: '演练计费记录' } } },
    events: [{ planId: '222222222222', at: '2026-09-12', type: 'ended', reason: 'pruned_expired', label: { title: '演练计费记录' } }],
    asOf: '2026-10-01'
  });
  check('【跨日志】recordKey 显式指定时同样工作（kind=api）',
    apiArchive.entries.length === 1 && apiArchive.entries[0].status === 'ended'
    && apiArchive.entries[0].kind === 'api');

  const missed = archiveLib.buildArchive({
    kind: 'plan',
    recordKey: 'id',
    baseline: planStoreFixture.baseline,
    events: planStoreFixture.events,
    asOf: '2026-10-01'
  });
  check('【牙】事件键写错（planId 事件用 recordKey=id 读）→ 归档为空（不是静默半对）',
    missed.entries.length === 0 && missed.counts.events === 2);
}

/* ================================================================== */
section('③ 牙 #11：ended → restored 之后状态必须是 restored');
/* ================================================================== */

{
  const a = synthetic.entries.find(entry => entry.id === 'aaaaaaaaaaa1');
  check('A 的状态是 restored，且带恢复时间与结束时间',
    a.status === 'restored' && a.restoredAt === '2026-09-20' && a.endedAt === '2026-09-10', JSON.stringify(a.status));
  check('A 的时间线顺序正确（created → ended → restored）',
    a.lifecycle.map(event => event.type).join(',') === 'created,ended,restored');

  const corrupted = {
    ...synthetic,
    entries: synthetic.entries.map(entry => entry.id === 'aaaaaaaaaaa1' ? { ...entry, status: 'ended' } : entry)
  };
  const problems = archiveLib.assertArchiveIntegrity(corrupted);
  check('【牙】把恢复后的状态写成 ended → 完整性断言变红',
    problems.some(problem => problem.includes('restored')), problems.slice(0, 1).join(''));

  const overloaded = {
    ...synthetic,
    entries: synthetic.entries.map(entry => entry.id === 'aaaaaaaaaaa1' ? { ...entry, status: 'current' } : entry)
  };
  check('【牙】状态被写成非 ended / restored → 红',
    archiveLib.assertArchiveIntegrity(overloaded).length > 0);
}

/* ================================================================== */
section('④ 牙 #9：当前资料消失，档案不消失');
/* ================================================================== */

{
  const withoutRecords = archiveLib.buildArchive({
    kind: 'deal', baseline, events: lifecycleEvents, asOf: '2026-10-01'
  });
  // 此数字锚在本地夹具上，不随生产数据漂移（同一个 `lifecycleEvents`，两条链 ⇒ 两条档案）。
  check('去掉 records 后两条档案仍在（档案只依赖事件）',
    withoutRecords.entries.length === 2
    && archiveLib.assertEntrySetStable(synthetic, withoutRecords).length === 0);

  // 污染方式：模拟"当前 Deal 消失后历史记录也消失"（把档案按当前数据过滤一遍）
  const currentIds = new Set(['aaaaaaaaaaa1']);
  const corrupted = { ...synthetic, entries: synthetic.entries.filter(entry => currentIds.has(entry.id)) };
  const problems = archiveLib.assertEntrySetStable(corrupted, withoutRecords);
  check('【牙】按当前数据过滤档案（丢掉已消失的那条）→ 变红',
    problems.some(problem => problem.includes('bbbbbbbbbbb2')), problems.slice(0, 1).join(''));

  const page = archiveLib.renderArchiveIndex([synthetic], { prefix: '' });
  check('页面会把两条档案都渲染出来（含已从当前数据消失的 B）',
    page.includes('data-item="aaaaaaaaaaa1"') && page.includes('data-item="bbbbbbbbbbb2"'));
}

/* ================================================================== */
section('⑤ 牙 #10：来源故障导致的大批 Archive ended');
/* ================================================================== */

{
  const massEvents = ['aaaaaaaaaaa1', 'bbbbbbbbbbb2', 'ccccccccccc3', 'ddddddddddd4'].map(id => ({
    id, at: '2026-09-15', type: 'ended', reason: 'source_no_longer_lists', label: { title: `演练 ${id}` }
  }));
  const mass = archiveLib.buildArchive({
    kind: 'deal', baseline, events: massEvents, asOf: '2026-10-01'
  });
  check(`同一天结束 4 条（阈值 ${mass.anomalies[0] ? mass.anomalies[0].threshold : '?'}）→ 全部标为可疑`,
    mass.counts.suspect === 4 && mass.anomalies.some(anomaly => anomaly.kind === 'mass_ended_suspect'),
    JSON.stringify(mass.counts));
  check('可疑记录仍留在档案里（资料不删除），但带原因',
    mass.entries.every(entry => entry.suspect && entry.suspectReason.includes('疑似来源故障')));
  check('可疑条目的完整性断言仍然为零问题（异常留档齐全）',
    archiveLib.assertArchiveIntegrity(mass).length === 0);

  const massPage = archiveLib.renderArchiveIndex([mass], { prefix: '' });
  check('页面必须写明"疑似来源故障"，不许伪装成正常归档',
    massPage.includes('疑似来源故障') && massPage.includes('不应当被当成')
    && massPage.includes('厂商已经下架'), massPage.slice(0, 0));

  const cleaned = { ...mass, anomalies: [] };
  check('【牙】标了 suspect 却没有异常留档 → 完整性断言变红',
    archiveLib.assertArchiveIntegrity(cleaned).length > 0);

  // 反例：只有 1 条结束（低于阈值）不许被当成来源故障
  const single = archiveLib.buildArchive({
    kind: 'deal', baseline,
    events: [{ id: 'bbbbbbbbbbb2', at: '2026-09-15', type: 'ended', reason: 'pruned_expired' }],
    asOf: '2026-10-01'
  });
  check('低于阈值时**不**标记可疑（断言不是恒真）',
    single.counts.suspect === 0 && single.anomalies.length === 0);

  // 日志里的 mass_missing 异常会强制标记对应日期
  const forced = archiveLib.buildArchive({
    kind: 'deal', baseline, events: massEvents,
    anomalies: [{ kind: 'mass_missing', at: '2026-09-15', note: '来源故障' }],
    massThreshold: 99,
    asOf: '2026-10-01'
  });
  check('日志记有 mass_missing 时，即使条数低于阈值也可疑（来源故障优先）',
    forced.counts.suspect === 4, JSON.stringify(forced.counts));
}

/* ================================================================== */
section('⑥ 纯函数纪律：不读盘、不看时钟');
/* ================================================================== */

{
  const source = fs.readFileSync(path.join(ROOT, 'scripts', 'lib', 'archive.js'), 'utf8');
  check('archive.js 不 require fs / path（归档层不读盘）',
    !/require\('fs'\)/.test(source) && !/require\('path'\)/.test(source));
  check('archive.js 不看时钟（没有 Date.now / new Date）',
    !/Date\.now/.test(source) && !/new Date\s*\(/.test(source));
  check('基准日必须由调用方给：不给 asOf 时归档不自己造一个',
    archiveLib.buildArchive({ kind: 'deal', baseline, events: lifecycleEvents }).asOf === null);
}

/* ================================================================== */
section('⑦ 详情页与页码声明');
/* ================================================================== */

{
  const entry = synthetic.entries.find(item => item.id === 'aaaaaaaaaaa1');
  // 前缀**不再由测试自己写死**：测试与构建读的是同一个判据（`archiveEntryPrefix()`）——
  // 两处各写一份 `'../../'` 正是上一轮那份 24/27 死链长期没被发现的原因。
  const html = archiveLib.renderArchiveEntry(entry, { prefix: archiveLib.archiveEntryPrefix(entry) });
  const problems = archiveLib.assertPageHonesty(html, { kind: 'archive-entry', entry });
  check('详情页六项必备信息齐全（状态/首次/最后有效/结束发现/最后已知/时间线）',
    problems.length === 0, problems.slice(0, 2).join('；'));
  check('恢复的记录写成「曾结束，现已恢复」', html.includes('曾结束，现已恢复'));
  check('最后已知内容来自结束时刻的重放（含 title / sourceUrl）',
    html.includes('演练优惠 A') && html.includes('https://example.com/a'));
  check('详情页给出档案路由（kind + id）',
    archiveLib.archiveEntryRoute(entry) === 'archive/deal/aaaaaaaaaaa1/');

  const dirty = html.replace('最后已知内容', '最后已知内容（性价比最高）');
  check('【牙】档案页注入结论性词汇 → 红',
    archiveLib.assertPageHonesty(dirty, { kind: 'archive-entry', entry }).some(problem => problem.includes('结论性词汇')));

  const wrongCount = html.replace(`变化时间线（${entry.timeline.length} 条）`, '变化时间线（99 条）');
  check('【牙】时间线条数与数据不一致 → 红',
    archiveLib.assertPageHonesty(wrongCount, { kind: 'archive-entry', entry }).length > 0);
}

check('page-kinds 声明了 /archive/ 的 kind', pageKinds.kindOfRoute('archive/') === 'archive-index');
check('pageKinds 声明了档案详情路由模式',
  pageKinds.kindOfRoute('archive/api/4f8bae91f9f8/') === 'archive-detail');
check('未登记的档案路由会被审计报出来',
  pageKinds.auditRouteKinds(['archive/', 'archivex/']).join(',') === 'archivex/');

/* ================================================================== */
section('⑦′ 详情页的相对引用：每条都必须解析到真实目标（前缀由路由深度派生）');
/* ================================================================== */

{
  // 这一节是 P1-5（F-r1-history-ai-002）的**常驻牙**。详情页原先写死 `'../../'`（2 层），
  // 而 `archive/<kind>/<id>/` 是 3 层 —— 27 条相对引用里 24 条解析到 `archive/…` 下
  // 根本不存在的东西（favicon / feed / 面包屑 / 全站导航全中）。生产一条 ended/restored
  // 都没有，所以它一次也没被构建照到；只有合成 ended 记录才走得进这个分支。
  //
  // 三条一起守：
  //   ① 前缀一律由 `archiveEntryPrefix()` / `routePrefixOf()` 按路由深度给出（唯一实现）；
  //   ② 页面里每条相对引用都带**该页深度**的前缀（3 层页面 ⇒ `../../../…`）；
  //   ③ 把每条相对引用按页面路由**解析**一遍，落点必须是已声明的路由或静态文件
  //      （判据来自 `page-kinds.js` 的声明表与路由模式，不复制渲染层的前缀算式）。
  const seo = require('../lib/seo');
  const STATIC_FILES = new Set(['favicon.svg', 'assets/data/offers.json', 'robots.txt', 'og-image.png', 'sitemap.xml']);
  const declaredRoutes = new Set(Object.keys(pageKinds.FIXED_ROUTE_KINDS));
  // `/vendor/` 与 `/category/` 是**枢纽页**（kind='hub'，由落地页计划按数据生成），
  // 因此不在固定路由声明表里；它们是真实存在的页面（产物里 `vendor/index.html` /
  // `category/index.html` 都在）。这里只登记「档案页会链到的这两个根」，
  // 它们的死链由产物级门禁（seo-verify 的 internal-link-exists）继续盯着。
  const HUB_ROOTS = new Set(['vendor/', 'category/']);
  const routeExists = route => {
    if (route === '' || declaredRoutes.has(route) || HUB_ROOTS.has(route)) return true;
    if (STATIC_FILES.has(route) || /^logos\/[^/]+\.svg$/.test(route)) return true;
    return pageKinds.ROUTE_PATTERNS.some(pattern => pattern.re.test(route));
  };

  // 三种 kind 各一条（deal / plan / api）—— 详情路由的形状必须逐类都对
  const planEntry = archiveLib.buildArchive({
    kind: 'plan',
    baseline: { at: '2026-09-01', fields: { ppppppppppp1: { 'billing.regularPrice': 100 } } },
    events: [{ planId: 'ppppppppppp1', at: '2026-09-12', type: 'ended', reason: 'withdrawn', label: { title: '演练套餐 P', vendor: '演练厂商' } }],
    asOf: '2026-10-01'
  }).entries[0];
  const apiEntry = archiveLib.buildArchive({
    kind: 'api',
    baseline: { at: '2026-09-01', fields: { qqqqqqqqqqq1: { 'pricing.unit': 'per_1M_tokens' } } },
    events: [{ planId: 'qqqqqqqqqqq1', at: '2026-09-13', type: 'ended', reason: 'withdrawn', label: { title: '演练 API 记录 Q', vendor: '演练厂商' } }],
    asOf: '2026-10-01'
  }).entries[0];
  const fixtureEntries = [synthetic.entries[0], planEntry, apiEntry];
  const archivesForIndex = [synthetic, archiveLib.buildArchive({
    kind: 'plan',
    baseline: { at: '2026-09-01', fields: { ppppppppppp1: { 'billing.regularPrice': 100 } } },
    events: [{ planId: 'ppppppppppp1', at: '2026-09-12', type: 'ended', reason: 'withdrawn', label: { title: '演练套餐 P', vendor: '演练厂商' } }],
    asOf: '2026-10-01'
  }), archiveLib.buildArchive({
    kind: 'api',
    baseline: { at: '2026-09-01', fields: { qqqqqqqqqqq1: { 'pricing.unit': 'per_1M_tokens' } } },
    events: [{ planId: 'qqqqqqqqqqq1', at: '2026-09-13', type: 'ended', reason: 'withdrawn', label: { title: '演练 API 记录 Q', vendor: '演练厂商' } }],
    asOf: '2026-10-01'
  })];

  check('三种 kind 的详情路由都是 3 层，前缀由路由深度派生（../../../）',
    fixtureEntries.length === 3 && fixtureEntries.every(entry =>
      archiveLib.archiveEntryRoute(entry).split('/').filter(Boolean).length === 3
      && archiveLib.archiveEntryPrefix(entry) === '../../../'
      && archiveLib.routePrefixOf(archiveLib.archiveEntryRoute(entry)) === '../../../'),
    fixtureEntries.map(entry => `${archiveLib.archiveEntryRoute(entry)} ⇒ ${archiveLib.archiveEntryPrefix(entry)}`).join(' · '));
  check('索引页前缀同样由唯一实现给出（archive/ ⇒ ../）',
    archiveLib.routePrefixOf(archiveLib.ARCHIVE_INDEX_ROUTE) === '../');

  const pages = [
    { route: archiveLib.ARCHIVE_INDEX_ROUTE, prefix: '../', html: archiveLib.renderArchiveIndex(archivesForIndex, { prefix: '../' }) },
    ...fixtureEntries.map(entry => ({
      route: archiveLib.archiveEntryRoute(entry),
      prefix: archiveLib.archiveEntryPrefix(entry),
      html: archiveLib.renderArchiveEntry(entry, { prefix: archiveLib.archiveEntryPrefix(entry) })
    }))
  ];

  const refProblems = [];
  const prefixProblems = [];
  let refCount = 0;
  for (const page of pages) {
    for (const match of page.html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      const href = match[1];
      if (!href || href.startsWith('#') || /^(https?:|mailto:|data:)/i.test(href)) continue;
      refCount++;
      // ② 该页的每条相对引用都必须带这一层的深度前缀
      if (!href.startsWith(page.prefix)) prefixProblems.push(`${page.route} 的 ${href} 没有按 ${page.prefix || '(空)'} 起头`);
    }
    // ③ 解析后的落点必须真实存在：**解析用独立实现**（`lib/seo.js` 的 internalLinks
    //    按页面路由算深度），判据 = 声明表 + 路由模式 + 静态文件。
    for (const link of seo.internalLinks(page.html, page.route)) {
      const target = seo.normalizeRoute(link);
      if (!routeExists(target)) refProblems.push(`${page.route} → ${target}`);
    }
  }
  check(`三个详情页 + 索引页的 ${refCount} 条相对引用全部解析到已声明路由或静态文件`,
    refProblems.length === 0, refProblems.slice(0, 3).join('；'));
  check('每条相对引用都带该页深度前缀（详情页 3 层 ⇒ ../../../…）',
    prefixProblems.length === 0, prefixProblems.slice(0, 3).join('；'));

  // ① 没有「猜错的默认值」这条路：不传前缀直接抛错
  let throwsWithoutPrefix = false;
  try { archiveLib.renderArchiveEntry(fixtureEntries[0], {}); } catch (error) { throwsWithoutPrefix = /ctx\.prefix/.test(String(error.message)); }
  check('【牙】详情页渲染不带前缀 → 直接抛错（默认值不再可能猜错层级）', throwsWithoutPrefix);
  let rejectsBadShape = false;
  try { archiveLib.renderArchiveEntry(fixtureEntries[0], { prefix: '../archive/' }); } catch (error) { rejectsBadShape = /非法/.test(String(error.message)); }
  check('【牙】前缀不是「若干层 ../」的形状 → 直接抛错', rejectsBadShape);

  // 【牙】把前缀改回缺陷原形 `'../../'`：② + ③ 两条都必须立刻红。
  // ⚠️ 这条牙**故意自己再算一遍深度**（不复用被测的 `archiveEntryPrefix()`）：
  // helper 一旦被改坏，复用它的断言会跟着一起移位 —— 那正是「两处各写一份、一起错」的
  // 老坑。独立算出来的期望值才是牙。
  const depthPrefixOf = route => '../'.repeat(route.split('/').filter(Boolean).length);
  const brokenPages = fixtureEntries.map(entry => ({
    route: archiveLib.archiveEntryRoute(entry),
    expected: depthPrefixOf(archiveLib.archiveEntryRoute(entry)),
    html: archiveLib.renderArchiveEntry(entry, { prefix: '../../' })
  }));
  const brokenPrefix = [];
  const brokenRefs = [];
  for (const page of brokenPages) {
    for (const match of page.html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      const href = match[1];
      if (!href || href.startsWith('#') || /^(https?:|mailto:|data:)/i.test(href)) continue;
      if (!href.startsWith(page.expected)) brokenPrefix.push(`${page.route} 的 ${href}（应为 ${page.expected}…）`);
    }
    for (const link of seo.internalLinks(page.html, page.route)) {
      const target = seo.normalizeRoute(link);
      if (!routeExists(target)) brokenRefs.push(`${page.route} → ${target}`);
    }
  }
  check('【牙】前缀改回 \'../../\' → 相对引用不再带该页深度前缀', brokenPrefix.length > 0,
    `${brokenPrefix.length} 条（如 ${brokenPrefix[0] || ''}）`);
  check('【牙】前缀改回 \'../../\' → 解析后指向 `archive/…` 下不存在的目标', brokenRefs.length > 0,
    `${brokenRefs.length} 条（如 ${brokenRefs[0] || ''}）`);
}

/* ================================================================== */
section('⑦″ 布局族：档案详情走统一内容列（今天无生产实例 ⇒ 替代性设计约束）');
/* ================================================================== */
//
// ⚠️ **这一节是替代性设计约束**：三份日志的 ended / restored 事件各 0 条 ⇒
// `/archive/<kind>/<id>/` 今天**0 个生产实例**，磁盘上没有任何一页可以拿去量宽度。
// 但"今天跑不到"不等于"哪天跑起来也不会错"—— 一个从未被构建照到的渲染分支，
// 恰恰是最容易在它第一次跑起来的那天露出未验证布局的地方（同一条教训见 §⑦′ 的
// 写死前缀 `'../../'`：24/27 条死链就是这么长期没被发现的）。
//
// 所以判据换成三件**离线可核对**的替代物，一件都不靠"将来跑一次看看"：
//   ① 常量值：`archiveLib.ARCHIVE_ENTRY_MAIN_CLASS === 'detail-main'`
//      —— 而 `detail-main` 就是 `index.html` 共享 <style> 里那条 1120px 居中内容列；
//   ② 构建期接线：`build-local.js` 的档案详情调用点**确实**把它当 `mainClass` 传下去
//      —— 常量对了但没人用，等于没有；
//   ③ 断言真的会响：整页缺 <main> / 有多个 <main> / <main> 不带内容列，各构造一次，
//      `assertPageHonesty()` 必须变红；正确的整页必须零问题（断言不是恒红）。

{
  check('档案详情的内容列常量就是 detail-main（与 /deal/<id>/、/models/<slug>/ 同一列）',
    archiveLib.ARCHIVE_ENTRY_MAIN_CLASS === 'detail-main',
    `实际：${JSON.stringify(archiveLib.ARCHIVE_ENTRY_MAIN_CLASS)}`);

  // ② 构建期接线（替代性设计约束的**主判据**：没有实例，就只能查接线）
  const buildSource = fs.readFileSync(path.join(ROOT, 'scripts', 'tools', 'build-local.js'), 'utf8');
  const routeAt = buildSource.indexOf('const route = archiveLib.archiveEntryRoute(entry);');
  const callSite = routeAt === -1 ? '' : buildSource.slice(routeAt, routeAt + 2500);
  // architecture-modernization-v1：壳函数由 renderModelsShell 改名为 renderStaticPage
  // （它同时服务模型/档案/数据文档五个静态资料页族，旧名字是误称）。
  // 这条断言守的性质没变：**档案详情必须把统一内容列常量传下去**，而不是只查「有没有调壳」。
  const callSiteHasShell = /renderStaticPage\(\{/.test(callSite);
  const wiredToConstant = /mainClass:\s*archiveLib\.ARCHIVE_ENTRY_MAIN_CLASS\b/.test(callSite);
  check('【设计约束 · 今天无生产实例，这是替代性设计约束】档案详情的 renderStaticPage 调用点' +
    '（route 来自 archiveLib.archiveEntryRoute(entry)）真的把 ARCHIVE_ENTRY_MAIN_CLASS 当 mainClass 传下去',
    routeAt !== -1 && callSiteHasShell && wiredToConstant,
    routeAt === -1
      ? '找不到档案详情的渲染调用点（archiveEntryRoute(entry) 那一行）'
      : `调用点在，renderStaticPage=${callSiteHasShell}，mainClass 接线=${wiredToConstant}`);

  // ③ 断言会响：整页形态（构建期喂给 assertPageHonesty 的正是整页）
  const entry = synthetic.entries.find(item => item.id === 'aaaaaaaaaaa1');
  const entryBody = archiveLib.renderArchiveEntry(entry, { prefix: archiveLib.archiveEntryPrefix(entry) });
  const wrap = main => `<!DOCTYPE html>\n<html lang="zh-CN">\n<body>\n<div class="wrap">\n${main}\n</div>\n</body>\n</html>`;
  const pageWithMain = cls => wrap(`<main id="main"${cls ? ` class="${cls}"` : ''}>\n${entryBody}\n</main>`);
  const layoutProblemsOf = html => archiveLib.assertPageHonesty(html, { kind: 'archive-entry', entry })
    .filter(problem => problem.includes('main'));
  const goodPage = layoutProblemsOf(pageWithMain(archiveLib.ARCHIVE_ENTRY_MAIN_CLASS));
  check('整页带 detail-main 内容列 → 零布局问题（断言不是恒红）',
    goodPage.length === 0, goodPage.slice(0, 2).join('；'));
  check('【牙】整页的 <main> 不带内容列 → 变红（裸 `<main id="main">` 不算接线）',
    layoutProblemsOf(pageWithMain('')).some(problem => problem.includes('detail-main')));
  check('【牙】整页一个 <main> 都没有 → 变红（不是"片段所以放过"）',
    layoutProblemsOf(wrap(entryBody)).some(problem => problem.includes('main')));
  check('【牙】整页出现两个 <main> → 变红（"恰好 1 个"里的那个"恰好"）',
    layoutProblemsOf(wrap(`<main id="main" class="${archiveLib.ARCHIVE_ENTRY_MAIN_CLASS}"></main>`
      + `<main class="${archiveLib.ARCHIVE_ENTRY_MAIN_CLASS}">${entryBody}</main>`))
      .some(problem => problem.includes('2 个')));
  check('正文片段（renderArchiveEntry 的返回值，单测⑦喂的就是它）不被误判成"整页缺 <main>"',
    layoutProblemsOf(`<section>${entryBody}</section>`).length === 0);
}

/* ================================================================== */
section('⑧ 详情页门槛与 sitemap 资格（题面 §4 / §F4）');
/* ================================================================== */

{
  const okEntries = synthetic.entries;
  const gates = okEntries.map(entry => archiveLib.archiveDetailGate(entry));
  check('有事件链 + 有快照的条目 → 过门槛（断言不是恒红）', gates.every(gate => gate.ok), JSON.stringify(gates.map(g => g.reasons)));

  const noSnapshot = archiveLib.buildArchive({
    kind: 'deal',
    baseline: { at: '2026-09-01', fields: {} },
    events: [{ id: 'nnnnnnnnnnnn', at: '2026-09-10', type: 'ended', reason: 'pruned_expired' }],
    asOf: '2026-10-01'
  }).entries[0];
  const noSnapshotGate = archiveLib.archiveDetailGate(noSnapshot);
  check('【牙】既没有最后已知内容、也没有标题快照 → 未过门槛（不生成独立 URL）',
    noSnapshotGate.ok === false && noSnapshotGate.reasons.some(reason => reason.includes('快照')),
    JSON.stringify(noSnapshotGate.reasons));
  check('【牙】未过门槛的条目仍然留在索引页（资料不删除，只是不建页）',
    archiveLib.renderArchiveIndex([archiveLib.buildArchive({
      kind: 'deal',
      baseline: { at: '2026-09-01', fields: {} },
      events: [{ id: 'nnnnnnnnnnnn', at: '2026-09-10', type: 'ended', reason: 'pruned_expired' }],
      asOf: '2026-10-01'
    })], { prefix: '' }).includes('data-item="nnnnnnnnnnnn"'));

  const routes = okEntries.map(entry => archiveLib.archiveEntryRoute(entry));
  check('详情路由集合 == 过门槛的实体集合', archiveLib.assertArchiveDetailRoutes(routes, okEntries).length === 0);
  check('【牙】给一条历史 event 也建一页（路由不是任何过门槛实体）→ 红',
    archiveLib.assertArchiveDetailRoutes([...routes, 'archive/deal/000000000000/'], okEntries)
      .some(problem => problem.includes('历史 event 不该有自己的 SEO 页')));
  check('【牙】过门槛的实体缺详情页 → 红',
    archiveLib.assertArchiveDetailRoutes(routes.slice(1), okEntries).some(problem => problem.includes('缺少详情页')));

  const good = archiveLib.assertArchiveSitemapEligibility({ sitemapRoutes: routes, gateResults: gates });
  check('sitemap 正好等于过门槛的详情页 → 零问题', good.length === 0, good.join('；'));
  check('【牙】未过门槛的条目进了 sitemap → 红',
    archiveLib.assertArchiveSitemapEligibility({
      sitemapRoutes: [...routes, archiveLib.archiveEntryRoute(noSnapshot)],
      gateResults: [...gates, noSnapshotGate]
    }).some(problem => problem.includes('未过详情页门槛')));
  check('【牙】过门槛的条目没进 sitemap → 红',
    archiveLib.assertArchiveSitemapEligibility({ sitemapRoutes: routes.slice(1), gateResults: gates })
      .some(problem => problem.includes('没有进 sitemap')));
}

/* ================================================================== */
section('⑨ 不删除历史：pruneAbsence 只清观测态，events 永不删（题面 §F5）');
/* ================================================================== */

{
  const core = require('../lib/history-core');
  const before = JSON.parse(JSON.stringify({
    ...realStores.api,
    absence: {
      aaaaaaaaaaa1: { misses: 2, endedAt: '2024-01-01', blockedAt: null },
      bbbbbbbbbbb2: { misses: 1, endedAt: '2026-09-30', blockedAt: null }
    }
  }));
  const after = { ...before, absence: core.pruneAbsence(before.absence, {
    nextIds: new Set(), at: '2026-10-01', retentionDays: 365
  }) };
  check('pruneAbsence：超过 365 天的观测态被清掉', !after.absence.aaaaaaaaaaa1);
  check('pruneAbsence：未超窗口的观测态保留', Boolean(after.absence.bbbbbbbbbbb2));
  check('【牙】pruneAbsence 前后 events **逐字节相同**（历史事件永不删）',
    JSON.stringify(before.events) === JSON.stringify(after.events) && before.events.length === after.events.length);
  check('代价如实登记在页面上：墓碑标签超窗口后由基线重放重建',
    archiveLib.renderArchiveIndex(realArchives, { prefix: '' }).includes('墓碑标签超过保留窗口后')
    || archiveLib.renderArchiveIndex(realArchives, { prefix: '' }).includes('墓碑与时间线仍然保留'));
}

/* ================================================================== */
section('⑩ 真实产物（接线后才有；未接线时如实跳过）');
/* ================================================================== */

{
  const distIndex = path.join(DIST, 'archive', 'index.html');
  if (!requireDist('dist 现场 /archive/', path.join('archive', 'index.html'))) {
    // 缺产物已经不在这里「跳过并计 ✓」了：requireDist 要么已记红，要么是显式 OPTIONAL DIAGNOSTIC。
  } else {
    const html = fs.readFileSync(distIndex, 'utf8');
    // t2：三份日志改从**仓库根**读（`scripts/data/*`，就是上面 `realStores` 用的那一份），
    // 不再从 `dist/` 读发布副本 —— 本轮起数据文件整体下架，产物里没有它们了。
    // 为什么这样仍然成立：`/archive/` 页面渲染的本来就是这三份源日志（构建期不做二次派生），
    // 而「产物里的副本 == 仓库根源文件」这件事本轮已经不再需要（副本不存在了）。
    const diskStores = {
      deal: readJson('scripts/data/deal-history.json'),
      plan: readJson('scripts/data/plan-history.json'),
      api: readJson('scripts/data/api-plan-history.json')
    };
    const diskArchives = ['deal', 'plan', 'api'].map(kind => archiveLib.buildArchive({
      kind,
      baseline: diskStores[kind].baseline,
      events: diskStores[kind].events,
      absence: diskStores[kind].absence,
      anomalies: diskStores[kind].anomalies || [],
      startedAt: diskStores[kind].startedAt,
      asOf: '2026-10-01'
    }));
    const problems = archiveLib.assertPageHonesty(html, { kind: 'archive-index', archives: diskArchives });
    const sitemap = fs.readFileSync(path.join(DIST, 'sitemap.xml'), 'utf8');
    if (!sitemap.includes('<loc>https://buguoshixc.github.io/ai-deals-aggregator/archive/</loc>')) {
      problems.push('sitemap 里没有 /archive/');
    }
    const routes = diskArchives.flatMap(archive => (archive.entries || []).map(entry => archiveLib.archiveEntryRoute(entry)));
    problems.push(...archiveLib.assertArchiveDetailRoutes(routes, diskArchives.flatMap(archive => archive.entries || [])));
    for (const route of routes) {
      if (!fs.existsSync(path.join(DIST, route, 'index.html'))) problems.push(`${route}: 缺少产物`);
      else if (!sitemap.includes(`<loc>https://buguoshixc.github.io/ai-deals-aggregator/${route}</loc>`)) problems.push(`${route}: sitemap 漏了`);
    }
    check('dist 现场：/archive/ 存在、三组齐、sitemap 成员与详情路由集合逐个对账',
      problems.length === 0, problems.slice(0, 3).join('；'));
    check(`交付日真实产物：${diskArchives.reduce((sum, a) => sum + (a.entries || []).length, 0)} 条档案` +
      `（三份日志 ended/restored 事件各 0 条 ⇒ 0 条是事实）`,
      diskArchives.every(archive => archive.availability === 'ok'));
  }
}

/* ================================================================== */

console.log(`\n=== v3.0 历史档案演练：${passed} 项通过，${failures.length} 项失败 ===`);
if (failures.length) {
  console.log('失败项：');
  failures.forEach(name => console.log(`  ✗ ${name}`));
  process.exit(1);
}
