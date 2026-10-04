#!/usr/bin/env node
/**
 * v3.0 Stage D：**关系层门禁**（`model-registry-links.json` + `model-registry-gaps.json`）。
 *
 * 用法：node scripts/tools/check-model-registry-links.js [--json]
 * 退出码：0 = 关系层合法且套餐侧覆盖完整；1 = 有硬问题。
 *
 * 它查三件事：
 *   ① **映射本身站不站得住**（判据在 lib/model-registry.js 的 validateLinks）：
 *      registrySlug 必须存在于 models.json；API 侧 apiPlanId + modelKey 必须真的存在于那条记录；
 *      Coding 侧 planId + modelName 必须逐字存在；**一条 source pricing identity 至多归属一个 registry 模型**
 *      （判据是 link 展开后的 `(apiPlanId, modelKey, variant)` 集合：`variant: null` 展开成该 modelKey
 *      在这条记录里的全部真实变体，所以通配 null 与显式 standard 撞车必红；认领集合不相交的
 *      合法不同变体分属两个 slug 是允许的）；同一 slug 的冗余重复认领也红；
 *      引文不许新造（必须逐字来自被引用记录自己的官方引文），没有引文必须显式标成 explicit-mapping + note。
 *   ② **处置登记站不站得住**（validateGaps）：`plans.json` 里"不对应单一模型身份"的模型串
 *      （模型池 / 系列名 / 一个串多个模型 / registry 没有的身份 / 图像语音资源）必须在
 *      `scripts/data/model-registry-gaps.json` 里逐条登记理由；modelName / role 必须逐字对得上数据，
 *      reason 与 role 必须互为充要，sourceUrl 必须是该套餐自己的官方页。
 *   ③ **两侧覆盖完整，同一原则**（validatePlanModelCoverage + validateLinks 的 API 侧完整性）：
 *      · Coding 侧：任何一个模型串若既没有映射、又没有登记，**就是硬失败** —— 不许静默留空，
 *        也不许把"没判过"当成"不需要判"；
 *      · API 侧：任何一条计价条目（真实 source pricing identity）若没有被任何映射认领，同样是硬失败 ——
 *        **删掉一条必需的 registry→API 映射，本脚本必须 exit≠0**（审计 M09：原来这里 exit 0，
 *        真红的是 models-selftest.js，守备范围与文件名给人的印象不一致）。
 *
 * 本脚本还扫**手写 JSON 的原文**：`scripts/data/models.json` 里重复的顶层 slug 键
 * （`JSON.parse` 会静默只留最后一条，任何基于 parse 结果的判据都看不见它）。
 *
 * 仍然**不是失败**的是：套餐模型串被明确登记为"不对应单一模型身份"（它连理由一起打印出来）。
 * 未映射的计价条目不再是"安静的一行"—— 它是硬问题（见 ③）。
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
  const gapsLoad = reg.loadGaps();
  const apiPlans = JSON.parse(fs.readFileSync(path.join(ROOT, 'api-plans.json'), 'utf8')).plans || [];
  const plans = JSON.parse(fs.readFileSync(path.join(ROOT, 'plans.json'), 'utf8')).plans || [];
  const providerTable = providers.load().table;
  const developers = Object.values(providerTable).map(entry => String((entry && entry.name) || ''));
  const extraDevelopers = Object.keys((modelsLoad.doc && modelsLoad.doc._developers_extra) || {});

  const problems = [];
  if (linksLoad.missing) problems.push('scripts/data/model-registry-links.json 不存在');
  if (linksLoad.broken) problems.push(`model-registry-links.json 无法解析：${linksLoad.broken}`);
  if (gapsLoad.missing) problems.push('scripts/data/model-registry-gaps.json 不存在 —— 套餐侧模型串的处置登记表是必填来源文件（一条串都不许漏判）');
  if (gapsLoad.broken) problems.push(`model-registry-gaps.json 无法解析：${gapsLoad.broken}`);
  if (modelsLoad.missing) problems.push('scripts/data/models.json 不存在');
  if (modelsLoad.broken) problems.push(`models.json 无法解析：${modelsLoad.broken}`);
  if (!problems.length) {
    // `duplicateKeys` 来自 load() 对**原文**的扫描（JSON.parse 看不见重复的顶层 slug 键）
    problems.push(...reg.validateRegistry(modelsLoad.table, {
      developers, extraDevelopers, duplicateKeys: modelsLoad.duplicateKeys
    }));
    problems.push(...reg.validateLinks(linksLoad.doc, { table: modelsLoad.table, apiPlans, plans }));
    problems.push(...reg.validateGaps(gapsLoad.doc, { plans, links: linksLoad.doc, table: modelsLoad.table }));
    problems.push(...reg.validatePlanModelCoverage({
      table: modelsLoad.table, links: linksLoad.doc, gaps: gapsLoad.doc, apiPlans, plans
    }));
  }

  const coverage = reg.coverageOf({
    table: modelsLoad.table, links: linksLoad.doc, gaps: gapsLoad.doc, apiPlans, plans
  });
  // 「删掉一条必需的 registry→API 映射」的正面清单：未认领的计价条目逐条点名（审计 M09 场景）。
  // 上面 validateLinks 已经把非零判红，这里只是把同一条事实渲染成看得见的行 —— 名字叫
  // 「关系层门禁」的脚本必须自己说得出"哪一条映射没了"，而不是让自测替它红。
  const uncoveredIdentities = coverage.unmappedModelKeys.map(item =>
    `(${item.apiPlanId}, ${item.modelKey}, ${item.variant})`);
  const candidates = reg.candidatesOf({ table: modelsLoad.table, apiPlans });
  const unmappedApiSet = new Set(coverage.unmappedModelKeys.map(item => `${item.apiPlanId}\u0000${item.modelKey}`));
  const confirmedCandidates = candidates.filter(item => unmappedApiSet.has(`${item.apiPlanId}\u0000${item.modelKey}`));
  const unmappedPlanSet = new Set(coverage.unmappedPlanModels.map(item => `${item.planId}\u0000${item.modelName}`));
  const planCandidates = reg.planCandidatesOf({ table: modelsLoad.table, plans })
    .filter(item => unmappedPlanSet.has(`${item.planId}\u0000${item.modelName}`));

  if (JSON_OUT) {
    console.log(JSON.stringify({
      ok: !problems.length,
      problems,
      coverage: Object.assign({}, coverage, {
        declaredPlanModels: coverage.declaredPlanModels.length,
        unmappedPlanModels: coverage.unmappedPlanModels.length
      }),
      uncoveredIdentities,
      duplicateSlugKeys: modelsLoad.duplicateKeys || [],
      candidates: confirmedCandidates.length,
      planCandidates: planCandidates.length
    }, null, 2));
  } else {
    if (problems.length) {
      console.error(`❌ Model Registry 关系层有 ${problems.length} 处硬问题：`);
      problems.slice(0, 40).forEach(problem => console.error(`  ✗ ${problem}`));
    } else {
      console.log('✅ Model Registry 关系层通过：每条映射都指向真实存在的记录与模型，一条 source pricing identity 至多归属一个 registry 模型，引文逐字来自记录本身；API 与 Coding 两侧每一个模型身份都已判过');
    }
    console.log(`   映射：API ${coverage.apiLinks} 条 · Coding ${coverage.codingLinks} 条 · 被引用的模型 ${coverage.linkedModels}/${coverage.models}`);
    console.log(`   计价条目（展开后）：${coverage.apiPricingItems} 条 = 已被映射认领 ${coverage.mappedApiEntries} 条 + 未认领 ${coverage.unmappedModelKeys.length} 条`);
    if (uncoveredIdentities.length) {
      console.error('   ✗ 未认领的计价条目（删掉一条映射就补回来；每一条都必须有结局）：');
      uncoveredIdentities.slice(0, 20).forEach(text => console.error(`     · ${text}`));
      if (uncoveredIdentities.length > 20) console.error(`     … 另有 ${uncoveredIdentities.length - 20} 条`);
    }
    const mappedPlanModels = coverage.planModelStrings - coverage.unmappedPlanModels.length - coverage.declaredPlanModels.length;
    console.log(`   套餐模型串：${coverage.planModelStrings} 条 = 已映射 ${mappedPlanModels} 条 + 已声明"不对应单一模型身份" ${coverage.declaredPlanModels.length} 条 + 未判 ${coverage.unmappedPlanModels.length} 条`);
    coverage.unmappedPlanModels.slice(0, 20).forEach(item => console.log(`     · ${item.provider} / ${item.modelName}（套餐 ${item.planId}）`));
    coverage.declaredPlanModels.slice(0, 20).forEach(item => console.log(`     · ${item.provider} / ${item.modelName}（套餐 ${item.planId}）→ ${item.reason}`));
    if (coverage.declaredPlanModels.length > 20) console.log(`     … 另有 ${coverage.declaredPlanModels.length - 20} 条`);
    console.log(`   候选（归一后精确相等，**只供人工 review，绝不写生产映射**）：API ${confirmedCandidates.length} 条 · 套餐 ${planCandidates.length} 条`);
    confirmedCandidates.slice(0, 10).forEach(item => console.log(`     · ${item.modelKey} → ${item.registrySlug}（${item.rule}）`));
    planCandidates.slice(0, 10).forEach(item => console.log(`     · ${item.modelName} → ${item.registrySlug}（套餐 ${item.planId}·${item.rule}）`));
  }
  return problems.length ? 1 : 0;
}

process.exit(main());
