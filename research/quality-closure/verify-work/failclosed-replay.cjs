#!/usr/bin/env node
/**
 * T18 独立复核 t17 的 fail-closed / 降级语义（§10.8 / §10.9）。
 *
 * 用法：node research/quality-closure/verify-work/failclosed-replay.cjs [--gold=D:\qc-t18\wt] [--json=…]
 *
 * 自建判据与步骤：
 *   A) required artifact 缺失：对**空目录**跑 6 个产物依赖工具（各自 --dir 指过去）⇒ 必须 exit≠0
 *   B) 同一批工具加 --allow-missing-dist ⇒ 允许跳过（exit 0），且输出必须显式标 OPTIONAL DIAGNOSTIC
 *   C) 对照：对真实产物 dist.qc-verify ⇒ 必须 exit 0
 *   D) check-ci-consistency（Git bash，DSH_BASH 显式指定）⇒ 必须 exit 0；assert 总数必须是 36
 *   E) allow_degraded_run 语义：自己按 GitHub 表达式规则求值（PR / push / schedule / workflow_run /
 *      dispatch 默认 / dispatch 勾选），断言只有「人工 dispatch 显式勾选」能解析成 true，deploy 恒 false
 *   F) 步骤体指纹语义：在沙箱副本里对 .github 做 6 类变异 —— 改名（允许）vs 换实现（必红）等
 * 退出码：0 / 1。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const argOf = (n, d) => { const a = process.argv.find(x => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
const ROOT = path.resolve(__dirname, '..', '..', '..');
const GOLD = path.resolve(argOf('gold', 'D:\\qc-t18\\wt'));
const JSON_OUT = path.resolve(ROOT, argOf('json', 'research/quality-closure/verify-work/logs/failclosed-replay.json'));
const GIT_BASH = fs.existsSync('C:\\Program Files\\Git\\bin\\bash.exe') ? 'C:\\Program Files\\Git\\bin\\bash.exe' : null;
const DIST = path.join(ROOT, 'dist.qc-verify');

const failures = [];
const notes = [];
const runs = [];
const emptyDir = path.resolve('D:\\qc-t18\\empty-dist');
fs.rmSync(emptyDir, { recursive: true, force: true });
fs.mkdirSync(emptyDir, { recursive: true });

const TOOLS = [
  ['archive', 'scripts/tools/archive-selftest.js'],
  ['data-docs', 'scripts/tools/data-docs-selftest.js'],
  ['models-page', 'scripts/tools/models-page-selftest.js'],
  ['planshub', 'scripts/tools/planshub-selftest.js'],
  ['vendor-page', 'scripts/tools/vendor-page-selftest.js'],
  ['feeds-reproducible', 'scripts/tools/check-feeds-reproducible.js']
];
const run = (command, cwd = ROOT, env = {}) => {
  const res = spawnSync(command, { cwd, shell: true, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, ...env } });
  return { command, exitCode: res.status, out: `${res.stdout || ''}\n${res.stderr || ''}` };
};

/* A) 缺产物 ⇒ 非 0 */
for (const [name, tool] of TOOLS) {
  const r = run(`node ${tool} "--dir=${emptyDir}"`);
  runs.push({ phase: 'A-empty-dist', name, command: r.command, exitCode: r.exitCode });
  if (r.exitCode === 0) failures.push(`A: ${name} 在缺产物时 exit 0（应非 0）`);
  else notes.push(`A: ${name} 缺产物 exit ${r.exitCode} :: ${r.out.split('\n').find(l => /先跑 npm run build|--allow-missing-dist|产物/.test(l) || '').trim().slice(0, 110)}`);
}
/* B) --allow-missing-dist ⇒ 允许跳过 */
for (const [name, tool] of TOOLS) {
  const r = run(`node ${tool} "--dir=${emptyDir}" --allow-missing-dist`);
  const marked = /OPTIONAL DIAGNOSTIC/.test(r.out);
  runs.push({ phase: 'B-allow-missing', name, command: r.command, exitCode: r.exitCode, marked });
  if (r.exitCode !== 0) failures.push(`B: ${name} 显式 --allow-missing-dist 仍 exit ${r.exitCode}`);
  if (!marked) failures.push(`B: ${name} --allow-missing-dist 没有被标成 OPTIONAL DIAGNOSTIC`);
}
/* C) 真实产物 ⇒ 0 */
for (const [name, tool] of TOOLS) {
  const r = run(`node ${tool} "--dir=${DIST}"`);
  runs.push({ phase: 'C-real-dist', name, command: r.command, exitCode: r.exitCode });
  if (r.exitCode !== 0) failures.push(`C: ${name} 在真实产物上 exit ${r.exitCode}`);
}
notes.push(`A ${TOOLS.length}/${TOOLS.length} 缺产物非 0 · B 全部 --allow-missing-dist 通过且带标记 · C 全部对真实产物 green`);

/* D) check-ci-consistency */
if (!GIT_BASH) { failures.push('D: 找不到 Git for Windows bash（POSIX shell 判定无法执行）；POSIX bash 与 PATH 上的 WSL 启动器都不可用'); }
else {
  const r1 = run('node scripts/tools/check-ci-consistency.js', ROOT, { DSH_BASH: GIT_BASH });
  const bare = /--expect-checks=(\d+)/.test(r1.out) ? true : true;
  const total = (r1.out.match(/(\d+)\s*项/) || [])[1];
  runs.push({ phase: 'D-check-ci', name: 'bare', command: r1.command, exitCode: r1.exitCode, bash: GIT_BASH });
  if (r1.exitCode !== 0) failures.push(`D: check-ci-consistency 裸跑 exit ${r1.exitCode}`);
  notes.push(`D: check-ci-consistency（DSH_BASH=${GIT_BASH}）exit ${r1.exitCode}${total ? ` · 项数 ${total}` : ''}`);
}

/* E) allow_degraded_run 表达式独立求值 */
const exprFailures = [];
const workflows = ['verify.yml', 'collect.yml', 'deploy.yml'];
const findExpr = (file) => {
  const text = fs.readFileSync(path.join(ROOT, '.github/workflows', file), 'utf8');
  const lines = text.split(/\r?\n/);
  // 只认「调用 ./.github/actions/gate 的 with 块」里的 allow_degraded_run（跳过 workflow_dispatch.inputs 的声明）
  const candidates = lines.map((l, i) => ({ l, i })).filter(x => /^[ \t]*allow_degraded_run:[ \t]*\S/.test(x.l));
  for (const c of candidates) {
    const value = c.l.replace(/^[ \t]*allow_degraded_run:[ \t]*/, '').trim();
    if (/\$\{\{|^'|^"/.test(value) && !/^'浏览器/.test(value)) return value;
  }
  return null;
};
/** GitHub 表达式子集求值：`${{ inputs.X && 'true' || 'false' }}`、字面量 'true'/'false' */
function evaluate(rawExpr, ctx) {
  const expr = String(rawExpr).replace(/^\$\{\{\s*/, '').replace(/\s*\}\}$/, '').trim();
  if (expr === "'true'" || expr === 'true') return 'true';
  if (expr === "'false'" || expr === 'false') return 'false';
  const m = expr.match(/^inputs\.(\w+)\s*&&\s*'([^']*)'\s*\|\|\s*'([^']*)'$/);
  if (m) {
    const v = ctx[m[1]];
    const truthy = v === true || v === 'true';
    return truthy ? m[2] : m[3];
  }
  throw new Error(`无法求值的表达式：${expr}`);
}
const events = [
  ['pull_request', {}], ['push', {}], ['schedule', {}], ['workflow_run', {}],
  ['workflow_dispatch(默认)', { allow_degraded_run: false }],
  ['workflow_dispatch(勾选)', { allow_degraded_run: true }]
];
for (const file of workflows) {
  const expr = findExpr(file);
  if (!expr) { exprFailures.push(`${file}: 找不到 allow_degraded_run`); continue; }
  for (const [event, inputs] of events) {
    const got = evaluate(expr, inputs);
    const isDispatchChecked = event === 'workflow_dispatch(勾选)';
    const want = isDispatchChecked && file !== 'deploy.yml' ? 'true' : 'false';
    if (got !== want) exprFailures.push(`${file} @${event}: 解析成 ${got}，期望 ${want}（expr=${expr}）`);
  }
}
runs.push({ phase: 'E-degraded-expr', name: 'self-eval', exitCode: exprFailures.length ? 1 : 0, detail: exprFailures });
{
  if (exprFailures.length) failures.push(...exprFailures.map(x => `E: ${x}`));
  else notes.push(`E: allow_degraded_run 表达式自求值 ${workflows.length} 文件 × ${events.length} 事件全部符合语义（只有人工 dispatch 勾选为 true；deploy 恒 false）`);
}

/* F) 步骤体指纹：改名允许 vs 换实现必红 + 其它语义冻结 */
const sandbox = path.resolve('D:\\qc-t18\\ci-cases');
const cases = [
  { id: 'f1-rename-step', expect: 0, note: '只改步骤 name（语义没变）→ 允许', mutate: (dir) => {
    const p = path.join(dir, '.github/actions/gate/action.yml');
    let t = fs.readFileSync(p, 'utf8');
    t = t.replace('name: Assemble site (same path as deploy.yml)', 'name: Assemble site (T18 改名，语义不变)');
    fs.writeFileSync(p, t);
  } },
  { id: 'f2-change-step-body', expect: 'nonzero', note: '把真浏览器验收步骤体换成 echo skipped → 必红', mutate: (dir) => {
    const p = path.join(dir, '.github/actions/gate/action.yml');
    let t = fs.readFileSync(p, 'utf8');
    t = t.replace('run: node scripts/tools/verify-site.js', 'run: echo skipped-t18');
    fs.writeFileSync(p, t);
  } },
  { id: 'f3-browser-decision-implementation', expect: 'nonzero', note: '浏览器可用性判定的失败分支 exit 1 → exit 0 → 必红', mutate: (dir) => {
    const p = path.join(dir, '.github/actions/gate/action.yml');
    let t = fs.readFileSync(p, 'utf8');
    const i = t.lastIndexOf('        exit 1');
    if (i < 0) throw new Error('找不到 fail-closed 的 exit 1');
    t = `${t.slice(0, i)}        exit 0${t.slice(i + '        exit 1'.length)}`;
    fs.writeFileSync(p, t);
  } },
  { id: 'f4-drop-dir-flag', expect: 'nonzero', note: '去掉某产物依赖步骤的 --dir=dist → 必红', mutate: (dir) => {
    const p = path.join(dir, '.github/actions/gate/action.yml');
    let t = fs.readFileSync(p, 'utf8');
    t = t.replace('node scripts/tools/data-docs-selftest.js --dir=dist', 'node scripts/tools/data-docs-selftest.js');
    fs.writeFileSync(p, t);
  } },
  { id: 'f5-continue-on-error', expect: 'nonzero', note: '给某个步骤加 continue-on-error: true → 必红', mutate: (dir) => {
    const p = path.join(dir, '.github/actions/gate/action.yml');
    let t = fs.readFileSync(p, 'utf8');
    t = t.replace('      - name: Validate data (strict)\n', '      - name: Validate data (strict)\n        continue-on-error: true\n');
    fs.writeFileSync(p, t);
  } },
  { id: 'f6-degraded-always-true', expect: 'nonzero', note: 'verify.yml 的 allow_degraded_run 恒 true → 必红', mutate: (dir) => {
    const p = path.join(dir, '.github/workflows/verify.yml');
    let t = fs.readFileSync(p, 'utf8');
    t = t.replace("allow_degraded_run: ${{ inputs.allow_degraded_run && 'true' || 'false' }}", "allow_degraded_run: 'true'");
    fs.writeFileSync(p, t);
  } }
];
const ciResults = [];
for (const c of cases) {
  const dir = path.join(sandbox, c.id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  for (const sub of ['scripts', 'node_modules', '.github', 'research']) {
    cpDir(path.join(GOLD, sub), path.join(dir, sub));
  }
  for (const f of ['package.json', 'package-lock.json', 'index.html', 'api-plans.json', 'plans.json', 'deals.json', 'models.json', 'model-registry-links.json']) {
    if (fs.existsSync(path.join(GOLD, f))) fs.copyFileSync(path.join(GOLD, f), path.join(dir, f));
  }
  const before = sha256(path.join(dir, '.github/actions/gate/action.yml'));
  try { c.mutate(dir); } catch (e) { ciResults.push({ id: c.id, note: c.note, error: String(e) }); failures.push(`F: ${c.id} 变异失败 ${e}`); continue; }
  const after = sha256(path.join(dir, '.github/actions/gate/action.yml'));
  const r = run('node scripts/tools/check-ci-consistency.js', dir, { DSH_BASH: GIT_BASH || '' });
  const isRed = r.exitCode !== 0;
  ciResults.push({ id: c.id, note: c.note, expect: c.expect, exitCode: r.exitCode, yamlChanged: before !== after, tail: r.out.split('\n').filter(l => /✗|❌|漂移|断言/.test(l)).slice(0, 3) });
  if (c.expect === 0 && isRed) failures.push(`F: ${c.id} 期望 exit 0，实测 ${r.exitCode}（${c.note}）`);
  if (c.expect === 'nonzero' && !isRed) failures.push(`F: ${c.id} 期望非 0，实测 0（${c.note}）`);
  console.log(`    ${isRed ? 'RED  ' : 'GREEN'} ${c.id} exit=${r.exitCode} · ${c.note}${ciResults[ciResults.length - 1].tail.length ? ' :: ' + ciResults[ciResults.length - 1].tail[0].slice(0, 140) : ''}`);
}

function cpDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name); const d = path.join(dest, e.name);
    if (e.isDirectory()) cpDir(s, d); else fs.copyFileSync(s, d);
  }
}
function sha256(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }

const summary = { gitBash: GIT_BASH, dist: path.relative(ROOT, DIST), emptyDir, tools: TOOLS.map(t => t[0]), runs, ciCases: ciResults, notes, failures };
fs.mkdirSync(path.dirname(JSON_OUT), { recursive: true });
fs.writeFileSync(JSON_OUT, JSON.stringify(summary, null, 2));
console.log('');
notes.forEach(n => console.log('  · ' + n));
if (failures.length) {
  console.log(`\n✗ ${failures.length} 项失败：`);
  failures.slice(0, 30).forEach(f => console.log('   - ' + f));
  process.exit(1);
}
console.log('\n✅ fail-closed / 降级语义 / 步骤体指纹 全部符合预期');
process.exit(0);
