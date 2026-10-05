#!/usr/bin/env node
/**
 * leaf-detail-layout-v1 · 改动前后**全产物**内容对账（captain 证据）
 *
 * 为什么要有它：本次是纯布局改动，因此除「注入的那几条样式规则」与「叶子页 <main> 上的
 * 一个 class」之外，**任何一页的任何一个字节都不该变**。这句话必须由机器回答，
 * 不能靠肉眼读 diff。
 *
 * 判据分三层（缺一层就有一个盲区）：
 *   ① 非 HTML 文件（json / xml / css / png / txt / svg）逐字节相同 —— 数据层与订阅层零变化；
 *   ② 每个 HTML 页：剥掉**全部 <style> 块**、并去掉 <main> 上的 detail-main 之后，正文逐字节相同
 *      —— 内容一个字都没丢、没多；
 *   ③ 每个 HTML 页的样式块：after 相对 before 的**行集合差**必须恰好等于预期的那几条
 *      （多一行或少一行都算"夹带了别的改动"）。
 *
 * 用法：
 *   node research/_raw/leaf-detail-layout-v1/gate/before-after-compare.cjs \
 *        --before=<master 构建的 dist> --after=<改动后的 dist> \
 *        --out=research/_raw/leaf-detail-layout-v1/gate/before-after-compare.json
 */

'use strict';

const fs = require('fs');
const path = require('path');

const arg = name => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const BEFORE = path.resolve(arg('before') || '');
const AFTER = path.resolve(arg('after') || '');
const OUT = arg('out');
if (!BEFORE || !AFTER || !fs.existsSync(BEFORE) || !fs.existsSync(AFTER)) {
  console.error('用法：--before=<dir> --after=<dir> [--out=<json>]（两个目录都必须存在）');
  process.exit(2);
}

/**
 * fail-closed：两个目录必须**看起来就是构建产物**。
 *
 * 为什么加这条：第一次运行本脚本时，PowerShell 把 `--after=(Join-Path $wt 'dist')` 拆坏了，
 * 传进来的其实是仓库根而不是 dist/ —— 脚本于是老老实实去比 `.git/objects` 与
 * `.agent-teams/`，报出两千多条"多余文件"。判据本身没错，错在**输入没被检查**。
 * 因此：缺 sitemap.xml / index.html，或根下出现 .git、package.json 这类源码特征 ⇒ 直接拒绝运行。
 */
const looksLikeBuiltSite = dir => {
  const has = rel => fs.existsSync(path.join(dir, rel));
  const sourceMarkers = ['.git', 'package.json', 'scripts', '.agent-teams'].filter(has);
  return {
    ok: has('index.html') && has('sitemap.xml') && sourceMarkers.length === 0,
    reason: !has('index.html') ? '缺 index.html'
      : !has('sitemap.xml') ? '缺 sitemap.xml'
        : sourceMarkers.length ? `根下出现了源码特征：${sourceMarkers.join('/')}（这看起来是仓库根，不是 dist/）`
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

/** 目录 → 相对路径 → 内容（文本文件读文本，其余读 Buffer） */
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

const isHtml = rel => rel.endsWith('.html');
const isTextual = rel => /\.(html|json|xml|css|txt|svg)$/.test(rel);

/** 剥掉全部 <style>…</style>，再去掉 <main> 上的 detail-main 类 */
const stripPresentation = html => html
  .replace(/<style>[\s\S]*?<\/style>/g, '<!--STYLE-->')
  .replace(/ class="detail-main"/g, '');

/** 取出页面里全部样式块的行（顺序保留） */
const styleLines = html => (html.match(/<style>[\s\S]*?<\/style>/g) || [])
  .flatMap(block => block.replace(/^<style>|<\/style>$/g, '').split('\n').map(line => line.trim()))
  .filter(Boolean);

const beforeFiles = walk(BEFORE);
const afterFiles = walk(AFTER);
const problems = [];
const stats = {
  before: beforeFiles.size, after: afterFiles.size,
  htmlPages: 0, nonHtmlIdentical: 0, contentIdentical: 0, styleLineDelta: null
};

// ① 文件集合相同
for (const rel of beforeFiles.keys()) if (!afterFiles.has(rel)) problems.push(`after 少了文件：${rel}`);
for (const rel of afterFiles.keys()) if (!beforeFiles.has(rel)) problems.push(`after 多了文件：${rel}`);

const styleAdded = new Set();
const styleRemoved = new Set();
const contentMismatch = [];

for (const rel of beforeFiles.keys()) {
  if (!afterFiles.has(rel)) continue;
  const beforePath = beforeFiles.get(rel);
  const afterPath = afterFiles.get(rel);

  if (!isTextual(rel)) {
    // ① 非文本（png 等）逐字节比
    const same = Buffer.compare(fs.readFileSync(beforePath), fs.readFileSync(afterPath)) === 0;
    if (same) stats.nonHtmlIdentical++;
    else problems.push(`非文本文件字节不同：${rel}`);
    continue;
  }

  const before = fs.readFileSync(beforePath, 'utf8');
  const after = fs.readFileSync(afterPath, 'utf8');

  if (!isHtml(rel)) {
    // ② 非 HTML 文本（json / xml / css / txt / svg）逐字节比 —— 数据层零变化的直接证据
    if (before === after) stats.nonHtmlIdentical++;
    else problems.push(`非 HTML 文本内容不同：${rel}`);
    continue;
  }

  stats.htmlPages++;

  // ③ 正文（剥掉样式与那个 class）必须逐字节相同
  if (stripPresentation(before) === stripPresentation(after)) stats.contentIdentical++;
  else contentMismatch.push(rel);

  // ④ 样式块的行集合差
  const beforeSet = new Set(styleLines(before));
  const afterSet = new Set(styleLines(after));
  for (const line of afterSet) if (!beforeSet.has(line)) styleAdded.add(line);
  for (const line of beforeSet) if (!afterSet.has(line)) styleRemoved.add(line);
}

if (contentMismatch.length) {
  problems.push(`有 ${contentMismatch.length} 个 HTML 页在剥掉样式后正文仍不同（内容被改动了）：` +
    contentMismatch.slice(0, 8).join('、'));
}

// 预期：样式只多了这几条（多一条都算夹带）
const EXPECTED_ADDED = [
  '.detail-main { width: min(1120px, 100%); margin-inline: auto; }',
  '.dpane-more { margin-top: var(--s3); }'
];
const EXPECTED_REMOVED = [
  'padding: var(--s4) var(--s4) var(--s2); max-width: 820px;',
  'margin-top: var(--s3); max-width: 820px; word-break: break-all;'
];
const EXPECTED_ADDED_LINES = [
  '.detail-main { width: min(1120px, 100%); margin-inline: auto; }',
  '.dpane-more { margin-top: var(--s3); }',
  'padding: var(--s4) var(--s4) var(--s2); width: 100%; max-width: none;',
  'margin-top: var(--s3); width: 100%; max-width: none; word-break: normal; overflow-wrap: anywhere;',
  '/* 详情内容列（Detail Content Column）：deal 详情页与模型详情页共用的**唯一**宽度来源。',
  '宽度写在这里，页面上只加一个 class，别再往页面里塞第二套宽度规则。',
  'Header(.topin) 与 Footer 不在这条规则的作用域内，仍是 .wrap 的 1420px。 */',
  '/* 与上方卡片同宽：随内容列铺满，不再另立一套 820px 宽度。 */'
];
const EXPECTED_REMOVED_LINES = [
  'padding: var(--s4) var(--s4) var(--s2); max-width: 820px;',
  'margin-top: var(--s3); max-width: 820px; word-break: break-all;'
];
const unexpectedAdded = [...styleAdded].filter(line => !EXPECTED_ADDED_LINES.includes(line));
const unexpectedRemoved = [...styleRemoved].filter(line => !EXPECTED_REMOVED_LINES.includes(line));
stats.styleLineDelta = { added: [...styleAdded].length, removed: [...styleRemoved].length };

if (unexpectedAdded.length) problems.push(`样式块里出现了预期之外的**新增**行：${unexpectedAdded.slice(0, 5).join(' | ')}`);
if (unexpectedRemoved.length) problems.push(`样式块里出现了预期之外的**删除**行：${unexpectedRemoved.slice(0, 5).join(' | ')}`);
for (const line of EXPECTED_ADDED) if (!styleAdded.has(line)) problems.push(`预期的新增样式行没有出现：${line}`);

const report = {
  before: BEFORE, after: AFTER, at: new Date().toISOString(),
  stats,
  expected: { added: EXPECTED_ADDED, removed: EXPECTED_REMOVED },
  observed: { added: [...styleAdded].sort(), removed: [...styleRemoved].sort() },
  contentMismatch: contentMismatch.slice(0, 20),
  problems
};

console.log(`改动前：${BEFORE}`);
console.log(`改动后：${AFTER}`);
console.log(`文件数：${stats.before} → ${stats.after}（HTML ${stats.htmlPages} 页）`);
console.log(`非 HTML 文件逐字节相同：${stats.nonHtmlIdentical}/${stats.before - stats.htmlPages}`);
console.log(`HTML 页剥掉样式后正文逐字节相同：${stats.contentIdentical}/${stats.htmlPages}`);
console.log(`样式块行集合差：+${[...styleAdded].length} / -${[...styleRemoved].length}`);
console.log(`  + ${[...styleAdded].sort().join('\n  + ')}`);
console.log(`  - ${[...styleRemoved].sort().join('\n  - ')}`);
if (problems.length) {
  console.log(`\n❌ ${problems.length} 处问题：`);
  problems.forEach(p => console.log(`   ✗ ${p}`));
} else {
  console.log('\n✅ 除预期的样式规则与 <main> 的 detail-main 类之外，全产物逐字节一致（内容零增减、数据零变化）');
}

if (OUT) {
  fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
  fs.writeFileSync(path.resolve(OUT), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`证据已写出：${OUT}`);
}
process.exit(problems.length ? 1 : 0);
