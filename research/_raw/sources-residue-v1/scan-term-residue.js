#!/usr/bin/env node
/**
 * 术语残留扫描（t8 / sources-residue-v1 · 复核 NEXT-STEPS §A.3）
 *
 * 作用：把 `原始出处` 在 **源码 + 文档 + 产物** 里的每一次出现落成机器可读清单
 *       （file / line / 该行出现次数 / 该行原文），并按路径粗分三桶：
 *         · source —— 会被构建读进去或直接发布的源码 / 数据（scripts/**、index.html、根级 *.json）
 *         · docs   —— 文档与历史报告（docs/**、research/**、README/NEXT-STEPS/PROJECT_STATUS/SUMMARY、mockups/**）
 *         · product—— 构建产物（dist/**）
 *
 * 用法（不联网、不读墙上时钟；日期由 --date= 传入，缺省为审计日）：
 *   node research/_raw/sources-residue-v1/scan-term-residue.js \
 *        --term=原始出处 --dist=dist --out=research/_raw/sources-residue-v1/term-residue-scan.json
 *
 * 说明：文件清单 = `git ls-files`（已跟踪的源码与文档）+ 递归遍历 dist/。
 *       dist/ 在 .gitignore 里，因此单独遍历；这样「产物」这一桶的口径是
 *       「本机用同一份源码构建出来的站点」，而不是某一轮别人留下的旧产物。
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const args = process.argv.slice(2);
const opt = name => {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

const TERM = opt('term') || '原始出处';
const DIST = opt('dist') || 'dist';
const OUT = opt('out') || 'research/_raw/sources-residue-v1/term-residue-scan.json';
const DATE = opt('date') || '2026-10-08';
const ROOT = path.resolve(__dirname, '..', '..', '..');

/**
 * 本轮**自己**产出的证据与报告必须排除：它们大量引用这个词（这里的每一行注释也算一次），
 * 混进来会让「历史有多少处」这个读数变成自证。排除项由 --exclude= 给出（逗号分隔的前缀）。
 */
const EXCLUDE = (opt('exclude') || 'research/_raw/sources-residue-v1/,research/sources-residue-v1-report.md,research/sources-residue-v1-self-audit.md')
  .split(',').map(s => s.trim()).filter(Boolean);

const excluded = rel => EXCLUDE.some(prefix => rel.startsWith(prefix));

/** 只看文本类文件：二进制/图片/字体/压缩包不进统计（它们不可能渲染出这个词） */
const TEXT_EXT = new Set([
  '.js', '.mjs', '.cjs', '.json', '.md', '.html', '.htm', '.css', '.svg', '.txt',
  '.yml', '.yaml', '.xml', '.ts', '.tsx', '.jsx', '.csv', '.map'
]);

function walk(dir, out) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && TEXT_EXT.has(path.extname(entry.name).toLowerCase())) out.push(full);
  }
  return out;
}

function bucketOf(rel) {
  if (rel.startsWith('dist/') || rel.startsWith('dist\\')) return 'product';
  if (rel.startsWith('docs/') || rel.startsWith('research/') || rel.startsWith('mockups/')) return 'docs';
  if (/^(README|NEXT-STEPS|PROJECT_STATUS|SUMMARY|AI_DEALS_[A-Z_]+)\.md$/.test(rel)) return 'docs';
  return 'source';
}

function scanFile(abs, rel) {
  let text;
  try { text = fs.readFileSync(abs, 'utf8'); } catch { return []; }
  if (!text.includes(TERM)) return [];
  const hits = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const count = lines[i].split(TERM).length - 1;
    if (count === 0) continue;
    hits.push({
      file: rel.replace(/\\/g, '/'),
      line: i + 1,
      countInLine: count,
      bucket: bucketOf(rel.replace(/\\/g, '/')),
      text: lines[i].length > 400 ? lines[i].slice(0, 400) + ' …' : lines[i]
    });
  }
  return hits;
}

const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
  .split(/\r?\n/).filter(Boolean);

const trackedHits = [];
for (const rel of tracked) {
  if (excluded(rel.replace(/\\/g, '/'))) continue;
  trackedHits.push(...scanFile(path.join(ROOT, rel), rel));
}

const distDir = path.isAbsolute(DIST) ? DIST : path.join(ROOT, DIST);
const distFiles = fs.existsSync(distDir) ? walk(distDir, []) : [];
const distHits = [];
for (const abs of distFiles) {
  const rel = path.relative(ROOT, abs).replace(/\\/g, '/');
  if (excluded(rel)) continue;
  distHits.push(...scanFile(abs, path.relative(ROOT, abs)));
}

const all = [...trackedHits, ...distHits];
const byBucket = {};
const byFile = {};
for (const hit of all) {
  byBucket[hit.bucket] = (byBucket[hit.bucket] || 0) + hit.countInLine;
  const key = hit.file;
  byFile[key] = byFile[key] || { file: key, bucket: hit.bucket, occurrences: 0, lines: [] };
  byFile[key].occurrences += hit.countInLine;
  byFile[key].lines.push(`${hit.file}:${hit.line}${hit.countInLine > 1 ? ` (×${hit.countInLine})` : ''}`);
}

const report = {
  task: 'sources-residue-v1',
  measure: 'term-residue',
  term: TERM,
  date: DATE,
  root: ROOT,
  trackedFileCount: tracked.length,
  distFileCount: distFiles.length,
  distDirUsed: path.relative(ROOT, distDir).replace(/\\/g, '/') || '.',
  totalOccurrences: all.reduce((sum, hit) => sum + hit.countInLine, 0),
  totalLines: all.length,
  byBucket,
  files: Object.values(byFile).sort((a, b) => a.file.localeCompare(b.file)),
  hits: all
};

fs.mkdirSync(path.dirname(path.join(ROOT, OUT)), { recursive: true });
fs.writeFileSync(path.join(ROOT, OUT), JSON.stringify(report, null, 2) + '\n', 'utf8');

console.log(`term=${TERM} tracked=${tracked.length} dist=${distFiles.length}`);
console.log(`total=${report.totalOccurrences} occurrences on ${report.totalLines} lines in ${report.files.length} files`);
console.log('byBucket=' + JSON.stringify(byBucket));
for (const file of report.files) console.log(`  ${file.file}  ×${file.occurrences}  [${file.bucket}]  ${file.lines.join(' ')}`);
console.log(`→ ${OUT}`);
