/**
 * 路由级「这一页要不要统计」声明（private-analytics-v1）。
 *
 * ## 为什么单独一份，而不并进 `lib/page-kinds.js`
 *
 * `page-kinds.js` 回答的是**另一件事**：这一页该长成什么样（正文下限 / ItemList 要求 /
 * sitemap priority）。把「要不要统计」塞进去，会让两份判据在同一个表里互相污染 ——
 * 将来有人为了让某个 kind 不进 sitemap 而改动那张表时，会顺手动到统计范围。
 * 这一份只声明**可见性**，且它的失效方式与 page-kinds 完全不同（见下）。
 *
 * ## 第一版口径：**本站发布的 HTML 页面，全部统计**
 *
 * 理由（P1 §8）：本轮的用途是回答「有没有人在用 / 哪些页面有人看 / 用户从哪来」。
 * 因此：
 *   · `/` 与全部内容页都统计（否则 Top Pages / Referrers 会被截断成半张图）；
 *   · **noindex 别名页照样统计** —— 别名页的价值恰恰在于「旧链接还有没有人在点」，
 *     不统计就等于把最需要诊断的那一类访问丢掉；
 *   · 将来的 404 页同样统计（坏链流量对维护者有诊断价值）。
 *
 * 明确**不**统计的东西（它们在产物里根本不存在，但口径要写下来）：
 * test fixtures、source templates、research artifacts、screenshots、local-only HTML、
 * 临时 QA 页面、worktree 产物。
 *
 * ## 失效方式与门禁
 *
 * 这一份声明最容易出的错是「将来新增了一个页面族，忘了登记」——症状是**那一族零统计**，
 * 而构建、SEO、sitemap、订阅全部照常绿。所以 `tools/analytics-selftest.js` 里有一条
 * **fail-closed** 的扫描：`dist/**` 里每一个真页面（目录式 index.html）都必须能被下面
 * 的模式表判出来，判不出来就报红。也就是说「漏登记」这件事本身会红。
 */

'use strict';

/**
 * 有序规则表：**先具体后一般**（第一个命中的规则说了算）。
 *
 * `kind` 只用于报告与报错信息，不参与渲染；`why` 是这条规则的**理由**，
 * 报告里会逐条带出来 —— 一份说不出理由的统计范围，等于一个没人敢改的开关。
 */
const ROUTE_RULES = [
  {
    re: /^$/,
    trackable: true,
    kind: 'home',
    why: '首页：回答「有没有人在用」最直接的一页'
  },
  {
    re: /^deal\/[^/]+\/$/,
    trackable: true,
    kind: 'deal',
    why: '优惠详情页：Top Pages 的主体，也是「哪些优惠真的有人看」的证据来源'
  },
  {
    re: /^models\/[^/]+\/$/,
    trackable: true,
    kind: 'model',
    why: '模型详情页：判断「该优先继续建设哪个资料域」的直接依据'
  },
  {
    re: /^archive\/[^/]+\/[^/]+\/$/,
    trackable: true,
    kind: 'archive-detail',
    why: '历史档案详情：追溯用页面，访问量本身就是「哪些资料还有人关心」的证据'
  },
  {
    re: /^models\/$/,
    trackable: true,
    kind: 'models-index',
    why: '模型资料索引：资料域的入口，与详情页分开看才能判断入口/叶子谁有问题'
  },
  {
    re: /^plans\/(?:coding|api)\/$/,
    trackable: true,
    kind: 'plans',
    why: '套餐 / API 计费对比页：P1 §21 指定的验收页之一'
  },
  {
    re: /^plans\/$/,
    trackable: true,
    kind: 'plans-hub',
    why: '套餐资料枢纽：两条对比页的父级入口'
  },
  {
    re: /^archive\/$/,
    trackable: true,
    kind: 'archive-index',
    why: '历史档案索引'
  },
  {
    re: /^docs\/data\/$/,
    trackable: true,
    kind: 'data-docs',
    why: '数据出口文档：回答「这些开放数据有没有人真的在用」'
  },
  {
    re: /^(?:student|developer|free-api)\/$/,
    trackable: true,
    kind: 'collection',
    why: '三个专题集合页：按需求/人群的最主要入口'
  },
  {
    re: /^need\/[^/]+\/$/,
    trackable: true,
    kind: 'need',
    why: '按需求页（含 noindex 别名页）：别名页统计的是「旧链接还有没有人在点」'
  },
  {
    re: /^category\/[^/]+\/$/,
    trackable: true,
    kind: 'category',
    why: '分类落地页：筛出来的那一批条目值不值得继续收录'
  },
  {
    re: /^vendor\/[^/]+\/$/,
    trackable: true,
    kind: 'vendor',
    why: '厂商页：判断哪家厂商的资料最值得继续补'
  },
  {
    re: /^(?:category|vendor)\/$/,
    trackable: true,
    kind: 'hub',
    why: '两个目录枢纽页：入口密度是否够用的直接证据'
  },
  {
    re: /^status\/$/,
    trackable: true,
    kind: 'status',
    why: '数据源状态页：维护者自己在看，它的访问量说明「这一页有没有被外部人用到」'
  },
  {
    re: /^changes\/$/,
    trackable: true,
    kind: 'changes',
    why: '变化雷达页：判断版本发布前后趋势变化时的关键观察点'
  },
  {
    re: /^feeds\/$/,
    trackable: true,
    kind: 'feeds',
    why: '订阅中心：回答「订阅这件事有没有人真的在找」'
  }
];

/**
 * 产物里**非页面**的目录前缀（防御用）。
 *
 * 它们按设计只放静态资产与数据，不该出现 `.html`；真要出现了，说明有人往这些目录里
 * 塞了页面 —— 那种页面既不会被声明表判出来，也没有经过共享页脚，应当直接判红。
 */
const NON_PAGE_DIR_PREFIXES = ['data/', 'feed/', 'logos/'];

/** 路由归一：站根相对、带尾斜杠（首页是空串）——与 canonical / sitemap 同一口径。 */
function normalizeRoute(route) {
  const text = String(route === null || route === undefined ? '' : route).replace(/^\/+/, '');
  if (text === '' || text === '/') return '';
  return text.endsWith('/') ? text : `${text}/`;
}

/**
 * 产物内路径 → 路由（目录式页面）。
 * 只接受 `index.html`：非目录式的 `.html`（例如 `x.html`）在这里返回 null，
 * 由调用方当成「判不出来」处理（fail-closed），不当成首页或某一族。
 */
function routeFromArtifactPath(rel) {
  const text = String(rel === null || rel === undefined ? '' : rel).replace(/\\/g, '/').replace(/^\.?\//, '');
  if (text === 'index.html') return '';
  if (!text.endsWith('/index.html')) return null;
  return normalizeRoute(text.slice(0, -'/index.html'.length));
}

/**
 * 路由 → 是否统计。**判不出来返回 trackable:false + kind:'unknown'**，
 * 而调用方（构建期与 selftest）必须把 `unknown` 当成**问题**而不是「默认不统计」：
 * 静默不统计正是这一层最危险的失效方式。
 */
function classifyRoute(route) {
  const normalized = normalizeRoute(route);
  for (const rule of ROUTE_RULES) {
    if (rule.re.test(normalized)) {
      return {
        route: normalized,
        trackable: rule.trackable === true,
        kind: rule.kind,
        why: rule.why,
        known: true
      };
    }
  }
  return {
    route: normalized,
    trackable: false,
    kind: 'unknown',
    why: '没有任何一条规则声明过这个路由 —— 新增页面族必须在这里登记（漏登记会让那一族零统计却全绿）',
    known: false
  };
}

/** 遍历用的只读视图（报告里按 kind 打印统计范围的唯一入口）。 */
function allRules() {
  return ROUTE_RULES.map(rule => ({ pattern: String(rule.re), trackable: rule.trackable === true, kind: rule.kind, why: rule.why }));
}

/** 模式表覆盖自检：确认每条规则都带理由与 kind（防「加一条规则只写了正则」）。 */
function assertRouteTableShape() {
  const problems = [];
  const seen = new Set();
  for (const rule of ROUTE_RULES) {
    if (!(rule.re instanceof RegExp)) problems.push(`规则 ${rule.kind || '(无 kind)'} 的 re 不是 RegExp`);
    if (!rule.kind) problems.push(`规则 ${String(rule.re)} 缺少 kind`);
    if (!rule.why) problems.push(`规则 ${rule.kind} 缺少 why（一份说不出理由的统计范围没人敢改）`);
    if (rule.trackable !== true && rule.trackable !== false) problems.push(`规则 ${rule.kind} 的 trackable 必须是布尔`);
    if (rule.kind && seen.has(rule.kind)) problems.push(`kind「${rule.kind}」重复（报告里会分不清是哪一族）`);
    seen.add(rule.kind);
  }
  if (!ROUTE_RULES.length) problems.push('ROUTE_RULES 是空的');
  return { ok: problems.length === 0, problems };
}

module.exports = {
  ROUTE_RULES,
  NON_PAGE_DIR_PREFIXES,
  normalizeRoute,
  routeFromArtifactPath,
  classifyRoute,
  allRules,
  assertRouteTableShape
};
