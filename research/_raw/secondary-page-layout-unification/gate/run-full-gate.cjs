#!/usr/bin/env node
/**
 * secondary-page-layout-unification · Full Gate 本地串行执行器（t3 证据）
 *
 * 为什么写它，而不是手敲一串命令：
 *   ① **步骤清单必须来自仓库当前的 `.github/actions/gate/action.yml`**，不能凭记忆抄一份
 *      （题面明确要求"不要写死过去的 49 steps / 735 checks，以仓库当前实际值为准"）。
 *      本脚本现场解析 action.yml，跑的就是 CI 会跑的那一串。
 *   ② 本机与 CI 的差别只有三处，且都显式写在这里（跳过 + 理由），不静默：
 *      · `Install dependencies`（npm ci）—— 依赖已按 lockfile 装好；
 *      · `Prepare browser for the real-browser gate` / `Browser availability decision` /
 *        `Gate conclusion` —— 这三步是 **CI 专用 shell**（探测 runner 上的浏览器、把结论写
 *        GitHub Step Summary）。本机浏览器是 Edge，直接由 DSH_EDGE 给出；而"浏览器不可用
 *        必须判红"这条判据本身由 `check-ci-consistency.js` 的 (10) 真实执行那段 shell 守着。
 *   ③ **串行**：本轮的并发纪律是"任何时刻只有一个重命令在跑"，CI 的 gate 本身就是串行的。
 *
 * 【增量补跑】第 47/48 步（真浏览器）依赖 `scripts/tools/verify-site.js`。若那个文件在本次
 * 执行之后被修改（例如复审判 needs_revision 后的修复），**这两步的读数必须重跑**，而静态步骤
 * 不必跟着重跑。因此：
 *   · `--only=47,48`（序号）或 `--only=acceptance`（名字子串）只跑指定步骤；
 *   · 结果按**步骤序号**合并进已有的 summary.json（没跑的步骤保留上一次的读数）；
 *   · 每次运行都记下 `scripts/tools/verify-site.js` 的 sha256 ⇒ summary 里能一眼看出
 *     「哪几步是对哪一版跑出来的」，不会把修复前的读数当成最终证据。
 *
 * 输出：
 *   · 每个步骤一份 `<out>/NN-<slug>.txt`（stdout+stderr 原始日志，直接作为交付证据）；
 *   · `<out>/summary.json`（总步骤 / pass / fail / skip / exit code / 每次运行的 identity）与 stdout 上的一张表。
 *
 * 用法：
 *   node research/_raw/secondary-page-layout-unification/gate/run-full-gate.cjs [--fail-fast]
 *   node research/_raw/secondary-page-layout-unification/gate/run-full-gate.cjs --only=47,48
 *   node research/_raw/secondary-page-layout-unification/gate/run-full-gate.cjs --dry-run
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..', '..', '..');   // → worktree 根
const arg = name => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const OUT = path.resolve(arg('out') || path.join(ROOT, 'research', '_raw', 'secondary-page-layout-unification', 'gate', 'steps'));
const FAIL_FAST = process.argv.includes('--fail-fast');
const ONLY = arg('only');
/** 推迟真浏览器两步（它们依赖 verify-site.js；该文件若在修复中被改动，读数必须重跑） */
const SKIP_BROWSER = process.argv.includes('--skip-browser');
const EDGE = process.env.DSH_EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

/** CI 专用 / 已完成的步骤：跳过并写明理由（绝不静默跳过） */
const SKIP = new Map([
  ['Install dependencies', 'npm ci 已按 lockfile 装好（本机 worktree 内 node_modules 已就位；本步骤是 CI 的依赖准备，不参与任何判定）'],
  ['Prepare browser for the real-browser gate', 'CI 专用：探测 runner 上的浏览器可执行文件并写 GITHUB_OUTPUT/Step Summary；本机浏览器由 DSH_EDGE 指定的 Edge 提供'],
  ['Browser availability decision (never silent)', 'CI 专用：把「浏览器不可用」按规则判红并写 Step Summary；该 shell 本身由 check-ci-consistency.js 的 (10) 真实执行守着（本机没有 GITHUB_OUTPUT 语义）'],
  ['Gate conclusion', 'CI 专用：只把结论写 GitHub Step Summary，不参与判定']
]);

/** 需要浏览器可执行文件的步骤（CI 里由 Prepare browser 的输出提供 DSH_EDGE） */
const BROWSER_STEPS = new Set([
  'Real-browser acceptance (verify-site.js)',
  'Regression verify (baseline compare)'
]);

/** 极简 action.yml 读取：只认 `    - name:` 分步 + 步骤内的 `run:`（行内或块标量）。 */
function parseSteps(text) {
  const lines = text.split('\n');
  const steps = [];
  let current = null;
  let blockIndent = null;
  for (const line of lines) {
    const nameHit = /^ {4}- name: (.+)$/.exec(line);
    if (nameHit) {
      if (current) steps.push(current);
      current = { name: nameHit[1].trim(), run: null, if: null, block: [] };
      blockIndent = null;
      continue;
    }
    if (!current) continue;
    if (blockIndent !== null) {
      const indent = line.match(/^ */)[0].length;
      if (line.trim() === '' || indent >= blockIndent) { current.block.push(line.slice(blockIndent)); continue; }
      blockIndent = null;
    }
    if (/^\s+run: \|\s*$/.test(line)) { blockIndent = line.match(/^ */)[0].length + 2; continue; }
    const runHit = /^\s+run: (.+)$/.exec(line);
    if (runHit) { current.run = runHit[1].trim(); continue; }
    const ifHit = /^\s+if: (.+)$/.exec(line);
    if (ifHit) current.if = ifHit[1].trim();
  }
  if (current) steps.push(current);
  return steps;
}

/** `node a/b.js --x=1` → [ 'a/b.js', '--x=1' ]；不是 node 命令就返回 null（调用方必须显式处置） */
function nodeArgsOf(command) {
  const parts = String(command || '').trim().split(/\s+/);
  if (parts[0] !== 'node' || !parts[1]) return null;
  return parts.slice(1);
}

const ymlPath = path.join(ROOT, '.github', 'actions', 'gate', 'action.yml');
const steps = parseSteps(fs.readFileSync(ymlPath, 'utf8'));
fs.mkdirSync(OUT, { recursive: true });
const summaryFile = path.join(OUT, 'summary.json');
const verifySiteRel = 'scripts/tools/verify-site.js';
const verifySitePath = path.join(ROOT, verifySiteRel);
const sha256Of = file => (fs.existsSync(file) ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') : null);

/** `--only=` 选择器：序号（1-based）或名字子串（逗号分隔，任一命中即选中） */
function selected(index, name) {
  if (!ONLY) return true;
  const tokens = ONLY.split(',').map(token => token.trim()).filter(Boolean);
  return tokens.some(token => (/^\d+$/.test(token) ? Number(token) === index : name.includes(token)));
}

const identity = {
  at: new Date().toISOString(),
  node: process.version,
  platform: process.platform,
  gateAction: path.relative(ROOT, ymlPath).replace(/\\/g, '/'),
  gateActionSha256: sha256Of(ymlPath),
  verifySite: verifySiteRel,
  verifySiteSha256: sha256Of(verifySitePath),
  dshEdge: EDGE,
  stepsInAction: steps.length,
  only: ONLY || null
};
console.log(`Gate action: ${identity.gateAction}（${steps.length} 步 · sha256 ${identity.gateActionSha256.slice(0, 16)}…）`);
console.log(`浏览器: ${EDGE}`);
console.log(`verify-site.js sha256: ${String(identity.verifySiteSha256).slice(0, 16)}…（第 47/48 步的读数只对**这一版**有效）`);
console.log(`日志目录: ${OUT}${ONLY ? ` · 本次只跑：${ONLY}` : ''}\n`);

/** 已有的 summary（增量补跑时按序号合并） */
let previous = null;
if (fs.existsSync(summaryFile)) {
  try { previous = JSON.parse(fs.readFileSync(summaryFile, 'utf8')); } catch { previous = null; }
}
const previousByIndex = new Map(((previous && previous.results) || []).map(row => [row.index, row]));

const results = [];
let index = 0;

if (process.argv.includes('--dry-run')) {
  for (const step of steps) {
    index++;
    const prefix = String(index).padStart(2, '0');
    if (SKIP.has(step.name)) console.log(`${prefix}. ⊘ ${step.name}  ← 跳过：${SKIP.get(step.name)}`);
    else if (!nodeArgsOf(step.run)) console.log(`${prefix}. ⊘ ${step.name}  ← 跳过：CI 专用 shell`);
    else if (!selected(index, step.name) || (SKIP_BROWSER && BROWSER_STEPS.has(step.name) && !ONLY)) console.log(`${prefix}. · ${step.name}  ← 本次不跑（--only 未选中${SKIP_BROWSER && BROWSER_STEPS.has(step.name) ? '；--skip-browser 推迟' : ''}）`);
    else console.log(`${prefix}. ▶ ${step.name}  ← $ ${step.run}${BROWSER_STEPS.has(step.name) ? '  [DSH_EDGE]' : ''}`);
  }
  const willRun = steps.filter((step, i) => !SKIP.has(step.name) && nodeArgsOf(step.run) && selected(i + 1, step.name)
    && !(SKIP_BROWSER && !ONLY && BROWSER_STEPS.has(step.name))).length;
  console.log(`\n本次将执行 ${willRun} 步 / 共 ${steps.length} 步（其余为 CI 专用、已完成的准备工作或被 --only / --skip-browser 排除）`);
  process.exit(0);
}

for (const step of steps) {
  index++;
  const slug = step.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
  const prefix = String(index).padStart(2, '0');

  if (SKIP.has(step.name)) {
    results.push({ index, name: step.name, status: 'skipped', reason: SKIP.get(step.name), runAt: identity.at });
    console.log(`${prefix}. ⊘ ${step.name}\n     跳过：${SKIP.get(step.name)}`);
    continue;
  }

  const args = nodeArgsOf(step.run);
  if (!args) {
    results.push({ index, name: step.name, status: 'skipped', reason: '不是单行 node 命令（CI 专用 shell）', runAt: identity.at });
    console.log(`${prefix}. ⊘ ${step.name}\n     跳过：CI 专用 shell（本地无对应语义）`);
    continue;
  }

  const deferredBrowser = SKIP_BROWSER && BROWSER_STEPS.has(step.name) && !ONLY;
  if (!selected(index, step.name) || deferredBrowser) {
    const prior = previousByIndex.get(index);
    results.push(prior
      ? { ...prior, carriedOver: true }
      : {
        index, name: step.name, run: step.run, status: 'skipped',
        reason: deferredBrowser
          ? '按本轮执行顺序**推迟**：这两步吃 verify-site.js，而该文件在复审修复后读数会失效 —— 用 --only=47,48 补跑'
          : '本次 --only 未选中，且此前没有跑过',
        runAt: identity.at
      });
    console.log(`${prefix}. · ${step.name}  （本次未跑${prior ? `；沿用上一次读数（${prior.runAt} · exit=${prior.exitCode}）` : deferredBrowser ? '：推迟到 verify-site.js 定稿后补跑' : '，此前也没有读数'}）`);
    continue;
  }

  const logPath = path.join(OUT, `${prefix}-${slug}.txt`);
  const fd = fs.openSync(logPath, 'w');
  fs.writeSync(fd, `# ${step.name}\n# $ ${step.run}\n# runAt ${identity.at} · verify-site.js sha256 ${identity.verifySiteSha256}\n\n`);
  const env = { ...process.env };
  if (BROWSER_STEPS.has(step.name)) env.DSH_EDGE = EDGE;

  const started = Date.now();
  const outcome = spawnSync(process.execPath, args, {
    cwd: ROOT,
    env,
    // 直接给文件描述符：不经过管道（受限沙箱下管道会 EPERM，这里也从根上不需要 shell 拼串）
    stdio: ['ignore', fd, fd]
  });
  fs.closeSync(fd);
  const ms = Date.now() - started;
  const code = outcome.status === null ? -1 : outcome.status;
  const tail = fs.readFileSync(logPath, 'utf8').trimEnd().split('\n').slice(-3).join(' ⏎ ');

  results.push({
    index, name: step.name, run: step.run, status: code === 0 ? 'passed' : 'failed', exitCode: code, ms,
    phase: BROWSER_STEPS.has(step.name) ? 'browser' : 'static',
    verifySiteSha256: identity.verifySiteSha256,
    runAt: identity.at,
    log: path.relative(ROOT, logPath).replace(/\\/g, '/')
  });
  console.log(`${prefix}. ${code === 0 ? '✓' : '✗'} ${step.name}  (${(ms / 1000).toFixed(1)}s, exit=${code})`);
  if (code !== 0) {
    console.log(`     ${tail}`);
    if (FAIL_FAST) break;
  }
}

/** 合并：本次跑过的覆盖旧读数，没跑的沿用旧读数（并标注 carriedOver） */
const merged = new Map(previousByIndex);
for (const row of results) merged.set(row.index, row);
const mergedResults = [...merged.values()].sort((a, b) => a.index - b.index);

const passed = mergedResults.filter(row => row.status === 'passed').length;
const failedRows = mergedResults.filter(row => row.status === 'failed');
const skipped = mergedResults.filter(row => row.status === 'skipped').length;
const notRunYet = mergedResults.filter(row => row.status === 'skipped' && /本次 --only 未选中|推迟/.test(row.reason || '')).length;
const thisRun = results.filter(row => !row.carriedOver);
const runs = [...((previous && previous.runs) || []), {
  ...identity,
  ran: thisRun.filter(row => row.status === 'passed' || row.status === 'failed').map(row => row.index),
  passed: thisRun.filter(row => row.status === 'passed').length,
  failed: thisRun.filter(row => row.status === 'failed').map(row => row.index)
}];

const summary = {
  identity,
  stepsInAction: steps.length,
  executed: passed + failedRows.length,
  passed,
  failed: failedRows.length,
  skipped,
  skippedNotRunYet: notRunYet,
  exitCode: failedRows.length ? 1 : 0,
  browserSteps: [...BROWSER_STEPS],
  verifySiteSha256: identity.verifySiteSha256,
  runs,
  results: mergedResults
};
fs.writeFileSync(summaryFile, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

console.log(`\n${failedRows.length ? '❌' : '✅'} Full Gate：总步骤 ${steps.length} 步 · 执行 ${passed + failedRows.length} 步 · 通过 ${passed} · 失败 ${failedRows.length} · 跳过 ${skipped}（其中"本次未跑"${notRunYet} 步）· exit=${summary.exitCode}`);
if (failedRows.length) failedRows.forEach(row => console.log(`   ✗ ${row.name} → ${row.log}`));
console.log(`summary.json: ${path.relative(ROOT, summaryFile).replace(/\\/g, '/')}`);
process.exit(summary.exitCode);
