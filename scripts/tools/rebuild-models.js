#!/usr/bin/env node
/**
 * v3.0 Stage D：离线重建 Model Registry 的两份**派生产物**（不联网、不读墙上时钟）。
 *
 * 用法：
 *   node scripts/tools/rebuild-models.js --dry-run   # 只报告会改什么
 *   node scripts/tools/rebuild-models.js             # 写盘
 *
 * 产物：
 *   models.json                  ← scripts/data/models.json + scripts/data/model-registry-links.json
 *   model-registry-links.json    ← 关系层（并把 registrySlug 展开成派生的 registryModelId）
 *
 * ## 为什么是"重建"而不是手写
 *
 * `id`（sha1('model|' + slug) 前 12 位）、`firstSeen` / `lastSeen`（引用方的最早/最晚日期）、
 * `updatedAt` / `count` 全是**派生值**：来源层里出现它们就是校验错误（与 `plans.json` 的
 * `derivedMetrics` 同一条纪律）。派生字段若能手写，就会有人手算一个 id 写进去 ——
 * 那意味着"同一份身份表，两个人算出两个 id"。
 *
 * ## 安全规则
 *
 * · 来源层或关系层有硬问题 ⇒ 一个字节都不写（坏输入进不了写盘路径）；
 * · `--dry-run` ⇒ 只打印将要发生的变化；
 * · 把 registry 重建成 0 条（盘上还有）⇒ 拒绝，除非显式 `--allow-empty`；
 * · 两份产物同批更新，避免"模型表更新了、关系表还是旧的"这种自相矛盾。
 */

'use strict';

const fs = require('fs');
const path = require('path');

const reg = require('../lib/model-registry');
const providers = require('../lib/providers');

const ROOT = path.join(__dirname, '..', '..');

function flag(name) {
  return process.argv.includes(`--${name}`);
}

function context() {
  const modelsLoad = reg.load();
  const linksLoad = reg.loadLinks();
  const providerTable = providers.load().table;
  const apiPlans = JSON.parse(fs.readFileSync(path.join(ROOT, 'api-plans.json'), 'utf8')).plans || [];
  const plans = JSON.parse(fs.readFileSync(path.join(ROOT, 'plans.json'), 'utf8')).plans || [];
  const developers = Object.values(providerTable).map(entry => String((entry && entry.name) || ''));
  const extraDevelopers = Object.keys((modelsLoad.doc && modelsLoad.doc._developers_extra) || {});
  return { modelsLoad, linksLoad, apiPlans, plans, developers, extraDevelopers };
}

function main() {
  const dryRun = flag('dry-run');
  const allowEmpty = flag('allow-empty');
  const { modelsLoad, linksLoad, apiPlans, plans, developers, extraDevelopers } = context();

  console.log('离线重建 Model Registry（不联网、不读墙上时钟）');
  console.log(`  来源层：${path.relative(ROOT, reg.MODELS_FILE)}（${Object.keys(modelsLoad.table).length} 条）`);
  console.log(`  关系层：${path.relative(ROOT, reg.LINKS_FILE)}（${reg.linksList(linksLoad.doc).length} 条）`);

  const problems = [];
  if (modelsLoad.missing) problems.push('scripts/data/models.json 不存在');
  if (modelsLoad.broken) problems.push(`scripts/data/models.json 无法解析：${modelsLoad.broken}`);
  if (linksLoad.missing) problems.push('scripts/data/model-registry-links.json 不存在');
  if (linksLoad.broken) problems.push(`scripts/data/model-registry-links.json 无法解析：${linksLoad.broken}`);
  if (problems.length) {
    console.error(`\n❌ ${problems.length} 处硬问题，拒绝写盘：`);
    problems.forEach(item => console.error(`  - ${item}`));
    return 1;
  }

  const registryProblems = reg.validateRegistry(modelsLoad.table, { developers, extraDevelopers });
  const linkProblems = reg.validateLinks(linksLoad.doc, { table: modelsLoad.table, apiPlans, plans });
  if (registryProblems.length || linkProblems.length) {
    console.error(`\n❌ 来源层/关系层有 ${registryProblems.length + linkProblems.length} 处问题，拒绝写盘：`);
    [...registryProblems, ...linkProblems].slice(0, 40).forEach(item => console.error(`  - ${item}`));
    return 1;
  }
  console.log('  ✓ 数据集级校验通过（身份唯一 · 别名唯一 · 映射存在 · 引文逐字来自记录）');

  const models = reg.publishedModels({ table: modelsLoad.table, links: linksLoad.doc, apiPlans, plans });
  const links = reg.publishedLinks(linksLoad.doc, modelsLoad.table);

  const modelsText = reg.serialize(models);
  const linksText = reg.serialize(links);

  const previousModels = fs.existsSync(reg.PUBLISHED_MODELS_FILE) ? fs.readFileSync(reg.PUBLISHED_MODELS_FILE, 'utf8') : null;
  const previousCount = previousModels ? (JSON.parse(previousModels).count || 0) : 0;
  if (!models.count && previousCount && !allowEmpty) {
    console.error(`\n❌ 本次重建会得到 0 个模型（盘上还有 ${previousCount} 个），拒绝写盘。`);
    console.error('   确实要清空 registry 请显式传 --allow-empty。');
    return 1;
  }

  const coverage = reg.coverageOf({ table: modelsLoad.table, links: linksLoad.doc, apiPlans, plans });
  console.log(`  · 覆盖：${coverage.linkedModels}/${coverage.models} 个模型被显式引用 · API 链接 ${coverage.apiLinks} 条 · Coding 链接 ${coverage.codingLinks} 条`);
  console.log(`  · 未映射的 API modelKey：${coverage.unmappedModelKeys.length} 条` +
    (coverage.unmappedModelKeys.length ? `（${coverage.unmappedModelKeys.slice(0, 5).map(item => `${item.provider}/${item.modelKey}`).join(' · ')}${coverage.unmappedModelKeys.length > 5 ? ' …' : ''}）` : ''));
  console.log(`  · 未映射的套餐模型串：${coverage.unmappedPlanModels.length} 条（覆盖报告里逐条列出，不是失败）`);
  console.log(`  · updatedAt（全部派生 lastSeen 的最大值）→ ${models.updatedAt}`);

  const modelsChanged = previousModels !== modelsText;
  const previousLinks = fs.existsSync(reg.PUBLISHED_LINKS_FILE) ? fs.readFileSync(reg.PUBLISHED_LINKS_FILE, 'utf8') : null;
  const linksChanged = previousLinks !== linksText;
  console.log(modelsChanged ? '  · models.json 需要写盘' : '  ✓ models.json 与盘上逐字节一致');
  console.log(linksChanged ? '  · model-registry-links.json 需要写盘' : '  ✓ model-registry-links.json 与盘上逐字节一致');

  if (dryRun) {
    console.log('\n--dry-run：没有写盘。');
    return 0;
  }
  if (modelsChanged) fs.writeFileSync(reg.PUBLISHED_MODELS_FILE, modelsText);
  if (linksChanged) fs.writeFileSync(reg.PUBLISHED_LINKS_FILE, linksText);
  if (modelsChanged) console.log(`\n✅ 已写出 models.json：${models.count} 个模型，updatedAt=${models.updatedAt}`);
  if (linksChanged) console.log(`✅ 已写出 model-registry-links.json：${links.count} 条映射`);
  if (!modelsChanged && !linksChanged) console.log('\n无需写盘：两份产物都与盘上一致。');
  console.log('下一步：node scripts/tools/check-models-reproducible.js && node scripts/tools/check-model-registry-links.js');
  return 0;
}

process.exit(main());
