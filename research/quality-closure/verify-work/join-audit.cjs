#!/usr/bin/env node
/**
 * T18 §17 独立 join 对账（**判据自建**：不 require models-page / model-registry / registry-join-audit）。
 *
 * 用法：
 *   node research/quality-closure/verify-work/join-audit.cjs --dist=dist.qc-verify [--json=out.json]
 *
 * 期望**自己算**：直接读 api-plans.json 与 scripts/data/model-registry-links.json 原文，
 * 按 (apiPlanId, modelKey, 记录内真实 variant) 展开；variant 为 null/缺省/空串 = 该 modelKey 的全部真实变体。
 * 实际**从产物回读**：dist/models/<slug>/index.html 的 <tr class="mapirow" …> 行。
 *
 * 对账四计数：missing / extra / duplicate source identity / multi-owner
 * 另加（本轮新增的独立维度）：
 *   · 每页行数 = 该 slug 展开后的期望行数（并列出多变体页的逐页行数）
 *   · data-item === data-plan|data-model-key|data-variant（行身份自洽）
 *   · Input / Output / Cache 三格数字 === api-plans 对应条目的 rates.input/output/cachedInput（null ⇒ 「—」）
 *   · 计费通道格 === api-plan 的 channel 标签；Variant 格 === 变体标签
 *   · Unit 格 === 该记录的 currency 符号 + 单位文案
 *   · 官方来源列的 href ∈ {plan.officialUrl} ∪ plan.evidence[].sourceUrl（不许链接到别处）
 *   · canonical === https://buguoshixc.github.io/ai-deals-aggregator/models/<slug>/
 *
 * 退出码：0 = 全部为 0 差异；1 = 有差异（逐条打印）。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const distArg = process.argv.find(a => a.startsWith('--dist='));
const jsonArg = process.argv.find(a => a.startsWith('--json='));
const DIST = path.resolve(ROOT, distArg ? distArg.slice('--dist='.length) : 'dist.qc-verify');

const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const apiPlans = read(path.join(ROOT, 'api-plans.json')).plans || [];
const linksDoc = read(path.join(ROOT, 'scripts/data/model-registry-links.json'));
const modelsSrc = read(path.join(ROOT, 'scripts/data/models.json'));
const links = Array.isArray(linksDoc.links) ? linksDoc.links : [];
const slugs = Object.keys(modelsSrc).filter(k => !k.startsWith('_')).sort();
const planById = new Map(apiPlans.filter(p => p && p.id).map(p => [p.id, p]));

const MULTI_VARIANT_EXPECTED = {
  'glm-4.5v': 2, 'glm-4.6v': 2, 'glm-4.6v-flashx': 2, 'glm-5v-turbo': 2, 'qwen3-max': 2,
  'gpt-6-astra': 4, 'gpt-6-luna': 4, 'gpt-6.1-sol': 4, 'minimax-m3': 3
};
const EXPECTED_TOTAL_ROWS = 67;

const problems = [];
const notes = [];
const fail = m => problems.push(m);

/* ---------- 1. 期望：自己遍历 ---------- */
const isWild = v => v === null || v === undefined || v === '';
const expectedBySlug = new Map(slugs.map(s => [s, []]));
const ownersByIdentity = new Map();
const rowExpected = new Map(); // identityKey -> {entry, plan, slug}

for (const link of links) {
  if (!link || typeof link !== 'object' || !link.apiPlanId) continue;
  const plan = planById.get(link.apiPlanId);
  if (!plan) continue;                                  // 指向不存在的记录：数据层门禁负责，不在这里编造
  if (!expectedBySlug.has(link.registrySlug)) continue;  // 指向不存在的 slug：同上
  const entries = (plan.models || []).filter(m => m && m.modelKey === link.modelKey);
  const picked = isWild(link.variant) ? entries : entries.filter(m => m.variant === link.variant);
  for (const entry of picked) {
    const identity = `${plan.id}|${entry.modelKey}|${entry.variant}`;
    expectedBySlug.get(link.registrySlug).push(identity);
    if (!ownersByIdentity.has(identity)) ownersByIdentity.set(identity, new Set());
    ownersByIdentity.get(identity).add(link.registrySlug);
    if (!rowExpected.has(identity)) rowExpected.set(identity, { entry, plan, slug: link.registrySlug });
  }
}
const expectedTotal = [...expectedBySlug.values()].reduce((n, l) => n + l.length, 0);
const realPricingItems = apiPlans.reduce((n, p) => n + ((p && p.models) || []).length, 0);

/* ---------- 2. 实际：从产物回读（自己的正则） ---------- */
const ROW_RE = /<tr class="mapirow"([^>]*)>([\s\S]*?)<\/tr>/g;
const attr = (attrs, name) => {
  const m = attrs.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? m[1] : null;
};
const numCells = body => [...body.matchAll(/<td class="num">([^<]*)<\/td>/g)].map(m => m[1].trim());
const cellAfterTh = (body, cls) => {
  const m = body.match(new RegExp(`<td class="${cls}">([\\s\\S]*?)</td>`));
  return m ? m[1] : null;
};
const plain = html => String(html).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
const numeric = text => {
  const t = String(text).trim();
  if (t === '—' || t === '' || t === '-') return null;
  if (t.includes('免费')) return 0;
  const m = t.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : NaN;
};
const CURRENCY_LABEL = { CNY: 'CNY', USD: 'USD', EUR: 'EUR' };
const UNIT_LABEL = { per_1M_tokens: '每 100 万 tokens', per_1K_tokens: '每 1000 tokens' };
const CHANNEL_LABEL = { standard: '标准', batch: '批处理', off_peak: '低峰时段', peak: '高峰时段' };
const VARIANT_LABEL = { standard: '标准', long_context: '长上下文' };

const counts = { missing: 0, extra: 0, duplicate: 0, multiOwner: 0 };
const pageRowCounts = {};
const pagesSeen = [];
const mediaOnlyRows = [];

for (const slug of slugs) {
  const expected = expectedBySlug.get(slug) || [];
  const file = path.join(DIST, 'models', slug, 'index.html');
  const exists = fs.existsSync(file);
  if (!expected.length && !exists) continue;
  if (!exists) {
    if (expected.length) { counts.missing += expected.length; fail(`[missing] ${slug}: 页面不存在，但期望 ${expected.length} 行`); }
    continue;
  }
  pagesSeen.push(slug);
  const html = fs.readFileSync(file, 'utf8');
  const rows = [];
  let m;
  ROW_RE.lastIndex = 0;
  while ((m = ROW_RE.exec(html)) !== null) rows.push({ attrs: m[1], body: m[2] });
  const rawCount = (html.match(/class="mapirow"/g) || []).length;
  pageRowCounts[slug] = rows.length;
  if (rawCount !== rows.length) fail(`[extra] ${slug}: 页面有 ${rawCount} 个 mapirow，只有 ${rows.length} 个能被完整解析`);

  if (rows.length !== expected.length) {
    fail(`[计数] ${slug}: 实际 ${rows.length} 行 ≠ 期望 ${expected.length} 行（期望=${expected.join(' / ')}）`);
  }

  // canonical（项目页前缀）
  const canonical = (html.match(/<link rel="canonical" href="([^"]+)"/) || [])[1] || null;
  const wantCanonical = `https://buguoshixc.github.io/ai-deals-aggregator/models/${slug}/`;
  if (canonical !== wantCanonical) fail(`[canonical] ${slug}: ${canonical} ≠ ${wantCanonical}`);

  const seen = new Set();
  for (const row of rows) {
    const item = attr(row.attrs, 'data-item');
    const planId = attr(row.attrs, 'data-plan');
    const modelKey = attr(row.attrs, 'data-model-key');
    const variant = attr(row.attrs, 'data-variant');
    const identity = `${planId}|${modelKey}|${variant}`;
    if (item !== identity) fail(`[身份] ${slug}: data-item=${item} ≠ ${identity}`);
    if (seen.has(identity)) { counts.duplicate += 1; fail(`[duplicate] ${slug}: 同一页出现重复行 identity ${identity}`); }
    seen.add(identity);
    if (!expected.includes(identity)) {
      counts.extra += 1;
      fail(`[extra] ${slug}: 行 ${identity} 不在该模型的期望集合里（期望 ${expected.length} 行）`);
      continue;
    }
    const exp = rowExpected.get(identity);
    if (!exp) continue;
    const cells = numCells(row.body);
    const rates = exp.entry.rates || {};
    const wants = [rates.input, rates.output, rates.cachedInput];
    if (cells.length < 3) {
      fail(`[渲染] ${slug} ${identity}: 价格格只有 ${cells.length} 个（期望 Input/Output/Cache 三格）`);
    } else {
      for (let i = 0; i < 3; i++) {
        const got = numeric(cells[i]);
        const want = wants[i] === undefined ? null : wants[i];
        const same = (got === null && want === null) || (got !== null && want !== null && Math.abs(got - want) < 1e-9);
        if (!same) {
          if (exp.entry.mediaRates && rates.input === null && rates.output === null) {
            mediaOnlyRows.push(`${slug} ${identity} 第${i + 1}格 got=${cells[i]} want=${want}`);
          } else {
            fail(`[价格] ${slug} ${identity}: 第${i + 1}格「${cells[i]}」≠ api-plans rates.${['input', 'output', 'cachedInput'][i]}=${JSON.stringify(want)}`);
          }
        }
      }
    }
    const unitCell = cellAfterTh(row.body, 'punit');
    const currencyLabel = CURRENCY_LABEL[exp.plan.pricing && exp.plan.pricing.currency];
    const unitLabel = UNIT_LABEL[exp.plan.pricing && exp.plan.pricing.unit];
    if (!currencyLabel || !unitLabel) fail(`[单位] ${slug} ${identity}: 未知 currency/unit（${JSON.stringify(exp.plan.pricing)}），本脚本拒绝猜`);
    else {
      const want = `${currencyLabel} / ${unitLabel}`;
      if (plain(unitCell) !== want) fail(`[单位] ${slug} ${identity}: Unit 格「${plain(unitCell)}」≠ 「${want}」`);
    }
    const tds = [...row.body.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(x => plain(x[1]));
    const channelWant = CHANNEL_LABEL[exp.plan.channel];
    if (channelWant && tds[0] !== channelWant) fail(`[通道] ${slug} ${identity}: 计费通道格「${tds[0]}」≠ 「${channelWant}」（plan.channel=${exp.plan.channel}）`);
    const variantWant = VARIANT_LABEL[exp.entry.variant];
    if (variantWant && tds[1] !== variantWant) fail(`[变体] ${slug} ${identity}: Variant 格「${tds[1]}」≠ 「${variantWant}」`);
    // 官方来源链接必须在被映射记录自己的官方 URL / 引文 URL 集合里
    const href = (row.body.match(/<a href="([^"]+)"/) || [])[1] || null;
    const allowed = new Set([exp.plan.officialUrl, exp.plan.sourceUrl].filter(Boolean));
    for (const ev of (exp.plan.evidence || [])) if (ev && ev.sourceUrl) allowed.add(ev.sourceUrl);
    if (!href || !allowed.has(href)) fail(`[来源链接] ${slug} ${identity}: href=${href} 不在该记录的官方 URL/引文 URL 集合里`);
    // 来源列必须有引文或 note 的痕迹（不许空列）：取行内最后一个 <td>…</td>
    const allTds = [...row.body.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(x => x[1]);
    const sourceCell = plain(allTds[allTds.length - 1] || '');
    if (!sourceCell) fail(`[来源列] ${slug} ${identity}: 官方来源列是空的`);
  }
  for (const key of expected) if (!seen.has(key)) { counts.missing += 1; fail(`[missing] ${slug}: 期望行 ${key} 没有渲染出来`); }
}

for (const [identity, owners] of ownersByIdentity) {
  if (owners.size > 1) { counts.multiOwner += 1; fail(`[multi-owner] ${identity} 被 ${[...owners].join(' / ')} 共同认领`); }
}

/* ---------- 3. 口径自检（与 captain 二次更正逐项对照） ---------- */
if (expectedTotal !== EXPECTED_TOTAL_ROWS) fail(`[口径] 我算出的期望总行数 ${expectedTotal} ≠ 约定的 ${EXPECTED_TOTAL_ROWS}`);
if (expectedTotal !== realPricingItems) fail(`[口径] 期望总行数 ${expectedTotal} ≠ api-plans 真实计价条目 ${realPricingItems}`);
for (const [slug, n] of Object.entries(MULTI_VARIANT_EXPECTED)) {
  const got = pageRowCounts[slug];
  if (got !== n) fail(`[口径] 多变体页 ${slug}: 实测 ${got} 行 ≠ 约定 ${n} 行`);
}
const multiVariantSlugs = Object.keys(MULTI_VARIANT_EXPECTED);
const multiVariantRows = multiVariantSlugs.reduce((n, s) => n + (pageRowCounts[s] || 0), 0);
if (multiVariantRows !== 25) fail(`[口径] 多变体页合计行数 ${multiVariantRows} ≠ 25`);

notes.push(`模型 ${slugs.length} 个 · 已发布模型页 ${pagesSeen.length} 个 · 期望行（展开后）${expectedTotal} 行 = api-plans 真实计价条目 ${realPricingItems} 条`);
notes.push(`多变体页 ${multiVariantSlugs.length} 个 · 逐页行数 ${multiVariantSlugs.map(s => `${s}:${pageRowCounts[s]}`).join(' ')} · 合计 ${multiVariantRows} 行`);
notes.push(`共 ${ownersByIdentity.size} 条身份被认领 · 唯一 owner ${[...ownersByIdentity.values()].filter(s => s.size === 1).length} 条`);
if (mediaOnlyRows.length) notes.push(`媒体计价行（rates 全空、价格格为「—」，已豁免数字比对 ${mediaOnlyRows.length} 行）：${mediaOnlyRows.slice(0, 4).join(' | ')}`);

const report = {
  dist: path.relative(ROOT, DIST).replace(/\\/g, '/'),
  models: slugs.length, pages: pagesSeen.length,
  expectedTotalRows: expectedTotal, realPricingItems,
  multiVariantPageRows: pageRowCounts,
  counts, problems, notes
};
console.log('=== §17 独立 join 对账（判据自建） ===');
console.log(`产物目录：${report.dist}`);
notes.forEach(n => console.log(`  · ${n}`));
console.log(`  missing=${counts.missing} extra=${counts.extra} duplicate=${counts.duplicate} multi-owner=${counts.multiOwner}`);
if (problems.length) {
  console.log(`\n✗ ${problems.length} 处差异：`);
  problems.slice(0, 40).forEach(p => console.log(`   - ${p}`));
  if (problems.length > 40) console.log(`   … 另有 ${problems.length - 40} 处`);
} else {
  console.log('\n✅ 四项计数全 0，且行身份 / 价格 / 单位 / 通道 / 变体 / 来源链接 / canonical 逐项对账通过');
}
if (jsonArg) fs.writeFileSync(path.resolve(ROOT, jsonArg.slice('--json='.length)), JSON.stringify(report, null, 2));
process.exit(problems.length ? 1 : 0);
