/**
 * 私有站点分析（private-analytics-v1）—— **唯一事实来源**。
 *
 * 本轮的目标只有一个：让维护者能在 Cloudflare Dashboard 里私下看到本站的真实访问情况，
 * 而**不**把 Analytics 数据公开给访客、**不**让数据进入仓库、**不**让本地测试污染真实访问。
 * 设计边界与理由全文见 `docs/PRIVATE-ANALYTICS-v1.md`；这里只写实现约束。
 *
 * ## 为什么是「一份文件 + 一个标记区块」
 *
 * 本轮要求「Beacon 的定义只有一处」。这份文件同时被三个地方使用，而且必须是**同一份字节**：
 *
 *   ① 构建期（`build-local.js` → `inject()`）：把 bootstrap 内联进每个发布 HTML；
 *   ② 独立门禁（`tools/analytics-selftest.js`）：把 guard 源码放进 `vm` 沙箱跑真值表；
 *   ③ 浏览器：最终跑在页面里的就是 ① 内联进去的那段文本。
 *
 * 「Production Guard 判据不许浏览器一份、构建器一份、selftest 再写一份」这条要求，
 * 就是靠下面 `ANALYTICS-GUARD:START/END` 标记区块落实的：`guardSource()` 返回该区块的
 * **逐字文本**，任何人想再写第二份判据，都必须先删掉这个标记 —— 而 selftest 会因此报红。
 *
 * ## 浏览器安全契约（改这个文件前先读）
 *
 * 标记区块内的代码会被**原样内联**到 `<script>` 里，因此区块内：
 *   · 不许出现 `module` / `require` / `process` / `__dirname` / `fs` / `path`（构建期会硬失败）；
 *   · 不许读 `document` / `window` 之外的宿主对象；不许读墙上时钟、不许发网络请求、不许随机数；
 *   · 只允许 ES5 语法（与站内既有内联脚本同一口径，避免转译层缺席时的意外）。
 *
 * ## 本模块明确不做的事（与 P1 的红线逐条对应）
 *
 *   · 不建访客身份：不写 cookie / localStorage / sessionStorage / IndexedDB，不生成 UUID、
 *     不做指纹、不算 IP hash —— 统计口径完全交给 Cloudflare（官方 RUM 文档也明确不使用浏览器存储）；
 *   · 不做自定义事件、不做 scroll depth / 停留时间 / 点击追踪；
 *   · 不调 Cloudflare Analytics API、不需要任何账户凭据（见下面的 Token 边界）；
 *   · 不把 access 数据写进任何文件（数据只存在于 Cloudflare Dashboard）。
 *
 * ## Token 边界（**这是本轮最容易被误解的一处**）
 *
 * `siteToken` 是 Cloudflare Web Analytics 的 **Browser Beacon Site Token**：它必然会随
 * HTML 发给每一个访客浏览器，**它不是密钥**，也无法用来读任何分析数据。
 * 它 **不等于** Cloudflare API Token / Global API Key —— 后两者是本轮**完全不需要**的账户凭据，
 * 严禁出现在源码、HTML、config、README 或浏览器 JS 里（由 `lib/secret-scan.js` 的模式 + 本轮
 * 的 analytics selftest 逐条扫）。
 *
 * 因此本轮**刻意不**把 token 放进 GitHub Secret 做 build-time 注入：那会让 `local dist != CI dist`，
 * 与「两次同源构建逐字节一致」直接冲突。token 写在这里，构建产物因此是确定性的。
 */

'use strict';

/**
 * 唯一配置源。schema 与 P1 §18 的五个字段一一对应（外加三个**由官方文档确定的**常量）。
 *
 * `provider` / `enabled` / `productionHostname` / `productionPathPrefix` / `siteToken`
 * 是行为字段；另外三个是「官方地址」，写在这里而不是散落在渲染代码里 ——
 * 它们同时被 `allowedOrigins`（外部请求白名单）引用，两处分家就会让门禁与产物不一致。
 */
const ANALYTICS = {
  provider: 'cloudflare-web-analytics',
  enabled: true,
  siteToken: 'dcabf20adc0049bca647eb83b1408a5a',
  productionHostname: 'buguoshixc.github.io',
  productionPathPrefix: '/ai-deals-aggregator/',
  // 官方文档（见 docs/PRIVATE-ANALYTICS-v1.md 的 Sources）：
  //   脚本 https://static.cloudflareinsights.com/beacon.min.js
  //   上报 https://cloudflareinsights.com/cdn-cgi/rum（未走 Cloudflare 代理的站点）
  beaconScriptUrl: 'https://static.cloudflareinsights.com/beacon.min.js',
  beaconEndpointUrl: 'https://cloudflareinsights.com/cdn-cgi/rum',
  /**
   * 外部请求 Gate 的**唯一**允许来源（P1 §15 要求的 `ANALYTICS_ALLOWED_ORIGINS`）。
   *
   * 只有这两条：beacon 脚本的 origin 与 beacon 上报的 origin。**不允许通配、不允许子域通配**，
   * 也不允许「出现外部请求就不再检查」那种改法（`verify-site.js` 仍然逐条判来源）。
   */
  allowedOrigins: [
    'https://static.cloudflareinsights.com',
    'https://cloudflareinsights.com'
  ]
};

/** 配置里允许出现的字段（多一个字段要显式登记：配置对象是契约，不是杂物抽屉）。 */
const CONFIG_FIELDS = [
  'provider', 'enabled', 'siteToken', 'productionHostname', 'productionPathPrefix',
  'beaconScriptUrl', 'beaconEndpointUrl', 'allowedOrigins'
];

/** CLI 侧接受的 provider 取值（将来换 provider 必须显式改这里 + 白名单 + 文档）。 */
const KNOWN_PROVIDERS = ['cloudflare-web-analytics'];

/** Site Token 形状：Cloudflare Web Analytics Dashboard 给出的是 32 位小写十六进制。 */
const SITE_TOKEN_RE = /^[0-9a-f]{32}$/;

/**
 * 产物里上下文的标记：
 *   · 模板里是 `<!--ANALYTICS:BOOTSTRAP-->` 占位符（唯一注入点）；
 *   · 注入后写成 `<script … data-dsh-analytics="cloudflare-web-analytics">`。
 * 判「这一页注入过几次」用的是 `data-dsh-analytics` 属性，**不是** grep token 字符串
 * （P1 §20 明确禁止拿「出现过某个串」当唯一证明：token 与 guard 都会在别处合法出现）。
 */
const PLACEHOLDER = '<!--ANALYTICS:BOOTSTRAP-->';
const BOOTSTRAP_ATTR = 'data-dsh-analytics';

/** excluded 路由留下的注释（可见、可计数、不会被执行） */
const EXCLUDED_COMMENT = '<!-- 分析：本页按 analytics-routes.js 的声明不注入 beacon -->';
/** provider 被关掉时留下的注释（`enabled:false` 的唯一可见痕迹） */
const DISABLED_COMMENT = '<!-- 分析：配置里 enabled:false，本站不注入任何 beacon -->';

/** 该页最终应该有几个 bootstrap：0（被排除，或 provider 已关闭）或 1（正常注入） */
function expectedBootstraps(decision) {
  if (ANALYTICS.enabled !== true) return 0;
  return decision && decision.trackable === true ? 1 : 0;
}

function enabledComment(decision) {
  return ANALYTICS.enabled === true ? EXCLUDED_COMMENT : DISABLED_COMMENT;
}

/** `inject()` 的结果标记（构建期用它决定是否直接抛错）。 */
const INJECTED = 'injected';
const EXCLUDED = 'excluded';

/* ------------------------------------------------------------------ */
/* Production Guard：**唯一实现**（标记区块内的纯函数）                  */
/* ------------------------------------------------------------------ */

/* ANALYTICS-GUARD:START */
/**
 * 这台浏览器所在的页面，是不是「真的生产站」？
 *
 * 为什么必须同时判 hostname **与** pathname 前缀：本站托管在 GitHub Pages 的**项目页**
 * （`https://buguoshixc.github.io/ai-deals-aggregator/`），而同一个 hostname 下还住着
 * 别人的项目站。只判 `hostname === 'buguoshixc.github.io'`，就等于把**同一账户下其它项目**
 * 的访问也记进本站的分析 —— 那是错的归属，且不会有任何东西报错。
 *
 * @param {{location:object, config:object}} o
 * @returns {boolean} true = 允许加载 beacon
 */
function isProductionAnalyticsContext(o) {
  var location = (o && o.location) || {};
  var config = (o && o.config) || {};
  if (config.enabled !== true) return false;

  var hostname = String(location.hostname || '').toLowerCase();
  var expectedHost = String(config.productionHostname || '').toLowerCase();
  if (!hostname || !expectedHost || hostname !== expectedHost) return false;

  // `file://` 下 protocol 不是 http/https，且 hostname 为空 —— 上面那条已经拦掉了，
  // 这里再判一次 protocol 是为了显式表达「非 http(s) 一律不统计」。
  var protocol = String(location.protocol || '');
  if (protocol !== 'https:' && protocol !== 'http:') return false;

  var pathname = String(location.pathname || '/');
  var prefix = String(config.productionPathPrefix || '');
  // 前缀必须以 / 开头且以 / 结尾（否则 `/ai-deals-aggregator` 会命中
  // `/ai-deals-aggregator-old/` 这种兄弟路径 —— 前缀必须落在路径分隔符上）。
  if (prefix.charAt(0) !== '/' || prefix.charAt(prefix.length - 1) !== '/') return false;
  if (pathname.indexOf(prefix) !== 0) return false;

  return true;
}
/* ANALYTICS-GUARD:END */

/**
 * guard 区块的**逐字源码**（构建期内联、selftest 沙箱求值都读它）。
 *
 * 失败即抛错而不是返回空串：找不到标记就意味着「唯一实现」这条结构性承诺已经破了，
 * 此时静默降级会产出一个**没有守卫**的页面 —— 那是本轮最坏的一种产物。
 */
function guardSource() {
  const source = require('fs').readFileSync(__filename, 'utf8');
  const match = source.match(/\/\* ANALYTICS-GUARD:START \*\/([\s\S]*?)\/\* ANALYTICS-GUARD:END \*\//);
  if (!match) {
    throw new Error('scripts/lib/analytics.js 里找不到 ANALYTICS-GUARD 标记区块 —— '
      + '「Production Guard 判据只有一份实现」这条结构性承诺依赖这两个标记，不能删');
  }
  const code = match[1].trim();
  const forbidden = ['require(', 'module.exports', '__dirname', 'process.', 'fs.', 'path.'];
  const hit = forbidden.find(word => code.includes(word));
  if (hit) {
    throw new Error(`ANALYTICS-GUARD 区块里出现了宿主侧标识符「${hit}」—— `
      + '这段代码会被逐字内联到浏览器 <script> 里，只能用纯 ES5 + location/config 参数');
  }
  return code;
}

/**
 * guard 区块内联进页面后的样子：每行统一缩进两格。
 *
 * 为什么要单独给一个函数：门禁要判「页面里跑的那段 guard 与本文件的区块**逐字相同**」，
 * 而内联时必须缩进（否则生成出来的脚本没法读）。判据因此比的是**缩进后的那一份**，
 * 而不是让两处各自去猜缩进 —— 谁改了缩进规则，两边一起改，否则门禁立刻红。
 */
function indentedGuardSource() {
  return guardSource().split('\n').map(line => (line ? `  ${line}` : line)).join('\n');
}

/**
 * 把 guard 区块放进 `vm` 沙箱求值，取出可直接调用的判据函数。
 *
 * 沙箱里**只有** `undefined` 级别的宿主（不给 document/window/require/process），
 * 因此任何「偷偷读了别的东西」的改动都会在这里当场抛错，而不是等到线上才发现。
 * selftest 与构建期都走这一条 —— 判据的实现自始至终只有一份。
 */
function loadGuard(sandboxExtras = {}) {
  const vm = require('vm');
  const context = vm.createContext(Object.assign({}, sandboxExtras));
  new vm.Script(`${guardSource()}\n;isProductionAnalyticsContext;`, { filename: 'analytics.js#GUARD' })
    .runInContext(context);
  const fn = new vm.Script('isProductionAnalyticsContext', { filename: 'analytics.js#GUARD#export' })
    .runInContext(context);
  if (typeof fn !== 'function') throw new Error('ANALYTICS-GUARD 区块没有导出 isProductionAnalyticsContext()');
  return fn;
}

/** 用沙箱里的**同一份**判据回答「这个 location 该不该统计」。 */
function isProductionLocation(location, config = ANALYTICS) {
  return loadGuard()({ location, config });
}

/* ------------------------------------------------------------------ */
/* 注入                                                                */
/* ------------------------------------------------------------------ */

/** 出现次数（用 split/join 而不是正则，避免 `$&` 之类的替换陷阱） */
function countOf(haystack, needle) {
  return String(haystack).split(needle).length - 1;
}

/** 占位符出现次数 —— 必须是 1，否则说明模板被复制了（那是「注入两次」的根因） */
function countPlaceholders(html) {
  return countOf(html, PLACEHOLDER);
}

/**
 * 一页里 bootstrap 的个数。
 *
 * 判据是**我们自己的属性** `data-dsh-analytics`（构建期写进去的），不是 token 字符串：
 * token、beacon URL、guard 源码都会在 README / docs / 本文件里合法出现，
 * 拿它们当计数依据就是在数文档（P1 §20 点名禁止的那件事）。
 */
function countBootstraps(html) {
  return countOf(html, `${BOOTSTRAP_ATTR}="`);
}

/**
 * 去掉本模块注入的那一段（返回**去掉之后**的 HTML）。
 *
 * 为什么必须有它，而不是让各处断言自己写正则：产物里有几条既有断言是
 * 「这一页不许有内联脚本」（API 计费页 / 套餐资料入口页 —— 它们是纯静态表页，
 * 加交互控件会让「无 JS 也可读」这条承诺悄悄失效）。分析 bootstrap 是全站共享页脚的
 * 一部分、加载的是外部观测脚本、不改变页面行为，因此属于**允许的共享内联段**。
 * 但那几条断言必须仍然守着「这一页自己没有内联脚本」——
 * 于是它们先 `stripBootstrap()`，再照原样判。判据只有一处：这里的属性名。
 */
function stripBootstrap(html) {
  return String(html).replace(
    new RegExp(`<script\\s+${BOOTSTRAP_ATTR}="[^"]*"[\\s\\S]*?<\\/script>`, 'g'),
    ''
  );
}

/**
 * 配置对象 → 内联进 bootstrap 的 JSON 字面量。
 *
 * 只带运行时真正需要的三个字段：`enabled`（关闭后浏览器连元素都不建）、
 * `productionHostname` / `productionPathPrefix`（守门判据的两个输入）。
 * token 与官方地址单独内联（它们是常量，混进来只会让「配置里有哪些字段」变模糊）。
 */
function runtimeConfigLiteral(config) {
  return JSON.stringify({
    enabled: config.enabled === true,
    productionHostname: config.productionHostname,
    productionPathPrefix: config.productionPathPrefix
  });
}

/**
 * 官方 Browser Beacon 的**等价**实现（P1 §10：不允许重写 Cloudflare 协议）。
 *
 * ## 与官方 snippet 的逐项对应（这是本轮**唯一**允许的差异，理由写在下面）
 *
 *   官方（静态写死在 HTML 里）：
 *     <script type="module" src="…/beacon.min.js" data-cf-beacon='{"token": "…"}'></script>
 *
 *   这里（因为要先过 Production Host Guard，必须在运行时判断之后再决定加载）：
 *     · 同一个 URL、同一个 `type`、同一个 `data-cf-beacon` 载荷 → 由 `document.createElement`
 *       建出**逐属性相同**的元素再插入 `<head>`；
 *     · 插入时机：`readyState === 'loading'` 时挂 `DOMContentLoaded`（官方也要求放在
 *       `</body>` 之前，行为等价）；否则立即插入；
 *     · 整段包在 try/catch 里：**Analytics 失败绝不影响产品**（正文、搜索、筛选、排序、
 *       弹层全部与它无关）。CSP 拦了、广告拦截器拦了、Cloudflare 挂了，页面只是少一份观测数据。
 *
 * 注意 `data-cf-beacon` 用**单引号**包裹 JSON（与官方 snippet 逐字一致）：
 * JSON 里只有 `{"token":"…"}`，不含单引号，因此不会提前闭合属性。
 *
 * 结果按配置缓存一次：`finalizePage()` 每页都会调用它（收尾断言也要逐页比对），
 * 而 `guardSource()` 每次都要读盘 —— 缓存让「每页一次」在 173 个页面上也只是一次读。
 * 缓存的是**同一份字节**，因此不影响构建确定性（两次构建仍然逐字节相同）。
 */
let BOOTSTRAP_CACHE = null;
let BOOTSTRAP_CACHE_KEY = null;

function bootstrapScript(config = ANALYTICS) {
  const key = JSON.stringify([config.provider, config.enabled, config.siteToken,
    config.beaconScriptUrl, config.productionHostname, config.productionPathPrefix]);
  if (BOOTSTRAP_CACHE && BOOTSTRAP_CACHE_KEY === key) return BOOTSTRAP_CACHE;
  const lines = [
    `<script ${BOOTSTRAP_ATTR}="${config.provider}">`,
    '/* 私有站点分析（Cloudflare Web Analytics）—— 定义见 docs/PRIVATE-ANALYTICS-v1.md',
    '   本段由 scripts/lib/analytics.js 生成：guard 源码与该文件 ANALYTICS-GUARD 区块**逐字相同**。',
    '   非生产环境（localhost / 127.0.0.1 / file:// / 同域其它项目路径）在这里直接返回，一个请求都不发。 */',
    '(function () {',
    '  "use strict";',
    indentedGuardSource(),
    '  var LOCATION = window.location;',
    '  var CONFIG = ' + runtimeConfigLiteral(config) + ';',
    `  var SITE_TOKEN = ${JSON.stringify(config.siteToken)};`,
    `  var BEACON_SRC = ${JSON.stringify(config.beaconScriptUrl)};`,
    '  try {',
    '    if (!isProductionAnalyticsContext({ location: LOCATION, config: CONFIG })) return;',
    '    function load() {',
    '      var el = document.createElement("script");',
    '      el.type = "module";',
    '      el.src = BEACON_SRC;',
    '      el.setAttribute("data-cf-beacon", JSON.stringify({ token: SITE_TOKEN }));',
    '      document.head.appendChild(el);',
    '    }',
    '    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", load);',
    '    else load();',
    '  } catch (error) { /* 观测层失败不得影响产品：这里刻意什么都不做 */ }',
    '})();',
    '</script>'
  ];
  BOOTSTRAP_CACHE = lines.join('\n');
  BOOTSTRAP_CACHE_KEY = key;
  return BOOTSTRAP_CACHE;
}

/**
 * 把一个页面的占位符解析成最终内容。**唯一注入点。**
 *
 * @param {string} html 已解析过路由占位符的页面 HTML
 * @param {{trackable:boolean, route:string, why?:string}} decision analytics-routes.classifyRoute() 的结果
 * @returns {string}
 */
function inject(html, decision) {
  const text = String(html);
  const route = (decision && decision.route) || '';
  const count = countPlaceholders(text);

  if (count === 0) {
    throw new Error(`页面 ${describeRoute(route)} 里没有分析占位符 ${PLACEHOLDER} —— `
      + '说明它没有走 build-local.js 的 finalizePage()（共享页脚被绕过了），'
      + '这一页会是一个「零观测」的发布页面却不报错');
  }
  if (count > 1) {
    throw new Error(`页面 ${describeRoute(route)} 里出现了 ${count} 个分析占位符 —— `
      + '模板被复制了，注入会变成 2 份 beacon（重复计一次访问）');
  }

  if (!decision || decision.trackable !== true || ANALYTICS.enabled !== true) {
    // 关掉 Analytics 的唯一动作就是配置里的 `enabled:false`：占位符照常被解析掉
    // （产物里不留任何标记），但一个 beacon 都不注入 —— 恢复时把那个字段改回 true 即可。
    return text.split(PLACEHOLDER).join(enabledComment(decision));
  }

  // 只在真的要注入时校验 token：`enabled:false` 的发布构建不该被一条与自己无关的
  // token 形状断言卡住（那时产物里根本没有 token）。
  const check = validateConfig(ANALYTICS);
  if (check.problems.length) {
    throw new Error(`分析配置不合法，拒绝注入：${check.problems.join('；')}`);
  }
  return text.split(PLACEHOLDER).join(bootstrapScript(ANALYTICS));
}

/**
 * 「这一页现在的分析注入状态是否自洽」——构建期与 selftest 共用同一条判据。
 * @returns {{ok:boolean, bootstraps:number, placeholders:number, problems:string[]}}
 */
function assertPageHtml(html, decision) {
  const text = String(html);
  const route = (decision && decision.route) || '';
  const bootstraps = countBootstraps(text);
  const placeholders = countPlaceholders(text);
  const want = expectedBootstraps(decision);
  const problems = [];

  if (placeholders > 0) {
    problems.push(`还残留 ${placeholders} 个占位符 ${PLACEHOLDER}（说明这一页没有经过 finalizePage()）`);
  }
  if (bootstraps !== want) {
    problems.push(want === 1
      ? `trackable 页面应有 exactly 1 个 bootstrap，实得 ${bootstraps}`
      : `本页不该有 bootstrap（${describeExpectation(decision)}），实得 ${bootstraps}`);
  }
  if (bootstraps === 1) {
    // 注入内容必须与本文件的定义一致（谁改了 token / 换了 provider / 删了 guard，这里立刻红）
    const expected = bootstrapScript(ANALYTICS);
    if (!text.includes(expected)) {
      problems.push('bootstrap 内容与 scripts/lib/analytics.js 的定义不一致（token / provider / guard 之一被改过）');
    }
  }
  return { ok: problems.length === 0, bootstraps, placeholders, problems, route, expected: want };
}

function describeExpectation(decision) {
  if (ANALYTICS.enabled !== true) return '配置里 enabled:false';
  return decision && decision.trackable !== true ? 'analytics-routes.js 把它声明为不统计' : '未知原因';
}

function describeRoute(route) {
  return route === '' ? '/' : `/${route}`;
}

/* ------------------------------------------------------------------ */
/* 配置校验与外部请求判据                                              */
/* ------------------------------------------------------------------ */

/**
 * 配置自检（唯一实现）。**故意不只看 token**：这一层最容易出的错是
 * 「配置与站点常量分家」—— 比如将来换了域名，`feeds.SITE_URL` 改了而这里没改，
 * 症状是「线上一个统计数据都没有」且没有任何东西报错。
 *
 * @param {object} config 待校验配置
 * @param {{siteUrl?:string}} [context] 站点真实地址（构建期由 lib/feeds.js 传入）
 * @returns {{ok:boolean, problems:string[]}}
 */
function validateConfig(config = ANALYTICS, context = {}) {
  const problems = [];
  const cfg = config || {};

  for (const key of Object.keys(cfg)) {
    if (!CONFIG_FIELDS.includes(key)) problems.push(`未知配置字段「${key}」（配置对象是契约，新字段要显式登记）`);
  }
  if (!KNOWN_PROVIDERS.includes(cfg.provider)) {
    problems.push(`provider「${cfg.provider}」不在已登记的 provider 列表里：${KNOWN_PROVIDERS.join(' / ')}`);
  }
  if (typeof cfg.enabled !== 'boolean') problems.push(`enabled 必须是布尔（实得 ${typeof cfg.enabled}）——三态会让「关掉」变成猜测`);

  if (cfg.enabled === true) {
    // 只检查形状，不检查「这个 token 在 Cloudflare 那边是否真的存在」——
    // 那需要账户凭据，而本轮刻意不持有任何账户凭据（P1 §5：不许猜 Dashboard 状态）。
    if (!SITE_TOKEN_RE.test(String(cfg.siteToken || ''))) {
      problems.push('siteToken 不是 32 位小写十六进制的 Cloudflare Web Analytics Site Token'
        + '（placeholder / 大写 / 长度不对都会在这里被拦下；真实 token 只能来自 Cloudflare Dashboard）');
    }
  } else if (cfg.siteToken !== null && cfg.siteToken !== '') {
    problems.push('enabled:false 时 siteToken 必须留空或 null —— 关掉的 provider 不该继续带着标识');
  }

  const origins = Array.isArray(cfg.allowedOrigins) ? cfg.allowedOrigins : [];
  if (!origins.length) problems.push('allowedOrigins 不能为空（外部请求白名单必须是显式清单）');
  const officialOrigins = [originOf(cfg.beaconScriptUrl), originOf(cfg.beaconEndpointUrl)];
  for (const origin of origins) {
    if (!/^https:\/\/[a-z0-9.-]+$/.test(String(origin))) {
      problems.push(`allowedOrigins 里的「${origin}」不是精确的 https origin（不允许通配 / 路径 / 子域通配）`);
    }
  }
  for (const origin of officialOrigins) {
    if (origin && !origins.includes(origin)) {
      problems.push(`官方地址的 origin「${origin}」不在 allowedOrigins 里（门禁会与产物分家）`);
    }
  }
  for (const origin of origins) {
    if (!officialOrigins.includes(origin)) {
      problems.push(`allowedOrigins 里的「${origin}」不是官方地址的 origin —— 白名单只允许放 Cloudflare 实际需要的那两个`);
    }
  }
  const host = String(cfg.productionHostname || '');
  if (!host || host !== host.toLowerCase()) problems.push(`productionHostname「${host}」必须是非空小写主机名`);
  const prefix = String(cfg.productionPathPrefix || '');
  if (prefix.charAt(0) !== '/' || prefix.charAt(prefix.length - 1) !== '/') {
    problems.push(`productionPathPrefix「${prefix}」必须以 / 开头并以 / 结尾（否则会命中兄弟路径）`);
  }

  // 与站点常量对账（构建期才拿得到 SITE_URL；selftest 也会以同样方式再对一次）
  if (context.siteUrl) {
    let parsed = null;
    try { parsed = new URL(context.siteUrl); } catch (error) { problems.push(`站点地址无法解析：${context.siteUrl}`); }
    if (parsed) {
      if (parsed.hostname.toLowerCase() !== host) {
        problems.push(`productionHostname「${host}」与站点地址的 host「${parsed.hostname}」不一致`
          + '（改域名时两处必须一起改，否则线上会一声不响地零统计）');
      }
      if (parsed.pathname !== prefix) {
        problems.push(`productionPathPrefix「${prefix}」与站点地址的 path「${parsed.pathname}」不一致`);
      }
    }
  }
  return { ok: problems.length === 0, problems };
}

/** URL → origin（解析失败返回空串，由调用方按「不在白名单」处理） */
function originOf(url) {
  try { return new URL(String(url)).origin; } catch (error) { return ''; }
}

/**
 * 外部请求 Gate 的**唯一**允许判据（`verify-site.js` 与 selftest 共用）。
 *
 * 语义刻意写死为「白名单里的 origin 才算允许」：
 *   · 通配、子域、兄弟域一律不允许；
 *   · **绝不**提供「有外部请求就跳过检查」这种开关（P1 §15 点名禁止的改法）。
 */
function isAllowedExternalRequest(url, config = ANALYTICS) {
  const origin = originOf(url);
  if (!origin) return false;
  return (config.allowedOrigins || []).includes(origin);
}

/** 分析相关请求是否**属于**当前 provider 的官方地址（比对 origin，不比对整串） */
function isAnalyticsOrigin(url, config = ANALYTICS) {
  return isAllowedExternalRequest(url, config);
}

module.exports = {
  ANALYTICS,
  CONFIG_FIELDS,
  KNOWN_PROVIDERS,
  SITE_TOKEN_RE,
  PLACEHOLDER,
  BOOTSTRAP_ATTR,
  EXCLUDED_COMMENT,
  DISABLED_COMMENT,
  INJECTED,
  EXCLUDED,
  expectedBootstraps,
  guardSource,
  indentedGuardSource,
  loadGuard,
  isProductionLocation,
  bootstrapScript,
  inject,
  assertPageHtml,
  countBootstraps,
  countPlaceholders,
  stripBootstrap,
  validateConfig,
  isAllowedExternalRequest,
  isAnalyticsOrigin,
  originOf,
  describeRoute
};
