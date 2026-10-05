#!/usr/bin/env node
/**
 * Workstream A（coverage-depth-v1）：**确定性 Release Evidence 队列**生成器。
 *
 * 输入（全部只读）：
 *   · scripts/data/models.json           —— registry 来源层（身份 + releasedAt）
 *   · models.json                        —— 派生产物（comparableGroupSize / catalogStatus）
 *   · scripts/data/model-registry-links.json —— 关系层（是否被 api-plans / plans 引用）
 *   · scripts/data/providers.json        —— developer 显示名 → 官方域 / provider 键
 *   · scripts/data/coverage-targets.json —— provider 键 → tier（core / major / long-tail）
 *
 * 排序键（逐级，全部有确定平局裁决）：
 *   1. unknown 优先：releasedAt 为空（缺日期）的排前面（本轮目标就是把 unknown 压低）
 *   2. 可比组规模降序：comparableGroupSize（大组补一条会带动同组多条判档）
 *   3. provider tier：core > major > long-tail > 未登记（providers.json / coverage-targets.json）
 *   4. 是否被 api-plans / plans 引用：有引用的排前面（引用数降序）
 *   5. slug code-unit 升序（**注意**：不是 localeCompare，避免本地化 collation 影响可重建性）
 *
 * 输出：queue.json（逐条带全部排序键快照，便于复核者重算）
 */
'use strict';
const path = require('path');
const fs = require('fs');

const ROOT = process.argv[2] || process.cwd();
const read = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

const registry = read('scripts/data/models.json');
const derived = read('models.json');
const links = read('scripts/data/model-registry-links.json');
const providers = read('scripts/data/providers.json');
const targets = read('scripts/data/coverage-targets.json');

const TIER_RANK = { core: 0, major: 1, 'long-tail': 2 };
const tierByProviderKey = new Map();
// tier 口径：优先取该 provider 的 model-developer 目标档位；该 provider 只登记了别的 role
// （例如火山引擎登记为 inference-platform）时取其 coverage-target 档位本体 —— 档位是"这家平台
// 在覆盖优先级里的位置"，与它做不做第一方模型无关。
for (const target of targets.targets || []) {
  const existing = tierByProviderKey.get(target.provider);
  if (existing && !(existing.role !== 'model-developer' && target.role === 'model-developer')) continue;
  tierByProviderKey.set(target.provider, { tier: target.tier, role: target.role });
}
const providerKeyByName = new Map();
for (const [key, entry] of Object.entries(providers)) {
  if (key.startsWith('_')) continue;
  if (!entry || typeof entry !== 'object') continue;
  if (entry.name && !providerKeyByName.has(entry.name)) providerKeyByName.set(entry.name, key);
}
const domainsByName = new Map();
for (const [key, entry] of Object.entries(providers)) {
  if (key.startsWith('_')) continue;
  if (entry && Array.isArray(entry.officialDomains)) domainsByName.set(entry.name, entry.officialDomains);
}

// 可比组规模：走**新鲜度的唯一判据**（lib/model-freshness.js），不在这里重算一份分组。
const freshness = require(path.join(ROOT, 'scripts/lib/model-freshness.js'));
const derivedBySlug = new Map((derived.models || []).map(entry => [entry.slug, entry]));
const groupSizeBySlug = new Map(
  freshness.deriveCatalog({ models: (derived.models || []) }).entries.map(entry => [entry.slug, entry.comparableGroupSize])
);
const linkCount = new Map();
for (const link of links.links || []) {
  const slug = link.registrySlug;
  linkCount.set(slug, (linkCount.get(slug) || 0) + 1);
}

const rows = Object.entries(registry)
  .filter(([slug]) => !slug.startsWith('_'))
  .map(([slug, record]) => {
    const d = derivedBySlug.get(slug) || {};
    const providerKey = providerKeyByName.get(record.developer) || null;
    const tierEntry = providerKey ? tierByProviderKey.get(providerKey) || null : null;
    const tier = tierEntry ? tierEntry.tier : null;
    const unknown = !record.releasedAt;
    return {
      slug,
      canonicalName: record.canonicalName,
      developer: record.developer,
      family: record.family,
      modelRole: record.modelRole,
      providerKey,
      tier,
      tierRole: tierEntry ? tierEntry.role : null,
      tierRank: tier ? TIER_RANK[tier] : 9,
      officialDomains: domainsByName.get(record.developer) || [],
      releasedAt: record.releasedAt || null,
      unknown,
      comparableGroup: d.comparableGroup || null,
      comparableGroupSize: groupSizeBySlug.get(slug) || 0,
      catalogStatus: d.catalogStatus || null,
      referenceCount: linkCount.get(slug) || 0,
      officialUrl: record.officialUrl
    };
  });

rows.sort((a, b) => {
  if (a.unknown !== b.unknown) return a.unknown ? -1 : 1;
  if (a.comparableGroupSize !== b.comparableGroupSize) return b.comparableGroupSize - a.comparableGroupSize;
  if (a.tierRank !== b.tierRank) return a.tierRank - b.tierRank;
  if (a.referenceCount !== b.referenceCount) return b.referenceCount - a.referenceCount;
  return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
});

const out = {
  _what: 'coverage-depth-v1 Workstream A 的 Release Evidence 确定性队列',
  _rule: 'unknown 优先 → comparableGroupSize 降序 → tier core>major>long-tail>未登记 → 引用数降序 → slug code-unit 升序',
  generatedAt: '2026-10-05',
  total: rows.length,
  unknownCount: rows.filter(row => row.unknown).length,
  rows: rows.map((row, index) => ({ rank: index + 1, ...row }))
};

fs.writeFileSync(path.join(ROOT, 'research/_raw/coverage-depth-v1/release-evidence/queue.json'), JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify({ total: out.total, unknown: out.unknownCount, top: out.rows.slice(0, 12).map(r => `${r.rank}.${r.slug}[${r.tier}|g${r.comparableGroupSize}|ref${r.referenceCount}]`) }, null, 1));
