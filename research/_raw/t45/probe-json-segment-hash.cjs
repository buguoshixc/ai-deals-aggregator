// t45：把 t39 记录的「JSON 段 sha256 72b2bab384489e1a…」拿来做口径复现尝试。
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const OUT = __dirname;
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const buf = fs.readFileSync(path.join(OUT, 'report-json-1.txt'));
const text = buf.toString('utf8');

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
const P = bs.find(b => b.value && b.value.registry && b.value.api);
const S = bs.find(b => b.value && b.value.schemaVersion && b.value.tiers);
console.log('TARGET 72b2bab384489e1a…（t39 记录）');
const cands = {
  'payload raw slice': P.raw,
  'payload raw + LF': P.raw + '\n',
  'JSON.stringify(value)': JSON.stringify(P.value),
  'JSON.stringify(value)+LF': JSON.stringify(P.value) + '\n',
  'JSON.stringify(value,null,2)': JSON.stringify(P.value, null, 2),
  'JSON.stringify(value,null,2)+LF': JSON.stringify(P.value, null, 2) + '\n',
  'text from payload start to EOF': text.slice(P.at),
  'text from policy start to EOF': text.slice(S.at),
  'text between blocks (policy tail to payload head)': text.slice(S.end + 1, P.at),
  'policy raw': S.raw,
  'whole stdout': buf,
  'stdout without CR (CRLF-normalised)': Buffer.from(text.replace(/\r\n/g, '\n'), 'utf8'),
  'payload raw CRLF-normalised': Buffer.from(P.raw.replace(/\r\n/g, '\n'), 'utf8'),
  'payload with trailing closing line': P.raw + text.slice(P.end + 1)
};
for (const [name, v] of Object.entries(cands)) {
  const h = sha(Buffer.isBuffer(v) ? v : Buffer.from(v, 'utf8'));
  console.log(`${h.slice(0, 16)}  ${h.startsWith('72b2bab384489e1a') ? '<<<< MATCH' : '        '}  ${name}`);
}
console.log('\nstdout line ending: CRLF?', text.includes('\r\n'), '| LF count', (text.match(/\n/g) || []).length, '| CR count', (text.match(/\r/g) || []).length);
console.log('payload at/end:', P.at, P.end, '| policy at/end:', S.at, S.end);
console.log('tail after payload:', JSON.stringify(text.slice(P.end + 1, P.end + 120)));
