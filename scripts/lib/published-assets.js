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
 * ## 本轮再裁定（v3.2-feed-and-changes：订阅出口回归 —— **用户显式授权的部分反转**）
 *
 * 上一轮「去数据暴露」的裁决是**订阅子系统整体下架**：规则 ② 写成「任何 `feed*` 基名一律判红」，
 * 理由是产物里不该再有**任何**订阅产物（XML 与 JSON 两种格式、连同 `feed/` 子目录），那是一条**整族**禁令。
 *
 * 本轮经**用户显式授权**，把那条整族禁令换成**逐路径登记制**——反转的**只有**两张表里登记
 * 过的那两条路径（`FEED_FILES` 的那一对，名字从 `scripts/lib/feed.js` 取，本文件不写第二份字面量）：
 * 它们的定位是**订阅产物**（人与程序主动来取的订阅入口），不是「给读者下载的数据集」，
 * 所以进 `ALLOWED_PATHS`（逐条写明理由），**不进** `ALLOWED_DATA` —— 后者是「本站发布的数据面
 * 还剩什么」的那一眼可审清单，今天仍然只有 `assets/data/offers.json` 一条。
 *
 * 三条边界（缺一条这次反转就变味了）：
 *   · **其余任何 `feed*` 基名仍然判红**（`feed/…`、`feed-rss.xml`、`feeds.json` …），
 *     未登记就点名路径报出来，不许用通配豁免、不许按前缀放行；
 *   · 登记是**逐路径精确匹配**（`rel === 登记项`），子目录里的同名文件照样判红；
 *   · 登记表读不出来时（`scripts/lib/feed.js` 尚未落地 / 导出形状非法）**退化到上一轮的更严形态**：
 *     没有任何 `feed*` 被登记 ⇒ 一个都不放行。这是 fail-closed 的退化，**不是**默认放行。
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

/**
 * IndexNow 的密钥文件（`<key>.txt`）：它的**唯一出处**是 `lib/indexnow.js`。
 * 本文件只调 `keyFileName()` 取名字，不写第二份字面量 —— 与上面 `FEED_FILES` 那条同款纪律。
 */
const indexnow = require('./indexnow');

/* ------------------------------------------------------------------ */
/* 订阅产物登记表（v3.2 · 逐路径登记；名字一律从 feed.js 的 FEED_FILES 取）  */
/* ------------------------------------------------------------------ */

/**
 * `FEED_FILES` 的**唯一读取点**：订阅产物表（文件名 → MIME）的唯一出处是
 * `scripts/lib/feed.js` 的导出。本文件**不写**第二份文件名 / MIME 字面量 ——
 * 这一条由 `feed-selftest.js` 的「4 文件字面量扫描」机器复核（本文件里出现那两份订阅产物的
 * 文件名或 MIME 字面量即判红），所以下面只能出现 `FEED_FILES`。
 *
 * 读不到时（模块尚未落地）返回**空表**：没有任何路径被登记 ⇒ 调用点退化到
 * 「任何 `feed*` 基名一律判红」的更严形态。**导出形状非法**则是另一回事 ——
 * 那是「落地了但坏了」，必须当场抛错（静默吞掉会让登记表悄悄变成空表）。
 */
function readFeedFiles() {
  let feedLib;
  try {
    feedLib = require('./feed');
  } catch (error) {
    if (error && error.code === 'MODULE_NOT_FOUND' && String(error.message).includes("'./feed'")) {
      return [];
    }
    throw error;
  }
  const files = Array.isArray(feedLib.FEED_FILES) ? feedLib.FEED_FILES : null;
  if (!files || !files.length) {
    throw new Error('scripts/lib/feed.js 的 FEED_FILES 必须是非空数组'
      + '（订阅产物登记表读不出来时不许静默放行——那会让 feed* 的判定失去依据）');
  }
  for (const item of files) {
    if (!Array.isArray(item) || typeof item[0] !== 'string' || !item[0]
      || typeof item[1] !== 'string' || !item[1]) {
      throw new Error(`scripts/lib/feed.js 的 FEED_FILES 条目形状非法：${JSON.stringify(item)}`);
    }
  }
  return files;
}

/**
 * 两份订阅产物的登记理由（**顺序与 `FEED_FILES` 逐条对应**）。
 * 条数不匹配即抛错：逐路径登记必须一条一理由，少一条理由就等于一条静悄悄的法外豁免。
 */
const FEED_ASSET_WHY = [
  '站点订阅产物（Atom 1.0）：构建期生成，被首页与 /changes/ 的 <link rel="alternate"> 声明，'
  + '是人与程序主动来取的订阅入口，不是面向读者下载的数据集',
  '站点订阅产物（JSON Feed 1.1）：与 Atom 那一份同批生成、同批声明，定位同上（订阅入口，不是数据集）'
];

/**
 * 订阅产物的产物登记条目（`[路径, 理由]`，路径按 `FEED_FILES` 逐条取）。
 * ⚠️ 它进 `ALLOWED_PATHS`，**不进** `ALLOWED_DATA`（理由见文件头「本轮再裁定」）。
 */
const FEED_ASSET_PATHS = (() => {
  const files = readFeedFiles();
  if (!files.length) return [];
  if (files.length !== FEED_ASSET_WHY.length) {
    throw new Error(`FEED_FILES 有 ${files.length} 条，但订阅产物登记理由有 ${FEED_ASSET_WHY.length} 条 ——`
      + '逐路径登记必须一条一理由');
  }
  return files.map(([file], index) => [file, FEED_ASSET_WHY[index]]);
})();

/** 允许出现在产物里的**具体路径**（相对产物目录，POSIX 形式）。逐条写理由。 */
const ALLOWED_PATHS = [
  ['.nojekyll', 'GitHub Pages 的 Jekyll 关断标记（内容只有一个空行，不是数据）'],
  ['favicon.svg', '站点图标（每个页面 <head> 都引用它）'],
  ['logos.css', '厂商 logo 的样式表：与 logos/ 同批生成，页面用它渲染 data-logo 图形'],
  ['og-image.png', '社交分享图（构建期由 lib/og-image.js 生成，被 og:image 引用）'],
  ['robots.txt', '抓取策略（声明 sitemap 地址，是站点对外的运维约定而不是数据）'],
  ['sitemap.xml', '站点地图（构建期按页面集合生成，搜索引擎读它）'],
  // Bing Webmaster Tools 的**站点归属验证**文件（2026-10-16 加）。它与上面两条同属
  // 「站对外的运维约定」那一类：没有页面引用它、它也不进 sitemap，但**必须**能在站点根
  // 被原样 GET 到 —— Bing 抓的就是这个路径下的这份内容，改一个字节就验不过。
  ['BingSiteAuth.xml', 'Bing Webmaster Tools 的站点归属验证文件（Bing 生成，内容只有一条 <user> 令牌）：'
    + '搜索引擎的运维约定而不是数据，也没有任何页面引用它'],
  // IndexNow 的**密钥文件**（v3.3）。与上面两条同属「站对外的运维约定」那一类：
  // 没有页面引用它、它也不进 sitemap（它不是页面，是一份"这个子目录归我"的凭据），
  // 但**必须**能在站点根被逐字节原样 GET 到 —— 搜索引擎抓的就是这个路径下的这份内容。
  // 名字从 `lib/indexnow.js` 现取：本文件不写第二份字面量（同 `FEED_FILES` 那条纪律）。
  [indexnow.keyFileName(), 'IndexNow 密钥文件（文件名与内容都是密钥本身）：参与引擎抓它来证明'
    + '「提交者确实控制着这个子目录」，属于站对外的运维约定而不是数据，也没有任何页面引用它'],
  ...FEED_ASSET_PATHS
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
    // ② 订阅产物：上一轮「订阅子系统整体下架」把 `feed*` **整族**判红；本轮（v3.2，用户显式授权）
    //    改成**逐路径登记制** —— 只放行 ALLOWED_PATHS 里登记过的那几条（精确路径匹配），
    //    其余任何 `feed*` 基名仍然判红。这条比"名字登记"更早报出来，所以未登记时先说订阅这一句。
    if (/^feed/i.test(base)) {
      if (allowedPaths.has(rel)) continue;
      const registered = FEED_ASSET_PATHS.map(([p]) => p);
      problems.push(`产物里出现未登记的订阅产物：${rel} —— 上一轮「去数据暴露」的裁决是`
        + '订阅子系统整体下架、任何 `feed*` 基名一律判红；本轮（v3.2-feed-and-changes）'
        + '经**用户显式授权**只做**逐路径登记**这一种有限反转：放行的仅有 '
        + `${registered.length ? registered.join(' / ') : '(登记表为空：scripts/lib/feed.js 尚未落地，此时一个都不放行)'}`
        + '，其余任何 `feed*` 基名（feed/… · feed-rss.xml · feeds.json · 子目录里的同名文件 …）仍然判红，'
        + '不许用通配或前缀豁免；要新增一条订阅产物，必须在 lib/published-assets.js 里逐条写明理由');
      continue;
    }
    // ③ 数据文件：只允许 ALLOWED_DATA 里逐条写明理由的那一份 —— 外加「ALLOWED_PATHS 里逐条登记过
    //    且有理由」的那些（本轮只有订阅那一对会走到这里；它们进的是 ALLOWED_PATHS，不是数据面清单）。
    if (/\.json$/i.test(rel)) {
      if (allowedData.has(rel) || allowedPaths.has(rel)) continue;
      problems.push(`产物里出现数据文件：${rel} —— 产物里只允许 ${ALLOWED_DATA.map(([p]) => p).join(' / ')}`
        + '（本站发布的数据面只剩这一份；要新增数据资源，必须在 lib/published-assets.js 的 ALLOWED_DATA 里逐条写明理由）'
        + '，另外允许 ALLOWED_PATHS 里逐条登记过的订阅产物'
        + `${FEED_ASSET_PATHS.length ? `（${FEED_ASSET_PATHS.map(([p]) => p).join(' / ')}）` : ''} —— 两条都没登记：${rel}`);
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
