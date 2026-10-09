/**
 * 站点常量与 XML 转义 —— **唯一出处**（t1 从当时的 `lib/feeds.js` 逐行搬来，语义零变化；
 * 那个文件随后随订阅子系统整体下架被删除，本文件从此是它们的唯一定义处）。
 *
 * ## 为什么要有这个文件
 *
 * 这些值原先住在 `lib/feeds.js`，也就是订阅层。订阅层整体下架（`feeds/` 页面族、
 * `feed.xml` / `feed.json` 全部撤销）之后，常量不能跟着陪葬：页面壳、JSON-LD、sitemap、
 * 目录页、厂商资料页都要用它们。如果它们还留在那个文件里，就会有十几个非订阅模块
 * 继续 `require('../lib/feeds')` —— 一个「只为拿四个字符串」的依赖，是下一个人
 * 最想当成死代码删掉的东西（那会变成构建期 ReferenceError，不是静默退化，但已经是一次白工）。
 * 所以**先搬家、后下架**：本文件（t1）先承载它们，订阅子系统整体下架时 `feeds.js` 被删除
 * —— **这两步都已经完成**，现在这里是它们的唯一定义处（`grep -rn "lib/feeds" scripts/lib` 零命中）。
 *
 * ## 搬迁已完成（这里曾经写的是「搬迁期」的说明）
 *
 * t1 期间同一份常量**暂时存在两份定义**（本文件与 `feeds.js`），两者逐值相等是当时的验收；
 * 订阅子系统整体下架之后 `feeds.js` 已删除 —— **现在只有一份定义，就是本文件**。
 * 因此「改了一边忘了另一边」那条失效方式已经不存在；但它当时的形状仍值得记住：
 * 站点常量一旦出现第二处定义，页面 canonical 与别处的链接会当场分叉，而两边各自看都自洽。
 *
 * ## 三件事必须一起看（每一件都有一个"静默失效"）
 *
 * ① **`xmlEscape` 同时被当作 `htmlEscape` 使用。** `build-local.js:1061` 写着
 *    `const htmlEscape = xmlEscape;` —— 同一份五字符转义既进 RSS/XML，也进 HTML 的
 *    正文与属性。这不偷懒：`& < > " '` 是 XML 与 HTML 文本/属性上下文的公共安全集，
 *    复用不会漏转义。失效方式有两个方向：
 *      · 「为 HTML 精简」删掉 `"` / `'` 两条 ⇒ 属性值里的同类引号会提前闭合标签；
 *      · 「为 XML 提速」只保留 `& <` ⇒ 双引号属性直接破口。
 *    这五个命名实体是**反向解析**唯一认的集合（它原先住在 `lib/feeds.js` 的 `NAMED_ENTITIES` /
 *    `unescapeXml`，随订阅子系统一起删除）—— 一边改一边不改就对不上。
 *    这项性质的交叉证据现在由 `verify-site.js` 在真浏览器里用 `DOMParser` 提供。
 *
 * ② **厂商 slug 表在模块加载时读一次，之后是纯数据。** `VENDOR_SLUGS` 是
 *    `loadVendorSlugs()` 在 require 时求值的结果。这样做是为了让下游全是纯函数
 *    （订阅注册表、落地页门槛、厂商页断言都按同一份快照判）。
 *    失效方式与它的好处是一体两面：构建中途改了 `scripts/data/vendor-slugs.json`，
 *    本轮构建**不会**看到 —— 这正是「同一入参必得同一产物」要的；反过来，如果哪天
 *    有人把它改成每次调用现读，同一轮构建里前后两个判据就可能读到不同版本。
 *
 * ③ **本文件不合并另外两份同形副本。** `lib/landing.js:29` 与 `lib/providers.js:49`
 *    各有一份 `VENDOR_SLUGS_FILE` / `loadVendorSlugs`（签名还不一样：providers 收
 *    `{ file }` 对象，landing 收位置参数）。它们各有自己的消费者
 *    （`validate.js:1101`、`plan-schema.js:824`、`api-plan-schema.js:1356` 都走
 *    `providers.loadVendorSlugs()`；`landing.js:389` 走它自己那份），
 *    所以合并属**本轮范围外**的重构：真值一样不代表调用形状一样。
 *    失效方式：谁「顺手」把这里改成 re-export landing/providers 的实现，就会把
 *    landing → audience/categories → … 的依赖链拖进来，而本文件的价值恰恰是
 *    **零业务依赖、谁都能 require**（只碰 `fs` / `path` 两个内置模块）。
 */

const fs = require('fs');
const path = require('path');

/* ------------------------------------------------------------------ */
/* 站点常量（页面壳 / JSON-LD / sitemap / 目录页 / 厂商页 / 订阅层共用）   */
/* ------------------------------------------------------------------ */

const SITE_URL = 'https://buguoshixc.github.io/ai-deals-aggregator/';
const SITE_NAME = 'AI 优惠聚合器';
const SITE_DESCRIPTION = '聚合国内外 AI 大模型的真实优惠：新用户免费额度、免费模型、学生/教师/非营利折扣、限时促销。全部指向厂商官方页。';

/**
 * 厂商页（与厂商订阅）的生成门槛。**按真实数据分布定，不是拍脑袋**（实测见报告）：
 * 交付日 80 条优惠分布在 33 家厂商里，`当前有效优惠 >= 2` 命中 **9 家**；
 * `历史变更事件 >= 3` 当时命中 0 家。
 *
 * 第二条不是装饰：事件日志是**只追加**的，所以一旦某家厂商攒够 3 条事件，
 * 这个条件就永久为真 —— 它同时是「订阅 URL 稳定性」的兜底，
 * 防止某家厂商从 2 条掉到 1 条时订阅地址凭空消失。
 *
 * 失效方式：门槛若在页面侧与断言侧各写一遍，就会被「两处各改一半」悄悄分叉，
 * 所以两份消费者都从这一处取（`build-local.js:3494` 传参、`:7236` 断言回读）。
 */
const VENDOR_THRESHOLDS = { minDeals: 2, minEvents: 3 };

/**
 * 厂商 slug 表的位置。人工维护，错误由 `validateVendorSlugs()` 与自测报出来。
 *
 * ⚠️ 路径按 `__dirname` 解析（`scripts/lib/` → `scripts/data/`），**不是**进程 cwd：
 * 所以从仓库根、从 `dist/`、从工具目录运行都指向同一份文件。
 * 失效方式：把 `scripts/data/` 整体挪窝 ⇒ 下面的 `loadVendorSlugs()` 在 require 时
 * 直接抛 `ENOENT`，构建当场红（这是要的 fail-fast，而不是静默拿到空表）。
 */
const VENDOR_SLUGS_FILE = path.join(__dirname, '..', 'data', 'vendor-slugs.json');

/**
 * 读厂商 slug 表。跳过 `_` 开头的键：那张文件里用 `_comment` / `_note` 之类的键
 * 写口径说明，把它们当成厂商 slug 会凭空长出「名为 `_comment` 的厂商」。
 *
 * `file` 可传：自测要拿夹具文件当输入，不必改真数据。
 */
function loadVendorSlugs(file = VENDOR_SLUGS_FILE) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const out = {};
  for (const key of Object.keys(raw)) {
    if (key.startsWith('_')) continue;
    out[key] = String(raw[key]);
  }
  return out;
}
/** 求真值：模块加载时读一次（见文件头 ②）。不要在调用点就地替换成另一份对象。 */
const VENDOR_SLUGS = loadVendorSlugs();

/* ------------------------------------------------------------------ */
/* XML 转义（RSS 里一个裸 & 就能让整份 feed 解析失败）                    */
/* ------------------------------------------------------------------ */

/**
 * 文本 → XML/HTML 安全文本：五字符转义，`null` / `undefined` 一律当空串。
 *
 * 为什么 `null` 要当空串而不是 `"null"`：调用点大量是「可能没有的字段」
 * （`<description>${xmlEscape(item.text)}</description>`），写成 `null` 会让读者
 * 看见四个字母；抛错则会把「数据缺失」升级成构建失败，而缺失本身是既有事实。
 */
function xmlEscape(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

module.exports = {
  SITE_URL,
  SITE_NAME,
  SITE_DESCRIPTION,
  VENDOR_THRESHOLDS,
  VENDOR_SLUGS_FILE,
  loadVendorSlugs,
  VENDOR_SLUGS,
  xmlEscape
};
