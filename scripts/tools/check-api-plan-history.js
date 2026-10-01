#!/usr/bin/env node
/**
 * `api-plan-history.json` 门禁：**API 计费变化日志必须与当前 `api-plans.json` 一致，且链必须连续**。
 *
 * 用法：
 *   node scripts/tools/check-api-plan-history.js           # 有问题则退出 1
 *   node scripts/tools/check-api-plan-history.js --json     # 机器可读
 *
 * ## 它问的是什么（与相邻两道门禁同一套四问）
 *
 *   ① 形状：字段、事件类型、时间格式、被跟踪字段白名单、created.fields、派生 eventId、异常留档形状
 *   ② 链  ：同一 (记录, 字段) 上「上一条的 to」必须等于「下一条的 from」；ended / restored 成对
 *   ③ 一致：**基线 + 事件重放**必须逐字段等于当前 `api-plans.json`（元素级字段按 (modelKey, variant) 对账）
 *   ④ 上限：事件数 / 单条事件数 / 文件体积
 *
 * ## 额外一问：疑似模型改名
 *
 * 题面 §九 点名「API 厂商频繁更新模型名，避免 alias 产生假变化」。
 * 本工具把日志里的 `possible_rename` 异常展开成人可读清单（**只报告，不自动合并**）——
 * 确认是改名就把旧名写进 `models[].aliases` 并保持 `modelKey` 不变。
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const apiHistory = require('../lib/api-plan-history');

const JSON_OUT = process.argv.includes('--json');

function main() {
  const loaded = apiHistory.load();
  const file = path.relative(ROOT, apiHistory.API_PLAN_HISTORY_FILE);
  const plansPath = path.join(ROOT, 'api-plans.json');

  if (loaded.missing) {
    console.error(`❌ 缺少 ${file}：API 计费变化层不存在。`);
    console.error('   首次启用请跑 `npm run baseline:api-plan-history`（一次性、会拒绝重跑）。');
    return 1;
  }
  if (loaded.broken) {
    console.error(`❌ ${file} 解析失败：${loaded.broken}`);
    return 1;
  }
  if (!fs.existsSync(plansPath)) {
    console.error('❌ 缺少 api-plans.json —— 变化日志没有可对账的对象');
    return 1;
  }

  const store = JSON.parse(fs.readFileSync(plansPath, 'utf8'));
  const plans = Array.isArray(store.plans) ? store.plans : [];
  const today = String(store.updatedAt || '').slice(0, 10);
  const bytes = fs.statSync(loaded.file).size;
  const problems = apiHistory.verifyStore(loaded.store, plans, { today, bytes });

  // v3.0：派生字段 `eventId` 的**独立复算**。
  //
  // `verifyStore` 已经会重算比对（`apiValidateExtra` 调 `plan-history.eventIdProblems`），
  // 这里再算一遍并把**样本数**印出来，理由有两条：
  //   ① 交付日这份日志是 0 事件 —— 必须能从输出里区分「验过了、没问题」与「本轮没有样本」，
  //      而不是把「没报错」当成「验过了」；
  //   ② 两处必须同时报红。若哪天有人在 `apiValidateExtra` 里把这条检查摘掉，
  //      单靠它自己不会有任何东西变红；这里的独立复算就是那条兜底。
  const events = (loaded.store && Array.isArray(loaded.store.events)) ? loaded.store.events : [];
  const eventsWithId = events.filter(event => event && event.eventId !== undefined);
  const idProblems = eventsWithId
    .filter(event => event.eventId !== apiHistory.apiPlanEventIdOf(event))
    .map(event => `${event.planId} · ${event.at} · ${event.type}: eventId 与 apiPlanEventIdOf 重算值不一致（派生字段不得手写）`);
  if (idProblems.length && !problems.some(problem => problem.includes('eventId'))) {
    // 只有 verifyStore 漏报时才补位：两边都说同一件事会把同一条问题报两遍。
    problems.push(...idProblems);
  }
  const summary = apiHistory.summarize(loaded.store, plans);
  const absence = (loaded.store && loaded.store.absence) || {};
  const pending = Object.entries(absence)
    .filter(([, state]) => state && !state.endedAt)
    .map(([id, state]) => ({ id, ...state }))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const anomalies = Array.isArray(loaded.store.anomalies) ? loaded.store.anomalies : [];
  const renames = anomalies.filter(item => item && item.kind === 'possible_rename');

  if (JSON_OUT) {
    console.log(JSON.stringify({
      ok: problems.length === 0,
      file,
      plans: plans.length,
      today,
      problems,
      eventIds: {
        events: events.length,
        withId: eventsWithId.length,
        mismatches: idProblems.length
      },
      summary,
      pending: pending.map(item => ({
        planId: item.id, misses: item.misses || 0, since: item.since || null,
        blockedAt: item.blockedAt || null, blockedReason: item.blockedReason || null
      })),
      anomalies
    }, null, 2));
  } else {
    console.log('=== API 计费变化日志（api-plan-history.json）===');
    console.log(`起算日        : ${summary.startedAt}`);
    console.log(`基线记录      : ${summary.baselineRecords}`);
    console.log(`事件          : ${summary.events} 条 · 涉及 ${summary.recordsWithHistory} 条记录 · 观测态 ${summary.absenceTracked} 条`);
    console.log(`分类          : ${apiHistory.API_PLAN_EVENT_TYPES.map(type => `${type}=${summary.byType[type]}`).join(' · ')}`);
    console.log(`文件体积      : ${(bytes / 1024).toFixed(1)} KB / 上限 ${(apiHistory.API_PLAN_LIMITS.fileBytes / 1024).toFixed(0)} KB`);
    console.log(`事件上限      : 全库 ${apiHistory.API_PLAN_LIMITS.eventsTotal} · 单条 ${apiHistory.API_PLAN_LIMITS.eventsPerRecord}`);
    console.log(`派生 eventId  : ${eventsWithId.length}/${events.length} 条事件带 id · 重算比对 ${idProblems.length} 处不一致`
      + (events.length ? '' : '（本轮这份日志是 0 事件 —— 「有事件」那条断言没有样本，不是通过）'));
    if (pending.length) {
      console.log('');
      console.log(`待确认「不再收录」${pending.length} 条（连续 ${apiHistory.API_PLAN_MISS_CONFIRM_RUNS} 次重建未见才记 ended）：`);
      pending.forEach(item => {
        console.log(`   · ${item.id} 未见 ${item.misses || 0} 次，首次 ${item.since || '未知'}` +
          (item.blockedAt ? ` —— ⚠️ 本次被批量熔断挡住（${item.blockedReason}，${item.blockedAt}）` : '，再跑一次重建即确认'));
      });
    }
    if (renames.length) {
      console.log('');
      console.log(`⚠️ 疑似模型改名 ${renames.length} 处（同一条记录同时新增/移除元素，且单价有完全相同的项）：`);
      renames.slice(-5).forEach(item => {
        console.log(`   · ${item.at} ${item.planId}：-${item.removed} +${item.added}（相同项 ${item.sameRates.join(' / ')}）`);
      });
      console.log('   这是**检测**不是合并：确认是改名就把旧名写进 models[].aliases 并保持 modelKey 不变。');
      console.log('   明细：node scripts/tools/api-model-rename-report.js');
    }
    const otherAnomalies = anomalies.filter(item => item && item.kind !== 'possible_rename');
    if (otherAnomalies.length) {
      console.log('');
      console.log(`⚠️ 异常留档 ${otherAnomalies.length} 条：`);
      otherAnomalies.slice(-5).forEach(item => {
        console.log(`   · ${item.at} ${item.kind} ${item.missing === undefined ? '' : `缺席 ${item.missing} / 已知 ${item.known}`}`);
      });
    }
    problems.slice(0, 20).forEach(problem => console.log(`   ⚠ ${problem}`));
    console.log('');
  }

  if (problems.length) {
    console.error(`❌ API 计费变化日志与当前状态不一致：${problems.length} 处。`);
    console.error('   链断裂 = 日志被手改过，或写入路径漏了一次；');
    console.error('   「现状与历史不一致」= 有人改了 api-plans.json 而没走 npm run api-plans:rebuild（日志只能由它写）。');
    return 1;
  }
  if (!JSON_OUT) {
    console.log('✅ API 计费变化可重建：基线 + 事件重放逐字段等于当前 api-plans.json，且生命周期成对。');
  }
  return 0;
}

process.exit(main());
