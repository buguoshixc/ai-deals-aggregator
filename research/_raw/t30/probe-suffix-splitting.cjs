#!/usr/bin/env node
/**
 * t30 / T26-F1：**反绕过后缀切分**的真实数据探测复算（只读、幂等、可复跑）。
 *
 * 它回答三件事，任何一件不成立就 exit 1：
 *   ① 切分集补齐 `_` / `-` 之后，schema 允许的四种命名空间形状（fixture）都命中 `glm-5.3`；
 *      并复算"修补前只按 `/`、`.`、`．` 切分"的行为，证明其中三种**原先探不到**（这就是 T26-F1）；
 *   ② 真实数据结论**不变**：那 7 条（已搬去写映射的）仍各命中恰好 1 个 identity，
 *      落成 API 侧声明的 12 条命中数 0（规则变宽不许冒出新的强制映射）；
 *   ③ 对照：真实 off-registry 键（含被切出碎尾段的 `nemotron-lightning-3p5-30b-a3b`）仍然 0 命中；
 *      `MODEL_KEY_RE` 拒收的拼法不需要额外规则。
 *
 * 用法：node research/_raw/t30/probe-suffix-splitting.cjs
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const reg = require(path.join(ROOT, 'scripts', 'lib', 'model-registry.js'));
const apiSchema = require(path.join(ROOT, 'scripts', 'lib', 'api-plan-schema.js'));

const fixturesDoc = JSON.parse(fs.readFileSync(path.join(__dirname, 'separator-fixtures.json'), 'utf8'));
const apiPlans = JSON.parse(fs.readFileSync(path.join(ROOT, 'api-plans.json'), 'utf8')).plans || [];
const table = reg.load().table;
const folded = reg.foldedIndexOf(table);
const gapsDoc = reg.loadGaps().doc;

let failed = 0;
const check = (name, ok, detail = '') => {
  if (ok) console.log(`  ✓ ${name}`);
  else { failed += 1; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};

/** 修补前的切分集（只按 / . ．），用来复算"原先探不到"这件事 —— 只是本地复算，不影响生产代码 */
const legacySuffixes = value => {
  const parts = String(value === null || value === undefined ? '' : value).split(/[/．.]/).filter(part => part !== '');
  const out = [];
  for (let start = 0; start < parts.length; start += 1) {
    const tail = parts.slice(start).join('.');
    if (tail && !out.includes(tail)) out.push(tail);
  }
  return out;
};
const legacyHits = (value, index) => {
  const slugs = [];
  const push = slug => { if (slug && !slugs.includes(slug)) slugs.push(slug); };
  push(index.get(reg.identityFold(value)));
  for (const suffix of legacySuffixes(value)) push(index.get(reg.identityFold(suffix)));
  return slugs;
};

console.log('=== t30 / T26-F1 反绕过后缀切分探测复算 ===');
console.log(`  切分集（生产）：[/．._-]   · registry 身份（slug + 别名）折叠索引 ${folded.size} 条`);
console.log('');

console.log('① fixture：schema 允许的命名空间形状');
fixturesDoc.fixtures.forEach(fixture => {
  const hits = reg.foldedHitsOf(fixture.modelKey, folded).map(hit => hit.slug);
  const legacy = legacyHits(fixture.modelKey, folded);
  check(`   ${fixture.shape}「${fixture.modelKey}」→ 命中 ${JSON.stringify(hits)}（修补前 ${JSON.stringify(legacy)}）`,
    hits.length === 1 && hits[0] === fixture.expectedSlug,
    `期望恰好命中 ${fixture.expectedSlug}`);
  check(`   ${fixture.shape}「${fixture.modelKey}」修补前${fixture.missedBeforeFix ? '确实探不到' : '已能探到（靠整串折叠 / 别名或 `/`、`.` 切分）'}`,
    fixture.missedBeforeFix ? legacy.length === 0 : legacy.length === 1,
    `修补前命中 ${JSON.stringify(legacy)}`);
});
console.log('');

console.log('② 真实数据结论不变（7 条命中 / 12 条声明 0 命中）');
const seven = [
  ['8a26562011f2', 'deepseek-ai.v4-pro-0813'],
  ['8a26562011f2', 'deepseek-ai.v4.1-flash'],
  ['8a26562011f2', 'minimaxai.m3'],
  ['929a1f3ec46c', 'deepseek-v4p1-flash'],
  ['929a1f3ec46c', 'glm-5p3'],
  ['929a1f3ec46c', 'glm-5p3-flash'],
  ['929a1f3ec46c', 'qwen3p8-max']
];
let sevenOk = 0;
seven.forEach(([apiPlanId, modelKey]) => {
  const plan = apiPlans.find(item => item.id === apiPlanId);
  const entry = plan && plan.models.find(model => model.modelKey === modelKey);
  const hits = [...new Set(reg.foldedHitsOf(modelKey, folded)
    .concat(entry ? reg.foldedHitsOf(entry.name, folded) : [])
    .map(hit => hit.slug))];
  const ok = hits.length === 1;
  if (ok) sevenOk += 1;
  console.log(`   ${ok ? '✓' : '✗'} ${apiPlanId}/${modelKey}（官方显示名 ${JSON.stringify(entry ? entry.name : null)}）→ ${JSON.stringify(hits)}`);
});
check('   7 条"其实能对上"的计价条目各命中恰好 1 个 identity（它们现在都已经写成映射）',
  sevenOk === 7, `实得 ${sevenOk}/7`);

const declared = reg.declarationsList(gapsDoc).filter(declaration => declaration && declaration.apiPlanId !== undefined);
console.log('   12 条 API 侧处置声明逐条结论：');
let declaredHits = 0;
declared.forEach(declaration => {
  const plan = apiPlans.find(item => item.id === declaration.apiPlanId);
  const entry = plan && plan.models.find(model => model.modelKey === declaration.modelKey);
  const keyHits = reg.foldedHitsOf(declaration.modelKey, folded).map(hit => hit.slug);
  const nameHits = entry ? reg.foldedHitsOf(entry.name, folded).map(hit => hit.slug) : [];
  const hits = [...new Set(keyHits.concat(nameHits))];
  if (hits.length) declaredHits += 1;
  console.log(`     ${hits.length ? '✗' : '✓'} ${declaration.apiPlanId}/${declaration.modelKey}（name ${JSON.stringify(entry ? entry.name : null)}）→ 命中 ${hits.length}${hits.length ? ' ' + JSON.stringify(hits) : ''}`);
});
check('   12 条声明在折叠索引下 0 命中（规则变宽没有冒出新的强制映射）',
  declared.length === 12 && declaredHits === 0, `声明 ${declared.length} 条 / 命中 ${declaredHits} 条`);
console.log('');

console.log('③ 对照与边界');
fixturesDoc.controls.forEach(control => {
  const hits = [...new Set(reg.foldedHitsOf(control.modelKey, folded)
    .concat(reg.foldedHitsOf(control.name, folded))
    .map(hit => hit.slug))];
  check(`   ${control.modelKey} / ${JSON.stringify(control.name)} → 0 命中（${control.why}）`, hits.length === 0, JSON.stringify(hits));
});
check(`   MODEL_KEY_RE 拒收冒号/井号/反斜杠/中文方括号/空格等拼法（切分集只需覆盖 schema 允许的分隔符）`,
  fixturesDoc.rejectedShapes.samples.every(sample => !apiSchema.MODEL_KEY_RE.test(sample))
  && fixturesDoc.fixtures.every(fixture => apiSchema.MODEL_KEY_RE.test(fixture.modelKey)));
// `/` 不是 modelKey 的合法字符（它是 registry 别名的写法）：切分集保留它只为兼容带斜杠的探测值，
// 不是为了"给 schema 拒收的拼法加规则" —— 这里把这件事显式测出来。
check('   `/` 不在 modelKey 的 schema 里（它是别名写法）：切分集保留 `/` 不构成额外规则',
  fixturesDoc.nonModelKeyShapes.examples.every(example => !apiSchema.MODEL_KEY_RE.test(example.value))
  && fixturesDoc.nonModelKeyShapes.examples.every(example =>
    reg.foldedHitsOf(example.value, folded).some(hit => hit.slug === example.expectedSlug)));
console.log('');

if (failed) {
  console.error(`❌ ${failed} 项不成立 —— 切分集改动可能改变了真实数据结论，必须人工看`);
  process.exit(1);
}
console.log('✅ 结论不变：7 条命中（已成映射）+ 12 条声明 0 命中；schema 允许的四种命名空间形状全部可探');
