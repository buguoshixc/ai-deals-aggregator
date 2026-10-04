// t45（只读调查）：从 coverage-report --json 的混合输出里取出载荷块，做键路清单与 sha256 对拍。
// 块切法刻意与 t39 的 collect.cjs 的 jsonBlocks/pickPayloadBlock 逐字一致，好让「JSON 段 sha256」可对拍。
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const OUT = __dirname;
const sha = b => crypto.createHash('sha256').update(b).digest('hex');

function jsonBlocks(text) {
  const blocks = [];
  for (let index = 0; index < text.length; index++) {
    if (text[index] !== '{') continue;
    let depth = 0, inString = false, escaped = false, end = -1;
    for (let scan = index; scan < text.length; scan++) {
      const char = text[scan];
      if (inString) {
        if (escaped) { escaped = false; continue; }
        if (char === '\\') { escaped = true; continue; }
        if (char === '"') inString = false;
        continue;
      }
      if (char === '"') { inString = true; continue; }
      if (char === '{') depth++;
      else if (char === '}') { depth--; if (depth === 0) { end = scan; break; } }
    }
    if (end < 0) break;
    const raw = text.slice(index, end + 1);
    try { blocks.push({ at: index, raw, value: JSON.parse(raw) }); } catch { /* 非 JSON 块 */ }
    index = end;
  }
  return blocks;
}

const text = fs.readFileSync(path.join(OUT, 'report-json-1.txt'), 'utf8');
const blocks = jsonBlocks(text);
const payload = blocks.find(b => b.value && b.value.registry && b.value.api);
console.log('# blocks:', blocks.length);
blocks.forEach((b, i) => console.log(`  block[${i}] at=${b.at} rawBytes=${Buffer.byteLength(b.raw)} topKeys=${JSON.stringify(Object.keys(b.value).slice(0, 12))}`));
console.log('# stdout sha256        :', sha(fs.readFileSync(path.join(OUT, 'report-json-1.txt'))));
console.log('# payload raw bytes    :', Buffer.byteLength(payload.raw));
console.log('# payload段 sha256      :', sha(payload.raw));
console.log('# payload段 sha256(+\\n) :', sha(payload.raw + '\n'));

const p = payload.value;
const j = v => JSON.stringify(v);
console.log('\n## 顶层键:', j(Object.keys(p)));

const dump = (label, obj, depth = 0) => {
  console.log(`\n## ${label}`);
  if (obj === null || typeof obj !== 'object') { console.log('  ', j(obj)); return; }
  if (Array.isArray(obj)) { console.log('   array len', obj.length, 'first:', j(obj[0]).slice(0, 600)); return; }
  for (const [k, v] of Object.entries(obj)) {
    const isObj = v !== null && typeof v === 'object';
    const size = Array.isArray(v) ? `array(${v.length})` : (isObj ? `object{${Object.keys(v).length}}` : '');
    console.log(`   ${k}: ${isObj ? size : j(v)}`);
  }
};

dump('deals', p.deals);
dump('coding', p.coding);
dump('api', p.api);
dump('registry', p.registry);
dump('gaps', p.gaps);
dump('candidates', p.candidates);
dump('coverageTargets(浅层)', p.coverageTargets);
if (p.coverageTargets) {
  dump('coverageTargets.states', p.coverageTargets.states);
  dump('coverageTargets.dimensions', p.coverageTargets.dimensions);
  dump('coverageTargets.universe', p.coverageTargets.universe);
  dump('coverageTargets.currentModels', p.coverageTargets.currentModels);
  dump('coverageTargets.missingTargets', p.coverageTargets.missingTargets);
  dump('coverageTargets.sourceHealth', p.coverageTargets.sourceHealth);
  const rows = p.coverageTargets.rows;
  if (Array.isArray(rows)) {
    console.log('\n## coverageTargets.rows[0] 完整形状:');
    console.log(JSON.stringify(rows[0], null, 2));
    console.log('\n## coverageTargets.rows[].id 列表:', j(rows.map(r => r.provider || r.id || r.key)));
  }
}

// 递归找「目录状态普查」相关的键（题面 §41 第 4 条要 Current/Aging/Legacy/Historical/Unknown 计数）
console.log('\n## 递归键名含 catalog/state/count 的路径:');
const hits = [];
(function walk(node, prefix) {
  if (node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach((v, i) => walk(v, `${prefix}[${i}]`)); return; }
  for (const [k, v] of Object.entries(node)) {
    const here = `${prefix}.${k}`;
    if (/catalog|state|count/i.test(k)) hits.push(`${here} = ${typeof v === 'object' ? j(v).slice(0, 200) : j(v)}`);
    walk(v, here);
  }
})(p, '');
console.log(hits.length ? hits.slice(0, 60).join('\n') : '  （无）');

// 文本报告里是否出现 catalogStatus 五态普查字样
console.log('\n## 文本报告里的普查字样检索:');
const t = fs.readFileSync(path.join(OUT, 'report-text.txt'), 'utf8');
for (const needle of ['catalogStatus', 'current 模型', 'aging', 'Current 模型', '目录状态', 'legacy / historical', 'unknown release dates', '来源层 status=retired']) {
  const line = t.split('\n').findIndex(l => l.includes(needle));
  console.log(`   "${needle}" → ${line >= 0 ? `line ${line + 1}: ${t.split('\n')[line].trim().slice(0, 120)}` : '未出现'}`);
}
