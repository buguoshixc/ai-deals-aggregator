#!/usr/bin/env node
/**
 * T18 来源层变异矩阵（**只改 scripts/data/** 与仓根派生物**；在沙箱副本里跑，共享树只读**）。
 *
 * 用法：node <verify-work>/mutation-matrix.cjs [--gold=D:\qc-t18\wt] [--work=D:\qc-t18\cases] [--json=out.json]
 *
 * 每个 case：把金样本复制成独立副本 → 施加变异 → 跑 6 道命令 → 记录 exit code 与关键报文 → 逐字节核对受控文件。
 * 矩阵用来回答两类问题：
 *   ① 本轮修复的形态（P0 原始形态 / M09 删映射 / 重复顶层 slug / 空 registry …）是否被**多道**门禁抓住；
 *   ② 是否存在**同一形态在不同入口结论相反**（一道红、一道绿）的实例。
 *
 * 退出码：0 = 全部符合预期；1 = 有 case 与预期不符。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const argOf = (name, dflt) => {
  const a = process.argv.find(x => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : dflt;
};
const GOLD = path.resolve(argOf('gold', 'D:\\qc-t18\\wt'));
const WORK = path.resolve(argOf('work', 'D:\\qc-t18\\cases'));
const JSON_OUT = argOf('json', path.join(__dirname, 'logs', 'mutation-matrix.json'));

const CONTROLLED = [
  'scripts/data/model-registry-links.json', 'scripts/data/models.json', 'scripts/data/model-registry-gaps.json',
  'model-registry-links.json', 'models.json'
];
const GATES = [
  ['links-check', 'node scripts/tools/check-model-registry-links.js'],
  ['registry-selftest', 'node scripts/tools/models-selftest.js'],
  ['validate-strict', 'node scripts/validate.js --strict'],
  ['models-reproducible', 'node scripts/tools/check-models-reproducible.js'],
  ['rebuild-models', 'node scripts/tools/rebuild-models.js']
];
const KEEP_DIRS = ['scripts', 'node_modules', 'assets', 'docs', '.github', 'research'];

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (e.name === '.qc-t18' || e.name.startsWith('dist')) continue;
    const s = path.join(src, e.name); const d = path.join(dest, e.name);
    if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}
const sha = (root, rel) => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, rel))).digest('hex');
const readJson = (root, rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));

/** 规范序（与生产同一套：slug → planId → modelKey → variant） */
function orderKey(link) {
  if (!link) return '';
  if (link.apiPlanId !== undefined) {
    return `api\u0000${link.registrySlug}\u0000${link.apiPlanId}\u0000${link.modelKey}\u0000${link.variant === null || link.variant === undefined ? '' : link.variant}`;
  }
  return `coding\u0000${link.registrySlug}\u0000${link.planId}\u0000${link.modelName}`;
}
const sortLinks = list => [...list].sort((a, b) => (orderKey(a) < orderKey(b) ? -1 : orderKey(a) > orderKey(b) ? 1 : 0));
function writeLinks(root, rel, doc) {
  fs.writeFileSync(path.join(root, rel), `${JSON.stringify({ schemaVersion: doc.schemaVersion, links: sortLinks(doc.links) }, null, 2)}\n`);
}

/* ------------------------------ cases ------------------------------ */
const cases = [];
function addCase(id, expect, mutate, note) { cases.push({ id, expect, mutate, note }); }

addCase('m1-wildcard-other-slug', 'red-multi', (root) => {
  const doc = readJson(root, 'scripts/data/model-registry-links.json');
  doc.links.push({
    registrySlug: 'glm-5.3', apiPlanId: 'ebc4af9a71b6', modelKey: 'qwen3-max', variant: null,
    basis: 'explicit-mapping', evidence: [], note: 'T18 m1：P0 原始形态（同一条计价记录第二次归属另一个模型）'
  });
  writeLinks(root, 'scripts/data/model-registry-links.json', doc);
}, 'P0 原始形态：规范序合法追加一条通配映射');

addCase('m2-explicit-standard-other-slug', 'red-multi', (root) => {
  const doc = readJson(root, 'scripts/data/model-registry-links.json');
  doc.links.push({
    registrySlug: 'glm-5.3', apiPlanId: 'ebc4af9a71b6', modelKey: 'qwen3-max', variant: 'standard',
    basis: 'explicit-mapping', evidence: [], note: 'T18 m2：显式 standard 指向另一个 slug（只撞 1 条 identity）'
  });
  writeLinks(root, 'scripts/data/model-registry-links.json', doc);
}, '只撞 67 条里的 1 条');

addCase('m3-adjacent-explicit', 'red-multi', (root) => {
  const doc = readJson(root, 'scripts/data/model-registry-links.json');
  doc.links.push({
    registrySlug: 'glm-5.3', apiPlanId: 'ebc4af9a71b6', modelKey: 'qwen3-max', variant: 'long_context',
    basis: 'explicit-mapping', evidence: [], note: 'T18 m3：显式 long_context（既有通配已认领）'
  });
  writeLinks(root, 'scripts/data/model-registry-links.json', doc);
}, '相邻变体');

addCase('m4-remove-mapping-M09', 'red-multi', (root) => {
  const doc = readJson(root, 'scripts/data/model-registry-links.json');
  const before = doc.links.length;
  doc.links = doc.links.filter(l => !(l.apiPlanId === '4f8bae91f9f8' && l.modelKey === 'claude-fable-5.1'));
  writeLinks(root, 'scripts/data/model-registry-links.json', doc);
  fs.writeFileSync(path.join(root, '.qc-t18-meta.txt'), `${before} -> ${doc.links.length}`);
}, '审计 M09：删一条必需的 registry→API 映射');

addCase('m5-duplicate-top-slug', 'red-all4', (root) => {
  const rel = 'scripts/data/models.json';
  const raw = fs.readFileSync(path.join(root, rel), 'utf8');
  const parsed = JSON.parse(raw);
  const closing = raw.lastIndexOf('}');
  const dup = JSON.stringify(parsed['glm-5.3']);
  fs.writeFileSync(path.join(root, rel), `${raw.slice(0, closing)},\n  "glm-5.3": ${dup}\n${raw.slice(closing)}`);
}, 'F-T19-1 形态：重复顶层 slug 键（第二条逐字段合法，排除干扰判据）');

addCase('m6-root-artifact-only', 'expect-matrix:links-check=green,registry-selftest=green,validate-strict=green,models-reproducible=red', (root) => {
  const rel = 'model-registry-links.json';
  const doc = readJson(root, rel);
  doc.links.push({
    registrySlug: 'glm-5.3', apiPlanId: 'ebc4af9a71b6', modelKey: 'qwen3-max', variant: null,
    basis: 'explicit-mapping', evidence: [], note: 'T18 m6：只改仓根产物（已知假阴性落点）'
  });
  fs.writeFileSync(path.join(root, rel), `${JSON.stringify(doc, null, 2)}\n`);
}, '已知现场事实①：只改仓根 → 可重建性门禁是唯一红的');

addCase('m7-unresolved-wildcard', 'red-multi', (root) => {
  const doc = readJson(root, 'scripts/data/model-registry-links.json');
  doc.links.push({
    registrySlug: 'glm-5.3', apiPlanId: 'ebc4af9a71b6', modelKey: 'ghost-model-key-t18', variant: null,
    basis: 'explicit-mapping', evidence: [], note: 'T18 m7：通配指向记录里不存在的 modelKey'
  });
  writeLinks(root, 'scripts/data/model-registry-links.json', doc);
}, '空展开');

addCase('m8-empty-registry', 'red-all4', (root) => {
  const rel = 'scripts/data/models.json';
  const doc = JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
  const meta = {};
  for (const [k, v] of Object.entries(doc)) if (k.startsWith('_')) meta[k] = v;
  fs.writeFileSync(path.join(root, rel), `${JSON.stringify(meta, null, 2)}\n`);
}, '只剩 _ 元信息键（0 个 slug）');

addCase('m9-delete-links-file', 'red-multi', (root) => {
  fs.rmSync(path.join(root, 'scripts/data/model-registry-links.json'));
}, '关系层来源文件消失');

/* ------------------------------ run ------------------------------ */
fs.mkdirSync(WORK, { recursive: true });
const results = [];
for (const c of cases) {
  const dir = path.join(WORK, c.id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const started = Date.now();
  copyDir(GOLD, dir);
  const before = Object.fromEntries(CONTROLLED.map(r => [r, sha(GOLD, r)]));
  c.mutate(dir);
  const after = {};
  for (const r of CONTROLLED) {
    try { after[r] = sha(dir, r); } catch (e) { after[r] = 'MISSING'; }
  }
  const gates = [];
  for (const [name, cmd] of GATES) {
    const res = spawnSync(cmd, { cwd: dir, shell: true, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const out = `${res.stdout || ''}\n${res.stderr || ''}`;
    const hits = out.split('\n').filter(l => /已经映射到|重复出现|既没有 registry 映射|未认领|没有任何模型|不一致|不存在|不许静默|拒绝写盘|每一条都必须|不存在 ——/.test(l))
      .map(l => l.trim()).slice(0, 3);
    gates.push({ name, command: cmd, exitCode: res.status, hits });
  }
  const reds = gates.filter(g => g.exitCode !== 0).map(g => g.name);
  results.push({
    id: c.id, note: c.note, expect: c.expect, ms: Date.now() - started,
    before, after, changed: CONTROLLED.filter(r => before[r] !== after[r]), gates, reds
  });
  console.log(`\n### ${c.id}（${c.note}）`);
  console.log(`    受控文件变化：${results[results.length - 1].changed.join(', ') || '(无)'}`);
  for (const g of gates) console.log(`    ${g.exitCode === 0 ? 'GREEN' : 'RED  '} ${g.name} (exit ${g.exitCode})${g.hits.length ? ' :: ' + g.hits[0].slice(0, 150) : ''}`);
  console.log(`    期望：${c.expect} · 实测：${reds.join(',') || '(全绿)'}`);
}

/* 预期核对 */
const problems = [];
for (const r of results) {
  if (r.expect === 'red-all4') {
    for (const n of ['links-check', 'registry-selftest', 'validate-strict', 'models-reproducible']) {
      if (!r.reds.includes(n)) problems.push(`${r.id}: ${n} 期望非 0，实测 0`);
    }
  } else if (r.expect === 'red-multi') {
    if (r.reds.length < 2) problems.push(`${r.id}: 期望 ≥2 道门禁非 0，实测只有 ${r.reds.join(',') || '(全绿)'}`);
  } else if (r.expect.startsWith('expect-matrix:')) {
    for (const pair of r.expect.slice('expect-matrix:'.length).split(',')) {
      const [name, want] = pair.split('=');
      const got = r.gates.find(g => g.name === name);
      const isRed = got && got.exitCode !== 0;
      if ((want === 'red') !== !!isRed) problems.push(`${r.id}: ${name} 期望 ${want}，实测 exit ${got ? got.exitCode : 'n/a'}`);
    }
  }
}

console.log('\n===== 变异矩阵汇总 =====');
console.log('case'.padEnd(30) + 'links-check reg-selftest validate reproducible rebuild');
for (const r of results) {
  const cell = n => (r.gates.find(g => g.name === n).exitCode === 0 ? '  green  ' : '  RED    ');
  console.log(r.id.padEnd(30) + cell('links-check') + ' ' + cell('registry-selftest') + ' ' + cell('validate-strict') + ' ' + cell('models-reproducible') + ' ' + cell('rebuild-models'));
}
fs.mkdirSync(path.dirname(JSON_OUT), { recursive: true });
fs.writeFileSync(JSON_OUT, JSON.stringify({ gold: GOLD, work: WORK, results, problems }, null, 2));
if (problems.length) {
  console.log(`\n❌ ${problems.length} 个 case 与预期不符：`);
  problems.forEach(p => console.log('   - ' + p));
  process.exit(1);
}
console.log('\n✅ 全部 case 与预期一致');
process.exit(0);
