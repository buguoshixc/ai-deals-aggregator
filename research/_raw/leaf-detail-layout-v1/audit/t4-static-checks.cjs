#!/usr/bin/env node
'use strict';
/* eslint-disable no-console */
/**
 * t4-static-checks.cjs —— T4 的**静态**部分：产物与源码里的规则重复/波及面核对（不改任何文件，只读）。
 *
 * 判据（对应 T4 acceptance 的第 6、7 条）：
 *   6) 全仓只有**一处** .detail-main 与**一处** .dpane/.dpane-src 规则来源，没有新建 detail*.css，
 *      没有第二套叶子页宽度（= 没有任何 max-width: 820px 残留在详情页上）。
 *   7) 叶子页（deal/models 详情）真的带 class="detail-main"，集合页/索引页/档案页/首页一个都不带。
 *
 * 输出：research/_raw/leaf-detail-layout-v1/audit/t4-static-checks.json + stdout 摘要
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');   // 特性 worktree 根
const OUT = path.join(__dirname, 't4-static-checks.json');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/** 路由 → 页面类型（与 leaf-probe.cjs 的口径一致，另分出非叶子页） */
function kindOfRoute(route) {
  if (route === '/') return 'home';
  if (/^\/deal\/[^/]+\/$/.test(route)) return 'deal-leaf';
  if (/^\/models\/[^/]+\/$/.test(route)) return 'models-leaf';
  if (route === '/models/') return 'models-index';
  if (route.startsWith('/archive/')) return 'archive';
  return 'other';
}

const files = walk(path.join(ROOT, 'dist')).filter(f => f.endsWith('index.html'));
const pages = [];
for (const f of files) {
  const rel = path.relative(path.join(ROOT, 'dist'), f).split(path.sep).join('/');
  const route = '/' + rel.replace(/index\.html$/, '');
  const html = fs.readFileSync(f, 'utf8');
  const count = (re) => (html.match(re) || []).length;
  pages.push({
    route,
    kind: kindOfRoute(route),
    bytes: fs.statSync(f).size,
    detailMainRule: count(/\.detail-main\s*\{/g),
    dpaneRule: count(/\.dpane\s*\{/g),
    dpaneSrcRule: count(/\.dpane-src\s*\{/g),
    detailMainClass: count(/<main\b[^>]*class="[^"]*\bdetail-main\b/g),
    maxWidth820: count(/max-width:\s*820px/g),
    breakAll: count(/word-break:\s*break-all/g)
  });
}

const byKind = {};
for (const p of pages) {
  const k = byKind[p.kind] || (byKind[p.kind] = {
    pages: 0, detailMainRule: new Set(), detailMainClass: 0, maxWidth820: 0, dpaneRuleMax: 0, dpaneRuleMin: 999, dpaneSrcRuleMax: 0, examples: []
  });
  k.pages++;
  k.detailMainRule.add(p.detailMainRule);
  k.detailMainClass += p.detailMainClass;
  k.maxWidth820 += p.maxWidth820;
  k.dpaneRuleMax = Math.max(k.dpaneRuleMax, p.dpaneRule);
  k.dpaneRuleMin = Math.min(k.dpaneRuleMin, p.dpaneRule);
  k.dpaneSrcRuleMax = Math.max(k.dpaneSrcRuleMax, p.dpaneSrcRule);
  if (k.examples.length < 4) k.examples.push(p.route);
}

// 规则来源（源码层）：全仓 CSS 规则定义处
const srcCssFiles = walk(ROOT).filter(f => /\.css$/i.test(f) && !f.includes(path.sep + 'dist' + path.sep) && !f.includes(path.sep + 'research' + path.sep));
const cssRuleSources = [];
for (const f of srcCssFiles) {
  const t = fs.readFileSync(f, 'utf8');
  const n = (t.match(/\.detail-main\s*\{/g) || []).length;
  if (n) cssRuleSources.push({ file: path.relative(ROOT, f).split(path.sep).join('/'), detailMainRules: n });
}
const rootIndex = path.join(ROOT, 'index.html');
const rootIndexHtml = fs.readFileSync(rootIndex, 'utf8');
const rootCounts = {
  detailMainRule: (rootIndexHtml.match(/\.detail-main\s*\{/g) || []).length,
  dpaneRule: (rootIndexHtml.match(/\.dpane\s*\{/g) || []).length,
  dpaneSrcRule: (rootIndexHtml.match(/\.dpane-src\s*\{/g) || []).length,
  maxWidth820: (rootIndexHtml.match(/max-width:\s*820px/g) || []).length,
  breakAll: (rootIndexHtml.match(/word-break:\s*break-all/g) || []).length,
  detailMainClass: (rootIndexHtml.match(/<main\b[^>]*class="[^"]*\bdetail-main\b/g) || []).length
};

const badPages = pages.filter(p => {
  const isLeaf = p.kind === 'deal-leaf' || p.kind === 'models-leaf';
  return p.detailMainRule !== 1 || p.dpaneRule !== 1 || p.dpaneSrcRule !== 1 ||
    p.maxWidth820 !== 0 || p.detailMainClass !== (isLeaf ? 1 : 0);
});

const result = {
  generatedAt: new Date().toISOString(),
  distRoot: path.join(ROOT, 'dist'),
  pageCount: pages.length,
  byKind: Object.fromEntries(Object.entries(byKind).map(([k, v]) => [k, {
    pages: v.pages, detailMainRuleSet: [...v.detailMainRule], detailMainClassTotal: v.detailMainClass,
    maxWidth820Total: v.maxWidth820, dpaneRuleMin: v.dpaneRuleMin, dpaneRuleMax: v.dpaneRuleMax,
    dpaneSrcRuleMax: v.dpaneSrcRuleMax, examples: v.examples
  }])),
  sourceIndex: rootCounts,
  cssRuleSourcesInRepo: cssRuleSources,
  cssFilesInDist: walk(path.join(ROOT, 'dist')).filter(f => /\.css$/i.test(f)).map(f => path.relative(ROOT, f).split(path.sep).join('/')),
  suspiciousCssFiles: walk(ROOT).filter(f => /^detail.*\.css$/i.test(path.basename(f))).map(f => path.relative(ROOT, f).split(path.sep).join('/')),
  pagesWithBreakAll: pages.filter(x => x.breakAll > 0).map(x => ({ route: x.route, breakAll: x.breakAll })),
  pagesViolating: badPages.map(p => ({ route: p.route, kind: p.kind, detailMainRule: p.detailMainRule, dpaneRule: p.dpaneRule, dpaneSrcRule: p.dpaneSrcRule, detailMainClass: p.detailMainClass, maxWidth820: p.maxWidth820 })),
  pages
};

fs.writeFileSync(OUT, JSON.stringify(result, null, 2) + '\n', 'utf8');

console.log(`dist 页面总数：${result.pageCount}`);
for (const [k, v] of Object.entries(result.byKind)) {
  console.log(`  ${k.padEnd(13)} pages=${String(v.pages).padStart(3)}  .detail-main 规则数=${JSON.stringify(v.detailMainRuleSet)}  class="detail-main" 合计=${v.detailMainClassTotal}  max-width:820px=${v.maxWidth820Total}  .dpane 规则=${v.dpaneRuleMin}..${v.dpaneRuleMax}  .dpane-src 规则≤${v.dpaneSrcRuleMax}`);
  console.log(`                例：${v.examples.join(' ')}`);
}
console.log(`源码 index.html：.detail-main 规则=${rootCounts.detailMainRule}  .dpane=${rootCounts.dpaneRule}  .dpane-src=${rootCounts.dpaneSrcRule}  max-width:820px=${rootCounts.maxWidth820}  break-all=${rootCounts.breakAll}  main.detail-main=${rootCounts.detailMainClass}`);
console.log(`仓库内 CSS 文件（非 dist/research）：${srcCssFiles.length} 个，其中含 .detail-main 的：${cssRuleSources.length} 个 ${JSON.stringify(cssRuleSources)}`);
console.log(`dist 内 CSS 文件：${JSON.stringify(result.cssFilesInDist)}`);
console.log(`疑似「第二套详情宽度」的 detail*.css：${result.suspiciousCssFiles.length ? JSON.stringify(result.suspiciousCssFiles) : '无'}`);
console.log(badPages.length ? `✗ 有 ${badPages.length} 个页面不符合「一处规则 + 叶子页才带 class」：${badPages.slice(0, 8).map(p => p.route).join(', ')}` : `✓ ${pages.length} 个页面全部满足：各恰好 1 处 .detail-main / 1 处 .dpane / 1 处 .dpane-src、0 处 max-width:820px、叶子页带 class 非叶子页不带`);
console.log(`→ JSON：${OUT}`);
process.exit(badPages.length ? 1 : 0);
