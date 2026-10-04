/**
 * t26 派生与身份复核（acceptance ⑤）。
 *
 *   · 根 `models.json` 与 HEAD 逐字段比对：哪些格变了、为什么；
 *   · 源层 `scripts/data/models.json`：身份集合有没有变（44 条）；
 *   · 派生关系：变了的 `lastSeen` 是不是"它映射到的那些记录的 lastSeen 最大值"（数据驱动，不是 t23 的映射/声明）；
 *   · 与 HEAD 的 api-plans 对照：新出现的 lastSeen 是否来自 t11 新增/更新的记录。
 *
 * 只读；不写任何生产文件。
 * 用法：node research/_raw/t26/derivation-audit.cjs
 */
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const head = rel => JSON.parse(execFileSync('git', ['-C', ROOT, 'show', `HEAD:${rel}`], { encoding: 'utf8' }));
const cur = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const sha256 = file => execFileSync('git', ['-C', ROOT, 'hash-object', file], { encoding: 'utf8' }).trim();

console.log('=== ① 根 models.json：HEAD vs 现在（逐格） ===');
const headPub = new Map(head('models.json').models.map(model => [model.slug, model]));
const curPub = new Map(cur('models.json').models.map(model => [model.slug, model]));
const slugsAdded = [...curPub.keys()].filter(slug => !headPub.has(slug));
const slugsRemoved = [...headPub.keys()].filter(slug => !curPub.has(slug));
console.log(`HEAD ${headPub.size} 条 · 现在 ${curPub.size} 条 · 新增 ${slugsAdded.length} · 删除 ${slugsRemoved.length}`);
const fieldChanges = {};
const changedSlugs = new Set();
for (const [slug, now] of curPub) {
  const before = headPub.get(slug);
  if (!before) continue;
  for (const key of new Set([...Object.keys(before), ...Object.keys(now)])) {
    if (JSON.stringify(before[key]) !== JSON.stringify(now[key])) {
      fieldChanges[key] = (fieldChanges[key] || 0) + 1;
      changedSlugs.add(slug);
      if (key !== 'lastSeen') console.log(`  ⚠️ ${slug}.${key}: ${JSON.stringify(before[key])} → ${JSON.stringify(now[key])}`);
      else console.log(`  · ${slug}.lastSeen: ${JSON.stringify(before[key])} → ${JSON.stringify(now[key])}`);
    }
  }
}
console.log('字段级变化计数：', JSON.stringify(fieldChanges));

console.log('\n=== ② 这些 lastSeen 是不是"它映射到的记录的 lastSeen 最大值"（数据驱动） ===');
const links = cur('scripts/data/model-registry-links.json').links;
const apiNow = new Map(cur('api-plans.json').plans.map(plan => [plan.id, plan]));
const apiHead = new Map(head('api-plans.json').plans.map(plan => [plan.id, plan]));
const plansNow = new Map(cur('plans.json').plans.map(plan => [plan.id, plan]));
for (const slug of [...changedSlugs].sort()) {
  const apiPlanIds = new Set([
    ...links.filter(link => link.registrySlug === slug && link.apiPlanId).map(link => link.apiPlanId),
    ...links.filter(link => link.registrySlug === slug && link.planId).map(link => link.planId)
  ]);
  const seenNow = [];
  const seenHead = [];
  for (const id of apiPlanIds) {
    if (apiNow.has(id)) seenNow.push(apiNow.get(id).lastSeen || null);
    if (apiHead.has(id)) seenHead.push(apiHead.get(id).lastSeen || null);
    if (plansNow.has(id)) seenNow.push(plansNow.get(id).lastSeen || null);
  }
  const max = list => list.filter(Boolean).sort().pop() || null;
  console.log(`  ${slug}: ${headPub.get(slug).lastSeen} → ${curPub.get(slug).lastSeen}`
    + ` | 映射记录 HEAD 最大值=${max(seenHead)} 现在最大值=${max(seenNow)}`);
  const derivedMatches = max(seenNow) === curPub.get(slug).lastSeen || max(seenNow) === null;
  console.log(`     与"现在映射记录的 lastSeen 最大值"一致：${derivedMatches ? '是' : '否'}`);
}

console.log('\n=== ③ 源层 scripts/data/models.json：身份有没有变 ===');
const headSrc = head('scripts/data/models.json');
const curSrc = cur('scripts/data/models.json');
const srcKeys = obj => Object.keys(obj).filter(key => !key.startsWith('_'));
const headSrcSlugs = srcKeys(headSrc);
const curSrcSlugs = srcKeys(curSrc);
console.log(`HEAD ${headSrcSlugs.length} 条身份 · 现在 ${curSrcSlugs.length} 条 · 新增 ${curSrcSlugs.filter(s => !headSrcSlugs.includes(s)).length} · 删除 ${headSrcSlugs.filter(s => !curSrcSlugs.includes(s)).length}`);
const srcFieldChanges = {};
for (const slug of curSrcSlugs) {
  const before = headSrc[slug] || {};
  const now = curSrc[slug];
  for (const key of new Set([...Object.keys(before), ...Object.keys(now)])) {
    if (JSON.stringify(before[key]) !== JSON.stringify(now[key])) srcFieldChanges[key] = (srcFieldChanges[key] || 0) + 1;
  }
}
console.log('源层字段变化计数：', JSON.stringify(srcFieldChanges));

console.log('\n=== ④ 身份稳定性（派生 id 与 slug 逐条相同） ===');
{
  const crypto = require('crypto');
  const idOf = slug => crypto.createHash('sha1').update(`model|${slug}`).digest('hex').slice(0, 12);
  const drift = [...curPub.keys()].filter(slug => headPub.has(slug) && headPub.get(slug).id !== curPub.get(slug).id);
  const recomputed = [...curPub.entries()].filter(([slug, model]) => idOf(slug) !== model.id);
  console.log(`id 漂移 ${drift.length} 条 · 与 sha1('model|' + slug) 不符 ${recomputed.length} 条`);
}

console.log('\n=== ⑤ 根派生文件的 blob 哈希（HEAD vs 工作区） ===');
for (const rel of ['models.json', 'model-registry-links.json']) {
  const headBlob = execFileSync('git', ['-C', ROOT, 'rev-parse', `HEAD:${rel}`], { encoding: 'utf8' }).trim();
  const workBlob = execFileSync('git', ['-C', ROOT, 'hash-object', path.join(ROOT, rel)], { encoding: 'utf8' }).trim();
  console.log(`  ${rel}: HEAD=${headBlob} 工作区=${workBlob} ${headBlob === workBlob ? '（逐字节相同）' : '（不同）'}`);
}

console.log('\n=== ⑥ 源层文件里"改了但不是条目字段"的部分 ===');
{
  const diff = execFileSync('git', ['-C', ROOT, 'diff', 'HEAD', '--', 'scripts/data/models.json'], { encoding: 'utf8' });
  const changed = diff.split('\n').filter(line => /^[+-]/.test(line) && !/^(\+\+\+|---)/.test(line));
  const sample = changed.slice(0, 12).map(line => `${line.slice(0, 1)} ${line.slice(1).trim().slice(0, 110)}`);
  console.log(`  diff 行 ${changed.length} 行；抽样：`);
  for (const line of sample) console.log(`    ${line}`);
}
