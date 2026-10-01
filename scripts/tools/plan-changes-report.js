#!/usr/bin/env node
/**
 * 套餐变化的人读报告（可复核用，不进 CI）。
 *
 *   node scripts/tools/plan-changes-report.js            # 人读
 *   node scripts/tools/plan-changes-report.js --json     # 机器可读（与 buildPlanRadar 的返回同构）
 *
 * 用途：回答「这一屏上的每一条为什么会出现在这里」，以及「哪些套餐正在观测期里」。
 * 调规则、写报告、复核线上时都看它 —— 与 `report:changes` / `report:tier` 同一类工具：
 * **判据必须能被外部复核**。
 *
 * 它只读 `plans.json` 与 `scripts/data/plan-history.json`，不写盘、不联网。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const planChanges = require('../lib/plan-changes');
const planHistory = require('../lib/plan-history');
const plansPage = require('../lib/plans-page');
const providers = require('../lib/providers');

const JSON_OUT = process.argv.includes('--json');

function short(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (text === undefined || text === null) return '—';
  return text.length > 56 ? `${text.slice(0, 53)}…` : text;
}

function main() {
  const store = JSON.parse(fs.readFileSync(path.join(ROOT, 'plans.json'), 'utf8'));
  const plans = Array.isArray(store.plans) ? store.plans : [];
  const loaded = planHistory.load();
  const asOf = String(store.updatedAt || '').slice(0, 10);
  const availability = loaded.missing || loaded.broken ? 'unavailable' : 'ok';

  const radar = planChanges.buildPlanRadar({ plans, store: loaded.store, asOf, availability });
  const summary = planChanges.summarize(radar);

  if (JSON_OUT) {
    console.log(JSON.stringify({ summary, radar }, null, 2));
    return;
  }

  const providerTable = providers.load().table;
  const plansById = new Map(plans.map(plan => [plan.id, plan]));
  const sentenceOf = item => plansPage.planChangeTextOf(item, { plansById, providerTable });
  const whoOf = item => (item.titled
    ? `${plansPage.providerNameOf(item.vendor, providerTable)} ${item.title}`.trim()
    : '（已移除的套餐，无标题快照）');

  console.log('=== 套餐变化（v2.3）===');
  console.log(`基准日        : ${radar.asOf || '未知'}（= plans.json 的 updatedAt 日期，不是构建时刻）`);
  console.log(`日志起算日    : ${radar.startedAt || '未知'}`);
  console.log(`套餐变化日志  : ${loaded.missing ? '缺失' : loaded.broken ? `损坏（${loaded.broken}）` : '可用'}`);
  console.log(`窗口          : 最近 ${radar.windows.recentDays} 天变化 · 不再收录 / 重新出现 ${radar.windows.endedDays} 天`);
  console.log(`覆盖          : ${plans.length} 条套餐·${radar.coverage.plansWithHistory} 条有变化记录`);
  console.log('');
  for (const key of planChanges.PLAN_CHANGES_SECTION_ORDER) {
    const section = radar.sections[key];
    console.log(`【${planChanges.PLAN_CHANGES_WORDING.PLAN_CHANGES_SECTION[key]}】共 ${radar.totals[key]} 条` +
      (section.truncated ? `（此处只显示 ${section.items.length} 条，另有 ${section.truncated} 条未显示）` : ''));
    if (!section.items.length) console.log('    （空）');
    for (const item of section.items) {
      const bits = [item.at, item.type];
      if (item.field) bits.push(item.field);
      if (item.type === 'ended') bits.push(item.reason || '');
      console.log(`    ↗ [${bits.join(' · ')}] ${whoOf(item)}　${sentenceOf(item)}`);
    }
  }
  console.log('');
  console.log(`【其他变化（不进最近变化块 / 不进订阅）】共 ${radar.totals.meta} 条`);
  for (const item of radar.other.metadata) {
    console.log(`    · [元信息] ${item.planId} ${item.field}　${short(item.from)} → ${short(item.to)}`);
  }
  console.log('');
  const absence = Object.entries((loaded.store && loaded.store.absence) || {})
    .filter(([, state]) => state && !state.endedAt)
    .map(([id, state]) => ({ id, ...state }))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  console.log(`观测期中的「未见」: ${absence.length} 条` +
    `（连续 ${planHistory.PLAN_MISS_CONFIRM_RUNS} 次成功重建未见才记为「不再收录」）`);
  for (const item of absence) {
    const plan = plansById.get(item.id);
    console.log(`    · ${item.id} ${plan ? plan.planName : (item.label && item.label.title) || ''}` +
      ` 未见 ${item.misses || 0} 次，首次 ${item.since || '未知'}` +
      (item.blockedAt ? `　⚠️ 被批量熔断挡住（${item.blockedReason} @ ${item.blockedAt}）` : ''));
  }
  const anomalies = Array.isArray(loaded.store && loaded.store.anomalies) ? loaded.store.anomalies : [];
  console.log('');
  console.log(`异常留档      : ${anomalies.length} 条（批量消失熔断；未产生 ended）`);
  for (const item of anomalies.slice(-5)) {
    console.log(`    · ${item.at} 缺席 ${item.missing}/${item.known}　${item.planIds.join(', ')}` +
      (item.override ? '（人工 --allow-mass-removal 放行）' : ''));
  }
  console.log('');
  console.log(`最近变化块    : ${radar.home.items.length} 项` +
    (radar.home.items.length ? `（${radar.home.items.map(i => i.homeKind).join(' → ')}）` : '（空态：明说「当前没有观测到套餐变化」）'));
  console.log(`可用性        : ${radar.availability === 'ok' ? '✅ 可用' : '⚠️ 不可用（页面说「没有拿到套餐变更日志」，不说「没有变化」）'}`);
  console.log('');
  console.log('说明：分栏与窗口的判据只有一处实现（scripts/lib/plan-changes.js 的 buildPlanRadar），');
  console.log('      套餐对比页的最近变化块、/changes/ 的套餐分栏与套餐变化订阅源读的都是上面这份结果。');
}

main();
