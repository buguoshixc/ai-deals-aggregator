#!/usr/bin/env node
/**
 * `plan-history.json` 门禁：**套餐变化日志必须与当前 `plans.json` 一致，且链必须连续**。
 *
 * 用法：
 *   node scripts/tools/check-plan-history.js           # 有问题则退出 1
 *   node scripts/tools/check-plan-history.js --json     # 机器可读
 *
 * ## 它问的是什么（与 `check:history` 同一套四问）
 *
 *   ① 形状：字段、事件类型、时间格式、被跟踪字段白名单、created.fields、派生 `eventId`、
 *           `supersedes` 指针、`anomalies` 留档形状
 *   ② 链  ：同一 (套餐, 字段) 上「上一条的 to」必须等于「下一条的 from」；
 *           `ended` / `restored` 必须成对；消失却没有 ended 的，只允许处在**观测期未满**的中间态
 *   ③ 一致：**基线 + 事件重放**的结果必须逐字段等于当前 `plans.json`
 *   ④ 上限：事件数 / 单条事件数 / 文件体积
 *
 * ## 为什么 ③ 是这一层的核心
 *
 * 没有 ③，「变化记录」就是一段自说自话的文本：谁都能往里面加一条「某套餐 9 月 1 日改过价」，
 * 而页面上看起来完全正常。这与 `check:plans:reproducible` 是同一条纪律，只是换成时间维度。
 *
 * 注意：它验证的是「日志能推导出当前值」，**不是**「当前值一定来自官方页」——
 * 后者是引文层与人工核对的事（v2.1 §11），本层不越位断言。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const planHistory = require('../lib/plan-history');

const JSON_OUT = process.argv.includes('--json');

function main() {
  const loaded = planHistory.load();
  const file = path.relative(ROOT, planHistory.PLAN_HISTORY_FILE);
  const plansPath = path.join(ROOT, 'plans.json');

  if (loaded.missing) {
    console.error(`❌ 缺少 ${file}：套餐变化层不存在。`);
    console.error('   首次启用请跑 `npm run baseline:plan-history`（一次性、会拒绝重跑）。');
    return 1;
  }
  if (loaded.broken) {
    console.error(`❌ ${file} 解析失败：${loaded.broken}`);
    return 1;
  }
  if (!fs.existsSync(plansPath)) {
    console.error('❌ 缺少 plans.json —— 变化日志没有可对账的对象');
    return 1;
  }

  const store = JSON.parse(fs.readFileSync(plansPath, 'utf8'));
  const plans = Array.isArray(store.plans) ? store.plans : [];
  const today = String(store.updatedAt || '').slice(0, 10);
  const bytes = fs.statSync(loaded.file).size;
  const problems = planHistory.verifyStore(loaded.store, plans, { today, bytes });
  const summary = planHistory.summarize(loaded.store, plans);
  const absence = (loaded.store && loaded.store.absence) || {};
  const pending = Object.entries(absence)
    .filter(([, state]) => state && !state.endedAt)
    .map(([id, state]) => ({ id, ...state }))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const blocked = pending.filter(item => item.blockedAt);
  const anomalies = Array.isArray(loaded.store.anomalies) ? loaded.store.anomalies : [];

  if (JSON_OUT) {
    console.log(JSON.stringify({
      ok: problems.length === 0,
      file,
      plans: plans.length,
      today,
      problems,
      summary,
      pending: pending.map(item => ({
        planId: item.id, misses: item.misses || 0, since: item.since || null,
        blockedAt: item.blockedAt || null, blockedReason: item.blockedReason || null
      })),
      anomalies
    }, null, 2));
  } else {
    console.log('=== 套餐变化日志（plan-history.json）===');
    console.log(`起算日        : ${summary.startedAt}`);
    console.log(`基线套餐      : ${summary.baselineRecords}`);
    console.log(`事件          : ${summary.events} 条 · 涉及 ${summary.recordsWithHistory} 条套餐 · 观测态 ${summary.absenceTracked} 条`);
    console.log(`分类          : ${planHistory.PLAN_EVENT_TYPES.map(type => `${type}=${summary.byType[type]}`).join(' · ')}`);
    console.log(`文件体积      : ${(bytes / 1024).toFixed(1)} KB / 上限 ${(planHistory.PLAN_LIMITS.fileBytes / 1024).toFixed(0)} KB`);
    console.log(`事件上限      : 全库 ${planHistory.PLAN_LIMITS.eventsTotal} · 单条 ${planHistory.PLAN_LIMITS.eventsPerRecord}`);
    if (pending.length) {
      console.log('');
      console.log(`待确认「不再收录」${pending.length} 条（连续 ${planHistory.PLAN_MISS_CONFIRM_RUNS} 次重建未见才记 ended）：`);
      pending.forEach(item => {
        console.log(`   · ${item.id} 未见 ${item.misses || 0} 次，首次 ${item.since || '未知'}` +
          (item.blockedAt ? ` —— ⚠️ 本次被批量熔断挡住（${item.blockedReason}，${item.blockedAt}）` : '，再跑一次重建即确认'));
      });
    }
    if (anomalies.length) {
      console.log('');
      console.log(`⚠️ 异常留档 ${anomalies.length} 条（批量消失熔断，未产生 ended）：`);
      anomalies.slice(-5).forEach(item => {
        console.log(`   · ${item.at} 缺席 ${item.missing} / 已知 ${item.known}，套餐 ${item.planIds.join(', ')}` +
          (item.override ? '（人工 --allow-mass-removal 放行）' : ''));
      });
    }
    problems.slice(0, 20).forEach(problem => console.log(`   ⚠ ${problem}`));
    console.log('');
  }

  if (problems.length) {
    console.error(`❌ 套餐变化日志与当前状态不一致：${problems.length} 处。`);
    console.error('   链断裂 = 日志被手改过，或写入路径漏了一次；');
    console.error('   「现状与历史不一致」= 有人改了 plans.json 而没走 npm run plans:rebuild（日志只能由它写）。');
    return 1;
  }
  if (!JSON_OUT) {
    console.log('✅ 套餐变化可重建：基线 + 事件重放逐字段等于当前 plans.json，且生命周期成对。');
  }
  return 0;
}

process.exit(main());
