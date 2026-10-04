#!/usr/bin/env node
/**
 * t32：修必修的连带一致性 —— `model-registry-links.json` 里 4 条 evidence 是**从 API 记录整条抄来的**，
 * 所以 t32 改了那 4 条记录的自称逐字引文以后，抄件必须同步，否则 `validate --strict` 与
 * `report:coverage` 会报「这条引文不是被引用记录自己的官方引文（链接只允许复制记录的引文）」。
 *
 * ⚠️ 该文件在 t32 的 Out of scope 里（属 t30/t23）。这里是**修必修的连带项**：
 *   ① 不新增/删除/改判任何映射（只把 evidence[].quote 换成与源记录逐字相同的新引文）；
 *   ② 只动 4 条（glm-5.3 / kimi-k3 ×2 / qwen3.8-27b），逐条可核对；
 *   ③ 在 output 里单独披露，请 captain 判是否接受（若坚持不动该文件，则 t32 的 F1/F2 无法闭合
 *      —— 因为「引文逐字」这条纪律本身是通过链接抄件来强制一致的）。
 *
 * 用法：node research/_raw/t32/sync-link-evidence.cjs [--dry-run]
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const DRY = process.argv.includes('--dry-run');
const LINKS = path.join(ROOT, 'scripts', 'data', 'model-registry-links.json');

/** 旧抄件 → 新抄件（与 t32 改后的 API 记录 evidence[0].quote 逐字相同） */
const SYNC = [
  { index: 31, slug: 'glm-5.3', oldQuote: '(USD per 1M tokens) —— Model | Standard | Priority；Ember-1 3 / 15；Kimi K3 3 / 15；GLM 5.3 1.4 / 4.4（官方 serverless pricing 页逐字）', newQuote: '(USD per 1M tokens)' },
  { index: 50, slug: 'kimi-k3', oldQuote: 'Input pricing (per 1M tokens) / Cached input pricing (per 1M tokens) / Output pricing (per 1M tokens) —— Inkling 1 / 0.17 / 4.05；Kimi K3 3 / 0.3 / 15（官方 serverless models 页逐字列头与两行）', newQuote: 'Input pricing (per 1M tokens)' },
  { index: 51, slug: 'kimi-k3', oldQuote: '(USD per 1M tokens) —— Model | Standard | Priority；Ember-1 3 / 15；Kimi K3 3 / 15；GLM 5.3 1.4 / 4.4（官方 serverless pricing 页逐字）', newQuote: '(USD per 1M tokens)' },
  { index: 63, slug: 'qwen3.8-27b', oldQuote: '$X.XX/M tokens（每百万 token）—— GPT OSS 120B $0.35 / $0.75；Qwen 3.8 27B $0.99 / $1.49（Developer 档逐字）', newQuote: '[OPENAI]GPT OSS 120B | ~3000 tokens/s | $0.35/M tokens | $0.75/M tokens' }
];

function main() {
  const doc = JSON.parse(fs.readFileSync(LINKS, 'utf8'));
  const links = doc.links || [];
  const problems = [];
  let changed = 0;
  for (const item of SYNC) {
    const link = links[item.index];
    if (!link) { problems.push(`links[${item.index}] 不存在`); continue; }
    if (link.registrySlug !== item.slug) { problems.push(`links[${item.index}] 的 slug 是 ${link.registrySlug}，预期 ${item.slug}（索引漂移，拒绝按索引改）`); continue; }
    const evidence = Array.isArray(link.evidence) ? link.evidence : [];
    const hit = evidence.find(e => e.quote === item.oldQuote);
    if (!hit) {
      if (evidence.some(e => e.quote === item.newQuote)) continue;   // 幂等
      problems.push(`links[${item.index}]（${item.slug}）找不到待同步的抄件`);
      continue;
    }
    hit.quote = item.newQuote;
    changed += 1;
    console.log(`  ✓ links[${item.index}] ${item.slug}：抄件引文已同步为「${item.newQuote}」`);
  }
  if (problems.length) {
    console.error(`❌ ${problems.length} 处问题，拒绝写盘：`);
    problems.forEach(p => console.error('  - ' + p));
    return 1;
  }
  if (!changed) { console.log('✓ 已是目标状态（抄件与源记录一致），无需写盘'); return 0; }
  if (DRY) { console.log('--dry-run：没有写盘。'); return 0; }
  fs.writeFileSync(LINKS, JSON.stringify(doc, null, 2) + '\n', 'utf8');
  console.log(`✅ 已写出 model-registry-links.json（同步 ${changed} 条抄件引文；映射/身份/判定一律未动）`);
  return 0;
}

process.exit(main());
