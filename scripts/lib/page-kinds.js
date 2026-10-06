/**
 * 页面类型声明表（v3.0）—— 「路由 → kind / 正文下限 / ItemList 要求 / sitemap priority」的**唯一出处**。
 *
 * ## 为什么要有这个文件
 *
 * v2.x 之前，同一件事写在四个地方：
 *
 *   · `lib/seo.js` 的 `textFloor(kind, count)`      —— 正文下限；
 *   · `lib/seo.js` 的 ItemList 判定（`expectItemList` / 行数 / 成员）；
 *   · `tools/seo-verify.js` 的 `FIXED_KINDS`        —— 固定路由 → kind；
 *   · `tools/build-local.js` 的 `SITEMAP_PRIORITY`  —— 每类页面的 sitemap priority。
 *
 * 四处各写一份的直接后果是：**新增一个页面家族时，最容易被漏掉的那一处恰好是门禁最松的那一处**。
 * v3.0 要一次新增四个家族（`/plans/` `/models/` `/archive/` `/docs/data/`），
 * 因此把声明收成一份**纯数据**模块（不 require `fs`、不读 dist、不看时钟）：
 *
 *   · `lib/seo.js`（构建期规则层）读它的下限与 ItemList 默认值；
 *   · `tools/seo-verify.js`（独立门禁）读它的固定路由表与 ItemList 默认值。
 *
 * ⚠️ **两者仍然各自从 dist 解析页面**：这个文件只声明"这一页应该长成什么样"，
 * 不提供任何读取产物的能力。共享声明 ≠ 合并执行路径 —— 后者的价值在于
 * 「构建期知道自己写了什么」与「独立门禁只相信磁盘上真的有什么」是两个来源。
 *
 * ## 口径
 *
 *   · `textFloor(kind, count)` = `base + perItem × count`（count 的语义由调用方给：
 *     集合页是条目数，详情页是 1/0，枢纽页是子页数）。**既有 kind 的数值一个都没改**，
 *     新增 kind 才给新值 —— 下限只增不减（见 `docs/v3.0/STAGE-PLAN.md` 反作弊检查第 2 条）。
 *   · `itemList` 三个开关的含义与 `seo.validate()` 逐字对应：
 *       expect        集合页必须有 ItemList（详情页/状态页/订阅中心刻意没有）；
 *       checkRows     声明数 == 页面 `data-item`（枢纽页是 `data-child`）行数；
 *       checkMembers  成员必须属于本页可见行集合（只在"成员就是站内条目"的页面上成立）。
 *   · `sitemap` 的 priority/changefreq 是**声明**，不是排序实现细节：
 *     入口页 0.9、枢纽 0.8、详情叶子 0.7、工具页更低，理由逐条写在注释里。
 */

'use strict';

/** 正文下限的线性口径：`base + perItem × count` */
function floor(base, perItem = 0) {
  return { base, perItem };
}

/** 缺省下限（未知 kind）。与 v1.2 起的 `600 + 60×条目数` 逐字相同。 */
const DEFAULT_FLOOR = floor(600, 60);

/** 缺省 ItemList 要求（未知 kind 按集合页处理，与 v1.7 的 `expectItemList !== false` 同义） */
const DEFAULT_ITEM_LIST = { expect: true, checkRows: true, checkMembers: true, marker: 'item' };

/**
 * 布局族（Layout Family）——「这一页的正文该长成什么形状」的**唯一出处**。
 *
 * ## 为什么要有它
 *
 * v3.0 之前，同一件事（页面级说明 `.snote` 该多宽）在 8 个页面壳里各写了一份副本，
 * 而且分成两种取值：4 份 `max-width: 70ch`（12px 字体下 ≈420px 的窄柱，而主数据区是 1380px），
 * 4 份 `max-width: none`。**同一条规则 8 份副本、两种取值**正是这个文件要消灭的形态。
 * 布局族是那个「一处声明」：它说清楚每一类页面的正文该跟随谁；
 * 具体宽度收进 `index.html` 的共享 `<style>`（一处定义、全站生效，与 `.detail-main` 同一条纪律）。
 *
 * ## 三族的区别是「内容列的来源」，不是页面的重要程度
 *
 *   · `wide`   —— 数据型页面：页面级说明、表格、列表**同轴**，跟随站点数据容器（`.wrap`）。
 *                 说明是这一页的导语，不是一篇独立文章 ⇒ 不默认压成阅读列。
 *   · `detail` —— 单一实体详情：统一的居中内容列 `.detail-main`（1120px）。
 *   · `prose`  —— 真正的长文阅读列（居中且收窄）。**当前站点无实例**：保留这一族是为了让
 *                 「将来要加一个长文页」必须显式登记，而不是悄悄落进 `wide` 或 `detail`。
 *                 "无实例"这件事本身也登记在 `LAYOUT_FAMILIES_WITHOUT_INSTANCES` 里，可被机器反查。
 */
const LAYOUT_FAMILIES = {
  wide: { label: 'Wide Data Page', summary: '数据型页面：页面级说明、表格、列表同轴，跟随站点数据容器' },
  detail: { label: 'Leaf Detail Page', summary: '单一实体详情：统一的居中内容列（.detail-main）' },
  prose: { label: 'Prose Page', summary: '真正的长文阅读列（居中且收窄）；当前站点无实例' }
};

/**
 * 每个 kind 的声明。**顺序即报告的书写顺序**（集合页在前，v3.0 新家族在后）。
 *
 * `label` 只用于报告与报错信息，不参与页面渲染。
 */
const KIND_TABLE = {
  home: {
    label: '首页',
    layout: 'wide',
    textFloor: floor(3000),
    // 首页的 ListItem 指向**官方页面**（v0.9 起的设计），而可见卡片是折叠卡
    // （一张卡可能覆盖多条优惠）—— 行数与成员对账在首页都不成立，由首页自己的断言守着。
    itemList: { expect: true, checkRows: false, checkMembers: false, marker: 'item' },
    sitemap: { priority: '1.0', changefreq: 'daily' }
  },
  collection: {
    label: '专题集合页',
    layout: 'wide',
    textFloor: DEFAULT_FLOOR,
    itemList: DEFAULT_ITEM_LIST,
    sitemap: { priority: '0.9', changefreq: 'weekly' }
  },
  need: {
    label: '按需求页',
    layout: 'wide',
    textFloor: DEFAULT_FLOOR,
    itemList: DEFAULT_ITEM_LIST,
    sitemap: { priority: '0.9', changefreq: 'weekly' }
  },
  category: {
    label: '分类页',
    layout: 'wide',
    textFloor: DEFAULT_FLOOR,
    itemList: DEFAULT_ITEM_LIST,
    sitemap: { priority: '0.9', changefreq: 'weekly' }
  },
  vendor: {
    label: '厂商页',
    layout: 'wide',
    textFloor: DEFAULT_FLOOR,
    itemList: DEFAULT_ITEM_LIST,
    sitemap: { priority: '0.8', changefreq: 'weekly' }
  },
  hub: {
    label: '目录枢纽页',
    layout: 'wide',
    // 枢纽页的正文比集合页短（只有导语与子页链接），因此 base 从 500 起（v1.7 起的口径）。
    textFloor: floor(500, 60),
    itemList: { expect: true, checkRows: true, checkMembers: true, marker: 'child' },
    sitemap: { priority: '0.8', changefreq: 'weekly' }
  },
  deal: {
    label: '优惠详情页',
    layout: 'detail',
    // 详情页只讲一条优惠：下限固定（不随条目数变），与 v1.7 相同。
    textFloor: floor(500),
    itemList: { expect: false, checkRows: true, checkMembers: true, marker: 'item' },
    sitemap: { priority: '0.7', changefreq: 'weekly' }
  },
  status: {
    label: '状态页',
    layout: 'wide',
    textFloor: floor(600),
    itemList: { expect: false, checkRows: true, checkMembers: true, marker: 'item' },
    sitemap: { priority: '0.3', changefreq: 'daily' }
  },
  changes: {
    label: '变化页',
    layout: 'wide',
    textFloor: floor(600),
    // 成员集合的**权威判据在构建期的 `lib/changes.js`（`itemListRecords()`）**：
    // 一个记录只出现一次（取最强事件）、不可链接的条目不入列表。
    // 独立门禁（`seo-verify.js`）只读产物，**不复制这份雷达判据**——所以这里不做成员归属对账，
    // 改由三条产物内自洽断言守着：成员按 id 唯一 / 每个成员的 URL 在 dist 里存在 /
    // 声明数 == 元素数 == 页面 `data-item` 行数。构建期另有三方对账（见 build-local 自检）。
    itemList: { expect: true, checkRows: true, checkMembers: false, marker: 'item' },
    sitemap: { priority: '0.8', changefreq: 'daily' }
  },
  feeds: {
    label: '订阅中心',
    layout: 'wide',
    textFloor: floor(600),
    itemList: { expect: false, checkRows: true, checkMembers: true, marker: 'item' },
    sitemap: { priority: '0.6', changefreq: 'weekly' }
  },
  plans: {
    label: '套餐 / API 计费对比页',
    layout: 'wide',
    // 与集合页同一条口径：表体空掉必然低于下限。口径文案本身就有一百多字，所以从 600 起步。
    textFloor: floor(600, 60),
    // ItemList 指向**各自的官方定价页**（本站不为每个套餐/模型编详情页），
    // 因此成员对账不适用 —— 行数与在场性照常查。
    itemList: { expect: true, checkRows: true, checkMembers: false, marker: 'item' },
    sitemap: { priority: '0.9', changefreq: 'weekly' }
  },
  // v2.4 的别名页：noindex，不进 sitemap（priority 保留声明，但 `noindex` 页面不写进去）。
  alias: {
    label: '别名页',
    layout: 'wide',
    textFloor: DEFAULT_FLOOR,
    itemList: DEFAULT_ITEM_LIST,
    sitemap: { priority: '0.0', changefreq: 'yearly', indexable: false }
  },

  /* ---------------- v3.0 新家族 ---------------- */

  // Stage B：/plans/ 统一资料入口。四个区块（Coding 统计 / API 统计 / 最近变化 / 当前相关优惠），
  // 是"资料入口"而不是第三张表，因此正常的正文量比集合页还大一点。
  'plans-hub': {
    label: '套餐资料枢纽',
    layout: 'wide',
    textFloor: floor(700, 60),
    // 与 hub 同一套：两个入口区块各带一个 `data-child`，ItemList 与它们逐个对账。
    // 成员归属关掉：ItemList 指向**子页**，而 `seo.js` 的成员判据从 `childRoutes` 取 ——
    // 枢纽页由页面自己的 `assertPageHonesty` 对账（它同时知道子页集合）。
    itemList: { expect: true, checkRows: true, checkMembers: false, marker: 'child' },
    sitemap: { priority: '0.9', changefreq: 'weekly' }
  },
  // Stage D5：/models/ 模型资料索引。一行 = 一个 registry entry。
  'models-index': {
    label: '模型资料索引',
    layout: 'wide',
    textFloor: floor(600, 60),
    // ItemList 成员是本站的模型详情页 —— 但成员对账由 `assertPageHonesty` 自己做
    // （seo.js 的成员判据按 `deal/<id>/` 判，模型页上必然对不上，因此这里关掉）。
    itemList: { expect: true, checkRows: true, checkMembers: false, marker: 'item' },
    sitemap: { priority: '0.9', changefreq: 'weekly' }
  },
  // Stage D6：/models/<slug>/ 模型详情页。详情叶子，与 deal 详情页同级。
  model: {
    label: '模型详情页',
    layout: 'detail',
    textFloor: floor(700),
    itemList: { expect: false, checkRows: true, checkMembers: false, marker: 'item' },
    sitemap: { priority: '0.7', changefreq: 'weekly' }
  },
  // Stage F：/archive/ 历史档案索引。它回答"哪些资料结束了"，是入口级页面但内容随历史增长。
  'archive-index': {
    label: '历史档案索引',
    layout: 'wide',
    textFloor: floor(600, 60),
    itemList: { expect: true, checkRows: true, checkMembers: false, marker: 'item' },
    sitemap: { priority: '0.8', changefreq: 'weekly' }
  },
  // Stage F3：/archive/<kind>/<id>/ 历史详情。只给**有独立资料价值**的实体生成（门槛见 §4），
  // 因此它比变化页更低（0.6）：它是"追溯用的页面"，不是搜索入口。
  'archive-detail': {
    label: '历史档案详情',
    layout: 'detail',
    textFloor: floor(600),
    itemList: { expect: false, checkRows: true, checkMembers: false, marker: 'item' },
    sitemap: { priority: '0.6', changefreq: 'monthly' }
  },
  // Stage G：/docs/data/ 数据出口文档。六个必需段落（索引 / 文档 / 示例 / 引用 / Schema 稳定性 / License），
  // 光段落文案就远超 1200 字，因此下限从 1200 起步而不是 600。
  'data-docs': {
    label: '数据文档',
    layout: 'wide',
    textFloor: floor(1200),
    // Dataset Index 一张表 = 一份数据一行，因此它在场、行数要查；成员是静态 JSON 文件，不是站内条目。
    itemList: { expect: true, checkRows: true, checkMembers: false, marker: 'item' },
    sitemap: { priority: '0.6', changefreq: 'weekly' }
  }
};

/**
 * 固定路由 → kind。**构建期与独立门禁共用这一张**（原 `seo-verify.js` 的 `FIXED_KINDS`
 * 与 `build-local.js` 的逐页 `readPage(..., { kind })` 都从这里取，不再各写一份）。
 *
 * 只登记**路由字符串可以直接判定**的那些页：目录页家族的 kind 随数据（`spec.kind`）走，
 * 因此不在这里 —— 硬塞进来会变成一张"看起来统一、实际只有一半是真的"的表。
 */
const FIXED_ROUTE_KINDS = {
  '': 'home',
  'status/': 'status',
  'changes/': 'changes',
  'feeds/': 'feeds',
  'plans/': 'plans-hub',
  'plans/coding/': 'plans',
  'plans/api/': 'plans',
  'models/': 'models-index',
  'archive/': 'archive-index',
  'docs/data/': 'data-docs'
};

/**
 * 动态路由模式 → kind（按顺序匹配，先具体后一般）。
 * 用途与 `FIXED_ROUTE_KINDS` 相同：**声明这一条 URL 属于哪个家族**，
 * 而不是让每个调用方各自 `startsWith('models/')`。
 */
const ROUTE_PATTERNS = [
  { re: /^deal\/[^/]+\/$/, kind: 'deal' },
  { re: /^vendor\/[^/]+\/$/, kind: 'vendor' },
  { re: /^category\/[^/]+\/$/, kind: 'category' },
  { re: /^need\/[^/]+\/$/, kind: 'need' },
  { re: /^models\/[^/]+\/$/, kind: 'model' },
  { re: /^archive\/[^/]+\/[^/]+\/$/, kind: 'archive-detail' }
];

/** 目录 URL 归一：带尾斜杠（首页是空串），与 canonical / sitemap / 站内链接同一口径。 */
function normalizeRoute(route) {
  const text = String(route === null || route === undefined ? '' : route);
  if (text === '' || text === '/') return '';
  return text.endsWith('/') ? text : `${text}/`;
}

/**
 * 路由 → kind。**判不出来返回 null**（调用方必须显式处置，而不是回落成"默认集合页"）。
 * 目录页家族（collection）随数据走，因此不在这里猜。
 */
function kindOfRoute(route) {
  const normalized = normalizeRoute(route);
  if (Object.prototype.hasOwnProperty.call(FIXED_ROUTE_KINDS, normalized)) {
    return FIXED_ROUTE_KINDS[normalized];
  }
  for (const pattern of ROUTE_PATTERNS) {
    if (pattern.re.test(normalized)) return pattern.kind;
  }
  return null;
}

/** kind 是否已声明 */
function hasKind(kind) {
  return Object.prototype.hasOwnProperty.call(KIND_TABLE, kind);
}

function kindOf(kind) {
  return hasKind(kind) ? KIND_TABLE[kind] : null;
}

/**
 * 正文下限。**未知 kind 走缺省**（`600 + 60×count`）—— 与 v1.2 起的口径逐字相同，
 * 因此把公式搬到这里不会改变任何既有页面的判定。
 */
function textFloor(kind, itemCount) {
  const n = Number(itemCount) || 0;
  const spec = kindOf(kind);
  const rule = (spec && spec.textFloor) || DEFAULT_FLOOR;
  return rule.base + rule.perItem * n;
}

/** ItemList 要求（`seo.validate()` 与 `seo-verify.js` 都读它） */
function itemListRule(kind) {
  const spec = kindOf(kind);
  return (spec && spec.itemList) || DEFAULT_ITEM_LIST;
}

/** sitemap 声明（priority / changefreq / 是否可索引） */
function sitemapMeta(kind) {
  const spec = kindOf(kind);
  return (spec && spec.sitemap) || { priority: '0.8', changefreq: 'weekly', indexable: true };
}

/** 全部已声明 kind（顺序即书写顺序） */
function allKinds() {
  return Object.keys(KIND_TABLE);
}

/**
 * kind → 布局族。**未声明返回 null**，不回落成某个"默认族"。
 *
 * 与 `kindOfRoute()` 同一条口径：判不出来就是 `null`，调用方必须显式处置。
 * 回落成 `wide` 会让"新页面家族忘了登记"变成静默的默认值 —— 而那正是本文件存在的理由。
 */
function layoutOf(kind) {
  const spec = kindOf(kind);
  const layout = spec ? spec.layout : null;
  return typeof layout === 'string' && layout ? layout : null;
}

/**
 * 明确登记「当前站点**没有实例**」的布局族（无实例是设计，不是遗漏）。
 *
 * 为什么要单独一个集合，而不是让孤儿族检查对 `prose` 网开一面：
 * 「没有实例」是一个**要写下来、可被机器核对**的事实 —— 写成常量之后，
 * ① 新加一个没人用的族仍然会红；② 这个集合本身也会被反查（见 `assertLayoutDeclarations()`
 * 的第 ③ 步）：哪天 `prose` 真有了实例，这里的登记就过期了，同样要红。
 * 而"悄悄跳过某个族"的豁免名单做不到这两件事。
 */
const LAYOUT_FAMILIES_WITHOUT_INSTANCES = new Set(['prose']);

/**
 * 布局族声明自洽性检查（门禁用）。**返回问题字符串数组，空数组 = 全过**。
 *
 * 三件事（三个方向都要，缺一个就会出现"看起来在守着什么"的假牙）：
 *   ① 每个 kind 都必须有 `layout` —— 新页面家族不许"不声明"就存在；
 *   ② 声明的值必须落在 `LAYOUT_FAMILIES` 里 —— 拼错一个字母不许静默通过（正向引用完整性）；
 *   ③ 族与实例之间不许有第三种状态（反向完整性）：
 *      · 没有实例、也没登记在 `LAYOUT_FAMILIES_WITHOUT_INSTANCES` 里 ⇒ 孤儿族；
 *      · 登记成"无实例"却真的有实例 ⇒ 登记过期（`prose` 被启用时必须同步删掉那条登记）。
 *
 * 这里**只读声明、不碰产物**：布局宽度在 `index.html` 的共享 `<style>` 里，
 * 由独立门禁（浏览器套件 / 产物 grep）去核对，本函数不做那件事。
 */
function assertLayoutDeclarations() {
  const problems = [];
  const used = new Set();
  const known = Object.keys(LAYOUT_FAMILIES);
  for (const kind of allKinds()) {
    const spec = KIND_TABLE[kind];
    if (!Object.prototype.hasOwnProperty.call(spec, 'layout')) {
      problems.push(`kind「${kind}」没有声明 layout —— 新页面家族必须显式登记布局族（不许默认落进 wide）`);
      continue;
    }
    const layout = spec.layout;
    if (!Object.prototype.hasOwnProperty.call(LAYOUT_FAMILIES, layout)) {
      problems.push(`kind「${kind}」的 layout「${layout}」不在 LAYOUT_FAMILIES 里（合法值：${known.join(' / ')}）`);
      continue;
    }
    used.add(layout);
  }
  for (const family of known) {
    const instanceLess = LAYOUT_FAMILIES_WITHOUT_INSTANCES.has(family);
    if (used.has(family) && instanceLess) {
      problems.push(`布局族「${family}」被登记为"当前站点无实例"，但已经有 kind 在使用它 —— 那条登记过期了，请同步删掉（无实例是事实，不是永久豁免）`);
      continue;
    }
    if (!used.has(family) && !instanceLess) {
      problems.push(`布局族「${family}」（${LAYOUT_FAMILIES[family].label}）没有任何 kind 使用 —— 孤儿族：要么登记实例，要么删掉声明（确实无实例的族请登记进 LAYOUT_FAMILIES_WITHOUT_INSTANCES）`);
    }
  }
  for (const family of LAYOUT_FAMILIES_WITHOUT_INSTANCES) {
    if (!Object.prototype.hasOwnProperty.call(LAYOUT_FAMILIES, family)) {
      problems.push(`LAYOUT_FAMILIES_WITHOUT_INSTANCES 里的「${family}」不是已定义的布局族 —— 无实例登记必须指向一个真实存在的族`);
    }
  }
  return problems;
}

/**
 * 路由集合 → 未声明 kind 的清单（门禁用：**新页面家族必须显式登记**）。
 *
 * 目录页家族（collection / hub 的动态实例）的 kind 随数据走，因此调用方必须通过
 * `kindByRoute` 把它们自己的 kind 交进来 —— 传不进来就会被判成"未声明"，
 * 这正是这条审计要达到的效果：**不要用 `startsWith` 悄悄绕过声明表**。
 *
 * @param {string[]} routes 站根相对路由（带尾斜杠）
 * @param {Map<string,string>|object} [kindByRoute] 调用方自有的 route → kind
 * @returns {string[]} 没有声明可依的路由
 */
function auditRouteKinds(routes, kindByRoute = null) {
  const extra = kindByRoute instanceof Map ? kindByRoute
    : new Map(Object.entries(kindByRoute || {}));
  const out = [];
  for (const route of routes || []) {
    const normalized = normalizeRoute(route);
    const kind = kindOfRoute(normalized) || extra.get(normalized) || null;
    if (!kind) out.push(normalized);
  }
  return out;
}

module.exports = {
  KIND_TABLE,
  LAYOUT_FAMILIES,
  LAYOUT_FAMILIES_WITHOUT_INSTANCES,
  FIXED_ROUTE_KINDS,
  ROUTE_PATTERNS,
  DEFAULT_FLOOR,
  DEFAULT_ITEM_LIST,
  normalizeRoute,
  kindOfRoute,
  hasKind,
  kindOf,
  layoutOf,
  assertLayoutDeclarations,
  textFloor,
  itemListRule,
  sitemapMeta,
  allKinds,
  auditRouteKinds
};
