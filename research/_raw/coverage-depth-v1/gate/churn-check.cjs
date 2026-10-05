#!/usr/bin/env node
/**
 * coverage-depth-v1：**Stable ID churn 双向差**（题面 §51 的 P0 守卫）。
 *
 * 判据不是「条数有没有变」（数据本来就该增长，写死条数会被顶翻 —— §47），而是**集合关系**：
 *   · 新增（in current, not in baseline）→ 允许，但逐个列出供人工确认；
 *   · 消失（in baseline, not in current）→ **每一类都是 P0**，除非本轮明确发现过去身份错误
 *     并经过高风险裁决；本脚本只报事实，不做裁决。
 *
 * 用法：
 *   node research/_raw/coverage-depth-v1/gate/churn-check.cjs [--baseline=<path>]
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const args = process.argv.slice(2);
const flag = name => {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const BASELINE = flag('baseline')
  || path.join(ROOT, 'research', '_raw', 'coverage-depth-v1', 'baseline', 'stable-ids.json');
const OUT = path.join(ROOT, 'research', '_raw', 'coverage-depth-v1', 'gate', 'churn');

const readJson = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const sortFn = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');

function current() {
  const registry = readJson('scripts/data/models.json');
  const published = readJson('models.json');
  const providers = readJson('scripts/data/providers.json');
  const deals = readJson('deals.json');
  const plans = readJson('plans.json');
  const apiPlans = readJson('api-plans.json');
  const targetsDoc = readJson('scripts/data/coverage-targets.json');
  return {
    registrySlugs: Object.keys(registry).filter(k => !k.startsWith('_')).sort(sortFn),
    publishedModelIds: published.models.map(m => m.id).sort(sortFn),
    publishedModelSlugs: published.models.map(m => m.slug).sort(sortFn),
    providerKeys: Object.keys(providers).filter(k => !k.startsWith('_')).sort(sortFn),
    dealIds: deals.deals.map(d => d.id).sort(sortFn),
    planIds: plans.plans.map(p => p.id).sort(sortFn),
    apiPlanIds: apiPlans.plans.map(p => p.id).sort(sortFn),
    coverageTargetProviders: targetsDoc.targets.map(t => t.provider).sort(sortFn),
    coverageTargetSig: sha256(Buffer.from(JSON.stringify(targetsDoc.targets.map(t => [t.provider, t.tier, t.role, t.dimensionIntent, t.currentTargets, t.rulings])), 'utf8'))
  };
}

function main() {
  if (!fs.existsSync(BASELINE)) {
    console.error(`❌ 找不到基线：${BASELINE}（先在 cd-baseline 上跑 capture-baseline-dist.cjs）`);
    return 1;
  }
  const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
  const now = current();

  const summary = { generatedAt: new Date().toISOString(), baseline, head: null };
  let removals = 0;
  summary.classes = {};
  for (const key of Object.keys(now)) {
    if (key === 'coverageTargetSig') continue;
    const before = new Set(baseline[key] || []);
    const after = new Set(now[key] || []);
    const added = [...after].filter(x => !before.has(x)).sort(sortFn);
    const removed = [...before].filter(x => !after.has(x)).sort(sortFn);
    removals += removed.length;
    summary.classes[key] = { before: before.size, after: after.size, added, removed };
  }
  summary.coverageTargetSigChanged = baseline.coverageTargetSig !== now.coverageTargetSig;
  summary.totalRemovals = removals;
  summary.verdict = removals === 0 ? 'NO_ID_REMOVED' : 'ID_REMOVED_NEEDS_RULING';

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'churn.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

  for (const [key, row] of Object.entries(summary.classes)) {
    console.log(`${row.removed.length ? '❌' : '✅'} ${key}: ${row.before} → ${row.after}（新增 ${row.added.length} · 消失 ${row.removed.length}）`);
    if (row.removed.length) console.log(`     消失：${row.removed.slice(0, 20).join(', ')}${row.removed.length > 20 ? ' …' : ''}`);
  }
  console.log(`\n${removals === 0 ? '✅ Stable ID：零消失' : `❌ Stable ID：${removals} 个既有 id 消失，必须逐条裁决`}`);
  console.log(`   coverageTargets 结构指纹变化：${summary.coverageTargetSigChanged ? '是（本轮预期会变：currentTargets / rulings 有兑现）' : '否'}`);
  console.log(`   结果：${path.relative(ROOT, path.join(OUT, 'churn.json'))}`);
  return 0; // 只报事实：消失要不要阻塞由人工裁决
}

process.exit(main());
