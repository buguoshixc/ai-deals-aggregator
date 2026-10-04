#!/usr/bin/env node
/**
 * t25 定向变异：**删掉一条 API 侧处置声明 ⇒ 覆盖报告必须非 0**。
 *
 * 判据（与门禁同一口径）：每条计价条目都必须有结局 —— 映射 **或** 处置声明。
 * 把 `model-registry-gaps.json` 里某一条 API 侧声明删掉之后，那条计价条目就"既没映射、
 * 也没声明"，于是：
 *   · `validateLinks()` 报"API 侧有计价条目没人认领"（门禁层）；
 *   · 报告自己新增的"未判 API 计价条目 ≠ 0 ⇒ 报告自检非 0"（报告层）。
 * 两层都必须红；只红一层说明"报告比门禁好看"或"门禁比报告严"，都是不可接受的。
 *
 * 变异在 **TEMP 副本**上做（`--gaps=<temp>`），盘上数据一个字节都不动；跑完删副本。
 *
 * 用法：node research/_raw/t25/mutate-drop-api-disposition.cjs
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..', '..');
const REPORT = path.join(ROOT, 'scripts', 'tools', 'coverage-report.js');
const GAPS_REL = 'scripts/data/model-registry-gaps.json';

const failures = [];
function check(name, ok, detail) {
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok || !detail ? '' : ` —— ${detail}`}`);
  if (!ok) failures.push(name);
}

function runReport(args) {
  const result = spawnSync(process.execPath, [REPORT, ...args], { cwd: ROOT, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
  return { status: result.status, stdout: result.stdout || '', stderr: result.stderr || '' };
}
const problemsOf = run => run.stderr.split('\n').filter(text => text.trim().startsWith('- ')).map(text => text.trim().slice(2));

const gapsPath = path.join(ROOT, GAPS_REL);
const gapsDoc = JSON.parse(fs.readFileSync(gapsPath, 'utf8'));

/* ---------------- 对照：未变异的盘面 ---------------- */
const control = runReport(['--json']);
const controlProblems = problemsOf(control);
console.log(`① 对照（未变异）：exit ${control.status}，报告自检问题 ${controlProblems.length} 处`);
controlProblems.slice(0, 4).forEach(text => console.log(`     · ${text}`));

/* ---------------- 变异：删掉一条 API 侧声明 ---------------- */
const declarations = Array.isArray(gapsDoc) ? gapsDoc : gapsDoc.declarations;
const targetIndex = declarations.findIndex(item => item && item.apiPlanId !== undefined && item.modelKey !== undefined);
check('gaps 里至少有 1 条 API 侧声明可供变异', targetIndex >= 0);
if (targetIndex < 0) {
  console.log('\n=== t25 定向变异：前置条件不成立 ===');
  process.exit(1);
}
const removed = declarations[targetIndex];
const mutated = JSON.parse(JSON.stringify(gapsDoc));
const mutatedDeclarations = Array.isArray(mutated) ? mutated : mutated.declarations;
mutatedDeclarations.splice(targetIndex, 1);

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 't25-mutate-'));
const tmpGaps = path.join(tmpDir, 'gaps-mutated.json');
fs.writeFileSync(tmpGaps, `${JSON.stringify(mutated, null, 2)}\n`);

console.log(`\n② 变异：删掉一条 API 侧声明（apiPlanId=${removed.apiPlanId}, modelKey=${removed.modelKey}, variant=${removed.variant === undefined ? 'null' : removed.variant}）`);
console.log(`   变异文件：${tmpGaps}（盘上数据未动）`);

let mutatedRun;
try {
  mutatedRun = runReport(['--json', `--gaps=${tmpGaps}`]);
} finally {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (error) { /* 临时目录清不掉不影响判据 */ }
}
const mutatedProblems = problemsOf(mutatedRun);
console.log(`   变异后：exit ${mutatedRun.status}，报告自检问题 ${mutatedProblems.length} 处`);

/* ---------------- 判据 ---------------- */
check('变异后报告必须非 0（有计价条目失去结局 ⇒ 报告不许绿）', mutatedRun.status !== 0, `exit ${mutatedRun.status}`);
check('变异后问题数必须比对照**多**（真正新增了红的判据，而不是撞上原本就有的红）',
  mutatedProblems.length > controlProblems.length, `${controlProblems.length} → ${mutatedProblems.length}`);
const newProblems = mutatedProblems.filter(text => !controlProblems.includes(text));
check('新增问题里必须点名"未判 / 既没有映射也没有声明"这条报告层判据',
  newProblems.some(text => /未判|既没有 registry 映射、也没有在 model-registry-gaps/.test(text)),
  newProblems.slice(0, 3).join('；'));
check('新增问题里必须点名被删的那条条目（能指到具体是哪一条）',
  newProblems.some(text => text.includes(removed.modelKey) || text.includes(removed.apiPlanId)),
  newProblems.slice(0, 3).join('；'));
check('变异后报告不许再打印 JSON / 成功行（失败就是失败，不许两副面孔）',
  !/JSON:/.test(mutatedRun.stdout) && !/覆盖报告自检通过/.test(mutatedRun.stdout));

console.log('\n   变异后新增的问题：');
newProblems.slice(0, 6).forEach(text => console.log(`     + ${text}`));

console.log(`\n=== t25 定向变异：${failures.length ? `${failures.length} 项不成立` : '全部成立（删一条声明 ⇒ 报告必红）'} ===`);
if (failures.length) {
  failures.forEach(name => console.log(`  ✗ ${name}`));
  process.exit(1);
}
