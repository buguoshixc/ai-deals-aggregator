/**
 * t31 复现脚本：`/0 条/` 子串匹配把 `10 条` 当空态（T28-F1 blocker）。
 *
 * 两段证据：
 *   ① 判据层：把「这一行是不是 0 条」的**旧写法**（裸 `/0 条/`）与**新判据**
 *      （`feeds.isZeroCountRow`，数字边界）在同一组串上逐条对照 —— 旧写法把
 *      `10 条` / `20 条` / `30 条` / `80 条` / `100 条` / `1,000 条` 全部当成空态。
 *   ② 现场层：从**真实产物** `dist/feeds/index.html` 抽出正文文本，按
 *      `verify-site.js` 的同一条路径（标题下标 + 260 字符窗口）取出两条变化流的窗口，
 *      打印窗口原文 + 实际条数 + 旧/新判据的结论 + 断言的判定路径。
 *
 * 只读；不写任何生产文件。
 * 用法：node research/_raw/t31/repro-zero-count-substring.cjs [distDir]
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const DIST = path.resolve(ROOT, process.argv[2] || 'dist');
const feeds = require(path.join(ROOT, 'scripts', 'lib', 'feeds.js'));

/** 旧写法（缺陷本体）：裸子串 */
const legacyZeroRow = text => /0 条/.test(String(text || ''));

console.log('=== ① 判据层：旧写法 vs 新判据（数字边界） ===');
const cases = [
  ['空态行（真空态）', 'Coding 套餐变化 0 条（变更记录自 2026-09-30 起）'],
  ['10 条', 'API 价格变化 最近变化 10 条 · 最近一条 2026-10-04'],
  ['20 条', '最近变化 20 条'],
  ['30 条', '最近变化 30 条'],
  ['80 条', '最近变化 80 条'],
  ['100 条', '最近变化 100 条'],
  ['1,000 条', '最近变化 1,000 条'],
  ['前接标点 0 条', '（0 条）'],
  ['行首 0 条', '0 条'],
  ['行尾 0 条', '最近变化 0 条'],
  ['0条（无空格）', '最近变化 0条'],
  ['10 条 + 另一行 0 条', '最近变化 10 条；API 价格变化 0 条']
];
let legacyWrong = 0;
for (const [label, text] of cases) {
  const legacy = legacyZeroRow(text);
  const now = feeds.isZeroCountRow(text);
  const same = legacy === now;
  if (!same) legacyWrong += 1;
  console.log(`  ${same ? ' ' : '≠'} ${label.padEnd(18)} 旧=${String(legacy).padEnd(5)} 新=${String(now).padEnd(5)} ${same ? '' : '← 旧写法在这里判错'}  「${text.slice(0, 60)}」`);
}
console.log(`\n旧写法与正确判据不一致的样本：${legacyWrong} 条（全部是"条数以 0 结尾的非空行"）`);

console.log('\n=== ② 现场层：真实产物 dist/feeds/index.html ===');
if (!fs.existsSync(path.join(DIST, 'feeds', 'index.html'))) {
  console.log(`  缺少 ${path.join(DIST, 'feeds', 'index.html')} —— 先跑 npm run build`);
  process.exit(1);
}
const html = fs.readFileSync(path.join(DIST, 'feeds', 'index.html'), 'utf8');
// 与 verify-site 的 feedsPage.text 同口径：正文文本 + 折叠空白（这里用标签剥离近似 textContent）
const text = html
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ')
  .trim();

const countOfFeed = spec => {
  const file = path.join(DIST, spec.path);
  if (!fs.existsSync(file)) return null;
  return (fs.readFileSync(file, 'utf8').match(/<item>/g) || []).length;
};

for (const spec of feeds.PLAN_CHANGE_FEEDS) {
  const items = countOfFeed(spec);
  const idx = text.indexOf(spec.title);
  const row = idx < 0 ? '' : text.slice(idx, idx + 260);
  const legacy = legacyZeroRow(row);
  const now = feeds.isZeroCountRow(row);
  const hasStart = feeds.hasChangeStartDate(row);
  // verify-site 旧断言的判定路径：只对"旧写法认为是空态"的行要求写出起算日
  const legacyVerdict = legacy ? (hasStart ? '通过（恰好窗口里也有起算日）' : '**判红**（要求写起算日却没写）') : '跳过（旧写法认为非空）';
  console.log(`\n  ── 「${spec.title}」 ──`);
  console.log(`  实际条数（${spec.path}）：${items === null ? '文件不存在' : `${items} 条`}`);
  console.log(`  窗口下标 idx=${idx} · 窗口长度 ${row.length}`);
  console.log(`  窗口原文：${JSON.stringify(row.slice(0, 200))}${row.length > 200 ? ' …' : ''}`);
  console.log(`  旧判据 /0 条/ ⇒ ${legacy} · 新判据 ⇒ ${now} · 窗口里有「变更记录自 YYYY-MM-DD 起」⇒ ${hasStart}`);
  console.log(`  旧断言对这条的判定：${legacyVerdict}`);
}

console.log('\n=== 结论 ===');
console.log('旧写法把"条数以 0 结尾的非空行"当成空态；因为窗口是「标题下标 + 260 字符」，');
console.log('Coding 那一行的窗口把下一条（API）行的 `10 条` 也框了进来 ⇒ 两条非空变化流都被要求写起算日 ⇒ 假红。');
