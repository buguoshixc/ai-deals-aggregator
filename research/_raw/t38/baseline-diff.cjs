#!/usr/bin/env node
/**
 * t38 预映射的第三台只读盘点器：**对基线 a4dd40f 做差集**（回答"有没有丢真值 / 改写历史 / 身份漂移"）。
 *
 * §87 里那几条（Status 20/21/27/29-30/35/37）最容易靠"应该有"糊过去 —— 它们全是**相对基线**的判断，
 * 单看现在的盘面看不出来。这里只比"同一份数据在两个提交上的差"，不做任何判定。
 *
 * 只读（全部走 git show，不碰工作区文件）；用法：node research/_raw/t38/baseline-diff.cjs
 */

'use strict';

const { execFileSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const BASE = 'a4dd40f';

function show(rel) {
  try { return JSON.parse(execFileSync('git', ['show', `${BASE}:${rel}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 })); } catch (error) { return null; }
}

const fs = require('fs');
const readNow = rel => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')); } catch (error) { return null; } };

/** 通用差集：按 id 比"删了谁 / 加了谁 / 同 id 的行有没有被改" */
function compare(rel, listOf) {
  const before = listOf(show(rel)) || [];
  const after = listOf(readNow(rel)) || [];
  const beforeById = new Map(before.map(row => [row.id, JSON.stringify(row)]));
  const afterById = new Map(after.map(row => [row.id, JSON.stringify(row)]));
  const removed = before.filter(row => !afterById.has(row.id)).map(row => row.id);
  const added = after.filter(row => !beforeById.has(row.id)).map(row => row.id);
  const changed = before.filter(row => afterById.has(row.id) && afterById.get(row.id) !== beforeById.get(row.id)).map(row => row.id);
  return { 基线条数: before.length, 现有条数: after.length, 删除: removed, 新增: added, 同id被改: changed };
}

const out = {};
out['api-plans.json'] = compare('api-plans.json', doc => (doc && doc.plans) || []);
out['plans.json'] = compare('plans.json', doc => (doc && doc.plans) || []);
out['deals.json'] = compare('deals.json', doc => (doc && doc.deals) || []);

/** 历史三件：判据 —— ① `baseline` 快照必须逐字节不变（它是"历史不许改写"的那份冻结物）；
 *  ② 基线的 `events` 行必须**逐字节**still 在（历史只许追加）；③ 新增的 events 行数（允许增长）。 */
const HISTORIES = [
  'scripts/data/deal-history.json',
  'scripts/data/plan-history.json',
  'scripts/data/api-plan-history.json'
];
out.历史 = {};
for (const rel of HISTORIES) {
  const beforeDoc = show(rel) || {};
  const afterDoc = readNow(rel) || {};
  const beforeEvents = Array.isArray(beforeDoc.events) ? beforeDoc.events : [];
  const afterEvents = Array.isArray(afterDoc.events) ? afterDoc.events : [];
  const afterSet = new Set(afterEvents.map(row => JSON.stringify(row)));
  const missing = beforeEvents.filter(row => !afterSet.has(JSON.stringify(row)));
  const beforeBaseline = JSON.stringify(beforeDoc.baseline === undefined ? null : beforeDoc.baseline);
  const afterBaseline = JSON.stringify(afterDoc.baseline === undefined ? null : afterDoc.baseline);
  out.历史[rel] = {
    baseline快照逐字节相同: beforeBaseline === afterBaseline,
    baseline字节数: `${beforeBaseline.length} → ${afterBaseline.length}`,
    基线events行数: beforeEvents.length,
    现有events行数: afterEvents.length,
    基线events里现盘找不到相同行的条数: missing.length,
    events新增行数: afterEvents.length - beforeEvents.length,
    样例: missing.slice(0, 2).map(row => JSON.stringify(row).slice(0, 120))
  };
}

/** 稳定 ID：派生 id = sha1('model|' + slug) 前 12 位；基线 vs 现在逐条比 */
const crypto = require('crypto');
const modelIdOf = slug => crypto.createHash('sha1').update(`model|${slug}`).digest('hex').slice(0, 12);
const beforeModels = (show('models.json') || {}).models || [];
const afterModels = (readNow('models.json') || {}).models || [];
const idChanged = beforeModels.filter(model => afterModels.some(now => now.slug === model.slug && now.id !== model.id)).map(model => model.slug);
out['稳定 ID'] = {
  基线模型数: beforeModels.length,
  现有模型数: afterModels.length,
  新增slug: afterModels.filter(m => !beforeModels.some(b => b.slug === m.slug)).map(m => m.slug),
  删除slug: beforeModels.filter(b => !afterModels.some(m => m.slug === b.slug)).map(b => b.slug),
  同slug但id变了: idChanged,
  重算id与产物id不一致: afterModels.filter(m => m.id !== modelIdOf(m.slug)).map(m => m.slug)
};

console.log(JSON.stringify(out, null, 2));
