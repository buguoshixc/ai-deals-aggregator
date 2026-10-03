#!/usr/bin/env node
/**
 * T18 独立重做 t16（§10.4 unknown ≠ false 三态）的沙箱变异。
 *
 * 用法：node research/quality-closure/verify-work/t16-replay.cjs [--gold=D:\qc-t18\wt] [--work=D:\qc-t18\t16] [--json=…]
 *
 * 四个 case（全部只改来源层或仓根派生物，副本隔离）：
 *   c1 true → "unknown" 且 note 写出「来源没说明」类见证 ⇒ 合法（期待：validate / rebuild 通过；
 *      派生 plans.json 里仍是字符串 "unknown"）
 *   c2 true → false 而 note 一字不动 ⇒ 必红（false 需要官方否定表述）
 *   c3 true → "unknown" 但 note 仍是原来的肯定式记述 ⇒ 必红（unknown 需要"查过但没说明"的见证）
 *   c4 手改仓根 plans.json（把一条 true 改成 "unknown"，带见证词）⇒ 可重现性/自测必红（派生层不许手改）
 * 退出码：0 = 与预期一致；1 = 不符合。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const argOf = (n, d) => { const a = process.argv.find(x => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
const GOLD = path.resolve(argOf('gold', 'D:\\qc-t18\\wt'));
const WORK = path.resolve(argOf('work', 'D:\\qc-t18\\t16'));
const JSON_OUT = argOf('json', path.join(__dirname, 'logs', 't16-replay.json'));

const GATES = [
  ['validate-strict', 'node scripts/validate.js --strict'],
  ['plans-selftest', 'node scripts/tools/plans-selftest.js'],
  ['plans-reproducible', 'node scripts/tools/check-plans-reproducible.js'],
  ['rebuild-plans', 'node scripts/tools/rebuild-plans.js']
];
const WITNESS_UNKNOWN = '（T18 变异）查过官方页与文档，来源未说明这一条；该限制官方没有给出可判定的说法';
const WITNESS_FALSE = '（T18 变异）官方明说不需要、不含这一限制';

function cpDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (e.name === '.qc-t18' || e.name.startsWith('dist')) continue;
    const s = path.join(src, e.name), d = path.join(dest, e.name);
    if (e.isDirectory()) cpDir(s, d); else fs.copyFileSync(s, d);
  }
}
const sha = (root, rel) => require('crypto').createHash('sha256').update(fs.readFileSync(path.join(root, rel))).digest('hex');

function findFairUse(root) {
  const src = JSON.parse(fs.readFileSync(path.join(root, 'scripts/data/curated_plans.json'), 'utf8'));
  for (const [id, p] of Object.entries(src)) {
    if (id.startsWith('_')) continue;
    for (const r of (p.restrictions || [])) if (r.kind === 'fair_use' && r.value === true) return { id, r };
  }
  return null;
}

const cases = [
  { id: 'c1-true-to-unknown-legal', expect: { 'validate-strict': 0, 'plans-reproducible': 0, 'rebuild-plans': 0 }, note: 'true → "unknown" 带见证 ⇒ 合法', mutate: (root) => {
    const hit = findFairUse(root); const src = JSON.parse(fs.readFileSync(path.join(root, 'scripts/data/curated_plans.json'), 'utf8'));
    const r = src[hit.id].restrictions.find(x => x.kind === 'fair_use');
    r.value = 'unknown'; r.note = WITNESS_UNKNOWN;
    fs.writeFileSync(path.join(root, 'scripts/data/curated_plans.json'), `${JSON.stringify(src, null, 2)}\n`);
    // 必须重建，否则派生层与来源层不一致（那也会红，但原因不同）
    const res = spawnSync('node scripts/tools/rebuild-plans.js', { cwd: root, shell: true, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    return { rebuildExit: res.status };
  } },
  { id: 'c2-true-to-false-no-witness', expect: { 'validate-strict': 'nonzero', 'plans-reproducible': 'nonzero', 'rebuild-plans': 'nonzero' }, note: 'true → false 而 note 不动 ⇒ 必红', mutate: (root) => {
    const hit = findFairUse(root); const src = JSON.parse(fs.readFileSync(path.join(root, 'scripts/data/curated_plans.json'), 'utf8'));
    const r = src[hit.id].restrictions.find(x => x.kind === 'fair_use');
    r.value = false;   // note 保持原来的肯定式记述
    fs.writeFileSync(path.join(root, 'scripts/data/curated_plans.json'), `${JSON.stringify(src, null, 2)}\n`);
  } },
  { id: 'c3-unknown-with-wrong-witness', expect: { 'validate-strict': 'nonzero', 'rebuild-plans': 'nonzero' }, note: '"unknown" 但 note 是肯定式记述 ⇒ 必红', mutate: (root) => {
    const hit = findFairUse(root); const src = JSON.parse(fs.readFileSync(path.join(root, 'scripts/data/curated_plans.json'), 'utf8'));
    const r = src[hit.id].restrictions.find(x => x.kind === 'fair_use');
    r.value = 'unknown';   // note 保持肯定式
    fs.writeFileSync(path.join(root, 'scripts/data/curated_plans.json'), `${JSON.stringify(src, null, 2)}\n`);
  } },
  { id: 'c4-handedit-derived', expect: { 'plans-reproducible': 'nonzero', 'plans-selftest': 'nonzero' }, note: '手改仓根 plans.json（派生层）⇒ 必红', mutate: (root) => {
    const doc = JSON.parse(fs.readFileSync(path.join(root, 'plans.json'), 'utf8'));
    let done = false;
    for (const p of doc.plans) for (const r of (p.restrictions || [])) if (r.value === true && !done) { r.value = 'unknown'; r.note = WITNESS_UNKNOWN; done = true; }
    if (!done) throw new Error('派生 plans.json 里找不到 value=true 的 restriction');
    fs.writeFileSync(path.join(root, 'plans.json'), `${JSON.stringify(doc, null, 2)}\n`);
  } }
];

fs.mkdirSync(WORK, { recursive: true });
const results = [];
const failures = [];
for (const c of cases) {
  const dir = path.join(WORK, c.id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  cpDir(GOLD, dir);
  const before = { src: sha(dir, 'scripts/data/curated_plans.json'), pub: sha(dir, 'plans.json') };
  let extra = null;
  try { extra = c.mutate(dir); } catch (e) { failures.push(`${c.id}: 变异失败 ${e}`); continue; }
  const after = { src: sha(dir, 'scripts/data/curated_plans.json'), pub: sha(dir, 'plans.json') };
  const gates = [];
  for (const [name, cmd] of GATES) {
    const res = spawnSync(cmd, { cwd: dir, shell: true, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const out = `${res.stdout || ''}\n${res.stderr || ''}`;
    const hits = out.split('\n').filter(l => /见证|unknown|false|不许|拒绝写盘|不一致|缺字段|没有|三态/.test(l)).map(l => l.trim()).slice(0, 2);
    gates.push({ name, command: cmd, exitCode: res.status, hits });
  }
  const record = { id: c.id, note: c.note, expect: c.expect, extra, changed: { src: before.src !== after.src, pub: before.pub !== after.pub }, gates };
  results.push(record);
  console.log(`\n### ${c.id}（${c.note}）`);
  console.log(`    来源层 ${record.changed.src ? 'CHANGED' : 'SAME'} · 仓根 plans.json ${record.changed.pub ? 'CHANGED' : 'SAME'}${extra ? ' · rebuild exit ' + extra.rebuildExit : ''}`);
  for (const g of gates) console.log(`    ${g.exitCode === 0 ? 'GREEN' : 'RED  '} ${g.name} (exit ${g.exitCode})${g.hits[0] ? ' :: ' + g.hits[0].slice(0, 150) : ''}`);
  for (const [name, want] of Object.entries(c.expect)) {
    const got = gates.find(g => g.name === name);
    const isRed = got.exitCode !== 0;
    if (want === 'nonzero' && !isRed) failures.push(`${c.id}: ${name} 期望非 0，实测 0`);
    if (want === 0 && isRed) failures.push(`${c.id}: ${name} 期望 0，实测 ${got.exitCode}`);
  }
}

// c1 额外断言：派生 plans.json 里那个值必须是字符串 "unknown"（不得折叠成 true/false）
const c1dir = path.join(WORK, 'c1-true-to-unknown-legal');
let c1Value = null;
if (fs.existsSync(c1dir)) {
  const doc = JSON.parse(fs.readFileSync(path.join(c1dir, 'plans.json'), 'utf8'));
  for (const p of doc.plans) for (const r of (p.restrictions || [])) if (r.kind === 'fair_use') c1Value = r.value;
}
const c1Ok = c1Value === 'unknown';
if (!c1Ok) failures.push(`c1: 派生 plans.json 的 fair_use 值 ${JSON.stringify(c1Value)} ≠ "unknown"（三态在重建后丢失）`);
console.log(`\nc1 派生值检查：fair_use = ${JSON.stringify(c1Value)} ${c1Ok ? '（字符串保留）' : '（不符！）'}`);

fs.mkdirSync(path.dirname(JSON_OUT), { recursive: true });
fs.writeFileSync(JSON_OUT, JSON.stringify({ gold: GOLD, results, c1Value, failures }, null, 2));
if (failures.length) {
  console.log(`\n❌ ${failures.length} 项与预期不符：`);
  failures.forEach(f => console.log('   - ' + f));
  process.exit(1);
}
console.log('\n✅ t16 三态契约的独立变异全部符合预期');
process.exit(0);
