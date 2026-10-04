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
/**
 * v2.3：套餐变化订阅源。它与 deals 的变化源**并排**，不是它的变体：
 * 判据来自 `plan-changes.js`（纯函数），条目文本来自 `plans-page.js` 的同一句话，
 * guid 直接用套餐变化日志的**派生事件身份**（`plan-history.eventIdOf`）。
 */
const planChanges = require('./plan-changes');
const planHistoryLib = require('./plan-history');
const plansPage = require('./plans-page');
/**
 * v3.0：API 计费变化源与套餐变化源**并排**（同一条注册表、同一份条目实现）。
 * 它只多 require 两个模块：**没有**、也不会有一份 `feeds-api.js`。
 */
const apiPlanHistoryLib = require('./api-plan-history');
const apiPlansPage = require('./api-plans-page');
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
    /**
     * 套餐变化流为空时的说明。**必须单独一句**：套餐的变化面是价格 / 活动价 / 额度 / 模型 /
     * 限制 / 销售地区，与优惠的「领取条件 / 有效期」是两回事 —— 复用上面那句会让读者以为
     * 这份订阅漏了优惠（v2.3 上线后打线上 Feed 时抓到的**真实文案 bug**，已由自测钉住）。
     */
    emptyPlanChanges: '自起算日起，还没有观测到套餐的价格、活动价、额度、模型、限制或销售地区的变化。',
    /**
     * v3.0：API 计费变化流为空时的说明。同样**必须单独一句** —— 它的变化面是
     * 单价 / 计费单位 / 模型计价条目 / 免费额度 / 限速 / credits，与上面两句都不重叠；
     * 复用任何一句都会让读者以为这份订阅漏掉了另一份数据。
     */
    emptyApiPlanChanges: '自起算日起，还没有观测到 API 计费的单价、计费单位、模型计价条目、免费额度、限速或 credits 的变化。',
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
  { id: 'student', pageKind: 'collection', pageSlug: 'student', listGroup: 'student' },
  { id: 'developer', pageKind: 'collection', pageSlug: 'developer', listGroup: 'developer' },
  { id: 'free-api', pageKind: 'collection', pageSlug: 'free-api', listGroup: 'developer' },
  { id: 'free-tokens', pageKind: 'need', pageSlug: 'free-tokens', listGroup: 'developer' },
  { id: 'ai-coding', pageKind: 'need', pageSlug: 'ai-coding', listGroup: 'developer' },
  { id: 'china', pageKind: 'need', pageSlug: 'china-usable', listGroup: 'student' },
  // v1.7：分类落地页各自一份订阅。只登记**真的会生成页面**的分类
  // （门槛与人工允许表在 lib/landing.js 的 CATEGORY_PAGES）；多登记一个，
  // Feed 会照常生成但页面不存在 —— 那种「订阅有、页面无」的不一致由
  // /feeds/ 页面的回链与 selftest:seo 一起盯着。
  //
  // ⚠️ 这一组（`listGroup: 'category'`）曾经整组漏在 /feeds/ 汇总页之外（P3-4）：
  // 订阅文件都在、分类页的 `rel="alternate"` 也都在，唯独唯一的订阅总入口看不见它们。
  // 现在 /feeds/ 的分组表由 `pageGroups()` **从注册表派生**，页面渲染层不再手写 id 清单；
  // 「注册表里 public 的 Feed → 页面上必须有它」这条断言住在 `checkFeedsPage()` 里（双向）。
  { id: 'category-api', pageKind: 'category', pageSlug: 'api', listGroup: 'category' },
  { id: 'category-chat', pageKind: 'category', pageSlug: 'chat', listGroup: 'category' },
  { id: 'category-audio', pageKind: 'category', pageSlug: 'audio', listGroup: 'category' },
  { id: 'category-image', pageKind: 'category', pageSlug: 'image', listGroup: 'category' },
  { id: 'category-agent', pageKind: 'category', pageSlug: 'agent', listGroup: 'category' }
];

/**
 * `/feeds/` 汇总页的分组表（**顺序即页面顺序**）。
 *
 * 为什么这张表在**注册表所在的文件**里，而不是页面渲染层：`/feeds/` 曾经按一张手写的
 * id 清单渲染（`['student','china']` 之类），于是「注册表里有、页面没列」这件事
 * 在页面上和在自检里都看不出来 —— 唯一的总入口静默漏掉了 5 个分类 Feed（P3-4）。
 * 现在每条 spec 自己声明 `listGroup`，这里只管**分组顺序与文案**；
 * 页面渲染层只负责把 `pageGroups()` 的结果摊开。
 *
 * 新增一条 Feed 时必须选一个组（漏了会被 `checkFeedsPage()` 报成「没有分组」），
 * 这就是「注册表 → 页面」那个方向不会再漏的机制。
 */
const FEED_LIST_GROUPS = [
  {
    key: 'core',
    label: '全部与变化',
    note: null
  },
  {
    // v2.3 / v3.0：套餐变化与 API 价格变化是**两份互不注入的数据**（plans / api-plans），
    // 所以单独一组，而不是塞进「全部与变化」。清单由注册表展开，不写死 id。
    key: 'plans',
    label: '套餐与 API 计费',
    note: '套餐变化来自人工逐条核对官方页后重建的套餐数据（plans.json），API 价格变化来自'
      + '同样方式重建的 API 计费数据（api-plans.json）；两者与优惠（deals）是三份互不注入的数据。'
      + '每条变化都能在<a href="../plans/coding/">套餐对比页</a>或<a href="../plans/api/">API 计费对比页</a>找到落点。'
  },
  {
    key: 'student',
    label: '学生',
    note: '按「我是谁」和「能不能在大陆用上」切；判据与 /student/、/need/china-usable/ 两页<b>同一份</b>。'
  },
  {
    key: 'developer',
    label: '开发者',
    note: '按福利类型与用途切；与目录页、按需求页共用同一套判据，所以订阅里的条数与页面上的行数不可能分头变化。'
  },
  {
    key: 'category',
    label: '按分类',
    note: '按站点的分类落地页切（/category/api/ 等五页）；判据与那五页<b>同一份</b>，'
      + '所以这一组里每份订阅的条数与分类页表格的行数不可能分头变化。'
  },
  {
    // 厂商那一段在页面上单独渲染（带门槛说明），但成员判定同样走 listGroup，不再由
    // 「spec.vendor 有没有值」这类第二套口径决定。
    key: 'vendor',
    label: '厂商订阅',
    note: null
  }
];

/**
 * Feed 的可见性：**默认 public**（必须出现在 `/feeds/` 汇总页上）。
 *
 * `hidden: true` / `internal: true` 是唯一的例外，而且它有一条硬约束（`checkFeedsPage` 报红）：
 * **被隐藏的 Feed 不许继续生成**。理由：Feed 的地址一旦生成（文件在磁盘上、分类页的
 * `rel="alternate"` 也还指着它），「故意不在汇总页列出」就退化成了 P3-4 那个缺陷本身 ——
 * 有产出、无总览入口。换句话说：这个开关是「这份订阅不属于公开产品」的声明，
 * 不是让汇总页少列几行的**手写 ignore list**。
 */
function isPublicSpec(spec) {
  if (!spec) return false;
  return spec.hidden !== true && spec.internal !== true;
}

/** 必须是 public 的那些 spec（顺序保持注册表顺序） */
function publicSpecs(specs = []) {
  return (specs || []).filter(isPublicSpec);
}

/** 必须是 public 的那些 Feed（已构建的 feed 对象，顺序保持传入顺序） */
function publicFeeds(feedList = []) {
  return (feedList || []).filter(feed => isPublicSpec(feed && feed.spec));
}

/**
 * `/feeds/` 页面应当长什么样：**从注册表派生**（页面渲染层不写第二份清单）。
 *
 * @param {object[]} feedList 已构建的 feed 列表（只含**已生成**的那些）
 * @returns {{groups:object[], ungrouped:object[], listed:object[], publicCount:number}}
 */
function pageGroups(feedList = []) {
  const listed = publicFeeds(feedList);
  const groups = FEED_LIST_GROUPS.map(group => Object.assign({}, group, { feeds: [] }));
  const byKey = new Map(groups.map(group => [group.key, group]));
  const ungrouped = [];
  for (const feed of listed) {
    const group = byKey.get(feed.spec && feed.spec.listGroup);
    if (!group) { ungrouped.push(feed); continue; }
    group.feeds.push(feed);
  }
  return { groups, ungrouped, listed, publicCount: listed.length };
}

/**
 * `/feeds/` 与注册表的**双向对账**（唯一实现，纯函数：只吃字符串与数组）。
 *
 * 四个方向，缺一不可：
 *   ① 注册表 → 页面：每一份**已生成且 public** 的 Feed，两个地址（RSS + JSON）与标题都必须出现在页面上；
 *   ② 页面 → 注册表：页面上每一个站内订阅地址都必须指向注册表里某一份 public 的 Feed
 *      （「页面上多了一条没人认识的订阅」与「少了一条」同样是缺陷）；
 *   ③ hidden/internal **必须与「不生成」绑定**：一条 Feed 仍在生成（文件在、页面还在声明它）
 *      却不在汇总页上 —— 这正是 P3-4 的形态，直接报红，不给「手写 ignore list」留口子；
 *   ④ public 的 Feed 必须落进一个已知分组（`pageGroups().ungrouped` 为空）——
 *      否则它会从页面上静默消失，而 ①② 也会因为「页面真的没有它」而各自自洽。
 *
 * @param {object} params
 * @param {object[]} params.feedList 已构建的 feed 列表
 * @param {string}   params.page     `/feeds/index.html` 的文本
 * @param {string}   [params.siteUrl] 站根（默认本栈的 SITE_URL）
 * @returns {{problems:string[], publicCount:number, listedCount:number}}
 */
function checkFeedsPage({ feedList = [], page = '', siteUrl = SITE_URL } = {}) {
  const problems = [];
  const text = String(page || '');

  // 页面上的站内路由：绝对 URL 去掉站根；`../x` 相对路径按站根还原（/feeds/ 只深一层）
  const listedRoutes = new Set();
  for (const match of text.matchAll(/href="([^"]+)"/g)) {
    const href = match[1];
    if (href.startsWith(siteUrl)) listedRoutes.add(href.slice(siteUrl.length));
    else if (href.startsWith('../')) listedRoutes.add(href.slice(3));
  }

  const publicList = publicFeeds(feedList);
  const hiddenGenerated = (feedList || []).filter(feed => feed && feed.spec && !isPublicSpec(feed.spec));
  for (const feed of hiddenGenerated) {
    problems.push(`hidden/internal 的 Feed 仍在生成：${feed.spec.id}（隐藏不能当汇总页的 ignore list 用；`
      + '要么把它做成 public，要么让它真的不产出文件）');
  }

  const plan = pageGroups(feedList);
  for (const feed of plan.ungrouped) {
    problems.push(`public Feed 没有分组，会从 /feeds/ 上静默消失：${feed.spec.id}（在 FEED_LIST_GROUPS 里给它一个 listGroup）`);
  }

  for (const feed of publicList) {
    for (const rel of [feed.spec.path, feed.spec.jsonPath]) {
      if (!listedRoutes.has(rel)) problems.push(`注册表里的 public Feed 没有出现在 /feeds/：${feed.spec.id} → ${rel}`);
    }
    if (!text.includes(xmlEscape(feed.spec.title)) && !text.includes(feed.spec.title)) {
      problems.push(`/feeds/ 上没有列出 ${feed.spec.id} 的标题「${feed.spec.title}」`);
    }
  }

  const known = new Set();
  for (const feed of publicList) { known.add(feed.spec.path); known.add(feed.spec.jsonPath); }
  for (const rel of listedRoutes) {
    if (!/^feed.*\.(xml|json)$/.test(rel)) continue;          // 非 Feed 链接（分类页、对比页……）不参与
    if (!known.has(rel)) problems.push(`/feeds/ 上列出的订阅地址在注册表里没有对应的 public Feed：${rel}`);
  }

  return {
    problems,
    publicCount: publicList.length,
    listedCount: [...listedRoutes].filter(rel => /^feed.*\.(xml|json)$/.test(rel)).length
  };
}


/** 首页 `<head>` 上暴露哪四个订阅选择（其余集中放在 /feeds/ 页） */
const HOMEPAGE_FEED_IDS = ['all', 'changes', 'student', 'developer'];

/**
 * v3.0：变化类 Feed 的注册表 —— **多 spec，不是一条**。
 *
 * 每条 spec 声明：条目来自哪一份变化日志的视图（`changeSource`）、它属于哪个页面
 * （`pageKind` / `pageRoute`，`feedsForPage` 按这两个解析）、以及自己的空态措辞。
 *
 * 「谁属于这条 Feed」的判据、条目形状（guid / 时间 / 标签 / 正文）与序列化**只有一份实现**
 * （`changeItemsFor` 与下面的序列化函数）。**绝不另建 `feeds-api.js`** ——
 * 那会让两条变化 Feed 的 guid 规则、时间口径、空态措辞各自演化，
 * 而「两边看起来都对、只有一边悄悄漂了」是最难被任何断言发现的一种坏法。
 *
 * ## `alwaysGenerated` 与「三种事实」的关系
 *
 *   · `true`（Coding 套餐 v2.3 起、API 计费 v3.0 Stage H 起）—— **始终生成**。
 *     日志不可用时这份 Feed 会说「本次构建没有拿到日志」。空是事实，缺失也是事实，
 *     两种都要能读到。
 *   · `false`（保留给将来的来源）—— 只有调用方交出**变化视图**时才登记：
 *     在接线之前生成一份空 Feed，会把「这条链路还没接线」说成「没有观测到变化」，
 *     那是假话。这类被跳过的 spec 记在 `changeFeedsSkipped` 里，构建期可以断言它为空。
 *
 * 另外，**「没有交出视图」与「日志不可用」不能混为一谈**：前者等价于「这次构建没有
 * 拿到这份日志的数据」，所以按 `unavailable` 渲染（说「没有拿到日志」），
 * 而不是乐观地渲染成「还没有观测到变化」——后者是对读者的断言，而我们并没有看过。
 */
const PLAN_CHANGE_FEEDS = [
  {
    id: 'plan-changes',
    kind: 'plan-changes',
    changeSource: 'plans',
    path: 'feed/plans/coding/changes.xml',
    jsonPath: 'feed/plans/coding/changes.json',
    title: `${FEED_BRAND} · Coding 套餐变化`,
    description: 'AI Coding 套餐的价格、活动价、额度、模型与限制的变化。'
      + '数据来自本站重建套餐数据时的观测记录；每条变化都能在套餐对比页找到落点。',
    // 路由形状 `/feed/plans/coding/changes.*` 与页面路由 `/plans/coding/` 对齐；
    // API 那一份就是并列的一份（`/feed/plans/api/changes.*` ↔ `/plans/api/`）。
    pageKind: 'plans-coding',
    pageRoute: plansPage.PLANS_ROUTE,
    emptyNote: FEEDS_WORDING.FEEDS_NOTES.emptyPlanChanges,
    mayBeEmpty: true,
    homepage: false,
    alwaysGenerated: true,
    vendor: null,
    listGroup: 'plans'
  },
  {
    id: 'api-plan-changes',
    kind: 'plan-changes',
    changeSource: 'api',
    path: 'feed/plans/api/changes.xml',
    jsonPath: 'feed/plans/api/changes.json',
    title: `${FEED_BRAND} · API 价格变化`,
    description: 'AI 平台 API 的单价、计费单位、模型计价条目、免费额度、限速与 credits 的变化。'
      + '数据来自本站重建 API 计费数据时的观测记录；每条变化都能在 API 计费对比页找到落点。',
    pageKind: 'plans-api',
    pageRoute: apiPlansPage.API_PLANS_ROUTE,
    emptyNote: FEEDS_WORDING.FEEDS_NOTES.emptyApiPlanChanges,
    mayBeEmpty: true,
    homepage: false,
    // v3.0 Stage H：`build-local` 已经交出 API 变化视图（`changeViews.api`），
    // 因此这一条现在与套餐那条**同样始终生成** —— 日志不可用时它会说「没有拿到日志」，
    // 而不是把「没接线」说成「没有变化」。未交出视图时 `changeFeedsSkipped` 仍会如实记一笔。
    alwaysGenerated: true,
    vendor: null,
    listGroup: 'plans'
  }
];

/**
 * Coding 套餐变化源。v3.0 起它**是注册表里的第一条**，不再是唯一一条：
 * 新调用方请用 `changeFeedSpecOf('plans' | 'api')` 或 `changeSpecForPage(page)`，
 * 不要按 id 写死。这一别名保留是为了让尚未收敛的调用点（`/feeds/` 分组表等）
 * 在接线前后都能跑，接线由阶段 J 统一完成。
 */
const PLAN_CHANGE_FEED = PLAN_CHANGE_FEEDS.find(spec => spec.changeSource === 'plans');

/** 按 `changeSource`（`plans` / `api`）取变化 Feed 的 spec */
function changeFeedSpecOf(changeSource) {
  return PLAN_CHANGE_FEEDS.find(spec => spec.changeSource === changeSource) || null;
}

/**
 * 页面 → 专属 Feed 的映射（**由注册表派生**，不再手写第二份）。
 * 变化类页面没有 slug（只有一条固定路由），所以路由是主键。
 */
const PAGE_FEED_ROUTES = PLAN_CHANGE_FEEDS.map(spec => ({ route: spec.pageRoute, id: spec.id }));

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
 * 一个页面**自己**的订阅源（v1.7 起；v3.0 起变化类来源也走这里）。
 *
 * v1.6 里页面→Feed 只能靠调用方硬编码 spec id（`build-local.js` 早先就是
 * `byId.get('changes')` 这么写的），而「页面上忘了声明自己的 Feed」不会有任何东西变红。
 * 这个函数让「页面**有**哪份 Feed」与「页面**声明**哪份 Feed」都从注册表推导：
 *   · 变化类页面（`/plans/coding/`、`/plans/api/`）→ `PLAN_CHANGE_FEEDS` 里
 *     按 **`page.route` 或 `page.kind`** 命中它的那一条；
 *   · 分类页 / 按需求页 / 分类落地页 → COLLECTION_FEED_PAGES 里指向它的那一条；
 *   · 厂商页 → `vendor-<slug>`（由厂商注册表决定，存在与不存在都以 spec 为准）。
 *
 * @param {object} page `{ kind, slug, route }` —— 落地页 spec 的最小切片
 * @param {object[]} [feeds] 已构建的 feedBundle.feeds；省略时只按注册表推导（用于自检）
 */
function feedsForPage(page, feeds) {
  if (!page) return [];
  const changeSpec = changeSpecForPage(page);
  if (changeSpec) return resolveFeedRefs([{ id: changeSpec.id }], feeds);
  if (!page.slug) return [];
  const spec = page.kind === 'vendor'
    ? { id: `vendor-${page.slug}` }
    : (COLLECTION_FEED_PAGES.find(entry => entry.pageKind === page.kind && entry.pageSlug === page.slug) || null);
  return resolveFeedRefs(spec ? [{ id: spec.id }] : [], feeds);
}

/**
 * 变化类页面 → 它那份变化 Feed 的 spec（v3.0：按 `page.route` 优先、`page.kind` 兜底）。
 *
 * 为什么两个键都要认：`/plans/coding/` 与 `/plans/api/` 是**独立静态页**（没有 slug），
 * 调用方有时只拿得到路由（页脚深度扫描表），有时只拿得到 kind（SEO 描述符）。
 * 认两个键不会产生歧义 —— 每条 spec 的 `pageRoute` / `pageKind` 都互不相同。
 */
function changeSpecForPage(page) {
  if (!page) return null;
  if (page.route) {
    const byRoute = PLAN_CHANGE_FEEDS.find(spec => spec.pageRoute === page.route);
    if (byRoute) return byRoute;
  }
  if (page.kind) {
    const byKind = PLAN_CHANGE_FEEDS.find(spec => spec.pageKind === page.kind);
    if (byKind) return byKind;
  }
  return null;
}

/** 把 `{id}` 引用解析成真实的那一份 Feed（省略 `feeds` 时只做注册表推导） */
function resolveFeedRefs(refs, feeds) {
  if (!Array.isArray(feeds)) return refs.map(ref => ({ spec: { id: ref.id } }));
  return refs.map(ref => feeds.find(item => item.spec && item.spec.id === ref.id)).filter(Boolean);
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
 * @param {object}   [params.changeViews] 变化类来源的视图（见 `resolveChangeViews`）
 * @returns {{specs:object[], vendorSkipped:object[], vendorUnmapped:string[], changeFeedsSkipped:object[]}}
 */
function resolveSpecs({ deals = [], store = null, vendorSlugs = VENDOR_SLUGS, vendorKeyOf = null, changeViews = {} } = {}) {
  const specs = [];

  specs.push({
    id: 'all', kind: 'collection', path: ROOT_FEED.path, jsonPath: ROOT_FEED.jsonPath,
    title: ROOT_FEED.title, description: SITE_DESCRIPTION,
    homePageUrl: SITE_URL, pageRoute: '', predicate: null,
    mayBeEmpty: false, homepage: HOMEPAGE_FEED_IDS.includes('all'), vendor: null,
    listGroup: 'core'
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
      mayBeEmpty: false, homepage: HOMEPAGE_FEED_IDS.includes(entry.id), vendor: null,
      // 可见性从注册表条目原样带过来（默认 public）——见 `isPublicSpec` 与 `checkFeedsPage` 的 ③
      hidden: entry.hidden === true, internal: entry.internal === true,
      listGroup: entry.listGroup
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
    changeBucket: 'created', listGroup: 'core'
  });
  specs.push({
    id: 'changes', kind: 'changes', path: 'feed/changes.xml', jsonPath: 'feed/changes.json',
    title: `${FEED_BRAND} · 最近变化`,
    description: '本站观测到的优惠变化：优惠内容、领取条件、有效期与收录状态。',
    emptyNote: `${FEEDS_WORDING.FEEDS_NOTES.emptyChanges}`,
    homePageUrl: absolute('changes/'), pageRoute: 'changes/', predicate: null,
    mayBeEmpty: true, homepage: HOMEPAGE_FEED_IDS.includes('changes'), vendor: null,
    changeBucket: 'all', listGroup: 'core'
  });

  // v2.3 / v3.0：变化类 Feed（套餐 / API 计费）**从注册表来**，一条循环同时管两个来源。
  // 它与 deals 的两份变化源并排 —— 它订的是「套餐 / 计费记录本身变了什么」，
  // 而不是优惠的出现与消失。
  const changeFeedsSkipped = [];
  for (const changeSpec of PLAN_CHANGE_FEEDS) {
    const view = changeViews[changeSpec.changeSource] || null;
    if (!view && !changeSpec.alwaysGenerated) {
      // 未接线 ⇒ **不登记**（见 PLAN_CHANGE_FEEDS 的 `alwaysGenerated` 说明：
      // 生成一份空 Feed 会把「还没接线」说成「没有变化」，那是假话）。
      changeFeedsSkipped.push({ id: changeSpec.id, reason: 'no_change_view' });
      continue;
    }
    specs.push(Object.assign({}, changeSpec, {
      kind: 'plan-changes',
      homePageUrl: absolute(changeSpec.pageRoute)
    }));
  }

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
      slug, itemCount: items.length, listGroup: 'vendor'
    });
  }
  return { specs, vendorSkipped, vendorUnmapped, changeFeedsSkipped };
}

/* ------------------------------------------------------------------ */
/* 变化类来源的适配器（**领域差异只允许写在这里**）                       */
/* ------------------------------------------------------------------ */

/**
 * 两个变化来源的差异**全部**收拢在这张表里：
 *
 *   · 事件类型 / 结束原因的措辞表（各自的权威表在 `plan-history` / `api-plan-history`）；
 *   · 「变了什么」那句话的唯一出处（套餐走 `plans-page.planChangeTextOf`，
 *     API 走 `api-plans-page.apiPlanChangeTextOf` —— 都是**页面用的同一个函数**）；
 *   · 深链（套餐没有独立详情页，落到 `/plans/coding/#plan-<id>`；API 同理落 `/plans/api/`）；
 *   · 「记录已经不在数据里」时那句如实说明。
 *
 * 除此之外的一切 —— 排除 `updated` 元信息、只接受 12 位 hex 的派生事件身份、
 * 排序、标签、正文骨架、guid —— 都由 `changeItemsFor` 一份实现处理。
 */
const CHANGE_SOURCES = {
  plans: {
    key: 'plans',
    types: () => planHistoryLib.PLAN_HISTORY_WORDING.PLAN_HISTORY_TYPES,
    endReasons: () => planHistoryLib.PLAN_HISTORY_WORDING.PLAN_HISTORY_END_REASONS,
    disclaimer: () => planHistoryLib.PLAN_HISTORY_WORDING.PLAN_HISTORY_NOTES.disclaimer,
    tombstone: '（已移除的套餐，无标题快照）',
    detailOf: (entry, ctx) => plansPage.planChangeTextOf(entry, {
      plansById: ctx.recordsById,
      providerTable: ctx.providerTable
    }),
    linkOf: entry => `${plansPage.PLANS_ROUTE}#plan-${entry.planId}`
  },
  api: {
    key: 'api',
    types: () => apiPlanHistoryLib.API_PLAN_HISTORY_WORDING.API_PLAN_HISTORY_TYPES,
    endReasons: () => apiPlanHistoryLib.API_PLAN_HISTORY_WORDING.API_PLAN_HISTORY_END_REASONS,
    disclaimer: () => apiPlanHistoryLib.API_PLAN_HISTORY_WORDING.API_PLAN_HISTORY_NOTES.disclaimer,
    // 与 `/changes/` 的 API 分栏、`/plans/api/` 共用同一句话（唯一出处是日志的措辞表）。
    tombstone: apiPlanHistoryLib.API_PLAN_HISTORY_WORDING.API_PLAN_HISTORY_LABELS.tombstone,
    detailOf: entry => apiPlansPage.apiPlanChangeTextOf(entry),
    linkOf: entry => `${apiPlansPage.API_PLANS_ROUTE}#plan-${entry.planId}`
  }
};

/**
 * 变化条目的**唯一实现**（套餐 / API 两条 Feed 共用）。
 *
 * 与 deals 的变化条目同一个形状（guid / 时间 / 标签 / 正文），但身份来自**变化日志的派生事件
 * 身份**（`eventId`，12 位 hex）：因此「同一件事只有一个身份」这条保证在页面、日志与
 * 订阅源上是同一个东西。**这里不重算事件身份**，只接受日志里已经写好的那一个 ——
 * 订阅源重新算一遍就等于把「身份由数据决定」换成「身份由这段代码决定」。
 *
 * @param {object} spec   `PLAN_CHANGE_FEEDS` 里的一条
 * @param {object} params
 * @param {object} params.view   该来源的变化视图（`plan-changes.build*Radar` 的结果）
 * @param {object[]} params.records 当前记录（套餐 / API 计费）
 * @param {object} [params.providerTable]
 */
function changeItemsFor(spec, { view = null, records = [], providerTable = null } = {}) {
  const source = CHANGE_SOURCES[spec.changeSource];
  if (!source) throw new Error(`Feed ${spec.id}: 未知的变化来源 ${spec.changeSource}`);
  if (!view || view.availability !== 'ok') return [];
  const recordsById = new Map((records || []).map(record => [record && record.id, record]));
  const ctx = { recordsById, providerTable };
  const types = source.types();
  const endReasons = source.endReasons();
  const items = planChanges.itemsOf(view)
    .filter(entry => entry.type !== 'updated')            // 记录级元信息不进订阅（与页面同一条纪律）
    .filter(entry => typeof entry.eventId === 'string' && /^[0-9a-f]{12}$/.test(entry.eventId))
    .map(entry => {
      const route = source.linkOf(entry, ctx);
      const href = absolute(route);
      const name = entry.titled
        ? `${entry.vendor ? `${entry.vendor} · ` : ''}${entry.title}`
        : source.tombstone;
      const typeLabel = types[entry.type] || entry.type;
      const lines = [
        `${FEEDS_WORDING.FEEDS_LABELS.record}：${name}`,
        `变化：${typeLabel}`,
        source.detailOf(entry, ctx),
        `${FEEDS_WORDING.FEEDS_LABELS.time}：${entry.at}`
      ];
      if (entry.reason) lines.push(`${FEEDS_WORDING.FEEDS_LABELS.reason}：${endReasons[entry.reason] || entry.reason}`);
      lines.push(`${FEEDS_WORDING.FEEDS_LABELS.detail}：${href}`);
      if (entry.type === 'ended') lines.push(source.disclaimer());
      return {
        type: 'plan-change',
        id: entry.eventId,
        planId: entry.planId,
        eventType: entry.type,
        field: entry.field || null,
        at: entry.at,
        titled: Boolean(entry.titled),
        title: `${name} — ${typeLabel}`,
        link: href,
        route,
        externalUrl: null,
        vendor: entry.vendor || '',
        datePublished: entry.at,
        dateModified: entry.at,
        tags: [entry.vendor, typeLabel].filter(Boolean),
        text: lines.join('\n')
      };
    });
  items.sort((a, b) => {
    if (a.at !== b.at) return a.at < b.at ? 1 : -1;
    if (a.planId !== b.planId) return a.planId < b.planId ? -1 : 1;
    if ((a.eventType || '') !== (b.eventType || '')) return a.eventType < b.eventType ? -1 : 1;
    const af = a.field || '';
    const bf = b.field || '';
    return af < bf ? -1 : af > bf ? 1 : 0;
  });
  return items;
}

/** v2.3 兼容入口：Coding 套餐变化条目（等价于 `changeItemsFor(PLAN_CHANGE_FEED, …)`） */
function planChangeItems(spec, { planRadar = null, plans = [], providerTable = null } = {}) {
  return changeItemsFor(spec, { view: planRadar, records: plans, providerTable });
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

/** 变化类 Feed 的措辞表：按来源取（套餐 / API 计费各一份，**不共用句子**） */
function changeWordingOf(spec) {
  return spec.changeSource === 'api'
    ? planChanges.API_PLAN_CHANGES_WORDING.API_PLAN_CHANGES_LABELS
    : planChanges.PLAN_CHANGES_WORDING.PLAN_CHANGES_LABELS;
}

/** 变化类 Feed 对账的那份日志文件名（报错信息要指名道姓，不能说「日志」） */
function changeLogNameOf(spec) {
  return spec.changeSource === 'api' ? 'api-plan-history.json' : 'plan-history.json';
}

/* ------------------------------------------------------------------ */
/* 空态判据（唯一出处）：一行到底是不是「0 条」                          */
/* ------------------------------------------------------------------ */

/**
 * 这一行（一段页面文本）说的条数**是不是 0**。判据按**数字边界**，不是子串。
 *
 * 为什么必须按边界（t28 的 T28-F1 / t31）：`/0 条/` 是**子串**匹配，`10 条` / `20 条` / `30 条` /
 * `80 条` / `100 条` / `1,000 条` 全都命中 —— 于是"条数以 0 结尾的**非空**行"被当成空态，
 * 进而被要求写出「变更记录自 … 起」，门禁自己在真实数据上判红（数据一长大就暴露：
 * API 价格变化的条数变成 10 条的那一天起，这条断言就恒红）。
 *
 * 口径（**唯一出处**，页面断言与自测都读它，不许各自再写一份正则）：
 *   · `0 条` 前面**不能是数字**（`(?<!\d)`）——挡住 `10 条` / `100 条` / `1,000 条` 这类尾数 0；
 *   · `0 条` 后面**不能紧跟数字**——挡住 `0 条1` 这种粘连的脏文案。
 * 只判"有没有说 0 条"，不判其它数字（`28 条` 与 `9 条` 一样都是非空）。
 *
 * @param {string} text 一行（或一段）页面文本
 * @returns {boolean} true = 这一行声称 0 条（空态）
 */
const ZERO_COUNT_ROW_RE = /(?<!\d)0 条(?!\d)/;

function isZeroCountRow(text) {
  return ZERO_COUNT_ROW_RE.test(String(text === null || text === undefined ? '' : text));
}

/** 空态行必须写出的那句话：「变更记录自 YYYY-MM-DD 起」（起算日的形状是契约） */
const CHANGE_START_DATE_RE = /变更记录自 \d{4}-\d{2}-\d{2} 起/;

function hasChangeStartDate(text) {
  return CHANGE_START_DATE_RE.test(String(text === null || text === undefined ? '' : text));
}

/**
 * **空态诚实性**（`/feeds/` 那一行）：非空行不要求写起算日；**空态行必须写出起算日**。
 *
 * 这道牙存在的理由：变化流为空时，页面必须说清"我们是从哪一天开始记的"——
 * 只写「0 条」而不写起算日，读者分不清「真的没变化」与「我们刚开始记」。
 * t31 修的是**假红**（把非空行误判成空态），这条判据就是修完之后**必须保住的原意**。
 */
function changeRowIsHonest(text) {
  return isZeroCountRow(text) ? hasChangeStartDate(text) : true;
}

function descriptionWithNotes(spec, { truncated = 0, asOf = null, availability = 'ok', empty = false } = {}) {
  const parts = [spec.description];
  const isPlanChanges = spec.kind === 'plan-changes';
  if (spec.kind === 'changes' || isPlanChanges) {
    const labels = isPlanChanges ? changeWordingOf(spec) : CHANGES_LABELS;
    const unavailableNote = isPlanChanges ? labels.unavailable : CHANGES_NOTES.unavailable;
    if (availability !== 'ok') {
      // 「不可用」与「没有变化」是两句不同的话：日志缺失时说「没拿到日志」，
      // 绝不拿中性描述或空态措辞去冒充「没有变化」。
      parts.push(unavailableNote);
    } else if (empty && asOf) {
      parts.push(`${spec.emptyNote} ${labels.since.replace('{date}', historyStartedAt(spec, asOf))}`);
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
 * 把「变化类来源」的两套入参形状收敛成同一张表。
 *
 * 推荐形状（v3.0）：
 *   `changeViews = { plans: {radar, availability, records, providerTable}, api: {…} }`
 *
 * 兼容形状（v2.3 起的老参数，仍然可用）：`planRadar` / `planAvailability` / `plans` /
 * `providerTable`；`apiPlanRadar` / `apiPlanAvailability` / `apiPlans` / `apiProviderTable`。
 *
 * 为什么要有视图才登记 API 那条 Feed，见 `PLAN_CHANGE_FEEDS` 的 `alwaysGenerated`。
 */
function resolveChangeViews({
  changeViews = null,
  planRadar = null, planAvailability = 'ok', plans = [], providerTable = null,
  apiPlanRadar = null, apiPlanAvailability = 'ok', apiPlans = [], apiProviderTable = null
} = {}) {
  if (changeViews) return changeViews;
  const views = {
    plans: { radar: planRadar, availability: planAvailability, records: plans, providerTable }
  };
  if (apiPlanRadar) {
    views.api = {
      radar: apiPlanRadar,
      availability: apiPlanAvailability,
      records: apiPlans,
      providerTable: apiProviderTable || providerTable
    };
  }
  return views;
}

/**
 * 构建全部 Feed（纯函数：同样的入参一定产出逐字节相同的产物）。
 *
 * @param {object}   params
 * @param {object[]} params.deals     当前记录（只读）
 * @param {object}   [params.store]   `deal-history.json` 解析后的对象（只读）
 * @param {object}   [params.radar]   `changes.buildRadar()` 的结果（**同一份**，不重算）
 * @param {string}   params.asOf      基准日 `YYYY-MM-DD`（数据时间）
 * @param {string}   [params.updatedAt] `deals.json` 的 updatedAt（lastBuildDate 用，不取构建时刻）
 * @param {object}   [params.changeViews] 变化类来源的视图（见 `resolveChangeViews`）
 * @returns {{feeds:object[], stats:object, vendorSkipped:object[], vendorUnmapped:string[], changeFeedsSkipped:object[]}}
 */
function buildFeeds({
  deals = [], store = null, radar = null, asOf = null, updatedAt = null, availability = 'ok',
  vendorSlugs = VENDOR_SLUGS, vendorKeyOf = null,
  // v2.3 / v3.0：变化类来源。`planRadar` / `apiPlanRadar` 是 `plan-changes.js` 的视图，
  // `*Availability` 是对应日志的可用性。
  changeViews = null,
  planRadar = null, planAvailability = 'ok', plans = [], providerTable = null,
  apiPlanRadar = null, apiPlanAvailability = 'ok', apiPlans = [], apiProviderTable = null
} = {}) {
  const views = resolveChangeViews({
    changeViews,
    planRadar, planAvailability, plans, providerTable,
    apiPlanRadar, apiPlanAvailability, apiPlans, apiProviderTable
  });
  const resolved = resolveSpecs({ deals, store, vendorSlugs, vendorKeyOf, changeViews: views });
  const startedAt = store && typeof store.startedAt === 'string' ? store.startedAt : null;
  /** 某条变化 Feed 的起算日：**它自己那份日志**的 `startedAt`（绝不拿别人的顶上） */
  const changeStartedAtOf = spec => {
    const view = views[spec.changeSource] || null;
    const radar_ = view && view.radar ? view.radar : null;
    return radar_ && typeof radar_.startedAt === 'string' ? radar_.startedAt : null;
  };
  const specs = resolved.specs.map(spec => Object.assign({}, spec, {
    startedAt: spec.kind === 'changes' ? (startedAt || asOf)
      : (spec.kind === 'plan-changes' ? (changeStartedAtOf(spec) || asOf) : null)
  }));

  let truncatedTotal = 0;
  const feeds = specs.map(spec => {
    const view = views[spec.changeSource] || null;
    const all = spec.kind === 'changes'
      ? changeItems(spec, { deals, store, radar })
      : (spec.kind === 'plan-changes'
        ? changeItemsFor(spec, {
          view: view && view.radar ? view.radar : null,
          records: (view && view.records) || [],
          providerTable: view ? view.providerTable : null
        })
        : collectionItems(spec, { deals, store, asOf, vendorKeyOf }));
    const items = all.slice(0, LIMITS.itemsPerFeed);
    const truncated = Math.max(0, all.length - items.length);
    truncatedTotal += truncated;
    const description = descriptionWithNotes(spec, {
      truncated, asOf,
      // 变化类 Feed 的可用性**只认它自己那份视图**：
      //   · 视图对象存在 ⇒ 用调用方声明的 availability；
      //   · 视图对象不存在 ⇒ `unavailable`（这次构建没有这份日志的数据可报），
      //     绝不乐观地渲染成「还没有观测到变化」——那是对读者的断言，而我们并没有看过。
      availability: spec.kind === 'plan-changes'
        ? (view ? ((view.availability) || 'ok') : 'unavailable')
        : availability,
      empty: items.length === 0
    });
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
    vendorUnmapped: resolved.vendorUnmapped,
    changeFeedsSkipped: resolved.changeFeedsSkipped
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
  asOf = null, vendorSlugs = VENDOR_SLUGS, availability = 'ok', vendorKeyOf = null,
  // v2.3 / v3.0：变化类来源的对账材料。推荐形状是 `changeViews`（与 buildFeeds 同一张表），
  // 老的平铺参数仍然可用（`planEvents` = 产物那份 plan-history.json 的事件数组）。
  changeViews = null,
  planEvents = [], planAvailability = 'ok',
  apiPlanEvents = [], apiPlanAvailability = 'ok'
} = {}) {
  const problems = [];
  const warnings = [];
  const add = (code, feed, detail) => problems.push({ code, feed, detail });
  const keyOf = typeof vendorKeyOf === 'function' ? vendorKeyOf : (deal => String((deal && deal.vendor) || ''));

  /**
   * 变化类来源的对账材料：**每条 Feed 只拿它自己那份日志**。
   * 把两份日志合成一个集合会让「API 订阅里混进了套餐事件」这条最该报红的事静默通过。
   */
  const changeMaterialOf = spec => {
    if (changeViews) return changeViews[spec.changeSource] || {};
    return spec.changeSource === 'api'
      ? { events: apiPlanEvents, availability: apiPlanAvailability }
      : { events: planEvents, availability: planAvailability };
  };

  const byId = new Map(deals.map(deal => [deal && deal.id, deal]));
  const eventKeys = new Set(history.eventsOf(store).map(event => history.eventKey(event)));
  const allowedDates = new Set();
  for (const deal of deals) {
    if (deal && DATE_RE.test(String(deal.firstSeen || ''))) allowedDates.add(deal.firstSeen);
  }
  for (const event of history.eventsOf(store)) {
    if (event && DATE_RE.test(String(event.at || ''))) allowedDates.add(event.at);
  }
  // 两份变化日志的日期都要进来：API 变化条目的 `at` 只能来自 api-plan-history.json。
  for (const source of Object.keys(CHANGE_SOURCES)) {
    const material = changeViews ? (changeViews[source] || {}) : (source === 'api'
      ? { events: apiPlanEvents } : { events: planEvents });
    for (const event of material.events || []) {
      if (event && DATE_RE.test(String(event.at || ''))) allowedDates.add(event.at);
    }
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
      // 片段（`#plan-<id>`）指页面内的落点，不改变「哪一页」——所以按去掉片段的路由判存在性。
      // 锚点本身是否存在由构建期断言盯着（见 build-local 的套餐变化断言）。
      const route = String(item.link || '').slice(SITE_URL.length).split('#')[0];
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

    // ⑤′ 语义：变化类 Feed（套餐 / API 计费）必须对得上**它自己那份**变化日志
    //     （同一份判据，两份数据）。事件身份用日志自己的派生推导重算 ——
    //     `plan-history.eventIdOf` 与 `api-plan-history.apiPlanEventIdOf` 各自声明，feed 侧不猜。
    if (spec.kind === 'plan-changes') {
      const material = changeMaterialOf(spec);
      const source = CHANGE_SOURCES[spec.changeSource] || null;
      if (!source) {
        add('change-event-exists', label, `未知的变化来源 ${spec.changeSource}`);
      } else {
        const idOf = spec.changeSource === 'api'
          ? apiPlanHistoryLib.apiPlanEventIdOf
          : planHistoryLib.eventIdOf;
        const ids = new Set((material.events || []).map(event => idOf(event)));
        if (material.availability !== 'ok') {
          if (feed.items.length) add('change-event-exists', label, '变化日志不可用却仍有变化条目');
        }
        for (const item of feed.items) {
          if (!ids.has(item.id)) {
            add('change-event-exists', label, `${item.id} 在 ${changeLogNameOf(spec)} 里找不到对应事件`);
            continue;
          }
          if (item.eventType === 'updated') {
            add('change-high-value', label, `${item.id} 是记录级元信息（updated），不该进订阅`);
          }
        }
      }
    }
  }

  if (availability !== 'ok' && feeds.some(feed => feed.spec.kind === 'changes' && feed.items.length)) {
    warnings.push('历史日志不可用，变化 Feed 应为空');
  }
  for (const spec of PLAN_CHANGE_FEEDS) {
    const material = changeMaterialOf(spec);
    const exists = feeds.some(feed => feed.spec.id === spec.id && feed.items.length);
    if (material.availability !== 'ok' && exists) {
      warnings.push(`${changeLogNameOf(spec)} 不可用，${spec.title} 应为空`);
    }
  }
  return { problems, warnings };
}

/* ------------------------------------------------------------------ */
/* 报告 / 日志用摘要                                                     */
/* ------------------------------------------------------------------ */

function summarize(feeds) {
  const perKind = { collection: 0, changes: 0, 'plan-changes': 0 };
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
  PLAN_CHANGE_FEED,
  PLAN_CHANGE_FEEDS,
  changeFeedSpecOf,
  changeSpecForPage,
  changeWordingOf,
  changeLogNameOf,
  // t31：空态判据（唯一出处）—— 「这一行是不是 0 条」按数字边界判，不是子串
  ZERO_COUNT_ROW_RE,
  CHANGE_START_DATE_RE,
  isZeroCountRow,
  hasChangeStartDate,
  changeRowIsHonest,
  CHANGE_SOURCES,
  changeItemsFor,
  planChangeItems,
  resolveChangeViews,
  PAGE_FEED_ROUTES,
  rootFeedTags,
  LIMITS,
  VENDOR_THRESHOLDS,
  VENDOR_SLUGS,
  VENDOR_SLUGS_FILE,
  HIGH_VALUE_TYPES,
  HOMEPAGE_FEED_IDS,
  COLLECTION_FEED_PAGES,
  FEED_LIST_GROUPS,
  FEEDS_WORDING,
  // P3-4：可见性与 `/feeds/` 汇总页的双向对账（唯一实现，页面渲染层不再手写 id 清单）
  isPublicSpec,
  publicSpecs,
  publicFeeds,
  pageGroups,
  checkFeedsPage,
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
