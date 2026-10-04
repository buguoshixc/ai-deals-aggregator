#!/usr/bin/env node
/**
 * 私有站点分析（private-analytics-v1）独立门禁 —— `npm run selftest:analytics`。
 *
 * ## 它在验什么（以及为什么这些事必须由一个**独立**工具验）
 *
 * 本轮的红线是「Beacon 的定义只有一处 / 每个发布页面 exactly 1 个 / 本地绝不发送 /
 * 判据只有一份实现 / 数据不落仓库」。构建期确实逐页断言过一遍，但那一条断言的问题是：
 * 它的输入是**构建过程自己记下来的东西**。这里刻意走另一条路 ——
 *
 *   · 页面覆盖：**读 dist/ 的磁盘现场**，自己推导路由、自己数 bootstrap；
 *   · Production Guard：把 `lib/analytics.js` 的 guard 区块拿进 `vm` 沙箱**真的执行**，
 *     喂 10 组 location，逐条比对真值表（不是 grep 源码里有没有某个字符串）；
 *   · 配置：与 `lib/feeds.js` 的 `SITE_URL` 现场对账（配置与站点常量分家是最隐蔽的失效）；
 *   · 凭据：扫仓库里的 Cloudflare **账户**凭据形状，并**明确区分**合法的 browser Site Token；
 *   · **牙测试**：在临时副本上做 8 种定向篡改，每一种都必须被扫出来（防止「永远报绿」）。
 *
 * ## 为什么不用 grep 某个 token 字符串当证明
 *
 * P1 §20 点名禁止。理由很实在：token、beacon URL、guard 源码都会在 README / docs / 本工具里
 * 合法出现，拿它们当计数依据就是在数文档。所以「注入了几次」用的是**我们自己的属性**
 * `data-dsh-analytics`，「守卫在不在」用的是**沙箱求值后的行为**。
 *
 * 用法：`node scripts/tools/analytics-selftest.js [--dir=dist]`
 * 退出码：0 全过 / 1 有问题（缺产物同样非 0，fail-closed）。
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const analytics = require('../lib/analytics');
const analyticsRoutes = require('../lib/analytics-routes');
const feeds = require('../lib/feeds');
const pageKinds = require('../lib/page-kinds');
const secretScan = require('../lib/secret-scan');

const ROOT = path.join(__dirname, '..', '..');
const dirArg = process.argv.find(arg => arg.startsWith('--dir='));
/** 产物目录：默认 `dist/`；门禁里显式传 `--dir=dist`（产物依赖步骤的既有约定）。 */
const DIST = path.resolve(ROOT, dirArg ? dirArg.slice('--dir='.length) : 'dist');
const ALLOW_MISSING_DIST = process.argv.includes('--allow-missing-dist');

let passed = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) { passed++; console.log(`  ✓ ${name}`); }
  else { failures.push(name); console.log(`  ✗ ${name}${detail ? ` —— ${detail}` : ''}`); }
}

function section(title) {
  console.log(`\n${title}`);
}

/* ------------------------------------------------------------------ */
/* 产物扫描（唯一实现：真值表、牙测试都调它）                            */
/* ------------------------------------------------------------------ */

/** 产物内全部文件的相对路径（读盘，不读任何清单） */
function listFiles(dir) {
  const out = [];
  const walk = (abs, rel) => {
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      const nextRel = rel ? `${rel}/${entry.name}` : entry.name;
      const nextAbs = path.join(abs, entry.name);
      if (entry.isDirectory()) walk(nextAbs, nextRel);
      else out.push(nextRel);
    }
  };
  if (fs.existsSync(dir)) walk(dir, '');
  return out.sort();
}

/**
 * 扫描一个产物目录，返回逐页结论与问题清单。
 *
 * **牙测试就是拿这个函数在篡改后的副本上再跑一遍** —— 于是「门禁能发现这种篡改」
 * 这件事不是靠读代码相信，而是靠真的跑出来。
 *
 * @param {string} dir 产物目录
 * @returns {{pages:object[], problems:string[], bootstraps:number, byKind:object}}
 */
function scanArtifacts(dir) {
  const problems = [];
  const pages = [];
  const byKind = {};
  let bootstraps = 0;

  if (!fs.existsSync(dir)) {
    return { pages, problems: [`产物目录不存在：${path.relative(ROOT, dir) || dir}`], bootstraps, byKind };
  }

  const files = listFiles(dir);
  for (const file of files) {
    const base = path.basename(file);
    // 数据不进仓库/不进产物：这四个名字在任何目录下出现都是红线
    if (/^(?:traffic|analytics|public-analytics)\.json$/.test(base) || /^stats\.json$/.test(base)) {
      problems.push(`产物里出现了分析数据文件 ${file} —— 访问数据只能留在 Cloudflare Dashboard（P1 §3）`);
    }
  }
  for (const prefix of analyticsRoutes.NON_PAGE_DIR_PREFIXES) {
    const hit = files.filter(file => file.startsWith(prefix) && file.endsWith('.html'));
    if (hit.length) problems.push(`${prefix} 下出现了 HTML 页面：${hit.slice(0, 3).join('、')}（这些目录按设计只放资产与数据）`);
  }

  const htmlFiles = files.filter(file => file.endsWith('.html'));
  for (const file of htmlFiles) {
    const html = fs.readFileSync(path.join(dir, file), 'utf8');
    const route = analyticsRoutes.routeFromArtifactPath(file);
    if (route === null) {
      problems.push(`${file}：不是目录式页面（index.html），无法判定它属于哪个路由 —— 新增页面必须走共享页脚这条路径`);
      continue;
    }
    const decision = analyticsRoutes.classifyRoute(route);
    if (!decision.known) {
      if (decision.route.startsWith('/')) {
        problems.push(`${file}：路由 ${decision.route} 不是站根相对路径`);
        continue;
      }
      problems.push(`${analytics.describeRoute(decision.route)}（${file}）：没有被 analytics-routes.js 的任何规则覆盖`
        + ' —— 新增页面族必须登记统计范围，否则那一族会零统计却全绿');
      continue;
    }
    const verdict = analytics.assertPageHtml(html, decision);
    byKind[decision.kind] = (byKind[decision.kind] || 0) + 1;
    bootstraps += verdict.bootstraps;
    pages.push({ file, route: decision.route, kind: decision.kind, trackable: decision.trackable, bootstraps: verdict.bootstraps });
    for (const problem of verdict.problems) problems.push(`${analytics.describeRoute(decision.route)}（${file}）：${problem}`);
  }

  // 页面类型登记表（lib/page-kinds.js）与统计范围（lib/analytics-routes.js）都是「站内页面家族」的
  // 声明，两边对不上就说明有人在其中一处加了新家族而漏了另一处 —— 这正是本轮要防的那种漂移。
  const kindsFromArtifacts = new Set(pages.map(page => page.kind));
  const kindsFromPageKinds = new Set(pageKinds.allKinds().filter(kind => kind !== 'alias'));
  for (const kind of kindsFromArtifacts) {
    if (kind === 'hub' || kind === 'collection' || kind === 'plans') continue;   // 声明表的 kind 名不同名，见各自注释
    if (!kindsFromPageKinds.has(kind)) {
      problems.push(`统计范围里的 kind「${kind}」在 lib/page-kinds.js 里没有对应声明 —— 两份页面家族清单出现了漂移`);
    }
  }
  return { pages, problems, bootstraps, byKind };
}

/** 扫描结果 → 是否干净（牙测试的判据） */
function scanIsClean(result) {
  return result.problems.length === 0;
}

/* ------------------------------------------------------------------ */
/* 占位符何时「还在」：源码里必须恰好一处                                */
/* ------------------------------------------------------------------ */

let TMP_ROOT = null;

/**
 * 递归复制一棵目录树。
 *
 * 刻意**不用 `fs.cpSync`**：在 Windows 上它会对整棵目录树做一次 `\\?\` 前缀的句柄操作，
 * 实测在本机（杀软/同步客户端在场）直接抛 `EIO, Access is denied`——而这份复制只是给牙测试
 * 准备一份可随意篡改的副本，用最朴素的 read/write 反而最稳，还能顺手带上两次重试。
 */
function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) { copyTree(src, dst); continue; }
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        fs.writeFileSync(dst, fs.readFileSync(src));
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        // Windows 上短暂的 EPERM/EBUSY/EIO（杀软扫描、同步客户端）重试一次通常就好
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30 * (attempt + 1));
      }
    }
    if (lastError) throw lastError;
  }
}

/** 临时副本（牙测试用）。成功跑完会整体清掉。 */
function tempCopy(name) {
  if (!TMP_ROOT) TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'analytics-selftest-'));
  const safe = String(name).replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 40) || 'case';
  const target = path.join(TMP_ROOT, safe);
  fs.rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  copyTree(DIST, target);
  return target;
}

function cleanupTemp() {
  if (TMP_ROOT) {
    try { fs.rmSync(TMP_ROOT, { recursive: true, force: true }); } catch (error) { /* 临时目录清不掉不该判失败 */ }
    TMP_ROOT = null;
  }
}

/* ------------------------------------------------------------------ */
/* 1) 配置真实性                                                        */
/* ------------------------------------------------------------------ */

section('1) 配置（唯一配置源：scripts/lib/analytics.js）');
{
  const cfg = analytics.ANALYTICS;
  const verdict = analytics.validateConfig(cfg, { siteUrl: feeds.SITE_URL });
  check('配置形状与站点常量对账（provider / enabled / token 形状 / hostname / path 前缀 / 白名单）',
    verdict.ok, verdict.problems.join('；'));

  check('siteToken 是真实 32 位小写十六进制（不是 placeholder、不是被截断的值）',
    analytics.SITE_TOKEN_RE.test(String(cfg.siteToken)),
    `形状 ${String(cfg.siteToken).length} 位`);

  // 与「本站真实地址」现场对账：改域名时两处必须一起改。
  const site = new URL(feeds.SITE_URL);
  check('productionHostname / productionPathPrefix 等于 SITE_URL 解析出的 host 与 path',
    cfg.productionHostname === site.hostname && cfg.productionPathPrefix === site.pathname,
    `${cfg.productionHostname}${cfg.productionPathPrefix} vs ${site.hostname}${site.pathname}`);

  check('外部请求白名单只含官方需要的两个 origin（脚本 + 上报），没有通配',
    cfg.allowedOrigins.length === 2
    && cfg.allowedOrigins.includes(analytics.originOf(cfg.beaconScriptUrl))
    && cfg.allowedOrigins.includes(analytics.originOf(cfg.beaconEndpointUrl))
    && !cfg.allowedOrigins.some(origin => /[*]/.test(origin)),
    cfg.allowedOrigins.join(' · '));

  check('beacon 脚本地址与 Cloudflare 官方文档一致（static.cloudflareinsights.com/beacon.min.js）',
    cfg.beaconScriptUrl === 'https://static.cloudflareinsights.com/beacon.min.js', cfg.beaconScriptUrl);

  // 配置被改坏时必须能被抓出来（避免「配置校验其实永远为真」）
  const broken = [
    { label: 'token 换成 placeholder', cfg: { ...cfg, siteToken: 'REPLACE_ME' } },
    { label: 'token 大写', cfg: { ...cfg, siteToken: cfg.siteToken.toUpperCase() } },
    { label: 'path 前缀写成 /', cfg: { ...cfg, productionPathPrefix: '/' } },
    { label: 'path 前缀不以 / 结尾', cfg: { ...cfg, productionPathPrefix: '/ai-deals-aggregator' } },
    { label: '白名单加了通配域', cfg: { ...cfg, allowedOrigins: [...cfg.allowedOrigins, 'https://*.example.com'] } },
    { label: 'provider 改成别的', cfg: { ...cfg, provider: 'plausible' } },
    { label: '多了一个未知字段', cfg: { ...cfg, trackingId: 'x' } },
    { label: 'enabled 写成字符串', cfg: { ...cfg, enabled: 'true' } }
  ];
  const missed = broken.filter(item => analytics.validateConfig(item.cfg, { siteUrl: feeds.SITE_URL }).ok);
  check('配置校验自身有牙：8 种改坏都必须被判红',
    missed.length === 0, missed.map(item => item.label).join('、'));

  check('route 表自身形状合法（每条规则都有 kind 与 why）',
    analyticsRoutes.assertRouteTableShape().ok, analyticsRoutes.assertRouteTableShape().problems.join('；'));
}

/* ------------------------------------------------------------------ */
/* 2) Production Guard 真值表（沙箱真实执行，不是读源码）               */
/* ------------------------------------------------------------------ */

section('2) Production Guard 真值表（vm 沙箱执行 lib/analytics.js 的 guard 区块）');
{
  let guard = null;
  let loadError = '';
  try { guard = analytics.loadGuard(); } catch (error) { loadError = error.message; }
  check('guard 区块能在「没有 document/window/require」的沙箱里独立求值（唯一实现可被独立验证）',
    typeof guard === 'function', loadError);

  if (typeof guard === 'function') {
    const cfg = analytics.ANALYTICS;
    const cases = [
      // [说明, location, 期望]
      ['生产站首页', { protocol: 'https:', hostname: 'buguoshixc.github.io', pathname: '/ai-deals-aggregator/' }, true],
      ['生产站详情页', { protocol: 'https:', hostname: 'buguoshixc.github.io', pathname: '/ai-deals-aggregator/deal/abc123/' }, true],
      ['生产站深层页面', { protocol: 'https:', hostname: 'buguoshixc.github.io', pathname: '/ai-deals-aggregator/plans/api/' }, true],
      ['本地 127.0.0.1', { protocol: 'http:', hostname: '127.0.0.1', pathname: '/' }, false],
      ['本地 localhost', { protocol: 'http:', hostname: 'localhost', pathname: '/ai-deals-aggregator/' }, false],
      ['file:// 本地文件', { protocol: 'file:', hostname: '', pathname: '/C:/dist/index.html' }, false],
      ['别的站点', { protocol: 'https:', hostname: 'example.com', pathname: '/ai-deals-aggregator/' }, false],
      ['同域**其它项目**（前缀不匹配）', { protocol: 'https:', hostname: 'buguoshixc.github.io', pathname: '/other-project/' }, false],
      ['同域根路径（GitHub Pages 用户页）', { protocol: 'https:', hostname: 'buguoshixc.github.io', pathname: '/' }, false],
      ['前缀只是兄弟目录名（/ai-deals-aggregator-old/）',
        { protocol: 'https:', hostname: 'buguoshixc.github.io', pathname: '/ai-deals-aggregator-old/' }, false],
      ['伪装成生产域的其它主机', { protocol: 'https:', hostname: 'buguoshixc.github.io.evil.com', pathname: '/ai-deals-aggregator/' }, false]
    ];
    const wrong = [];
    for (const [label, location, expect] of cases) {
      const got = guard({ location, config: cfg });
      if (got !== expect) wrong.push(`${label}：期望 ${expect} 实得 ${got}`);
    }
    check(`真值表 ${cases.length} 条（生产 3 条 + 非生产 8 条）逐条相符`, wrong.length === 0, wrong.join('；'));

    check('enabled:false 时即使 location 完全是生产站也必须禁用',
      guard({ location: { protocol: 'https:', hostname: cfg.productionHostname, pathname: cfg.productionPathPrefix }, config: { ...cfg, enabled: false } }) === false);

    // 前缀的判据必须落在路径分隔符上：把前缀改成 '/' 之后，同域其它项目**会**被误判为生产。
    // 这一条是用来证明「前缀的严格性真的在起作用」，而不是一句注释里的声明。
    const loose = guard({
      location: { protocol: 'https:', hostname: cfg.productionHostname, pathname: '/other-project/' },
      config: { ...cfg, productionPathPrefix: '/' }
    });
    check('前缀一旦放宽成「/」，同域其它项目就会被误判 —— 证明「必须同时判 pathname 前缀」这条判据真的在起作用',
      loose === true, `放宽后 /other-project/ 的判定 = ${loose}`);
  }
}

/* ------------------------------------------------------------------ */
/* 3) 产物页面覆盖（读盘推导，不读构建期记录）                          */
/* ------------------------------------------------------------------ */

section('3) 产物页面覆盖（dist/**/*.html 现场扫描）');
let SCAN = null;
const distReady = fs.existsSync(path.join(DIST, 'index.html'));
if (!distReady) {
  if (ALLOW_MISSING_DIST) {
    console.log(`  ⚠️ OPTIONAL DIAGNOSTIC（--allow-missing-dist）：跳过产物现场检查（缺 ${path.relative(ROOT, DIST)}/index.html）`);
  } else {
    check(`产物存在：${path.relative(ROOT, DIST) || DIST}/index.html`
      + '（先跑 npm run build，或用 --dir=<构建输出>；只有显式 --allow-missing-dist 才允许跳过）', false);
  }
}
if (distReady) {
  SCAN = scanArtifacts(DIST);
  const trackable = SCAN.pages.filter(page => page.trackable);
  const excluded = SCAN.pages.filter(page => !page.trackable);

  check('每个页面都能被判出统计范围（没有「未登记的页面族」）',
    SCAN.problems.filter(problem => problem.includes('没有被 analytics-routes.js')).length === 0,
    SCAN.problems.filter(problem => problem.includes('没有被 analytics-routes.js')).slice(0, 3).join('；'));

  check(`trackable 页面 each exactly 1 bootstrap（${trackable.length} 页）`,
    trackable.every(page => page.bootstraps === 1),
    trackable.filter(page => page.bootstraps !== 1).slice(0, 5)
      .map(page => `${analytics.describeRoute(page.route)}=${page.bootstraps}`).join(' · '));

  check('声明为 excluded 的页面一律 0 个 bootstrap',
    excluded.every(page => page.bootstraps === 0),
    excluded.filter(page => page.bootstraps !== 0).slice(0, 5)
      .map(page => `${analytics.describeRoute(page.route)}=${page.bootstraps}`).join(' · '));

  check('产物里没有任何残留占位符', !SCAN.problems.some(problem => problem.includes('占位符')),
    SCAN.problems.filter(problem => problem.includes('占位符')).slice(0, 3).join('；'));

  check('bootstrap 总数 == trackable 页面数（不存在「某页多注入了一次」）',
    SCAN.bootstraps === trackable.length, `bootstrap ${SCAN.bootstraps} / trackable ${trackable.length}`);

  check('产物里没有分析数据文件（traffic.json / analytics.json / public-analytics.json / stats.json）与 /stats/ 目录',
    !SCAN.problems.some(problem => problem.includes('分析数据文件') || problem.includes('只放资产与数据')),
    SCAN.problems.filter(problem => problem.includes('分析数据文件')).slice(0, 3).join('；'));

  check('扫描本身没有别的问题', scanIsClean(SCAN), SCAN.problems.slice(0, 4).join('；'));

  const kindReport = Object.entries(SCAN.byKind).sort((a, b) => b[1] - a[1])
    .map(([kind, count]) => `${kind}×${count}`).join(' · ');
  console.log(`      页面家族：${kindReport}`);
}

/* ------------------------------------------------------------------ */
/* 4) 注入内容与配置逐项一致                                            */
/* ------------------------------------------------------------------ */

section('4) 注入内容与唯一配置源逐项一致');
if (distReady) {
  const sampleRoutes = ['', 'deal/', 'plans/api/', 'plans/coding/', 'models/', 'vendor/', 'changes/', 'status/', 'feeds/', 'docs/data/'];
  const files = listFiles(DIST).filter(file => file.endsWith('.html'));
  const pick = route => {
    if (route === '') return files.includes('index.html') ? 'index.html' : null;
    if (files.includes(`${route}index.html`)) return `${route}index.html`;
    // 家族通配（`deal/`、`vendor/`）—— 取该家族的第一个真实页面。
    const dynamic = files.find(file => (analyticsRoutes.routeFromArtifactPath(file) || '').startsWith(route));
    return dynamic || null;
  };
  const missing = sampleRoutes.filter(route => !pick(route));
  check(`抽样路由都能在产物里找到（${sampleRoutes.map(route => analytics.describeRoute(route)).join(' · ')}）`,
    missing.length === 0, missing.join('、'));

  const cfg = analytics.ANALYTICS;
  const problems = [];
  for (const route of sampleRoutes) {
    const file = pick(route);
    if (!file) continue;
    const html = fs.readFileSync(path.join(DIST, file), 'utf8');
    const block = html.match(/<script\s+data-dsh-analytics="[^"]*"[\s\S]*?<\/script>/);
    if (!block) { problems.push(`${analytics.describeRoute(route)}：找不到 bootstrap`); continue; }
    const text = block[0];
    if (!text.includes(`"${cfg.siteToken}"`)) problems.push(`${analytics.describeRoute(route)}：token 与配置不一致`);
    if (!text.includes(`"${cfg.beaconScriptUrl}"`)) problems.push(`${analytics.describeRoute(route)}：beacon 地址与配置不一致`);
    if (!text.includes('"module"')) problems.push(`${analytics.describeRoute(route)}：beacon 元素不是 type=module（与官方 snippet 不一致）`);
    if (!text.includes('data-cf-beacon')) problems.push(`${analytics.describeRoute(route)}：缺少 data-cf-beacon 载荷`);
    if (!text.includes('isProductionAnalyticsContext')) problems.push(`${analytics.describeRoute(route)}：guard 调用不见了`);
    if (!text.includes(cfg.productionHostname) || !text.includes(cfg.productionPathPrefix)) {
      problems.push(`${analytics.describeRoute(route)}：内联的生产站点常量与配置不一致`);
    }
    if (!text.includes(analytics.indentedGuardSource())) {
      problems.push(`${analytics.describeRoute(route)}：guard 源码与 lib/analytics.js 的区块不是同一份字节`);
    }
    // 不建访客身份 / 不写浏览器存储：这几样在注入段里一个都不许出现
    for (const forbidden of ['localStorage', 'sessionStorage', 'document.cookie', 'indexedDB', 'crypto.randomUUID', 'navigator.userAgent', 'sendBeacon']) {
      if (text.includes(forbidden)) problems.push(`${analytics.describeRoute(route)}：注入段里出现了 ${forbidden}（本轮禁止自建访客身份/存储）`);
    }
    // 不许出现别的分析 provider
    for (const other of ['googletagmanager', 'google-analytics', 'plausible', 'umami', 'goatcounter', 'posthog', 'matomo']) {
      if (text.includes(other)) problems.push(`${analytics.describeRoute(route)}：注入段里出现了别的分析 provider ${other}`);
    }
  }
  check(`抽样页面（${sampleRoutes.length} 条路由）的 bootstrap 与配置 / 官方形状 / guard 源码逐项一致`,
    problems.length === 0, problems.slice(0, 4).join('；'));

  // 全量再核一遍「没有别的 provider」与「没有浏览器存储 API」——逐页扫，抽样之外也不放过
  const forbiddenGlobal = ['googletagmanager', 'google-analytics.com', 'plausible.io', 'umami.is', 'goatcounter.com', 'posthog.com', 'matomo.cloud'];
  const hits = [];
  for (const file of listFiles(DIST)) {
    if (!/\.(?:html|js|json|xml|txt)$/.test(file)) continue;
    const text = fs.readFileSync(path.join(DIST, file), 'utf8');
    for (const needle of forbiddenGlobal) {
      if (text.includes(needle)) hits.push(`${file} → ${needle}`);
    }
  }
  check('整个产物里没有出现任何别的第三方分析服务', hits.length === 0, hits.slice(0, 3).join('；'));
}

/* ------------------------------------------------------------------ */
/* 5) 牙测试：8 种定向篡改必须每一种都被扫出来                          */
/* ------------------------------------------------------------------ */

section('5) 牙测试（临时副本上定向篡改；干净副本必须静默）');
if (distReady) {
  const clean = scanArtifacts(DIST);
  check('干净产物：扫描零问题（否则后面的「抓到篡改」不能说明任何事）', scanIsClean(clean),
    clean.problems.slice(0, 3).join('；'));

  const firstRoute = clean.pages.find(page => page.trackable && page.route !== '') || clean.pages.find(page => page.trackable);
  const targetFile = firstRoute ? firstRoute.file : 'index.html';
  const targetRoute = firstRoute ? firstRoute.route : '';

  /** 每种篡改：复制产物 → 改一处 → 扫描 → 必须有问题 */
  const teeth = [
    {
      label: '同一页多注入一份 bootstrap（会被重复计一次访问）',
      apply: dir => {
        const file = path.join(dir, targetFile);
        const html = fs.readFileSync(file, 'utf8');
        const block = html.match(/<script\s+data-dsh-analytics="[^"]*"[\s\S]*?<\/script>/)[0];
        fs.writeFileSync(file, html.replace(block, `${block}\n${block}`), 'utf8');
      }
    },
    {
      label: '删掉某个正常生产页的 bootstrap（那一页会零统计）',
      apply: dir => {
        const file = path.join(dir, targetFile);
        const html = fs.readFileSync(file, 'utf8');
        fs.writeFileSync(file, analytics.stripBootstrap(html), 'utf8');
      }
    },
    {
      label: '把 token 改成 placeholder',
      apply: dir => {
        const file = path.join(dir, targetFile);
        const html = fs.readFileSync(file, 'utf8');
        fs.writeFileSync(file, html.replace(analytics.ANALYTICS.siteToken, 'REPLACE_WITH_REAL_TOKEN'), 'utf8');
      }
    },
    {
      label: '抽掉 guard（beacon 会在 localhost 也发出去）',
      apply: dir => {
        const file = path.join(dir, targetFile);
        const html = fs.readFileSync(file, 'utf8');
        fs.writeFileSync(file, html.replace('if (!isProductionAnalyticsContext({ location: LOCATION, config: CONFIG })) return;', ''), 'utf8');
      }
    },
    {
      label: '把 productionPathPrefix 改成 "/"（会扩大到同域其它项目）',
      apply: dir => {
        const file = path.join(dir, targetFile);
        const html = fs.readFileSync(file, 'utf8');
        fs.writeFileSync(file, html.split('"/ai-deals-aggregator/"').join('"/"')
          .split('productionPathPrefix":"/ai-deals-aggregator/"').join('productionPathPrefix":"/"'), 'utf8');
      }
    },
    {
      label: '凭空多出一份 stats.json（访问数据落进产物）',
      apply: dir => { fs.writeFileSync(path.join(dir, 'stats.json'), JSON.stringify({ visitors: 1 }), 'utf8'); }
    },
    {
      label: '新增一个没登记的页面族（那一族会零统计却全绿）',
      apply: dir => {
        fs.mkdirSync(path.join(dir, 'new-family'), { recursive: true });
        const html = fs.readFileSync(path.join(dir, targetFile), 'utf8');
        fs.writeFileSync(path.join(dir, 'new-family', 'index.html'), analytics.stripBootstrap(html), 'utf8');
      }
    },
    {
      label: '留下一处未被解析的占位符（说明这一页没走共享页脚）',
      apply: dir => {
        const file = path.join(dir, targetFile);
        const html = fs.readFileSync(file, 'utf8');
        fs.writeFileSync(file, html.replace('</body>', `${analytics.PLACEHOLDER}\n</body>`), 'utf8');
      }
    }
  ];

  const escaped = [];
  for (const [index, tooth] of teeth.entries()) {
    const dir = tempCopy(`tooth-${index + 1}`);
    tooth.apply(dir);
    const result = scanArtifacts(dir);
    if (scanIsClean(result)) escaped.push(tooth.label);
  }
  check(`8 种定向篡改每一种都被扫出来（牙真的在）`, escaped.length === 0, escaped.join('；'));

  // 第 5 条的**下游**后果也要能被看见：前缀放宽之后，真值表必须对「同域其它项目」判 true。
  // 这证明「扩大统计范围」这件事既有内容层判据、也有行为层判据。
  const prefixTooth = tempCopy('prefix-route');
  teeth[4].apply(prefixTooth);
  const widened = fs.readFileSync(path.join(prefixTooth, targetFile), 'utf8');
  check('前缀被放宽后产物内容本身也变了（不是只靠真值表发现）',
    widened.includes('productionPathPrefix":"/"') || widened.includes('"/"'), targetFile);

  void targetRoute;
}

/* ------------------------------------------------------------------ */
/* 6) 凭据边界：账户凭据一个都不许有，browser Site Token 不算泄密        */
/* ------------------------------------------------------------------ */

section('6) 凭据边界（Cloudflare 账户凭据 vs browser Site Token）');
{
  // 只扫**源码与文档**（不扫 research/**：那是历史审计现场，里面有对 Cloudflare 拦截页的
  // 记录与第三方站点的取证文本，不是本轮的代码面）。
  const targets = ['scripts', '.github', 'docs', 'index.html', 'package.json', 'README.md', 'PROJECT_STATUS.md', 'robots.txt']
    .map(entry => path.join(ROOT, entry))
    .filter(entry => fs.existsSync(entry));
  const hits = secretScan.scanFiles(targets);
  const credentialHits = hits.filter(item => item.hits.some(hit => /cloudflare|cf-|auth-key|global-api|bearer/i.test(hit.id)));
  check('源码 / 文档 / workflow 里没有 Cloudflare 账户凭据形状的串（API Token / Global Key / X-Auth-Key / Bearer）',
    credentialHits.length === 0,
    credentialHits.map(item => `${path.relative(ROOT, item.file)}[${[...new Set(item.hits.map(h => h.id))].join(',')}]`).slice(0, 3).join('；'));

  // 反向：合法的 browser Site Token **不得**被当成泄密。
  // 否则「扫凭据」这条门禁会逼着人把 token 藏起来，而藏起来只能靠 build-time 注入 ——
  // 那正好破坏本轮要求的「local dist == CI dist」。
  const siteToken = analytics.ANALYTICS.siteToken;
  check('合法的 browser Site Token 不被判成泄密（否则会逼出 build-time 注入，破坏构建确定性）',
    !secretScan.hasSecret(siteToken) && !secretScan.hasSecret(`data-cf-beacon='{"token": "${siteToken}"}'`));

  // 牙齿：账户凭据形状必须真的会被扫出来（否则上面那条「没有凭据」是空的）
  //
  // ⚠️ 这个假凭据**必须现场拼出来**，不能写成字面量：本文件自己也在第 6 节的扫描面里，
  // 把「名字 = 值」直接写进注释或断言名，会让这条门禁把自己的测试夹具判成泄密（实测踩到过）。
  // 拼出来的是同一种真实形状，因此判据本身没有被削弱。
  const credentialName = ['CLOUDFLARE', 'API', 'TOKEN'].join('_');
  const fakeCredential = `${credentialName}=${'a'.repeat(40)}`;
  check('牙：伪造一个「账户 API Token 名 = 值」的形状会被扫出来',
    secretScan.hasSecret(fakeCredential), 'secret-scan 的模式表能认出 Cloudflare 账户凭据');

  // 本轮明确不使用 Cloudflare Analytics API：源码里不许出现调用它的路径。
  // 同样地，待查的域名片段现场拼出来（否则本文件自己会被下面这条判红）。
  const apiHosts = [['api', 'cloudflare', 'com'].join('.'), ['graphql', 'cloudflare', 'com'].join('.')];
  const apiCallers = [];
  for (const entry of ['scripts', '.github']) {
    const abs = path.join(ROOT, entry);
    if (!fs.existsSync(abs)) continue;
    for (const file of secretScan.collectFiles(abs)) {
      if (!/\.(?:js|yml|yaml|json)$/.test(file)) continue;
      const text = fs.readFileSync(file, 'utf8');
      if (apiHosts.some(host => text.includes(host))) apiCallers.push(path.relative(ROOT, file));
    }
  }
  check('本轮没有调用 Cloudflare Analytics API（源码 / workflow 里没有该 API 域名）',
    apiCallers.length === 0, apiCallers.slice(0, 3).join('、'));
}

/* ------------------------------------------------------------------ */
/* 7) 不公开：没有公开统计页面、没有公开数据集登记                       */
/* ------------------------------------------------------------------ */

section('7) 不公开统计（无 /stats/、不进公开数据集）');
{
  const forbiddenFiles = ['traffic.json', 'analytics.json', 'public-analytics.json'];
  const found = forbiddenFiles.filter(name => fs.existsSync(path.join(ROOT, name)));
  check('仓库根没有 traffic.json / analytics.json / public-analytics.json', found.length === 0, found.join('、'));

  const docs = require('../lib/data-docs');
  const registry = JSON.stringify(docs.PUBLIC_DATASETS);
  check('Analytics 没有被登记进 PUBLIC_DATASETS（访问数据不是公开数据集）',
    !/traffic|analytics/i.test(registry), 'PUBLIC_DATASETS 里没有分析相关条目');

  // sitemap 里不许出现任何统计页面
  const sitemapFile = path.join(DIST, 'sitemap.xml');
  if (fs.existsSync(sitemapFile)) {
    const sitemap = fs.readFileSync(sitemapFile, 'utf8');
    check('sitemap 里没有 /stats/ 或 /analytics/ 这类公开统计页',
      !/<loc>[^<]*\/(?:stats|analytics)\//.test(sitemap));
  }
}

cleanupTemp();

/* ------------------------------------------------------------------ */

console.log(`\n${failures.length ? '❌' : '✅'} 分析门禁 ${passed + failures.length} 项，失败 ${failures.length} 项`);
if (failures.length) {
  failures.forEach(name => console.log(`   ✗ ${name}`));
  process.exit(1);
}
if (distReady) {
  const trackable = SCAN.pages.filter(page => page.trackable).length;
  console.log(`   页面覆盖：${SCAN.pages.length} 个 HTML（trackable ${trackable} · excluded ${SCAN.pages.length - trackable}）· bootstrap ${SCAN.bootstraps} 个`);
}
