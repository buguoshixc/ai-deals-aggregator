#!/usr/bin/env node
/**
 * **候选关联报告**（Phase 2.4 §九）：把「可能相关」的优惠 ↔ 套餐对列出来，**只供人工 review**。
 *
 * 用法：
 *   node scripts/tools/deal-plan-link-candidates.js            # 写 research/_raw/possible-deal-plan-links.json 并打印清单
 *   node scripts/tools/deal-plan-link-candidates.js --print     # 只打印，不写文件
 *
 * ## 这个工具**没有**写生产关系的能力（这是设计，不是疏忽）
 *
 * 生产关系的唯一真值是 `scripts/data/deal-plan-links.json`，它**只能由人编辑**：
 * 每条都要写 provider、basis、官方出处与确认日期。相似度匹配给出的只是「值得看一眼」，
 * 把它自动写进去就等于让一个猜出来的东西穿上「已确认」的外衣 —— 那正是本阶段要避免的失败模式。
 * 因此本文件里没有对关系表的任何写操作（自测里有一条断言读源码钉住这一点）。
 *
 * 判据（全部确定性，无 AI、无网络）见 `lib/deal-plan-links.js` 的 `candidatesOf()`：
 *   vendor-alias / url-host / title-mention。置信级别只是排序提示，不是结论。
 */

const fs = require('fs');
const path = require('path');

const links = require('../lib/deal-plan-links');
const providers = require('../lib/providers');

const ROOT = path.join(__dirname, '..', '..');
const OUT_FILE = path.join(ROOT, 'research', '_raw', 'possible-deal-plan-links.json');

const PRINT_ONLY = process.argv.includes('--print');
const LIMIT = (() => {
  const arg = process.argv.find(item => item.startsWith('--limit='));
  const value = arg ? Number(arg.slice('--limit='.length)) : 40;
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 40;
})();

const CONFIDENCE_ORDER = { high: 0, medium: 1, low: 2 };

function main() {
  const dealsDoc = JSON.parse(fs.readFileSync(path.join(ROOT, 'deals.json'), 'utf8'));
  const plansDoc = JSON.parse(fs.readFileSync(path.join(ROOT, 'plans.json'), 'utf8'));
  const providerTable = providers.load().table;

  const loaded = links.load();
  const linkedPairs = new Set();
  if (!loaded.missing && !loaded.broken) {
    for (const record of (loaded.doc.links || []).concat(loaded.doc.retired || [])) {
      for (const planId of (record && record.planIds) || []) linkedPairs.add(`${record.dealId}\u0000${planId}`);
    }
  }

  const candidates = links.candidatesOf(dealsDoc.deals, plansDoc.plans, { providerTable })
    .map(item => Object.assign({}, item, { alreadyLinked: linkedPairs.has(`${item.dealId}\u0000${item.planId}`) }))
    .sort((a, b) => {
      if (a.alreadyLinked !== b.alreadyLinked) return a.alreadyLinked ? 1 : -1;
      const grade = CONFIDENCE_ORDER[a.confidence] - CONFIDENCE_ORDER[b.confidence];
      if (grade !== 0) return grade;
      if (a.dealId !== b.dealId) return a.dealId < b.dealId ? -1 : 1;
      return a.planId < b.planId ? -1 : 1;
    });

  const payload = {
    generatedAt: links.asOfOf({
      dealsUpdatedAt: dealsDoc.updatedAt,
      plansUpdatedAt: plansDoc.updatedAt
    }),
    note: '相似度候选，**只供人工 review**。生产关系的真值是 scripts/data/deal-plan-links.json，'
      + '只能由人编辑（每条要写 provider / basis / 官方出处 / 确认日期）。本文件由 '
      + 'scripts/tools/deal-plan-link-candidates.js 生成，不会被任何构建或采集流程读取。',
    rules: ['vendor-alias', 'url-host', 'title-mention'],
    counts: {
      candidates: candidates.length,
      alreadyLinked: candidates.filter(item => item.alreadyLinked).length,
      byConfidence: {
        high: candidates.filter(item => item.confidence === 'high').length,
        medium: candidates.filter(item => item.confidence === 'medium').length,
        low: candidates.filter(item => item.confidence === 'low').length
      }
    },
    candidates
  };

  const fresh = candidates.filter(item => !item.alreadyLinked);
  console.log('=== 可能相关的优惠 ↔ 套餐（候选，仅供人工 review）===');
  console.log(`候选 ${candidates.length} 条（其中已是生产关系的 ${payload.counts.alreadyLinked} 条）` +
    ` · high ${payload.counts.byConfidence.high} / medium ${payload.counts.byConfidence.medium} / low ${payload.counts.byConfidence.low}`);
  console.log('判据：vendor-alias（厂商精确别名命中）· url-host（同一主机）· title-mention（标题含套餐名）\n');
  for (const item of fresh.slice(0, LIMIT)) {
    console.log(`  [${item.confidence}] ${item.rules.join('+')}`);
    console.log(`      ${item.dealId} ${item.dealTitle}`);
    console.log(`   →  ${item.planId} ${item.planTitle}`);
  }
  if (fresh.length > LIMIT) console.log(`  … 另有 ${fresh.length - LIMIT} 条（--limit=N 调整；完整清单在 JSON 里）`);
  if (!fresh.length) console.log('  （没有新的候选）');
  console.log('\n下一步（人工）：核对官方页 → 在 scripts/data/deal-plan-links.json 里显式登记 → npm run validate');

  if (PRINT_ONLY) {
    console.log('\n--print：没有写文件。');
    return 0;
  }
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`\n✅ 已写出 ${path.relative(ROOT, OUT_FILE)}（只供 review；不会被构建读取）`);
  return 0;
}

process.exit(main());
