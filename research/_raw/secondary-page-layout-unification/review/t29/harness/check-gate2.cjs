#!/usr/bin/env node
/** T29 · 从 t28 的 r6-gate summary.json 里取：被跳过的 4 步是谁、47/48 步的完整记录字段。 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../../../../../..');
const T29 = path.join(ROOT, 'research', '_raw', 'secondary-page-layout-unification', 'review', 't29');
const S = path.join(ROOT, 'research', '_raw', 'secondary-page-layout-unification', 'teeth', '_scratch', 'r6-gate', 'summary.json');
const s = JSON.parse(fs.readFileSync(S, 'utf8'));
const results = s.results || [];
const skipped = results.filter(r => r.status && r.status !== 'passed');
const out = {
  skipped: skipped.map(r => ({ index: r.index, name: r.name, status: r.status, reason: String(r.reason || r.skipReason || r.detail || '').slice(0, 160) })),
  step47: results.find(r => r.index === 47) || null,
  step48: results.find(r => r.index === 48) || null,
  browserSteps: s.browserSteps,
  identity: s.identity
};
fs.writeFileSync(path.join(T29, 'runs', 'gate-skipped.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2).slice(0, 2500));
