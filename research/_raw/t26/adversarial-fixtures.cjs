/**
 * t26 对抗 fixture 电池（acceptance ①）与接线完整性（acceptance ④）。
 *
 * **共享 worktree 一个字节都不改**：先把仓库复制到 %TEMP%/t26/repo（排除 .git / node_modules / dist*），
 * 之后每一组 fixture 都只在该副本的**数据文件**上做变异，跑完立刻从内存快照还原。
 *
 * 用法：node research/_raw/t26/adversarial-fixtures.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const REPO = path.resolve(__dirname, '..', '..', '..');
const WORK = path.join(os.tmpdir(), 't26', 'repo');
const DATA = {
  apiPlans: 'api-plans.json',
  links: 'scripts/data/model-registry-links.json',
  gaps: 'scripts/data/model-registry-gaps.json'
};

/* ---------------- 复制（每次运行都重新复制，避免与并发编辑的文件混出"半新半旧"的副本） ---------------- */
function copyRepo() {
  // ⚠️ 必须整棵树从**同一个瞬间**复制：上一次踩过的坑 —— 复用旧副本时 providers.json 还是上一轮的旧文件，
  // 于是对照组 C0 被 16 条与本次审查无关的错判红（那是副本陈旧，不是被测判据的缺陷）。
  if (fs.existsSync(WORK)) fs.rmSync(WORK, { recursive: true, force: true });
  fs.mkdirSync(WORK, { recursive: true });
  const skip = new Set(['.git', 'node_modules']);
  const walk = (from, to) => {
    fs.mkdirSync(to, { recursive: true });
    for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
      if (skip.has(entry.name)) continue;
      if (entry.name.startsWith('dist')) continue;
      const src = path.join(from, entry.name);
      const dst = path.join(to, entry.name);
      if (entry.isDirectory()) walk(src, dst);
      else if (entry.isFile()) fs.copyFileSync(src, dst);
    }
  };
  walk(REPO, WORK);
}

copyRepo();
console.log('副本：', WORK);

const pristine = {};
for (const [name, rel] of Object.entries(DATA)) pristine[name] = fs.readFileSync(path.join(WORK, rel), 'utf8');

const readWork = rel => JSON.parse(fs.readFileSync(path.join(WORK, rel), 'utf8'));
const writeWork = (name, value) => fs.writeFileSync(path.join(WORK, DATA[name]), `${JSON.stringify(value, null, 2)}\n`, 'utf8');

function restore() {
  for (const [name, rel] of Object.entries(DATA)) fs.writeFileSync(path.join(WORK, rel), pristine[name], 'utf8');
}

/** 跑一个门禁，返回 {status, out} */
function run(args) {
  try {
    const out = execFileSync(process.execPath, args, { cwd: WORK, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { status: 0, out };
  } catch (error) {
    return {
      status: typeof error.status === 'number' ? error.status : -1,
      out: `${error.stdout || ''}${error.stderr || ''}${error.message || ''}`
    };
  }
}

const planById = new Map(readWork(DATA.apiPlans).plans.map(p => [p.id, p]));
const API_GAP_KEY_ORDER = ['apiPlanId', 'modelKey', 'variant', 'reason', 'sourceUrl', 'note'];
const gapSortKey = d => (d.apiPlanId !== undefined
  ? `api\u0000${d.apiPlanId}\u0000${d.modelKey}\u0000${d.variant === null || d.variant === undefined ? '' : d.variant}`
  : `coding\u0000${d.planId}\u0000${d.modelName}`);

/** 按 API_GAP_KEY_ORDER 造一条 API 侧声明并插到规范序位置 */
function declare(gaps, fields) {
  const declaration = {};
  for (const key of API_GAP_KEY_ORDER) declaration[key] = fields[key];
  gaps.declarations.push(declaration);
  gaps.declarations.sort((a, b) => (gapSortKey(a) < gapSortKey(b) ? -1 : gapSortKey(a) > gapSortKey(b) ? 1 : 0));
}

/** 删掉某条 API 映射（links 的规范序在删除后自然保持） */
function dropApiLink(links, apiPlanId, modelKey) {
  links.links = links.links.filter(link => !(link.apiPlanId === apiPlanId && link.modelKey === modelKey));
}

const results = [];

function fixture(id, title, expectRed, mutate, expectFragment) {
  restore();
  const note = mutate();
  const { status, out } = run(['scripts/validate.js', '--strict']);
  // validate.js 的失败清单是 `  - ...` 形状（不是 ✗），所以按**整段输出**找关键信息
  const matched = expectFragment
    ? out.split('\n').filter(line => line.includes(expectFragment)).map(line => line.trim())
    : [];
  const fragmentHit = expectFragment ? matched.length > 0 : true;
  const failures = out.split('\n').map(line => line.trim()).filter(line => line.startsWith('- '));
  results.push({
    id, title, expectRed, status, red: status !== 0, fragmentHit,
    matched: matched.slice(0, 2),
    detail: failures.slice(0, 2).join(' | ').slice(0, 220),
    note: note || ''
  });
  console.log(`[${id}] ${title}`);
  console.log(`     期望=${expectRed ? '红' : '绿'} 实际=${status === 0 ? '绿(exit 0)' : `红(exit ${status})`} 关键信息命中=${fragmentHit}`);
  if (matched.length) console.log(`     → ${matched[0].slice(0, 200)}`);
  else if (failures.length) console.log(`     ${failures.slice(0, 2).join(' | ').slice(0, 200)}`);
  restore();
}

/* ================================================================== */
console.log('\n=== 对照组（真实数据，不许动） ===');
fixture('C0', '未变异的副本：validate --strict 必须绿', false, () => '', null);

/* ================================================================== */
console.log('\n=== 对抗组：把「其实能对上」的条目写成处置声明 ===');

fixture('F1', '命名空间前缀：声明 zai-org.glm-5.3（去掉 zai-org. 就是 registry 的 glm-5.3）', true, () => {
  const links = readWork(DATA.links);
  const gaps = readWork(DATA.gaps);
  dropApiLink(links, '8a26562011f2', 'zai-org.glm-5.3');
  declare(gaps, {
    apiPlanId: '8a26562011f2', modelKey: 'zai-org.glm-5.3', variant: 'standard', reason: 'off-registry-model',
    sourceUrl: planById.get('8a26562011f2').officialUrl, note: '对抗 fixture：试图用命名空间前缀把能对上的身份藏进处置表'
  });
  writeWork('links', links); writeWork('gaps', gaps);
  return '删掉该条映射，改成 API 侧处置声明';
}, '折叠后精确落到 registry 身份');

fixture('F2', '命名空间后缀：声明 qwen.qwen3.8-27b（后缀 qwen3.8-27b 就是 registry 身份）', true, () => {
  const links = readWork(DATA.links);
  const gaps = readWork(DATA.gaps);
  dropApiLink(links, '036c5f09561e', 'qwen.qwen3.8-27b');
  declare(gaps, {
    apiPlanId: '036c5f09561e', modelKey: 'qwen.qwen3.8-27b', variant: 'standard', reason: 'off-registry-model',
    sourceUrl: planById.get('036c5f09561e').officialUrl, note: '对抗 fixture：命名空间后缀'
  });
  writeWork('links', links); writeWork('gaps', gaps);
  return '删掉该条映射，改成 API 侧处置声明';
}, '折叠后精确落到 registry 身份');

fixture('F3', '分隔符折叠：声明 glm-5p3（折叠后 == registry 的 glm-5.3）', true, () => {
  const links = readWork(DATA.links);
  const gaps = readWork(DATA.gaps);
  dropApiLink(links, '929a1f3ec46c', 'glm-5p3');
  declare(gaps, {
    apiPlanId: '929a1f3ec46c', modelKey: 'glm-5p3', variant: 'standard', reason: 'off-registry-model',
    sourceUrl: planById.get('929a1f3ec46c').officialUrl, note: '对抗 fixture：p 代替点号的折叠写法'
  });
  writeWork('links', links); writeWork('gaps', gaps);
  return '删掉该条映射，改成 API 侧处置声明';
}, '折叠后精确落到 registry 身份');

fixture('F4', '大小写 + 全角 + NFKC：把官方显示名改成「ＫＩＭＩ　Ｋ３」', true, () => {
  const apiPlans = readWork(DATA.apiPlans);
  const plan = apiPlans.plans.find(p => p.id === '929a1f3ec46c');
  const entry = plan.models.find(m => m.modelKey === 'ember-1');
  entry.name = 'ＫＩＭＩ　Ｋ３';
  writeWork('apiPlans', apiPlans);
  return '只改记录自己的官方显示名（modelKey 仍是 ember-1）';
}, '折叠后精确落到 registry 身份');

fixture('F5', '官方显示名带末尾括注：「Kimi K3（官方 modelId: fireworks/kimi-k3）」', true, () => {
  const apiPlans = readWork(DATA.apiPlans);
  const plan = apiPlans.plans.find(p => p.id === '929a1f3ec46c');
  plan.models.find(m => m.modelKey === 'ember-1').name = 'Kimi K3（官方 modelId: fireworks/kimi-k3）';
  writeWork('apiPlans', apiPlans);
  return '只改官方显示名（末尾括注应被折叠规则抹掉后命中）';
}, '折叠后精确落到 registry 身份');

fixture('F6', 'registry 别名命中：把声明改成 registry 别名原文 zai-org/GLM-5.3', true, () => {
  const apiPlans = readWork(DATA.apiPlans);
  const gaps = readWork(DATA.gaps);
  const plan = apiPlans.plans.find(p => p.id === '929a1f3ec46c');
  const entry = plan.models.find(m => m.modelKey === 'ember-1');
  entry.modelKey = 'zai-org/GLM-5.3';
  const declaration = gaps.declarations.find(d => d.apiPlanId === '929a1f3ec46c' && d.modelKey === 'ember-1');
  declaration.modelKey = 'zai-org/GLM-5.3';
  writeWork('apiPlans', apiPlans); writeWork('gaps', gaps);
  return '记录条目与声明同步改名成 registry 别名原文';
}, '折叠后精确落到 registry 身份');

fixture('F7', '通配 variant 掩盖：一个变体仍被映射，声明却写 variant=null', true, () => {
  const links = readWork(DATA.links);
  const gaps = readWork(DATA.gaps);
  const wildcard = links.links.find(link => link.apiPlanId === '646f01c662e6' && link.modelKey === 'glm-4.5v');
  wildcard.variant = 'long_context'; // 只留 long_context 被映射；standard 试图用通配声明盖住
  declare(gaps, {
    apiPlanId: '646f01c662e6', modelKey: 'glm-4.5v', variant: null, reason: 'off-registry-model',
    sourceUrl: planById.get('646f01c662e6').officialUrl, note: '对抗 fixture：通配声明试图盖住已被映射的那一个变体'
  });
  writeWork('links', links); writeWork('gaps', gaps);
  return '通配声明展开后包含已被映射的 long_context';
}, '已经在关系层里有映射');

fixture('F8', '同一 modelKey 多 variant：standard 已被通配映射认领，再显式声明 standard', true, () => {
  const gaps = readWork(DATA.gaps);
  declare(gaps, {
    apiPlanId: '646f01c662e6', modelKey: 'glm-4.5v', variant: 'standard', reason: 'off-registry-model',
    sourceUrl: planById.get('646f01c662e6').officialUrl, note: '对抗 fixture：显式 variant 声明试图与既有映射双重记账'
  });
  writeWork('gaps', gaps);
  return '声明一条已被通配映射认领的 identity';
}, '已经在关系层里有映射');

fixture('F9', '官方显示名直命 registry slug：把声明条目的显示名改成「GLM-5.3」', true, () => {
  const apiPlans = readWork(DATA.apiPlans);
  const plan = apiPlans.plans.find(p => p.id === '929a1f3ec46c');
  plan.models.find(m => m.modelKey === 'ember-1').name = 'GLM-5.3';
  writeWork('apiPlans', apiPlans);
  return 'modelKey 不变（仍对不上），只有官方显示名能对上';
}, '折叠后精确落到 registry 身份');

fixture('F10', '冒号命名空间前缀：新增条目 zai-org:GLM-5.3（与 registry 的 glm-5.3 只差分隔符）并声明它', true, () => {
  const apiPlans = readWork(DATA.apiPlans);
  const gaps = readWork(DATA.gaps);
  const plan = apiPlans.plans.find(p => p.id === '929a1f3ec46c');
  const template = plan.models[0];
  plan.models.push({ ...template, modelKey: 'zai-org:GLM-5.3', name: 'Mystery Model X' });
  declare(gaps, {
    apiPlanId: '929a1f3ec46c', modelKey: 'zai-org:GLM-5.3', variant: 'standard', reason: 'off-registry-model',
    sourceUrl: plan.officialUrl, note: '对抗 fixture：冒号分隔的命名空间前缀 —— 看折叠规则认不认这一个分隔符'
  });
  writeWork('apiPlans', apiPlans); writeWork('gaps', gaps);
  return '对照 "能对上就必须写映射"：这一条其实是 glm-5.3';
}, '折叠后精确落到 registry 身份');

fixture('F11', '空格命名空间前缀：（隔离显示名）新增条目 zai-org GLM-5.3 并声明它', true, () => {
  const apiPlans = readWork(DATA.apiPlans);
  const gaps = readWork(DATA.gaps);
  const plan = apiPlans.plans.find(p => p.id === '929a1f3ec46c');
  plan.models.push({ ...plan.models[0], modelKey: 'zai-org GLM-5.3', name: 'Mystery Model X' });
  declare(gaps, {
    apiPlanId: '929a1f3ec46c', modelKey: 'zai-org GLM-5.3', variant: 'standard', reason: 'off-registry-model',
    sourceUrl: plan.officialUrl, note: '对抗 fixture：空格分隔的命名空间前缀'
  });
  writeWork('apiPlans', apiPlans); writeWork('gaps', gaps);
  return '空格分隔的命名空间前缀';
}, '折叠后精确落到 registry 身份');

fixture('C1', '对照组（与身份无关的改动）：把一条真 off-registry 声明的 note 改写一遍', false, () => {
  const gaps = readWork(DATA.gaps);
  const declaration = gaps.declarations.find(d => d.apiPlanId === '929a1f3ec46c' && d.modelKey === 'ember-1');
  declaration.note = '对抗 fixture 对照组：只改理由的措辞，不碰任何身份 —— 门禁不该因此变红。';
  writeWork('gaps', gaps);
  return '只改 note 措辞';
}, null);

/* ================================================================== */
console.log('\n=== 接线完整性（acceptance ④）：删掉一条 API 侧声明，六个门禁必须全部变红 ===');
restore();
{
  const gaps = readWork(DATA.gaps);
  gaps.declarations = gaps.declarations.filter(d => !(d.apiPlanId === '929a1f3ec46c' && d.modelKey === 'ember-1'));
  writeWork('gaps', gaps);
}
const wiringGates = [
  ['validate --strict', ['scripts/validate.js', '--strict']],
  ['check:models:reproducible', ['scripts/tools/check-models-reproducible.js']],
  ['check:model-registry-links', ['scripts/tools/check-model-registry-links.js']],
  ['report:coverage', ['scripts/tools/coverage-report.js', `--json=${path.join(WORK, 't26-coverage.json')}`]],
  ['selftest:model-registry', ['scripts/tools/models-selftest.js']],
  ['build-local', ['scripts/tools/build-local.js', `--out=${path.join(WORK, 'dist-t26')}`]]
];
const wiring = [];
for (const [label, args] of wiringGates) {
  const { status, out } = run(args);
  const fragment = out.includes('既没有 registry 映射')
    || out.includes('都没有任何结局')
    || out.includes('未覆盖') || out.includes('uncovered')
    || out.includes('有关系层') || out.includes('处置');
  wiring.push({ label, status, red: status !== 0, fragment });
  console.log(`  ${status !== 0 ? '✓' : '✗'} ${label}: exit=${status}${status !== 0 ? '' : '  ← 不变红（漏接线！）'}`);
}
restore();

/* ================================================================== */
console.log('\n=== 汇总 ===');
const adversarial = results.filter(r => !r.id.startsWith('C'));
const controls = results.filter(r => r.id.startsWith('C'));
const badAdversarial = adversarial.filter(r => !r.red || !r.fragmentHit);
const badControls = controls.filter(r => r.red);
const badWiring = wiring.filter(w => !w.red);
console.log(`对抗组 ${adversarial.length} 组：全部红且命中反绕过信息 = ${badAdversarial.length === 0 ? '是' : '否'}`);
for (const r of adversarial) console.log(`  ${r.red && r.fragmentHit ? '✓' : '✗'} ${r.id} ${r.title}`);
console.log(`对照组 ${controls.length} 组：全部绿 = ${badControls.length === 0 ? '是' : '否'}`);
for (const r of controls) console.log(`  ${r.red ? '✗' : '✓'} ${r.id} ${r.title}`);
console.log(`接线 ${wiring.length} 个门禁：全部变红 = ${badWiring.length === 0 ? '是' : '否'}`);
for (const w of wiring) console.log(`  ${w.red ? '✓' : '✗'} ${w.label} exit=${w.status}`);

const verdict = badAdversarial.length === 0 && badControls.length === 0 && badWiring.length === 0;
console.log(`\n${verdict ? '✅ 反绕过牙有真牙、对照组不误伤、接线无缺口' : '❌ 存在未达标项，见上'}`);
fs.writeFileSync(path.join(__dirname, 'fixtures-result.json'),
  `${JSON.stringify({ results, wiring, verdict }, null, 2)}\n`, 'utf8');
process.exit(verdict ? 0 : 1);
