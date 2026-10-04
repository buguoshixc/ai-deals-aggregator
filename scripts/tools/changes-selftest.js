#!/usr/bin/env node
/**
 * v1.5 变化雷达演练（零依赖、离线、秒级）。
 *
 * 它演练的不是「代码跑得通」，而是**这一层赖以成立的那些承诺**：
 *
 *   · 分栏与窗口：五个分栏各自取什么、边界在哪（含「过去 6 天新增」与「超 7 天不再出现」）
 *   · 覆盖不变量：窗口内的事件**一条不漏**地出现在某个分栏或其他变化里
 *   · 文案微调不算重大变化：只差空白与写法的自由文本改动 → 进「其他变化」，**不上首页**
 *   · 元信息不算高价值：分类 / 地区 / 出处这类记录级改动 → 进「其他变化」，不上首页
 *   · 非文本字段不参与「微调」判定：日期与枚举差一个字符就是差一个语义
 *   · 有界：分栏与首页都有上限，超出只报条数、**不删数据**
 *   · 纯函数：同输入两次调用逐字节相同，且不修改入参（不读时钟、不联网、零依赖）
 *   · 诚实：墓碑（没有标题快照）与「日志不可用」各有各的说法，不互相冒充
 *   · 渲染器与数据同源：条带/页面的措辞、空态、控件形态都由 RENDER-CORE 现渲染出来断言
 *
 * 判据标准与既有的 selftest 一致：**红的时候没有别的步骤会替它红**，所以它进 CI 门禁。
 * （产物级别的对账在 `build-local.js` 的自检里；这一支管的是规则本身。）
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const changes = require('../lib/changes');
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

const DAY = 86400000;
const AS_OF = '2026-09-30';
const ID_A = 'aaaaaaaaaaaa';
const ID_B = 'bbbbbbbbbbbb';
const ID_C = 'cccccccccccc';
const ID_D = 'dddddddddddd';

/** 相对基准日的第 n 天 */
const day = offset => new Date(Date.parse(`${AS_OF}T00:00:00Z`) + offset * DAY).toISOString().slice(0, 10);

function deal(overrides = {}) {
  return Object.assign({
    id: ID_A,
    type: 'deal',
    title: '示例优惠',
    vendor: '示例厂商',
    discountInfo: '新用户 100 万 tokens'
  }, overrides);
}

function event(overrides = {}) {
  return Object.assign({
    id: ID_A, at: AS_OF, type: 'benefit_changed', field: 'discountInfo',
    from: '100 万 tokens', to: '200 万 tokens', origin: 'observed'
  }, overrides);
}

function radarOf(events, deals = [deal()], extra = {}) {
  return changes.buildRadar(Object.assign({
    deals,
    store: { startedAt: AS_OF, events },
    asOf: AS_OF
  }, extra));
}

const itemKeys = (radar, key) => radar.sections[key].items.map(item => `${item.id}@${item.at}`);

/* ------------------------------------------------------------------ */
section('① 分栏与窗口边界');

{
  const r = radarOf([event({ at: day(0), type: 'created', field: null, from: null, to: null, fields: {} })]);
  check('created 在基准日 → 今日新增', r.totals.created === 1 && r.totals.changed === 0);

  const r1 = radarOf([event({ at: day(-1), type: 'created', field: null, from: null, to: null, fields: {} })]);
  check('created 在昨天 → 进「最近 7 天变化」（否则 3 天前新增会哪儿都不显示）',
    r1.totals.created === 0 && r1.totals.changed === 1 && r1.sections.changed.items[0].type === 'created');

  const r6 = radarOf([event({ at: day(-6), type: 'created', field: null, from: null, to: null, fields: {} })]);
  check('窗口下边界：第 6 天仍在内', r6.totals.changed === 1);

  const r7 = radarOf([event({ at: day(-7), type: 'created', field: null, from: null, to: null, fields: {} })]);
  check('窗口外：第 7 天不再出现（有界，不是数据丢失）',
    r7.totals.changed === 0 && r7.totals.other === 0);

  const rc6 = radarOf([event({ at: day(-6) })]);
  const rc7 = radarOf([event({ at: day(-7) })]);
  check('字段变化的窗口与 created 同一把尺子', rc6.totals.changed === 1 && rc7.totals.changed === 0);

  const ended29 = radarOf([event({ at: day(-29), type: 'ended', field: null, from: null, to: null, reason: 'withdrawn' })]);
  const ended30 = radarOf([event({ at: day(-30), type: 'ended', field: null, from: null, to: null, reason: 'withdrawn' })]);
  check('已结束窗口：第 29 天在内、第 30 天在外',
    ended29.totals.ended === 1 && ended30.totals.ended === 0);

  const restored29 = radarOf([event({ at: day(-29), type: 'restored', field: null, from: null, to: null })]);
  check('重新出现与已结束共用窗口', restored29.totals.restored === 1);

  const future = radarOf([event({ at: day(1), type: 'created', field: null, from: null, to: null, fields: {} })]);
  check('未来日期不渲染（check:history 会先一步拦下它）', future.totals.created === 0 && future.totals.changed === 0);

  const bad = radarOf([{ at: 'not-a-date', type: 'created', id: ID_A }]);
  check('at 非法的脏事件不渲染', bad.totals.created === 0 && bad.totals.changed === 0);
}

/* ------------------------------------------------------------------ */
section('② 覆盖不变量（窗口内的事件一条不漏）');

{
  const events = [
    event({ at: day(0), type: 'created', field: null, from: null, to: null, fields: {} }),
    event({ at: day(-1) }),
    event({ at: day(-2), field: 'category', type: 'updated', from: 'A', to: 'B' }),
    event({ at: day(-3), from: '200 万 tokens ', to: '200 万 tokens' }),
    event({ at: day(-4), type: 'ended', field: null, from: null, to: null, reason: 'source_no_longer_lists' }),
    event({ at: day(-5), type: 'restored', field: null, from: null, to: null }),
    event({ at: day(-8) }),                       // 窗口外
    event({ at: day(-40), type: 'ended', field: null, from: null, to: null, reason: 'withdrawn' })  // 窗口外
  ];
  // 覆盖不变量只数**事件**来源的分栏：`endingSoon` 是状态量（由 expiresAt 现算），
  // 所以夹具里专门放一条带截止日期的记录，证明它不会让这条等式虚高。
  const deals = [deal(), deal({ id: ID_B }), deal({ id: ID_C, expiresAt: day(3) }), deal({ id: ID_D, type: 'tool' })];
  const r = radarOf(events, deals);
  const inWindow = events.filter(e => e.at >= day(-6) && e.at <= AS_OF).length;
  const covered = ['created', 'changed', 'ended', 'restored'].reduce((sum, key) => sum + r.totals[key], 0) + r.totals.other;
  check(`覆盖不变量：窗口内 ${inWindow} 条事件 = created/changed/ended/restored ` +
    `${['created', 'changed', 'ended', 'restored'].map(k => r.totals[k]).join('/')} + 其他 ${r.totals.other}`,
    covered === inWindow);
  check('「即将结束」是状态量，不参与事件覆盖计数', r.totals.endingSoon === 1);

  const seen = [
    ...changes.SECTION_ORDER.flatMap(key => r.sections[key].items),
    ...r.other.cosmetic, ...r.other.metadata
  ];
  const dup = seen.length - new Set(seen.map(i => `${i.id}@${i.at}@${i.type}@${i.field || ''}`)).size;
  check('分栏之间不重叠（同一条事件不会出现在两处）', dup === 0, `重复 ${dup} 条`);
  // 此数字锚在本地夹具上，不随生产数据漂移（`events` 就是上面那张就地构造的事件表：1 条元信息 + 1 条文案微调）。
  check('「其他变化」只收元信息与文案微调', r.totals.other === 2 && r.other.metadata.length === 1 && r.other.cosmetic.length === 1);
}

/* ------------------------------------------------------------------ */
section('③ 普通文案改写不是重大变化');

{
  const cosmetic = radarOf([event({ from: '新用户 100 万 tokens', to: '新用户  100 万 tokens ' })]);
  // 此数字锚在本地夹具上，不随生产数据漂移（这里只喂了 1 条事件）。
  check('只差空白 → 计入 other.cosmetic', cosmetic.totals.other === 1 && cosmetic.other.cosmetic.length === 1);
  check('只差空白 → **不**进「最近 7 天变化」', cosmetic.totals.changed === 0);
  check('只差空白 → **不**上首页', cosmetic.home.items.length === 0);

  const zeroWidth = radarOf([event({ from: '额度 100 万', to: '额度\u200b 100 万' })]);
  check('只差零宽字符 → 同样算文案微调', zeroWidth.totals.other === 1 && zeroWidth.totals.changed === 0);

  const real = radarOf([event({ from: '100 万 tokens', to: '200 万 tokens' })]);
  check('真变化 → 进「最近 7 天变化」且上首页',
    real.totals.changed === 1 && real.home.items.length === 1 && real.home.items[0].field === 'discountInfo');

  const midSentence = radarOf([event({ from: '新用户赠 100 万 tokens，有效期 3 个月', to: '新用户赠 200 万 tokens，有效期 3 个月' })]);
  check('句子中间改数字 → 是真变化（不做任何相似度近似）',
    midSentence.totals.changed === 1 && midSentence.totals.other === 0);

  check('cosmeticText 只归一写法、不改内容', changes.cosmeticText('  a\u3000b  c ') === 'a b c');
  check('非字符串值不参与微调判定', changes.isCosmetic({ field: 'discountInfo', from: { a: 1 }, to: { a: 1 } }) === false);
}

/* ------------------------------------------------------------------ */
section('④ 元信息与高价值的边界');

{
  const meta = radarOf([event({ field: 'category', type: 'updated', from: '编程开发', to: '办公效率' })]);
  check('分类变化 → other.metadata，不上首页', meta.totals.other === 1 && meta.home.items.length === 0);

  for (const field of ['region', 'source', 'sourceUrl', 'verified', 'verifiedAt', 'type', 'evidence']) {
    const type = changes.LOW_VALUE_FIELD_TYPES[0];
    const r = radarOf([event({ field, type, from: 'x', to: 'y' })]);
    check(`${field} 变化 → 不算高价值`, r.totals.other === 1 && r.home.items.length === 0);
  }

  for (const [field, type] of [['discountInfo', 'benefit_changed'], ['eligibility', 'eligibility_changed'],
    ['expiresAt', 'expiry_changed'], ['benefitType', 'benefit_changed'], ['features', 'benefit_changed']]) {
    const r = radarOf([event({ field, type, from: 'x', to: 'y' })]);
    check(`${field} 变化 → 高价值（进分栏 + 有机会上首页）`, r.totals.changed === 1 && r.home.items.length === 1);
  }

  const dates = radarOf([event({ field: 'expiresAt', type: 'expiry_changed', from: ' 2026-10-05', to: '2026-10-05' })]);
  check('日期字段即使只差空白也不算「文案微调」（差一个字符就是差一个语义）',
    dates.totals.changed === 1 && dates.totals.other === 0);

  const pricing = radarOf([event({ field: 'pricingModel', type: 'benefit_changed', from: 'free', to: 'freemium' })]);
  check('枚举字段同理不算微调', pricing.totals.changed === 1 && pricing.totals.other === 0);
}

/* ------------------------------------------------------------------ */
section('⑤ 首页优先级（只取高价值，桶内按时间倒序）');

{
  const events = [
    event({ id: ID_A, at: day(0), type: 'created', field: null, from: null, to: null, fields: {} }),
    event({ id: ID_B, at: day(-1), type: 'ended', field: null, from: null, to: null, reason: 'pruned_expired' }),
    event({ id: ID_C, at: day(-2), from: 'x', to: 'y' }),
    event({ id: ID_D, at: day(-3), field: 'category', type: 'updated', from: 'p', to: 'q' })
  ];
  const deals = [deal({ id: ID_A }), deal({ id: ID_B }), deal({ id: ID_C }), deal({ id: ID_D, type: 'tool' })];
  const r = radarOf(events, deals);
  check('首页按 HOME_PRIORITY 取：created → ended → benefit_changed',
    r.home.items.map(i => i.homeKind).join(',') === 'created,ended,benefit_changed',
    r.home.items.map(i => i.homeKind).join(','));
  check('元信息事件不进首页', !r.home.items.some(i => i.id === ID_D));

  const many = radarOf(
    Array.from({ length: 5 }, (_, i) => event({ id: ID_A, at: day(-i), to: `v${i}` })),
    [deal()]
  );
  check('同桶内按时间倒序（新的在前）', many.home.items[0].at === day(0));

  const capped = changes.buildRadar({
    deals: [deal()], store: { startedAt: AS_OF, events: [event({})] }, asOf: AS_OF, limits: { homeItems: 1 }
  });
  check('首页条数上限可配置且生效', capped.home.items.length === 1);
}

/* ------------------------------------------------------------------ */
section('⑥ 即将结束（状态量，不是事件）');

{
  const deals = [
    deal({ id: ID_A, expiresAt: day(4) }),
    deal({ id: ID_B, expiresAt: day(0) }),
    deal({ id: ID_C, expiresAt: day(8) }),
    deal({ id: ID_D, expiresAt: day(-1) }),
    deal({ id: 'eeeeeeeeeeee', type: 'tool', expiresAt: day(2) }),
    deal({ id: 'ffffffffffff' })
  ];
  const r = radarOf([], deals);
  const keys = r.sections.endingSoon.items.map(i => i.id).join(',');
  check('只收 0..7 天内的 deal（今天截止在内、第 8 天与已过期在外、工具条目不算）',
    keys === `${ID_B},${ID_A}`, keys);
  check('剩余天数按基准日算', r.sections.endingSoon.items[0].daysLeft === 0 && r.sections.endingSoon.items[1].daysLeft === 4);
  check('按剩余天数升序', r.sections.endingSoon.items[0].daysLeft <= r.sections.endingSoon.items[1].daysLeft);
  check('截止日期覆盖率如实上报（空态要分清两种原因）', r.coverage.dealsWithExpiresAt === 4 && r.coverage.dealsTotal === 5,
    `覆盖 ${r.coverage.dealsWithExpiresAt}/${r.coverage.dealsTotal}`);

  const none = radarOf([], [deal({ id: ID_A })]);
  check('一条都没写截止日期时覆盖率为 0', none.coverage.dealsWithExpiresAt === 0 && none.sections.endingSoon.items.length === 0);
}

/* ------------------------------------------------------------------ */
section('⑦ 墓碑标签与链接（不许造死链）');

{
  const live = radarOf([event({ type: 'ended', field: null, from: null, to: null, reason: 'source_no_longer_lists' })], [deal()]);
  const liveItem = live.sections.ended.items[0];
  check('记录仍在数据集里 → 标题取自记录、可链接',
    liveItem.titled === true && liveItem.title === '示例优惠' && liveItem.linkable === true && liveItem.href === `deal/${ID_A}/`);

  const gone = radarOf([event({ type: 'ended', field: null, from: null, to: null, reason: 'pruned_expired', label: { title: '已下架的优惠', vendor: '某厂商' } })], []);
  const goneItem = gone.sections.ended.items[0];
  check('记录已离开数据集 → 标题取自墓碑快照', goneItem.titled === true && goneItem.title === '已下架的优惠');
  check('已离开数据集 → 没有链接（没有详情页就是没有）', goneItem.linkable === false && goneItem.href === null);

  const bare = radarOf([event({ type: 'ended', field: null, from: null, to: null, reason: 'withdrawn' })], []);
  check('没有墓碑快照 → 如实标 titled=false（页面说「无标题快照」）', bare.sections.ended.items[0].titled === false && bare.sections.ended.items[0].title === null);

  const tool = radarOf([event({})], [deal({ type: 'tool' })]);
  check('工具条目有变化但不链接（它没有静态详情页）', tool.sections.changed.items[0].linkable === false && tool.sections.changed.items[0].title === '示例优惠');
}

/* ------------------------------------------------------------------ */
section('⑧ 上限、确定性与纯函数');

{
  const many = Array.from({ length: 31 }, (_, i) => event({ at: day(-(i % 7)), to: `v${i}` }));
  const r = changes.buildRadar({ deals: [deal()], store: { startedAt: AS_OF, events: many }, asOf: AS_OF, limits: { itemsPerSection: 30 } });
  check('分栏上限 30：31 条 → 30 条 + truncated 1', r.sections.changed.items.length === 30 && r.sections.changed.truncated === 1);
  // 此数字锚在本地夹具上，不随生产数据漂移（`31` 就是上一行 `Array.from({ length: 31 }, …)` 造出来的条数，
  // 这条断言要证的是「加上限不改变总数」，不是「生产上恰好有 31 条」）。
  check('上限不改变总数（不删数据）', r.totals.changed === 31);

  const tiny = changes.buildRadar({ deals: [deal()], store: { startedAt: AS_OF, events: many }, asOf: AS_OF, limits: { itemsPerSection: 2 } });
  check('上限可配置（自测与报告工具共用同一支）', tiny.sections.changed.items.length === 2 && tiny.sections.changed.truncated === 29);

  const events = [event({ at: day(0) }), event({ at: day(-1), id: ID_B })];
  const deals = [deal(), deal({ id: ID_B })];
  const store = { startedAt: AS_OF, events };
  const snapshot = JSON.stringify({ events, deals, store });
  const first = changes.buildRadar({ deals, store, asOf: AS_OF });
  const second = changes.buildRadar({ deals, store, asOf: AS_OF });
  check('纯函数：同输入两次调用逐字节相同', JSON.stringify(first) === JSON.stringify(second));
  check('纯函数：不修改入参', JSON.stringify({ events, deals, store }) === snapshot);
  check('summarize 与 radar 自洽', changes.summarize(first).totals.changed === first.totals.changed);
}

/* ------------------------------------------------------------------ */
section('⑨ 「不可用」不是「没有变化」');

{
  const missing = changes.buildRadar({ deals: [deal()], store: null, asOf: AS_OF, availability: 'unavailable' });
  check('日志缺失 → availability=unavailable 且各分栏为空', missing.availability === 'unavailable' &&
    changes.SECTION_ORDER.every(key => missing.totals[key] === 0) && missing.totals.other === 0);
  // 「空」与「不可用」在数据层是同一组计数，两者的区别必须由**措辞**承担（见 ⑩ 的渲染断言）

  const noAsOf = changes.buildRadar({ deals: [deal()], store: { startedAt: AS_OF, events: [] }, asOf: null });
  check('基准日非法 → 同样是 unavailable（不拿一个假日期去算窗口）', noAsOf.availability === 'unavailable');

  const brokenEvents = changes.buildRadar({ deals: [deal()], store: { startedAt: AS_OF }, asOf: AS_OF });
  check('store 里没有 events 数组 → unavailable', brokenEvents.availability === 'unavailable');
}

/* ------------------------------------------------------------------ */
section('⑩ 渲染器：条带与页面的形态由 RENDER-CORE 现渲染断言');

{
  const rc = require('../lib/render-core').load();
  const empty = radarOf([], [deal()]);
  const stripEmpty = rc.changesStripHtml(empty);
  check('空态条带：明说「没有观测到变化」并带上起算日',
    stripEmpty.includes('当前没有观测到变化') && stripEmpty.includes(AS_OF));
  check('空态条带：窄屏短文案同时在 DOM 里（否则整句会被横滑容器裁掉半句）',
    stripEmpty.includes('自 ' + AS_OF + ' 起记录，暂无变化') && stripEmpty.includes('class="rs"') && stripEmpty.includes('class="rf"'));
  check('空态条带仍然有 /changes/ 入口', stripEmpty.includes('href="changes/"'));
  check('条带里没有 JS 控件（无 JS 时一个死按钮都不该有）', !/<(button|input|select)\b/i.test(stripEmpty));
  check('条带数据属性与分栏合计一致', stripEmpty.includes('data-radar-total="0"'));

  const pageEmpty = rc.changesPageHtml(empty, '../');
  check('空态页面：五个分栏标题都在（用「空白」冒充「没有变化」是不允许的）',
    ['今日新增', '最近 7 天变化', '即将结束', '已结束', '重新出现'].every(text => pageEmpty.includes(text)));
  check('空态页面：一条截止日期都没有时说的是「数据里没有写」',
    pageEmpty.includes('没有一条写有绝对截止日期'));
  check('空态页面：免责句在位', pageEmpty.includes('不表示厂商已经下架或优惠已经失效'));

  const soonLater = changes.buildRadar({ deals: [deal({ expiresAt: day(20) })], store: { startedAt: AS_OF, events: [] }, asOf: AS_OF });
  check('有截止日期但不在窗口内 → 空态换一句（分清两种空）',
    rc.changesPageHtml(soonLater, '../').includes('没有一条在 7 天内到期'));

  const busy = radarOf([
    event({ id: ID_A, at: day(0), type: 'created', field: null, from: null, to: null, fields: {} }),
    event({ id: ID_B, at: day(-1), from: '100 万', to: '200 万' }),
    // C 已经离开数据集（不在 deals 里）⇒ 只能靠 ended 上的墓碑快照认人，且**不能**有链接
    event({ id: ID_C, at: day(-2), type: 'ended', field: null, from: null, to: null, reason: 'pruned_expired', label: { title: '下架的优惠' } }),
    event({ id: ID_D, at: day(-3), field: 'category', type: 'updated', from: 'a', to: 'b' })
  ], [
    deal({ id: ID_A }),
    deal({ id: ID_B }),
    deal({ id: ID_D, type: 'tool' }),
    deal({ id: 'ffffffffffff', expiresAt: day(3) })
  ]);

  const stripBusy = rc.changesStripHtml(busy);
  check('有内容时条带列出条目（带类型标签与标题）',
    stripBusy.includes('首次收录') && stripBusy.includes('示例优惠') && stripBusy.includes('data-deal-id='));
  check('条带只列 radar.home 的条目',
    [...stripBusy.matchAll(/data-deal-id="([0-9a-f]+)"/g)].map(m => m[1]).join(',') === busy.home.items.map(i => i.id).join(','));

  const pageBusy = rc.changesPageHtml(busy, '../');
  check('页面内链带上了输出深度前缀（../）', pageBusy.includes(`href="../deal/${ID_A}/"`));
  check('已离开数据集的条目在页面上没有链接', !pageBusy.includes(`../deal/${ID_C}/`));
  check('工具的条目同样没有链接（它没有静态详情页）', !pageBusy.includes(`../deal/${ID_D}/`));
  check('有墓碑快照时不写「无标题快照」', pageBusy.includes('无标题快照') === false);
  check('墓碑快照的标题出现在页面上', pageBusy.includes('下架的优惠'));
  const noLabel = radarOf([event({ id: ID_C, at: day(-1), type: 'ended', field: null, from: null, to: null, reason: 'withdrawn' })], []);
  check('真没有快照时才写「无标题快照」', rc.changesPageHtml(noLabel, '../').includes('无标题快照'));
  check('其他变化列在折叠块里（显式列出，不悄悄丢掉）', pageBusy.includes('不计入高价值的其他变化'));

  const brokenStrip = rc.changesStripHtml(changes.buildRadar({ deals: [], store: null, asOf: AS_OF, availability: 'unavailable' }));
  check('日志不可用时条带说「没有拿到历史日志」', brokenStrip.includes('没有拿到历史日志'));
  check('日志不可用时条带不说「没有变化」', brokenStrip.includes('当前没有观测到变化') === false);
}

/* ------------------------------------------------------------------ */
section('⑪ 离线与纯规则的静态证据');

{
  const src = fs.readFileSync(path.join(ROOT, 'scripts', 'lib', 'changes.js'), 'utf8');
  check('changes.js 零依赖（一个 require 都没有）', !/\brequire\s*\(/.test(src));
  check('changes.js 不读时钟（判据只由输入决定）', !/Date\.now|new Date\(\)/.test(src));
  check('changes.js 不读环境变量', !/process\.env/.test(src));
  check('changes.js 不联网', !/https?:\/\/[^\s'"]*['"]|fetch\s*\(|XMLHttpRequest/.test(src.replace(/https:\/\/schema\.org/g, '')));
  // 「不通过 LLM 猜测变化」在这条链路上的意思是：没有任何模型调用、没有相似度/摘要，
  // 所有判断都是上面那些可枚举的规则 —— 上面四条扫描 + ③④ 的行为断言合起来守住它。
}

/* ------------------------------------------------------------------ */
section('⑫ 真实数据不变量');

{
  const loaded = history.load();
  check('scripts/data/deal-history.json 存在且可解析', !loaded.missing && !loaded.broken);
  if (!loaded.missing && !loaded.broken) {
    const payload = JSON.parse(fs.readFileSync(path.join(ROOT, 'deals.json'), 'utf8'));
    const asOf = String(payload.updatedAt || '').slice(0, 10);
    const radar = changes.buildRadar({ deals: payload.deals, store: loaded.store, asOf, availability: 'ok' });
    check('真实数据上雷达可用且基准日等于数据日期', radar.availability === 'ok' && radar.asOf === asOf);
    check('真实数据上覆盖不变量成立', (() => {
      const events = history.eventsOf(loaded.store);
      const recentFrom = changes.addDays(asOf, -(changes.WINDOWS.recentDays - 1));
      const endedFrom = changes.addDays(asOf, -(changes.WINDOWS.endedDays - 1));
      const inRecent = events.filter(e => e.at >= recentFrom && e.at <= asOf).length;
      const older = events.filter(e => (e.type === 'ended' || e.type === 'restored') && e.at >= endedFrom && e.at < recentFrom).length;
      // 同样只数事件来源的分栏（endingSoon 是状态量）
      const covered = ['created', 'changed', 'ended', 'restored'].reduce((sum, key) => sum + radar.totals[key], 0) + radar.totals.other;
      return covered === inRecent + older;
    })());
    check('真实数据上每条可链接条目都真的有详情页 id（type=deal）', (() => {
      const byId = new Map(payload.deals.map(d => [d.id, d]));
      return changes.SECTION_ORDER.flatMap(key => radar.sections[key].items)
        .every(item => !item.href || (byId.get(item.id) || {}).type === 'deal');
    })());
    check('真实数据上首页条带不超过 3 项', radar.home.items.length <= changes.LIMITS.homeItems);
    check('真实数据摘要可产出（报告工具共用）', typeof changes.summarize(radar).totals.created === 'number');
  }
}

/* ------------------------------------------------------------------ */
section('⑬ 记录级代表事件（ItemList 与页面行标记的唯一出处）');

{
  // 这一节守的是上一轮审计的 P1-4：`/changes/` 只要有 1 条变化，产物自检必然失败。
  // 根因不是某一处算错，而是**三份集合各算各的**（声明数取五栏合计、元素按栏遍历不去重、
  // 页面行标记根本没有）。现在三份集合都读 `changes.itemListRecords()` 这一处，
  // 所以这一节就是在钉住那个口径本身。
  const rc = require('../lib/render-core').load();
  const events = [
    event({ id: ID_A, at: day(0), type: 'created', field: null, from: null, to: null, fields: {} }),
    event({ id: ID_A, at: day(-2), from: '旧说明', to: '新说明' }),
    event({ id: ID_B, at: day(-3), from: 'x', to: 'y' }),
    event({ id: ID_A, at: day(-5), type: 'ended', field: null, from: null, to: null, reason: 'withdrawn' }),
    event({ id: ID_A, at: day(-1), type: 'restored', field: null, from: null, to: null }),
    // B 只有「字段变化 + 不再收录」：代表事件是**后面那一行**（ended 强于 changed），
    // 所以它的 occurrence 必须是 1 —— 标记不能顺手打在第一条出现上。
    event({ id: ID_B, at: day(-1), type: 'ended', field: null, from: null, to: null, reason: 'withdrawn' })
  ];
  const deals = [deal({ id: ID_A }), deal({ id: ID_B })];
  const r = radarOf(events, deals);
  const records = changes.itemListRecords(r);

  check('一个记录同时出现在多栏时，ItemList 只给它一个位置',
    records.filter(record => record.id === ID_A).length === 1 && r.sections.changed.items.some(i => i.id === ID_A));
  check('同一个 id 在页面上出现多次：ItemList 的顺序按**代表行**的渲染顺序',
    records.map(record => record.id).join(',') === `${ID_A},${ID_B}`, records.map(record => record.id).join(','));
  check('代表事件取最强的那一条（生命周期 > 字段变化 > 状态量）',
    records[0].kind === 'created' && records[1].kind === 'ended',
    `${records[0].kind} / ${records[1].kind}`);
  check('occurrence 指向该记录在渲染顺序里的第几次出现（可以是后面的那一行）',
    records[0].occurrence === 0 && records[1].occurrence === 1,
    `${records[0].occurrence} / ${records[1].occurrence}`);

  const gone = changes.buildRadar({
    deals: [],
    store: { startedAt: AS_OF, events: [event({ id: ID_C, at: day(-1), type: 'ended', field: null, from: null, to: null, reason: 'pruned_expired', label: { title: '下架的优惠' } })] },
    asOf: AS_OF
  });
  check('没有详情页（已离开数据集）的条目**不进** ItemList —— 结构化数据里不造死链',
    gone.sections.ended.items.length === 1 && changes.itemListRecords(gone).length === 0);
  check('页面对应行仍然存在（不进 ItemList ≠ 从页面上消失）',
    rc.changesPageHtml(gone, '../').includes('class="chgi"') && rc.changesPageHtml(gone, '../').includes('下架的优惠'));

  const soon = radarOf([event({ id: ID_A, at: day(-1), from: 'x', to: 'y' })], [deal({ id: ID_A, expiresAt: day(3) })]);
  check('「即将结束」是状态量，强度低于字段变化（同一条记录不会因此改代表）',
    soon.totals.endingSoon === 1 && changes.itemListRecords(soon)[0].kind === 'changed',
    changes.itemListRecords(soon)[0].kind);

  check('纯函数：同一份 radar 两次调用逐字节相同',
    JSON.stringify(changes.itemListRecords(r)) === JSON.stringify(changes.itemListRecords(r)));

  // 最硬的一条：判据给的「渲染顺序」必须与 RENDER-CORE **真的渲染出来的行**逐项一致
  // （行标记按文档顺序落点，顺序分家就等于把标记打在别人身上）。
  const page = rc.changesPageHtml(r, '../');
  const rowIds = [...page.matchAll(/data-deal-id="([^"]*)"/g)].map(m => m[1]);
  const judgeIds = changes.renderOrderOf(r).map(entry => entry.item.id);
  check('renderOrderOf 与 RENDER-CORE 的可见行顺序逐项一致',
    rowIds.join(',') === judgeIds.join(','), `${rowIds.join(',')} / ${judgeIds.join(',')}`);
  const occurrenceOk = records.every(record =>
    judgeIds.filter(id => id === record.id).length > record.occurrence);
  check('代表行的 occurrence 在渲染顺序里真的存在（不会指到不存在的行）', occurrenceOk);
  check('每条记录恰好占一个位置（标记数 == 记录数）',
    new Set(records.map(record => record.id)).size === records.length);
  check('空雷达：ItemList 与行标记都是 0 条（空态下也不许凭空发结构化数据）',
    changes.itemListRecords(radarOf([], [deal()])).length === 0
    && changes.renderOrderOf(radarOf([], [deal()])).length === 0);
}

/* ------------------------------------------------------------------ */
console.log(`\n=== v1.5 变化雷达演练：${passed} 项通过，${failures.length} 项失败 ===`);
if (failures.length) {
  for (const item of failures) console.log(`  ✗ ${item.name}${item.detail ? ` —— ${item.detail}` : ''}`);
  process.exit(1);
}
