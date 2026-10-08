#!/usr/bin/env node
/**
 * 把本地 Full Gate（`node scripts/test/run.js --gate`）的日志抽成小 JSON 证据（t18）。
 *
 * 为什么要有这一步：报告里「它在 CI 里真的会跑」这句话必须有**可复核的读数**，
 * 而不是「我跑过」。这一条判据直接解析那份日志（日志本身是 Tier-3，不入库；读数入库）。
 *
 * 用法：node research/_raw/sources-residue-v1b/gate-run-evidence.js [_full-gate.log]
 * 产出：research/_raw/sources-residue-v1b/gate-run-evidence.json
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const LOG = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, '_full-gate.log');
const OUT = path.join(__dirname, 'gate-run-evidence.json');

if (!fs.existsSync(LOG)) {
  console.error(`找不到 gate 日志：${LOG}（先跑 node scripts/test/run.js --gate 并 tee 到该文件）`);
  process.exit(2);
}

/**
 * 读日志并按需解码：Windows PowerShell 5.1 的 `Tee-Object` 默认写成 **UTF-16LE**（带 BOM），
 * 直接当 UTF-8 读会得到一串 NUL 分隔的乱码 —— 那种情况下正则一条也匹配不到，
 * 于是这份「证据」会安静地变成一份空 JSON。这里显式认 BOM。
 */
function readLog(file) {
  const raw = fs.readFileSync(file);
  if (raw[0] === 0xff && raw[1] === 0xfe) return raw.toString('utf16le').replace(/^\uFEFF/, '');
  if (raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf) return raw.slice(3).toString('utf8');
  return raw.toString('utf8');
}

const lines = readLog(LOG).split(/\r?\n/);
const stepLine = /^\s+([✓✗·])\s+(\d+\.\d+)s\s+\[(\d+)\]\s+(.*)$/;
const steps = [];
for (const line of lines) {
  const m = stepLine.exec(line);
  if (m) steps.push({ status: m[1], seconds: Number(m[2]), index: Number(m[3]), name: m[4].trim() });
}

const self = steps.find(step => step.name.includes('Roles-note self-test'));
const declared = (lines.find(line => line.includes('门禁步骤（读自')) || '').trim();
const total = (lines.find(line => /合计 .*个脚本/.test(line)) || '').trim();
const skipped = lines.findIndex(line => line.includes('跳过的'));
const conclusion = lines.filter(line => line.startsWith('✅') || line.startsWith('❌')).slice(-1)[0] || '';

const report = {
  task: 'roles-note-tooth-v1',
  date: '2026-10-08',
  source: 'node scripts/test/run.js --gate（解析 .github/actions/gate/action.yml 并按顺序执行，唯一一份步骤定义）',
  logFile: path.relative(ROOT, LOG).split(path.sep).join('/'),
  declaredSteps: declared,
  totals: total,
  failureCount: steps.filter(step => step.status === '✗').length,
  skippedNonNodeSteps: skipped >= 0 ? lines.slice(skipped, skipped + 5).map(s => s.trim()).filter(Boolean) : [],
  rolesNoteStep: self || null,
  rolesNoteNeighbours: self ? steps.filter(step => Math.abs(step.index - self.index) <= 1) : [],
  conclusion
};

fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n', 'utf8');

console.log(`步数（实跑）=${steps.length} 失败=${report.failureCount}`);
console.log(`我的步骤：${self ? `[${self.index}] ${self.name} → ${self.status} ${self.seconds}s` : '（日志里没找到）'}`);
console.log(`结论：${conclusion}`);
console.log(`→ ${path.relative(ROOT, OUT).split(path.sep).join('/')}`);
process.exit(self && self.status === '✓' && report.failureCount === 0 ? 0 : 1);
