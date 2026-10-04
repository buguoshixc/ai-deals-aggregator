#!/usr/bin/env node
/**
 * 两种装配方式：
 *   A) --fixture=<qc-e2e 副本>：只移植三份非空历史（轻量，但夹具与当前代码未必完全同源）
 *   B) --sync-code=<gold> --fixture=<qc-e2e 副本> --generate：先把**当前代码**同步进夹具工作区，
 *      再用产品自己的生成器（history-nonempty-e2e --no-sync --prepare-only）**重新生成**合成非空历史
 *      —— 这是与当前代码同源的装配口径（M03/M04 采用 B）。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const argOf = (n, d) => { const a = process.argv.find(x => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
const has = n => process.argv.includes(`--${n}`);
const CASE = path.resolve(argOf('case', '.'));
const FIXTURE = path.resolve(argOf('fixture', ''));
const SYNC_CODE = argOf('sync-code', '');
if (!FIXTURE || !fs.existsSync(FIXTURE)) { console.error(`缺少夹具工作区：${FIXTURE}`); process.exit(2); }

const copyDir = (src, dest) => {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (e.name.startsWith('.qc-') || e.name.startsWith('dist.qc-')) continue;
    const s = path.join(src, e.name), d = path.join(dest, e.name);
    const st = fs.lstatSync(s);
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
};

if (SYNC_CODE) {
  // B 路线的第一步：把当前代码（gold）同步进夹具工作区；**不动夹具的历史与数据**
  const KEEP = new Set([
    'scripts/data/deal-history.json', 'scripts/data/plan-history.json', 'scripts/data/api-plan-history.json',
    'scripts/data/deals.json', 'deals.json', 'plans.json', 'api-plans.json', 'models.json', 'model-registry-links.json'
  ]);
  for (const rel of ['scripts', '.github', 'assets', 'docs']) {
    copyDir(path.join(SYNC_CODE, rel), path.join(CASE, rel));
  }
  for (const f of fs.readdirSync(SYNC_CODE, { withFileTypes: true })) {
    if (!f.isFile()) continue;
    if (KEEP.has(f.name)) continue;
    fs.copyFileSync(path.join(SYNC_CODE, f.name), path.join(CASE, f.name));
  }
  console.log('已同步当前代码（保留夹具的历史与数据文件）');
}

if (has('generate')) {
  const tool = path.join(SYNC_CODE || CASE, 'scripts/tools/history-nonempty-e2e.js');
  const r = spawnSync(`node "${tool}" --root="${CASE}" --prepare-only --state=synthetic --no-sync`, { cwd: CASE, shell: true, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  console.log(`生成器 exit=${r.status}`);
  const tail = `${r.stdout || ''}${r.stderr || ''}`.split('\n').filter(Boolean).slice(-6).join('\n');
  if (tail) console.log(tail);
  if (r.status !== 0) process.exit(r.status || 1);
}

const HISTORY = ['deal-history.json', 'plan-history.json', 'api-plan-history.json'];
const copied = [];
for (const h of HISTORY) {
  const from = path.join(FIXTURE, 'scripts/data', h);
  const to = path.join(CASE, 'scripts/data', h);
  if (fs.existsSync(from) && !has('generate')) { fs.copyFileSync(from, to); copied.push(h); }
}
const counts = {};
for (const h of HISTORY) {
  const doc = JSON.parse(fs.readFileSync(path.join(CASE, 'scripts/data', h), 'utf8'));
  const events = doc.events || (doc.store && doc.store.events) || [];
  counts[h] = events.length;
}
console.log(`非空历史：${copied.length ? '移植 ' + copied.join(' · ') : '由生成器重建'}`);
console.log(`事件数：${JSON.stringify(counts)}`);

