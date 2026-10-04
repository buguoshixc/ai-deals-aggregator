#!/usr/bin/env node
/**
 * t35 / M24 扫描器：**在真实数据的 `quote` 字段里找"元自称"**。
 *
 * ## 这条判据在防什么
 *
 * `evidence[].quote` 的语义是**逐字复制**（见 `docs` 的信息来源规则与 `lib/provenance.js`）——
 * 它是"官方页上那一句话"，不是"我概括的官方意思"。所以在 quote **里面**写「逐字」「原文如此」
 * 这类自我介绍，是在**声明引用行为本身**：它一个字节都不增加事实，却正好是 t15-F1/F2 那个
 * 失败形态的措辞（把改写件标成逐字件）。本扫描器就是那条牙的独立实现（第二条路径）：
 * 它不 require `scripts/validate.js`，自己走文件、自己匹配，供对照与留档。
 *
 * ## 它不做什么（边界，必须一起读）
 *
 * 它**只**回答"quote 里有没有元自称"，**不**回答"quote 是不是真的忠于官方页"——
 * 后者没有离线门禁（见 `research/_raw/t35/M24-BOUNDARY.md`）。**0 命中 ≠ 已验真。**
 *
 * 用法：node research/_raw/t35/scan-selfclaim-quotes.cjs [--json]
 *   输出每个候选形态的命中数（0 也打印 —— "0 命中"与"没跑"必须长得不一样）。
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const AS_JSON = process.argv.includes('--json');

/** 被扫的文件（与 validate.js 的 M24 牙同一张清单：发布数据 + 策展来源 + 三份历史 + 身份/关系层） */
const FILES = [
  'deals.json',
  'plans.json',
  'api-plans.json',
  'scripts/data/curated_cn.json',
  'scripts/data/curated_global.json',
  'scripts/data/curated_plans.json',
  'scripts/data/curated_api_plans.json',
  'scripts/data/deal-history.json',
  'scripts/data/plan-history.json',
  'scripts/data/api-plan-history.json',
  'scripts/data/model-registry-links.json',
  'scripts/data/model-registry-gaps.json',
  'scripts/data/models.json'
];

/**
 * 候选元自称形态。
 * `include` = 是否建议纳入门禁（本轮结论；见 M24-BOUNDARY.md）：
 *   · 全部是"对引用行为本身的声称"，落在 quote 里就是那个失败形态；
 *   · 「官方原文」「官方原话」这类**内容标签**是否纳入要看真实数据里有没有合法用法，
 *     所以扫描器把它单列（decide 列），供人工裁决。
 */
const PATTERNS = [
  { id: 'verbatim', label: '逐字', re: /逐字/, include: true },
  { id: 'verbatim-sentence', label: '逐字逐句', re: /逐字逐句/, include: true },
  { id: 'exactly-same', label: '一字不差', re: /一字不差/, include: true },
  { id: 'copy-verbatim', label: '原文照录 / 照抄', re: /原文照录|照抄|原样照录/, include: true },
  { id: 'original-says', label: '原文如此', re: /原文如此/, include: true },
  { id: 'official-original', label: '官方原文 / 官方原话（**不纳入牙**：可能是官方页正文自己的内容）', re: /官方原文|官方原话/, include: false },
  { id: 'verbatim-quote-word', label: '逐字（英文 verbatim）', re: /verbatim|word-for-word/i, include: true }
];

/** 递归收集所有 `quote` 字符串（带路径），只认字符串值 */
function collectQuotes(node, at, out) {
  if (Array.isArray(node)) {
    node.forEach((item, index) => collectQuotes(item, `${at}[${index}]`, out));
    return out;
  }
  if (!node || typeof node !== 'object') return out;
  for (const [key, value] of Object.entries(node)) {
    const next = at ? `${at}.${key}` : key;
    if (key === 'quote' && typeof value === 'string') out.push({ path: next, text: value });
    else collectQuotes(value, next, out);
  }
  return out;
}

const perFile = [];
const quotes = [];
for (const rel of FILES) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) {
    perFile.push({ file: rel, present: false, quotes: 0 });
    continue;
  }
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  const local = collectQuotes(doc, '', []);
  perFile.push({ file: rel, present: true, quotes: local.length });
  local.forEach(item => quotes.push({ file: rel, ...item }));
}

const hits = [];
for (const pattern of PATTERNS) {
  const matched = quotes.filter(item => pattern.re.test(item.text));
  hits.push({ id: pattern.id, label: pattern.label, include: pattern.include, count: matched.length, matches: matched });
}

const totalHits = hits.reduce((sum, row) => sum + row.count, 0);

if (AS_JSON) {
  console.log(JSON.stringify({ files: perFile, quotesScanned: quotes.length, patterns: hits.map(row => ({ ...row, matches: row.matches.slice(0, 20) })), totalHits }, null, 2));
} else {
  console.log('=== t35 / M24 引文元自称扫描（只回答"quote 里有没有元自称"，不回答"引文是不是真的"）===');
  console.log(`扫描文件 ${perFile.filter(row => row.present).length}/${FILES.length} 篇 · quote 字段总数 ${quotes.length}`);
  perFile.forEach(row => console.log(`  ${row.present ? '✓' : '✗'} ${row.file.padEnd(42)} quote ${row.quotes}`));
  console.log('\n各形态命中数（0 也打印）：');
  hits.forEach(row => console.log(`  ${row.count === 0 ? '0' : String(row.count).padStart(3)}  ${row.label}${row.include ? '（建议纳入牙）' : '（内容标签，待裁决）'}  ${row.id}`));
  if (totalHits) {
    console.log('\n命中清单：');
    hits.filter(row => row.count).forEach(row => {
      console.log(`  · [${row.label}]`);
      row.matches.slice(0, 20).forEach(match => console.log(`      ${match.file} ${match.path} → ${JSON.stringify(match.text.slice(0, 120))}`));
    });
  } else {
    console.log('\n命中清单：（空）—— 当前盘面上没有任何 quote 自称，牙今天不会误伤。');
  }
  console.log(`\n=== 合计 ${totalHits} 命中 ===`);
}

process.exit(0);
