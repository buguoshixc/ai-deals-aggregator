#!/usr/bin/env node
/**
 * `plans.json` 可重建性门禁：**盘上的文件必须等于人工来源层产出的文件**（逐字节）。
 *
 * 用法：
 *   node scripts/tools/check-plans-reproducible.js
 *   node scripts/tools/check-plans-reproducible.js --json
 * 退出码：0 = 一致；1 = 不一致或来源层不合法。
 *
 * ## 它红的含义（与相邻两道门禁刻意分开）
 *
 *   · `Validate data (strict)` 红 = **值不合法**（枚举、范围、id 形状、身份重复……）；
 *   · `Plans reproducibility` 红 = 值都合法，但**这份文件不是来源层产出的那一份**
 *     —— 有人手改了 `plans.json`（尤其手算 `derivedMetrics`），或者改了
 *     `curated_plans.json` 却忘了跑 `npm run plans:rebuild`。
 *
 * 两者红的时候没有别的步骤会替它红，所以都要在门禁里。
 *
 * ## 为什么必须逐字节，而不是"比比关键字段"
 *
 * 因为键序也是契约的一部分：`plans.json` 是确定性的派生产物（`updatedAt` 取自数据、
 * 记录按身份键排序、证据按字段序排序），同一份输入永远应当得到同一串字节。
 * 只比字段会让「键序漂移」这类改动静默通过 —— 而那会让每一次 diff 都变得读不懂。
 */

'use strict';

const fs = require('fs');
const path = require('path');

const plans = require('../lib/plan-schema');
const providers = require('../lib/providers');

const ROOT = path.join(__dirname, '..', '..');
const PLANS = path.join(ROOT, 'plans.json');
const JSON_OUT = process.argv.includes('--json');

function main() {
  const problems = [];

  if (!fs.existsSync(PLANS)) {
    problems.push('plans.json 不存在（请先跑 npm run plans:rebuild）');
  }

  const providerLoad = providers.load();
  const providerTable = providerLoad.table;
  const curated = plans.loadCuratedPlans({ providerTable });

  // 来源层自身的问题先报出来：这时候比对没有意义（两边都不可信）
  const sourceProblems = [
    ...(providerLoad.missing ? ['scripts/data/providers.json 不存在'] : []),
    ...(providerLoad.broken ? [`providers.json 无法解析：${providerLoad.broken}`] : []),
    ...curated.problems.map(item => `#${item.index === null ? '-' : item.index} ${item.planName || ''} ${item.reason}`.trim()),
    ...curated.evidenceDropped.map(item => `#${item.index} ${item.planName} 引文被丢弃：${item.reason}`)
  ];
  if (sourceProblems.length) {
    problems.push(`人工来源层不合法（${sourceProblems.length} 处，先跑 npm run plans:rebuild 看明细）`);
  }

  let diskText = null;
  if (fs.existsSync(PLANS)) {
    diskText = fs.readFileSync(PLANS, 'utf8');
  }

  const expectedText = `${JSON.stringify(curated.payload, null, 2)}\n`;
  const identical = diskText !== null && diskText === expectedText;

  if (!identical && !sourceProblems.length && diskText !== null) {
    // 差异明细：按 id 找出改动的条目与字段，别只说"有变化"
    const before = (() => {
      try { return JSON.parse(diskText).plans || []; } catch (error) { return null; }
    })();
    if (before === null) {
      problems.push('plans.json 不是合法 JSON');
    } else {
      const byId = new Map(before.map(plan => [plan.id, plan]));
      let count = 0;
      for (const plan of curated.payload.plans) {
        const old = byId.get(plan.id);
        if (!old) { console.log(`  · 盘上缺少 ${plan.planName}（${plan.id}）`); count++; continue; }
        for (const key of new Set([...Object.keys(old), ...Object.keys(plan)])) {
          const a = JSON.stringify(old[key] === undefined ? null : old[key]);
          const b = JSON.stringify(plan[key] === undefined ? null : plan[key]);
          if (a !== b) {
            console.log(`  · ${plan.planName} / ${key}`);
            console.log(`      盘上：${String(a).slice(0, 120)}`);
            console.log(`      应为：${String(b).slice(0, 120)}`);
            count++;
          }
        }
      }
      for (const old of before) {
        if (!curated.payload.plans.some(plan => plan.id === old.id)) {
          console.log(`  · 盘上多出 ${old.planName}（${old.id}）`);
          count++;
        }
      }
      problems.push(`plans.json 与人工来源层的产出不一致（${count} 处差异）—— 手改过 plans.json，或改了 curated_plans.json 没重建`);
    }
  }

  const ok = identical && !problems.length;

  if (JSON_OUT) {
    console.log(JSON.stringify({
      ok,
      file: path.relative(ROOT, PLANS),
      counted: curated.payload ? curated.payload.count : 0,
      updatedAt: curated.payload ? curated.payload.updatedAt : null,
      identical,
      problems
    }, null, 2));
  } else if (ok) {
    console.log('✅ plans.json 可重建性通过：与 curated_plans.json 的产出逐字节一致');
    console.log(`   ${curated.payload.count} 条 · updatedAt=${curated.payload.updatedAt}`);
  } else {
    console.error('❌ plans.json 可重建性失败：');
    problems.forEach(problem => console.error(`  - ${problem}`));
    console.error('  修复：node scripts/tools/rebuild-plans.js');
  }

  return ok ? 0 : 1;
}

process.exit(main());
