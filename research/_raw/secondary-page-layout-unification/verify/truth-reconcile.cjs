#!/usr/bin/env node
/**
 * T4 与 T3 真值（geometry/truth-401.json，sha256 46c28fa1…）的**集合级**对账。
 *
 * 对账口径（逐条 route#index，不比数量）：
 *   ① 我在 dist.baseline 上算出的「改动前窄说明」条集合 === caughtByOldCriteria ∪ onlyNewTruth（156 条）；
 *   ② 我的窄集合 ∩ alreadyFine（245 条）=== ∅；
 *   ③ 我的「正常说明」集合 ∩ 真值窄集合 === ∅（② 的另一半）；
 *   ④ 窄说明**所在页面**集合逐页相同（48 页）；
 *   ⑤ 说明总条数 / 有说明的页面数对账（401 / 105）；
 *   ⑥ 真值侧不变量逐条复算（不自报「已成立」，而是按它的原始集合重算一遍）。
 *
 * 用法：node truth-reconcile.cjs --probe=…/verify/probe-before.json --truth=…/geometry/truth-401.json \
 *        --out=…/verify/truth-reconcile.json
 */
'use strict';

const crypto = require('crypto');
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
const keyOf = entry => `${entry.route}#${entry.index}`;
const load = p => JSON.parse(fs.readFileSync(path.resolve(ROOT, p), 'utf8'));

const probe = load(arg('probe', 'research/_raw/secondary-page-layout-unification/verify/probe-before.json'));
const truthPath = arg('truth', 'research/_raw/secondary-page-layout-unification/geometry/truth-401.json');
const truthRaw = fs.readFileSync(path.resolve(ROOT, truthPath));
const truth = JSON.parse(truthRaw.toString('utf8'));
const OUT = path.resolve(ROOT, arg('out', path.join(__dirname, 'truth-reconcile.json')));

const myNarrow = probe.narrowSets['1440|strict|minOfBoth'];
const myNarrowLoose = probe.narrowSets['1440|loose|minOfBoth'];
const myAllNotes = probe.pages.flatMap(p => p.notes1440.map(n => n.key)).sort();
const myNarrowSet = new Set(myNarrow);
const myNormal = myAllNotes.filter(k => !myNarrowSet.has(k));

const truthNarrow = [...truth.sets.caughtByOldCriteria, ...truth.sets.onlyNewTruth].map(keyOf).sort();
const truthCaught = truth.sets.caughtByOldCriteria.map(keyOf).sort();
const truthOnlyNew = truth.sets.onlyNewTruth.map(keyOf).sort();
const truthFine = truth.sets.alreadyFine.map(keyOf).sort();
const truthFineSet = new Set(truthFine);
const truthNarrowSet = new Set(truthNarrow);

const diff = (a, b) => a.filter(k => !new Set(b).has(k));
const pagesOf = keys => [...new Set(keys.map(k => k.split('#')[0]))].sort();

const myPages = pagesOf(myNarrow);
const truthPages = pagesOf(truthNarrow);

const checks = [
  {
    id: 'narrow-set-equals-truth',
    what: '我的窄说明条集合 === caughtByOldCriteria ∪ onlyNewTruth（逐条 route#index）',
    ok: myNarrow.length === truthNarrow.length && diff(myNarrow, truthNarrow).length === 0 && diff(truthNarrow, myNarrow).length === 0,
    detail: { mine: myNarrow.length, truth: truthNarrow.length, onlyMine: diff(myNarrow, truthNarrow), onlyTruth: diff(truthNarrow, myNarrow) }
  },
  {
    id: 'loose-set-equals-truth',
    what: '宽松变体（把 inline-block 也算作承载文本）的窄集合 === 同一真值集合',
    ok: myNarrowLoose.length === truthNarrow.length && diff(myNarrowLoose, truthNarrow).length === 0,
    detail: { mine: myNarrowLoose.length, truth: truthNarrow.length, onlyMine: diff(myNarrowLoose, truthNarrow) }
  },
  {
    id: 'narrow-disjoint-from-alreadyFine',
    what: '我的窄集合 ∩ alreadyFine === ∅',
    ok: myNarrow.filter(k => truthFineSet.has(k)).length === 0,
    detail: { overlap: myNarrow.filter(k => truthFineSet.has(k)) }
  },
  {
    id: 'normal-disjoint-from-truth-narrow',
    what: '我的正常集合 ∩ 真值窄集合 === ∅（即我没有漏判）',
    ok: myNormal.filter(k => truthNarrowSet.has(k)).length === 0,
    detail: { missed: myNormal.filter(k => truthNarrowSet.has(k)) }
  },
  {
    id: 'narrow-pages-equal',
    what: '窄说明所在页面集合逐页相同',
    ok: myPages.length === truthPages.length && diff(myPages, truthPages).length === 0,
    detail: { mine: myPages.length, truth: truthPages.length, onlyMine: diff(myPages, truthPages), onlyTruth: diff(truthPages, myPages) }
  },
  {
    id: 'note-counts',
    what: '说明总条数 401 / 有说明的页面 105 对账',
    ok: myAllNotes.length === truth.totals.notes && probe.totals.pagesWithNotes === truth.totals.pagesWithNotes,
    detail: { myNotes: myAllNotes.length, truthNotes: truth.totals.notes, myPages: probe.totals.pagesWithNotes, truthPages: truth.totals.pagesWithNotes }
  },
  {
    id: 'truth-invariants-recomputed',
    what: '真值文件里的不变量按原始集合重算一遍（不采信它自报的 true）',
    ok: truthCaught.length + truthOnlyNew.length === truth.totals.narrowBefore
      && truthNarrow.length + truthFine.length === truth.totals.notes
      && truthCaught.length === truth.totals.caughtByOldCriteria
      && truthOnlyNew.length === truth.totals.onlyNewTruth
      && truthFine.length === truth.totals.alreadyFine
      && truth.totals.narrowAfter === 0,
    detail: {
      caught: truthCaught.length, onlyNew: truthOnlyNew.length, sum: truthCaught.length + truthOnlyNew.length,
      narrowBefore: truth.totals.narrowBefore, fine: truthFine.length, notes: truth.totals.notes,
      archiveControl: truth.archiveControl.length, probeNarrowRoutes: truth.invariants.probeNarrowRoutes
    }
  },
  {
    id: 'truth-file-sha256',
    what: '对账用的真值文件本体哈希（防止拿一份被改过的真值来对账）',
    ok: crypto.createHash('sha256').update(truthRaw).digest('hex').toLowerCase().startsWith('46c28fa1'),
    detail: { sha256: crypto.createHash('sha256').update(truthRaw).digest('hex'), expectedPrefix: '46c28fa1', path: truthPath }
  }
];

const report = {
  generatedAt: new Date().toISOString(),
  probe: probe.dir,
  probeTotals: probe.totals,
  truthTotals: truth.totals,
  checks,
  allOk: checks.every(check => check.ok),
  sets: { myNarrow, myNormal: myNormal.length, truthNarrow, truthCaught, truthOnlyNew, truthFine: truthFine.length }
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n', 'utf8');

for (const check of checks) {
  console.log(`${check.ok ? 'PASS' : 'FAIL'} · ${check.id} · ${check.what}`);
  const detail = JSON.stringify(check.detail);
  console.log(`     ${detail.length > 600 ? detail.slice(0, 600) + '…' : detail}`);
}
console.log(`RESULT=${report.allOk ? 'OK' : 'FAIL'}`);
console.log(`证据：${path.relative(ROOT, OUT).split(path.sep).join('/')}`);
process.exit(report.allOk ? 0 : 1);
