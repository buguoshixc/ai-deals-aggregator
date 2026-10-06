#!/usr/bin/env node
/**
 * secondary-page-layout-unification · 违规码「硬编码点」普查（t18 证据）
 *
 * 目的：t14 把窄柱判据改成**并集**（`note-narrow` ∪ `note-ink-narrow`）之后，凡是**按码名硬编码**
 * 的地方都可能需要跟着改。这个脚本只做一件事：把「哪些文件、哪一行、写了哪个码」**原样列出来**
 * —— 判断（要不要改）写在 `geometry/report-consumers.md` 里，由人给出，不由脚本猜。
 *
 * 只扫**代码文件**（.cjs/.js/.mjs/.ps1）：日志（.log）、生成物（.json）、文档（.md）里出现码名
 * 不构成"消费者"。`node_modules` 与 `dist*` 一律跳过。
 *
 * 用法：
 *   node …/geometry/code-census.cjs --out=…/geometry/consumer-selftest/code-census.json
 */

'use strict';

const fs = require('fs');
const path = require('path');

const arg = name => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const ROOT = path.join(__dirname, '..', '..', '..', '..');
const OUT = arg('out') ? path.resolve(arg('out')) : path.join(__dirname, 'consumer-selftest', 'code-census.json');

/** §22c（宽页）与 §22b（叶子页）两套违规码的全集 —— 普查面 */
const CODES = [
  'note-narrow', 'note-ink-narrow', 'note-axis', 'note-clipped', 'note-hidden-text',
  'page-overflow', 'unexpected-detail-main', 'missing-detail-main', 'unclassified-layout', 'data-region-missing',
  'leaf-consistency', 'src-width', 'self-overflow'
];
const ROOTS = [
  { label: 'evidence', dir: path.join(ROOT, 'research', '_raw', 'secondary-page-layout-unification') },
  { label: 'tools', dir: path.join(ROOT, 'scripts', 'tools') },
  { label: 'lib', dir: path.join(ROOT, 'scripts', 'lib') }
];
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'dist.baseline', 'dist.synth-fixed', 'scratch']);

const files = [];
const walk = (dir, rootLabel) => {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(full, rootLabel);
      continue;
    }
    if (!/\.(cjs|js|mjs|ps1)$/.test(entry.name)) continue;
    files.push({ rel: path.relative(ROOT, full).split(path.sep).join('/'), root: rootLabel, full });
  }
};
for (const root of ROOTS) walk(root.dir, root.label);

const hits = [];
for (const file of files) {
  const lines = fs.readFileSync(file.full, 'utf8').split('\n');
  lines.forEach((line, index) => {
    const matched = CODES.filter(code => line.includes(code));
    if (!matched.length) return;
    hits.push({
      file: file.rel, root: file.root, line: index + 1,
      codes: matched,
      text: line.trim().slice(0, 220),
      /** 粗分类：出现 `push({ code:` / `code: '` 的算"产出码"，其余算"读码/引用"；判断仍由人给 */
      looksLikeProducer: /code:\s*[`'"]|push\(\{\s*code|return\s+['"]`/.test(line)
        || /CODES?_?|VOCABULARY|Vocabulary/.test(line)
    });
  });
}

const byFile = {};
for (const hit of hits) {
  byFile[hit.file] = byFile[hit.file] || { file: hit.file, root: hit.root, lines: [], codes: new Set(), producerish: 0 };
  byFile[hit.file].lines.push(`${hit.line}: ${hit.text}`);
  for (const code of hit.codes) byFile[hit.file].codes.add(code);
  if (hit.looksLikeProducer) byFile[hit.file].producerish += 1;
}
const summary = Object.values(byFile)
  .map(entry => ({ file: entry.file, root: entry.root, hits: entry.lines.length, codes: [...entry.codes].sort(), producerishLines: entry.producerish }))
  .sort((a, b) => b.hits - a.hits || a.file.localeCompare(b.file));

const report = {
  what: '违规码硬编码点普查：哪些代码文件里写了码名（原样事实，不含判断）',
  at: new Date().toISOString(),
  codesSearched: CODES,
  rooots: ROOTS.map(root => ({ label: root.label, dir: path.relative(ROOT, root.dir).replace(/\\/g, '/') })),
  filesScanned: files.length,
  filesWithHits: summary.length,
  hits: hits.length,
  summary,
  detail: hits
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log(`扫描 ${files.length} 个代码文件（${ROOTS.map(root => root.label).join(' / ')}），命中 ${summary.length} 个文件 / ${hits.length} 行`);
for (const entry of summary) {
  console.log(`  ${String(entry.hits).padStart(3)} 行  ${entry.file}  [${entry.codes.join(', ')}]${entry.producerishLines ? `  ← 疑似产出侧 ${entry.producerishLines} 行` : ''}`);
}
console.log(`证据：${path.relative(ROOT, OUT).replace(/\\/g, '/')}`);
