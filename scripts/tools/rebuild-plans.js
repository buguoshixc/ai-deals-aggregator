#!/usr/bin/env node
/**
 * 离线段重建 `plans.json`（v1）—— **不联网、不读墙上时钟**。
 *
 * 用法：
 *   node scripts/tools/rebuild-plans.js --dry-run   # 只报告会改什么（含将要追加的变化事件）
 *   node scripts/tools/rebuild-plans.js             # 写盘（并推进变化日志）
 *
 * 选项：
 *   --allow-empty            允许把套餐表重建成 0 条（默认拒绝：空数据集不该被发布）
 *   --allow-mass-removal     允许一次运行批量下架（默认熔断：见下）
 *
 * ## 为什么是"重建"而不是"手写 plans.json"
 *
 * `plans.json` 是**派生产物**：它 = 归一(`scripts/data/curated_plans.json`)。
 * 人工来源层只写事实；`id` 与 `derivedMetrics` 由 `lib/plan-schema.js` 算出来。
 * 派生字段若能手写，就会有人手算一个「名义 Token 单价」写进去 —— 那正是本阶段
 * 要堵死的入口（题面 §八：不可比较时必须为 null，不许强行算）。
 *
 * ## v2.3：这里同时是**变化日志的唯一写入点**
 *
 * `scripts/data/plan-history.json` 只在**成功写盘**的这条路径上被推进：
 *
 *   ① 人工来源层有硬问题 / 数据集级校验不过 ⇒ 既不写数据也不写日志（坏输入进不了写盘路径）；
 *   ② `--dry-run` ⇒ 只打印将要追加的事件，一个字节都不写；
 *   ③ 写盘顺序：先 `plans.json`、再 `plan-history.json`。任一步失败都明确报错 ——
 *      两份文件不在同一状态时 `check:plan-history` 会红，而不是静默地对不上。
 *
 * 另外两条安全规则（详见 `lib/plan-history.js` 的文件头 R1–R6）：
 *   · 套餐「消失」要**连续两次**成功重建都没见到，才记为 `ended`（一次没采到不算）；
 *   · 一次运行里缺席的套餐超过 `max(3, 半数已知)`（或输出为空）⇒ **熔断**：不推进计数、
 *     不记 `ended`，只在日志的 `anomalies[]` 里留档；真要批量下架得显式传 `--allow-mass-removal`。
 */

'use strict';

const fs = require('fs');
const path = require('path');

const plans = require('../lib/plan-schema');
const providers = require('../lib/providers');
const planHistory = require('../lib/plan-history');

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

function readDiskPlans() {
  if (!fs.existsSync(PLANS)) return null;
  return JSON.parse(fs.readFileSync(PLANS, 'utf8'));
}

function main() {
  const dryRun = flag('dry-run');
  const allowEmpty = flag('allow-empty');
  const allowMassRemoval = flag('allow-mass-removal');

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

  const diskDoc = readDiskPlans();
  const diskText = diskDoc ? fs.readFileSync(PLANS, 'utf8') : null;
  const nextText = `${JSON.stringify(curated.payload, null, 2)}\n`;
  const previous = diskDoc && Array.isArray(diskDoc.plans) ? diskDoc.plans : [];

  // 空数据集守卫：把套餐表重建成 0 条几乎总是「来源层被误清空」，不是意图
  if (!curated.payload.plans.length && previous.length && !allowEmpty) {
    console.error(`\n❌ 本次重建会得到 0 条套餐（盘上还有 ${previous.length} 条），拒绝写盘。`);
    console.error('   确实要清空套餐表请显式传 --allow-empty（这一条不是熔断，是防止误清空）。');
    return 1;
  }

  // ---- 变化日志：读 → 算 → （写盘时才落库）--------------------------------
  const loaded = planHistory.load();
  if (loaded.missing) {
    console.error(`\n❌ 缺少 ${path.relative(ROOT, planHistory.PLAN_HISTORY_FILE)}：套餐变化层还没有基线。`);
    console.error('   首次启用请跑一次 `npm run baseline:plan-history`（一次性，会拒绝重跑）。');
    console.error('   变化日志只能由本工具写 —— 缺文件时**不**自动生成基线（无人看见地冻结"当前状态"就是伪造历史）。');
    return 1;
  }
  if (loaded.broken) {
    console.error(`\n❌ ${path.relative(ROOT, planHistory.PLAN_HISTORY_FILE)} 解析失败（${loaded.broken}），拒绝写盘。`);
    return 1;
  }

  const at = String(curated.payload.updatedAt || '').slice(0, 10);
  const labels = new Map();
  for (const plan of [...previous, ...curated.payload.plans]) {
    if (plan && plan.id && plan.planName) labels.set(plan.id, { title: plan.planName, vendor: plan.provider });
  }

  const recorded = planHistory.record(loaded.store, {
    previous,
    next: curated.payload.plans,
    at,
    runAt: new Date().toISOString(),
    labels,
    allowMassRemoval
  });

  if (recorded.problems.length) {
    console.error(`\n❌ 变化日志拒绝推进（${recorded.problems.length} 处），因此也不写 plans.json：`);
    recorded.problems.slice(0, 20).forEach(problem => console.error(`  - ${problem}`));
    console.error('   修好之后重跑本命令（日志与数据必须同批更新，否则 check:plan-history 会红）。');
    return 1;
  }

  const nextHistoryText = `${JSON.stringify(recorded.store, null, 2)}\n`;
  const historyChanged = nextHistoryText !== fs.readFileSync(planHistory.PLAN_HISTORY_FILE, 'utf8');
  const dataChanged = diskText !== nextText;

  // ---- 报告：数据差异 ------------------------------------------------------
  if (diskText === null) {
    console.log('  · 盘上还没有 plans.json');
  } else if (!dataChanged) {
    console.log('  ✓ 重建结果与盘上的 plans.json 逐字节一致 —— 数据不需要写盘');
  } else {
    const diffs = diffPlans(previous, curated.payload.plans);
    console.log(`  · 重放后有 ${diffs.length} 处差异：`);
    diffs.slice(0, 20).forEach(diff => {
      console.log(`    · ${diff.label} / ${diff.field}`);
      console.log(`        旧：${String(diff.from).slice(0, 120)}`);
      console.log(`        新：${String(diff.to).slice(0, 120)}`);
    });
    if (diffs.length > 20) console.log(`    … 另有 ${diffs.length - 20} 处`);
  }

  // ---- 报告：变化事件 ------------------------------------------------------
  const stats = recorded.stats;
  console.log(`  · 变化日志（${path.relative(ROOT, planHistory.PLAN_HISTORY_FILE)}）：本次追加 ${stats.appended} 条事件` +
    `${stats.byType && stats.appended ? `（${planHistory.PLAN_EVENT_TYPES.filter(t => stats.byType[t]).map(t => `${t} ${stats.byType[t]}`).join(' · ')}）` : ''}`);
  recorded.appended.slice(0, 20).forEach(event => {
    const label = event.type === 'ended' ? `（${planHistory.PLAN_HISTORY_WORDING.PLAN_HISTORY_END_REASONS[event.reason] || event.reason}）` : '';
    console.log(`      ${event.at} ${event.planId} ${event.type} ${event.field || ''} ` +
      `${planHistory.PLAN_HISTORY_WORDING.PLAN_HISTORY_TYPES[event.type] || ''}${label}`);
  });
  if (recorded.appended.length > 20) console.log(`      … 另有 ${recorded.appended.length - 20} 条`);

  if (recorded.missing.length) {
    console.log(`  · 本次未见 ${recorded.missing.length} 条套餐（逐个列出，避免"悄悄少了一条"）：`);
    recorded.missing.forEach(item => {
      console.log(`      ${item.planId} ${item.title} —— 未见 ${item.misses} 次，首次 ${item.since}` +
        (item.blocked ? '（⚠️ 已被批量熔断挡住，未推进计数）' : `，连续 ${planHistory.PLAN_MISS_CONFIRM_RUNS} 次即记为「不再收录」`));
    });
  }
  if (stats.massMissing) {
    console.warn(`  ⚠️  批量消失熔断：本次缺席 ${recorded.missing.length} / 已知 ${stats.knownTotal} 条套餐，`);
    console.warn('     不推进任何「未见」计数、不产生 ended（留档在 anomalies）。');
    console.warn('     确属真实批量下架时，请核对来源层后显式重跑：node scripts/tools/rebuild-plans.js --allow-mass-removal');
  }
  if (stats.pendingAbsence) {
    console.log(`  · 待确认「不再收录」${stats.pendingAbsence} 条 —— 再跑一次本命令即确认（或它们回来时自动清除）`);
  }

  if (dryRun) {
    console.log('\n--dry-run：没有写盘（数据与变化日志都没动）。');
    return 0;
  }

  // ---- 落库：先数据、后日志（顺序是契约）----------------------------------
  if (dataChanged) {
    plans.writePlans(curated.payload, PLANS);
    console.log(`\n✅ 已写出 plans.json：${curated.payload.count} 条，updatedAt=${curated.payload.updatedAt}`);
  }
  if (historyChanged) {
    planHistory.save(recorded.store);
    console.log(`✅ 已写出 ${path.relative(ROOT, planHistory.PLAN_HISTORY_FILE)}：${stats.appended} 条新事件，累计 ${recorded.store.events.length} 条`);
  }
  if (!dataChanged && !historyChanged) {
    console.log('\n无需写盘：数据与变化日志都与盘上一致。');
  }
  console.log('下一步：node scripts/validate.js --strict && node scripts/tools/check-plans-reproducible.js && node scripts/tools/check-plan-history.js');
  return 0;
}

process.exit(main());
