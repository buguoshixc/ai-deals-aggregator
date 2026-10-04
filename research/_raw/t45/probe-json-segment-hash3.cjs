// t45：最后一轮「JSON 段」口径复现尝试（子对象 / 边界 / 包一层）。
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const OUT = __dirname;
const sha = b => crypto.createHash('sha256').update(Buffer.isBuffer(b) ? b : Buffer.from(b, 'utf8')).digest('hex');
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
    try { out.push({ at: i, end, raw, value: JSON.parse(raw) }); } catch { /* skip */ }
    i = end;
  }
  return out;
}
const bs = blocks(text);
const P = bs.find(b => b.value && b.value.registry);
const p = P.value;
const cands = {
  'coverageTargets pretty': JSON.stringify(p.coverageTargets, null, 2),
  'coverageTargets compact': JSON.stringify(p.coverageTargets),
  'payload minus coverageTargets compact': JSON.stringify({ generatedAt: p.generatedAt, deals: p.deals, coding: p.coding, api: p.api, registry: p.registry, gaps: p.gaps, candidates: p.candidates }),
  'policy+payload concatenated raws': bs[0].raw + P.raw,
  'policy+payload with LF between': bs[0].raw + '\n' + P.raw,
  'payload raw without outer braces': P.raw.slice(1, -1),
  'payload raw with 4-space indent re-dump': JSON.stringify(p, null, 4),
  'JSON段 + 收尾行': P.raw + text.slice(P.end + 1).trim(),
  'JSON段 of text-mode stdout? (无 JSON)': 'no-json',
  'sha256 of utf8 length prefix + payload': `${Buffer.byteLength(P.raw, 'utf8')}:${P.raw}`
};
for (const [name, v] of Object.entries(cands)) {
  const h = sha(v);
  console.log(`${h.slice(0, 16)}  ${h.startsWith('72b2bab384489e1a') ? '<<<< MATCH' : '        '}  ${name}`);
}
console.log('\n结论辅助：t39 记录的 stdout 前缀 = 7e50e31df838c966，本次 stdout =', sha(fs.readFileSync(path.join(OUT, 'report-json-1.txt'))).slice(0, 16));
