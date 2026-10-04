#!/usr/bin/env node
'use strict';
/**
 * t19 · 只读测量：把本地分支推上去需要复刻多少 git 对象（commits / trees / blobs），
 * 以及其中多少在远端已经存在（可用 GET /git/blobs|trees/:sha 探测）。
 * 不写任何东西到远端；只打印计数。
 */
const { spawnSync } = require('child_process');
const path = require('path');
const WT = path.resolve(__dirname, '..', '..', '..');
const OWNER = 'buguoshixc', REPO = 'ai-deals-aggregator';

const git = args => {
  const r = spawnSync('git', ['-C', WT, ...args], { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout;
};

const commits = git(['rev-list', 'HEAD', '--not', 'origin/master']).trim().split('\n').filter(Boolean);
console.log('需要复刻的提交数:', commits.length);
console.log('HEAD =', git(['rev-parse', 'HEAD']).trim());
console.log('origin/master =', git(['rev-parse', 'origin/master']).trim());

// 对象清单（含 trees 与 blobs，附路径）
const objects = git(['rev-list', '--objects', 'HEAD', '--not', 'origin/master']).trim().split('\n').filter(Boolean)
  .map(line => { const [sha, ...rest] = line.split(' '); return { sha, path: rest.join(' ') }; });
const typeOf = sha => git(['cat-file', '-t', sha]).trim();
const counts = { commit: 0, tree: 0, blob: 0, tag: 0 };
const byType = { tree: [], blob: [] };
for (const o of objects) {
  const t = typeOf(o.sha);
  counts[t] = (counts[t] || 0) + 1;
  if (t === 'tree' || t === 'blob') byType[t].push(o);
}
console.log('可达新对象:', JSON.stringify(counts));

// 远端是否已有（探测，读操作）
const ghTry = endpoint => {
  const r = spawnSync('gh', ['api', `repos/${OWNER}/${REPO}/${endpoint}`], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  return r.status === 0;
};
const sample = list => list.filter((_, i) => i % Math.max(1, Math.floor(list.length / 8)) === 0).slice(0, 8);
let treeMissing = 0, blobMissing = 0;
for (const o of sample(byType.tree)) if (!ghTry(`git/trees/${o.sha}`)) treeMissing++;
for (const o of sample(byType.blob)) if (!ghTry(`git/blobs/${o.sha}`)) blobMissing++;
const ns = sample(byType.tree).length, nb = sample(byType.blob).length;
console.log(`抽样探测：tree 缺 ${treeMissing}/${ns} · blob 缺 ${blobMissing}/${nb}`);
console.log('（抽样若显示"全缺"，说明 API 这条路要复刻全部 tree+blob；若显示"多数已有"，说明远端已有多数对象，只剩新增部分）');
