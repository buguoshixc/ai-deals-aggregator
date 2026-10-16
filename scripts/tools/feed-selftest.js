#!/usr/bin/env node
/**
 * v3.2 订阅出口演练（零依赖、离线、秒级、**不需要 dist/**）—— L2。
 *
 * 它演练的不是「代码跑得通」，而是**这一层赖以成立的那些承诺**：
 *
 *   · 唯一表：订阅文件名与 MIME 只有一处（`FEED_FILES`），其余读写方只许读它 —— 机器判据
 *     是「4 个文件里不许出现那六个字面量」+「首页那两条声明逐字节等于由它派生出来的形态」；
 *   · 不发死链：算不出 url 的事件（缺记录键 / 键不是 12 位 hex）与 `at` 不合法的事件
 *     **逐条不进 feed**，且其余条仍在；未知 `kind` 直接抛错（不静默少一支日志）；
 *   · 全序确定：排序复用 `changes.compareByRecency`（同一份比较器），打乱输入顺序输出不变，
 *     同一天的多条按 id 收敛；排序**之后**才截断到 `FEED_MAX_ITEMS`；
 *   · 身份稳定：条目 id 的唯一推导 = `planSchema.idFromBasis(historyCore.eventKey(event, profile))`
 *     （逐条对账，不是「看着像 12 位 hex 就算过」）；改 title/text 不改 id，改 at/type/field/from/to 必改 id；
 *   · 碰撞 fail-closed：两条**不同**事件算出同一个 id ⇒ 抛错（不许静默丢一条、不许换 id 兜底）；
 *     而**逐字节相同**的同一条事件只出现一次（幂等去重）—— 两条规则判据不同，各有一条夹具；
 *   · 不看时钟：同一份输入两次渲染逐字节相同；改 `runAt`（采集时刻）、打乱对象键序 ⇒ 字节不变；
 *     把数据日期整体 +1 天 ⇒ 产物里所有日期字段同步位移（证明日期来自数据，不是来自构建时刻）；
 *   · 空输入：0 条事件 ⇒ 0 条条目，生成器不编造任何条目，两种格式仍是结构合法的空文档；
 *   · 转义与文案单源：XML 侧只走 `site.xmlEscape`（无第二份转义器、无裸 & / 裸 <），
 *     文案只从既有措辞表取（代码里没有中文事件措辞，产物里的中文片段可逐段溯源）；
 *   · 被删文案不回流：`residue-guard.json` 里与订阅有关的那几条被删字面，源码与产物都 0 命中；
 *     元自称（「逐字」「一字不差」「verbatim」）同样 0 命中；
 *   · **deal 可链接门（t13 补牙）**：`deals.json` 里只有 `type === 'deal'` 的记录才有详情页，
 *     所以 deal 来源缺 `linkableIds`（或给了非 Set）⇒ 抛错；集合成员之外的事件走丢弃路径；
 *     真实数据断言要求「入选的每一条都真的有一页」且「入选 + 丢弃 == 事件数」——
 *     旧实现（无条件发 `deal/<key>/`）在它下面当场变红；
 *   · **五颗变异牙**：每条都先证明锚点唯一，再在**内存里**编译变异体、实跑变红，
 *     最后核对磁盘文件的 sha256 与变异前相等（逐字节还原，零磁盘污染）。
 *
 * 判据标准与既有的 selftest 一致：**红的时候没有别的步骤会替它红**，所以它进 CI 门禁（L2）。
 *
 * 运行：`node scripts/tools/feed-selftest.js`（不需要 dist/，也不写任何产物）。
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', '..');
const feed = require('../lib/feed');
const changes = require('../lib/changes');
const history = require('../lib/history');
const historyCore = require('../lib/history-core');
const planSchema = require('../lib/plan-schema');
const planHistory = require('../lib/plan-history');
const apiPlanHistory = require('../lib/api-plan-history');
const site = require('../lib/site');

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

const FEED_FILE = path.join(ROOT, 'scripts', 'lib', 'feed.js');
const INDEX_FILE = path.join(ROOT, 'index.html');
const RESIDUE_FILE = path.join(ROOT, 'scripts', 'data', 'residue-guard.json');
/** 真实数据（L2 = 需要仓库数据）：可链接性的判据只在真实记录上才有意义 */
const REAL_DEALS_FILE = path.join(ROOT, 'deals.json');
const REAL_DEAL_HISTORY_FILE = path.join(ROOT, 'scripts', 'data', 'deal-history.json');
/** 「不许各写一份字面量」的扫描面（契约第 1.4 条）——唯一豁免 = feed.js 自己（它就是那张表） */
const SINGLE_SOURCE_SCAN = [
  'scripts/tools/verify-site.js',
  'scripts/tools/build-local.js',
  'scripts/tools/check-feed-reproducible.js',
  'scripts/lib/published-assets.js'
];

const READ_FEED_SRC = () => fs.readFileSync(FEED_FILE, 'utf8');
const sha256 = text => crypto.createHash('sha256').update(text, 'utf8').digest('hex');
const FEED_SRC = READ_FEED_SRC();
const FEED_SHA = sha256(FEED_SRC);
/** 剥掉注释后的源码视图：代码级判据（哈希 / 比较器 / DOCTYPE / 中文措辞）都在它上面判 */
const FEED_CODE = stripCommentsForScan(FEED_SRC);

/**
 * 元自称的针：`逐字`（**后面不接「节」** —— 「逐字节」是技术词，不该被误报）、
 * `一字不差`、`verbatim`。feed 里只能写「本站观测到什么」，不能自我描述「我是原文」。
 */
const META_SELF_RE = /逐字(?!节)|一字不差|verbatim/i;

/* ------------------------------------------------------------------ */
/* 夹具（形状与 `scripts/data/*-history.json` 里的事件逐字段一致）        */
/* ------------------------------------------------------------------ */

const DEAL_A = 'aaaaaaaaaaaa';
const DEAL_B = 'bbbbbbbbbbbb';
const DEAL_C = 'cccccccccccc';
const DEAL_D = 'dddddddddddd';
const PLAN_A = '111111111111';
const API_A = '222222222222';

/** 标题表（`titleOf` 的夹具实现；真实调用点是 wiring 注入的那一份） */
const TITLES = {
  [DEAL_A]: 'Flowrite',
  [DEAL_B]: '示例优惠 B',
  [DEAL_C]: '示例优惠 C',
  [DEAL_D]: '示例优惠 D',
  [PLAN_A]: '旗舰版',
  [API_A]: '混元生文按量计费'
};

/** 夹具里注入的中文文本（文案溯源判据的「数据侧」允许集） */
const FIXTURE_TEXT = [
  'Flowrite', '示例优惠 B', '示例优惠 C', '示例优惠 D', '旗舰版', '混元生文按量计费',
  '100 万 tokens', '200 万 tokens', '个人', '个人与企业', '2026-11-30',
  '办公效率', '工具', '示例 & 优惠 <限时> "双引号" 单引号'
];

function dealEvent(over = {}) {
  return Object.assign({
    id: DEAL_A,
    at: '2026-10-10',
    type: 'created',
    field: null,
    from: null,
    to: null,
    fields: {
      type: 'tool',
      category: '办公效率',
      region: 'global',
      source: 'Futuretools',
      sourceUrl: 'https://futuretools.io/tools/flowrite',
      verified: false
    },
    runAt: '2026-10-10T03:07:44.127Z'
  }, over);
}

/** 字段变化事件（deals 侧：`id` 是记录键，`field` / `from` / `to` 是变化面） */
function changeEvent(over = {}) {
  return Object.assign({
    id: DEAL_B,
    at: '2026-10-09',
    type: 'benefit_changed',
    field: 'discountInfo',
    from: '100 万 tokens',
    to: '200 万 tokens',
    origin: 'observed'
  }, over);
}

function planEvent(over = {}) {
  return Object.assign({
    planId: PLAN_A,
    at: '2026-10-08',
    type: 'created',
    field: null,
    from: null,
    to: null,
    fields: { 'billing.regularPrice': 99, 'billing.currency': 'CNY' },
    runAt: '2026-10-08T12:56:31.522Z',
    eventId: 'e34576f7969a'
  }, over);
}

function apiPlanEvent(over = {}) {
  return Object.assign({
    planId: API_A,
    at: '2026-10-06',
    type: 'created',
    field: null,
    from: null,
    to: null,
    fields: { 'pricing.currency': 'CNY', 'pricing.unit': 'per_1M_tokens' },
    runAt: '2026-10-06T11:00:00.000Z',
    eventId: 'abcdefabcdef'
  }, over);
}

/** 默认夹具：6 条事件 / 三支来源；含两条「同一天、不同 id」（DEAL_B 与 DEAL_C） */
const DEFAULT_EVENTS = {
  deal: [
    dealEvent({ id: DEAL_A, at: '2026-10-10' }),
    changeEvent({ id: DEAL_B, at: '2026-10-09' }),
    changeEvent({
      id: DEAL_C, at: '2026-10-09', type: 'eligibility_changed', field: 'eligibility',
      from: '个人', to: '个人与企业'
    }),
    changeEvent({
      id: DEAL_D, at: '2026-10-05', type: 'expiry_changed', field: 'expiresAt',
      from: null, to: '2026-11-30'
    })
  ],
  plan: [planEvent({})],
  apiPlan: [apiPlanEvent({})]
};

function titleOfEvent(event) {
  const key = event.id || event.planId;
  return TITLES[key] || '';
}

/**
 * 夹具里「真的会生成 `deal/<id>/` 详情页」的记录 id。默认可链接 = 夹具那 4 条 deal 记录；
 * 要造「不可链接 / 集合缺席」的形状就传 `options.linkableIds` / `options.omitLinkableIds`。
 */
const FIXTURE_LINKABLE_IDS = [DEAL_A, DEAL_B, DEAL_C, DEAL_D];

/** 三支来源（形状按契约第 6.2 条 + t13 追加的 `linkableIds`） */
function sourcesOf(events = DEFAULT_EVENTS, extra = {}, options = {}) {
  const dealSource = {
    kind: 'deal',
    profile: history.PROFILE,
    store: { events: events.deal || [] },
    titleOf: titleOfEvent,
    linkableIds: options.linkableIds === undefined ? new Set(FIXTURE_LINKABLE_IDS) : options.linkableIds
  };
  if (options.omitLinkableIds) delete dealSource.linkableIds;
  return [
    dealSource,
    { kind: 'plan', profile: planHistory.PROFILE, store: { events: events.plan || [] }, titleOf: titleOfEvent },
    { kind: 'apiPlan', profile: apiPlanHistory.API_PROFILE, store: { events: events.apiPlan || [] }, titleOf: titleOfEvent }
  ].map(source => Object.assign(source, extra));
}

/** 默认 meta（`selfPath` 一律从 FEED_FILES 现取，本文件不写文件名 / MIME 字面量） */
function metaFor(mod, kindOfFeed) {
  const pair = kindOfFeed === 'atom'
    ? mod.FEED_FILES.find(([, type]) => type.includes('xml'))
    : mod.FEED_FILES.find(([, type]) => type.includes('json'));
  return {
    siteUrl: site.SITE_URL,
    siteName: site.SITE_NAME,
    siteDescription: site.SITE_DESCRIPTION,
    updatedAt: '2026-10-14',
    selfPath: pair[0]
  };
}

/** 记录键 → 站根相对 url（判据侧独立写出冻结的三种形态，不调用模块内部函数） */
function expectedUrlOf(kind, key) {
  if (kind === 'deal') return `deal/${key}/`;
  if (kind === 'plan') return `plans/coding/#plan-${key}`;
  return `plans/api/#plan-${key}`;
}

/** 一条事件在这份夹具里的期望身份（契约第 7.1 条冻结的那一行，判据侧独立写一遍） */
function expectedIdOf(kind, event) {
  const profile = { deal: history.PROFILE, plan: planHistory.PROFILE, apiPlan: apiPlanHistory.API_PROFILE }[kind];
  return planSchema.idFromBasis(historyCore.eventKey(event, profile));
}

/* ------------------------------------------------------------------ */
/* 判据（同一份判据既跑真模块，也跑变异体 —— 不许第二份判据）              */
/* ------------------------------------------------------------------ */

/** 返回形状（t13 冻结）：`{ entries, stats }`；`stats` 的键一个不少，且 `kept === entries.length` */
function judgeReturnShape(mod) {
  const raw = mod.buildFeedEntries({ sources: sourcesOf() });
  const isBareArray = Array.isArray(raw);
  const keys = raw && !isBareArray ? Object.keys(raw).sort().join(',') : String(raw);
  const statsKeys = raw && raw.stats ? Object.keys(raw.stats).sort().join(',') : '(无)';
  const droppedKeys = raw && raw.stats && raw.stats.dropped
    ? Object.keys(raw.stats.dropped).sort().join(',') : '(无)';
  const keptMatches = Boolean(raw && raw.stats && Array.isArray(raw.entries)
    && raw.stats.kept === raw.entries.length && raw.entries.length === 6);
  // 两个渲染器仍只吃 entries 数组：把结果原样传进去必须能渲染出同样的条目数
  const atom = mod.renderAtom(raw.entries, metaFor(mod, 'atom'));
  const rendered = (atom.match(/<entry>/g) || []).length;
  return {
    ok: !isBareArray && keys === 'entries,stats'
      && statsKeys === 'considered,dropped,kept,truncated'
      && droppedKeys === 'duplicate,invalidAt,noUrl,notLinkable'
      && keptMatches && rendered === raw.entries.length,
    detail: isBareArray
      ? '**返回的是裸数组**（旧形状）—— 必须是 { entries, stats }'
      : `顶层键 {${keys}} · stats 键 {${statsKeys}} · dropped 键 {${droppedKeys}}`
        + ` · kept === entries.length ${keptMatches} · 渲染器吃 entries 数组 ${rendered} 条`
  };
}

/** 导出表（契约第 5.1 条：就这 5 个名字） */
function judgeExportTable(mod) {
  const names = Object.keys(mod).sort().join(',');
  const wanted = ['FEED_FILES', 'FEED_MAX_ITEMS', 'buildFeedEntries', 'renderAtom', 'renderJsonFeed'].sort().join(',');
  const files = mod.FEED_FILES;
  const pairOk = Array.isArray(files) && files.length === 2
    && files.every(item => Array.isArray(item) && item.length === 2
      && typeof item[0] === 'string' && item[0] && typeof item[1] === 'string' && item[1]);
  const namesOk = pairOk && new Set(files.map(([file]) => file)).size === files.length
    && new Set(files.map(([, type]) => type)).size === files.length;
  const typesOk = pairOk && files.every(([, type]) => /^application\/[a-z0-9+.-]+$/.test(type))
    && files.some(([, type]) => type.includes('xml')) && files.some(([, type]) => type.includes('json'));
  const maxOk = mod.FEED_MAX_ITEMS === 40;
  return {
    ok: names === wanted && namesOk && typesOk && maxOk,
    detail: `${Object.keys(mod).length} 个导出（${names}）· FEED_FILES ${pairOk ? files.map(([f, t]) => `${f}→${t}`).join(' / ') : '形状非法'}`
      + ` · 名字/类型两两不同 ${namesOk && typesOk} · FEED_MAX_ITEMS=${mod.FEED_MAX_ITEMS}`
  };
}

/** 条目形状（契约第 6.1 条：5 个键、id 12 位 hex 且两两不同、url 三种形态） */
function judgeEntryShape(mod) {
  const entries = buildOf(mod, { sources: sourcesOf() });
  const keysOk = entries.every(entry => Object.keys(entry).sort().join(',') === 'at,id,text,title,url');
  const idOk = entries.every(entry => /^[0-9a-f]{12}$/.test(entry.id));
  const uniqueOk = new Set(entries.map(entry => entry.id)).size === entries.length;
  const urlOk = entries.every(entry => /^(deal\/[0-9a-f]{12}\/$|plans\/(coding|api)\/#plan-[0-9a-f]{12}$)/.test(entry.url));
  return {
    ok: entries.length > 0 && keysOk && idOk && uniqueOk && urlOk,
    detail: `${entries.length} 条 · 键集合恰 5 ${keysOk} · id 12hex ${idOk} · id 两两不同 ${uniqueOk} · url 三形态 ${urlOk}`
  };
}

/** 条目 id 的唯一推导：逐条对账（不是「看着像 12 位 hex 就算过」） */
function judgeIdDerivation(mod) {
  const entries = buildOf(mod, { sources: sourcesOf() });
  const byUrl = new Map(entries.map(entry => [entry.url, entry.id]));
  const problems = [];
  for (const kind of ['deal', 'plan', 'apiPlan']) {
    for (const event of DEFAULT_EVENTS[kind]) {
      const key = kind === 'deal' ? event.id : event.planId;
      const url = expectedUrlOf(kind, key);
      const expected = expectedIdOf(kind, event);
      const actual = byUrl.get(url);
      if (actual !== expected) problems.push(`${url}: 期望 ${expected} 实得 ${actual}`);
    }
  }
  const sample = entries.slice(0, 2).map(entry => `${entry.url} → ${entry.id}`).join(' · ');
  return {
    ok: problems.length === 0 && byUrl.size === 6,
    detail: problems.length ? problems.slice(0, 3).join('；') : `6/6 逐条对上（${sample}）`
  };
}

/** 排除规则：算不出 url / at 非法 ⇒ 丢弃；未知 kind ⇒ 抛错 */
function judgeExclusions(mod) {
  const junk = [
    dealEvent({ id: 'not-a-key' }),                    // 键不是 12 位 hex
    dealEvent({ id: 'AABBCCDDEEFF' }),                 // 大写 hex：同样算不出（宁缺勿滥）
    dealEvent({ id: null }),                           // 键缺失
    dealEvent({ at: '2026/10/10' }),                   // at 形态非法
    dealEvent({ at: '' }),                             // at 缺失
    (() => { const event = dealEvent({}); delete event.id; return event; })(), // 连键都没有
    { at: '2026-10-10', type: 'created', field: null, from: null, to: null },  // 连记录键都没有
    { planId: 'short', at: '2026-10-10', type: 'created', field: null, from: null, to: null }
  ];
  const dropped = buildOf(mod, { sources: sourcesOf({ deal: junk, plan: [{ at: '2026-10-10' }], apiPlan: [] }) });
  const kept = buildOf(mod, {
    sources: sourcesOf({ deal: [dealEvent({ id: DEAL_A })], plan: [], apiPlan: [] })
  });
  let unknownKind = null;
  try {
    buildOf(mod, { sources: sourcesOf(DEFAULT_EVENTS).concat([
      { kind: 'deals', profile: history.PROFILE, store: { events: [dealEvent({})] }, titleOf: titleOfEvent }
    ]) });
  } catch (error) {
    unknownKind = error;
  }
  return {
    ok: dropped.length === 0 && kept.length === 1 && unknownKind !== null,
    detail: `脏事件 ${junk.length} 条 ⇒ 产出 ${dropped.length} 条 · 干净输入仍产出 ${kept.length} 条`
      + ` · 未知 kind ${unknownKind ? '抛错 ✓' : '**没抛错**（静默忽略了）'}`
  };
}

/** 全序排序：打乱输入 ⇒ 顺序不变；同日按 id 收敛；与同一份比较器一致 */
function judgeOrdering(mod) {
  const straight = buildOf(mod, { sources: sourcesOf() });
  const shuffled = buildOf(mod, {
    sources: sourcesOf({
      deal: [...DEFAULT_EVENTS.deal].reverse(),
      plan: DEFAULT_EVENTS.plan,
      apiPlan: DEFAULT_EVENTS.apiPlan
    }).reverse()
  });
  const sameOrder = straight.map(entry => entry.id).join(',') === shuffled.map(entry => entry.id).join(',');
  const totalOrder = straight.every((entry, index) => index === 0
    || straight[index - 1].at > entry.at
    || (straight[index - 1].at === entry.at && straight[index - 1].id < entry.id));
  // 同日样例：DEAL_B 与 DEAL_C 都在 2026-10-09，输出里必须相邻且按 id 升序（这就是 tiebreak）
  const sameDay = straight.filter(entry => entry.at === '2026-10-09');
  const tiebreak = sameDay.length === 2 && sameDay[0].id < sameDay[1].id
    && new Set(sameDay.map(entry => entry.url)).size === 2
    && sameDay.map(entry => entry.url).sort().join(',') === [
      expectedUrlOf('deal', DEAL_B), expectedUrlOf('deal', DEAL_C)
    ].sort().join(',');
  // 与「直接调同一份比较器」的对照（复用，不是第二份实现）
  const reference = [...straight].sort(changes.compareByRecency).map(entry => entry.id).join(',');
  return {
    ok: sameOrder && totalOrder && tiebreak && reference === straight.map(entry => entry.id).join(','),
    detail: `顺序键 ${straight.map(entry => `${entry.at}/${entry.id.slice(0, 4)}`).join(' > ')}`
      + ` · 打乱后一致 ${sameOrder} · 同日按 id 收敛 ${tiebreak} · 与同一份比较器一致 ${reference.length > 0}`
  };
}

/** 上限：只裁尾（留下的正是排在前面的那些） */
function judgeLimit(mod) {
  const many = [];
  for (let i = 0; i < mod.FEED_MAX_ITEMS + 2; i += 1) {
    many.push(dealEvent({ id: i.toString(16).padStart(12, '0'), at: dayOfIndex(i) }));
  }
  const options = { linkableIds: new Set(many.map(event => event.id)) };
  const full = buildOf(mod, { sources: sourcesOf({ deal: many, plan: [], apiPlan: [] }, {}, options), max: many.length });
  const cut = buildOf(mod, { sources: sourcesOf({ deal: many, plan: [], apiPlan: [] }, {}, options) });
  const tailOnly = cut.length === mod.FEED_MAX_ITEMS
    && cut.map(entry => entry.id).join(',') === full.slice(0, mod.FEED_MAX_ITEMS).map(entry => entry.id).join(',');
  const explicit = buildOf(mod, { sources: sourcesOf({ deal: many, plan: [], apiPlan: [] }, {}, { linkableIds: new Set(many.map(event => event.id)) }), max: 2 });
  const explicitOk = explicit.length === 2 && explicit.map(entry => entry.id).join(',') === full.slice(0, 2).map(entry => entry.id).join(',');
  return {
    ok: full.length === many.length && tailOnly && explicitOk,
    detail: `${many.length} 条事件 ⇒ 默认上限 ${cut.length} 条（= FEED_MAX_ITEMS ${mod.FEED_MAX_ITEMS}）· 裁的是尾部 ${tailOnly}`
      + ` · max=2 ⇒ ${explicit.length} 条 ${explicitOk}`
  };
}

/**
 * deal 的可链接门（t13 断言 ①）。
 * 缺 `linkableIds` ⇒ 抛错（不许靠猜发 `deal/<id>/`）；非 Set（这里是数组）同样抛错。
 */
function judgeDealLinkableGate(mod) {
  const events = { deal: [dealEvent({ id: DEAL_A }), changeEvent({ id: DEAL_B })], plan: [], apiPlan: [] };
  const attempts = {};
  for (const [label, options] of [
    ['缺 linkableIds', { omitLinkableIds: true }],
    ['linkableIds 是数组不是 Set', { linkableIds: [DEAL_A, DEAL_B] }]
  ]) {
    try {
      buildOf(mod, { sources: sourcesOf(events, {}, options) });
      attempts[label] = null;
    } catch (error) {
      attempts[label] = error;
    }
  }
  const all = buildOf(mod, { sources: sourcesOf(events) });
  const empty = buildWithStats(mod, { sources: sourcesOf(events, {}, { linkableIds: new Set() }) });
  return {
    ok: attempts['缺 linkableIds'] !== null && attempts['linkableIds 是数组不是 Set'] !== null
      && all.length === 2 && empty.entries.length === 0,
    detail: `缺集合 ⇒ ${attempts['缺 linkableIds'] ? '抛错 ✓' : '**没抛错**'}`
      + ` · 非 Set ⇒ ${attempts['linkableIds 是数组不是 Set'] ? '抛错 ✓' : '**没抛错**'}`
      + ` · 全可链接 ⇒ ${all.length} 条 · 空集合 ⇒ ${empty.entries.length} 条（合法：今天一条记录都不可链接，`
      + `此时 ${statsLine(empty.stats)}）`
  };
}

/**
 * 断言 ②：集合里排除某个 id ⇒ **`stats.dropped.notLinkable` 恰好 +1**，且该条不在 `entries` 里，
 * 其余条目与顺序都不动（丢弃是「不发」，不是「换一个 id 顶上」）。
 */
function judgeNotLinkableBucket(mod) {
  const events = { deal: [dealEvent({ id: DEAL_A }), changeEvent({ id: DEAL_B })], plan: [], apiPlan: [] };
  const all = buildWithStats(mod, { sources: sourcesOf(events) });
  const excluding = buildWithStats(mod, { sources: sourcesOf(events, {}, { linkableIds: new Set([DEAL_A]) }) });
  const urls = excluding.entries.map(entry => entry.url);
  return {
    ok: all.stats.dropped.notLinkable === 0 && all.stats.kept === 2
      && excluding.stats.dropped.notLinkable === 1
      && excluding.stats.kept === 1
      && !urls.includes(expectedUrlOf('deal', DEAL_B))
      && urls.join(',') === expectedUrlOf('deal', DEAL_A),
    detail: `全可链接：${statsLine(all.stats)}`
      + ` ／ 排除 ${DEAL_B}：${statsLine(excluding.stats)}`
      + ` · 该条不在 entries ${!urls.includes(expectedUrlOf('deal', DEAL_B))} · 剩下 ${urls.join(',')}`
  };
}

/**
 * 断言 ④：恒等式 `kept + Σdropped + truncated === considered` 必须在**超上限**夹具上成立
 * —— 上限截断与丢弃都会让「喂入数 − 返回数」变小，这条夹具专门把两者同时逼出来
 * （42 条事件 / 上限 40 ⇒ kept 40、truncated 2、dropped 0）。
 */
function judgeStatsIdentity(mod) {
  const many = [];
  for (let i = 0; i < mod.FEED_MAX_ITEMS + 2; i += 1) {
    many.push(dealEvent({ id: i.toString(16).padStart(12, '0'), at: dayOfIndex(i) }));
  }
  const options = { linkableIds: new Set(many.map(event => event.id).slice(1)) };  // 顺带制造 1 条不可链接
  const run = buildWithStats(mod, { sources: sourcesOf({ deal: many, plan: [], apiPlan: [] }, {}, options) });
  const closed = run.stats.kept + droppedTotalOf(run.stats) + run.stats.truncated === run.stats.considered;
  return {
    ok: run.stats.considered === many.length && run.stats.dropped.notLinkable === 1
      && run.stats.kept === mod.FEED_MAX_ITEMS && run.stats.truncated === 1 && closed,
    detail: `${many.length} 条事件（其中 1 条不可链接）· 上限 ${mod.FEED_MAX_ITEMS} ⇒ ${statsLine(run.stats)}`
      + ` · 恒等式成立 ${closed}（截断 1 + 丢弃 1 都记在账上，不是「差值 2」）`
  };
}

/**
 * 断言 ⑤：三类丢弃各一例的**定向夹具** —— 每一类恰好只影响它自己那一条，
 * 其余事件必须原样入选（证明没有静默丢弃，也没有把原因混桶）。
 */
function judgeDropBuckets(mod) {
  const events = {
    deal: [
      dealEvent({ id: DEAL_A, at: '2026-10-10' }),                       // 正常入选
      dealEvent({ id: DEAL_C, at: '2026-10-09' })                        // 正常入选（用了线下的 id，制造不可链接）
    ],
    plan: [
      planEvent({ at: '2026-10-08' }),                                   // 正常入选
      planEvent({ planId: 'not-a-key', at: '2026-10-07' }),              // noUrl：键不是 12 位 hex
      planEvent({ planId: '333333333333', at: '2026-10-06/坏' })          // invalidAt：at 非法
    ],
    apiPlan: []
  };
  const run = buildWithStats(mod, {
    sources: sourcesOf(events, {}, { linkableIds: new Set([DEAL_A]) })    // ⇒ DEAL_C 落 notLinkable
  });
  const urls = run.entries.map(entry => entry.url);
  const buckets = run.stats.dropped;
  return {
    ok: buckets.notLinkable === 1 && buckets.noUrl === 1 && buckets.invalidAt === 1 && buckets.duplicate === 0
      && run.stats.kept === 2 && run.stats.truncated === 0
      && urls.includes(expectedUrlOf('deal', DEAL_A)) && !urls.includes(expectedUrlOf('deal', DEAL_C))
      && urls.includes(expectedUrlOf('plan', PLAN_A)),
    detail: `夹具 5 条事件 = 2 条正常 + 1 条不可链接 + 1 条键非法 + 1 条 at 非法 ⇒ ${statsLine(run.stats)}`
      + ` · 入选 ${urls.join(' · ')}`
  };
}

/** 真实数据夹具：`deals.json`（记录）+ `deal-history.json`（事件）—— 这次漏检的直接补牙 */
function realDealReading(mod) {
  const deals = JSON.parse(fs.readFileSync(REAL_DEALS_FILE, 'utf8')).deals;
  const store = JSON.parse(fs.readFileSync(REAL_DEAL_HISTORY_FILE, 'utf8'));
  const linkableIds = changes.linkableDealIdsOf(deals);
  const byId = new Map(deals.map(deal => [deal.id, deal]));
  const events = historyCore.eventsOf(store);
  const withPage = events.filter(event => {
    const record = byId.get(event.id);
    return Boolean(record && record.type === 'deal');
  });
  const run = buildWithStats(mod, {
    sources: [{
      kind: 'deal', profile: history.PROFILE, store, titleOf: () => '', linkableIds
    }]
  });
  const selectedKeys = run.entries.map(entry => entry.url.slice('deal/'.length, -1));
  return {
    deals,
    linkableIds,
    events,
    withPage,
    entries: run.entries,
    stats: run.stats,
    selectedKeys,
    dropped: events.length - run.entries.length,
    toolEvents: events.length - withPage.length,
    byId
  };
}

/**
 * 断言 ③（真实数据 · 这次漏检的直接补牙）：真实 `deals.json` + `deal-history.json` 下
 * deal 支必须 `kept === 0` 且 `dropped.notLinkable === 20`（工具类记录 20/20 没有详情页）。
 * 这条判据**随数据走**（不写死 20/0 的语义）：它要求「入选集合 == 真的有页面的记录的事件集合」，
 * 今天那个集合是空的 ⇒ 入选 0；明天真出现一条 deal 记录的事件，它会要求那一条**必须**入选。
 *
 * ⚠️ 这里**故意**按记录字段独立重算一遍「哪些记录有详情页」：
 * 判据本体在 `changes.js` 的 `isLinkableDeal()`（唯一一处），而测试必须能与实现分歧 ——
 * 所以两个方向都判：① 那份 `Set` 必须等于按记录字段重算出来的 id 集合（判据没过松 / 过严）；
 * ② 入选集合必须等于「真的有页面的记录」的事件集合（判据被正确消费）。
 */
function judgeRealDataDealLinkability(mod) {
  const reading = realDealReading(mod);
  const recordDerivedIds = new Set(reading.deals
    .filter(record => record && record.id && record.type === 'deal')
    .map(record => record.id));
  const setMatchesRecords = recordDerivedIds.size === reading.linkableIds.size
    && [...recordDerivedIds].every(id => reading.linkableIds.has(id));
  const linkableKeys = new Set(reading.linkableIds);
  const selectedAllLinkable = reading.selectedKeys.every(key => linkableKeys.has(key));
  const selectedMatchEventsWithPage = reading.selectedKeys.slice().sort().join(',')
    === reading.withPage.map(event => event.id).slice().sort().join(',');
  const accountsClosed = reading.stats.kept + droppedTotalOf(reading.stats)
    + reading.stats.truncated === reading.stats.considered;
  const droppedAllUnlinkable = reading.events
    .filter(event => !reading.selectedKeys.includes(event.id))
    .every(event => {
      const record = reading.byId.get(event.id);
      return !(record && record.type === 'deal');
    });
  return {
    ok: reading.events.length > 0 && setMatchesRecords && selectedAllLinkable
      && selectedMatchEventsWithPage && accountsClosed && droppedAllUnlinkable
      && reading.stats.kept === reading.withPage.length
      && reading.stats.dropped.notLinkable === reading.toolEvents
      && reading.stats.dropped.notLinkable === 20,
    detail: `真实 deals.json ${reading.deals.length} 条（有详情页 ${reading.linkableIds.size} 条 · 工具类 `
      + `${reading.deals.length - reading.linkableIds.size} 条）· deal-history ${reading.events.length} 条事件`
      + `（工具类记录 ${reading.toolEvents}/${reading.events.length}）⇒ ${statsLine(reading.stats)}`
      + ` · 判据集合 == 按记录字段重算 ${setMatchesRecords} · 入选逐条有详情页 ${selectedAllLinkable}`
      + ` · 入选集合 == 有页面记录的事件集合 ${selectedMatchEventsWithPage}`
      + ` · 被丢的逐条确实不可链接 ${droppedAllUnlinkable}`
  };
}

/** 身份与呈现无关：改 title/text 不改 id；改 at/type/field/from/to 必改 id */
function judgeIdentityVsPresentation(mod) {
  const base = buildOf(mod, { sources: sourcesOf() });
  const baseIds = new Map(base.map(entry => [entry.url, entry.id]));
  const baseIdOf = url => baseIds.get(url);

  const reworded = buildOf(mod, { sources: sourcesOf(DEFAULT_EVENTS, { titleOf: () => '', textOf: () => 'x' }) });
  const rewordedOk = reworded.length === base.length
    && reworded.every(entry => baseIdOf(entry.url) === entry.id)
    && reworded.every(entry => entry.title === '' && entry.text === 'x');

  const variants = {
    at: changeEvent({ id: DEAL_B, at: '2026-10-04' }),
    type: changeEvent({ id: DEAL_B, type: 'updated' }),
    field: changeEvent({ id: DEAL_B, field: 'eligibility' }),
    from: changeEvent({ id: DEAL_B, from: '101 万 tokens' }),
    to: changeEvent({ id: DEAL_B, to: '201 万 tokens' })
  };
  const moved = [];
  for (const [name, event] of Object.entries(variants)) {
    const entries = buildOf(mod, { sources: sourcesOf({ deal: [event], plan: [], apiPlan: [] }) });
    const got = entries.length === 1 ? entries[0].id : null;
    if (got === null || got === baseIdOf(expectedUrlOf('deal', DEAL_B))) moved.push(name);
  }
  return {
    ok: rewordedOk && moved.length === 0,
    detail: `改 title/text ⇒ id 不变 ${rewordedOk}（含空标题兜底）· 改 at/type/field/from/to ⇒ id 必变`
      + `（未变的：${moved.length ? moved.join('/') : '无'}）`
  };
}

/** 身份碰撞 fail-closed：两条不同事件同 id ⇒ 抛错 */
function judgeCollision(mod) {
  let error = null;
  let survived = null;
  try {
    survived = buildOf(mod, {
      sources: sourcesOf({ deal: [changeEvent({}), changeEvent({ origin: 'derived' })], plan: [], apiPlan: [] })
    });
  } catch (thrown) {
    error = thrown;
  }
  const ids = (survived || []).map(entry => entry.id);
  return {
    ok: error !== null,
    detail: error
      ? `抛错 ✓（${String(error.message).slice(0, 64)}…）`
      : `**没有抛错**：产出 ${ids.length} 条，id=【${ids.join(' , ')}】（静默放行了同一个身份的重复条目）`
  };
}

/** 同一条事件去重（幂等）：字节相同的事件只出现一次，且**不**抛错（键序不同也算同一件） */
function judgeDedupe(mod) {
  const twin = buildOf(mod, {
    sources: sourcesOf({ deal: [changeEvent({}), changeEvent({})], plan: [], apiPlan: [] })
  });
  const reversedEvent = Object.fromEntries(Object.entries(changeEvent({})).reverse());
  const orderFree = buildOf(mod, {
    sources: sourcesOf({ deal: [reversedEvent, changeEvent({})], plan: [], apiPlan: [] })
  });
  return {
    ok: twin.length === 1 && orderFree.length === 1 && twin[0].id === orderFree[0].id,
    detail: `同一事件写两遍 ⇒ ${twin.length} 条（幂等）· 键序不同的同一件事 ⇒ ${orderFree.length} 条且 id 相同`
      + `（${twin[0] && twin[0].id}）`
  };
}

/** 空输入：0 条、不编造、两种格式仍是合法文档；空 feed 的 updated 必须由调用方给数据日期 */
function judgeEmpty(mod) {
  const none = buildOf(mod, { sources: [] });
  const emptyStores = buildOf(mod, {
    sources: sourcesOf({ deal: [], plan: [], apiPlan: [] })
  });
  const atomMeta = Object.assign(metaFor(mod, 'atom'), { updatedAt: '2026-10-14' });
  const noDateMeta = Object.assign({}, metaFor(mod, 'atom'));
  delete noDateMeta.updatedAt;
  const atom = mod.renderAtom(none, atomMeta);
  const json = JSON.parse(mod.renderJsonFeed(none, Object.assign(metaFor(mod, 'json'), { updatedAt: '2026-10-14' })));
  let noDate = null;
  try {
    mod.renderAtom(none, noDateMeta);
  } catch (error) {
    noDate = error;
  }
  const ok = none.length === 0 && emptyStores.length === 0
    && !/<entry>/.test(atom) && json.items.length === 0
    && atom.includes('2026-10-14T00:00:00+08:00')
    && json.description === history.HISTORY_WORDING.HISTORY_NOTES.disclaimer
    && noDate !== null;
  return {
    ok,
    detail: `0 条事件 ⇒ ${none.length} 条条目（空 store 也是 ${emptyStores.length} 条）· Atom 无 <entry> ${!/<entry>/.test(atom)}`
      + ` · JSON items=${json.items.length} · feed 级 updated 用 meta.updatedAt ${atom.includes('2026-10-14T00:00:00+08:00')}`
      + ` · 缺 updatedAt ⇒ ${noDate ? '抛错 ✓（不看时钟、也不编日期）' : '**静默编了个日期**'}`
  };
}

/** Atom 良构 + 要素齐备 + 时间形态唯一 */
function judgeAtomDocument(mod) {
  const entries = buildOf(mod, { sources: sourcesOf() });
  const atomPair = mod.FEED_FILES.find(([, type]) => type.includes('xml'));
  const atom = mod.renderAtom(entries, metaFor(mod, 'atom'));
  const problems = xmlProblems(atom);
  if (!atom.includes(`<link rel="self" type="${atomPair[1]}"`)) problems.push('self 链接的 type 不是 FEED_FILES 里那条 MIME');
  if (!atom.includes('<author><name>')) problems.push('缺 <author><name>');
  if ((atom.match(/<entry>/g) || []).length !== entries.length) problems.push('条目数与 <entry> 数不等');
  const stamps = [...atom.matchAll(/<updated>([^<]*)<\/updated>/g)].map(match => match[1]);
  if (stamps.length !== entries.length + 1) problems.push(`时间字段个数不对（${stamps.length}）`);
  if (!stamps.every(stamp => /^\d{4}-\d{2}-\d{2}T00:00:00\+08:00$/.test(stamp))) problems.push('时间形态不是 ${at}T00:00:00+08:00');
  if (/\d{2}:\d{2}:\d{2}(?!\+08:00)/.test(atom)) problems.push('产物里出现了别的时分秒');
  if (!atom.endsWith('</feed>\n')) problems.push('结尾不是 </feed> + 换行');
  // tag: URI 的 host 必须由 siteUrl 派生（不写死域名）
  const other = mod.renderAtom(entries, Object.assign(metaFor(mod, 'atom'), { siteUrl: 'https://example.test/base/' }));
  if (!other.includes('tag:example.test,')) problems.push('tag: URI 的 host 没有跟着 siteUrl 走');
  if (other.includes('buguoshixc.github.io')) problems.push('tag: URI 里写死了生产域名');
  return {
    ok: problems.length === 0,
    detail: problems.length ? problems.join('；')
      : `良构 ✓ · 要素齐备 ✓ · 时间字段 ${stamps.length} 个全为 T00:00:00+08:00 · host 随 siteUrl 派生 ✓`
  };
}

/** XML 转义：无裸 & / 裸 <；实体化证据；JSON 侧原文一致 */
function judgeEscaping(mod) {
  const title = '示例 & 优惠 <限时> "双引号" \'单引号\'';
  const events = {
    deal: [dealEvent({ id: DEAL_A, at: '2026-10-10' })],
    plan: [],
    apiPlan: []
  };
  const entries = buildOf(mod, {
    sources: sourcesOf(events, { titleOf: () => title, textOf: () => title })
  });
  const atom = mod.renderAtom(entries, metaFor(mod, 'atom'));
  const jsonText = mod.renderJsonFeed(entries, metaFor(mod, 'json'));
  const json = JSON.parse(jsonText);
  const problems = xmlProblems(atom);
  const entities = ['&amp;', '&lt;', '&gt;', '&quot;', '&apos;'].map(entity => [entity, atom.includes(entity)]);
  const entitiesOk = entities.every(([, hit]) => hit);
  const jsonHonest = json.items.length === 1 && json.items[0].title === title && json.items[0].summary === title
    && json.items[0].content_text === title;
  return {
    ok: problems.length === 0 && entitiesOk && jsonHonest,
    detail: problems.length ? problems.join('；')
      : `无裸 & / 裸 < ✓ · 五种实体化 ${entities.map(([entity, hit]) => `${entity}:${hit}`).join(' ')}`
        + ` · JSON 侧保留原文 ${jsonHonest}`
  };
}

/** 两格式恒等：条目数 / 顺序 / id / url / title 逐条相同 */
function judgeCrossFormat(mod) {
  const entries = buildOf(mod, { sources: sourcesOf() });
  const atom = mod.renderAtom(entries, metaFor(mod, 'atom'));
  const json = JSON.parse(mod.renderJsonFeed(entries, metaFor(mod, 'json')));
  const atomEntries = atomEntriesOf(atom);
  const sameCount = atomEntries.length === json.items.length && json.items.length === entries.length;
  const sameIds = atomEntries.map(entry => entry.id).join(',') === json.items.map(item => item.id).join(',');
  const sameUrls = atomEntries.map(entry => entry.href).join(',') === json.items.map(item => item.url).join(',');
  const sameTitles = atomEntries.every((entry, index) => entry.title === site.xmlEscape(json.items[index].title))
    && atomEntries.every((entry, index) => entry.summary === site.xmlEscape(json.items[index].summary));
  const absolute = json.items.every(item => item.url.startsWith(site.SITE_URL) && item.url.length > site.SITE_URL.length);
  const versionOk = json.version === 'https://jsonfeed.org/version/1.1' && json.language === 'zh-CN'
    && json.home_page_url === site.SITE_URL
    && json.feed_url === site.SITE_URL + metaFor(mod, 'json').selfPath;
  const datesOk = json.items.every(item => /^\d{4}-\d{2}-\d{2}T00:00:00\+08:00$/.test(item.date_published)
    && /^\d{4}-\d{2}-\d{2}T00:00:00\+08:00$/.test(item.date_modified));
  return {
    ok: sameCount && sameIds && sameUrls && sameTitles && absolute && versionOk && datesOk,
    detail: `Atom ${atomEntries.length} 条 ↔ JSON ${json.items.length} 条 · id 序列相同 ${sameIds}`
      + ` · url 序列相同 ${sameUrls}（全为绝对 URL ${absolute}）· title/summary 逐条相同 ${sameTitles}`
      + ` · version/language/home/feed ${versionOk} · 日期形态 ${datesOk}`
  };
}

/** 决定论：两次渲染逐字节相同；改 runAt / 打乱事件对象键序 ⇒ 字节不变 */
function judgeDeterminism(mod) {
  const atom = () => mod.renderAtom(buildOf(mod, { sources: sourcesOf() }), metaFor(mod, 'atom'));
  const json = () => mod.renderJsonFeed(buildOf(mod, { sources: sourcesOf() }), metaFor(mod, 'json'));
  const twice = atom() === atom() && json() === json();

  const bumped = {
    deal: DEFAULT_EVENTS.deal.map(event => Object.assign({}, event, { runAt: '2099-01-01T00:00:00.000Z' })),
    plan: DEFAULT_EVENTS.plan.map(event => Object.assign({}, event, { runAt: '2099-01-01T00:00:00.000Z' })),
    apiPlan: DEFAULT_EVENTS.apiPlan.map(event => Object.assign({}, event, { runAt: '2099-01-01T00:00:00.000Z' }))
  };
  const runAtStable = mod.renderAtom(buildOf(mod, { sources: sourcesOf(bumped) }), metaFor(mod, 'atom')) === atom();

  const reordered = {
    deal: DEFAULT_EVENTS.deal.map(event => Object.assign({}, Object.fromEntries(Object.entries(event).reverse()))),
    plan: DEFAULT_EVENTS.plan.map(event => Object.assign({}, Object.fromEntries(Object.entries(event).reverse()))),
    apiPlan: DEFAULT_EVENTS.apiPlan.map(event => Object.assign({}, Object.fromEntries(Object.entries(event).reverse())))
  };
  const keyOrderStable = mod.renderJsonFeed(buildOf(mod, { sources: sourcesOf(reordered) }), metaFor(mod, 'json')) === json();

  return {
    ok: twice && runAtStable && keyOrderStable,
    detail: `同输入两次渲染逐字节相同 ${twice} · 改 runAt（采集时刻）字节不变 ${runAtStable}`
      + ` · 打乱事件对象键序字节不变 ${keyOrderStable}`
  };
}

/** 日期来自数据：全体 +1 天 ⇒ 产物里所有日期字段同步位移；除日期与由它派生的 id 外逐行相同 */
function judgeDateFromData(mod) {
  const before = buildOf(mod, { sources: sourcesOf() });
  const shifted = {
    deal: DEFAULT_EVENTS.deal.map(event => Object.assign({}, event, { at: shiftDay(event.at) })),
    plan: DEFAULT_EVENTS.plan.map(event => Object.assign({}, event, { at: shiftDay(event.at) })),
    apiPlan: DEFAULT_EVENTS.apiPlan.map(event => Object.assign({}, event, { at: shiftDay(event.at) }))
  };
  const after = buildOf(mod, { sources: sourcesOf(shifted) });
  const atOk = before.length === after.length
    && before.every((entry, index) => after[index].at === shiftDay(entry.at) && after[index].id !== entry.id);
  const atomBefore = mod.renderAtom(before, metaFor(mod, 'atom'));
  const atomAfter = mod.renderAtom(after, metaFor(mod, 'atom'));
  const jsonBefore = JSON.parse(mod.renderJsonFeed(before, metaFor(mod, 'json')));
  const jsonAfter = JSON.parse(mod.renderJsonFeed(after, metaFor(mod, 'json')));
  const stampsBefore = [...atomBefore.matchAll(/<updated>([^<]*)<\/updated>/g)].map(match => match[1]);
  const stampsAfter = [...atomAfter.matchAll(/<updated>([^<]*)<\/updated>/g)].map(match => match[1]);
  const moved = stampsBefore.length === stampsAfter.length
    && stampsBefore.every((stamp, index) => stampsAfter[index] === stamp.replace(/^(\d{4}-\d{2}-\d{2})/, (all, day) => shiftDay(day)));
  // 掩掉「数据日期」与「由它派生的 id」之后，两份文档必须逐行相同（否则说明有东西不来自数据）
  const masked = text => text
    .replace(/\d{4}-\d{2}-\d{2}T00:00:00\+08:00/g, '<TIME>')
    .replace(/\d{4}-\d{2}-\d{2}/g, '<DATE>')
    .replace(/[0-9a-f]{12}/g, '<ID>');
  const onlyDatesAndIdsDiffer = masked(atomBefore) === masked(atomAfter) && atomBefore !== atomAfter;
  const jsonOk = jsonBefore.items.length === jsonAfter.items.length
    && jsonAfter.items.every((item, index) => item.date_published === `${shiftDay(jsonBefore.items[index].date_published.slice(0, 10))}T00:00:00+08:00`
      && item.date_modified === `${shiftDay(jsonBefore.items[index].date_modified.slice(0, 10))}T00:00:00+08:00`
      && item.id !== jsonBefore.items[index].id);
  return {
    ok: atOk && moved && onlyDatesAndIdsDiffer && jsonOk && jsonBefore.items[0].id !== jsonAfter.items[0].id,
    detail: `整体 +1 天：条目 at 同步位移 ${atOk}（id 也随之改变，因为 at 进身份）· ${stampsBefore.length} 个时间字段全部位移 ${moved}`
      + ` · 掩掉日期与 id 后两份文档逐行相同 ${onlyDatesAndIdsDiffer} · JSON 两列日期同步位移 ${jsonOk}`
  };
}

/** 文案只从既有措辞表取：feed 级说明文字逐字同源 · 条目文案可溯源 · 检测器正反例自证 */
function judgeWording(mod) {
  const wording = history.HISTORY_WORDING;
  const disclaimer = wording.HISTORY_NOTES.disclaimer;
  const entries = buildOf(mod, { sources: sourcesOf() });
  const atom = mod.renderAtom(entries, metaFor(mod, 'atom'));
  const json = JSON.parse(mod.renderJsonFeed(entries, metaFor(mod, 'json')));

  const sourceOk = atom.includes(site.xmlEscape(disclaimer)) && json.description === disclaimer
    && !atom.includes('官方宣布');

  const allowed = allowedWordingTexts();
  const untraceable = [];
  for (const entry of entries) {
    for (const field of ['title', 'text']) {
      for (const run of hanRunsOf(entry[field])) {
        if (!allowed.some(text => text.includes(run))) untraceable.push(`${field}:${run}`);
      }
    }
  }

  // 正向证据：默认正文里必须出现措辞表里那一对词（证明确实读了表，而不是碰巧没写中文）
  const byUrl = new Map(entries.map(entry => [entry.url, entry]));
  const created = byUrl.get(expectedUrlOf('deal', DEAL_A));
  const changed = byUrl.get(expectedUrlOf('deal', DEAL_B));
  const positive = created && created.text.includes(wording.HISTORY_TYPES.created)
    && changed && changed.text.includes(wording.HISTORY_TYPES.benefit_changed)
    && changed.text.includes(wording.HISTORY_FIELD_LABELS.discountInfo)
    && changed.text.includes(wording.HISTORY_LABELS.from) && changed.text.includes(wording.HISTORY_LABELS.to)
    && changed.text.includes('200 万 tokens');

  // 检测器自证（正反例成对）：防「永远不命中」
  const selfProof = wording.HISTORY_TYPES.created !== '官方宣布'
    && !hanRunsOf('这是官方宣布的变化').every(run => allowed.some(text => text.includes(run)))
    && hanRunsOf(wording.HISTORY_TYPES.created).every(run => allowed.some(text => text.includes(run)));

  return {
    ok: sourceOk && untraceable.length === 0 && positive && selfProof,
    detail: `feed 级说明文字 = HISTORY_NOTES.disclaimer 逐字同源 ${sourceOk} · 条目文案 ${untraceable.length ? `有 ${untraceable.length} 处溯源不到：${untraceable.slice(0, 3).join('、')}` : '全部可溯源'}`
      + ` · 正向证据（类型词 / 字段名 / 原·新 / 数据值都在场）${positive} · 检测器正反例自证 ${selfProof}`
  };
}

const JUDGEMENTS = [
  { name: '返回形状 { entries, stats }（kept === entries.length · stats 键齐全）', run: judgeReturnShape },
  { name: '导出表（5 个名字 · 2 条产物 · FEED_MAX_ITEMS=40）', run: judgeExportTable },
  { name: '条目形状（恰好 5 键 · id 12 位 hex 且两两不同 · url 三种形态）', run: judgeEntryShape },
  { name: '条目 id 的唯一推导（逐条对账 idFromBasis(eventKey)）', run: judgeIdDerivation },
  { name: '排除规则（算不出 url / at 非法 ⇒ 丢弃；未知 kind ⇒ 抛错）', run: judgeExclusions },
  { name: '① deal 可链接门（缺集合 / 非 Set ⇒ 抛错，不许靠猜发 deal/<id>/）', run: judgeDealLinkableGate },
  { name: '② stats.dropped.notLinkable 定向（集合排除某 id ⇒ 恰好 +1 且该条不在 entries）', run: judgeNotLinkableBucket },
  { name: '③ 真实数据：deal 支 kept === 0 · dropped.notLinkable === 20（20/20 是工具类）', run: judgeRealDataDealLinkability },
  { name: '④ stats 恒等式（超上限夹具：kept + Σdropped + truncated === considered）', run: judgeStatsIdentity },
  { name: '⑤ 三类丢弃各一例（notLinkable / noUrl / invalidAt 定向，无静默丢弃）', run: judgeDropBuckets },
  { name: '返回形状 { entries, stats }（两个渲染器仍只吃 entries 数组）', run: judgeReturnShape },
  { name: '全序排序（打乱输入 ⇒ 顺序不变 · 同日按 id 收敛 · 与同一份比较器一致）', run: judgeOrdering },
  { name: '上限（只裁尾：留下的正是排在前面的那些）', run: judgeLimit },
  { name: '身份与呈现无关（改 title/text 不改 id；改 at/type/field/from/to 必改 id）', run: judgeIdentityVsPresentation },
  { name: '身份碰撞 fail-closed（两条不同事件同 id ⇒ 抛错，不静默放行）', run: judgeCollision },
  { name: '同一条事件去重（逐字节相同只留一条 · 键序无关 · 不抛错）', run: judgeDedupe },
  { name: '空输入（0 条不编造 · 两种格式仍合法 · updated 由数据给）', run: judgeEmpty },
  { name: 'Atom 良构与要素齐备（无 DOCTYPE · 时间形态唯一 · host 随 siteUrl）', run: judgeAtomDocument },
  { name: 'XML 转义（无裸 & / 裸 < · 五种实体化 · JSON 侧保留原文）', run: judgeEscaping },
  { name: '两格式恒等（条目数 · 顺序 · id · url · title 逐条相同）', run: judgeCrossFormat },
  { name: '决定论（两次渲染逐字节相同 · 改 runAt / 键序字节不变）', run: judgeDeterminism },
  { name: '日期来自数据（全体 +1 天 ⇒ 所有日期字段同步位移）', run: judgeDateFromData },
  { name: '文案只从既有措辞表取（说明文字同源 · 条目文案可溯源 · 检测器自证）', run: judgeWording }
];

function runJudgements(mod) {
  return JUDGEMENTS.map(judgement => {
    try {
      const result = judgement.run(mod) || {};
      return { name: judgement.name, ok: !!result.ok, detail: result.detail || '' };
    } catch (error) {
      return { name: judgement.name, ok: false, detail: `抛错：${error && error.message}` };
    }
  });
}

/**
 * `buildFeedEntries` 的返回形状（t13 冻结）：`{ entries, stats }`。
 * 判据侧统一从这里取 —— 形状不对（比如退回旧的裸数组）当场抛错，不给「静默当成数组用」留口子。
 */
function buildWithStats(mod, params) {
  const result = mod.buildFeedEntries(params);
  const stats = result && result.stats;
  if (!result || !Array.isArray(result.entries) || !stats || !stats.dropped
    || typeof stats.considered !== 'number' || typeof stats.kept !== 'number'
    || typeof stats.truncated !== 'number') {
    throw new Error('buildFeedEntries 必须返回 { entries, stats }，且 stats 含 considered / kept / dropped / truncated'
      + `（实得 ${result === null ? 'null' : typeof result}${Array.isArray(result) ? '（裸数组 = 旧形状）' : ''}）`);
  }
  return result;
}

/** 只取条目（绝大多数判据只关心条目） */
function buildOf(mod, params) {
  return buildWithStats(mod, params).entries;
}

/** 账目总和（恒等式左边那三项） */
function droppedTotalOf(stats) {
  return stats.dropped.notLinkable + stats.dropped.noUrl
    + stats.dropped.invalidAt + stats.dropped.duplicate;
}

/** `stats` 的单行读数（判据与末尾读数共用同一份格式） */
function statsLine(stats) {
  return `considered ${stats.considered} · kept ${stats.kept}`
    + ` · dropped ${JSON.stringify(stats.dropped)}（合计 ${droppedTotalOf(stats)}）· truncated ${stats.truncated}`
    + ` · 恒等式 ${stats.kept + droppedTotalOf(stats) + stats.truncated === stats.considered}`;
}

/* ------------------------------------------------------------------ */
/* 小工具（判据侧）                                                     */
/* ------------------------------------------------------------------ */

/** 索引 → 数据日期（纯字符串算术，不用任何时钟） */
function dayOfIndex(index) {
  const pad = value => String(value).padStart(2, '0');
  return index < 31 ? `2026-10-${pad(index + 1)}` : `2026-11-${pad(index - 30)}`;
}

/** 数据日期 +1 天（判据侧做日期算术：只在测试里用，feed.js 里没有日期算术） */
function shiftDay(at) {
  return new Date(Date.parse(`${at}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
}

/** 中文字段（Han）切段：用于「产物里的中文片段必须能在措辞表 / 夹具数据里找到出处」 */
function hanRunsOf(text) {
  return (String(text).match(/[\u4e00-\u9fff]+/g) || []);
}

/** 允许的文案来源集合：既有措辞表（全部值）+ 夹具注入的数据文本 */
function allowedWordingTexts() {
  const out = [];
  const walk = value => {
    if (typeof value === 'string') { if (hanRunsOf(value).length) out.push(value); return; }
    if (Array.isArray(value)) { value.forEach(walk); return; }
    if (value && typeof value === 'object') Object.values(value).forEach(walk);
  };
  walk(history.HISTORY_WORDING);
  walk(planHistory.PLAN_HISTORY_WORDING);
  walk(apiPlanHistory.API_PLAN_HISTORY_WORDING);
  FIXTURE_TEXT.forEach(text => out.push(text));
  return out;
}

/** Atom 里的条目（只取判据要用的字段；不用 XML 解析器，本仓零依赖） */
function atomEntriesOf(atom) {
  return [...atom.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(match => {
    const body = match[1];
    const text = tag => {
      const found = body.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
      return found ? found[1] : null;
    };
    const href = body.match(/<link rel="alternate" type="text\/html" href="([^"]*)"/);
    return { id: text('id'), title: text('title'), summary: text('summary'), updated: text('updated'), href: href ? href[1] : null };
  });
}

/**
 * 极简 XML 良构检查（只认我们自己序列化出来的子集：声明 + 元素 + 双引号属性 + 注释 + 五个命名实体）。
 * CDATA / DOCTYPE / 单引号属性一律判为不合规 —— 我们从不写它们。
 */
function xmlProblems(xml) {
  const problems = [];
  if (!xml.startsWith('<?xml version="1.0" encoding="utf-8"?>\n')) problems.push('首行不是冻结的 XML 声明');
  if (/<!DOCTYPE/i.test(xml)) problems.push('出现 <!DOCTYPE（全仓唯一 document 出口是 page-shell.js）');
  if (/<!\[CDATA\[/.test(xml)) problems.push('出现 CDATA');
  if (/'/.test(xml.replace(/'[\u4e00-\u9fff]*'/g, ''))) problems.push('属性使用了单引号（我们统一双引号）');
  const body = xml.replace(/^<\?xml[^>]*\?>\n?/, '');
  const stack = [];
  let last = 0;
  const textProblem = chunk => {
    if (/&(?!(amp|lt|gt|quot|apos);)/.test(chunk)) problems.push('文本 / 属性里有裸 &');
    if (chunk.includes('<')) problems.push('文本里有裸 <');
  };
  const re = /<(\/?)([A-Za-z][A-Za-z0-9:_.-]*)((?:"[^"]*"|[^>"])*?)(\/?)>/g;
  let match;
  while ((match = re.exec(body))) {
    textProblem(body.slice(last, match.index));
    last = re.lastIndex;
    const [, closing, name, , selfClosing] = match;
    if (closing) {
      const top = stack.pop();
      if (top !== name) problems.push(`标签不配平：</${name}> 对上的是 ${top}`);
    } else if (!selfClosing) {
      stack.push(name);
    }
  }
  textProblem(body.slice(last));
  if (stack.length) problems.push(`未闭合标签：${stack.join(',')}`);
  return problems;
}

/**
 * 注释剥离（粗粒度版）：4 文件扫描只关心**代码里的**字面量，注释里提到名字是允许的。
 * 已知边界：字符串里的 `//`（如 URL）不剥（含 `://` 的行整行不做行注释处理）；
 * 行内块注释按它自己的结束符收口。粗粒度的方向是**宁可少剥**（= 更严），不会放过代码里的字面量。
 */
function stripCommentsForScan(source) {
  const out = [];
  let inBlock = false;
  for (const line of source.split(/\r?\n/)) {
    let text = line;
    if (inBlock) {
      const end = text.indexOf('*/');
      if (end < 0) continue;
      text = text.slice(end + 2);
      inBlock = false;
    }
    let start = text.indexOf('/*');
    while (start >= 0) {
      const end = text.indexOf('*/', start + 2);
      if (end < 0) { text = text.slice(0, start); inBlock = true; break; }
      text = text.slice(0, start) + text.slice(end + 2);
      start = text.indexOf('/*');
    }
    if (!text.includes('://')) {
      const lineComment = text.indexOf('//');
      if (lineComment >= 0) text = text.slice(0, lineComment);
    }
    out.push(text);
  }
  return out.join('\n');
}

/**
 * 非注释代码里的中文字面量：**只有诊断消息（`throw new Error(...)` 的参数）允许中文**。
 * 产物文案必须来自措辞表（行为判据见 `judgeWording`），所以正文拼装里不许出现中文词。
 *
 * 实现：先把每个 `throw new Error(...)` 语句（含跨行 `+` 拼接）整段挖掉，再看剩下的代码。
 */
function chineseLiteralsOutsideDiagnostics(source) {
  const hits = [];
  let insideDiagnostic = false;
  stripCommentsForScan(source).split('\n').forEach((line, index) => {
    let text = line;
    if (insideDiagnostic) {
      const close = text.indexOf(');');
      if (close < 0) return;
      text = text.slice(close + 2);
      insideDiagnostic = false;
    }
    for (;;) {
      const at = text.indexOf('throw new Error(');
      if (at < 0) break;
      const rest = text.slice(at + 'throw new Error('.length);
      const close = rest.indexOf(');');
      if (close < 0) { text = text.slice(0, at); insideDiagnostic = true; break; }
      text = text.slice(0, at) + rest.slice(close + 2);
    }
    if (/[\u4e00-\u9fff]/.test(text)) hits.push(`${index + 1}: ${line.trim().slice(0, 60)}`);
  });
  return hits;
}

/** 从源码里取一个锚点的出现次数（反空洞守卫：锚点不存在 / 不唯一都必须先报出来） */
function occurrencesOf(source, anchor) {
  return source.split(anchor).length - 1;
}

/** 在内存里编译一份变异体（**不落盘**：磁盘上的 feed.js 一个字节都不动） */
function loadFeedVariant(source) {
  const dir = path.dirname(FEED_FILE);
  const mod = { exports: {} };
  const localRequire = spec => require(spec.startsWith('.') ? require.resolve(path.resolve(dir, spec)) : spec);
  // eslint-disable-next-line no-new-func
  const factory = new Function('require', 'module', 'exports', '__filename', '__dirname', source);
  factory(localRequire, mod, mod.exports, FEED_FILE, dir);
  return mod.exports;
}

/* ------------------------------------------------------------------ */
section('① 模块行为判据（16 条：条目构造 · 渲染 · 决定论 · 措辞）');

const verdicts = runJudgements(feed);
for (const verdict of verdicts) check(verdict.name, verdict.ok, verdict.detail);

/* ------------------------------------------------------------------ */
section('② 源码级判据（纯度 · 唯一表单源 · 措辞表外文案 · 被删字面 · 层次边界）');

{
  // 纯度：不读盘 / 不写盘 / 不联网 / 不看时钟
  //   · IO 与「取当前时刻 / locale 时间格式化」扫**原始源码**（与验收命令逐字一致：
  //     只要子串出现就红，注释里出现也算 —— 这条牙宁可误伤，也不留「注释里教怎么写」的口子）；
  //   · 代码级判据（哈希 / 比较器 / DOCTYPE / 中文措辞）扫**剥掉注释的源码**，与 fitness.js 同口径。
  const ioRequire = [...FEED_SRC.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map(match => match[1]);
  const ioBad = ioRequire.filter(spec => /^(node:)?(fs|path|http|https|child_process|net|dns|os|worker_threads)$/.test(spec));
  const clockTokens = ['new Date(', 'Date.now(', 'toLocaleString', 'toLocaleDateString'];
  const clockBad = clockTokens.filter(token => FEED_SRC.includes(token));
  check('纯度：feed.js 不 require IO / 网络模块，也不看时钟（原始源码扫描）',
    ioBad.length === 0 && clockBad.length === 0,
    `require 了 ${ioRequire.length} 个模块（${ioRequire.join(' ')}）· IO 命中 ${ioBad.length ? ioBad.join(' ') : '无'}`
    + ` · 时钟 / 本地化命中 ${clockBad.length ? clockBad.join(' ') : '无'}`);

  // 单源：id 组合、比较器复用、转义复用、无第二份哈希 / 转义器 / 比较器
  const comboSingle = FEED_CODE.includes('idFromBasis') && FEED_CODE.includes('eventKey')
    && occurrencesOf(FEED_CODE, 'idFromBasis(') === 1 && occurrencesOf(FEED_CODE, 'eventKey(') === 1;
  const hashSingle = !FEED_CODE.includes('createHash') && !FEED_CODE.includes('sha1')
    && !/slice\(\s*0\s*,\s*12\s*\)/.test(FEED_CODE);
  const compareSingle = occurrencesOf(FEED_CODE, 'changes.compareByRecency') === 1
    && !/\.sort\(\s*\)/.test(FEED_CODE) && !/\.sort\(\s*\(/.test(FEED_CODE);
  const escapeSingle = FEED_CODE.includes('site.xmlEscape')
    && !/(&amp;|&lt;|&gt;|&quot;|&apos;)/.test(FEED_CODE) && !/replace\(\s*\/&\/g/.test(FEED_CODE);
  check('单源：id 组合一处 · 哈希一处 · 比较器一处 · XML 转义一处',
    comboSingle && hashSingle && compareSingle && escapeSingle,
    `组合哈希（idFromBasis + eventKey 各 1 处）${comboSingle} · 无第二份哈希 ${hashSingle}`
    + ` · 无第二份比较器（compareByRecency 1 处、无裸 sort()）${compareSingle} · 无第二份转义器 ${escapeSingle}`);

  // 产物侧静态形状：没有文档类型声明（唯一 document 出口是 page-shell.js）
  check('feed.js 不产出文档类型声明（DOCTYPE；唯一出口是 lib/page-shell.js）',
    !/<!DOCTYPE/i.test(FEED_CODE), '命中 0 处');

  // 措辞：非注释代码里没有中文事件措辞（只有诊断消息允许中文）
  const chineseHits = chineseLiteralsOutsideDiagnostics(FEED_SRC);
  check('措辞：非注释代码里没有中文事件措辞（诊断消息除外）',
    chineseHits.length === 0,
    chineseHits.length ? `命中 ${chineseHits.length} 处：${chineseHits.slice(0, 3).join(' ｜ ')}` : '命中 0 处');

  // 元自称 + residue-guard 里与订阅有关的被删字面：源码与产物都 0 命中
  const products = (() => {
    const entries = buildOf(feed, { sources: sourcesOf() });
    return feed.renderAtom(entries, metaFor(feed, 'atom')) + feed.renderJsonFeed(entries, metaFor(feed, 'json'));
  })();
  const metaSelfHits = [];
  if (META_SELF_RE.test(FEED_SRC)) metaSelfHits.push(`源码：${FEED_SRC.match(META_SELF_RE)[0]}`);
  if (META_SELF_RE.test(products)) metaSelfHits.push(`产物：${products.match(META_SELF_RE)[0]}`);
  const residue = JSON.parse(fs.readFileSync(RESIDUE_FILE, 'utf8'));
  const feedResidue = (residue.deletedCopy || []).filter(item => String(item.literal || '').includes('订阅'));
  const residueHits = feedResidue.filter(item => FEED_SRC.includes(item.literal) || products.includes(item.literal)
    || (item.visible && (FEED_SRC.includes(item.visible) || products.includes(item.visible))));
  check('被删文案不回流：源码与产物里 0 命中（含元自称）',
    metaSelfHits.length === 0 && residueHits.length === 0,
    `元自称命中 ${metaSelfHits.length ? metaSelfHits.join(' ') : '无'} · residue-guard 里与订阅有关的被删字面`
    + ` ${feedResidue.length} 条（${feedResidue.map(item => item.id).join(' ')}）命中 ${residueHits.length} 条`);

  // 「不许各写一份字面量」：4 个文件里不许出现那六个字面量（唯一豁免 = feed.js 自己）
  const needles = feed.FEED_FILES.flatMap(([file, type]) => [`'${file}'`, `"${file}"`, `'${type}'`, `"${type}"`]);
  const scanResults = SINGLE_SOURCE_SCAN.map(relative => {
    const absolute = path.join(ROOT, relative);
    if (!fs.existsSync(absolute)) return { relative, exists: false, hits: 0 };
    const stripped = stripCommentsForScan(fs.readFileSync(absolute, 'utf8'));
    const hits = needles.filter(needle => stripped.includes(needle)).length;
    return { relative, exists: true, hits };
  });
  const missing = scanResults.filter(item => !item.exists);
  const totalHits = scanResults.reduce((sum, item) => sum + item.hits, 0);
  check('唯一表单源：4 个读写方里没有第二份文件名 / MIME 字面量',
    totalHits === 0,
    `扫描 ${scanResults.length} 个文件（已落地 ${scanResults.length - missing.length} 个`
    + `${missing.length ? `，尚未落地 ${missing.map(item => path.basename(item.relative)).join(' ')}` : ''}）`
    + ` · 字面量命中 ${totalHits} 处`);

  /* ---- 声明面单源（契约第 1.4 条 / 第 2 条）------------------------------------
   *
   * 强度（**冻结，不许放宽**）：首页那两条声明必须与 `FEED_FILES` 派生出来的形态
   * **逐字节相同** —— 不抽标签、不做空白归一、**行首缩进也是契约的一部分**
   * （它们顶格写，与同一个 `<head>` 里其它行的 2 空格缩进不同是**刻意的**：
   *  那一对是由 `FEED_FILES.map(...).join('\n')` 现拼出来的，行首不该留空白）。
   * 红消息必须自解释（谁 / 命中与缺失的具体串 / 为什么缩进算数 / 该改哪里）——
   * 否则下一个「顺手对齐缩进」的人会把这条牙改松，而那是本仓最忌讳的动作。
   * ------------------------------------------------------------------------- */
  const feedMimes = feed.FEED_FILES.map(([, type]) => type);
  const derivedDeclarations = feed.FEED_FILES
    .map(([file, type]) => `<link rel="alternate" type="${type}" href="__SITE_URL__${file}">`)
    .join('\n');

  /** 某个文件里「带订阅 MIME 的 rel=alternate 声明行」的原始行（含行首缩进，不含行终止符） */
  function declarationLinesOf(text) {
    return text.split(/\r?\n/).filter(line => {
      if (!/<link\b/.test(line) || !/rel="alternate"/.test(line)) return false;
      return feedMimes.some(mime => line.includes(`type="${mime}"`));
    });
  }

  /** 三段式红消息：① 点名文件与具体串 ② 说清「含缩进」 ③ 给出正确落点 */
  function declarationMismatchDetail(relative, actual, expected) {
    const missing = expected.filter(line => !actual.includes(line));
    const extra = actual.filter(line => !expected.includes(line));
    return [
      `① ${relative}：命中 ${actual.length} 条带订阅 MIME 的 rel="alternate"（期望恰好 ${expected.length} 条）`,
      `     实得：${actual.map(line => `【${line}】`).join(' ') || '（0 条）'}`,
      `     缺失：${missing.map(line => `【${line}】`).join(' ') || '无'}`,
      `     多出：${extra.map(line => `【${line}】`).join(' ') || '无'}`,
      '② 含缩进：这两行按契约与 FEED_FILES 的派生形态逐字节相同 —— **行首缩进也是契约的一部分**'
      + '（必须顶格；与同一个 <head> 里其它行的 2 空格缩进不同是刻意的，不是排版疏漏）',
      `③ 正确落点：FEED_FILES 是唯一出处（scripts/lib/feed.js）—— 改这两行 = 改唯一表本身；`
      + `条数、顺序、href 与 type 都由它决定：${feed.FEED_FILES.map(([file, type]) => `${file}→${type}`).join(' · ')}`
    ].join('\n      ');
  }

  const indexHtml = fs.existsSync(INDEX_FILE) ? fs.readFileSync(INDEX_FILE, 'utf8') : '';
  const indexDeclarations = declarationLinesOf(indexHtml);
  // ① 逐字节相等（含行首缩进）：顺序也必须一致（顺序 = FEED_FILES 的顺序）
  const declarationsByteExact = indexDeclarations.join('\n') === derivedDeclarations;
  check('骨架单源：首页两条声明与 FEED_FILES 的派生形态**逐字节相同**（含行首缩进，不许对齐缩进）',
    declarationsByteExact,
    declarationsByteExact
      ? `${indexDeclarations.length} 条逐字节一致（顶格 + 与 hreflang 那两条并存）`
      : declarationMismatchDetail('index.html', indexDeclarations, derivedDeclarations.split('\n')));

  // ② hreflang 那半边不许被覆盖
  const hreflangLines = indexHtml.split(/\r?\n/).filter(line => /rel="alternate" hreflang=/.test(line));
  check('骨架单源：hreflang 那两条声明原样保留（新增，不是覆盖）',
    hreflangLines.length === 2, `hreflang 声明 ${hreflangLines.length} 条（必须恰好 2 条）`);

  // ③ 计数断言：带订阅 MIME 的声明只许活在骨架里，且恰好 FEED_FILES.length 条
  const declarationOwners = ['index.html', 'scripts/lib/page-shell.js', 'scripts/tools/build-local.js', 'scripts/lib/feed.js'];
  const declarationCounts = declarationOwners.map(relative => {
    const absolute = path.join(ROOT, relative);
    if (!fs.existsSync(absolute)) return { relative, exists: false, count: 0 };
    const text = relative.endsWith('.html')
      ? fs.readFileSync(absolute, 'utf8')
      : stripCommentsForScan(fs.readFileSync(absolute, 'utf8'));
    return { relative, exists: true, count: declarationLinesOf(text).length };
  });
  const countProblems = declarationCounts.filter(item => item.relative === 'index.html'
    ? item.count !== feed.FEED_FILES.length
    : item.count !== 0);
  check(`声明计数：带订阅 MIME 的声明行 = 骨架里恰好 ${feed.FEED_FILES.length} 条，其余 3 个文件 0 条（多一条 = 有人手写了第二处）`,
    countProblems.length === 0,
    countProblems.length
      ? countProblems.map(item => `${item.relative}：${item.count} 条（期望 ${item.relative === 'index.html' ? feed.FEED_FILES.length : 0} 条）`).join('；')
        + ' —— 声明必须由 FEED_FILES 现算（page-shell 只提供槽位、build-local 只做 map 派生），不许手写'
      : declarationCounts.map(item => `${item.relative}=${item.count}`).join(' · '));

  // 层次边界：这一支属于 L2（不需要构建产物目录）
  const ARTIFACT_DIR_RE = /['"][^'"\n]*\bdist[\\/][^'"\n]*['"]/;
  const artifactHits = [ARTIFACT_DIR_RE.test(stripCommentsForScan(FEED_SRC)),
    ARTIFACT_DIR_RE.test(stripCommentsForScan(fs.readFileSync(__filename, 'utf8')))].filter(Boolean).length;
  check('层次边界：本自测与 feed.js 都不引用构建产物目录（L2 层，不需要 dist）',
    artifactHits === 0, `含产物目录路径的字面量命中 ${artifactHits} 处`);
}

/* ------------------------------------------------------------------ */
section('③ 变异牙（5 颗：锚点唯一 → 内存里实跑变红 → 逐字节还原 → 判据回绿）');

/**
 * 每颗牙的形状：`{ id, what, anchor, replacement, expectRed }`。
 * - 锚点在源码里必须**恰好出现 1 次**（反空洞守卫：锚点不存在或不唯一 ⇒ 先记红）；
 * - 变异体在**内存里**编译（`new Function`），磁盘上的 feed.js 一个字节都不动；
 * - 判据与真模块用的是**同一份** `runJudgements`（没有第二份判据）；
 * - 每颗牙留下两次读数：变异体的红项清单 + 还原后同一判据回绿。
 */
const TEETH = [
  {
    id: '牙-1',
    what: '默认正文改成表外文案（类型词不再读 HISTORY_TYPES，写死一句「官方宣布」）',
    anchor: "const typeLabel = TYPE_LABELS[event.type] || '';",
    replacement: "const typeLabel = '官方宣布';",
    expectRed: ['文案只从既有措辞表取（说明文字同源 · 条目文案可溯源 · 检测器自证）']
  },
  {
    id: '牙-2',
    what: '排序不再复用同一份比较器（unique.sort(changes.compareByRecency) → unique.sort()）',
    anchor: 'unique.sort(changes.compareByRecency);',
    replacement: 'unique.sort();',
    expectRed: ['全序排序（打乱输入 ⇒ 顺序不变 · 同日按 id 收敛 · 与同一份比较器一致）']
  },
  {
    id: '牙-3',
    what: 'id 推导改成直接取日志里的 eventId 字段（对上日志口径，绕开 eventKey + idFromBasis）',
    anchor: 'const idOf = (event, profile) => planSchema.idFromBasis(historyCore.eventKey(event, profile));',
    replacement: "const idOf = (event, profile) => String(event.eventId || '');",
    expectRed: [
      '条目 id 的唯一推导（逐条对账 idFromBasis(eventKey)）',
      '条目形状（恰好 5 键 · id 12 位 hex 且两两不同 · url 三种形态）'
    ]
  },
  {
    id: '牙-4',
    what: '身份碰撞不再 fail-closed（把碰撞分支关掉 ⇒ 同一个 id 的两条都被放行）',
    anchor: 'if (known !== undefined && known !== candidate.signature) {',
    replacement: 'if (false) {',
    expectRed: ['身份碰撞 fail-closed（两条不同事件同 id ⇒ 抛错，不静默放行）']
  },
  {
    id: '牙-5',
    what: '旧实现回归：不可链接的 deal 事件照样发 deal/<key>/（把可链接门关掉 ⇒ 死链回来）',
    anchor: '      if (kind === \'deal\' && !linkableIds.has(key)) { stats.dropped.notLinkable += 1; continue; }',
    replacement: '      if (false) { stats.dropped.notLinkable += 1; continue; }   // 【变异体·t13 旧实现】',
    expectRed: [
      '③ 真实数据：deal 支 kept === 0 · dropped.notLinkable === 20（20/20 是工具类）',
      '② stats.dropped.notLinkable 定向（集合排除某 id ⇒ 恰好 +1 且该条不在 entries）'
    ]
  }
];

const toothReadings = [];
for (const tooth of TEETH) {
  const occurrences = occurrencesOf(FEED_SRC, tooth.anchor);
  check(`${tooth.id} 锚点唯一（${tooth.what.slice(0, 24)}…）`, occurrences === 1,
    `锚点出现 ${occurrences} 次（必须恰好 1 次，否则这颗牙打的是空气）`);
  if (occurrences !== 1) { toothReadings.push(`${tooth.id}：锚点不唯一，未实跑`); continue; }

  const mutantSource = FEED_SRC.split(tooth.anchor).join(tooth.replacement);
  check(`${tooth.id} 变异体与源码不同（替换真的生效）`, mutantSource !== FEED_SRC,
    `变异后体积 ${Buffer.byteLength(mutantSource, 'utf8')} 字节（原 ${Buffer.byteLength(FEED_SRC, 'utf8')}）`);

  let mutantVerdicts = [];
  let compileError = null;
  try {
    const mutant = loadFeedVariant(mutantSource);
    mutantVerdicts = runJudgements(mutant);
  } catch (error) {
    compileError = error;
    mutantVerdicts = runJudgements(feed).map(verdict => ({ name: verdict.name, ok: verdict.ok }));
  }
  const red = mutantVerdicts.filter(verdict => !verdict.ok).map(verdict => verdict.name);
  const expectOk = tooth.expectRed.every(name => red.includes(name));
  check(`${tooth.id} 实跑变红（${tooth.what}）`,
    expectOk,
    compileError
      ? `变异体加载失败：${compileError.message}`
      : `变异体红 ${red.length} 项：${red.map(name => name.slice(0, 18)).join(' ｜ ') || '（一项都没红 —— 这颗牙打的是空气）'}`);

  const restoredVerdicts = runJudgements(feed);
  const restoredOk = tooth.expectRed.every(name => restoredVerdicts.find(verdict => verdict.name === name)?.ok);
  check(`${tooth.id} 还原后同一判据回绿（逐字节还原）`, restoredOk,
    `源码 sha256 未变（${FEED_SHA.slice(0, 12)}…）· 目标判据已回绿`);
  toothReadings.push(`${tooth.id}：变异体红 ${red.length} 项（期望命中 ${tooth.expectRed.length}/${tooth.expectRed.length}）`
    + ` → 还原后回绿 ${restoredOk} · 磁盘 sha256 ${FEED_SHA.slice(0, 12)}…`);
}

{
  const after = READ_FEED_SRC();
  check('零磁盘污染：5 颗牙跑完后 feed.js 的 sha256 与开工时相等（逐字节还原）',
    sha256(after) === FEED_SHA && after === FEED_SRC,
    `${FEED_SHA.slice(0, 16)}… / ${sha256(after).slice(0, 16)}…（${Buffer.byteLength(after, 'utf8')} 字节）`);
}

/* ------------------------------------------------------------------ */
section('④ 读数（本次实跑）');

{
  const run = buildWithStats(feed, { sources: sourcesOf() });
  const entries = run.entries;
  const atom = feed.renderAtom(entries, metaFor(feed, 'atom'));
  const json = JSON.parse(feed.renderJsonFeed(entries, metaFor(feed, 'json')));
  const atomEntries = atomEntriesOf(atom);
  const many = [];
  for (let i = 0; i < feed.FEED_MAX_ITEMS + 2; i += 1) {
    many.push(dealEvent({ id: i.toString(16).padStart(12, '0'), at: dayOfIndex(i) }));
  }
  const cut = buildWithStats(feed, {
    sources: sourcesOf({ deal: many, plan: [], apiPlan: [] }, {}, { linkableIds: new Set(many.map(event => event.id)) })
  });
  const real = realDealReading(feed);
  const needles = feed.FEED_FILES.flatMap(([file, type]) => [file, type]);

  console.log(`  条目数：${entries.length} 条（夹具 ${DEFAULT_EVENTS.deal.length} deal + ${DEFAULT_EVENTS.plan.length} plan`
    + ` + ${DEFAULT_EVENTS.apiPlan.length} apiPlan 条事件 ⇒ ${entries.length} 条条目）`);
  console.log(`  stats（夹具整体）：${statsLine(run.stats)}`);
  console.log(`  排序样例（前 3 条）：${entries.slice(0, 3).map(entry => `${entry.at} ${entry.id} ${entry.url}`).join(' ｜ ')}`);
  console.log(`  同一天样例（2026-10-09）：${entries.filter(entry => entry.at === '2026-10-09')
    .map(entry => `${entry.id}@${entry.url}`).join(' < ')}`);
  console.log(`  两格式一致性：Atom ${atomEntries.length} 条 ↔ JSON ${json.items.length} 条 · id 序列逐条相同 `
    + `${atomEntries.map(entry => entry.id).join(',') === json.items.map(item => item.id).join(',')} · url 序列逐条相同 `
    + `${atomEntries.map(entry => entry.href).join(',') === json.items.map(item => item.url).join(',')}`);
  console.log(`  id 样例：${entries.slice(0, 3).map(entry => `${entry.url} → ${entry.id}（tag:${new URL(site.SITE_URL).host},${entry.at}:change/${entry.id}）`).join(' ｜ ')}`);
  console.log(`  上限读数：${many.length} 条事件 ⇒ 产出 ${cut.entries.length} 条（FEED_MAX_ITEMS = ${feed.FEED_MAX_ITEMS}）`
    + ` · ${statsLine(cut.stats)}`);
  console.log(`  deal 可链接门读数（t13）：缺集合 / 非 Set ⇒ 抛错 · 集合排除 ⇒ stats.dropped.notLinkable +1 · 空集合 ⇒ 0 条`);
  console.log(`  真实数据读数（t13 补牙）：deals.json ${real.deals.length} 条（type=deal ${real.linkableIds.size} · 工具类 `
    + `${real.deals.length - real.linkableIds.size}）· deal-history ${real.events.length} 条事件指向工具类记录 `
    + `${real.toolEvents}/${real.events.length} ⇒ ${statsLine(real.stats)}`
    + `（不可链接反例：${real.events.filter(event => !real.selectedKeys.includes(event.id)).slice(0, 3).map(event => event.id).join(' / ')}）`);
  console.log(`  唯一表读数：${feed.FEED_FILES.map(([file, type]) => `${file} → ${type}`).join(' · ')}`
    + ` · 扫描 4 个读写方找这 4 个名字的带引号形态（${needles.length} 个名字）⇒ 0 处`);
  console.log(`  时钟读数：feed.js 里 'new Date(' / 'Date.now(' / 'toLocaleString' 命中 `
    + `${['new Date(', 'Date.now(', 'toLocaleString'].filter(token => FEED_SRC.includes(token)).length} 处`);
  console.log(`  feed.js sha256（变异牙前后一致）：${FEED_SHA}`);
  for (const reading of toothReadings) console.log(`  ${reading}`);
}

/* ------------------------------------------------------------------ */
console.log(`\n=== v3.2 订阅出口演练：${passed} 项通过，${failures.length} 项失败 ===`);
if (failures.length) {
  for (const item of failures) console.log(`  ✗ ${item.name}${item.detail ? ` —— ${item.detail}` : ''}`);
  process.exit(1);
}
