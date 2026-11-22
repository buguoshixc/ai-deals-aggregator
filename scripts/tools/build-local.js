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
 * 页面壳的样式纪律（布局治理）：**共享规则只有一处出处 —— index.html 的共享 `<style>`**。
 *   · `.detail-main`（详情内容列 1120px）与 `.snote`（页面级说明）都写在那里；
 *   · 各页面壳的局部 `<style>` **只写自己独有的规则**，不再复制共享规则的第二份宽度
 *     （本文件原先有 8 份页面级 `.snote` 宽度副本，其中 4 份把说明压成了阅读列 —— 已全部删除）；
 *   · 文档序是「共享 `<style>` → 页面局部 `<style>`」，所以删掉局部副本之后就是
 *     「一处定义、全站生效」，与 `.detail-main` 同一条纪律。
 *   一页属于哪个布局族（Wide Data Page / Leaf Detail Page / Prose Page）声明在
 *   `scripts/lib/page-kinds.js` 的 LAYOUT_FAMILIES；要改说明的宽度，改共享那一处，别在页面壳里另立一份。
 *
 * 用法：node scripts/tools/build-local.js [--out=dist]
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { render: renderOgImage, selfCheck: selfCheckOgImage } = require('../lib/og-image');
const { load: loadLogos, write: writeLogos } = require('../lib/logos');
const icons = require('../lib/icons');
const { load: loadRenderCore } = require('../lib/render-core');
const appAsset = require('../lib/app-asset');
const styleAsset = require('../lib/style-asset');
const { attach: attachZh, summarize: summarizeZh } = require('../lib/zh');
const health = require('../lib/health');
const audience = require('../lib/audience');
const provenance = require('../lib/provenance');
const history = require('../lib/history');
// v3.2：订阅产物（Atom 1.0 + JSON Feed 1.1）。唯一表 `FEED_FILES`、条目构造 `buildFeedEntries`、
// 两个渲染器全在 `lib/feed.js` 里；本文件**不写第二份文件名 / MIME 字面量** ——
// 契约第 1.4 条那台机器牙扫的就是这个文件的**代码**（`'feed.xml'` 这类字面量一处就红，见 feed-selftest）。
const feed = require('../lib/feed');
// v3.4 F2：到期日历（expiry.ics）的唯一产物表与纯函数构造器。文件名只在 lib/calendar.js 里出现。
const calendar = require('../lib/calendar');
// v3.2：引文「元自称」清单（逐字 / 一字不差 / verbatim …）的**唯一出处**。构建期自检用它把两个订阅
// 产物也纳入扫描面；清单本身不在这里复制一份 —— validate.js 只在作为脚本跑时才执行 main()，
// require 它拿到的就是那份判据导出（`provenance-selftest` 用的也是它）。
const validate = require('../validate');
const changes = require('../lib/changes');
// t4：订阅层（`lib/feeds.js`）从本文件**彻底摘掉**了 —— 注册表、Feed 落盘、/feeds/ 页面、
// 订阅发现标签、订阅自检全部随订阅子系统下架一起删除。文件本身还在（`verify-site.js` 的
// 订阅专属检查暂时还 require 它，归后续任务逐块删除），但构建期不再有任何 `feeds.*` 调用。
// 失效方式（历史教训，留作说明）：只删 require 不删调用点 ⇒ 构建启动即 ReferenceError；
// 只删调用点不删 require ⇒ 一个"看起来还在用"的死依赖（本文件曾经就有几十处）。
const site = require('../lib/site');
const landing = require('../lib/landing');
// v3.0 Stage E：厂商统一资料页（五个资料区块 + 四条诚实性断言；t3 删掉「订阅」一节）。
const vendorPage = require('../lib/vendor-page');
const seo = require('../lib/seo');
// issue #150：`<title>` / meta description 的预算适配层。它是纯函数，唯一的上限出处是
// `seo.TITLE_MAX_LENGTH`（80）与 `page-fit.DESC_MAX_LENGTH`（150）。**谁拼后缀，谁必须经过这里**：
// 原先每个拼接点各自 slice（或不 slice），于是「合法数据」能把产物顶过门禁、让发布停版。
const pageFit = require('../lib/page-fit');
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
// v3.1：API 成本计算器（/tools/api-cost/）。算法在 lib/api-cost.js，正文渲染在 lib/api-cost-page.js。
const apiCostPage = require('../lib/api-cost-page');
// v3.0：`/plans/` 统一资料入口（AI 套餐与 API 计费资料库）。正文渲染同样住在 lib 里，
// 因为它要能被离线自测直接调用；这一页**不复制** /plans/coding/ 与 /plans/api/ 的表，
// 只给计数、口径、变化与仍然有效的关联优惠（变化与关系都复用既有判据，见该文件头注释）。
const plansHubPage = require('../lib/plans-hub-page');
// search-intent-v1（W2）：目录页事实摘要。**唯一实现**在 lib 里，门禁重算（verify-site §22e）
// require 的是同一个模块 —— 页面口径与断言口径因此不可能各写一份。
const factSummary = require('../lib/fact-summary');
// v3.0 Stage D5/D6：模型资料索引与详情页（`/models/` 与 `/models/<slug>/`）。
// 正文渲染住在 lib 里（可被离线自测直接调用）；身份 / 映射 / 派生时间线全部走
// `lib/model-registry.js` 的同一份判据 —— 页面层不自己算 id，也不判"两个名字是不是同一个模型"。
const modelsPage = require('../lib/models-page');
const priceHistory = require('../lib/price-history');
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
// t4：数据出口子系统（`/docs/data/` + `/data/index.json` Manifest）整体下架之后，
// 那条「产物里每个 *.json 都必须被某个注册表认领」的闭环换成更窄更硬的一版：
// **产物里不许有数据文件**，只允许一份明确定义的例外（首页应用自己的数据资源）。
// 唯一注册表在 `lib/published-assets.js`（逐路径 + 理由，不许通配）。
const publishedAssets = require('../lib/published-assets');
// v3.0：页面类型声明表 —— 路由 → kind / 正文下限 / ItemList 要求 / sitemap priority 的唯一出处。
// 构建期与独立门禁（tools/seo-verify.js）都读它，但**各自从 dist 解析**（执行路径不合并）。
const pageKinds = require('../lib/page-kinds');
// architecture-modernization-v1：**页面壳的唯一出口**。
// 原先 9 个页面族各自手写一份 `<!DOCTYPE html>`…`</html>`、各自从 index.html 抽共享
// `<style>` / 主题脚本 / 页脚、各自调一次 finalizePage —— 实测那 9 份是逐字相同的。
// 现在：文档脚手架只有一处实现，布局族按 kind 查 page-kinds.js，差异由显式参数承载。
const shell = require('../lib/page-shell');
// 英文单页（`/en/`）：独立 kind `home-en`，只收原文就是英文的 global 条目。
// 正文渲染是纯函数（不读盘/不联网），收录口径与排除表都在那个模块里，这里只负责写盘与计数。
const enPage = require('../lib/en-page');
const planChanges = require('../lib/plan-changes');
const providers = require('../lib/providers');
// v2.4：优惠 ↔ 套餐关系层。真值在 scripts/data/deal-plan-links.json，
// 这里只读、只校验、只派生（注入 dist/assets/data/offers.json）。t4 起**不再发布**
// dist/deal-plan-links.json —— 那份发布副本随本轮数据文件下架一起删除。
const dealPlanLinks = require('../lib/deal-plan-links');
// private-analytics-v1：私有站点分析（Cloudflare Web Analytics）。
// 定义只有一处 —— `lib/analytics.js` 的 ANALYTICS-GUARD 区块就是浏览器里跑的那段源码；
// 「这一页要不要统计」只有一处声明 —— `lib/analytics-routes.js` 的 ROUTE_RULES。
// 构建期做三件事：按路由注入 beacon / 断言每页 exactly 1 / 断言产物里不留占位符。
//
// 注入与那两条断言现在住在 `lib/page-shell.js` 的 `finalizePage()`（页面 HTML 的唯一收尾动作），
// 本文件只在产物自检里用 `analytics.stripBootstrap()` 对磁盘上的真实字节做对账 ——
// 所以这里**不再** require `analytics-routes`：路由→统计范围的判据只有一个消费者，就是页壳。
const analytics = require('../lib/analytics');
// v3.3：IndexNow（主动告诉搜索引擎「哪些 URL 刚刚变了」）。
// 它的密钥文件必须能在站点根被原样 GET 到，所以它进产物；而**文件名与 keyLocation 的唯一出处**
// 是 `lib/indexnow.js` —— 本文件与 `lib/published-assets.js` 都只调 `keyFileName()`，
// 不许写第二份字面量（与 `FEED_FILES` 那条纪律同款，由 indexnow-selftest 的字面量扫描牙复核）。
const indexnow = require('../lib/indexnow');
// v1.8-seo-answer-pages：站点归属验证（GSC / 百度）的 token 唯一出处与注入实现。
// 本文件只调用，不读第二份 token、不手写 meta 名 —— 与 indexnow / FEED_FILES 同一条纪律。
const siteVerification = require('../lib/site-verification');
// v1.8-seo-answer-pages：答案页「门槛速查」的判据层（三态聚合 / 限流 / 商用 / 地区 / 免费额度）。
// 目录页（/free-api/）与 API 计费页（/plans/api/）共用这一份 —— 两个页面族各写一套口径必然分家。
const thresholdSummary = require('../lib/threshold-summary');
// v1.8-seo-answer-pages：`/docs/data/` 数据文档与引用页（部分反转 t4 的去数据暴露）。
// 它**不发布数据文件**，只说明数据集许可 / 引用格式 / 字段口径（数据真值留在公开仓库）。
const dataDocsPage = require('../lib/data-docs-page');
// v3.4 F3：全站搜索。索引推导与目录渲染各有唯一实现；过滤脚本与 plans-compare 同款双宿主。
const searchIndex = require('../lib/search-index');
const searchPage = require('../lib/search-page');

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

/**
 * API 成本计算器的交互逻辑**源码**（逐字节内联进页面，与 plans-compare 同一套路）。
 */
function searchFilterSource() {
  return fs.readFileSync(path.join(__dirname, '..', 'lib', 'search-filter.js'), 'utf8');
}

function apiCostSource() {
  return fs.readFileSync(path.join(__dirname, '..', 'lib', 'api-cost.js'), 'utf8');
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
 * 页面级说明意图清单的**文件名口径**（`_notes.ndjson`）。
 *
 * 为什么是 `.ndjson` 而不是 `.json`：当年的判据是「产物里每个 `*.json` 都必须被某个注册表认领」
 * （那条判据原在 `lib/data-docs.js`，**已随数据出口子系统整体下架**；今天对应这条纪律的是
 * `lib/published-assets.js` 的「产物里不许有数据文件」）。完整论证见下面
 * 「页面级说明的构建期意图清单」一节。
 *
 * ⚠️ t3 起它**不再进产物目录**（曾经的路径是 `dist/_notes.ndjson`）：它是构建过程的
 * **意图侧快照**，不是上线内容 —— 留在产物里，等于给任何以产物目录为根的预览服务
 * 多送一份「构建期维护口径」的可下载文件。落盘位置见下面的 `NOTES_MANIFEST_PATH`。
 */
const NOTES_MANIFEST_FILE = '_notes.ndjson';

/**
 * 说明意图清单的**实际落盘位置**：产物目录的**兄弟文件**。
 *
 * 默认产物是 `dist/` ⇒ `dist.notes.ndjson`；`--out=dist.deexpose` ⇒ `dist.deexpose.notes.ndjson`
 * （名字按产物目录名派生，所以"这份清单是给哪个目录用的"看一眼就知道）。
 *
 * **为什么是兄弟文件而不是仓库根写死一个名字**：`verify-site.js` §22c ⑨ 支持 `--dir=<产物副本>`，
 * 拿哪一份产物去验、就应该读哪一次构建的意图侧。
 *
 * ⚠️ **本轮接受的性质下降（写出来，免得变成一次静默的口径变化）**：清单一旦移出产物目录，
 * 它就不再是「这份产物自己的意图侧」，而变成「本工作树**最后一次成功构建**的意图侧」。
 * 用 `--dir=` 指向另一份产物副本时，§22c ⑨ 读到的清单可能与那份产物不对应 ——
 * 那时唯一的解药是"重新构建一次、再验"，而不是放宽判据。
 *
 * 失效方式：谁把产物目录名改成两个不同的东西却共用一份清单（例如硬编码回 `_notes.ndjson`），
 * 就会让「A 产物的清单 + B 产物的 DOM」这种错配重新变成可能，而错配的红看起来像"说明被删了"。
 */
const NOTES_MANIFEST_PATH = path.join(path.dirname(FINAL_OUT), `${path.basename(FINAL_OUT)}.notes.ndjson`);

/**
 * 原样拷贝到产物根的源码文件（**全部是站点外壳资源，一份数据文件都没有**）。
 *
 * 历史（v2.1～v3.0）：`plans.json` / `api-plans.json` / `deals.json` 曾经在这一张里，
 * 因为那时站点的定位是"把数据公开出来给读者取"。t4「去数据暴露」之后这条定位被推翻：
 * 产物里不许有数据文件（唯一例外是首页应用自己的 `assets/data/offers.json`，由构建期写出，
 * 不走拷贝），判据在 `lib/published-assets.js`。
 * 失效方式：谁把某份 JSON 加回这张清单 ⇒ 构建自检的产物资产门禁当场红（点名路径），
 * 而不是让它悄悄上线 —— 这正是那条门禁存在的理由。
 *
 * ⚠️ 2026-10-16 加 `BingSiteAuth.xml`：Bing Webmaster Tools 的**站点归属验证**文件（由 Bing 生成，
 * 内容只有一条 `<user>` 令牌），必须原样落在站点根才验得过 —— 所以它走这张表的**原样拷贝**，
 * 而不是构建期生成：任何"顺手格式化一下"的改动都会让 Bing 那边验不过。
 * 它与 `robots.txt` 同属「站对外的运维约定」，不是数据文件（登记理由见 `lib/published-assets.js`）。
 */
const PUBLIC_FILES = ['index.html', 'favicon.svg', 'robots.txt', '.nojekyll', 'BingSiteAuth.xml',
  // 站点归属验证文件（GSC 的「HTML 文件」方式）：唯一出处是 `lib/published-assets.js` 的
  // `NON_PAGE_HTML`（那里写了理由），这里从它取，不再写第二份字面量。
  ...publishedAssets.NON_PAGE_HTML_PATHS];

/**
 * 产物里**不是页面**的 `.html`（唯一出处：`lib/published-assets.js` 的 `NON_PAGE_HTML`）。
 *
 * 为什么需要这条通道：下面产物自检的页面扫描面刻意写成「全部 `.html`」（`listArtifactFiles()`
 * 遍历现算，不写页面族清单 —— 那种清单漏一族就会静默失效）。但**站点归属验证文件**必须由搜索
 * 引擎指定成 `<token>.html`、必须落在站点根并逐字节原样可取，而它不是页面：没有页头 / 页脚 /
 * 说明意图，也不该进 sitemap。于是它是「全部 `.html` = 页面」这条假设的**唯一例外来源** ——
 * 只有登记在那张表里的路径会从**页面**判据（页头图标、页脚锚点、说明意图清单、订阅声明）里去掉；
 * 它自己的内容仍然逐字节参与残留扫描，其他任何 `.html` 一条都不放过。
 *
 * 失效方式：忘记登记 ⇒ 上面四条页面判据当场红（点名这个路径）；登记了却删掉文件 ⇒
 * `PUBLIC_FILES` 的「声明了就必须存在」在 assemble 时红。两边都咬得住。
 */
const NON_PAGE_HTML_FILES = [...publishedAssets.NON_PAGE_HTML_PATHS];

/**
 * 产物里的**页面**（= 全部 `.html` 去掉上面登记的非页面验证文件）。
 *
 * `listArtifactFiles` 是「磁盘上真的有什么」，这个函数是「其中哪些按页面判」——
 * 两者分开写，页面扫描面才既不会漏、也不会把验证文件当成坏页面。
 */
function listPageFiles(dir) {
  const nonPage = new Set(NON_PAGE_HTML_FILES);
  return listArtifactFiles(dir).filter(file => file.endsWith('.html') && !nonPage.has(file));
}

/**
 * 构建期生成、不走源码拷贝的产物（**页面之外只有这些**）。
 *
 * ⚠️ 今天共五项：`logos.css`（厂商 logo 样式表）、`sitemap.xml`、`og-image.png`，
 * 加上**两条订阅产物**（`feed.FEED_FILES` 的两条 —— Atom 1.0 与 JSON Feed 1.1，落产物根）。
 * 订阅产物由下面的 `assemble()` 紧跟 sitemap 之后落盘，本表是「声明了就必须存在」的那台机器牙的
 * 消费者（自检逐项 `fs.existsSync`）。
 *
 * ⚠️ 两条订阅产物的文件名**从 `FEED_FILES` 现取**，不在这张表里写第二份字面量（契约第 1.4 条）。
 *
 * 删掉的项与理由（史述，别读成"以后可以加回来"）：`icon.png`（订阅层整体下架的那一轮删的：
 * 一张只被 RSS 引用的点阵图；v3.2 请回来的订阅出口只要两个文本产物，不需要它）、
 * `source-health.json`（它是运维观测数据，"给读者一份可下载的 JSON"这条面撤了；
 * `/status/` 页面本身保留，页面与断言改读仓库根那份真值 —— 见自检里的注释）、
 * `data/index.json`（Dataset Manifest，数据出口子系统下架）。
 *
 * ⚠️ 说明意图清单（`NOTES_MANIFEST_FILE`）**不在这一张里**：它的落盘位置在产物目录之外
 * （`NOTES_MANIFEST_PATH`），而下面「声明文件必须存在于 OUT」的循环会逐个
 * `fs.existsSync(path.join(OUT, file))` —— 留着它必然红。这也是"清单真的搬走了"的**牙**。
 */
const GENERATED_FILES = [
  'logos.css', 'sitemap.xml', 'og-image.png',
  // v6：首页应用脚本（内容哈希文件名）。源码在 assets/app.js，构建期由
  // stageAppScript() 复制成 app.<hash>.js，并把 index.html 的 src 改成这个名字。
  // 名字从 app-asset.js 现取 —— 这里不写第二份哈希/文件名字面量。
  appAsset.FILE,
  // Phase 5：全站共享样式表（内容哈希文件名）。由 index.html 共享 <style> 剥注释生成，
  // 首页与全部子页以 <link rel="stylesheet"> 复用缓存。
  styleAsset.FILE,
  // v3.2：订阅产物（两条）。由唯一表现取 ⇒ 这张表与 `FEED_FILES` 不可能分家。
  ...feed.FEED_FILES.map(([file]) => file),
  // v3.4：到期日历（一条）。同样从唯一表现取 —— 这张表里不许出现第二份 `expiry.ics` 字面量。
  ...calendar.CALENDAR_FILES.map(([file]) => file),
  // v3.3：IndexNow 密钥文件（`<key>.txt`，内容就是密钥本身）。
  // 同样从唯一表现取名字 —— 这张表里不许出现第二份 `<key>.txt` 字面量。
  indexnow.keyFileName()
];

/**
 * 首页数据资产在产物里的路径（t3：`deals.json` → `assets/data/offers.json`）。
 *
 * **为什么搬家**：`deals.json` 这个名字 + 它坐在产物根的位置，等于把「这是一份公开数据集」写在脸上
 * —— 而它其实是**首页应用自己的数据资源**（筛选 / 排序 / 详情弹窗读它），不是给读者下载的接口。
 * 搬到 `assets/data/` 之后它仍然可以被 GET 到（浏览器必须取它），但站点不再把它当数据集宣传：
 * 页面上不再有任何文本或链接提到它。仓库根的 `deals.json` **不动** —— 它是数据真值，
 * validate / collect / rebuild-deals 与大量门禁都读它。
 *
 * ⚠️ 载荷结构**一个字不改**：Schema、派生字段（collections / needs / history / relatedPlans）、
 * 客户端渲染逻辑全都不动，只换文件位置与名字。所以这一条改动对浏览器是透明的。
 *
 * 失效方式：写点与读取方**必须同时改**（本文件里读取一律走 `path.join(OUT, OFFERS_ARTIFACT)`）。
 * 只改写点 ⇒ 自检回读产物时 ENOENT，构建红（这是好的一面：fail-fast）；
 * 只改读取方 ⇒ 读到上一轮留下的旧文件，构建拿陈旧数据自证，静默通过。
 */
const OFFERS_ARTIFACT = 'assets/data/offers.json';
// 站点常量与 XML 转义的**唯一出处**是 lib/site.js（t1 从 lib/feeds.js 逐行搬来；搬迁期两边逐值相等，
// feeds.js 整体删除后这里就是唯一定义处）。本文件里它们的三个用途：canonical / JSON-LD / sitemap 拼 URL
// → SITE_URL，页面标题与结构化数据 → SITE_NAME / SITE_DESCRIPTION，HTML 正文与属性转义 → xmlEscape。
// 失效方式：改回从 feeds 取，等于把「站点常量」的出处留在随订阅层一起下架的那个文件里 ——
// 正是这次搬家要避免的事。
const { SITE_URL, SITE_NAME, SITE_DESCRIPTION, xmlEscape } = site;

/**
 * 仓库地址（纠错 issue 链接的**唯一出处**）—— 从 `index.html` 的 RENDER-CORE 里现读
 * `const REPO_URL = '…'`，本文件**不写第二份 URL 字面量**（与 SITE_URL 同一条纪律：
 * 站点级常量只有一个出处，改地址只改一处）。
 *
 * 为什么要这个：v1.8 的两个答案页（/free-api/、/plans/api/）都要求「报错入口」——
 * 读者发现表格数字与官方页不一致时，最省事的落点是预填标题与正文的 GitHub Issue
 * （站内详情页早就有 `reportUrl(deal)` 这个先例，只是它在浏览器 RENDER-CORE 里跑）。
 * 构建期生成静态页面需要同一个仓库地址，因此从同一份源码里读。
 */
const REPO_URL = (() => {
  // v6：RENDER-CORE 从 index.html 内联搬到了 assets/app.js（外链），常量的唯一出处
  // 跟着源文件走；不要再从 index.html 读，否则外链化之后构建会当场找不到它。
  const match = fs.readFileSync(appAsset.SOURCE_PATH, 'utf8')
    .match(/const REPO_URL = '([^']+)'/);
  if (!match) throw new Error('assets/app.js 里找不到 `const REPO_URL = …`（纠错入口的仓库地址唯一出处）');
  return match[1];
})();

/** 预填标题的纠错 issue 链接（数据修正类，label 与详情页同源：data-fix） */
function reportIssueUrl(topic) {
  return `${REPO_URL}/issues/new?title=${encodeURIComponent(`[信息修正] ${topic}`)}&labels=data-fix`;
}

const { createNotesManifest } = require('../build/notes-manifest');
const { createOpsPages } = require('../build/pages-ops');
const residue = require('../build/residue');
const { createSelfCheck } = require('../build/selfcheck');
const {
  listArtifactFiles, scanResidue, loadResidueGuard, countOccurrences, residueStrip,
  normalizeForCompare, decodeEntitiesToFixpoint, decodeJsonUnicodeEscapes, isRenderedLiteral,
  RESIDUE_GUARD_FILE, RESIDUE_MIN_ENTRIES, RESIDUE_MIN_LIVE_LITERALS, RESIDUE_MIN_FLOOR_RATIO_HARD,
  RESIDUE_MIN_NORM_NEEDLE, RESIDUE_CONTAINER_CLASSES, FOOTER_KEPT_SENTENCE,
  RESIDUE_RELATION_ONLY_CLASSES, RESIDUE_COUNTED_CONTAINER_CLASSES
} = residue;

const {
  NOTE_SLOTS, noteIntent, notePageEntry, noteSignatureOf, noteDeclare, notePinned, noteRegister,
  notePage, noteUntracked, noteArtifactPathOf, noteDeclarerFor, noteSignaturesInMain,
  notesManifestText, noteManifestSelfCheck, writeNotesManifest
} = createNotesManifest({ OUT, NOTES_MANIFEST_FILE, NOTES_MANIFEST_PATH, listPageFiles });

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
  //
  // ⚠️ t3 删掉了这条路由（`['__CHANGES_HREF__', 'changes/']`）。它的**唯一**一处页脚出现是
  // `index.html` 那一行「优惠变化：变化雷达 · 订阅这些优惠」，而那一行整行删除了（订阅面要撤；
  // 变化雷达与订阅共用一行，只留一半就要为一半的深度前缀另立规矩）。
  // 删这条**不会**让 `/changes/` 变成孤儿页：实测它还有 7 个非页脚入链
  // （首页条带、`/plans/` 枢纽、`/plans/coding/`、`/plans/api/`、`/archive/`、`/models/`）。
  // 失效方式：只删 `index.html` 那一行、不删这条 ⇒ 下面「页脚路由链接」的**正向**断言当场红
  //（"缺少 <prefix>changes/ 的链接"）—— 那条断言正是为"页脚某一条被悄悄删掉"写的。
  //
  // v1.6：订阅中心（列出全部 Feed，并给出 RSS / JSON Feed 地址）
  //
  // ⚠️ t3 已删 `['__FEEDS_HREF__', 'feeds/']`；t4 把 `/feeds/` 页面本身也删了（整函数 + 落盘 + 自检），
  // 所以这条路由与它的页面都不存在了。页脚曾经是它唯一的可见入口 —— 现在连页面都没有了。
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
  //
  // ⚠️ t4 **已删**（`['__DATA_HREF__', 'docs/data/']` 不再存在）。t3 时它曾被迫保留：页脚那一枚
  // 是 `/docs/data/` 唯一的入链（实测非页脚入链 = 0），删它就会撞 `lib/seo.js` 的 `orphan` 硬失败。
  // t4 把「锚点 / 这条声明 / `/docs/data/` 路由 / sitemap 条目」**在同一次改动里**一起删掉了 ——
  // 这正是那件"必须同时发生"的四件事，任何一半单独发生都会留下一次红
  //（要么"页脚缺少一条路由的链接"，要么"孤儿页"，要么"残留路由占位符"）。
  // v3.0 Stage F：历史档案（资料失效不等于资料删除）。
  ['__ARCHIVE_HREF__', 'archive/'],
  // v3.0 Stage D5：模型资料索引。与「按厂商 / 分类浏览」是同一类东西（长期存在的资料维度），
  // 因此挂在同一行末尾；详情页由索引页给入链，不需要逐页进页脚。
  ['__MODELS_HREF__', 'models/'],
  // v3.4 F3：全站搜索（共享页脚入口；顶栏与跳转 chip 不加控件）
  ['__SEARCH_HREF__', searchPage.SEARCH_ROUTE],
  // v2.5：API / Token 计费对比页。与套餐对比页**并列**（一个回答"月付多少钱"，
  // 一个回答"每百万 token 多少钱"），因此同样挂在那一行末尾。
  //
  // ⚠️ 占位符刻意叫 `__APIPLAN_HREF__` 而不是 `__APIPLANS_HREF__`：
  // 后者**包含** `__PLANS_HREF__` 这个子串，而 `resolveRouteHrefs()` 是逐条 `split/join` 的 ——
  // 先替换 `__PLANS_HREF__` 会把 `__APIPLANS_HREF__` 打碎成 `plans/coding/` + 尾巴，
  // 于是新占位符**永远替换不掉**，症状是"每一个输出都残留一个占位符"（117 个文件同时报错）。
  // 下面的 `assertRouteMarkersDisjoint()` 把这条约束变成构建期硬失败，避免下一个人踩同一坑。
  ['__APIPLAN_HREF__', 'plans/api/'],
  // v3.1：API 成本计算器。`__APICOST_HREF__` 不与任何既有占位符互为子串。
  ['__APICOST_HREF__', 'tools/api-cost/'],
  // v3.2：页脚的人类可点订阅入口（`index.html` 共享页脚第 3 个 `<p>` 末尾那枚「订阅源」）。
  //
  // 目标路径**从 `FEED_FILES` 现取**（第一份 = Atom 那一份），不在这里写第二份文件名字面量：
  // 契约第 1.4 条的单源牙扫本文件的**代码**，写死一个文件名会当场变红（feed-selftest 那条
  // 「唯一表单源：4 个读写方里没有第二份文件名 / MIME 字面量」）。
  // 这一步同时让下面「页脚路由链接」的**正向**断言自动要求每一种深度都出现
  // `href="<prefix>feed.xml"`：漏一层、页脚那枚链接被悄悄删掉，都会当场红。
  ['__FEED_HREF__', feed.FEED_FILES[0][0]],
  // v3.4 F2：页脚与 /changes/ 的到期日历入口。路径从唯一表 `calendar.CALENDAR_FILES` 现取，
  // 本文件不写第二份 `expiry.ics` 字面量；它也是 due 视图 stats 行里那枚链接的站内落点。
  ['__CALENDAR_HREF__', calendar.CALENDAR_FILES[0][0]],
  // v1.8-seo-answer-pages：数据文档与引用页（/docs/data/）。它是「可引用数据集」这个钩子的
  // 唯一站内入口，挂在页脚「按厂商 / 分类浏览」那一行末尾 —— 与 t4 删掉的「开放数据」入口
  // 不是同一件事：这一页不发布数据文件，只给许可与引用格式。
  ['__DATADOCS_HREF__', 'docs/data/'],
  ['__CODEXRESET_HREF__', 'codex-reset/']
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
      `<span class="need-icon" aria-hidden="true">${icons.iconSvg(item.spec.slug, { size: 18 }) || htmlEscape(item.spec.icon)}</span>` +
      `<span class="need-copy"><strong>${htmlEscape(item.spec.label)}</strong><b class="stat stat-30">${item.count}<span class="stat-unit">条</span></b>` +
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
 * 首页探索工具带（Direction B · 3 张静态卡片）：
 * 把全站三个高价值长期工具（Coding 套餐对比 / API 计费对比 / API 成本计算器）
 * 从顶栏角落提升为问题导向的引导带，数字全部由构建期现算，路由走 ROUTE_HREFS 占位符。
 */
function renderToolRibbon(plansStore, apiPlansStore) {
  const plans = plansStore && Array.isArray(plansStore.plans) ? plansStore.plans : [];
  const planPlatforms = new Set(plans.map(p => p.provider).filter(Boolean)).size;
  const apiPlans = apiPlansStore && Array.isArray(apiPlansStore.plans) ? apiPlansStore.plans : [];
  const apiPlatforms = new Set(apiPlans.map(p => p.provider).filter(Boolean)).size;
  const apiModels = apiPlans.reduce((n, p) => n + (Array.isArray(p.models) ? p.models.length : 0), 0);
  const items = [
    {
      href: '__PLANS_HREF__',
      title: 'AI Coding 套餐谁更划算？',
      desc: `横向对照 ${planPlatforms} 平台 · ${plans.length} 款月付套餐与限流`
    },
    {
      href: '__APIPLAN_HREF__',
      title: '每百万 Token 官方单价表',
      desc: `覆盖 ${apiPlatforms} 平台 · ${apiModels} 项模型按量明码标价`
    },
    {
      href: '__APICOST_HREF__',
      title: '30 秒估算你的 API 月成本',
      desc: '支持缓存命中率与最多 4 个模型原币种并排对比'
    }
  ];
  const links = items.map(item =>
    `<a class="toolcard" href="${item.href}">` +
    `<span class="toolcard-copy"><strong>${htmlEscape(item.title)}</strong><small>${htmlEscape(item.desc)}</small></span>` +
    `<span class="toolcard-arrow" aria-hidden="true">→</span>` +
    `</a>`
  ).join('');
  return `  <nav class="toolribbon" id="toolRibbon" aria-label="套餐与计费对比工具">${links}</nav>`;
}

/**
// `resolveRouteHrefs()` 与 `finalizePage()` 的唯一实现已迁到 `scripts/lib/page-shell.js`：
// 页面壳（9 个页面族 + 首页收尾）都从那一处派生，「分析注入只有一处出口」这条性质不变，
// 差别只是它不再住在构建脚本里 —— 于是 renderer 与构建编排都不会各自抄一份收尾逻辑。

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
  'PRERENDER:stats', 'PRERENDER:categories', 'PRERENDER:needs', 'PRERENDER:changes', 'PRERENDER:jsonld',
  'PRERENDER:spotlights', 'PRERENDER:toolribbon',
  // v1.7：页脚那一行的「少量厂商入口」（由落地页计划生成，见 renderVendorLine）
  'PRERENDER:vendorline',
  // v3.2：首页**折叠线以下**的「最近变化」区块（`#dealsList` 收口与 FAQ 之间）。
  'PRERENDER:changestopic'
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
    // 首页默认视图真的收录了的优惠 id（折叠无损 ⇒ 与卡片覆盖同一集合）。详情页索引策略
    // （seo.dealIndexable）用它判断「这条优惠有没有首页入链」，与首页渲染共用同一份判据。
    visibleIds: new Set((renderCore.allVisibleDeals ? renderCore.allVisibleDeals(payload.deals) : visible).map(deal => deal.id)),
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

/** XML 文本转义在 lib/site.js（RSS 里一个裸 & 就能让整份 feed 解析失败） */

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
 * 是同一个函数；`<style>`、主题前置脚本、页脚、页头的 GitHub 图标入口四者从**已组装好的
 * index.html** 里抽出来（页脚靠 `<!--SHARED:footer:START/END-->`、图标入口靠
 * `<!--SHARED:ghlink:START/END-->`，抽不到就抛错，见 `lib/page-shell.js` 的 `loadShellParts()`）。
 *
 * **下面这三块是硬编码的第二份，没有任何标记或断言保证两边一致**：
 *   ① 品牌头部文案与 mark SVG（**v3.1 起**在 `lib/page-shell.js` 的 `sharedHeaderHtml()` 里
 *      ↔ index.html 的 `<a class="brand">` 那段）—— 页面壳重构之后它已经不在本文件里，
 *      但仍然是第二份副本，「改首页品牌文案不会同步到详情页」这条边界没有变；
 *   ② `#themeSeg` 三个主题按钮（本文件下面的 `themeSeg` 常量 ↔ index.html 的同一个切换器）；
 *   ③ 详情页的主题切换脚本（本文件下面的 `themeBind` 常量 ↔ index.html 里的首页脚本，且把
 *      `THEME_KEY` 的值 `'dsh.theme'` 直接抄成字面量，不引用首页那个常量）。
 * 所以**改首页品牌文案或主题行为不会同步到 80 个详情页**，也不会报错。详见
 * PROJECT_STATUS.md「七、审计发现」的模板分叉那一节 —— ⚠️ **那一节是 2026-09-23 的历史快照**
 * （它自己写明"只读审计""上面两列都是 2026-09-23 工作区的值"），里面的 build-local.js 行号与
 * "品牌头部在本文件 533–541"这句**早已失效** —— 那一段的当前落点在 `lib/page-shell.js` 的
 * `sharedHeaderHtml()`（见本注释第 ① 条）。读它当历史可以，当现状索引会找错文件
 * （t3 的残留表述审计把这一处点名为"今天会误导人"）。
 * 本文件自己的行号刻意不写——加几行注释就会整体位移。
 * ⚠️ 页头那枚 GitHub 图标入口**不在**上面这份「第二份副本」名单里：它是从 index.html 现抽的
 * 共享片段（v3.1），所以详情页与首页那一枚逐字节相同，改一处即全站生效。
 *
 * **纯静态**：详情页不加载主脚本，不 fetch assets/data/offers.json——没有列表要渲染，也就没有控制台错误；
 * 只保留一个极小的主题切换脚本（与首页同一套 localStorage 约定）**以及** A 包的反馈复制片段。
 * ⚠️ 反馈复制片段**不是第二份实现**：它的源码在 index.html 主脚本的 SHARED:dealcopy 区间，
 * 由 `loadShellParts()` 原样抽出后注入 —— 首页详情弹层与 80 个静态详情页共用同一份事件委托。
 */
function writeDetailPages(payload, indexHtml, renderCore, plan, homepageVisibleIds = new Set(), archivedLinkedIds = new Set()) {
  /**
   * 详情页的**查询形状**标题（原 :1376-1378 的内联表达式，抽出来是为了让集合级消歧与逐页
   * 渲染用同一份输入）。`免费模型：` 前缀是查询意图，不是对事实的改写；它已经在 headline
   * 内，所以预算把它一起算进去（57 字符）——若在 fit 之后再加前缀，就会凭空多出 5 字符。
   */
  function dealHeadlineOf(deal) {
    const isFreeModel = Array.isArray(deal.benefitType) && deal.benefitType.includes('free_model');
    return isFreeModel && !/免费模型$/.test(String(deal.title || '').trim())
      ? `免费模型：${deal.title}`
      : deal.title;
  }

  // 共享片段（共享 `<style>` / 主题前置脚本 / 页脚模板）与页脚收尾都交给页面壳：
  // 页脚**每页解析一次**这条既有纪律没有变 —— `shell.docEnd()` 会用这一页自己的路由调
  // `finalizePage()`（分析注入要按该页路由判「要不要统计」）。
  const parts = shell.loadShellParts(indexHtml, ROUTE_HREFS, appAsset.SOURCE, styleAsset.FILE);

  const themeSeg = `<div class="seg" id="themeSeg" role="group" aria-label="配色主题">
        <button type="button" data-theme-value="auto" aria-pressed="true">跟随系统</button>
        <button type="button" data-theme-value="light" aria-pressed="false">浅色</button>
        <button type="button" data-theme-value="dark" aria-pressed="false">深色</button>
      </div>`;

  const themeBind = `<script>
    /* 详情页是纯静态的：主题切换是这一页唯一的面板交互；反馈复制由下面注入的共享片段负责 */
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

  // A 包：详情页的反馈复制脚本。**源码只有一份**（index.html 主脚本里的 SHARED:dealcopy
  // 区间，由 loadShellParts() 抽出）；这里只负责把它作为第二段内联脚本注入静态详情页。
  // 这样「首页弹层」与「80 个预渲染详情页」共用同一个 document 级事件委托实现 ——
  // 断言在产物自检里：按钮默认隐藏、只有 copy-ready 才显示、话术里带条目 id 与官方页。
  const dealCopyScript = `<script>
${parts.dealCopyScript}
  </script>`;

  const deals = (payload.deals || []).filter(deal => deal.type === 'deal' && deal.id);
  // 详情页 `<title>` 的固定后缀（23 字符）：预算 = 80 − 23 = 57。后缀属于渲染器，所以
  // 预算也在这里结算；正文由 page-fit 适配后，这里只负责拼接，不再出现第二把尺子。
  const DEAL_TITLE_SUFFIX = ` — 官方优惠与免费额度 | ${SITE_NAME}`;
  // 集合级消歧（必需，不是可选）：aliasKey 只剥噪声后缀，不会替截断后的撞车负责。
  // 两条共享前 57 字符的 150 字符标题能过去重，却会在 fit 之后逐字相同 ⇒ title-unique 红。
  // 先按 key 排序全体适配，再让撞车组整组带 id 标签；循环里只取映射值。
  const dealTitles = pageFit.uniqueTitles(deals.map(deal => [deal.id, dealHeadlineOf(deal)]), DEAL_TITLE_SUFFIX);
  // 描述：厂商 + 标题 + 优惠原文。**为什么要带标题前缀**：80 个详情页里有 17 条
  // （百度千帆那张表）的 `discountInfo` 是逐字相同的，只取 discountInfo 会让这 17 页
  // 的 meta description 完全一样 —— 重复描述在搜索结果里等于没有描述。
  // 前缀是数据本身（厂商名与标题），不是我们写的营销文案；截断沿用 `…` 留痕的规矩。
  // 但前缀被 150 预算截断后仍可能撞车，所以这里同样按集合消歧（标签用条目 id）。
  const descriptionRawOf = deal => {
    const vendor = renderCore.vendorOf(deal);
    return `${vendor.name ? `${vendor.name}｜` : ''}${deal.title}：${String(deal.discountInfo || deal.description || SITE_NAME).replace(/\s+/g, ' ')}`;
  };
  const dealDescriptions = pageFit.uniqueDescriptions(deals.map(deal => [deal.id, descriptionRawOf(deal), deal.id, 'deal']));
  const pages = [];
  const limboIds = [];

  for (const deal of deals) {
    const vendor = renderCore.vendorOf(deal);
    const tier = renderCore.tierOf(deal);
    const pageUrl = `${SITE_URL}deal/${encodeURIComponent(deal.id)}/`;
    // 索引策略（唯一出处 seo.dealIndexable）：首页默认视图收录了它，或档案已接住它（有会渲染
    // 的档案详情页给 /deal/<id>/ 入链）⇒ 可索引；两者都不是＝到期/线索但尚未归档的窗口期 ⇒
    // 临时 noindex（不进 sitemap），避开「首页墙钟剔除 vs 档案事件滞后」之间的零入链窗口。
    const asOfDate = String(payload.updatedAt || '').slice(0, 10);
    const expiredDays = seo.daysExpired(deal.expiresAt, asOfDate);
    const indexable = seo.dealIndexable({
      homepageVisible: homepageVisibleIds.has(deal.id),
      archivedLinked: archivedLinkedIds.has(deal.id),
      expiredDays
    });
    if (!indexable) limboIds.push(deal.id);
    // 这一页自己的页脚：路由显式给（`deal/<id>/`），分析注入因此按本页路由判定。
    /**
     * search-intent-v1（W3）：免费模型条目的**查询形状**。
     *
     * 12 条 `benefitType` 含 `free_model` 的条目里，7 条标题本来就是「<模型名> 免费模型」
     * （智谱那一批 GLM-4.x-Flash），另外 5 条是「讯飞星火 Spark Lite …免费使用」这种
     * 带描述从句的写法 / 或聚合专区条目。后 5 条的标题里「免费模型」不是一个能直接套的
     * 形状 —— 硬把「硅基流动 免费模型专区」改写成「…免费模型」会造出一句不成立的话
     * （那一条收的是**专区**，不是某一个模型）。所以口径是：
     *   · 标题已经以「免费模型」结尾 ⇒ h1/title 原样（7 条）；
     *   · 否则 ⇒ 前面加一段**查询词前缀**「免费模型：」，h1/title 都从这两个字开始，
     *     命中「免费模型」这个查询词，同时不改变条目本身说的是什么（5 条）。
     * 这与「站点只做收录与整理、不替厂商改写事实」的红线一致：前缀是查询意图，
     * 后缀仍是条目原文。
     */
    const isFreeModel = Array.isArray(deal.benefitType) && deal.benefitType.includes('free_model');
    const headline = dealHeadlineOf(deal);
    const freeRows = isFreeModel ? factSummary.freeModelRows(deal) : [];
    // 首屏三行（免费到什么程度 / 限制 / 怎么开始）：行值全部来自条目字段，见 lib/fact-summary.js。
    // 复用需求页那个容器（`.factsum`），叶子页用 `.factsum-inline` 变体 —— 不套第二张卡片。
    const freeFactsHtml = freeRows.length
      ? `      <section class="factsum factsum-inline" aria-label="免费模型要点">
        <p class="factsum-cap">免费模型要点</p>
        <dl class="factsum-list">
${freeRows.map(row => `          <div class="factsum-row" data-fact-key="${htmlEscape(row.key)}" data-fact-value="${htmlEscape(row.value)}"><dt>${htmlEscape(row.label)}</dt><dd>${htmlEscape(row.value)}</dd></div>`).join('\n')}
        </dl>
      </section>
`
      : '';
    // 标题正文已按「80 − 后缀」适配并做过集合级消歧；这里只拼后缀，不再出现第二把尺子。
    // uniqueTitles 已按 57 预算适配；这里再走一次 fitTitle 是**幂等**的（Part A 有牙），
    // 既守住「单页路径也不超预算」，也让集合映射未来被替换成 raw 时不会静默顶穿。
    const title = `${pageFit.fitTitle(dealTitles.get(deal.id), DEAL_TITLE_SUFFIX)}${DEAL_TITLE_SUFFIX}`;
    // 描述同理：已按 150 预算适配并集合级消歧（raw 的拼法见循环前的 descriptionRawOf）。
    const desc = dealDescriptions.get(deal.id);
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
    // 逐字红线：JSON-LD 的 name 与下面 og:title 都保持完整 `deal.title` / `headline`，不经过
    // fitTitle —— 80 是**搜索结果**的展示预算，不是内容改写；结构化数据与社交卡片没有长度门禁，
    // 应显示完整标题。description 例外：它与 meta description 共用同一份已适配值（150 预算）。
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

    const html = `${shell.docStart({
      kind: 'deal',
      route: `deal/${deal.id}/`,
      prefix: '../../',
      parts,
      title: htmlEscape(title),
      description: htmlEscape(desc),
      robots: indexable ? 'index, follow, max-image-preview:large' : 'noindex, follow',
      canonicalUrl: htmlEscape(pageUrl),
      hreflang: [
        { hreflang: 'zh-CN', href: htmlEscape(pageUrl) },
        { hreflang: 'x-default', href: htmlEscape(pageUrl) }
      ],
      og: {
        type: 'article',
        siteName: htmlEscape(SITE_NAME),
        url: htmlEscape(pageUrl),
        // 逐字：og 没有长度门禁，社交卡片应显示完整标题；截断只服务搜索结果预算。
        title: htmlEscape(headline),
        description: htmlEscape(desc),
        image: `${SITE_URL}og-image.png`
      },
      faviconHref: '../../favicon.svg',
      logoCssHref: '../../logos.css',
      jsonLdHtml: jsonLd,
      headerExtra: themeSeg,
      where: 'writeDetailPages'
    })}
      <nav class="crumb" aria-label="面包屑">
        <a href="../../">首页</a> › ${categoryPage
    ? `<a href="../../${categoryPage.route}">${htmlEscape(deal.category)}</a>`
    : `<span>${htmlEscape(deal.category || '全部优惠')}</span>`} › <span>${htmlEscape(deal.title)}</span>
      </nav>
${freeFactsHtml}      <article class="dbody dpane" data-tier="${tier.n}">
${renderCore.detailHtml(deal, { headingTag: 'h1', prefix: '../../', headingText: headline })}
      </article>
      <p class="dpane-more">
${expiredDays !== null && categoryPage
    ? `        当前有效的同类优惠：<a href="../../${categoryPage.route}">查看「${htmlEscape(deal.category)}」全部 ${categoryPage.count} 条</a>${vendorPage ? ` · <a href="../../${vendorPage.route}">${htmlEscape(vendor.name)} 的其他优惠（${vendorPage.count} 条）</a>` : ''}`
    : (vendorPage
      ? `        这家厂商的其他优惠：<a href="../../${vendorPage.route}">${htmlEscape(vendor.name)} 的全部 ${vendorPage.count} 条</a>`
      : '        <a href="../../">← 返回全部优惠</a>')}
      </p>
      <p class="dpane-src">
        官方页：<a href="${htmlEscape(official)}" target="_blank" rel="noopener noreferrer">${htmlEscape(official)}</a>
        · 本站只做收录与整理，最终以厂商官方页面为准；排序与推荐理由不出售。
      </p>${shell.docEnd({ route: `deal/${deal.id}/`, prefix: '../../', parts, extraTailHtml: themeBind + '\n' + dealCopyScript, where: 'writeDetailPages' })}`;

    const dir = path.join(OUT, 'deal', deal.id);
    fs.mkdirSync(dir, { recursive: true });
    // 说明意图（notes-manifest-v1）：详情页的正文由 RENDER-CORE 的 detailHtml 渲染，
    // 它**不产出**页面级说明 ⇒ 声明「0 条」。这一行同时是「这一页存在」的登记：
    // 清单的路由集与产物页面集是双向对账的，漏登记会被构建期点名。
    notePage(`deal/${deal.id}/`, { kind: 'deal-detail' });
    fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf8');
    pages.push({ id: deal.id, url: pageUrl, title: deal.title, text: String(deal.discountInfo || ''), indexable });
  }

  // 窗口期 noindex 必须可见（不静默降级）：这些页文件仍在、URL 不 404，只是临时不进索引，
  // 等 ended 事件落地、档案接住后自动恢复。逐条列出 id，便于核对「是不是只 deindex 了该 deindex 的」。
  if (limboIds.length) {
    console.log(`  详情页索引策略: ${limboIds.length} 个窗口期页临时 noindex（到期/线索且尚未归档，不进 sitemap）：${limboIds.join(', ')}`);
  }

  return pages;
}

const {
  CODEX_RESETS_FILE, CODEX_RESETS_ROUTE, CODEX_EXCERPT_LIMIT, PLANS_TABLE_CSS, beijingMinuteOf,
  loadCodexResets, renderStatusPage, renderCodexResetsPage, markChangesRows, renderChangesPage,
  renderPlansPage, renderApiPlansPage, renderApiCostPage, renderPlansHubShell
} = createOpsPages({
  ROOT, ROUTE_HREFS, plansCompareSource, apiCostSource,
  noteDeclare, notePage, noteDeclarerFor, decodeEntities
});

/* ------------------------------------------------------------------ */
/* /models/ 模型资料索引与详情（v3.0 Stage D5/D6）                       */
/* ------------------------------------------------------------------ */

/**
/**
 * `renderStaticPage` 那五个页面族共用的**页面级 CSS**：表格 / 信息表 / 过滤条 / 空态原语。
 *
 * 它原先内联在 `renderModelsShell` 的 `<style>` 块里（那一版自带一整份文档脚手架，105 行）。
 * 页壳接管脚手架之后这段 CSS 必须**显式留下**——它是这五族共用的页面原语，不是文档脚手架的一部分。
 * 漏掉它的症状实测过一次：`/docs/data/`、`/models/` 等页在 390/360px 出现 209–239px 的
 * 页面级横向溢出（`.ptable-wrap` 的 `overflow-x: auto` 与窄屏 sticky 列都没了），
 * 由 `verify-site.js` §22c 的全站几何门禁当场抓住 —— 静态检查与构建期自检都是绿的。
 *
 * ⚠️ 与 `index.html` 的**共享** `<style>` 是两件事：那里面放的是「全站同一条规则」
 * （`.detail-main` 内容列、`.snote` 说明宽度）；这里放的是「资料页这一族的表格原语」。
 * 什么时候该把其中某条上提到共享 `<style>`：当**第二个布局族**也需要它时（Workstream C 的判据）。
 */
const STATIC_PAGE_CSS = `  /* 只用首页已有的设计变量，不新建视觉语言。 */
  .stop { display: flex; align-items: baseline; gap: var(--s2); flex-wrap: wrap; margin-bottom: var(--s2); }
  .stop h1 { font-size: 19px; margin: 0; }
  .stop .meta { color: var(--mut); font-size: var(--fs-sm); }
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
  }`;

/**
 * 四个「静态资料页族」共用的**参数映射**：/models/ · /models/<slug>/ · /archive/ ·
 * /archive/<kind>/<id>/。
 *
 * ⚠️ 曾经还有第五族 `/docs/data/`（数据文档页）：它在「去数据暴露」那一轮**整体下架**，
 * 连 `page-kinds.js` 的 `data-docs` kind 与固定路由映射一起删了 —— 所以这里与 `page-kinds.js`
 * 都找不到 `data-docs`，那是**下架的结果**，不是漏登记。
 *
 * ⚠️ 它**不是第二份页面壳**：文档脚手架只有 \`lib/page-shell.js\` 一处实现，这里只做映射。
 * 这四族的正文与 JSON-LD 都已经是现成的值，且都不用 robots / hreflang / OG，
 * 于是把「route → canonical → favicon → JSON-LD 段」这几步固定下来
 * （原来的「根 Feed」那一步已随订阅层下架删除），
 * 避免在 4 个调用点各抄一遍 —— 上一版是一份 105 行的**自带文档脚手架**，那正是本轮要消灭的形态。
 *
 * \`kind\` **必须由调用方显式给出**，它决定布局族（\`models-index\` / \`archive-index\`
 * 是 wide，\`model\` / \`archive-detail\` 是 detail）。上一版靠「传不传 mainClass」
 * 暗示这件事，而忘了传的症状是**详情页悄悄渲染成宽页**；交给 \`page-kinds.js\` 的声明表判之后，
 * 这件事不再依赖记性（detail 族缺内容列会当场抛错）。
 *
 * \`jsonLd\` 收**对象数组**（不是 HTML）：本函数按站点既有格式渲染成一段一个对象
 * （塞成数组时 \`JSON.parse(block)['@type']\` 会得到 undefined，自检既不抛错也不命中 ——
 * 分类页第一版就是这么写的，被自检当场拦下）。
 */
function renderStaticPage({ kind, route, title, description, body, jsonLd, prefix, extraCss = '', extraScript = '', mainClass }, indexHtml) {
  const parts = shell.loadShellParts(indexHtml, ROUTE_HREFS, appAsset.SOURCE, styleAsset.FILE);
  const jsonLdHtml = jsonLd
    .map(data => `<script type="application/ld+json">
${JSON.stringify(data, null, 2).split('\n').map(line => `  ${line}`).join('\n')}
</script>`).join('\n');
  // 渲染器拥有后缀 ⇒ 渲染器拥有适配：调用方给的是**不含站名后缀**的正文，这里按
  // 「80 − 后缀」结算后再拼。短标题逐字节不变；档案详情/模型/静态族的超长标题在此截断，
  // 不需要每个调用点各记一次预算（这是 issue #150 的收口点之一）。
  const fittedTitle = pageFit.fitTitle(title, ` · ${SITE_NAME}`);
  return shell.renderPageShell({
    kind,
    route,
    prefix,
    parts,
    title: `${htmlEscape(fittedTitle)} · ${htmlEscape(SITE_NAME)}`,
    description: htmlEscape(description),
    canonicalUrl: `${SITE_URL}${route}`,
    faviconHref: `${prefix}favicon.svg`,
    // 这一族的表格原语 + 各页自己的追加样式（顺序与迁移前一致：族原语在前、页面追加在后）。
    extraCss: extraCss ? `${STATIC_PAGE_CSS}\n${extraCss}` : STATIC_PAGE_CSS,
    jsonLdHtml,
    bodyHtml: body,
    extraScript,
    mainClass,
    where: `renderStaticPage/${route}`
  });
}

/**
 * `/search/` 全站搜索页：静态目录 + 一个输入框（过滤脚本逐字节内联）。
 *
 * 标题/描述走 `page-fit` 的唯一预算；`data-search-count` 是构建期写死的分组计数，
 * 浏览器侧只改可见性、不改这些数字（自检从盘上回读它们对账）。
 */
function renderSearchPageHtml(index, indexHtml) {
  return renderStaticPage({
    kind: 'search',
    route: searchPage.SEARCH_ROUTE,
    title: searchPage.SEARCH_TITLE,
    description: pageFit.fitDescription(searchPage.SEARCH_DESCRIPTION),
    body: searchPage.renderSearchPage({ index, prefix: '../' }),
    jsonLd: searchPage.searchPageJsonLd(),
    prefix: '../',
    extraCss: searchPage.SEARCH_PAGE_CSS,
    extraScript: searchFilterSource()
  }, indexHtml);
}

/**
 * `/docs/data/` 数据文档与引用页的页面级样式（只在这一个路由上拼进 `<style>`）。
 * 类名一律 `.dd-*`：刻意不复用 `.snote` / `.pnote` / `.vsnote`（三类说明容器各有
 * notes-manifest 判据），也不复用 `.ctable`（那是目录页的表格原语）。
 */
const DATA_DOCS_CSS = `  /* v1.8-seo-answer-pages：/docs/data/（数据文档与引用页） */
  .stop { display: flex; align-items: baseline; gap: var(--s2); flex-wrap: wrap; margin-bottom: var(--s2); }
  .stop h1 { font-size: 19px; margin: 0; }
  .stop .meta { color: var(--mut); font-size: var(--fs-sm); }
  .dd-h2 { font-size: 15px; margin: var(--s4) 0 var(--s2); }
  .dd-intro { color: var(--mut); font-size: var(--fs-sm); line-height: 1.75; margin: 0 0 var(--s2); max-width: none; }
  .dd-p { color: var(--ink2); font-size: var(--fs-sm); line-height: 1.75; margin: 0 0 var(--s1); }
  .dd-list { margin: 0 0 var(--s2); padding-left: 1.15em; color: var(--mut); font-size: var(--fs-sm); line-height: 1.8; max-width: none; }
  .dd-list b { color: var(--ink2); }
  .dd-list code, .dd-cite code { font-size: 12px; overflow-wrap: anywhere; }
  .dd-cite { margin: 0 0 var(--s2); padding: 8px 10px; border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--card); color: var(--ink2); font-size: var(--fs-sm); overflow-wrap: anywhere; }
  .dd-table-wrap { overflow-x: auto; }
  .dd-table { width: 100%; border-collapse: collapse; background: var(--card); border: 1px solid var(--line); border-radius: var(--r); overflow: hidden; }
  .dd-table caption { text-align: left; color: var(--mut); font-size: var(--fs-sm); padding: 0 0 var(--s2); }
  .dd-table th, .dd-table td { text-align: left; padding: 9px 11px; border-top: 1px solid var(--line); font-weight: 400; font-size: var(--fs-sm); vertical-align: top; }
  .dd-table thead th { border-top: 0; color: var(--mut); font-weight: 600; white-space: nowrap; }
  .dd-table tbody th { font-weight: 600; white-space: nowrap; }
  .dd-table small { display: block; color: var(--mut); font-weight: 400; font-size: 11.5px; margin-top: 2px; }
  .dd-table a { color: var(--brand); }
  .dd-foot { color: var(--mut); font-size: var(--fs-sm); margin: var(--s3) 0 0; }
  .dd-foot a { color: var(--brand); }
`;

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
 * canonical / 三段 JSON-LD / 页脚深度 / 正文下限 / 空表兜底
 * （原来的「双 feed」一项已随订阅层下架删除）。
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
  /**
   * 该页**被索引/收口指向**的绝对地址。按需求页在 `/need/<slug>/`，所以**不能**由 slug 直接拼站根地址。
   *
   * v1.8-seo-answer-pages：别名页的 canonical 指向正本（`spec.canonicalRoute`），
   * 页面自身仍从本站址提供服务；canonical 与 JSON-LD 的 `url` 都用正本地址。
   * `canonicalRoute` 是唯一声明（`landing-aliases.json` → `landing.planLandingPages()`），
   * 这里不写第二份「哪个别名指向谁」的判断。
   */
  const pageUrl = `${SITE_URL}${spec.canonicalRoute || spec.route || `${spec.slug}/`}`;
  const parts = shell.loadShellParts(indexHtml, ROUTE_HREFS, appAsset.SOURCE, styleAsset.FILE);

  // v1.7：页面类型。`hub` 列子页面、`alias` 是 noindex 的旧地址，其余列条目。
  const kind = spec.kind || 'collection';
  const isHub = kind === 'hub';
  const isAlias = kind === 'alias';
  const summary = Array.isArray(context.summary) ? context.summary : [];
  const plan = context.plan || null;

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
  // 表头：枢纽页 3 列（t3 起），其余目录页 5 列。
  // ⚠️ 枢纽页原来有第 4 列「订阅」（RSS / JSON Feed 地址）。它随「站点不再面向读者暴露订阅与
  // 数据文件」一起删除：那一列是整站**唯一**把 Feed 地址印在普通页面表格里的地方。
  // 非枢纽分支**没有**这一列，别把两边的列数改混（下面的 colspan 与断言都跟着这一处）。
  const HEADERS = isHub
    ? ['页面', '条目数', '这一页收什么']
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

  /**
   * 枢纽页的一行：只有子页面链接、条数与「这一页收什么」，不夹带条目。
   *
   * t3：**删掉第 4 格「订阅」**（原先按 `feeds.feedsForPage(child)` 列出该子页的 RSS / JSON
   * 地址）。删的理由与表头同一处；这里额外说明一个**失效方式**：那一格在没有任何专属 Feed 时
   * 会渲染成 `<span class="none">站点根 Feed</span>`（该格与它的 Feed 渲染已随订阅层下架），所以"少了一格"不会像空白那样显眼 ——
   * 列数由下面的 `colspan` 与 `HEADERS.length` 两条一起守着，改一处漏一处就会当场错位。
   */
  const hubRowHtml = child => {
    return `
        <tr data-child="${htmlEscape(child.route)}">
          <th scope="row"><a href="${prefix}${child.route}">${htmlEscape(child.title || child.label)}</a></th>
          <td>${htmlEscape(String(child.count))}</td>
          <td>${htmlEscape(child.description || child.heading || '')}</td>
        </tr>`;
  };

  const emptyRow = isHub
    ? '<tr><td colspan="3">当前没有达到门槛的子页面。这不代表没有这类优惠，只代表我们手上的条目里还没有一类满足生成门槛。</td></tr>'
    : (useEvidence
      ? '<tr><td colspan="5">当前没有符合这一页判据的条目。这不代表没有这类优惠，只代表我们手上的条目里没有一条满足本页判据。</td></tr>'
      : '<tr><td colspan="5">当前没有符合这一分类、且有明确依据的条目。</td></tr>');

  const childList = isHub ? (spec.children || []) : [];
  const body = isHub
    ? (childList.length ? childList.map(hubRowHtml).join('') : emptyRow)
    : (deals.length ? deals.map(rowHtml).join('') : emptyRow);

  /**
   * 两层说明模型的**唯一实现**（secondary-page-intro-changes-v1；此前是三层的）。
   *
   *   ① **首屏（标题下）—— 一个字都没有。** 顶部只留 `<h1>` + 「共 N 条 · 数据更新 …」。
   *      上一轮留下的 `userIntro`（0~1 句 `<p class="snote">`）本轮整层删除：
   *      实测 41 个页面每页至少占一行，而它解释的内容读者不看也能用这一页。
   *      判据在构建期（本文件「首屏说明必须为空」那条结构性扫描）。**没有白名单**：
   *      `secondary-page-residue-v1` 起别名页那条例外已退役（见下方「为什么现在没有例外」），
   *      扫描对目录页家族**逐页一视同仁**，多一条即红。
   *   ② `userNotes` —— 底部 `<details class="page-notes">`，只放三类内容
   *      （分类边界 / 来源与条款 / 少量误解说明）。**真没有价值的内容直接不展示**，
   *      不倒进折叠块 —— 把垃圾藏进 `<details>` 不是简化。
   *   ③ 维护口径 —— 不进页面，进 `docs/DESIGN-RULES.md` 的「二级数据页口径归档」。
   *
   * ## 为什么折叠块**不能**用 `.snote` 类（两个都是硬约束，实测得出）
   *
   *   · 闭合 `<details>` 里的 `.snote` 会被 §22c 判成 `note-unrendered`：
   *     `verify-site.js` 的 `visibleTextOf()` 直接遍历 DOM 子节点，不看 `display`
   *     也不看 `<details>` 开合 —— 于是 `rendered=false` + `textLength>0` + `glyphRects=0`
   *     三条同时成立，正好命中那条判据。所以内层正文用 `.pnote`。
   *   · 外层 `<details>` 也刻意**不带** `.snote`：否则会扰动 §22c 的 `notes` 索引、
   *     `WIDE_SNOTE_FROZEN` 计次与 M1–M13 变异牙的靶位。
   *
   * 折叠**不影响**无 JS 可读性，也不影响正文下限：`prerenderedText()`（构建期）与
   * `seo.js` 的 `visibleText()` 都只剥 script/style/注释/标签，`<details>` 的正文照样计入。
   * 这一点是本轮敢用折叠的前提 —— 折起来的内容仍然能被搜索引擎与「无 JS 读全文」读到。
   *
   * ## 为什么现在**没有**例外（`secondary-page-residue-v1` 起）
   *
   * 上一轮留下的唯一例外是别名页（`/need/student-only/` 等三条）顶上那条
   * `<p class="snote aliasnote">`。上一轮把它判成「导航更正」，理由是「读者点进旧地址时必须
   * 知道自己在哪、该去哪」—— **这条理由站不住**，本轮实测逐条推翻：
   *
   *   · 它渲染出来的**不是导航**：正文里既没有「去目标页」的可点路径（链接的是页面标题，
   *     不是「换个页面看」这个动作），也没有面包屑之外的任何导航语义 —— 读者真正用来导航的
   *     是面包屑与站内链接，那两处都不靠这句话。实测三个别名页各有 **183** 个站内入链来源
   *     （排除三个别名页自身后仍是 183），全站**零入链路由 0**：这句话对「找得到目标页」
   *     零贡献。
   *   · 它渲染的是**站务机制与内部标识符**：「保留旧地址可用」「搜索引擎的收录以目标页为准
   *     （本页为 noindex）」是站务口径；`原因：….studentSignal` / `benefitType 含 free_api`
   *     是内部判据标识符。两类都在 H11 / H13 的移除之列 —— 上一轮之所以把它当例外留下，
   *     是因为构建期那条扫描当时用 `class="snote"` **精确串**匹配，对
   *     `<p class="snote aliasnote">` **一条都照不到**（`changes-selftest` ⑪ 有正反例探针），
   *     于是它的内部措辞从来没被任何守卫看见过 —— 「没被咬到」被误读成了「判过没问题」。
   *
   * 本轮整条删除（不是写短、不是折叠、不是改名），并让**目录页家族（含别名页）**走同一条
   * 判据：首屏页面级说明 **0 条**。删掉之后三个别名页的底部折叠块仍然非空 —— 它们在按需求页
   * 注册表里本来就有自己的 `userNotes`（1 / 2 / 2 条），本轮只是删掉了「别名页不吃共享句」
   * 那个分叉，共享句因此照常进折叠块，不是空容器。机器上由两条牙守着：本文件的首屏扫描
   * （判据已从「非别名页 0 条」升级为「全家族 0 条」）与 `verify-site.js` §22c ③b。
   */

  /**
   * 底部折叠说明。**共享句在前、本页特有句在后** —— 顺序固定，产物因此可复现。
   * 共享句是全站同一句，不逐页复制（prompt §20：不要每个模板抄一份不同版本的说明）。
   *
   * ## disclosure 可发现性（page-notes-disclosure-v1）
   *
   * 折叠逻辑本来就是对的（原生 `<details>`，无 JS 可用），缺的是**可交互提示**：
   * 收起时它长得像一行普通小标题，读者看不出整行能点。本轮只补 affordance，三层语义不变：
   *
   *   · 左侧 `page-notes-chevron`：CSS 画的 disclosure 箭头（收起 › / 展开 ⌄），
   *     `aria-hidden` —— 它是装饰，不是信息；
   *   · 右侧 `page-notes-action`：状态文案由 **CSS `::before` 生成**（收起「展开」/ 展开「收起」）。
   *     刻意**不写进 DOM**：① `verify-site.js` 的无 JS 探针读 `summary.textContent` 是不是
   *     逐字等于「分类说明」，加字面量会把那条既有断言打红；② 生成的文案不进正文文本，
   *     也就不进 SEO 的字数口径。两条都是有意的，不是巧合。
   *   · 整行即点击区（summary 铺满宽度 + `min-height: 44px`），箭头 / 标题 / 中间空白 /
   *     右侧文案任意一处都能触发折叠 —— 由 §15b3 的「空白带中点」断言盯着。
   *
   * 开合状态、键盘切换（Enter / Space）与屏读的展开状态**全部交给浏览器**：不手写
   * `aria-expanded`，也不引 JS 状态管理。默认仍然是**收起**（分类说明是次级信息）。
   */
  const SHARED_NOTES = {
    // 分类边界：三类切法（人群 / 福利类型 / 分类）本来就会重叠。
    overlap: '同一条优惠可能同时出现在多个标签页。',
    // 误解说明：表格里会出现「尚未确认」这个 token，不解释会被读成「不可用」。
    tristate: '表格里写「尚未确认」的字段表示我们没查到依据，不代表不可用。',
    // 枢纽页没有条目表，换成入口口径 + 「为什么某个分类/厂商不在这里」。
    // 后半句是真有用户价值的：读者找某家厂商找不到时，最想知道的就是「是没有，还是没成页」。
    hub: '每个入口一页，页面上的条数按当前数据现算。',
    hubMissing: '没有出现在这里的分类与厂商，是条目数还没有达到独立成页的门槛 —— 不代表没有这类优惠。'
  };
  const sharedNotes = isHub
    ? [SHARED_NOTES.hub, SHARED_NOTES.hubMissing]
    : [SHARED_NOTES.overlap, SHARED_NOTES.tristate];
  const ownNotes = Array.isArray(spec.userNotes) ? spec.userNotes.filter(line => typeof line === 'string' && line.trim()) : [];
  // 别名页**不再**吃自己的分叉：它也有自己的 `userNotes`（它在按需求页注册表里），
  // 但共享句照样进折叠块 —— 「别名页不吃共享句」那个分叉随 `.aliasnote` 一起退役
  // （见上面那段：例外退役的实测依据）。
  const noteLines = [...ownNotes, ...sharedNotes];

  // ---- 说明意图（notes-manifest-v1）：这一页属于哪一族 + 页面族的结构下限 ----
  //
  // 下限是**页面族不变式**，与「具体哪几条说明」无关：**目录页家族（含别名页）**在 `<main>` 里
  // 一条 `.snote` 都不该有（首屏说明那一层已删，别名页那条导航更正本轮也整条删除），
  // 底部折叠至少要有共享句那几条，厂商页六节说明一条不少。防的是「登记与模板一起被删」
  // —— 那时两侧会同时少一条，逐条对账看不见，只有下限还站得住。
  //
  // ⚠️ 上一版这里写的是「别名页必须恰好有 1 条页面级说明（导航更正）」+ `isAlias ? 1 : 0` ——
  //    那条例外退役的实测依据见 renderDirectoryPage 顶部的说明块。下限现在**全家族同形**：
  //    `main-snote` 0 条、`main-pnote` 至少共享句条数 —— 别名页与其它目录页不再有第二种形状。
  const pageRoute = spec.route || `${spec.slug}/`;
  notePage(pageRoute, {
    kind,
    floors: {
      'main-snote': { min: 0 },
      'main-pnote': { min: sharedNotes.length },
      'main-vsnote': { min: kind === 'vendor' ? vendorPage.VENDOR_NOTE_COUNT : 0 }
    }
  });

  // 自有说明的类型标签：`landing.js` 的厂商页会带 `noteRows`（scope-note / vendor-material-note）；
  // 其余目录页的 `userNotes` 来自 `lib/audience.js` 的页面拷贝注册表 ⇒ 一律 `page-note`。
  const ownNoteKinds = ownNotes.map((line, index) => {
    const row = Array.isArray(spec.noteRows) ? spec.noteRows[index] : null;
    return (row && row.kind) || 'page-note';
  });
  const sharedNoteKinds = isHub
    ? ['hub-scope-note', 'hub-threshold-note']
    : ['shared-overlap-note', 'shared-tristate-note'];
  // 与 noteLines 同一处分叉一起退役：别名页的签名集合 = 自有签名 + 共享签名。
  const noteKinds = [...ownNoteKinds, ...sharedNoteKinds];

  const notesHtml = noteLines.length
    ? `      <details class="page-notes">
        <summary class="page-notes-summary">
          <span class="page-notes-leading"><span class="page-notes-chevron" aria-hidden="true"></span><span class="page-notes-title">分类说明</span></span>
          <span class="page-notes-action" aria-hidden="true"></span>
        </summary>
${noteLines.map((line, index) => noteDeclare(pageRoute, {
    kind: noteKinds[index] || 'page-note', slot: 'main-pnote', classes: 'pnote',
    declaredBy: 'build-local.js:renderDirectoryPage(page-notes)'
  }, `        <p class="pnote">${line}</p>`)).join('\n')}
      </details>

`
    : '';

  // 面包屑：分类页/厂商页多一层**真实存在**的枢纽（`/category/`、`/vendor/`）。
  // 面包屑的每一级 URL 都必须真的能打开 —— 这是 v1.7 起有断言的一条（Tooth Test #5）。
  const crumbParent = kind === 'category'
    ? { name: '按分类浏览', route: 'category/' }
    : (kind === 'vendor' ? { name: '按厂商浏览', route: 'vendor/' } : null);

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

  /**
   * 题注（`<caption>`）—— **只写条数**。
   *
   * 为什么把原来那两句搬走（secondary-page-content-simplification）：
   *   · 「本页按单一判据收条目，判据写在上面的说明里」是**维护口径**（prompt §5 点名的
   *     「这一页按……收」「这个页面的生成判据是什么」两类，都在默认移除之列）；
   *   · 「首页卡片数为何少于本页条数」同样是维护口径 —— 读者不需要为了看懂这一页，
   *     先去理解首页的折叠规则。
   *   · 「没有依据的字段写「尚未确认」，不写成「不可用」」是**用户需要**的图例，
   *     但它属于「少量误解说明」→ 移到底部 `.page-notes`（见 SHARED_NOTES.tristate）。
   *
   * ## 为什么别名页的题注**不再**保留（`secondary-page-residue-v1`）
   *
   * 上一版这里是三支，别名页那一支保留了一句长题注（62 / 63 / 64 字）：
   * 「共 N 条 —— 与 X 是同一批条目（同一份判据）。这一页保留旧地址可用，但**不参与搜索收录**；
   * 收录以目标页为准。」上一轮的理由是「读者点进旧地址时必须知道自己在哪、该去哪里，那是
   * USER_REQUIRED，不是维护口径」—— **这个理由不成立**：
   *
   *   · 「保留旧地址可用」与「不参与搜索收录 / 收录以目标页为准」是**站务机制**，
   *     与读者判断这一页的条目能不能用无关；一句话里点了两次「收录」。
   *   · 标题下面那行 `meta` 已经写了条数，表格上方再写一遍「共 N 条」是**重复**（本轮要删的
   *     B 类残留就是这一类）。
   *   · 读者真正需要的那件事（「这是一条旧地址」）本来就不该靠正文说 —— 那条路走的
   *     是 `landing-aliases.json` 的机制侧契约（`noindex,follow` + 自指 canonical + 不进 sitemap
   *     + 条目集合与目标页逐条相同），页面上不再有任何说明文字。
   *
   * 于是三支合并成两支：枢纽页写入口数，其余目录页（**含别名页**）写条数。
   * ⚠️ 判据边界：格式牙（本文件的「目录页家族题注形状」扫描）只能证「每一页的题注都是
   * `共 N 条。` 形状」，**证不了**「别名页题注 == 非别名页题注」—— 两侧走的是同一条规则，
   * 这正是它弱的地方；「别名页确实走了同一条分支」由**源码形状**（这一支里没有 kind 分叉）
   * 与 diff 保证，机器上则由首屏说明 = 0 与题注形状两条各自守着各自的那一半。
   */
  const caption = isHub
    ? `共 ${childList.length} 个入口。`
    : `共 ${deals.length} 条。`;

  // 数据摘要（v1.7）：每个数字都带 `data-summary-label/value`，既给读者看，
  // 也给 SEO 门禁**独立重算**用 —— 「页面写 12、实际列 7」因此在构建期就红。
  //
  // ⚠️ 可见的 `<small>判据：…</small>` 本轮**删除**（它是字段级维护口径，prompt §5/§8）。
  //    判据原文改挂在 `<li title="…">` 上：想核对的人悬停即可看到，首屏不再有这一行。
  //    机器可读的两个属性**一个都没动** —— 门禁读的正是属性
  //    （`seo.js` 的 `data-summary-label="X" data-summary-value="Y"` 重算、
  //    `build-local.js` 摘要自检、`verify-site.js` 的 `[data-summary-label]` 采样），
  //    所以「删掉可见文字」与「删掉机器口径」是两件事，这一点有断言守着。
  /**
   * search-intent-v1（W2）：**事实摘要**（`aside.factsum`）—— 只挂在 `/need/*` 这 10 页上。
   *
   * 为什么只有需求页：这 10 页接的是「已经有搜索需求、但还没答案」的问句式查询
   * （「免费大模型有哪些」「不用信用卡的 AI」）。读者落地后要的不是又一张表，而是
   * **先把事实答掉**：多少条、谁家最多、门槛卡在哪、能不能在国内用、数据是哪天的。
   * 分类页/厂商页的读法是「按类目找」，同一块加在 106 个目录页上只会把页高整体推高
   * （页高回归线是基线的 1.15 倍），收益与风险不成比例。
   *
   * 每一行都在构建期现算，行上带 `data-fact-key/value` 两个机器可读属性；门禁
   * （`verify-site.js` §22e）拿 `deals.json` 的**原始记录**重算这 5 行并逐字比对 ——
   * 「页面上写 17 条、表里只有 12 行」这类错误因此在门禁里就红。
   * 口径句是 `factSummary.CALIBER` 常量，页面与断言共用同一份字面，不存在两处各写一句。
   */
  // 10 个 `/need/*` 页里，student-only / free-api / dev-credits 三页是钉住的**别名页**
  // （`kind: 'alias'`，canonical 指向正本）。它们渲染的是同一张表、同一批条目，
  // 所以同一个事实摘要也必须出现 —— 判据按**路由**取，不按 kind 取，否则这三页会漏。
  const isNeedPage = String(spec.route || '').startsWith('need/');
  const factRows = isNeedPage
    ? factSummary.rowsFor(deals, { asOf: context.lastmod, vendorKeyOf: VENDOR_KEY_OF })
    : [];
  const factHtml = factRows.length
    ? `
      <aside class="factsum" aria-label="事实摘要">
        <p class="factsum-cap">事实摘要</p>
        <dl class="factsum-list">
${factRows.map(row => `          <div class="factsum-row" data-fact-key="${htmlEscape(row.key)}" data-fact-value="${htmlEscape(row.value)}">` +
    `<dt>${htmlEscape(row.label)}</dt><dd>${htmlEscape(row.value)}</dd></div>`).join('\n')}
        </dl>
        <p class="factsum-caliber">${htmlEscape(factSummary.CALIBER)}</p>
      </aside>`
    : '';

  const summaryHtml = summary.length
    ? `      <ul class="lsum" aria-label="当前数据摘要">
${summary.map(row => `        <li data-summary-label="${htmlEscape(row.label)}" data-summary-value="${htmlEscape(String(row.value))}"` +
    ` title="判据：${htmlEscape(row.source || '')}">` +
    `<span>${htmlEscape(row.label)}</span><b>${htmlEscape(String(row.value))}</b>${htmlEscape(row.unit || '')}</li>`).join('\n')}
      </ul>`
    : '';

  /**
   * v1.8-seo-answer-pages：**答案页的门槛速查表**（只有 spec.thresholdSummary 的页面输出，
   * 当前是 /free-api/）。回答顺序是「先总览、后逐条」：读者先看某个平台卡在哪道门槛，
   * 再决定要不要往下读 45 行明细。
   *
   * 四个维度的口径**全部来自 `lib/threshold-summary.js`**（唯一实现），本函数只做分组与拼表：
   *   · 实名认证 —— deals 的三态字段聚合（需要 n 条 / 不需要 m 条 / 尚未确认 k 条）；
   *   · 限流     —— 按平台 join `api-plans.json` 的 limits / rate_limit，没有则「数据未收录」；
   *   · 商用限制 —— 数据里没有「可否商用」字段 ⇒ 明写「不可商用：数据未收录」（不写成允许）；
   *   · 地区     —— deals 的 chinaUsable / regionRestriction。
   *
   * ⚠️ 行上**不许**带 `data-item`：/free-api/ 的 ItemList 声明的是 45 条优惠，
   * SEO 门禁按 `data-item` 数行（`itemlist-arity`）。这张汇总表的行不是优惠条目，
   * 带上标记会把「声明 45 / 行 57」变成一条假红。
   */
  const thresholdTableHtml = (() => {
    if (!spec.thresholdSummary) return '';
    const apiPlanList = Array.isArray(context.apiPlans) ? context.apiPlans : [];
    const providerTable = context.providerTable || null;
    const providerKeyByName = new Map();
    if (providerTable) {
      for (const [key, entry] of Object.entries(providerTable)) {
        if (entry && entry.name) providerKeyByName.set(entry.name, key);
      }
    }
    const plansByProvider = new Map();
    for (const plan of apiPlanList) {
      const list = plansByProvider.get(plan.provider) || [];
      list.push(plan);
      plansByProvider.set(plan.provider, list);
    }
    const groups = new Map();
    for (const deal of deals) {
      const name = VENDOR_KEY_OF(deal) || deal.vendor || '未标注';
      const list = groups.get(name) || [];
      list.push(deal);
      groups.set(name, list);
    }
    const rows = [...groups.entries()]
      .sort((a, b) => (b[1].length - a[1].length) || String(a[0]).localeCompare(String(b[0]), 'zh'))
      .map(([name, items]) => {
        const providerKey = providerKeyByName.get(name);
        const plansOfVendor = providerKey ? (plansByProvider.get(providerKey) || []) : [];
        const identity = thresholdSummary.triSummary(items,
          deal => deal.eligibilityDetail && deal.eligibilityDetail.identityVerificationRequired);
        const cells = [
          `<th scope="row">${htmlEscape(name)}<small>${items.length} 条免费 API</small></th>`,
          htmlEscape(identity),
          htmlEscape(thresholdSummary.limitsSummary(plansOfVendor)),
          htmlEscape(thresholdSummary.useRestrictionsSummary(plansOfVendor)),
          htmlEscape(thresholdSummary.dealRegionSummary(items))
        ].map((cell, index) => (index === 0 ? cell : `<td>${cell}</td>`)).join('');
        return `        <tr>${cells}</tr>`;
      }).join('\n');
    return `
      <h2 class="ph2" id="thresholds">各平台门槛速查：实名、限流、商用与地区</h2>
      <p class="answernote">按平台汇总本页条目，先回答「能不能真的用上」。<b>「数据未收录」</b>表示官方页没有给出、或本站还没有结构化收录该维度 —— <b>不等于</b>没有限制，也不等于允许商用。同一格的数字都能在 <code>deals.json</code> / <code>api-plans.json</code> 里找到出处；发现不一致请走表下的报错入口。</p>
      <div class="ctable-wrap">
      <p class="atable-caption">按平台汇总 · 共 ${groups.size} 个平台 · 最后核对 ${htmlEscape(String(context.lastmod || ''))}</p>
      <table class="ctable atable">
        <thead>
          <tr><th scope="col">平台 / 条目数</th><th scope="col">实名认证</th><th scope="col">限流（官方公布）</th><th scope="col">商用 / 公平使用</th><th scope="col">中国大陆可用</th></tr>
        </thead>
        <tbody>
${rows}
        </tbody>
      </table>
      </div>
      <p class="ansfoot">这一行的数字与官方页不一致？<a href="${htmlEscape(context.reportUrl || reportIssueUrl('免费 API 门槛速查'))}">提一个数据修正 issue</a>（预填标题与正文，不需要表单服务）。</p>
`;
  })();

  // 最近变化（v1.7）：判据不在模板里，`landing.topicChangesOf()` 已经把本页条目的事件挑出来。
  const topicHtml = context.topic
    ? context.renderCore.changesTopicHtml(context.topic, prefix)
    : '';

  // 别名页的可见说明（`.aliasnote`）本轮**整条删除** —— 退役依据见 renderDirectoryPage 顶部
  // 那段「为什么现在没有例外」。三个别名页在按需求页注册表里本来就有自己的 `userNotes`，
  // 底部折叠块因此仍然非空（不许空容器的既有断言照旧盯着）。
  // `spec.aliasReason` 仍在 `landing.js` 里随计划传入（配置侧保留溯源），
  // 只是不再有任何渲染路径把它写进页面。

  // v3.0 Stage E：**厂商页的追加区块**（资料区块 + 它自己的 CSS）。
  //
  // ⚠️ t4 修复记录：这一块原先夹在「订阅声明」那几行之间（`const pageFeeds = …` 到
  // `const feedTags = …`），而 t4 删订阅声明时把这一段一起删掉了 —— 症状是 vendor 页整块资料
  // 消失、并且 `extraCss` / `extraHtml` 变成未定义（构建期 ReferenceError，好在 fail-fast）。
  // 现在把它**独立地**放回这里：它与订阅无关；只有 vendor 会返回非空 bundle，其余 kind 返回空，
  // 所以非厂商页的输出一个字节都没变（`check-reproducible` 替我们盯着这件事）。
  const extraBundle = typeof context.extraSections === 'function' ? context.extraSections(spec) : null;
  const extraHtml = extraBundle && extraBundle.html ? extraBundle.html : '';
  const extraCss = extraBundle && extraBundle.css ? extraBundle.css : '';

  const pageCss = `  /* 只用首页已有的设计变量，不新建一套视觉语言 */
  .cstop { display: flex; align-items: baseline; gap: var(--s2); flex-wrap: wrap; margin-bottom: var(--s2); }
  .cstop h1 { font-size: 19px; margin: 0; }
  .cstop .meta { color: var(--mut); font-size: var(--fs-sm); }
  .lsum { display: flex; flex-wrap: wrap; gap: var(--s2); list-style: none; margin: 0 0 var(--s3); padding: 0; }
  .lsum li { background: var(--card); border: 1px solid var(--line); border-radius: var(--r); padding: 6px 10px; font-size: var(--fs-sm); }
  .lsum li span { color: var(--mut); }
  .lsum li b { margin: 0 2px 0 6px; }
  /* search-intent-v1（W2）：事实摘要（.factsum）的样式定义在**共享 <style>**（index.html）里 ——
     需求页与免费模型详情页共用同一份，页面壳里不复制第二份（与 .snote 同一条纪律）。
     这里只留需求页独有的「表格下那一跳」。 */
  .factnext { margin: 0 0 var(--s3); color: var(--mut); font-size: var(--fs-sm); }
  /* ⚠️ 这里**不许**再写一条 .snote 规则：页面级说明的宽度只有一处定义，
     就是 index.html 共享 <style> 里那条**冻结串**（WIDE_SNOTE_FROZEN）。
     每页多写一份的症状是 §22c 的「冻结串恰好 1 次」断言全站变红。 */
  /* 底部折叠说明。单独一类（.page-notes / .pnote），刻意**不复用** .snote：
     闭合折叠块里的 .snote 会被 §22c 判成 note-unrendered（见上面那一段注释）。
     ⚠️ 两条写给下一个人的实测教训（2026-10-07，都在这一段注释里踩到过）：
     ① 这里**不写出**折叠标签的字面量（原本写过）。构建期的「作者正文无 Markdown 记号」按那个
        字面量取扫描窗口，写进页面级 CSS 会把后面整段样式表卷进窗口 —— CSS 注释里的任何
        Markdown 强调记号都会变成一条假阳性。去掉之后窗口正好从真实的折叠块开始，扫描面更准。
     ② 这里也**不许出现反引号**（原本也写过）。这段 CSS 是模板字符串的字面量，一个反引号就会
        提前闭合它，把 pageCss 变成 NaN —— 后果是**整页的页面级样式被静默丢掉**（NaN 是假值，
        页面壳不会输出 style 块），而构建期自检全绿。判据在浏览器层：§15b3 读 computed
        ::before content，CSS 没进去时它必然红。 */
  /* ---- 分类说明的 disclosure 控件（page-notes-disclosure-v1）----
     原生折叠元素 + 一行 44px 的整行点击区；开合、键盘与会话状态由浏览器负责，页面零 JS。
     视觉权重刻意低于优惠表格与 CTA：上下两条 hairline，不做成按钮。
     颜色全部走 token ⇒ 亮色 / data-theme="dark" / 跟随系统三态自动成立。 */
  .page-notes { margin: var(--s3) 0 0; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
  /* 默认 marker 只在**本组件**内抑制（写全局 summary 会误伤首页 FAQ、译文块、.chgother、
     .pevd 这些语义不同的折叠组件），避免出现「▶ ›」两个箭头。 */
  .page-notes > summary { list-style: none; }
  .page-notes > summary::-webkit-details-marker { display: none; }
  .page-notes-summary {
    display: flex; align-items: center; justify-content: space-between; gap: var(--s2);
    width: 100%; min-height: 44px; padding: 10px 12px;
    cursor: pointer; color: var(--ink2); font-size: var(--fs-sm); font-weight: 600;
    border-radius: var(--r-sm);
    transition: background-color var(--t-fast) var(--e-std);
  }
  /* hover 底色用 --card（而不是 --line2）：状态文案与箭头压在这层底上实测亮色 4.83:1 /
     暗色 6.08:1，都过 AA；换 --line2 会掉到亮色 ≈4.3:1（--mut 在 --bg 上本来就是 4.50:1 的临界值）。 */
  .page-notes-summary:hover { background: var(--card); }
  .page-notes > summary:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
  /* 标题允许折行，右侧状态永不被挤出去：leading 可收缩、action 不参与伸缩。 */
  .page-notes-leading { display: flex; align-items: center; gap: var(--s2); min-width: 0; }
  /* 箭头用 CSS 画（两条 border 组成的直角），不依赖字体里有没有箭头字形：
     收起 rotate(-45deg) → 指向右 ›；展开 rotate(45deg) → 指向下 ⌄。 */
  .page-notes-chevron {
    flex: none; width: 7px; height: 7px;
    border-right: 2px solid var(--mut); border-bottom: 2px solid var(--mut);
    transform: rotate(-45deg);
    transition: transform var(--t-fast) var(--e-std);
  }
  .page-notes[open] .page-notes-chevron { transform: rotate(45deg); }
  /* 右侧状态文案由 CSS 生成：DOM 里没有这两个字（见 notesHtml 上方那段注释）。
     它必须是**真实可见**的 —— 断言读 getComputedStyle(action, '::before').content。 */
  .page-notes-action { flex: none; color: var(--mut); font-weight: 400; }
  .page-notes-action::before { content: '展开'; }
  .page-notes[open] .page-notes-action::before { content: '收起'; }
  .page-notes > .pnote { color: var(--mut); font-size: var(--fs-sm); line-height: 1.7; margin: 0; padding: 0 12px var(--s2); }
  .page-notes > .pnote:last-child { padding-bottom: 12px; }
  /* ---- 最近变化（条件模块 · secondary-page-intro-changes-v1）----
     只有真的存在与本页条目相关的变化事件时才输出（判据在 RENDER-CORE 的 changesTopicHtml：
     零变化与日志不可用都整块不渲染）。视觉权重刻意**低于**优惠表格：一条 hairline +
     小标题 + 紧凑列表，不做卡片、不做大号标题、不加底色。
     颜色全部走 token ⇒ 亮色 / data-theme="dark" / 跟随系统三态自动成立（无硬编码白色）。
     ⚠️ 这里也不许出现反引号，也不许写 .snote 规则（同上面那两条硬约束）。
     v3.2（t5）：这一块的 9 条规则**已搬到 index.html 的共享 <style>**（那一份由 loadShellParts()
     抽给**全部页面族**，所以目录页仍然拿得到），本文件里不再保留副本 —— 与 .detail-main / .snote
     同一条纪律：「一处定义、全站生效」；两处并存就是两份会各自漂移的样式。 */
  /* CLS 治理（组 B · 本块唯一改动）：根因是 auto 布局 —— 表格每解析进一批新行就重新协商一次列宽，
     协商结果一旦跨过某个折行阈值，行高就跟着跳变；而 DOM 全程零变更（逐帧采样 + MutationObserver
     实测：位移全部发生在解析期，与 JS 无关）。fixed 让列宽按表格宽度一次定死，行高不再随解析进度重排；
     width: 100% 给了 fixed 所需的确定表宽，两者必须同时在。
     45 页 × 390/761/940 三档、两轮独立全量（每轮 135 例）+ 关键例各 5 次重复，实测：
       修前 base      ：CLS 合计 2.47–2.67，最大 0.276–0.277，≥0.1 有 7–8 例；列宽漂移 121–122、行高跳变 28–30。
       修后 fixed+520 ：CLS 合计 0.15–0.18，最大 0.01772，≥0.1 为 0 例；列宽漂移 16–23、行高跳变 11–13；
                        t>3s 残余漂移/跳变 0/0；单元格被裁 0（45×3 全表逐格数）；documentElement 横向溢出 0；
                        390px 档需容器内横滚 162px（由 .ctable-wrap 的 overflow-x 承载）。
     修后那 0.00887–0.01772 的残余不是表格：layout-shift 来源节点是 DIV.wrap，机制是页面壳的折叠外边距
     竞态（.wrap 的 padding-top 为 0，main 首子元素 .crumb 的 margin-top: var(--s4) = 16px 折出 .wrap 之外 ——
     crumb 还没解析出来的那一帧，.wrap 上边界贴在 header 底下；crumb 一到，整块正好下移 16px。
     16px / 844px 视口高 = 0.018957，乘以各页不同的影响面积比 0.47 / 0.73 / 0.84 / 0.93，
     就得到 0.00887 / 0.01393 / 0.01591 / 0.01772 这四个离散值）。
     关键：该模在「修前的同页同档」上同样出现（实测 base 也复现 0.01772、0.01591），所以它不是 fixed 的代价，
     也不是本块能修的 —— 要动就得改共享 <style> 里 .wrap 的 padding-top 与 .crumb 的 margin-top。
     min-width 520px 是实测出来的下限，不是拍脑袋：只写 fixed 而不给 min-width 时，390px 档有 43 个
     (页,档) 样本出现单元格被裁（单元格 scrollWidth > clientWidth，全表逐格计数；列被压到 71px）；
     补上 min-width 后 45 页 × 3 档共 135 个样本的裁切数为 0。
     520 vs 560（45 页全量对照）：CLS 合计 520 = 0.1758、560 = 0.1960，上限都是 0.01772、≥0.05 都是 0；
     漂移 18.5 vs 17、跳变 11 vs 10、裁切都是 0；761/940 两档页高逐页完全相同（合计 104744 / 91445）；
     390px 档 520 的页高比 560 高 2106px（45 页合计，+1.8%，列更窄、格内折行更多），但 390px 的横滚需求
     520 比 560 少 40px（162 vs 202）。取舍：CLS 与裁切完全等价，拿「窄屏多 1.8% 页高」换「窄屏少 40px
     横滚」，取 520，而不是交接文档里写的 560。
     （captain 探针 .scratch/captain-probe-ctable2.cjs 同口径复核：16 个关键例上 520 与 560 的行高中位
     合计与页高合计完全一致 —— 1378 / 48694。）
     有意副作用：390px 档需要容器内横滚 162px（表格固定 520px 宽）；换来的是「列宽首帧确定 + 页面总高下降」
     —— 窄屏上少一次整体重排、多一段横向滚动，是权衡后的取舍，不是漏项。
     ⚠️ 这段注释不许出现反引号（本模板字符串的硬约束）。也不许顺手给 .ptable 加同样的声明：fixed 会把
     /plans/ 在 940px 的列 [306,76,239,163,114] 等分成 [180,...]，页高 854 → 893px。 */
  .ctable { width: 100%; table-layout: fixed; min-width: 520px; border-collapse: collapse; background: var(--card); border: 1px solid var(--line); border-radius: var(--r); overflow: hidden; }
  .ctable caption { text-align: left; color: var(--mut); font-size: var(--fs-sm); padding: 0 0 var(--s2); }
  .ctable th, .ctable td { text-align: left; padding: 10px 12px; border-top: 1px solid var(--line); font-weight: 400; font-size: var(--fs-sm); vertical-align: top; }
  .ctable thead th { border-top: 0; color: var(--mut); font-weight: 600; white-space: nowrap; }
  /* 收口 4e：table-layout: fixed 不写列宽时浏览器把 6 列**等分**（1280px 下 248×5，而 auto 布局
     原本是 [413,172,279,173,201]）⇒ 原本宽列里的内容多折行 ⇒ 行高中位数变高
     （实测 vendor/baichuan 58→76、category/ 39→57）。只钉**前两列**（优惠名 / 适用人群）把宽度还给内容，
     其余列仍接受等分 —— 实测 9 页 × 4 档「变好 19 / 变差 1」、净 −208px，CLS 不回升、裁切 0、横向溢出 0。
     为什么**不**钉满 6 列：实测钉满在 390 / 940 反而变差（净 +123 / +87px）—— 窄列本来就该窄，
     钉成百分比又把它撑开了。改动面刻意只有两条声明：不引入 <colgroup>（45 个页面一个都没有，
     加它要动标记与 5 个页面族构建点，收益不抵成本）。
     同形先例：本文件 1949 / 2085 行的 .ptable thead th:nth-child(2) 就是同一做法。 */
  .ctable thead th:nth-child(1) { width: 32%; }
  .ctable thead th:nth-child(2) { width: 14%; }
  .ctable tbody th { font-weight: 600; }
  .ctable small { display: block; color: var(--mut); font-weight: 400; font-size: 11.5px; margin-top: 2px; }
  .ctable small.zh { color: var(--fg); opacity: .72; }
  .ctable .none { color: var(--mut); }
  .ctable-wrap { overflow-x: auto; }
  @media (max-width: 760px) { .ctable th, .ctable td { padding: 8px 9px; } }
  /* v1.8-seo-answer-pages：答案页的门槛速查表（只有 /free-api/ 输出）。
     复用 .ctable 的表格原语（边框 / 圆角 / fixed 布局），只把列宽改回内容优先：
     这张表 5 列、第二列起都是短句，固定 32%/14% 会把「实名 / 限流」压成多行。
     标题 .ph2 与 .answernote / .ansfoot 是本页新增元素；三种都不属于 .snote / .pnote /
     .vsnote 三类说明容器（它们各有维护口径与几何判据），不要复用那三个类名。 */
  .ph2 { font-size: 15px; margin: var(--s4) 0 var(--s2); }
  .answernote { color: var(--mut); font-size: var(--fs-sm); line-height: 1.7; margin: 0 0 var(--s2); max-width: none; }
  .ansfoot { color: var(--mut); font-size: var(--fs-sm); margin: var(--s2) 0 0; }
  .ansfoot a { color: var(--brand); }
  .atable-caption { color: var(--mut); font-size: var(--fs-sm); margin: 0 0 var(--s2); }
  .atable thead th:nth-child(1) { width: 18%; }
  .atable thead th:nth-child(2) { width: 16%; }
  .atable thead th:nth-child(3) { width: 20%; }
  .atable thead th:nth-child(4) { width: 26%; }
  .atable thead th:nth-child(5) { width: 20%; }
  .atable tbody th small { font-weight: 400; }
${extraCss}`;
  // 目录页（含 vendor 落地页）：渲染器持后缀 ⇒ 渲染器适配。description 刻意不动：
  // 目录页描述没有长度门禁，保持既有字节，避免无意改动已发布页面。
  const fittedTitle = pageFit.fitTitle(spec.pageTitle || spec.heading, ` · ${SITE_NAME}`);
  return `${shell.docStart({
    kind,
    route: spec.route || `${spec.slug}/`,
    prefix,
    parts,
    title: `${htmlEscape(fittedTitle)} · ${htmlEscape(SITE_NAME)}`,
    description: htmlEscape(spec.description),
    canonicalUrl: pageUrl,
    // v1.8-seo-answer-pages：目录页家族（含别名页）**一律不 noindex**。
    // 别名页改用 canonical 指向正本收口（见 pageUrl 的注释），sitemap 成员资格另由
    // 「canonical 是否自指」判（`lib/seo.js` 的 sitemap-policy），不靠 robots。
    //
    // P2（路由死锁机器化）是**唯一例外**：钉住路由在本次数据下掉出门槛时，计划层不硬拦，
    // 而是生成同 URL 的降级页（`spec.indexable === false`）—— 保住已发布 URL 优先于保持可索引。
    // 降级页按约定 noindex,follow（canonical 自指、不进 sitemap），其它页面输出逐字节不变。
    robots: spec.indexable === false ? 'noindex, follow' : 'index, follow, max-image-preview:large',
    faviconHref: `${prefix}favicon.svg`,
    extraCss: pageCss,
    jsonLdHtml: jsonLdBlocks,
    where: 'renderDirectoryPage'
  })}
      <nav class="crumb" aria-label="面包屑"><a href="${prefix}">首页</a>${
  crumbParent ? ` › <a href="${prefix}${crumbParent.route}">${htmlEscape(crumbParent.name)}</a>` : ''
} › <span>${htmlEscape(spec.title)}</span></nav>

      <div class="cstop">
        <h1>${htmlEscape(spec.heading)}</h1>
        <span class="meta">共 ${isHub ? childList.length : deals.length} ${isHub ? '个入口' : '条'} · 数据更新 ${htmlEscape(String(context.lastmod || ''))}${
  spec.thresholdSummary ? ` · 最后核对 ${htmlEscape(String(context.lastmod || ''))}` : ''}</span>
      </div>
${factHtml}
${summaryHtml}
${thresholdTableHtml}

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
${
  /**
   * search-intent-v1（W4）：需求页 → 计价页 / 计算器的**一句话链接**（只加链接，不改版式）。
   *
   * 为什么落在这里而不是事实摘要里：事实摘要回答「这一页有几条、门槛卡在哪」；
   * 读者往下看完表才会问「那我到底要花多少钱」，那是另一跳。
   * 锚文本用**查询词**（「每百万 tokens 多少钱」「按我的用量算一遍」），不写「点击这里」——
   * 后者对屏幕阅读器与搜索结果摘要都没有信息量。
   */
  isNeedPage
    ? `\n      <p class="factnext">要按 token 比价：<a href="${prefix}plans/api/">各平台每百万 tokens 多少钱</a> · <a href="${prefix}tools/api-cost/">按我的用量算一遍</a></p>`
    : ''
}

${topicHtml}

${extraHtml}
${notesHtml}${shell.docEnd({ route: spec.route || `${spec.slug}/`, prefix: prefix, parts, where: 'renderDirectoryPage' })}`;
}

/* ------------------------------------------------------------------ */
/* 组装                                                                 */
/* ------------------------------------------------------------------ */

/**
 * 把首页应用脚本按内容哈希落进产物，并改写暂存 index.html 的外链。
 *
 * 为什么必须在 `loadRenderCore(indexFile)` 之前调用：loader 现在从 HTML 的
 * `<script src>` 解析 RENDER-CORE 源文件；文件名改写与文件落盘必须同时发生。
 * 只改 HTML 不写文件 ⇒ loader 找不到脚本；只写文件不改 HTML ⇒ 产物指向
 * `assets/app.js`（一个不会发布到 dist 的源码路径）⇒ 线上 404。
 */
function stageAppScript() {
  const outPath = path.join(OUT, appAsset.FILE);
  fs.writeFileSync(outPath, appAsset.OUTPUT, 'utf8');
  fs.writeFileSync(path.join(OUT, styleAsset.FILE), styleAsset.OUTPUT, 'utf8');
  const htmlPath = path.join(OUT, 'index.html');
  let html = fs.readFileSync(htmlPath, 'utf8');
  const needle = 'src="assets/app.js"';
  const hits = html.split(needle).length - 1;
  if (hits !== 1) {
    throw new Error(`index.html 里应恰好有 1 处 ${needle}，实际 ${hits} 处（外链改写失去唯一锚点）`);
  }
  html = html.split(needle).join(`src="${appAsset.FILE}"`);
  fs.writeFileSync(htmlPath, html, 'utf8');
}

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

  // v6：首页主脚本外链。先把源码按内容哈希写成产物根的 `app.<hash>.js`，
  // 再把暂存 index.html 的 `src="assets/app.js"` 改写成那个名字。
  // 顺序不能反：紧接着的 loadRenderCore(indexFile) 会从 HTML 的 <script src> 解析
  // 到同名文件；如果先加载后改名，loader 会找不到脚本（构建当场失败）。
  // 只改 `src="…"`，不改注释里的源文件路径（那里写的是源码位置，不是产物 URL）。
  stageAppScript();

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

  // B 包：Codex 额度重置档案的数据（采集器写、构建期只读）。**不读墙钟、不碰网络** ——
  // 页面上的「数据截至 / 距上次重置」全部由这份文件里的 fetchedAt 算死，所以两次构建逐字节一致；
  // 外部 API 挂掉时采集器不覆盖旧文件，构建继续用上一份成功快照（页面只是数据截至时间变旧）。
  const codexResets = loadCodexResets();

  // 中文译文覆盖层：构建期贴一次，并把**贴好的**那份写进 dist/assets/data/offers.json。
  // 关键点——浏览器 fetch('assets/data/offers.json') 拿到的和下面预渲染用的是同一份对象，
  // 于是「构建期预渲染」与「浏览器端渲染」仍然只有一条代码路径。
  // 译文只在 zh 字段，英文原文字段一个字节都不动。
  const zhAttached = attachZh(payload.deals);
  payload.deals = zhAttached.deals;

  // 译文附着（2026-11-08 起**不再有构建期译文门禁**）：第 1 步的 validateDeal 跑在**未贴译文**的
  // deals.json 上，所以 lib/zh.js 的规则不经过它——原先这里补一道 throw 防止「译文不是中文 /
  // 字段名写错 / 超长」发到线上。现在那道防线仍在，只是位置变了：normalizeZh 会把不合规 /
  // 原文已变的字段**直接丢弃**（回退英文原文），产物里不可能出现坏译文；报告在下面打出来，
  // 构建不因此失败。理由：译文是附加信息，它坏掉最多让某一块显示英文，不该停掉整次发布。

  // 分类归属在**构建期**由 `audience.collectionsOf` 一处算出，写进 `dist/assets/data/offers.json` 的
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
  // 写进 `dist/assets/data/offers.json` 的 `needs` 字段。页面生成、首页入口数字、断言都读这一份 ——
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
  // 注入是有界的（每条最近 N 条 + 总数），保证浏览器只需 fetch 一次 assets/data/offers.json，
  // 且弹层与静态详情页读到的历史**完全同源**（v1.3 那次 `known` 被渲染成「未知」的教训）。
  const historyStore = history.load();
  let historyStats = null;
  if (historyStore.missing || historyStore.broken) {
    // 日志不可用：页面按纪律说「没有拿到历史日志」，而**数据出口仍要自洽** ——
    // 发布一份**如实的空账本**（`startedAt: null`、零事件、零基线），让 `deal-history.json`
    // 这个 endpoint 真的存在，Manifest 与页面读到的都是同一件事。
    // ⚠️ 空账本**不声称任何日期**（既不写构建时刻「今天」，也不拿 deals 的数据日期顶替）——
    // 它不是「没有变化」，只是「这一份账本里没有可公布的历史」。
    // 规则本体见 `lib/changes.js` 的「变化日志的可用性 → 数据出口 Manifest 的如实登记」。
    console.warn(`    ⚠️  历史日志不可用（${historyStore.broken || '文件缺失'}）——本次产物里没有变更记录，`
      + 'check:history 会报错；dist/deal-history.json 是**如实空账本**（无日期 / 无事件）');
  } else {
    historyStats = history.summarize(historyStore.store, payload.deals);
    payload.deals = history.attachToDeals(payload.deals, historyStore.store);
    console.log(`  变更记录: ${historyStats.events} 条事件 · 涉及 ${historyStats.recordsWithHistory} 条记录 · ` +
      `起算日 ${historyStats.startedAt}（deal-history.json + 每条最近 ${history.RENDER_LIMIT} 条注入 dist/assets/data/offers.json）`);
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
  // 厂商门槛**复用订阅那一套常量**（site.VENDOR_THRESHOLDS）：页面与 Feed 的集合
  // 因此在结构上不可能分头变化 —— 这正是 v1.6 报告里那条「URL 稳定性只兜住一半」的补法。
  // 厂商事件数：唯一实现在 `landing.vendorEventCountsOf()`（构建期 / 独立验收 / 三个 selftest 同源）。
  const vendorEventCount = landing.vendorEventCountsOf({
    deals: payload.deals,
    events: history.eventsOf(historyStore.store),
    vendorKeyOf: VENDOR_KEY_OF
  });
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
    // 与 `deal-history.json` 同一处置：发布**如实空账本**，让数据出口的 endpoint 自洽（无日期、无事件）。
    console.warn(`    ⚠️  套餐变化日志不可用（${planHistoryLoad.broken || '文件缺失'}）——本次产物里没有套餐变更记录，`
      + 'check:plan-history 会报错；dist/plan-history.json 是**如实空账本**（无日期 / 无事件）');
  } else {
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
    // 同上：如实空账本，无日期 / 无事件。
    console.warn(`    ⚠️  API 计费变化日志不可用（${apiPlanHistoryLoad.broken || '文件缺失'}）——本次产物里没有 API 价格变更记录，`
      + 'check:api-plan-history 会报错；dist/api-plan-history.json 是**如实空账本**（无日期 / 无事件）');
  } else {
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
  // t4：原先这里把派生出的 models.json / model-registry-links.json 写进产物，并与仓库里那份
  //（npm run models:rebuild 的产物）逐字节对账。产物里不再发布任何数据集（判据见
  // lib/published-assets.js），所以**写盘与那条对账一起删除** —— 「派生产物可重建」这件事
  // 本来就由 L2 门禁 check:models:reproducible 独立守着（它不依赖发布副本，比这里更强）。
  // 页面与自检仍然用内存里的 publishedModels / publishedModelLinksModelDoc（见 return）。
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
    vendorSlugs: site.VENDOR_SLUGS,
    vendorThresholds: site.VENDOR_THRESHOLDS,
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
    `${landing.statsOf(DIRECTORY_PAGES).canonicalAliases} 条 canonical 别名（不进 sitemap）`);
  for (const row of PLAN.skipped) {
    console.log(`    跳过 ${row.kind}/${row.key}${row.route ? ` (${row.route})` : ''}：` +
      `count=${row.count}${row.eventCount !== undefined ? ` events=${row.eventCount}` : ''} · ${row.reason}` +
      `${row.dealMaterial !== undefined ? ` deals=${row.dealMaterial}` : ''}` +
      `${row.nonDealMaterial !== undefined ? ` nonDeal=${row.nonDealMaterial}` : ''}` +
      `${row.detail ? ` · ${row.detail}` : ''}`);
  }

  // P1（slug 死锁机器化）：首次遇到的新厂商由 suggestSlug() 现场分配 slug。构建过程**不写源数据**，
  // 落盘交给 collect 侧的 scripts/tools/sync-vendor-slug-ledger.js（与计划层共用同一个解析函数）。
  for (const row of PLAN.autoSlugVendors) {
    console.log(`    auto-slug: vendor/${row.slug}/  ← 厂商「${row.vendorName}」首次分配（账本待写盘工具落盘）`);
  }
  // P2（路由死锁机器化）：钉住路由自动降级、非拉丁厂商名哈希 slug ⇒ 只告警、不停机；
  // Summary / 日志里点名，长尾厂商不该让发布停下来等人补登记。
  for (const line of PLAN.warnings) console.log(`    ${line}`);

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
    console.log(`  优惠 ↔ 套餐: ${dealLinksCheck.stats.links} 条当前关系 · 历史 ${dealLinksCheck.stats.retired} 条` +
      ` · 覆盖 ${dealLinksCheck.stats.plansWithCurrent}/${dealLinksCheck.stats.plans} 条套餐` +
      ` · 基准日 ${dealLinksAsOf || '未知'}` +
      (dealLinksCheck.stats.editorial ? ` · 人工判断 ${dealLinksCheck.stats.editorial} 条` : ''));
  }

  // t4 删掉的 Feed 层（`feeds.buildFeeds()`：把三份日志与**整张注册表**翻译成 RSS 2.0 与 JSON Feed）
  // **没有**整块回来：v3.2 请回来的是**站点级的两条产物**（`feed.FEED_FILES`），它们由
  // `lib/feed.js` 直接从三支日志的事件流构造，不经过任何「每页一份 Feed」的注册表 ——
  // 所以今天「页面声明的订阅源」只有两个路由（首页与 `/changes/`），不是每族一份。
  // 落盘在下面 `assemble()` 里紧跟 sitemap 之后（那一段写明了内容来源与三条纪律）。

  // 首页数据资产（t3：`assets/data/offers.json`）。`dist/assets/` 本来不存在（仓库里的 `assets/`
  // 只有 `assets/logos/` 这个源目录），所以**必须先建目录**再写 —— 少了这一行就是 ENOENT。
  fs.mkdirSync(path.dirname(path.join(OUT, OFFERS_ARTIFACT)), { recursive: true });
  fs.writeFileSync(path.join(OUT, OFFERS_ARTIFACT), `${JSON.stringify(payload)}\n`, 'utf8');
  console.log(`  中文译文: ${summarizeZh(zhAttached.report)}`);
  zhAttached.report.stale.forEach(row =>
    console.warn(`    🔁 原文已变，译文已停用（回退英文）: ${row.title} — ${row.message}`));
  zhAttached.report.orphaned.forEach(row =>
    console.warn(`    ⚠️  译文对不上任何条目 id（条目可能改名/换 URL）: ${row.id} ${row.title}`));
  zhAttached.report.skipped.forEach(row =>
    console.warn(`    ⚠️  译文不合规，已回退英文原文: ${row.title} — ${row.message}`));
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

  // 骨架的其余部分：筛选条计数、顶栏汇总、结果条、分类选项、焦点双栏卡、探索工具带
  html = replaceMarker(html, '<!--PRERENDER:facets-->', rendered.facets);
  html = replaceMarker(html, '<!--PRERENDER:topstat-->', rendered.topStat);
  html = replaceMarker(html, '<!--PRERENDER:stats-->', rendered.stats);
  html = replaceMarker(html, '<!--PRERENDER:categories-->', rendered.categories);
  html = replaceMarker(html, '<!--PRERENDER:spotlights-->', renderCore.spotlightsHtml(rendered.cards));
  html = replaceMarker(html, '<!--PRERENDER:toolribbon-->', renderToolRibbon(plansStore, apiPlansStore));
  // 按需求找优惠的入口行（v1.2）：静态 <a>，无 JS 可点。Direction B 放在主优惠列表之后、
  // FAQ 之前，既消除首屏 10 格白框墙与 #main 绝对定位偏移，又完整保留 10 个 /need/* 站内入链。
  html = replaceMarker(html, '<!--PRERENDER:needs-->', renderNeedRow(payload.deals));
  // 变化雷达条带（v1.5）：同样一行静态导航，紧跟按需求入口行。它与 /changes/ 页
  // 共用 RENDER-CORE 的渲染函数，读的是上面算好的同一份 radar。
  html = replaceMarker(html, '<!--PRERENDER:changes-->', renderCore.changesStripHtml(radar));
  // v3.2：首页折叠线以下的「最近变化」区块 —— 复用 `/changes/` 与目录页那**同一个**渲染器
  //（RENDER-CORE 的 `changesTopicHtml`，一个字都没改；`TOPIC_CHANGES_MAX` 保持 3），
  // 数据视图由 `landing.topicChangesOf()` 给出（契约第 9.2 条的固定调用形态）：
  //   · `dealIds === null` ⇒ 不按 id 过滤（取「最近 7 天变化」这一栏的全部条目）；
  //   · `excludeIds` = **已在首屏条带里出现过**的条目 ⇒ 新块与条带结构上不可能重复同一件事。
  // 0 条可选时 `changesTopicHtml` 自己返回空串（H14 条件模块：不留标题、不留空态、不留空容器）。
  const homeTopic = landing.topicChangesOf(radar, null, {
    sectionOrder: ['changed'],
    excludeIds: new Set(radar.home.items.map(item => item.id))
  });
  const homeTopicHtml = renderCore.changesTopicHtml(homeTopic, '');
  html = replaceMarker(html, '<!--PRERENDER:changestopic-->', homeTopicHtml);
  // t4 撤掉的「订阅发现」（首页 <head> 里现场生成一串 `rel="alternate"`）**没有**回来：
  // v3.2 的订阅声明面只有两条，而且它们写在 `index.html` 的骨架里（由 `FEED_FILES` 派生、
  // 走 `__SITE_URL__` 占位符），不在这个注入点里 —— 这里只填正文块。
  console.log('  筛选条 / 汇总 / 分类选项 / 按需求入口 / 变化雷达: 已填充');
  console.log(`  最近变化块（折叠线以下）: ${homeTopicHtml
    ? `${(homeTopicHtml.match(/data-topic-shown="(\d+)"/) || [])[1] || '?'} 行 / 可用 ${homeTopic.totals} 条`
      + `（首屏条带已占 ${radar.home.items.length} 条，本块不重复它们）`
    : '整块不渲染（0 条可选 —— 条件模块的既有行为）'}`);

  // 站点绝对地址：源码里不硬编码第二份 URL
  const urlSlots = html.split('__SITE_URL__').length - 1;
  html = html.split('__SITE_URL__').join(SITE_URL);
  console.log(`  站点地址替换: ${urlSlots} 处`);

  // v1.8-seo-answer-pages：站点归属验证 meta（GSC / 百度搜索资源平台）。
  // 注入块落在 `index.html` 的 `<head>` 里（`<!-- SEO:VERIFICATION:START/END -->`），
  // token 的唯一出处是 `scripts/data/site-verification.json`。未配置时输出空块
  // （只剩标记），**绝不生成占位 token** —— 假 token 的后果是「以为提交了、其实一直验不过」。
  html = siteVerification.inject(html, siteVerification.readConfig());
  console.log(`  站点归属验证: ${siteVerification.summary(siteVerification.readConfig())}`);

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

  // 标记必须全部消失——残留意味着某个替换静默失败了。
  //
  // ⚠️ v3.2 修的一条**归因**缺陷：原先这里用裸子串 `html.includes(marker)`，而
  // `PRERENDER:changestopic` **包含** `PRERENDER:changes` ⇒ 真凶是 `changestopic` 却报成 `changes`
  //（ui / guards / gate 三方都被这条误导过）。现在按**完整注释字面**匹配 `<!--PRERENDER:<name>-->`。
  // 这**不是**放松：残留仍然当场抛错，而且下面还有一条兜底把「写坏形态的残留」也拦住。
  for (const marker of PRERENDER_MARKERS) {
    if (html.includes(`<!--${marker}-->`)) throw new Error(`预渲染标记未被替换: ${marker}`);
  }
  {
    // 兜底（判的是另一件事）：任何形态的 `PRERENDER:` 残留也判红 —— 上面那条只点得出
    // **登记过的**完整标记名，而"标记被写坏"（少一个 `--`、多一个空格）或"出现一个没登记的
    // 新标记"正是它照不到的那两类。产物层还有一条更粗的 `/PRERENDER:/`（index.html 的整体扫描）。
    const leftover = html.match(/<!--PRERENDER:[^>]*-->/);
    if (leftover) {
      throw new Error(`骨架里残留了未登记的预渲染标记 ${leftover[0]}`
        + '（PRERENDER_MARKERS 里没有它，或它的替换被删掉了）');
    }
  }

  // 页脚的「数据源状态」链接：站内相对路径在不同深度下不一样
  // （首页 `status/`、详情页 `../../status/`、状态页自己 `../status/`），
  // 所以源码里只有一处占位符，各自在写出前替换。这里先只处理**首页那一份**，
  // 详情页与状态页的替换在各自的写出函数里做（它们拿到的是同一份含占位符的 html）。
  // 说明意图（notes-manifest-v1）：首页 `<main>` 里**一条** `.snote` 都没有（7 条在 `<main>`
  // 之外：详情模板与页脚那几处不在本清单的扫描面内），所以它的声明是「0 条」而不是跳过 ——
  // 「这一页不打算输出页面级说明」本身也是一个决定，漏登记会让它变成未纳管的页面。
  notePage('', { kind: 'home' });

  // 英文单页（`/en/`）。此时 `html` 还保留共享 `<style>` 与 `__PREFIX__` 占位符，
  // 正是 `loadShellParts()` 需要的形态；等首页 finalize 之后那些占位符已被解析，
  // 再抽就会把 `__PREFIX__en/` 解析成 `en/`（在 `/en/` 里就是 `en/en/` 的死链）。
  // 首页自己的产物一个字节都不受这一次抽取影响：`loadShellParts` 只读不写。
  {
    const enParts = shell.loadShellParts(html, ROUTE_HREFS, appAsset.SOURCE, styleAsset.FILE);
    const enBuilt = enPage.renderEnPage({ deals: payload.deals, parts: enParts, siteUrl: SITE_URL, where: 'en/index.html' });
    fs.mkdirSync(path.join(OUT, 'en'), { recursive: true });
    fs.writeFileSync(path.join(OUT, 'en', 'index.html'), enBuilt.html, 'utf8');
    notePage('en/', { kind: 'home-en' });
    const reasonCounts = enBuilt.excluded.reduce((acc, row) => {
      acc[row.reason] = (acc[row.reason] || 0) + 1;
      return acc;
    }, {});
    const reasonText = Object.keys(reasonCounts).sort().map(reason => `${reasonCounts[reason]} ${reason}`).join(' / ') || '无';
    console.log(`  英文单页: ${enBuilt.included} 条收录 · ${enBuilt.excluded.length} 条 global 排除（${reasonText}）· ${enBuilt.nonGlobal} 条非 global 不在英文侧`);
  }

  const homeHtml = html.replace(/<style>[\s\S]*?<\/style>/, `<link rel="stylesheet" href="${styleAsset.FILE}">`);
  if (!homeHtml.includes(`href="${styleAsset.FILE}"`)) {
    throw new Error(`index.html 共享样式外链化失败：未替换为 ${styleAsset.FILE}`);
  }
  // SHARED 标记只在**源模板**里存在：它们让 `loadShellParts` 抽到同一份片段，
  // 但产物里的首页是源模板本身，若不剥掉，中文侧就会多出两行注释 ——
  // 那不是「页头多了一个 EN 链接」，是把构建脚手架漏进了发布字节。
  // 生成页族由 page-shell 拼装，本来就不带标记；只有首页需要这一步。
  const homeShipped = homeHtml.replace(/^[ \t]*<!--SHARED:langlink:(?:START|END)-->\n/gm, '');
  fs.writeFileSync(indexFile, shell.finalizePage(homeShipped, '', '', ROUTE_HREFS, 'index.html'), 'utf8');

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

  // t4：这里原先还画一张 `icon.png`（Feed 的 `<image>` / JSON Feed 的 `icon` 都要它）。
  // 订阅产物下架之后它没有消费者了 —— 一张只被 RSS 引用的点阵图不该继续躺着
  //（决策 D3；`lib/og-image.js` 的 `renderIcon` / `selfCheckIcon` / `ICON_SIZE` 同批删除）。
  // 它同样不该出现在产物里：产物资产门禁只认 favicon.svg 与 og-image.png 两张图。

  // 独立详情页（每条优惠一个静态 URL）+ sitemap
  const lastmod = String(payload.updatedAt || '').slice(0, 10);
  // 档案的**纯推导**提前到写详情页之前：详情页索引策略（seo.dealIndexable）需要知道「哪些
  // 到期优惠已被档案接住」——即有一条**会渲染**的档案详情页给 /deal/<id>/ 入链。推导只读三份
  // 日志与数据、不读盘上的详情页文件，因此可以前置；完整性断言、日志与档案页写盘仍在下面
  // Stage F 原处（消费同一批变量）。archivedLinkedIds 必须取 gated 集合：未过门槛的条目留在
  // 索引页但不建独立页，也就没有 back-link（见 archive.linkedDealIdsOf 注释）。
  const archiveAsOf = dealLinksAsOf || lastmod;
  const archiveLinkableIds = changes.linkableDealIdsOf(payload.deals);
  const archives = [
    { kind: 'deal', store: historyStore.store, records: payload.deals, linkableIds: archiveLinkableIds },
    { kind: 'plan', store: planHistoryStore, records: plansStore.plans },
    { kind: 'api', store: apiPlanHistoryStore, records: apiPlansStore.plans }
  ].map(({ kind, store, records, linkableIds }) => archiveLib.buildArchive({
    kind,
    baseline: store ? store.baseline : null,
    events: (store && Array.isArray(store.events)) ? store.events : [],
    absence: (store && store.absence) || {},
    anomalies: (store && store.anomalies) || [],
    records,
    linkableIds: linkableIds || null,
    startedAt: (store && store.startedAt) || null,
    asOf: archiveAsOf
  }));
  const archiveEntries = archives.flatMap(archive => archive.entries);
  const archiveGates = archiveEntries.map(entry => archiveLib.archiveDetailGate(entry));
  const gatedArchiveEntries = archiveEntries.filter((entry, index) => archiveGates[index].ok);
  const archivedLinkedIds = archiveLib.linkedDealIdsOf(gatedArchiveEntries);
  const detailPages = writeDetailPages(payload, html, renderCore, PLAN, rendered.visibleIds, archivedLinkedIds);
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
    // ⚠️ 这里**不再给 topic 注入标题**（secondary-page-intro-changes-v1）：模块标题固定为
    // 「最近变化」。上一版注入的是 `「${spec.title}」最近的变化`，读者已经在那一页上，
    // 标题只是把页面名再念一遍（prompt §11）。
    const page = renderDirectoryPage(spec, matched, html, {
      lastmod, summary, topic, plan: PLAN, renderCore,
      // v1.8-seo-answer-pages：答案页（/free-api/）的门槛速查表需要
      //   · apiPlans  —— 按平台 join 限流 / 商用限制（deals 数据里没有这些字段）；
      //   · providerTable —— 厂商规范名 → provider key 的唯一映射（不按名字猜）；
      //   · reportUrl —— 预填标题的数据修正 issue 入口（与详情页同一类落点）。
      // 非答案页不读这三个字段，产物与改动前逐字节相同。
      apiPlans: apiPlansStore.plans,
      providerTable,
      reportUrl: reportIssueUrl(`${spec.heading} 数据`),
      // v3.0 Stage E：厂商页的资料区块（官方入口 / Coding 套餐 / API 计费 / 模型 / 最近变化）。
      //
      // `hasTopicChanges`：资料区块里那句「优惠变化见本页上方的「最近变化」块」必须只在
      // 上方**真的有**那一块时出现 —— 否则它指向空气（模块现在是条件渲染的）。
      extraSections: spec.kind === 'vendor'
        ? (vendorSpec => vendorPage.renderVendorKnowledgeBundle(vendorSpec, {
          deals: matched,
          plans: plansStore.plans,
          apiPlans: apiPlansStore.plans,
          models: publishedModels.models,
          modelLinks: modelLinksDoc.links,
          planHistoryStore,
          apiPlanHistoryStore,
          // 价格历史的横轴终点：与首页 `/models/` 详情页、`/plans/api/` 共用同一个数据日期
          //（`deals.json` 的 `updatedAt`）；不在这里另取「今天」。
          asOf: lastmod,
          providerTable,
          hasTopicChanges: Boolean(topic && topic.sections && topic.sections.length),
          prefix: '../'.repeat(vendorSpec.depth || spec.depth || 1),
          // 说明意图（notes-manifest-v1）：厂商页那五节 `.vsnote` 由 vendor-page.js 构造，
          // 登记入口连同 route 一起注入 —— 它不再是「调用方猜出来的条数」，而是构造点自己说出口。
          note: noteDeclarerFor(vendorSpec.route || spec.route)
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
      // v1.8：别名页的 canonical 目标路由（唯一声明来自 landing 计划；这里只透传）。
      // 产物自检按它核对页面上的 canonical，SEO 描述符也按它判「是否独立可索引」。
      canonicalRoute: spec.canonicalRoute || null,
      itemIds: matched.map(deal => deal.id),
      childRoutes: spec.kind === 'hub' ? (spec.children || []).map(child => child.route) : [],
      // 钉住但跌破门槛的厂商页会照常生成，而它的 Feed 不会（Feed 门槛是另一道），
      // 按类型推断就会要求页面声明一份不存在的订阅源 —— 一条永远红的假警报。
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
    ` · 别名页: ${aliasPages.length} 条（canonical 指向正本、不进 sitemap、不 noindex）`);

  // 变化雷达页（/changes/，v1.5）：与首页条带同一份 radar、同一套渲染函数。
  //
  // 它**始终生成**（与「条数为 0 的按需求页不生成」不同）：这一页的价值恰恰在于
  // 「今天有没有变化」这个问题本身，而「没有变化」与「我们没查」是两种必须能读到的答案。
  // 日志不可用时也照常出页 —— 路由凭空消失比一页说明更糟。
  //
  // v2.3：这一页同时列出**套餐变化**（同一份 planRadar），顶部多一行锚点导航。
  const changesDir = path.join(OUT, 'changes');
  fs.mkdirSync(changesDir, { recursive: true });
  // 说明意图（notes-manifest-residual-v1）：这一页的 `.snote` **全部**在构造点逐条登记 ——
  // 正文由 `index.html` 的 RENDER-CORE（`changesPageHtml(radar, prefix, note)`，由
  // `renderChangesPage` 注入 `noteDeclarerFor('changes/')`）登记，套餐/API 两块由
  // `lib/plans-page.js` / `lib/api-plans-page.js` 的变化块登记。台账已删除（这一页现在是 complete）。
  notePage('changes/', { kind: 'changes' });
  fs.writeFileSync(path.join(changesDir, 'index.html'), renderChangesPage(radar, html, renderCore, {
    // 这一页订阅「变化」本身：声明变化 Feed 而不是全量 Feed（v1.5 报告 §九-5 的遗留项）。
    // v2.3：这一页同时列出**套餐变化**，所以那一份订阅也在这里声明（两者是两条独立的变化流）。
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
    dealLinks: dealLinksView,
    asOf: lastmod
  });
  // 说明意图：`/plans/coding/` 的**无 JS 提示**（`.snote.pnoscript`）是这一页对读者的
  // 一条页面级说明，它由 `lib/plans-page.js` 输出（该模块不在本轮 in-scope 路径里），
  // 所以在这一页的**组装点**按容器签名做一次「pin」登记：应当恰好 1 条 no-JS 提示。
  // 改名 / 换容器 / 不再输出，三种都会让渲染侧与它差一条。
  notePage('plans/coding/', { kind: 'plans' });
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
    ` · 重新出现 ${planRadarStats.totals.restored} · 元信息（不上「最近变化」块 / 仍进订阅出口）${planRadarStats.totals.meta} · 最近变化块 ${planRadarStats.homeCount} 项`);

  // ---- v2.5：API / Token 计费对比页 ----------------------------------------------------
  const apiPlansDir = path.join(OUT, 'plans', 'api');
  fs.mkdirSync(apiPlansDir, { recursive: true });
  const apiPlansHtml = renderApiPlansPage(apiPlansStore, html, {
    note: noteDeclarerFor(apiPlansPage.API_PLANS_ROUTE),
    providerTable,
    apiPlanHistoryStore,
    dealLinks: dealLinksView,
    // v1.8-seo-answer-pages：答案页的「各平台门槛速查」需要优惠数据做实名 join
    // （api-plans 本身没有实名认证字段），以及一个预填标题的报错入口。
    deals: payload.deals,
    reportUrl: reportIssueUrl('API 计费数据'),
    // 价格历史的横轴终点：与首页 / 模型页 / 套餐页共用 deals 数据日期（lastmod）。
    asOf: lastmod,
  });
  notePage(apiPlansPage.API_PLANS_ROUTE, { kind: 'api-plans' });
  fs.writeFileSync(path.join(apiPlansDir, 'index.html'), apiPlansHtml, 'utf8');
  {
    const pageProblems = apiPlansPage.assertPageHonesty(apiPlansHtml, apiPlansStore.plans, { providerTable });
    if (pageProblems.length) {
      throw new Error(`API 计费对比页的诚实性断言未通过（${pageProblems.length} 处）：\n  - ${pageProblems.slice(0, 5).join('\n  - ')}`);
    }
  }
  console.log(`  API 计费页: /plans/api/（${apiPlansStore.count} 条记录 · ${apiPlansPage.apiRowsOf(apiPlansStore.plans).length} 行` +
    ` · 页面 ${(apiPlansHtml.length / 1024).toFixed(1)} KB）`);

  // ---- v3.1：API 成本计算器 (/tools/api-cost/) ----------------------------------------
  const apiCostDir = path.join(OUT, 'tools', 'api-cost');
  fs.mkdirSync(apiCostDir, { recursive: true });
  const apiCostHtml = renderApiCostPage(apiPlansStore, html, {
    note: noteDeclarerFor(apiCostPage.API_COST_ROUTE)
  });
  notePage(apiCostPage.API_COST_ROUTE, { kind: 'tool' });
  fs.writeFileSync(path.join(apiCostDir, 'index.html'), apiCostHtml, 'utf8');
  {
    const costProblems = apiCostPage.assertPageHonesty(apiCostHtml);
    if (costProblems.length) {
      throw new Error(`API 成本计算器的诚实性断言未通过（${costProblems.length} 处）：\n  - ${costProblems.slice(0, 5).join('\n  - ')}`);
    }
  }
  console.log(`  API 成本计算器: /tools/api-cost/（页面 ${(apiCostHtml.length / 1024).toFixed(1)} KB）`);

  // ---- v3.0 Stage B：/plans/ 统一资料入口 ------------------------------------------------
  //
  // 定位是**资料入口**，不是第三张重复大表：Coding 块与 API 块只给计数、口径与入口，
  // 变化块复用上面已经算好的 `planRadar` 与 API 变化日志（同一份事件、同一套措辞），
  // 当前相关优惠复用 `dealLinksView`（显式关系、已结束的拿不到 current）。
  //
  // 它**始终生成**：路由消失比一页说明更糟（与 /plans/coding/ /plans/api/ 同一条纪律）。
  const plansHubHtml = renderPlansHubShell(html, {
    note: noteDeclarerFor(plansHubPage.PLANS_HUB_ROUTE),
    plans: plansStore.plans,
    apiPlans: apiPlansStore.plans,
    providerTable,
    planHistoryStore,
    apiPlanHistoryStore,
    dealLinks: dealLinksLoad.doc,
    deals: payload.deals,
    asOf: dealLinksAsOf
    // t3：**删掉 `dataDocs: true`**。它唯一的用途是让 /plans/ 页面多渲染一条「数据出口」说明
    // （deals.json / plans.json / api-plans.json / 数据文档四个链接）—— 那条说明整支删除，
    // 参数也随之消失。留着它就是一个"传了没人读"的参数，下一个人会以为数据出口还在页面上。
  });
  notePage(plansHubPage.PLANS_HUB_ROUTE, { kind: 'plans-hub' });
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
    const modelsIndexCtx = {
      ...modelsCtx, prefix: '../', __refCache: new Map(),
      note: noteDeclarerFor(modelsPage.MODELS_INDEX_ROUTE)
    };
    // ⚠️ 传的是**派生产物**（`publishedModels.models`，带 `catalogStatus` / `catalogReason`），
    // 不是来源层 `modelsTable`：目录状态是派生字段，来源层里根本没有它 —— 传错的那一版
    // 会让索引页每一行都渲染成「发布时间未知」且丢掉 `data-catalog-status`
    // （筛选脚本与浏览器验收都读这个属性），而详情页拿的是派生记录 ⇒ 两页自相矛盾。
    const indexBody = modelsPage.renderModelsIndex(modelRecords, modelsIndexCtx);
    const indexHtml = renderStaticPage({
      kind: 'models-index',
      route: modelsPage.MODELS_INDEX_ROUTE,
      title: modelsPage.MODELS_INDEX_HEADING,
      description: modelsPage.MODELS_INDEX_DESCRIPTION,
      body: indexBody,
      jsonLd: modelsPage.modelsIndexJsonLd(modelsTable, modelsIndexCtx),
      prefix: '../'
    }, html);
    notePage(modelsPage.MODELS_INDEX_ROUTE, { kind: 'models-index' });
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
      const detailCtx = { ...modelsCtx, prefix, __refCache: new Map(), note: noteDeclarerFor(modelsPage.modelHrefOf(model)) };
      const route = modelsPage.modelHrefOf(model);
      fs.mkdirSync(path.join(OUT, modelsPage.MODEL_ROUTE_PREFIX, model.slug), { recursive: true });
      const detailHtml = renderStaticPage({
        kind: 'model',
        route,
        title: `${modelsPage.modelNameOf(model)} · 模型资料`,
        // 约定收口：模型描述今天没有长度门禁，但仍走同一层适配（否则下一条长开发者名
        // 会重新长出一个「合法数据顶穿展示位」的洞）。renderStaticPage 不 fit description，
        // 所以这里必须显式适配；150 预算的唯一出处是 page-fit。
        description: pageFit.fitDescription(`${modelsPage.modelNameOf(model)}（${model.developer || '开发者未标注'}）在本站收录的 API 计价条目、相关套餐、相关优惠与变化记录。本站只整理事实，不做推荐。`),
        body: modelsPage.renderModelPage(model, detailCtx),
        jsonLd: modelsPage.modelPageJsonLd(model, detailCtx),
        prefix,
        // 价格历史图（F1）：与表格/日志同一批判据，样式随页面一起下发；没有块时也只是多几行 CSS。
        extraCss: priceHistory.PRICE_HISTORY_CSS,
        // 叶子详情页要的是**统一内容列**（与 /deal/<id>/ 同一条 .detail-main 规则）。
        // 索引页 / 档案页 / 数据文档页都不传它，继续吃 .wrap 的 1420px。
        mainClass: 'detail-main'
      }, html);
      // 说明意图：模型详情页的 `.snote` 全部由 `lib/models-page.js` 渲染（范围之外）。
      // 台账写的是**无条件**的那两条（计价条目口径 + 变化记录是派生视图）。
      notePage(route, { kind: 'model' });
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
  //
  // 纯推导（archiveAsOf / archives / archiveEntries / archiveGates / gatedArchiveEntries /
  // archivedLinkedIds）已前置到写详情页之前（详情页索引策略要用 archivedLinkedIds）；
  // 这里消费同一批变量，只做完整性断言、日志与档案页写盘。
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
    const indexBody = archiveLib.renderArchiveIndex(archives, {
      prefix: '../', siteUrl: SITE_URL, note: noteDeclarerFor(archiveLib.ARCHIVE_INDEX_ROUTE)
    });
    const indexHtml = renderStaticPage({
      kind: 'archive-index',
      // 通用静态页套壳（模型页与档案页共用：head / 主题脚本 / 页头 / 页脚 / JSON-LD）
      route: archiveLib.ARCHIVE_INDEX_ROUTE,
      title: archiveLib.ARCHIVE_HEADING,
      description: archiveLib.ARCHIVE_DESCRIPTION,
      body: indexBody,
      jsonLd: archiveLib.archiveIndexJsonLd(archives, { siteUrl: SITE_URL }),
      prefix: '../',
      extraCss: ARCHIVE_PAGE_CSS
    }, html);
    notePage(archiveLib.ARCHIVE_INDEX_ROUTE, { kind: 'archive-index' });
    fs.writeFileSync(path.join(archiveDir, 'index.html'), indexHtml, 'utf8');
    const problems = archiveLib.assertPageHonesty(indexHtml, { kind: 'archive-index', archives });
    if (problems.length) {
      throw new Error(`历史档案索引页的诚实性断言未通过（${problems.length} 处）：\n  - ${problems.slice(0, 5).join('\n  - ')}`);
    }
    // 档案集合消歧（全 kind 一起）：三份日志各自独立，同一个 12-hex id 在两边都合法；
    // 两条 150 字符墓碑标题截断后可能逐字相同 ⇒ title-unique/desc-unique 会红。
    // key 用路由（集合内唯一），标签用 entry.id（稳定身份，全局唯一）；suffix 与
    // renderStaticPage 实际追加的后缀一致，因此其二次 fit 幂等（Part A 有牙证明）。
    const archiveTitles = pageFit.uniqueTitles(
      gatedArchiveEntries.map(entry => [
        archiveLib.archiveEntryRoute(entry),
        `${entry.title || entry.id} · ${archiveLib.ARCHIVE_HEADING}`,
        entry.id,
        entry.kind
      ]),
      ` · ${SITE_NAME}`
    );
    const archiveDescriptions = pageFit.uniqueDescriptions(
      gatedArchiveEntries.map(entry => [
        archiveLib.archiveEntryRoute(entry),
        `${entry.title || entry.id} 的结束 / 恢复记录：首次发现、最后有效时间、结束发现时间、最后已知内容与变化时间线。资料失效不等于资料删除。`,
        entry.id,
        entry.kind
      ])
    );
    for (const entry of gatedArchiveEntries) {
      const route = archiveLib.archiveEntryRoute(entry);
      // ⚠️ 相对前缀由 `lib/archive.js` 的 `archiveEntryPrefix()` **按路由深度**派生
      // （唯一实现；这里不再有第二条深度算式）：`archive/<kind>/<id>/` 是 3 层，
      // 原先写死 `'../../'`（2 层）——favicon / feed / 面包屑 / 全站导航全部解析到
      // `archive/…` 而不是站点根，而生产一条 ended/restored 都没有，因此从未被构建照到
      // （审计 F-r1-history-ai-002：每页 27 条相对引用里 24 条死链）。
      const prefix = archiveLib.archiveEntryPrefix(entry);
      fs.mkdirSync(path.join(OUT, route), { recursive: true });
      const entryHtml = renderStaticPage({
        kind: 'archive-detail',
        route,
        // 集合级消歧后的适配值：同一截断正文的条目整组带 id 标签；renderStaticPage 的
        // 二次 fit 幂等，只负责补站名后缀。
        title: archiveTitles.get(route),
        description: archiveDescriptions.get(route),
        // 说明登记：档案详情页的 `.snote` 由 `lib/archive.js` 的 renderArchiveEntry **逐条登记**
        // （notes-manifest-residual-v1 接管了构造点）。`note` 必须从这里注入 —— 少了它，
        // noteIn() 退化成恒等函数，页面照常输出 `.snote` 却没有登记（构建期「先登记后输出」对账
        // 直接红）。这条路径在 2026-11-12 之前生产 0 个实例（三份日志 ended/restored 全 0），
        // 所以这个缺口一直没有被照到；判据修复后第一次跑起来就被产物自检咬住了。
        body: archiveLib.renderArchiveEntry(entry, { prefix, siteUrl: SITE_URL, note: noteDeclarerFor(route) }),
        jsonLd: archiveLib.archiveEntryJsonLd(entry, { siteUrl: SITE_URL }),
        prefix,
        extraCss: ARCHIVE_PAGE_CSS,
        // 叶子详情页要的是**统一内容列**（与 /deal/<id>/、/models/<slug>/ 同一条 .detail-main 规则，
        // 宽度只在 index.html 的共享 <style> 里）。索引页 / 数据文档页走缺省（不带 class），
        // 它们属于 Wide Data Page 一族 —— 一族一个形状，见 lib/page-kinds.js 的 LAYOUT_FAMILIES。
        // 今天生产 0 个实例，`assertPageHonesty()`（下面那次调用）从整页上反查这条约束。
        mainClass: archiveLib.ARCHIVE_ENTRY_MAIN_CLASS
      }, html);
      // 说明意图：档案详情页的 `.snote` 已由 `lib/archive.js` 的 renderArchiveEntry **逐条登记**
      // （notes-manifest-residual-v1 接管了构造点；`note` 在 renderStaticPage 的 body 参数里注入）。
      // 2026-11-12 之前三份日志的 ended/restored 全为 0、这个循环不跑；判据修复后第一批真实
      // 结束记录（60 条）才第一次让这条「从未验证过的渲染分支」跑起来 —— 登记缺口也就是那时
      // 被产物自检照出来并补上的（见上面 body 参数的注释）。
      notePage(route, { kind: 'archive-entry' });
      fs.writeFileSync(path.join(OUT, route, 'index.html'), entryHtml, 'utf8');
      const entryProblems = archiveLib.assertPageHonesty(entryHtml, { kind: 'archive-entry', entry });
      if (entryProblems.length) {
        throw new Error(`档案详情页 /${route} 的诚实性断言未通过（${entryProblems.length} 处）：\n  - ${entryProblems.slice(0, 5).join('\n  - ')}`);
      }
    }
    console.log(`  历史档案页: /archive/（${archiveEntries.length} 条记录 · ${gatedArchiveEntries.length} 个详情页` +
      ` · 页面 ${(indexHtml.length / 1024).toFixed(1)} KB）`);
  }

  // ---- v1.8-seo-answer-pages：/docs/data/ 数据文档与引用页（**部分反转** t4 的去数据暴露）----
  //
  // t4 当年把「面向读者的数据文件 / JSON 暴露」整族下架（连同 /docs/data/ 与 data/index.json）。
  // 本轮用户显式要求把**数据集许可与包装**做回来，范围刻意窄：
  //   · 产物里仍然没有数据文件（published-assets 的逐路径登记制不变）；
  //   · 数据真值留在公开仓库；这一页说明「有哪些数据 / 什么许可 / 怎么引用 / 字段口径」；
  //   · 数字全部从真实文件现算（schemaVersion / count / updatedAt），不在页面里写死；
  //   · 站点地址与仓库地址分别来自 SITE_URL 与 index.html 的 REPO_URL，本文件不写第二份 URL。
  {
    const docsRoute = dataDocsPage.DATA_DOCS_ROUTE;
    const datasets = dataDocsPage.DATASETS.map(entry => {
      const file = path.join(ROOT, entry.file);
      if (!fs.existsSync(file)) throw new Error(`数据文档页：数据集 ${entry.file} 不存在（清单与真实文件必须一一对应）`);
      const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (doc[entry.schemaField] === undefined || doc[entry.countField] === undefined) {
        throw new Error(`数据文档页：${entry.file} 缺 ${entry.schemaField} / ${entry.countField}（引用者需要这两个数）`);
      }
      return Object.assign({}, entry, {
        schemaVersion: doc[entry.schemaField],
        count: doc[entry.countField],
        updatedAt: doc[entry.updatedAtField]
      });
    });
    const historyLogs = dataDocsPage.HISTORY_LOGS.map(entry => {
      const file = path.join(ROOT, entry.file);
      if (!fs.existsSync(file)) throw new Error(`数据文档页：变化日志 ${entry.file} 不存在`);
      const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
      return Object.assign({}, entry, {
        startedAt: doc.startedAt,
        count: Array.isArray(doc.events) ? doc.events.length : 0
      });
    });
    const renderedDocs = dataDocsPage.renderDataDocsPage({
      datasets,
      historyLogs,
      asOf: lastmod,
      siteUrl: SITE_URL,
      repoUrl: REPO_URL,
      reportUrl: reportIssueUrl('数据文档与引用')
    });
    const docsHtml = renderStaticPage({
      kind: 'data-docs',
      route: docsRoute,
      title: dataDocsPage.DATA_DOCS_HEADING,
      description: dataDocsPage.DATA_DOCS_DESCRIPTION,
      body: renderedDocs.body,
      jsonLd: renderedDocs.jsonLd,
      // /docs/data/ 是两层路由 ⇒ 前缀 '../../'（写死 '../' 会让页脚与面包屑全部 404）。
      prefix: '../../',
      extraCss: DATA_DOCS_CSS
    }, html);
    notePage(docsRoute, { kind: 'data-docs' });
    fs.mkdirSync(path.join(OUT, docsRoute), { recursive: true });
    fs.writeFileSync(path.join(OUT, docsRoute, 'index.html'), docsHtml, 'utf8');
    console.log(`  数据文档页: /${docsRoute}（${datasets.length} 份数据集 · ${historyLogs.length} 份变化日志`
      + ` · 数据日期 ${lastmod} · 页面 ${(docsHtml.length / 1024).toFixed(1)} KB）`);
  }

  // ---- v3.4 F3：/search/ 全站搜索（静态目录；无 JS 可读，过滤是渐进增强）----
  //
  // 索引推导的唯一实现是 `lib/search-index.js`：URL 前缀全部复用既有唯一表
  // （feed.PLAN_URL_PREFIX / 路由声明 / landing 计划），本文件不写第二份。
  // 条目只收**真有站内页面**的东西：deals 里只有 type==='deal' 的才有详情页；
  // 工具与指南页走固定路由和 landing 计划，不给任何一条发死链。
  const searchIndexBuilt = searchIndex.buildSearchIndex({
    deals: payload.deals.filter(deal => deal.type === 'deal'),
    plans: plansStore.plans,
    apiPlans: apiPlansStore.plans,
    models: publishedModels.models,
    landingSpecs: PLAN.pages,
    fixedRoutes: Object.keys(pageKinds.FIXED_ROUTE_KINDS)
  });
  {
    const searchHtml = renderSearchPageHtml(searchIndexBuilt, html);
    notePage(searchPage.SEARCH_ROUTE, { kind: 'search' });
    fs.mkdirSync(path.join(OUT, searchPage.SEARCH_ROUTE), { recursive: true });
    fs.writeFileSync(path.join(OUT, searchPage.SEARCH_ROUTE, 'index.html'), searchHtml, 'utf8');
    console.log(`  全站搜索: /${searchPage.SEARCH_ROUTE}（${searchIndexBuilt.entries.length} 条 · `
      + `${Object.keys(searchIndexBuilt.counts).filter(k => searchIndexBuilt.counts[k] > 0).length} 个分组`
      + ` · 页面 ${(searchHtml.length / 1024).toFixed(1)} KB）`);
  }

  // ---- t4：数据出口子系统整体下架（原 v3.0 Stage G：Data Docs / 数据出口）----
  //
  // 这里原先是一整块数据出口设施：注册表形状断言、`buildManifestFromRegistry()`、
  // `data/index.json`（Dataset Manifest）的写出、`/docs/data/` 页面的渲染与诚实性断言
  // （三条硬承诺：文档里的每个 endpoint 都真实存在 / schemaVersion 与 count 逐字段一致 /
  // Manifest 条数 == 真实发布的数据集数）。整块删除 —— 它描述的**公开数据面**本身被撤掉了：
  // 产物里不再有任何数据集、没有 Manifest、也没有数据文档页；新的判据只有一条
  // （`lib/published-assets.js`：产物里不许有数据文件，唯一例外是首页应用自己的
  // `assets/data/offers.json`）。数据真值仍在仓库里（`plans.json` / `api-plans.json` /
  // `scripts/data/**`），只是不再发布 —— 页面在构建期从真值渲染，读者不需要也不该下载它们。
  //
  // ⚠️ 唯一活下来的是下面这三行 `logAvailability`：它不服务于 Manifest，而是**页面措辞**的判据
  //（`/changes/`、套餐页、API 计费页与厂商页的 availability 分支靠它决定「没有拿到日志」这一句
  // 要不要出现）。删掉它，那些页会静默退化成"没有变化"—— 那是假话，所以它必须留着。
  const logAvailability = changes.logAvailabilityOf({
    'deal-history': historyStore,
    'plan-history': planHistoryLoad,
    'api-plan-history': apiPlanHistoryLoad
  });


  // 窗口期页（到期但归档事件还没落地 → 首页不展示、档案无回链）临时 noindex，
  // 也就**不进 sitemap**：sitemap = 「请索引这些独立 URL」的声明，noindex 页进 sitemap
  // 是自相矛盾的。归档事件落地后该页恢复可索引，sitemap 自然把它带回来（自愈）。
  const indexableDetailPages = detailPages.filter(page => page.indexable);
  const dealUrls = indexableDetailPages.map(page => `  <url>
    <loc>${page.url}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`).join('\n');

  // 落地页进 sitemap，优先级高于详情页：它们是入口，详情页是叶子。
  // v1.2 起分类页与按需求页共用这一段（同一个 directoryPages 列表），
  // 所以「新增一条路由忘了进 sitemap」在结构上不可能 —— 条数断言还会逐个对账。
  //
  // v1.7 起：**只有独立可索引的页面进 sitemap**（sitemap = 「请索引这些独立 URL」的声明）。
  // v1.8-seo-answer-pages：别名页不再 noindex，改为 canonical 指向正本 ⇒ 它们**仍然不进 sitemap**
  // ——成员资格判据从「不是 noindex」升级为「canonical 自指」。
  // 优先级按类型声明，而不是统统 0.9 —— 声明要与实际用途一致（这条口径与状态页 0.3、
  // 订阅中心 0.6 是同一条）。
  // v3.0：优先级不再手写第二张表 —— 它就是 `lib/page-kinds.js` 里的声明
  // （`sitemap.priority`），构建期与独立门禁读同一份。取值与 v1.7 起的表**逐字相同**
  // （collection/need/category 0.9 · vendor/hub 0.8），所以这次是纯收敛、不是改判据。
  const independentDirectoryPages = directoryPages.filter(page => page.indexable && !page.canonicalRoute);
  const directoryUrls = independentDirectoryPages
    .map(page => `  <url>
    <loc>${page.url}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${pageKinds.sitemapMeta(page.kind).changefreq}</changefreq>
    <priority>${pageKinds.sitemapMeta(page.kind).priority}</priority>
  </url>`).join('\n');
  const sitemapEntries = [SITE_URL, `${SITE_URL}en/`, ...independentDirectoryPages.map(page => page.url),
    `${SITE_URL}status/`, `${SITE_URL}changes/`, `${SITE_URL}feeds/`, `${SITE_URL}${plansHubPage.PLANS_HUB_ROUTE}`,
    `${SITE_URL}${plansPage.PLANS_ROUTE}`,
    `${SITE_URL}${apiPlansPage.API_PLANS_ROUTE}`,
    `${SITE_URL}${apiCostPage.API_COST_ROUTE}`,
    // B 包：Codex 额度重置档案（独立固定路由；priority / changefreq 由 page-kinds 的声明取）
    `${SITE_URL}${CODEX_RESETS_ROUTE}`,
    // v1.8-seo-answer-pages：数据文档与引用页（不进「落地页家族」，是独立固定路由）
    `${SITE_URL}${dataDocsPage.DATA_DOCS_ROUTE}`,
    // v3.0 Stage D5/D6：模型索引无条件进 sitemap；详情页**只有过门槛的**才进
    // （未过门槛的不生成页面，进 sitemap 就是一条死链 —— §8 第 19 条牙）。
    `${SITE_URL}${modelsPage.MODELS_INDEX_ROUTE}`,
    ...gatedModels.map(model => `${SITE_URL}${modelsPage.modelHrefOf(model)}`),
    // v3.0 Stage F：档案索引无条件进 sitemap；档案详情页**只有过门槛的实体**才进
    // （历史 event 本身不生成页面 —— §F4）。
    `${SITE_URL}${archiveLib.ARCHIVE_INDEX_ROUTE}`,
    ...gatedArchiveEntries.map(entry => `${SITE_URL}${archiveLib.archiveEntryRoute(entry)}`),
    // 详情页：与 dealUrls 同一口径 —— 只有可索引的进 sitemap（窗口期 noindex 页不进）。
    ...indexableDetailPages.map(page => page.url)];

  // 状态页也进 sitemap（五条既有约定的第三条，v1.1 收口补）。
  //
  // priority 0.3 **低于**详情页 0.7，也低于分类页 0.9：它是给维护者与技术读者核对
  // 「本站还在不在更新」的工具页，不是搜索入口。给它 0.9 会把「哪一页才是入口」说反 ——
  // priority 是**声明**，不是排序实现的细节。
  // 英文单页：与首页同一组 `<loc>` 只多这一条。priority / changefreq 从
  // `page-kinds.js` 的 home-en 声明取（0.8 weekly：它是入口，但不是每天变的数据流）。
  const homeEnUrl = `  <url>
    <loc>${SITE_URL}en/</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${pageKinds.sitemapMeta('home-en').changefreq}</changefreq>
    <priority>${pageKinds.sitemapMeta('home-en').priority}</priority>
  </url>`;

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
  const archiveIndexUrl = `  <url>
    <loc>${SITE_URL}${archiveLib.ARCHIVE_INDEX_ROUTE}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${pageKinds.sitemapMeta('archive-index').changefreq}</changefreq>
    <priority>${pageKinds.sitemapMeta('archive-index').priority}</priority>
  </url>`;
  const archiveDetailUrls = gatedArchiveEntries.map(entry => `  <url>
    <loc>${SITE_URL}${archiveLib.archiveEntryRoute(entry)}</loc>
    <lastmod>${String(entry.lastChangedAt || entry.lastEffectiveAt || lastmod).slice(0, 10)}</lastmod>
    <changefreq>${pageKinds.sitemapMeta('archive-detail').changefreq}</changefreq>
    <priority>${pageKinds.sitemapMeta('archive-detail').priority}</priority>
  </url>`).join('\n');

  // v3.0 Stage G：数据文档页的 sitemap 声明（priority 0.6 —— 它是给"要取数据的人"的入口，
  // 与订阅中心同级；不是读者找优惠的入口）。
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

  // v3.4 F3：/search/ 的 sitemap 声明（priority / changefreq 从 page-kinds 的 search 声明取）。
  const searchUrl = `  <url>
    <loc>${SITE_URL}${searchPage.SEARCH_ROUTE}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${pageKinds.sitemapMeta('search').changefreq}</changefreq>
    <priority>${pageKinds.sitemapMeta('search').priority}</priority>
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
  const apiCostUrl = `  <url>
    <loc>${SITE_URL}${apiCostPage.API_COST_ROUTE}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`;
  // v1.8-seo-answer-pages：/docs/data/ 数据文档与引用页。priority / changefreq 从
  // `page-kinds.js` 的 data-docs 声明取（0.6 monthly —— 给要引用数据的人，不是找优惠的人）。
  // B 包：/codex-reset/。priority / changefreq 从 page-kinds.js 的 codex-reset 声明取
  // （0.7 monthly：它是有明确数据源的档案页，不是读者找优惠的入口，也不是每天变的消息流）。
  const codexResetUrl = `  <url>
    <loc>${SITE_URL}${CODEX_RESETS_ROUTE}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${pageKinds.sitemapMeta('codex-reset').changefreq}</changefreq>
    <priority>${pageKinds.sitemapMeta('codex-reset').priority}</priority>
  </url>`;
  const dataDocsUrl = `  <url>
    <loc>${SITE_URL}${dataDocsPage.DATA_DOCS_ROUTE}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${pageKinds.sitemapMeta('data-docs').changefreq}</changefreq>
    <priority>${pageKinds.sitemapMeta('data-docs').priority}</priority>
  </url>`;

  fs.writeFileSync(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE_URL}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
${homeEnUrl}
${directoryUrls}
${statusUrl}
${changesUrl}
${plansHubUrl}
${modelsIndexUrl}
${searchUrl}
${archiveIndexUrl}
${plansUrl}
${apiPlansUrl}
${apiCostUrl}
${codexResetUrl}
${dataDocsUrl}
${dealUrls}
${modelUrls}
${archiveDetailUrls}
</urlset>
`, 'utf8');

  /* ---- v3.3：IndexNow 密钥文件（`<key>.txt`）-------------------------------------------
   *
   * 它就是**一个密钥**，没有别的内容：文件名 = 密钥，内容 = 密钥（**不带结尾换行**）。
   * 参与引擎抓这个路径来证明「提交者确实控制着这台主机上的这个子目录」，所以它必须在站点根
   * 被逐字节原样 GET 到 —— 任何"顺手格式化一下/补个换行"都会让验证失败（自测里有牙盯着这一点）。
   *
   * 为什么由构建期写出，而不是像 BingSiteAuth.xml 那样从仓库根原样拷贝：
   * 后者的令牌是 **Bing 生成的**，仓库根那份就是真值；而这里的密钥真值在 `lib/indexnow.js`，
   * 再往仓库根放一份字面量文件只会让「线上那份文件到底等于哪个密钥」变成两处真值 ——
   * 而这两处一旦漂移，症状是 Bing 那边静静地 403，页面与构建全绿。
   * 落盘方式与 sitemap.xml / logos.css / og-image.png 同款（`fs.writeFileSync` 直写 OUT），
   * 并登记进 `GENERATED_FILES` —— 那张表是「声明了就必须存在于 OUT」那台机器牙的消费者。
   * ---------------------------------------------------------------------------------- */
  fs.writeFileSync(path.join(OUT, indexnow.keyFileName()), indexnow.keyFileContent(), 'utf8');

  /* ---- v3.2：订阅产物（Atom 1.0 + JSON Feed 1.1）---------------------------------------
   *
   * 落盘方式与 sitemap.xml / logos.css / og-image.png **完全同款**：`fs.writeFileSync(path.join(OUT, …))`，
   * 按 `FEED_FILES` 遍历写两条。**不新增中央写盘 helper** —— 这两条进 `GENERATED_FILES`，
   * 而那张表是「声明了就必须存在于 OUT」那台机器牙的消费者。
   *
   * 内容来源 = **三支历史日志的事件流**（不是页面、也不是雷达视图：雷达有窗口与每栏上限，
   * 而订阅出口要的是「日志里发生过的事」）。三条纪律：
   *
   *   ① **只收算得出 permalink 的事件**（与 `changes.js`「不给已离开数据集的条目发死链」同一条）：
   *      · 优惠事件 ⇒ 仅当 `deals.json` 里该 id 存在且**可链接**（判据本体 = `changes.linkableDealIdsOf()`，
   *        feed 侧只消费它物化后的集合，不在这里重写「什么算可链接」）；
   *      · 套餐 / API 事件 ⇒ `plans/coding/#plan-<planId>` / `plans/api/#plan-<planId>`
   *       （锚点由那两页自己保证存在：构建期有锚点断言，feed 侧只消费「url 算得出就算」）。
   *      算不出的逐条丢弃（bucket 记在 `stats.dropped` 里），构建日志如实打印。
   *   ② 文案「谁 · 发生了什么」**只取既有措辞**，本文件里 0 条中文事件措辞：
   *      · 套餐 ⇒ `plansPage.planChangeSentenceOf()`（docstring 原文：「订阅源与 `title` 属性共用」）；
   *      · API  ⇒ `apiPlansPage.apiPlanChangeTextOf()`（docstring 原文：「`/changes/` 的 API 分栏与
   *        `feed/plans/api/changes.*` 的正文都读它」）；两者的「谁」由 titleOf 注入的记录标题承担。
   *      · 优惠 ⇒ 不传 `textOf`，用 `feed.js` 的默认句（它读 `history.HISTORY_WORDING` +
   *        `profile.fieldLabels` —— 同样是既有表，不是第二份措辞）。
   *   ③ 时间一律来自**数据**：条目 `at` = 事件自己的日期；`meta.updatedAt` =
   *      `String(payload.updatedAt).slice(0, 10)`（与 sitemap 的 lastmod、雷达的 asOf 同一口径）。
   *      **不看时钟** —— 产物里不许出现「构建发生在几点几分」这种字节。
   *
   * 可用性（三支各自判断，口径 = `load()` 的 `missing` / `broken`）：
   *   · 某支**缺失** ⇒ 该支计 0 并如实打印（少一整支，日志里看得见）；
   *   · 某支**损坏** ⇒ fail-closed 停构建（坏日志被当成空日志继续，会把整段历史静默洗掉）；
   *   · 三支**全部**不可用 ⇒ 0 条 ⇒ **构建失败**（「空 feed 不算通过」，不许发一份空的订阅产物）。
   */
  // 渲染器的 `meta`（契约第 5.5 条冻结的 5 个键；`selfPath` 按每一份产物现填）。
  // `updatedAt` 只可能在「0 条」时被用到，而 0 条在这里是构建失败 ⇒ 它存在的意义是让
  // 「条目的日期」与「数据日期」在键表里各有其位，不是给渲染器编一个日期。
  const feedMetaBase = {
    siteUrl: SITE_URL,
    siteName: SITE_NAME,
    siteDescription: SITE_DESCRIPTION,
    updatedAt: lastmod
  };
  /**
   * 三支订阅来源的**唯一登记表**：`kind` / 显示名 / 日志真值文件 / 加载结果 / 事件取法。
   *
   * ⚠️ **「哪一支用哪份日志」只有这一处决定**：下面 `feedSources` 的 `store`、可用性读数、
   * 以及「损坏 ⇒ fail-closed」那条检查全部读这张表。第一轮变异实测出来的教训（值得留在这里）：
   * 把 `store` 在 `feedSources` 里另写一遍（哪怕写的是同一个变量）时，「某支缺失」这条变异
   * 只在**读数**上成立、条目构造仍读真值 —— 于是日志写着"缺失（计 0 条事件）"而 `considered`
   * 仍是 73。那正是本仓最忌讳的形状：**看起来像读数，其实那个分支没生效**。
   */
  const feedBranches = [
    { kind: 'deal', label: '优惠', file: history.HISTORY_FILE, load: historyStore, eventsOf: history.eventsOf },
    { kind: 'plan', label: '套餐', file: planHistory.PLAN_HISTORY_FILE, load: planHistoryLoad, eventsOf: planHistory.eventsOf },
    { kind: 'apiPlan', label: 'API 计费', file: apiPlanHistory.API_PLAN_HISTORY_FILE, load: apiPlanHistoryLoad, eventsOf: apiPlanHistory.eventsOf }
  ];
  const feedBranchOf = kind => {
    const branch = feedBranches.find(item => item.kind === kind);
    // feed.js 的 `kind` 集合是冻结的三个；这里查不到就是两边登记表分家了 —— 静默跳过等于
    // 让某支日志悄悄退出订阅出口，所以抛错（与 feed.js 对未知 kind 的 fail-closed 同一条）。
    if (!branch) throw new Error(`订阅出口：登记表里没有 ${JSON.stringify(kind)} 这一支`);
    return branch;
  };
  {
    const broken = feedBranches.filter(branch => branch.load.broken);
    if (broken.length) {
      throw new Error(`订阅出口：${broken.map(b => `${b.label}日志（${path.relative(ROOT, b.file)}）`).join(' / ')}`
        + ` 解析失败（${broken.map(b => b.load.broken).join(' / ')}）—— 损坏的日志**不许**当成空日志继续：`
        + '那会把整段历史静默洗掉，而订阅产物看起来仍然是一份「正常」的 feed');
    }
  }
  const dealRecords = Array.isArray(payload.deals) ? payload.deals : [];
  const feedDealById = new Map(dealRecords.map(deal => [deal.id, deal]));
  const feedPlansById = new Map(plansStore.plans.map(plan => [plan.id, plan]));
  const feedApiPlansById = new Map(apiPlansStore.plans.map(plan => [plan.id, plan]));
  const feedSources = [
    {
      kind: 'deal',
      profile: history.PROFILE,
      store: feedBranchOf('deal').load.store,
      titleOf: event => (feedDealById.get(event && event.id) || {}).title || '',
      // 契约 E3/E4：可链接集合**必须**传（不传 feed.js 当场抛错）—— 它是「哪条记录真的有
      // `deal/<id>/` 详情页」的唯一判据，靠猜就会发死链（t13 修的就是这条）。
      linkableIds: changes.feedDealIdsOf(dealRecords)
    },
    {
      kind: 'plan',
      profile: planHistory.PROFILE,
      store: feedBranchOf('plan').load.store,
      titleOf: event => (feedPlansById.get(event && event.planId) || {}).planName || '',
      // 「谁」的那一半问 radar 自己的 `identityOf` 要（`RADAR_SOURCES` 是对外导出的一张表）：
      // 页面上的套餐名 / 平台显示名与订阅源里**不可能分家**，本文件也不重算一遍身份。
      textOf: event => plansPage.planChangeSentenceOf(
        Object.assign({}, event, planChanges.RADAR_SOURCES.plans.identityOf(event.planId, event, feedPlansById)),
        { providerTable, plansById: feedPlansById }
      ),
      // 仅对当前在 plans.json 留有 #plan-<id> 锚点的套餐发订阅条目，避免已退役套餐发出死锚点
      linkableIds: new Set(feedPlansById.keys())
    },
    {
      kind: 'apiPlan',
      profile: apiPlanHistory.API_PROFILE,
      store: feedBranchOf('apiPlan').load.store,
      titleOf: event => (feedApiPlansById.get(event && event.planId) || {}).planName || '',
      textOf: event => apiPlansPage.apiPlanChangeTextOf(event),
      linkableIds: new Set(feedApiPlansById.keys())
    }
  ];
  const { entries: feedEntries, stats: feedStats } = feed.buildFeedEntries({
    sources: feedSources,
    max: feed.FEED_MAX_ITEMS,
    coalesceSameDay: true
  });
  /**
   * 每支的「入选条数」= 这一支**单独**构造出来的条目 id 集合 ∩ 合并结果。
   *
   * 为什么绕这一下：合并后的 `entries` 里没有「这条来自哪支日志」这个字段（条目形状是冻结的 5 个键），
   * 而从 `url` 形态反推等于在本文件里再拼一份 url 模板（那是 feed.js 的内部表）。
   * 单独构造是**同一支纯函数的又一次调用**（同输入同输出、不读盘、不看时钟），不是第二份实现。
   */
  const feedKeptOf = source => {
    const { entries } = feed.buildFeedEntries({ sources: [source], max: Number.MAX_SAFE_INTEGER, coalesceSameDay: true });
    const own = new Set(entries.map(entry => entry.id));
    return feedEntries.filter(entry => own.has(entry.id)).length;
  };
  const feedBranchReadings = feedBranches.map(branch => {
    const source = feedSources.find(item => item.kind === branch.kind);
    const events = branch.eventsOf(branch.load.store);
    return {
      kind: branch.kind,
      label: branch.label,
      missing: Boolean(branch.load.missing),
      events: events.length,
      eventDates: events.map(event => String((event && event.at) || '')),
      kept: feedKeptOf(source)
    };
  });
  // 日志里**出现过**的日期集合 + 数据日期：自检用它判「产物里的每个日期都来自数据」
  //（也就是「没有构建时刻混进来」）。数据日期的出处 = `payload.updatedAt` 的日期。
  const feedDataDates = [...new Set([
    ...feedBranchReadings.flatMap(reading => reading.eventDates),
    lastmod
  ])].sort();
  for (const reading of feedBranchReadings) {
    console.log(`    · ${reading.label}日志 ${reading.missing
      ? '缺失（计 0 条事件）'
      : `${reading.events} 条事件`} · 入选 ${reading.kept} 条`);
  }
  console.log(`  feed 条目 ${feedStats.kept} 条（来源事件 ${feedStats.considered} 条 · `
    + `丢弃 ${feedStats.dropped.notLinkable + feedStats.dropped.noUrl + feedStats.dropped.invalidAt + feedStats.dropped.duplicate} 条`
    + `（notLinkable ${feedStats.dropped.notLinkable} / noUrl ${feedStats.dropped.noUrl} / invalidAt ${feedStats.dropped.invalidAt}`
    + ` / duplicate ${feedStats.dropped.duplicate}） · 上限截断 ${feedStats.truncated} 条）`);
  if (!feedEntries.length) {
    throw new Error('订阅出口：0 条条目 —— 三支历史日志全部不可用（'
      + feedBranchReadings.map(reading => `${reading.label}${reading.missing ? '缺失' : `${reading.events} 条事件`}`).join(' / ')
      + '）。「空 feed 不算通过」：一份没有条目的订阅产物，订阅者拿到的是一个空列表，'
      + '而那与「本站没有什么可订阅」是两句不同的话。构建停在这里。');
  }
  let calendarSummary = null;
  {
    // 两条产物各配一个渲染器，顺序 = `FEED_FILES` 的**冻结顺序**（契约第 1.1 条：Atom 在前）。
    // 文件名一律从表里取；数量对不上就抛错 —— 将来加第三种格式时"忘了补渲染器"不许静默少写一条。
    const renderers = [feed.renderAtom, feed.renderJsonFeed];
    if (renderers.length !== feed.FEED_FILES.length) {
      throw new Error(`订阅出口：FEED_FILES 有 ${feed.FEED_FILES.length} 条而渲染器只有 ${renderers.length} 个`);
    }
    const metaOf = selfPath => ({ ...feedMetaBase, selfPath });
    feed.FEED_FILES.forEach(([file], index) => {
      fs.writeFileSync(path.join(OUT, file), renderers[index](feedEntries, metaOf(file)), 'utf8');
    });
    console.log(`  订阅产物: ${feed.FEED_FILES.map(([file]) =>
      `${file} ${(fs.statSync(path.join(OUT, file)).size / 1024).toFixed(1)} KB`).join(' · ')}`
      + `（条目 ${feedEntries.length} 条 · 数据日期 ${lastmod}）`);
  }

  // v3.4 F2：到期日历（RFC 5545）。收录条件与判据只有一处：lib/calendar.js。
  // asOf 用**数据日期**（deals.json 的 updatedAt 日期），不是墙钟 —— 同一份数据重建逐字节相同；
  // `check-feed:reproducible` 会把这份产物也纳入逐字节对账（比对面 = FEED_FILES + CALENDAR_FILES）。
  {
    const asOf = lastmod;
    const ics = calendar.buildCalendarIcs({ deals: payload.deals, asOf, site });
    const [file] = calendar.CALENDAR_FILES[0];
    fs.writeFileSync(path.join(OUT, file), ics, 'utf8');
    const events = (ics.match(/^BEGIN:VEVENT\r$/gm) || []).length;
    calendarSummary = { file, bytes: Buffer.byteLength(ics), events, asOf };
    console.log(`  到期日历: ${file} ${(Buffer.byteLength(ics) / 1024).toFixed(1)} KB`
      + `（${events} 个事件 · 基准日 ${asOf} · 只收 expiresAt ≥ 基准日且非空的条目）`);
  }

  // 数据源状态：把采集写入的心跳文件发布出去（机器可读），并生成一页可读的 /status/。
  // 文件缺失（还没跑过一次成功采集）时生成「暂无数据」页，而不是让构建失败——
  // 一份状态页缺席不该阻断发布。
  // ⚠️ `healthStore / healthDoc` 在前面派生 `sourceFacts` 时已经加载过一次 —— 这里复用，
  // 不重新 load：两次 load 之间文件若被采集改动，页面上的「来源状态」与记录上的
  // 「最近成功采集」就会来自两个不同版本的心跳，而两边各自看都自洽。
  // t4：**这里原先写一份 source-health.json 到产物里** —— 已删除（产物里不许有数据文件）。
  // ⚠️ 注意别把它改成写仓库真值：`scripts/data/source-health.json` 是**采集写的心跳文件**，
  // 构建期对它只有读的权限（下面的 /status/ 对账就是读它）。写进去等于构建流程篡改采集证据。
  const statusDir = path.join(OUT, 'status');
  fs.mkdirSync(statusDir, { recursive: true });
  fs.writeFileSync(path.join(statusDir, 'index.html'), renderStatusPage(healthDoc, html), 'utf8');
  const healthSummary = health.summarize(healthDoc);
  console.log(`  数据源状态: source-health.json + status/index.html（${healthSummary.total} 个来源：` +
    `正常 ${healthSummary.healthy} · 异常 ${healthSummary.degraded} · 失败 ${healthSummary.failed}）`);

  // B 包：/codex-reset/ Codex 额度重置档案。纯静态（无内联页面脚本），数据只读仓库根的
  // codex-resets.json —— 页面里所有时间都由文件里的 fetchedAt 算死，不读墙钟。
  const codexResetDir = path.join(OUT, 'codex-reset');
  fs.mkdirSync(codexResetDir, { recursive: true });
  fs.writeFileSync(path.join(codexResetDir, 'index.html'), renderCodexResetsPage(codexResets, html), 'utf8');
  console.log(`  Codex 额度重置档案: /${CODEX_RESETS_ROUTE}（${codexResets.events.length} 条记录 · ` +
    `数据截至 ${beijingMinuteOf(codexResets.fetchedAt)} 北京时间 · 平均间隔 ${codexResets.stats.avgIntervalDays} 天）`);

  // 交给自检：折叠覆盖的条目总数需与页面卡片内容对得上；译文条数用于产物回读比对
  return Object.assign({}, rendered, {
    zhWithZh: zhAttached.report.withZh,
    healthSources: healthSummary.total,
    healthStatusText: healthSummary.rows.map(row => `${row.source}=${row.status}`).join(','),
    // B 包：/codex-reset/ 的构建期读数，供产物自检对账「页面行数 == 数据条数」。
    codexResets: { total: codexResets.events.length, fetchedAt: codexResets.fetchedAt },
    // v3.4 F2：到期日历的构建期读数（自检用它做盘上回读对账，不重新推导一份）。
    calendar: calendarSummary,
    // 目录页交给自检做**逐条回读对账**：文件存在不算数，页面上的条目集合
    // 必须与 dist/assets/data/offers.json 里 `collections` / `needs` 的筛选结果逐个 id 对得上。
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
    // 详情页（含 indexable 标记）交给自检：文件全量生成，但 sitemap 只收可索引的那些。
    // 窗口期页（noindex）必须「文件在、sitemap 不在」，这条对账要有牙。
    detailPages,
    lastmod,
    // v3.2：订阅产物交给自检做**磁盘回读**断言（结构 / URL 真实性 / 日期 / 禁词 / 元自称）。
    // 这里带下去的只有「构建期才知道的读数」三样：
    //   · `stats`    = `buildFeedEntries` 的账目（自检拿它对账「产物里的条目数」与「账目闭合」）；
    //   · `branches` = 每支的事件数 / 入选条数（自检拿它对账三支读数的加法）；
    //   · `dates`    = 日志里出现过的日期 ∪ 数据日期（自检拿它判「产物里的日期都来自数据」）。
    // 条目内容本身**不带**下去：自检要判的是**盘上的字节**，不是内存里那份（否则对账了自己）。
    feed: {
      stats: feedStats,
      branches: feedBranchReadings,
      entryCount: feedEntries.length,
      updatedAt: lastmod,
      dates: feedDataDates
    },
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
    // dist/assets/data/offers.json 的注入、dist/deal-plan-links.json、优惠页与套餐页上的文字都必须与它逐条一致。
    dealLinksDoc: dealLinksLoad.doc,
    dealLinksView,
    dealLinksByDeal,
    dealLinksAsOf,
    // t4：订阅层的回读对账随订阅子系统下架一起删除（feedBundle / feedStats 不再存在）；
    // 数据出口的 Manifest 同批删除；**发布副本**那一批断言也一并处置 —— 数据现在只从仓库根
    // 真值或构建期内存对象读（见 selfCheck 里各处的注释）。下面是自检需要的构建期对象，
    // 它们原先靠「从 dist 回读」拿到，现在直接传入：
    publishedModelsDoc: publishedModels,
    modelLinksDoc,
    plansStore,
    apiPlansStore,
    historyStore,
    planHistoryLoad,
    apiPlanHistoryLoad,
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
    // 变化日志的**可用性登记**（自检据此区分「分栏齐」与「如实说没有拿到日志」两支；
    // 规则本体在 lib/changes.js，见 p2-honesty-single-source-v1）。
    logAvailability,
    // v3.4 F3：全站搜索索引（自检据此从盘上回读 `data-search-count` 与 `<li>` 数对账）
    searchIndex: searchIndexBuilt,
    // 构建期真实生成的全部站内路由（含首页 '' 与刚才新增的 feeds/）——
    // Feed 里每一条站内链接都要能在这里找到，否则就是一条死链。
    pageRoutes: new Set([
      '',
      'en/',
      'status/',
      'changes/',
      plansHubPage.PLANS_HUB_ROUTE,
      plansPage.PLANS_ROUTE,
      apiPlansPage.API_PLANS_ROUTE,
      apiCostPage.API_COST_ROUTE,
      searchPage.SEARCH_ROUTE,
      dataDocsPage.DATA_DOCS_ROUTE,
      CODEX_RESETS_ROUTE,
      modelsPage.MODELS_INDEX_ROUTE,
      ...gatedModels.map(model => modelsPage.modelHrefOf(model)),
      archiveLib.ARCHIVE_INDEX_ROUTE,
      ...gatedArchiveEntries.map(entry => archiveLib.archiveEntryRoute(entry)),
      ...detailPages.map(page => `deal/${encodeURIComponent(page.id)}/`),
      ...directoryPages.map(page => page.route)
    ])
  });
}

const selfCheck = createSelfCheck({
  ROOT, OUT, PUBLIC_FILES, GENERATED_FILES, OFFERS_ARTIFACT,
  ROUTE_HREFS, ROUTE_MARKERS, MIN_PRERENDERED_CARDS,
  NOTES_MANIFEST_FILE, NOTES_MANIFEST_PATH, CODEX_RESETS_ROUTE,
  listPageFiles, listArtifactFiles,
  NOTE_SLOTS, noteIntent, notesManifestText, noteManifestSelfCheck,
  FOOTER_KEPT_SENTENCE, normalizeForCompare, scanResidue,
  prerenderedText, extractFaq, visibleFaq, decodeEntities,
  plansCompareSource, searchFilterSource,
  renderApiCostPage, vendorHrefFor, renderDirectoryPage,
  getPlan: () => PLAN,
  getVendorKeyOf: () => VENDOR_KEY_OF
});

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
  // 说明意图清单落盘（`<产物目录>.notes.ndjson`，见 writeNotesManifest() 的头注释）：
  // 刻意放在 promoteStaging() **之后** —— 清单是「产物已经就位」这件事的副产物，不是构建过程的
  // 中间文件。构建失败时它一个字节都不该留：仓库根留下「描述一份从未就位的产物」的陈旧清单，
  // 会让所有以它为意图侧的门禁（verify-site §22c ⑨）误红，而那种红看起来像"说明被删了"。
  writeNotesManifest();
  console.log(`\n✅ 构建完成 → ${showOut(FINAL_OUT)}（自检全过，已从暂存目录就位）`);
}

/**
 * 导出给**工具**用的入口（`scripts/tools/check-residue.js`）。
 *
 * 为什么导出而不是让工具自己再写一份：变异演练（「把删掉的一段文案注回产物副本，
 * 证明这台机器会红」）必须打在**构建期跑的那一次实现**上。若工具自带第二份扫描逻辑，
 * 演练证明的就是「工具会红」—— 而门禁会不会红仍然没人知道；反过来，两份实现一旦分叉，
 * 「有牙」和「没牙」在证据上没有区别。
 *
 * 导出本身不改变 CLI 行为：`main()` 只在 `require.main === module`（直接 `node …build-local.js`）时跑。
 */
module.exports = { scanResidue, loadResidueGuard, countOccurrences, residueStrip,
  normalizeForCompare, decodeEntitiesToFixpoint, decodeJsonUnicodeEscapes, isRenderedLiteral,
  RESIDUE_GUARD_FILE, RESIDUE_MIN_ENTRIES, RESIDUE_MIN_LIVE_LITERALS, RESIDUE_MIN_FLOOR_RATIO_HARD,
  RESIDUE_MIN_NORM_NEEDLE, RESIDUE_CONTAINER_CLASSES, FOOTER_KEPT_SENTENCE,
  RESIDUE_RELATION_ONLY_CLASSES, RESIDUE_COUNTED_CONTAINER_CLASSES };

if (require.main === module) {
  try {
    main();
  } catch (err) {
    restoreBackupIfNeeded();
    discardStaging();
    console.error(`\n❌ 构建失败：${err instanceof SelfCheckFailed ? err.message : (err && err.stack) || String(err)}`);
    console.error(`   ${showOut(FINAL_OUT)} 未被改动${fs.existsSync(FINAL_OUT) ? '' : '（原本不存在，现在仍不存在）'}；暂存目录已清理，可直接重跑。`);
    process.exit(1);
  }
}
