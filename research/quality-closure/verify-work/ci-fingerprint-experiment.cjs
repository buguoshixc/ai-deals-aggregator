#!/usr/bin/env node
/**
 * T18 定向实验：t17 的「步骤体规范化指纹」到底冻结了什么。
 *
 * 用法：node research/quality-closure/verify-work/ci-fingerprint-experiment.cjs [--gold=D:\qc-t18\wt] [--work=D:\qc-t18\ci-exp]
 *
 * 5 个实验（每个独立副本）：
 *   g1 在 run 体里插一行**注释**（语义不变）        → 期望 check-ci exit 0（规范化先剥整行注释）
 *   g2 在 run 体里插一个空行（语义不变）            → 期望 0
 *   g3 只改步骤 name（语义不变）                    → 实测（作者声明步骤序列也冻结）
 *   g4 给步骤加 `continue-on-error: true`（正确缩进）→ 期望非 0（action 不得静默降级）
 *   g5 把 `--dir=dist` 改成 `--dir=dist.qc-gate`（语义变化）→ 期望非 0
 * 退出码：0 = 与期望一致；1 = 有出入（逐条列出，含原文报错）。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const argOf = (n, d) => { const a = process.argv.find(x => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
const GOLD = path.resolve(argOf('gold', 'D:\\qc-t18\\wt'));
const WORK = path.resolve(argOf('work', 'D:\\qc-t18\\ci-exp'));
const JSON_OUT = path.join(__dirname, 'logs', 'ci-fingerprint-experiment.json');
const GIT_BASH = 'C:\\Program Files\\Git\\bin\\bash.exe';
const ACTION_REL = '.github/actions/gate/action.yml';

function cpDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (e.name === '.qc-t18' || e.name.startsWith('dist')) continue;
    const s = path.join(src, e.name), d = path.join(dest, e.name);
    if (e.isDirectory()) cpDir(s, d); else fs.copyFileSync(s, d);
  }
}
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const ACTION = p => path.join(p, ACTION_REL);

const EXPERIMENTS = [
  { id: 'g1-comment-in-body', expect: 0, note: 'run 体里插注释（语义不变）', apply: (dir) => {
    const p = ACTION(dir); let t = fs.readFileSync(p, 'utf8');
    const before = t;
    t = t.replace('      run: node scripts/tools/verify-site.js', '      run: |\n        # T18 实验：语义不变的注释行\n        node scripts/tools/verify-site.js');
    if (t === before) throw new Error('锚点没匹配（verify-site run 行）');
    fs.writeFileSync(p, t);
  } },
  { id: 'g2-blank-line-in-body', expect: 0, note: 'run 体里插空行（语义不变）', apply: (dir) => {
    const p = ACTION(dir); let t = fs.readFileSync(p, 'utf8');
    const before = t;
    t = t.replace('      run: node scripts/tools/verify-site.js', '      run: |\n        node scripts/tools/verify-site.js\n\n');
    if (t === before) throw new Error('锚点没匹配（verify-site run 行）');
    fs.writeFileSync(p, t);
  } },
  { id: 'g3-rename-step', expect: 'observe', note: '只改步骤 name（语义不变）', apply: (dir) => {
    const p = ACTION(dir); let t = fs.readFileSync(p, 'utf8');
    t = t.replace('name: Assemble site (same path as deploy.yml)', 'name: Assemble site (T18 实验改名)');
    fs.writeFileSync(p, t);
  } },
  { id: 'g4-continue-on-error', expect: 'nonzero', note: '给步骤加 continue-on-error: true', apply: (dir) => {
    const p = ACTION(dir); let t = fs.readFileSync(p, 'utf8');
    const before = t;
    t = t.replace(/(\n(\s+)- name: Validate data \(strict\)\n)/, (m, whole, indent) => `\n${indent}- name: Validate data (strict)\n${indent}  continue-on-error: true\n`);
    if (t === before) throw new Error('continue-on-error 注入没有生效（锚点没匹配上）');
    fs.writeFileSync(p, t);
  } },
  { id: 'g5-dir-semantic-change', expect: 'nonzero', note: '--dir=dist → --dir=dist.qc-gate（语义变化）', apply: (dir) => {
    const p = ACTION(dir); let t = fs.readFileSync(p, 'utf8');
    const before = t;
    t = t.replace('node scripts/tools/data-docs-selftest.js --dir=dist', 'node scripts/tools/data-docs-selftest.js --dir=dist.qc-gate');
    if (t === before) throw new Error('--dir 替换没有生效');
    fs.writeFileSync(p, t);
  } }
];

fs.mkdirSync(WORK, { recursive: true });
const results = [];
const problems = [];
for (const exp of EXPERIMENTS) {
  const dir = path.join(WORK, exp.id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  cpDir(GOLD, dir);
  const before = sha(ACTION(dir));
  try { exp.apply(dir); } catch (e) { problems.push(`${exp.id}: 变异失败 ${e.message}`); continue; }
  const after = sha(ACTION(dir));
  const changed = before !== after;
  const res = spawnSync('node scripts/tools/check-ci-consistency.js', { cwd: dir, shell: true, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, DSH_BASH: GIT_BASH } });
  const out = `${res.stdout || ''}${res.stderr || ''}`;
  const errors = out.split('\n').filter(l => /^\s*✗|❌/.test(l)).map(l => l.trim()).slice(0, 4);
  const record = { id: exp.id, note: exp.note, expect: exp.expect, yamlChanged: changed, exitCode: res.status, errors };
  results.push(record);
  console.log(`\n### ${exp.id}（${exp.note}）yamlChanged=${changed} exit=${res.status}`);
  errors.forEach(e => console.log('    ' + e.slice(0, 220)));
  if (!changed) { problems.push(`${exp.id}: 变异没有改动 action.yml`); continue; }
  if (exp.expect === 0 && res.status !== 0) problems.push(`${exp.id}: 期望 0，实测 ${res.status}`);
  if (exp.expect === 'nonzero' && res.status === 0) problems.push(`${exp.id}: 期望非 0，实测 0`);
}
fs.mkdirSync(path.dirname(JSON_OUT), { recursive: true });
fs.writeFileSync(JSON_OUT, JSON.stringify({ gold: GOLD, results, problems }, null, 2));
if (problems.length) {
  console.log(`\n✗ ${problems.length} 项与期望不符：`);
  problems.forEach(p => console.log('   - ' + p));
  process.exit(1);
}
console.log('\n✅ 步骤体指纹实验与期望一致（注释/空行不误报；语义变化与 continue-on-error 都被抓）');
process.exit(0);
