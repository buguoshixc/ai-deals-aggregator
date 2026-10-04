#!/usr/bin/env node
/**
 * v1.4 优惠历史门禁演练（零依赖、离线、秒级）。
 *
 * 它演练的不是「代码跑得通」，而是**这条历史层赖以成立的那些承诺**：
 *
 *   · 只记重要字段：description 文案微调 / lastSeen 刷新 / zh 译文更新 → 0 事件
 *   · 有锚点：新增记录带 created.fields；存量记录靠一次性基线
 *   · 链可重放：基线 + 事件重放 == 当前状态；链断、静默消失、restored 无 ended 都要红
 *   · 不误报：来源失败 / 骤降 / 零产出时**不**推进「未见」计数
 *   · 幂等：同一份输入重复 record 不追加、字节不变
 *   · 有界：事件数与文件体积超限必红，且**不自动截断**
 *
 * 判据标准与既有的 selftest 一致：**红的时候没有别的步骤会替它红**，所以它进 CI 门禁。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const history = require('../lib/history');

let passed = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push({ name, detail });
    console.log(`  ✗ ${name}${detail ? ` —— ${detail}` : ''}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
}

const ID_A = 'aaaaaaaaaaaa';
const ID_B = 'bbbbbbbbbbbb';
const ID_C = 'cccccccccccc';

function deal(overrides = {}) {
  return {
    id: ID_A,
    title: '示例优惠',
    vendor: '示例厂商',
    url: 'https://example.com/offer',
    source: 'Futuretools',
    region: 'global',
    type: 'deal',
    discountInfo: '新用户 100 万 tokens',
    pricingModel: 'free',
    category: 'API服务',
    description: '一段描述',
    firstSeen: '2026-09-20',
    lastSeen: '2026-09-29',
    ...overrides
  };
}

function seeded(deals = [deal()]) {
  const store = history.emptyStore({ at: '2026-09-30' });
  store.baseline = history.baselineOf(deals, { at: '2026-09-30' });
  return store;
}

const run = (extra = {}) => ({
  at: '2026-09-30',
  runAt: '2026-09-30T01:00:00.000Z',
  freshIds: [ID_A],
  absenceEligibleSources: ['Futuretools'],
  ...extra
});

/* ------------------------------------------------------------------ */
section('① 形状与词表');

{
  check('跟踪字段与事件分类一一对应', history.TRACKED_FIELDS.every(f => history.FIELD_TYPES.includes(history.FIELD_EVENT[f])));
  check('七个事件类型都在措辞表里有中文', history.EVENT_TYPES.every(t => typeof history.HISTORY_WORDING.HISTORY_TYPES[t] === 'string'));
  check('每个 ended reason 都有中文', history.END_REASONS.every(r => typeof history.HISTORY_WORDING.HISTORY_END_REASONS[r] === 'string'));
  check('每个跟踪字段都有中文标签', history.TRACKED_FIELDS.every(f => typeof history.HISTORY_WORDING.HISTORY_FIELD_LABELS[f] === 'string'));
  check('噪音字段不在跟踪表里（description / lastSeen / firstSeen / zh）',
    !history.TRACKED_FIELDS.includes('description') && !history.TRACKED_FIELDS.includes('lastSeen') &&
    !history.TRACKED_FIELDS.includes('firstSeen') && !history.TRACKED_FIELDS.includes('zh'));
  check('噪音字段都有「为什么不跟踪」的说明',
    ['description', 'lastSeen', 'firstSeen', 'zh', 'id', 'title', 'vendor', 'url'].every(f => typeof history.UNTRACKED_FIELDS[f] === 'string'));
}

/* ------------------------------------------------------------------ */
section('② 噪音抑制：普通文案微调不产生事件');

{
  const before = deal();
  const after = deal({ description: '完全重写的一段描述', lastSeen: '2026-09-30', zh: { discountInfo: { text: '中文译文' } } });
  const { store, stats } = history.record(seeded([before]), { previous: [before], next: [after], ...run() });
  check('description / lastSeen / zh 变化 → 0 事件', stats.appended === 0,
    `实得 ${stats.appended}：${JSON.stringify(stats.byType)}`);
  check('store 与输入逐字节相同', JSON.stringify(store) === JSON.stringify(seeded([before])));
}

/* ------------------------------------------------------------------ */
section('③ 各类事件');

{
  const before = deal();
  const after = deal({ discountInfo: '新用户 500 万 tokens' });
  const { store, stats } = history.record(seeded([before]), { previous: [before], next: [after], ...run() });
  const event = history.eventsOf(store)[0];
  check('discountInfo 变化 → benefit_changed', stats.byType.benefit_changed === 1 && event.type === 'benefit_changed');
  check('事件带 from / to', event.from === '新用户 100 万 tokens' && event.to === '新用户 500 万 tokens');
  check('origin 默认 observed', event.origin === 'observed');
  check('verifyStore 通过', history.verifyStore(store, [after], { today: '2026-09-30' }).length === 0);
}

{
  const before = deal({ expiresAt: null });
  const after = deal({ expiresAt: '2026-11-30' });
  const { store } = history.record(seeded([before]), { previous: [before], next: [after], ...run() });
  const event = history.eventsOf(store)[0];
  check('新增截止日期 → expiry_changed 且 from 为 null', event.type === 'expiry_changed' && event.field === 'expiresAt' && event.from === null && event.to === '2026-11-30');
}

{
  const before = deal({ claimRequirements: { creditCardRequired: false } });
  const after = deal({ claimRequirements: { creditCardRequired: true } });
  const { store } = history.record(seeded([before]), { previous: [before], next: [after], ...run() });
  check('领取要求变化 → eligibility_changed',
    history.eventsOf(store)[0].type === 'eligibility_changed' && history.eventsOf(store)[0].field === 'claimRequirements');
}

{
  const before = deal({ category: 'API服务' });
  const after = deal({ category: '编程开发' });
  const { store } = history.record(seeded([before]), { previous: [before], next: [after], ...run() });
  check('分类变化 → updated', history.eventsOf(store)[0].type === 'updated');
}

{
  const before = deal();
  const after = deal({ expiresAt: '2026-12-01' });
  const { store } = history.record(seeded([before]), {
    previous: [before], next: [after], ...run({ derivedFields: new Set(['expiresAt']) })
  });
  check('由规则推导的字段标成 derived', history.eventsOf(store)[0].origin === 'derived');
}

/* ------------------------------------------------------------------ */
section('④ created 与新记录的锚点');

{
  const fresh = deal({ id: ID_B, title: '新优惠' });
  const { store, stats } = history.record(seeded([deal()]), { previous: [deal()], next: [deal(), fresh], ...run({ freshIds: [ID_A, ID_B] }) });
  const created = history.eventsOf(store).find(e => e.type === 'created');
  check('新记录 → created（带 fields 快照）', stats.byType.created === 1 && created && created.id === ID_B && created.fields.discountInfo === '新用户 100 万 tokens');
  check('created 之后 verifyStore 通过', history.verifyStore(store, [deal(), fresh], { today: '2026-09-30' }).length === 0);

  const second = history.record(store, { previous: [deal()], next: [deal(), fresh], ...run({ freshIds: [ID_A, ID_B] }) });
  check('重复调用不重复追加 created', second.stats.appended === 0);
  check('重复调用字节不变（幂等）', JSON.stringify(second.store) === JSON.stringify(store));
}

/* ------------------------------------------------------------------ */
section('⑤ ended：数据集移除与来源不再列出');

{
  const before = deal();
  const removed = new Map([[ID_A, 'pruned_expired']]);
  const { store, stats } = history.record(seeded([before]), { previous: [before], next: [], ...run({ freshIds: [], removed }) });
  const event = history.eventsOf(store)[0];
  check('记录离开数据集 → ended(pruned_expired)', stats.byType.ended === 1 && event.reason === 'pruned_expired');
  check('已移除记录仍有 ended 时 verifyStore 通过', history.verifyStore(store, [], { today: '2026-09-30' }).length === 0);
}

{
  const before = deal();
  let store = seeded([before]).baseline ? seeded([before]) : seeded([before]);
  const first = history.record(store, { previous: [before], next: [before], ...run({ freshIds: [] }) });
  check('未见 1 次 → 不记 ended（避免一次抖动就报消失）', first.stats.byType.ended === 0);
  const second = history.record(first.store, { previous: [before], next: [before], ...run({ freshIds: [], runAt: '2026-09-30T02:00:00.000Z' }) });
  const ended = history.eventsOf(second.store).find(e => e.type === 'ended');
  check('连续 2 次未见 → ended(source_no_longer_lists)', second.stats.byType.ended === 1 && ended.reason === 'source_no_longer_lists');
  check('记了 firstMissedAt', ended.firstMissedAt === '2026-09-30');

  const third = history.record(second.store, { previous: [before], next: [before], ...run({ freshIds: [], runAt: '2026-09-30T03:00:00.000Z' }) });
  check('已 ended 后不再重复计数', third.stats.byType.ended === 0);
  check('ended 后 verifyStore 仍通过（记录还在数据集里）', history.verifyStore(second.store, [before], { today: '2026-09-30' }).length === 0);
}

{
  const before = deal({ source: 'Futuretools' });
  const first = history.record(seeded([before]), { previous: [before], next: [before], ...run({ freshIds: [], absenceEligibleSources: [] }) });
  const second = history.record(first.store, { previous: [before], next: [before], ...run({ freshIds: [], absenceEligibleSources: [] }) });
  check('来源本轮不可信（失败/骤降/零产出）→ 永不记 ended', first.stats.byType.ended === 0 && second.stats.byType.ended === 0);
}

{
  const before = deal({ source: 'Curated-CN', id: ID_C });
  const first = history.record(seeded([before]), { previous: [before], next: [before], ...run({ freshIds: [], absenceEligibleSources: ['Curated-CN'] }) });
  const second = history.record(first.store, { previous: [before], next: [before], ...run({ freshIds: [], absenceEligibleSources: ['Curated-CN'], runAt: '2026-09-30T02:00:00.000Z' }) });
  check('人工策展条目不参与「未见」判定', first.stats.byType.ended === 0 && second.stats.byType.ended === 0);
}

/* ------------------------------------------------------------------ */
section('⑥ restored：消失后重现');

{
  const before = deal();
  const first = history.record(seeded([before]), { previous: [before], next: [before], ...run({ freshIds: [] }) });
  const second = history.record(first.store, { previous: [before], next: [before], ...run({ freshIds: [], runAt: '2026-09-30T02:00:00.000Z' }) });
  const third = history.record(second.store, { previous: [before], next: [before], ...run({ freshIds: [ID_A], runAt: '2026-09-30T03:00:00.000Z' }) });
  check('来源重新列出 → restored', third.stats.byType.restored === 1);
  check('restored 后 verifyStore 通过', history.verifyStore(third.store, [before], { today: '2026-09-30' }).length === 0);
}

{
  const before = deal();
  const removed = new Map([[ID_A, 'pruned_expired']]);
  const ended = history.record(seeded([before]), { previous: [before], next: [], ...run({ freshIds: [], removed }) });
  const back = history.record(ended.store, { previous: [], next: [before], ...run({ freshIds: [ID_A], runAt: '2026-10-05T01:00:00.000Z' }) });
  check('离开数据集后重现 → restored（不是 created）',
    back.stats.byType.restored === 1 && back.stats.byType.created === 0);
  check('重现时字段一致 → 不补字段事件', back.stats.appended === 1);
  check('重现后 verifyStore 通过', history.verifyStore(back.store, [before], { today: '2026-10-05' }).length === 0);
}

/* ------------------------------------------------------------------ */
section('⑦ 门禁必须能红（每条都真的变红）');

{
  const before = deal();
  const after = deal({ discountInfo: '改过了' });
  const { store } = history.record(seeded([before]), { previous: [before], next: [after], ...run() });

  const broken = JSON.parse(JSON.stringify(store));
  broken.events[0].from = '被人手改过的旧值';
  check('链断裂 → 红', history.verifyStore(broken, [after], { today: '2026-09-30' }).some(p => p.includes('链断裂')));

  const drift = JSON.parse(JSON.stringify(store));
  const tampered = deal({ discountInfo: '没记进历史的新值' });
  check('现状与历史不一致 → 红', history.verifyStore(drift, [tampered], { today: '2026-09-30' }).some(p => p.includes('现状与历史不一致')));

  const vanished = JSON.parse(JSON.stringify(seeded([before])));
  check('记录从 deals.json 消失却没有 ended → 红', history.verifyStore(vanished, [], { today: '2026-09-30' }).some(p => p.includes('没有对应的 ended')));

  const orphan = { ...history.emptyStore({ at: '2026-09-30' }), events: [{ id: ID_A, at: '2026-09-30', type: 'restored', field: null, from: null, to: null }] };
  check('restored 之前没有 ended → 红', history.verifyStore(orphan, [], { today: '2026-09-30' }).some(p => p.includes('restored 之前没有 ended')));

  const untracked = { ...history.emptyStore({ at: '2026-09-30' }), events: [{ id: ID_A, at: '2026-09-30', type: 'updated', field: 'description', from: 'a', to: 'b' }] };
  check('未跟踪字段进日志 → 红', history.verifyStore(untracked, [], { today: '2026-09-30' }).some(p => p.includes('未跟踪字段')));

  const future = JSON.parse(JSON.stringify(store));
  future.events[0].at = '2099-01-01';
  check('未来日期 → 红', history.verifyStore(future, [after], { today: '2026-09-30' }).some(p => p.includes('未来日期')));

  const noAnchor = { ...history.emptyStore({ at: '2026-09-30' }), baseline: { at: '2026-09-30', note: '', fields: {} }, events: [] };
  check('当前记录没有锚点 → 红', history.verifyStore(noAnchor, [before], { today: '2026-09-30' }).some(p => p.includes('没有历史锚点')));

  const noop = { ...history.emptyStore({ at: '2026-09-30' }), events: [{ id: ID_A, at: '2026-09-30', type: 'updated', field: 'category', from: 'x', to: 'x' }] };
  check('from 与 to 相同的「假变化」→ 红', history.verifyStore(noop, [], { today: '2026-09-30' }).some(p => p.includes('不是一个变化')));

  const huge = { ...history.emptyStore({ at: '2026-09-30' }), baseline: { at: '2026-09-30', note: '', fields: {} }, events: [] };
  for (let i = 0; i <= history.LIMITS.eventsTotal; i++) huge.events.push({ id: ID_A, at: '2026-09-30', type: 'updated', field: 'category', from: null, to: 'x' });
  check('事件总数超上限 → 红（不自动截断）', history.verifyStore(huge, [], { today: '2026-09-30' }).some(p => p.includes('超过上限')));

  check('文件体积超上限 → 红', history.verifyStore(history.emptyStore({ at: '2026-09-30' }), [], { today: '2026-09-30', bytes: history.LIMITS.fileBytes + 1 }).some(p => p.includes('字节超过上限')));
}

/* ------------------------------------------------------------------ */
section('⑧ 渲染视图有界');

{
  let prev = deal();
  let store = seeded([prev]);
  for (let i = 0; i < 30; i++) {
    const next = deal({ discountInfo: `第 ${i} 版` });
    store = history.record(store, { previous: [prev], next: [next], ...run({ runAt: `2026-09-30T${String(i).padStart(2, '0')}:00:00.000Z` }) }).store;
    prev = next;
  }
  // 此数字锚在本地夹具上，不随生产数据漂移（30 就是上面那个 `for (let i = 0; i < 30; i++)` 循环的次数）。
  check('连续 30 次变化 → 30 条事件（链式）', history.eventsOf(store).length === 30,
    `实得 ${history.eventsOf(store).length}`);
  const view = history.historyFor(store, ID_A, { limit: 5 });
  check('historyFor 只取最近 N 条', view.events.length === 5 && view.total === 30 && view.shown === 5,
    JSON.stringify({ len: view.events.length, total: view.total, shown: view.shown }));
  check('historyFor 带起算日', view.startedAt === '2026-09-30');
  check('无事件的记录 → null（页面说「暂无变更记录」）', history.historyFor(store, ID_B) === null);
  check('attachToDeals 不改入参', (() => {
    const list = [deal()];
    history.attachToDeals(list, store, { limit: 2 });
    return list[0].history === undefined;
  })());
}

/* ------------------------------------------------------------------ */
section('⑨ 墓碑标签（v1.5 的向后兼容扩展）');

{
  // 删除一条记录（它离开了数据集）→ ended 上应带上标题快照
  const before = [deal(), deal({ id: ID_B, title: 'B 优惠', vendor: 'B 厂商' })];
  const store = seeded(before);
  const labels = new Map([
    [ID_B, { title: 'B 优惠', vendor: 'B 厂商' }],
    [ID_C, { title: '   ', vendor: 'C 厂商' }],   // 空标题 → 视为没有快照
    [ID_A, { title: '' }]
  ]);
  const removed = new Map([[ID_B, 'pruned_expired']]);
  const { store: next } = history.record(store, run({
    previous: before, next: [deal()], removed, labels, absenceEligibleSources: []
  }));
  const endedB = next.events.find(event => event.id === ID_B && event.type === 'ended');
  check('ended 带上墓碑标签（离开数据集后还能认出是谁）',
    Boolean(endedB) && endedB.label && endedB.label.title === 'B 优惠' && endedB.label.vendor === 'B 厂商');
  check('墓碑标签不影响链校验与重放', history.verifyStore(next, [deal()], { today: '2026-09-30' }).length === 0);

  const noLabels = history.record(seeded(before), run({
    previous: before, next: [deal()], removed, absenceEligibleSources: []
  })).store;
  const endedNoLabel = noLabels.events.find(event => event.id === ID_B && event.type === 'ended');
  check('不传 labels 时 ended 依然合法（v1.4 行为的向后兼容）',
    Boolean(endedNoLabel) && endedNoLabel.label === undefined &&
    history.verifyStore(noLabels, [deal()], { today: '2026-09-30' }).length === 0);

  const blank = history.record(seeded([deal({ id: ID_C })]), run({
    previous: [deal({ id: ID_C })], next: [], removed: new Map([[ID_C, 'withdrawn']]),
    labels, absenceEligibleSources: []
  })).store;
  const endedC = blank.events.find(event => event.id === ID_C && event.type === 'ended');
  check('标题为空的快照不会被写进日志（空标本等于没有标本）', Boolean(endedC) && endedC.label === undefined);

  // 形状校验的牙齿：四种坏标本都必须红
  const base = JSON.parse(JSON.stringify(next));
  const mutate = fn => { const copy = JSON.parse(JSON.stringify(base)); fn(copy); return copy; };
  const at = copy => copy.events.find(event => event.id === ID_B && event.type === 'ended');
  const cases = [
    ['label 不是对象', copy => { at(copy).label = 'B 优惠'; }],
    ['title 为空', copy => { at(copy).label = { title: '   ' }; }],
    ['含未知键', copy => { at(copy).label = { title: 'B 优惠', sneaky: 1 }; }],
    ['vendor 不是字符串', copy => { at(copy).label = { title: 'B 优惠', vendor: 42 }; }]
  ];
  for (const [why, fn] of cases) {
    const problems = history.verifyStore(mutate(fn), [deal()], { today: '2026-09-30' });
    check(`墓碑形状：${why} → 必红`, problems.some(text => text.includes('label')), problems.slice(0, 2).join('；'));
  }
  // 字段事件带墓碑标签：链本身完全正确（from = 基线值、to = 文件当前值），
  // 唯一的毛病就是「label 挂错了事件类型」—— 这样报出来的就必须正好是这一条。
  const fieldLabelStore = {
    schemaVersion: 1,
    startedAt: '2026-09-30',
    baseline: { at: '2026-09-30', note: '夹具', fields: { [ID_A]: { discountInfo: '旧值', type: 'deal' } } },
    absence: {},
    events: [{ id: ID_A, at: '2026-09-30', type: 'benefit_changed', field: 'discountInfo', from: '旧值', to: '新值', label: { title: 'x' } }]
  };
  const fieldLabel = history.verifyStore(fieldLabelStore,
    [{ id: ID_A, type: 'deal', title: '示例', discountInfo: '新值' }], { today: '2026-09-30' });
  check('墓碑形状：字段事件带 label → 必红',
    fieldLabel.some(text => text.includes('label')) && fieldLabel.length === 1, fieldLabel.join('；'));
}

/* ------------------------------------------------------------------ */
section('⑩ 真实数据不变量');

{
  const loaded = history.load();
  check('scripts/data/deal-history.json 存在且可解析', !loaded.missing && !loaded.broken);
  if (!loaded.missing && !loaded.broken) {
    const deals = JSON.parse(fs.readFileSync(path.join(ROOT, 'deals.json'), 'utf8')).deals;
    const bytes = fs.statSync(loaded.file).size;
    const problems = history.verifyStore(loaded.store, deals, { today: new Date().toISOString().slice(0, 10), bytes });
    check('真实历史与真实数据一致', problems.length === 0, problems.slice(0, 3).join('；'));
    check('真实文件在上限内', bytes <= history.LIMITS.fileBytes);
  }
}

/* ------------------------------------------------------------------ */
console.log(`\n=== v1.4 优惠历史演练：${passed} 项通过，${failures.length} 项失败 ===`);
if (failures.length) {
  for (const item of failures) console.log(`  ✗ ${item.name}${item.detail ? ` —— ${item.detail}` : ''}`);
  process.exit(1);
}
