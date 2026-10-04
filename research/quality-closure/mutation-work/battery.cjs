#!/usr/bin/env node
/**
 * T20 变异电池跑手（18+1）。**共享树只读**：每个用例一份仓库外沙箱副本；
 * 改完 → 跑**固定门禁集合** → 逐文件恢复并复核 sha256 逐字节一致 → 记录。
 *
 * 用法：
 *   node research/quality-closure/mutation-work/battery.cjs [--gold=D:\qc-t20\gold] [--work=D:\qc-t20\cases]
 *        [--only=M01,M02] [--json=<path>]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { CASES } = require('./cases.cjs');

const argOf = (n, d) => { const a = process.argv.find(x => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
const ROOT = path.resolve(__dirname, '..', '..', '..');          // 共享 worktree（只读）
const WORKTREES = path.resolve(ROOT, '..');
const GOLD = path.resolve(argOf('gold', 'D:\\qc-t20\\gold'));
const WORK = path.resolve(argOf('work', 'D:\\qc-t20\\cases'));
const E2E_SRC = path.join(WORKTREES, 'qc-e2e');
const JSON_OUT = path.resolve(ROOT, argOf('json', 'research/quality-closure/mutation-work/logs/battery.json'));
const ONLY = argOf('only', '').split(',').filter(Boolean);
const GIT_BASH = 'C:\\Program Files\\Git\\bin\\bash.exe';

/* 固定门禁集合（每条用例都跑这一套；顺序有意：产物读取类在 build-local 之前） */
const COMMON_GATES = [
  ['validate-strict', 'node scripts/validate.js --strict', {}],
  ['check-ci-consistency', 'node scripts/tools/check-ci-consistency.js --expect-checks=36', {}],
  ['check-reproducible', 'node scripts/tools/check-reproducible.js', {}],
  ['check-plans-reproducible', 'node scripts/tools/check-plans-reproducible.js', {}],
  ['check-api-plans-reproducible', 'node scripts/tools/check-api-plans-reproducible.js', {}],
  ['check-models-reproducible', 'node scripts/tools/check-models-reproducible.js', {}],
  ['rebuild-api-plans（判据入口：拒绝写盘即判据红）', 'node scripts/tools/rebuild-api-plans.js', {}],
  ['rebuild-plans（判据入口：拒绝写盘即判据红）', 'node scripts/tools/rebuild-plans.js', {}],
  ['rebuild-models（判据入口：拒绝写盘即判据红）', 'node scripts/tools/rebuild-models.js', {}],
  ['check-api-plan-history', 'node scripts/tools/check-api-plan-history.js', {}],
  ['check-plan-history', 'node scripts/tools/check-plan-history.js', {}],
  ['history-verify', 'node scripts/tools/history-verify.js', {}],
  ['models-selftest', 'node scripts/tools/models-selftest.js', {}],
  ['models-page-selftest', 'node scripts/tools/models-page-selftest.js --dir=dist', {}],
  ['api-plans-selftest', 'node scripts/tools/api-plans-selftest.js', {}],
  ['plans-selftest', 'node scripts/tools/plans-selftest.js', {}],
  ['ai-selftest', 'node scripts/tools/ai-selftest.js', {}],
  ['data-docs-selftest', 'node scripts/tools/data-docs-selftest.js --dir=dist', {}],
  ['feeds-selftest', 'node scripts/tools/feeds-selftest.js', {}],
  ['health-selftest', 'node scripts/tools/health-selftest.js', {}],
  ['provenance-selftest', 'node scripts/tools/provenance-selftest.js', {}],
  ['archive-selftest', 'node scripts/tools/archive-selftest.js --dir=dist', {}],
  ['seo-verify', 'node scripts/tools/seo-verify.js --dir=dist', {}],
  ['coverage-report', 'node scripts/tools/coverage-report.js', {}],
  ['deal-plan-links-selftest', 'node scripts/tools/deal-plan-links-selftest.js', {}],
  ['audience-selftest', 'node scripts/tools/audience-selftest.js', {}],
  ['MY-join-audit', 'node research/quality-closure/verify-work/join-audit.cjs --dist=dist', {}],
  ['MY-mutation-matrix? (不自跑)', '', { skip: true }],
  ['build-local', 'node scripts/tools/build-local.js', {}]
].filter(([, cmd, opt]) => !opt.skip && cmd);
const BROWSER_GATE = ['MY-browser-matrix', 'node research/quality-closure/verify-work/browser-matrix.cjs --dist=dist', {}];

const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const rel = (root, file) => path.relative(root, file).replace(/\\/g, '/');

function copyDir(src, dest, opts = {}) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (e.name.startsWith('.qc-') || e.name.startsWith('dist.qc-') || e.name === '.git' && opts.skipGit) continue;
    const s = path.join(src, e.name), d = path.join(dest, e.name);
    let st;
    try { st = fs.lstatSync(s); } catch { continue; }
    if (st.isSymbolicLink()) {
      // 目录联接点（如 qc-e2e/node_modules）：在目标重建联接，保持可用
      try { fs.symlinkSync(fs.readlinkSync(s), d, 'junction'); } catch { /* 已存在或平台不支持 */ }
      continue;
    }
    if (st.isDirectory()) {
      if (opts.dirs && !opts.dirs.includes(e.name) && !opts.dirs.some(x => e.name.startsWith(x))) continue;
      copyDir(s, d, opts);
    } else {
      try { fs.copyFileSync(s, d); } catch (err) { if (err.code !== 'EPERM') throw err; }
    }
  }
}
/** gold 只需要这些顶层目录 + 根文件（避免把别的任务的 .qc-* 沙箱拖进来） */
const GOLD_DIRS = ['scripts', 'node_modules', 'dist', 'assets', 'docs', '.github', 'research'];
const run = (cmd, cwd) => {
  const res = spawnSync(cmd, { cwd, shell: true, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, env: { ...process.env, DSH_BASH: GIT_BASH } });
  const out = `${res.stdout || ''}\n${res.stderr || ''}`;
  const lines = out.split('\n').map(l => l.trim()).filter(Boolean);
  const key = lines.filter(l => /^✗|^❌|❌ |✗ |已经映射到|重复出现|既没有 registry 映射|没有任何模型|不一致|不存在|不许|拒绝写盘|缺.*产物|必须非 0|身份|未认领|违反|漂移|溢出|console error|失败请求|行数|不是.*预期/.test(l)).slice(0, 3);
  return { exitCode: res.status, key };
};

/* ---------- gold 准备（首次） ---------- */
if (!fs.existsSync(GOLD)) {
  console.log(`准备 gold 快照：${GOLD}（来自共享树：${GOLD_DIRS.join(' + ')} + 根文件）`);
  for (const d of GOLD_DIRS) {
    const s = path.join(ROOT, d);
    if (!fs.existsSync(s)) continue;
    if (d === 'research') {
      // research/ 整棵树都要（coverage-report 需要 research/v3.0-source-candidates.*；verify-site 基线在 _raw）
      copyDir(s, path.join(GOLD, 'research'), {});
    } else {
      copyDir(s, path.join(GOLD, d), {});
    }
  }
  for (const f of fs.readdirSync(ROOT, { withFileTypes: true })) {
    if (!f.isFile()) continue;
    if (f.name.endsWith('.log')) continue;
    fs.copyFileSync(path.join(ROOT, f.name), path.join(GOLD, f.name));
  }
}
/* gold 完整性基线 */
const goldManifest = {};
for (const f of ['deals.json', 'plans.json', 'api-plans.json', 'models.json', 'model-registry-links.json',
  'scripts/data/models.json', 'scripts/data/model-registry-links.json', 'scripts/data/curated_plans.json',
  'scripts/data/curated_api_plans.json', 'scripts/data/source-health.json',
  '.github/workflows/verify.yml', '.github/actions/gate/action.yml']) {
  goldManifest[f] = sha256(path.join(GOLD, f));
}
const sharedManifest = {};
for (const f of Object.keys(goldManifest)) {
  const p = path.join(ROOT, f);
  sharedManifest[f] = fs.existsSync(p) ? sha256(p) : 'MISSING';
}

/* ---------- e2e 非空 workspace（M03/M04 用） ---------- */
const E2E = path.join(WORK, '_e2e');
if (!fs.existsSync(E2E) && fs.existsSync(E2E_SRC)) {
  console.log(`准备非空历史 workspace：${E2E}（来自 .worktrees/qc-e2e）`);
  copyDir(E2E_SRC, E2E, {});
}

fs.mkdirSync(WORK, { recursive: true });
const results = [];
for (const c of CASES) {
  if (ONLY.length && !ONLY.some(x => c.id.startsWith(x))) continue;
  const dir = path.join(WORK, c.id);
  fs.rmSync(dir, { recursive: true, force: true });
  const src = c.workspace === 'e2e' ? E2E : GOLD;
  if (!fs.existsSync(src)) { console.log(`SKIP ${c.id}：缺少工作区 ${src}`); continue; }
  copyDir(src, dir, {});
  const t0 = Date.now();
  console.log(`\n=== ${c.id} · ${c.title}`);
  let changed = [];
  try { changed = c.mutator ? (c.mutator.call(c, dir) || []) : []; }
  catch (e) { console.log(`  变异失败：${e.message}`); results.push({ id: c.id, title: c.title, error: String(e.message) }); continue; }

  // 变异前后 hash + 备份（文件级，供恢复）
  const fileRecords = changed.map(f => {
    const r = rel(dir, f);
    const beforeSrc = path.join(GOLD, r);
    return {
      file: r,
      shaBefore: fs.existsSync(beforeSrc) ? sha256(beforeSrc) : null,
      shaAfter: fs.existsSync(f) ? sha256(f) : 'MISSING'
    };
  });

  const gates = [];
  // setup 命令（仅 state 类用例）：先备夹具/构建，再跑公共门禁
  const setupRuns = [];
  if (c.setup) for (const s of c.setup(dir, GOLD)) {
    const r = run(s.cmd, s.cwd || dir);
    setupRuns.push({ id: s.id, command: s.cmd, exitCode: r.exitCode, key: r.key });
  }
  for (const [name, cmd] of [...COMMON_GATES, ...(c.browser ? [BROWSER_GATE] : [])]) {
    const r = run(cmd, dir);
    gates.push({ name, command: cmd, exitCode: r.exitCode, key: r.key });
  }
  const extras = [];
  const preHashes = {};
  for (const x of (c.extra || [])) if (x.kind === 'hash-check') preHashes[x.file] = sha256(path.join(dir, x.file));
  if (c.commands) for (const x of c.commands(dir)) {
    const r = run(x.cmd, dir);
    const ok = x.expect === 'nonzero' ? r.exitCode !== 0 : r.exitCode === 0;
    extras.push({ id: x.id, command: x.cmd, expect: x.expect, exitCode: r.exitCode, ok, key: r.key });
  }
  if (c.extra) for (const x of c.extra) {
    if (x.kind === 'hash-check') {
      const after = sha256(path.join(dir, x.file));
      const before = preHashes[x.file];
      extras.push({ id: x.id, kind: 'hash-check', file: x.file, shaBefore: before, shaAfter: after, ok: before === after, expect: 'unchanged' });
    }
  }

  // 恢复：把变异过的文件用 gold 覆盖回去，复核 sha256 逐字节一致（禁 git checkout）
  const restore = fileRecords.map(r => {
    const goldFile = path.join(GOLD, r.file);
    const dest = path.join(dir, r.file);
    if (fs.existsSync(goldFile)) {
      fs.copyFileSync(goldFile, dest);
      return { file: r.file, shaBefore: r.shaBefore, restoredSha: sha256(dest), byteExact: sha256(dest) === r.shaBefore };
    }
    if (fs.existsSync(dest)) fs.rmSync(dest);
    return { file: r.file, shaBefore: null, restoredSha: 'REMOVED', byteExact: true };
  });

  const reds = gates.filter(g => g.exitCode !== 0).map(g => g.name);
  const failedExtras = extras.filter(x => x.ok === false).map(x => x.id);
  const failedSetup = setupRuns.filter(s => s.exitCode !== 0).map(s => s.id);
  const extraCaught = extras.some(x => x.expect === 'nonzero' && x.ok === true);
  let verdict;
  if (c.requirementGates) {
    // 「要求面」模式（M03/M04）：只按合同写明的那几条必须绿的门禁判定；
    // 其余门禁的红如实记入 gates（作为副作用观察），不影响要求面结论。
    const missing = c.requirementGates.filter(n => !gates.some(g => g.name === n));
    const failedReq = c.requirementGates.filter(n => gates.some(g => g.name === n && g.exitCode !== 0));
    verdict = (!missing.length && !failedReq.length && failedSetup.length === 0) ? 'PASS-requirement' : 'REQUIREMENT-FAIL';
    if (missing.length) failedExtras.push(`要求面门禁未跑：${missing.join(',')}`);
  } else {
    verdict = c.expect === 'RED'
      ? (reds.length > 0 || extraCaught ? 'CAUGHT' : 'NOT_CAUGHT')
      : (reds.length === 0 && failedExtras.length === 0 && failedSetup.length === 0 ? 'GREEN-as-expected' : 'REGRESSION');
  }
  results.push({
    id: c.id, title: c.title, lane: c.lane, kind: c.kind, expect: c.expect, detectors: c.detectors,
    ms: Date.now() - t0, files: fileRecords, setupRuns, gates, extras, restore, reds, failedExtras, failedSetup, verdict
  });
  if (setupRuns.length) console.log(`  setup：${setupRuns.map(s => `${s.id}=${s.exitCode}`).join(' · ')}`);
  console.log(`  红门禁：${reds.join(' / ') || '(无)'}`);
  console.log(`  额外命令：${extras.map(x => `${x.id}=${x.exitCode}${x.ok === false ? '(不符!)' : ''}`).join(' · ') || '(无)'}`);
  console.log(`  恢复：${restore.every(r => r.byteExact) ? 'BYTE-EXACT' : '不一致!'} · 判定 ${verdict}`);
}

/* gold + 共享树复核 */
const goldAfter = {};
for (const f of Object.keys(goldManifest)) goldAfter[f] = sha256(path.join(GOLD, f));
const sharedAfter = {};
for (const f of Object.keys(sharedManifest)) {
  const p = path.join(ROOT, f);
  sharedAfter[f] = fs.existsSync(p) ? sha256(p) : 'MISSING';
}
const goldIntact = Object.keys(goldManifest).every(f => goldManifest[f] === goldAfter[f]);
const sharedIntact = Object.keys(sharedManifest).every(f => sharedManifest[f] === sharedAfter[f]);

fs.mkdirSync(path.dirname(JSON_OUT), { recursive: true });
fs.writeFileSync(JSON_OUT, JSON.stringify({
  gold: GOLD, work: WORK, gitBash: GIT_BASH, commonGates: COMMON_GATES.map(g => g[0]),
  browserGate: BROWSER_GATE[0], goldManifest, goldAfter, goldIntact, sharedManifest, sharedAfter, sharedIntact, results
}, null, 2));

console.log('\n===== 电池汇总 =====');
for (const r of results) {
  if (r.error) { console.log(`${r.id.padEnd(46)} ERROR ${r.error}`); continue; }
  console.log(`${r.id.padEnd(46)} ${r.verdict.padEnd(18)} 红门禁 ${r.reds.length}/${r.gates.length}${r.reds.length ? ' :: ' + r.reds.slice(0, 3).join(',') : ''}`);
}
const notCaught = results.filter(r => r.verdict === 'NOT_CAUGHT' || r.verdict === 'REGRESSION');
console.log(`\nNOT_CAUGHT / REGRESSION：${notCaught.length ? notCaught.map(r => r.id).join(', ') : '(无)'}`);
console.log(`gold 逐字节未变：${goldIntact} · 共享树逐字节未变：${sharedIntact}`);
process.exit(notCaught.length ? 1 : 0);
