#!/usr/bin/env node
'use strict';
/**
 * v3.4 F3：全站搜索的离线自测（L2，纯合成数据，不读 dist）。
 *
 * 守四件事：
 *   ① 索引推导：URL 只来自唯一表、按 URL 去重、kind 全覆盖、未知 kind 直接抛；
 *   ② 渲染：分组计数 == 条目数、每个 href 都是站内路由、注入文本被转义；
 *   ③ 过滤：子串 / 大小写 / 中文 / 多词 / 空查询还原（纯函数，双宿主的那一份）；
 *   ④ 牙：改坏任一处必须红（dedupe、转义、未知 kind、过滤）。
 */
const assert = require('assert');
const pageKinds = require('../lib/page-kinds');
const feed = require('../lib/feed');
const searchIndex = require('../lib/search-index');
const searchPage = require('../lib/search-page');
const searchFilter = require('../lib/search-filter');

let passed = 0;
let failed = 0;
function check(name, ok, detail) {
  if (ok) { passed += 1; console.log(`  ✓ ${name}`); }
  else { failed += 1; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}
function section(title) { console.log(`\n== ${title} ==`); }

/* ---------------- 夹具 ---------------- */

const DEALS = [
  {
    id: 'aaaaaaaaaaaa', type: 'deal', title: '学生免费额度', vendor: 'DeepSeek',
    category: 'education', description: '凭 edu 邮箱申请', discountInfo: '免费 100 万 tokens',
    eligibility: '在校学生', validity: '2026-12-31 前', priceLine: '¥0',
    zh: { discountInfo: '免费 100 万 tokens', description: '凭 edu 邮箱申请', eligibility: '在校学生', validity: '2026-12-31 前', priceLine: '¥0' },
    features: ['API'], collections: ['student'], needs: ['student-only']
  },
  { id: 'bbbbbbbbbbbb', type: 'deal', title: 'Claude Pro 优惠', vendor: 'Anthropic', category: 'coding' },
  // tool 类型**没有详情页**：索引不能收（否则发死链）
  { id: 'cccccccccccc', type: 'tool', title: '某工具', vendor: 'Someone' }
];
const PLANS = [
  {
    id: '041e537ddecb', planName: 'Pro 套餐', provider: 'deepseek', region: 'cn',
    quota: { type: 'credits' }, supportedModels: [{ name: 'DeepSeek V4' }]
  }
];
const API_PLANS = [
  {
    id: '4f8bae91f9f8', provider: 'anthropic', planName: 'Claude API', channel: 'official',
    pricing: { currency: 'USD', unit: 'per_1M_tokens' },
    models: [{ name: 'Claude Sonnet 5.5', modelKey: 'claude-sonnet-5.5', variant: 'standard' }]
  }
];
const MODELS = [
  { id: 'claude-sonnet-5.5', slug: 'claude-sonnet-5.5', canonicalName: 'Claude Sonnet 5.5', developer: 'Anthropic', family: 'Claude', aliases: ['sonnet 5.5'] }
];
const SPECS = [
  { kind: 'vendor', route: 'vendor/anthropic/', title: 'Anthropic 优惠与资料', heading: 'Anthropic', count: 2, description: 'Claude 相关' },
  { kind: 'collection', route: 'student/', title: '学生优惠', heading: '学生优惠', count: 3, description: '校园邮箱' }
];
const FIXED = Object.keys(pageKinds.FIXED_ROUTE_KINDS);

function build(overrides = {}) {
  return searchIndex.buildSearchIndex(Object.assign({
    deals: DEALS, plans: PLANS, apiPlans: API_PLANS, models: MODELS,
    landingSpecs: SPECS, fixedRoutes: FIXED
  }, overrides));
}

/* ---------------- ① 索引推导 ---------------- */

section('① 索引推导');
{
  const index = build();
  const byKind = kind => index.entries.filter(entry => entry.kind === kind);
  check('deal 只收有详情页的 type=deal（tool 类型不进）', byKind('deal').length === 2, `实得 ${byKind('deal').length}`);
  check('tool 来自固定工具页 /tools/api-cost/', byKind('tool').length === 1 && byKind('tool')[0].url === 'tools/api-cost/');
  check('plan URL 复用 feed.PLAN_URL_PREFIX.plan', byKind('plan')[0].url === `${feed.PLAN_URL_PREFIX.plan}041e537ddecb`);
  check('apiPlan URL 复用 feed.PLAN_URL_PREFIX.apiPlan', byKind('apiPlan')[0].url === `${feed.PLAN_URL_PREFIX.apiPlan}4f8bae91f9f8`);
  check('model URL 是 models/<slug>/', byKind('model')[0].url === 'models/claude-sonnet-5.5/');
  check('vendor 来自 landing spec', byKind('vendor').some(entry => entry.url === 'vendor/anthropic/'));
  check('collection 落到 page（指南页）', byKind('page').some(entry => entry.url === 'student/'));
  check('固定页 kind 全覆盖：7 个分组全非空', searchIndex.SEARCH_KINDS.every(meta => index.counts[meta.kind] > 0),
    JSON.stringify(index.counts));
  check('plan 关键词含 provider 与模型名', byKind('plan')[0].keywords.includes('deepseek') && byKind('plan')[0].keywords.includes('deepseek v4'));
  check('deal 关键词含中文散文字段', byKind('deal').some(entry => entry.keywords.includes('在校学生')));
  check('counts 之和 == entries.length', Object.values(index.counts).reduce((a, b) => a + b, 0) === index.entries.length);
  check('首页与搜索页自身不进固定页索引', !index.entries.some(entry => entry.url === '' || entry.url === 'search/'));
}

// 牙①：把两条不同实体指向同一 URL ⇒ 必须只剩一条，且 dropped 记 1
{
  const index = build({ deals: [DEALS[0], Object.assign({}, DEALS[1], { id: DEALS[0].id })] });
  const urls = index.entries.map(entry => entry.url);
  check('【牙】URL 重复被去掉（按 url 去重，dropped 如实计数）',
    urls.filter(url => url === `deal/${DEALS[0].id}/`).length === 1 && index.dropped >= 1, `dropped=${index.dropped}`);
}

// 牙②：未知 kind ⇒ 直接抛
{
  let threw = false;
  try { build({ landingSpecs: [{ kind: 'mystery', route: 'mystery/', title: 'x', count: 1 }] }); }
  catch (error) { threw = /未知|unknown|kind/i.test(error.message); }
  check('【牙】未知 kind 直接抛错（不静默跳过）', threw);
}

/* ---------------- ② 渲染 ---------------- */

section('② 渲染器');
{
  const index = build();
  const html = searchPage.renderSearchPage({ index, prefix: '../' });
  const routeSet = new Set([
    ...Object.keys(pageKinds.FIXED_ROUTE_KINDS).filter(route => route && route !== searchPage.SEARCH_ROUTE),
    'vendor/anthropic/', 'student/',
    ...index.entries.map(entry => entry.url.split('#')[0])
  ]);
  const lis = [...html.matchAll(/<li class="sitem"/g)].length;
  check('目录条目数 == entries.length', lis === index.entries.length, `${lis} != ${index.entries.length}`);
  const hrefs = [...html.matchAll(/<a href="\.\.\/([^"]+)"/g)].map(match => match[1]);
  check('每条都是站内相对链接且目标在路由集合内', hrefs.length === index.entries.length && hrefs.every(href => routeSet.has(href.split('#')[0])),
    hrefs.find(href => !routeSet.has(href.split('#')[0])) || '');
  const grouped = searchIndex.SEARCH_KINDS.every(meta => {
    if (!index.counts[meta.kind]) return !html.includes(`data-search-group="${meta.kind}"`);
    const start = html.indexOf(`data-search-group="${meta.kind}"`);
    const chunk = html.slice(start, html.indexOf('</section>', start));
    return (chunk.match(/<li class="sitem"/g) || []).length === index.counts[meta.kind];
  });
  check('每个分组内的 <li> 数 == 该组计数', grouped);
  check('data-search-count 逐组等于 counts', searchIndex.SEARCH_KINDS
    .filter(meta => index.counts[meta.kind])
    .every(meta => html.includes(`data-search-count="${meta.kind}">${index.counts[meta.kind]}</span>`)));
  check('分组标题文案来自唯一标签表', searchIndex.SEARCH_KINDS
    .filter(meta => index.counts[meta.kind])
    .every(meta => html.includes(meta.label)));
  check('无 JS 可读：搜索框与完整目录同时存在', html.includes('id="siteSearchInput"') && lis > 0);
  check('空态容器存在且默认 hidden', /id="searchEmpty"[^>]*hidden/.test(html));
}

// 牙③：标题/厂商里注入 <script> 与 & ⇒ 必须被转义
{
  const evil = Object.assign({}, DEALS[0], {
    id: 'dddddddddddd', title: '<script>alert(1)</script>', vendor: 'A & B'
  });
  const index = build({ deals: [evil] });
  const html = searchPage.renderSearchPage({ index, prefix: '../' });
  check('【牙】<script> 与 & 在目录里被转义',
    html.includes('&lt;script&gt;alert(1)&lt;/script&gt;') && html.includes('A &amp; B') && !/<script>alert\(1\)<\/script>/.test(html));
}

/* ---------------- ③ 过滤 ---------------- */

section('③ 过滤（纯函数 / 双宿主的那一份）');
{
  const index = build();
  check('大小写不敏感', searchFilter.filterEntries(index.entries, 'DEEPSEEK').visible.length > 0);
  check('中文子串命中', searchFilter.filterEntries(index.entries, '在校学生').visible.length === 1);
  check('多词全部命中才收（空格切词）', searchFilter.filterEntries(index.entries, 'deepseek 学生').visible.length === 1);
  check('空查询 == 完整目录', searchFilter.filterEntries(index.entries, '  ').visible.length === index.entries.length);
  check('不存在的词 ⇒ 0 条（诚实空态）', searchFilter.filterEntries(index.entries, 'zzzz-no-such').visible.length === 0);
  check('matchesKeywords 与 filterEntries 同一判据',
    index.entries.filter(entry => searchFilter.matchesEntry(entry, 'claude')).length
    === searchFilter.filterEntries(index.entries, 'claude').visible.length);
}

// 牙④：过滤改成「任一 token 命中」⇒ 多词查询会放宽，断言必须红
{
  const original = searchFilter.matchesKeywords;
  const loose = (keywords, query) => {
    const tokens = searchFilter.queryTokens(query);
    if (!tokens.length) return true;
    return tokens.some(token => searchFilter.normalize(keywords).indexOf(token) !== -1);
  };
  const strictHits = indexEntriesHits(original);
  const looseHits = indexEntriesHits(loose);
  check('【牙】「全部词命中」与「任一命中」不是同一件事（多词查询会变宽）', looseHits > strictHits, `${looseHits} vs ${strictHits}`);
}
function indexEntriesHits(fn) {
  const index = build();
  return index.entries.filter(entry => fn(entry.keywords, 'deepseek 学生')).length;
}

/* ---------------- ④ 唯一表与导出 ---------------- */

section('④ 唯一表');
{
  check('SEARCH_KINDS 顺序稳定且无重复', new Set(searchIndex.SEARCH_KIND_ORDER).size === searchIndex.SEARCH_KINDS.length);
  check('固定页标题表覆盖全部固定路由', FIXED
    .filter(route => route && route !== searchPage.SEARCH_ROUTE)
    .every(route => {
      const title = searchIndex.FIXED_PAGE_TITLES[route];
      const kind = pageKinds.kindOfRoute(route);
      return Boolean(title) || Boolean(kind && pageKinds.KIND_TABLE[kind] && pageKinds.KIND_TABLE[kind].label);
    }));
  check('search 已登记进 page-kinds（kind + sitemap 0.6/weekly）',
    pageKinds.kindOfRoute('search/') === 'search'
    && pageKinds.sitemapMeta('search').priority === '0.6'
    && pageKinds.sitemapMeta('search').changefreq === 'weekly');
}

console.log(`\n=== v3.4 F3 全站搜索演练：${passed} 项通过，${failed} 项失败 ===`);
process.exit(failed ? 1 : 0);
