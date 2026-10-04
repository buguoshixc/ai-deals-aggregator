/**
 * t26：**折叠规则的覆盖面矩阵**（对抗性扩展）—— 找出"能对上但探测不到"的拼法。
 *
 * 手法：合成一个 registry 身份 `glm-5.3`（+ 别名 `zai-org/GLM-5.3`）与一条**modelKey 写成各种变体**的计价条目，
 * 逐个把这些变体写成 API 侧处置声明，看 `validateGaps()` 是否点名"其实能对上"。
 * **判据只用精确相等类**（本项目硬原则 §40）。
 *
 * 这不是"建议放宽匹配"，而是问：`identityFold()` / `namespaceSuffixes()` 的字符表有没有漏项 ——
 * 漏项意味着门禁能被一种**真实存在的拼法**绕过（抽屉可以留一条缝）。
 *
 * 用法：node research/_raw/t26/spelling-matrix.cjs
 */
'use strict';

const path = require('path');
const reg = require(path.resolve(__dirname, '..', '..', '..', 'scripts', 'lib', 'model-registry.js'));

const table = {
  'glm-5.3': {
    canonicalName: 'GLM-5.3', developer: '智谱AI', owner: null, family: 'GLM',
    aliases: ['zai-org/GLM-5.3'], officialUrl: 'https://z.ai/', status: 'active',
    modelRole: null, releasedAt: null, releaseEvidence: [], freshnessGroup: null, note: null
  }
};

/** 一个变体 → 一条记录（该记录只有这一个条目） */
function planWith(modelKey, name) {
  return [{
    id: 'aaaaaaaaaaaa', provider: 'zhipu', planName: '合成记录', channel: 'standard',
    officialUrl: 'https://z.ai/pricing', sourceUrl: 'https://z.ai/pricing',
    pricing: { currency: 'CNY', unit: 'per_1M_tokens' },
    models: [{ name, modelKey, variant: 'standard', rates: { input: 1, output: 2 } }]
  }];
}

const declarationOf = modelKey => ({
  apiPlanId: 'aaaaaaaaaaaa', modelKey, variant: 'standard', reason: 'off-registry-model',
  sourceUrl: 'https://z.ai/pricing', note: '合成探针'
});

/**
 * 期望"能对上"（⇒ 门禁必须红）的拼法。
 *
 * ⚠️ 探测必须**隔离**：官方显示名统一用与 registry 无关的 "Mystery Model X"，
 * 这样命中只可能来自 modelKey 一侧（第一版矩阵把显示名写成 "GLM 5.3"，
 * 于是每一组都被 name 探针救绿 —— 那是"矩阵设计掩盖了 modelKey 侧的缝"，不是门禁真的严）。
 */
const NEUTRAL_NAME = 'Mystery Model X';
const SHOULD_HIT = [
  ['逐字 slug', 'glm-5.3', NEUTRAL_NAME],
  ['命名空间 . 前缀', 'zai-org.glm-5.3', NEUTRAL_NAME],
  ['命名空间 / 前缀', 'zai-org/glm-5.3', NEUTRAL_NAME],
  ['命名空间 _ 前缀', 'zai-org_glm-5.3', NEUTRAL_NAME],
  ['命名空间 空格 前缀', 'zai-org glm-5.3', NEUTRAL_NAME],
  ['命名空间 - 前缀', 'zai-org-glm-5.3', NEUTRAL_NAME],
  ['全角句点', 'zai-org．glm-5.3', NEUTRAL_NAME],
  ['全角斜杠', 'zai-org／glm-5.3', NEUTRAL_NAME],
  ['大小写', 'GLM-5.3', NEUTRAL_NAME],
  ['全角字母', 'ＧＬＭ－５．３', NEUTRAL_NAME],
  ['别名原文', 'zai-org/GLM-5.3', NEUTRAL_NAME]
];

/** 官方显示名一侧（modelKey 故意对不上，隔离 name 探针） */
const NAME_SIDE = [
  ['显示名 = slug', 'mystery-1', 'GLM 5.3'],
  ['显示名带半角括注', 'mystery-1', 'GLM 5.3 (official modelId: glm-5.3)'],
  ['显示名带全角括注', 'mystery-1', 'GLM 5.3（官方 modelId: glm-5.3）'],
  ['显示名大小写/全角', 'mystery-1', 'ＧＬＭ－５．３'],
  ['显示名带命名空间', 'mystery-1', 'zai-org/GLM-5.3']
];

/** 可能被漏掉的拼法（如果这里绿灯，就是门禁的一条缝） */
const SUSPECT = [
  ['冒号命名空间', 'zai-org:GLM-5.3', NEUTRAL_NAME],
  ['中间点命名空间', 'zai-org·glm-5.3', NEUTRAL_NAME],
  ['全角冒号命名空间', 'zai-org：glm-5.3', NEUTRAL_NAME],
  ['井号命名空间', 'zai-org#glm-5.3', NEUTRAL_NAME],
  ['双冒号命名空间', 'zai-org::glm-5.3', NEUTRAL_NAME],
  ['反斜杠命名空间', 'zai-org\\glm-5.3', NEUTRAL_NAME],
  ['竖线命名空间', 'zai-org|glm-5.3', NEUTRAL_NAME],
  ['逗号命名空间', 'zai-org,glm-5.3', NEUTRAL_NAME],
  ['波浪线命名空间', 'zai-org~glm-5.3', NEUTRAL_NAME],
  ['末尾中文方括号（modelKey）', 'glm-5.3【官方】', NEUTRAL_NAME],
  ['末尾星号（modelKey）', 'glm-5.3*', NEUTRAL_NAME]
];

const results = [];
function testGroup(label, cases, expectHit) {
  console.log(`\n=== ${label} ===`);
  for (const [name, modelKey, displayName] of cases) {
    const apiPlans = planWith(modelKey, displayName);
    const problems = reg.validateGaps(
      { schemaVersion: 2, declarations: [declarationOf(modelKey)] },
      { plans: [], table, apiPlans }
    );
    const hit = problems.some(problem => problem.includes('折叠后精确落到 registry 身份'));
    const otherProblems = problems.filter(problem => !problem.includes('折叠后精确落到 registry 身份'));
    const ok = expectHit ? hit : !hit;
    results.push({ group: label, name, modelKey, displayName, hit, expectHit, ok, other: otherProblems.length });
    console.log(`  ${ok ? '✓' : '✗'} ${name.padEnd(18)} modelKey=${JSON.stringify(modelKey).padEnd(24)} name=${JSON.stringify(displayName).padEnd(40)} 命中=${hit}`);
  }
}

testGroup('modelKey 侧：应当命中（漏了就是真缺陷）', SHOULD_HIT, true);
testGroup('官方显示名侧：应当命中', NAME_SIDE, true);
testGroup('可疑拼法（命中=已覆盖；绿灯=门禁的一条缝）', SUSPECT, false);

const missed = results.filter(row => row.expectHit && !row.hit);
const gaps = results.filter(row => !row.expectHit && row.hit);
console.log(`\n应当命中却漏掉：${missed.length} 条${missed.length ? ` —— ${missed.map(row => `${row.name}(${row.modelKey} / ${row.displayName})`).join('；')}` : ''}`);
console.log(`可疑拼法里被覆盖的（收紧 = 门禁更严）：${gaps.length} 条${gaps.length ? ` —— ${gaps.map(row => row.name).join('；')}` : ''}`);
require('fs').writeFileSync(path.join(__dirname, 'spelling-matrix-result.json'), `${JSON.stringify(results, null, 2)}\n`, 'utf8');
process.exit(missed.length ? 1 : 0);
