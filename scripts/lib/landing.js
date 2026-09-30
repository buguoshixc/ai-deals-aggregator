/**
 * 落地页的**唯一注册表与门槛层**（v1.7）。
 *
 * 这一层只做三件事，别的什么都不做：
 *   ① 把「哪一页该生成」写死在一张表里（人工允许表 + 门槛函数）；
 *   ② 把「这一页收哪些条目」写成纯函数（判据只有一份，页面/断言/报告共用）；
 *   ③ 把「被跳过的页与原因」原样交出来（构建日志与报告都要能逐条读到）。
 *
 * ## 为什么单独一层，而不是往 build-local.js 里再加几个 if
 *
 * v1.2 的教训（见 build-local.js 里那段注释）是：三条路由各写一遍，等于把
 * 「哪一条忘了进 sitemap」变成一个靠记性维持的不变量。v1.7 一次加四类页面
 * （分类页 / 厂商页 / 枢纽页 / 别名页），再复制四遍就是四倍的风险。
 *
 * ## 三条纪律（与本项目其它部分同源）
 *
 *   ① **只用已有字段**，不新造词表、不扫标题正文做类目推断；
 *   ② **只认肯定信号**，`unknown` 与缺席一律不算；
 *   ③ 条数、摘要数字、覆盖分类数**全部现算**，任何地方都不写死。
 */

const fs = require('fs');
const path = require('path');

const audience = require('./audience');
const categories = require('./categories');

const DATA_DIR = path.join(__dirname, '..', 'data');
const VENDOR_SLUGS_FILE = path.join(DATA_DIR, 'vendor-slugs.json');
const CATEGORY_SLUGS_FILE = path.join(DATA_DIR, 'category-slugs.json');
const PINNED_FILE = path.join(DATA_DIR, 'landing-pages.json');
const ALIASES_FILE = path.join(DATA_DIR, 'landing-aliases.json');

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

/**
 * 生成门槛。厂商那一档**刻意复用订阅的门槛常量**（调用方从 feeds.js 传进来），
 * 这样「页面的条目集合」与「它的 Feed 的条目集合」在结构上不可能分头变化。
 *
 * 分类门槛 4 的依据是实测分布（`type:'deal'`）：
 *   API服务 36 · 对话模型 15 · 音频语音 6 · 图像绘画 5 · 智能体 4 ‖ 编程开发 4 · 办公效率 3 · 视频 2 · 教育学习 2 · 其他 1 · 搜索研究 1 · 设计创意 1
 * 4 与 3 之间是自然断层；3 条以下给不出可比较的信息，而每页约 84 KB。
 */
const CATEGORY_MIN_DEALS = 4;

/* ------------------------------------------------------------------ */
/* 手工文案（类别页与枢纽页）                                           */
/* ------------------------------------------------------------------ */

/**
 * 分类页的**人工允许表**。只有登记在这里的分类才会生成 /category/<slug>/。
 *
 * ⚠️ `why` 是**直接写进 HTML 的**（模板用 `${why}` 插进 `<p class="snote">`），
 * 所以这里写的是 HTML，不是 Markdown：要强调用 `<b>`，要写字面量就直接写。
 * 违反这条会被 build-local.js 的既有守卫当场拦下（`.snote` 里出现 `**` 或反引号即构建失败）。
 */
const CATEGORY_PAGES = [
  {
    slug: 'api',
    category: 'API服务',
    title: 'AI API 服务优惠',
    heading: 'AI API 服务与算力平台的优惠',
    description: '大模型 API 服务与算力平台的优惠与免费额度：新用户赠送、限时免费模型与按量抵扣，逐条标注领取门槛与是否中国大陆可用。',
    why: [
      '这一页按<b>分类</b>收条目：数据里的 category 是「API服务」，这是采集或策展时就写好的类目，<b>不是按标题关键词猜的</b>。',
      '分类之间<b>不互斥</b>：一条优惠常常同时属于别的分类，也可能同时出现在 /developer/ 或 /free-api/ 这类按人群/按福利类型切的页面上。',
      '门槛、中国大陆可用性与依据逐条列出；<b>「尚未确认」不是「不可用」</b>，两者在页面上是两句不同的话。'
    ]
  },
  {
    slug: 'chat',
    category: '对话模型',
    title: 'AI 对话模型优惠',
    heading: '对话类大模型的优惠与免费额度',
    description: '对话类大模型的优惠与免费额度：免费模型、新用户赠送 Token 与限时折扣，逐条标注领取门槛与是否中国大陆可用。',
    why: [
      '这一页按<b>分类</b>收条目：数据里的 category 是「对话模型」。',
      '同一条优惠可以同时出现在 /category/api/ 或 /need/free-tokens/：分类与需求是两种切法，本来就会重叠。',
      '免费的具体形态差异很大（一次性赠送、每日重置、限时免费模型），以每条自己的说明与官方页面为准。'
    ]
  },
  {
    slug: 'audio',
    category: '音频语音',
    title: 'AI 音频语音优惠',
    heading: '语音识别、合成与音频类 AI 优惠',
    description: '语音识别、语音合成与音频生成的 AI 优惠与免费额度：按小时或字符计的免费额度与限时折扣，逐条标注门槛与可用性。',
    why: [
      '这一页按<b>分类</b>收条目：数据里的 category 是「音频语音」。',
      '这一类的免费额度常按<b>时长或字符数</b>计量（例如「20 小时」「5000 字符」），与按 Token 计的大模型额度不是同一种单位，页面上保留官方原文的说法。',
      '没有依据的字段写「尚未确认」，不做单位换算，也不把「没查到」写成「不可用」。'
    ]
  },
  {
    slug: 'image',
    category: '图像绘画',
    title: 'AI 图像绘画优惠',
    heading: '图像生成与绘画类 AI 优惠',
    description: '图像生成与绘画类 AI 的优惠与免费额度：免费出图额度、限时折扣与面向学生、教师的设计工具优惠，逐条标注门槛。',
    why: [
      '这一页按<b>分类</b>收条目：数据里的 category 是「图像绘画」。',
      '这一类的额度常按<b>张数</b>计（例如「200 张」），同一条可能还带别的权益，页面保留官方原话，不做换算。',
      '同一类里既有国内平台的免费额度，也有国外工具的教育优惠 —— 中国大陆可用性逐条标注。'
    ]
  },
  {
    slug: 'agent',
    category: '智能体',
    title: 'AI 智能体优惠',
    heading: '智能体与 Agent 平台的优惠',
    description: '智能体与 Agent 平台的优惠与免费额度：积分赠送、每日免费调用次数与限时折扣，逐条标注领取门槛与是否中国大陆可用。',
    why: [
      '这一页按<b>分类</b>收条目：数据里的 category 是「智能体」。',
      '这一类的优惠常以<b>积分或每日次数</b>发放（例如「每日登录赠 1500 积分」），有效期往往很短，页面保留官方原文的期限说法。',
      '积分与代金券的可用范围由平台决定，本站只转录官方页面写了什么。'
    ]
  }
];

const CATEGORY_PREDICATES = {};
for (const page of CATEGORY_PAGES) {
  CATEGORY_PREDICATES[page.slug] = deal => Boolean(deal) && deal.category === page.category;
}

/**
 * 登记了 slug、但**刻意不成页**的分类，以及理由。
 *
 * 这张表是「某一条路由为什么不在」的唯一出处：没有理由的缺席会在 selftest:seo 里变红，
 * 因为「悄悄少了一页」和「决定不做这一页」对后来人来说是两件完全不同的事。
 */
const CATEGORY_EXCLUSIONS = [
  {
    category: '编程开发',
    slug: 'coding',
    reason: '与既有页面 /need/ai-coding/ 的条目集合逐条相同（同一份 category === 编程开发 判据）。同一主题不重复建 URL —— 由既有页面承担这一搜索意图。'
  },
  {
    category: '其他',
    slug: null,
    reason: '内部兜底枚举，不是用户会搜索的主题；条目本身也多是无法归类的长尾。'
  }
];

const VENDOR_HUB = {
  kind: 'hub',
  key: 'vendor',
  slug: 'vendor',
  route: 'vendor/',
  depth: 1,
  title: '按厂商找优惠',
  heading: '按厂商浏览 AI 优惠',
  description: '按厂商浏览本站收录的 AI 优惠与免费额度：每家厂商一页，列出当前有效优惠、学生与开发者相关条目以及最近变化。',
  why: [
    '这一页是<b>厂商页的目录</b>：只列出已经达到门槛、因而有独立页面的厂商。',
    '门槛与订阅是同一套：当前有效优惠 ≥ 2 条，或历史变更事件 ≥ 3 条。够门槛却没有页面的厂商会在构建期直接报错，不会悄悄少一家。',
    '厂商名使用站内的<b>厂商归一规则</b>：同一个公司的不同写法（例如「火山引擎（字节跳动）」与「火山引擎」）会合并到同一页。'
  ]
};

const CATEGORY_HUB = {
  kind: 'hub',
  key: 'category',
  slug: 'category',
  route: 'category/',
  depth: 1,
  title: '按分类找优惠',
  heading: '按分类浏览 AI 优惠',
  description: '按分类浏览本站收录的 AI 优惠：API 服务、对话模型、图像绘画、音频语音与智能体，每一类一页。',
  why: [
    '这一页是<b>分类页的目录</b>：只列出条目数达到门槛、因而有独立页面的分类。',
    '分类来自数据里的 category 字段（12 个固定枚举），但<b>不是每个枚举都会成页</b>：条数不足或已有专门页面的分类会被跳过，跳过原因写在报告里。',
    '分类之间不互斥，一条优惠可以同时出现在多个分类页里。'
  ]
};

/* ------------------------------------------------------------------ */
/* 数据表读取                                                           */
/* ------------------------------------------------------------------ */

function readJson(file, what) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`读取${what}失败（${path.relative(path.join(__dirname, '..', '..'), file)}）：${error.message}`);
  }
}

/** 去掉 `_` 前缀的元信息键 */
function withoutMeta(object) {
  const out = {};
  for (const [key, value] of Object.entries(object || {})) {
    if (key.startsWith('_')) continue;
    out[key] = value;
  }
  return out;
}

function loadVendorSlugs(file = VENDOR_SLUGS_FILE) {
  return withoutMeta(readJson(file, '厂商 slug 表'));
}

function loadCategorySlugs(file = CATEGORY_SLUGS_FILE) {
  return withoutMeta(readJson(file, '分类 slug 表'));
}

function loadPinned(file = PINNED_FILE) {
  const doc = readJson(file, '钉住的落地页表');
  return Array.isArray(doc.pages) ? doc.pages : [];
}

function loadAliases(file = ALIASES_FILE) {
  const doc = readJson(file, '别名表');
  return withoutMeta(doc.aliases || {});
}

function validateSlugTable(table, what) {
  const problems = [];
  const seen = new Map();
  for (const [key, slug] of Object.entries(table)) {
    if (!SLUG_RE.test(String(slug))) problems.push(`${what}「${key}」的 slug "${slug}" 不符合 ^[a-z0-9][a-z0-9-]*$`);
    if (seen.has(slug)) problems.push(`${what} slug "${slug}" 重复：${seen.get(slug)} 与 ${key}`);
    else seen.set(slug, key);
  }
  return problems;
}

/* ------------------------------------------------------------------ */
/* 门槛                                                                 */
/* ------------------------------------------------------------------ */

/**
 * 页面生成门槛的**唯一实现**。
 *
 * @param {string} kind  'vendor' | 'category' | 'hub' | 'alias'
 * @param {object} candidate `{ key, count, eventCount, children, targetExists, pinned }`
 * @param {object} ctx `{ vendorThresholds: {minDeals, minEvents}, categoryMinDeals }`
 * @returns {{ok: boolean, reason: string}}
 *
 * 返回的 `reason` 是机器可读的短码（`eligible` / `below-threshold` / `pinned-below-threshold`
 * / `pinned-empty` / `already-covered` / `no-children` / `alias-target-missing`），
 * 构建日志与报告直接打印它，不做二次翻译。
 */
function shouldGenerateLandingPage(kind, candidate = {}, ctx = {}) {
  const vendorThresholds = ctx.vendorThresholds || { minDeals: 2, minEvents: 3 };
  const categoryMinDeals = Number.isFinite(ctx.categoryMinDeals) ? ctx.categoryMinDeals : CATEGORY_MIN_DEALS;
  const count = Number(candidate.count) || 0;
  const eventCount = Number(candidate.eventCount) || 0;
  const pinned = Boolean(candidate.pinned);

  switch (kind) {
    case 'vendor': {
      const eligible = count >= vendorThresholds.minDeals || eventCount >= vendorThresholds.minEvents;
      if (eligible) return { ok: true, reason: 'eligible' };
      if (pinned && count > 0) return { ok: true, reason: 'pinned-below-threshold' };
      if (pinned) return { ok: false, reason: 'pinned-empty' };
      return { ok: false, reason: 'below-threshold' };
    }
    case 'category': {
      if (candidate.alreadyCovered) return { ok: false, reason: 'already-covered' };
      const eligible = count >= categoryMinDeals;
      if (eligible) return { ok: true, reason: 'eligible' };
      if (pinned && count > 0) return { ok: true, reason: 'pinned-below-threshold' };
      if (pinned) return { ok: false, reason: 'pinned-empty' };
      return { ok: false, reason: 'below-threshold' };
    }
    case 'hub':
      return (Number(candidate.children) || 0) > 0
        ? { ok: true, reason: 'eligible' }
        : { ok: false, reason: 'no-children' };
    case 'alias':
      return candidate.targetExists
        ? { ok: true, reason: 'eligible' }
        : { ok: false, reason: 'alias-target-missing' };
    default:
      throw new Error(`未知的落地页类型：${kind}`);
  }
}

/* ------------------------------------------------------------------ */
/* 条目归属（判据只有这一份）                                            */
/* ------------------------------------------------------------------ */

/** 站内所有落地页共用的条目匹配：按已算好的派生字段或固定字段取，绝不做文本推断 */
function itemsOf(spec, deals, options = {}) {
  const vendorKeyOf = options.vendorKeyOf || (deal => String((deal && deal.vendor) || ''));
  const pool = (deals || []).filter(deal => deal && deal.type === 'deal');
  const match = spec && spec.match;
  if (!match) return [];
  switch (match.by) {
    case 'collections':
      return pool.filter(deal => (deal.collections || []).includes(match.slug));
    case 'needs':
      return pool.filter(deal => (deal.needs || []).includes(match.slug));
    case 'category':
      return pool.filter(deal => deal.category === match.value);
    case 'vendor':
      return pool.filter(deal => vendorKeyOf(deal) === match.value);
    default:
      throw new Error(`未知的条目归属方式：${match.by}`);
  }
}

/** 页面集合的稳定指纹（seo.js 用它判断「两个页面是不是同一批条目」） */
function itemKeyOf(ids) {
  return (ids || []).slice().sort().join(',');
}

/* ------------------------------------------------------------------ */
/* 规划：一次性产出全部落地页 + 被跳过项                                 */
/* ------------------------------------------------------------------ */

/**
 * 规划全部落地页。
 *
 * 顺序是稳定的（集合页 → 需求页/别名页 → 分类枢纽 → 分类页 → 厂商枢纽 → 厂商页），
 * 因此产物顺序、sitemap 顺序与报告顺序都确定，不受输入键序影响。
 */
function planLandingPages(options = {}) {
  const deals = options.deals || [];
  const vendorKeyOf = options.vendorKeyOf || (deal => String((deal && deal.vendor) || ''));
  const vendorSlugs = options.vendorSlugs || loadVendorSlugs();
  const categorySlugs = options.categorySlugs || loadCategorySlugs();
  const pinnedList = options.pinned || loadPinned();
  const pinnedRoutes = new Set(pinnedList.map(row => row.route));
  const aliases = options.aliases || loadAliases();
  const eventCountOf = options.eventCountOf || (() => 0);
  const vendorThresholds = options.vendorThresholds || { minDeals: 2, minEvents: 3 };
  const categoryMinDeals = Number.isFinite(options.categoryMinDeals) ? options.categoryMinDeals : CATEGORY_MIN_DEALS;
  const ctx = { vendorThresholds, categoryMinDeals };

  const pages = [];
  const skipped = [];
  const problems = [];

  const dealPool = deals.filter(deal => deal && deal.type === 'deal');
  const countBy = (field, value) => dealPool.filter(deal => deal[field] === value).length;
  const countByCollection = slug => dealPool.filter(deal => (deal.collections || []).includes(slug)).length;
  const countByNeed = slug => dealPool.filter(deal => (deal.needs || []).includes(slug)).length;

  // ① 分类页（v1.1 的三个）与需求页（v1.2 的十个）：注册表仍来自 audience.js，
  //    这里只负责补 route/depth 与「别名替换」，与 v1.6 逐字一致。
  for (const spec of audience.COLLECTION_PAGES) {
    pages.push(Object.assign({}, spec, {
      kind: 'collection',
      route: `${spec.slug}/`,
      depth: 1,
      key: spec.slug,
      indexable: true,
      match: { by: 'collections', slug: spec.slug },
      count: countByCollection(spec.slug)
    }));
  }

  const needSpecs = audience.NEED_PAGES.map(spec => Object.assign({}, spec, {
    kind: 'need', route: `need/${spec.slug}/`, depth: spec.depth || 2, key: spec.slug, indexable: true,
    match: { by: 'needs', slug: spec.slug }, count: countByNeed(spec.slug)
  }));
  const needBySlug = new Map(needSpecs.map(spec => [spec.slug, spec]));

  for (const spec of needSpecs) {
    const alias = aliases[spec.route];
    if (!alias) {
      if (spec.count === 0) {
        // 空的需求页不生成（与 v1.2 一致）：一个空页面对读者没有价值，
        // 而「入口点了进空页」比没有入口更糟。首页入口行与 sitemap 读同一份计划，因此三处一致。
        skipped.push({ kind: 'need', key: spec.slug, route: spec.route, count: 0, reason: 'empty' });
        continue;
      }
      pages.push(spec);
      continue;
    }
    // 别名：条目集合必须与目标页逐条相同，否则这不是「同一主题的旧地址」
    const target = pages.find(page => page.route === alias.target);
    if (!target) {
      problems.push(`别名 ${spec.route} 的目标 ${alias.target} 不在本次生成的页面里`);
      continue;
    }
    pages.push(Object.assign({}, spec, {
      kind: 'alias', key: spec.slug, indexable: false, aliasOf: alias.target, aliasReason: alias.reason,
      match: target.match, count: target.count
    }));
  }

  // ② 分类页：人工允许表 ∩ 门槛 ∩ 「集合不与任何 indexable 页完全相同」
  const categoryPages = [];
  const indexableItemKeys = new Map(pages.filter(page => page.indexable)
    .map(page => [itemKeyOf(itemsOf(page, deals, { vendorKeyOf }).map(deal => deal.id)), page.route]));

  for (const spec of CATEGORY_PAGES) {
    const route = `category/${spec.slug}/`;
    const pinned = pinnedRoutes.has(route);
    const count = countBy('category', spec.category);
    const ids = dealPool.filter(deal => deal.category === spec.category).map(deal => deal.id);
    const key = itemKeyOf(ids);
    const alreadyCovered = indexableItemKeys.has(key) && indexableItemKeys.get(key) !== route;
    const gate = shouldGenerateLandingPage('category', { key: spec.category, count, pinned, alreadyCovered }, ctx);
    if (!gate.ok) {
      skipped.push({
        kind: 'category', key: spec.category, route, count, reason: gate.reason,
        detail: alreadyCovered ? `条目集合与 ${indexableItemKeys.get(key)} 逐条相同（同一主题不重复建 URL）` : ''
      });
      continue;
    }
    indexableItemKeys.set(key, route);
    const page = Object.assign({}, spec, {
      kind: 'category', route, depth: depthOf(route), key: spec.category, indexable: true, pinned,
      match: { by: 'category', value: spec.category }, count
    });
    categoryPages.push(page);
  }

  // ③ 厂商页：规范厂商名分组，门槛复用订阅那一套
  const vendorCounts = new Map();
  for (const deal of dealPool) {
    const name = vendorKeyOf(deal);
    if (!name) continue;
    vendorCounts.set(name, (vendorCounts.get(name) || 0) + 1);
  }
  const vendorPages = [];
  const vendorNames = [...vendorCounts.keys()].sort((a, b) => (vendorCounts.get(b) - vendorCounts.get(a)) || a.localeCompare(b, 'zh'));
  for (const name of vendorNames) {
    const count = vendorCounts.get(name);
    const slug = vendorSlugs[name];
    const eventCount = eventCountOf(name) || 0;
    const eligible = count >= vendorThresholds.minDeals || eventCount >= vendorThresholds.minEvents;
    const route = slug ? `vendor/${slug}/` : null;
    if (!eligible) {
      skipped.push({ kind: 'vendor', key: name, route, count, eventCount, reason: 'below-threshold' });
      continue;
    }
    if (!slug) {
      problems.push(`厂商「${name}」已达标（有效优惠 ${count} 条 / 历史事件 ${eventCount} 条）但没有登记 slug —— 请在 scripts/data/vendor-slugs.json 加一行，建议值 "${suggestSlug(name)}"`);
      continue;
    }
    const pinned = pinnedRoutes.has(route);
    const gate = shouldGenerateLandingPage('vendor', { key: name, count, eventCount, pinned }, ctx);
    if (!gate.ok) {
      skipped.push({ kind: 'vendor', key: name, route, count, eventCount, reason: gate.reason });
      continue;
    }
    vendorPages.push({
      kind: 'vendor', key: name, slug, route, depth: depthOf(route), indexable: true, pinned,
      title: `${name} 的 AI 优惠`,
      heading: `${name} 的 AI 优惠与免费额度`,
      description: `${name} 当前收录的 AI 优惠与免费额度：逐条标注福利类型、领取门槛与是否中国大陆可用，并给出该厂商最近的变化。`,
      why: [
        `这一页收的是<b>登记在册的同一家厂商</b>的条目：厂商名按站内厂商归一规则合并（同一个公司的不同写法会落到同一页），当前有效优惠 ${count} 条。`,
        '条数只统计<b>当前有效优惠</b>（未过期的 type=deal 条目）；工具条目不计入，也不会把「没查到」写成「没有」。',
        '页面上的每一个数字都来自当前数据；没有依据的字段写「尚未确认」，不写成「不可用」。'
      ],
      match: { by: 'vendor', value: name }, count, eventCount
    });
  }

  // ④ 分类页里未成页的，逐个给出理由（报告与日志要能读到「为什么没有这一页」）
  const listedCategories = new Set();
  for (const [category, slug] of Object.entries(categorySlugs)) {
    if (CATEGORY_PAGES.some(page => page.category === category)) continue;
    listedCategories.add(category);
    const exclusion = CATEGORY_EXCLUSIONS.find(row => row.category === category);
    skipped.push({
      kind: 'category', key: category, route: `category/${slug}/`, count: countBy('category', category),
      reason: exclusion ? 'excluded-by-policy' : 'below-threshold',
      detail: exclusion ? exclusion.reason : ''
    });
  }
  for (const exclusion of CATEGORY_EXCLUSIONS) {
    if (CATEGORY_PAGES.some(page => page.category === exclusion.category)) continue;
    if (listedCategories.has(exclusion.category)) continue;
    skipped.push({
      kind: 'category', key: exclusion.category, route: exclusion.slug ? `category/${exclusion.slug}/` : null,
      count: countBy('category', exclusion.category), reason: 'excluded-by-policy', detail: exclusion.reason
    });
  }
  for (const page of CATEGORY_PAGES) {
    if (!categorySlugs[page.category]) {
      problems.push(`分类页表里的「${page.category}」在 scripts/data/category-slugs.json 里没有 slug`);
    }
    if (!categories.CATEGORIES.includes(page.category)) {
      problems.push(`分类页表里的「${page.category}」不是 categories.js 的合法枚举值`);
    }
  }

  // ⑤ 枢纽页：有子页才生成（永不出空目录页）
  const hubPages = [];
  for (const hub of [CATEGORY_HUB, VENDOR_HUB]) {
    const children = hub.key === 'vendor' ? vendorPages : categoryPages;
    const gate = shouldGenerateLandingPage('hub', { children: children.length }, ctx);
    if (!gate.ok) {
      skipped.push({ kind: 'hub', key: hub.key, route: hub.route, count: 0, reason: gate.reason });
      continue;
    }
    hubPages.push(Object.assign({}, hub, {
      indexable: true, pinned: pinnedRoutes.has(hub.route), match: null, count: children.length, children
    }));
  }

  const ordered = [
    ...pages.filter(page => page.kind === 'collection'),
    ...pages.filter(page => page.kind === 'need' || page.kind === 'alias'),
    ...hubPages.filter(page => page.key === 'category'),
    ...categoryPages,
    ...hubPages.filter(page => page.key === 'vendor'),
    ...vendorPages
  ];

  // ⑥ 钉住的页面必须都生成，且不能是空页
  const generatedRoutes = new Set(ordered.map(page => page.route));
  for (const route of pinnedRoutes) {
    if (!generatedRoutes.has(route)) {
      const hit = skipped.find(row => row.route === route);
      problems.push(`钉住的路由 ${route} 本次没有生成（原因：${hit ? hit.reason : '不在计划里'}）—— 收录过的 URL 不允许静默消失：要么让数据回到门槛以上，要么为它登记 landing-aliases.json 并从这里移除`);
    }
  }
  for (const page of ordered) {
    if (page.pinned && page.kind !== 'hub' && page.count === 0) {
      problems.push(`钉住的页面 ${page.route} 条数为 0 —— 空页面对读者没有价值，请补数据或登记别名`);
    }
    if (page.kind === 'alias' && !pinnedRoutes.has(page.route)) {
      problems.push(`别名页 ${page.route} 没有出现在 landing-pages.json 的钉住列表里`);
    }
  }

  return { pages: ordered, skipped, problems, vendorPages, categoryPages, hubPages };
}

/**
 * 输出层数 = 路由里有多少个路径段（`category/api/` ⇒ 2 ⇒ `'../../'`）。
 * 写死的症状极隐蔽：页面能正常打开、内容都对，**只有所有内链 404**。
 */
function depthOf(route) {
  return String(route || '').split('/').filter(Boolean).length;
}

/** 未登记 slug 时的建议值：拉丁名取小写连字符，中文名取拼音不可得时退回稳定哈希后缀 */
function suggestSlug(name) {
  const latin = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (latin) return latin;
  let hash = 0;
  const text = String(name);
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) % 1000000;
  return `vendor-${hash.toString(36)}`;
}

/* ------------------------------------------------------------------ */
/* 摘要与变化                                                           */
/* ------------------------------------------------------------------ */

const RECENT_DAYS = 7;

function daysBetween(fromIso, toIso) {
  const from = new Date(`${String(fromIso).slice(0, 10)}T00:00:00+08:00`);
  const to = new Date(`${String(toIso).slice(0, 10)}T00:00:00+08:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  return Math.round((to - from) / 86400000);
}

/**
 * 数据摘要：**每一个数字都现算**，并带上它是怎么算出来的（`source`）。
 *
 * `source` 不是给人看的装饰：seo.js 会拿着同一条判据在另一处独立重算，对不上就红 ——
 * 「页面上写 12、实际列 7」这类错误因此在构建期就不可能出现。
 *
 * 值为 0 的项**不渲染**（H4 缺值不占位）：一屏「0 条无需信用卡」既占地方又没有信息量。
 */
function summaryOf(spec, items, ctx = {}) {
  const list = items || [];
  const asOf = String(ctx.asOf || '').slice(0, 10);
  const vendorKeyOf = ctx.vendorKeyOf || (deal => String((deal && deal.vendor) || ''));
  const rows = [];

  rows.push({
    label: '当前条目', value: list.length, unit: '条',
    source: 'type=deal 且未过期，且命中本页判据'
  });

  const noCard = list.filter(deal => deal.claimRequirements && deal.claimRequirements.creditCardRequired === false);
  if (noCard.length) {
    rows.push({
      label: '无需信用卡', value: noCard.length, unit: '条',
      source: 'claimRequirements.creditCardRequired === false（来源明说不需要）'
    });
  }

  const chinaUsable = list.filter(deal => deal.availability && deal.availability.chinaUsable === true);
  if (chinaUsable.length) {
    rows.push({
      label: '确认中国大陆可申请', value: chinaUsable.length, unit: '条',
      source: 'availability.chinaUsable === true（来源写明可用）'
    });
  }

  const freeApi = list.filter(deal => Array.isArray(deal.benefitType) && deal.benefitType.includes('free_api'));
  if (freeApi.length) {
    rows.push({ label: '含免费 API', value: freeApi.length, unit: '条', source: 'benefitType 含 free_api' });
  }

  const freeModel = list.filter(deal => Array.isArray(deal.benefitType) && deal.benefitType.includes('free_model'));
  if (freeModel.length) {
    rows.push({ label: '含免费模型', value: freeModel.length, unit: '条', source: 'benefitType 含 free_model' });
  }

  if (asOf) {
    const recent = list.filter(deal => {
      const days = daysBetween(deal.firstSeen, asOf);
      return days !== null && days >= 0 && days < RECENT_DAYS;
    });
    if (recent.length) {
      rows.push({
        label: `最近 ${RECENT_DAYS} 天新增`, value: recent.length, unit: '条',
        source: `firstSeen 距数据更新日（${asOf}）不足 ${RECENT_DAYS} 天`
      });
    }
  }

  const vendorCount = new Set(list.map(deal => vendorKeyOf(deal)).filter(Boolean)).size;
  if (vendorCount > 1) {
    rows.push({ label: '覆盖来源', value: vendorCount, unit: '家', source: '本页条目的规范厂商名去重计数' });
  }
  const categoryCount = new Set(list.map(deal => deal.category).filter(Boolean)).size;
  if (categoryCount > 1) {
    rows.push({ label: '覆盖分类', value: categoryCount, unit: '类', source: '本页条目的 category 去重计数' });
  }

  void spec;
  return rows;
}

/** 摘要行的机器可读校验值：{label: value}，供 seo.js 独立重算对账 */
function summaryValues(rows) {
  const out = {};
  for (const row of rows || []) out[`${row.label}`] = row.value;
  return out;
}

/**
 * 该主题的「最近变化」：按**条目 id 归属**过滤雷达分栏。
 *
 * 为什么不按厂商名过滤：雷达条目上的 `vendor` 是采集时的原始字符串，
 * 而 v1.7 起页面用的是规范厂商名（见 docs/SCHEMA-v1.7.md §3）。按 id join 回去
 * 既与厂商改名无关，也让「人群页 / 分类页 / 厂商页」共用同一个纯函数。
 *
 * 不碰 changes.js 的判据（v1.6 报告明确的前置条件）：这里只做视图过滤。
 */
function topicChangesOf(radar, dealIds, options = {}) {
  const sectionOrder = options.sectionOrder || ['created', 'changed', 'endingSoon', 'ended', 'restored'];
  const ids = dealIds instanceof Set ? dealIds : new Set(dealIds || []);
  if (!radar) return { availability: 'unavailable', asOf: null, startedAt: null, sections: [], totals: 0 };
  const sections = [];
  let totals = 0;
  for (const key of sectionOrder) {
    const bucket = (radar.sections && radar.sections[key]) || { items: [] };
    const items = (bucket.items || []).filter(item => item && ids.has(item.id));
    if (!items.length) continue;
    totals += items.length;
    sections.push({ key, items });
  }
  return {
    availability: radar.availability || 'unavailable',
    asOf: radar.asOf || null,
    startedAt: radar.startedAt || null,
    sections,
    totals
  };
}

/* ------------------------------------------------------------------ */
/* 统计（报告与门禁用同一份口径）                                        */
/* ------------------------------------------------------------------ */

function statsOf(pages) {
  const list = pages || [];
  const byKind = {};
  for (const page of list) byKind[page.kind] = (byKind[page.kind] || 0) + 1;
  return {
    total: list.length,
    indexable: list.filter(page => page.indexable).length,
    noindex: list.filter(page => !page.indexable).length,
    byKind
  };
}

module.exports = {
  VENDOR_SLUGS_FILE,
  CATEGORY_SLUGS_FILE,
  PINNED_FILE,
  ALIASES_FILE,
  SLUG_RE,
  CATEGORY_MIN_DEALS,
  RECENT_DAYS,
  CATEGORY_PAGES,
  CATEGORY_PREDICATES,
  CATEGORY_EXCLUSIONS,
  VENDOR_HUB,
  CATEGORY_HUB,
  loadVendorSlugs,
  loadCategorySlugs,
  loadPinned,
  loadAliases,
  validateSlugTable,
  shouldGenerateLandingPage,
  itemsOf,
  itemKeyOf,
  planLandingPages,
  summaryOf,
  summaryValues,
  topicChangesOf,
  statsOf,
  suggestSlug,
  depthOf,
  CATEGORIES: categories.CATEGORIES
};
