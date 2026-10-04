#!/usr/bin/env node
/**
 * T18 §18 真浏览器矩阵（**自写**：360/390/768/desktop × JS on/off × 6 路由）。
 *
 * 用法：node research/quality-closure/verify-work/browser-matrix.cjs [--dist=dist.qc-verify] [--json=…] [--prefix=]
 *
 * 每条 (route × viewport × js) 检查：
 *   · 横向溢出：documentElement.scrollWidth > innerWidth+1（含最宽元素定位）
 *   · console error / pageerror（JS 开时）
 *   · 失败请求：HTTP ≥ 400 或请求失败（JS 开时）
 *   · 同源链接可解析：每个站内 href 都能在产物里找到目标文件
 *   · 锚点：href="#x" 的 id 在目标页存在
 *   · canonical：等于 https://buguoshixc.github.io/ai-deals-aggregator/<route>
 *   · breadcrumb 面包屑存在（除首页）
 *   · 官方/来源外链存在（模型页、/plans/api/、/changes/ 至少一条 rel=noopener 的外链）
 * 退出码：0 = 全过；1 = 有失败项。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { startServer } = require('./lib/serve.cjs');

const argOf = (n, d) => { const a = process.argv.find(x => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
const ROOT = path.resolve(__dirname, '..', '..', '..');
const DIST = path.resolve(ROOT, argOf('dist', 'dist.qc-verify'));
const PREFIX = argOf('prefix', '');
const JSON_OUT = path.resolve(ROOT, argOf('json', 'research/quality-closure/verify-work/logs/browser-matrix.json'));
const EDGE = process.env.DSH_EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const ROUTES = ['', 'changes/', 'archive/', 'feeds/', 'plans/api/', 'models/glm-4.5v/'];
const VIEWPORTS = [
  { name: '360', width: 360, height: 640 },
  { name: '390', width: 390, height: 844 },
  { name: '768', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 }
];
const JS_MODES = [true, false];
const SITE_URL = 'https://buguoshixc.github.io/ai-deals-aggregator/';

const failures = [];
const results = [];

(async () => {
  const { chromium } = require(path.join(ROOT, 'node_modules/playwright-core'));
  if (!fs.existsSync(EDGE)) { console.error(`找不到 Edge：${EDGE}`); process.exit(2); }
  const server = await startServer(DIST, PREFIX);
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  console.log(`dist=${path.relative(ROOT, DIST)} · 服务=${server.base} · Edge=${EDGE}`);

  for (const route of ROUTES) {
    for (const vp of VIEWPORTS) {
      for (const js of JS_MODES) {
        const url = `${server.base}${route}`;
        const context = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          javaScriptEnabled: js,
          deviceScaleFactor: 1
        });
        const page = await context.newPage();
        const consoleErrors = [];
        const pageErrors = [];
        const failed = [];
        page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
        page.on('pageerror', e => pageErrors.push(String(e).slice(0, 200)));
        page.on('response', r => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });
        page.on('requestfailed', r => failed.push(`FAILED ${r.url()} (${r.failure() && r.failure().errorText})`));
        const rec = { route: route || '/', viewport: vp.name, js, url };
        try {
          await page.goto(url, { waitUntil: 'load', timeout: 30000 });
          await page.waitForTimeout(js ? 300 : 50);
          const metrics = await page.evaluate(() => {
            const de = document.documentElement;
            let widest = null;
            for (const el of document.querySelectorAll('body *')) {
              const r = el.getBoundingClientRect();
              if (r.width > de.clientWidth + 1 && (!widest || r.width > widest.width)) {
                widest = { width: Math.round(r.width), tag: el.tagName, cls: String(el.className).slice(0, 40) };
              }
            }
            return {
              scrollWidth: de.scrollWidth, clientWidth: de.clientWidth,
              bodyScrollWidth: document.body.scrollWidth, widest,
              canonical: (document.querySelector('link[rel=canonical]') || {}).href || null,
              breadcrumb: !!document.querySelector('nav[aria-label*="面包屑"], .breadcrumb, [class*=crumb], [id*=crumb]'),
              anchors: [...document.querySelectorAll('a[href]')].map(a => ({ href: a.getAttribute('href'), text: a.textContent.trim().slice(0, 60) })),
              imgs: [...document.querySelectorAll('img[src]')].map(i => i.getAttribute('src')),
              scripts: [...document.querySelectorAll('script[src]')].map(s => s.getAttribute('src')),
              links: [...document.querySelectorAll('link[rel=stylesheet]')].map(l => l.getAttribute('href')),
              externalNoopener: [...document.querySelectorAll('a[href^="http"]')].map(a => a.getAttribute('href')),
              ids: [...document.querySelectorAll('[id]')].map(e => e.id)
            };
          });
          rec.metrics = {
            scrollWidth: metrics.scrollWidth, clientWidth: metrics.clientWidth,
            overflow: metrics.scrollWidth > metrics.clientWidth + 1 ? metrics.widest : null,
            canonical: metrics.canonical, breadcrumb: metrics.breadcrumb,
            anchors: metrics.anchors.length, externals: metrics.externalNoopener.length
          };
          // 横向溢出
          if (metrics.scrollWidth > metrics.clientWidth + 1) {
            failures.push(`${rec.route} @${vp.name} js=${js}: 横向溢出 ${metrics.scrollWidth}>${metrics.clientWidth} ${JSON.stringify(metrics.widest)}`);
          }
          if (metrics.bodyScrollWidth > vp.width + 1) {
            failures.push(`${rec.route} @${vp.name} js=${js}: body.scrollWidth ${metrics.bodyScrollWidth}>${vp.width}`);
          }
          // canonical
          const wantCanonical = `${SITE_URL}${route}`;
          if (metrics.canonical !== wantCanonical) failures.push(`${rec.route} @${vp.name} js=${js}: canonical=${metrics.canonical} ≠ ${wantCanonical}`);
          // 面包屑（首页之外）
          if (route && !metrics.breadcrumb) failures.push(`${rec.route} @${vp.name} js=${js}: 未找到面包屑标记`);
          // console / 失败请求（只有 JS 开时才有意义）
          if (js && consoleErrors.length) failures.push(`${rec.route} @${vp.name}: console error ${consoleErrors.slice(0, 2).join(' | ')}`);
          if (js && pageErrors.length) failures.push(`${rec.route} @${vp.name}: pageerror ${pageErrors.slice(0, 2).join(' | ')}`);
          if (js && failed.length) failures.push(`${rec.route} @${vp.name}: 失败请求 ${failed.slice(0, 3).join(' | ')}`);
          // 站内链接与资产可解析（静态判定，不依赖 JS）
          const pageFile = path.join(DIST, route, 'index.html');
          const pageDir = path.dirname(pageFile);
          const localRefs = [
            ...metrics.anchors.map(a => a.href),
            ...metrics.imgs, ...metrics.scripts, ...metrics.links
          ].filter(h => h && !/^https?:|^mailto:|^#|^data:/.test(h));
          const bad = [];
          for (const ref of localRefs) {
            const [filePart, hash] = ref.split('#');
            if (!filePart) {
              if (hash && !metrics.ids.includes(hash)) bad.push(`锚点 #${hash} 在本页不存在`);
              continue;
            }
            const target = filePart.endsWith('/') ? path.join(pageDir, filePart, 'index.html') : path.join(pageDir, filePart);
            if (!fs.existsSync(target)) bad.push(`${ref} → 文件不存在`);
            else if (hash) {
              const html = fs.readFileSync(target, 'utf8');
              if (!html.includes(`id="${hash}"`)) bad.push(`${ref} → 目标页没有 id=${hash}`);
            }
          }
          if (bad.length) failures.push(`${rec.route} @${vp.name} js=${js}: 站内链接/资产 ${bad.slice(0, 3).join(' | ')}`);
          // 来源外链（模型页 / plans/api / changes 至少一条）
          if (['plans/api/', 'changes/', 'models/glm-4.5v/'].includes(route) && metrics.externalNoopener.length === 0) {
            failures.push(`${rec.route} @${vp.name} js=${js}: 没有任何官方来源外链`);
          }
          rec.ok = !failures.some(f => f.startsWith(`${rec.route} @${vp.name}`));
        } catch (error) {
          failures.push(`${rec.route} @${vp.name} js=${js}: 页面加载/求值失败 ${String(error).slice(0, 200)}`);
          rec.ok = false;
        }
        results.push(rec);
        await context.close();
      }
    }
    const perRoute = results.filter(r => r.route === (route || '/'));
    console.log(`  ${(route || '/').padEnd(18)} ${perRoute.filter(r => r.ok).length}/${perRoute.length} 通过`);
  }
  await browser.close();
  await server.close();

  const summary = {
    dist: path.relative(ROOT, DIST).replace(/\\/g, '/'),
    routes: ROUTES.map(r => r || '/'),
    viewports: VIEWPORTS.map(v => v.name),
    jsModes: JS_MODES,
    checks: results.length,
    failures
  };
  fs.mkdirSync(path.dirname(JSON_OUT), { recursive: true });
  fs.writeFileSync(JSON_OUT, JSON.stringify({ summary, results }, null, 2));
  console.log(`\n检查组合：${results.length}（${ROUTES.length} 路由 × ${VIEWPORTS.length} 视口 × ${JS_MODES.length} JS 模式）`);
  if (failures.length) {
    console.log(`✗ ${failures.length} 项失败：`);
    [...new Set(failures)].slice(0, 30).forEach(f => console.log('   - ' + f));    process.exit(1);
  }
  console.log('✅ 浏览器矩阵全过（横向溢出 / console / 失败请求 / 站内链接与锚点 / canonical / 面包屑 / 来源外链）');
  process.exit(0);
})();
