#!/usr/bin/env node
/**
 * coverage-depth-v1：**小规模 Online Smoke**（题面 §75）。
 *
 * 纪律（为什么页面这么少）：生产已经在收真实 Analytics。全站 170+ 页爬一遍会污染观测数据，
 * 所以这里**只访问必要页面**：模型索引 / 一个本轮新增 releaseEvidence 的模型详情 / 一个 legacy
 * 模型详情 / 两个套餐页（本轮改了才访）/ sitemap 与 feed 的存在性。
 *
 * 用纯 HTTP（不开浏览器）以把请求数压到最低；页面内的 analytics bootstrap 存在性用文本断言，
 * **本地**的「零分析请求」守卫仍由 Full Gate 的第 47 步负责，两者不是同一件事。
 *
 * 用法：node research/_raw/coverage-depth-v1/gate/online-smoke.cjs
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const BASE = 'https://buguoshixc.github.io/ai-deals-aggregator';
const OUT = path.join(__dirname, 'online-smoke.json');

/** 只访问这些页面：每一项都写清"为什么必须访" */
const TARGETS = [
  { url: '/', why: '门面：确认站点活着且首页可渲染' },
  { url: '/models/', why: '本轮改了模型索引（新增 7 身份、目录状态重派生）' },
  { url: '/models/claude-opus-5.5/', why: '本轮**新增 releaseEvidence** 的模型详情（2026-09-22 由官方 release 页取证）' },
  { url: '/models/glm-5.3/', why: '本轮新增日期里被 t11/t12 用作夹具基准的那一条（2026-08-19）' },
  { url: '/models/deepseek-v3.2/', why: '**legacy** 模型详情：题面 §53 要求 legacy 路由不被删、sitemap 不丢页' },
  { url: '/plans/api/', why: '本轮 API 计价 17 → 24 条' },
  { url: '/plans/coding/', why: '本轮 Coding 套餐 37 → 44 条' },
  { url: '/sitemap.xml', why: '题面 §53：无非预期丢页' },
  { url: '/feed.json', why: '题面 §79：Feed 无非预期变化' },
  { url: '/data/index.json', why: '题面 §79：Dataset Manifest 无非预期变化' }
];

async function get(url) {
  const res = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'coverage-depth-v1-online-smoke' } });
  const text = await res.text();
  return { status: res.status, bytes: Buffer.byteLength(text), text };
}

/** 部署后的内容抽样：页面上真的能看到本轮的数据 */
function contentChecks(url, text) {
  const checks = [];
  const push = (name, ok, detail) => checks.push({ name, ok, detail });
  if (url === '/models/') {
    push('模型索引含新增身份 360zhinao-pro', text.includes('360zhinao-pro'));
    push('模型索引含 legacy 身份的静态行（默认隐藏不等于删行）', text.includes('data-model="deepseek-v3.2"'));
  }
  if (url === '/models/claude-opus-5.5/') {
    push('详情页展示本轮取证到的发布日期 2026-09-22', /2026[-/年].{0,3}09[-/月].{0,3}22/.test(text));
  }
  if (url === '/models/glm-5.3/') {
    push('详情页展示 2026-08-19', /2026[-/年].{0,3}08[-/月].{0,3}19/.test(text));
  }
  if (url === '/models/deepseek-v3.2/') {
    push('legacy 详情页仍能打开且有正文', text.length > 2000);
  }
  if (url === '/plans/api/') {
    push('API 计价页出现本轮新增的 provider（360智脑 / 百川）', /360|百川|baichuan/i.test(text));
  }
  if (url === '/sitemap.xml') {
    const locs = [...text.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
    push('sitemap 含 legacy 模型 URL', locs.some(u => /\/models\/deepseek-v3\.2\/?$/.test(u)));
    push(`sitemap URL 数不少于基线 173（实测 ${locs.length}）`, locs.length >= 173);
  }
  if (url === '/feed.json') {
    let doc = null; try { doc = JSON.parse(text); } catch (e) { /* 交给断言 */ }
    push('feed.json 可解析且条目数不少于基线 48', Boolean(doc) && ((doc.items || []).length >= 48));
  }
  if (url === '/data/index.json') {
    let doc = null; try { doc = JSON.parse(text); } catch (e) { /* 交给断言 */ }
    const ids = doc ? (doc.datasets || []).map(d => d.id) : [];
    push('Dataset Manifest 仍是 9 个公开数据集', ids.length === 9);
    push('source-rulings（内部维护层）**未**被发布', !ids.some(id => /source-rulings/.test(id)) && !text.includes('source-rulings'));
  }
  return checks;
}

async function main() {
  const results = [];
  for (const t of TARGETS) {
    const url = BASE + t.url;
    let row;
    try {
      const r = await get(url);
      const checks = contentChecks(t.url, r.text);
      row = {
        url: t.url, why: t.why, status: r.status, bytes: r.bytes,
        sha256: crypto.createHash('sha256').update(r.text).digest('hex'),
        analyticsBootstrap: /cloudflareinsights\.com|data-dsh-analytics/.test(r.text),
        checks,
        ok: r.status === 200 && checks.every(c => c.ok)
      };
    } catch (error) {
      row = { url: t.url, why: t.why, status: null, error: error.message, checks: [], ok: false };
    }
    results.push(row);
    const mark = row.ok ? '✅' : '❌';
    console.log(`${mark} ${String(row.status).padEnd(4)} ${String(row.bytes || 0).padStart(7)} B  ${t.url}`);
    for (const c of row.checks) if (!c.ok) console.log(`      ✗ ${c.name}${c.detail ? ' —— ' + c.detail : ''}`);
    if (row.error) console.log(`      ✗ ${row.error}`);
  }

  const failed = results.filter(r => !r.ok);
  const doc = {
    generatedAt: new Date().toISOString(),
    base: BASE,
    policy: '题面 §75：只访问必要页面，不爬全站（生产在收真实 Analytics）',
    visited: results.length,
    failed: failed.length,
    results
  };
  fs.writeFileSync(OUT, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
  console.log(`\n${failed.length ? '❌' : '✅'} Online Smoke：访问 ${results.length} 个页面，失败 ${failed.length} 个`);
  console.log(`   结果：${path.relative(ROOT, OUT)}`);
  return failed.length ? 1 : 0;
}

main().then(code => process.exit(code));
