#!/usr/bin/env node
/**
 * coverage-depth-v1：**本地 Full Gate 运行器**。
 *
 * 存在的理由（题面 §70）：完整门禁的步骤清单**只有一个出处** ——
 * `.github/actions/gate/action.yml`。任何「本地重抄一份步骤表」的做法都会在下一轮漂移，
 * 所以本脚本**每次现读 action.yml**，逐 step 执行，绝不写死 49 步 / 38 项这类数字。
 *
 * 与 CI 的三处**显式**差异（都会记进结果 JSON，不静默）：
 *   ① `Install dependencies`（npm ci）：本地跳过 —— 本轮开工时已跑过一次。更重要的是
 *      本地重跑 npm ci 会先删掉 node_modules，而队友可能正在用它。
 *   ② `Prepare browser for the real-browser gate` / `Browser availability decision`：
 *      CI 那两步靠 GITHUB_OUTPUT / sudo npx playwright install；本地直接用
 *      `scripts/lib/browser.js` 的 detectChannel()（本机已有 Edge）。
 *   ③ `Gate conclusion`：CI 里只往 GITHUB_STEP_SUMMARY 写摘要，本地由本脚本汇总。
 *
 * 大输出一律**文件捕获**（stdio 直接给 fd），不回退到 stdout pipe（题面 §72）。
 *
 * 用法：
 *   node research/_raw/coverage-depth-v1/gate/gate-runner.cjs
 *   node research/_raw/coverage-depth-v1/gate/gate-runner.cjs --from=SEO --label=after-fix
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const ACTION = path.join(ROOT, '.github', 'actions', 'gate', 'action.yml');
const VERIFY_YML = path.join(ROOT, '.github', 'workflows', 'verify.yml');
const BASH = process.env.CD_BASH || 'C:\\Program Files\\Git\\bin\\bash.exe';

const args = process.argv.slice(2);
const flagValue = name => {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const FROM = flagValue('from');
const ONLY = flagValue('only') ? flagValue('only').split(',').map(s => s.trim()) : null;
const LABEL = flagValue('label') || 'run';
const OUT_DIR = path.join(ROOT, 'research', '_raw', 'coverage-depth-v1', 'gate', LABEL);
const LOG_DIR = path.join(OUT_DIR, 'logs');

function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

/** 从 action.yml 现读步骤表（name / shell / run），不写死任何一条 */
function parseSteps(file) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const steps = [];
  let current = null;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const nameMatch = line.match(/^\s{4}- name:\s*(.+?)\s*$/);
    if (nameMatch) {
      if (current) steps.push(current);
      current = { name: nameMatch[1].replace(/^['"]|['"]$/g, ''), shell: null, run: null };
      i++;
      continue;
    }
    if (current) {
      const shellMatch = line.match(/^\s{6}shell:\s*(\S+)\s*$/);
      if (shellMatch) current.shell = shellMatch[1];
      const runInline = line.match(/^\s{6}run:\s*(\S.*)$/);
      const runBlock = line.match(/^\s{6}run:\s*\|\s*$/);
      if (runInline) {
        current.run = runInline[1];
      } else if (runBlock) {
        const block = [];
        let j = i + 1;
        while (j < lines.length && (lines[j].trim() === '' || /^\s{8,}/.test(lines[j]))) {
          block.push(lines[j].replace(/^\s{8}/, ''));
          j++;
        }
        current.run = block.join('\n');
        i = j;
        continue;
      }
    }
    i++;
  }
  if (current) steps.push(current);
  return steps;
}

function runStep(step, index) {
  const logFile = path.join(LOG_DIR, `${String(index).padStart(2, '0')}-${slug(step.name)}.log`);
  const fd = fs.openSync(logFile, 'w');
  const started = Date.now();
  const result = spawnSync(BASH, ['-c', step.run], {
    cwd: ROOT,
    stdio: ['ignore', fd, fd],
    encoding: 'utf8',
    env: { ...process.env, GITHUB_STEP_SUMMARY: path.join(OUT_DIR, 'step-summary.md'), CD_LOCAL_GATE: '1' },
    maxBuffer: 512 * 1024 * 1024
  });
  fs.closeSync(fd);
  const bytes = fs.statSync(logFile).size;
  return {
    name: step.name,
    shell: step.shell || 'bash',
    run: step.run && step.run.split('\n')[0].slice(0, 160),
    exitCode: result.status,
    durationMs: Date.now() - started,
    logBytes: bytes,
    log: path.relative(ROOT, logFile)
  };
}

const SKIP = {
  'Install dependencies': '本地跳过：本轮开工时已 npm ci；重跑会先删 node_modules，而队友可能正在用'
};

/**
 * 本地对 CI 专用步骤的**等价替换**。每一处都有明确理由，且替换后的命令与原步骤问的是同一个问题。
 * 绝不因为「本地跑不了」就静默跳过 —— 跳过的只有纯 CI 报表动作。
 */
const PROBE = "node -e \"const b=require('./scripts/lib/browser');b.detectChannel().then(c=>{console.log(JSON.stringify({available:!!c,channel:c}));process.exit(c?0:1)}).catch(e=>{console.error('探测失败：'+e.message);process.exit(1)})\"";

const LOCAL_OVERRIDES = {
  'Prepare browser for the real-browser gate': {
    run: PROBE,
    reason: 'CI 用 npx playwright install --with-deps chromium + GITHUB_OUTPUT；本机已有 Edge，改用 lib/browser.js 的 detectChannel()（同一支探测入口）。本步骤本身不判死，与 CI 语义一致。'
  },
  'Browser availability decision (never silent)': {
    run: PROBE,
    reason: 'CI 读上一步的 GITHUB_OUTPUT；本地直接重新探测。语义不变：探测不到浏览器就 exit 1，绝不静默变绿（与 CI 默认失败一致）。'
  },
  'Gate conclusion': {
    run: 'echo "（本地 Full Gate：结论由 research/_raw/coverage-depth-v1/gate/<label>/gate-results.json 汇总）" >> "$GITHUB_STEP_SUMMARY"',
    reason: 'CI 只把结论写进 GITHUB_STEP_SUMMARY；本地由 gate-runner 自己汇总，这里只保留同一份 Summary 文件的落盘。'
  }
};

function main() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const steps = parseSteps(ACTION);
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim();
  const dirty = spawnSync('git', ['status', '--porcelain=v1'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim();

  const results = [];
  let started = FROM === null;
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (!started) {
      if (step.name.includes(FROM)) started = true;
      else { results.push({ name: step.name, skipped: true, reason: `--from=${FROM} 之前` }); continue; }
    }
    if (ONLY && !ONLY.some(token => step.name.includes(token))) {
      results.push({ name: step.name, skipped: true, reason: '--only 过滤' });
      continue;
    }
    if (SKIP[step.name]) {
      results.push({ name: step.name, skipped: true, reason: SKIP[step.name] });
      console.log(`⏭  ${i + 1}/${steps.length} ${step.name} —— ${SKIP[step.name]}`);
      continue;
    }
    process.stdout.write(`▶ ${i + 1}/${steps.length} ${step.name} … `);
    const override = LOCAL_OVERRIDES[step.name];
    const effective = override ? { ...step, run: override.run } : step;
    const record = runStep(effective, i + 1);
    if (override) {
      record.localOverride = true;
      record.overrideReason = override.reason;
      record.ciRun = step.run && step.run.split('\n')[0].slice(0, 160);
      record.run = override.run.split('\n')[0].slice(0, 160);
    }
    results.push(record);
    console.log(`${record.exitCode === 0 ? '✅' : `❌ exit=${record.exitCode}`} (${(record.durationMs / 1000).toFixed(1)}s, ${record.logBytes}B)${override ? ' [local-override]' : ''}`);
  }

  /* verify.yml 上那条「期望项数唯一出处」的口径检查（gate action 不含它） */
  const ciStep = { name: 'CI consistency (verify.yml --expect-checks)', shell: 'bash' };
  const expect = [...fs.readFileSync(VERIFY_YML, 'utf8').matchAll(/--expect-checks=(\d+)/g)].map(m => m[1]);
  ciStep.run = `node scripts/tools/check-ci-consistency.js --expect-checks=${expect[0]}`;
  if (!ONLY || ONLY.some(t => ciStep.name.includes(t))) {
    process.stdout.write(`▶ ${ciStep.name} … `);
    const record = runStep(ciStep, steps.length + 1);
    results.push(record);
    console.log(`${record.exitCode === 0 ? '✅' : `❌ exit=${record.exitCode}`}`);
  } else {
    results.push({ name: ciStep.name, skipped: true, reason: '--only 过滤' });
  }

  const executed = results.filter(r => !r.skipped);
  const failed = executed.filter(r => r.exitCode !== 0);
  const summary = {
    label: LABEL,
    generatedAt: new Date().toISOString(),
    head,
    dirtyFiles: dirty ? dirty.split('\n').length : 0,
    actionStepsParsed: steps.length,
    expectChecksFromVerifyYml: expect,
    executed: executed.length,
    failed: failed.length,
    results
  };
  fs.writeFileSync(path.join(OUT_DIR, 'gate-results.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

  console.log(`\n${failed.length ? '❌' : '✅'} 本地 Full Gate：执行 ${executed.length} 步，失败 ${failed.length} 步（步骤表现读自 ${path.relative(ROOT, ACTION)}，共 ${steps.length} 步）`);
  for (const f of failed) console.log(`   ✗ ${f.name}（exit ${f.exitCode}）→ ${f.log}`);
  return failed.length ? 1 : 0;
}

process.exit(main());
