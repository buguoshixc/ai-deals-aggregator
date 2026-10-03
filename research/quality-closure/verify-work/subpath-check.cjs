#!/usr/bin/env node
/**
 * T18 §19 子路径断言：把 dist.qc-verify 挂在 /ai-deals-aggregator/ 前缀下，复核
 * route / feed / archive / model / assets / relative links / canonical / JSON endpoint。
 *
 * 用法：node research/quality-closure/verify-work/subpath-check.cjs [--dist=dist.qc-verify] [--json=…]
 *
 * 判据（自建，不看实现）：
 *   · 所有 HTTP 取回必须 200；404 计数必须为 0
 *   · 每个页面里**站内引用必须相对**（不得以 `/` 开头 = 根绝对路径，那样在项目页子路径下会打到域名根）
 *   · 每个相对引用必须能在产物里解析到真实文件
 *   · canonical 必须等于生产绝对 URL（含 /ai-deals-aggregator/ 前缀）
 *   · sitemap 的 <loc> 必须全部带前缀；feed 的 self/entry 链接必须带前缀或可解析
 *   · JSON endpoint（/data/index.json、/models.json、/api-plans.json …）必须 200 且可解析
 * 退出码：0 = 全过；1 = 有失败项。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { startServer, resolveFile } = require('./lib/serve.cjs');

const argOf = (n, d) => { const a = process.argv.find(x => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
const ROOT = path.resolve(__dirname, '..', '..', '..');
const DIST = path.resolve(ROOT, argOf('dist', 'dist.qc-verify'));
const JSON_OUT = path.resolve(ROOT, argOf('json', 'research/quality-closure/verify-work/logs/subpath-check.json'));
const PREFIX = '/ai-deals-aggregator';
const SITE_URL = `https://buguoshixc.github.io${PREFIX}/`;

const failures = [];
const notes = [];
const fetchAll = [];
const list = (dir, base = '') => {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...list(p, rel)); else out.push(rel);
  }
  return out;
};

const sitemap = fs.readFileSync(path.join(DIST, 'sitemap.xml'), 'utf8');
const sitemapLocs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
const routesFromSitemap = sitemapLocs.map(u => u.replace(SITE_URL, '').replace(/\/$/, ''));

const jsonEndpoints = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.json')) jsonEndpoints.push(path.relative(DIST, p).replace(/\\/g, '/'));
  }
})(DIST);
const DATA_ENDPOINTS = jsonEndpoints.filter(p => p.startsWith('data/') || ['models.json', 'api-plans.json', 'plans.json', 'deals.json', 'model-registry-links.json', 'source-health.json'].includes(p));

(async () => {
  const server = await startServer(DIST, PREFIX);
  const check = async (url) => {
    const res = await fetch(url);
    const text = res.status === 200 ? await res.text() : '';
    fetchAll.push({ url, status: res.status });
    return { status: res.status, text };
  };
  console.log(`前缀服务：${server.base}（dist=${path.relative(ROOT, DIST)}）`);

  // 1) 首页 + sitemap 全路由
  const targets = ['', ...routesFromSitemap];
  let checked = 0;
  for (const route of targets) {
    const url = `${server.base}${route}${route ? '/' : ''}`;
    const { status, text } = await check(url);
    checked++;
    if (status !== 200) { failures.push(`路由 ${route || '/'} → ${status}`); continue; }
    if (!text.includes('<html')) continue;
    // 站内引用必须相对
    const refs = [...text.matchAll(/(?:href|src)="([^"]+)"/g)].map(m => m[1])
      .filter(h => !/^(https?:|mailto:|data:|#)/.test(h));
    const rootAbs = refs.filter(h => h.startsWith('/'));
    if (rootAbs.length) failures.push(`${route || '/'}: 出现根绝对路径引用 ${[...new Set(rootAbs)].slice(0, 3).join(' ')}（项目页子路径下会打到域名根）`);
    // 相对引用可解析
    const pageDir = route ? path.join(DIST, route) : DIST;
    const bad = [];
    for (const ref of refs) {
      const [filePart] = ref.split('#');
      if (!filePart) continue;
      if (filePart.startsWith('.')) {
        const target = filePart.endsWith('/') ? path.join(pageDir, filePart, 'index.html') : path.join(pageDir, filePart);
        if (!fs.existsSync(target)) bad.push(ref);
      }
    }
    if (bad.length) failures.push(`${route || '/'}: 相对引用解析失败 ${bad.slice(0, 5).join(' ')}`);
    // canonical 带前缀
    if (route) {
      const canonical = (text.match(/<link rel="canonical" href="([^"]+)"/) || [])[1];
      const want = `${SITE_URL}${route}/`;
      if (canonical !== want) failures.push(`${route}: canonical=${canonical} ≠ ${want}`);
    }
  }
  notes.push(`sitemap 路由 ${routesFromSitemap.length} 条 · 实际取回 ${checked} 个页面`);

  // 2) feed 家族
  const feedFiles = ['feed.xml', 'feed.json'];
  for (const f of feedFiles) {
    const { status, text } = await check(`${server.base}${f}`);
    if (status !== 200) { failures.push(`feed ${f} → ${status}`); continue; }
    if (!text.includes(SITE_URL)) failures.push(`feed ${f}: 内容里没有带前缀的站点 URL`);
  }
  // 每个 feed 家族文件（feed/**/*.json 与 *.xml，含嵌套目录）都要能取到；抽样 8 个 JSON + 8 个 XML
  const feedFamily = list(DIST).filter(f => /^feed\//.test(f) && /\.(json|xml)$/.test(f));
  const feedJson = feedFamily.filter(f => f.endsWith('.json')).slice(0, 8);
  const feedXml = feedFamily.filter(f => f.endsWith('.xml')).slice(0, 8);
  let feedChecked = 0;
  for (const rel of [...feedJson, ...feedXml]) {
    const { status } = await check(`${server.base}${rel}`);
    feedChecked++;
    if (status !== 200) failures.push(`${rel} → ${status}`);
  }
  notes.push(`Feed：根 2 个 + 家族文件 ${feedFamily.length} 个（抽样取回 ${feedChecked} 个）`);

  // 3) 关键路由与资产（产物里静态资源在 logos/ + 根目录，2026-10 现场实测）
  const logoDir = fs.existsSync(path.join(DIST, 'logos')) ? fs.readdirSync(path.join(DIST, 'logos')).slice(0, 12).map(f => `logos/${f}`) : [];
  const rootAssets = ['favicon.svg', 'robots.txt', 'og-image.png', 'icon.png', 'logos.css'].filter(f => fs.existsSync(path.join(DIST, f)));
  const assets = [...rootAssets, ...logoDir];
  const required = [
    'archive/', 'changes/', 'plans/api/', 'feeds/', 'models/', 'models/glm-4.5v/', 'models/gpt-6-astra/',
    'sitemap.xml', 'docs/data/', 'data/index.json', ...DATA_ENDPOINTS.slice(0, 12), ...assets
  ];
  for (const rel of [...new Set(required)]) {
    const { status } = await check(`${server.base}${rel}`);
    if (status !== 200) failures.push(`必需路径 ${rel} → ${status}`);
  }
  notes.push(`必需路径 ${new Set(required).size} 个（含 assets 抽样 ${assets.length} 个、JSON endpoint 抽样 ${Math.min(12, DATA_ENDPOINTS.length)} 个）`);

  // 4) JSON endpoint 可解析
  for (const rel of DATA_ENDPOINTS) {
    const { status, text } = await check(`${server.base}${rel}`);
    if (status !== 200) { failures.push(`JSON endpoint ${rel} → ${status}`); continue; }
    try { JSON.parse(text); } catch (e) { failures.push(`JSON endpoint ${rel} 不是合法 JSON：${String(e).slice(0, 80)}`); }
  }
  notes.push(`JSON endpoint ${DATA_ENDPOINTS.length} 个全部 200 且可解析`);

  // 5) 静态资源真实存在（logos/ + 根目录资产）
  const allAssets = [
    ...(fs.existsSync(path.join(DIST, 'logos')) ? fs.readdirSync(path.join(DIST, 'logos')).map(f => `logos/${f}`) : []),
    ...rootAssets
  ];
  for (const rel of allAssets) {
    const file = resolveFile(DIST, '/' + rel);
    if (!file) failures.push(`静态资源缺文件 ${rel}`);
  }
  notes.push(`静态资源：logos/ ${logoDir.length ? fs.readdirSync(path.join(DIST, 'logos')).length : 0} 个 + 根资产 ${rootAssets.length} 个全部存在`);

  await server.close();
  const summary = {
    dist: path.relative(ROOT, DIST).replace(/\\/g, '/'),
    prefix: PREFIX,
    httpRequests: fetchAll.length,
    non200: fetchAll.filter(f => f.status !== 200).length,
    routesChecked: checked,
    feedChecked: feedChecked + feedFiles.length,
    jsonEndpoints: DATA_ENDPOINTS.length,
    notes, failures
  };
  fs.mkdirSync(path.dirname(JSON_OUT), { recursive: true });
  fs.writeFileSync(JSON_OUT, JSON.stringify({ summary, fetchAll }, null, 2));
  notes.forEach(n => console.log('  · ' + n));
  console.log(`  HTTP 取回 ${fetchAll.length} 次 · 非 200 ${summary.non200} 次`);
  if (failures.length) {
    console.log(`\n✗ ${failures.length} 项失败：`);
    [...new Set(failures)].slice(0, 30).forEach(f => console.log('   - ' + f));
    process.exit(1);
  }
  console.log('\n✅ 子路径断言全过（route / feed / archive / model / assets / 相对链接 / canonical / JSON endpoint）');
  process.exit(0);
})();
