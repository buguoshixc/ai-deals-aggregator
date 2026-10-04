/**
 * t26 单元级探针（acceptance ②c「拿不到表也放行」+ 反绕过牙的对照组）。
 *
 * 这里**直接调用** `scripts/lib/model-registry.js` 的判据函数（只 require、不写任何文件），
 * 用**内存里的合成文档**把每一种输入缺失的路径走一遍 —— 目的是问"有没有一条路能让它静默通过"。
 *
 * 用法：node research/_raw/t26/unit-probes.cjs
 */
'use strict';

const path = require('path');
const reg = require(path.resolve(__dirname, '..', '..', '..', 'scripts', 'lib', 'model-registry.js'));

const rows = [];
const probe = (name, ok, detail) => {
  rows.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` —— ${detail}` : ''}`);
};

/* ---------------- 合成输入 ---------------- */
const table = {
  'glm-5.3': { canonicalName: 'GLM-5.3', developer: '智谱AI', owner: null, family: 'GLM', aliases: ['zai-org/GLM-5.3'], officialUrl: 'https://z.ai/', status: 'active', modelRole: null, releasedAt: null, releaseEvidence: [], freshnessGroup: null, note: null },
  'kimi-k3': { canonicalName: 'Kimi K3', developer: '月之暗面', owner: null, family: 'Kimi', aliases: [], officialUrl: 'https://platform.moonshot.cn/', status: 'active', modelRole: null, releasedAt: null, releaseEvidence: [], freshnessGroup: null, note: null }
};
const apiPlans = [{
  id: 'aaaaaaaaaaaa', provider: 'zhipu', planName: '合成记录', channel: 'standard',
  officialUrl: 'https://z.ai/pricing', sourceUrl: 'https://z.ai/pricing', pricing: { currency: 'CNY', unit: 'per_1M_tokens' },
  models: [
    { name: 'GLM 5.3', modelKey: 'glm-5.3', variant: 'standard', rates: { input: 1, output: 2 } },
    { name: 'GLM 5.3', modelKey: 'zai-org/GLM-5.3', variant: 'standard', rates: { input: 1, output: 2 } },
    { name: 'GLM 5.3', modelKey: 'zai-org.glm-5.3', variant: 'standard', rates: { input: 1, output: 2 } },
    { name: 'GLM 5.3', modelKey: 'glm-5p3', variant: 'standard', rates: { input: 1, output: 2 } },
    { name: 'Kimi K3', modelKey: 'moonshot.kimi-k3', variant: 'standard', rates: { input: 1, output: 2 } },
    { name: 'ＫＩＭＩ　Ｋ３', modelKey: 'mystery-1', variant: 'standard', rates: { input: 1, output: 2 } },
    { name: 'Ember-1', modelKey: 'ember-1', variant: 'standard', rates: { input: 1, output: 2 } },
    { name: 'Ember 9', modelKey: 'vendor.ember-9', variant: 'standard', rates: { input: 1, output: 2 } }
  ]
}];

const declarationOf = (modelKey, variant = 'standard') => ({
  apiPlanId: 'aaaaaaaaaaaa', modelKey, variant, reason: 'off-registry-model',
  sourceUrl: 'https://z.ai/pricing', note: '合成探针：试图用处置声明绕过映射'
});
const gapsOf = declarations => ({ schemaVersion: 2, declarations });

/* ---------------- 1) 反绕过 + 对照 ---------------- */
console.log('=== 反绕过（合成，单元级）===');
for (const [label, modelKey, expectRed] of [
  ['逐字等于 registry slug', 'glm-5.3', true],
  ['命名空间前缀', 'zai-org.glm-5.3', true],
  ['分隔符折叠', 'glm-5p3', true],
  ['registry 别名原文', 'zai-org/GLM-5.3', true],
  ['点号命名空间（后缀命中）', 'zai-org.glm-5.3', true],
  ['对照组：真 off-registry 键', 'ember-1', false],
  ['对照组：真 off-registry 键（带命名空间）', 'vendor.ember-9', false]
]) {
  const problems = reg.validateGaps(gapsOf([declarationOf(modelKey)]), { plans: [], table, apiPlans });
  const hit = problems.some(p => p.includes('折叠后精确落到 registry 身份'));
  probe(`${label}「${modelKey}」⇒ ${expectRed ? '红（点名折叠命中）' : '绿（对照组）'}`,
    expectRed ? hit : problems.length === 0,
    problems.slice(0, 1).join('').slice(0, 120));
}

/* ---------------- 2) 官方显示名探针（只改 name，不动 modelKey） ---------------- */
console.log('\n=== 官方显示名探针（modelKey 对不上、只有 name 能对上）===');
{
  const plans = JSON.parse(JSON.stringify(apiPlans));
  plans[0].models.find(m => m.modelKey === 'mystery-1').name = 'Kimi K3';
  const problems = reg.validateGaps(gapsOf([declarationOf('mystery-1')]), { plans: [], table, apiPlans: plans });
  probe('name「Kimi K3」折叠命中 registry ⇒ 红', problems.some(p => p.includes('Kimi K3') && p.includes('kimi-k3')),
    problems.slice(0, 1).join('').slice(0, 140));
  const plans2 = JSON.parse(JSON.stringify(apiPlans));
  plans2[0].models.find(m => m.modelKey === 'mystery-1').name = 'Ember 9';
  const problems2 = reg.validateGaps(gapsOf([declarationOf('mystery-1')]), { plans: [], table, apiPlans: plans2 });
  probe('name「Ember 9」对不上任何身份 ⇒ 绿（对照组）', problems2.length === 0, problems2.slice(0, 1).join('').slice(0, 140));
}

/* ---------------- 3) 输入缺失：有没有"拿不到表也放行" ---------------- */
console.log('\n=== 输入缺失路径（fail-closed 探针）===');
{
  const problems = reg.validateGaps(gapsOf([declarationOf('ember-1')]), { plans: [] });
  probe('不传 table（声明表非空）⇒ 红「没有拿到 registry 表」',
    problems.some(p => p.includes('没有拿到 registry 表')), problems.slice(0, 1).join('').slice(0, 100));
}
{
  const problems = reg.validateGaps(gapsOf([declarationOf('ember-1')]), { plans: [], table });
  probe('不传 apiPlans（有 API 侧声明）⇒ 红「没有拿到 apiPlans」',
    problems.some(p => p.includes('没有拿到 apiPlans')), problems.slice(0, 1).join('').slice(0, 100));
}
{
  const problems = reg.validateGaps(gapsOf([declarationOf('ember-1')]), { plans: [], table, apiPlans });
  probe('对照组：输入齐全 + 真 off-registry 键 ⇒ 绿', problems.length === 0, problems.slice(0, 1).join('').slice(0, 120));
}
{
  // validateLinks：空 table 时**跳过** API 侧完整性（文件里写明的设计：空表只产噪音）。
  // 这一条只说明"单独用 validateLinks 不够"—— 所有生产调用点都同时调 validateGaps（见下一条与 t26 的接线证据）。
  const links = { schemaVersion: 2, links: [{ registrySlug: 'glm-5.3', apiPlanId: 'aaaaaaaaaaaa', modelKey: 'glm-5.3', variant: 'standard', basis: 'explicit-mapping', evidence: [], note: 'x' }] };
  const withEmpty = reg.validateLinks(links, { table: {}, apiPlans });
  const withTable = reg.validateLinks(links, { table, apiPlans, gaps: gapsOf([]) });
  probe('validateLinks 空表：不产 API 完整性错（设计如此，文档已写明）', !withEmpty.some(p => p.includes('既没有 registry 映射')),
    `空表 ${withEmpty.length} 条 / 非空表 ${withTable.length} 条`);
  probe('validateLinks 非空表 + 未覆盖的条目 ⇒ 红（点名两个出口文件）',
    withTable.some(p => p.includes('既没有 registry 映射') && p.includes('model-registry-gaps.json')),
    withTable.slice(0, 1).join('').slice(0, 140));
}
{
  // 一条 identity 合法、reason 非法的声明：validateLinks 仍然把它当成"有结局"（它只读 identity），
  // 所以门禁绿不绿取决于**每个调用点都调 validateGaps**。这里钉住这个事实 + 说明接线证据见 fixtures-result.json。
  const bad = declarationOf('ember-1');
  bad.reason = 'pool';
  const soloPlan = [{ ...apiPlans[0], models: apiPlans[0].models.filter(m => m.modelKey === 'ember-1') }];
  const linkProblems = reg.validateLinks({ schemaVersion: 2, links: [] }, { table, apiPlans: soloPlan, gaps: gapsOf([bad]) });
  const gapProblems = reg.validateGaps(gapsOf([bad]), { plans: [], table, apiPlans: soloPlan });
  probe('identity 合法但 reason 非法的声明：validateLinks 视其为"已覆盖"（红在 validateGaps 一侧）',
    !linkProblems.some(p => p.includes('既没有 registry 映射')) && gapProblems.some(p => p.includes('reason 非法')),
    `links ${linkProblems.length} 条（应只剩"关系层没写"那一条）/ gaps ${gapProblems.length} 条`);
}
{
  const problems = reg.validateLinks({ schemaVersion: 2, links: [] }, { table, apiPlans, gaps: gapsOf([]) });
  probe('关系层为空而 registry 非空 ⇒ 红（"这不是干净，是没写"）',
    problems.some(p => p.includes('是关系层没写')), problems.slice(0, 1).join('').slice(0, 110));
}

console.log(`\n${rows.every(row => row.ok) ? '✅ 单元探针全部符合预期（含 3 个对照组）' : '❌ 有探针不符合预期'}`);
require('fs').writeFileSync(path.join(__dirname, 'unit-probes-result.json'), `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
process.exit(rows.every(row => row.ok) ? 0 : 1);
