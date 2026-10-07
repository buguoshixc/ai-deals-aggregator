'use strict';
/**
 * 页面壳（Page Shell）—— 站点**唯一**产出完整 HTML document 的模块。
 *
 * ## 为什么要有这个文件
 *
 * v3.0 之前，9 个页面族各自手写一份 `<!DOCTYPE html>`…`</html>`：9 份 `<head>`、
 * 9 份 `<header class="top">` 标记、9 次从 `index.html` 抽共享 `<style>` / 主题前置脚本 /
 * 页脚片段、9 次 `finalizePage(页脚, route, prefix)`。实测（architecture-modernization-v1
 * 的基线取证）这些重复是**逐字相同**的，差异只有下面列出的那几条真实变量。
 *
 * 于是「加一条共享 meta」「改一处页头标记」原先要改 9 个地方，漏一处的症状是
 * 某一个页面族悄悄少了一样东西——而没有任何断言会红。收敛成一个出口之后，
 * 「新页面族从同一处派生页壳」不是因为大家记得改，而是**没有别的出口**。
 *
 * ## 它拥有什么 / 不拥有什么
 *
 * 拥有（**文档脚手架**）：DOCTYPE / html / head 基础 meta / title / description / robots /
 * canonical / hreflang / OG+Twitter / 主题色 / favicon / 共享 `<style>` / 页面级 `<style>` 槽位 /
 * JSON-LD 槽位 / 订阅发现槽位 / 共享页头标记 / `<div class="wrap">` / `<main>` /
 * 共享页脚（含 `finalizePage` 的路由占位符解析与统计注入）/ 页面级 `<script>` 槽位 / 收尾标签。
 *
 * **不拥有**（刻意留给调用方，避免这一层重新做业务判断）：
 *   · 标题、描述、canonical 地址**由调用方算好并转义**后传入；
 *   · `feedTagsHtml` / `jsonLdHtml` / `crumbHtml` / `headerExtra` / `extraCss` / `extraScript`
 *     一律是**预渲染好的字符串**——订阅标签有 6 种取法、JSON-LD 每页段数不同，
 *     这些语义留在各自的页面模块里，本文件只负责把它们放到文档的正确位置。
 *   · 布局族（wide / detail / prose）**不在本文件声明**——唯一出处是
 *     `scripts/lib/page-kinds.js` 的 `KIND_TABLE`，本文件按 `kind` 查表，查不到就硬失败。
 *
 * ## 不变量（都有断言，失败即构建失败）
 *
 *   ① `kind` 必须在 `page-kinds.js` 里声明过，且必须声明了 `layout`（不回落默认族）；
 *   ② `title` / `description` / `canonicalUrl` / `bodyHtml` 必填；
 *   ③ `detail` 族必须有内容列 class（默认 `detail-main`）——详情页少了统一内容列是缺陷，
 *      不该静默渲染成宽页（`lib/archive.js` 也有同一条断言，两处守护同一件事）；
 *   ④ 共享片段缺失（`index.html` 被改动导致抽不到 `<style>` / 主题脚本 / 页脚）即抛错；
 *   ⑤ 页脚恰好过一次 `finalizePage()`——残留路由占位符与统计注入数都在那里断言。
 *
 * ## 用法
 *
 * ```js
 * const parts = shell.loadShellParts(indexHtml, ROUTE_HREFS);   // 一次，构建期共用
 * const html = shell.renderWidePageShell({
 *   kind: 'status', route: 'status/', prefix: '../', parts,
 *   title, description, canonicalUrl, faviconHref: '../favicon.svg',
 *   feedTagsHtml: feeds.rootFeedTags('../'), jsonLdHtml,
 *   crumbHtml, bodyHtml, where: 'renderStatusPage'
 * });
 * ```
 *
 * 首页（`index.html` 自身）**不走本模块**：它就是共享片段的源模板，由构建期做标记替换
 * （`assemble()` → `finalizePage(html, '', '', ROUTE_HREFS, 'index.html')`）。这条不对称是
 * 固有的，不是遗漏。
 */

const analytics = require('./analytics');
const analyticsRoutes = require('./analytics-routes');
const pageKinds = require('./page-kinds');

/** `detail` 布局族的统一内容列 class（与 `lib/archive.js` 的 ARCHIVE_ENTRY_MAIN_CLASS 同值） */
const DETAIL_MAIN_CLASS = 'detail-main';

/**
 * 从**已组装好的 index.html** 抽出三份共享片段。
 *
 * 唯一出处仍然是 `index.html`：本函数只读取，不生成第二份。抽不到即抛错——那意味着
 * 共享片段被改名/删除，而所有页面族会同时失去页头样式与页脚导航，属于必须拦住发布的情况。
 *
 * 页脚模板里 `<!--lastUpdated-->` 的初值是 `--`（只有首页的 JS 会填），其它页一律写成
 * 「见首页」——这是 **9 个页面族逐字相同**的一处既有约定，因此收敛在这里。
 *
 * @param {string} indexHtml 已组装好的首页 HTML（含共享 `<style>` / 主题脚本 / 页脚片段）
 * @param {Array<[string,string]>} routeHrefs 路由占位符表（`build-local.js` 的 ROUTE_HREFS）
 */
function loadShellParts(indexHtml, routeHrefs) {
  const sharedStyle = (indexHtml.match(/<style>[\s\S]*?<\/style>/) || [''])[0];
  const themeScript = (indexHtml.match(/<script>\s*\/\* 主题必须在首次绘制前决定[\s\S]*?<\/script>/) || [''])[0];
  const footerRaw = (indexHtml.match(/<!--SHARED:footer:START-->([\s\S]*?)<!--SHARED:footer:END-->/) || [])[1] || '';
  const missing = [];
  if (!sharedStyle) missing.push('共享 <style>');
  if (!themeScript) missing.push('主题前置脚本');
  if (!footerRaw) missing.push('共享页脚片段（<!--SHARED:footer:START-->…END-->）');
  if (missing.length) {
    throw new Error(`index.html 里抽不到 ${missing.join(' / ')} —— 页面壳失去共享来源，拒绝继续构建`
      + '（页面壳的样式与页脚纪律：共享规则只有一处出处，见 docs/ARCHITECTURE.md）');
  }
  return {
    sharedStyle,
    themeScript,
    footerTemplate: footerRaw.replace(/<span id="lastUpdated">--<\/span>/, '<span>见首页</span>'),
    routeHrefs
  };
}

/**
 * 把共享片段里的路由占位符按**输出深度**解析成相对路径。
 *
 * ⚠️ 逐条 `split/join`：占位符之间不许互为子串（`build-local.js` 的
 * `assertRouteMarkersDisjoint()` 在构建期硬失败守着这条），否则先替换的那个会把
 * 后替换的打碎，症状是「每一个输出都残留一个占位符」。
 *
 * @param {string} html   含占位符的 HTML
 * @param {string} prefix 该输出相对站点根的路径前缀（'' / '../' / '../../'）
 * @param {Array<[string,string]>} routeHrefs 路由占位符表
 */
function resolveRouteHrefs(html, prefix, routeHrefs) {
  let out = html;
  for (const [marker, rel] of routeHrefs) out = out.split(marker).join(prefix + rel);
  // 动态路由（厂商页 / 分类页 / 模型详情页）的深度前缀：源码里写 __PREFIX__vendor/<slug>/，
  // 由这里按输出深度解析 —— 写死相对路径在详情页那一层必然错。
  return out.split('__PREFIX__').join(prefix);
}

/**
 * 页面 HTML 的**唯一收尾动作**：解析路由占位符 + 注入分析 bootstrap + 两项自检。
 *
 * 三件必须在同一处发生的事：
 *   ① 路由占位符解析；
 *   ② 分析占位符按**该页路由**解析成 beacon 或注释（`lib/analytics.js` 是唯一实现）；
 *   ③ 收尾断言：残留占位符 = 0，且 bootstrap 数 == 该页应有值（trackable 1 / excluded 0）。
 *
 * ③ 是这套设计最值钱的地方：漏注入、注入两次、绕过共享页脚、偷偷改 token 或删掉
 * Production Guard —— 任何一种都在**构建期**就红，而不是等线上少了一半数据才发现。
 *
 * ⚠️ 一页**恰好调用一次**。页脚标记在源码里只出现一次，因此「解析两次」只可能来自
 * 有人把同一页拼了两遍——那种情况下计数断言会报 2，正是我们想要的。
 *
 * @param {string} html   含占位符的 HTML 片段
 * @param {string} route  该页的站根相对路由（首页是空串）——必须是**显式**的，不许猜
 * @param {string} prefix 该输出的深度前缀（'' / '../' / '../../'）
 * @param {Array<[string,string]>} routeHrefs 路由占位符表
 * @param {string} [where] 出错时点名用的位置描述（渲染器名）
 */
function finalizePage(html, route, prefix, routeHrefs, where = '') {
  const resolved = resolveRouteHrefs(html, prefix, routeHrefs);
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

/** 共享页头标记（9 个页面族逐字相同的那一份）。唯一变量是深度前缀。 */
function sharedHeaderHtml(prefix, headerExtra = '') {
  return `  <header class="top">
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
      <a class="jumpback" href="${prefix}">← 返回全部优惠</a>${headerExtra ? `\n      ${headerExtra}` : ''}
    </div>
  </header>`;
}

/** OG / Twitter 卡片块。`og` 为 null ⇒ 整块不输出（状态页 / 变化页等当前就没有）。 */
function ogBlockHtml(og) {
  if (!og) return '';
  const lines = [
    `<meta property="og:type" content="${og.type}">`,
    `<meta property="og:site_name" content="${og.siteName}">`,
    `<meta property="og:url" content="${og.url}">`,
    `<meta property="og:title" content="${og.title}">`,
    `<meta property="og:description" content="${og.description}">`,
    `<meta property="og:image" content="${og.image}">`,
    `<meta name="twitter:card" content="summary_large_image">`
  ];
  if (og.twitterTitle) lines.push(`<meta name="twitter:title" content="${og.twitterTitle}">`);
  if (og.twitterDescription) lines.push(`<meta name="twitter:description" content="${og.twitterDescription}">`);
  if (og.twitterImage) lines.push(`<meta name="twitter:image" content="${og.twitterImage}">`);
  return lines.join('\n');
}

/**
 * 文档**前半**：`<!DOCTYPE html>` … `<main id="main" …>`（**不带尾换行**）。
 *
 * 与 `docEnd()` 配对使用：页面族把自己的正文标记**留在原地**，只在首尾各插一次调用——
 * 这样正文模板不搬家（重构 diff 最小），而文档脚手架只有一处实现。
 *
 * ```js
 * return `${docStart({ kind: 'status', route, prefix: '../', parts, … })}
 *       <nav class="crumb">…</nav>
 *       …本页正文（逐字保留）…
 *       </p>${docEnd({ route, prefix: '../', parts, extraScript, where: 'renderStatusPage' })}`;
 * ```
 */
function docStart(spec) {
  const {
    kind, route, prefix, parts,
    title, description, canonicalUrl,
    robots = '', hreflang = [], og = null,
    faviconHref, logoCssHref = '',
    feedTagsHtml = '', extraCss = '', jsonLdHtml = '',
    headerExtra = '', mainClass, expectLayout, where = kind
  } = spec;

  // ① 布局族：唯一出处是 page-kinds.js；查不到即硬失败（不回落成某个默认族）
  const layout = pageKinds.layoutOf(kind);
  if (!layout) {
    throw new Error(`页面壳：kind「${kind}」没有在 scripts/lib/page-kinds.js 的 KIND_TABLE 里声明 layout`
      + `（${where}）—— 新页面族必须显式登记布局族，不许默认落进 wide`);
  }
  if (expectLayout && layout !== expectLayout) {
    throw new Error(`页面壳：${where} 用了 ${expectLayout} 预设，但 kind「${kind}」的布局族是「${layout}」`
      + ' —— 预设与声明不符，请改调用或改声明（两处不一致时以声明为准，并同步修正调用）');
  }

  // ② 必填项
  const required = { title, description, canonicalUrl };
  for (const [name, value] of Object.entries(required)) {
    if (typeof value !== 'string' || value === '') {
      throw new Error(`页面壳：${where} 缺 ${name}（route=${route}）—— 这三项必填，不接受空值`);
    }
  }
  if (!parts || !parts.sharedStyle || !parts.themeScript || !parts.footerTemplate) {
    throw new Error(`页面壳：${where} 没有传 loadShellParts() 的结果（或片段为空）`);
  }

  // ③ 内容列：detail 族必须有（缺了就是「详情页渲染成宽页」这种静默缺陷）
  const main = mainClass === undefined ? (layout === 'detail' ? DETAIL_MAIN_CLASS : '') : mainClass;
  if (layout === 'detail' && !main) {
    throw new Error(`页面壳：${where} 属于 detail 布局族（kind=${kind}）但没有内容列 class —— `
      + `详情页必须有统一内容列（默认 ${DETAIL_MAIN_CLASS}）`);
  }

  const hreflangHtml = hreflang.map(x => `<link rel="alternate" hreflang="${x.hreflang}" href="${x.href}">`).join('\n');
  const robotsHtml = robots ? `<meta name="robots" content="${robots}">\n` : '';
  const ogHtml = ogBlockHtml(og);
  const logoCssHtml = logoCssHref ? `<link rel="stylesheet" href="${logoCssHref}">\n` : '';
  const extraCssHtml = extraCss ? `<style>\n${extraCss}\n</style>\n` : '';
  const jsonLdHtmlBlock = jsonLdHtml ? `${jsonLdHtml}\n` : '';

  // 文档序（有语义，不许调换）：共享 `<style>` → 页面级 `<style>`（覆盖关系）→ JSON-LD。
  // 共享规则一处定义、全站生效，页面级只写自己独有的规则 —— 见 docs/ARCHITECTURE.md。
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${description}">
${robotsHtml}<link rel="canonical" href="${canonicalUrl}">
${hreflangHtml}${hreflangHtml ? '\n' : ''}${ogHtml}${ogHtml ? '\n' : ''}<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#f6f7f9" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0b0d10" media="(prefers-color-scheme: dark)">
<link rel="icon" href="${faviconHref}" type="image/svg+xml">
${logoCssHtml}${feedTagsHtml}${feedTagsHtml ? '\n' : ''}${parts.themeScript}
${parts.sharedStyle}
${extraCssHtml}${jsonLdHtmlBlock}</head>
<body>
${sharedHeaderHtml(prefix, headerExtra)}

  <div class="wrap">
    <main id="main"${main ? ` class="${main}"` : ''}>`;
}

/**
 * 文档**后半**：`</main>` + 共享页脚 + `</div>` + 可选的页面脚本 + 收尾标签。
 *
 * 页脚在这里**恰好过一次 `finalizePage()`**（路由占位符解析 + 统计注入 + 两项断言）——
 * 原先 9 个页面族各调一次，且各自把 `footerRaw.replace(…'见首页'…)` 抄一遍。
 */
function docEnd(spec) {
  const { route, prefix, parts, extraScript = '', extraTailHtml = '', where = 'page' } = spec;
  if (!parts || !parts.footerTemplate) {
    throw new Error(`页面壳：${where} 的 docEnd 没有传 loadShellParts() 的结果`);
  }
  // `.trim()` 与迁移前 9 个页面族逐字一致：片段是从 index.html 的两个标记之间切出来的，
  // 首尾各带一个换行与缩进，不裁掉会在每个文档里多出空行。
  const footer = finalizePage(parts.footerTemplate, route, prefix, parts.routeHrefs, `${where}/footer`).trim();
  const scriptHtml = extraScript ? `  <script>\n${extraScript}\n  </script>\n` : '';
  // `extraTailHtml`：**已自带标签**的尾部件（当前只有套餐对比页的 compareScript）。
  // 与 `extraScript`（裸 JS，由本模块包 `<script>`）分开，是为了不把「谁负责写标签」
  // 这件事变成一个隐含约定 —— 那正是页壳要消灭的那类不确定性。
  const tailHtml = extraTailHtml ? `${extraTailHtml}\n` : '';
  return `
    </main>
    ${footer}
  </div>
${scriptHtml}${tailHtml}</body>
</html>
`;
}

/**
 * 组合式入口：正文已经是一个现成的字符串时用这个（`docStart` + 正文 + `docEnd`）。
 *
 * 两条入口共用**同一份**脚手架实现，区别只是正文的传递方式：
 *   · 正文是一个值（或来自别处的字符串）→ `renderPageShell({ bodyHtml })`；
 *   · 正文是一大段留在原地的模板标记 → `docStart()` / `docEnd()` 首尾各插一次。
 * 页面族一律选后者以外的场景时不要另写第三份脚手架 —— 那正是本模块要消灭的形态。
 */
function renderPageShell(spec) {
  const { bodyHtml } = spec;
  if (typeof bodyHtml !== 'string' || bodyHtml === '') {
    throw new Error(`页面壳：${spec.where || spec.kind} 的 renderPageShell 缺 bodyHtml`);
  }
  return `${docStart(spec)}\n${bodyHtml}\n${docEnd(spec)}`;
}

/** Wide Data Page 预设：数据型页面（说明 / 表格 / 列表跟随站点数据容器） */
function renderWidePageShell(spec) {
  return renderPageShell({ ...spec, expectLayout: 'wide' });
}

/** Leaf Detail Page 预设：单一实体详情（统一的居中内容列） */
function renderDetailPageShell(spec) {
  return renderPageShell({ ...spec, expectLayout: 'detail' });
}

module.exports = {
  DETAIL_MAIN_CLASS,
  loadShellParts,
  resolveRouteHrefs,
  finalizePage,
  sharedHeaderHtml,
  docStart,
  docEnd,
  renderPageShell,
  renderWidePageShell,
  renderDetailPageShell
};
