#!/usr/bin/env node
/**
 * P1（slug 死锁机器化）的**写侧**：把「已路由厂商的 slug」落进机器账本。
 *
 * 为什么需要它：`/vendor/<slug>/` 是**已发布的 URL 空间**。旧实现要求人先往
 * `scripts/data/vendor-slugs.json` 补一行，漏了就让整个发布停住（Deploy #298 的红点）。
 * 现在 slug 的权威顺序固定为四层，**两边共用 `lib/landing.js` 的同一个解析函数**
 * （`resolveVendorSlug`）：
 *
 *   1. `vendor-slugs.json`（人工覆盖表；改名/想给可读值时才动它）
 *   2. `providers.json` 同名 provider 条目的 slug（历史事实，只读）
 *   3. `scripts/data/vendor-slug-ledger.json`（**本工具维护**的机器账本，禁止手改）
 *   4. `suggestSlug()`（首次遇到的新厂商现场分配；`firstRoutedAt` 由本工具记下）
 *
 * 本工具只在 collect 侧运行（提交数据之前），**构建过程绝不写源数据**。它做四件事：
 *   · 计划里已经路由的厂商若不在账本里 ⇒ 补一行（含首次自动分配的 slug）；
 *   · 账本行的 `status` 与页面状态同步（钉住路由掉出门槛后自动降级 ⇒ `degraded`）；
 *   · 厂商改名（覆盖表/provider 的现算值 ≠ 账本值）**且** `landing-aliases.json`
 *     已登记「旧路由 → 新路由」⇒ 迁移账本到新 slug（旧 URL 由别名页兜住）；
 *   · 改名但没登记别名 ⇒ **只告警、不改账本**：构建会在计划层硬拦（旧 URL 会 404），
 *     这里不能悄悄把账本改掉把问题藏起来。
 *
 * 纪律：账本只由本工具写、只增不删（已发布的 slug 永远留在账本里，哪怕页面暂时降级/掉出门槛）、
 * 行按厂商名做确定性排序、内容没有变化时**不重写文件**（避免每天一次无意义的 generatedAt diff）。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const landing = require('../lib/landing');
const providers = require('../lib/providers');
const history = require('../lib/history');
const modelRegistry = require('../lib/model-registry');
const { load: loadRenderCore } = require('../lib/render-core');

const LEDGER_FILE = landing.VENDOR_SLUG_LEDGER_FILE;
const DEALS_FILE = path.join(ROOT, 'deals.json');
const PLANS_FILE = path.join(ROOT, 'plans.json');
const API_PLANS_FILE = path.join(ROOT, 'api-plans.json');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function main() {
  const dealsDoc = readJson(DEALS_FILE);
  const plansStore = readJson(PLANS_FILE);
  const apiPlansStore = readJson(API_PLANS_FILE);
  const providerTable = providers.load().table;
  const renderCore = loadRenderCore(path.join(ROOT, 'index.html'));
  const vendorKeyOf = deal => renderCore.vendorOf(deal).name;
  const historyStore = history.load();
  const historyEvents = historyStore.missing || historyStore.broken ? [] : history.eventsOf(historyStore.store);

  const modelsLoad = modelRegistry.load();
  const linksLoad = modelRegistry.loadLinks();
  const publishedModels = modelsLoad.missing || modelsLoad.broken || linksLoad.missing || linksLoad.broken
    ? { models: [] }
    : modelRegistry.publishedModels({
      table: modelsLoad.table,
      links: linksLoad.doc,
      apiPlans: apiPlansStore.plans,
      plans: plansStore.plans
    });

  const ledger = landing.loadVendorSlugLedger();
  const aliases = landing.loadAliases();
  const vendorEventCount = landing.vendorEventCountsOf({
    deals: dealsDoc.deals,
    events: historyEvents,
    vendorKeyOf
  });
  const plan = landing.planLandingPages({
    deals: dealsDoc.deals,
    vendorKeyOf,
    vendorSlugs: landing.loadVendorSlugs(),
    eventCountOf: name => vendorEventCount.get(name) || 0,
    plans: plansStore.plans,
    apiPlans: apiPlansStore.plans,
    providerTable,
    models: publishedModels.models,
    modelLinks: (linksLoad.doc && linksLoad.doc.links) || [],
    vendorSlugLedger: ledger
  });

  const warnings = [];
  const rows = new Map();
  for (const row of ledger.vendors) rows.set(row.vendorName, { ...row });

  // 已路由厂商（含 P2 自动降级的钉住路由）→ 账本行。
  let added = 0;
  let statusChanged = 0;
  for (const page of plan.vendorPages) {
    if (!page || page.kind !== 'vendor') continue;
    const name = String(page.key || '');
    const slug = String(page.slug || '');
    if (!name || !slug) continue;
    const status = page.degraded ? 'degraded' : 'active';
    const existing = rows.get(name);
    if (!existing) {
      rows.set(name, { vendorName: name, slug, firstRoutedAt: new Date().toISOString(), status });
      added += 1;
      continue;
    }
    if (existing.status !== status) {
      existing.status = status;
      statusChanged += 1;
    }
  }

  // 改名：现算值（覆盖表 / providers）与账本旧值不同。
  // 只有 landing-aliases.json 已经登记「旧路由 → 新路由」时才迁移；否则只告警（构建层会硬拦）。
  const vendorSlugs = landing.loadVendorSlugs();
  let migrated = 0;
  for (const row of rows.values()) {
    const override = Object.prototype.hasOwnProperty.call(vendorSlugs, row.vendorName)
      ? String(vendorSlugs[row.vendorName] || '') : '';
    const providerEntry = Object.values(providerTable)
      .find(entry => entry && String(entry.name || '') === row.vendorName) || null;
    const fromProvider = providerEntry ? String(providerEntry.slug || '') : '';
    const computed = override || fromProvider;
    if (!computed || computed === row.slug) continue;
    const oldRoute = `vendor/${row.slug}/`;
    const newRoute = `vendor/${computed}/`;
    const alias = aliases[oldRoute];
    if (alias && String(alias.target || '') === newRoute) {
      row.slug = computed;
      row.status = 'active';
      migrated += 1;
    } else {
      warnings.push(`厂商「${row.vendorName}」的 slug 从账本「${row.slug}」变成了现算「${computed}」，`
        + `但 scripts/data/landing-aliases.json 里没有登记 ${oldRoute} → ${newRoute} —— 不改账本；`
        + '构建会在计划层硬拦（旧 URL 会 404）。若改名是有意的，先登记别名再重跑本工具。');
    }
  }

  const vendors = [...rows.values()]
    .map(row => ({
      vendorName: String(row.vendorName),
      slug: String(row.slug),
      firstRoutedAt: String(row.firstRoutedAt || ''),
      status: row.status === 'degraded' ? 'degraded' : 'active'
    }))
    .sort((a, b) => a.vendorName.localeCompare(b.vendorName, 'zh'));

  const prev = JSON.stringify(ledger.vendors);
  const next = JSON.stringify(vendors);
  if (prev !== next) {
    const doc = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      _note: '机器账本（collect 侧 scripts/tools/sync-vendor-slug-ledger.js 维护，**禁止手改**）：'
        + '记录 /vendor/<slug>/ 已发布过的厂商 slug 与首次路由时间。人工要改 slug 时改 scripts/data/vendor-slugs.json（覆盖表），'
        + '并在 scripts/data/landing-aliases.json 登记旧路由 → 新路由，让本工具迁移账本。构建过程不写这份文件。',
      vendors
    };
    fs.writeFileSync(LEDGER_FILE, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
  }

  const statusCount = vendors.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {});
  console.log(`厂商 slug 账本: ${vendors.length} 家（active ${statusCount.active || 0} / degraded ${statusCount.degraded || 0}）`
    + ` · 新增 ${added} · 状态变化 ${statusChanged} · 迁移 ${migrated}`
    + `${prev === next ? ' · 无变化（不重写文件）' : ''}`);
  for (const line of warnings) console.log(`  warn: ${line}`);
  if (plan.problems.length) {
    // 计划层的硬问题（改名未登记别名 / 人的配置错误）不在本工具里吞掉：只说清楚，
    // 让紧随其后的 release gate 用**同一份**计划判据红出来（诊断优先于严格度）。
    console.log(`  注意：落地页计划仍有 ${plan.problems.length} 处问题，构建会硬拦：`);
    for (const line of plan.problems.slice(0, 8)) console.log(`    - ${line}`);
  }
}

main();
