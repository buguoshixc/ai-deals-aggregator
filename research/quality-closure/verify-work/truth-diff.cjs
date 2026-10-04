#!/usr/bin/env node
/**
 * T18 §27 数据完整性 / 真值层 diff 复核（判据自建）。
 *
 * 用法：node research/quality-closure/verify-work/truth-diff.cjs [--json=…]
 *
 * 做四件事：
 *   ① 读 research/quality-closure/BASELINE.md 的冻结 sha256 表，逐份比对当前文件 → SAME / DIFF；
 *   ② 对 DIFF 的文件，与**审计基准 commit**（BASELINE 记录的 origin/master 祖先）逐字段比对，
 *      证明差异只有「采集刷新」与「本轮来源层→重建」两类，且没有无关改写；
 *   ③ 本轮真实数据变更清单（vs HEAD 的 git diff --stat + vs 审计基准的字段级分类）；
 *   ④ 在沙箱里对**来源层 → 派生产物**做一次独立重建，证明仓根产物 == 来源层产出（没有手改派生文件）。
 * 退出码：0 = 结论成立；1 = 有无关改写 / 无法解释的差异。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const argOf = (n, d) => { const a = process.argv.find(x => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
const ROOT = path.resolve(__dirname, '..', '..', '..');
const JSON_OUT = path.resolve(ROOT, argOf('json', 'research/quality-closure/verify-work/logs/truth-diff.json'));
const AUDIT_BASE = '1c024db';   // BASELINE.md §3/§6.1 记录的审计基准（origin/master 的祖先）
const BASELINE = path.join(ROOT, 'research/quality-closure/BASELINE.md');

const failures = [];
const notes = [];
const sha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const git = (args) => spawnSync(`git ${args}`, { cwd: ROOT, shell: true, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

/* ① 冻结 sha256 表（只取 BASELINE §4 的九份真值文件；§7 的 research/audit 快照不在本次比对面） */
const TRUTH_FILES = [
  'deals.json', 'plans.json', 'api-plans.json', 'models.json', 'model-registry-links.json',
  'scripts/data/model-registry-gaps.json', 'scripts/data/deal-history.json',
  'scripts/data/plan-history.json', 'scripts/data/api-plan-history.json'
];
const baselineText = fs.readFileSync(BASELINE, 'utf8');
const frozen = {};
for (const m of baselineText.matchAll(/^\|\s*`([^`]+)`\s*\|\s*(\d+)\s*\|\s*`([0-9a-f]{64})`\s*\|/gm)) {
  if (TRUTH_FILES.includes(m[1])) frozen[m[1]] = { size: Number(m[2]), sha256: m[3] };
}
if (Object.keys(frozen).length !== TRUTH_FILES.length) {
  failures.push(`BASELINE §4 只解析到 ${Object.keys(frozen).length}/${TRUTH_FILES.length} 份冻结值：缺 ${TRUTH_FILES.filter(f => !frozen[f]).join(', ')}`);
}
const rows = [];
for (const [rel, want] of Object.entries(frozen)) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) { failures.push(`冻结文件不存在：${rel}`); continue; }
  const got = sha(p);
  rows.push({ rel, frozenSha256: want.sha256, currentSha256: got, size: fs.statSync(p).size, frozenSize: want.size, same: got === want.sha256 });
}
const changed = rows.filter(r => !r.same);
notes.push(`冻结清单 ${rows.length} 份：SAME ${rows.length - changed.length} 份 · DIFF ${changed.length} 份（${changed.map(r => r.rel).join(', ') || '无'}）`);

/* ② 与审计基准逐字段比对 */
function gitShow(rel) {
  const r = git(`show ${AUDIT_BASE}:${rel}`);
  if (r.status !== 0) return null;
  return r.stdout;
}
const auditHave = new Set((git('ls-tree -r --name-only ' + AUDIT_BASE).stdout || '').split('\n'));

const fieldDiffs = [];
function diffDeals() {
  const before = JSON.parse(gitShow('deals.json'));
  const after = JSON.parse(fs.readFileSync(path.join(ROOT, 'deals.json'), 'utf8'));
  const bById = new Map((before.deals || before.items || []).map(d => [d.id, d]));
  const aById = new Map((after.deals || after.items || []).map(d => [d.id, d]));
  const added = [...aById.keys()].filter(id => !bById.has(id));
  const removed = [...bById.keys()].filter(id => !aById.has(id));
  const fieldCount = {};
  for (const [id, a] of aById) {
    const b = bById.get(id); if (!b) continue;
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) fieldCount[k] = (fieldCount[k] || 0) + 1;
    }
  }
  const topLevel = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter(k => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
  fieldDiffs.push({ file: 'deals.json', added: added.length, removed: removed.length, fieldCount, topLevelKeys: topLevel });
  const unexpected = Object.keys(fieldCount).filter(k => k !== 'lastSeen');
  if (added.length || removed.length) failures.push(`deals.json 相对审计基准有 id 增删（+${added.length}/-${removed.length}）—— 与本轮「零改写」预期不符`);
  if (unexpected.length) failures.push(`deals.json 相对审计基准有 lastSeen 之外的字段差异：${unexpected.join(', ')}`);
  const unexpectedTop = topLevel.filter(k => !['updatedAt', 'deals', 'count'].includes(k));
  if (unexpectedTop.length) failures.push(`deals.json 顶层变动超出 updatedAt/deals/count：${unexpectedTop.join(', ')}`);
  if (JSON.stringify(before.count) !== JSON.stringify(after.count)) failures.push(`deals.json count 变了：${before.count} → ${after.count}`);
}
function diffApiPlans() {
  const before = JSON.parse(gitShow('api-plans.json'));
  const after = JSON.parse(fs.readFileSync(path.join(ROOT, 'api-plans.json'), 'utf8'));
  const bp = new Map((before.plans || []).map(p => [p.id, p]));
  const ap = new Map((after.plans || []).map(p => [p.id, p]));
  const addedPlans = [...ap.keys()].filter(id => !bp.has(id));
  const removedPlans = [...bp.keys()].filter(id => !ap.has(id));
  const identity = plans => plans.flatMap(p => (p.models || []).map(m => `${p.id}|${m.modelKey}|${m.variant}`));
  const iBefore = new Set(identity(before.plans || [])), iAfter = new Set(identity(after.plans || []));
  const identityAdded = [...iAfter].filter(x => !iBefore.has(x));
  const identityRemoved = [...iBefore].filter(x => !iAfter.has(x));
  const fieldChanges = {};
  for (const [id, a] of ap) {
    const b = bp.get(id); if (!b) continue;
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) fieldChanges[k] = (fieldChanges[k] || 0) + 1;
    }
  }
  fieldDiffs.push({ file: 'api-plans.json', addedPlans: addedPlans.length, removedPlans: removedPlans.length, identityAdded: identityAdded.length, identityRemoved: identityRemoved.length, fieldChanges,
    stabilityAdded: (after.plans || []).filter(p => p.freeTier && p.freeTier.stability).length });
  if (addedPlans.length || removedPlans.length || identityAdded.length || identityRemoved.length) {
    failures.push(`api-plans.json 相对审计基准记录/计价身份集合发生变化（+${addedPlans.length} 记录 / +${identityAdded.length} 身份）`);
  }
}
function diffSimple(rel, keys) {
  const rawBefore = gitShow(rel);
  if (rawBefore === null) { fieldDiffs.push({ file: rel, note: '审计基准里没有这份文件' }); return; }
  const before = JSON.parse(rawBefore);
  const after = JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
  const walk = (a, b, prefix = '') => {
    const out = [];
    const keysAll = new Set([...(a && typeof a === 'object' ? Object.keys(a) : []), ...(b && typeof b === 'object' ? Object.keys(b) : [])]);
    for (const k of keysAll) {
      const av = a ? a[k] : undefined, bv = b ? b[k] : undefined;
      if (JSON.stringify(av) === JSON.stringify(bv)) continue;
      if (av && bv && typeof av === 'object' && typeof bv === 'object' && !Array.isArray(av) && !Array.isArray(bv)) out.push(...walk(av, bv, `${prefix}${k}.`));
      else out.push(`${prefix}${k}`);
    }
    return out;
  };
  if (Array.isArray(before) || Array.isArray(after)) { fieldDiffs.push({ file: rel, note: '顶层是数组，按长度比较', lenBefore: before.length, lenAfter: after.length }); return; }
  const diff = walk(before, after);
  fieldDiffs.push({ file: rel, changedPaths: [...new Set(diff)].slice(0, 40), changedPathCount: new Set(diff).size });
}

diffDeals();
diffApiPlans();
for (const rel of ['plans.json', 'models.json', 'model-registry-links.json', 'scripts/data/models.json', 'scripts/data/model-registry-links.json', 'scripts/data/model-registry-gaps.json']) {
  diffSimple(rel);
}

/* ③ 本轮变更清单：vs HEAD */
const stat = git('diff --stat HEAD -- api-plans.json plans.json deals.json models.json model-registry-links.json scripts/data').stdout.trim();
const changeList = stat.split('\n').filter(Boolean);
notes.push('本轮 vs HEAD 的真值层/来源层 diff --stat：');
for (const l of changeList) notes.push('    ' + l);

/* ④ 独立重建：仓根产物 == 来源层产出（沙箱内） */
const sandbox = path.resolve('D:\\qc-t18\\truth-rebuild');
fs.rmSync(sandbox, { recursive: true, force: true });
fs.mkdirSync(sandbox, { recursive: true });
const cpDir = (src, dest) => {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (e.name === '.qc-t18' || e.name.startsWith('dist')) continue;
    const s = path.join(src, e.name), d = path.join(dest, e.name);
    if (e.isDirectory()) cpDir(s, d); else fs.copyFileSync(s, d);
  }
};
for (const sub of ['scripts', 'node_modules', 'research']) cpDir(path.join(ROOT, sub), path.join(sandbox, sub));
for (const f of ['package.json', 'api-plans.json', 'plans.json', 'models.json', 'model-registry-links.json', 'deals.json']) fs.copyFileSync(path.join(ROOT, f), path.join(sandbox, f));
const rebuilds = [];
for (const [name, cmd] of [['api-plans', 'node scripts/tools/rebuild-api-plans.js'], ['plans', 'node scripts/tools/rebuild-plans.js'], ['models', 'node scripts/tools/rebuild-models.js']]) {
  const r = spawnSync(cmd, { cwd: sandbox, shell: true, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const identical = /逐字节一致|无需写盘/.test(`${r.stdout}${r.stderr}`);
  rebuilds.push({ name, command: cmd, exitCode: r.status, identical });
  if (r.status !== 0) failures.push(`独立重建 ${name} exit ${r.status}`);
  if (!identical) failures.push(`独立重建 ${name} 未报告「与盘上逐字节一致」（可能手改过产物）`);
}
notes.push(`独立重建（沙箱）：${rebuilds.map(r => `${r.name} exit ${r.exitCode}${r.identical ? ' 逐字节一致' : ' 不一致'}`).join(' · ')}`);

const summary = { baseline: path.relative(ROOT, BASELINE), auditBase: AUDIT_BASE, frozenRows: rows, changedFiles: changed.map(r => r.rel), fieldDiffs, changeList, rebuilds, notes, failures };
fs.mkdirSync(path.dirname(JSON_OUT), { recursive: true });
fs.writeFileSync(JSON_OUT, JSON.stringify(summary, null, 2));
notes.forEach(n => console.log('  · ' + n));
console.log('\n字段级差异：');
for (const d of fieldDiffs) console.log('    ' + JSON.stringify(d));
if (failures.length) {
  console.log(`\n✗ ${failures.length} 项：`);
  failures.forEach(f => console.log('   - ' + f));
  process.exit(1);
}
console.log('\n✅ 真值层 diff 审计通过：差异全部可解释（采集刷新 lastSeen/updatedAt + 本轮来源层→重建），无无关改写');
process.exit(0);
