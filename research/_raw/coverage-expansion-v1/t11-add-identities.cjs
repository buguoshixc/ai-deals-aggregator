#!/usr/bin/env node
/**
 * t11 Stage 1：把四路 research 的**身份层事实**落进生产数据（providers / vendor-slugs / coverage-targets /
 * official_urls 的 A↔B 单处登记纪律）。**只做身份层，不写任何价格或套餐**。
 *
 * 用法：
 *   node research/_raw/coverage-expansion-v1/t11-add-identities.cjs --dry-run
 *   node research/_raw/coverage-expansion-v1/t11-add-identities.cjs
 *
 * ## 依据（逐条来自 research，不是发明）
 *
 * · 第一方 8 家：`research/_raw/coverage-expansion-v1/firstparty.json` 的
 *   `handoffToDataIntegrator`（providerKeyCandidate / providerNameCandidate / vendorKeyCandidate /
 *   officialDomainsCandidate）+ `provider-review.md`。
 * · 推理平台 4 家：`inference.json` 的 `providerDecisions[*]`（officialDomainsSuggestion /
 *   vendorKeySuggestion=null）+ `coverageSignalsForCoverageTargets`。
 * · 国际 Coding 2 家：`coding.json` 的 `summary.providerTableChanges`。
 *
 * ## 三条判据（写死在这里，避免"看起来像"就并）
 *
 * 1. `vendorKey` 必须逐字等于 A 空间（index.html 的 VENDOR_RULES）里那个键的**显示名**；
 *    本脚本里 A 空间键的三元组是从 index.html 原文抄下来的（key, displayName, vendorKey 值）。
 *    A 空间没有的公司**显式写 null**（不得为了让某家有厂商页而新编一个 A 空间键）。
 * 2. `slug` 与 `name` 必须与 `vendor-slugs.json` 一致（同名同类），新增行两边同时写。
 * 3. 官方域**只登记一处**：B 空间（providers.json）已有身份的公司在 `official_urls.json` 的
 *    `_officialDomains`（A 空间）里**不得**重复登记 ⇒ 本脚本负责把 4 家（stepfun/sensetime/
 *    ai360/baichuan）从 A 空间移出并登进 B 空间。
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const DRY = process.argv.includes('--dry-run');
const PROVIDERS_FILE = path.join(ROOT, 'scripts', 'data', 'providers.json');
const VENDOR_SLUGS_FILE = path.join(ROOT, 'scripts', 'data', 'vendor-slugs.json');
const OFFICIAL_URLS_FILE = path.join(ROOT, 'scripts', 'data', 'official_urls.json');

/**
 * 15 家新增身份。字段顺序与既有 providers.json 条目逐字一致：
 * name, slug, aliases, logo, vendorKey, officialDomains。
 *
 * `aSpace` = 从 index.html 的 VENDOR_RULES 抄下来的 A 空间口径；null = A 空间没有这家公司。
 */
const NEW_PROVIDERS = [
  {
    key: 'ai360', aSpace: { key: 'ai360', name: '360智脑' },
    entry: {
      name: '360智脑', slug: 'ai360', aliases: ['360智脑', '360 智脑'], logo: 'ai360', vendorKey: 'ai360',
      officialDomains: ['360.com']
    }
  },
  {
    key: 'baichuan', aSpace: { key: 'baichuan', name: '百川智能' },
    entry: {
      name: '百川智能', slug: 'baichuan', aliases: ['百川智能', 'baichuan'], logo: 'baichuan', vendorKey: 'baichuan',
      officialDomains: ['baichuan-ai.com']
    }
  },
  {
    key: 'stepfun', aSpace: { key: 'stepfun', name: '阶跃星辰' },
    entry: {
      name: '阶跃星辰', slug: 'stepfun', aliases: ['阶跃星辰', 'stepfun'], logo: 'stepfun', vendorKey: 'stepfun',
      officialDomains: ['stepfun.com']
    }
  },
  {
    key: 'sensetime', aSpace: { key: 'sensetime', name: '商汤科技' },
    entry: {
      name: '商汤科技', slug: 'sensetime', aliases: ['商汤科技', 'sensetime'], logo: 'sensetime', vendorKey: 'sensetime',
      // 3 个域由 research 给出；本阶段**只登** sensetime.com（其余两个域等有记录真的用到时再加，
      // 因为 official.js 的白名单纪律要求「每一条登记都必须被真实记录用到」）
      officialDomains: ['sensetime.com']
    }
  },
  /* ---- 国际推理平台 4 家（provider-only：A 空间无身份 ⇒ vendorKey 必须显式 null）---- */
  {
    key: 'groq', aSpace: null,
    entry: {
      name: 'Groq', slug: 'groq', aliases: ['groq'], logo: 'groq', vendorKey: null,
      officialDomains: ['groq.com']
    }
  },
  {
    key: 'together', aSpace: null,
    entry: {
      name: 'Together AI', slug: 'together', aliases: ['together ai', 'together'], logo: 'together', vendorKey: null,
      officialDomains: ['together.ai']
    }
  },
  {
    key: 'fireworks', aSpace: null,
    entry: {
      name: 'Fireworks AI', slug: 'fireworks', aliases: ['fireworks ai', 'fireworks'], logo: 'fireworks', vendorKey: null,
      officialDomains: ['fireworks.ai']
    }
  },
  {
    key: 'cerebras', aSpace: null,
    entry: {
      name: 'Cerebras', slug: 'cerebras', aliases: ['cerebras'], logo: 'cerebras', vendorKey: null,
      officialDomains: ['cerebras.ai']
    }
  },
  /* ---- 国际 Coding 2 家（coding.json 的 providerTableChanges）---- */
  {
    key: 'jetbrains', aSpace: null,
    entry: {
      name: 'JetBrains', slug: 'jetbrains', aliases: ['jetbrains'], logo: 'jetbrains', vendorKey: null,
      officialDomains: ['jetbrains.com']
    }
  },
  {
    key: 'replit', aSpace: { key: 'replit', name: 'Replit' },
    entry: {
      name: 'Replit', slug: 'replit', aliases: ['replit'], logo: 'replit', vendorKey: 'replit',
      officialDomains: ['replit.com']
    }
  },
  {
    // A 空间确实有这家公司（index.html 第 1492 行：`[/amazon|aws/i, 'aws', 'AWS', 'aws']`），
    // 且 deals 里真的出现过 vendor 串「Amazon Web Services」⇒ vendorKey 必须是 'aws' 而不是 null
    // （第一版我写成 null，被 `validateVendorSpaceAgreement` 当场判红：同一家公司在两套空间归属不同）。
    // 显示名必须逐字等于 A 空间名「AWS」，否则 validateVendorKeyAgreement 也会红。
    key: 'aws', aSpace: { key: 'aws', name: 'AWS' },
    entry: {
      name: 'AWS', slug: 'aws', aliases: ['aws', 'amazon web services'], logo: 'aws', vendorKey: 'aws',
      officialDomains: ['aws.amazon.com']
    }
  },
  /* ---- 三家 unverifiable（官方域不可达）：**只登记身份**，不登记任何价格/套餐 ----
   * 理由：本仓库的 provider 身份不要求「已抓到价格」才存在（siliconflow / cohere 这类平台的身份是
   * 「这家公司是谁」），而「有没有价格」由覆盖层的 UNVERIFIABLE 派生表达。
   * 这样 t11 之后 report:coverage 能把它们显示为「已登记身份但来源不可核」，
   * 而不是「这家公司不在宇宙里」——后者会让报告撒谎。 */
  {
    key: 'xai', aSpace: null,
    entry: {
      name: 'xAI', slug: 'xai', aliases: ['xai', 'x.ai'], logo: 'xai', vendorKey: null,
      officialDomains: ['x.ai']
    }
  },
  {
    key: 'mistral', aSpace: null,
    entry: {
      name: 'Mistral AI', slug: 'mistral', aliases: ['mistral ai', 'mistral'], logo: 'mistral', vendorKey: null,
      officialDomains: ['mistral.ai']
    }
  },
  {
    key: 'cohere', aSpace: null,
    entry: {
      name: 'Cohere', slug: 'cohere', aliases: ['cohere'], logo: 'cohere', vendorKey: null,
      officialDomains: ['cohere.com']
    }
  }
];

/** 新增前后要搬家的 A 空间域登记（B 空间已有身份 ⇒ A 空间不得重复） */
const A_TO_B_MIGRATION = ['stepfun', 'sensetime', 'ai360', 'baichuan'];

/** 新增的 vendor-slugs 行（键 = 规范显示名；值 = slug，与 providers.json 逐字一致） */
const NEW_VENDOR_SLUGS = {
  阶跃星辰: 'stepfun', 商汤科技: 'sensetime', 百川智能: 'baichuan', '360智脑': 'ai360', Replit: 'replit', AWS: 'aws'
};

/** 给既有 provider 追加官方域（coding.json 明确要求：否则新记录的 officialUrl 会被 officialDomainProblems 判红） */
const DOMAIN_ADDITIONS_TO_EXISTING = {
  google: ['codeassist.google']
};

function orderedEntry(entry) {
  const order = ['name', 'slug', 'aliases', 'logo', 'vendorKey', 'officialDomains'];
  const out = {};
  for (const key of order) out[key] = entry[key];
  for (const key of Object.keys(entry)) if (!(key in out)) out[key] = entry[key];
  return out;
}

function main() {
  const providers = JSON.parse(fs.readFileSync(PROVIDERS_FILE, 'utf8'));
  const vendorSlugs = JSON.parse(fs.readFileSync(VENDOR_SLUGS_FILE, 'utf8'));
  const officialUrls = JSON.parse(fs.readFileSync(OFFICIAL_URLS_FILE, 'utf8'));

  const problems = [];
  const report = { addedProviders: [], existing: [], domainsAdded: [], slugsAdded: [], aSpaceRemoved: [], upgraded: [] };

  for (const item of NEW_PROVIDERS) {
    if (Object.prototype.hasOwnProperty.call(providers, item.key)) {
      const current = providers[item.key];
      // 幂等：已存在则核对内容。**允许一处定向升级**：把 `aws` 的 vendorKey 从 null 修成 'aws'、
      // 显示名从「Amazon Web Services」修成 A 空间名「AWS」—— 这一处是第一版脚本写错后被
      // validateVendorSpaceAgreement 当场判红（deals 的「Amazon Web Services」在 A 空间归 aws，
      // 而 B 空间 vendorKey 为 null ⇒ 两套空间归属不同）。除这一处外，已存在的键一律拒绝覆盖。
      if (item.key === 'aws' && current.vendorKey === null) {
        report.upgraded.push('aws');
        continue;
      }
      const same = JSON.stringify(orderedEntry(current)) === JSON.stringify(item.entry);
      report.existing.push(item.key);
      if (!same) problems.push(`${item.key}: providers.json 里已有该键，但内容与本脚本要写的不一致 —— 拒绝覆盖（先人工确认）`);
      continue;
    }
    // 判据 1：A 空间显示名必须逐字等于本条的 name
    if (item.aSpace && item.aSpace.name !== item.entry.name) {
      problems.push(`${item.key}: vendorKey=${JSON.stringify(item.entry.vendorKey)} 的 A 空间显示名是「${item.aSpace.name}」，与本条 name「${item.entry.name}」不逐字相等 —— 判据 1 不成立`);
    }
    if (!item.aSpace && item.entry.vendorKey !== null) {
      problems.push(`${item.key}: A 空间没有这家公司，vendorKey 必须是 null（实得 ${JSON.stringify(item.entry.vendorKey)}）`);
    }
    if (item.aSpace && item.entry.vendorKey !== item.aSpace.key) {
      problems.push(`${item.key}: vendorKey 必须等于 A 空间键「${item.aSpace.key}」`);
    }
    // 判据 2：vendor-slugs 同名必须同 slug
    const declared = vendorSlugs[item.entry.name];
    if (declared !== undefined && declared !== item.entry.slug) {
      problems.push(`${item.key}: vendor-slugs.json 里「${item.entry.name}」登记的是「${declared}」，与本条 slug「${item.entry.slug}」不一致`);
    }
    // slug / name / alias 唯一性（与 providers.js 同一口径，先在这里自检）
    for (const [otherKey, other] of Object.entries(providers)) {
      if (otherKey.startsWith('_') || !other || typeof other !== 'object') continue;
      if (other.slug === item.entry.slug) problems.push(`${item.key}: slug「${item.entry.slug}」已被 ${otherKey} 占用`);
      if (other.name === item.entry.name) problems.push(`${item.key}: 显示名「${item.entry.name}」已被 ${otherKey} 占用`);
      if (!other.vendorKey && !item.entry.vendorKey) continue;
      if (other.vendorKey && other.vendorKey === item.entry.vendorKey) problems.push(`${item.key}: vendorKey「${item.entry.vendorKey}」已被 ${otherKey} 占用`);
      for (const alias of item.entry.aliases) {
        if ((other.aliases || []).includes(alias)) problems.push(`${item.key}: 别名「${alias}」已被 ${otherKey} 占用`);
      }
    }
    report.addedProviders.push(item.key);
  }

  for (const key of A_TO_B_MIGRATION) {
    if (!Object.prototype.hasOwnProperty.call(providers, key) && !report.addedProviders.includes(key)) {
      problems.push(`A→B 迁移 ${key}: providers.json 里没有这家身份（迁移无处可去）`);
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(officialUrls._officialDomains || {}, key)) report.aSpaceRemoved.push(key);
  }

  for (const key of Object.keys(DOMAIN_ADDITIONS_TO_EXISTING)) {
    if (!providers[key]) { problems.push(`追加官方域 ${key}: providers.json 里没有这家身份`); continue; }
    report.domainsAdded.push(key);
  }

  if (problems.length) {
    console.error(`❌ ${problems.length} 处问题，拒绝写盘：`);
    problems.forEach(item => console.error('  - ' + item));
    return 1;
  }

  console.log(`身份层：新增 ${report.addedProviders.length} 家（${report.addedProviders.join(', ')}）· 已存在 ${report.existing.length} 家` +
    ` · A→B 域搬家 ${report.aSpaceRemoved.length} 家（${report.aSpaceRemoved.join(', ') || '无'}）· 追加域 ${report.domainsAdded.join(', ') || '无'}`);
  if (DRY) { console.log('--dry-run：没有写盘。'); return 0; }

  /* ---- 写 providers.json（新增键插到 "_" 元数据之前，保持既有键序不变）---- */
  const outProviders = {};
  for (const [key, value] of Object.entries(providers)) {
    if (key.startsWith('_') && !Object.keys(outProviders).some(k => k.startsWith('_'))) {
      for (const item of NEW_PROVIDERS) {
        if (!Object.prototype.hasOwnProperty.call(providers, item.key)) outProviders[item.key] = orderedEntry(item.entry);
      }
    }
    if (report.upgraded.includes(key)) {
      const item = NEW_PROVIDERS.find(candidate => candidate.key === key);
      outProviders[key] = orderedEntry(item.entry);
      continue;
    }
    outProviders[key] = value;
  }
  for (const [key, domains] of Object.entries(DOMAIN_ADDITIONS_TO_EXISTING)) {
    const entry = outProviders[key];
    const merged = [...(entry.officialDomains || [])];
    for (const domain of domains) if (!merged.includes(domain)) merged.push(domain);
    outProviders[key] = { ...entry, officialDomains: merged };
  }
  fs.writeFileSync(PROVIDERS_FILE, JSON.stringify(outProviders, null, 2) + '\n', 'utf8');

  /* ---- 写 vendor-slugs.json（键序：_* 在前，其余保持原有插入序，新行接在最后）---- */
  const outSlugs = {};
  for (const [key, value] of Object.entries(vendorSlugs)) {
    outSlugs[key] = value;
    if (!key.startsWith('_') && !Object.keys(outSlugs).some(k => k === '_note')) { /* no-op */ }
  }
  for (const [name, slug] of Object.entries(NEW_VENDOR_SLUGS)) {
    if (outSlugs[name] === undefined) outSlugs[name] = slug;
  }
  fs.writeFileSync(VENDOR_SLUGS_FILE, JSON.stringify(outSlugs, null, 2) + '\n', 'utf8');

  /* ---- 写 official_urls.json：把 4 家从 A 空间移出（B 空间已登记）---- */
  const outOfficial = JSON.parse(JSON.stringify(officialUrls));
  for (const key of A_TO_B_MIGRATION) {
    if (outOfficial._officialDomains && Object.prototype.hasOwnProperty.call(outOfficial._officialDomains, key)) {
      delete outOfficial._officialDomains[key];
    }
  }
  // _officialDomains 键序规范化（字母序，与既有风格一致）
  const domains = outOfficial._officialDomains || {};
  const sorted = {};
  for (const key of Object.keys(domains).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) sorted[key] = domains[key];
  outOfficial._officialDomains = sorted;
  fs.writeFileSync(OFFICIAL_URLS_FILE, JSON.stringify(outOfficial, null, 2) + '\n', 'utf8');

  console.log('✅ 已写出 providers.json / vendor-slugs.json / official_urls.json');
  console.log('下一步（本任务 Stage 2/3）：coverage-targets 行 + api-plans/plans 记录，然后跑重建与门禁。');
  return 0;
}

process.exit(main());
