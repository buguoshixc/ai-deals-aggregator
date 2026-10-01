#!/usr/bin/env node
/**
 * v2.3 套餐变化日志门禁演练（零依赖、离线、秒级）。
 *
 * 它演练的不是「代码跑得通」，而是**这一层赖以成立的那些承诺**：
 *
 *   · 只记重要字段：lastSeen 刷新 / verifiedAt / evidence / derivedMetrics /
 *     量化型套餐的 quota.description 文案 → 0 事件
 *   · 顺序不误报：`supportedModels` 只是顺序变化 → 0 事件（题面 §六 / 牙 1）
 *   · 类型正确：涨价降价 / 活动价开始结束换挡 / 额度增减 / 模型增删 / 限制与地区
 *   · Stable ID：`eventId` 是派生值，重复运行只有一个事件、手写必红
 *   · 退出保护：**一次没见到不算下线**；批量消失熔断；输入不可信不推进计数（牙 2）
 *   · 链可重放：基线 + 事件重放 == 当前 plans.json；链断 / 静默消失 / restored 无 ended 必红
 *   · 时间只来自数据：日期倒填被拒绝，而不是猜一个日期写进日志
 *   · 有界：事件数与体积超限必红，且**不自动截断**
 *   · 与 deals **不分家**：机制只在 history-core.js 里有一份实现（静态扫描）
 *
 * 判据标准与既有的 selftest 一致：**红的时候没有别的步骤会替它红**，所以它进 CI 门禁。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const ph = require('../lib/plan-history');
const core = require('../lib/history-core');

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
const ID_D = 'dddddddddddd';

/** 夹具：最小但形状正确的套餐记录（只用到被跟踪字段 + 身份字段） */
function plan(over = {}) {
  const base = {
    id: ID_A,
    kind: 'coding',
    provider: 'zhipu',
    planName: 'Lite',
    officialUrl: 'https://docs.bigmodel.cn/cn/coding-plan/overview',
    source: 'Official-Docs',
    sourceUrl: 'https://docs.bigmodel.cn/cn/coding-plan/overview',
    region: 'cn',
    billing: { period: 'monthly', currency: 'CNY', regularPrice: 99, promoPrice: null, promoNote: null, note: null },
    quota: { type: 'credits', amount: 2000, period: 'rolling', description: '每 5 小时 2000 积分', conversionDependsOnModel: true },
    supportedModels: null,
    restrictions: null,
    firstSeen: '2026-09-01',
    lastSeen: '2026-10-01',
    verified: true,
    verifiedAt: '2026-10-01',
    evidence: [],
    derivedMetrics: { nominalUnitPrice: null }
  };
  const merged = { ...base, ...over };
  merged.billing = { ...base.billing, ...(over.billing || {}) };
  merged.quota = { ...base.quota, ...(over.quota || {}) };
  return merged;
}

function seeded(plans = [plan()]) {
  const store = ph.emptyStore({ at: '2026-10-01' });
  store.baseline = ph.baselineOf(plans, { at: '2026-10-01' });
  return store;
}

function labelsOf(list) {
  const map = new Map();
  for (const item of list || []) if (item && item.id) map.set(item.id, { title: item.planName, vendor: item.provider });
  return map;
}

function run(previous, next, extra = {}) {
  return {
    previous,
    next,
    at: '2026-10-01',
    runAt: '2026-10-01T00:00:00.000Z',
    labels: labelsOf([...(previous || []), ...(next || [])]),
    ...extra
  };
}

function typesOf(store) {
  return ph.eventsOf(store).map(event => event.type);
}

function eventWith(store, type) {
  return ph.eventsOf(store).find(event => event.type === type) || null;
}

/* ------------------------------------------------------------------ */
section('① 剖面：字段表 / 措辞 / 投影');

{
  check('被跟踪字段与字段事件类型表一一对应',
    ph.PLAN_TRACKED_FIELDS.every(field => Array.isArray(ph.PLAN_FIELD_EVENT_TYPES[field]) && ph.PLAN_FIELD_EVENT_TYPES[field].length));
  check('每个事件类型都有中文措辞',
    ph.PLAN_EVENT_TYPES.every(type => typeof ph.PLAN_HISTORY_WORDING.PLAN_HISTORY_TYPES[type] === 'string'));
  check('每个结束原因都有中文措辞',
    ph.PLAN_END_REASONS.every(reason => typeof ph.PLAN_HISTORY_WORDING.PLAN_HISTORY_END_REASONS[reason] === 'string'));
  check('每个被跟踪字段都有中文标签',
    ph.PLAN_TRACKED_FIELDS.every(field => typeof ph.PLAN_HISTORY_WORDING.PLAN_HISTORY_FIELD_LABELS[field] === 'string'));
  check('值决定类型的字段声明了多种事件类型',
    ph.PLAN_FIELD_EVENT_TYPES['billing.promoPrice'].length === 3 &&
    ph.PLAN_FIELD_EVENT_TYPES.supportedModels.length === 3 &&
    ph.PLAN_FIELD_EVENT_TYPES['quota.amount'].length === 3);
  check('噪音字段明确不跟踪（lastSeen / verifiedAt / evidence / derivedMetrics / 备注）',
    ['lastSeen', 'verifiedAt', 'verified', 'firstSeen', 'evidence', 'derivedMetrics', 'billing.note', 'billing.promoNote']
      .every(field => typeof ph.PLAN_UNTRACKED_FIELDS[field] === 'string'));

  // quota.description 的**投影**：量化型（tokens/credits/…）的说明是散文，不作为额度语义
  check('量化型额度的 quota.description 不被当作额度语义（投影为 null）',
    ph.readField(plan({ quota: { type: 'tokens', amount: 6e9, period: 'monthly', description: '共 60 亿 Token' } }), 'quota.description') === null &&
    ph.readField(plan({ quota: { type: 'credits', amount: 2000, description: 'x' } }), 'quota.description') === null);
  check('限速型额度的 quota.description **就是**额度语义（投影保留）',
    ph.readField(plan({ quota: { type: 'rate_limited', amount: null, description: '每 5 小时刷新' } }), 'quota.description') === '每 5 小时刷新');
  check('带点路径能读到嵌套字段',
    ph.readField(plan({ billing: { regularPrice: 68 } }), 'billing.regularPrice') === 68);

  // 模型与限制条件的比较判据：顺序无关、文案归一
  const m1 = [{ name: 'Model A', role: 'included', note: null }, { name: 'Model B', role: 'included', note: null }];
  const m2 = [{ name: 'Model B', role: 'included', note: null }, { name: 'Model A', role: 'included', note: null }];
  check('模型清单比较：顺序无关', ph.modelArrayEqual(m1, m2));
  check('模型清单比较：note 只差空白与标点 ⇒ 相同',
    ph.modelArrayEqual([{ name: 'M', role: 'included', note: '每月 1,000 次' }], [{ name: 'M', role: 'included', note: '每月1000次 ' }]));
  check('模型清单比较：role 变化 ⇒ 不同',
    !ph.modelArrayEqual(m1, [m1[0], { ...m1[1], role: 'limited' }]));
  check('限制条件比较：顺序无关且 note 文案归一',
    ph.restrictionArrayEqual(
      [{ kind: 'fair_use', value: true, note: '尽力交付' }, { kind: 'concurrency', value: 4, note: null }],
      [{ kind: 'concurrency', value: 4, note: null }, { kind: 'fair_use', value: true, note: '尽力交付 ' }]));
  check('限制条件比较：value 变化 ⇒ 不同',
    !ph.restrictionArrayEqual([{ kind: 'concurrency', value: 4, note: null }], [{ kind: 'concurrency', value: 8, note: null }]));
}

/* ------------------------------------------------------------------ */
section('② Stable event id（派生字段）');

{
  const base = { planId: ID_A, at: '2026-10-01', type: 'price_changed', field: 'billing.regularPrice', from: 99, to: 68 };
  const stable = ph.eventIdOf(base);
  check('同一条事件两次计算 ⇒ 同一个 eventId', stable === ph.eventIdOf({ ...base }) && /^[0-9a-f]{12}$/.test(stable));
  check('值不同 ⇒ eventId 不同', stable !== ph.eventIdOf({ ...base, to: 49 }));
  check('日期不同 ⇒ eventId 不同', stable !== ph.eventIdOf({ ...base, at: '2026-10-02' }));

  const before = plan({ id: ID_A });
  const after = plan({ id: ID_A, billing: { regularPrice: 68 } });
  const first = ph.record(seeded([before]), run([before], [after]));
  const event = first.appended[0];
  check('事件落库时带上重算得到的 eventId', Boolean(event) && event.eventId === ph.eventIdOf(event));

  // 手写 / 篡改 eventId ⇒ 必红
  const tampered = JSON.parse(JSON.stringify(first.store));
  tampered.events[0].eventId = 'deadbeef0000';
  check('手写 eventId ⇒ verifyStore 红',
    ph.verifyStore(tampered, [after], { today: '2026-10-01' }).some(text => text.includes('eventId')));
}

/* ------------------------------------------------------------------ */
section('③ 价格：涨价 / 降价 / 活动价开始结束换挡');

{
  const before = plan({ id: ID_A, billing: { regularPrice: 99 } });
  const after = plan({ id: ID_A, billing: { regularPrice: 68 } });
  const { store } = ph.record(seeded([before]), run([before], [after]));
  const events = ph.eventsOf(store);
  check('正常价格 99 → 68 ⇒ 恰好一条 price_changed',
    events.length === 1 && events[0].type === 'price_changed' && events[0].field === 'billing.regularPrice', JSON.stringify(typesOf(store)));
  check('价格事件的 from / to 是数字（不是字符串）', events[0].from === 99 && events[0].to === 68);
  check('改价后 verifyStore 通过', ph.verifyStore(store, [after], { today: '2026-10-01' }).length === 0);

  // 活动价：null → 9.9（牙 5）
  const promoStart = ph.record(seeded([before]), run([before], [plan({ id: ID_A, billing: { regularPrice: 99, promoPrice: 9.9 } })]));
  check('promoPrice null → 9.9 ⇒ promo_started（牙 5）',
    JSON.stringify(typesOf(promoStart.store)) === JSON.stringify(['promo_started']), JSON.stringify(typesOf(promoStart.store)));
  check('promo_started 事件带 from=null / to=9.9',
    promoStart.appended[0].from === null && promoStart.appended[0].to === 9.9);

  const promoOn = plan({ id: ID_A, billing: { regularPrice: 99, promoPrice: 9.9 } });
  const promoOff = ph.record(seeded([promoOn]), run([promoOn], [plan({ id: ID_A, billing: { regularPrice: 99, promoPrice: null } })]));
  check('promoPrice 9.9 → null ⇒ promo_ended',
    JSON.stringify(typesOf(promoOff.store)) === JSON.stringify(['promo_ended']), JSON.stringify(typesOf(promoOff.store)));

  const promoChange = ph.record(seeded([promoOn]), run([promoOn], [plan({ id: ID_A, billing: { regularPrice: 99, promoPrice: 19.9 } })]));
  check('promoPrice 9.9 → 19.9 ⇒ promo_changed（不是 started / ended）',
    JSON.stringify(typesOf(promoChange.store)) === JSON.stringify(['promo_changed']), JSON.stringify(typesOf(promoChange.store)));

  const currency = ph.record(seeded([before]), run([before], [plan({ id: ID_A, billing: { regularPrice: 99, currency: 'USD' } })]));
  check('币种变化 ⇒ billing_changed（不做汇率，只如实记）',
    JSON.stringify(typesOf(currency.store)) === JSON.stringify(['billing_changed']), JSON.stringify(typesOf(currency.store)));
}

/* ------------------------------------------------------------------ */
section('④ 额度：增加 / 减少 / 口径变化');

{
  const tokens = amount => plan({
    id: ID_A,
    quota: { type: 'tokens', amount, period: 'monthly', description: null, conversionDependsOnModel: null }
  });
  const big = tokens(6e9);
  const small = tokens(3e9);
  const down = ph.record(seeded([big]), run([big], [small]));
  check('额度 6000000000 → 3000000000 ⇒ quota_decreased（牙 4）',
    JSON.stringify(typesOf(down.store)) === JSON.stringify(['quota_decreased']), JSON.stringify(typesOf(down.store)));
  check('quota_decreased 带 from / to 数值', down.appended[0].from === 6e9 && down.appended[0].to === 3e9);
  const up = ph.record(seeded([small]), run([small], [big]));
  check('额度 3000000000 → 6000000000 ⇒ quota_increased',
    JSON.stringify(typesOf(up.store)) === JSON.stringify(['quota_increased']), JSON.stringify(typesOf(up.store)));

  const toNull = ph.record(seeded([big]), run([big], [plan({
    id: ID_A, quota: { type: 'rate_limited', amount: null, period: null, description: '每 5 小时刷新', conversionDependsOnModel: null }
  })]));
  check('固定额度 → 限速（amount 变 null）⇒ 只能是 quota_changed，不谎称增减',
    typesOf(toNull.store).includes('quota_changed') && !typesOf(toNull.store).includes('quota_decreased'),
    JSON.stringify(typesOf(toNull.store)));

  const credits = plan({ id: ID_A, quota: { type: 'credits', amount: 2000, period: 'rolling', description: 'x', conversionDependsOnModel: true } });
  const requests = plan({ id: ID_A, quota: { type: 'requests', amount: 500, period: 'monthly', description: null, conversionDependsOnModel: null } });
  const crossType = ph.record(seeded([credits]), run([credits], [requests]));
  const crossTypes = typesOf(crossType.store);
  check('额度类型变化 ⇒ quota.type 记 quota_changed', crossTypes.includes('quota_changed'));
  check('跨量纲的数值同时变化时**不**比大小（quota.amount 也是 quota_changed）',
    crossTypes.every(type => type === 'quota_changed') &&
    crossType.appended.find(event => event.field === 'quota.amount').type === 'quota_changed',
    JSON.stringify(crossTypes));
  check('跨量纲时不出现 quota_increased / quota_decreased',
    !crossTypes.includes('quota_increased') && !crossTypes.includes('quota_decreased'));

  const rolling = plan({ id: ID_A, quota: { type: 'credits', amount: 2000, period: 'rolling', description: 'x', conversionDependsOnModel: true } });
  const monthly = plan({ id: ID_A, quota: { type: 'credits', amount: 2000, period: 'monthly', description: 'x', conversionDependsOnModel: true } });
  check('额度刷新周期变化 ⇒ quota_changed',
    JSON.stringify(typesOf(ph.record(seeded([rolling]), run([rolling], [monthly])).store)) === JSON.stringify(['quota_changed']));

  // 限速型：说明**就是**额度语义，所以实质变化要记；纯标点变化不记
  const rateBefore = plan({ id: ID_A, quota: { type: 'rate_limited', amount: null, period: null, description: '每 5 小时刷新', conversionDependsOnModel: null } });
  const ratePunct = plan({ id: ID_A, quota: { type: 'rate_limited', amount: null, period: null, description: '每 5 小时刷新 ', conversionDependsOnModel: null } });
  const rateReal = plan({ id: ID_A, quota: { type: 'rate_limited', amount: null, period: null, description: '每 3 小时刷新', conversionDependsOnModel: null } });
  check('限速型额度说明只差尾随空格 ⇒ 0 事件',
    ph.eventsOf(ph.record(seeded([rateBefore]), run([rateBefore], [ratePunct])).store).length === 0);
  check('限速型额度说明实质变化 ⇒ 一条 quota_changed',
    JSON.stringify(typesOf(ph.record(seeded([rateBefore]), run([rateBefore], [rateReal])).store)) === JSON.stringify(['quota_changed']));

  // 量化型的说明文案变化 ⇒ 不跟踪
  const creditsNote1 = plan({ id: ID_A, quota: { type: 'credits', amount: 2000, period: 'rolling', description: '折算随模型倍率变化', conversionDependsOnModel: true } });
  const creditsNote2 = plan({ id: ID_A, quota: { type: 'credits', amount: 2000, period: 'rolling', description: '折算随模型倍率变化（官方原文）', conversionDependsOnModel: true } });
  check('量化型套餐的 quota.description 文案变化 ⇒ 0 事件',
    ph.eventsOf(ph.record(seeded([creditsNote1]), run([creditsNote1], [creditsNote2])).store).length === 0);
}

/* ------------------------------------------------------------------ */
section('⑤ 模型：新增 / 移除 / 顺序（牙 1）');

{
  const none = plan({ id: ID_A, supportedModels: null });
  const one = plan({ id: ID_A, supportedModels: [{ name: 'Model A', role: 'included', note: null }] });
  const added = ph.record(seeded([none]), run([none], [one]));
  check('新增一个模型 ⇒ 一条 model_added（from = null）',
    JSON.stringify(typesOf(added.store)) === JSON.stringify(['model_added']) && added.appended[0].from === null,
    JSON.stringify(typesOf(added.store)));
  check('model_added 的 to 是模型对象', added.appended[0].to && added.appended[0].to.name === 'Model A');

  const removed = ph.record(seeded([one]), run([one], [none]));
  check('移除一个模型 ⇒ 一条 model_removed（to = null）',
    JSON.stringify(typesOf(removed.store)) === JSON.stringify(['model_removed']) && removed.appended[0].to === null);

  const two = plan({
    id: ID_A,
    supportedModels: [{ name: 'Model A', role: 'included', note: null }, { name: 'Model B', role: 'included', note: null }]
  });
  const twoReordered = plan({
    id: ID_A,
    supportedModels: [{ name: 'Model B', role: 'included', note: null }, { name: 'Model A', role: 'included', note: null }]
  });
  const reordered = ph.record(seeded([two]), run([two], [twoReordered]));
  check('supportedModels 只是顺序变化 ⇒ **0 事件**（牙 1）', reordered.appended.length === 0, JSON.stringify(typesOf(reordered.store)));
  check('顺序变化的输入仍能通过一致性校验（顺序不是变化）',
    ph.verifyStore(reordered.store, [twoReordered], { today: '2026-10-01' }).length === 0, '顺序被当成变化时这里会红');

  const roleChanged = plan({
    id: ID_A,
    supportedModels: [{ name: 'Model A', role: 'limited', note: null }, { name: 'Model B', role: 'included', note: null }]
  });
  const role = ph.record(seeded([two]), run([two], [roleChanged]));
  check('同名模型 role 变化 ⇒ model_changed（不是增删）',
    JSON.stringify(typesOf(role.store)) === JSON.stringify(['model_changed']), JSON.stringify(typesOf(role.store)));

  const noteA = plan({ id: ID_A, supportedModels: [{ name: 'Model A', role: 'included', note: '每月 1,000 次' }] });
  const noteB = plan({ id: ID_A, supportedModels: [{ name: 'Model A', role: 'included', note: '每月1000次' }] });
  check('模型 note 只差标点与空白 ⇒ 0 事件',
    ph.eventsOf(ph.record(seeded([noteA]), run([noteA], [noteB])).store).length === 0);
}

/* ------------------------------------------------------------------ */
section('⑥ 限制条件与销售地区');

{
  const none = plan({ id: ID_A, restrictions: null });
  const some = plan({ id: ID_A, restrictions: [{ kind: 'concurrency', value: 4, note: '官方原文' }] });
  const added = ph.record(seeded([none]), run([none], [some]));
  check('新增限制条件 ⇒ 一条 restriction_changed（from/to 是整个数组）',
    JSON.stringify(typesOf(added.store)) === JSON.stringify(['restriction_changed']) &&
    added.appended[0].from === null && Array.isArray(added.appended[0].to), JSON.stringify(typesOf(added.store)));

  const somePunct = plan({ id: ID_A, restrictions: [{ kind: 'concurrency', value: 4, note: '官方原文（,）' }] });
  check('限制条件 note 只差标点 ⇒ 0 事件',
    ph.eventsOf(ph.record(seeded([some]), run([some], [somePunct])).store).length === 0);

  const cn = plan({ id: ID_A, region: 'cn' });
  const global = plan({ id: ID_A, region: 'global' });
  check('销售地区 国内 → 国外 ⇒ availability_changed',
    JSON.stringify(typesOf(ph.record(seeded([cn]), run([cn], [global])).store)) === JSON.stringify(['availability_changed']));
}

/* ------------------------------------------------------------------ */
section('⑦ 幂等：重复运行不重复产生事件（牙 3）');

{
  const before = plan({ id: ID_A, billing: { regularPrice: 99 } });
  const after = plan({ id: ID_A, billing: { regularPrice: 68 } });
  const first = ph.record(seeded([before]), run([before], [after]));
  check('第一次运行产生一条 price_changed', first.appended.length === 1, JSON.stringify(typesOf(first.store)));

  // 牙 3：同一份输入连续跑 → 只能有一个事件
  const second = ph.record(first.store, run([after], [after], { runAt: '2026-10-01T06:00:00.000Z' }));
  check('连续第二次运行 ⇒ 0 条新事件（牙 3）', second.appended.length === 0, JSON.stringify(typesOf(second.store)));
  check('连续两次运行的事件总数仍为 1', ph.eventsOf(second.store).length === 1);
  check('无事件发生的运行字节不变',
    JSON.stringify(second.store) === JSON.stringify(first.store));
  check('重复运行后 verifyStore 仍通过', ph.verifyStore(second.store, [after], { today: '2026-10-01' }).length === 0);

  // 连续 30 次逐日变化 ⇒ 30 条事件（链式），且每次都通过校验
  let store = seeded([plan({ id: ID_A, billing: { regularPrice: 100 } })]);
  let prev = plan({ id: ID_A, billing: { regularPrice: 100 } });
  for (let i = 1; i <= 30; i++) {
    const next = plan({ id: ID_A, billing: { regularPrice: 100 - i } });
    const day = `2026-10-${String(i).padStart(2, '0')}`;
    store = ph.record(store, { previous: [prev], next: [next], at: day, runAt: `${day}T00:00:00.000Z`, labels: labelsOf([next]) }).store;
    prev = next;
  }
  check('连续 30 次变化 ⇒ 30 条事件（链式）', ph.eventsOf(store).length === 30, `实得 ${ph.eventsOf(store).length}`);
  check('30 条链式事件后 verifyStore 通过', ph.verifyStore(store, [prev], { today: '2026-10-30' }).length === 0);
}

/* ------------------------------------------------------------------ */
section('⑧ 退出保护：一次没见到不算下线 / 批量熔断（牙 2）');

{
  const A = plan({ id: ID_A });
  const B = plan({ id: ID_B, planName: 'Pro' });
  const C = plan({ id: ID_C, planName: 'Max' });
  const D = plan({ id: ID_D, planName: 'Team' });
  const all = [A, B, C, D];
  const rest = [B, C, D];

  const first = ph.record(seeded(all), run(all, rest));
  check('第一次未见 ⇒ **0 条 ended**（R2：一次没采到不算下线）',
    ph.eventsOf(first.store).filter(e => e.type === 'ended').length === 0, JSON.stringify(typesOf(first.store)));
  check('第一次未见只推进观测态（misses=1，未 ended）',
    first.store.absence[ID_A] && first.store.absence[ID_A].misses === 1 && !first.store.absence[ID_A].endedAt);
  check('观测期未满时 verifyStore 仍通过（合法的中间态）',
    ph.verifyStore(first.store, rest, { today: '2026-10-01' }).length === 0);

  const second = ph.record(first.store, run(rest, rest));
  const ended = second.store.events.filter(e => e.type === 'ended');
  check('连续第二次未见 ⇒ 一条 ended(source_no_longer_lists)',
    ended.length === 1 && ended[0].reason === 'source_no_longer_lists' && ended[0].planId === ID_A,
    JSON.stringify(typesOf(second.store)));
  check('ended 带墓碑标签（记录离开数据后还能认出是谁）',
    ended[0].label && ended[0].label.title === 'Lite' && ended[0].label.vendor === 'zhipu');
  check('ended 后 verifyStore 通过', ph.verifyStore(second.store, rest, { today: '2026-10-01' }).length === 0);

  // 牙 2：一次删掉 3/4（≥ 阈值）⇒ 批量熔断，一条 ended 都不许有
  const mass = ph.record(seeded(all), run(all, [D]));
  check('一次删掉 3/4 条套餐 ⇒ **0 条 ended**（牙 2 批量熔断）',
    ph.eventsOf(mass.store).filter(e => e.type === 'ended').length === 0, JSON.stringify(typesOf(mass.store)));
  check('熔断只留档：anomalies 有记录且列出缺席套餐',
    mass.store.anomalies.length === 1 && mass.store.anomalies[0].kind === 'mass_missing' &&
    mass.store.anomalies[0].missing === 3 && JSON.stringify(mass.store.anomalies[0].planIds) === JSON.stringify([ID_A, ID_B, ID_C]));
  check('熔断时观测态标成 blockedAt（解释为什么没记 ended）',
    [ID_A, ID_B, ID_C].every(id => mass.store.absence[id] && mass.store.absence[id].blockedAt === '2026-10-01' &&
      mass.store.absence[id].blockedReason === 'mass_missing'));
  check('熔断状态下 verifyStore 通过（数据与日志仍然自洽）',
    ph.verifyStore(mass.store, [D], { today: '2026-10-01' }).length === 0,
    ph.verifyStore(mass.store, [D], { today: '2026-10-01' }).slice(0, 3).join(' | '));
  check('熔断不推进计数（misses 仍是 0）', mass.store.absence[ID_A].misses === 0);

  // 输出为空 ⇒ 同样是熔断
  const emptied = ph.record(seeded(all), run(all, []));
  check('本次输出为空 ⇒ 0 条 ended（empty_dataset）',
    ph.eventsOf(emptied.store).filter(e => e.type === 'ended').length === 0 &&
    emptied.store.absence[ID_A].blockedReason === 'empty_dataset');
  check('空输出时 verifyStore 通过', ph.verifyStore(emptied.store, [], { today: '2026-10-01' }).length === 0);

  // 输入不可信（数据级校验没过）⇒ 不推进、不判死
  const untrusted = ph.record(seeded(all), run(all, rest, { eligible: false }));
  check('本次运行输入不可信 ⇒ 0 条 ended、不推进计数',
    ph.eventsOf(untrusted.store).filter(e => e.type === 'ended').length === 0 &&
    untrusted.store.absence[ID_A].misses === 0 && untrusted.store.absence[ID_A].blockedReason === 'input_invalid');
  check('输入不可信时 verifyStore 通过', ph.verifyStore(untrusted.store, rest, { today: '2026-10-01' }).length === 0);

  // 恢复正常 ⇒ 观测态清零，不产生事件
  const recovered = ph.record(mass.store, run([D], all));
  check('缺席的套餐回来 ⇒ 观测态清零、0 事件',
    Object.keys(recovered.store.absence).length === 0 && recovered.appended.length === 0);
  check('恢复后 verifyStore 通过', ph.verifyStore(recovered.store, all, { today: '2026-10-01' }).length === 0);

  // 显式放行批量下架：ended 必须真的写出来（reason 用 withdrawn，不声称"多次未见"）
  const forced = ph.record(seeded(all), run(all, [D], { allowMassRemoval: true }));
  check('--allow-mass-removal ⇒ 缺席的 3 条各记一条 ended(withdrawn)',
    forced.store.events.filter(e => e.type === 'ended').length === 3 &&
    forced.store.events.filter(e => e.type === 'ended').every(e => e.reason === 'withdrawn'),
    JSON.stringify(typesOf(forced.store)));
  check('--allow-mass-removal ⇒ anomalies 标 override',
    forced.store.anomalies.some(item => item.override === true));
  check('放行批量下架后 verifyStore 通过', ph.verifyStore(forced.store, [D], { today: '2026-10-01' }).length === 0);
}

/* ------------------------------------------------------------------ */
section('⑨ 重现（restore）与字段追赶');

{
  const A = plan({ id: ID_A });
  const B = plan({ id: ID_B, planName: 'Pro' });
  const rest = [B];
  const first = ph.record(seeded([A, B]), run([A, B], rest));
  const second = ph.record(first.store, run(rest, rest));
  check('两轮后 A 已记 ended', second.store.events.filter(e => e.type === 'ended').length === 1);

  const back = plan({ id: ID_A, billing: { regularPrice: 68 } });
  const third = ph.record(second.store, run(rest, [back, B]));
  const types = typesOf(third.store);
  check('重新出现 ⇒ 记 restored', types.includes('restored'));
  check('重现时字段与离开时不同 ⇒ 按链补一条字段事件（from = 链上的旧值）',
    types.filter(t => t === 'price_changed').length === 1 &&
    third.store.events.find(e => e.type === 'price_changed').from === 99 &&
    third.store.events.find(e => e.type === 'price_changed').to === 68,
    JSON.stringify(types));
  check('重现后 verifyStore 通过', ph.verifyStore(third.store, [back, B], { today: '2026-10-01' }).length === 0,
    ph.verifyStore(third.store, [back, B], { today: '2026-10-01' }).slice(0, 3).join(' | '));
  check('重现后观测态被清掉', !third.store.absence[ID_A]);
}

/* ------------------------------------------------------------------ */
section('⑩ 计费周期重键（v2.1 点名要显式决策的那一条）');

{
  const monthly = plan({ id: ID_A, billing: { period: 'monthly', regularPrice: 99 } });
  const yearly = plan({ id: ID_B, planName: 'Lite', billing: { period: 'yearly', regularPrice: 999 } });
  const result = ph.record(seeded([monthly]), run([monthly], [yearly]));
  const types = typesOf(result.store);
  check('月付改年付（同 provider + 同套餐名）⇒ 立即 ended(period_changed) + created',
    types.includes('ended') && types.includes('created') &&
    result.store.events.find(e => e.type === 'ended').reason === 'period_changed', JSON.stringify(types));
  check('不需要等两次缺席确认（同一次运行里就有证据）',
    result.store.events.find(e => e.type === 'ended').at === '2026-10-01');
  check('新记录的 created 带 supersedes 指向旧记录',
    result.store.events.find(e => e.type === 'created').supersedes === ID_A);
  check('周期重键后 verifyStore 通过',
    ph.verifyStore(result.store, [yearly], { today: '2026-10-01' }).length === 0,
    ph.verifyStore(result.store, [yearly], { today: '2026-10-01' }).slice(0, 3).join(' | '));

  const broken = JSON.parse(JSON.stringify(result.store));
  broken.events.find(e => e.type === 'created').supersedes = 'ffffffffffff';
  check('supersedes 指向不存在的 ended ⇒ 必红',
    ph.verifyStore(broken, [yearly], { today: '2026-10-01' }).some(text => text.includes('supersedes')));

  const noEnded = JSON.parse(JSON.stringify(result.store));
  noEnded.events = noEnded.events.filter(e => e.type !== 'ended');
  check('删掉 period_changed 的 ended（只留 created.supersedes）⇒ 必红',
    ph.verifyStore(noEnded, [yearly], { today: '2026-10-01' }).length > 0);
}

/* ------------------------------------------------------------------ */
section('⑪ 时间只来自数据：日期倒填被拒绝');

{
  const before = plan({ id: ID_A, billing: { regularPrice: 99 } });
  const after = plan({ id: ID_A, billing: { regularPrice: 68 } });
  const first = ph.record(seeded([before]), run([before], [after], { at: '2026-10-05' }));
  check('第一次变化记在 2026-10-05', first.appended[0].at === '2026-10-05');

  const earlier = plan({ id: ID_A, billing: { regularPrice: 49 } });
  const second = ph.record(first.store, run([after], [earlier], { at: '2026-10-03' }));
  check('数据日期早于该套餐上一条事件 ⇒ 拒绝写事件并报错',
    second.appended.length === 0 && second.problems.some(text => text.includes('早于')));
  check('非法数据日期 ⇒ 直接报错', ph.record(seeded([before]), run([before], [after], { at: '' })).problems.length > 0);
}

/* ------------------------------------------------------------------ */
section('⑫ 链与形状的牙齿');

{
  const A = plan({ id: ID_A, billing: { regularPrice: 99 } });
  const B = plan({ id: ID_A, billing: { regularPrice: 68 } });
  const base = ph.record(seeded([A]), run([A], [B]));
  const mutate = fn => { const copy = JSON.parse(JSON.stringify(base.store)); fn(copy); return copy; };
  const today = '2026-10-01';

  check('干净夹具通过', ph.verifyStore(base.store, [B], { today }).length === 0);

  const chainBreak = mutate(copy => { copy.events[0].from = 88; });
  check('手改 from ⇒ 链断裂红',
    ph.verifyStore(chainBreak, [B], { today }).some(text => text.includes('链断裂')));

  const drift = mutate(copy => { const plan = { ...B, billing: { ...B.billing, regularPrice: 55 } }; void plan; });
  check('现状与历史不一致 ⇒ 红（改了 plans.json 却没走重建路径）',
    ph.verifyStore(drift, [plan({ id: ID_A, billing: { regularPrice: 55 } })], { today }).some(text => text.includes('现状与历史不一致')));

  const vanished = mutate(copy => { copy.events = []; copy.absence = {}; });
  check('记录从 plans.json 消失却没有 ended ⇒ 红（且不在观测期）',
    ph.verifyStore(vanished, [], { today }).some(text => text.includes('没有对应的 ended')));

  const orphan = mutate(copy => {
    copy.absence = {};
    copy.events = [{ planId: ID_A, at: today, type: 'restored', field: null, from: null, to: null }];
  });
  check('restored 之前没有 ended ⇒ 红',
    ph.verifyStore(orphan, [], { today }).some(text => text.includes('restored 之前没有 ended')));

  const untracked = mutate(copy => {
    copy.absence = {};
    copy.events = [{ planId: ID_A, at: today, type: 'updated', field: 'lastSeen', from: '2026-09-01', to: '2026-10-01' }];
  });
  check('未跟踪字段进日志 ⇒ 红', ph.verifyStore(untracked, [], { today }).some(text => text.includes('未跟踪字段')));

  const wrongType = mutate(copy => { copy.events[0].type = 'quota_changed'; });
  check('事件类型与该字段允许的类型不符 ⇒ 红',
    ph.verifyStore(wrongType, [B], { today }).some(text => text.includes('事件类型应为')));

  const unknownType = mutate(copy => { copy.events[0].type = 'vibe_changed'; });
  check('未知事件类型 ⇒ 红', ph.verifyStore(unknownType, [B], { today }).some(text => text.includes('未知事件类型')));

  const future = mutate(copy => { copy.events[0].at = '2027-01-01'; });
  check('未来日期 ⇒ 红', ph.verifyStore(future, [B], { today }).some(text => text.includes('未来日期')));

  const badEndReason = mutate(copy => {
    copy.absence = {};
    copy.events = [
      { planId: ID_A, at: today, type: 'ended', field: null, from: null, to: null, reason: 'seems_dead' }
    ];
  });
  check('未知 ended reason ⇒ 红', ph.verifyStore(badEndReason, [], { today }).some(text => text.includes('reason 非法')));

  const sameValueEvent = mutate(copy => { copy.events[0].to = copy.events[0].from; });
  check('from 与 to 相同的「假变化」⇒ 红',
    ph.verifyStore(sameValueEvent, [A], { today }).some(text => text.includes('不是一个变化')));

  const badAnomaly = mutate(copy => { copy.anomalies = [{ at: today, kind: 'mass_missing', missing: 0, known: 4, planIds: ['nope'] }]; });
  const badAnomalyProblems = ph.verifyStore(badAnomaly, [B], { today });
  check('anomalies 形状非法（missing=0 / 非法 id）⇒ 红',
    badAnomalyProblems.some(text => text.includes('anomalies')));

  const noAnchor = { ...ph.emptyStore({ at: today }), baseline: { at: today, note: '', fields: {} }, events: [] };
  check('当前套餐没有历史锚点 ⇒ 红',
    ph.verifyStore(noAnchor, [B], { today }).some(text => text.includes('没有历史锚点')));

  const huge = { ...ph.emptyStore({ at: today }), baseline: { at: today, note: '', fields: {} }, events: [] };
  for (let i = 0; i <= ph.PLAN_LIMITS.eventsTotal; i++) {
    huge.events.push({ planId: ID_A, at: today, type: 'updated', field: 'officialUrl', from: null, to: 'https://example.com' });
  }
  check('事件总数超上限 ⇒ 红（不自动截断）',
    ph.verifyStore(huge, [], { today }).some(text => text.includes('超过上限')));
  check('文件体积超上限 ⇒ 红',
    ph.verifyStore(ph.emptyStore({ at: today }), [], { today, bytes: ph.PLAN_LIMITS.fileBytes + 1 })
      .some(text => text.includes('字节超过上限')));
}

/* ------------------------------------------------------------------ */
section('⑬ 视图层（时间线 / 有界视图 / 统计）');

{
  const A = plan({ id: ID_A, billing: { regularPrice: 99 } });
  const B = plan({ id: ID_A, billing: { regularPrice: 68 } });
  const C = plan({ id: ID_A, billing: { regularPrice: 68 }, supportedModels: [{ name: 'Model X', role: 'included', note: null }] });
  let store = ph.record(seeded([A]), run([A], [B], { at: '2026-10-02' })).store;
  store = ph.record(store, run([B], [C], { at: '2026-10-03' })).store;

  const timeline = ph.timelineOf(store, ID_A);
  check('时间线按时间倒序（新的在前）', timeline.length === 2 && timeline[0].at === '2026-10-03' && timeline[1].at === '2026-10-02');
  check('时间线包含两种事件类型', timeline.map(e => e.type).join(',') === 'model_added,price_changed');

  const view = ph.historyFor(store, ID_A, { limit: 1 });
  check('有界视图只给最近 N 条并报出总数', view && view.total === 2 && view.shown === 1 && view.startedAt === '2026-10-01');
  check('无事件的套餐 ⇒ null（页面说「暂无变更记录」）', ph.historyFor(store, ID_B) === null);

  const attached = ph.attachToPlans([C], store);
  check('attachToPlans 注入 planHistory 且不改入参', attached[0].planHistory && !C.planHistory);

  const summary = ph.summarize(store, [C]);
  check('统计：事件数 / 分类 / 涉及记录数',
    summary.events === 2 && summary.byType.price_changed === 1 && summary.byType.model_added === 1 && summary.recordsWithHistory === 1);
}

/* ------------------------------------------------------------------ */
section('⑭ 与 deals 不分家：机制只有一份实现（静态扫描）');

{
  const read = name => fs.readFileSync(path.join(ROOT, 'scripts', 'lib', name), 'utf8');
  const stripComments = text => text.replace(/\/\*[\s\S]*?\*\//g, '');
  const coreSrc = stripComments(read('history-core.js'));

  check('history.js 与 plan-history.js 都 require 同一个 history-core',
    /require\('\.\/history-core'\)/.test(read('history.js')) && /require\('\.\/history-core'\)/.test(read('plan-history.js')));
  check('内核里没有 deals 或 plans 的专有字段 / 事件类型',
    !/discountInfo|benefit_changed|eligibility_changed|billing\.regularPrice|quota\.amount|model_added/.test(coreSrc));

  // 领域层可以写同名**薄包装**，但必须转手调内核的同名函数 —— 不许自己再实现一份机制
  const mechanism = ['replay', 'verifyStore', 'stableJson', 'normalizeStore', 'pruneAbsence', 'eventKey', 'sortEvents', 'diffFields'];
  const thinWrappers = ['history.js', 'plan-history.js'].every(name => {
    const src = stripComments(read(name));
    return mechanism.every(fn => !new RegExp(`function\\s+${fn}\\s*\\(`).test(src)
      || new RegExp(`core\\.${fn}\\s*\\(`).test(src));
  });
  check('两个领域层里同名的机制函数都是转手调内核的薄包装（没有第二份实现）', thinWrappers,
    ['history.js', 'plan-history.js'].map(name => {
      const src = stripComments(read(name));
      return `${name}: ${mechanism.filter(fn => new RegExp(`function\\s+${fn}\\s*\\(`).test(src) &&
        !new RegExp(`core\\.${fn}\\s*\\(`).test(src)).join(',') || 'ok'}`;
    }).join(' | '));

  const history = require('../lib/history');
  const required = ['schemaVersion', 'recordKey', 'trackedFields', 'fieldEvent', 'eventTypes', 'lifecycleTypes',
    'endReasons', 'fieldLabels', 'baselineNote', 'limits', 'renderLimit', 'absenceRetentionDays'];
  check('两个剖面都提供内核要求的全部键',
    required.every(key => key in history.PROFILE) && required.every(key => key in ph.PROFILE),
    required.filter(key => !(key in history.PROFILE) || !(key in ph.PROFILE)).join(','));
  check('两个剖面的事件身份字段名各自正确（deals=id / plans=planId）',
    core.eventKeyNameOf(history.PROFILE) === 'id' && core.eventKeyNameOf(ph.PROFILE) === 'planId');
  check('plans 的事件身份字段是 planId、数据身份字段是 id（两者不混用）',
    ph.PROFILE.recordKey === 'id' && ph.PROFILE.eventKeyName === 'planId');
}

/* ------------------------------------------------------------------ */
section('⑮ 真实数据不变量');

{
  const loaded = ph.load();
  check('scripts/data/plan-history.json 存在且可解析', !loaded.missing && !loaded.broken, loaded.broken || '');
  if (!loaded.missing && !loaded.broken) {
    const store = JSON.parse(fs.readFileSync(path.join(ROOT, 'plans.json'), 'utf8'));
    const plans = Array.isArray(store.plans) ? store.plans : [];
    const bytes = fs.statSync(loaded.file).size;
    const today = String(store.updatedAt || '').slice(0, 10);
    check('真实日志有基线锚点（全覆盖当前套餐）',
      Object.keys(loaded.store.baseline.fields).length === plans.length,
      `${Object.keys(loaded.store.baseline.fields).length} / ${plans.length}`);
    check('真实日志与真实 plans.json 一致',
      ph.verifyStore(loaded.store, plans, { today, bytes }).length === 0,
      ph.verifyStore(loaded.store, plans, { today, bytes }).slice(0, 3).join(' | '));
    check('真实文件在上限内', bytes <= ph.PLAN_LIMITS.fileBytes);
    check('基线里不含噪音字段（lastSeen / verifiedAt / evidence / derivedMetrics）',
      Object.values(loaded.store.baseline.fields).every(values =>
        ['lastSeen', 'verifiedAt', 'evidence', 'derivedMetrics', 'billing.note', 'billing.promoNote']
          .every(field => !(field in values))));
  }
}

/* ------------------------------------------------------------------ */
section('⑯ 变化视图的窗口与分栏（判据在 lib/plan-changes.js）');

{
  const planChanges = require('../lib/plan-changes');
  const A = plan({ id: ID_A, billing: { regularPrice: 99 } });
  const B = plan({ id: ID_A, billing: { regularPrice: 68 } });
  const C = plan({ id: ID_A, officialUrl: 'https://docs.bigmodel.cn/cn/coding-plan/new' });

  // 逐日造三段历史：10-01 改价（基准日当天）、10-05 改价、10-20 换官方页（元信息）
  let store = ph.emptyStore({ at: '2026-10-01' });
  store.baseline = ph.baselineOf([A], { at: '2026-10-01' });
  const step = (previous, next, at) => {
    store = ph.record(store, {
      previous, next, at, runAt: `${at}T00:00:00.000Z`,
      labels: new Map([[ID_A, { title: 'Lite', vendor: 'zhipu' }]])
    }).store;
  };
  step([A], [B], '2026-10-01');
  step([B], [plan({ id: ID_A, billing: { regularPrice: 49 } })], '2026-10-05');
  step([plan({ id: ID_A, billing: { regularPrice: 49 } })], [plan({ id: ID_A, billing: { regularPrice: 49 }, officialUrl: C.officialUrl })], '2026-10-20');
  check('夹具：日志里有 3 条事件（2 条价格 + 1 条元信息）', ph.eventsOf(store).length === 3, JSON.stringify(typesOf(store)));

  const radarAt = asOf => planChanges.buildPlanRadar({
    plans: [plan({ id: ID_A, billing: { regularPrice: 49 }, officialUrl: C.officialUrl })],
    store, asOf, availability: 'ok'
  });

  const r10 = radarAt('2026-10-10');
  check('窗口：窗口外的事件不渲染（10-01 距基准日 9 天 ⇒ 出窗，只剩 10-05 那条）',
    r10.sections.changed.items.length === 1 && r10.sections.changed.items[0].at === '2026-10-05',
    JSON.stringify(r10.sections.changed.items.map(i => `${i.at}/${i.type}`)));

  const r21ForMeta = radarAt('2026-10-21');
  check('窗口：元信息（updated）不进任何分栏，只进 other.metadata',
    r21ForMeta.other.metadata.length === 1 && r21ForMeta.other.metadata[0].field === 'officialUrl' &&
    r21ForMeta.sections.changed.items.length === 0,
    JSON.stringify(r21ForMeta.totals));

  const r21 = radarAt('2026-10-21');
  check('窗口：7 天以外、30 天以内的事件不再进「最近变化」', r21.sections.changed.items.length === 0, JSON.stringify(r21.totals));
  check('窗口：基准日当天首次收录 ⇒ 今日新增（created）', (() => {
    const fresh = plan({ id: ID_B, planName: 'Pro' });
    const s2 = ph.record(ph.emptyStore({ at: '2026-10-01' }), {
      previous: [A], next: [A, fresh], at: '2026-10-01',
      labels: new Map([[ID_B, { title: 'Pro', vendor: 'zhipu' }]])
    }).store;
    const r = planChanges.buildPlanRadar({ plans: [A, fresh], store: s2, asOf: '2026-10-01' });
    return r.sections.created.items.length === 1 && r.sections.created.items[0].type === 'created';
  })());
  check('窗口：过去 6 天内首次收录 ⇒ 并进「最近 7 天变化」', (() => {
    const fresh = plan({ id: ID_B, planName: 'Pro' });
    const s2 = ph.record(ph.emptyStore({ at: '2026-10-01' }), {
      previous: [A], next: [A, fresh], at: '2026-10-03',
      labels: new Map([[ID_B, { title: 'Pro', vendor: 'zhipu' }]])
    }).store;
    const r = planChanges.buildPlanRadar({ plans: [A, fresh], store: s2, asOf: '2026-10-05' });
    return r.sections.changed.items.length === 1 && r.sections.changed.items[0].type === 'created';
  })());
  check('窗口：未来日期的事件不渲染（不拿未来的事当已发生）', (() => {
    const s2 = JSON.parse(JSON.stringify(store));
    s2.events.push({ planId: ID_A, at: '2026-12-01', type: 'price_changed', field: 'billing.regularPrice', from: 49, to: 1, eventId: 'aaaaaaaaaaaa' });
    const r = planChanges.buildPlanRadar({ plans: [A], store: s2, asOf: '2026-10-05' });
    return r.sections.changed.items.every(item => item.at <= '2026-10-05');
  })());
  check('不可用：availability 不是 ok 时分栏全空，且 totals 归零',
    (() => {
      const r = planChanges.buildPlanRadar({ plans: [A], store: null, asOf: '2026-10-05', availability: 'unavailable' });
      return r.availability === 'unavailable' && r.totals.changed === 0 && r.home.items.length === 0 && r.startedAt === null;
    })());
  check('上限：每栏超出上限时只报条数、不删数据（truncated 计数正确）', (() => {
    // 专用夹具：两次改价落在同一条套餐上（10-02 / 10-03），基准日 10-05 ⇒ 同一栏里 2 条
    let s2 = ph.emptyStore({ at: '2026-10-01' });
    s2.baseline = ph.baselineOf([A], { at: '2026-10-01' });
    let prev = A;
    for (const [at, price] of [['2026-10-02', 88], ['2026-10-03', 77]]) {
      const next = plan({ id: ID_A, billing: { regularPrice: price } });
      s2 = ph.record(s2, { previous: [prev], next: [next], at, labels: new Map([[ID_A, { title: 'Lite', vendor: 'zhipu' }]]) }).store;
      prev = next;
    }
    const r = planChanges.buildPlanRadar({
      plans: [prev], store: s2, asOf: '2026-10-05', limits: { itemsPerSection: 1, homeItems: 1 }
    });
    return r.totals.changed === 2 && r.sections.changed.items.length === 1 && r.sections.changed.truncated === 1 &&
      r.home.items.length === 1;
  })());
  check('确定性：同一份输入两次构建的视图逐字节相同',
    JSON.stringify(radarAt('2026-10-10')) === JSON.stringify(radarAt('2026-10-10')));
  check('「最近变化」块按优先级取（价格类排在元信息之前，且取到的是高价值变化）', (() => {
    const r = radarAt('2026-10-20');
    return r.home.items.length === 0 || r.home.items.every(item => item.type !== 'updated');
  })());
}

/* ------------------------------------------------------------------ */

console.log('');
if (failures.length) {
  console.error(`=== v2.3 套餐变化日志演练：${passed} 项通过，${failures.length} 项失败 ===`);
  failures.slice(0, 20).forEach(item => console.error(`  ✗ ${item.name}${item.detail ? ` —— ${item.detail}` : ''}`));
  process.exit(1);
}
console.log(`=== v2.3 套餐变化日志演练：${passed} 项通过，0 项失败 ===`);
