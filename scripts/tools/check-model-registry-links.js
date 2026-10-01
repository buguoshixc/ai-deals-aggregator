#!/usr/bin/env node
/**
 * v3.0 Stage D：**关系层门禁**（`model-registry-links.json`）。
 *
 * 用法：node scripts/tools/check-model-registry-links.js [--json]
 * 退出码：0 = 关系层合法；1 = 有硬问题。
 *
 * 它查的是"映射本身站不站得住"（判据全在 lib/model-registry.js 的 validateLinks）：
 *   · registrySlug 必须存在于 models.json；
 *   · API 侧 apiPlanId + modelKey 必须真的存在于那条记录；Coding 侧 planId + modelName 必须逐字存在；
 *   · 同一 (apiPlanId, modelKey, variant) 不得映射到两个 registry 模型；
 *   · 引文不许新造（必须逐字来自被引用记录自己的官方引文），没有引文必须显式标成 explicit-mapping + note。
 *
 * **未映射的 modelKey / 套餐模型串不是失败**：它们是事实陈述，逐条打印出来（题面 §6 报告要这个数）。
 */

'use strict';

const fs = require('fs');
const path = require('path');

const reg = require('../lib/model-registry');
const providers = require('../lib/providers');

const ROOT = path.join(__dirname, '..', '..');
const JSON_OUT = process.argv.includes('--json');

function main() {
  const modelsLoad = reg.load();
  const linksLoad = reg.loadLinks();
  const apiPlans = JSON.parse(fs.readFileSync(path.join(ROOT, 'api-plans.json'), 'utf8')).plans || [];
  const plans = JSON.parse(fs.readFileSync(path.join(ROOT, 'plans.json'), 'utf8')).plans || [];
  const providerTable = providers.load().table;
  const developers = Object.values(providerTable).map(entry => String((entry && entry.name) || ''));
  const extraDevelopers = Object.keys((modelsLoad.doc && modelsLoad.doc._developers_extra) || {});

  const problems = [];
  if (linksLoad.missing) problems.push('scripts/data/model-registry-links.json 不存在');
  if (linksLoad.broken) problems.push(`model-registry-links.json 无法解析：${linksLoad.broken}`);
  if (modelsLoad.missing) problems.push('scripts/data/models.json 不存在');
  if (modelsLoad.broken) problems.push(`models.json 无法解析：${modelsLoad.broken}`);
  if (!problems.length) {
    problems.push(...reg.validateRegistry(modelsLoad.table, { developers, extraDevelopers }));
    problems.push(...reg.validateLinks(linksLoad.doc, { table: modelsLoad.table, apiPlans, plans }));
  }

  const coverage = reg.coverageOf({ table: modelsLoad.table, links: linksLoad.doc, apiPlans, plans });
  const candidates = reg.candidatesOf({ table: modelsLoad.table, apiPlans });
  const unmappedApiSet = new Set(coverage.unmappedModelKeys.map(item => `${item.apiPlanId}\u0000${item.modelKey}`));
  const confirmedCandidates = candidates.filter(item => unmappedApiSet.has(`${item.apiPlanId}\u0000${item.modelKey}`));

  if (JSON_OUT) {
    console.log(JSON.stringify({ ok: !problems.length, problems, coverage, candidates: confirmedCandidates.length }, null, 2));
  } else {
    if (problems.length) {
      console.error(`❌ 关系层有 ${problems.length} 处硬问题：`);
      problems.slice(0, 40).forEach(problem => console.error(`  - ${problem}`));
    } else {
      console.log('✅ Model Registry 关系层通过：每条映射都指向真实存在的记录与模型，引文逐字来自记录本身');
    }
    console.log(`   映射：API ${coverage.apiLinks} 条 · Coding ${coverage.codingLinks} 条 · 被引用的模型 ${coverage.linkedModels}/${coverage.models}`);
    console.log(`   未映射的 API modelKey：${coverage.unmappedModelKeys.length} 条`);
    coverage.unmappedModelKeys.slice(0, 20).forEach(item => console.log(`     · ${item.provider} / ${item.modelKey}（记录 ${item.apiPlanId}）`));
    if (coverage.unmappedModelKeys.length > 20) console.log(`     … 另有 ${coverage.unmappedModelKeys.length - 20} 条`);
    console.log(`   未映射的套餐模型串：${coverage.unmappedPlanModels.length} 条（自由文本 name，没有模型键 ⇒ 只能人工逐条判）`);
    coverage.unmappedPlanModels.slice(0, 20).forEach(item => console.log(`     · ${item.provider} / ${item.modelName}（套餐 ${item.planId}）`));
    console.log(`   候选（归一后精确相等，**只供人工 review，绝不写生产映射**）：${confirmedCandidates.length} 条`);
    confirmedCandidates.slice(0, 10).forEach(item => console.log(`     · ${item.modelKey} → ${item.registrySlug}（${item.rule}）`));
  }
  return problems.length ? 1 : 0;
}

process.exit(main());
