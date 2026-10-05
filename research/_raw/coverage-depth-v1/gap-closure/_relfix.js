/**
 * 把 t3 本轮新增的一条 **API 侧通配声明**（variant: null，覆盖 ernie-5.1 的两个变体）
 * 换成两条**逐变体**声明 —— 不碰任何既有声明、也不改 coverage-targets-selftest.js 的断言。
 *
 * 为什么：`coverage-targets-selftest.js` 的 t25 clause2 断言 `declaredApiEntries === declaredApiEntryCount`
 * （方程里的 B == 声明的**行**数），它只在"没有通配声明"时成立。通配本身是合法形态，
 * 但既然逐变体声明同样真实、且能让既有断言保持成立，就没有理由去动别人的断言。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const registry = require(path.join(ROOT, 'scripts', 'lib', 'model-registry.js'));
const GAPS_FILE = path.join(ROOT, 'scripts', 'data', 'model-registry-gaps.json');
const API_PLANS_FILE = path.join(ROOT, 'api-plans.json');

const gapsDoc = JSON.parse(fs.readFileSync(GAPS_FILE, 'utf8'));
const apiDoc = JSON.parse(fs.readFileSync(API_PLANS_FILE, 'utf8'));
const plan = apiDoc.plans.find(p => p.provider === 'baidu' && p.planName === '千帆模型按量后付费');
if (!plan) throw new Error('找不到百度千帆记录');

const declarations = registry.declarationsList(gapsDoc);
const removed = declarations.filter(d => d.apiPlanId === plan.id && d.modelKey === 'ernie-5.1');
if (removed.length !== 1 || removed[0].variant !== null) {
  throw new Error(`预期恰好 1 条 ernie-5.1 通配声明，实得 ${JSON.stringify(removed)}`);
}
const kept = declarations.filter(d => d !== removed[0]);
const why = '文心当前旗舰；registry 里没有文心归属身份（逐字 / 折叠 / 命名空间后缀都不等）';
const added = plan.models
  .filter(m => m.modelKey === 'ernie-5.1')
  .map(m => ({
    apiPlanId: plan.id,
    modelKey: 'ernie-5.1',
    variant: m.variant,
    reason: 'off-registry-model',
    sourceUrl: plan.sourceUrl,
    note: `官方定价页点名的单一模型（${m.variant} 档）；${why} ⇒ 判过：对不上（不代表它不值得进 registry —— 身份登记属 Workstream B-2 / t8）。`
  }));
if (added.length !== 2) throw new Error(`ernie-5.1 预期 2 个变体，实得 ${added.length}`);

const nextDoc = { ...gapsDoc, declarations: registry.sortDeclarations([...kept, ...added]) };
const problems = registry.validateGaps(nextDoc, {
  plans: JSON.parse(fs.readFileSync(path.join(ROOT, 'plans.json'), 'utf8')).plans,
  links: registry.loadLinks(path.join(ROOT, 'scripts', 'data', 'model-registry-links.json')).doc,
  table: registry.load().table || {},
  apiPlans: apiDoc.plans
});
if (problems.length) {
  problems.slice(0, 10).forEach(p => console.error('  - ' + p));
  throw new Error(`关系层校验未通过（${problems.length} 处）`);
}
const before = new Set(declarations.map(registry.orderKeyOfDeclaration));
const after = new Set(nextDoc.declarations.map(registry.orderKeyOfDeclaration));
const vanished = [...before].filter(k => !after.has(k));
console.log(`声明行数：${declarations.length} → ${nextDoc.declarations.length}（-1 通配 +2 逐变体）`);
console.log(`消失的键：${vanished.length}（应恰好是那条本轮新增的通配键：${vanished.join(' / ')}）`);
fs.writeFileSync(GAPS_FILE, `${JSON.stringify(nextDoc, null, 2)}\n`, 'utf8');
console.log('✅ 已写出 model-registry-gaps.json');
