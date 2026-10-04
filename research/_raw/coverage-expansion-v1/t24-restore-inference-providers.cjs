#!/usr/bin/env node
/**
 * t24 修复：把 t11 attempt 5 落在 providers.json 里的 **4 家推理平台身份**补回去。
 *
 * 背景（如实记录，不掩饰）：我在本任务里为了重置自己脚本的中间状态，对 `scripts/data/providers.json`
 * 跑了 `git checkout --`，而 t11 的那批改动**当时还没提交** ⇒ 这 4 家身份被一起回退了。
 * 后果被门禁当场抓住：`validate --strict` 报 8 条「provider「groq/together/fireworks/cerebras」
 * 未在 providers.json 登记」（api-plans.json 里那 4 条记录还在，所以是「记录有、身份没了」）。
 *
 * 本脚本按 t11 的同一份数据把它们补回（幂等：已存在则只核对，不覆盖）。
 * 官方域与 `t11-add-api-records.cjs` 里逐字一致（域必须被真实记录用到 —— 那 4 条 API 记录就是用处）。
 *
 * 用法：node research/_raw/coverage-expansion-v1/t24-restore-inference-providers.cjs [--dry-run]
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const DRY = process.argv.includes('--dry-run');
const FILE = path.join(ROOT, 'scripts', 'data', 'providers.json');

/** 与 t11-add-api-records.cjs 的 PROVIDERS 逐字一致（vendorKey 显式 null：A 空间没有这家公司） */
const MISSING = {
  groq: { name: 'Groq', slug: 'groq', aliases: ['groq'], logo: 'groq', vendorKey: null, officialDomains: ['groq.com'] },
  together: { name: 'Together AI', slug: 'together', aliases: ['together ai', 'together'], logo: 'together', vendorKey: null, officialDomains: ['together.ai'] },
  fireworks: { name: 'Fireworks AI', slug: 'fireworks', aliases: ['fireworks ai', 'fireworks'], logo: 'fireworks', vendorKey: null, officialDomains: ['fireworks.ai'] },
  cerebras: { name: 'Cerebras', slug: 'cerebras', aliases: ['cerebras'], logo: 'cerebras', vendorKey: null, officialDomains: ['cerebras.ai'] }
};

function main() {
  const providers = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const apiPlans = JSON.parse(fs.readFileSync(path.join(ROOT, 'api-plans.json'), 'utf8')).plans || [];
  const problems = [];
  const toAdd = [];

  for (const [key, entry] of Object.entries(MISSING)) {
    // 判据：api-plans 里**确实有**这个 provider 的记录（否则加身份会撞「用不上的登记」）
    const used = apiPlans.some(plan => plan.provider === key);
    if (!used) { problems.push(`${key}: api-plans.json 里没有它的记录 —— 加身份会变成「用不上的登记」`); continue; }
    if (providers[key]) {
      const same = JSON.stringify(providers[key]) === JSON.stringify(entry);
      if (!same) problems.push(`${key}: 已存在但内容与预期不一致 —— 拒绝覆盖`);
      continue;
    }
    if (Object.values(providers).some(other => other && other.slug === entry.slug)) problems.push(`${key}: slug 已被占用`);
    toAdd.push([key, entry]);
  }

  if (problems.length) {
    console.error(`❌ ${problems.length} 处问题，拒绝写盘：`);
    problems.forEach(item => console.error('  - ' + item));
    return 1;
  }
  console.log(`将补回 ${toAdd.length} 家身份：${toAdd.map(([key]) => key).join(', ') || '（无）'}（每家的官方域都被 api-plans 里对应记录用到）`);
  if (DRY || !toAdd.length) { console.log(DRY ? '--dry-run：没有写盘。' : '无需写盘。'); return 0; }

  const out = {};
  for (const [key, value] of Object.entries(providers)) {
    if (key.startsWith('_') && !Object.keys(out).some(k => k.startsWith('_'))) {
      for (const [id, entry] of toAdd) out[id] = entry;
    }
    out[key] = value;
  }
  const raw = JSON.stringify(out, null, 2) + '\n';
  if (fs.readFileSync(FILE, 'utf8') === raw) { console.log('✓ 与盘上逐字节一致（无需写盘）'); return 0; }
  fs.writeFileSync(FILE, raw, 'utf8');
  console.log(`✅ 已写出 providers.json：身份 ${Object.keys(out).filter(k => !k.startsWith('_')).length} 家（补回 ${toAdd.length}）`);
  return 0;
}

process.exit(main());
