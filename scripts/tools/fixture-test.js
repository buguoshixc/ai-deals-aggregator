#!/usr/bin/env node
/**
 * fixture 回放测试（v2.0 Phase D）——**离线、确定性**，因此进得了门禁。
 *
 * 做法：对每个 `scripts/data/fixtures/<name>/`：
 *   读 `page.min.html` → 交给**生产解析器**（collector 的 `parse()`）→ 与 `expected.json` 逐字段比对。
 *
 * 它守的是哪件事：**解析器的行为变化必须是有意的**。
 * 没有它，"AI 生成的 collector 补丁"就没有任何判据 —— 只能靠"跑一遍真实页面看看还有没有数据"，
 * 而那等于把我们的测试建立在第三方的可用性上。
 *
 * 缺失的 fixture 目录**跳过而不是报错**：fixture 是我们自己的测试资料，
 * 它的存在与否不该阻断采集链路（与 `.ai-cache/` 同一条思路）。
 */

'use strict';

const fs = require('fs');
const path = require('path');

const registry = require('../collectors');

const ROOT = path.join(__dirname, '..', '..');
const FIXTURES_DIR = path.join(__dirname, '..', 'data', 'fixtures');
const MAX_FIXTURE_BYTES = 20 * 1024;

let checks = 0;
let failures = 0;

function fail(message) {
  failures++;
  console.log(`  ✗ ${message}`);
}

function pass(message) {
  checks++;
  console.log(`  ✓ ${message}`);
}

function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** 逐条比对：条数与顺序都算契约（解析器输出顺序是稳定的，乱了本身就说明改了行为） */
function compareItems(expected, actual) {
  const problems = [];
  if (expected.length !== actual.length) {
    problems.push(`条数 ${actual.length} ≠ 期望 ${expected.length}`);
  }
  const max = Math.max(expected.length, actual.length);
  for (let i = 0; i < max; i++) {
    const e = expected[i];
    const a = actual[i];
    if (!e || !a) {
      problems.push(`第 ${i + 1} 条只有一侧存在`);
      continue;
    }
    const keys = new Set([...Object.keys(e), ...Object.keys(a)]);
    for (const key of keys) {
      const ev = JSON.stringify(e[key] === undefined ? null : e[key]);
      const av = JSON.stringify(a[key] === undefined ? null : a[key]);
      if (ev !== av) problems.push(`第 ${i + 1} 条的 ${key}: 实际 ${av} ≠ 期望 ${ev}`);
    }
  }
  return problems;
}

function main() {
  console.log('fixture 回放（解析器行为契约）');

  if (!fs.existsSync(FIXTURES_DIR)) {
    console.log('  没有 fixtures 目录，跳过（不阻断）');
    console.log('\nfixture 0 项 · 失败 0');
    return 0;
  }

  const dirs = fs.readdirSync(FIXTURES_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort();

  if (!dirs.length) {
    console.log('  fixtures 目录为空，跳过（不阻断）');
    console.log('\nfixture 0 项 · 失败 0');
    return 0;
  }

  const collectors = new Map(registry.all().map(entry => [entry.id, entry]));

  for (const name of dirs) {
    const dir = path.join(FIXTURES_DIR, name);
    const expectedFile = path.join(dir, 'expected.json');
    const pageFile = path.join(dir, 'page.min.html');
    const provenanceFile = path.join(dir, 'PROVENANCE.md');

    console.log(`→ ${name}`);

    if (!fs.existsSync(expectedFile) || !fs.existsSync(pageFile)) {
      fail(`${name}: 缺 expected.json 或 page.min.html`);
      continue;
    }
    if (!fs.existsSync(provenanceFile)) {
      fail(`${name}: 缺 PROVENANCE.md（说不出出处的测试数据不该存在）`);
      continue;
    }

    let expected;
    try {
      expected = loadJson(expectedFile);
    } catch (error) {
      fail(`${name}: expected.json 解析失败：${error.message}`);
      continue;
    }

    const bytes = fs.statSync(pageFile).size;
    if (bytes > MAX_FIXTURE_BYTES) {
      fail(`${name}: 片段 ${bytes} 字节 > 上限 ${MAX_FIXTURE_BYTES}`);
      continue;
    }

    const entry = collectors.get(expected.source);
    if (!entry) {
      fail(`${name}: 找不到采集器 ${expected.source}（fixture 与注册表对不上）`);
      continue;
    }
    if (typeof entry.parse !== 'function') {
      fail(`${name}: 采集器 ${expected.source} 没有导出纯解析函数 parse()`);
      continue;
    }
    if (entry.fixture && entry.fixture !== name) {
      fail(`${name}: 采集器登记的 fixture 名是 ${entry.fixture}，对不上`);
      continue;
    }

    let actual;
    try {
      actual = entry.parse(fs.readFileSync(pageFile, 'utf8'));
    } catch (error) {
      fail(`${name}: 解析抛异常：${error.message}`);
      continue;
    }

    const problems = compareItems(expected.items || [], actual);
    if (problems.length) {
      fail(`${name}: ${problems.length} 处不一致`);
      problems.slice(0, 8).forEach(problem => console.log(`      · ${problem}`));
      continue;
    }
    pass(`${name}: ${actual.length} 条与期望一致（片段 ${bytes} 字节）`);
  }

  console.log(`\nfixture ${checks} 项 · 失败 ${failures}`);
  return failures ? 1 : 0;
}

process.exit(main());
