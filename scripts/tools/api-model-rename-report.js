#!/usr/bin/env node
/**
 * 疑似模型改名报告（题面 §九：API 厂商可能频繁更新模型名，避免 alias 制造假变化）。
 *
 * 用法：
 *   node scripts/tools/api-model-rename-report.js
 *   node scripts/tools/api-model-rename-report.js --json
 *
 * ## 它回答什么
 *
 * 从 `api-plan-history.json` 的 `anomalies[]` 里取出 `possible_rename` 留档，
 * 再用**当前数据**把它展开成人能读的一行：哪个平台、哪条记录、被移除的元素键、
 * 新增的元素键、以及**判据**（哪几个单价完全一样）。
 *
 * ## 它不做什么（这是本工具存在的意义）
 *
 * **它没有任何写生产数据的代码路径。** 修法只有一个、且必须由人来做：
 * 确认是改名 → 把旧名写进 `models[].aliases`、**保持 `modelKey` 不变**；
 * 确认是新旧两个模型 → 什么都不用做（那两条事件就是事实）。
 * 自动把两个 `modelKey` 合并，会把一次"人工核对"变成一次"工具猜测"，
 * 而猜测错了之后页面上看起来与正确的完全一样 —— 本仓对相似度匹配有实测教训
 * （`/krea/i` 命中 `Kreado AI`）。
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const apiHistory = require('../lib/api-plan-history');

const JSON_OUT = process.argv.includes('--json');

function main() {
  const loaded = apiHistory.load();
  if (loaded.missing || loaded.broken) {
    console.error(`❌ 无法读取 ${path.relative(ROOT, apiHistory.API_PLAN_HISTORY_FILE)}：${loaded.broken || '文件缺失'}`);
    console.error('   首次启用请先跑 npm run baseline:api-plan-history。');
    return 1;
  }
  const store = loaded.store;
  const plansDoc = JSON.parse(fs.readFileSync(path.join(ROOT, 'api-plans.json'), 'utf8'));
  const byId = new Map((plansDoc.plans || []).map(plan => [plan.id, plan]));

  const anomalies = (store.anomalies || []).filter(item => item && item.kind === 'possible_rename');
  const rows = anomalies.map(item => {
    const plan = byId.get(item.planId) || null;
    const modelIn = key => {
      if (!plan) return null;
      const entry = (plan.models || []).find(model => `${model.modelKey}|${model.variant}` === key);
      return entry ? entry.name : null;
    };
    return {
      at: item.at,
      planId: item.planId,
      provider: plan ? plan.provider : null,
      planName: plan ? plan.planName : null,
      removed: item.removed,
      removedName: modelIn(item.removed),
      added: item.added,
      addedName: modelIn(item.added),
      sameRates: item.sameRates || [],
      stillInData: Boolean(plan && (plan.models || []).some(model => `${model.modelKey}|${model.variant}` === item.added))
    };
  });

  if (JSON_OUT) {
    console.log(JSON.stringify({
      file: path.relative(ROOT, apiHistory.API_PLAN_HISTORY_FILE),
      count: rows.length,
      note: '只供人工 review：本报告不写任何生产数据，修法是人工把旧名写进 aliases 并保持 modelKey 不变。',
      rows
    }, null, 2));
  } else {
    console.log('=== 疑似模型改名（只供人工 review）===');
    console.log(`留档 ${rows.length} 处（来自 api-plan-history.json 的 anomalies[]）`);
    if (!rows.length) {
      console.log('  · 没有留档。这不等于"从来没有改名"：检测只在**同一次重建**里同时出现');
      console.log('    "移除一个元素 + 新增一个元素 + 至少一项单价完全相同"时才留档；');
      console.log('    改名同时改价、或前后两次重建各发生一半时，检测不到（那属于如实漏检）。');
    }
    rows.forEach(row => {
      console.log(`  · ${row.at} ${row.provider || row.planId} / ${row.planName || '(已不在数据里)'}`);
      console.log(`      - ${row.removed}${row.removedName ? `（${row.removedName}）` : ''}`);
      console.log(`      + ${row.added}${row.addedName ? `（${row.addedName}）` : ''}`);
      console.log(`      相同单价：${row.sameRates.length ? row.sameRates.join(' / ') : '(无)'}`);
      console.log(`      处置：确认是改名 → 把旧名写进 models[].aliases 并保持 modelKey 不变；`);
      console.log(`            确认是新旧两个模型 → 无需处置（那两条事件就是事实）。`);
    });
  }
  return 0;
}

process.exit(main());
