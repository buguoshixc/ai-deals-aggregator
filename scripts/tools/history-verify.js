#!/usr/bin/env node
/**
 * `deal-history.json` 门禁：**历史必须与当前发布状态一致，且链必须连续**。
 *
 * 用法：
 *   node scripts/tools/history-verify.js           # 有问题则退出 1
 *   node scripts/tools/history-verify.js --json    # 机器可读
 *
 * ## 它问的是什么
 *
 *   ① 形状：字段、事件类型、时间格式、跟踪字段白名单、created.fields 白名单
 *   ② 链  ：同一 (id, field) 上「上一条的 to」必须等于「下一条的 from」；
 *           `ended` / `restored` 必须成对；记录从 `deals.json` 消失却没有 `ended` 必红
 *   ③ 一致：**基线 + 事件重放**的结果必须逐字段等于当前 `deals.json`
 *   ④ 上限：事件数 / 单条事件数 / 文件体积
 *
 * ## 为什么 ③ 是这一层的核心
 *
 * 没有 ③，「历史」就是一段自说自话的文本：谁都能往里面加一条「X 在 9 月 1 日改过」，
 * 而页面上看起来完全正常。基线（一次性）+ 事件（追加）必须能重建出今天的数据 ——
 * 这与 `check-reproducible.js` 对六字段的要求是同一条纪律，只是换成了时间维度。
 *
 * 注意：**它验证的是「日志能推导出当前值」，不是「当前值一定来自官方页」**。
 * 后者是采集与引文层的事（v1.3），本层不越位断言。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const { todayCN } = require('../lib/schema');
const history = require('../lib/history');

const JSON_OUT = process.argv.includes('--json');

function main() {
  const loaded = history.load();
  const dealDoc = JSON.parse(fs.readFileSync(path.join(ROOT, 'deals.json'), 'utf8'));
  const deals = Array.isArray(dealDoc.deals) ? dealDoc.deals : [];
  const today = todayCN();

  if (loaded.missing) {
    console.error(`❌ 缺少 ${path.relative(ROOT, history.HISTORY_FILE)}：历史层不存在。`);
    console.error('   首次启用请跑 `npm run history:baseline`（一次性、会拒绝重跑）。');
    process.exit(1);
  }
  if (loaded.broken) {
    console.error(`❌ ${path.relative(ROOT, history.HISTORY_FILE)} 解析失败：${loaded.broken}`);
    process.exit(1);
  }

  const bytes = fs.statSync(loaded.file).size;
  const problems = history.verifyStore(loaded.store, deals, { today, bytes });
  const summary = history.summarize(loaded.store, deals);

  if (JSON_OUT) {
    console.log(JSON.stringify({ ok: problems.length === 0, problems, summary }, null, 2));
  } else {
    console.log('=== 优惠历史（deal-history.json）===');
    console.log(`起算日        : ${summary.startedAt}`);
    console.log(`基线记录      : ${summary.baselineRecords}`);
    console.log(`事件          : ${summary.events} 条 · 涉及 ${summary.recordsWithHistory} 条记录 · 观测态 ${summary.absenceTracked} 条`);
    console.log(`分类          : ${history.EVENT_TYPES.map(type => `${type}=${summary.byType[type]}`).join(' · ')}`);
    console.log(`文件体积      : ${(bytes / 1024).toFixed(1)} KB / 上限 ${(history.LIMITS.fileBytes / 1024).toFixed(0)} KB`);
    console.log(`事件上限      : 全库 ${history.LIMITS.eventsTotal} · 单条 ${history.LIMITS.eventsPerDeal}`);
    problems.slice(0, 20).forEach(problem => console.log(`   ⚠ ${problem}`));
    console.log('');
  }

  if (problems.length) {
    console.error(`❌ 历史与当前状态不一致：${problems.length} 处。`);
    console.error('   链断裂 = 日志被手改过或写入路径漏了一次；');
    console.error('   「现状与历史不一致」= 有人改了 deals.json 而没有经过采集路径（历史层只能由 collect.js 写）。');
    process.exit(1);
  }
  if (!JSON_OUT) console.log('✅ 历史可重建：基线 + 事件重放逐字段等于当前 deals.json，且生命周期成对。');
}

main();
