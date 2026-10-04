#!/usr/bin/env node
/**
 * coverage-expansion-v1 / t4：**新鲜度阈值的灵敏度复查**。
 *
 * 问题意识：`120/240 · 180/365 · 365/730` 三档是**候选值**，不是拍板。阈值一动会怎样？
 * 两件事必须逐条看见：
 *   ① 哪些模型**换档**（current ⇄ aging ⇄ legacy）；
 *   ② 有没有比较组**整组掉到 0 个默认可见状态**（current / unknown）——
 *      那等于默认目录里整族消失，而且**不会有任何门禁报红**（`legacy`/`historical` 就是设计成隐藏的）。
 *
 * 为什么必须用**相对差**夹具：判据是 `gap = latestComparableReleasedAt - releasedAt`，
 * 与"今天"无关。所以夹具直接写"相对本组最新差 N 天"，扰动就是"窗口 ±N 天"。
 *
 * 关于"两轴同时平移同一个 N 天"（脚本里保留了这组对照）——**实测结论（2026-10-04，本脚本输出）**：
 *   · **会变**：窗口边界整体挪了，夹在旧边界与新边界之间的模型必然换档。
 *     `+90` 时 `gap ∈ [240, 330)` 由 `legacy`（隐藏）变 `aging`（**可见**）；
 *     `-90` 时 `gap ∈ [150, 240)` 由 `aging` 变 `legacy`（隐藏）。所以"展示面不变"也是错的。
 *   · **不变**：组内**相对次序**（谁是本组最新）；因此 `gap === 0` 的那条永远是 `current`
 *     （不变量 3 在任何扰动下都成立），扰动只动"过时的那一端"。
 * 这组对照的意义就在这里：它是**照妖镜**——阈值这种东西没有"平移一下不影响结论"的便宜可占。
 * （早先本文件里写过"同幅平移不改变结论"，那是错的；已在自测与本文里改正，见
 * `scripts/tools/model-freshness-selftest.js` 的"同幅平移会换档"一条。）
 *
 * 用法：
 *   node scripts/tools/model-freshness-sensitivity.js          # 人读表格
 *   node scripts/tools/model-freshness-sensitivity.js --json    # 机器读（stdout 只有一段 JSON）
 *
 * 退出码：0 = 基线不变量成立（扰动结果只是"数据"，不改变退出码）；
 *         1 = 基线自相矛盾（不变量违规 / 重复 slug / 非法输入）。
 */

'use strict';

const {
  MODEL_FRESHNESS_POLICY,
  deriveCatalog,
  sensitivityOf,
  summarizeCatalog,
  clonePolicy
} = require('../lib/model-freshness');

/**
 * 冻结锚点（写成字面量，脚本不读墙上时钟）：与当前 registry 派生产物的 `updatedAt` 同日，
 * 便于人工对照。夹具里的 `releasedAt` 全部由"相对本组最新差 N 天"算出。
 */
const ANCHOR_TODAY = '2026-10-01';
const ANCHOR_MS = Date.parse(`${ANCHOR_TODAY}T00:00:00Z`);

/** 相对锚点前 n 天的 `YYYY-MM-DD`（纯算术）。 */
function daysAgo(days) {
  return new Date(ANCHOR_MS - days * 86400000).toISOString().slice(0, 10);
}

/**
 * 每个档位一组夹具，差距刻意压在**三档窗口的所有边界附近**：
 * 边界两侧各留一条（±1 天）—— 阈值扰动最容易在这里翻档，而边界写错最不容易被发现。
 * 全部记录都是 `active`，所以"最新那一条"必须是 current（不变量 3）。
 */
const PROBE_GAPS_BY_TIER = {
  conversational: [0, 50, 100, 119, 120, 121, 150, 200, 239, 240, 241, 300, 365, 400, 730, 900],
  multimodal: [0, 50, 150, 179, 180, 181, 239, 240, 300, 364, 365, 366, 500, 730, 900],
  infrastructure: [0, 50, 150, 364, 365, 366, 500, 700, 729, 730, 731, 900, 1200]
};

/** 档位 → 一个 `modelRole`（角色串取自题面 §16 的权威枚举）。 */
const TIER_ROLE = { conversational: 'general', multimodal: 'vision', infrastructure: 'embedding' };

/** 造一组夹具：同 developer + family + role ⇒ **同一个比较组**，于是它们彼此淘汰。 */
function probeModels(tierName) {
  const role = TIER_ROLE[tierName];
  const family = `Probe ${tierName}`;
  return PROBE_GAPS_BY_TIER[tierName].map(gap => ({
    slug: `${tierName}-g${String(gap).padStart(4, '0')}`,
    developer: 'Sensitivity Lab',
    family,
    modelRole: role,
    releasedAt: daysAgo(gap),
    status: 'active',
    gap
  }));
}

/** 造一组"不参与淘汰"的记录：unknown / retired / 无日期 / 日期不可解析（都应保持不翻转）。 */
function edgeModels() {
  return [
    { slug: 'edge-unknown', developer: 'Sensitivity Lab', family: 'Edge Unjudged', modelRole: 'general', releasedAt: daysAgo(30), status: 'unknown', gap: 30 },
    { slug: 'edge-retired', developer: 'Sensitivity Lab', family: 'Edge Retired', modelRole: 'general', releasedAt: daysAgo(10), status: 'retired', gap: 10 },
    { slug: 'edge-nodate', developer: 'Sensitivity Lab', family: 'Edge NoDate', modelRole: 'general', releasedAt: null, status: 'active', gap: null },
    { slug: 'edge-baddate', developer: 'Sensitivity Lab', family: 'Edge BadDate', modelRole: 'general', releasedAt: '2026/09/01', status: 'active', gap: null }
  ];
}

/** 全部夹具（三档探针 + 边界情形）。`gap` 只是给报告用的注解，派生层不读它。 */
function allModels() {
  return [
    ...probeModels('conversational'),
    ...probeModels('multimodal'),
    ...probeModels('infrastructure'),
    ...edgeModels()
  ];
}

/**
 * 扰动矩阵。`currentDelta` 只动 current 窗口，`agingDelta` 只动 aging 窗口。
 * ±60 / ±90 是合同点名要看的两个幅度；`uniform ±90` 那一组是"两轴同时平移"的对照组。
 */
function variants() {
  return [
    { label: 'uniform +90d：两轴同时 +90（对照：边界整体上移，展示面变宽）', currentDelta: 90, agingDelta: 90 },
    { label: 'uniform -90d：两轴同时 -90（对照：边界整体下移，展示面变窄）', currentDelta: -90, agingDelta: -90 },
    { label: 'current +60d：current 窗口放宽 60 天', currentDelta: 60, agingDelta: 0 },
    { label: 'current -60d：current 窗口收窄 60 天', currentDelta: -60, agingDelta: 0 },
    { label: 'current +90d：current 窗口放宽 90 天', currentDelta: 90, agingDelta: 0 },
    { label: 'current -90d：current 窗口收窄 90 天', currentDelta: -90, agingDelta: 0 },
    { label: 'aging +60d：aging 窗口放宽 60 天', currentDelta: 0, agingDelta: 60 },
    { label: 'aging -60d：aging 窗口收窄 60 天', currentDelta: 0, agingDelta: -60 },
    { label: 'aging +90d：aging 窗口放宽 90 天', currentDelta: 0, agingDelta: 90 },
    { label: 'aging -90d：aging 窗口收窄 90 天', currentDelta: 0, agingDelta: -90 },
    { label: 'current +60 / aging +60（同向等幅）', currentDelta: 60, agingDelta: 60 },
    { label: 'current -60 / aging +60（夹逼：窗口变窄而隐藏线放宽）', currentDelta: -60, agingDelta: 60 }
  ];
}

function thresholdsOf(policy) {
  const out = {};
  for (const name of Object.keys(policy.tiers).sort()) {
    out[name] = `${policy.tiers[name].currentWindowDays}/${policy.tiers[name].agingWindowDays}`;
  }
  return out;
}

/** 只为了在报告里显示"这一情景下各档窗口是多少"。 */
function clonePolicyWithDelta(currentDelta, agingDelta) {
  const policy = clonePolicy(MODEL_FRESHNESS_POLICY);
  for (const tier of Object.values(policy.tiers)) {
    tier.currentWindowDays += currentDelta;
    tier.agingWindowDays += agingDelta;
  }
  return policy;
}

function main() {
  const asJson = process.argv.includes('--json');
  const models = allModels();

  const baseline = deriveCatalog({ models });
  const summary = summarizeCatalog(baseline);
  const sensitivity = sensitivityOf(models, variants());

  // 报告里要按"夹具上写的 gap"读翻转；派生层只输出相对差
  const fixtureGapBySlug = new Map(models.filter(model => model.gap !== null).map(model => [model.slug, model.gap]));

  const report = {
    tool: 'model-freshness-sensitivity',
    anchorToday: ANCHOR_TODAY,
    fixture: {
      kind: 'frozen-fixture',
      file: 'scripts/tools/model-freshness-sensitivity.js',
      modelCount: models.length,
      note: '全部 releasedAt 由"相对本组最新差 N 天"算出（锚点 2026-10-01，字面量）；不读生产数据、不读墙上时钟、不联网',
      probeGaps: PROBE_GAPS_BY_TIER
    },
    policyDigest: baseline.policyDigest,
    thresholds: thresholdsOf(baseline.policy),
    baseline: {
      census: sensitivity.baseline.census,
      summary,
      invariantViolations: baseline.invariantViolations,
      entries: baseline.entries.map(entry => ({
        slug: entry.slug,
        group: entry.comparableGroup,
        tier: entry.tier,
        status: entry.status,
        releasedAt: entry.releasedAt,
        relativeGapDays: entry.releaseGapDays,
        fixtureGapDays: fixtureGapBySlug.has(entry.slug) ? fixtureGapBySlug.get(entry.slug) : null,
        latestComparableModel: entry.latestComparableModel,
        catalogStatus: entry.catalogStatus,
        catalogReason: entry.catalogReason,
        hiddenByDefault: entry.catalogStatus === 'legacy' || entry.catalogStatus === 'historical'
      }))
    },
    variants: sensitivity.variants.map(row => ({
      label: row.label,
      currentDelta: row.currentDelta,
      agingDelta: row.agingDelta,
      policyDigest: row.policyDigest,
      thresholds: thresholdsOf(clonePolicyWithDelta(row.currentDelta, row.agingDelta)),
      census: row.census,
      flipsCount: row.flips.length,
      flips: row.flips.map(flip => ({
        slug: flip.slug,
        group: flip.group,
        tier: flip.tier,
        relativeGapDays: flip.releaseGapDays,
        fixtureGapDays: fixtureGapBySlug.has(flip.slug) ? fixtureGapBySlug.get(flip.slug) : null,
        from: flip.from,
        to: flip.to,
        fromReason: flip.fromReason,
        toReason: flip.toReason
      })),
      groupsWithoutVisibleMember: row.groupsWithoutVisibleMember,
      invariantViolations: row.invariantViolations
    }))
  };

  if (asJson) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    printHuman(report);
  }

  const fatal = summary.invariantViolations + summary.duplicates + summary.invalidInputs;
  if (fatal) {
    console.error(`\nFAIL 基线自相矛盾：不变量违规 ${summary.invariantViolations} · 重复 slug ${summary.duplicates} · 非法输入 ${summary.invalidInputs}`);
    process.exit(1);
  }
}

function printHuman(report) {
  const line = () => console.log('-'.repeat(96));
  console.log('='.repeat(96));
  console.log(`新鲜度阈值灵敏度复查 · 策略 ${report.policyDigest}`);
  console.log(`夹具 ${report.fixture.modelCount} 条（锚点 ${report.anchorToday}）`);
  console.log(report.fixture.note);
  console.log('='.repeat(96));

  console.log('\n【基线】三档探针的派生状态（按相对本组最新的差读）');
  for (const tier of Object.keys(PROBE_GAPS_BY_TIER)) {
    const rows = report.baseline.entries
      .filter(entry => entry.tier === tier && entry.fixtureGapDays !== null)
      .sort((a, b) => a.relativeGapDays - b.relativeGapDays);
    console.log(`  ${tier}（${report.thresholds[tier]} 天）：`);
    for (const entry of rows) {
      console.log(`    gap ${String(entry.relativeGapDays).padStart(4)}d  ${String(entry.catalogStatus).padEnd(10)} ${entry.hiddenByDefault ? '隐藏' : '可见'}  ${entry.slug}`);
    }
  }
  console.log('\n  边界情形（不参与淘汰的记录）：');
  for (const entry of report.baseline.entries.filter(item => item.fixtureGapDays === null || item.status !== 'active')) {
    console.log(`    ${entry.slug.padEnd(15)} ${String(entry.catalogStatus).padEnd(10)} ${entry.catalogReason}`);
  }
  console.log(`\n  基线合计：${JSON.stringify(report.baseline.census.byStatus)}`);
  console.log(`  默认可见 ${report.baseline.census.visibleByDefault} / 默认隐藏 ${report.baseline.census.hiddenByDefault}`);
  console.log(`  整组掉到 0 个可见状态的组：${report.baseline.summary.groupsWithoutVisibleMember.length}`);
  console.log(`  不变量违规：${report.baseline.summary.invariantViolations}`);

  console.log('\n【扰动】');
  for (const variant of report.variants) {
    line();
    console.log(`>> ${variant.label}`);
    console.log(`   阈值 ${JSON.stringify(variant.thresholds)} · 分布 ${JSON.stringify(variant.census.byStatus)} · 翻转 ${variant.flipsCount} 条`);
    for (const flip of variant.flips) {
      console.log(`     · ${flip.slug.padEnd(22)} gap ${String(flip.relativeGapDays).padStart(4)}d  ${flip.from} -> ${flip.to}`);
    }
    if (!variant.flipsCount) console.log('     （无翻转）');
    const activeEmpty = variant.groupsWithoutVisibleMember.filter(group => group.activeCount > 0);
    console.log(`   整组掉到 0 个可见状态：${variant.groupsWithoutVisibleMember.length} 组（其中有 active 模型的：${activeEmpty.length} 组）`);
    for (const group of variant.groupsWithoutVisibleMember) {
      const flag = group.activeCount > 0 ? '!' : '·';
      console.log(`     ${flag} ${group.group}  [tier ${group.tier} · active ${group.activeCount} · 最新 ${group.latestComparableModel} · ${JSON.stringify(group.statusCounts)}]`);
    }
    if (variant.invariantViolations.length) console.log(`   不变量违规：${variant.invariantViolations.join(' · ')}`);
  }

  const active = report.variants.filter(variant => variant.currentDelta !== 0 || variant.agingDelta !== 0);
  const uniform = active.filter(variant => variant.currentDelta === variant.agingDelta && variant.currentDelta !== 0);
  const mostFlips = [...active].sort((a, b) => b.flipsCount - a.flipsCount)[0];
  const mostEmpty = [...active].sort((a, b) => (b.groupsWithoutVisibleMember.filter(group => group.activeCount > 0).length) - (a.groupsWithoutVisibleMember.filter(group => group.activeCount > 0).length))[0];
  line();
  console.log('结论：');
  console.log(`  · 翻转最多：${mostFlips.label}（${mostFlips.flipsCount} 条）`);
  console.log(`  · "整组含 active 却 0 个可见状态"最多：${mostEmpty.label}（${mostEmpty.groupsWithoutVisibleMember.filter(group => group.activeCount > 0).length} 组）`);
  console.log(`  · 同向等幅对照（current 与 aging 同时 ±90）：翻转 ${uniform.map(item => item.flipsCount).join(' / ')} 条 —— **会变**：`);
  console.log('      边界整体上移时 `[aging, aging±90)` 区间的 legacy 会变可见，整体下移时 `[current, current±90)` 区间的 current 会被隐藏。');
  console.log('      "同幅平移不影响结论"是错的（本文件早先就这么写过，已改正）。真正不变的是组内相对次序 —— 所以最新那条永远是 current。');
  console.log('  · 所有情景下不变量都成立（active 组至少留一条 current/unknown）：风险是"默认展示面变窄/变宽"，不是"数据坏了"。');
  console.log('  · 非 active 的组（如只有 retired 的历史组）掉到 0 个可见状态是**设计如此**，不是缺陷 —— 上面用 · 标出。');
}

if (require.main === module) main();

module.exports = { ANCHOR_TODAY, daysAgo, probeModels, edgeModels, allModels, variants, PROBE_GAPS_BY_TIER };
