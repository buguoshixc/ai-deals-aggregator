// t45：继续复现 t39 的「JSON 段 sha256」——试编码类口径（PS 重定向 UTF-16 等）。
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
const P = blocks(text).find(b => b.value && b.value.registry);
const cands = {
  'payload as UTF-16LE': Buffer.from(P.raw, 'utf16le'),
  'payload as UTF-16LE + BOM': Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(P.raw, 'utf16le')]),
  'payload raw + CRLF': Buffer.from(P.raw + '\r\n', 'utf8'),
  'payload raw trimmed + LF': Buffer.from(P.raw.trim() + '\n', 'utf8'),
  'payload sha of md5-style? (sha256 of sha256)': Buffer.from(sha(Buffer.from(P.raw, 'utf8')), 'utf8'),
  'canonical sorted-keys JSON': Buffer.from(canonical(P.value), 'utf8'),
  'each field hashed then joined': Buffer.from(Object.keys(P.value).map(k => sha(Buffer.from(JSON.stringify(P.value[k]), 'utf8')).slice(0, 8)).join(''), 'utf8')
};
function canonical(v) {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
for (const [name, v] of Object.entries(cands)) {
  const h = sha(v);
  console.log(`${h.slice(0, 16)}  ${h.startsWith('72b2bab384489e1a') ? '<<<< MATCH' : '        '}  ${name}`);
}
// 另：t39 的 stdout 字节数在它文档里出现过两个数字，核对「155858」是不是当时载荷前的位置
console.log('\nt39 注释里的「155858 字节」出现在什么位置？', text.indexOf('155858'), '| payload.at =', P.at);
console.log('t39 记录 stdout sha 前缀 7e50e31df838c966 与本次比对：', sha(buf).slice(0, 16));
