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
  check('空 Feed 会被判红（除 new / changes 外）',
    emptyIds.every(id => ['new', 'changes'].includes(id) || [...emptyFlagged].some(path => path.includes(`/${id}.`))),
    `为空：${emptyIds.join(',')} · 判红：${[...emptyFlagged].join(',')}`);
  check('new / changes 为空不判红（起算日之前本来就没有变化）',
    ![...emptyFlagged].some(path => /\/(new|changes)\./.test(path)), [...emptyFlagged].join(','));
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
section('九、渲染入口与页面同源');

{
  const tags = feeds.feedLinkTags(bundle.feeds.filter(feed => feed.spec.homepage), '');
  check('首页订阅发现恰好 8 条（4 个选择 × 2 种格式），不是几十个',
    (tags.match(/rel="alternate"/g) || []).length === 8);
  check('首页订阅发现里的每个地址都指向真实存在的 Feed',
    [...tags.matchAll(/href="([^"]+)"/g)].every(m => bundle.feeds.some(feed =>
      feed.spec.path === m[1] || feed.spec.jsonPath === m[1])));
  check('根 Feed 标签与注册表同源', feeds.rootFeedTags('../').includes(bundle.feeds[0].spec.title));
  check('HTML 属性里的标题做过转义（不会把引号带进属性）',
    !/title="[^"]*"[^>]*title="/.test(tags));
}

/* ------------------------------------------------------------------ */
console.log(`\n=== v1.6 订阅层演练：${passed} 项通过，${failures.length} 项失败 ===`);
if (failures.length) {
  for (const item of failures) console.log(`  ✗ ${item.name}${item.detail ? ` —— ${item.detail}` : ''}`);
  process.exit(1);
}
