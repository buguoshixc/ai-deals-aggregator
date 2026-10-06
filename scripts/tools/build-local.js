#!/usr/bin/env node
/**
 * 本地/CI 共用的发布产物组装：
 *   校验数据 → 组装 dist/ → 预渲染静态骨架 → 自检产物内容
 *
 * deploy.yml 直接调用本脚本，保证「本地验证」与「线上发布」是同一条路径。
 * 零外部依赖，CI 中无需 npm install。
 *
 * 预渲染（本脚本的核心职责）：
 *   index.html 里保留三个注释标记，构建期把它们替换成真实内容——
 *     <!--PRERENDER:deals-->     默认视图的卡片 HTML
 *     <!--PRERENDER:jsonld-->    Organization / BreadcrumbList / FAQPage / ItemList
 *     __SITE_URL__               站点绝对地址（避免源码里硬编码第二份 URL）
 *   卡片 HTML 与浏览器用的是同一份模板：脚本按 RENDER-CORE 标记从 index.html 抽出
 *   纯渲染核心，在无 DOM 的沙箱里求值。模板只有一处，不会分叉。
 *
 * 用法：node scripts/tools/build-local.js [--out=dist]
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { render: renderOgImage, renderIcon, selfCheck: selfCheckOgImage, selfCheckIcon } = require('../lib/og-image');
const { load: loadLogos, write: writeLogos } = require('../lib/logos');
const { load: loadRenderCore } = require('../lib/render-core');
const { attach: attachZh, summarize: summarizeZh } = require('../lib/zh');
const health = require('../lib/health');
const audience = require('../lib/audience');
const provenance = require('../lib/provenance');
const history = require('../lib/history');
const changes = require('../lib/changes');
const feeds = require('../lib/feeds');
const landing = require('../lib/landing');
// v3.0 Stage E：厂商统一资料页（六个资料区块 + 四条诚实性断言）。
const vendorPage = require('../lib/vendor-page');
const seo = require('../lib/seo');
const secretScan = require('../lib/secret-scan');
// v2.1 第二段：Coding Plan 套餐页（/plans/coding/）。正文渲染住在 lib 里，
// 因为它必须能被离线自测直接调用 —— 这个文件一 require 就跑整条构建链。
const plansPage = require('../lib/plans-page');
const planSchema = require('../lib/plan-schema');
const planHistory = require('../lib/plan-history');
// v2.5：API / Token 计费（api-plans.json + /plans/api/）。与 Coding 套餐**互不注入**：
// 两份数据、两条路由、两套判据，只有 BasePlan 的共享原语与 history-core 内核是同一份。
const apiPlanSchema = require('../lib/api-plan-schema');
const apiPlanHistory = require('../lib/api-plan-history');
const apiPlansPage = require('../lib/api-plans-page');
// v3.0：`/plans/` 统一资料入口（AI 套餐与 API 计费资料库）。正文渲染同样住在 lib 里，
// 因为它要能被离线自测直接调用；这一页**不复制** /plans/coding/ 与 /plans/api/ 的表，
// 只给计数、口径、变化与仍然有效的关联优惠（变化与关系都复用既有判据，见该文件头注释）。
const plansHubPage = require('../lib/plans-hub-page');
// v3.0 Stage D5/D6：模型资料索引与详情页（`/models/` 与 `/models/<slug>/`）。
// 正文渲染住在 lib 里（可被离线自测直接调用）；身份 / 映射 / 派生时间线全部走
// `lib/model-registry.js` 的同一份判据 —— 页面层不自己算 id，也不判"两个名字是不是同一个模型"。
const modelsPage = require('../lib/models-page');
const modelRegistry = require('../lib/model-registry');
// coverage-expansion-v1：`catalogStatus` / `catalogReason` 是**派生**字段，判据只有一处
// （`scripts/lib/model-freshness.js`）。构建期必须与 `rebuild-models.js`、
// `check-models-reproducible.js` 用**同一支派生** —— 少传一次 `catalog`，
// 产物里每条都会落成 `unknown`，而盘上那份带真实原因码 ⇒ 下面那条"与仓库里那份逐字节相同"
// 的对账会当场红（本轮构建**真的**踩过一次：三处调用点必须同步）。
const modelFreshness = require('../lib/model-freshness');
// v3.0 Stage F：历史档案（`/archive/`）。归档层是**派生视图**：三份日志的
// baseline + events + absence（+ ended 的墓碑 label）→ 结束/恢复条目，不落新真值文件。
const archiveLib = require('../lib/archive');
// v3.0 Stage G：数据出口（`/docs/data/` + `/data/index.json` Manifest）。
// 文档与 Manifest **同源对账**：endpoint 必须真实存在、schemaVersion / count / updatedAt 逐字段一致。
const dataDocs = require('../lib/data-docs');
// v3.0：页面类型声明表 —— 路由 → kind / 正文下限 / ItemList 要求 / sitemap priority 的唯一出处。
// 构建期与独立门禁（tools/seo-verify.js）都读它，但**各自从 dist 解析**（执行路径不合并）。
const pageKinds = require('../lib/page-kinds');
const planChanges = require('../lib/plan-changes');
const providers = require('../lib/providers');
// v2.4：优惠 ↔ 套餐关系层。真值在 scripts/data/deal-plan-links.json，
// 这里只读、只校验、只派生（注入 dist/deals.json + 发布 dist/deal-plan-links.json）。
const dealPlanLinks = require('../lib/deal-plan-links');
// private-analytics-v1：私有站点分析（Cloudflare Web Analytics）。
// 定义只有一处 —— `lib/analytics.js` 的 ANALYTICS-GUARD 区块就是浏览器里跑的那段源码；
// 「这一页要不要统计」只有一处声明 —— `lib/analytics-routes.js` 的 ROUTE_RULES。
// 构建期做三件事：按路由注入 beacon / 断言每页 exactly 1 / 断言产物里不留占位符。
const analytics = require('../lib/analytics');
const analyticsRoutes = require('../lib/analytics-routes');

/**
 * 套餐对比页的交互逻辑**源码**（逐字节内联进页面）。
 *
 * 为什么读文件而不是 require 它的导出：浏览器拿到的那一份必须与离线自测
 * `require` 的那一份是同一份字节。读源码内联 = 结构上不可能分家；
 * 构建期自检还会拿它对内置产物里的那一份再比一次。
 */
function plansCompareSource() {
  return fs.readFileSync(path.join(__dirname, '..', 'lib', 'plans-compare.js'), 'utf8');
}

const ROOT = path.join(__dirname, '..', '..');
const outArg = process.argv.find(a => a.startsWith('--out='));
/** 最终输出目录。--out 语义不变：用户给什么路径，产物最终就落在什么路径上。 */
const FINAL_OUT = path.join(ROOT, outArg ? outArg.slice(6) : 'dist');
/**
 * 组装暂存目录：最终输出目录的**兄弟目录**（同卷 ⇒ 可用 renameSync 原子替换）。
 *
 * 第 2 阶段的一切写入都指向它，只有全部自检通过之后才替换到 FINAL_OUT。
 * 这样「自检失败」不再等于「上一份好的产物已经被删掉、磁盘上留下一个像构建成功的
 * 半成品目录」：失败路径清掉暂存目录，FINAL_OUT 原封不动。
 */
const STAGE_OUT = `${FINAL_OUT}.building`;
/** 组装期间的写入目标（下称 OUT）。失败时它会被整个清掉，FINAL_OUT 不动。 */
let OUT = STAGE_OUT;

/** 对外报的路径一律是最终目录（相对仓库根），不报暂存目录。 */
function showOut(dir) {
  return `${path.relative(ROOT, dir) || '.'}/`;
}

/**
 * `package.json` 的「文本层重复键」护栏（v3.0 D7）。
 *
 * ## 为什么必须有它
 *
 * `JSON.parse` 对重复键**静默只留最后一个**，所以「两个并行改动给同一件事起了同一个脚本名」
 * 在构建期**没有任何东西会红** —— 后写的那个悄悄顶掉先写的那个，而两边各自看都自洽。
 * 这不是假想：v3.0 实施期间，`selftest:models` 同时被两个成员写进 `scripts`，
 * JSON 解析后只剩一个，是**人**发现并改名才收场的（见 STAGE-PLAN 的 D7）。
 *
 * ## 为什么判「文本层」而不是解析结果
 *
 * 判据一旦走 `JSON.parse`，重复键已经被去重 ⇒ 恒真、等于没判。所以这里读**原始文本**：
 * 只看 `scripts` 区块里的顶层键行，逐行取键名，出现第二次即报错（附两个行号）。
 * 刻意不引入 YAML/JSON5 解析器：只做「同一区块里同名键出现两次」这一个判断，误报面最小。
 *
 * 它是**硬失败**：重复键意味着「有一份脚本定义静默失效」，宁可拦住发布。
 */
function assertNoDuplicateScriptKeys() {
  const file = path.join(ROOT, 'package.json');
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split('\n');
  // scripts 区块：从 `"scripts": {` 到与之配对的 `}`（按缩进判：闭合行以两个空格 + } 开头）
  const start = lines.findIndex(line => /^\s*"scripts"\s*:\s*\{\s*$/.test(line));
  if (start === -1) throw new Error('package.json 里找不到 "scripts" 区块 —— 护栏失去作用，拒绝继续构建');
  let end = -1;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\s{0,2}\}/.test(lines[i])) { end = i; break; }
  }
  if (end === -1) throw new Error('package.json 的 "scripts" 区块没有配对闭合 —— 护栏失去作用，拒绝继续构建');

  const seen = new Map();
  const duplicates = [];
  for (let i = start + 1; i < end; i++) {
    const m = lines[i].match(/^\s*"([^"]+)"\s*:/);
    if (!m) continue;
    const key = m[1];
    if (seen.has(key)) duplicates.push({ key, first: seen.get(key) + 1, second: i + 1 });
    else seen.set(key, i);
  }
  if (duplicates.length) {
    const detail = duplicates.map(d => `  - "${d.key}"：第 ${d.first} 行与第 ${d.second} 行重复（JSON 只留最后一个，前者静默失效）`).join('\n');
    throw new Error(`package.json 的 scripts 里有 ${duplicates.length} 个重复键 —— 重复键会被 JSON.parse 静默去重：\n${detail}`);
  }
  return seen.size;
}
assertNoDuplicateScriptKeys();

/**
 * 原样拷贝到产物根的源码文件。
 *
 * v2.1：`plans.json` 从这一版起**发布**（此前它只是仓库里的输入数据）。
 * 为什么现在才发：页面（`/plans/coding/`）在这一版才存在；先前发布一份没人读的数据文件，
 * 只会让「这个站到底发布了几份数据」这件事变得含糊。发布之后它同样进产物自检。
 *
 * v3.0 P2-25：**数据集那几行不再手写** —— 唯一注册表是 `lib/data-docs.js` 的 `PUBLIC_DATASETS`
 * （`copy` / `rewrite` 的进这一张、`generated` 的进下面那一张）。新增一份公开数据集时只改注册表，
 * 拷贝清单、Manifest、数据文档页与产物扫描会一起跟上，不会再出现"三份清单各自漂移"。
 */
const PUBLIC_FILES = ['index.html', 'favicon.svg', 'robots.txt', '.nojekyll', ...dataDocs.datasetCopyUrls()];
/** 构建期生成、不走源码拷贝的产物 */
const GENERATED_FILES = ['logos.css', 'sitemap.xml', 'og-image.png', 'feed.xml', 'feed.json', 'icon.png', 'source-health.json',
  ...dataDocs.datasetGeneratedUrls(), dataDocs.MANIFEST_URL];
// 站点常量与 XML 转义的**唯一出处**是 lib/feeds.js（v1.6 起订阅层也要用它们）。
const { SITE_URL, SITE_NAME, SITE_DESCRIPTION, xmlEscape } = feeds;

/**
 * 站内独立路由（非首页、非详情页）的**唯一清单**：占位符 → 相对路径。
 *
 * 为什么要有这张表：页脚是**一份共享片段**，被写进 4 种深度的输出（首页 / 详情页 / 状态页 /
 * 三个分类页）。原先每加一条路由就要在 3 个写入点各补一次 `.replace(/__XXX_HREF__/g, ...)`，
 * 而「漏了某一层」的症状是页脚出现一个字面量 `__XXX_HREF__` 的死链 ——
 * 站内导航少一条不会有人发现，直到有人正好从那一层点进去。
 *
 * 改成按深度统一解析之后，加一条路由 = 在**这里**加一行 + 把链接写进页脚，
 * 结构上不可能只补一半；`selfCheck()` 还会逐层扫残留占位符兜底。
 */
const ROUTE_HREFS = [
  ['__STATUS_HREF__', 'status/'],
  ['__STUDENT_HREF__', 'student/'],
  ['__DEVELOPER_HREF__', 'developer/'],
  ['__FREEAPI_HREF__', 'free-api/'],
  // v1.5：变化雷达静态页（与首页条带同一个数据源，只是列出全部分栏）
  ['__CHANGES_HREF__', 'changes/'],
  // v1.6：订阅中心（列出全部 Feed，并给出 RSS / JSON Feed 地址）
  ['__FEEDS_HREF__', 'feeds/'],
  // v1.7：厂商页与分类页两个枢纽（页脚那一行）
  ['__VENDOR_HREF__', 'vendor/'],
  ['__CATEGORY_HREF__', 'category/'],
  // v2.1 第二段：Coding Plan 套餐对比页。它是**并列的产品能力**（不是优惠入口），
  // 所以挂在「按厂商 / 分类浏览」那一行末尾，而不是新增一行页脚。
  ['__PLANS_HREF__', 'plans/coding/'],
  // v3.0 Stage B：/plans/ 资料入口（AI 套餐与 API 计费资料库）。它是上面两条的**父级**，
  // 因此排在它们前面 —— 页脚是一份共享片段，这一行是整站唯一的「按套餐 / 计费浏览」入口。
  // ⚠️ 占位符不许与既有占位符互为子串（`assertRouteMarkersDisjoint()` 会硬失败）：
  // 实测 `__PLANSHUB_HREF__` 不包含 `__PLANS_HREF__`（第 7 个字符是 H 而不是 S）。
  ['__PLANSHUB_HREF__', 'plans/'],
  // v3.0 Stage G：数据出口（数据文档页 + /data/index.json Manifest）。
  ['__DATA_HREF__', 'docs/data/'],
  // v3.0 Stage F：历史档案（资料失效不等于资料删除）。
  ['__ARCHIVE_HREF__', 'archive/'],
  // v3.0 Stage D5：模型资料索引。与「按厂商 / 分类浏览」是同一类东西（长期存在的资料维度），
  // 因此挂在同一行末尾；详情页由索引页给入链，不需要逐页进页脚。
  ['__MODELS_HREF__', 'models/'],
  // v2.5：API / Token 计费对比页。与套餐对比页**并列**（一个回答"月付多少钱"，
  // 一个回答"每百万 token 多少钱"），因此同样挂在那一行末尾。
  //
  // ⚠️ 占位符刻意叫 `__APIPLAN_HREF__` 而不是 `__APIPLANS_HREF__`：
  // 后者**包含** `__PLANS_HREF__` 这个子串，而 `resolveRouteHrefs()` 是逐条 `split/join` 的 ——
  // 先替换 `__PLANS_HREF__` 会把 `__APIPLANS_HREF__` 打碎成 `plans/coding/` + 尾巴，
  // 于是新占位符**永远替换不掉**，症状是"每一个输出都残留一个占位符"（117 个文件同时报错）。
  // 下面的 `assertRouteMarkersDisjoint()` 把这条约束变成构建期硬失败，避免下一个人踩同一坑。
  ['__APIPLAN_HREF__', 'plans/api/']
];

/**
 * 占位符之间**不许互为子串**（上面那条注释解释过为什么）。
 *
 * 单独写成一个函数并在模块加载时执行：这种错法的症状离原因很远
 * （"某个页脚链接替换不掉"看起来像页脚模板的问题），而检查它的成本只有几行。
 */
function assertRouteMarkersDisjoint() {
  for (const [a] of ROUTE_HREFS) {
    for (const [b] of ROUTE_HREFS) {
      if (a === b) continue;
      if (b.includes(a)) {
        throw new Error(`路由占位符 ${a} 是 ${b} 的子串 —— 逐条 split/join 的替换会让后者永远替换不掉（请改用不互相包含的占位符名）`);
      }
    }
  }
}
assertRouteMarkersDisjoint();
/**
 * 残留占位符的扫描清单（与 ROUTE_HREFS 同源，避免两处各写一份），外加 `__PREFIX__`。
 *
 * `__PREFIX__` 是**动态路由**（`vendor/zhipu/` 这类由数据决定的地址）的深度前缀占位符：
 * 它不能进 ROUTE_HREFS —— 那张表是「固定路由 + 相对路径」，而它的第二条断言会变成
 * `page.includes('href=""')` 这种永远为真的废话。所以它单独解析、单独扫描残留。
 */
const ROUTE_MARKERS = [...ROUTE_HREFS.map(([marker]) => marker), '__PREFIX__'];

/**
 * 落地页的**唯一清单**：分类页（`/student/` 等）、按需求页（`/need/<slug>/`）、
 * 分类页（`/category/<slug>/`）、厂商页（`/vendor/<slug>/`）、两个枢纽页与三条别名页，
 * 全部由 `scripts/lib/landing.js` 的 `planLandingPages()` 一次算出，一起走
 * `renderDirectoryPage()` 这一个生成循环。
 *
 * 为什么是「一张表 + 一个循环」：这些页面共用五条既有约定（预渲染 / 无 JS 可读 /
 * sitemap / feed / JSON-LD），而「哪一条忘了进 sitemap」正是 `/status/` 当年踩过的坑。
 * v1.7 一次加了四类页面，各写一遍就是四倍的风险。
 *
 * 它在 `assemble()` 里被赋值（门槛要看真实数据），赋值前是空数组 —— 任何在赋值前
 * 使用它的代码都会得到「一页都没有」而不是上一轮的残留。
 */
let DIRECTORY_PAGES = [];
/** 本次构建的落地页计划（含被跳过的页面与原因），由 assemble() 赋值 */
let PLAN = null;
/**
 * 规范厂商名取值器（`vendorOf(deal).name`）。在 assemble() 里由 RENDER-CORE 装配。
 *
 * 默认实现是**原始字符串**：这样任何在装配之前误用它的路径都不会悄悄得到规范名，
 * 而是与「没有归一」的旧行为一致 —— 差别会在断言里露出来，不会静默。
 */
let VENDOR_KEY_OF = deal => String((deal && deal.vendor) || '');

/**
 * 页脚那一行的「少量厂商入口」。
 *
 * 只在页脚，不进首页首屏：v1.5 的密度账写明任何独立成行的条带都会把首屏完整卡片
 * 从 9 张压到 6 张（余量只有 1px）。页脚是共享片段，因此这一行会在**每一种深度**的
 * 输出里出现 —— 厂商页因此天然有大量站内入链（orphan 检查不需要额外的补丁）。
 *
 * 只列前 5 家 + 「全部厂商」，链接用 `__PREFIX__` 占位（深度前缀由 resolveRouteHrefs 解析）。
 */
function renderVendorLine(plan) {
  const vendors = (plan && plan.vendorPages) || [];
  if (!vendors.length) return '<!-- 厂商入口：本次没有达到门槛的厂商页（不渲染死链） -->';
  const top = vendors.slice(0, 5);
  const links = top.map(page => `<a href="__PREFIX__${page.route}">${htmlEscape(page.key)}</a>`).join(' · ');
  const more = vendors.length > top.length
    ? ` · <a href="__VENDOR_HREF__">全部 ${vendors.length} 家厂商</a>`
    : '';
  return `<span class="vline">（${links}${more}）</span>`;
}

/**
 * 首页「按需求找优惠」导航块。**构建期注入**，与 NEED_PAGES 同一份注册表。
 *
 * v1.8 把标签式 chip 换成整卡（Topic Entry Card）：每张卡 = 图标 + 标题 + 一句说明 + 箭头，
 * 而**整张卡就是那个 `<a>` 本身**（不是「卡片容器里再放一个文字链接」—— 那种形状里可点区域
 * 只剩文字，而这一块本来就是导航）。
 *
 * 三个必须一起成立的性质（各自都有断言）：
 *   ① 每条都是 `<a class="need-card" href="need/<slug>/">` —— 静态导航，无 JS 可点。首页是静态
 *      文件，`?need=` 之类的 query 改不了服务端 HTML，写成按钮就是「点了没反应」；
 *   ② 数字是**数据层条数**（与落地页表格行数同源）。首页卡片数是折叠后的，两者会不同，
 *      这个差额由落地页题注里那句现成说明承担；
 *   ③ 条数为 0 的入口**不出现**（同 `facetBarHtml` 对分类入口的处理：一个点下去空空如也的
 *      入口不如没有），同时那一页也不生成、不进 sitemap —— 三处由同一个过滤条件保证一致。
 *      ⚠️ 因此 `class="need-card"` 的出现次数等于**已生成页面数**，而它等于注册表条数这件事
 *      由数据本身的既有断言保证（`audience-selftest.js` §9「每条入口在当前数据里都至少有一条」）。
 *
 * 卡片上的四件套（`.need-icon` / `.need-copy > strong` / `.need-copy > small` / `.need-arrow`）
 * 由产物自检 ⑥ **逐张按元素**判：少任何一件，卡片就退化成一条看不懂的链接。图标与箭头是
 * 纯装饰（`aria-hidden`），标题与说明才是卡片真正的内容。
 */
function renderNeedRow(deals) {
  // ⚠️ 只数 `type === 'deal'`：落地页的表格也是这么过滤的（与分类页同一口径）。
  // 不这么写就会数进工具条目，首页显示 15 而落地页列 12 —— 第一次跑就被
  // 「首页入口数字 ≠ 落地页行数」那条自检当场抓住（它不是假想出来的风险）。
  const scope = deals.filter(deal => deal.type === 'deal');
  const cards = DIRECTORY_PAGES
    // v1.7：三条近义页降级为别名页（noindex），但它们仍是可用的需求入口，
    // 首页入口行照旧全部列出 —— 入口的完整性不受索引策略影响。
    .filter(spec => spec.kind === 'need' || spec.kind === 'alias')
    .map(spec => ({ spec, count: scope.filter(deal => (deal.needs || []).includes(spec.slug)).length }))
    .filter(item => item.count > 0)
    .map(item =>
      `<a class="need-card" href="${item.spec.route}">` +
      `<span class="need-icon" aria-hidden="true">${htmlEscape(item.spec.icon)}</span>` +
      `<span class="need-copy"><strong>${htmlEscape(item.spec.label)}</strong><b>${item.count}</b>` +
      `<small>${htmlEscape(item.spec.homeDescription)}</small></span>` +
      `<span class="need-arrow" aria-hidden="true">→</span>` +
      `</a>`).join('');
  if (!cards) return '  <!-- 按需求入口：当前没有一条有内容的入口（数据全空时不渲染死链） -->';
  // 所有卡铺进**同一个**网格，顺序就是 NEED_PAGES 的顺序：首页第 i 张卡必须逐条对上注册表
  // 第 i 条的 label / href（断言正是这么比的）。分组不再靠 DOM 结构表达 —— 旧的「组名 + 组内
  // 一排 chip」那套容器（组名与 chip 曾反复争同一条 flex/grid 行，返工三次）整体删掉了；
  // 分组现在只活在注册表的 `group` 字段里（分组信息由卡片自己的标题与图标承担，
  // 学生组 / 开发者组在 NEED_PAGES 里本来就是前后相邻的两段）。
  // 卡上的属性刻意只有 class 与 href 两个：`<a class="need-card" href="…">` 这个字面形状
  // 是可被外部断言直接钉住的契约，多挂一个 data-* 就会让「按契约写的正则」悄悄失配。
  // 列数是 CSS 的事（桌面 5 列 = 10 张正好 5×2，窄屏按断点降到 3 / 2 / 1 列）。
  return `  <nav class="needs" aria-label="按需求找优惠"><div class="need-grid">${cards}</div></nav>`;
}

/**
 * 把共享片段里的路由占位符按**输出深度**解析成相对路径。
 * @param {string} html 含占位符的 HTML
 * @param {string} prefix 该输出相对站点根的路径前缀（'' / '../' / '../../'）
 */
function resolveRouteHrefs(html, prefix) {
  let out = html;
  for (const [marker, rel] of ROUTE_HREFS) out = out.split(marker).join(prefix + rel);
  // 动态路由（厂商页 / 分类页）的深度前缀：源码里写 __PREFIX__vendor/<slug>/，
  // 由这里按输出深度解析 —— 写死相对路径在详情页那一层必然错。
  return out.split('__PREFIX__').join(prefix);
}

/**
 * 页面 HTML 的**唯一收尾动作**（private-analytics-v1）：解析路由占位符 + 注入分析 bootstrap。
 *
 * ## 为什么它配得上「唯一」这两个字
 *
 * P1 §7 禁止逐页手写 `<script>`，目标是「Beacon 的定义只有一处，所有正式发布 HTML 从这一处派生」。
 * 本文件里页面 HTML 的生成路径有五条（首页骨架 / 详情页 / 状态页 / 变化页 / 各资料页渲染器），
 * 但它们**已经**收敛在一件事上：抽取共享片段时都要调一次 `resolveRouteHrefs()` 按输出深度
 * 解析页面里的占位符。分析注入就挂在这条既有收尾路径上 —— 于是「新页面族从同一处派生 beacon」
 * 不是因为大家记得改，而是**没有别的出口**。
 *
 * ## 三件必须在同一处发生的事
 *
 *   ① 路由占位符解析（既有行为，逐字不变）；
 *   ② 分析占位符按**该页路由**解析成 beacon 或注释（`lib/analytics.js` 是唯一实现）；
 *   ③ 收尾断言：残留占位符 = 0，且 bootstrap 数 == 该页应有值（trackable 1 / excluded 0）。
 *
 * ③ 是这套设计真正值钱的地方：漏注入、注入两次、绕过共享页脚、偷偷改 token 或删掉
 * Production Guard —— 任何一种都在**构建期**就红，而不是等到线上少了一半数据才发现。
 *
 * ⚠️ 一个页面**恰好调用一次**。页脚标记在源码里只出现一次，因此「解析两次」只可能来自
 * 有人把同一个页面拼了两遍 —— 那种情况下计数断言会报 2，正是我们想要的。
 *
 * @param {string} html 含占位符的 HTML 片段
 * @param {string} route 该页的站根相对路由（首页是空串）—— 必须是**显式**的，不许猜
 * @param {string} prefix 该输出的深度前缀（'' / '../' / '../../'）
 * @param {string} [where] 出错时点名用的位置描述（渲染器名）
 */
function finalizePage(html, route, prefix, where = '') {
  const resolved = resolveRouteHrefs(html, prefix);
  const decision = analyticsRoutes.classifyRoute(route);
  if (!decision.known) {
    // 「没有任何规则声明过这个路由」= 新增页面族忘了登记统计范围。
    // 静默不统计正是这一层最危险的失效方式，所以这里硬失败并给出登记位置。
    throw new Error(`分析统计范围里没有登记路由 ${analytics.describeRoute(decision.route)}`
      + `${where ? `（${where}）` : ''} —— 请把这一族加进 scripts/lib/analytics-routes.js 的 ROUTE_RULES`);
  }
  const out = analytics.inject(resolved, decision);
  const verdict = analytics.assertPageHtml(out, decision);
  if (!verdict.ok) {
    throw new Error(`分析注入自检失败 ${analytics.describeRoute(decision.route)}`
      + `${where ? `（${where}）` : ''}：${verdict.problems.join('；')}`);
  }
  return out;
}

/**
 * 预渲染正文的纯文本 —— **同时剥掉 `<script>` 与 `<style>`**。
 *
 * 为什么必须剥 `<style>`：站点的样式是内联进每一页的（约 39 KB）。只剥 `<script>` 时，
 * 「正文长度」这个数字有 **98% 是 CSS**：实测状态页 39947 字里只有 1188 字是内容
 * （空状态 646）。拿它当阈值等于在数样式表 —— 页面整张表都没渲染出来，数字照样四万。
 *
 * 这条是 2026-09-29 收口时发现的：`/status/` 与分类页两处「预渲染正文过短」的断言
 * 都在数 CSS，而它们各自看起来都在守着「无 JS 可读」这条约定。
 * **一个量错了东西的断言比没有断言更糟，因为它看起来在守着什么。**
 */
function prerenderedText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}


/**
 * 预渲染卡片数的下限：低于此值说明抽取或过滤逻辑坏了，宁可构建失败。
 *
 * 原为 60（对应 71 条优惠逐条成卡）。引入「同一张官方表格 = 一条优惠」的折叠后，
 * 默认视图稳定在 53 张卡片，因此下调到 45 留出余量。真正防止折叠丢条目的是
 * renderDeals() 里的无损断言（Σ模型数 === 未过期优惠条数），不是这个数字。
 */
const MIN_PRERENDERED_CARDS = 45;

/** 骨架里所有必须被构建期填掉的标记 */
const PRERENDER_MARKERS = [
  'PRERENDER:deals', 'PRERENDER:facets', 'PRERENDER:topstat',
  'PRERENDER:stats', 'PRERENDER:categories', 'PRERENDER:needs', 'PRERENDER:changes', 'PRERENDER:feeds', 'PRERENDER:jsonld',
  // v1.7：页脚那一行的「少量厂商入口」（由落地页计划生成，见 renderVendorLine）
  'PRERENDER:vendorline'
];

function runValidate() {
  console.log('=== 1) 发布前数据校验 ===');
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'validate.js')], { stdio: 'inherit' });
}

/* ------------------------------------------------------------------ */
/* 渲染核心抽取                                                         */
/* ------------------------------------------------------------------ */

/**
 * 从 index.html 抽出 RENDER-CORE 区块并在无 DOM 的沙箱里求值。
 *
 * 沙箱里只提供 escapeHtml/escapeAttr 需要的那个 createElement 垫片；
 * 一旦有人在区块内引用 document/window/state，这里立即抛错——构建立刻失败，
 * 而不是悄悄产出一个坏页面。
 */
/**
 * 渲染核心引用的 logo key 必须全部登记在 assets/logos/manifest.json 里。
 * 缺一个就构建失败——否则页面上会静默出现一个空白方块。
 */
function checkLogoCoverage(renderCore, logos) {
  const referenced = renderCore.logoKeys();
  const missing = referenced.filter(key => !logos[key]);
  if (missing.length) {
    throw new Error(`RENDER-CORE 引用了未登记的 logo: ${missing.join(', ')}（请补进 assets/logos/manifest.json）`);
  }
  const used = new Set(referenced);
  const unused = Object.keys(logos).filter(key => !used.has(key));
  console.log(`  logo 覆盖: 模板引用 ${referenced.length} 个 / 已登记 ${Object.keys(logos).length} 个` +
    (unused.length ? `（暂未使用: ${unused.join(', ')}）` : ''));
}

/* ------------------------------------------------------------------ */
/* 预渲染                                                              */
/* ------------------------------------------------------------------ */

function replaceMarker(html, marker, replacement) {
  if (!html.includes(marker)) {
    throw new Error(`index.html 缺少预渲染标记 ${marker}`);
  }
  return html.split(marker).join(replacement);
}

/** 默认视图（优惠 Tab、无筛选）的卡片 HTML */
function renderDeals(renderCore, payload) {
  const visible = renderCore.defaultVisible(payload.deals);
  const filters = renderCore.defaultFilters();
  const cards = renderCore.defaultCards(payload.deals);

  // 无损断言：折叠只改变呈现粒度，不能丢条目。
  // 折叠卡贡献 models.length 条，未折叠的单条卡贡献 1 条——两者之和必须等于未过期优惠数。
  const covered = cards.reduce((n, card) => n + (Array.isArray(card.models) ? card.models.length : 1), 0);
  if (covered !== visible.length) {
    throw new Error(`折叠丢失条目：卡片覆盖 ${covered} 条，未过期优惠 ${visible.length} 条`);
  }

  if (cards.length < MIN_PRERENDERED_CARDS) {
    throw new Error(`预渲染卡片只有 ${cards.length} 条，低于下限 ${MIN_PRERENDERED_CARDS}（数据或过滤逻辑异常）`);
  }

  // 分档分布：分档规则改了之后，这里是第一时间能看出「档位塌了」的地方
  const dist = new Map();
  cards.forEach(card => dist.set(card.tier, (dist.get(card.tier) || 0) + 1));
  const distText = [...dist.entries()].sort((a, b) => a[0] - b[0])
    .map(([tier, n]) => `档${tier}:${n}`).join(' ');

  return {
    html: renderCore.gridHtml(cards, filters),
    count: cards.length,
    cards: cards,
    visibleCount: visible.length,
    dist: distText,
    facets: renderCore.facetBarHtml(payload.deals, filters),
    categories: renderCore.categoryOptionsHtml(payload.deals),
    stats: renderCore.statsHtml(payload.deals, filters),
    topStat: renderCore.topStatHtml(payload.deals, payload.updatedAt)
  };
}

/* ---------------- FAQ：生成侧解析 + 复核侧独立解析 ---------------- */

/**
 * HTML 片段 → 页面可见的纯文本（单行）。
 *
 * 顺序是硬的：**先剥标签、后解码实体**。反过来的话，正文里合法写出的 `&lt;b&gt;`
 * 会在解码后变成真标签、再被剥掉——把内容吃掉。decodeEntities 的 `&amp;` 必须最后
 * 替换（否则 `&amp;lt;` 会被二次解码成 `<`），这条既有顺序不动。
 */
function plainText(fragment) {
  return decodeEntities(String(fragment).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/**
 * 取出 FAQ 区块（`<section class="faq">`）的 HTML，并先摘掉 `<script>`。
 *
 * 为什么必须摘脚本：渲染核心的源码就内联在页面里，里面有
 * `return '<details class="zht"' + …` 这样的**字符串字面量**。不摘掉的话，
 * 「扫全页 `<details>`」的实现会把它当成第 6 个问答（升级后的自检正是这样当场发现的）。
 *
 * 找不到 FAQ 区块就抛错而不是静默回退全页：那样「逐字一致」就无法被验证，
 * 应该让构建红掉，而不是拿一个错误的比对结果报绿。
 */
function faqSectionHtml(html) {
  const noScript = String(html).replace(/<script[\s\S]*?<\/script>/gi, '');
  const section = noScript.match(/<section[^>]*class="[^"]*\bfaq\b[^"]*"[^>]*>([\s\S]*?)<\/section>/);
  if (!section) throw new Error('找不到 FAQ 区块（<section class="faq">），无法核对可见文案与 FAQPage 是否一致');
  return section[1];
}

/**
 * 从已渲染的 HTML 中解析 FAQ 条目（**生成** FAQPage 用）。
 *
 * FAQPage 结构化数据必须与页面上可见的问答逐字一致，因此这里以 HTML 为唯一事实来源，
 * 而不是在 JS 里再抄一份文案（抄一份就一定会漂移）。
 *
 * 一个问答可以有多段（`<p>` 不止一个）。早先的正则写死了「一问一答只有一个 `<p>`」，
 * 遇到两段的问答（本站第 3 条就是这样）会把 `</p><p>` 当成答案文本的一部分带进 JSON-LD
 * ——这段脏数据已随线上产物发布过。现在按 `<details>` 整块取，答案里每个 `<p>` 当作一段，
 * 段落之间用单个空格连接，得到与页面可见文字一致、且不含任何标记的纯文本。
 */
function extractFaq(html) {
  const items = [];
  const re = /<details\b[^>]*>\s*<summary\b[^>]*>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g;
  const scope = faqSectionHtml(html);
  let m;
  while ((m = re.exec(scope)) !== null) {
    const paragraphs = [...m[2].matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)]
      .map(p => plainText(p[1]))
      .filter(Boolean);
    // 没有 <p> 的问答也要能解析：退回整块纯文本，绝不静默丢条目
    const answer = paragraphs.length ? paragraphs.join(' ') : plainText(m[2]);
    items.push({ question: plainText(m[1]), answer });
  }
  if (items.length < 3) {
    throw new Error(`只解析到 ${items.length} 条 FAQ，至少需要 3 条才能生成 FAQPage`);
  }
  return items;
}

/**
 * 从**最终 HTML** 里回读可见 FAQ（**复核**用）。刻意与 extractFaq() 不同源。
 *
 * extractFaq() 是生成结构化数据的那条路；可见侧若也调它，比较就是恒等的
 * （结构化数据本来就是它生成的），「逐字一致」这句断言永远不可能失败——
 * 上一个已发布缺陷（答案里夹带 `</p><p>`）正是这样溜过去的。
 *
 * 这里走第二条路，而且**段落拆法也不同**：生成侧匹配 `<p>…</p>` 成对标签，
 * 复核侧直接按「段落结束」切分。任何一侧出分歧——丢了一段、多带标签、
 * 边界处理不同、文案只改了一边——都会在下面的自检里报红。
 * 两侧共用「FAQ 区块」这个取景范围（取景错了会被下面的条数断言抓住）。
 */
function visibleFaq(html) {
  const items = [];
  const re = /<details\b[^>]*>([\s\S]*?)<\/details>/g;
  let m;
  while ((m = re.exec(faqSectionHtml(html))) !== null) {
    const body = m[1];
    const summary = body.match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/);
    if (!summary) continue;
    const paragraphs = body.slice(summary.index + summary[0].length)
      .split(/<\/(?:p|li|div)\s*>|<br\s*\/?>/i)
      .map(chunk => plainText(chunk))
      .filter(Boolean);
    items.push({ question: plainText(summary[1]), paragraphs });
  }
  return items;
}

function decodeEntities(text) {
  return String(text)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

/** 序列化 JSON-LD，转义可能提前闭合 </script> 的字符 */
function toJsonLd(data) {
  return JSON.stringify(data, null, 2)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function buildJsonLd(faqItems, cards) {
  const pageUrl = SITE_URL;
  const ogImage = SITE_URL + 'og-image.png';

  const organization = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': SITE_URL + '#organization',
    name: SITE_NAME,
    url: pageUrl,
    logo: SITE_URL + 'favicon.svg',
    description: SITE_DESCRIPTION
  };

  // WebSite：站点级身份节点。同类标杆里 devtk.ai 只有 2 类结构化数据就包含它，
  // 我们原先 4 类反而缺它（见 research/GAP-MATRIX.md G8 的补注）。
  const website = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': SITE_URL + '#website',
    url: pageUrl,
    name: SITE_NAME,
    description: SITE_DESCRIPTION,
    inLanguage: 'zh-CN',
    publisher: { '@id': SITE_URL + '#organization' }
  };

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: '首页', item: pageUrl },
      { '@type': 'ListItem', position: 2, name: 'AI 工具优惠', item: pageUrl }
    ]
  };

  const faqPage = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems.map(item => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer }
    }))
  };

  // ItemList：与页面可见卡片一一对应（折叠后一条优惠一张卡），顺序与页面一致。
  // 折叠卡把覆盖的模型名写进 description，保留「模型名 + 免费额度」这类长尾检索词。
  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'AI 工具优惠与免费额度',
    numberOfItems: cards.length,
    itemListElement: cards.map((card, index) => {
      const item = {
        '@type': 'ListItem',
        position: index + 1,
        name: card.title,
        url: card.url
      };
      if (Array.isArray(card.models)) {
        item.description = `覆盖 ${card.models.length} 个模型：${card.models.join('、')}`;
      }
      return item;
    })
  };

  return [organization, website, breadcrumb, faqPage, itemList]
    .map(data => `  <script type="application/ld+json">\n${toJsonLd(data)}\n  </script>`)
    .join('\n');
}

/** XML 文本转义在 lib/feeds.js（RSS 里一个裸 & 就能让整份 feed 解析失败） */

/** 详情页模板里做 HTML 转义：字符集与 XML 转义相同，直接复用 */
const htmlEscape = xmlEscape;

/* ------------------------------------------------------------------ */
/* 独立详情页                                                          */
/* ------------------------------------------------------------------ */

/**
 * 每条优惠一个独立静态页：`dist/deal/<id>/index.html`
 *
 * **为什么要做**：同类站里 11/12 都有路径型条目页（futuretools `/tools/:slug ×40`、
 * toolify `/tool/:slug ×27`、artificialanalysis `/models/:slug ×49`），而我们原先全站
 * 只有 1 个 URL、1 条内链（见 research/GAP-MATRIX.md G1）。这是「可发现性」的根因。
 *
 * **只共用一半，边界要写清楚**：页面主体直接调用 RENDER-CORE 的 `detailHtml()`——与首页详情弹层
 * 是同一个函数；`<style>`、主题前置脚本、页脚三者从**已组装好的 index.html** 里抽出来
 * （页脚靠 `<!--SHARED:footer:START/END-->` 标记，抽不到就抛错，见下面的 `writeDetailPages()`）。
 *
 * **但这三块是硬编码的第二份，没有任何标记或断言保证两边一致**：
 *   ① 品牌头部文案与 mark SVG（本文件下面 `<header class="top">` 里 `<a class="brand">` 那段 ↔ index.html:806-813）；
 *   ② `#themeSeg` 三个主题按钮（本文件下面的 `themeSeg` 常量 ↔ index.html:819-823）；
 *   ③ 详情页的主题切换脚本（本文件下面的 `themeBind` 常量 ↔ index.html:2163-2199，且把 `THEME_KEY`
 *      的值 `'dsh.theme'` 直接抄成字面量，不引用首页那个常量）。
 * 所以**改首页品牌文案或主题行为不会同步到 80 个详情页**，也不会报错。详见
 * PROJECT_STATUS.md「七、审计发现」的模板分叉那一节（那里记了 2026-09-23 工作区的确切行号；
 * 本文件自己的行号刻意不写——加几行注释就会整体位移）。
 *
 * **纯静态**：详情页不加载主脚本，不 fetch deals.json——没有列表要渲染，也就没有控制台错误；
 * 只保留一个极小的主题切换脚本（与首页同一套 localStorage 约定）。
 */
function writeDetailPages(payload, indexHtml, renderCore, plan) {
  const style = (indexHtml.match(/<style>[\s\S]*?<\/style>/) || [''])[0];
  const themeScript = (indexHtml.match(/<script>\s*\/\* 主题必须在首次绘制前决定[\s\S]*?<\/script>/) || [''])[0];
  const footerRaw = (indexHtml.match(/<!--SHARED:footer:START-->([\s\S]*?)<!--SHARED:footer:END-->/) || [])[1];
  if (!style || !themeScript || !footerRaw) {
    throw new Error('抽取详情页共用片段失败（style / 主题脚本 / 页脚）——检查 index.html 里的标记是否还在');
  }
  // 页脚在这条路径上**每页解析一次**（而不是提前解析成一份共用）：
  // 分析注入要按该页自己的路由判「要不要统计」，所以路由必须是这一页的。
  // 除分析占位符外，这段的解析结果与「提前解析一次」逐字相同。
  const footerTemplate = footerRaw.replace(/<span id="lastUpdated">--<\/span>/, '<span>见首页</span>');

  const themeSeg = `<div class="seg" id="themeSeg" role="group" aria-label="配色主题">
        <button type="button" data-theme-value="auto" aria-pressed="true">跟随系统</button>
        <button type="button" data-theme-value="light" aria-pressed="false">浅色</button>
        <button type="button" data-theme-value="dark" aria-pressed="false">深色</button>
      </div>`;

  const themeBind = `<script>
    /* 详情页是纯静态的：只需要主题切换，不拉数据、不渲染列表 */
    (function () {
      var seg = document.getElementById('themeSeg');
      document.body.classList.add('js');
      function current() {
        var t = document.documentElement.getAttribute('data-theme');
        return t === 'light' || t === 'dark' ? t : 'auto';
      }
      function paint() {
        var now = current();
        seg.querySelectorAll('[data-theme-value]').forEach(function (button) {
          var on = button.dataset.themeValue === now;
          button.classList.toggle('on', on);
          button.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
      }
      seg.addEventListener('click', function (event) {
        var button = event.target.closest('[data-theme-value]');
        if (!button) return;
        var value = button.dataset.themeValue;
        try {
          if (value === 'light' || value === 'dark') {
            document.documentElement.setAttribute('data-theme', value);
            localStorage.setItem('dsh.theme', value);
          } else {
            document.documentElement.removeAttribute('data-theme');
            localStorage.removeItem('dsh.theme');
          }
        } catch (error) { /* 隐私模式：本次会话内仍生效，只是记不住 */ }
        paint();
      });
      paint();
    })();
  </script>`;

  const deals = (payload.deals || []).filter(deal => deal.type === 'deal' && deal.id);
  const pages = [];

  for (const deal of deals) {
    const vendor = renderCore.vendorOf(deal);
    const tier = renderCore.tierOf(deal);
    const pageUrl = `${SITE_URL}deal/${encodeURIComponent(deal.id)}/`;
    // 这一页自己的页脚：路由显式给（`deal/<id>/`），分析注入因此按本页路由判定。
    const footer = finalizePage(footerTemplate, `deal/${deal.id}/`, '../../', 'writeDetailPages/footer').trim();
    const title = `${deal.title} — 官方优惠与免费额度 | ${SITE_NAME}`;
    const desc = (() => {
      // 描述：厂商 + 标题 + 优惠原文。**为什么要带标题前缀**：80 个详情页里有 17 条
      // （百度千帆那张表）的 `discountInfo` 是逐字相同的，只取 discountInfo 会让这 17 页
      // 的 meta description 完全一样 —— 重复描述在搜索结果里等于没有描述。
      // 前缀是数据本身（厂商名与标题），不是我们写的营销文案；截断沿用 `…` 留痕的规矩。
      const raw = `${vendor.name ? `${vendor.name}｜` : ''}${deal.title}：${String(deal.discountInfo || deal.description || SITE_NAME).replace(/\s+/g, ' ')}`;
      return raw.length > 150 ? `${raw.slice(0, 149).trimEnd()}…` : raw;
    })();
    const official = String(deal.url || '');
    // 站内位置：详情页挂到它自己的分类页（存在时）；厂商页则链在正文里（下面的「这家厂商的其他优惠」）。
    const categoryPage = plan
      ? plan.pages.find(page => page.kind === 'category' && page.indexable && page.key === deal.category)
      : null;
    const vendorPage = plan
      ? plan.pages.find(page => page.kind === 'vendor' && page.indexable && page.key === vendor.name)
      : null;

    // 结构化数据：WebPage（说清这一页是什么）+ BreadcrumbList（说清它在站内的位置）。
    // 刻意不用 Product/Offer：我们不是售卖方，标成商品会构成过度声明。
    const webPage = {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      '@id': pageUrl + '#page',
      url: pageUrl,
      name: deal.title,
      description: desc,
      inLanguage: 'zh-CN',
      isPartOf: { '@id': SITE_URL + '#website' },
      about: { '@type': 'Thing', name: [vendor.name, deal.category].filter(Boolean).join(' · ') }
    };
    const breadcrumb = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '首页', item: SITE_URL },
        // v1.7：分类那一级**存在就给 URL、不存在就只给名字**（省略 `item`）。
        // 旧实现把这个 `item` 指向站根 —— 那是一条「面包屑说自己在分类页、点开却是首页」的
        // 假链接，而没有任何断言会红（Tooth Test #5 就是为它写的）。
        categoryPage
          ? { '@type': 'ListItem', position: 2, name: deal.category, item: `${SITE_URL}${categoryPage.route}` }
          : { '@type': 'ListItem', position: 2, name: deal.category || '全部优惠' },
        { '@type': 'ListItem', position: 3, name: deal.title, item: pageUrl }
      ]
    };
    const jsonLd = [webPage, breadcrumb]
      .map(data => `  <script type="application/ld+json">\n${toJsonLd(data)}\n  </script>`)
      .join('\n');

    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${htmlEscape(title)}</title>
<meta name="description" content="${htmlEscape(desc)}">
<meta name="robots" content="index, follow, max-image-preview:large">
<link rel="canonical" href="${htmlEscape(pageUrl)}">
<link rel="alternate" hreflang="zh-CN" href="${htmlEscape(pageUrl)}">
<link rel="alternate" hreflang="x-default" href="${htmlEscape(pageUrl)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="${htmlEscape(SITE_NAME)}">
<meta property="og:url" content="${htmlEscape(pageUrl)}">
<meta property="og:title" content="${htmlEscape(deal.title)}">
<meta property="og:description" content="${htmlEscape(desc)}">
<meta property="og:image" content="${SITE_URL}og-image.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#f6f7f9" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0b0d10" media="(prefers-color-scheme: dark)">
<link rel="icon" href="../../favicon.svg" type="image/svg+xml">
${feeds.rootFeedTags('../../')}
<link rel="stylesheet" href="../../logos.css">
${themeScript}
${jsonLd}
${style}
</head>
<body>
  <header class="top">
    <div class="topin">
      <a class="brand" href="../../">
        <span class="mark" aria-hidden="true">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0l-7.2-7.2A2 2 0 0 1 3 12V4.6A1.6 1.6 0 0 1 4.6 3H12a2 2 0 0 1 1.4.6l7.2 7.2a2 2 0 0 1 0 2.6Z"/>
            <path d="M12 8v6"/><path d="m9.5 11.5 2.5 2.5 2.5-2.5"/>
          </svg>
        </span>
        <span class="btxt"><b>AI <em>优惠</em>聚合器</b><small>真实优惠 · 每日更新</small></span>
      </a>
      <a class="jumpback" href="../../">← 返回全部优惠</a>
      ${themeSeg}
    </div>
  </header>

  <div class="wrap">
    <main id="main" class="detail-main">
      <nav class="crumb" aria-label="面包屑">
        <a href="../../">首页</a> › ${categoryPage
    ? `<a href="../../${categoryPage.route}">${htmlEscape(deal.category)}</a>`
    : `<span>${htmlEscape(deal.category || '全部优惠')}</span>`} › <span>${htmlEscape(deal.title)}</span>
      </nav>
      <article class="dbody dpane" data-tier="${tier.n}">
${renderCore.detailHtml(deal, { headingTag: 'h1', prefix: '../../' })}
      </article>
      <p class="dpane-more">
${vendorPage
    ? `        这家厂商的其他优惠：<a href="../../${vendorPage.route}">${htmlEscape(vendor.name)} 的全部 ${vendorPage.count} 条</a>`
    : '        <a href="../../">← 返回全部优惠</a>'}
      </p>
      <p class="dpane-src">
        官方页：<a href="${htmlEscape(official)}" target="_blank" rel="noopener noreferrer">${htmlEscape(official)}</a>
        · 本站只做收录与整理，最终以厂商官方页面为准；排序与推荐理由不出售。
      </p>
    </main>
    ${footer}
  </div>
  ${themeBind}
</body>
</html>
`;

    const dir = path.join(OUT, 'deal', deal.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf8');
    pages.push({ id: deal.id, url: pageUrl, title: deal.title, text: String(deal.discountInfo || '') });
  }

  return pages;
}

/* ------------------------------------------------------------------ */
/* 数据源状态页（/status/）                                             */
/* ------------------------------------------------------------------ */

/**
 * 「数据源状态」静态页。
 *
 * 给谁看：项目维护者、技术用户、以及任何想核对「这个站到底还在不在更新」的人。
 * 它回答的是采集报告回答不了的那个问题：**某个来源是不是已经坏了几天**
 * （报告表只活在当次运行的内存里，而 store.js 会把策展条目的 lastSeen 刷成今天，
 * 于是「源坏了」与「源这次没新内容」在首页上长得一模一样）。
 *
 * 实现取舍：
 *  · 不引入任何外部请求，复用 index.html 的 `<style>` / 主题前置脚本 / 页脚，
 *    与详情页同一套抽取方式（样式只有一处，不会漂移）；
 *  · **构建确定性**：页面上只写绝对时间（北京时间），相对时间（「2 小时前」）由一个
 *    内联小脚本在浏览器里换算 —— 否则同一个数据在不同时刻构建会产出不同字节，
 *    与「连续两次 build 产物一致」的规矩冲突；无 JS 时读到的仍是完整信息。
 *  · 数据缺失（还没有过一次成功采集）时生成一页说明，而不是让构建失败。
 */
function renderStatusPage(healthDoc, indexHtml, route = 'status/') {
  const style = (indexHtml.match(/<style>[\s\S]*?<\/style>/) || [''])[0];
  const themeScript = (indexHtml.match(/<script>\s*\/\* 主题必须在首次绘制前决定[\s\S]*?<\/script>/) || [''])[0];
  const footerRaw = (indexHtml.match(/<!--SHARED:footer:START-->([\s\S]*?)<!--SHARED:footer:END-->/) || [])[1];
  if (!style || !themeScript || !footerRaw) {
    throw new Error('抽取状态页共用片段失败（style / 主题脚本 / 页脚）——检查 index.html 里的标记是否还在');
  }
  const footer = finalizePage(
    footerRaw.replace(/<span id="lastUpdated">--<\/span>/, '<span>见首页</span>'),
    route,
    '../',
    'renderStatusPage/footer'
  ).trim();
  const summary = health.summarize(healthDoc);
  const rows = summary.rows;

  // 标题与描述各只写一遍：它们同时出现在 <title> / <meta description> / 面包屑 / <h1> /
  // JSON-LD 里（5 处）。抄 5 份的后果不是「不一致得很难看」，而是**搜索引擎读到的那份
  // 与读者看到的那份不是同一句话**，而两边都不会报错。
  const STATUS_HEADING = '数据源状态';
  const STATUS_DESCRIPTION = '每个采集来源的最近一次结果：条数变化、最近成功时间、连续失败次数。用于核对本站的数据是不是真的还在更新。';

  // JSON-LD：#1 WebPage、#2 BreadcrumbList。
  //
  // 与分类页同一条约定：**一段一个对象**（塞成数组时 `JSON.parse(block)['@type']` 得到
  // undefined，自检既不抛错也不命中 —— 分类页第一版就是这么写的，被自检当场拦下）。
  //
  // 为什么不给这张表再发一份 `ItemList` / `Dataset`：机器可读的那一份是
  // `source-health.json`，页面上直接链着它。把同一份事实声明两次，两次迟早会分家，
  // 而分家时**没有任何东西会红**（两边各自看都自洽）。宁可少声明一次。
  const jsonLdBlocks = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: `${STATUS_HEADING} · ${SITE_NAME}`,
      description: STATUS_DESCRIPTION,
      url: `${SITE_URL}status/`,
      inLanguage: 'zh-CN',
      isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: SITE_URL }
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '首页', item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: STATUS_HEADING, item: `${SITE_URL}status/` }
      ]
    }
  ].map(data => `<script type="application/ld+json">
${JSON.stringify(data, null, 2).split('\n').map(line => `  ${line}`).join('\n')}
</script>`).join('\n');

  const rowHtml = row => {
    const label = health.STATUS_LABEL[row.status] || row.status;
    const reason = row.reason ? (health.REASON_LABEL[row.reason] || row.reason) : '';
    const missing = row.lastRunMissing ? '<small>本轮未跑（沿用上次结果）</small>' : '';
    return `
        <tr>
          <th scope="row">${htmlEscape(row.name || row.source)}<small>${htmlEscape(row.source)} · ${
  row.kind === 'headless' ? '无头浏览器' : '静态抓取'}${row.region === 'cn' ? ' · 国内' : ' · 国外'}</small>${missing}</th>
          <td class="st"><span class="stt ${htmlEscape(row.status)}">${htmlEscape(label)}</span>${
  reason ? `<small>${htmlEscape(reason)}</small>` : ''}</td>
          <td class="num">${Number(row.lastItemCount) || 0}</td>
          <td class="num">${row.previousItemCount === null || row.previousItemCount === undefined ? '—' : Number(row.previousItemCount)}</td>
          <td class="num">${Number(row.consecutiveFailures) || 0} / ${Number(row.consecutiveZero) || 0}</td>
          <td><time datetime="${htmlEscape(row.lastSuccessAt || '')}" data-rel>${htmlEscape(health.formatCN(row.lastSuccessAt))}</time></td>
        </tr>`;
  };

  const body = rows.length
    ? rows.map(rowHtml).join('')
    : '<tr><td colspan="6">还没有采集记录：这份文件由 `node scripts/collect.js` 写入，第一次采集成功后这里会有数据。</td></tr>';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${htmlEscape(STATUS_HEADING)} · ${htmlEscape(SITE_NAME)}</title>
<meta name="description" content="${htmlEscape(STATUS_DESCRIPTION)}">
<link rel="canonical" href="${SITE_URL}status/">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#f6f7f9" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0b0d10" media="(prefers-color-scheme: dark)">
<link rel="icon" href="../favicon.svg" type="image/svg+xml">
<!-- feed 约定：状态页自己不产出条目（订阅是「内容更新」语义，一页运维表不是更新），
     但必须能被订阅发现 —— 与首页、详情页、分类页声明同两个 feed。
     这一条是 v1.1 收口补的：此页原先只满足五条既有约定里的两条。 -->
${feeds.rootFeedTags('../')}
${themeScript}
${style}
<style>
  /* 只用首页已有的设计变量，不新建一套视觉语言 */
  .stop { display: flex; align-items: baseline; gap: var(--s2); flex-wrap: wrap; margin-bottom: var(--s2); }
  .stop h1 { font-size: 19px; margin: 0; }
  .stop .meta { color: var(--mut); font-size: var(--fs-sm); }
  .snote { color: var(--mut); font-size: var(--fs-sm); line-height: 1.7; margin: 0 0 var(--s3); max-width: 70ch; }
  .stable { width: 100%; border-collapse: collapse; background: var(--card); border: 1px solid var(--line); border-radius: var(--r); overflow: hidden; }
  .stable caption { text-align: left; color: var(--mut); font-size: var(--fs-sm); padding: 0 0 var(--s2); }
  .stable th, .stable td { text-align: left; padding: 10px 12px; border-top: 1px solid var(--line); font-weight: 400; font-size: var(--fs-sm); vertical-align: top; }
  .stable thead th { border-top: 0; color: var(--mut); font-weight: 600; white-space: nowrap; }
  .stable tbody th { font-weight: 600; }
  .stable small { display: block; color: var(--mut); font-weight: 400; font-size: 11.5px; margin-top: 2px; }
  .stable .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .stt { display: inline-block; padding: 2px 8px; border-radius: var(--r-pill); border: 1px solid var(--line); white-space: nowrap; }
  .stt.healthy { color: var(--ok, #137a4b); border-color: currentColor; }
  .stt.degraded { color: var(--warn, #a35a00); border-color: currentColor; }
  .stt.failed { color: var(--bad, #b3261e); border-color: currentColor; }
  .stable-wrap { overflow-x: auto; }
  @media (max-width: 760px) { .stable th, .stable td { padding: 8px 9px; } }
</style>
${jsonLdBlocks}
</head>
<body>
  <header class="top">
    <div class="topin">
      <a class="brand" href="../">
        <span class="mark" aria-hidden="true">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0l-7.2-7.2A2 2 0 0 1 3 12V4.6A1.6 1.6 0 0 1 4.6 3H12a2 2 0 0 1 1.4.6l7.2 7.2a2 2 0 0 1 0 2.6Z"/>
            <path d="M12 8v6"/><path d="m9.5 11.5 2.5 2.5 2.5-2.5"/>
          </svg>
        </span>
        <span class="btxt"><b>AI <em>优惠</em>聚合器</b><small>真实优惠 · 每日更新</small></span>
      </a>
      <a class="jumpback" href="../">← 返回全部优惠</a>
    </div>
  </header>

  <div class="wrap">
    <main id="main">
      <nav class="crumb" aria-label="面包屑"><a href="../">首页</a> › <span>${htmlEscape(STATUS_HEADING)}</span></nav>

      <div class="stop">
        <h1>${htmlEscape(STATUS_HEADING)}</h1>
        <span class="meta">数据生成时间 ${htmlEscape(health.formatCN(healthDoc && healthDoc.generatedAt))}（北京时间）</span>
      </div>
      <p class="snote">
        这里列出每个采集来源<b>最近一次</b>的结果与跨运行的连续性。为什么要公开它：
        首页只写「数据更新 {日期}」，而人工策展的条目每天都在刷新，所以「某个来源坏了几天」
        与「某个来源这次没有新内容」在首页上看起来是一样的——这一页把它们分开。
        状态规则：采集器报错、或连续 3 次零产出即 <b>❌ 失败</b>；请求成功但条数掉到上次一半以下、
        或零产出但还没到 3 次即 <b>⚠️ 异常</b>；其余为 <b>✅ 正常</b>。
        「连续失败 / 连续零产出」两列分别是这两个计数器的当前值。
      </p>

      <div class="stable-wrap">
      <table class="stable">
        <caption>共 ${summary.total} 个来源 · 正常 ${summary.healthy} · 异常 ${summary.degraded} · 失败 ${summary.failed}</caption>
        <thead>
          <tr>
            <th scope="col">来源</th>
            <th scope="col">状态</th>
            <th scope="col" class="num">本次条数</th>
            <th scope="col" class="num">上次条数</th>
            <th scope="col" class="num">连续失败 / 零产出</th>
            <th scope="col">最近成功</th>
          </tr>
        </thead>
        <tbody>${body}
        </tbody>
      </table>
      </div>

      <p class="snote" style="margin-top: var(--s3)">
        机器可读的同一份数据：<a href="../source-health.json">source-health.json</a>。
        本站只做收录与整理，来源站点的可用性、内容与最终条款以官方页面为准。
      </p>
    </main>
    ${footer}
  </div>
  <script>
    /* 相对时间只在浏览器里换算：页面字节因此与构建时刻无关（连续两次 build 产物一致）。
       禁用 JS 时读到的仍是完整的绝对时间。 */
    (function () {
      document.body.classList.add('js');
      var now = Date.now();
      Array.prototype.forEach.call(document.querySelectorAll('time[data-rel]'), function (el) {
        var at = Date.parse(el.getAttribute('datetime'));
        if (isNaN(at)) return;
        var minutes = Math.round((now - at) / 60000);
        var text = minutes < 1 ? '刚刚'
          : minutes < 60 ? minutes + ' 分钟前'
            : minutes < 1440 ? Math.round(minutes / 60) + ' 小时前'
              : Math.round(minutes / 1440) + ' 天前';
        el.setAttribute('title', el.textContent);
        el.textContent = text;
      });
    })();
  </script>
</body>
</html>
`;
}

/* ------------------------------------------------------------------ */
/* 变化雷达页（/changes/，v1.5）                                        */
/* ------------------------------------------------------------------ */

/**
 * 「优惠变化雷达」静态页：把首页那一行条带展开成五个分栏的完整视图。
 *
 * 与 `/status/`、目录页同一套做法（同一个 `<style>`、同一份页脚、同样的五条约定），
 * 但有两点是这一页特有的：
 *
 *   ① **正文由 RENDER-CORE 渲染**（`renderCore.changesPageHtml`），与首页条带共用模板；
 *      页面壳子（head / 面包屑 / 页脚）留在这里，因为那部分与站点其它页面必须逐字一致。
 *   ② 它是**数据的视图，不是数据的家**：真值是 `scripts/data/deal-history.json`，
 *      这里一个字节都不生成。日志不可用时这一页照常存在（路由不能凭空消失），
 *      但正文必须说「没有拿到历史日志」，而不是「没有变化」。
 */
/**
 * 给 `/changes/` 正文里的**代表行**补上 SEO 门禁数行用的 `data-item` 标记。
 *
 * ## 为什么是「代表行」而不是每一行
 *
 * 同一记录可以合法地出现在多个分栏里（一条优惠可以既有「最近 7 天变化」又有「已结束」
 * 与「重新出现」）。ItemList 是**记录级**视图：一个记录只能有一个 URL —— 发两条相同 URL
 * 既是重复计数，也会让「声明数 == 元素数 == 页面行数」这条对账永远差几条。
 * 所以两边共用 `changes.itemListRecords()` 给出的同一份集合（每个 id 一条，取最强事件），
 * 行标记只落在该记录**代表那一行**上；其余行照常显示（弱事件不因为不进 ItemList 而消失）。
 *
 * ## 为什么按「文档顺序 + 出现次数」定位
 *
 * RENDER-CORE（`index.html`）只给每行写 `data-kind` 与 `data-deal-id`，不写 `data-item`：
 * 那是**构建期**的决定（哪一行代表这条记录），不是模板的决定。顺序判据在
 * `changes.renderOrderOf()`，这里逐行回读核对（行数不等 / 代表行找不到都算失败），
 * 因此「判据与渲染分家」会在构建期就红，而不是变成读者页面上对不上的结构化数据。
 *
 * @param {string} body        `renderCore.changesPageHtml()` 的输出
 * @param {object[]} records   `changes.itemListRecords()` 的输出
 * @param {number} expectedRows 判据层的渲染顺序长度
 */
function markChangesRows(body, records, expectedRows) {
  const problems = [];
  const wanted = new Map();
  for (const record of records) wanted.set(`${record.id}\u0000${record.occurrence}`, record);
  const seen = new Map();
  let rows = 0;
  let marked = 0;
  const html = String(body || '').replace(
    /<li class="chgi" data-kind="([^"]*)" data-deal-id="([^"]*)">/g,
    (match, kindAttr, idAttr) => {
      rows++;
      const id = decodeEntities(idAttr);
      const occurrence = seen.get(id) || 0;
      seen.set(id, occurrence + 1);
      if (!wanted.has(`${id}\u0000${occurrence}`)) return match;
      marked++;
      return `<li class="chgi" data-item="${idAttr}" data-kind="${kindAttr}" data-deal-id="${idAttr}">`;
    }
  );
  if (rows !== expectedRows) {
    problems.push(`页面上的变化行 ${rows} 行 ≠ 判据层的渲染顺序 ${expectedRows} 项（分栏被裁剪或模板改了顺序？）`);
  }
  if (marked !== records.length) {
    problems.push(`ItemList 有 ${records.length} 条，页面上只标出了 ${marked} 条代表行`);
  }
  return { html, rows, marked, problems };
}

function renderChangesPage(radar, indexHtml, renderCore, context = {}) {
  const changeFeedTags = context.changeFeedTags || feeds.rootFeedTags('../');
  const style = (indexHtml.match(/<style>[\s\S]*?<\/style>/) || [''])[0];
  const themeScript = (indexHtml.match(/<script>\s*\/\* 主题必须在首次绘制前决定[\s\S]*?<\/script>/) || [''])[0];
  const footerRaw = (indexHtml.match(/<!--SHARED:footer:START-->([\s\S]*?)<!--SHARED:footer:END-->/) || [])[1];
  if (!style || !themeScript || !footerRaw) {
    throw new Error('抽取变化雷达页共用片段失败（style / 主题脚本 / 页脚）——检查 index.html 里的标记是否还在');
  }
  const footer = finalizePage(
    footerRaw.replace(/<span id="lastUpdated">--<\/span>/, '<span>见首页</span>'),
    'changes/',
    '../',
    'renderChangesPage/footer'
  ).trim();

  const W = changes.CHANGES_WORDING;
  const PAGE_HEADING = W.CHANGES_LABELS.pageTitle;
  const PAGE_DESCRIPTION = '优惠的变化按时间看：今日新增、最近 7 天变化、即将结束、已结束、重新出现。' +
    '全部来自本站采集与合并过程留下的变更记录，不猜测、不做语义改写。';
  const pageUrl = `${SITE_URL}changes/`;

  // JSON-LD：#1 CollectionPage、#2 BreadcrumbList、#3 ItemList。
  // 一段一个对象（塞成数组时自检读到的 @type 是 undefined，既不抛错也不命中）。
  //
  // ItemList 只收**真有详情页**的条目：给「已离开数据集」的条目发一个不存在的 URL，
  // 就是在结构化数据里造死链 —— 那比少声明几条更糟。
  //
  // v1.5 修复（P1-4 / F-r1-history-ai-001）：`numberOfItems` 与 `itemListElement`
  // 必须是**同一次**集合、且**按记录去重**（一个记录同时出现在多个分栏时只算一条，
  // 取最强事件——判据在 `changes.itemListRecords()`，与页面行标记共用）。
  // 修复前的写法是「声明数 = 五栏 totals 合计（含状态量与不可链接条目）vs 元素 = 按栏遍历的
  // 未去重列表」：只要有 1 条变化，两边就不可能相等，`itemlist-arity` 必红。
  const itemListRecords = changes.itemListRecords(radar);
  const jsonLdBlocks = [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: `${PAGE_HEADING} · ${SITE_NAME}`,
      description: PAGE_DESCRIPTION,
      url: pageUrl,
      inLanguage: 'zh-CN',
      isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: SITE_URL }
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '首页', item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: PAGE_HEADING, item: pageUrl }
      ]
    },
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: PAGE_HEADING,
      numberOfItems: itemListRecords.length,
      itemListElement: itemListRecords.map((record, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: `${SITE_URL}${record.href}`,
        name: record.name
      }))
    }
  ].map(data => `<script type="application/ld+json">
${JSON.stringify(data, null, 2).split('\n').map(line => `  ${line}`).join('\n')}
</script>`).join('\n');

  // 页面行标记：与上面的 ItemList 读**同一份**集合的同一个 `occurrence`。
  // 没有这一步，`page-kinds.js` 对 `changes` 声明的 `checkRows/checkMembers` 就是
  // 「声明它必须对账、却没有任何标记可对」—— 上一轮审计里 9 条 `itemlist-members`
  // 与 2 条 `itemlist-arity` 正是这么来的。
  const marked = markChangesRows(renderCore.changesPageHtml(radar, '../'), itemListRecords, changes.renderOrderOf(radar).length);
  if (marked.problems.length) {
    throw new Error(`/changes/ 的行标记与雷达不一致（判据与渲染分家了）：\n  - ${marked.problems.slice(0, 5).join('\n  - ')}`);
  }
  const dealsBody = marked.html
    .split('\n').map(line => `        ${line}`).join('\n');
  // v2.3：套餐变化。**不新做一页**：这一页本来就是「最近发生了什么变化」的落点，
  // 顶部加一行锚点导航把两块分开，block 由 `plans-page.js` 渲染（与套餐页共用同一句话）。
  const planBlock = context.planChanges
    ? plansPage.planChangesPageBlockHtml(context.planChanges, {
      prefix: '../',
      providerTable: context.providerTable || null,
      // 与 `/plans/coding/` 的那一块传**同一份上下文**：币种 / 额度单位 / 平台显示名
      // 都从套餐记录里取，同一件事在两页上才是同一句话（见 context.plansById 的注释）。
      plansById: context.plansById || null
    })
      .split('\n').map(line => `      ${line}`).join('\n')
    : '';
  // v3.0 Stage H：API 价格变化。**同样不新做一页** —— 这一页的任务就是回答
  // 「最近发生了什么变化」，而 API 计费的价格/模型/免费额度/限速变化是第三条独立的变化流
  // （另 一份数据、另 一份日志、另 一个起算日）。块由 `api-plans-page.js` 渲染，
  // 与 `/plans/api/` 共用同一句话（判据来自 `api-plan-history`，没有第二套变化检测）。
  const apiPlanBlock = context.apiPlanChanges
    ? apiPlansPage.apiPlanChangesPageBlockHtml(context.apiPlanChanges, { prefix: '../', providerTable: context.providerTable || null })
      .split('\n').map(line => `      ${line}`).join('\n')
    : '';
  const jumpNav = `      <nav class="chgjump" aria-label="变化分区">
        <a href="#deals">优惠变化</a>
        <span aria-hidden="true">·</span>
        <a href="#plans">套餐变化</a>
        <span aria-hidden="true">·</span>
        <a href="#api-plans">API 价格变化</a>
      </nav>
`;
  const body = `${jumpNav}      <section class="chgdeals" id="deals" aria-label="优惠变化">
${dealsBody}
      </section>

${planBlock}
${apiPlanBlock}`;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${htmlEscape(PAGE_HEADING)} · ${htmlEscape(SITE_NAME)}</title>
<meta name="description" content="${htmlEscape(PAGE_DESCRIPTION)}">
<link rel="canonical" href="${pageUrl}">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#f6f7f9" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0b0d10" media="(prefers-color-scheme: dark)">
<link rel="icon" href="../favicon.svg" type="image/svg+xml">
<!-- feed 约定：这一页自己不产出条目（订阅是「内容更新」语义），但**必须订到变化本身** ——
     v1.6 起声明的是变化 Feed（v1.5 报告里「雷达没有自己的订阅源」那条技术债的收口）。 -->
${changeFeedTags}
${themeScript}
${style}
<style>
  /* 只用首页已有的设计变量，不新建一套视觉语言。
     列表式（不是宽表）：手机上自然换行、不产生横向滚动 —— 与目录页的表格相反，
     这里每行都有一段可能很长的原文（原值 → 新值），表格会把手机变成横向滚动条。 */
  .chgmeta { display: flex; align-items: baseline; gap: var(--s3); flex-wrap: wrap; color: var(--mut); font-size: var(--fs-sm); margin: 0 0 var(--s3); }
  .snote { color: var(--mut); font-size: var(--fs-sm); line-height: 1.7; margin: 0 0 var(--s3); max-width: 70ch; }
  .snote.chgwarn { color: var(--warn, #a35a00); }
  .chgsec { margin: 0 0 var(--s4); border-top: 1px solid var(--line); padding-top: var(--s3); }
  .chgsec h2 { font-size: 15px; margin: 0 0 var(--s2); }
  .chglist { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .chgi { background: var(--card); border: 1px solid var(--line); border-radius: var(--r); padding: 10px 12px; }
  .chgh { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px var(--s2); font-size: var(--fs-sm); }
  .chgh time { color: var(--mut); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .chgt { color: var(--deal-ink); background: var(--dealsoft); border-radius: var(--r-sm); padding: 0 var(--s1); font-weight: 600; }
  .chgf { color: var(--mut); }
  .chgn { color: var(--ink); font-weight: 600; text-decoration: none; overflow-wrap: anywhere; }
  a.chgn:hover { color: var(--brand); text-decoration: underline; text-underline-offset: 2px; }
  a.chgn:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
  .chgv { display: grid; gap: 2px; margin-top: 4px; font-size: var(--fs-sm); overflow-wrap: anywhere; }
  .chgv .chgold { color: var(--mut); }
  .chgv .chgnew { color: var(--ink); }
  .chgv .chgnote { color: var(--mut); font-size: 11.5px; }
  .chgempty, .chgmore { color: var(--mut); font-size: var(--fs-sm); margin: 0; }
  .chgother { margin: var(--s4) 0 0; border-top: 1px solid var(--line); padding-top: var(--s3); }
  .chgother > summary { cursor: pointer; font-size: 14px; font-weight: 600; color: var(--ink2); }
  .chgother > summary:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
  .chgother[open] > summary { margin-bottom: var(--s3); }
  /* v2.3：套餐变化块（与 /plans/coding/ 的最近变化块共用同一套行样式）。 */
  .chgjump { display: flex; gap: var(--s2); align-items: baseline; margin: 0 0 var(--s3); font-size: var(--fs-sm); }
  .chgjump a { color: var(--brand); text-decoration: none; border-bottom: 1px dotted var(--line); }
  .chgsub { margin: var(--s3) 0 0; }
  .chgsub h3 { font-size: 13.5px; margin: 0 0 var(--s1); color: var(--ink2); }
  .pchglist { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .pchglist li { display: flex; align-items: baseline; gap: var(--s2); flex-wrap: wrap; font-size: var(--fs-sm); }
  .pchgwhen { color: var(--mut); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .pchgwho { color: var(--ink); text-decoration: none; }
  a.pchgwho { border-bottom: 1px dotted var(--line); }
  .pchgtype { color: var(--deal-ink); background: var(--dealsoft); border-radius: var(--r-sm); padding: 0 var(--s1); }
  .pchgwhat { color: var(--ink); }
  .pchgorigin { color: var(--mut); }
  .pchnone { color: var(--mut); font-size: var(--fs-sm); margin: 0; }
  .chgsec.pchanges { margin-top: var(--s4); }
  /* v3.0 Stage H：API 价格变化块（与套餐那一块同一条间隔纪律）。 */
  .chgsec.apichanges { margin-top: var(--s4); }
  @media (max-width: 760px) {
    .chgi { padding: 9px 10px; }
    .chgh { gap: 2px var(--s2); }
  }
</style>
${jsonLdBlocks}
</head>
<body>
  <header class="top">
    <div class="topin">
      <a class="brand" href="../">
        <span class="mark" aria-hidden="true">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0l-7.2-7.2A2 2 0 0 1 3 12V4.6A1.6 1.6 0 0 1 4.6 3H12a2 2 0 0 1 1.4.6l7.2 7.2a2 2 0 0 1 0 2.6Z"/>
            <path d="M12 8v6"/><path d="m9.5 11.5 2.5 2.5 2.5-2.5"/>
          </svg>
        </span>
        <span class="btxt"><b>AI <em>优惠</em>聚合器</b><small>真实优惠 · 每日更新</small></span>
      </a>
      <a class="jumpback" href="../">← 返回全部优惠</a>
    </div>
  </header>

  <div class="wrap">
    <main id="main">
      <nav class="crumb" aria-label="面包屑"><a href="../">首页</a> › <span>${htmlEscape(PAGE_HEADING)}</span></nav>
${body}
    </main>
    ${footer}
  </div>
</body>
</html>
`;
}

/* ------------------------------------------------------------------ */
/* 套餐对比页（/plans/coding/，v2.1 第二段）                             */
/* ------------------------------------------------------------------ */

/**
 * 套餐对比页。
 *
 * ## 为什么它是「独立路由」而不是落地页家族的一员
 *
 * `landing.js` 的 `planLandingPages()` 产出的每一页都是**按数据分组的家族**
 * （一个厂商一页、一个分类一页，`itemsOf()` 用 `match.by` 决定谁属于哪一页）。
 * 套餐对比页只有**一条**路由 `/plans/coding/`，它不分页也不需要门槛 ——
 * 硬把它塞进那张家族表，会为了「统一」而引入一条永远只有一个成员的注册表。
 * 所以它走的是 `/status/` `/changes/` `/feeds/` 那一条既有路径：**独立静态页**。
 * 代价是下面四张清单（sitemap 计数、`pageRoutes`、页脚深度扫描、订阅声明扫描）
 * 都要显式加上它 —— 而这正是「新增一条路由是一个决定，不是一次手滑」的落点。
 *
 * ## 页面正文不在这里
 *
 * 正文、列模型、诚实性断言都在 `lib/plans-page.js`（纯函数，能被离线自测直接调用）。
 * 这一层只套壳：`<head>`、主题脚本、页头、页脚、JSON-LD。
 */
function renderPlansPage(planStore, indexHtml, context = {}) {
  const prefix = '../../'; // /plans/coding/ 是两层路由
  const style = (indexHtml.match(/<style>[\s\S]*?<\/style>/) || [''])[0];
  const themeScript = (indexHtml.match(/<script>\s*\/\* 主题必须在首次绘制前决定[\s\S]*?<\/script>/) || [''])[0];
  const footerRaw = (indexHtml.match(/<!--SHARED:footer:START-->([\s\S]*?)<!--SHARED:footer:END-->/) || [])[1];
  if (!style || !themeScript || !footerRaw) {
    throw new Error('抽取套餐对比页共用片段失败（style / 主题脚本 / 页脚）——检查 index.html 里的标记是否还在');
  }
  const footer = finalizePage(
    footerRaw.replace(/<span id="lastUpdated">--<\/span>/, '<span>见首页</span>'),
    plansPage.PLANS_ROUTE,
    prefix,
    'renderPlansPage/footer'
  ).trim();

  // v2.3：这一页**有专属订阅源**（套餐变化），必须声明它 —— 与根 Feed 并列，
  // 而不是替换：读者既可以订全站优惠，也可以只订套餐变化。
  // v3.0：这一页有专属订阅源（Coding 套餐变化），必须声明它 —— 与根 Feed 并列，而不是替换。
  // 取法收敛到注册表：`feedsForPage` 按路由解析（此前是按 spec id 写死的）。
  const planOwnFeeds = feeds.feedsForPage({ route: plansPage.PLANS_ROUTE }, context.allFeeds || []);
  const planFeed = planOwnFeeds[0] || { spec: feeds.PLAN_CHANGE_FEED };

  const pageUrl = `${SITE_URL}${plansPage.PLANS_ROUTE}`;
  const plans = planStore.plans || [];
  const providerTable = context.providerTable || null;

  // JSON-LD：一段一个对象（塞成数组时自检读到的 @type 是 undefined，既不抛错也不命中）。
  const jsonLdBlocks = plansPage.plansJsonLd(plans, { siteUrl: SITE_URL, providerTable })
    .map(data => `<script type="application/ld+json">
${JSON.stringify(data, null, 2).split('\n').map(line => `  ${line}`).join('\n')}
</script>`).join('\n');

  const body = plansPage.plansPageBody(plans, {
    providerTable,
    planChanges: context.planChanges || null,
    planHistoryStore: context.planHistoryStore || null,
    // v2.4：优惠 ↔ 套餐视图（判据在 lib/deal-plan-links.js，这里只把算好的结果传下去）
    dealLinks: context.dealLinks || null,
    prefix
  });

  const css = `
  /* v2.2：筛选 / 搜索 / 排序 / 行内展开。
     控件整块由 JS（scripts/lib/plans-compare.js，源码逐字节内联在页面底部）建出来，
     所以无 JS 时这些规则没有作用对象，也不存在"点了没反应"的死控件。 */
  .pnoscript { margin: 0 0 var(--s2); }
  .pctl { display: flex; flex-direction: column; gap: var(--s1); margin: 0 0 var(--s2); }
  .pctl:empty { display: none; }
  .pcrow { display: flex; align-items: center; gap: var(--s2); flex-wrap: wrap; }
  .pclb { color: var(--mut); font-size: var(--fs-sm); }
  .pchips { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
  .pclab { display: inline-flex; align-items: center; gap: 6px; color: var(--mut); font-size: var(--fs-sm); }
  .psearch {
    display: inline-flex; align-items: center; gap: 6px; padding: 0 8px;
    border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--card);
  }
  .psearch input { border: 0; outline: 0; background: 0; padding: 6px 0; font: inherit; font-size: 12px; color: var(--ink); min-width: 10ch; }
  .pctail .pstatus { color: var(--mut); font-size: var(--fs-sm); margin-right: auto; }
  .pdetbtn {
    margin-left: 6px; font: inherit; font-size: 11.5px; color: var(--brand); background: none;
    border: 1px solid var(--line); border-radius: var(--r-pill); padding: 0 8px; cursor: pointer;
  }
  .pdetbtn:hover { border-color: var(--brand); }
  /* hidden 必须真的不显示：作者级声明会盖掉 UA 样式表里的 [hidden]{display:none} */
  .ptable tr[hidden] { display: none; }
  .pdetail td { background: var(--bg); }
  .pdetailbody { max-width: 72ch; }
  .pdetailbody dl { display: grid; grid-template-columns: 5.5em minmax(0, 1fr); gap: 2px 8px; margin: 0 0 var(--s2); }
  .pdetailbody dt { color: var(--mut); }
  .pdetailbody dd { margin: 0; }
  .pdetailbody h3 { font-size: 13px; margin: var(--s2) 0 var(--s1); }
  .pev { margin: 0; padding-left: 1.1em; }
  .pev li { margin-bottom: var(--s2); }
  .pevfield { color: var(--mut); }
  .pev q { display: block; margin: 2px 0; }
  .pev small { color: var(--mut); }
  /* v2.3：最近变化块与详情里的时间线。只用首页已有的设计变量，不新建视觉语言。
     块本身是纯静态内容（无控件），因此无 JS 时同样可读 —— 这是这一页「无 JS 可读」的延续。 */
  .pchanges { margin: 0 0 var(--s3); border: 1px solid var(--line); border-radius: var(--r); padding: var(--s3); background: var(--card); }
  .pchanges .ph2 { margin: 0 0 var(--s2); }
  .pchglist { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .pchglist li { display: flex; align-items: baseline; gap: var(--s2); flex-wrap: wrap; font-size: var(--fs-sm); }
  .pchgwhen { color: var(--mut); font-variant-numeric: tabular-nums; }
  .pchgwho { color: var(--ink); text-decoration: none; }
  a.pchgwho { border-bottom: 1px dotted var(--line); }
  .pchgtype { color: var(--brand); }
  .pchgwhat { color: var(--ink); }
  .pchgorigin { color: var(--mut); }
  .pchnone, .pchnote { color: var(--mut); font-size: var(--fs-sm); margin: var(--s1) 0 0; }
  .pchgtl { margin-top: 2px; }
  /* v2.4：各套餐当前优惠（Deal ↔ Plan）。纯静态内容（无控件），无 JS 时同样可读。
     当前优惠与历史优惠刻意长得不一样：把「已结束」排成和「现在有」同样的样子，
     等于用排版替读者做了一个不成立的判断。 */
  .pplandeals { margin: var(--s3) 0; border: 1px solid var(--line); border-radius: var(--r); padding: var(--s3); background: var(--card); }
  .pplandeals .ph2 { margin: 0 0 var(--s2); }
  .pdlist { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .pdrow { display: flex; align-items: baseline; gap: var(--s2); flex-wrap: wrap; font-size: var(--fs-sm); }
  .pdrow + .pdrow { border-top: 1px solid var(--line2); padding-top: 6px; }
  .pdwho { color: var(--ink); text-decoration: none; border-bottom: 1px dotted var(--line); }
  .pdwho:hover { color: var(--brand); }
  .pdcur { color: var(--ink); }
  .pdsave { color: var(--ok); font-weight: 600; }
  .pdnone { color: var(--mut); }
  .pdhist { color: var(--mut); }
  .pdgo { color: var(--brand); text-decoration: none; }
  .pdgo:hover { text-decoration: underline; text-underline-offset: 2px; }
  .pdgo-hist { color: var(--mut); }
  .pdsum { color: var(--mut); font-size: var(--fs-sm); margin: var(--s2) 0 0; }
  /* 窄屏：横滚 + 前两列固定（只有一张表、一套数据模板）。
     第一列给**确定宽度**，第二列的 left 才有确定的落点；两列用不透明底色，否则会透出滑过的单元格。
     ⚠️ .ptable 自带 overflow: hidden（桌面端圆角裁剪用的），它会成为**最近的可滚动祖先**，
     于是粘性单元格相对它定位、而滚动的却是外层容器 —— 实测滚动 300px 后首列 left = -283px（等于没粘住）。
     窄屏必须让表格不裁剪，把圆角交给外层。 */
  @media (max-width: 760px) {
    .ptable-wrap { border-radius: var(--r); }
    .ptable { overflow: visible; }
    /* 窄屏把每一组 chip 收成**一行横滑**（与首页筛选条 .facetsin 同一条既有做法）：
       8 个平台 + 3 个额度类型 + 2 个地区折行后会把控件区撑到 440px，表格因此掉到首屏之外。
       不做"横滑容器里藏入口"那套：这一组的每一项仍是一次横滑就能看到。 */
    .pchips { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; }
    .pchips::-webkit-scrollbar { display: none; }
    .pctl .f { padding: 3px 9px; }
    .ptable thead th:first-child, .ptable tbody th:first-child {
      position: sticky; left: 0; width: 6.5em; white-space: normal; background: var(--card); z-index: 2;
    }
    .ptable thead th:nth-child(2), .ptable tbody td:nth-child(2) {
      position: sticky; left: 6.5em; background: var(--card); z-index: 2;
      box-shadow: 1px 0 0 var(--line); max-width: 10em; white-space: normal; overflow-wrap: anywhere;
    }
    /* 详情行**刻意不粘**：它的单元格 colspan=11（比滚动视口宽得多），粘性元素无法同时满足
       两个方向的约束，浏览器因此整体不位移（实测滚动 300px 后 left = -283px，等于没粘）。
       与其留一条看起来在粘、实际没粘的规则，不如把这件事写在这里。 */
  }
`;
  const compareScript = `<script>
/* scripts/lib/plans-compare.js —— 逐字节内联（离线自测 require 的也是同一份） */
${plansCompareSource()}
</script>`;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${htmlEscape(plansPage.PLANS_HEADING)} · ${htmlEscape(SITE_NAME)}</title>
<meta name="description" content="${htmlEscape(plansPage.PLANS_DESCRIPTION)}">
<link rel="canonical" href="${pageUrl}">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#f6f7f9" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0b0d10" media="(prefers-color-scheme: dark)">
<link rel="icon" href="${prefix}favicon.svg" type="image/svg+xml">
<!-- feed 约定：与首页、状态页、变化页声明同两个根 Feed；v2.3 起另加**本页专属的
     套餐变化源**（这一页不产出优惠条目，但它自己确实有一条变化流）。 -->
${feeds.rootFeedTags(prefix)}
${feeds.feedLinkTags([planFeed], prefix)}
${themeScript}
${style}
<style>
  /* 只用首页已有的设计变量，不新建一套视觉语言。
     这是一张**宽表**（11 列），所以外层必须有横滚容器：
     /status/ 那一页的教训是「桌面端一切正常、手机上整页横滚，而所有静态检查都是绿的」。 */
  .stop { display: flex; align-items: baseline; gap: var(--s2); flex-wrap: wrap; margin-bottom: var(--s2); }
  .stop h1 { font-size: 19px; margin: 0; }
  .stop .meta { color: var(--mut); font-size: var(--fs-sm); }
  /* ⚠️ 这一页底部的口径文案**不收窄**（v2.2 上线后的修复）。
     早先按"长文段 82ch 更好读"写了个上限，但 ch 量的是 "0" 的宽度（12px 字体下约 6px），
     于是 82ch ≈ 490px —— 正文容器有 1400px，整段只占左边 1/3，句子还被切在词中间
     （「…本页照原样列 / 出，不互相换算」），正文右侧留下一条巨大的空白。
     口径说明是**必须读完才能理解这一页**的内容，宽度就该跟随正文容器；
     想要收窄的是"可选的长文"，不是它。 */
  .snote { color: var(--mut); font-size: var(--fs-sm); line-height: 1.7; margin: 0 0 var(--s3); max-width: none; }
  .ph2 { font-size: 15px; margin: var(--s4) 0 var(--s2); }
  .plist { margin: 0; padding-left: 1.15em; color: var(--mut); font-size: var(--fs-sm); line-height: 1.8; max-width: none; }
  .plist b { color: var(--ink2); }
  .ptable-wrap { overflow-x: auto; }
  .ptable { width: 100%; border-collapse: collapse; background: var(--card); border: 1px solid var(--line); border-radius: var(--r); overflow: hidden; }
  .ptable caption { text-align: left; color: var(--mut); font-size: var(--fs-sm); padding: 0 0 var(--s2); }
  .ptable th, .ptable td { text-align: left; padding: 9px 11px; border-top: 1px solid var(--line); font-weight: 400; font-size: var(--fs-sm); vertical-align: top; }
  .ptable thead th { border-top: 0; color: var(--mut); font-weight: 600; white-space: nowrap; }
  .ptable tbody th { font-weight: 600; white-space: nowrap; }
  .ptable td { min-width: 92px; }
  .ptable small { display: block; color: var(--mut); font-weight: 400; font-size: 11.5px; margin-top: 2px; line-height: 1.5; }
  .ptable .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .ptable .num small { text-align: right; }
  .ptable a { color: var(--brand); }
  .ptag { margin-left: 4px; color: var(--mut); border: 1px solid var(--line); border-radius: var(--r-pill); padding: 0 6px; font-size: 10.5px; }
  .pnone { color: var(--mut); }
  @media (max-width: 760px) { .ptable th, .ptable td { padding: 8px 9px; } }
${css}</style>
${jsonLdBlocks}
</head>
<body>
  <header class="top">
    <div class="topin">
      <a class="brand" href="${prefix}">
        <span class="mark" aria-hidden="true">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0l-7.2-7.2A2 2 0 0 1 3 12V4.6A1.6 1.6 0 0 1 4.6 3H12a2 2 0 0 1 1.4.6l7.2 7.2a2 2 0 0 1 0 2.6Z"/>
            <path d="M12 8v6"/><path d="m9.5 11.5 2.5 2.5 2.5-2.5"/>
          </svg>
        </span>
        <span class="btxt"><b>AI <em>优惠</em>聚合器</b><small>真实优惠 · 每日更新</small></span>
      </a>
      <a class="jumpback" href="${prefix}">← 返回全部优惠</a>
    </div>
  </header>

  <div class="wrap">
    <main id="main">
${body}
    </main>
    ${footer}
  </div>
${compareScript}
</body>
</html>
`;
}

/* ------------------------------------------------------------------ */
/* API / Token 计费对比页（/plans/api/，v2.5）                          */
/* ------------------------------------------------------------------ */

/**
 * API 计费对比页。
 *
 * 与套餐页同一套「独立静态路由」的做法（理由见 `renderPlansPage` 的注释），
 * 但**没有交互脚本**：这一版是一张预渲染的静态表 —— 题面 §七 明确"第一版只提供…
 * 不要一开始实现复杂 workload calculator"，而筛选/排序控件是"替读者挑子集"的能力，
 * 在没有稳定的比较口径之前不该先做。
 *
 * 代价同样落在四张清单上（sitemap 计数、`pageRoutes`、页脚深度扫描、SEO 页面类型表）。
 */
function renderApiPlansPage(apiStore, indexHtml, context = {}) {
  const prefix = '../../'; // /plans/api/ 同样是两层路由
  const style = (indexHtml.match(/<style>[\s\S]*?<\/style>/) || [''])[0];
  const themeScript = (indexHtml.match(/<script>\s*\/\* 主题必须在首次绘制前决定[\s\S]*?<\/script>/) || [''])[0];
  const footerRaw = (indexHtml.match(/<!--SHARED:footer:START-->([\s\S]*?)<!--SHARED:footer:END-->/) || [])[1];
  if (!style || !themeScript || !footerRaw) {
    throw new Error('抽取 API 计费页共用片段失败（style / 主题脚本 / 页脚）——检查 index.html 里的标记是否还在');
  }
  const footer = finalizePage(
    footerRaw.replace(/<span id="lastUpdated">--<\/span>/, '<span>见首页</span>'),
    apiPlansPage.API_PLANS_ROUTE,
    prefix,
    'renderApiPlansPage/footer'
  ).trim();

  const pageUrl = `${SITE_URL}${apiPlansPage.API_PLANS_ROUTE}`;
  const plans = apiStore.plans || [];
  const providerTable = context.providerTable || null;

  // v3.0 Stage H4：这一页**有自己的订阅源**（API 价格变化），必须在 `<head>` 里声明它 ——
  // 与根 Feed 并列，而不是替换。取法与 `/plans/coding/` 一致：**都从注册表推导**
  // （`feedsForPage` 按路由解析），不在模板里写死 spec id。
  const apiOwnFeedTags = feeds.feedLinkTags(
    feeds.feedsForPage({ route: apiPlansPage.API_PLANS_ROUTE }, context.allFeeds || []), prefix);

  const jsonLdBlocks = apiPlansPage.apiPlansJsonLd(plans, { siteUrl: SITE_URL, providerTable })
    .map(data => `<script type="application/ld+json">
${JSON.stringify(data, null, 2).split('\n').map(line => `  ${line}`).join('\n')}
</script>`).join('\n');

  const body = apiPlansPage.apiPlansPageBody(plans, {
    providerTable,
    historyStore: context.apiPlanHistoryStore || null,
    dealLinks: context.dealLinks || null,
    prefix
  });

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${htmlEscape(apiPlansPage.API_PLANS_HEADING)} · ${htmlEscape(SITE_NAME)}</title>
<meta name="description" content="${htmlEscape(apiPlansPage.API_PLANS_DESCRIPTION)}">
<link rel="canonical" href="${pageUrl}">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#f6f7f9" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0b0d10" media="(prefers-color-scheme: dark)">
<link rel="icon" href="${prefix}favicon.svg" type="image/svg+xml">
<!-- v2.5：这一页的「平台」列会写 data-logo 属性，所以必须引用 logos.css ——
     漏了它的表现是**每一行的 logo 位是一个空方块**（页面看起来只是"有点空"），
     而真浏览器那一条「没有 JS 错误、没有外部请求」的断言不会红（缺的是本地样式表，
     既不报错也不发外部请求）。这是构建期自检「模板引用的 logo key 全部已登记」查不到的那一类。 -->
<link rel="stylesheet" href="${prefix}logos.css">
${apiOwnFeedTags}
${feeds.rootFeedTags(prefix)}
${themeScript}
${style}
<style>
  /* 只用首页已有的设计变量，不新建一套视觉语言。 */
  .stop { display: flex; align-items: baseline; gap: var(--s2); flex-wrap: wrap; margin-bottom: var(--s2); }
  .stop h1 { font-size: 19px; margin: 0; }
  .stop .meta { color: var(--mut); font-size: var(--fs-sm); }
  .snote { color: var(--mut); font-size: var(--fs-sm); line-height: 1.7; margin: 0 0 var(--s3); max-width: none; }
  .ph2 { font-size: 15px; margin: var(--s4) 0 var(--s2); }
  .plist { margin: 0; padding-left: 1.15em; color: var(--mut); font-size: var(--fs-sm); line-height: 1.8; max-width: none; }
  .plist b { color: var(--ink2); }
  .ptable-wrap { overflow-x: auto; }
  .ptable { width: 100%; border-collapse: collapse; background: var(--card); border: 1px solid var(--line); border-radius: var(--r); overflow: hidden; }
  .ptable caption { text-align: left; color: var(--mut); font-size: var(--fs-sm); padding: 0 0 var(--s2); }
  .ptable th, .ptable td { text-align: left; padding: 9px 11px; border-top: 1px solid var(--line); font-weight: 400; font-size: var(--fs-sm); vertical-align: top; }
  .ptable thead th { border-top: 0; color: var(--mut); font-weight: 600; white-space: nowrap; }
  .ptable tbody th { font-weight: 600; white-space: nowrap; }
  .ptable td { min-width: 84px; }
  .ptable small { display: block; color: var(--mut); font-weight: 400; font-size: 11.5px; margin-top: 2px; line-height: 1.5; }
  .ptable .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .ptable a { color: var(--brand); }
  .pvname { margin-left: 2px; }
  /* 平台列里的 logo 用**首页那一套** class="lg"（图形来自 logos.css）：
     只把尺寸与那套"叠放"用的负外边距收掉，其余（圆角 / 描边 / 白底）保持品牌图形的既有观感。
     ⚠️ 这段文字在 JS 模板字符串里，所以**不许出现反引号**：[点号] + [lg] 那种写法会把模板提前截断，
     症状是构建报 "… .lg is not a function" —— 离原因很远，实测踩过两次。 */
  .ptable .lg { width: 16px; height: 16px; margin: 0 5px 0 0; border: 0; box-shadow: none; border-radius: 3px; vertical-align: -3px; }
  .punit { white-space: nowrap; }
  .pnone { color: var(--mut); }
  .pfree { min-width: 148px; }
  .pdate { white-space: nowrap; font-variant-numeric: tabular-nums; }
  .pftlist { margin: 0; padding-left: 1.15em; color: var(--ink2); font-size: var(--fs-sm); line-height: 1.75; }
  .pftlist li { margin-bottom: var(--s2); }
  .pftdesc { color: var(--mut); }
  .pevd { margin: 0 0 var(--s2); border: 1px solid var(--line); border-radius: var(--r); padding: var(--s2) var(--s3); background: var(--card); }
  .pevd summary { cursor: pointer; font-size: var(--fs-sm); color: var(--ink2); }
  .pev { margin: var(--s2) 0 0; padding-left: 1.1em; }
  .pev li { margin-bottom: var(--s2); }
  .pevfield { color: var(--mut); }
  .pev q { display: block; margin: 2px 0; }
  .pev small { color: var(--mut); }
  .pchglist { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .pchglist li { display: flex; align-items: baseline; gap: var(--s2); flex-wrap: wrap; font-size: var(--fs-sm); }
  .pchgwhen { color: var(--mut); font-variant-numeric: tabular-nums; }
  .pchgwho { color: var(--ink); }
  .pchgtype { color: var(--brand); }
  .pchgwhat { color: var(--ink2); }
  .pchgorigin { color: var(--mut); }
  /* 窄屏：容器内横滚 + 前两列固定（只有一张表、一套数据模板）。
     与套餐页同一条教训：.ptable 自带的 overflow:hidden 会成为最近的可滚动祖先，
     所以窄屏必须让它不裁剪、把圆角交给外层。 */
  @media (max-width: 760px) {
    .ptable-wrap { border-radius: var(--r); }
    .ptable { overflow: visible; }
    .ptable thead th:first-child, .ptable tbody td:first-child {
      position: sticky; left: 0; width: 6.5em; white-space: normal; background: var(--card); z-index: 2;
    }
    .ptable thead th:nth-child(2), .ptable tbody th:nth-child(2) {
      position: sticky; left: 6.5em; background: var(--card); z-index: 2;
      box-shadow: 1px 0 0 var(--line); max-width: 10em; white-space: normal; overflow-wrap: anywhere;
    }
    .ptable th, .ptable td { padding: 8px 9px; }
  }
</style>
${jsonLdBlocks}
</head>
<body>
  <header class="top">
    <div class="topin">
      <a class="brand" href="${prefix}">
        <span class="mark" aria-hidden="true">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0l-7.2-7.2A2 2 0 0 1 3 12V4.6A1.6 1.6 0 0 1 4.6 3H12a2 2 0 0 1 1.4.6l7.2 7.2a2 2 0 0 1 0 2.6Z"/>
            <path d="M12 8v6"/><path d="m9.5 11.5 2.5 2.5 2.5-2.5"/>
          </svg>
        </span>
        <span class="btxt"><b>AI <em>优惠</em>聚合器</b><small>真实优惠 · 每日更新</small></span>
      </a>
      <a class="jumpback" href="${prefix}">← 返回全部优惠</a>
    </div>
  </header>

  <div class="wrap">
    <main id="main">
${body}
    </main>
    ${footer}
  </div>
</body>
</html>
`;
}

/* ------------------------------------------------------------------ */
/* /plans/ 统一资料入口（v3.0 Stage B）                                 */
/* ------------------------------------------------------------------ */

/**
 * `/plans/` 资料入口页的套壳。
 *
 * 与 `renderPlansPage` / `renderApiPlansPage` 同一套「独立静态路由」的做法：
 * `<head>`、主题脚本、页头、页脚、JSON-LD 在这里套，**正文在 `lib/plans-hub-page.js`**。
 *
 * 三处刻意的设计：
 *   · `prefix = '../'`（一层路由）—— 由路由深度推导，不写死；
 *   · 这一页是**枢纽**：ItemList 指向两个子页（`data-child`），成员对账由页面自己的
 *     `assertItemListHonesty()` 做（`seo.js` 的成员判据按 `deal/<id>/` 判，对枢纽页不适用）；
 *   · 这一页**没有交互脚本**、也没有大表 —— 它只给计数、口径、变化与关联优惠。
 */
function renderPlansHubShell(indexHtml, context = {}) {
  const prefix = '../'; // /plans/ 是一层路由
  const style = (indexHtml.match(/<style>[\s\S]*?<\/style>/) || [''])[0];
  const themeScript = (indexHtml.match(/<script>\s*\/\* 主题必须在首次绘制前决定[\s\S]*?<\/script>/) || [''])[0];
  const footerRaw = (indexHtml.match(/<!--SHARED:footer:START-->([\s\S]*?)<!--SHARED:footer:END-->/) || [])[1];
  if (!style || !themeScript || !footerRaw) {
    throw new Error('抽取套餐资料入口页共用片段失败（style / 主题脚本 / 页脚）——检查 index.html 里的标记是否还在');
  }
  const footer = finalizePage(
    footerRaw.replace(/<span id="lastUpdated">--<\/span>/, '<span>见首页</span>'),
    plansHubPage.PLANS_HUB_ROUTE,
    prefix,
    'renderPlansHubShell/footer'
  ).trim();

  const pageUrl = `${SITE_URL}${plansHubPage.PLANS_HUB_ROUTE}`;
  const jsonLdBlocks = plansHubPage.plansHubJsonLd({ siteUrl: SITE_URL })
    .map(data => `<script type="application/ld+json">
${JSON.stringify(data, null, 2).split('\n').map(line => `  ${line}`).join('\n')}
</script>`).join('\n');
  const body = plansHubPage.renderPlansHubPage({ ...context, prefix, siteUrl: SITE_URL });

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${htmlEscape(plansHubPage.PLANS_HUB_HEADING)} · ${htmlEscape(SITE_NAME)}</title>
<meta name="description" content="${htmlEscape(plansHubPage.PLANS_HUB_DESCRIPTION)}">
<link rel="canonical" href="${pageUrl}">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#f6f7f9" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0b0d10" media="(prefers-color-scheme: dark)">
<link rel="icon" href="${prefix}favicon.svg" type="image/svg+xml">
${feeds.rootFeedTags(prefix)}
${themeScript}
${style}
<style>
  /* 只用首页与两个对比页已有的设计变量，不新建一套视觉语言。 */
  .stop { display: flex; align-items: baseline; gap: var(--s2); flex-wrap: wrap; margin-bottom: var(--s2); }
  .stop h1 { font-size: 19px; margin: 0; }
  .stop .meta { color: var(--mut); font-size: var(--fs-sm); }
  .snote { color: var(--mut); font-size: var(--fs-sm); line-height: 1.7; margin: 0 0 var(--s3); max-width: none; }
  .ph2 { font-size: 15px; margin: var(--s4) 0 var(--s2); }
  .plist { margin: 0; padding-left: 1.15em; color: var(--mut); font-size: var(--fs-sm); line-height: 1.8; max-width: none; }
  .plist b { color: var(--ink2); }
  /* 两个资料块：Coding 套餐与 API 计费并列，各自给计数与入口。 */
  .phubsec { margin: 0 0 var(--s3); border: 1px solid var(--line); border-radius: var(--r); padding: var(--s3); background: var(--card); }
  .phubsec .ph2 { margin-top: 0; }
  .phubstats { list-style: none; margin: 0 0 var(--s2); padding: 0; display: flex; gap: var(--s3); flex-wrap: wrap; }
  .phubstats li { display: flex; align-items: baseline; gap: 6px; font-size: var(--fs-sm); color: var(--mut); }
  .phubl { color: var(--mut); }
  .phubv { color: var(--ink); font-size: 15px; font-variant-numeric: tabular-nums; }
  .phubgo { color: var(--brand); text-decoration: none; }
  .phubgo:hover { text-decoration: underline; text-underline-offset: 2px; }
  /* 当前相关优惠：与套餐页的「当前优惠」同一套观感（结构上只列 current）。 */
  .phubdeals { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .phubdeal { display: flex; align-items: baseline; gap: var(--s2); flex-wrap: wrap; font-size: var(--fs-sm); }
  .phubwho { color: var(--ink); }
  .phubkind { color: var(--mut); }
  .phubtitle { color: var(--ink2); }
  .phubpromo { color: var(--mut); }
  .phubsave { color: var(--ok); font-weight: 600; }
  .phubelig { color: var(--mut); }
  .phubdeadline { color: var(--mut); }
  .phubnone { color: var(--mut); font-size: var(--fs-sm); }
  /* 变化块复用套餐页 / API 页的那几个 class（同一套观感、同一份句子）。 */
  .pchanges { margin: 0 0 var(--s3); border: 1px solid var(--line); border-radius: var(--r); padding: var(--s3); background: var(--card); }
  .pchanges .ph2 { margin: 0 0 var(--s2); }
  .pchglist { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .pchglist li { display: flex; align-items: baseline; gap: var(--s2); flex-wrap: wrap; font-size: var(--fs-sm); }
  .pchgwhen { color: var(--mut); font-variant-numeric: tabular-nums; }
  .pchgwho { color: var(--ink); text-decoration: none; }
  a.pchgwho { border-bottom: 1px dotted var(--line); }
  .pchgtype { color: var(--brand); }
  .pchgwhat { color: var(--ink); }
  .pchgorigin { color: var(--mut); }
  .pchnone, .pchnote { color: var(--mut); font-size: var(--fs-sm); margin: var(--s1) 0 0; }
</style>
${jsonLdBlocks}
</head>
<body>
  <header class="top">
    <div class="topin">
      <a class="brand" href="${prefix}">
        <span class="mark" aria-hidden="true">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0l-7.2-7.2A2 2 0 0 1 3 12V4.6A1.6 1.6 0 0 1 4.6 3H12a2 2 0 0 1 1.4.6l7.2 7.2a2 2 0 0 1 0 2.6Z"/>
            <path d="M12 8v6"/><path d="m9.5 11.5 2.5 2.5 2.5-2.5"/>
          </svg>
        </span>
        <span class="btxt"><b>AI <em>优惠</em>聚合器</b><small>真实优惠 · 每日更新</small></span>
      </a>
      <a class="jumpback" href="${prefix}">← 返回全部优惠</a>
    </div>
  </header>

  <div class="wrap">
    <main id="main">
${body}
    </main>
    ${footer}
  </div>
</body>
</html>
`;
}

/* ------------------------------------------------------------------ */
/* /models/ 模型资料索引与详情（v3.0 Stage D5/D6）                       */
/* ------------------------------------------------------------------ */

/**
 * 模型页（索引 / 详情共用）的套壳。
 *
 * 与 `/plans/` 那一支同一套做法：正文在 lib、`<head>` / 页头 / 页脚 / JSON-LD 在这里。
 * `prefix` 由路由段数推导，**不写死**（索引一层、详情两层）。
 *
 * `mainClass` 缺省为空 ⇒ `<main id="main">` 一字不改（索引页 / 档案页 / 数据文档页全部走缺省）。
 * 只有**详情内容列**页面（模型详情）才显式传 `'detail-main'`，宽度由首页那条 `.detail-main` 规则给。
 */
function renderModelsShell({ route, title, description, body, jsonLd, prefix, extraCss = '', mainClass = '' }, indexHtml) {
  const style = (indexHtml.match(/<style>[\s\S]*?<\/style>/) || [''])[0];
  const themeScript = (indexHtml.match(/<script>\s*\/\* 主题必须在首次绘制前决定[\s\S]*?<\/script>/) || [''])[0];
  const footerRaw = (indexHtml.match(/<!--SHARED:footer:START-->([\s\S]*?)<!--SHARED:footer:END-->/) || [])[1];
  if (!style || !themeScript || !footerRaw) {
    throw new Error(`抽取模型页共用片段失败（style / 主题脚本 / 页脚，${route}）——检查 index.html 里的标记是否还在`);
  }
  const footer = finalizePage(
    footerRaw.replace(/<span id="lastUpdated">--<\/span>/, '<span>见首页</span>'),
    route,
    prefix,
    'renderModelsShell/footer'
  ).trim();
  const pageUrl = `${SITE_URL}${route}`;
  const jsonLdBlocks = jsonLd
    .map(data => `<script type="application/ld+json">
${JSON.stringify(data, null, 2).split('\n').map(line => `  ${line}`).join('\n')}
</script>`).join('\n');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${htmlEscape(title)} · ${htmlEscape(SITE_NAME)}</title>
<meta name="description" content="${htmlEscape(description)}">
<link rel="canonical" href="${pageUrl}">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#f6f7f9" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0b0d10" media="(prefers-color-scheme: dark)">
<link rel="icon" href="${prefix}favicon.svg" type="image/svg+xml">
${feeds.rootFeedTags(prefix)}
${themeScript}
${style}
<style>
  /* 只用首页已有的设计变量，不新建视觉语言。 */
  .stop { display: flex; align-items: baseline; gap: var(--s2); flex-wrap: wrap; margin-bottom: var(--s2); }
  .stop h1 { font-size: 19px; margin: 0; }
  .stop .meta { color: var(--mut); font-size: var(--fs-sm); }
  .snote { color: var(--mut); font-size: var(--fs-sm); line-height: 1.7; margin: 0 0 var(--s3); max-width: none; }
  .ph2 { font-size: 15px; margin: var(--s4) 0 var(--s2); }
  .plist { margin: 0; padding-left: 1.15em; color: var(--mut); font-size: var(--fs-sm); line-height: 1.8; max-width: none; }
  .plist b { color: var(--ink2); }
  .ptable-wrap { overflow-x: auto; }
  .ptable { width: 100%; border-collapse: collapse; background: var(--card); border: 1px solid var(--line); border-radius: var(--r); overflow: hidden; }
  .ptable caption { text-align: left; color: var(--mut); font-size: var(--fs-sm); padding: 0 0 var(--s2); }
  .ptable th, .ptable td { text-align: left; padding: 9px 11px; border-top: 1px solid var(--line); font-weight: 400; font-size: var(--fs-sm); vertical-align: top; }
  .ptable thead th { border-top: 0; color: var(--mut); font-weight: 600; white-space: nowrap; }
  .ptable tbody th { font-weight: 600; white-space: nowrap; }
  .ptable td { min-width: 72px; }
  .ptable small { display: block; color: var(--mut); font-weight: 400; font-size: 11.5px; margin-top: 2px; line-height: 1.5; }
  .ptable .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .ptable a { color: var(--brand); }
  .ptable tr[hidden] { display: none; }
  .punit { white-space: nowrap; }
  .munlinked { color: var(--mut); }
  .minfo { display: grid; grid-template-columns: 6.5em minmax(0, 1fr); gap: 3px 10px; margin: 0 0 var(--s3); font-size: var(--fs-sm); }
  .minfo dt { color: var(--mut); }
  .minfo dd { margin: 0; overflow-wrap: anywhere; }
  .mlist { margin: 0; padding-left: 1.15em; color: var(--ink2); font-size: var(--fs-sm); line-height: 1.9; }
  .mlist small { color: var(--mut); }
  .mstatus { margin-left: 6px; }
  .mfilter { display: flex; gap: var(--s2); flex-wrap: wrap; align-items: center; margin: 0 0 var(--s1); }
  .mfilter:empty { display: none; }
  .mfl, .mfsearch { display: inline-flex; align-items: center; gap: 6px; color: var(--mut); font-size: var(--fs-sm); }
  .mfsearch input { border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--card); color: var(--ink); padding: 5px 8px; font: inherit; font-size: 12px; min-width: 16ch; }
  .mfl select { border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--card); color: var(--ink); padding: 5px 6px; font: inherit; font-size: 12px; }
  .mcount { margin: 0 0 var(--s2); }
  @media (max-width: 760px) {
    .ptable-wrap { border-radius: var(--r); }
    .ptable { overflow: visible; }
    .ptable thead th:first-child, .ptable tbody th:first-child {
      position: sticky; left: 0; width: 8.5em; white-space: normal; background: var(--card); z-index: 2;
    }
    .ptable th, .ptable td { padding: 8px 9px; }
  }
${extraCss}
</style>
${jsonLdBlocks}
</head>
<body>
  <header class="top">
    <div class="topin">
      <a class="brand" href="${prefix}">
        <span class="mark" aria-hidden="true">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0l-7.2-7.2A2 2 0 0 1 3 12V4.6A1.6 1.6 0 0 1 4.6 3H12a2 2 0 0 1 1.4.6l7.2 7.2a2 2 0 0 1 0 2.6Z"/>
            <path d="M12 8v6"/><path d="m9.5 11.5 2.5 2.5 2.5-2.5"/>
          </svg>
        </span>
        <span class="btxt"><b>AI <em>优惠</em>聚合器</b><small>真实优惠 · 每日更新</small></span>
      </a>
      <a class="jumpback" href="${prefix}">← 返回全部优惠</a>
    </div>
  </header>

  <div class="wrap">
    <main id="main"${mainClass ? ` class="${mainClass}"` : ''}>
${body}
    </main>
    ${footer}
  </div>
</body>
</html>
`;
}

/**
 * `/archive/` 与档案详情页的样式（只用首页已有的设计变量）。纯追加：只在这两种页面上拼进 `<style>`。
 */
const ARCHIVE_PAGE_CSS = `  /* v3.0 Stage F：历史档案。 */
  .asec { margin: 0 0 var(--s3); border: 1px solid var(--line); border-radius: var(--r); padding: var(--s3); background: var(--card); }
  .asec .ph2 { margin: 0 0 var(--s1); }
  .alist { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .arow { display: flex; align-items: baseline; gap: var(--s2); flex-wrap: wrap; font-size: var(--fs-sm); }
  .atitle { color: var(--ink); text-decoration: none; border-bottom: 1px dotted var(--line); }
  .atitle:hover { color: var(--brand); }
  .awho { color: var(--mut); }
  .astatus { color: var(--brand); }
  .amark { color: var(--warn); }
  .atimes { color: var(--mut); font-variant-numeric: tabular-nums; }
  .anone { color: var(--mut); font-size: var(--fs-sm); line-height: 1.75; }
  .awarn { color: var(--warn); }
  .ainfo, .aknown { display: grid; grid-template-columns: 7.5em minmax(0, 1fr); gap: 3px 10px; margin: 0 0 var(--s3); font-size: var(--fs-sm); }
  .ainfo dt, .aknown dt { color: var(--mut); }
  .ainfo dd, .aknown dd { margin: 0; overflow-wrap: anywhere; }
`;

/**
 * `/docs/data/` 的样式（只用首页已有的设计变量）。纯追加：只在这一页上拼进 `<style>`。
 */
const DATA_DOCS_PAGE_CSS = `  /* v3.0 Stage G：数据文档。 */
  .dterms b { color: var(--ink); }
  .codeblock { background: var(--card); border: 1px solid var(--line); border-radius: var(--r); padding: var(--s2) var(--s3); overflow-x: auto; font-size: 12px; line-height: 1.6; }
  .codeblock code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: var(--ink2); }
  .ptable small[data-time-shape] { color: var(--mut); }
`;

/**
 * 开发者显示名 → 厂商资料页路由（**只在那一页真的存在时**返回，否则 null）。 *
 * 模型页与厂商页是两层不同的资料：模型页只在自己映射得到的那家厂商**已经有独立页面**时
 * 才给链接 —— 指向一个不存在的 `/vendor/<slug>/` 就是死链（站内链接存在性是硬门禁）。
 */
function vendorHrefFor(developer, providerTable, directoryPages) {
  const resolved = providers.resolveProvider(String(developer || ''), providerTable);
  if (!resolved || !resolved.slug) return null;
  const exists = (directoryPages || []).some(page => page.kind === 'vendor' && page.slug === resolved.slug);
  return exists ? `vendor/${resolved.slug}/` : null;
}

/* ------------------------------------------------------------------ */
/* 分类页（/student/ /developer/ /free-api/）                           */
/* ------------------------------------------------------------------ *//**
 * 分类页：**一条优惠一个静态 URL 之外的第二类落地页**。
 *
 * ## 为什么要它们
 *
 * 首页是一个「按力度分档」的大列表，适合逛，不适合回答「我是学生，哪些能用」。
 * 这三个页面回答的就是那一问。它们不是首页的替代品，是入口。
 *
 * ## 为什么是一个函数而不是三个
 *
 * 站点有 `/status/` 这条先例，但子代理核查发现它**只满足五条既有约定里的两条**
 * （预渲染、无 JS 可读），sitemap / feed / JSON-LD 三条当时根本没做。
 * 三条路由各写一遍，等于把「哪一条忘了进 sitemap」变成一个靠记性维持的不变量：
 * sitemap 的条数断言会红，但「忘了加 JSON-LD」不会 —— 那正是最坏的一类缺失。
 * 一个生成循环 + 一张注册表（`audience.COLLECTION_PAGES`）让漏一条在结构上不可能。
 *
 * ## 诚实性约束（与详情页同一把尺子）
 *
 * 页面上只写**有明确依据**的东西：`unknown` 渲染成「尚未确认」而不是「不可用」，
 * 缺席的字段不写。分类归属本身也只认**肯定信号**（见 `audience.studentSignal` 的注释：
 * 覆盖率口径与分类口径在这里刻意不同）。
 */
/* ------------------------------------------------------------------ */
/* 订阅中心（/feeds/）：把注册表原样摊开，并如实说明空 Feed 为什么空     */
/* ------------------------------------------------------------------ */

/**
 * 订阅中心。**它不产数据、不产条目**：全部内容来自 `lib/feeds.js` 的注册表与
 * 已经算好的条目数，页面只做排版。
 *
 * 三条与站内其它页面同源的约定：
 *   · 页面壳子（style / 主题脚本 / 页脚）从**已组装好的 index.html** 里抽，
 *     不写第二份视觉语言；
 *   · 站点常量与 URL 一律走 feeds 模块（那一份是唯一出处）；
 *   · 订阅地址写**绝对 URL**：这一页的全部意义就是让读者把地址复制走。
 *
 * 空 Feed 的处理是本页的重点：`/feed/changes.*` 与 `/feed/new.*` 会长期为空
 * （变更日志的起算日就是交付日），页面必须说清「这是事实，不是故障」，
 * 措辞直接取 `lib/changes.js` 的权威表，不另写一句话。
 */
function renderFeedsPage(feedList, indexHtml, context = {}) {
  const style = (indexHtml.match(/<style>[\s\S]*?<\/style>/) || [''])[0];
  const themeScript = (indexHtml.match(/<script>\s*\/\* 主题必须在首次绘制前决定[\s\S]*?<\/script>/) || [''])[0];
  const footerRaw = (indexHtml.match(/<!--SHARED:footer:START-->([\s\S]*?)<!--SHARED:footer:END-->/) || [])[1];
  if (!style || !themeScript || !footerRaw) {
    throw new Error('抽取订阅中心共用片段失败（style / 主题脚本 / 页脚）——检查 index.html 里的标记是否还在');
  }
  const footer = finalizePage(
    footerRaw.replace(/<span id="lastUpdated">--<\/span>/, '<span>见首页</span>'),
    'feeds/',
    '../',
    'renderFeedsPage/footer'
  ).trim();

  const W = feeds.FEEDS_WORDING;
  const PAGE_HEADING = W.FEEDS_LABELS.pageTitle;
  const PAGE_DESCRIPTION = '订阅 AI 优惠：全部优惠、最近变化、最近新增，以及按学生 / 开发者意图与按厂商切分的订阅源。' +
    'RSS 与 JSON Feed 两种格式，全部由本站构建期生成的静态文件提供 —— 没有账号、没有邮件列表、没有推送服务。';
  const pageUrl = `${SITE_URL}feeds/`;

  // 分组与成员**全部来自注册表**（`lib/feeds.js` 的 `pageGroups()` 从 spec.listGroup 派生）：
  // 这一层**不许**再有第二份 id 清单 —— 手写清单正是 P3-4 的成因（分类 Feed 整组漏在
  // 汇总页之外，而页面上与自检里都看不出来）。新增一条 Feed 只需在注册表里声明它属于哪一组，
  // 「注册表 → 页面」这个方向由 `checkFeedsPage()` 的双向断言盯着。
  const plan = feeds.pageGroups(feedList);
  const groups = plan.groups.filter(group => group.key !== 'vendor');   // 厂商那一段单独排版（带门槛说明）
  const vendorFeeds = (plan.groups.find(group => group.key === 'vendor') || { feeds: [] }).feeds;
  // 兜底：public 但没有分组的 Feed 也照常列出来。两件事同时成立 ——
  // 页面上不会静默少一份订阅，而 `checkFeedsPage()` 会把「没分组」报成必须修的问题。
  const ungroupedFeeds = plan.ungrouped;
  /** 站点根 Feed：按注册表的路径取，不再按 id 字面量取 */
  const ownFeed = feedList.find(feed => feed.spec.path === feeds.ROOT_FEED.path) || null;

  const rowHtml = feed => {
    const spec = feed.spec;
    const rss = SITE_URL + spec.path;
    const json = SITE_URL + spec.jsonPath;
    const latest = feed.items.length ? (feed.items[0].dateModified || feed.items[0].datePublished) : null;
    const empty = feed.items.length === 0;
    const changeKind = spec.kind === 'changes' || spec.kind === 'plan-changes';
    // v3.0 Stage H：措辞与**起算日**都按来源取自己的那一份。
    // 起算日直接读 `spec.startedAt` —— `buildFeeds` 已经按来源从各自日志的 `startedAt` 算好了；
    // 继续用 `context.planStartedAt` 会让 API 那一条显示套餐日志的起算日（那是假话）。
    const sinceLabels = spec.kind !== 'plan-changes'
      ? changes.CHANGES_WORDING.CHANGES_LABELS
      : feeds.changeWordingOf(spec);
    const sinceDate = spec.kind === 'plan-changes'
      ? (spec.startedAt || context.asOf || '未知')
      : (context.startedAt || context.asOf || '未知');
    const countText = empty
      ? `0 条${changeKind ? `（${sinceLabels.since.replace('{date}', sinceDate)}）` : ''}`
      : `${feed.items.length} 条${latest ? ` · 最近一条 ${latest}` : ''}`;
    const pageLink = spec.pageRoute
      ? `<a href="../${spec.pageRoute}">看这一页</a> · `
      : '';
    return `      <li class="frow">
        <div class="fhead"><b>${htmlEscape(spec.title)}</b><span class="fcount">${htmlEscape(countText)}</span></div>
        <p class="fdesc">${htmlEscape(spec.description)}</p>
        <p class="furl">${pageLink}<a href="${htmlEscape(rss)}">RSS</a> · <a href="${htmlEscape(json)}">JSON Feed</a></p>
      </li>`;
  };

  const groupHtml = groups.map(group => {
    const rows = group.feeds;
    if (!rows.length) return '';
    return `    <section class="fsec">
      <h2>${htmlEscape(group.label)}</h2>
      ${group.note ? `<p class="snote">${group.note}</p>` : ''}
      <ul class="flist">
${rows.map(rowHtml).join('\n')}
      </ul>
    </section>`;
  }).filter(Boolean).join('\n');
  // 没分组的 public Feed：单独一段列出来（正常情况下永远是空的；一旦出现，
  // 构建自检会红，页面这里也保证它不会消失得无声无息）。
  const ungroupedHtml = ungroupedFeeds.length
    ? `    <section class="fsec">
      <h2>其他订阅</h2>
      <p class="snote">这些订阅源还没在注册表里声明分组（见 lib/feeds.js 的 FEED_LIST_GROUPS），先照实列出。</p>
      <ul class="flist">
${ungroupedFeeds.map(rowHtml).join('\n')}
      </ul>
    </section>`
    : '';

  const emptyChangeFeeds = feedList.filter(feed => feed.spec.kind === 'changes' && !feed.items.length);
  const emptyNote = emptyChangeFeeds.length
    ? `<p class="snote">最近变化与最近新增现在是空的：本站的变更记录自 ${htmlEscape(context.startedAt || context.asOf || '未知')} 起算，此前没有历史。` +
      `空订阅是<b>事实</b>，不是故障 —— 一旦有新增或重要变化，它们会出现在这里。` +
      `${context.availability !== 'ok' ? '（本次构建没有拿到变更日志，因此无法确认有没有变化。）' : ''}</p>`
    : '';
  // v2.3 / v3.0：变化源的空态**逐条自己说**（各自的起算日与可用性是另一份数据，
  // 不能拿 deals 的话顶上，也不能让 API 那条借用套餐的起算日）。
  // `spec.startedAt` 与可用性都取自**它自己**那一份日志的视图。
  const changeAvailabilityOf = spec => (typeof context.changeAvailabilityOf === 'function'
    ? context.changeAvailabilityOf(spec)
    : (spec.changeSource === 'api' ? context.apiPlanAvailability : context.planAvailability));
  const emptyPlanNotes = feedList
    .filter(feed => feed.spec.kind === 'plan-changes' && !feed.items.length)
    .map(feed => {
      const spec = feed.spec;
      const unavailable = changeAvailabilityOf(spec) !== 'ok';
      const what = spec.changeSource === 'api'
        ? 'API 计费数据（api-plans.json）'
        : '套餐数据（plans.json）';
      return `<p class="snote">${htmlEscape(spec.title)}现在是空的：这套变更记录自 `
        + `${htmlEscape(spec.startedAt || context.asOf || '未知')} 起算，`
        + `此前只沉淀了一份「既有状态」基线（它不是创建事件）。空订阅是<b>事实</b>，不是故障。`
        + `${unavailable ? `（本次构建没有拿到这份变化日志，因此无法确认 ${htmlEscape(what)} 有没有变化。）` : ''}</p>`;
    })
    .join('\n');
  const emptyPlanNote = emptyPlanNotes;
  const vendorNote = vendorFeeds.length
    ? `<p class="snote">厂商订阅只给「当前收录的优惠 ≥ ${feeds.VENDOR_THRESHOLDS.minDeals} 条」或「历史变更事件 ≥ ${feeds.VENDOR_THRESHOLDS.minEvents} 条」的厂商生成：` +
      `只出现一两条记录的厂商单独开一个订阅没有价值。厂商改名不会改订阅地址（地址来自人工维护的 slug 表）。</p>`
    : '<p class="snote">当前没有达到门槛的厂商订阅。</p>';

  const jsonLdBlocks = [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: `${PAGE_HEADING} · ${SITE_NAME}`,
      description: PAGE_DESCRIPTION,
      url: pageUrl,
      inLanguage: 'zh-CN',
      isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: SITE_URL }
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '首页', item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: PAGE_HEADING, item: pageUrl }
      ]
    }
  ].map(data => `<script type="application/ld+json">
${JSON.stringify(data, null, 2).split('\n').map(line => `  ${line}`).join('\n')}
</script>`).join('\n');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${htmlEscape(PAGE_HEADING)} · ${htmlEscape(SITE_NAME)}</title>
<meta name="description" content="${htmlEscape(PAGE_DESCRIPTION)}">
<link rel="canonical" href="${pageUrl}">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#f6f7f9" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0b0d10" media="(prefers-color-scheme: dark)">
<link rel="icon" href="../favicon.svg" type="image/svg+xml">
<!-- feed 约定：这一页自己不产出条目（订阅是「内容更新」语义），但必须能被订阅发现。 -->
${feeds.feedLinkTags(ownFeed ? [ownFeed] : [], '../')}
${themeScript}
${style}
<style>
  /* 只用首页已有的设计变量。列表式（不是宽表）：订阅地址很长，窄屏上不能产生横向滚动。 */
  .snote { color: var(--mut); font-size: var(--fs-sm); line-height: 1.7; margin: 0 0 var(--s3); max-width: 70ch; }
  .fsec { margin: 0 0 var(--s4); border-top: 1px solid var(--line); padding-top: var(--s3); }
  .fsec h2 { font-size: 15px; margin: 0 0 var(--s2); }
  .flist { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .frow { background: var(--card); border: 1px solid var(--line); border-radius: var(--r); padding: 10px 12px; }
  .fhead { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px var(--s2); font-size: var(--fs-sm); }
  .fcount { color: var(--mut); font-variant-numeric: tabular-nums; }
  .fdesc { margin: 4px 0 0; color: var(--ink2); font-size: var(--fs-sm); line-height: 1.6; }
  .furl { margin: 6px 0 0; font-size: 11.5px; overflow-wrap: anywhere; }
  .furl a { color: var(--brand); }
</style>
${jsonLdBlocks}
</head>
<body>
  <header class="top">
    <div class="topin">
      <a class="brand" href="../"><span class="btxt"><b>AI <em>优惠</em>聚合器</b><small>真实优惠 · 每日更新</small></span></a>
      <a class="jumpback" href="../">← 返回全部优惠</a>
    </div>
  </header>

  <div class="wrap">
    <main id="main">
      <nav class="crumb" aria-label="面包屑"><a href="../">首页</a> › <span>${htmlEscape(PAGE_HEADING)}</span></nav>
      <h1>${htmlEscape(PAGE_HEADING)}</h1>
      <p class="snote">把下面的地址粘进任意 RSS / JSON Feed 阅读器即可订阅。本站没有账号、没有邮件列表、没有推送服务，
        也不会记录谁订阅了哪一份 —— 这些就是一个静态文件，和打开任何一个网页没有区别。</p>
      ${emptyNote}
      ${emptyPlanNote}
${groupHtml}
${ungroupedHtml}
    <section class="fsec">
      <h2>厂商订阅</h2>
      ${vendorNote}
      <ul class="flist">
${vendorFeeds.map(rowHtml).join('\n')}
      </ul>
    </section>
    <section class="fsec">
      <h2>说明</h2>
      <p class="snote">优惠订阅回答「当前有哪些符合这个条件的优惠」；最近变化与最近新增回答「最近发生了什么」，
        只收优惠内容、领取条件、有效期与收录状态的变化 —— 改一个标点、换一处分类不会推给你。</p>
      <p class="snote">${htmlEscape(W.FEEDS_NOTES.officialNote)}</p>
    </section>
    </main>
    ${footer}
  </div>
</body>
</html>
`;
}

/* ------------------------------------------------------------------ */
/* 目录页：分类页（/student/ …）与按需求页（/need/<slug>/）共用一条生成路径 */
/* ------------------------------------------------------------------ */

/**
 * 目录页：**一条优惠一个静态 URL 之外的第二类落地页**。
 *
 * ## 为什么要它们
 *
 * 首页是一个「按力度分档」的大列表，适合逛，不适合回答「我是学生，哪些能用」
 * 或「我要免费 API，在哪」。这一层页面回答的就是这些问法。
 * 它们不是首页的替代品，是入口。
 *
 * ## 为什么是一个函数而不是两类各写一遍（v1.2 泛化）
 *
 * 站点有 `/status/` 这条先例，但子代理核查发现它**只满足五条既有约定里的两条**
 * （预渲染、无 JS 可读），sitemap / feed / JSON-LD 三条当时根本没做。
 * 三条路由各写一遍，等于把「哪一条忘了进 sitemap」变成一个靠记性维持的不变量。
 * v1.2 再加十页时，这个诱惑更大（「照抄一份分类页改改」）—— 所以它现在**不是**两份实现：
 * 分类页与按需求页是同一张注册表的两种 `kind`，共用本函数，共用
 * canonical / 双 feed / 三段 JSON-LD / 页脚深度 / 正文下限 / 空表兜底。
 * 差别只有两处：**表头**与**「命中依据」那一列**（`spec.kind === 'need'` 时才有）。
 *
 * ## 诚实性约束（与详情页同一把尺子）
 *
 * 页面上只写**有明确依据**的东西：`unknown` 渲染成「尚未确认」而不是「不可用」，
 * 缺席的字段不写。分类归属与需求命中都只认**肯定信号**（见 `audience.studentSignal`
 * 与 `NEED_PAGES` 的注释：覆盖率口径与入口口径在这里刻意不同）。
 *
 * ## 深度前缀由 spec.depth 推导（别写死 `'../'`）
 *
 * 分类页在站点第 1 层（`/student/` ⇒ 前缀 `'../'`），按需求页在第 2 层
 * （`/need/<slug>/` ⇒ `'../../'`）。写死的症状很隐蔽：页面能正常打开、内容都对，
 * **只有所有内链 404**。所以产物自检里有一条专查 `<tbody>` 里的链接前缀。
 */
function renderDirectoryPage(spec, deals, indexHtml, context) {
  const prefix = '../'.repeat(spec.depth || 1);
  /** 该页自身的绝对地址。按需求页在 `/need/<slug>/`，所以**不能**由 slug 直接拼站根地址 */
  const pageUrl = `${SITE_URL}${spec.route || `${spec.slug}/`}`;
  const style = (indexHtml.match(/<style>[\s\S]*?<\/style>/) || [''])[0];
  const themeScript = (indexHtml.match(/<script>\s*\/\* 主题必须在首次绘制前决定[\s\S]*?<\/script>/) || [''])[0];
  const footerRaw = (indexHtml.match(/<!--SHARED:footer:START-->([\s\S]*?)<!--SHARED:footer:END-->/) || [])[1];
  if (!style || !themeScript || !footerRaw) {
    throw new Error(`抽取目录页共用片段失败（style / 主题脚本 / 页脚）——检查 index.html 里的标记是否还在`);
  }
  const footer = finalizePage(
    footerRaw.replace(/<span id="lastUpdated">--<\/span>/, '<span>见首页</span>'),
    spec.route || `${spec.slug}/`,
    prefix,
    'renderDirectoryPage/footer'
  ).trim();

  // v1.7：页面类型。`hub` 列子页面、`alias` 是 noindex 的旧地址，其余列条目。
  const kind = spec.kind || 'collection';
  const isHub = kind === 'hub';
  const isAlias = kind === 'alias';
  const summary = Array.isArray(context.summary) ? context.summary : [];
  const plan = context.plan || null;
  const pageFeeds = Array.isArray(context.feedsForPage) ? context.feedsForPage : [];
  // v3.0 Stage E：厂商资料页的追加区块（六节 + 它自己的 CSS）。
  // 其它 kind 不传 → `extraHtml` / `extraCss` 都是空串 → 输出与 v2.x 逐字节相同
  // （这条「纯追加」边界由 `selftest:vendor` 与 `check-reproducible` 两边钉住）。
  const extraBundle = typeof context.extraSections === 'function'
    ? (context.extraSections(spec) || { html: '', css: '' })
    : { html: context.extraSections || '', css: context.extraSectionsCss || '' };
  const extraHtml = extraBundle.html || '';
  const extraCss = extraBundle.css || '';

  // 订阅声明：本页自己的 Feed（如果有）+ 站点根 Feed。两者都要 ——
  // 根 Feed 是「全部优惠」，本页 Feed 是「这一类」，读者的选择不同。
  const ownFeedTags = pageFeeds.length ? feeds.feedLinkTags(pageFeeds, prefix) : '';
  const feedTags = [ownFeedTags, feeds.rootFeedTags(prefix)].filter(Boolean).join('\n');

  const triText = value => (value === true ? '是' : value === false ? '否' : '尚未确认');

  // 门槛 / 领取要求：只写**已知**的键，一个都没有就明说来源没写。
  // 刻意不写「无门槛」——「没查到」与「没有门槛」是两件事。
  const knownLabelList = (map, labels) => Object.keys(labels)
    .filter(key => map && (map[key] === true || map[key] === false))
    .map(key => `${labels[key]}：${triText(map[key])}`);

  /**
   * 「命中依据」：这条为什么在**这一页**上。只列与该入口判据直接相关、且**已知**的字段，
   * 一个已知的都没有时写「尚未确认」——绝不写「否」或「不符合」。
   *
   * 为什么要专门一列：十条入口里有四条的数字会让读者意外（`no-card` 只有 1 条、
   * `ai-coding` 只有 4 条）。只给条数不给依据，读者只能猜是「没有这类优惠」还是
   * 「我们没查到」；有了这一列，两种情况在页面上就是两句不同的话。
   */
  const evidenceOf = deal => {
    const parts = [];
    switch (spec.slug) {
      case 'student-only':
        parts.push(`适用人群：${audience.audienceSummary(deal) || '未标注'}`);
        if (deal.eligibilityDetail && deal.eligibilityDetail.studentRequired === true) {
          parts.push(`${audience.ELIGIBILITY_LABELS.studentRequired}：是`);
        }
        if (Array.isArray(deal.benefitType) && deal.benefitType.includes('student_plan')) {
          parts.push(`福利类型含「${audience.BENEFIT_LABELS.student_plan}」`);
        }
        break;
      case 'edu-identity':
        parts.push(`适用人群：${audience.audienceSummary(deal) || '未标注'}`);
        if (deal.eligibilityDetail && deal.eligibilityDetail.educationEmailRequired === true) {
          parts.push(`${audience.ELIGIBILITY_LABELS.educationEmailRequired}：是`);
        }
        break;
      case 'no-card': {
        const value = deal.claimRequirements ? deal.claimRequirements.creditCardRequired : undefined;
        parts.push(`需要信用卡：${triText(value)}（来源明确写了不需要）`);
        break;
      }
      case 'china-usable':
        parts.push(`中国大陆可用性：${audience.chinaUsableLine(deal) || '尚未确认'}`);
        break;
      case 'free-tier':
        parts.push(`定价模式：${deal.pricingModel === 'freemium' ? '免费增值（有免费档）' : '免费'}`);
        parts.push(`福利类型：${audience.benefitSummary(deal) || '未标注'}`);
        break;
      case 'free-api':
        parts.push(`福利类型含「${audience.BENEFIT_LABELS.free_api}」`);
        break;
      case 'free-tokens':
        parts.push(`福利类型含「${audience.BENEFIT_LABELS.free_credits}」`);
        break;
      case 'ai-coding':
        parts.push(`分类：${deal.category || '未标注'}`);
        break;
      case 'free-model':
        parts.push(`福利类型含「${audience.BENEFIT_LABELS.free_model}」`);
        break;
      case 'dev-credits':
        parts.push(`适用人群：${audience.audienceSummary(deal) || '未标注'}`);
        if (Array.isArray(deal.benefitType) && deal.benefitType.includes('developer_credit')) {
          parts.push(`福利类型含「${audience.BENEFIT_LABELS.developer_credit}」`);
        }
        break;
      default:
        // v1.7：分类页与厂商页也各写一句「为什么在这一页」—— 依据同样是**数据里已有的字段**，
        // 不是从标题里猜的。没有这一列，读者看到「这一类只有 4 条」时无法区分
        // 「没有这类优惠」与「我们没查到」。
        if (kind === 'category') {
          parts.push(`分类：${deal.category || '未标注'}`);
          parts.push(`福利类型：${audience.benefitSummary(deal) || '未标注'}`);
        } else if (kind === 'vendor') {
          parts.push(`厂商：${VENDOR_KEY_OF(deal) || '未标注'}`);
          parts.push(`福利类型：${audience.benefitSummary(deal) || '未标注'}`);
        } else {
          parts.push('尚未确认');
        }
    }
    return parts;
  };

  const isNeed = kind === 'need';
  const useEvidence = isNeed || kind === 'category' || kind === 'vendor' || isAlias;
  const HEADERS = isHub
    ? ['页面', '条目数', '这一页收什么', '订阅']
    : (useEvidence
      ? ['优惠', '适用人群', '为什么在这一页', '门槛 / 领取要求', '中国大陆可用性']
      : ['优惠', '适用人群', '福利类型', '门槛 / 领取要求', '中国大陆可用性']);

  const rowHtml = deal => {
    const audienceText = audience.audienceSummary(deal) || '未标注';
    const benefitText = audience.benefitSummary(deal) || '未标注';
    const barriers = knownLabelList(deal.eligibilityDetail, audience.ELIGIBILITY_LABELS)
      .concat(knownLabelList(deal.claimRequirements, audience.CLAIM_LABELS));
    const china = audience.chinaUsableLine(deal);
    const zh = deal.zh && deal.zh.title ? deal.zh.title : '';
    const third = useEvidence
      ? (evidenceOf(deal).map(htmlEscape).join('<br>') || '<span class="none">尚未确认</span>')
      : (benefitText ? htmlEscape(benefitText) : '<span class="none">未标注</span>');
    // data-item：SEO 门禁据此**独立**数页面上的数据行，与 ItemList 的条数对账
    // （Tooth Test #4：声明 10 项而页面只有 9 行）。它不参与渲染。
    return `
        <tr data-item="${htmlEscape(deal.id)}">
          <th scope="row"><a href="${prefix}deal/${encodeURIComponent(deal.id)}/">${htmlEscape(deal.title)}</a>${
  zh ? `<small class="zh">${htmlEscape(zh)}</small>` : ''}<small>${htmlEscape(deal.vendor || '')}</small></th>
          <td>${htmlEscape(audienceText)}</td>
          <td>${third}</td>
          <td>${barriers.length ? barriers.map(htmlEscape).join('<br>') : '<span class="none">来源未标注</span>'}</td>
          <td>${china ? htmlEscape(china) : '<span class="none">尚未确认</span>'}</td>
        </tr>`;
  };

  /** 枢纽页的一行：只有子页面链接、条数与订阅地址，不夹带条目 */
  const hubRowHtml = child => {
    const childFeeds = feeds.feedsForPage(child, context.allFeeds || []);
    const sub = childFeeds.length
      ? childFeeds.map(feed => `<a href="${prefix}${feed.spec.path}">RSS</a> · <a href="${prefix}${feed.spec.jsonPath}">JSON</a>`).join('<br>')
      : '<span class="none">站点根 Feed</span>';
    return `
        <tr data-child="${htmlEscape(child.route)}">
          <th scope="row"><a href="${prefix}${child.route}">${htmlEscape(child.title || child.label)}</a></th>
          <td>${htmlEscape(String(child.count))}</td>
          <td>${htmlEscape(child.description || child.heading || '')}</td>
          <td>${sub}</td>
        </tr>`;
  };

  const emptyRow = isHub
    ? '<tr><td colspan="4">当前没有达到门槛的子页面。这不代表没有这类优惠，只代表我们手上的条目里还没有一类满足生成门槛。</td></tr>'
    : (useEvidence
      ? '<tr><td colspan="5">当前没有符合这一页判据的条目。这不代表没有这类优惠，只代表我们手上的条目里没有一条满足本页判据。</td></tr>'
      : '<tr><td colspan="5">当前没有符合这一分类、且有明确依据的条目。</td></tr>');

  const childList = isHub ? (spec.children || []) : [];
  const body = isHub
    ? (childList.length ? childList.map(hubRowHtml).join('') : emptyRow)
    : (deals.length ? deals.map(rowHtml).join('') : emptyRow);

  const why = spec.why.map(line => `        ${line}`).join('\n');

  // 面包屑：分类页/厂商页多一层**真实存在**的枢纽（`/category/`、`/vendor/`）。
  // 面包屑的每一级 URL 都必须真的能打开 —— 这是 v1.7 起有断言的一条（Tooth Test #5）。
  const crumbParent = kind === 'category'
    ? { name: '按分类浏览', route: 'category/' }
    : (kind === 'vendor' ? { name: '按厂商浏览', route: 'vendor/' } : null);
  const aliasTarget = isAlias && plan
    ? (plan.pages.find(page => page.route === spec.aliasOf) || null)
    : null;

  // JSON-LD：#1 CollectionPage、#2 BreadcrumbList、#3 ItemList。
  // `/status/` 那页连面包屑都只有可见侧、结构化数据一条都没有 —— 这里补齐。
  //
  // ⚠️ **一段一个对象**，不是把三个塞进一个 `<script>` 数组里。
  // 站点的既有约定（首页 5 段、详情页 2 段）就是「每段一个顶层 `@type`」，
  // 自检按 `JSON.parse(block)['@type']` 读；塞成数组时那个表达式得到 `undefined`，
  // 既不抛错也不命中 —— 自检会报「缺少 JSON-LD」而真正的原因是**形状不对**。
  // （第一版就是这么写的，被这条自检当场拦下。）
  //
  // v1.7 起 ItemList **全量发出**（不再 `slice(0, 50)`）：老实现声明 `deals.length`
  // 却只发 50 项，/developer/ 67 条那一页就成了「声明 67、实列 50」——
  // 而没有任何断言会发现（Tooth Test #4 就是为它写的）。
  const itemListElements = isHub
    ? childList.map((child, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: `${SITE_URL}${child.route}`,
      name: child.title || child.label
    }))
    : deals.map((deal, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: `${SITE_URL}deal/${encodeURIComponent(deal.id)}/`,
      name: deal.title
    }));
  const jsonLdBlocks = [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: `${spec.heading} · ${SITE_NAME}`,
      description: spec.description,
      url: pageUrl,
      inLanguage: 'zh-CN',
      isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: SITE_URL }
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '首页', item: SITE_URL },
        ...(crumbParent
          ? [{ '@type': 'ListItem', position: 2, name: crumbParent.name, item: `${SITE_URL}${crumbParent.route}` }]
          : []),
        { '@type': 'ListItem', position: crumbParent ? 3 : 2, name: spec.title, item: pageUrl }
      ]
    },
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: spec.heading,
      numberOfItems: itemListElements.length,
      itemListElement: itemListElements
    }
  ].map(data => `<script type="application/ld+json">
${JSON.stringify(data, null, 2).split('\n').map(line => `  ${line}`).join('\n')}
</script>`).join('\n');

  // 表头 / 题注 / 分类间说明：按 kind 分叉。分类页那句「分类之间不互斥」在按需求页上
  // 是错的（需求之间不互斥，且同一页里的判据是「或」）—— 照抄会让页面上出现一句
  // 与事实不符的话，这正是 v1.0 那类错误。所以每种 kind 各写一句，各自成立。
  const headRow = HEADERS.map(text => `            <th scope="col">${htmlEscape(text)}</th>`).join('\n');
  const caption = isHub
    ? `共 ${childList.length} 个入口。每个入口一页，页面上的条数按当前数据现算；没有达到门槛的分类与厂商不会出现在这里，原因写在构建日志与项目报告里。`
    : (isAlias
      ? `共 ${deals.length} 条 —— 与 <a href="${prefix}${spec.aliasOf}">${htmlEscape(aliasTarget ? aliasTarget.title : spec.aliasOf)}</a> 是同一批条目（同一份判据）。这一页保留旧地址可用，但<b>不参与搜索收录</b>；收录以目标页为准。`
      : (isNeed
        ? `共 ${deals.length} 条。每一行的依据都在对应的详情页上；没有依据的字段写「尚未确认」，不写成「不可用」。
          本页按单一判据收条目，判据写在上面的说明里；首页会把同一厂商的同类优惠折叠成一张卡片，所以首页入口上的数字（卡片数）通常少于这里的条数。`
        : `共 ${deals.length} 条。每一行的依据都在对应的详情页上；没有依据的字段写「尚未确认」，不写成「不可用」。
          首页会把同一厂商的同类优惠折叠成一张卡片，所以首页筛选项上的数字（卡片数）通常少于这里的条数。`));
  const footNote = isHub
    ? `这里列出的入口都是<b>静态页面</b>：无 JS 也能打开，每页都有自指 canonical 与自己的订阅地址。
        本站只做收录与整理，来源站点的可用性、内容与最终条款以官方页面为准。`
    : (kind === 'vendor'
      ? `厂商名按站内<b>归一规则</b>合并（同一个公司的不同写法落到同一页）。同一条优惠也会出现在分类页、学生页或开发者页里 —— 那几种页面是<b>不同</b>的切法，本来就会重叠。
        本站只做收录与整理，来源站点的可用性、内容与最终条款以官方页面为准。`
      : `分类之间<b>不互斥</b>：一条优惠可以同时出现在多个分类页与多个需求页里（既是给学生的、也是免费 API 的情况很常见）。
        本站只做收录与整理，来源站点的可用性、内容与最终条款以官方页面为准。`);

  // 数据摘要（v1.7）：每个数字都带 `data-summary-label/value`，既给读者看，
  // 也给 SEO 门禁**独立重算**用 —— 「页面写 12、实际列 7」因此在构建期就红。
  const summaryHtml = summary.length
    ? `      <ul class="lsum" aria-label="当前数据摘要">
${summary.map(row => `        <li data-summary-label="${htmlEscape(row.label)}" data-summary-value="${htmlEscape(String(row.value))}">` +
    `<span>${htmlEscape(row.label)}</span><b>${htmlEscape(String(row.value))}</b>${htmlEscape(row.unit || '')}` +
    `<small title="${htmlEscape(row.source || '')}">判据：${htmlEscape(row.source || '')}</small></li>`).join('\n')}
      </ul>`
    : '';

  // 最近变化（v1.7）：判据不在模板里，`landing.topicChangesOf()` 已经把本页条目的事件挑出来。
  const topicHtml = context.topic
    ? context.renderCore.changesTopicHtml(context.topic, prefix)
    : '';

  // 别名页的可见说明：读者点进旧地址时要知道自己在哪、该去哪里。
  const aliasNote = isAlias
    ? `      <p class="snote aliasnote">这一页是<b>旧地址</b>：它与 <a href="${prefix}${spec.aliasOf}">` +
      `${htmlEscape(aliasTarget ? aliasTarget.title : spec.aliasOf)}</a> 收的是同一批条目（同一份判据）。` +
      `页面保留是为了让老链接仍然可用，但搜索引擎的收录以目标页为准（本页为 noindex）。` +
      `${spec.aliasReason ? `原因：${htmlEscape(spec.aliasReason)}` : ''}</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${htmlEscape(spec.heading)} · ${htmlEscape(SITE_NAME)}</title>
<meta name="description" content="${htmlEscape(spec.description)}">
<meta name="robots" content="${isAlias ? 'noindex, follow' : 'index, follow, max-image-preview:large'}">
<link rel="canonical" href="${pageUrl}">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#f6f7f9" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0b0d10" media="(prefers-color-scheme: dark)">
<link rel="icon" href="${prefix}favicon.svg" type="image/svg+xml">
<!-- feed 约定：本页自己的订阅（如果有）+ 站点根 Feed。两者都要：根 Feed 是「全部优惠」，
     本页 Feed 是「这一类」，读者的选择不同。 -->
${feedTags}
${themeScript}
${style}
<style>
  /* 只用首页已有的设计变量，不新建一套视觉语言 */
  .cstop { display: flex; align-items: baseline; gap: var(--s2); flex-wrap: wrap; margin-bottom: var(--s2); }
  .cstop h1 { font-size: 19px; margin: 0; }
  .cstop .meta { color: var(--mut); font-size: var(--fs-sm); }
  .snote { color: var(--mut); font-size: var(--fs-sm); line-height: 1.7; margin: 0 0 var(--s3); max-width: 70ch; }
  .aliasnote { border-left: 3px solid var(--line); padding-left: var(--s2); }
  .lsum { display: flex; flex-wrap: wrap; gap: var(--s2); list-style: none; margin: 0 0 var(--s3); padding: 0; }
  .lsum li { background: var(--card); border: 1px solid var(--line); border-radius: var(--r); padding: 6px 10px; font-size: var(--fs-sm); }
  .lsum li span { color: var(--mut); }
  .lsum li b { margin: 0 2px 0 6px; }
  .lsum li small { display: block; color: var(--mut); font-size: 11px; margin-top: 2px; max-width: 34ch; }
  .ctable { width: 100%; border-collapse: collapse; background: var(--card); border: 1px solid var(--line); border-radius: var(--r); overflow: hidden; }
  .ctable caption { text-align: left; color: var(--mut); font-size: var(--fs-sm); padding: 0 0 var(--s2); }
  .ctable th, .ctable td { text-align: left; padding: 10px 12px; border-top: 1px solid var(--line); font-weight: 400; font-size: var(--fs-sm); vertical-align: top; }
  .ctable thead th { border-top: 0; color: var(--mut); font-weight: 600; white-space: nowrap; }
  .ctable tbody th { font-weight: 600; }
  .ctable small { display: block; color: var(--mut); font-weight: 400; font-size: 11.5px; margin-top: 2px; }
  .ctable small.zh { color: var(--fg); opacity: .72; }
  .ctable .none { color: var(--mut); }
  .ctable-wrap { overflow-x: auto; }
  @media (max-width: 760px) { .ctable th, .ctable td { padding: 8px 9px; } }
${extraCss}
</style>
${jsonLdBlocks}
</head>
<body>
  <header class="top">
    <div class="topin">
      <a class="brand" href="${prefix}">
        <span class="mark" aria-hidden="true">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0l-7.2-7.2A2 2 0 0 1 3 12V4.6A1.6 1.6 0 0 1 4.6 3H12a2 2 0 0 1 1.4.6l7.2 7.2a2 2 0 0 1 0 2.6Z"/>
            <path d="M12 8v6"/><path d="m9.5 11.5 2.5 2.5 2.5-2.5"/>
          </svg>
        </span>
        <span class="btxt"><b>AI <em>优惠</em>聚合器</b><small>真实优惠 · 每日更新</small></span>
      </a>
      <a class="jumpback" href="${prefix}">← 返回全部优惠</a>
    </div>
  </header>

  <div class="wrap">
    <main id="main">
      <nav class="crumb" aria-label="面包屑"><a href="${prefix}">首页</a>${
  crumbParent ? ` › <a href="${prefix}${crumbParent.route}">${htmlEscape(crumbParent.name)}</a>` : ''
} › <span>${htmlEscape(spec.title)}</span></nav>

      <div class="cstop">
        <h1>${htmlEscape(spec.heading)}</h1>
        <span class="meta">共 ${isHub ? childList.length : deals.length} ${isHub ? '个入口' : '条'} · 数据更新 ${htmlEscape(String(context.lastmod || ''))}</span>
      </div>
${aliasNote}
      <p class="snote">
${why}
      </p>

${summaryHtml}

      <div class="ctable-wrap">
      <table class="ctable">
        <caption>${caption}</caption>
        <thead>
          <tr>
${headRow}
          </tr>
        </thead>
        <tbody>${body}
        </tbody>
      </table>
      </div>

${topicHtml}

${extraHtml}

      <p class="snote" style="margin-top: var(--s3)">
        ${footNote}
      </p>
    </main>
    ${footer}
  </div>
</body>
</html>
`;
}

/* ------------------------------------------------------------------ */
/* 组装                                                                 */
/* ------------------------------------------------------------------ */

function assemble() {
  console.log(`\n=== 2) 组装产物 ${showOut(FINAL_OUT)} ===`);
  console.log(`  写入暂存目录 ${showOut(STAGE_OUT)}`);
  console.log(`  自检全过之后才替换到 ${showOut(FINAL_OUT)}；失败则清掉暂存目录，${showOut(FINAL_OUT)} 保持原样`);
  // maxRetries/retryDelay：Windows 上杀软、同步客户端、静态服务都可能短暂占住目录，
  // 默认 0 重试会直接 EPERM/EBUSY 失败。
  fs.rmSync(STAGE_OUT, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  fs.mkdirSync(STAGE_OUT, { recursive: true });

  for (const file of PUBLIC_FILES) {
    const from = path.join(ROOT, file);
    if (!fs.existsSync(from)) throw new Error(`缺少发布文件: ${file}`);
    fs.copyFileSync(from, path.join(OUT, file));
  }

  // 厂商 logo：品牌矢量现场生成为独立 SVG，官网文件原样拷贝，规则写进 logos.css。
  // 全部落盘、不热链任何第三方 CDN。
  const logoSet = loadLogos();
  const logoStat = writeLogos(OUT, logoSet.logos);
  console.log(`  logo 资产: ${logoStat.count} 个 → logos/ ${logoStat.files} 个文件 + logos.css（${(logoStat.bytes / 1024).toFixed(1)} KB）`);

  // RENDER-CORE 在这里就装配好（v1.7 起提前到读数据之前）：落地页计划与厂商 Feed
  // 都要用 `vendorOf()` 的**规范厂商名** —— 页面与订阅若各用一套厂商标识，
  // 就会出现「/vendor/volcengine/ 列 13 条、它的 Feed 只有 12 条」这种自相矛盾。
  // 沙箱里的函数全是纯函数，提前装配没有任何副作用。
  const indexFile = path.join(OUT, 'index.html');
  const renderCore = loadRenderCore(indexFile);
  checkLogoCoverage(renderCore, logoSet.logos);
  VENDOR_KEY_OF = deal => renderCore.vendorOf(deal).name;

  const payload = JSON.parse(fs.readFileSync(path.join(ROOT, 'deals.json'), 'utf8'));

  // 中文译文覆盖层：构建期贴一次，并把**贴好的**那份写进 dist/deals.json。
  // 关键点——浏览器 fetch('deals.json') 拿到的和下面预渲染用的是同一份对象，
  // 于是「构建期预渲染」与「浏览器端渲染」仍然只有一条代码路径。
  // 译文只在 zh 字段，英文原文字段一个字节都不动。
  const zhAttached = attachZh(payload.deals);
  payload.deals = zhAttached.deals;

  // 译文门禁。第 1 步的校验跑在**未贴译文**的 deals.json 上，所以 validateDeal 里的 zh
  // 规则在那里永远不会被触发——必须在这里补一道，否则「译文不是中文 / 字段名写错 / 超长」
  // 这类错误会一路静默发到线上。
  // 分级处理：不合规 = 硬失败（译文文件只有人维护，永远能改对）；
  //          原文已变 = 警告 + 该字段译文停用（采集器改英文不该把发布卡死）。
  if (zhAttached.report.skipped.length) {
    const lines = zhAttached.report.skipped.map(row => `  - ${row.title} [${row.id}]: ${row.message}`);
    throw new Error(`中文译文不合规（${zhAttached.report.skipped.length} 处），已阻止发布：\n${lines.join('\n')}`);
  }

  // 分类归属在**构建期**由 `audience.collectionsOf` 一处算出，写进 `dist/deals.json` 的
  // `collections` 字段；分类页与首页筛选器都读它。
  //
  // 于是「首页筛出来的条数」与「分类页列出的条数」**不可能不一致** —— 它们读的是同一份
  // 算好的数据，而不是同一套判据的两份实现（一份在 node、一份在 RENDER-CORE）。
  // 这正是这一阶段反复吃到的教训：判据写两遍，两份会各自「看起来对」。
  //
  // 它只进 dist：源 deals.json 保持「只有事实」，派生结果跟着产物走 ——
  // 可重建性门禁因此不需要认识这个字段。
  for (const deal of payload.deals) {
    const list = audience.collectionsOf(deal);
    if (list.length) deal.collections = list;
    else delete deal.collections;
  }

  // 按需求入口的命中（v1.2）：同样在构建期由**一处**算出（`audience.needsOf`），
  // 写进 `dist/deals.json` 的 `needs` 字段。页面生成、首页入口数字、断言都读这一份 ——
  // 前端一个判据都不复刻（`collections` 那条注释里的教训在这里原样适用）。
  // 顺序由注册表决定（`NEED_PAGES` 的次序），所以同一份数据每次构建的序列化结果相同。
  for (const deal of payload.deals) {
    const list = audience.needsOf(deal);
    if (list.length) deal.needs = list;
    else delete deal.needs;
  }

  // v1.3：采集事实（层 C）也在构建期派生，同样只进 dist。
  //
  // 为什么不是写进源数据：`lastSuccessAt` 是**来源**的属性、且每轮采集都刷新，
  // 写进源数据会让 134 条记录天天全变一行（diff 失去意义、可重建性门禁也跟着变形）。
  // 心跳的唯一权威是 source-health.json，这里只做一次 join；join 的键是
  // `deal.source` ↔ 心跳行的 `name`（1:1，由下面的自检与 provenance-selftest 盯着）。
  //
  // 缺失分级也在这里定死：整份心跳缺失/损坏 → 全部 unavailable（而不是把每条都判成「未知」，
  // 那会把「构建没拿到数据」说成「这个来源查不到」）。
  const healthStore = health.load();
  const healthDoc = healthStore.missing || healthStore.broken ? health.emptyDoc() : healthStore.doc;
  if (healthStore.broken) console.log(`  ⚠️  ${health.HEALTH_FILE} 解析失败：${healthStore.broken}（状态页按无数据渲染）`);
  const sourceIndex = provenance.buildSourceIndex(healthDoc);
  const unmatchedSources = new Set();
  for (const deal of payload.deals) {
    deal.sourceFacts = provenance.factsFor(deal, {
      index: sourceIndex,
      healthMissing: healthStore.missing,
      healthBroken: Boolean(healthStore.broken)
    });
    if (!provenance.SOURCE_TYPES[deal.source]) unmatchedSources.add(deal.source || '(无来源)');
  }
  if (unmatchedSources.size) {
    // 只告警不拦发布：来源表漏登记时的表现是那几条显示「未知」，而不是页面说假话。
    // 真拦在 `validate --strict` 的 provenance 守卫里（那里能逐条点名到记录）。
    console.warn(`    ⚠️  有 ${unmatchedSources.size} 个来源没在 provenance.SOURCE_TYPES 里登记：` +
      `${[...unmatchedSources].join('、')}（这些记录会显示「来源类型：未知」）`);
  }

  // v1.4：变更记录（层 D）同样是构建期派生，只进 dist。
  //
  // 源数据里**不能**有 `history`（`validateDeal` 的白名单会拒，`check-reproducible` 也另有一条断言）：
  // 它是「时间维度的派生视图」，真值在 `scripts/data/deal-history.json`。
  // 注入是有界的（每条最近 N 条 + 总数），保证浏览器只需 fetch 一次 deals.json，
  // 且弹层与静态详情页读到的历史**完全同源**（v1.3 那次 `known` 被渲染成「未知」的教训）。
  const historyStore = history.load();
  let historyStats = null;
  if (historyStore.missing || historyStore.broken) {
    console.warn(`    ⚠️  历史日志不可用（${historyStore.broken || '文件缺失'}）——本次产物里没有变更记录，check:history 会报错`);
  } else {
    historyStats = history.summarize(historyStore.store, payload.deals);
    payload.deals = history.attachToDeals(payload.deals, historyStore.store);
    fs.writeFileSync(path.join(OUT, 'deal-history.json'), `${JSON.stringify(historyStore.store, null, 2)}\n`, 'utf8');
    console.log(`  变更记录: ${historyStats.events} 条事件 · 涉及 ${historyStats.recordsWithHistory} 条记录 · ` +
      `起算日 ${historyStats.startedAt}（deal-history.json + 每条最近 ${history.RENDER_LIMIT} 条注入 dist/deals.json）`);
  }

  // v1.5：变化雷达。**判据只有一处**（lib/changes.js 的 buildRadar），这里算一次，
  // 首页条带与 /changes/ 静态页共用同一份结果 —— 前端一个判据都不复刻。
  //
  // 基准日取**数据时间**（payload.updatedAt 的日期），不是构建时刻：
  //   · 与卡片上的「数据更新」同一口径；页面上不会出现「基准日比数据还新」这种自相矛盾；
  //   · 同一天两次构建的产物逐字节相同（构建确定性 N2），跨零点也不会因为构建时刻而变。
  // 日志缺失/损坏时 availability = 'unavailable'，页面照常出、但明说「没拿到历史日志」，
  // 绝不渲染成「没有变化」（这两种事实在页面上必须是两句不同的话）。
  const radarAsOf = String(payload.updatedAt || '').slice(0, 10);
  const radarAvailability = historyStore.missing || historyStore.broken ? 'unavailable' : 'ok';
  const radar = changes.buildRadar({
    deals: payload.deals,
    store: historyStore.store,
    asOf: radarAsOf,
    availability: radarAvailability
  });
  const radarStats = changes.summarize(radar);
  // ItemList 与页面行标记读的**同一份**集合（判据在 `changes.itemListRecords()`）：
  // 自检用它给 SEO 门禁传 `itemIds`，并按它逐条对账「页面可见行 ↔ ItemList 成员」。
  const changesItemList = changes.itemListRecords(radar);
  console.log(`  变化雷达: ${radar.availability === 'ok' ? '可用' : '不可用（无历史日志）'} · 基准日 ${radar.asOf || '未知'}` +
    ` · 今日新增 ${radarStats.totals.created} · 最近 7 天变化 ${radarStats.totals.changed} · 即将结束 ${radarStats.totals.endingSoon}` +
    ` · 已结束 ${radarStats.totals.ended} · 重新出现 ${radarStats.totals.restored} · 其他（不上首页）${radarStats.totals.other}` +
    ` · 首页条带 ${radarStats.homeCount} 项`);

  // v1.7：落地页计划。**一次算清**「哪些页面该存在、每页收哪些条目、谁被跳过、为什么」，
  // 之后目录页生成、sitemap、首页入口行、页脚厂商行、Feed 声明与产物自检都读这一份。
  //
  // 厂商门槛**复用订阅那一套常量**（feeds.VENDOR_THRESHOLDS）：页面与 Feed 的集合
  // 因此在结构上不可能分头变化 —— 这正是 v1.6 报告里那条「URL 稳定性只兜住一半」的补法。
  const vendorEventCount = (() => {
    const counts = new Map();
    const vendorOfId = new Map(payload.deals.map(deal => [deal && deal.id, deal ? VENDOR_KEY_OF(deal) : '']));
    for (const event of history.eventsOf(historyStore.store)) {
      const name = vendorOfId.get(event && event.id);
      if (!name) continue;
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    return counts;
  })();
  // ⚠️ v3.0 Stage E：`landing.planLandingPages()` 的调用点**后移到 Model Registry 之后**
  // （见下面「落地页计划」那一段）—— 因为它现在要 join 四份数据：
  // plans / api-plans / providerTable / Model Registry 的派生产物。
  // 这几行只依赖 `payload.deals` 与历史层，所以留在原地。


  // ---- v2.3：套餐数据 + 套餐变化日志（在 feeds / 页面之前准备，三处共用同一份 radar）----
  //
  // 套餐对比页（/plans/coding/，v2.1 第二段）**始终生成**：
  // 它回答的是「长期用什么套餐」，条数为 0 也只说明我们还没收录，而不是这一页没有价值。
  // 数据非法会被这里拦下（与 validate.js 同一把尺子，不重写判据）：宁可不发布，
  // 也不要把一份自相矛盾的套餐表发出去 —— 读者无法从页面上看出哪一格是错的。
  const plansStore = JSON.parse(fs.readFileSync(path.join(ROOT, 'plans.json'), 'utf8'));
  const providerTable = providers.load().table;
  {
    const result = planSchema.validatePlansStore(plansStore, { providerTable });
    if (!result.ok) {
      throw new Error(`plans.json 未通过数据集级校验（${result.errors.length} 项）：\n  - ${result.errors.slice(0, 5).join('\n  - ')}`);
    }
    const dataProblems = plansPage.assertDataHonesty(plansStore.plans);
    if (dataProblems.length) {
      throw new Error(`套餐数据里出现结论性词汇（${dataProblems.length} 处）：\n  - ${dataProblems.slice(0, 5).join('\n  - ')}`);
    }
  }
  // 套餐变化日志与 deals 的历史层同一套纪律：
  //   · 真值是 `scripts/data/plan-history.json`，构建期**只读**，另发一份逐字节相同的产物；
  //   · 缺文件/损坏时照常出页，但页面必须说「没有拿到日志」（而不是「没有变化」）；
  //   · 变化文本由 `plan-changes.js` 判据 + `plans-page.js` 的同一句话渲染，不在这里另写一套。
  const planHistoryLoad = planHistory.load();
  const planHistoryAvailability = planHistoryLoad.missing || planHistoryLoad.broken ? 'unavailable' : 'ok';
  if (planHistoryAvailability !== 'ok') {
    console.warn(`    ⚠️  套餐变化日志不可用（${planHistoryLoad.broken || '文件缺失'}）——本次产物里没有套餐变更记录，check:plan-history 会报错`);
  } else {
    fs.writeFileSync(path.join(OUT, 'plan-history.json'), `${JSON.stringify(planHistoryLoad.store, null, 2)}\n`, 'utf8');
  }
  const planRadar = planChanges.buildPlanRadar({
    plans: plansStore.plans,
    store: planHistoryAvailability === 'ok' ? planHistoryLoad.store : null,
    asOf: String(plansStore.updatedAt || '').slice(0, 10),
    availability: planHistoryAvailability
  });
  const planRadarStats = planChanges.summarize(planRadar);
  const planHistoryStore = planHistoryAvailability === 'ok' ? planHistoryLoad.store : null;

  // ---- v2.5：API / Token 计费数据 + 变化日志 -------------------------------------------
  //
  // 与上面的套餐（plans）**并列且互不注入**：两份数据、两条路由、两套判据。
  // 共享的只有 BasePlan 的判据原语与 `history-core` 的写入内核（见 docs/SCHEMA-v2.5.md §2）。
  // 数据非法在这里拦下（与 validate.js 同一把尺子），宁可不发布也不发一份自相矛盾的价目表。
  const apiPlansStore = JSON.parse(fs.readFileSync(path.join(ROOT, 'api-plans.json'), 'utf8'));
  {
    const result = apiPlanSchema.validateApiPlansStore(apiPlansStore, { providerTable });
    if (!result.ok) {
      throw new Error(`api-plans.json 未通过数据集级校验（${result.errors.length} 项）：\n  - ${result.errors.slice(0, 5).join('\n  - ')}`);
    }
    const dataProblems = apiPlansPage.assertDataHonesty(apiPlansStore.plans);
    if (dataProblems.length) {
      throw new Error(`API 计费数据里出现结论性词汇（${dataProblems.length} 处）：\n  - ${dataProblems.slice(0, 5).join('\n  - ')}`);
    }
  }
  const apiPlanHistoryLoad = apiPlanHistory.load();
  const apiPlanHistoryAvailability = apiPlanHistoryLoad.missing || apiPlanHistoryLoad.broken ? 'unavailable' : 'ok';
  if (apiPlanHistoryAvailability !== 'ok') {
    console.warn(`    ⚠️  API 计费变化日志不可用（${apiPlanHistoryLoad.broken || '文件缺失'}）——本次产物里没有 API 价格变更记录，check:api-plan-history 会报错`);
  } else {
    fs.writeFileSync(path.join(OUT, 'api-plan-history.json'), `${JSON.stringify(apiPlanHistoryLoad.store, null, 2)}\n`, 'utf8');
  }
  const apiPlanHistoryStore = apiPlanHistoryAvailability === 'ok' ? apiPlanHistoryLoad.store : null;
  {
    const historyProblems = apiPlansPage.assertHistoryHonesty(apiPlansStore.plans, apiPlanHistoryStore);
    if (historyProblems.length) {
      throw new Error(`API 计费变化日志里有说不清的东西（${historyProblems.length} 处）：\n  - ${historyProblems.slice(0, 5).join('\n  - ')}`);
    }
    const stats = apiPlanSchema.summarize(apiPlansStore);
    console.log(`  API 计费: ${stats.total} 条记录 · ${stats.providers} 个平台 · ${stats.models} 个模型计价条目` +
      ` · 国内 ${stats.cn} / 国外 ${stats.global} · 免费额度 ${stats.withFreeTier} 条 · credits ${stats.withCredits} 条` +
      ` · 变化日志${apiPlanHistoryAvailability === 'ok' ? ` ${apiPlanHistoryLoad.store.events.length} 条事件` : '不可用'}`);
  }

  // v3.0 Stage H：API 价格变化视图。与套餐那一份**共用 `buildChangeRadar` 骨架**，
  // 差异（取哪份日志 / 哪些类型算元信息 / 首页优先级 / 措辞 / 记录展示身份）全部登记在
  // `plan-changes.js` 的 `RADAR_SOURCES` 里 —— 这里只把三样数据交进去，不重写任何判据。
  const apiPlanRadar = planChanges.buildApiPlanRadar({
    plans: apiPlansStore.plans,
    store: apiPlanHistoryStore,
    asOf: String(apiPlansStore.updatedAt || '').slice(0, 10),
    availability: apiPlanHistoryAvailability,
    providerTable
  });
  const apiPlanRadarStats = planChanges.summarize(apiPlanRadar);

  // ---- v3.0 Stage D：Model Registry（身份层 + 关系层）-----------------------------------
  //
  // 与 plans / api-plans **互不注入**：registry 是索引 / 身份层，不是价格真值层。
  // 四件事按顺序做，与套餐 / API 同一条纪律：
  //   ① 读人工来源层（`scripts/data/models.json` 是 `{slug: entry}`，键就是 slug）；
  //   ② 用同一支判据校验（与 validate.js / check-* 工具共用 `lib/model-registry.js`）；
  //   ③ 派生发布产物（`models.json` / `model-registry-links.json`）写进 dist；
  //   ④ 与仓库里那份派生产物**逐字节比对** —— 两份"已发布"的文件不许漂移。
  const modelsLoad = modelRegistry.load();
  if (modelsLoad.missing) throw new Error(`缺少 ${path.relative(ROOT, modelRegistry.MODELS_FILE)}：模型身份层不存在（它是仓库里的源文件，不是派生产物）`);
  if (modelsLoad.broken) throw new Error(`${path.relative(ROOT, modelRegistry.MODELS_FILE)} 解析失败：${modelsLoad.broken}`);
  const modelsLinksLoad = modelRegistry.loadLinks();
  if (modelsLinksLoad.missing) throw new Error(`缺少 ${path.relative(ROOT, modelRegistry.LINKS_FILE)}：模型关系层不存在（它是仓库里的源文件，显式映射只能人写）`);
  if (modelsLinksLoad.broken) throw new Error(`${path.relative(ROOT, modelRegistry.LINKS_FILE)} 解析失败：${modelsLinksLoad.broken}`);
  // v3.0 修订：套餐侧那些"不对应单一模型身份"的模型串（模型池 / 系列名 / 一个串多个模型 /
  // registry 没有的身份 / 图像语音资源）必须在处置登记表里逐条给出理由。缺了它，构建就直接停 ——
  // 因为"一串都没漏判"是**构建的前提**，不是构建之后由报告顺手提一句的事。
  const modelsGapsLoad = modelRegistry.loadGaps();
  if (modelsGapsLoad.missing) throw new Error(`缺少 ${path.relative(ROOT, modelRegistry.GAPS_FILE)}：套餐侧模型串的处置登记表不存在（每一串都要人工判一次，判不了也必须写明理由）`);
  if (modelsGapsLoad.broken) throw new Error(`${path.relative(ROOT, modelRegistry.GAPS_FILE)} 解析失败：${modelsGapsLoad.broken}`);
  const modelsTable = modelsLoad.table;
  const modelLinksDoc = modelsLinksLoad.doc;
  const modelsSourceRaw = JSON.parse(fs.readFileSync(modelRegistry.MODELS_FILE, 'utf8'));
  // 开发者允许名单 = providers.json 的规范显示名 ∪ `_developers_extra` 的键（与 validate.js /
  // rebuild-models / check-models-reproducible 用**同一份**口径，不在这里另立一张表）。
  const modelDevelopers = Object.values(providerTable).map(entry => String((entry && entry.name) || ''));
  const modelsExtraDevelopers = Object.keys((modelsSourceRaw && modelsSourceRaw._developers_extra) || {});
  {
    const registryProblems = [
      ...modelRegistry.validateRegistry(modelsTable, { developers: modelDevelopers, extraDevelopers: modelsExtraDevelopers }),
      ...modelRegistry.validateLinks(modelLinksDoc, {
        table: modelsTable, apiPlans: apiPlansStore.plans, plans: plansStore.plans, gaps: modelsGapsLoad.doc
      }),
      ...modelRegistry.validateGaps(modelsGapsLoad.doc, {
        plans: plansStore.plans, links: modelLinksDoc, table: modelsTable, apiPlans: apiPlansStore.plans
      }),
      // 覆盖完整性：任何一条套餐模型串"既没映射也没声明"都在这里停住（不许静默留空）
      ...modelRegistry.validatePlanModelCoverage({
        table: modelsTable, links: modelLinksDoc, gaps: modelsGapsLoad.doc,
        apiPlans: apiPlansStore.plans, plans: plansStore.plans
      })
    ];
    if (registryProblems.length) {
      throw new Error(`Model Registry 未通过校验（${registryProblems.length} 项）：\n  - ${registryProblems.slice(0, 8).join('\n  - ')}`);
    }
  }
  // coverage-expansion-v1：`catalogStatus` / `catalogReason` 是**派生**字段，判据在
  // `scripts/lib/model-freshness.js`。这里必须与 `rebuild-models.js` / `check-models-reproducible.js`
  // 用**同一支派生**：不传 catalog 的话，本处会写出"全部 unknown"的那一份，于是下面
  // "与仓库里的派生产物逐字节相同"必然失败（而盘上那份是对的）—— 那是假红，会挡住整个构建。
  const modelCatalog = (() => {
    try {
      const freshness = require('../lib/model-freshness');
      const report = freshness.deriveCatalog({
        models: Object.keys(modelsTable).sort().map(slug => {
          const entry = modelsTable[slug] || {};
          return {
            slug,
            developer: entry.developer === undefined ? null : entry.developer,
            family: entry.family === undefined ? null : entry.family,
            modelRole: entry.modelRole === undefined ? null : entry.modelRole,
            releasedAt: entry.releasedAt === undefined ? null : entry.releasedAt,
            status: entry.status === undefined ? null : entry.status,
            freshnessGroup: entry.freshnessGroup === undefined ? null : entry.freshnessGroup
          };
        })
      });
      if (report.invariantViolations.length) {
        throw new Error(`新鲜度层报出 ${report.invariantViolations.length} 条硬不变量违规：${report.invariantViolations.slice(0, 3).map(item => `[${item.code}] ${item.detail}`).join(' | ')}`);
      }
      return report;
    } catch (error) {
      throw new Error(`catalogStatus 无法派生（${error.message}）—— 派生层缺位时不允许继续构建：写到一半的目录状态会与仓库里的派生产物不一致`);
    }
  })();
  const publishedModels = modelRegistry.publishedModels({
    table: modelsTable, links: modelLinksDoc, apiPlans: apiPlansStore.plans, plans: plansStore.plans, catalog: modelCatalog
  });
  const publishedModelLinksModelDoc = modelRegistry.publishedLinks(modelLinksDoc, modelsTable);
  for (const [file, doc] of [['models.json', publishedModels], ['model-registry-links.json', publishedModelLinksModelDoc]]) {
    fs.writeFileSync(path.join(OUT, file), modelRegistry.serialize(doc), 'utf8');
    const shipped = path.join(ROOT, file);
    if (fs.existsSync(shipped)) {
      const a = fs.readFileSync(shipped, 'utf8');
      const b = fs.readFileSync(path.join(OUT, file), 'utf8');
      if (a !== b) throw new Error(`${file} 与仓库里那份派生产物不是逐字节相同（先跑 npm run models:rebuild）`);
    }
  }
  {
    const stats = modelRegistry.summarize(publishedModels);
    const coverageStats = modelRegistry.coverageOf({
      table: modelsTable, links: modelLinksDoc, gaps: modelsGapsLoad.doc, apiPlans: apiPlansStore.plans, plans: plansStore.plans
    });
    console.log(`  模型注册表: ${stats.total} 个模型 · ${stats.developers} 个开发者 · ${stats.families} 个模型族` +
      ` · 状态 ${Object.entries(stats.byStatus).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(' / ')}` +
      ` · 关系 ${publishedModelLinksModelDoc.count} 条（API ${coverageStats.apiLinks} / Coding ${coverageStats.codingLinks}）` +
      ` · 未映射 API modelKey ${coverageStats.unmappedModelKeys.length} 条` +
      ` · 套餐模型串 ${coverageStats.planModelStrings} 条（已映射 ${coverageStats.planModelStrings - coverageStats.unmappedPlanModels.length - coverageStats.declaredPlanModels.length} / 已声明不对应单一模型身份 ${coverageStats.declaredPlanModels.length} / 未判 ${coverageStats.unmappedPlanModels.length}）` +
      ` · 未被引用的模型 ${coverageStats.unlinkedModels.length} 个`);
  }

  // ---- v3.0 Stage E：落地页计划（**在这里才拿得到全部 join 输入**）------------------------
  //
  // 为什么后移到 Model Registry 之后：厂商页的门槛从「只有优惠条数」变成三条 OR
  // （条数 ≥2 / 历史事件 ≥3 / **至少一种非优惠资料**：Coding 套餐 · API 记录 · Registry 模型），
  // 所以 `planLandingPages()` 现在要 join `plans` / `api-plans` / `models` / 关系层四份数据。
  // 把调用点后移（而不是把那四份数据前移）是一次**减少重复行数**的选择：
  // 数据层只有一份加载顺序，计划层只被算一次。
  //
  // 被跳过的页面**逐条点名**（含条数与原因）：一个入口页「悄悄消失」是没人能发现的事故。
  PLAN = landing.planLandingPages({
    deals: payload.deals,
    vendorKeyOf: VENDOR_KEY_OF,
    vendorSlugs: feeds.VENDOR_SLUGS,
    vendorThresholds: feeds.VENDOR_THRESHOLDS,
    eventCountOf: name => vendorEventCount.get(name) || 0,
    // v3.0 Stage E：五份 join 输入（不传时行为与 v2.x 逐字节相同，由 selftest:vendor 钉住）。
    plans: plansStore.plans,
    apiPlans: apiPlansStore.plans,
    providerTable,
    // ⚠️ 传的是**派生产物**（带 slug / developer / owner），不是 `scripts/data/models.json`
    // 的来源层键值对象 —— 页面层要用 slug 与 developer。
    models: publishedModels.models,
    modelLinks: modelLinksDoc.links
  });
  DIRECTORY_PAGES = PLAN.pages;
  if (PLAN.problems.length) {
    // 门槛层的硬问题（达标厂商没登记 slug / 钉住的页面没生成 / 别名页没登记）。
    // 刻意在这里就抛出：这些是**配置与人做的决定**不一致，不是数据波动，
    // 继续构建只会把「某一页悄悄消失」变成线上的 404。
    throw new Error(`落地页计划有问题（${PLAN.problems.length} 处）：\n${PLAN.problems.map(line => `  - ${line}`).join('\n')}`);
  }
  console.log(`  落地页计划: ${landing.statsOf(DIRECTORY_PAGES).indexable} 条可索引 + ` +
    `${landing.statsOf(DIRECTORY_PAGES).noindex} 条别名`);
  for (const row of PLAN.skipped) {
    console.log(`    跳过 ${row.kind}/${row.key}${row.route ? ` (${row.route})` : ''}：` +
      `count=${row.count}${row.eventCount !== undefined ? ` events=${row.eventCount}` : ''} · ${row.reason}` +
      `${row.dealMaterial !== undefined ? ` deals=${row.dealMaterial}` : ''}` +
      `${row.nonDealMaterial !== undefined ? ` nonDeal=${row.nonDealMaterial}` : ''}` +
      `${row.detail ? ` · ${row.detail}` : ''}`);
  }

  // ---- v2.4：优惠 ↔ 套餐关系（Deal → Plan / Plan → Deal）--------------------------------
  //
  // 真值是人工来源层 `scripts/data/deal-plan-links.json`（deals.json 与 plans.json 都不改）。
  // 这里做三件事，顺序不能变：**先校验**（不合法宁可不发布）、**再派生**（基准日 / 状态 / 节省金额）、
  // **最后才注入**。注入的 `relatedPlans` 与发布的 `deal-plan-links.json` 都是**只进 dist** 的
  // 派生视图 —— 源数据里出现它们会被下面的产物自检当场报红（和 `history` / `collections` 同一条纪律）。
  const dealLinksLoad = dealPlanLinks.load();
  if (dealLinksLoad.missing) {
    throw new Error(`缺少 ${path.relative(ROOT, dealPlanLinks.LINKS_FILE)}：优惠与套餐的关系层不存在（它是仓库里的源文件，不是派生产物）`);
  }
  if (dealLinksLoad.broken) {
    throw new Error(`${path.relative(ROOT, dealPlanLinks.LINKS_FILE)} 解析失败：${dealLinksLoad.broken}`);
  }
  const dealLinksAsOf = dealPlanLinks.asOfOf({
    dealsUpdatedAt: payload.updatedAt,
    plansUpdatedAt: plansStore.updatedAt,
    apiPlansUpdatedAt: apiPlansStore.updatedAt
  });
  const dealLinksCtx = {
    deals: payload.deals,
    plans: plansStore.plans,
    // v2.5：id 空间是**合并**的（关系表格式一个字没改）—— 两个 store 的 id basis 都含 kind，
    // 因此一条 relationship 指向 api 记录时也解析得到，且 provider 一致性照常校验。
    apiPlans: apiPlansStore.plans,
    asOf: dealLinksAsOf,
    providerTable,
    dealHistoryStore: historyStore.store,
    planHistoryStore,
    apiPlanHistoryStore,
    strict: true
  };
  const dealLinksCheck = dealPlanLinks.validate(dealLinksLoad.doc, dealLinksCtx);
  if (dealLinksCheck.errors.length) {
    throw new Error(`deal-plan-links.json 未通过校验（${dealLinksCheck.errors.length} 项）：\n  - ${dealLinksCheck.errors.slice(0, 8).join('\n  - ')}`);
  }
  dealLinksCheck.warnings.forEach(message => console.warn(`    ⚠️  关联层：${message}`));
  const dealLinksView = dealPlanLinks.planDealsView(dealLinksLoad.doc, dealLinksCtx);
  const dealLinksByDeal = dealPlanLinks.dealView(dealLinksLoad.doc, dealLinksCtx);
  for (const deal of payload.deals) {
    const rows = dealLinksByDeal.get(deal.id);
    if (rows && rows.length) deal.relatedPlans = dealPlanLinks.relatedPlansOf(rows);
    else delete deal.relatedPlans;
  }
  {
    const published = dealPlanLinks.publishedDoc(dealLinksLoad.doc);
    fs.writeFileSync(path.join(OUT, 'deal-plan-links.json'), `${JSON.stringify(published, null, 2)}\n`, 'utf8');
    console.log(`  优惠 ↔ 套餐: ${dealLinksCheck.stats.links} 条当前关系 · 历史 ${dealLinksCheck.stats.retired} 条` +
      ` · 覆盖 ${dealLinksCheck.stats.plansWithCurrent}/${dealLinksCheck.stats.plans} 条套餐` +
      ` · 基准日 ${dealLinksAsOf || '未知'}` +
      (dealLinksCheck.stats.editorial ? ` · 人工判断 ${dealLinksCheck.stats.editorial} 条` : ''));
  }

  const feedBundle = feeds.buildFeeds({
    deals: payload.deals,
    store: historyStore.store,
    radar,
    asOf: radarAsOf,
    updatedAt: payload.updatedAt,
    availability: radarAvailability,
    vendorKeyOf: VENDOR_KEY_OF,
    planRadar,
    planAvailability: planHistoryAvailability,
    plans: plansStore.plans,
    providerTable,
    // v3.0 Stage H：API 价格变化是**并列的第二条变化流**（各自一份日志、各自的起算日）。
    // 不传这四项，API 那条 spec 就会按「没有拿到日志」渲染 —— 那正是 t4 里刻意避开的假话，
    // 所以下面的产物自检会断言「日志可用时描述里不许出现『没有拿到』」。
    apiPlanRadar,
    apiPlanAvailability: apiPlanHistoryAvailability,
    apiPlans: apiPlansStore.plans,
    apiProviderTable: providerTable
  });

  fs.writeFileSync(path.join(OUT, 'deals.json'), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`  中文译文: ${summarizeZh(zhAttached.report)}`);
  zhAttached.report.stale.forEach(row =>
    console.warn(`    🔁 原文已变，译文已停用待复核: ${row.title} — ${row.message}`));
  zhAttached.report.orphaned.forEach(row =>
    console.warn(`    ⚠️  译文对不上任何条目 id（条目可能改名/换 URL）: ${row.id} ${row.title}`));
  zhAttached.report.warnings.forEach(row =>
    console.warn(`    ℹ️  ${row.title}: ${row.message}`));
  if (zhAttached.report.unmanaged.length) {
    // 覆盖层管不到的译文：指纹比对（lib/zh.js）对它们不会执行，原文被改写时停用逻辑失效，
    // 旧译文会一直发到线上。这里按告警打出来，并由 check:zh（zh-todo.js --check）计为漂移。
    console.warn(
      `    ⚠️  ${zhAttached.report.unmanaged.length} 条译文不在覆盖层里（deals.json 自带、覆盖层管不到）：` +
      `${zhAttached.report.unmanaged.slice(0, 5).map(row => row.title).join('、')}`
    );
  }
  if (zhAttached.report.missing.length) {
    console.log(`    ℹ️  仍有 ${zhAttached.report.missing.length} 条英文文案待翻译（node scripts/tools/zh-todo.js）`);
  }

  console.log('\n=== 3) 预渲染静态骨架 ===');
  let html = fs.readFileSync(indexFile, 'utf8');
  // 默认视图卡片：同时移除「加载数据中…」占位（预渲染内容已经可读）
  const rendered = renderDeals(renderCore, payload);
  html = replaceMarker(html, '<!--PRERENDER:deals-->', rendered.html);
  html = html.replace(/\s*<div class="loading">加载数据中…<\/div>/g, '');
  console.log(`  卡片预渲染: ${rendered.count} 条（${rendered.dist}）`);

  // 骨架的其余部分：筛选条计数、顶栏汇总、结果条、分类选项
  html = replaceMarker(html, '<!--PRERENDER:facets-->', rendered.facets);
  html = replaceMarker(html, '<!--PRERENDER:topstat-->', rendered.topStat);
  html = replaceMarker(html, '<!--PRERENDER:stats-->', rendered.stats);
  html = replaceMarker(html, '<!--PRERENDER:categories-->', rendered.categories);
  // 按需求找优惠的入口行（v1.2）：静态 <a>，无 JS 可点。放在筛选条之后、
  // 正文之前 —— 它回答「我要什么」，筛选条回答「我要怎么缩」，后者是它的下游。
  html = replaceMarker(html, '<!--PRERENDER:needs-->', renderNeedRow(payload.deals));
  // 变化雷达条带（v1.5）：同样一行静态导航，紧跟按需求入口行。它与 /changes/ 页
  // 共用 RENDER-CORE 的渲染函数，读的是上面算好的同一份 radar。
  html = replaceMarker(html, '<!--PRERENDER:changes-->', renderCore.changesStripHtml(radar));
  // 订阅发现（v1.6）：首页 <head> 只暴露四个订阅选择（全部优惠 / 最近变化 / 学生 / 开发者），
  // 每个两种格式 = 8 条 rel="alternate"。**由注册表生成**，不在 index.html 里抄一份清单 ——
  // 抄一份的后果是「改了注册表、忘了改 HTML」，而那种漂移没有任何东西会红。
  html = replaceMarker(html, '<!--PRERENDER:feeds-->', feeds.feedLinkTags(
    feedBundle.feeds.filter(feed => feed.spec.homepage), ''));
  console.log(`  筛选条 / 汇总 / 分类选项 / 按需求入口 / 变化雷达 / 订阅发现: 已填充`);

  // 站点绝对地址：源码里不硬编码第二份 URL
  const urlSlots = html.split('__SITE_URL__').length - 1;
  html = html.split('__SITE_URL__').join(SITE_URL);
  console.log(`  站点地址替换: ${urlSlots} 处`);

  // FAQ 结构化数据：以页面可见文案为唯一来源
  const faqItems = extractFaq(html);
  console.log(`  FAQ 解析: ${faqItems.length} 条`);

  const jsonLd = buildJsonLd(faqItems, rendered.cards);
  html = replaceMarker(html, '<!--PRERENDER:jsonld-->', jsonLd);
  console.log(`  JSON-LD: ${(jsonLd.match(/application\/ld\+json/g) || []).length} 段`);

  // v1.7：页脚那一行的厂商入口（前 5 家 + 「全部 N 家」）。由落地页计划生成，
  // 源码里不留第二份厂商清单 —— 抄一份的后果是「改了注册表、忘了改 HTML」，
  // 而那种漂移不会有任何东西变红。这一份会被各深度的写出函数从同一段页脚里继承，
  // 所以 9 家厂商页在**每一种**页面上都有入链。
  html = replaceMarker(html, '<!--PRERENDER:vendorline-->', renderVendorLine(PLAN));

  // 标记必须全部消失——残留意味着某个替换静默失败了
  for (const marker of PRERENDER_MARKERS) {
    if (html.includes(marker)) throw new Error(`预渲染标记未被替换: ${marker}`);
  }

  // 页脚的「数据源状态」链接：站内相对路径在不同深度下不一样
  // （首页 `status/`、详情页 `../../status/`、状态页自己 `../status/`），
  // 所以源码里只有一处占位符，各自在写出前替换。这里先只处理**首页那一份**，
  // 详情页与状态页的替换在各自的写出函数里做（它们拿到的是同一份含占位符的 html）。
  fs.writeFileSync(indexFile, finalizePage(html, '', '', 'index.html'), 'utf8');

  // OG 分享图。
  // 画完立刻自检（og-image.selfCheck）：点阵字模没有自动换行，排版一变文字就会被静默裁掉，
  // 而只查 PNG 头部与尺寸是看不出来的。自检失败直接抛出 → 组装中止、构建非 0 退出、
  // deploy.yml 不会发布。自检必须留在构建路径上——早先它只在 og-image.js 的 main() 里跑
  // （require.main === module 守卫），构建走的是 require，于是这一段从未被执行过。
  // 这里写的是暂存目录，所以这一抛不会碰到上一份 FINAL_OUT。（和下面 selfCheck() 的
  // 「返回 false」失败路径一样，两者都在替换输出目录之前。）
  const og = renderOgImage();
  fs.writeFileSync(path.join(OUT, 'og-image.png'), og);
  const ogStats = selfCheckOgImage(og);
  console.log(`  OG 分享图: ${(og.length / 1024).toFixed(1)} KB`);
  console.log(`    OG 自检: 标记 ${ogStats.white}px · 副标题 ${ogStats.pale}px · 底部说明 ${ogStats.faint}px`);

  // Feed 图标：RSS <image> 与 JSON Feed 的 icon 都要一张 ≤144px 的点阵方图，
  // OG 图（1200×630）不合规，所以现场画一张。同样走「画完立刻自检」。
  const icon = renderIcon();
  fs.writeFileSync(path.join(OUT, 'icon.png'), icon);
  const iconStats = selfCheckIcon(icon);
  console.log(`  Feed 图标: icon.png 144×144（${(icon.length / 1024).toFixed(1)} KB · 白块 ${iconStats.white}px）`);

  // 独立详情页（每条优惠一个静态 URL）+ sitemap
  const lastmod = String(payload.updatedAt || '').slice(0, 10);
  const detailPages = writeDetailPages(payload, html, renderCore, PLAN);
  console.log(`  详情页: ${detailPages.length} 个 → deal/<id>/index.html`);

  // 落地页（v1.7）：清单与条目归属都来自 `landing.planLandingPages()` 那一份计划，
  // 这里只负责按计划写文件、并把「写了什么」原样记下来交给产物自检回读对账。
  //
  // 为什么条目不再在这里筛：判据曾经只写一遍（audience.js），但 v1.7 一次加了
  // 分类页/厂商页/枢纽页/别名页四类，「每类各筛一次」就是四份判据。现在
  // `landing.itemsOf()` 是唯一入口 —— 页面行数、ItemList、摘要数字、变化过滤
  // 与 Feed 都从它拿同一批 id。
  const directoryPages = [];
  const pageDescriptors = []; // 交给 seo.validate() 的页面描述符（含 html 与条目 id）
  for (const spec of DIRECTORY_PAGES) {
    const matched = landing.itemsOf(spec, payload.deals, { vendorKeyOf: VENDOR_KEY_OF });
    const summary = spec.kind === 'hub' ? [] : landing.summaryOf(spec, matched, {
      asOf: lastmod, vendorKeyOf: VENDOR_KEY_OF
    });
    const topic = spec.kind === 'hub' || spec.kind === 'alias'
      ? null
      : landing.topicChangesOf(radar, matched.map(deal => deal.id), { sectionOrder: changes.SECTION_ORDER });
    if (topic) topic.title = `「${spec.title || spec.label}」最近的变化`;
    const pageFeeds = feeds.feedsForPage(spec, feedBundle.feeds);
    const page = renderDirectoryPage(spec, matched, html, {
      lastmod, summary, topic, plan: PLAN, feedsForPage: pageFeeds, allFeeds: feedBundle.feeds, renderCore,
      // v3.0 Stage E：厂商页的六个资料区块（官方入口 / 优惠 / Coding 套餐 / API 计费 /
      // 模型 / 最近变化 / 订阅）。只有 vendor 进入这个分支；其余 kind 返回空 bundle，
      // 因此非厂商页的输出一个字节都没变（`check-reproducible` 会替我们盯着这件事）。
      extraSections: spec.kind === 'vendor'
        ? (vendorSpec => vendorPage.renderVendorKnowledgeBundle(vendorSpec, {
          deals: matched,
          plans: plansStore.plans,
          apiPlans: apiPlansStore.plans,
          models: publishedModels.models,
          modelLinks: modelLinksDoc.links,
          planHistoryStore,
          apiPlanHistoryStore,
          providerTable,
          feeds: pageFeeds,
          prefix: '../'.repeat(vendorSpec.depth || spec.depth || 1)
        }))
        : null
    });
    // 枢纽页列的是子页面，不是条目 —— 它的「条数」就是子页数（正文下限与摘要口径都读它）
    const pageCount = spec.kind === 'hub' ? (spec.children || []).length : matched.length;
    const dir = path.join(OUT, spec.route);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), page, 'utf8');
    directoryPages.push({
      kind: spec.kind, slug: spec.slug, key: spec.key, title: spec.title || spec.label,
      count: pageCount, url: `${SITE_URL}${spec.route}`, route: spec.route,
      indexable: spec.indexable, aliasOf: spec.aliasOf || null, pinned: Boolean(spec.pinned),
      itemIds: matched.map(deal => deal.id),
      childRoutes: spec.kind === 'hub' ? (spec.children || []).map(child => child.route) : [],
      summary, feedIds: pageFeeds.map(feed => feed.spec.id),
      // 「本页应该有哪份 Feed」取自**实际存在的那一份**（feedBundle），不按类型推断：
      // 钉住但跌破门槛的厂商页会照常生成，而它的 Feed 不会（Feed 门槛是另一道），
      // 按类型推断就会要求页面声明一份不存在的订阅源 —— 一条永远红的假警报。
      feedMatch: pageFeeds.map(feed => feed.spec.id),
      // v3.0 Stage E：把门槛判据带下去 —— `seo.js` 的 `gate-threshold` 要用**同一条 OR**
      // （条数 / 历史事件 / 至少一种非优惠资料）判厂商页，否则「靠非优惠资料达标」的
      // 那几家会被判红（它们本来就是我们决定要生成的页面）。
      eventCount: spec.eventCount || 0,
      nonDealMaterial: Boolean(spec.nonDealMaterial),
      html: page
    });
    pageDescriptors.push(directoryPages[directoryPages.length - 1]);
  }
  const collectionPages = directoryPages.filter(page => page.kind === 'collection');
  // 「按需求页」的口径包含降级为别名的那三条：首页入口行会列出全部 10 条，
  // 两边的集合必须继续逐个对得上（v1.2 的断言就是这么用的）。
  const needPages = directoryPages.filter(page => page.kind === 'need' || page.kind === 'alias');
  const vendorPages = directoryPages.filter(page => page.kind === 'vendor');
  const categoryPages = directoryPages.filter(page => page.kind === 'category');
  const hubPages = directoryPages.filter(page => page.kind === 'hub');
  const aliasPages = directoryPages.filter(page => page.kind === 'alias');
  console.log(`  分类页: ${collectionPages.map(p => `/${p.slug}/ ${p.count} 条`).join(' · ')}`);
  console.log(`  按需求页: ${needPages.map(p => `/${p.route} ${p.count} 条${p.aliasOf ? ' [别名]' : ''}`).join(' · ')}`);
  console.log(`  分类落地页: ${categoryPages.map(p => `/${p.route} ${p.count} 条`).join(' · ') || '（无）'}`);
  console.log(`  厂商落地页: ${vendorPages.map(p => `/${p.route} ${p.count} 条`).join(' · ') || '（无）'}`);
  console.log(`  枢纽页: ${hubPages.map(p => `/${p.route} ${p.count} 个入口`).join(' · ') || '（无）'}` +
    ` · 别名页: ${aliasPages.length} 条（noindex，不进 sitemap）`);

  // 变化雷达页（/changes/，v1.5）：与首页条带同一份 radar、同一套渲染函数。
  //
  // 它**始终生成**（与「条数为 0 的按需求页不生成」不同）：这一页的价值恰恰在于
  // 「今天有没有变化」这个问题本身，而「没有变化」与「我们没查」是两种必须能读到的答案。
  // 日志不可用时也照常出页 —— 路由凭空消失比一页说明更糟。
  //
  // v2.3：这一页同时列出**套餐变化**（同一份 planRadar），顶部多一行锚点导航。
  const changesDir = path.join(OUT, 'changes');
  fs.mkdirSync(changesDir, { recursive: true });
  fs.writeFileSync(path.join(changesDir, 'index.html'), renderChangesPage(radar, html, renderCore, {
    // 这一页订阅「变化」本身：声明变化 Feed 而不是全量 Feed（v1.5 报告 §九-5 的遗留项）。
    // v2.3：这一页同时列出**套餐变化**，所以那一份订阅也在这里声明（两者是两条独立的变化流）。
    changeFeedTags: feeds.feedLinkTags(
      feedBundle.feeds.filter(feed => (feed.spec.kind === 'changes' && feed.spec.id === 'changes')
        || feed.spec.kind === 'plan-changes'), '../'),
    planChanges: planRadar,
    // v3.0 Stage H：第三条变化流（API 价格变化）也落在这一页上。
    apiPlanChanges: apiPlanRadar,
    planHistoryStore,
    // 套餐变化那句话里的**币种与额度单位**从套餐记录里取（`planChangeTextOf` 的
    // `plansById`）。少了它，`/changes/` 会写出「正常价格 79 → 59」，而 `/plans/coding/`
    // 上同一件事写的是「正常价格 ¥79 → ¥59」—— 同一件事两种说法。
    // 产物自检一直按「带 plansById」的那一句对账，只是生产上套餐变化恒为空，从未对上过。
    plansById: new Map(plansStore.plans.map(plan => [plan.id, plan])),
    providerTable
  }), 'utf8');
  console.log(`  变化雷达页: /changes/（基准日 ${radar.asOf || '未知'} · 高价值 ${changes.SECTION_ORDER
    .reduce((sum, key) => sum + (Number(radar.totals[key]) || 0), 0)} 条 · 其他 ${radar.totals.other} 条` +
    ` · 套餐变化 ${planRadarStats.totals.changed + planRadarStats.totals.created + planRadarStats.totals.ended + planRadarStats.totals.restored} 条` +
    ` · API 价格变化 ${apiPlanRadarStats.totals.changed + apiPlanRadarStats.totals.created + apiPlanRadarStats.totals.ended + apiPlanRadarStats.totals.restored} 条）`);

  const plansDir = path.join(OUT, 'plans', 'coding');
  fs.mkdirSync(plansDir, { recursive: true });

  const plansHtml = renderPlansPage(plansStore, html, {
    providerTable,
    planChanges: planRadar,
    planHistoryStore,
    allFeeds: feedBundle.feeds,
    dealLinks: dealLinksView
  });
  fs.writeFileSync(path.join(plansDir, 'index.html'), plansHtml, 'utf8');
  {
    const pageProblems = plansPage.assertPageHonesty(plansHtml, plansStore.plans, {
      providerTable, planChanges: planRadar, planHistoryStore, dealLinks: dealLinksView, prefix: '../../'
    });
    if (pageProblems.length) {
      throw new Error(`套餐对比页的诚实性断言未通过（${pageProblems.length} 处）：\n  - ${pageProblems.slice(0, 5).join('\n  - ')}`);
    }
  }
  {
    const historyProblems = planHistoryStore
      ? plansPage.assertHistoryHonesty(plansStore.plans, planHistoryStore)
      : [];
    if (historyProblems.length) {
      throw new Error(`套餐变化数据里出现结论性词汇（${historyProblems.length} 处）：\n  - ${historyProblems.slice(0, 5).join('\n  - ')}`);
    }
  }
  const plansComputable = plansStore.plans
    .filter(plan => planSchema.deriveMetrics(plan)).length;
  console.log(`  套餐对比页: /plans/coding/（${plansStore.count} 条 · ${new Set(plansStore.plans.map(p => p.provider)).size} 个平台` +
    ` · 名义 Token 单价可计算 ${plansComputable} 条 · 页面 ${(plansHtml.length / 1024).toFixed(1)} KB）`);
  console.log(`  套餐变化: ${planHistoryAvailability === 'ok' ? '可用' : '不可用（无变化日志）'} · 基准日 ${planRadar.asOf || '未知'}` +
    ` · 今日新增 ${planRadarStats.totals.created} · 最近 ${planRadarStats.totals.changed} · 不再收录 ${planRadarStats.totals.ended}` +
    ` · 重新出现 ${planRadarStats.totals.restored} · 元信息（不上块 / 不进订阅）${planRadarStats.totals.meta} · 最近变化块 ${planRadarStats.homeCount} 项`);

  // ---- v2.5：API / Token 计费对比页 ----------------------------------------------------
  const apiPlansDir = path.join(OUT, 'plans', 'api');
  fs.mkdirSync(apiPlansDir, { recursive: true });
  const apiPlansHtml = renderApiPlansPage(apiPlansStore, html, {
    providerTable,
    apiPlanHistoryStore,
    dealLinks: dealLinksView,
    // v3.0 Stage H4：这一页要在 <head> 里声明自己那份订阅源 —— 从注册表取，不写死 id。
    allFeeds: feedBundle.feeds
  });
  fs.writeFileSync(path.join(apiPlansDir, 'index.html'), apiPlansHtml, 'utf8');
  {
    const pageProblems = apiPlansPage.assertPageHonesty(apiPlansHtml, apiPlansStore.plans, { providerTable });
    if (pageProblems.length) {
      throw new Error(`API 计费对比页的诚实性断言未通过（${pageProblems.length} 处）：\n  - ${pageProblems.slice(0, 5).join('\n  - ')}`);
    }
  }
  console.log(`  API 计费页: /plans/api/（${apiPlansStore.count} 条记录 · ${apiPlansPage.apiRowsOf(apiPlansStore.plans).length} 行` +
    ` · 页面 ${(apiPlansHtml.length / 1024).toFixed(1)} KB）`);

  // ---- v3.0 Stage B：/plans/ 统一资料入口 ------------------------------------------------
  //
  // 定位是**资料入口**，不是第三张重复大表：Coding 块与 API 块只给计数、口径与入口，
  // 变化块复用上面已经算好的 `planRadar` 与 API 变化日志（同一份事件、同一套措辞），
  // 当前相关优惠复用 `dealLinksView`（显式关系、已结束的拿不到 current）。
  //
  // 它**始终生成**：路由消失比一页说明更糟（与 /plans/coding/ /plans/api/ 同一条纪律）。
  const plansHubHtml = renderPlansHubShell(html, {
    plans: plansStore.plans,
    apiPlans: apiPlansStore.plans,
    providerTable,
    planHistoryStore,
    apiPlanHistoryStore,
    dealLinks: dealLinksLoad.doc,
    deals: payload.deals,
    asOf: dealLinksAsOf,
    // v3.0 Stage G 落地之后，资料入口才给出「数据文档」链接（此前是刻意不给的死链）。
    dataDocs: true
  });
  fs.writeFileSync(path.join(OUT, plansHubPage.PLANS_HUB_ROUTE, 'index.html'), plansHubHtml, 'utf8');
  {
    const pageProblems = plansHubPage.assertPageHonesty(plansHubHtml, {
      plans: plansStore.plans,
      apiPlans: apiPlansStore.plans,
      providerTable,
      planHistoryStore,
      apiPlanHistoryStore,
      dealLinks: dealLinksLoad.doc,
      deals: payload.deals,
      asOf: dealLinksAsOf,
      prefix: '../',
      siteUrl: SITE_URL
    });
    if (pageProblems.length) {
      throw new Error(`套餐资料入口页的诚实性断言未通过（${pageProblems.length} 处）：\n  - ${pageProblems.slice(0, 5).join('\n  - ')}`);
    }
  }
  console.log(`  套餐资料入口: /plans/（Coding ${plansStore.count} 条 · API ${apiPlansStore.count} 条记录 / ` +
    `${apiPlansPage.apiRowsOf(apiPlansStore.plans).length} 个模型计价条目 · 当前关联优惠 ${dealLinksView.counts.current} 条` +
    ` · 页面 ${(plansHubHtml.length / 1024).toFixed(1)} KB）`);

  // ---- v3.0 Stage D5/D6：/models/ 索引 + /models/<slug>/ 详情 --------------------------
  //
  // 生成门槛（题面 §4）：**存在真实 registry entry 且至少被一个当前或历史实体引用**。
  // 未过门槛的**不生成**（进覆盖报告），也不进 sitemap —— 这就是 §8 第 19 条牙的页面侧。
  // 索引页**无条件生成**（路由消失比一页说明更糟）。
  const vendorHrefOf = developer => vendorHrefFor(developer, providerTable, DIRECTORY_PAGES);
  const modelsCtx = {
    links: modelLinksDoc,
    apiPlans: apiPlansStore.plans,
    plans: plansStore.plans,
    deals: payload.deals,
    dealLinks: dealLinksLoad.doc,
    apiPlanHistoryStore,
    providerTable,
    asOf: dealLinksAsOf,
    siteUrl: SITE_URL,
    vendorHrefOf
  };
  const modelGates = modelsPage.modelsOf(modelsTable).map(model => modelsPage.modelPageGate(model, modelsCtx));
  const modelRecords = modelsPage.modelsOf(publishedModels);
  const modelRecordBySlug = new Map(modelRecords.map(model => [model.slug, model]));
  const gatedModels = modelGates.filter(gate => gate.shouldGenerate).map(gate => modelRecordBySlug.get(gate.slug)).filter(Boolean);
  const skippedModels = modelGates.filter(gate => !gate.shouldGenerate);
  {
    if (skippedModels.length) {
      console.warn(`    ⚠️  ${skippedModels.length} 个模型未过生成门槛（不生成详情页、不进 sitemap）：` +
        skippedModels.slice(0, 6).map(gate => `${gate.slug}（${gate.reasons.join('；')}）`).join('、') +
        `${skippedModels.length > 6 ? ` 等 ${skippedModels.length} 个` : ''}`);
    }
    const coverageStats = modelRegistry.coverageOf({
      table: modelsTable, links: modelLinksDoc, gaps: modelsGapsLoad.doc, apiPlans: apiPlansStore.plans, plans: plansStore.plans
    });
    if (coverageStats.unmappedModelKeys.length) {
      console.log(`    · 未映射的 API modelKey ${coverageStats.unmappedModelKeys.length} 条（记在覆盖报告里，不生成页面）`);
    }
  }
  fs.mkdirSync(path.join(OUT, 'models'), { recursive: true });
  {
    const modelsIndexCtx = { ...modelsCtx, prefix: '../', __refCache: new Map() };
    // ⚠️ 传的是**派生产物**（`publishedModels.models`，带 `catalogStatus` / `catalogReason`），
    // 不是来源层 `modelsTable`：目录状态是派生字段，来源层里根本没有它 —— 传错的那一版
    // 会让索引页每一行都渲染成「发布时间未知」且丢掉 `data-catalog-status`
    // （筛选脚本与浏览器验收都读这个属性），而详情页拿的是派生记录 ⇒ 两页自相矛盾。
    const indexBody = modelsPage.renderModelsIndex(modelRecords, modelsIndexCtx);
    const indexHtml = renderModelsShell({
      route: modelsPage.MODELS_INDEX_ROUTE,
      title: modelsPage.MODELS_INDEX_HEADING,
      description: modelsPage.MODELS_INDEX_DESCRIPTION,
      body: indexBody,
      jsonLd: modelsPage.modelsIndexJsonLd(modelsTable, modelsIndexCtx),
      prefix: '../'
    }, html);
    fs.writeFileSync(path.join(OUT, modelsPage.MODELS_INDEX_ROUTE, 'index.html'), indexHtml, 'utf8');
    const indexProblems = modelsPage.assertPageHonesty(indexHtml, {
      // 断言必须与**页面**读同一份数据：索引页是用派生记录（`modelRecords`）渲染的，
      // 这里若传来源层 `modelsTable`（没有 catalogStatus），断言会以为每行都该是
      // 「发布时间未知」而把正确的页面判红 —— 判据与产物必须同源，否则这条牙只会误伤。
      kind: 'models-index', registry: modelRecords, ctx: { ...modelsIndexCtx, siteUrl: SITE_URL }
    });
    if (indexProblems.length) {
      throw new Error(`模型索引页的诚实性断言未通过（${indexProblems.length} 处）：\n  - ${indexProblems.slice(0, 5).join('\n  - ')}`);
    }
    console.log(`  模型资料索引: /models/（${modelGates.length} 个模型 · ${gatedModels.length} 个详情页` +
      ` · ${new Set(modelsPage.modelsOf(modelsTable).map(model => model.developer)).size} 个开发者` +
      ` · 页面 ${(indexHtml.length / 1024).toFixed(1)} KB）`);
  }
  {
    let written = 0;
    for (const model of gatedModels) {
      const prefix = '../../';
      const detailCtx = { ...modelsCtx, prefix, __refCache: new Map() };
      const route = modelsPage.modelHrefOf(model);
      fs.mkdirSync(path.join(OUT, modelsPage.MODEL_ROUTE_PREFIX, model.slug), { recursive: true });
      const detailHtml = renderModelsShell({
        route,
        title: `${modelsPage.modelNameOf(model)} · 模型资料`,
        description: `${modelsPage.modelNameOf(model)}（${model.developer || '开发者未标注'}）在本站收录的 API 计价条目、相关套餐、相关优惠与变化记录。本站只整理事实，不做推荐。`,
        body: modelsPage.renderModelPage(model, detailCtx),
        jsonLd: modelsPage.modelPageJsonLd(model, detailCtx),
        prefix,
        // 叶子详情页要的是**统一内容列**（与 /deal/<id>/ 同一条 .detail-main 规则）。
        // 索引页 / 档案页 / 数据文档页都不传它，继续吃 .wrap 的 1420px。
        mainClass: 'detail-main'
      }, html);
      fs.writeFileSync(path.join(OUT, route, 'index.html'), detailHtml, 'utf8');
      const problems = modelsPage.assertPageHonesty(detailHtml, {
        kind: 'model', model, ctx: { ...detailCtx, siteUrl: SITE_URL }
      });
      if (problems.length) {
        throw new Error(`模型详情页 /${route} 的诚实性断言未通过（${problems.length} 处）：\n  - ${problems.slice(0, 5).join('\n  - ')}`);
      }
      written++;
    }
    console.log(`  模型详情页: ${written} 个（每个都在门槛内：有 registry entry 且至少被一个当前或历史实体引用）`);
  }

  // ---- v3.0 Stage F：历史档案（/archive/ + 有条件详情页）--------------------------------
  //
  // **归档层不落新真值文件**：三组档案全部由既有日志的 baseline + events + absence
  // （以及 `ended` 事件上的墓碑 `label`）重建 —— `lib/archive.js` 的 `buildArchive()` 是纯函数，
  // 不读盘、不看时钟。这里只做三件事：读三份日志（已有变量）、调 `buildArchive()`、写页面。
  //
  // 交付日实测：三份日志的 ended/restored 事件都是 **0 条**（deal 0 事件、plan/api 只有 created），
  // 因此 `/archive/` **必然 0 条记录** —— 索引页仍无条件生成，三组各写一句"为什么是空的"
  // （含事件类型分解）。ended/restored 分支由 `selftest:archive` 的合成夹具驱动。
  // **绝不为了填满这一页而补造事件。**
  const archiveAsOf = dealLinksAsOf || lastmod;
  const archives = [
    { kind: 'deal', store: historyStore.store, records: payload.deals },
    { kind: 'plan', store: planHistoryStore, records: plansStore.plans },
    { kind: 'api', store: apiPlanHistoryStore, records: apiPlansStore.plans }
  ].map(({ kind, store, records }) => archiveLib.buildArchive({
    kind,
    baseline: store ? store.baseline : null,
    events: (store && Array.isArray(store.events)) ? store.events : [],
    absence: (store && store.absence) || {},
    anomalies: (store && store.anomalies) || [],
    records,
    startedAt: (store && store.startedAt) || null,
    asOf: archiveAsOf
  }));
  const archiveEntries = archives.flatMap(archive => archive.entries);
  const archiveGates = archiveEntries.map(entry => archiveLib.archiveDetailGate(entry));
  const gatedArchiveEntries = archiveEntries.filter((entry, index) => archiveGates[index].ok);
  {
    const integrity = archives.flatMap(archive => archiveLib.assertArchiveIntegrity(archive));
    if (integrity.length) {
      throw new Error(`归档层完整性断言未通过（${integrity.length} 处）：\n  - ${integrity.slice(0, 5).join('\n  - ')}`);
    }
    const skippedDetails = archiveGates.filter(gate => !gate.ok);
    console.log(`  历史档案: ${archives.map(archive => `${archive.kindLabel} ${archive.entries.length} 条`).join(' · ')}` +
      ` · 详情页门槛通过 ${gatedArchiveEntries.length} 个` +
      `${skippedDetails.length ? ` · 留在索引页但不建独立页 ${skippedDetails.length} 个` : ''}` +
      ` · 基准日 ${archiveAsOf || '未知'}`);
  }
  {
    const archiveDir = path.join(OUT, 'archive');
    fs.mkdirSync(archiveDir, { recursive: true });
    const indexBody = archiveLib.renderArchiveIndex(archives, { prefix: '../', siteUrl: SITE_URL });
    const indexHtml = renderModelsShell({
      // 通用静态页套壳（模型页与档案页共用：head / 主题脚本 / 页头 / 页脚 / JSON-LD）
      route: archiveLib.ARCHIVE_INDEX_ROUTE,
      title: archiveLib.ARCHIVE_HEADING,
      description: archiveLib.ARCHIVE_DESCRIPTION,
      body: indexBody,
      jsonLd: archiveLib.archiveIndexJsonLd(archives, { siteUrl: SITE_URL }),
      prefix: '../',
      extraCss: ARCHIVE_PAGE_CSS
    }, html);
    fs.writeFileSync(path.join(archiveDir, 'index.html'), indexHtml, 'utf8');
    const problems = archiveLib.assertPageHonesty(indexHtml, { kind: 'archive-index', archives });
    if (problems.length) {
      throw new Error(`历史档案索引页的诚实性断言未通过（${problems.length} 处）：\n  - ${problems.slice(0, 5).join('\n  - ')}`);
    }
    for (const entry of gatedArchiveEntries) {
      const route = archiveLib.archiveEntryRoute(entry);
      // ⚠️ 相对前缀由 `lib/archive.js` 的 `archiveEntryPrefix()` **按路由深度**派生
      // （唯一实现；这里不再有第二条深度算式）：`archive/<kind>/<id>/` 是 3 层，
      // 原先写死 `'../../'`（2 层）——favicon / feed / 面包屑 / 全站导航全部解析到
      // `archive/…` 而不是站点根，而生产一条 ended/restored 都没有，因此从未被构建照到
      // （审计 F-r1-history-ai-002：每页 27 条相对引用里 24 条死链）。
      const prefix = archiveLib.archiveEntryPrefix(entry);
      fs.mkdirSync(path.join(OUT, route), { recursive: true });
      const entryHtml = renderModelsShell({
        route,
        title: `${entry.title || entry.id} · ${archiveLib.ARCHIVE_HEADING}`,
        description: `${entry.title || entry.id} 的结束 / 恢复记录：首次发现、最后有效时间、结束发现时间、最后已知内容与变化时间线。资料失效不等于资料删除。`,
        body: archiveLib.renderArchiveEntry(entry, { prefix, siteUrl: SITE_URL }),
        jsonLd: archiveLib.archiveEntryJsonLd(entry, { siteUrl: SITE_URL }),
        prefix,
        extraCss: ARCHIVE_PAGE_CSS
      }, html);
      fs.writeFileSync(path.join(OUT, route, 'index.html'), entryHtml, 'utf8');
      const entryProblems = archiveLib.assertPageHonesty(entryHtml, { kind: 'archive-entry', entry });
      if (entryProblems.length) {
        throw new Error(`档案详情页 /${route} 的诚实性断言未通过（${entryProblems.length} 处）：\n  - ${entryProblems.slice(0, 5).join('\n  - ')}`);
      }
    }
    console.log(`  历史档案页: /archive/（${archiveEntries.length} 条记录 · ${gatedArchiveEntries.length} 个详情页` +
      ` · 页面 ${(indexHtml.length / 1024).toFixed(1)} KB）`);
  }

  // ---- v3.0 Stage G：Data Docs / 数据出口（/docs/data/ + /data/index.json）---------------
  //
  // 数据出口有三条硬承诺，全部可核对：
  //   ① 文档里写出的**每个 endpoint 都必须真实存在**（构建期查产物目录，独立门禁另查 dist）；
  //   ② 每个 schemaVersion / count / **updatedAt** 必须与磁盘逐字段一致；
  //   ③ Manifest 条数 == 真实发布的数据集数。
  // Manifest（`data/index.json`）**只描述数据集**（URL / 版本 / 更新时间 / 记录数 / 用途），
  // 不复制任何数据 —— 它是"数据出口的门牌"，不是第四份数据。
  //
  // 时间形状显式区分（题面点名）：`deals.json` 的 updatedAt 是**真实时刻**，
  // plans / api-plans / models / links 是**日期规范化**（当天零点），变化日志是**纯日期**。
  // v3.0 P2-25（`F-v3-export-001`）：公开数据集的**唯一注册表**是 `lib/data-docs.js` 的
  // `PUBLIC_DATASETS`。这里只交出**运行期取值**（schemaVersion / updatedAt / count）——
  // 名称、类别、发布地址、countNote 全在注册表里；Manifest、构建拷贝、`/docs/data/`
  // 与产物扫描都从那一份派生。新增一份公开数据集 = 注册表加一行 + 这里给出它的取值；
  // 只加了一边（注册表有、取值没有）会在这里硬失败，而不是悄悄少一份。
  const datasetRegistryProblems = dataDocs.assertDatasetRegistryShape();
  if (datasetRegistryProblems.length) {
    throw new Error(`公开数据集注册表（PUBLIC_DATASETS）不合法（${datasetRegistryProblems.length} 处）：\n  - ` +
      `${datasetRegistryProblems.slice(0, 5).join('\n  - ')}`);
  }
  const { manifest: dataManifest, missingValues: missingDatasetValues } = dataDocs.buildManifestFromRegistry({
    deals: {
      schemaVersion: payload.schemaVersion, updatedAt: payload.updatedAt,
      count: typeof payload.count === 'number' ? payload.count : (payload.deals || []).length
    },
    plans: {
      schemaVersion: plansStore.schemaVersion, updatedAt: plansStore.updatedAt, count: plansStore.count
    },
    'api-plans': {
      schemaVersion: apiPlansStore.schemaVersion, updatedAt: apiPlansStore.updatedAt, count: apiPlansStore.count
    },
    models: {
      schemaVersion: publishedModels.schemaVersion, updatedAt: publishedModels.updatedAt, count: publishedModels.count
    },
    'model-registry-links': {
      schemaVersion: publishedModelLinksModelDoc.schemaVersion,
      updatedAt: publishedModelLinksModelDoc.updatedAt,
      count: publishedModelLinksModelDoc.count
    },
    'deal-plan-links': {
      schemaVersion: dealLinksLoad.doc.schemaVersion,
      updatedAt: dealPlanLinks.canonicalUpdatedAt(dealLinksLoad.doc),
      count: (dealLinksLoad.doc.links || []).length
    },
    'deal-history': {
      schemaVersion: historyStore.store.schemaVersion, updatedAt: historyStore.store.startedAt,
      count: (historyStore.store.events || []).length
    },
    'plan-history': {
      schemaVersion: planHistoryStore.schemaVersion, updatedAt: planHistoryStore.startedAt,
      count: (planHistoryStore.events || []).length
    },
    'api-plan-history': {
      schemaVersion: apiPlanHistoryStore.schemaVersion, updatedAt: apiPlanHistoryStore.startedAt,
      count: (apiPlanHistoryStore.events || []).length
    }
  });
  if (missingDatasetValues.length) {
    throw new Error(`PUBLIC_DATASETS 登记了这些公开数据集，但本次构建没有交出它们的取值：` +
      `${missingDatasetValues.join('、')}（在 build-local.js 的 buildManifestFromRegistry() 调用里补上 ` +
      `schemaVersion / updatedAt / count）`);
  }
  {
    const dir = path.join(OUT, 'data');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.json'), `${JSON.stringify(dataManifest, null, 2)}\n`, 'utf8');
    const shapeProblems = dataDocs.assertManifestShape(dataManifest);
    if (shapeProblems.length) {
      throw new Error(`Dataset Manifest 形状不合法（${shapeProblems.length} 处）：\n  - ${shapeProblems.slice(0, 5).join('\n  - ')}`);
    }
  }
  const dataLicense = ['LICENSE', 'LICENSE.md', 'COPYING'].find(file => fs.existsSync(path.join(ROOT, file)));
  const dataDocsCtx = {
    manifest: dataManifest,
    // 许可证状态**从仓库现状读**，不写死：没有就说没有，并列为"需项目所有者决定"。
    license: dataLicense ? { status: 'present', file: dataLicense } : { status: 'absent' },
    siteUrl: SITE_URL,
    prefix: '../../',
    // 三份对账的回调：构建期查的产物目录**就是刚写下的这一份**（独立门禁会另查一遍）。
    endpointExists: url => fs.existsSync(path.join(OUT, url)),
    actualSchemaVersions: Object.fromEntries(dataManifest.datasets.map(dataset => [dataset.id, dataset.schemaVersion])),
    actualCounts: Object.fromEntries(dataManifest.datasets.map(dataset => [dataset.id, dataset.count])),
    actualUpdatedAt: Object.fromEntries(dataManifest.datasets.map(dataset => [dataset.id, dataset.updatedAt]))
  };
  {
    const docsDir = path.join(OUT, 'docs', 'data');
    fs.mkdirSync(docsDir, { recursive: true });
    const body = dataDocs.renderDataDocsPage(dataDocsCtx);
    const docsHtml = renderModelsShell({
      route: dataDocs.DATA_DOCS_ROUTE,
      title: dataDocs.DATA_DOCS_HEADING,
      description: dataDocs.DATA_DOCS_DESCRIPTION,
      body,
      jsonLd: dataDocs.dataDocsJsonLd(dataDocsCtx),
      prefix: '../../',
      extraCss: DATA_DOCS_PAGE_CSS
    }, html);
    fs.writeFileSync(path.join(docsDir, 'index.html'), docsHtml, 'utf8');
    const problems = dataDocs.assertPageHonesty(docsHtml, dataDocsCtx);
    if (problems.length) {
      throw new Error(`数据文档页的诚实性断言未通过（${problems.length} 处）：\n  - ${problems.slice(0, 5).join('\n  - ')}`);
    }
    console.log(`  数据出口: /docs/data/（${dataManifest.count} 份数据集 · Manifest /data/index.json` +
      ` · 时间形状 真实时刻 ${dataManifest.datasets.filter(d => d.updatedAtShape === 'timestamp').length} /` +
      ` 日期规范化 ${dataManifest.datasets.filter(d => d.updatedAtShape === 'date-normalized').length} /` +
      ` 纯日期 ${dataManifest.datasets.filter(d => d.updatedAtShape === 'date').length}` +
      ` · License ${dataLicense || '未定（需项目所有者决定）'}）`);
  }

  const dealUrls = detailPages.map(page => `  <url>
    <loc>${page.url}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`).join('\n');

  // 落地页进 sitemap，优先级高于详情页：它们是入口，详情页是叶子。
  // v1.2 起分类页与按需求页共用这一段（同一个 directoryPages 列表），
  // 所以「新增一条路由忘了进 sitemap」在结构上不可能 —— 条数断言还会逐个对账。
  //
  // v1.7 起：**只有可索引的页面进 sitemap**（别名页是 noindex，进 sitemap 等于自相矛盾），
  // 优先级按类型声明，而不是统统 0.9 —— 声明要与实际用途一致（这条口径与状态页 0.3、
  // 订阅中心 0.6 是同一条）。
  // v3.0：优先级不再手写第二张表 —— 它就是 `lib/page-kinds.js` 里的声明
  // （`sitemap.priority`），构建期与独立门禁读同一份。取值与 v1.7 起的表**逐字相同**
  // （collection/need/category 0.9 · vendor/hub 0.8），所以这次是纯收敛、不是改判据。
  const directoryUrls = directoryPages
    .filter(page => page.indexable)
    .map(page => `  <url>
    <loc>${page.url}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${pageKinds.sitemapMeta(page.kind).changefreq}</changefreq>
    <priority>${pageKinds.sitemapMeta(page.kind).priority}</priority>
  </url>`).join('\n');
  const sitemapEntries = [SITE_URL, ...directoryPages.filter(page => page.indexable).map(page => page.url),
    `${SITE_URL}status/`, `${SITE_URL}changes/`, `${SITE_URL}feeds/`, `${SITE_URL}${plansHubPage.PLANS_HUB_ROUTE}`,
    `${SITE_URL}${plansPage.PLANS_ROUTE}`,
    `${SITE_URL}${apiPlansPage.API_PLANS_ROUTE}`,
    // v3.0 Stage D5/D6：模型索引无条件进 sitemap；详情页**只有过门槛的**才进
    // （未过门槛的不生成页面，进 sitemap 就是一条死链 —— §8 第 19 条牙）。
    `${SITE_URL}${modelsPage.MODELS_INDEX_ROUTE}`,
    ...gatedModels.map(model => `${SITE_URL}${modelsPage.modelHrefOf(model)}`),
    // v3.0 Stage F：档案索引无条件进 sitemap；档案详情页**只有过门槛的实体**才进
    // （历史 event 本身不生成页面 —— §F4）。
    `${SITE_URL}${archiveLib.ARCHIVE_INDEX_ROUTE}`,
    ...gatedArchiveEntries.map(entry => `${SITE_URL}${archiveLib.archiveEntryRoute(entry)}`),
    // v3.0 Stage G：数据文档页进 sitemap（它是数据出口的门牌，不是叶子）。
    // `/data/index.json` 与各数据集是**静态文件**，不进 sitemap（它们不是页面）。
    `${SITE_URL}${dataDocs.DATA_DOCS_ROUTE}`,
    ...detailPages.map(page => page.url)];

  // 状态页也进 sitemap（五条既有约定的第三条，v1.1 收口补）。
  //
  // priority 0.3 **低于**详情页 0.7，也低于分类页 0.9：它是给维护者与技术读者核对
  // 「本站还在不在更新」的工具页，不是搜索入口。给它 0.9 会把「哪一页才是入口」说反 ——
  // priority 是**声明**，不是排序实现的细节。
  const statusUrl = `  <url>
    <loc>${SITE_URL}status/</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.3</priority>
  </url>`;

  // 变化雷达页进 sitemap：priority 0.8 介于目录页 0.9 与详情页 0.7 之间 ——
  // 它是一个入口（回答「今天有什么变了」），但不是分类入口，也不是叶子页面。
  // `changefreq: daily` 是实话：数据每天采集两次，这一页的内容每天都可能变。
  const changesUrl = `  <url>
    <loc>${SITE_URL}changes/</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`;

  // 订阅中心进 sitemap：priority 0.6 **低于**详情页 0.7 —— 它是给「想订阅的人」的
  // 工具页（列出全部 Feed 地址），不是读者找优惠的入口。声明与实际用途必须一致，
  // 这和状态页拿 0.3 是同一条理由。
  const feedsUrl = `  <url>
    <loc>${SITE_URL}feeds/</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>`;

  // v3.0 Stage F：档案索引与厂商枢纽同级（0.8 —— 它是入口，但内容随历史增长），
  // 档案详情是追溯用的叶子（0.6，低于优惠/模型详情 0.7）。值全部取自 page-kinds 的声明。
  const archiveIndexUrl = `  <url>
    <loc>${SITE_URL}${archiveLib.ARCHIVE_INDEX_ROUTE}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${pageKinds.sitemapMeta('archive-index').changefreq}</changefreq>
    <priority>${pageKinds.sitemapMeta('archive-index').priority}</priority>
  </url>`;
  const archiveDetailUrls = gatedArchiveEntries.map(entry => `  <url>
    <loc>${SITE_URL}${archiveLib.archiveEntryRoute(entry)}</loc>
    <lastmod>${String(entry.lastEffectiveAt || lastmod).slice(0, 10)}</lastmod>
    <changefreq>${pageKinds.sitemapMeta('archive-detail').changefreq}</changefreq>
    <priority>${pageKinds.sitemapMeta('archive-detail').priority}</priority>
  </url>`).join('\n');

  // v3.0 Stage G：数据文档页的 sitemap 声明（priority 0.6 —— 它是给"要取数据的人"的入口，
  // 与订阅中心同级；不是读者找优惠的入口）。
  const dataDocsUrl = `  <url>
    <loc>${SITE_URL}${dataDocs.DATA_DOCS_ROUTE}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${pageKinds.sitemapMeta('data-docs').changefreq}</changefreq>
    <priority>${pageKinds.sitemapMeta('data-docs').priority}</priority>
  </url>`;

  // v3.0 Stage B：/plans/ 是所有套餐与计费资料的**入口**，优先级与两个对比页同级（0.9）。
  // 值来自 `lib/page-kinds.js` 的声明（`sitemapMeta('plans-hub')`），不再手写一遍 ——
  // 新增页面家族时"忘了一处 priority"正是这张表要消灭的那类不一致。
  const plansHubUrl = `  <url>
    <loc>${SITE_URL}${plansHubPage.PLANS_HUB_ROUTE}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${pageKinds.sitemapMeta('plans-hub').changefreq}</changefreq>
    <priority>${pageKinds.sitemapMeta('plans-hub').priority}</priority>
  </url>`;

  // v3.0 Stage D5：模型资料索引与两个计费枢纽同级（0.9，都是入口）。
  const modelsIndexUrl = `  <url>
    <loc>${SITE_URL}${modelsPage.MODELS_INDEX_ROUTE}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${pageKinds.sitemapMeta('models-index').changefreq}</changefreq>
    <priority>${pageKinds.sitemapMeta('models-index').priority}</priority>
  </url>`;

  // v3.0 Stage D6：模型详情页与优惠详情页同级（0.7，都是详情叶子）。
  // `lastmod` 用**数据日期**（模型页的最近核对日），不是构建时刻 —— 与全站同一条纪律。
  const modelUrls = gatedModels.map(model => `  <url>
    <loc>${SITE_URL}${modelsPage.modelHrefOf(model)}</loc>
    <lastmod>${String(model.lastSeen || lastmod).slice(0, 10)}</lastmod>
    <changefreq>${pageKinds.sitemapMeta('model').changefreq}</changefreq>
    <priority>${pageKinds.sitemapMeta('model').priority}</priority>
  </url>`).join('\n');

  // 套餐对比页进 sitemap：priority 0.9 —— 它与分类页 / 按需求页同级，**都是入口**，
  // 而不是详情叶子（详情页 0.7）或工具页（状态页 0.3、订阅中心 0.6）。
  // `changefreq: weekly` 是实话：套餐不会每天变（这一点与变化页的 daily 正相反）。
  const plansUrl = `  <url>
    <loc>${SITE_URL}${plansPage.PLANS_ROUTE}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>`;

  // v2.5：API 计费页与套餐对比页**同级**（0.9，都是入口）。`changefreq: weekly` 同样是实话：
  // 官方价格表不会每天改；但它确实比套餐更容易变，所以未来若要做"价格变动"提示，
  // 判据是 `api-plan-history.json` 的事件，而不是把这个频率调到 daily。
  const apiPlansUrl = `  <url>
    <loc>${SITE_URL}${apiPlansPage.API_PLANS_ROUTE}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>`;

  fs.writeFileSync(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE_URL}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
${directoryUrls}
${statusUrl}
${changesUrl}
${feedsUrl}
${plansHubUrl}
${modelsIndexUrl}
${archiveIndexUrl}
${plansUrl}
${apiPlansUrl}
${dealUrls}
${modelUrls}
${archiveDetailUrls}
${dataDocsUrl}
</urlset>
`, 'utf8');

  // 订阅产物（v1.6）：注册表在 lib/feeds.js，这里只负责落盘与日志。
  //
  // 三类语义各自成 Feed（优惠 / 变化 / 厂商），判据**全部引用既有注册表**：
  // 优惠 Feed 用 audience.js 的谓词、变化 Feed 用 radar 的同一份分栏结果。
  // 因此自检能拿「Feed 条目集合」与「页面表格行集合」逐条 id 对账，不需要第二份判据。
  for (const feed of feedBundle.feeds) {
    const file = path.join(OUT, feed.spec.path);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, feed.rss, 'utf8');
    fs.writeFileSync(path.join(OUT, feed.spec.jsonPath), feed.json, 'utf8');
  }
  const feedStats = feeds.summarize(feedBundle.feeds);
  console.log(`  订阅产物: ${feedStats.count} 个 Feed × 2 种格式 = ${feedStats.files} 个文件 · ` +
    `共 ${feedStats.items} 条条目（优惠 ${feedStats.perKind.collection} 个 / 变化 ${feedStats.perKind.changes} 个）` +
    (feedStats.empty.length ? ` · 空 Feed：${feedStats.empty.join('、')}（已显式允许）` : ''));
  if (feedBundle.vendorUnmapped.length) {
    console.warn(`    ⚠️  ${feedBundle.vendorUnmapped.length} 家够门槛的厂商没在 vendor-slugs.json 里登记，` +
      `本轮不生成它们的订阅：${feedBundle.vendorUnmapped.join('、')}`);
  }
  if (feedBundle.vendorSkipped.length) {
    console.warn(`    ⚠️  跳过 ${feedBundle.vendorSkipped.length} 个厂商 Feed（当前有效优惠为 0）：` +
      `${feedBundle.vendorSkipped.map(row => row.vendor).join('、')}`);
  }

  // 订阅中心 /feeds/：把注册表原样摊开给读者，顺带解释「变化订阅为什么现在是空的」。
  {
    const feedsDir = path.join(OUT, 'feeds');
    fs.mkdirSync(feedsDir, { recursive: true });
    fs.writeFileSync(path.join(feedsDir, 'index.html'),
      renderFeedsPage(feedBundle.feeds, html, {
        lastmod,
        asOf: radarAsOf,
        availability: radarAvailability,
        startedAt: historyStats ? historyStats.startedAt : null,
        planAvailability: planHistoryAvailability,
        planStartedAt: planRadar.startedAt,
        // v3.0 Stage H：API 那条有自己的可用性（起算日已由 `spec.startedAt` 逐条带上）。
        apiPlanAvailability: apiPlanHistoryAvailability,
        changeAvailabilityOf: spec => (spec.changeSource === 'api'
          ? apiPlanHistoryAvailability : planHistoryAvailability)
      }), 'utf8');
    console.log(`  订阅中心: /feeds/（${feedStats.count} 个 Feed，RSS + JSON Feed 各一份）`);
  }

  // 数据源状态：把采集写入的心跳文件发布出去（机器可读），并生成一页可读的 /status/。
  // 文件缺失（还没跑过一次成功采集）时生成「暂无数据」页，而不是让构建失败——
  // 一份状态页缺席不该阻断发布。
  // ⚠️ `healthStore / healthDoc` 在前面派生 `sourceFacts` 时已经加载过一次 —— 这里复用，
  // 不重新 load：两次 load 之间文件若被采集改动，页面上的「来源状态」与记录上的
  // 「最近成功采集」就会来自两个不同版本的心跳，而两边各自看都自洽。
  fs.writeFileSync(path.join(OUT, 'source-health.json'), `${JSON.stringify(healthDoc, null, 2)}\n`, 'utf8');
  const statusDir = path.join(OUT, 'status');
  fs.mkdirSync(statusDir, { recursive: true });
  fs.writeFileSync(path.join(statusDir, 'index.html'), renderStatusPage(healthDoc, html), 'utf8');
  const healthSummary = health.summarize(healthDoc);
  console.log(`  数据源状态: source-health.json + status/index.html（${healthSummary.total} 个来源：` +
    `正常 ${healthSummary.healthy} · 异常 ${healthSummary.degraded} · 失败 ${healthSummary.failed}）`);

  // 交给自检：折叠覆盖的条目总数需与页面卡片内容对得上；译文条数用于产物回读比对
  return Object.assign({}, rendered, {
    zhWithZh: zhAttached.report.withZh,
    healthSources: healthSummary.total,
    healthStatusText: healthSummary.rows.map(row => `${row.source}=${row.status}`).join(','),
    // 目录页交给自检做**逐条回读对账**：文件存在不算数，页面上的条目集合
    // 必须与 dist/deals.json 里 `collections` / `needs` 的筛选结果逐个 id 对得上。
    // v1.2：两类页面（分类页与按需求页）都在这一个列表里，`collectionPages` 保留为
    // 它的过滤视图，既有断言不用改。
    directoryPages,
    collectionPages,
    needPages,
    // v1.7：四类新页面各自的视图 + 计划 + 交给 SEO 门禁的页面描述符 + sitemap 全量条目。
    // 自检不重算门槛，只对账「计划里说要生成的，产物里真的都在」。
    vendorPages,
    categoryPages,
    hubPages,
    aliasPages,
    plan: PLAN,
    pageDescriptors,
    sitemapEntries,
    lastmod,
    // v1.5：变化雷达交给自检做**回读对账**（条带 ↔ 数据 ↔ 页面三方）。把 radar 与
    // 基准日一并带下去，自检因此不必重算一遍判据 —— 重算就等于把判据写了两遍。
    radar,
    radarStats,
    radarAsOf,
    // v1.5 修复（P1-4）：`/changes/` 的 ItemList 与页面行标记读的是这一份（去重后的可链接集合）。
    // 自检对账要用同一个判据 —— 重算一遍就等于把「哪一条算代表」写了第二处。
    changesItemList,
    // v2.3：套餐变化视图同样交给自检回读对账（页面块 ↔ 日志 ↔ 订阅源三方）
    planRadar,
    planRadarStats,
    planHistoryAvailability,
    // v3.0 Stage H：API 价格变化视图（第三条变化流）—— 同样交给自检回读对账：
    // `/changes/` 的 API 分栏、`/feeds/` 的那一行、订阅源的深链锚点都读它。
    apiPlanRadar,
    apiPlanRadarStats,
    apiPlanHistoryAvailability,
    // v2.4：优惠 ↔ 套餐关系。自检要拿**这一份**（构建期算出来的视图）去回读对账：
    // dist/deals.json 的注入、dist/deal-plan-links.json、优惠页与套餐页上的文字都必须与它逐条一致。
    dealLinksDoc: dealLinksLoad.doc,
    dealLinksView,
    dealLinksByDeal,
    dealLinksAsOf,
    // v1.6：订阅层交给自检做**回读对账**（内存条目 ↔ RSS 回读 ↔ JSON 回读 + 语义不变量）。
    // 判据不重算：validate() 用的就是构建期这一份 feedBundle。
    feedBundle,
    feedStats,
    // v3.0 Stage D5/D6：模型页的规模与门槛结果 —— sitemap 对账（详情页条数 / 未过门槛的不许进）
    // 与产物自检都从这里取，不各算一遍。
    modelGates,
    modelGateSkipped: skippedModels,
    modelDetailCount: gatedModels.length,
    modelDetailRoutes: gatedModels.map(model => modelsPage.modelHrefOf(model)),
    // v3.0 Stage F：档案层交给自检做回读对账 —— 索引页永远有，详情页只在门槛内。
    archives,
    archiveEntries,
    archiveGates,
    archiveAsOf,
    archiveDetailCount: gatedArchiveEntries.length,
    archiveDetailRoutes: gatedArchiveEntries.map(entry => archiveLib.archiveEntryRoute(entry)),
    // v3.0 Stage G：数据出口的 Manifest（页面与自检读同一份）
    dataManifest,
    dataLicense: dataLicense || null,
    // 构建期真实生成的全部站内路由（含首页 '' 与刚才新增的 feeds/）——
    // Feed 里每一条站内链接都要能在这里找到，否则就是一条死链。
    pageRoutes: new Set([
      '',
      'status/',
      'changes/',
      'feeds/',
      plansHubPage.PLANS_HUB_ROUTE,
      plansPage.PLANS_ROUTE,
      apiPlansPage.API_PLANS_ROUTE,
      modelsPage.MODELS_INDEX_ROUTE,
      ...gatedModels.map(model => modelsPage.modelHrefOf(model)),
      archiveLib.ARCHIVE_INDEX_ROUTE,
      ...gatedArchiveEntries.map(entry => archiveLib.archiveEntryRoute(entry)),
      dataDocs.DATA_DOCS_ROUTE,
      ...detailPages.map(page => `deal/${encodeURIComponent(page.id)}/`),
      ...directoryPages.map(page => page.route)
    ])
  });
}

/**
 * 产物里全部文件的相对路径（POSIX 形式）。
 *
 * §10.7 的方向 2 要的是"磁盘上真的有什么"，所以**不读任何清单**：目录里出现的每个文件都算，
 * 由 `dataDocs.assertArtifactCoverage()` 去问"它被哪个注册表认领"。
 */
function listArtifactFiles(dir) {
  const out = [];
  const walk = (abs, rel) => {
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      const nextRel = rel ? `${rel}/${entry.name}` : entry.name;
      const nextAbs = path.join(abs, entry.name);
      if (entry.isDirectory()) walk(nextAbs, nextRel);
      else out.push(nextRel);
    }
  };
  walk(dir, '');
  return out.sort();
}

function selfCheck(built) {
  console.log('\n=== 4) 产物自检 ===');
  let failed = 0;
  const fail = (message) => { console.log('  ✗ ' + message); failed++; };

  for (const file of [...PUBLIC_FILES, ...GENERATED_FILES]) {
    const ok = fs.existsSync(path.join(OUT, file));
    console.log(`  ${ok ? '✓' : '✗'} ${file}`);
    if (!ok) failed++;
  }

  // ---- 密钥扫描（v2.0）----
  // 为什么放在"产物自检"而不是某个 AI 脚本里：**发布出去的那一份**才是最后一道防线。
  // 候选文件、缓存、账本都在 gitignore 的 .ai-cache/ 里，但一个手滑把 key 拼进
  // 生成产物（或者把带 key 的调试串留在数据里），从这里漏出去就是永久的、公开的。
  // 扫的是整个暂存目录而不是固定清单：将来新增产物文件自动纳入，不需要记得改清单。
  {
    const hits = secretScan.scanFiles([OUT]);
    if (hits.length) {
      fail(`产物里出现疑似密钥（${hits.length} 个文件）：` +
        hits.map(item => `${path.relative(OUT, item.file)}[${[...new Set(item.hits.map(h => h.id))].join(',')}]`).join(' / '));
    } else {
      console.log('  ✓ 密钥扫描：产物里没有 API key / token / 私钥形状的串');
    }
  }

  // logo 资产：目录存在、文件数与 manifest 对得上、CSS 里每条规则都有对应文件
  const logoDir = path.join(OUT, 'logos');
  if (!fs.existsSync(logoDir)) fail('缺少 logos/ 目录');
  else {
    const sheet = fs.readFileSync(path.join(OUT, 'logos.css'), 'utf8');
    const rules = [...new Set([...sheet.matchAll(/^\.lg\[data-logo="([^"]+)"\]\{/gm)].map(m => m[1]))];
    const missing = rules.filter(key => !fs.existsSync(path.join(logoDir, `${key}.svg`)) &&
      !fs.existsSync(path.join(logoDir, `${key}.png`)));
    if (!rules.length) fail('logos.css 里没有任何 logo 规则');
    else if (missing.length) fail(`logos.css 引用了不存在的图形: ${missing.join(', ')}`);
    else console.log(`  ✓ logo: ${rules.length} 条规则 → logos/ ${fs.readdirSync(logoDir).length} 个文件`);
  }

  const payload = JSON.parse(fs.readFileSync(path.join(OUT, 'deals.json'), 'utf8'));
  console.log(`  deals.json: schemaVersion=${payload.schemaVersion}, count=${payload.count}, updatedAt=${payload.updatedAt}`);
  if (payload.schemaVersion !== 2) fail('schemaVersion 不是 2');
  if (payload.count !== payload.deals.length) fail('count 与 deals 长度不一致');

  // ---- v2.1：发布出去的那份 plans.json，必须与源文件逐字节相同 ----
  //
  // 与下面 deals 那一大段是**同一个理由**（发布数据 = 源 + 声明过的变换），
  // 但结论不同：plans 在发布链上**没有任何变换**（译文/派生字段都还不存在），
  // 所以这里断言的是最强的那一种 —— **逐字节相等**。
  // 一旦将来要在构建期给它注入派生字段（比如 provider 显示名），这条断言会立刻变红，
  // 逼人把「注入什么」写下来 —— 那正是它该干的事。
  {
    const publishedPlans = path.join(OUT, 'plans.json');
    const sourcePlans = path.join(ROOT, 'plans.json');
    if (!fs.existsSync(publishedPlans)) fail('缺少 plans.json（v2.1 起它在 PUBLIC_FILES 里）');
    else {
      const a = fs.readFileSync(sourcePlans, 'utf8');
      const b = fs.readFileSync(publishedPlans, 'utf8');
      if (a !== b) fail('dist/plans.json 与源 plans.json 不是逐字节相同');
      else console.log(`  ✓ plans.json: 与源文件逐字节相同（${(b.length / 1024).toFixed(1)} KB）`);
    }

    // v2.3：套餐变化日志同样**逐字节**发布（读者能下载到的那一份必须与真值一致）。
    {
      const publishedHistory = path.join(OUT, 'plan-history.json');
      const sourceHistory = path.join(ROOT, 'scripts', 'data', 'plan-history.json');
      if (!fs.existsSync(publishedHistory)) fail('缺少 plan-history.json（v2.3 起它进产物）');
      else if (!fs.existsSync(sourceHistory)) fail('缺少源 scripts/data/plan-history.json');
      else {
        const a = fs.readFileSync(sourceHistory, 'utf8');
        const b = fs.readFileSync(publishedHistory, 'utf8');
        if (a !== b) fail('dist/plan-history.json 与源脚本的日志不是逐字节相同');
        else console.log(`  ✓ plan-history.json: 与源日志逐字节相同（${(b.length / 1024).toFixed(1)} KB）`);
      }
    }

    // 套餐对比页：**从磁盘回读**再跑一遍诚实性断言。
    //
    // 为什么不在写盘时信一次就够了：那个断言看的是内存里的字符串，
    // 而读者拿到的是磁盘上的字节（写盘编码、被别的步骤改写、路径写错……
    // 都是「内存里对、盘上不对」的形态）。这里读回来查，两边都要对得上。
    const plansPageFile = path.join(OUT, plansPage.PLANS_ROUTE, 'index.html');
    if (!fs.existsSync(plansPageFile)) fail(`缺少 ${plansPage.PLANS_ROUTE}index.html`);
    else {
      // 真值取**发布出去的那一份**（`dist/plans.json`）而不是仓库里的源：这一页的载荷是
      // 页面自己的派生数据，它必须与"读者能下载到的那份数据集"一致（v2.1 已断言 dist 与源逐字节相同）。
      const diskPlans = JSON.parse(fs.readFileSync(path.join(OUT, 'plans.json'), 'utf8'));
      const diskTable = providers.load().table;
      const diskHtml = fs.readFileSync(plansPageFile, 'utf8');
      const pageProblems = [
        ...plansPage.assertPageHonesty(diskHtml, diskPlans.plans, {
          providerTable: diskTable,
          // v2.3：从磁盘回读时同样带上变化视图与日志 —— 最近变化块与详情时间线
          // 是这一页新增的事实面，不给它们断言等于「盘上少了也看不出来」。
          planChanges: built.planRadar,
          planHistoryStore: fs.existsSync(path.join(OUT, 'plan-history.json'))
            ? JSON.parse(fs.readFileSync(path.join(OUT, 'plan-history.json'), 'utf8'))
            : null
        }),
        ...plansPage.assertDataHonesty(diskPlans.plans),
        ...(fs.existsSync(path.join(OUT, 'plan-history.json'))
          ? plansPage.assertHistoryHonesty(diskPlans.plans,
            JSON.parse(fs.readFileSync(path.join(OUT, 'plan-history.json'), 'utf8')))
          : [])
      ];
      // 交互逻辑**逐字节**内联：页面上跑的那一份与 `lib/plans-compare.js` 必须是同一份字节。
      // 少了这一条，将来把内联改成"精简版"也不会有人发现 —— 而那时浏览器与自测就是两套语义了。
      if (!diskHtml.includes(plansCompareSource())) {
        pageProblems.push('内联的交互脚本与 scripts/lib/plans-compare.js 不是同一份字节');
      }
      const templateCount = (diskHtml.match(/<template data-detail-for="/g) || []).length;
      if (templateCount !== diskPlans.plans.length) {
        pageProblems.push(`详情模板 ${templateCount} 个 ≠ 套餐 ${diskPlans.plans.length} 条`);
      }
      if (pageProblems.length) fail(`套餐对比页未通过诚实性断言：${pageProblems.slice(0, 3).join('、')}`);
      else {
        const forbidden = plansPage.FORBIDDEN_CLAIM_WORDS.filter(word => diskHtml.includes(word));
        if (forbidden.length) fail(`套餐对比页出现结论性词汇：${forbidden.join('、')}`);
        else {
          const payload = plansPage.comparePayloadOf(diskHtml).payload;
          console.log(`  ✓ 套餐对比页: ${diskPlans.count} 行 · 载荷 ${payload.rows.length} 行 / ` +
            `${payload.dimensions.provider.length} 平台选项 / 排序 ${[...payload.dimensions.sort.map(s => s.key)].join('+')} · ` +
            `详情模板 ${templateCount} 个（内容与引文逐条对账）· 口径文案在位 · 无结论性词汇（查了 ${plansPage.FORBIDDEN_CLAIM_WORDS.length} 个词）`);
        }
      }
    }
  }

  // ---- v2.5：发布出去的那份 api-plans.json 同样必须与源文件逐字节相同 ----
  //
  // 与 plans 同一条纪律：这一层在发布链上**没有任何变换**，所以断言的是最强的那一种。
  // 一旦将来要在构建期给它注入派生字段（比如模型显示名映射），这条断言会立刻变红。
  {
    const publishedApiPlans = path.join(OUT, 'api-plans.json');
    const sourceApiPlans = path.join(ROOT, 'api-plans.json');
    if (!fs.existsSync(publishedApiPlans)) fail('缺少 api-plans.json（v2.5 起它在 PUBLIC_FILES 里）');
    else {
      const a = fs.readFileSync(sourceApiPlans, 'utf8');
      const b = fs.readFileSync(publishedApiPlans, 'utf8');
      if (a !== b) fail('dist/api-plans.json 与源 api-plans.json 不是逐字节相同');
      else console.log(`  ✓ api-plans.json: 与源文件逐字节相同（${(b.length / 1024).toFixed(1)} KB）`);
    }

    const publishedApiHistory = path.join(OUT, 'api-plan-history.json');
    const sourceApiHistory = path.join(ROOT, 'scripts', 'data', 'api-plan-history.json');
    if (!fs.existsSync(publishedApiHistory)) fail('缺少 api-plan-history.json（v2.5 起它进产物）');
    else if (!fs.existsSync(sourceApiHistory)) fail('缺少源 scripts/data/api-plan-history.json');
    else {
      const a = fs.readFileSync(sourceApiHistory, 'utf8');
      const b = fs.readFileSync(publishedApiHistory, 'utf8');
      if (a !== b) fail('dist/api-plan-history.json 与源脚本的日志不是逐字节相同');
      else console.log(`  ✓ api-plan-history.json: 与源日志逐字节相同（${(b.length / 1024).toFixed(1)} KB）`);
    }

    // API 计费页：**从磁盘回读**再跑一遍诚实性断言（与套餐页同一个理由）。
    const apiPlansPageFile = path.join(OUT, apiPlansPage.API_PLANS_ROUTE, 'index.html');
    if (!fs.existsSync(apiPlansPageFile)) fail(`缺少 ${apiPlansPage.API_PLANS_ROUTE}index.html`);
    else {
      const diskApiPlans = JSON.parse(fs.readFileSync(path.join(OUT, 'api-plans.json'), 'utf8'));
      const diskApiHistory = fs.existsSync(path.join(OUT, 'api-plan-history.json'))
        ? JSON.parse(fs.readFileSync(path.join(OUT, 'api-plan-history.json'), 'utf8'))
        : null;
      const diskHtml = fs.readFileSync(apiPlansPageFile, 'utf8');
      const pageProblems = [
        ...apiPlansPage.assertPageHonesty(diskHtml, diskApiPlans.plans, { providerTable: providers.load().table }),
        ...apiPlansPage.assertDataHonesty(diskApiPlans.plans),
        ...apiPlansPage.assertHistoryHonesty(diskApiPlans.plans, diskApiHistory),
        // v2.4 那一支的断言对 API 计费页同样适用（只筛 kind=api 的行）：
        // 「已结束的关联被当成当前优惠」在这一页同样是必须挡住的事。
        ...plansPage.assertPlanDealsBlock(diskHtml, built.dealLinksView, {
          kind: 'api', unit: '条 API 计费记录', prefix: '../../'
        })
      ];
      // 这一页**刻意没有交互脚本**（v1 是预渲染静态表）—— 断言它真的没有，
      // 而不是"以后顺手加了筛选控件也没人知道"。JSON-LD 与主题脚本都是**内联**的，
      // 所以必须按 type/内容排除，而不是按"有没有 src"排除。
      //
      // private-analytics-v1：页脚里的分析 bootstrap 也是内联的，同样要排除 ——
      // 它是**全站共享页脚的一部分**（不是这一页的交互控件），且它加载的是外部观测脚本、
      // 不改变页面行为。排除它之后，这条断言仍然守着「这一页自己没有内联脚本」这件事。
      const withoutAllowedScripts = analytics.stripBootstrap(diskHtml)
        .replace(/<script>\s*\/\* 主题必须在首次绘制前决定[\s\S]*?<\/script>/g, '')
        .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '');
      if (/<script(?![^>]*\bsrc=)[^>]*>/.test(withoutAllowedScripts)) {
        pageProblems.push('API 计费页出现了内联脚本 —— v1 是预渲染静态表（无 JS 控件）');
      }
      if (pageProblems.length) fail(`API 计费页未通过诚实性断言：${pageProblems.slice(0, 3).join('、')}`);
      else {
        const forbidden = apiPlansPage.FORBIDDEN_CLAIM_WORDS.filter(word => diskHtml.includes(word));
        if (forbidden.length) fail(`API 计费页出现结论性词汇：${forbidden.join('、')}`);
        else {
          const rows = apiPlansPage.apiRowsOf(diskApiPlans.plans, { providerTable: providers.load().table });
          console.log(`  ✓ API 计费页: ${diskApiPlans.count} 条记录 / ${rows.length} 行 · ` +
            `价格六格逐格与数据对账 · 计费单位列逐行在位 · 免费额度与 credits 明细节 · 官方原文节 · ` +
            `无 JS 控件 · 无结论性词汇（查了 ${apiPlansPage.FORBIDDEN_CLAIM_WORDS.length} 个词）`);
        }
      }
    }
  }

  // ---- v3.0 Stage B：/plans/ 资料入口页（从磁盘回读对账）--------------------------------
  //
  // 与两个对比页同一条纪律：写盘时信一次不够，读者拿到的是盘上的字节。
  // 回读时带的上下文必须是**盘上的那一份数据**（dist/plans.json + dist/api-plans.json +
  // 盘上的两份日志），而不是构建期的内存对象 —— 否则「盘上的日志与页面上的计数不一致」
  // 这类错误在自检里看不出来。
  {
    const hubFile = path.join(OUT, plansHubPage.PLANS_HUB_ROUTE, 'index.html');
    if (!fs.existsSync(hubFile)) fail(`缺少 ${plansHubPage.PLANS_HUB_ROUTE}index.html`);
    else {
      const diskHtml = fs.readFileSync(hubFile, 'utf8');
      const diskPlans = JSON.parse(fs.readFileSync(path.join(OUT, 'plans.json'), 'utf8'));
      const diskApiPlans = JSON.parse(fs.readFileSync(path.join(OUT, 'api-plans.json'), 'utf8'));
      const diskPlanHistory = fs.existsSync(path.join(OUT, 'plan-history.json'))
        ? JSON.parse(fs.readFileSync(path.join(OUT, 'plan-history.json'), 'utf8')) : null;
      const diskApiPlanHistory = fs.existsSync(path.join(OUT, 'api-plan-history.json'))
        ? JSON.parse(fs.readFileSync(path.join(OUT, 'api-plan-history.json'), 'utf8')) : null;
      const pageProblems = plansHubPage.assertPageHonesty(diskHtml, {
        plans: diskPlans.plans,
        apiPlans: diskApiPlans.plans,
        providerTable: providers.load().table,
        planHistoryStore: diskPlanHistory,
        apiPlanHistoryStore: diskApiPlanHistory,
        dealLinks: JSON.parse(fs.readFileSync(path.join(OUT, 'deal-plan-links.json'), 'utf8')),
        deals: JSON.parse(fs.readFileSync(path.join(OUT, 'deals.json'), 'utf8')).deals,
        asOf: built.dealLinksAsOf,
        prefix: '../',
        siteUrl: SITE_URL
      });
      // 「不是第三张重复大表」这条承诺要可验：这一页**不许**出现任何 <table>。
      // 复制粘贴一张大表在视觉上完全正常 —— 只有结构断言能挡住它。
      if (/<table[\s>]/.test(diskHtml)) {
        pageProblems.push('资料入口页出现了 <table> —— 它不该复制 Coding / API 页的大表');
      }
      // 无 JS 可读：正文全部是构建期写下的静态 HTML，且不许内联交互脚本。
      // （分析 bootstrap 与主题脚本、JSON-LD 一样属于**允许的共享内联段**，见上一处的说明。）
      const withoutAllowedScripts = analytics.stripBootstrap(diskHtml)
        .replace(/<script>\s*\/\* 主题必须在首次绘制前决定[\s\S]*?<\/script>/g, '')
        .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '');
      if (/<script(?![^>]*\bsrc=)[^>]*>/.test(withoutAllowedScripts)) {
        pageProblems.push('资料入口页出现了内联脚本 —— 它是纯静态页（无 JS 也有完整内容）');
      }
      // JSON-LD 必须带 ItemList（两个子页），且声明数 == 元素数 == data-child 行数。
      pageProblems.push(...plansHubPage.assertItemListHonesty(diskHtml, { siteUrl: SITE_URL }));
      if (pageProblems.length) fail(`套餐资料入口页未通过诚实性断言：${pageProblems.slice(0, 3).join('、')}`);
      else {
        const forbidden = plansHubPage.FORBIDDEN_CLAIM_WORDS.filter(word => diskHtml.includes(word));
        if (forbidden.length) fail(`套餐资料入口页出现结论性词汇：${forbidden.join('、')}`);
        else {
          console.log(`  ✓ 套餐资料入口页: 计数与 dist 数据逐项对账 · 两个子页入口在位 · ` +
            `无大表（0 个 <table>）· 无内联脚本 · ItemList 2 项 == data-child 2 行 · ` +
            `无结论性词汇（查了 ${plansHubPage.FORBIDDEN_CLAIM_WORDS.length} 个词）`);
        }
      }
    }
  }

  // ---- v3.0 Stage D5/D6：模型页（从磁盘回读对账）--------------------------------
  //
  // 与两个对比页 / 资料入口同一条纪律：读者拿到的是盘上的字节。回读时用的数据必须是
  // **盘上的那一份**（dist/models.json + dist/model-registry-links.json + dist/api-plans.json
  // + dist/plans.json + dist/deal-plan-links.json），而不是构建期的内存对象。
  {
    const modelsIndexFile = path.join(OUT, modelsPage.MODELS_INDEX_ROUTE, 'index.html');
    if (!fs.existsSync(modelsIndexFile)) fail(`缺少 ${modelsPage.MODELS_INDEX_ROUTE}index.html`);
    else {
      const diskIndexHtml = fs.readFileSync(modelsIndexFile, 'utf8');
      const diskModels = JSON.parse(fs.readFileSync(path.join(OUT, 'models.json'), 'utf8'));
      const diskLinks = JSON.parse(fs.readFileSync(path.join(OUT, 'model-registry-links.json'), 'utf8'));
      const diskApiPlans = JSON.parse(fs.readFileSync(path.join(OUT, 'api-plans.json'), 'utf8'));
      const diskPlans = JSON.parse(fs.readFileSync(path.join(OUT, 'plans.json'), 'utf8'));
      const diskDeals = JSON.parse(fs.readFileSync(path.join(OUT, 'deals.json'), 'utf8'));
      const diskDealLinks = JSON.parse(fs.readFileSync(path.join(OUT, 'deal-plan-links.json'), 'utf8'));
      const diskApiHistory = fs.existsSync(path.join(OUT, 'api-plan-history.json'))
        ? JSON.parse(fs.readFileSync(path.join(OUT, 'api-plan-history.json'), 'utf8')) : null;
      const diskCtxBase = {
        links: diskLinks,
        apiPlans: diskApiPlans.plans,
        plans: diskPlans.plans,
        deals: diskDeals.deals,
        dealLinks: diskDealLinks,
        apiPlanHistoryStore: diskApiHistory,
        providerTable: providers.load().table,
        asOf: built.dealLinksAsOf,
        siteUrl: SITE_URL,
        vendorHrefOf: developer => vendorHrefFor(developer, providers.load().table, built.directoryPages)
      };
      const problems = modelsPage.assertPageHonesty(diskIndexHtml, {
        kind: 'models-index',
        registry: diskModels,
        ctx: { ...diskCtxBase, prefix: '../', __refCache: new Map() }
      });
      // 内联脚本**逐字节**比对：页面上跑的那一份与 `lib/models-page.js` 里的必须同一份字节
      // （与套餐页内联 `plans-compare.js` 是同一条纪律 —— 分家之后两边都还是绿的）。
      if (!diskIndexHtml.includes(modelsPage.MODELS_INDEX_FILTER_SCRIPT)) {
        problems.push('内联的筛选脚本与 lib/models-page.js 不是同一份字节');
      }
      // 构建期门槛：盘上不该出现未过门槛的模型页
      const diskSlugs = new Set(diskModels.models.map(model => model.slug));
      const untracked = built.modelGateSkipped.filter(gate => diskSlugs.has(gate.slug));
      if (untracked.length) problems.push(`${untracked.length} 个未过门槛的模型仍在发布数据里`);
      let detailProblems = [];
      for (const model of diskModels.models) {
        const route = modelsPage.modelHrefOf(model);
        const file = path.join(OUT, route, 'index.html');
        if (!fs.existsSync(file)) {
          if (built.modelDetailRoutes.includes(route)) detailProblems.push(`${route}: 过了门槛却没有产物`);
          continue;
        }
        const detailHtml = fs.readFileSync(file, 'utf8');
        const pageProblems = modelsPage.assertPageHonesty(detailHtml, {
          kind: 'model', model, ctx: { ...diskCtxBase, prefix: '../../', __refCache: new Map() }
        });
        detailProblems = detailProblems.concat(pageProblems.map(problem => `${route}: ${problem}`));
      }
      const allProblems = problems.concat(detailProblems);
      if (allProblems.length) fail(`模型页未通过诚实性断言：${allProblems.slice(0, 3).join('、')}`);
      else {
        const forbidden = modelsPage.FORBIDDEN_CLAIM_WORDS.filter(word => diskIndexHtml.includes(word));
        if (forbidden.length) fail(`模型索引页出现结论性词汇：${forbidden.join('、')}`);
        else {
          console.log(`  ✓ 模型页: 索引 ${diskModels.count} 行（含 ${diskModels.models.filter(m => m.aliases.length).length} 个带别名）` +
            ` · 详情 ${built.modelDetailCount} 个（计价表逐行与映射对账 · 摊 Provider 不许凭空出现）` +
            ` · 筛选脚本与 lib 逐字节同源 · 未过门槛 ${built.modelGateSkipped.length} 个未生成` +
            ` · 无结论性词汇（查了 ${modelsPage.FORBIDDEN_CLAIM_WORDS.length} 个词）`);
        }
      }
    }
  }

  // ---- v3.0 Stage F：历史档案（从磁盘回读对账）--------------------------------
  //
  // 三条牙的构建期落点：
  //   · #9  归档只依赖事件：用**盘上的日志**重算一遍，条目集合与内存里的必须一致；
  //   · #10 大批 ended：可疑标记与异常留档必须同时在（`assertArchiveIntegrity`）；
  //   · #11 ended→restored 之后状态必须是 restored（同样由 integrity 重推比对）。
  // 再加上：索引页三组齐、sitemap 成员 == 过门槛的详情页、不为历史 event 建页。
  {
    const archiveIndexFile = path.join(OUT, archiveLib.ARCHIVE_INDEX_ROUTE, 'index.html');
    if (!fs.existsSync(archiveIndexFile)) fail(`缺少 ${archiveLib.ARCHIVE_INDEX_ROUTE}index.html`);
    else {
      const diskHtml = fs.readFileSync(archiveIndexFile, 'utf8');
      const diskStores = {
        deal: JSON.parse(fs.readFileSync(path.join(OUT, 'deal-history.json'), 'utf8')),
        plan: fs.existsSync(path.join(OUT, 'plan-history.json'))
          ? JSON.parse(fs.readFileSync(path.join(OUT, 'plan-history.json'), 'utf8')) : null,
        api: fs.existsSync(path.join(OUT, 'api-plan-history.json'))
          ? JSON.parse(fs.readFileSync(path.join(OUT, 'api-plan-history.json'), 'utf8')) : null
      };
      const diskRecords = {
        deal: JSON.parse(fs.readFileSync(path.join(OUT, 'deals.json'), 'utf8')).deals,
        plan: JSON.parse(fs.readFileSync(path.join(OUT, 'plans.json'), 'utf8')).plans,
        api: JSON.parse(fs.readFileSync(path.join(OUT, 'api-plans.json'), 'utf8')).plans
      };
      const diskArchives = ['deal', 'plan', 'api'].map(kind => archiveLib.buildArchive({
        kind,
        baseline: diskStores[kind] ? diskStores[kind].baseline : null,
        events: (diskStores[kind] && diskStores[kind].events) || [],
        absence: (diskStores[kind] && diskStores[kind].absence) || {},
        anomalies: (diskStores[kind] && diskStores[kind].anomalies) || [],
        records: diskRecords[kind],
        startedAt: diskStores[kind] ? diskStores[kind].startedAt : null,
        asOf: built.archiveAsOf
      }));
      const diskEntries = diskArchives.flatMap(archive => archive.entries);
      const problems = [
        ...diskArchives.flatMap(archive => archiveLib.assertArchiveIntegrity(archive)),
        ...archiveLib.assertPageHonesty(diskHtml, { kind: 'archive-index', archives: diskArchives }),
        ...archiveLib.assertEntrySetStable(
          { entries: diskEntries },
          { entries: diskArchives.flatMap(archive => archiveLib.buildArchive({
            kind: archive.kind,
            baseline: diskStores[archive.kind] ? diskStores[archive.kind].baseline : null,
            events: (diskStores[archive.kind] && diskStores[archive.kind].events) || [],
            absence: (diskStores[archive.kind] && diskStores[archive.kind].absence) || {},
            asOf: built.archiveAsOf
          }).entries) }
        ),
        ...archiveLib.assertArchiveDetailRoutes(built.archiveDetailRoutes, diskEntries)
      ];
      const diskGates = diskEntries.map(entry => archiveLib.archiveDetailGate(entry));
      const sitemapText = fs.readFileSync(path.join(OUT, 'sitemap.xml'), 'utf8');
      problems.push(...archiveLib.assertArchiveSitemapEligibility({
        sitemapRoutes: [...sitemapText.matchAll(/<loc>([^<]+)<\/loc>/g)]
          .map(match => match[1].replace(SITE_URL, ''))
          .filter(route => route.startsWith(archiveLib.ARCHIVE_INDEX_ROUTE)),
        gateResults: diskGates
      }));
      for (const route of built.archiveDetailRoutes) {
        const file = path.join(OUT, route, 'index.html');
        if (!fs.existsSync(file)) { problems.push(`${route}: 缺少产物`); continue; }
        const entryHtml = fs.readFileSync(file, 'utf8');
        const entry = diskEntries.find(item => archiveLib.archiveEntryRoute(item) === route);
        problems.push(...archiveLib.assertPageHonesty(entryHtml, { kind: 'archive-entry', entry })
          .map(problem => `${route}: ${problem}`));
      }
      if (problems.length) fail(`历史档案未通过诚实性 / 完整性断言：${problems.slice(0, 3).join('、')}`);
      else {
        const forbidden = archiveLib.FORBIDDEN_CLAIM_WORDS.filter(word => diskHtml.includes(word));
        if (forbidden.length) fail(`历史档案页出现结论性词汇：${forbidden.join('、')}`);
        else {
          console.log(`  ✓ 历史档案: 索引三组齐（${diskArchives.map(archive => `${archive.kindLabel} ${archive.entries.length}`).join(' / ')}）` +
            ` · 详情页 ${built.archiveDetailCount} 个（门槛内）· 完整性重推零问题 · sitemap 成员逐个对账` +
            ` · 无结论性词汇（查了 ${archiveLib.FORBIDDEN_CLAIM_WORDS.length} 个词）`);
        }
      }
    }
  }

  // ---- v3.0 Stage G：数据出口（从磁盘回读对账）--------------------------------
  //
  // 三条牙的构建期落点（全部对着**盘上的文件**重算一遍）：
  //   #12 文档里的 endpoint 不存在 → 红（查 dist 里有没有这个文件）；
  //   #13 schemaVersion 与真实数据不一致 → 红；
  //   #14 Manifest 条数与真实发布的数据集数不一致 → 红；
  // 外加 updatedAt 逐字段 + **时间形状**对账（真实时刻 vs 日期规范化）。
  {
    const dataIndexFile = path.join(OUT, 'data', 'index.json');
    const docsFile = path.join(OUT, dataDocs.DATA_DOCS_ROUTE, 'index.html');
    if (!fs.existsSync(dataIndexFile)) fail('缺少 data/index.json（Dataset Manifest）');
    else if (!fs.existsSync(docsFile)) fail(`缺少 ${dataDocs.DATA_DOCS_ROUTE}index.html`);
    else {
      const diskManifest = JSON.parse(fs.readFileSync(dataIndexFile, 'utf8'));
      const docsHtml = fs.readFileSync(docsFile, 'utf8');
      // 真实值：**从盘上各数据集文件现读**，不信内存里的那一份
      const actual = {};
      for (const dataset of diskManifest.datasets) {
        const file = path.join(OUT, dataset.url);
        if (!fs.existsSync(file)) continue;
        const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
        actual[dataset.id] = {
          schemaVersion: parsed.schemaVersion,
          count: typeof parsed.count === 'number' ? parsed.count
            : (Array.isArray(parsed.events) ? parsed.events.length
              : (Array.isArray(parsed.links) ? parsed.links.length : null)),
          updatedAt: parsed.updatedAt || parsed.startedAt || null
        };
      }
      const problems = [
        ...dataDocs.assertManifestShape(diskManifest),
        ...dataDocs.assertEndpointsExist(diskManifest, url => fs.existsSync(path.join(OUT, url))),
        ...dataDocs.assertSchemaVersions(diskManifest, Object.fromEntries(
          Object.entries(actual).map(([id, row]) => [id, row.schemaVersion]))),
        ...dataDocs.assertManifestCounts(diskManifest, Object.fromEntries(
          Object.entries(actual).map(([id, row]) => [id, row.count]))),
        ...dataDocs.assertUpdatedAt(diskManifest, Object.fromEntries(
          Object.entries(actual).map(([id, row]) => [id, row.updatedAt]))),
        ...dataDocs.assertPageHonesty(docsHtml, {
          manifest: diskManifest,
          license: built.dataLicense ? { status: 'present', file: built.dataLicense } : { status: 'absent' },
          siteUrl: SITE_URL,
          prefix: '../../',
          endpointExists: url => fs.existsSync(path.join(OUT, url)),
          actualSchemaVersions: Object.fromEntries(Object.entries(actual).map(([id, row]) => [id, row.schemaVersion])),
          actualCounts: Object.fromEntries(Object.entries(actual).map(([id, row]) => [id, row.count])),
          actualUpdatedAt: Object.fromEntries(Object.entries(actual).map(([id, row]) => [id, row.updatedAt]))
        })
      ];
      // 发布的数据集数必须 == Manifest 条数（"多了一份没人知道的数据"同样要红）。
      // 判据来自**唯一注册表**（`PUBLIC_DATASETS`），不是这里再抄一份 9 文件清单 ——
      // 抄一份清单的后果正是 P2-25：新加一份公开 JSON 时没有任何东西会红。
      const registeredDataFiles = dataDocs.datasetUrls();
      const missingFromManifest = registeredDataFiles.filter(file => !diskManifest.datasets.some(d => d.url === file));
      if (missingFromManifest.length) {
        problems.push(`有 ${missingFromManifest.length} 份已登记的公开数据集没进 Manifest：${missingFromManifest.join('、')}`);
      }
      // ---- 方向 2（§10.7）：扫描产物里的**全部** JSON，逐个要求"被某个注册表认领" ----
      // Feed 家族的产出清单从 `feedBundle` 现取（就是刚刚落盘的那一份），
      // 于是「feed 目录里的文件」与「Feed 注册表说要产出的文件」双向对账，不靠通配豁免。
      const coverage = dataDocs.assertArtifactCoverage(listArtifactFiles(OUT), diskManifest, {
        feedFiles: built.feedBundle.feeds.flatMap(feed => [feed.spec.path, feed.spec.jsonPath])
      });
      problems.push(...coverage.problems);
      if (problems.length) fail(`数据出口未通过诚实性断言：${problems.slice(0, 3).join('、')}`);
      else {
        console.log(`  ✓ 数据出口: Manifest ${diskManifest.count} 份数据集（六类齐）· ${docsHtml.includes('data/index.json') ? '页面给出 Manifest 地址' : '缺 Manifest 地址'}` +
          ` · endpoint 逐个存在 · schemaVersion / count / updatedAt 逐字段对账` +
          ` · 方向 2 扫描：${dataDocs.artifactCoverageSummary(coverage.counts)}` +
          ` · 时间形状 真实时刻 ${diskManifest.datasets.filter(d => d.updatedAtShape === 'timestamp').length} / 日期规范化 ${diskManifest.datasets.filter(d => d.updatedAtShape === 'date-normalized').length} / 纯日期 ${diskManifest.datasets.filter(d => d.updatedAtShape === 'date').length}`);
      }
    }
  }

  // ---- v2.4：优惠 ↔ 套餐关系（从磁盘回读对账）--------------------------------
  //
  // 这一层的坏法全都是「页面看起来正常」：注入漏了 → 有关系的那几条优惠页少一块；
  // 注入的是上一次的关系 → 页面显示一条谁也没确认过的关联；套餐页的块与视图不同步 →
  // 「当前优惠」与「暂无当前优惠」对不上。所以这里读回磁盘，对账三份东西：
  //   ① `dist/deals.json` 的 `relatedPlans` 必须等于用关系表**重算**的结果（逐字段）；
  //   ② `dist/deal-plan-links.json` 的 links/retired 与源表深等，count/updatedAt 等于推导值；
  //   ③ 优惠页与套餐页上的块落到字节上（含 `../../` 深度前缀、套餐行锚点落点、反向无块）。
  {
    const problems = [];
    const sourceDoc = JSON.parse(fs.readFileSync(path.join(ROOT, 'deals.json'), 'utf8'));
    for (const deal of sourceDoc.deals || []) {
      if (deal && Object.prototype.hasOwnProperty.call(deal, 'relatedPlans')) {
        problems.push(`源 deals.json 里出现了构建期派生字段 relatedPlans（${deal.id}）`);
        break;
      }
    }

    // ① dist/deals.json 的注入
    const published = JSON.parse(fs.readFileSync(path.join(OUT, 'deals.json'), 'utf8'));
    const expectedByDeal = new Map();
    for (const [dealId, rows] of built.dealLinksByDeal) expectedByDeal.set(dealId, dealPlanLinks.relatedPlansOf(rows));
    let injected = 0;
    for (const deal of published.deals || []) {
      const expected = expectedByDeal.get(deal.id) || null;
      const actual = Array.isArray(deal.relatedPlans) ? deal.relatedPlans : null;
      if (!expected) {
        if (actual) problems.push(`${deal.id} 没有关系却注入了 relatedPlans`);
        continue;
      }
      injected++;
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        problems.push(`${deal.id} 的 relatedPlans 与关系表重算结果不一致`);
      }
    }
    if (injected !== expectedByDeal.size) {
      problems.push(`注入到 dist 的关联条目 ${injected} ≠ 关系表覆盖的优惠 ${expectedByDeal.size} 条`);
    }

    // ② 发布的关系文件
    const linksFile = path.join(OUT, 'deal-plan-links.json');
    if (!fs.existsSync(linksFile)) {
      problems.push('缺少 dist/deal-plan-links.json');
    } else {
      const doc = JSON.parse(fs.readFileSync(linksFile, 'utf8'));
      const expected = dealPlanLinks.publishedDoc(built.dealLinksDoc);
      if (JSON.stringify(doc.links) !== JSON.stringify(expected.links)) problems.push('dist/deal-plan-links.json 的 links 与源表不一致');
      if (JSON.stringify(doc.retired) !== JSON.stringify(expected.retired)) problems.push('dist/deal-plan-links.json 的 retired 与源表不一致');
      if (doc.count !== expected.count) problems.push(`dist/deal-plan-links.json 的 count（${doc.count}）≠ 推导值 ${expected.count}`);
      if (doc.updatedAt !== expected.updatedAt) problems.push(`dist/deal-plan-links.json 的 updatedAt（${doc.updatedAt}）≠ 推导值 ${expected.updatedAt}`);
    }

    // ③ 页面上的块（套餐页 + 有关系的优惠详情页）
    const plansPagePath = path.join(OUT, plansPage.PLANS_ROUTE, 'index.html');
    const plansPageHtml = fs.existsSync(plansPagePath) ? fs.readFileSync(plansPagePath, 'utf8') : '';
    if (!plansPageHtml) problems.push(`缺少 ${plansPage.PLANS_ROUTE}index.html（关系块无处安放）`);
    problems.push(...plansPage.assertPlanDealsBlock(plansPageHtml, built.dealLinksView, { prefix: '../../' }));
    for (const [dealId, rows] of built.dealLinksByDeal) {
      const file = path.join(OUT, 'deal', dealId, 'index.html');
      if (!fs.existsSync(file)) { problems.push(`有关联的优惠缺少详情页 ${dealId}`); continue; }
      const page = fs.readFileSync(file, 'utf8');
      if (!page.includes('关联的正常套餐')) problems.push(`${dealId} 的详情页没有「关联的正常套餐」块`);
      for (const row of rows) {
        if (!page.includes(`data-plan-id="${row.planId}"`)) problems.push(`${dealId} 的详情页缺少记录 ${row.planId} 的一行`);
        // v2.5：链接目标按 kind 分派（Coding 套餐 → /plans/coding/，API 计费记录 → /plans/api/），
        // 与 RENDER-CORE 的 `PLAN_LINK_ROUTE` 是同一张表的两个落点。
        const route = row.planKind === 'api' ? apiPlansPage.API_PLANS_ROUTE : plansPage.PLANS_ROUTE;
        if (!page.includes(`data-plan-kind="${row.planKind === 'api' ? 'api' : 'coding'}"`)
          || !page.includes(`href="../../${route}#plan-${row.planId}"`)) {
          problems.push(`${dealId} 的详情页指向记录 ${row.planId} 的链接缺失或深度前缀不是 ../../（应为 ${route}）`);
        }
      }
    }
    // 反向：没有关系的优惠页不许出现这一块（多出来的块是「凭空造了一条关系」的那种坏法）
    for (const deal of published.deals || []) {
      if (expectedByDeal.has(deal.id)) continue;
      const file = path.join(OUT, 'deal', deal.id, 'index.html');
      if (fs.existsSync(file) && fs.readFileSync(file, 'utf8').includes('class="dplans"')) {
        problems.push(`${deal.id} 没有关系，详情页却渲染了关联块`);
        break;
      }
    }
    // 锚点落点：记录必须真在**它所在的那一页**上有 `id="plan-<planId>"`（否则关联链接是一条死锚点）。
    // v2.5：锚点分属两页 —— Coding 记录在 /plans/coding/，API 计费记录在 /plans/api/。
    // 不按 kind 分流的话，一行 API 记录会被要求出现在套餐页上，而那是永远不成立的。
    const apiPlansPageHtmlForAnchors = fs.existsSync(path.join(OUT, apiPlansPage.API_PLANS_ROUTE, 'index.html'))
      ? fs.readFileSync(path.join(OUT, apiPlansPage.API_PLANS_ROUTE, 'index.html'), 'utf8')
      : '';
    for (const row of built.dealLinksView.rows) {
      if (!row.current.length && !row.history.length) continue;
      const host = (row.planKind === 'api') ? apiPlansPageHtmlForAnchors : plansPageHtml;
      const where = (row.planKind === 'api') ? '/plans/api/' : '/plans/coding/';
      if (!host.includes(`id="plan-${row.planId}"`)) {
        problems.push(`${where} 缺少记录 ${row.planId} 的行锚点（关联链接会指向不存在的锚点）`);
      }
    }

    if (problems.length) fail(`优惠 ↔ 套餐关系：${problems.slice(0, 6).join('；')}`);
    else {
      const stats = built.dealLinksView.counts;
      console.log(`  ✓ 优惠 ↔ 套餐: ${stats.links} 条关系覆盖 ${stats.withCurrent} 条套餐` +
        `（当前 ${stats.current} 行 / 历史 ${stats.history} 行）· dist 注入 ${injected} 条` +
        ` · 优惠页与套餐页逐条对账（含锚点与深度前缀）· 基准日 ${built.dealLinksAsOf || '未知'}`);
    }
  }

  // ---- 源数据 vs 发布数据的一致性门禁（v1.0 就记着的债，v1.1 收口补上）----
  //
  // 为什么必须有：`dist/deals.json` 是**发布出去的那一份** —— 浏览器 fetch 的是它，
  // 首页的每个数字、每张卡片都从它来。而在此之前，没有任何东西比对过它与源 `deals.json`：
  // 构建只断言了它的几个**属性**（schemaVersion / count），属性对了而**内容**是旧的、
  // 或者少了一批字段，照样发布。v1.0 的报告里就记着这条债，一直没还。
  //
  // 口径：dist 必须**恰好等于** 源 + 构建期**声明过的**变换，多一个字段少一个字段都算不一致。
  //   ① `collections` —— 构建期算出的分类归属（**只增**的派生字段）
  //   ①′ `needs`     —— 构建期算出的按需求命中（v1.2，同样只增）。两个派生字段都是
  //      「判据只写一遍、结果当数据传」的产物，所以它们只进 dist、不进源 `deals.json`，
  //      可重建性门禁（check-reproducible）因此不需要认识它们。
  //   ③ `sourceFacts` —— v1.3 构建期算出的采集事实（来源类型 / 采集方式 / 最近成功采集），
  //      同样只增；它的真值在 source-health.json 与 provenance.SOURCE_TYPES 里，
  //      这里只存放「渲染那一刻看到的值」。
  //   ② `zh`         —— 中文译文覆盖层。⚠️ 它**不是只增**：覆盖层会按指纹停用「原文已变」
  //      的译文、也会把撤回的译文从产物里去掉（`selftest:zh` 的两个用例正是这两件事）。
  //      所以它**不比字节**，只断言「不多出别的字段」；译文自身的正确性由它自己的门禁管
  //      （构建期的 zh 断言：译文没写进产物 / 译文顶掉了英文原文；以及 `check:zh` 的漂移检查）。
  //
  // ⚠️ 第一版把 `zh` 也按字节比了，于是 `selftest:zh` 的两个用例当场变红 ——
  // 那不是译文坏了，是**这条门禁对 `zh` 的语义断言错了**：它假设覆盖层只增不减。
  // 一个把正常行为判成失败的守卫，比没有守卫更糟（它会被绕过或被改松）。
  const BUILD_ADDED = new Set(['collections', 'needs', 'sourceFacts', 'history', 'relatedPlans']);
  const BUILD_MANAGED = new Set(['zh']);
  {
    const source = JSON.parse(fs.readFileSync(path.join(ROOT, 'deals.json'), 'utf8'));
    const problems = [];
    if (source.schemaVersion !== payload.schemaVersion) problems.push('schemaVersion 不一致');
    if (source.updatedAt !== payload.updatedAt) problems.push(`updatedAt 不一致（源 ${source.updatedAt} / 产物 ${payload.updatedAt}）`);
    if (source.count !== payload.count) problems.push(`count 不一致（源 ${source.count} / 产物 ${payload.count}）`);
    if (source.deals.length !== payload.deals.length) {
      problems.push(`条目数不一致（源 ${source.deals.length} / 产物 ${payload.deals.length}）`);
    } else {
      for (let i = 0; i < source.deals.length; i++) {
        const a = source.deals[i];
        const b = payload.deals[i];
        if (a.id !== b.id) { problems.push(`第 ${i} 条 id 不一致（${a.id} / ${b.id}）`); break; }
        for (const key of Object.keys(a)) {
          if (BUILD_MANAGED.has(key)) continue;
          if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) {
            problems.push(`${a.id} 的 ${key} 与源不一致`);
            break;
          }
        }
        for (const key of Object.keys(b)) {
          if (!(key in a) && !BUILD_ADDED.has(key) && !BUILD_MANAGED.has(key)) {
            problems.push(`${a.id} 多了源里没有的字段 ${key}`);
            break;
          }
        }
        if (problems.length > 8) break;
      }
    }
    if (problems.length) fail(`deals.json 与发布产物不一致：${problems.slice(0, 8).join('；')}`);
    else console.log(`  ✓ 源/产物一致: ${payload.deals.length} 条逐字段相同（构建期只动 zh / collections / needs / sourceFacts / history / relatedPlans）`);
  }

  // ---- v1.3：信息来源块（evidence / sourceFacts）----------------------------
  //
  // 这一块要么在页面上说真话，要么不如不说：`lastSuccessAt` 是 join 出来的，
  // join 错了（来源改名、心跳换了字段名）页面**不会报错**，只会显示一个看起来正常的日期。
  // 所以这里逐条与 source-health.json 对账，并把渲染器真正产出的 HTML 拿出来扫两件事：
  // ① 三个缺失状态有没有各自说出来；② 有没有混进本站自发的有效性结论。
  //
  // 红线只在**我们自己写的字**上扫（SOURCE_WORDING 的全部取值 + provenance 的推理 note），
  // **不扫** evidence 里的官方引文 —— 官方原话里出现「保证」「永久」是事实，不是我们的承诺，
  // 把引文也纳入扫描会让这条红线在第一句真实引文上就变成假红，然后被人改松。
  {
    const problems = [];
    const doc = JSON.parse(fs.readFileSync(path.join(OUT, 'source-health.json'), 'utf8'));
    const byName = new Map((doc.sources || []).map(row => [row.name, row]));

    const budget = provenance.budgetOf(payload.deals);
    if (budget.chars > provenance.EVIDENCE_TOTAL_BUDGET_CHARS) {
      problems.push(`引文字符 ${budget.chars} 超过全库预算 ${provenance.EVIDENCE_TOTAL_BUDGET_CHARS}`);
    }
    if (budget.maxLength > provenance.MAX_EVIDENCE_QUOTE_LENGTH) {
      problems.push(`单条引文 ${budget.maxLength} 字，超过 ${provenance.MAX_EVIDENCE_QUOTE_LENGTH} 字上限`);
    }
    if (budget.maxPerDeal > provenance.MAX_EVIDENCE_ITEMS) {
      problems.push(`单条记录引文 ${budget.maxPerDeal} 条，超过 ${provenance.MAX_EVIDENCE_ITEMS} 条上限`);
    }

    const rc = loadRenderCore(path.join(OUT, 'index.html'));
    const indexHtml = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
    const wording = audience.parseWordingBlock(audience.extractWordingBlock(indexHtml)) || {};
    const ownWords = Object.keys(wording)
      .filter(group => group.startsWith('SOURCE_'))
      .flatMap(group => Object.values(wording[group] || {}))
      .map(String);
    for (const stamp of provenance.STAMP_PATTERNS) {
      const hit = ownWords.filter(text => stamp.re.test(text));
      if (hit.length) problems.push(`信息来源措辞里出现本站自发的有效性结论（${stamp.why}）：${hit.slice(0, 2).join(' / ')}`);
    }
    const LABELS = wording.SOURCE_LABELS || {};
    const NOTES = wording.SOURCE_NOTES || {};
    const STATE = wording.SOURCE_STATE || {};
    if (!LABELS.sectionTitle || !NOTES.disclaimer) {
      problems.push('产物里的 SOURCE_WORDING 措辞块缺失或不可解析（信息来源块没法校对）');
    }

    let curatedSeen = 0;
    let unavailableSeen = 0;
    let unknownSeen = 0;
    let evidenceSeen = 0;
    for (const deal of payload.deals) {
      const facts = deal.sourceFacts;
      if (!facts || typeof facts !== 'object') {
        problems.push(`${deal.id} 缺少 sourceFacts（派生字段没写进产物）`);
        continue;
      }
      if (!['static', 'headless', 'curated', 'unknown'].includes(facts.method)) {
        problems.push(`${deal.id} 的 sourceFacts.method 非法（${facts.method}）`);
      }
      if (!['official', 'directory', 'curated', 'unknown'].includes(facts.sourceType)) {
        problems.push(`${deal.id} 的 sourceFacts.sourceType 非法（${facts.sourceType}）`);
      }
      if (!['known', 'na', 'unknown', 'unavailable'].includes(facts.lastSuccessState)) {
        problems.push(`${deal.id} 的 sourceFacts.lastSuccessState 非法（${facts.lastSuccessState}）`);
      }

      const row = byName.get(deal.source);
      if (facts.method === 'curated') {
        curatedSeen++;
        if (facts.lastSuccessState !== 'na') {
          problems.push(`${deal.title}: 人工策展条目的 lastSuccessState 应为 na，实得 ${facts.lastSuccessState}`);
        }
      } else if (row) {
        if (facts.sourceId !== row.source) problems.push(`${deal.title}: sourceId ${facts.sourceId} ≠ 心跳 ${row.source}`);
        const expectedMethod = row.kind === 'headless' ? 'headless' : 'static';
        if (facts.method !== expectedMethod) problems.push(`${deal.title}: 采集方式 ${facts.method} ≠ 心跳 ${row.kind}`);
        if ((facts.lastSuccessAt || null) !== (row.lastSuccessAt || null)) {
          problems.push(`${deal.title}: 最近成功采集与心跳不一致`);
        }
      } else if (facts.lastSuccessState === 'known' || facts.lastSuccessState === 'na') {
        problems.push(`${deal.title}: 来源「${deal.source}」不在心跳里，却报告 ${facts.lastSuccessState}`);
      } else if (facts.lastSuccessState === 'unavailable') {
        unavailableSeen++;
      } else {
        unknownSeen++;
      }

      // 渲染器实际产出：必须成块、必须带免责句、缺失状态必须各自说出口
      const block = rc.sourceBlockHtml(deal);
      if (!block.includes(LABELS.sectionTitle)) problems.push(`${deal.title}: 信息来源块没有标题`);
      if (!block.includes(NOTES.disclaimer)) problems.push(`${deal.title}: 信息来源块没有免责句`);
      if (!block.includes(LABELS.lastSuccess)) problems.push(`${deal.title}: 缺少「最近成功采集」一行`);
      if (facts.lastSuccessState === 'na' && !block.includes(STATE.na)) {
        problems.push(`${deal.title}: 人工策展没有显示「${STATE.na}」`);
      }
      if (facts.lastSuccessState === 'unavailable' && !block.includes(STATE.unavailable)) {
        problems.push(`${deal.title}: 心跳不可用没有显示「${STATE.unavailable}」`);
      }
      if (facts.lastSuccessState === 'unknown' && !block.includes(STATE.unknown)) {
        problems.push(`${deal.title}: 来源未知没有显示「${STATE.unknown}」`);
      }
      // ⚠️ 这条是**实测补的**：第一版漏了它，于是「state 归一不认识 known」把每一条真的采到了
      // 的记录都渲染成「未知」，而上面那三条断言全绿 —— 页面看起来完全正常。
      if (facts.lastSuccessState === 'known' && !/<time datetime="[^"]+">/.test(block)) {
        problems.push(`${deal.title}: 最近成功采集是 known，却没有渲染出 <time>`);
      }
      if (/已核验/.test(block)) problems.push(`${deal.title}: 信息来源块里出现「已核验」（本站不给自己盖章）`);

      // 推理 note 也是我们自己写的字，同样不许变成有效性承诺
      const notes = deal.provenance && deal.provenance.fields
        ? Object.values(deal.provenance.fields).map(item => item && item.note).filter(Boolean) : [];
      for (const stamp of provenance.STAMP_PATTERNS) {
        const hit = notes.filter(text => stamp.re.test(text));
        if (hit.length) problems.push(`${deal.title}: 推理 note 里出现有效性承诺（${stamp.why}）`);
      }

      const evidence = Array.isArray(deal.evidence) ? deal.evidence : [];
      if (evidence.length) {
        evidenceSeen++;
        for (const item of evidence) {
          if (Array.from(String(item.quote)).length > provenance.MAX_EVIDENCE_QUOTE_LENGTH) {
            problems.push(`${deal.title}: 引文超长`);
          }
          if (!block.includes('dsrc-quote')) problems.push(`${deal.title}: 引文没有渲染出来`);
        }
      }
    }

    // 静态详情页也要有这一块（它由同一个 detailHtml 渲染，但**写盘路径不同**，
    // 断言必须落在产物文件上，而不是「我调用了同一个函数」这句自证上）。
    const dealIds = payload.deals.filter(deal => deal.type === 'deal' && deal.id).map(deal => deal.id);
    const missingPages = dealIds.filter(id => !fs.existsSync(path.join(OUT, 'deal', id, 'index.html')));
    if (missingPages.length) problems.push(`缺少详情页 ${missingPages.length} 个`);
    else if (dealIds.length && LABELS.sectionTitle) {
      const sample = fs.readFileSync(path.join(OUT, 'deal', dealIds[0], 'index.html'), 'utf8');
      if (!sample.includes(LABELS.sectionTitle)) problems.push('详情页里没有信息来源块');
    }

    if (problems.length) fail(`信息来源（v1.3）：${problems.slice(0, 6).join('；')}`);
    else {
      console.log(`  ✓ 信息来源: ${payload.deals.length} 条记录逐个与心跳对账一致（有引文 ${evidenceSeen} 条 · ` +
        `人工策展 ${curatedSeen} 条显示「${STATE.na}」 · 来源未知 ${unknownSeen} 条 · ` +
        `心跳不可用 ${unavailableSeen} 条）`);
    }
  }

  // ---- v1.4：变更记录（history）--------------------------------------------
  //
  // 这一层的坏法全部是「页面看起来正常」：注入漏了 → 每条都显示「暂无变更记录」；
  // 注入的不是日志里那一段 → 页面显示一段谁也没写过的历史。所以这里做三件事：
  //   ① 源数据里不许有 history（派生字段不得回流）；
  //   ② 注入的每条必须**逐字节等于**日志里该 id 的最近 N 条，且 dist/deal-history.json 与源日志一致；
  //   ③ 渲染器实际产出的 HTML 必须：有事件的列出事件、无事件的明说「暂无变更记录」、且措辞与后端逐项同源。
  {
    const problems = [];
    const sourceDoc = JSON.parse(fs.readFileSync(path.join(ROOT, 'deals.json'), 'utf8'));
    for (const deal of sourceDoc.deals || []) {
      if (deal && Object.prototype.hasOwnProperty.call(deal, 'history')) {
        problems.push(`源 deals.json 里出现了构建期派生字段 history（${deal.id}）`);
        break;
      }
    }

    const store = history.load();
    if (store.missing || store.broken) {
      problems.push(`历史日志不可用（${store.broken || '文件缺失'}）`);
    } else {
      const bytes = fs.statSync(store.file).size;
      const today = (payload.updatedAt || '').slice(0, 10) || undefined;
      problems.push(...history.verifyStore(store.store, payload.deals, { today, bytes }).slice(0, 4));

      const distLogPath = path.join(OUT, 'deal-history.json');
      if (!fs.existsSync(distLogPath)) problems.push('缺少产物 deal-history.json');
      else if (fs.readFileSync(distLogPath, 'utf8') !== `${JSON.stringify(store.store, null, 2)}\n`) {
        problems.push('产物 deal-history.json 与源历史日志不一致');
      }

      let withEvents = 0;
      let injected = 0;
      for (const deal of payload.deals) {
        const expected = history.historyFor(store.store, deal.id);
        const actual = deal.history || null;
        if (JSON.stringify(expected) !== JSON.stringify(actual)) {
          problems.push(`${deal.id}: 注入的 history 与日志不一致（期望 ${expected ? expected.total : 'null'} 条）`);
          break;
        }
        if (actual) { injected++; withEvents += actual.events.length; }
      }

      const indexHtml = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
      const wording = audience.parseWordingBlock(audience.extractWordingBlock(indexHtml)) || {};
      for (const group of Object.keys(history.HISTORY_WORDING)) {
        const expected = history.HISTORY_WORDING[group];
        const actual = wording[group];
        if (!actual || typeof actual !== 'object') { problems.push(`产物里缺措辞组 ${group}`); continue; }
        for (const key of Object.keys(expected)) {
          if (actual[key] !== expected[key]) problems.push(`${group}.${key}：前端「${actual[key]}」≠ 后端「${expected[key]}」`);
        }
      }
      const sinceTemplate = wording.HISTORY_LABELS && wording.HISTORY_LABELS.since;
      if (!sinceTemplate || !sinceTemplate.includes('{date}')) problems.push('「变更记录自 {date} 起」模板丢了槽位（退化成写死的一句话）');
      const moreTemplate = wording.HISTORY_LABELS && wording.HISTORY_LABELS.more;
      if (!moreTemplate || !moreTemplate.includes('{n}')) problems.push('「另有 {n} 条更早的记录」模板丢了槽位');

      const sampleWith = payload.deals.find(deal => deal.history && deal.history.events.length);
      const sampleWithout = payload.deals.find(deal => !deal.history);
      const rc = loadRenderCore(path.join(OUT, 'index.html'));
      if (sampleWith) {
        const block = rc.historyBlockHtml(sampleWith);
        if (!block.includes('data-hist-type=')) problems.push('有变更记录的条目没有渲染出事件行');
        if (!block.includes(String(sampleWith.history.total))) problems.push('变更记录块没有带上总条数');
        if (/已核验|100% 有效/.test(block)) problems.push('变更记录块里出现本站自发的有效性结论');
      }
      if (sampleWithout) {
        const block = rc.historyBlockHtml(sampleWithout);
        if (!block.includes(wording.HISTORY_LABELS.empty)) problems.push('无变更记录的条目没有明说「暂无变更记录」（空白冒充「没有变化」）');
        if (!block.includes(wording.HISTORY_NOTES.emptyNote)) problems.push('无变更记录的条目缺少「起算日之前没有历史」的说明');
        if (!block.includes('data-hist-total="0"')) problems.push('无变更记录的条目缺少 data-hist-total="0"');
      }
      if (!sampleWith) console.log(`    ℹ️  本次历史里还没有任何事件（起算日 ${store.store.startedAt}）——「有事件」那条断言本轮没有样本`);

      // 静态详情页（写盘路径与本函数不同）必须也带上这一块
      const firstDealId = (payload.deals.find(deal => deal.type === 'deal') || {}).id;
      if (firstDealId) {
        const page = path.join(OUT, 'deal', firstDealId, 'index.html');
        if (fs.existsSync(page)) {
          const html = fs.readFileSync(page, 'utf8');
          if (!html.includes(wording.HISTORY_LABELS.sectionTitle)) problems.push('详情页里没有变更记录块');
        }
      }

      if (problems.length) fail(`变更记录（v1.4）：${problems.slice(0, 6).join('；')}`);
      else {
        console.log(`  ✓ 变更记录: 日志 ${history.eventsOf(store.store).length} 条事件注入 ${injected} 条记录` +
          `（共 ${withEvents} 条渲染事件）· 起算日 ${store.store.startedAt} · 措辞与后端逐项同源`);
      }
    }
  }

  // ---- v1.5：变化雷达（首页条带 + /changes/ 静态页）-------------------------
  //
  // 这一层的坏法全部是「页面看起来正常」：条带注入漏了 → 首页那一行变成一句空态；
  // 窗口算错 → 三天前新增的条目哪儿都不显示；链接前缀写错 → 页面全对而内链全 404；
  // 措辞被人顺手改了 → 两处的说法开始分家。所以这里不是「文件存在就算过」，
  // 而是**三方对账**：条带 ↔ /changes/ 页 ↔ 日志与记录。
  if (!built.radar) {
    fail('变化雷达：assemble() 没有把 radar 交给自检（自检无法对账）');
  } else {
    const problems = [];
    const radar = built.radar;
    const W = changes.CHANGES_WORDING;
    const SECTION_KEYS = changes.SECTION_ORDER;
    const rc = loadRenderCore(path.join(OUT, 'index.html'));
    const indexHtml = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
    const strip = (indexHtml.match(/<nav class="radar"[\s\S]*?<\/nav>/) || [''])[0];
    const pageFile = path.join(OUT, 'changes', 'index.html');
    const highValueTotal = SECTION_KEYS.reduce((sum, key) => sum + (Number(radar.totals[key]) || 0), 0);

    // ① 首页条带：存在、总数与分栏一致、只有链接没有控件、入口在横滑区外
    if (!strip) {
      problems.push('首页没有变化雷达条带（预渲染标记没被替换？）');
    } else {
      const total = (strip.match(/data-radar-total="(\d+)"/) || [])[1];
      const other = (strip.match(/data-radar-other="(\d+)"/) || [])[1];
      if (total !== String(highValueTotal)) problems.push(`条带 data-radar-total=${total} ≠ 分栏合计 ${highValueTotal}`);
      if (other !== String(radar.totals.other)) problems.push(`条带 data-radar-other=${other} ≠ 其他变化 ${radar.totals.other}`);
      if (/<(button|input|select)\b/i.test(strip)) problems.push('条带里出现了 JS 控件（无 JS 时就是死按钮）');
      if (!/class="rmore" href="changes\/"/.test(strip)) problems.push('条带缺少指向 /changes/ 的入口（或前缀写错）');
      const scrollEnd = strip.indexOf('</div>');
      const moreAt = strip.indexOf('class="rmore"');
      if (moreAt >= 0 && scrollEnd >= 0 && moreAt < scrollEnd) {
        problems.push('「全部变化」入口落在横滑容器里（窄屏上会被滑走）');
      }
      // 条带里的条目必须**逐项等于** radar.home（顺序也算：优先级的唯一出处是 changes.HOME_PRIORITY）
      const stripIds = [...strip.matchAll(/class="ritem" data-deal-id="([0-9a-f]+)"/g)].map(m => m[1]);
      const homeIds = radar.home.items.map(item => item.id);
      if (JSON.stringify(stripIds) !== JSON.stringify(homeIds)) {
        problems.push(`条带条目与 radar.home 不一致（条带 ${stripIds.join(',') || '空'} / 数据 ${homeIds.join(',') || '空'}）`);
      }
      if (!radar.home.items.length && !/class="rnone"/.test(strip)) problems.push('条带没有条目时也没有明确空态');
    }

    // ② 覆盖不变量：窗口内的事件必须**一条不漏**地出现在某个分栏或「其他变化」里。
    //    这是拿日志直接算的（不是拿 radar 自证），因此能抓住「buildRadar 把某类事件丢了」。
    if (radar.availability === 'ok') {
      const store = history.load();
      const events = history.eventsOf(store.store);
      const recentFrom = changes.addDays(radar.asOf, -(changes.WINDOWS.recentDays - 1));
      const endedFrom = changes.addDays(radar.asOf, -(changes.WINDOWS.endedDays - 1));
      const inRecent = events.filter(event => event.at >= recentFrom && event.at <= radar.asOf);
      const olderLifecycle = events.filter(event =>
        (event.type === 'ended' || event.type === 'restored') && event.at >= endedFrom && event.at < recentFrom);
      // ⚠️ 只数**事件**来源的分栏：`endingSoon` 是状态量（由 deals.json 的 expiresAt 现算），
      // 它不对应日志里的任何一条事件 —— 把它算进覆盖数会让这条不变量永远差几条。
      // 这条是演练抓出来的（非空数据上才暴露，空态下恒等于 0 看不出来）。
      const covered = ['created', 'changed', 'ended', 'restored']
        .reduce((sum, key) => sum + (Number(radar.totals[key]) || 0), 0) + (Number(radar.totals.other) || 0);
      if (covered !== inRecent.length + olderLifecycle.length) {
        problems.push(`覆盖不变量不成立：日志窗口内 ${inRecent.length + olderLifecycle.length} 条事件，` +
          `雷达只覆盖了 ${covered} 条（分栏 ${['created', 'changed', 'ended', 'restored'].map(k => `${k} ${radar.totals[k]}`).join(' + ')} + 其他 ${radar.totals.other}）`);
      }
      // 已离开数据集的条目：要么有详情页可链，要么**没有**链接（不许有半条死链）
      const dealDirs = fs.existsSync(path.join(OUT, 'deal')) ? new Set(fs.readdirSync(path.join(OUT, 'deal'))) : new Set();
      const dangling = SECTION_KEYS
        .flatMap(key => radar.sections[key].items)
        .filter(item => item.href && !dealDirs.has(item.id));
      if (dangling.length) problems.push(`雷达指向了不存在的详情页: ${dangling.slice(0, 3).map(i => i.id).join(', ')}`);
    }

    // ③ /changes/ 页：五条约定（预渲染 / 无 JS 可读 / sitemap / 双 feed / JSON-LD）
    if (!fs.existsSync(pageFile)) {
      problems.push('缺少 changes/index.html');
    } else {
      const page = fs.readFileSync(pageFile, 'utf8');
      const noScript = page.replace(/<script[\s\S]*?<\/script>/gi, '');
      if (!page.includes(`<link rel="canonical" href="${SITE_URL}changes/">`)) problems.push('changes/ 的 canonical 不是自指');
      if (!page.includes('href="../feed/changes.xml"') || !page.includes('href="../feed/changes.json"')) {
        problems.push('changes/ 没有声明**变化**订阅源（v1.6 起这一页订的是变化本身，不是全量优惠）');
      }
      if (/__[A-Z_]+_HREF__/.test(page)) problems.push('changes/ 残留路由占位符');
      let ldTypes = [];
      try {
        ldTypes = [...page.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
          .map(m => JSON.parse(m[1])['@type']);
      } catch (error) {
        problems.push(`changes/ JSON-LD 解析失败: ${error.message}`);
      }
      const expectedLd = ['BreadcrumbList', 'CollectionPage', 'ItemList'];
      if (JSON.stringify(ldTypes.slice().sort()) !== JSON.stringify(expectedLd)) {
        problems.push(`changes/ JSON-LD 集合不是恰好 [${expectedLd.join(', ')}]，实得 [${ldTypes.slice().sort().join(', ')}]`);
      }
      // 分栏标题与总数必须来自权威表（标题在 CHANGES_SECTION，条数在 totals）
      for (const key of SECTION_KEYS) {
        const heading = W.CHANGES_SECTION[key] + '（' + (Number(radar.totals[key]) || 0) + '）';
        if (!noScript.includes(heading)) problems.push(`changes/ 缺少分栏标题「${heading}」`);
      }
      if (!noScript.includes(W.CHANGES_LABELS.other)) problems.push('changes/ 缺少「不计入高价值的其他变化」块');
      if (!noScript.includes(changes.CHANGES_WORDING.CHANGES_NOTES.soonBasis)) problems.push('changes/ 缺少「即将结束」的判据说明');
      if (!noScript.includes(history.HISTORY_WORDING.HISTORY_NOTES.disclaimer)) problems.push('changes/ 缺少固定免责句');
      // 空态必须按原因分开说：数据里一条截止日期都没有 ≠ 有但都不在窗口内
      const emptySoon = radar.coverage.dealsWithExpiresAt === 0
        ? W.CHANGES_EMPTY.endingSoonNone
        : W.CHANGES_EMPTY.endingSoonLater.replace('{n}', String(radar.coverage.dealsWithExpiresAt))
          .replace('{days}', String(radar.windows.soonDays));
      if (!radar.sections.endingSoon.items.length && !noScript.includes(emptySoon)) {
        problems.push('changes/ 的「即将结束」空态没有说清是哪种空（数据缺口 vs 窗口内没有）');
      }
      // 行 ↔ 数据双向对账：页面上的详情页链接集合 == 可链接条目集合。
      // ⚠️ 折叠块（其他变化）里的行**也会**链到详情页 —— 只数五个分栏会误报「多了几条」。
      const allItems = SECTION_KEYS.flatMap(key => radar.sections[key].items)
        .concat(radar.other.cosmetic || [], radar.other.metadata || []);
      const onPage = new Set([...noScript.matchAll(/href="\.\.\/deal\/([^/"]+)\/"/g)].map(m => decodeURIComponent(m[1])));
      const linkable = new Set(allItems.filter(item => item.href).map(item => item.id));
      const missing = [...linkable].filter(id => !onPage.has(id));
      const extra = [...onPage].filter(id => !linkable.has(id));
      if (missing.length) problems.push(`changes/ 漏了 ${missing.length} 条可链接条目（如 ${missing.slice(0, 3).join(', ')}）`);
      if (extra.length) problems.push(`changes/ 多了 ${extra.length} 条不在雷达里的链接（如 ${extra.slice(0, 3).join(', ')}）`);

      // ---- 行 ↔ ItemList 双向对账（v1.5 修复 P1-4 / F-r1-history-ai-001）------------
      //
      // 三份集合必须**逐条相等**，缺一不可：
      //   ① 判据层去重后的可链接集合（`changes.itemListRecords()`，唯一出处）；
      //   ② 页面 ItemList 的成员（从磁盘回读 JSON-LD，不信内存里那一段）；
      //   ③ 页面上的 `data-item` 行（SEO 门禁数的就是它）。
      // 修复前这三份各算各的（声明数取五栏 totals、元素按栏遍历不去重、行标记根本没有），
      // 只要有 1 条变化就必然对不上 —— 而这一页在生产数据上恒为 0 条，所以从未暴露。
      {
        const expectedIds = (built.changesItemList || []).map(record => record.id);
        const markers = [...noScript.matchAll(/data-item="([^"]*)"/g)].map(m => decodeEntities(m[1]));
        const list_ = seo.itemListOf(seo.jsonLdBlocks(page).blocks);
        if (!list_) {
          problems.push('changes/ 没有 ItemList 结构化数据（page-kinds 对 changes 声明它在场）');
        } else {
          const ids = list_.elements.map(element => {
            const rel = String(element.url || '').replace(SITE_URL, '');
            const match = rel.match(/^deal\/([^/]+)\/$/);
            return match ? decodeURIComponent(match[1]) : `（非法 url：${element.url}）`;
          });
          if (Number(list_.numberOfItems) !== list_.elements.length) {
            problems.push(`changes/ ItemList 声明 ${list_.numberOfItems} 项，实际发出 ${list_.elements.length} 项`);
          }
          if (list_.elements.length !== expectedIds.length) {
            problems.push(`changes/ ItemList ${list_.elements.length} 项 ≠ 去重后的可链接记录 ${expectedIds.length} 条`);
          }
          if (new Set(ids).size !== ids.length) {
            const dup = ids.filter((id, index) => ids.indexOf(id) !== index);
            problems.push(`changes/ ItemList 里同一记录出现多次（${[...new Set(dup)].slice(0, 3).join(', ')}）`);
          }
          const same = (a, b) => a.length === b.length && a.every(id => b.includes(id));
          if (!same(ids, expectedIds)) {
            const onlyList = ids.filter(id => !expectedIds.includes(id));
            const onlyJudge = expectedIds.filter(id => !ids.includes(id));
            problems.push(`changes/ ItemList 成员与判据集合不一致（多 ${onlyList.length} / 少 ${onlyJudge.length}：` +
              `${[...onlyList, ...onlyJudge].slice(0, 3).join(', ')}）`);
          }
          if (markers.length !== list_.elements.length) {
            problems.push(`changes/ 页面 ${markers.length} 个 data-item 行 ≠ ItemList ${list_.elements.length} 项`);
          }
          if (new Set(markers).size !== markers.length) {
            problems.push(`changes/ 页面上的 data-item 有重复（一个记录应当只有一行代表）`);
          }
          if (!same(markers, ids)) {
            const stray = markers.filter(id => !ids.includes(id));
            problems.push(`changes/ ItemList 成员在本页可见行里找不到对应行（${stray.slice(0, 3).join(', ') || '行集合不同'}）`);
          }
          for (const id of markers) {
            if (!onPage.has(id)) problems.push(`changes/ data-item 行 ${id} 在页面上没有对应链接（行与链接分了家）`);
          }
        }
      }
      // 预渲染正文（无 JS 可读）。阈值按「固定说明 + 每条 40 字」估：实测空态页约 900 字，
      // 每条事件行约 40–120 字。取 700 的下限只为拦住「渲染路径断了」这类坏法。
      const text = prerenderedText(page);
      const floor = 700 + 40 * (highValueTotal + radar.totals.other);
      if (text.length < floor) problems.push(`changes/ 预渲染正文过短（${text.length} 字 < ${floor}）`);
      // 其它变化必须**显式列出**（不是悄悄丢掉）
      if (radar.totals.other > 0 && !noScript.includes('class="chgother"')) problems.push('有其他变化却没有列出折叠块');

      // ---- v2.3：套餐变化块（同一页的第二个事实面）---------------------------------
      //
      // 三条：① 锚点导航与 #plans / #deals 落点都在；② 四栏标题与条数来自套餐雷达
      // （权威表是 `plan-changes.js`）；③ 块里列出的变化条数 == 雷达条数（不许少一条）。
      const planW = planChanges.PLAN_CHANGES_WORDING;
      if (!page.includes('class="chgjump"')) problems.push('changes/ 缺少「优惠变化 / 套餐变化 / API 价格变化」锚点导航');
      if (!page.includes('id="deals"') || !page.includes('id="plans"')) problems.push('changes/ 的锚点导航没有落点（#deals / #plans）');
      // v3.0 Stage H1：三条变化流必须**都能从导航直达**（读者要能区分它们，而不是滚到一起）。
      for (const [href, label] of [['#deals', '优惠变化'], ['#plans', '套餐变化'], ['#api-plans', 'API 价格变化']]) {
        if (!page.includes(`href="${href}"`)) problems.push(`changes/ 的锚点导航缺少「${label}」（${href}）`);
      }
      if (!page.includes(`href="../feed/plans/coding/changes.xml"`)) {
        problems.push('changes/ 没有声明套餐变化订阅源');
      }
      if (!noScript.includes(planW.PLAN_CHANGES_LABELS.sectionTitle)) problems.push('changes/ 缺少「套餐变化」分栏标题');
      const planBlock = (noScript.match(/<section class="chgsec pchanges" id="plans">[\s\S]*?<\/section>/) || [])[0] || '';
      if (!planBlock) problems.push('changes/ 缺少套餐变化块');
      else {
        for (const key of planChanges.PLAN_CHANGES_SECTION_ORDER) {
          const heading = planW.PLAN_CHANGES_SECTION[key] + '（' + (Number(built.planRadar.totals[key]) || 0) + '）';
          if (!planBlock.includes(heading)) problems.push(`套餐变化块缺少分栏标题「${heading}」`);
        }
        const listed = (planBlock.match(/<li>/g) || []).length;
        const expected = planChanges.PLAN_CHANGES_SECTION_ORDER
          .reduce((sum, key) => sum + built.planRadar.sections[key].items.length, 0);
        if (listed !== expected) problems.push(`套餐变化块列出 ${listed} 条 ≠ 雷达 ${expected} 条`);
        // 句子要用与渲染层同一份上下文（币种 / 额度单位从套餐记录里取），否则会写出「20 → 10」
        const planSentenceOpts = {
          plansById: new Map(JSON.parse(fs.readFileSync(path.join(OUT, 'plans.json'), 'utf8')).plans.map(p => [p.id, p])),
          providerTable: providers.load().table
        };
        for (const item of planChanges.itemsOf(built.planRadar)) {
          const sentence = plansPage.escapeHtml(plansPage.planChangeTextOf(item, planSentenceOpts));
          if (!planBlock.includes(sentence)) problems.push(`套餐变化块缺少一条变化：「${sentence}」`);
        }
        if (built.planRadar.availability !== 'ok' && !planBlock.includes(planW.PLAN_CHANGES_LABELS.unavailable)) {
          problems.push('套餐变化日志不可用时没有说清「没有拿到日志」');
        }
        // 深链锚点：每一条套餐变化都要能落到套餐对比页的那一行上
        const plansPageHtml = fs.readFileSync(path.join(OUT, plansPage.PLANS_ROUTE, 'index.html'), 'utf8');
        const anchors = [...planBlock.matchAll(/href="#plan-([0-9a-f]{12})"/g)].map(m => m[1]);
        const dangling = anchors.filter(id => !plansPageHtml.includes(`id="plan-${id}"`));
        if (dangling.length) problems.push(`套餐变化块里有 ${dangling.length} 条锚点没有落点（如 ${dangling[0]}）`);
      }

      // ---- v3.0 Stage H1：API 价格变化块（同一页的第三个事实面）-----------------------
      //
      // 与套餐那一段逐条对应，另外多两条这一支特有的：
      //   · 链接**跨页**落到 `/plans/api/#plan-<id>`（这一页上没有 API 表格行）；
      //   · 判据来自 `api-plan-history`（`built.apiPlanRadar`），没有第二套变化检测。
      const apiW = planChanges.API_PLAN_CHANGES_WORDING;
      if (!page.includes(`id="api-plans"`)) problems.push('changes/ 缺少 API 价格变化块的锚点落点（#api-plans）');
      if (!page.includes(`href="../feed/plans/api/changes.xml"`)) {
        problems.push('changes/ 没有声明 API 价格变化订阅源');
      }
      if (!noScript.includes(apiW.API_PLAN_CHANGES_LABELS.sectionTitle)) {
        problems.push('changes/ 缺少「API 价格变化」分栏标题');
      }
      const apiBlock = (noScript.match(/<section class="chgsec apichanges" id="api-plans">[\s\S]*?<\/section>/) || [])[0] || '';
      if (!apiBlock) problems.push('changes/ 缺少 API 价格变化块');
      else {
        for (const key of planChanges.PLAN_CHANGES_SECTION_ORDER) {
          const heading = apiW.API_PLAN_CHANGES_SECTION[key] + '（' + (Number(built.apiPlanRadar.totals[key]) || 0) + '）';
          if (!apiBlock.includes(heading)) problems.push(`API 价格变化块缺少分栏标题「${heading}」`);
        }
        const listedApi = (apiBlock.match(/<li>/g) || []).length;
        const expectedApi = planChanges.PLAN_CHANGES_SECTION_ORDER
          .reduce((sum, key) => sum + built.apiPlanRadar.sections[key].items.length, 0);
        if (listedApi !== expectedApi) problems.push(`API 价格变化块列出 ${listedApi} 条 ≠ 雷达 ${expectedApi} 条`);
        // 句子必须与订阅正文/`/plans/api/` 是同一句（同一个函数渲染，两边不可能分家）
        for (const item of planChanges.itemsOf(built.apiPlanRadar)) {
          const sentence = apiPlansPage.escapeHtml(apiPlansPage.apiPlanChangeTextOf(item));
          if (sentence && !apiBlock.includes(sentence)) problems.push(`API 价格变化块缺少一条变化：「${sentence}」`);
        }
        if (built.apiPlanRadar.availability !== 'ok'
          && !apiBlock.includes(apiW.API_PLAN_CHANGES_LABELS.unavailable)) {
          problems.push('API 计费变化日志不可用时没有说清「没有拿到日志」');
        }
        // 跨页深链：每一条 API 变化都要落到 **/plans/api/** 的那一行上（不是本页锚点）
        const apiPageHtml = fs.readFileSync(path.join(OUT, apiPlansPage.API_PLANS_ROUTE, 'index.html'), 'utf8');
        const apiAnchors = [...apiBlock.matchAll(/href="\.\.\/plans\/api\/#plan-([0-9a-f]{12})"/g)].map(m => m[1]);
        const apiDangling = apiAnchors.filter(id => !apiPageHtml.includes(`id="plan-${id}"`));
        if (apiDangling.length) problems.push(`API 价格变化块里有 ${apiDangling.length} 条跨页锚点没有落点（如 ${apiDangling[0]}）`);
        if (expectedApi > 0 && apiAnchors.length !== expectedApi) {
          problems.push(`API 价格变化块的跨页深链 ${apiAnchors.length} 条 ≠ 变化 ${expectedApi} 条（有行没有链接）`);
        }
      }
    }

    // ④ 措辞同源：前端那份受控副本与 lib/changes.js 的权威表逐项比对
    const wording = audience.parseWordingBlock(audience.extractWordingBlock(indexHtml)) || {};
    for (const group of Object.keys(W)) {
      const expected = W[group];
      const actual = wording[group];
      if (!actual || typeof actual !== 'object') { problems.push(`产物里缺 ${group}（变化雷达的措辞副本没了）`); continue; }
      for (const key of Object.keys(expected)) {
        if (actual[key] !== expected[key]) problems.push(`${group}.${key}：前端「${actual[key]}」≠ 权威表「${expected[key]}」`);
      }
    }
    // 模板必须真的带槽位（有人把 {date} / {n} 删掉、改成写死一句话时，两端字符串仍然「相等」）
    for (const [group, key] of [['CHANGES_LABELS', 'base'], ['CHANGES_LABELS', 'more'], ['CHANGES_LABELS', 'homeEmptyShort'], ['CHANGES_EMPTY', 'endingSoonLater'], ['CHANGES_SOON', 'days']]) {
      if (!String(W[group][key]).includes('{')) problems.push(`${group}.${key} 的槽位丢了（退化成写死的一句话）`);
    }

    // ⑤ 红线：我们**自己写的字**里不许出现本站自发的有效性结论（数据里的原文不扫）
    const ownWords = Object.keys(wording)
      .filter(group => group.startsWith('CHANGES_') || group.startsWith('HISTORY_'))
      .flatMap(group => Object.values(wording[group] || {}))
      .map(String);
    for (const stamp of provenance.STAMP_PATTERNS) {
      const hit = ownWords.filter(value => stamp.re.test(value));
      if (hit.length) problems.push(`雷达措辞里出现本站自发的有效性结论（${stamp.why}）：${hit.slice(0, 2).join(' / ')}`);
    }

    // ⑥ 「不可用」与「没有变化」必须是两句不同的话（拿渲染器直接断言，不靠人读代码）
    const unavailableRadar = changes.buildRadar({ deals: [], store: null, asOf: radar.asOf, availability: 'unavailable' });
    const unavailableStrip = rc.changesStripHtml(unavailableRadar);
    const unavailablePage = rc.changesPageHtml(unavailableRadar, '../');
    if (!unavailableStrip.includes(W.CHANGES_NOTES.unavailable) || !unavailablePage.includes(W.CHANGES_NOTES.unavailable)) {
      problems.push('历史日志不可用时，条带或页面没有明说「没有拿到历史日志」');
    }
    if (unavailablePage.includes(W.CHANGES_EMPTY.created)) problems.push('日志不可用时页面用「没有变化」冒充了「不可用」');

    if (problems.length) fail(`变化雷达（v1.5）：${problems.slice(0, 6).join('；')}`);
    else {
      console.log(`  ✓ 变化雷达: 条带 ${radar.home.items.length} 项 / 分栏合计 ${highValueTotal} 条 · 其他 ${radar.totals.other} 条` +
        ` · /changes/ 五栏 + 折叠块齐 · 覆盖不变量成立 · 措辞与 lib/changes.js 逐项同源`);
    }
  }

  // 数据源状态页：与 source-health.json 逐个来源对账（状态标签、条数、行数），
  // 而不是只看「文件存在」——状态页最容易的坏法是「页面上写着正常，数据里其实是失败」。
  const statusFile = path.join(OUT, 'status', 'index.html');
  if (!fs.existsSync(statusFile)) fail('缺少 status/index.html');
  else {
    const page = fs.readFileSync(statusFile, 'utf8');
    const doc = JSON.parse(fs.readFileSync(path.join(OUT, 'source-health.json'), 'utf8'));
    const summary = health.summarize(doc);
    const rows = [...page.matchAll(/<span class="stt ([a-z]+)">/g)].map(m => m[1]);
    const problems = [];
    if (summary.total !== built.healthSources) {
      problems.push(`来源数不一致：产物里 ${rows.length} 行 / 数据里 ${summary.total} 个`);
    }
    for (const row of summary.rows) {
      const expected = health.STATUS_LABEL[row.status];
      if (!page.includes(expected)) problems.push(`${row.source} 的状态标签 ${expected} 不在页面上`);
    }
    const expectedStatuses = summary.rows.map(row => row.status).sort().join(',');
    if (rows.slice().sort().join(',') !== expectedStatuses) {
      problems.push(`状态序列不一致：页面 ${rows.join(',')} / 数据 ${expectedStatuses}`);
    }
    if (summary.total > 0 && !/<time datetime="[^"]*"/.test(page)) {
      problems.push('状态页没有任何 <time datetime>（无 JS 时可读性依赖它）');
    }
    if (summary.total === 0 && !/还没有采集记录/.test(page)) {
      problems.push('没有采集数据时，状态页必须明说，而不是给一张空表');
    }
    if (!page.includes('source-health.json')) problems.push('状态页没有指向 source-health.json 的链接');

    // ── 五条既有约定：这一页原先只满足两条（预渲染、无 JS 可读）────────────────
    //
    // 为什么必须在这里断言：sitemap / feed / JSON-LD 三条当时根本没做，而
    // **没有任何东西会因此变红** —— 连 `verify-site.js` 都 0 处覆盖（子代理核查结论）。
    // 一条「写漏了不会红」的约定等于没有这条约定：它靠记性维持，而记性不随构建变红。
    // 分类页那三条能站住，靠的就是这一段形状的自检 + 浏览器侧各一条断言。
    if (!page.includes(`<link rel="canonical" href="${SITE_URL}status/">`)) problems.push('canonical 不是自指');
    if (!page.includes('href="../feed.xml"') || !page.includes('href="../feed.json"')) {
      problems.push('没有声明两个订阅源');
    }
    let statusLd = [];
    try {
      statusLd = [...page.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
        .map(m => JSON.parse(m[1])['@type']);
    } catch (error) {
      problems.push(`JSON-LD 解析失败: ${error.message}`);
    }
    for (const need of ['WebPage', 'BreadcrumbList']) {
      if (!statusLd.includes(need)) problems.push(`缺少 JSON-LD ${need}`);
    }
    // 「多了」也要拦，而且要拦得完整（重复的 WebPage 也算多）。
    //
    // §10.4.1 明确写了这一页**不发** Dataset / ItemList，理由是「机器可读的那一份是
    // source-health.json，同一份事实声明两次、两次迟早分家，而分家时没有任何东西会红」。
    // 只断言「包含」的话，那句话本身就是一句没有守卫的承诺 —— 加第三个 JSON-LD
    // （乃至加一个 Dataset）谁都不会发现。独立验证代理指出的正是这一点。
    const STATUS_LD_EXPECTED = ['BreadcrumbList', 'WebPage'];
    const statusLdActual = statusLd.slice().sort();
    if (JSON.stringify(statusLdActual) !== JSON.stringify(STATUS_LD_EXPECTED)) {
      problems.push(`JSON-LD 集合不是恰好 [${STATUS_LD_EXPECTED.join(', ')}]，实得 [${statusLdActual.join(', ')}]`);
    }
    // 预渲染正文的**下限按状态分档**，两个数字都取自实测的**内容**长度（剥掉 style 之后）：
    //   · 9 个来源、表格正常 → 1188 字
    //   · 一个来源都没有（合法状态）→ 646 字，页面明说「还没有采集记录」
    //   · 有来源但**表格没渲染出来** → 约 600 字（页头页脚 + 说明段，表体是空的）
    //
    // 所以「有来源」那一档取 **900**：它必须**高于**表格消失时的字数，否则这条断言
    // 在「表没了」这个最该红的情况下只差几个字就放行（第一版取 600，正好卡在边界上 ——
    // 反证时实测到的）。空数据那一档取 350：它只需证明「页面不是空的」。
    const statusText = prerenderedText(page);
    const statusFloor = summary.total > 0 ? 900 : 350;
    if (statusText.length < statusFloor) {
      problems.push(`预渲染正文过短（内容 ${statusText.length} 字 < ${statusFloor}），无 JS 时读不到内容`);
    }
    // 光有长度不算数：内容里必须真的有那张表。这条与上面的字数是**互相独立**的两件事 ——
    // 字数够而表是空的，说明渲染路径断了；表在而字数不够，说明文案被丢了。
    // ⚠️ 先把 `<script>` 摘掉再取 tbody：本文件自己的纪律是「数标记先摘 script」，
    //    不摘的话，将来某个内联脚本里出现 `<tbody>…<tr>…</tr>…</tbody>` 就会让这条断言
    //    变成**永远为真**的空转（独立验证代理指出这一点）。
    const statusBody = (page.replace(/<script[\s\S]*?<\/script>/gi, '').match(/<tbody>([\s\S]*?)<\/tbody>/) || [])[1] || '';
    if (summary.total > 0 && !/<tr>/.test(statusBody)) {
      problems.push('预渲染正文够长，但 <tbody> 里一行都没有（表格没渲染出来）');
    }
    if (ROUTE_MARKERS.some(marker => page.includes(marker))) problems.push('残留路由占位符');
    if (problems.length) fail(`数据源状态页：${problems.join('；')}`);
    else console.log(`  ✓ 数据源状态: ${summary.total} 个来源与 source-health.json 逐个对账一致` +
      `（正常 ${summary.healthy} · 异常 ${summary.degraded} · 失败 ${summary.failed}）` +
      ` · 五条约定齐（sitemap/canonical/双 feed/JSON-LD ${statusLd.length} 段/预渲染 ${statusText.length} 字）`);
  }

  // 译文必须真的落到产物里：浏览器 fetch('deals.json') 拿的就是这一份，
  // 这里漏写不会报错，只会让线上详情页静悄悄没有中文。
  const zhDeals = payload.deals.filter(deal => deal.zh && Object.keys(deal.zh).length);
  const zhFields = zhDeals.reduce((n, deal) => n + Object.keys(deal.zh).length, 0);
  if (zhDeals.length !== built.zhWithZh) {
    fail(`译文没写进产物：贴了 ${built.zhWithZh} 条，产物里只有 ${zhDeals.length} 条`);
  } else if (zhDeals.length) {
    // 英文原文必须原样保留：译文只能新增字段，不能顶掉原文
    const clobbered = zhDeals.filter((deal, i) => {
      return Object.keys(deal.zh).some(key => {
        const value = deal[key];
        return typeof value !== 'string' || !value.trim();
      });
    });
    if (clobbered.length) fail(`译文顶掉了英文原文: ${clobbered.slice(0, 3).map(d => d.title).join('、')}`);
    else console.log(`  ✓ 中文译文: ${zhDeals.length} 条 / ${zhFields} 个字段（英文原文原样保留）`);
  }
  const markCount = ((fs.readFileSync(path.join(OUT, 'index.html'), 'utf8')
    .replace(/<script[\s\S]*?<\/script>/gi, '').match(/class="zhmark"/g)) || []).length;
  if (zhDeals.length && !markCount) fail('有译文但预渲染卡片上没有「中文」提示');
  if (markCount) console.log(`  ✓ 卡片「中文」提示: 预渲染 ${markCount} 处`);

  // 产物里不该出现源码/依赖/文档
  for (const forbidden of ['scripts', 'node_modules', 'package.json', 'package-lock.json', '.git', '.github', 'PROJECT_STATUS.md', 'README.md']) {
    if (fs.existsSync(path.join(OUT, forbidden))) fail(`产物中不应出现 ${forbidden}`);
  }

  // --- 预渲染与 SEO 自检 ---
  const html = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
  // 内联脚本里含模板字符串字面量（class="go" / data-logo="…" 之类），
  // 数标记时必须先把 <script> 摘掉，否则会把源码当成已渲染的卡片数进去。
  //
  // `<style>` 同样要摘掉，而且**必须**摘：样式注释里写到某个控件标记（例如
  // 「实测 data-fav-prune 只在有失效收藏时出现」）时，标记扫描会把注释当成控件本身——
  // 本次就是这么假失败过一次。这与下面 tier 计数那次踩的是同一个坑
  // （CSS 选择器 `[data-tier="1"] .rnum` 被算成档位角标）：**要数的是元素，不是文本。**
  const markup = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');

  if (/PRERENDER:/.test(html)) fail('产物 index.html 仍残留 PRERENDER 标记');
  if (/__SITE_URL__/.test(html)) fail('产物 index.html 仍残留 __SITE_URL__ 占位');
  {
    // 页脚链接的占位符必须被各自那一份替换掉：残留会变成一条 404 的死链。
    //
    // 扫描面 = **全部输出深度 × 全部路由占位符**（`ROUTE_HREFS` / `ROUTE_MARKERS` 同源）。
    // 原先只查 `__STATUS_HREF__`，而且只抽查首页 / 状态页 / 详情页三处 ——
    // 于是加一条路由时「漏了某一层」不会有任何东西变红，直到有人正好从那一层点页脚。
    // 现在两层都做成结构性检查：漏一层、漏一条路由，都会指名道姓地报出来。
    const indexHtml = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
    const dealDirs = fs.existsSync(path.join(OUT, 'deal')) ? fs.readdirSync(path.join(OUT, 'deal')) : [];
    const routeOutputs = [
      ['index.html', ''],
      ['status/index.html', '../'],
      // v1.5：变化雷达页（浅一层路由）
      ['changes/index.html', '../'],
      // v1.6：订阅中心（同样一层深）
      ['feeds/index.html', '../'],
      // v3.0：/plans/ 资料入口是**一层**路由 —— 深度写错的话这一页的页头/页脚内链全是 404，
      // 而页面本身看起来完全正常，所以它必须进这张逐层扫描表。
      [`${plansHubPage.PLANS_HUB_ROUTE}index.html`, '../'],
      // v3.0 Stage D5/D6：模型索引（一层）与模型详情（两层）。深度由路由段数推导。
      [`${modelsPage.MODELS_INDEX_ROUTE}index.html`, '../'],
      ...built.modelDetailRoutes.map(route => [`${route}index.html`, '../../']),
      // v3.0 Stage F：档案索引（一层）与档案详情（**三层**：`archive/<kind>/<id>/`）。
      // 前缀一律问 `lib/archive.js` 要（`routePrefixOf`）——构建期与渲染层因此只有**一份**深度真相，
      // 不可能再出现「页面写 '../../'、自检也写 '../../'」的镜像错误（审计 F-r1-history-ai-002）。
      [`${archiveLib.ARCHIVE_INDEX_ROUTE}index.html`, '../'],
      ...built.archiveDetailRoutes.map(route => [`${route}index.html`, archiveLib.routePrefixOf(route)]),
      // v3.0 Stage G：数据文档页（两层路由）。
      [`${dataDocs.DATA_DOCS_ROUTE}index.html`, '../../'],
      // v2.1：套餐对比页是**两层**深路由。深度写错的话，这一页的页头/页脚内链全是 404，
      // 而页面本身看起来完全正常 —— 所以它必须进这张逐层扫描表。
      [`${plansPage.PLANS_ROUTE}index.html`, '../../'],
      // v2.5：API 计费页同样是两层深路由，深度写错的话这一页的页头/页脚内链全是 404。
      [`${apiPlansPage.API_PLANS_ROUTE}index.html`, '../../'],
      ...built.collectionPages.map(page => [`${page.slug}/index.html`, '../']),
      // v1.2 遗留的扫描盲区：按需求页是**两层**路由，却一直没进这张表 ——
      // 于是「某一层页脚的相对前缀写错」在那 10 个页面上不会被这条断言照到。
      // 补进来是顺手加固，不是本轮改动的一部分；真红了说明这里本来就有一条错链。
      ...built.needPages.map(page => [`${page.route}index.html`, '../../']),
      // v1.7：新增的四类页面（分类落地页/厂商落地页两层、枢纽页一层、别名页两层）。
      // 深度由路由段数推导，**不写死** —— 新页面少写一层前缀的症状是所有内链 404，
      // 而页面本身看起来完全正常。
      ...built.directoryPages
        .filter(page => page.kind === 'category' || page.kind === 'vendor' || page.kind === 'hub' || page.kind === 'alias')
        .map(page => [`${page.route}index.html`, '../'.repeat(page.route.split('/').filter(Boolean).length)]),
      ...dealDirs.map(id => [`deal/${id}/index.html`, '../../'])
    ];
    const leftovers = [];
    for (const [rel, prefix] of routeOutputs) {
      const file = path.join(OUT, rel);
      if (!fs.existsSync(file)) { leftovers.push(`${rel}（文件缺失）`); continue; }
      const page = fs.readFileSync(file, 'utf8');
      for (const marker of ROUTE_MARKERS) {
        if (page.includes(marker)) leftovers.push(`${rel} 残留 ${marker}`);
      }
      // 正向断言：每一条路由都必须按**这一层**的深度解析出来。
      // 只查「没有残留」是不够的 —— 把整行页脚删掉同样没有残留。
      for (const [, target] of ROUTE_HREFS) {
        if (!page.includes(`href="${prefix}${target}"`)) leftovers.push(`${rel} 缺少 ${prefix}${target} 的链接`);
      }
    }
    if (leftovers.length) {
      fail(`页脚路由链接不对（残留占位符或深度前缀错误）：${leftovers.slice(0, 6).join('、')}` +
        `${leftovers.length > 6 ? ` 等 ${leftovers.length} 处` : ''}`);
    } else {
      console.log(`  ✓ 页脚路由链接: ${ROUTE_HREFS.length} 条路由 × ${routeOutputs.length} 个输出，深度前缀与去占位逐项对账`);
    }

    // 作者写的正文里不许残留 Markdown 记号 —— 它是**直接写进 HTML 的**，不是 Markdown。
    //
    // 为什么要有这条：`audience.js` 的 `why` 与状态页/分类页的正文都曾把强调写成 `**这样**`、
    // 把字段名写成 `` `这样` ``，于是 **16 个 `**` 与 14 个反引号原样出现在读者眼前**
    // （独立验证代理在 4 类页面上数出来的），而没有任何门禁会因此变红。
    // 更糟的是「预渲染正文过短」那条长度断言还把星号当成内容算进去了 ——
    // 一条在数自己造成的排版噪声的守卫。
    //
    // 扫描面刻意收在**作者写的容器**（`.snote` / `<caption>`）里，而不是整页文本：
    // 采集来的文案（标题 / discountInfo）里出现 `**` 或反引号是**数据**，不是我们的排版错误；
    // 拿它判红会变成一条「在正常数据上失败」的守卫，而那比没有守卫更糟。
    const mdMarkers = [];
    for (const [rel] of routeOutputs) {
      const file = path.join(OUT, rel);
      if (!fs.existsSync(file)) continue;
      const page = fs.readFileSync(file, 'utf8');
      const prose = [
        ...[...page.matchAll(/<p class="snote"[^>]*>([\s\S]*?)<\/p>/g)].map(m => m[1]),
        ...[...page.matchAll(/<caption>([\s\S]*?)<\/caption>/g)].map(m => m[1])
      ].map(chunk => chunk.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
      for (const chunk of prose) {
        const stars = (chunk.match(/\*\*/g) || []).length;
        const ticks = (chunk.match(/`/g) || []).length;
        if (stars || ticks) {
          mdMarkers.push(`${rel}（**×${stars} · 反引号×${ticks}）：${chunk.slice(0, 50)}…`);
        }
      }
    }
    if (mdMarkers.length) {
      fail(`作者正文里残留 Markdown 记号（读者会原样看到）：${mdMarkers.slice(0, 4).join('；')}`);
    } else {
      console.log('  ✓ 作者正文无 Markdown 记号: .snote / <caption> 里的强调一律用 <b>，字段名直接写');
    }
  }

  const cardCount = (markup.match(/<article class="g /g) || []).length;
  if (cardCount < MIN_PRERENDERED_CARDS) {
    fail(`预渲染卡片 ${cardCount} 条 < ${MIN_PRERENDERED_CARDS}`);
  } else {
    console.log(`  ✓ 预渲染卡片: ${cardCount} 条`);
  }

  // 分档分带：默认按力度排序，五档里有卡片的档必须都有带
  const tierHeads = [...markup.matchAll(/<div class="tierhead t(\d)"[^>]*>/g)].map(m => Number(m[1]));
  // 只在**卡片本体**里数 data-tier：早先是在整份 markup 里数，于是 CSS 里
  // `[data-tier="1"] .rnum { … }` 这类选择器会被算成「档位角标」，一加样式就假失败。
  const cardChunks = markup.split('<article class="g ').slice(1).map(chunk => chunk.split('</article>')[0]);
  const tierDots = cardChunks.filter(chunk => /data-tier="\d"/.test(chunk)).length;
  if (built) {
    const expected = new Set(built.cards.map(card => card.tier));
    const missingTier = [...expected].filter(tier => !tierHeads.includes(tier));
    if (missingTier.length) fail(`档位 ${missingTier.join(', ')} 有卡片但缺少分带标题`);
    else if (tierDots !== cardCount) fail(`带档位角标的卡片 ${tierDots} 张 ≠ 卡片 ${cardCount} 条`);
    else console.log(`  ✓ 力度分带: ${tierHeads.length} 档（${built.dist}）`);
  }

  // 厂商 logo：卡片上的 data-logo 必须都能在产物里找到图形文件
  const tileKeys = [...new Set([...markup.matchAll(/data-logo="([^"]+)"/g)].map(m => m[1]))];
  const brokenLogos = tileKeys.filter(key => !fs.existsSync(path.join(logoDir, `${key}.svg`)) &&
    !fs.existsSync(path.join(logoDir, `${key}.png`)));
  const textTiles = (markup.match(/class="lg text"/g) || []).length;
  if (brokenLogos.length) fail(`卡片引用了产物里不存在的 logo: ${brokenLogos.join(', ')}`);
  else console.log(`  ✓ 卡片 logo: 官方图形 ${tileKeys.length} 个 / 名称缩写兜底 ${textTiles} 个`);

  // 「官方图形」与「名称缩写兜底」必须二选一：混在同一张卡上会让人以为缩写块也是官方 logo
  const cardsMarkup = markup.split('<article class="g ').slice(1).map(chunk => chunk.split('</article>')[0]);
  const mixed = cardsMarkup.filter(card => /data-logo="/.test(card) && /class="lg text"/.test(card)).length;
  if (mixed) fail(`有 ${mixed} 张卡片同时出现官方图形与名称缩写块（应二选一）`);
  else console.log(`  ✓ 图形与缩写不混用: ${cardsMarkup.length} 张卡片均为二选一`);

  // 骨架的其余部分不能留空
  if (/<!--PRERENDER:/.test(html)) fail('产物仍有未替换的预渲染标记');
  const facetCount = (markup.match(/data-facet="/g) || []).length;
  if (facetCount < 4) fail(`筛选条只有 ${facetCount} 个按钮（预渲染失败）`);
  else console.log(`  ✓ 筛选条: ${facetCount} 个 facet 按钮`);

  // 同页锚点：导航里的 #tier-N 必须在预渲染正文里有对应 id，否则就是死锚点
  const anchors = [...markup.matchAll(/href="#(tier-\d)"/g)].map(m => m[1]);
  const dangling = anchors.filter(id => !markup.includes(`id="${id}"`));
  if (!anchors.length) fail('找不到「跳到档位」锚点');
  else if (dangling.length) fail(`锚点没有落点：${[...new Set(dangling)].join(', ')}`);
  else console.log(`  ✓ 同页锚点: ${[...new Set(anchors)].length} 个都有落点`);

  // 收藏 / 对比（G11）：预渲染的 HTML 里**一个控件都不能有**。
  // 整块由 JS 建 DOM（星标挂在卡片上、对比条与对比弹层都是 createElement），
  // 所以无 JS 时页面上连一个「点了没反应」的死按钮都不存在——这是 PLAN.md G11 的硬要求，
  // 在这里用产物本身证明，而不是靠人读代码相信。
  //
  // 标记要写得足够具体：`.cmpbar` / `.fav` 这类**类名**在 <style> 里本来就有
  // （样式块不属于 markup），拿类名去找必然假失败——要找的是「控件元素」本身。
  // `data-fav-open`（收藏入口）/ `data-fav-prune`（清理失效收藏）与星标同源：
  // 收藏入口按「本机收藏数 > 0」才渲染，而构建期没有 localStorage ⇒ 预渲染里必然是零。
  const g11Controls = ['data-fav-toggle', 'data-fav=', 'data-fav-open', 'data-fav-prune',
    'data-cmp-open', 'data-cmp-clear', 'data-cmp-remove', 'class="cmpbar"', 'id="cmpbar"', 'id="compare"'];
  const g11Leaked = g11Controls.filter(token => markup.includes(token));
  if (g11Leaked.length) fail(`预渲染 HTML 里出现了收藏/对比控件（无 JS 时的死按钮）: ${g11Leaked.join(', ')}`);
  else console.log('  ✓ 收藏/对比: 预渲染 HTML 零控件（整块由 JS 建，无 JS 时不给可点暗示）');

  // 字段与表头口径：JS 里写死「最多 4 条」，产物自检跟着对一遍，避免两处漂移
  if (!/const CMP_MAX = 4;/.test(html)) fail('index.html 里找不到 const CMP_MAX = 4（对比上限口径变了？）');
  else console.log('  ✓ 对比上限: CMP_MAX = 4（与页脚提示文案同源）');

  // 纠错入口：详情弹层是 JS 渲染的（与弹层本身一致），所以这里只断言模板存在，
  // 真实行为（点开详情能看到带 id 的 Issue 链接）由 verify-site.js 在浏览器里验。
  if (!/issues\/new\?title=/.test(html)) fail('详情模板里没有纠错入口');
  else console.log('  ✓ 纠错入口: 详情模板已内置（真实行为由 npm run verify 验）');

  // 只在「已渲染的卡片」里数，避免把内联脚本里的模板字符串字面量也算进去
  // （cardHtml 的源码里含有 class="go" / data-model-count 这些字面量）。
  const ctaCount = (markup.match(/class="go" href="https?:/g) || []).length;
  console.log(`  ✓ 官方页入口: ${ctaCount} 个`);
  if (ctaCount < cardCount) fail(`官方页入口 ${ctaCount} 个少于卡片 ${cardCount} 条`);

  // 首页内链：标题指向站内详情页（可索引、可内链），CTA 仍直达官方页
  const titleHrefs = [...markup.matchAll(/<h3><a href="([^"]+)"/g)].map(m => m[1]);
  const toDetail = titleHrefs.filter(href => href.startsWith('deal/')).length;
  if (!titleHrefs.length) fail('首页没有卡片标题链接');
  else if (toDetail !== titleHrefs.length) fail(`首页标题链接有 ${titleHrefs.length - toDetail} 个没指向站内详情页`);
  else console.log(`  ✓ 首页内链: ${toDetail} 个标题链接全部指向站内详情页（CTA 仍指官方）`);

  // 独立详情页：数量、canonical 自指、静态正文、纯静态（不拉数据）、sitemap 一致
  const dealEntries = payload.deals.filter(deal => deal.type === 'deal' && deal.id);
  const detailRoot = path.join(OUT, 'deal');
  const detailDirs = fs.existsSync(detailRoot)
    ? fs.readdirSync(detailRoot, { withFileTypes: true }).filter(entry => entry.isDirectory()).length
    : 0;
  if (detailDirs !== dealEntries.length) fail(`详情页 ${detailDirs} 个 ≠ type=deal ${dealEntries.length} 条`);
  else console.log(`  ✓ 详情页数量: ${detailDirs} 个（= type=deal 条数）`);

  const sitemapLocs = [...fs.readFileSync(path.join(OUT, 'sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map(match => match[1]);
  // ⚠️ 这里的算术**必须把目录页与状态页算进去**。原先写死 `dealEntries.length + 1`，
  // 加任何一条 URL 都会让构建直接失败 —— 这是刻意的硬门禁（sitemap 是发布面），
  // 所以新增路由时改这里不是「为了让测试通过」，而是契约变更的显式落点。
  // v1.2 把「分类页」这一项换成「目录页」（分类页 + 按需求页），两者是同一张注册表。
  //
  // 每一项都写成自述的：数字对不上时，报错信息里的分项就是排查路径。
  // v1.5：再加一项「变化雷达页」。v1.6：再加一项「订阅中心」。
  // v1.7：sitemap 只收**可索引**的页面（别名页是 noindex，进 sitemap 等于自相矛盾），
  // 而且条数不再手写公式 —— 直接与构建期生成的那份 `sitemapEntries` 逐条对账。
  const indexableDirectories = built.directoryPages.filter(page => page.indexable);
  const expectedLocs = dealEntries.length + 1 /* 首页 */ + indexableDirectories.length + 1 /* 状态页 */
    + 1 /* 变化雷达页 */ + 1 /* 订阅中心 */ + 1 /* 资料入口页 */ + 1 /* 套餐对比页 */ + 1 /* API 计费页 */
    + 1 /* 模型资料索引 */ + built.modelDetailCount /* 模型详情页 */
    + 1 /* 档案索引 */ + built.archiveDetailCount /* 档案详情页 */
    + 1 /* 数据文档页 */;
  if (sitemapLocs.length !== expectedLocs) {
    fail(`sitemap ${sitemapLocs.length} 条 ≠ 首页 1 + 可索引落地页 ${indexableDirectories.length}` +
      `（分类页 ${built.collectionPages.length} + 按需求页/别名 ${built.needPages.length} 中可索引的` +
      ` + 分类落地页 ${built.categoryPages.length} + 厂商落地页 ${built.vendorPages.length}` +
      ` + 枢纽 ${built.hubPages.length}）+ 状态页 1 + 变化雷达页 1 + 订阅中心 1 + 资料入口页 1 + 套餐对比页 1 + API 计费页 1` +
      ` + 模型索引 1 + 模型详情页 ${built.modelDetailCount} + 档案索引 1 + 档案详情页 ${built.archiveDetailCount} + 数据文档页 1 + 详情页 ${dealEntries.length}`);
  } else {
    const notListed = dealEntries.filter(deal => !sitemapLocs.some(loc => loc.endsWith(`/deal/${encodeURIComponent(deal.id)}/`)));
    const directoriesNotListed = indexableDirectories.filter(page => !sitemapLocs.includes(page.url));
    const aliasesListed = built.aliasPages.filter(page => sitemapLocs.includes(page.url));
    if (notListed.length) fail(`sitemap 漏了 ${notListed.length} 个详情页`);
    else if (directoriesNotListed.length) fail(`sitemap 漏了落地页: ${directoriesNotListed.map(p => p.route).join(', ')}`);
    else if (aliasesListed.length) fail(`sitemap 里出现了 noindex 的别名页: ${aliasesListed.map(p => p.route).join(', ')}`);
    else if (!sitemapLocs.includes(`${SITE_URL}status/`)) fail('sitemap 漏了状态页 status/');
    else if (!sitemapLocs.includes(`${SITE_URL}changes/`)) fail('sitemap 漏了变化雷达页 changes/');
    else if (!sitemapLocs.includes(`${SITE_URL}feeds/`)) fail('sitemap 漏了订阅中心 feeds/');
    else if (!sitemapLocs.includes(`${SITE_URL}${plansHubPage.PLANS_HUB_ROUTE}`)) fail(`sitemap 漏了资料入口页 ${plansHubPage.PLANS_HUB_ROUTE}`);
    else if (!sitemapLocs.includes(`${SITE_URL}${modelsPage.MODELS_INDEX_ROUTE}`)) fail(`sitemap 漏了模型资料索引 ${modelsPage.MODELS_INDEX_ROUTE}`);
    else if (!sitemapLocs.includes(`${SITE_URL}${archiveLib.ARCHIVE_INDEX_ROUTE}`)) fail(`sitemap 漏了历史档案索引 ${archiveLib.ARCHIVE_INDEX_ROUTE}`);
    else if (!sitemapLocs.includes(`${SITE_URL}${dataDocs.DATA_DOCS_ROUTE}`)) fail(`sitemap 漏了数据文档页 ${dataDocs.DATA_DOCS_ROUTE}`);
    else if (built.archiveDetailRoutes.some(route => !sitemapLocs.includes(`${SITE_URL}${route}`))) {
      const missing = built.archiveDetailRoutes.filter(route => !sitemapLocs.includes(`${SITE_URL}${route}`));
      fail(`sitemap 漏了 ${missing.length} 个档案详情页：${missing.slice(0, 3).join('、')}`);
    }
    else if (built.modelGateSkipped.some(gate => sitemapLocs.includes(`${SITE_URL}${gate.route}`))) {
      const bad = built.modelGateSkipped.filter(gate => sitemapLocs.includes(`${SITE_URL}${gate.route}`));
      fail(`sitemap 里出现了 ${bad.length} 个**未过生成门槛**的模型页（会造成死链）：${bad.slice(0, 3).map(gate => gate.route).join('、')}`);
    }
    else if (built.modelDetailRoutes.some(route => !sitemapLocs.includes(`${SITE_URL}${route}`))) {
      const missing = built.modelDetailRoutes.filter(route => !sitemapLocs.includes(`${SITE_URL}${route}`));
      fail(`sitemap 漏了 ${missing.length} 个模型详情页：${missing.slice(0, 3).join('、')}`);
    }
    else if (!sitemapLocs.includes(`${SITE_URL}${plansPage.PLANS_ROUTE}`)) fail(`sitemap 漏了套餐对比页 ${plansPage.PLANS_ROUTE}`);
    else if (!sitemapLocs.includes(`${SITE_URL}${apiPlansPage.API_PLANS_ROUTE}`)) fail(`sitemap 漏了 API 计费页 ${apiPlansPage.API_PLANS_ROUTE}`);
    else console.log(`  ✓ sitemap: ${sitemapLocs.length} 条（首页 + ${built.collectionPages.length} 个分类页 + ` +
      `${built.needPages.length} 条按需求/别名页中可索引的部分 + ${built.categoryPages.length} 个分类落地页 + ` +
      `${built.vendorPages.length} 个厂商落地页 + ${built.hubPages.length} 个枢纽页 + 状态页 + 变化雷达页 + 订阅中心 + ` +
      `资料入口页 + 套餐对比页 + API 计费页 + 模型索引 + ${built.modelDetailCount} 个模型详情页 + ` +
      `档案索引 + ${built.archiveDetailCount} 个档案详情页 + 数据文档页 + ` +
      `${dealEntries.length} 个详情页；${built.aliasPages.length} 条别名页已排除）`);
  }

  // 分类页：**逐条回读对账**，而不是「文件存在就算过」。
  //
  // 与 /status/ 同一套机制（读回产物 + 与机器可读的那份对账），但断言更硬：
  //   · 表格里的详情页链接集合 == dist/deals.json 里 `collections` 筛出来的 id 集合
  //   · 每个分类页都要有 canonical 自指、要声明两个 feed、要有三段 JSON-LD（含 BreadcrumbList）
  //   · 无 JS 可读：表格是构建期写的，正文长度必须够
  // 为什么 jsonld / feed 要有断言：`/status/` 那页恰恰是「有五条约定里的两条」——
  // 没有断言的三条，写漏了不会有任何东西红（子代理核查结论）。新路由不重复那个模式。
  {
    const problems = [];
    const published = JSON.parse(fs.readFileSync(path.join(OUT, 'deals.json'), 'utf8'));
    const publishedById = new Map(published.deals.map(deal => [deal.id, deal]));
    for (const page of built.directoryPages) {
      const prefix = '../'.repeat(page.route.split('/').length - 1);
      const field = page.kind === 'need' ? 'needs' : 'collections';
      const file = path.join(OUT, page.route, 'index.html');
      if (!fs.existsSync(file)) { problems.push(`缺少 ${page.route}index.html`); continue; }
      const body = fs.readFileSync(file, 'utf8');

      // ① 条目集合逐个 id 对账（页面 → 数据 与 数据 → 页面 两个方向）。
      //    v1.7：期望集合按**类型**从已发布数据独立重算一次 —— 不读构建期记下的 itemIds。
      //    （读自己写下的东西等于对账自己，那正是「页面写 12、实际列 7」能溜过去的原因。）
      const onPage = new Set([...body.matchAll(/href="([^"]*?)deal\/([^/"]+)\/"/g)].map(m => decodeURIComponent(m[2])));
      const pool = published.deals.filter(deal => deal.type === 'deal');
      let expected = new Set();
      if (page.kind === 'collection') expected = new Set(pool.filter(d => (d.collections || []).includes(page.slug)).map(d => d.id));
      else if (page.kind === 'need') expected = new Set(pool.filter(d => (d.needs || []).includes(page.slug)).map(d => d.id));
      else if (page.kind === 'alias') {
        const target = built.directoryPages.find(item => item.route === page.aliasOf);
        if (!target) problems.push(`${page.route} 的别名目标 ${page.aliasOf} 不在产物里`);
        else if (target.kind === 'collection') expected = new Set(pool.filter(d => (d.collections || []).includes(target.slug)).map(d => d.id));
        else expected = new Set(pool.filter(d => (d.needs || []).includes(target.slug)).map(d => d.id));
      } else if (page.kind === 'category') expected = new Set(pool.filter(d => d.category === page.key).map(d => d.id));
      else if (page.kind === 'vendor') expected = new Set(pool.filter(d => VENDOR_KEY_OF(d) === page.key).map(d => d.id));
      if (page.kind === 'hub') {
        // 枢纽页列的是**子页面**，不是条目：逐个核对子页链接，并断言没有混进条目行
        const children = page.childRoutes || [];
        for (const route of children) {
          if (!body.includes(`href="${prefix}${route}"`)) problems.push(`${page.route} 缺少到子页 ${route} 的链接`);
        }
        if (onPage.size) problems.push(`${page.route} 是枢纽页，却渲染了 ${onPage.size} 条条目行`);
      } else {
        const missing = [...expected].filter(id => !onPage.has(id));
        const extra = [...onPage].filter(id => !expected.has(id));
        if (missing.length) problems.push(`${page.route} 漏了 ${missing.length} 条（如 ${missing.slice(0, 3).join(', ')}）`);
        if (extra.length) problems.push(`${page.route} 多了 ${extra.length} 条不该在这一页里的（如 ${extra.slice(0, 3).join(', ')}）`);
        if (page.count !== expected.size) problems.push(`${page.route} 报告条数 ${page.count} ≠ 数据 ${expected.size}`);
      }
      // ①′ 内链前缀必须与输出层数一致。写死的症状极隐蔽：页面打得开、内容都对，
      //     只有**所有**内链 404。分类页 1 层（`../`）、按需求页 2 层（`../../`）。
      const wrongPrefix = [...body.matchAll(/href="((?:\.\.\/)+)deal\//g)]
        .map(m => m[1]).filter(p => p !== prefix);
      if (wrongPrefix.length) {
        problems.push(`${page.route} 的详情页内链前缀应为 ${prefix}，实得 ${[...new Set(wrongPrefix)].join(' / ')}`);
      }

      // ② 该有的元信息一个都不能少
      if (!body.includes(`<link rel="canonical" href="${page.url}">`)) problems.push(`${page.route} canonical 不是自指`);
      if (!page.indexable && !/name="robots"[^>]*noindex/.test(body)) problems.push(`${page.route} 是别名页却没有 noindex`);
      if (page.indexable && /name="robots"[^>]*noindex/.test(body)) problems.push(`${page.route} 可索引却带了 noindex`);
      if (!body.includes(`href="${prefix}feed.xml"`) || !body.includes(`href="${prefix}feed.json"`)) {
        problems.push(`${page.route} 没有声明订阅源（前缀 ${prefix}）`);
      }
      // ②′ 有专属 Feed 的页面必须声明它（v1.7：学生/开发者/免费 API/免费 Tokens/AI Coding/国内可用
      //     /分类页/厂商页都有对应 Feed，页面不声明等于读者找不到订阅入口）
      for (const feed of feeds.feedsForPage({ kind: page.kind, slug: page.slug }, built.feedBundle.feeds)) {
        if (!body.includes(`href="${prefix}${feed.spec.path}"`)) {
          problems.push(`${page.route} 没有声明本页对应的 Feed ${feed.spec.id}（${feed.spec.path}）`);
        }
      }
      let ldTypes = [];
      try {
        ldTypes = [...body.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
          .map(m => JSON.parse(m[1])['@type']);
      } catch (error) {
        problems.push(`${page.route} JSON-LD 解析失败: ${error.message}`);
      }
      for (const need of ['CollectionPage', 'BreadcrumbList', 'ItemList']) {
        if (!ldTypes.includes(need)) problems.push(`${page.route} 缺少 JSON-LD ${need}`);
      }
      // 「多了」同样要拦：只断言「包含」的话，多出一段不属于本页类型的结构化数据
      // （比如把状态页的 WebPage 抄过来、或给目录页发 Dataset）不会有任何东西变红。
      const COLLECTION_LD_EXPECTED = ['BreadcrumbList', 'CollectionPage', 'ItemList'];
      const ldActual = ldTypes.slice().sort();
      if (JSON.stringify(ldActual) !== JSON.stringify(COLLECTION_LD_EXPECTED)) {
        problems.push(`${page.route} JSON-LD 集合不是恰好 [${COLLECTION_LD_EXPECTED.join(', ')}]，实得 [${ldActual.join(', ')}]`);
      }
      // ②″ ItemList 的条数必须与页面上的数据行**逐一对上**（v1.7 的 Tooth Test #4）。
      //     老实现声明 `deals.length` 却只发 `slice(0,50)`：/developer/ 67 条页面声明 67、实列 50，
      //     没有任何断言会发现 —— 这就是加这一条的理由。
      {
        const itemListBlock = [...body.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
          .map(m => { try { return JSON.parse(m[1]); } catch (error) { return null; } })
          .find(data => data && data['@type'] === 'ItemList');
        const rows = (body.match(/data-item="/g) || []).length + (body.match(/data-child="/g) || []).length;
        if (!itemListBlock) problems.push(`${page.route} 没有 ItemList`);
        else {
          const elements = Array.isArray(itemListBlock.itemListElement) ? itemListBlock.itemListElement.length : 0;
          if (Number(itemListBlock.numberOfItems) !== elements) {
            problems.push(`${page.route} ItemList 声明 ${itemListBlock.numberOfItems} 项但只发了 ${elements} 项`);
          }
          if (elements !== rows) problems.push(`${page.route} ItemList 有 ${elements} 项，页面数据行有 ${rows} 行`);
        }
      }
      // ③ 预渲染正文（无 JS 可读）：表格是构建期写死的。
      //    阈值**按条目数成比例**，不是常数。常数版本连续踩了两次：
      //      · 第一版只剥 `<script>`，量到的 4 万字里 38950 是 CSS（等于没量）；
      //      · 改成量内容后取常数 500，而**表体空掉**时实测 610 / 659 / 691 字
      //        （/developer/ /free-api/ /student/）—— 全部大于 500，**照样放行**。
      //    实测每条约 90–100 字（/student/ 12 行 1884 · /developer/ 67 行 6593 ·
      //    /free-api/ 45 行 4820），页头页脚等固定部分约 650 字。取 60 字/条留余量：
      //    条目越多阈值越紧，而「表体空掉」在 count>0 时必然低于它。
      const text = prerenderedText(body);
      const textFloor = page.kind === 'hub' ? 500 + 60 * page.count : 600 + 60 * page.count;
      if (text.length < textFloor) {
        problems.push(`${page.route} 预渲染正文过短（内容 ${text.length} 字 < ${textFloor}）`);
      }
      // 结构断言与上面的字数是**互相独立**的两件事：字数够而表是空的，说明渲染路径断了。
      // ⚠️ 先把 `<script>` 摘掉再取 tbody（本文件自己的纪律：数标记先摘 script）——
      //    不摘的话，将来某个内联脚本里出现 `<tbody>…</tbody>` 就会让这条断言永远为真。
      const bodyNoScript = body.replace(/<script[\s\S]*?<\/script>/gi, '');
      const tbody = (bodyNoScript.match(/<tbody>([\s\S]*?)<\/tbody>/) || [])[1] || '';
      if (page.count > 0 && page.kind === 'hub' && !tbody.includes(`href="${prefix}`)) {
        problems.push(`${page.route} <tbody> 里一个子页链接都没有（表格没渲染出来）`);
      }
      if (page.count > 0 && page.kind !== 'hub' && !tbody.includes(`href="${prefix}deal/`)) {
        problems.push(`${page.route} <tbody> 里一个详情页链接都没有（表格没渲染出来）`);
      }
      // ③′ 有「命中依据」列的页面：表头必须有那一列，且 tbody 里至少有一行写了依据。
      //     没有这一列，那几条「数字让人意外」的页面就只剩一个光秃秃的条数，
      //     读者无法区分「没有这类优惠」与「我们没查到」。
      if (page.kind === 'need' || page.kind === 'category' || page.kind === 'vendor' || page.kind === 'alias') {
        if (!bodyNoScript.includes('为什么在这一页')) problems.push(`${page.route} 表头缺少「为什么在这一页」一列`);
        if (page.count > 0 && !/适用人群：|福利类型含|定价模式：|分类：|需要信用卡：|中国大陆可用性：|厂商：/.test(tbody)) {
          problems.push(`${page.route} <tbody> 里没有一行写出命中依据`);
        }
      }
      if (/__[A-Z_]+_HREF__/.test(body)) problems.push(`${page.route} 残留路由占位符`);
      if (body.includes('__PREFIX__')) problems.push(`${page.route} 残留 __PREFIX__ 占位符`);
      // ④ 三态措辞：不许把「没有依据」写成「不可用」
      if (/中国大陆[^。；]{0,12}不可用/.test(body) && !/尚未确认/.test(body)) {
        problems.push(`${page.route} 出现了「不可用」却没有任何「尚未确认」——三态措辞可能被压平`);
      }
      // ④′ 摘要块：每个数字都必须带机器可读的 data-summary-label/value，
      //     且**至少一行**（只有「当前条目」也算）—— 一个渲染失败的空摘要块会静默消失。
      if (page.kind !== 'hub' && page.count > 0 && !/data-summary-label="/.test(body)) {
        problems.push(`${page.route} 没有渲染数据摘要块`);
      }
    }

    // ⑤ 首页筛选器的分类入口必须与分类页注册表**逐个 slug 对齐**。
    //
    // 判据不重复（前端读的是数据），但「有哪些分类」这件事在两处各写了一份：
    // 一处是 `audience.COLLECTION_PAGES`（生成页面），一处是 index.html 的
    // `COLLECTION_FACETS`（渲染按钮）。写错 slug、漏一个、多一个 ——
    // 症状分别是「点了没反应」「入口消失」，两边都不会报错。所以在这里对齐一次。
    const facetBlock = (html.match(/const COLLECTION_FACETS = \[([\s\S]*?)\];/) || ['', ''])[1];
    if (!facetBlock) {
      problems.push('index.html 里找不到 COLLECTION_FACETS（首页分类入口没了？）');
    } else {
      const facetKeys = [...facetBlock.matchAll(/key:\s*'([^']+)'/g)].map(m => m[1]);
      const expectedSlugs = audience.COLLECTION_PAGES.map(page => page.slug);
      const missing = expectedSlugs.filter(slug => !facetKeys.includes(slug));
      const extra = facetKeys.filter(slug => !expectedSlugs.includes(slug));
      if (missing.length) problems.push(`首页筛选器缺少分类入口: ${missing.join(', ')}`);
      if (extra.length) problems.push(`首页筛选器有分类页注册表里没有的入口: ${extra.join(', ')}`);
    }

    // ⑥ 首页「按需求找优惠」导航卡与注册表 + 已生成页面**三处对齐**（v1.2 建、v1.8 改成整卡）。
    //
    // 这一块是构建期注入的（`renderNeedRow`），但「注入的东西对不对」必须回读产物来判：
    //   · 每个已生成的按需求页都必须在首页有一个入口（否则那一页没有任何站内入口）；
    //   · 首页每一个入口都必须指向一个**真实存在**的文件（否则是死链）；
    //   · 入口上的数字必须等于落地页的行数（否则「首页写 12、页面列 7」而两边都不报错）；
    //   · 入口必须是 `<a>` 而不是按钮：首页是静态文件，无 JS 时按钮点了没反应。
    // 最后一条最容易在重构里丢掉（比如有人为了「点了就地筛选」把它换成 button），
    // 所以它按**元素**判，不按类名判 —— v1.8 换成整卡之后，这一条再往前一步：
    // **逐张卡**判四件套（图标 / 标题 / 说明 / 箭头）齐不齐，以及卡上那串 `class="need-card"`
    // 是不是就长在 `<a>` 自己身上（「容器挂类名、里面只有文字是链接」那种形状要能被抓住）。
    {
      const needsNav = (html.match(/<nav class="needs"[^>]*>([\s\S]*?)<\/nav>/) || [])[1];
      if (!needsNav) {
        problems.push('首页里找不到按需求入口行（nav.needs）——预渲染注入失败或标记被删');
      } else {
        // 整卡：`<a class="need-card" href="…">` 起、`</a>` 止。href 与卡片内容是同一个匹配里出来的，
        // 所以「哪张卡指向哪里」不需要第二次解析。`[^>]*` 只为容忍将来往 `<a>` 上再挂属性 ——
        // 「卡不是 <a> 本身」那种形状（容器挂类名、里面一个文字链接）仍然匹配不到。
        const cards = [...needsNav.matchAll(/<a class="need-card" href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
        const cardClassHits = (needsNav.match(/class="need-card"/g) || []).length;
        if (cardClassHits !== cards.length) {
          problems.push(`class="need-card" 出现 ${cardClassHits} 次 ≠ 整卡链接 ${cards.length} 个（卡不是 <a> 本身，而是「容器挂类名 + 里面一个文字链接」那种形状）`);
        }
        if (cards.length !== built.needPages.length) {
          problems.push(`首页专题导航卡 ${cards.length} 张 ≠ 已生成页面 ${built.needPages.length} 个`);
        }
        const buttons = [...needsNav.matchAll(/<button|<input|<select|data-facet|aria-pressed|role="button"/g)].length;
        if (buttons) problems.push(`按需求导航卡里出现了 ${buttons} 个 JS 控件 / facet 语义（无 JS 时是死按钮，只允许 <a>）`);
        for (const [, href, inner] of cards) {
          // 四件套逐件取文本：取不到 = 那一件没了（空文本与「标签在但内容是空的」都算缺失）
          const icon = (inner.match(/<span class="need-icon" aria-hidden="true">([^<]*)<\/span>/) || [])[1] || '';
          const label = (inner.match(/<strong>([^<]*)<\/strong>/) || [])[1] || '';
          const desc = (inner.match(/<small>([^<]*)<\/small>/) || [])[1] || '';
          const arrow = (inner.match(/<span class="need-arrow" aria-hidden="true">([^<]*)<\/span>/) || [])[1] || '';
          const badge = (inner.match(/<b>(\d+)<\/b>/) || [])[1];
          const missing = [!icon && '图标', !label && '标题', !desc && '说明', !arrow && '箭头'].filter(Boolean);
          if (missing.length) problems.push(`专题导航卡 ${href} 缺 ${missing.join(' / ')}（四件套不齐，卡片退化成一条看不懂的链接）`);
          // 「每条 href 有真实文件」：`built.needPages` 只能证明**计划里有**这一页，
          // 证明不了**盘上有** —— 这一条按产物判，死链在这里就被拦下。
          if (!fs.existsSync(path.join(OUT, href, 'index.html'))) {
            problems.push(`专题导航卡指向不存在的文件 ${href}index.html`);
          }
          const page = built.needPages.find(item => item.route === href);
          if (!page) { problems.push(`首页导航卡「${label}」指向未生成的 ${href}`); continue; }
          if (page.count !== Number(badge)) {
            problems.push(`首页导航卡「${label}」数字 ${badge === undefined ? '缺失' : badge} ≠ 落地页 ${page.count} 条`);
          }
        }
        const missingEntry = built.needPages.filter(page => !cards.some(card => card[1] === page.route));
        if (missingEntry.length) problems.push(`这些按需求页在首页没有入口: ${missingEntry.map(p => p.route).join(', ')}`);
      }
    }

    if (problems.length) fail(`目录页: ${problems.slice(0, 6).join('；')}`);
    else {
      const collectionSummary = built.collectionPages.map(p => `/${p.slug}/ ${p.count} 条`).join(' · ');
      const needSummary = built.needPages.map(p => `/${p.route} ${p.count} 条`).join(' · ');
      console.log(`  ✓ 分类页: ${collectionSummary}（逐条 id 对账 · canonical · 双 feed · 三段 JSON-LD · 预渲染正文）`);
      console.log(`  ✓ 按需求页: ${needSummary}（同上 + 命中依据列 · 内链前缀 ${'../../'} · 首页入口数字对齐）`);
    }
  }

  const sampleDeals = [dealEntries[0], dealEntries[Math.floor(dealEntries.length / 2)], dealEntries[dealEntries.length - 1]].filter(Boolean);  let detailBad = 0;
  for (const deal of sampleDeals) {
    const pageFile = path.join(OUT, 'deal', deal.id, 'index.html');
    if (!fs.existsSync(pageFile)) { fail(`缺少详情页 ${deal.id}`); detailBad++; continue; }
    const page = fs.readFileSync(pageFile, 'utf8');
    if (!page.includes(`/deal/${encodeURIComponent(deal.id)}/`)) { fail(`详情页 canonical 不是自指: ${deal.id}`); detailBad++; }
    const prose = String(deal.discountInfo || '').slice(0, 12);
    if (prose && !page.includes(prose)) { fail(`详情页缺少本条优惠文案（不执行 JS 读不到）: ${deal.id}`); detailBad++; }
    if (/fetch\('deals\.json'/.test(page)) { fail(`详情页仍会拉 deals.json（应纯静态）: ${deal.id}`); detailBad++; }
  }
  if (!detailBad) console.log(`  ✓ 详情页抽样: ${sampleDeals.length} 个均自指 canonical、含本条文案、纯静态`);

  // 折叠无损：产物里「折叠卡覆盖的模型数 + 单条卡数」必须等于未过期优惠条数，
  // 即数据层的无损断言确实落到了静态正文里（覆盖模型数真的被输出，而不是只写在内存里）
  if (built) {
    const modelsSum = [...markup.matchAll(/data-model-count="(\d+)"/g)]
      .reduce((n, m) => n + Number(m[1]), 0);
    const foldedCards = (markup.match(/<article class="g [^>]*data-model-count="/g) || []).length;
    const covered = (cardCount - foldedCards) + modelsSum;
    if (covered !== built.visibleCount) {
      fail(`折叠覆盖条目 ${covered} 条 ≠ 未过期优惠 ${built.visibleCount} 条（折叠卡 ${foldedCards} 张 / 覆盖模型 ${modelsSum} 个）`);
    } else {
      console.log(`  ✓ 折叠无损: ${cardCount} 张卡片覆盖 ${built.visibleCount} 条优惠（${foldedCards} 张折叠卡 / ${modelsSum} 个模型）`);
    }
  }

  if (!/rel="canonical"/.test(html)) fail('缺少 canonical');
  if (!/hreflang="x-default"/.test(html)) fail('缺少 hreflang');
  if (!/property="og:image"/.test(html)) fail('缺少 og:image');
  if (!/name="twitter:card"/.test(html)) fail('缺少 twitter card');
  if (/__SITE_URL__|buguoshixc\.github\.io\/ai-deals-aggregator\/"\/>/.test(html) === false && !html.includes(SITE_URL)) {
    fail('产物中找不到站点绝对地址');
  }

  const ldBlocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const expectedTypes = ['Organization', 'WebSite', 'BreadcrumbList', 'FAQPage', 'ItemList'];
  const foundTypes = [];
  for (const [i, block] of ldBlocks.entries()) {
    try {
      const data = JSON.parse(block);
      foundTypes.push(data['@type']);
    } catch (e) {
      fail(`JSON-LD 第 ${i + 1} 段解析失败: ${e.message}`);
    }
  }
  for (const type of expectedTypes) {
    if (!foundTypes.includes(type)) fail(`缺少 JSON-LD ${type}`);
  }
  if (ldBlocks.length === expectedTypes.length && foundTypes.length === expectedTypes.length) {
    console.log(`  ✓ JSON-LD: ${foundTypes.join(' / ')}`);
  }

  // ---- v3.0 Stage E：厂商资料页（**从磁盘回读**对账）------------------------------------
  //
  // 与其它区域的同一条纪律：不看内存里那个 HTML 字符串，而是把 `dist/vendor/<slug>/index.html`
  // 重新读一遍，再与**盘上的** plans / api-plans / models / 关系层 / 两份变化日志逐个对账。
  // 内存里的对象与盘上的产物必须互相印证，否则「构建期算对了、写盘写错了」不会有任何东西红。
  {
    const providerTableDisk = providers.load().table;
    const problems = [
      ...vendorPage.assertVendorSlugCanonical(built.directoryPages, { providerTable: providerTableDisk, vendorSlugs: feeds.VENDOR_SLUGS }),
      // slug 必须来自**权威表**（不能只靠 providers.json 的隐式兜底）：补表不改变 URL，
      // 只是把「隐式兜底」换成「显式登记」——没有这条，改 slug 表也不会有人发现。
      ...vendorPage.assertVendorSlugDeclared(built.directoryPages, { vendorSlugs: feeds.VENDOR_SLUGS }),
      ...vendorPage.assertVendorCandidateIdentity(built.directoryPages, { providerTable: providerTableDisk }),
      ...vendorPage.assertNoParallelProviderRoutes(built.directoryPages)
    ];
    const diskApiPlans = JSON.parse(fs.readFileSync(path.join(OUT, 'api-plans.json'), 'utf8')).plans;
    const diskPlans = JSON.parse(fs.readFileSync(path.join(OUT, 'plans.json'), 'utf8')).plans;
    const diskModels = JSON.parse(fs.readFileSync(path.join(OUT, 'models.json'), 'utf8')).models;
    const diskLinks = JSON.parse(fs.readFileSync(path.join(OUT, 'model-registry-links.json'), 'utf8')).links;
    const diskPlanHistory = fs.existsSync(path.join(OUT, 'plan-history.json'))
      ? JSON.parse(fs.readFileSync(path.join(OUT, 'plan-history.json'), 'utf8')) : null;
    const diskApiHistory = fs.existsSync(path.join(OUT, 'api-plan-history.json'))
      ? JSON.parse(fs.readFileSync(path.join(OUT, 'api-plan-history.json'), 'utf8')) : null;
    const vendorEntries = built.directoryPages.filter(page => page.kind === 'vendor');
    for (const spec of vendorEntries) {
      const file = path.join(OUT, spec.route, 'index.html');
      if (!fs.existsSync(file)) { problems.push(`${spec.route}: 缺少产物`); continue; }
      const pageHtml = fs.readFileSync(file, 'utf8');
      const pageDeals = landing.itemsOf(spec, JSON.parse(fs.readFileSync(path.join(OUT, 'deals.json'), 'utf8')).deals,
        { vendorKeyOf: VENDOR_KEY_OF });
      const ctx = {
        deals: pageDeals,
        plans: diskPlans, apiPlans: diskApiPlans, models: diskModels, modelLinks: diskLinks,
        planHistoryStore: diskPlanHistory, apiPlanHistoryStore: diskApiHistory,
        providerTable: providerTableDisk,
        feeds: feeds.feedsForPage(spec, built.feedBundle.feeds),
        prefix: '../'.repeat(spec.depth || 1),
        siteUrl: SITE_URL
      };
      problems.push(...vendorPage.assertVendorPageHonesty(pageHtml, spec, ctx).map(problem => `${spec.route}: ${problem}`));
      problems.push(...vendorPage.assertVendorApiCounts(pageHtml, spec, ctx).map(problem => `${spec.route}: ${problem}`));
    }
    if (problems.length) {
      fail(`厂商资料页未通过诚实性断言（${problems.length} 处）：${problems.slice(0, 3).join('、')}`);
    } else {
      console.log(`  ✓ 厂商资料页: ${vendorEntries.length} 页 · slug 唯一且已登记 · 无 /provider/ 并行路由` +
        ` · API 计数与 dist/api-plans.json 逐个对账 · 资料区块六节齐`);
    }
  }

  // 订阅产物（v1.6）：**整张注册表**做三方对账 + 语义不变量。
  //
  // 这一段替换掉 v1.0–v1.5 的「只数条目数」检查。旧检查的漏洞是结构性的：
  // 它只问「两份 feed 条数是否相等」——条目 id 重复、链接指向不存在的页面、
  // 分类 Feed 混进不该有的条目、变化 Feed 引用不存在的事件，它一条都照不到。
  //
  // 现在交给 feeds.validate()：内存条目 ↔ RSS 回读 ↔ JSON 回读三方对账 +
  // 判据/生命周期/事件存在性/时间来源/slug/空 Feed 等不变量，逐项带 code 报出。
  {
    const result = feeds.validate({
      feeds: built.feedBundle.feeds,
      deals: JSON.parse(fs.readFileSync(path.join(OUT, 'deals.json'), 'utf8')).deals,
      store: fs.existsSync(path.join(OUT, 'deal-history.json'))
        ? JSON.parse(fs.readFileSync(path.join(OUT, 'deal-history.json'), 'utf8'))
        : null,
      pages: built.pageRoutes,
      asOf: built.radarAsOf,
      availability: built.radar.availability,
      // v2.3 / v3.0：变化源的对账材料**逐来源分开**（事件身份来自**产物那一份**日志）。
      // 把两份日志合成一个集合，会让「API 订阅里混进了套餐事件」这条最该报红的事静默通过。
      planEvents: fs.existsSync(path.join(OUT, 'plan-history.json'))
        ? JSON.parse(fs.readFileSync(path.join(OUT, 'plan-history.json'), 'utf8')).events
        : [],
      planAvailability: built.planRadar ? built.planRadar.availability : 'unavailable',
      apiPlanEvents: fs.existsSync(path.join(OUT, 'api-plan-history.json'))
        ? JSON.parse(fs.readFileSync(path.join(OUT, 'api-plan-history.json'), 'utf8')).events
        : [],
      apiPlanAvailability: built.apiPlanRadar ? built.apiPlanRadar.availability : 'unavailable',
      // 厂商归属必须与页面/Feed 构建时用的是**同一个**规范名取值器，
      // 否则「扣子 Coze（字节跳动）」这类写法会被判成「不属于该厂商」。
      vendorKeyOf: VENDOR_KEY_OF
    });

    // v2.3 / v3.0：变化条目的深链锚点必须**真的在它自己那一页上**（`#plan-<id>`）。
    // 反过来说，删掉某一行的 id 属性会让这里当场变红 —— 那是订阅里最典型的死链。
    //
    // ⚠️ **逐条 feed**，不是「找第一条 kind === 'plan-changes'」：只说第一条的话，
    // API 那条（第二条）的锚点永远不会被检查 —— 而题面牙 #16（「API Feed event 指向
    // 不存在页面锚点」）恰恰只有这里会红：`feeds.validate()` 的 `link-exists` 只判路由存在，
    // 片段（`#plan-<id>`）不改变「哪一页」，它照不到锚点本身。
    {
      for (const spec of feeds.PLAN_CHANGE_FEEDS) {
        const feed = built.feedBundle.feeds.find(item => item.spec.id === spec.id);
        const pageFile = path.join(OUT, spec.pageRoute, 'index.html');
        if (!feed || !fs.existsSync(pageFile)) {
          if (feed) fail(`变化订阅 ${spec.id} 的落点页面不存在：${spec.pageRoute}`);
          continue;
        }
        if (!feed.items.length) {
          console.log(`  ✓ 变化订阅 ${spec.id}: 0 条条目（这一轮没有可订阅的变化）`);
          continue;
        }
        const pageHtml = fs.readFileSync(pageFile, 'utf8');
        // 判据是**链接自己**的落点，而不是「拿 item.planId 拼一个锚点去页面上找」——
        // 后者在有人把链接拼错（指向另一条记录、或指向 eventId）时会照常通过。
        const pagePrefix = `${SITE_URL}${spec.pageRoute}`;
        const dangling = feed.items
          .map(item => String(item.link || ''))
          .filter(link => {
            if (!link.startsWith(pagePrefix)) return true;          // 链接不在它该在的那一页
            const hash = link.slice(pagePrefix.length).split('#')[1] || '';
            return !hash || !pageHtml.includes(`id="${hash}"`);      // 片段没有落点
          });
        if (dangling.length) {
          fail(`变化订阅 ${spec.id} 里有 ${dangling.length} 条深链在 ${spec.pageRoute} 上没有落点（如 ${dangling[0]}）`);
        } else {
          console.log(`  ✓ 变化订阅 ${spec.id}: ${feed.items.length} 条条目，深链锚点全部落在 ${spec.pageRoute} 上`);
        }
      }
    }

    // v3.0 Stage H（队长 A1）：**「改了 alwaysGenerated 却忘了交视图」必须当场红**。
    // 症状是那条 Feed 的描述里写着「没有拿到日志」，而日志其实就在盘上 —— 那是假话，
    // 而且从产物上完全看不出来（文件在、格式对、就是描述说错了话）。
    {
      if (built.feedBundle.changeFeedsSkipped.length) {
        fail(`有变化源没有被登记（未交出视图）：${built.feedBundle.changeFeedsSkipped.map(item => item.id).join('、')}`
          + ' —— 要么补上 changeViews，要么把 spec 的 alwaysGenerated 保持为 false');
      }
      const availabilityOf = source => (source === 'api'
        ? (built.apiPlanRadar ? built.apiPlanRadar.availability : 'unavailable')
        : (built.planRadar ? built.planRadar.availability : 'unavailable'));
      for (const spec of feeds.PLAN_CHANGE_FEEDS) {
        const feed = built.feedBundle.feeds.find(item => item.spec.id === spec.id);
        if (!feed || availabilityOf(spec.changeSource) !== 'ok') continue;
        const unavailableNote = feeds.changeWordingOf(spec).unavailable;
        if (feed.description.includes(unavailableNote)) {
          fail(`订阅 ${spec.id} 的日志是可用状态，描述里却写着「没有拿到日志」——视图没有真的交进去`);
        }
      }
    }
    // 文件真的落盘了吗（含子目录）——存在的清单以注册表为准，不写死文件名
    const missingFiles = [];
    for (const feed of built.feedBundle.feeds) {
      for (const rel of [feed.spec.path, feed.spec.jsonPath]) {
        if (!fs.existsSync(path.join(OUT, rel))) missingFiles.push(rel);
      }
    }
    if (missingFiles.length) fail(`订阅文件缺失：${missingFiles.slice(0, 4).join('、')}${missingFiles.length > 4 ? ` 等 ${missingFiles.length} 个` : ''}`);
    for (const problem of result.problems.slice(0, 8)) {
      fail(`订阅[${problem.code}] ${problem.feed}：${problem.detail}`);
    }
    if (result.problems.length > 8) fail(`订阅问题共 ${result.problems.length} 处（上面只列了前 8 处）`);
    if (!result.problems.length && !missingFiles.length) {
      console.log(`  ✓ 订阅: ${built.feedStats.count} 个 Feed × 2 种格式 = ${built.feedStats.files} 个文件 · ` +
        `${built.feedStats.items} 条条目（三方对账 · id 唯一 · 链接可解析 · 判据一致 · 时间来自数据）` +
        (built.feedStats.empty.length ? ` · 显式允许为空的：${built.feedStats.empty.join('、')}` : ''));
    }
  }

  // 订阅发现：HTML 里声明的每一条 rel="alternate" 都必须指向真实存在的 Feed，
  // 且 title 与那份 Feed 自己的 <title> **逐字相同** —— 这条是「改了注册表忘了改页面」
  // 唯一会红的地方（首页 8 条由注册表注入，其余页面各处只用 rootFeedTags 这一份）。
  {
    const byPath = new Map();
    for (const feed of built.feedBundle.feeds) {
      byPath.set(feed.spec.path, feed.spec.title);
      byPath.set(feed.spec.jsonPath, feed.spec.title);
    }
    const progress = [];
    const problems = [];
    let declared = 0;
    for (const [rel, label, prefix] of [
      ['index.html', '首页', ''],
      ['status/index.html', '状态页', '../'],
      ['changes/index.html', '变化雷达页', '../'],
      ['feeds/index.html', '订阅中心', '../'],
      [`${plansHubPage.PLANS_HUB_ROUTE}index.html`, '资料入口页', '../'],
      // v3.0 Stage D5/D6：模型页同样声明根 Feed（订阅发现按深度逐页对账）。
      [`${modelsPage.MODELS_INDEX_ROUTE}index.html`, '模型资料索引', '../'],
      ...built.modelDetailRoutes.map(route => [`${route}index.html`, `/${route}`, '../../']),
      // v3.0 Stage F：档案页同样声明根 Feed（订阅发现按深度逐页对账）。
      // 详情页前缀同样问 `lib/archive.js` 要（唯一深度真相）。
      [`${archiveLib.ARCHIVE_INDEX_ROUTE}index.html`, '历史档案', '../'],
      ...built.archiveDetailRoutes.map(route => [
        `${route}index.html`, `/${route}`, archiveLib.routePrefixOf(route)
      ]),
      // v3.0 Stage G：数据文档页同样声明根 Feed。
      [`${dataDocs.DATA_DOCS_ROUTE}index.html`, '数据文档', '../../'],
      [`${plansPage.PLANS_ROUTE}index.html`, '套餐对比页', '../../'],
      ...built.collectionPages.map(page => [`${page.slug}/index.html`, `/${page.slug}/`, '../']),
      ...built.needPages.map(page => [`${page.route}index.html`, `/${page.route}`, '../../']),
      // v1.7：新增的四类页面同样要声明订阅源（分类页/厂商页还各有自己的那一份 Feed）。
      // 深度按路由段数推导，不写死。
      ...built.directoryPages
        .filter(page => page.kind === 'category' || page.kind === 'vendor' || page.kind === 'hub' || page.kind === 'alias')
        .map(page => [`${page.route}index.html`, `/${page.route}`,
          '../'.repeat(page.route.split('/').filter(Boolean).length)])
    ]) {
      const file = path.join(OUT, rel);
      if (!fs.existsSync(file)) { problems.push(`${label} 的产物文件缺失`); continue; }
      const page = fs.readFileSync(file, 'utf8');
      let count = 0;
      for (const m of page.matchAll(/<link rel="alternate" type="(application\/rss\+xml|application\/feed\+json)" title="([^"]*)" href="([^"]*)">/g)) {
        count++;
        declared++;
        const title = feeds.unescapeXml(m[2]);
        const href = m[3];
        if (!href.startsWith(prefix)) { problems.push(`${label} 的 ${href} 深度前缀不是 ${prefix || '(空)'}`); continue; }
        const route = href.slice(prefix.length);
        const expected = byPath.get(route);
        if (!expected) { problems.push(`${label} 声明了不存在的订阅源 ${href}`); continue; }
        if (expected !== title) problems.push(`${label} 的 ${href} 标题「${title}」≠ Feed 自己的「${expected}」`);
        if (m[1] === 'application/rss+xml' && !route.endsWith('.xml')) problems.push(`${label} 的 RSS 类型与后缀不符：${href}`);
        if (m[1] === 'application/feed+json' && !route.endsWith('.json')) problems.push(`${label} 的 JSON Feed 类型与后缀不符：${href}`);
      }
      // 每个页面都必须真的声明了订阅源（只查「没有残留」不够，把整段删掉同样没有残留）
      if (count === 0) problems.push(`${label} 一条 rel="alternate" 都没有`);
      progress.push(`${label}${count}`);
    }
    if (problems.length) fail(`订阅发现不一致：${problems.slice(0, 4).join('、')}`);
    else console.log(`  ✓ 订阅发现: ${declared} 条 rel="alternate" 横跨 ${progress.length} 个页面，全部指向真实 Feed 且标题逐字一致`);
  }

  // 订阅中心页：五条约定（预渲染 / 无 JS 可读 / sitemap / 双 feed / JSON-LD）+
  // 页面上列出的每一个订阅地址都必须真的存在。
  {
    const file = path.join(OUT, 'feeds/index.html');
    if (!fs.existsSync(file)) fail('缺少 feeds/index.html');
    else {
      const page = fs.readFileSync(file, 'utf8');
      const problems = [];
      if (!page.includes(`<link rel="canonical" href="${SITE_URL}feeds/">`)) problems.push('canonical 不是自指');
      if (/__[A-Z_]+_HREF__/.test(page)) problems.push('残留路由占位符');
      if (!page.includes('href="../feed.xml"') || !page.includes('href="../feed.json"')) problems.push('没有声明根订阅源');
      let ldTypes = [];
      try {
        ldTypes = [...page.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1])['@type']);
      } catch (error) {
        problems.push('JSON-LD 解析失败: ' + error.message);
      }
      if (JSON.stringify(ldTypes.slice().sort()) !== JSON.stringify(['BreadcrumbList', 'CollectionPage'])) {
        problems.push(`JSON-LD 不是恰好两段：${ldTypes.join(', ')}`);
      }
      // 页面上每个绝对订阅地址都要有对应的产物文件（相对路径还原成站内路由）
      const listed = [...new Set([...page.matchAll(new RegExp(`href="${SITE_URL.replace(/[.]/g, '\\.')}([^"]+)"`, 'g'))].map(m => m[1]))];
      for (const route of listed) {
        if (route.endsWith('/')) continue;
        if (!fs.existsSync(path.join(OUT, route))) problems.push(`列出的订阅地址没有文件：${route}`);
      }
      // v3.0 Stage H（队长 B1）：**注册表里每个变化源都必须出现在这一页上**。
      // P3-4：这条断言从「只盯 PLAN_CHANGE_FEEDS」扩成**注册表 → 页面 / 页面 → 注册表双向对账**
      // （唯一实现在 `lib/feeds.js` 的 `checkFeedsPage()`）：分类 Feed 那一组曾经整组漏在这里，
      // 而当时所有断言都绿 —— 因为页面上少列一条、自检里也没有任何一条要求它必须出现。
      const audit = feeds.checkFeedsPage({ feedList: built.feedBundle.feeds, page, siteUrl: SITE_URL });
      for (const problem of audit.problems) problems.push(problem);
      // hidden/internal 的 Feed 不许留产物文件：隐藏 = 「这份订阅不属于公开产品」，
      // 不是「页面少列几行」（文件还在 = 读者仍能拿到地址 ⇒ 有产出、无总览入口，正是 P3-4）。
      for (const feed of built.feedBundle.feeds) {
        if (feeds.isPublicSpec(feed.spec)) continue;
        for (const rel of [feed.spec.path, feed.spec.jsonPath]) {
          if (fs.existsSync(path.join(OUT, rel))) problems.push(`hidden/internal 的 Feed 仍有产物文件：${rel}`);
        }
      }
      const text = page.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (text.length < 600) problems.push(`预渲染正文过短（${text.length} 字）——无 JS 时读不到内容`);
      if (!/没有账号|没有邮件列表/.test(text)) problems.push('没有说明「不需要账号」');
      if (problems.length) fail(`订阅中心：${problems.join('；')}`);
      else console.log(`  ✓ 订阅中心: /feeds/ 五条约定齐（自指 canonical · 双 feed · 两段 JSON-LD · 预渲染 ${text.length} 字 · ` +
        `${listed.length} 个订阅地址全部存在）· 双向对账：注册表 ${audit.publicCount} 个 public Feed ↔ 页面列出 ${audit.listedCount} 条地址`);
    }
  }

  // FAQ 可见文案与 FAQPage 必须逐字一致。
  //
  // 两层断言，缺一不可：
  //   ① 用 visibleFaq() 从产物**独立**回读可见文案（与生成侧不同源，段落拆法也不同），
  //      逐条比对问题与「各段用单空格拼接」的答案 —— 抓截断、丢段、边界处理分叉；
  //   ② 结构化答案里**不许出现 HTML 标签** —— 标签不是答案文本，搜索引擎会把它们
  //      当字面文字读给用户；这一层不依赖任何解析实现，是最硬的兜底。
  // （原来的实现可见侧也调 extractFaq()，两侧同源 ⇒ 比较恒等、永远不可能失败。）
  try {
    const faq = ldBlocks.map(b => JSON.parse(b)).find(d => d['@type'] === 'FAQPage');
    if (faq) {
      const visible = visibleFaq(html);
      const schema = faq.mainEntity.map(q => ({ question: q.name, answer: q.acceptedAnswer.text }));
      const problems = [];

      if (visible.length !== schema.length) {
        problems.push(`条数：可见 ${visible.length} / 结构化 ${schema.length}`);
      }
      visible.forEach((item, i) => {
        if (!schema[i]) return;
        if (item.question !== schema[i].question) problems.push(`第 ${i + 1} 条问题不一致`);
        if (item.paragraphs.join(' ') !== schema[i].answer) problems.push(`第 ${i + 1} 条答案不一致`);
      });
      schema.forEach((item, i) => {
        const tags = item.answer.match(/<\/?[a-z][^>]*>/gi);
        if (tags) problems.push(`第 ${i + 1} 条答案夹带 HTML 标签 ${[...new Set(tags)].join(' ')}`);
      });

      if (problems.length) fail(`FAQ 可见文案与 FAQPage 不一致：${problems.join('；')}`);
      else console.log(`  ✓ FAQ 文案与结构化数据一致: ${visible.length} 条（可见侧独立回读 + 无标签残留）`);
    }
  } catch (e) {
    fail('FAQ 一致性校验失败: ' + e.message);
  }

  // SEO 安全门禁（v1.7）：把**刚刚写下的全部页面**交给 `seo.validate()` 过一遍。
  //
  // 这一段是全站唯一一处「跨页面」的检查：标题/canonical 是否唯一、ItemList 与页面
  // 数据行是否一致、面包屑每一级是否真实存在、sitemap 与索引策略是否一致、
  // 有没有孤儿页、摘要数字能不能被独立重算。单页自检再多也照不到这些问题 ——
  // 它们全都只在**页面之间**才成立。
  //
  // 描述符从磁盘回读（而不是复用内存里刚生成的字符串）：这样「写盘时写坏了」
  // 也会被照到。`npm run verify:seo` 会用**另一套解析**再跑一次同一批规则。
  {
    const sitemapXml = fs.readFileSync(path.join(OUT, 'sitemap.xml'), 'utf8');
    const sitemap = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
    const sitemapSet = new Set(sitemap.map(url => url.slice(SITE_URL.length)));
    const published = JSON.parse(fs.readFileSync(path.join(OUT, 'deals.json'), 'utf8')).deals;
    const dealsById = new Map(published.map(deal => [deal.id, deal]));
    const descriptors = [];
    const readPage = (route, meta) => {
      const rel = route === '' ? 'index.html' : `${route}index.html`;
      const file = path.join(OUT, rel);
      if (!fs.existsSync(file)) { fail(`SEO 门禁：缺少页面文件 ${rel}`); return null; }
      return Object.assign({
        route,
        html: fs.readFileSync(file, 'utf8'),
        indexable: true,
        inSitemap: sitemapSet.has(route),
        itemIds: [],
        childRoutes: [],
        summary: []
      }, meta);
    };
    const fixed = [
      readPage('', {
        kind: 'home', expectItemList: true,
        // 首页的 ListItem 指向**官方页面**（v0.9 起的设计），而页面可见的卡片按折叠后的
        // 条数渲染（一张折叠卡覆盖多条优惠）—— 因此行数对账与成员对账在首页不适用，
        // 它由首页自己那几条断言守着（卡片数 / CTA 数 / 折叠无损 / JSON-LD 类型集合）。
        checkItemListRows: false, checkItemListMembers: false
      }),
      readPage('status/', { kind: 'status', expectItemList: false }),
      // v1.5 修复（P1-4）：变化页的 ItemList 成员就是本站的优惠详情页（`deal/<id>/`），
      // 因此 `itemIds` 传**判据层去重后的同一份集合**（不再留空 —— 留空等于声明
      // 「成员必须属于本页」，却没有任何集合可对，每一条成员都会被判成「不属于本页」）。
      // 行数对账（声明数 == 元素数 == 页面 data-item 行数）由页面的代表行标记承担。
      readPage('changes/', {
        kind: 'changes',
        expectItemList: true,
        itemIds: built.changesItemList.map(record => record.id)
      }),
      readPage('feeds/', { kind: 'feeds', expectItemList: false }),
      // v3.0 Stage B：/plans/ 资料入口。三个开的默认值都来自 `lib/page-kinds.js` 的声明
      // （`plans-hub`：ItemList 在场 + 行数对账 + 成员对账关掉）。
      // 成员对账关掉的理由与首页/对比页同源：ItemList 指向**子页**，而 `seo.js` 的成员判据
      // 按站内 `deal/<id>/` 判 —— 这一页的成员一致性由它自己的 `assertItemListHonesty()` 查
      // （构建期已在磁盘回读那一段跑过），这里只保留在场性与行数两条。
      // `count` 是这一页的子页数（2），不是条目数：它决定 itemlist 行数对账的口径。
      readPage(`${plansHubPage.PLANS_HUB_ROUTE}`, {
        kind: 'plans-hub',
        count: plansHubPage.PLANS_HUB_CHILDREN.length
      }),
      // v3.0 Stage D5：模型索引。非优惠实体页 —— ItemList 的成员是**本站的模型详情页**，
      // 而 `seo.js` 的成员判据按站内 `deal/<id>/` 判，因此显式关掉成员对账
      // （在场性 + 声明数 == 元素数 + 声明数 == `data-item` 行数三条照常查）。
      // 成员一致性由页面自己的 `assertPageHonesty` 查（构建期已在写盘前后各跑一次）。
      readPage(`${modelsPage.MODELS_INDEX_ROUTE}`, {
        kind: 'models-index',
        checkItemListMembers: false,
        count: built.modelDetailCount
      }),
      // v3.0 Stage F：档案索引。同样是「非优惠实体页」——ItemList 成员是档案条目，
      // 不是 `deal/<id>/`，因此显式关掉成员对账（在场性与行数照常查）。
      readPage(`${archiveLib.ARCHIVE_INDEX_ROUTE}`, {
        kind: 'archive-index',
        checkItemListMembers: false,
        count: built.archiveEntries.length
      }),
      // v3.0 Stage G：数据文档页。ItemList 成员是**数据集 endpoint**（静态文件），
      // 不是站内 `deal/<id>/`，因此显式关掉成员对账；行数 = Manifest 数据集数。
      readPage(`${dataDocs.DATA_DOCS_ROUTE}`, {
        kind: 'data-docs',
        checkItemListMembers: false,
        count: built.dataManifest.count
      }),
      // v2.1：套餐对比页。ItemList 指向**各自的官方定价页**（与首页同一口径），
      // 所以成员校验对不上（它按站内 `deal/<id>/` 判成员）—— 显式关掉那一条，
      // 而不是为了让断言通过去伪造一个本站不存在的套餐详情页。
      // 行数校验**保留**：ItemList 条数必须等于页面上的 `data-item` 行数。
      readPage(`${plansPage.PLANS_ROUTE}`, {
        kind: 'plans',
        expectItemList: true,
        checkItemListMembers: false,
        // v2.3 / v3.0：这一页有专属的套餐变化源，必须声明它（与根 Feed 并列）。
        // 判据从注册表取 —— 不再写死 spec id。
        feedMatch: feeds.feedsForPage({ route: plansPage.PLANS_ROUTE }, built.feedBundle.feeds).map(feed => feed.spec.id),
        count: JSON.parse(fs.readFileSync(path.join(ROOT, 'plans.json'), 'utf8')).count
      }),
      // v2.5：API 计费页。与套餐页同样：ItemList 指向**各自的官方定价页**，
      // 所以成员校验不适用（本站不为每个模型编一个详情页）；行数校验保留。
      // v3.0 Stage H：这一页**有了自己的订阅源**（API 价格变化），因此与套餐页一样声明 feedMatch。
      readPage(`${apiPlansPage.API_PLANS_ROUTE}`, {
        kind: 'plans',
        expectItemList: true,
        checkItemListMembers: false,
        feedMatch: feeds.feedsForPage({ route: apiPlansPage.API_PLANS_ROUTE }, built.feedBundle.feeds).map(feed => feed.spec.id),
        count: JSON.parse(fs.readFileSync(path.join(ROOT, 'api-plans.json'), 'utf8')).count
      })
    ].filter(Boolean);
    const dealDescriptors = dealEntries.map(deal => readPage(`deal/${encodeURIComponent(deal.id)}/`, {
      kind: 'deal', expectItemList: false, itemIds: [deal.id]
    })).filter(Boolean);
    // v3.0 Stage D6：模型详情页。它是**详情叶子**（刻意没有 ItemList），而且是"非优惠实体页" ——
    // 成员对账必须显式关掉（成员判据按 `deal/<id>/` 判，模型页上永远对不上）。
    const modelDescriptors = built.modelDetailRoutes.map(route => readPage(route, {
      kind: 'model',
      expectItemList: false,
      checkItemListRows: false,
      checkItemListMembers: false,
      count: 0
    })).filter(Boolean);
    // v3.0 Stage F：档案详情页。同属「非优惠实体页 + 详情叶子」：
    // 没有 ItemList（在场性/行数/成员三条都显式关掉），成员一致性由页面自己的断言查。
    const archiveDescriptors = built.archiveDetailRoutes.map(route => readPage(route, {
      kind: 'archive-detail',
      expectItemList: false,
      checkItemListRows: false,
      checkItemListMembers: false,
      count: 0
    })).filter(Boolean);
    const directoryDescriptors = built.directoryPages.map(page => readPage(page.route, {
      kind: page.kind,
      indexable: page.indexable,
      inSitemap: sitemapSet.has(page.route),
      itemIds: page.itemIds,
      childRoutes: page.childRoutes,
      summary: page.summary,
      count: page.count,
      pinned: page.pinned,
      expectItemList: true,
      feedMatch: page.feedMatch,
      // v3.0 Stage E：厂商页的门槛判据（`seo.js` 按与 landing **同一条 OR** 判）。
      // 不传这两个字段时 seo.js 的行为与 v2.x 逐字相同（只查条数）。
      eventCount: page.eventCount,
      nonDealMaterial: page.nonDealMaterial
    })).filter(Boolean);
    descriptors.push(...fixed, ...dealDescriptors, ...modelDescriptors, ...archiveDescriptors, ...directoryDescriptors);

    const result = seo.validate(descriptors, {
      siteUrl: SITE_URL,
      sitemap,
      pinned: landing.loadPinned().map(row => row.route),
      aliases: landing.loadAliases(),
      thresholds: {
        categoryMinDeals: landing.CATEGORY_MIN_DEALS,
        vendorMinDeals: feeds.VENDOR_THRESHOLDS.minDeals
      },
      dealsById,
      asOf: built.lastmod,
      vendorKeyOf: VENDOR_KEY_OF,
      feedSpecs: built.feedBundle.feeds.map(feed => feed.spec),
      // 静态文件的清单**从磁盘现场走一遍**，不手写：手写的清单漏一个就会把一条
      // 正常链接判成死链（第一版就漏了 46 个 Feed 文件，一次报出 76 条假红）。
      staticFiles: (() => {
        const set = new Set();
        const walk = (dir, base) => {
          for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const rel = base ? `${base}/${entry.name}` : entry.name;
            if (entry.isDirectory()) walk(path.join(dir, entry.name), `${rel}`);
            else if (entry.name !== 'index.html') set.add(rel);
          }
        };
        walk(OUT, '');
        return set;
      })(),
      gate: { skipped: built.plan.skipped }
    });
    if (result.problems.length) {
      const byCode = seo.summarize(result).byCode;
      for (const problem of result.problems.slice(0, 12)) {
        fail(`SEO[${problem.code}] ${problem.route}：${problem.detail}`);
      }
      if (result.problems.length > 12) {
        fail(`SEO 还有 ${result.problems.length - 12} 处问题未逐条打印（按码统计：${JSON.stringify(byCode)}）`);
      }
    } else {
      const s = result.stats;
      console.log(`  ✓ SEO 安全门禁: ${seo.PROBLEM_CODES.length} 个检查码 × ${s.pages} 个页面全过` +
        `（可索引 ${s.indexable} · 别名 ${s.noindex} · 详情页 ${s.dealPages} · 落地页 ${s.landingPages} · ` +
        `厂商页 ${s.vendorPages} · 分类页 ${s.categoryPages} · sitemap ${s.sitemapEntries} · ` +
        `孤儿 ${s.orphans} · 重复 canonical ${s.duplicateCanonical} · 无效内链 ${s.invalidLinks}）`);
    }
  }

  // OG 图必须是合法 PNG 且尺寸正确
  const png = fs.readFileSync(path.join(OUT, 'og-image.png'));
  const isPng = png.slice(0, 8).toString('hex') === '89504e470d0a1a0a';
  const pngW = png.readUInt32BE(16);
  const pngH = png.readUInt32BE(20);
  if (!isPng) fail('og-image.png 不是合法 PNG');
  else if (pngW !== 1200 || pngH !== 630) fail(`og-image.png 尺寸异常 ${pngW}x${pngH}`);
  else console.log(`  ✓ og-image.png: ${pngW}x${pngH}`);

  const size = fs.readdirSync(OUT).reduce((n, f) => n + fs.statSync(path.join(OUT, f)).size, 0);
  console.log(`  产物总大小: ${(size / 1024).toFixed(1)} KB`);
  console.log(failed ? `\n❌ 产物自检失败（${failed} 项）` : '\n✅ 产物自检通过');
  return failed === 0;
}

/* ------------------------------------------------------------------ */
/* 暂存 → 最终：只有全部自检通过才替换                                  */
/* ------------------------------------------------------------------ */

/** 自检失败（selfCheck 已经逐项打印过原因）——不是异常，只是构建不通过 */
class SelfCheckFailed extends Error {}

function sleepMs(ms) {
  // 同步脚本里等一小会儿：Windows 上杀软/同步客户端/静态服务可能短暂占住目录，
  // rename 会 EPERM/EBUSY，一次瞬时占用不该把一份已经造好的产物判死。
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function renameWithRetry(from, to, attempts = 10) {
  for (let i = 1; ; i++) {
    try {
      fs.renameSync(from, to);
      return;
    } catch (err) {
      if (i >= attempts) throw err;
      sleepMs(50 * i);
    }
  }
}

/**
 * 暂存目录 → 最终目录。
 *
 * 不做「先 rmSync(FINAL_OUT) 再 rename」：那样在两步之间磁盘上没有任何完整产物，
 * 中途挂掉就等于旧产物没了、新产物还没就位。这里的两步 rename 让旧目录先整块搬到
 * 备份名（同卷 rename，内容始终完整），新目录就位之后才删备份；第二步 rename 失败
 * 还能把旧目录原样搬回来——构建失败绝不等于产物消失。
 */
function promoteStaging() {
  const backup = `${FINAL_OUT}.stale`;
  fs.rmSync(backup, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  const hadOld = fs.existsSync(FINAL_OUT);
  if (hadOld) renameWithRetry(FINAL_OUT, backup);
  try {
    renameWithRetry(STAGE_OUT, FINAL_OUT);
  } catch (err) {
    // 回滚：最终目录回到替换之前的样子，绝不留下「没有产物」的状态
    if (hadOld && !fs.existsSync(FINAL_OUT)) renameWithRetry(backup, FINAL_OUT);
    throw err;
  }
  if (hadOld) fs.rmSync(backup, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}

function removeDirWithRetry(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  } catch (err) {
    console.error(`  ⚠️  清理失败 ${showOut(dir)}: ${err.message}`);
  }
}

/**
 * 替换中途失败时的兜底：最终目录不在、备份还在，就把备份搬回去。
 * （promoteStaging 内部已经回滚过一次，这里防的是「连回滚那次 rename 也失败」。）
 */
function restoreBackupIfNeeded() {
  const backup = `${FINAL_OUT}.stale`;
  if (!fs.existsSync(backup) || fs.existsSync(FINAL_OUT)) return;
  try {
    renameWithRetry(backup, FINAL_OUT);
    console.error(`  ↩️  已把上一份产物从 ${showOut(backup)} 恢复到 ${showOut(FINAL_OUT)}`);
  } catch (err) {
    console.error(`  ⚠️  ${showOut(FINAL_OUT)} 缺失且备份恢复失败（原样保留 ${showOut(backup)}）：${err.message}`);
  }
}

/** 失败路径：清掉暂存目录；FINAL_OUT 原封不动 */
function discardStaging() {
  removeDirWithRetry(STAGE_OUT);
  // 备份目录只在最终目录确实存在时才删。否则它可能是上一份产物的唯一一份
  // （替换失败且回滚也失败），删掉就等于把用户仅有的产物弄丢了。
  if (fs.existsSync(FINAL_OUT)) removeDirWithRetry(`${FINAL_OUT}.stale`);
  else if (fs.existsSync(`${FINAL_OUT}.stale`)) {
    console.error(`  ⚠️  保留备份目录 ${showOut(`${FINAL_OUT}.stale`)}（${showOut(FINAL_OUT)} 不在，它是上一份产物）`);
  }
}

function main() {
  runValidate();
  const built = assemble();
  // selfCheck 用「返回 false」而不是抛错表示失败；抛错（如 og-image 自检）与返回 false
  // 都必须走下面同一个 catch。只有全部自检通过，才允许把暂存目录换成最终目录。
  if (!selfCheck(built)) throw new SelfCheckFailed('产物自检未通过');
  promoteStaging();
  console.log(`\n✅ 构建完成 → ${showOut(FINAL_OUT)}（自检全过，已从暂存目录就位）`);
}

try {
  main();
} catch (err) {
  restoreBackupIfNeeded();
  discardStaging();
  console.error(`\n❌ 构建失败：${err instanceof SelfCheckFailed ? err.message : (err && err.stack) || String(err)}`);
  console.error(`   ${showOut(FINAL_OUT)} 未被改动${fs.existsSync(FINAL_OUT) ? '' : '（原本不存在，现在仍不存在）'}；暂存目录已清理，可直接重跑。`);
  process.exit(1);
}
