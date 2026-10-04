#!/usr/bin/env node
/**
 * v3.0 §17：**独立 join 对账**（Model Registry → 模型详情页计价行）。
 *
 * 它存在的唯一理由：**不让被测判据自证**。
 * `scripts/lib/models-page.js` 与 `scripts/lib/model-registry.js` 既是渲染/映射的实现，
 * 又是页面自测的期望来源 —— 同源判定可以整体错而全绿（审计 P1-12 就是这么漏掉的：
 * `models-page.js` 的第一条匹配 bug 与页面断言的期望来自同一个函数，行数永远"对得上"）。
 *
 * 因此本文件：
 *   · **禁止** `require` 任何被测判据 —— 不 require `models-page`、不 require `model-registry`，
 *     也不 require 它们的任何辅助（`apiTargetOf` / `apiReferencesOf` / `modelReferencesOf` …）；
 *   · 期望**自己算**：直接读 `api-plans.json` 与 `scripts/data/model-registry-links.json` 的原文，
 *     按 `(apiPlanId, modelKey, 记录内真实 variant)` 展开（`variant: null` = 该 modelKey 的全部真实变体）；
 *   · 实际**从产物回读**：解析 `dist.qc-registry/models/<slug>/index.html` 的 `<tr class="mapirow">` 标记；
 *   · 输出四项计数 + 逐条清单：`missing` / `extra` / `duplicate source identity` / `multi-owner`。
 *
 * 用法：
 *   node scripts/tools/registry-join-audit.js                 # 默认读 dist.qc-registry/
 *   node scripts/tools/registry-join-audit.js --dist=dist/    # 换产物目录
 *   node scripts/tools/registry-join-audit.js --json          # 机器可读（供页面自测参与断言）
 *   node scripts/tools/registry-join-audit.js --silent        # 只输出 JSON（selftest 用）
 *
 * 退出码：0 = 四项计数全 0；1 = 有缺口（逐条打印）。
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const MODELS_SRC = path.join(ROOT, 'scripts', 'data', 'models.json');
const LINKS_SRC = path.join(ROOT, 'scripts', 'data', 'model-registry-links.json');
const API_PLANS_SRC = path.join(ROOT, 'api-plans.json');

const JSON_OUT = process.argv.includes('--json') || process.argv.includes('--silent');
const SILENT = process.argv.includes('--silent');
const distArg = process.argv.find(arg => arg.startsWith('--dist='));
const DIST = distArg ? path.resolve(distArg.slice('--dist='.length)) : path.join(ROOT, 'dist.qc-registry');

/** 读原文（**不经过任何被测模块** —— 这整份工具的存在理由就是不自证） */
function readJson(file, label) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    console.error(`❌ 读不到 ${label}（${file}）：${error.message}`);
    process.exit(1);
  }
}

/**
 * 跑一次对账。返回结构化报告（**纯函数式**：可被 `--silent` 之外的方式复用，
 * 让页面自测能拿独立结果参与断言，而不是自己跟自己比）。
 *
 * @param {{dist?:string}} [options]
 */
function runJoinAudit(options = {}) {
  const dist = options.dist ? path.resolve(options.dist) : DIST;
  const apiPlans = (readJson(API_PLANS_SRC, 'api-plans.json').plans) || [];
  const modelsRaw = readJson(MODELS_SRC, 'scripts/data/models.json');
  const linksDoc = readJson(LINKS_SRC, 'scripts/data/model-registry-links.json');
  const modelSlugs = Object.keys(modelsRaw).filter(key => !key.startsWith('_')).sort();
  const links = Array.isArray(linksDoc.links) ? linksDoc.links : [];
  const planById = new Map(apiPlans.filter(plan => plan && plan.id).map(plan => [plan.id, plan]));

  /** 一条 API 映射认领的 identity：`{planId, modelKey, variant}`（variant 是记录里的真实值） */
  const identitiesOfLink = link => {
    const plan = planById.get(link.apiPlanId) || null;
    if (!plan || !link.modelKey) return [];
    const entries = (plan.models || []).filter(item => item && item.modelKey === link.modelKey);
    if (!entries.length) return [];
    const wildcard = link.variant === null || link.variant === undefined || link.variant === '';
    const picked = wildcard ? entries : entries.filter(item => item.variant === link.variant);
    // 记录里的 variant 缺省时按 schema 的默认值 `standard` 落键（与页面渲染的 data-variant 同一口径）
    return picked.map(entry => ({
      planId: plan.id,
      modelKey: entry.modelKey,
      variant: entry.variant === null || entry.variant === undefined ? 'standard' : entry.variant
    }));
  };
  const identityKeyOf = identity => `${identity.planId}|${identity.modelKey}|${identity.variant}`;

  const expectedBySlug = new Map(modelSlugs.map(slug => [slug, []]));
  const ownersByIdentity = new Map();
  for (const link of links) {
    if (!link || typeof link !== 'object' || !link.apiPlanId) continue;
    if (!expectedBySlug.has(link.registrySlug)) continue; // 指向不存在的 slug：属于数据层门禁，不在这里编造
    for (const identity of identitiesOfLink(link)) {
      const key = identityKeyOf(identity);
      expectedBySlug.get(link.registrySlug).push(key);
      if (!ownersByIdentity.has(key)) ownersByIdentity.set(key, new Set());
      ownersByIdentity.get(key).add(link.registrySlug);
    }
  }

  const missing = [];
  const extra = [];
  const duplicates = [];
  const multiOwner = [];
  const pages = [];

  const ROW_RE = /<tr class="mapirow" data-item="([^"]*)" data-plan="([^"]*)"\s*data-model-key="([^"]*)" data-variant="([^"]*)" data-provider="([^"]*)"/g;
  /** 旧结构兜底：有 mapirow 却没有 `data-variant` 的行 —— 结构漂移要报，不许静默算 0 行 */
  const LEGACY_ROW_RE = /<tr class="mapirow" data-item="([^"]*)" data-plan="([^"]*)"\s*data-model-key="([^"]*)" data-provider="([^"]*)"/g;
  const rowsOfPage = file => {
    const html = fs.readFileSync(file, 'utf8');
    const rows = [];
    let match;
    while ((match = ROW_RE.exec(html)) !== null) {
      rows.push({
        item: match[1], planId: match[2], modelKey: match[3], variant: match[4],
        provider: match[5], identity: `${match[2]}|${match[3]}|${match[4]}`
      });
    }
    const legacy = [];
    while ((match = LEGACY_ROW_RE.exec(html)) !== null) {
      legacy.push({ item: match[1], planId: match[2], modelKey: match[3], provider: match[4] });
    }
    const rawCount = (html.match(/class="mapirow"/g) || []).length;
    return { rows, legacy, rawCount };
  };

  for (const slug of modelSlugs) {
    const expected = expectedBySlug.get(slug) || [];
    const file = path.join(dist, 'models', slug, 'index.html');
    const exists = fs.existsSync(file);
    if (!expected.length && !exists) continue; // 没有 API 计价、也没有页面：合理
    if (!exists) {
      if (expected.length) missing.push({ scope: 'page', slug, detail: `页面不存在，但期望有 ${expected.length} 行计价` });
      continue;
    }
    const { rows, legacy, rawCount } = rowsOfPage(file);
    pages.push(slug);
    if (rawCount !== rows.length) {
      extra.push({ scope: 'page', slug, detail: `页面有 ${rawCount} 个 mapirow，但只有 ${rows.length} 个带完整标记（data-item|data-plan|data-model-key|data-variant|data-provider）；${legacy.length} 个仍是旧结构（行身份只有 planId，多变体会互相冒充）` });
    }
    const seen = new Set();
    const expectedSet = new Set(expected);
    for (const row of rows) {
      if (seen.has(row.identity)) duplicates.push({ scope: 'page', slug, detail: `同一页出现重复行 identity ${row.identity}` });
      seen.add(row.identity);
      if (row.item !== row.identity) {
        extra.push({ scope: 'page', slug, detail: `行 data-item（${row.item}）≠ 行 identity（${row.identity}）` });
      }
      if (!expectedSet.has(row.identity)) {
        const planKnown = expected.some(key => key.startsWith(`${row.planId}|`));
        extra.push({
          scope: 'page', slug,
          detail: planKnown
            ? `行 ${row.identity} 不是该模型的真实计价条目（同记录里换过 variant / modelKey 冒充）`
            : `行 ${row.identity} 不在该模型的任何显式映射里（凭空出现的行）`
        });
      }
    }
    for (const key of expectedSet) {
      if (!seen.has(key)) missing.push({ scope: 'page', slug, detail: `计价条目 ${key} 没有渲染成行（一个真实 pricing item 在页面上不存在）` });
    }
    const counted = new Map();
    for (const key of expected) counted.set(key, (counted.get(key) || 0) + 1);
    for (const [key, count] of counted) {
      if (count > 1) duplicates.push({ scope: 'registry', slug, detail: `同一条 identity ${key} 被同一个 slug 认领 ${count} 次` });
    }
  }

  for (const [key, owners] of ownersByIdentity) {
    if (owners.size > 1) multiOwner.push({ identity: key, owners: [...owners].sort() });
  }

  /** 展开后的期望总行数 = 真实计价条目数（一条 pricing item = 一行） */
  const expectedTotal = [...expectedBySlug.values()].reduce((sum, list) => sum + list.length, 0);
  const allPricingItems = apiPlans.reduce((sum, plan) => sum + ((plan && plan.models) || []).length, 0);

  /**
   * 受影响口径（自己重算，不引用任何外部结论）：
   *   · 多变体组 = 某个 (apiPlanId, modelKey) 在这条记录里有 >1 个真实 variant；
   *   · 受影响 slug = 认领了至少一个多变体组的模型。
   */
  const multiVariantGroups = [];
  for (const plan of apiPlans) {
    const byKey = new Map();
    for (const entry of (plan && plan.models) || []) {
      if (!entry) continue;
      if (!byKey.has(entry.modelKey)) byKey.set(entry.modelKey, []);
      byKey.get(entry.modelKey).push(entry.variant);
    }
    for (const [modelKey, variants] of byKey) {
      if (variants.length > 1) multiVariantGroups.push({ planId: plan.id, modelKey, variants });
    }
  }
  const affectedSlugs = new Set();
  let affectedClaimedRows = 0;
  for (const [slug, list] of expectedBySlug) {
    const rowsFromMulti = list.filter(key => {
      const [planId, modelKey] = key.split('|');
      return multiVariantGroups.some(group => group.planId === planId && group.modelKey === modelKey);
    });
    if (rowsFromMulti.length > new Set(rowsFromMulti.map(key => key.split('|').slice(0, 2).join('|'))).size) {
      affectedSlugs.add(slug);
      affectedClaimedRows += rowsFromMulti.length;
    }
  }

  const counts = {
    missing: missing.length,
    extra: extra.length,
    duplicate: duplicates.length,
    multiOwner: multiOwner.length
  };
  return {
    dist: path.relative(ROOT, dist).replace(/\\/g, '/'),
    models: modelSlugs.length,
    pages: pages.length,
    expectedBySlug: new Map([...expectedBySlug].map(([slug, list]) => [slug, [...list]])),
    multiVariantGroups: multiVariantGroups.length,
    affectedSlugs: [...affectedSlugs].sort(),
    affectedClaimedRows,
    expectedRows: expectedTotal,
    pricingItems: allPricingItems,
    counts,
    problems: counts.missing + counts.extra + counts.duplicate + counts.multiOwner,
    missing,
    extra,
    duplicate: duplicates,
    multiOwner
  };
}

/* ------------------------------------------------------------------ */
/* CLI                                                                  */
/* ------------------------------------------------------------------ */

function main() {
  const report = runJoinAudit();
  const { missing, extra, duplicates, multiOwner } = {
    missing: report.missing, extra: report.extra, duplicates: report.duplicate, multiOwner: report.multiOwner
  };

  if (!SILENT) {
    console.log('=== §17 独立 join 对账（Model Registry → /models/<slug>/ 计价行） ===');
    console.log(`产物目录        : ${report.dist}`);
    console.log(`模型 / 已发布页 : ${report.models} / ${report.pages}`);
    console.log(`期望行（展开后）: ${report.expectedRows} 行（api-plans 真实计价条目 ${report.pricingItems} 条）`);
    console.log(`多变体（旧口径会吞行）: ${report.multiVariantGroups} 组 · 落在 ${report.affectedSlugs.length} 个 slug 上（共 ${report.affectedClaimedRows} 行）`);
    console.log(`   ${report.affectedSlugs.join(' / ')}`);
    console.log(`   missing      : ${report.counts.missing}`);
    console.log(`   extra        : ${report.counts.extra}`);
    console.log(`   duplicate    : ${report.counts.duplicate}`);
    console.log(`   multi-owner  : ${report.counts.multiOwner}`);
    const dump = (title, list) => {
      if (!list.length) return;
      console.log(`\n── ${title} ──`);
      list.slice(0, 30).forEach(item => console.log(`  · ${item.slug || item.identity} : ${item.detail || `owners=${item.owners.join(' / ')}`}`));
      if (list.length > 30) console.log(`  … 另有 ${list.length - 30} 条`);
    };
    dump('missing', missing);
    dump('extra', extra);
    dump('duplicate source identity', duplicates);
    dump('multi-owner', multiOwner);
  }

  if (JSON_OUT) {
    console.log(`\nJSON:\n${JSON.stringify({ ...report, expectedBySlug: undefined }, null, 2)}`);
  }
  if (!SILENT) {
    console.log(report.problems
      ? `\n❌ 独立 join 对账有 ${report.problems} 处缺口。`
      : '\n✅ 独立 join 对账通过：missing 0 · extra 0 · duplicate 0 · multi-owner 0。');
  }
  return report.problems ? 1 : 0;
}

module.exports = { runJoinAudit, ROOT, DIST };

if (require.main === module) process.exit(main());
