#!/usr/bin/env node
/**
 * 离线段重建 `plans.json`（v1）—— **不联网、不读墙上时钟**。
 *
 * 用法：
 *   node scripts/tools/rebuild-plans.js --dry-run   # 只报告会改什么
 *   node scripts/tools/rebuild-plans.js             # 写盘
 *
 * ## 为什么是"重建"而不是"手写 plans.json"
 *
 * `plans.json` 是**派生产物**：它 = 归一(`scripts/data/curated_plans.json`)。
 * 人工来源层只写事实；`id` 与 `derivedMetrics` 由 `lib/plan-schema.js` 算出来。
 * 派生字段若能手写，就会有人手算一个「名义 Token 单价」写进去 —— 那正是本阶段
 * 要堵死的入口（题面 §八：不可比较时必须为 null，不许强行算）。
 *
 * 与 `deals.json` 的差别：deals 由 `npm run collect` 联网重建，plans 没有采集器，
 * 所以只有这一条离线路径。因此 `updatedAt` 一律取「全部 lastSeen 的最大值」，
 * **不盖今天的章** —— 没有采集器，就没有理由说"这份数据是今天采到的"。
 */

'use strict';

const fs = require('fs');
const path = require('path');

const plans = require('../lib/plan-schema');
const providers = require('../lib/providers');

const ROOT = path.join(__dirname, '..', '..');
const PLANS = path.join(ROOT, 'plans.json');

function flag(name) {
  return process.argv.includes(`--${name}`);
}

/** 逐字段差异（含嵌套键序），用于告诉人"到底改了什么"，而不是只说"有变化" */
function diffPlans(before, after) {
  const diffs = [];
  const byId = new Map((before || []).map(plan => [plan.id, plan]));
  const identities = new Map((before || []).map(plan => [plans.identityKeyOf(plan), plan]));

  for (const plan of after) {
    const old = byId.get(plan.id) || identities.get(plans.identityKeyOf(plan));
    if (!old) {
      diffs.push({ label: `${plan.planName}`, field: '(新增记录)', from: null, to: plan.id });
      continue;
    }
    for (const key of new Set([...Object.keys(old), ...Object.keys(plan)])) {
      const a = JSON.stringify(old[key] === undefined ? null : old[key]);
      const b = JSON.stringify(plan[key] === undefined ? null : plan[key]);
      if (a !== b) diffs.push({ label: `${plan.planName}`, field: key, from: a, to: b });
    }
  }
  const afterIds = new Set(after.map(plan => plan.id));
  for (const old of before || []) {
    if (!afterIds.has(old.id) && !after.some(plan => plans.identityKeyOf(plan) === plans.identityKeyOf(old))) {
      diffs.push({ label: `${old.planName}`, field: '(删除记录)', from: old.id, to: null });
    }
  }
  return diffs;
}

function main() {
  const dryRun = flag('dry-run');

  const providerLoad = providers.load();
  const providerTable = providerLoad.table;
  const curated = plans.loadCuratedPlans({ providerTable });

  console.log('离线重建 plans.json（不联网、不读墙上时钟）');
  console.log(`  人工来源层：${path.relative(ROOT, plans.CURATED_PLANS_FILE)} → ${curated.plans.length} 条可用记录`);
  console.log(`  updatedAt 取自全部 lastSeen 的最大值 → ${curated.payload ? curated.payload.updatedAt : '(无)'}`);

  const hardProblems = [
    ...curated.problems.map(item => `#${item.index === null ? '-' : item.index} ${item.planName || ''} ${item.reason}`.trim()),
    ...curated.evidenceDropped.map(item => `#${item.index} ${item.planName} 引文被丢弃：${item.reason}`)
  ];

  if (hardProblems.length) {
    console.error(`\n❌ 人工来源层有 ${hardProblems.length} 处问题，拒绝写盘：`);
    hardProblems.slice(0, 40).forEach(problem => console.error(`  - ${problem}`));
    if (hardProblems.length > 40) console.error(`  ...（其余 ${hardProblems.length - 40} 处省略）`);
    return 1;
  }

  // 写盘前跑同一套数据集级校验（id 唯一 / 身份唯一 / updatedAt / 规范排序 / provider 表）
  plans.assertValidStore(curated.payload, { providerTable });
  console.log('  ✓ 数据集级校验通过（id 唯一 · 身份唯一 · updatedAt · 规范排序 · provider 表）');

  const diskText = fs.existsSync(PLANS) ? fs.readFileSync(PLANS, 'utf8') : null;
  const nextText = `${JSON.stringify(curated.payload, null, 2)}\n`;

  if (diskText === null) {
    console.log('  · 盘上还没有 plans.json');
  } else if (diskText === nextText) {
    console.log('  ✓ 重建结果与盘上的 plans.json 逐字节一致 —— 不需要写盘');
    return 0;
  } else {
    const before = (() => {
      try { return JSON.parse(diskText).plans || []; } catch (error) { return []; }
    })();
    const diffs = diffPlans(before, curated.payload.plans);
    console.log(`  · 重放后有 ${diffs.length} 处差异：`);
    diffs.slice(0, 20).forEach(diff => {
      console.log(`    · ${diff.label} / ${diff.field}`);
      console.log(`        旧：${String(diff.from).slice(0, 120)}`);
      console.log(`        新：${String(diff.to).slice(0, 120)}`);
    });
    if (diffs.length > 20) console.log(`    … 另有 ${diffs.length - 20} 处`);
  }

  if (dryRun) {
    console.log('\n--dry-run：没有写盘。');
    return 0;
  }
  plans.writePlans(curated.payload, PLANS);
  console.log(`\n✅ 已写出 plans.json：${curated.payload.count} 条，updatedAt=${curated.payload.updatedAt}`);
  console.log('下一步：node scripts/validate.js --strict && node scripts/tools/check-plans-reproducible.js');
  return 0;
}

process.exit(main());
