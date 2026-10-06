/**
 * 只读普查（回答 captain 的问题）：**在本仓库的真实构建路径下，有人会真的写出「把页面级说明裁剪/遮罩成窄柱」的改动吗？**
 *
 * 口径：
 *  A. 产物与源里到底有没有这些属性的**词汇量**：clip-path / mask* / mix-blend-mode / filter / opacity / overflow:hidden / position:absolute
 *  B. 有没有**构建路径**会产出它们：模板（scripts/lib/*.js、scripts/tools/build-local.js、index.html 的共享 <style>）里出现过吗？
 *  C. 页面级说明（.snote）当前实际吃到的样式里有没有同类机制（祖先链上的 overflow:hidden/裁剪容器）？
 *
 * 输出：adversary/runs/clip-census.json + 控制台表。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const WT = path.join(HERE, '..', '..', '..', '..');
const DIR = path.join(WT, 'dist');

const PATTERNS = {
  'clip-path': /clip-path\s*:/,
  'mask-image': /mask-image\s*:/,
  'mask(简写)': /[^-]mask\s*:/,
  '-webkit-mask': /-webkit-mask/,
  'mix-blend-mode': /mix-blend-mode\s*:/,
  'filter': /[;{\s]filter\s*:/,
  'opacity': /opacity\s*:/,
  'overflow:hidden': /overflow\s*:\s*hidden/,
  'position:absolute': /position\s*:\s*absolute/,
  'position:sticky': /position\s*:\s*sticky/,
  '-webkit-line-clamp': /-webkit-line-clamp\s*:/,
  'columns/column-count': /(?:^|[;{\s])columns?\s*:|column-count\s*:/,
  'float': /(?:^|[;{\s])float\s*:\s*(left|right)/,
  'transform': /[;{\s]transform\s*:/,
  'writing-mode': /writing-mode\s*:/
};

const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
};

const rel = p => path.relative(WT, p).split(path.sep).join('/');

// ── 源（会被重新构建出来的东西）──────────────────────────────────────────────
const sourceFiles = [];
for (const d of ['scripts', 'assets', 'mockups']) {
  const p = path.join(WT, d);
  if (fs.existsSync(p)) for (const f of walk(p)) if (/\.(js|mjs|cjs|css|html|json|svg)$/i.test(f) && !/[\\/]node_modules[\\/]/.test(f)) sourceFiles.push(f);
}
for (const f of ['index.html', 'robots.txt']) if (fs.existsSync(path.join(WT, f))) sourceFiles.push(path.join(WT, f));

const countIn = files => {
  const rows = {};
  for (const [name, re] of Object.entries(PATTERNS)) {
    const hits = [];
    for (const f of files) {
      let text;
      try { text = fs.readFileSync(f, 'utf8'); } catch { continue; }
      const n = (text.match(new RegExp(re.source, 'g')) || []).length;
      if (n) hits.push({ file: rel(f), n });
    }
    rows[name] = { files: hits.length, occurrences: hits.reduce((a, h) => a + h.n, 0), top: hits.sort((a, b) => b.n - a.n).slice(0, 8) };
  }
  return rows;
};

const distHtml = walk(DIR).filter(f => f.toLowerCase().endsWith('.html'));
const sourceRows = countIn(sourceFiles);
const distRows = countIn(distHtml);

// ── C. .snote 的祖先链上有没有裁剪容器（静态看产物 HTML 结构 + 共享样式）───
const mainHtml = fs.readFileSync(path.join(DIR, 'category', 'agent', 'index.html'), 'utf8');
const sharedStyle = (mainHtml.match(/<style[^>]*>([\s\S]*?)<\/style>/) || [])[1] || '';
const snoteRuleHits = (sharedStyle.match(/\.snote[^{]*\{[^}]*\}/g) || []);
const overflowHiddenRules = (sharedStyle.match(/[^{}]+\{[^}]*overflow\s*:\s*hidden[^}]*\}/g) || []).map(s => s.replace(/\s+/g, ' ').trim().slice(0, 120));

const report = {
  generatedAt: new Date().toISOString(),
  question: '真实构建路径下是否存在「有人会真的写出来」的改动，能让页面级说明被裁剪/遮罩成窄柱？',
  sourceFilesScanned: sourceFiles.length,
  distHtmlScanned: distHtml.length,
  patterns: PATTERNS,
  sourceCensus: sourceRows,
  distCensus: distRows,
  sharedStyleFacts: {
    file: 'dist/category/agent/index.html（共享 <style>；全站同源）',
    snoteRules: snoteRuleHits.map(s => s.replace(/\s+/g, ' ').trim()),
    overflowHiddenRulesSample: overflowHiddenRules.slice(0, 12),
    overflowHiddenRuleCount: overflowHiddenRules.length
  }
};
fs.mkdirSync(path.join(HERE, 'runs'), { recursive: true });
fs.writeFileSync(path.join(HERE, 'runs', 'clip-census.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');

const line = (label, row) => `${label.padEnd(24)} 文件 ${String(row.files).padStart(3)} · 出现 ${String(row.occurrences).padStart(5)} 次  例：${row.top.slice(0, 3).map(h => `${h.file}(${h.n})`).join(' ')}`;
console.log(`扫描：源 ${sourceFiles.length} 个文件 / 产物 ${distHtml.length} 个 HTML`);
console.log('\n=== A/B. 源（构建路径）里这些属性的词汇量 ===');
for (const [k, v] of Object.entries(sourceRows)) console.log('  ' + line(k, v));
console.log('\n=== A. 产物（dist）里这些属性的词汇量 ===');
for (const [k, v] of Object.entries(distRows)) console.log('  ' + line(k, v));
console.log('\n=== C. 共享 <style> 里 .snote 相关规则 ===');
report.sharedStyleFacts.snoteRules.forEach(r => console.log('  ' + r));
console.log(`  含 overflow:hidden 的规则 ${report.sharedStyleFacts.overflowHiddenRuleCount} 条，抽样：`);
report.sharedStyleFacts.overflowHiddenRulesSample.forEach(r => console.log('    - ' + r));
console.log(`\n写出 ${rel(path.join(HERE, 'runs', 'clip-census.json'))}`);
