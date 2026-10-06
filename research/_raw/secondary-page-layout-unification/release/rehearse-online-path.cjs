#!/usr/bin/env node
/**
 * t12 · **线上代码路径的本地演练**（一条命令跑完全部用例，产出可复核的证据文件）
 *
 * ## 为什么要有它
 *
 * `online-smoke.cjs` 有两条取数路径：
 *   · `--dir=<产物目录>` —— **读盘**（t10 的三次 dry-run 走的就是它）；
 *   · `--base=<URL>`     —— **HTTP**：`${base}sitemap.xml` → 现场派生 `deal/<id>/` 与 `models/<slug>/`
 *     （线上真正会走的那条）。
 * 第二条在本任务之前**一次都没有被执行过**。它上面挂着三件只在真实托管上才会出现的事：
 * URL 的**子路径前缀**（GitHub Pages 项目站是 `/ai-deals-aggregator/`）、sitemap 的**取法与解析**
 * （`<loc>` 是含前缀的绝对 URL）、以及站点自身的相对链接解析基准。
 * 如果它有 bug，我们会在**部署之后**才发现 —— 而那时"有问题的版本已经在线上"。
 *
 * 所以这里用 `serve-dist-http.cjs`（本机回环 + 随机端口 + 与 Pages 同口径的目录解析/301/子路径挂载）
 * 把那条路径**原样跑一遍**，并对同一套判据做正负两侧：
 *
 *   ① 线上路径（根前缀）        —— `dist` 挂在 `/`，`--base=http://127.0.0.1:<port>/`
 *   ② 线上路径（项目站前缀）    —— `dist` 挂在 `/ai-deals-aggregator/`（**最接近线上的形状**）
 *   ③ 负对照                    —— `dist.baseline`（改动前产物）⇒ **必须 exit 1**
 *   ④–⑧ 健壮性                  —— sitemap 缺 deal / 缺 models / 404 / 超时 / 前缀写错 ⇒ **必须 exit 2**
 *
 * 每条用例都断言三件事，缺一不可：
 *   · 退出码等于期望值（0 / 1 / 2 三种**用不同的码**分开，不把"环境坏了"混进"判据绿了"）；
 *   · 日志里出现**指名道姓的那句话**（例如 `超过 1200ms 未响应`）—— 只有非零退出码不够，
 *     因为"失败得含糊"和"失败得清楚"对发布链的价值完全不同；
 *   · 失败用例**不许启动浏览器**（说明它在取数阶段就停下了，不会把取数问题误报成布局问题）。
 *
 * ## 用法（在 worktree 根目录）
 *
 *   node research/_raw/secondary-page-layout-unification/release/rehearse-online-path.cjs
 *
 * 产出（都在 `release/`）：`online-path-rehearsal.json/.txt`、`online-path-prefix-rehearsal.json/.txt`、
 * `online-path-negcontrol-baseline.json/.txt`、`robustness-rehearsal.txt`、`rehearsal-summary.json`。
 * 退出码：0 = 全部用例符合期望；1 = 有用例不符（逐条打印）；2 = 编排本身出错。
 *
 * ⚠️ 全程只访问 `127.0.0.1`（回环）。`sitemap.xml` 的**假夹具**用保留域
 * `deals.example.invalid`（`.invalid` 永不解析）写成，避免任何真实域名出现在证据里。
 */

'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { startStaticServer } = require('./serve-dist-http.cjs');

const ROOT = path.join(__dirname, '..', '..', '..', '..');
const SMOKE = path.join(__dirname, 'online-smoke.cjs');
const DIST = path.join(ROOT, 'dist');
const DIST_BASELINE = path.join(ROOT, 'dist.baseline');
const PROJECT_PREFIX = '/ai-deals-aggregator/';   // GitHub Pages 项目站的真实前缀

/**
 * 生产基线地址：**从 `online-smoke.cjs` 的 `PROD_BASE` 现场读**，不在这里再写一份字面量。
 * 用途只有一个：核对"本演练的产物里不许出现那个域名"（出口纪律的机器判据）。
 */
const PROD_BASE = (() => {
  const hit = fs.readFileSync(SMOKE, 'utf8').match(/const PROD_BASE = '([^']+)'/);
  if (!hit) throw new Error('读不到 online-smoke.cjs 的 PROD_BASE（出口纪律核对无从谈起，不静默跳过）');
  return hit[1];
})();

/* ---------------- 健壮性用的假 sitemap（保留域，永不解析；内容写进日志以便复核） ---------------- */

const FAKE_BASE = 'https://deals.example.invalid/ai-deals-aggregator/';
const FAKE_HOME = `${FAKE_BASE}`;
const sitemapOf = urls => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${u}</loc><changefreq>weekly</changefreq><priority>0.7</priority></url>`).join('\n')}
</urlset>
`;
const FAKE_SITEMAP_NO_DEAL = sitemapOf([
  FAKE_HOME,
  `${FAKE_BASE}models/`,
  `${FAKE_BASE}models/alpha-model/`,
  `${FAKE_BASE}models/beta-model/`
]);
const FAKE_SITEMAP_NO_MODELS = sitemapOf([
  FAKE_HOME,
  `${FAKE_BASE}deal/aaaaaaaaaaaa/`,
  `${FAKE_BASE}deal/bbbbbbbbbbbb/`
]);

/* ---------------- 用例执行 ---------------- */

const results = [];

/** 用例的 base 与服务端是一一对应的（同端口）；按端口取那一份访问日志，供证据里附「确实走过 HTTP」的原始行。 */
let accessOf = () => [];

/**
 * 跑一条用例（**异步** spawn —— 这一点是踩出来的，见下）。
 *
 * ⚠️ 最初这里用的是 `spawnSync`，结果全部用例都"超时失败"：本脚本**自己**就是那台静态服务，
 * 而 `spawnSync` 会把 Node 的事件循环整个堵死 —— 子进程发的 HTTP 请求永远等不到父进程的响应，
 * 于是每条用例都在 `--sitemap-timeout` 上超时（15s）。**服务与被测进程必须在不同的事件循环里，
 * 或者服务那一侧不能是阻塞等待的那一侧**。改成 `spawn` + Promise 之后，父进程在等待期间照样服务。
 * （这条教训也写进了 robustness-rehearsal.txt 的代码级论证里。）
 */
function runProcess(argv, timeoutMs) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, argv, { cwd: ROOT });
    let out = '';
    child.stdout.on('data', chunk => { out += chunk; });
    child.stderr.on('data', chunk => { out += chunk; });
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.on('error', error => { clearTimeout(timer); resolve({ status: null, log: `${out}\n[spawn error] ${error.message}` }); });
    child.on('close', code => { clearTimeout(timer); resolve({ status: code, log: out }); });
  });
}

async function runCase({ id, title, base, args = [], expectExit, expectIncludes = [], expectAbsent = [], jsonOut = null }) {
  const argv = [SMOKE, `--base=${base}`, ...args];
  if (jsonOut) argv.push(`--out=${path.join(__dirname, jsonOut)}`);
  const started = Date.now();
  const res = await runProcess(argv, 15 * 60 * 1000);
  const log = res.log || '';
  const exit = res.status;
  const includesMiss = expectIncludes.filter(needle => !log.includes(needle));
  const absentHit = expectAbsent.filter(needle => log.includes(needle));
  const ok = exit === expectExit && includesMiss.length === 0 && absentHit.length === 0;
  const record = {
    id, title, base, args, jsonOut,
    command: `node ${path.relative(ROOT, SMOKE).split(path.sep).join('/')} --base=${base}${args.length ? ' ' + args.join(' ') : ''}${jsonOut ? ` --out=${jsonOut}` : ''}`,
    exitCode: exit, expectExit, ok, includesMiss, absentHit, durationMs: Date.now() - started, log,
    // 期望语句也进记录：robustness 证据里的"结论表"要逐条打印**判的是哪句话**（不是只打印退出码）。
    expectIncludes, expectAbsent
  };
  results.push(record);
  console.log(`${ok ? '✓' : '✗'} ${id}（exit=${exit}，期望 ${expectExit}，${((Date.now() - started) / 1000).toFixed(1)}s）${title}`);
  if (!ok) {
    if (exit !== expectExit) console.log(`    ✗ 退出码 ${exit} ≠ ${expectExit}`);
    includesMiss.forEach(n => console.log(`    ✗ 日志里没有出现期望语句：${n}`));
    absentHit.forEach(n => console.log(`    ✗ 日志里**不该**出现的语句出现了：${n}`));
  }
  return record;
}

const caseFile = (record, extra = '') => {
  const lines = [
    `# ${record.id} · ${record.title}`,
    '',
    `命令：${record.command}`,
    `退出码：${record.exitCode}（期望 ${record.expectExit}）· 判定：${record.ok ? 'OK' : '不符'} · 用时 ${(record.durationMs / 1000).toFixed(1)}s`,
    `基线地址：${record.base}（**本机回环**，不是真实线上域名）`,
    ''
  ];
  if (extra) lines.push(extra, '');
  lines.push('## stdout + stderr（原样）', '', '```', record.log.replace(/\s+$/, ''), '```', '');
  return `${lines.join('\n')}\n`;
};

(async () => {
  if (!fs.existsSync(DIST)) throw new Error(`${DIST} 不存在`);
  if (!fs.existsSync(DIST_BASELINE)) throw new Error(`${DIST_BASELINE} 不存在`);

  const servers = [];
  const start = options => startStaticServer(options).then(started => { servers.push(started); return started; });

  try {
    // 服务：dist @ /、dist @ 项目站前缀、dist.baseline @ 项目站前缀、假 sitemap、404 目录、hang
    const rootSrv = await start({ dir: DIST, prefix: '/' });
    const projSrv = await start({ dir: DIST, prefix: PROJECT_PREFIX });
    const baseSrv = await start({ dir: DIST_BASELINE, prefix: PROJECT_PREFIX });
    const noDealSrv = await start({ dir: DIST, prefix: PROJECT_PREFIX, overrides: { 'sitemap.xml': FAKE_SITEMAP_NO_DEAL } });
    const noModelsSrv = await start({ dir: DIST, prefix: PROJECT_PREFIX, overrides: { 'sitemap.xml': FAKE_SITEMAP_NO_MODELS } });
    const emptySrv = await start({ dir: __dirname, prefix: '/' });            // release/ 里没有 sitemap.xml ⇒ 404
    const hangSrv = await start({ dir: DIST, prefix: '/', hang: true });      // 连得上但永不响应

    console.log('演练服务（全部 127.0.0.1 + 随机端口）：');
    servers.forEach(s => console.log(`  ${s.dir} @ ${s.prefix}${s.hang ? '（--hang）' : ''} → ${s.base}`));
    accessOf = base => {
      const port = new URL(base).port;
      const hit = servers.find(s => new URL(s.base).port === port);
      const lines = hit ? hit.access : [];
      // 只挑"与取 sitemap / 前缀 / 404 有关"的行：同一个服务上后面还跑过整站导航，
      // 直接截前三行会把真正要取证的那一行（例如"不在挂载前缀"）切掉。
      const interesting = lines.filter(line => /sitemap\.xml|404|不在挂载前缀|--hang/.test(line));
      return (interesting.length ? interesting : lines).slice(0, 6);
    };

    /* ---- ① 线上路径（根前缀，8 页全跑） ---- */
    const main = await runCase({
      id: 'online-path-root-prefix', title: '线上路径 · dist 挂在 / · 8 页全跑',
      base: rootSrv.base, expectExit: 0, jsonOut: 'online-path-rehearsal.json'
    });
    fs.writeFileSync(path.join(__dirname, 'online-path-rehearsal.txt'), caseFile(main,
      `## 服务端访问日志（前 12 行：证明 sitemap 确实是**通过 HTTP** 取的）\n\n\`\`\`\n${rootSrv.access.slice(0, 12).join('\n')}\n\`\`\`\n`), 'utf8');

    /* ---- ② 线上路径（项目站前缀，最接近线上形状） ---- */
    const prefix = await runCase({
      id: 'online-path-project-prefix', title: `线上路径 · dist 挂在 ${PROJECT_PREFIX}（与 GitHub Pages 项目站同形状）· 8 页全跑`,
      base: projSrv.base, expectExit: 0, jsonOut: 'online-path-prefix-rehearsal.json'
    });
    fs.writeFileSync(path.join(__dirname, 'online-path-prefix-rehearsal.txt'), caseFile(prefix,
      `## 服务端访问日志（前 12 行：注意每条都在 ${PROJECT_PREFIX} 之下）\n\n\`\`\`\n${projSrv.access.slice(0, 12).join('\n')}\n\`\`\`\n`), 'utf8');

    /* ---- ③ 负对照：改动前产物必须红 ---- */
    const neg = await runCase({
      id: 'negative-control-baseline', title: '负对照 · dist.baseline（改动前产物）· 同一 --base= 模式',
      base: baseSrv.base, args: ['--only=student/'], expectExit: 1,
      expectIncludes: ['有字区域宽', '不在同一轴'], jsonOut: 'online-path-negcontrol-baseline.json'
    });
    fs.writeFileSync(path.join(__dirname, 'online-path-negcontrol-baseline.txt'), caseFile(neg,
      `## 服务端访问日志（前 6 行）\n\n\`\`\`\n${baseSrv.access.slice(0, 6).join('\n')}\n\`\`\`\n`), 'utf8');

    /* ---- ④ 健壮性①：sitemap 缺 deal 条目 ---- */
    const r4 = await runCase({
      id: 'robust-no-deal-entries', title: '健壮性① · 假 sitemap 只有 models、没有 deal ⇒ 必须 exit 2 且说清原因',
      base: noDealSrv.base, args: ['--only=student/'], expectExit: 2,
      expectIncludes: ['deal 路由 0 条', '推不出取样页'], expectAbsent: ['浏览器：']
    });
    /* ---- ⑤ 健壮性①：sitemap 缺 models 条目 ---- */
    const r5 = await runCase({
      id: 'robust-no-model-entries', title: '健壮性① · 假 sitemap 只有 deal、没有 models ⇒ 必须 exit 2 且说清原因',
      base: noModelsSrv.base, args: ['--only=student/'], expectExit: 2,
      expectIncludes: ['models 路由 0 条', '推不出取样页'], expectAbsent: ['浏览器：']
    });
    /* ---- ⑥ 健壮性②：sitemap 非 200（404）---- */
    const r6 = await runCase({
      id: 'robust-sitemap-404', title: '健壮性② · 目标目录里没有 sitemap.xml ⇒ HTTP 404 ⇒ 必须 exit 2',
      base: emptySrv.base, expectExit: 2,
      expectIncludes: ['HTTP 404'], expectAbsent: ['浏览器：']
    });
    /* ---- ⑦ 健壮性②：sitemap 超时（连得上但永不响应）---- */
    const r7 = await runCase({
      id: 'robust-sitemap-timeout', title: '健壮性② · 连得上但永不响应 ⇒ 必须 exit 2 且报"超过 Nms 未响应"',
      base: hangSrv.base, args: ['--sitemap-timeout=1200'], expectExit: 2,
      expectIncludes: ['超过 1200ms 未响应'], expectAbsent: ['浏览器：']
    });
    /* ---- ⑧ 健壮性③：前缀写错（服务挂在子路径，base 却给了根）---- */
    // 同一个端口、把挂载前缀从 base 里去掉 —— 这正是"项目站前缀写漏了"的形状。
    const mismatchBase = new URL('/', projSrv.base).href;
    const r8 = await runCase({
      id: 'robust-prefix-mismatch', title: `健壮性③ · 服务挂在 ${PROJECT_PREFIX}，base 却给根路径 ⇒ sitemap 404 ⇒ 必须 exit 2（不许静默变绿）`,
      base: mismatchBase, expectExit: 2,
      expectIncludes: ['HTTP 404'], expectAbsent: ['浏览器：']
    });

    const robustness = [r4, r5, r6, r7, r8];
    fs.writeFileSync(path.join(__dirname, 'robustness-rehearsal.txt'), [
      '# t12 · 线上代码路径的健壮性演练（三种线上会遇到的情形，全部实测）',
      '',
      `时间：${new Date().toISOString()} · 全部只访问 127.0.0.1（回环）· 假 sitemap 用保留域 ${new URL(FAKE_BASE).host}（永不解析）`,
      '',
      '## 结论表',
      '',
      '| # | 情形 | 退出码（期望） | 判定 | 关键输出语句 |',
      '| --- | --- | --- | --- | --- |',
      ...robustness.map(r => `| ${r.id} | ${r.title} | ${r.exitCode}（${r.expectExit}） | ${r.ok ? '✅ 符合' : '❌ 不符'} | ${r.expectIncludes.map(s => `\`${s}\``).join('、')} |`),
      '',
      '## 代码级论证（与实测互补，说明"为什么是这样"）',
      '',
      '- **① 条目缺失**：`deriveRoutes()` 在线上模式（`--base=`，没有 `dir`）下**没有 JSON 退路** ——',
      '  推不出就 `throw`，由顶层 `.catch` 打成 `FAILED: …` 并给 **退出码 2**（不是 0、不是"0 页通过"）。',
      '  本地模式（`--dir=`）则退到 `deals.json` / `models.json`，但**必须留痕**：`derivation.fallback=true` + 一行 ⚠️。',
      '- **② 非 200 / 超时**：`fetch` 默认**没有超时** —— 不显式给 `AbortSignal` 的话，"连得上但不响应"会让脚本',
      '  **静默挂死**（不是失败、不是跳过，是永远不结束）。因此 `--sitemap-timeout=`（缺省 15000ms）是硬要求，',
      '  超时被翻译成人话（`超过 Nms 未响应`）后交给同一条 `exit 2` 出口。',
      '- **③ URL 前缀**：`<loc>` 是**绝对 URL**，项目站的每条都带 `/ai-deals-aggregator/` 前缀；脚本按',
      '  「BASE 的 pathname」与「sitemap 里最短的、以 `/` 结尾的 pathname」两处取站点根前缀并剥掉，',
      '  前缀写错 ⇒ sitemap 本身就取不到（404）⇒ 明确失败。上面用例 ② 与 ⑧ 分别是这件事的**正反两面**。',
      '',
      '## 逐条原始日志',
      '',
      ...robustness.map(r => caseFile(r, `## 服务端访问日志（前 3 行）\n\n\`\`\`\n${accessOf(r.base).join('\n')}\n\`\`\`\n`)),
      ''
    ].join('\n'), 'utf8');

    /* ---- 出口纪律（机器核对，不靠嘴说） ---- */
    // ① 每条用例的 base 必须是回环地址；② 本演练产出的证据文件里**一次都不许**出现真实线上域名。
    const nonLoopback = results.filter(r => new URL(r.base).hostname !== '127.0.0.1').map(r => `${r.id} → ${r.base}`);
    const REHEARSAL_FILES = ['online-path-rehearsal.json', 'online-path-rehearsal.txt', 'online-path-prefix-rehearsal.json',
      'online-path-prefix-rehearsal.txt', 'online-path-negcontrol-baseline.json', 'online-path-negcontrol-baseline.txt',
      'robustness-rehearsal.txt', 'rehearsal-summary.json'];
    const domainHits = REHEARSAL_FILES
      .map(name => path.join(__dirname, name))
      .filter(file => fs.existsSync(file) && fs.readFileSync(file, 'utf8').includes(new URL(PROD_BASE).host))
      .map(file => path.basename(file));
    console.log(`出口纪律：非回环 base ${nonLoopback.length} 条；演练产物里出现真实线上域名的次数 ${domainHits.length}（文件：${domainHits.join(' / ') || '无'}）`);

    /* ---- 汇总 ---- */
    const summary = {
      tool: 'secondary-page-layout-unification/rehearse-online-path',
      at: new Date().toISOString(),
      node: process.version,
      notes: [
        '全部用例只访问 127.0.0.1（回环）+ 随机端口；没有任何真实线上域名出现在证据里',
        '退出码语义：0 = 判据全过；1 = 有断言失败（负对照的期望值）；2 = 取数/环境失败',
        '本条是**某一时刻**的快照：online-smoke.cjs 若再被修改，必须重跑本演练'
      ],
      egress: {
        nonLoopbackBases: nonLoopback,
        realDomainHitsInRehearsalArtifacts: domainHits,
        note: '真实线上域名的字符串只允许出现在 online-smoke.cjs 的功能常量（线上模式的缺省基线地址）里；'
          + '演练期间没有任何请求打到它 —— 服务端访问日志逐条都是 127.0.0.1 上的路径'
      },
      servers: servers.map(s => ({ dir: path.relative(ROOT, s.dir).split(path.sep).join('/'), prefix: s.prefix, hang: s.hang, base: s.base })),
      cases: results.map(r => ({
        id: r.id, title: r.title, command: r.command, base: r.base,
        exitCode: r.exitCode, expectExit: r.expectExit, ok: r.ok,
        includesMiss: r.includesMiss, absentHit: r.absentHit, durationMs: r.durationMs
      })),
      ok: results.every(r => r.ok) && nonLoopback.length === 0 && domainHits.length === 0
    };
    fs.writeFileSync(path.join(__dirname, 'rehearsal-summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

    // 写完之后再扫一遍（这次把 summary 自己也算进去）——"证据里 0 次出现真实域名"必须是**终态**的结论。
    const finalHits = [...REHEARSAL_FILES, 'rehearsal-summary.json']
      .map(name => path.join(__dirname, name))
      .filter(file => fs.existsSync(file) && fs.readFileSync(file, 'utf8').includes(new URL(PROD_BASE).host))
      .map(file => path.basename(file));
    if (finalHits.length) {
      console.error(`FAILED: 演练产物里出现了真实线上域名：${finalHits.join(' / ')}（出口纪律不通过）`);
      process.exit(2);
    }

    console.log(`\n用例 ${results.length} 条，符合期望 ${results.filter(r => r.ok).length} 条`);
    results.forEach(r => console.log(`  ${r.ok ? '✓' : '✗'} ${r.id} exit=${r.exitCode}（期望 ${r.expectExit}）`));
    if (!summary.ok) process.exit(1);
  } finally {
    await Promise.all(servers.map(s => s.close().catch(() => {})));
    console.log(`\n已关闭 ${servers.length} 个本机静态服务`);
  }
})().catch(error => { console.error(`FAILED: ${error.message}`); process.exit(2); });
