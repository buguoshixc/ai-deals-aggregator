#!/usr/bin/env node
/**
 * secondary-page-layout-unification · 改动前后**全产物**内容对账（t3 证据）
 *
 * 为什么要有它：本次是纯布局改动。除「共享 <style> 里新增的 9 行」与「8 个页面壳里删掉的
 * 8 条 `.snote` 副本」之外，**任何一页的任何一个字节都不该变**。这句话必须由机器回答，
 * 不能靠肉眼读 diff。
 *
 * 判据分三层（缺一层就有一个盲区）：
 *   ① 文件集合相同（多一个/少一个文件都算夹带）；
 *   ② 非 HTML 文件（json / xml / css / txt / ico / png）**逐字节相同** —— 数据层零变化；
 *   ③ 每个 HTML 页：剥掉**全部** `<style>…</style>` 块之后，正文**逐字节相同**
 *      —— 内容一个字都没丢、没多（含 JSON-LD、canonical、sitemap 链接、正文文案）；
 *   ④ 每个 HTML 页的样式块：after 相对 before 的**行集合差**必须恰好等于预期的那几条
 *      （多一行或少一行都算"夹带了别的改动"）。逐条列出来，不写"若干处"。
 *
 * 与 leaf-detail-layout-v1 的同名脚本的差别：那一版还要剥掉 `<main class="detail-main">`
 * 这个 class（它动了标签属性）；本轮**不改任何 HTML 属性**，所以正文是逐字节比，
 * 不做任何 class 剥离 —— 判据更紧。
 *
 * 用法：
 *   node research/_raw/secondary-page-layout-unification/diff/before-after-compare.cjs \
 *        --before=dist.baseline --after=dist \
 *        --out=research/_raw/secondary-page-layout-unification/diff/before-after-compare.json
 */

'use strict';

const fs = require('fs');
const path = require('path');

const arg = name => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const ROOT = path.join(__dirname, '..', '..', '..', '..');
const resolve = p => (path.isAbsolute(p) ? p : path.join(ROOT, p));
const BEFORE = resolve(arg('before') || 'dist.baseline');
const AFTER = resolve(arg('after') || 'dist');
const OUT = arg('out');
if (!fs.existsSync(BEFORE) || !fs.existsSync(AFTER)) {
  console.error('用法：--before=<dir> --after=<dir> [--out=<json>]（两个目录都必须存在）');
  process.exit(2);
}

/** fail-closed：两个目录必须**看起来就是构建产物**（防止把仓库根当 dist 传进来）。 */
const looksLikeBuiltSite = dir => {
  const has = rel => fs.existsSync(path.join(dir, rel));
  const sourceMarkers = ['.git', 'package.json', 'scripts', '.agent-teams'].filter(has);
  return {
    ok: has('index.html') && has('sitemap.xml') && sourceMarkers.length === 0,
    reason: !has('index.html') ? '缺 index.html'
      : !has('sitemap.xml') ? '缺 sitemap.xml'
        : sourceMarkers.length ? `根下出现了源码特征：${sourceMarkers.join('/')}（这看起来是仓库根，不是产物目录）`
          : ''
  };
};
for (const [label, dir] of [['--before', BEFORE], ['--after', AFTER]]) {
  const verdict = looksLikeBuiltSite(dir);
  if (!verdict.ok) {
    console.error(`❌ ${label} 指向的不是构建产物：${dir}\n   ${verdict.reason}`);
    process.exit(2);
  }
}

/** 目录 → 相对路径(POSIX) → 绝对路径 */
function walk(dir) {
  const out = new Map();
  const stack = [''];
  while (stack.length) {
    const rel = stack.pop();
    for (const entry of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) stack.push(relPath);
      else out.set(relPath, path.join(dir, relPath));
    }
  }
  return out;
}

const isHtml = rel => rel.toLowerCase().endsWith('.html');
const STYLE_BLOCK = /<style[\s\S]*?<\/style>/g;
/** 剥掉全部 <style>…</style>（替换成定长标记，避免"剥掉后长度恰好相同"造成的错觉） */
const stripStyles = html => html.replace(STYLE_BLOCK, '<!--STYLE-->');
/** 取出页面里全部样式块的行（顺序保留、逐行 trim、去空行） */
const styleLines = html => (html.match(STYLE_BLOCK) || [])
  .flatMap(block => block.replace(/^<style[^>]*>|<\/style>$/g, '').split('\n').map(line => line.trim()))
  .filter(Boolean);

const beforeFiles = walk(BEFORE);
const afterFiles = walk(AFTER);
const problems = [];

/**
 * 预期的新增样式行（逐字来自 `git diff index.html`，9 行：8 行解释注释 + 1 条冻结规则）。
 * 多一行都算夹带 —— 所以这里是白名单，不是"至少包含"。
 */
const EXPECTED_ADDED_LINES = [
  '/* 页面级说明（Page-level Note）：与上一条 `.detail-main` 同一条纪律 —— **宽度只写在这里**。',
  '为什么是 `max-width: none`：说明是**这一页的导语**，不是一篇独立文章。它属于数据型页面',
  '（Wide Data Page，见 scripts/lib/page-kinds.js 的 LAYOUT_FAMILIES），',
  '与表格 / 列表**同轴**、跟随站点数据容器（`.wrap`）；把它压成阅读列（12px 字体下约 420px，',
  '而主数据区是 1380px）会让同一页的说明看起来像"另一页的内容"。',
  '文档序上这份共享 <style> 先于各页面壳自己的局部 <style>，所以只要页面壳里不再复制第二份',
  '`.snote` 规则，这里就是「一处定义、全站生效」。真需要收窄的阅读列页面，',
  '请去 LAYOUT_FAMILIES 登记一个新族，而不是就地改宽度。 */',
  '.snote { color: var(--mut); font-size: var(--fs-sm); line-height: 1.7; margin: 0 0 var(--s3); max-width: none; overflow-wrap: anywhere; }'
];
/**
 * 预期的删除样式行（逐字来自 `git diff scripts/tools/build-local.js`）。
 * 16 行删除行里只有 **2 条不同的字符串**：8 个壳各有一份副本，其中 4 份 `max-width: 70ch`、
 * 4 份 `max-width: none` —— 这正是"同一条规则 8 份副本、两种取值"的直接读数。
 */
const EXPECTED_REMOVED_LINES = [
  '.snote { color: var(--mut); font-size: var(--fs-sm); line-height: 1.7; margin: 0 0 var(--s3); max-width: 70ch; }',
  '.snote { color: var(--mut); font-size: var(--fs-sm); line-height: 1.7; margin: 0 0 var(--s3); max-width: none; }'
];

const stats = {
  beforeFiles: beforeFiles.size, afterFiles: afterFiles.size,
  htmlPages: 0, nonHtmlFiles: 0, nonHtmlByteIdentical: 0,
  htmlBodyIdentical: 0, perPageByteDeltaSum: 0
};

// ① 文件集合
for (const rel of beforeFiles.keys()) if (!afterFiles.has(rel)) problems.push(`after 少了文件：${rel}`);
for (const rel of afterFiles.keys()) if (!beforeFiles.has(rel)) problems.push(`after 多了文件：${rel}`);

const globalAdded = new Set();
const globalRemoved = new Set();
const bodyMismatch = [];
const perPage = [];

for (const rel of [...beforeFiles.keys()].sort()) {
  if (!afterFiles.has(rel)) continue;
  const beforeBuf = fs.readFileSync(beforeFiles.get(rel));
  const afterBuf = fs.readFileSync(afterFiles.get(rel));

  if (!isHtml(rel)) {
    stats.nonHtmlFiles++;
    if (Buffer.compare(beforeBuf, afterBuf) === 0) stats.nonHtmlByteIdentical++;
    else problems.push(`非 HTML 文件字节不同：${rel}`);
    continue;
  }

  stats.htmlPages++;
  const before = beforeBuf.toString('utf8');
  const after = afterBuf.toString('utf8');
  const bodyBefore = stripStyles(before);
  const bodyAfter = stripStyles(after);
  const bodySame = bodyBefore === bodyAfter;
  if (bodySame) stats.htmlBodyIdentical++;
  else bodyMismatch.push(rel);
  const delta = bodyAfter.length - bodyBefore.length;
  stats.perPageByteDeltaSum += delta;

  const beforeSet = new Set(styleLines(before));
  const afterSet = new Set(styleLines(after));
  const added = [...afterSet].filter(line => !beforeSet.has(line));
  const removed = [...beforeSet].filter(line => !afterSet.has(line));
  for (const line of added) globalAdded.add(line);
  for (const line of removed) globalRemoved.add(line);
  perPage.push({
    route: rel === 'index.html' ? '' : rel.replace(/index\.html$/, ''),
    file: rel,
    beforeBytes: beforeBuf.length, afterBytes: afterBuf.length,
    bodyBytesBefore: bodyBefore.length, bodyBytesAfter: bodyAfter.length,
    bodyByteDelta: delta,
    bodyIdentical: bodySame,
    styleAdded: added, styleRemoved: removed
  });
}

if (bodyMismatch.length) {
  problems.push(`有 ${bodyMismatch.length} 个 HTML 页在剥掉全部 <style> 块之后正文仍不同（内容被改动了）：`
    + bodyMismatch.slice(0, 8).join('、'));
}

const unexpectedAdded = [...globalAdded].filter(line => !EXPECTED_ADDED_LINES.includes(line));
const unexpectedRemoved = [...globalRemoved].filter(line => !EXPECTED_REMOVED_LINES.includes(line));
const missingAdded = EXPECTED_ADDED_LINES.filter(line => !globalAdded.has(line));
const missingRemoved = EXPECTED_REMOVED_LINES.filter(line => !globalRemoved.has(line));
if (unexpectedAdded.length) problems.push(`样式块里出现了预期之外的**新增**行（${unexpectedAdded.length} 条）：${unexpectedAdded.join(' | ')}`);
if (unexpectedRemoved.length) problems.push(`样式块里出现了预期之外的**删除**行（${unexpectedRemoved.length} 条）：${unexpectedRemoved.join(' | ')}`);
if (missingAdded.length) problems.push(`预期的新增样式行没有出现（${missingAdded.length} 条）：${missingAdded.join(' | ')}`);
if (missingRemoved.length) problems.push(`预期的删除样式行没有出现（${missingRemoved.length} 条）：${missingRemoved.join(' | ')}`);

const pagesWithStyleDelta = perPage.filter(page => page.styleAdded.length || page.styleRemoved.length);
const report = {
  before: EXPECTED_ADDED_LINES.length ? path.relative(ROOT, BEFORE).replace(/\\/g, '/') : BEFORE,
  after: path.relative(ROOT, AFTER).replace(/\\/g, '/'),
  at: new Date().toISOString(),
  stats,
  styleDelta: {
    distinctAdded: [...globalAdded].sort(),
    distinctRemoved: [...globalRemoved].sort(),
    expectedAdded: EXPECTED_ADDED_LINES,
    expectedRemoved: EXPECTED_REMOVED_LINES,
    pagesWithStyleDelta: pagesWithStyleDelta.map(page => ({ route: page.route, added: page.styleAdded.length, removed: page.styleRemoved.length }))
  },
  pages: perPage,
  problems
};

console.log(`改动前：${report.before}`);
console.log(`改动后：${report.after}`);
console.log(`文件数：${stats.beforeFiles} → ${stats.afterFiles}（HTML ${stats.htmlPages} 页 · 非 HTML ${stats.nonHtmlFiles} 个）`);
console.log(`② 非 HTML 文件逐字节相同：${stats.nonHtmlByteIdentical}/${stats.nonHtmlFiles}`);
console.log(`③ HTML 页剥掉全部 <style> 块后正文逐字节相同：${stats.htmlBodyIdentical}/${stats.htmlPages}（正文字节差合计 ${stats.perPageByteDeltaSum}）`);
console.log(`④ 样式块行集合差（去重后）：+${[...globalAdded].length} / -${[...globalRemoved].length}（涉及 ${pagesWithStyleDelta.length} 个页面）`);
console.log('  新增行（逐条）：');
for (const line of [...globalAdded].sort()) console.log(`    + ${line}`);
console.log('  删除行（逐条）：');
for (const line of [...globalRemoved].sort()) console.log(`    - ${line}`);
if (problems.length) {
  console.log(`\n❌ ${problems.length} 处问题：`);
  problems.forEach(p => console.log(`   ✗ ${p}`));
} else {
  console.log('\n✅ 除预期的 9 条新增样式行与 2 条被删的重复宽度副本之外，全产物逐字节一致（正文零增减、数据零变化）');
}

if (OUT) {
  const outPath = resolve(OUT);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`证据已写出：${path.relative(ROOT, outPath).replace(/\\/g, '/')}`);
}
process.exit(problems.length ? 1 : 0);
