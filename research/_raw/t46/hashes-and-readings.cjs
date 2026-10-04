#!/usr/bin/env node
/**
 * t46 现场读数 + determinism 两条口径（F4 的可复跑出处）。
 *
 * ## 两条口径的定义（写在这里，下次不用猜 —— 这正是 t39 L169 那个数字缺的东西）
 *
 * 1. **stdout sha256**：两次 `coverage-report.js --json` 的**完整 stdout 字节**的 sha256。
 *    这是"determinism 基线"该引的那个值（`Buffer.equals === true` 时两次同值）。
 * 2. **载荷段 sha256**：从 stdout 里按**括号配对**切出**第 2 个** JSON 块（顶层同时含 `registry` 与 `api`
 *    的那个 —— 第 1 个是 freshness 策略快照），对切出的原文取 sha256。切法与 t45 `extract-payload.cjs`
 *    逐字一致（与 t39 `collect.cjs` 的 jsonBlocks 同口径），这样三个文件之间可以互相对拍。
 *
 * ⚠️ **值会随报告内容变**：引这两个值时必须连"报告的内容版本"一起引（否则下一个人复跑会对不上，
 *    就像 t39 记的那个 `72b2bab3…`）。t39 原有那行原样保留，t46 只在 `report-inputs.md` 末尾 append 口径。
 *
 * 用法：
 *   node research/_raw/t46/hashes-and-readings.cjs          # 人读
 *   node research/_raw/t46/hashes-and-readings.cjs --json   # 机器读（并写 t46-readings.json）
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const HERE = __dirname;
const ROOT = path.resolve(HERE, '..', '..', '..');
const sha = buffer => crypto.createHash('sha256').update(buffer).digest('hex');

/** 括号配对切 JSON 块（与 t45 `extract-payload.cjs` / t39 `collect.cjs` 同口径） */
function jsonBlocks(text) {
  const blocks = [];
  for (let index = 0; index < text.length; index++) {
    if (text[index] !== '{') continue;
    let depth = 0, inString = false, escaped = false, end = -1;
    for (let scan = index; scan < text.length; scan++) {
      const char = text[scan];
      if (inString) {
        if (escaped) { escaped = false; continue; }
        if (char === '\\') { escaped = true; continue; }
        if (char === '"') inString = false;
        continue;
      }
      if (char === '"') { inString = true; continue; }
      if (char === '{') depth++;
      else if (char === '}') { depth--; if (depth === 0) { end = scan; break; } }
    }
    if (end < 0) break;
    const raw = text.slice(index, end + 1);
    try { blocks.push({ at: index, raw, value: JSON.parse(raw) }); } catch { /* 非 JSON 块 */ }
    index = end;
  }
  return blocks;
}

const runReport = args => spawnSync(process.execPath, ['scripts/tools/coverage-report.js', ...args], {
  cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024
});

function main() {
  const jsonMode = process.argv.includes('--json');
  const first = runReport(['--json']);
  const second = runReport(['--json']);
  const blocks1 = jsonBlocks(first.stdout);
  const payloadBlock = blocks1.find(block => block.value && block.value.registry && block.value.api);
  const payload1 = payloadBlock ? payloadBlock.value : null;

  // 现场复算（acceptance ③）：契约里那条命令指向**来源层**注册表，那里没有派生字段 catalogStatus；
  // 真正带 catalogStatus 的是发布产物 ./models.json —— 两条都跑，把差异如实写出来。
  const sourceRegistry = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'data', 'models.json'), 'utf8'));
  const sourceCensus = {};
  for (const [key, value] of Object.entries(sourceRegistry)) {
    if (key.startsWith('_')) continue;
    sourceCensus[value.catalogStatus] = (sourceCensus[value.catalogStatus] || 0) + 1;
  }
  const publishedModels = JSON.parse(fs.readFileSync(path.join(ROOT, 'models.json'), 'utf8')).models;
  const publishedCensus = {};
  for (const model of publishedModels) publishedCensus[model.catalogStatus] = (publishedCensus[model.catalogStatus] || 0) + 1;

  const censusLine = /current (\d+) · aging (\d+) · legacy (\d+) · historical (\d+) · unknown (\d+)（和 (\d+)）/.exec(first.stdout);
  const census = payload1 && payload1.coverageTargets ? payload1.coverageTargets.catalogStatusCensus : null;
  const candidates = payload1 ? payload1.candidates : null;
  const sourceHealth = payload1 && payload1.coverageTargets ? payload1.coverageTargets.sourceHealth : null;

  const readings = {
    command: 'node scripts/tools/coverage-report.js --json',
    contentVersion: 'HEAD 之后未提交的工作区（t46 改动）',
    exitCodes: [first.status, second.status],
    stdoutBytes: Buffer.byteLength(first.stdout),
    stdoutSha256: sha(first.stdout),
    stdoutBytesSecond: Buffer.byteLength(second.stdout),
    stdoutSha256Second: sha(second.stdout),
    twoRunsIdentical: first.stdout === second.stdout,
    payloadBytes: payloadBlock ? Buffer.byteLength(payloadBlock.raw) : null,
    payloadSha256: payloadBlock ? sha(payloadBlock.raw) : null,
    payloadDefinition: '从 stdout 按括号配对切出的第 2 个 JSON 块（顶层含 registry+api）的原文',
    topLevelKeys: payload1 ? Object.keys(payload1) : null,
    coverageTargetsKeys: payload1 && payload1.coverageTargets ? Object.keys(payload1.coverageTargets) : null,
    census: census,
    censusTextLine: censusLine ? censusLine[0] : null,
    candidates: candidates ? {
      keys: Object.keys(candidates),
      total: candidates.total,
      adopted: candidates.adopted,
      notAdopted: candidates.notAdopted,
      rows: Array.isArray(candidates.rows) ? candidates.rows.length : null,
      rowsWithUrl: Array.isArray(candidates.rows) ? candidates.rows.filter(row => /^https?:/.test(String(row.url))).length : null,
      rowsWithCheckedAt: Array.isArray(candidates.rows) ? candidates.rows.filter(row => row.checkedAt).length : null,
      rowsWithFailedReason: Array.isArray(candidates.rows) ? candidates.rows.filter(row => row.failedReason).length : null
    } : null,
    sourceHealth: sourceHealth ? {
      keys: Object.keys(sourceHealth),
      declared: sourceHealth.declaredSources.length,
      registryRowCount: sourceHealth.registryRowCount,
      registryOnlySources: sourceHealth.registryOnlySources
    } : null,
    recompute: {
      契约命令_scripts_data_models: sourceCensus,
      发布产物_models: publishedCensus,
      发布产物_models_sum: publishedModels.length
    }
  };

  if (jsonMode) {
    fs.writeFileSync(path.join(HERE, 't46-readings.json'), `${JSON.stringify(readings, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify(readings, null, 2));
    return readings.twoRunsIdentical && first.status === 0 && second.status === 0 ? 0 : 1;
  }

  console.log('=== t46 现场读数（coverage-report --json）===');
  console.log(`  exit            : ${readings.exitCodes.join(' / ')}`);
  console.log(`  stdout bytes    : ${readings.stdoutBytes}`);
  console.log(`  stdout sha256   : ${readings.stdoutSha256}`);
  console.log(`  两次逐字节一致    : ${readings.twoRunsIdentical}`);
  console.log(`  载荷段 bytes     : ${readings.payloadBytes}`);
  console.log(`  载荷段 sha256    : ${readings.payloadSha256}`);
  console.log(`  顶层键           : ${readings.topLevelKeys.join(', ')}`);
  console.log(`  coverageTargets  : ${readings.coverageTargetsKeys.join(', ')}`);
  console.log(`  五态普查（JSON）  : ${JSON.stringify(census && census.counts)} · sum=${census && census.sum} · registryModels=${census && census.registryModels} · 词表外=${JSON.stringify(census && census.statusesOutsideWordList)}`);
  console.log(`  五态普查（文本）  : ${readings.censusTextLine}`);
  console.log(`  候选明细（JSON）  : ${JSON.stringify(readings.candidates)}`);
  console.log(`  来源宇宙（JSON）  : ${JSON.stringify(readings.sourceHealth)}`);
  console.log('  复算（契约命令 → 来源层注册表）:', JSON.stringify(sourceCensus));
  console.log('  复算（发布产物 models.json）  :', JSON.stringify(publishedCensus), 'sum', publishedModels.length);
  return readings.twoRunsIdentical && first.status === 0 && second.status === 0 ? 0 : 1;
}

process.exit(main());
