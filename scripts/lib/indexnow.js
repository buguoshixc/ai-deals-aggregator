/**
 * IndexNow —— 「内容变了 → 主动通知搜索引擎」这条链路的**唯一实现**（纯函数，不读盘、不联网、不看时钟）。
 *
 * ## 这个模块解决什么
 *
 * `sitemap.xml` 是**被动**的：它告诉搜索引擎「本站有这些页、各自的最后修改日」，但爬虫什么时候来
 * 由对方决定。IndexNow 是**主动**的那一半：把「刚刚变了的 URL」POST 给 `api.indexnow.org`，
 * 由它分发给所有参与引擎（Bing / Yandex / Seznam / Naver —— 协议规定提交会被自动共享）。
 * Bing 侧的价值不在排名，而在**时效**：Bing 的索引是 Copilot 与 AI 检索回答的底座之一。
 *
 * ## 判据是「哪些 URL 变了」—— 而这件事本站已经有一份真值
 *
 * 本仓的 sitemap 里 `<lastmod>` **不是构建时刻，而是数据日**（`build-local.js` 由
 * `payload.updatedAt` 派生，见该文件里 `const lastmod = String(payload.updatedAt...).slice(0, 10)`）。
 * 于是「变了没有」不需要任何新机制：
 *
 *   本次要通知的 URL  ＝ `<lastmod>` **等于今天（北京）** 的那些 URL。
 *
 * 没有数据变更的那一天，`lastmod` 不前进（`collect.js` 零产出时**不写盘** ⇒ 没有提交 ⇒ 不部署），
 * 于是 `changedUrls()` 返回空数组、一次通知都不发。这条性质是刻意保留的：sitemap 已经在说
 * 「最后修改日」，IndexNow 只该缩短**延迟**，不该把同一句话说很多遍。
 *
 * ## 三个刻意的选择（每条都对应一种真实失效方式）
 *
 * ① **空输入/坏输入一律抛错，不返回空数组**（本仓的「输入为空不许判绿」，同 `published-assets.js` 纪律 ①）。
 *    「这份 sitemap 一条 URL 都没有」与「今天没有 URL 变更」是两件完全不同的事：前者意味着
 *    文件没生成、路径拼错、或者拿到了一份 404 的 HTML —— 把它当成「无需通知」会让整条链路
 *    静默停摆。所以 `parseSitemap()` 对空 `<urlset>`、缺 `<urlset>`、非法 `<loc>` / `<lastmod>` 直接抛错。
 *    只有「解析成功、但今天没有匹配项」才返回空数组。
 *
 * ② **作用域按 keyLocation 推导，不接受任意 URL**。IndexNow 的 Option 2 规定：密钥文件在
 *    `…/catalog/<key>.txt` 时，只能用这个密钥提交 `…/catalog/` 以下的 URL（协议原文如此）。
 *    本站是 GitHub Pages 的**项目站**（`buguoshixc.github.io` 是共享主机，我们只控制
 *    `/ai-deals-aggregator/` 这个子路径），所以只能走 Option 2 —— 好处是作用域天然被锁死在
 *    自己的子目录里，不会替同一主机上的其它站点背书。`buildPayload()` 会逐条核对这件事。
 *
 * ③ **密钥不藏在别处，它就是本文件里的一个常量**。IndexNow 的密钥**按设计必须公开**
 *    （它要被搜索引擎 GET 到才算证明归属），所以提交进仓库不是泄密 —— 这与
 *    `BingSiteAuth.xml` 把令牌明文放在仓库根是同一条理由。反过来，正因为它必须公开，
 *    把它放进 GitHub Secret 反而会让「线上那份文件到底等于哪个密钥」变成两处真值。
 *
 * ## 已知的粒度限制（写在这里，避免下一个人以为是 bug）
 *
 * `<lastmod>` 是**日粒度**：数据日推进一天，130 余条 URL 同时"变了"。所以同一天的第二次
 * 采集会再通知一遍同一批 URL（一天至多两次）。这是 sitemap 口径本身的粒度，不是本模块的选择 ——
 * 要做细到「哪一条优惠改了」，得先有逐页变更追踪，那是另一件事（今天刻意不做）。
 *
 * ## 唯一表纪律
 *
 * 密钥文件名与 keyLocation **只在本文件出现**：`build-local.js` 落盘时取 `keyFileName()`，
 * `published-assets.js` 登记时也取它。两处都不许写第二份字面量 —— 这条由
 * `indexnow-selftest.js` 的「字面量扫描」牙复核（本文件之外出现 `<key>.txt` 即判红）。
 */

const { SITE_URL } = require('./site');

/** 协议端点。POST 到这里，由它分发给所有参与引擎（不是只给 Bing）。 */
const ENDPOINT = 'https://api.indexnow.org/indexnow';

/**
 * 本站的 IndexNow 密钥（32 位十六进制，符合协议的 8–128 位 `[A-Za-z0-9-]` 约束）。
 *
 * 为什么是常量而不是从环境变量读：见文件头 ③。密钥的**证明力**来自「它被原样发布在站点上」，
 * 而不是来自它保密 —— 环境的可变性只会让「本地算出的 payload」与「线上那份文件」有机会不一致。
 */
const KEY = '8c538ee11547009de0fadcebbae5fc91';

/** 协议约束：8–128 位，只允许 `a-z A-Z 0-9 -`。 */
const KEY_RE = /^[A-Za-z0-9-]{8,128}$/;

/** 协议约束：单次 POST 至多 10,000 条 URL。 */
const MAX_URLS_PER_POST = 10000;

/** 日期口径与全站一致：`YYYY-MM-DD`（`lib/schema.js` 的 `todayCN()` 产出同口径）。 */
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 密钥是否满足协议约束（长度 + 字符集）。 */
function isValidKey(key) {
  return typeof key === 'string' && KEY_RE.test(key);
}

/**
 * 密钥文件名：`<key>.txt`（协议 Option 1/2 都要求「文件名就是密钥、内容也是密钥」）。
 * 这是本站落盘该文件与推导 keyLocation 的**唯一出处**。
 */
function keyFileName(key = KEY) {
  return `${key}.txt`;
}

/**
 * 密钥文件的**内容**：就是密钥本身，**不带结尾换行**。
 *
 * 为什么不加换行：Bing 抓的是这个路径下的这份内容，多一个字节就多一处「格式是否被接受」的
 * 不确定性 —— 而这里没有任何理由去赌（协议只要求「文件里列出密钥」）。自测里有一条牙逐字节
 * 断言这件事，避免将来有人"顺手格式化一下"。
 */
function keyFileContent(key = KEY) {
  return key;
}

/**
 * keyLocation：密钥文件的**绝对 URL**。POST 时必须带上它 —— 少了它，搜索引擎会去主机根找
 * `…/<key>.txt`，而项目站的主机根不归我们控制，找不到就是 403。
 */
function keyLocation(key = KEY, siteUrl = SITE_URL) {
  return `${siteUrl}${keyFileName(key)}`;
}

/** payload 里的 `host` 字段：只要主机名（不含协议与路径）。 */
function hostOf(siteUrl = SITE_URL) {
  return new URL(siteUrl).host;
}

/**
 * 由 keyLocation 推出**允许提交的 URL 前缀**（协议 Option 2 的作用域规则）。
 *
 * 协议原文的例子：密钥在 `http://example.com/catalog/key.txt` ⇒ 可提交 `http://example.com/catalog/`
 * 以下的 URL，**不能**提交 `http://example.com/help/` 的。所以前缀 = keyLocation 里最后一个 `/`
 * 之前的部分（含 `/`）。
 */
function scopePrefixOf(keyLoc = keyLocation()) {
  const cut = String(keyLoc).lastIndexOf('/');
  if (cut <= 0) throw new Error(`keyLocation 不是合法的绝对 URL：${keyLoc}`);
  return String(keyLoc).slice(0, cut + 1);
}

/**
 * 解析 sitemap，返回 `[{ loc, lastmod }]`（保持文档顺序）。
 *
 * fail-closed（纪律 ①）：拿不到 `<urlset>`、一条 `<url>` 都没有、或某条的 `loc` / `lastmod`
 * 形状非法 —— 全部抛错。绝不把「读不到」降级成「没有变更」。
 */
function parseSitemap(xml) {
  const text = typeof xml === 'string' ? xml : '';
  if (!text.includes('<urlset')) {
    throw new Error('sitemap 里没有 <urlset> —— 多半是产物缺失或拿到了一份 404 页面'
      + '（把它当成「今天没有变更」会让通知链路静默停摆，所以这里直接失败）');
  }
  const blocks = text.match(/<url\b[\s\S]*?<\/url>/g) || [];
  if (!blocks.length) {
    throw new Error('sitemap 的 <urlset> 里一条 <url> 都没有（输入为空不许判绿：先确认这份 sitemap 真的是本次构建产出的）');
  }
  const entries = [];
  for (const block of blocks) {
    const loc = (block.match(/<loc>([\s\S]*?)<\/loc>/) || [])[1];
    const lastmod = (block.match(/<lastmod>([\s\S]*?)<\/lastmod>/) || [])[1];
    if (!loc) throw new Error(`sitemap 有一条 <url> 没有 <loc>：${block.slice(0, 120)}`);
    const trimmed = loc.trim();
    if (!/^https?:\/\//i.test(trimmed)) throw new Error(`sitemap 的 <loc> 不是绝对 URL：${trimmed}`);
    if (!lastmod) throw new Error(`sitemap 的 <loc> 没有 <lastmod>：${trimmed}`);
    const day = lastmod.trim();
    if (!DAY_RE.test(day)) throw new Error(`sitemap 的 <lastmod> 不是 YYYY-MM-DD：${trimmed} → ${day}`);
    entries.push({ loc: trimmed, lastmod: day });
  }
  return entries;
}

/**
 * sitemap 里**最新**的 `<lastmod>`（= 本次构建的数据日）。
 *
 * 它只用于诊断输出（「最新数据日 10-17 · 今天 10-18 ⇒ 本次没有今天的变更」），不参与判据 ——
 * 判据是「等于今天」，不是「等于最大值」：一个只改了模板、数据日没前进的提交不该触发通知。
 */
function newestDay(xml) {
  const days = parseSitemap(xml).map(entry => entry.lastmod).sort();
  return days.length ? days[days.length - 1] : null;
}

/**
 * **判据本体**：`<lastmod>` 等于 `day` 的那些 URL（去重、保持文档顺序）。
 *
 * @param {string} xml  sitemap 内容
 * @param {string} day  `YYYY-MM-DD`（调用方注入 —— 本模块不看时钟，见文件头）
 * @returns {string[]}  要通知的 URL；解析成功但今天没有匹配项时是**空数组**（这是合法结果）
 */
function changedUrls(xml, day) {
  if (typeof day !== 'string' || !DAY_RE.test(day)) {
    throw new Error(`day 必须是 YYYY-MM-DD（收到 ${JSON.stringify(day)}）`);
  }
  const seen = new Set();
  const out = [];
  for (const entry of parseSitemap(xml)) {
    if (entry.lastmod !== day) continue;
    if (seen.has(entry.loc)) continue;
    seen.add(entry.loc);
    out.push(entry.loc);
  }
  return out;
}

/** 逐条核对 URL 是否落在 keyLocation 的作用域内（协议 Option 2），返回问题清单（空 = 通过）。 */
function checkUrlsInScope(urls, keyLoc = keyLocation()) {
  const prefix = scopePrefixOf(keyLoc);
  const problems = [];
  for (const url of urls) {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      problems.push(`不是绝对 URL：${JSON.stringify(url)}`);
      continue;
    }
    if (!url.startsWith(prefix)) {
      problems.push(`${url} 不在密钥作用域 ${prefix} 之内`
        + '（协议 Option 2：密钥文件所在目录决定了这个密钥能提交哪些 URL）');
    }
  }
  return problems;
}

/**
 * 组装 POST 体（字段顺序与协议示例一致：host / key / keyLocation / urlList）。
 *
 * 校验全部前置在这里：密钥非法、URL 为空、超过 10,000 条、有 URL 越出作用域 —— 一律抛错。
 * 「空 urlList」是非法请求（服务端 400），所以**不允许**构造出这样一份 payload：
 * 调用方必须先判定「今天有没有变更」，再决定要不要构造。
 */
function buildPayload({ urls, key = KEY, siteUrl = SITE_URL } = {}) {
  if (!isValidKey(key)) {
    throw new Error(`IndexNow 密钥不满足协议约束（8–128 位，只允许 a-z A-Z 0-9 -）：${JSON.stringify(key)}`);
  }
  if (!Array.isArray(urls)) throw new Error('urls 必须是数组');
  const urlList = [...new Set(urls)];
  if (!urlList.length) {
    throw new Error('urlList 为空不是一次合法的 IndexNow 请求（服务端会回 400）——'
      + '调用方应先判定今天有没有变更，没有变更就不该构造 payload');
  }
  if (urlList.length > MAX_URLS_PER_POST) {
    throw new Error(`urlList 有 ${urlList.length} 条，超过协议上限 ${MAX_URLS_PER_POST}`);
  }
  const keyLoc = keyLocation(key, siteUrl);
  const scopeProblems = checkUrlsInScope(urlList, keyLoc);
  if (scopeProblems.length) {
    throw new Error(`有 ${scopeProblems.length} 条 URL 不能由这个密钥提交：${scopeProblems.slice(0, 3).join('；')}`);
  }
  return { host: hostOf(siteUrl), key, keyLocation: keyLoc, urlList };
}

module.exports = {
  ENDPOINT,
  KEY,
  MAX_URLS_PER_POST,
  isValidKey,
  keyFileName,
  keyFileContent,
  keyLocation,
  hostOf,
  scopePrefixOf,
  parseSitemap,
  newestDay,
  changedUrls,
  checkUrlsInScope,
  buildPayload
};
