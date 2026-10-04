#!/usr/bin/env node
/**
 * v3.0 Stage D：Model Registry 的**逐字节可重建门禁**。
 *
 * 用法：node scripts/tools/check-models-reproducible.js [--json]
 * 退出码：0 = 两份产物都与来源层逐字节一致；1 = 不一致或来源层不合法。
 *
 * ## 它红的含义（与相邻两道门禁刻意分开）
 *
 *   · `validate` 红 = **值不合法**（身份重复、别名撞车、映射指向不存在的记录……）；
 *   · 本门禁红 = 值都合法，但**盘上的产物不是来源层产出的那一份** —— 有人手改了根目录的
 *     `models.json` / `model-registry-links.json`（尤其手算 `id` / `firstSeen`），
 *     或者改了来源层却忘了跑 `npm run models:rebuild`。
 *
 * 为什么必须逐字节：键序也是契约的一部分。同一份来源层永远应当得到同一串字节，
 * 只比字段会让「键序漂移」静默通过，而那会让每一次 diff 都读不懂。
 */

'use strict';

const fs = require('fs');
const path = require('path');

const reg = require('../lib/model-registry');
const providers = require('../lib/providers');

const ROOT = path.join(__dirname, '..', '..');
const JSON_OUT = process.argv.includes('--json');

function main() {
  const problems = [];
  const modelsLoad = reg.load();
  const linksLoad = reg.loadLinks();
  const gapsLoad = reg.loadGaps();
  const providerTable = providers.load().table;
  const apiPlans = JSON.parse(fs.readFileSync(path.join(ROOT, 'api-plans.json'), 'utf8')).plans || [];
  const plans = JSON.parse(fs.readFileSync(path.join(ROOT, 'plans.json'), 'utf8')).plans || [];
  const developers = Object.values(providerTable).map(entry => String((entry && entry.name) || ''));
  const extraDevelopers = Object.keys((modelsLoad.doc && modelsLoad.doc._developers_extra) || {});

  if (!fs.existsSync(reg.PUBLISHED_MODELS_FILE)) problems.push('models.json 不存在（请先跑 npm run models:rebuild）');
  if (!fs.existsSync(reg.PUBLISHED_LINKS_FILE)) problems.push('model-registry-links.json 不存在（请先跑 npm run models:rebuild）');

  const sourceProblems = [
    ...(modelsLoad.missing ? ['scripts/data/models.json 不存在'] : []),
    ...(modelsLoad.broken ? [`models.json 无法解析：${modelsLoad.broken}`] : []),
    ...(linksLoad.missing ? ['scripts/data/model-registry-links.json 不存在'] : []),
    ...(linksLoad.broken ? [`model-registry-links.json 无法解析：${linksLoad.broken}`] : []),
    ...(gapsLoad.missing ? ['scripts/data/model-registry-gaps.json 不存在（套餐侧模型串的处置登记表）'] : []),
    ...(gapsLoad.broken ? [`model-registry-gaps.json 无法解析：${gapsLoad.broken}`] : []),
    // F-T19-1：与 validate --strict 同一条传参 —— 重复顶层 slug 键是 `JSON.parse` 看不见的
    // （它静默只留最后一条），必须把 `load()` 从原文扫出来的 `duplicateKeys` 传进判据，
    // 否则这里也会假绿（同形态的 check-model-registry-links / models-selftest 是红的）。
    ...reg.validateRegistry(modelsLoad.table, { developers, extraDevelopers, duplicateKeys: modelsLoad.duplicateKeys }),
    ...reg.validateLinks(linksLoad.doc, { table: modelsLoad.table, apiPlans, plans }),
    ...reg.validateGaps(gapsLoad.doc, { plans, links: linksLoad.doc, table: modelsLoad.table }),
    ...reg.validatePlanModelCoverage({
      table: modelsLoad.table, links: linksLoad.doc, gaps: gapsLoad.doc, apiPlans, plans
    })
  ];
  if (sourceProblems.length) {
    problems.push(`来源层/关系层不合法（${sourceProblems.length} 处，先跑 npm run models:rebuild 看明细）`);
  }

  // coverage-expansion-v1：`catalogStatus` / `catalogReason` 是**派生**字段，判据在
  // `scripts/lib/model-freshness.js`。重建与本次对账**必须用同一支派生**：
  // 这里不传 catalog 的话，本脚本会认为"应为 null"、而盘上那份带着真实原因码 ⇒ 假红。
  // 与 `rebuild-models.js` 的 `freshnessInputs()` 保持同一映射（字段名逐字相同）。
  const freshnessProblems = [];
  let catalogReport = null;
  try {
    const freshness = require('../lib/model-freshness');
    const inputs = {
      models: Object.keys(modelsLoad.table).sort().map(slug => {
        const entry = modelsLoad.table[slug] || {};
        return {
          slug,
          developer: entry.developer === undefined ? null : entry.developer,
          family: entry.family === undefined ? null : entry.family,
          modelRole: entry.modelRole === undefined ? null : entry.modelRole,
          releasedAt: entry.releasedAt === undefined ? null : entry.releasedAt,
          status: entry.status === undefined ? null : entry.status,
          freshnessGroup: entry.freshnessGroup === undefined ? null : entry.freshnessGroup
        };
      })
    };
    catalogReport = freshness.deriveCatalog(inputs);
    if (catalogReport.invariantViolations.length) {
      freshnessProblems.push(`新鲜度层报出 ${catalogReport.invariantViolations.length} 条硬不变量违规（先跑 npm run models:rebuild 看明细）`);
    }
  } catch (error) {
    freshnessProblems.push(`scripts/lib/model-freshness.js 不可用（${error.message}）—— catalogStatus 无法派生，本次对账会与盘上的派生结果不一致`);
  }
  problems.push(...freshnessProblems);

  const expectedModels = reg.serialize(reg.publishedModels({ table: modelsLoad.table, links: linksLoad.doc, apiPlans, plans, catalog: catalogReport }));
  const expectedLinks = reg.serialize(reg.publishedLinks(linksLoad.doc, modelsLoad.table));
  const diskModels = fs.existsSync(reg.PUBLISHED_MODELS_FILE) ? fs.readFileSync(reg.PUBLISHED_MODELS_FILE, 'utf8') : null;
  const diskLinks = fs.existsSync(reg.PUBLISHED_LINKS_FILE) ? fs.readFileSync(reg.PUBLISHED_LINKS_FILE, 'utf8') : null;

  const modelsIdentical = diskModels !== null && diskModels === expectedModels;
  const linksIdentical = diskLinks !== null && diskLinks === expectedLinks;

  if (!modelsIdentical && diskModels !== null) {
    let parsed = null;
    try { parsed = JSON.parse(diskModels); } catch (error) { problems.push('models.json 不是合法 JSON'); }
    if (parsed && Array.isArray(parsed.models)) {
      const expected = JSON.parse(expectedModels);
      const bySlug = new Map(parsed.models.map(model => [model.slug, model]));
      let count = 0;
      for (const model of expected.models) {
        const old = bySlug.get(model.slug);
        if (!old) { console.log(`  · 盘上缺少模型 ${model.slug}`); count++; continue; }
        for (const key of new Set([...Object.keys(old), ...Object.keys(model)])) {
          const a = JSON.stringify(old[key] === undefined ? null : old[key]);
          const b = JSON.stringify(model[key] === undefined ? null : model[key]);
          if (a !== b) { console.log(`  · ${model.slug} / ${key}\n      盘上：${String(a).slice(0, 100)}\n      应为：${String(b).slice(0, 100)}`); count++; }
        }
      }
      for (const old of parsed.models) if (!bySlug.has(old.slug) || !expected.models.some(model => model.slug === old.slug)) { count++; console.log(`  · 盘上多出模型 ${old.slug}`); }
      problems.push(`models.json 与来源层的产出不一致（${count} 处差异）—— 手改过产物，或改了来源层没重建`);
    }
  }
  if (!linksIdentical && diskLinks !== null && !problems.some(p => p.includes('model-registry-links.json 与来源层'))) {
    problems.push('model-registry-links.json 与来源层的产出不一致（手改过产物，或改了来源层没重建）');
  }

  const ok = modelsIdentical && linksIdentical && !problems.length;
  const stats = {
    models: JSON.parse(expectedModels).count,
    links: JSON.parse(expectedLinks).count,
    updatedAt: JSON.parse(expectedModels).updatedAt
  };

  if (JSON_OUT) {
    console.log(JSON.stringify({ ok, ...stats, modelsIdentical, linksIdentical, problems }, null, 2));
  } else if (ok) {
    console.log('✅ Model Registry 可重建性通过：models.json 与 model-registry-links.json 都与来源层逐字节一致');
    console.log(`   ${stats.models} 个模型 · ${stats.links} 条映射 · updatedAt=${stats.updatedAt}`);
  } else {
    console.error('❌ Model Registry 可重建性失败：');
    problems.forEach(problem => console.error(`  - ${problem}`));
    console.error('  修复：node scripts/tools/rebuild-models.js');
  }
  return ok ? 0 : 1;
}

process.exit(main());
