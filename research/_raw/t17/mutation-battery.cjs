#!/usr/bin/env node
/**
 * coverage-expansion-v1 / t17：**Mutation / Tooth Test 电池**（逐例真实变异 + 逐字节恢复）。
 *
 * ## 为什么要在**仓库外的沙箱副本**里变异
 *
 * 共享 worktree 正在被多人并发编辑。任何"就地改一个字节再改回来"的做法都会与并发编辑互相污染，
 * 而"改回来"这件事本身也**无法证明**（没人能保证中间那一刻没有别的写入）。
 * 所以本电池：
 *   1. 把仓库（**排除** `node_modules`/`.git`/`.worktrees`，node_modules 用 junction 指回共享树）
 *      复制到仓库外 `D:\t17-mutation\base`；
 *   2. `gold/` 保存**未被变异过**的原始副本，每个用例在 `cases/<id>/` 里从 gold 独立复制后的树上做；
 *   3. 变异 → 跑目标门禁 → **用 gold 覆盖回写** → 重算 sha256 与变异前**逐字节比对**；
 *   4. 全程共享树**只读**，并在电池结束后对它做 12 份关键文件的 sha256 对账（证明一个字节未动）。
 *
 * ## 判据
 *
 * 每条用例记录：`expected`（期望被哪一层抓住）、每道门禁的 `exitCode` + **断言原文**（截断）、
 * `verdict`（CAUGHT = 至少一道期望门禁非 0；NOT_CAUGHT = 全绿）、以及
 * `restore[].byteExact`（逐字节恢复是否成立）。
 * **对照组** `M00` 不修改任何文件 ⇒ 全部门禁必须 exit 0（否则"红"不可解释）。
 *
 * 用法：
 *   node research/_raw/t17/mutation-battery.cjs                # 跑全部用例
 *   node research/_raw/t17/mutation-battery.cjs --only=M01,M07 # 只跑指定用例
 *   node research/_raw/t17/mutation-battery.cjs --json         # 结果落盘 logs/battery.json 并打印路径
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');
const { CASES } = require('./mutation-cases.cjs');

const REPO = path.resolve(__dirname, '..', '..', '..'); // .worktrees/coverage-expansion-v1
const SANDBOX = process.env.T17_SANDBOX || 'D:\\t17-mutation';
const GOLD = path.join(SANDBOX, 'gold');
const CASES_DIR = path.join(SANDBOX, 'cases');
const LOGS = path.join(__dirname, 'logs');
const WORKERS = Number(process.env.T17_WORKERS || 6);

/** 共享树上必须"一个字节都没动"的关键文件（电池前后各算一次） */
const GUARDED = [
  'scripts/data/models.json',
  'scripts/data/model-registry-links.json',
  'scripts/data/model-registry-gaps.json',
  'scripts/data/providers.json',
  'scripts/data/coverage-targets.json',
  'scripts/data/api-plans.json',
  'scripts/data/plans.json',
  'scripts/data/curated_api_plans.json',
  'scripts/data/curated_plans.json',
  'scripts/lib/model-freshness.js',
  'models.json',
  'model-registry-links.json',
  'api-plans.json',
  'plans.json',
  'dist/models/index.html',
  'package.json'
];

const sha256 = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
const sha256OfFile = file => sha256(fs.readFileSync(file));
const nowStamp = () => new Date().toISOString();

function copyTree(from, to) {
  // 安全闸：目标路径绝不能是仓库本身或它的祖先（/MIR 会删掉目标里多出来的东西）
  const fromResolved = path.resolve(from).toLowerCase();
  const toResolved = path.resolve(to).toLowerCase();
  if (toResolved === fromResolved || fromResolved.startsWith(toResolved + path.sep)) {
    throw new Error(`拒绝对仓库自身/祖先做镜像复制：from=${fromResolved} to=${toResolved}`);
  }
  fs.mkdirSync(to, { recursive: true });
  const result = spawnSync('robocopy', [
    from, to,
    '/MIR', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', '/R:1', '/W:1',
    '/XD', 'node_modules', '.git', '.worktrees', '.agent-teams', 'research\\quality-closure',
    '/XF', '*.log'
  ], { encoding: 'utf8', maxBuffer: 1 << 28 });
  // robocopy：0–7 都是成功码（1 = 有文件被复制），≥8 才是错误
  if (result.status === null || result.status >= 8) {
    throw new Error(`robocopy 失败（status=${result.status}）：${String(result.stderr || result.stdout).slice(0, 400)}`);
  }
  return `robocopy status=${result.status}`;
}

function linkNodeModules(dest) {
  const target = path.join(REPO, 'node_modules');
  const link = path.join(dest, 'node_modules');
  if (fs.existsSync(link)) return;
  fs.symlinkSync(target, link, 'junction');
}

/** 相对 REPO 的路径 → 沙箱内绝对路径 */
function sandboxPath(caseDir, relative) {
  return path.join(caseDir, ...relative.split('/'));
}

function mkdirp(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

/** 备份一个文件的**未变异原件**到 gold（原件一律取自共享树，共享树全程只读） */
function backupGold(relative) {
  const target = path.join(GOLD, ...relative.split('/'));
  if (fs.existsSync(target)) return sha256OfFile(target);
  const source = path.join(REPO, ...relative.split('/'));
  if (!fs.existsSync(source)) throw new Error(`gold 备份失败：共享树里没有 ${relative}`);
  mkdirp(target);
  fs.copyFileSync(source, target);
  return sha256OfFile(target);
}

function runGate(caseDir, gate) {
  return new Promise(resolve => {
    const started = Date.now();
    const child = spawn(process.execPath, [gate.script, ...(gate.args || [])], {
      cwd: caseDir,
      env: { ...process.env, T17_CASE: '1' },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let out = '';
    let err = '';
    child.stdout.on('data', chunk => { out += chunk; });
    child.stderr.on('data', chunk => { err += chunk; });
    const timer = setTimeout(() => child.kill('SIGKILL'), 240000);
    child.on('close', code => {
      clearTimeout(timer);
      resolve({
        id: gate.id,
        script: gate.script,
        args: gate.args || [],
        exitCode: code === null ? -1 : code,
        durationMs: Date.now() - started,
        output: (out + err).slice(-6000)
      });
    });
  });
}

/** 从输出里抽"断言原文"：优先抓带 ✗ / FAIL / 错误 的行 */
function assertionLines(output, limit = 6) {
  const lines = String(output || '').split(/\r?\n/);
  const interesting = lines.filter(line => /(^|\s)(✗|❌|FAIL|ERROR|错误|不通过|问题)/.test(line) || /应为|必须|不一致|期望/.test(line));
  const pool = interesting.length ? interesting : lines.filter(line => line.trim().length > 0);
  return pool.slice(0, limit).map(line => line.trim().slice(0, 240));
}

/** 遍历一棵树算 (相对路径 → sha256)，用于"逐字节恢复"的证据 */
function treeHashes(root, relativePaths) {
  const result = {};
  for (const relative of relativePaths) {
    const file = path.join(root, ...relative.split('/'));
    result[relative] = fs.existsSync(file) ? sha256OfFile(file) : null;
  }
  return result;
}

async function runCase(spec, workerIndex) {
  const caseDir = path.join(CASES_DIR, `w${workerIndex}-${spec.id}`);
  fs.rmSync(caseDir, { recursive: true, force: true });
  copyTree(GOLD, caseDir);
  linkNodeModules(caseDir);

  const record = {
    id: spec.id,
    title: spec.title,
    group: spec.group,
    expected: spec.expected,
    targets: spec.targets,
    sandbox: caseDir,
    startedAt: nowStamp()
  };

  // ① 变异前哈希（在**本用例的树**上算，确保基线就是 gold 的内容）
  const before = treeHashes(caseDir, spec.targets);
  record.shaBefore = before;

  let applyError = null;
  try {
    // ② 应用变异
    const applied = spec.apply({ caseDir, sandboxPath: relative => sandboxPath(caseDir, relative), fs, path });
    record.applied = applied || { note: '(对照，无变异)' };

    // ③ 变异后哈希（应全部改变；对照用例应全部不变）
    record.shaMutated = treeHashes(caseDir, spec.targets);
    record.targetsChanged = spec.targets.filter(relative => before[relative] !== record.shaMutated[relative]);

    // ④ 跑门禁
    const gates = [];
    for (const gate of spec.gates) {
      const result = await runGate(caseDir, gate);
      result.assertions = assertionLines(result.output);
      result.output = undefined;
      gates.push(result);
    }
    record.gates = gates;
  } catch (error) {
    applyError = `${error.name}: ${error.message}`.slice(0, 500);
    record.error = applyError;
  } finally {
    // ⑤ 恢复：无论变异/门禁是否抛错，都必须用 gold 覆盖回写并逐字节校验
    record.restore = spec.targets.map(relative => {
      const goldFile = path.join(GOLD, ...relative.split('/'));
      const target = sandboxPath(caseDir, relative);
      mkdirp(target);
      fs.copyFileSync(goldFile, target);
      const after = sha256OfFile(target);
      return { path: relative, shaBefore: before[relative], shaAfter: after, byteExact: after === before[relative] };
    });
    record.allRestored = record.restore.every(item => item.byteExact);
  }

  // ⑥ 判定
  const gates = record.gates || [];
  const failing = gates.filter(gate => gate.exitCode !== 0);
  record.failingGates = failing.map(gate => `${gate.id}=${gate.exitCode}`);
  record.greenGates = gates.filter(gate => gate.exitCode === 0).map(gate => gate.id);
  if (applyError) {
    record.verdict = 'APPLY_ERROR';
  } else if (spec.expectGreen) {
    record.verdict = failing.length === 0 ? 'GREEN(PASS)' : 'RED(UNEXPECTED)';
  } else if (spec.expectNotCaught) {
    // 留档的已知盲区：期望"没有任何门禁变红"，但要与"本该红却没红"分开计数
    record.verdict = failing.length === 0 ? 'NOT_CAUGHT(KNOWN)' : 'RED(UNEXPECTED)';
  } else {
    record.verdict = failing.length > 0 ? 'CAUGHT' : 'NOT_CAUGHT';
  }
  if (record.allRestored === false) record.verdict = `RESTORE_FAILED(${record.verdict})`;
  record.finishedAt = nowStamp();
  fs.rmSync(caseDir, { recursive: true, force: true });
  return record;
}

async function main() {
  const onlyArg = process.argv.find(arg => arg.startsWith('--only='));
  const only = onlyArg ? new Set(onlyArg.slice('--only='.length).split(',').map(item => item.trim())) : null;
  const specs = CASES.filter(spec => !only || only.has(spec.id));

  fs.mkdirSync(LOGS, { recursive: true });
  fs.mkdirSync(CASES_DIR, { recursive: true });

  // 共享树基线哈希（电池结束后要逐字节对上）
  const sharedBefore = treeHashes(REPO, GUARDED);

  // gold：从共享树整体复制一份"未被变异的原始树"，用于建立基准与逐字节恢复
  if (!fs.existsSync(path.join(GOLD, 'package.json'))) {
    console.log(`[setup] 复制共享树 → gold（${GOLD}）…`);
    copyTree(REPO, GOLD);
  }
  linkNodeModules(GOLD);
  console.log('[setup] 登记会被变异的原件（来自共享树，只读）…');
  for (const spec of CASES) for (const relative of spec.targets) backupGold(relative);

  console.log(`[run] ${specs.length} 条用例 · ${WORKERS} 个并行 worker · 沙箱 ${SANDBOX}`);
  // 共享树"只读"的判据窗口：**只覆盖用例执行期间**。
  // 为什么不能把基线算在 setup 之前：setup 要把整棵树复制成 gold（数十秒），
  // 而共享树正在被队友并发编辑 —— 跨过 setup 的哈希对比会把**别人的提交**算成"电池改了共享树"。
  const windowStart = nowStamp();
  // 逐字节证据分两层：
  //   ① GUARDED（关键文件）在窗口首尾一致；
  //   ② **所有用例的变异目标文件**在窗口首尾一致 —— 这一层直接证明"电池没有碰共享树"，
  //      即使队友在同一窗口里正常提交了别的文件（那是他们的改动，不该记在电池头上）。
  const allTargets = [...new Set(CASES.flatMap(spec => spec.targets))];
  const sharedDuringCasesBefore = treeHashes(REPO, [...new Set([...GUARDED, ...allTargets])]);
  const results = [];
  let cursor = 0;
  async function worker(index) {
    while (cursor < specs.length) {
      const spec = specs[cursor++];
      const record = await runCase(spec, index);
      results.push(record);
      console.log(`  [${record.verdict.padEnd(18)}] ${spec.id} ${spec.title}  ${record.failingGates ? record.failingGates.join(' ') : ''}`);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(WORKERS, specs.length)) }, (_, index) => worker(index)));

  const sharedDuringCasesAfter = treeHashes(REPO, [...new Set([...GUARDED, ...allTargets])]);
  const changedDuringCases = [...new Set([...GUARDED, ...allTargets])].filter(relative => sharedDuringCasesBefore[relative] !== sharedDuringCasesAfter[relative]);
  const mutationTargetsUnchanged = allTargets.every(relative => sharedDuringCasesBefore[relative] === sharedDuringCasesAfter[relative]);
  // 判据用"变异目标未变"：它才是"电池没有写共享树"的直接证据；GUARDED 里的其他文件可能被队友正常提交
  const sharedUnchanged = mutationTargetsUnchanged;

  results.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const summary = {
    battery: 't17 mutation / tooth test battery',
    repo: REPO,
    sandbox: SANDBOX,
    workers: WORKERS,
    windowStart,
    runAt: nowStamp(),
    host: { platform: process.platform, release: os.release(), cpus: os.cpus().length },
    sharedTree: {
      note: '电池只在仓库外沙箱里变异。判据是「所有用例的变异目标文件在用例执行窗口内逐字节未变」——这直接证明电池没写共享树；GUARDED 里其余文件的差异可能来自队友的正常提交（都会被逐条列出）',
      mutationTargetsUnchanged,
      unchangedDuringCases: sharedUnchanged,
      changedDuringCases,
      guarded: GUARDED,
      mutationTargets: allTargets,
      baselineCapturedBeforeSetup: sharedBefore,
      windowBaseline: sharedDuringCasesBefore,
      windowAfter: sharedDuringCasesAfter
    },
    sharedTreeUnchanged: sharedUnchanged,
    sharedGuarded: GUARDED,
    counts: {
      total: results.length,
      caught: results.filter(item => item.verdict === 'CAUGHT').length,
      notCaught: results.filter(item => item.verdict === 'NOT_CAUGHT').length,
      knownNotCaught: results.filter(item => item.verdict === 'NOT_CAUGHT(KNOWN)').length,
      green: results.filter(item => String(item.verdict).startsWith('GREEN')).length,
      applyError: results.filter(item => item.verdict === 'APPLY_ERROR').length,
      unexpectedRed: results.filter(item => String(item.verdict).startsWith('RED(')).length,
      restoreFailed: results.filter(item => item.allRestored === false).length
    },
    results
  };
  const outFile = path.join(LOGS, 'battery.json');
  fs.writeFileSync(outFile, JSON.stringify(summary, null, 2), 'utf8');

  console.log(`\n共享树证据：变异目标文件在窗口内逐字节未变 = ${mutationTargetsUnchanged}${mutationTargetsUnchanged ? '' : `（变化：${allTargets.filter(r => sharedDuringCasesBefore[r] !== sharedDuringCasesAfter[r]).join(', ')}）`}`);
  if (changedDuringCases.length) console.log(`（另有 ${changedDuringCases.length} 个 GUARDED 文件在窗口内变化，属队友正常提交：${changedDuringCases.join(', ')}）`);
  console.log(`统计：${JSON.stringify(summary.counts)}`);
  console.log(`原始记录：${outFile}`);
  // 默认判据：未预期的 NOT_CAUGHT / 非预期红 / 变异应用失败 / 恢复失败 / 变异目标被改动 ⇒ 非 0。
  // 留档的已知盲区（NOT_CAUGHT(KNOWN)）默认**不算失败**（它们是审查产物，不是回归）；
  // 想让它们也判红（例如"盲区必须逐条被清掉"那一轮）就用 --strict。
  const strict = process.argv.includes('--strict');
  const bad = summary.counts.notCaught + summary.counts.unexpectedRed + summary.counts.applyError + summary.counts.restoreFailed
    + (sharedUnchanged ? 0 : 1)
    + (strict ? summary.counts.knownNotCaught : 0);
  if (bad) {
    console.error(`\n有 ${bad} 项需要人工看（未预期的 NOT_CAUGHT / 非预期红 / 变异应用失败 / 恢复失败 / 变异目标文件被改动${strict ? ' / 留档盲区（--strict）' : ''}）`);
    process.exit(1);
  }
  console.log(`\n全部用例：预期红 = 实际红，逐字节恢复成立，共享树的变异目标文件一个字节未动（留档的已知盲区 ${summary.counts.knownNotCaught} 条，默认不算失败；要它们也判红用 --strict）。`);
}

main().catch(error => { console.error(error); process.exit(2); });
