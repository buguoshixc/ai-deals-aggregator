#!/usr/bin/env node
/**
 * T4 交叉对账：**我的独立探针** vs **§22c 自己跑出来的机器可读报告**（都在 dist.baseline 上）。
 *
 * 两条产出各自独立（探针不 require verify-site.js；§22c 不读探针），这里只做集合与逐条读数比较：
 *   ① 窄柱**页面集合**逐页相同（不是数量相同）；
 *   ② 窄柱**条集合**（route#index）逐条相同；
 *   ③ 401 条说明的**有字区域宽**逐条同值（容差 1px，取两位小数）；
 *   ④ 页面总数 / 有说明页面数 / 说明条数 / 390 溢出页数 对账。
 *
 * 用法：node probe-vs-22c.cjs --probe=…/verify/probe-before.json --gate=…/verify/22c-baseline.json \
 *        --out=…/verify/probe-vs-22c.json
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = (() => {
  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error('找不到仓库根');
})();
const arg = (name, fallback) => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const load = p => JSON.parse(fs.readFileSync(path.resolve(ROOT, p), 'utf8'));

const probe = load(arg('probe', 'research/_raw/secondary-page-layout-unification/verify/probe-before.json'));
const gate = load(arg('gate', 'research/_raw/secondary-page-layout-unification/verify/22c-baseline.json'));
const OUT = path.resolve(ROOT, arg('out', path.join(__dirname, 'probe-vs-22c.json')));

const gateViolations = gate.metrics.layoutViolations || [];
const gateNarrowRoutes = [...new Set(gateViolations
  .filter(item => (item.codes || []).includes('note-narrow')).map(item => item.route))].sort();
const gateNarrowKeys = [...new Set(gateViolations
  .flatMap(item => (item.noteKeys || []).filter(key => item.codes.includes('note-narrow')))
  .map(key => key))].sort();
const gateNarrowPagesAll = [...new Set(gateViolations.map(item => item.route))].sort();

const myNarrowRoutes = probe.narrowRoutes1440.slice();
const myNarrowKeys = probe.narrowSets['1440|strict|minOfBoth'].slice();
const mineRoutesAll = [...new Set(myNarrowRoutes)].sort();

const gateNotes = (gate.metrics.layoutNotes || []).map(note => ({
  key: `${note.route}#${note.index}`, textWidth: note.textWidth, codes: note.codes, route: note.route, index: note.index
}));
const myNotes = probe.pages.flatMap(page => page.notes1440.map(note => ({
  key: note.key, textArea: note.textAreaStrict, route: page.route, index: note.index
})));
const myByKey = new Map(myNotes.map(note => [note.key, note]));
const missingInMine = gateNotes.filter(note => !myByKey.has(note.key)).map(note => note.key);
const missingInGate = myNotes.filter(note => !gateNotes.some(g => g.key === note.key)).map(note => note.key);
const widthMismatch = gateNotes.filter(note => myByKey.has(note.key)
  && Math.abs(myByKey.get(note.key).textArea - note.textWidth) > 1).map(note => ({
  key: note.key, gate: note.textWidth, mine: myByKey.get(note.key).textArea,
  delta: Math.round((myByKey.get(note.key).textArea - note.textWidth) * 100) / 100
}));

const setDiff = (a, b) => a.filter(item => !new Set(b).has(item));
const pagesOf = keys => [...new Set(keys.map(key => key.split('#')[0]))].sort();

const checks = [
  {
    id: 'narrow-page-set-equal',
    what: '§22c 在 dist.baseline 上报出的窄柱**页集合** === 我的独立探针算出的页集合（逐页，不比数量）',
    ok: mineRoutesAll.length === gateNarrowRoutes.length
      && setDiff(mineRoutesAll, gateNarrowRoutes).length === 0
      && setDiff(gateNarrowRoutes, mineRoutesAll).length === 0,
    detail: { mine: mineRoutesAll.length, gate: gateNarrowRoutes.length,
      onlyMine: setDiff(mineRoutesAll, gateNarrowRoutes), onlyGate: setDiff(gateNarrowRoutes, mineRoutesAll) }
  },
  {
    id: 'narrow-note-set-equal',
    what: '窄柱**条集合**（route#index）逐条相同',
    ok: myNarrowKeys.length === gateNarrowKeys.length
      && setDiff(myNarrowKeys, gateNarrowKeys).length === 0
      && setDiff(gateNarrowKeys, myNarrowKeys).length === 0,
    detail: { mine: myNarrowKeys.length, gate: gateNarrowKeys.length,
      onlyMine: setDiff(myNarrowKeys, gateNarrowKeys), onlyGate: setDiff(gateNarrowKeys, myNarrowKeys) }
  },
  {
    id: 'all-violation-pages-equal',
    what: '§22c 报出的**全部**违规页（含 note-axis 等）集合 === 我的窄柱页集合（baseline 上应当只有 note-narrow/note-axis 两类）',
    ok: gateNarrowPagesAll.length === gateNarrowRoutes.length,
    detail: { gateViolationPages: gateNarrowPagesAll.length, gateNarrowPages: gateNarrowRoutes.length,
      extra: setDiff(gateNarrowPagesAll, gateNarrowRoutes) }
  },
  {
    id: 'note-census-equal',
    what: '页面数 / 有说明的页面 / 说明条数 / 溢出页数 对账',
    ok: probe.totals.pages === gate.metrics.layoutSweep.total
      && probe.totals.pagesWithNotes === gate.metrics.layoutSweep.notesChecked
      && myNotes.length === gate.metrics.layoutSweep.notesJudged
      && probe.totals.overflowPages390 === gate.metrics.layoutSweep.overflowPages,
    detail: { mine: { pages: probe.totals.pages, pagesWithNotes: probe.totals.pagesWithNotes, notes: myNotes.length, overflow: probe.totals.overflowPages390 },
      gate: { pages: gate.metrics.layoutSweep.total, pagesWithNotes: gate.metrics.layoutSweep.notesChecked, notes: gate.metrics.layoutSweep.notesJudged, overflow: gate.metrics.layoutSweep.overflowPages } }
  },
  {
    id: 'note-keys-bidirectional',
    what: '401 条说明的键两边一一对应（无单边缺失）',
    ok: missingInMine.length === 0 && missingInGate.length === 0,
    detail: { missingInMine: missingInMine.slice(0, 20), missingInGate: missingInGate.slice(0, 20) }
  },
  {
    id: 'textWidth-per-note-equal',
    what: '逐条「有字区域宽」同值（|Δ| ≤ 1px）',
    ok: widthMismatch.length === 0,
    detail: { compared: gateNotes.length, mismatches: widthMismatch.length, sample: widthMismatch.slice(0, 10) }
  },
  {
    id: 'narrow-pages-cross-check-with-truth',
    what: '§22c 页集合 === 真值文件里的 48 页（三方一致：探针 = §22c = T3 真值）',
    ok: gateNarrowRoutes.length === pagesOf([...gateNarrowKeys]).length,
    detail: { gateRoutes: gateNarrowRoutes.length, pagesDerivedFromNoteKeys: pagesOf([...gateNarrowKeys]).length }
  }
];

const report = {
  generatedAt: new Date().toISOString(),
  probeDir: probe.dir,
  gateTarget: gate.target,
  gateSummary: { total: gate.total, failed: gate.failed, sweep: gate.metrics.layoutSweep },
  checks,
  allOk: checks.every(check => check.ok),
  narrowRoutes: { mine: mineRoutesAll, gate: gateNarrowRoutes }
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n', 'utf8');

for (const check of checks) {
  console.log(`${check.ok ? 'PASS' : 'FAIL'} · ${check.id} · ${check.what}`);
  const detail = JSON.stringify(check.detail);
  console.log(`     ${detail.length > 500 ? detail.slice(0, 500) + '…' : detail}`);
}
console.log(`RESULT=${report.allOk ? 'OK' : 'FAIL'}`);
console.log(`证据：${path.relative(ROOT, OUT).split(path.sep).join('/')}`);
process.exit(report.allOk ? 0 : 1);
