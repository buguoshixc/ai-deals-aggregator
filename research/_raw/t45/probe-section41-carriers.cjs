// t45（只读）：补齐 §41 逐条所需的对照片段 —— freshness 块、candidates 的 JSON 细节、缺口 4 的文本 vs JSON 不对称、
// 以及从 registry 派生产物独立算出的 catalogStatus 五态普查（用来判 §41 第 4 条到底有没有载体）。
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT = __dirname;
const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const text = fs.readFileSync(path.join(OUT, 'report-json-1.txt'), 'utf8');
function blocks(text) {
  const out = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '{') continue;
    let depth = 0, inString = false, escaped = false, end = -1;
    for (let s = i; s < text.length; s++) {
      const c = text[s];
      if (inString) { if (escaped) { escaped = false; continue; } if (c === '\\') { escaped = true; continue; } if (c === '"') inString = false; continue; }
      if (c === '"') { inString = true; continue; }
      if (c === '{') depth++; else if (c === '}') { depth--; if (depth === 0) { end = s; break; } }
    }
    if (end < 0) break;
    const raw = text.slice(i, end + 1);
    try { out.push({ raw, value: JSON.parse(raw) }); } catch { /* skip */ }
    i = end;
  }
  return out;
}
const p = blocks(text).find(b => b.value && b.value.registry).value;

console.log('## coverageTargets.freshness（§41 之外的旁证块）');
console.log(JSON.stringify(p.coverageTargets.freshness, null, 1).slice(0, 1600));

console.log('\n## gaps.notAdoptedProviders（JSON 侧候选清单的形状）');
console.log('len', p.gaps.notAdoptedProviders.length, '| first 3:');
console.log(JSON.stringify(p.gaps.notAdoptedProviders.slice(0, 3), null, 1));
console.log('keys of [0]:', Object.keys(p.gaps.notAdoptedProviders[0] || {}));

console.log('\n## candidates（JSON 侧候选登记表）');
console.log(JSON.stringify(p.candidates, null, 1));

console.log('\n## coverageTargets.dimensions（每维度的七态计数）');
console.log(JSON.stringify(p.coverageTargets.dimensions, null, 1).slice(0, 1800));

console.log('\n## coverageTargets.universe.tiers / roles');
console.log(JSON.stringify({ tiers: p.coverageTargets.universe.tiers, roles: p.coverageTargets.universe.roles }));

console.log('\n## coverageTargets.sourceHealth 明细');
console.log(JSON.stringify(p.coverageTargets.sourceHealth, null, 1).slice(0, 1200));

// ---- 独立复算 catalogStatus 五态普查（§41 第 4 条的应有数字） ----
const published = read('models.json');
const census = {};
for (const m of published.models) census[m.catalogStatus] = (census[m.catalogStatus] || 0) + 1;
console.log('\n## 独立复算：models.json 的 catalogStatus 普查');
console.log(JSON.stringify(census), 'sum', Object.values(census).reduce((a, b) => a + b, 0), '/ models', published.models.length);
const roles = {};
for (const m of published.models) roles[m.modelRole] = (roles[m.modelRole] || 0) + 1;
console.log('modelRole 普查:', JSON.stringify(roles));

// 报告里有没有出现这些数字的五态行？逐桶在文本里找
const textOnly = fs.readFileSync(path.join(OUT, 'report-text.txt'), 'utf8').split('\n');
for (const [state, n] of Object.entries(census)) {
  const hits = textOnly.filter(l => new RegExp(`\\b${state}\\b`).test(l) && /\d/.test(l));
  console.log(`  catalogStatus=${state}(${n}) 在文本里的命中行:`, hits.length ? JSON.stringify(hits.map(h => h.trim().slice(0, 100))) : '（无）');
}

// ---- source-health 注册表 vs 报告里的声明来源 ----
const sh = read('scripts/data/source-health.json');
const rows = Array.isArray(sh) ? sh : (sh.rows || sh.sources || []);
console.log('\n## source-health.json 行数:', rows.length);
console.log(rows.map(r => `${r.name || r.source || r.id} | ${r.status || r.state || '?'} | fails=${r.consecutiveFailures !== undefined ? r.consecutiveFailures : '?'}`).join('\n'));
console.log('\n报告声明的 5 个来源（JSON）:', JSON.stringify(p.coverageTargets.sourceHealth.declaredSources.map(s => s.name || s.source)));
