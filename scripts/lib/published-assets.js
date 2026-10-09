/**
 * 产物资产门禁（published-assets-v1）—— 「产物里允许有哪些**非 HTML** 文件」的**唯一注册表**。
 *
 * ## 它替代了什么
 *
 * 原先这条闭环由 `lib/data-docs.js` 的 `assertArtifactCoverage()` 实现：「产物里每个 `*.json`
 * 都必须被某个注册表认领」。数据出口子系统整体下架之后，那份注册表（`PUBLIC_DATASETS`）本身
 * 就不该存在了 —— 但**纪律要留着**：一个静态站会悄悄长出新数据文件，而"多了一份没人知道的
 * JSON"从来不会自己变红。于是闭环换成更窄、更硬的一版：**产物里不许有数据文件**，
 * 只允许一份明确定义的例外（首页应用自己的数据资源）。
 *
 * ## 三条纪律（每条都对应一种真实的失效方式）
 *
 * ① **输入为空不许判绿**（照抄 data-docs 那条 fail-closed 判据的措辞与理由）。
 *    「扫不到文件」与「没有违规文件」是两件事：目录路径拼错、产物还没生成、调用方传了个空数组
 *    —— 这三种情况都会让"没有问题"变成一个假绿。所以空输入返回的是**一条问题**，不是空数组。
 *
 * ② **豁免只能逐路径写清楚并附理由，不许通配**（照抄 `check-ci-consistency.js` 的豁免表纪律）。
 *    一条 `*.png` 通配豁免能让整个目录悄悄变成法外之地；而逐路径登记时，下一个人加文件必须
 *    在本文件里写下"它是什么、为什么可以发布"，那次改动是可评审的。
 *
 * ③ **失败信息点名路径**。判据红的时候必须能直接回答"是哪个文件"，否则守门的人只能去猜
 *    （"产物里多了个 JSON"这种信息量等于没有）。
 *
 * ## 它不做什么
 *
 * 不检查文件内容、不检查 HTML（页面本体由 SEO 门禁与产物自检各自盯着），也不管"这个文件
 * 该不该更新"—— 它只回答一个问题：**产物里出现的每个非 HTML 文件，是不是都在这里登记过。**
 */

const fs = require('fs');
const path = require('path');

/** 允许出现在产物里的**具体路径**（相对产物目录，POSIX 形式）。逐条写理由。 */
const ALLOWED_PATHS = [
  ['.nojekyll', 'GitHub Pages 的 Jekyll 关断标记（内容只有一个空行，不是数据）'],
  ['favicon.svg', '站点图标（每个页面 <head> 都引用它）'],
  ['logos.css', '厂商 logo 的样式表：与 logos/ 同批生成，页面用它渲染 data-logo 图形'],
  ['og-image.png', '社交分享图（构建期由 lib/og-image.js 生成，被 og:image 引用）'],
  ['robots.txt', '抓取策略（声明 sitemap 地址，是站点对外的运维约定而不是数据）'],
  ['sitemap.xml', '站点地图（构建期按页面集合生成，搜索引擎读它）']
];

/** 允许出现在产物里的**目录前缀**（同样逐条写理由；前缀以 `/` 结尾，只匹配目录内的文件）。 */
const ALLOWED_PREFIX = [
  ['logos/', '厂商 logo 资产目录：构建期按 logos 注册表逐个生成 SVG/PNG，数量与文件名都由注册表决定']
];

/**
 * 允许出现在产物里的**数据资源**（逐条写理由）。
 *
 * 与上面两张表的区别只在语义上：这一张里的路径是"数据"，放在这里是为了让复核者一眼看到
 * 「本站发布的数据面还剩什么」。判据上与 `ALLOWED_PATHS` 等价。
 */
const ALLOWED_DATA = [
  ['assets/data/offers.json',
    '首页应用自己的数据资源：首页的筛选 / 排序 / 详情弹窗要 fetch 它（不是给读者下载的数据集，'
    + '页面上没有任何文本或链接提到它）。它是**唯一**允许发布的数据文件。']
];

/** 页面本体：任何 `*.html` 都是产物的一部分，不在这张表里逐个登记（它们由 SEO 门禁与自检盯）。 */
const PAGE_FILE_RE = /\.html?$/i;

/**
 * 产物里全部文件的相对路径（POSIX 形式，排序后返回，便于逐字节可复现的日志与断言）。
 * @param {string} dir 产物目录（通常是构建期的暂存目录 OUT）
 */
function listPublishedFiles(dir) {
  const out = [];
  const walk = (abs, rel) => {
    const entries = fs.readdirSync(abs, { withFileTypes: true })
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      const nextRel = rel ? `${rel}/${entry.name}` : entry.name;
      const nextAbs = path.join(abs, entry.name);
      if (entry.isDirectory()) walk(nextAbs, nextRel);
      else out.push(nextRel);
    }
  };
  walk(dir, '');
  return out;
}

/**
 * **唯一判据**：产物里不许有未登记的文件，尤其不许有数据文件。
 *
 * @param {string} dir 产物目录
 * @returns {string[]} 问题清单（空数组 = 通过）
 */
function assertNoPublishedData(dir) {
  const allowedPaths = new Set(ALLOWED_PATHS.map(([rel]) => rel));
  const allowedData = new Set(ALLOWED_DATA.map(([rel]) => rel));

  let files = [];
  try {
    files = listPublishedFiles(dir);
  } catch (error) {
    return [`读不到产物目录 ${dir}：${error.message}`];
  }

  // 纪律 ①：输入为空**不许判绿** —— 否则"拿不到产物列表"会退化成"没有未登记文件"。
  if (!files.length) {
    return ['产物扫描没有拿到任何文件（输入为空时不许判绿：先确认产物目录真的存在、真的被读到了）'];
  }

  const problems = [];
  for (const rel of files) {
    if (PAGE_FILE_RE.test(rel)) continue;
    const base = rel.split('/').pop();

    // ① NDJSON 永远不许发布：说明意图清单是构建过程的产物，它的家在产物目录之外。
    if (/\.ndjson$/i.test(rel)) {
      problems.push(`产物里出现 NDJSON 文件：${rel} —— 构建期清单（说明意图）不进产物目录，`
        + '它的落盘位置是「产物目录的兄弟文件」；这个文件是谁写进来的，去问那条写点');
      continue;
    }
    // ② Feed 家族：订阅子系统已整体下架，`feed*` 一个都不该有（这条判据比"名字登记"更早报出来）。
    if (/^feed/i.test(base)) {
      problems.push(`产物里出现订阅产物：${rel} —— 订阅子系统已整体下架，`
        + 'Feed 文件（feed.xml / feed.json / feed/…）一个都不该发布');
      continue;
    }
    // ③ 数据文件：只允许 ALLOWED_DATA 里逐条写明理由的那一份。
    if (/\.json$/i.test(rel)) {
      if (allowedData.has(rel)) continue;
      problems.push(`产物里出现数据文件：${rel} —— 产物里只允许 ${ALLOWED_DATA.map(([p]) => p).join(' / ')}`
        + '（公开数据面已整体下架；要新增数据资源，必须在 lib/published-assets.js 的 ALLOWED_DATA 里逐条写明理由）');
      continue;
    }
    // ④ 其余文件：逐路径登记（不许通配）。
    const byPrefix = ALLOWED_PREFIX.some(([prefix]) => rel.startsWith(prefix));
    if (allowedPaths.has(rel) || byPrefix) continue;
    problems.push(`产物里出现未登记的文件：${rel} —— 逐路径登记进 lib/published-assets.js 的`
      + 'ALLOWED_PATHS / ALLOWED_PREFIX / ALLOWED_DATA，并在那里写明它可以发布的理由（不许用通配豁免）');
  }
  return problems;
}

/** 给日志用的一行摘要：「产物资产 N 个（页面 M / 非页面 K，其中数据资源 1）」 */
function summarizePublishedFiles(dir) {
  const files = listPublishedFiles(dir);
  const pages = files.filter(rel => PAGE_FILE_RE.test(rel)).length;
  const data = files.filter(rel => ALLOWED_DATA.some(([p]) => p === rel)).length;
  return { total: files.length, pages, nonPages: files.length - pages, data };
}

module.exports = {
  ALLOWED_PATHS,
  ALLOWED_PREFIX,
  ALLOWED_DATA,
  listPublishedFiles,
  assertNoPublishedData,
  summarizePublishedFiles
};
