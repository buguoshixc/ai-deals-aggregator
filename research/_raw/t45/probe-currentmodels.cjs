// t45（只读）：currentModels 块里是否藏有五态普查的替身。
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
const cm = p.coverageTargets.currentModels;
console.log('currentModels 全部键:', JSON.stringify(Object.keys(cm)));
console.log('modelsByProvider:', JSON.stringify(cm.modelsByProvider, null, 1));
console.log('legacyOrHistorical:', JSON.stringify(cm.legacyOrHistorical));
console.log('retiredInSource:', JSON.stringify(cm.retiredInSource));
console.log('unknownReleaseDates 长度:', cm.unknownReleaseDates.length);
console.log('unknownReleaseDates 前 6:', JSON.stringify(cm.unknownReleaseDates.slice(0, 6)));
console.log('\nfreshness.catalogStatuses（词表）:', JSON.stringify(p.coverageTargets.freshness.catalogStatuses));
console.log('freshness.defaultVisible:', JSON.stringify(p.coverageTargets.freshness.defaultVisible));
