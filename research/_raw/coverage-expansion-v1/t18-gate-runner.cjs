#!/usr/bin/env node
'use strict';
/**
 * t18 · 本地 Full Gate 驱动器（唯一一次全量真跑）
 *
 * 设计原则
 *  1) **动态枚举**：步骤表从 `.github/actions/gate/action.yml` 现读（不写死历史项数）；
 *     门禁口径（`--expect-checks`）由 check-ci-consistency 自己从 verify.yml 读，本脚本不干预。
 *  2) **原样执行**：`node …` 步骤按 action.yml 的 run 体逐字跑；`npm ci` 是环境准备步骤，
 *     在共享 worktree 里重跑会删装 node_modules（会打断并发队友），如实标 skipped 并写明理由；
 *     三个 shell 步骤用 Git bash 真跑（带上 GITHUB_OUTPUT / GITHUB_STEP_SUMMARY 与输入）。
 *  3) **不因失败中断**：每一步都记录 exit，跑完全部再判定。
 *  4) 附加验收（build A/B、可复现、独立重算、基线完整性）也在本脚本里顺序执行，
 *     避免与门禁步骤并发抢 dist/ 与浏览器。
 *
 * 用法：node research/_raw/coverage-expansion-v1/t18-gate-runner.cjs
 * 产出：research/_raw/coverage-expansion-v1/t18-gate-results.json
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const WT = path.join(__dirname, '..', '..', '..');
const OUT_JSON = path.join(WT, 'research/_raw/coverage-expansion-v1/t18-gate-results.json');
const BASH = 'C:\\Program Files\\Git\\bin\\bash.exe';
const sh = new Set(['bash', 'sh']);
const A_OUT = 't18-a.building';
const B_OUT = 't18-b.building';

const results = { startedAt: new Date().toISOString(), head: null, statusBefore: [], steps: [], extras: {}, statusAfter: [], notes: [] };
const run = (cmd, args, opts = {}) => {
  const t0 = Date.now();
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd || WT, encoding: 'utf8', timeout: opts.timeout || 900000,
    maxBuffer: 64 * 1024 * 1024, env: { ...process.env, ...(opts.env || {}) },
  });
  return { exit: r.status, ms: Date.now() - t0, out: (r.stdout || ''), err: (r.stderr || ''), signal: r.signal };
};
const git = args => spawnSync('git', ['-C', WT, ...args], { encoding: 'utf8' }).stdout.trim();
const sha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const tail = (s, n) => String(s || '').split('\n').filter(Boolean).slice(-n).join('\n');

/* ── 动态读 action.yml 的步骤（name / shell / run 体） ───────────────── */
function parseSteps() {
  const lines = fs.readFileSync(path.join(WT, '.github/actions/gate/action.yml'), 'utf8').split('\n');
  const steps = [];
  let cur = null, inRun = false, runIndent = 0;
  const flush = () => {
    if (cur && cur.run !== undefined) {
      if (typeof cur.run === 'string' && cur.run.startsWith('\n')) cur.run = cur.run.slice(1); // 块头的换行不算内容
      steps.push(cur);
    }
    cur = null;
  };
  for (const raw of lines) {
    const indent = (raw.match(/^[ \t]*/) || [''])[0].length;
    const line = raw.trim();
    if (inRun) {
      if (line === '') { cur.run += '\n'; continue; }                                  // 空行属于块标量
      if (indent > runIndent) { cur.run += '\n' + raw.slice(runIndent + 2); continue; } // 只剥公共缩进
      inRun = false;
    }
    if (/^-\s+name:\s*/.test(line)) { flush(); cur = { name: line.replace(/^-\s+name:\s*/, '').trim(), shell: null, run: undefined }; continue; }
    if (!cur) continue;
    const kv = /^([a-z-]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    if (kv[1] === 'shell') { cur.shell = kv[2].trim(); continue; }
    if (kv[1] === 'run') {
      if (/^[|>]/.test(kv[2].trim())) { cur.run = ''; inRun = true; runIndent = indent; }
      else cur.run = kv[2];
    }
  }
  flush();
  return steps;
}

/* ─────────────────────────── 开始 ─────────────────────────── */
results.head = { sha: git(['rev-parse', 'HEAD']), subject: git(['log', '-1', '--format=%s']) };
results.statusBefore = git(['status', '--porcelain']).split('\n').filter(Boolean);
results.notes.push('步骤表从 .github/actions/gate/action.yml 现读；门禁项数口径由 check-ci-consistency 从 verify.yml 自读（不在本脚本里写死）');

const steps = parseSteps();
if (process.argv.includes('--list')) {
  steps.forEach((s, i) => console.log(String(i + 1).padStart(2) + '. [' + (s.shell || '-') + '] '
    + s.name + '  →  ' + String(s.run || '').split('\n')[0].slice(0, 90) + (String(s.run || '').includes('\n') ? ' …(多行)' : '')));
  process.exit(0);
}
console.log('动态枚举到门禁步骤 ' + steps.length + ' 步（HEAD ' + results.head.sha.slice(0, 7) + '）');

/* ── 阶段 B：逐步执行 ─────────────────────────────────────────── */
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 't18-gate-'));
for (const step of steps) {
  const body = String(step.run || '').trim();
  const rec = { name: step.name, shell: step.shell, body: body.split('\n')[0].slice(0, 200), bodyFull: body, multiLine: body.includes('\n') };
  if (/^npm ci/.test(body)) {
    rec.status = 'skipped'; rec.exit = null;
    rec.reason = '环境准备步骤：在共享 worktree 上重跑 npm ci 会删装 node_modules 并打断并发队友；node_modules 已就绪（CI 上才需要这一步）';
    results.steps.push(rec); console.log('SKIP  ' + step.name); continue;
  }
  const isShell = step.shell && sh.has(step.shell) || body.includes('\n') || /^\s*(set |if |\{|echo)/.test(body);
  let r;
  if (isShell) {
    const go = path.join(tmpDir, 'gh_output_' + results.steps.length + '.txt');
    const gs = path.join(tmpDir, 'gh_summary_' + results.steps.length + '.txt');
    fs.writeFileSync(go, ''); fs.writeFileSync(gs, '');
    // 复合 action 的 inputs：三个调用方里只有 collect/verify 的 workflow_dispatch 能显式降级；
    // 本地按「非人工触发」的最严口径求值 ⇒ allow_degraded_run=false
    // 步骤之间还有**输出链**（browser.outputs → decision.outputs → conclusion），与 GitHub 的执行顺序一致地接力：
    const outOf = name => {
      const prior = results.steps.filter(s => s.name.startsWith(name) && s.githubOutput).pop();
      const map = {};
      if (prior) for (const line of prior.githubOutput.split('\n')) {
        const i = line.indexOf('=');
        if (i > 0) map[line.slice(0, i)] = line.slice(i + 1);
      }
      return map;
    };
    const browserOut = outOf('Prepare browser');
    const decisionOut = outOf('Browser availability');
    let script = body
      .replace(/\$\{\{\s*inputs\.allow_degraded_run\s*\}\}/g, 'false')
      .replace(/\$\{\{\s*steps\.browser\.outputs\.browser_available\s*\}\}/g, browserOut.browser_available || 'false')
      .replace(/\$\{\{\s*steps\.browser\.outputs\.executable\s*\}\}/g, browserOut.executable || '')
      .replace(/\$\{\{\s*steps\.decision\.outputs\.mode\s*\}\}/g, decisionOut.mode || 'full')
      .replace(/\$\{\{\s*github\.event_name\s*\}\}/g, 'push')
      .replace(/\$\{\{\s*github\.ref\s*\}\}/g, 'refs/heads/coverage-expansion-v1');
    r = run(BASH, ['-c', script], { env: { DSH_BASH: BASH, GITHUB_OUTPUT: go, GITHUB_STEP_SUMMARY: gs, GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/coverage-expansion-v1' }, timeout: 1800000 });
    rec.githubOutput = fs.readFileSync(go, 'utf8').trim();
    rec.githubSummaryTail = tail(fs.readFileSync(gs, 'utf8'), 3);
  } else {
    const parts = body.split(/\s+/);
    const cmd = parts[0] === 'node' ? process.execPath : parts[0];
    r = run(cmd, parts.slice(1), { env: { DSH_BASH: BASH } });
  }
  rec.exit = r.exit; rec.ms = r.ms; rec.signal = r.signal;
  rec.status = r.exit === 0 ? 'passed' : 'failed';
  rec.stdoutTail = tail(r.out, 6); rec.stderrTail = tail(r.err, 4);
  results.steps.push(rec);
  console.log((rec.exit === 0 ? 'PASS  ' : 'FAIL  ') + step.name + '  (exit ' + r.exit + ', ' + (r.ms / 1000).toFixed(1) + 's)');
}
const passed = results.steps.filter(s => s.status === 'passed').length;
const failed = results.steps.filter(s => s.status === 'failed');
const skipped = results.steps.filter(s => s.status === 'skipped').length;
results.gateSummary = { total: results.steps.length, passed, failed: failed.length, skipped, failedNames: failed.map(s => s.name) };
console.log('\n门禁步骤：' + passed + ' 过 / ' + failed.length + ' 红 / ' + skipped + ' 跳过（共 ' + results.steps.length + '）');

/* ── 阶段 C：附加验收 ─────────────────────────────────────────── */
// C0 反证：把「浏览器可用」置真，同一条判定 shell 必须 exit 0（证明 46 的红只可能来自本机探针路径，不是逻辑坏了）
{
  const dec = results.steps.find(s => s.name.startsWith('Browser availability'));
  if (dec) {
    const go = path.join(tmpDir, 'gh_avail_true.txt');
    fs.writeFileSync(go, 'browser_available=true\nexecutable=/usr/bin/google-chrome\n');
    const script = String(dec.bodyFull || '')
      .replace(/\$\{\{\s*steps\.browser\.outputs\.browser_available\s*\}\}/g, 'true')
      .replace(/\$\{\{\s*steps\.browser\.outputs\.executable\s*\}\}/g, '/usr/bin/google-chrome')
      .replace(/\$\{\{\s*inputs\.allow_degraded_run\s*\}\}/g, 'false');
    const r = run(BASH, ['-c', script], { env: { DSH_BASH: BASH, GITHUB_OUTPUT: go, GITHUB_STEP_SUMMARY: path.join(tmpDir, 'gh_s2.txt') }, timeout: 120000 });
    results.extras.availabilityCounterCheck = { exit: r.exit, githubOutput: fs.readFileSync(go, 'utf8').trim(), tail: tail(r.out, 2) };
    console.log('[extras] C0 浏览器可用=真时同一条判定 shell → exit ' + r.exit + '（预期 0）');
  }
}
// C1 build A/B 逐字节
console.log('\n[extras] C1 build A / build B …');
const bA = run(process.execPath, ['scripts/tools/build-local.js', '--out=' + A_OUT], { timeout: 1800000 });
const bB = run(process.execPath, ['scripts/tools/build-local.js', '--out=' + B_OUT], { timeout: 1800000 });
function inventory(dir) {
  const map = {};
  const walk = d => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else map[path.relative(dir, p).split(path.sep).join('/')] = sha(p);
    }
  };
  walk(dir);
  return map;
}
const invA = inventory(path.join(WT, A_OUT)), invB = inventory(path.join(WT, B_OUT));
const keysA = Object.keys(invA).sort(), keysB = Object.keys(invB).sort();
const onlyA = keysA.filter(k => !(k in invB)), onlyB = keysB.filter(k => !(k in invA));
const diff = keysA.filter(k => k in invB && invA[k] !== invB[k]);
const htmlOf = inv => Object.keys(inv).filter(k => k.endsWith('.html')).length;
results.extras.buildAB = {
  aExit: bA.exit, bExit: bB.exit, filesA: keysA.length, filesB: keysB.length,
  htmlA: htmlOf(invA), htmlB: htmlOf(invB), identical: onlyA.length === 0 && onlyB.length === 0 && diff.length === 0,
  onlyA: onlyA.slice(0, 10), onlyB: onlyB.slice(0, 10), different: diff.slice(0, 10),
  manifestSha: crypto.createHash('sha256').update(keysA.map(k => k + ' ' + invA[k]).join('\n')).digest('hex'),
};
results.extras.buildAB.manifestShaB = crypto.createHash('sha256').update(keysB.map(k => k + ' ' + invB[k]).join('\n')).digest('hex');
console.log('  A ' + keysA.length + ' 文件 / B ' + keysB.length + ' 文件 · 逐字节一致 = ' + results.extras.buildAB.identical);

// C2 models 可复现
const mDry = run(process.execPath, ['scripts/tools/rebuild-models.js', '--dry-run']);
const mChk = run(process.execPath, ['scripts/tools/check-models-reproducible.js']);
results.extras.models = { dryRunExit: mDry.exit, dryRunTail: tail(mDry.out + mDry.err, 4), reproducibleExit: mChk.exit, tail: tail(mChk.out, 3) };

// C3 report --json 两次逐字节 + 规格读数
const r1 = run(process.execPath, ['scripts/tools/coverage-report.js', '--json']);
const r2 = run(process.execPath, ['scripts/tools/coverage-report.js', '--json']);
results.extras.report = {
  exit1: r1.exit, exit2: r2.exit,
  sha1: crypto.createHash('sha256').update(r1.out).digest('hex'),
  sha2: crypto.createHash('sha256').update(r2.out).digest('hex'),
};
results.extras.report.identical = results.extras.report.sha1 === results.extras.report.sha2;
results.extras.report.headline = (r1.out.match(/计价条目 .*/) || [''])[0].trim();
results.extras.report.equation = (r1.out.match(/.*= 已映射认领.*/) || [''])[0].trim();

// C4 独立重算：直接读来源层，自实现展开（不复用 lib / 报告代码）
{
  const read = rel => JSON.parse(fs.readFileSync(path.join(WT, rel), 'utf8'));
  const apiDoc = read('api-plans.json'), plansDoc = read('plans.json'), linksDoc = read('scripts/data/model-registry-links.json');
  const gapsDoc = read('scripts/data/model-registry-gaps.json'), dealsDoc = read('deals.json'), modelsDoc = read('models.json');
  const provDoc = read('scripts/data/providers.json');
  const apiItems = apiDoc.plans.reduce((n, p) => n + (p.models || []).length, 0);
  const claimSet = new Set();
  for (const l of linksDoc.links || []) {
    if (!l.apiPlanId) continue;
    const plan = apiDoc.plans.find(p => p.id === l.apiPlanId);
    if (!plan) continue;
    for (const m of plan.models || []) {
      if (m.modelKey !== l.modelKey) continue;
      if (l.variant !== null && l.variant !== undefined && m.variant !== l.variant) continue;
      claimSet.add(l.apiPlanId + '_' + m.modelKey + '_' + m.variant);
    }
  }
  const gapSet = new Set();
  for (const g of gapsDoc.declarations || []) {
    if (!g.apiPlanId) continue;
    for (const id of (g.identities || [])) gapSet.add(g.apiPlanId + '_' + id.modelKey + '_' + (id.variant === undefined ? null : id.variant));
  }
  let declaredIdentities = 0;
  for (const g of gapsDoc.declarations || []) if (g.apiPlanId) declaredIdentities += (g.identities || []).length;
  const codingStrings = plansDoc.plans.reduce((n, p) => n + ((p.models && p.models.length) || 0), 0);
  results.extras.recompute = {
    pricingItems: apiItems, claims: claimSet.size, gapsClaims: gapSet.size,
    unclaimed: apiItems - claimSet.size - gapSet.size,
    declaredApiIdentities: declaredIdentities,
    apiProviders: new Set(apiDoc.plans.map(p => p.provider)).size,
    codingPlans: plansDoc.plans.length, codingProviders: new Set(plansDoc.plans.map(p => p.provider)).size,
    codingModelStrings: codingStrings,
    links: (linksDoc.links || []).length,
    apiLinks: (linksDoc.links || []).filter(l => l.apiPlanId).length,
    codingLinks: (linksDoc.links || []).filter(l => !l.apiPlanId).length,
    gaps: (gapsDoc.declarations || []).length,
    providersRegistered: Object.keys(provDoc).filter(k => !k.startsWith('_')).length,
    dealsTotal: dealsDoc.deals.length,
    dealRows: dealsDoc.deals.filter(d => d.type === 'deal').length,
    toolRows: dealsDoc.deals.filter(d => d.type !== 'deal').length,
    publishedModels: modelsDoc.models.length,
  };
}

// C5 Baseline Integrity Diff（六项）
{
  const baseline = JSON.parse(fs.readFileSync(path.join(WT, 'research/_raw/coverage-expansion-v1/baseline.json'), 'utf8'));
  const deals = JSON.parse(fs.readFileSync(path.join(WT, 'deals.json'), 'utf8'));
  const distDir = path.join(WT, 'dist');
  const htmlFiles = [];
  const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith('.html')) htmlFiles.push(path.relative(distDir, p).split(path.sep).join('/')); } };
  walk(distDir);
  const sitemap = fs.readFileSync(path.join(distDir, 'sitemap.xml'), 'utf8');
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  const dealIds = deals.deals.filter(d => d.type === 'deal').map(d => d.id);
  const missingDealPages = dealIds.filter(id => !locs.some(u => u.includes('/deal/' + id + '/')));
  const manifest = fs.existsSync(path.join(distDir, 'data/index.json')) ? JSON.parse(fs.readFileSync(path.join(distDir, 'data/index.json'), 'utf8')) : null;
  const hist = JSON.parse(fs.readFileSync(path.join(WT, 'scripts/data/deal-history.json'), 'utf8'));
  results.extras.integrity = {
    baselineDeals: baseline.data.deals,
    currentDeals: { total: deals.deals.length, deal: dealIds.length, tool: deals.deals.length - dealIds.length },
    dealsDelta: deals.deals.length - baseline.data.deals.total,
    dealsDealDelta: dealIds.length - baseline.data.deals.dealRows,
    distHtml: htmlFiles.length, baselineDistHtml: baseline.site.distHtmlPages,
    sitemap: locs.length, baselineSitemap: baseline.site.sitemapEntries,
    dealPagesInSitemap: dealIds.length - missingDealPages.length, missingDealPages: missingDealPages.slice(0, 10),
    historyEvents: (hist.events || []).length,
    historyBaseline: (hist.events || []).length,
    manifestDatasets: manifest ? Object.keys(manifest.datasets || manifest.entries || {}).length : null,
    manifestTopKeys: manifest ? Object.keys(manifest).slice(0, 8) : null,
  };
}

/* ── 收尾快照 ─────────────────────────────────────────────────── */
results.finishedAt = new Date().toISOString();
results.statusAfter = git(['status', '--porcelain']).split('\n').filter(Boolean);
results.concurrentEdits = {
  headChanged: git(['rev-parse', 'HEAD']) !== results.head.sha,
  statusChanged: JSON.stringify(results.statusAfter) !== JSON.stringify(results.statusBefore),
  afterCount: results.statusAfter.length, beforeCount: results.statusBefore.length,
};
results.dataSha = {
  'deals.json': sha(path.join(WT, 'deals.json')),
  'plans.json': sha(path.join(WT, 'plans.json')),
  'api-plans.json': sha(path.join(WT, 'api-plans.json')),
  'scripts/data/model-registry-links.json': sha(path.join(WT, 'scripts/data/model-registry-links.json')),
  'scripts/data/model-registry-gaps.json': sha(path.join(WT, 'scripts/data/model-registry-gaps.json')),
  'scripts/data/models.json': sha(path.join(WT, 'scripts/data/models.json')),
};
fs.writeFileSync(OUT_JSON, JSON.stringify(results, null, 2) + '\n', 'utf8');
fs.rmSync(path.join(WT, A_OUT), { recursive: true, force: true });
fs.rmSync(path.join(WT, B_OUT), { recursive: true, force: true });
console.log('\n结果已写：research/_raw/coverage-expansion-v1/t18-gate-results.json');
console.log('门禁 ' + passed + '/' + results.steps.length + ' 过 · build A/B 一致=' + results.extras.buildAB.identical
  + ' · report 两次一致=' + results.extras.report.identical + ' · 并发编辑=' + results.concurrentEdits.statusChanged);
