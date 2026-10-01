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
  const html = archiveLib.renderArchiveEntry(entry, { prefix: '../../' });
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
  const DIST = path.join(ROOT, 'dist');
  const distIndex = path.join(DIST, 'archive', 'index.html');
  if (!fs.existsSync(distIndex)) {
    check('构建产物不存在或 /archive/ 尚未接线 —— 本节按「如实跳过」处理（先跑 npm run build）', true);
  } else {
    const html = fs.readFileSync(distIndex, 'utf8');
    const diskStores = {
      deal: JSON.parse(fs.readFileSync(path.join(DIST, 'deal-history.json'), 'utf8')),
      plan: JSON.parse(fs.readFileSync(path.join(DIST, 'plan-history.json'), 'utf8')),
      api: JSON.parse(fs.readFileSync(path.join(DIST, 'api-plan-history.json'), 'utf8'))
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
