#!/usr/bin/env node
/**
 * 把 §22c 整块换成修复版（t7）。**只替换 §22c 那一块**：
 *   · §22b 的文本前后 sha256 必须相等（契约：§22b 一行不许动）；
 *   · 旧 §22c 从它自己的头部注释块起、到 §23（厂商资料页）注释块前一行止，整块替换；
 *   · 写回后打印新文件里 §22c 的关键锚点，供语法检查与对抗工具抽取使用。
 *
 * 用法：node splice-22c.cjs [--dry]
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..', '..', '..');
const TARGET = path.join(ROOT, 'scripts', 'tools', 'verify-site.js');
const PART1 = path.join(__dirname, (process.argv.find(a => a.startsWith('--part1=')) || '').slice(8) || 'r3-part1.js');
const PART2 = path.join(__dirname, (process.argv.find(a => a.startsWith('--part2=')) || '').slice(8) || 'r3-part2.js');
const DRY = process.argv.includes('--dry');

const src = fs.readFileSync(TARGET, 'utf8');
const lines = src.split('\n');
const idxOf = needle => lines.findIndex(line => line.includes(needle));
const sha = text => crypto.createHash('sha256').update(text).digest('hex');

// §22b：从它的头部注释块到 §22c 的头部注释块之前 —— 这段必须逐字不变。
const leafStart = idxOf('/* §22b 叶子详情页的**统一内容列**');
const cHeader = idxOf('/* §22c Wide Data Page 的页面级说明同轴门禁');
if (leafStart < 0 || cHeader < 0) { console.error('找不到 §22b / §22c 的头部注释锚点'); process.exit(2); }
let leafBlockStart = leafStart;
while (leafBlockStart > 0 && !lines[leafBlockStart].startsWith('  /* ----')) leafBlockStart -= 1;
let cBlockStart = cHeader;
while (cBlockStart > 0 && !lines[cBlockStart].startsWith('  /* ----')) cBlockStart -= 1;
const leafText = lines.slice(leafBlockStart, cBlockStart).join('\n');

const vendorIdx = idxOf('厂商资料页（v3.0 Stage E）');
if (vendorIdx < 0) { console.error('找不到 §23（厂商资料页）锚点'); process.exit(2); }
const vendorBlockStart = vendorIdx - 1;   // 上一行是它自己的 /* ---- */ 分隔线

const part1 = fs.readFileSync(PART1, 'utf8').replace(/\n+$/, '\n');
const part2 = fs.readFileSync(PART2, 'utf8').replace(/\n+$/, '\n');
const replacement = `${part1}\n${part2}`.split('\n');

const next = [...lines.slice(0, cBlockStart), ...replacement, ...lines.slice(vendorBlockStart)];
const out = next.join('\n');

const nextLines = out.split('\n');
const leafStart2 = nextLines.findIndex(line => line.includes('/* §22b 叶子详情页的**统一内容列**'));
let leafBlockStart2 = leafStart2;
while (leafBlockStart2 > 0 && !nextLines[leafBlockStart2].startsWith('  /* ----')) leafBlockStart2 -= 1;
const cHeader2 = nextLines.findIndex(line => line.includes('/* §22c Wide Data Page 的页面级说明同轴门禁'));
let cBlockStart2 = cHeader2;
while (cBlockStart2 > 0 && !nextLines[cBlockStart2].startsWith('  /* ----')) cBlockStart2 -= 1;
const leafText2 = nextLines.slice(leafBlockStart2, cBlockStart2).join('\n');

console.log(`§22b 块：${leafText.split('\n').length} 行 · sha256 ${sha(leafText).slice(0, 16)}…`);
console.log(`§22b 块（替换后）：${leafText2.split('\n').length} 行 · sha256 ${sha(leafText2).slice(0, 16)}…`);
console.log(`§22b 逐字未动：${sha(leafText) === sha(leafText2) ? '✅' : '❌'}`);
console.log(`旧 §22c 块：第 ${cBlockStart + 1}–${vendorBlockStart} 行（${vendorBlockStart - cBlockStart} 行）`);
console.log(`新 §22c 块：${replacement.length} 行`);
console.log(`文件行数：${lines.length} → ${nextLines.length}`);

// 对抗工具与变异牙依赖的锚点必须仍在，且都在 §22c 块内
const anchors = [
  '  const WIDE_TOL = 1;',
  '  function wideProblems(geometry, meta) {',
  '  async function wideMeasure(target) {',
  '  async function wideMutate(target, anchor, replacement) {',
  '  async function wideInjectToken(target, token) {',
  '  async function wideInjectDetailMain(target) {',
  "console.log('\\n=== 22c)",
  '  function wideRoutesFromDisk() {',
  '  function wideKindByRoute() {',
  '  function wideSampleSet(routes, metaList) {'
];
for (const anchor of anchors) {
  const at = nextLines.findIndex(line => line.includes(anchor));
  const inBlock = at >= cBlockStart2 && at < nextLines.length;
  console.log(`锚点 ${inBlock ? '✅' : '❌'} 第 ${at + 1} 行  ${anchor}`);
  if (!inBlock) process.exit(3);
}
// 判据区（WIDE_TOL → console.log('=== 22c)）自包含：这段会被抽取式对抗工具 evaluate 进本进程
const judgeStart = nextLines.findIndex(line => line.includes('  const WIDE_TOL = 1;'));
const judgeEnd = nextLines.findIndex(line => line.includes("console.log('\\n=== 22c)"));
const judgeText = nextLines.slice(judgeStart, judgeEnd).join('\n');
console.log(`判据抽取区（WIDE_TOL → 22c console.log）：第 ${judgeStart + 1}–${judgeEnd} 行（${judgeEnd - judgeStart} 行）· sha256 ${sha(judgeText).slice(0, 16)}…`);
if (/^(async )?function\s/.test('') ) process.exit(4);

if (DRY) { console.log('\n--dry：未写盘'); process.exit(0); }
fs.writeFileSync(TARGET, out, 'utf8');
console.log(`\n已写回 ${path.relative(ROOT, TARGET)}`);
