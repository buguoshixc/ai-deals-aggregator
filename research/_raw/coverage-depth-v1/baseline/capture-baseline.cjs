#!/usr/bin/env node
/**
 * coverage-depth-v1：**Before 分母的唯一采集口**。
 *
 * 为什么要有它：题面 §0 明确要求「不得把 Prompt 里的旧数字当作当前真值」，§1 要求把所有
 * Before → After 一律钉在一份**重新实测**的 baseline 上。而要重测，就必须保证测的是
 * **未被本轮改动污染的树** —— 因此本脚本只允许在 `.worktrees/cd-baseline`（detached 在
 * 基线 SHA ff86368 上、0 改动）里运行，输出写到 coverage-depth-v1 工作树的
 * `research/_raw/coverage-depth-v1/baseline/`。
 *
 * 纪律：
 *   · 只跑**只读**命令（report / list / 读 JSON）；不 build、不采集、不写任何被跟踪文件；
 *   · 大输出（--json 约 370KB）一律**文件捕获**，不依赖 stdout pipe（题面 §72）；
 *   · `npm run report:coverage` 带 npm banner，所以同时留 `node` 直跑的纯正文并对其取 sha256，
 *     两条都留档，避免以后再出现「这个 sha256 的定义没留痕」。
 *
 * 用法（cwd 必须是基线工作树）：
 *   node <coverage-depth-v1>/research/_raw/coverage-depth-v1/baseline/capture-baseline.cjs
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const CWD = process.cwd();
const BASELINE_SHA = 'ff86368e6d12d1ef57b2f51aa2c957c01d2a9ed8';
const OUT_DIR = process.env.CD_BASELINE_OUT
  || path.join(__dirname);

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function runNode(args, opts = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd: CWD,
    // 文件捕获：把 stdout 直接交给 fd，绕开 pipe buffer（题面 §72 的坑）
    stdio: opts.outFile ? ['ignore', fs.openSync(opts.outFile, 'w'), 'pipe'] : ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024
  });
  return {
    args,
    exitCode: result.status,
    stderr: (result.stderr || '').trim().slice(0, 2000)
  };
}

function runShell(cmd, args, outFile) {
  const result = spawnSync(cmd, args, {
    cwd: CWD,
    shell: process.platform === 'win32',
    stdio: outFile ? ['ignore', fs.openSync(outFile, 'w'), 'pipe'] : ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  });
  return { exitCode: result.status, stderr: (result.stderr || '').trim().slice(0, 2000) };
}

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(CWD, rel), 'utf8'));
}

function countGateSteps() {
  const text = fs.readFileSync(path.join(CWD, '.github/actions/gate/action.yml'), 'utf8');
  return (text.match(/^\s*- name:/gm) || []).length;
}

function expectChecks() {
  const text = fs.readFileSync(path.join(CWD, '.github/workflows/verify.yml'), 'utf8');
  const found = [...text.matchAll(/--expect-checks=(\d+)/g)].map(m => Number(m[1]));
  return { values: found, unique: [...new Set(found)] };
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const summary = {
    capturedAt: new Date().toISOString(),
    baselineSha: BASELINE_SHA,
    cwd: CWD,
    note: 'coverage-depth-v1 Before 分母；只在 detached 的 cd-baseline 工作树上采集',
    commands: {},
    readings: {},
    hashes: {}
  };

  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: CWD, encoding: 'utf8' }).stdout.trim();
  const dirty = spawnSync('git', ['status', '--porcelain=v1'], { cwd: CWD, encoding: 'utf8' }).stdout.trim();
  summary.git = { head, dirtyFiles: dirty ? dirty.split('\n').length : 0 };
  if (head !== BASELINE_SHA) {
    console.error(`❌ 当前 HEAD ${head} ≠ 基线 ${BASELINE_SHA}，拒绝采集（分母必须钉在基线 SHA 上）`);
    process.exit(1);
  }
  if (dirty) {
    console.error('❌ 基线工作树不干净，拒绝采集：\n' + dirty);
    process.exit(1);
  }

  summary.env = {
    node: process.version,
    npm: spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['--version'], { cwd: CWD, shell: process.platform === 'win32', encoding: 'utf8' }).stdout.trim(),
    platform: process.platform,
    arch: process.arch
  };
  const npmLs = path.join(OUT_DIR, 'npm-ls.txt');
  summary.commands['npm ls --depth=0'] = runShell(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ls', '--depth=0'], npmLs);

  /* ---- 覆盖报告：文本 + --json（两次，验确定性） ---- */
  const npmText = path.join(OUT_DIR, 'npm-report-coverage.txt');
  summary.commands['npm run report:coverage'] = runShell(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'report:coverage'], npmText);

  const pureText = path.join(OUT_DIR, 'report-coverage.txt');
  summary.commands['node scripts/tools/coverage-report.js'] = runNode(['scripts/tools/coverage-report.js'], { outFile: pureText });

  const json1 = path.join(OUT_DIR, 'report-coverage-json-1.txt');
  const json2 = path.join(OUT_DIR, 'report-coverage-json-2.txt');
  summary.commands['node scripts/tools/coverage-report.js --json (1)'] = runNode(['scripts/tools/coverage-report.js', '--json'], { outFile: json1 });
  summary.commands['node scripts/tools/coverage-report.js --json (2)'] = runNode(['scripts/tools/coverage-report.js', '--json'], { outFile: json2 });

  const b1 = fs.readFileSync(json1);
  const b2 = fs.readFileSync(json2);
  summary.hashes.reportCoverageText = sha256(fs.readFileSync(pureText));
  summary.hashes.reportCoverageJsonRun1 = sha256(b1);
  summary.hashes.reportCoverageJsonRun2 = sha256(b2);
  summary.hashes.reportCoverageJsonByteIdentical = b1.equals(b2);
  summary.readings.reportCoverageJsonBytes = b1.length;
  summary.readings.reportCoverageTextLines = fs.readFileSync(pureText, 'utf8').split('\n').length - 1;
  summary.readings.reportCoverageSelfCheckProblems = (() => {
    const m = fs.readFileSync(pureText, 'utf8').match(/报告自检问题：(\d+) 处/);
    return m ? Number(m[1]) : null;
  })();
  summary.readings.npmBannerBytes = fs.readFileSync(npmText).length - fs.readFileSync(pureText).length;

  /* ---- 采集器注册表 ---- */
  const listStatic = path.join(OUT_DIR, 'collect-list.txt');
  summary.commands['node scripts/collect.js --list'] = runNode(['scripts/collect.js', '--list'], { outFile: listStatic });
  const listHeadless = path.join(OUT_DIR, 'collect-headless-list.txt');
  summary.commands['node scripts/collect.js --headless --list'] = runNode(['scripts/collect.js', '--headless', '--list'], { outFile: listHeadless });
  // 只认形如 `<id>  <region>  <显示名>` 的行，且 id 必须是 snake_case —— 末尾那句
  // 「（加 --headless 可看到无头浏览器来源）」中文提示里也有空格，宽松正则会把它当 id。
  const parseIds = file => fs.readFileSync(file, 'utf8').split('\n')
    .map(line => line.trim())
    .filter(line => /^[a-z0-9_]+\s+\S+\s+\S+$/.test(line))
    .map(line => line.split(/\s+/)[0]);
  summary.readings.collectorsStatic = parseIds(listStatic);
  summary.readings.collectorsHeadless = parseIds(listHeadless);

  /* ---- 数据文件读数 ---- */
  const health = readJson('scripts/data/source-health.json');
  fs.writeFileSync(path.join(OUT_DIR, 'source-health.json'), `${JSON.stringify(health, null, 2)}\n`, 'utf8');
  summary.readings.sourceHealth = {
    generatedAt: health.generatedAt,
    rows: health.sources.length,
    byStatus: health.sources.reduce((acc, s) => { acc[s.status] = (acc[s.status] || 0) + 1; return acc; }, {}),
    failing: health.sources.filter(s => s.status !== 'healthy')
      .map(s => ({ source: s.source, status: s.status, consecutiveFailures: s.consecutiveFailures, lastError: s.lastError }))
  };

  const publishedModels = readJson('models.json');
  const registrySource = readJson('scripts/data/models.json');
  const registryKeys = Object.keys(registrySource).filter(k => !k.startsWith('_'));
  summary.readings.registry = {
    publishedModels: publishedModels.models.length,
    sourceEntries: registryKeys.length,
    releasedAtKnownSource: registryKeys.filter(k => registrySource[k].releasedAt).length,
    releasedAtKnownPublished: publishedModels.models.filter(m => m.releasedAt).length,
    withReleaseEvidence: registryKeys.filter(k => (registrySource[k].releaseEvidence || []).length > 0).length,
    catalogStatus: publishedModels.models.reduce((acc, m) => { acc[m.catalogStatus] = (acc[m.catalogStatus] || 0) + 1; return acc; }, {}),
    modelRole: registryKeys.reduce((acc, k) => { const r = registrySource[k].modelRole; acc[r] = (acc[r] || 0) + 1; return acc; }, {}),
    developers: registryKeys.reduce((acc, k) => { const d = registrySource[k].developer; acc[d] = (acc[d] || 0) + 1; return acc; }, {})
  };

  const targets = readJson('scripts/data/coverage-targets.json');
  const providers = readJson('scripts/data/providers.json');
  summary.readings.coverageTargets = {
    schemaVersion: targets.schemaVersion,
    reviewedAt: targets.reviewedAt,
    targetRows: targets.targets.length,
    providerIdentities: Object.keys(providers).filter(k => !k.startsWith('_')).length,
    tier: targets.targets.reduce((acc, t) => { acc[t.tier] = (acc[t.tier] || 0) + 1; return acc; }, {}),
    role: targets.targets.reduce((acc, t) => { acc[t.role] = (acc[t.role] || 0) + 1; return acc; }, {}),
    ruledDimensions: targets.targets.reduce((n, t) => n + (t.rulings || []).length, 0)
  };

  const deals = readJson('deals.json');
  const plans = readJson('plans.json');
  const apiPlans = readJson('api-plans.json');
  const links = readJson('scripts/data/model-registry-links.json');
  summary.readings.data = {
    deals: { rows: deals.deals.length, count: deals.count, updatedAt: deals.updatedAt, byType: deals.deals.reduce((a, d) => { a[d.type] = (a[d.type] || 0) + 1; return a; }, {}) },
    plans: { rows: plans.plans.length, updatedAt: plans.updatedAt },
    apiPlans: { rows: apiPlans.plans.length, updatedAt: apiPlans.updatedAt },
    registryLinks: { rows: (links.links || []).length, schemaVersion: links.schemaVersion }
  };

  /* ---- 门禁与 CI 口径 ---- */
  summary.readings.gate = {
    actionSteps: countGateSteps(),
    expectChecks: expectChecks(),
    workflows: fs.readdirSync(path.join(CWD, '.github/workflows')).sort()
  };

  /* ---- 报告里的派生读数（从文本里抓，作为独立留痕） ---- */
  const text = fs.readFileSync(pureText, 'utf8');
  const grab = re => { const m = text.match(re); return m ? m[1].trim() : null; };
  summary.readings.reportDerived = {
    dimensionCensus: ['Deals 优惠（deals）', 'Coding 套餐（coding）', 'API 计费（api）', '模型身份（models）']
      .map(label => { const m = text.match(new RegExp(label.replace(/[()（）]/g, c => `\\${c}`) + '：(.+)')); return m ? `${label}：${m[1].trim()}` : null; })
      .filter(Boolean),
    catalogStatusCensus: grab(/catalogStatus 普查\s+(\S.*)$/m),
    targetUniverse: grab(/Target 行数\s+(\d+)/),
    publicDatasets: null
  };

  const dataDocs = fs.readFileSync(path.join(CWD, 'scripts/lib/data-docs.js'), 'utf8');
  const pub = dataDocs.match(/const PUBLIC_DATASETS = \[([\s\S]*?)\n\];/);
  summary.readings.reportDerived.publicDatasets = pub ? (pub[1].match(/^\s{2}\{/gm) || []).length : null;

  const outFile = path.join(OUT_DIR, 'baseline.json');
  fs.writeFileSync(outFile, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify(summary, null, 2));
  console.log(`\n✅ baseline 已写出：${path.relative(CWD, outFile)}`);
  return 0;
}

process.exit(main());
