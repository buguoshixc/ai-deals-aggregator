#!/usr/bin/env node
/**
 * t46 反证夹具（验收 ②：五态普查的硬断言必须真的能红）。
 *
 * 三件事，都用**报告自带的验证开关**（`--published-models=` / `--candidates=`）喂临时文件，
 * **不碰盘上的生产数据**：
 *   · P1 少一个模型（五态之和 43 ≠ registry 模型数 44）⇒ 必红，且点名「五态普查不闭合」；
 *   · P2 出现词表外的 catalogStatus（retired）⇒ 必红，且点名「不在词表里」；
 *   · P3 某条缺 catalogStatus 字段 ⇒ 必红（"(字段缺失)" 也算词表外，不许静默并进 unknown）；
 *   · P4 候选登记表换成 2 条 ⇒ JSON 的 `candidates.rows` 必须**跟着输入走**（不是写死的常量载体）；
 *   · C1 对照绿：不改任何输入 ⇒ exit 0 + 文本/JSON 两侧读数一致 + JSON 的普查等于直接过滤。
 *
 * 运行前后复核共享工作区**没有被动过**（报告是只读的；临时文件都落在 TEMP）。
 *
 * 用法：node research/_raw/t46/counter-proofs.cjs [--json]
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const HERE = __dirname;
const ROOT = path.resolve(HERE, '..', '..', '..');
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

const GUARD_FILES = [
  'scripts/tools/coverage-report.js',
  'scripts/tools/coverage-targets-selftest.js',
  'models.json',
  'scripts/data/models.json',
  'scripts/data/coverage-targets.json',
  'research/v3.0-source-candidates.json',
  'research/_raw/t39/report-inputs.md'
];

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
    try { blocks.push({ raw, value: JSON.parse(raw) }); } catch { /* 非 JSON 块 */ }
    index = end;
  }
  return blocks;
}

const runReport = args => spawnSync(process.execPath, ['scripts/tools/coverage-report.js', ...args], {
  cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024
});
const payloadOf = stdout => {
  const block = jsonBlocks(stdout).find(item => item.value && item.value.registry && item.value.api);
  return block ? block.value : null;
};

function main() {
  const jsonMode = process.argv.includes('--json');
  const before = new Map(GUARD_FILES.map(rel => [rel, sha(path.join(ROOT, rel))]));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 't46-counter-'));
  const results = [];
  const record = (id, claim, passed, evidence) => {
    results.push({ id, claim, status: passed ? 'passed' : 'failed', evidence });
    if (!jsonMode) console.log(`  ${passed ? '✓' : '✗'} ${id} ${claim}\n      ${evidence}`);
  };

  const publishedDoc = JSON.parse(fs.readFileSync(path.join(ROOT, 'models.json'), 'utf8'));
  const writeJson = (name, value) => {
    const file = path.join(tmp, name);
    fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    return file;
  };

  if (!jsonMode) console.log('=== t46 反证夹具（--published-models / --candidates 临时输入）===');

  /* ---- C1 对照绿：未改动 ⇒ exit 0 + 两侧读数一致 + JSON 普查 == 直接过滤 ---- */
  {
    const run = runReport(['--json']);
    const payload = payloadOf(run.stdout);
    const census = payload && payload.coverageTargets && payload.coverageTargets.catalogStatusCensus;
    const wordList = (census && census.statusOrder) || [];
    const line = /current (\d+) · aging (\d+) · legacy (\d+) · historical (\d+) · unknown (\d+)（和 (\d+)）/.exec(run.stdout);
    const filterOk = census && census.landed && wordList.every(status => census.counts[status]
      === publishedDoc.models.filter(model => model.catalogStatus === status).length);
    record('C1', '对照绿：未改任何输入 ⇒ exit 0，且 JSON 的逐档计数 == 直接过滤 models.json，文本那一行与 JSON 逐档一致',
      run.status === 0 && Boolean(line) && filterOk
      && wordList.every((status, index) => Number(line[index + 1]) === census.counts[status])
      && Number(line[6]) === census.sum,
      `exit ${run.status}；文本「${line ? line[0] : '(缺)'}」；JSON ${JSON.stringify(census && census.counts)} sum=${census && census.sum}`);
  }

  /* ---- P1 少一个模型 ⇒ 五态之和 ≠ registry 模型数 ---- */
  {
    const file = writeJson('shorter.json', Object.assign({}, publishedDoc, {
      count: publishedDoc.models.length - 1, models: publishedDoc.models.slice(0, -1)
    }));
    const run = runReport([`--published-models=${file}`]);
    const hit = run.stderr.split('\n').find(text => text.includes('五态普查不闭合')) || '';
    record('P1', '少一个模型（43 ≠ 44）⇒ 必红，且点名「五态普查不闭合」并给出两侧数字',
      run.status !== 0 && hit.includes('五态之和 43') && hit.includes('registry 模型数 44'),
      `exit ${run.status}；${hit.trim().slice(0, 160)}`);
  }

  /* ---- P2 词表外的 catalogStatus ---- */
  {
    const doc = JSON.parse(JSON.stringify(publishedDoc));
    doc.models[doc.models.length - 1].catalogStatus = 'retired';
    const run = runReport([`--published-models=${writeJson('bogus.json', doc)}`]);
    const hit = run.stderr.split('\n').find(text => text.includes('不在词表里')) || '';
    record('P2', '出现词表外的 catalogStatus（retired）⇒ 必红，且点名「不在词表里」并列出该值',
      run.status !== 0 && hit.includes('retired'),
      `exit ${run.status}；${hit.trim().slice(0, 160)}`);
  }

  /* ---- P3 缺 catalogStatus 字段（不许静默并进 unknown） ---- */
  {
    const doc = JSON.parse(JSON.stringify(publishedDoc));
    delete doc.models[doc.models.length - 1].catalogStatus;
    const run = runReport([`--published-models=${writeJson('missing-field.json', doc)}`]);
    const hit = run.stderr.split('\n').find(text => text.includes('不在词表里')) || '';
    record('P3', '某条缺 catalogStatus 字段 ⇒ 必红（"(字段缺失)" 也算词表外，不许静默并进 unknown）',
      run.status !== 0 && hit.includes('(字段缺失)'),
      `exit ${run.status}；${hit.trim().slice(0, 160)}`);
  }

  /* ---- P4 候选明细载体跟着输入走（F2 的载体不是常量） ---- */
  {
    const crafted = {
      candidates: [
        { provider: '反证厂商 A', slug: 't46-a', stage: 'C1', url: 'https://example.com/a', checkedAt: '2026-10-01',
          decision: 'not_adopted', failedReason: '反证用失败原因 A', isJs: true, requiresLogin: false,
          dynamicPagination: false, pageOffline: false, incomplete: true },
        { provider: '反证厂商 B', slug: 't46-b', stage: 'C1', url: 'https://example.com/b', checkedAt: '2026-10-02',
          decision: 'adopted', adoptedReason: '反证用采信理由 B', failedReason: null, isJs: false, requiresLogin: true,
          dynamicPagination: true, pageOffline: false, incomplete: false }
      ]
    };
    // 同时喂一份临时 md：报告有一条既有检查「md 里必须出现每条候选的 provider」——
    // 那不是本任务要验的东西，所以让它也自洽（不然报告会在打印 JSON 之前就退出）。
    const mdFile = path.join(tmp, 'candidates.md');
    fs.writeFileSync(mdFile, '# t46 反证用候选 md\n\n· 反证厂商 A\n· 反证厂商 B\n', 'utf8');
    const run = runReport(['--json', `--candidates=${writeJson('candidates.json', crafted)}`, `--candidates-md=${mdFile}`]);
    const payload = payloadOf(run.stdout);
    const rows = payload && payload.candidates ? payload.candidates.rows : null;
    record('P4', '候选登记表换成 2 条 ⇒ candidates.rows 逐条跟着输入走（url / 检查日期 / 未采信原因都在）',
      Boolean(rows) && rows.length === 2
      && rows.some(row => row.url === 'https://example.com/a' && row.checkedAt === '2026-10-01' && row.failedReason === '反证用失败原因 A' && row.adopted === false)
      && rows.some(row => row.url === 'https://example.com/b' && row.checkedAt === '2026-10-02' && row.adoptedReason === '反证用采信理由 B' && row.adopted === true),
      `exit ${run.status}；rows=${rows ? JSON.stringify(rows.map(row => [row.url, row.checkedAt, row.adopted])) : '(缺)'}`);
  }

  fs.rmSync(tmp, { recursive: true, force: true });

  const drift = GUARD_FILES.filter(rel => sha(path.join(ROOT, rel)) !== before.get(rel));
  const failed = results.filter(row => row.status !== 'passed');
  if (!jsonMode) console.log(`\n共享工作区未被改动：${drift.length === 0 ? `✓ ${GUARD_FILES.length}/${GUARD_FILES.length} 文件 sha256 一致` : `✗ ${drift.join(', ')}`}`);
  if (!jsonMode) console.log(`=== 反证：${results.length - failed.length}/${results.length} 通过${failed.length ? `（${failed.map(row => row.id).join(', ')} 失败）` : ''} ===`);

  if (jsonMode) {
    const out = { generatedFrom: ROOT, cases: results.length, passed: results.length - failed.length, failed: failed.length, guardDrift: drift, results };
    fs.writeFileSync(path.join(HERE, 't46-counter-proofs.json'), `${JSON.stringify(out, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify(out, null, 2));
  }
  return failed.length || drift.length ? 1 : 0;
}

process.exit(main());
