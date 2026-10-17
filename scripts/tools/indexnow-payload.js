'use strict';
/**
 * `indexnow-payload.js` —— 把**本次构建的 sitemap** 变成一份可以直接 POST 的 IndexNow 请求体。
 *
 * ## 它做什么、不做什么
 *
 * 做：读 `<dir>/sitemap.xml` → 取 `<lastmod>` 等于「今天（北京）」的 URL → 组装 payload →
 * 写进 `$GITHUB_OUTPUT`（或打到 stdout）。
 * **不做：它从不联网**。发送是 `deploy.yml` 里的一步 `curl` —— 分工是刻意的：
 * 「算哪些 URL 变了」是可离线自测的纯逻辑（`lib/indexnow.js`），
 * 「什么时候发」是发布链的时序问题（必须在站点**已经上线之后**发，否则爬虫可能拿到旧内容）。
 *
 * 为什么算与发要**跨 job**：`deploy` job 里没有 checkout（发布链的 uses 集合是冻结的，
 * 不许再加 `actions/checkout`），所以它拿不到 `dist/`；而它又是唯一「站点已经上线」的时点。
 * 于是本工具在 `build` job 里跑、把 payload 作为 **job output** 交给 `deploy` job 去发。
 * 这样判据仍然只有一份实现（本工具 + lib），`deploy` 那一步只负责转发一个字符串。
 *
 * ## 产出（`--github-output=<file>` 时写入的键）
 *
 *   count        今天要通知的 URL 条数（0 = 今天没有变更，**不是错误**）
 *   payload      单行 JSON（count=0 时是空串 —— 空 urlList 是非法请求，不许发）
 *   day          本次判据用的「今天」
 *   newest_day   sitemap 里最新的 <lastmod>（= 本次构建的数据日，仅用于日志与 Summary）
 *   key_location 密钥文件地址（写进日志，便于人工核对）
 *
 * ## 退出码
 *
 *   0 = 算完了（无论有没有变更）
 *   1 = **算不出来**：sitemap 缺失 / 不是 sitemap / 没有 <url> / 形状非法 ——
 *       这些都必须响亮地失败（本仓的「输入为空不许判绿」）。把「读不到产物」当成
 *       「今天没有变更」会让整条通知链路静默停摆，而那正是最难发现的一类坏。
 */

const fs = require('fs');
const path = require('path');

const indexnow = require('../lib/indexnow');
const { todayCN } = require('../lib/schema');

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const hit = argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const OUT_DIR = argOf('dir', 'dist');
/** 「今天」的口径与全站一致（`lib/schema.js` 的 `todayCN()`：+8 小时、无夏令时）。 */
const DAY = argOf('day', todayCN());
const GITHUB_OUTPUT = argOf('github-output', null);
const PRINT_PAYLOAD = argv.includes('--print-payload');

function fail(message) {
  console.error(`\n❌ IndexNow payload 算不出来：${message}`);
  process.exit(1);
}

const sitemapPath = path.join(OUT_DIR, 'sitemap.xml');
if (!fs.existsSync(sitemapPath)) {
  fail(`${sitemapPath} 不存在 —— 产物缺失时不许退化成「今天没有变更」，先跑构建（npm run build）`);
}

let sitemap;
try {
  sitemap = fs.readFileSync(sitemapPath, 'utf8');
} catch (error) {
  fail(`读不到 ${sitemapPath}：${error.message}`);
}

let urls;
let newest;
try {
  urls = indexnow.changedUrls(sitemap, DAY);
  newest = indexnow.newestDay(sitemap);
} catch (error) {
  fail(`${sitemapPath} 解析失败：${error.message}`);
}

let payload = '';
if (urls.length) {
  try {
    payload = JSON.stringify(indexnow.buildPayload({ urls }));
  } catch (error) {
    fail(`组装 payload 失败：${error.message}`);
  }
}

const keyLoc = indexnow.keyLocation();
const lines = [];
lines.push(`IndexNow payload · 产物 ${OUT_DIR}/sitemap.xml`);
lines.push(`  判据日（今天，北京）：${DAY}`);
lines.push(`  sitemap 最新数据日：${newest || '(无)'}`);
lines.push(`  待通知 URL：${urls.length} 条`);
lines.push(`  密钥文件：${keyLoc}`);
if (!urls.length) {
  lines.push('  → 本次**不发送**：没有 <lastmod> 等于今天的 URL'
    + '（数据日没有前进，或这次提交没有带新数据）。这是正常结果，不是错误。');
} else {
  lines.push(`  → payload 已就绪（${payload.length} 字节，${indexnow.ENDPOINT}）`);
}
console.log(lines.join('\n'));

if (PRINT_PAYLOAD) {
  if (payload) console.log(payload);
  else console.log('(空 —— 今天没有变更，没有 payload 可打)');
}

if (GITHUB_OUTPUT) {
  const write = (key, value) => fs.appendFileSync(GITHUB_OUTPUT, `${key}=${value}\n`, 'utf8');
  // payload 是**单行** JSON（JSON.stringify 不产生换行），所以普通的 key=value 写法就够 ——
  // 不需要 heredoc 那套多行语法，少一处能写错的地方。
  write('count', String(urls.length));
  write('payload', payload);
  write('day', DAY);
  write('newest_day', newest || '');
  write('key_location', keyLoc);
}
