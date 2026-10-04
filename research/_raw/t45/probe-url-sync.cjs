// t45（只读）：候选/来源的 URL 与日期在文本与 JSON 之间的同步程度 —— F2 的硬证据。
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
const jsonStr = JSON.stringify(p);
const url = /https?:\/\//g;
console.log('JSON 载荷里的 http(s) 出现次数 :', (jsonStr.match(url) || []).length);
const textFile = fs.readFileSync(path.join(OUT, 'report-text.txt'), 'utf8');
console.log('文本报告里的 http(s) 出现次数 :', (textFile.match(url) || []).length);
console.log('文本「检查日期」出现次数     :', (textFile.match(/检查日期/g) || []).length);
console.log('JSON 载荷里「检查日期」次数   :', (jsonStr.match(/检查日期/g) || []).length);
console.log('文本「失败原因」出现次数     :', (textFile.match(/失败原因/g) || []).length);
console.log('JSON 载荷里「失败原因」次数   :', (jsonStr.match(/失败原因/g) || []).length);
console.log('\ncandidates 块:', JSON.stringify(p.candidates));
console.log('gaps.notAdoptedProviders 类型:', Array.isArray(p.gaps.notAdoptedProviders) ? `array(${p.gaps.notAdoptedProviders.length}) of ${typeof p.gaps.notAdoptedProviders[0]}` : typeof p.gaps.notAdoptedProviders);
console.log('样本:', JSON.stringify(p.gaps.notAdoptedProviders.slice(0, 5)));
// JSON 里是否有任何键名含 candidate/url/source
const hits = [];
(function walk(n, pre) {
  if (n === null || typeof n !== 'object') return;
  if (Array.isArray(n)) { n.forEach((v, i) => walk(v, `${pre}[${i}]`)); return; }
  for (const [k, v] of Object.entries(n)) {
    if (/candidate|url|source/i.test(k)) hits.push(`${pre}.${k} = ${Array.isArray(v) ? `array(${v.length})` : typeof v === 'object' ? `object{${Object.keys(v).length}}` : JSON.stringify(v).slice(0, 60)}`);
    walk(v, `${pre}.${k}`);
  }
})(p, '');
console.log('\n含 candidate/url/source 的键路径:');
console.log(hits.join('\n'));
