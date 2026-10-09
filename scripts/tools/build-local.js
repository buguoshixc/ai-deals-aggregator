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
const { load: loadRenderCore } = require('../lib/render-core');
const { attach: attachZh, summarize: summarizeZh } = require('../lib/zh');
const health = require('../lib/health');
const audience = require('../lib/audience');
const provenance = require('../lib/provenance');
const history = require('../lib/history');
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
 */
const PUBLIC_FILES = ['index.html', 'favicon.svg', 'robots.txt', '.nojekyll'];
/**
 * 构建期生成、不走源码拷贝的产物（**同样一份数据文件都没有**）。
 *
 * ⚠️ t4 起只剩这三个：`logos.css`（厂商 logo 样式表）、`sitemap.xml`、`og-image.png`。
 * 删掉的项与理由：`feed.xml` / `feed.json` / `icon.png`（订阅子系统整体下架）、
 * `source-health.json`（它是运维观测数据，"给读者一份可下载的 JSON"这条面撤了；
 * `/status/` 页面本身保留，页面与断言改读仓库根那份真值 —— 见自检里的注释）、
 * `data/index.json`（Dataset Manifest，数据出口子系统下架）。
 *
 * ⚠️ 说明意图清单（`NOTES_MANIFEST_FILE`）**不在这一张里**：它的落盘位置在产物目录之外
 * （`NOTES_MANIFEST_PATH`），而下面「声明文件必须存在于 OUT」的循环会逐个
 * `fs.existsSync(path.join(OUT, file))` —— 留着它必然红。这也是"清单真的搬走了"的**牙**。
 */
const GENERATED_FILES = ['logos.css', 'sitemap.xml', 'og-image.png'];

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

/* ------------------------------------------------------------------ */
/* 页面级说明的**构建期意图清单**（notes-manifest-v1）                    */
/* ------------------------------------------------------------------ */

/**
 * ## 这一节解决什么问题
 *
 * 长期挂在 `NEXT-STEPS.md` §0 剩余事项里的那条 P1 是：**判据只认 `.snote` 这个类名**
 * （把类名换掉、或者把说明换进别的容器，门禁就再也看不见它了）。今天所有与说明有关的
 * 断言（`verify-site.js` §22c 的窄柱 / 字迹 / 同轴 / 未渲染、构建期的 Markdown 记号扫描、
 * 「每页冻结串恰好 1 次」）都是**只看渲染结果**的：它们回答的是「已经叫 `.snote` 的那些
 * 元素长得对不对」，从来没有人问过**「这一页本来打算输出几条说明、每条在哪一类容器里」**。
 * 于是「故意改个名」是一次静默的失效，而不是一次会红的决定。
 *
 * 修法是**跨源对账**，两个来源互相独立：
 *
 *   ① **意图源（本文件）** —— 在**内容构造点**登记：这一页打算输出几条说明、每条的槽位
 *      （`snote` / `pnote` / `vsnote`）与**完整 class token 集合**、以及它是哪一处构造分支
 *      产出的。登记与输出是同一次调用（`noteDeclare()` 返回它收到的 HTML，
 *      「先登记、后输出」），所以**登记不出来的说明也输出不出去**。
 *      ⚠️ 意图源**不读产物、也不拿正则去扫 HTML**：它只由代码里的构造分支说出口。
 *   ② **渲染源（产物 / DOM）** —— 构建期自检回读**刚生成的 HTML**、§22c 回读**真浏览器里的
 *      DOM**，按同一把尺子（`<main>` 内、class token 级、按 token 集合分组计数）数出来。
 *
 * 两侧相等才放行；不等就点名 `route#index` 并**同时给出两侧读数**。改名（`snote` → 别的）、
 * 换容器（`<p>` → `<div>`、或换成一个不含该 token 的 class）、漏渲染，三种都会让渲染侧
 * 比意图侧少一条 ⇒ 构建期或 §22c 至少一处红。
 *
 * ## 为什么清单落成 `_notes.ndjson` 而不是 `_notes.json`
 *
 * 当年的判据是：产物里**每一个 `*.json` 都必须被某个注册表认领**（那条 fail-closed 判据原在
 * `lib/data-docs.js` 的 §10.7 方向 2，**随数据出口子系统整体下架**；今天对应的纪律由
 * `lib/published-assets.js` 承重：产物里不许有数据文件）。而把一个内部清单塞进当年的
 * `PUBLIC_DATASETS` 会让它出现在 `/docs/data/` 的公开数据集索引里（那是产品面变化，
 * 不只是多一个文件）—— 这两处现在都已下架，但命名沿用了下来。
 * ⚠️ 今天更直接的理由是：**这份清单根本不在产物目录里**（见上面的 `NOTES_MANIFEST_PATH`），
 * 所以它连"产物里的文件"都不是。用 **NDJSON**（一行一个 JSON 对象：首行头部，其余每行一页）
 * 是为了机器可读、可 `grep`、可逐字节重建。
 *
 * ## 覆盖边界（**写在代码里，不写在别处**）
 *
 * 意图源只能登记**它自己代码路径上**的说明构造点。全站 `<main>` 里的说明容器实测
 * （2026-10-08，`dist` 186 页）分三类：`.snote` 271 条 · `.pnote` 159 条 · `.vsnote` 150 条。
 * **这三类现在全部逐条登记**（`notes-manifest-residual-v1`，2026-10-08）：原先落在范围之外的
 * 构造点已经接管 —— `lib/models-page.js` / `lib/plans-page.js` / `lib/api-plans-page.js` /
 * `lib/plans-hub-page.js` / `lib/archive.js` / `index.html` 的 RENDER-CORE
 * 区块（`changesPageHtml`）都按 route 收到登记入口 `ctx.note`，在**产出那一段 HTML 的同一次调用**里
 * 登记（与 `lib/vendor-page.js` 同形）。⚠️ 当年这份名单里还有一个 `lib/data-docs.js` ——
 * 它随 `/docs/data/` 数据文档页在「去数据暴露」里整体下架，**已不在列**（那个模块已删除）。**台账（`untracked`）因此从 58 页清到 0 页** ——
 * `noteUntracked()` 这个机制保留（下一个「构造点确实不在本文件路径上」的页面族还得能用它如实登记），
 * 但当前**没有任何调用点**：整份清单每一页都是 `complete`，构建期与 §22c 都按「逐字相等」判。
 *
 * 文件名常量 `NOTES_MANIFEST_FILE` 与它的落盘位置 `NOTES_MANIFEST_PATH` 放在一起（产物清单那一段，
 * 见 `PUBLIC_FILES` / `GENERATED_FILES`）。⚠️ 它**不在** `GENERATED_FILES` 里 —— 清单不进产物目录。
 */

/**
 * 说明槽位 —— 全站只有这三种容器 token（`<main>` 内、class token 级匹配）。
 *
 * ⚠️ token 必须**互为非前缀**且不与站点别处的 class 撞名：`snote` / `vsnote` 之间靠
 * **token 边界**区分（`vendor-page.js` 里那条历史教训：`class="snote aliasnote"` 用
 * `class="snote"` 精确串匹配时一条都照不到，`.vsnote` 反过来又会被 `\bsnote\b` 放过）。
 * 这里一律按**分词后的 token 集合**比，不做子串匹配。
 */
const NOTE_SLOTS = [
  { id: 'main-snote', token: 'snote', description: '页面级说明（§22c 逐条几何判据的对象）' },
  { id: 'main-pnote', token: 'pnote', description: '底部折叠说明（<details class="page-notes"> 内）' },
  { id: 'main-vsnote', token: 'vsnote', description: '厂商资料页的区段说明' }
];

/** 意图登记表：route → { pageKind, notes[], floors{}, untracked }。构建期一次性，持在内存里。 */
const noteIntent = new Map();

/** 取（或建）某一页的意图登记项。路由用站根相对形式，**首页是空串**（与全站其它登记口径一致）。 */
function notePageEntry(route) {
  if (typeof route !== 'string') {
    throw new Error(`说明登记：route 必须是页面路由字符串（得到 ${JSON.stringify(route)}）`);
  }
  if (!noteIntent.has(route)) {
    noteIntent.set(route, { route, pageKind: null, notes: [], floors: {}, untracked: null });
  }
  return noteIntent.get(route);
}

/** 归一化 class token 串 → 排序后的 token 数组（两侧对账用的「签名」口径） */
function noteSignatureOf(classes) {
  return String(classes || '').trim().split(/\s+/).filter(Boolean).sort();
}

/**
 * **登记一条页面级说明，并原样返回它的 HTML**。
 *
 * 这是「先登记、后输出」的唯一入口：模板再也不能「直接把一段 `<p class="snote">` 写进
 * 页面」—— 想输出就得先说出（槽位 / 完整 class token / 哪一处构造分支）。
 *
 * @param {string} route 该页的站根相对路由（首页是 `''`）
 * @param {{kind:string, slot:string, classes:string, declaredBy:string}} decl
 *        `kind` 是**类型标签**（给读者看的分类：`alias-note` / `page-note` / `noscript-hint` / …）；
 *        `classes` 是**完整** class token 串（两侧对账按排序后的集合比）；
 *        `declaredBy` 是构造点位置（`文件:函数`），出错时点名用。
 * @param {string} html 这一段说明的 HTML（原样返回，保证「登记与输出是同一次调用」）
 */
function noteDeclare(route, decl, html) {
  if (typeof html !== 'string' || !html.trim()) {
    throw new Error(`说明登记：${route} 的 ${decl.kind} 没有可输出的 HTML —— 「先登记、后输出」不接受空说明`);
  }
  noteRegister(route, decl);
  return html;
}

/**
 * **组装点登记（pin）**：这一条说明的构造点在**本轮范围之外**的模块里，由组装点按它的
 * 容器签名把意图说出来（并写明它在哪个模块的哪一行输出）。
 *
 * 它与 `noteDeclare()` 的区别是**可验证的方向相反**：`noteDeclare` 自己产出 HTML，
 * `notePinned` 只能被产物/ DOM 验证（登记说「这一页应当恰好有 1 条这个签名的说明」，
 * 谁去渲染由那个模块负责）。为什么仍然要登记：改名 / 换容器 / 不再输出，三种都会让
 * 渲染侧比意图侧少一条 ⇒ 构建期或 §22c 至少一处红。清单里它带 `pinned: true` 与
 * `source`（下一轮把构造点接管过来时，这两项就是待删的「已接管」标记）。
 */
function notePinned(route, decl, pin) {
  if (!pin || !pin.source || !pin.reason) {
    throw new Error(`说明登记：${route} 的 ${decl.kind} 是组装点登记，必须写明 source 与 reason`);
  }
  noteRegister(route, Object.assign({}, decl, { pinned: pin.source, pinnedReason: pin.reason }));
}

/** `noteDeclare` / `notePinned` 共用的校验与入表 */
function noteRegister(route, decl) {
  const page = notePageEntry(route);
  const slot = NOTE_SLOTS.find(item => item.id === decl.slot);
  if (!slot) {
    throw new Error(`说明登记：${route} 的 ${decl.kind} 用了未登记的槽位「${decl.slot}」` +
      `（合法值：${NOTE_SLOTS.map(item => item.id).join(' / ')}）`);
  }
  const tokens = noteSignatureOf(decl.classes);
  if (!tokens.includes(slot.token)) {
    throw new Error(`说明登记：${route} 的 ${decl.kind} 声明 class="${decl.classes}"，`
      + `但槽位 ${slot.id} 要求 token「${slot.token}」在其中 —— 声明与容器不符，登记没有意义`);
  }
  if (!decl.declaredBy) {
    throw new Error(`说明登记：${route} 的 ${decl.kind} 没有 declaredBy（说明是哪一处构造点产出的）`);
  }
  page.notes.push({
    kind: decl.kind, slot: slot.id, signature: tokens.join(' '), declaredBy: decl.declaredBy,
    pinned: decl.pinned || null, pinnedReason: decl.pinnedReason || null
  });
}

/** 给某一页登记「这一页属于哪一族」与**结构下限**（页面族不变式，与具体哪几条说明无关）。 */
function notePage(route, spec = {}) {
  const page = notePageEntry(route);
  if (spec.kind) page.pageKind = spec.kind;
  if (spec.floors) {
    for (const [slotId, floor] of Object.entries(spec.floors)) {
      if (!NOTE_SLOTS.some(item => item.id === slotId)) {
        throw new Error(`说明登记：${route} 的 floors 里有未登记的槽位「${slotId}」`);
      }
      page.floors[slotId] = floor;
    }
  }
  return page;
}

/**
 * **台账**：这一页的 `.snote` 由**范围之外**的模块构造（本清单不逐条登记它们）。
 *
 * 台账必须写明归属模块与该模块里**无条件**产出那一条说明的位置 —— 它是「下一轮要接管
 * 哪些构造点」的可执行清单，也是 `minNotes` 这条下限的依据。台账不是豁免：构建期与
 * §22c 都要求这些页面**仍然至少有 `minNotes` 条 `.snote`**（整族改名 / 整族被删 ⇒ 红）。
 *
 * ⚠️ **当前 0 个调用点**（`notes-manifest-residual-v1`，2026-10-08）：原先登记的 58 页 / 8 族
 * 全部在构造点接管（见本节开头的覆盖边界），台账已清零。机制保留 —— 下一个构造点确实不在
 * 本文件代码路径上的页面族，仍然可以用它如实登记（而不是悄悄少登记几条）。
 */
function noteUntracked(route, spec) {
  const page = notePageEntry(route);
  if (page.untracked) {
    throw new Error(`说明登记：${route} 重复登记台账（先登记的是 ${page.untracked.family}）`);
  }
  const minNotes = spec.minNotes === undefined ? 1 : spec.minNotes;
  if (!spec.family || !spec.owner || !spec.structural) {
    throw new Error(`说明登记：${route} 的台账缺 family / owner / structural —— 台账必须能指出「下一轮接管哪一处」`);
  }
  page.untracked = { family: spec.family, owner: spec.owner, structural: spec.structural, minNotes };
  return page;
}

/** 某一页 → 产物内路径（首页是 `index.html`，其余是 `<route>index.html`） */
function noteArtifactPathOf(route) {
  return route ? `${route}index.html` : 'index.html';
}

/**
 * 把某一页绑成一个「先登记、后输出」的登记入口，交给**别的模块**在它自己的构造点调用。
 *
 * 为什么需要它：厂商资料页的六节说明由 `lib/vendor-page.js` 构造。清单的意图必须从
 * **构造点**说出口，而不是由调用方猜（猜出来的数字就是回扫产物）。所以登记入口连同 route
 * 一起注入（`ctx.note`），模块在它构造那一条说明的同一次调用里登记 —— 登记与输出仍然是
 * 同一次调用，只是这次跨了一层模块边界。
 */
function noteDeclarerFor(route) {
  return (decl, html) => noteDeclare(route, decl, html);
}

/**
 * 把 `<main>` 里的说明容器按**槽位 × class token 集合**分组计数。
 *
 * 只用刚生成的 HTML（构建期自检）——**不是**清单的来源，是清单的对照面。
 * 扫描面刻意与浏览器侧的同名实现（`verify-site.js` 的 `wideMeasure`）保持同一口径：
 * 去注释 / 去 `<script>` / 去 `<style>`、`class` 属性分词、按排序后的 token 集合分组。
 * 检测是「token 级」（含槽位 token 即算），判定是「集合级」（签名必须逐字相等）——
 * 前者决定能不能看见，后者才是判据，改名只会让后者对不上。
 */
function noteSignaturesInMain(html) {
  const out = new Map(NOTE_SLOTS.map(slot => [slot.id, new Map()]));
  const mainMatch = html.match(/<main\b[^>]*>([\s\S]*)<\/main>/);
  if (!mainMatch) return out;
  const body = mainMatch[1]
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '');
  const tagRe = /<([a-z][a-z0-9-]*)\b([^>]*)>/gi;
  let match;
  while ((match = tagRe.exec(body))) {
    const attr = (match[2].match(/(?:^|\s)class\s*=\s*"([^"]*)"/i) || [])[1];
    if (!attr) continue;
    const tokens = noteSignatureOf(attr);
    const slot = NOTE_SLOTS.find(item => tokens.includes(item.token));
    if (!slot) continue;
    const signature = tokens.join(' ');
    const bucket = out.get(slot.id);
    bucket.set(signature, (bucket.get(signature) || 0) + 1);
  }
  return out;
}

/** 清单文本（NDJSON；页按 route 排序 ⇒ 与登记顺序无关，连续两次构建逐字节一致） */
function notesManifestText() {
  const routes = [...noteIntent.keys()].sort();
  const declaredBySlot = new Map(NOTE_SLOTS.map(slot => [slot.id, 0]));
  for (const page of noteIntent.values()) {
    for (const note of page.notes) declaredBySlot.set(note.slot, declaredBySlot.get(note.slot) + 1);
  }
  const header = {
    kind: 'header',
    schemaVersion: 1,
    generator: 'scripts/tools/build-local.js',
    slots: NOTE_SLOTS.map(slot => ({ id: slot.id, token: slot.token, description: slot.description })),
    totals: {
      pages: routes.length,
      declaredNotes: [...declaredBySlot.values()].reduce((sum, n) => sum + n, 0),
      declaredBySlot: Object.fromEntries(NOTE_SLOTS.map(slot => [slot.id, declaredBySlot.get(slot.id)])),
      untrackedPages: [...noteIntent.values()].filter(page => page.untracked).length
    }
  };
  const lines = [JSON.stringify(header)];
  for (const route of routes) {
    const page = noteIntent.get(route);
    const declared = {};
    for (const slot of NOTE_SLOTS) declared[slot.id] = page.notes.filter(note => note.slot === slot.id).length;
    lines.push(JSON.stringify({
      kind: 'page',
      route: route,
      pageKind: page.pageKind,
      // complete = 「本页 `<main>` 里的 `.snote` 全在清单里」 ⇒ 构建期与 §22c 都要求**逐字相等**
      complete: !page.untracked,
      declared: declared,
      floors: page.floors,
      untracked: page.untracked,
      notes: page.notes.map((note, index) => Object.assign({ index }, note))
    }));
  }
  return `${lines.join('\n')}\n`;
}

/**
 * 构建期自检：清单 ↔ **刚生成的 HTML** 逐页对账。
 *
 * 判据四条（与 §22c 的 ⑨ 同一套，两侧口径必须一致）：
 *   ① 路由集双向相等：产物里每个 HTML 都登记过意图，反之亦然（漏登记的页面族 = 红）；
 *   ② 逐页逐槽位：清单声明的每个「token 集合 × 条数」都必须与 HTML 里数出来的相等，
 *      反向也成立（多出来的说明 = 有人绕过了登记 ⇒ 红）；不等时点名 `route#index` 并给两侧读数；
 *   ③ 结构下限：页面族不变式（如别名页恰好 1 条页面级说明）—— 它防的是「登记与模板一起被删」；
 *   ④ 台账下限：`untracked` 页面仍必须有 `minNotes` 条 `.snote`。
 *
 * @returns {{ problems: string[], readings: object[] }}
 */
function noteManifestSelfCheck() {
  const problems = [];
  const readings = [];
  const htmlFiles = listArtifactFiles(OUT).filter(file => file.endsWith('.html'));
  const diskRoutes = new Set(htmlFiles.map(file => file.replace(/index\.html$/, '')));
  for (const route of [...diskRoutes].sort()) {
    if (!noteIntent.has(route)) {
      problems.push(`${route || '(首页)'} 有产物页面但清单里没有这一页的说明意图 `
        + `—— 新增页面族必须显式登记（notePage(route, …)），否则它就是一个新的隐形说明面`);
    }
  }
  for (const route of [...noteIntent.keys()].sort()) {
    if (!diskRoutes.has(route)) {
      problems.push(`清单登记了 ${route || '(首页)'} 的说明意图，但产物里没有这一页 —— 清单与产物分家了`);
    }
  }
  for (const route of [...noteIntent.keys()].sort()) {
    if (!diskRoutes.has(route)) continue;
    const page = noteIntent.get(route);
    const html = fs.readFileSync(path.join(OUT, noteArtifactPathOf(route)), 'utf8');
    const dom = noteSignaturesInMain(html);
    const where = route || '(首页)';
    const declaredTotals = new Map(NOTE_SLOTS.map(slot => [slot.id, 0]));
    for (const note of page.notes) declaredTotals.set(note.slot, declaredTotals.get(note.slot) + 1);
    const domTotals = new Map(NOTE_SLOTS.map(slot => [slot.id, [...dom.get(slot.id).values()].reduce((sum, n) => sum + n, 0)]));

    // ① 逐签名对账（双向）：签名 = 排序后的完整 class token 集合
    for (const slot of NOTE_SLOTS) {
      const domBucket = dom.get(slot.id);
      const declaredSignatures = new Map();
      page.notes.filter(note => note.slot === slot.id).forEach(note => {
        declaredSignatures.set(note.signature, (declaredSignatures.get(note.signature) || 0) + 1);
      });
      const signatures = new Set([...declaredSignatures.keys(), ...domBucket.keys()]);
      for (const signature of signatures) {
        const declaredCount = declaredSignatures.get(signature) || 0;
        const domCount = domBucket.get(signature) || 0;
        if (declaredCount === domCount) continue;
        // 台账页面只做**单向**对账：多出来的说明属于范围之外的那个模块（它们由 minNotes 下限守），
        // 但「清单声明的容器必须真的渲染出来」这一条对台账页面同样成立。
        if (page.untracked && domCount > declaredCount) continue;
        // 报错位点：取该签名在清单里的第一条（没有登记时取 slot 的第 0 条）—— route#index 可定位
        const noteIndex = page.notes.findIndex(note => note.slot === slot.id && note.signature === signature);
        const at = `${where}#${noteIndex === -1 ? 0 : noteIndex}`;
        problems.push(`${at} 槽位 ${slot.id} 签名 <${signature || slot.token}>：`
          + `清单声明 ${declaredCount} 条、产物里数出 ${domCount} 条 —— `
          + (declaredCount > domCount
            ? '说明没有按登记的容器渲染（换名 / 换容器 / 漏渲染）'
            : '产物里出现了没有登记的说明容器（绕过 noteDeclare() 直接写进页面）'));
      }
    }

    // ② 结构下限（页面族不变式）
    for (const [slotId, floor] of Object.entries(page.floors)) {
      const min = floor && floor.min !== undefined ? floor.min : 0;
      const actual = domTotals.get(slotId) || 0;
      if (actual < min) {
        problems.push(`${where} 槽位 ${slotId}：页面族的**结构下限**是 ${min} 条，产物里只有 ${actual} 条 `
          + `—— 这一族的说明被整条删掉或改成了别的容器（登记与模板一起消失时，只有下限能挡住它）`);
      }
      if (floor && floor.max !== undefined && actual > floor.max) {
        problems.push(`${where} 槽位 ${slotId}：页面族的上限是 ${floor.max} 条，产物里有 ${actual} 条`);
      }
    }

    // ③ 台账下限（范围之外的模块构造的说明）
    if (page.untracked) {
      const actual = domTotals.get('main-snote') || 0;
      if (actual < page.untracked.minNotes) {
        problems.push(`${where} 台账 ${page.untracked.family}（${page.untracked.owner}）：`
          + `要求至少 ${page.untracked.minNotes} 条 .snote，产物里只有 ${actual} 条 `
          + `—— 无条件的说明（${page.untracked.structural}）没有渲染出来`);
      }
    }

    // ④ complete 页面：整页 `.snote` 总数逐字相等（两侧读数都记进报告）
    if (!page.untracked) {
      const declared = declaredTotals.get('main-snote') || 0;
      const actual = domTotals.get('main-snote') || 0;
      if (declared !== actual) {
        problems.push(`${where} 整页 .snote：清单声明 ${declared} 条、产物里数出 ${actual} 条（完整对账不许有差额）`);
      }
    }
    readings.push({
      route,
      kind: page.pageKind,
      declared: Object.fromEntries(declaredTotals),
      dom: Object.fromEntries(domTotals),
      complete: !page.untracked,
      untracked: page.untracked ? page.untracked.family : null
    });
  }
  return { problems, readings };
}

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
 * **纯静态**：详情页不加载主脚本，不 fetch assets/data/offers.json——没有列表要渲染，也就没有控制台错误；
 * 只保留一个极小的主题切换脚本（与首页同一套 localStorage 约定）。
 */
function writeDetailPages(payload, indexHtml, renderCore, plan) {
  // 共享片段（共享 `<style>` / 主题前置脚本 / 页脚模板）与页脚收尾都交给页面壳：
  // 页脚**每页解析一次**这条既有纪律没有变 —— `shell.docEnd()` 会用这一页自己的路由调
  // `finalizePage()`（分析注入要按该页路由判「要不要统计」）。
  const parts = shell.loadShellParts(indexHtml, ROUTE_HREFS);

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

    const html = `${shell.docStart({
      kind: 'deal',
      route: `deal/${deal.id}/`,
      prefix: '../../',
      parts,
      title: htmlEscape(title),
      description: htmlEscape(desc),
      robots: 'index, follow, max-image-preview:large',
      canonicalUrl: htmlEscape(pageUrl),
      hreflang: [
        { hreflang: 'zh-CN', href: htmlEscape(pageUrl) },
        { hreflang: 'x-default', href: htmlEscape(pageUrl) }
      ],
      og: {
        type: 'article',
        siteName: htmlEscape(SITE_NAME),
        url: htmlEscape(pageUrl),
        title: htmlEscape(deal.title),
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
      </p>${shell.docEnd({ route: `deal/${deal.id}/`, prefix: '../../', parts, extraTailHtml: themeBind, where: 'writeDetailPages' })}`;

    const dir = path.join(OUT, 'deal', deal.id);
    fs.mkdirSync(dir, { recursive: true });
    // 说明意图（notes-manifest-v1）：详情页的正文由 RENDER-CORE 的 detailHtml 渲染，
    // 它**不产出**页面级说明 ⇒ 声明「0 条」。这一行同时是「这一页存在」的登记：
    // 清单的路由集与产物页面集是双向对账的，漏登记会被构建期点名。
    notePage(`deal/${deal.id}/`, { kind: 'deal-detail' });
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
  const parts = shell.loadShellParts(indexHtml, ROUTE_HREFS);
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
  // 为什么不给这张表再发一份 `ItemList` / `Dataset`：这张表是**运维观测**，不是内容集合；
  // 同一份事实的另一份机器可读形态另有其物（`source-health.json` —— t3 起页面不再链它，
  // 但文件本身与数据侧的对账都还在）。把同一份事实声明两次，两次迟早会分家，
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

  // 本页独有的部分（页面级 CSS / 面包屑 / 页面脚本 / 订阅标签说明）逐字保留，
  // 只把**文档脚手架**交给页面壳：共享 `<style>`、主题前置脚本、共享页头、共享页脚、
  // 以及收尾的 finalizePage —— 此前这一族各写了一份，实测与其余 8 族逐字相同。
  const pageCss = `  /* 只用首页已有的设计变量，不新建一套视觉语言 */
  .stop { display: flex; align-items: baseline; gap: var(--s2); flex-wrap: wrap; margin-bottom: var(--s2); }
  .stop h1 { font-size: 19px; margin: 0; }
  .stop .meta { color: var(--mut); font-size: var(--fs-sm); }
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
  @media (max-width: 760px) { .stable th, .stable td { padding: 8px 9px; } }`;
  /* 相对时间只在浏览器里换算：页面字节因此与构建时刻无关（连续两次 build 产物一致）。
     禁用 JS 时读到的仍是完整的绝对时间。 */
  const pageScript = `    (function () {
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
    })();`;
  // 说明意图（notes-manifest-v1）：状态页页面级说明**恰好一条**（判读口径）。
  // ⚠️ t3：原先还有第二条「机器可读的同一份数据：source-health.json」—— 那一条**整条删除**
  // （连同它的 `noteDeclare` 分支），因为本轮的目标是站点不再面向读者暴露数据文件。
  // 删条数必须同步改下面的 floors：不同步 ⇒ 「清单声明 2 条 / DOM 1 条」当场红（幽灵声明）。
  notePage(route, { kind: 'status', floors: { 'main-snote': { min: 1 } } });
  return `${shell.docStart({
    kind: 'status',
    route,
    prefix: '../',
    parts,
    title: `${htmlEscape(STATUS_HEADING)} · ${htmlEscape(SITE_NAME)}`,
    description: htmlEscape(STATUS_DESCRIPTION),
    canonicalUrl: `${SITE_URL}status/`,
    faviconHref: '../favicon.svg',
    extraCss: pageCss,
    jsonLdHtml: jsonLdBlocks,
    where: 'renderStatusPage'
  })}
      <nav class="crumb" aria-label="面包屑"><a href="../">首页</a> › <span>${htmlEscape(STATUS_HEADING)}</span></nav>

      <div class="stop">
        <h1>${htmlEscape(STATUS_HEADING)}</h1>
        <span class="meta">数据生成时间 ${htmlEscape(health.formatCN(healthDoc && healthDoc.generatedAt))}（北京时间）</span>
      </div>
${noteDeclare(route, {
    kind: 'status-reading-guide', slot: 'main-snote', classes: 'snote',
    declaredBy: 'build-local.js:renderStatusPage(判读口径)'
  }, `      <p class="snote">
        这一页列出每个采集来源<b>最近一次</b>的结果与跨运行的连续性。
        采集器报错、或连续 3 次零产出即 <b>❌ 失败</b>；请求成功但条数掉到上次一半以下、
        或零产出但还没到 3 次即 <b>⚠️ 异常</b>；其余为 <b>✅ 正常</b>。
        「连续失败 / 连续零产出」两列分别是这两个计数器的当前值。
      </p>`)}

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

${shell.docEnd({ route, prefix: '../', parts, extraScript: pageScript, where: 'renderStatusPage' })}`;
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
  const parts = shell.loadShellParts(indexHtml, ROUTE_HREFS);

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
  // 说明意图（notes-manifest-residual-v1）：正文里的 `.snote` 现在由 RENDER-CORE 的
  // `changesPageHtml(radar, prefix, note)` 在**构造点**逐条登记（第三个参数是登记入口）。
  const marked = markChangesRows(renderCore.changesPageHtml(radar, '../', noteDeclarerFor('changes/')), itemListRecords, changes.renderOrderOf(radar).length);
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
      plansById: context.plansById || null,
      note: noteDeclarerFor('changes/')
    })
      .split('\n').map(line => `      ${line}`).join('\n')
    : '';
  // v3.0 Stage H：API 价格变化。**同样不新做一页** —— 这一页的任务就是回答
  // 「最近发生了什么变化」，而 API 计费的价格/模型/免费额度/限速变化是第三条独立的变化流
  // （另 一份数据、另 一份日志、另 一个起算日）。块由 `api-plans-page.js` 渲染，
  // 与 `/plans/api/` 共用同一句话（判据来自 `api-plan-history`，没有第二套变化检测）。
  const apiPlanBlock = context.apiPlanChanges
    ? apiPlansPage.apiPlanChangesPageBlockHtml(context.apiPlanChanges, {
      prefix: '../', providerTable: context.providerTable || null, note: noteDeclarerFor('changes/')
    })
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

  // 面包屑属于**这一页的正文**（页壳只管文档脚手架），与正文拼在一起传给页壳。
  const bodyHtml = `      <nav class="crumb" aria-label="面包屑"><a href="../">首页</a> › <span>${htmlEscape(PAGE_HEADING)}</span></nav>
${body}`;
  return shell.renderWidePageShell({
    kind: 'changes',
    route: 'changes/',
    prefix: '../',
    parts,
    title: `${htmlEscape(PAGE_HEADING)} · ${htmlEscape(SITE_NAME)}`,
    description: htmlEscape(PAGE_DESCRIPTION),
    canonicalUrl: pageUrl,
    faviconHref: '../favicon.svg',
    extraCss: `  /* 只用首页已有的设计变量，不新建一套视觉语言。
     列表式（不是宽表）：手机上自然换行、不产生横向滚动 —— 与目录页的表格相反，
     这里每行都有一段可能很长的原文（原值 → 新值），表格会把手机变成横向滚动条。 */
  .chgmeta { display: flex; align-items: baseline; gap: var(--s3); flex-wrap: wrap; color: var(--mut); font-size: var(--fs-sm); margin: 0 0 var(--s3); }
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
  }`,
    jsonLdHtml: jsonLdBlocks,
    bodyHtml,
    where: 'renderChangesPage'
  });
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
/**
 * 套餐对比页 `/plans/coding/` 的**静态表格原语**（宽表 11 列 ⇒ 外层必须有横滚容器）。
 *
 * 与 `STATIC_PAGE_CSS` 是**变体关系而不是同一份**：`.ptable td` 的 `min-width` 是 92px
 * （资料页那五个族是 72px），另有 `.ptag` 与 `.ptable .num small` 两条这里独有。
 * 按本轮审计的纪律「分歧的声明不合并」——先原样保留；要合并必须先证明两条规则真的同值，
 * 否则外观会静默改变，而外观回归**只有真浏览器几何断言抓得到**。
 *
 * ⚠️ 迁移时漏掉这一段一次，症状是 `/plans/coding/` 在 360/390px 出现 290px 页面级横向溢出
 * （`.ptable-wrap` 的 `overflow-x: auto` 没了，634px 的宽表直接撑破 328px 的容器）——
 * 由 `verify-site.js` §22c 的全站几何门禁抓住，构建期自检与静态检查都是绿的。
 * 教训：页壳只接管**文档脚手架**，页面级 CSS 必须显式保留。
 */
const PLANS_TABLE_CSS = `  /* 只用首页已有的设计变量，不新建一套视觉语言。
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
  @media (max-width: 760px) { .ptable th, .ptable td { padding: 8px 9px; } }`;

/**
 * 渲染 `/plans/coding/`（Coding Plan 套餐对比页）。
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
 * 这一层只套壳：`<head>`、主题脚本、页头、页脚、JSON-LD（文档脚手架见 `lib/page-shell.js`）。
 */
function renderPlansPage(planStore, indexHtml, context = {}) {
  const prefix = '../../'; // /plans/coding/ 是两层路由
  const parts = shell.loadShellParts(indexHtml, ROUTE_HREFS);

  // 【史述·已下架】v2.3 / v3.0：这一页当年**有专属订阅源**（套餐变化），要求在 `<head>` 里
  // 与根 Feed 并列声明它（而不是替换：读者既可以订全站优惠，也可以只订套餐变化）。
  // 订阅层整体下架后页面不再声明任何订阅源，`feedsForPage` 与那份声明一起删除 ——
  // 这一段现在不做任何订阅相关注入。

  const pageUrl = `${SITE_URL}${plansPage.PLANS_ROUTE}`;
  const plans = planStore.plans || [];
  const providerTable = context.providerTable || null;

  // JSON-LD：一段一个对象（塞成数组时自检读到的 @type 是 undefined，既不抛错也不命中）。
  const jsonLdBlocks = plansPage.plansJsonLd(plans, { siteUrl: SITE_URL, providerTable })
    .map(data => `<script type="application/ld+json">
${JSON.stringify(data, null, 2).split('\n').map(line => `  ${line}`).join('\n')}
</script>`).join('\n');

  const body = plansPage.plansPageBody(plans, {
    note: noteDeclarerFor(plansPage.PLANS_ROUTE),
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
  /* 保留窄阅读列（登记：scripts/data/narrow-reading-columns.json）——
     72ch 是阅读行宽，但它长在 ~1386px 宽的表格单元格里 ⇒ 必须按 DESIGN-RULES S4 居中，
     否则就是「另一页的内容贴在左边」的观感。居中与否由 verify-site.js §19 的几何断言判。 */
  .pdetailbody { max-width: 72ch; margin-inline: auto; }
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

  return shell.renderWidePageShell({
    kind: 'plans',
    route: plansPage.PLANS_ROUTE,
    prefix: prefix,
    parts,
    title: `${htmlEscape(plansPage.PLANS_HEADING)} · ${htmlEscape(SITE_NAME)}`,
    description: htmlEscape(plansPage.PLANS_DESCRIPTION),
    canonicalUrl: pageUrl,
    faviconHref: `${prefix}favicon.svg`,
    // 顺序与迁移前一致：本页静态表格原语在前，`css`（筛选/搜索/展开，由 plans-compare.js 驱动）在后。
    extraCss: `${PLANS_TABLE_CSS}\n${css}`,
    extraTailHtml: compareScript,
    jsonLdHtml: jsonLdBlocks,
    bodyHtml: body,
    where: 'renderPlansPage'
  });
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
  const parts = shell.loadShellParts(indexHtml, ROUTE_HREFS);

  const pageUrl = `${SITE_URL}${apiPlansPage.API_PLANS_ROUTE}`;
  const plans = apiStore.plans || [];
  const providerTable = context.providerTable || null;

  // 【史述·已下架】v3.0 Stage H4：这一页当年**有自己的订阅源**（API 价格变化），要求在 `<head>` 里
  // 声明它（与根 Feed 并列，而不是替换）；取法与 `/plans/coding/` 一致，都从注册表推导，
  // 不在模板里写死 spec id。订阅层下架后这里与 `/plans/coding/` 一样不再声明任何订阅源。

  const jsonLdBlocks = apiPlansPage.apiPlansJsonLd(plans, { siteUrl: SITE_URL, providerTable })
    .map(data => `<script type="application/ld+json">
${JSON.stringify(data, null, 2).split('\n').map(line => `  ${line}`).join('\n')}
</script>`).join('\n');

  const body = apiPlansPage.apiPlansPageBody(plans, {
    // 说明登记（notes-manifest-residual-v1）：这一页的每条 `.snote` 都在模块的构造点登记，
    // 入口在这里注入（与 lib/vendor-page.js 的 ctx.note 同形）。
    note: context.note || null,
    providerTable,
    historyStore: context.apiPlanHistoryStore || null,
    dealLinks: context.dealLinks || null,
    prefix
  });

  return shell.renderWidePageShell({
    kind: 'plans',
    route: apiPlansPage.API_PLANS_ROUTE,
    prefix: prefix,
    parts,
    title: `${htmlEscape(apiPlansPage.API_PLANS_HEADING)} · ${htmlEscape(SITE_NAME)}`,
    description: htmlEscape(apiPlansPage.API_PLANS_DESCRIPTION),
    canonicalUrl: pageUrl,
    faviconHref: `${prefix}favicon.svg`,
    logoCssHref: `${prefix}logos.css`,
    extraCss: `  /* 只用首页已有的设计变量，不新建一套视觉语言。 */
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
  }`,
    jsonLdHtml: jsonLdBlocks,
    bodyHtml: body,
    where: 'renderApiPlansPage'
  });
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
  const parts = shell.loadShellParts(indexHtml, ROUTE_HREFS);

  const pageUrl = `${SITE_URL}${plansHubPage.PLANS_HUB_ROUTE}`;
  const jsonLdBlocks = plansHubPage.plansHubJsonLd({ siteUrl: SITE_URL })
    .map(data => `<script type="application/ld+json">
${JSON.stringify(data, null, 2).split('\n').map(line => `  ${line}`).join('\n')}
</script>`).join('\n');
  const body = plansHubPage.renderPlansHubPage({ ...context, prefix, siteUrl: SITE_URL });

  return shell.renderWidePageShell({
    kind: 'plans-hub',
    route: plansHubPage.PLANS_HUB_ROUTE,
    prefix: prefix,
    parts,
    title: `${htmlEscape(plansHubPage.PLANS_HUB_HEADING)} · ${htmlEscape(SITE_NAME)}`,
    description: htmlEscape(plansHubPage.PLANS_HUB_DESCRIPTION),
    canonicalUrl: pageUrl,
    faviconHref: `${prefix}favicon.svg`,
    extraCss: `  /* 只用首页与两个对比页已有的设计变量，不新建一套视觉语言。 */
  .stop { display: flex; align-items: baseline; gap: var(--s2); flex-wrap: wrap; margin-bottom: var(--s2); }
  .stop h1 { font-size: 19px; margin: 0; }
  .stop .meta { color: var(--mut); font-size: var(--fs-sm); }
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
  .pchnone, .pchnote { color: var(--mut); font-size: var(--fs-sm); margin: var(--s1) 0 0; }`,
    jsonLdHtml: jsonLdBlocks,
    bodyHtml: body,
    where: 'renderPlansHubShell'
  });
}

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
function renderStaticPage({ kind, route, title, description, body, jsonLd, prefix, extraCss = '', mainClass }, indexHtml) {
  const parts = shell.loadShellParts(indexHtml, ROUTE_HREFS);
  const jsonLdHtml = jsonLd
    .map(data => `<script type="application/ld+json">
${JSON.stringify(data, null, 2).split('\n').map(line => `  ${line}`).join('\n')}
</script>`).join('\n');
  return shell.renderPageShell({
    kind,
    route,
    prefix,
    parts,
    title: `${htmlEscape(title)} · ${htmlEscape(SITE_NAME)}`,
    description: htmlEscape(description),
    canonicalUrl: `${SITE_URL}${route}`,
    faviconHref: `${prefix}favicon.svg`,
    // 这一族的表格原语 + 各页自己的追加样式（顺序与迁移前一致：族原语在前、页面追加在后）。
    extraCss: extraCss ? `${STATIC_PAGE_CSS}\n${extraCss}` : STATIC_PAGE_CSS,
    jsonLdHtml,
    bodyHtml: body,
    mainClass,
    where: `renderStaticPage/${route}`
  });
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
  /** 该页自身的绝对地址。按需求页在 `/need/<slug>/`，所以**不能**由 slug 直接拼站根地址 */
  const pageUrl = `${SITE_URL}${spec.route || `${spec.slug}/`}`;
  const parts = shell.loadShellParts(indexHtml, ROUTE_HREFS);

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
  const summaryHtml = summary.length
    ? `      <ul class="lsum" aria-label="当前数据摘要">
${summary.map(row => `        <li data-summary-label="${htmlEscape(row.label)}" data-summary-value="${htmlEscape(String(row.value))}"` +
    ` title="判据：${htmlEscape(row.source || '')}">` +
    `<span>${htmlEscape(row.label)}</span><b>${htmlEscape(String(row.value))}</b>${htmlEscape(row.unit || '')}</li>`).join('\n')}
      </ul>`
    : '';

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
     ⚠️ 这里也不许出现反引号，也不许写 .snote 规则（同上面那两条硬约束）。 */
  .chgtopic { margin: var(--s4) 0 0; border-top: 1px solid var(--line); padding-top: var(--s3); }
  .chgtopic-head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--s2); flex-wrap: wrap; }
  .chgtopic-head h2 { font-size: 15px; margin: 0; }
  .chgtopic-all { font-size: var(--fs-sm); }
  .chgtopic .chglist { list-style: none; margin: var(--s2) 0 0; padding: 0; display: grid; gap: 10px; }
  .chgtopic .chgh { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px var(--s2); font-size: var(--fs-sm); }
  .chgtopic .chgh time { color: var(--mut); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .chgtopic .chgh .chgt { color: var(--mut); }
  .chgtopic .chgv { display: flex; flex-wrap: wrap; gap: var(--s2); margin-top: 2px; font-size: var(--fs-sm); color: var(--mut); overflow-wrap: anywhere; }
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
${extraCss}`;
  return `${shell.docStart({
    kind,
    route: spec.route || `${spec.slug}/`,
    prefix,
    parts,
    title: `${htmlEscape(spec.heading)} · ${htmlEscape(SITE_NAME)}`,
    description: htmlEscape(spec.description),
    canonicalUrl: pageUrl,
    robots: isAlias ? 'noindex, follow' : 'index, follow, max-image-preview:large',
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
        <span class="meta">共 ${isHub ? childList.length : deals.length} ${isHub ? '个入口' : '条'} · 数据更新 ${htmlEscape(String(context.lastmod || ''))}</span>
      </div>
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
${notesHtml}${shell.docEnd({ route: spec.route || `${spec.slug}/`, prefix: prefix, parts, where: 'renderDirectoryPage' })}`;
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

  // 中文译文覆盖层：构建期贴一次，并把**贴好的**那份写进 dist/assets/data/offers.json。
  // 关键点——浏览器 fetch('assets/data/offers.json') 拿到的和下面预渲染用的是同一份对象，
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
    console.log(`  优惠 ↔ 套餐: ${dealLinksCheck.stats.links} 条当前关系 · 历史 ${dealLinksCheck.stats.retired} 条` +
      ` · 覆盖 ${dealLinksCheck.stats.plansWithCurrent}/${dealLinksCheck.stats.plans} 条套餐` +
      ` · 基准日 ${dealLinksAsOf || '未知'}` +
      (dealLinksCheck.stats.editorial ? ` · 人工判断 ${dealLinksCheck.stats.editorial} 条` : ''));
  }

  // t4：这里原先是 Feed 的 `feedBundle`（`feeds.buildFeeds()`：把三份日志与注册表翻译成
  // RSS 2.0 与 JSON Feed）。订阅子系统整体下架，这个 bundle 与它的全部消费者
  //（首页订阅发现注入、每页的 rel="alternate" 标签、Feed 落盘、/feeds/ 页面、订阅自检）
  // 一起删除。删掉它之后"页面声明的订阅源"这个概念在产物里不再存在 ——
  // 这也是 `lib/seo.js` 删掉 `feed-declared` 检查码的原因。

  // 首页数据资产（t3：`assets/data/offers.json`）。`dist/assets/` 本来不存在（仓库里的 `assets/`
  // 只有 `assets/logos/` 这个源目录），所以**必须先建目录**再写 —— 少了这一行就是 ENOENT。
  fs.mkdirSync(path.dirname(path.join(OUT, OFFERS_ARTIFACT)), { recursive: true });
  fs.writeFileSync(path.join(OUT, OFFERS_ARTIFACT), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
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
  // t4：这里原先是「订阅发现」（首页 <head> 里由 Feed 注册表现场生成 8 条 rel="alternate"）。
  // 订阅子系统整体下架之后首页不再声明任何 Feed，这个注入点与 index.html 里的标记一起删掉了。
  console.log(`  筛选条 / 汇总 / 分类选项 / 按需求入口 / 变化雷达: 已填充`);

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
  // 说明意图（notes-manifest-v1）：首页 `<main>` 里**一条** `.snote` 都没有（7 条在 `<main>`
  // 之外：详情模板与页脚那几处不在本清单的扫描面内），所以它的声明是「0 条」而不是跳过 ——
  // 「这一页不打算输出页面级说明」本身也是一个决定，漏登记会让它变成未纳管的页面。
  notePage('', { kind: 'home' });
  fs.writeFileSync(indexFile, shell.finalizePage(html, '', '', ROUTE_HREFS, 'index.html'), 'utf8');

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
    // ⚠️ 这里**不再给 topic 注入标题**（secondary-page-intro-changes-v1）：模块标题固定为
    // 「最近变化」。上一版注入的是 `「${spec.title}」最近的变化`，读者已经在那一页上，
    // 标题只是把页面名再念一遍（prompt §11）。
    const page = renderDirectoryPage(spec, matched, html, {
      lastmod, summary, topic, plan: PLAN, renderCore,
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
    dealLinks: dealLinksView
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
    ` · 重新出现 ${planRadarStats.totals.restored} · 元信息（不上块 / 不进订阅）${planRadarStats.totals.meta} · 最近变化块 ${planRadarStats.homeCount} 项`);

  // ---- v2.5：API / Token 计费对比页 ----------------------------------------------------
  const apiPlansDir = path.join(OUT, 'plans', 'api');
  fs.mkdirSync(apiPlansDir, { recursive: true });
  const apiPlansHtml = renderApiPlansPage(apiPlansStore, html, {
    note: noteDeclarerFor(apiPlansPage.API_PLANS_ROUTE),
    providerTable,
    apiPlanHistoryStore,
    dealLinks: dealLinksView,
    // v3.0 Stage H4：这一页要在 <head> 里声明自己那份订阅源 —— 从注册表取，不写死 id。
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
        description: `${modelsPage.modelNameOf(model)}（${model.developer || '开发者未标注'}）在本站收录的 API 计价条目、相关套餐、相关优惠与变化记录。本站只整理事实，不做推荐。`,
        body: modelsPage.renderModelPage(model, detailCtx),
        jsonLd: modelsPage.modelPageJsonLd(model, detailCtx),
        prefix,
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
        title: `${entry.title || entry.id} · ${archiveLib.ARCHIVE_HEADING}`,
        description: `${entry.title || entry.id} 的结束 / 恢复记录：首次发现、最后有效时间、结束发现时间、最后已知内容与变化时间线。资料失效不等于资料删除。`,
        body: archiveLib.renderArchiveEntry(entry, { prefix, siteUrl: SITE_URL }),
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
      // （notes-manifest-residual-v1 接管了构造点）。目前**一条 ended/restored 都没有**（这个循环不跑），
      // 一旦跑起来，登记会随渲染一起上场（漏登记即红）。
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
${plansHubUrl}
${modelsIndexUrl}
${archiveIndexUrl}
${plansUrl}
${apiPlansUrl}
${dealUrls}
${modelUrls}
${archiveDetailUrls}
</urlset>
`, 'utf8');

  // t4：订阅产物（25 个 Feed × 2 种格式）、厂商 Feed 的跳过/未登记警告、以及 /feeds/ 订阅中心
  // 页面本身，全部随订阅子系统整体下架一起删除。这一段的坏法从来不是「页面看起来不对」：
  // Feed 是**可下载的订阅产物**，页面只是它们的目录 —— 页面删了而文件还在，那道门就没人守了。
  // 现在这两件事由 lib/published-assets.js 的产物资产门禁兜底（feed* 一个都不许发布）。

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

  // 交给自检：折叠覆盖的条目总数需与页面卡片内容对得上；译文条数用于产物回读比对
  return Object.assign({}, rendered, {
    zhWithZh: zhAttached.report.withZh,
    healthSources: healthSummary.total,
    healthStatusText: healthSummary.rows.map(row => `${row.source}=${row.status}`).join(','),
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
    // 构建期真实生成的全部站内路由（含首页 '' 与刚才新增的 feeds/）——
    // Feed 里每一条站内链接都要能在这里找到，否则就是一条死链。
    pageRoutes: new Set([
      '',
      'status/',
      'changes/',
      plansHubPage.PLANS_HUB_ROUTE,
      plansPage.PLANS_ROUTE,
      apiPlansPage.API_PLANS_ROUTE,
      modelsPage.MODELS_INDEX_ROUTE,
      ...gatedModels.map(model => modelsPage.modelHrefOf(model)),
      archiveLib.ARCHIVE_INDEX_ROUTE,
      ...gatedArchiveEntries.map(entry => archiveLib.archiveEntryRoute(entry)),
      ...detailPages.map(page => `deal/${encodeURIComponent(page.id)}/`),
      ...directoryPages.map(page => page.route)
    ])
  });
}

/**
 * 把页面级说明的**意图清单**写到产物目录的**兄弟文件**（`<FINAL_OUT>.notes.ndjson`）。
 *
 * 时机：`main()` 里是 `assemble()` → `selfCheck()` → `promoteStaging()` **之后**（t3 调整过顺序）。
 * 理由：清单描述的是「这一份产物打算输出哪些说明」，所以它应当**跟着产物一起出现**。
 * 失效方式（这就是调整顺序的原因）：留在 `selfCheck()` 之前写 —— 一次失败的构建（说明对不上、
 * 或任何别的自检红）也会在仓库根留下一份「描述了一份从未就位的产物」的清单，
 * 接着跑 `verify-site --dir=<产物副本>` 的人会把这份陈旧清单当成意图侧，看到一堆无法解释的红。
 *
 * 与自检的关系：`noteManifestSelfCheck()` **不读这个文件**（它用内存里的 `noteIntent` +
 * 回读 `OUT` 的 HTML 做对账），所以把它放到 `selfCheck()` 之后不影响自检；真正读它的是
 * 独立进程的真浏览器门禁（`verify-site.js` §22c ⑨）。
 * 文件是 NDJSON（见本节开头「为什么不是 `.json`」），页按 route 排序 ⇒ 连续两次构建逐字节一致。
 */
function writeNotesManifest() {
  fs.mkdirSync(path.dirname(NOTES_MANIFEST_PATH), { recursive: true });
  fs.writeFileSync(NOTES_MANIFEST_PATH, notesManifestText(), 'utf8');
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

  /**
   * 变化日志的「发布面」自检（t29）。
   *
   * 可用 ⇒ `dist/<日志>` 与源文件**逐字节相同**（读者能下载到的那一份必须与真值一致）。
   * 不可用（缺失 / 解析失败）⇒ 断言产物就是**如实空账本**（`load()` 契约里的 `store`：
   * `startedAt: null`、0 事件、0 基线），**不是**整条跳过 —— 跳过就放过了「产物里凭空冒出一个日期」
   * 这种坏法，而那正是这一层要挡的。（口径与 deal-history 侧一致：那边由 `verifyStore` 的可用性分支守着。）
   */
  // t4：这里原先是 `checkPublishedLog()` —— 「产物里那份日志副本 == 源日志（或如实空账本）」的对账。
  // 日志副本不再发布（产物里不许有数据文件），这条断言随之删除：它与 L2 的 `check:plan-history` /
  // `check:api-plan-history` 判的是同一件事（源 ⇄ 派生），而那两条不依赖发布副本、更强。
  // 页面侧的口径一条都没放松：日志不可用时页面仍必须说「没有拿到日志」（见下面各页的断言）。

  /**
   * 两份变化日志在**自检**里的视图（t29）：与构建期那一次同一口径 ——
   * 不可用（缺失 / 解析失败）⇒ `null`，于是各模块走它们的「没有拿到日志」分支
   * （那条分支断言的是「页面必须说出没有拿到日志」，比计数对账更严）；可用 ⇒ 从 `dist/` 回读字节
   * （自检要查的正是**发布出去的那一份**）。直接解析 dist 里的如实空账本会得到一个 truthy
   * 但零事件的账本 ⇒ 模块以为日志可用，去要求一个本就不该存在的计数行 / 分栏。
   */
  const planLogSelf = planHistory.load();
  const apiPlanLogSelf = apiPlanHistory.load();
  // t4：原先这里读的是**产物里的那一份**日志副本（deal-history.json 等）。产物里不再有数据文件
  //（判据在 lib/published-assets.js），所以这里直接用构建期加载结果，语义完全一致：
  // 加载失败（缺失 / 损坏）⇒ null（模块走它的「没有拿到日志」分支，断言要求页面如实说出来）；
  // 加载成功 ⇒ 那份账本。两边的差别只有「读盘上副本还是内存对象」，而副本本来就是内存对象的序列化。
  const distLogView = (rel, load) => ((load.missing || load.broken) ? null : load.store);

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

  const payload = JSON.parse(fs.readFileSync(path.join(OUT, OFFERS_ARTIFACT), 'utf8'));
  console.log(`  ${OFFERS_ARTIFACT}: schemaVersion=${payload.schemaVersion}, count=${payload.count}, updatedAt=${payload.updatedAt}`);
  if (payload.schemaVersion !== 2) fail('schemaVersion 不是 2');
  if (payload.count !== payload.deals.length) fail('count 与 deals 长度不一致');

  // ---- v2.1：发布出去的那份 plans.json，必须与源文件逐字节相同 ----
  //
  // 与下面 deals 那一大段是**同一个理由**（发布数据 = 源 + 声明过的变换），
  // 但结论不同：plans 在发布链上**没有任何变换**（译文/派生字段都还不存在），
  // 所以这里断言的是最强的那一种 —— **逐字节相等**。
  // 一旦将来要在构建期给它注入派生字段（比如 provider 显示名），这条断言会立刻变红，
  // 逼人把「注入什么」写下来 —— 那正是它该干的事。
  // t4：这里原先断言「产物里的 plans.json 与源文件逐字节相同」。产物里不再发布这份数据集，
  // 那条断言随之删除 —— 替代者是既有的 L2 门禁 `check:plans:reproducible`（判「源 ⇄ 派生」，
  // 不依赖发布副本）。**页面与数据的对账一条都没少**：下面仍从内存 store 回读页面逐项比对。
  {

    // v2.3：套餐变化日志同样**逐字节**发布（读者能下载到的那一份必须与真值一致）。
    // 可用 / 不可用两种口径见 `selfCheck` 顶部的 `checkPublishedLog()`（t29：日志不可用时
    // 断言「产物就是如实空账本」，而不是整条跳过）。

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
      const diskPlans = JSON.parse(fs.readFileSync(path.join(ROOT, 'plans.json'), 'utf8'));
      const diskTable = providers.load().table;
      const diskHtml = fs.readFileSync(plansPageFile, 'utf8');
      // t29：变化日志的**自检视图**与构建期那一次同一口径（不可用 ⇒ null ⇒ 模块走它的
      // 「没有拿到日志」分支，那条分支断言的是「页面必须说出没有拿到」——比计数对账更严）。
      // 直接解析 dist 里的如实空账本会得到一个 truthy 但零事件的账本 ⇒ 模块以为日志可用，
      // 去要求一个本就不该存在的计数行/分栏。
      const diskPlanHistory = distLogView('plan-history.json', planLogSelf);
      const pageProblems = [
        ...plansPage.assertPageHonesty(diskHtml, diskPlans.plans, {
          providerTable: diskTable,
          // v2.3：从磁盘回读时同样带上变化视图与日志 —— 最近变化块与详情时间线
          // 是这一页新增的事实面，不给它们断言等于「盘上少了也看不出来」。
          planChanges: built.planRadar,
          planHistoryStore: diskPlanHistory
        }),
        ...plansPage.assertDataHonesty(diskPlans.plans),
        ...(diskPlanHistory === null ? [] : plansPage.assertHistoryHonesty(diskPlans.plans, diskPlanHistory))
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
  // t4：同 plans：产物里不再发布 api-plans.json，「发布副本 == 源」那条断言删除
  //（替代者是 L2 的 `check:api-plans:reproducible`）。页面与内存 store 的对账保留。
  {

    // v2.5：API 计费变化日志同样逐字节发布 —— 可用/不可用两种口径与上面 `plan-history.json` 同一把尺子。

    // API 计费页：**从磁盘回读**再跑一遍诚实性断言（与套餐页同一个理由）。
    const apiPlansPageFile = path.join(OUT, apiPlansPage.API_PLANS_ROUTE, 'index.html');
    if (!fs.existsSync(apiPlansPageFile)) fail(`缺少 ${apiPlansPage.API_PLANS_ROUTE}index.html`);
    else {
      const diskApiPlans = JSON.parse(fs.readFileSync(path.join(ROOT, 'api-plans.json'), 'utf8'));
      const diskApiHistory = distLogView('api-plan-history.json', apiPlanLogSelf);
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
      const diskPlans = JSON.parse(fs.readFileSync(path.join(ROOT, 'plans.json'), 'utf8'));
      const diskApiPlans = JSON.parse(fs.readFileSync(path.join(ROOT, 'api-plans.json'), 'utf8'));
      const diskPlanHistory = distLogView('plan-history.json', planLogSelf);
      const diskApiPlanHistory = distLogView('api-plan-history.json', apiPlanLogSelf);
      const pageProblems = plansHubPage.assertPageHonesty(diskHtml, {
        plans: diskPlans.plans,
        apiPlans: diskApiPlans.plans,
        providerTable: providers.load().table,
        planHistoryStore: diskPlanHistory,
        apiPlanHistoryStore: diskApiPlanHistory,
        dealLinks: built.dealLinksDoc,
        deals: JSON.parse(fs.readFileSync(path.join(OUT, OFFERS_ARTIFACT), 'utf8')).deals,
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

  // ---- v3.0 Stage D5/D6：模型页（页面从磁盘回读；真值按 D1 读仓库根）-------------
  //
  // 与两个对比页 / 资料入口同一条纪律：读者拿到的是盘上的字节 —— 所以**页面 HTML**
  // （`dist/models/index.html`）仍然从盘上回读。
  //
  // ⚠️ 别照旧注释理解取数来源：t4 / 决策 D1 已把**真值来源从产物移到仓库根**。
  //   · 那五份数据文件（models.json / model-registry-links.json / api-plans.json /
  //     plans.json / deal-plan-links.json）**已随本轮整体下架**，产物里根本没有 `dist/*.json` 可读；
  //   · 所以下面取的是 `path.join(ROOT, …)`（关系表真值在 `scripts/data/deal-plan-links.json`）；
  //   · 唯一的例外是 `dealLinks`：它只存在于构建期，`const diskDealLinks = built.dealLinksDoc;`
  //     用的**正是内存对象** —— 那不是"漏改成读盘"，是 D1 之后唯一还成立的取法。
  {
    const modelsIndexFile = path.join(OUT, modelsPage.MODELS_INDEX_ROUTE, 'index.html');
    if (!fs.existsSync(modelsIndexFile)) fail(`缺少 ${modelsPage.MODELS_INDEX_ROUTE}index.html`);
    else {
      const diskIndexHtml = fs.readFileSync(modelsIndexFile, 'utf8');
      const diskModels = JSON.parse(fs.readFileSync(path.join(ROOT, 'models.json'), 'utf8'));
      const diskLinks = JSON.parse(fs.readFileSync(path.join(ROOT, 'model-registry-links.json'), 'utf8'));
      const diskApiPlans = JSON.parse(fs.readFileSync(path.join(ROOT, 'api-plans.json'), 'utf8'));
      const diskPlans = JSON.parse(fs.readFileSync(path.join(ROOT, 'plans.json'), 'utf8'));
      const diskDeals = JSON.parse(fs.readFileSync(path.join(OUT, OFFERS_ARTIFACT), 'utf8'));
      const diskDealLinks = built.dealLinksDoc;
      const diskApiHistory = distLogView('api-plan-history.json', apiPlanLogSelf);
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

  // ---- v3.0 Stage F：历史档案（索引页从磁盘回读 + 账本重算）----------------------
  //
  // 三条牙的构建期落点：
  //   · #9  归档只依赖事件：**只喂 events**（故意不喂 anomalies / records）再重算一遍
  //         （`assertEntrySetStable`），条目集合必须逐条不变 —— 它证明条目集合只由事件推出。
  //         ⚠️ t4：产物里不再有数据文件，两侧输入现在都是**构建期账本**
  //         （`built.historyStore` / `built.planHistoryLoad` / `built.apiPlanHistoryLoad`），
  //         不再是"盘上的日志"；盘上仍读的是索引页 HTML。
  //   · #10 大批 ended：可疑标记与异常留档必须同时在（`assertArchiveIntegrity`）；
  //   · #11 ended→restored 之后状态必须是 restored（同样由 integrity 重推比对）。
  // 再加上：索引页三组齐、sitemap 成员 == 过门槛的详情页、不为历史 event 建页。
  {
    const archiveIndexFile = path.join(OUT, archiveLib.ARCHIVE_INDEX_ROUTE, 'index.html');
    if (!fs.existsSync(archiveIndexFile)) fail(`缺少 ${archiveLib.ARCHIVE_INDEX_ROUTE}index.html`);
    else {
      const diskHtml = fs.readFileSync(archiveIndexFile, 'utf8');
      const diskStores = {
        // t4：原先从产物回读这三份日志，现在直接用构建期账本（产物里不再有数据文件）。
        deal: built.historyStore.store,
        plan: built.planHistoryLoad.store,
        api: built.apiPlanHistoryLoad.store
      };
      const diskRecords = {
        deal: JSON.parse(fs.readFileSync(path.join(OUT, OFFERS_ARTIFACT), 'utf8')).deals,
        plan: built.plansStore.plans,
        api: built.apiPlansStore.plans
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

  // ---- t4：产物资产门禁（替代原「数据出口」闭环）--------------------------------
  //
  // 原先是数据出口的三条牙（文档里的 endpoint 存在 / schemaVersion 与真实数据一致 /
  // Manifest 条数与真实数据集数一致），随数据出口子系统下架一起删除。新的闭环更窄也更硬：
  // **产物里不许有数据文件**，只允许 `lib/published-assets.js` 里逐条写明理由的那一份
  //（首页应用自己的 `assets/data/offers.json`）。
  //
  // 为什么这条不能省：一个静态站会悄悄长出新数据文件（新增一份 JSON 导出、某处顺手写盘），
  // 而「多了一份没人知道的数据」从来不会自己变红 —— 它只会在某天被人从浏览器里下载走。
  // 三条纪律（空输入不许判绿 / 豁免逐路径写清不许通配 / 失败点名路径）写在那个模块里。
  {
    const problems = publishedAssets.assertNoPublishedData(OUT);
    if (problems.length) fail(`产物资产门禁未通过（${problems.length} 处）：${problems.slice(0, 3).join('；')}`);
    else {
      const summary = publishedAssets.summarizePublishedFiles(OUT);
      console.log(`  ✓ 产物资产: ${summary.total} 个文件（页面 ${summary.pages} / 非页面 ${summary.nonPages}`
        + ` · 数据资源 ${summary.data} 份 —— 只有首页那一份）· 无未登记文件 · 无 *.ndjson · 无订阅产物`);
    }
  }

  // ---- v2.4：优惠 ↔ 套餐关系（从磁盘回读对账）--------------------------------
  //
  // 这一层的坏法全都是「页面看起来正常」：注入漏了 → 有关系的那几条优惠页少一块；
  // 注入的是上一次的关系 → 页面显示一条谁也没确认过的关联；套餐页的块与视图不同步 →
  // 「当前优惠」与「暂无当前优惠」对不上。所以这里读回磁盘，对账三份东西：
  //   ① `dist/assets/data/offers.json` 的 `relatedPlans` 必须等于用关系表**重算**的结果（逐字段）；
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

    // ① dist/assets/data/offers.json 的注入
    const published = JSON.parse(fs.readFileSync(path.join(OUT, OFFERS_ARTIFACT), 'utf8'));
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
    // t4：原先这里回读 `dist/deal-plan-links.json` 并与源表推导值对账。产物里不再发布这份数据集，
    // 这条对账随之删除 —— 关系表本身的对账仍在上面（① 注入到 offers.json 的 relatedPlans 逐字段重算）
    // 与 L2 的 `selftest:deal-plan-links` + `check:reproducible`（它们判源 ⇄ 派生，不依赖发布副本）。

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
  // 为什么必须有：`dist/assets/data/offers.json` 是**发布出去的那一份** —— 浏览器 fetch 的是它，
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
    if (problems.length) fail(`源 deals.json 与发布产物 ${OFFERS_ARTIFACT} 不一致：${problems.slice(0, 8).join('；')}`);
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
    const doc = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'data', 'source-health.json'), 'utf8'));
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

      const distLogPath = path.join(ROOT, 'scripts', 'data', 'deal-history.json');
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

    // ③ /changes/ 页：四条约定（预渲染 / 无 JS 可读 / sitemap / JSON-LD）——
    //    原来的第五条「双 feed」已随订阅层下架删除（下面紧邻处写明了它为什么失去对象）。
    if (!fs.existsSync(pageFile)) {
      problems.push('缺少 changes/index.html');
    } else {
      const page = fs.readFileSync(pageFile, 'utf8');
      const noScript = page.replace(/<script[\s\S]*?<\/script>/gi, '');
      if (!page.includes(`<link rel="canonical" href="${SITE_URL}changes/">`)) problems.push('changes/ 的 canonical 不是自指');
      // t4：这里原先断言 /changes/ 声明了「变化」订阅源（feed/changes.xml|json）。订阅子系统整体下架、
      // 产物里不再有 Feed（判据在 lib/published-assets.js），这条断言失去了对象，随之删除。
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
      // 分栏标题与总数必须来自权威表（标题在 CHANGES_SECTION，条数在 totals）。
      // ⚠️ 历史日志**不可用**时页面按纪律不渲染分栏、改说「没有拿到历史日志」——
      //    那种情况下这一组断言换成对「不可用文案」的断言（那一句本身在 ⑥ 里另有渲染器级的牙）。
      const historyLogUnavailable = Boolean((built.logAvailability || [])
        .find(item => item.id === 'deal-history' && item.availability !== 'ok'));
      if (historyLogUnavailable) {
        if (!noScript.includes(W.CHANGES_NOTES.unavailable)) {
          problems.push('changes/ 在历史日志不可用时没有明说「没有拿到历史日志」');
        }
        // ⚠️ 只查**优惠雷达自己的分栏**（`<section class="chgsec" id="<key>">`）：
        //    套餐 / API 那两块有各自的日志，它们的「今日新增（n）」子标题与这一条无关。
        const ownSections = SECTION_KEYS
          .filter(key => new RegExp(`<section class="chgsec" id="${key}"`).test(noScript));
        if (ownSections.length) {
          problems.push(`changes/ 在历史日志不可用时仍渲染了优惠雷达的分栏（${ownSections.join(', ')}）——`
            + '会把「没有拿到日志」伪装成「没有变化」');
        }
      } else {
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
      // t4：这里原先断言 /changes/ 声明了「套餐变化」订阅源（feed/plans/coding/changes.*）。
      // 订阅子系统整体下架、页面不再声明任何 Feed，这条断言随之删除（判据改由产物资产门禁兜底：
      // 只要产物里还剩一个 feed 前缀的文件，lib/published-assets.js 就当场红）。
      if (!noScript.includes(planW.PLAN_CHANGES_LABELS.sectionTitle)) problems.push('changes/ 缺少「套餐变化」分栏标题');
      const planBlock = (noScript.match(/<section class="chgsec pchanges" id="plans">[\s\S]*?<\/section>/) || [])[0] || '';
      if (!planBlock) problems.push('changes/ 缺少套餐变化块');
      else if (built.planRadar.availability !== 'ok') {
        // t29：套餐变化日志**不可用**时，这一块按纪律只留那一句「没有拿到日志」——
        // 「不可用」与「没有变化」不许混为一谈（t4/t7 的 e2 口径：不可用时整块不渲染分栏）。
        // 所以这里判的是**相反方向**：分栏标题与变化行一个都不许出现，而那句说明必须出现。
        if (!planBlock.includes(planW.PLAN_CHANGES_LABELS.unavailable)) {
          problems.push('套餐变化日志不可用时没有说清「没有拿到日志」');
        }
        for (const key of planChanges.PLAN_CHANGES_SECTION_ORDER) {
          const label = planW.PLAN_CHANGES_SECTION[key];
          if (planBlock.includes(label)) problems.push(`套餐变化日志不可用，却出现了分栏「${label}」`);
        }
        if (/<li>/.test(planBlock)) problems.push('套餐变化日志不可用，却列出了变化行');
      } else {
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
          plansById: new Map(built.plansStore.plans.map(p => [p.id, p])),
          providerTable: providers.load().table
        };
        for (const item of planChanges.itemsOf(built.planRadar)) {
          const sentence = plansPage.escapeHtml(plansPage.planChangeTextOf(item, planSentenceOpts));
          if (!planBlock.includes(sentence)) problems.push(`套餐变化块缺少一条变化：「${sentence}」`);
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
      // t4：同上一处：这一页原先还断言声明了「API 价格变化」订阅源，随订阅层一起删除。
      // 「三条变化流都能从导航直达」那一条断言（上面 #deals / #plans / #api-plans 锚点）**保留** ——
      // 它判的是页面自己能不能被读者读懂，与订阅无关。
      if (!noScript.includes(apiW.API_PLAN_CHANGES_LABELS.sectionTitle)) {
        problems.push('changes/ 缺少「API 价格变化」分栏标题');
      }
      const apiBlock = (noScript.match(/<section class="chgsec apichanges" id="api-plans">[\s\S]*?<\/section>/) || [])[0] || '';
      if (!apiBlock) problems.push('changes/ 缺少 API 价格变化块');
      else if (built.apiPlanRadar.availability !== 'ok') {
        // t29：与套餐那一块同一口径 —— 日志不可用 ⇒ 只留「没有拿到日志」那一句，
        // 分栏标题与变化行一个都不许出现（不可用 ≠ 没有变化）。
        if (!apiBlock.includes(apiW.API_PLAN_CHANGES_LABELS.unavailable)) {
          problems.push('API 计费变化日志不可用时没有说清「没有拿到日志」');
        }
        for (const key of planChanges.PLAN_CHANGES_SECTION_ORDER) {
          const label = apiW.API_PLAN_CHANGES_SECTION[key];
          if (apiBlock.includes(label)) problems.push(`API 计费变化日志不可用，却出现了分栏「${label}」`);
        }
        if (/<li>/.test(apiBlock)) problems.push('API 计费变化日志不可用，却列出了变化行');
      } else {
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
    const doc = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'data', 'source-health.json'), 'utf8'));
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
    // t3：这里原先断言「状态页必须指向 source-health.json」。那条链接与它的断言**一起删** ——
    // 链接指向的是一份数据文件，而本轮的目标正是让产物里不再有可下载的数据文件、读者面也不再
    // 提它们。留着断言就等于强制一个谁都不想要的链接（那是"为了绿而绿"，比没有断言更糟）。
    // 注意：**数据侧**的对账（读产物里的 source-health.json、逐来源比对状态标签与行数）一条都没动 ——
    // 这一页仍然被断言"页面上的每个状态都真的等于数据里的状态"。

    // ── 五条既有约定：这一页原先只满足两条（预渲染、无 JS 可读）────────────────
    //
    // 为什么必须在这里断言：sitemap / feed / JSON-LD 三条当时根本没做，而
    // **没有任何东西会因此变红** —— 连 `verify-site.js` 都 0 处覆盖（子代理核查结论）。
    // 一条「写漏了不会红」的约定等于没有这条约定：它靠记性维持，而记性不随构建变红。
    // 分类页那三条能站住，靠的就是这一段形状的自检 + 浏览器侧各一条断言。
    if (!page.includes(`<link rel="canonical" href="${SITE_URL}status/">`)) problems.push('canonical 不是自指');
      // t4：这里原先有两条订阅声明断言（每页必须声明两个根 Feed / 有专属 Feed 的页面必须声明它）。
      // 订阅子系统整体下架之后页面不再声明任何 Feed，这两条一起删除。
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
      // t4：措辞同步 —— 这一页原先还声明两个根 Feed，那两条约定随订阅层一起撤了；
      // 现在仍然逐条查的是 sitemap 成员、自指 canonical、JSON-LD 与预渲染正文长度。
      ` · 约定齐（sitemap/canonical/JSON-LD ${statusLd.length} 段/预渲染 ${statusText.length} 字）`);
  }

  // 译文必须真的落到产物里：浏览器 fetch('assets/data/offers.json') 拿的就是这一份，
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
      // t4：订阅中心（feeds/index.html）已随订阅子系统下架删除，不再进这张逐层扫描表。
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
    // 为什么要有这条：`audience.js` 的页面说明与状态页/分类页的正文都曾把强调写成 `**这样**`、
    // 把字段名写成 `` `这样` ``，于是 **16 个 `**` 与 14 个反引号原样出现在读者眼前**
    // （独立验证代理在 4 类页面上数出来的），而没有任何门禁会因此变红。
    // 更糟的是「预渲染正文过短」那条长度断言还把星号当成内容算进去了 ——
    // 一条在数自己造成的排版噪声的守卫。
    //
    // 扫描面刻意收在**作者写的容器**里，而不是整页文本：
    // 采集来的文案（标题 / discountInfo）里出现 `**` 或反引号是**数据**，不是我们的排版错误；
    // 拿它判红会变成一条「在正常数据上失败」的守卫，而那比没有守卫更糟。
    //
    // ## 扫描面在 secondary-page-content-simplification 扩过一次（含一次真实漏网）
    //
    // 原先只有 `.snote` / `<caption>`。实测漏掉了 `.vsnote`：`vendor-page.js` 的
    // changesBlock 直接写了 `**套餐变化日志**` 且没过 `rich()`，于是**25 个厂商页**
    // 上读者看到的是字面星号，而构建全绿（2026-08 那版守卫的扫描面就是这里写的那两个）。
    // 同一次扩面还收进了 `<details>`：本轮把底部说明搬进折叠块，
    // 而那是个**非贪婪 `<p class="snote">…</p>` 正则**根本照不到的新容器 ——
    // 「搬个位置就静默失去覆盖」正是这条守卫最该防的失效方式。
    // ⚠️ 两个 `.snote` 文本容器用 **class token 级**匹配（`\bsnote\b` / `\bvsnote\b`），
    // 不用 `class="snote"` 这种精确串：后者对 `<p class="snote aliasnote">`（历史上）
    // 与 `<p class="snote mcount">`（`/models/` 里现在真实存在的多 class 形状）**一条都照不到**。
    // 「换个类名就静默失去覆盖」与本文件反复记录的那次 `.vsnote` 漏网是同一类失效。
    const PROSE_PATTERNS = [
      /<p\b[^>]*\bclass="[^"]*\bsnote\b[^"]*"[^>]*>([\s\S]*?)<\/p>/g,
      /<p\b[^>]*\bclass="[^"]*\bvsnote\b[^"]*"[^>]*>([\s\S]*?)<\/p>/g,
      /<caption>([\s\S]*?)<\/caption>/g,
      /<details\b[^>]*>([\s\S]*?)<\/details>/g
    ];
    const mdMarkers = [];
    for (const [rel] of routeOutputs) {
      const file = path.join(OUT, rel);
      if (!fs.existsSync(file)) continue;
      const page = fs.readFileSync(file, 'utf8');
      const prose = PROSE_PATTERNS
        .flatMap(re => [...page.matchAll(re)].map(m => m[1]))
        .map(chunk => chunk.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
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
      console.log('  ✓ 作者正文无 Markdown 记号: .snote / .vsnote / <caption> / <details> 里的强调一律用 <b>，字段名直接写');
    }

    // ---- 说明的**机器无关性**（t4 重挂：见 `lib/changes.js` 的头部注释）----------------
    //
    // 为什么这条还在：三份日志的页面措辞（`changes.js` / `plan-changes.js` / `api-plan-history.js`
    // 的 CHANGES_NOTES，以及 plans-hub / models / vendor / archive 各自的「没有拿到日志」句）
    // 全是**静态字面量**。Dataset Manifest 下架之后，那个「说明里不许出现宿主绝对路径」的不变量
    // 只剩这一处承重面 —— 判据不能零 owner。
    //
    // 判据：页面文本里出现「没有拿到」时，那段文本必须**机器无关**（没有盘符 / UNC / POSIX 绝对路径 /
    // 家目录记号）。红的时候点名 route 与命中的形状名，因为那种红的原因（谁把 `path.join(__dirname, …)`
    // 拼进了页面）离症状很远。
    const machineDependent = [];
    for (const [rel] of routeOutputs) {
      const file = path.join(OUT, rel);
      if (!fs.existsSync(file)) continue;
      const text = prerenderedText(fs.readFileSync(file, 'utf8'));
      if (!text.includes('没有拿到')) continue;
      for (const shape of changes.machineDependenceProblems(text)) {
        machineDependent.push(`${rel}（${shape}）`);
      }
    }
    if (machineDependent.length) {
      fail(`页面上的「没有拿到」说明里含机器相关形状（跨机器不可复现、且会把宿主目录发布出去）：${machineDependent.slice(0, 4).join('；')}`);
    } else {
      console.log('  ✓ 说明机器无关性: 出现「没有拿到」的页面里没有宿主机绝对路径 / UNC / 家目录记号');
    }

    // 首屏说明**必须为空** —— secondary-page-intro-changes-v1 的主牙（**含一次真实盲区的修复**）。
    //
    // 为什么要有它：二级数据页首屏的任务是「有哪些优惠」。上一轮把三段口径删到「0~1 句」，
    // 而实测那 0~1 句在 **41 个页面**上各占至少一行，读者不看也照样能用这一页 —— 于是整层删除
    // （`userIntro` 字段与渲染路径一起删）。这条断言守的是**删掉之后不许回流**：再有人往注册表
    // 加一个 `userIntro`、或在模板里插一段顶部说明，构建当场红。注册表级还有一条
    // （`audience-selftest` §9），两层各管一半 —— 产物层这条连 `/vendor/<slug>/` 那种
    // **算出来的**文案（26 页）也照得到。
    //
    // ## 判据边界
    //
    //   · 扫描面**只限 intro 区** —— `.cstop` 结束到第一个数据区（`.lsum` / 表格容器）之间；
    //     表格里的「为什么在这一页」列、底部折叠说明、页脚都不在其中（那三处本来就该有字）。
    //   · **没有例外**（`secondary-page-residue-v1` 起）：上一版给别名页开了口子
    //     （`ALIAS_NOTE_ROUTES` / 恰好 1 条 `.aliasnote`），本轮把那条 `.aliasnote` 整条删除、
    //     口子一并退役。上面的理由（「导航更正」「读者必须知道自己在哪」）被实测推翻，
    //     详见 `renderDirectoryPage` 顶部那段说明块。**别名页现在与其它目录页走同一条判据**：
    //     intro 区 `.snote` 必须 **0 条**，多一条即红 —— 没有名单可绕。
    //   · 类名匹配是 **class token 级**的（`\bsnote\b`）。上一版用的是 `class="snote"` 精确串，
    //     于是 `<p class="snote aliasnote">` **一条都照不到**：别名页那句里的内部措辞
    //     （`benefitType`）从来没被这条守卫看见过。本轮实测出这个盲区并修掉
    //     （`changes-selftest` 里有正反例探针：旧正则 0 命中 / 新 matcher 必命中）。
    //     ⚠️ 这条 matcher **逐字保留**，不许改回精确串 —— `class="snote mcount"`（`/models/` 里
    //     真实存在）这类多 class 形状照样要靠它才照得到。
    //   · `判据` **不在禁词表里**：它同时是业务语义（例如 `/models/` 的导语），
    //     机械禁掉会变成一条在正常文案上失败的守卫 —— 那比没有守卫更糟。
    //   · 误报的处置是**改文案**或往 ALLOW 里登记理由，不是把词从表里删掉。
    const INTRO_INTERNAL_TERMS = [
      '数据模型', 'benefitType', 'predicate', 'collections', '关键词扫描', '映射表', '字段', '归一规则'
    ];
    // 逐条登记的白名单（空 = 当前没有例外）。键是 `路由|词`，值是「为什么这里是业务语义」。
    const INTRO_TERM_ALLOW = new Set([]);
    // class token 级匹配 —— `\bsnote\b` 既能命中 `class="snote aliasnote"`（历史上）与
    // `class="snote mcount"`（现在真实存在的多 class 形状），又不会误命中 `class="vsnote"`
    // （`v` 与 `s` 之间没有词边界）。
    // 同一个 matcher 也用在上面那段 Markdown 记号扫描里（同一次盲区修复）。
    const INTRO_SNOTE_RE = /<p\b[^>]*\bclass="[^"]*\bsnote\b[^"]*"[^>]*>([\s\S]*?)<\/p>/g;
    // 题注形状（本轮新增的第三颗牙）：目录页家族的 `<caption>` 只允许两种逐字形状
    // —— `共 N 条。`（目录页，含别名页）与 `共 N 个入口。`（枢纽页，它没有条目表）。
    // 判定用**整串**匹配（不是 `includes`）：多一个字、少一个句号、换了破折号都算红。
    //
    // ⚠️ 判据是**条件式**的，不许改成「每题注都必须存在」（captain 独立裁定，2026-10-09）：
    //    `<caption>` 在任何浏览器里都**不渲染**（对读者零可见价值、也零干扰），
    //    而它有真实的 **a11y 价值**（表格的可访问名）。所以：
    //      · 题注**存在** ⇒ 渲染文本必须逐字匹配这个形状（长题注回流即红）；
    //      · 题注**不存在** ⇒ 只有在**这一页根本没有主表**时才算合法。
    //    「有表却把题注整条删掉」不是合法删除，是结构缺失 ⇒ 红（见下面 EXPECT_RE 的用法）。
    //    边界必须说清：这条牙**证不了**「别名页题注 == 非别名页题注」（两侧跑同一条规则），
    //    它证的是「存在的那些题注形状合规，且该有的地方没缺」。
    //
    // ## 反空洞守卫：**按产物现算**，不用绝对常量（对抗复核 F1 的第二半）
    //
    // 上一版是 `INTRO_CAPTION_MIN_SCANNED = 20` 这样的绝对门槛。它的失效不是「写错数」，
    // 而是**形态本身错**：门槛与「产物里应该有多少条题注」没有任何联系，于是
    // `captionScanned` 只要还 ≥ 20，**任意多页的题注都可以不被判形状**而构建全绿
    // （T4 沙箱 P6b/P6c/P6d 实测：45 页里改掉 3 页的标记即可静默，改满 25 页才会红）。
    // 现在的判据是 `captionScanned === captionExpected`，其中 `captionExpected`
    // 由产物现算（目录页家族里含主表的页数）⇒ 少扫到一页就红，不存在可退化的区间。
    const INTRO_CAPTION_RE = /^共 \d+ (?:条|个入口)。$/;
    // 题注标签：**容错属性**（`<caption>` / `<caption class="legacy">` 都算），见下面那条注释。
    const INTRO_CAPTION_TAG_RE = /<caption[^>]*>([\s\S]*?)<\/caption>/g;
    // 「这一页有主表」的判据 —— `.ctable-wrap` 是目录页的表格容器。
    // 只用它判「有表却没题注」，**不用它要求每页都有表**。
    const INTRO_CAPTION_EXPECT_RE = /<div class="ctable-wrap"|<table[\s>]/;
    const introProblems = [];
    const introHits = [];
    const captionProblems = [];
    let captionScanned = 0;
    // 「应有题注」的**现算**值：目录页家族里含主表的页数。与 `captionScanned` 逐页相等才算过。
    let captionExpected = 0;
    const directoryRoutes = new Set(built.directoryPages.map(page => page.route));
    for (const page of built.directoryPages) {
      const file = path.join(OUT, `${page.route}index.html`);
      if (!fs.existsSync(file)) continue;
      const html = fs.readFileSync(file, 'utf8').replace(/<script[\s\S]*?<\/script>/gi, '');
      const mainStart = html.indexOf('<main');
      const cstopEnd = html.indexOf('</div>', html.indexOf('class="cstop"', mainStart));
      if (mainStart < 0 || cstopEnd < 0) continue;
      // intro 区 = .cstop 之后 → 第一个数据区之前。三个锚点谁先出现就用谁。
      const anchors = ['<ul class="lsum"', '<div class="ctable-wrap"', '<table']
        .map(anchor => html.indexOf(anchor, cstopEnd))
        .filter(index => index > 0);
      const introEnd = anchors.length ? Math.min(...anchors) : html.length;
      const introRegion = html.slice(cstopEnd, introEnd);
      const notes = [...introRegion.matchAll(INTRO_SNOTE_RE)].map(m => ({
        classes: (m[0].match(/class="([^"]*)"/) || ['', ''])[1].split(/\s+/).filter(Boolean),
        text: m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      })).filter(note => note.text);
      // ---- 牙 3：目录页家族（含别名页）的题注只允许「共 N 条。」/「共 N 个入口。」形状 ----
      // 题注取自 `.cstop` 之后的**整段文档**，不限于 intro 区：`<caption>` 是 `<table>` 的第一个
      // 子元素，而表格容器（`<div class="ctable-wrap"`）落在它**之前** ⇒ intro 区自己不含题注
      // （第一版把题注也塞进 intro 区里找，实测扫到 0 条 ⇒ 反空洞守卫当场把构建判红，
      // 这正是那条守卫存在的意义）。改成整段查找之后，属性写法与容器顺序都不再影响命中。
      // ⚠️ 取**第一条**题注判形状，但**多余条数单独判红**（多于一条 = 结构可疑，不许「取第一条了事」）。
      // 判据是**整串**逐字匹配，不是 `includes`。
      //
      // ⚠️ 判据边界（不许把这条牙说成比它实际更强的东西）：它**证不了**
      //    「别名页题注 == 非别名页题注」—— 两侧跑的是同一条规则、同一次扫描，
      //    别名页只是「目录页家族」这个集合里的一个元素，这条牙对任何一个元素一视同仁。
      //    「别名页确实走了 caption 的同一条分支」由**源码形状**（`const caption` 那一支里
      //    已经没有任何 kind 分叉）与 diff 保证。这条牙真正回答的是另一个问题：
      //    「有没有哪一页的题注悄悄长出第三种形状（长题注回流 / 换个说法）」。
      // ⚠️ **必须容错标签属性**（`secondary-page-residue-v1` · 对抗复核 F1）。
      //    第一版写的是 `/<caption>([\s\S]*?)<\/caption>/` —— 只认**无属性**标签。
      //    实测旁路（T4 沙箱 P6b）：把 3 个别名页的题注改成 `<caption class="legacy">`
      //    并注回 57 字长题注 ⇒ `npm run build` **exit 0**，读数还是「42 条逐字匹配」——
      //    那 3 页从扫描面里**消失**了，而不是被判红。只改标记不改内容（P6c）同样静默丢覆盖。
      //    这与「改个类名就隐形」是同一类失效（`.vsnote` / `class="snote"` 精确串都栽过），
      //    所以这里用 `<caption[^>]*>`，并且**允许多条**：多于一条即单独判红，不许「取第一条了事」。
      const hasMainTable = INTRO_CAPTION_EXPECT_RE.test(html.slice(cstopEnd));
      const captions = [...html.slice(cstopEnd).matchAll(INTRO_CAPTION_TAG_RE)];
      // 「应有题注」= 有主表的那些页 —— **从产物现算**，所以它天然跟着页面结构走，
      // 不像绝对常量那样留下「不判也绿」的区间。
      if (hasMainTable) captionExpected += 1;
      if (captions.length > 1) {
        captionProblems.push(`${page.route || '/'} 有 ${captions.length} 条 <caption> —— 主表只允许一条题注`);
      }
      if (captions.length) {
        captionScanned += 1;
        const captionText = captions[0][1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (!INTRO_CAPTION_RE.test(captionText)) {
          captionProblems.push(`${page.route || '/'} 题注形状不对（${captionText.length} 字）：`
            + `${captionText.slice(0, 48)}${captionText.length > 48 ? '…' : ''}`);
        }
      } else if (hasMainTable) {
        // 有主表却没有题注 ⇒ 红。这是「整条删除题注」这条路径的收口：
        // T4 已裁定题注牙是**条件式**的（不要求每页都有题注），但那是针对「页面本来就没有表」；
        // 有表而没题注属于结构缺失，不是合法删除 —— 否则「把题注整条删掉」就是一条静默旁路。
        captionProblems.push(`${page.route || '/'} 有主表（${INTRO_CAPTION_EXPECT_RE.source}）却没有 <caption>`);
      }
      if (!notes.length) continue;
      // **没有例外**：所有目录页（含别名页）走同一条判据。
      introProblems.push(`${page.route || '/'} 首屏仍有 ${notes.length} 条说明`
        + `（二级数据页首屏只允许标题 / 条目数 / 更新时间）：${notes[0].text.slice(0, 40)}…`);
      for (const note of notes) {
        for (const term of INTRO_INTERNAL_TERMS) {
          if (note.text.includes(term) && !INTRO_TERM_ALLOW.has(`${page.route}|${term}`)) {
            introHits.push(`${page.route || '/'} 含「${term}」：${note.text.slice(0, 40)}…`);
          }
        }
      }
    }
    // 非目录页只查题注形状（同一段区间）：它们的题目本来就该描述数据形状，不要求逐字形状。
    // ⚠️ 这里的 `directoryRoutes` 只用来**如实报告**覆盖面，不参与放行 —— 放行与否由
    //    「目录页家族扫出来的每条题注都必须匹配」决定，非目录页的题注一条都不进 captionProblems。
    let captionNonDirectoryScanned = 0;
    {
      // 产物里**全部** index.html（按目录遍历现算，不写死路由清单）——
      // 这一段只为「非目录页题注覆盖率」这个**读数**服务，不参与任何判据。
      const stack = [''];
      const pageOutputs = [];
      while (stack.length) {
        const relDir = stack.pop();
        const absDir = path.join(OUT, relDir);
        if (!fs.existsSync(absDir)) continue;
        for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
          const relPath = relDir ? `${relDir}${entry.name}` : entry.name;
          if (entry.isDirectory()) stack.push(`${relPath}/`);
          else if (entry.name === 'index.html') pageOutputs.push(relPath);
        }
      }
      for (const rel of pageOutputs) {
        const file = path.join(OUT, rel);
        const route = rel === 'index.html' ? '' : rel.replace(/index\.html$/, '');
        if (directoryRoutes.has(route)) continue;
        const pageHtml = fs.readFileSync(file, 'utf8').replace(/<script[\s\S]*?<\/script>/gi, '');
        const mainStart = pageHtml.indexOf('<main');
        if (mainStart < 0) continue;
        // 同一处属性容错：这里只数**读数**（非目录页有多少条题注），但读数若用精确串，
        // 就会在报告里少报（而「少报」正是 F1 那类静默的开始）。两个计数器用手写同形的正则。
        if (INTRO_CAPTION_TAG_RE.test(pageHtml.slice(mainStart))) captionNonDirectoryScanned += 1;
        INTRO_CAPTION_TAG_RE.lastIndex = 0;
      }
    }
    if (introProblems.length) {
      fail(`二级数据页首屏出现了说明（分类判据、字段模型与解释性副标题都不占首屏，见 docs/DESIGN-RULES.md H13）：`
        + `${introProblems.slice(0, 4).join('；')}`);
    } else if (introHits.length) {
      fail(`二级页首屏出现内部实现措辞（分类判据 / 字段模型属于维护文档，见 docs/DESIGN-RULES.md 的口径归档）：`
        + `${introHits.slice(0, 4).join('；')}`);
    } else if (captionProblems.length) {
      fail(`目录页家族的题注超出「共 N 条。/ 共 N 个入口。」两种形状（长题注回流即红，见 docs/DESIGN-RULES.md H11）：`
        + `${captionProblems.slice(0, 4).join('；')}`);
    } else if (captionScanned !== captionExpected) {
      // 反空洞守卫（对抗复核 F1 后**改为按产物现算**）：判据是
      // `captionScanned === captionExpected`，其中 expected = 目录页家族里含主表的页数。
      //
      // 为什么不用绝对常量：上一版是 `captionScanned < 20` 这种写法，门槛与「应该有多少条题注」
      // 毫无联系 ⇒ 只要产物里还留着 20 条题注，**任意多页都可以不被判形状**而构建全绿
      // （T4 实测：45 页里改掉 3 页的标记即可静默，改满 25 页才会红）。
      // 现在少扫到**一页**就红，没有可退化的区间 —— 这条守卫防的是「扫描面本身坏了」，
      // 而「扫描面坏了」的精确表述就是「数出来的比该有的少」。
      fail(`题注形状牙的覆盖面与产物不符（扫描面坏了 / 有页没产出 / 标签写法逃过了匹配）：`
        + `目录页家族里判了 ${captionScanned} 条 <caption>，但含主表的目录页有 ${captionExpected} 页`);
    } else {
      console.log(`  ✓ 二级数据页首屏无说明: ${built.directoryPages.length} 页（**含别名页**，没有例外名单）`
        + ` · 残留说明 × ${INTRO_INTERNAL_TERMS.length} 个禁词 0 命中`);
      console.log(`  ✓ 目录页家族题注形状: ${captionScanned}/${captionExpected} 条 <caption> 逐字匹配`
        + `「共 N 条。/ 共 N 个入口。」（判了 ${captionScanned} · 应有 ${captionExpected} —— 两者必须相等）`
        + `（另有 ${captionNonDirectoryScanned} 条非目录页题注不在本规则射程内，只报告不判）`);
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
    + 1 /* 变化雷达页 */ + 1 /* 资料入口页 */ + 1 /* 套餐对比页 */ + 1 /* API 计费页 */
    + 1 /* 模型资料索引 */ + built.modelDetailCount /* 模型详情页 */
    + 1 /* 档案索引 */ + built.archiveDetailCount /* 档案详情页 */;
    // t4：公式里去掉「订阅中心 +1」与「数据文档页 +1」—— 那两页随订阅层与数据出口子系统下架。
  if (sitemapLocs.length !== expectedLocs) {
    fail(`sitemap ${sitemapLocs.length} 条 ≠ 首页 1 + 可索引落地页 ${indexableDirectories.length}` +
      `（分类页 ${built.collectionPages.length} + 按需求页/别名 ${built.needPages.length} 中可索引的` +
      ` + 分类落地页 ${built.categoryPages.length} + 厂商落地页 ${built.vendorPages.length}` +
      ` + 枢纽 ${built.hubPages.length}）+ 状态页 1 + 变化雷达页 1 + 资料入口页 1 + 套餐对比页 1 + API 计费页 1` +
      ` + 模型索引 1 + 模型详情页 ${built.modelDetailCount} + 档案索引 1 + 档案详情页 ${built.archiveDetailCount} + 详情页 ${dealEntries.length}`);
  } else {
    const notListed = dealEntries.filter(deal => !sitemapLocs.some(loc => loc.endsWith(`/deal/${encodeURIComponent(deal.id)}/`)));
    const directoriesNotListed = indexableDirectories.filter(page => !sitemapLocs.includes(page.url));
    const aliasesListed = built.aliasPages.filter(page => sitemapLocs.includes(page.url));
    if (notListed.length) fail(`sitemap 漏了 ${notListed.length} 个详情页`);
    else if (directoriesNotListed.length) fail(`sitemap 漏了落地页: ${directoriesNotListed.map(p => p.route).join(', ')}`);
    else if (aliasesListed.length) fail(`sitemap 里出现了 noindex 的别名页: ${aliasesListed.map(p => p.route).join(', ')}`);
    else if (!sitemapLocs.includes(`${SITE_URL}status/`)) fail('sitemap 漏了状态页 status/');
    else if (!sitemapLocs.includes(`${SITE_URL}changes/`)) fail('sitemap 漏了变化雷达页 changes/');
    else if (!sitemapLocs.includes(`${SITE_URL}${plansHubPage.PLANS_HUB_ROUTE}`)) fail(`sitemap 漏了资料入口页 ${plansHubPage.PLANS_HUB_ROUTE}`);
    else if (!sitemapLocs.includes(`${SITE_URL}${modelsPage.MODELS_INDEX_ROUTE}`)) fail(`sitemap 漏了模型资料索引 ${modelsPage.MODELS_INDEX_ROUTE}`);
    else if (!sitemapLocs.includes(`${SITE_URL}${archiveLib.ARCHIVE_INDEX_ROUTE}`)) fail(`sitemap 漏了历史档案索引 ${archiveLib.ARCHIVE_INDEX_ROUTE}`);
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
      `${built.vendorPages.length} 个厂商落地页 + ${built.hubPages.length} 个枢纽页 + 状态页 + 变化雷达页 + ` +
      `资料入口页 + 套餐对比页 + API 计费页 + 模型索引 + ${built.modelDetailCount} 个模型详情页 + ` +
      `档案索引 + ${built.archiveDetailCount} 个档案详情页 + ` +
      `${dealEntries.length} 个详情页；${built.aliasPages.length} 条别名页已排除）`);
  }

  // 分类页：**逐条回读对账**，而不是「文件存在就算过」。
  //
  // 与 /status/ 同一套机制（读回产物 + 与机器可读的那份对账），但断言更硬：
  //   · 表格里的详情页链接集合 == dist/assets/data/offers.json 里 `collections` 筛出来的 id 集合
  //   · 每个分类页都要有 canonical 自指、要有三段 JSON-LD（含 BreadcrumbList）
  //     （原先还有「要声明两个 feed」一条，已随订阅层下架删除 —— 订阅声明的判据现在在
  //      产物资产门禁与 verify-site 的「0 条带 type 的 rel="alternate"」那一侧，不在本块）
  //   · 无 JS 可读：表格是构建期写的，正文长度必须够
  // 为什么 jsonld 要有断言：`/status/` 那页恰恰是「有五条约定里的两条」——
  // 没有断言的三条，写漏了不会有任何东西红（子代理核查结论）。新路由不重复那个模式。
  {
    const problems = [];
    const published = JSON.parse(fs.readFileSync(path.join(OUT, OFFERS_ARTIFACT), 'utf8'));
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
      // t4：这里原先有两条订阅声明断言（每页必须声明两个根 Feed / 有专属 Feed 的页面必须声明它）。
      // 订阅子系统整体下架之后页面不再声明任何 Feed，这两条一起删除。
      // ⚠️ 它们守的是「读者找得到订阅入口」；现在"入口"这件事本身被撤了，所以判据不是被放松，
      // 而是失去了对象 —— 取而代之的是产物资产门禁：产物里只要还剩一个 feed 前缀的文件，
      // `lib/published-assets.js` 就当场红（文件在 = 读者仍能下载到，比"页面少列一行"更早、更硬）。
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
      // 「双 feed」那一项随订阅层下架删除：这一块从不检查订阅声明（产物里带 type 的声明恒为 0），
      // 所以这里也不再把它写成一条被验过的约定 —— 日志只说这一块**真的**对过账的东西。
      console.log(`  ✓ 分类页: ${collectionSummary}（逐条 id 对账 · canonical · 三段 JSON-LD · 预渲染正文）`);
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
    // 详情页**不许**出现这次 fetch（它是纯静态页）—— 判据从 `OFFERS_ARTIFACT` 现拼，
    // 免得路径再搬家时这里留下一条"看起来还在守、其实已经失配"的断言。
    const offersFetchRe = new RegExp(`fetch\\('${OFFERS_ARTIFACT.replace(/\./g, '\\.')}'`);
    if (offersFetchRe.test(page)) { fail(`详情页仍会拉 ${OFFERS_ARTIFACT}（应纯静态）: ${deal.id}`); detailBad++; }
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
      ...vendorPage.assertVendorSlugCanonical(built.directoryPages, { providerTable: providerTableDisk, vendorSlugs: site.VENDOR_SLUGS }),
      // slug 必须来自**权威表**（不能只靠 providers.json 的隐式兜底）：补表不改变 URL，
      // 只是把「隐式兜底」换成「显式登记」——没有这条，改 slug 表也不会有人发现。
      ...vendorPage.assertVendorSlugDeclared(built.directoryPages, { vendorSlugs: site.VENDOR_SLUGS }),
      ...vendorPage.assertVendorCandidateIdentity(built.directoryPages, { providerTable: providerTableDisk }),
      ...vendorPage.assertNoParallelProviderRoutes(built.directoryPages)
    ];
    const diskApiPlans = built.apiPlansStore.plans;
    const diskPlans = built.plansStore.plans;
    const diskModels = built.publishedModelsDoc.models;
    const diskLinks = built.modelLinksDoc.links;
    const diskPlanHistory = distLogView('plan-history.json', planLogSelf);
    const diskApiHistory = distLogView('api-plan-history.json', apiPlanLogSelf);
    const vendorEntries = built.directoryPages.filter(page => page.kind === 'vendor');
    for (const spec of vendorEntries) {
      const file = path.join(OUT, spec.route, 'index.html');
      if (!fs.existsSync(file)) { problems.push(`${spec.route}: 缺少产物`); continue; }
      const pageHtml = fs.readFileSync(file, 'utf8');
      const pageDeals = landing.itemsOf(spec, JSON.parse(fs.readFileSync(path.join(OUT, OFFERS_ARTIFACT), 'utf8')).deals,
        { vendorKeyOf: VENDOR_KEY_OF });
      const ctx = {
        deals: pageDeals,
        plans: diskPlans, apiPlans: diskApiPlans, models: diskModels, modelLinks: diskLinks,
        planHistoryStore: diskPlanHistory, apiPlanHistoryStore: diskApiHistory,
        providerTable: providerTableDisk,
        // t3：不再传 `feeds`（厂商页的订阅节整节下架，那一层不再有订阅这个概念）。
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
        ` · API 计数与 dist/api-plans.json 逐个对账 · 资料区块五节齐`);
    }
  }

  // t4：这里原先有三块订阅自检（整张注册表三方对账 / 订阅发现 rel=alternate / 订阅中心页五条约定）。
  // 它们随订阅子系统整体下架一起删除 —— 没有 Feed、没有订阅声明、没有订阅中心页，就没有可对账的对象。
  // ⚠️ 删掉的是什么级别的牙，值得写下来：那三块原本能抓住「页面少列一条 Feed」「某页漏了 rel=alternate」
  // 「hidden 的 Feed 仍留产物文件」这类**产出与总览分家**的事故。它们的替代者是产物资产门禁：
  // 只要还有一个 feed 前缀的文件留在产物里，`lib/published-assets.js` 就当场红
  //（比"页面少列一行"更早、也更硬：文件在，读者就能下载到）。

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
    const published = JSON.parse(fs.readFileSync(path.join(OUT, OFFERS_ARTIFACT), 'utf8')).deals;
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
      // t4：/feeds/ 订阅中心页已整体下架，SEO 门禁的页面清单里不再有它。
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
      // v2.1：套餐对比页。ItemList 指向**各自的官方定价页**（与首页同一口径），
      // 所以成员校验对不上（它按站内 `deal/<id>/` 判成员）—— 显式关掉那一条，
      // 而不是为了让断言通过去伪造一个本站不存在的套餐详情页。
      // 行数校验**保留**：ItemList 条数必须等于页面上的 `data-item` 行数。
      readPage(`${plansPage.PLANS_ROUTE}`, {
        kind: 'plans',
        expectItemList: true,
        checkItemListMembers: false,
        // 【史述·已下架】v2.3 / v3.0：这一页当年有专属的套餐变化源，要声明它（与根 Feed 并列）；
        // 订阅层下架后页面不再声明任何订阅源（`seo.js` 的 feed-declared 检查码也与描述符里的
        // feedMatch / feedIds 一起删除），描述符里只剩行数（`count`）等既有字段。
        // 【故意保留·勿当垃圾清】描述符里的 `feedMatch` 现在是**死字段**（全仓消费者 0），
        // 但清它可能改变产物 ⇒ 作废本轮全部产物级证据；要清必须先用「产物逐文件 sha256 不变」证明。
        count: JSON.parse(fs.readFileSync(path.join(ROOT, 'plans.json'), 'utf8')).count
      }),
      // v2.5：API 计费页。与套餐页同样：ItemList 指向**各自的官方定价页**，
      // 所以成员校验不适用（本站不为每个模型编一个详情页）；行数校验保留。
      // 【史述·已下架】v3.0 Stage H：这一页当年有了自己的订阅源（API 价格变化），因此与套餐页一样
      // 走 feedMatch 判据；订阅层下架后页面不再声明任何订阅源，这里同样只剩行数（`count`）等字段。
      // 【故意保留·勿当垃圾清】同上面套餐页那条：`feedMatch` 已是死字段（全仓消费者 0），
      // 队长裁定本轮**不清**（清它可能改变产物 ⇒ 作废全部产物级证据）；要清先证「产物 sha256 不变」。
      readPage(`${apiPlansPage.API_PLANS_ROUTE}`, {
        kind: 'plans',
        expectItemList: true,
        checkItemListMembers: false,
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
      // 【故意保留·勿当垃圾清】`page.feedMatch` 已无人产出（恒为 undefined）、`seo.js` 也不再读它，
      // 所以这一行是**死字段**。队长裁定本轮不清：清它可能改变产物（产物一旦变了，本轮全部
      // 产物级证据作废），收益为零。要清必须先证明「产物逐文件 sha256 不变」。
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
        vendorMinDeals: site.VENDOR_THRESHOLDS.minDeals
      },
      dealsById,
      asOf: built.lastmod,
      vendorKeyOf: VENDOR_KEY_OF,
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

  // ---- 页面级说明的「意图 × 渲染」逐页对账（notes-manifest-v1）------------------------
  //
  // 收盘的那一条：清单是意图侧（内容构造点登记，**不看** class 名的来源），这里回读刚生成的
  // HTML 当渲染侧，逐页逐槽位按「class token 集合 × 条数」对账。改名（`.snote` → 别的）、
  // 换容器（`<p>` → `<div>` / 换成不含该 token 的 class）、漏渲染，三种都会让渲染侧少一条
  // ⇒ 这里红，消息点名 `route#index` 并给出两侧读数。台账（范围之外的模块）与页面族结构下限
  // 各自守一条：整族说明被删 / 被改名时，逐条对账两侧会同时少，只有下限还能把它挡住。
  {
    const { problems, readings } = noteManifestSelfCheck();
    const total = slotId => readings.reduce((sum, row) => sum + (row.dom[slotId] || 0), 0);
    const declaredTotal = slotId => readings.reduce((sum, row) => sum + (row.declared[slotId] || 0), 0);
    const untrackedPages = readings.filter(row => row.untracked);
    const pinnedNotes = noteIntent.size
      ? [...noteIntent.values()].reduce((sum, page) => sum + page.notes.filter(note => note.pinned).length, 0)
      : 0;
    for (const problem of problems.slice(0, 8)) fail(problem);
    if (problems.length > 8) fail(`…另有 ${problems.length - 8} 条说明对账差异（上面是前 8 条）`);
    if (!problems.length) {
      const slotLine = NOTE_SLOTS.map(slot => `${slot.id.replace('main-', '.')} 声明 ${declaredTotal(slot.id)} / 产物 ${total(slot.id)}`).join(' · ');
      console.log(`  ✓ 页面级说明清单: ${readings.length} 页 × ${NOTE_SLOTS.length} 个槽位逐页对账一致（${slotLine}）`);
      console.log(`    · 逐条登记 ${[...noteIntent.values()].reduce((sum, page) => sum + page.notes.length, 0)} 条`
        + `（其中组装点 pin ${pinnedNotes} 条）· 台账（构造点在范围之外的页面族）${untrackedPages.length} 页`
        + `${untrackedPages.length ? `：${[...new Set(untrackedPages.map(row => row.untracked))].join(' / ')}` : ''}`);
      console.log(`    · 清单文件 ${NOTES_MANIFEST_FILE} → ${path.relative(ROOT, NOTES_MANIFEST_PATH).split(path.sep).join('/')}`
        + `（${Buffer.byteLength(notesManifestText(), 'utf8')} 字节，NDJSON：首行 header + 每行一页，按 route 排序 ⇒ 逐字节可重建）`
        + `；它不在产物目录里，自检全过之后就位`);
    }
  }

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
  // 说明意图清单落盘（`<产物目录>.notes.ndjson`，见 writeNotesManifest() 的头注释）：
  // 刻意放在 promoteStaging() **之后** —— 清单是「产物已经就位」这件事的副产物，不是构建过程的
  // 中间文件。构建失败时它一个字节都不该留：仓库根留下「描述一份从未就位的产物」的陈旧清单，
  // 会让所有以它为意图侧的门禁（verify-site §22c ⑨）误红，而那种红看起来像"说明被删了"。
  writeNotesManifest();
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
