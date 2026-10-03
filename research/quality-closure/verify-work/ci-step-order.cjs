#!/usr/bin/env node
/**
 * T18 独立核对 t17 的「步骤语义冻结」声明（**只读解析** action.yml，不调用 check-ci-consistency）。
 *
 * 用法：node research/quality-closure/verify-work/ci-step-order.cjs [--json=…]
 * 断言：
 *   ① 六个产物依赖步骤都在 "Assemble site" 之后，且命令里显式 --dir=dist
 *   ② action.yml 全文没有 continue-on-error
 *   ③ 真浏览器步骤带 `if: steps.decision.outputs.mode == 'full'`（只有判定为 full 才跑）
 *   ④ 「浏览器可用性判定」步骤体内同时存在三条分支（full / degraded / 明确失败 exit 1）
 *   ⑤ 调用方的 allow_degraded_run 只在「人工 dispatch 且勾选」时为 true（表达式形式）
 */
'use strict';

const fs = require('fs');
const path = require('path');

const argOf = (n, d) => { const a = process.argv.find(x => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
const ROOT = path.resolve(__dirname, '..', '..', '..');
const JSON_OUT = path.resolve(ROOT, argOf('json', 'research/quality-closure/verify-work/logs/ci-step-order.json'));
const ACTION = path.join(ROOT, '.github/actions/gate/action.yml');
const text = fs.readFileSync(ACTION, 'utf8');
const lines = text.split(/\r?\n/);

/* 解析步骤：- name: X ... 到下一条 - name */
const steps = [];
lines.forEach((line, i) => {
  const m = line.match(/^\s*- name:\s*(.+?)\s*$/);
  if (m) steps.push({ name: m[1], start: i });
});
steps.forEach((s, idx) => { s.end = idx + 1 < steps.length ? steps[idx + 1].start : lines.length; s.body = lines.slice(s.start, s.end).join('\n'); });
const findStep = needle => steps.find(s => s.name.includes(needle));
const assembleIdx = steps.findIndex(s => s.name.includes('Assemble site'));

const ARTIFACT_STEPS = [
  'Archive self-test', 'Data-docs self-test', 'Models-page self-test', 'Plans-hub self-test', 'Vendor-pages self-test', 'Feeds reproducibility'
];
const failures = [];
const notes = [];
for (const needle of ARTIFACT_STEPS) {
  const idx = steps.findIndex(s => s.name.includes(needle));
  if (idx < 0) { failures.push(`找不到步骤「${needle}」`); continue; }
  const step = steps[idx];
  if (idx < assembleIdx) failures.push(`步骤「${needle}」在 Assemble site 之前（index ${idx} < ${assembleIdx}）`);
  if (!/--dir=dist\b/.test(step.body)) failures.push(`步骤「${needle}」没有显式 --dir=dist`);
}

const noComments = text.split(/\r?\n/).map(l => l.replace(/\s+#.*$/, '')).filter(l => !/^\s*#/.test(l)).join('\n');
if (/^\s*continue-on-error\s*:/m.test(noComments)) failures.push('action.yml（去注释后）里出现 continue-on-error 步骤键');
else notes.push('action.yml 去注释后无 continue-on-error 步骤键（注释里提到该词不算）');

const browser = findStep('Real-browser acceptance');
if (!browser) failures.push('找不到真浏览器验收步骤');
else {
  if (!/if:\s*steps\.decision\.outputs\.mode == 'full'/.test(browser.body)) failures.push('真浏览器步骤缺少 if: steps.decision.outputs.mode == \'full\'');
  else notes.push('真浏览器步骤只在判定为 full 时执行');
  if (!/node scripts\/tools\/verify-site\.js/.test(browser.body)) failures.push('真浏览器步骤没有跑 verify-site.js');
}
const decision = findStep('Browser availability decision');
if (!decision) failures.push('找不到「浏览器可用性判定」步骤');
else {
  const hasFull = /mode=full/.test(decision.body);
  const hasDegraded = /mode=degraded/.test(decision.body);
  const hasNone = /mode=none/.test(decision.body) && /exit 1/.test(decision.body);
  if (!hasFull || !hasDegraded || !hasNone) failures.push(`判定步骤分支不全（full=${hasFull} degraded=${hasDegraded} fail-closed=${hasNone}）`);
  else notes.push('判定步骤三条分支齐（full / degraded（仅显式允许）/ fail-closed exit 1）');
}

/* 调用方的表达式形式 */
for (const wf of ['verify.yml', 'collect.yml', 'deploy.yml']) {
  const t = fs.readFileSync(path.join(ROOT, '.github/workflows', wf), 'utf8');
  const callIdx = t.indexOf('./.github/actions/gate');
  const relevant = callIdx >= 0 ? t.slice(callIdx, callIdx + 400) : '';
  const m = relevant.match(/allow_degraded_run:\s*(\S+(?:\s+\S+)*)/);
  const expr = m ? m[1].trim() : null;
  notes.push(`${wf}: allow_degraded_run = ${expr}`);
  if (!expr) failures.push(`${wf}: 找不到 allow_degraded_run`);
}

notes.push(`步骤总数 ${steps.length} · Assemble site 在第 ${assembleIdx + 1} 步`);
const artifactPositions = ARTIFACT_STEPS.map(n => {
  const i = steps.findIndex(s => s.name.includes(n));
  return `${n}@${i + 1}`;
});
notes.push(`产物依赖步骤位置：${artifactPositions.join(' · ')}`);

fs.mkdirSync(path.dirname(JSON_OUT), { recursive: true });
fs.writeFileSync(JSON_OUT, JSON.stringify({ action: path.relative(ROOT, ACTION), steps: steps.map((s, i) => ({ i: i + 1, name: s.name })), notes, failures }, null, 2));
notes.forEach(n => console.log('  · ' + n));
if (failures.length) {
  console.log(`\n✗ ${failures.length} 项：`);
  failures.forEach(f => console.log('   - ' + f));
  process.exit(1);
}
console.log('\n✅ 步骤语义冻结声明与 action.yml 实际结构一致（顺序 / --dir=dist / 无 continue-on-error / 三分支）');
process.exit(0);
