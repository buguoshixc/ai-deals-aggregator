#!/usr/bin/env node
/**
 * leaf-detail-layout-v1 · Full Gate 本地串行执行器（captain 证据）
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
 * 输出：
 *   · 每个步骤一份 `<out>/NN-<slug>.txt`（stdout+stderr 原始日志，直接作为交付证据）；
 *   · `<out>/summary.json`（步骤名 / 命令 / 退出码 / 耗时）与 stdout 上的一张表。
 *
 * 用法：
 *   node research/_raw/leaf-detail-layout-v1/gate/run-full-gate.cjs \
 *        --out=research/_raw/leaf-detail-layout-v1/gate/steps [--fail-fast]
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..', '..', '..');   // → worktree 根
const arg = name => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const OUT = path.resolve(arg('out') || path.join(ROOT, 'research', '_raw', 'leaf-detail-layout-v1', 'gate', 'steps'));
const FAIL_FAST = process.argv.includes('--fail-fast');
const EDGE = process.env.DSH_EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

/** CI 专用 / 已完成的步骤：跳过并写明理由（绝不静默跳过） */
const SKIP = new Map([
  ['Install dependencies', 'npm ci 已按 lockfile 装好（本机 worktree 内已执行）'],
  ['Prepare browser for the real-browser gate', 'CI 专用：探测 runner 上的浏览器；本机用 DSH_EDGE 指定的 Edge'],
  ['Browser availability decision (never silent)', 'CI 专用：把"浏览器不可用"判红并写 Step Summary；该 shell 本身由 check-ci-consistency (10) 真实执行'],
  ['Gate conclusion', 'CI 专用：只写 GitHub Step Summary，不参与判定']
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
    // 块标量：run: |  后面的缩进行都属于它
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

const identity = {
  at: new Date().toISOString(),
  node: process.version,
  platform: process.platform,
  gateAction: path.relative(ROOT, ymlPath).replace(/\\/g, '/'),
  gateActionSha256: require('crypto').createHash('sha256').update(fs.readFileSync(ymlPath)).digest('hex'),
  dshEdge: EDGE,
  stepsInAction: steps.length
};
console.log(`Gate action: ${identity.gateAction}（${steps.length} 步 · sha256 ${identity.gateActionSha256.slice(0, 16)}…）`);
console.log(`浏览器: ${EDGE}`);
console.log(`日志目录: ${OUT}\n`);

const results = [];
let index = 0;

/** `--dry-run`：只打印"会跑什么、跳过什么"，不执行任何步骤（用来核对解析结果） */
if (process.argv.includes('--dry-run')) {
  for (const step of steps) {
    index++;
    const prefix = String(index).padStart(2, '0');
    if (SKIP.has(step.name)) console.log(`${prefix}. ⊘ ${step.name}  ← 跳过：${SKIP.get(step.name)}`);
    else if (!nodeArgsOf(step.run)) console.log(`${prefix}. ⊘ ${step.name}  ← 跳过：CI 专用 shell`);
    else console.log(`${prefix}. ▶ ${step.name}  ← $ ${step.run}${BROWSER_STEPS.has(step.name) ? '  [DSH_EDGE]' : ''}`);
  }
  const willRun = steps.filter(s => !SKIP.has(s.name) && nodeArgsOf(s.run)).length;
  console.log(`\n将执行 ${willRun} 步 / 共 ${steps.length} 步（其余为 CI 专用或已完成的准备工作）`);
  process.exit(0);
}

for (const step of steps) {
  index++;
  const slug = step.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
  const prefix = String(index).padStart(2, '0');

  if (SKIP.has(step.name)) {
    results.push({ index, name: step.name, status: 'skipped', reason: SKIP.get(step.name) });
    console.log(`${prefix}. ⊘ ${step.name}\n     跳过：${SKIP.get(step.name)}`);
    continue;
  }

  const args = nodeArgsOf(step.run);
  if (!args) {
    results.push({ index, name: step.name, status: 'skipped', reason: `不是单行 node 命令（CI 专用 shell）` });
    console.log(`${prefix}. ⊘ ${step.name}\n     跳过：CI 专用 shell（本地无对应语义）`);
    continue;
  }

  const logPath = path.join(OUT, `${prefix}-${slug}.txt`);
  const fd = fs.openSync(logPath, 'w');
  fs.writeSync(fd, `# ${step.name}\n# $ ${step.run}\n\n`);
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

  results.push({ index, name: step.name, run: step.run, status: code === 0 ? 'passed' : 'failed', exitCode: code, ms, log: path.relative(ROOT, logPath).replace(/\\/g, '/') });
  console.log(`${prefix}. ${code === 0 ? '✓' : '✗'} ${step.name}  (${(ms / 1000).toFixed(1)}s, exit=${code})`);
  if (code !== 0) {
    console.log(`     ${tail}`);
    if (FAIL_FAST) break;
  }
}

const passed = results.filter(r => r.status === 'passed').length;
const failed = results.filter(r => r.status === 'failed');
const skipped = results.filter(r => r.status === 'skipped').length;
const summary = { identity, executed: passed + failed.length, passed, failed: failed.length, skipped, results };
fs.writeFileSync(path.join(OUT, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

console.log(`\n${failed.length ? '❌' : '✅'} Full Gate：执行 ${passed + failed.length} 步，通过 ${passed}，失败 ${failed.length}，跳过 ${skipped}（CI 专用/已装依赖）`);
if (failed.length) failed.forEach(f => console.log(`   ✗ ${f.name} → ${f.log}`));
console.log(`summary.json: ${path.relative(ROOT, path.join(OUT, 'summary.json')).replace(/\\/g, '/')}`);
process.exit(failed.length ? 1 : 0);
