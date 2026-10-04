#!/usr/bin/env node
'use strict';
/**
 * t19 · 逐个 token 打靶：把候选 40 位高熵串单独 POST 成 blob，看 GitHub push protection 拦哪一个。
 * 用途：把「文件被拦」定位到「具体哪个串 + 上下文是什么」，从而判断是真凭据还是假阳性。
 * 用法：node t19-token-probe.cjs <file> [out.json]
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const WT = 'D:/OneDrive/Desktop/Code/AI Page/.worktrees/coverage-expansion-v1';
const file = process.argv[2];
const OUT = process.argv[3] || path.join(WT, 'research/_raw/t19', 't19-token-probe.json');

const text = fs.readFileSync(path.join(WT, file), 'utf8');
const RE = /(?<![A-Za-z0-9/+=])[A-Za-z0-9/+=]{40}(?![A-Za-z0-9/+=])/g;
const uniq = new Map();
let m;
while ((m = RE.exec(text))) if (!uniq.has(m[0])) uniq.set(m[0], m.index);
console.log(`${file}: 40 位串去重 ${uniq.size} 个`);

const results = [];
for (const [tok, at] of uniq) {
  const ctx = text.slice(Math.max(0, at - 70), at + 70).replace(/\s+/g, ' ');
  const r = spawnSync('gh', ['api', '-X', 'POST', 'repos/buguoshixc/ai-deals-aggregator/git/blobs',
    '-f', 'content=' + tok, '-f', 'encoding=utf-8'], { encoding: 'utf8' });
  const blocked = r.status !== 0;
  const sha = !blocked ? (JSON.parse(r.stdout).sha || '').slice(0, 12) : null;
  results.push({ token: tok.slice(0, 12) + '…', len: tok.length, at, blocked, sha, ctx: ctx.slice(0, 150) });
  if (blocked) console.log(`  ❌ BLOCKED  ${tok.slice(0, 14)}…  ctx: ${ctx.slice(0, 110)}`);
}
const blockedCount = results.filter(r => r.blocked).length;
console.log(`被拦 ${blockedCount} / 试了 ${results.length}`);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ file, testedAt: new Date().toISOString(), tested: results.length, blocked: blockedCount, results }, null, 2) + '\n', 'utf8');
console.log('已写 ' + OUT);
