// t45（只读）：文本行 ↔ JSON 值 的同源一致性交叉核对（acceptance ② 的机器化部分）。
'use strict';
const fs = require('fs');
const path = require('path');
const OUT = __dirname;
const text = fs.readFileSync(path.join(OUT, 'report-json-1.txt'), 'utf8');
function jsonBlocks(t) {
  const out = [];
  for (let i = 0; i < t.length; i++) {
    if (t[i] !== '{') continue;
    let d = 0, s = false, e = false, end = -1;
    for (let x = i; x < t.length; x++) {
      const c = t[x];
      if (s) { if (e) { e = false; continue; } if (c === '\\') { e = true; continue; } if (c === '"') s = false; continue; }
      if (c === '"') { s = true; continue; }
      if (c === '{') d++; else if (c === '}') { d--; if (d === 0) { end = x; break; } }
    }
    if (end < 0) break;
    const raw = t.slice(i, end + 1);
    try { out.push({ raw, value: JSON.parse(raw) }); } catch { /* skip */ }
    i = end;
  }
  return out;
}
const p = jsonBlocks(text).find(b => b.value && b.value.registry).value;
const ct = p.coverageTargets;
const nums = s => { const m = s.match(/-?\d[\d,]*/); return m ? Number(m[0].replace(/,/g, '')) : null; };
const textNum = re => { const m = text.match(re); return m ? nums(m[1]) : null; };

const cases = [
  ['Target 行数', /Target 行数\s+(\d+)/, ct.universe.declared],
  ['providers.json 身份数', /providers\.json 身份数\s+(\d+)/, ct.universe.providersRegistered],
  ['有数据的 Target', /有数据的 Target\s+(\d+)/, ct.universe.withData],
  ['一条数据都没有的 Target', /一条数据都没有的 Target\s+(\d+)/, ct.universe.withoutAnyData.length],
  ['Deals provider 数', /provider 数（仅 type=deal）\s+(\d+)/, p.deals.providers],
  ['当前优惠数', /当前优惠数\s+(\d+)/, p.deals.currentDeals],
  ['工具条目数', /工具条目数\s+(\d+)/, p.deals.tools],
  ['Coding provider 数', /── Coding Plans[\s\S]*?provider 数\s+(\d+)/, p.coding.providers],
  ['Coding plan 数', /── Coding Plans[\s\S]*?plan 数\s+(\d+)/, p.coding.plans],
  ['API provider 数', /── API Pricing[\s\S]*?provider 数\s+(\d+)/, p.api.providers],
  ['API pricing records', /pricing records\s+(\d+)/, p.api.pricingRecords],
  ['API model pricing items', /model pricing items\s+(\d+)/, p.api.modelPricingItems],
  ['registry 模型数', /registry 模型数\s+(\d+)/, ct.currentModels.registryModels],
  ['已映射认领 API 计价条目', /已映射认领 API 计价条目\s+(\d+)/, p.registry.mappedApiEntries],
  ['已处置声明的 API 计价条目', /已处置声明的 API 计价条目\s+(\d+)/, p.registry.declaredApiEntries],
  ['声明的 current target 模型', /声明的 current target 模型\s+(\d+)/, ct.currentModels.declaredTargets],
  ['unknown release dates', /unknown release dates\s+(\d+)/, ct.currentModels.unknownReleaseDates.length],
  ['legacy / historical 保留', /legacy \/ historical 保留\s+(\d+)/, ct.currentModels.legacyOrHistorical.length],
  ['来源层 status=retired', /来源层 status=retired\s+(\d+)/, ct.currentModels.retiredInSource.length],
  ['Source Health 声明的来源数', /声明的来源数\s+(\d+)/, ct.sourceHealth.declaredSources.length],
  ['候选登记表 total', /候选登记表：(\d+) 条/, p.candidates.total],
  ['候选已采信', /已采信\s+(\d+)\s*\/\s*未采信/, p.candidates.adopted],
  ['候选未采信', /已采信\s+\d+\s*\/\s*未采信\s+(\d+)/, p.candidates.notAdopted],
  ['MISSING targets 条数', null, ct.missingTargets.length],
  ['PARTIAL targets 条数', null, ct.partialTargets.length],
  ['DEFERRED 条数', null, ct.deferred.length],
  ['UNVERIFIABLE 条数', null, ct.unverifiable.length],
  ['NOT_APPLICABLE 条数', null, ct.notApplicable.length],
  ['BLOCKED_SOURCE 条数', null, ct.blockedBySourceHealth.length]
];
let pass = 0, fail = 0;
for (const [label, re, jsonVal] of cases) {
  const t = re ? textNum(re) : null;
  const ok = re ? (t === jsonVal) : true;
  if (ok) pass++; else fail++;
  console.log(`${ok ? '✓' : '✗'} ${label.padEnd(26)} 文本=${re ? t : '(无对应文本行,只核 JSON)'} JSON=${jsonVal}`);
}
console.log(`\n同源一致性：${pass} 通过 / ${fail} 失败`);

// 七态：文本 4 行 × 7 态逐格对拍
console.log('\n## 分维度七态逐格对拍（文本 4 行 vs JSON coverageTargets.dimensions）');
const dims = ['deals', 'coding', 'api', 'models'];
const zh = { deals: 'Deals 优惠（deals）', coding: 'Coding 套餐（coding）', api: 'API 计费（api）', models: '模型身份（models）' };
let cells = 0, bad = 0;
for (const d of dims) {
  const line = text.split('\n').find(l => l.includes(`${zh[d]}：`));
  const got = {};
  for (const [k, v] of Object.entries(ct.dimensions[d])) {
    const m = line.match(new RegExp(`${k}=(\\d+)`));
    got[k] = m ? Number(m[1]) : null;
    cells++;
    if (got[k] !== v) { bad++; console.log(`  ✗ ${d}.${k} 文本=${got[k]} JSON=${v}`); }
  }
  console.log(`  ${bad === 0 ? '✓' : ''} ${d}: 七态逐格 ${JSON.stringify(got)}`);
}
console.log(`七态格数 ${cells}，不一致 ${bad}`);

// 每维度总和是否 == rows 行数（34 家）
for (const d of dims) {
  const sum = Object.values(ct.dimensions[d]).reduce((a, b) => a + b, 0);
  console.log(`  ${d} 七态和 = ${sum}（应为 34）`, sum === 34 ? '✓' : '✗');
  }
