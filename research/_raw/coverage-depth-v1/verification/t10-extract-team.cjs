#!/usr/bin/env node
/**
 * t10 工具：从团队记录 `.agent-teams/coverage-depth-v1/team.json`（**只读诊断**）里
 * 抽出题面章节标记的上下文、每个任务的契约摘要、以及消息里关于"任务书截断"的事实。
 *
 * 用法：node t10-extract-team.cjs <teamJsonPath> <outDir>
 */
'use strict';
const fs = require('fs');
const path = require('path');

const teamFile = process.argv[2];
const outDir = path.resolve(process.argv[3] || '.');
fs.mkdirSync(outDir, { recursive: true });
const team = JSON.parse(fs.readFileSync(teamFile, 'utf8'));
const blob = JSON.stringify(team);

/* ---------- ① 章节标记上下文 ---------- */
const marks = ['§47', '§48', '§49', '§77', '§79', '§80'];
const ctxOut = [];
for (const mark of marks) {
  let i = -1;
  let n = 0;
  while ((i = blob.indexOf(mark, i + 1)) >= 0) {
    n += 1;
    const raw = blob.slice(Math.max(0, i - 700), i + 1200)
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\\u003c/g, '<')
      .replace(/\\u003e/g, '>');
    ctxOut.push(`\n===== ${mark} occurrence #${n} @${i} =====\n${raw}`);
  }
  ctxOut.push(`\n##### ${mark} 共 ${n} 次 #####\n`);
}
fs.writeFileSync(path.join(outDir, 't10-prompt-marks.txt'), ctxOut.join('\n'));

/* ---------- ② 每个任务的契约摘要 ---------- */
const lines = [];
for (const task of (team.tasks || [])) {
  lines.push(`\n========== ${task.id} | ${task.status} | ${task.kind} ==========`);
  lines.push(`objective: ${String(task.objective || '').slice(0, 800)}`);
  lines.push(`inScope: ${JSON.stringify(task.inScope || null)}`);
  lines.push(`outOfScope: ${JSON.stringify(task.outOfScope || null)}`);
  const acc = Array.isArray(task.acceptance) ? task.acceptance : [];
  lines.push(`acceptance(${acc.length}):`);
  acc.forEach((a, i) => lines.push(`  A${i + 1}: ${String(a)}`));
  lines.push(`verify: ${JSON.stringify(task.verify || null)}`);
  lines.push(`assignee: ${task.assignee || task.owner || '(n/a)'} | attempts: ${task.attempts ? task.attempts.length : '(n/a)'}`);
}
fs.writeFileSync(path.join(outDir, 't10-task-contracts.txt'), lines.join('\n'));

/* ---------- ③ 消息里的"截断"事实 ---------- */
const trunc = [];
const walk = (node, trail) => {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach((v, i) => walk(v, `${trail}[${i}]`)); return; }
  for (const [k, v] of Object.entries(node)) {
    if (typeof v === 'string' && /截断|truncat|渲染版|完整契约/.test(v)) {
      trunc.push(`--- ${trail}.${k} ---\n${v.slice(0, 1500)}`);
    } else walk(v, `${trail}.${k}`);
  }
};
walk(team, 'team');
for (const inbox of fs.readdirSync(path.join(path.dirname(teamFile), 'inbox'))) {
  const file = path.join(path.dirname(teamFile), 'inbox', inbox);
  const text = fs.readFileSync(file, 'utf8');
  const hits = text.split('\n').filter(l => /截断|truncat|渲染版|完整契约/.test(l));
  if (hits.length) trunc.push(`--- inbox/${inbox} (${hits.length} 行) ---\n${hits.slice(0, 12).map(h => h.slice(0, 900)).join('\n')}`);
}
fs.writeFileSync(path.join(outDir, 't10-truncation-facts.txt'), trunc.join('\n\n'));

console.log(JSON.stringify({
  marks: ctxOut.filter(l => l.startsWith('\n=====')).length,
  tasks: (team.tasks || []).length,
  truncationHits: trunc.length,
  outFiles: ['t10-prompt-marks.txt', 't10-task-contracts.txt', 't10-truncation-facts.txt']
}, null, 2));
