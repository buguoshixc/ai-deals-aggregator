#!/usr/bin/env node
/**
 * T29 · Full Gate 完整性核对（不跑浏览器）：
 *   A) **现场解析** `.github/actions/gate/action.yml` 的步骤名单与步数；
 *   B) 读 t28 自留的 `teeth/_scratch/r6-gate/summary.json`，核 executed/passed/failed/skipped/exitCode/
 *      verifySiteSha256/stepsInAction，并把 45 条 result 名字逐条对到 action.yml 的步骤名上；
 *   C) 钉住第 47/48 步的读数（verify-site 项数）与记录的 verify-site sha。
 * 用法：node check-gate.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../../../../../..');
const T29 = path.join(ROOT, 'research', '_raw', 'secondary-page-layout-unification', 'review', 't29');
const ACTION = path.join(ROOT, '.github', 'actions', 'gate', 'action.yml');
const SUMMARY = path.join(ROOT, 'research', '_raw', 'secondary-page-layout-unification', 'teeth', '_scratch', 'r6-gate', 'summary.json');

// A) 现场解析 action.yml：按 `- name:` 切步骤（gate 的步骤都是 name 开头）
const raw = fs.readFileSync(ACTION, 'utf8').split(/\r?\n/);
const steps = [];
for (let i = 0; i < raw.length; i++) {
  const m = raw[i].match(/^\s*-\s+name:\s*(.+?)\s*$/);
  if (m) steps.push({ line: i + 1, name: m[1].replace(/^['"]|['"]$/g, ''), hasIf: false });
}
for (let i = 0; i < raw.length; i++) {
  const cur = steps.filter(s => s.line <= i + 1).pop();
  if (cur && /^\s+if:/.test(raw[i])) cur.hasIf = true;
}

// B) summary.json
const summary = fs.existsSync(SUMMARY) ? JSON.parse(fs.readFileSync(SUMMARY, 'utf8')) : null;
const results = (summary && (summary.results || summary.runs)) || [];
const byIndex = new Map();
for (const r of results) {
  const idx = Number(r.index ?? r.step ?? r.id ?? NaN);
  if (!Number.isNaN(idx)) byIndex.set(idx, r);
}
const verifySite = path.join(ROOT, 'scripts', 'tools', 'verify-site.js');
const crypto = require('crypto');
const actualSha = crypto.createHash('sha256').update(fs.readFileSync(verifySite)).digest('hex');
const out = {
  actionYml: { path: path.relative(ROOT, ACTION).replace(/\\/g, '/'), parsedSteps: steps.length, withIf: steps.filter(s => s.hasIf).length, names: steps.map(s => s.name) },
  summary: summary ? {
    stepsInAction: summary.stepsInAction,
    executed: summary.executed, passed: summary.passed, failed: summary.failed, skipped: summary.skipped,
    skippedNotRunYet: summary.skippedNotRunYet, exitCode: summary.exitCode, verifySiteSha256: summary.verifySiteSha256,
    resultCount: results.length
  } : null,
  crossCheck: summary ? {
    stepsMatchParsed: summary.stepsInAction === steps.length,
    sumMatchesExecuted: summary.executed + summary.skipped === summary.stepsInAction,
    passFailConsistent: summary.passed + summary.failed === summary.executed,
    exitZero: summary.exitCode === 0,
    shaMatchesCurrent: summary.verifySiteSha256 === actualSha
  } : null,
  steps47and48: [47, 48].map(idx => {
    const r = byIndex.get(idx);
    return r ? { index: idx, name: r.name, status: r.status, exitCode: r.exitCode, detail: String(r.detail || r.items || r.summary || '').slice(0, 220) } : { index: idx, missing: true };
  })
};
// 45 条 result 的名字逐条对到 action.yml
if (results.length) {
  const names = new Set(steps.map(s => s.name));
  out.nameMismatch = results.filter(r => r.name && !names.has(r.name)).map(r => r.name);
}
fs.writeFileSync(path.join(T29, 'runs', 'check-gate.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2).slice(0, 4000));
