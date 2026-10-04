#!/usr/bin/env node
/**
 * v1.6 订阅层演练（零依赖、离线、秒级）。
 *
 * 它演练的不是「代码跑得通」，而是**订阅这一层赖以成立的那些承诺**：
 *
 *   · 注册表：路径唯一、标题两两不同、每个分类 Feed 都指向一个既有页面
 *   · Stable ID：优惠条目沿用 deal.id（升级不重推）；变化条目只由事件身份决定，
 *     `runAt` / 构建时刻影响不了它；同一天同一字段变两次**不会撞 id**
 *   · 时间：`pubDate` = 首次发现；`date_modified` = 最近一次高价值变化（没有就缺席）；
 *     `lastSeen`（每轮采集都刷新）永远不进机器可读时间字段
 *   · 防重复：同输入连续构建 10 次逐字节相同；打乱键序 / 只改 updatedAt 的时分秒 /
 *     给事件加 runAt 都不改变任何 id 与时间
 *   · 排除项：工具条目、已结束、已过期的记录永远不进「当前优惠」Feed；
 *     文案微调与 updated 类元信息永远不进变化 Feed
 *   · 空 Feed 策略：只有 new / changes 允许为空，其余为空即红
 *   · 厂商门槛：1 条不进、2 条进、事件 3 条也进（URL 稳定性的单调兜底）
 *   · XML 良构检查器：裸 & / 标签不配平 / 单引号属性都要被它抓到
 *   · **4 项 Tooth Test**：篡改 guid / 判据 / 事件 / 链接，validate() 必须恰好报出对应 code
 *
 * 判据标准与既有的 selftest 一致：**红的时候没有别的步骤会替它红**，所以它进 CI 门禁。
 * （产物级别的三方对账在 `build-local.js` 的自检里；这一支管的是规则本身。）
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const feeds = require('../lib/feeds');
const changes = require('../lib/changes');
const history = require('../lib/history');
const audience = require('../lib/audience');
const landing = require('../lib/landing');

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
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/* ------------------------------------------------------------------ */
/* 夹具                                                                */
/* ------------------------------------------------------------------ */

const payload = JSON.parse(fs.readFileSync(path.join(ROOT, 'deals.json'), 'utf8'));
const AS_OF = String(payload.updatedAt).slice(0, 10);
const historyStore = history.load();

/**
 * 规范厂商名取值器（与 build-local 用的是同一个：RENDER-CORE 的 `vendorOf().name`）。
 *
 * 自测**必须**用同一套口径，否则它会拿原始字符串去查规范名键的 slug 表，
 * 把「扣子 Coze（字节跳动）」判成「够门槛却没登记 slug」—— 一条永远红的假警报。
 */
const renderCore = require('../lib/render-core').load(path.join(ROOT, 'index.html'));
const VENDOR_KEY_OF = deal => renderCore.vendorOf(deal).name;

/** 所有夹具构建都必须带同一个规范厂商名取值器（见 VENDOR_KEY_OF 的注释） */
function buildWithVendor(opts) {
  return feeds.buildFeeds(Object.assign({ vendorKeyOf: VENDOR_KEY_OF }, opts));
}
function validateWithVendor(opts) {
  return feeds.validate(Object.assign({ vendorKeyOf: VENDOR_KEY_OF }, opts));
}

function radarOf(deals, store) {
  return changes.buildRadar({ deals, store, asOf: AS_OF, availability: 'ok' });
}

const radar = radarOf(payload.deals, historyStore.store);
const bundle = buildWithVendor({
  deals: payload.deals,
  store: historyStore.store,
  radar,
  asOf: AS_OF,
  updatedAt: payload.updatedAt,
  vendorKeyOf: VENDOR_KEY_OF
});

/** 构建期真实生成的全部站内路由（与 build-local 的 pageRoutes 同构） */
function pageRoutesOf(deals) {
  const pages = new Set(['', 'status/', 'changes/', 'feeds/']);
  // v2.3 / v3.0：**每条**变化 Feed 的主页（套餐对比页、API 计费页）都在真实产物里生成 ——
  // 夹具缺一条就会把「主页指向不存在页面」判成真问题。清单由注册表展开，不写死。
  for (const spec of feeds.PLAN_CHANGE_FEEDS) pages.add(spec.pageRoute);
  for (const deal of deals) {
    if (deal && deal.type === 'deal') pages.add(`deal/${encodeURIComponent(deal.id)}/`);
  }
  for (const page of audience.COLLECTION_PAGES) pages.add(`${page.slug}/`);
  for (const page of audience.NEED_PAGES) pages.add(`need/${page.slug}/`);
  // v1.7：分类落地页 / 厂商落地页 / 两个枢纽页 —— 厂商 Feed 的主页指向它们，
  // 夹具里缺一条就会把「主页指向不存在页面」判成真问题（第一版就是这样红了 9 条）。
  for (const page of landing.CATEGORY_PAGES) pages.add(`category/${page.slug}/`);
  pages.add('category/');
  pages.add('vendor/');
  for (const [vendor, slug] of Object.entries(feeds.VENDOR_SLUGS)) {
    void vendor;
    pages.add(`vendor/${slug}/`);
  }
  return pages;
}
const PAGES = pageRoutesOf(payload.deals);

/* ------------------------------------------------------------------ */
section('一、纯函数与零依赖');

{
  const raw = fs.readFileSync(path.join(ROOT, 'scripts', 'lib', 'feeds.js'), 'utf8');
  // 注释里会**提到**这些名字（文件头就写了「不许出现 Date.now」），所以先剥掉块注释，
  // 只扫真正会执行的代码 —— 否则这条门禁会因为一句注释而永远红。
  const source = raw.replace(/\/\*[\s\S]*?\*\//g, '');
  const banned = [
    ['Date.now', /Date\.now/],
    ['无参 new Date(', /new Date\(\s*\)/],
    ['process.env', /process\.env/],
    ['网络调用', /require\(['"]https?['"]\)|fetch\(|axios/],
    ['文件写入', /writeFileSync|mkdirSync/]
  ];
  for (const [label, re] of banned) {
    check(`lib/feeds.js 里没有 ${label}（订阅层不许读时钟 / 联网 / 写盘）`, !re.test(source));
  }
}

/* ------------------------------------------------------------------ */
section('二、注册表');

{
  const specs = bundle.feeds.map(feed => feed.spec);
  const ids = specs.map(spec => spec.id);
  check('spec id 唯一', new Set(ids).size === ids.length, ids.join(','));
  const paths = specs.flatMap(spec => [spec.path, spec.jsonPath]);
  check('RSS / JSON 路径全局唯一', new Set(paths).size === paths.length);
  const titles = specs.map(spec => spec.title);
  check('Feed 标题两两不同（不许所有 Feed 都叫一个站点名）', new Set(titles).size === titles.length,
    titles.filter((t, i) => titles.indexOf(t) !== i).join(','));
  check('分类 Feed 的标题都带具体分类', specs.filter(spec => spec.kind === 'collection' && spec.id !== 'all')
    .every(spec => /AI Deals Radar · .+/.test(spec.title)));
  check('RSS 与 JSON 成对出现（不存在只有一种格式的 Feed）',
    specs.every(spec => spec.path.endsWith('.xml') && spec.jsonPath.endsWith('.json')));

  // 分类 Feed 的判据必须指向既有页面（不新写第二套）
  const pageFeedIds = fs.readFileSync(path.join(ROOT, 'scripts', 'lib', 'feeds.js'), 'utf8');
  check('分类 Feed 的判据来自 audience 的谓词注册表（没有第二份判据实现）',
    !/function is(Student|Developer|FreeApi|ChinaUsable|AiCoding|FreeTokens)[A-Za-z]*\(/.test(pageFeedIds));
  for (const entry of feeds.COLLECTION_FEED_PAGES) {
    const spec = specs.find(item => item.id === entry.id);
    check(`Feed ${entry.id} 能对上一个既有页面`, Boolean(spec && spec.pageRoute && spec.description));
  }
  check('分类 Feed 的描述与页面注册表逐字相同', (() => {
    return feeds.COLLECTION_FEED_PAGES.every(entry => {
      const spec = specs.find(item => item.id === entry.id);
      // v1.7：多了一类页面注册表（分类落地页 landing.CATEGORY_PAGES），
      // 三处取名口径与 feeds.js 的 pageListOf() 一致。
      const list = entry.pageKind === 'need' ? audience.NEED_PAGES
        : (entry.pageKind === 'category' ? landing.CATEGORY_PAGES : audience.COLLECTION_PAGES);
      const page = list.find(item => item.slug === entry.pageSlug);
      return Boolean(page) && spec && spec.description === page.description;
    });
  })());
  check('国内可用 Feed 的判据是 availability.chinaUsable（不是 region=cn）', (() => {
    const spec = specs.find(item => item.id === 'china');
    const chinaDeals = payload.deals.filter(deal => deal.type === 'deal' &&
      deal.availability && deal.availability.chinaUsable === true);
    const feed = bundle.feeds.find(item => item.spec.id === 'china');
    const idset = new Set(feed.items.map(item => item.dealId));
    const regionCn = payload.deals.filter(deal => deal.type === 'deal' && deal.region === 'cn');
    return idset.size === chinaDeals.length && regionCn.length > chinaDeals.length &&
      regionCn.some(deal => !idset.has(deal.id));
  })(), `china 条目 ${bundle.feeds.find(f => f.spec.id === 'china').items.length} 条`);
}

/* ------------------------------------------------------------------ */
section('三、Stable ID 与防重复');

{
  const rootFeed = bundle.feeds.find(feed => feed.spec.id === 'all');
  check('优惠条目的 id 就是 deal.id（升级 v1.6 不会给老订阅者重推）',
    rootFeed.items.every(item => item.id === item.dealId));
  check('优惠条目的 id 集合 == 当前 deal 记录 id 集合（无工具条目混入）',
    rootFeed.items.every(item => (payload.deals.find(deal => deal.id === item.dealId) || {}).type === 'deal'));

  // 变化条目的身份：造两条同一天同一字段的连续变化（A→B、B→C），id 必须不同
  const eventA = { id: 'aaaaaaaaaaaa', at: '2026-09-30', type: 'benefit_changed', field: 'discountInfo', from: 'A', to: 'B' };
  const eventB = { id: 'aaaaaaaaaaaa', at: '2026-09-30', type: 'benefit_changed', field: 'discountInfo', from: 'B', to: 'C' };
  check('同一天同一字段变两次不会撞 id（这正是不能用可读 id 的原因）',
    feeds.eventFeedId(eventA) !== feeds.eventFeedId(eventB));
  check('id 与 runAt 无关（构建时刻影响不了身份）',
    feeds.eventFeedId({ ...eventA, runAt: '2026-09-30T01:00:00+08:00' }) === feeds.eventFeedId(eventA));
  check('id 随事件内容变化（改一个字段就换一个 id）',
    feeds.eventFeedId({ ...eventA, to: 'D' }) !== feeds.eventFeedId(eventA));
  check('变化 id 与优惠 id 的命名空间不相交（chg: 前缀）',
    feeds.eventFeedId(eventA).startsWith('chg:') &&
    !/^chg:/.test(rootFeed.items[0].id));

  // 连续 10 次构建逐字节一致
  const hashes = [];
  for (let i = 0; i < 10; i++) {
    const again = buildWithVendor({
      deals: payload.deals, store: historyStore.store, radar, asOf: AS_OF, updatedAt: payload.updatedAt
    });
    hashes.push(again.feeds.map(feed => `${feed.spec.id}:${feed.rss.length}:${feed.json.length}`).join('|'));
  }
  check('同输入连续构建 10 次，条目与产物长度完全一致', new Set(hashes).size === 1);
  check('10 次构建的 RSS/JSON 文本逐字节相同', (() => {
    const first = bundle.feeds.map(feed => `${feed.rss}\u0000${feed.json}`).join('\u0001');
    for (let i = 0; i < 3; i++) {
      const again = buildWithVendor({
        deals: payload.deals, store: historyStore.store, radar, asOf: AS_OF, updatedAt: payload.updatedAt
      });
      if (again.feeds.map(feed => `${feed.rss}\u0000${feed.json}`).join('\u0001') !== first) return false;
    }
    return true;
  })());

  // 扰动：键序、updatedAt 的时分秒、事件的 runAt
  const shuffled = payload.deals.map(deal => {
    const out = {};
    for (const key of Object.keys(deal).sort().reverse()) out[key] = deal[key];
    return out;
  });
  const stable = buildWithVendor({
    deals: shuffled, store: historyStore.store, radar, asOf: AS_OF, updatedAt: payload.updatedAt
  });
  check('打乱记录键序不改变 Feed 条目（序列化顺序不由输入顺序决定）',
    JSON.stringify(stable.feeds.map(feed => feed.items.map(item => item.id))) ===
    JSON.stringify(bundle.feeds.map(feed => feed.items.map(item => item.id))));
  const laterSameDay = buildWithVendor({
    deals: payload.deals, store: historyStore.store, radar, asOf: AS_OF,
    updatedAt: `${AS_OF}T23:59:59+08:00`
  });
  check('只改 updatedAt 的时分秒不改变任何条目的时间字段', (() => {
    const a = bundle.feeds.map(feed => feed.items.map(item => `${item.id}|${item.datePublished}|${item.dateModified}`));
    const b = laterSameDay.feeds.map(feed => feed.items.map(item => `${item.id}|${item.datePublished}|${item.dateModified}`));
    return JSON.stringify(a) === JSON.stringify(b);
  })());
}

/* ------------------------------------------------------------------ */
section('四、时间口径');

{
  const checked = [];
  let ok = true;
  const allowed = new Set(payload.deals.map(deal => deal.firstSeen));
  for (const feed of bundle.feeds) {
    for (const item of feed.items) {
      if (item.datePublished !== (feed.items.find(i => i === item).id ? item.datePublished : item.datePublished)) ok = ok && true;
      if (!allowed.has(item.datePublished) && item.type !== 'change') { ok = false; checked.push(`${item.id}:${item.datePublished}`); }
      if (item.dateModified !== null && item.dateModified !== undefined && item.dateModified < item.datePublished) {
        ok = false; checked.push(`${item.id}: date_modified 早于 date_published`);
      }
    }
  }
  check('优惠条目的时间字段全部来自数据的日期集合（构建时刻没有泄进产物）', ok, checked.slice(0, 3).join(', '));
  check('`lastSeen`（每轮采集都刷新）不进任何机器可读时间字段', (() => {
    const lastSeen = new Set(payload.deals.map(deal => deal.lastSeen));
    return bundle.feeds.every(feed => feed.items.every(item => {
      if (item.type !== 'deal') return true;
      // date_modified 只可能来自事件；没有事件时必须缺席（而不是拿 lastSeen 顶上）
      const hasEvent = history.eventsOf(historyStore.store).some(event => event.id === item.dealId);
      return item.dateModified === null || hasEvent || !lastSeen.has(item.dateModified);
    }));
  })());
  check('没有高价值事件的记录 date_modified 缺席（不是拿刷新日冒充）', (() => {
    const noEvents = bundle.feeds[0].items.filter(item => item.dateModified === null);
    return noEvents.length === bundle.feeds[0].items.length; // 交付时日志为空 ⇒ 全部缺席
  })());
  check('同一条记录不会所有 Feed 共用同一个构建时间', (() => {
    const dates = new Set(bundle.feeds[0].items.map(item => item.datePublished));
    return dates.size > 1;
  })(), `${new Set(bundle.feeds[0].items.map(i => i.datePublished)).size} 个不同日期`);
}

/* ------------------------------------------------------------------ */
section('五、排除项与空 Feed 策略');

{
  const deals = [
    { id: 'dddddddddd01', type: 'deal', title: 'A', vendor: 'V', url: 'https://a.example/', firstSeen: '2026-09-01', lastSeen: '2026-09-30', audience: ['student'], benefitType: ['free_api'] },
    { id: 'dddddddddd02', type: 'deal', title: 'B', vendor: 'V', url: 'https://b.example/', firstSeen: '2026-09-01', lastSeen: '2026-09-30', audience: ['student'], benefitType: ['free_api'] },
    { id: 'dddddddddd03', type: 'tool', title: 'T', vendor: 'V', url: 'https://t.example/', firstSeen: '2026-09-01' },
    { id: 'dddddddddd04', type: 'deal', title: 'C', vendor: 'V', url: 'https://c.example/', firstSeen: '2026-09-01', lastSeen: '2026-09-30', expiresAt: '2026-09-01' },
    { id: 'dddddddddd05', type: 'deal', title: 'D', vendor: 'V', url: 'https://d.example/', firstSeen: '2026-09-01', lastSeen: '2026-09-30' }
  ];
  const store = {
    schemaVersion: 1, startedAt: '2026-09-01',
    baseline: { at: '2026-09-01', note: 'x', fields: {} },
    absence: {},
    events: [{ id: 'dddddddddd05', at: '2026-09-20', type: 'ended', field: null, from: null, to: null, reason: 'withdrawn' }]
  };
  const synthetic = buildWithVendor({ deals, store, radar: null, asOf: '2026-09-30', updatedAt: '2026-09-30T10:00:00+08:00' });
  const all = synthetic.feeds.find(feed => feed.spec.id === 'all').items.map(item => item.dealId);
  check('工具条目（type=tool）不进优惠 Feed', !all.includes('dddddddddd03'));
  check('已过期条目不进优惠 Feed', !all.includes('dddddddddd04'));
  check('已结束（ended）条目不进优惠 Feed', !all.includes('dddddddddd05'));
  check('正常条目仍在优惠 Feed 里', all.includes('dddddddddd01') && all.includes('dddddddddd02'));

  // 空 Feed 策略：判据不在「哪些为空」，而在「哪些为空会被判红」——
  // 这份合成数据里 student / developer / china 等分类 Feed 确实为空，
  // 它们必须被 validate 判红（数据缺了就该有人看见），而 new / changes 不判。
  const syntheticPages = pageRoutesOf(deals);
  const verdict = validateWithVendor({
    feeds: synthetic.feeds, deals, store, pages: syntheticPages, asOf: '2026-09-30'
  });
  const emptyFlagged = new Set(verdict.problems.filter(problem => problem.code === 'not-empty')
    .map(problem => problem.feed));
  const emptyIds = synthetic.feeds.filter(feed => !feed.items.length).map(feed => feed.spec.id);
  // 「允许为空」的清单**由注册表派生**：变化类 Feed 的 id 全部来自 `PLAN_CHANGE_FEEDS`
  // （加第三个来源时这条断言自动跟上，不需要回来改字符串数组）。
  const changeFeedIds = feeds.PLAN_CHANGE_FEEDS.map(spec => spec.id);
  const nullableIds = ['new', 'changes', ...changeFeedIds];
  check('空 Feed 会被判红（除 new / changes / 各条变化 Feed 外）',
    emptyIds.every(id => nullableIds.includes(id) || [...emptyFlagged].some(path => path.includes(`/${id}.`))),
    `为空：${emptyIds.join(',')} · 判红：${[...emptyFlagged].join(',')}`);
  check('new / changes / 变化类 Feed 为空不判红（起算日之前本来就没有变化）',
    ![...emptyFlagged].some(path => nullableIds.some(id => path.includes(`/${id}.`))), [...emptyFlagged].join(','));
  check('空的变化 Feed 在描述里如实说明起算日与「还没有变化」', (() => {
    const feed = synthetic.feeds.find(item => item.spec.id === 'changes');
    return /还没有观测到/.test(feed.description) && /起算/.test(feed.description);
  })());
  check('日志不可用时变化 Feed 为空，但描述说的是「没有拿到历史日志」而不是「没有变化」', (() => {
    const offline = buildWithVendor({
      deals, store: null, radar: radarOf(deals, null), asOf: '2026-09-30',
      updatedAt: '2026-09-30T10:00:00+08:00', availability: 'unavailable'
    });
    const feed = offline.feeds.find(item => item.spec.id === 'changes');
    return feed.items.length === 0 && /没有拿到历史日志/.test(feed.description) && !/还没有观测到/.test(feed.description);
  })());

  // 判据：student Feed 只收 student
  const studentFeed = synthetic.feeds.find(feed => feed.spec.id === 'student');
  check('student Feed 只收满足 student 判据的条目',
    studentFeed.items.every(item => audience.COLLECTION_PREDICATES.student(
      deals.find(deal => deal.id === item.dealId))));
}

/* ------------------------------------------------------------------ */
section('六、厂商门槛与 slug');

{
  const mk = (id, vendor) => ({
    id, type: 'deal', title: id, vendor, url: `https://${id}.example/`,
    firstSeen: '2026-09-01', lastSeen: '2026-09-30'
  });
  const deals = [mk('eeeeeeeeee01', '只有一条'), mk('eeeeeeeeee02', '两条'), mk('eeeeeeeeee03', '两条'),
    mk('eeeeeeeeee04', '三条事件'), mk('eeeeeeeeee05', '没登记'), mk('eeeeeeeeee06', '没登记')];
  const store = { schemaVersion: 1, startedAt: '2026-09-01', baseline: { at: '2026-09-01', fields: {} }, absence: {}, events: [] };
  const slugs = { '两条': 'two', '三条事件': 'three-events' };
  const built = buildWithVendor({
    deals, store, radar: null, asOf: '2026-09-30', updatedAt: '2026-09-30T10:00:00+08:00', vendorSlugs: slugs
  });
  const vendorIds = built.feeds.filter(feed => feed.spec.vendor).map(feed => feed.spec.vendor);
  check('只有 1 条优惠的厂商不生成订阅', !vendorIds.includes('只有一条'));
  check('有 2 条优惠的厂商生成订阅', vendorIds.includes('两条'), vendorIds.join(','));
  const events = ['2026-09-01', '2026-09-02', '2026-09-03'].map((at, i) => ({
    id: 'eeeeeeeeee04', at, type: 'benefit_changed', field: 'discountInfo', from: `a${i}`, to: `b${i}`
  }));
  const withEvents = buildWithVendor({
    deals, store: { ...store, events }, radar: null, asOf: '2026-09-30',
    updatedAt: '2026-09-30T10:00:00+08:00', vendorSlugs: slugs
  });
  check('有 3 条历史事件的厂商也生成订阅（URL 稳定性的单调兜底）',
    withEvents.feeds.some(feed => feed.spec.vendor === '三条事件'));
  check('厂商 slug 必须来自人工表（够门槛但没登记 ⇒ 报出来，不猜一个）',
    built.vendorUnmapped.includes('没登记'), built.vendorUnmapped.join(','));
  check('slug 表自身的形状合法（^[a-z0-9][a-z0-9-]*$ 且唯一）', (() => {
    const slugsNow = Object.values(feeds.VENDOR_SLUGS);
    return slugsNow.every(slug => /^[a-z0-9][a-z0-9-]*$/.test(slug)) && new Set(slugsNow).size === slugsNow.length;
  })());
  check('真实数据上够门槛的厂商全部有 slug', bundle.vendorUnmapped.length === 0, bundle.vendorUnmapped.join(','));
  check('厂商 Feed 的路径用 slug 而不是显示名', built.feeds.filter(feed => feed.spec.vendor)
    .every(feed => /^feed\/vendor\/[a-z0-9-]+\.xml$/.test(feed.spec.path)));
}

/* ------------------------------------------------------------------ */
section('七、XML 良构检查器');

{
  const good = '<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>a &amp; b</title></channel></rss>\n';
  check('良构 XML 判为通过', feeds.checkXmlWellFormed(good).length === 0, feeds.checkXmlWellFormed(good).join('; '));
  check('裸 & 被抓到（RSS 里一个裸 & 就能让整份 feed 解析失败）',
    feeds.checkXmlWellFormed(good.replace('&amp;', '&')).length > 0);
  check('标签不配平被抓到',
    feeds.checkXmlWellFormed('<?xml version="1.0" encoding="UTF-8"?>\n<a><b></a></b>').length > 0);
  check('单引号属性被抓到',
    feeds.checkXmlWellFormed("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<a b='c'/>").length > 0);
  check('缺少 XML 声明被抓到', feeds.checkXmlWellFormed('<a/>').length > 0);
  check('属性值是引用类型时也检查实体',
    feeds.checkXmlWellFormed('<?xml version="1.0" encoding="UTF-8"?>\n<a b="x & y"/>').length > 0);
  check('全部 36 份真实产物都良构',
    bundle.feeds.every(feed => feeds.checkXmlWellFormed(feed.rss).length === 0));
}

/* ------------------------------------------------------------------ */
section('八、Tooth Test：篡改必须红');

{
  const clean = validateWithVendor({
    feeds: bundle.feeds, deals: payload.deals, store: historyStore.store, pages: PAGES, asOf: AS_OF
  });
  check('未篡改的真实产物：0 个问题（验证器不是永远红的噪声）',
    clean.problems.length === 0, clean.problems.slice(0, 3).map(p => `${p.code}:${p.detail}`).join(' | '));

  const run = mutate => {
    const copy = clone(bundle.feeds);
    // JSON 深拷贝会把 spec 上的**函数**（判据）丢掉 —— 不接回去的话，T2 会因为
    // 「没有判据可查」而静默通过，那正是最危险的一种假绿。
    const originals = new Map(bundle.feeds.map(feed => [feed.spec.id, feed.spec]));
    for (const feed of copy) {
      const original = originals.get(feed.spec.id);
      if (original && typeof original.predicate === 'function') feed.spec.predicate = original.predicate;
    }
    mutate(copy);
    // 篡改条目后必须**重新序列化**：否则 RSS/JSON 还是旧文本，验证器会先报
    // 「三方对账不一致」——那是序列化没跟上，不是我们要验的那条语义。
    // 重新序列化之后，剩下的问题才真属于被篡改的那一件事。
    for (const feed of copy) {
      feed.rss = feeds.serializeRss(feed.spec, feed.items, {
        updatedAt: payload.updatedAt, description: feed.description
      });
      feed.json = feeds.serializeJsonFeed(feed.spec, feed.items, { description: feed.description });
    }
    return validateWithVendor({
      feeds: copy, deals: payload.deals, store: historyStore.store, pages: PAGES, asOf: AS_OF
    }).problems;
  };
  const expect = (problems, code) => problems.some(problem => problem.code === code);

  // T1：两个条目用同一个 guid
  const t1 = run(list => { list[0].items[1].id = list[0].items[0].id; });
  check('T1 同一 Feed 里 guid 重复 → guid-unique 红', expect(t1, 'guid-unique'),
    t1.map(p => p.code).join(','));

  // T2：student Feed 混入 ceil 不满足 student 判据的条目
  const t2 = run(list => {
    const student = list.find(feed => feed.spec.id === 'student');
    const root = list.find(feed => feed.spec.id === 'all');
    const intruder = root.items.find(item => !audience.COLLECTION_PREDICATES.student(
      payload.deals.find(deal => deal.id === item.dealId)));
    student.items[0] = clone(intruder);
  });
  check('T2 student Feed 混入非学生条目 → predicate-holds 红', expect(t2, 'predicate-holds'),
    t2.map(p => p.code).join(','));

  // T3：变化 Feed 引用不存在的事件
  const t3 = run(list => {
    const feed = list.find(item => item.spec.id === 'changes') || list.find(item => item.spec.id === 'new');
    feed.items = [{
      type: 'change', id: 'chg:deadbeefdeadbeef', dealId: 'deadbeef0000', eventKey: 'nope', eventType: 'created',
      field: null, from: null, to: null, at: AS_OF, reason: null, titled: false,
      title: '伪造的条目', link: feeds.SITE_URL + 'changes/', route: 'changes/',
      externalUrl: null, vendor: '', datePublished: AS_OF, dateModified: AS_OF, tags: [],
      text: '伪造'
    }];
  });
  check('T3 变化 Feed 指向不存在的事件 → change-event-exists 红', expect(t3, 'change-event-exists'),
    t3.map(p => p.code).join(','));

  // T4：条目链接指向不存在的站内页面
  const t4 = run(list => { list[0].items[0].link = feeds.SITE_URL + 'deal/deadbeef0000/'; });
  check('T4 链接指向不存在的页面 → link-exists 红', expect(t4, 'link-exists'),
    t4.map(p => p.code).join(','));

  // 额外：低价值事件混进变化 Feed
  const t5 = run(list => {
    const feed = list.find(item => item.spec.id === 'new');
    feed.spec = Object.assign({}, feed.spec, { kind: 'changes' });
    feed.items = [];
  });
  check('额外：把变化 Feed 清空且日志可用时不再报「事件找不到」（负例不误报）',
    !t5.some(problem => problem.code === 'change-event-exists'), t5.map(p => p.code).join(','));
}

/* ------------------------------------------------------------------ */
section('九、套餐变化订阅源（v2.3：另一份数据的变化流）');

{
  const planSchema = require('../lib/plan-schema');
  const planHistory = require('../lib/plan-history');
  const planChanges = require('../lib/plan-changes');
  const providers = require('../lib/providers');
  const plans = planSchema.loadPlans(planSchema.PLANS_FILE).plans;

  // 夹具：真实套餐 + 一次改价 + 一次新增模型 ⇒ 两条套餐变化事件
  const clone2 = value => JSON.parse(JSON.stringify(value));
  const pricePlan = plans.find(plan => plan.billing.promoPrice === null && typeof plan.billing.regularPrice === 'number');
  const modelPlan = plans.find(plan => !Array.isArray(plan.supportedModels));
  const nextPlans = clone2(plans).map(plan => {
    if (pricePlan && plan.id === pricePlan.id) plan.billing.regularPrice = pricePlan.billing.regularPrice - 10;
    if (modelPlan && plan.id === modelPlan.id) plan.supportedModels = [{ name: 'DeepSeek V4.1', role: 'included', note: null }];
    return plan;
  });
  const planStore = planHistory.emptyStore({ at: AS_OF });
  planStore.baseline = planHistory.baselineOf(plans, { at: AS_OF });
  const recorded = planHistory.record(planStore, {
    previous: plans, next: nextPlans, at: AS_OF, runAt: `${AS_OF}T00:00:00.000Z`,
    labels: new Map(plans.map(plan => [plan.id, { title: plan.planName, vendor: plan.provider }]))
  }).store;
  const planRadar = planChanges.buildPlanRadar({ plans: nextPlans, store: recorded, asOf: AS_OF, availability: 'ok' });
  const planBundle = buildWithVendor({
    deals: payload.deals, store: historyStore.store, radar,
    asOf: AS_OF, updatedAt: payload.updatedAt,
    planRadar, planAvailability: 'ok', plans: nextPlans, providerTable: providers.load().table
  });
  const planFeed = planBundle.feeds.find(feed => feed.spec.kind === 'plan-changes');
  const planPages = new Set(pageRoutesOf(payload.deals));

  check('套餐变化 Feed 的 spec：路由 / 标题 / 主页 / 允许为空',
    planFeed.spec.path === 'feed/plans/coding/changes.xml' &&
    planFeed.spec.jsonPath === 'feed/plans/coding/changes.json' &&
    planFeed.spec.pageRoute === feeds.PLAN_CHANGE_FEED.pageRoute &&
    planFeed.spec.mayBeEmpty === true && planFeed.spec.homepage === false,
    JSON.stringify(planFeed.spec));
  check('套餐变化 Feed 的条目数 == 雷达里的变化条数（去掉元信息）',
    planFeed.items.length === planChanges.itemsOf(planRadar).filter(item => item.type !== 'updated').length,
    `${planFeed.items.length}`);
  check('每一条的 guid == 日志里重算出来的事件身份',
    planFeed.items.every(item => planHistory.eventsOf(recorded)
      .some(event => planHistory.eventIdOf(event) === item.id)),
    planFeed.items.map(item => item.id).join(','));
  check('记录级元信息（updated）不进订阅',
    planFeed.items.every(item => item.eventType !== 'updated'));
  check('每条都深链到套餐对比页的那一行（#plan-<id>）',
    planFeed.items.every(item => item.link === `${feeds.SITE_URL}${feeds.PLAN_CHANGE_FEED.pageRoute}#plan-${item.planId}`));
  check('正文里写着变化本身（「正常价格 … → …」）',
    planFeed.items.some(item => /正常价格/.test(item.text) && /→/.test(item.text)));
  check('套餐变化 Feed 未篡改时 0 个问题',
    validateWithVendor({
      feeds: planBundle.feeds, deals: payload.deals, store: historyStore.store,
      pages: planPages, asOf: AS_OF, planEvents: planHistory.eventsOf(recorded), planAvailability: 'ok'
    }).problems.length === 0);

  // 描述：可用但没有变化 vs 日志不可用（两句不同的话）
  const emptyBundle = buildWithVendor({
    deals: payload.deals, store: historyStore.store, radar, asOf: AS_OF, updatedAt: payload.updatedAt,
    planRadar: planChanges.buildPlanRadar({ plans, store: planHistory.emptyStore({ at: AS_OF }), asOf: AS_OF }),
    plans, providerTable: providers.load().table
  });
  const emptyPlanFeed = emptyBundle.feeds.find(feed => feed.spec.kind === 'plan-changes');
  check('没有套餐变化时：条目为空，描述如实说起算日',
    emptyPlanFeed.items.length === 0 && /还没有观测到/.test(emptyPlanFeed.description) && /起算/.test(emptyPlanFeed.description),
    emptyPlanFeed.description);
  // v2.3 上线后打线上 Feed 抓到的**真实文案 bug**：空态复用了优惠那一句，于是这份订阅
  // 对着读者说「还没有观测到优惠内容、领取条件或有效期的变化」—— 套餐根本没有这两个面。
  // 这条牙钉住「套餐的空态必须说套餐的事」，复用 deals 的句子会当场红。
  check('套餐变化的空态写的是**套餐**的变化面（不复用优惠那句）',
    emptyPlanFeed.description.includes('套餐的价格、活动价、额度、模型、限制或销售地区') &&
    !/优惠内容|领取条件|有效期/.test(emptyPlanFeed.description),
    emptyPlanFeed.description);
  const offlinePlanBundle = buildWithVendor({
    deals: payload.deals, store: historyStore.store, radar, asOf: AS_OF, updatedAt: payload.updatedAt,
    planRadar: planChanges.buildPlanRadar({ plans, store: null, asOf: AS_OF, availability: 'unavailable' }),
    planAvailability: 'unavailable', plans, providerTable: providers.load().table
  });
  const offlinePlanFeed = offlinePlanBundle.feeds.find(feed => feed.spec.kind === 'plan-changes');
  check('套餐变化日志不可用时：描述说「没有拿到日志」而不是「没有变化」',
    offlinePlanFeed.items.length === 0 && /没有拿到套餐变更日志/.test(offlinePlanFeed.description) &&
    !/还没有观测到/.test(offlinePlanFeed.description), offlinePlanFeed.description);

  // 牙：篡改套餐变化条目必须红
  const planRun = mutate => {
    const copy = clone2(planBundle.feeds);
    mutate(copy);
    for (const feed of copy) {
      feed.rss = feeds.serializeRss(feed.spec, feed.items, { updatedAt: payload.updatedAt, description: feed.description });
      feed.json = feeds.serializeJsonFeed(feed.spec, feed.items, { description: feed.description });
    }
    return validateWithVendor({
      feeds: copy, deals: payload.deals, store: historyStore.store, pages: planPages, asOf: AS_OF,
      planEvents: planHistory.eventsOf(recorded), planAvailability: 'ok'
    }).problems;
  };
  const planExpect = (problems, code) => problems.some(problem => problem.code === code);

  const t6 = planRun(list => {
    const feed = list.find(item => item.spec.kind === 'plan-changes');
    feed.items[0].id = 'deadbeef0000';
  });
  check('T6 套餐变化 guid 与日志对不上 → change-event-exists 红', planExpect(t6, 'change-event-exists'), t6.map(p => p.code).join(','));

  const t7 = planRun(list => {
    const feed = list.find(item => item.spec.kind === 'plan-changes');
    feed.items = [Object.assign({}, feed.items[0], { id: planHistory.eventIdOf({
      planId: feed.items[0].planId, type: 'updated', field: 'officialUrl', at: AS_OF, from: 'a', to: 'b'
    }), eventType: 'updated' })];
  });
  check('T7 记录级元信息混进套餐变化订阅 → change-event-exists 红（它不在日志里）',
    planExpect(t7, 'change-event-exists'), t7.map(p => p.code).join(','));

  const t8 = planRun(list => {
    const feed = list.find(item => item.spec.kind === 'plan-changes');
    // v3.0：目标必须是一个**真的不存在**的路由。原先这里写的是 `plans/api/` —— 那时它
    // 还不是页面；Stage H 把它建成 API 计费页之后，拿它当「不存在的页面」就恒真了。
    feed.items[0].link = feeds.SITE_URL + 'plans/nowhere/#plan-000000000000';
  });
  check('T8 套餐变化条目指向不存在的页面 → link-exists 红', planExpect(t8, 'link-exists'), t8.map(p => p.code).join(','));
}

/* ------------------------------------------------------------------ */
section('十一、v3.0 多 spec 注册表与「API 价格变化」订阅');

{
  const apiPlanHistory = require('../lib/api-plan-history');
  const planHistory = require('../lib/plan-history');
  const planChanges = require('../lib/plan-changes');
  const providers = require('../lib/providers');
  const providerTable = providers.load().table;
  const clone3 = value => JSON.parse(JSON.stringify(value));

  // ---- ① 注册表不变量 --------------------------------------------------
  const specs = feeds.PLAN_CHANGE_FEEDS;
  check('注册表是**多 spec**（套餐 + API，不是一条）',
    Array.isArray(specs) && specs.length >= 2 && specs.some(s => s.changeSource === 'api') && specs.some(s => s.changeSource === 'plans'),
    specs.map(s => s.id).join(','));
  check('spec id / RSS 路径 / JSON 路径互不相同',
    new Set(specs.map(s => s.id)).size === specs.length &&
    new Set(specs.map(s => s.path)).size === specs.length &&
    new Set(specs.map(s => s.jsonPath)).size === specs.length);
  check('每个 spec 的 pageRoute / pageKind 互不相同（page.kind 与 page.route 解析不可能撞车）',
    new Set(specs.map(s => s.pageRoute)).size === specs.length &&
    new Set(specs.map(s => s.pageKind)).size === specs.length);
  check('每条 spec 的 changeSource 都有条目实现（没有「登记了但没人实现」的来源）',
    specs.every(s => Boolean(feeds.CHANGE_SOURCES[s.changeSource])));
  check('feedsForPage 按 page.route 解析到 API 那一份',
    feeds.feedsForPage({ route: 'plans/api/' }).map(f => f.spec.id).join(',') === 'api-plan-changes');
  check('feedsForPage 按 page.kind 解析到 API 那一份',
    feeds.feedsForPage({ kind: 'plans-api' }).map(f => f.spec.id).join(',') === 'api-plan-changes');
  check('feedsForPage 按 page.route 解析到套餐那一份（老路由不回退）',
    feeds.feedsForPage({ route: 'plans/coding/' }).map(f => f.spec.id).join(',') === 'plan-changes');
  // 「绝不复制一份 feeds-api.js 形成两套逻辑」：这条要么是文件不存在，要么是同一份实现被抄成两份。
  check('没有 scripts/lib/feeds-api.js（订阅逻辑只有一份实现）',
    !fs.existsSync(path.join(ROOT, 'scripts', 'lib', 'feeds-api.js')));
  check('两个来源共用同一份条目实现（feeds.js 里只有一个 changeItemsFor）', (() => {
    const source = fs.readFileSync(path.join(ROOT, 'scripts', 'lib', 'feeds.js'), 'utf8');
    return source.includes('PLAN_CHANGE_FEEDS') &&
      (source.match(/function changeItemsFor\(/g) || []).length === 1 &&
      !/function apiChangeItems\(/.test(source);
  })());

  // ---- ② 夹具：真实 api-plans + 一次调价 ⇒ 若干 api-plan-history 事件 ------
  const apiPlansFile = JSON.parse(fs.readFileSync(path.join(ROOT, 'api-plans.json'), 'utf8'));
  const apiBefore = clone3(apiPlansFile.plans);
  const apiAfter = clone3(apiPlansFile.plans).map(plan => {
    if (plan.id !== apiBefore[0].id) return plan;
    plan.models = plan.models.map(entry => ({
      ...entry,
      rates: { ...entry.rates, input: (typeof entry.rates.input === 'number' ? entry.rates.input : 0) + 5 }
    }));
    return plan;
  });
  const apiStore0 = apiPlanHistory.emptyStore({ at: AS_OF });
  apiStore0.baseline = apiPlanHistory.baselineOf(apiBefore, { at: AS_OF });
  const apiRecorded = apiPlanHistory.record(apiStore0, {
    previous: apiBefore, next: apiAfter, at: AS_OF, runAt: `${AS_OF}T00:00:00.000Z`
  }).store;
  const apiEvents = apiPlanHistory.eventsOf(apiRecorded);
  const apiRadar = planChanges.buildApiPlanRadar({
    plans: apiAfter, store: apiRecorded, asOf: AS_OF, availability: 'ok', providerTable
  });
  const emptyCodingRadar = planChanges.buildPlanRadar({
    plans: JSON.parse(fs.readFileSync(path.join(ROOT, 'plans.json'), 'utf8')).plans,
    store: planHistory.emptyStore({ at: AS_OF }),
    asOf: AS_OF,
    availability: 'ok'
  });

  const multiOpts = {
    deals: payload.deals, store: historyStore.store, radar,
    asOf: AS_OF, updatedAt: payload.updatedAt,
    planRadar: emptyCodingRadar, planAvailability: 'ok',
    apiPlanRadar: apiRadar, apiPlanAvailability: 'ok', apiPlans: apiAfter, apiProviderTable: providerTable
  };
  const multiBundle = buildWithVendor(multiOpts);
  const apiFeed = multiBundle.feeds.find(feed => feed.spec.id === 'api-plan-changes');
  const codingFeed = multiBundle.feeds.find(feed => feed.spec.id === 'plan-changes');
  const multiPages = new Set(pageRoutesOf(payload.deals));
  multiPages.add('plans/api/');

  check('接线后 API 价格变化 Feed 真的被登记（spec 路由 / 主页 / 允许为空）',
    Boolean(apiFeed) &&
    apiFeed.spec.path === 'feed/plans/api/changes.xml' &&
    apiFeed.spec.jsonPath === 'feed/plans/api/changes.json' &&
    apiFeed.spec.pageRoute === 'plans/api/' &&
    apiFeed.spec.mayBeEmpty === true && apiFeed.spec.homepage === false,
    JSON.stringify(apiFeed && apiFeed.spec));
  check('API Feed 的条目数 == API 雷达里的变化条数（去掉元信息）',
    apiFeed.items.length === planChanges.itemsOf(apiRadar).filter(item => item.type !== 'updated').length
    && apiFeed.items.length > 0,
    `${apiFeed.items.length} 条（日志 ${apiEvents.length} 条事件）`);

  // ---- ③ Stable ID：guid == api-plan-history 的派生事件身份 ----------------
  check('每一条 API 条目的 guid == apiPlanEventIdOf 重算出来的事件身份',
    apiFeed.items.every(item => apiEvents.some(event => apiPlanHistory.apiPlanEventIdOf(event) === item.id)),
    apiFeed.items.map(item => item.id).join(','));
  check('GUID 两次构建逐字节相同（不是每次 build 重新生成）',
    apiFeed.items.map(item => item.id).join(',') ===
    buildWithVendor(multiOpts).feeds.find(feed => feed.spec.id === 'api-plan-changes').items.map(item => item.id).join(','));
  check('记录级元信息（updated）不进 API 订阅',
    apiFeed.items.every(item => item.eventType !== 'updated'));

  // ---- ④ 不混入 Coding 套餐事件 ------------------------------------------
  {
    const codingEventIds = new Set(planHistory.eventsOf(
      JSON.parse(JSON.stringify(planHistory.emptyStore({ at: AS_OF })))
    ).map(event => planHistory.eventIdOf(event)));
    const apiIds = new Set(apiEvents.map(event => apiPlanHistory.apiPlanEventIdOf(event)));
    check('API 订阅的条目身份全部来自 api-plan-history，没有一个来自 plan-history',
      apiFeed.items.every(item => apiIds.has(item.id) && !codingEventIds.has(item.id)));
    check('两条变化 Feed 的 guid 集合不相交（同一件事不可能同时属于两份订阅）',
      apiFeed.items.every(item => !codingFeed.items.some(other => other.id === item.id)));
  }

  // ---- ⑤ 深链落点 --------------------------------------------------------
  check('每条都深链到 API 计费页的那一行（/plans/api/#plan-<id>）',
    apiFeed.items.every(item => item.link === `${feeds.SITE_URL}plans/api/#plan-${item.planId}`));
  check('正文里写着变化本身（页面与订阅共用同一句话）',
    apiFeed.items.some(item => /\d/.test(item.text) && /→|新增|移除/.test(item.text)),
    apiFeed.items[0] && apiFeed.items[0].text);

  // ---- ⑥ 对账：未篡改时 0 个问题 -----------------------------------------
  const multiValidateOpts = {
    feeds: multiBundle.feeds, deals: payload.deals, store: historyStore.store, pages: multiPages,
    asOf: AS_OF, planEvents: [], planAvailability: 'ok',
    apiPlanEvents: apiEvents, apiPlanAvailability: 'ok'
  };
  const multiProblems = validateWithVendor(multiValidateOpts);
  check('API 价格变化订阅未篡改时 0 个问题（验证器不是永远红的噪声）',
    multiProblems.problems.length === 0, multiProblems.problems.map(p => `${p.code}:${p.detail}`).join('；'));
  // 推荐形状（changeViews）必须与老的平铺参数等价
  check('changeViews 形状与平铺参数等价（同一批 guid）', (() => {
    const alt = buildWithVendor({
      deals: payload.deals, store: historyStore.store, radar, asOf: AS_OF, updatedAt: payload.updatedAt,
      changeViews: {
        plans: { radar: emptyCodingRadar, availability: 'ok', records: [], providerTable },
        api: { radar: apiRadar, availability: 'ok', records: apiAfter, providerTable }
      }
    });
    const feed = alt.feeds.find(item => item.spec.id === 'api-plan-changes');
    return Boolean(feed) && feed.items.map(item => item.id).join(',') === apiFeed.items.map(item => item.id).join(',');
  })());

  // ---- ⑦ 牙 --------------------------------------------------------------
  const apiRun = mutate => {
    const copy = clone3(multiBundle.feeds);
    mutate(copy);
    for (const feed of copy) {
      feed.rss = feeds.serializeRss(feed.spec, feed.items, { updatedAt: payload.updatedAt, description: feed.description });
      feed.json = feeds.serializeJsonFeed(feed.spec, feed.items, { description: feed.description });
    }
    return validateWithVendor(Object.assign({}, multiValidateOpts, { feeds: copy })).problems;
  };
  const apiExpect = (problems, code) => problems.some(problem => problem.code === code);

  const t9 = apiRun(list => {
    list.find(item => item.spec.id === 'api-plan-changes').items[0].id = 'deadbeef0000';
  });
  check('T9 API 变化的 guid 与 api-plan-history 对不上 → change-event-exists 红（其余条目照常过）',
    apiExpect(t9, 'change-event-exists'), t9.map(p => p.code).join(','));

  const t10 = apiRun(list => {
    // 把一条 **Coding 套餐**事件的身份塞进 API 订阅：两份日志绝不能互相顶替
    const feed = list.find(item => item.spec.id === 'api-plan-changes');
    feed.items = [Object.assign({}, feed.items[0], { id: planHistory.eventIdOf({
      planId: feed.items[0].planId, type: 'created', field: null, at: AS_OF, from: null, to: null,
      fields: { 'billing.regularPrice': 1 }
    }) })];
  });
  check('T10 Coding 套餐事件混进 API 订阅 → change-event-exists 红（不混入）',
    apiExpect(t10, 'change-event-exists'), t10.map(p => p.code).join(','));

  const t11 = apiRun(list => {
    list.find(item => item.spec.id === 'api-plan-changes').items[0].link = feeds.SITE_URL + 'plans/not-a-page/#plan-000000000000';
  });
  check('T11 API 条目指向不存在的页面 → link-exists 红', apiExpect(t11, 'link-exists'), t11.map(p => p.code).join(','));

  const t12 = apiRun(list => {
    const feed = list.find(item => item.spec.id === 'api-plan-changes');
    feed.items = [Object.assign({}, feed.items[0], {
      id: apiPlanHistory.apiPlanEventIdOf({ planId: feed.items[0].planId, type: 'updated', field: 'officialUrl', at: AS_OF, from: 'a', to: 'b' }),
      eventType: 'updated'
    })];
  });
  check('T12 记录级元信息混进 API 订阅 → change-event-exists 红（它不在日志里）',
    apiExpect(t12, 'change-event-exists'), t12.map(p => p.code).join(','));

  // ---- ⑧ v3.0 Stage H：两条变化源**都始终生成**，但「没交视图」与「没有变化」要说成两句不同的话 ----
  const unwired = buildWithVendor({
    deals: payload.deals, store: historyStore.store, radar, asOf: AS_OF, updatedAt: payload.updatedAt,
    planRadar: emptyCodingRadar, planAvailability: 'ok'
  });
  const unwiredApi = unwired.feeds.find(feed => feed.spec.id === 'api-plan-changes');
  check('接线后 API 那条与套餐那条一样**始终生成**（alwaysGenerated=true）',
    Boolean(unwiredApi) && unwired.changeFeedsSkipped.length === 0,
    JSON.stringify(unwired.changeFeedsSkipped));
  // 这条是 t4 里那个判断的**留守版本**：接线完成后不能再靠「不登记」来避免假话，
  // 改成把话说对 —— 没拿到日志就说「没有拿到日志」，绝不说「还没有观测到变化」。
  check('没交出 API 变化视图时：描述说「没有拿到日志」而不是「还没有观测到变化」',
    Boolean(unwiredApi) && unwiredApi.items.length === 0
    && /没有拿到 API 计费变化日志/.test(unwiredApi.description)
    && !/还没有观测到/.test(unwiredApi.description),
    unwiredApi && unwiredApi.description);
  check('没交视图不影响套餐那一条（两条各自独立判断）',
    unwired.feeds.some(feed => feed.spec.id === 'plan-changes'));

  // 只登记不实现的来源（`alwaysGenerated:false` 且没交视图）仍要被记下来 ——
  // 构建期据此断言「注册表里的来源一个都不能被漏掉」。
  {
    // 「恢复原状」的期望是**进入夹具前的注册表快照**，不是数字 2：
    // `PLAN_CHANGE_FEEDS` 是注册表，新增/删除一条变化流是产品的合法演进（本轮 API 侧就刚加过一条），
    // 而这里真正要证明的是「临时夹具没有留下、也没有顶掉/换序任何一条既有 spec」——
    // 那是一条关系，不是一次计数。数字写死的那一版在注册表增删时会假红，且报错只有两个裸数字。
    const registryBefore = feeds.PLAN_CHANGE_FEEDS.slice();
    const stub = {
      id: 'stub-changes', kind: 'plan-changes', changeSource: 'stub',
      path: 'feed/stub.xml', jsonPath: 'feed/stub.json', title: 'x', description: 'x',
      pageKind: 'stub', pageRoute: 'stub/', mayBeEmpty: true, homepage: false,
      alwaysGenerated: false, vendor: null
    };
    feeds.PLAN_CHANGE_FEEDS.push(stub);
    try {
      const skipped = buildWithVendor({ deals: payload.deals, store: historyStore.store, radar, asOf: AS_OF });
      check('alwaysGenerated=false 的来源没交视图时**不登记**，且记进 changeFeedsSkipped',
        !skipped.feeds.some(feed => feed.spec.id === 'stub-changes')
        && skipped.changeFeedsSkipped.some(item => item.id === 'stub-changes' && item.reason === 'no_change_view'),
        JSON.stringify(skipped.changeFeedsSkipped));
    } finally {
      feeds.PLAN_CHANGE_FEEDS.pop();
    }

    const registryAfter = feeds.PLAN_CHANGE_FEEDS.slice();
    const addedSpecs = registryAfter.filter(spec => !registryBefore.includes(spec));
    const removedSpecs = registryBefore.filter(spec => !registryAfter.includes(spec));
    const reorderedSpecs = registryAfter.length === registryBefore.length
      ? registryAfter.filter((spec, index) => spec !== registryBefore[index])
      : [];
    const idList = list => JSON.stringify((list || []).map(spec => spec.id));
    check('注册表恢复原状：夹具跑完后的 feeds.PLAN_CHANGE_FEEDS 与**进入夹具前的快照**同一批、同一序（没留下、没顶掉、没换序）',
      addedSpecs.length === 0 && removedSpecs.length === 0 && reorderedSpecs.length === 0
      && registryAfter.length === registryBefore.length,
      `实际 feeds.PLAN_CHANGE_FEEDS=${idList(registryAfter)} / 期望（进入夹具前的注册表快照）=${idList(registryBefore)}`
      + `；差异 [夹具后多出: ${idList(addedSpecs)} / 夹具后少了: ${idList(removedSpecs)} / 位置被换: ${idList(reorderedSpecs)}]`);
  }

  // ---- ⑨ 起算日按来源取（队长 B2：**必须**用不同 `startedAt` 的夹具） -------------
  //
  // 真实数据上两条日志的 `startedAt` 都是 2026-10-01，所以「起算日取错来源」在真数据上
  // 完全不可见 —— 这条牙只能靠**注入两个不同的起算日**来做，否则断言恒真。
  {
    const otherStart = '2026-09-15';
    const shiftedApiRadar = planChanges.buildApiPlanRadar({
      plans: [], store: { ...apiRecorded, events: [], startedAt: otherStart },
      asOf: AS_OF, availability: 'ok', providerTable
    });
    const shifted = buildWithVendor({
      deals: payload.deals, store: historyStore.store, radar, asOf: AS_OF, updatedAt: payload.updatedAt,
      planRadar: emptyCodingRadar, planAvailability: 'ok',
      apiPlanRadar: shiftedApiRadar, apiPlanAvailability: 'ok', apiPlans: [], apiProviderTable: providerTable
    });
    const apiFeed2 = shifted.feeds.find(feed => feed.spec.id === 'api-plan-changes');
    const codingFeed2 = shifted.feeds.find(feed => feed.spec.id === 'plan-changes');
    check('每条变化 Feed 的起算日 == **它自己**那份日志的 startedAt（两份日志不同时才构成证据）',
      apiFeed2.spec.startedAt === otherStart && codingFeed2.spec.startedAt === AS_OF
      && apiFeed2.spec.startedAt !== codingFeed2.spec.startedAt,
      `api=${apiFeed2.spec.startedAt} · coding=${codingFeed2.spec.startedAt}`);
    check('空态描述里的起算日取自**它自己**那一份（没有拿另一份日志的顶上）',
      apiFeed2.items.length === 0 && apiFeed2.description.includes(otherStart)
      && !apiFeed2.description.includes(AS_OF),
      apiFeed2.description);
  }
}

/* ------------------------------------------------------------------ */
section('十、渲染入口与页面同源');

{
  const homepageFeeds = bundle.feeds.filter(feed => feed.spec.homepage);
  const tags = feeds.feedLinkTags(homepageFeeds, '');

  // 首页订阅发现的判据以前是 `(tags.match(/rel="alternate"/g)).length === 8`（4 个选择 × 2 种格式）。
  // 那是「本轮注册表里恰好有 4 个 homepage 选择」这个快照：新增/移除任何一个 homepage 订阅都会假红，
  // 而页面其实完全正确。这里改成**同源对账**：
  //   ① 注册表侧的 `HOMEPAGE_FEED_IDS`（`spec.homepage` 的唯一出处）与产物里 `spec.homepage=true` 的
  //      那批 Feed 必须是同一批（id 集合相等）；
  //   ② tag 里的 href 集合 == 由那批 Feed 的 `spec.path`（RSS）+ `spec.jsonPath`（JSON）派生的集合，
  //      且每个地址只出现一次。
  // 条数关系没有丢：集合相等 ⇒「tag 地址数 == homepage Feed 数 × 2」，只是两个因子都由数据现算。
  const declaredHomepageIds = [...feeds.HOMEPAGE_FEED_IDS];
  const producedHomepageIds = homepageFeeds.map(feed => feed.spec.id);
  const missingHomepageIds = declaredHomepageIds.filter(id => !producedHomepageIds.includes(id));
  const extraHomepageIds = producedHomepageIds.filter(id => !declaredHomepageIds.includes(id));
  check('首页订阅发现：注册表 HOMEPAGE_FEED_IDS 与产物里 spec.homepage=true 的 Feed 是同一批（两侧同源，不写条数）',
    missingHomepageIds.length === 0 && extraHomepageIds.length === 0,
    `实际（产物 bundle.feeds 里 spec.homepage=true 的 id）${JSON.stringify(producedHomepageIds)}`
    + ` / 期望（注册表 feeds.HOMEPAGE_FEED_IDS）${JSON.stringify(declaredHomepageIds)}`
    + `；差异 [注册表里有、产物里没有: ${missingHomepageIds.join(',') || '无'}`
    + ` / 产物里有、注册表里没有: ${extraHomepageIds.join(',') || '无'}]`);

  const expectedHomepageHrefs = homepageFeeds.flatMap(feed => [feed.spec.path, feed.spec.jsonPath]);
  const tagHrefs = [...tags.matchAll(/href="([^"]+)"/g)].map(match => match[1]);
  const missingTagHrefs = expectedHomepageHrefs.filter(href => !tagHrefs.includes(href));
  const extraTagHrefs = tagHrefs.filter(href => !expectedHomepageHrefs.includes(href));
  const duplicatedTagHrefs = [...new Set(tagHrefs.filter((href, index) => tagHrefs.indexOf(href) !== index))];
  check('首页订阅发现：tag 里的地址集合 == 由那批 Feed 的 spec.path + spec.jsonPath 派生的集合（集合相等，且每个地址只出现一次）',
    missingTagHrefs.length === 0 && extraTagHrefs.length === 0 && duplicatedTagHrefs.length === 0,
    `实际 tag 里的 href（${tagHrefs.length} 个）${JSON.stringify(tagHrefs)}`
    + ` / 期望（${producedHomepageIds.length} 个 homepage Feed × 两个格式 = ${expectedHomepageHrefs.length} 个）${JSON.stringify(expectedHomepageHrefs)}`
    + `；差异 [少: ${missingTagHrefs.join(',') || '无'} / 多: ${extraTagHrefs.join(',') || '无'} / 重复: ${duplicatedTagHrefs.join(',') || '无'}]`);

  check('首页订阅发现里的每个地址都指向真实存在的 Feed',
    [...tags.matchAll(/href="([^"]+)"/g)].every(m => bundle.feeds.some(feed =>
      feed.spec.path === m[1] || feed.spec.jsonPath === m[1])));
  check('根 Feed 标签与注册表同源', feeds.rootFeedTags('../').includes(bundle.feeds[0].spec.title));
  check('HTML 属性里的标题做过转义（不会把引号带进属性）',
    !/title="[^"]*"[^>]*title="/.test(tags));
}

/* ------------------------------------------------------------------ */
section('十二、/feeds/ 汇总页与注册表的双向对账（P3-4 回归钉）');

{
  const plan = feeds.pageGroups(bundle.feeds);
  const groupedIds = new Set(plan.listed.map(feed => feed.spec.id));

  // ① 注册表 → 分组计划：登记的每一份 public Feed 都必须在分组里（漏一个 = 从总入口消失）
  const registeredPublic = [
    ...feeds.COLLECTION_FEED_PAGES.filter(entry => feeds.isPublicSpec(entry)).map(entry => entry.id),
    ...feeds.PLAN_CHANGE_FEEDS.filter(spec => feeds.isPublicSpec(spec)).map(spec => spec.id),
    'all', 'new', 'changes'
  ];
  check('注册表里登记的每一份 public Feed 都落进了汇总页的分组',
    registeredPublic.every(id => groupedIds.has(id)),
    registeredPublic.filter(id => !groupedIds.has(id)).join(','));
  check('本轮注册表里没有「hidden/internal 却仍被生成」的 Feed（隐藏必须与不生成绑定）',
    bundle.feeds.every(feed => feeds.isPublicSpec(feed.spec)),
    bundle.feeds.filter(feed => !feeds.isPublicSpec(feed.spec)).map(feed => feed.spec.id).join(','));
  check('没有一个 public Feed 是「没分组」的（否则它会从 /feeds/ 静默消失）',
    plan.ungrouped.length === 0, plan.ungrouped.map(feed => feed.spec.id).join(','));
  check('分组计划不重不漏（分组里的 Feed 数 == public Feed 数）',
    plan.listed.length === plan.publicCount && new Set(plan.listed.map(f => f.spec.id)).size === plan.listed.length,
    `listed=${plan.listed.length} public=${plan.publicCount}`);

  // ② P3-4 本体：5 个分类 Feed 必须出现在「按分类」组里（它们曾经整组漏掉）
  const categoryGroup = plan.groups.find(group => group.key === 'category');
  const categoryIds = (categoryGroup ? categoryGroup.feeds.map(feed => feed.spec.id) : []).sort();
  check('5 个分类 Feed 全在「按分类」组里（P3-4：它们曾经整组不在 /feeds/ 上）',
    categoryIds.join(',') === 'category-agent,category-api,category-audio,category-chat,category-image',
    categoryIds.join(','));

  // ③ 双向断言本身：合成一个「由分组计划渲染出来的页面」，两个方向都要能红。
  //    这里刻意用**可见性被固定成 public** 的夹具：这几条牙测的是 checker 的灵敏度，
  //    不该因为注册表真的被改坏（比如某条被标成 hidden）而连带变红 —— 那种红属于 ①。
  const fixture = bundle.feeds.map(feed => ({ ...feed, spec: { ...feed.spec, hidden: false, internal: false } }));
  const fixturePlan = feeds.pageGroups(fixture);
  const syntheticPage = (ids, extra = '') => [
    ...ids.map(id => {
      const feed = fixture.find(item => item.spec.id === id);
      return feed
        ? `<li><b>${feed.spec.title}</b><a href="${feeds.SITE_URL}${feed.spec.path}">RSS</a>`
          + `<a href="${feeds.SITE_URL}${feed.spec.jsonPath}">JSON</a></li>`
        : '';
    }),
    extra
  ].join('\n');
  const allIds = fixturePlan.listed.map(feed => feed.spec.id);
  const clean = feeds.checkFeedsPage({ feedList: fixture, page: syntheticPage(allIds) });
  check('合成的完整页面零问题（断言不是恒红）', clean.problems.length === 0, clean.problems.slice(0, 2).join('；'));

  const missingOne = feeds.checkFeedsPage({ feedList: fixture, page: syntheticPage(allIds.filter(id => id !== 'category-api')) });
  check('方向①（注册表 → 页面）：抽掉一份 Feed ⇒ 必须红',
    missingOne.problems.some(text => /category-api/.test(text)), missingOne.problems.slice(0, 1).join('；'));

  const extraOne = feeds.checkFeedsPage({
    feedList: fixture,
    page: syntheticPage(allIds, `<a href="${feeds.SITE_URL}feed/ghost.xml">RSS</a>`)
  });
  check('方向②（页面 → 注册表）：页面上多一条注册表没有的订阅 ⇒ 必须红',
    extraOne.problems.some(text => /没有对应的 public Feed：feed\/ghost\.xml/.test(text)), extraOne.problems.slice(0, 1).join('；'));

  const hiddenButGenerated = feeds.checkFeedsPage({
    feedList: fixture.map(feed => (feed.spec.id === 'category-api'
      ? { ...feed, spec: { ...feed.spec, hidden: true } }
      : feed)),
    page: syntheticPage(allIds)
  });
  check('方向③（hidden 不许当 ignore list）：仍被生成的 Feed 标成 hidden ⇒ 必须红',
    hiddenButGenerated.problems.some(text => /hidden\/internal 的 Feed 仍在生成：category-api/.test(text)),
    hiddenButGenerated.problems.slice(0, 1).join('；'));

  const ungrouped = feeds.checkFeedsPage({
    feedList: fixture.map(feed => (feed.spec.id === 'category-api'
      ? { ...feed, spec: { ...feed.spec, listGroup: 'nowhere' } }
      : feed)),
    page: syntheticPage(allIds)
  });
  check('方向④：public Feed 没有分组 ⇒ 必须红',
    ungrouped.problems.some(text => /没有分组/.test(text)), ungrouped.problems.slice(0, 1).join('；'));

  // ④ 可见性的默认值：不写就是 public（默认安全方向）
  check('默认 public；只有 hidden / internal 才是例外',
    feeds.isPublicSpec({ id: 'x' }) === true &&
    feeds.isPublicSpec({ id: 'x', hidden: true }) === false &&
    feeds.isPublicSpec({ id: 'x', internal: true }) === false);
  check('publicFeeds() 按同一判据过滤',
    feeds.publicFeeds([{ spec: { id: 'a' } }, { spec: { id: 'b', hidden: true } }]).map(f => f.spec.id).join(',') === 'a');

  // ⑤ URL 形态冻结：这一版只补汇总页，既有订阅地址一个都不许改
  const EXPECTED_PATHS = {
    all: 'feed.xml', changes: 'feed/changes.xml', new: 'feed/new.xml',
    'plan-changes': 'feed/plans/coding/changes.xml', 'api-plan-changes': 'feed/plans/api/changes.xml',
    student: 'feed/student.xml', developer: 'feed/developer.xml', 'free-api': 'feed/free-api.xml',
    'free-tokens': 'feed/free-tokens.xml', 'ai-coding': 'feed/ai-coding.xml', china: 'feed/china.xml',
    'category-api': 'feed/category-api.xml', 'category-chat': 'feed/category-chat.xml',
    'category-audio': 'feed/category-audio.xml', 'category-image': 'feed/category-image.xml',
    'category-agent': 'feed/category-agent.xml'
  };
  const pathDrift = Object.entries(EXPECTED_PATHS).filter(([id, path]) => {
    const spec = bundle.feeds.map(feed => feed.spec).find(item => item.id === id);
    return !spec || spec.path !== path || spec.jsonPath !== path.replace(/\.xml$/, '.json');
  }).map(([id]) => id);
  check('既有 Feed 的 URL 形态被冻结（只补汇总页，不动任何订阅地址）', pathDrift.length === 0, pathDrift.join(','));
  check('没有新增 /feed/api.xml 或 /feed/coding.xml（Prompt §13.1 明确禁止）',
    !bundle.feeds.some(feed => ['feed/api.xml', 'feed/api.json', 'feed/coding.xml', 'feed/coding.json']
      .includes(feed.spec.path) || ['feed/api.xml', 'feed/api.json', 'feed/coding.xml', 'feed/coding.json']
      .includes(feed.spec.jsonPath)));

  // ⑥ 结构：渲染层不再有第二份清单（否则「注册表唯一来源」只是口号）
  const buildSource = fs.readFileSync(path.join(ROOT, 'scripts', 'tools', 'build-local.js'), 'utf8');
  const renderBody = (buildSource.match(/function renderFeedsPage\([\s\S]*?\n}\n/) || [''])[0]
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  check('汇总页渲染层从注册表取分组（调用 feeds.pageGroups）', /feeds\.pageGroups\(/.test(renderBody));
  check('汇总页渲染层不再手写 Feed id 清单（没有 ids: [...] 这种第二份清单）',
    renderBody.length > 0 && !/\bids\s*:\s*\[/.test(renderBody));
}

/* ------------------------------------------------------------------ */
section('十三、空态判据（t31 / T28-F1）：按数字边界判「0 条」，空态原意不许被削掉');
/* ------------------------------------------------------------------ */

{
  // 这一节修的是**门禁自身的假红**：`/feeds/` 那条断言原先用裸 `/0 条/`（**子串**匹配），
  // `10 条` / `20 条` / `30 条` / `80 条` / `100 条` / `1,000 条` 全都命中 ⇒ 非空行被当成空态、
  // 被要求写出「变更记录自 … 起」⇒ 真实数据上判红（API 价格变化长到 10 条之后才暴露）。
  // 修法是把判据收进 `lib/feeds.js` 的具名函数（数字边界，唯一出处）。
  // **但空态原意必须一起钉住**：真为空时仍然必须写起算日，否则「修假红」就变成了「拆掉牙」。

  // ---- ① 判据本身：数字边界 ----
  const ZERO_ROWS = [
    ['行首', '0 条'],
    ['行尾', '最近变化 0 条'],
    ['前接标点', '（0 条）'],
    ['真实空态行', 'AI Deals Radar · Coding 套餐变化 0 条（变更记录自 2026-09-30 起）']
  ];
  const NON_ZERO_ROWS = [
    ['10 条', '10 条'], ['20 条', '20 条'], ['30 条', '30 条'], ['80 条', '80 条'],
    ['100 条', '100 条'], ['1,000 条', '1,000 条'], ['28 条', '28 条'], ['9 条', '9 条'],
    ['真实非空行（10 条）', 'AI Deals Radar · API 价格变化 10 条 · 最近一条 2026-10-04']
  ];
  console.log('    逐组结果（拼法 → isZeroCountRow）：');
  for (const [label, text] of [...ZERO_ROWS.map(([l, t]) => [`空态·${l}`, t]), ...NON_ZERO_ROWS]) {
    console.log(`      ${String(feeds.isZeroCountRow(text)).padEnd(5)} ${label.padEnd(20)} 「${text.slice(0, 52)}」`);
  }
  check('【判据】真空态行判为 0 条（行首 / 行尾 / 前接标点 / 带起算日的完整行，四种拼法都要命中）',
    ZERO_ROWS.every(([, text]) => feeds.isZeroCountRow(text)),
    ZERO_ROWS.filter(([, text]) => !feeds.isZeroCountRow(text)).map(([label]) => label).join(' | '));
  check('【对照组·真牙】条数以 0 结尾的**非空**行一律不是空态（10 / 20 / 30 / 80 / 100 / 1,000 条）',
    NON_ZERO_ROWS.every(([, text]) => !feeds.isZeroCountRow(text)),
    NON_ZERO_ROWS.filter(([, text]) => feeds.isZeroCountRow(text)).map(([label]) => label).join(' | '));
  // 缺陷可复现：旧写法（裸子串）把这 6 种「条数以 0 结尾」的非空拼法**全部**判成空态。
  // （`28 条` / `9 条` 是同一组里的对照：旧写法也判对，说明差别只在"尾数是不是 0"。）
  const ZERO_ENDING = ['10 条', '20 条', '30 条', '80 条', '100 条', '1,000 条'];
  check('【回归钉】旧写法（裸 /0 条/ 子串）把这 6 种「条数以 0 结尾」的非空拼法全判成空态 —— 缺陷可复现，牙不是凭空加的',
    ZERO_ENDING.every(text => /0 条/.test(text)) && ZERO_ENDING.every(text => feeds.isZeroCountRow(text) === false),
    `旧写法命中 ${ZERO_ENDING.filter(text => /0 条/.test(text)).length}/6`);
  check('【边界】`0 条` 后面紧跟数字 / 没有空格 ⇒ 不算空态（不把脏文案误判成空态）',
    !feeds.isZeroCountRow('0 条1') && !feeds.isZeroCountRow('0条') && !feeds.isZeroCountRow('100 条')
    && feeds.isZeroCountRow('0 条（变更记录自 2026-09-30 起）'));

  // ---- ② 空态诚实性（原意）：空态必须写起算日 ----
  const EMPTY_WITH_START = 'AI Deals Radar · Coding 套餐变化 0 条（变更记录自 2026-09-30 起）';
  const EMPTY_NO_START = 'AI Deals Radar · Coding 套餐变化 0 条';
  const NONEMPTY_TEN = 'AI Deals Radar · API 价格变化 10 条 · 最近一条 2026-10-04';
  check('【原意】空态行 + 起算日 ⇒ 通过（对照组：这一条证明判据不是恒红）',
    feeds.changeRowIsHonest(EMPTY_WITH_START) === true);
  check('【原意·不许被削】空态行**缺**起算日 ⇒ 必须判失败（这道牙存在的理由）',
    feeds.changeRowIsHonest(EMPTY_NO_START) === false);
  check('【假红已修】非空行（10 条，条数以 0 结尾）⇒ 不进空态分支、不要求起算日',
    feeds.isZeroCountRow(NONEMPTY_TEN) === false && feeds.changeRowIsHonest(NONEMPTY_TEN) === true);
  check('【对照组】非空行即便写了起算日也通过（非空行写不写起算日都不算错）',
    feeds.changeRowIsHonest(`${NONEMPTY_TEN}（变更记录自 2026-09-30 起）`) === true);

  // ---- ③ 现场夹具：真实产物的两行（28 条 / 10 条），旧判据假红、新判据通过 ----
  const REAL_ROW_CODING = 'AI Deals Radar · Coding 套餐变化 28 条 · 最近一条 2026-10-04 AI Coding 套餐的价格、活动价、额度、模型与限制的变化。';
  const REAL_ROW_API = 'AI Deals Radar · API 价格变化 10 条 · 最近一条 2026-10-04 AI 平台 API 的单价、计费单位、模型计价条目、免费额度、限速与 credits 的变化。';
  check('【现场夹具】两条真实变化流（28 条 / 10 条）在新判据下都不进空态分支 ⇒ T28-F1 的假红消失',
    [REAL_ROW_CODING, REAL_ROW_API].every(row => feeds.isZeroCountRow(row) === false && feeds.changeRowIsHonest(row) === true));
  check('【现场夹具·对照】同一窗口里**真的**出现「0 条」时，仍然要求起算日',
    feeds.changeRowIsHonest(`${REAL_ROW_CODING} 该日志共 0 条事件（变更记录自 2026-09-30 起）`) === true
    && feeds.changeRowIsHonest(`${REAL_ROW_CODING} 该日志共 0 条事件`) === false);

  // ---- ④ 单一出处 + 页面验收里那道牙还在 ----
  const verifySource = fs.readFileSync(path.join(ROOT, 'scripts', 'tools', 'verify-site.js'), 'utf8');
  check('【单一出处】页面验收里不再有裸 `/0 条/` 子串判据（只允许存在于解释这件事的注释里）',
    !/\/0 条\//.test(verifySource.replace(/(^|[^:])\/\/.*$/gm, '$1')));
  check('【单一出处】页面验收改调 lib/feeds.js 的具名判据，而不是自己再写一份正则',
    /feedsLib\.changeRowIsHonest\(/.test(verifySource));
  check('【原意还在】页面验收仍然走「空态 ⇒ 必须有起算日」这条判据（判据函数仍然会否掉无起算日的空态行）',
    feeds.changeRowIsHonest('0 条') === false && /hasChangeStartDate\(/.test(verifySource));
}

/* ------------------------------------------------------------------ */
console.log(`\n=== v1.6 订阅层演练：${passed} 项通过，${failures.length} 项失败 ===`);
if (failures.length) {
  for (const item of failures) console.log(`  ✗ ${item.name}${item.detail ? ` —— ${item.detail}` : ''}`);
  process.exit(1);
}
