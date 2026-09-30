/**
 * v1.6 订阅层（Feed）—— **唯一权威实现**。
 *
 * ## 它是什么
 *
 * 把已经存在的三样东西翻译成订阅源：当前记录（`deals.json`）、变更日志
 * （`deal-history.json`）、变化雷达视图（`lib/changes.js` 的 `buildRadar`）。
 * 产出 RSS 2.0 与 JSON Feed 1.1 两种序列化，全部在构建期写完，零依赖、零后端。
 *
 * ## 两类语义，绝不混在一起
 *
 *   A. **优惠 Feed**（`kind: 'collection'`）回答「当前有哪些符合这个条件的优惠」。
 *      条目 = 当前记录；判据**直接引用** `audience.js` 的既有谓词注册表，
 *      所以「Feed 里的条目集合」与「对应页面表格里的行」不可能分头变化。
 *   B. **变化 Feed**（`kind: 'changes'`）回答「最近发生了什么」。
 *      条目 = 变化雷达的分栏条目（`created` / 高价值字段变化 / `ended` / `restored`）。
 *      **文案微调与元信息（`changes.other` 两个桶）永远不会进 Feed** —— 这正是
 *      「description 改一个标点不算订阅事件」在订阅层的落点。
 *
 * ## 四条纪律（每条都有 `feeds-selftest` 盯着）
 *
 * 1. **不猜测、不生成**：分栏、标签、原值/新值全部来自数据；标题解析不到就如实写
 *    「已移除的记录（无标题快照）」，不拿 id 之外的任何东西去凑。
 * 2. **纯函数、离线、零依赖**：同样的入参一定产出同一份结果；不读盘（厂商标只在
 *    模块加载时读一次 `vendor-slugs.json`）、不联网、不改入参、**不看构建时刻**。
 *    自测有一条静态扫描：这个文件里不许出现 `Date.now`、无参 `new Date(`、
 *    `process.env` 或任何网络调用。
 * 3. **身份只由数据决定**：优惠条目沿用 `deal.id`（与 v1.0 起的 guid 逐字相同，
 *    升级不会给老订阅者重推）；变化条目用 `history.eventKey()` 的哈希 ——
 *    刻意不用可读的 `chg:id:at:type:field`，因为采集每天两次，同一天同一字段
 *    可能变两次（`A→B`、`B→C`），可读形式会碰撞。
 * 4. **时间只用数据里的日期**：`firstSeen` / 事件 `at` / `updatedAt`；
 *    「最近发现」（`lastSeen`）每轮采集都刷新，只作为正文事实行出现，
 *    绝不进 `pubDate` / `date_modified` —— 否则每条都会天天被阅读器当成新消息。
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const audience = require('./audience');
const landing = require('./landing');
const history = require('./history');
const changes = require('./changes');
const { cleanText } = require('./schema');

/* ------------------------------------------------------------------ */
/* 站点常量（与 build-local 同源：那边从这里取，不再各写一份）            */
/* ------------------------------------------------------------------ */

const SITE_URL = 'https://buguoshixc.github.io/ai-deals-aggregator/';
const SITE_NAME = 'AI 优惠聚合器';
const SITE_DESCRIPTION = '聚合国内外 AI 大模型的真实优惠：新用户免费额度、免费模型、学生/教师/非营利折扣、限时促销。全部指向厂商官方页。';

/**
 * Feed 的品牌串。按要求取 `AI Deals Radar · <具体分类>`：所有 Feed 都叫一个站点名，
 * 读者在阅读器里就分不清订的是哪一份。要改回中文站名，只改这一行。
 */
const FEED_BRAND = 'AI Deals Radar';

const LIMITS = {
  /** 单份 Feed 最多多少条（超出只计数并写进 description，不删数据） */
  itemsPerFeed: 100,
  /** 正文里「优惠」一行的截断长度（与 schema.cleanText 同一把尺子） */
  summaryChars: 160,
  /** 正文里「有效期」一行的截断长度 */
  validityChars: 120,
  /** 正文里单个原值/新值的截断长度 */
  valueChars: 200
};

/**
 * 厂商 Feed 的门槛。**按真实数据分布定，不是拍脑袋**（实测见报告）：
 * 交付日 80 条优惠分布在 33 家厂商里，`当前有效优惠 >= 2` 命中 **9 家**；
 * `历史变更事件 >= 3` 当时命中 0 家。
 *
 * 第二条不是装饰：事件日志是**只追加**的，所以一旦某家厂商攒够 3 条事件，
 * 这个条件就永久为真 —— 它同时是「订阅 URL 稳定性」（优先级第 2 位）的兜底，
 * 防止某家厂商从 2 条掉到 1 条时订阅地址凭空消失。
 */
const VENDOR_THRESHOLDS = { minDeals: 2, minEvents: 3 };

const VENDOR_SLUGS_FILE = path.join(__dirname, '..', 'data', 'vendor-slugs.json');
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 高价值事件类型：生命周期事件 + v1.5 认可的高价值字段变化。**派生，不新写一张表**。 */
const HIGH_VALUE_TYPES = [...history.LIFECYCLE_TYPES, ...changes.HIGH_VALUE_FIELD_TYPES];

/** 雷达的措辞（唯一权威在 lib/changes.js；这里只取别名，不抄一份） */
const CHANGES_LABELS = changes.CHANGES_WORDING.CHANGES_LABELS;
const CHANGES_NOTES = changes.CHANGES_WORDING.CHANGES_NOTES;

/* ------------------------------------------------------------------ */
/* 措辞（唯一权威）                                                     */
/* ------------------------------------------------------------------ */

/**
 * 订阅层自己的措辞。**能复用的一律复用，这里只放站内还没有的词**：
 *   · 适用人群 / 福利类型 / 中国大陆可用性 → `audience.FIELD_LABELS`
 *   · 官方页面 / 首次收录 / 最近发现      → `audience.WORDING_CONTRACT.SOURCE_LABELS`
 *   · 事件类型 / 字段名 / 结束原因 / 免责句 → `history.HISTORY_WORDING`
 *   · 原 / 新                            → `history.HISTORY_WORDING.HISTORY_LABELS`
 * 同一件事在详情页、雷达页、订阅里必须是同一个词。
 */
const FEEDS_WORDING = {
  FEEDS_LABELS: {
    pageTitle: '订阅 AI 优惠',
    vendor: '厂商',
    offer: '优惠',
    zh: '中文',
    detail: '详情',
    lastChange: '最近变化',
    noDeadline: '未标注截止日期',
    record: '记录',
    time: '时间',
    reason: '原因'
  },
  FEEDS_NOTES: {
    /** 变化流为空时的说明（起算日由渲染层补）：**空是事实，不是故障** */
    emptyNew: '自起算日起，还没有观测到首次收录的条目。',
    emptyChanges: '自起算日起，还没有观测到优惠内容、领取条件或有效期的变化。',
    /** 正文尾部的口径说明 */
    scope: '本订阅由本站构建期生成：没有账号、没有邮件列表、没有第三方推送服务。',
    provider: '厂商订阅收的是该厂商当前收录的优惠；想看「它最近变了什么」，订最近变化。',
    officialNote: '信息来自厂商官方页面，最终以官方页面为准。',
    /** description 里被截断时的说明（复用 changes 的既有措辞槽位） */
    truncated: '另有 {n} 条未显示（本 Feed 每栏最多 {cap} 条）。'
  }
};

/* ------------------------------------------------------------------ */
/* XML 转义 + 严格良构检查                                              */
/* ------------------------------------------------------------------ */

/** XML 文本转义：RSS 里一个裸 & 就能让整份 feed 解析失败 */
function xmlEscape(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const NAMED_ENTITIES = ['&amp;', '&lt;', '&gt;', '&quot;', '&apos;'];
const TAG_NAME_RE = /^[A-Za-z_][A-Za-z0-9_.:-]*$/;

/**
 * 严格 XML 良构检查（**手写，零依赖**）。
 *
 * 为什么不用现成解析器：`build-local.js` 有一条硬约束「零外部依赖，CI 里不必 npm install」，
 * 而 `selfCheck()` 就走在这条路径上。仓里已有 `yaml-recheck.py` 这个「自己写检查器」的先例。
 * 真解析器的交叉证据由 `verify-site.js` 在真浏览器里用 `DOMParser` 提供 ——
 * 两个独立实现，互为对照。
 *
 * 只认我们自己序列化出来的那一个子集：XML 声明 + 元素 + 属性（双引号）+
 * 五个命名实体 + 注释。CDATA / DOCTYPE / 单引号属性一律判为不合规（我们从不写它们）。
 *
 * @returns {string[]} 问题清单（空 = 良构）
 */
function checkXmlWellFormed(xml) {
  const problems = [];
  const text = String(xml === null || xml === undefined ? '' : xml);
  if (!/^<\?xml version="1\.0" encoding="UTF-8"\?>\n/.test(text)) {
    problems.push('缺少标准的 XML 声明（必须是 <?xml version="1.0" encoding="UTF-8"?> 且独占一行）');
  }
  const body = text.replace(/^<\?xml[^>]*\?>/, '');
  const stack = [];
  const checkText = (chunk, where) => {
    const at = chunk.search(/&/);
    if (at < 0) return;
    let rest = chunk.slice(at);
    while (rest.length) {
      const amp = rest.indexOf('&');
      if (amp < 0) break;
      const entity = NAMED_ENTITIES.find(name => rest.startsWith(name, amp));
      if (!entity) {
        problems.push(`${where}: 出现未转义的 & 或未知实体（…${rest.slice(amp, amp + 24)}…）`);
        return;
      }
      rest = rest.slice(amp + entity.length);
    }
  };

  let pos = 0;
  while (pos < body.length) {
    const lt = body.indexOf('<', pos);
    if (lt < 0) { checkText(body.slice(pos), '文本'); break; }
    checkText(body.slice(pos, lt), '文本');
    if (body.startsWith('<!--', lt)) {
      const end = body.indexOf('-->', lt);
      if (end < 0) { problems.push('注释未闭合'); break; }
      pos = end + 3;
      continue;
    }
    const gt = body.indexOf('>', lt);
    if (gt < 0) { problems.push(`标签未闭合（…${body.slice(lt, lt + 40)}…）`); break; }
    const raw = body.slice(lt + 1, gt);
    if (raw.startsWith('/')) {
      const name = raw.slice(1).trim();
      if (!TAG_NAME_RE.test(name)) { problems.push(`非法的结束标签 </${name}>`); break; }
      const open = stack.pop();
      if (open !== name) { problems.push(`标签不配平：</${name}> 对不上 <${open || '(无)'}>`); break; }
    } else if (raw.startsWith('?') || raw.startsWith('!')) {
      problems.push(`出现不应有的处理指令 / 声明：<${raw.slice(0, 20)}>`);
      break;
    } else {
      const selfClosing = raw.endsWith('/');
      const inner = selfClosing ? raw.slice(0, -1) : raw;
      const space = inner.search(/\s/);
      const name = (space < 0 ? inner : inner.slice(0, space)).trim();
      if (!TAG_NAME_RE.test(name)) { problems.push(`非法的标签名 <${name}>`); break; }
      if (space >= 0) {
        const attrs = inner.slice(space).trim();
        const attrRe = /^([A-Za-z_][A-Za-z0-9_.:-]*)="([^"]*)"\s*/;
        let rest = attrs;
        while (rest.length) {
          const m = attrRe.exec(rest);
          if (!m) { problems.push(`<${name}> 的属性不是 name="value" 形式：${rest.slice(0, 40)}`); break; }
          checkText(m[2], `<${name}> 的属性 ${m[1]}`);
          rest = rest.slice(m[0].length);
        }
      }
      if (!selfClosing) stack.push(name);
    }
    pos = gt + 1;
  }
  if (stack.length) problems.push(`有 ${stack.length} 个标签没有闭合：${stack.slice(-3).join(', ')}`);
  return problems;
}

/* ------------------------------------------------------------------ */
/* 注册表（唯一清单）                                                   */
/* ------------------------------------------------------------------ */

/**
 * 分类 Feed → 既有页面 spec 的映射。`kind` 指页面注册表（collection / need），
 * `slug` 是页面自己的 slug（**Feed 的路由名可以不同**：`/feed/china.*` 对的是
 * `/need/china-usable/`）。
 *
 * 为什么指向页面而不是重写谓词：页面注册表里已经写着「这一页收什么」，
 * 复用它，Feed 的条目集合与页面表格的行数就被同一条判据锁在一起。
 */
const COLLECTION_FEED_PAGES = [
  { id: 'student', pageKind: 'collection', pageSlug: 'student' },
  { id: 'developer', pageKind: 'collection', pageSlug: 'developer' },
  { id: 'free-api', pageKind: 'collection', pageSlug: 'free-api' },
  { id: 'free-tokens', pageKind: 'need', pageSlug: 'free-tokens' },
  { id: 'ai-coding', pageKind: 'need', pageSlug: 'ai-coding' },
  { id: 'china', pageKind: 'need', pageSlug: 'china-usable' },
  // v1.7：分类落地页各自一份订阅。只登记**真的会生成页面**的分类
  // （门槛与人工允许表在 lib/landing.js 的 CATEGORY_PAGES）；多登记一个，
  // Feed 会照常生成但页面不存在 —— 那种「订阅有、页面无」的不一致由
  // /feeds/ 页面的回链与 selftest:seo 一起盯着。
  { id: 'category-api', pageKind: 'category', pageSlug: 'api' },
  { id: 'category-chat', pageKind: 'category', pageSlug: 'chat' },
  { id: 'category-audio', pageKind: 'category', pageSlug: 'audio' },
  { id: 'category-image', pageKind: 'category', pageSlug: 'image' },
  { id: 'category-agent', pageKind: 'category', pageSlug: 'agent' }
];

/** 首页 `<head>` 上暴露哪四个订阅选择（其余集中放在 /feeds/ 页） */
const HOMEPAGE_FEED_IDS = ['all', 'changes', 'student', 'developer'];

/**
 * 站点根 Feed 的身份（标题在这里定一次）。详情页 / 状态页 / 目录页的
 * `rel="alternate"` 都从这一份生成 —— 否则「改了注册表、忘了改模板」的漂移
 * 不会有任何东西会红。
 */
const ROOT_FEED = {
  path: 'feed.xml',
  jsonPath: 'feed.json',
  title: `${FEED_BRAND} · 全部优惠`
};

/** 根 Feed 的两个标签（各处声明订阅源共用） */
function rootFeedTags(prefix = '') {
  return feedLinkTags([{ spec: ROOT_FEED }], prefix);
}

function pageListOf(pageKind) {
  if (pageKind === 'need') return audience.NEED_PAGES;
  if (pageKind === 'category') return landing.CATEGORY_PAGES;
  return audience.COLLECTION_PAGES;
}
function predicateMapOf(pageKind) {
  if (pageKind === 'need') return audience.NEED_PREDICATES;
  if (pageKind === 'category') return landing.CATEGORY_PREDICATES;
  return audience.COLLECTION_PREDICATES;
}
/** 页面在站点根下的相对路由 */
function pageRouteOf(pageKind, slug) {
  if (pageKind === 'need') return `need/${slug}/`;
  if (pageKind === 'category') return `category/${slug}/`;
  return `${slug}/`;
}

/** 厂商落地页的路由（订阅 spec 的 homePageUrl / pageRoute 与页面共用这一处） */
function vendorRouteOf(slug) {
  return `vendor/${slug}/`;
}

/**
 * 一个页面**自己**的订阅源（v1.7）。
 *
 * v1.6 里页面→Feed 只能靠调用方硬编码 spec id（`build-local.js` 早先就是
 * `byId.get('changes')` 这么写的），而「页面上忘了声明自己的 Feed」不会有任何东西变红。
 * 这个函数让「页面**有**哪份 Feed」与「页面**声明**哪份 Feed」都从注册表推导：
 *   · 分类页 / 按需求页 / 分类落地页 → COLLECTION_FEED_PAGES 里指向它的那一条；
 *   · 厂商页 → `vendor-<slug>`（由厂商注册表决定，存在与不存在都以 spec 为准）。
 *
 * @param {object} page `{ kind, slug }` —— 落地页 spec 的最小切片
 * @param {object[]} [feeds] 已构建的 feedBundle.feeds；省略时只按注册表推导（用于自检）
 */
function feedsForPage(page, feeds) {
  if (!page || !page.slug) return [];
  const spec = page.kind === 'vendor'
    ? { id: `vendor-${page.slug}` }
    : (COLLECTION_FEED_PAGES.find(entry => entry.pageKind === page.kind && entry.pageSlug === page.slug) || null);
  if (!spec) return [];
  if (!Array.isArray(feeds)) return [{ spec: { id: spec.id } }];
  const hit = feeds.find(item => item.spec && item.spec.id === spec.id);
  return hit ? [hit] : [];
}

/** 厂商 slug 表（人工维护；错误在 `validateVendorSlugs()` 与自测里报） */
function loadVendorSlugs(file = VENDOR_SLUGS_FILE) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const out = {};
  for (const key of Object.keys(raw)) {
    if (key.startsWith('_')) continue;
    out[key] = String(raw[key]);
  }
  return out;
}
const VENDOR_SLUGS = loadVendorSlugs();

/* ------------------------------------------------------------------ */
/* 小工具                                                               */
/* ------------------------------------------------------------------ */

function toUtcString(date) {
  return new Date(`${date}T00:00:00+08:00`).toUTCString();
}
function toIso(date) {
  return `${date}T00:00:00+08:00`;
}
function sha1Hex(text) {
  return crypto.createHash('sha1').update(String(text), 'utf8').digest('hex');
}
/** 变化条目的稳定 id（见文件头纪律 3） */
function eventFeedId(event) {
  return `chg:${sha1Hex(history.eventKey(event)).slice(0, 16)}`;
}
/** 站点绝对 URL + 站内相对路由 */
function absolute(route) {
  return SITE_URL + route;
}
/** 值 → 一行可读文本（数组用顿号、对象走稳定序列化，不猜、不截语义） */
function valueText(value) {
  if (value === null || value === undefined) return '（无）';
  if (Array.isArray(value)) return value.length ? value.map(item => valueText(item)).join('、') : '（无）';
  if (typeof value === 'object') return history.stableJson(value);
  return cleanText(value, LIMITS.valueChars) || '（空）';
}
/** 某条记录最近一次**高价值**变化（没有就返回 null —— 不拿 lastSeen 顶替） */
function lastImportantChangeOf(store, id) {
  let last = null;
  for (const event of history.eventsOf(store)) {
    if (!event || event.id !== id) continue;
    if (!DATE_RE.test(String(event.at || ''))) continue;
    if (!HIGH_VALUE_TYPES.includes(event.type)) continue;
    if (!last || event.at > last) last = event.at;
  }
  return last;
}
/** 已经结束（最后一次生命周期事件是 ended）的记录 id 集合 */
function endedIds(store) {
  const out = new Set();
  const ids = new Set(history.eventsOf(store).map(event => event && event.id).filter(Boolean));
  for (const id of ids) {
    const last = history.lastLifecycleOf(store, id);
    if (last && last.type === 'ended') out.add(id);
  }
  return out;
}
function isExpired(deal, asOf) {
  const at = String((deal && deal.expiresAt) || '');
  if (!DATE_RE.test(at) || !DATE_RE.test(String(asOf || ''))) return false;
  return at < asOf;
}

/* ------------------------------------------------------------------ */
/* 正文（纯文本，与卡片同一套字段口径）                                  */
/* ------------------------------------------------------------------ */

const L = FEEDS_WORDING.FEEDS_LABELS;
const ITEM_LABELS = {
  audience: audience.FIELD_LABELS.audience,
  benefit: audience.FIELD_LABELS.benefitType,
  china: audience.FIELD_LABELS.chinaUsable
};
const SOURCE_LABELS = audience.WORDING_CONTRACT.SOURCE_LABELS;
const HISTORY_LABELS = history.HISTORY_WORDING.HISTORY_LABELS;
const HISTORY_TYPES = history.HISTORY_WORDING.HISTORY_TYPES;
const HISTORY_FIELD_LABELS = history.HISTORY_WORDING.HISTORY_FIELD_LABELS;
const HISTORY_END_REASONS = history.HISTORY_WORDING.HISTORY_END_REASONS;

/** 「有效期」一行：只陈述数据里写了什么，不做状态推断 */
function validityLine(deal) {
  const expiresAt = DATE_RE.test(String((deal && deal.expiresAt) || '')) ? deal.expiresAt : null;
  const raw = cleanText(deal && deal.validity, LIMITS.validityChars);
  if (expiresAt) return raw ? `${raw}，${expiresAt} 截止` : `${expiresAt} 截止`;
  return raw || L.noDeadline;
}

/** 优惠条目的正文（§八 要求的那几项逐条落地，不放长正文） */
function dealText(deal, { lastChange, route, href }) {
  const lines = [];
  if (deal.vendor) lines.push(`${L.vendor}：${deal.vendor}`);
  const offer = cleanText(deal.discountInfo, LIMITS.summaryChars);
  if (offer) lines.push(`${L.offer}：${offer}`);
  const zh = deal.zh && typeof deal.zh === 'object' ? cleanText(deal.zh.discountInfo, LIMITS.summaryChars) : '';
  if (zh && zh !== offer) lines.push(`${L.zh}：${zh}`);
  const audienceText = audience.audienceSummary(deal);
  if (audienceText) lines.push(`${ITEM_LABELS.audience}：${audienceText}`);
  const benefitText = audience.benefitSummary(deal);
  if (benefitText) lines.push(`${ITEM_LABELS.benefit}：${benefitText}`);
  lines.push(`${HISTORY_FIELD_LABELS.validity}：${validityLine(deal)}`);
  const china = audience.chinaUsableLine(deal);
  if (china) lines.push(`${ITEM_LABELS.china}：${china}`);
  if (lastChange) lines.push(`${L.lastChange}：${lastChange}`);
  const seen = [];
  if (deal.firstSeen) seen.push(`${SOURCE_LABELS.firstSeen}：${deal.firstSeen}`);
  if (deal.lastSeen) seen.push(`${SOURCE_LABELS.lastSeen}：${deal.lastSeen}`);
  if (seen.length) lines.push(seen.join(' · '));
  if (deal.url) lines.push(`${SOURCE_LABELS.official}：${deal.url}`);
  lines.push(`${L.detail}：${href}`);
  return lines.join('\n');
}

/** 变化条目的正文 */
function changeText(item, { deal, href }) {
  const lines = [];
  const name = item.titled ? item.title : CHANGES_LABELS.tombstone;
  lines.push(`${L.record}：${item.vendor ? `${item.vendor} · ` : ''}${name}`);
  const typeLabel = HISTORY_TYPES[item.type] || item.type;
  const fieldLabel = item.field ? `（${HISTORY_FIELD_LABELS[item.field] || item.field}）` : '';
  lines.push(`变化：${typeLabel}${fieldLabel}`);
  if (item.type !== 'created' && (item.from !== null || item.to !== null)) {
    lines.push(`${HISTORY_LABELS.from}：${valueText(item.from)}`);
    lines.push(`${HISTORY_LABELS.to}：${valueText(item.to)}`);
  }
  if (item.type === 'created' && deal) {
    const offer = cleanText(deal.discountInfo, LIMITS.summaryChars);
    if (offer) lines.push(`${L.offer}：${offer}`);
    const benefitText = audience.benefitSummary(deal);
    if (benefitText) lines.push(`${ITEM_LABELS.benefit}：${benefitText}`);
    lines.push(`${HISTORY_FIELD_LABELS.validity}：${validityLine(deal)}`);
  }
  lines.push(`${L.time}：${item.at}`);
  if (item.reason) lines.push(`${L.reason}：${HISTORY_END_REASONS[item.reason] || item.reason}`);
  if (deal && deal.url) lines.push(`${SOURCE_LABELS.official}：${deal.url}`);
  lines.push(`${L.detail}：${href}`);
  if (item.type === 'ended') lines.push(history.HISTORY_WORDING.HISTORY_NOTES.disclaimer);
  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/* 注册表构建                                                           */
/* ------------------------------------------------------------------ */

function collectionSpec(base, pageKind, pageSlug, predicate) {
  const page = pageListOf(pageKind).find(item => item.slug === pageSlug);
  if (!page) throw new Error(`Feed ${base.id}: 页面注册表里没有 ${pageKind}/${pageSlug}`);
  // 分类页用 `title`、按需求页用 `label`（v1.2 的注册表字段名不同），取其一，不新写文案。
  const title = page.title || page.label;
  return Object.assign({}, base, {
    kind: 'collection',
    title: `${FEED_BRAND} · ${title}`,
    description: page.description,
    homePageUrl: absolute(pageRouteOf(pageKind, pageSlug)),
    pageRoute: pageRouteOf(pageKind, pageSlug),
    predicate
  });
}

/**
 * 把注册表解析成运行时 spec 列表（含数据驱动的厂商 Feed）。
 *
 * @param {object} params
 * @param {object[]} params.deals 当前记录
 * @param {object}   [params.store] 变更日志
 * @returns {{specs:object[], vendorSkipped:object[], vendorUnmapped:string[]}}
 */
function resolveSpecs({ deals = [], store = null, vendorSlugs = VENDOR_SLUGS, vendorKeyOf = null } = {}) {
  const specs = [];

  specs.push({
    id: 'all', kind: 'collection', path: ROOT_FEED.path, jsonPath: ROOT_FEED.jsonPath,
    title: ROOT_FEED.title, description: SITE_DESCRIPTION,
    homePageUrl: SITE_URL, pageRoute: '', predicate: null,
    mayBeEmpty: false, homepage: HOMEPAGE_FEED_IDS.includes('all'), vendor: null
  });

  for (const entry of COLLECTION_FEED_PAGES) {
    const page = pageListOf(entry.pageKind).find(item => item.slug === entry.pageSlug);
    if (!page) throw new Error(`Feed ${entry.id}: 页面注册表里没有 ${entry.pageKind}/${entry.pageSlug}`);
    // 谓词查表的口径按注册表形状分两种：collection/need 的 spec 用 `predicate` 指向
    // `*_PREDICATES` 里的键名，而 CATEGORY_PREDICATES **直接以 slug 为键**（没有第三层命名）。
    const predicateMap = predicateMapOf(entry.pageKind);
    const predicate = entry.pageKind === 'category'
      ? predicateMap[entry.pageSlug]
      : predicateMap[page.predicate];
    if (typeof predicate !== 'function') throw new Error(`Feed ${entry.id}: 找不到谓词实现`);
    specs.push(collectionSpec({
      id: entry.id, path: `feed/${entry.id}.xml`, jsonPath: `feed/${entry.id}.json`,
      mayBeEmpty: false, homepage: HOMEPAGE_FEED_IDS.includes(entry.id), vendor: null
    }, entry.pageKind, entry.pageSlug, predicate));
  }

  // B 类：变化 Feed。**始终生成**，空是事实（起算日之前没有可观测的变化）。
  //
  // 描述分三层，刻意不合成一句：feed 是干什么的（中性）→ 当前空的原因 → 口径说明。
  // 把「还没有观测到变化」写死进中性描述是错的：日志**不可用**时那句话就变成了
  // 对读者的断言（「没有变化」），而这两种事实必须说成两句不同的话。
  specs.push({
    id: 'new', kind: 'changes', path: 'feed/new.xml', jsonPath: 'feed/new.json',
    title: `${FEED_BRAND} · 最近新增`,
    description: '本站观测到的首次收录：哪些优惠是最近才被收录进来的。',
    emptyNote: `${FEEDS_WORDING.FEEDS_NOTES.emptyNew}`,
    homePageUrl: absolute('changes/'), pageRoute: 'changes/', predicate: null,
    mayBeEmpty: true, homepage: HOMEPAGE_FEED_IDS.includes('new'), vendor: null,
    changeBucket: 'created'
  });
  specs.push({
    id: 'changes', kind: 'changes', path: 'feed/changes.xml', jsonPath: 'feed/changes.json',
    title: `${FEED_BRAND} · 最近变化`,
    description: '本站观测到的优惠变化：优惠内容、领取条件、有效期与收录状态。',
    emptyNote: `${FEEDS_WORDING.FEEDS_NOTES.emptyChanges}`,
    homePageUrl: absolute('changes/'), pageRoute: 'changes/', predicate: null,
    mayBeEmpty: true, homepage: HOMEPAGE_FEED_IDS.includes('changes'), vendor: null,
    changeBucket: 'all'
  });

  // 厂商 Feed：数据驱动，门槛见 VENDOR_THRESHOLDS。
  //
  // v1.7：分组键从**原始字符串**改成**规范厂商名**（`vendorOf(deal).name`，由调用方
  // 通过 `vendorKeyOf` 注入）。理由是同一个公司会有多种写法（「火山引擎（字节跳动）」与
  // 「火山引擎」），而 v1.7 起每家厂商有自己的落地页 `/vendor/<slug>/` ——
  // 页面用规范名、Feed 用原始字符串，就会出现「页面列 13 条、它的 Feed 只有 12 条」
  // 这种自相矛盾。注入而不是直接 require RENDER-CORE：这个文件必须保持纯函数、
  // 可被自测直接调用（自测传自己的 keyOf）。
  const keyOf = typeof vendorKeyOf === 'function' ? vendorKeyOf : (deal => String((deal && deal.vendor) || ''));
  const dealCount = new Map();
  for (const deal of deals) {
    if (!deal || deal.type !== 'deal') continue;
    const name = keyOf(deal);
    if (!name) continue;
    dealCount.set(name, (dealCount.get(name) || 0) + 1);
  }
  const eventCount = new Map();
  const vendorOfId = new Map(deals.map(deal => [deal && deal.id, deal ? keyOf(deal) : '']));
  for (const event of history.eventsOf(store)) {
    const vendor = vendorOfId.get(event && event.id);
    if (!vendor) continue;
    eventCount.set(vendor, (eventCount.get(vendor) || 0) + 1);
  }
  const vendors = [...dealCount.keys()];
  vendors.sort();
  const vendorSkipped = [];
  const vendorUnmapped = [];
  for (const vendor of vendors) {
    if (!vendor) continue;
    const byCount = (dealCount.get(vendor) || 0) >= VENDOR_THRESHOLDS.minDeals;
    const byEvents = (eventCount.get(vendor) || 0) >= VENDOR_THRESHOLDS.minEvents;
    if (!byCount && !byEvents) continue;
    const slug = vendorSlugs[vendor];
    if (!slug) { vendorUnmapped.push(vendor); continue; }
    const items = deals.filter(deal => deal.type === 'deal' && keyOf(deal) === vendor);
    if (!items.length) { vendorSkipped.push({ vendor, slug, reason: 'no_active_deals' }); continue; }
    specs.push({
      id: `vendor-${slug}`, kind: 'collection',
      path: `feed/vendor/${slug}.xml`, jsonPath: `feed/vendor/${slug}.json`,
      title: `${FEED_BRAND} · ${vendor}`,
      description: `${vendor} 当前收录的 AI 优惠与免费额度。${FEEDS_WORDING.FEEDS_NOTES.provider}`,
      // v1.7：厂商 Feed 的主页指向它自己的落地页（v1.6 时还没有这个页面，只能指站根 ——
      // 于是「订阅了这一家」的读者在 Feed 里找不到对应的页面）。
      homePageUrl: absolute(vendorRouteOf(slug)), pageRoute: vendorRouteOf(slug), predicate: null,
      mayBeEmpty: false, homepage: false, vendor,
      slug, itemCount: items.length
    });
  }
  return { specs, vendorSkipped, vendorUnmapped };
}

/* ------------------------------------------------------------------ */
/* 条目构建                                                             */
/* ------------------------------------------------------------------ */

/** 优惠 Feed 的条目集合（判据来自 spec.predicate，排除已结束与已过期） */
function collectionItems(spec, { deals, store, asOf, vendorKeyOf = null }) {
  const ended = endedIds(store);
  const keyOf = typeof vendorKeyOf === 'function' ? vendorKeyOf : (deal => String((deal && deal.vendor) || ''));
  const pool = deals.filter(deal => deal && deal.type === 'deal');
  const matched = pool.filter(deal => {
    if (ended.has(deal.id)) return false;
    if (isExpired(deal, asOf)) return false;
    // 厂商 Feed 的条目按**规范厂商名**取（与页面同一套口径）：用原始字符串比会漏掉
    // 「扣子 Coze（字节跳动）」这类写法，症状是该厂商的 Feed 莫名其妙是空的。
    if (spec.vendor && keyOf(deal) !== spec.vendor) return false;
    if (spec.predicate && !spec.predicate(deal)) return false;
    return true;
  });
  const items = matched.map(deal => {
    const route = `deal/${encodeURIComponent(deal.id)}/`;
    const lastChange = lastImportantChangeOf(store, deal.id);
    return {
      type: 'deal',
      id: deal.id,
      dealId: deal.id,
      title: deal.title,
      link: absolute(route),
      route,
      externalUrl: deal.url || null,
      vendor: deal.vendor || '',
      datePublished: deal.firstSeen,
      dateModified: lastChange,
      sortKey: lastChange || deal.firstSeen || '',
      tags: [
        deal.vendor,
        deal.category,
        ...(deal.audience || []).map(key => audience.AUDIENCE_LABELS[key] || key),
        ...(deal.benefitType || []).map(key => audience.BENEFIT_LABELS[key] || key)
      ].filter(Boolean),
      text: dealText(deal, { lastChange, route, href: absolute(route) })
    };
  });
  items.sort((a, b) => {
    if (a.sortKey !== b.sortKey) return a.sortKey < b.sortKey ? 1 : -1;
    if (a.datePublished !== b.datePublished) return a.datePublished < b.datePublished ? 1 : -1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return items;
}

/** 变化 Feed 的条目集合（直接取雷达的分栏条目，不重新过滤事件） */
function changeItems(spec, { deals, store, radar }) {
  if (!radar || radar.availability !== 'ok') return [];
  const sections = radar.sections || {};
  const pool = spec.changeBucket === 'created'
    ? (sections.created ? sections.created.items : [])
    : [
      ...(sections.created ? sections.created.items : []),
      ...(sections.changed ? sections.changed.items : []),
      ...(sections.ended ? sections.ended.items : []),
      ...(sections.restored ? sections.restored.items : [])
    ];
  const byId = new Map(deals.map(deal => [deal && deal.id, deal]));
  const items = pool.map(entry => {
    const deal = byId.get(entry.id) || null;
    const linkable = Boolean(deal && deal.type === 'deal');
    const route = linkable ? `deal/${encodeURIComponent(entry.id)}/` : 'changes/';
    const event = findEvent(store, entry);
    const href = absolute(route);
    const typeLabel = HISTORY_TYPES[entry.type] || entry.type;
    const fieldLabel = entry.field ? `（${HISTORY_FIELD_LABELS[entry.field] || entry.field}）` : '';
    const name = entry.titled ? entry.title : CHANGES_LABELS.tombstone;
    return {
      type: 'change',
      id: event ? eventFeedId(event) : `chg:unknown:${entry.id}:${entry.at}:${entry.type}:${entry.field || ''}`,
      dealId: entry.id,
      eventKey: event ? history.eventKey(event) : null,
      eventType: entry.type,
      field: entry.field || null,
      from: 'from' in entry ? entry.from : null,
      to: 'to' in entry ? entry.to : null,
      at: entry.at,
      reason: entry.reason || null,
      titled: Boolean(entry.titled),
      title: `${entry.vendor ? `${entry.vendor} · ` : ''}${name} — ${typeLabel}${fieldLabel}`,
      link: href,
      route,
      externalUrl: deal && deal.url ? deal.url : null,
      vendor: entry.vendor || '',
      datePublished: entry.at,
      dateModified: entry.at,
      tags: [entry.vendor, typeLabel].filter(Boolean),
      text: changeText(entry, { deal, href })
    };
  });
  items.sort((a, b) => {
    if (a.at !== b.at) return a.at < b.at ? 1 : -1;
    if (a.dealId !== b.dealId) return a.dealId < b.dealId ? -1 : 1;
    if ((a.eventType || '') !== (b.eventType || '')) return a.eventType < b.eventType ? -1 : 1;
    const af = a.field || '';
    const bf = b.field || '';
    return af < bf ? -1 : af > bf ? 1 : 0;
  });
  return items;
}

/** 把雷达条目对回日志里的那一条事件（身份由数据决定，对不上就如实留空） */
function findEvent(store, entry) {
  for (const event of history.eventsOf(store)) {
    if (!event || event.id !== entry.id || event.at !== entry.at) continue;
    if (event.type !== entry.type) continue;
    if ((event.field || null) !== (entry.field || null)) continue;
    if (entry.type === 'ended' || entry.type === 'restored') return event;
    if (history.stableJson(event.from) !== history.stableJson(entry.from)) continue;
    if (history.stableJson(event.to) !== history.stableJson(entry.to)) continue;
    return event;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* 序列化                                                               */
/* ------------------------------------------------------------------ */

function descriptionWithNotes(spec, { truncated = 0, asOf = null, availability = 'ok', empty = false } = {}) {
  const parts = [spec.description];
  if (spec.kind === 'changes') {
    if (availability !== 'ok') {
      // 「不可用」与「没有变化」是两句不同的话：日志缺失时说「没拿到日志」，
      // 绝不拿中性描述或空态措辞去冒充「没有变化」。
      parts.push(CHANGES_NOTES.unavailable);
    } else if (empty && asOf) {
      parts.push(`${spec.emptyNote} ${CHANGES_LABELS.since.replace('{date}', historyStartedAt(spec, asOf))}`);
    }
  }
  if (truncated > 0) {
    parts.push(FEEDS_WORDING.FEEDS_NOTES.truncated
      .replace('{n}', String(truncated)).replace('{cap}', String(LIMITS.itemsPerFeed)));
  }
  parts.push(FEEDS_WORDING.FEEDS_NOTES.scope);
  return parts.filter(Boolean).join(' ');
}

/** 起算日由调用方塞进 spec（渲染层需要它来解释「为什么空」） */
function historyStartedAt(spec, asOf) {
  return spec.startedAt || asOf;
}

function serializeRss(spec, items, { updatedAt, description }) {
  const rows = items.map(item => `    <item>
      <title>${xmlEscape(item.title)}</title>
      <link>${xmlEscape(item.link)}</link>
      <guid isPermaLink="false">${xmlEscape(item.id)}</guid>
      <pubDate>${toUtcString(item.datePublished)}</pubDate>
${item.tags.map(tag => `      <category>${xmlEscape(tag)}</category>`).join('\n')}
      <description>${xmlEscape(item.text)}</description>
    </item>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${xmlEscape(spec.title)}</title>
    <link>${xmlEscape(spec.homePageUrl)}</link>
    <description>${xmlEscape(description)}</description>
    <language>zh-CN</language>
    <lastBuildDate>${toUtcString(String(updatedAt || '').slice(0, 10))}</lastBuildDate>
    <atom:link href="${xmlEscape(absolute(spec.path))}" rel="self" type="application/rss+xml"/>
    <image>
      <url>${xmlEscape(absolute('icon.png'))}</url>
      <title>${xmlEscape(SITE_NAME)}</title>
      <link>${xmlEscape(SITE_URL)}</link>
      <width>144</width>
      <height>144</height>
    </image>
${rows}
  </channel>
</rss>
`;
}

function serializeJsonFeed(spec, items, { description }) {
  return `${JSON.stringify({
    version: 'https://jsonfeed.org/version/1.1',
    title: spec.title,
    home_page_url: spec.homePageUrl,
    feed_url: absolute(spec.jsonPath),
    description,
    language: 'zh-CN',
    icon: absolute('icon.png'),
    favicon: absolute('favicon.svg'),
    items: items.map(item => {
      const out = {
        id: item.id,
        url: item.link,
        title: item.title,
        content_text: item.text,
        date_published: toIso(item.datePublished)
      };
      if (item.externalUrl) out.external_url = item.externalUrl;
      if (item.dateModified) out.date_modified = toIso(item.dateModified);
      if (item.tags && item.tags.length) out.tags = item.tags;
      return out;
    })
  }, null, 2)}\n`;
}

/* ------------------------------------------------------------------ */
/* 主入口                                                               */
/* ------------------------------------------------------------------ */

/**
 * 构建全部 Feed（纯函数：同样的入参一定产出逐字节相同的产物）。
 *
 * @param {object}   params
 * @param {object[]} params.deals     当前记录（只读）
 * @param {object}   [params.store]   `deal-history.json` 解析后的对象（只读）
 * @param {object}   [params.radar]   `changes.buildRadar()` 的结果（**同一份**，不重算）
 * @param {string}   params.asOf      基准日 `YYYY-MM-DD`（数据时间）
 * @param {string}   [params.updatedAt] `deals.json` 的 updatedAt（lastBuildDate 用，不取构建时刻）
 * @returns {{feeds:object[], stats:object, vendorSkipped:object[], vendorUnmapped:string[]}}
 */
function buildFeeds({ deals = [], store = null, radar = null, asOf = null, updatedAt = null, availability = 'ok', vendorSlugs = VENDOR_SLUGS, vendorKeyOf = null } = {}) {
  const resolved = resolveSpecs({ deals, store, vendorSlugs, vendorKeyOf });
  const startedAt = store && typeof store.startedAt === 'string' ? store.startedAt : null;
  const specs = resolved.specs.map(spec => Object.assign({}, spec, {
    startedAt: spec.kind === 'changes' ? (startedAt || asOf) : null
  }));

  let truncatedTotal = 0;
  const feeds = specs.map(spec => {
    const all = spec.kind === 'changes'
      ? changeItems(spec, { deals, store, radar })
      : collectionItems(spec, { deals, store, asOf, vendorKeyOf });
    const items = all.slice(0, LIMITS.itemsPerFeed);
    const truncated = Math.max(0, all.length - items.length);
    truncatedTotal += truncated;
    const description = descriptionWithNotes(spec, { truncated, asOf, availability, empty: items.length === 0 });
    return {
      spec,
      items,
      total: all.length,
      truncated,
      description,
      rss: serializeRss(spec, items, { updatedAt, description }),
      json: serializeJsonFeed(spec, items, { description })
    };
  });

  return {
    feeds,
    stats: {
      count: feeds.length,
      files: feeds.length * 2,
      items: feeds.reduce((sum, feed) => sum + feed.items.length, 0),
      empty: feeds.filter(feed => !feed.items.length).map(feed => feed.spec.id),
      truncated: truncatedTotal
    },
    vendorSkipped: resolved.vendorSkipped,
    vendorUnmapped: resolved.vendorUnmapped
  };
}

/** 首页/页面 `<head>` 的 `rel="alternate"` 标签（唯一出处，HTML 里不再抄一份） */
function feedLinkTags(feeds, prefix = '') {
  return feeds.map(feed => [
    `<link rel="alternate" type="application/rss+xml" title="${xmlEscape(feed.spec.title)}" href="${prefix}${feed.spec.path}">`,
    `<link rel="alternate" type="application/feed+json" title="${xmlEscape(feed.spec.title)}" href="${prefix}${feed.spec.jsonPath}">`
  ].join('\n')).join('\n');
}

/** 单个 spec 的两个标签（/changes/ 这类「本页对应哪个订阅」的页面用） */
function feedLinkTagPair(feed, prefix = '') {
  return feedLinkTags([feed], prefix);
}

/* ------------------------------------------------------------------ */
/* 校验                                                                 */
/* ------------------------------------------------------------------ */

/** 从 RSS 文本里取出条目（校验器要**回读产物**，不是看内存里的对象） */
function parseRssItems(xml) {
  const out = [];
  for (const block of String(xml).split('<item>').slice(1)) {
    const body = block.split('</item>')[0];
    const pick = tag => {
      const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`).exec(body);
      return m ? m[1] : null;
    };
    out.push({
      title: unescapeXml(pick('title')),
      link: unescapeXml(pick('link')),
      id: unescapeXml(pick('guid')),
      pubDate: unescapeXml(pick('pubDate')),
      categories: [...body.matchAll(/<category>([\s\S]*?)<\/category>/g)].map(m => unescapeXml(m[1]))
    });
  }
  return out;
}

function unescapeXml(text) {
  if (text === null || text === undefined) return null;
  return String(text)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * 产物级校验：**三方对账**（内存条目 ↔ RSS 回读 ↔ JSON 回读）+ 语义不变量。
 *
 * 纯函数，可对**篡改过的合成副本**调用 —— `feeds-selftest` 的 4 项 Tooth Test 就是
 * 拿深拷贝改一处、再断言这里恰好报出对应的 code。
 *
 * @param {object} params
 * @param {object[]} params.feeds        buildFeeds() 的 feeds
 * @param {object[]} params.deals
 * @param {object}   [params.store]
 * @param {Set<string>} [params.pages]  构建期真实生成的全部站内路由（含首页 ''）
 * @param {string}   [params.asOf]
 * @param {object}   [params.vendorSlugs]
 * @returns {{problems:{code:string, feed:string, detail:string}[], warnings:string[]}}
 */
function validate({
  feeds = [], deals = [], store = null, pages = new Set(),
  asOf = null, vendorSlugs = VENDOR_SLUGS, availability = 'ok', vendorKeyOf = null
} = {}) {
  const problems = [];
  const warnings = [];
  const add = (code, feed, detail) => problems.push({ code, feed, detail });
  const keyOf = typeof vendorKeyOf === 'function' ? vendorKeyOf : (deal => String((deal && deal.vendor) || ''));

  const byId = new Map(deals.map(deal => [deal && deal.id, deal]));
  const eventKeys = new Set(history.eventsOf(store).map(event => history.eventKey(event)));
  const allowedDates = new Set();
  for (const deal of deals) {
    if (deal && DATE_RE.test(String(deal.firstSeen || ''))) allowedDates.add(deal.firstSeen);
  }
  for (const event of history.eventsOf(store)) {
    if (event && DATE_RE.test(String(event.at || ''))) allowedDates.add(event.at);
  }

  // slug 表本身的形状（与具体 Feed 无关，报一次就够）
  const seenSlug = new Map();
  for (const [vendor, slug] of Object.entries(vendorSlugs)) {
    if (!SLUG_RE.test(String(slug))) add('vendor-slug', 'vendor-slugs.json', `${vendor} 的 slug 非法：${slug}`);
    if (seenSlug.has(slug)) add('vendor-slug', 'vendor-slugs.json', `slug ${slug} 被 ${seenSlug.get(slug)} 与 ${vendor} 同时占用`);
    seenSlug.set(slug, vendor);
  }

  const titles = new Map();
  const paths = new Set();

  for (const feed of feeds) {
    const spec = feed.spec;
    const label = spec.path;

    if (titles.has(spec.title)) add('title-consistent', label, `标题与 ${titles.get(spec.title)} 重复：${spec.title}`);
    titles.set(spec.title, label);
    for (const p of [spec.path, spec.jsonPath]) {
      if (paths.has(p)) add('feed-path-unique', label, `路径重复：${p}`);
      paths.add(p);
    }

    if (spec.vendor && !SLUG_RE.test(String(spec.slug || ''))) {
      add('vendor-slug', label, `厂商 slug 非法：${spec.slug}`);
    }

    // v1.7：Feed 声称的主页必须真的存在。厂商 Feed 曾把主页指向站根（那时没有厂商页），
    // 于是「订阅了这一家」的读者在 Feed 里找不到对应页面 —— 而没有任何断言会红。
    if (spec.pageRoute && !pages.has(spec.pageRoute)) {
      add('page-exists', label, `主页指向不存在的页面：${spec.pageRoute}`);
    }

    if (!feed.items.length) {
      if (!spec.mayBeEmpty) add('not-empty', label, `Feed 为空，但 spec 未标记 mayBeEmpty`);
    }

    // ① XML 良构 + JSON Feed 头部
    for (const problem of checkXmlWellFormed(feed.rss)) add('xml-well-formed', label, problem);
    let jsonBox = null;
    try {
      jsonBox = JSON.parse(feed.json);
      if (jsonBox.version !== 'https://jsonfeed.org/version/1.1') add('jsonfeed-version', label, `version=${jsonBox.version}`);
      for (const key of ['title', 'feed_url', 'items']) {
        if (!jsonBox[key]) add('jsonfeed-fields', label, `缺 ${key}`);
      }
      if (jsonBox.title !== spec.title) add('title-consistent', label, `JSON title ${jsonBox.title} ≠ spec ${spec.title}`);
      if (jsonBox.feed_url !== absolute(spec.jsonPath)) add('jsonfeed-fields', label, `feed_url=${jsonBox.feed_url}`);
      if (!jsonBox.icon || !jsonBox.favicon) add('jsonfeed-fields', label, '缺 icon / favicon');
      if (jsonBox.language !== 'zh-CN') add('jsonfeed-fields', label, `language=${jsonBox.language}`);
    } catch (error) {
      add('json-parse', label, error.message);
    }

    // ② 三方对账：内存条目 ↔ RSS 回读 ↔ JSON 回读
    const rssItems = parseRssItems(feed.rss);
    const jsonItems = jsonBox && Array.isArray(jsonBox.items) ? jsonBox.items : [];
    const memoryIds = feed.items.map(item => item.id);
    const rssIds = rssItems.map(item => item.id);
    const jsonIds = jsonItems.map(item => item.id);
    const same = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);
    if (!same(rssIds, memoryIds)) add('rss-json-parity', label, `RSS 回读 ${rssIds.length} 条 ≠ 内存 ${memoryIds.length} 条`);
    if (!same(jsonIds, memoryIds)) add('rss-json-parity', label, `JSON 回读 ${jsonIds.length} 条 ≠ 内存 ${memoryIds.length} 条`);
    for (let i = 0; i < memoryIds.length; i++) {
      if (rssItems[i] && jsonItems[i] &&
        (rssItems[i].pubDate !== new Date(jsonItems[i].date_published).toUTCString() ||
          (jsonItems[i].date_modified || '') !== (feed.items[i].dateModified ? toIso(feed.items[i].dateModified) : ''))) {
        add('rss-json-parity', label, `第 ${i + 1} 条时间字段两侧不一致`);
      }
    }

    // ③ 唯一性 + URL + 链接可解析
    const seenIds = new Set();
    for (const item of feed.items) {
      if (seenIds.has(item.id)) add('guid-unique', label, `重复 id：${item.id}`);
      seenIds.add(item.id);
      if (!/^https:\/\//.test(item.link || '')) add('url-valid', label, `链接不是 https：${item.link}`);
      if (!(item.link || '').startsWith(SITE_URL)) add('url-valid', label, `链接不在本站：${item.link}`);
      const route = String(item.link || '').slice(SITE_URL.length);
      if (!pages.has(route)) add('link-exists', label, `链接指向不存在的页面：${route}`);
      if (item.externalUrl && !/^https?:\/\//.test(item.externalUrl)) {
        add('url-valid', label, `官方来源链接非法：${item.externalUrl}`);
      }
      for (const date of [item.datePublished, item.dateModified]) {
        if (date === null || date === undefined) continue;
        if (!DATE_RE.test(String(date))) add('dates-from-data', label, `时间字段非法：${date}`);
        else if (!allowedDates.has(date)) add('dates-from-data', label, `${date} 不在数据的日期集合里（构建时刻泄进产物？）`);
      }
    }

    // ④ 语义：优惠 Feed 的判据与排除项
    if (spec.kind === 'collection') {
      for (const item of feed.items) {
        const deal = byId.get(item.dealId);
        if (!deal || deal.type !== 'deal') { add('deal-exists', label, `${item.dealId} 不是一条优惠记录`); continue; }
        if (spec.vendor && keyOf(deal) !== spec.vendor) add('predicate-holds', label, `${item.dealId} 不属于厂商 ${spec.vendor}`);
        if (spec.predicate && !spec.predicate(deal)) add('predicate-holds', label, `${item.dealId} 不满足本 Feed 的判据`);
        if (isExpired(deal, asOf)) add('no-expired', label, `${item.dealId} 已过期却仍在「当前优惠」里`);
        const last = history.lastLifecycleOf(store, deal.id);
        if (last && last.type === 'ended') add('no-ended', label, `${item.dealId} 已结束却仍在「当前优惠」里`);
      }
    }

    // ⑤ 语义：变化 Feed 必须对得上日志里的事件，且不许出现低价值事件
    if (spec.kind === 'changes') {
      if (availability !== 'ok') {
        if (feed.items.length) add('change-event-exists', label, '日志不可用却仍有变化条目');
      }
      for (const item of feed.items) {
        if (!item.eventKey || !eventKeys.has(item.eventKey)) {
          add('change-event-exists', label, `${item.id} 在 deal-history.json 里找不到对应事件`);
          continue;
        }
        const event = history.eventsOf(store).find(e => history.eventKey(e) === item.eventKey);
        if (eventFeedId(event) !== item.id) add('change-event-exists', label, `${item.id} 与事件身份对不上`);
        if (!HIGH_VALUE_TYPES.includes(event.type)) {
          add('change-high-value', label, `${item.id} 是低价值事件（${event.type}），不该进订阅`);
        }
      }
    }
  }

  if (availability !== 'ok' && feeds.some(feed => feed.spec.kind === 'changes' && feed.items.length)) {
    warnings.push('历史日志不可用，变化 Feed 应为空');
  }
  return { problems, warnings };
}

/* ------------------------------------------------------------------ */
/* 报告 / 日志用摘要                                                     */
/* ------------------------------------------------------------------ */

function summarize(feeds) {
  const perKind = { collection: 0, changes: 0 };
  let items = 0;
  const empty = [];
  for (const feed of feeds) {
    perKind[feed.spec.kind] = (perKind[feed.spec.kind] || 0) + 1;
    items += feed.items.length;
    if (!feed.items.length) empty.push(feed.spec.id);
  }
  return { count: feeds.length, files: feeds.length * 2, items, perKind, empty };
}

module.exports = {
  SITE_URL,
  SITE_NAME,
  SITE_DESCRIPTION,
  FEED_BRAND,
  ROOT_FEED,
  rootFeedTags,
  LIMITS,
  VENDOR_THRESHOLDS,
  VENDOR_SLUGS,
  VENDOR_SLUGS_FILE,
  HIGH_VALUE_TYPES,
  HOMEPAGE_FEED_IDS,
  COLLECTION_FEED_PAGES,
  FEEDS_WORDING,
  // v1.7：页面 → 它自己的订阅源（页面声明与自检都读这一处，不再硬编码 spec id）
  feedsForPage,
  vendorRouteOf,
  pageRouteOf,
  xmlEscape,
  checkXmlWellFormed,
  eventFeedId,
  lastImportantChangeOf,
  endedIds,
  isExpired,
  resolveSpecs,
  collectionItems,
  changeItems,
  buildFeeds,
  serializeRss,
  serializeJsonFeed,
  feedLinkTags,
  feedLinkTagPair,
  parseRssItems,
  unescapeXml,
  validate,
  summarize
};
