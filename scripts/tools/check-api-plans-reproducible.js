#!/usr/bin/env node
/**
 * `api-plans.json` 可重建性门禁：**盘上的文件必须等于人工来源层产出的文件**（逐字节）。
 *
 * 用法：
 *   node scripts/tools/check-api-plans-reproducible.js
 *   node scripts/tools/check-api-plans-reproducible.js --json
 * 退出码：0 = 一致；1 = 不一致或来源层不合法。
 *
 * ## 它红的含义（与相邻两道门禁刻意分开）
 *
 *   · `Validate data (strict)` 红 = **值不合法**（枚举、单位、id 形状、身份重复……）；
 *   · 这一条红 = 值都合法，但**这份文件不是来源层产出的那一份** —— 有人手改了
 *     `api-plans.json`（尤其手算一个"混合单价"塞进 `derivedMetrics`），或者改了
 *     `curated_api_plans.json` 却忘了跑 `npm run api-plans:rebuild`。
 *
 * ## 为什么必须逐字节
 *
 * 键序也是契约的一部分：`api-plans.json` 是确定性派生产物（`updatedAt` 取自数据、
 * 记录按身份键排序、模型按 `(modelKey, variant)` 排序、引文按字段序排序），
 * 同一份输入永远应当得到同一串字节。只比字段会让"键序漂移"静默通过。
 */

'use strict';

const fs = require('fs');
const path = require('path');

const apiPlans = require('../lib/api-plan-schema');
const providers = require('../lib/providers');

const ROOT = path.join(__dirname, '..', '..');
const API_PLANS = path.join(ROOT, 'api-plans.json');
const JSON_OUT = process.argv.includes('--json');

function main() {
  const problems = [];

  if (!fs.existsSync(API_PLANS)) problems.push('api-plans.json 不存在（请先跑 npm run api-plans:rebuild）');

  const providerLoad = providers.load();
  const providerTable = providerLoad.table;
  const curated = apiPlans.loadCuratedApiPlans({ providerTable });

  const sourceProblems = [
    ...(providerLoad.missing ? ['scripts/data/providers.json 不存在'] : []),
    ...(providerLoad.broken ? [`providers.json 无法解析：${providerLoad.broken}`] : []),
    ...curated.problems.map(item => `#${item.index === null ? '-' : item.index} ${item.planName || ''} ${item.reason}`.trim()),
    ...curated.evidenceDropped.map(item => `#${item.index} ${item.planName} 引文被丢弃：${item.reason}`)
  ];
  if (sourceProblems.length) {
    problems.push(`人工来源层不合法（${sourceProblems.length} 处，先跑 npm run api-plans:rebuild 看明细）`);
  }

  let diskText = null;
  if (fs.existsSync(API_PLANS)) diskText = fs.readFileSync(API_PLANS, 'utf8');

  const expectedText = `${JSON.stringify(curated.payload, null, 2)}\n`;
  const identical = diskText !== null && diskText === expectedText;

  if (!identical && !sourceProblems.length && diskText !== null) {
    const before = (() => {
      try { return JSON.parse(diskText).plans || []; } catch (error) { return null; }
    })();
    if (before === null) {
      problems.push('api-plans.json 不是合法 JSON');
    } else {
      const byId = new Map(before.map(plan => [plan.id, plan]));
      let count = 0;
      for (const plan of curated.payload.plans) {
        const old = byId.get(plan.id);
        if (!old) { console.log(`  · 盘上缺少 ${plan.provider} / ${plan.planName}（${plan.id}）`); count++; continue; }
        for (const key of new Set([...Object.keys(old), ...Object.keys(plan)])) {
          const a = JSON.stringify(old[key] === undefined ? null : old[key]);
          const b = JSON.stringify(plan[key] === undefined ? null : plan[key]);
          if (a !== b) {
            console.log(`  · ${plan.provider} / ${plan.planName} / ${key}`);
            console.log(`      盘上：${String(a).slice(0, 140)}`);
            console.log(`      应为：${String(b).slice(0, 140)}`);
            count++;
          }
        }
      }
      for (const old of before) {
        if (!curated.payload.plans.some(plan => plan.id === old.id)) {
          console.log(`  · 盘上多出 ${old.provider} / ${old.planName}（${old.id}）`);
          count++;
        }
      }
      problems.push(`api-plans.json 与人工来源层的产出不一致（${count} 处差异）—— 手改过，或改了 curated_api_plans.json 没重建`);
    }
  }

  const ok = identical && !problems.length;

  if (JSON_OUT) {
    console.log(JSON.stringify({
      ok,
      file: path.relative(ROOT, API_PLANS),
      counted: curated.payload ? curated.payload.count : 0,
      updatedAt: curated.payload ? curated.payload.updatedAt : null,
      identical,
      summary: curated.payload ? apiPlans.summarize(curated.payload) : null,
      problems
    }, null, 2));
  } else if (ok) {
    const summary = apiPlans.summarize(curated.payload);
    console.log('✅ api-plans.json 可重建性通过：与 curated_api_plans.json 的产出逐字节一致');
    console.log(`   ${summary.total} 条 · ${summary.providers} 个平台 · ${summary.models} 个模型计价条目`
      + ` · 国内 ${summary.cn} / 国外 ${summary.global} · updatedAt=${curated.payload.updatedAt}`);
    console.log(`   单位分布：${Object.entries(summary.byUnit).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  } else {
    console.error('❌ api-plans.json 可重建性失败：');
    problems.forEach(problem => console.error(`  - ${problem}`));
    console.error('  修复：node scripts/tools/rebuild-api-plans.js');
  }

  return ok ? 0 : 1;
}

process.exit(main());
