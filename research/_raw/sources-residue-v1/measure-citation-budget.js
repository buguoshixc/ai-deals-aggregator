#!/usr/bin/env node
/**
 * 引文预算实测（t8 / sources-residue-v1 · 复核 NEXT-STEPS §A.4）
 *
 * 作用：按**发布数据**（`api-plans.json`）实测证据绑定的结构上限：
 *   ① 一共多少条引文、每条记录最多几条（`MAX_*` 上限的实测占用）；
 *   ② **模型级绑定**（`field = models.<modelKey>`，不含 variant / dim）多少条；
 *   ③ 其中**输入值与输出值都出现在引文里**的「input/output 顺序对」多少组（B2 判据的作用域）；
 *   ④ 真正绑到**维度**（`…rates.<dim>`）的引文有多少条、覆盖了多少个计价条目；
 *   ⑤ 全库计价条目总数（`models[].rates.<dim>` 非 null 的格子数）—— 分母。
 *
 * 判据口径与 `scripts/lib/api-plan-schema.js` 的 `evidenceBindingProblems` **同源**：
 * 数字定位直接 `require` 它的 `quoteIndexOfNumber`（导出），模型名剥离照抄它未导出的
 * `stripModelNames`（逐字同逻辑，见脚本内注释）。本脚本只读、不写任何数据。
 *
 * 用法（不联网、不读墙上时钟）：
 *   node research/_raw/sources-residue-v1/measure-citation-budget.js --date=2026-10-08
 */

'use strict';

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const opt = name => {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const DATE = opt('date') || '2026-10-08';
const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT = opt('out') || 'research/_raw/sources-residue-v1/citation-budget-measurement.json';

const schema = require(path.join(ROOT, 'scripts', 'lib', 'api-plan-schema'));
const { quoteIndexOfNumber, parseEvidenceBinding, TOKEN_RATE_KEYS } = schema;

/**
 * 与 `scripts/lib/api-plan-schema.js` 的 `stripModelNames()` 同一套规则（未导出，故此处照抄）：
 * 先把模型 key / 显示名 / 别名（长度 ≥ 3）整串删掉再找数字 —— 名字里的版本号不是价格。
 */
function stripModelNames(quote, models) {
  let text = String(quote === null || quote === undefined ? '' : quote);
  const names = [];
  for (const model of models || []) {
    if (!model) continue;
    for (const raw of [model.modelKey, model.name, ...(Array.isArray(model.aliases) ? model.aliases : [])]) {
      const value = String(raw === null || raw === undefined ? '' : raw).trim();
      if (value.length >= 3) names.push(value);
    }
  }
  names.sort((a, b) => b.length - a.length);
  for (const name of new Set(names)) {
    text = text.split(name).join(' ');
    const lower = name.toLowerCase();
    if (lower !== name) {
      let index = text.toLowerCase().indexOf(lower);
      while (index >= 0) {
        text = `${text.slice(0, index)} ${text.slice(index + name.length)}`;
        index = text.toLowerCase().indexOf(lower);
      }
    }
  }
  return text;
}

const published = JSON.parse(fs.readFileSync(path.join(ROOT, 'api-plans.json'), 'utf8'));
const modelsDoc = JSON.parse(fs.readFileSync(path.join(ROOT, 'models.json'), 'utf8'));
const plans = published.plans || published.apiPlans || [];

const perPlan = [];
let evidenceTotal = 0;
let modelLevelBindings = 0;
let modelLevelWithBoth = 0;
let modelLevelInOrder = 0;
let dimBindings = 0;
let dimBoundEntries = 0;   // 被某个维度绑定**认领**的计价格子（去重 (plan, modelKey, dim)）
let rateEntriesTotal = 0;
const boundDims = new Set();

for (const plan of plans) {
  const models = Array.isArray(plan.models) ? plan.models : [];
  const evidence = Array.isArray(plan.evidence) ? plan.evidence : [];
  evidenceTotal += evidence.length;
  const entryKeys = new Set();
  for (const entry of models) {
    for (const dim of TOKEN_RATE_KEYS) {
      const value = entry && entry.rates ? entry.rates[dim] : null;
      if (value === null || value === undefined) continue;
      rateEntriesTotal += 1;
      entryKeys.add(`${entry.modelKey}::${dim}`);
    }
  }
  let planModelLevel = 0;
  for (const item of evidence) {
    const parsed = parseEvidenceBinding(item.field, schema.MODEL_VARIANTS);
    if (!parsed) continue;
    if (parsed.kind === 'model' && !parsed.variant) {
      planModelLevel += 1;
      modelLevelBindings += 1;
      const entry = models.find(m => m && m.modelKey === parsed.modelKey);
      if (!entry || !entry.rates) continue;
      const quote = stripModelNames(item.quote, models);
      const atInput = quoteIndexOfNumber(quote, entry.rates.input);
      const atOutput = quoteIndexOfNumber(quote, entry.rates.output);
      if (atInput >= 0 && atOutput >= 0) {
        modelLevelWithBoth += 1;
        if (atInput < atOutput) modelLevelInOrder += 1;
      }
    } else if (parsed.kind === 'rate' && parsed.dim) {
      dimBindings += 1;
      boundDims.add(parsed.dim);
      if (parsed.modelKey && entryKeys.has(`${parsed.modelKey}::${parsed.dim}`)) dimBoundEntries += 1;
    }
  }
  perPlan.push({
    id: plan.id,
    provider: plan.provider,
    planName: plan.planName,
    evidenceCount: evidence.length,
    modelLevelBindings: planModelLevel,
    modelEntries: models.length,
    rateEntries: entryKeys.size
  });
}

const report = {
  task: 'sources-residue-v1',
  measure: 'citation-budget',
  date: DATE,
  source: 'api-plans.json（发布数据）',
  plans: plans.length,
  evidenceTotal,
  maxEvidencePerPlan: Math.max(...perPlan.map(p => p.evidenceCount)),
  plansAtMaxEvidence: perPlan.filter(p => p.evidenceCount === Math.max(...perPlan.map(q => q.evidenceCount))).length,
  modelLevelBindings,
  modelLevelWithBothInputAndOutput: modelLevelWithBoth,
  modelLevelInputBeforeOutput: modelLevelInOrder,
  dimensionBindings: dimBindings,
  dimensionsCovered: [...boundDims].sort(),
  rateEntriesTotal,
  rateEntriesClaimedByDimensionBinding: dimBoundEntries,
  rateEntriesBoundShare: rateEntriesTotal ? Number((dimBoundEntries / rateEntriesTotal).toFixed(4)) : null,
  modelRegistryModels: Array.isArray(modelsDoc.models) ? modelsDoc.models.length : null,
  perPlan
};

fs.mkdirSync(path.dirname(path.join(ROOT, OUT)), { recursive: true });
fs.writeFileSync(path.join(ROOT, OUT), JSON.stringify(report, null, 2) + '\n', 'utf8');

console.log(`plans=${report.plans} evidence=${evidenceTotal} maxPerPlan=${report.maxEvidencePerPlan}`);
console.log(`modelLevelBindings=${modelLevelBindings} withBothInputAndOutput=${modelLevelWithBoth} inOrder=${modelLevelInOrder}`);
console.log(`dimensionBindings=${dimBindings} dims=${report.dimensionsCovered.join(',')}`);
console.log(`rateEntriesTotal=${rateEntriesTotal} claimedByDimBinding=${dimBoundEntries} share=${report.rateEntriesBoundShare}`);
console.log(`→ ${OUT}`);
